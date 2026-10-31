// step-99-用量统计.mjs — 在线锁保护的 V2 双文件统计与归档。
// 用法：node step-99-用量统计.mjs <ledger-v2.jsonl>（普通相对路径按当前 W）
//      node step-99-用量统计.mjs --archive <ledger-v2.jsonl>
// 运行时账本仍由业务以 H pathContext 传入；本 CLI 不按普通文件 dirname 自授 H。
// 观察分两类：W 目标在共享锁内统计/归档；显式 Host 只读目标不取锁，只做最多两次
// 稳定观察，不写所选 Host 资源/锁/备份/temp，必要 W 结构暂存允许且用后清理。
// 默认模式只在共享锁内读取 archive/active 字节，释放锁后解析；--archive 全程持锁并有界发布。
import { createHash, randomUUID } from 'node:crypto'
import { mkdirSync, readFileSync, renameSync, rmSync, statSync, unlinkSync, writeFileSync } from 'node:fs'
import { basename, dirname, isAbsolute, join } from 'node:path'
import { pathToFileURL } from 'node:url'
import {
  acquireUsageLedgerLock,
  releaseUsageLedgerLock,
  usageLedgerLockPath,
  WRITER_LOCK_WAIT_MS,
} from '../../plugins/dsh-extra-plan/lib/usage-ledger.js'
import { prepareWriteTarget, resolveHostPath, resolveWorkspacePath, validateReadTarget } from '../../plugins/dsh-extra-plan/lib/path-policy.js'
import { createMaintenanceContext, parseMaintenanceArgs } from '../_shared/workspace-paths.mjs'

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
const DEFAULT_FS_OPS = Object.freeze({ mkdirSync, readFileSync, renameSync, rmSync, statSync, unlinkSync, writeFileSync })
const CLI_PURPOSE = 'usage-ledger-cli'
const LEDGER_READ_PURPOSE = 'ledger-read'
const LEDGER_ARCHIVE_PURPOSE = 'ledger-archive'
const LEDGER_SNAPSHOT_PURPOSE = 'ledger-snapshot'

function objectOf(options) {
  return options !== null && typeof options === 'object' ? options : {}
}

function maintenanceContextOf(options) {
  const source = objectOf(options)
  if (source.maintenanceContext !== null && typeof source.maintenanceContext === 'object') return source.maintenanceContext
  if (source.context !== null && typeof source.context === 'object' && source.context.pathContext !== undefined) return source.context
  if (source.pathContext !== undefined && source.workspaceRoot !== undefined) return source
  return undefined
}

function pathContextOf(options) {
  const source = objectOf(options)
  const maintenance = maintenanceContextOf(source)
  const context = maintenance !== undefined ? maintenance.pathContext : source.pathContext
  if (context === null || context === undefined) throw new LedgerError('账本操作缺少明确 pathContext；不按普通文件父目录授予 H', 'path-context-required')
  return context
}

function purposeOf(options) {
  const source = objectOf(options)
  const value = typeof source.purpose === 'string' && source.purpose.trim() !== '' ? source.purpose : CLI_PURPOSE
  return value
}

function targetPathOf(target) {
  const value = target !== null && typeof target === 'object' && target.policyTarget !== undefined ? target.policyTarget : target
  return value !== null && typeof value === 'object' && typeof value.path === 'string' ? value.path : undefined
}

function policyTargetOf(target) {
  return target !== null && typeof target === 'object' && target.policyTarget !== undefined ? target.policyTarget : target
}

function isHostTarget(target) {
  const value = target !== null && typeof target === 'object' ? target : {}
  return value.kind === 'host' || value.scope === 'host' || (value.readOnly === true && value.canWrite === false && value.access === 'read')
}

function isWorkspaceTarget(target) {
  const value = target !== null && typeof target === 'object' ? target : {}
  return value.kind === 'workspace' || value.scope === 'workspace'
}

function isWritableWorkspaceTarget(target) {
  const value = target !== null && typeof target === 'object' ? target : {}
  return isWorkspaceTarget(value) && value.readOnly !== true && (value.canWrite === true || value.access === 'write')
}

