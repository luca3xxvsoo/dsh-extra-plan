// dsh-extra-plan-settings 的宿主侧实现。
// settings 行 config 是全部 10 个值的权威载体（8 项 UI + 2 项宿主行设置）。
// 客户端只做一次 SettingsForms/configForms mutate；PUT 校验后只更新声明行投影，
// 投影失败不回滚权威行。
// GET 按 settings 行 → 声明行投影 → 默认值逐项回退；缺失投影可恢复。
// 本模块不写 cordis.patch.yml 或旧预设目录，也不负责 QQBot。

import { readFileSync } from 'node:fs'
import { isDeepStrictEqual } from 'node:util'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import z from '@deepseek-ai/schemastery'
import { DEFAULT_PLANNER_PROMPT_SUFFIX } from './preset-defaults.generated.js'
import {
  HOST_ROW_LEAF_KEYS,
  HOST_ROW_SETTING_DEFINITIONS,
  PRESET_ROW_ID,
  SETTINGS_ROW_ID,
  effectivePluginsOf,
  hostRowDefaultsFromTemplate,
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
 * 8 项默认值与 BUILTIN_DEFAULTS 同源（同一生成常量）、与资产叶值逐字一致。
 */
export const Config = z.object({
  anchoredBootstrap: z.boolean().default(true).volatile(),
  creativeMode: z.boolean().default(false).volatile(),
  runcodeCatchGate: z.boolean().default(false).volatile(),
  crossProviderPlannerModel: z.boolean().default(false).volatile(),
  plannerModel: z.string().default('deepseek-v4-pro').volatile(),
  plannerPromptSuffix: z.string().default(DEFAULT_PLANNER_PROMPT_SUFFIX).volatile(),
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
  const defaults = hostRowDefaultsFromTemplate(readFileSync(TEMPLATE_AGENT_FILE, 'utf8'))
  const values = { ...defaults }
  const overridden = {}
  const sources = {}
  const settingsRow = findSettingsRow(editor)
  const authority = settingsRow === undefined ? null : effectiveRowConfig(settingsRow)
  const presetRow = findPresetRow(editor)
  const plugins = presetRow === undefined ? undefined : effectivePluginsOf(presetRow)
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
  const defaults = hostRowDefaultsFromTemplate(readFileSync(TEMPLATE_AGENT_FILE, 'utf8'))
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
        // 投影声明行 plugins 子行（消费方是宿主行装载期快照）。
        //    投影失败不回滚权威值：投影被宿主删除是无害状态，下次启动自愈会按权威值重建。
        const presetRow = findPresetRow(editor)
        if (presetRow === undefined) {
          return json(res, 200, {
            ...proPayload(editor),
            projection: { applied: false, error: 'declaration row not found: ' + PRESET_ROW_ID },
          })
        }
        try {
          // no-op 不写盘（口径与 preset-sync 三维 idle 一致）：以资产为基底、写回本次投影值与
          // carry 词表后若与当前生效 plugins 深等 → 投影已达成，跳过 editor.edit —— 避免宿主
          // edit 在 profile patch 无声明行时 append 冻结副本与无谓 reload（reload 失败还会走
          // 宿主回滚）。深等不成立（或生效 plugins 不可读）时照常走 editor.edit（旧行为）。
          const base = assetPlugins()
          const currentPlugins = effectivePluginsOf(presetRow)
          const next = restatePresetPlugins(currentPlugins === undefined ? {} : { plugins: currentPlugins }, {}, { hostRowConfig, gateWords: null }, base)
          if (currentPlugins !== undefined && isDeepStrictEqual(next.plugins, currentPlugins)) {
            return json(res, 200, { ...proPayload(editor), projection: { applied: true } })
          }
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
