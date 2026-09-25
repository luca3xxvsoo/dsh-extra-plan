// 场景测试:extra-plan 判定逻辑（decisions 命名空间纯函数）
// 直接 import 插件导出的 decisions（与 index.js 同一份实现，无复制品）——
// 插件模块顶层无副作用，可在纯 Node 环境加载。
import { pathToFileURL, fileURLToPath } from 'node:url'
import { registerHostDeps } from '../_shared/host-deps.mjs'
// host-deps 先于隔离完成解析（它按候选① DSH_HOME/profiles/web 锚定宿主真包）。
await registerHostDeps()

// ── 测试隔离（方案 A 构造期读盘） ──────────────────────────────────────────
// live-config 构造期无条件读盘一次（DSH_HOME/.agent-presets/extra-plan/agent.cordis.yml，或
// 优先级更高的 DSH_EXTRA_PLAN_CONFIG_PATH）。本脚本的 plugin.apply 均传入 config 快照（如
// anchoredBootstrap: false），若命中现场真值，这些按入参硬编码的期望会被现场配置污染。故在
// 【插件 import 之前】把 DSH_HOME 指向空的临时目录、并清空 DSH_EXTRA_PLAN_CONFIG_PATH：
// 构造期读盘必然失败 → 各实例回退到自己的 fallbackDefaults（= apply 入参）。
// 测试结束（含 process.exit 与异常退出路径）由 process.on('exit') 恢复原值并删临时目录。
const previousDshHome = process.env.DSH_HOME
const previousConfigPath = process.env.DSH_EXTRA_PLAN_CONFIG_PATH
const isolatedDshHome = mkdtempSync(join(tmpdir(), 'dsh-extra-plan-step00-home-'))
process.env.DSH_HOME = isolatedDshHome
delete process.env.DSH_EXTRA_PLAN_CONFIG_PATH
function restoreIsolatedEnv() {
  if (previousDshHome === undefined) delete process.env.DSH_HOME
  else process.env.DSH_HOME = previousDshHome
  if (previousConfigPath === undefined) delete process.env.DSH_EXTRA_PLAN_CONFIG_PATH
  else process.env.DSH_EXTRA_PLAN_CONFIG_PATH = previousConfigPath
  rmSync(isolatedDshHome, { recursive: true, force: true })
}
process.on('exit', restoreIsolatedEnv)

