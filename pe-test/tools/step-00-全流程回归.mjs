// 场景测试:extra-plan 判定逻辑（decisions 命名空间纯函数）
// 直接 import 插件导出的 decisions（与 index.js 同一份实现，无复制品）——
// 插件模块顶层无副作用，可在纯 Node 环境加载。
import { pathToFileURL, fileURLToPath } from 'node:url'
const PLUGIN_PATH = fileURLToPath(new URL('../../plugins/dsh-extra-plan/index.js', import.meta.url))
const plugin = await import(pathToFileURL(PLUGIN_PATH).href)
const {
  CHANNEL_BROKEN_CODES,
  ROUTE_WORD_DIRECT,
  ROUTE_WORD_PLAN,
  ROUTE_WORD_DISAGREE,
  APPROVAL_WORD_APPROVE,
  APPROVAL_WORD_REPLAN,
  ROUTE_OPTIONS_TEXT,
  APPROVAL_OPTIONS_TEXT,
  routeDenyReason,
  planDenyReason,
  approvalDenyReason,
  isSubagentChild,
  isLiveDelegation,
  childPolicyNeedsFloor,
  isBootstrapPhase,
  pwshCommandOf,
  pwshMutationMatches,
  labelsOfCallData,
  askKindOf,
  askKindOfRelaxed,
  isExactGateSet,
  isPartialGateSet,
  categorizeGateAsk,
  gateAskDenyReason,
  validateGateAskStructure,
  matchRouteLabel,
  matchApprovalLabel,
  parseAskResultData,
  parseDispatchAskResult,
  catalogIsCollapsed,
  RUNCODE_MUTATION_HINTS,
  codeMutationHints,
  runCodeDenyReason,
  deriveFlowState,
  plannerChildIdsOf,
  toolCallCount,
  toolCallsSinceUser,
  withPlannerPromptSuffix,
  BUDGET_REMINDER_THRESHOLD,
  budgetNoticeText,
  withBudgetNotice,
  budgetReminderText,
  budgetReminderMessage,
  budgetReminderSent,
  budgetExhaustedReason,
  budgetExceeded,
  sanitizeTaskName,
  timestamp,
  renderSavePlan,
  PROBE_LIMITS,
  validateProbe,
  renderSaveProbe,
  renderProbeMarkdown,
  extractProbeEvidenceRefs,
  resolveProbeRequestInjection,
} = plugin.decisions
const HERE = fileURLToPath(new URL('.', import.meta.url))

// ── 事件构造（真实形状，同 step-06-线索落盘.mjs / step-04-路由与写闸门.mjs 的事件构造函数，三处同构见 R6） ───
const um = () => ({ type: 'user/message', data: { source: { kind: 'user' } } })
const call = (name, cid, argumentsStr = '{}') => ({ type: 'tool/call', data: { name, callId: cid, arguments: argumentsStr } })
const ok = (cid, text) => ({ type: 'tool/result', data: { message: { content: [{ type: 'tool-result', toolCallId: cid, content: [{ type: 'text', text }] }] } } })
const err = (cid, code) => ({ type: 'tool/result', data: { error: { name: 'Error', ...(code === undefined ? {} : { code }) }, message: { content: [{ type: 'tool-result', toolCallId: cid, content: [] }] } } })
const routeArgs = JSON.stringify({ questions: [{ id: 'q1', options: [{ label: '直接执行' }, { label: '进行pro规划' }, { label: '不同意' }] }] })
const approvalArgs = JSON.stringify({ questions: [{ id: 'q1', options: [{ label: '同意执行' }, { label: '转交pro规划' }, { label: '不同意' }] }] })
const clarifyArgs = JSON.stringify({ questions: [{ id: 'q1', options: [{ label: '方案A' }, { label: '方案B' }] }] })
const answer = (labels) => JSON.stringify({ answers: labels.map((l) => ({ id: 'q1', selected: [l] })) })
const customAnswer = '{"answers":[{"id":"q1","custom":"改成XX"}]}'
const emptyAnswer = '{"answers":[]}'
// 嵌套事件 fixture（run_code 程序内嵌套调用，混合模式桥接 F1-F4）：
// code-dispatch-start 的 data={rootCallId,parentCallId,subCallId,name,arguments}（arguments 为对象形态，
// 与直呼 call 的 arguments JSON 字符串形态区别）；code-dispatch 的 data 另含 isError+content
// （content 直接是 ContentBlock 数组，无 tool/result 的 tool-result 外层）。
const cdStart = (name, sid, argsObj) => ({ type: 'tool/code-dispatch-start', data: { rootCallId: 'r1', parentCallId: 'pc1', subCallId: sid, name, arguments: argsObj } })
const cdEnd = (sid, text, isError = false) => ({ type: 'tool/code-dispatch', data: { rootCallId: 'r1', parentCallId: 'pc1', subCallId: sid, name: 'ask_user_question', arguments: {}, isError, content: [{ type: 'text', text }] } })
const nestedRouteArgs = { questions: [{ id: 'q1', options: [{ label: '直接执行' }, { label: '进行pro规划' }, { label: '不同意' }] }] }
const nestedApprovalArgs = { questions: [{ id: 'q1', options: [{ label: '同意执行' }, { label: '转交pro规划' }, { label: '不同意' }] }] }
const nestedClarifyArgs = { questions: [{ id: 'q1', options: [{ label: '方案A' }, { label: '方案B' }] }] }

let pass = 0
let fail = 0
function check(name, got, expected) {
  const okResult = JSON.stringify(got) === JSON.stringify(expected)
  if (okResult) { pass += 1 } else { fail += 1 }
  console.log(`${okResult ? 'PASS' : 'FAIL'}  ${name}  (期望 ${JSON.stringify(expected)}, 实际 ${JSON.stringify(got)})`)
}

// ── K 系列:ask 分类与参数解析 ───────────────────────────────────────────
const K = [
  ['K1 路由 ask(含直行+规划词) → route', { name: 'ask_user_question', callId: 'k1', arguments: routeArgs }, 'route'],
  ['K2 批准 ask(含同意执行) → approve', { name: 'ask_user_question', callId: 'k2', arguments: approvalArgs }, 'approve'],
  ['K3 澄清 ask(自由选项) → clarify', { name: 'ask_user_question', callId: 'k3', arguments: clarifyArgs }, 'clarify'],
  ['K4 参数无法解析 → null(跳过)', { name: 'ask_user_question', callId: 'k4', arguments: 'not-json' }, null],
  ['K5 无 questions 字段 → null', { name: 'ask_user_question', callId: 'k5', arguments: '{}' }, null],
]
for (const [name, data, expected] of K) {
  const labels = labelsOfCallData(data)
  check(name, labels === null ? null : askKindOf(labels), expected)
}

// ── LQ 系列:labelsOfCallData 只收首问（第二问选项不进入验词集合） ─────────
const lqTwoQArgsJson = JSON.stringify({ questions: [{ id: 'q1', options: [{ label: '同意执行' }, { label: '转交pro规划' }, { label: '不同意' }] }, { id: 'q2', question: '修改意见', options: [{ label: '无' }, { label: '有意见（填写）' }] }] })
const lqTwoQArgsObj = { questions: [{ id: 'q1', options: [{ label: '同意执行' }, { label: '转交pro规划' }, { label: '不同意' }] }, { id: 'q2', question: '修改意见', options: [{ label: '无' }] }] }
const lqSecondOnlyArgs = JSON.stringify({ questions: [{ id: 'q1', question: '同意执行？' }, { id: 'q2', question: '修改意见', options: [{ label: '无' }] }] })
const lqOneQArgs = JSON.stringify({ questions: [{ id: 'q1', options: [{ label: '同意执行' }, { label: '转交pro规划' }, { label: '不同意' }] }] })
const LQ = [
  ['LQ1 两问带选项（JSON 字符串 arguments）→ 只收首问三词', { name: 'ask_user_question', callId: 'lq1', arguments: lqTwoQArgsJson }, ['同意执行', '转交pro规划', '不同意']],
  ['LQ2 两问带选项（对象形态 arguments）→ 只收首问三词', { name: 'ask_user_question', callId: 'lq2', arguments: lqTwoQArgsObj }, ['同意执行', '转交pro规划', '不同意']],
  ['LQ3 首问无 options、第二问有 options → 空（不兜底收集）', { name: 'ask_user_question', callId: 'lq3', arguments: lqSecondOnlyArgs }, []],
  ['LQ4 单问批准三词 → 三词（现状保持）', { name: 'ask_user_question', callId: 'lq4', arguments: lqOneQArgs }, ['同意执行', '转交pro规划', '不同意']],
  ['LQ5 questions 为空数组 → 空', { name: 'ask_user_question', callId: 'lq5', arguments: '{"questions":[]}' }, []],
]
for (const [name, data, expected] of LQ) {
  check(name, labelsOfCallData(data), expected)
}

