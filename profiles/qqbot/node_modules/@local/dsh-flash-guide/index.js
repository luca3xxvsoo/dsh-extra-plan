/**
 * flash-guide: near-field guidance injector for flash-family agents.
 *
 * For every REAL user message in a flash-model agent's session (judged solely
 * by whether the model id contains 'deepseek-v4-flash' — this applies to
 * the main session and every subagent alike: planner, executor, and reviewer;
 * a pro planner whose model does NOT contain 'flash' is excluded, while a
 * reviewer whose model DOES contain 'flash' is guided), inserts ONE fixed
 * guidance message right after it in the pre-step waterfall — SIMPLE tasks
 * get the fast-convergence guide, COMPLEX tasks get the deep-exploration
 * guide. Text is compile-time constant (fixed text + fixed position = 92-95%
 * prompt cache hits), copied verbatim from dsh-router-standard's measured
 * guide with the classify-sentence removed and the flash recall/anti-runaway
 * anchor appended (router-core WEAK_FLASH third sentence).
 *
 * Zero tool registration on purpose: registering tools would change the tool
 * catalog = change the cache prefix; no interaction with extra-plan gates.
 *
 * Mechanism (verified): before every model request the host claims the inbox
 * and fires the agent/pre-step waterfall (dsh-agent-loop preStep); this
 * listener inserts the guide into decision.messages right after each real
 * user message, and the host persists every message of the returned array as
 * a user/message event — the guide reaches the model in the SAME step as the
 * user message. The listener never writes session events itself, so it never
 * trips the host's reentrancy guard (session append cannot reenter while
 * another append is being published).
 */

/** Complexity heuristic (verbatim router-core.mjs L67): long or
 *  architecturally-worded tasks are COMPLEX. */
export const COMPLEX_RE = /(重构|架构|全面|详细|设计|系统|优化|分析|survey|overview|architecture|refactor|comprehensive|detailed|design|system|optimize|analyze)/i

/** Fast-convergence guide for SIMPLE flash tasks: decision-closure sentence
 *  + flash recall/anti-runaway anchor (router-core WEAK_FLASH L62). */
export const GUIDE_WEAK =
  'Guide: Think deeply first, then commit and act. Before acting, briefly review what you have already done in this session and continue from where you left off; do not repeat completed steps. Do not run environment checks (echo, whoami, uname, node --version, date) or exhaustive grep/glob scans.'

/** Deep-exploration guide for COMPLEX flash tasks: architecture/edge-case
 *  decision loop + the same flash recall/anti-runaway anchor. */
export const GUIDE_DEEP =
  'Guide: Think deeply about the architecture, edge cases, and integration points. Do not spend reasoning on the environment or tooling. Produce when your information is complete. End each reasoning block with a decision or an information need. Before acting, briefly review what you have already done in this session and continue from where you left off; do not repeat completed steps. Do not run environment checks (echo, whoami, uname, node --version, date) or exhaustive grep/glob scans.'

/** True when the task text is long (>120 chars) or architecturally worded. */
export function isComplexTask(text) {
  return typeof text === 'string' && (text.length > 120 || COMPLEX_RE.test(text))
}

/** True when the model id contains 'deepseek-v4-flash' (DeepSeek flash-family). */
export function isFlashModel(modelId) {
  return typeof modelId === 'string' && modelId.includes('deepseek-v4-flash')
}

/** Extract task text from a user/message event payload (verbatim
 *  router-core.mjs L149-157, defensive unwrap of nested data.message). */
export function extractText(data) {
  if (!data) return ''
  const payload = data && typeof data.message === 'object' && data.message !== null ? data.message : data
  const content = Array.isArray(payload.content) ? payload.content : []
  return content.map((c) => (typeof c === 'string' ? c : (c.text ?? ''))).join(' ')
}

/** Indexes of real user messages in a pre-step message list (ascending).
 *  Guide messages (source.kind='plugin') never match, so an inserted guide
 *  can never trigger itself. */
export function findUserIndexes(messages) {
  if (!Array.isArray(messages)) return []
  const indexes = []
  for (let i = 0; i < messages.length; i += 1) {
    const message = messages[i]
    if (message !== null && typeof message === 'object' &&
        message.source !== null && typeof message.source === 'object' &&
        message.source.kind === 'user') indexes.push(i)
  }
  return indexes
}

