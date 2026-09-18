// @local/dsh-extra-plan lib/model-routing.js (v0.2.1)
// planner / 非 planner 子代理模型路由解析（自 index.js 拆分，逐字保留原实现）。
//   顶层纯函数：isExplicitRoute / isExplicitEffort / resolveAgentRouteSources /
//   decidePlannerModelUse / sortPlannerCandidates + 三个阻断文案与探针超时常量，
//   经 index.js 的 decisions re-export 供场景测试直接复用（防复制漂移）。
//   createModelRouting：per-apply 工厂。plannerModelCache / otherAgentModelCache 在工厂内
//   新建（每次 apply 各一份 WeakMap），绝不提升为模块全局——否则跨插件实例串 Agent 缓存。
//   llm / agents / 诊断路径按惰性 getter 取用（ctx 服务与 apply 内常量可能在工厂建立后才就绪）。
// 依赖方向：本模块反向引用 index.js 一律禁止（避免循环依赖）。resolveAgentRouteSources 依赖的
//   isSubagentChild 统一来自 lib/agent-session.js（唯一来源；本模块不再留镜像副本）。
import { appendFileSync } from 'node:fs'
import { createUserMessage } from '@deepseek-ai/dsh-llm'
import { isSubagentChild } from './agent-session.js'

// 显式路由判定（对齐官方 model-selection.ts L118-119 routeChanged 口径：
// provider 或 model 任一与父值不同即视为显式）。空串/undefined 视为「无选择」。
export function isExplicitRoute(rProvider, rModel, pProvider, pModel) {
  const rp = typeof rProvider === 'string' && rProvider !== '' ? rProvider : undefined
  const rm = typeof rModel === 'string' && rModel !== '' ? rModel : undefined
  if (rp !== undefined && (rp !== pProvider || rm !== pModel)) return true
  if (rm !== undefined && rm !== pModel) return true
  return false
}

// 显式 effort 判定（对齐官方 L189-190）：只有 resolved 存在且 ≠ 父值才算显式；
// undefined/空串（adapter 默认被 requestProposal 剥除后）不算显式。
export function isExplicitEffort(rEffort, pEffort) {
  return typeof rEffort === 'string' && rEffort !== '' && rEffort !== pEffort
}

// probe（探查者）子代理模型跟随顶层主会话：沿 parentSession 链上溯（probe→planner→
// 主会话，多级委派亦逐层追溯），取顶层主会话 requestHeader().config 作为
// provider/model/maxTokens 注入源（不再取直接父/委派方值）。链任一层断裂（get 失败/
// requestHeader 非函数或抛异常/config 为 null/depth 达 8 上限）→ 整体回退直接父会话
// config（与钩子改动前行为逐字节等价），整段不抛错。注入判定沿现状口径：routeExplicit
// 基准为直接父（isExplicitRoute 复用）、maxTokens 无条件继承、effort 取直接父
// reasoningEffort（顶层 effort 不渗入）。模块顶层纯函数：不引用 probeClaimFor/
// pendingProbeClaims/plannerModelCache/plannerModel/ctx 闭包变量；经 decisions 导出供场景测试直接复用。
function requestConfigSnapshot(agent) {
  if (agent === undefined || agent === null || agent.session === undefined || agent.session === null) return null
  if (typeof agent.session.requestHeader !== 'function') return null
  let header
  try { header = agent.session.requestHeader() } catch (error) { return null }
  const config = header !== undefined && header !== null && header.config !== undefined && header.config !== null ? header.config : null
  if (config === null || typeof config !== 'object') return null
  return {
    provider: typeof config.provider === 'string' && config.provider !== '' ? config.provider : undefined,
    model: typeof config.model === 'string' && config.model !== '' ? config.model : undefined,
    maxTokens: typeof config.maxTokens === 'number' && config.maxTokens > 0 ? config.maxTokens : undefined,
    reasoningEffort: typeof config.reasoningEffort === 'string' ? config.reasoningEffort : '',
  }
}

