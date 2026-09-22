// @local/dsh-extra-plan per-apply agent runtime factory.
// Role/cache state is created per createAgentRuntime call; never shared across applies.

import { sessionEvents, isSubagentChild } from './agent-session.js'

// 此刻是否受委派（父会话 agent 存活）；调用方已确认 isSubagentChild。
// 缺 parentSession / agents 缺席 / 读取失败一律偏安全豁免（v11 口径）。
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
  const plannerDescriptorCache = new WeakMap()
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

  // 规划子代理：子会话且 descriptor.mode === 'continuable'；无 descriptor 不缓存 false。
  function isPlannerChild(agent, events) {
    const cached = plannerDescriptorCache.get(agent)
    if (cached !== undefined) return cached
    if (!isSubagentChild(agent, events)) return false
    const session = agent.session
    if (session === undefined || session === null) return false
    const scanEvents = events === undefined ? sessionEvents(session) : events
    if (!Array.isArray(scanEvents)) return false
    for (const event of scanEvents) {
      if (event !== null && typeof event === 'object' && event.type === 'subagent/descriptor'
          && event.data !== undefined && event.data !== null
          && typeof event.data.mode === 'string') {
        const planner = event.data.mode === 'continuable'
        plannerDescriptorCache.set(agent, planner)
        return planner
      }
    }
    return false
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
