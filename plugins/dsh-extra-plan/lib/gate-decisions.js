// plugins 根入口的纯决策与 run_code 聚合；无反向 index.js 依赖。
import { sessionEvents } from './agent-session.js'
import { budgetExceeded, budgetExhaustedReason, toolCallsSinceUser, DEFAULT_EXPLORE_BUDGET } from './planner-budget.js'
import { runCodeTextOf, createRunCodeStatic } from './run-code-static.js'
import { pwshMutationEvidence, bashMutationEvidence } from './shell-mutation.js'

const ASK_TOOL = 'ask_user_question'
const isDispatchStart = (t) => t === 'tool/ptc-dispatch-start'
const isDispatch = (t) => t === 'tool/ptc-dispatch'
const GATE_TOOL = 'extra_plan_gate'

// deny 提示模板（与闸门验词同源：引用本次 apply 的 gateRuntime，改词表则提示自动跟随）
function routeDenyReason(toolLabel, state, gateRuntime) {
  if (state && state.route === 'plan') {
    return `规划态下主会话不可写文件：${toolLabel}。探查请走 save_probe，写文件请等方案就绪后走执行者委派`
  }
  if (state && state.route === 'executor') {
    return `执行者态下主会话不直做写入：${toolLabel}。路线已确认「${gateRuntime.words.routeExecutor}」，请通过 subagent 委派执行者执行`
  }
  return `路由未确认：${toolLabel}。只读探查可随时进行。创建/修改/删除文件${gateRuntime.confirm.route}，用户选定路线后才可动手`
}
// 越界操作指引：沿用 routeDenyReason 既有口径，仅在其后追加一句（不另造文案风格）。
// 对应改造前 shell 写命令分支的第二级判定——非直行态禁止工作区内自写，但允许带 sandbox_permissions 做工作区外写入。
const OUT_OF_SCOPE_WRITE_HINT = '。工作区内写入请走 subagent 委派执行者；越界操作（工作区外写入）可带 sandbox_permissions 参数与 justification 重试'
function planDenyReason(action, state, gateRuntime) {
  if (state && state.route === 'main') {
    return `直行态下不可规划：${action}。「${gateRuntime.words.routeMain}」已选，请直接使用 write/edit/pwsh/bash 等工具动手完成任务`
  }
  if (state && state.route === 'plan' && state.purpose !== 'refine' && state.purpose !== 'redo') {
    return `规划目的尚未确认：${action}。${gateRuntime.confirm.purpose}，答复后再调用 ${action}`
  }
  if (state && state.route === 'plan' && state.clarified === false) {
    return `澄清问答尚未完成：${action}。请先调用 extra_plan_gate 并传入 gate = clarify 做澄清问答（1-3 个关键问题，给候选选项），完成后再调用 ${action}`
  }
  return `子代理未放行：${action}。${gateRuntime.confirm.route}，意图澄清问答后再调用 ${action}`
}
function executorDenyReason(action, state, gateRuntime) {
  return `执行类委派未放行：${action}。请先调用 extra_plan_gate 并传入 gate = route，让用户选择「${gateRuntime.words.routeExecutor}」后再委派执行者`
}

// 当前宿主事件只保留 PTC dispatch 形状；旧 code-dispatch 运行分支已删除。

// shell mutation 辅助函数由 lib/shell-mutation.js 提供；下方 import 保持公开 decisions 绑定。



// ── 纯判定函数（模块顶层；经 decisions 导出供场景测试直接复用，防复制漂移） ──

// 会话事件快照的唯一来源 = lib/agent-session.js；本模块不复制子代理识别逻辑。

// 委派角色判定由下方从 lib/agent-runtime.js 导入。
// anchored 引导阶段判定：会话尚未落盘任何 tool/call 事件。
function filterBootstrapContextDecision(decision, gated) {
  if (gated !== true || decision === null || typeof decision !== 'object' || decision.kind !== 'enter' || !Array.isArray(decision.messages)) return decision
  const messages = decision.messages.filter((message) => {
    if (message === null || typeof message !== 'object' || message.source === null || typeof message.source !== 'object') return true
    return message.source.kind !== 'agent-instructions' && message.source.kind !== 'skill-catalog'
  })
  return messages.length === decision.messages.length ? decision : { ...decision, messages }
}

function projectedSkillCatalogSignature(message) {
  if (message === null || typeof message !== 'object' || message.source === null || typeof message.source !== 'object' || message.source.kind !== 'skill-catalog' || !Array.isArray(message.source.entries)) return undefined
  const entries = []
  for (const entry of message.source.entries) {
    if (entry === null || typeof entry !== 'object' || typeof entry.name !== 'string' || entry.name === '' || typeof entry.description !== 'string') return undefined
    entries.push([entry.name, entry.description])
  }
  return JSON.stringify(entries)
}

function jsonShapeSignature(value, active = new Set()) {
  if (value === null) return 'null'
  if (typeof value === 'string') return JSON.stringify(value)
  if (typeof value === 'boolean') return value ? 'true' : 'false'
  if (typeof value === 'number') return Number.isFinite(value) ? String(value) : undefined
  if (typeof value !== 'object') return undefined
  if (active.has(value)) return undefined
  active.add(value)
  try {
    if (Array.isArray(value)) {
      const items = []
      for (const item of value) {
        const signature = jsonShapeSignature(item, active)
        if (signature === undefined) return undefined
        items.push(signature)
      }
      return '[' + items.join(',') + ']'
    }
    const prototype = Object.getPrototypeOf(value)
    if (prototype !== Object.prototype && prototype !== null) return undefined
    const parts = []
    for (const key of Object.keys(value).sort()) {
      const signature = jsonShapeSignature(value[key], active)
      if (signature === undefined) return undefined
      parts.push(JSON.stringify(key) + ':' + signature)
    }
    return '{' + parts.join(',') + '}'
  } catch {
    return undefined
  } finally {
    active.delete(value)
  }
}