const plannerBudget = await import('../../plugins/dsh-extra-plan/lib/planner-budget.js')
const PLUGIN_PATH = fileURLToPath(new URL('../../plugins/dsh-extra-plan/index.js', import.meta.url))
const plugin = await import(pathToFileURL(PLUGIN_PATH).href)
import { createRunCodeStatic } from '../../plugins/dsh-extra-plan/lib/run-code-static.js'
import * as shellMutation from '../../plugins/dsh-extra-plan/lib/shell-mutation.js'
import * as runtimeStatic from '../../plugins/dsh-extra-plan/lib/runtime-static.js'
import * as agentRuntime from '../../plugins/dsh-extra-plan/lib/agent-runtime.js'
import { DEFAULT_EXPLORE_BUDGET as GENERATED_DEFAULT_EXPLORE_BUDGET } from '../../plugins/dsh-extra-plan/lib/preset-defaults.generated.js'
import { existsSync, readFileSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { parsePresetYaml } from '../../plugins/dsh-extra-plan/lib/preset-settings.js'
import { GATE_WORD_FIELDS, createGateRuntime, validateGateWords } from '../../plugins/dsh-extra-plan/lib/gate-words.js'
const {
  CHANNEL_BROKEN_CODES,
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
  matchPurposeLabel,
  parseAskResultData,
  parseDispatchAskResult,
  catalogIsCollapsed,
  schemasHasWriteTools,
  schemasHasTool,
  RUNCODE_MUTATION_HINTS,
  codeMutationHints,
  decomposeRunCode,
  runCodeGroupDenyReason,
  askUserQuestionReturnGateReason,
  deriveFlowState,
  toolCallCount,
  toolCallsSinceUser,
  isRunCodeSubCall,
  runCodeDispatchGateReason,
  runCodeSiteCount,
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
  resolveAgentRouteSources,
  decidePlannerModelUse,
  PLANNER_PROBE_TIMEOUT_MS,
  PLANNER_BLOCKED_REASON,
  NON_PLANNER_BLOCKED_REASON,
  sortPlannerCandidates,
} = plugin.decisions
const HERE = fileURLToPath(new URL('.', import.meta.url))

// ── 闸门词唯一真源 = 资产 YAML（config.gateWords） ───────────────────────────
// 默认正例与期望文案一律由 parsePresetYaml 取到的配置经 createGateRuntime 派生；
// decisions 不再导出任何词值常量，测试也不手写第二份词值。
const ASSET_AGENT_FILE = fileURLToPath(new URL('../../plugins/dsh-extra-plan/assets/presets/extra-plan/agent.cordis.yml', import.meta.url))
const GATE_WORDS_LIB_FILE = fileURLToPath(new URL('../../plugins/dsh-extra-plan/lib/gate-words.js', import.meta.url))
const assetDocument = parsePresetYaml(readFileSync(ASSET_AGENT_FILE, 'utf8'))
function flattenAssetRows(list) {
  const out = []
  for (const row of list) {
    if (row === null || typeof row !== "object") continue
    out.push(row)
    if (row.group === true && Array.isArray(row.config)) out.push(...flattenAssetRows(row.config))
  }
  return out
}
const assetRowsAll = flattenAssetRows(assetDocument)
const assetExtraPlanConfig = assetRowsAll.find((row) => row.id === 'extra-plan').config
const assetGateWords = assetExtraPlanConfig.gateWords
const gateRuntime = createGateRuntime(assetGateWords)
const ROUTE_WORD_DIRECT = gateRuntime.words.routeDirect
const ROUTE_WORD_PLAN = gateRuntime.words.routePlan
const ROUTE_WORD_DISAGREE = gateRuntime.words.routeDisagree
const APPROVAL_WORD_APPROVE = gateRuntime.words.approvalApprove
const APPROVAL_WORD_REPLAN = gateRuntime.words.approvalReplan
const ROUTE_OPTIONS_TEXT = gateRuntime.options.route
const APPROVAL_OPTIONS_TEXT = gateRuntime.options.approval
const ROUTE_CONFIRM_TEXT = gateRuntime.confirm.route

// ── apply 统一入口（4 处 plugin.apply 站点同源） ────────────────────────────
// 合并资产 YAML 的 gateWords（调用方显式传 gateWords 时以调用方为准），并补齐
// systemPrompt/effect mock；坏配置入口不经本 helper（直接调 plugin.apply）。
function applyPlugin(ctx, config, registry) {
  const variables = registry !== undefined ? registry : []
  ctx.systemPrompt = { variable: (name, provider) => { variables.push({ name, provider }); return () => {} } }
  if (typeof ctx.effect !== "function") ctx.effect = (fn) => fn()
  if (typeof ctx.get === "function") {
    const inner = ctx.get
    ctx.get = (name) => (name === "systemPrompt" ? ctx.systemPrompt : inner(name))
  }
  plugin.apply(ctx, Object.assign({ gateWords: assetGateWords }, config))
  return variables
}
const staticRunCode = createRunCodeStatic({
  askTool: 'ask_user_question',
  isDispatchStart: (type) => type === 'tool/ptc-dispatch-start' || type === 'tool/code-dispatch-start',
})
const { maskCodeLiteralsAndComments, sliceBalancedArgs } = staticRunCode

// ── 事件构造（真实形状，同 step-06-线索落盘.mjs / step-04-路由与写闸门.mjs 的事件构造函数，三处同构见 R6） ───
const um = () => ({ type: 'user/message', data: { source: { kind: 'user' } } })
const call = (name, cid, argumentsStr = '{}') => ({ type: 'tool/call', data: { name, callId: cid, arguments: argumentsStr } })
const ok = (cid, text) => ({ type: 'tool/result', data: { message: { content: [{ type: 'tool-result', toolCallId: cid, content: [{ type: 'text', text }] }] } } })
const err = (cid, code) => ({ type: 'tool/result', data: { error: { name: 'Error', ...(code === undefined ? {} : { code }) }, message: { content: [{ type: 'tool-result', toolCallId: cid, content: [] }] } } })
// 真实 deny 形状（pre-execute 拒绝结果：块级 isError:true、无 data.error——仅 HarnessError 有 .info）
const deny = (cid, reason) => ({ type: 'tool/result', data: { message: { content: [{ type: 'tool-result', toolCallId: cid, content: [{ type: 'text', text: 'Error: ' + reason }], isError: true }] } } })
const routeArgs = JSON.stringify({ questions: [{ id: 'q1', options: [{ label: '直接执行' }, { label: '进行pro规划' }, { label: '不同意' }] }] })
const approvalArgs = JSON.stringify({ questions: [{ id: 'q1', options: [{ label: '同意执行' }, { label: '转交pro规划' }, { label: '不同意' }] }] })
// D7：路由 ask 双问夹具——第二问为纯文本「补充要求」（可留空、不得带 options）
const route2qArgs = JSON.stringify({ questions: [{ id: 'q1', options: [{ label: '直接执行' }, { label: '进行pro规划' }, { label: '不同意' }] }, { id: 'supplement', question: '补充要求' }] })
const route2qArgsWithOpts = JSON.stringify({ questions: [{ id: 'q1', options: [{ label: '直接执行' }, { label: '进行pro规划' }, { label: '不同意' }] }, { id: 'supplement', question: '补充要求', options: [{ label: '选项A' }] }] })
const clarifyArgs = JSON.stringify({ questions: [{ id: 'q1', options: [{ label: '方案A' }, { label: '方案B' }] }] })
const purposeArgs = JSON.stringify({ questions: [{ id: 'q1', options: [{ label: '完善方案' }, { label: '重新规划' }] }] })
const wordPurposeArgs = JSON.stringify({ questions: [{ id: 'q1', options: [{ label: '完善方案' }] }] })
const answer = (labels) => JSON.stringify({ answers: labels.map((l) => ({ id: 'q1', selected: [l] })) })
const customAnswer = '{"answers":[{"id":"q1","custom":"改成XX"}]}'
const emptyAnswer = '{"answers":[]}'
// 嵌套事件 fixture（run_code 程序内嵌套调用，混合模式桥接 F1-F4）：
// dispatch-start 的 data={rootCallId,parentCallId,subCallId,name,arguments}（arguments 为对象形态，
// 与直呼 call 的 arguments JSON 字符串形态区别）；dispatch 的 data 另含 isError+content
// （content 直接是 ContentBlock 数组，无 tool/result 的 tool-result 外层）。
// 事件名双兼容两代：0.1.5-rc.2 新名 = tool/ptc-dispatch-start / tool/ptc-dispatch；
// 0.1.2-rc.1 旧名 = tool/code-dispatch-start / tool/code-dispatch，均由 runDispatchSeries(ev) 注入。
const nestedRouteArgs = { questions: [{ id: 'q1', options: [{ label: '直接执行' }, { label: '进行pro规划' }, { label: '不同意' }] }] }
const nestedApprovalArgs = { questions: [{ id: 'q1', options: [{ label: '同意执行' }, { label: '转交pro规划' }, { label: '不同意' }] }] }
const nestedClarifyArgs = { questions: [{ id: 'q1', options: [{ label: '方案A' }, { label: '方案B' }] }] }
const nestedPurposeArgs = { questions: [{ id: 'q1', options: [{ label: '完善方案' }, { label: '重新规划' }] }] }

let pass = 0
let fail = 0
function check(name, got, expected) {
  const okResult = JSON.stringify(got) === JSON.stringify(expected)
  if (okResult) { pass += 1 } else { fail += 1 }
  console.log(`${okResult ? 'PASS' : 'FAIL'}  ${name}  (期望 ${JSON.stringify(expected)}, 实际 ${JSON.stringify(got)})`)
}
function checkTrue(name, got) {
  check(name, got, true)
}

// ── 根入口公开 named export 兼容断言：与 decisions 保持同一绑定/行为 ──
check('公开导出 PROBE_LIMITS 与 decisions 同一绑定', plugin.PROBE_LIMITS === plugin.decisions.PROBE_LIMITS, true)
check('公开导出 extractProbeEvidenceRefs 与 decisions 同一绑定', plugin.extractProbeEvidenceRefs === plugin.decisions.extractProbeEvidenceRefs, true)
const PUBLIC_E1_E5_INPUTS = [
  '',
  '普通方案文本，无证据标记',
  '步骤1：【探查者已核实】·证据：.extra-plan/证据-a.md',
  '【探查者已核实】·证据：证据-a.md 与【探查者已核实】·证据：证据-a.md',
  '【探查者已核实】步骤已完成',
]
check('公开导出 extractProbeEvidenceRefs 对 E1-E5 输入给出相同结果',
  PUBLIC_E1_E5_INPUTS.map((input) => plugin.extractProbeEvidenceRefs(input)),
  PUBLIC_E1_E5_INPUTS.map((input) => plugin.decisions.extractProbeEvidenceRefs(input)))
check('shell PWSH_MUTATION 与 decisions 严格同一绑定', plugin.decisions.PWSH_MUTATION === shellMutation.PWSH_MUTATION, true)
check('shell BASH_MUTATION 与 decisions 严格同一绑定', plugin.decisions.BASH_MUTATION === shellMutation.BASH_MUTATION, true)
check('shell pwshMutationMatches 与 decisions 严格同一绑定', plugin.decisions.pwshMutationMatches === shellMutation.pwshMutationMatches, true)
check('shell bashMutationMatches 与 decisions 严格同一绑定', plugin.decisions.bashMutationMatches === shellMutation.bashMutationMatches, true)
check('planner toolCallCount 与 decisions 严格同一绑定', plugin.decisions.toolCallCount === plannerBudget.toolCallCount, true)
check('planner budgetNoticeText 与 decisions 严格同一绑定', plugin.decisions.budgetNoticeText === plannerBudget.budgetNoticeText, true)
check('planner DEFAULT_EXPLORE_BUDGET 来自生成模块且为 18', plannerBudget.DEFAULT_EXPLORE_BUDGET === GENERATED_DEFAULT_EXPLORE_BUDGET, true)
check('生成默认值当前为 18', GENERATED_DEFAULT_EXPLORE_BUDGET, 18)
check('agent runtime isLiveDelegation 与 decisions 严格同一绑定', plugin.decisions.isLiveDelegation === agentRuntime.isLiveDelegation, true)
check('agent runtime childPolicyNeedsFloor 与 decisions 严格同一绑定', plugin.decisions.childPolicyNeedsFloor === agentRuntime.childPolicyNeedsFloor, true)
check('runtime-static causeChainOf 按显式 depth 截断', runtimeStatic.causeChainOf({ name: 'A', message: 'a', cause: { name: 'B', message: 'b' } }, 1).length, 1)

// ── KA 系列:ask 分类与参数解析（v4 更名：原 K 系列让位于子代理角色组判定 K 系列；断言内容逐字不变） ──
const KA = [
  ['K1 路由 ask(含直行+规划词) → route', { name: 'ask_user_question', callId: 'k1', arguments: routeArgs }, 'route'],
  ['K2 批准 ask(含同意执行) → approve', { name: 'ask_user_question', callId: 'k2', arguments: approvalArgs }, 'approve'],
  ['K3 澄清 ask(自由选项) → clarify', { name: 'ask_user_question', callId: 'k3', arguments: clarifyArgs }, 'clarify'],
  ['K4 参数无法解析 → null(跳过)', { name: 'ask_user_question', callId: 'k4', arguments: 'not-json' }, null],
  ['K5 无 questions 字段 → null', { name: 'ask_user_question', callId: 'k5', arguments: '{}' }, null],
  ['KA6 目的 ask(两个目的词) → purpose', { name: 'ask_user_question', callId: 'k6', arguments: purposeArgs }, 'purpose'],
]
for (const [name, data, expected] of KA) {
  const labels = labelsOfCallData(data)
  check(name, labels === null ? null : askKindOf(labels, gateRuntime), expected)
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
  ['M1 路由词「直接执行」→ direct', matchRouteLabel(['直接执行'], gateRuntime), 'direct'],
  ['M2 路由词「进行pro规划」→ plan', matchRouteLabel(['进行pro规划'], gateRuntime), 'plan'],
  ['M3 路由词「不同意」→ disagree', matchRouteLabel(['不同意'], gateRuntime), 'disagree'],
  ['M4 路由词无匹配 → null', matchRouteLabel([], gateRuntime), null],
  ['M5 路由词带后缀「直接执行（推荐）」→ direct', matchRouteLabel(['直接执行（推荐）'], gateRuntime), 'direct'],
  ['M6 批准词「同意执行」→ approve', matchApprovalLabel(['同意执行'], gateRuntime), 'approve'],
  ['M7 批准词「转交pro规划」→ replan', matchApprovalLabel(['转交pro规划'], gateRuntime), 'replan'],
  ['M8 批准词「不同意」→ disagree', matchApprovalLabel(['不同意'], gateRuntime), 'disagree'],
  ['M9 批准词无匹配 → null', matchApprovalLabel(['别的词'], gateRuntime), null],
  ['M10 目的词「完善方案」→ refine', matchPurposeLabel(['完善方案'], gateRuntime), 'refine'],
  ['M11 目的词「重新规划」→ redo', matchPurposeLabel(['重新规划'], gateRuntime), 'redo'],
  ['M12 目的词无匹配 → null', matchPurposeLabel(['别的词'], gateRuntime), null],
]
for (const [name, got, expected] of M) check(name, got, expected)

// ── F 系列:deriveFlowState(自最近人类消息起) ──────────────────────────
const fullPlanApprovedEvents = [
  um(),
  call('ask_user_question', 'fa1', routeArgs),
  ok('fa1', answer(['进行pro规划'])),
  call('ask_user_question', 'fa2', purposeArgs),
  ok('fa2', answer(['完善方案'])),
  call('ask_user_question', 'fa3', clarifyArgs),
  ok('fa3', answer(['方案A'])),
  call('ask_user_question', 'fa4', approvalArgs),
  ok('fa4', answer(['同意执行'])),
]
const F = [
  ['F1 无事件 → 全空', [], { route: 'none', clarified: false, approved: false, purpose: 'none', channelBroken: false }],
  ['F2 路由答「直接执行」→ direct', [um(), call('ask_user_question', 'a1', routeArgs), ok('a1', answer(['直接执行']))], { route: 'direct', clarified: false, approved: false, purpose: 'none', channelBroken: false }],
  ['F3 路由答规划 + 澄清自定义答复（目的未定）→ plan·未澄清', [um(), call('ask_user_question', 'a1', routeArgs), ok('a1', answer(['进行pro规划'])), call('ask_user_question', 'a2', clarifyArgs), ok('a2', customAnswer)], { route: 'plan', clarified: false, approved: false, purpose: 'none', channelBroken: false }],
  ['F4 路由空白回复 → 保持 none', [um(), call('ask_user_question', 'a1', routeArgs), ok('a1', emptyAnswer)], { route: 'none', clarified: false, approved: false, purpose: 'none', channelBroken: false }],
  ['F5 路由答「不同意」→ none', [um(), call('ask_user_question', 'a1', routeArgs), ok('a1', answer(['不同意']))], { route: 'none', clarified: false, approved: false, purpose: 'none', channelBroken: false }],
  ['F6 全链路:规划+澄清+同意执行（目的未定）→ approved', [um(), call('ask_user_question', 'a1', routeArgs), ok('a1', answer(['进行pro规划'])), call('ask_user_question', 'a2', clarifyArgs), ok('a2', answer(['方案A'])), call('ask_user_question', 'a3', approvalArgs), ok('a3', answer(['同意执行']))], { route: 'plan', clarified: false, approved: true, purpose: 'none', channelBroken: false }],
  ['F7 批准答「转交pro规划」→ approved=false', [um(), call('ask_user_question', 'a1', routeArgs), ok('a1', answer(['进行pro规划'])), call('ask_user_question', 'a2', clarifyArgs), ok('a2', answer(['方案A'])), call('ask_user_question', 'a3', approvalArgs), ok('a3', answer(['转交pro规划']))], { route: 'plan', clarified: false, approved: false, purpose: 'none', channelBroken: false }],
  ['F8 批准答「不同意」→ approved=false', [um(), call('ask_user_question', 'a1', routeArgs), ok('a1', answer(['进行pro规划'])), call('ask_user_question', 'a2', clarifyArgs), ok('a2', answer(['方案A'])), call('ask_user_question', 'a3', approvalArgs), ok('a3', answer(['不同意']))], { route: 'plan', clarified: false, approved: false, purpose: 'none', channelBroken: false }],
  ['F9 路由被用户取消(ASK_CANCELLED) → none', [um(), call('ask_user_question', 'a1', routeArgs), err('a1', 'ASK_CANCELLED')], { route: 'none', clarified: false, approved: false, purpose: 'none', channelBroken: false }],
  ['F10 通道错误(NO_PROVIDER) → channelBroken', [um(), call('ask_user_question', 'a1', routeArgs), err('a1', 'NO_PROVIDER')], { route: 'none', clarified: false, approved: false, purpose: 'none', channelBroken: true }],
  ['F11 新人类消息 → 重置', [um(), call('ask_user_question', 'a1', routeArgs), ok('a1', answer(['直接执行'])), um()], { route: 'none', clarified: false, approved: false, purpose: 'none', channelBroken: false }],
  ['F12 澄清空白回复（目的未定）→ 未澄清', [um(), call('ask_user_question', 'a1', routeArgs), ok('a1', answer(['进行pro规划'])), call('ask_user_question', 'a2', clarifyArgs), ok('a2', emptyAnswer)], { route: 'plan', clarified: false, approved: false, purpose: 'none', channelBroken: false }],
  ['F13 两次路由答:先直行后规划 → 后答生效', [um(), call('ask_user_question', 'a1', routeArgs), ok('a1', answer(['直接执行'])), call('ask_user_question', 'a2', routeArgs), ok('a2', answer(['进行pro规划']))], { route: 'plan', clarified: false, approved: false, purpose: 'none', channelBroken: false }],
  ['F14 澄清自定义答复(无 selected)（目的未定）→ 未澄清', [um(), call('ask_user_question', 'a1', routeArgs), ok('a1', answer(['进行pro规划'])), call('ask_user_question', 'a2', clarifyArgs), ok('a2', customAnswer)], { route: 'plan', clarified: false, approved: false, purpose: 'none', channelBroken: false }],
  ['F15 无关工具结果不影响状态', [um(), call('ask_user_question', 'a1', routeArgs), ok('a1', answer(['直接执行'])), call('read', 'r1'), ok('r1', '这里写着 "answers" 字样')], { route: 'direct', clarified: false, approved: false, purpose: 'none', channelBroken: false }],
  ['F16 路由先确认后空白回复 → 重置 none', [um(), call('ask_user_question', 'a1', routeArgs), ok('a1', answer(['直接执行'])), call('ask_user_question', 'a2', routeArgs), ok('a2', emptyAnswer)], { route: 'none', clarified: false, approved: false, purpose: 'none', channelBroken: false }],
  ['F17 路由先确认后取消 → 重置 none', [um(), call('ask_user_question', 'a1', routeArgs), ok('a1', answer(['直接执行'])), call('ask_user_question', 'a2', routeArgs), err('a2', 'ASK_CANCELLED')], { route: 'none', clarified: false, approved: false, purpose: 'none', channelBroken: false }],
  ['F18 批准先确认后空白回复 → 重置 false', [um(), call('ask_user_question', 'a1', routeArgs), ok('a1', answer(['进行pro规划'])), call('ask_user_question', 'a2', clarifyArgs), ok('a2', answer(['方案A'])), call('ask_user_question', 'a3', approvalArgs), ok('a3', answer(['同意执行'])), call('ask_user_question', 'a4', approvalArgs), ok('a4', emptyAnswer)], { route: 'plan', clarified: false, approved: false, purpose: 'none', channelBroken: false }],
  ['F19 批准先确认后取消 → 重置 false', [um(), call('ask_user_question', 'a1', routeArgs), ok('a1', answer(['进行pro规划'])), call('ask_user_question', 'a2', clarifyArgs), ok('a2', answer(['方案A'])), call('ask_user_question', 'a3', approvalArgs), ok('a3', answer(['同意执行'])), call('ask_user_question', 'a4', approvalArgs), err('a4', 'ASK_CANCELLED')], { route: 'none', clarified: false, approved: false, purpose: 'none', channelBroken: false }],
  ['F20 通道错误逃生回归：不重置已确认状态', [um(), call('ask_user_question', 'a1', routeArgs), ok('a1', answer(['直接执行'])), call('ask_user_question', 'a2', routeArgs), err('a2', 'NO_PROVIDER')], { route: 'direct', clarified: false, approved: false, purpose: 'none', channelBroken: true }],
  ['F23 目的答「完善方案」→ purpose=refine 且 clarified 不变', [um(), call('ask_user_question', 'a1', routeArgs), ok('a1', answer(['进行pro规划'])), call('ask_user_question', 'a2', purposeArgs), ok('a2', answer(['完善方案']))], { route: 'plan', clarified: false, approved: false, purpose: 'refine', channelBroken: false }],
  ['F24 目的答「重新规划」→ purpose=redo', [um(), call('ask_user_question', 'a1', routeArgs), ok('a1', answer(['进行pro规划'])), call('ask_user_question', 'a2', purposeArgs), ok('a2', answer(['重新规划']))], { route: 'plan', clarified: false, approved: false, purpose: 'redo', channelBroken: false }],
  ['F25 目的空白答复 → purpose 保持 none', [um(), call('ask_user_question', 'a1', routeArgs), ok('a1', answer(['进行pro规划'])), call('ask_user_question', 'a2', purposeArgs), ok('a2', emptyAnswer)], { route: 'plan', clarified: false, approved: false, purpose: 'none', channelBroken: false }],
  ['F26 目的答复未命中两词 → purpose 保持 none', [um(), call('ask_user_question', 'a1', routeArgs), ok('a1', answer(['进行pro规划'])), call('ask_user_question', 'a2', purposeArgs), ok('a2', answer(['别的词']))], { route: 'plan', clarified: false, approved: false, purpose: 'none', channelBroken: false }],
  ['F27 目的 ask 取消(ASK_CANCELLED) → route=none + purpose=none', [um(), call('ask_user_question', 'a1', routeArgs), ok('a1', answer(['进行pro规划'])), call('ask_user_question', 'a2', purposeArgs), err('a2', 'ASK_CANCELLED')], { route: 'none', clarified: false, approved: false, purpose: 'none', channelBroken: false }],
  ['F28 目的答复后接澄清答复 → purpose 保留且 clarified=true（目的答复不置 clarified 守门）', [um(), call('ask_user_question', 'a1', routeArgs), ok('a1', answer(['进行pro规划'])), call('ask_user_question', 'a2', purposeArgs), ok('a2', answer(['完善方案'])), call('ask_user_question', 'a3', clarifyArgs), ok('a3', answer(['方案A']))], { route: 'plan', clarified: true, approved: false, purpose: 'refine', channelBroken: false }],
  ['F29 完整阶段后重选「直接执行」→ 清理阶段状态', fullPlanApprovedEvents.concat([call('ask_user_question', 'fa5', routeArgs), ok('fa5', answer(['直接执行']))]), { route: 'direct', clarified: false, approved: false, purpose: 'none', channelBroken: false }],
  ['F30 完整阶段后重选「进行pro规划」→ 清理阶段状态', fullPlanApprovedEvents.concat([call('ask_user_question', 'fa5', routeArgs), ok('fa5', answer(['进行pro规划']))]), { route: 'plan', clarified: false, approved: false, purpose: 'none', channelBroken: false }],
  ['F31 完整阶段后重选「不同意」→ 清理阶段状态', fullPlanApprovedEvents.concat([call('ask_user_question', 'fa5', routeArgs), ok('fa5', answer(['不同意']))]), { route: 'none', clarified: false, approved: false, purpose: 'none', channelBroken: false }],
  ['F32 完整阶段后有效目的重选「重新规划」→ 清理 clarified/approved', fullPlanApprovedEvents.concat([call('ask_user_question', 'fa5', purposeArgs), ok('fa5', answer(['重新规划']))]), { route: 'plan', clarified: false, approved: false, purpose: 'redo', channelBroken: false }],
  ['F33 完整阶段后 ASK_CANCELLED → 五字段清理', fullPlanApprovedEvents.concat([call('ask_user_question', 'fa5', routeArgs), err('fa5', 'ASK_CANCELLED')]), { route: 'none', clarified: false, approved: false, purpose: 'none', channelBroken: false }],
  ['F34 完整阶段后新用户消息 → 默认态', fullPlanApprovedEvents.concat([um()]), { route: 'none', clarified: false, approved: false, purpose: 'none', channelBroken: false }],
  ['F35 完整阶段后 NO_PROVIDER → 保留阶段状态并逃生', fullPlanApprovedEvents.concat([call('ask_user_question', 'fa5', routeArgs), err('fa5', 'NO_PROVIDER')]), { route: 'plan', clarified: true, approved: true, purpose: 'refine', channelBroken: true }],
]
for (const [name, events, expected] of F) {
  check(name, deriveFlowState(events, gateRuntime), expected)
}

// ── GK 系列:三分法 gate ask 分类（categorizeGateAsk） ────────────────────
const wordRouteArgs = JSON.stringify({ questions: [{ id: 'q1', options: [{ label: '直接执行' }] }] })
const wordApproveArgs = JSON.stringify({ questions: [{ id: 'q1', options: [{ label: '同意执行' }] }] })
const twoWordRouteArgs = JSON.stringify({ questions: [{ id: 'q1', options: [{ label: '直接执行' }, { label: '进行pro规划' }] }] })
const GK = [
  ['GK1 标准三词路由 ask → standard', categorizeGateAsk(['直接执行', '进行pro规划', '不同意'], gateRuntime), 'standard'],
  ['GK2 标准三词批准 ask → standard', categorizeGateAsk(['同意执行', '转交pro规划', '不同意'], gateRuntime), 'standard'],
  ['GK3 单词路由 ask（只有「直接执行」）→ malformed', categorizeGateAsk(['直接执行'], gateRuntime), 'malformed'],
  ['GK4 两词路由 ask（缺「不同意」）→ malformed', categorizeGateAsk(['直接执行', '进行pro规划'], gateRuntime), 'malformed'],
  ['GK5 纯澄清 ask → ordinary', categorizeGateAsk(['方案A', '方案B'], gateRuntime), 'ordinary'],
  ['GK6 带 (Recommended) 后缀的路由 ask → standard', categorizeGateAsk(['直接执行 (Recommended)', '进行pro规划 (Recommended)', '不同意 (Recommended)'], gateRuntime), 'standard'],
  ['GK7 带（推荐）后缀的批准 ask → standard', categorizeGateAsk(['同意执行（推荐）', '转交pro规划（推荐）', '不同意（推荐）'], gateRuntime), 'standard'],
  ['GK8 带 (recommended) 小写后缀 → standard', categorizeGateAsk(['直接执行 (recommended)', '进行pro规划 (recommended)', '不同意 (recommended)'], gateRuntime), 'standard'],
  ['GK8b 无空格半角（推荐）后缀 → standard', categorizeGateAsk(['直接执行(推荐)', '进行pro规划(推荐)', '不同意(推荐)'], gateRuntime), 'standard'],
  ['GK9 非白名单变体（! 等额外字符）→ malformed', categorizeGateAsk(['直接执行!', '进行pro规划', '不同意'], gateRuntime), 'malformed'],
  ['GK10 方括号后缀 [推荐] → malformed', categorizeGateAsk(['直接执行 [推荐]', '进行pro规划 [推荐]', '不同意 [推荐]'], gateRuntime), 'malformed'],
  ['GK11 标准二词目的 ask → standard', categorizeGateAsk(['完善方案', '重新规划'], gateRuntime), 'standard'],
  ['GK12 单词目的 ask（只有「完善方案」）→ malformed', categorizeGateAsk(['完善方案'], gateRuntime), 'malformed'],
  ['GK13 带 (Recommended) 后缀的目的 ask → standard', categorizeGateAsk(['完善方案 (Recommended)', '重新规划 (Recommended)'], gateRuntime), 'standard'],
]
for (const [name, got, expected] of GK) check(name, got, expected)

// ── GM 系列:gate ask deny 文案（gateAskDenyReason） ──────────────────────
const GM = [
  ['GM1 单词路由 deny 文案含标准模板', gateAskDenyReason(['直接执行'], gateRuntime).includes('路由 ask 选项固定为') && gateAskDenyReason(['直接执行'], gateRuntime).includes('批准 ask 选项固定为'), true],
  ['GM2 单词路由 deny 文案含具体缺项', gateAskDenyReason(['直接执行'], gateRuntime).includes('进行pro规划') && gateAskDenyReason(['直接执行'], gateRuntime).includes('不同意'), true],
  ['GM3 非白名单变体 deny 不含「缺少：」且含推荐标记范围提示', !gateAskDenyReason(['直接执行!', '进行pro规划', '不同意'], gateRuntime).includes('缺少：') && gateAskDenyReason(['直接执行!', '进行pro规划', '不同意'], gateRuntime).includes('推荐标记仅限'), true],
  ['GM4 单词目的 deny 文案含目的模板与缺项', gateAskDenyReason(['完善方案'], gateRuntime).includes('目的 ask 选项固定为') && gateAskDenyReason(['完善方案'], gateRuntime).includes('当前目的 ask 缺少：重新规划'), true],
]
for (const [name, got, expected] of GM) check(name, got, expected)

// ── F 系列补充:单词副作用修复（deriveFlowState + askKindOfRelaxed） ──────
const F21 = [
  ['F21 单词路由 ask 答「直接执行」→ route=direct', [um(), call('ask_user_question', 'a1', wordRouteArgs), ok('a1', answer(['直接执行']))], { route: 'direct', clarified: false, approved: false, purpose: 'none', channelBroken: false }],
  ['F22 单词批准 ask 答「同意执行」→ approved=true', [um(), call('ask_user_question', 'a1', routeArgs), ok('a1', answer(['进行pro规划'])), call('ask_user_question', 'a2', clarifyArgs), ok('a2', answer(['方案A'])), call('ask_user_question', 'a3', wordApproveArgs), ok('a3', answer(['同意执行']))], { route: 'plan', clarified: false, approved: true, purpose: 'none', channelBroken: false }],
]
for (const [name, events, expected] of F21) {
  check(name, deriveFlowState(events, gateRuntime), expected)
}

// ── GL 系列:结构校验纯函数（validateGateAskStructure） ────────────────────
const glApproveQ1 = [{ id: 'q1', question: '请选择', options: [{ label: '同意执行' }, { label: '转交pro规划' }, { label: '不同意' }] }]
const GL = [
  ['GL1 路由 ask 恰好 1 个问题（缺第二问）→ 不通过，含「须至少 2 个问题」', (() => { const r = validateGateAskStructure('route', [{ id: 'q1', question: '请选择', options: [{ label: '直接执行' }, { label: '进行pro规划' }, { label: '不同意' }] }], gateRuntime); return r !== null && r.includes('须至少 2 个问题') })(), true],
  ['GL2 批准 ask 仅 1 个问题缺修改意见 → 不通过，含"修改意见"', validateGateAskStructure('approve', [{ id: 'q1', question: '请选择', options: [{ label: '同意执行' }, { label: '转交pro规划' }, { label: '不同意' }] }], gateRuntime) !== null && validateGateAskStructure('approve', [{ id: 'q1', question: '请选择', options: [{ label: '同意执行' }, { label: '转交pro规划' }, { label: '不同意' }] }], gateRuntime).includes('修改意见'), true],
  ['GL3 批准第二问带非空 options → 拒（含修改意见/纯文本/不得提供选项）', (() => { const r = validateGateAskStructure('approve', [...glApproveQ1, { id: 'q2', question: '修改意见', options: [{ label: '无' }] }], gateRuntime); return r !== null && r.includes('修改意见') && r.includes('纯文本') && r.includes('不得提供选项') })(), true],
  ['GL4 批准第二问 options:[] → 通过（空数组=纯文本框）', validateGateAskStructure('approve', [...glApproveQ1, { id: 'q2', question: '修改意见', options: [] }], gateRuntime), null],
  ['GL5 批准第二问无 options 字段 → 通过', validateGateAskStructure('approve', [...glApproveQ1, { id: 'q2', question: '修改意见' }], gateRuntime), null],
  ['GL6 批准第三问带 options → 拒（第二问起全部校验）', (() => { const r = validateGateAskStructure('approve', [...glApproveQ1, { id: 'q2', question: '修改意见' }, { id: 'q3', question: '补充', options: [{ label: 'x' }] }], gateRuntime); return r !== null && r.includes('纯文本') })(), true],
  ['GL7 路由 2 问（第二问纯文本补充要求）→ 通过', validateGateAskStructure('route', [{ id: 'q1', question: '请选择', options: [{ label: '直接执行' }, { label: '进行pro规划' }, { label: '不同意' }] }, { id: 'q2', question: '补充要求' }], gateRuntime), null],
  ['GL7b 路由 2 问第二问带非空 options → 拒（含「补充要求」「纯文本」）', (() => { const r = validateGateAskStructure('route', [{ id: 'q1', question: '请选择', options: [{ label: '直接执行' }, { label: '进行pro规划' }, { label: '不同意' }] }, { id: 'q2', question: '补充要求', options: [{ label: '选项A' }] }], gateRuntime); return r !== null && r.includes('补充要求') && r.includes('纯文本') })(), true],
  ['GL8 目的 ask 恰好 1 个问题 → 通过', validateGateAskStructure('purpose', [{ id: 'q1', question: '请选择', options: [{ label: '完善方案' }, { label: '重新规划' }] }], gateRuntime), null],
  ['GL9 目的 ask 2 问 → 拒含「目的 ask 结构错误」与「须恰好 1 个问题」', (() => { const r = validateGateAskStructure('purpose', [{ id: 'q1', question: '请选择', options: [{ label: '完善方案' }, { label: '重新规划' }] }, { id: 'q2', question: '补充' }], gateRuntime); return r !== null && r.includes('目的 ask 结构错误') && r.includes('须恰好 1 个问题') })(), true],
]
for (const [name, got, expected] of GL) check(name, got, expected)


// ── SW 系列:真实工具集判定纯函数（schemasHasWriteTools / schemasHasTool，方案B） ──
const SW = [
  ['SW1 schemasHasWriteTools 对象元素含 write → true', schemasHasWriteTools([{ name: 'read' }, { name: 'write' }]), true],
  ['SW2 schemasHasWriteTools 无写（pwsh）→ false', schemasHasWriteTools([{ name: 'read' }, { name: 'pwsh' }]), false],
  ['SW3 schemasHasWriteTools 字符串元素 write → true', schemasHasWriteTools(['write']), true],
  ['SW4 schemasHasWriteTools([]) → false', schemasHasWriteTools([]), false],
  ['SW5 schemasHasWriteTools(undefined) → false', schemasHasWriteTools(undefined), false],
  ['SW6 schemasHasTool 含 save_probe → true', schemasHasTool([{ name: 'save_probe' }], 'save_probe'), true],
  ['SW7 schemasHasTool 无 save_probe → false', schemasHasTool([{ name: 'read' }], 'save_probe'), false],
  ['SW8 schemasHasTool(undefined, save_probe) → false', schemasHasTool(undefined, 'save_probe'), false],
]
for (const [name, got, expected] of SW) check(name, got, expected)

// ── C 系列:toolCallCount(探查硬上限) ───────────────────────────────────
const C = [
  ['C1 成功配对计数（skip 空）', [call('read', 'c1'), ok('c1', 'r'), call('glob', 'c2'), ok('c2', 'r'), call('pwsh', 'c3'), ok('c3', 'r'), call('save_plan', 'c4'), ok('c4', 'r')], new Set([]), 4],
  ['C2 skip save_plan', [call('read', 'c1'), ok('c1', 'r'), call('glob', 'c2'), ok('c2', 'r'), call('pwsh', 'c3'), ok('c3', 'r'), call('save_plan', 'c4'), ok('c4', 'r')], new Set(['save_plan']), 3],
  ['C3 无事件 → 0', [], new Set([]), 0],
  ['C4 call 无 ok 配对不计', [call('read', 'c1'), call('glob', 'c2')], new Set([]), 0],
  ['C5 err 结果不计', [call('read', 'c1'), err('c1', 'GATED'), call('glob', 'c2'), ok('c2', 'r')], new Set([]), 1],
  ['C6 skip 命中且成功配对也不计', [call('save_plan', 'c1'), ok('c1', 'r')], new Set(['save_plan']), 0],
  ['C7 真实 deny 形状（块级 isError、无 data.error）不计', [call('read', 'c1'), deny('c1', 'gated'), call('glob', 'c2'), ok('c2', 'r')], new Set([]), 1],
]
for (const [name, events, skip, expected] of C) {
  check(name, toolCallCount(events, skip), expected)
}

// ── CU 系列:toolCallsSinceUser(主会话转达锚点计数,v0.1.4) ─────────────
const umk = (kind) => ({ type: 'user/message', data: { source: { kind } } })
const CU = [
  ['CU1 无用户消息 → 与全量计数同口径', [call('read', 'c1'), ok('c1', 'r'), call('glob', 'c2'), ok('c2', 'r')], new Set([]), 2],
  ['CU2 kind=user 锚点(初始任务) → 只计其后', [call('read', 'a1'), ok('a1', 'r'), umk('user'), call('glob', 'b1'), ok('b1', 'r'), call('pwsh', 'b2'), ok('b2', 'r')], new Set([]), 2],
  ['CU3 kind=agent-message 锚点(续轮转达) → 重置只计其后', [umk('user'), call('read', 'a1'), ok('a1', 'r'), umk('agent-message'), call('glob', 'b1'), ok('b1', 'r')], new Set([]), 1],
  ['CU4 kind=plugin(运行时快照) → 不构成锚点', [umk('user'), call('read', 'a1'), ok('a1', 'r'), umk('plugin'), call('glob', 'b1'), ok('b1', 'r')], new Set([]), 2],
  ['CU5 多个 agent-message → 最后一个为锚', [umk('user'), call('read', 'a1'), ok('a1', 'r'), umk('agent-message'), call('glob', 'b1'), ok('b1', 'r'), umk('agent-message'), call('pwsh', 'c1'), ok('c1', 'r')], new Set([]), 1],
  ['CU6 锚点后 save_plan 跳过仍生效', [umk('user'), call('read', 'a1'), ok('a1', 'r'), call('save_plan', 's1'), ok('s1', 'r'), call('glob', 'b1'), ok('b1', 'r')], new Set(['save_plan']), 2],
  ['CU7 锚点后无调用 → 0(授权即重置)', [umk('user'), call('read', 'a1'), ok('a1', 'r'), umk('agent-message')], new Set([]), 0],
  ['CU8 kind=agent-instructions(系统指令) → 不构成锚点', [umk('user'), call('read', 'a1'), ok('a1', 'r'), umk('agent-instructions'), call('glob', 'b1'), ok('b1', 'r')], new Set([]), 2],
  ['CU9 被拒不烧预算（真实 deny 形状）', [umk('user'), call('read', 'a1'), deny('a1', 'gated'), call('write', 'w1'), deny('w1', 'gated')], new Set([]), 0],
]
for (const [name, events, skip, expected] of CU) {
  check(name, toolCallsSinceUser(events, skip), expected)
}

// ── AP 系列:withPlannerPromptSuffix(规划任务附加指令拼接,v0.1.5) ───────
const msgOf = (kind, text) => ({ source: { kind }, content: [{ type: 'text', text }] })
const AP = [
  ['AP1 空后缀 → 原样', msgOf('user', '任务A'), '', '任务A'],
  ['AP2 kind=user 单文本 → 拼接', msgOf('user', '任务A'), '后缀X', '任务A\n后缀X'],
  ['AP3 kind=agent-message(续轮转达) → 拼接', msgOf('agent-message', '意见'), '后缀X', '意见\n后缀X'],
  ['AP4 kind=plugin(运行时快照) → 不拼', msgOf('plugin', '快照'), '后缀X', '快照'],
  ['AP5 多块内容 → 拼入第一块（末尾补换行）', { source: { kind: 'user' }, content: [{ type: 'text', text: 'a' }, { type: 'text', text: 'b' }] }, '后缀X', 'a\n后缀X\n'],
  ['AP6 已含后缀 → 不重复拼', msgOf('user', '任务A\n\n后缀X'), '后缀X', '任务A\n\n后缀X'],
  ['AP7 缺 source → 原样', { content: [{ type: 'text', text: '任务A' }] }, '后缀X', '任务A'],
  ['AP8 kind=agent-message 已含后缀 → 不重复拼', msgOf('agent-message', '意见\n\n后缀X'), '后缀X', '意见\n\n后缀X'],
  ['AP9 kind=agent-message 多块 → 拼入第一块（末尾补换行）', { source: { kind: 'agent-message' }, content: [{ type: 'text', text: 'a' }, { type: 'text', text: 'b' }] }, '后缀X', 'a\n后缀X\n'],
  ['AP10 kind=agent-instructions → 不拼', msgOf('agent-instructions', '指令'), '后缀X', '指令'],
]
for (const [name, message, suffix, expected] of AP) {
  const got = withPlannerPromptSuffix(message, suffix)
  const text = got !== undefined && got.content !== undefined && got.content[0] !== undefined ? got.content[0].text : undefined
  check(name, text, expected)
}
check('AP11 双块任务+DSH英文块 → 拼入第一块、第二块原样', JSON.stringify(withPlannerPromptSuffix({ source: { kind: 'agent-message' }, content: [{ type: 'text', text: '任务' }, { type: 'text', text: 'Your parent agent id is session-xxx.' }] }, '后缀X')), JSON.stringify({ source: { kind: 'agent-message' }, content: [{ type: 'text', text: '任务\n后缀X\n' }, { type: 'text', text: 'Your parent agent id is session-xxx.' }] }))

// ── BN 系列:withBudgetNotice / budgetNoticeText（预算告知拼接,v0.1.6） ──
const NOTICE18 = budgetNoticeText(18)
const NOTICE12 = budgetNoticeText(12)
const BN = [
  ['BN1 user 单文本 → 拼接告知', withBudgetNotice(msgOf('user', '任务A'), NOTICE18), '任务A\n' + NOTICE18],
  ['BN2 agent-message 单文本 → 拼接告知', withBudgetNotice(msgOf('agent-message', '意见'), NOTICE18), '意见\n' + NOTICE18],
  ['BN3 kind=plugin → 原样', withBudgetNotice(msgOf('plugin', '快照'), NOTICE18), '快照'],
  ['BN4 多块内容 → 拼入第一块', withBudgetNotice({ source: { kind: 'user' }, content: [{ type: 'text', text: 'a' }, { type: 'text', text: 'b' }] }, NOTICE18), 'a\n' + NOTICE18],
  ['BN5 已含告知 → 不重复拼', withBudgetNotice(msgOf('user', '任务A\n\n' + NOTICE18), NOTICE18), '任务A\n\n' + NOTICE18],
  ['BN6 缺 source → 原样', withBudgetNotice({ content: [{ type: 'text', text: '任务A' }] }, NOTICE18), '任务A'],
]
for (const [name, got, expected] of BN) {
  const text = got !== undefined && got.content !== undefined && got.content[0] !== undefined ? got.content[0].text : undefined
  check(name, text, expected)
}
check('BN9 双块第一块已含告知 → 不重复拼', JSON.stringify(withBudgetNotice({ source: { kind: 'user' }, content: [{ type: 'text', text: 'a\n\n' + NOTICE18 }, { type: 'text', text: 'b' }] }, NOTICE18)), JSON.stringify({ source: { kind: 'user' }, content: [{ type: 'text', text: 'a\n\n' + NOTICE18 }, { type: 'text', text: 'b' }] }))
check('BN10 content 无 text 块 → 原样', JSON.stringify(withBudgetNotice({ source: { kind: 'user' }, content: [{ type: 'image' }] }, NOTICE18)), JSON.stringify({ source: { kind: 'user' }, content: [{ type: 'image' }] }))
// T5：预算告知第 2 句由「优先用 subagent_probe 并行多派探查者」改为「自行 read/glob/grep
// 分批核对 + 缺信息走申请继续探查」（planner 不得委派探查者），BN7/BN8 全文等值锁定新文案。
check('BN7 budgetNoticeText(18) 全文等值', NOTICE18, '本轮探查预算上限为 18 次工具调用。探查时 ≥ 2 个独立方向自行 read/glob/grep 分批核对；缺信息时输出「申请继续探查：<待查项> — <原因>」交主会话委派探查者。预算耗尽时输出「申请继续探查：<待查项> — <原因>」，主会话将探查待查项并转达线索文件路径，你读取线索继续工作。探查完成后直接调用 save_plan 落盘（系统会自动检测未探查项）')
check('BN8 budgetNoticeText(12) 全文等值', NOTICE12, '本轮探查预算上限为 12 次工具调用。探查时 ≥ 2 个独立方向自行 read/glob/grep 分批核对；缺信息时输出「申请继续探查：<待查项> — <原因>」交主会话委派探查者。预算耗尽时输出「申请继续探查：<待查项> — <原因>」，主会话将探查待查项并转达线索文件路径，你读取线索继续工作。探查完成后直接调用 save_plan 落盘（系统会自动检测未探查项）')
check('BN7b 新文案含「自行 read/glob/grep 分批核对」，不再含「建议优先用 subagent_probe 并行多派探查者」', NOTICE18.includes('自行 read/glob/grep 分批核对') && !NOTICE18.includes('建议优先用 subagent_probe 并行多派探查者') && NOTICE18.includes('申请继续探查'), true)

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
  ['BR8 无事件 → false', budgetReminderSent([], MARKER), false],
  ['BR9 锚点后含 marker → true', budgetReminderSent([umk('user'), remEvent('本轮探查预算还剩 3 次，请收紧探查、规划收尾，未查项记入待确认假设清单')], MARKER), true],
  ['BR10 marker 在锚点前 → false(新一轮重置)', budgetReminderSent([remEvent('本轮探查预算还剩 3 次，请收紧探查、规划收尾，未查项记入待确认假设清单'), umk('agent-message')], MARKER), false],
  ['BR11 锚点后无 marker → false', budgetReminderSent([umk('user'), umk('plugin')], MARKER), false],
  ['BR12 budget=3 → 空串(不提示)', budgetReminderText(3, 3, 3), ''],
  ['BR13 budget=4 remaining=3 → 提示', budgetReminderText(3, 4, 3), '本轮探查预算还剩 3 次'],
  ['BR14 budget=3 remaining=2 → 空串(全程不提示)', budgetReminderText(2, 3, 3), ''],
]
for (const [name, got, expected] of BR) check(name, got, expected)

