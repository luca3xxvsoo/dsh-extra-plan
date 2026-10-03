// @local/dsh-extra-plan 入口：route/purpose/clarify/approve 四级闸门、子角色、A/C/M 投影、
// save 工件、探查预算、模型路由、按 session 隔离的 usage 与宿主事件契约。
// 当前本地契约紧邻决策实现；架构与历史见 pe-test/docs/ai-概览.md、ai-机制设计.md、
// ai-宿主耦合台账.md 及历史归档。
// 本模块不安装独立的规划模式；save_plan 仅是受限的工作工件例外。
// 配置值来自宿主 live source；此处注释不是第二个真源。


// F 段（HP 首轮）tool:read 的内置兜底文案（= 预设 agent.cordis.yml 的 bootstrapReadHint 示例，逐字一致）。
// 除代码外用中文；四要素必须保留：工具名 read、程序内 tools.read(...) 调用形态、file_path 必填与
// offset/limit 默认值、返回形状（path/offset/totalLines/lines 带行号）。文案不再由官方 renderer 生成，
// 与宿主 read 契约（dsh-tool-fs）的人工核对见台账 HS26。
const BOOTSTRAP_READ_HINT_FALLBACK = [
  '在 run_code 程序里读文件：调用 tools.read({ file_path })，file_path 必填；可选 offset（默认 1）与 limit（默认 2000）。返回含 path、offset、totalLines 与带行号的 lines（每项为 { number, text }）。示例：',
  "const r = await tools.read({ file_path: 'README.md' })",
  'return r',
].join('\n')

// 路由/目的/批准 ask 的关键词唯一真源是 YAML（config.gateWords，见 agent.cordis.yml）：
// JS 侧只有字段规格、派生与严格校验（lib/gate-words.js），没有内置词值、没有默认词表。
// 每次 apply 现场 createGateRuntime(cfg.gateWords) 建立本 agent scope 的词表，并作为
// 显式参数贯穿全部 helper、状态机与闸门（helper 不得自建默认词表、不得改走模块全局）。
// 供场景测试直接复用（消除"复制品"漂移）。模块顶层无副作用，纯 Node 可 import。
export const decisions = {
  CHANNEL_BROKEN_CODES,
  PWSH_MUTATION,
  BASH_MUTATION,
  PWSH_BARE_WORDS,
  BASH_BARE_WORDS,
  bashCommandOf,
  bashMutationMatches,
  isSubagentChild,
  isExplicitRoute,
  isExplicitEffort,
  isLiveDelegation,
  childPolicyNeedsFloor,
  isBootstrapPhase,
  pwshCommandOf,
  pwshMutationMatches,
  catalogHasWriteTools,
  isReadOnlyChildByCatalog,
  catalogIsCollapsed,
  schemasHasWriteTools,
  schemasHasTool,
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
  deriveFlowState,
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
  routeDenyReason,
  planDenyReason,
  approvalDenyReason,
  sanitizeTaskName,
  timestamp,
  renderSavePlan,
  PROBE_LIMITS,
  validateProbe,
  renderSaveProbe,
  renderProbeMarkdown,
  extractProbeEvidenceRefs,
  RUNCODE_MUTATION_HINTS,
  codeMutationHints,
  decomposeRunCode,
  runCodeCatchGateReason,
  collectRunCodeSites,
  askUserQuestionReturnGateReason,
  runCodeSiteCount,
  isRunCodeSubCall,
  runCodeDispatchGateReason,
  runCodeDispatchCapText,
  runCodeGroupDenyReason,
  subagentProbeGateReason,
  shellMutationReason,
  plannerGateReason,
  childReadonlyGateReason,
  mainGateReason,
  aggregateRunCodeDenyReason,
  jobOutputGateReason,
  recordJobOutputCall,
  pollGuardGateReason,
  recordPollGuardCall,
  probeDisposalWarning,
  resolveAgentRouteSources,
  decidePlannerModelUse,
  PLANNER_PROBE_TIMEOUT_MS,
  PLANNER_BLOCKED_REASON,
  NON_PLANNER_BLOCKED_REASON,
  sortPlannerCandidates,
  CORDIS_PRESENTATION_TOOLS,
  projectAssemblyForPresentation,
  renderFilteredToolsSdk,
  resolveToolsSdkRenderer,
  sdkSchemasForRendering,
  toolPresentationModeOf,
  projectSkillCatalogDecision,
}

export const name = 'extra-plan'
export const inject = ['systemPrompt']