function contextTargetOf(options, filePath) {
  const source = objectOf(options)
  const maintenance = maintenanceContextOf(source)
  const candidates = [
    source.target,
    source.ledgerTarget,
    maintenance !== undefined && maintenance.ledger !== null && typeof maintenance.ledger === 'object' ? maintenance.ledger.target : undefined,
    maintenance !== undefined && maintenance.ledger !== null && typeof maintenance.ledger === 'object' ? maintenance.ledger.activeTarget : undefined,
  ]
  return candidates.find((candidate) => candidate !== null && candidate !== undefined && targetPathOf(candidate) === filePath)
}

function targetForPath(context, filePath, purpose, options = {}) {
  const source = objectOf(options)
  const explicit = contextTargetOf(source, filePath)
  if (explicit !== undefined) return explicit
  if (source.workspaceOnly === true || purpose === LEDGER_ARCHIVE_PURPOSE || purpose === LEDGER_SNAPSHOT_PURPOSE) {
    return resolveWorkspacePath(context, filePath, { purpose })
  }
  const maintenance = maintenanceContextOf(source)
  const explicitHostRead = source.hostReadOnly === true
    || (maintenance !== undefined && maintenance.hostAccess === 'read-only' && purpose === LEDGER_READ_PURPOSE)
  if (typeof filePath === 'string' && isAbsolute(filePath) && !explicitHostRead) {
    // 仅 W 内绝对路径归 W；仅 H 绝对必须有明确 Host 只读选择，否则不改贴 H，
    // 交由 W resolver 词法先拒（ROOT_ESCAPE）；不用 exists/stat/read 在两根选根。
    return resolveWorkspacePath(context, filePath, { purpose })
  }
  // 普通相对输入固定 W，双根重叠（H=W/相互包含）时仍按词法 W；
  // 明确 Host 只读选择（ledger-read/Host 配套读取）才允许相对形态归 H。
  return explicitHostRead
    ? resolveHostPath(context, filePath, { purpose })
    : resolveWorkspacePath(context, filePath, { purpose })
}

function authorizeWritePath(filePath, options) {
  const context = pathContextOf(options)
  const purpose = purposeOf(options)
  const target = targetForPath(context, filePath, purpose, options)
  if (isHostTarget(target) || target !== null && typeof target === 'object' && target.canWrite === false) {
    throw new LedgerError('账本写入路径不是可写 W 目标：' + filePath, 'path-not-authorized')
  }
  try { return prepareWriteTarget(context, policyTargetOf(target), { expectedType: 'file', purpose }) }
  catch (error) { throw new LedgerError('账本写入路径未获授权：' + errorMessageOf(error), errorCodeOf(error) || 'path-not-authorized') }
}

function authorizeOptionalReadPath(filePath, options) {
  const context = pathContextOf(options)
  const purpose = purposeOf(options)
  const target = targetForPath(context, filePath, purpose, options)
  const policyTarget = policyTargetOf(target)
  try { return validateReadTarget(context, policyTarget, { expectedType: 'file', purpose }) }
  catch (error) {
    if (errorCodeOf(error) === 'TARGET_MISSING') {
      if (isHostTarget(target) || target !== null && typeof target === 'object' && target.canWrite === false) {
        throw new LedgerError('账本只读目标不存在：' + filePath, 'target-missing')
      }
      try { return prepareWriteTarget(context, policyTarget, { expectedType: 'file', purpose }) }
      catch (writeError) { throw new LedgerError('账本可选读取路径未获授权：' + errorMessageOf(writeError), errorCodeOf(writeError) || 'path-not-authorized') }
    }
    throw new LedgerError('账本读取路径未获授权：' + errorMessageOf(error), errorCodeOf(error) || 'path-not-authorized')
  }
}

function validateHostReadPath(filePath, options, purpose = LEDGER_READ_PURPOSE) {
  const context = pathContextOf(options)
  const target = targetForPath(context, filePath, purpose, { ...objectOf(options), hostReadOnly: true })
  if (!isHostTarget(target) || target.canWrite === true) throw new LedgerError('账本 Host 读取目标未获只读分类：' + filePath, 'path-not-authorized')
  try {
    return { target, policyTarget: validateReadTarget(context, policyTargetOf(target), { expectedType: 'file', purpose }) }
  } catch (error) {
    if (errorCodeOf(error) === 'TARGET_MISSING') return { target, policyTarget: policyTargetOf(target), missing: true }
    throw new LedgerError('账本 Host 读取路径未获授权：' + errorMessageOf(error), errorCodeOf(error) || 'path-not-authorized')
  }
}

