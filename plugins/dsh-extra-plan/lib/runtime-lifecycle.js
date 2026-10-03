// per-apply runtime lifecycle：save 注册、probe 认领、计数器与 run_code 拒绝记录。
export function createRuntimeLifecycle(options = {}) {
  const {
    defineSavePlan, defineSaveProbe,
    isSubagentChild, isPlannerChild, toolSchemasOf, schemasHasWriteTools,
    isRunCodeSubCall, runCodeDispatchCapText,
  } = options

  function registerTool(registered, toolName, defineFn, agent) {
    if (registered.has(agent)) return
    let tools
    try {
      tools = agent.ctx !== undefined && agent.ctx !== null && typeof agent.ctx.get === 'function' ? agent.ctx.get('tools') : undefined
    } catch (error) {
      tools = undefined
    }
    if (tools === undefined || tools === null || typeof tools.register !== 'function') {
      console.warn('extra-plan: tools service unavailable — ' + toolName + ' not registered')
      return
    }
    try {
      tools.register(defineFn())
      registered.add(agent)
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      if (error instanceof Error && message.includes('already registered')) {
        registered.add(agent)
        console.warn('extra-plan: ' + toolName + ' already registered in this scope — keeping the existing tool, no retry')
        return
      }
      if (error instanceof Error && (error.name === 'JsonSchemaError' || error.name === 'TypeError' || message.includes('is reserved'))) {
        registered.add(agent)
        console.error('extra-plan: ' + toolName + ' registration failed permanently: ' + message)
        return
      }
      console.error('extra-plan: ' + toolName + ' registration failed: ' + message)
    }
  }

  const savePlanRegistered = new WeakSet()
  const saveProbeRegistered = new WeakSet()
  const probeClaimed = new WeakSet()
  const pendingProbeClaims = new Map()
  const jobOutputCallCounters = new Map()
  const jobOutputLastAnchors = new Map()
  const pollGuardCounters = new Map()
  const subCallCounters = new Map()
  const toolJobsNoticesConsumed = new Map()
  const runCodeDenyRecords = new Map()

  function registerSavePlan(agent) { registerTool(savePlanRegistered, 'save_plan', defineSavePlan, agent) }
  function registerSaveProbe(agent) { registerTool(saveProbeRegistered, 'save_probe', defineSaveProbe, agent) }

  function probeClaimFor(agent) {
    if (probeClaimed.has(agent)) return true
    if (typeof isSubagentChild !== 'function' || !isSubagentChild(agent)) return false
    if (typeof isPlannerChild === 'function' && isPlannerChild(agent)) return false
    const header = agent.session.header
    const parentSession = header !== undefined && header !== null ? header.parentSession : undefined
    if (typeof parentSession !== 'string') return false
    const pending = pendingProbeClaims.get(parentSession)
    if (pending === undefined || typeof pending !== 'number' || pending <= 0) return false
    const schemas = toolSchemasOf(agent)
    if (schemas === undefined || schemasHasWriteTools(schemas)) return false
    pendingProbeClaims.set(parentSession, pending - 1)
    if (pending - 1 <= 0) pendingProbeClaims.delete(parentSession)
    probeClaimed.add(agent)
    return true
  }

  function recordProbeClaim(sessionId) {
    pendingProbeClaims.set(sessionId, (pendingProbeClaims.get(sessionId) || 0) + 1)
  }

  function noteRunCodeSubCall(sessionId, rid, cap) {
    const bucket = subCallCounters.get(sessionId)
    const passed = rid === '' || bucket === undefined ? 0 : (bucket.get(rid) || 0)
    if (rid === '' || passed >= cap) return runCodeDispatchCapText(rid === '' ? '?' : rid, passed + 1, cap)
    if (bucket === undefined) subCallCounters.set(sessionId, new Map([[rid, passed + 1]]))
    else bucket.set(rid, passed + 1)
    return null
  }

  function recordRunCodeDeny(agent, exec, reason) {
    if (!isRunCodeSubCall(exec)) return
    if (typeof reason !== 'string' || reason === '') return
    const sessionId = agent !== undefined && agent !== null && agent.session !== undefined && agent.session !== null && agent.session.header !== undefined && agent.session.header !== null ? agent.session.header.id : undefined
    if (typeof sessionId !== 'string' || sessionId === '') return
    const rid = typeof exec.rootCallId === 'string' && exec.rootCallId !== '' ? exec.rootCallId : (typeof exec.callId === 'string' ? exec.callId : '')
    let byRoot = runCodeDenyRecords.get(sessionId)
    if (byRoot === undefined) { byRoot = new Map(); runCodeDenyRecords.set(sessionId, byRoot) }
    let reasons = byRoot.get(rid)
    if (reasons === undefined) { reasons = new Set(); byRoot.set(rid, reasons) }
    reasons.add(reason)
  }

  function takeRunCodeDenyRecords(sessionId, rootId) {
    if (typeof sessionId !== 'string' || sessionId === '') return undefined
    const byRoot = runCodeDenyRecords.get(sessionId)
    if (byRoot === undefined) return undefined
    const reasons = byRoot.get(rootId)
    if (reasons === undefined) return undefined
    byRoot.delete(rootId)
    return reasons
  }

  function disposeSession(sessionId) {
    pendingProbeClaims.delete(sessionId)
    runCodeDenyRecords.delete(sessionId)
    jobOutputCallCounters.delete(sessionId)
    jobOutputLastAnchors.delete(sessionId)
    pollGuardCounters.delete(sessionId)
    toolJobsNoticesConsumed.delete(sessionId)
    subCallCounters.delete(sessionId)
  }

  return {
    registerSavePlan, registerSaveProbe, probeClaimFor, recordProbeClaim,
    pendingProbeClaims, jobOutputCallCounters, jobOutputLastAnchors, pollGuardCounters,
    subCallCounters, toolJobsNoticesConsumed, runCodeDenyRecords,
    noteRunCodeSubCall, recordRunCodeDeny, takeRunCodeDenyRecords, disposeSession,
    pendingProbeCount: (sessionId) => pendingProbeClaims.get(sessionId) || 0,
  }
}