// BR7（修正，不降级）：budgetReminderMessage 现经宿主 createUserMessage 构造，字段集 = {source, content, role:'user', id}。
// 原条目只断言 {source, content}，在构造器注入 role/id 后必然失败；此处拆为 4 条断言，覆盖全部字段。
const msg = budgetReminderMessage(REMIND3)
check('BR7a budgetReminderMessage source/content 深等值', JSON.stringify({ source: msg.source, content: msg.content }), JSON.stringify({ source: { kind: 'plugin', plugin: 'dsh-extra-plan' }, content: [{ type: 'text', text: REMIND3 }] }))
check('BR7b role 恒为 user', msg.role, 'user')
check('BR7c id 为非空字符串', typeof msg.id === 'string' && msg.id.length > 0, true)
check('BR7d 两次调用 id 唯一', budgetReminderMessage(REMIND3).id !== msg.id, true)

// ── DR 系列:deny 提示模板与闸门词表同源（v0.1.9） ─────────────────────
const DR = [
  ['DR1 routeDenyReason 含三个路由词', routeDenyReason('write/edit', undefined, gateRuntime).includes(ROUTE_WORD_DIRECT) && routeDenyReason('write/edit', undefined, gateRuntime).includes(ROUTE_WORD_PLAN) && routeDenyReason('write/edit', undefined, gateRuntime).includes(ROUTE_WORD_DISAGREE), true],
  ['DR2 planDenyReason 含三个路由词', planDenyReason('subagent_plan', undefined, gateRuntime).includes(ROUTE_WORD_DIRECT) && planDenyReason('subagent_plan', undefined, gateRuntime).includes(ROUTE_WORD_PLAN) && planDenyReason('subagent_plan', undefined, gateRuntime).includes(ROUTE_WORD_DISAGREE), true],
  ['DR3 approvalDenyReason 含三个批准词', approvalDenyReason('subagent', undefined, gateRuntime).includes(APPROVAL_WORD_APPROVE) && approvalDenyReason('subagent', undefined, gateRuntime).includes(APPROVAL_WORD_REPLAN) && approvalDenyReason('subagent', undefined, gateRuntime).includes(ROUTE_WORD_DISAGREE), true],
  ['DR4 approvalDenyReason 不误用路由词集合', !approvalDenyReason('subagent', undefined, gateRuntime).includes(ROUTE_WORD_DIRECT), true],
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

// ── AR 系列:createAgentRuntime per-apply 状态、快照与同步 fold ─────────────
const runtimeDescriptor = { type: 'subagent/descriptor', data: { mode: 'continuable' } }
const runtimeEvents = []
const runtimeParentIds = new Set(['runtime-parent'])
const runtimeFoldRoles = []
const runtimeFloorWrites = []
const runtimeWarnings = []
const runtimeChild = {
  session: { header: { id: 'runtime-child', origin: 'subagent', delegationDepth: 1, parentSession: 'runtime-parent' }, snapshotEvents: () => runtimeEvents, append: (...args) => runtimeFloorWrites.push(args) },
  ctx: undefined,
}
const runtime = agentRuntime.createAgentRuntime({
  getAgents: () => ({ get: (id) => runtimeParentIds.has(id) ? {} : undefined }),
  sandboxPolicy: { overrideOf: () => 'read-only', defaultMode: 'workspace-write' },
  foldUsage: (_agent, role) => runtimeFoldRoles.push(role),
  warn: (message) => runtimeWarnings.push(message),
})
check('AR1 无 descriptor 不缓存 false', runtime.isPlannerChild(runtimeChild, []), false)
runtimeEvents.push(runtimeDescriptor)
check('AR2 后补 descriptor 可纠正为 planner=true', runtime.isPlannerChild(runtimeChild, runtimeEvents), true)
let explicitSnapshotCalls = 0
const explicitSnapshotAgent = {
  session: { header: { id: 'runtime-explicit', origin: 'subagent', delegationDepth: 1, parentSession: 'runtime-parent' }, snapshotEvents: () => { explicitSnapshotCalls += 1; return [runtimeDescriptor] } },
  ctx: undefined,
}
const explicitEvents = [runtimeDescriptor]
runtime.isPlannerChild(explicitSnapshotAgent, explicitEvents)
runtime.isChild(explicitSnapshotAgent, explicitEvents)
check('AR3 显式 events 快照复用且不读取 session.snapshotEvents', explicitSnapshotCalls, 0)
check('AR4 缺失 agent/ctx/tools/schema 降级为 undefined', runtime.toolSchemasOf(undefined) === undefined && runtime.toolSchemasOf({}) === undefined && runtime.toolSchemasOf({ ctx: { get: () => ({}) } }) === undefined, true)
let schemaCalls = 0
const runtimeSchemaAgent = { ctx: { get: (name) => name === 'tools' ? { schemas: () => { schemaCalls += 1; return [{ name: 'read' }] } } : undefined } }
check('AR5 toolSchemasOf 成功返回数组且不缓存', JSON.stringify(runtime.toolSchemasOf(runtimeSchemaAgent)), JSON.stringify([{ name: 'read' }]))
runtime.toolSchemasOf(runtimeSchemaAgent)
check('AR5b toolSchemasOf 每次重新读取 schemas', schemaCalls, 2)
check('AR6 childBaseline 同步 fold 后追加 workspace-write floor', runtime.childBaseline(runtimeChild, runtimeEvents) === true && runtimeFoldRoles.at(-1) === 'planner' && runtimeFloorWrites.length === 1, true)
runtimeParentIds.clear()
check('AR7 usageRoleOf 优先缓存，registry 脱离后仍为 planner', runtime.usageRoleOf(runtimeChild), 'planner')
const runtimeMain = { session: { header: { id: 'runtime-main' }, snapshotEvents: () => [] }, ctx: undefined }
runtime.childBaseline(runtimeMain, [])
check('AR8 main baseline 同步 fold 且不追加 floor', runtimeFoldRoles.at(-1) === 'main' && runtimeFloorWrites.length === 1 && runtimeWarnings.length === 0, true)

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
  ['PR23 evidence 151 条 → 拒', { ...validProbe(), evidence: Array.from({ length: PROBE_LIMITS.maxEvidenceEntries + 1 }, (_, i) => ({ path: EXISTING, value: `v${i}` })) }, 'reject'],
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
  ['PR34 evidence[0].text 1000 字 → 过', { ...validProbe(), evidence: [{ path: EXISTING, text: 't'.repeat(PROBE_LIMITS.maxEvidenceTextLen) }] }, 'pass'],
  ['PR35 evidence[0].text 1001 字 → 拒', { ...validProbe(), evidence: [{ path: EXISTING, text: 't'.repeat(PROBE_LIMITS.maxEvidenceTextLen + 1) }] }, 'reject'],
]
for (const [name, args, mode, substr] of PR) {
  const got = validateProbe(args, HERE)
  const okResult = mode === 'pass' ? got === null : mode === 'reject' ? typeof got === 'string' && got.length > 0 : mode === 'reject-all' ? typeof got === 'string' && Array.isArray(substr) && substr.every((s) => got.includes(s)) : typeof got === 'string' && got.includes(substr)
  if (okResult) { pass += 1 } else { fail += 1 }
  console.log(`${okResult ? 'PASS' : 'FAIL'}  ${name}  (实际 ${JSON.stringify(got)})`)
}

// ── SCHEMA 系列：save_probe 注册后核验实际动态描述（不复制限制常量） ────────
const schemaRegistration = { listeners: {}, registered: [] }
const schemaTools = { register: (definition) => schemaRegistration.registered.push(definition) }
const schemaCtx = {
  get: () => undefined,
  on(name, fn) {
    if (schemaRegistration.listeners[name] === undefined) schemaRegistration.listeners[name] = []
    schemaRegistration.listeners[name].push(fn)
  },
}
applyPlugin(schemaCtx, { anchoredBootstrap: false })
const schemaAgent = {
  session: { header: { id: 'schema-main' }, snapshotEvents: () => [] },
  ctx: { get: (name) => name === 'tools' ? schemaTools : undefined },
}
// 0.1.7 换代：agent/session-start 已删除，启动注册改由 agent/created（serial）承担。
schemaRegistration.listeners['agent/created'][0]({ agent: schemaAgent, source: 'startup' })
const schemaSaveProbe = schemaRegistration.registered.find((definition) => definition.name === 'save_probe')
const schemaDescription = schemaSaveProbe === undefined ? '' : String(schemaSaveProbe.description || '')
const evidenceDescription = schemaSaveProbe === undefined || schemaSaveProbe.parameters === undefined || schemaSaveProbe.parameters.properties === undefined || schemaSaveProbe.parameters.properties.evidence === undefined ? '' : String(schemaSaveProbe.parameters.properties.evidence.description || '')
check('SCHEMA1 实际 save_probe 顶层描述含动态 evidence 条数/正文上限', schemaDescription.includes(`evidence ≤${PROBE_LIMITS.maxEvidenceEntries} 条`) && schemaDescription.includes(`evidence JSON 总量 ≤${PROBE_LIMITS.maxEvidenceTotalChars}`), true)
check('SCHEMA2 实际 save_probe evidence schema 含动态 text 长度上限', evidenceDescription.includes(`至多 ${PROBE_LIMITS.maxEvidenceEntries} 条`) && evidenceDescription.includes(`text ≤${PROBE_LIMITS.maxEvidenceTextLen} 字`), true)

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

// ── PM 系列:decidePlannerModelUse（T2 静默降级判定纯函数） ─────────────────
// provider 目录只作降级启发式：目录成功且清单非空且未命中 → 静默降级（继承主会话模型）；
// 清单为空 / 查询抛错（NO_ADAPTER）/ 取不到 llm → 保守沿用（advisory 语义，防误杀
// 未实现发现能力的适配器）；provider 无值与 plannerModel='' → 沿用/继承，均不落诊断。
const CAT_OK = (ids) => ({ kind: 'ok', ids })
const PM = [
  ['PM1 命中（目录非空且含该模型）→ 用 plannerModel', decidePlannerModelUse('deepseek-v4-pro', 'deepseek-official', CAT_OK(['deepseek-flash', 'deepseek-v4-pro'])), { use: true, degraded: false, diag: null, reason: 'catalog-hit' }],
  ['PM2 未命中+清单非空 → 不覆盖（静默降级 inherit-parent）', decidePlannerModelUse('gpt-5.6-terra', 'deepseek-official', CAT_OK(['deepseek-flash', 'deepseek-v4-pro'])), { use: false, degraded: true, diag: 'inherit-parent', reason: 'catalog-miss' }],
  ['PM3 清单空 → 沿用（空清单≠不可用）', decidePlannerModelUse('gpt-5.6-terra', 'deepseek-official', { kind: 'empty' }), { use: true, degraded: false, diag: 'keep-planner-model', reason: 'catalog-empty' }],
  ['PM4 目录查询抛错（NO_ADAPTER）→ 沿用', decidePlannerModelUse('gpt-5.6-terra', 'deepseek-official', { kind: 'error' }), { use: true, degraded: false, diag: 'keep-planner-model', reason: 'catalog-error' }],
  ['PM4b 取不到 llm 服务 → 沿用', decidePlannerModelUse('gpt-5.6-terra', 'deepseek-official', { kind: 'no-llm' }), { use: true, degraded: false, diag: 'keep-planner-model', reason: 'catalog-unavailable' }],
  ['PM5 provider 无值（父会话空闲）→ 沿用且不落诊断', decidePlannerModelUse('deepseek-v4-pro', undefined, { kind: 'no-llm' }), { use: true, degraded: false, diag: null, reason: 'no-provider' }],
  ['PM6 plannerModel 空串（T4 置空=继承主会话）→ 不覆盖', decidePlannerModelUse('', 'deepseek-official', CAT_OK(['deepseek-v4-pro'])), { use: false, degraded: false, diag: null, reason: 'empty-config' }],
]
for (const [name, got, expected] of PM) check(name, got, expected)

// ── PLANNER 系列：fake AgentLoop 边界 + True/False LLM 分流 ───────────────
function deferredPlanner() {
  let resolve
  let reject
  const promise = new Promise((ok, fail) => { resolve = ok; reject = fail })
  return { promise, resolve, reject }
}

function plannerTick() {
  return new Promise((resolve) => setTimeout(resolve, 0))
}

function plannerRequestShape(call) {
  const request = call.request
  const message = request !== null && typeof request === 'object' && Array.isArray(request.messages) ? request.messages[0] : undefined
  const forbidden = ['system', 'tools', 'sessionId', 'purpose']
  return request !== null && typeof request === 'object'
    && request.provider === call.provider
    && request.model === call.model
    && request.maxTokens === 1
    && forbidden.every((key) => !Object.prototype.hasOwnProperty.call(request, key))
    && Array.isArray(request.messages) && request.messages.length === 1
    && message !== undefined && message.role === 'user'
    && message.source !== undefined && message.source.kind === 'plugin' && message.source.plugin === 'dsh-extra-plan'
    && Array.isArray(message.content) && message.content.length === 1
    && message.content[0].type === 'text' && message.content[0].text === 'OK'
}

function makePlannerFake(spec, timeline) {
  const state = { listProviders: 0, listModels: [], prepareCalls: [], streamCalls: [] }
  const providers = Array.isArray(spec.providers) ? spec.providers : []
  const catalogs = spec.catalogs || {}
  const behaviors = spec.behaviors || {}
  const behaviorFor = (provider, model) => behaviors[provider + '/' + model] || behaviors[provider] || {}
  const llm = {
    listProviders() {
      state.listProviders += 1
      timeline.push('listProviders')
      return Promise.resolve(providers)
    },
    listModels(provider) {
      state.listModels.push(provider)
      timeline.push('listModels:' + provider)
      const catalog = catalogs[provider]
      if (catalog === 'reject') return Promise.reject(new Error('synthetic listModels failure: ' + provider))
      if (catalog === 'timeout') return new Promise(() => {})
      return Promise.resolve(Array.isArray(catalog) ? catalog : [])
    },
    prepareCall(config, signal) {
      const provider = config.provider
      const model = config.model
      const behavior = behaviorFor(provider, model)
      state.prepareCalls.push({ provider, model, config, signal })
      timeline.push('probe-prepare:' + provider + '/' + model)
      if (behavior.prepare === 'reject') return Promise.reject(new Error('synthetic prepare failure: ' + provider + '/' + model))
      const preparedConfig = { ...config, ...(behavior.preparedConfig || {}) }
      return Promise.resolve({
        config: preparedConfig,
        stream(request) {
          state.streamCalls.push({ provider, model, request, signal })
          timeline.push('probe-stream:' + provider + '/' + model)
          if (behavior.stream === 'throw') throw new Error('synthetic stream failure: ' + provider + '/' + model)
          if (behavior.stream === 'timeout') return (async function* () { await new Promise(() => {}) })()
          return (async function* () {
            if (behavior.gate !== undefined) await behavior.gate.promise
            if (behavior.finish === 'none') {
              yield { type: 'text-delta', index: 0, text: 'OK' }
              return
            }
            yield { type: 'block-start', index: 0, blockType: 'text' }
            yield { type: 'text-delta', index: 0, text: 'OK' }
            yield { type: 'block-end', index: 0, block: { type: 'text', text: 'OK' } }
            timeline.push('probe-finish:' + provider + '/' + model)
            const kind = behavior.finish || 'stop'
            const reason = kind === 'error' || kind === 'aborted' ? { kind, failure: { message: 'synthetic ' + kind, code: 'SYNTHETIC' } } : { kind }
            yield { type: 'finish', reason }
          })()
        },
      })
    },
  }
  return { llm, state }
}