function lockOptionsOf(options, waitMs) {
  return { pathContext: pathContextOf(options), purpose: purposeOf(options), waitMs }
}


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
    lock = api.acquire(activePath, lockOptionsOf(options, waitMs))
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
  authorizeOptionalReadPath(archivePath, options)
  authorizeOptionalReadPath(activePath, options)
  const archive = optionalRead(fsOps, archivePath)
  const active = optionalRead(fsOps, activePath)
  return { fsOps, archivePath, archive, active }
}

function metadataValueOf(stat, primary, fallback) {
  if (stat !== null && stat !== undefined && stat[primary] !== undefined && stat[primary] !== null) return String(stat[primary])
  const value = stat !== null && stat !== undefined ? stat[fallback] : undefined
  return value instanceof Date ? String(value.getTime()) : String(value === undefined || value === null ? '' : value)
}

function fileMetadata(fsOps, filePath) {
  if (typeof fsOps.statSync !== 'function') throw new LedgerError('Host账本无法取得稳定stat元数据：' + filePath, 'incomplete')
  try {
    const stat = fsOps.statSync(filePath)
    return {
      exists: true,
      dev: metadataValueOf(stat, 'dev', 'dev'),
      ino: metadataValueOf(stat, 'ino', 'ino'),
      size: metadataValueOf(stat, 'size', 'size'),
      mtime: metadataValueOf(stat, 'mtimeMs', 'mtime'),
      ctime: metadataValueOf(stat, 'ctimeMs', 'ctime'),
    }
  } catch (error) {
    if (errorCodeOf(error) === 'ENOENT') return { exists: false, dev: '', ino: '', size: '', mtime: '', ctime: '' }
    throw new LedgerError('Host账本stat失败 ' + filePath + ': ' + errorMessageOf(error), 'incomplete')
  }
}

function sameMetadata(left, right) {
  return left.exists === right.exists
    && left.dev === right.dev
    && left.ino === right.ino
    && left.size === right.size
    && left.mtime === right.mtime
    && left.ctime === right.ctime
}

function sameBytes(left, right) {
  return bytesOf(left).equals(bytesOf(right))
}

function hostObservationAttempt(fsOps, activePath, archivePath, lockPath) {
  const before = {
    active: fileMetadata(fsOps, activePath),
    archive: fileMetadata(fsOps, archivePath),
    lock: fileMetadata(fsOps, lockPath),
  }
  if (before.lock.exists) return { busy: true, before }
  const archive = optionalRead(fsOps, archivePath)
  const active = optionalRead(fsOps, activePath)
  const after = {
    active: fileMetadata(fsOps, activePath),
    archive: fileMetadata(fsOps, archivePath),
    lock: fileMetadata(fsOps, lockPath),
  }
  if (after.lock.exists) return { busy: true, before, after }
  return {
    busy: false,
    before,
    after,
    archive,
    active,
    stable: sameMetadata(before.active, after.active) && sameMetadata(before.archive, after.archive),
  }
}

function sha256Of(value) {
  return createHash('sha256').update(bytesOf(value)).digest('hex')
}