function agentFromRegistry(agents, id) {
  if (agents === undefined || agents === null || typeof agents.get !== 'function') return undefined
  try { return agents.get(id) } catch (error) { return undefined }
}

// 返回直接父与顶层主会话的 owned route snapshot；链断裂时不把中间 child 当主会话。
export function resolveAgentRouteSources(agent, agents) {
  const header = agent !== undefined && agent !== null && agent.session !== undefined && agent.session !== null && agent.session.header !== undefined && agent.session.header !== null ? agent.session.header : null
  const parentSession = header !== null ? header.parentSession : undefined
  if (typeof parentSession !== 'string') return { available: false, complete: false, direct: null, source: null }
  const parent = agentFromRegistry(agents, parentSession)
  const direct = requestConfigSnapshot(parent)
  if (direct === null) return { available: false, complete: false, direct: null, source: null }
  let source = direct
  let current = parent
  let complete = true
  let depth = 0
  while (isSubagentChild(current)) {
    const currentHeader = current !== undefined && current !== null && current.session !== undefined && current.session !== null && current.session.header !== undefined && current.session.header !== null ? current.session.header : null
    const upId = currentHeader !== null ? currentHeader.parentSession : undefined
    if (typeof upId !== 'string') { complete = false; break }
    const up = agentFromRegistry(agents, upId)
    if (up === undefined) { complete = false; break }
    const upConfig = requestConfigSnapshot(up)
    if (upConfig === null) { complete = false; break }
    current = up
    source = upConfig
    depth += 1
    if (depth >= 8) { complete = false; break }
  }
  return { available: true, complete, direct, source: complete ? source : null }
}

// ── T2：plannerModel 可用性判定（纯函数；resolvePlannerEntry 唯一调用点） ──
// 输入：plannerModel（string，'' = 设置页显式清空 = 继承主会话模型）、provider（父会话
// provider，可能 undefined）、catalog（模型目录查询结果描述）：
//   { kind: 'ok', ids: [...] }  目录查询成功且清单非空
// | { kind: 'empty' }           适配器未覆写发现能力（静默返回 []）
// | { kind: 'error' }           查询抛错（如 provider 未注册 → NO_ADAPTER）
// | { kind: 'no-llm' }          取不到 llm 服务 / 未发起查询
// 输出：{ use, degraded, diag, reason }
//   use      = 是否用 plannerModel 覆盖 model（false = planner 继承主会话模型）
//   degraded = 是否发生「静默降级」（配置的模型未被采用，供口径/回溯）
//   diag     = 需要落盘诊断时的 decision 值，否则 null
//   reason   = 判定原因（诊断留痕用）
// 规则（顺序即设计口径）：
//   1. plannerModel === '' → 不覆盖（T4 置空语义），不落诊断；
//   2. plannerModel 非空且 provider 有值：
//      a. 目录成功、清单非空且未命中 → 不覆盖（静默降级，diag:'inherit-parent'）；
//      b. 清单为空 / 抛错 / 取不到 llm → 保守沿用 plannerModel（目录 advisory：
//         空清单≠不可用，防误杀未实现发现能力的适配器），diag:'keep-planner-model'；
//      c. 命中 → 覆盖（现行为），不落诊断；
//   3. plannerModel 非空且 provider 无值（父会话空闲等）→ 沿用 plannerModel，不落诊断。
export function decidePlannerModelUse(plannerModel, provider, catalog) {
  const configured = typeof plannerModel === 'string' ? plannerModel : ''
  if (configured === '') return { use: false, degraded: false, diag: null, reason: 'empty-config' }
  if (typeof provider !== 'string' || provider === '') return { use: true, degraded: false, diag: null, reason: 'no-provider' }
  const kind = catalog !== null && typeof catalog === 'object' && typeof catalog.kind === 'string' ? catalog.kind : 'no-llm'
  if (kind === 'ok') {
    const ids = Array.isArray(catalog.ids) ? catalog.ids : []
    if (ids.includes(configured)) return { use: true, degraded: false, diag: null, reason: 'catalog-hit' }
    return { use: false, degraded: true, diag: 'inherit-parent', reason: 'catalog-miss' }
  }
  if (kind === 'empty') return { use: true, degraded: false, diag: 'keep-planner-model', reason: 'catalog-empty' }
  if (kind === 'error') return { use: true, degraded: false, diag: 'keep-planner-model', reason: 'catalog-error' }
  return { use: true, degraded: false, diag: 'keep-planner-model', reason: 'catalog-unavailable' }
}