// ── M 系列:验词映射 ────────────────────────────────────────────────────
const M = [
  ['M1 路由词「直接执行」→ direct', matchRouteLabel(['直接执行']), 'direct'],
  ['M2 路由词「进行pro规划」→ plan', matchRouteLabel(['进行pro规划']), 'plan'],
  ['M3 路由词「不同意」→ disagree', matchRouteLabel(['不同意']), 'disagree'],
  ['M4 路由词无匹配 → null', matchRouteLabel([]), null],
  ['M5 路由词带后缀「直接执行（推荐）」→ direct', matchRouteLabel(['直接执行（推荐）']), 'direct'],
  ['M6 批准词「同意执行」→ approve', matchApprovalLabel(['同意执行']), 'approve'],
  ['M7 批准词「转交pro规划」→ replan', matchApprovalLabel(['转交pro规划']), 'replan'],
  ['M8 批准词「不同意」→ disagree', matchApprovalLabel(['不同意']), 'disagree'],
  ['M9 批准词无匹配 → null', matchApprovalLabel(['别的词']), null],
]
for (const [name, got, expected] of M) check(name, got, expected)

// ── F 系列:deriveFlowState(自最近人类消息起) ──────────────────────────
const F = [
  ['F1 无事件 → 全空', [], { route: 'none', clarified: false, approved: false, channelBroken: false }],
  ['F2 路由答「直接执行」→ direct', [um(), call('ask_user_question', 'a1', routeArgs), ok('a1', answer(['直接执行']))], { route: 'direct', clarified: false, approved: false, channelBroken: false }],
  ['F3 路由答规划 + 澄清自定义答复 → plan+clarified', [um(), call('ask_user_question', 'a1', routeArgs), ok('a1', answer(['进行pro规划'])), call('ask_user_question', 'a2', clarifyArgs), ok('a2', customAnswer)], { route: 'plan', clarified: true, approved: false, channelBroken: false }],
  ['F4 路由空白回复 → 保持 none', [um(), call('ask_user_question', 'a1', routeArgs), ok('a1', emptyAnswer)], { route: 'none', clarified: false, approved: false, channelBroken: false }],
  ['F5 路由答「不同意」→ none', [um(), call('ask_user_question', 'a1', routeArgs), ok('a1', answer(['不同意']))], { route: 'none', clarified: false, approved: false, channelBroken: false }],
  ['F6 全链路:规划+澄清+同意执行 → approved', [um(), call('ask_user_question', 'a1', routeArgs), ok('a1', answer(['进行pro规划'])), call('ask_user_question', 'a2', clarifyArgs), ok('a2', answer(['方案A'])), call('ask_user_question', 'a3', approvalArgs), ok('a3', answer(['同意执行']))], { route: 'plan', clarified: true, approved: true, channelBroken: false }],
  ['F7 批准答「转交pro规划」→ approved=false', [um(), call('ask_user_question', 'a1', routeArgs), ok('a1', answer(['进行pro规划'])), call('ask_user_question', 'a2', clarifyArgs), ok('a2', answer(['方案A'])), call('ask_user_question', 'a3', approvalArgs), ok('a3', answer(['转交pro规划']))], { route: 'plan', clarified: true, approved: false, channelBroken: false }],
  ['F8 批准答「不同意」→ approved=false', [um(), call('ask_user_question', 'a1', routeArgs), ok('a1', answer(['进行pro规划'])), call('ask_user_question', 'a2', clarifyArgs), ok('a2', answer(['方案A'])), call('ask_user_question', 'a3', approvalArgs), ok('a3', answer(['不同意']))], { route: 'plan', clarified: true, approved: false, channelBroken: false }],
  ['F9 路由被用户取消(ASK_CANCELLED) → none', [um(), call('ask_user_question', 'a1', routeArgs), err('a1', 'ASK_CANCELLED')], { route: 'none', clarified: false, approved: false, channelBroken: false }],
  ['F10 通道错误(NO_PROVIDER) → channelBroken', [um(), call('ask_user_question', 'a1', routeArgs), err('a1', 'NO_PROVIDER')], { route: 'none', clarified: false, approved: false, channelBroken: true }],
  ['F11 新人类消息 → 重置', [um(), call('ask_user_question', 'a1', routeArgs), ok('a1', answer(['直接执行'])), um()], { route: 'none', clarified: false, approved: false, channelBroken: false }],
  ['F12 澄清空白回复 → 未澄清', [um(), call('ask_user_question', 'a1', routeArgs), ok('a1', answer(['进行pro规划'])), call('ask_user_question', 'a2', clarifyArgs), ok('a2', emptyAnswer)], { route: 'plan', clarified: false, approved: false, channelBroken: false }],
  ['F13 两次路由答:先直行后规划 → 后答生效', [um(), call('ask_user_question', 'a1', routeArgs), ok('a1', answer(['直接执行'])), call('ask_user_question', 'a2', routeArgs), ok('a2', answer(['进行pro规划']))], { route: 'plan', clarified: false, approved: false, channelBroken: false }],
  ['F14 澄清自定义答复(无 selected) → 已澄清', [um(), call('ask_user_question', 'a1', routeArgs), ok('a1', answer(['进行pro规划'])), call('ask_user_question', 'a2', clarifyArgs), ok('a2', customAnswer)], { route: 'plan', clarified: true, approved: false, channelBroken: false }],
  ['F15 无关工具结果不影响状态', [um(), call('ask_user_question', 'a1', routeArgs), ok('a1', answer(['直接执行'])), call('read', 'r1'), ok('r1', '这里写着 "answers" 字样')], { route: 'direct', clarified: false, approved: false, channelBroken: false }],
  ['F16 路由先确认后空白回复 → 重置 none', [um(), call('ask_user_question', 'a1', routeArgs), ok('a1', answer(['直接执行'])), call('ask_user_question', 'a2', routeArgs), ok('a2', emptyAnswer)], { route: 'none', clarified: false, approved: false, channelBroken: false }],
  ['F17 路由先确认后取消 → 重置 none', [um(), call('ask_user_question', 'a1', routeArgs), ok('a1', answer(['直接执行'])), call('ask_user_question', 'a2', routeArgs), err('a2', 'ASK_CANCELLED')], { route: 'none', clarified: false, approved: false, channelBroken: false }],
  ['F18 批准先确认后空白回复 → 重置 false', [um(), call('ask_user_question', 'a1', routeArgs), ok('a1', answer(['进行pro规划'])), call('ask_user_question', 'a2', clarifyArgs), ok('a2', answer(['方案A'])), call('ask_user_question', 'a3', approvalArgs), ok('a3', answer(['同意执行'])), call('ask_user_question', 'a4', approvalArgs), ok('a4', emptyAnswer)], { route: 'plan', clarified: true, approved: false, channelBroken: false }],
  ['F19 批准先确认后取消 → 重置 false', [um(), call('ask_user_question', 'a1', routeArgs), ok('a1', answer(['进行pro规划'])), call('ask_user_question', 'a2', clarifyArgs), ok('a2', answer(['方案A'])), call('ask_user_question', 'a3', approvalArgs), ok('a3', answer(['同意执行'])), call('ask_user_question', 'a4', approvalArgs), err('a4', 'ASK_CANCELLED')], { route: 'none', clarified: true, approved: false, channelBroken: false }],
  ['F20 通道错误逃生回归：不重置已确认状态', [um(), call('ask_user_question', 'a1', routeArgs), ok('a1', answer(['直接执行'])), call('ask_user_question', 'a2', routeArgs), err('a2', 'NO_PROVIDER')], { route: 'direct', clarified: false, approved: false, channelBroken: true }],
]
for (const [name, events, expected] of F) {
  check(name, deriveFlowState(events), expected)
}

