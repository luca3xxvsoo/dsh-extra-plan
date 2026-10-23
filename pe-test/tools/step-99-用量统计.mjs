// step-99-用量统计.mjs — 在线锁保护的 V2 双文件统计与归档。
// 用法：node step-99-用量统计.mjs <ledger-v2.jsonl>
//      node step-99-用量统计.mjs --archive <ledger-v2.jsonl>
// 默认模式只在共享锁内读取 archive/active 字节，释放锁后解析；--archive 全程持锁并有界发布。
import { randomUUID } from 'node:crypto'
import { readFileSync, writeFileSync, renameSync, unlinkSync } from 'node:fs'
import { basename, dirname, join } from 'node:path'
import { pathToFileURL } from 'node:url'
import {
  acquireUsageLedgerLock,
  releaseUsageLedgerLock,
  usageLedgerLockPath,
  WRITER_LOCK_WAIT_MS,
} from '../../plugins/dsh-extra-plan/lib/usage-ledger.js'

export const ARCHIVE_BUDGET_MS = 30_000
export const ARCHIVE_FILE_NAME = 'ledger-v2.archive.jsonl'
export const V2_KEYS = Object.freeze([
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
const DEFAULT_FS_OPS = Object.freeze({ readFileSync, writeFileSync, renameSync, unlinkSync })

export class LedgerError extends Error {
  constructor(message, code = 'ledger-error') {
    super(message)
    this.name = 'LedgerError'
    this.code = code
  }
}

function errorCodeOf(error) {
  return error !== null && typeof error === 'object' && typeof error.code === 'string' ? error.code : ''
}

function errorMessageOf(error) {
  return error instanceof Error ? error.message : String(error)
}

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function bytesOf(value) {
  if (Buffer.isBuffer(value)) return Buffer.from(value)
  if (value instanceof Uint8Array) return Buffer.from(value)
  if (typeof value === 'string') return Buffer.from(value, 'utf8')
  return Buffer.from(String(value === undefined || value === null ? '' : value), 'utf8')
}

function textOfBytes(value) {
  return bytesOf(value).toString('utf8')
}

function optionalRead(fsOps, filePath) {
  try {
    const bytes = bytesOf(fsOps.readFileSync(filePath))
    return { exists: true, bytes }
  } catch (error) {
    if (errorCodeOf(error) === 'ENOENT') return { exists: false, bytes: Buffer.alloc(0) }
    throw new LedgerError('读取账本失败 ' + filePath + ': ' + errorMessageOf(error), 'read-failed')
  }
}

function mergedFsOps(fsOps) {
  return { ...DEFAULT_FS_OPS, ...(fsOps !== null && typeof fsOps === 'object' ? fsOps : {}) }
}

export function archivePathOf(activePath) {
  if (typeof activePath !== 'string' || activePath.trim() === '') throw new LedgerError('active路径不能为空', 'invalid-path')
  if (basename(activePath) === ARCHIVE_FILE_NAME) throw new LedgerError('active路径不能指向归档文件', 'invalid-path')
  return join(dirname(activePath), ARCHIVE_FILE_NAME)
}

function lockApiOf(options) {
  const source = options !== null && typeof options === 'object' ? options : {}
  const injected = source.lockApi !== undefined ? source.lockApi : source.lockOps
  return {
    acquire: injected !== null && typeof injected === 'object' && typeof injected.acquire === 'function'
      ? injected.acquire
      : typeof source.acquireLock === 'function' ? source.acquireLock : acquireUsageLedgerLock,
    release: injected !== null && typeof injected === 'object' && typeof injected.release === 'function'
      ? injected.release
      : typeof source.releaseLock === 'function' ? source.releaseLock : releaseUsageLedgerLock,
  }
}

function lockFailure(lock, activePath) {
  const lockPath = lock !== null && typeof lock === 'object' && typeof lock.lockPath === 'string' && lock.lockPath !== ''
    ? lock.lockPath
    : usageLedgerLockPath(activePath)
  const owner = lock !== null && lock.owner !== undefined
    ? '；owner=' + JSON.stringify(lock.owner)
    : ''
  if (lock !== null && lock.reason === 'stale-lock') {
    return new LedgerError('stale-lock：检测到死PID陈旧锁 ' + lockPath + owner + '；不会自动接管或删除，请显式维护后重试', 'stale-lock')
  }
  if (lock !== null && lock.reason === 'timeout') {
    return new LedgerError('timeout：共享锁等待约1秒超时 ' + lockPath + owner + '；不会删除锁，writer将稍后重试', 'timeout')
  }
  return new LedgerError('共享锁获取失败：' + (lock === null || lock === undefined ? 'unknown' : String(lock.reason || 'unknown')) + ' ' + lockPath + owner, String(lock && lock.reason || 'lock-failed'))
}

function acquireLock(activePath, waitMs, options) {
  const api = lockApiOf(options)
  let lock
  try {
    lock = api.acquire(activePath, waitMs)
  } catch (error) {
    throw new LedgerError('共享锁获取异常 ' + usageLedgerLockPath(activePath) + ': ' + errorMessageOf(error), 'lock-failed')
  }
  if (lock === null || lock.acquired !== true) throw lockFailure(lock, activePath)
  return { lock, release: api.release }
}

function releaseLock(release, lock, activePath) {
  let result
  try {
    result = release(lock)
  } catch (error) {
    throw new LedgerError('共享锁释放异常 ' + usageLedgerLockPath(activePath) + ': ' + errorMessageOf(error), 'release-failed')
  }
  if (result === null || result === undefined || result.released !== true) {
    const reason = result !== null && result !== undefined ? String(result.reason || 'unknown') : 'unknown'
    throw new LedgerError('共享锁释放失败 ' + usageLedgerLockPath(activePath) + ': ' + reason, 'release-failed')
  }
  return result
}

function combineErrors(primary, secondary) {
  if (primary === undefined) return secondary
  if (secondary === undefined) return primary
  return new LedgerError(errorMessageOf(primary) + '；同时 ' + errorMessageOf(secondary), primary.code || 'ledger-error')
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

function validationIssue(row, lineNumber) {
  if (!isPlainObject(row)) return '根值不是对象'
  const actual = Object.keys(row).sort()
  const expected = [...V2_KEYS].sort()
  if (actual.length !== expected.length || actual.some((key, index) => key !== expected[index])) return '必须严格包含固定15个键'
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

export function parseLedgerText(text, options = {}) {
  const strict = options !== null && options.strict === true
  const source = options !== null && typeof options.source === 'string' ? options.source : 'ledger'
  const check = options !== null && typeof options.check === 'function' ? options.check : undefined
  const rows = []
  let skippedNonV2Objects = 0
  let badJsonLines = 0
  let lineNumber = 0
  for (const line of String(text === undefined || text === null ? '' : text).split(/\r?\n/)) {
    if (line.trim() === '') continue
    if (check !== undefined) check()
    lineNumber += 1
    let row
    try {
      row = JSON.parse(line)
    } catch (error) {
      if (strict) throw new LedgerError(source + ' 第' + lineNumber + '行坏JSON；发布前未改写', 'bad-json')
      badJsonLines += 1
      if (check !== undefined) check()
      continue
    }
    if (check !== undefined) check()
    if (!isPlainObject(row) || row.schemaVersion !== 2) {
      if (strict) {
        const kind = isPlainObject(row) ? 'V1/非V2对象' : 'V1/非V2值'
        throw new LedgerError(source + ' 第' + lineNumber + '行' + kind + '；发布前未改写', 'non-v2')
      }
      skippedNonV2Objects += 1
      if (check !== undefined) check()
      continue
    }
    if (strict) {
      const issue = validationIssue(row, lineNumber)
      if (issue !== '') throw new LedgerError(source + ' 第' + lineNumber + '行非法V2：' + issue + '；发布前未改写', 'invalid-v2')
    }
    rows.push(row)
    if (check !== undefined) check()
  }
  return { rows, skippedNonV2Objects, badJsonLines, lineCount: lineNumber }
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

export function summarizeRows(rows, options = {}) {
  const seen = new Set()
  const acceptedRows = []
  let duplicateV2Rows = 0
  const sourceRows = Array.isArray(rows) ? rows : []
  const check = options !== null && typeof options.check === 'function' ? options.check : undefined
  for (const row of sourceRows) {
    if (check !== undefined) check()
    if (!isPlainObject(row) || row.schemaVersion !== 2) continue
    if (validDedupeKey(row)) {
      const key = dedupeKeyOf(row)
      if (seen.has(key)) {
        duplicateV2Rows += 1
        continue
      }
      seen.add(key)
    }
    acceptedRows.push(row)
  }
  const groups = new Map()
  for (const row of acceptedRows) {
    if (check !== undefined) check()
    addRowToGroup(groups, row)
  }
  return {
    rows: acceptedRows,
    groups: finalizedGroups(groups),
    duplicateV2Rows,
    coveredByArchiveRows: 0,
    covered: 0,
  }
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
  let duplicateV2Rows = 0
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
      if (activeSeen.has(key)) {
        duplicateV2Rows += 1
        continue
      }
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
  let coveredByArchiveRows = 0
  for (const row of acceptedActiveRows) {
    if (check !== undefined) check()
    const key = identityKeyOf(row)
    const archivedSeq = archivedMaxSeq.get(key)
    if (archivedSeq !== undefined && validDedupeKey(row) && row.seq <= archivedSeq) {
      coveredByArchiveRows += 1
      continue
    }
    addRowToGroup(groups, row)
  }
  return {
    rows: [...acceptedArchiveRows, ...acceptedActiveRows],
    groups: finalizedGroups(groups),
    duplicateV2Rows,
    coveredByArchiveRows,
    covered: coveredByArchiveRows,
  }
}

function assertUniqueArchiveRows(rows, source, check) {
  const seen = new Set()
  for (const row of Array.isArray(rows) ? rows : []) {
    if (check !== undefined) check()
    const key = identityKeyOf(row)
    if (seen.has(key)) throw new LedgerError(source + ' 同一完整身份出现多个累计行；发布前未改写', 'duplicate-archive')
    seen.add(key)
  }
}

export function summarizeSnapshotTexts(sources, options = {}) {
  let skippedNonV2Objects = 0
  let badJsonLines = 0
  const input = Array.isArray(sources) ? sources : []
  const archiveSource = input[0]
  const activeSources = input.slice(1)
  const parseSource = (source) => parseLedgerText(source && source.text !== undefined ? source.text : source, { strict: false, source: source && source.path ? source.path : 'ledger' })
  const archiveParsed = archiveSource === undefined ? { rows: [], skippedNonV2Objects: 0, badJsonLines: 0 } : parseSource(archiveSource)
  const activeRows = []
  skippedNonV2Objects += archiveParsed.skippedNonV2Objects
  badJsonLines += archiveParsed.badJsonLines
  for (const source of activeSources) {
    const parsed = parseSource(source)
    activeRows.push(...parsed.rows)
    skippedNonV2Objects += parsed.skippedNonV2Objects
    badJsonLines += parsed.badJsonLines
  }
  const summary = summarizeSourceRows(archiveParsed.rows, activeRows, options)
  return { ...summary, skippedNonV2Objects, badJsonLines }
}

function shown(value) {
  return value === '' || value === undefined || value === null ? '-' : String(value)
}

export function renderStats(summary, paths = {}) {
  const lines = []
  lines.push('=== V2 分组明细（schemaVersion | rootSessionId | sessionId | parentSessionId | agentPreset | delegationDepth | role | model | provider | maxSeq | ts | inputTokens | cacheReadTokens | cacheWriteTokens | outputTokens | inputHit | inputMiss | output | total） ===')
  lines.push('公式：inputHit=cacheReadTokens；inputMiss=inputTokens+cacheWriteTokens；output=outputTokens；total=inputTokens+cacheReadTokens+cacheWriteTokens+outputTokens')
  for (const group of summary.groups) {
    lines.push([
      shown(group.schemaVersion), shown(group.rootSessionId), shown(group.sessionId), shown(group.parentSessionId),
      shown(group.agentPreset), shown(group.delegationDepth), shown(group.role), shown(group.model), shown(group.provider),
      shown(group.maxSeq), shown(group.latestTs), group.inputTokens, group.cacheReadTokens, group.cacheWriteTokens,
      group.outputTokens, group.inputHit, group.inputMiss, group.output, group.total,
    ].join(' | '))
  }
  lines.push('V2 记录（去重后）: ' + summary.rows.length)
  lines.push('V1/非V2对象（已跳过，输入未改写）: ' + summary.skippedNonV2Objects)
  lines.push('坏JSON行（已跳过，未计入V1/非V2）: ' + summary.badJsonLines)
  if (summary.duplicateV2Rows > 0) lines.push('重复V2记录（按非空sessionId+非负整数seq去重）: ' + summary.duplicateV2Rows + '（已跳过）')
  lines.push('coveredByArchiveRows（archive水位覆盖的active重放）: ' + (summary.coveredByArchiveRows || 0))
  if (paths.archivePath !== undefined) lines.push('统计来源：' + paths.archivePath + ' + ' + paths.activePath)
  return lines.join('\n')
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

function readSnapshots(activePath, options) {
  const fsOps = mergedFsOps(options && options.fsOps)
  const archivePath = archivePathOf(activePath)
  const archive = optionalRead(fsOps, archivePath)
  const active = optionalRead(fsOps, activePath)
  return { fsOps, archivePath, archive, active }
}

export function statLedger(activePath, options = {}) {
  const waitMs = options !== null && Number.isFinite(options.lockWaitMs) ? options.lockWaitMs : WRITER_LOCK_WAIT_MS
  const acquired = acquireLock(activePath, waitMs, options)
  let snapshots
  let operationError
  let releaseError
  try {
    snapshots = readSnapshots(activePath, options)
  } catch (error) {
    operationError = error
  } finally {
    try { releaseLock(acquired.release, acquired.lock, activePath) } catch (error) { releaseError = error }
  }
  const failure = combineErrors(operationError, releaseError)
  if (failure !== undefined) throw failure
  const summary = summarizeSnapshotTexts([
    { path: snapshots.archivePath, text: textOfBytes(snapshots.archive.bytes) },
    { path: activePath, text: textOfBytes(snapshots.active.bytes) },
  ])
  return { ...summary, activePath, archivePath: snapshots.archivePath }
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

function renameChecked(fsOps, from, to) {
  fsOps.renameSync(from, to)
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
      renameChecked(fsOps, backup, target)
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

function publishTransaction({ activePath, archivePath, activeOriginal, archiveOriginal, archiveText, fsOps, checkBudget }) {
  const tx = uniqueTransactionPaths(activePath, archivePath)
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
      renameChecked(fsOps, archivePath, tx.archiveBackup)
      state.archiveBackedUp = true
      state.archiveChanged = true
    }
    checkBudget()
    if (activeOriginal.exists) {
      renameChecked(fsOps, activePath, tx.activeBackup)
      state.activeBackedUp = true
      state.activeChanged = true
    }
    checkBudget()
    renameChecked(fsOps, tx.archiveTemp, archivePath)
    state.archivePublished = true
    state.archiveChanged = true
    checkBudget()
    renameChecked(fsOps, tx.activeTemp, activePath)
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
    if (residual.length > 0) throw new LedgerError('发布后残留不可清理：' + residual.join(', '), 'residual')
    return { tx, state }
  } catch (error) {
    const residual = rollbackTransaction(fsOps, tx, state, { active: activeOriginal, archive: archiveOriginal })
    const message = residual.length > 0
      ? errorMessageOf(error) + '；不可清理残留：' + residual.join(', ')
      : errorMessageOf(error) + '；已逆序回滚且清理临时残留'
    throw new LedgerError(message, error.code || 'publish-failed')
  }
}

export function archiveLedger(activePath, options = {}) {
  const waitMs = options !== null && Number.isFinite(options.lockWaitMs) ? options.lockWaitMs : WRITER_LOCK_WAIT_MS
  const budgetMs = options !== null && Number.isFinite(options.budgetMs) ? Math.max(0, options.budgetMs) : ARCHIVE_BUDGET_MS
  const acquired = acquireLock(activePath, waitMs, options)
  const startedAt = nowOf(options && options.clock)
  const deadline = startedAt + budgetMs
  const checkBudget = () => {
    if (nowOf(options && options.clock) >= deadline) throw new LedgerError('archive预算超时（约' + budgetMs + 'ms），发布前未改写', 'budget-timeout')
  }
  let result
  let operationError
  let releaseError
  try {
    checkBudget()
    const snapshots = readSnapshots(activePath, options)
    checkBudget()
    const archiveParsed = parseLedgerText(textOfBytes(snapshots.archive.bytes), { strict: true, source: snapshots.archivePath, check: checkBudget })
    checkBudget()
    const activeParsed = parseLedgerText(textOfBytes(snapshots.active.bytes), { strict: true, source: activePath, check: checkBudget })
    checkBudget()
    assertUniqueArchiveRows(archiveParsed.rows, snapshots.archivePath, checkBudget)
    const aggregate = summarizeSourceRows(archiveParsed.rows, activeParsed.rows, { check: checkBudget })
    checkBudget()
    const archiveText = archiveTextOf(aggregate.groups, checkBudget)
    publishTransaction({
      activePath,
      archivePath: snapshots.archivePath,
      activeOriginal: snapshots.active,
      archiveOriginal: snapshots.archive,
      archiveText,
      fsOps: snapshots.fsOps,
      checkBudget,
    })
    result = {
      activePath,
      archivePath: snapshots.archivePath,
      rows: aggregate.rows.length,
      groups: aggregate.groups.length,
      coveredByArchiveRows: aggregate.coveredByArchiveRows,
      covered: aggregate.coveredByArchiveRows,
      archiveBytes: Buffer.byteLength(archiveText, 'utf8'),
    }
  } catch (error) {
    operationError = error
  } finally {
    try { releaseLock(acquired.release, acquired.lock, activePath) } catch (error) { releaseError = error }
  }
  const failure = combineErrors(operationError, releaseError)
  if (failure !== undefined) throw failure
  return result
}

export function parseCliArgs(argv = []) {
  const args = Array.isArray(argv) ? argv : []
  if (args.length === 1 && args[0] !== '--archive') return { mode: 'stats', activePath: String(args[0]) }
  if (args.length === 2 && args[0] === '--archive' && String(args[1]).trim() !== '') return { mode: 'archive', activePath: String(args[1]) }
  throw new LedgerError('用法：node step-99-用量统计.mjs <ledger-v2.jsonl>；或 node step-99-用量统计.mjs --archive <ledger-v2.jsonl>', 'usage')
}

export function main(argv = process.argv.slice(2), options = {}) {
  try {
    const parsed = parseCliArgs(argv)
    if (parsed.mode === 'archive') {
      const result = archiveLedger(parsed.activePath, options)
      console.log('归档成功：' + result.archivePath + '；聚合组=' + result.groups + '；covered=' + result.coveredByArchiveRows + '；active已清空；cursor未读取/未改写')
    } else {
      const result = statLedger(parsed.activePath, options)
      console.log(renderStats(result, result))
    }
    return 0
  } catch (error) {
    console.error('失败：' + errorMessageOf(error))
    return 1
  }
}

if (process.argv[1] !== undefined && pathToFileURL(process.argv[1]).href === import.meta.url) {
  process.exitCode = main()
}
