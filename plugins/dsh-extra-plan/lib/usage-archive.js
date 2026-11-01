// 插件内置启动归档：DSH 服务进程启动时对默认 H 账本执行一次合并归档；
// 失败一律回滚并留痕，绝不阻断启动；仅覆盖 H 根下 usage-ledger/ledger-v2.jsonl
// （与 usage-ledger.js resolveLedgerPath 空路径默认一致），自定义 usageLedger.path 的账本不在启动归档范围。
//
// 归档语义与既有 --archive 工具一致（同身份 token 四桶累加、seq 取 max、archive 水位覆盖 active 重放、
// 15 键归档行、事务发布与逆序回滚），但本文件不依赖任何测试目录模块，也不 import 主插件模块。
import { mkdirSync, readFileSync, renameSync, statSync, unlinkSync, writeFileSync, appendFileSync } from 'node:fs'
import { join, dirname, basename } from 'node:path'
import { randomUUID } from 'node:crypto'
import { acquireUsageLedgerLock, releaseUsageLedgerLock, WRITER_LOCK_WAIT_MS } from './usage-ledger.js'
import { resolveHostPath, prepareWriteTarget, validateReadTarget } from './path-policy.js'

const STARTUP_ARCHIVE_BUDGET_MS = 3000

const ARCHIVE_FILE_NAME = 'ledger-v2.archive.jsonl'
const LEDGER_FILE_NAME = 'ledger-v2.jsonl'
const LEDGER_DIRECTORY = 'usage-ledger'
const DIAGNOSTIC_FILE_NAME = 'archive-failed.log'
const LEDGER_PURPOSE = 'usage-ledger'

const V2_KEYS = Object.freeze([
  'schemaVersion',
  'ts',
  'sessionId',
  'parentSessionId',
  'rootSessionId',
  'agentPreset',
  'delegationDepth',
  'role',
  'model',
  'provider',
  'inputTokens',
  'cacheReadTokens',
  'cacheWriteTokens',
  'outputTokens',
  'seq',
])

const IDENTITY_KEYS = Object.freeze([
  'schemaVersion',
  'rootSessionId',
  'sessionId',
  'parentSessionId',
  'agentPreset',
  'delegationDepth',
  'role',
  'model',
  'provider',
])

const TOKEN_KEYS = Object.freeze([
  'inputTokens',
  'cacheReadTokens',
  'cacheWriteTokens',
  'outputTokens',
])

const DEFAULT_FS_OPS = Object.freeze({
  mkdirSync,
  readFileSync,
  renameSync,
  statSync,
  unlinkSync,
  writeFileSync,
  appendFileSync,
})

function errorCodeOf(error) {
  return error !== null && typeof error === 'object' && typeof error.code === 'string' ? error.code : ''
}

function errorMessageOf(error) {
  return error instanceof Error ? error.message : String(error)
}

function archiveError(code, message) {
  const error = new Error(message)
  error.code = code
  return error
}

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function bytesOf(value) {
  if (Buffer.isBuffer(value)) return Buffer.from(value)
  if (value instanceof Uint8Array) return Buffer.from(value)
  return Buffer.from(String(value === undefined || value === null ? '' : value), 'utf8')
}

function textOfBytes(value) {
  return bytesOf(value).toString('utf8')
}

function mergedFsOps(fsOps) {
  return { ...DEFAULT_FS_OPS, ...(isPlainObject(fsOps) ? fsOps : {}) }
}

function nowOf(clock) {
  if (typeof clock === 'function') {
    const value = Number(clock())
    return Number.isFinite(value) ? value : Date.now()
  }
  if (clock !== null && typeof clock === 'object' && typeof clock.now === 'function') {
    const value = Number(clock.now())
    return Number.isFinite(value) ? value : Date.now()
  }
  return Date.now()
}

function hostRootOf(pathContext) {
  if (!isPlainObject(pathContext)) return ''
  const root = pathContext.hostDataRoot
  if (typeof root !== 'string' || root.trim() === '') return ''
  if (!isPlainObject(pathContext.hostCapabilities)) return ''
  return root
}

function compareValues(left, right) {
  const a = String(left === undefined || left === null ? '' : left)
  const b = String(right === undefined || right === null ? '' : right)
  return a < b ? -1 : a > b ? 1 : 0
}

