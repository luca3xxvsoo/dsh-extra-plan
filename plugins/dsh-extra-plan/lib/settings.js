// dsh-extra-plan-settings 的唯一全局管理入口。
// settings 行 config 是全部 10 个权威值的载体；gateWords 作为兼容数据同样由该 owner 严格保留。
// 本入口统一拥有 settings/API/carrier、旧值迁移与 profileSync；AgentPreset 仅由 preset-sync 初始/结构路径管理。
// 两项宿主设置只从权威值派生到内存 definition，不再写独立公开投影行。

import { createHash, randomUUID } from 'node:crypto'
import { readFileSync, existsSync } from 'node:fs'
import { isDeepStrictEqual } from 'node:util'
import z from '@deepseek-ai/schemastery'
import {
  HOST_ROW_SETTING_DEFINITIONS,
  SETTING_DEFINITIONS,
  SETTINGS_ROW_ID,
  createDefaultSettings,
  normalizeSettingValue,
  readPath,
  validateSettingValue,
} from './preset-settings.js'
import {
  effectiveRowConfig,
  mountPresetSync,
  resolveUnifiedConfig,
  restateSettingsConfig,
} from './preset-sync.js'
import { createQqbotSettingsSynchronizer, stableSnapshotHash } from './qqbot-settings-sync.js'
import { parsePresetYaml, rowsByIdWithPath } from './preset-yaml.js'
import { GATE_WORD_FIELDS, validateGateWords } from './gate-words.js'

export const name = 'dsh-extra-plan-settings'
export const inject = []

const CLIENT_CARRIER_ENTRY_ID = 'dsh-extra-plan-client-carrier'
const carrierByLoader = new WeakMap()
function mountClientCarrier(child) {
  const loader = typeof child.get === 'function' ? child.get('loader') : child.loader
  const Group = loader !== undefined && loader !== null && loader.builtins !== undefined ? loader.builtins.group : undefined
  if (loader === undefined || loader === null || typeof Group !== 'function') {
    console.warn('[dsh-extra-plan] 宿主未提供 Loader Group，Client carrier 未挂载')
    return undefined
  }
  let shared = carrierByLoader.get(loader)
  if (shared === undefined) {
    const fiber = child.plugin(Group, [{
      id: CLIENT_CARRIER_ENTRY_ID,
      name: new URL('./client-carrier.js', import.meta.url).href,
    }])
    shared = { fiber, refs: 0 }
    carrierByLoader.set(loader, shared)
  }
  shared.refs += 1
  let released = false
  return () => {
    if (released) return undefined
    released = true
    shared.refs -= 1
    if (shared.refs === 0) {
      carrierByLoader.delete(loader)
      const fiber = shared.fiber
      shared.fiber = undefined
      return fiber.dispose()
    }
    return undefined
  }
}

/** descriptor scalarType → schemastery 字段；合同负责类型/默认值，settings 只负责宿主 schema 链。 */
function schemaField(definition) {
  let field
  if (definition.scalarType === 'boolean') field = z.boolean()
  else if (definition.scalarType === 'integer') field = z.number().step(1).min(1)
  else field = z.string()
  return field.default(definition.defaultValue).volatile()
}

/** 10 项 settings 全局行 Config；volatile 字段由官方 ConfigForms 投影。 */
export const Config = z.object(Object.fromEntries(
  SETTING_DEFINITIONS.map((definition) => [definition.key, schemaField(definition)]),
))

const API_SETTING_KEYS = Object.freeze(SETTING_DEFINITIONS.map((item) => item.key))

function isLoopback(req) {
  const addr = req.socket && req.socket.remoteAddress
  return addr === '127.0.0.1' || addr === '::1' || addr === '::ffff:127.0.0.1'
}

function json(res, status, value) {
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' })
  res.end(JSON.stringify(value))
}

function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = []
    let size = 0
    req.on('data', (chunk) => {
      chunks.push(chunk)
      size += chunk.length
      if (size > 1_000_000) {
        reject(new Error('body too large'))
        req.destroy()
      }
    })
    req.on('end', () => {
      try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf8'))) }
      catch { reject(new Error('invalid JSON body')) }
    })
    req.on('error', reject)
  })
}

function plainJsonObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

const CANONICAL_SETTINGS_NAME = 'dsh-extra-plan/settings'
const SNAPSHOT_VALUE_KEYS = Object.freeze(SETTING_DEFINITIONS.map((definition) => definition.key))
const SNAPSHOT_GATE_KEYS = Object.freeze(GATE_WORD_FIELDS.map((item) => item.field))

function activeSettingsRows(editor) {
  const rows = typeof editor.configuration === 'function' ? editor.configuration() : []
  if (!Array.isArray(rows)) return []
  return rows.filter((row) => row !== null && typeof row === 'object' && row.entry !== undefined && row.entry.options !== undefined &&
    row.entry.options.id === SETTINGS_ROW_ID && row.disabled !== true && row.entry.disabled !== true && row.entry.options.disabled !== true)
}

function rowConfigOf(row) {
  if (row === null || typeof row !== 'object') return {}
  const inherited = row.inherited !== null && typeof row.inherited === 'object' ? row.inherited : {}
  const own = row.entry !== undefined && row.entry.options !== undefined && row.entry.options.config !== null && typeof row.entry.options.config === 'object' ? row.entry.options.config : {}
  const override = row.override !== null && typeof row.override === 'object' ? (row.override.config !== undefined ? row.override.config : row.override) : {}
  return { ...inherited, ...own, ...(override !== null && typeof override === 'object' ? override : {}) }
}

function completeConfig(config) {
  if (config === null || typeof config !== 'object' || Array.isArray(config)) return undefined
  const values = {}
  for (const definition of SETTING_DEFINITIONS) {
    if (!Object.prototype.hasOwnProperty.call(config, definition.key) || !validateSettingValue(definition, config[definition.key])) return undefined
    values[definition.key] = normalizeSettingValue(definition, config[definition.key])
  }
  let gateWords
  try { gateWords = validateGateWords(config.gateWords) } catch { return undefined }
  return { values, gateWords }
}

function rowSummary(row, pathText) {
  if (row === null || typeof row !== 'object') return { path: pathText || null }
  const options = row.entry !== undefined && row.entry.options !== undefined ? row.entry.options : row
  const config = row.entry !== undefined && row.entry.options !== undefined ? rowConfigOf(row) : (row.config !== undefined ? row.config : row.override?.config)
  const name = options.name === undefined ? (row.name === undefined ? row.override?.name : row.name) : options.name
  return {
    path: pathText || null,
    id: options.id === undefined ? (row.id === undefined ? row.override?.id : row.id) : options.id,
    name,
    config: structuredClone(config),
    complete: completeConfig(config) !== undefined,
  }
}

function rawPatchInfo(editor) {
  const documentPath = editor !== undefined && typeof editor.documentPath === 'string' ? editor.documentPath.trim() : ''
  if (documentPath === '' || !existsSync(documentPath)) return { documentPath: documentPath || null, text: undefined, diagnostics: ['document-path-unavailable'] }
  try { return { documentPath, text: readFileSync(documentPath, 'utf8'), diagnostics: [] } }
  catch (error) { return { documentPath, text: undefined, diagnostics: ['document-read-failed:' + String(error && error.message || error)] } }
}