function makePlannerHarness(options = {}) {
  const timeline = options.timeline || []
  const parentConfig = options.parentConfig === undefined
    ? { provider: 'p-parent', model: 'parent-model', maxTokens: 512, reasoningEffort: 'low' }
    : options.parentConfig
  const parent = { session: { header: { id: 'parent-id' }, requestHeader: () => ({ config: parentConfig }) } }
  const agent = {
    session: {
      header: { id: 'planner-id', origin: 'subagent', delegationDepth: 1, parentSession: 'parent-id' },
      snapshotEvents: () => [{ type: 'subagent/descriptor', data: { mode: 'continuable' } }],
    },
  }
  const listeners = {}
  const ctx = {
    get(name) {
      if (name === 'agents') return { get: (id) => id === 'parent-id' ? parent : undefined }
      if (name === 'llm') return options.llm
      return undefined
    },
    on(name, fn) {
      if (listeners[name] === undefined) listeners[name] = []
      listeners[name].push(fn)
    },
  }
  const config = {
    anchoredBootstrap: false,
    plannerModel: options.plannerModel === undefined ? 'planner-model' : options.plannerModel,
    otherAgentModel: options.otherAgentModel === undefined ? '' : options.otherAgentModel,
  }
  if (Object.prototype.hasOwnProperty.call(options, 'crossProviderPlannerModel')) config.crossProviderPlannerModel = options.crossProviderPlannerModel
  applyPlugin(ctx, config)
  return { agent, parent, listeners, timeline }
}

async function invokePlanner(harness, signal) {
  const listener = harness.listeners['agent/request']
  if (!Array.isArray(listener) || listener.length === 0) throw new Error('agent/request 监听器未注册')
  return listener[0]({ agent: harness.agent, turn: 1, step: 1, signal }, async () => {
    harness.timeline.push('agent/request-next')
    return { provider: 'upstream', model: 'upstream-model', maxTokens: 99 }
  })
}

async function invokePlannerMarked(harness, signal) {
  const result = await invokePlanner(harness, signal)
  harness.timeline.push('selection-return')
  return result
}

function markActualPlanner(harness) {
  harness.timeline.push('actual-prepare')
  harness.timeline.push('actual-stream')
}

async function withFastPlannerDeadline(task) {
  const originalSetTimeout = globalThis.setTimeout
  const originalClearTimeout = globalThis.clearTimeout
  const active = new Set()
  globalThis.setTimeout = (callback, delay, ...args) => {
    let handle
    const actualDelay = delay === PLANNER_PROBE_TIMEOUT_MS ? 1 : delay
    handle = originalSetTimeout(() => { active.delete(handle); callback(...args) }, actualDelay)
    active.add(handle)
    return handle
  }
  globalThis.clearTimeout = (handle) => {
    active.delete(handle)
    return originalClearTimeout(handle)
  }
  try {
    return await task(active)
  } finally {
    globalThis.setTimeout = originalSetTimeout
    globalThis.clearTimeout = originalClearTimeout
    for (const handle of active) originalClearTimeout(handle)
    active.clear()
  }
}

const plannerSignal = () => new AbortController().signal
const plannerCandidate = (id, name) => ({ id, name })
const plannerModelCatalog = [{ id: 'planner-model', name: 'Planner Model' }]
const PLANNER = [
  ['PL1 排序普通 name/id、主 provider 倒数第二、官方最后', () => {
    const sorted = sortPlannerCandidates([
      plannerCandidate('deepseek-official', 'DeepSeek Official'),
      plannerCandidate('p-parent', 'Parent'),
      plannerCandidate('p-z', 'Zeta'),
      plannerCandidate('p-a', 'Alpha'),
      plannerCandidate('p-a2', 'Alpha'),
    ], 'p-parent')
    return sorted.map((item) => item.id)
  }, ['p-a', 'p-a2', 'p-z', 'p-parent', 'deepseek-official']],
  ['PL2 child 可先创建/等待，全部 probe finish 后才 selection/actual 且选择非首个成功者（探针并发上限 5）', async () => {
    const timeline = ['child-created', 'child-wait']
    const gates = { 'p-z': deferredPlanner(), 'p-a': deferredPlanner(), 'p-parent': deferredPlanner(), 'deepseek-official': deferredPlanner() }
    const behaviors = {}
    for (const id of Object.keys(gates)) behaviors[id + '/planner-model'] = { gate: gates[id] }
    const fake = makePlannerFake({
      providers: [plannerCandidate('p-z', 'Zeta'), plannerCandidate('p-a', 'Alpha'), plannerCandidate('p-parent', 'Parent'), plannerCandidate('deepseek-official', 'DeepSeek Official')],
      catalogs: { 'p-z': plannerModelCatalog, 'p-a': plannerModelCatalog, 'p-parent': plannerModelCatalog, 'deepseek-official': plannerModelCatalog },
      behaviors,
    }, timeline)
    const harness = makePlannerHarness({ llm: fake.llm, timeline, crossProviderPlannerModel: true })
    const pending = invokePlannerMarked(harness, plannerSignal())
    await plannerTick()
    const firstGateStarted = timeline.includes('probe-stream:p-z/planner-model')
    const noEarlySelection = !timeline.includes('selection-return') && !timeline.includes('actual-prepare') && !timeline.includes('actual-stream')
    for (const id of ['p-z', 'p-a', 'p-parent', 'deepseek-official']) {
      gates[id].resolve()
      await plannerTick()
    }
    const result = await pending
    const selectionIndex = timeline.indexOf('selection-return')
    const finishIndexes = timeline.filter((item) => item.startsWith('probe-finish:')).map((item) => timeline.indexOf(item))
    const allFinishedBeforeSelection = finishIndexes.length === 4 && finishIndexes.every((index) => index < selectionIndex)
    const serialModels = fake.state.listModels.join('|') === 'p-z|p-a|p-parent|deepseek-official'
    const shapes = fake.state.streamCalls.length === 4 && fake.state.streamCalls.every(plannerRequestShape) && fake.state.prepareCalls.every((prepare) => Object.keys(prepare.config).join('|') === 'provider|model|maxTokens' && fake.state.streamCalls.some((stream) => stream.provider === prepare.provider && stream.model === prepare.model && stream.signal === prepare.signal))
    markActualPlanner(harness)
    return { result: { provider: result.provider, model: result.model }, firstGateStarted, noEarlySelection, allFinishedBeforeSelection, serialModels, shapes, actualAfterSelection: timeline.indexOf('actual-prepare') > selectionIndex && timeline.indexOf('actual-stream') > selectionIndex }
  }, { result: { provider: 'p-a', model: 'planner-model' }, firstGateStarted: true, noEarlySelection: true, allFinishedBeforeSelection: true, serialModels: true, shapes: true, actualAfterSelection: true }],
  ['PL3 list/prepare/stream/error/aborted/no-finish/timeout 单 provider 失败隔离后仍选成功者', async () => withFastPlannerDeadline(async (active) => {
    const timeline = []
    const providers = [
      plannerCandidate('p-list-reject', 'List Reject'), plannerCandidate('p-list-timeout', 'List Timeout'), plannerCandidate('p-prepare', 'Prepare'), plannerCandidate('p-stream', 'Stream'), plannerCandidate('p-error', 'Error'), plannerCandidate('p-aborted', 'Aborted'), plannerCandidate('p-no-finish', 'No Finish'), plannerCandidate('p-timeout', 'Timeout'), plannerCandidate('p-good', 'Good'),
    ]
    const catalogs = {}
    for (const item of providers) catalogs[item.id] = plannerModelCatalog
    catalogs['p-list-reject'] = 'reject'
    catalogs['p-list-timeout'] = 'timeout'
    const fake = makePlannerFake({ providers, catalogs, behaviors: {
      'p-prepare': { prepare: 'reject' },
      'p-stream': { stream: 'throw' },
      'p-error': { finish: 'error' },
      'p-aborted': { finish: 'aborted' },
      'p-no-finish': { finish: 'none' },
      'p-timeout': { stream: 'timeout' },
      'p-good': { finish: 'stop' },
    } }, timeline)
    const harness = makePlannerHarness({ llm: fake.llm, timeline, crossProviderPlannerModel: true })
    const pending = invokePlannerMarked(harness, plannerSignal())
    const result = await pending
    const selectionIndex = timeline.indexOf('selection-return')
    const actualBeforeSelection = timeline.some((item, index) => (item === 'actual-prepare' || item === 'actual-stream') && index < selectionIndex)
    markActualPlanner(harness)
    return { provider: result.provider, model: result.model, listProviders: fake.state.listProviders, listModels: fake.state.listModels.length, prepareCalls: fake.state.prepareCalls.length, actualBeforeSelection, timerClean: active.size === 0, timeoutWasAttempted: fake.state.listModels.includes('p-timeout') && fake.state.streamCalls.some((call) => call.provider === 'p-timeout') }
  }), { provider: 'p-good', model: 'planner-model', listProviders: 1, listModels: 9, prepareCalls: 7, actualBeforeSelection: false, timerClean: true, timeoutWasAttempted: true }],
  ['PL4 全候选失败后仅在 fallback 真实 probe 成功时继承父路由', async () => {
    const timeline = []
    const fake = makePlannerFake({
      providers: [plannerCandidate('p-a', 'Alpha'), plannerCandidate('p-parent', 'Parent')],
      catalogs: { 'p-a': plannerModelCatalog, 'p-parent': plannerModelCatalog },
      behaviors: {
        'p-a/planner-model': { finish: 'error' },
        'p-parent/planner-model': { finish: 'aborted' },
        'p-parent/parent-model': { finish: 'stop' },
      },
    }, timeline)
    const harness = makePlannerHarness({ llm: fake.llm, timeline, crossProviderPlannerModel: true })
    const result = await invokePlannerMarked(harness, plannerSignal())
    const routes = fake.state.prepareCalls.map((call) => call.provider + '/' + call.model)
    const selectionIndex = timeline.indexOf('selection-return')
    markActualPlanner(harness)
    return { result: { provider: result.provider, model: result.model, maxTokens: result.maxTokens }, routes, fallbackDirect: routes.includes('p-parent/parent-model'), allProbeFinishBeforeSelection: timeline.filter((item) => item.startsWith('probe-finish:')).every((item) => timeline.indexOf(item) < selectionIndex) }
  }, { result: { provider: 'p-parent', model: 'parent-model', maxTokens: 512 }, routes: ['p-a/planner-model', 'p-parent/planner-model', 'p-parent/parent-model'], fallbackDirect: true, allProbeFinishBeforeSelection: true }],
  ['PL5 fallback 与已探测同 route/model 复用失败 outcome，不二次计费', async () => {
    const timeline = []
    const fake = makePlannerFake({ providers: [plannerCandidate('p-same', 'Same')], catalogs: { 'p-same': plannerModelCatalog }, behaviors: { 'p-same/planner-model': { finish: 'error' } } }, timeline)
    const harness = makePlannerHarness({ llm: fake.llm, timeline, crossProviderPlannerModel: true, parentConfig: { provider: 'p-same', model: 'planner-model', maxTokens: 512 } })
    let message = ''
    try { await invokePlanner(harness, plannerSignal()) } catch (error) { message = String(error && error.message || error) }
    return { message, prepareCalls: fake.state.prepareCalls.length, streamCalls: fake.state.streamCalls.length }
  }, { message: PLANNER_BLOCKED_REASON, prepareCalls: 1, streamCalls: 1 }],
  ['PL6 无 llm/父路由缺失/fallback 失败均在 actual 前固定 reject', async () => {
    const run = async (options) => {
      const timeline = []
      const fakeBundle = options.withoutLlm ? null : makePlannerFake(options.spec, timeline)
      const fake = fakeBundle === null ? undefined : fakeBundle.llm
      const state = fakeBundle === null ? null : fakeBundle.state
      const harness = makePlannerHarness({ llm: fake, timeline, crossProviderPlannerModel: true, parentConfig: options.parentConfig })
      let message = ''
      try { await invokePlanner(harness, plannerSignal()); message = 'resolved' } catch (error) { message = String(error && error.message || error) }
      return { message, actual: timeline.filter((item) => item === 'actual-prepare' || item === 'actual-stream').length, state }
    }
    const failedSpec = { providers: [plannerCandidate('p-a', 'Alpha')], catalogs: { 'p-a': plannerModelCatalog }, behaviors: { 'p-a/planner-model': { finish: 'error' }, 'p-parent/parent-model': { finish: 'error' } } }
    const fallbackFail = await run({ spec: failedSpec, parentConfig: { provider: 'p-parent', model: 'parent-model', maxTokens: 512 } })
    const noParent = await run({ spec: failedSpec, parentConfig: { provider: 'p-parent' } })
    const noLlm = await run({ withoutLlm: true, parentConfig: { provider: 'p-parent', model: 'parent-model' } })
    return { fallbackFail: { message: fallbackFail.message, actual: fallbackFail.actual }, noParent: { message: noParent.message, actual: noParent.actual }, noLlm: { message: noLlm.message, actual: noLlm.actual } }
  }, { fallbackFail: { message: PLANNER_BLOCKED_REASON, actual: 0 }, noParent: { message: PLANNER_BLOCKED_REASON, actual: 0 }, noLlm: { message: PLANNER_BLOCKED_REASON, actual: 0 } }],
  ['PL7 True 空 plannerModel 只 probe 父 fallback，成功继承且失败前置阻断', async () => {
    const run = async (finish) => {
      const timeline = []
      const fake = makePlannerFake({ behaviors: { 'p-parent/parent-model': { finish } } }, timeline)
      const harness = makePlannerHarness({ llm: fake.llm, timeline, plannerModel: '', crossProviderPlannerModel: true })
      let result = null
      let message = ''
      try { result = await invokePlannerMarked(harness, plannerSignal()) } catch (error) { message = String(error && error.message || error) }
      return { result: result === null ? null : { provider: result.provider, model: result.model }, message, listProviders: fake.state.listProviders, listModels: fake.state.listModels.length, prepareCalls: fake.state.prepareCalls.length, streamCalls: fake.state.streamCalls.length }
    }
    return { success: await run('stop'), failure: await run('error') }
  }, { success: { result: { provider: 'p-parent', model: 'parent-model' }, message: '', listProviders: 0, listModels: 0, prepareCalls: 1, streamCalls: 1 }, failure: { result: null, message: PLANNER_BLOCKED_REASON, listProviders: 0, listModels: 0, prepareCalls: 1, streamCalls: 1 } }],
  ['PL8 False/缺失/非法开关严格走旧单 provider 且空模型零 probe', async () => {
    const modes = [
      { label: 'missing', set: false },
      { label: 'false', set: true, value: false },
      { label: 'string', set: true, value: 'true' },
      { label: 'number', set: true, value: 1 },
      { label: 'null', set: true, value: null },
    ]
    const outputs = []
    for (const mode of modes) {
      const timeline = []
      const fake = makePlannerFake({ providers: [plannerCandidate('p-other', 'Other')], catalogs: { 'p-parent': plannerModelCatalog } }, timeline)
      const options = { llm: fake.llm, timeline }
      if (mode.set) options.crossProviderPlannerModel = mode.value
      const harness = makePlannerHarness(options)
      let result = null
      try { result = await invokePlanner(harness, plannerSignal()) } catch (error) { result = { error: String(error && error.message || error) } }
      outputs.push({ label: mode.label, result: result === null ? null : { provider: result.provider, model: result.model, maxTokens: result.maxTokens }, listProviders: fake.state.listProviders, listModels: fake.state.listModels.join('|'), prepareCalls: fake.state.prepareCalls.length, streamCalls: fake.state.streamCalls.length })
    }
    const emptyTimeline = []
    const emptyFake = makePlannerFake({ providers: [plannerCandidate('p-other', 'Other')], catalogs: {} }, emptyTimeline)
    const emptyHarness = makePlannerHarness({ llm: emptyFake.llm, timeline: emptyTimeline, plannerModel: '', crossProviderPlannerModel: false })
    const emptyResult = await invokePlanner(emptyHarness, plannerSignal())
    return { outputs, empty: { result: { provider: emptyResult.provider, model: emptyResult.model }, listProviders: emptyFake.state.listProviders, listModels: emptyFake.state.listModels.length, prepareCalls: emptyFake.state.prepareCalls.length, streamCalls: emptyFake.state.streamCalls.length } }
  }, { outputs: [
    { label: 'missing', result: { provider: 'p-parent', model: 'planner-model', maxTokens: 512 }, listProviders: 0, listModels: 'p-parent', prepareCalls: 0, streamCalls: 0 },
    { label: 'false', result: { provider: 'p-parent', model: 'planner-model', maxTokens: 512 }, listProviders: 0, listModels: 'p-parent', prepareCalls: 0, streamCalls: 0 },
    { label: 'string', result: { provider: 'p-parent', model: 'planner-model', maxTokens: 512 }, listProviders: 0, listModels: 'p-parent', prepareCalls: 0, streamCalls: 0 },
    { label: 'number', result: { provider: 'p-parent', model: 'planner-model', maxTokens: 512 }, listProviders: 0, listModels: 'p-parent', prepareCalls: 0, streamCalls: 0 },
    { label: 'null', result: { provider: 'p-parent', model: 'planner-model', maxTokens: 512 }, listProviders: 0, listModels: 'p-parent', prepareCalls: 0, streamCalls: 0 },
  ], empty: { result: { provider: 'p-parent', model: 'parent-model' }, listProviders: 0, listModels: 0, prepareCalls: 0, streamCalls: 0 } }],
  ['PL9 同一 Agent 成功/严格 rejection 均缓存 in-flight promise，后续不重探', async () => {
    const successTimeline = []
    const successFake = makePlannerFake({ providers: [plannerCandidate('p-good', 'Good')], catalogs: { 'p-good': plannerModelCatalog }, behaviors: { 'p-good/planner-model': { finish: 'stop' } } }, successTimeline)
    const successHarness = makePlannerHarness({ llm: successFake.llm, timeline: successTimeline, crossProviderPlannerModel: true })
    const successPair = await Promise.all([invokePlanner(successHarness, plannerSignal()), invokePlanner(successHarness, plannerSignal())])
    const successThird = await invokePlanner(successHarness, plannerSignal())
    const failureTimeline = []
    const failureFake = makePlannerFake({ providers: [plannerCandidate('p-bad', 'Bad')], catalogs: { 'p-bad': plannerModelCatalog }, behaviors: { 'p-bad/planner-model': { finish: 'error' }, 'p-parent/parent-model': { finish: 'error' } } }, failureTimeline)
    const failureHarness = makePlannerHarness({ llm: failureFake.llm, timeline: failureTimeline, crossProviderPlannerModel: true })
    const failureResults = await Promise.all([
      invokePlanner(failureHarness, plannerSignal()).then(() => 'resolved', (error) => String(error && error.message || error)),
      invokePlanner(failureHarness, plannerSignal()).then(() => 'resolved', (error) => String(error && error.message || error)),
    ])
    return { success: { providers: successFake.state.listProviders, models: successFake.state.listModels.length, prepares: successFake.state.prepareCalls.length, streams: successFake.state.streamCalls.length, routes: successPair.concat([successThird]).map((result) => result.provider + '/' + result.model) }, failure: { providers: failureFake.state.listProviders, prepares: failureFake.state.prepareCalls.length, results: failureResults } }
  }, { success: { providers: 1, models: 1, prepares: 1, streams: 1, routes: ['p-good/planner-model', 'p-good/planner-model', 'p-good/planner-model'] }, failure: { providers: 1, prepares: 2, results: [PLANNER_BLOCKED_REASON, PLANNER_BLOCKED_REASON] } }],
  ['PL10 外部 turn abort 原样传播，不改写成无有效路由', async () => {
    const timeline = []
    const fake = makePlannerFake({ providers: [plannerCandidate('p-a', 'Alpha')], catalogs: { 'p-a': plannerModelCatalog } }, timeline)
    const harness = makePlannerHarness({ llm: fake.llm, timeline, crossProviderPlannerModel: true })
    const controller = new AbortController()
    const reason = new Error('caller-aborted')
    controller.abort(reason)
    let message = ''
    try { await invokePlanner(harness, controller.signal) } catch (error) { message = String(error && error.message || error) }
    return { message, listProviders: fake.state.listProviders, prepareCalls: fake.state.prepareCalls.length }
  }, { message: 'caller-aborted', listProviders: 0, prepareCalls: 0 }],
  // PL11（P1-3-4-5）：8 个候选（> 上限 5）全部挂在 gate 上，逐 tick 采样 in-flight；
  // in-flight = 已发起 listModels 且尚未 probe-finish 的候选数（本用例所有候选都会走到 finish）。
  // 断言：任意时刻 ≤ 5（且确实并行到 5，证明不是退化成串行）；发起顺序 = listedProviders 顺序；
  // 选择结果与串行参考（全部候选成功 + 同一排序函数）完全一致。
  ['PL11 候选数 >5 时并发池上限 5：任意时刻 in-flight ≤ 5 且选择结果与串行参考一致', async () => {
    const timeline = []
    const ids = ['p-01', 'p-02', 'p-03', 'p-04', 'p-05', 'p-06', 'p-07', 'p-08']
    const gates = {}
    const behaviors = {}
    const catalogs = {}
    const providers = []
    for (const id of ids) {
      gates[id] = deferredPlanner()
      behaviors[id + '/planner-model'] = { gate: gates[id] }
      catalogs[id] = plannerModelCatalog
      providers.push(plannerCandidate(id, id.toUpperCase()))
    }
    const fake = makePlannerFake({ providers, catalogs, behaviors }, timeline)
    const harness = makePlannerHarness({ llm: fake.llm, timeline, crossProviderPlannerModel: true })
    const pending = invokePlannerMarked(harness, plannerSignal())
    const samples = []
    const sample = () => {
      const started = fake.state.listModels.length
      const finished = timeline.filter((item) => item.startsWith('probe-finish:')).length
      samples.push(started - finished)
    }
    for (let i = 0; i < 6; i += 1) { await plannerTick(); sample() }
    const heldAtCap = samples[samples.length - 1]
    for (const id of ids) { gates[id].resolve(); await plannerTick(); sample() }
    const result = await pending
    const serialReference = sortPlannerCandidates(ids.map((id) => plannerCandidate(id, id.toUpperCase())), 'p-parent')[0].id
    return {
      maxInFlight: Math.max(...samples),
      overCap: samples.filter((value) => value > 5).length,
      heldAtCap,
      listedOrder: fake.state.listModels.join('|'),
      prepareRoutes: fake.state.prepareCalls.map((call) => call.provider + '/' + call.model).join('|'),
      streamCalls: fake.state.streamCalls.length,
      result: { provider: result.provider, model: result.model },
      serialReference,
    }
  }, {
    maxInFlight: 5,
    overCap: 0,
    heldAtCap: 5,
    listedOrder: 'p-01|p-02|p-03|p-04|p-05|p-06|p-07|p-08',
    prepareRoutes: 'p-01/planner-model|p-02/planner-model|p-03/planner-model|p-04/planner-model|p-05/planner-model|p-06/planner-model|p-07/planner-model|p-08/planner-model',
    streamCalls: 8,
    result: { provider: 'p-01', model: 'planner-model' },
    serialReference: 'p-01',
  }],
]
for (const [name, fn, expected] of PLANNER) check(name, await fn(), expected)