function tokenNumber(row, key) {
  return typeof row[key] === 'number' && Number.isFinite(row[key]) ? row[key] : 0
}

function identityValue(row, key) {
  if (key === 'delegationDepth') return Number.isInteger(row[key]) && row[key] >= 0 ? row[key] : ''
  if (key === 'schemaVersion') return row[key]
  return typeof row[key] === 'string' ? row[key] : ''
}

function groupSort(a, b) {
  for (const key of IDENTITY_KEYS) {
    const compared = compareValues(a[key], b[key])
    if (compared !== 0) return compared
  }
  return compareValues(a.maxSeq === null ? '' : a.maxSeq, b.maxSeq === null ? '' : b.maxSeq)
}

function validDedupeKey(row) {
  return isPlainObject(row)
    && typeof row.sessionId === 'string'
    && row.sessionId.trim() !== ''
    && Number.isInteger(row.seq)
    && row.seq >= 0
}

function dedupeKeyOf(row) {
  return row.sessionId + '\u0000' + String(row.seq)
}

function validationIssue(row) {
  if (!isPlainObject(row)) return '根值不是对象'
  const actual = Object.keys(row).sort()
  const expected = [...V2_KEYS].sort()
  if (actual.length !== expected.length || actual.some((key, index) => key !== expected[index])) return '必须严格包含固定' + V2_KEYS.length + '个键'
  if (row.schemaVersion !== 2) return 'schemaVersion必须为2'
  if (typeof row.ts !== 'string' || row.ts.trim() === '' || !Number.isFinite(Date.parse(row.ts))) return 'ts必须是有效时间字符串'
  for (const key of ['sessionId', 'role']) {
    if (typeof row[key] !== 'string' || row[key].trim() === '') return key + '必须是非空字符串'
  }
  for (const key of ['rootSessionId', 'agentPreset', 'parentSessionId', 'model', 'provider']) {
    if (typeof row[key] !== 'string') return key + '必须是字符串'
  }
  if (!Number.isInteger(row.delegationDepth) || row.delegationDepth < 0) return 'delegationDepth必须是非负整数'
  for (const key of TOKEN_KEYS) {
    if (typeof row[key] !== 'number' || !Number.isFinite(row[key]) || row[key] < 0) return key + '必须是非负有限数'
  }
  if (!Number.isInteger(row.seq) || row.seq < 0) return 'seq必须是非负整数'
  return ''
}

// strict 解析：坏行/非 V2/字段非法均视为失败，调用方据此放弃本次归档（账本原样不动）。
function parseStrictLedgerText(text, source, check) {
  const rows = []
  let lineNumber = 0
  for (const line of String(text === undefined || text === null ? '' : text).split(/\r?\n/)) {
    if (line.trim() === '') continue
    if (typeof check === 'function') check()
    lineNumber += 1
    let row
    try {
      row = JSON.parse(line)
    } catch (error) {
      throw archiveError('bad-json', source + ' 第' + lineNumber + '行坏JSON；发布前未改写')
    }
    if (typeof check === 'function') check()
    if (!isPlainObject(row) || row.schemaVersion !== 2) {
      const kind = isPlainObject(row) ? 'V1/非V2对象' : 'V1/非V2值'
      throw archiveError('non-v2', source + ' 第' + lineNumber + '行' + kind + '；发布前未改写')
    }
    const issue = validationIssue(row)
    if (issue !== '') throw archiveError('invalid-v2', source + ' 第' + lineNumber + '行非法V2：' + issue + '；发布前未改写')
    rows.push(row)
    if (typeof check === 'function') check()
  }
  return rows
}

function identityOf(row) {
  const identity = {}
  for (const key of IDENTITY_KEYS) identity[key] = identityValue(row, key)
  return identity
}

function identityKeyOf(row) {
  const identity = identityOf(row)
  return JSON.stringify(IDENTITY_KEYS.map((key) => identity[key]))
}

function emptyGroupOf(row) {
  const identity = identityOf(row)
  return {
    ...identity,
    inputTokens: 0,
    cacheReadTokens: 0,
    cacheWriteTokens: 0,
    outputTokens: 0,
    maxSeq: null,
    latestTs: '',
    _latestSeq: null,
  }
}

