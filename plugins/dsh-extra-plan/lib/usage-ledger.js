// 用量账本（改造11 三模块合并）——本文件是账本唯一实现，四段职责：
//   ① 常量与身份键；
//   ② 扫描（改造11 前在独立扫描模块：枚举 sessions/<ws>/<sid>/session.v4.jsonl.zstd、node:zlib 多帧解压、
//      事件提取、白名单过滤、身份聚合）；
//   ③ 写入（改造11 前在独立归档模块：读现有 archive、按身份覆盖式更新、单调性保护、说明行、temp→rename 原子发布）；
//   ④ 启动入口 startupArchive。
// 改造11 相对合并前（291+543+1000=1834 行）删除：createUsageLedger 空壳、archivePathOf/archiveLedger 直调入口、
// 整套跨进程锁（等待轮询、死 PID 接管、stale-lock 告警）、双文件事务、逆序回滚、active 相关分支。
// 写入互斥只剩一次 O_EXCL 建 <archive>.lock：拿不到即跳过本次启动扫描并留痕，不等待、不接管、不删他人锁。
import { appendFileSync, closeSync, mkdirSync, openSync, readFileSync, readdirSync, renameSync, statSync, unlinkSync, writeFileSync, writeSync } from 'node:fs'
import { randomUUID } from 'node:crypto'
import { basename, dirname, join } from 'node:path'
import { zstdDecompressSync } from 'node:zlib'
import { ROLE_IDS, USAGE_ROLE_BY_PRESET } from './role-contract.js'
import { resolveHostPath, prepareWriteTarget, validateReadTarget } from './path-policy.js'


// ── ① 常量区 ─────────────────────────────────────────────────────────────────
const SESSIONS_DIRECTORY = 'sessions'
const SESSION_LOG_FILE_NAME = 'session.v4.jsonl.zstd'
const SUPPORTED_SESSION_VERSION = 4
const USAGE_PRESET = 'extra-plan'

// 严格白名单：主预设 extra-plan 与 role-contract 的四个角色预设 id（executor/planner/reviewer/prober）。
// 预设不在白名单的会话整体跳过，不产出任何行。
export const ALLOWED_PRESETS = Object.freeze([USAGE_PRESET, ...ROLE_IDS])

