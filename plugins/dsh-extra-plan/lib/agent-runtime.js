// 每次 apply 独立创建 agent runtime factory；role 与 cache 状态不会跨 createAgentRuntime 调用共享。

import { isSubagentChild } from './agent-session.js'

// 规划子代理的会话角色预设 id（与 assets/presets/extra-plan/agent.cordis.yml 第二文档一致）。
export const PLANNER_PRESET_ID = 'extra-plan-planner'

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

// 子代理沙箱下限判定：会话级 read-only override 或部署默认 read-only 时抬升。
export function childPolicyNeedsFloor(session, sandboxPolicy) {
  if (sandboxPolicy === undefined) return false
  const override = sandboxPolicy.overrideOf(session)
  const effective = override !== undefined ? override : sandboxPolicy.defaultMode
  return effective === 'read-only'
}

export function createAgentRuntime({ getAgents, sandboxPolicy, foldUsage, warn }) {
  const getAgentsOf = typeof getAgents === 'function' ? getAgents : () => undefined
  const warnOf = typeof warn === 'function' ? warn : (...args) => console.warn(...args)
  const subagentAsPlannerWarned = new WeakSet()
  const plannerPresetCache = new Map()
  const usageRoles = new WeakMap()

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
  // 缓存按 agentPreset 值缓存（同一预设的判定与会话无关）。
  function isPlannerChild(agent, events) {
    if (agent === undefined || agent === null) return false
    const session = agent.session
    if (session === undefined || session === null) return false
    const header = session.header
    if (header === undefined || header === null) return false
    const preset = typeof header.agentPreset === 'string' ? header.agentPreset : ''
    const cached = plannerPresetCache.get(preset)
    if (cached !== undefined) return cached
    const planner = preset === PLANNER_PRESET_ID && isSubagentChild(agent, events)
    plannerPresetCache.set(preset, planner)
    return planner
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

  function floorChildPolicy(agent) {
    if (childPolicyNeedsFloor(agent.session, sandboxPolicy)) {
      agent.session.append('sandbox/mode', { mode: 'workspace-write', source: 'delegation' })
    }
  }

  function usageRoleOf(agent) {
    const cached = usageRoles.get(agent)
    if (cached !== undefined) return cached
    return isPlannerChild(agent) ? 'planner' : isChild(agent) ? 'executor' : 'main'
  }

  function childBaseline(agent, events) {
    const child = isChild(agent, events)
    const planner = isPlannerChild(agent, events)
    const role = planner ? 'planner' : child ? 'executor' : 'main'
    usageRoles.set(agent, role)
    foldUsage(agent, role)
    if (child) floorChildPolicy(agent)
    return child
  }

  return { isChild, isPlannerChild, toolSchemasOf, usageRoleOf, childBaseline }
}