// ── GK 系列:三分法 gate ask 分类（categorizeGateAsk） ────────────────────
const wordRouteArgs = JSON.stringify({ questions: [{ id: 'q1', options: [{ label: '直接执行' }] }] })
const wordApproveArgs = JSON.stringify({ questions: [{ id: 'q1', options: [{ label: '同意执行' }] }] })
const twoWordRouteArgs = JSON.stringify({ questions: [{ id: 'q1', options: [{ label: '直接执行' }, { label: '进行pro规划' }] }] })
const GK = [
  ['GK1 标准三词路由 ask → standard', categorizeGateAsk(['直接执行', '进行pro规划', '不同意']), 'standard'],
  ['GK2 标准三词批准 ask → standard', categorizeGateAsk(['同意执行', '转交pro规划', '不同意']), 'standard'],
  ['GK3 单词路由 ask（只有「直接执行」）→ malformed', categorizeGateAsk(['直接执行']), 'malformed'],
  ['GK4 两词路由 ask（缺「不同意」）→ malformed', categorizeGateAsk(['直接执行', '进行pro规划']), 'malformed'],
  ['GK5 纯澄清 ask → ordinary', categorizeGateAsk(['方案A', '方案B']), 'ordinary'],
  ['GK6 带 (Recommended) 后缀的路由 ask → standard', categorizeGateAsk(['直接执行 (Recommended)', '进行pro规划 (Recommended)', '不同意 (Recommended)']), 'standard'],
  ['GK7 带（推荐）后缀的批准 ask → standard', categorizeGateAsk(['同意执行（推荐）', '转交pro规划（推荐）', '不同意（推荐）']), 'standard'],
  ['GK8 带 (recommended) 小写后缀 → standard', categorizeGateAsk(['直接执行 (recommended)', '进行pro规划 (recommended)', '不同意 (recommended)']), 'standard'],
  ['GK8b 无空格半角（推荐）后缀 → standard', categorizeGateAsk(['直接执行(推荐)', '进行pro规划(推荐)', '不同意(推荐)']), 'standard'],
  ['GK9 非白名单变体（! 等额外字符）→ malformed', categorizeGateAsk(['直接执行!', '进行pro规划', '不同意']), 'malformed'],
  ['GK10 方括号后缀 [推荐] → malformed', categorizeGateAsk(['直接执行 [推荐]', '进行pro规划 [推荐]', '不同意 [推荐]']), 'malformed'],
]
for (const [name, got, expected] of GK) check(name, got, expected)

// ── GM 系列:gate ask deny 文案（gateAskDenyReason） ──────────────────────
const GM = [
  ['GM1 单词路由 deny 文案含标准模板', gateAskDenyReason(['直接执行']).includes('路由 ask 选项固定为') && gateAskDenyReason(['直接执行']).includes('批准 ask 选项固定为'), true],
  ['GM2 单词路由 deny 文案含具体缺项', gateAskDenyReason(['直接执行']).includes('进行pro规划') && gateAskDenyReason(['直接执行']).includes('不同意'), true],
  ['GM3 非白名单变体 deny 不含「缺少：」且含推荐标记范围提示', !gateAskDenyReason(['直接执行!', '进行pro规划', '不同意']).includes('缺少：') && gateAskDenyReason(['直接执行!', '进行pro规划', '不同意']).includes('推荐标记仅限'), true],
]
for (const [name, got, expected] of GM) check(name, got, expected)

// ── F 系列补充:单词副作用修复（deriveFlowState + askKindOfRelaxed） ──────
const F21 = [
  ['F21 单词路由 ask 答「直接执行」→ route=direct', [um(), call('ask_user_question', 'a1', wordRouteArgs), ok('a1', answer(['直接执行']))], { route: 'direct', clarified: false, approved: false, channelBroken: false }],
  ['F22 单词批准 ask 答「同意执行」→ approved=true', [um(), call('ask_user_question', 'a1', routeArgs), ok('a1', answer(['进行pro规划'])), call('ask_user_question', 'a2', clarifyArgs), ok('a2', answer(['方案A'])), call('ask_user_question', 'a3', wordApproveArgs), ok('a3', answer(['同意执行']))], { route: 'plan', clarified: true, approved: true, channelBroken: false }],
]
for (const [name, events, expected] of F21) {
  check(name, deriveFlowState(events), expected)
}

// ── GL 系列:结构校验纯函数（validateGateAskStructure） ────────────────────
const glApproveQ1 = [{ id: 'q1', question: '请选择', options: [{ label: '同意执行' }, { label: '转交pro规划' }, { label: '不同意' }] }]
const GL = [
  ['GL1 路由 ask 恰好 1 个问题 → 通过', validateGateAskStructure('route', [{ id: 'q1', question: '请选择', options: [{ label: '直接执行' }, { label: '进行pro规划' }, { label: '不同意' }] }]), null],
  ['GL2 批准 ask 仅 1 个问题缺修改意见 → 不通过，含"修改意见"', validateGateAskStructure('approve', [{ id: 'q1', question: '请选择', options: [{ label: '同意执行' }, { label: '转交pro规划' }, { label: '不同意' }] }]) !== null && validateGateAskStructure('approve', [{ id: 'q1', question: '请选择', options: [{ label: '同意执行' }, { label: '转交pro规划' }, { label: '不同意' }] }]).includes('修改意见'), true],
  ['GL3 批准第二问带非空 options → 拒（含修改意见/纯文本/不得提供选项）', (() => { const r = validateGateAskStructure('approve', [...glApproveQ1, { id: 'q2', question: '修改意见', options: [{ label: '无' }] }]); return r !== null && r.includes('修改意见') && r.includes('纯文本') && r.includes('不得提供选项') })(), true],
  ['GL4 批准第二问 options:[] → 通过（空数组=纯文本框）', validateGateAskStructure('approve', [...glApproveQ1, { id: 'q2', question: '修改意见', options: [] }]), null],
  ['GL5 批准第二问无 options 字段 → 通过', validateGateAskStructure('approve', [...glApproveQ1, { id: 'q2', question: '修改意见' }]), null],
  ['GL6 批准第三问带 options → 拒（第二问起全部校验）', (() => { const r = validateGateAskStructure('approve', [...glApproveQ1, { id: 'q2', question: '修改意见' }, { id: 'q3', question: '补充', options: [{ label: 'x' }] }]); return r !== null && r.includes('纯文本') })(), true],
  ['GL7 路由 2 问 → 仍拒含「须恰好 1 个问题」（route 分支零改动回归）', (() => { const r = validateGateAskStructure('route', [...glApproveQ1, { id: 'q2', question: '补充' }]); return r !== null && r.includes('须恰好 1 个问题') })(), true],
]
for (const [name, got, expected] of GL) check(name, got, expected)

// ── P 系列:plannerChildIdsOf ───────────────────────────────────────────
const planCall = (cid) => call('subagent_plan', cid)
const P = [
  ['P1 plan 结果含 uuid 形态 id → 提取', [um(), planCall('p1'), ok('p1', '已启动规划子代理 3a7c1e5b-9d2f-4e8a-b6c4-1f0e9d8c7b6a，可 send_message 继续')], ['3a7c1e5b-9d2f-4e8a-b6c4-1f0e9d8c7b6a']],
  ['P2 plan 结果无 id → 空', [um(), planCall('p1'), ok('p1', '规划子代理已启动')], []],
  ['P3 plan 结果错误 → 空', [um(), planCall('p1'), err('p1', 'GATED')], []],
  ['P4 uuid 形态 → 提取', [um(), planCall('p1'), ok('p1', 'child 6b9d2f8a-1c3e-4f5a-9b7d-0e2c8a4f6d10 已启动')], ['6b9d2f8a-1c3e-4f5a-9b7d-0e2c8a4f6d10']],
  ['P5 非 plan 调用的结果忽略', [um(), call('subagent', 'x1'), ok('x1', 'session-ffffffff')], []],
]
for (const [name, events, expected] of P) {
  check(name, plannerChildIdsOf(events), expected)
}

// ── C 系列:toolCallCount(探查硬上限) ───────────────────────────────────
const C = [
  ['C1 计数所有工具调用', [call('read', 'c1'), call('glob', 'c2'), call('pwsh', 'c3'), call('save_plan', 'c4')], new Set([]), 4],
  ['C2 跳过 save_plan', [call('read', 'c1'), call('glob', 'c2'), call('save_plan', 'c4')], new Set(['save_plan']), 2],
  ['C3 无事件 → 0', [], new Set([]), 0],
]
for (const [name, events, skip, expected] of C) {
  check(name, toolCallCount(events, skip), expected)
}

// ── CU 系列:toolCallsSinceUser(主会话转达锚点计数,v0.1.4) ─────────────
const umk = (kind) => ({ type: 'user/message', data: { source: { kind } } })
const CU = [
  ['CU1 无用户消息 → 与全量计数同口径', [call('read', 'c1'), call('glob', 'c2')], new Set([]), 2],
  ['CU2 kind=user 锚点(初始任务) → 只计其后', [call('read', 'a1'), umk('user'), call('glob', 'b1'), call('pwsh', 'b2')], new Set([]), 2],
  ['CU3 kind=agent-message 锚点(续轮转达) → 重置只计其后', [umk('user'), call('read', 'a1'), umk('agent-message'), call('glob', 'b1')], new Set([]), 1],
  ['CU4 kind=plugin(运行时快照) → 不构成锚点', [umk('user'), call('read', 'a1'), umk('plugin'), call('glob', 'b1')], new Set([]), 2],
  ['CU5 多个 agent-message → 最后一个为锚', [umk('user'), call('read', 'a1'), umk('agent-message'), call('glob', 'b1'), umk('agent-message'), call('pwsh', 'c1')], new Set([]), 1],
  ['CU6 锚点后 save_plan 跳过仍生效', [umk('user'), call('read', 'a1'), call('save_plan', 's1'), call('glob', 'b1')], new Set(['save_plan']), 2],
  ['CU7 锚点后无调用 → 0(授权即重置)', [umk('user'), call('read', 'a1'), umk('agent-message')], new Set([]), 0],
  ['CU8 kind=agent-instructions(系统指令) → 不构成锚点', [umk('user'), call('read', 'a1'), umk('agent-instructions'), call('glob', 'b1')], new Set([]), 2],
]
for (const [name, events, skip, expected] of CU) {
  check(name, toolCallsSinceUser(events, skip), expected)
}