// ── NP 系列：非 planner child 统一模型解析、真实探针、回退与 per-Agent cache ──
const OTHER_MODEL = 'other-model'
const nonPlannerRoles = ['executor', 'reviewer', 'probe', 'workflow-worker', 'ralph-worker']

function makeNonPlannerHarness(options = {}) {
  const timeline = options.timeline || []
  const mainConfig = options.mainConfig === undefined
    ? { provider: 'p-main', model: 'main-model', maxTokens: 512, reasoningEffort: 'low' }
    : options.mainConfig
  const plannerConfig = options.plannerConfig === undefined
    ? { provider: 'p-planner', model: 'planner-model', maxTokens: 1024, reasoningEffort: 'medium' }
    : options.plannerConfig
  const main = {
    session: {
      header: { id: 'main-id', origin: 'main' },
      snapshotEvents: () => [],
      requestHeader: () => ({ config: mainConfig }),
    },
  }
  const planner = {
    session: {
      header: { id: 'planner-id', origin: 'subagent', delegationDepth: 1, parentSession: 'main-id' },
      snapshotEvents: () => [{ type: 'subagent/descriptor', data: { mode: 'continuable' } }],
      requestHeader: () => ({ config: plannerConfig }),
    },
  }
  const specs = Array.isArray(options.agentSpecs) && options.agentSpecs.length > 0
    ? options.agentSpecs
    : [{ id: options.agentId || 'child-id', role: options.role || 'executor', parentSession: options.parentSession || 'main-id' }]
  const registry = new Map([['main-id', main], ['planner-id', planner]])
  const agents = new Map()
  for (const spec of specs) {
    const role = spec.role || 'executor'
    const schemas = spec.schemas !== undefined
      ? spec.schemas
      : role === 'probe' ? [{ name: 'save_probe' }] : role === 'reviewer' ? [{ name: 'read' }] : [{ name: 'write' }]
    const agent = {
      session: {
        header: { id: spec.id, origin: 'subagent', delegationDepth: 2, parentSession: spec.parentSession || 'main-id' },
        snapshotEvents: () => [],
      },
      ctx: {
        get(name) {
          if (name === 'tools') return { schemas: () => schemas }
          return undefined
        },
      },
    }
    agents.set(spec.id, agent)
    registry.set(spec.id, agent)
  }
  const listeners = {}
  const ctx = {
    get(name) {
      if (name === 'agents') return { get: (id) => registry.get(id) }
      if (name === 'llm') return options.llm
      return undefined
    },
    on(name, fn) {
      if (listeners[name] === undefined) listeners[name] = []
      listeners[name].push(fn)
    },
  }
  const config = {
    anchoredBootstrap: false,
    plannerModel: 'planner-model',
    otherAgentModel: options.otherAgentModel === undefined ? OTHER_MODEL : options.otherAgentModel,
  }
  if (Object.prototype.hasOwnProperty.call(options, 'crossProviderPlannerModel')) config.crossProviderPlannerModel = options.crossProviderPlannerModel
  applyPlugin(ctx, config)
  return { main, planner, registry, agents, agent: agents.values().next().value, listeners, timeline }
}

function directRouteFor(harness, agent) {
  const child = typeof agent === 'string' ? harness.agents.get(agent) : agent
  const parent = harness.registry.get(child.session.header.parentSession)
  const header = parent !== undefined && parent.session !== undefined && typeof parent.session.requestHeader === 'function'
    ? parent.session.requestHeader() : undefined
  const config = header !== undefined && header.config !== undefined && header.config !== null ? header.config : {}
  return {
    ...(typeof config.provider === 'string' ? { provider: config.provider } : {}),
    ...(typeof config.model === 'string' ? { model: config.model } : {}),
    ...(typeof config.maxTokens === 'number' ? { maxTokens: config.maxTokens } : {}),
    ...(typeof config.reasoningEffort === 'string' ? { reasoningEffort: config.reasoningEffort } : {}),
  }
}

async function invokeNonPlanner(harness, agentOrId, resolved, signal) {
  const agent = typeof agentOrId === 'string' ? harness.agents.get(agentOrId) : (agentOrId || harness.agent)
  const listener = harness.listeners['agent/request']
  if (!Array.isArray(listener) || listener.length === 0) throw new Error('agent/request 非 planner listener 未注册')
  const base = resolved === undefined ? directRouteFor(harness, agent) : resolved
  const requestSignal = signal === undefined ? new AbortController().signal : signal
  return listener[0]({ agent, turn: 1, step: 1, signal: requestSignal }, async () => {
    harness.timeline.push('agent/request-next')
    return base
  })
}

function markActualNonPlanner(harness) {
  harness.timeline.push('actual-prepare')
  harness.timeline.push('actual-stream')
}

function routeView(result) {
  if (result === null || result === undefined) return null
  return {
    provider: result.provider,
    model: result.model,
    maxTokens: result.maxTokens,
    reasoningEffort: result.reasoningEffort,
  }
}