/** Build one guide message: fresh unique id, user role, plugin source, one
 *  text block (tier by complexity). Host message objects are deepFrozen, so
 *  a NEW object is returned every time. */
export function buildGuideMessage(text) {
  const guide = isComplexTask(text) ? GUIDE_DEEP : GUIDE_WEAK
  return {
    id: `flash-guide-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    role: 'user',
    source: { kind: 'plugin', plugin: 'flash-guide' },
    content: [{ type: 'text', text: guide }],
  }
}

/** Single-criterion decision: guide iff the model id is flash (case-insensitive). */
export function shouldGuide(model) {
  return isFlashModel(model)
}

// ── internal helpers (patterns verbatim from @local/dsh-extra-plan) ─────────

/** Model id of an agent: agent.options.model, fallback to
 *  session.requestHeader().config.model (extra-plan L602-608). Kept ONLY as
 *  the fallback path when the extra-plan/effectiveModel service is absent
 *  (e.g. a profile without extra-plan installed); the primary decision now
 *  reads the service at pre-step runtime. */
function modelOf(agent) {
  if (agent === undefined || agent === null) return undefined
  const opts = agent.options
  let model = opts !== undefined && typeof opts.model === 'string' ? opts.model : undefined
  if (model === undefined && agent.session !== undefined && typeof agent.session.requestHeader === 'function') {
    try {
      const header = agent.session.requestHeader()
      model = header !== undefined && header.config !== undefined && typeof header.config.model === 'string' ? header.config.model : undefined
    } catch { /* header unavailable: silent skip */ }
  }
  return model
}

/** Cordis plugin name used by loader diagnostics. */
export const name = 'flash-guide'

/** No hard service deps: everything is optional (ctx.get) like extra-plan. */
export const inject = []

export function apply(ctx) {
  let lastAgent // last assembled agent; pre-step payload carries no agent field

  // Per-assembly refresh: web sessions recompose (agent objects rebuilt), so
  // lastAgent must track the live handle used as the pre-step payload fallback.
  ctx.on('system-prompt/assemble', async (_assembly, context, next) => {
    const result = await next()
    const agent = context.agent
    if (agent === undefined) return result
    lastAgent = agent
    return result
  })

  // Near-field guidance: ONE fixed guide per REAL user message, inserted into
  // the pre-step waterfall (the same verified channel as extra-plan). preStep
  // assembles BEFORE the waterfall, so lastAgent is already refreshed
  // when this listener runs — even for the first message.
  ctx.on('agent/pre-step', async (payload, next) => {
    const decision = await next()
    if (decision.kind !== 'enter' || !Array.isArray(decision.messages)) return decision
    const indexes = findUserIndexes(decision.messages)
    if (indexes.length === 0) return decision
    const agent = payload.agent ?? lastAgent
    if (agent === undefined || agent === null) return decision
    const session = agent.session
    const sessionId = session !== undefined && session !== null ? session.id : '?'
    // 有效模型判定：经宿主公开 API 读 extra-plan 隔离组内注册的服务
    // （agentPresets.serviceFor(agent, name)，专为「持有 agent 的外部调用者
    // 读取会话级预设服务」设计）；服务缺席（未装 extra-plan / agent 未挂预设 /
    // 该预设无此服务）时降级为老 modelOf 判定。
    const presets = ctx.get('agentPresets')
    const svc = presets !== undefined && presets !== null && typeof presets.serviceFor === 'function'
      ? presets.serviceFor(agent, 'extra-plan/effectiveModel')
      : undefined
    const model = typeof svc === 'function' ? await svc(agent) : modelOf(agent)
    if (!shouldGuide(model)) {
      // console.log(`flash-guide: skip session=${sessionId} model=${model} (non-flash)`)
      return decision
    }
    // Host message objects are deepFrozen — build a NEW array and insert from
    // the back so earlier indexes stay valid. Each real user message is
    // claimed exactly once, so every one gets exactly one guide.
    const messages = [...decision.messages]
    for (let i = indexes.length - 1; i >= 0; i -= 1) {
      const text = extractText(messages[indexes[i]])
      if (!text.trim()) continue
      messages.splice(indexes[i] + 1, 0, buildGuideMessage(text))
      // console.log(`flash-guide: inject session=${sessionId} model=${model} tier=${isComplexTask(text) ? 'deep' : 'weak'}`)
    }
    return { ...decision, messages }
  })
}