// ── AP 系列:withPlannerPromptSuffix(规划任务附加指令拼接,v0.1.5) ───────
const msgOf = (kind, text) => ({ source: { kind }, content: [{ type: 'text', text }] })
const AP = [
  ['AP1 空后缀 → 原样', msgOf('user', '任务A'), '', '任务A'],
  ['AP2 kind=user 单文本 → 拼接', msgOf('user', '任务A'), '后缀X', '任务A\n\n后缀X'],
  ['AP3 kind=agent-message(续轮转达) → 拼接', msgOf('agent-message', '意见'), '后缀X', '意见\n\n后缀X'],
  ['AP4 kind=plugin(运行时快照) → 不拼', msgOf('plugin', '快照'), '后缀X', '快照'],
  ['AP5 多块内容 → 原样', { source: { kind: 'user' }, content: [{ type: 'text', text: 'a' }, { type: 'text', text: 'b' }] }, '后缀X', 'a'],
  ['AP6 已含后缀 → 不重复拼', msgOf('user', '任务A\n\n后缀X'), '后缀X', '任务A\n\n后缀X'],
  ['AP7 缺 source → 原样', { content: [{ type: 'text', text: '任务A' }] }, '后缀X', '任务A'],
  ['AP8 kind=agent-message 已含后缀 → 不重复拼', msgOf('agent-message', '意见\n\n后缀X'), '后缀X', '意见\n\n后缀X'],
  ['AP9 kind=agent-message 多块 → 原样', { source: { kind: 'agent-message' }, content: [{ type: 'text', text: 'a' }, { type: 'text', text: 'b' }] }, '后缀X', 'a'],
  ['AP10 kind=agent-instructions → 不拼', msgOf('agent-instructions', '指令'), '后缀X', '指令'],
]
for (const [name, message, suffix, expected] of AP) {
  const got = withPlannerPromptSuffix(message, suffix)
  const text = got !== undefined && got.content !== undefined && got.content[0] !== undefined ? got.content[0].text : undefined
  check(name, text, expected)
}

// ── BN 系列:withBudgetNotice / budgetNoticeText（预算告知拼接,v0.1.6） ──
const NOTICE18 = budgetNoticeText(18)
const NOTICE12 = budgetNoticeText(12)
const BN = [
  ['BN1 user 单文本 → 拼接告知', withBudgetNotice(msgOf('user', '任务A'), NOTICE18), '任务A\n\n' + NOTICE18],
  ['BN2 agent-message 单文本 → 拼接告知', withBudgetNotice(msgOf('agent-message', '意见'), NOTICE18), '意见\n\n' + NOTICE18],
  ['BN3 kind=plugin → 原样', withBudgetNotice(msgOf('plugin', '快照'), NOTICE18), '快照'],
  ['BN4 多块内容 → 原样', withBudgetNotice({ source: { kind: 'user' }, content: [{ type: 'text', text: 'a' }, { type: 'text', text: 'b' }] }, NOTICE18), 'a'],
  ['BN5 已含告知 → 不重复拼', withBudgetNotice(msgOf('user', '任务A\n\n' + NOTICE18), NOTICE18), '任务A\n\n' + NOTICE18],
  ['BN6 缺 source → 原样', withBudgetNotice({ content: [{ type: 'text', text: '任务A' }] }, NOTICE18), '任务A'],
]
for (const [name, got, expected] of BN) {
  const text = got !== undefined && got.content !== undefined && got.content[0] !== undefined ? got.content[0].text : undefined
  check(name, text, expected)
}
check('BN7 budgetNoticeText(18) 全文等值', NOTICE18, '本轮探查预算上限为 18 次工具调用。预算耗尽时输出「申请继续探查：<待查项> — <原因>」，主会话将探查待查项并转达线索文件路径，你读取线索继续工作。探查完成后直接调用 save_plan 落盘（系统会自动检测未探查项）')
check('BN8 budgetNoticeText(12) 全文等值', NOTICE12, '本轮探查预算上限为 12 次工具调用。预算耗尽时输出「申请继续探查：<待查项> — <原因>」，主会话将探查待查项并转达线索文件路径，你读取线索继续工作。探查完成后直接调用 save_plan 落盘（系统会自动检测未探查项）')

// ── BR 系列:budgetReminderText / budgetReminderMessage / budgetReminderSent ──
const REMIND3 = budgetReminderText(3, 18, BUDGET_REMINDER_THRESHOLD)
const MARKER = '本轮探查预算还剩 '
const remEvent = (text) => ({ type: 'user/message', data: { source: { kind: 'plugin' }, content: [{ type: 'text', text }] } })
const BR = [
  ['BR1 remaining=3 → 提示', budgetReminderText(3, 18, 3), '本轮探查预算还剩 3 次'],
  ['BR2 remaining=2 → 提示', budgetReminderText(2, 18, 3), '本轮探查预算还剩 2 次'],
  ['BR3 remaining=1 → 提示', budgetReminderText(1, 18, 3), '本轮探查预算还剩 1 次'],
  ['BR4 remaining=4 → 空串', budgetReminderText(4, 18, 3), ''],
  ['BR5 remaining=0 → 空串', budgetReminderText(0, 18, 3), ''],
  ['BR6 remaining=15 → 空串', budgetReminderText(15, 18, 3), ''],
  ['BR7 budgetReminderMessage 形状', JSON.stringify(budgetReminderMessage(REMIND3)), JSON.stringify({ source: { kind: 'plugin', plugin: 'dsh-extra-plan' }, content: [{ type: 'text', text: REMIND3 }] })],
  ['BR8 无事件 → false', budgetReminderSent([], MARKER), false],
  ['BR9 锚点后含 marker → true', budgetReminderSent([umk('user'), remEvent('本轮探查预算还剩 3 次，请收紧探查、规划收尾，未查项记入待确认假设清单')], MARKER), true],
  ['BR10 marker 在锚点前 → false(新一轮重置)', budgetReminderSent([remEvent('本轮探查预算还剩 3 次，请收紧探查、规划收尾，未查项记入待确认假设清单'), umk('agent-message')], MARKER), false],
  ['BR11 锚点后无 marker → false', budgetReminderSent([umk('user'), umk('plugin')], MARKER), false],
  ['BR12 budget=3 → 空串(不提示)', budgetReminderText(3, 3, 3), ''],
  ['BR13 budget=4 remaining=3 → 提示', budgetReminderText(3, 4, 3), '本轮探查预算还剩 3 次'],
  ['BR14 budget=3 remaining=2 → 空串(全程不提示)', budgetReminderText(2, 3, 3), ''],
]
for (const [name, got, expected] of BR) check(name, got, expected)

// ── DR 系列:deny 提示模板与闸门词表同源（v0.1.9） ─────────────────────
const DR = [
  ['DR1 routeDenyReason 含三个路由词', routeDenyReason('write/edit').includes(ROUTE_WORD_DIRECT) && routeDenyReason('write/edit').includes(ROUTE_WORD_PLAN) && routeDenyReason('write/edit').includes(ROUTE_WORD_DISAGREE), true],
  ['DR2 planDenyReason 含三个路由词', planDenyReason('subagent_plan').includes(ROUTE_WORD_DIRECT) && planDenyReason('subagent_plan').includes(ROUTE_WORD_PLAN) && planDenyReason('subagent_plan').includes(ROUTE_WORD_DISAGREE), true],
  ['DR3 approvalDenyReason 含三个批准词', approvalDenyReason('subagent').includes(APPROVAL_WORD_APPROVE) && approvalDenyReason('subagent').includes(APPROVAL_WORD_REPLAN) && approvalDenyReason('subagent').includes(ROUTE_WORD_DISAGREE), true],
  ['DR4 approvalDenyReason 不误用路由词集合', !approvalDenyReason('subagent').includes(ROUTE_WORD_DIRECT), true],
]
for (const [name, got, expected] of DR) check(name, got, expected)

// ── BD 系列:budgetExhaustedReason（deny 文案,v0.1.6） ───────────────────
const BD = [
  ['BD1 (18,18) 全文等值', budgetExhaustedReason(18, 18), '探查预算已耗尽（本轮已用 18/18）：输出「申请继续探查：<待查项> — <原因>」。主会话将探查待查项并转达线索文件路径，你读取线索继续工作。探查完成则直接调用 save_plan 落盘。'],
  ['BD2 (12,12) 含 12/12', budgetExhaustedReason(12, 12).includes('本轮已用 12/12'), true],
  ['BD3 (17,18) 含 17/18', budgetExhaustedReason(17, 18).includes('本轮已用 17/18'), true],
]
for (const [name, got, expected] of BD) check(name, got, expected)

