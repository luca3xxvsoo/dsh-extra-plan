// 在消费点热读配置，不只信任 apply 快照。
// 路径优先级：options.configPath → DSH_EXTRA_PLAN_CONFIG_PATH → configEditor.documentPath；
// settings 行是权威值，旧预设目录不作回退。
// stamp 由路径和 stat 元数据组成；未变则跳过读盘和 YAML 解析。
// 构造期先读一次源文件建立初始基线，避免宿主 cfg 快照过期。
// 构造期同时做装载期严格校验：settings 行在（按行 id）但 8 个热读键出现 missing /
// ambiguous / invalid → 直接抛错、插件不装载；整行缺席（出厂形态）仍静默按 cfg 快照启动。
// 运行期（refresh 触发的读盘）保持 fail-safe：路径、文件、stat、YAML 或值失败时按键回退
// 并只告警一次，其中 ambiguous / invalid 显性告警、missing 静默。
// 回退顺序为 settings 行覆盖 → apply cfg → BUILTIN_DEFAULTS；每个 agent 的缓存键保持隔离。
// 10 项共享同一 row locator：8 项在此热读，2 项由宿主装载期快照消费，投影改变后需重启宿主。

import { statSync, readFileSync } from 'node:fs'
import { isAbsolute, resolve as pathResolve } from 'node:path'
import {
  EXTRA_PLAN_SETTING_DEFINITIONS,
  SETTINGS_ROW_ID,
  SETTINGS_ROW_NAME,
  SETTING_DEFINITIONS,
  captureRowSettings,
  getSettingDefinition,
  normalizeSettingValue,
  validateSettingValue,
} from './preset-settings.js'
import { resolveWorkspacePath, resolveHostPath, validateReadTarget } from './path-policy.js'

const LIVE_KEYS = Object.freeze(EXTRA_PLAN_SETTING_DEFINITIONS.map((item) => item.key))
const READ_KEYS = LIVE_KEYS
const BUILTIN_DEFAULTS = Object.freeze(Object.fromEntries(
  SETTING_DEFINITIONS.map((item) => [item.key, item.defaultValue]),
))

function textOf(value) {
  return typeof value === 'string' && value.trim() !== '' ? value.trim() : ''
}

function envConfigPath() {
  return textOf(process.env.DSH_EXTRA_PLAN_CONFIG_PATH)
}

function errorText(error) {
  return error instanceof Error ? error.message : String(error)
}

function sameAbsolutePath(left, right) {
  const a = pathResolve(left)
  const b = pathResolve(right)
  return process.platform === 'win32' ? a.toLowerCase() === b.toLowerCase() : a === b
}

function exactHostCapabilities(context, value) {
  const capabilities = context !== null && context !== undefined && context.hostCapabilities !== undefined && context.hostCapabilities !== null
    ? Object.values(context.hostCapabilities)
    : []
  return capabilities
    .filter((item) => item !== null && typeof item === 'object' && item.type === 'file' && item.purpose === 'config-editor' && typeof item.path === 'string' && sameAbsolutePath(item.path, value))
    .sort((left, right) => {
      const rank = (item) => item.name === 'profilePatch' ? 0 : item.name === 'editorDocument' ? 1 : 2
      return rank(left) - rank(right) || String(left.name).localeCompare(String(right.name))
    })
}

function exactHostTarget(context, value) {
  const candidates = exactHostCapabilities(context, value)
  if (candidates.length === 0) throw new Error('配置源不匹配可信精确Host能力')
  return resolveHostPath(context, value, { capability: candidates[0].name, purpose: 'config-editor' })
}

function resolveAbsoluteTarget(context, value, options = {}) {
  let workspaceError
  let hostError
  if (options.preferHost === true) {
    return exactHostTarget(context, value)
  }
  try { return resolveWorkspacePath(context, value, { purpose: 'live-config' }) } catch (error) { workspaceError = error }
  try { return exactHostTarget(context, value) } catch (error) { hostError = hostError || error }
  throw workspaceError || hostError || new Error('配置路径不在授权H/W根内')
}

function contextFrom(options, agent) {
  if (typeof options.getPathContext === 'function') {
    const supplied = options.getPathContext(agent)
    if (supplied !== undefined && supplied !== null) return supplied
  }
  if (options.pathContext !== undefined && options.pathContext !== null) return options.pathContext
  return null
}