function projectedAgentInstructionsSignature(message) {
  if (message === null || typeof message !== 'object' || message.source === null || typeof message.source !== 'object' || message.source.kind !== 'agent-instructions') return undefined
  if (!Array.isArray(message.content) || message.content.length === 0) return undefined
  return jsonShapeSignature(message.content)
}

function projectedContextSignature(message) {
  if (message === null || typeof message !== 'object' || message.source === null || typeof message.source !== 'object') return undefined
  const kind = message.source.kind
  const signature = kind === 'agent-instructions'
    ? projectedAgentInstructionsSignature(message)
    : kind === 'skill-catalog' ? projectedSkillCatalogSignature(message) : undefined
  return signature === undefined ? undefined : { kind, signature }
}

function dedupeProjectedContextDecision(decision, visibleMessages) {
  if (decision === null || typeof decision !== 'object' || decision.kind !== 'enter' || !Array.isArray(decision.messages)) return decision
  const baselines = new Map()
  if (Array.isArray(visibleMessages)) {
    for (const message of visibleMessages) {
      const projected = projectedContextSignature(message)
      if (projected !== undefined) baselines.set(projected.kind, projected.signature)
    }
  }
  let changed = false
  const messages = []
  for (const message of decision.messages) {
    const projected = projectedContextSignature(message)
    if (projected !== undefined && baselines.get(projected.kind) === projected.signature) {
      changed = true
      continue
    }
    messages.push(message)
    if (projected !== undefined) baselines.set(projected.kind, projected.signature)
  }
  return changed ? { ...decision, messages } : decision
}
// 首轮相位判定：会话尚未落盘任何 tool/call 事件即「引导期」。
// 改造8（账本与弃用迁移）后签名带 events：异步钩子必须传自己已预取的 lease.events
// （observeSession 的不可变快照），走 events 通道、不再经宿主的同步快照通道；
// events 未传或非法（既有夹具、仍走同步快照的调用方）才在 sessionEvents 内部回落到同步快照兜底。
function isBootstrapPhase(agent, events) {
  if (agent === undefined || agent === null) return false
  const session = agent.session
  if (session === undefined || session === null) return false
  const source = sessionEvents(session, events)
  return !source.some((event) => {
    if (event === null || typeof event !== 'object') return false
    return event.type === 'tool/call' || (Array.isArray(event.type) && event.type.includes('tool/call'))
  })
}

// shell 命令解码与 mutation 匹配由 lib/shell-mutation.js 提供。


// 免计瀑布预算的工具白名单（planner 预算计数与 pre-execute 闸门豁免共用）。
const FREE_TOOLS = new Set(['save_plan'])

// ContentBlock 数组首条 text 块的文本（无 text 块 → ''）
function firstTextOfBlocks(blocks) {
  if (!Array.isArray(blocks)) return ''
  for (const block of blocks) {
    if (block !== null && typeof block === 'object' && block.type === 'text' && typeof block.text === 'string') return block.text
  }
  return ''
}

function resetStageState(state) {
  state.purpose = 'none'
  state.clarified = false
}

function resetRouteState(state) {
  state.route = 'none'
  resetStageState(state)
}

function applyGateOutcome(state, gate, result) {
  // outcome 口径：answered 推进状态；cancelled 清空闸门状态（route/purpose/clarified 全复位，
  // 与改造前对「用户取消」的处理一致）；skipped（未作答）与 channel-error（提问通道故障）不改动既有字段。
  // clarify 仅当 route=plan 且 purpose∈{refine,redo} 时由 answered 置位（与 purpose 分支的 route 前置同口径）。
  if (result === null || typeof result !== 'object') return
  const outcome = result.outcome
  if (outcome === 'cancelled') {
    resetRouteState(state)
    return
  }
  if (outcome !== 'answered') return
  if (gate === 'route') {
    // route 覆盖式写入；每次 route 闸门作答都无条件清空 purpose 与 clarified（与改造前一致）。
    const route = result.route
    if (route !== 'main' && route !== 'executor' && route !== 'plan' && route !== 'none') return
    resetStageState(state)
    state.route = route
    return
  }
  if (gate === 'purpose') {
    // purpose 只在规划路线上成立，写入的同时把澄清态复位。
    if (state.route !== 'plan') return
    const purpose = result.purpose
    if (purpose !== 'refine' && purpose !== 'redo') return
    state.purpose = purpose
    state.clarified = false
    return
  }
  if (gate === 'clarify' && state.route === 'plan' && (state.purpose === 'refine' || state.purpose === 'redo')) state.clarified = true
}