/** 机械检查 effective/raw canonical settings 行；不选择旧 duplicate。 */
export function inspectSettingsAuthority(editor) {
  const activeRows = activeSettingsRows(editor)
  const effectiveRows = activeRows.map((row) => rowSummary(row, null))
  const patch = rawPatchInfo(editor)
  let rawRows = []
  const diagnostics = [...patch.diagnostics]
  if (typeof patch.text === 'string') {
    try {
      const document = parsePresetYaml(patch.text)
      rawRows = rowsByIdWithPath(document, SETTINGS_ROW_ID).map((item) => rowSummary(item.row, item.pathText))
    } catch (error) {
      diagnostics.push('raw-patch-yaml-parse-failed:' + String(error && error.message || error))
    }
  }
  const rawCount = rawRows.length
  const effectiveCount = activeRows.length
  const canonicalNameCount = rawRows.filter((row) => row.name === CANONICAL_SETTINGS_NAME).length
  const selectedEntryName = effectiveCount === 1 ? effectiveRows[0].name : undefined
  const selectedConfig = effectiveCount === 1 ? completeConfig(rowConfigOf(activeRows[0])) : undefined
  let status = 'conflict'
  let reason = rawCount !== 1 || canonicalNameCount !== 1 ? 'duplicate-settings-row' : 'ambiguous-settings-row'
  if (effectiveCount === 1 && rawCount === 1 && canonicalNameCount === 1 && selectedEntryName === CANONICAL_SETTINGS_NAME && selectedConfig !== undefined) {
    status = 'ok'
    reason = undefined
  }
  return {
    status,
    ...(reason === undefined ? {} : { reason }),
    id: SETTINGS_ROW_ID,
    canonicalName: CANONICAL_SETTINGS_NAME,
    rawCount,
    effectiveCount,
    canonicalNameCount,
    selectedEntryName,
    documentPath: patch.documentPath,
    rawRows,
    effectiveRows,
    diagnostics,
    selectedConfig: selectedConfig === undefined ? undefined : { values: { ...selectedConfig.values }, gateWords: { ...selectedConfig.gateWords } },
  }
}

function findSettingsRow(editor) {
  const rows = activeSettingsRows(editor)
  return rows.length === 1 ? rows[0] : undefined
}

function readRawPatch(editor) {
  return rawPatchInfo(editor).text
}

/** 固定十项 values 与七键 gateWords 的规范快照；changed key 不参与单独哈希。 */
export function stableSnapshot(snapshot) {
  if (snapshot === null || typeof snapshot !== 'object' || Array.isArray(snapshot)) throw new Error('invalid-snapshot')
  const sourceValues = snapshot.values !== undefined ? snapshot.values : snapshot
  if (sourceValues === null || typeof sourceValues !== 'object' || Array.isArray(sourceValues)) throw new Error('invalid-snapshot-values')
  const values = {}
  for (const key of SNAPSHOT_VALUE_KEYS) {
    const definition = SETTING_DEFINITIONS.find((item) => item.key === key)
    if (!Object.prototype.hasOwnProperty.call(sourceValues, key) || !validateSettingValue(definition, sourceValues[key])) throw new Error('invalid-snapshot-missing-or-type:' + key)
    values[key] = normalizeSettingValue(definition, sourceValues[key])
  }
  const gateWords = validateGateWords(snapshot.gateWords)
  const canonical = {
    values: Object.fromEntries(SNAPSHOT_VALUE_KEYS.map((key) => [key, values[key]])),
    gateWords: Object.fromEntries(SNAPSHOT_GATE_KEYS.map((key) => [key, gateWords[key]])),
  }
  const snapshotHash = stableSnapshotHash(canonical)
  return { values: canonical.values, gateWords: canonical.gateWords, snapshotHash }
}


/** GET 只读统一全局状态；旧行/raw patch 只在当前全局值缺项时作为迁移来源。 */
/** 只从唯一 canonical authority 解析；conflict 不回落旧 raw projection。 */
function readUnifiedState(editor) {
  const authority = inspectSettingsAuthority(editor)
  if (authority.status !== 'ok') return {
    conflict: true,
    located: authority.effectiveCount > 0 || authority.rawCount > 0,
    values: {},
    defaults: {},
    overridden: {},
    sources: {},
    gateWords: undefined,
    diagnostics: [...authority.diagnostics, authority.reason || 'settings-row-conflict'],
    authority,
    settingsRow: authority,
  }
  const settingsRow = findSettingsRow(editor)
  const rawPatch = readRawPatch(editor)
  const resolved = resolveUnifiedConfig({ settingsValues: { ...authority.selectedConfig.values, gateWords: authority.selectedConfig.gateWords }, readPatch: () => rawPatch })
  const overridden = {}
  const sources = {}
  for (const definition of HOST_ROW_SETTING_DEFINITIONS) {
    const key = definition.key
    overridden[key] = resolved.sources[key] === 'settings-row'
    sources[key] = resolved.sources[key]
  }
  return {
    conflict: false,
    located: true,
    values: { ...resolved.values },
    defaults: { ...createDefaultSettings() },
    overridden,
    sources,
    gateWords: resolved.gateWords,
    diagnostics: resolved.legacy.diagnostics || [],
    authority,
    settingsRow,
  }
}