function targetFromValue(context, value, source = 'workspace') {
  if (context === null) throw new Error('配置源缺少明确H/W根')
  if (value !== null && typeof value === 'object' && !Array.isArray(value) && typeof value.path === 'string') {
    if (value.kind === 'workspace') return resolveWorkspacePath(context, value.path, { purpose: 'live-config' })
    if (value.kind === 'host' && typeof value.capability === 'string') return resolveHostPath(context, value.path, { capability: value.capability, purpose: 'config-editor' })
    throw new Error('配置源目标未携带可信H/W分类与精确能力')
  }
  if (typeof value !== 'string' || value.trim() === '') throw new Error('配置源路径不可用')
  if (source === 'document' && !isAbsolute(value)) throw new Error('宿主文档路径必须是绝对路径并匹配精确Host能力')
  return isAbsolute(value)
    ? resolveAbsoluteTarget(context, value, { preferHost: source === 'document' })
    : resolveWorkspacePath(context, value, { purpose: 'live-config' })
}

function targetOf(options, resolver, targetResolver, agent) {
  const context = contextFrom(options, agent)
  const useTargetResolver = targetResolver !== null
  const raw = useTargetResolver ? targetResolver(agent) : resolver === null ? '' : resolver()
  return targetFromValue(context, raw, useTargetResolver || resolver !== null ? 'document' : 'workspace')
}

function statStamp(target, context) {
  try {
    const readable = validateReadTarget(context, target, { expectedType: 'file', purpose: 'live-config' })
    const path = readable.realPath
    try {
      const info = statSync(path, { bigint: true })
      const fields = ['dev', 'ino', 'size', 'mtimeNs', 'ctimeNs']
      if (fields.every((key) => typeof info[key] === 'bigint')) return { ok: true, stamp: fields.map((key) => String(info[key])).join(':'), realPath: path }
    } catch { /* fallback below keeps the same authorized real path */ }
    const fallback = statSync(path)
    return { ok: true, stamp: [fallback.ino, fallback.size, fallback.mtimeMs, fallback.ctimeMs].map((value) => String(value)).join(':'), realPath: path }
  } catch (error) {
    const code = error !== null && typeof error === 'object' && typeof error.code === 'string' ? error.code : ''
    return { ok: false, reason: code !== '' ? code : errorText(error) }
  }
}

function pick(key, raw, fallbackValue) {
  const definition = getSettingDefinition(key)
  if (!validateSettingValue(definition, raw)) return fallbackValue
  return normalizeSettingValue(definition, raw)
}

function describeProblems(problems) {
  return problems.map((item) => item.key + ' = ' + item.state).join(', ')
}

function normalizedFallback(fallbackDefaults) {
  const source = fallbackDefaults !== null && typeof fallbackDefaults === 'object' ? fallbackDefaults : {}
  const out = {}
  for (const key of READ_KEYS) out[key] = key in source ? pick(key, source[key], BUILTIN_DEFAULTS[key]) : BUILTIN_DEFAULTS[key]
  return out
}

/**
 * @param options.resolveDocumentPath 返回 profile patch 绝对路径的函数（宿主侧
 *   = ctx.get('configEditor').documentPath）；构造期与每次取值现场调用。
 * @param options.resolveDocumentTarget 可选，返回已分类的可信H/W目标。
 * @param options.getPathContext 返回包含workspaceRoot/hostDataRoot/capabilities的上下文。
 * @param options.fallbackDefaults apply 期 cfg 快照（fallback 链第二段）。
 * @param options.configPath 显式路径（最高优先级；必须落在已授权H/W根）。
 */
