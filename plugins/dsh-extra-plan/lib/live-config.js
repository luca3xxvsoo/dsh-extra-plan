// 配置热读（hot-read）：把「apply 期一次性快照」升级为「消费点现场取值」。
//
// 契约（方案 T6）：
// 1) 路径决议优先级：options.configPath → process.env.DSH_EXTRA_PLAN_CONFIG_PATH →
//    configEditor.documentPath（profile cordis.patch.yml，宿主唯一可写配置文件）。
//    为什么用 configEditor.documentPath：dsh 0.1.7-rc.1 起设置值落在 profile patch 的
//    settings 行（dsh-extra-plan-settings）config 内；.agent-presets/extra-plan/
//    agent.cordis.yml 不再是任何读取方的真源（旧分发目录已退役，仅作迁移期旧值副本）。
//    刻意不 import settings.js：该模块静态依赖 @deepseek-ai/schemastery，而 index.js 的
//    import 图必须能在无宿主依赖的体检环境里加载（体检直接 import 本插件）。
//    configEditor 未就绪（无路径）时整体回退 fallbackDefaults，不再回退旧预设目录。
// 2) 变更检测：fs.statSync(path) 的 { mtimeMs, size } 作为 stamp；stamp 未变且路径未变 →
//    直接返回缓存（不读盘、不解析 YAML）。单次取值成本 = 一次 statSync + 一次对象属性访问。
// 3) 基线（构造期读盘）：构造期**无条件 readFileSync + captureRowSettings 读盘一次**，
//    以文件真值作为本实例的初始基准（成功即记 stamp）。宿主在「新会话 apply」时传入的
//    cfg 可能是改文件**之前**的快照，构造期读盘把「文件真值」直接设为第一拍基准。
// 4) 失败回退：路径不可得 / 文件不存在 / statSync 失败 / YAML 解析失败 / 全部取值非法 →
//    回退 fallbackDefaults + console.warn 一次（同实例防抖，不刷屏）；单个键
//    missing/ambiguous/invalid 只回退该键。
// 5) fallback 链：settings 行 override（profile patch 真值）→ cfg（apply 期快照）
//    → BUILTIN_DEFAULTS。不设计 per-Agent 缓存失效策略：新 agent = 新 WeakMap 键。

import { statSync, readFileSync } from 'node:fs'
import { captureRowSettings } from './preset-settings.js'

// 8 个热读键（与 SETTING_DEFINITIONS 中 extra-plan 组一致）。
const LIVE_KEYS = Object.freeze([
  'anchoredBootstrap',
  'creativeMode',
  'runcodeCatchGate',
  'crossProviderPlannerModel',
  'plannerModel',
  'plannerPromptSuffix',
  'exploreBudget',
  'otherAgentModel',
])

// 调用方未提供 fallbackDefaults 时的内置兜底（与 index.js apply 期 cfg 快照同口径）。
const BUILTIN_DEFAULTS = Object.freeze({
  anchoredBootstrap: true,
  creativeMode: false,
  runcodeCatchGate: false,
  crossProviderPlannerModel: false,
  plannerModel: 'deepseek-v4-pro',
  plannerPromptSuffix: '',
  exploreBudget: 18,
  otherAgentModel: '',
})

function textOf(value) {
  return typeof value === 'string' && value.trim() !== '' ? value.trim() : ''
}

function envConfigPath() {
  return textOf(process.env.DSH_EXTRA_PLAN_CONFIG_PATH)
}

// stamp = mtimeMs + size；失败返回 { ok:false, reason }，调用方据此回退且不抛出。
function statStamp(path) {
  try {
    const info = statSync(path)
    return { ok: true, stamp: String(info.mtimeMs) + ':' + String(info.size) }
  } catch (error) {
    const code = error !== null && typeof error === 'object' && typeof error.code === 'string' ? error.code : ''
    return { ok: false, reason: code !== '' ? code : String(error !== null && typeof error === 'object' ? error.message : error) }
  }
}

function booleanOr(raw, fallbackValue) {
  return raw === true ? true : raw === false ? false : fallbackValue
}

function stringOr(raw, fallbackValue) {
  return typeof raw === 'string' ? raw : fallbackValue
}

function positiveIntegerOr(raw, fallbackValue) {
  return typeof raw === 'number' && Number.isInteger(raw) && raw > 0 ? raw : fallbackValue
}

function pick(key, raw, fallbackValue) {
  if (key === 'anchoredBootstrap' || key === 'creativeMode' || key === 'runcodeCatchGate' || key === 'crossProviderPlannerModel') {
    return booleanOr(raw, fallbackValue)
  }
  if (key === 'plannerModel' || key === 'otherAgentModel') {
    return typeof raw === 'string' ? raw.trim() : fallbackValue
  }
  if (key === 'exploreBudget') return positiveIntegerOr(raw, fallbackValue)
  return stringOr(raw, fallbackValue)
}

function normalizedFallback(fallbackDefaults) {
  const source = fallbackDefaults !== null && typeof fallbackDefaults === 'object' ? fallbackDefaults : {}
  const out = {}
  for (const key of LIVE_KEYS) {
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
      captured = captureRowSettings(readFileSync(path, 'utf8'))
    } catch (error) {
      return { ok: false, reason: '解析失败 ' + String(error !== null && typeof error === 'object' ? error.message : error) }
    }
    const rawValues = captured !== null && captured.values !== null && typeof captured.values === 'object' ? captured.values : {}
    const states = captured !== null && captured.states !== null && typeof captured.states === 'object' ? captured.states : {}
    const next = {}
    let capturedCount = 0
    for (const key of LIVE_KEYS) {
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
  }
  return Object.freeze(live)
}
