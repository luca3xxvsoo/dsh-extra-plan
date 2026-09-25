// Host half of dsh-extra-plan-settings（dsh 0.1.7-rc.1 设置链）。
//
// 双通道写链（方案 T3）：
//  - 8 项 UI 设置（anchoredBootstrap/creativeMode/runcodeCatchGate/
//    crossProviderPlannerModel/plannerModel/plannerPromptSuffix/exploreBudget/
//    otherAgentModel）：本行 Config 的 8 个 .volatile() 字段，走宿主 SettingsForms
//    （settings.configure 只登记页面策略；读写统一走官方 configForms/remote.settings，
//    事务 + revision fencing + 回滚）。旧的 settings.register(ns, schema) 在 0.1.7 不存在。
//  - 2 项宿主行设置（webFetch、toolPresentationMode）：消费方是声明行 plugins 内的
//    tool-web / tool-presentation 子行 config（非 volatile，不在本行 Config 内），
//    唯一官方写口 = configEditor.edit（整体重述 plugins，config 不深合并）。
//    PUT /api/dsh-extra-plan-settings/pro-config 仅收这 2 项；GET 只读 configuration() 现值。
//
// 本模块不涉及 qqbot（见独立插件 dsh-qqbot-user-questions）。
// 写盘一律经宿主 editor：本模块不直写任何 cordis.patch.yml、不写旧预设目录。

import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import z from '@deepseek-ai/schemastery'
import {
  HOST_ROW_SETTING_DEFINITIONS,
  PRESET_ROW_ID,
  SETTINGS_ROW_ID,
  captureSettings,
  findPluginsRow,
  readPath,
  validateSettingValue,
} from './preset-settings.js'
import { restatePresetPlugins } from './preset-sync.js'

export const name = 'dsh-extra-plan-settings'
export const inject = []

const HERE = dirname(fileURLToPath(import.meta.url))
const TEMPLATE_AGENT_FILE = join(HERE, '..', 'assets', 'presets', 'extra-plan', 'agent.cordis.yml')

/**
 * 8 项 UI 设置的宿主表单 schema：每字段链 .volatile()（SettingsForms 只投影 volatile 字段），
 * 默认值与 lib/live-config.js BUILTIN_DEFAULTS 逐字一致。
 * ns = 本行 id（profile patch 根级 insert 行，id 唯一 → configEditor 可寻址）。
 */
export const Config = z.object({
  anchoredBootstrap: z.boolean().default(true).volatile(),
  creativeMode: z.boolean().default(false).volatile(),
  runcodeCatchGate: z.boolean().default(false).volatile(),
  crossProviderPlannerModel: z.boolean().default(false).volatile(),
  plannerModel: z.string().default('deepseek-v4-pro').volatile(),
  plannerPromptSuffix: z.string().default('').volatile(),
  // 整数语义按宿主既有习语表达（schemastery 无 .int()；官方 volatile 整数字段同形，
  // 见 dsh-agent-loop 的 maxParallelToolCalls: z.number().step(1).min(1).default(10).volatile()）。
  exploreBudget: z.number().step(1).min(1).default(18).volatile(),
  otherAgentModel: z.string().default('').volatile(),
})

const HOST_ROW_KEYS = Object.freeze(HOST_ROW_SETTING_DEFINITIONS.map((item) => item.key))
const PATH_WITHIN_ROW = Object.freeze({ webFetch: 'config.fetch', toolPresentationMode: 'config.mode' })

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

/** 出厂默认（2 项宿主行）：读仓库模板 agent.cordis.yml 的同名叶值，缺则内置兜底。 */
function assetHostRowDefaults() {
  const fallback = { webFetch: false, toolPresentationMode: 'native' }
  try {
    const captured = captureSettings(readFileSync(TEMPLATE_AGENT_FILE, 'utf8'))
    const values = captured !== null && captured.values !== null && typeof captured.values === 'object' ? captured.values : {}
    const states = captured !== null && captured.states !== null && typeof captured.states === 'object' ? captured.states : {}
    const out = {}
    for (const key of HOST_ROW_KEYS) {
      out[key] = states[key] === 'captured' && Object.prototype.hasOwnProperty.call(values, key) ? values[key] : fallback[key]
    }
    return out
  } catch {
    return fallback
  }
}

/** 生效 plugins：profile override → Loader 行 config → 继承层。 */
function effectivePlugins(row) {
  const override = row.override
  if (override !== null && typeof override === 'object' && Array.isArray(override.plugins)) return override.plugins
  const own = row.entry !== undefined && row.entry.options !== undefined ? row.entry.options.config : undefined
  if (own !== null && typeof own === 'object' && Array.isArray(own.plugins)) return own.plugins
  const inherited = row.inherited
  if (inherited !== null && typeof inherited === 'object' && Array.isArray(inherited.plugins)) return inherited.plugins
  return undefined
}

function findPresetRow(editor) {
  const rows = typeof editor.configuration === 'function' ? editor.configuration() : []
  return rows.find((row) => row !== null && typeof row === 'object' && row.entry !== undefined && row.entry.options !== undefined && row.entry.options.id === PRESET_ROW_ID)
}