function addRowToGroup(groups, row) {
  const groupKey = identityKeyOf(row)
  let group = groups.get(groupKey)
  if (group === undefined) group = emptyGroupOf(row)
  for (const key of TOKEN_KEYS) group[key] += tokenNumber(row, key)
  const seq = validDedupeKey(row) ? row.seq : null
  if (seq !== null && (group._latestSeq === null || seq > group._latestSeq)) {
    group._latestSeq = seq
    group.maxSeq = seq
    group.latestTs = typeof row.ts === 'string' ? row.ts : ''
  }
  groups.set(groupKey, group)
}

function groupFromArchiveRow(row) {
  const group = emptyGroupOf(row)
  for (const key of TOKEN_KEYS) group[key] = tokenNumber(row, key)
  const seq = validDedupeKey(row) ? row.seq : null
  if (seq !== null) {
    group._latestSeq = seq
    group.maxSeq = seq
    group.latestTs = typeof row.ts === 'string' ? row.ts : ''
  }
  return group
}

function finalizedGroups(groups) {
  return [...groups.values()].sort(groupSort).map((group) => {
    const copy = { ...group }
    delete copy._latestSeq
    copy.inputHit = copy.cacheReadTokens
    copy.inputMiss = copy.inputTokens + copy.cacheWriteTokens
    copy.output = copy.outputTokens
    copy.total = copy.inputTokens + copy.cacheReadTokens + copy.cacheWriteTokens + copy.outputTokens
    return copy
  })
}

function shouldReplaceArchiveRow(current, row) {
  if (current === undefined) return true
  const currentHasSeq = validDedupeKey(current)
  const nextHasSeq = validDedupeKey(row)
  if (!currentHasSeq) return nextHasSeq
  if (!nextHasSeq) return false
  return row.seq >= current.seq
}

function summarizeSourceRows(archiveRows, activeRows, options = {}) {
  const archiveInput = Array.isArray(archiveRows) ? archiveRows : []
  const activeInput = Array.isArray(activeRows) ? activeRows : []
  const check = options !== null && typeof options.check === 'function' ? options.check : undefined
  const acceptedArchiveRows = []
  const acceptedActiveRows = []
  for (const row of archiveInput) {
    if (check !== undefined) check()
    if (isPlainObject(row) && row.schemaVersion === 2) acceptedArchiveRows.push(row)
  }
  const activeSeen = new Set()
  for (const row of activeInput) {
    if (check !== undefined) check()
    if (!isPlainObject(row) || row.schemaVersion !== 2) continue
    if (validDedupeKey(row)) {
      const key = dedupeKeyOf(row)
      if (activeSeen.has(key)) continue
      activeSeen.add(key)
    }
    acceptedActiveRows.push(row)
  }
  const archiveEntries = new Map()
  for (const row of acceptedArchiveRows) {
    if (check !== undefined) check()
    const key = identityKeyOf(row)
    const current = archiveEntries.get(key)
    if (shouldReplaceArchiveRow(current, row)) archiveEntries.set(key, row)
  }
  const groups = new Map()
  const archivedMaxSeq = new Map()
  for (const [key, row] of archiveEntries) {
    if (check !== undefined) check()
    groups.set(key, groupFromArchiveRow(row))
    if (validDedupeKey(row)) archivedMaxSeq.set(key, row.seq)
  }
  for (const row of acceptedActiveRows) {
    if (check !== undefined) check()
    const key = identityKeyOf(row)
    const archivedSeq = archivedMaxSeq.get(key)
    if (archivedSeq !== undefined && validDedupeKey(row) && row.seq <= archivedSeq) continue
    addRowToGroup(groups, row)
  }
  return {
    rows: [...acceptedArchiveRows, ...acceptedActiveRows],
    groups: finalizedGroups(groups),
  }
}

function assertUniqueArchiveRows(rows, source, check) {
  const seen = new Set()
  for (const row of Array.isArray(rows) ? rows : []) {
    if (check !== undefined) check()
    const key = identityKeyOf(row)
    if (seen.has(key)) throw archiveError('duplicate-archive', source + ' 同一完整身份出现多个累计行；发布前未改写')
    seen.add(key)
  }
}

