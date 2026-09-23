// 配置热读（hot-read）：把「apply 期一次性快照」升级为「消费点现场取值」。
//
// 契约（方案 3.1）：
// 1) 路径决议优先级：options.configPath → process.env.DSH_EXTRA_PLAN_CONFIG_PATH → 预设默认路径。
//    默认路径与 lib/settings.js::agentCordisPath() 同公式（dshHomeDir()/.agent-presets/extra-plan/
//    agent.cordis.yml）。刻意不 import settings.js：该模块静态依赖 @deepseek-ai/schemastery，
//    而 index.js 的 import 图必须能在无宿主依赖的体检环境里加载（体检直接 import 本插件）。
// 2) 变更检测：fs.statSync(path) 的 { mtimeMs, size } 作为 stamp；stamp 未变 → 直接返回缓存
//    （不读盘、不解析 YAML）。单次取值成本 = 一次 statSync + 一次对象属性访问，不做监听/轮询/订阅。
// 3) 基线（方案 A：构造期读盘）：构造期**无条件 readFileSync + captureSettings 读盘一次**，以文件
//    真值作为本实例的初始基准（成功即记 stamp），首次取值不再依赖 stamp 是否变化。
//    为什么必须构造期读盘：宿主在「新会话 apply」时传入的 cfg 可能是改文件**之前**的快照——若基线
//    只取 fallbackDefaults、且恰好文件 mtimeMs 与 size 都未变，stamp 检测永远不触发，该实例第一拍
//    就会拿到旧值。构造期读盘把「文件真值」直接设为第一拍基准，堵住这个边界缺口。
//    后续取值仍只按 stamp 变化才重读：stamp 未变 → 零读盘零解析。
// 4) 失败回退：文件不存在 / statSync 失败 / YAML 解析失败 / 全部取值非法 → 回退 fallbackDefaults +
//    console.warn 一次（同实例防抖，不刷屏）；单个键 missing/ambiguous/invalid 只回退该键。
// 5) 不设计 per-Agent 缓存失效策略：新 agent = 新 WeakMap 键（见 lib/model-routing.js 的
//    plannerModelCache/otherAgentModelCache），运行中的 agent 首决议天然冻结。

import { statSync, readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { captureSettings } from './preset-settings.js'

// 8 个热读键（与 SETTING_DEFINITIONS 中的 extra-plan 项一致）。
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

// 与 settings.js::agentCordisPath() 同公式（见文件头 1)）。
function defaultAgentCordisPath() {
  const fromEnv = textOf(process.env.DSH_HOME)
  const home = fromEnv !== '' ? fromEnv : join(process.env.USERPROFILE || process.env.HOME || '', '.dsh')
  return join(home, '.agent-presets', 'extra-plan', 'agent.cordis.yml')
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

export function createLiveConfig(options) {
  const opts = options !== null && typeof options === 'object' ? options : {}
  const fallbackValues = normalizedFallback(opts.fallbackDefaults)
  const explicitPath = textOf(opts.configPath)
  const path = explicitPath !== '' ? explicitPath : (envConfigPath() !== '' ? envConfigPath() : defaultAgentCordisPath())

  let values = { ...fallbackValues }
  let stamp = null
  let warned = false

  function warnOnce(reason) {
    if (warned) return
    warned = true
    console.warn('[dsh-extra-plan] live-config: 配置热读不可用（' + reason + '），回退到 apply 期快照兜底：' + path)
  }

  // 读盘 → 解析 → 取值。失败不抛出，返回 { ok:false, reason } 由调用方回退 + 告警。
  function readDiskValues() {
    let captured = null
    try {
      captured = captureSettings(readFileSync(path, 'utf8'))
    } catch (error) {
      return { ok: false, reason: '解析失败 ' + String(error !== null && typeof error === 'object' ? error.message : error) }
    }
    const rawValues = captured !== null && captured.values !== null && typeof captured.values === 'object' ? captured.values : {}
    const states = captured !== null && captured.states !== null && typeof captured.states === 'object' ? captured.states : {}
    const next = {}
    let capturedCount = 0
    for (const key of LIVE_KEYS) {
      // 只有 captureSettings 判定 captured 的键才覆盖；missing/ambiguous/invalid 一律回退 apply 快照。
      const hit = states[key] === 'captured' && Object.prototype.hasOwnProperty.call(rawValues, key)
      if (hit) capturedCount += 1
      next[key] = hit ? pick(key, rawValues[key], fallbackValues[key]) : fallbackValues[key]
    }
    // 整份文件未捕获到任何热读键（YAML 空/坏、键值全部非法）→ 视为取值失败，整组回退 + 告警。
    if (capturedCount === 0) return { ok: false, reason: '未捕获到任何热读键（YAML 非法或键值全部非法）' }
    return { ok: true, values: next }
  }

  // ── 构造期读盘（方案 A）：无条件读盘一次，以文件真值作为本实例的初始基准 ──
  // 首次取值不依赖 stamp 变化：构造完成即可返回文件真值；读盘/解析/取值失败才回退 fallbackDefaults。
  const boot = statStamp(path)
  if (!boot.ok) {
    warnOnce('stat 失败 ' + boot.reason)
  } else {
    // stat 成功即记基线（即便随后解析失败）：stamp 未变时后续取值零读盘零解析，也不重复告警。
    stamp = boot.stamp
    const parsed = readDiskValues()
    if (parsed.ok) values = parsed.values
    else warnOnce(parsed.reason)
  }

  // 后续取值：仅当 stamp 变化才读盘 + 解析；未变时提前返回，零 IO 零解析。
  function refresh() {
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
    warnOnce(parsed.reason)
  }

  function read(key) {
    refresh()
    return values[key]
  }

  const live = {
    // 首轮极简工具 + 提示词（消费点：index.js pre-step 装配 bootstrap 收窄）
    get anchoredBootstrap() { return read('anchoredBootstrap') },
    // 是否开启 dsh 官方创造模式（**当前无热读消费点，预留**：creativeMode 整项为 apply 期快照）
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
