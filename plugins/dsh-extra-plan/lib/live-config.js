// 在消费点热读配置，不只信任 apply 快照。
// 路径优先级：options.configPath → DSH_EXTRA_PLAN_CONFIG_PATH → configEditor.documentPath；
// settings 行是权威值，旧预设目录不作回退。
// stamp 由路径和 stat 元数据组成；未变则跳过读盘和 YAML 解析。
// 构造期先读一次源文件建立初始基线，避免宿主 cfg 快照过期。
// 路径、文件、stat、YAML 或值失败时按键回退并只告警一次。
// 回退顺序为 settings 行覆盖 → apply cfg → BUILTIN_DEFAULTS；每个 agent 的缓存键保持隔离。
// 10 项共享同一 row locator：8 项在此热读，2 项由宿主装载期快照消费，投影改变后需重启宿主。

import { statSync, readFileSync } from 'node:fs'
import {
  EXTRA_PLAN_SETTING_DEFINITIONS,
  HOST_ROW_SETTING_DEFINITIONS,
  SETTING_DEFINITIONS,
  captureRowSettings,
  getSettingDefinition,
  normalizeSettingValue,
  validateSettingValue,
} from './preset-settings.js'

// 8 个热读键（与 SETTING_DEFINITIONS 中 extra-plan 组一致）。
const LIVE_KEYS = Object.freeze(EXTRA_PLAN_SETTING_DEFINITIONS.map((item) => item.key))

// 2 项宿主行设置键（权威值同在 settings 行；消费方是宿主行装载期快照 → 改后需重启）。
const HOST_ROW_KEYS = Object.freeze(HOST_ROW_SETTING_DEFINITIONS.map((item) => item.key))
// 本实例一次读盘覆盖的全部键（10 项）。
const READ_KEYS = Object.freeze([...LIVE_KEYS, ...HOST_ROW_KEYS])

// 调用方未提供 fallbackDefaults 时的内置兜底（与 index.js apply 期 cfg 快照同口径；
// 各键兜底与资产模板叶值 / settings.js Config 默认值同源（同一生成常量）逐字一致）。
const BUILTIN_DEFAULTS = Object.freeze(Object.fromEntries(
  SETTING_DEFINITIONS.map((item) => [item.key, item.defaultValue]),
))

function textOf(value) {
  return typeof value === 'string' && value.trim() !== '' ? value.trim() : ''
}

function envConfigPath() {
  return textOf(process.env.DSH_EXTRA_PLAN_CONFIG_PATH)
}

// stamp 优先使用 dev/ino/size/mtimeNs/ctimeNs；失败返回 { ok:false, reason }，调用方据此回退且不抛出。
function statStamp(path) {
  try {
    const info = statSync(path, { bigint: true })
    const fields = ['dev', 'ino', 'size', 'mtimeNs', 'ctimeNs']
    if (fields.every((key) => typeof info[key] === 'bigint')) {
      return { ok: true, stamp: fields.map((key) => String(info[key])).join(':') }
    }
    const fallback = statSync(path)
    return { ok: true, stamp: [fallback.ino, fallback.size, fallback.mtimeMs, fallback.ctimeMs].map((value) => String(value)).join(':') }
  } catch (error) {
    try {
      const fallback = statSync(path)
      return { ok: true, stamp: [fallback.ino, fallback.size, fallback.mtimeMs, fallback.ctimeMs].map((value) => String(value)).join(':') }
    } catch (fallbackError) {
      const code = fallbackError !== null && typeof fallbackError === 'object' && typeof fallbackError.code === 'string' ? fallbackError.code : ''
      return { ok: false, reason: code !== '' ? code : String(fallbackError !== null && typeof fallbackError === 'object' ? fallbackError.message : fallbackError) }
    }
  }
}

function pick(key, raw, fallbackValue) {
  const definition = getSettingDefinition(key)
  if (!validateSettingValue(definition, raw)) return fallbackValue
  return normalizeSettingValue(definition, raw)
}

function normalizedFallback(fallbackDefaults) {
  const source = fallbackDefaults !== null && typeof fallbackDefaults === 'object' ? fallbackDefaults : {}
  const out = {}
  for (const key of READ_KEYS) {
    out[key] = key in source ? pick(key, source[key], BUILTIN_DEFAULTS[key]) : BUILTIN_DEFAULTS[key]
  }
  return out
}

/**
 * @param options.resolveDocumentPath 返回 profile patch 绝对路径的函数（宿主侧
 *   = ctx.get('configEditor').documentPath）；构造期与每次取值现场调用。
 * @param options.fallbackDefaults apply 期 cfg 快照（fallback 链第二段）。
 * @param options.configPath 显式路径（最高优先级；测试与诊断用）。
 */