// 三锚点状态机（纯函数，自最近一条人类消息起的事件推导）：
//   route: 'none' | 'main' | 'executor' | 'plan'（用户选「暂不推进」→ 回 'none'，保持未确认）
//   purpose: 'none' | 'refine' | 'redo'（purposeRefine → refine / purposeRedo → redo）
//   clarified: 是否有完成的澄清问答（clarify 闸门 answered 且 route=plan 且 purpose∈{refine,redo} 时置 true，换路线时随阶段态一起清空）
// 唯一推进源是 extra_plan_gate 的 tool/call 与 tool/result（含 run_code 内嵌套的 ptc-dispatch 形态）：
// 调用参数取 gate，结果文本解析 JSON 后取 outcome 与 route/purpose，交 applyGateOutcome 处理：
// answered 按 gate 推进（clarify 仅当 route=plan 且 purpose∈{refine,redo} 时置位 clarified）；cancelled 清空闸门状态（route/purpose/clarified 全复位）；
// skipped（未作答）与 channel-error（提问通道故障）均不改动既有字段。
// 普通 ask_user_question 不再参与状态推导。
function deriveFlowState(events, gateRuntime) {
  const state = { route: 'none', clarified: false, purpose: 'none' }
  if (!Array.isArray(events)) return state
  let lastHuman = -1
  for (let i = events.length - 1; i >= 0; i -= 1) {
    const e = events[i]
    if (e !== null && typeof e === 'object' && e.type === 'user/message' &&
        e.data !== null && typeof e.data === 'object' &&
        e.data.source !== null && typeof e.data.source === 'object' &&
        e.data.source.kind === 'user') {
      lastHuman = i
      break
    }
  }
  if (lastHuman === -1) return state
  const calls = new Map() // callId / subCallId → gate（route、purpose、clarify）
  // 调用参数取 gate：arguments 可能是 JSON 字符串，也可能是已解析对象。
  const gateOfArgs = (args) => {
    let parsed = null
    if (typeof args === 'string' && args.length > 0) {
      try { parsed = JSON.parse(args) } catch (error) { return null }
    } else if (args !== null && typeof args === 'object') {
      parsed = args
    }
    if (parsed === null || typeof parsed !== 'object') return null
    return typeof parsed.gate === 'string' ? parsed.gate : null
  }
  // 结果文本取 JSON：闸门工具的返回值整体序列化在首个 text 块里，解析失败即跳过。
  const resultOfBlocks = (blocks) => {
    const text = firstTextOfBlocks(blocks)
    if (typeof text !== 'string' || text === '') return null
    let parsed = null
    try { parsed = JSON.parse(text) } catch (error) { return null }
    return parsed !== null && typeof parsed === 'object' ? parsed : null
  }
  for (let i = lastHuman + 1; i < events.length; i += 1) {
    const e = events[i]
    if (e === null || typeof e !== 'object') continue
    if (e.data === null || typeof e.data !== 'object') continue
    // 形态一：普通直呼——tool/call 登记 gate，tool/result 交回结果。
    if (e.type === 'tool/call') {
      if (e.data.name !== GATE_TOOL || typeof e.data.callId !== 'string') continue
      const gate = gateOfArgs(e.data.arguments)
      if (gate !== null) calls.set(e.data.callId, gate)
      continue
    }
    if (e.type === 'tool/result') {
      const message = e.data.message
      if (message === null || typeof message !== 'object' || typeof message.toolCallId !== 'string') continue
      if (!calls.has(message.toolCallId)) continue
      applyGateOutcome(state, calls.get(message.toolCallId), resultOfBlocks(message.content))
      continue
    }
    // 形态二：run_code 内嵌套调用——tool/ptc-dispatch-start 登记 gate，tool/ptc-dispatch 交回结果。
    if (isDispatchStart(e.type)) {
      if (e.data.name !== GATE_TOOL || typeof e.data.subCallId !== 'string') continue
      const gate = gateOfArgs(e.data.arguments)
      if (gate !== null) calls.set(e.data.subCallId, gate)
      continue
    }
    if (isDispatch(e.type)) {
      if (typeof e.data.subCallId !== 'string' || !calls.has(e.data.subCallId)) continue
      applyGateOutcome(state, calls.get(e.data.subCallId), resultOfBlocks(e.data.content))
    }
  }
  return state
}


// planner budget 辅助函数由 lib/planner-budget.js 提供。

// planner prompt 与预算提示辅助函数由 lib/planner-budget.js 提供。

// planner budget 策略辅助函数由 lib/planner-budget.js 提供。
// save_plan/save_probe 合同、校验与渲染已拆至 plugins/dsh-extra-plan/lib。

// 工具集判定（真实工具集 tools.schemas，restrict 后非折叠；目录判定保留为 schemas 不可得时的回落）。
// 元素支持两种形状：字符串工具名、{ name } 对象（装配目录/工具集均为对象形状）。
function catalogHasWriteTools(tools) {
  if (!Array.isArray(tools)) return false
  return tools.some((tool) =>
    (typeof tool === 'string' && (tool === 'write' || tool === 'edit')) ||
    (tool !== null && typeof tool === 'object' && (tool.name === 'write' || tool.name === 'edit')))
}

// 只读子代理（reviewer）判定：目录非空且不含 write/edit。
function isReadOnlyChildByCatalog(tools) {
  return Array.isArray(tools) && tools.length > 0 && !catalogHasWriteTools(tools)
}

// 工具集判定：真实工具集（tools.schemas，restrict 后非折叠）是否含 write/edit——
// 含 write/edit=可写（executor），无 write/edit=只读（probe/reviewer）。
// 形状约定与 catalogHasWriteTools 同（字符串元素 / { name } 对象）；非数组 → false。
function schemasHasWriteTools(schemas) {
  if (!Array.isArray(schemas)) return false
  return schemas.some((tool) =>
    (typeof tool === 'string' && (tool === 'write' || tool === 'edit')) ||
    (tool !== null && typeof tool === 'object' && (tool.name === 'write' || tool.name === 'edit')))
}

// 工具集判定：真实工具集是否含指定工具名（save_probe 信号：仅主会话与认领的 probe 子代理注册）。
// 形状约定同上；非数组 → false。
function schemasHasTool(schemas, toolName) {
  if (!Array.isArray(schemas)) return false
  return schemas.some((tool) =>
    (typeof tool === 'string' && tool === toolName) ||
    (tool !== null && typeof tool === 'object' && tool.name === toolName))
}

// ptc 折叠目录判定：ptc 模式下 wireSchemas 塌缩为仅 [run_code]——折叠点在被装配的
// @deepseek-ai/dsh-tool-executor-ptc 包的 schemas 声明（本仓只按包名描述，不记宿主固定行号）。
// 判定口径与 catalogIsCollapsed 逐条对应：工具集非数组或长度不为 1 → 不折叠；唯一元素是 run_code
// （字符串或对象 {name:'run_code'}）即视为折叠，即「仅剩 run_code 即视为折叠」。折叠时目录信号不可用
// （executor/reviewer/probe 目录同为 [run_code]，目录无 write/edit 不代表只读角色）→ 只读判定改用真实
// 工具集（schemas(agent) 不受折叠影响）：含 write/edit=可写（executor），无 write/edit=只读（probe/reviewer），
// reviewer 的 write/edit 由目录层 deny 兜底。
function catalogIsCollapsed(tools) {
  if (!Array.isArray(tools) || tools.length !== 1) return false
  const only = tools[0]
  return (typeof only === 'string' && only === 'run_code') ||
    (only !== null && typeof only === 'object' && only.name === 'run_code')
}