function publicField(definition, value, defaultValue, overridden, source) {
  const ui = definition.ui
  return {
    key: definition.key,
    type: definition.scalarType,
    control: ui.control,
    locale: ui.locale,
    ...(ui.options === undefined ? {} : { options: [...ui.options] }),
    ...(ui.optionLocale === undefined ? {} : { optionLocale: { ...ui.optionLocale } }),
    value,
    default: defaultValue,
    overridden: overridden === true,
    source: source === undefined ? 'default' : source,
  }
}

function profileSyncPath(result, item) {
  if (item !== null && typeof item === 'object') {
    if (typeof item.path === 'string' && item.path !== '') return item.path
    if (typeof item.profile === 'string' && (item.profile.includes('\\') || item.profile.includes('/'))) return item.profile
  }
  if (result !== null && typeof result === 'object' && typeof result.profilesRoot === 'string' && result.profilesRoot !== '') {
    if (item !== null && typeof item === 'object' && typeof item.profile === 'string' && item.profile !== '') return join(result.profilesRoot, item.profile)
    return result.profilesRoot
  }
  return '<unresolved>'
}

function reportProfileSync(result) {
  if (result === null || typeof result !== 'object') return
  const status = typeof result.status === 'string' ? result.status : 'unknown'
  if (status !== 'failed' && status !== 'unavailable' && status !== 'not-installed' && status !== 'drift-detected' && status !== 'conflict') return
  const pathSource = typeof result.pathSource === 'string' ? result.pathSource : '<unknown>'
  const profiles = Array.isArray(result.profiles) ? result.profiles : []
  const details = profiles.length === 0
    ? 'profile=<none> path=' + profileSyncPath(result, undefined) + ' reason=' + String(result.reason || 'no-installed-target')
    : profiles.map((item) => 'profile=' + String(item && item.profile || '<unknown>') + ' path=' + profileSyncPath(result, item) + ' reason=' + String(item && (item.reason || item.status) || result.reason || 'unknown')).join('; ')
  const message = '[dsh-extra-plan] QQBot profile sync status=' + status + ' pathSource=' + pathSource + ' ' + details
  if (status === 'failed') console.error(message)
  else console.warn(message)
}

function cacheProfileSync(profileSync) {
  const base = profileSync === undefined || profileSync === null ? { status: 'pending', pending: true } : profileSync
  return { ...base, pending: base.pending === true, cache: true, terminalMatch: false, source: 'last-terminal-cache' }
}

/** GET 无参缓存兜底：terminal 缓存内 Web patch 指纹与磁盘现状不一致时标记 stale；只读，不触发同步。 */
function cacheProfileSyncWithStale(profileSync, editor) {
  const base = cacheProfileSync(profileSync)
  try {
    const fingerprint = profileSync !== null && typeof profileSync === 'object' && profileSync.rawWebPatchFingerprint !== null && typeof profileSync.rawWebPatchFingerprint === 'object'
      ? profileSync.rawWebPatchFingerprint
      : undefined
    const cachedSha256 = fingerprint !== undefined && typeof fingerprint.patchSha256 === 'string' && fingerprint.patchSha256 !== '' ? fingerprint.patchSha256 : undefined
    if (cachedSha256 === undefined || editor === undefined || editor === null) return base
    const documentPath = editor.documentPath
    if (typeof documentPath !== 'string' || documentPath.trim() === '') return base
    const bytes = readFileSync(documentPath)
    const diskSha256 = createHash('sha256').update(bytes).digest('hex')
    if (diskSha256 === cachedSha256) return base
    const cachedBytes = Number.isFinite(fingerprint.patchBytes) ? fingerprint.patchBytes : null
    console.warn('[dsh-extra-plan] QQBot profile sync status=stale-terminal-cache pathSource=editor.documentPath path=' + documentPath + ' cachedPatchSha256=' + cachedSha256 + ' diskPatchSha256=' + diskSha256 + ' cachedBytes=' + (cachedBytes === null ? 'unknown' : String(cachedBytes)) + ' diskBytes=' + String(bytes.length))
    return { ...base, stale: true, source: 'stale-terminal-cache' }
  } catch {
    return base
  }
}