export function createLiveConfig(options) {
  const opts = options !== null && typeof options === 'object' ? options : {}
  const fallbackValues = normalizedFallback(opts.fallbackDefaults)
  const explicitPath = textOf(opts.configPath)
  const resolver = typeof opts.resolveDocumentPath === 'function' ? opts.resolveDocumentPath : null

  let path = ''
  let values = { ...fallbackValues }
  let stamp = null
  let warned = false

  function warnOnce(reason) {
    if (warned) return
    warned = true
    console.warn('[dsh-extra-plan] live-config: 配置热读不可用（' + reason + '），回退到 apply 期快照兜底：' + (path === '' ? '(路径不可得)' : path))
  }

  // 路径决议：显式 → 环境变量 → configEditor.documentPath。现场解析（构造期与每次取值）。
  function currentPath() {
    if (explicitPath !== '') return explicitPath
    const fromEnv = envConfigPath()
    if (fromEnv !== '') return fromEnv
    if (resolver === null) return ''
    try {
      return textOf(resolver())
    } catch (error) {
      return ''
    }
  }

  // 读盘 → 解析 → 取值。失败不抛出，返回 { ok:false, reason } 由调用方回退 + 告警。
  function readDiskValues() {
    let captured = null
    try {
      // 10 项同源：全部按 rowLocator（settings 行 id + config.<key>）定位。
      captured = captureRowSettings(readFileSync(path, 'utf8'), SETTING_DEFINITIONS)
    } catch (error) {
      return { ok: false, reason: '解析失败 ' + String(error !== null && typeof error === 'object' ? error.message : error) }
    }
    const rawValues = captured !== null && captured.values !== null && typeof captured.values === 'object' ? captured.values : {}
    const states = captured !== null && captured.states !== null && typeof captured.states === 'object' ? captured.states : {}
    const next = {}
    let capturedCount = 0
    for (const key of READ_KEYS) {
      // 只有 capturedRowSettings 判定 captured 的键才覆盖；missing/ambiguous/invalid 一律回退 cfg 快照。
      const hit = states[key] === 'captured' && Object.prototype.hasOwnProperty.call(rawValues, key)
      if (hit) capturedCount += 1
      next[key] = hit ? pick(key, rawValues[key], fallbackValues[key]) : fallbackValues[key]
    }
    // profile patch 内没有 settings 行（首次安装＝无任何 override）→ 视为「无热读真值」，
    // 整组回退 cfg 快照且不告警（这是正常的出厂形态，不是故障）。
    if (capturedCount === 0) return { ok: false, reason: 'none', silent: true }
    return { ok: true, values: next }
  }

  // ── 构造期读盘：无条件读盘一次，以文件真值作为本实例的初始基准 ──
  path = currentPath()
  if (path === '') {
    warnOnce('路径不可得（configEditor 未就绪且无显式配置路径）')
  } else {
    const boot = statStamp(path)
    if (!boot.ok) {
      warnOnce('stat 失败 ' + boot.reason)
    } else {
      // stat 成功即记基线（即便随后解析失败）：stamp 未变时后续取值零读盘零解析，也不重复告警。
      stamp = boot.stamp
      const parsed = readDiskValues()
      if (parsed.ok) values = parsed.values
      else if (parsed.silent !== true) warnOnce(parsed.reason)
    }
  }

  // 后续取值：路径变化或 stamp 变化才读盘 + 解析；未变时提前返回，零 IO 零解析。
  function refresh() {
    const next = currentPath()
    if (next !== path) {
      path = next
      stamp = null
      if (path === '') {
        values = { ...fallbackValues }
        warnOnce('路径不可得（configEditor 未就绪且无显式配置路径）')
        return
      }
    }
    if (path === '') return
    const probe = statStamp(path)
    if (!probe.ok) {
      if (stamp === null) return
      stamp = null
      values = { ...fallbackValues }
      warnOnce('stat 失败 ' + probe.reason)
      return
    }
    if (probe.stamp === stamp) return
    stamp = probe.stamp
    const parsed = readDiskValues()
    if (parsed.ok) {
      values = parsed.values
      return
    }
    values = { ...fallbackValues }
    if (parsed.silent !== true) warnOnce(parsed.reason)
  }

  function read(key) {
    refresh()
    return values[key]
  }

  const live = {
    // 首轮极简工具 + 提示词（消费点：index.js pre-step 装配 bootstrap 收窄）
    get anchoredBootstrap() { return read('anchoredBootstrap') },
    // dsh 官方创造模式开关（消费点：index.js C 矩阵隐藏集合 + 装配投影 hideCordis）
    get creativeMode() { return read('creativeMode') },
    // PTC 模式下的 try/catch 闸门（消费点：index.js runCodeGroupDenyReason 组判定）
    get runcodeCatchGate() { return read('runcodeCatchGate') },
    // 跨提供方 planner 模型选择（消费点：lib/model-routing.js 双 resolver 入口）
    get crossProviderPlannerModel() { return read('crossProviderPlannerModel') },
    // pro 规划默认模型（消费点：lib/model-routing.js planner 解析）
    get plannerModel() { return read('plannerModel') },
    // pro 规划额外引导后缀（消费点：index.js pre-step 拼接）
    get plannerPromptSuffix() { return read('plannerPromptSuffix') },
    // pro 规划探查额度（消费点：index.js 预算文案/单实例子调用上限/组判定）
    get exploreBudget() { return read('exploreBudget') },
    // 其他子代理默认模型（消费点：lib/model-routing.js 非 planner 解析）
    get otherAgentModel() { return read('otherAgentModel') },
    // 2 项宿主行设置的权威值读口（落点 = settings 行 config；消费方是宿主行装载期快照，
    // 本插件不消费它们——改后需重启宿主才生效，与上面 8 项的「立即生效」不同）
    get webFetch() { return read('webFetch') },
    get toolPresentationMode() { return read('toolPresentationMode') },
  }
  return Object.freeze(live)
}