/** GET 只读语义：读 configuration() 现值（声明行 plugins 内 2 项子行 config）。 */
function readHostRowState(editor) {
  const defaults = assetHostRowDefaults()
  const presetRow = findPresetRow(editor)
  if (presetRow === undefined) return { located: false, values: { ...defaults }, defaults }
  const plugins = effectivePlugins(presetRow)
  const values = { ...defaults }
  const overridden = {}
  for (const definition of HOST_ROW_SETTING_DEFINITIONS) {
    const row = findPluginsRow(plugins, definition.rowLocator.pluginsRowId)
    if (row === null) { overridden[definition.key] = false; continue }
    const read = readPath(row, PATH_WITHIN_ROW[definition.key])
    if (!read.exists || !validateSettingValue(definition, read.value)) { overridden[definition.key] = false; continue }
    values[definition.key] = read.value
    overridden[definition.key] = true
  }
  return { located: true, values, defaults, overridden }
}

function publicField(definition, value, defaultValue, overridden) {
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
  }
}

function proPayload(editor) {
  const defaults = assetHostRowDefaults()
  const state = { located: false, values: { ...defaults }, defaults, overridden: {} }
  let current = state
  try { current = readHostRowState(editor) } catch { current = state }
  const fields = HOST_ROW_SETTING_DEFINITIONS.map((definition) => publicField(
    definition,
    current.values[definition.key],
    current.defaults[definition.key],
    current.overridden === undefined ? false : current.overridden[definition.key],
  ))
  return { fields, values: { ...current.values }, defaults: { ...current.defaults } }
}

/** 行定位失败（声明行/子行缺失）→ 404；edit/reconcile 失败 → 500。 */
function isLocateError(error) {
  const message = String(error !== null && typeof error === 'object' && error.message !== undefined ? error.message : error)
  return message.includes('不可定位') || message.includes('缺少') || message.includes('缺失') || message === 'not found'
}

function createApiHandler(ctx) {
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
        try { return json(res, 200, proPayload(editor)) }
        catch (error) {
          return json(res, 500, { error: 'failed to read declaration row plugins: ' + String(error && error.message || error) })
        }
      }

      if (req.method === 'PUT' && path === '/api/dsh-extra-plan-settings/pro-config') {
        const body = await readJsonBody(req)
        const input = body !== null && typeof body === 'object' ? body : {}
        const keys = Object.keys(input)
        const unknown = keys.filter((key) => !HOST_ROW_KEYS.includes(key))
        if (unknown.length > 0) {
          return json(res, 400, { error: 'unsupported field(s): ' + unknown.join(', ') + '（本接口仅收 ' + HOST_ROW_KEYS.join('/') + '）' })
        }
        const hostRowConfig = {}
        for (const definition of HOST_ROW_SETTING_DEFINITIONS) {
          if (!Object.prototype.hasOwnProperty.call(input, definition.key)) continue
          if (!validateSettingValue(definition, input[definition.key])) {
            return json(res, 400, { error: definition.key + ' has an invalid value' })
          }
          hostRowConfig[definition.rowLocator.pluginsRowId] = { [definition.key === 'webFetch' ? 'fetch' : 'mode']: input[definition.key] }
        }
        if (Object.keys(hostRowConfig).length === 0) {
          return json(res, 400, { error: 'at least one of ' + HOST_ROW_KEYS.join('/') + ' is required' })
        }
        const presetRow = findPresetRow(editor)
        if (presetRow === undefined) {
          return json(res, 404, { error: 'declaration row not found: ' + PRESET_ROW_ID })
        }
        try {
          await editor.edit(presetRow.entry, (current, inherited) => restatePresetPlugins(current, inherited, { hostRowConfig, gateWords: null }))
        } catch (error) {
          const message = String(error && error.message || error)
          return json(res, isLocateError(error) ? 404 : 500, { error: 'failed to write declaration row plugins: ' + message })
        }
        return json(res, 200, proPayload(editor))
      }

      return json(res, 404, { error: 'not found' })
    } catch (error) {
      return json(res, 500, { error: String(error && error.message || error) })
    }
  }
}

export function apply(ctx) {
  // 8 项 UI 设置：只登记本实例的页面策略（auto:false = 只走 Plugins 页自定义卡片，
  // 不生成自动页）；Config 的 volatile 字段由 SettingsForms 投影成表单，
  // 读写一律走官方 configForms（remote.settings）——本行无自建写链。
  ctx.inject(['settings'], (child) => {
    child.effect(() => child.settings.configure({ auto: false }, ctx.fiber))
  })
  ctx.inject(['webServer'], (webCtx) => {
    webCtx.effect(() => webCtx.webServer.register({
      kind: 'prefix',
      path: '/api/dsh-extra-plan-settings',
      handler: createApiHandler(ctx),
    }), 'dsh-extra-plan-settings: api route')
  })
}

export { SETTINGS_ROW_ID, PRESET_ROW_ID }