function requestProfileSync(profileSync, request) {
  const same = profileSync !== null && profileSync !== undefined && request !== undefined &&
    profileSync.saveRunId === request.saveRunId && profileSync.syncRevision === request.syncRevision && profileSync.snapshotHash === request.snapshotHash
  return { ...profileSync, pending: false, cache: false, source: 'request-result', request: { ...request }, terminalMatch: same }
}

function proPayload(editor, profileSync, profileView) {
  const state = readUnifiedState(editor)
  const fields = state.conflict === true ? [] : HOST_ROW_SETTING_DEFINITIONS.map((definition) => publicField(
    definition,
    state.values[definition.key],
    state.defaults[definition.key],
    state.overridden[definition.key],
    state.sources[definition.key],
  ))
  const sync = profileView !== undefined ? profileView : cacheProfileSync(profileSync)
  return {
    fields,
    values: { ...state.values },
    defaults: { ...state.defaults },
    diagnostics: [...state.diagnostics],
    settingsRow: state.authority,
    profileSync: sync,
  }
}

function conflictProfileSync(authority) {
  return {
    status: 'conflict',
    pending: false,
    cache: false,
    terminalMatch: false,
    source: 'request-result',
    reason: authority.reason || 'settings-row-conflict',
    settingsRow: authority,
  }
}