// ① subagent_probe 分支：明确按 main/planner/child 角色单点判定。
// T5：探查者仅主会话可委派——planner 与其它 child 都必须在运行时第二道防线拒绝，
// 直呼/listener 和 run_code 组判定统一走本函数，避免 toolFilter 漏洞造成递归委派。
// planner 文案必须引导「申请继续探查」；其它 child 保持只读角色文案。
function subagentProbeGateReason(exec, role) {
  const roleKind = typeof role === 'string' ? role : role !== undefined && role !== null && typeof role.kind === 'string' ? role.kind : 'child'
  if (roleKind === 'planner') {
    return '规划子代理不得委派探查者：subagent_probe 仅主会话可用（探查者属主会话的探查能力）。请用 read/glob/grep 自行核对；确有缺口时输出「申请继续探查：<待查项> — <原因>」，由主会话派探查者并把线索文件路径转达给你（toolFilter 之外的第二道防线）'
  }
  if (roleKind !== 'main') {
    return '只读子代理不得委派探查者：subagent_probe 仅主会话可用；请保持当前角色的只读边界'
  }
  // 委派工具参数表里已无后台标志（dsh-tool-subagent 只暴露 cwd/description/prompt 与
  // 可选模型项）：委派恒为立即返回 subagentId 加完成通知，原「必须后台」断言不再成立，
  // 后台约束上移到宿主层，本闸门只保留名称级放行。
  return null
}

// shell 写命令的只读角色拒绝文案（B3 收敛：唯一实现，planner/探查者/验收复核者 × pwsh/bash 共六格；
// 六格基础拒句与重构前逐字一致，固定依据后缀由 withShellEvidence 统一追加。只处理 pwsh/bash 且确实命中既有 mutation 判定的调用；role 只接受
// planner/probe/reviewer，其余（含未知角色、非 shell 工具、只读命令）一律返回 null。
// write/edit 分支与本函数无关，各自 GateReason 内逐字保留。
function withShellEvidence(reason, name, evidence) {
  if (evidence === null) return reason
  const hit = evidence.value === '' ? '' : ' 命中 ' + evidence.value
  return reason + '；触发依据：' + name + ' ' + evidence.rule + hit
}

function shellMutationReason(role, exec) {
  let label = null
  if (role === 'planner') label = '规划子代理'
  else if (role === 'probe') label = '探查者'
  else if (role === 'reviewer') label = '验收复核者'
  if (label === null) return null
  if (exec === undefined || exec === null) return null
  if (exec.name === 'pwsh') {
    const evidence = pwshMutationEvidence(exec)
    return evidence === null ? null : withShellEvidence(label + '只读：pwsh 仅限只读探查命令，禁止创建/修改/删除文件', 'pwsh', evidence)
  }
  if (exec.name === 'bash') {
    const evidence = bashMutationEvidence(exec)
    return evidence === null ? null : withShellEvidence(label + '只读：bash 仅限只读探查命令，禁止创建/修改/删除文件', 'bash', evidence)
  }
  return null
}

// 子代理控制工具硬闸：仅主会话可用；保持纯函数以供直呼与 run_code 组判定复用。
function childControlGateReason(exec) {
  const name = exec !== undefined && exec !== null && typeof exec.name === 'string' ? exec.name : ''
  if (name !== 'send_message' && name !== 'interrupt_agent') return null
  return `子代理禁止调用 ${name}：send_message 与 interrupt_agent 仅主会话可用`
}

// ② planner 分支（plannerGateReason；自 apply 内提取的纯部分）：write/edit → shell 写命令
// （shellMutationReason）→ job_output → 预算；不含 run_code（由调用方处理）。
function plannerGateReason(exec, events, exploreBudget, jobOutputCallCounters) {
  const controlReason = childControlGateReason(exec)
  if (controlReason !== null) return controlReason
  if (exec.name === 'write' || exec.name === 'edit') {
    return '规划子代理只读：方案经 save_plan 落盘，其余写入一律禁止（toolFilter 之外的第二道防线）'
  }
  const shellReason = shellMutationReason('planner', exec)
  if (shellReason !== null) return shellReason
  if (exec.name === 'job_output') return jobOutputGateReason(exec, jobOutputCallCounters)
  if (!FREE_TOOLS.has(exec.name) && !isRunCodeSubCall(exec)) {
    const used = toolCallsSinceUser(events !== undefined ? events : [], FREE_TOOLS)
    if (budgetExceeded(used + 1, exploreBudget)) {
      return budgetExhaustedReason(Math.min(used, exploreBudget), exploreBudget)
    }
  }
  return null
}

// ③ child 只读块（childReadonlyGateReason；自 apply 内提取的纯部分）：write/edit → shell 写命令
// （shellMutationReason，probe 布尔选角色）→ job_output；不含 run_code。
function childReadonlyGateReason(exec, probe, jobOutputCallCounters) {
  const controlReason = childControlGateReason(exec)
  if (controlReason !== null) return controlReason
  if (exec.name === 'write' || exec.name === 'edit') {
    return probe ? '探查者只读：探查不修改任何文件，write/edit 一律禁止（工具目录判定）' : '验收复核者只读：验收复核不修改任何文件，write/edit 一律禁止（工具目录判定）'
  }
  const shellReason = shellMutationReason(probe ? 'probe' : 'reviewer', exec)
  if (shellReason !== null) return shellReason
  if (exec.name === 'job_output') return jobOutputGateReason(exec, jobOutputCallCounters)
  return null
}