function archiveRowOf(group) {
  return {
    schemaVersion: 2,
    ts: group.latestTs,
    sessionId: group.sessionId,
    parentSessionId: group.parentSessionId,
    rootSessionId: group.rootSessionId,
    agentPreset: group.agentPreset,
    delegationDepth: group.delegationDepth,
    role: group.role,
    model: group.model,
    provider: group.provider,
    inputTokens: group.inputTokens,
    cacheReadTokens: group.cacheReadTokens,
    cacheWriteTokens: group.cacheWriteTokens,
    outputTokens: group.outputTokens,
    seq: group.maxSeq,
  }
}

function archiveTextOf(groups, check) {
  if (!Array.isArray(groups) || groups.length === 0) return ''
  const lines = []
  for (const group of groups) {
    if (typeof check === 'function') check()
    lines.push(JSON.stringify(archiveRowOf(group)))
    if (typeof check === 'function') check()
  }
  return lines.join('\n') + '\n'
}

function uniqueTransactionPaths(activePath, archivePath) {
  const id = process.pid + '-' + Date.now() + '-' + randomUUID()
  const dir = dirname(activePath)
  return {
    archiveTemp: join(dir, basename(archivePath) + '.tmp-' + id),
    activeTemp: join(dir, basename(activePath) + '.tmp-' + id),
    archiveBackup: join(dir, basename(archivePath) + '.bak-' + id),
    activeBackup: join(dir, basename(activePath) + '.bak-' + id),
  }
}

function unlinkIfPresent(fsOps, path, problems) {
  try {
    fsOps.unlinkSync(path)
  } catch (error) {
    if (errorCodeOf(error) !== 'ENOENT') problems.push(path + ': ' + errorMessageOf(error))
  }
}

function pathExists(fsOps, path) {
  try {
    fsOps.readFileSync(path)
    return true
  } catch (error) {
    if (errorCodeOf(error) === 'ENOENT') return false
    return true
  }
}

function restoreOriginal(fsOps, target, backup, original, backedUp, changed, problems) {
  if (!changed) return
  let restored = false
  if (backedUp) {
    try {
      fsOps.renameSync(backup, target)
      restored = true
    } catch (error) {
      problems.push(backup + ' -> ' + target + ': ' + errorMessageOf(error))
    }
  }
  if (!restored) {
    try {
      if (original.exists) fsOps.writeFileSync(target, original.bytes, 'utf8')
      else unlinkIfPresent(fsOps, target, problems)
      restored = original.exists ? pathExists(fsOps, target) : !pathExists(fsOps, target)
    } catch (error) {
      problems.push(target + ': ' + errorMessageOf(error))
    }
  }
  if (restored && pathExists(fsOps, backup)) unlinkIfPresent(fsOps, backup, problems)
  if (!restored) problems.push(target)
}

function rollbackTransaction(fsOps, tx, state, originals) {
  const problems = []
  // 逆序：先恢复active，再恢复archive。
  if (state.activePublished) unlinkIfPresent(fsOps, state.activePath, problems)
  restoreOriginal(fsOps, state.activePath, tx.activeBackup, originals.active, state.activeBackedUp, state.activeChanged, problems)
  if (state.archivePublished) unlinkIfPresent(fsOps, state.archivePath, problems)
  restoreOriginal(fsOps, state.archivePath, tx.archiveBackup, originals.archive, state.archiveBackedUp, state.archiveChanged, problems)
  unlinkIfPresent(fsOps, tx.activeTemp, problems)
  unlinkIfPresent(fsOps, tx.archiveTemp, problems)
  if (pathExists(fsOps, tx.activeBackup)) problems.push(tx.activeBackup)
  if (pathExists(fsOps, tx.archiveBackup)) problems.push(tx.archiveBackup)
  if (pathExists(fsOps, tx.activeTemp)) problems.push(tx.activeTemp)
  if (pathExists(fsOps, tx.archiveTemp)) problems.push(tx.archiveTemp)
  if (originals.active.exists && state.activeChanged && !pathExists(fsOps, state.activePath)) problems.push(state.activePath)
  if (originals.archive.exists && state.archiveChanged && !pathExists(fsOps, state.archivePath)) problems.push(state.archivePath)
  if (!originals.active.exists && state.activeChanged && pathExists(fsOps, state.activePath)) problems.push(state.activePath)
  if (!originals.archive.exists && state.archiveChanged && pathExists(fsOps, state.archivePath)) problems.push(state.archivePath)
  return [...new Set(problems)]
}