function createApiHandler(ctx, syncEditor, getProfileSync) {
  const responseForProfile = (editor, profileSync, webApplied, request, projectionApplied = true) => {
    const view = request === undefined ? cacheProfileSync(profileSync) : requestProfileSync(profileSync, request)
    const status = view !== null && view !== undefined ? view.status : 'pending'
    const matched = view !== null && view !== undefined && view.terminalMatch === true
    const overall = status === 'conflict' ? 'conflict' : status === 'synced' && matched ? 'synced' : status === 'not-installed' ? 'not-installed' : 'partial'
    const httpStatus = status === 'conflict' || (request !== undefined && matched !== true) ? 409 : status === 'failed' || status === 'unavailable' || status === 'drift-detected' ? 502 : 200
    const body = { ...proPayload(editor, profileSync, view), web: { applied: webApplied === true }, projection: { applied: projectionApplied === true, owner: projectionApplied === true ? SETTINGS_ROW_ID : undefined }, overall }
    if (request !== undefined && profileSync !== null && profileSync !== undefined) body.request = { ...request }
    return { httpStatus, body }
  }
  return async (req, res) => {
    if (!isLoopback(req)) return json(res, 403, { error: 'forbidden: loopback only' })
    const url = new URL(req.url, 'http://localhost')
    const path = url.pathname
    try {
      const editor = typeof ctx.get === 'function' ? ctx.get('configEditor') : undefined
      if (editor === undefined || editor === null || typeof editor.edit !== 'function') return json(res, 500, { error: 'configEditor service is unavailable' })
      if (req.method === 'GET' && path === '/api/dsh-extra-plan-settings/pro-config') {
        const authority = inspectSettingsAuthority(editor)
        if (authority.status !== 'ok') return json(res, 409, { ...proPayload(editor, getProfileSync()), error: 'settings-row conflict', settingsRow: authority, projection: { applied: false }, overall: 'conflict' })
        const requestedRunId = url.searchParams.get('saveRunId')
        const cached = getProfileSync()
        if (requestedRunId !== null && requestedRunId !== '') {
          if (cached === undefined || cached === null || cached.saveRunId !== requestedRunId) {
            const stale = { ...cacheProfileSync(cached), status: 'conflict', reason: 'terminal-saveRunId-mismatch', terminalMatch: false }
            return json(res, 409, { ...proPayload(editor, cached, stale), error: 'terminal saveRunId mismatch', terminalMatch: false, overall: 'conflict' })
          }
          const matched = { ...cached, pending: false, cache: false, source: 'terminal-query', terminalMatch: true, request: { saveRunId: cached.saveRunId, syncRevision: cached.syncRevision, snapshotHash: cached.snapshotHash, trigger: cached.trigger } }
          return json(res, 200, { ...proPayload(editor, cached, matched), overall: cached.status === 'synced' ? 'synced' : 'partial' })
        }
        return json(res, 200, { ...proPayload(editor, cached, cacheProfileSyncWithStale(cached, editor)), overall: 'cache' })
      }
      if (req.method === 'PUT' && path === '/api/dsh-extra-plan-settings/pro-config') {
        let body
        try { body = await readJsonBody(req) }
        catch (error) { return json(res, 400, { error: String(error && error.message || error) }) }
        if (!plainJsonObject(body)) return json(res, 400, { error: 'payload must be a non-array JSON object' })
        const keys = Object.keys(body)
        if (keys.length === 0) return json(res, 400, { error: 'payload must contain at least one supported field' })
        const unknown = keys.filter((key) => !API_SETTING_KEYS.includes(key))
        if (unknown.length > 0) return json(res, 400, { error: 'unsupported field(s): ' + unknown.join(', ') + '（本接口仅收 ' + API_SETTING_KEYS.join('/') + '）' })
        for (const definition of SETTING_DEFINITIONS) {
          const key = definition.key
          if (Object.prototype.hasOwnProperty.call(body, key) && !validateSettingValue(definition, body[key])) return json(res, 400, { error: key + ' has an invalid value' })
        }
        const authority = inspectSettingsAuthority(editor)
        if (authority.status !== 'ok') return json(res, 409, { ...proPayload(editor, getProfileSync()), error: 'settings-row conflict', settingsRow: authority, profileSync: conflictProfileSync(authority), projection: { applied: false }, overall: 'conflict' })
        const row = findSettingsRow(editor)
        if (row === undefined) return json(res, 409, { ...proPayload(editor, getProfileSync()), error: 'settings-row conflict', settingsRow: authority, profileSync: conflictProfileSync(authority), projection: { applied: false }, overall: 'conflict' })
        const state = readUnifiedState(editor)
        if (state.conflict === true) return json(res, 409, { ...proPayload(editor, getProfileSync()), error: 'settings-row conflict', settingsRow: state.authority, profileSync: conflictProfileSync(state.authority), projection: { applied: false }, overall: 'conflict' })
        const current = effectiveRowConfig(row) || {}
        const patch = {}
        for (const definition of SETTING_DEFINITIONS) {
          const key = definition.key
          const read = readPath(current, key)
          if (!read.exists || !validateSettingValue(definition, read.value)) patch[key] = state.values[key]
        }
        for (const definition of SETTING_DEFINITIONS) {
          const key = definition.key
          if (Object.prototype.hasOwnProperty.call(body, key)) patch[key] = normalizeSettingValue(definition, body[key])
        }
        if (!Object.prototype.hasOwnProperty.call(current, 'gateWords')) patch.gateWords = state.gateWords
        const nextConfig = restateSettingsConfig(current, row.inherited, patch)
        if (!isDeepStrictEqual(nextConfig, current)) await editor.edit(row.entry, (latest, inherited) => restateSettingsConfig(latest, inherited, patch))
        const profileSync = await syncEditor(editor, { trigger: 'api-put' })
        const request = profileSync !== null && profileSync !== undefined && profileSync.request !== undefined ? profileSync.request : undefined
        const response = responseForProfile(editor, profileSync, true, request, true)
        return json(res, response.httpStatus, response.body)
      }
      return json(res, 404, { error: 'not found' })
    } catch (error) {
      return json(res, 500, { error: String(error && error.message || error) })
    }
  }
}