// ── BE 系列:budgetExceeded（判定比较,v0.1.6） ───────────────────────────
const BE = [
  ['BE1 (18,18) false(第18次放行)', budgetExceeded(18, 18), false],
  ['BE2 (19,18) true(第19次拒绝)', budgetExceeded(19, 18), true],
  ['BE3 (17,18) false', budgetExceeded(17, 18), false],
  ['BE4 (3,3) false(budget=3 第3次放行)', budgetExceeded(3, 3), false],
  ['BE5 (4,3) true(budget=3 第4次拒绝)', budgetExceeded(4, 3), true],
]
for (const [name, got, expected] of BE) check(name, got, expected)

// ── S 系列:sanitizeTaskName ────────────────────────────────────────────
const S = [
  ['S1 路径穿越被净化', sanitizeTaskName('../x'), 'x'],
  ['S2 空格冒号折为连字符', sanitizeTaskName('A B:测试'), 'A-B-测试'],
  ['S3 超长截断 32', sanitizeTaskName('a'.repeat(PROBE_LIMITS.maxTaskNameLen + 8)), 'a'.repeat(PROBE_LIMITS.maxTaskNameLen)],
  ['S4 非法字符全连字符 → 空', sanitizeTaskName('///'), ''],
  ['S5 非字符串 → 空', sanitizeTaskName(undefined), ''],
  ['S6 空串 → 空', sanitizeTaskName(''), ''],
]
for (const [name, got, expected] of S) check(name, got, expected)

// ── T 系列:timestamp 格式 ──────────────────────────────────────────────
check('T1 时间戳格式 yyyyMMddHHmmss', /^\d{14}$/.test(timestamp()), true)

// ── PW 系列:pwsh 写命令闸门(对象/字符串双形状) ────────────────────────
const PW = [
  ['PW1 对象参数 Set-Content → 拒', { arguments: { command: 'Set-Content -Path foo -Value x' } }, true],
  ['PW2 对象参数只读命令 → 放', { arguments: { command: 'Get-ChildItem | Select-Object Name' } }, false],
  ['PW3 字符串 JSON Set-Content → 拒', { arguments: JSON.stringify({ command: 'Set-Content -Path foo -Value x' }) }, true],
  ['PW4 字符串 JSON 只读 → 放', { arguments: JSON.stringify({ command: 'Test-Path C:\\tmp' }) }, false],
  ['PW5 缺 command → 放(防御)', { arguments: {} }, false],
  ['PW6 只读命令含 README.md 文件名 → 放(v0.1.1 回归)', { arguments: { command: "Get-Content -LiteralPath 'README.md' -Raw; Get-FileHash 'CHANGELOG.md'" } }, false],
  ['PW7 真写命令 mkdir → 仍拒', { arguments: { command: 'mkdir newdir' } }, true],
]
for (const [name, exec, expected] of PW) check(name, pwshMutationMatches(exec), expected)

// ── B 系列:isBootstrapPhase ────────────────────────────────────────────
const agentWithEvents = (events) => ({ session: { header: {}, snapshotEvents: () => events } })
check('B1 无 tool/call → 引导期', isBootstrapPhase(agentWithEvents([])), true)
check('B2 有 tool/call → 已晋升', isBootstrapPhase(agentWithEvents([call('read', 'b1')])), false)

// ── D 系列:子代理判定成分 ──────────────────────────────────────────────
const childAgent = (parentSession, origin = 'subagent') => ({ session: { header: { origin, delegationDepth: 1, parentSession }, snapshotEvents: () => [] } })
const plannerAgent = () => ({ session: { header: {}, snapshotEvents: () => [] } })
const registry = (liveIds) => ({ get: (id) => (liveIds.has(id) ? {} : undefined) })
const D = [
  ['D1 规划者(无标记) → 非执行者', plannerAgent(), registry(new Set(['p1'])), false],
  ['D2 子代理+父存活 → 执行者', childAgent('p1'), registry(new Set(['p1'])), true],
  ['D3 子代理+父不在 → 恢复为根', childAgent('p1'), registry(new Set([])), false],
  ['D4 缺 parentSession → 偏安全豁免', { session: { header: { origin: 'subagent', delegationDepth: 1 }, snapshotEvents: () => [] } }, registry(new Set([])), true],
]
for (const [name, agent, agents, expected] of D) {
  check(name, isSubagentChild(agent) && isLiveDelegation(agent, agents), expected)
}

// ── 沙箱下限 ───────────────────────────────────────────────────────────
const sp = (override, defaultMode) => ({ overrideOf: () => override, defaultMode })
check('FLOOR1 会话级 read-only → 抬升', childPolicyNeedsFloor({}, sp('read-only', 'workspace-write')), true)
check('FLOOR2 部署默认 read-only → 抬升', childPolicyNeedsFloor({}, sp(undefined, 'read-only')), true)
check('FLOOR3 workspace-write → 不动', childPolicyNeedsFloor({}, sp(undefined, 'workspace-write')), false)

// ── RENDER 系列:save_plan 渲染契约（v0.1.3 回归：必须返回 ContentBlock[]）──
const rendered = renderSavePlan({ paths: ['a.md', 'b.md'] })
check('RENDER1 render 返回数组', Array.isArray(rendered), true)
check('RENDER2 单文本块且类型正确', rendered.length === 1 && rendered[0].type === 'text' && typeof rendered[0].text === 'string', true)
check('RENDER3 文本含两个路径', rendered[0].text.includes('a.md') && rendered[0].text.includes('b.md'), true)