function publishTransaction({ activePath, archivePath, activeOriginal, archiveOriginal, archiveText, fsOps, checkBudget, pathContext, purpose }) {
  const tx = uniqueTransactionPaths(activePath, archivePath)
  // active、archive、临时、备份及逆序恢复全部在同一 H context 下预授权。
  for (const target of [activePath, archivePath, tx.activeTemp, tx.archiveTemp, tx.activeBackup, tx.archiveBackup]) {
    prepareWriteTarget(pathContext, resolveHostPath(pathContext, target, { purpose }), { expectedType: 'file', purpose })
  }
  const state = {
    activePath,
    archivePath,
    activeBackedUp: false,
    archiveBackedUp: false,
    activePublished: false,
    archivePublished: false,
    activeChanged: false,
    archiveChanged: false,
  }
  try {
    fsOps.writeFileSync(tx.archiveTemp, archiveText, 'utf8')
    fsOps.writeFileSync(tx.activeTemp, '', 'utf8')
    checkBudget()
    if (archiveOriginal.exists) {
      fsOps.renameSync(archivePath, tx.archiveBackup)
      state.archiveBackedUp = true
      state.archiveChanged = true
    }
    checkBudget()
    if (activeOriginal.exists) {
      fsOps.renameSync(activePath, tx.activeBackup)
      state.activeBackedUp = true
      state.activeChanged = true
    }
    checkBudget()
    fsOps.renameSync(tx.archiveTemp, archivePath)
    state.archivePublished = true
    state.archiveChanged = true
    checkBudget()
    fsOps.renameSync(tx.activeTemp, activePath)
    state.activePublished = true
    state.activeChanged = true
    checkBudget()
    const cleanupProblems = []
    if (state.activeBackedUp) {
      unlinkIfPresent(fsOps, tx.activeBackup, cleanupProblems)
      if (pathExists(fsOps, tx.activeBackup)) cleanupProblems.push(tx.activeBackup)
      else state.activeBackedUp = false
    }
    if (state.archiveBackedUp) {
      unlinkIfPresent(fsOps, tx.archiveBackup, cleanupProblems)
      if (pathExists(fsOps, tx.archiveBackup)) cleanupProblems.push(tx.archiveBackup)
      else state.archiveBackedUp = false
    }
    const residual = [...new Set(cleanupProblems)]
    if (residual.length > 0) throw archiveError('residual', '发布后残留不可清理：' + residual.join(', '))
    return { tx, state }
  } catch (error) {
    const residual = rollbackTransaction(fsOps, tx, state, { active: activeOriginal, archive: archiveOriginal })
    const message = residual.length > 0
      ? errorMessageOf(error) + '；不可清理残留：' + residual.join(', ')
      : errorMessageOf(error) + '；已逆序回滚且清理临时残留'
    throw archiveError(errorCodeOf(error) || 'publish-failed', message)
  }
}

function ensureLedgerDirectory(pathContext, purpose) {
  const target = resolveHostPath(pathContext, LEDGER_DIRECTORY, { purpose })
  prepareWriteTarget(pathContext, target, { expectedType: 'any', purpose })
  mkdirSync(target.path, { recursive: true })
  validateReadTarget(pathContext, target, { expectedType: 'directory', purpose })
}

function authorizeWriteTarget(pathContext, target, purpose) {
  return prepareWriteTarget(pathContext, resolveHostPath(pathContext, target, { purpose }), { expectedType: 'file', purpose })
}

function authorizeReadIfPresent(pathContext, target, purpose) {
  try {
    validateReadTarget(pathContext, resolveHostPath(pathContext, target, { purpose }), { expectedType: 'file', purpose })
  } catch (error) {
    if (errorCodeOf(error) !== 'TARGET_MISSING') throw error
  }
}