const NON_PLANNER = [
  ['NP1 executor/reviewer/probe/workflow/ralph 均走 otherAgentModel（cross=false）', async () => {
    const outputs = []
    for (const role of nonPlannerRoles) {
      const timeline = []
      const fake = makePlannerFake({ catalogs: { 'p-main': [{ id: OTHER_MODEL, name: 'Other Model' }] } }, timeline)
      const harness = makeNonPlannerHarness({ role, llm: fake.llm, timeline, crossProviderPlannerModel: false })
      const result = await invokeNonPlanner(harness)
      markActualNonPlanner(harness)
      const actualIndex = timeline.indexOf('actual-prepare')
      outputs.push({ role, route: routeView(result), listProviders: fake.state.listProviders, listModels: fake.state.listModels.join('|'), prepareCalls: fake.state.prepareCalls.length, streamCalls: fake.state.streamCalls.length, resolverBeforeActual: timeline.indexOf('listModels:p-main') < actualIndex })
    }
    return outputs
  }, nonPlannerRoles.map((role) => ({ role, route: { provider: 'p-main', model: OTHER_MODEL, maxTokens: 512, reasoningEffort: 'low' }, listProviders: 0, listModels: 'p-main', prepareCalls: 0, streamCalls: 0, resolverBeforeActual: true }))],
  ['NP2 cross=false/缺失/非法、空/未命中/空目录/异常/无 llm 均回退主会话且不真实 probe', async () => {
    const cases = [
      { label: 'empty', otherAgentModel: '', catalog: [{ id: OTHER_MODEL }], crossProviderPlannerModel: false },
      { label: 'whitespace', otherAgentModel: '   ', catalog: [{ id: OTHER_MODEL }], crossProviderPlannerModel: false },
      { label: 'miss', catalog: [{ id: 'different-model' }], crossProviderPlannerModel: false },
      { label: 'empty-catalog', catalog: [], crossProviderPlannerModel: false },
      { label: 'catalog-error', catalog: 'reject', crossProviderPlannerModel: false },
      { label: 'no-llm', noLlm: true, crossProviderPlannerModel: false },
      { label: 'missing-switch', catalog: [{ id: OTHER_MODEL }] },
      { label: 'string-switch', catalog: [{ id: OTHER_MODEL }], crossProviderPlannerModel: 'true' },
      { label: 'number-switch', catalog: [{ id: OTHER_MODEL }], crossProviderPlannerModel: 1 },
      { label: 'null-switch', catalog: [{ id: OTHER_MODEL }], crossProviderPlannerModel: null },
    ]
    const outputs = []
    for (const item of cases) {
      const timeline = []
      const fakeBundle = item.noLlm ? null : makePlannerFake({ catalogs: { 'p-main': item.catalog } }, timeline)
      const harness = makeNonPlannerHarness({ role: 'executor', llm: fakeBundle === null ? undefined : fakeBundle.llm, timeline, otherAgentModel: item.otherAgentModel === undefined ? OTHER_MODEL : item.otherAgentModel, ...(item.crossProviderPlannerModel === undefined ? {} : { crossProviderPlannerModel: item.crossProviderPlannerModel }) })
      const result = await invokeNonPlanner(harness)
      markActualNonPlanner(harness)
      outputs.push({ label: item.label, route: routeView(result), listProviders: fakeBundle === null ? 0 : fakeBundle.state.listProviders, listModels: fakeBundle === null ? '' : fakeBundle.state.listModels.join('|'), prepareCalls: fakeBundle === null ? 0 : fakeBundle.state.prepareCalls.length, streamCalls: fakeBundle === null ? 0 : fakeBundle.state.streamCalls.length })
    }
    return outputs
  }, [
    { label: 'empty', route: { provider: 'p-main', model: 'main-model', maxTokens: 512, reasoningEffort: 'low' }, listProviders: 0, listModels: '', prepareCalls: 0, streamCalls: 0 },
    { label: 'whitespace', route: { provider: 'p-main', model: 'main-model', maxTokens: 512, reasoningEffort: 'low' }, listProviders: 0, listModels: '', prepareCalls: 0, streamCalls: 0 },
    { label: 'miss', route: { provider: 'p-main', model: 'main-model', maxTokens: 512, reasoningEffort: 'low' }, listProviders: 0, listModels: 'p-main', prepareCalls: 0, streamCalls: 0 },
    { label: 'empty-catalog', route: { provider: 'p-main', model: 'main-model', maxTokens: 512, reasoningEffort: 'low' }, listProviders: 0, listModels: 'p-main', prepareCalls: 0, streamCalls: 0 },
    { label: 'catalog-error', route: { provider: 'p-main', model: 'main-model', maxTokens: 512, reasoningEffort: 'low' }, listProviders: 0, listModels: 'p-main', prepareCalls: 0, streamCalls: 0 },
    { label: 'no-llm', route: { provider: 'p-main', model: 'main-model', maxTokens: 512, reasoningEffort: 'low' }, listProviders: 0, listModels: '', prepareCalls: 0, streamCalls: 0 },
    { label: 'missing-switch', route: { provider: 'p-main', model: OTHER_MODEL, maxTokens: 512, reasoningEffort: 'low' }, listProviders: 0, listModels: 'p-main', prepareCalls: 0, streamCalls: 0 },
    { label: 'string-switch', route: { provider: 'p-main', model: OTHER_MODEL, maxTokens: 512, reasoningEffort: 'low' }, listProviders: 0, listModels: 'p-main', prepareCalls: 0, streamCalls: 0 },
    { label: 'number-switch', route: { provider: 'p-main', model: OTHER_MODEL, maxTokens: 512, reasoningEffort: 'low' }, listProviders: 0, listModels: 'p-main', prepareCalls: 0, streamCalls: 0 },
    { label: 'null-switch', route: { provider: 'p-main', model: OTHER_MODEL, maxTokens: 512, reasoningEffort: 'low' }, listProviders: 0, listModels: 'p-main', prepareCalls: 0, streamCalls: 0 },
  ]],
  ['NP3 显式 agentOptions provider/model 优先且完全跳过目录与真实探针', async () => {
    const timeline = []
    const fake = makePlannerFake({ providers: [{ id: 'p-a', name: 'A' }], catalogs: { 'p-a': [{ id: OTHER_MODEL }] } }, timeline)
    const harness = makeNonPlannerHarness({ role: 'executor', llm: fake.llm, timeline, crossProviderPlannerModel: true })
    const result = await invokeNonPlanner(harness, undefined, { provider: 'p-explicit', model: 'explicit-model', reasoningEffort: 'high' })
    markActualNonPlanner(harness)
    return { route: routeView(result), listProviders: fake.state.listProviders, listModels: fake.state.listModels, prepareCalls: fake.state.prepareCalls.length, streamCalls: fake.state.streamCalls.length, timeline }
  }, { route: { provider: 'p-explicit', model: 'explicit-model', maxTokens: 512, reasoningEffort: 'high' }, listProviders: 0, listModels: [], prepareCalls: 0, streamCalls: 0, timeline: ['agent/request-next', 'actual-prepare', 'actual-stream'] }],
  ['NP4 嵌套于 planner 的普通 child/probe 均以顶层主会话为 fallback，且 probe 不绕过 resolver', async () => {
    const outputs = []
    for (const role of ['executor', 'probe']) {
      const timeline = []
      const fake = makePlannerFake({ catalogs: { 'p-main': [{ id: OTHER_MODEL }] } }, timeline)
      const harness = makeNonPlannerHarness({ role, parentSession: 'planner-id', llm: fake.llm, timeline, crossProviderPlannerModel: false, mainConfig: { provider: 'p-main', model: 'main-model', maxTokens: 4096, reasoningEffort: 'high' }, plannerConfig: { provider: 'p-planner', model: 'planner-model', maxTokens: 1024, reasoningEffort: 'low' } })
      const result = await invokeNonPlanner(harness)
      markActualNonPlanner(harness)
      outputs.push({ role, route: routeView(result), listModels: fake.state.listModels.join('|'), prepareCalls: fake.state.prepareCalls.length, streamCalls: fake.state.streamCalls.length })
    }
    return outputs
  }, [
    { role: 'executor', route: { provider: 'p-main', model: OTHER_MODEL, maxTokens: 1024, reasoningEffort: 'low' }, listModels: 'p-main', prepareCalls: 0, streamCalls: 0 },
    { role: 'probe', route: { provider: 'p-main', model: OTHER_MODEL, maxTokens: 4096, reasoningEffort: 'low' }, listModels: 'p-main', prepareCalls: 0, streamCalls: 0 },
  ]],
  ['NP5 cross=true 并发探针（上限 5）全部完成后按既有排序选择成功候选', async () => {
    const timeline = []
    const providers = [
      { id: 'p-z', name: 'Zeta' }, { id: 'p-a', name: 'Alpha' }, { id: 'p-main', name: 'Main' }, { id: 'deepseek-official', name: 'DeepSeek Official' },
    ]
    const catalogs = {}
    const behaviors = {}
    for (const provider of providers) { catalogs[provider.id] = [{ id: OTHER_MODEL }]; behaviors[provider.id + '/' + OTHER_MODEL] = { finish: 'stop' } }
    const fake = makePlannerFake({ providers, catalogs, behaviors }, timeline)
    const harness = makeNonPlannerHarness({ role: 'workflow-worker', llm: fake.llm, timeline, crossProviderPlannerModel: true })
    const result = await invokeNonPlanner(harness)
    markActualNonPlanner(harness)
    const actualIndex = timeline.indexOf('actual-prepare')
    const probeIndexes = timeline.map((item, index) => item.startsWith('probe-') || item.startsWith('listProviders') || item.startsWith('listModels:') ? index : -1).filter((index) => index >= 0)
    return { route: routeView(result), listProviders: fake.state.listProviders, listModels: fake.state.listModels.join('|'), prepareRoutes: fake.state.prepareCalls.map((call) => call.provider + '/' + call.model), streamCalls: fake.state.streamCalls.length, allProbeBeforeActual: probeIndexes.length > 0 && probeIndexes.every((index) => index < actualIndex) }
  }, { route: { provider: 'p-a', model: OTHER_MODEL, maxTokens: 512, reasoningEffort: 'low' }, listProviders: 1, listModels: 'p-z|p-a|p-main|deepseek-official', prepareRoutes: ['p-z/other-model', 'p-a/other-model', 'p-main/other-model', 'deepseek-official/other-model'], streamCalls: 4, allProbeBeforeActual: true }],
  ['NP6 cross=true 覆盖 list/prepare/stream/error/aborted/no-finish/timeout 与 fallback 成功/严格拒绝', async () => withFastPlannerDeadline(async (active) => {
    const timeline = []
    const providers = [
      { id: 'p-list-reject', name: 'List Reject' }, { id: 'p-list-timeout', name: 'List Timeout' }, { id: 'p-prepare', name: 'Prepare' }, { id: 'p-stream', name: 'Stream' }, { id: 'p-error', name: 'Error' }, { id: 'p-aborted', name: 'Aborted' }, { id: 'p-none', name: 'No Finish' }, { id: 'p-timeout', name: 'Timeout' },
    ]
    const catalogs = {}
    for (const provider of providers) catalogs[provider.id] = [{ id: OTHER_MODEL }]
    catalogs['p-list-reject'] = 'reject'
    catalogs['p-list-timeout'] = 'timeout'
    const behaviors = {
      'p-prepare/other-model': { prepare: 'reject' },
      'p-stream/other-model': { stream: 'throw' },
      'p-error/other-model': { finish: 'error' },
      'p-aborted/other-model': { finish: 'aborted' },
      'p-none/other-model': { finish: 'none' },
      'p-timeout/other-model': { stream: 'timeout' },
      'p-main/main-model': { finish: 'stop' },
    }
    const fake = makePlannerFake({ providers, catalogs, behaviors }, timeline)
    const harness = makeNonPlannerHarness({ role: 'ralph-worker', llm: fake.llm, timeline, crossProviderPlannerModel: true })
    const result = await invokeNonPlanner(harness)
    markActualNonPlanner(harness)
    const actualIndex = timeline.indexOf('actual-prepare')
    const resolverIndexes = timeline.map((item, index) => item.startsWith('list') || item.startsWith('probe-') ? index : -1).filter((index) => index >= 0)

    const failureTimeline = []
    const failureFake = makePlannerFake({ providers: [], catalogs: { 'p-main': [{ id: 'unrelated' }] }, behaviors: { 'p-main/main-model': { finish: 'error' } } }, failureTimeline)
    const failureHarness = makeNonPlannerHarness({ role: 'reviewer', llm: failureFake.llm, timeline: failureTimeline, crossProviderPlannerModel: true })
    let failureMessage = ''
    try { await invokeNonPlanner(failureHarness) } catch (error) { failureMessage = String(error && error.message || error) }

    return {
      fallbackSuccess: { route: routeView(result), listProviders: fake.state.listProviders, listModels: fake.state.listModels.join('|'), prepareRoutes: fake.state.prepareCalls.map((call) => call.provider + '/' + call.model), streamRoutes: fake.state.streamCalls.map((call) => call.provider + '/' + call.model), timeoutAttempted: fake.state.listModels.includes('p-list-timeout') && fake.state.streamCalls.some((call) => call.provider === 'p-timeout'), timerClean: active.size === 0, allProbeBeforeActual: resolverIndexes.every((index) => index < actualIndex) },
      strictReject: { message: failureMessage, listProviders: failureFake.state.listProviders, listModels: failureFake.state.listModels.join('|'), prepareRoutes: failureFake.state.prepareCalls.map((call) => call.provider + '/' + call.model), actual: failureTimeline.filter((item) => item === 'actual-prepare' || item === 'actual-stream').length },
    }
  }), { fallbackSuccess: { route: { provider: 'p-main', model: 'main-model', maxTokens: 512, reasoningEffort: 'low' }, listProviders: 1, listModels: 'p-list-reject|p-list-timeout|p-prepare|p-stream|p-error|p-aborted|p-none|p-timeout', prepareRoutes: ['p-prepare/other-model', 'p-stream/other-model', 'p-error/other-model', 'p-aborted/other-model', 'p-none/other-model', 'p-timeout/other-model', 'p-main/main-model'], streamRoutes: ['p-stream/other-model', 'p-error/other-model', 'p-aborted/other-model', 'p-none/other-model', 'p-timeout/other-model', 'p-main/main-model'], timeoutAttempted: true, timerClean: true, allProbeBeforeActual: true }, strictReject: { message: NON_PLANNER_BLOCKED_REASON, listProviders: 1, listModels: '', prepareRoutes: ['p-main/main-model'], actual: 0 } }],
  ['NP7 候选失败与 fallback 同 route/model 复用 outcome，不二次真实调用', async () => {
    const timeline = []
    const fake = makePlannerFake({ providers: [{ id: 'p-main', name: 'Main' }], catalogs: { 'p-main': [{ id: OTHER_MODEL }] }, behaviors: { ['p-main/' + OTHER_MODEL]: { finish: 'error' } } }, timeline)
    const harness = makeNonPlannerHarness({ role: 'executor', llm: fake.llm, timeline, crossProviderPlannerModel: true, otherAgentModel: OTHER_MODEL, mainConfig: { provider: 'p-main', model: OTHER_MODEL, maxTokens: 512, reasoningEffort: 'low' } })
    let message = ''
    try { await invokeNonPlanner(harness) } catch (error) { message = String(error && error.message || error) }
    return { message, listProviders: fake.state.listProviders, listModels: fake.state.listModels.join('|'), prepareCalls: fake.state.prepareCalls.length, streamCalls: fake.state.streamCalls.length }
  }, { message: NON_PLANNER_BLOCKED_REASON, listProviders: 1, listModels: 'p-main', prepareCalls: 1, streamCalls: 1 }],
  ['NP8 同一 non-planner Agent 并发/续请求复用成功 cache，planner 仍只用 plannerModel', async () => {
    const timeline = []
    const fake = makePlannerFake({ providers: [{ id: 'p-a', name: 'Alpha' }], catalogs: { 'p-a': [{ id: OTHER_MODEL }] }, behaviors: { ['p-a/' + OTHER_MODEL]: { finish: 'stop' } } }, timeline)
    const harness = makeNonPlannerHarness({ role: 'executor', llm: fake.llm, timeline, crossProviderPlannerModel: true })
    const pair = await Promise.all([invokeNonPlanner(harness), invokeNonPlanner(harness)])
    const third = await invokeNonPlanner(harness)
    const plannerTimeline = []
    const plannerFake = makePlannerFake({ providers: [{ id: 'p-other', name: 'Other' }, { id: 'p-parent', name: 'Parent' }], catalogs: { 'p-other': [{ id: 'planner-model' }], 'p-parent': [{ id: 'planner-model' }] }, behaviors: { 'p-other/planner-model': { finish: 'stop' }, 'p-parent/planner-model': { finish: 'stop' } } }, plannerTimeline)
    const plannerHarness = makePlannerHarness({ llm: plannerFake.llm, timeline: plannerTimeline, plannerModel: 'planner-model', otherAgentModel: OTHER_MODEL, crossProviderPlannerModel: true })
    const plannerResult = await invokePlanner(plannerHarness, plannerSignal())
    return { nonPlannerRoutes: pair.concat([third]).map(routeView), providers: fake.state.listProviders, listModels: fake.state.listModels.join('|'), prepareCalls: fake.state.prepareCalls.length, streams: fake.state.streamCalls.length, plannerRoute: routeView(plannerResult), plannerListProviders: plannerFake.state.listProviders, plannerModels: plannerFake.state.listModels.join('|') }
  }, { nonPlannerRoutes: [{ provider: 'p-a', model: OTHER_MODEL, maxTokens: 512, reasoningEffort: 'low' }, { provider: 'p-a', model: OTHER_MODEL, maxTokens: 512, reasoningEffort: 'low' }, { provider: 'p-a', model: OTHER_MODEL, maxTokens: 512, reasoningEffort: 'low' }], providers: 1, listModels: 'p-a', prepareCalls: 1, streams: 1, plannerRoute: { provider: 'p-other', model: 'planner-model', maxTokens: 512, reasoningEffort: 'low' }, plannerListProviders: 1, plannerModels: 'p-other|p-parent' }],
  ['NP9 不同 Agent 的成功/失败不共享 non-planner cache 或失败结果', async () => {
    const successTimeline = []
    const successFake = makePlannerFake({ providers: [{ id: 'p-a', name: 'Alpha' }], catalogs: { 'p-a': [{ id: OTHER_MODEL }] }, behaviors: { ['p-a/' + OTHER_MODEL]: { finish: 'stop' } } }, successTimeline)
    const successHarness = makeNonPlannerHarness({ llm: successFake.llm, timeline: successTimeline, crossProviderPlannerModel: true, agentSpecs: [{ id: 'child-a', role: 'executor' }, { id: 'child-b', role: 'executor' }] })
    const successPair = await Promise.all([invokeNonPlanner(successHarness, 'child-a'), invokeNonPlanner(successHarness, 'child-b')])
    const failureTimeline = []
    const failureFake = makePlannerFake({ providers: [{ id: 'p-a', name: 'Alpha' }], catalogs: { 'p-a': [{ id: OTHER_MODEL }] }, behaviors: { ['p-a/' + OTHER_MODEL]: { finish: 'error' }, 'p-main/main-model': { finish: 'error' } } }, failureTimeline)
    const failureHarness = makeNonPlannerHarness({ llm: failureFake.llm, timeline: failureTimeline, crossProviderPlannerModel: true, agentSpecs: [{ id: 'fail-a', role: 'executor' }, { id: 'fail-b', role: 'executor' }] })
    const failureResults = await Promise.all(['fail-a', 'fail-b'].map((id) => invokeNonPlanner(failureHarness, id).then(() => 'resolved', (error) => String(error && error.message || error))))
    return { success: { routes: successPair.map(routeView), providers: successFake.state.listProviders, models: successFake.state.listModels.length, prepares: successFake.state.prepareCalls.length, streams: successFake.state.streamCalls.length }, failure: { results: failureResults, providers: failureFake.state.listProviders, models: failureFake.state.listModels.length, prepares: failureFake.state.prepareCalls.length, streams: failureFake.state.streamCalls.length } }
  }, { success: { routes: [{ provider: 'p-a', model: OTHER_MODEL, maxTokens: 512, reasoningEffort: 'low' }, { provider: 'p-a', model: OTHER_MODEL, maxTokens: 512, reasoningEffort: 'low' }], providers: 2, models: 2, prepares: 2, streams: 2 }, failure: { results: [NON_PLANNER_BLOCKED_REASON, NON_PLANNER_BLOCKED_REASON], providers: 2, models: 2, prepares: 4, streams: 4 } }],
  ['NP10 cross=true 空 otherAgentModel 仅验证主会话 fallback，成功/失败均不枚举 provider', async () => {
    const run = async (finish) => {
      const timeline = []
      const fake = makePlannerFake({ providers: [{ id: 'p-a', name: 'A' }], catalogs: {}, behaviors: { 'p-main/main-model': { finish } } }, timeline)
      const harness = makeNonPlannerHarness({ role: 'probe', llm: fake.llm, timeline, crossProviderPlannerModel: true, otherAgentModel: '' })
      let result = null
      let message = ''
      try { result = await invokeNonPlanner(harness) } catch (error) { message = String(error && error.message || error) }
      return { route: routeView(result), message, listProviders: fake.state.listProviders, listModels: fake.state.listModels.length, prepareCalls: fake.state.prepareCalls.length, streamCalls: fake.state.streamCalls.length }
    }
    return { success: await run('stop'), failure: await run('error') }
  }, { success: { route: { provider: 'p-main', model: 'main-model', maxTokens: 512, reasoningEffort: 'low' }, message: '', listProviders: 0, listModels: 0, prepareCalls: 1, streamCalls: 1 }, failure: { route: null, message: NON_PLANNER_BLOCKED_REASON, listProviders: 0, listModels: 0, prepareCalls: 1, streamCalls: 1 } }],
  ['NP11 非 planner 外部 turn abort 原样传播且不触发 provider/listModels', async () => {
    const timeline = []
    const fake = makePlannerFake({ providers: [{ id: 'p-a', name: 'A' }], catalogs: { 'p-a': [{ id: OTHER_MODEL }] } }, timeline)
    const harness = makeNonPlannerHarness({ role: 'executor', llm: fake.llm, timeline, crossProviderPlannerModel: true })
    const controller = new AbortController()
    controller.abort(new Error('caller-aborted'))
    let message = ''
    try { await invokeNonPlanner(harness, undefined, undefined, controller.signal) } catch (error) { message = String(error && error.message || error) }
    return { message, listProviders: fake.state.listProviders, listModels: fake.state.listModels.length, prepareCalls: fake.state.prepareCalls.length }
  }, { message: 'caller-aborted', listProviders: 0, listModels: 0, prepareCalls: 0 }],
  ['NP12 上溯链断裂（顶层 main-id 不存在）→ 回退直接父 planner 会话配置', async () => {
    const harness = makeNonPlannerHarness({
      role: 'probe',
      parentSession: 'planner-id',
      plannerConfig: { provider: 'p-pro', model: 'deepseek-v4-pro', maxTokens: 16384 },
      mainConfig: { provider: 'p-main', model: 'main-model', maxTokens: 8192, reasoningEffort: 'high' },
    })
    harness.registry.delete('main-id')
    const out = await invokeNonPlanner(harness)
    return { provider: out.provider, model: out.model, maxTokens: out.maxTokens }
  }, { provider: 'p-pro', model: 'deepseek-v4-pro', maxTokens: 16384 }],
  ['NP13 effort 以直接父为准、顶层 high 不渗入（完整链）', async () => {
    const harness = makeNonPlannerHarness({
      role: 'probe',
      parentSession: 'planner-id',
      plannerConfig: { provider: 'p-pro', model: 'deepseek-v4-pro', maxTokens: 16384 },
      mainConfig: { provider: 'p-main', model: 'main-model', maxTokens: 8192, reasoningEffort: 'high' },
    })
    const out = await invokeNonPlanner(harness)
    return typeof out.reasoningEffort === 'string' ? out.reasoningEffort : ''
  }, ''],
]
for (const [name, fn, expected] of NON_PLANNER) check(name, await fn(), expected)

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
  applyPlugin(ctx, { anchoredBootstrap: false })
  return listeners
}
const askHarness = makeAskHarness()
const askMainAgent = {
  session: { header: { id: 'main-1', cwd: 'C:/work' }, snapshotEvents: () => [] },
  options: {},
  ctx: undefined,
}
function askPreExecute(name, argumentsObj, events = []) {
  const entry = askHarness['tools/pre-execute']
  if (entry === undefined || entry.length === 0) throw new Error('pre-execute 监听器未注册')
  const agent = { ...askMainAgent, session: { ...askMainAgent.session, snapshotEvents: () => events } }
  return entry[0]({ agent, name, arguments: argumentsObj }, () => ({ kind: 'allow' }))
}
const askStandardQ1 = [{ id: 'q1', options: [{ label: '同意执行' }, { label: '转交pro规划' }, { label: '不同意' }] }]
const askDirectEvents = [um(), call('ask_user_question', 'aa1', routeArgs), ok('aa1', answer(['直接执行']))]
const askPlanEvents = [um(), call('ask_user_question', 'aa1', routeArgs), ok('aa1', answer(['进行pro规划']))]
const askChannelBrokenEvents = [um(), call('ask_user_question', 'aa1', routeArgs), err('aa1', 'NO_PROVIDER')]
const ordinaryProbeArgs = { questions: [{ id: 'q1', options: [{ label: '主会话探查' }, { label: '探查者探查' }] }] }
const ordinaryClarifyArgs = { questions: [{ id: 'q1', options: [{ label: '方案A' }, { label: '方案B' }] }] }
const purposeRunCode = { code: 'return await tools.ask_user_question({"questions":[{"id":"q1","options":[{"label":"完善方案"},{"label":"重新规划"}]}]})', description: '嵌套目的确认' }
const AS = [
  ['AS1 首问标准三词+第二问带选项 → deny 且含「纯文本」、不含「一并修正」（standard 单报路径）', (() => { const r = askPreExecute('ask_user_question', { questions: [...askStandardQ1, { id: 'q2', question: '修改意见', options: [{ label: '无' }, { label: '有意见（填写）' }] }] }); return r !== null && r !== undefined && r.kind === 'deny' && String(r.reason).includes('纯文本') && !String(r.reason).includes('一并修正') })(), true],
  ['AS2 首问标准三词+第二问无 options → allow', (() => { const r = askPreExecute('ask_user_question', { questions: [...askStandardQ1, { id: 'q2', question: '修改意见' }] }); return r !== null && r !== undefined && r.kind === 'allow' })(), true],
  ['AS3 首问非白名单变体+第二问无 options → deny 含「推荐标记仅限」、不含「路由 ask 结构错误」（kind 特异性回归）', (() => { const r = askPreExecute('ask_user_question', { questions: [{ id: 'q1', options: [{ label: '同意执行!' }, { label: '转交pro规划' }, { label: '不同意' }] }, { id: 'q2', question: '修改意见' }] }); return r !== null && r !== undefined && r.kind === 'deny' && String(r.reason).includes('推荐标记仅限') && !String(r.reason).includes('路由 ask 结构错误') })(), true],
  ['AS4 单问「同意执行!」变体 → deny 含「批准 ask 结构错误」与「修改意见」（approve 模板正向）', (() => { const r = askPreExecute('ask_user_question', { questions: [{ id: 'q1', options: [{ label: '同意执行!' }] }] }); return r !== null && r !== undefined && r.kind === 'deny' && String(r.reason).includes('批准 ask 结构错误') && String(r.reason).includes('修改意见') })(), true],
  ['AS5 路由变体（直接执行!）+第二问纯文本 → deny 且不含「结构错误」（route 特异不回归）', (() => { const r = askPreExecute('ask_user_question', { questions: [{ id: 'q1', options: [{ label: '直接执行!' }, { label: '进行pro规划' }, { label: '不同意' }] }, { id: 'q2', question: '补充要求' }] }); return r !== null && r !== undefined && r.kind === 'deny' && !String(r.reason).includes('结构错误') })(), true],
  ['AS6 cordis_run 路由未确认 → deny 含「路由未确认：cordis_run」与「须先 ask_user_question 路由确认」', (() => { const r = askPreExecute('cordis_run', {}); return r !== null && r !== undefined && r.kind === 'deny' && String(r.reason).includes('路由未确认：cordis_run') && String(r.reason).includes('须先 ask_user_question 路由确认') })(), true],
  ['AS7 cordis_define 路由未确认 → allow', (() => { const r = askPreExecute('cordis_define', {}); return r !== null && r !== undefined && r.kind === 'allow' })(), true],
  ['AS8 cordis_inspect_list 路由未确认 → allow', (() => { const r = askPreExecute('cordis_inspect_list', {}); return r !== null && r !== undefined && r.kind === 'allow' })(), true],
  ['AS9 目的标准二选一 route=none → deny 且含固定路由确认句', (() => { const r = askPreExecute('ask_user_question', JSON.parse(purposeArgs), []); return r !== null && r !== undefined && r.kind === 'deny' && String(r.reason).includes(ROUTE_CONFIRM_TEXT) })(), true],
  ['AS9b 目的标准二选一 route=direct → deny 且含固定路由确认句', (() => { const r = askPreExecute('ask_user_question', JSON.parse(purposeArgs), askDirectEvents); return r !== null && r !== undefined && r.kind === 'deny' && String(r.reason).includes(ROUTE_CONFIRM_TEXT) })(), true],
  ['AS9c 目的标准二选一 route=plan → allow', (() => { const r = askPreExecute('ask_user_question', JSON.parse(purposeArgs), askPlanEvents); return r !== null && r !== undefined && r.kind === 'allow' })(), true],
  ['AS9d 目的标准二选一 channelBroken → allow（逃生）', (() => { const r = askPreExecute('ask_user_question', JSON.parse(purposeArgs), askChannelBrokenEvents); return r !== null && r !== undefined && r.kind === 'allow' })(), true],
  ['AS9e 单问路由 ask（缺第二问）route=none → deny 且含「须至少 2 个问题」', (() => { const r = askPreExecute('ask_user_question', JSON.parse(routeArgs), []); return r !== null && r !== undefined && r.kind === 'deny' && String(r.reason).includes('须至少 2 个问题') })(), true],
  ['AS9h 路由双问（第二问纯文本）route=none → allow', (() => { const r = askPreExecute('ask_user_question', JSON.parse(route2qArgs), []); return r !== null && r !== undefined && r.kind === 'allow' })(), true],
  ['AS9i 路由双问第二问带 options route=none → deny 且含「纯文本」「补充要求」', (() => { const r = askPreExecute('ask_user_question', JSON.parse(route2qArgsWithOpts), []); return r !== null && r !== undefined && r.kind === 'deny' && String(r.reason).includes('纯文本') && String(r.reason).includes('补充要求') })(), true],
  ['AS9f ordinary 探查 ask route=none → allow', (() => { const r = askPreExecute('ask_user_question', ordinaryProbeArgs, []); return r !== null && r !== undefined && r.kind === 'allow' })(), true],
  ['AS9g ordinary 澄清 ask route=none → allow', (() => { const r = askPreExecute('ask_user_question', ordinaryClarifyArgs, []); return r !== null && r !== undefined && r.kind === 'allow' })(), true],
  ['AS10 目的缺一词 ask → deny 含「目的 ask 选项固定为」', (() => { const r = askPreExecute('ask_user_question', JSON.parse(wordPurposeArgs)); return r !== null && r !== undefined && r.kind === 'deny' && String(r.reason).includes('目的 ask 选项固定为') })(), true],
  ['AS11 非计划目的 2 问 ask → deny 且同时含固定路由确认句与「目的 ask 结构错误」', (() => { const r = askPreExecute('ask_user_question', { questions: [{ id: 'q1', options: [{ label: '完善方案' }, { label: '重新规划' }] }, { id: 'q2', question: '补充' }] }); return r !== null && r !== undefined && r.kind === 'deny' && String(r.reason).includes(ROUTE_CONFIRM_TEXT) && String(r.reason).includes('目的 ask 结构错误') })(), true],
  ['AS12 run_code 内 none 态目的 ask → deny 且聚合含固定路由确认句', (() => { const r = askPreExecute('run_code', purposeRunCode, []); return r !== null && r !== undefined && r.kind === 'deny' && String(r.reason).includes(ROUTE_CONFIRM_TEXT) })(), true],
  ['AS12b run_code 内 direct 态目的 ask → deny 且聚合含固定路由确认句', (() => { const r = askPreExecute('run_code', purposeRunCode, askDirectEvents); return r !== null && r !== undefined && r.kind === 'deny' && String(r.reason).includes(ROUTE_CONFIRM_TEXT) })(), true],
]
for (const [name, got, expected] of AS) check(name, got, expected)