export function createLiveConfig(options) {
  const opts = options !== null && typeof options === 'object' ? options : {}
  const fallbackValues = normalizedFallback(opts.fallbackDefaults)
  const explicitPath = textOf(opts.configPath)
  const resolver = typeof opts.resolveDocumentPath === 'function' ? opts.resolveDocumentPath : null
  const targetResolver = typeof opts.resolveDocumentTarget === 'function' ? opts.resolveDocumentTarget : null

  let path = ''
  let target = null
  let values = { ...fallbackValues }
  let stamp = null
  let warned = false

  function warnOnce(reason) {
    if (warned) return
    warned = true
    console.warn('[dsh-extra-plan] live-config: 配置热读不可用（' + reason + '），回退到 apply 期快照兜底：' + (path === '' ? '(路径不可得)' : path))
  }

  function currentResolved(agent) {
    try {
      if (explicitPath !== '') {
        const next = targetFromValue(contextFrom(opts, agent), explicitPath)
        return { path: next.path, target: next }
      }
      const fromEnv = envConfigPath()
      if (fromEnv !== '') {
        const next = targetFromValue(contextFrom(opts, agent), fromEnv)
        return { path: next.path, target: next }
      }
      if (resolver === null && targetResolver === null) return { path: '', target: null }
      const next = targetOf(opts, resolver, targetResolver, agent)
      return { path: next.path, target: next }
    } catch (error) {
      return { path: '', target: null, reason: errorText(error) }
    }
  }

  function currentContext(agent) {
    return contextFrom(opts, agent)
  }

  function readDiskValues(readTarget, agent) {
    let captured = null
    try {
      const context = currentContext(agent)
      const readable = validateReadTarget(context, readTarget, { expectedType: 'file', purpose: 'live-config' })
      captured = captureRowSettings(readFileSync(readable.realPath, 'utf8'), SETTING_DEFINITIONS)
    } catch (error) {
      return { ok: false, reason: '解析失败 ' + errorText(error) }
    }
    const rawValues = captured !== null && captured.values !== null && typeof captured.values === 'object' ? captured.values : {}
    const states = captured !== null && captured.states !== null && typeof captured.states === 'object' ? captured.states : {}
    const next = {}
    const problems = []
    for (const key of READ_KEYS) {
      const state = typeof states[key] === 'string' ? states[key] : 'missing'
      const hit = state === 'captured' && Object.prototype.hasOwnProperty.call(rawValues, key)
      if (!hit) problems.push({ key, state })
      next[key] = hit ? pick(key, rawValues[key], fallbackValues[key]) : fallbackValues[key]
    }
    if (captured === null || captured.rowPresent !== true) return { ok: false, reason: 'none', silent: true, values: next }
    if (problems.length === 0) return { ok: true, values: next }
    return { ok: false, reason: describeProblems(problems), problems, values: next }
  }

  const boot = currentResolved(undefined)
  path = boot.path
  target = boot.target
  if (path === '') {
    warnOnce(boot.reason || '路径不可得（configEditor 未就绪且无显式配置路径）')
  } else {
    const initial = statStamp(target, currentContext(undefined))
    if (!initial.ok) warnOnce('stat 失败 ' + initial.reason)
    else {
      stamp = initial.stamp
      const parsed = readDiskValues(target, undefined)
      if (Array.isArray(parsed.problems)) throw new Error('extra-plan: settings 行校验失败：' + parsed.reason + '（期望在 ' + SETTINGS_ROW_ID + ' 行、name 为 ' + SETTINGS_ROW_NAME + ' 的 config 内取得合法值）')
      if (parsed.ok) values = parsed.values
      else if (parsed.silent !== true) warnOnce(parsed.reason)
    }
  }

  function refresh(agent) {
    const next = currentResolved(agent)
    if (next.path !== path) {
      path = next.path
      target = next.target
      stamp = null
      if (path === '') {
        values = { ...fallbackValues }
        warnOnce(next.reason || '路径不可得（configEditor 未就绪且无显式配置路径）')
        return
      }
    }
    if (path === '' || target === null) return
    const probe = statStamp(target, currentContext(agent))
    if (!probe.ok) {
      stamp = null
      values = { ...fallbackValues }
      warnOnce('stat 失败 ' + probe.reason)
      return
    }
    if (probe.stamp === stamp) return
    stamp = probe.stamp
    const parsed = readDiskValues(target, agent)
    if (parsed.ok) {
      values = parsed.values
      return
    }
    values = Array.isArray(parsed.problems) && parsed.values !== null && parsed.values !== undefined ? { ...parsed.values } : { ...fallbackValues }
    if (Array.isArray(parsed.problems)) {
      const hard = parsed.problems.filter((item) => item.state === 'ambiguous' || item.state === 'invalid')
      if (hard.length > 0) warnOnce('settings 行键值不可用：' + describeProblems(hard))
      return
    }
    if (parsed.silent !== true) warnOnce(parsed.reason)
  }

  function read(key, agent) {
    refresh(agent)
    return values[key]
  }

  const live = {
    get(key, agent) { return read(key, agent) },
    get anchoredBootstrap() { return read('anchoredBootstrap') },
    get creativeMode() { return read('creativeMode') },
    get runcodeCatchGate() { return read('runcodeCatchGate') },
    get crossProviderPlannerModel() { return read('crossProviderPlannerModel') },
    get plannerModel() { return read('plannerModel') },
    get plannerPromptSuffix() { return read('plannerPromptSuffix') },
    get exploreBudget() { return read('exploreBudget') },
    get otherAgentModel() { return read('otherAgentModel') },
  }
  return Object.freeze(live)
}