function writeHostSnapshot(activePath, archivePath, observed, attempts, options) {
  const context = pathContextOf(options)
  const fsOps = mergedFsOps(options && options.fsOps)
  const rawDir = '.usage-ledger-snapshot-' + randomUUID()
  const dirTarget = targetForPath(context, rawDir, LEDGER_SNAPSHOT_PURPOSE, { ...objectOf(options), workspaceOnly: true })
  if (!isWritableWorkspaceTarget(dirTarget)) throw new LedgerError('Host快照目录不是可写 W 目标', 'path-not-authorized')
  const dirPath = targetPathOf(dirTarget)
  if (dirPath === undefined) throw new LedgerError('Host快照目录缺少物理路径', 'path-not-authorized')
  const maintenance = maintenanceContextOf(options)
  // W 根优先取 maintenance 结构锚定值；无 maintenance 时回退 pathContext 的 workspaceRoot（同为结构锚定，仅字符串可用）。
  const workspaceRoot = maintenance !== undefined && typeof maintenance.workspaceRoot === 'string'
    ? maintenance.workspaceRoot
    : (context !== null && typeof context === 'object' && typeof context.workspaceRoot === 'string' ? context.workspaceRoot : undefined)
  if (workspaceRoot === undefined) throw new LedgerError('Host快照缺少结构锚定 W 根', 'path-context-required')
  const parentTarget = targetForPath(context, workspaceRoot, LEDGER_SNAPSHOT_PURPOSE, { ...objectOf(options), workspaceOnly: true })
  if (!isWritableWorkspaceTarget(parentTarget)) throw new LedgerError('Host快照父目录不是可写 W 目标', 'path-not-authorized')
  try {
    prepareWriteTarget(context, policyTargetOf(parentTarget), { expectedType: 'directory', purpose: LEDGER_SNAPSHOT_PURPOSE })
    fsOps.mkdirSync(dirPath)
    const archiveSnapshotPath = join(dirPath, 'archive.jsonl')
    const activeSnapshotPath = join(dirPath, 'active.jsonl')
    const archiveTarget = targetForPath(context, archiveSnapshotPath, LEDGER_SNAPSHOT_PURPOSE, { ...objectOf(options), workspaceOnly: true })
    const activeTarget = targetForPath(context, activeSnapshotPath, LEDGER_SNAPSHOT_PURPOSE, { ...objectOf(options), workspaceOnly: true })
    if (!isWritableWorkspaceTarget(archiveTarget) || !isWritableWorkspaceTarget(activeTarget)) {
      throw new LedgerError('Host快照文件不是可写 W 目标', 'path-not-authorized')
    }
    prepareWriteTarget(context, policyTargetOf(archiveTarget), { expectedType: 'file', purpose: LEDGER_SNAPSHOT_PURPOSE })
    prepareWriteTarget(context, policyTargetOf(activeTarget), { expectedType: 'file', purpose: LEDGER_SNAPSHOT_PURPOSE })
    fsOps.writeFileSync(archiveSnapshotPath, observed.archive.bytes)
    fsOps.writeFileSync(activeSnapshotPath, observed.active.bytes)
    const archiveSnapshot = optionalRead(fsOps, archiveSnapshotPath)
    const activeSnapshot = optionalRead(fsOps, activeSnapshotPath)
    const summary = summarizeSnapshotTexts([
      { path: archiveSnapshotPath, text: textOfBytes(archiveSnapshot.bytes) },
      { path: activeSnapshotPath, text: textOfBytes(activeSnapshot.bytes) },
    ])
    const observation = {
      scope: 'host',
      level: 'stable-read-only',
      attempts,
      activePath,
      archivePath,
      lockPath: usageLedgerLockPath(activePath),
      activeExists: observed.active.exists,
      archiveExists: observed.archive.exists,
      activeSha256: sha256Of(observed.active.bytes),
      archiveSha256: sha256Of(observed.archive.bytes),
      snapshotDir: dirPath,
      snapshotActivePath: activeSnapshotPath,
      snapshotArchivePath: archiveSnapshotPath,
    }
    return { ...summary, activePath, archivePath, observationLevel: observation.level, observation }
  } finally {
    fsOps.rmSync(dirPath, { recursive: true, force: true })
  }
}

function readHostSnapshots(activePath, options) {
  const archivePath = archivePathOf(activePath)
  const lockPath = usageLedgerLockPath(activePath)
  validateHostReadPath(activePath, options, LEDGER_READ_PURPOSE)
  validateHostReadPath(archivePath, { ...objectOf(options), target: undefined }, LEDGER_READ_PURPOSE)
  validateHostReadPath(lockPath, { ...objectOf(options), target: undefined }, 'ledger-lock-read')
  let previous
  for (let attempt = 1; attempt <= 2; attempt += 1) {
    const observed = hostObservationAttempt(mergedFsOps(options && options.fsOps), activePath, archivePath, lockPath)
    if (observed.busy) throw new LedgerError('Host账本存在锁或锁在观察期间出现；INCOMPLETE', 'incomplete')
    if (!observed.stable) throw new LedgerError('Host账本active/archive元数据变化；INCOMPLETE', 'incomplete')
    if (previous !== undefined && (!sameBytes(previous.active.bytes, observed.active.bytes) || !sameBytes(previous.archive.bytes, observed.archive.bytes))) {
      throw new LedgerError('Host账本两次读取字节不一致；INCOMPLETE', 'incomplete')
    }
    if (previous !== undefined) return writeHostSnapshot(activePath, archivePath, observed, attempt, options)
    previous = observed
  }
  throw new LedgerError('Host账本未形成稳定只读快照；INCOMPLETE', 'incomplete')
}

