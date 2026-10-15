// dsh-extra-plan-settings 的唯一全局管理入口。
// settings 行 config 是全部 10 个权威值的载体；gateWords 作为兼容数据同样由该 owner 严格保留。
// 本入口统一拥有 settings/API/carrier、旧值迁移与 profileSync；AgentPreset 仅由 preset-sync 初始/结构路径管理。
// 两项宿主设置只从权威值派生到内存 definition，不再写独立公开投影行。

import { readFileSync, existsSync } from 'node:fs'
import { isDeepStrictEqual } from 'node:util'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import z from '@deepseek-ai/schemastery'
import {
  HOST_ROW_SETTING_DEFINITIONS,
  SETTING_DEFINITIONS,
  SETTINGS_ROW_ID,
  hostRowDefaultsFromTemplate,
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
import { createQqbotSettingsSynchronizer } from './qqbot-settings-sync.js'

export const name = 'dsh-extra-plan-settings'
export const inject = []

const HERE = dirname(fileURLToPath(import.meta.url))
const TEMPLATE_AGENT_FILE = join(HERE, '..', 'assets', 'presets', 'extra-plan', 'agent.cordis.yml')

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

const HOST_ROW_KEYS = Object.freeze(HOST_ROW_SETTING_DEFINITIONS.map((item) => item.key))

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

function findSettingsRow(editor) {
  const rows = typeof editor.configuration === 'function' ? editor.configuration() : []
  const matches = rows.filter((row) => row !== null && typeof row === 'object' && row.entry !== undefined && row.entry.options !== undefined && row.entry.options.id === SETTINGS_ROW_ID)
  return matches.length === 1 ? matches[0] : undefined
}

function readRawPatch(editor) {
  const path = editor !== undefined && typeof editor.documentPath === 'string' ? editor.documentPath : ''
  if (path === '' || !existsSync(path)) return undefined
  try { return readFileSync(path, 'utf8') } catch { return undefined }
}

function defaultValues() {
  const defaults = Object.fromEntries(SETTING_DEFINITIONS.map((definition) => [definition.key, definition.defaultValue]))
  return { ...defaults, ...hostRowDefaultsFromTemplate(readFileSync(TEMPLATE_AGENT_FILE, 'utf8')) }
}

/** GET 只读统一全局状态；旧行/raw patch 只在当前全局值缺项时作为迁移来源。 */
function readUnifiedState(editor) {
  const settingsRow = findSettingsRow(editor)
  const authority = settingsRow === undefined ? undefined : effectiveRowConfig(settingsRow)
  const rawPatch = readRawPatch(editor)
  const resolved = resolveUnifiedConfig({ settingsValues: authority, readPatch: () => rawPatch })
  const overridden = {}
  const sources = {}
  for (const definition of HOST_ROW_SETTING_DEFINITIONS) {
    const key = definition.key
    overridden[key] = resolved.sources[key] === 'settings-row'
    sources[key] = resolved.sources[key]
  }
  return {
    located: settingsRow !== undefined || resolved.legacy.legacyPlugins !== undefined || Object.keys(resolved.legacy.projection || {}).length > 0,
    values: { ...resolved.values },
    defaults: { ...defaultValues() },
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
  if (status !== 'failed' && status !== 'unavailable' && status !== 'not-installed') return
  const pathSource = typeof result.pathSource === 'string' ? result.pathSource : '<unknown>'
  const profiles = Array.isArray(result.profiles) ? result.profiles : []
  const details = profiles.length === 0
    ? 'profile=<none> path=' + profileSyncPath(result, undefined) + ' reason=' + String(result.reason || 'no-installed-target')
    : profiles.map((item) => 'profile=' + String(item && item.profile || '<unknown>') + ' path=' + profileSyncPath(result, item) + ' reason=' + String(item && (item.reason || item.status) || result.reason || 'unknown')).join('; ')
  const message = '[dsh-extra-plan] QQBot profile sync status=' + status + ' pathSource=' + pathSource + ' ' + details
  if (status === 'failed') console.error(message)
  else console.warn(message)
}

function proPayload(editor, profileSync) {
  const state = readUnifiedState(editor)
  const fields = HOST_ROW_SETTING_DEFINITIONS.map((definition) => publicField(
    definition,
    state.values[definition.key],
    state.defaults[definition.key],
    state.overridden[definition.key],
    state.sources[definition.key],
  ))
  const sync = profileSync === undefined ? { status: 'pending', pending: true } : { ...profileSync, pending: profileSync.pending === true }
  return { fields, values: { ...state.values }, defaults: { ...state.defaults }, diagnostics: [...state.diagnostics], profileSync: sync }
}

function createApiHandler(ctx, syncEditor, getProfileSync) {
  const responseForProfile = (editor, profileSync, webApplied) => {
    const status = profileSync !== null && profileSync !== undefined ? profileSync.status : 'pending'
    const overall = status === 'synced' ? 'synced' : status === 'not-installed' ? 'not-installed' : 'partial'
    const httpStatus = status === 'failed' || status === 'unavailable' ? 502 : 200
    return { httpStatus, body: { ...proPayload(editor, profileSync), web: { applied: webApplied === true }, overall } }
  }
  return async (req, res) => {
    if (!isLoopback(req)) return json(res, 403, { error: 'forbidden: loopback only' })
    const url = new URL(req.url, 'http://localhost')
    const path = url.pathname
    try {
      const editor = typeof ctx.get === 'function' ? ctx.get('configEditor') : undefined
      if (editor === undefined || editor === null || typeof editor.edit !== 'function') {
        return json(res, 500, { error: 'configEditor service is unavailable' })
      }
      if (req.method === 'GET' && path === '/api/dsh-extra-plan-settings/pro-config') {
        try { return json(res, 200, proPayload(editor, getProfileSync())) }
        catch (error) { return json(res, 500, { error: 'failed to read global settings: ' + String(error && error.message || error) }) }
      }
      if (req.method === 'PUT' && path === '/api/dsh-extra-plan-settings/pro-config') {
        let body
        try { body = await readJsonBody(req) }
        catch (error) { return json(res, 400, { error: String(error && error.message || error) }) }
        if (!plainJsonObject(body)) return json(res, 400, { error: 'payload must be a non-array JSON object' })
        const keys = Object.keys(body)
        if (keys.length === 0) return json(res, 400, { error: 'payload must contain at least one supported field' })
        const unknown = keys.filter((key) => !HOST_ROW_KEYS.includes(key))
        if (unknown.length > 0) return json(res, 400, { error: 'unsupported field(s): ' + unknown.join(', ') + '（本接口仅收 ' + HOST_ROW_KEYS.join('/') + '）' })
        for (const definition of HOST_ROW_SETTING_DEFINITIONS) {
          const key = definition.key
          if (Object.prototype.hasOwnProperty.call(body, key) && !validateSettingValue(definition, body[key])) {
            return json(res, 400, { error: key + ' has an invalid value' })
          }
        }
        const row = findSettingsRow(editor)
        if (row === undefined) return json(res, 200, { ...proPayload(editor, getProfileSync()), projection: { applied: false, error: 'declaration row not found: ' + SETTINGS_ROW_ID } })
        const state = readUnifiedState(editor)
        const current = effectiveRowConfig(row) || {}
        const patch = {}
        for (const definition of SETTING_DEFINITIONS) {
          const key = definition.key
          const read = readPath(current, key)
          if (!read.exists || !validateSettingValue(definition, read.value)) patch[key] = state.values[key]
        }
        for (const definition of HOST_ROW_SETTING_DEFINITIONS) {
          const key = definition.key
          if (Object.prototype.hasOwnProperty.call(body, key)) patch[key] = normalizeSettingValue(definition, body[key])
        }
        if (!Object.prototype.hasOwnProperty.call(current, 'gateWords')) patch.gateWords = state.gateWords
        const nextConfig = restateSettingsConfig(current, row.inherited, patch)
        if (!isDeepStrictEqual(nextConfig, current)) await editor.edit(row.entry, (latest, inherited) => restateSettingsConfig(latest, inherited, patch))
        const profileSync = await syncEditor(editor)
        const response = responseForProfile(editor, profileSync, true)
        return json(res, response.httpStatus, { ...response.body, projection: { applied: true, owner: SETTINGS_ROW_ID } })
      }
      return json(res, 404, { error: 'not found' })
    } catch (error) {
      return json(res, 500, { error: String(error && error.message || error) })
    }
  }
}

export function apply(ctx) {
  // Client carrier、settings API、旧值迁移与 profileSync 由这一行 owner 持有；adapter 生命周期独立。
  let profileSync = { status: 'pending', pending: true }
  const synchronizer = createQqbotSettingsSynchronizer({
    onResult: (result) => { profileSync = { ...result, pending: false }; reportProfileSync(result) },
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
      const value = editor === undefined || editor === null ? undefined : editor.documentPath
      return typeof value === 'string' ? value : undefined
    } catch {
      return undefined
    }
  }
  const environmentSnapshot = () => ({ DSH_HOME: process.env.DSH_HOME, DSH_PROFILE: process.env.DSH_PROFILE })
  const syncEditor = async (editor, settledSnapshot) => {
    try {
      const state = settledSnapshot === undefined ? readUnifiedState(editor) : undefined
      const snapshot = settledSnapshot === undefined
        ? { values: { ...state.values }, gateWords: structuredClone(state.gateWords) }
        : { values: { ...settledSnapshot.values }, gateWords: structuredClone(settledSnapshot.gateWords) }
      profileSync = { ...profileSync, pending: true }
      return await synchronizer.enqueue({ documentPath: documentPathOf(editor), snapshot, env: environmentSnapshot() })
    } catch (error) {
      const result = { status: 'failed', pending: false, reason: String(error && error.message || error) }
      profileSync = result
      reportProfileSync(result)
      return result
    }
  }
  const settledSettings = async (snapshot) => syncEditor(editorOf(ctx.configEditor), snapshot)
  const settledError = async (error) => {
    const result = { status: 'failed', pending: false, reason: 'settled-error:' + String(error && error.message || error) }
    profileSync = result
    reportProfileSync(result)
    console.warn('[dsh-extra-plan] profile sync settled callback failed：' + String(error && error.message || error))
  }
  ctx.inject(['loader'], (child) => child.effect(() => mountClientCarrier(child), 'dsh-extra-plan-settings: internal client carrier'))
  ctx.inject(['settings'], (child) => child.effect(() => child.settings.configure({ auto: false }, ctx.fiber), 'dsh-extra-plan-settings: settings policy'))
  ctx.inject(['webServer'], (webCtx) => webCtx.effect(() => webCtx.webServer.register({
    kind: 'prefix',
    path: '/api/dsh-extra-plan-settings',
    handler: createApiHandler(ctx, (editor) => syncEditor(editor), () => profileSync),
  }), 'dsh-extra-plan-settings: api route'))
  ctx.inject(['configEditor'], (child) => child.effect(() => mountPresetSync(child, { onSettledSettings: settledSettings, onSettledError: settledError }), 'dsh-extra-plan-settings: sync and adapter lifecycle'))
}

export { SETTINGS_ROW_ID }