// job_output 全角色闸门（v0.1.10）：wait:true 禁令 + 同 job 查重（自原 mainGateReason 分支逐字搬移，
// 闸门 1/2 文案逐字不变）；counters undefined/null 或 vExec 无 agent（组判定成员）时
// 跳过查重、wait 检查照常。本函数只读查重，写入侧唯一位点是 recordJobOutputCall（B3 收敛）。
function jobOutputGateReason(exec, jobOutputCallCounters) {
  const args = exec !== undefined && exec !== null ? exec.arguments : undefined
  // 闸门 1：禁止 wait: true 前台等待（参数不可解析时跳过，运行时瀑布兜底）
  if (args !== undefined && args !== null && typeof args === 'object' && args.wait === true) {
    return 'job_output 禁止带 wait: true 前台等待。请省略 wait 参数或设 wait: false，job 完成后会收到通知'
  }
  // 闸门 2：禁止同一 jobId 连续调用（防轮询）——内存计数器替代 events 推导。
  // 只读查重（写入由 recordJobOutputCall 在放行路径执行，时序等价）；组判定成员无会话上下文时
  // 跳过（运行时瀑布兜底）。
  if (args !== undefined && args !== null && typeof args === 'object' && typeof args.job_id === 'string') {
    const execAgent = exec !== undefined && exec !== null ? exec.agent : undefined
    const header = execAgent !== undefined && execAgent !== null && execAgent.session !== undefined && execAgent.session !== null ? execAgent.session.header : undefined
    const sessId = header !== undefined && header !== null ? header.id : undefined
    const counters = jobOutputCallCounters
    if (typeof sessId === 'string' && counters !== undefined && counters !== null) {
      const perSession = counters.get(sessId)
      if (perSession !== undefined && perSession !== null && perSession.has(args.job_id)) {
        return `job_output 禁止对同一 job 重复调用。job "${args.job_id}" 在本轮已调用过，请等待子代理返回结果，禁止提前收尾、结束`
      }
    }
  }
  return null
}

// job_output 放行后的计数器记录（B3 收敛：唯一实现；planner、只读 child、主会话三处共用，
// 执行者仍完全豁免）。仅当工具名恰为 job_output、job_id 为字符串、sessionId 为字符串且
// counters 可用时惰性建 session Map 并写 jobId→1；任一条件不满足即返回 false 且零副作用。
// 返回值仅供场景测试断言状态迁移，运行时调用方忽略。
function recordJobOutputCall(agent, exec, counters) {
  if (exec === undefined || exec === null || exec.name !== 'job_output') return false
  const args = exec.arguments
  if (args === undefined || args === null || typeof args !== 'object' || typeof args.job_id !== 'string') return false
  const header = agent !== undefined && agent !== null && agent.session !== undefined && agent.session !== null ? agent.session.header : undefined
  const sessId = header !== undefined && header !== null ? header.id : undefined
  if (typeof sessId !== 'string') return false
  if (counters === undefined || counters === null) return false
  let perSession = counters.get(sessId)
  if (perSession === undefined) { perSession = new Map(); counters.set(sessId, perSession) }
  perSession.set(args.job_id, 1)
  return true
}

// job_list/list_agents 主会话防轮询闸门（v0.4.0）：同锚点周期内第二次调用拒绝（首次放行）。
// 无参数键，按调用行为计数：pollGuardCounters 为 Map<sessionId, Set<'job_list'|'list_agents'>>。
// 只读查重；写入侧唯一位点是 recordPollGuardCall（B3 收敛同款）；vExec 无 agent（组判定成员）时
// 跳过查重（运行时瀑布重入兜底，与 jobOutputGateReason 同口径）。
function pollGuardGateReason(exec, pollGuardCounters) {
  const name = exec !== undefined && exec !== null && typeof exec.name === 'string' ? exec.name : ''
  if (name !== 'job_list' && name !== 'list_agents') return null
  const execAgent = exec !== undefined && exec !== null ? exec.agent : undefined
  const header = execAgent !== undefined && execAgent !== null && execAgent.session !== undefined && execAgent.session !== null ? execAgent.session.header : undefined
  const sessId = header !== undefined && header !== null ? header.id : undefined
  if (typeof sessId === 'string' && pollGuardCounters !== undefined && pollGuardCounters !== null) {
    const called = pollGuardCounters.get(sessId)
    if (called !== undefined && called !== null && called.has(name)) {
      return '禁止轮询子代理状态，停止操作并等待子代理通知'
    }
  }
  return null
}
// job_list/list_agents 放行后的计数器记录（唯一写入位点；仅主会话路径调用）。
function recordPollGuardCall(agent, exec, counters) {
  if (exec === undefined || exec === null) return false
  if (exec.name !== 'job_list' && exec.name !== 'list_agents') return false
  const header = agent !== undefined && agent !== null && agent.session !== undefined && agent.session !== null ? agent.session.header : undefined
  const sessId = header !== undefined && header !== null ? header.id : undefined
  if (typeof sessId !== 'string') return false
  if (counters === undefined || counters === null) return false
  let called = counters.get(sessId)
  if (called === undefined) { called = new Set(); counters.set(sessId, called) }
  called.add(exec.name)
  return true
}

// 探查者级联中止告警：委派方轮次结束 → activation dispose → 宿主 jobs-local owner
// 级联取消探查者续轮会话的后台 job（owner disposed）——agent/disposed 清理时若仍有未认领
// 探查者委派计数即告警留痕。T5 后 planner 不得委派探查者（闸门拒绝），委派方只剩主
// 会话，故文案中性化为「委派方会话销毁时」（触发路径 = 主会话在探查者认领前被销毁；
// 原硬编码「规划子代理」属错配）。已知引擎限制：根治需官方包配合（dsh-jobs-local/
// dsh-tool-subagent/dsh-subagent），extra-plan 侧只能告警+文档说明（见教训索引）。
function probeDisposalWarning(remaining) {
  if (!Number.isInteger(remaining) || remaining <= 0) return null
  return '委派方会话销毁时仍有 ' + remaining + ' 个未认领探查者委派：其后台 job 可能已被宿主级联取消（owner disposed）。已知引擎限制：探查者为续轮子代理、owner=委派者，级联取消修复需官方包配合（dsh-jobs-local/dsh-tool-subagent/dsh-subagent）'
}