export function statLedger(activePath, options = {}) {
  const purpose = purposeOf(options) === CLI_PURPOSE ? LEDGER_READ_PURPOSE : purposeOf(options)
  const context = pathContextOf(options)
  const target = targetForPath(context, activePath, purpose, { ...objectOf(options), purpose })
  const hostRead = isHostTarget(target)
  const scopedOptions = {
    ...objectOf(options),
    purpose,
    ledgerTarget: target,
    ...(hostRead ? { hostReadOnly: true } : {}),
  }
  if (hostRead) return readHostSnapshots(activePath, scopedOptions)
  if (!isWritableWorkspaceTarget(target)) throw new LedgerError('账本统计目标不是可写 W 或只读 H 目标', 'path-not-authorized')
  // W 分支：把 activePath 规范化为分类目标的物理绝对路径，锁/读取/返回值全程同一物理身份；
  // 避免运行时锁合同对相对输入固定走 H 解析而缺 H 根失败。
  const resolvedPath = targetPathOf(target)
  if (typeof resolvedPath !== 'string' || resolvedPath.trim() === '') throw new LedgerError('W账本目标缺少物理路径', 'path-not-authorized')
  activePath = resolvedPath
  const waitMs = options !== null && Number.isFinite(options.lockWaitMs) ? options.lockWaitMs : WRITER_LOCK_WAIT_MS
  const acquired = acquireLock(activePath, waitMs, scopedOptions)
  let snapshots
  let operationError
  let releaseError
  try {
    snapshots = readSnapshots(activePath, scopedOptions)
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

function publishTransaction({ activePath, archivePath, activeOriginal, archiveOriginal, archiveText, fsOps, checkBudget, pathContext, purpose }) {
  const authorization = { pathContext, purpose }
  const tx = uniqueTransactionPaths(activePath, archivePath)
  // active、archive、临时、备份及逆序恢复全部在同一 H/W context 下预授权；
  // 不从普通文件 dirname 推导 Host 根。
  for (const target of [activePath, archivePath, tx.activeTemp, tx.archiveTemp, tx.activeBackup, tx.archiveBackup]) authorizeWritePath(target, authorization)
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

function authorizeArchiveTarget(activePath, options) {
  const context = pathContextOf(options)
  const purpose = purposeOf(options)
  const classified = contextTargetOf(options, activePath)
  if (classified !== undefined && isHostTarget(classified)) throw new LedgerError('Host只读账本不能归档；归档目标必须在 W', 'path-not-authorized')
  const maintenance = maintenanceContextOf(options)
  if (classified === undefined && maintenance !== undefined && maintenance.hostAccess === 'read-only') {
    const hostTarget = targetForPath(context, activePath, LEDGER_READ_PURPOSE, { ...objectOf(options), workspaceOnly: false, hostReadOnly: true })
    if (isHostTarget(hostTarget)) throw new LedgerError('Host只读账本不能经 W 别名归档；归档目标必须在 W', 'path-not-authorized')
  }
  const target = targetForPath(context, activePath, purpose, { ...objectOf(options), workspaceOnly: true })
  if (!isWritableWorkspaceTarget(target)) throw new LedgerError('归档目标不是可写 W 目标：' + activePath, 'path-not-authorized')
  try { prepareWriteTarget(context, policyTargetOf(target), { expectedType: 'file', purpose }) }
  catch (error) { throw new LedgerError('归档目标未获 W 写入授权：' + errorMessageOf(error), errorCodeOf(error) || 'path-not-authorized') }
  return target
}

export function archiveLedger(activePath, options = {}) {
  const purpose = purposeOf(options) === CLI_PURPOSE ? LEDGER_ARCHIVE_PURPOSE : purposeOf(options)
  const scopedOptions = { ...objectOf(options), purpose, workspaceOnly: true }
  const archiveTarget = authorizeArchiveTarget(activePath, scopedOptions)
  const waitMs = options !== null && Number.isFinite(options.lockWaitMs) ? options.lockWaitMs : WRITER_LOCK_WAIT_MS
  const budgetMs = options !== null && Number.isFinite(options.budgetMs) ? Math.max(0, options.budgetMs) : ARCHIVE_BUDGET_MS
  // 与 statLedger W 分支同模式：把 activePath 规范化为分类目标物理绝对路径，锁/读取/发布/返回值全程同一物理身份。
  const resolvedPath = targetPathOf(archiveTarget)
  if (typeof resolvedPath !== 'string' || resolvedPath.trim() === '') throw new LedgerError('W账本目标缺少物理路径', 'path-not-authorized')
  activePath = resolvedPath
  const acquired = acquireLock(activePath, waitMs, scopedOptions)
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
    const snapshots = readSnapshots(activePath, scopedOptions)
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
      pathContext: pathContextOf(scopedOptions),
      purpose,
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

function cliPathContext(options) {
  const context = maintenanceContextOf(options)
  if (context !== undefined && context.pathContext !== undefined && context.pathContext !== null) return context.pathContext
  return pathContextOf(options)
}

function cliLedgerTarget(context, options, legacyArgs = []) {
  const maintenance = maintenanceContextOf(options) || context
  const ledger = maintenance !== null && typeof maintenance === 'object' && maintenance.ledger !== null && typeof maintenance.ledger === 'object'
    ? maintenance.ledger
    : undefined
  const fromLedger = ledger !== undefined ? ledger.target : undefined
  const explicit = fromLedger !== null && fromLedger !== undefined ? fromLedger : objectOf(options).target
  if (targetPathOf(explicit) !== undefined) return explicit
  if (Array.isArray(legacyArgs) && legacyArgs.length === 1 && typeof legacyArgs[0] === 'string' && legacyArgs[0].trim() !== '') {
    const purpose = purposeOf(options)
    const readHost = purpose === LEDGER_READ_PURPOSE && maintenance !== undefined && maintenance.hostAccess === 'read-only'
    const selected = targetForPath(pathContextOf(options), legacyArgs[0], purpose, { ...objectOf(options), hostReadOnly: readHost })
    if (targetPathOf(selected) !== undefined) return selected
  }
  throw new LedgerError('公共维护上下文缺少明确账本目标', 'path-not-authorized')
}

export function main(argv = process.argv.slice(2), options = {}) {
  try {
    const parsed = parseMaintenanceArgs(argv)
    const source = objectOf(options)
    const suppliedContext = maintenanceContextOf(source)
    let context = suppliedContext
    if (context === undefined) {
      const contextInput = { ...parsed }
      if (contextInput.hostRoot === null && typeof source.hostRoot === 'string') contextInput.hostRoot = source.hostRoot
      if (contextInput.profile === null && typeof source.profile === 'string') contextInput.profile = source.profile
      context = createMaintenanceContext(contextInput)
    }
    const ledgerMode = context.ledger !== null && typeof context.ledger === 'object' && context.ledger.mode === 'archive' ? 'archive' : 'stats'
    const purpose = ledgerMode === 'archive' ? LEDGER_ARCHIVE_PURPOSE : LEDGER_READ_PURPOSE
    const contextLedgerTarget = context.ledger !== null && typeof context.ledger === 'object' ? context.ledger.target : undefined
    const scopedOptions = {
      ...source,
      maintenanceContext: context,
      pathContext: cliPathContext({ maintenanceContext: context }),
      purpose,
      target: contextLedgerTarget !== null && contextLedgerTarget !== undefined ? contextLedgerTarget : source.target,
    }
    const activeTarget = cliLedgerTarget(context, scopedOptions, parsed.domainArgv)
    const activePath = targetPathOf(activeTarget)
    if (activePath === undefined) throw new LedgerError('公共维护上下文缺少明确账本目标', 'path-not-authorized')
    if (ledgerMode === 'archive') {
      const result = archiveLedger(activePath, scopedOptions)
      console.log('归档成功：' + result.archivePath + '；聚合组=' + result.groups + '；covered=' + result.coveredByArchiveRows + '；active已清空；cursor未读取/未改写')
    } else {
      const result = statLedger(activePath, scopedOptions)
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