function optionalRead(fsOps, filePath) {
  try {
    const bytes = bytesOf(fsOps.readFileSync(filePath))
    return { exists: true, bytes }
  } catch (error) {
    if (errorCodeOf(error) === 'ENOENT') return { exists: false, bytes: Buffer.alloc(0) }
    throw archiveError(errorCodeOf(error) || 'read-failed', '读取账本失败 ' + filePath + ': ' + errorMessageOf(error))
  }
}

function recordDiagnostic(pathContext, fsOps, reason, message, purpose) {
  try {
    const directoryTarget = resolveHostPath(pathContext, LEDGER_DIRECTORY, { purpose })
    prepareWriteTarget(pathContext, directoryTarget, { expectedType: 'any', purpose })
    fsOps.mkdirSync(directoryTarget.path, { recursive: true })
    const logTarget = resolveHostPath(pathContext, join(LEDGER_DIRECTORY, DIAGNOSTIC_FILE_NAME), { purpose })
    prepareWriteTarget(pathContext, logTarget, { expectedType: 'file', purpose })
    const line = new Date().toISOString() + ' startup-archive reason=' + reason + ' message=' + String(message).replace(/\r?\n/g, ' ') + '\n'
    fsOps.appendFileSync(logTarget.path, line, 'utf8')
  } catch (error) {
    // 诊断写失败仅忽略：启动归档绝不因留痕失败而阻断启动。
  }
}

function reportFailure(pathContext, fsOps, error, purpose) {
  const reason = errorCodeOf(error) !== '' ? errorCodeOf(error) : 'archive-failed'
  const message = errorMessageOf(error)
  try {
    console.warn('[dsh-extra-plan] startup archive failed: ' + reason + ': ' + message)
  } catch (warnError) {
    // warning 通道不可用时忽略。
  }
  recordDiagnostic(pathContext, fsOps, reason, message, purpose)
  return { status: 'failed', reason, error }
}