// ── PR 系列:validateProbe 机械校验（save_probe，v3） ──────────────────────
const EXISTING = 'readme.md'
const validProbe = () => ({
  fileMap: [{ path: EXISTING, relation: '主文档' }],
  focusAreas: [{ path: EXISTING, note: '重点' }],
  exclusions: [{ scope: 'node_modules', note: '无关' }],
  background: [{ topic: '背景', detail: '细节' }],
})
const fileMapN = (count) => Array.from({ length: count }, (_, i) => ({ path: EXISTING, relation: `关系${i}` }))
const focusAreasN = (count) => Array.from({ length: count }, (_, i) => ({ path: EXISTING, note: `重点${i}` }))
const exclusionsN = (count) => Array.from({ length: count }, (_, i) => ({ note: `排除${i}` }))
const backgroundN = (count) => Array.from({ length: count }, (_, i) => ({ topic: `主题${i}`, detail: `细节${i}` }))
// 构造四字段 JSON 总量恰为 target 的合法 probe：先填 background.detail（≤${PROBE_LIMITS.maxDetailLen}），
// 再逐条补 focusAreas.note（每条 ≤${PROBE_LIMITS.maxNoteLen}、至多 ${PROBE_LIMITS.maxEntries.focusAreas} 条）——只触发总量校验、不触发单条上限。
function probeWithTotal(target) {
  const p = { fileMap: [{ path: EXISTING, relation: '' }], focusAreas: [], exclusions: [], background: [{ topic: 't', detail: '' }] }
  while (JSON.stringify(p).length < target) {
    const d = p.background[0].detail
    if (d.length < PROBE_LIMITS.maxDetailLen) { p.background[0].detail += 'x'; continue }
    if (p.focusAreas.length === 0 || p.focusAreas[p.focusAreas.length - 1].note.length >= PROBE_LIMITS.maxNoteLen) {
      if (p.focusAreas.length >= PROBE_LIMITS.maxEntries.focusAreas) break
      p.focusAreas.push({ path: EXISTING, note: '' })
    }
    p.focusAreas[p.focusAreas.length - 1].note += 'x'
  }
  return p
}
const PR = [
  ['PR1 缺 fileMap → 拒', { ...validProbe(), fileMap: undefined }, 'reject'],
  ['PR2 缺 focusAreas → 拒', { ...validProbe(), focusAreas: undefined }, 'reject'],
  ['PR3 缺 exclusions → 拒', { ...validProbe(), exclusions: undefined }, 'reject'],
  ['PR4 缺 background → 拒', { ...validProbe(), background: undefined }, 'reject'],
  ['PR5 fileMap 非数组 → 拒', { ...validProbe(), fileMap: 'not-array' }, 'reject'],
  ['PR6 background 非数组 → 拒', { ...validProbe(), background: {} }, 'reject'],
  ['PR7 fileMap 51 条 → 拒', { ...validProbe(), fileMap: fileMapN(PROBE_LIMITS.maxEntries.fileMap + 1) }, 'reject'],
  ['PR8 focusAreas 51 条 → 拒', { ...validProbe(), focusAreas: focusAreasN(PROBE_LIMITS.maxEntries.focusAreas + 1) }, 'reject'],
  ['PR9 exclusions 21 条 → 拒', { ...validProbe(), exclusions: exclusionsN(PROBE_LIMITS.maxEntries.exclusions + 1) }, 'reject'],
  ['PR10 background 21 条 → 拒', { ...validProbe(), background: backgroundN(PROBE_LIMITS.maxEntries.background + 1) }, 'reject'],
  ['PR11 path 1025 字符 → 拒', { ...validProbe(), fileMap: [{ path: 'a'.repeat(PROBE_LIMITS.maxPathLen + 1), relation: 'r' }] }, 'reject'],
  ['PR12 note 401 字符 → 拒', { ...validProbe(), focusAreas: [{ path: EXISTING, note: 'n'.repeat(PROBE_LIMITS.maxNoteLen + 1) }] }, 'reject'],
  ['PR13 四字段总量 20001 → 拒', probeWithTotal(PROBE_LIMITS.maxTotalChars + 1), 'reject'],
  ['PR14 四字段总量 20000 → 过', probeWithTotal(PROBE_LIMITS.maxTotalChars), 'pass'],
  ['PR15 path 不存在 → 拒并指明路径', { ...validProbe(), fileMap: [{ path: '不存在-文件-xyz.md', relation: 'r' }] }, 'reject-with', '不存在'],
  ['PR16 path 存在（相对）→ 过', validProbe(), 'pass'],
  ['PR17 path 存在（绝对）→ 过', { ...validProbe(), fileMap: [{ path: HERE + EXISTING, relation: 'r' }] }, 'pass'],
  ['PR18 range L12-x → 拒并指明', { ...validProbe(), focusAreas: [{ path: EXISTING, range: 'L12-x', note: 'n' }] }, 'reject-with', 'range'],
  ['PR19 range 12 → 过', { ...validProbe(), focusAreas: [{ path: EXISTING, range: '12', note: 'n' }] }, 'pass'],
  ['PR20 range L12-34 → 过', { ...validProbe(), focusAreas: [{ path: EXISTING, range: 'L12-34', note: 'n' }] }, 'pass'],
  ['PR21 exclusions scope 概念边界（不校验存在性）→ 过', { ...validProbe(), exclusions: [{ scope: '某概念边界', note: 'n' }] }, 'pass'],
  ['PR22 evidence 非数组 → 拒', { ...validProbe(), evidence: 'not-array' }, 'reject'],
  ['PR23 evidence 81 条 → 拒', { ...validProbe(), evidence: Array.from({ length: PROBE_LIMITS.maxEvidenceEntries + 1 }, (_, i) => ({ path: EXISTING, value: `v${i}` })) }, 'reject'],
  ['PR24 evidence[0] 缺 line/value/text → 拒', { ...validProbe(), evidence: [{ path: EXISTING }] }, 'reject'],
  ['PR25 evidence[0].line 非法（如 L12-x）→ 拒', { ...validProbe(), evidence: [{ path: EXISTING, line: 'L12-x', value: 'v' }] }, 'reject'],
  ['PR26 evidence[0].path 不存在 → 拒并指明', { ...validProbe(), evidence: [{ path: '不存在-证据-xyz.md', value: 'v' }] }, 'reject-with', '不存在'],
  ['PR27 evidence[0].line 含区间（L12-34）→ 拒', { ...validProbe(), evidence: [{ path: EXISTING, line: 'L12-34', value: 'v' }] }, 'reject'],
  ['PR28 evidence 合法（path 存在 + line/value/text 之一）→ 过', { ...validProbe(), evidence: [{ path: EXISTING, line: 'L12', value: 'v', text: 't', note: 'n' }] }, 'pass'],
  ['PR29 evidence 总量超 maxEvidenceTotalChars → 拒', { ...validProbe(), evidence: Array.from({ length: Math.ceil(PROBE_LIMITS.maxEvidenceTotalChars / PROBE_LIMITS.maxEvidenceTextLen) + 1 }, () => ({ path: EXISTING, text: 't'.repeat(PROBE_LIMITS.maxEvidenceTextLen) })) }, 'reject'],
  ['PR30 evidence 未传 → 过（旧调用不变）', validProbe(), 'pass'],
  ['PR31 多违规一次性全报（聚合）', { ...validProbe(), fileMap: [{ path: '不存在-聚合-xyz.md', relation: 'r' }], background: [{ topic: 't', detail: 'x'.repeat(PROBE_LIMITS.maxDetailLen + 1) }] }, 'reject-all', ['不存在', 'background[0].detail', '处违规']],
  ['PR32 evidence.line 区间报错含修正法', { ...validProbe(), evidence: [{ path: EXISTING, line: 'L158-162', value: 'v' }] }, 'reject-all', ['禁止区间', 'evidence.text', '单个行号']],
  ['PR33 focusAreas.range 非法报错含区间说明', { ...validProbe(), focusAreas: [{ path: EXISTING, range: 'L12-x', note: 'n' }] }, 'reject-all', ['range', '仅 focusAreas.range 允许区间']],
]
for (const [name, args, mode, substr] of PR) {
  const got = validateProbe(args, HERE)
  const okResult = mode === 'pass' ? got === null : mode === 'reject' ? typeof got === 'string' && got.length > 0 : mode === 'reject-all' ? typeof got === 'string' && Array.isArray(substr) && substr.every((s) => got.includes(s)) : typeof got === 'string' && got.includes(substr)
  if (okResult) { pass += 1 } else { fail += 1 }
  console.log(`${okResult ? 'PASS' : 'FAIL'}  ${name}  (实际 ${JSON.stringify(got)})`)
}

// ── RENDER4+ 系列:renderSaveProbe / renderProbeMarkdown 契约（v3） ────────
const probeRendered = renderSaveProbe({ path: 'C:/w/.extra-plan/线索-x-20260816090000.md' })
check('RENDER4 renderSaveProbe 返回数组', Array.isArray(probeRendered), true)
check('RENDER5 renderSaveProbe 单文本块', probeRendered.length === 1 && probeRendered[0].type === 'text', true)
check('RENDER6 renderSaveProbe 文本含「探查线索已落盘」与路径原文', typeof probeRendered[0].text === 'string' && probeRendered[0].text.includes('探查线索已落盘') && probeRendered[0].text.includes('C:/w/.extra-plan/线索-x-20260816090000.md'), true)
const probeMd = renderProbeMarkdown(validProbe())
const probeWithRangeMd = renderProbeMarkdown({ ...validProbe(), focusAreas: [{ path: EXISTING, range: 'L12-34', note: '重点' }] })
const probeNoScopeMd = renderProbeMarkdown({ ...validProbe(), exclusions: [{ note: '排除说明' }] })
check('RENDER7 线索 Markdown 标题与卷首声明', probeMd.includes('# 探查线索（save_probe 落盘，非结论）') && probeMd.includes('只有定位线索、没有证据') && probeMd.includes('不得引用本文件的行号/数值/文案作为【已探查核实】证据'), true)
check('RENDER8 线索 Markdown 四节标题', ['## 一、文件地图', '## 二、重点区域', '## 三、排除项', '## 四、背景与意图'].every((s) => probeMd.includes(s)), true)
check('RENDER9 fileMap/focusAreas 渲染（range 有则带括号）', probeMd.includes(`- ${EXISTING}：主文档`) && probeMd.includes(`- ${EXISTING}：重点`) && probeWithRangeMd.includes(`- ${EXISTING}（L12-34）：重点`), true)
check('RENDER10 exclusions/background 渲染', probeNoScopeMd.includes('- （未指明范围）：排除说明') && probeMd.includes('- node_modules：无关') && probeMd.includes('- 背景：细节'), true)

// ── RENDER11+ 系列:renderProbeMarkdown / renderSaveProbe 证据报告契约（v0.2） ──
const probeEvMd = renderProbeMarkdown({ ...validProbe(), evidence: [{ path: EXISTING, line: 'L12', value: 'v', text: 't', note: 'n' }] })
check('RENDER11 证据报告 Markdown 标题与卷首声明', probeEvMd.includes('# 探查证据报告（探查者 save_probe 落盘）') && probeEvMd.includes('探查者已核实的证据报告') && probeEvMd.includes('【探查者已核实】证据引用'), true)
check('RENDER12 证据报告含「## 五、证据」节与条目渲染', probeEvMd.includes('## 五、证据') && probeEvMd.includes(`- ${EXISTING}（L12）：v｜t｜n`), true)
check('RENDER13 无 evidence 时标题仍为线索模板（回退契约）', probeMd.includes('# 探查线索（save_probe 落盘，非结论）') && !probeMd.includes('探查证据报告') && !probeMd.includes('## 五、证据'), true)
check('RENDER14 renderSaveProbe(含 evidence) 文案含「探查证据报告已落盘」', renderSaveProbe({ path: 'C:/w/.extra-plan/证据-x.md' }, true)[0].text.includes('探查证据报告已落盘'), true)
check('RENDER15 renderSaveProbe(无 evidence) 文案仍为「探查线索已落盘」（回退契约）', renderSaveProbe({ path: 'C:/w/.extra-plan/证据-x.md' })[0].text.includes('探查线索已落盘') && renderSaveProbe({ path: 'C:/w/.extra-plan/证据-x.md' }, true)[0].text.includes('C:/w/.extra-plan/证据-x.md'), true)