// ④ 主会话段（mainGateReason；自 apply 内提取的纯部分，分支顺序逐字同序）：
//    ask → write/edit → cordis 2 只读 → pwsh/bash → planToolName
//    → save_probe 分支保持不变（route=plan + purpose∈{refine,redo} + clarified）
//    → subagent 族 → run_code（调 runCodeGroupDenyReason，depth+1）
//    → job_output（wait 检查 + 计数器查重，只读不写入；set 由 recordJobOutputCall 在放行路径执行）→ null。
//    save_plan 已移除路由态限制：无显式分支，由本函数兜底 return null 任意路由态放行
//    （受限规划工件：仅写 cwd/.extra-plan 固定形状 Markdown，内容闸门与规划子代理同一实现）。
//    gateCtx: { events, planToolName, jobOutputCallCounters, pollGuardCounters, runCodeDepth, runcodeCatchGate, getAgents(可选), messageTargetIdOf(arguments)(可选), gateRuntime }（gateRuntime 必填）。
function mainGateReason(state, exec, gateCtx) {
  const ctx = gateCtx !== undefined && gateCtx !== null ? gateCtx : {}
  const gateRuntime = ctx.gateRuntime
  if (gateRuntime === undefined || gateRuntime === null) {
    throw new Error('extra-plan: mainGateReason 需要本次 apply 的 gateRuntime（config.gateWords）；helper 不得自建默认词表')
  }
  const events = ctx.events !== undefined && ctx.events !== null ? ctx.events : []
  const planToolName = typeof ctx.planToolName === 'string' && ctx.planToolName !== '' ? ctx.planToolName : 'subagent_plan'
  state = state !== undefined && state !== null ? state : { route: 'none', clarified: false, purpose: 'none' }
  const name = exec !== undefined && exec !== null && typeof exec.name === 'string' ? exec.name : ''
  if (name === ASK_TOOL) {
    // 1b：普通 ask_user_question 的选项标签推断与结构校验整体退场（选项由 extra_plan_gate 生成）；
    // 主会话侧的闸门判定已前移到 extra_plan_gate 工具，这里直接放行以免旧路径形成死锁。
    return null
  }
  if (name === 'write' || name === 'edit') {
    // route 非 main 即拒：main 才允许主会话直接动手，plan 走规划子代理，executor 走执行者委派。
    if (state.route !== 'main') {
      return routeDenyReason('write/edit', state, gateRuntime)
    }
    return null
  }
  // cordis（官方工具集，只读引用）：当前支持两个只读工具。
  if (name === 'cordis_inspect_list' || name === 'cordis_inspect_query') {
    return null
  }
  const shellEvidence = name === 'pwsh' ? pwshMutationEvidence(exec) : name === 'bash' ? bashMutationEvidence(exec) : null
  if (shellEvidence !== null) {
    const shellLabel = name
    // 越界特例的等价映射（对应改造前的两级串行判定）：
    // 第一级 = 路线是否已确认：route=none（未确认）一律拒绝、且不追加越界指引，避免误导为可绕过；
    // 第二级 = 已确认路线（executor/plan）：带 sandbox_permissions 字符串才是「工作区外写入」放行
    // （宿主审批闸在其后），不带则拒绝并在 routeDenyReason 口径后追加越界指引。
    if (state.route !== 'main') {
      if (state.route === 'none') {
        return withShellEvidence(routeDenyReason(shellLabel, state, gateRuntime), shellLabel, shellEvidence)
      }
      const shellArgs = exec !== undefined && exec !== null ? exec.arguments : undefined
      if (shellArgs !== undefined && shellArgs !== null && typeof shellArgs === 'object' && typeof shellArgs.sandbox_permissions === 'string') {
        return null
      }
      return withShellEvidence(routeDenyReason(shellLabel, state, gateRuntime) + OUT_OF_SCOPE_WRITE_HINT, shellLabel, shellEvidence)
    }
    return null
  }
  if (name === planToolName) {
    if (state.route !== 'plan' || state.clarified !== true || (state.purpose !== 'refine' && state.purpose !== 'redo')) {
      return planDenyReason(planToolName, state, gateRuntime)
    }
    // 委派工具参数表里已无后台标志：规划子代理的续轮由宿主 continuable 后端固定为
    // 立即返回加通知，前台等待不存在，故只保留路由态判定。
    return null
  }
  if (name === 'save_probe') {
    if (state.route !== 'plan' || state.clarified !== true || (state.purpose !== 'refine' && state.purpose !== 'redo')) {
      return planDenyReason('save_probe', state, gateRuntime)
    }
    return null
  }
  if (name === 'subagent' || name === 'subagent_fork' || name === 'workflow' || name === 'ralph' || name === 'subagent_review') {
    if (state.route !== 'executor') {
      return executorDenyReason(name, state, gateRuntime)
    }
    // 委派工具参数表里已无后台标志：subagent/subagent_review 恒为立即返回 subagentId
    // 加完成通知，后台约束在宿主层，本处只保留路线判定。
    return null
  }
  // 主会话层工具限制（v0.4.0 四工具治理）：job_kill 仅直行路线放行；
  // send_message 主会话向 running 目标拒绝；job_list/list_agents 同锚点防轮询。
  // planner/只读 child/执行者不进本函数（pre-execute 角色分流），子代理侧维持现状。
  if (name === 'job_kill') {
    if (state.route !== 'main') {
      return `当前状态禁止job_kill。如用户要求停止子代理，${gateRuntime.confirm.route}，选择「${gateRuntime.words.routeMain}」后才可执行 job_kill`
    }
    return null
  }
  if (name === 'send_message') {
    // 主会话调用者：目标 running → 拒；idle/未驻留/agents 服务不可用 → 放行
    // （未驻留或已回收目标由宿主 coldResume NOT_RESUMABLE 自拒）。
    if (typeof ctx.getAgents === 'function') {
      const agents = ctx.getAgents()
      if (agents !== undefined && agents !== null && typeof agents.get === 'function') {
        const smArgs = exec !== undefined && exec !== null ? exec.arguments : undefined
        // DSH_CURRENT_RC2：可选回调优先读取新 agent 名称/路径的本轮解析ID；删除边界仅限最新路径 agent 与 resolveName 适配（rc.2 与 rc.3 共用），须另行授权，不含共享安全核心。
        // DSH_COMPAT_RC1：新参数未提供时读取旧 agent_id Session ID；删除边界仅限 rc.1 旧参数兼容，须另行授权，不含共享安全核心。
        const targetId = typeof ctx.messageTargetIdOf === 'function'
          ? ctx.messageTargetIdOf(smArgs)
          : smArgs !== undefined && smArgs !== null && typeof smArgs === 'object' && typeof smArgs.agent_id === 'string' ? smArgs.agent_id : null
        if (typeof targetId === 'string') {
          const target = agents.get(targetId)
          if (target !== undefined && target !== null && target.status === 'running') {
            return '子代理running中，禁止打扰'
          }
        }
      }
    }
    return null
  }
  if (name === 'job_list' || name === 'list_agents') return pollGuardGateReason(exec, ctx.pollGuardCounters)
  if (name === 'run_code') {
    return runCodeGroupDenyReason(state, exec, { kind: 'main' }, { events, planToolName, jobOutputCallCounters: ctx.jobOutputCallCounters, pollGuardCounters: ctx.pollGuardCounters, getAgents: ctx.getAgents, messageTargetIdOf: ctx.messageTargetIdOf, runcodeCatchGate: ctx.runcodeCatchGate, runCodeDepth: (typeof ctx.runCodeDepth === 'number' ? ctx.runCodeDepth : 0) + 1, gateRuntime })
  }
  if (name === 'job_output') return jobOutputGateReason(exec, ctx.jobOutputCallCounters)
  return null
}