export function apply(ctx) {
  // Client carrier、settings API、旧值迁移与 profileSync 由这一行 owner 持有；adapter 生命周期独立。
  let lastTerminalCache
  let syncRevision = 0
  let settledCount = 0
  const synchronizer = createQqbotSettingsSynchronizer({
    onResult: (result) => { lastTerminalCache = { ...result, pending: false }; reportProfileSync(result) },
  })
  const editorOf = (fallback) => {
    try {
      const value = typeof ctx.get === 'function' ? ctx.get('configEditor') : fallback
      return value === undefined || value === null ? fallback : value
    } catch {
      return fallback
    }
  }
  const documentPathOf = (editor) => {
    try {
      if (editor !== undefined && editor !== null && typeof editor.syncDocumentPath === 'string') return editor.syncDocumentPath
      const value = editor === undefined || editor === null ? undefined : editor.documentPath
      return typeof value === 'string' ? value : undefined
    } catch {
      return undefined
    }
  }
  const environmentSnapshot = () => ({ DSH_HOME: process.env.DSH_HOME, DSH_PROFILE: process.env.DSH_PROFILE })
  const conflictResult = (authority, request) => {
    const result = {
      status: 'conflict',
      pending: false,
      cache: false,
      terminalMatch: false,
      source: 'request-result',
      reason: authority.reason || 'settings-row-conflict',
      settingsRow: authority,
      ...request,
      request: { ...request },
    }
    lastTerminalCache = result
    return result
  }
  const syncEditor = async (editor, options = {}) => {
    const trigger = typeof options.trigger === 'string' && options.trigger !== '' ? options.trigger : 'api-put'
    const request = { saveRunId: randomUUID(), syncRevision: ++syncRevision, snapshotHash: null, trigger }
    try {
      const authority = inspectSettingsAuthority(editor)
      if (authority.status !== 'ok') return conflictResult(authority, request)
      const state = options.snapshot === undefined ? readUnifiedState(editor) : undefined
      const rawSnapshot = options.snapshot === undefined
        ? { values: { ...state.values }, gateWords: structuredClone(state.gateWords) }
        : { values: { ...options.snapshot.values }, gateWords: structuredClone(options.snapshot.gateWords) }
      const checked = stableSnapshot(rawSnapshot)
      request.snapshotHash = checked.snapshotHash
      const result = await synchronizer.enqueue({
        documentPath: documentPathOf(editor),
        snapshot: { values: checked.values, gateWords: checked.gateWords },
        env: environmentSnapshot(),
        saveRunId: request.saveRunId,
        syncRevision: request.syncRevision,
        snapshotHash: request.snapshotHash,
        trigger: request.trigger,
        associated: true,
      })
      return result
    } catch (error) {
      const result = {
        status: 'failed',
        pending: false,
        cache: false,
        terminalMatch: false,
        source: 'request-result',
        reason: String(error && error.message || error),
        ...request,
        request: { ...request },
      }
      lastTerminalCache = result
      reportProfileSync(result)
      return result
    }
  }
  const settledSettings = async (snapshot) => {
    const trigger = settledCount === 0 ? 'settled-initial' : 'settled-update'
    settledCount += 1
    return syncEditor(editorOf(undefined), { snapshot, trigger })
  }
  const settledError = async (error) => {
    const result = {
      status: 'failed',
      pending: false,
      cache: false,
      terminalMatch: false,
      source: 'settled-error',
      reason: 'settled-error:' + String(error && error.message || error),
    }
    lastTerminalCache = result
    reportProfileSync(result)
    console.warn('[dsh-extra-plan] profile sync settled callback failed：' + String(error && error.message || error))
  }
  ctx.inject(['loader'], (child) => child.effect(() => mountClientCarrier(child), 'dsh-extra-plan-settings: internal client carrier'))
  ctx.inject(['settings'], (child) => child.effect(() => child.settings.configure({ auto: false }, ctx.fiber), 'dsh-extra-plan-settings: settings policy'))
  ctx.inject(['webServer'], (webCtx) => webCtx.effect(() => webCtx.webServer.register({
    kind: 'prefix',
    path: '/api/dsh-extra-plan-settings',
    handler: createApiHandler(ctx, (editor, options) => syncEditor(editor, options), () => lastTerminalCache),
  }), 'dsh-extra-plan-settings: api route'))
  ctx.inject(['configEditor'], (child) => child.effect(() => mountPresetSync(child, { onSettledSettings: settledSettings, onSettledError: settledError }), 'dsh-extra-plan-settings: sync and adapter lifecycle'))
}

export { SETTINGS_ROW_ID }