// ── E 系列:extractProbeEvidenceRefs（save_plan 证据引用提取纯函数） ───────────
const E = [
  ['E1 空串 → []', extractProbeEvidenceRefs(''), []],
  ['E2 无标记 → []', extractProbeEvidenceRefs('普通方案文本，无证据标记'), []],
  ['E3 标准标注 → 提取路径', extractProbeEvidenceRefs('步骤1：【探查者已核实】·证据：.extra-plan/证据-a.md'), ['.extra-plan/证据-a.md']],
  ['E4 行内多标记去重 → 唯一数组', extractProbeEvidenceRefs('【探查者已核实】·证据：证据-a.md 与【探查者已核实】·证据：证据-a.md'), ['证据-a.md']],
  ['E5 无「证据：」前缀的标注 → 不提取', extractProbeEvidenceRefs('【探查者已核实】步骤已完成'), []],
]
for (const [name, got, expected] of E) check(name, got, expected)

// ── RP 系列:resolveProbeRequestInjection（探查者模型跟随顶层主会话） ──
const mainCfg = { provider: 'p-main', model: 'model-main', maxTokens: 8192, reasoningEffort: 'high' }
const plannerCfg = { provider: 'p-pro', model: 'deepseek-v4-pro', maxTokens: 16384 }
const topMain = () => ({ session: { header: { origin: 'main' }, requestHeader: () => ({ config: mainCfg }) } })
const midPlanner = () => ({ session: { header: { origin: 'subagent', delegationDepth: 1, parentSession: 'main-id' }, requestHeader: () => ({ config: plannerCfg }) } })
const probeAgent = (parentSession) => ({ session: { header: { origin: 'subagent', delegationDepth: 2, parentSession }, requestHeader: () => ({ config: plannerCfg }) } })
const registryOf = (map) => ({ get: (id) => map.get(id) })
const RP_FULL_REG = registryOf(new Map([['main-id', topMain()], ['planner-id', midPlanner()]]))
const RP = [
  ['RP1 planner 委派 probe → 注入顶层主会话 provider/model/maxTokens', async () => {
    const out = await resolveProbeRequestInjection(probeAgent('planner-id'), RP_FULL_REG, { provider: 'p-pro', model: 'deepseek-v4-pro', maxTokens: 16384 })
    return { provider: out.provider, model: out.model, maxTokens: out.maxTokens }
  }, { provider: 'p-main', model: 'model-main', maxTokens: 8192 }],
  ['RP2 probe resolved 显式 provider/model → 不被覆盖（maxTokens 仍无条件继承顶层）', async () => {
    const out = await resolveProbeRequestInjection(probeAgent('planner-id'), RP_FULL_REG, { provider: 'p-custom', model: 'model-custom' })
    return { provider: out.provider, model: out.model, maxTokens: out.maxTokens }
  }, { provider: 'p-custom', model: 'model-custom', maxTokens: 8192 }],
  ['RP3 上溯链断裂（main-id 不存在）→ 回退直接父会话值', async () => {
    const out = await resolveProbeRequestInjection(probeAgent('planner-id'), registryOf(new Map([['planner-id', midPlanner()]])), { provider: 'p-pro', model: 'deepseek-v4-pro', maxTokens: 16384 })
    return { provider: out.provider, model: out.model, maxTokens: out.maxTokens }
  }, { provider: 'p-pro', model: 'deepseek-v4-pro', maxTokens: 16384 }],
  ['RP4 effort 仍以直接父为准（顶层 high 不渗入）→ 不注入 effort', async () => {
    const out = await resolveProbeRequestInjection(probeAgent('planner-id'), RP_FULL_REG, { provider: 'p-pro', model: 'deepseek-v4-pro' })
    return typeof out.reasoningEffort === 'string' ? out.reasoningEffort : ''
  }, ''],
]
for (const [name, fn, expected] of RP) { check(name, await fn(), expected) }

// ── AS 系列:pre-execute 整链（mock ctx 走插件 apply；harness 模式同 step-04 L92-106/L140-144） ──
function makeAskHarness() {
  const listeners = {}
  const ctx = {
    get: () => undefined,
    on: (name, fn) => {
      if (listeners[name] === undefined) listeners[name] = []
      listeners[name].push(fn)
    },
    provide: (name, value) => { ctx[name] = value },
  }
  plugin.apply(ctx, { anchoredBootstrap: false })
  return listeners
}
const askHarness = makeAskHarness()
const askMainAgent = {
  session: { header: { id: 'main-1', cwd: 'C:/work' }, snapshotEvents: () => [] },
  options: {},
  ctx: undefined,
}
function askPreExecute(name, argumentsObj) {
  const entry = askHarness['tools/pre-execute']
  if (entry === undefined || entry.length === 0) throw new Error('pre-execute 监听器未注册')
  return entry[0]({ agent: askMainAgent, name, arguments: argumentsObj }, () => ({ kind: 'allow' }))
}
const askStandardQ1 = [{ id: 'q1', options: [{ label: '同意执行' }, { label: '转交pro规划' }, { label: '不同意' }] }]
const AS = [
  ['AS1 首问标准三词+第二问带选项 → deny 且含「纯文本」、不含「一并修正」（standard 单报路径）', (() => { const r = askPreExecute('ask_user_question', { questions: [...askStandardQ1, { id: 'q2', question: '修改意见', options: [{ label: '无' }, { label: '有意见（填写）' }] }] }); return r !== null && r !== undefined && r.kind === 'deny' && String(r.reason).includes('纯文本') && !String(r.reason).includes('一并修正') })(), true],
  ['AS2 首问标准三词+第二问无 options → allow', (() => { const r = askPreExecute('ask_user_question', { questions: [...askStandardQ1, { id: 'q2', question: '修改意见' }] }); return r !== null && r !== undefined && r.kind === 'allow' })(), true],
  ['AS3 首问非白名单变体+第二问无 options → deny 含「推荐标记仅限」、不含「路由 ask 结构错误」（kind 特异性回归）', (() => { const r = askPreExecute('ask_user_question', { questions: [{ id: 'q1', options: [{ label: '同意执行!' }, { label: '转交pro规划' }, { label: '不同意' }] }, { id: 'q2', question: '修改意见' }] }); return r !== null && r !== undefined && r.kind === 'deny' && String(r.reason).includes('推荐标记仅限') && !String(r.reason).includes('路由 ask 结构错误') })(), true],
  ['AS4 单问「同意执行!」变体 → deny 含「批准 ask 结构错误」与「修改意见」（approve 模板正向）', (() => { const r = askPreExecute('ask_user_question', { questions: [{ id: 'q1', options: [{ label: '同意执行!' }] }] }); return r !== null && r !== undefined && r.kind === 'deny' && String(r.reason).includes('批准 ask 结构错误') && String(r.reason).includes('修改意见') })(), true],
  ['AS5 单问路由变体（直接执行!）→ deny 且不含「结构错误」（route 特异不回归）', (() => { const r = askPreExecute('ask_user_question', { questions: [{ id: 'q1', options: [{ label: '直接执行!' }, { label: '进行pro规划' }, { label: '不同意' }] }] }); return r !== null && r !== undefined && r.kind === 'deny' && !String(r.reason).includes('结构错误') })(), true],
  ['AS6 cordis_run 路由未确认 → deny 含「路由未确认：cordis_run」与「须先 ask_user_question 路由确认」', (() => { const r = askPreExecute('cordis_run', {}); return r !== null && r !== undefined && r.kind === 'deny' && String(r.reason).includes('路由未确认：cordis_run') && String(r.reason).includes('须先 ask_user_question 路由确认') })(), true],
  ['AS7 cordis_define 路由未确认 → allow', (() => { const r = askPreExecute('cordis_define', {}); return r !== null && r !== undefined && r.kind === 'allow' })(), true],
  ['AS8 cordis_inspect_list 路由未确认 → allow', (() => { const r = askPreExecute('cordis_inspect_list', {}); return r !== null && r !== undefined && r.kind === 'allow' })(), true],
]
for (const [name, got, expected] of AS) check(name, got, expected)