export const IDENTITY_KEYS = Object.freeze([
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

// 主会话目录名是 session-<uuid>，子代理会话目录名是裸 <uuid>（目录名即会话 id）；
// 两者都是会话目录，其余目录（临时/缓存等）整体跳过。
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const SESSION_ID_PREFIX = 'session-'
const MAX_PARENT_DEPTH = 8

// 只用字符串前缀判断行里是否可能是目标事件：整行 JSON.parse 前先做 O(n) 子串过滤，
// 避免为几乎全部内容型事件（assistant 正文、工具输出）付解析代价。
const EVENT_MARKERS = Object.freeze({
  session: '"session"',
  usage: '"assistant/message"',
  presetSelected: '"agent-preset/selected"',
  requestHeader: '"request/header"',
})

// ── ①b 账本常量（由旧归档模块迁入）────────────────────────────────────
const STARTUP_ARCHIVE_BUDGET_MS = 3000

const ARCHIVE_FILE_NAME = 'ledger-v2.archive.jsonl'
const SESSION_PRESETS_FILE_NAME = 'session-presets.json'
const SESSION_PRESETS_SCHEMA_VERSION = 1
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

// 归档首行说明行：kind 固定为「账本说明」，说明 给人类读口径，键 是数据行 15 个键的逗号展开。
// 说明行只允许唯一一条出现在首行，统计与归档一律跳过；判定必须三字段全形，避免把只有 kind 的垃圾行当说明行静默吞掉。
export const SCHEMA_DOC_KIND = '账本说明'
export const SCHEMA_DOC_ROW = Object.freeze({
  kind: SCHEMA_DOC_KIND,
  说明: '一行等于一个完整身份累计行；总消耗为四桶相加；inputTokens 是未命中缓存输入，cacheReadTokens 是命中输入，'
    + 'cacheWriteTokens 可为非零，outputTokens 为输出；seq 是会话内事件水位，不可当主键；'
    + 'ts 是该会话日志上次被解析时的最后修改时间（文件时间点）；增量判定锚点：日志当前 mtime 与该值一致则跳过重扫；delegationDepth 0 主会话、1 一级委派；parentSessionId 空串为主会话；'
    + 'role 取值含 main、child 及 executor/planner/reviewer/prober 四角色；agentPreset 是预设名；model 与 provider 分别为模型名与供应商名。',
  键: V2_KEYS.join(','),
})
export const SCHEMA_DOC_LINE = JSON.stringify(SCHEMA_DOC_ROW)

export function isSchemaDocRow(row) {
  return isPlainObject(row) && row.kind === SCHEMA_DOC_KIND && typeof row.说明 === 'string' && typeof row.键 === 'string'
}

const DEFAULT_FS_OPS = Object.freeze({
  mkdirSync,
  readFileSync,
  renameSync,
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

function checkArchiveCancellation(options) {
  if (isPlainObject(options) && typeof options.shouldCancel === 'function' && options.shouldCancel() === true) {
    throw archiveError('archive-cancelled', '归档已协作取消')
  }
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

// ── ② 路径枚举 ───────────────────────────────────────────────────────────────
function isSessionDirectoryName(name) {
  if (typeof name !== 'string' || name === '') return false
  const candidate = name.startsWith(SESSION_ID_PREFIX) ? name.slice(SESSION_ID_PREFIX.length) : name
  return UUID_PATTERN.test(candidate)
}

function listEntries(directory) {
  try {
    return readdirSync(directory, { withFileTypes: true })
  } catch (error) {
    return []
  }
}

// 遍历 sessions/<workspace>/<sessionId>/session.v4.jsonl.zstd；逐层列举，跳过非会话目录与非目标文件名。
export function enumerateSessionLogs({ hostRoot, shouldCancel } = {}) {
  const root = typeof hostRoot === 'string' && hostRoot.trim() !== '' ? hostRoot : ''
  const logFiles = []
  let skippedEntries = 0
  checkArchiveCancellation({ shouldCancel })
  if (root === '') return { logFiles, skippedEntries, root }
  const sessionsRoot = join(root, SESSIONS_DIRECTORY)
  const workspaceEntries = listEntries(sessionsRoot)
  checkArchiveCancellation({ shouldCancel })
  for (const workspaceEntry of workspaceEntries) {
    checkArchiveCancellation({ shouldCancel })
    if (!workspaceEntry.isDirectory()) {
      skippedEntries += 1
      continue
    }
    const workspacePath = join(sessionsRoot, workspaceEntry.name)
    const sessionEntries = listEntries(workspacePath)
    checkArchiveCancellation({ shouldCancel })
    for (const sessionEntry of sessionEntries) {
      checkArchiveCancellation({ shouldCancel })
      if (!sessionEntry.isDirectory() || !isSessionDirectoryName(sessionEntry.name)) {
        skippedEntries += 1
        continue
      }
      const logPath = join(workspacePath, sessionEntry.name, SESSION_LOG_FILE_NAME)
      try {
        if (!statSync(logPath).isFile()) {
          skippedEntries += 1
          continue
        }
      } catch (error) {
        skippedEntries += 1
        continue
      }
      checkArchiveCancellation({ shouldCancel })
      logFiles.push({ workspace: workspaceEntry.name, sessionDirectory: sessionEntry.name, logPath })
    }
  }
  checkArchiveCancellation({ shouldCancel })
  return { logFiles, skippedEntries, root }
}

// ── ③ 解码：zstd 多帧 ───────────────────────────────────────────────────────
// 帧切分的最小实现（不 import 任何测试目录模块）：返回这一帧的结束偏移，缺损/非法块边界返回 null。
function frameEndAt(bytes, start) {
  let cursor = start + 4
  const descriptor = bytes[cursor]
  if (descriptor === undefined) return null
  cursor += 1
  const singleSegment = (descriptor >> 5) & 1
  const frameContentSizeFlag = (descriptor >> 6) & 3
  const dictionaryFlag = descriptor & 3
  const checksumFlag = (descriptor >> 2) & 1
  if (!singleSegment) cursor += 1
  cursor += dictionaryFlag === 1 ? 1 : dictionaryFlag === 2 ? 2 : dictionaryFlag === 3 ? 4 : 0
  if (frameContentSizeFlag !== 0) cursor += frameContentSizeFlag === 1 ? 2 : frameContentSizeFlag === 2 ? 4 : 8
  else if (singleSegment) cursor += 1
  let last = false
  while (!last) {
    if (cursor + 3 > bytes.length) return null
    const blockHeader = bytes.readUIntLE(cursor, 3)
    const blockType = (blockHeader >> 1) & 3
    const blockSize = blockHeader >> 3
    if (blockType === 3 || blockSize > 0x20000) return null
    last = (blockHeader & 1) === 1
    // RLE 块的 Block_Size 是解压后长度，压缩载荷仅 1 字节。
    const payloadSize = blockType === 1 ? 1 : blockSize
    if (cursor + 3 + payloadSize > bytes.length) return null
    cursor += 3 + payloadSize
  }
  if (checksumFlag !== 0) cursor += 4
  return cursor <= bytes.length ? cursor : null
}

const ZSTD_MAGIC = 0xfd2fb528
const SKIPPABLE_MAGIC_MIN = 0x184d2a50
const SKIPPABLE_MAGIC_MAX = 0x184d2a5f

// 多帧输入按帧边界循环解压；帧间可能有 skippable frame，逐帧跳过。UTF-8 跨帧用流式解码器续接。
function* decodedLinesOf(bytes, shouldCancel) {
  if (!Buffer.isBuffer(bytes)) throw new TypeError('decodedLinesOf requires a Buffer')
  const decoder = new TextDecoder('utf-8')
  let cursor = 0
  let frames = 0
  let pending = ''
  let linesSinceCheck = 0
  checkArchiveCancellation({ shouldCancel })
  while (cursor < bytes.length) {
    checkArchiveCancellation({ shouldCancel })
    if (bytes.length - cursor < 4) throw new Error('truncated zstd frame header at byte ' + cursor)
    const magic = bytes.readUInt32LE(cursor)
    if (magic >= SKIPPABLE_MAGIC_MIN && magic <= SKIPPABLE_MAGIC_MAX) {
      if (bytes.length - cursor < 8) throw new Error('truncated skippable frame header at byte ' + cursor)
      const end = cursor + 8 + bytes.readUInt32LE(cursor + 4)
      if (end > bytes.length) throw new Error('truncated skippable frame at byte ' + cursor)
      cursor = end
      checkArchiveCancellation({ shouldCancel })
      continue
    }
    if (magic !== ZSTD_MAGIC) throw new Error('unexpected bytes at byte ' + cursor)
    const end = frameEndAt(bytes, cursor)
    if (end === null) throw new Error('incomplete zstd frame at byte ' + cursor)
    let chunk
    try {
      checkArchiveCancellation({ shouldCancel })
      chunk = zstdDecompressSync(bytes.subarray(cursor, end))
    } catch (error) {
      if (errorCodeOf(error) === 'archive-cancelled') throw error
      throw new Error('zstd frame decode failed at byte ' + cursor + ': ' + (error instanceof Error ? error.message : String(error)))
    }
    checkArchiveCancellation({ shouldCancel })
    frames += 1
    cursor = end
    pending += decoder.decode(chunk, { stream: true })
    let newline = pending.indexOf('\n')
    while (newline !== -1) {
      yield pending.slice(0, newline)
      pending = pending.slice(newline + 1)
      newline = pending.indexOf('\n')
      linesSinceCheck += 1
      if (linesSinceCheck >= 32) {
        linesSinceCheck = 0
        checkArchiveCancellation({ shouldCancel })
      }
    }
  }
  checkArchiveCancellation({ shouldCancel })
  if (frames === 0) throw new Error('no complete zstd frame')
  pending += decoder.decode()
  if (pending !== '') yield pending
  checkArchiveCancellation({ shouldCancel })
}

// ── ④ 事件提取 ──────────────────────────────────────────────────────────────
function finiteNumberOrZero(value) {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : 0
}

function stringOrEmpty(value) {
  return typeof value === 'string' ? value : ''
}

function intOrNull(value) {
  return Number.isInteger(value) && value >= 0 ? value : null
}

function isoOf(epochMs) {
  const value = typeof epochMs === 'number' && Number.isFinite(epochMs) ? epochMs : Date.now()
  return new Date(value).toISOString()
}

// session 事件：会话身份与血缘（id/cwd/agentPreset/delegationDepth/parentSession/origin）。
function sessionMetaOf(event, directoryName) {
  const id = stringOrEmpty(event.id) !== '' ? stringOrEmpty(event.id) : directoryName
  const parentSessionId = stringOrEmpty(event.parentSession)
  const delegationDepth = intOrNull(event.delegationDepth)
  return {
    version: Number.isInteger(event.version) ? event.version : null,
    sessionId: id,
    cwd: stringOrEmpty(event.cwd),
    createdAt: typeof event.createdAt === 'number' && Number.isFinite(event.createdAt) ? event.createdAt : null,
    parentSessionId,
    delegationDepth: delegationDepth === null ? 0 : delegationDepth,
    hasExplicitDepth: delegationDepth !== null,
    agentPreset: stringOrEmpty(event.agentPreset),
    origin: stringOrEmpty(event.origin),
  }
}

// assistant/message 事件：四桶 + model/provider；四桶全 0 的事件与账本折叠口径一致地跳过。
function usageOf(event) {
  const data = event.data
  if (!isPlainObject(data)) return null
  const usage = data.usage
  if (!isPlainObject(usage)) return null
  const tokens = TOKEN_KEYS.map((key) => finiteNumberOrZero(usage[key]))
  let total = 0
  for (const token of tokens) total += token
  if (total === 0) return null
  const message = data.message
  const source = isPlainObject(message) ? message.source : undefined
  return {
    tokens,
    model: isPlainObject(source) ? stringOrEmpty(source.model) : '',
    provider: isPlainObject(source) ? stringOrEmpty(source.provider) : '',
    seq: intOrNull(event.seq),
    ts: isoOf(event.time),
  }
}

// agent-preset/selected 事件：会话中途切换预设时以最后一次为准（多种载荷形状都认，取不到就忽略）。
function presetOfSelectedEvent(event) {
  const candidates = [event.agentPreset, event.preset]
  if (isPlainObject(event.data)) candidates.push(event.data.agentPreset, event.data.preset, event.data.id)
  for (const candidate of candidates) {
    if (typeof candidate === 'string' && candidate !== '') return candidate
  }
  return ''
}

// request/header 事件：parentSession/delegationDepth 的兜底来源（session 事件缺失这两项时才用）。
function lineageOfRequestHeader(event) {
  const data = event.data
  const header = isPlainObject(data) ? data.header : undefined
  if (!isPlainObject(header)) return null
  const parentSessionId = stringOrEmpty(header.parentSession)
  const delegationDepth = intOrNull(header.delegationDepth)
  if (parentSessionId === '' && delegationDepth === null) return null
  return { parentSessionId, delegationDepth }
}

// 单文件扫描：只保留会话元信息与用量事件，其余事件一律丢弃。
function scanLogText(lines, directoryName, shouldCancel) {
  const state = {
    meta: null,
    selectedPreset: '',
    requestHeader: null,
    usageEvents: [],
    parseErrors: 0,
  }
  for (const line of lines) {
    checkArchiveCancellation({ shouldCancel })
    if (line.trim() === '') continue
    const maybeSession = line.includes(EVENT_MARKERS.session)
    const maybeUsage = line.includes(EVENT_MARKERS.usage)
    const maybePreset = line.includes(EVENT_MARKERS.presetSelected)
    const maybeHeader = line.includes(EVENT_MARKERS.requestHeader)
    if (!maybeSession && !maybeUsage && !maybePreset && !maybeHeader) continue
    let event
    try {
      event = JSON.parse(line)
    } catch (error) {
      state.parseErrors += 1
      continue
    }
    if (!isPlainObject(event)) continue
    if (event.type === 'session') {
      if (state.meta === null) state.meta = sessionMetaOf(event, directoryName)
      continue
    }
    if (event.type === 'assistant/message') {
      const usage = usageOf(event)
      if (usage !== null) state.usageEvents.push(usage)
      continue
    }
    if (event.type === 'agent-preset/selected') {
      const preset = presetOfSelectedEvent(event)
      if (preset !== '') state.selectedPreset = preset
      continue
    }
    if (event.type === 'request/header') {
      const lineage = lineageOfRequestHeader(event)
      if (lineage !== null) state.requestHeader = lineage
    }
  }
  checkArchiveCancellation({ shouldCancel })
  return state
}

// ── ⑤⑥ 白名单过滤与身份聚合 ─────────────────────────────────────────────────
function hasOwn(object, key) {
  return Object.prototype.hasOwnProperty.call(object, key)
}

function identityValueOf(value, key) {
  if (key === 'delegationDepth') return Number.isInteger(value) && value >= 0 ? value : ''
  if (key === 'schemaVersion') return value
  return typeof value === 'string' ? value : ''
}

function identityKeyOf(identity) {
  const parts = []
  for (const key of IDENTITY_KEYS) parts.push(identityValueOf(identity[key], key))
  return JSON.stringify(parts)
}

// 血缘根：与 agent-runtime.usageRootOf 同口径（depth 1 直接取 parent；更深的沿 parent 链上溯，
// 链路缺失/成环一律返回空串）。
function rootSessionOf(sessionId, parentSessionId, delegationDepth, parentById) {
  if (parentSessionId === '') return ''
  if (delegationDepth === 1) return parentSessionId
  const seen = new Set([sessionId])
  let currentId = parentSessionId
  for (let level = 0; level < MAX_PARENT_DEPTH; level += 1) {
    if (currentId === '' || seen.has(currentId)) return ''
    seen.add(currentId)
    const parent = parentById.get(currentId)
    if (parent === undefined) return ''
    const nextId = parent.parentSessionId
    if (nextId === '') return currentId
    if (seen.has(nextId)) return ''
    currentId = nextId
  }
  return ''
}

function isChildSession(meta) {
  return meta.delegationDepth > 0 || meta.parentSessionId !== '' || meta.origin === 'subagent'
}

// 角色口径与 agent-runtime.usageContextOf 一致：主会话 main；子会话按预设映射到四角色，其余 child。
function roleOf(meta, child) {
  if (!child) return 'main'
  return hasOwn(USAGE_ROLE_BY_PRESET, meta.agentPreset) ? USAGE_ROLE_BY_PRESET[meta.agentPreset] : 'child'
}

function emptyGroup(identity) {
  return {
    schemaVersion: 2,
    rootSessionId: identity.rootSessionId,
    sessionId: identity.sessionId,
    parentSessionId: identity.parentSessionId,
    agentPreset: identity.agentPreset,
    delegationDepth: identity.delegationDepth,
    role: identity.role,
    model: identity.model,
    provider: identity.provider,
    inputTokens: 0,
    cacheReadTokens: 0,
    cacheWriteTokens: 0,
    outputTokens: 0,
    calls: 0,
    seq: null,
    ts: '',
  }
}

function compareValues(left, right) {
  const a = String(left === undefined || left === null ? '' : left)
  const b = String(right === undefined || right === null ? '' : right)
  return a < b ? -1 : a > b ? 1 : 0
}

function rowSort(a, b) {
  for (const key of IDENTITY_KEYS) {
    const compared = compareValues(a[key], b[key])
    if (compared !== 0) return compared
  }
  return compareValues(a.seq === null ? '' : a.seq, b.seq === null ? '' : b.seq)
}

function addUsageToGroups(groups, meta, usage) {
  const identity = {
    schemaVersion: 2,
    rootSessionId: meta.rootSessionId,
    sessionId: meta.sessionId,
    parentSessionId: meta.parentSessionId,
    agentPreset: meta.agentPreset,
    delegationDepth: meta.delegationDepth,
    role: meta.role,
    model: usage.model,
    provider: usage.provider,
  }
  const groupKey = identityKeyOf(identity)
  let group = groups.get(groupKey)
  if (group === undefined) group = emptyGroup(identity)
  for (let index = 0; index < TOKEN_KEYS.length; index += 1) group[TOKEN_KEYS[index]] += usage.tokens[index]
  group.calls += 1
  if (usage.seq !== null && (group.seq === null || usage.seq >= group.seq)) {
    group.seq = usage.seq
  }
  groups.set(groupKey, group)
}

function allowedOf(allowedPresets) {
  if (allowedPresets === undefined || allowedPresets === null) return ALLOWED_PRESETS
  if (allowedPresets instanceof Set) return [...allowedPresets]
  return Array.isArray(allowedPresets) ? allowedPresets : ALLOWED_PRESETS
}

function scanUsageRowsOf(logFiles, options = {}) {
  const settings = isPlainObject(options) ? options : {}
  const shouldCancel = typeof settings.shouldCancel === 'function' ? settings.shouldCancel : undefined
  checkArchiveCancellation({ shouldCancel })
  const whitelist = new Set(allowedOf(settings.allowedPresets))
  const trackOutcome = settings.trackOutcome === true
  const scanOutcome = trackOutcome ? { failed: false, failedFiles: [], successfulFiles: [] } : null
  const markFailed = (logFile, reason) => {
    if (scanOutcome === null) return
    scanOutcome.failed = true
    scanOutcome.failedFiles.push({ logPath: logFile.logPath, reason })
  }
  const fingerprintStable = (logFile) => {
    if (scanOutcome === null) return true
    if (!Number.isFinite(logFile.size) || !Number.isFinite(logFile.mtimeMs)) {
      markFailed(logFile, 'missing-fingerprint')
      return false
    }
    try {
      const stat = statSync(logFile.logPath)
      if (!stat.isFile() || stat.size !== logFile.size || stat.mtimeMs !== logFile.mtimeMs) {
        markFailed(logFile, 'fingerprint-changed-during-read')
        return false
      }
    } catch (error) {
      markFailed(logFile, 'stat-failed-after-read')
      return false
    }
    return true
  }
  const stats = { files: 0, sessions: 0, rows: 0, skipped: 0, enumerationSkipped: 0, whitelistSkipped: 0, decodeFailed: 0, unsupported: 0, parseErrors: 0 }
  const scanned = []
  const parentById = new Map(Array.isArray(settings.parentSessions) ? settings.parentSessions.map((item) => [item.sessionId, item]) : [])
  for (const logFile of logFiles) {
    checkArchiveCancellation({ shouldCancel })
    stats.files += 1
    let state
    try { state = scanLogText(decodedLinesOf(readFileSync(logFile.logPath), shouldCancel), logFile.sessionDirectory, shouldCancel) } catch (error) {
      if (errorCodeOf(error) === 'archive-cancelled') throw error
      stats.decodeFailed += 1
      markFailed(logFile, 'decode-failed')
      continue
    }
    checkArchiveCancellation({ shouldCancel })
    stats.parseErrors += state.parseErrors
    if (trackOutcome && state.parseErrors > 0) { markFailed(logFile, 'event-parse-errors'); continue }
    const meta = state.meta
    if (meta === null || (meta.version !== null && meta.version !== SUPPORTED_SESSION_VERSION)) {
      stats.unsupported += 1
      markFailed(logFile, meta === null ? 'missing-session-metadata' : 'unsupported-session-version')
      continue
    }
    if (!fingerprintStable(logFile)) continue
    stats.sessions += 1
    const agentPreset = state.selectedPreset !== '' ? state.selectedPreset : meta.agentPreset
    const lineage = state.requestHeader
    const parentSessionId = meta.parentSessionId !== '' ? meta.parentSessionId : lineage === null ? '' : lineage.parentSessionId
    const delegationDepth = meta.hasExplicitDepth ? meta.delegationDepth : lineage !== null && lineage.delegationDepth !== null ? lineage.delegationDepth : 0
    const resolved = { ...meta, delegationDepth, parentSessionId, agentPreset }
    parentById.set(resolved.sessionId, resolved)
    scanned.push({ meta: resolved, usageEvents: state.usageEvents, mtimeMs: logFile.mtimeMs })
    if (scanOutcome !== null) scanOutcome.successfulFiles.push(logFile.logPath)
  }
  const groups = new Map()
  for (const session of scanned) {
    checkArchiveCancellation({ shouldCancel })
    const meta = session.meta
    if (!whitelist.has(meta.agentPreset)) { stats.skipped += 1; stats.whitelistSkipped += 1; continue }
    if (session.usageEvents.length === 0) continue
    const child = isChildSession(meta)
    const identityMeta = { ...meta, role: roleOf(meta, child), rootSessionId: child ? rootSessionOf(meta.sessionId, meta.parentSessionId, meta.delegationDepth, parentById) : meta.sessionId }
    for (const usage of session.usageEvents) {
      checkArchiveCancellation({ shouldCancel })
      addUsageToGroups(groups, identityMeta, usage)
    }
    for (const group of groups.values()) if (group.sessionId === meta.sessionId && group.ts !== isoOf(session.mtimeMs)) group.ts = isoOf(session.mtimeMs)
  }
  const rows = [...groups.values()].map((group) => {
    const copy = { ...group }
    if (copy.seq === null) copy.seq = 0
    return copy
  }).sort(rowSort)
  stats.rows = rows.length
  const result = { rows, stats }
  if (scanOutcome !== null) result.scanOutcome = scanOutcome
  checkArchiveCancellation({ shouldCancel })
  return result
}

// 全量公开扫描保持稳定签名，供 step-99 确定性对拍使用。
export function scanUsageRows(options = {}) {
  const settings = isPlainObject(options) ? options : {}
  const enumeration = enumerateSessionLogs({ hostRoot: settings.hostRoot, shouldCancel: settings.shouldCancel })
  const logFiles = []
  for (const file of enumeration.logFiles) {
    try { const stat = statSync(file.logPath); if (stat.isFile()) logFiles.push({ ...file, size: stat.size, mtimeMs: stat.mtimeMs }) } catch (error) { /* 文件枚举后消失时略过 */ }
  }
  const result = scanUsageRowsOf(logFiles, settings)
  result.stats.skipped += enumeration.skippedEntries
  result.stats.enumerationSkipped += enumeration.skippedEntries
  return result
}

function firstFrameSessionOf(bytes, directoryName) {
  const empty = { sessionId: directoryName, preset: '', parentSessionId: '', delegationDepth: 0 }
  try {
    let start = 0
    if (bytes.length < 4) return empty
    const magic = bytes.readUInt32LE(0)
    if (magic >= SKIPPABLE_MAGIC_MIN && magic <= SKIPPABLE_MAGIC_MAX) {
      if (bytes.length < 8) return empty
      start = 8 + bytes.readUInt32LE(4)
    }
    if (start + 4 > bytes.length || bytes.readUInt32LE(start) !== ZSTD_MAGIC) return empty
    const end = frameEndAt(bytes, start)
    if (end === null) return empty
    const lines = zstdDecompressSync(bytes.subarray(start, end)).toString('utf8').split(/\r?\n/)
    let sessionId = directoryName
    let preset = ''
    let parentSessionId = ''
    let delegationDepth = 0
    let hasExplicitDepth = false
    let requestHeader = null
    for (const line of lines) {
      if (!line.includes(EVENT_MARKERS.session) && !line.includes(EVENT_MARKERS.presetSelected) && !line.includes(EVENT_MARKERS.requestHeader)) continue
      try {
        const event = JSON.parse(line)
        if (event.type === 'session') {
          sessionId = stringOrEmpty(event.id) || directoryName
          preset = stringOrEmpty(event.agentPreset)
          parentSessionId = stringOrEmpty(event.parentSession)
          hasExplicitDepth = intOrNull(event.delegationDepth) !== null
          delegationDepth = hasExplicitDepth ? intOrNull(event.delegationDepth) : 0
        } else if (event.type === 'agent-preset/selected') {
          const selected = presetOfSelectedEvent(event)
          if (selected !== '') preset = selected
        } else if (event.type === 'request/header') requestHeader = lineageOfRequestHeader(event)
      } catch (error) { /* malformed first-frame event is ignored */ }
    }
    if (parentSessionId === '' && requestHeader !== null) parentSessionId = requestHeader.parentSessionId
    if (!hasExplicitDepth && requestHeader !== null && requestHeader.delegationDepth !== null) delegationDepth = requestHeader.delegationDepth
    return { sessionId, preset, parentSessionId, delegationDepth }
  } catch (error) { return empty }
}

function scanSessionPresets({ hostRoot, modePath, fsOps, shouldCancel }) {
  const operations = mergedFsOps(fsOps)
  checkArchiveCancellation({ shouldCancel })
  let cached = new Map()
  let cacheFingerprintUsable = false
  let cacheNeedsRepair = false
  try {
    checkArchiveCancellation({ shouldCancel })
    const parsed = JSON.parse(textOfBytes(operations.readFileSync(modePath)))
    const rawEntries = parsed !== null && parsed.schemaVersion === SESSION_PRESETS_SCHEMA_VERSION && Array.isArray(parsed.entries) ? parsed.entries : null
    const validEntries = rawEntries !== null && rawEntries.every((entry) => isPlainObject(entry)
      && typeof entry.logPath === 'string'
      && typeof entry.sessionId === 'string'
      && typeof entry.preset === 'string'
      && typeof entry.parentSessionId === 'string'
      && Number.isInteger(entry.delegationDepth)
      && entry.delegationDepth >= 0
      && Number.isFinite(entry.size)
      && Number.isFinite(entry.mtimeMs))
    if (validEntries) {
      cached = new Map(rawEntries.map((entry) => [entry.logPath, entry]))
      cacheFingerprintUsable = cached.size === rawEntries.length
      cacheNeedsRepair = !cacheFingerprintUsable
    } else cacheNeedsRepair = true
  } catch (error) {
    if (errorCodeOf(error) === 'archive-cancelled') throw error
    cacheNeedsRepair = true
  }
  checkArchiveCancellation({ shouldCancel })
  const enumeration = enumerateSessionLogs({ hostRoot, shouldCancel })
  const entries = []
  const logFiles = []
  const stats = { files: 0, sessions: 0, cacheHits: 0, decoded: 0, skipped: enumeration.skippedEntries }
  for (const file of enumeration.logFiles) {
    checkArchiveCancellation({ shouldCancel })
    try {
      const stat = statSync(file.logPath)
      if (!stat.isFile()) continue
      const prior = cached.get(file.logPath)
      let identity
      const priorHasLineage = prior && typeof prior.parentSessionId === 'string' && Number.isInteger(prior.delegationDepth) && prior.delegationDepth >= 0
      const fingerprintMatches = prior !== undefined && prior.size === stat.size && prior.mtimeMs === stat.mtimeMs && priorHasLineage
      if (fingerprintMatches) { identity = { sessionId: prior.sessionId, preset: prior.preset, parentSessionId: prior.parentSessionId, delegationDepth: prior.delegationDepth }; stats.cacheHits += 1 }
      else {
        checkArchiveCancellation({ shouldCancel })
        identity = firstFrameSessionOf(readFileSync(file.logPath), file.sessionDirectory)
        checkArchiveCancellation({ shouldCancel })
        stats.decoded += 1
        cacheNeedsRepair = true
      }
      stats.sessions += 1
      const entry = { logPath: file.logPath, sessionId: identity.sessionId, preset: identity.preset, parentSessionId: identity.parentSessionId, delegationDepth: identity.delegationDepth, size: stat.size, mtimeMs: stat.mtimeMs }
      entries.push(entry)
      logFiles.push({ ...file, size: stat.size, mtimeMs: stat.mtimeMs, sessionId: entry.sessionId, preset: entry.preset, parentSessionId: entry.parentSessionId, delegationDepth: entry.delegationDepth, fingerprintChanged: cacheFingerprintUsable && !fingerprintMatches })
      stats.files += 1
    } catch (error) {
      if (errorCodeOf(error) === 'archive-cancelled') throw error
      stats.skipped += 1
      cacheNeedsRepair = true
    }
    checkArchiveCancellation({ shouldCancel })
  }
  if (cacheFingerprintUsable && cached.size !== entries.length) cacheNeedsRepair = true
  checkArchiveCancellation({ shouldCancel })
  if (cacheFingerprintUsable) {
    const currentPaths = new Set(entries.map((entry) => entry.logPath))
    for (const logPath of cached.keys()) if (!currentPaths.has(logPath)) { cacheNeedsRepair = true; break }
  }
  checkArchiveCancellation({ shouldCancel })
  return { entries, logFiles, stats, cacheHealthy: !cacheNeedsRepair, cacheNeedsRepair }
}

// ── ③a 归档读侧：严格解析、身份、分组、单调性覆盖（由旧归档模块迁入）──────
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
  let schemaDocCount = 0
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
    // 说明行只允许唯一一条且必须在首行：重复或错位一律判失败，避免说明行混进数据行改变统计口径。
    if (isSchemaDocRow(row)) {
      schemaDocCount += 1
      if (schemaDocCount > 1 || rows.length !== 0) {
        throw archiveError('schema-doc-misplaced', source + ' 第' + lineNumber + '行说明行位置非法（说明行只能唯一一条出现在首行）；发布前未改写')
      }
      if (typeof check === 'function') check()
      continue
    }
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

function identityKeyOfRow(row) {
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

// 扫描行还原分组：四桶与 calls 取扫描值，maxSeq/latestTs 取扫描水位与最新事件时间。
function groupFromScanRow(row) {
  const group = emptyGroupOf(row)
  for (const key of TOKEN_KEYS) group[key] = tokenNumber(row, key)
  const seq = Number.isInteger(row.seq) && row.seq >= 0 ? row.seq : null
  if (seq !== null) {
    group._latestSeq = seq
    group.maxSeq = seq
    group.latestTs = typeof row.ts === 'string' && row.ts !== '' ? row.ts : ''
  }
  group.calls = Number.isInteger(row.calls) && row.calls >= 0 ? row.calls : null
  return group
}

function tokenTotalOf(group) {
  let total = 0
  for (const key of TOKEN_KEYS) total += tokenNumber(group, key)
  return total
}

// 覆盖式更新：现有 archive 行作基线，扫描行整体覆盖（四桶、calls、ts、seq 全用本次扫描值）。
// 单调性保护：本次扫描的 calls 或四桶合计小于基线时保留旧值并登记一条告警，绝不回退已记账消耗；
// 扫描里已不存在的身份（日志被删/迁移）原样保留，不删除 archive 行。
function mergedArchiveGroups(archiveRows, scanRows, options = {}) {
  const refreshRegressedTimestamp = isPlainObject(options) && options.refreshRegressedTimestamp === true
  const shouldCancel = isPlainObject(options) && typeof options.shouldCancel === 'function' ? options.shouldCancel : undefined
  checkArchiveCancellation({ shouldCancel })
  const groups = new Map()
  for (const row of Array.isArray(archiveRows) ? archiveRows : []) {
    checkArchiveCancellation({ shouldCancel })
    groups.set(identityKeyOfRow(row), groupFromArchiveRow(row))
  }
  const monotonicWarnings = []
  for (const scanRow of Array.isArray(scanRows) ? scanRows : []) {
    checkArchiveCancellation({ shouldCancel })
    const groupKey = identityKeyOfRow(scanRow)
    const current = groups.get(groupKey)
    if (current === undefined) {
      groups.set(groupKey, groupFromScanRow(scanRow))
      continue
    }
    // archive 行按归档契约只落 15 键、永不落 calls，故此处 current 只能来自 archive、currentCalls 恒为 null；
    // 下面这一半 calls 回退条件恒假，仅为外部注入重复扫描行的防御性保留。
    const scanCalls = Number.isInteger(scanRow.calls) && scanRow.calls >= 0 ? scanRow.calls : null
    const currentCalls = Number.isInteger(current.calls) && current.calls >= 0 ? current.calls : null
    const regressed = tokenTotalOf(scanRow) < tokenTotalOf(current)
      || (scanCalls !== null && currentCalls !== null && scanCalls < currentCalls)
    if (regressed) {
      monotonicWarnings.push({
        sessionId: typeof scanRow.sessionId === 'string' ? scanRow.sessionId : '',
        agentPreset: typeof scanRow.agentPreset === 'string' ? scanRow.agentPreset : '',
        role: typeof scanRow.role === 'string' ? scanRow.role : '',
        model: typeof scanRow.model === 'string' ? scanRow.model : '',
      })
      if (refreshRegressedTimestamp && typeof scanRow.ts === 'string' && scanRow.ts !== '') current.latestTs = scanRow.ts
    } else {
      for (const tokenKey of TOKEN_KEYS) current[tokenKey] = tokenNumber(scanRow, tokenKey)
      current.calls = scanCalls
      if (Number.isInteger(scanRow.seq) && scanRow.seq >= 0) {
        current._latestSeq = scanRow.seq
        current.maxSeq = scanRow.seq
      }
      current.latestTs = typeof scanRow.ts === 'string' && scanRow.ts !== '' ? scanRow.ts : current.latestTs
    }
  }
  checkArchiveCancellation({ shouldCancel })
  return { groups, monotonicWarnings }
}

function finalizedGroups(groups) {
  return [...groups.values()].sort(groupSort).map((group) => {
    const copy = { ...group }
    delete copy._latestSeq
    return copy
  })
}

function assertUniqueArchiveRows(rows, source, check) {
  const seen = new Set()
  for (const row of Array.isArray(rows) ? rows : []) {
    if (check !== undefined) check()
    const key = identityKeyOfRow(row)
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
  const lines = [SCHEMA_DOC_LINE]
  for (const group of groups) {
    if (typeof check === 'function') check()
    lines.push(JSON.stringify(archiveRowOf(group)))
    if (typeof check === 'function') check()
  }
  return lines.join('\n') + '\n'
}

function ensureLedgerDirectory(pathContext, purpose, fsOps) {
  const target = resolveHostPath(pathContext, LEDGER_DIRECTORY, { purpose })
  prepareWriteTarget(pathContext, target, { expectedType: 'any', purpose })
  // 目录创建优先走调用方注入的 fsOps（与同文件其它写操作同口径），未注入或缺失时回落模块级 mkdirSync。
  const makeDirectory = isPlainObject(fsOps) && typeof fsOps.mkdirSync === 'function' ? fsOps.mkdirSync : mkdirSync
  makeDirectory(target.path, { recursive: true })
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
// ── ③ 写入：原子发布、简易互斥、聚合与发布 ──────────────────────────────────
// 单目标原子发布：写临时文件 → rename 覆盖 archive。rename 是同目录原子替换，读者要么看到完整旧版本
// 要么看到完整新版本；失败只可能发生在 rename 之前，既有 archive 原样保留（不再备份/回滚）。
function publishArchive({ archivePath, archiveText, fsOps, checkBudget, pathContext, purpose }) {
  const id = process.pid + '-' + Date.now() + '-' + randomUUID()
  const temp = join(dirname(archivePath), basename(archivePath) + '.tmp-' + id)
  for (const target of [archivePath, temp]) {
    prepareWriteTarget(pathContext, resolveHostPath(pathContext, target, { purpose }), { expectedType: 'file', purpose })
  }
  try {
    fsOps.writeFileSync(temp, archiveText, 'utf8')
    checkBudget()
    fsOps.renameSync(temp, archivePath)
    // rename 已是 try 的最后一步：其后无可失败步骤，catch 只可能在 rename 之前触发，既有 archive 必未被改写。
  } catch (error) {
    try { fsOps.unlinkSync(temp) } catch (cleanupError) { /* 临时文件不存在或不可清理时保留现场 */ }
    throw archiveError(errorCodeOf(error) || 'publish-failed', errorMessageOf(error) + '；发布前未改写既有 archive')
  }
}

// 简易互斥（改造11）：一次 O_EXCL 创建 <archive>.lock。Windows 下 'wx' 即 O_CREAT|O_EXCL|O_WRONLY，
// 创建成功即独占；拿不到即视为另一实例正在写账本——本次启动扫描跳过并留痕，不等待、不接管死锁、不删他人锁。
// 锁只挂在启动路径（startupArchive）上：直调入口 archiveLedger 只做给定路径的聚合与发布，不再承担进程互斥。
function acquireArchiveLock(archivePath) {
  const lockPath = archivePath + '.lock'
  let fd
  try {
    fd = openSync(lockPath, 'wx')
  } catch (error) {
    if (errorCodeOf(error) !== 'EEXIST') return { acquired: false, lockPath, error }
    return { acquired: false, lockPath }
  }
  try {
    writeSync(fd, JSON.stringify({ pid: process.pid, token: randomUUID(), createdAt: new Date().toISOString() }))
  } catch (error) {
    // owner 元信息只是现场线索：写不进去也不影响互斥语义，锁已独占创建。
  } finally {
    try { closeSync(fd) } catch (error) { /* 关闭失败同样不影响互斥语义 */ }
  }
  return { acquired: true, lockPath }
}

// 释放只用同一路径 unlink（try/finally 内调用）：锁是本次 O_EXCL 独占创建的，失败只留现场，绝不抛给启动路径。
function releaseArchiveLock(fsOps, lock) {
  try { fsOps.unlinkSync(lock.lockPath) } catch (error) { /* 释放失败不影响本次归档结果 */ }
}

// 直调入口（改造11 M9 恢复的精简版）：给定 archive 路径的「聚合与发布」，与 startupArchive 共用本实现。
// 语义：严格读现有 archive（可不存在）→ 取本次身份行（options.rows 注入优先，否则现场扫描 host 根下的会话日志）
// → 按身份覆盖式更新 + 单调性保护 → 写说明行 → temp→rename 原子发布。
// 不含 active 参数、不清空 active、无双文件合并、无逆序回滚、无 parse-active 阶段；预算阶段只有
// start／parse-archive／unique／merge／serialize／publish。失败一律抛出带 code 的 Error；
// 成功返回 { status, archivePath, rows, groups, scannedRows, scannedFiles, scannedSessions, monotonicWarnings, archiveBytes }。
export function archiveLedger(archivePath, options = {}) {
  const settings = isPlainObject(options) ? options : {}
  if (typeof archivePath !== 'string' || archivePath === '') {
    throw archiveError('invalid-archive-path', '归档目标是空路径')
  }
  const fsOps = mergedFsOps(settings.fsOps)
  const purpose = typeof settings.purpose === 'string' && settings.purpose !== '' ? settings.purpose : LEDGER_PURPOSE
  const pathContext = settings.pathContext !== undefined && settings.pathContext !== null ? settings.pathContext : {}
  // H/W 双根授权：目录可建、archive 可写可读；直调也先过授权，避免绕过启动路径的写目标校验。
  try {
    ensureLedgerDirectory(pathContext, purpose, fsOps)
    authorizeWriteTarget(pathContext, archivePath, purpose)
    authorizeReadIfPresent(pathContext, archivePath, purpose)
  } catch (error) {
    throw archiveError(errorCodeOf(error) || 'path-not-authorized', '启动归档目标未获 H/W 双根授权：' + errorMessageOf(error))
  }
  const budgetMs = Number.isFinite(settings.budgetMs) && settings.budgetMs >= 0 ? settings.budgetMs : STARTUP_ARCHIVE_BUDGET_MS
  const startedAt = nowOf(settings.clock)
  const deadline = startedAt + budgetMs
  const onCheck = typeof settings.onCheck === 'function' ? settings.onCheck : undefined
  let currentPhase = 'start'
  const checkBudget = () => {
    checkArchiveCancellation(settings)
    if (onCheck !== undefined && onCheck(currentPhase) === true) {
      throw archiveError('budget-timeout', '启动归档预算超时（阶段' + currentPhase + '，约' + budgetMs + 'ms），发布前未改写')
    }
    if (nowOf(settings.clock) >= deadline) {
      throw archiveError('budget-timeout', '启动归档预算超时（约' + budgetMs + 'ms），发布前未改写')
    }
  }
  currentPhase = 'start'
  checkBudget()
  const archiveRead = optionalRead(fsOps, archivePath)
  currentPhase = 'parse-archive'
  checkBudget()
  const archiveRows = parseStrictLedgerText(textOfBytes(archiveRead.bytes), archivePath, checkBudget)
  currentPhase = 'unique'
  checkBudget()
  assertUniqueArchiveRows(archiveRows, archivePath, checkBudget)
  currentPhase = 'merge'
  let scanRows
  if (Array.isArray(settings.rows)) {
    scanRows = settings.rows
  } else {
    const hostRoot = hostRootOf(pathContext)
    if (hostRoot === '') throw archiveError('no-host-root', '归档缺少明确 host 根，无法扫描会话日志')
    scanRows = scanUsageRows({ hostRoot, shouldCancel: settings.shouldCancel }).rows
  }
  const merged = mergedArchiveGroups(archiveRows, scanRows, { refreshRegressedTimestamp: settings.scanSource === 'startup-file', shouldCancel: settings.shouldCancel })
  currentPhase = 'serialize'
  checkBudget()
  const archiveText = archiveTextOf(finalizedGroups(merged.groups), checkBudget)
  currentPhase = 'publish'
  checkBudget()
  publishArchive({ archivePath, archiveText, fsOps, checkBudget, pathContext, purpose })
  if (merged.monotonicWarnings.length > 0) {
    try {
      const labels = merged.monotonicWarnings.map((item) => item.sessionId + '/' + (item.agentPreset !== '' ? item.agentPreset : '-') + '/' + (item.role !== '' ? item.role : '-') + '/' + (item.model !== '' ? item.model : '-'))
      console.warn('[dsh-extra-plan] usage archive monotonic guard: ' + merged.monotonicWarnings.length + ' 个身份本次扫描小于 archive 现有值，保留旧值不覆盖：' + labels.join(', '))
    } catch (warnError) {
      // warning 通道不可用时忽略。
    }
  }
  const scanStats = isPlainObject(settings.scanStats) ? settings.scanStats : null
  return {
    status: 'archived',
    archivePath,
    rows: merged.groups.size,
    // groups 是 rows 的兼容别名：同值同源，保留只为不牵动既有 step-00:1518 的双断言；新消费者请只用 rows。
    groups: merged.groups.size,
    scannedRows: scanRows.length,
    scannedFiles: scanStats !== null && Number.isInteger(scanStats.files) ? scanStats.files : null,
    scannedSessions: scanStats !== null && Number.isInteger(scanStats.sessions) ? scanStats.sessions : null,
    scannedUsageSessions: scanStats !== null && Number.isInteger(scanStats.usageSessions) ? scanStats.usageSessions : scanStats !== null && Number.isInteger(scanStats.sessions) ? scanStats.sessions : null,
    monotonicWarnings: merged.monotonicWarnings.length,
    archiveBytes: Buffer.byteLength(archiveText, 'utf8'),
  }
}

// 跳过也要留痕：扫描失败/无归档范围一律在 archive-failed.log 留一行，避免被静默吞掉。
function skipWithDiagnostic(pathContext, fsOps, reason, message, purpose) {
  try {
    console.warn('[dsh-extra-plan] startup archive skipped: ' + reason + ': ' + message)
  } catch (warnError) {
    // warning 通道不可用时忽略。
  }
  recordDiagnostic(pathContext, fsOps, reason, message, purpose)
  return { status: 'skipped', reason }
}

// ── ④ 启动入口 ───────────────────────────────────────────────────────────────
// startupArchive 保持同步 API；后台调用方由 Worker 调度，模式层白名单过滤后按日志 mtime 增量判定。
// ts 使用会话日志文件时间点；聚合、单调性、说明行与账本原子发布仍由 archiveLedger 统一完成。
function publishSessionPresetCache({ pathContext, modePath, entries, fsOps, purpose, shouldCancel }) {
  const id = process.pid + '-' + Date.now() + '-' + randomUUID()
  const temp = modePath + '.tmp-' + id
  try {
    checkArchiveCancellation({ shouldCancel })
    authorizeWriteTarget(pathContext, temp, purpose)
    fsOps.writeFileSync(temp, JSON.stringify({ schemaVersion: SESSION_PRESETS_SCHEMA_VERSION, entries }), 'utf8')
    checkArchiveCancellation({ shouldCancel })
    fsOps.renameSync(temp, modePath)
    return true
  } catch (error) {
    try { fsOps.unlinkSync(temp) } catch (cleanupError) { /* leave failed temp for diagnosis */ }
    if (errorCodeOf(error) === 'archive-cancelled') throw error
    try { console.warn('[dsh-extra-plan] session preset cache publish failed: ' + errorMessageOf(error)) } catch (warnError) { /* warning channel unavailable */ }
    return false
  }
}

function upToDateArchiveResult({ archivePath, archiveRead, archiveRows, mode, reason, cacheRepaired }) {
  return {
    status: 'up-to-date',
    reason,
    archivePath,
    rows: archiveRows.length,
    groups: archiveRows.length,
    scannedRows: 0,
    scannedFiles: 0,
    scannedSessions: mode.stats.sessions,
    scannedUsageSessions: 0,
    monotonicWarnings: 0,
    archiveBytes: archiveRead.bytes.length,
    cacheRepaired: cacheRepaired === true,
  }
}

function startupArchiveUnsafe(pathContext, options) {
  const fsOps = mergedFsOps(options.fsOps)
  const shouldCancel = typeof options.shouldCancel === 'function' ? options.shouldCancel : undefined
  checkArchiveCancellation({ shouldCancel })
  const purpose = LEDGER_PURPOSE
  const hostRoot = hostRootOf(pathContext)
  if (hostRoot === '') {
    try { console.warn('[dsh-extra-plan] startup archive skipped: no-host-root') } catch (warnError) { /* warning channel unavailable */ }
    return { status: 'skipped', reason: 'no-host-root' }
  }
  const archivePath = typeof options.archivePath === 'string' && options.archivePath !== ''
    ? options.archivePath
    : resolveHostPath(pathContext, join(LEDGER_DIRECTORY, ARCHIVE_FILE_NAME), { purpose }).path
  const modePath = resolveHostPath(pathContext, join(LEDGER_DIRECTORY, SESSION_PRESETS_FILE_NAME), { purpose }).path
  try {
    ensureLedgerDirectory(pathContext, purpose, fsOps)
    authorizeWriteTarget(pathContext, archivePath, purpose)
    authorizeReadIfPresent(pathContext, archivePath, purpose)
    authorizeWriteTarget(pathContext, modePath, purpose)
    authorizeReadIfPresent(pathContext, modePath, purpose)
  } catch (error) {
    return reportFailure(pathContext, fsOps, archiveError(errorCodeOf(error) || 'path-not-authorized', '启动归档目标未获 H/W 双根授权：' + errorMessageOf(error)), purpose)
  }
  let mode
  try { mode = scanSessionPresets({ hostRoot, modePath, fsOps, shouldCancel }) }
  catch (error) {
    if (errorCodeOf(error) === 'archive-cancelled') throw error
    return skipWithDiagnostic(pathContext, fsOps, 'scan-failed', '扫描会话日志失败：' + errorMessageOf(error), purpose)
  }
  const whitelist = new Set(ALLOWED_PRESETS)
  const allowed = mode.logFiles.filter((file) => whitelist.has(file.preset))
  const archiveRead = optionalRead(fsOps, archivePath)
  let archiveRows = []
  let archiveValid = true
  if (archiveRead.exists) {
    try {
      checkArchiveCancellation({ shouldCancel })
      archiveRows = parseStrictLedgerText(textOfBytes(archiveRead.bytes), archivePath)
      checkArchiveCancellation({ shouldCancel })
      assertUniqueArchiveRows(archiveRows, archivePath)
    } catch (error) {
      if (errorCodeOf(error) === 'archive-cancelled') throw error
      archiveValid = false
    }
  }
  const rowsBySession = new Map()
  for (const row of archiveRows) {
    checkArchiveCancellation({ shouldCancel })
    const group = rowsBySession.get(row.sessionId) || []
    group.push(Date.parse(row.ts))
    rowsBySession.set(row.sessionId, group)
  }
  const changed = allowed.filter((file) => {
    checkArchiveCancellation({ shouldCancel })
    const timestamps = rowsBySession.get(file.sessionId)
    const fileMtimeMs = new Date(file.mtimeMs).getTime()
    return !archiveRead.exists || !archiveValid || file.fingerprintChanged === true || !timestamps || !timestamps.some((timestamp) => timestamp === fileMtimeMs)
  })
  const noChangedLogs = archiveRead.exists && archiveValid && changed.length === 0
  checkArchiveCancellation({ shouldCancel })
  if (noChangedLogs && mode.cacheNeedsRepair !== true) {
    return upToDateArchiveResult({ archivePath, archiveRead, archiveRows, mode, reason: 'no-changed-logs', cacheRepaired: false })
  }
  if (noChangedLogs) {
    const repairLock = acquireArchiveLock(archivePath)
    if (repairLock.acquired !== true) {
      if (repairLock.error !== undefined) return reportFailure(pathContext, fsOps, archiveError(errorCodeOf(repairLock.error) || 'lock-failed', '账本锁创建失败：' + errorMessageOf(repairLock.error)), purpose)
      return skipWithDiagnostic(pathContext, fsOps, 'lock-busy', '另一实例正在修复账本模式缓存，本次启动归档跳过', purpose)
    }
    let cacheRepaired
    try { cacheRepaired = publishSessionPresetCache({ pathContext, modePath, entries: mode.entries, fsOps, purpose, shouldCancel }) }
    finally { releaseArchiveLock(fsOps, repairLock) }
    if (cacheRepaired !== true) return { status: 'skipped', reason: 'cache-repair-failed', archivePath }
    return upToDateArchiveResult({ archivePath, archiveRead, archiveRows, mode, reason: 'cache-repaired', cacheRepaired: true })
  }
  const parentSessions = mode.logFiles.map((file) => ({
    sessionId: file.sessionDirectory,
    parentSessionId: file.parentSessionId,
    delegationDepth: file.delegationDepth,
  }))
  checkArchiveCancellation({ shouldCancel })
  const scan = scanUsageRowsOf(changed, { parentSessions, trackOutcome: true, shouldCancel })
  if (scan.scanOutcome !== undefined && scan.scanOutcome.failed === true) {
    const failedFiles = scan.scanOutcome.failedFiles.length
    return skipWithDiagnostic(pathContext, fsOps, 'scan-failed', '本轮扫描有' + failedFiles + '个日志未完整解码或指纹不稳定，保留既有archive与模式缓存并等待重试', purpose)
  }
  const usageSessions = scan.stats.sessions
  scan.stats.usageSessions = usageSessions
  scan.stats.sessions = mode.stats.sessions
  scan.stats.skipped += mode.stats.skipped
  scan.stats.enumerationSkipped += mode.stats.skipped
  scan.stats.files = allowed.length
  // Keep all enumerated sessions in parent resolution, while decoding only changed whitelisted logs.
  checkArchiveCancellation({ shouldCancel })
  const lock = acquireArchiveLock(archivePath)
  if (lock.acquired !== true) {
    if (lock.error !== undefined) return reportFailure(pathContext, fsOps, archiveError(errorCodeOf(lock.error) || 'lock-failed', '账本锁创建失败：' + errorMessageOf(lock.error)), purpose)
    return skipWithDiagnostic(pathContext, fsOps, 'lock-busy', '另一实例正在写账本，本次启动归档跳过', purpose)
  }
  let result
  let failure
  try {
    result = archiveLedger(archivePath, { ...options, fsOps, pathContext, purpose, scanSource: 'startup-file', rows: scan.rows, scanStats: scan.stats })
    const cacheRepaired = publishSessionPresetCache({ pathContext, modePath, entries: mode.entries, fsOps, purpose })
    result = { ...result, cacheRepaired }
  } catch (error) { failure = error }
  finally { releaseArchiveLock(fsOps, lock) }
  if (failure !== undefined) {
    if (errorCodeOf(failure) === 'archive-cancelled') throw failure
    return reportFailure(pathContext, fsOps, failure, purpose)
  }
  return result
}

// 启动归档唯一入口：同步API由settings Worker调用，返回带 status 的结构化结果供调用方留痕；
// 任何异常都在内部消化，绝不向调用方抛出。
export function startupArchive(pathContext, options = {}) {
  const settings = isPlainObject(options) ? options : {}
  try {
    return startupArchiveUnsafe(pathContext, settings)
  } catch (error) {
    const reason = errorCodeOf(error) || 'archive-failed'
    if (reason === 'archive-cancelled') return { status: 'cancelled', reason: 'cancel-requested' }
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