let dispatchSeriesChecks = 0
function runDispatchSeries(ev) {
  const cdStart = (name, sid, argsObj) => ({ type: ev.start, data: { rootCallId: 'r1', parentCallId: 'pc1', subCallId: sid, name, arguments: argsObj } })
  const cdEnd = (sid, text, isError = false) => ({ type: ev.end, data: { rootCallId: 'r1', parentCallId: 'pc1', subCallId: sid, name: 'ask_user_question', arguments: {}, isError, content: [{ type: 'text', text }] } })

// ── F-code 系列:deriveFlowState 识别 run_code 内嵌套 ask（F1 桥接） ─────────
const fullNestedPlanApprovedEvents = [
  um(),
  cdStart('ask_user_question', 'fn1', nestedRouteArgs),
  cdEnd('fn1', answer(['进行pro规划'])),
  cdStart('ask_user_question', 'fn2', nestedPurposeArgs),
  cdEnd('fn2', answer(['完善方案'])),
  cdStart('ask_user_question', 'fn3', nestedClarifyArgs),
  cdEnd('fn3', answer(['方案A'])),
  cdStart('ask_user_question', 'fn4', nestedApprovalArgs),
  cdEnd('fn4', answer(['同意执行'])),
]
// 2026-09-23 同步（步骤 2/3 的 denied 语义）：嵌套失败结果按文案二分——
// ① 插件闸门拒绝 = 'Error: ' + 中文 reason（实测形状，本常量即 purposeRouteDenyReason 产物形状）→ kind:'denied'，状态不重置；
// ② 宿主取消句 = HOST_ASK_CANCEL_TEXTS 逐字成员 → kind:'error', code:''，resetRouteState 清四字段。
// 原 FC7/FC11 的自造文案（'Error: ask failed' / 'Error: ask cancelled'）不在两类中，已按实测口径同步。
const FC_DENY_TEXT = 'Error: 目的确认 ask 未按路由顺序：须先 ask_user_question 路由确认（选项固定为「直接执行」「进行pro规划」「不同意」），选择「进行pro规划」后再询问规划目的（目的选项固定为「完善方案」「重新规划」）'
const FC_CANCEL_TEXT = 'Error: ask_user_question was aborted before the user answered'
const FC = [
  ['FC1 嵌套路由答「直接执行」→ direct', [um(), cdStart('ask_user_question', 'n1', nestedRouteArgs), cdEnd('n1', answer(['直接执行']))], { route: 'direct', clarified: false, approved: false, purpose: 'none', channelBroken: false }],
  ['FC2 嵌套路由答「进行pro规划」→ plan', [um(), cdStart('ask_user_question', 'n1', nestedRouteArgs), cdEnd('n1', answer(['进行pro规划']))], { route: 'plan', clarified: false, approved: false, purpose: 'none', channelBroken: false }],
  ['FC3 嵌套路由答「不同意」→ none', [um(), cdStart('ask_user_question', 'n1', nestedRouteArgs), cdEnd('n1', answer(['不同意']))], { route: 'none', clarified: false, approved: false, purpose: 'none', channelBroken: false }],
  ['FC4 嵌套澄清自定义答复（目的未定）→ 未澄清', [um(), cdStart('ask_user_question', 'n1', nestedRouteArgs), cdEnd('n1', answer(['进行pro规划'])), cdStart('ask_user_question', 'n2', nestedClarifyArgs), cdEnd('n2', customAnswer)], { route: 'plan', clarified: false, approved: false, purpose: 'none', channelBroken: false }],
  ['FC5 嵌套批准「同意执行」（目的未定·未澄清）→ approved', [um(), cdStart('ask_user_question', 'n1', nestedRouteArgs), cdEnd('n1', answer(['进行pro规划'])), cdStart('ask_user_question', 'n2', nestedClarifyArgs), cdEnd('n2', answer(['方案A'])), cdStart('ask_user_question', 'n3', nestedApprovalArgs), cdEnd('n3', answer(['同意执行']))], { route: 'plan', clarified: false, approved: true, purpose: 'none', channelBroken: false }],
  ['FC6 嵌套空白 answers:[] → 全默认', [um(), cdStart('ask_user_question', 'n1', nestedRouteArgs), cdEnd('n1', emptyAnswer)], { route: 'none', clarified: false, approved: false, purpose: 'none', channelBroken: false }],
  ['FC7 嵌套闸门拒绝（denied：真实中文文案）→ 五字段保持默认（拒绝不重置）', [um(), cdStart('ask_user_question', 'n1', nestedRouteArgs), cdEnd('n1', FC_DENY_TEXT, true)], { route: 'none', clarified: false, approved: false, purpose: 'none', channelBroken: false }],
  ['FC8 直呼+嵌套混排互不干扰（后答生效）', [um(), cdStart('ask_user_question', 'n1', nestedRouteArgs), cdEnd('n1', answer(['直接执行'])), call('ask_user_question', 'a1', routeArgs), ok('a1', answer(['进行pro规划']))], { route: 'plan', clarified: false, approved: false, purpose: 'none', channelBroken: false }],
  ['FC9 嵌套目的 ask 答「完善方案」→ purpose=refine 且 clarified=false', [um(), cdStart('ask_user_question', 'n1', nestedRouteArgs), cdEnd('n1', answer(['进行pro规划'])), cdStart('ask_user_question', 'n2', nestedPurposeArgs), cdEnd('n2', answer(['完善方案']))], { route: 'plan', clarified: false, approved: false, purpose: 'refine', channelBroken: false }],
  ['FC10 嵌套完整阶段后重选「直接执行」→ 清理阶段状态', fullNestedPlanApprovedEvents.concat([cdStart('ask_user_question', 'fn5', nestedRouteArgs), cdEnd('fn5', answer(['直接执行']))]), { route: 'direct', clarified: false, approved: false, purpose: 'none', channelBroken: false }],
  ['FC11 嵌套完整阶段后宿主取消句（取消仍清四字段）→ 五字段清理', fullNestedPlanApprovedEvents.concat([cdStart('ask_user_question', 'fn5', nestedRouteArgs), cdEnd('fn5', FC_CANCEL_TEXT, true)]), { route: 'none', clarified: false, approved: false, purpose: 'none', channelBroken: false }],
  ['FC12 嵌套完整阶段后闸门拒绝（denied）→ 五字段全保留（route=plan、目的/澄清/批准不动）', fullNestedPlanApprovedEvents.concat([cdStart('ask_user_question', 'fn5', nestedRouteArgs), cdEnd('fn5', FC_DENY_TEXT, true)]), { route: 'plan', clarified: true, approved: true, purpose: 'refine', channelBroken: false }],
]
for (const [name, events, expected] of FC) {
  check(name, deriveFlowState(events, gateRuntime), expected)
}


// ── C-code/CU-code 系列:toolCallCount / toolCallsSinceUser 计入嵌套调用（F2 桥接） ──
const CC = [
  ['CC1 单 dispatch-start（容器计费）→ 0', [cdStart('read', 'n1', {}), cdEnd('n1', 'ok')], new Set([]), 0],
  ['CC2 直呼×2+dispatch-start×2 → 2（子调用不计）', [call('read', 'c1'), ok('c1', 'r'), call('glob', 'c2'), ok('c2', 'r'), cdStart('pwsh', 'n1', {}), cdEnd('n1', 'ok'), cdStart('read', 'n2', {}), cdEnd('n2', 'ok')], new Set([]), 2],
  ['CC3 skipNames 含 save_plan → 嵌套 save_plan 不计（子调用全部不计）', [cdStart('save_plan', 'n1', {}), cdEnd('n1', 'ok'), cdStart('read', 'n2', {}), cdEnd('n2', 'ok')], new Set(['save_plan']), 0],
  ['CC4 嵌套 skipNames 白名单不含（glob/read）→ 子调用不计（现为 0）', [cdStart('send_message', 'n1', {}), cdEnd('n1', 'ok'), cdStart('glob', 'n2', {}), cdEnd('n2', 'ok'), cdStart('read', 'n3', {}), cdEnd('n3', 'ok')], new Set(['save_plan', 'send_message']), 0],
  ['CC5 dispatch isError 不计（子调用不计）', [cdStart('read', 'n1', {}), cdEnd('n1', 'x', true)], new Set([]), 0],
  ['CC6 start 无 dispatch 不计', [cdStart('read', 'n1', {})], new Set([]), 0],
  ['CC7 容器+子调用混合 → 只计容器 1', [call('read', 'c1'), ok('c1', 'r'), cdStart('read', 'n1', {}), cdEnd('n1', 'ok')], new Set([]), 1],
]
for (const [name, events, skip, expected] of CC) {
  check(name, toolCallCount(events, skip), expected)
}

const CUCODE = [
  ['CUC1 kind=user 锚点后嵌套计数（子调用不计）→ 0', [umk('user'), cdStart('read', 'n1', {}), cdEnd('n1', 'ok'), cdStart('glob', 'n2', {}), cdEnd('n2', 'ok')], new Set([]), 0],
  ['CUC2 锚点后直呼+嵌套混合 → 只计直呼 1', [umk('user'), call('read', 'a1'), ok('a1', 'r'), cdStart('pwsh', 'n1', {}), cdEnd('n1', 'ok')], new Set([]), 1],
]
for (const [name, events, skip, expected] of CUCODE) {
  check(name, toolCallsSinceUser(events, skip), expected)
}

// ── DG 系列:runCodeDispatchGateReason 运行时实例上限判定 ─────────────────
const dg18 = Array.from({ length: 18 }, (_, i) => cdStart('read', 'd' + i, {}))
const dg19 = dg18.concat([cdStart('read', 'd19', {})])
const DG = [
  ['DG1 18×dispatch-start + cap18 → null', runCodeDispatchGateReason(dg18, { rootCallId: 'r1' }, 18), null],
  ['DG2 19×dispatch-start → 非 null 且含「超过上限」', runCodeDispatchGateReason(dg19, { rootCallId: 'r1' }, 18) !== null && String(runCodeDispatchGateReason(dg19, { rootCallId: 'r1' }, 18)).includes('超过上限'), true],
  ['DG3 exec 无 rootCallId → null', runCodeDispatchGateReason(dg18, {}, 18), null],
  ['DG4 cap=0 → null', runCodeDispatchGateReason(dg18, { rootCallId: 'r1' }, 0), null],
  ['DG5 events 非数组 → null', runCodeDispatchGateReason(null, { rootCallId: 'r1' }, 18), null],
]
for (const [name, got, expected] of DG) {
  check(name, got, expected)
}
  dispatchSeriesChecks += FC.length + CC.length + CUCODE.length + DG.length
}
runDispatchSeries({ start: 'tool/ptc-dispatch-start', end: 'tool/ptc-dispatch' }) // 默认轮：0.1.5-rc.2 新名
if (process.env.EXTRA_PLAN_LEGACY_ROUND === '1') runDispatchSeries({ start: 'tool/code-dispatch-start', end: 'tool/code-dispatch' }) // 旧名轮：0.1.2-rc.1（可开关）

// ── IS 系列:isRunCodeSubCall 子调用语义判定（容器计费 / 实例上限） ──────────
const IS = [
  ['IS1 parent 定义 → true', { parent: Symbol('p') }, true],
  ['IS2 sub:true 合成成员 → true', { sub: true }, true],
  ['IS3 普通 exec → false', { name: 'read' }, false],
]
for (const [name, exec, expected] of IS) {
  check(name, isRunCodeSubCall(exec), expected)
}

