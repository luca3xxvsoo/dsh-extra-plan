// 每次 apply 独立创建 agent runtime factory；role 与 cache 状态不会跨 createAgentRuntime 调用共享。

import { isSubagentChild } from './agent-session.js'
import { ROLE_IDS, PLANNER_PRESET_ID, PROBER_PRESET_ID, REVIEWER_PRESET_ID, USAGE_ROLE_BY_PRESET } from './role-contract.js'

const CHILD_HOST_MODE_BY_PRESET = Object.freeze(Object.assign(Object.create(null), {
  [ROLE_IDS[0]]: 'workspace-write',
  [PLANNER_PRESET_ID]: 'read-only',
  [REVIEWER_PRESET_ID]: 'workspace-write',
  [PROBER_PRESET_ID]: 'read-only',
}))

// 规划子代理的会话角色预设 id（与 assets/presets/extra-plan/agent.cordis.yml 第二文档一致）。
export { PLANNER_PRESET_ID } from './role-contract.js'

// 只有 parent session 存在时委派才算 live；缺少 parent/agents 或读取出错都 fail-open。
export function isLiveDelegation(agent, agents) {
  const header = agent.session.header
  if (header === undefined || header === null) return true
  const parentSession = header.parentSession
  if (parentSession === undefined) return true
  if (agents === undefined) return true
  try {
    return agents.get(parentSession) !== undefined
  } catch (error) {
    return true
  }
}

