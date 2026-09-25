// Host half of dsh-extra-plan-settings（dsh 0.1.7-rc.1 设置链）。
//
// 写链（2026-09-25 二轮：权威值上移 settings 行 + 声明行投影）：
//  - 权威值唯一落点 = 本行（settings 行 dsh-extra-plan-settings）的 config，共 10 项：
//      · 8 项 UI 设置（anchoredBootstrap/creativeMode/runcodeCatchGate/
//        crossProviderPlannerModel/plannerModel/plannerPromptSuffix/exploreBudget/
//        otherAgentModel）：走宿主 SettingsForms（settings.configure 只登记页面策略；
//        读写统一走官方 configForms/remote.settings，事务 + revision fencing + 回滚）。
//      · 2 项宿主行设置（webFetch、toolPresentationMode）：同样落在本行 config（本行即
//        Config 的 10 个 volatile 字段），故与 8 项一样跨升级/重装不丢。
//  - 投影落点 = 声明行 preset-extra-plan 的 plugins 内 tool-web / tool-presentation 子行
//    （消费方是宿主行装载期快照，只有声明行子行能被宿主读到，故必须投影）。
//    PUT /api/dsh-extra-plan-settings/pro-config 的写链顺序：
//      ① 先写 settings 行（权威值，宿主永不清理本行）→ ② 再投影声明行子行。
//    投影失败不回滚权威值（投影被宿主删除是无害状态：下次启动自愈按权威值重建）。
//  - GET 只读：权威值（本行 config.<key>）→ 声明行投影现值 → 出厂默认，逐项回退。
//
// 本模块不涉及 qqbot（见独立插件 dsh-qqbot-user-questions）。
// 写盘一律经宿主 editor：本模块不直写任何 cordis.patch.yml、不写旧预设目录。

import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import z from '@deepseek-ai/schemastery'
import {
  HOST_ROW_LEAF_KEYS,
  HOST_ROW_SETTING_DEFINITIONS,
  PRESET_ROW_ID,
  SETTINGS_ROW_ID,
  captureSettings,
  normalizeSettingValue,
  readPath,
  readProjectedValue,
  validateSettingValue,
} from './preset-settings.js'
import { assetPlugins, effectiveRowConfig, restatePresetPlugins } from './preset-sync.js'

export const name = 'dsh-extra-plan-settings'
export const inject = []

const HERE = dirname(fileURLToPath(import.meta.url))
const TEMPLATE_AGENT_FILE = join(HERE, '..', 'assets', 'presets', 'extra-plan', 'agent.cordis.yml')

/**
 * 2 项宿主行设置的权威字段（settings 行 config 内的 webFetch / toolPresentationMode）。
 * 与 UI 8 项分开成表 = 与 descriptor 的消费方分组（extra-plan 8 / host-rows 2）同构；
 * 两项同样链 volatile（SettingsForms 只投影带该标记的字段），默认值与
 * lib/live-config.js BUILTIN_DEFAULTS 及资产模板叶值逐字一致。
 */
export const HOST_ROW_AUTHORITY_FIELDS = Object.freeze({
  webFetch: z.boolean().default(false).volatile(),
  toolPresentationMode: z.string().default('native').volatile(),
})

/**
 * settings 行 config 的宿主表单 schema（10 个字段，每字段都带 volatile 标记）：8 项 UI 设置
 * 直接声明，2 项宿主行设置来自 HOST_ROW_AUTHORITY_FIELDS —— 10 项的权威值全部落在本行。
 * ns = 本行 id（profile patch 根级 insert 行，id 唯一 → configEditor 可寻址；
 * 该 insert 不带 config → 继承层恒为 {} → 宿主 edit 永不判「值==继承层」而删行）。
 */
export const Config = z.object({
  anchoredBootstrap: z.boolean().default(true).volatile(),
  creativeMode: z.boolean().default(false).volatile(),
  runcodeCatchGate: z.boolean().default(false).volatile(),
  crossProviderPlannerModel: z.boolean().default(false).volatile(),
  plannerModel: z.string().default('deepseek-v4-pro').volatile(),
  plannerPromptSuffix: z.string().default('').volatile(),
  // 整数语义按宿主既有习语表达（schemastery 无 .int()；官方 volatile 整数字段同形，
  // 见 dsh-agent-loop 的 maxParallelToolCalls: z.number().step(1).min(1).default(10) 尾链 volatile）。
  exploreBudget: z.number().step(1).min(1).default(18).volatile(),
  otherAgentModel: z.string().default('').volatile(),
  ...HOST_ROW_AUTHORITY_FIELDS,
})

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