// 组判定：run_code 拆解 → 逐成员走「与直呼完全相同的闸门」→ 聚合拒绝。
// state：主会话 flow state（role.kind==='main' 时必传；其它角色忽略）；缺省归一化为
// { route:'none', clarified:false, purpose:'none' }。
// role：{ kind:'main' } | { kind:'planner' } | { kind:'child', readOnly:boolean, probe:boolean }。
// gateCtx: { events, planToolName, jobOutputCallCounters, pollGuardCounters, runCodeDepth, runcodeCatchGate, getAgents(可选), messageTargetIdOf(arguments)(可选), gateRuntime }（gateRuntime 必填）。
// 缺省：events:[]、planToolName:'subagent_plan'、jobOutputCallCounters:new Map()、pollGuardCounters:new Map()、
// exploreBudget:DEFAULT_EXPLORE_BUDGET、runCodeDepth:0、runcodeCatchGate:false；getAgents 不设缺省（undefined 即 fail-open 放行）；
// gateRuntime 必须由调用方显式传入（词表唯一值源是 config.gateWords，helper 无默认词表）。
// 多调用容错硬闸门：成员逐项判定之后、聚合之前执行 runCodeCatchGateReason（教学式文案）。
// 返回 null=放行；非 null=聚合拒绝文案。
function runCodeGroupDenyReason(state, exec, role, gateCtx) {
  const ctx = {
    events: [],
    planToolName: 'subagent_plan',
    jobOutputCallCounters: new Map(),
    pollGuardCounters: new Map(),
    exploreBudget: DEFAULT_EXPLORE_BUDGET,
    runCodeDepth: 0,
    runcodeCatchGate: false,
    ...(gateCtx !== undefined && gateCtx !== null ? gateCtx : {}),
  }
  const st = state !== undefined && state !== null
    ? state
    : { route: 'none', clarified: false, purpose: 'none' }
  const r = role !== undefined && role !== null && typeof role === 'object' && typeof role.kind === 'string' ? role : { kind: 'main' }
  const roleKind = r.kind
  const members = []
  const denies = []
  const visit = (codeArg, depth) => {
    // ask 返回值硬闸门只接入主会话；嵌套超出既有展开深度的部分仍由实际 pre-execute 重入兜底。
    const askReason = roleKind === 'main' ? askOrGateReturnGateReason(codeArg) : null
    const decomposed = decomposeRunCode(codeArg)
    if (askReason !== null) {
      const askMember = { kind: 'tool', name: ASK_TOOL, argsParsed: true, args: {}, argsText: '' }
      if (!decomposed.members.some((member) => member.kind === 'tool' && member.name === ASK_TOOL)) members.push(askMember)
      denies.push({ member: askMember, reason: askReason })
    }
    for (const member of decomposed.members) {
      // 嵌套 run_code 成员展平：depth>=1 或参数不可解析 → 跳过（运行时瀑布兜底）；
      // 否则递归拆解 member.args.code 并原位展平（子成员按 role 继续判定）。
      if (member.name === 'run_code' && member.kind === 'tool') {
        if (depth >= 1 || !member.argsParsed || member.args === null || typeof member.args.code !== 'string') continue
        visit(member.args.code, depth + 1)
        continue
      }
      members.push(member)
      const vExec = member.kind === 'bare-write'
        ? { name: 'write', bare: true, hints: member.hints, arguments: {}, sub: true }
        : { name: member.name, arguments: member.argsParsed ? member.args : member.argsText, sub: true }
      let reason = roleKind !== 'main' ? childControlGateReason(vExec) : null
      if (reason === null && ctx.controlOnly !== true && member.name === 'subagent_probe') {
        reason = subagentProbeGateReason(vExec, roleKind)
      } else if (reason === null && ctx.controlOnly !== true && member.kind === 'bare-write') {
        // 裸写成员按角色分流：只读角色保留 v2 共享文案（hits 拼写与既有共享文案逐字同构）；
        // 主会话走 write/edit 闸门（routeDenyReason 文案）；
        // 执行者（child 非只读）豁免。
        if (roleKind === 'planner' || (roleKind === 'child' && r.readOnly === true)) {
          const h = member.hints
          reason = `只读角色仅允许只读探查：run_code 代码命中写模式特征 ${h.length} 处（${h.slice(0, 3).join('、')}${h.length > 3 ? ' 等' : ''}）。请改用 read/glob/grep 或 shell 只读命令`
        } else if (roleKind === 'main') {
          reason = mainGateReason(st, vExec, ctx)
        } // 执行者豁免：reason 保持 null
      } else if (reason === null && ctx.controlOnly !== true && roleKind === 'planner') {
        reason = plannerGateReason(vExec, ctx.events !== undefined ? ctx.events : [], ctx.exploreBudget, ctx.jobOutputCallCounters)
      } else if (reason === null && ctx.controlOnly !== true && roleKind === 'child') {
        reason = r.readOnly === true ? childReadonlyGateReason(vExec, r.probe === true, ctx.jobOutputCallCounters) : null
      } else if (reason === null && ctx.controlOnly !== true) {
        reason = mainGateReason(st, vExec, ctx)
      }
      if (reason !== null) denies.push({ member, reason })
    }
  }
  visit(runCodeTextOf(exec), ctx.runCodeDepth)
  if (ctx.controlOnly !== true && ctx.runcodeCatchGate === true) {
    const catchReason = runCodeCatchGateReason(runCodeTextOf(exec))
    if (catchReason !== null) denies.push({ member: { kind: 'catch', name: 'run_code' }, reason: catchReason })
  }
  if (ctx.controlOnly !== true && roleKind === 'planner') {
    const siteCount = runCodeSiteCount(runCodeTextOf(exec))
    if (siteCount > ctx.exploreBudget) denies.push({ member: { kind: 'cap', name: 'run_code' }, reason: `run_code 静态调用点 ${siteCount} 处超过单实例子调用上限 ${ctx.exploreBudget}（exploreBudget）：请拆分多个 run_code 或减少单次调用点` })
    // 新增（T2 修复）：预算耗尽白名单把关——budgetExceeded(toolCallsSinceUser(events, FREE_TOOLS)+1, exploreBudget) 时，
    // run_code 工具组必须成员组非空且全部 ∈ FREE_TOOLS 才放行；空组/动态访问（decomposeRunCode 置 dynamic）/
    // 任何非 FREE_TOOLS 成员（含嵌套 run_code、bare-write）→ 拒绝（保守）。拒绝文案=预算耗尽原文+动态拼接白名单。
    const budgetUsed = toolCallsSinceUser(ctx.events !== undefined ? ctx.events : [], FREE_TOOLS)
    if (budgetExceeded(budgetUsed + 1, ctx.exploreBudget)) {
      const budgetDecomposed = decomposeRunCode(runCodeTextOf(exec))
      const allFree = budgetDecomposed.dynamic !== true && budgetDecomposed.members.length > 0 && budgetDecomposed.members.every((m) => FREE_TOOLS.has(m.name))
      if (!allFree) {
        denies.push({ member: { kind: 'budget', name: 'run_code' }, reason: budgetExhaustedReason(Math.min(budgetUsed, ctx.exploreBudget), ctx.exploreBudget) + ` 预算耗尽后 run_code 仅可调用 ${[...FREE_TOOLS].join('/')}，其他工具均不放行` })
      }
    }
  }
  if (denies.length === 0) return null
  return aggregateRunCodeDenyReason(members, denies)
}

