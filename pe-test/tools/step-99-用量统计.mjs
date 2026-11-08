// step-99-用量统计.mjs — 单一账本 ledger-v2.archive.jsonl 的只读统计与现场扫描对拍。
// 用法：node step-99-用量统计.mjs <ledger-v2.archive.jsonl>[--host-root <H>]
//       node step-99-用量统计.mjs --compare <ledger-v2.archive.jsonl>[--host-root <H>]
// 唯一账本是 ledger-v2.archive.jsonl：插件启动时扫描 %DSH_HOME%/sessions 下的 v4 会话日志
// 后覆盖式更新（幂等）；本工具只统计这一份账本，不写账本字节、不建目录、不写临时文件。
// 观察分两类，两类都不取锁：W 目标直接只读统计；显式 Host 只读目标做最多两次稳定观察，
// 不写所选 Host 资源/锁/备份/temp。只读无需互斥——账本写入只有启动扫描一处且用 temp+rename
// 原子发布，读者要么看到完整旧版本要么看到完整新版本。
// --compare 模式除统计外额外调用 lib/usage-ledger.js 的 scanUsageRows({ hostRoot }) 取现场扫描
// 结果，与账本按 role→model 两维汇总逐项对拍，输出四张表与三条自检结论；全程只读、零写盘。
import { createHash, randomUUID } from 'node:crypto'
import { mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { basename, isAbsolute, join, relative, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { ALLOWED_PRESETS, isSchemaDocRow, scanUsageRows } from '../../plugins/dsh-extra-plan/lib/usage-ledger.js'
import { prepareWriteTarget, resolveHostPath, resolveWorkspacePath, validateReadTarget } from '../../plugins/dsh-extra-plan/lib/path-policy.js'
import { createMaintenanceContext, parseMaintenanceArgs } from '../_shared/workspace-paths.mjs'

export const ARCHIVE_FILE_NAME = 'ledger-v2.archive.jsonl'
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
const DEFAULT_FS_OPS = Object.freeze({ mkdirSync, readFileSync, rmSync, statSync, writeFileSync })
const CLI_PURPOSE = 'usage-ledger-cli'
const LEDGER_READ_PURPOSE = 'ledger-read'
const LEDGER_ARCHIVE_PURPOSE = 'ledger-archive'

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
  if (source.workspaceOnly === true || purpose === LEDGER_ARCHIVE_PURPOSE) {
    return resolveWorkspacePath(context, filePath, { purpose })
  }
  // 相对输入始终按维护 W 解析，不因 Host 根存在或只读用途改贴 H。
  if (typeof filePath !== 'string' || !isAbsolute(filePath)) return resolveWorkspacePath(context, filePath, { purpose })
  const absolutePath = resolve(filePath)
  const rootContains = (root) => {
    if (typeof root !== 'string' || root.trim() === '') return false
    const fromRoot = relative(resolve(root), absolutePath)
    return fromRoot === ''
      || (!isAbsolute(fromRoot) && fromRoot !== '..' && !fromRoot.startsWith('../') && !fromRoot.startsWith('..\\'))
  }
  const inWorkspace = rootContains(context.workspaceRoot)
  const inHost = rootContains(context.hostDataRoot)
  const maintenance = maintenanceContextOf(source)
  const explicitHostRead = source.hostReadOnly === true
    || (maintenance !== undefined && maintenance.hostAccess === 'read-only' && purpose === LEDGER_READ_PURPOSE)
  // W/H 重叠时只有明确 Host 只读用途选 H；其余绝对值按根归属，Other 交由 W resolver 拒绝。
  if (inHost && (!inWorkspace || explicitHostRead)) return resolveHostPath(context, filePath, { purpose })
  return resolveWorkspacePath(context, filePath, { purpose })
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

function validDedupeKey(row) {
  return isPlainObject(row)
    && typeof row.sessionId === 'string'
    && row.sessionId.trim() !== ''
    && Number.isInteger(row.seq)
    && row.seq >= 0
}

// 去重键与账本侧 identityKeyOfRow 同口径（九字段序列化）；seq 在账本侧可能被兜底写成 0
// （usage-ledger 扫描行 seq 缺失即落 0），不能当主键。
function dedupeKeyOf(row) {
  return identityKeyOf(row)
}

export function parseLedgerText(text, options = {}) {
  if (options !== null && options.strict === true) {
    throw new LedgerError('strict解析已移除：请调用 lib/usage-ledger.js 的 startupArchive', 'strict-parser-removed')
  }
  const check = options !== null && typeof options.check === 'function' ? options.check : undefined
  const rows = []
  let skippedNonV2Objects = 0
  let badJsonLines = 0
  let noticeLines = 0
  let lineNumber = 0
  for (const line of String(text === undefined || text === null ? '' : text).split(/\r?\n/)) {
    if (line.trim() === '') continue
    if (check !== undefined) check()
    lineNumber += 1
    let row
    try {
      row = JSON.parse(line)
    } catch {
      badJsonLines += 1
      if (check !== undefined) check()
      continue
    }
    if (check !== undefined) check()
    if (isSchemaDocRow(row)) {
      noticeLines += 1
      if (check !== undefined) check()
      continue
    }
    if (!isPlainObject(row) || row.schemaVersion !== 2) {
      skippedNonV2Objects += 1
      if (check !== undefined) check()
      continue
    }
    rows.push(row)
    if (check !== undefined) check()
  }
  return { rows, skippedNonV2Objects, badJsonLines, noticeLines, lineCount: lineNumber }
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
  }
}

// 单一账本口径：各来源行合并后按身份键（IDENTITY_KEYS 九维）分组求和，
// 同 sessionId+seq 的重复行只计一次；不存在「水位覆盖重放」的覆盖口径。
export function summarizeSnapshotTexts(sources, options = {}) {
  let skippedNonV2Objects = 0
  let badJsonLines = 0
  let noticeLines = 0
  const input = Array.isArray(sources) ? sources : []
  const rows = []
  for (const source of input) {
    const parsed = parseLedgerText(source && source.text !== undefined ? source.text : source)
    rows.push(...parsed.rows)
    skippedNonV2Objects += parsed.skippedNonV2Objects
    badJsonLines += parsed.badJsonLines
    noticeLines += parsed.noticeLines
  }
  const summary = summarizeRows(rows, options)
  return { ...summary, skippedNonV2Objects, badJsonLines, noticeLines }
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
  lines.push('账本说明行（首行说明，已跳过，未计入V1/非V2）: ' + (Number.isFinite(summary.noticeLines) ? summary.noticeLines : 0))
  lines.push('坏JSON行（已跳过，未计入V1/非V2）: ' + summary.badJsonLines)
  if (summary.duplicateV2Rows > 0) lines.push('重复V2记录（按非空sessionId+非负整数seq去重）: ' + summary.duplicateV2Rows + '（已跳过）')
  if (paths.archivePath !== undefined) lines.push('统计来源（单一账本）: ' + paths.archivePath)
  return lines.join('\n')
}

function readSnapshots(archivePath, options) {
  const fsOps = mergedFsOps(options && options.fsOps)
  authorizeOptionalReadPath(archivePath, options)
  const archive = optionalRead(fsOps, archivePath)
  return { fsOps, archive }
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
      dev: String(stat.dev ?? ''),
      ino: String(stat.ino ?? ''),
      size: String(stat.size ?? ''),
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

// 一轮只读观察：读前/读后各取一次 archive 元数据，元数据一致才算稳定。
// 不观察锁文件：账本写入只有启动扫描一处且用 temp+rename 原子发布，读者不需要互斥。
function hostObservationAttempt(fsOps, archivePath) {
  const before = fileMetadata(fsOps, archivePath)
  const archive = optionalRead(fsOps, archivePath)
  const after = fileMetadata(fsOps, archivePath)
  return { before, after, archive, stable: sameMetadata(before, after) }
}

function sha256Of(value) {
  return createHash('sha256').update(bytesOf(value)).digest('hex')
}

// Host 只读目标的稳定观察结果（单一 archive 文件）：观测字节留在内存里直接解析，
// 不再落 W 暂存快照，因此本路径不建目录、不写文件、不删文件（零写盘）。
function summarizeHostArchive(archivePath, observed, attempts) {
  const summary = summarizeSnapshotTexts([{ path: archivePath, text: textOfBytes(observed.archive.bytes) }])
  const observation = {
    scope: 'host',
    level: 'stable-read-only',
    attempts,
    archivePath,
    archiveExists: observed.archive.exists,
    archiveSha256: sha256Of(observed.archive.bytes),
  }
  return { ...summary, archivePath, observationLevel: observation.level, observation }
}

// Host 只读目标：不取锁、最多两次稳定观察、不写所选 Host 资源。
// 只读不需要锁：账本写入只有启动扫描一处且用 temp+rename 原子发布，读者要么看到完整旧版本
// 要么看到完整新版本；本函数仍保留两次稳定观察——两次读取字节不一致即 INCOMPLETE，
// 拦的是「两次读取跨了一次原子 rename」，与锁无关。
function readArchiveSnapshot(archivePath, options) {
  validateHostReadPath(archivePath, options, LEDGER_READ_PURPOSE)
  let previous
  for (let attempt = 1; attempt <= 2; attempt += 1) {
    const observed = hostObservationAttempt(mergedFsOps(options && options.fsOps), archivePath)
    if (!observed.stable) throw new LedgerError('Host账本archive元数据变化；INCOMPLETE', 'incomplete')
    if (previous !== undefined && !sameBytes(previous.archive.bytes, observed.archive.bytes)) {
      throw new LedgerError('Host账本两次读取字节不一致；INCOMPLETE', 'incomplete')
    }
    if (previous !== undefined) return summarizeHostArchive(archivePath, observed, attempt)
    previous = observed
  }
  throw new LedgerError('Host账本未形成稳定只读快照；INCOMPLETE', 'incomplete')
}

export function statLedger(archivePath, options = {}) {
  const purpose = purposeOf(options) === CLI_PURPOSE ? LEDGER_READ_PURPOSE : purposeOf(options)
  const context = pathContextOf(options)
  const target = targetForPath(context, archivePath, purpose, { ...objectOf(options), purpose })
  const hostRead = isHostTarget(target)
  const scopedOptions = {
    ...objectOf(options),
    purpose,
    ledgerTarget: target,
    ...(hostRead ? { hostReadOnly: true } : {}),
  }
  if (hostRead) return readArchiveSnapshot(archivePath, scopedOptions)
  if (!isWritableWorkspaceTarget(target)) throw new LedgerError('账本统计目标不是可写 W 或只读 H 目标', 'path-not-authorized')
  // W 分支：把 archivePath 规范化为分类目标的物理绝对路径，读取/返回值全程同一物理身份；
  // 避免运行时路径合同对相对输入固定走 H 解析而缺 H 根失败。
  const resolvedPath = targetPathOf(target)
  if (typeof resolvedPath !== 'string' || resolvedPath.trim() === '') throw new LedgerError('W账本目标缺少物理路径', 'path-not-authorized')
  archivePath = resolvedPath
  // W 分支同样不取锁：只读不互斥，写入侧的 temp+rename 保证读到的永远是完整版本。
  const snapshots = readSnapshots(archivePath, scopedOptions)
  const summary = summarizeSnapshotTexts([{ path: archivePath, text: textOfBytes(snapshots.archive.bytes) }])
  return { ...summary, archivePath }
}

// --compare 专用只读读取：不取锁、不建目录、不写任何文件（零写盘），仅供对拍使用。
function readLedgerReadOnly(archivePath, options = {}) {
  const purpose = purposeOf(options) === CLI_PURPOSE ? LEDGER_READ_PURPOSE : purposeOf(options)
  const context = pathContextOf(options)
  const target = targetForPath(context, archivePath, purpose, { ...objectOf(options), purpose })
  if (isHostTarget(target)) return readArchiveSnapshot(archivePath, { ...objectOf(options), purpose, ledgerTarget: target, hostReadOnly: true })
  if (!isWritableWorkspaceTarget(target)) throw new LedgerError('账本统计目标不是可写 W 或只读 H 目标', 'path-not-authorized')
  const resolvedPath = targetPathOf(target)
  if (typeof resolvedPath !== 'string' || resolvedPath.trim() === '') throw new LedgerError('W账本目标缺少物理路径', 'path-not-authorized')
  const snapshots = readSnapshots(resolvedPath, { ...objectOf(options), purpose })
  const summary = summarizeSnapshotTexts([{ path: resolvedPath, text: textOfBytes(snapshots.archive.bytes) }])
  const observation = {
    scope: 'workspace',
    level: 'read-only-no-lock',
    archivePath: resolvedPath,
    archiveExists: snapshots.archive.exists,
    archiveSha256: sha256Of(snapshots.archive.bytes),
  }
  return { ...summary, archivePath: resolvedPath, observationLevel: observation.level, observation }
}

function cliPathContext(options) {
  const context = maintenanceContextOf(options)
  if (context !== undefined && context.pathContext !== undefined && context.pathContext !== null) return context.pathContext
  return pathContextOf(options)
}

function cliLedgerTarget(context, options, positionalArgs = []) {
  const maintenance = maintenanceContextOf(options) || context
  const ledger = maintenance !== null && typeof maintenance === 'object' && maintenance.ledger !== null && typeof maintenance.ledger === 'object'
    ? maintenance.ledger
    : undefined
  const fromLedger = ledger !== undefined ? ledger.target : undefined
  const explicit = fromLedger !== null && fromLedger !== undefined ? fromLedger : objectOf(options).target
  if (targetPathOf(explicit) !== undefined) return explicit
  if (Array.isArray(positionalArgs) && positionalArgs.length === 1 && typeof positionalArgs[0] === 'string' && positionalArgs[0].trim() !== '') {
    const purpose = purposeOf(options)
    const readHost = purpose === LEDGER_READ_PURPOSE && maintenance !== undefined && maintenance.hostAccess === 'read-only'
    const selected = targetForPath(pathContextOf(options), positionalArgs[0], purpose, { ...objectOf(options), hostReadOnly: readHost })
    if (targetPathOf(selected) !== undefined) return selected
  }
  throw new LedgerError('公共维护上下文缺少明确账本目标', 'path-not-authorized')
}

const USAGE_REMOVED_MESSAGE = '手工归档已移除：--archive 不再提供；统计请直接传 ledger-v2.archive.jsonl 位置参数，归档由插件启动扫描维护（扫描 %DSH_HOME%/sessions 下的 v4 会话日志后覆盖式更新），不再有手工归档入口'

function usageRemovedError() {
  return new LedgerError(USAGE_REMOVED_MESSAGE, 'usage-removed')
}

const COMPARE_FLAG = '--compare'
const COMPARE_TABLE_HEADER = 'role → model | 身份行数 | inputTokens | cacheReadTokens | cacheWriteTokens | outputTokens | total'

function hasCompareFlag(argv) {
  return Array.isArray(argv) && argv.includes(COMPARE_FLAG)
}

function argvWithoutCompare(argv) {
  return (Array.isArray(argv) ? argv : []).filter((arg) => arg !== COMPARE_FLAG)
}

// 对拍扫描根：显式 --host-root（维护上下文）→ options.hostRoot → DSH_HOME → ~/.dsh（与插件扫描口径一致）。
function compareHostRootOf(context, options) {
  const fromContext = context !== null && typeof context === 'object' && typeof context.hostRoot === 'string' ? context.hostRoot : ''
  if (fromContext !== '') return fromContext
  const fromOptions = objectOf(options).hostRoot
  if (typeof fromOptions === 'string' && fromOptions !== '') return fromOptions
  const fromEnv = typeof process.env.DSH_HOME === 'string' ? process.env.DSH_HOME.trim() : ''
  return fromEnv !== '' ? fromEnv : join(homedir(), '.dsh')
}

function roleModelOf(row) {
  const role = typeof row.role === 'string' && row.role !== '' ? row.role : '-'
  const model = typeof row.model === 'string' && row.model !== '' ? row.model : '-'
  return { role, model, key: role + '\u0000' + model }
}

function aggregateRoleModel(rows) {
  const map = new Map()
  for (const row of Array.isArray(rows) ? rows : []) {
    if (!isPlainObject(row)) continue
    const label = roleModelOf(row)
    let bucket = map.get(label.key)
    if (bucket === undefined) {
      bucket = {
        key: label.key, role: label.role, model: label.model, rows: 0,
        inputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0, outputTokens: 0, total: 0,
      }
      map.set(label.key, bucket)
    }
    for (const tokenKey of TOKEN_KEYS) bucket[tokenKey] += tokenNumber(row, tokenKey)
    bucket.rows += 1
  }
  return [...map.values()]
    .sort((a, b) => compareValues(a.role, b.role) || compareValues(a.model, b.model))
    .map((bucket) => {
      bucket.total = bucket.inputTokens + bucket.cacheReadTokens + bucket.cacheWriteTokens + bucket.outputTokens
      return bucket
    })
}

function compareRowLine(bucket) {
  return [
    bucket.role + ' → ' + bucket.model, bucket.rows,
    bucket.inputTokens, bucket.cacheReadTokens, bucket.cacheWriteTokens, bucket.outputTokens, bucket.total,
  ].join(' | ')
}

function renderScanTable(scanned) {
  const stats = scanned.stats !== null && typeof scanned.stats === 'object' ? scanned.stats : {}
  const lines = ['=== 对拍①：现场扫描侧（scanUsageRows 按 role→model 汇总） ===', COMPARE_TABLE_HEADER]
  for (const bucket of aggregateRoleModel(scanned.rows)) lines.push(compareRowLine(bucket))
  lines.push('扫描聚合行: ' + scanned.rows.length
    + ' | 日志文件: ' + (stats.files || 0)
    + ' | 会话: ' + (stats.sessions || 0)
    + ' | 跳过: ' + (stats.skipped || 0)
    + ' | 解码失败: ' + (stats.decodeFailed || 0)
    + ' | 版本不支持: ' + (stats.unsupported || 0)
    + ' | 解析错误: ' + (stats.parseErrors || 0))
  return lines.join('\n')
}

function renderLedgerTable(summary) {
  const lines = ['=== 对拍②：账本侧（' + ARCHIVE_FILE_NAME + ' 按 role→model 汇总） ===', COMPARE_TABLE_HEADER]
  for (const bucket of aggregateRoleModel(summary.rows)) lines.push(compareRowLine(bucket))
  lines.push('账本行数（去重后）: ' + summary.rows.length + ' | 身份分组数: ' + summary.groups.length)
  return lines.join('\n')
}

function renderDiffTable(scanBuckets, ledgerBuckets) {
  const scanByKey = new Map(scanBuckets.map((bucket) => [bucket.key, bucket]))
  const ledgerByKey = new Map(ledgerBuckets.map((bucket) => [bucket.key, bucket]))
  const keys = [...new Set([...scanByKey.keys(), ...ledgerByKey.keys()])].sort()
  const fields = ['rows', ...TOKEN_KEYS, 'total']
  const lines = ['=== 对拍③：逐项差异（扫描侧 − 账本侧；calls 不入账本、不参与对拍） ===', 'role → model | 身份行数差 | inputTokens差 | cacheReadTokens差 | cacheWriteTokens差 | outputTokens差 | total差 | 判定']
  let differing = 0
  for (const key of keys) {
    const scan = scanByKey.get(key)
    const ledger = ledgerByKey.get(key)
    const left = scan === undefined ? null : scan
    const right = ledger === undefined ? null : ledger
    const deltas = fields.map((field) => (left === null ? 0 : left[field]) - (right === null ? 0 : right[field]))
    const same = deltas.every((value) => value === 0)
    if (!same) differing += 1
    const label = scan !== undefined ? scan.role + ' → ' + scan.model : ledger.role + ' → ' + ledger.model
    lines.push([label, ...deltas, same ? '逐项一致' : '有差异'].join(' | '))
  }
  lines.push('存在差异的 role→model 数: ' + differing + ' / ' + keys.length)
  return lines.join('\n')
}

function renderIdentityDiffTable(scanBuckets, ledgerBuckets) {
  const scanKeys = new Set(scanBuckets.map((bucket) => bucket.key))
  const ledgerKeys = new Set(ledgerBuckets.map((bucket) => bucket.key))
  const scanOnly = [...scanKeys].filter((key) => !ledgerKeys.has(key)).sort()
  const ledgerOnly = [...ledgerKeys].filter((key) => !scanKeys.has(key)).sort()
  const label = (key) => key.split('\u0000').join(' → ')
  const lines = ['=== 对拍④：身份集合差（按 role→model 两维身份） ===']
  lines.push('仅在扫描侧的身份（账本缺）: ' + scanOnly.length + (scanOnly.length === 0 ? '' : ' [' + scanOnly.map(label).join('; ') + ']'))
  lines.push('仅在账本侧的身份（扫描缺）: ' + ledgerOnly.length + (ledgerOnly.length === 0 ? '' : ' [' + ledgerOnly.map(label).join('; ') + ']'))
  lines.push('两侧共有身份: ' + [...scanKeys].filter((key) => ledgerKeys.has(key)).length + ' / 扫描侧 ' + scanKeys.size + ' / 账本侧 ' + ledgerKeys.size)
  return { text: lines.join('\n'), ledgerOnly }
}

function renderCompareConclusions({ scanned, scannedAgain, scanText, summary, ledgerOnlyKeys }) {
  const deterministic = renderScanTable(scannedAgain) === scanText
  const allowed = new Set(ALLOWED_PRESETS)
  const offenders = summary.rows.filter((row) => !allowed.has(row.agentPreset))
  const scanSessions = new Set(scanned.rows.map((row) => row.sessionId))
  const ledgerOnlyKeysSet = new Set(ledgerOnlyKeys)
  const ledgerOnlySessions = new Set()
  const stillScanned = new Set()
  for (const row of summary.rows) {
    if (!ledgerOnlyKeysSet.has(roleModelOf(row).key)) continue
    ledgerOnlySessions.add(row.sessionId)
    if (scanSessions.has(row.sessionId)) stillScanned.add(row.sessionId)
  }
  const lines = ['=== 对拍自检结论 ===']
  lines.push('① 扫描两次输出逐字一致（确定性）: ' + (deterministic ? 'PASS' : 'FAIL（同一输入两次 scanUsageRows 渲染不一致）'))
  lines.push('② 账本白名单外的行: ' + offenders.length
    + (offenders.length === 0
      ? '（白名单 = ' + ALLOWED_PRESETS.join('/') + '）'
      : '（preset = ' + [...new Set(offenders.map((row) => String(row.agentPreset)))].join('/') + '）'))
  lines.push('③ 仅在账本侧的身份数: ' + ledgerOnlyKeys.length
    + '；涉及会话 ' + ledgerOnlySessions.size + ' 个，其中会话日志仍在 ' + stillScanned.size + ' 个'
    + (stillScanned.size === 0 ? '（可被「日志已删」解释）' : '（需人工核对：扫描侧漏计或身份口径变化）'))
  return { text: lines.join('\n'), deterministic }
}

// --compare：除统计外额外跑现场扫描并对拍；两次独立扫描用于确定性自检，全程只读、零写盘。
function renderCompare({ summary, archivePath, hostRoot }) {
  const scanned = scanUsageRows({ hostRoot })
  const scannedAgain = scanUsageRows({ hostRoot })
  const scanText = renderScanTable(scanned)
  const scanBuckets = aggregateRoleModel(scanned.rows)
  const ledgerBuckets = aggregateRoleModel(summary.rows)
  const identityDiff = renderIdentityDiffTable(scanBuckets, ledgerBuckets)
  const conclusions = renderCompareConclusions({ scanned, scannedAgain, scanText, summary, ledgerOnlyKeys: identityDiff.ledgerOnly })
  return [
    '=== 对拍上下文：账本 ' + archivePath + ' | 现场扫描根 ' + hostRoot + ' | 只读零写盘（不取锁/不建目录/不写文件） ===',
    scanText,
    renderLedgerTable(summary),
    renderDiffTable(scanBuckets, ledgerBuckets),
    identityDiff.text,
    conclusions.text,
  ].join('\n')
}

export function main(argv = process.argv.slice(2), options = {}) {
  try {
    const compare = hasCompareFlag(argv)
    // --compare 是本 CLI 自己的开关、不参与维护参数解析：先剥离再用既有 parseMaintenanceArgs 解析，
    // 既有维护上下文、Host 只读授权与 --archive 拒绝路径都不变。
    const parsed = parseMaintenanceArgs(compare ? argvWithoutCompare(argv) : argv)
    // 前置：--archive 已移除。必须在构造维护上下文之前判定，否则 W 外目标会先被 ROOT_ESCAPE 抢报。
    if (parsed.ledger !== null && typeof parsed.ledger === 'object' && parsed.ledger.mode === 'archive') throw usageRemovedError()
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
    // 第二道检查：覆盖调用方显式传入 maintenanceContext（raw argv 无 --archive）的情形。
    if (ledgerMode === 'archive') throw usageRemovedError()
    const purpose = LEDGER_READ_PURPOSE
    const contextLedgerTarget = context.ledger !== null && typeof context.ledger === 'object' ? context.ledger.target : undefined
    const scopedOptions = {
      ...source,
      maintenanceContext: context,
      pathContext: cliPathContext({ maintenanceContext: context }),
      purpose,
      target: contextLedgerTarget !== null && contextLedgerTarget !== undefined ? contextLedgerTarget : source.target,
    }
    const archiveTarget = cliLedgerTarget(context, scopedOptions, parsed.domainArgv)
    const archivePath = targetPathOf(archiveTarget)
    if (archivePath === undefined) throw new LedgerError('公共维护上下文缺少明确账本目标', 'path-not-authorized')
    const result = compare ? readLedgerReadOnly(archivePath, scopedOptions) : statLedger(archivePath, scopedOptions)
    console.log(renderStats(result, result))
    if (compare) console.log(renderCompare({ summary: result, archivePath, hostRoot: compareHostRootOf(context, source) }))
    return 0
  } catch (error) {
    console.error('失败：' + errorMessageOf(error))
    return 1
  }
}

if (process.argv[1] !== undefined && pathToFileURL(process.argv[1]).href === import.meta.url) {
  process.exitCode = main()
}