function startupArchiveUnsafe(pathContext, options) {
  const fsOps = mergedFsOps(options.fsOps)
  const purpose = LEDGER_PURPOSE
  if (hostRootOf(pathContext) === '') {
    try {
      console.warn('[dsh-extra-plan] startup archive skipped: no-host-root')
    } catch (warnError) {
      // warning 通道不可用时忽略。
    }
    return { status: 'skipped', reason: 'no-host-root' }
  }
  const activePath = resolveHostPath(pathContext, join(LEDGER_DIRECTORY, LEDGER_FILE_NAME), { purpose }).path
  const archivePath = join(dirname(activePath), ARCHIVE_FILE_NAME)
  let activeExists = false
  try {
    fsOps.statSync(activePath)
    activeExists = true
  } catch (error) {
    if (errorCodeOf(error) !== 'ENOENT') {
      return reportFailure(pathContext, fsOps, archiveError(errorCodeOf(error) || 'stat-failed', '检查账本失败 ' + activePath + ': ' + errorMessageOf(error)), purpose)
    }
  }
  if (!activeExists) return { status: 'skipped', reason: 'no-active-ledger' }
  try {
    ensureLedgerDirectory(pathContext, purpose)
    authorizeWriteTarget(pathContext, activePath, purpose)
    authorizeWriteTarget(pathContext, archivePath, purpose)
    authorizeReadIfPresent(pathContext, activePath, purpose)
    authorizeReadIfPresent(pathContext, archivePath, purpose)
  } catch (error) {
    return reportFailure(pathContext, fsOps, archiveError(errorCodeOf(error) || 'path-not-authorized', '启动归档目标未获 H/W 双根授权：' + errorMessageOf(error)), purpose)
  }

  const lock = acquireUsageLedgerLock(activePath, { waitMs: WRITER_LOCK_WAIT_MS, pathContext, purpose })
  if (lock === null || typeof lock !== 'object' || lock.acquired !== true) {
    const reason = lock !== null && typeof lock === 'object' && typeof lock.reason === 'string' ? lock.reason : 'lock-failed'
    if (reason === 'timeout') {
      try {
        console.warn('[dsh-extra-plan] startup archive skipped: lock-busy; 另一实例正在写账本，本次启动归档放弃')
      } catch (warnError) {
        // warning 通道不可用时忽略。
      }
      return { status: 'skipped', reason: 'lock-busy' }
    }
    const code = reason === 'stale-lock' ? 'stale-lock' : reason !== '' ? reason : 'lock-failed'
    return reportFailure(pathContext, fsOps, archiveError(code, reason === 'stale-lock'
      ? '账本锁为僵尸锁且接管失败：' + String(lock !== null && typeof lock === 'object' && lock.takeoverError !== undefined ? lock.takeoverError : reason)
      : '账本锁获取失败：' + reason), purpose)
  }

  const budgetMs = Number.isFinite(options.budgetMs) && options.budgetMs >= 0 ? options.budgetMs : STARTUP_ARCHIVE_BUDGET_MS
  // 预算从取锁成功后起算；锁等待（WRITER_LOCK_WAIT_MS）不计入预算，与 step-99 语义一致。
  const startedAt = nowOf(options.clock)
  const deadline = startedAt + budgetMs
  const checkBudget = () => {
    if (nowOf(options.clock) >= deadline) {
      throw archiveError('budget-timeout', '启动归档预算超时（约' + budgetMs + 'ms），发布前未改写')
    }
  }

  let result
  let failure
  let releaseFailure
  try {
    checkBudget()
    const archiveRead = optionalRead(fsOps, archivePath)
    const activeRead = optionalRead(fsOps, activePath)
    checkBudget()
    const archiveRows = parseStrictLedgerText(textOfBytes(archiveRead.bytes), archivePath, checkBudget)
    const activeRows = parseStrictLedgerText(textOfBytes(activeRead.bytes), activePath, checkBudget)
    checkBudget()
    assertUniqueArchiveRows(archiveRows, archivePath, checkBudget)
    const aggregate = summarizeSourceRows(archiveRows, activeRows, { check: checkBudget })
    checkBudget()
    const archiveText = archiveTextOf(aggregate.groups, checkBudget)
    publishTransaction({
      activePath,
      archivePath,
      activeOriginal: activeRead,
      archiveOriginal: archiveRead,
      archiveText,
      fsOps,
      checkBudget,
      pathContext,
      purpose,
    })
    result = {
      status: 'archived',
      activePath,
      archivePath,
      rows: aggregate.rows.length,
      groups: aggregate.groups.length,
      archiveBytes: Buffer.byteLength(archiveText, 'utf8'),
    }
  } catch (error) {
    failure = error
  } finally {
    try {
      const released = releaseUsageLedgerLock(lock)
      if (released === null || typeof released !== 'object' || released.released !== true) {
        const reason = released !== null && typeof released === 'object' && typeof released.reason === 'string' ? released.reason : 'unknown'
        releaseFailure = archiveError('release-failed', '账本锁释放失败：' + reason)
      }
    } catch (error) {
      releaseFailure = archiveError('release-failed', '账本锁释放失败：' + errorMessageOf(error))
    }
  }
  if (failure !== undefined && releaseFailure !== undefined) {
    return reportFailure(pathContext, fsOps, archiveError(errorCodeOf(failure) || 'archive-failed', errorMessageOf(failure) + '；同时 ' + errorMessageOf(releaseFailure)), purpose)
  }
  if (failure !== undefined) return reportFailure(pathContext, fsOps, failure, purpose)
  if (releaseFailure !== undefined) return reportFailure(pathContext, fsOps, releaseFailure, purpose)
  return result
}

// 启动归档唯一入口：全程同步（宿主启动路径不能等 Promise），返回带 status 的结构化结果供调用方留痕；
// 任何异常都在内部消化，绝不向调用方抛出。
export function startupArchive(pathContext, options = {}) {
  const settings = isPlainObject(options) ? options : {}
  try {
    return startupArchiveUnsafe(pathContext, settings)
  } catch (error) {
    const reason = errorCodeOf(error) || 'archive-failed'
    const message = errorMessageOf(error)
    try {
      console.warn('[dsh-extra-plan] startup archive failed: ' + reason + ': ' + message)
    } catch (warnError) {
      // warning 通道不可用时忽略。
    }
    recordDiagnostic(pathContext, mergedFsOps(settings.fsOps), reason, message, LEDGER_PURPOSE)
    return { status: 'failed', reason, error }
  }
}