// 聚合报错（统一格式，任何一次组判定拒绝均用此格式；子文案逐字不变）：
// header 一行（组规模 + 触发明细计数 + 「全通过才放行」语义）+ 逐行 `- <标签>: <子文案>`；
// 标签规则：普通成员=工具名；裸写=`write（裸写特征：<hints 顿号连接>）`；
// 参数不可解析=`<工具名>（参数不可解析）`；行序=组员顺序（展平后）；子文案来自闸门函数原返回值；catch/cap/budget 直接取成员 name。
function aggregateRunCodeDenyReason(members, denies) {
  const lines = [`run_code 拆解预审未通过：工具组共 ${members.length} 项（去重后），${denies.length} 项触发闸门，任一触发即整体拒绝：`]
  for (const d of denies) {
    if (d.member.kind === 'catch') { lines.push(`- ${d.member.name}: ${d.reason}`); continue }
    if (d.member.kind === 'cap') { lines.push(`- ${d.member.name}: ${d.reason}`); continue }
    if (d.member.kind === 'budget') { lines.push(`- ${d.member.name}: ${d.reason}`); continue }
    let label = d.member.name
    if (d.member.kind === 'bare-write') label = `write（裸写特征：${d.member.hints.join('、')}）`
    else if (!d.member.argsParsed) label = `${d.member.name}（参数不可解析）`
    lines.push(`- ${label}: ${d.reason}`)
  }
  return lines.join('\n')
}





// run_code 静态 helper 单向接线：依赖只由根的 ASK_TOOL、GATE_TOOL 与当前 PTC dispatch 判定显式注入。
const {
  decomposeRunCode,
  runCodeCatchGateReason,
  collectRunCodeSites,
  askOrGateReturnGateReason,
  runCodeSiteCount,
  isRunCodeSubCall,
  runCodeDispatchGateReason,
  runCodeDispatchCapText,
} = createRunCodeStatic({ askTool: ASK_TOOL, gateTool: GATE_TOOL, isDispatchStart })

export {
  FREE_TOOLS, ASK_TOOL,
  routeDenyReason, planDenyReason, executorDenyReason, applyGateOutcome,
  isBootstrapPhase, filterBootstrapContextDecision, dedupeProjectedContextDecision,
  deriveFlowState,
  catalogHasWriteTools, isReadOnlyChildByCatalog, schemasHasWriteTools, schemasHasTool, catalogIsCollapsed,
  subagentProbeGateReason, shellMutationReason, childControlGateReason, plannerGateReason, childReadonlyGateReason, jobOutputGateReason, recordJobOutputCall,
  pollGuardGateReason, recordPollGuardCall, probeDisposalWarning, mainGateReason, runCodeGroupDenyReason, aggregateRunCodeDenyReason,
  decomposeRunCode, runCodeCatchGateReason, collectRunCodeSites, askOrGateReturnGateReason, runCodeSiteCount, isRunCodeSubCall, runCodeDispatchGateReason, runCodeDispatchCapText,
}