/** settings 行（权威值载体）定位：entry.options.id === SETTINGS_ROW_ID。 */
function findSettingsRow(editor) {
  const rows = typeof editor.configuration === 'function' ? editor.configuration() : []
  return rows.find((row) => row !== null && typeof row === 'object' && row.entry !== undefined && row.entry.options !== undefined && row.entry.options.id === SETTINGS_ROW_ID)
}

/**
 * GET 只读语义：权威值 = settings 行 config.<key>（10 项同源落点）；
 * 权威缺失/非法时回落「声明行投影现值」（未投影或旧部署），再缺失取出厂默认。
 * sources 逐项记录取值层（settings-row/projection/default），供 UI 与回归取证。
 */
function readHostRowState(editor) {
  const defaults = assetHostRowDefaults()
  const values = { ...defaults }
  const overridden = {}
  const sources = {}
  const settingsRow = findSettingsRow(editor)
  const authority = settingsRow === undefined ? null : effectiveRowConfig(settingsRow)
  const presetRow = findPresetRow(editor)
  const plugins = presetRow === undefined ? undefined : effectivePlugins(presetRow)
  for (const definition of HOST_ROW_SETTING_DEFINITIONS) {
    const key = definition.key
    overridden[key] = false
    sources[key] = 'default'
    if (authority !== null) {
      const read = readPath(authority, key)
      if (read.exists && validateSettingValue(definition, read.value)) {
        values[key] = normalizeSettingValue(definition, read.value)
        overridden[key] = true
        sources[key] = 'settings-row'
        continue
      }
    }
    const projected = readProjectedValue(plugins, definition)
    if (projected !== undefined) {
      values[key] = projected
      sources[key] = 'projection'
    }
  }
  return { located: settingsRow !== undefined || presetRow !== undefined, values, defaults, overridden, sources }
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

function proPayload(editor) {
  const defaults = assetHostRowDefaults()
  const state = { located: false, values: { ...defaults }, defaults, overridden: {}, sources: {} }
  let current = state
  try { current = readHostRowState(editor) } catch { current = state }
  const fields = HOST_ROW_SETTING_DEFINITIONS.map((definition) => publicField(
    definition,
    current.values[definition.key],
    current.defaults[definition.key],
    current.overridden === undefined ? false : current.overridden[definition.key],
    current.sources === undefined ? undefined : current.sources[definition.key],
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
        const authorityValues = {}
        const hostRowConfig = {}
        for (const definition of HOST_ROW_SETTING_DEFINITIONS) {
          if (!Object.prototype.hasOwnProperty.call(input, definition.key)) continue
          if (!validateSettingValue(definition, input[definition.key])) {
            return json(res, 400, { error: definition.key + ' has an invalid value' })
          }
          const value = normalizeSettingValue(definition, input[definition.key])
          const locator = definition.projectionLocator
          authorityValues[definition.key] = value
          const leafKey = HOST_ROW_LEAF_KEYS[definition.key]
          const merged = hostRowConfig[locator.pluginsRowId] === undefined ? {} : hostRowConfig[locator.pluginsRowId]
          hostRowConfig[locator.pluginsRowId] = { ...merged, [leafKey]: value }
        }
        if (Object.keys(authorityValues).length === 0) {
          return json(res, 400, { error: 'at least one of ' + HOST_ROW_KEYS.join('/') + ' is required' })
        }
        // ① 权威值先落 settings 行（与 8 项 UI 设置同源落点）：宿主不清理本行 →
        //    跨升级/重装/宿主删投影都不丢。行定位失败才是真正的 404（权威值无处落地）。
        const settingsRow = findSettingsRow(editor)
        if (settingsRow === undefined) {
          return json(res, 404, { error: 'settings row not found: ' + SETTINGS_ROW_ID })
        }
        try {
          await editor.edit(settingsRow.entry, (current) => ({ ...current, ...authorityValues }))
        } catch (error) {
          const message = String(error && error.message || error)
          return json(res, isLocateError(error) ? 404 : 500, { error: 'failed to write settings row: ' + message })
        }
        // ② 再投影声明行 plugins 子行（消费方是宿主行装载期快照）。
        //    投影失败不回滚权威值：投影被宿主删除是无害状态，下次启动自愈会按权威值重建。
        const presetRow = findPresetRow(editor)
        if (presetRow === undefined) {
          return json(res, 200, {
            ...proPayload(editor),
            projection: { applied: false, error: 'declaration row not found: ' + PRESET_ROW_ID },
          })
        }
        try {
          await editor.edit(presetRow.entry, (current, inherited) => restatePresetPlugins(current, inherited, { hostRowConfig, gateWords: null }, assetPlugins()))
          return json(res, 200, { ...proPayload(editor), projection: { applied: true } })
        } catch (error) {
          const message = String(error && error.message || error)
          return json(res, 200, { ...proPayload(editor), projection: { applied: false, error: message } })
        }
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