export function createAgentRuntime({ getAgents, sandboxPolicy, foldUsage, warn }) {
  const getAgentsOf = typeof getAgents === 'function' ? getAgents : () => undefined
  const warnOf = typeof warn === 'function' ? warn : (...args) => console.warn(...args)
  const subagentAsPlannerWarned = new WeakSet()
  const usageContexts = new WeakMap()
  const MAX_USAGE_PARENT_DEPTH = 8

  function isChild(agent, events) {
    if (!isSubagentChild(agent, events)) return false
    const child = isLiveDelegation(agent, getAgentsOf())
    if (!child && !subagentAsPlannerWarned.has(agent)) {
      subagentAsPlannerWarned.add(agent)
      warnOf('extra-plan: subagent session "' + agent.session.header.id + '" is live without its parent agent — root gates apply (resumed-as-root or misclassification)')
    }
    return child
  }

  // 规划子代理：子会话且 session.header.agentPreset === 'extra-plan-planner'。
  // dsh 0.2.1-rc.2 起 subagent descriptor 的 mode 恒为 continuable（宿主 manager 固定值），
  // 不能再作判据；判据改为会话 header 的角色预设 id，其余值与缺失一律非 planner。
  function isPlannerChild(agent, events) {
    if (agent === undefined || agent === null) return false
    const session = agent.session
    if (session === undefined || session === null) return false
    const header = session.header
    if (header === undefined || header === null) return false
    const preset = typeof header.agentPreset === 'string' ? header.agentPreset : ''
    return preset === PLANNER_PRESET_ID && isSubagentChild(agent, events)
  }

  // 验收者子代理：子会话且 session.header.agentPreset === 'extra-plan-reviewer'。
  // 判据与 isPlannerChild 同构，只换比对常量；其余值与缺失一律非验收者。
  function isReviewerChild(agent, events) {
    if (agent === undefined || agent === null) return false
    const session = agent.session
    if (session === undefined || session === null) return false
    const header = session.header
    if (header === undefined || header === null) return false
    const preset = typeof header.agentPreset === 'string' ? header.agentPreset : ''
    return preset === REVIEWER_PRESET_ID && isSubagentChild(agent, events)
  }

  function usageRootOf(sessionId, parentSessionId, delegationDepth) {
    if (parentSessionId === '') return sessionId
    if (delegationDepth === 1) return parentSessionId
    let agents
    try {
      agents = getAgentsOf()
    } catch (error) {
      return ''
    }
    if (agents === undefined || agents === null || typeof agents.get !== 'function') return ''
    const seen = new Set()
    if (sessionId !== '') seen.add(sessionId)
    let currentId = parentSessionId
    for (let level = 0; level < MAX_USAGE_PARENT_DEPTH; level += 1) {
      if (typeof currentId !== 'string' || currentId === '' || seen.has(currentId)) return ''
      seen.add(currentId)
      let parent
      try {
        parent = agents.get(currentId)
      } catch (error) {
        return ''
      }
      if (parent === undefined || parent === null || parent.session === undefined || parent.session === null) return ''
      const header = parent.session.header
      if (header === undefined || header === null) return ''
      const nextId = typeof header.parentSession === 'string' ? header.parentSession : ''
      if (nextId === '') return currentId
      if (seen.has(nextId)) return ''
      currentId = nextId
    }
    return ''
  }

  function usageContextOf(agent, events) {
    const cached = usageContexts.get(agent)
    if (cached !== undefined) return cached
    const session = agent !== undefined && agent !== null ? agent.session : undefined
    const header = session !== undefined && session !== null ? session.header : undefined
    const sessionId = header !== undefined && header !== null && typeof header.id === 'string' ? header.id : ''
    const parentSessionId = header !== undefined && header !== null && typeof header.parentSession === 'string' ? header.parentSession : ''
    const agentPreset = header !== undefined && header !== null && typeof header.agentPreset === 'string' ? header.agentPreset : ''
    const delegationDepth = header !== undefined && header !== null && Number.isInteger(header.delegationDepth) && header.delegationDepth >= 0 ? header.delegationDepth : 0
    const child = isSubagentChild(agent, events)
    const context = Object.freeze({
      sessionId,
      parentSessionId,
      rootSessionId: child ? (parentSessionId === '' ? '' : usageRootOf(sessionId, parentSessionId, delegationDepth)) : sessionId,
      agentPreset,
      delegationDepth,
      role: child ? (USAGE_ROLE_BY_PRESET[agentPreset] ?? 'child') : 'main',
    })
    usageContexts.set(agent, context)
    return context
  }

  // 真实工具集防御取数：不缓存，服务缺失/异常/非数组均返回 undefined。
  function toolSchemasOf(agent) {
    if (agent === undefined || agent === null) return undefined
    const agentCtx = agent.ctx
    if (agentCtx === undefined || agentCtx === null) return undefined
    let tools
    try {
      tools = typeof agentCtx.get === 'function' ? agentCtx.get('tools') : undefined
    } catch (error) {
      tools = undefined
    }
    if (tools === undefined || tools === null || typeof tools !== 'object') return undefined
    if (typeof tools.schemas !== 'function') return undefined
    try {
      const schemas = tools.schemas(agent)
      return Array.isArray(schemas) ? schemas : undefined
    } catch (error) {
      return undefined
    }
  }

  function applyChildPolicy(agent) {
    const session = agent.session
    const header = session !== undefined && session !== null ? session.header : undefined
    const preset = header !== undefined && header !== null ? header.agentPreset : undefined
    if (typeof preset !== 'string' || !Object.prototype.hasOwnProperty.call(CHILD_HOST_MODE_BY_PRESET, preset)) return
    const mode = CHILD_HOST_MODE_BY_PRESET[preset]
    const override = sandboxPolicy !== undefined && sandboxPolicy !== null && typeof sandboxPolicy.overrideOf === 'function'
      ? sandboxPolicy.overrideOf(session)
      : undefined
    if (override === mode) return
    session.append('sandbox/mode', { mode, source: 'delegation' })
  }


  function childBaseline(agent, events) {
    const child = isChild(agent, events)
    const context = usageContextOf(agent, events)
    foldUsage(agent, context)
    if (child) applyChildPolicy(agent)
    return child
  }

  return { isChild, isPlannerChild, isReviewerChild, toolSchemasOf, usageContextOf, childBaseline }
}