// True 路径的真实探针固定上限；False 路径不读取这些辅助逻辑。
export const PLANNER_PROBE_TIMEOUT_MS = 30000
export const PLANNER_BLOCKED_REASON = 'extra-plan: planner request blocked: no verified planner route'
export const NON_PLANNER_BLOCKED_REASON = 'extra-plan: non-planner request blocked: no verified non-planner route'

function comparePlannerText(a, b) {
  const left = typeof a === 'string' ? a : ''
  const right = typeof b === 'string' ? b : ''
  return left < right ? -1 : left > right ? 1 : 0
}

function plannerProviderRank(providerId, parentProvider) {
  if (providerId === 'deepseek-official') return 2
  if (typeof parentProvider === 'string' && parentProvider !== '' && providerId === parentProvider) return 1
  return 0
}

export function sortPlannerCandidates(candidates, parentProvider) {
  return [...candidates].sort((left, right) => {
    const leftRank = plannerProviderRank(left.id, parentProvider)
    const rightRank = plannerProviderRank(right.id, parentProvider)
    if (leftRank !== rightRank) return leftRank - rightRank
    if (leftRank === 0) {
      const byName = comparePlannerText(left.name, right.name)
      if (byName !== 0) return byName
    }
    return comparePlannerText(left.id, right.id)
  })
}