// ── SCD 系列:runCodeSiteCount 静态调用点计数（单实例上限快路径） ───────────
const SCD = [
  ['SCD1 2 调用 → 2', "await tools.read({ file_path: 'x' })\nawait tools.read({ file_path: 'y' })", 2],
  ['SCD2 嵌套展平 → 3', String.raw`await tools.run_code({ "code": "await tools.read({ file_path: 'a' })\nawait tools.read({ file_path: 'b' })" })\nawait tools.read({ file_path: 'c' })`, 3],
  ['SCD3 空串 → 0', '', 0],
  ['SCD4 undefined → 0', undefined, 0],
]
for (const [name, code, expected] of SCD) {
  check(name, runCodeSiteCount(code), expected)
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

// ── ASK 系列:ask_user_question 返回链闸门纯函数（任务1/2） ─────────────
const ASK_RETURN = [
  ['AR1 无 ask 源码 → null', 'const x = 1', null],
  ['AR2 直接 return-await → null', 'return await tools.ask_user_question({})', null],
  ['AR3 单变量 JSON.stringify 返回 → null', 'const q = await tools.ask_user_question({}); return JSON.stringify({ question: q })', null],
  ['AR3b 单变量直接 return → null', 'const q = await tools.ask_user_question({}); return q', null],
  ['AR4 裸 await → 拒绝', 'await tools.ask_user_question({})', 'deny'],
  ['AR5 只赋值不返回 → 拒绝', 'const q = await tools.ask_user_question({})', 'deny'],
  ['AR6 return 未按边界引用 q → 拒绝', 'const q = await tools.ask_user_question({}); return JSON.stringify({ question: qq })', 'deny'],
  ['AR7 console.log 消费 ask → 拒绝', 'console.log(await tools.ask_user_question({}))', 'deny'],
  ['AR8 .then 包装 → 拒绝', 'return await tools.ask_user_question({}).then((x) => x)', 'deny'],
  ['AR9 工具别名 → 拒绝', 'const ask = tools.ask_user_question; return await ask({})', 'deny'],
  ['AR10 动态工具访问 → 拒绝', "const name = 'ask_user_question'; return await tools[name]({})", 'deny'],
  ['AR11 动态复杂包装 → 拒绝', 'return await Promise.resolve(tools.ask_user_question({}))', 'deny'],
  ['AR12 字符串/注释中的 ask 不触发', "const s = 'tools.ask_user_question({})'; // tools.ask_user_question({})", null],
]
for (const [name, code, expected] of ASK_RETURN) {
  const got = askUserQuestionReturnGateReason(code)
  const okResult = expected === null
    ? got === null
    : typeof got === 'string' && got.includes('结果未正确返回用户层')
  if (okResult) { pass += 1 } else { fail += 1 }
  console.log((okResult ? 'PASS' : 'FAIL') + '  ' + name + '  (期望 ' + JSON.stringify(expected) + ', 实际 ' + JSON.stringify(got) + ')')
}

// ── I 系列:runCodeGroupDenyReason 主会话组判定（F7' v4:拆解 → 组判定 → 聚合） ──
const readOnlyCodeFx = "await readFileSync('x', 'utf8')"
const writeCodeFx = "await writeFileSync('x', '1')"
const noneStateFx = { route: 'none', clarified: false, approved: false, purpose: 'none', channelBroken: false }
const planStateFx = { route: 'plan', clarified: true, approved: false, purpose: 'refine', channelBroken: false }
const approvedStateFx = { route: 'plan', clarified: true, approved: true, purpose: 'refine', channelBroken: false }
  const mainGroupReason = (state, code) => runCodeGroupDenyReason(state, { arguments: { code } }, { kind: 'main' }, { gateRuntime })
const I = [
  ['I1 主会话 none+纯只读 → 放行(null)', readOnlyCodeFx, noneStateFx, null],
  ['I2 主会话 none+裸写 → 聚合含 routeDenyReason(write/edit,{route:none}) 全文', writeCodeFx, noneStateFx, [routeDenyReason('write/edit', { route: 'none' }, gateRuntime)]],
  ['I3 主会话 plan+裸写 → 聚合含 routeDenyReason(write/edit,{route:plan}) 全文（含「规划态下主会话不可写文件」）', writeCodeFx, planStateFx, [routeDenyReason('write/edit', { route: 'plan' }, gateRuntime)]],
  ['I4 主会话 approved+纯只读 → 放行(null)（v4:组空全过，ptc 死锁解除）', readOnlyCodeFx, approvedStateFx, null],
  ['I5 主会话 approved+裸写 → 聚合含「方案已批准，执行请走 subagent 委派」', writeCodeFx, approvedStateFx, ['方案已批准，执行请走 subagent 委派']],
  ['I6 主会话 approved+tools.subagent(run_in_background:true) → 放行(null)', "await tools.subagent({ task: 'x', run_in_background: true })", approvedStateFx, null],
  ['I7 主会话 none+裸写+subagent_plan → 聚合同时含两条子文案', "await writeFileSync('x', '1'); await tools.subagent_plan({ task: '规划', run_in_background: true })", noneStateFx, [routeDenyReason('write/edit', { route: 'none' }, gateRuntime), planDenyReason('subagent_plan', { route: 'none' }, gateRuntime)]],
]
for (const [name, code, state, expected] of I) {
  const got = mainGroupReason(state, code)
  const okResult = expected === null ? got === null : typeof got === 'string' && expected.every((s) => got.includes(s))
  if (okResult) { pass += 1 } else { fail += 1 }
  console.log(`${okResult ? 'PASS' : 'FAIL'}  ${name}  (期望 ${JSON.stringify(expected)}, 实际 ${JSON.stringify(got)})`)
}

// ── ASK-G 系列:主会话组判定硬闸门（与 runcodeCatchGate 解耦） ─────────────
const ASK_GROUP = [
  ['AG1 main+runcodeCatchGate:false 裸 await ask → 聚合拒绝', 'await tools.ask_user_question({})', { runcodeCatchGate: false }, 'deny'],
  ['AG2 main+runcodeCatchGate 缺省裸 await ask → 聚合拒绝', 'await tools.ask_user_question({})', {}, 'deny'],
  ['AG3 main 直接 return-await ask → 放行(null)', 'return await tools.ask_user_question({})', {}, null],
  ['AG4 main 单变量 JSON.stringify ask → 放行(null)', 'const q = await tools.ask_user_question({}); return JSON.stringify({ question: q })', {}, null],
  ['AG4b main 单变量直接 return ask → 放行(null)', 'const q = await tools.ask_user_question({}); return q', {}, null],
  ['AG5 planner 不接入 ask 返回值门 → 放行(null)', 'await tools.ask_user_question({})', {}, null, { kind: 'planner' }],
]
for (const [name, code, gateCtx, expected, role] of ASK_GROUP) {
  const got = runCodeGroupDenyReason(undefined, { arguments: { code } }, role !== undefined ? role : { kind: 'main' }, Object.assign({}, gateCtx, { gateRuntime }))
  const okResult = expected === null
    ? got === null
    : typeof got === 'string' && got.includes('结果未正确返回用户层')
  if (okResult) { pass += 1 } else { fail += 1 }
  console.log((okResult ? 'PASS' : 'FAIL') + '  ' + name + '  (期望 ' + JSON.stringify(expected) + ', 实际 ' + JSON.stringify(got) + ')')
}

// ── J 系列:decomposeRunCode 拆解器（F7' v4 静态预审，返回 {members,dynamic} 全文） ──
const J = [
  ['J1 单工具 await 提取（JSON 参数可解析）', "await tools.read({ \"file_path\": \"x\" })", { members: [{ kind: 'tool', name: 'read', argsParsed: true, args: { file_path: 'x' }, argsText: '{ "file_path": "x" }' }], dynamic: false }],
  ['J2 多工具+多行嵌套参数', "await tools.read({ \"file_path\": \"x\" })\nawait tools.glob({ \"pattern\": \"**/*.md\" })", { members: [{ kind: 'tool', name: 'read', argsParsed: true, args: { file_path: 'x' }, argsText: '{ "file_path": "x" }' }, { kind: 'tool', name: 'glob', argsParsed: true, args: { pattern: '**/*.md' }, argsText: '{ "pattern": "**/*.md" }' }], dynamic: false }],
  ['J3 参数内括号字符串不干扰配平（单引号参数不可解析但 innerText 完整）', "await tools.read({ path: 'a)(' })", { members: [{ kind: 'tool', name: 'read', argsParsed: false, args: null, argsText: "{ path: 'a)(' }" }], dynamic: false }],
  ['J4 字符串内 tools.read 不提取', "const s = 'tools.read({ file_path: 1 })'", { members: [], dynamic: false }],
  ['J5 注释内 tools.write 不提取', "// tools.write({})\nreadFileSync('x')", { members: [], dynamic: false }],
  ['J6 同名同参去重→1 项', "tools.read({ \"file_path\": \"x\" }); tools.read({ \"file_path\": \"x\" })", { members: [{ kind: 'tool', name: 'read', argsParsed: true, args: { file_path: 'x' }, argsText: '{ "file_path": "x" }' }], dynamic: false }],
  ['J7 同名不同参保留→2 项', "tools.read({ \"file_path\": \"x\" }); tools.read({ \"file_path\": \"y\" })", { members: [{ kind: 'tool', name: 'read', argsParsed: true, args: { file_path: 'x' }, argsText: '{ "file_path": "x" }' }, { kind: 'tool', name: 'read', argsParsed: true, args: { file_path: 'y' }, argsText: '{ "file_path": "y" }' }], dynamic: false }],
  ['J8 参数不可解析（变量）→argsParsed:false', 'tools.read(args)', { members: [{ kind: 'tool', name: 'read', argsParsed: false, args: null, argsText: 'args' }], dynamic: false }],
  ['J9 裸写 writeFileSync→{kind:bare-write,name:write,hints:[fs-write]}', "await writeFileSync('x', '1')", { members: [{ kind: 'bare-write', name: 'write', hints: ['fs-write'] }], dynamic: false }],
  ['J10 工具+裸写同现→2 项且裸写排末尾', "tools.read({ \"file_path\": \"x\" }); writeFileSync('x', '1')", { members: [{ kind: 'tool', name: 'read', argsParsed: true, args: { file_path: 'x' }, argsText: '{ "file_path": "x" }' }, { kind: 'bare-write', name: 'write', hints: ['fs-write'] }], dynamic: false }],
  ['J11 tools[\'write\'] 字面量方括号→静态名 write', "await tools['write']({ \"file_path\": \"x\", \"content\": \"1\" })", { members: [{ kind: 'tool', name: 'write', argsParsed: true, args: { file_path: 'x', content: '1' }, argsText: '{ "file_path": "x", "content": "1" }' }], dynamic: false }],
  ['J12 tools[name](...)→members=[] 且 dynamic=true', "const name = 'read'; tools[name]({ file_path: 'x' })", { members: [], dynamic: true }],
  ['J13 空 code→{members:[],dynamic:false}', '', { members: [], dynamic: false }],
  ['J14 纯只读裸代码→空组', "await readFileSync('x', 'utf8')", { members: [], dynamic: false }],
]
for (const [name, code, expected] of J) {
  check(name, decomposeRunCode(code), expected)
}

// ── RC 系列:拆分后静态模块边界与静态 helper 直接回归 ─────────────────
const rcL1Code = [
  "const one = 'tools.write({ path: " + String.fromCharCode(92) + "'x" + String.fromCharCode(92) + "' })';",
  "const two = " + JSON.stringify('tools.edit({ file_path: "x" })') + ";",
  "const tpl = " + String.fromCharCode(96) + "tools.write({}) " + String.fromCharCode(36) + "{tools.edit({})}" + String.fromCharCode(96) + ";",
  'tools.read({ "file_path": "ok" })',
].join('\n')
const rcL1Masked = maskCodeLiteralsAndComments(rcL1Code)
const rcL1Result = decomposeRunCode(rcL1Code)
checkTrue('RC-L1 转义单/双引号、反引号与模板插值不产生成员', rcL1Masked.length === rcL1Code.length && rcL1Result.dynamic === false && rcL1Result.members.length === 1 && rcL1Result.members[0].name === 'read')

const rcL2Code = "// tools.write({})\r\n/* tools.edit({}) */\r\ntools.read({})"
const rcL2Masked = maskCodeLiteralsAndComments(rcL2Code)
const rcL2Result = decomposeRunCode(rcL2Code)
const rcL2UnclosedString = "const s = 'tools.write({})\r\ntools.read({})"
const rcL2UnclosedBlock = "/* tools.edit({})\r\ntools.read({})"
checkTrue('RC-L2 行/块注释与 CRLF 保留且遮蔽区不产生成员', rcL2Masked.length === rcL2Code.length && rcL2Masked.includes('\r\n') && rcL2Result.members.length === 1 && rcL2Result.members[0].name === 'read')
checkTrue('RC-L2 未闭合字符串/块注释等长遮蔽并保留换行', maskCodeLiteralsAndComments(rcL2UnclosedString).length === rcL2UnclosedString.length && maskCodeLiteralsAndComments(rcL2UnclosedString).includes('\r\n') && decomposeRunCode(rcL2UnclosedString).members.length === 0 && maskCodeLiteralsAndComments(rcL2UnclosedBlock).length === rcL2UnclosedBlock.length && maskCodeLiteralsAndComments(rcL2UnclosedBlock).includes('\r\n') && decomposeRunCode(rcL2UnclosedBlock).members.length === 0)

const rcL3Text = "tools.read({ nested: [1, { ok: (true) }] }) tail"
const rcL3Paren = rcL3Text.indexOf('(')
const rcL3Slice = sliceBalancedArgs(maskCodeLiteralsAndComments(rcL3Text), rcL3Text, rcL3Paren)
check('RC-L3 嵌套括号配平返回原始 innerText', rcL3Slice, { closeIdx: rcL3Text.lastIndexOf(')'), innerText: '{ nested: [1, { ok: (true) }] }' })
const rcL4Text = "tools.read({ nested: [1, { ok: true }]"
const rcL4Paren = rcL4Text.indexOf('(')
const rcL4Slice = sliceBalancedArgs(maskCodeLiteralsAndComments(rcL4Text), rcL4Text, rcL4Paren)
check('RC-L4 未配平 closeIdx=末尾且保留尾部 innerText', rcL4Slice, { closeIdx: rcL4Text.length - 1, innerText: rcL4Text.slice(rcL4Paren + 1) })

const rcD1Code = "const name = 'read'; tools[name]({ file_path: 'x' })"
const rcD1Result = decomposeRunCode(rcD1Code)
const rcD1Sites = plugin.decisions.collectRunCodeSites(rcD1Code, maskCodeLiteralsAndComments(rcD1Code))
const rcD1NonCallCode = 'const name = tools[name]'
const rcD1NonCallSites = plugin.decisions.collectRunCodeSites(rcD1NonCallCode, maskCodeLiteralsAndComments(rcD1NonCallCode))
checkTrue('RC-D1 tools[name](...) dynamic=true、site.name=undefined，非调用不计 site', rcD1Result.dynamic === true && rcD1Result.members.length === 0 && rcD1Sites.length === 1 && rcD1Sites[0].name === undefined && rcD1NonCallSites.length === 0)

const rcN1Inner = 'await tools.write({})'
const rcN1Code = 'await tools.run_code({ "code": ' + JSON.stringify(rcN1Inner) + ' })'
const rcN1Result = decomposeRunCode(rcN1Code)
const rcN1FlattenReason = runCodeGroupDenyReason(noneStateFx, { name: 'run_code', arguments: { code: rcN1Code } }, { kind: 'main' }, { gateRuntime })
const rcN1UnparsedCode = 'await tools.run_code({ code: nested })'
const rcN1UnparsedResult = decomposeRunCode(rcN1UnparsedCode)
const rcN1UnparsedReason = runCodeGroupDenyReason(noneStateFx, { name: 'run_code', arguments: { code: rcN1UnparsedCode } }, { kind: 'main' }, { gateRuntime })
checkTrue('RC-N1 可解析嵌套 run_code 一层展平、不可解析参数保留运行时', rcN1Result.dynamic === false && rcN1Result.members.length === 1 && rcN1Result.members[0].name === 'run_code' && rcN1Result.members[0].argsParsed === true && typeof rcN1FlattenReason === 'string' && rcN1FlattenReason.includes('- write:') && rcN1UnparsedResult.members.length === 1 && rcN1UnparsedResult.members[0].name === 'run_code' && rcN1UnparsedResult.members[0].argsParsed === false && rcN1UnparsedReason === null)

const rcP1Result = decomposeRunCode('tools.read({ "file_path": "x" }); tools.read({ "file_path": "y" })')
checkTrue('RC-P1 同名不同 JSON 参数保留两个成员', rcP1Result.members.length === 2 && rcP1Result.members[0].name === 'read' && rcP1Result.members[1].name === 'read' && rcP1Result.members[0].args.file_path === 'x' && rcP1Result.members[1].args.file_path === 'y')

const rcDgEvents = [
  { type: 'tool/ptc-dispatch-start', data: { rootCallId: 'rc-same' } },
  { type: 'tool/code-dispatch-start', data: { rootCallId: 'rc-same' } },
  { type: 'tool/code-dispatch-start', data: { rootCallId: 'rc-other' } },
]
const rcDgExceeded = runCodeDispatchGateReason(rcDgEvents, { rootCallId: 'rc-same' }, 1)
checkTrue('RC-DG1 新旧 dispatch-start 同 root 计数、异 root 不计，非法 cap/root 返回 null', typeof rcDgExceeded === 'string' && rcDgExceeded.includes('子调用数 2') && runCodeDispatchGateReason(rcDgEvents, { rootCallId: 'rc-same' }, 2) === null && runCodeDispatchGateReason(rcDgEvents, { rootCallId: 'rc-same' }, 0) === null && runCodeDispatchGateReason(rcDgEvents, { rootCallId: 'rc-same' }, -1) === null && runCodeDispatchGateReason(rcDgEvents, { rootCallId: 'rc-same' }, 1.5) === null && runCodeDispatchGateReason(rcDgEvents, { rootCallId: 7 }, 1) === null)

const rcAgReason = runCodeGroupDenyReason(undefined, { name: 'run_code', arguments: { code: 'await tools.write({})\nawait tools.subagent_probe({})' } }, { kind: 'planner' }, {})
checkTrue('RC-AG1 planner write+subagent_probe 聚合 2 项且保持成员顺序', typeof rcAgReason === 'string' && rcAgReason.includes('工具组共 2 项（去重后），2 项触发闸门') && rcAgReason.includes('规划子代理只读') && rcAgReason.includes('仅主会话可用') && rcAgReason.indexOf('- write:') < rcAgReason.indexOf('- subagent_probe:'))

// ── K 系列:子代理角色组判定（F7' v4;role = {kind:'planner'}/{kind:'child',readOnly,probe}） ──
// 预算耗尽白名单 fixture（T2 修复）：18 组成功配对 = 已用 18/18（与 step-04 budgetEvents 同口径）。
const budgetEventsFx = [um(), ...Array.from({ length: 18 }, (_, i) => [call('read', 'b' + i), ok('b' + i, 'ok')]).flat()]
const K = [
  ['K1 planner+裸写 → 聚合含「只读角色仅允许只读探查」与「命中」', { kind: 'planner' }, writeCodeFx, ['只读角色仅允许只读探查', '命中']],
  ['K2 planner+tools.write → 聚合含「规划子代理只读」', { kind: 'planner' }, "await tools.write({ file_path: 'x', content: '1' })", ['规划子代理只读']],
  ['K3 planner+纯只读 → 放行(null)', { kind: 'planner' }, readOnlyCodeFx, null],
  ['K4 child-probe+裸写 → 聚合含「只读角色仅允许只读探查」', { kind: 'child', readOnly: true, probe: true }, writeCodeFx, ['只读角色仅允许只读探查']],
  ['K5 child-probe+tools.write → 聚合含「探查者只读」', { kind: 'child', readOnly: true, probe: true }, "await tools.write({ file_path: 'x', content: '1' })", ['探查者只读']],
  ['K6 child-reviewer+tools.write → 聚合含「验收复核者只读」', { kind: 'child', readOnly: true, probe: false }, "await tools.write({ file_path: 'x', content: '1' })", ['验收复核者只读']],
  ['K7 执行者+裸写 → 放行(null)', { kind: 'child', readOnly: false, probe: false }, writeCodeFx, null],
  ['K8 执行者+tools.write → 放行(null)', { kind: 'child', readOnly: false, probe: false }, "await tools.write({ file_path: 'x', content: '1' })", null],
  ['K9 planner+预算耗尽+仅 save_plan 成员 → 放行(null)', { kind: 'planner' }, 'await tools.save_plan({ "plan": "p", "checklist": "c" })', null, { events: budgetEventsFx, exploreBudget: 18 }],
  ['K10 planner+预算耗尽+read 成员 → 聚合含「探查预算已耗尽（本轮已用 18/18）」与「仅可调用 save_plan/send_message」', { kind: 'planner' }, "await tools.read({ file_path: 'x' })", ['探查预算已耗尽（本轮已用 18/18）', '仅可调用 save_plan/send_message'], { events: budgetEventsFx, exploreBudget: 18 }],
]
for (const [name, role, code, expected, gateCtx] of K) {
  const got = runCodeGroupDenyReason(undefined, { arguments: { code } }, role, Object.assign({}, gateCtx !== undefined ? gateCtx : {}, { gateRuntime }))
  const okResult = expected === null ? got === null : typeof got === 'string' && expected.every((s) => got.includes(s))
  if (okResult) { pass += 1 } else { fail += 1 }
  console.log(`${okResult ? 'PASS' : 'FAIL'}  ${name}  (期望 ${JSON.stringify(expected)}, 实际 ${JSON.stringify(got)})`)
}

// ── GW 系列：YAML 单一来源、prompt variable 契约、严格校验与动态词表 ────────
const GATE_FIELD_NAMES = ['routeDirect', 'routePlan', 'routeDisagree', 'approvalApprove', 'approvalReplan', 'purposeRefine', 'purposeRedo']
const GATE_VARIABLE_NAMES = ['extra_plan_route_direct', 'extra_plan_route_plan', 'extra_plan_route_disagree', 'extra_plan_approval_approve', 'extra_plan_approval_replan', 'extra_plan_purpose_refine', 'extra_plan_purpose_redo']
const factoryValuesPattern = new RegExp(GATE_FIELD_NAMES.map((field) => assetGateWords[field]).join('|'))

// GWY1-GWY3：YAML 七键布局 / 字段元数据契约（迁移叶 locator 已随搬迁链删除，不再断言）
check('GWY1 资产 YAML config.gateWords 直属键恰为 7 个闸门字段', Object.keys(assetGateWords), GATE_FIELD_NAMES)
check('GWY2 GATE_WORD_FIELDS 恰 7 项且每项只含 field/variable 元数据', GATE_WORD_FIELDS.map((item) => Object.keys(item).sort().join('+')), GATE_FIELD_NAMES.map(() => 'field+variable'))
check('GWY3 GATE_WORD_FIELDS 的 field/variable 与 YAML 键一一对应', GATE_WORD_FIELDS.map((item) => [item.field, item.variable]), GATE_FIELD_NAMES.map((field, index) => [field, GATE_VARIABLE_NAMES[index]]))

// GWY5-GWY7：persona 锚点双键同源、7 个变量引用、无值字面量
const personaRow = assetRowsAll.find((row) => row.id === 'persona')
const personaText = personaRow.config.prefix
check('GWY5 persona prefix === text（两代键逐字同源）', personaRow.config.text === personaText, true)
check('GWY6 persona 正文引用的变量集合恰为 7 个', Array.from(new Set(personaText.match(/\{\{extra_plan_[a-z_]+\}\}/g) || [])).sort(), GATE_VARIABLE_NAMES.map((name) => '{{' + name + '}}').sort())
check('GWY7 persona 正文不含任何闸门值字面量', factoryValuesPattern.test(personaText), false)
check('GWY7b lib/gate-words.js 对 7 个出厂词 0 命中（JS 侧无第二份真源）', factoryValuesPattern.test(readFileSync(GATE_WORDS_LIB_FILE, 'utf8')), false)

// GWY8-GWY9：宿主严格 renderPrompt 对 prefix/text 都完成替换
const hostSystemPromptEntry = (() => {
  const candidates = []
  if (process.platform === 'win32') {
    const appData = typeof process.env.APPDATA === 'string' && process.env.APPDATA !== '' ? process.env.APPDATA.replaceAll(String.fromCharCode(92), '/') : String(process.env.USERPROFILE || '') + '/AppData/Roaming'
    candidates.push(appData + '/npm/node_modules/@deepseek-ai/dsh/node_modules/@deepseek-ai/dsh-system-prompt/lib/index.js')
  } else {
    candidates.push('/usr/local/lib/node_modules/@deepseek-ai/dsh/node_modules/@deepseek-ai/dsh-system-prompt/lib/index.js')
  }
  for (const candidate of candidates) if (existsSync(candidate)) return candidate
  return null
})()
const hostRenderPrompt = hostSystemPromptEntry === null ? null : (await import(pathToFileURL(hostSystemPromptEntry).href)).renderPrompt
const renderedPrefix = typeof hostRenderPrompt === 'function' ? hostRenderPrompt({ sections: [{ name: 'deployment:persona', text: personaText }], contexts: [], variables: gateRuntime.variables }) : ''
const renderedText = typeof hostRenderPrompt === 'function' ? hostRenderPrompt({ sections: [{ name: 'deployment:persona', text: personaRow.config.text }], contexts: [], variables: gateRuntime.variables }) : null
checkTrue('GWY8 宿主严格 renderPrompt 对 prefix 完成全部变量替换且含 7 个当前值', typeof hostRenderPrompt === 'function' && !renderedPrefix.includes('{{') && GATE_FIELD_NAMES.every((field) => renderedPrefix.includes(assetGateWords[field])))
checkTrue('GWY9 宿主严格 renderPrompt 对 text 键（0.1.2-rc.1 旧键）结果与 prefix 逐字相等', typeof hostRenderPrompt === 'function' && renderedText === renderedPrefix && !renderedText.includes('{{'))

// GWV 系列：validator 非法矩阵（表驱动，全部必须抛同一前缀）
const cloneWords = (patch) => Object.assign({}, gateRuntime.words, patch)
const dropField = (field) => { const out = Object.assign({}, gateRuntime.words); delete out[field]; return out }
const GWV = [
  ['非对象 undefined', undefined],
  ['null', null],
  ['数组', [gateRuntime.words.routeDirect]],
  ['整组缺失（空对象）', {}],
  ['单键缺失 routePlan', dropField('routePlan')],
  ['额外键', cloneWords({ extraKey: 'x' })],
  ['非字符串（数字）', cloneWords({ routeDirect: 42 })],
  ['空串', cloneWords({ routeDirect: '' })],
  ['首尾空白', cloneWords({ routeDirect: ' ' + gateRuntime.words.routeDirect })],
  ['CR/LF', cloneWords({ routeDirect: gateRuntime.words.routeDirect + String.fromCharCode(10) })],
  ['重复值', cloneWords({ approvalApprove: gateRuntime.words.routeDirect })],
  ['保留后缀 (Recommended)', cloneWords({ routeDirect: gateRuntime.words.routeDirect + ' (Recommended)' })],
  ['保留后缀 （Recommended）', cloneWords({ routeDirect: gateRuntime.words.routeDirect + '（Recommended）' })],
  ['保留后缀 (推荐)', cloneWords({ routeDirect: gateRuntime.words.routeDirect + '(推荐)' })],
  ['保留后缀 （推荐）', cloneWords({ routeDirect: gateRuntime.words.routeDirect + '（推荐）' })],
]
let validatorMatrixOk = true
for (const [label, raw] of GWV) {
  let message = null
  try { validateGateWords(raw) } catch (error) { message = error instanceof Error ? error.message : String(error) }
  if (message === null || !message.startsWith('extra-plan: config.gateWords')) {
    validatorMatrixOk = false
    console.log('     validator 矩阵未按前缀抛错: ' + label + ' -> ' + String(message))
  }
}
checkTrue('GWV1 非法配置矩阵（15 例）全部抛出以 extra-plan: config.gateWords 开头的错误', validatorMatrixOk)
const frozenWords = validateGateWords(Object.assign({}, gateRuntime.words))
checkTrue('GWV2 合法七词返回冻结副本（非同一引用）', Object.isFrozen(frozenWords) && frozenWords !== gateRuntime.words && frozenWords.routeDirect === gateRuntime.words.routeDirect)
let noArgMessage = null
try { createGateRuntime(undefined) } catch (error) { noArgMessage = error instanceof Error ? error.message : String(error) }
checkTrue('GWV3 createGateRuntime 无参不存在默认词表（抛错）', noArgMessage !== null && noArgMessage.startsWith('extra-plan: config.gateWords'))

// GWC 系列：定制七词正例（与出厂词无子串重叠）+ 旧词负例
const CUSTOM_WORDS = { routeDirect: '甲直行', routePlan: '乙规划', routeDisagree: '丙否决', approvalApprove: '丁批准', approvalReplan: '戊转规划', purposeRefine: '己完整', purposeRedo: '庚重做' }
const customRuntime = createGateRuntime(CUSTOM_WORDS)
const customValues = GATE_FIELD_NAMES.map((field) => CUSTOM_WORDS[field])
const customRouteArgs = JSON.stringify({ questions: [{ id: 'q1', options: [{ label: CUSTOM_WORDS.routeDirect }, { label: CUSTOM_WORDS.routePlan }, { label: CUSTOM_WORDS.routeDisagree }] }] })
const customPurposeArgs = JSON.stringify({ questions: [{ id: 'q1', options: [{ label: CUSTOM_WORDS.purposeRefine }, { label: CUSTOM_WORDS.purposeRedo }] }] })
const customApprovalArgs = JSON.stringify({ questions: [{ id: 'q1', options: [{ label: CUSTOM_WORDS.approvalApprove }, { label: CUSTOM_WORDS.approvalReplan }, { label: CUSTOM_WORDS.routeDisagree }] }] })
checkTrue('GWC0 定制七词与出厂七词无子串重叠且不含出厂词（静默失效检测前置）', !factoryValuesPattern.test(customValues.join('|')) && customValues.every((value) => !GATE_FIELD_NAMES.some((field) => value.includes(assetGateWords[field]) || assetGateWords[field].includes(value))))
check('GWC1 定制词标准三词 → categorizeGateAsk standard', categorizeGateAsk([CUSTOM_WORDS.routeDirect, CUSTOM_WORDS.routePlan, CUSTOM_WORDS.routeDisagree], customRuntime), 'standard')
check('GWC2 定制词缺一词 → malformed（partial 子串教学路径）', categorizeGateAsk([CUSTOM_WORDS.routeDirect, CUSTOM_WORDS.routePlan], customRuntime), 'malformed')
check('GWC3 与定制词完全不相交 → ordinary', categorizeGateAsk(['方案A', '方案B'], customRuntime), 'ordinary')
check('GWC4 三类 match 精确匹配定制词（route/approval/purpose 共 8 项）', [matchRouteLabel([CUSTOM_WORDS.routeDirect], customRuntime), matchRouteLabel([CUSTOM_WORDS.routePlan], customRuntime), matchRouteLabel([CUSTOM_WORDS.routeDisagree], customRuntime), matchApprovalLabel([CUSTOM_WORDS.approvalApprove], customRuntime), matchApprovalLabel([CUSTOM_WORDS.approvalReplan], customRuntime), matchApprovalLabel([CUSTOM_WORDS.routeDisagree], customRuntime), matchPurposeLabel([CUSTOM_WORDS.purposeRefine], customRuntime), matchPurposeLabel([CUSTOM_WORDS.purposeRedo], customRuntime)], ['direct', 'plan', 'disagree', 'approve', 'replan', 'disagree', 'refine', 'redo'])
check('GWC5 定制词带白名单推荐后缀 → 归一后仍精确匹配', matchRouteLabel([CUSTOM_WORDS.routeDirect + '（推荐）'], customRuntime), 'direct')
check('GWC6 定制词的非白名单变体不匹配（禁止 indexOf 子串）', [matchRouteLabel([CUSTOM_WORDS.routeDirect + '!'], customRuntime), matchApprovalLabel(['前缀' + CUSTOM_WORDS.approvalApprove], customRuntime)], [null, null])
check('GWC7 旧出厂词在定制 runtime 下三类 match 全部不匹配', [matchRouteLabel([assetGateWords.routeDirect], customRuntime), matchApprovalLabel([assetGateWords.approvalApprove], customRuntime), matchPurposeLabel([assetGateWords.purposeRefine], customRuntime)], [null, null, null])
checkTrue('GWC8 定制词 deny 文案由当前词表插值（路由确认句含定制三词）', routeDenyReason('write/edit', { route: 'none' }, customRuntime).includes('「' + CUSTOM_WORDS.routeDirect + '」「' + CUSTOM_WORDS.routePlan + '」「' + CUSTOM_WORDS.routeDisagree + '」'))
checkTrue('GWC9 定制词 deny 文案（路由/规划/批准三类）不含任何出厂词', !factoryValuesPattern.test(routeDenyReason('write/edit', { route: 'none' }, customRuntime) + planDenyReason('subagent_plan', { route: 'none' }, customRuntime) + approvalDenyReason('subagent', { route: 'none' }, customRuntime)))
check('GWC10 定制词 deriveFlowState 全链 → plan/redo/clarified/approved', deriveFlowState([um(), call('ask_user_question', 'gw1', customRouteArgs), ok('gw1', answer([CUSTOM_WORDS.routePlan])), call('ask_user_question', 'gw2', customPurposeArgs), ok('gw2', answer([CUSTOM_WORDS.purposeRedo])), call('ask_user_question', 'gw3', clarifyArgs), ok('gw3', answer(['方案A'])), call('ask_user_question', 'gw4', customApprovalArgs), ok('gw4', answer([CUSTOM_WORDS.approvalApprove]))], customRuntime), { route: 'plan', clarified: true, approved: true, purpose: 'redo', channelBroken: false })
check('GWC11 定制 runtime 下提交旧出厂词 → 全部未确认', deriveFlowState([um(), call('ask_user_question', 'go1', routeArgs), ok('go1', answer([assetGateWords.routeDirect])), call('ask_user_question', 'go2', purposeArgs), ok('go2', answer([assetGateWords.purposeRefine])), call('ask_user_question', 'go3', approvalArgs), ok('go3', answer([assetGateWords.approvalApprove]))], customRuntime), { route: 'none', clarified: false, approved: false, purpose: 'none', channelBroken: false })
check('GWC12 定制 runtime 下旧词 + 推荐后缀仍不推进', deriveFlowState([um(), call('ask_user_question', 'go4', routeArgs), ok('go4', answer([assetGateWords.routeDirect + '（推荐）']))], customRuntime).route, 'none')
check('GWC13 默认 runtime 下定制词不误推进（双向隔离）', deriveFlowState([um(), call('ask_user_question', 'gm1', customRouteArgs), ok('gm1', answer([CUSTOM_WORDS.routeDirect]))], gateRuntime).route, 'none')

console.log(`\n通过 ${pass}, 失败 ${fail}`)
process.exit(fail === 0 ? 0 : 1)