// ── F-code 系列:deriveFlowState 识别 run_code 内嵌套 ask（F1 桥接） ─────────
const FC = [
  ['FC1 嵌套路由答「直接执行」→ direct', [um(), cdStart('ask_user_question', 'n1', nestedRouteArgs), cdEnd('n1', answer(['直接执行']))], { route: 'direct', clarified: false, approved: false, channelBroken: false }],
  ['FC2 嵌套路由答「进行pro规划」→ plan', [um(), cdStart('ask_user_question', 'n1', nestedRouteArgs), cdEnd('n1', answer(['进行pro规划']))], { route: 'plan', clarified: false, approved: false, channelBroken: false }],
  ['FC3 嵌套路由答「不同意」→ none', [um(), cdStart('ask_user_question', 'n1', nestedRouteArgs), cdEnd('n1', answer(['不同意']))], { route: 'none', clarified: false, approved: false, channelBroken: false }],
  ['FC4 嵌套澄清自定义答复 → clarified', [um(), cdStart('ask_user_question', 'n1', nestedRouteArgs), cdEnd('n1', answer(['进行pro规划'])), cdStart('ask_user_question', 'n2', nestedClarifyArgs), cdEnd('n2', customAnswer)], { route: 'plan', clarified: true, approved: false, channelBroken: false }],
  ['FC5 嵌套批准「同意执行」→ approved', [um(), cdStart('ask_user_question', 'n1', nestedRouteArgs), cdEnd('n1', answer(['进行pro规划'])), cdStart('ask_user_question', 'n2', nestedClarifyArgs), cdEnd('n2', answer(['方案A'])), cdStart('ask_user_question', 'n3', nestedApprovalArgs), cdEnd('n3', answer(['同意执行']))], { route: 'plan', clarified: true, approved: true, channelBroken: false }],
  ['FC6 嵌套空白 answers:[] → 全默认', [um(), cdStart('ask_user_question', 'n1', nestedRouteArgs), cdEnd('n1', emptyAnswer)], { route: 'none', clarified: false, approved: false, channelBroken: false }],
  ['FC7 嵌套 isError:true → route=none+approved=false', [um(), cdStart('ask_user_question', 'n1', nestedRouteArgs), cdEnd('n1', 'Error: ask failed', true)], { route: 'none', clarified: false, approved: false, channelBroken: false }],
  ['FC8 直呼+嵌套混排互不干扰（后答生效）', [um(), cdStart('ask_user_question', 'n1', nestedRouteArgs), cdEnd('n1', answer(['直接执行'])), call('ask_user_question', 'a1', routeArgs), ok('a1', answer(['进行pro规划']))], { route: 'plan', clarified: false, approved: false, channelBroken: false }],
]
for (const [name, events, expected] of FC) {
  check(name, deriveFlowState(events), expected)
}

// ── P-code 系列:plannerChildIdsOf 识别嵌套 subagent_plan（F3 桥接） ─────────
const PC = [
  ['PC1 嵌套 plan 结果含 uuid → 提取', [um(), cdStart('subagent_plan', 'p1', {}), cdEnd('p1', 'started subagent 3a7c1e5b-9d2f-4e8a-b6c4-1f0e9d8c7b6a')], ['3a7c1e5b-9d2f-4e8a-b6c4-1f0e9d8c7b6a']],
  ['PC2 嵌套 plan 结果 isError → 空', [um(), cdStart('subagent_plan', 'p1', {}), cdEnd('p1', 'Error: gated', true)], []],
  ['PC3 非 subagent_plan 的 code-dispatch 忽略', [um(), cdStart('write', 'w1', {}), cdEnd('w1', 'started subagent 3a7c1e5b-9d2f-4e8a-b6c4-1f0e9d8c7b6a')], []],
]
for (const [name, events, expected] of PC) {
  check(name, plannerChildIdsOf(events), expected)
}

// ── C-code/CU-code 系列:toolCallCount / toolCallsSinceUser 计入嵌套调用（F2 桥接） ──
const CC = [
  ['CC1 单 cdStart 计 1', [cdStart('read', 'n1', {})], new Set([]), 1],
  ['CC2 tool/call×2+cdStart×2 → 4', [call('read', 'c1'), call('glob', 'c2'), cdStart('pwsh', 'n1', {}), cdStart('read', 'n2', {})], new Set([]), 4],
  ['CC3 skipNames 含 save_plan → 嵌套 save_plan 排除', [cdStart('save_plan', 'n1', {}), cdStart('read', 'n2', {})], new Set(['save_plan']), 1],
  ['CC4 嵌套 skipNames 白名单不含 → 仍计 1', [cdStart('send_message', 'n1', {}), cdStart('report', 'n2', {}), cdStart('read', 'n3', {})], new Set(['save_plan', 'send_message', 'report']), 1],
]
for (const [name, events, skip, expected] of CC) {
  check(name, toolCallCount(events, skip), expected)
}

const CUCODE = [
  ['CUC1 kind=user 锚点后嵌套计数', [umk('user'), cdStart('read', 'n1', {}), cdStart('glob', 'n2', {})], new Set([]), 2],
  ['CUC2 锚点后直呼+嵌套混合计数', [umk('user'), call('read', 'a1'), cdStart('pwsh', 'n1', {})], new Set([]), 2],
]
for (const [name, events, skip, expected] of CUCODE) {
  check(name, toolCallsSinceUser(events, skip), expected)
}

// ── CLC 系列:catalogIsCollapsed（ptc 折叠目录判定，F4 桥接） ───────────────
const CLC = [
  ['CLC1 [{name:run_code}] → true(ptc 折叠形态)', [{ name: 'run_code' }], true],
  ['CLC2 [run_code] → true(字符串形状折叠)', ['run_code'], true],
  ['CLC3 [{name:read}] → false', [{ name: 'read' }], false],
  ['CLC4 [{name:run_code},{name:read}] → false(both 形态不折叠)', [{ name: 'run_code' }, { name: 'read' }], false],
  ['CLC5 [write,edit] → false', ['write', 'edit'], false],
]
for (const [name, tools, expected] of CLC) {
  check(name, catalogIsCollapsed(tools), expected)
}

// ── H 系列:codeMutationHints（F7' run_code 静态扫描误杀调优） ──────────────
const H = [
  ['H1 writeFileSync → 命中 fs-write', "await writeFileSync('/tmp/x', 'data')", ['fs-write']],
  ['H2 require(child_process)+spawn → 命中两项', "require('child_process').spawn('ls')", ['child-process-import', 'child-process-call']],
  ['H3 eval → 命中 eval-function', "eval('1+1')", ['eval-function']],
  ['H4 process.binding → 命中', "process.binding('fs')", ['process-binding']],
  ['H5 require node:vm → 命中', "require('node:vm')", ['node-vm']],
  ['H6 纯只读代码 → 不命中', "const fs = require('node:fs'); fs.readFileSync('x', 'utf8')", []],
  ['H7 空串/非字符串 → 不命中', '', []],
  ['H8 node:fs 只读方法族（readFile/readdir/stat/access）→ 不命中（白名单例外）', "await readFile('x'); await readdir('d'); await stat('x')", []],
  ['H9 code 缺失（undefined）→ 不命中', undefined, []],
]
for (const [name, code, expected] of H) {
  check(name, codeMutationHints(code), expected)
}

// ── I 系列:runCodeDenyReason 主会话分支（F7' 终版修订:内容扫描/模拟审核） ─────
const mainAgentFx = { session: { header: { id: 'main-1' }, snapshotEvents: () => [] } }
const readOnlyCodeFx = "await readFileSync('x', 'utf8')"
const writeCodeFx = "await writeFileSync('x', '1')"
const noneStateFx = { route: 'none', clarified: false, approved: false, channelBroken: false }
const planStateFx = { route: 'plan', clarified: true, approved: false, channelBroken: false }
const I = [
  ['I1 主会话 none+纯只读 → 放行(null)', readOnlyCodeFx, noneStateFx, null],
  ['I2 主会话 none+含写 → routeDenyReason(write/edit) 逐字一致', writeCodeFx, noneStateFx, routeDenyReason('write/edit', { route: 'none' })],
  ['I3 主会话 plan+含写 → routeDenyReason(write/edit) 逐字一致（含「规划态下主会话不可写文件」）', writeCodeFx, planStateFx, routeDenyReason('write/edit', { route: 'plan' })],
]
for (const [name, code, state, expected] of I) {
  check(name, runCodeDenyReason(mainAgentFx, { arguments: { code } }, state, false), expected)
}

console.log(`\n通过 ${pass}/${K.length + M.length + F.length + GK.length + GM.length + F21.length + GL.length + P.length + C.length + CU.length + AP.length + BN.length + 2 + BR.length + DR.length + BD.length + BE.length + S.length + 1 + PW.length + 2 + D.length + 3 + 3 + PR.length + 7 + 5 + E.length + RP.length + LQ.length + AS.length + FC.length + PC.length + CC.length + CUCODE.length + CLC.length + H.length + I.length}, 失败 ${fail}`)
process.exit(fail === 0 ? 0 : 1)