// ── per-apply 工厂：planner / 非 planner 单点解析（缓存固定到 Agent 生命周期） ──
// 注入仅真依赖：3 个 apply 配置项 + 3 个惰性 getter（llm / agents / 诊断落盘路径）。
export function createModelRouting({ plannerModel, otherAgentModel, crossProviderPlannerModelOn, getLlm, getAgents, getDiagPath }) {
// ── planner 模型单点解析 ──
// plannerModelCache：planner 子代理有效模型条目缓存（key=agent）。True 路径首次入口
// 立即缓存 in-flight promise；成功 entry 与严格 rejection 都固定到该 Agent 生命周期。
const plannerModelCache = new WeakMap()
// 非 planner 专用缓存：key=单个 child Agent；成功、in-flight 与 strict rejection 均固定隔离。
const otherAgentModelCache = new WeakMap()

function plannerAbortError(signal) {
  const reason = signal !== undefined && signal !== null ? signal.reason : undefined
  return reason instanceof Error ? reason : new Error('extra-plan: planner probe aborted')
}

// 用一个本地 AbortController 同时覆盖 listModels、prepareCall 和完整 stream；listModels
// 没有 signal 参数，Promise.race 只解除本解析等待，不能替第三方 adapter 撤销遗留 I/O。
async function withPlannerProbeDeadline(operation, parentSignal) {
  if (parentSignal !== undefined && parentSignal !== null && parentSignal.aborted) throw plannerAbortError(parentSignal)
  const controller = new AbortController()
  let timedOut = false
  let parentAbortListener = null
  if (parentSignal !== undefined && parentSignal !== null && typeof parentSignal.addEventListener === 'function') {
    parentAbortListener = () => controller.abort(plannerAbortError(parentSignal))
    parentSignal.addEventListener('abort', parentAbortListener, { once: true })
    if (parentSignal.aborted) parentAbortListener()
  }
  const timeout = setTimeout(() => {
    timedOut = true
    controller.abort(new Error('extra-plan: planner route probe timed out'))
  }, PLANNER_PROBE_TIMEOUT_MS)
  let abortListener = null
  const aborted = new Promise((resolve, reject) => {
    abortListener = () => reject(controller.signal.reason instanceof Error ? controller.signal.reason : new Error('extra-plan: planner probe aborted'))
    if (controller.signal.aborted) abortListener()
    else controller.signal.addEventListener('abort', abortListener, { once: true })
  })
  const pending = Promise.resolve().then(() => operation(controller.signal))
  pending.catch(() => {})
  try {
    return await Promise.race([pending, aborted])
  } catch (error) {
    if (parentSignal !== undefined && parentSignal !== null && parentSignal.aborted) throw plannerAbortError(parentSignal)
    if (timedOut) return { timeout: true }
    throw error
  } finally {
    clearTimeout(timeout)
    if (parentAbortListener !== null && parentSignal !== undefined && parentSignal !== null && typeof parentSignal.removeEventListener === 'function') parentSignal.removeEventListener('abort', parentAbortListener)
    if (abortListener !== null) controller.signal.removeEventListener('abort', abortListener)
  }
}

// 候选目录检查与真实探针共用一个 deadline。checkCatalog=false 仅用于父会话 fallback，
// 因而不把 advisory listModels 误当成 fallback 成功，也允许父模型未列在目录中时验证。
async function probePlannerRoute(llm, provider, model, parentSignal, checkCatalog) {
  let matched = !checkCatalog
  try {
    const result = await withPlannerProbeDeadline(async (signal) => {
      if (checkCatalog) {
        if (typeof llm.listModels !== 'function') return { matched: false, ok: false }
        const models = await llm.listModels(provider)
        if (!Array.isArray(models) || !models.some((item) => item !== null && typeof item === 'object' && item.id === model)) return { matched: false, ok: false }
        matched = true
      }
      if (typeof llm.prepareCall !== 'function') return { matched, ok: false }
      const prepared = await llm.prepareCall({ provider, model, maxTokens: 1 }, signal)
      if (prepared === null || typeof prepared !== 'object' || typeof prepared.stream !== 'function') return { matched, ok: false }
      const preparedConfig = prepared.config
      if (preparedConfig === null || typeof preparedConfig !== 'object' || preparedConfig.provider !== provider || preparedConfig.model !== model) return { matched, ok: false }
      const request = {
        provider: preparedConfig.provider,
        model: preparedConfig.model,
        ...(preparedConfig.reasoningEffort === undefined ? {} : { reasoningEffort: preparedConfig.reasoningEffort }),
        ...(preparedConfig.temperature === undefined ? {} : { temperature: preparedConfig.temperature }),
        ...(preparedConfig.maxTokens === undefined ? {} : { maxTokens: preparedConfig.maxTokens }),
        ...(preparedConfig.stop === undefined ? {} : { stop: preparedConfig.stop }),
        messages: [createUserMessage({ source: { kind: 'plugin', plugin: 'dsh-extra-plan' }, content: [{ type: 'text', text: 'OK' }] })],
        signal,
      }
      let finishCount = 0
      let finishKind = ''
      for await (const chunk of prepared.stream(request)) {
        if (chunk !== null && typeof chunk === 'object' && chunk.type === 'finish') {
          finishCount += 1
          finishKind = chunk.reason !== null && typeof chunk.reason === 'object' && typeof chunk.reason.kind === 'string' ? chunk.reason.kind : ''
        }
      }
      return { matched, ok: finishCount === 1 && finishKind !== '' && finishKind !== 'error' && finishKind !== 'aborted' }
    }, parentSignal)
    if (result !== null && typeof result === 'object' && result.timeout === true) return { matched, ok: false }
    return result !== null && typeof result === 'object' && typeof result.ok === 'boolean' ? result : { matched, ok: false }
  } catch (error) {
    if (parentSignal !== undefined && parentSignal !== null && parentSignal.aborted) throw plannerAbortError(parentSignal)
    return { matched, ok: false }
  }
}

// 从父会话 requestHeader 提取 provider/model/maxTokens（严格路径与旧流程共用的同一逻辑）。
// 非法/缺失一律取 undefined；parent 为 undefined/null 时整体返回 null（不触碰 parent.session）。
function extractParentEntry(parent) {
  if (parent === undefined || parent === null) return null
  const header = typeof parent.session.requestHeader === 'function' ? parent.session.requestHeader() : undefined
  const pcfg = header !== undefined && header.config !== undefined && header.config !== null ? header.config : null
  if (pcfg === null) return null
  return {
    provider: typeof pcfg.provider === 'string' && pcfg.provider !== '' ? pcfg.provider : undefined,
    model: typeof pcfg.model === 'string' && pcfg.model !== '' ? pcfg.model : undefined,
    maxTokens: typeof pcfg.maxTokens === 'number' && pcfg.maxTokens > 0 ? pcfg.maxTokens : undefined,
  }
}

// False/缺失/非法开关的旧单 provider 流程原样保留：只查父 provider 的 advisory 目录，
// 不枚举 provider，也不调用真实 prepareCall/stream 或严格 fallback probe。
async function resolvePlannerEntryLegacy(agent) {
  let provider
  let model
  let maxTokens
  try {
    const parentSession = agent.session.header.parentSession
    if (typeof parentSession === 'string') {
      const agents = getAgents()
      let parent
      try {
        parent = agents !== undefined ? agents.get(parentSession) : undefined
      } catch (error) {
        parent = undefined
      }
      const pcfg = extractParentEntry(parent)
      if (pcfg !== null) {
        provider = pcfg.provider
        model = pcfg.model
        maxTokens = pcfg.maxTokens
      }
    }
    if (plannerModel !== '') {
      let catalog = { kind: 'no-llm' }
      const llm = getLlm()
      if (llm !== undefined && llm !== null && typeof llm.listModels === 'function') {
        try {
          const models = await llm.listModels(provider)
          const ids = Array.isArray(models)
            ? models.map((m) => m !== null && typeof m === 'object' && typeof m.id === 'string' ? m.id : '').filter((id) => id !== '')
            : []
          catalog = ids.length === 0 ? { kind: 'empty' } : { kind: 'ok', ids }
        } catch (error) {
          catalog = { kind: 'error' }
        }
      }
      const decision = decidePlannerModelUse(plannerModel, provider, catalog)
      if (decision.use) model = plannerModel
      if (decision.diag !== null) {
        try {
          appendFileSync(getDiagPath(), JSON.stringify({
            ts: new Date().toISOString(),
            type: 'degrade',
            sessionId: agent.session !== undefined && agent.session !== null && agent.session.header !== undefined ? agent.session.header.id : '',
            provider: provider !== undefined ? provider : '',
            plannerModel,
            decision: decision.diag,
            reason: decision.reason,
          }) + '\n', 'utf8')
        } catch (error) { /* 诊断落盘失败不影响解析 */ }
      }
    }
  } catch (error) {
    // 旧兼容口径：解析异常保持已取到的值，不抛出。
  }
  return { provider, model, maxTokens }
}

// True 严格路径：只把已完成真实 OK probe 的排序候选或已验证父 fallback 交给 planner。
async function resolvePlannerEntryStrict(agent, parentSignal) {
  let provider
  let model
  let maxTokens
  try {
    const parentSession = agent.session.header.parentSession
    if (typeof parentSession === 'string') {
      const agents = getAgents()
      let parent
      try {
        parent = agents !== undefined ? agents.get(parentSession) : undefined
      } catch (error) {
        parent = undefined
      }
      const pcfg = extractParentEntry(parent)
      if (pcfg !== null) {
        provider = pcfg.provider
        model = pcfg.model
        maxTokens = pcfg.maxTokens
      }
    }
  } catch (error) {
    // 缺失/损坏的父配置在候选全失败时由固定 strict block 统一处理。
  }
  let llm
  try {
    llm = getLlm()
  } catch (error) {
    llm = undefined
  }
  if (llm === undefined || llm === null || typeof llm !== 'object') throw new Error(PLANNER_BLOCKED_REASON)

  const routeKey = (routeProvider, routeModel) => routeProvider + '\u0000' + routeModel
  const probeOutcomes = new Map()
  const successes = []
  if (plannerModel !== '') {
    let listedProviders = []
    try {
      if (typeof llm.listProviders === 'function') {
        const listed = await withPlannerProbeDeadline(() => llm.listProviders(), parentSignal)
        if (!(listed !== null && typeof listed === 'object' && listed.timeout === true) && Array.isArray(listed)) listedProviders = listed
      }
    } catch (error) {
      if (parentSignal !== undefined && parentSignal !== null && parentSignal.aborted) throw plannerAbortError(parentSignal)
    }
    const seenProviderIds = new Set()
    for (const listed of listedProviders) {
      if (listed === null || typeof listed !== 'object' || typeof listed.id !== 'string' || listed.id === '' || seenProviderIds.has(listed.id)) continue
      seenProviderIds.add(listed.id)
      const providerName = typeof listed.name === 'string' ? listed.name : listed.id
      const outcome = await probePlannerRoute(llm, listed.id, plannerModel, parentSignal, true)
      if (outcome.matched) probeOutcomes.set(routeKey(listed.id, plannerModel), outcome)
      if (outcome.ok) successes.push({ id: listed.id, name: providerName })
    }
    const sorted = sortPlannerCandidates(successes, provider)
    if (sorted.length > 0) return { provider: sorted[0].id, model: plannerModel, maxTokens }
  }

  if (parentSignal !== undefined && parentSignal !== null && parentSignal.aborted) throw plannerAbortError(parentSignal)
  if (typeof provider !== 'string' || provider === '' || typeof model !== 'string' || model === '') throw new Error(PLANNER_BLOCKED_REASON)
  const fallbackKey = routeKey(provider, model)
  const reused = probeOutcomes.get(fallbackKey)
  const fallback = reused !== undefined ? reused : await probePlannerRoute(llm, provider, model, parentSignal, false)
  if (fallback.ok) return { provider, model, maxTokens }
  if (parentSignal !== undefined && parentSignal !== null && parentSignal.aborted) throw plannerAbortError(parentSignal)
  throw new Error(PLANNER_BLOCKED_REASON)
}

// 单一入口的首个调用即保存 promise，避免同一 Agent 并发/续轮重复真实探针；rejection
// 也固定缓存，后续请求不会把未验证路由重新交给 DSH。
function resolvePlannerEntry(agent, parentSignal) {
  const cached = plannerModelCache.get(agent)
  if (cached !== undefined) return cached
  const pending = crossProviderPlannerModelOn
    ? resolvePlannerEntryStrict(agent, parentSignal)
    : resolvePlannerEntryLegacy(agent)
  plannerModelCache.set(agent, pending)
  return pending
}

// 非 planner 路由来源：普通 child 保留直接父 maxTokens，probe 保留顶层来源 maxTokens；
// provider/model 的 fallback 始终取完整链路解析出的顶层主会话，链断裂不冒充中间 child。
function nonPlannerRouteSources(agent) {
  let agents
  try { agents = getAgents() } catch (error) { agents = undefined }
  return resolveAgentRouteSources(agent, agents)
}

function nonPlannerFallbackEntry(sources, probe) {
  if (sources === null || sources === undefined || sources.available !== true || sources.source === null || sources.direct === null) return null
  const tokenSource = probe ? sources.source : sources.direct
  return {
    provider: sources.source.provider,
    model: sources.source.model,
    maxTokens: tokenSource.maxTokens,
  }
}

// cross=false/缺失/非法：只对顶层主会话 provider 做 advisory listModels；不做真实探针。
async function resolveOtherAgentEntryLegacy(agent, probe) {
  const sources = nonPlannerRouteSources(agent)
  const fallback = nonPlannerFallbackEntry(sources, probe)
  if (fallback === null || otherAgentModel === '' || fallback.provider === undefined) return fallback || {}
  let llm
  try { llm = getLlm() } catch (error) { llm = undefined }
  if (llm === undefined || llm === null || typeof llm.listModels !== 'function') return fallback
  try {
    const models = await llm.listModels(fallback.provider)
    if (Array.isArray(models) && models.some((item) => item !== null && typeof item === 'object' && item.id === otherAgentModel)) {
      return { ...fallback, model: otherAgentModel }
    }
  } catch (error) {
    // advisory 目录异常按要求静默回退顶层主会话。
  }
  return fallback
}

// cross=true：所有匹配 provider 串行完整 OK probe，候选全部结束后按 planner 既有排序选择。
async function resolveOtherAgentEntryStrict(agent, parentSignal, probe) {
  const sources = nonPlannerRouteSources(agent)
  const fallback = nonPlannerFallbackEntry(sources, probe)
  if (fallback === null) {
    if (parentSignal !== undefined && parentSignal !== null && parentSignal.aborted) throw plannerAbortError(parentSignal)
    throw new Error(NON_PLANNER_BLOCKED_REASON)
  }
  if (parentSignal !== undefined && parentSignal !== null && parentSignal.aborted) throw plannerAbortError(parentSignal)
  let llm
  try { llm = getLlm() } catch (error) { llm = undefined }
  if (llm === undefined || llm === null || typeof llm !== 'object') {
    throw new Error(NON_PLANNER_BLOCKED_REASON)
  }
  const routeKey = (routeProvider, routeModel) => routeProvider + '\u0000' + routeModel
  const probeOutcomes = new Map()
  const successes = []
  if (otherAgentModel !== '' && typeof llm.listProviders === 'function') {
    let listedProviders = []
    try {
      const listed = await withPlannerProbeDeadline(() => llm.listProviders(), parentSignal)
      if (!(listed !== null && typeof listed === 'object' && listed.timeout === true) && Array.isArray(listed)) listedProviders = listed
    } catch (error) {
      if (parentSignal !== undefined && parentSignal !== null && parentSignal.aborted) throw plannerAbortError(parentSignal)
    }
    const seenProviderIds = new Set()
    for (const listed of listedProviders) {
      if (listed === null || typeof listed !== 'object' || typeof listed.id !== 'string' || listed.id === '' || seenProviderIds.has(listed.id)) continue
      seenProviderIds.add(listed.id)
      const providerName = typeof listed.name === 'string' ? listed.name : listed.id
      const outcome = await probePlannerRoute(llm, listed.id, otherAgentModel, parentSignal, true)
      if (outcome.matched) probeOutcomes.set(routeKey(listed.id, otherAgentModel), outcome)
      if (outcome.ok) successes.push({ id: listed.id, name: providerName })
    }
    const sorted = sortPlannerCandidates(successes, fallback.provider)
    if (sorted.length > 0) return { ...fallback, provider: sorted[0].id, model: otherAgentModel }
  }
  if (parentSignal !== undefined && parentSignal !== null && parentSignal.aborted) throw plannerAbortError(parentSignal)
  if (fallback.provider === undefined || fallback.model === undefined) throw new Error(NON_PLANNER_BLOCKED_REASON)
  const fallbackKey = routeKey(fallback.provider, fallback.model)
  const reused = probeOutcomes.get(fallbackKey)
  const fallbackOutcome = reused !== undefined ? reused : await probePlannerRoute(llm, fallback.provider, fallback.model, parentSignal, false)
  if (fallbackOutcome.ok) return fallback
  if (parentSignal !== undefined && parentSignal !== null && parentSignal.aborted) throw plannerAbortError(parentSignal)
  throw new Error(NON_PLANNER_BLOCKED_REASON)
}

// 单一非 planner 入口：每个 child Agent 独立保存首个 in-flight promise、成功或 strict rejection。
function resolveOtherAgentEntry(agent, parentSignal, probe) {
  const cached = otherAgentModelCache.get(agent)
  if (cached !== undefined) return cached
  const pending = crossProviderPlannerModelOn
    ? resolveOtherAgentEntryStrict(agent, parentSignal, probe)
    : resolveOtherAgentEntryLegacy(agent, probe)
  otherAgentModelCache.set(agent, pending)
  return pending
}
  return { resolvePlannerEntry, resolveOtherAgentEntry }
}