import { mkdirSync, readFileSync, writeFileSync, appendFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { PROBE_LIMITS, sanitizeTaskName, timestamp, renderSavePlan, renderSaveProbe, renderProbeMarkdown, extractProbeEvidenceRefs } from './lib/save-contract.js'
import { validateProbe } from './lib/save-probe-validation.js'
import { atomicCommit, recoverJournals } from './lib/save-persistence.js'
import { createSaveToolFactories } from './lib/save-tool-factories.js'
import { RUNCODE_MUTATION_HINTS, codeMutationHints } from './lib/run-code-static.js'
import { PWSH_MUTATION, BASH_MUTATION, PWSH_BARE_WORDS, BASH_BARE_WORDS, pwshCommandOf, bashCommandOf, pwshMutationMatches, bashMutationMatches } from './lib/shell-mutation.js'
import { DEFAULT_PLANNER_PROMPT_SUFFIX } from './lib/preset-defaults.generated.js'
import { DEFAULT_EXPLORE_BUDGET, toolCallCount, toolCallsSinceUser, withPlannerPromptSuffix, BUDGET_REMINDER_THRESHOLD, budgetNoticeText, withBudgetNotice, budgetReminderText, budgetReminderMessage, budgetReminderSent, budgetExhaustedReason, budgetExceeded } from './lib/planner-budget.js'
import { causeChainOf } from './lib/runtime-static.js'
import { createAgentRuntime, isLiveDelegation, childPolicyNeedsFloor } from './lib/agent-runtime.js'
import { sessionEvents, isSubagentChild } from './lib/agent-session.js'
import { createModelRouting, isExplicitRoute, isExplicitEffort, resolveAgentRouteSources, decidePlannerModelUse, PLANNER_PROBE_TIMEOUT_MS, PLANNER_BLOCKED_REASON, NON_PLANNER_BLOCKED_REASON, sortPlannerCandidates } from './lib/model-routing.js'
import { CHANNEL_BROKEN_CODES, FREE_TOOLS, purposeRouteDenyReason, routeDenyReason, planDenyReason, approvalDenyReason, isBootstrapPhase, labelsOfCallData, askKindOf, askKindOfRelaxed, isExactGateSet, isPartialGateSet, categorizeGateAsk, gateAskDenyReason, validateGateAskStructure, matchRouteLabel, matchApprovalLabel, matchPurposeLabel, parseAskResultData, parseDispatchAskResult, deriveFlowState, catalogHasWriteTools, isReadOnlyChildByCatalog, schemasHasWriteTools, schemasHasTool, catalogIsCollapsed, subagentProbeGateReason, shellMutationReason, plannerGateReason, childReadonlyGateReason, jobOutputGateReason, recordJobOutputCall, pollGuardGateReason, recordPollGuardCall, probeDisposalWarning, mainGateReason, runCodeGroupDenyReason, aggregateRunCodeDenyReason, decomposeRunCode, runCodeCatchGateReason, collectRunCodeSites, askUserQuestionReturnGateReason, runCodeSiteCount, isRunCodeSubCall, runCodeDispatchGateReason, runCodeDispatchCapText } from './lib/gate-decisions.js'
import { CORDIS_PRESENTATION_TOOLS, projectAssemblyForPresentation, renderFilteredToolsSdk, resolveToolsSdkRenderer, sdkSchemasForRendering, toolPresentationModeOf, toolSdkSchemasOf, projectSkillCatalogDecision, PTC_SECTION_NAME, READ_SECTION_NAME, SDK_SECTION_NAME, sectionOf, hasSection, hasNonEmptySection } from './lib/assembly-presentation.js'
import { createSdkTextCache } from './lib/sdk-text-cache.js'
import { createUsageLedger } from './lib/usage-ledger.js'
import { createRuntimeLifecycle } from './lib/runtime-lifecycle.js'
import { GATE_WORD_FIELDS, createGateRuntime } from './lib/gate-words.js'
import { createLiveConfig } from './lib/live-config.js'
import { createDeveloperMessage } from '@deepseek-ai/dsh-llm'
import z from '@deepseek-ai/schemastery'

const DEFAULT_DIAG_FILE = join(dirname(fileURLToPath(import.meta.url)), 'extra-plan-request-errors.jsonl')

// 主插件 Config 对应 id=extra-plan；lib/settings.js 的 Config 对应 id=dsh-extra-plan-settings。
// 二者不复用、不互相导入；settings Config 仍独立维护 10 个 volatile 字段。
export const Config = z.object({
  gateWords: z.dict(z.string()).required(),
  planTool: z.string().default('subagent_plan'),
  savePlanDir: z.string().default('.extra-plan'),
  plannerModel: z.string().default('deepseek-v4-pro'),
  otherAgentModel: z.string().default(''),
  exploreBudget: z.number().step(1).min(1).default(DEFAULT_EXPLORE_BUDGET),
  plannerPromptSuffix: z.string().default(DEFAULT_PLANNER_PROMPT_SUFFIX),
  anchoredBootstrap: z.boolean().default(true),
  creativeMode: z.boolean().default(false),
  runcodeCatchGate: z.boolean().default(false),
  crossProviderPlannerModel: z.boolean().default(false),
  bootstrapPersona: z.string().default('You are a helpful software engineer assistant.'),
  bootstrapReadHint: z.string().default(BOOTSTRAP_READ_HINT_FALLBACK),
  bootstrapShellTools: z.array(z.string()).default(['bash', 'pwsh']),
  bootstrapCommonTools: z.array(z.string()).default(['read']),
  usageLedger: z.object({
    enabled: z.boolean().default(false),
    path: z.string().default(''),
  }).default({ enabled: false, path: '' }),
  diagFile: z.string().default(DEFAULT_DIAG_FILE),
})

// ── save_probe/任意工具参数截断 → MALFORMED_RESPONSE 整轮致命的限次自愈（v0.3.1） ──────
// 机制：宿主 dsh-llm-deepseek 在消息流结束处对每个 tool-call 参数严格 JSON.parse，失败抛
// LlmError('... tool input is invalid JSON', 'MALFORMED_RESPONSE')；该码不在宿主默认重试码集
// （DEFAULT_RETRYABLE_CODES），llm-retry 直接放行 → agent/request-error waterfall 若无人返回
// {kind:'retry'}，本轮整体终止。参数非法时工具 execute 根本不会被调用（解析发生在宿主流层），
// 修复只能落在 request-error 兜底、不能落在 save_probe 工具内；失败回合工具未执行、无副作用，
// 重试一次是安全的。
// malformedRecovery 为模块级函数（须被导出供回归冒烟直呼，apply 闭包函数无法导出）；
// per-session 重试账本 malformedRetried 按 sessionId 分桶（本插件每个会话各持一份 apply
// 实例，模块级 Map + sessionId 键在「模块共享/每会话独立」两种装载模型下语义一致），
// disposed 时按 sessionId 回收（见 agent/disposed 监听器）。
// 注入形状（已按宿主 0.1.7-rc.2 源码核实；2026-09-25 订正）：developer/message 在已知事件白名单
// （dsh-session lib/types/known-event-types.js L36）；append 必须带 surfaceOp:'append'
// （dsh-session lib/index.js L294-308）；message 需非空 id、role='developer'、source.kind
// 非空字符串、content 数组（同文件 L1151-1176）；纯文本 content 不得带 headerSeq（L246-256）。
// **原记「invariant.js 无该分支（故无需坐标）」已被宿主源码证伪**：v4 行准入要求
// developer/message 自带 turn/step 且均为 ≥1 的整数，宿主 append 只补 seq/time、绝不补坐标，
// 坐标必须由调用方给出（实机报错为 SessionFormatError: developer/message turn must be a
// non-negative safe integer）；关系校验 companion 未挂载于活动 profile，故只需满足行准入。
// source 同须用生产者自有 kind，v4 禁止旧包裹形状（kind 取旧兜底值 plugin + plugin 包名字段）；本插件统一 plugin:@local/dsh-extra-plan。
const MALFORMED_RETRY_HINT = '你上一次的某个工具调用参数在传输中被截断，宿主侧无法把参数解析成合法 JSON，本次请求以 MALFORMED_RESPONSE 失败，该工具未执行、没有产生任何副作用。请在重试时压缩并重写该工具调用的参数：缩短长文本与证据列表、只保留核实结论必需的行号/数值/文案，确保参数是完整合法的 JSON，再原样重发同一调用。'

// sessionId → Set('turn:step')：同一回合同一步只兜底 1 次（防重试死循环）。
const malformedRetried = new Map()

// 判定链：① 非 MALFORMED_RESPONSE 不干预；② signal.aborted 绝不干扰用户取消；
// ③ agent.session.header.id 非字符串不干预；④ 同 (turn:step) 已兜底过则不重复；
// ⑤ 首次命中：记账 + 注入中文 developer 提示（模型在重试请求中可见），注入失败只吞掉、
// 不阻断自愈；⑥ 返回 { kind: 'retry' } → dsh-agent-loop 重试该步。任何意外异常一律
// 返回 null 透传（自愈兜底绝不放大故障）。
function malformedRecovery(payload) {
  try {
    if (payload === undefined || payload === null || typeof payload !== 'object') return null
    const failure = payload.failure
    if (failure === undefined || failure === null || failure.code !== 'MALFORMED_RESPONSE') return null
    if (payload.signal !== undefined && payload.signal !== null && payload.signal.aborted) return null
    const agent = payload.agent
    const sessionId = agent !== undefined && agent !== null && agent.session !== undefined && agent.session !== null && agent.session.header !== undefined && agent.session.header !== null
      ? agent.session.header.id
      : ''
    if (typeof sessionId !== 'string' || sessionId === '') return null
    const key = `${payload.turn}:${payload.step}`
    let set = malformedRetried.get(sessionId)
    if (set !== undefined && set.has(key)) return null
    if (set === undefined) {
      set = new Set()
      malformedRetried.set(sessionId, set)
    }
    set.add(key)
    // 坐标防御：v4 行准入要求 developer/message 自带 ≥1 的 turn/step 且宿主 append 不补坐标，
    // 而 request-error 的 payload 在个别场景可能缺坐标或非正整数——此时跳过注入，但仍返回
    // { kind: 'retry' }，使自愈主路径不因注入条件不满足而失效。
    if (Number.isInteger(payload.turn) && payload.turn >= 1 && Number.isInteger(payload.step) && payload.step >= 1) {
      try {
        const message = createDeveloperMessage({ content: [{ type: 'text', text: MALFORMED_RETRY_HINT }], source: { kind: 'plugin:@local/dsh-extra-plan' } })
        agent.session.append('developer/message', { turn: payload.turn, step: payload.step, message }, { surfaceOp: 'append' })
      } catch (error) {
        console.warn(`extra-plan: malformed retry hint append failed: ${error instanceof Error ? error.message : String(error)}`)
      }
    }
    return { kind: 'retry' }
  } catch (error) {
    return null
  }
}

// ── agent/error 回合错误取证落盘（与 recordRequestError 同诊断模式） ──────
// 宿主在回合/步骤级错误时 emit 'agent/error'（payload = { agent, turn, step, error }，
// error 为逐字原始错误；派发点 dsh-agent-loop throwError、签名 dsh-tool-cordis
// api-catalog），宿主不把该错误写 console → 由监听器逐字落盘留证。本插件每个会话
// 各持一份实例，主会话与全部子代理的任何 runTurn 级错误（含子代理"腰斩"的流建立
// 失败）都会留痕。
// recordAgentError 为模块级函数（须被导出供回归冒烟直呼）：与 recordRequestError
// 同模式——整体 try/catch 吞错、写失败一次性 console.warn 防刷屏；落盘文件与
// diagPath 同目录（diagPath 默认 = 本插件目录，此处同由本模块文件位置派生）。
const agentErrorDiagPath = join(dirname(fileURLToPath(import.meta.url)), 'extra-plan-agent-errors.jsonl')
let agentErrorDiagWarned = false

function recordAgentError(payload) {
  try {
    const sessionId = payload?.agent?.session?.header?.id
    const row = {
      ts: new Date().toISOString(),
      sessionId: typeof sessionId === 'string' ? sessionId : '',
      turn: payload.turn,
      step: payload.step,
      chain: causeChainOf(payload.error, 8),
    }
    mkdirSync(dirname(agentErrorDiagPath), { recursive: true })
    appendFileSync(agentErrorDiagPath, JSON.stringify(row) + '\n', { encoding: 'utf8' })
  } catch (error) {
    if (!agentErrorDiagWarned) {
      agentErrorDiagWarned = true
      console.warn(`extra-plan: agent-error diagnostics write failed: ${error instanceof Error ? error.message : String(error)}`)
    }
  }
}

export { PROBE_LIMITS, extractProbeEvidenceRefs, malformedRecovery, recordAgentError }

export function apply(ctx, config) {
  const cfg = config !== null && typeof config === 'object' ? config : {}
  // 闸门词表（唯一值源 = 本次 apply 的 YAML config.gateWords）：缺失/非法同步抛出，
  // 阻止该预设被使用（不回退到任何内置旧词）。必须在任何工具/监听器/服务副作用之前求值。
  const gateRuntime = createGateRuntime(cfg.gateWords)
  // prompt variable 注册（当前 agent scope，恰好 7 个）：persona 的 {{extra_plan_*}} 依赖它。
  // provider 返回本次 apply 捕获的值（改 YAML 后普通重启即生效）；effect 随 scope 释放，
  // 不注册全局变量、不跨 apply 缓存。
  ctx.effect(() => {
    const disposers = []
    for (const item of GATE_WORD_FIELDS) {
      const dispose = ctx.systemPrompt.variable(item.variable, () => gateRuntime.words[item.field])
      if (typeof dispose === 'function') disposers.push(dispose)
    }
    return () => {
      for (const dispose of disposers) dispose()
    }
  })
  const planToolName = typeof cfg.planTool === 'string' ? cfg.planTool : 'subagent_plan'
  const savePlanDir = typeof cfg.savePlanDir === 'string' && cfg.savePlanDir !== '' ? cfg.savePlanDir : '.extra-plan'
  const { defineSavePlan, defineSaveProbe } = createSaveToolFactories({
    savePlanDir,
    atomicCommit,
    recoverJournals,
  })
  // ── 配置热读：7 项设置从「apply 期一次性常量」改为「消费点现场取值」 ──────
  // 设置页改 YAML 后同会话即时生效（无需重启）；取值经 mtime+size 变更检测缓存，
  // 文件未变时零读盘零解析，详见 lib/live-config.js。fallbackDefaults = apply 期
  // cfg 快照：既是磁盘不可用/解析失败时的兜底，也是本实例初始值（生产上与该
  // YAML 同源——cfg 就是该文件当时的解析结果）。
  const liveConfig = createLiveConfig({
    // 路径决议（T6）：profile cordis.patch.yml（configEditor.documentPath）——设置值的新落点
    // （settings 行 config）；旧 .agent-presets/extra-plan/agent.cordis.yml 已无读取方。
    resolveDocumentPath: () => {
      try {
        const editor = ctx.get('configEditor')
        return editor !== undefined && editor !== null && typeof editor.documentPath === 'string' ? editor.documentPath : ''
      } catch (error) {
        return ''
      }
    },
    fallbackDefaults: {
      plannerModel: typeof cfg.plannerModel === 'string' ? cfg.plannerModel : 'deepseek-v4-pro',
      otherAgentModel: typeof cfg.otherAgentModel === 'string' ? cfg.otherAgentModel.trim() : '',
      exploreBudget: Number.isInteger(cfg.exploreBudget) && cfg.exploreBudget > 0 ? cfg.exploreBudget : DEFAULT_EXPLORE_BUDGET,
      plannerPromptSuffix: typeof cfg.plannerPromptSuffix === 'string' ? cfg.plannerPromptSuffix : DEFAULT_PLANNER_PROMPT_SUFFIX,
      anchoredBootstrap: cfg.anchoredBootstrap !== false,
      creativeMode: cfg.creativeMode === true,
      runcodeCatchGate: cfg.runcodeCatchGate === true,
      crossProviderPlannerModel: cfg.crossProviderPlannerModel === true,
    },
  })
  // ── 7 项热读：消费点现场取值（全部加括号调用） ──
  const plannerModel = () => liveConfig.plannerModel
  const otherAgentModel = () => liveConfig.otherAgentModel
  const exploreBudget = () => liveConfig.exploreBudget
  const plannerPromptSuffix = () => liveConfig.plannerPromptSuffix
  const bootstrapOn = () => liveConfig.anchoredBootstrap
  const runcodeCatchGateOn = () => liveConfig.runcodeCatchGate
  const crossProviderPlannerModelOn = () => liveConfig.crossProviderPlannerModel
  // creativeMode 三消费点全部改走 live-config getter（T5-5）：C 隐藏集合（shouldHideCreativeCatalog）
  // 与装配投影 hideCordis 两处现场取值，链 = settings 行 override → cfg 快照 → BUILTIN_DEFAULTS。
  const creativeModeOn = () => liveConfig.creativeMode
  const bootstrapPersona = typeof cfg.bootstrapPersona === 'string' ? cfg.bootstrapPersona : 'You are a helpful software engineer assistant.'
  // 变量②：F 段（HP 首轮）tool:read 的手写文案；空串/非字符串一律回退内置同文案兜底。
  const bootstrapReadHint = typeof cfg.bootstrapReadHint === 'string' && cfg.bootstrapReadHint !== ''
    ? cfg.bootstrapReadHint
    : BOOTSTRAP_READ_HINT_FALLBACK
  const bootstrapShellTools = new Set(Array.isArray(cfg.bootstrapShellTools) ? cfg.bootstrapShellTools : ['bash', 'pwsh'])
  const bootstrapCommonTools = new Set(Array.isArray(cfg.bootstrapCommonTools) ? cfg.bootstrapCommonTools : ['read'])
  let bootstrapShellMissingWarned = false
  const sdkTextCache = createSdkTextCache()

  const ledgerConfig = cfg.usageLedger !== null && typeof cfg.usageLedger === 'object' ? cfg.usageLedger : null
  const usageLedger = createUsageLedger({
    enabled: ledgerConfig !== null && ledgerConfig.enabled === true,
    path: ledgerConfig !== null && typeof ledgerConfig.path === 'string' ? ledgerConfig.path : '',
  })
  const { foldUsage } = usageLedger

  const sandboxPolicy = ctx.get('sandboxPolicy')
  const { isChild, isPlannerChild, toolSchemasOf, usageRoleOf, childBaseline } = createAgentRuntime({
    getAgents: () => ctx.get('agents'),
    sandboxPolicy,
    foldUsage,
    warn: (...args) => console.warn(...args),
  })


  // ── planner / 非 planner 模型单点解析（工厂实例；缓存 per-apply） ──
  // 见 lib/model-routing.js：plannerModelCache / otherAgentModelCache 每次 apply 各新建一份
  // WeakMap（绝不提升为模块全局）；llm/agents/诊断路径按惰性 getter 取用。
  const { resolvePlannerEntry, resolveOtherAgentEntry } = createModelRouting({
    getPlannerModel: () => liveConfig.plannerModel,
    getOtherAgentModel: () => liveConfig.otherAgentModel,
    getCrossProviderPlannerModel: () => liveConfig.crossProviderPlannerModel,
    getLlm: () => ctx.get('llm'),
    getAgents: () => ctx.get('agents'),
    getDiagPath: () => diagPath,
  })

  // ── C=1 创造模式的官方 skill 面（T5-3 取径订正）────────────────────────────
  // 旧实现（0.1.2-rc.1~0.1.5-rc.2）在 apply 期经 agentPresets.resolve('cordis') 取 shipped
  // 预设目录后 skills.register 两个 SKILL.md。dsh 0.1.7-rc.1 的 resolve() 只返回 {id[,broken]}，
  // 恒无 path → 整块静默失效（预设挂载成功但 skill 永远不注册）。
  // 现取径 = 静态注册：预设 skill-filesystem 行的 config.bundledSkillDir 指向
  // @deepseek-ai/dsh-agent-preset 包内 skills/（见 agent.cordis.yml），三个 SKILL.md 随
  // skill-filesystem 行进入本预设组合；0.2.0-rc.2 换通道：旧 customSkillDirs 经 ctx.fs 扫 asar 抛
  // 非 absent 错被 registry 整体跳过，故改 bundledSkillDir（trustedHost → node:fs）+ watch: false；
  // creativeMode=false 不再靠「不注册」，而由 assembly-presentation 的 CREATIVE_SKILL_NAMES 在
  // catalog 投影里隐藏（只去掉名字可见性：skill 仍注册，按名调用依旧可加载，不等于真隔离）。

  // childBaseline/usageRoleOf 与 sandbox floor 由每次 apply 独立创建的 agent runtime 工厂提供。

  // save_plan/save_probe 的合同、校验、渲染与公共原子落盘由 lib 工厂提供；此处仅保留注册与生命周期接线。
  const runtimeLifecycle = createRuntimeLifecycle({
    defineSavePlan, defineSaveProbe, isSubagentChild, isPlannerChild, toolSchemasOf,
    schemasHasWriteTools, isRunCodeSubCall, runCodeDispatchCapText,
  })
  const {
    registerSavePlan, registerSaveProbe, probeClaimFor,
    jobOutputCallCounters, jobOutputLastAnchors, pollGuardCounters,
    subCallCounters, toolJobsNoticesConsumed,
    recordRunCodeDeny, takeRunCodeDenyRecords, recordProbeClaim,
  } = runtimeLifecycle
  const noteRunCodeSubCall = (sessionId, rid) => runtimeLifecycle.noteRunCodeSubCall(sessionId, rid, exploreBudget())
  let selfAgent = undefined

  // 1) 会话启动：子代理基线（账本 + 沙箱下限）；规划子代理与主会话注册 save_plan
  //    （主会话侧任意路由态放行：受限规划工件，判定在 mainGateReason 兜底）；主会话与探查子代理
  //    注册 save_probe（scoped；recompose 不重发 session-start，pre-step 兜底）。
  // HK1（0.1.7 换代）：agent/session-start 已删除；agent/created 升为 serial——
  // 监听器被宿主 await，任何抛出都会让会话创建失败。故整块必须吞错：内部异常只
  // console.warn 留痕，绝不放任传播（gateRuntime 已在 apply 期求值，此处不再抛）。
  ctx.on('agent/created', (payload) => {
    try {
      const agent = payload.agent
      if (agent === undefined) return
      selfAgent = agent
      childBaseline(agent)
      if (isPlannerChild(agent) || !isSubagentChild(agent)) registerSavePlan(agent)
      if (!isSubagentChild(agent) || probeClaimFor(agent)) { registerSaveProbe(agent) }
    } catch (error) {
      console.warn('extra-plan: agent/created 初始化失败（不阻断会话创建）：' + (error instanceof Error ? error.message : String(error)))
    }
  })

  // 2) pre-step：账本补记（会话最终消息的行延迟到此）；规划子代理初始任务与
  // 续轮转达机械拼接 plannerPromptSuffix（「任务要求 + 空行 + 配置文本」——宿主
  // exec.arguments 与消息对象均 deepFreeze，拼接走 pre-step 消息替换通道，
  // 与 agent-instructions 基线注入同通道）。
  // C=0：三个官方 cordis skill 由 skill-filesystem 的 bundledSkillDir 静态注册进本预设组合
  // （0.2.0-rc.2 换通道，旧 customSkillDirs 走 ctx.fs 扫 asar 会抛错；不再靠「不注册」），
  // 一律从模型可见 catalog 隐藏——只影响名字可见性，skill 仍注册、按名调用仍可加载。
  // C=1：保留原 HP1 首轮暂隐逻辑（仅 A=1、F、main/planner、M=ptc 的极简首轮）。
  function shouldHideCreativeCatalog(agent) {
    if (!creativeModeOn()) return true
    if (!bootstrapOn() || !isBootstrapPhase(agent)) return false
    const planner = isPlannerChild(agent)
    const child = isChild(agent)
    if (!planner && child) return false
    return toolPresentationModeOf(agent) === 'ptc'
  }

  // skill catalog 属于 agent/pre-step 消息通道；只改当前请求副本，不注销 skill binding。
  // 仅 HP1（C=1、A=1、F、main/planner、M=ptc）暂隐两个创造 skill；L 与其它组合
  // 保持完整 catalog。prepend 让本投影在 tool-skill 的 catalog 生成之后收到最终 decision。
  let preStepWarned = false
  function warnPreStepFailure(error) {
    if (preStepWarned) return
    preStepWarned = true
    console.warn('extra-plan: agent/pre-step 初始化失败（保留原 decision）：' + (error instanceof Error ? error.message : String(error)))
  }
  ctx.on('agent/pre-step', async (payload, next) => {
    const decision = await next()
    try {
      return shouldHideCreativeCatalog(payload.agent) ? projectSkillCatalogDecision(decision) : decision
    } catch (error) {
      warnPreStepFailure(error)
      return decision
    }
  }, { prepend: true })

  ctx.on('agent/pre-step', async (payload, next) => {
    let initializationFailed = false
    if (payload.agent !== undefined) {
      try {
        selfAgent = payload.agent
        childBaseline(payload.agent)
        // T3：save_plan 与 save_probe 同构——主会话侧同样在 pre-step 幂等兜底注册
        // （web 会话先按默认预设发布、recompose 不重发 session-start，仅靠 session-start
        // 会漏注册；registerTool 的 WeakSet 保证不重复注册）。
        if (isPlannerChild(payload.agent) || !isSubagentChild(payload.agent)) registerSavePlan(payload.agent)
        if (!isSubagentChild(payload.agent) || probeClaimFor(payload.agent)) { registerSaveProbe(payload.agent) }
      } catch (error) {
        initializationFailed = true
        warnPreStepFailure(error)
      }
    }
    const decision = await next()
    if (initializationFailed) return decision
    try {
    if (decision.kind !== 'enter') return decision
    if (selfAgent === undefined || !isPlannerChild(selfAgent)) return decision
    if (!Array.isArray(decision.messages)) return decision
    // 预算告知（先于 suffix 拼接，suffix 为空也生效）+ 阈值提示（剩余 ≤3 且未注入过时追加一条）。
    const budgetNotice = budgetNoticeText(exploreBudget())
    const used = toolCallsSinceUser(sessionEvents(selfAgent.session), FREE_TOOLS)
    const reminder = budgetReminderText(exploreBudget() - used, exploreBudget(), BUDGET_REMINDER_THRESHOLD)
    let messages = decision.messages.map((message) => withPlannerPromptSuffix(withBudgetNotice(message, budgetNotice), plannerPromptSuffix()))
    if (reminder !== '' && !budgetReminderSent(sessionEvents(selfAgent.session), '本轮探查预算还剩 ')) {
      messages = [...messages, budgetReminderMessage(reminder)]
    }
      return { ...decision, messages }
    } catch (error) {
      warnPreStepFailure(error)
      return decision
    }
  })

  // 2.5) 模型请求失败诊断 + MALFORMED_RESPONSE 限次自愈（v0.3.1）：把 failure 的完整
  // cause 链逐行写进诊断文件，用于定位"save_plan 后请求流中断"的真实底层错误（TRANSPORT
  // 只是包装码）；记账之外，对 MALFORMED_RESPONSE 做一次兜底自愈（malformedRecovery，
  // 见模块级注释）：llm-retry 已返回 {kind:'retry'} 时原样透传（不与宿主重试叠加、不
  // 重复重试），否则交 malformedRecovery 判定——命中返回 retry 让 dsh-agent-loop 重试该
  // 步，未命中回退原 action 透传（其余失败码行为不变）。
  const diagPath = typeof cfg.diagFile === 'string' && cfg.diagFile !== '' ? cfg.diagFile : DEFAULT_DIAG_FILE
  let diagWarned = false
  // causeChainOf 从 lib/runtime-static.js 导入。

  function recordRequestError(payload) {
    try {
      const row = {
        ts: new Date().toISOString(),
        sessionId: payload.agent !== undefined && payload.agent.session !== undefined ? payload.agent.session.header.id : '',
        role: payload.agent !== undefined ? (isPlannerChild(payload.agent) ? 'planner' : isSubagentChild(payload.agent) ? 'executor' : 'main') : 'unknown',
        turn: payload.turn,
        step: payload.step,
        provider: payload.provider,
        message: payload.failure !== undefined && payload.failure !== null && typeof payload.failure.message === 'string' ? payload.failure.message.slice(0, 400) : '',
        ...(payload.failure !== undefined && payload.failure !== null && payload.failure.code !== undefined ? { code: String(payload.failure.code) } : {}),
        causeChain: causeChainOf(payload.failure, 8),
      }
      const dir = diagPath.slice(0, Math.max(diagPath.lastIndexOf('\\'), diagPath.lastIndexOf('/')))
      if (dir !== '') mkdirSync(dir, { recursive: true })
      writeFileSync(diagPath, JSON.stringify(row) + '\n', { flag: 'a', encoding: 'utf8' })
    } catch (error) {
      if (!diagWarned) {
        diagWarned = true
        console.warn(`extra-plan: request-error diagnostics write failed: ${error instanceof Error ? error.message : String(error)}`)
      }
    }
  }

  ctx.on('agent/request-error', async (payload, next) => {
    let action
    try {
      action = await next()
    } finally {
      recordRequestError(payload)
    }
    if (action !== undefined && action !== null && action.kind === 'retry') return action
    return malformedRecovery(payload) ?? action
  })

  // 2.6) 回合错误取证（agent/error 为 emit、同步回调）：宿主不把回合级错误写
  // console，由 recordAgentError 逐字落盘诊断文件供根因定位
  // （含子代理"腰斩"的流建立失败等 runTurn 级错误）；recordAgentError 内部全吞错、
  // 写失败仅一次性告警，监听器绝不放大故障。
  ctx.on('agent/error', recordAgentError)

  // 4) 会话销毁：同步 final flush + 单会话状态回收。必须保持同步回调——agent/disposed 是
  //    emit/void，宿主调用监听器后只对返回的 Promise 挂 catch、不等待完成；此处 driver 已静止、
  //    session 尚未解绑，同步路径内才能读到最终 snapshot 并结算末轮 usage。
  //    顺序不可换：① 先按缓存 role 同步 foldUsage（在任何 Map 删除之前）；② 保留
  //    pendingProbeClaims 的剩余数量告警语义，再删除该 session 的待认领计数（含
  //    runCodeDenyRecords 的 PTC 拒绝记录桶）；③ 最后按
  //    sessionId 依次回收 jobOutputCallCounters、jobOutputLastAnchors、toolJobsNoticesConsumed、
  //    subCallCounters、usageCursors 与 malformedRetried（MALFORMED 自愈限次账本）。
  //    重复 disposed 幂等；其它 session 的同名 rootCallId、
  //    计数与 cursor 均不受影响（本 session 的去重基准留在 cursor JSON，靠单项续载恢复）。
  //    final fold 写入失败仍走既有单次 ledger warning 且不抛出，不阻断后续清理。
  ctx.on('agent/disposed', (payload) => {
    const agent = payload.agent
    const sessionId = agent?.session?.header?.id
    if (typeof sessionId !== 'string') return
    try {
      sdkTextCache.dispose(agent)
    } catch (error) {
      console.warn('extra-plan: agent/disposed text cache cleanup failed: ' + (error instanceof Error ? error.message : String(error)))
    }
    try {
      foldUsage(agent, usageRoleOf(agent))
    } catch (error) {
      console.warn('extra-plan: agent/disposed final usage fold failed: ' + (error instanceof Error ? error.message : String(error)))
    } finally {
      const pending = runtimeLifecycle.pendingProbeCount(sessionId)
      if (Number.isInteger(pending) && pending > 0) {
        const warning = probeDisposalWarning(pending)
        if (warning !== null) console.warn(warning)
      }
      runtimeLifecycle.disposeSession(sessionId)
      malformedRetried.delete(sessionId)
      usageLedger.disposeSession(sessionId)
    }
  })

  // 3) anchored 引导（默认开）：主会话与规划子代理首轮极简；执行者/reviewer 不引导。
  //    native/both 首轮保留 bootstrap shell(s)+read，sections 仅 persona；Pure PTC
  //    首轮保留唯一 run_code、persona 与 tool:read 手写文案——宿主 tools:ptc-only 段已按
  //    用户要求停用、不透传；借宿主段名覆盖 text（cfg.bootstrapReadHint），不生成完整 SDK。
  //    无 shell 无 run_code 跳过+警告一次。钩子常驻（bootstrapOn=false 时也注册）：
  //    另负责按装配目录机械识别只读子代理（reviewer）写入 per-agent 缓存，供
  //    pre-execute 拦截复用；bootstrapOn=false 时仅记录目录、不改装配产物。
  const readOnlyChildren = new WeakSet()
  ctx.on('system-prompt/assemble', async (assembly, context, next) => {
    const result = await next()
    const agent = context.agent
    if (agent === undefined) return result
    const planner = isPlannerChild(agent)
    const child = isChild(agent)
    const schemas = toolSchemasOf(agent)
    if (child && !planner) {
      // 只读分类使用 registry.schemas，而不是装配返回数组；模型可见隐藏不改变执行分类。
      if (schemas !== undefined) {
        if (schemasHasWriteTools(schemas)) readOnlyChildren.delete(agent)
        else readOnlyChildren.add(agent)
      } else if (catalogIsCollapsed(result.tools)) {
        readOnlyChildren.delete(agent)
      } else if (isReadOnlyChildByCatalog(result.tools)) {
        readOnlyChildren.add(agent)
      } else {
        readOnlyChildren.delete(agent)
      }
    }

    // 展示决策按 phase → creative → mode 分层；所有分支只返回模型可见副本。
    const phase = isBootstrapPhase(agent) ? 'first' : 'later'
    const role = planner ? 'planner' : child ? 'executor' : 'main'
    const mode = hasNonEmptySection(result.sections, PTC_SECTION_NAME)
      ? 'ptc'
      : hasNonEmptySection(result.sections, SDK_SECTION_NAME) ? 'both' : 'native'
    const anchoredFirst = bootstrapOn() && phase === 'first' && (role === 'main' || role === 'planner')
    const anchoredPtc = anchoredFirst && mode === 'ptc'
    let presented = result
    if (anchoredPtc) {
      // HP0/HP1：PTC 首轮只保留传输、persona 与手写 read 文案（覆盖 tool:read 的 text）；不先生成完整 SDK。
      presented = projectAssemblyForPresentation(result, schemas, {
        hideCordis: !creativeModeOn(),
        ptcOnly: true,
        keepSectionNames: new Set([PTC_SECTION_NAME, READ_SECTION_NAME]),
      })
    } else if (!creativeModeOn()) {
      let sdkText
      // F/native 与 F/both 随后只返回 bootstrap shell(s)+read，不能为被剥离的完整 SDK 预热。
      if (!anchoredFirst && hasSection(result.sections, SDK_SECTION_NAME)) {
        let language = 'typescript'
        try {
          // 0.1.7 服务名换代：codeRuntime → ptcRuntime（dsh-tools 的 PTC 运行服务）。
          const runtime = typeof ctx.get === 'function' ? ctx.get('ptcRuntime') : undefined
          if (runtime !== undefined && runtime !== null && typeof runtime.language === 'string') language = runtime.language
        } catch (error) { /* 缺少 ptcRuntime 时按测试/兼容默认使用 TypeScript renderer */ }
        try {
          const effectiveSchemas = toolSdkSchemasOf(agent) ?? schemas
          const rendererInput = sdkSchemasForRendering(effectiveSchemas)
          const renderer = await resolveToolsSdkRenderer(language)
          sdkText = await sdkTextCache.getOrCreate(agent, rendererInput, language, renderer)
        } catch (error) {
          console.warn('extra-plan: filtered tools:sdk render failed (' + (error instanceof Error ? error.message : String(error)) + ')')
          sdkText = ''
        }
      }
      presented = projectAssemblyForPresentation(result, schemas, { sdkText, hideCordis: !creativeModeOn(), ptcOnly: mode === 'ptc' })
    } else if (mode === 'ptc') {
      // Pure PTC 的保留传输始终是唯一顶层工具；其余 binding 只在嵌套 SDK 中出现。
      presented = projectAssemblyForPresentation(result, schemas, { hideCordis: false, ptcOnly: true })
    } else {
      // creativeMode 仍需复制投影以剥离已退役 tool:cordis 段，但保留两个展示工具与 SDK 原文。
      presented = projectAssemblyForPresentation(result, schemas, { hideCordis: false })
    }

    if (!anchoredFirst) return presented
    if (!Array.isArray(presented.tools) || presented.tools.length === 0) return presented
    const shells = presented.tools.filter((tool) => tool !== null && typeof tool === 'object' && bootstrapShellTools.has(tool.name))
    const runCodes = presented.tools.filter((tool) => tool !== null && typeof tool === 'object' && tool.name === 'run_code')
    if (shells.length === 0 && runCodes.length === 0) {
      if (!bootstrapShellMissingWarned) {
        bootstrapShellMissingWarned = true
        console.warn('extra-plan: anchoredBootstrap enabled but neither a bootstrap shell nor run_code is present in the catalog — bootstrap skipped for this assembly')
      }
      return presented
    }
    const keep = new Set([...shells.map((tool) => tool.name), ...(shells.length === 0 ? runCodes.map((tool) => tool.name) : []), ...bootstrapCommonTools])
    const bootstrapped = presented.tools.filter((tool) => tool !== null && typeof tool === 'object' && keep.has(tool.name))
    if (anchoredPtc) {
      // 借宿主段名覆盖文本：只改「模型可见副本」的 tool:read text（= 变量②手写文案），
      // 不动宿主注册表；L 段（首个 tool/call 之后）不再进入本分支，自动回到宿主原文。
      const readSection = sectionOf(presented.sections, READ_SECTION_NAME)
      const sections = [
        { name: 'extra-plan-bootstrap', text: bootstrapPersona },
        ...(readSection === undefined ? [{ name: READ_SECTION_NAME, text: bootstrapReadHint }] : [{ ...readSection, text: bootstrapReadHint }]),
      ]
      return {
        ...presented,
        sections,
        contexts: [],
        tools: bootstrapped,
      }
    }
    return {
      ...presented,
      sections: [{ name: 'extra-plan-bootstrap', text: bootstrapPersona }],
      contexts: [],
      tools: bootstrapped,
    }
  })

  // 4) 模型与力度继承：子代理 agent/request 解析后，把 provider/model/maxTokens
  //    与 reasoningEffort 注入为父会话当前配置（requestHeader().config，非创建时
  //    快照）。one-shot（执行者/验收者）直接继承当前值；planner（continuable）的
  //    有效模型由 resolvePlannerEntry 现场解析并缓存（本钩子只读缓存，不再做
  //    模型目录查询）：已创建的 planner 不随父会话改模型而变。
  //    真实机制（注释订正）：宿主 installModelSelection 仅由主会话侧会话控制器安装
  //    （setup: installSelection 先于 presets.mount），其 agent/request 钩子无条件
  //    覆写 provider/model/reasoningEffort（剥除 resolved 的 effort）；子代理瀑布不安装
  //    该监听器 → 本插件注入在 next() 解析后执行并最终生效。
  //    显式选择不覆盖：resolved（next() 结果，首请求=创建时 AgentOptions、后续请求=
  //    logged header）的 provider/model 与父会话当前值不同 → 视为显式（官方
  //    routeChanged 口径）→ 不注入；未显式维持现状注入。父会话在子代理运行期间
  //    切换模型 → 子代理保持创建时值（planner 已有 entry 缓存同语义，one-shot 亦冻结）。
  //    effort：resolved 存在且 ≠ 父值 → 显式不注入；路由显式且 resolved 无 effort →
  //    不注入（对齐官方 routeChanged 清 effort）；其余维持父 effort 继承（现状）。
  ctx.on('agent/request', async (payload, next) => {
    const resolved = await next()
    if (payload.agent === undefined || !isSubagentChild(payload.agent)) return resolved
    // planner 模型注入（修复 v2）：在父会话 header 处理之前生效——planner 使用
    // 设置页 plannerModel（resolvePlannerEntry 现场解析/缓存）；不再依赖父 header
    // 非空与 WeakMap 缓存命中（断点①pcfg-null 早退 ②缓存 miss 回退父值 均已消除）。
    if (isPlannerChild(payload.agent)) {
      const entry = await resolvePlannerEntry(payload.agent, payload.signal)
      const nextConfig = { ...resolved }
      if (entry.model !== undefined) nextConfig.model = entry.model
      if (entry.provider !== undefined) nextConfig.provider = entry.provider
      if (entry.maxTokens !== undefined) nextConfig.maxTokens = entry.maxTokens
      // effort 继承（验收补遗）：保持「力度完全继承主会话」（agent.cordis.yml 设计）；
      // 原钩子尾部的 effort 继承对 planner 已不可达（前置早退）。
      try {
        const agents = ctx.get('agents')
        let parent
        try {
          parent = agents !== undefined ? agents.get(payload.agent.session.header.parentSession) : undefined
        } catch (error) {
          parent = undefined
        }
        if (parent !== undefined) {
          const header = typeof parent.session.requestHeader === 'function' ? parent.session.requestHeader() : undefined
          const pcfg = header !== undefined && header.config !== undefined && header.config !== null ? header.config : null
          const parentEffort = pcfg !== null && typeof pcfg.reasoningEffort === 'string' ? pcfg.reasoningEffort : ''
          if (parentEffort !== '') nextConfig.reasoningEffort = parentEffort
        }
      } catch (error) {
        // effort 取不到则不注入（与尾部继承的宽松语义一致）
      }
      return nextConfig
    }
    let agents
    try { agents = ctx.get('agents') } catch (error) { agents = undefined }
    const sources = resolveAgentRouteSources(payload.agent, agents)
    if (sources.available !== true || sources.direct === null) return resolved
    const parentConfig = sources.direct
    const parentProvider = parentConfig.provider
    const parentModel = parentConfig.model
    const resolvedProvider = typeof resolved.provider === 'string' ? resolved.provider : ''
    const resolvedModel = typeof resolved.model === 'string' ? resolved.model : ''
    const resolvedEffort = typeof resolved.reasoningEffort === 'string' ? resolved.reasoningEffort : ''
    const parentEffort = parentConfig.reasoningEffort
    const routeExplicit = isExplicitRoute(resolvedProvider, resolvedModel, parentProvider, parentModel)
    const effortExplicit = isExplicitEffort(resolvedEffort, parentEffort)
    const probe = schemasHasTool(toolSchemasOf(payload.agent), 'save_probe')
    const tokenSource = probe && sources.source !== null ? sources.source : parentConfig
    const nextConfig = { ...resolved }
    // 显式 agentOptions/provider/model 相对直接父路由优先：短路 resolver、目录与真实探针。
    if (!routeExplicit) {
      // 非 planner resolver 内部把 provider/model fallback 固定取顶层主会话；probe 同样不绕过该入口。
      const entry = await resolveOtherAgentEntry(payload.agent, payload.signal, probe)
      if (entry !== null && entry.model !== undefined) nextConfig.model = entry.model
      if (entry !== null && entry.provider !== undefined) nextConfig.provider = entry.provider
      if (entry !== null && entry.maxTokens !== undefined) nextConfig.maxTokens = entry.maxTokens
    } else if (tokenSource.maxTokens !== undefined) {
      // 显式 route 仍保持原 maxTokens 继承语义；probe 沿用顶层来源。
      nextConfig.maxTokens = tokenSource.maxTokens
    }
    const suppressEffort = effortExplicit || (routeExplicit && resolvedEffort === '')
    if (parentEffort !== '' && !suppressEffort) nextConfig.reasoningEffort = parentEffort
    return nextConfig
  })

  // 单实例子调用上限与 PTC 拒绝记录由 runtime-lifecycle.js 持有。
  // 5) 硬闸门（tools/pre-execute）：规划子代理只读 + 探查硬上限；主会话四级锚点。
  ctx.on('tools/pre-execute', (exec, next) => {
    if (exec.agent === undefined) return next()
    const agent = exec.agent
    // 单次会话事件快照（P1-4）：本钩子内全部消费点（锚点扫描、tool-jobs 通知扫描、角色判定、
    // planner 闸门、main 闸门与状态推导）复用同一份快照引用，只取一次。宿主 snapshotEvents()
    // 无参时返回缓存全量快照（无新事件即同一引用），故此处只做快照来源收敛与可读性整理——
    // 本批**不减少**各消费点各自的 O(n) 扫描次数（6 个独立循环各自保持 O(n)）。
    const execEvents = sessionEvents(agent.session)
    // job_output 计数器锚点重置：新用户消息或 send_message 续轮转达时清空该 session 的计数器
    {
      const sessId = agent.session.header.id
      let currentAnchor = -1
      for (let i = execEvents.length - 1; i >= 0; i -= 1) {
        const e = execEvents[i]
        if (e === null || typeof e !== 'object' || e.type !== 'user/message') continue
        const d = e.data
        const kind = d !== null && typeof d === 'object' && d.source !== null && typeof d.source === 'object' ? d.source.kind : ''
        if (kind === 'user' || kind === 'agent-message') {
          currentAnchor = i
          break
        }
      }
      const lastAnchor = jobOutputLastAnchors.get(sessId)
      if (lastAnchor !== currentAnchor) {
        // 只清当前 session：job_output 查重、tool-jobs 消费集与本 session 的 rootCall 桶。
        // subCallCounters 已按 sessionId 分桶，故删除全局 clear()——它会把其它 session
        // 正在执行的 run_code 子调用计数一并清掉（跨会话锚点互不干扰）。
        jobOutputCallCounters.delete(sessId)
        toolJobsNoticesConsumed.delete(sessId)
        subCallCounters.delete(sessId)
        pollGuardCounters.delete(sessId)
        jobOutputLastAnchors.set(sessId, currentAnchor)
      }
    }
    // tool-jobs 完成通知解锁扫描：匹配 source.kind==='tool-jobs' && source.form==='notice'
    // （v4 形状；旧三元组表述（kind 取旧兜底值 plugin + plugin 包名字段）已废，见下方 HK9 注）
    // 从正文用 /background job (\S+)/ 解析 jobId；首次消费即标记 consumed 并执行双解锁动作：
    // ① job_output 单键解锁（若该 jobId 被跟踪，删除幂等）② pollGuardCounters 清整表（v0.4.0）；
    // 解析失败（无 jobId）→ 无操作（保守不放行）。
    {
      const sessId = agent.session.header.id
      const consumed = toolJobsNoticesConsumed.get(sessId)
      for (const se of execEvents) {
        if (se === null || typeof se !== 'object' || se.type !== 'user/message') continue
        const sd = se.data
        if (sd === null || typeof sd !== 'object' || sd.source === null || typeof sd.source !== 'object') continue
        const src = sd.source
        // HK9（0.1.7 换代）：dsh-tool-jobs 的完成通知源已改为
        // { kind: 'tool-jobs', form: 'notice', summary }（旧 'plugin' 兜底 kind 已废）。
        if (src.kind !== 'tool-jobs' || src.form !== 'notice') continue
        if (!Array.isArray(sd.content)) continue
        let noticeText = ''
        for (const block of sd.content) {
          if (block !== null && typeof block === 'object' && block.type === 'text' && typeof block.text === 'string') {
            noticeText = block.text
            break
          }
        }
        if (noticeText === '') continue
        const m = noticeText.match(/background job (\S+)/)
        if (m === null) continue
        const jobId = m[1]
        if (consumed !== undefined && consumed.has(jobId)) continue
        // v0.4.0：consumed 标记与 job_output 跟踪命中解耦——通知首次被消费即标记，
        // 同时执行两个解锁动作：① job_output 单键解锁（若该 jobId 被跟踪，删除幂等）；
        // ② job_list/list_agents 轮询守卫清整表（无参数键，只能清整表）。
        const perSession = jobOutputCallCounters.get(sessId)
        if (perSession !== undefined && perSession.has(jobId)) perSession.delete(jobId)
        pollGuardCounters.delete(sessId)
        if (consumed !== undefined) consumed.add(jobId)
        else toolJobsNoticesConsumed.set(sessId, new Set([jobId]))
      }
    }
    const child = childBaseline(agent, execEvents)
    const planner = isPlannerChild(agent, execEvents)
    // 探查者委派属只读探查能力（与 read/glob/grep 同级）：主会话在任意路由状态放行，
    // 仅强制 one-shot 固定后台（与 subagent/subagent_review 同机械闸门口径）。
    // 置于 planner/child 判定之前，但闸门函数内首先按角色拒绝 planner（T5）：
    // subagent_probe 仅主会话可委派；放行时挂「待认领计数」供 probe 子会话
    // session-start 认领（否则 probe 子会话经 parentSession 无放行痕迹）。
    if (exec.name === 'subagent_probe') {
      const reason = subagentProbeGateReason(exec, planner)
      if (reason !== null) {
        recordRunCodeDeny(agent, exec, reason)
        return { kind: 'deny', reason }
      }
      if (planner && isRunCodeSubCall(exec)) {
        const rid = typeof exec.rootCallId === 'string' ? exec.rootCallId : ''
        const capReason = noteRunCodeSubCall(agent.session.header.id, rid)
        if (capReason !== null) {
          recordRunCodeDeny(agent, exec, capReason)
          return { kind: 'deny', reason: capReason }
        }
      }
      const parentId = agent.session.header.id
      recordProbeClaim(parentId)
      return next()
    }
    if (planner) {
      let reason = plannerGateReason(exec, execEvents, exploreBudget(), jobOutputCallCounters)
      // 预算耗尽时 run_code 不在此直拒：plannerGateReason 对 run_code 仅可能因预算耗尽返回非 null
      // （run_code 非 write/edit/pwsh/bash/job_output），置 null 让预算判定进入组判定——组判定内按白名单把关：
      // 成员组非空且全部 ∈ FREE_TOOLS 才放行；含非白名单成员或空组/动态访问 → 拒绝（动态拼接文案）。
      if (exec.name === 'run_code' && reason !== null) reason = null
      if (reason !== null) {
        recordRunCodeDeny(agent, exec, reason)
        return { kind: 'deny', reason }
      }
      if (exec.name === 'run_code') {
        const runReason = runCodeGroupDenyReason(undefined, exec, { kind: 'planner' }, { events: execEvents, exploreBudget: exploreBudget(), jobOutputCallCounters, runcodeCatchGate: runcodeCatchGateOn(), gateRuntime })
        if (runReason !== null) {
          recordRunCodeDeny(agent, exec, runReason)
          return { kind: 'deny', reason: runReason }
        }
      }
      // job_output 的 wait 禁令与同 job 查重已由上方 plannerGateReason 首次判定完成
      // （B3 收敛：不再二次调用 jobOutputGateReason）；此处只在全部闸门放行后记录计数器。
      if (exec.name === 'job_output') {
        recordJobOutputCall(agent, exec, jobOutputCallCounters)
      }
      if (planner && isRunCodeSubCall(exec)) {
        const rid = typeof exec.rootCallId === 'string' ? exec.rootCallId : ''
        const capReason = noteRunCodeSubCall(agent.session.header.id, rid)
        if (capReason !== null) {
          recordRunCodeDeny(agent, exec, capReason)
          return { kind: 'deny', reason: capReason }
        }
      }
      return next()
    }
    if (child) {
      // 只读子代理（reviewer/probe，真实工具集判定命中缓存）：write/edit 与 pwsh/bash 写命令
      // 一律拒绝；文案按 save_probe 信号区分（probe 走「探查者只读」，reviewer 文案逐字保持）。
      if (readOnlyChildren.has(agent)) {
        const probe = schemasHasTool(toolSchemasOf(agent), 'save_probe')
        const reason = childReadonlyGateReason(exec, probe, jobOutputCallCounters)
        if (reason !== null) {
          recordRunCodeDeny(agent, exec, reason)
          return { kind: 'deny', reason }
        }
        if (exec.name === 'run_code') {
          const runReason = runCodeGroupDenyReason(undefined, exec, { kind: 'child', readOnly: true, probe }, { jobOutputCallCounters, runcodeCatchGate: runcodeCatchGateOn(), gateRuntime })
          if (runReason !== null) {
            recordRunCodeDeny(agent, exec, runReason)
            return { kind: 'deny', reason: runReason }
          }
        }
        // job_output 的 wait 禁令与同 job 查重已由上方 childReadonlyGateReason 首次判定完成
        // （B3 收敛：不再二次调用 jobOutputGateReason）；此处只在全部闸门放行后记录计数器。
        if (exec.name === 'job_output') {
          recordJobOutputCall(agent, exec, jobOutputCallCounters)
        }
      }
      return next() // 执行者子代理豁免（目录含 write/edit，缓存未命中）
    }

    const state = deriveFlowState(execEvents, gateRuntime)
    const reason = mainGateReason(state, exec, { events: execEvents, planToolName, jobOutputCallCounters, pollGuardCounters, runcodeCatchGate: runcodeCatchGateOn(), runCodeDepth: 0, gateRuntime, getAgents: () => ctx.get('agents') })
    if (reason !== null) {
      recordRunCodeDeny(agent, exec, reason)
      return { kind: 'deny', reason }
    }
    // 放行副作用：job_output 计数器记录（B3 收敛：与 planner/只读 child 共用 recordJobOutputCall；
    // 仅在全部闸门放行后执行，时序等价）
    recordJobOutputCall(agent, exec, jobOutputCallCounters)
    recordPollGuardCall(agent, exec, pollGuardCounters)
    return next()
  })

  // 6) 呈现兜底（tools/post-execute）：run_code 失败结果的 error.message 含本插件刚记下的
  //    闸门拒绝 reason（精确子串 'ToolCallError: <reason>'）时，把失败结果 content 改写为
  //    「Error: <reason>」——宿主英文包装（'code run failed (exception)' + worker.cjs 堆栈）
  //    不再进入模型上下文。只改 content（PostToolDecision 禁止对失败结果替换 value）。
  //    fail-open：无记录/未命中/非 run_code/非失败一律 next() 透传（不吞错）；命中与未命中
  //    都在读取后清掉本 root 记录（消费即清）；钩子内异常由宿主 catch 后按 toolErrorResult 兜底。
  ctx.on('tools/post-execute', (exec, result, next) => {
    if (exec === null || typeof exec !== 'object') return next()
    if (exec.agent === undefined || exec.name !== 'run_code') return next()
    if (result === null || typeof result !== 'object' || result.isError !== true) return next()
    const sessionId = exec.agent.session !== undefined && exec.agent.session !== null && exec.agent.session.header !== undefined && exec.agent.session.header !== null ? exec.agent.session.header.id : ''
    const rootId = typeof exec.rootCallId === 'string' && exec.rootCallId !== '' ? exec.rootCallId : (typeof exec.callId === 'string' ? exec.callId : '')
    const reasons = runtimeLifecycle.takeRunCodeDenyRecords(sessionId, rootId)
    if (reasons === undefined || reasons.size === 0) return next()
    const error = result.error
    const message = error !== null && error !== undefined && typeof error === 'object' && typeof error.message === 'string' ? error.message : ''
    let matched = null
    for (const reason of reasons) {
      if (reason !== '' && message.includes('ToolCallError: ' + reason)) { matched = reason; break }
    }
    if (matched === null) return next()
    return { kind: 'accept', content: [{ type: 'text', text: 'Error: ' + matched }] }
  })
}
