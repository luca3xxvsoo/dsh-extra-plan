import { mkdirSync, appendFileSync } from 'node:fs'
import { join, dirname, isAbsolute } from 'node:path'
import { resolveWorkspacePath, resolveHostPath, prepareWriteTarget } from './path-policy.js'
import { causeChainOf } from './runtime-static.js'

function resolveAbsoluteLogTarget(context, value, purpose) {
  let hostError
  let workspaceError
  try { return resolveHostPath(context, value, { purpose }) } catch (error) { hostError = error }
  try { return resolveWorkspacePath(context, value, { purpose }) } catch (error) { workspaceError = error }
  throw hostError || workspaceError || new Error('诊断路径不在授权H/W根内')
}

// 入口每个模块实例装配一次；读取路径事实仍发生在每次日志调用时。
export function createRuntimeDiagnostics({ sessionCwdOf, pathContextFor, profileFactsOf, absoluteRoot, defaultDiagnosticFile }) {
  // ── agent/error 回合错误取证落盘（与 recordRequestError 同诊断模式） ──────
  // 宿主在回合/步骤级错误时 emit 'agent/error'（payload = { agent, turn, step, error }，
  // error 为逐字原始错误；派发点 dsh-agent-loop throwError、签名 dsh-tool-cordis
  // api-catalog），宿主不把该错误写 console → 由监听器逐字落盘留证。本插件每个会话
  // 各持一份实例，主会话与全部子代理的任何 runTurn 级错误（含子代理"腰斩"的流建立
  // 失败）都会留痕。
  // 入口以模块级装配的同一绑定导出 recordAgentError 供回归直呼。与 recordRequestError
  // 同模式——整体 try/catch 吞错、写失败一次性 console.warn 防刷屏；落盘文件与
  // 诊断文件始终按已授权日志根解析；缺根时非阻断且不写包目录。
  let agentErrorDiagWarned = false

  function diagnosticTargetOf(ctx, agent, configured, purpose = 'diagnostics') {
    const cwd = sessionCwdOf(agent)
    const context = pathContextFor(ctx, cwd)
    if (context === null) return null
    const facts = profileFactsOf(ctx)
    const value = typeof configured === 'string' && configured !== '' ? configured : defaultDiagnosticFile
    const bare = !isAbsolute(value) && !/[\\/]/.test(value)
    if (bare) {
      if (facts.hostState === 'invalid' || facts.hostState === 'conflict') return null
      if (facts.hostState === 'valid' && facts.hostDataRoot !== null) return resolveHostPath(context, join('logs', 'dsh-extra-plan', value), { purpose })
      if (facts.hostState === 'missing' && absoluteRoot(cwd) !== null) return resolveWorkspacePath(context, join('.extra-plan', 'logs', value), { purpose })
      return null
    }
    if (isAbsolute(value)) return resolveAbsoluteLogTarget(context, value, purpose)
    return resolveWorkspacePath(context, value, { purpose })
  }

  function prepareDiagnosticPath(ctx, agent, configured) {
    try {
      const target = diagnosticTargetOf(ctx, agent, configured)
      if (target === null) return ''
      const context = pathContextFor(ctx, sessionCwdOf(agent))
      if (context === null) return ''
      const parent = target.kind === 'host'
        ? resolveHostPath(context, dirname(target.path), { purpose: 'diagnostics' })
        : resolveWorkspacePath(context, dirname(target.path), { purpose: 'diagnostics' })
      prepareWriteTarget(context, parent, { expectedType: 'any', purpose: 'diagnostics' })
      mkdirSync(parent.path, { recursive: true })
      prepareWriteTarget(context, target, { expectedType: 'file', purpose: 'diagnostics' })
      return target.path
    } catch (error) {
      return ''
    }
  }

  function appendDiagnostic(ctx, agent, configured, row) {
    const path = prepareDiagnosticPath(ctx, agent, configured)
    if (path === '') return false
    appendFileSync(path, JSON.stringify(row) + '\n', { encoding: 'utf8' })
    return true
  }

  function recordAgentError(payload, options = {}) {
    try {
      const sessionId = payload?.agent?.session?.header?.id
      const row = {
        ts: new Date().toISOString(),
        sessionId: typeof sessionId === 'string' ? sessionId : '',
        turn: payload.turn,
        step: payload.step,
        chain: causeChainOf(payload.error, 8),
      }
      if (!appendDiagnostic(options.ctx, payload?.agent, 'extra-plan-agent-errors.jsonl', row)) throw new Error('agent diagnostics root unavailable')
    } catch (error) {
      if (!agentErrorDiagWarned) {
        agentErrorDiagWarned = true
        console.warn('extra-plan: agent-error diagnostics write failed: ' + (error instanceof Error ? error.message : String(error)))
      }
    }
  }

  return { prepareDiagnosticPath, appendDiagnostic, recordAgentError }
}
