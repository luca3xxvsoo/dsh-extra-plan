// 场景测试:extra-plan 判定逻辑（decisions 命名空间纯函数）
// 直接 import 插件导出的 decisions（与 index.js 共用同一实现，不复制逻辑）——
// 插件模块顶层无副作用，可在纯 Node 环境加载。
import { pathToFileURL, fileURLToPath } from 'node:url'
import { isDeepStrictEqual } from 'node:util'
import { registerHostDeps } from '../_shared/host-deps.mjs'
import { assertionLine, createOutput, parseOutputMode, stableStringify, sha256Text, writeRawEvidence } from '../_shared/test-output.mjs'
// host-deps 只按命令显式 DSH_INSTALL_ROOT 解析宿主真包；运行时由 node --import ../_shared/host-preload.mjs 预加载。
const step00Fixture = makeFixtureDir({ label: 'step00' })
const isolatedDshHome = step00Fixture.home
const STEP00_PATH_CONTEXT = createPathContext({ workspaceRoot: isolatedDshHome, hostDataRoot: isolatedDshHome })
const makeWTemp = (label) => { const safe = String(label).replace(/[^A-Za-z0-9_-]+/g, '-'); const dir = join(isolatedDshHome, 'tmp', safe); mkdirSync(dir, { recursive: true }); return dir }
const previousDshHome = process.env.DSH_HOME
const previousConfigPath = process.env.DSH_EXTRA_PLAN_CONFIG_PATH
const previousTemp = process.env.TEMP
const previousTmp = process.env.TMP
const previousTmpDir = process.env.TMPDIR
delete process.env.DSH_HOME
process.env.TEMP = step00Fixture.temp
process.env.TMP = step00Fixture.temp
process.env.TMPDIR = step00Fixture.temp
await registerHostDeps()
const { interpolate } = await import('@deepseek-ai/cordis-plugin-loader')

// ── 测试隔离（方案 A 构造期读盘） ──────────────────────────────────────────
// live-config 构造期路径依次为显式 configPath → DSH_EXTRA_PLAN_CONFIG_PATH → configEditor.documentPath；旧预设目录不回退。
// 本脚本的 plugin.apply 均传入 config 快照（如 anchoredBootstrap: false），但 mock 无可用 documentPath，
// 因此清空显式环境路径后不会读到现场真值，这些按入参硬编码的期望不会被现场配置污染。
// 【插件 import 之前】清空 DSH_HOME 与 DSH_EXTRA_PLAN_CONFIG_PATH；W 临时文件只由 fixture 路径显式创建：
// 构造期读盘失败 → 各实例回退到自己的 apply 快照（fallbackDefaults）。
// 测试结束（含 process.exit 与异常退出路径）由 process.on('exit') 恢复原值并删临时目录。
delete process.env.DSH_EXTRA_PLAN_CONFIG_PATH
function restoreIsolatedEnv() {
  if (previousDshHome === undefined) delete process.env.DSH_HOME
  else process.env.DSH_HOME = previousDshHome
  if (previousConfigPath === undefined) delete process.env.DSH_EXTRA_PLAN_CONFIG_PATH
  else process.env.DSH_EXTRA_PLAN_CONFIG_PATH = previousConfigPath
  if (previousTemp === undefined) delete process.env.TEMP
  else process.env.TEMP = previousTemp
  if (previousTmp === undefined) delete process.env.TMP
  else process.env.TMP = previousTmp
  if (previousTmpDir === undefined) delete process.env.TMPDIR
  else process.env.TMPDIR = previousTmpDir
  rmSync(step00Fixture.root, { recursive: true, force: true })
}
process.on('exit', restoreIsolatedEnv)

const plannerBudget = await import('../../plugins/dsh-extra-plan/lib/planner-budget.js')
const PLUGIN_PATH = fileURLToPath(new URL('../../plugins/dsh-extra-plan/index.js', import.meta.url))
const plugin = await import(pathToFileURL(PLUGIN_PATH).href)
const { FREE_TOOLS } = await import('../../plugins/dsh-extra-plan/lib/gate-decisions.js')
const { Config: SETTINGS_CONFIG } = await import('../../plugins/dsh-extra-plan/lib/settings.js')
import { createRunCodeStatic } from '../../plugins/dsh-extra-plan/lib/run-code-static.js'
import * as runCodeScanner from '../../plugins/dsh-extra-plan/lib/run-code-scanner.js'
import * as shellMutation from '../../plugins/dsh-extra-plan/lib/shell-mutation.js'
import * as runtimeStatic from '../../plugins/dsh-extra-plan/lib/runtime-static.js'
import * as agentRuntime from '../../plugins/dsh-extra-plan/lib/agent-runtime.js'
const roleGenerator = await import('../../plugins/dsh-extra-plan/scripts/generate-runtime-defaults.mjs')
const usageStats = await import('./step-99-用量统计.mjs')
import * as usageLedgerModule from '../../plugins/dsh-extra-plan/lib/usage-ledger.js'
import { DEFAULT_EXPLORE_BUDGET as GENERATED_DEFAULT_EXPLORE_BUDGET, DEFAULT_PLANNER_PROMPT_SUFFIX as GENERATED_DEFAULT_PLANNER_PROMPT_SUFFIX } from '../../plugins/dsh-extra-plan/lib/preset-defaults.generated.js'
import { existsSync, readFileSync, readdirSync, rmSync, mkdirSync, writeFileSync, renameSync, unlinkSync } from 'node:fs'
import { makeFixtureDir } from '../_shared/workspace-paths.mjs'
import { createPathContext } from '../../plugins/dsh-extra-plan/lib/path-policy.js'
import { dirname, join } from 'node:path'
import { parsePresetYaml, createDefaultSettings, DEFAULT_SETTINGS } from '../../plugins/dsh-extra-plan/lib/preset-settings.js'
import { ROLE_IDS, ROLE_ORDERS, PLANNER_PRESET_ID, PROBER_PRESET_ID } from '../../plugins/dsh-extra-plan/lib/role-contract.js'
import { ROLE_IDS as PRESET_SYNC_ROLE_IDS, ROLE_DEFINITION_FILES } from '../../plugins/dsh-extra-plan/lib/preset-sync.js'
import { GATE_WORD_FIELDS, createGateRuntime, validateGateWords } from '../../plugins/dsh-extra-plan/lib/gate-words.js'
import { probePathOf } from '../../plugins/dsh-extra-plan/lib/save-probe-validation.js'
import { validateSavePlanContract as validateRealSavePlanContract } from '../../plugins/dsh-extra-plan/lib/save-plan-validation.js'
import { SAVE_PLAN_LIMITS as REAL_SAVE_PLAN_LIMITS, formatSavePlanSummary as formatRealSavePlanSummary, renderSavePlan as renderRealSavePlan } from '../../plugins/dsh-extra-plan/lib/save-contract.js'
import { createSaveToolFactories } from '../../plugins/dsh-extra-plan/lib/save-tool-factories.js'
// decisions 未再导出该 deny 文案构造器：直接取 lib 同一实现（不复制文案）。
import { purposeRouteDenyReason } from '../../plugins/dsh-extra-plan/lib/gate-decisions.js'
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
  runCodeCatchGateReason,
  runCodeGroupDenyReason,
  childControlGateReason,
  mainGateReason,
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

// ── apply 统一入口（4 处 plugin.apply 站点同源） ────────────────────────────
// 合并资产 YAML 的 gateWords（调用方显式传 gateWords 时以调用方为准），并补齐
// systemPrompt/effect mock；不自动注入 profileContext/dshHomePath，需Host业务的正例由调用点传入 W 内可信事实；坏配置入口不经本 helper（直接调 plugin.apply）。
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
  isDispatchStart: (type) => type === 'tool/ptc-dispatch-start',
})
const { maskCodeLiteralsAndComments, sliceBalancedArgs } = staticRunCode

// ── 事件构造（真实形状，同 step-06-线索落盘.mjs / step-04-路由与写闸门.mjs 的事件构造函数，三处同构见 R6） ───
const um = () => ({ type: 'user/message', data: { source: { kind: 'user' } } })
const call = (name, cid, argumentsStr = '{}') => ({ type: 'tool/call', data: { name, callId: cid, arguments: argumentsStr } })
const ok = (cid, text) => ({ type: 'tool/result', data: { message: { toolCallId: cid, isError: false, content: [{ type: 'text', text }] } } })
const err = (cid, code) => ({ type: 'tool/result', data: { error: { name: 'Error', ...(code === undefined ? {} : { code }) }, message: { toolCallId: cid, isError: true, content: [] } } })
// 真实 deny 形状（pre-execute 拒绝结果：message 顶层 isError:true、无 data.error）
const deny = (cid, reason) => ({ type: 'tool/result', data: { message: { toolCallId: cid, isError: true, content: [{ type: 'text', text: 'Error: ' + reason }] } } })
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
// content 直接是 ContentBlock 数组；当前只保留 tool/ptc-dispatch-start / tool/ptc-dispatch。
const nestedRouteArgs = { questions: [{ id: 'q1', options: [{ label: '直接执行' }, { label: '进行pro规划' }, { label: '不同意' }] }] }
const nestedApprovalArgs = { questions: [{ id: 'q1', options: [{ label: '同意执行' }, { label: '转交pro规划' }, { label: '不同意' }] }] }
const nestedClarifyArgs = { questions: [{ id: 'q1', options: [{ label: '方案A' }, { label: '方案B' }] }] }
const nestedPurposeArgs = { questions: [{ id: 'q1', options: [{ label: '完善方案' }, { label: '重新规划' }] }] }
const ptcStart = (sid, name, argsObj) => ({ type: 'tool/ptc-dispatch-start', data: { rootCallId: 'matrix-root', parentCallId: 'matrix-parent', subCallId: sid, name, arguments: argsObj } })
const ptcEnd = (sid, text, isError = false) => ({ type: 'tool/ptc-dispatch', data: { rootCallId: 'matrix-root', parentCallId: 'matrix-parent', subCallId: sid, name: 'ask_user_question', arguments: {}, isError, content: [{ type: 'text', text }] } })

let pass = 0
let fail = 0
const output = createOutput({ argv: process.argv.slice(2) })
function check(name, got, expected) {
  const okResult = JSON.stringify(got) === JSON.stringify(expected)
  if (okResult) { pass += 1 } else { fail += 1 }
  output.assertion(okResult, name, expected, got)
}
function checkTrue(name, got) {
  check(name, got, true)
}

// 共享输出合同纯函数回归：模式优先级、成功显示边界、失败完整性与稳定序列化。
check('OUTPUT0 默认模式为compact', parseOutputMode([]), 'compact')
check('OUTPUT1 --verbose仅显示成功名称', assertionLine('verbose', true, '成功项', { expected: 'large' }, { actual: 'large' }), 'PASS  成功项')
check('OUTPUT2 --full优先于--verbose', parseOutputMode(['--verbose', '--full']), 'full')
check('OUTPUT3 compact成功断言不逐条打印', assertionLine('compact', true, '成功项', { expected: 'large' }, { actual: 'large' }), '')
checkTrue('OUTPUT4 compact失败保留完整expected/actual', assertionLine('compact', false, '失败项', 'expected', 'actual').includes('expected') && assertionLine('compact', false, '失败项', 'expected', 'actual').includes('actual'))
checkTrue('OUTPUT5 stable JSON按键排序', stableStringify({ z: 1, a: { y: 2, x: 3 } }) === JSON.stringify({ a: { x: 3, y: 2 }, z: 1 }))
let outputInvalid = false
try { parseOutputMode(['--output-mode=invalid']) } catch { outputInvalid = true }
checkTrue('OUTPUT6 非法模式按合同报错', outputInvalid)

// 收尾共享 runner 纯入口矩阵：导入不执行 main、不写 reports；失败统计依赖结构化结果，不扫描普通文本。
const runnerReportsDir = join(dirname(HERE), 'reports')
const runnerReportSnapshot = () => existsSync(runnerReportsDir) ? readdirSync(runnerReportsDir).sort() : null
const runnerReportsBefore = runnerReportSnapshot()
const runnerModule = await import('./一键step测试.mjs')
const runnerReportsAfter = runnerReportSnapshot()
checkTrue('RUNNER0 导入不自动执行main或写reports', JSON.stringify(runnerReportsAfter) === JSON.stringify(runnerReportsBefore) && typeof runnerModule.parseResult === 'function' && typeof runnerModule.classifyAuto === 'function')
const forensicArgCases = [
  ['step-04-工具清单查看.mjs', ['fixture-session', '--full']],
  ['step-05-会话解码.mjs', ['fixture-session', '--full']],
  ['step-06-真实会话查看.mjs', ['fixture-session']],
  ['step-07-子代理模型与引导取证.mjs', ['--session', 'fixture-session', '--full']],
]
for (const [file, expected] of forensicArgCases) check('RUNNER15 ' + file + '真实argv合同', runnerModule.forensicArgs(file, 'fixture-session'), expected)
check('RUNNER16 step-07缺显式前置为NOT-RUN', runnerModule.forensicNotRunReason('step-07-子代理模型与引导取证.mjs', undefined, {}).startsWith('NOT-RUN:'), true)
check('RUNNER17 step-07显式前置齐全不NOT-RUN', runnerModule.forensicNotRunReason('step-07-子代理模型与引导取证.mjs', 'fixture-session', { PLANNER_PROMPT_SUFFIX: 'fixture' }), null)
check('RUNNER18 取证项实际非零仍为HUMAN', runnerModule.classifyForensic({ status: 1, error: undefined, notRunReason: null }), 'HUMAN')
checkTrue('RUNNER19 INCOMPLETE/NOT-RUN进入有限摘要', runnerModule.forensicKeyLines('INCOMPLETE reason\nNOT-RUN reason\n').join('\n').includes('INCOMPLETE reason') && runnerModule.forensicKeyLines('INCOMPLETE reason\nNOT-RUN reason\n').join('\n').includes('NOT-RUN reason'))
const rawFixtureDir = makeWTemp('dsh-runner-raw-fixture')
const rawFixture = writeRawEvidence({ directory: rawFixtureDir, baseName: 'fixture', stdout: 'PASS compact\n', stderr: 'INCOMPLETE raw reason\n' })
const rawCombined = 'PASS compact\nINCOMPLETE raw reason\n'
checkTrue('RUNNER20 raw bytes/lines/hash可回看', rawFixture.files[0].bytes === Buffer.byteLength('PASS compact\n', 'utf8') && rawFixture.files[1].lines === 1 && rawFixture.bytes === Buffer.byteLength(rawCombined, 'utf8') && rawFixture.lines === 2 && rawFixture.sha256 === sha256Text(rawCombined))
rmSync(rawFixtureDir, { recursive: true, force: true })
const runnerSkipMarker = { scope: 'fixture', reason: 'unavailable' }
const runnerHumanMarker = '人工核验'
const runnerMatrix = [
  ['RUNNER1 明确失败+exit0仍失败', runnerModule.classifyAuto({ timedOut: false, error: undefined, stats: { pass: 4, fail: 1, skip: 0, incomplete: 0 }, status: 0 }), '失败'],
  ['RUNNER2 普通说明含FAIL/Error/导航失效不误报', runnerModule.classifyAuto({ timedOut: false, error: undefined, stats: null, status: 0, out: 'FAIL is a word; Error: note; 导航失效说明' }), '通过'],
  ['RUNNER3 ETIMEDOUT明确失败', runnerModule.classifyAuto({ timedOut: true, error: { code: 'ETIMEDOUT' }, stats: null, status: null }), '失败'],
  ['RUNNER4 环境错误保持未执行', runnerModule.classifyAuto({ timedOut: false, error: { code: 'ENOENT' }, stats: null, status: null }), '未执行'],
  ['RUNNER5 v4 RESULT统计可解析', runnerModule.parseResult('RESULT: 5 PASS, 1 FAIL'), { pass: 5, fail: 1, skip: 0, incomplete: 0 }],
  ['RUNNER6 既有中文统计可解析', runnerModule.parseResult('通过 3，失败 0，跳过 2'), { pass: 3, fail: 0, skip: 2, incomplete: 0 }],
  ['RUNNER7 SKIP无通过保持未执行', runnerModule.classifyAuto({ timedOut: false, error: undefined, stats: { pass: 0, fail: 0, skip: 2, incomplete: 0 }, status: 0 }), '未执行'],
  ['RUNNER8 INCOMPLETE单列部分执行', runnerModule.classifyAuto({ timedOut: false, error: undefined, stats: { pass: 3, fail: 0, skip: 0, incomplete: 1 }, status: 0 }), '部分执行'],
  ['RUNNER9 stats未声明skip但skipLines存在且有PASS', runnerModule.classifyAuto({ timedOut: false, error: undefined, stats: { pass: 2, fail: 0, incomplete: 0 }, status: 0, skipLines: [runnerSkipMarker] }), '部分执行'],
  ['RUNNER10 HUMAN存在且有PASS', runnerModule.classifyAuto({ timedOut: false, error: undefined, stats: { pass: 2, fail: 0, skip: 0, incomplete: 0 }, status: 0, humanLines: [runnerHumanMarker] }), '部分执行'],
  ['RUNNER11 无PASS仅SKIP/HUMAN', runnerModule.classifyAuto({ timedOut: false, error: undefined, stats: { pass: 0, fail: 0, incomplete: 0 }, status: 0, skipLines: [runnerSkipMarker], humanLines: [runnerHumanMarker] }), '未执行'],
  ['RUNNER12 已有stats.skip与同一skipLines不重复', runnerModule.statsSummary({ stats: { pass: 2, fail: 0, skip: 1, incomplete: 0 }, status: 0, skipLines: [runnerSkipMarker] }) === '通过 2, 失败 0, 跳过 1', true],
  ['RUNNER13 未声明stats.skip时保留SKIP/HUMAN统计', runnerModule.statsSummary({ stats: { pass: 2, fail: 0, incomplete: 0 }, status: 0, skipLines: [runnerSkipMarker], humanLines: [runnerHumanMarker] }) === '通过 2, 失败 0, 跳过 1, HUMAN 1', true],
  ['RUNNER14 诊断明确列出SKIP与HUMAN', runnerModule.structuredMarkerSummary({ skipLines: [runnerSkipMarker], humanLines: [runnerHumanMarker] }) === '跳过：{"scope":"fixture","reason":"unavailable"}；HUMAN：人工核验', true],
]
for (const [name, got, expected] of runnerMatrix) check(name, got, expected)

// RUNNER21+ 生产链回归：共享 createOutput 实际产出 compact/verbose/full 原始输出，
// 直接串联生产 parseAutoOutput/classifyAuto/statsSummary；不复制 parser、不仅手填 stats。
const runnerProducerModes = ['compact', 'verbose', 'full']
const runnerProduceText = (mode, produce) => {
  const lines = []
  const producer = createOutput({ mode, argv: [], write: (line) => lines.push(line), errorWrite: (line) => lines.push(line) })
  produce(producer)
  return lines.join('\n') + '\n'
}
const runnerChainScenarios = [
  {
    name: 'RUNNER21 统计+marker混合串联失败优先',
    produce: (producer) => {
      producer.marker('SKIP', { scope: 'fixture', reason: 'unavailable' })
      producer.marker('HUMAN', '人工核验')
      producer.marker('NOT-RUN', '环境不可用')
      producer.marker('NOT-RUN', '真实消息未覆盖')
      producer.assertion(true, 'fixture-pass', 1, 1)
      producer.assertion(false, 'fixture-fail', 1, 2)
      producer.emit('NOT-RUN 2')
      producer.summary(5, 2, { skip: 1, human: 2, incomplete: 3 })
    },
    verify: (parsed, classification, summaryText) =>
      JSON.stringify(parsed.stats) === JSON.stringify({ pass: 5, fail: 2, skip: 1, incomplete: 3 })
      && parsed.skipLines.length === 1 && parsed.humanLines.length === 1
      && parsed.notRunLines.length === 2 && parsed.incompleteLines.length === 0
      && parsed.notRunCount === 2 && parsed.humanSummaryCount === 2 && parsed.incompleteCount === 3
      && classification === '失败',
  },
  {
    name: 'RUNNER22 PASS5+NOT-RUN2及两条marker只计2→部分执行',
    produce: (producer) => {
      producer.emit('NOT-RUN 2')
      producer.marker('NOT-RUN', '环境不可用')
      producer.marker('NOT-RUN', '真实消息未覆盖')
      producer.summary(5, 0, {})
    },
    verify: (parsed, classification, summaryText) =>
      JSON.stringify(parsed.stats) === JSON.stringify({ pass: 5, fail: 0, skip: 0, incomplete: 0 })
      && parsed.notRunCount === 2 && parsed.notRunLines.length === 2
      && classification === '部分执行' && summaryText === '通过 5, 失败 0, NOT-RUN 2',
  },
  {
    name: 'RUNNER23 HUMAN0/NOT-RUN0/INCOMPLETE0零值不计→通过且摘要无后缀',
    produce: (producer) => {
      producer.summary(2, 0, { skip: 0, human: 0, incomplete: 0 })
    },
    verify: (parsed, classification, summaryText) =>
      JSON.stringify(parsed.stats) === JSON.stringify({ pass: 2, fail: 0, skip: 0, incomplete: 0 })
      && parsed.notRunCount === 0 && parsed.humanSummaryCount === 0 && parsed.incompleteCount === 0
      && classification === '通过' && summaryText === '通过 2, 失败 0',
  },
  {
    name: 'RUNNER24 正HUMAN/NOT-RUN无PASS→未执行',
    produce: (producer) => {
      producer.marker('HUMAN', '人工核验')
      producer.marker('NOT-RUN', '环境不可用')
      producer.summary(0, 0, { human: 1 })
    },
    verify: (parsed, classification, summaryText) =>
      parsed.humanSummaryCount === 1 && parsed.notRunCount === 1
      && classification === '未执行',
  },
  {
    name: 'RUNNER25 INCOMPLETE独立行正数先于非零退出→部分执行',
    produce: (producer) => {
      producer.emit('INCOMPLETE 2')
      producer.summary(1, 0, {})
    },
    verify: (parsed, classification, summaryText) =>
      parsed.stats !== null && parsed.stats.incomplete === 2 && parsed.incompleteCount === 2
      && classification === '部分执行',
  },
]
for (const mode of runnerProducerModes) {
  for (const scenario of runnerChainScenarios) {
    const text = runnerProduceText(mode, scenario.produce)
    const parsed = runnerModule.parseAutoOutput(text)
    const classification = runnerModule.classifyAuto({ timedOut: false, error: undefined, status: 0, ...parsed })
    checkTrue(scenario.name + '（' + mode + '）', scenario.verify(parsed, classification, runnerModule.statsSummary({ status: 0, ...parsed })))
  }
}
checkTrue('RUNNER26 生产parseAutoOutput/parseResult导出可用', typeof runnerModule.parseAutoOutput === 'function' && typeof runnerModule.parseResult === 'function')
const runnerParseCases = [
  ['RUNNER27 末条主统计生效', runnerModule.parseAutoOutput('通过 1，失败 0\n通过 3，失败 1').stats, { pass: 3, fail: 1, skip: 0, incomplete: 0 }],
  ['RUNNER28 结果三类旧格式完整行', runnerModule.parseAutoOutput('结果：3 通过，0 失败').stats, { pass: 3, fail: 0, skip: 0, incomplete: 0 }],
  ['RUNNER29 中文说明句不误判统计', runnerModule.parseAutoOutput('本轮回归通过 3，失败 1，详见日志').stats, null],
  ['RUNNER30 英文note嵌RESULT不误判', runnerModule.parseAutoOutput('note: RESULT: 3 PASS, 0 FAIL').stats, null],
  ['RUNNER31 英文INCOMPLETE独立行计入', runnerModule.parseAutoOutput('RESULT: 4 PASS, 0 FAIL\nINCOMPLETE 2').stats, { pass: 4, fail: 0, skip: 0, incomplete: 2 }],
  ['RUNNER32 中文未完成2计入', runnerModule.parseAutoOutput('通过 3, 失败 0, 未完成 2').stats, { pass: 3, fail: 0, skip: 0, incomplete: 2 }],
]
for (const [name, got, expected] of runnerParseCases) check(name, got, expected)
checkTrue('RUNNER33 负数/非数值汇总不计、0不算一条未执行', (() => {
  const parsed = runnerModule.parseAutoOutput('NOT-RUN -1\nHUMAN abc\nNOT-RUN 0\nHUMAN  0')
  return parsed.stats === null && parsed.notRunCount === 0 && parsed.humanSummaryCount === 0 && parsed.incompleteCount === 0
})())
checkTrue('RUNNER34 INCOMPLETE+exit1先于非零退出、正HUMAN/NOT-RUN有PASS部分执行', runnerModule.classifyAuto({ timedOut: false, error: undefined, stats: { pass: 1, fail: 0, skip: 0, incomplete: 2 }, status: 1 }) === '部分执行' && runnerModule.classifyAuto({ timedOut: false, error: undefined, stats: { pass: 2, fail: 0, skip: 0, incomplete: 0 }, status: 0, humanLines: ['人工核验'], notRunLines: ['环境不可用'] }) === '部分执行')

const scannerKeys = ['collectRunCodeSites', 'hasDynamicRunCodeAccess', 'maskCodeLiteralsAndComments', 'sliceBalancedArgs']
checkTrue('SC1 run-code-scanner 命名空间精确四项且 facade 复用三项', JSON.stringify(Object.keys(runCodeScanner).sort()) === JSON.stringify(scannerKeys) && scannerKeys.every((name) => typeof runCodeScanner[name] === 'function') && maskCodeLiteralsAndComments === runCodeScanner.maskCodeLiteralsAndComments && sliceBalancedArgs === runCodeScanner.sliceBalancedArgs && staticRunCode.collectRunCodeSites === runCodeScanner.collectRunCodeSites)
const scannerDynamicAccessMatrix = [
  ['顶层 tools[name]({...}) 动态下标调用', 'tools[name]({})', true],
  ['顶层 tools["read"]({...}) 静态字符串下标调用', 'tools["read"]({})', false],
  ['MCP单引号连字符静态下标调用', "tools['mcp__chrome-devtools-mcp__list_pages']({})", false],
  ['MCP双引号且右括号后注释静态下标调用', 'tools["mcp__chrome-devtools-mcp__list_pages"] /* MCP comment */ ({})', false],
  ['字符串字面量和行注释内伪调用', "'tools[name]({})'\n// tools[name]({})", false],
  ['已识别静态外层调用的参数区间内嵌 tools[name](...)', 'tools.read({ nested: tools[name]({}) })', true],
]
for (const [label, text, expected] of scannerDynamicAccessMatrix) {
  const masked = runCodeScanner.maskCodeLiteralsAndComments(text)
  const sites = runCodeScanner.collectRunCodeSites(text, masked)
  check('SC1 动态访问矩阵 ' + label, runCodeScanner.hasDynamicRunCodeAccess(text, masked, sites), expected)
}
// G5 共享回归：直接调用修复后的扫描器，锁定嵌套/动态下标/正则以及对象字面量后的除法。
const scannerG5Cases = [
  ['嵌套 tools 调用保留内外站点', 'tools.read({ nested: tools.write({}) })', ['read', 'write'], false],
  ['MCP静态单引号保留真实name', "tools['mcp__chrome-devtools-mcp__list_pages']({})", ['mcp__chrome-devtools-mcp__list_pages'], false],
  ['MCP静态双引号带注释与动态参数保留真实name', 'tools["mcp__chrome-devtools-mcp__take_snapshot"] /* comment */ ({ query: args })', ['mcp__chrome-devtools-mcp__take_snapshot'], false],
  ['动态方括号调用判动态', 'tools[fn]({})', [undefined], true],
  ['正则正文 tools 字样不算调用', 'const re = /tools\.edit\(/gi; tools.read({})', ['read'], false],
  ['对象字面量结束后的除法调用可见', 'const value = {} / tools.edit({})', ['edit'], false],
  ['嵌套对象结束后的除法调用可见', 'const value = { outer: { inner: 1 } } / tools.write({})', ['write'], false],
  ['括号对象结束后的除法调用可见', 'const value = ({ outer: {} }) / tools.read({})', ['read'], false],
  ["属性关键词后的除法", "const value = data.return / tools.edit({}) / 2", ["edit"], false],
  ["属性控制词调用后的除法", "const value = data.if() / tools.edit({}) / 2", ["edit"], false],
  ["行注释后保留除法上下文", "const value = 12 // expression continues\n / tools.edit({}) / 2", ["edit"], false],
  ["匿名函数表达式后的除法", "const value = function() {} / tools.edit({}) / 2", ["edit"], false],
  ["具名函数表达式后的除法", "const value = function named() {} / tools.edit({}) / 2", ["edit"], false],
  ["async函数表达式后的除法", "const value = async function() {} / tools.edit({}) / 2", ["edit"], false],
  ["生成器表达式后的除法", "const value = function*() {} / tools.edit({}) / 2", ["edit"], false],
  ["函数声明后正则仍遮蔽", "function declared() {} /tools.edit({})/; tools.read({})", ["read"], false],
  ["async函数声明后正则仍遮蔽", "async function declared() {} /tools.edit({})/; tools.read({})", ["read"], false],
]
for (const [label, text, expectedNames, expectedDynamic] of scannerG5Cases) {
  const masked = runCodeScanner.maskCodeLiteralsAndComments(text)
  const sites = runCodeScanner.collectRunCodeSites(text, masked)
  check('SC1-G5 ' + label + '（站点）', sites.map((site) => site.name), expectedNames)
  check('SC1-G5 ' + label + '（动态判定）', runCodeScanner.hasDynamicRunCodeAccess(text, masked, sites), expectedDynamic)
}

for (const [index, code] of ["const value = data.return / tools.edit({}) / 2","const value = 12 // expression continues\n / tools.edit({}) / 2","const value = function() {} / tools.edit({}) / 2"].entries()) {
  const reason = runCodeCatchGateReason('tools.read({}); ' + code)
  checkTrue('SC1-G5 除法真实第二调用仍须独立catch ' + index, typeof reason === 'string' && reason.includes('2 个工具调用'))
}
check('SC1-G5 除法调用分别独立catch可通过', runCodeCatchGateReason('try { tools.read({}) } catch (e) {} try { const value = data.return / tools.edit({}) / 2 } catch (e) {}'), null)
check('SC1-G5 MCP静态调用与普通调用独立catch可通过', runCodeCatchGateReason("try { await tools['mcp__chrome-devtools-mcp__list_pages']({}) } catch (e) {}\ntry { await tools.read({}) } catch (e) {}"), null)

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

// ── CFG 系列：主插件 loader Config 真实导入、默认值与边界 ────────────────
const CONFIG_KEYS = [
  'gateWords', 'planTool', 'savePlanDir', 'plannerModel', 'otherAgentModel', 'exploreBudget',
  'plannerPromptSuffix', 'anchoredBootstrap', 'creativeMode', 'runcodeCatchGate',
  'crossProviderPlannerModel', 'bootstrapPersona', 'bootstrapReadHint', 'bootstrapShellTools',
  'bootstrapCommonTools', 'usageLedger', 'diagFile',
]
const configWithAssetGateWords = plugin.Config({ gateWords: assetGateWords })
check('CFG1 主插件 name 保持 extra-plan', plugin.name, 'extra-plan')
check('CFG2 主插件 inject 恰为 systemPrompt', plugin.inject, ['systemPrompt'])
checkTrue('CFG3 主插件 apply 与 Config 均为函数', typeof plugin.apply === 'function' && typeof plugin.Config === 'function')
check('CFG4 Config 顶层键恰为 17 个', Object.keys(configWithAssetGateWords).sort(), CONFIG_KEYS.slice().sort())
check('CFG5 资产 gateWords 经 Config 保持原值', configWithAssetGateWords.gateWords, assetGateWords)
check('CFG6 Config 标量默认值与 apply fallback 相同', [
  configWithAssetGateWords.planTool,
  configWithAssetGateWords.savePlanDir,
  configWithAssetGateWords.plannerModel,
  configWithAssetGateWords.otherAgentModel,
  configWithAssetGateWords.exploreBudget,
  configWithAssetGateWords.anchoredBootstrap,
  configWithAssetGateWords.creativeMode,
  configWithAssetGateWords.runcodeCatchGate,
  configWithAssetGateWords.crossProviderPlannerModel,
  configWithAssetGateWords.bootstrapPersona,
], [
  'subagent_plan', '.extra-plan', 'deepseek-v4-pro', '', 18,
  true, false, false, false, 'You are a helpful software engineer assistant.',
])
check('CFG7 plannerPromptSuffix 使用生成默认值', configWithAssetGateWords.plannerPromptSuffix, GENERATED_DEFAULT_PLANNER_PROMPT_SUFFIX)
// CFG8：只断字段形状（非空字符串），不锁引导词正文措辞。
checkTrue('CFG8 bootstrapReadHint 使用内置 fallback 形状（非空字符串）', typeof configWithAssetGateWords.bootstrapReadHint === 'string' && configWithAssetGateWords.bootstrapReadHint.trim().length > 0)
check('CFG9 工具数组默认值', [configWithAssetGateWords.bootstrapShellTools, configWithAssetGateWords.bootstrapCommonTools], [['bash', 'pwsh'], ['read']])
check('CFG10 usageLedger 默认值', configWithAssetGateWords.usageLedger, { enabled: false, path: '' })
check('CFG11 diagFile 默认裸日志名（实际落点由授权H/W根解析）', configWithAssetGateWords.diagFile, 'extra-plan-request-errors.jsonl')
const assetLoaderContext = { dshHomePath: (...segments) => join(isolatedDshHome, ...segments) }
const assetExtraPlanLoaderConfig = interpolate(assetLoaderContext, assetExtraPlanConfig)
let assetConfigResolved = null
let assetConfigFailure = null
try {
  assetConfigResolved = plugin.Config(assetExtraPlanLoaderConfig)
} catch (error) {
  assetConfigFailure = error instanceof Error ? error.message : String(error)
}
checkTrue('CFG12 完整资产 extra-plan config 通过 schema', assetConfigFailure === null && assetConfigResolved !== null)
const customConfigGateWords = Object.fromEntries(Object.keys(assetGateWords).map((field, index) => [field, 'CFG自定义词' + String(index + 1)]))
let customConfigResolved = null
let customConfigFailure = null
try {
  customConfigResolved = plugin.Config({ ...assetExtraPlanLoaderConfig, gateWords: customConfigGateWords })
} catch (error) {
  customConfigFailure = error instanceof Error ? error.message : String(error)
}
checkTrue('CFG13 合法自定义 gateWords 不被 schema 替换', customConfigFailure === null && customConfigResolved !== null && JSON.stringify(customConfigResolved.gateWords) === JSON.stringify(customConfigGateWords))
function expectConfigFailure(label, input) {
  let message = null
  try {
    plugin.Config(input)
  } catch (error) {
    message = error instanceof Error ? error.message : String(error)
  }
  checkTrue(label, message !== null)
}
expectConfigFailure('CFG14 缺失 gateWords 在 schema 边界失败', {})
expectConfigFailure('CFG15 exploreBudget=0 失败', { gateWords: assetGateWords, exploreBudget: 0 })
expectConfigFailure('CFG16 exploreBudget 负数失败', { gateWords: assetGateWords, exploreBudget: -1 })
expectConfigFailure('CFG17 exploreBudget 非整数失败', { gateWords: assetGateWords, exploreBudget: 1.5 })
expectConfigFailure('CFG18 exploreBudget 字符串失败', { gateWords: assetGateWords, exploreBudget: '18' })
for (const field of ['anchoredBootstrap', 'creativeMode', 'runcodeCatchGate', 'crossProviderPlannerModel']) {
  expectConfigFailure('CFG19 ' + field + ' 字符串失败', { gateWords: assetGateWords, [field]: 'false' })
}
expectConfigFailure('CFG20 bootstrapShellTools 含非字符串失败', { gateWords: assetGateWords, bootstrapShellTools: ['bash', 7] })
expectConfigFailure('CFG21 bootstrapCommonTools 含非字符串失败', { gateWords: assetGateWords, bootstrapCommonTools: ['read', 7] })
expectConfigFailure('CFG22 usageLedger 字段类型错误失败', { gateWords: assetGateWords, usageLedger: { enabled: 'false', path: '' } })
expectConfigFailure('CFG23 gateWords 值类型错误失败', { gateWords: Object.assign({}, assetGateWords, { routeDirect: 42 }) })
function expectGateRuntimeFailure(label, raw) {
  let message = null
  try {
    createGateRuntime(plugin.Config({ gateWords: raw }).gateWords)
  } catch (error) {
    message = error instanceof Error ? error.message : String(error)
  }
  checkTrue(label, message !== null && message.startsWith('extra-plan: config.gateWords'))
}
const missingRuntimeGateWords = Object.assign({}, assetGateWords)
delete missingRuntimeGateWords.routePlan
const extraRuntimeGateWords = Object.assign({}, assetGateWords, { extraKey: 'x' })
expectGateRuntimeFailure('CFG24 gateWords 缺键不被部分接受', missingRuntimeGateWords)
expectGateRuntimeFailure('CFG25 gateWords 多键不被裁剪放行', extraRuntimeGateWords)

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

// ── GM 系列:gate ask deny 分类（只断「是否给出拒绝原因」，具体缺项按词表关系派生） ──────
const gmDenied = (labels) => { const reason = gateAskDenyReason(labels, gateRuntime); return typeof reason === 'string' && reason.trim().length > 0 }
// 缺项关系式：词表中未出现在 labels 的词，必须逐个出现在拒绝原因里（词值从 gateRuntime 派生，不抄文案）。
const gmMissingMentioned = (labels, wordSet) => {
  const reason = gateAskDenyReason(labels, gateRuntime)
  const missing = [...wordSet].filter((word) => !labels.some((label) => String(label).includes(word)))
  return typeof reason === 'string' && missing.length > 0 && missing.every((word) => reason.includes(word))
}
const GM = [
  ['GM1 单词路由 ask → 非空 deny 原因', gmDenied(['直接执行']), true],
  ['GM2 单词路由 deny 指明词表缺项（缺项由 gateRuntime 派生）', gmMissingMentioned(['直接执行'], gateRuntime.routeSet), true],
  ['GM3 非白名单变体 ask → 非空 deny 原因', gmDenied(['直接执行!', '进行pro规划', '不同意']), true],
  ['GM4 单词目的 ask → 非空 deny 原因且指明目的缺项', gmDenied(['完善方案']) && gmMissingMentioned(['完善方案'], gateRuntime.purposeSet), true],
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
  ['GL1 路由 ask 恰好 1 个问题（缺第二问）→ 不通过（返回非空拒绝原因）', (() => { const r = validateGateAskStructure('route', [{ id: 'q1', question: '请选择', options: [{ label: '直接执行' }, { label: '进行pro规划' }, { label: '不同意' }] }], gateRuntime); return typeof r === 'string' && r.trim().length > 0 })(), true],
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
// BN7/BN8：预算告知只断结构化事实（非空且含上限数字，数字由入参/生成默认值派生），不锁全文措辞。
const noticeHasBudget = (text, budget) => typeof text === 'string' && text.trim().length > 0 && text.includes(String(budget))
check('BN7 budgetNoticeText(18) 非空且含上限数字（DEFAULT_EXPLORE_BUDGET 派生）', noticeHasBudget(NOTICE18, GENERATED_DEFAULT_EXPLORE_BUDGET), true)
check('BN8 budgetNoticeText(12) 非空且含上限数字', noticeHasBudget(NOTICE12, 12), true)

// ── BR 系列:budgetReminderText / budgetReminderMessage / budgetReminderSent ──
const REMIND3 = budgetReminderText(3, 18, BUDGET_REMINDER_THRESHOLD)
// BR1-BR3/BR13：提示语只断结构化事实（非空且含剩余次数），「>阈值/预算<=阈值 → 空串」的关系判据仍保留在下方条目。
const reminderHasCount = (text, remaining) => typeof text === 'string' && text.trim().length > 0 && text.includes(String(remaining))
const MARKER = '本轮探查预算还剩 '
const remEvent = (text) => ({ type: 'user/message', data: { source: { kind: 'plugin' }, content: [{ type: 'text', text }] } })
const BR = [
  ['BR1 remaining=3 → 提示且含剩余次数3', reminderHasCount(budgetReminderText(3, 18, 3), 3), true],
  ['BR2 remaining=2 → 提示且含剩余次数2', reminderHasCount(budgetReminderText(2, 18, 3), 2), true],
  ['BR3 remaining=1 → 提示且含剩余次数1', reminderHasCount(budgetReminderText(1, 18, 3), 1), true],
  ['BR4 remaining=4 → 空串', budgetReminderText(4, 18, 3), ''],
  ['BR5 remaining=0 → 空串', budgetReminderText(0, 18, 3), ''],
  ['BR6 remaining=15 → 空串', budgetReminderText(15, 18, 3), ''],
  ['BR8 无事件 → false', budgetReminderSent([], MARKER), false],
  ['BR9 锚点后含 marker → true', budgetReminderSent([umk('user'), remEvent('本轮探查预算还剩 3 次，请收紧探查、规划收尾，未查项记入待确认假设清单')], MARKER), true],
  ['BR10 marker 在锚点前 → false(新一轮重置)', budgetReminderSent([remEvent('本轮探查预算还剩 3 次，请收紧探查、规划收尾，未查项记入待确认假设清单'), umk('agent-message')], MARKER), false],
  ['BR11 锚点后无 marker → false', budgetReminderSent([umk('user'), umk('plugin')], MARKER), false],
  ['BR12 budget=3 → 空串(不提示)', budgetReminderText(3, 3, 3), ''],
  ['BR13 budget=4 remaining=3 → 提示且含剩余次数3', reminderHasCount(budgetReminderText(3, 4, 3), 3), true],
  ['BR14 budget=3 remaining=2 → 空串(全程不提示)', budgetReminderText(2, 3, 3), ''],
]
for (const [name, got, expected] of BR) check(name, got, expected)

// BR7（修正，不降级）：budgetReminderMessage 现经宿主 createUserMessage 构造，字段集 = {source, content, role:'user', id}。
// 原条目只断言 {source, content}，在构造器注入 role/id 后必然失败；此处拆为 4 条断言，覆盖全部字段。
// 当前 source 合同：source.kind 必须是生产者自有的非空字符串；宿主准入拒绝旧版 plugin 包装形状。
// 本插件使用 plugin:dsh-extra-plan。
const msg = budgetReminderMessage(REMIND3)
check('BR7a budgetReminderMessage source/content 深等值', JSON.stringify({ source: msg.source, content: msg.content }), JSON.stringify({ source: { kind: 'plugin:dsh-extra-plan' }, content: [{ type: 'text', text: REMIND3 }] }))
check('BR7b role 恒为 user', msg.role, 'user')
check('BR7c id 为非空字符串', typeof msg.id === 'string' && msg.id.length > 0, true)
check('BR7d 两次调用 id 唯一', budgetReminderMessage(REMIND3).id !== msg.id, true)

// ── MR 系列:malformedRecovery direct-call cases ──
// 全组用桩对象：桩 session.append 只记账、桩 agent.session.header.id 固定为 stub- 前缀且各例互不相同，
// 既不写入任何真实会话，也不与共享重试账本（malformedRetried，按 sessionId 分桶）互相串味。
const MR_SOURCE = 'plugin:dsh-extra-plan'
function mrStub(tag, patch) {
  const appends = []
  const session = {
    header: { id: 'stub-malformed-' + tag },
    append(type, payload, options) {
      appends.push({ type, payload, options })
      output.detail('[MR-stub:' + tag + '] append ' + type + ' turn=' + payload.turn + ' step=' + payload.step)
    },
  }
  return { appends, payload: Object.assign({ agent: { session }, failure: { code: 'MALFORMED_RESPONSE' } }, patch) }
}
// MR1：合法坐标 → 注入一次且携带 ≥1 的 turn/step、source 为生产者自有 kind
const mrLegal = mrStub('legal', { turn: 3, step: 2 })
const mrLegalResult = plugin.malformedRecovery(mrLegal.payload)
const mrLegalCall = mrLegal.appends[0]
check('MR1a 合法坐标 → 仍返回 retry', mrLegalResult, { kind: 'retry' })
check('MR1b 注入恰一次 developer/message', Array.isArray(mrLegal.appends) && mrLegal.appends.length === 1 && mrLegalCall.type === 'developer/message', true)
check('MR1c payload 坐标源自 payload.turn/step', mrLegalCall.payload.turn === 3 && mrLegalCall.payload.step === 2, true)
check('MR1d 注入 message.source 为 plugin:dsh-extra-plan', JSON.stringify(mrLegalCall.payload.message.source), JSON.stringify({ kind: MR_SOURCE }))
check('MR1e 注入 message 为 developer 且 id 非空', mrLegalCall.payload.message.role === 'developer' && typeof mrLegalCall.payload.message.id === 'string' && mrLegalCall.payload.message.id.length > 0, true)
check('MR1f 注入带 surfaceOp:append', mrLegalCall.options.surfaceOp, 'append')
// MR2：坐标缺失 → 不注入，但自愈主路径仍返回 retry
const mrNoCoord = mrStub('no-coord', {})
check('MR2a 无 turn/step → 不注入', mrNoCoord.appends.length, 0)
check('MR2b 无 turn/step → 仍返回 retry', plugin.malformedRecovery(mrNoCoord.payload), { kind: 'retry' })
// MR3：坐标非法矩阵（0/负/非整数/非数字类型/仅一侧缺失）→ 逐例不注入且仍返回 retry
const MR_BAD_COORDS = [
  ['turn=0', { turn: 0, step: 1 }],
  ['turn=-1', { turn: -1, step: 1 }],
  ['turn=1.5', { turn: 1.5, step: 1 }],
  ['turn 非数字', { turn: '3', step: 1 }],
  ['step=0', { turn: 2, step: 0 }],
  ['step=-2', { turn: 2, step: -2 }],
  ['step 缺失', { turn: 2 }],
  ['turn 为 null', { turn: null, step: 1 }],
]
const mrBadResults = []
for (let i = 0; i < MR_BAD_COORDS.length; i += 1) {
  const [label, coords] = MR_BAD_COORDS[i]
  const stub = mrStub('bad-' + i, coords)
  const result = plugin.malformedRecovery(stub.payload)
  output.detail('[MR3] ' + label + ' → ' + (stub.appends.length === 0 ? 'no-append' : 'APPENDED'))
  mrBadResults.push(label + ':' + (stub.appends.length === 0 ? 'no-append' : 'APPENDED') + '/' + JSON.stringify(result))
}
check('MR3 非法坐标 8 例全部不注入且仍返回 retry', mrBadResults, MR_BAD_COORDS.map(([label]) => label + ':no-append/{"kind":"retry"}'))
// MR4：同一 (turn:step) 二次调用 → null（同回合只兜底 1 次，防重试死循环）
const mrRepeat = mrStub('repeat', { turn: 5, step: 4 })
const mrRepeatFirst = plugin.malformedRecovery(mrRepeat.payload)
const mrRepeatSecond = plugin.malformedRecovery(mrRepeat.payload)
check('MR4a 首次返回 retry', mrRepeatFirst, { kind: 'retry' })
check('MR4b 同 (turn:step) 二次调用返回 null', mrRepeatSecond, null)
check('MR4c 二次调用不再注入', mrRepeat.appends.length, 1)
// MR5/MR6：非目标失败码与用户取消一律不干预（透传 null、不注入）
const mrOtherCode = mrStub('other-code', { turn: 1, step: 1, failure: { code: 'CHANNEL_BROKEN' } })
check('MR5 非 MALFORMED_RESPONSE → null 不干预', plugin.malformedRecovery(mrOtherCode.payload), null)
const mrAborted = mrStub('aborted', { turn: 1, step: 1, signal: { aborted: true } })
check('MR6 signal.aborted → null 不干预', plugin.malformedRecovery(mrAborted.payload), null)

// ── DR 系列:deny 提示模板与闸门词表同源（v0.1.9） ─────────────────────
const DR = [
  ['DR1 routeDenyReason 含三个路由词', routeDenyReason('write/edit', undefined, gateRuntime).includes(ROUTE_WORD_DIRECT) && routeDenyReason('write/edit', undefined, gateRuntime).includes(ROUTE_WORD_PLAN) && routeDenyReason('write/edit', undefined, gateRuntime).includes(ROUTE_WORD_DISAGREE), true],
  ['DR2 planDenyReason 含三个路由词', planDenyReason('subagent_plan', undefined, gateRuntime).includes(ROUTE_WORD_DIRECT) && planDenyReason('subagent_plan', undefined, gateRuntime).includes(ROUTE_WORD_PLAN) && planDenyReason('subagent_plan', undefined, gateRuntime).includes(ROUTE_WORD_DISAGREE), true],
  ['DR3 approvalDenyReason 含三个批准词', approvalDenyReason('subagent', undefined, gateRuntime).includes(APPROVAL_WORD_APPROVE) && approvalDenyReason('subagent', undefined, gateRuntime).includes(APPROVAL_WORD_REPLAN) && approvalDenyReason('subagent', undefined, gateRuntime).includes(ROUTE_WORD_DISAGREE), true],
  ['DR4 approvalDenyReason 不误用路由词集合', !approvalDenyReason('subagent', undefined, gateRuntime).includes(ROUTE_WORD_DIRECT), true],
]
for (const [name, got, expected] of DR) check(name, got, expected)

// ── BD 系列:budgetExhaustedReason（deny 文案,v0.1.6）：从返回值结构化取 used/total，不锁整句文案 ──
const budgetUsedTotal = (text) => { const matched = /(\d+)\s*\/\s*(\d+)/u.exec(String(text)); return matched === null ? null : [Number(matched[1]), Number(matched[2])] }
const BD = [
  ['BD1 (18,18) 结构化 used/total=18/18', budgetUsedTotal(budgetExhaustedReason(18, 18)), [18, 18]],
  ['BD2 (12,12) 结构化 used/total=12/12', budgetUsedTotal(budgetExhaustedReason(12, 12)), [12, 12]],
  ['BD3 (17,18) 结构化 used/total=17/18', budgetUsedTotal(budgetExhaustedReason(17, 18)), [17, 18]],
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

// ── AR 系列:createAgentRuntime usage context 矩阵、缓存、快照与同步 fold ─────
// 口径：main 与五类 child 分开记录精确 preset/role；root 只沿 live registry 追溯，最多 8 层并拒绝断链、循环与自指。
const runtimeDescriptor = { type: 'subagent/descriptor', data: { mode: 'continuable' } }
const arAgent = ({ id, child = false, parentSession = '', preset = '', depth = 0, events = [] }) => {
  const header = { id }
  if (child) Object.assign(header, { origin: 'subagent', delegationDepth: depth, parentSession })
  if (typeof preset === 'string') header.agentPreset = preset
  return { session: { header, snapshotEvents: () => events, append: (...args) => args }, ctx: undefined }
}
const arMain = arAgent({ id: 'ar-main', preset: '' })
const arRoleCases = [
  { label: 'main', agent: arMain, expected: { sessionId: 'ar-main', parentSessionId: '', rootSessionId: 'ar-main', agentPreset: '', delegationDepth: 0, role: 'main' } },
  { label: 'planner', agent: arAgent({ id: 'ar-planner', child: true, parentSession: 'ar-main', preset: 'extra-plan-planner', depth: 1 }), expected: { sessionId: 'ar-planner', parentSessionId: 'ar-main', rootSessionId: 'ar-main', agentPreset: 'extra-plan-planner', delegationDepth: 1, role: 'planner' } },
  { label: 'prober', agent: arAgent({ id: 'ar-prober', child: true, parentSession: 'ar-main', preset: 'extra-plan-prober', depth: 1 }), expected: { sessionId: 'ar-prober', parentSessionId: 'ar-main', rootSessionId: 'ar-main', agentPreset: 'extra-plan-prober', delegationDepth: 1, role: 'prober' } },
  { label: 'executor', agent: arAgent({ id: 'ar-executor', child: true, parentSession: 'ar-main', preset: 'extra-plan-executor', depth: 1 }), expected: { sessionId: 'ar-executor', parentSessionId: 'ar-main', rootSessionId: 'ar-main', agentPreset: 'extra-plan-executor', delegationDepth: 1, role: 'executor' } },
  { label: 'reviewer', agent: arAgent({ id: 'ar-reviewer', child: true, parentSession: 'ar-main', preset: 'extra-plan-reviewer', depth: 1 }), expected: { sessionId: 'ar-reviewer', parentSessionId: 'ar-main', rootSessionId: 'ar-main', agentPreset: 'extra-plan-reviewer', delegationDepth: 1, role: 'reviewer' } },
  { label: 'unknown-child', agent: arAgent({ id: 'ar-unknown', child: true, parentSession: 'ar-main', preset: 'extra-plan-unknown', depth: 1 }), expected: { sessionId: 'ar-unknown', parentSessionId: 'ar-main', rootSessionId: 'ar-main', agentPreset: 'extra-plan-unknown', delegationDepth: 1, role: 'child' } },
]
const arRegistry = new Map([['ar-main', arMain], ...arRoleCases.slice(1).map((item) => [item.agent.session.header.id, item.agent])])
const arRuntime = agentRuntime.createAgentRuntime({ getAgents: () => ({ get: (id) => arRegistry.get(id) }), foldUsage: () => {}, warn: () => {} })
for (const item of arRoleCases) {
  const context = arRuntime.usageContextOf(item.agent, [])
  checkTrue('AR-' + item.label + ' usage context 精确包含自身/父/根/preset/depth/role', isDeepStrictEqual(context, item.expected))
  check('AR-' + item.label + ' planner 身份只由精确 preset 判定', arRuntime.isPlannerChild(item.agent, []), item.label === 'planner')
}
const cachedPlannerContext = arRuntime.usageContextOf(arRoleCases[1].agent, [])
arRegistry.delete('ar-main')
const cachedPlannerAfterRegistryLoss = arRuntime.usageContextOf(arRoleCases[1].agent, [])
checkTrue('AR-cache usageContextOf WeakMap 命中：registry 脱离后仍返回同一完整planner上下文', cachedPlannerContext === cachedPlannerAfterRegistryLoss && cachedPlannerAfterRegistryLoss.rootSessionId === 'ar-main' && cachedPlannerAfterRegistryLoss.role === 'planner')
arRegistry.set('ar-main', arMain)
const arDirectOrphan = arAgent({ id: 'ar-direct-orphan', child: true, parentSession: 'ar-unlisted-parent', preset: 'extra-plan-prober', depth: 1 })
const arDirectOrphanContext = arRuntime.usageContextOf(arDirectOrphan, [])
checkTrue('AR-direct 一级父registry缺席仍以真实parent为root', arDirectOrphanContext.sessionId === 'ar-direct-orphan' && arDirectOrphanContext.parentSessionId === 'ar-unlisted-parent' && arDirectOrphanContext.rootSessionId === 'ar-unlisted-parent' && arDirectOrphanContext.delegationDepth === 1)
let explicitSnapshotCalls = 0
const explicitSnapshotAgent = arAgent({ id: 'ar-explicit', child: true, parentSession: 'ar-main', preset: 'extra-plan-planner', depth: 1, events: [runtimeDescriptor] })
explicitSnapshotAgent.session.snapshotEvents = () => { explicitSnapshotCalls += 1; return [runtimeDescriptor] }
arRuntime.isPlannerChild(explicitSnapshotAgent, [runtimeDescriptor])
arRuntime.isChild(explicitSnapshotAgent, [runtimeDescriptor])
check('AR-snapshot 显式 events 复用且不读取 session.snapshotEvents', explicitSnapshotCalls, 0)
check('AR-tools 缺失 agent/ctx/tools/schema 降级为 undefined', arRuntime.toolSchemasOf(undefined) === undefined && arRuntime.toolSchemasOf({}) === undefined && arRuntime.toolSchemasOf({ ctx: { get: () => ({}) } }) === undefined, true)
let schemaCalls = 0
const runtimeSchemaAgent = { ctx: { get: (name) => name === 'tools' ? { schemas: () => { schemaCalls += 1; return [{ name: 'read' }] } } : undefined } }
check('AR-tools 成功返回数组且不缓存', JSON.stringify(arRuntime.toolSchemasOf(runtimeSchemaAgent)), JSON.stringify([{ name: 'read' }]))
arRuntime.toolSchemasOf(runtimeSchemaAgent)
check('AR-tools 每次重新读取 schemas', schemaCalls, 2)

// 完整父链最多 8 层；第 9 个父链节点必须因深度边界返回空根。
const arChain = new Map()
const arChainRoot = arAgent({ id: 'ar-chain-root', preset: '' })
arChain.set('ar-chain-root', arChainRoot)
let previousChainId = 'ar-chain-root'
for (let depth = 1; depth <= 9; depth += 1) {
  const id = 'ar-chain-' + depth
  const node = arAgent({ id, child: true, parentSession: previousChainId, preset: 'extra-plan-executor', depth })
  arChain.set(id, node)
  previousChainId = id
}
const arChainRuntime = agentRuntime.createAgentRuntime({ getAgents: () => ({ get: (id) => arChain.get(id) }), foldUsage: () => {}, warn: () => {} })
const arChain8 = arChainRuntime.usageContextOf(arChain.get('ar-chain-8'), [])
const arChain9 = arChainRuntime.usageContextOf(arChain.get('ar-chain-9'), [])
checkTrue('AR-chain 完整 8 层：根为 ar-chain-root、父为 ar-chain-7、depth=8', arChain8.rootSessionId === 'ar-chain-root' && arChain8.parentSessionId === 'ar-chain-7' && arChain8.delegationDepth === 8)
checkTrue('AR-chain 8 层边界外第9层：保留自身/父但根为空', arChain9.rootSessionId === '' && arChain9.parentSessionId === 'ar-chain-8' && arChain9.delegationDepth === 9)

// 断链、自指、循环均不得伪造 root。
const arBroken = arAgent({ id: 'ar-broken', child: true, parentSession: 'ar-missing', preset: 'extra-plan-prober', depth: 2 })
const arSelf = arAgent({ id: 'ar-self', child: true, parentSession: 'ar-self', preset: 'extra-plan-executor', depth: 2 })
const arCycleA = arAgent({ id: 'ar-cycle-a', child: true, parentSession: 'ar-cycle-b', preset: 'extra-plan-reviewer', depth: 2 })
const arCycleB = arAgent({ id: 'ar-cycle-b', child: true, parentSession: 'ar-cycle-a', preset: 'extra-plan-reviewer', depth: 2 })
const arBrokenRegistry = new Map([['ar-self', arSelf], ['ar-cycle-a', arCycleA], ['ar-cycle-b', arCycleB]])
const arBrokenRuntime = agentRuntime.createAgentRuntime({ getAgents: () => ({ get: (id) => arBrokenRegistry.get(id) }), foldUsage: () => {}, warn: () => {} })
const arBrokenContext = arBrokenRuntime.usageContextOf(arBroken, [])
const arSelfContext = arBrokenRuntime.usageContextOf(arSelf, [])
const arCycleContext = arBrokenRuntime.usageContextOf(arCycleA, [])
checkTrue('AR-chain 断链：自身/父保留，root 为空', arBrokenContext.sessionId === 'ar-broken' && arBrokenContext.parentSessionId === 'ar-missing' && arBrokenContext.rootSessionId === '')
checkTrue('AR-chain 自身父链：不把自身伪造为root', arSelfContext.sessionId === 'ar-self' && arSelfContext.parentSessionId === 'ar-self' && arSelfContext.rootSessionId === '')
checkTrue('AR-chain 循环父链：不把循环节点伪造为root', arCycleContext.sessionId === 'ar-cycle-a' && arCycleContext.parentSessionId === 'ar-cycle-b' && arCycleContext.rootSessionId === '')

// 既有 gate/floor 不变量：live child 才抬升 floor；断链 child 仍可折叠上下文但不抬升；main 永不抬升。
const arGateMain = arAgent({ id: 'ar-gate-main', preset: '' })
const arGateChild = arAgent({ id: 'ar-gate-child', child: true, parentSession: 'ar-gate-main', preset: 'extra-plan-executor', depth: 1 })
const arGateBroken = arAgent({ id: 'ar-gate-broken', child: true, parentSession: 'ar-gate-missing', preset: 'extra-plan-executor', depth: 1 })
const arGateRegistry = new Map([['ar-gate-main', arGateMain]])
const arGateFold = []
const arGateFloor = []
const arGateWarnings = []
const arGateRuntime = agentRuntime.createAgentRuntime({
  getAgents: () => ({ get: (id) => arGateRegistry.get(id) }),
  sandboxPolicy: { overrideOf: () => 'read-only', defaultMode: 'workspace-write' },
  foldUsage: (_agent, context) => arGateFold.push(context),
  warn: (message) => arGateWarnings.push(message),
})
checkTrue('AR-gate live child 仍为执行者且可过live delegation', arGateRuntime.isChild(arGateChild, []) === true)
checkTrue('AR-floor live child 同步fold且不改变既有gate结果', arGateRuntime.childBaseline(arGateChild, []) === true && arGateFold.at(-1).role === 'executor')
const arFloorChild = arAgent({ id: 'ar-floor-child', child: true, parentSession: 'ar-gate-main', preset: 'extra-plan-executor', depth: 1 })
arFloorChild.session.append = (...args) => arGateFloor.push(args)
checkTrue('AR-floor live child 写入一次 workspace-write floor', arGateRuntime.childBaseline(arFloorChild, []) === true && arGateFloor.length === 1 && arGateFloor[0][0] === 'sandbox/mode' && arGateFloor[0][1].mode === 'workspace-write')
checkTrue('AR-gate 断链 child 同步fold但不抬升floor', arGateRuntime.isChild(arGateBroken, []) === false && arGateRuntime.childBaseline(arGateBroken, []) === false && arGateFold.at(-1).role === 'executor' && arGateFloor.length === 1 && arGateWarnings.length === 1)
arGateRuntime.childBaseline(arGateMain, [])
checkTrue('AR-gate main 同步fold且不抬升floor', arGateFold.at(-1).role === 'main' && arGateFloor.length === 1)

// ── M6 系列：step-99 导入、临时双文件统计/归档、严格拒绝与事务回滚 ───────
checkTrue('M6 step-99 导入仅暴露函数且不触发CLI副作用', typeof usageStats.main === 'function' && typeof usageStats.statLedger === 'function' && typeof usageStats.archiveLedger === 'function' && process.exitCode === undefined)
const archiveRow = (patch = {}) => ({
  schemaVersion: 2,
  ts: '2026-10-22T00:00:00.000Z',
  sessionId: 'm6-session',
  parentSessionId: 'm6-parent',
  rootSessionId: 'm6-root',
  agentPreset: 'extra-plan-executor',
  delegationDepth: 1,
  role: 'executor',
  model: 'm6-model',
  provider: 'm6-provider-a',
  inputTokens: 1,
  cacheReadTokens: 2,
  cacheWriteTokens: 3,
  outputTokens: 4,
  seq: 1,
  ...patch,
})
const archiveBytesOf = (path) => existsSync(path) ? readFileSync(path, 'utf8') : ''
const archiveResiduals = (directory) => readdirSync(directory).filter((name) => name.includes('.tmp-') || name.includes('.bak-') || name.includes('.lock'))
const archiveWriteRows = (path, rows) => writeFileSync(path, rows.map((row) => JSON.stringify(row)).join('\n') + (rows.length > 0 ? '\n' : ''), 'utf8')

// M6-G2-1：实际 createUsageLedger 生成 main 空 preset 与深层断链空 root，逐行严格归档。
{
  const dir = makeWTemp('dsh-g2-generated')
  try {
    const active = join(dir, 'ledger-v2.jsonl')
    const makeAgent = (event) => ({ session: { seq: 1, snapshotEvents: () => [event] } })
    const usageEvent = (seq, model, provider) => ({ type: 'assistant/message', seq, data: { usage: { inputTokens: 1, cacheReadTokens: 2, cacheWriteTokens: 3, outputTokens: 4 }, message: { source: { model, provider } } } })
    const ledger = usageLedgerModule.createUsageLedger({ enabled: true, path: active, pathContext: STEP00_PATH_CONTEXT })
    const mainResult = ledger.foldUsage(makeAgent(usageEvent(1, 'g2-main-model', 'g2-main-provider')), { sessionId: 'g2-generated-main', parentSessionId: '', rootSessionId: 'g2-generated-main', agentPreset: '', delegationDepth: 0, role: 'main' })
    const deepResult = ledger.foldUsage(makeAgent(usageEvent(1, 'g2-deep-model', 'g2-deep-provider')), { sessionId: 'g2-generated-deep', parentSessionId: 'g2-chain-8', rootSessionId: '', agentPreset: 'extra-plan-executor', delegationDepth: 9, role: 'child' })
    const rows = archiveBytesOf(active).trim().split('\n').filter((line) => line !== '').map((line) => JSON.parse(line))
    const fixedKeys = usageStats.V2_KEYS.slice().sort()
    const strictRowsOk = rows.length === 2 && rows.every((row) => JSON.stringify(Object.keys(row).sort()) === JSON.stringify(fixedKeys) && usageStats.parseLedgerText(JSON.stringify(row) + '\n', { strict: true }).rows.length === 1 && !Object.hasOwn(row, 'calls'))
    checkTrue('M6-G2-1 createUsageLedger真实main空agentPreset/深层空root：两行固定15键且strict parse成功', mainResult.status === 'written' && deepResult.status === 'written' && strictRowsOk && rows.some((row) => row.sessionId === 'g2-generated-main' && row.agentPreset === '' && row.rootSessionId === 'g2-generated-main') && rows.some((row) => row.sessionId === 'g2-generated-deep' && row.rootSessionId === '' && row.parentSessionId === 'g2-chain-8'))
    const archiveResult = usageStats.archiveLedger(active, { pathContext: STEP00_PATH_CONTEXT })
    const archived = archiveBytesOf(usageStats.archivePathOf(active))
    checkTrue('M6-G2-1 真实生成main/断链行strict归档成功且active清空', archiveResult.rows === 2 && archiveResult.groups === 2 && archiveBytesOf(active) === '' && usageStats.parseLedgerText(archived, { strict: true }).rows.length === 2 && !existsSync(usageLedgerModule.usageLedgerLockPath(active)) && archiveResiduals(dir).length === 0)
    const strictFailureCode = (row) => {
      try { usageStats.parseLedgerText(JSON.stringify(row) + '\n', { strict: true }) } catch (error) { return error.code }
      return ''
    }
    checkTrue('M6-G2-1 sessionId/role空值仍被strict拒绝', strictFailureCode({ ...rows[0], sessionId: '' }) === 'invalid-v2' && strictFailureCode({ ...rows[0], role: '' }) === 'invalid-v2')
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}

// M6-G2-2：archive 水位重放矩阵、provider 隔离、cursor 字节/哈希与二次归档幂等。
{
  const dir = makeWTemp('dsh-g2-watermark')
  try {
    const active = join(dir, 'ledger-v2.jsonl')
    const archive = usageStats.archivePathOf(active)
    const cursor = active + '.cursor.json'
    const identityKeys = ['schemaVersion', 'rootSessionId', 'sessionId', 'parentSessionId', 'agentPreset', 'delegationDepth', 'role', 'model', 'provider']
    const baseIdentity = Object.freeze({
      schemaVersion: 2,
      rootSessionId: 'm6-root',
      sessionId: 'g2-watermark',
      parentSessionId: 'm6-parent',
      agentPreset: 'extra-plan-executor',
      delegationDepth: 1,
      role: 'executor',
      model: 'm6-model',
      provider: 'g2-provider-a',
    })
    const expectedA = Object.freeze({ ...baseIdentity })
    const expectedB = Object.freeze({ ...baseIdentity, provider: 'g2-provider-b' })
    const sameIdentity = (row, expected) => row !== undefined && identityKeys.every((key) => row[key] === expected[key])
    const archiveCumulative = archiveRow({ ...expectedA, ts: '2026-10-22T00:00:20.000Z', inputTokens: 30, cacheReadTokens: 300, cacheWriteTokens: 3000, outputTokens: 30000, seq: 20 })
    const replay10 = archiveRow({ ...expectedA, ts: '2026-10-22T00:00:10.000Z', inputTokens: 10, cacheReadTokens: 100, cacheWriteTokens: 1000, outputTokens: 10000, seq: 10 })
    const replay20 = archiveRow({ ...expectedA, ts: '2026-10-22T00:00:20.000Z', inputTokens: 20, cacheReadTokens: 200, cacheWriteTokens: 2000, outputTokens: 20000, seq: 20 })
    const providerB = archiveRow({ ...expectedB, ts: '2026-10-22T00:00:11.000Z', inputTokens: 7, cacheReadTokens: 8, cacheWriteTokens: 9, outputTokens: 10, seq: 11 })
    const seq21 = archiveRow({ ...expectedA, ts: '2026-10-22T00:00:21.000Z', inputTokens: 21, cacheReadTokens: 210, cacheWriteTokens: 2100, outputTokens: 21000, seq: 21 })
    archiveWriteRows(archive, [archiveCumulative])
    archiveWriteRows(active, [replay10, replay20, providerB])
    writeFileSync(cursor, '{"g2-watermark":{"seq":20,"index":99},"other":{"seq":7,"index":3}}', 'utf8')
    const cursorBefore = archiveBytesOf(cursor)
    const cursorHash = sha256Text(cursorBefore)
    const statBefore = { active: archiveBytesOf(active), archive: archiveBytesOf(archive), cursor: archiveBytesOf(cursor) }
    const stats = usageStats.statLedger(active, { pathContext: STEP00_PATH_CONTEXT })
    const statsA = stats.groups.find((group) => sameIdentity(group, expectedA))
    const statsB = stats.groups.find((group) => sameIdentity(group, expectedB))
    checkTrue('M6-G2-2 stat水位覆盖seq10/20不增Token、provider完整身份且默认stat三文件零写', stats.rows.length === 4 && stats.groups.length === 2 && stats.coveredByArchiveRows === 2 && statsA !== undefined && sameIdentity(statsA, expectedA) && statsA.inputTokens === 30 && statsA.cacheReadTokens === 300 && statsA.cacheWriteTokens === 3000 && statsA.outputTokens === 30000 && statsA.maxSeq === 20 && statsA.latestTs === '2026-10-22T00:00:20.000Z' && statsB !== undefined && sameIdentity(statsB, expectedB) && statsB.inputTokens === 7 && statsB.cacheReadTokens === 8 && statsB.cacheWriteTokens === 9 && statsB.outputTokens === 10 && statsB.maxSeq === 11 && statsB.latestTs === '2026-10-22T00:00:11.000Z' && stats.groups.every((group) => !Object.hasOwn(group, 'calls')) && !usageStats.renderStats(stats).includes('calls') && archiveBytesOf(active) === statBefore.active && archiveBytesOf(archive) === statBefore.archive && archiveBytesOf(cursor) === statBefore.cursor && sha256Text(archiveBytesOf(cursor)) === cursorHash)
    const archiveResult = usageStats.archiveLedger(active, { pathContext: STEP00_PATH_CONTEXT })
    const archiveAfterReplay = archiveBytesOf(archive)
    const replayRows = usageStats.parseLedgerText(archiveAfterReplay, { strict: true }).rows
    const replayA = replayRows.find((row) => sameIdentity(row, expectedA))
    const replayB = replayRows.find((row) => sameIdentity(row, expectedB))
    checkTrue('M6-G2-2 archive水位重放不加Token、provider完整身份独立发布/无calls', archiveResult.rows === 4 && archiveResult.groups === 2 && archiveResult.coveredByArchiveRows === 2 && replayRows.length === 2 && replayA !== undefined && sameIdentity(replayA, expectedA) && replayA.inputTokens === 30 && replayA.cacheReadTokens === 300 && replayA.cacheWriteTokens === 3000 && replayA.outputTokens === 30000 && replayA.seq === 20 && replayB !== undefined && sameIdentity(replayB, expectedB) && replayB.inputTokens === 7 && replayB.cacheReadTokens === 8 && replayB.cacheWriteTokens === 9 && replayB.outputTokens === 10 && replayB.seq === 11 && replayRows.every((row) => !Object.hasOwn(row, 'calls')) && archiveBytesOf(active) === '' && archiveBytesOf(cursor) === cursorBefore && sha256Text(archiveBytesOf(cursor)) === cursorHash)
    archiveWriteRows(active, [seq21])
    const stats21 = usageStats.statLedger(active, { pathContext: STEP00_PATH_CONTEXT })
    const statsA21 = stats21.groups.find((group) => sameIdentity(group, expectedA))
    checkTrue('M6-G2-2 archive水位后seq21只增一次且maxSeq/latestTs正确', stats21.coveredByArchiveRows === 0 && statsA21 !== undefined && statsA21.inputTokens === 51 && statsA21.cacheReadTokens === 510 && statsA21.cacheWriteTokens === 5100 && statsA21.outputTokens === 51000 && statsA21.maxSeq === 21 && statsA21.latestTs === '2026-10-22T00:00:21.000Z')
    const archiveResult21 = usageStats.archiveLedger(active, { pathContext: STEP00_PATH_CONTEXT })
    const archiveAfter21 = archiveBytesOf(archive)
    const finalRows = usageStats.parseLedgerText(archiveAfter21, { strict: true }).rows
    const finalA = finalRows.find((row) => sameIdentity(row, expectedA))
    const finalB = finalRows.find((row) => sameIdentity(row, expectedB))
    checkTrue('M6-G2-2 seq21 archive只提交一次且A/B完整身份、四桶/maxSeq/latestTs正确', archiveResult21.rows === 3 && archiveResult21.groups === 2 && archiveResult21.coveredByArchiveRows === 0 && finalRows.length === 2 && finalA !== undefined && sameIdentity(finalA, expectedA) && finalA.inputTokens === 51 && finalA.cacheReadTokens === 510 && finalA.cacheWriteTokens === 5100 && finalA.outputTokens === 51000 && finalA.seq === 21 && finalA.ts === '2026-10-22T00:00:21.000Z' && finalB !== undefined && sameIdentity(finalB, expectedB) && finalB.inputTokens === 7 && finalB.cacheReadTokens === 8 && finalB.cacheWriteTokens === 9 && finalB.outputTokens === 10 && finalB.seq === 11 && archiveBytesOf(active) === '' && archiveBytesOf(cursor) === cursorBefore && sha256Text(archiveBytesOf(cursor)) === cursorHash)
    usageStats.archiveLedger(active, { pathContext: STEP00_PATH_CONTEXT })
    checkTrue('M6-G2-2 二次archive字节稳定且无calls/lock/temp残留', archiveBytesOf(archive) === archiveAfter21 && archiveBytesOf(active) === '' && archiveBytesOf(cursor) === cursorBefore && sha256Text(archiveBytesOf(cursor)) === cursorHash && usageStats.parseLedgerText(archiveBytesOf(archive), { strict: true }).rows.every((row) => !Object.hasOwn(row, 'calls')) && !existsSync(usageLedgerModule.usageLedgerLockPath(active)) && archiveResiduals(dir).length === 0)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}

// M6-G2-3：strict archive 同一完整身份的多累计行在发布前拒绝，三文件字节保持不变。
{
  const dir = makeWTemp('dsh-g2-duplicate-archive')
  try {
    const active = join(dir, 'ledger-v2.jsonl')
    const archive = usageStats.archivePathOf(active)
    const cursor = active + '.cursor.json'
    archiveWriteRows(archive, [archiveRow({ sessionId: 'g2-duplicate', provider: 'g2-duplicate-provider', inputTokens: 10, seq: 10 }), archiveRow({ sessionId: 'g2-duplicate', provider: 'g2-duplicate-provider', inputTokens: 30, seq: 20 })])
    archiveWriteRows(active, [])
    writeFileSync(cursor, '{"g2-duplicate":{"seq":20,"index":2}}', 'utf8')
    const before = { active: archiveBytesOf(active), archive: archiveBytesOf(archive), cursor: archiveBytesOf(cursor) }
    let failure
    try { usageStats.archiveLedger(active, { pathContext: STEP00_PATH_CONTEXT }) } catch (error) { failure = error }
    checkTrue('M6-G2-3 strict archive同完整身份多累计行发布前duplicate-archive拒绝且三文件/lock/temp不变', failure !== undefined && failure.code === 'duplicate-archive' && archiveBytesOf(active) === before.active && archiveBytesOf(archive) === before.archive && archiveBytesOf(cursor) === before.cursor && !existsSync(usageLedgerModule.usageLedgerLockPath(active)) && archiveResiduals(dir).length === 0)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}
{

  const dir = makeWTemp('dsh-g3-archive')
  try {
    const active = join(dir, 'ledger-v2.jsonl')
    const archive = usageStats.archivePathOf(active)
    const cursor = active + '.cursor.json'
    const archiveRow1 = archiveRow({ ts: '2026-10-22T00:00:01.000Z', inputTokens: 10, cacheReadTokens: 20, cacheWriteTokens: 30, outputTokens: 40, seq: 1 })
    const activeRow2 = archiveRow({ ts: '2026-10-22T00:00:02.000Z', inputTokens: 1, cacheReadTokens: 2, cacheWriteTokens: 3, outputTokens: 4, seq: 2 })
    const activeRow2Duplicate = archiveRow({ ts: '2026-10-22T00:00:03.000Z', inputTokens: 99, cacheReadTokens: 99, cacheWriteTokens: 99, outputTokens: 99, seq: 2 })
    const activeRowProviderB = archiveRow({ ts: '2026-10-22T00:00:05.000Z', provider: 'm6-provider-b', inputTokens: 5, cacheReadTokens: 6, cacheWriteTokens: 7, outputTokens: 8, seq: 5 })
    archiveWriteRows(archive, [archiveRow1])
    archiveWriteRows(active, [activeRow2, activeRow2Duplicate, activeRowProviderB])
    writeFileSync(cursor, '{"m6-session":{"seq":77,"index":9}}', 'utf8')
    const activeBefore = archiveBytesOf(active)
    const archiveBefore = archiveBytesOf(archive)
    const cursorBefore = archiveBytesOf(cursor)
    checkTrue('M6 AI思考/CLI前无canonical lock', !existsSync(usageLedgerModule.usageLedgerLockPath(active)))
    const stats = usageStats.statLedger(active, { pathContext: STEP00_PATH_CONTEXT })
    const statsA = stats.groups.find((group) => group.provider === 'm6-provider-a')
    const statsB = stats.groups.find((group) => group.provider === 'm6-provider-b')
    checkTrue('M6 默认archive+active统计零写且完整provider分组/四桶/maxSeq/ts/无calls',
      stats.groups.length === 2
      && statsA !== undefined && statsA.inputTokens === 11 && statsA.cacheReadTokens === 22 && statsA.cacheWriteTokens === 33 && statsA.outputTokens === 44 && statsA.maxSeq === 2 && statsA.latestTs === '2026-10-22T00:00:02.000Z'
      && statsB !== undefined && statsB.inputTokens === 5 && statsB.cacheReadTokens === 6 && statsB.cacheWriteTokens === 7 && statsB.outputTokens === 8 && statsB.maxSeq === 5 && statsB.latestTs === '2026-10-22T00:00:05.000Z'
      && stats.groups.every((group) => !Object.hasOwn(group, 'calls'))
      && archiveBytesOf(active) === activeBefore && archiveBytesOf(archive) === archiveBefore && archiveBytesOf(cursor) === cursorBefore
      && !existsSync(usageLedgerModule.usageLedgerLockPath(active)) && archiveResiduals(dir).length === 0)
    const archiveResult = usageStats.archiveLedger(active, { pathContext: STEP00_PATH_CONTEXT })
    const archiveAfter = archiveBytesOf(archive)
    const cursorAfter = archiveBytesOf(cursor)
    checkTrue('M6 成功archive清空active、cursor不变、聚合行含provider且无calls/残留',
      archiveResult.rows === 3 && archiveBytesOf(active) === '' && cursorAfter === cursorBefore
      && usageStats.parseLedgerText(archiveAfter, { strict: true }).rows.length === 2
      && usageStats.parseLedgerText(archiveAfter, { strict: true }).rows.every((row) => !Object.hasOwn(row, 'calls'))
      && !existsSync(usageLedgerModule.usageLedgerLockPath(active)) && archiveResiduals(dir).length === 0)
    usageStats.archiveLedger(active, { pathContext: STEP00_PATH_CONTEXT })
    checkTrue('M6 二次archive字节稳定且active仍空/cursor仍不变', archiveBytesOf(archive) === archiveAfter && archiveBytesOf(active) === '' && archiveBytesOf(cursor) === cursorBefore && archiveResiduals(dir).length === 0)

    const invalidCases = [
      ['V1严格拒绝', JSON.stringify({ schemaVersion: 1, sessionId: 'v1' }) + '\n', 'non-v2'],
      ['坏JSON严格拒绝', '{"schemaVersion":2\n', 'bad-json'],
      ['额外键严格拒绝', JSON.stringify({ ...archiveRow(), calls: [] }) + '\n', 'invalid-v2'],
    ]
    for (const [label, text, code] of invalidCases) {
      archiveWriteRows(archive, [archiveRow({ seq: 8, ts: '2026-10-22T00:00:08.000Z' })])
      writeFileSync(active, text, 'utf8')
      const before = { active: archiveBytesOf(active), archive: archiveBytesOf(archive), cursor: archiveBytesOf(cursor) }
      let failure
      try { usageStats.archiveLedger(active, { pathContext: STEP00_PATH_CONTEXT }) } catch (error) { failure = error }
      checkTrue('M6 ' + label + '发布前零改写/无lock-temp-backup', failure !== undefined && failure.code === code && archiveBytesOf(active) === before.active && archiveBytesOf(archive) === before.archive && archiveBytesOf(cursor) === before.cursor && !existsSync(usageLedgerModule.usageLedgerLockPath(active)) && archiveResiduals(dir).length === 0)
    }

    // M6-B1：多行 parseLedgerText 中途预算超时；可控 clock 在解析中途才超时（前若干次不超时），证明不是调用前立即失败。
    {
      const budgetDir = makeWTemp('dsh-g3-budget-parse')
      try {
        const budgetActive = join(budgetDir, 'ledger-v2.jsonl')
        const budgetArchive = usageStats.archivePathOf(budgetActive)
        const budgetCursor = budgetActive + '.cursor.json'
        const parseArchiveRows = Array.from({ length: 4 }, (_, index) => archiveRow({ sessionId: 'm6-parse-archive-' + index, provider: 'parse-archive-' + index, seq: index + 1 }))
        const parseActiveRows = Array.from({ length: 4 }, (_, index) => archiveRow({ sessionId: 'm6-parse-active-' + index, provider: 'parse-active-' + index, seq: index + 5 }))
        archiveWriteRows(budgetArchive, parseArchiveRows)
        archiveWriteRows(budgetActive, parseActiveRows)
        writeFileSync(budgetCursor, '{"m6-parse":{"seq":12,"index":8}}', 'utf8')
        const parseBefore = { active: archiveBytesOf(budgetActive), archive: archiveBytesOf(budgetArchive), cursor: archiveBytesOf(budgetCursor) }
        let parseClockCalls = 0
        const parseIo = { write: 0, move: 0, remove: 0 }
        let parseFailure
        try {
          usageStats.archiveLedger(budgetActive, { pathContext: STEP00_PATH_CONTEXT,
            budgetMs: 1,
            clock: () => { parseClockCalls += 1; return parseClockCalls >= 10 ? 1 : 0 },
            fsOps: {
              writeFileSync: (...args) => { parseIo.write += 1; return writeFileSync(...args) },
              renameSync: (...args) => { parseIo.move += 1; return renameSync(...args) },
              unlinkSync: (...args) => { parseIo.remove += 1; return unlinkSync(...args) },
            },
          })
        } catch (error) { parseFailure = error }
        checkTrue('M6-B1 多行解析中途budget-timeout：任何write/move/remove前三文件hash不变', parseFailure !== undefined && parseFailure.code === 'budget-timeout' && parseIo.write === 0 && parseIo.move === 0 && parseIo.remove === 0 && archiveBytesOf(budgetActive) === parseBefore.active && archiveBytesOf(budgetArchive) === parseBefore.archive && archiveBytesOf(budgetCursor) === parseBefore.cursor && archiveResiduals(budgetDir).length === 0)
      } finally { rmSync(budgetDir, { recursive: true, force: true }) }
    }
    // M6-B2：多组 archiveTextOf 序列化中途预算超时；clock 在序列化中途才超时且发布尚未开始。
    {
      const budgetDir = makeWTemp('dsh-g3-budget-archive-text')
      try {
        const budgetActive = join(budgetDir, 'ledger-v2.jsonl')
        const budgetArchive = usageStats.archivePathOf(budgetActive)
        const budgetCursor = budgetActive + '.cursor.json'
        const serializeArchiveRows = Array.from({ length: 4 }, (_, index) => archiveRow({ sessionId: 'm6-serialize-archive-' + index, provider: 'serialize-archive-' + index, seq: index + 1 }))
        const serializeActiveRows = Array.from({ length: 4 }, (_, index) => archiveRow({ sessionId: 'm6-serialize-active-' + index, provider: 'serialize-active-' + index, seq: index + 5 }))
        archiveWriteRows(budgetArchive, serializeArchiveRows)
        archiveWriteRows(budgetActive, serializeActiveRows)
        writeFileSync(budgetCursor, '{"m6-serialize":{"seq":12,"index":8}}', 'utf8')
        const serializeBefore = { active: archiveBytesOf(budgetActive), archive: archiveBytesOf(budgetArchive), cursor: archiveBytesOf(budgetCursor) }
        let serializeClockCalls = 0
        const serializeIo = { write: 0, move: 0, remove: 0 }
        let serializeFailure
        try {
          usageStats.archiveLedger(budgetActive, { pathContext: STEP00_PATH_CONTEXT,
            budgetMs: 1,
            clock: () => { serializeClockCalls += 1; return serializeClockCalls >= 49 ? 1 : 0 },
            fsOps: {
              writeFileSync: (...args) => { serializeIo.write += 1; return writeFileSync(...args) },
              renameSync: (...args) => { serializeIo.move += 1; return renameSync(...args) },
              unlinkSync: (...args) => { serializeIo.remove += 1; return unlinkSync(...args) },
            },
          })
        } catch (error) { serializeFailure = error }
        checkTrue('M6-B2 多组archiveTextOf中途budget-timeout：任何write/move/remove前三文件hash不变', serializeFailure !== undefined && serializeFailure.code === 'budget-timeout' && serializeIo.write === 0 && serializeIo.move === 0 && serializeIo.remove === 0 && archiveBytesOf(budgetActive) === serializeBefore.active && archiveBytesOf(budgetArchive) === serializeBefore.archive && archiveBytesOf(budgetCursor) === serializeBefore.cursor && archiveResiduals(budgetDir).length === 0)
      } finally { rmSync(budgetDir, { recursive: true, force: true }) }
    }

    // M6-B3：archive 唯一性数据集下预算检查超时必须在发布前拒绝（零发布 IO、三文件不变、锁释放）。
    {
      const budgetDir = makeWTemp('dsh-g2-budget-unique')
      try {
        const budgetActive = join(budgetDir, 'ledger-v2.jsonl')
        const budgetArchive = usageStats.archivePathOf(budgetActive)
        const budgetCursor = budgetActive + '.cursor.json'
        const uniqueRows = Array.from({ length: 5 }, (_, index) => archiveRow({ sessionId: 'g2-unique-' + index, provider: 'g2-unique-provider-' + index, seq: index + 1 }))
        archiveWriteRows(budgetArchive, uniqueRows)
        archiveWriteRows(budgetActive, [])
        writeFileSync(budgetCursor, '{"g2-unique":{"seq":5,"index":5}}', 'utf8')
        const before = { active: archiveBytesOf(budgetActive), archive: archiveBytesOf(budgetArchive), cursor: archiveBytesOf(budgetCursor) }
        const io = { write: 0, move: 0, remove: 0 }
        // 预算闸门计时器：首次 clock 取起点（0），其后任一预算检查即超时——不再依调用栈/源码行定位。
        let clockCalls = 0
        const clock = () => { clockCalls += 1; return clockCalls > 1 ? 1 : 0 }
        let failure
        try {
          usageStats.archiveLedger(budgetActive, { pathContext: STEP00_PATH_CONTEXT, budgetMs: 1, clock, fsOps: { writeFileSync: (...args) => { io.write += 1; return writeFileSync(...args) }, renameSync: (...args) => { io.move += 1; return renameSync(...args) }, unlinkSync: (...args) => { io.remove += 1; return unlinkSync(...args) } } })
        } catch (error) { failure = error }
        checkTrue('M6-B3 唯一性数据集预算超时：budget-timeout且无发布IO/三文件不变/锁释放', failure !== undefined && failure.code === 'budget-timeout' && io.write === 0 && io.move === 0 && io.remove === 0 && archiveBytesOf(budgetActive) === before.active && archiveBytesOf(budgetArchive) === before.archive && archiveBytesOf(budgetCursor) === before.cursor && !existsSync(usageLedgerModule.usageLedgerLockPath(budgetActive)) && archiveResiduals(budgetDir).length === 0)
      } finally { rmSync(budgetDir, { recursive: true, force: true }) }
    }
    // M6-B4：archiveEntries 数据集下预算检查超时必须在发布前拒绝（零发布 IO、三文件不变、锁释放）。
    {
      const budgetDir = makeWTemp('dsh-g2-budget-archive-entries')
      try {
        const budgetActive = join(budgetDir, 'ledger-v2.jsonl')
        const budgetArchive = usageStats.archivePathOf(budgetActive)
        const budgetCursor = budgetActive + '.cursor.json'
        const archiveEntryRows = Array.from({ length: 5 }, (_, index) => archiveRow({ sessionId: 'g2-archive-entry-' + index, provider: 'g2-archive-entry-provider-' + index, seq: index + 1 }))
        archiveWriteRows(budgetArchive, archiveEntryRows)
        archiveWriteRows(budgetActive, [])
        writeFileSync(budgetCursor, '{"g2-archive-entry":{"seq":5,"index":5}}', 'utf8')
        const before = { active: archiveBytesOf(budgetActive), archive: archiveBytesOf(budgetArchive), cursor: archiveBytesOf(budgetCursor) }
        const io = { write: 0, move: 0, remove: 0 }
        // 预算闸门计时器：首次 clock 取起点（0），其后任一预算检查即超时——不再依调用栈/源码行定位。
        let clockCalls = 0
        const clock = () => { clockCalls += 1; return clockCalls > 1 ? 1 : 0 }
        let failure
        try {
          usageStats.archiveLedger(budgetActive, { pathContext: STEP00_PATH_CONTEXT, budgetMs: 1, clock, fsOps: { writeFileSync: (...args) => { io.write += 1; return writeFileSync(...args) }, renameSync: (...args) => { io.move += 1; return renameSync(...args) }, unlinkSync: (...args) => { io.remove += 1; return unlinkSync(...args) } } })
        } catch (error) { failure = error }
        checkTrue('M6-B4 archiveEntries 数据集预算超时：budget-timeout且无发布IO/三文件不变/锁释放', failure !== undefined && failure.code === 'budget-timeout' && io.write === 0 && io.move === 0 && io.remove === 0 && archiveBytesOf(budgetActive) === before.active && archiveBytesOf(budgetArchive) === before.archive && archiveBytesOf(budgetCursor) === before.cursor && !existsSync(usageLedgerModule.usageLedgerLockPath(budgetActive)) && archiveResiduals(budgetDir).length === 0)
      } finally { rmSync(budgetDir, { recursive: true, force: true }) }
    }

    archiveWriteRows(archive, [archiveRow({ seq: 9, ts: '2026-10-22T00:00:09.000Z' })])
    archiveWriteRows(active, [archiveRow({ seq: 10, ts: '2026-10-22T00:00:10.000Z' })])
    const budgetBefore = { active: archiveBytesOf(active), archive: archiveBytesOf(archive), cursor: archiveBytesOf(cursor) }
    let budgetFailure
    try { usageStats.archiveLedger(active, { pathContext: STEP00_PATH_CONTEXT, budgetMs: 0, clock: () => 0 }) } catch (error) { budgetFailure = error }
    checkTrue('M6 archive预算超时循环在发布前拒绝且三文件字节不变', budgetFailure !== undefined && budgetFailure.code === 'budget-timeout' && archiveBytesOf(active) === budgetBefore.active && archiveBytesOf(archive) === budgetBefore.archive && archiveBytesOf(cursor) === budgetBefore.cursor && !existsSync(usageLedgerModule.usageLedgerLockPath(active)) && archiveResiduals(dir).length === 0)

    // 故障点按「IO 类型 + 该类型调用序号」注入，不依赖内部临时件/备份件命名（lib 改文件名不影响本组）。
    const publishFaultCases = [
      ['archive-temp-write', 'write', 1],
      ['active-temp-write', 'write', 2],
      ['archive-backup-move', 'move', 1],
      ['active-backup-move', 'move', 2],
      ['archive-publish-move', 'move', 3],
      ['active-publish-move', 'move', 4],
      ['active-backup-remove', 'remove', 1],
      ['archive-backup-remove', 'remove', 2],
    ]
    for (const [label, op, ordinal] of publishFaultCases) {
      const faultDir = makeWTemp('dsh-g3-publish-' + label)
      try {
        const faultActive = join(faultDir, 'ledger-v2.jsonl')
        const faultArchive = usageStats.archivePathOf(faultActive)
        const faultCursor = faultActive + '.cursor.json'
        archiveWriteRows(faultArchive, [archiveRow({ sessionId: 'm6-publish-archive-' + label, provider: 'publish-archive', seq: 1 })])
        archiveWriteRows(faultActive, [archiveRow({ sessionId: 'm6-publish-active-' + label, provider: 'publish-active', seq: 2 })])
        writeFileSync(faultCursor, '{"m6-publish":{"seq":22,"index":2}}', 'utf8')
        const before = { active: archiveBytesOf(faultActive), archive: archiveBytesOf(faultArchive), cursor: archiveBytesOf(faultCursor) }
        const io = { write: 0, move: 0, remove: 0 }
        let injected = false
        const inject = () => {
          injected = true
          const error = new Error('injected publish fault: ' + label)
          error.code = 'EIO'
          throw error
        }
        let failure
        try {
          usageStats.archiveLedger(faultActive, { pathContext: STEP00_PATH_CONTEXT,
            fsOps: {
              writeFileSync: (target, ...args) => {
                io.write += 1
                if (!injected && op === 'write' && io.write === ordinal) inject()
                return writeFileSync(target, ...args)
              },
              renameSync: (from, to) => {
                io.move += 1
                if (!injected && op === 'move' && io.move === ordinal) inject()
                return renameSync(from, to)
              },
              unlinkSync: (target) => {
                io.remove += 1
                if (!injected && op === 'remove' && io.remove === ordinal) inject()
                return unlinkSync(target)
              },
            },
          })
        } catch (error) { failure = error }
        const reached = io[op] >= ordinal
        checkTrue('M6 发布故障点 ' + label + ' 独立注入并恢复active/archive/cursor原字节、无tmp/bak残留', failure instanceof Error && typeof failure.code === 'string' && failure.code !== '' && injected && reached && archiveBytesOf(faultActive) === before.active && archiveBytesOf(faultArchive) === before.archive && archiveBytesOf(faultCursor) === before.cursor && !existsSync(usageLedgerModule.usageLedgerLockPath(faultActive)) && archiveResiduals(faultDir).length === 0)
      } finally { rmSync(faultDir, { recursive: true, force: true }) }
    }

    const stalePath = usageLedgerModule.usageLedgerLockPath(active)
    const staleBytes = JSON.stringify({ pid: 2147483647, token: 'm6-stale-token', createdAt: Date.now() })
    writeFileSync(stalePath, staleBytes, 'utf8')
    const staleResult = usageLedgerModule.acquireUsageLedgerLock(active, { waitMs: 0, pathContext: STEP00_PATH_CONTEXT, purpose: 'usage-ledger' })
    checkTrue('M6 stale-lock返回stale-lock且canonical字节不变/不自动接管', staleResult.reason === 'stale-lock' && archiveBytesOf(stalePath) === staleBytes && archiveResiduals(dir).every((name) => !name.includes('.stale-')))
    rmSync(stalePath, { force: true })
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}
// ── RENDER 系列:save_plan 渲染契约（v0.1.3 回归：必须返回 ContentBlock[]）──
const rendered = renderSavePlan({
  paths: ['a.md', 'b.md'],
  plan: 'PLAN_FIELD_SENTINEL',
  checklist: 'CHECKLIST_FIELD_SENTINEL',
})
check('RENDER1 render 返回数组', Array.isArray(rendered), true)
check('RENDER2 单文本块且类型正确', rendered.length === 1 && rendered[0].type === 'text' && typeof rendered[0].text === 'string', true)
check('RENDER3 文本精确为双路径且不回流正文sentinel/结构/摘要', rendered.length === 1 && rendered[0].text === 'a.md\nb.md' && !rendered[0].text.includes('PLAN_FIELD_SENTINEL') && !rendered[0].text.includes('CHECKLIST_FIELD_SENTINEL') && !rendered[0].text.includes('派遣摘要（') && !rendered[0].text.includes('[任务'), true)

// ── PR 系列:validateProbe 机械校验（save_probe，v3） ──────────────────────
const prFixtureRoot = makeWTemp('dsh-pr-probe')
const prExistingPath = join(prFixtureRoot, 'readme.md')
writeFileSync(prExistingPath, 'fixture readme\n', 'utf8')
const PR_PATH_CONTEXT = createPathContext({ workspaceRoot: prFixtureRoot })
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
  ['PR17 path 存在（绝对）→ 过', { ...validProbe(), fileMap: [{ path: prExistingPath, relation: 'r' }] }, 'pass'],
  ['PR18 range L12-x → 拒并指明', { ...validProbe(), focusAreas: [{ path: EXISTING, range: 'L12-x', note: 'n' }] }, 'reject-with', 'range'],
  ['PR19 range 12 → 过', { ...validProbe(), focusAreas: [{ path: EXISTING, range: '12', note: 'n' }] }, 'pass'],
  ['PR20 range L158-162 → 过', { ...validProbe(), focusAreas: [{ path: EXISTING, range: 'L158-162', note: 'n' }] }, 'pass'],
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
  ['PR31 结构非法优先零IO（聚合）', { ...validProbe(), background: [{ topic: 't', detail: 'x'.repeat(PROBE_LIMITS.maxDetailLen + 1) }] }, 'reject-all', ['background[0].detail', '处违规']],
  ['PR32 evidence.line 区间报错含修正法', { ...validProbe(), evidence: [{ path: EXISTING, line: 'L158-162', value: 'v' }] }, 'reject-all', ['禁止区间', 'evidence.text', '单个行号']],
  ['PR33 focusAreas.range 非法报错含区间说明', { ...validProbe(), focusAreas: [{ path: EXISTING, range: 'L12-x', note: 'n' }] }, 'reject-all', ['range', '仅 focusAreas.range 允许从 1 开始的区间']],
  ['PR34 evidence[0].text 1000 字 → 过', { ...validProbe(), evidence: [{ path: EXISTING, text: 't'.repeat(PROBE_LIMITS.maxEvidenceTextLen) }] }, 'pass'],
  ['PR35 evidence[0].text 1001 字 → 拒', { ...validProbe(), evidence: [{ path: EXISTING, text: 't'.repeat(PROBE_LIMITS.maxEvidenceTextLen + 1) }] }, 'reject'],
]
for (const [name, args, mode, substr] of PR) {
  const got = validateProbe(args, prFixtureRoot, PR_PATH_CONTEXT)
  const okResult = mode === 'pass' ? got === null : mode === 'reject' ? typeof got === 'string' && got.length > 0 : mode === 'reject-all' ? typeof got === 'string' && Array.isArray(substr) && substr.every((s) => got.includes(s)) : typeof got === 'string' && got.includes(substr)
  if (okResult) { pass += 1 } else { fail += 1 }
  output.assertion(okResult, name, mode, got)
}
const pr31ZeroIoRoot = join(prFixtureRoot, 'not-created')
const pr31ZeroIo = validateProbe({ ...validProbe(), background: [{ topic: 't', detail: 'x'.repeat(PROBE_LIMITS.maxDetailLen + 1) }] }, pr31ZeroIoRoot, createPathContext({ workspaceRoot: pr31ZeroIoRoot }))
checkTrue('PR31 结构非法优先零IO且不探测路径', typeof pr31ZeroIo === 'string' && pr31ZeroIo.includes('background[0].detail') && !pr31ZeroIo.includes('路径'))
rmSync(prFixtureRoot, { recursive: true, force: true })

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
// 事件换代：agent/session-start 已删除，启动注册改由 agent/created（serial）承担。
schemaRegistration.listeners['agent/created'][0]({ agent: schemaAgent, source: 'startup' })

const schemaSaveProbe = schemaRegistration.registered.find((definition) => definition.name === 'save_probe')
const schemaSavePlan = schemaRegistration.registered.find((definition) => definition.name === 'save_plan')
const schemaPlanDescription = schemaSavePlan === undefined ? '' : String(schemaSavePlan.description || ''); const schemaPlanParameters = schemaSavePlan === undefined || schemaSavePlan.parameters === undefined ? {} : schemaSavePlan.parameters; const schemaDescription = schemaSaveProbe === undefined ? '' : String(schemaSaveProbe.description || ''); const planProperties = schemaPlanParameters.properties || {}; const probeParameters = schemaSaveProbe === undefined || schemaSaveProbe.parameters === undefined ? {} : schemaSaveProbe.parameters; const probeProperties = probeParameters.properties || {}; const planText = JSON.stringify(schemaPlanParameters); const probeText = JSON.stringify(probeParameters); const forbiddenPlan = ['原子双写', '插件将校验', '插件会净化', '不得编造内容、数值或行号']; const forbiddenProbe = ['pro 规划子代理', 'subagent_plan', '委派', '主会话线索模式', '超限会拒绝', '不静默截断', '插件会净化']
check('SCHEMA1 save_plan schema 结构契约（不锁描述文案）', schemaSavePlan !== undefined && schemaPlanParameters.type === 'object' && JSON.stringify(schemaPlanParameters.required) === JSON.stringify(['plan', 'checklist']) && schemaPlanParameters.additionalProperties === false && Object.keys(planProperties).length === 3 && ['plan', 'checklist'].every((key) => planProperties[key] !== undefined && typeof planProperties[key].description === 'string' && planProperties[key].description.trim().length > 0) && schemaSavePlan.output !== undefined && schemaSavePlan.output.schema !== undefined && Object.keys(schemaSavePlan.output.schema.properties || {}).length === 1 && schemaSavePlan.output.schema.properties.paths !== undefined && JSON.stringify(schemaSavePlan.output.schema.required) === JSON.stringify(['paths']) && schemaSavePlan.output.schema.additionalProperties === false && schemaPlanDescription.trim().length > 0 && JSON.stringify(schemaPlanParameters).length > 0 && forbiddenPlan.every((word) => !planText.includes(word)), true)
check('SCHEMA2 save_probe schema 结构契约（不锁描述文案与长度）', schemaDescription.trim().length > 0 && Object.keys(probeProperties).length === 6 && JSON.stringify(probeParameters.required) === JSON.stringify(['fileMap', 'focusAreas', 'exclusions', 'background']) && probeParameters.additionalProperties === false && ['fileMap', 'focusAreas', 'exclusions', 'background', 'evidence'].every((key) => probeProperties[key] !== undefined && typeof probeProperties[key].description === 'string' && probeProperties[key].description.trim().length > 0) && ['fileMap', 'focusAreas', 'exclusions', 'background'].every((key) => probeProperties[key].items !== undefined && probeProperties[key].items.properties !== undefined) && probeProperties.evidence.items.properties.line !== undefined && probeProperties.evidence.items.properties.value !== undefined && probeProperties.evidence.items.properties.text !== undefined && ['20000', '32000', '50', '20', '150', '1024', '400', '120', '1000', '240', '32'].every((value) => (schemaDescription + probeText).includes(value)) && forbiddenProbe.every((word) => !probeText.includes(word)), true)

// ── SAVE-CONTRACT/G2 系列：真实生产合同结构、交接、摘要与工厂接线 ────────
// 这些夹具只拼接合同文本并调用生产导出，不在测试中复制解析器或固化本轮任务数量。
function g2Point(id = 'M1', overrides = {}) {
  return Object.assign({
    id,
    location: 'L1',
    anchor: 'fixture line',
    action: '完成具体修改',
    acceptance: '修改后的 fixture line 结构成立',
    expectations: ['结果可验证'],
    sources: [],
    commands: [],
    outputs: [],
  }, overrides)
}

function g2File(path, overrides = {}) {
  const operation = overrides.operation || '修改'
  const defaultPoint = operation === '修改'
    ? g2Point('M1')
    : operation === '生成'
      ? g2Point('M1', { location: '', anchor: '', sources: ['g2-synthetic/generator-source.js'], commands: ['node generator.mjs'], outputs: ['生成目标文件'] })
      : g2Point('M1', { location: '', anchor: '', action: operation === '删除' ? '整文件删除，理由是测试替换；清理全部引用和调用' : '新建一个独立目标文件' })
  return Object.assign({ path, role: 'main', operation, points: [defaultPoint] }, overrides)
}

function g2Task(id, overrides = {}) {
  const task = Object.assign({
    id,
    title: '合成任务' + id,
    mainFile: 'g2-synthetic/task-' + id + '.js',
    relatedFiles: [],
    group: 'G' + id,
    dependencies: '无',
    dependencyReason: '无',
    groupReason: '无',
    selfChecks: ['核对合成任务' + id],
    resource: '无',
    acceptance: '[检查1]',
    fileOperation: '修改',
  }, overrides)
  if (!Object.prototype.hasOwnProperty.call(overrides, 'fileSpecs')) {
    task.fileSpecs = [g2File(task.mainFile, {
      role: 'main',
      operation: task.fileOperation,
      ...(task.points === undefined ? {} : { points: task.points }),
      ...(task.fileSpec || {}),
    })]
    for (const path of task.relatedFiles) task.fileSpecs.push(g2File(path, { role: 'related', operation: task.relatedOperation || task.fileOperation }))
  }
  return task
}

function g2Check(id, overrides = {}) {
  return Object.assign({
    id,
    title: '核对检查' + id,
    reviewGroup: 'R' + id,
    evidenceMode: '只读复核',
    workdir: '.',
    checks: ['读取合成文件并核对结果'],
    evidence: ['原始结果与期望一致'],
    resource: '无',
  }, overrides)
}

function g2PlanFile(lines, label, record, actionLabel = '修改') {
  lines.push('- ' + label + '：' + record.path)
  lines.push('- 文件操作：' + record.operation)
  for (const point of record.points || []) {
    lines.push('- 修改点：' + point.id)
    if (record.operation === '修改') {
      lines.push('- 修改位置：' + point.location)
      lines.push('- 定位锚点：' + point.anchor)
    }
    for (const source of point.sources || []) lines.push('- 生成来源：' + source)
    for (const command of point.commands || []) lines.push('- 生成命令：' + command)
    for (const output of point.outputs || []) lines.push('- 生成产物：' + output)
    lines.push('- ' + actionLabel + '：' + point.action)
  }
}

function g2PlanText({ tasks = [g2Task(1)], instruction = '先读两份工件，完成后冻结再验收', closure = null } = {}) {
  const lines = ['- 派遣说明：' + instruction]
  for (const task of tasks) {
    lines.push('[任务' + task.id + '] ' + task.title)
    const specs = task.fileSpecs || [g2File(task.mainFile)]
    for (const record of specs) g2PlanFile(lines, record.role === 'related' ? '关联文件' : '主文件', record)
    lines.push('- 执行组：' + task.group)
    lines.push('- 依赖：' + task.dependencies)
    lines.push('- 依赖理由：' + task.dependencyReason)
    lines.push('- 分组理由：' + task.groupReason)
    for (const modification of task.modifications || []) lines.push('- 修改：' + modification)
    for (const selfCheck of task.selfChecks || []) lines.push('- 自检：' + selfCheck)
    lines.push('- 独占资源：' + task.resource)
  }
  if (closure !== null) {
    lines.push('[收尾]')
    const closureSpecs = closure.fileSpecs || (closure.files || []).map((path) => g2File(path, { role: 'closure' }))
    for (const record of closureSpecs) g2PlanFile(lines, '收尾文件', record, '收尾动作')
    lines.push('- 收尾依赖：' + closure.dependencies)
    for (const action of closure.actions || []) lines.push('- 收尾动作：' + action)
    for (const selfCheck of closure.selfChecks || []) lines.push('- 自检：' + selfCheck)
    lines.push('- 独占资源：' + (closure.resource || '无'))
  }
  return lines.join('\n')
}

function g2ChecklistFile(lines, label, record) {
  lines.push('- ' + label + '：' + record.path)
  lines.push('- 文件操作：' + record.operation)
  for (const point of record.points || []) {
    lines.push('- 对应修改点：' + point.id)
    lines.push('- 验收定位：' + point.acceptance)
    for (const expectation of point.expectations || ['结果可验证']) lines.push('- 期望：' + expectation)
  }
}

function g2ChecklistText({ tasks = [g2Task(1)], instruction = '按检查ID复核，漏项不得通过', checks = [g2Check(1)], closure = null, global = null } = {}) {
  const lines = ['- 验收说明：' + instruction]
  for (const task of tasks) {
    lines.push('[任务' + task.id + '] 验收' + task.title)
    const specs = task.fileSpecs || [g2File(task.mainFile)]
    for (const record of specs) g2ChecklistFile(lines, record.role === 'related' ? '关联文件' : '主文件', record)
    for (const expectation of task.expectations || []) lines.push('- 期望：' + expectation)
    for (const prohibition of task.prohibitions || ['不得越界修改']) lines.push('- 禁止：' + prohibition)
    lines.push('- 正式验收：' + (task.acceptance || '[检查1]'))
  }
  if (closure !== null) {
    lines.push('[收尾]')
    const closureSpecs = closure.fileSpecs || (closure.files || []).map((path) => g2File(path, { role: 'closure' }))
    for (const record of closureSpecs) g2ChecklistFile(lines, '收尾文件', record)
    for (const expectation of closure.expectations || []) lines.push('- 期望：' + expectation)
    for (const prohibition of closure.prohibitions || ['不得遗漏收尾']) lines.push('- 禁止：' + prohibition)
    lines.push('- 正式验收：' + (closure.acceptance || '[检查1]'))
  }
  for (const check of checks) {
    lines.push('[检查' + check.id + '] ' + check.title)
    lines.push('- 验收组：' + check.reviewGroup)
    lines.push('- 取证方式：' + check.evidenceMode)
    lines.push('- 工作目录：' + check.workdir)
    for (const action of check.checks || []) lines.push('- 检查：' + action)
    for (const evidence of check.evidence || []) lines.push('- 验收证据：' + evidence)
    lines.push('- 独占资源：' + check.resource)
  }
  if (global !== null) {
    lines.push('[全局验收]')
    for (const expectation of global.expectations || ['全部范围可恢复']) lines.push('- 期望：' + expectation)
    for (const prohibition of global.prohibitions || ['不得漏项']) lines.push('- 禁止：' + prohibition)
    lines.push('- 正式验收：' + (global.acceptance || '[检查1]'))
  }
  return lines.join('\n')
}

function g2Pair({ tasks = [g2Task(1)], checks = [g2Check(1)], planInstruction, checklistInstruction, closure = null, global = null } = {}) {
  return {
    plan: g2PlanText({ tasks, instruction: planInstruction || '先读两份工件，完成后冻结再验收', closure }),
    checklist: g2ChecklistText({ tasks, instruction: checklistInstruction || '按检查ID复核，漏项不得通过', checks, closure, global }),
  }
}

function g2Tasks(count, mapper) {
  return Array.from({ length: count }, (_, index) => mapper === undefined ? g2Task(index + 1) : mapper(index + 1))
}

function g2Pad(text, minimum = 200) {
  if (text.length >= minimum) return text
  return text + '\n普通说明：' + 'x'.repeat(minimum - text.length + 1)
}

function g2Reject(name, pair, options) {
  const result = validateRealSavePlanContract(pair.plan, pair.checklist, options)
  check(name, result.ok, false)
  return result
}

const g2OneTaskPair = g2Pair()
const g2OneTaskResult = validateRealSavePlanContract(g2OneTaskPair.plan, g2OneTaskPair.checklist)
check('G2-A 一个任务通过且方案首行为派遣说明', g2OneTaskResult.ok === true && g2OneTaskPair.plan.split('\n')[0] === '- 派遣说明：先读两份工件，完成后冻结再验收' && g2OneTaskPair.checklist.split('\n')[0] === '- 验收说明：按检查ID复核，漏项不得通过', true)
const g2TaskCountRange = [2, Math.floor(REAL_SAVE_PLAN_LIMITS.maxTasks / 2), REAL_SAVE_PLAN_LIMITS.maxTasks]
check('G2-A 两个任务至 maxTasks 任务数区间全部通过', g2TaskCountRange.every((count) => {
  const pair = g2Pair({ tasks: g2Tasks(count) })
  return validateRealSavePlanContract(pair.plan, pair.checklist).ok === true
}), true)
const g2OverMaxPair = g2Pair({ tasks: g2Tasks(REAL_SAVE_PLAN_LIMITS.maxTasks + 1) })
const g2OverMaxResult = validateRealSavePlanContract(g2OverMaxPair.plan, g2OverMaxPair.checklist)
check('G2-A maxTasks+1 任务数拒绝且诊断字段为任务数', g2OverMaxResult.ok === false && String(g2OverMaxResult.error).includes('字段「任务数」值「' + (REAL_SAVE_PLAN_LIMITS.maxTasks + 1) + '」') && String(g2OverMaxResult.error).includes('任务数不得超过 ' + REAL_SAVE_PLAN_LIMITS.maxTasks + ' 个'), true)
g2Reject('G2-A 空说明拒绝', { plan: g2OneTaskPair.plan.replace('- 派遣说明：先读两份工件，完成后冻结再验收', '- 派遣说明：'), checklist: g2OneTaskPair.checklist.replace('- 验收说明：按检查ID复核，漏项不得通过', '- 验收说明：') })
g2Reject('G2-A 说明出现在任务后拒绝', { plan: g2OneTaskPair.plan + '\n- 派遣说明：迟到说明', checklist: g2OneTaskPair.checklist })
g2Reject('G2-A 空字段拒绝', { plan: g2OneTaskPair.plan.replace('- 主文件：g2-synthetic/task-1.js', '- 主文件：'), checklist: g2OneTaskPair.checklist })
g2Reject('G2-A 职责错位字段拒绝', { plan: g2OneTaskPair.plan + '\n- 检查：方案任务不应出现检查定义', checklist: g2OneTaskPair.checklist + '\n- 修改：验收任务不应声明修改' })
const g2OneTaskFieldMutations = [
  ['主文件', '- 主文件：g2-synthetic/task-1.js'],
  ['执行组', '- 执行组：G1'],
  ['依赖', '- 依赖：无'],
  ['依赖理由', '- 依赖理由：无'],
  ['分组理由', '- 分组理由：无'],
  ['独占资源', '- 独占资源：无'],
]
for (const field of g2OneTaskFieldMutations) {
  g2Reject('G2-A 单值字段' + field[0] + '重复拒绝', { plan: g2OneTaskPair.plan.replace(field[1], field[1] + '\n' + field[1]), checklist: g2OneTaskPair.checklist })
}
g2Reject('G2-A 验收任务正式验收单值重复拒绝', { plan: g2OneTaskPair.plan, checklist: g2OneTaskPair.checklist.replace('- 正式验收：[检查1]', '- 正式验收：[检查1]\n- 正式验收：[检查1]') })
g2Reject('G2-A 非连续任务ID拒绝', g2Pair({ tasks: [g2Task(1), g2Task(3)] }))
g2Reject('G2-A 重复任务ID拒绝', g2Pair({ tasks: [g2Task(1), g2Task(1)] }))
const g2MultiValuePair = g2Pair({
  tasks: [g2Task(1, { modifications: ['动作一', '动作二'], selfChecks: ['自检一', '自检二'] })],
  checks: [g2Check(1, { checks: ['检查一', '检查二'], evidence: ['证据一', '证据二'] })],
})
check('G2-A 多值修改/自检/检查/证据重复行合法', validateRealSavePlanContract(g2MultiValuePair.plan, g2MultiValuePair.checklist).ok, true)
const g2Fence = String.fromCharCode(96).repeat(3)
const g2PseudoPrefix = g2Fence + '\n[任务99] 围栏伪任务\n- 主文件：not-real.js\n' + g2Fence + '\n  [任务88] 缩进伪任务\n'
check('G2-A 围栏与缩进示例不成为结构块', validateRealSavePlanContract(g2PseudoPrefix + g2OneTaskPair.plan, g2PseudoPrefix + g2OneTaskPair.checklist).ok, true)

const g2WithClosure = {
  files: ['g2-synthetic/closure.md'],
  dependencies: '[任务1]',
  actions: ['完成收尾核对'],
  selfChecks: ['复核收尾文件'],
  expectations: ['收尾期望可验证'],
  prohibitions: ['不得绕过收尾'],
  acceptance: '[检查1]',
}
const g2WithGlobal = { expectations: ['全局范围可恢复'], prohibitions: ['不得静默漏项'], acceptance: '[检查1]' }
const g2ClosureGlobalPair = g2Pair({ closure: g2WithClosure, global: g2WithGlobal })
const g2ClosureGlobalResult = validateRealSavePlanContract(g2ClosureGlobalPair.plan, g2ClosureGlobalPair.checklist)
check('G2-A 检查/收尾/全局边界不吞入前任务', g2ClosureGlobalResult.ok && g2ClosureGlobalResult.summary.hasClosure && g2ClosureGlobalResult.summary.hasGlobalAcceptance, true)

const g2PathCases = [
  ['绝对路径', '/abs/a.js'],
  ['盘符路径', 'C:/abs/a.js'],
  ['反斜杠路径', 'g2-synthetic\\a.js'],
  ['点段路径', 'g2-synthetic/../a.js'],
  ['空路径段', 'g2-synthetic//a.js'],
  ['尾斜杠路径', 'g2-synthetic/'],
  ['Markdown包裹路径', '[g2-synthetic/a.js]'],
  ['空路径', ''],
]
for (const item of g2PathCases) {
  const task = g2Task(1, { mainFile: item[1] })
  g2Reject('G2-B ' + item[0] + '拒绝', g2Pair({ tasks: [task] }))
}
const g2NewTargetPair = g2Pair({ tasks: [g2Task(1, { mainFile: 'g2-synthetic/not-yet-created.js', fileOperation: '新建' })] })
check('G2-B 合法新增目标不要求预先存在', validateRealSavePlanContract(g2NewTargetPair.plan, g2NewTargetPair.checklist).ok, true)
const g2RelatedTask = g2Task(1, { relatedFiles: ['g2-synthetic/helper.js'], groupReason: '主文件与辅助文件必须同一修改上下文' })
check('G2-B 单个关联文件有非空拆分理由通过', validateRealSavePlanContract(g2Pair({ tasks: [g2RelatedTask] }).plan, g2Pair({ tasks: [g2RelatedTask] }).checklist).ok, true)
g2Reject('G2-B 任意关联文件缺分组理由拒绝', g2Pair({ tasks: [g2Task(1, { relatedFiles: ['g2-synthetic/helper.js'], groupReason: '无' })] }))
const g2CrossDocumentMismatch = g2Pair()
g2Reject('G2-B 双文档主文件不一致拒绝', { plan: g2CrossDocumentMismatch.plan, checklist: g2CrossDocumentMismatch.checklist.replace('g2-synthetic/task-1.js', 'g2-synthetic/other.js') })
const g2RelatedMismatchPlan = g2Pair({ tasks: [g2RelatedTask] })
g2Reject('G2-B 双文档关联文件集合不一致拒绝', { plan: g2RelatedMismatchPlan.plan, checklist: g2OneTaskPair.checklist })
g2Reject('G2-B 同组跨任务重复文件拒绝', g2Pair({ tasks: [g2Task(1, { mainFile: 'g2-synthetic/shared.js', group: 'G1', groupReason: '同组共同实现' }), g2Task(2, { mainFile: 'g2-synthetic/shared.js', group: 'G1', groupReason: '同组共同实现' })] }))
const g2CasePair = g2Pair({ tasks: [g2Task(1, { mainFile: 'g2-synthetic/A.js' }), g2Task(2, { mainFile: 'g2-synthetic/a.js' })] })
check('G2-B Windows大小写文件冲突拒绝', validateRealSavePlanContract(g2CasePair.plan, g2CasePair.checklist, { platform: 'win32' }).ok, false)
check('G2-B 大小写敏感平台区分路径通过', validateRealSavePlanContract(g2CasePair.plan, g2CasePair.checklist, { platform: 'posix' }).ok, true)

const g2ChainTasks = [
  g2Task(1, { group: 'G1', groupReason: '同组按内部拓扑共同实现' }),
  g2Task(2, { group: 'G1', dependencies: '[任务1]', dependencyReason: '先完成任务1再继续', groupReason: '同组按内部拓扑共同实现' }),
  g2Task(3, { group: 'G2', dependencies: '[任务2]', dependencyReason: '先取得G1交付', groupReason: '无' }),
]
const g2ChainResult = validateRealSavePlanContract(g2Pair({ tasks: g2ChainTasks }).plan, g2Pair({ tasks: g2ChainTasks }).checklist)
check('G2-C 真实链与同组内部顺序通过', g2ChainResult.ok && JSON.stringify(g2ChainResult.summary.groups[0].internalOrder) === JSON.stringify([1, 2]) && JSON.stringify(g2ChainResult.summary.groups[1].groupDependsOn) === JSON.stringify(['G1']) && g2ChainResult.summary.groups[1].initialState === 'waiting', true)
const g2DiamondTasks = [
  g2Task(1, { group: 'G1' }),
  g2Task(2, { group: 'G2', dependencies: '[任务1]', dependencyReason: '先取得根任务结果' }),
  g2Task(3, { group: 'G3', dependencies: '[任务1]', dependencyReason: '先取得根任务结果' }),
  g2Task(4, { group: 'G4', dependencies: '[任务2]、[任务3]', dependencyReason: '汇合两个前置结果' }),
]
check('G2-C 菱形依赖与并列根通过', validateRealSavePlanContract(g2Pair({ tasks: g2DiamondTasks }).plan, g2Pair({ tasks: g2DiamondTasks }).checklist).ok, true)
g2Reject('G2-C 不存在依赖引用拒绝', g2Pair({ tasks: [g2Task(1), g2Task(2, { dependencies: '[任务9]', dependencyReason: '缺失前置' })] }))
g2Reject('G2-C 自依赖拒绝', g2Pair({ tasks: [g2Task(1, { dependencies: '[任务1]', dependencyReason: '自依赖错误' }), g2Task(2)] }))
g2Reject('G2-C 重复依赖引用拒绝', g2Pair({ tasks: [g2Task(1), g2Task(2, { dependencies: '[任务1]、[任务1]', dependencyReason: '重复前置' })] }))
g2Reject('G2-C 任务依赖环拒绝', g2Pair({ tasks: [g2Task(1, { group: 'G1', dependencies: '[任务2]', dependencyReason: '先取得任务2' }), g2Task(2, { group: 'G2', dependencies: '[任务1]', dependencyReason: '先取得任务1' })] }))
const g2GroupCycleTasks = [
  g2Task(1, { group: 'G1', groupReason: '同组共同实现', dependencies: '[任务2]', dependencyReason: '先取得G2中间结果' }),
  g2Task(2, { group: 'G2', dependencies: '[任务3]', dependencyReason: '先取得G1后续结果' }),
  g2Task(3, { group: 'G1', groupReason: '同组共同实现' }),
]
g2Reject('G2-C 任务无环但组折叠成环拒绝', g2Pair({ tasks: g2GroupCycleTasks }))
g2Reject('G2-C 无依赖却写非无理由拒绝', g2Pair({ tasks: [g2Task(1, { dependencyReason: '错误依赖理由' })] }))
g2Reject('G2-C 有依赖却写无理由拒绝', g2Pair({ tasks: [g2Task(1), g2Task(2, { dependencies: '[任务1]', dependencyReason: '无' })] }))
g2Reject('G2-C 同组理由不一致拒绝', g2Pair({ tasks: [g2Task(1, { group: 'G1', groupReason: '同组共同实现' }), g2Task(2, { group: 'G1', groupReason: '另一理由' })] }))
g2Reject('G2-C 同组多任务写无理由拒绝', g2Pair({ tasks: [g2Task(1, { group: 'G1', groupReason: '无' }), g2Task(2, { group: 'G1', groupReason: '无' })] }))
const g2ResourceSameGroup = g2Pair({ tasks: [g2Task(1, { group: 'G1', groupReason: '同组共享资源顺序实现', resource: 'repo-regression' }), g2Task(2, { group: 'G1', groupReason: '同组共享资源顺序实现', resource: 'repo-regression' })] })
check('G2-C 同组共享执行资源通过', validateRealSavePlanContract(g2ResourceSameGroup.plan, g2ResourceSameGroup.checklist).ok, true)
g2Reject('G2-C 跨执行组资源冲突拒绝', g2Pair({ tasks: [g2Task(1, { group: 'G1', resource: 'repo-regression' }), g2Task(2, { group: 'G2', resource: 'repo-regression' })] }))
g2Reject('G2-C 单字段资源标识重复拒绝', g2Pair({ tasks: [g2Task(1, { resource: 'cache,cache' })] }))
const g2IndependentGroups = validateRealSavePlanContract(g2Pair({ tasks: [g2Task(1, { group: 'G1' }), g2Task(2, { group: 'G2' })] }).plan, g2Pair({ tasks: [g2Task(1, { group: 'G1' }), g2Task(2, { group: 'G2' })] }).checklist)
check('G2-C 独立执行组均为静态eligible且不等价人数', g2IndependentGroups.ok && g2IndependentGroups.summary.groups.every((group) => group.initialState === 'eligible') && g2IndependentGroups.summary.groupCount === 2 && g2IndependentGroups.summary.executorCount === undefined, true)

const g2SharedCheckPair = g2Pair({ tasks: [g2Task(1), g2Task(2)] })
const g2SharedCheckResult = validateRealSavePlanContract(g2SharedCheckPair.plan, g2SharedCheckPair.checklist)
check('G2-D 多任务复用一个检查通过并记录覆盖', g2SharedCheckResult.ok && JSON.stringify(g2SharedCheckResult.summary.checks[0].coverage.tasks) === JSON.stringify([1, 2]), true)
const g2TwoCheckTasks = [g2Task(1, { acceptance: '[检查1]、[检查2]' }), g2Task(2, { acceptance: '[检查1]' })]
const g2TwoChecks = [g2Check(1, { reviewGroup: 'R1' }), g2Check(2, { reviewGroup: 'R2', checks: ['核对第二范围'], evidence: ['第二范围证据'] })]
const g2TwoCheckResult = validateRealSavePlanContract(g2Pair({ tasks: g2TwoCheckTasks, checks: g2TwoChecks }).plan, g2Pair({ tasks: g2TwoCheckTasks, checks: g2TwoChecks }).checklist)
check('G2-D 一任务引用多个检查且R组独立通过', g2TwoCheckResult.ok && g2TwoCheckResult.summary.reviewGroupCount === 2, true)
const g2MissingReviewGroup = g2Pair().checklist.replace('- 验收组：R1\n', '')
g2Reject('G2-D 缺验收组字段拒绝', { plan: g2OneTaskPair.plan, checklist: g2MissingReviewGroup })
g2Reject('G2-D 非法取证方式拒绝', { plan: g2OneTaskPair.plan, checklist: g2OneTaskPair.checklist.replace('- 取证方式：只读复核', '- 取证方式：自由执行') })
const g2ExecutionEvidence = validateRealSavePlanContract(g2Pair({ checks: [g2Check(1, { evidenceMode: '执行取证' })] }).plan, g2Pair({ checks: [g2Check(1, { evidenceMode: '执行取证' })] }).checklist)
check('G2-D 执行取证只记录声明不放宽运行时权限', g2ExecutionEvidence.ok && g2ExecutionEvidence.summary.checks[0].evidenceMode === '执行取证', true)
g2Reject('G2-D 非法工作目录边界拒绝', { plan: g2OneTaskPair.plan, checklist: g2OneTaskPair.checklist.replace('- 工作目录：.', '- 工作目录：C:/outside') })
g2Reject('G2-D 缺检查动作拒绝', { plan: g2OneTaskPair.plan, checklist: g2OneTaskPair.checklist.replace('- 检查：读取合成文件并核对结果\n', '') })
g2Reject('G2-D 缺验收证据拒绝', { plan: g2OneTaskPair.plan, checklist: g2OneTaskPair.checklist.replace('- 验收证据：原始结果与期望一致\n', '') })
const g2OrphanChecks = [g2Check(1), g2Check(2, { checks: ['孤儿检查动作'], evidence: ['孤儿证据'] })]
g2Reject('G2-D 孤儿检查定义拒绝', g2Pair({ checks: g2OrphanChecks }))
g2Reject('G2-D 不存在检查引用拒绝', g2Pair({ tasks: [g2Task(1, { acceptance: '[检查9]' })] }))
g2Reject('G2-D 重复检查引用拒绝', g2Pair({ tasks: [g2Task(1, { acceptance: '[检查1]、[检查1]' })] }))
const g2DuplicateSignatureChecks = [g2Check(1, { reviewGroup: 'R1' }), g2Check(2, { reviewGroup: 'R1', title: '相同签名不同标题' })]
g2Reject('G2-D 完全相同检查签名拒绝', g2Pair({ tasks: [g2Task(1, { acceptance: '[检查1]、[检查2]' })], checks: g2DuplicateSignatureChecks }))
const g2DistinctSignatureChecks = [g2Check(1, { checks: ['动作一', '动作二'] }), g2Check(2, { title: '顺序不同', checks: ['动作二', '动作一'] })]
check('G2-D 检查动作顺序不同不误合并', validateRealSavePlanContract(g2Pair({ tasks: [g2Task(1, { acceptance: '[检查1]、[检查2]' })], checks: g2DistinctSignatureChecks }).plan, g2Pair({ tasks: [g2Task(1, { acceptance: '[检查1]、[检查2]' })], checks: g2DistinctSignatureChecks }).checklist).ok, true)
const g2WorkdirDistinctChecks = [g2Check(1, { workdir: 'src' }), g2Check(2, { title: '目录不同', workdir: 'src/sub' })]
check('G2-D 检查工作目录不同不误合并', validateRealSavePlanContract(g2Pair({ tasks: [g2Task(1, { acceptance: '[检查1]、[检查2]' })], checks: g2WorkdirDistinctChecks }).plan, g2Pair({ tasks: [g2Task(1, { acceptance: '[检查1]、[检查2]' })], checks: g2WorkdirDistinctChecks }).checklist).ok, true)
const g2CheckCaseChecks = [g2Check(1, { workdir: 'src' }), g2Check(2, { title: '大小写目录', workdir: 'SRC' })]
const g2CheckCasePair = g2Pair({ tasks: [g2Task(1, { acceptance: '[检查1]、[检查2]' })], checks: g2CheckCaseChecks })
check('G2-D Windows工作目录规范化拒绝重复签名', validateRealSavePlanContract(g2CheckCasePair.plan, g2CheckCasePair.checklist, { platform: 'win32' }).ok, false)
check('G2-D posix工作目录大小写可区分', validateRealSavePlanContract(g2CheckCasePair.plan, g2CheckCasePair.checklist, { platform: 'posix' }).ok, true)
const g2ReviewResourceChecks = [g2Check(1, { reviewGroup: 'R1', resource: 'repo-regression' }), g2Check(2, { reviewGroup: 'R2', title: '资源冲突检查', checks: ['核对冲突'], evidence: ['冲突证据'], resource: 'repo-regression' })]
g2Reject('G2-D 跨验收组资源冲突拒绝', g2Pair({ tasks: [g2Task(1, { acceptance: '[检查1]、[检查2]' })], checks: g2ReviewResourceChecks }))
const g2ReviewResourceSame = [g2Check(1, { reviewGroup: 'R1', resource: 'repo-regression' }), g2Check(2, { reviewGroup: 'R1', title: '同组资源', checks: ['核对同组'], evidence: ['同组证据'], resource: 'repo-regression' })]
check('G2-D 同验收组资源可共享', validateRealSavePlanContract(g2Pair({ tasks: [g2Task(1, { acceptance: '[检查1]、[检查2]' })], checks: g2ReviewResourceSame }).plan, g2Pair({ tasks: [g2Task(1, { acceptance: '[检查1]、[检查2]' })], checks: g2ReviewResourceSame }).checklist).ok, true)

check('G2-E 无收尾无全局合法', validateRealSavePlanContract(g2OneTaskPair.plan, g2OneTaskPair.checklist).ok, true)
check('G2-E 仅收尾合法', validateRealSavePlanContract(g2Pair({ closure: g2WithClosure }).plan, g2Pair({ closure: g2WithClosure }).checklist).ok, true)
check('G2-E 仅全局合法', validateRealSavePlanContract(g2Pair({ global: g2WithGlobal }).plan, g2Pair({ global: g2WithGlobal }).checklist).ok, true)
check('G2-E 收尾和全局同时合法', g2ClosureGlobalResult.ok, true)
const g2NoFileClosure = { files: [], dependencies: '[任务1]', actions: ['完成无文件收尾'], selfChecks: ['核对无文件收尾'], expectations: ['无文件收尾结果可复核'], prohibitions: ['不得绕过只读收尾'], acceptance: '[检查1]' }
check('G2-E 无收尾文件但有收尾检查合法', validateRealSavePlanContract(g2Pair({ closure: g2NoFileClosure }).plan, g2Pair({ closure: g2NoFileClosure }).checklist).ok, true)
g2Reject('G2-E 收尾单边存在拒绝', { plan: g2Pair({ closure: g2WithClosure }).plan, checklist: g2OneTaskPair.checklist })
g2Reject('G2-E 收尾文件集合不一致拒绝', { plan: g2Pair({ closure: g2WithClosure }).plan, checklist: g2Pair({ closure: Object.assign({}, g2WithClosure, { files: ['g2-synthetic/other-closure.md'] }) }).checklist })
g2Reject('G2-E 收尾文件与任务文件重叠拒绝', { plan: g2Pair({ closure: Object.assign({}, g2WithClosure, { files: ['g2-synthetic/task-1.js'] }) }).plan, checklist: g2Pair({ closure: Object.assign({}, g2WithClosure, { files: ['g2-synthetic/task-1.js'] }) }).checklist })
g2Reject('G2-E 收尾依赖缺任务拒绝', { plan: g2Pair({ tasks: g2Tasks(2), closure: Object.assign({}, g2WithClosure, { dependencies: '[任务1]' }) }).plan, checklist: g2Pair({ tasks: g2Tasks(2), closure: Object.assign({}, g2WithClosure, { dependencies: '[任务1]' }) }).checklist })
g2Reject('G2-E 收尾依赖引用不存在任务拒绝', { plan: g2Pair({ closure: Object.assign({}, g2WithClosure, { dependencies: '[任务9]' }) }).plan, checklist: g2Pair({ closure: Object.assign({}, g2WithClosure, { dependencies: '[任务9]' }) }).checklist })
const g2DuplicateClosure = g2Pair({ closure: g2WithClosure })
g2Reject('G2-E 重复收尾块拒绝', { plan: g2DuplicateClosure.plan + '\n[收尾]\n- 收尾动作：重复', checklist: g2DuplicateClosure.checklist + '\n[收尾]\n- 期望：重复' })
const g2GlobalOutOfOrderPair = g2Pair({ global: g2WithGlobal })
const g2GlobalBlock = g2GlobalOutOfOrderPair.checklist.slice(g2GlobalOutOfOrderPair.checklist.indexOf('[全局验收]'))
const g2GlobalBeforeCheck = g2OneTaskPair.checklist.replace('[检查1] 核对检查1', g2GlobalBlock + '\n[检查1] 核对检查1')
g2Reject('G2-E 全局验收不在最后拒绝', { plan: g2OneTaskPair.plan, checklist: g2GlobalBeforeCheck })
g2Reject('G2-E 方案出现全局验收拒绝', { plan: g2Pair().plan + '\n[全局验收]\n- 期望：错误\n- 禁止：错误\n- 正式验收：[检查1]', checklist: g2OneTaskPair.checklist })
const g2DuplicateGlobal = g2Pair({ global: g2WithGlobal })
g2Reject('G2-E 重复全局验收块拒绝', { plan: g2OneTaskPair.plan, checklist: g2DuplicateGlobal.checklist + '\n[全局验收]\n- 期望：重复\n- 禁止：重复\n- 正式验收：[检查1]' })

const g2SummaryTasks = [
  g2Task(1, { group: 'G1', relatedFiles: ['g2-synthetic/related.js'], groupReason: '主文件与关联文件共同实现', acceptance: '[检查1]' }),
  g2Task(2, { group: 'G2', dependencies: '[任务1]', dependencyReason: '先取得G1交付', acceptance: '[检查1]、[检查2]' }),
]
const g2SummaryChecks = [g2Check(1, { reviewGroup: 'R1' }), g2Check(2, { reviewGroup: 'R2', title: '共享范围检查', checks: ['核对共享范围'], evidence: ['共享范围结果'] })]
const g2SummaryClosure = { files: ['g2-synthetic/closure-summary.md'], dependencies: '[任务1]、[任务2]', actions: ['完成总结收尾'], selfChecks: ['复核总结收尾'], acceptance: '[检查2]' }
const g2SummaryPair = g2Pair({ tasks: g2SummaryTasks, checks: g2SummaryChecks, closure: g2SummaryClosure, global: { expectations: ['所有范围可恢复'], prohibitions: ['不得把组数当人数'], acceptance: '[检查1]' } })
const g2SummaryResult = validateRealSavePlanContract(g2SummaryPair.plan, g2SummaryPair.checklist)
check('G2-F summary含完整任务/组/R组/共享检查/收尾全局', g2SummaryResult.ok && g2SummaryResult.summary.taskCount === 2 && g2SummaryResult.summary.taskFileCount === 3 && g2SummaryResult.summary.closureFileCount === 1 && g2SummaryResult.summary.fileCount === 4 && g2SummaryResult.summary.totalFileCount === 4 && g2SummaryResult.summary.groupCount === 2 && g2SummaryResult.summary.reviewGroupCount === 2 && g2SummaryResult.summary.checkCount === 2 && g2SummaryResult.summary.hasClosure && g2SummaryResult.summary.hasGlobalAcceptance && g2SummaryResult.summary.groups[1].initialState === 'waiting' && g2SummaryResult.summary.checks[1].coverage.closure && g2SummaryResult.summary.reviewGroups.length === 2, true)
const g2SummaryText = g2SummaryResult.ok ? formatRealSavePlanSummary(g2SummaryResult.summary) : ''
check('G2-F summary保留完整文件与职责说明且不暴露路径依赖', g2SummaryText.includes('g2-synthetic/closure-summary.md') && g2SummaryText.includes('执行组G1') && g2SummaryText.includes('验收组R2') && g2SummaryText.includes('工具只校验并在单次调用内写入/发布'), true)
const g2RenderedSummary = g2SummaryResult.ok
  ? renderRealSavePlan({
      paths: ['g2-synthetic/方案.md', 'g2-synthetic/验收.md'],
      plan: g2SummaryPair.plan + '\nPLAN_FIELD_SENTINEL',
      checklist: g2SummaryPair.checklist + '\nCHECKLIST_FIELD_SENTINEL',
    })
  : []
const g2RenderedSummaryText = Array.isArray(g2RenderedSummary) && g2RenderedSummary.length === 1 && g2RenderedSummary[0].type === 'text' ? g2RenderedSummary[0].text : ''
check('G2-F render精确双路径且不回流正文sentinel/结构/摘要', g2RenderedSummaryText === 'g2-synthetic/方案.md\ng2-synthetic/验收.md' && !g2RenderedSummaryText.includes('PLAN_FIELD_SENTINEL') && !g2RenderedSummaryText.includes('CHECKLIST_FIELD_SENTINEL') && !g2RenderedSummaryText.includes('派遣摘要（') && !g2RenderedSummaryText.includes('[任务'), true)
check('G2-F 计数使用生产限制且不把groupCount当executorCount', REAL_SAVE_PLAN_LIMITS.maxTasks === 20 && REAL_SAVE_PLAN_LIMITS.maxSummaryChars === 12000 && g2SummaryResult.summary.executorCount === undefined, true)
const g2SummaryBaseTasks = g2Tasks(REAL_SAVE_PLAN_LIMITS.maxTasks).map((task, index) => index === 0 ? Object.assign({}, task, { title: 'A' }) : task)
const g2SummaryBasePair = g2Pair({ tasks: g2SummaryBaseTasks })
const g2SummaryBaseResult = validateRealSavePlanContract(g2SummaryBasePair.plan, g2SummaryBasePair.checklist)
const g2SummaryBaseLength = g2SummaryBaseResult.ok ? formatRealSavePlanSummary(g2SummaryBaseResult.summary).length : -1
const g2SummaryExactExtra = Math.max(0, REAL_SAVE_PLAN_LIMITS.maxSummaryChars - g2SummaryBaseLength)
const g2SummaryExactTasks = g2SummaryBaseTasks.map((task, index) => index === 0 ? Object.assign({}, task, { title: 'A' + 'x'.repeat(g2SummaryExactExtra) }) : task)
const g2SummaryExactPair = g2Pair({ tasks: g2SummaryExactTasks })
const g2SummaryExactResult = validateRealSavePlanContract(g2SummaryExactPair.plan, g2SummaryExactPair.checklist)
const g2SummaryOverTasks = g2SummaryBaseTasks.map((task, index) => index === 0 ? Object.assign({}, task, { title: 'A' + 'x'.repeat(g2SummaryExactExtra + 1) }) : task)
const g2SummaryOverPair = g2Pair({ tasks: g2SummaryOverTasks })
const g2SummaryOverResult = validateRealSavePlanContract(g2SummaryOverPair.plan, g2SummaryOverPair.checklist)
check('G2-F 摘要恰12000字符通过', g2SummaryExactResult.ok && formatRealSavePlanSummary(g2SummaryExactResult.summary).length === REAL_SAVE_PLAN_LIMITS.maxSummaryChars, true)
check('G2-F 摘要12001字符拒绝', !g2SummaryOverResult.ok && g2SummaryOverResult.error.includes('派遣摘要'), true)

const g2Recovered = validateRealSavePlanContract(g2SummaryPair.plan, g2SummaryPair.checklist)
const g2RecoveredScope = g2Recovered.ok ? {
  tasks: g2Recovered.summary.tasks.map((task) => ({ id: task.id, files: task.files, executionGroup: task.executionGroup })),
  groups: g2Recovered.summary.groups.map((group) => ({ group: group.group, members: group.members, groupDependsOn: group.groupDependsOn, initialState: group.initialState })),
  reviewGroups: g2Recovered.summary.reviewGroups.map((group) => ({ reviewGroup: group.reviewGroup, checks: group.checks })),
  checks: g2Recovered.summary.checks.map((checkItem) => ({ id: checkItem.id, coverage: checkItem.coverage })),
} : null
check('G2-G 父会话仅凭两份合成正文恢复两执行组两验收组共享检查', g2RecoveredScope !== null && g2RecoveredScope.tasks[0].files.includes('g2-synthetic/related.js') && g2RecoveredScope.groups[1].groupDependsOn[0] === 'G1' && g2RecoveredScope.reviewGroups.length === 2 && g2RecoveredScope.checks[0].coverage.tasks.length === 2, true)
check('G2-G 恢复证据不依赖planner render且不冒充真实代理执行', g2RecoveredScope !== null && g2RenderedSummary.length === 1 && g2RecoveredScope.realAgentExecution !== true, true)
function g2HandoffStatus(expectedTasks, expectedChecks, reports, sourceChanged) {
  if (sourceChanged) return '需复验'
  if (reports.tasks.some((id) => !expectedTasks.includes(id)) || reports.checks.some((id) => !expectedChecks.includes(id))) return 'FAIL'
  if (new Set(reports.tasks).size !== reports.tasks.length || new Set(reports.checks).size !== reports.checks.length) return 'FAIL'
  if (reports.tasks.length !== expectedTasks.length || reports.checks.length !== expectedChecks.length) return 'INCOMPLETE'
  return 'PASS'
}
check('G2-G 漏任务或漏检查回报分类为INCOMPLETE', g2HandoffStatus([1, 2], [1, 2], { tasks: [1], checks: [1, 2] }, false), 'INCOMPLETE')
check('G2-G 错误ID回报分类为FAIL', g2HandoffStatus([1, 2], [1, 2], { tasks: [1, 3], checks: [1, 2] }, false), 'FAIL')
check('G2-G 矛盾/重复回报分类为FAIL', g2HandoffStatus([1, 2], [1, 2], { tasks: [1, 2], checks: [1, 1] }, false), 'FAIL')
function g2ContradictionStatus(reports) {
  const statuses = new Map()
  for (const report of reports) {
    if (statuses.has(report.id) && statuses.get(report.id) !== report.status) return 'FAIL'
    statuses.set(report.id, report.status)
  }
  return 'PASS'
}
check('G2-G 同ID矛盾结论分类为FAIL', g2ContradictionStatus([{ id: 1, status: 'PASS' }, { id: 1, status: 'FAIL' }]), 'FAIL')
check('G2-G 源变更回报分类为需复验', g2HandoffStatus([1, 2], [1, 2], { tasks: [1, 2], checks: [1, 2] }, true), '需复验')

const g2FactoryFixture = makeFixtureDir({ label: 'step00-factory' })
const g2FactoryEvidenceRoot = g2FactoryFixture.root
try {
  const g2FactoryCwd = join(g2FactoryEvidenceRoot, 'work')
  mkdirSync(join(g2FactoryCwd, 'g2-fixture'), { recursive: true })
  writeFileSync(join(g2FactoryCwd, 'g2-fixture', 'minimal.js'), 'fixture\n', 'utf8')
  const g2MinimalPair = {
    plan: '- 派遣说明：x\n[任务1] x\n- 主文件：g2-fixture/minimal.js\n- 文件操作：修改\n- 修改点：M1\n- 修改位置：L1\n- 定位锚点：fixture\n- 修改：x\n- 执行组：G1\n- 依赖：无\n- 依赖理由：无\n- 分组理由：无\n- 自检：x',
    checklist: '- 验收说明：x\n[任务1] x\n- 主文件：g2-fixture/minimal.js\n- 文件操作：修改\n- 对应修改点：M1\n- 验收定位：minimal.js exists\n- 期望：x\n- 禁止：x\n- 正式验收：[检查1]\n[检查1] x\n- 验收组：R1\n- 取证方式：只读复核\n- 工作目录：.\n- 检查：x\n- 验收证据：x',
  }
  check('G2-H 纯validator允许短正文', g2MinimalPair.plan.length < 200 && g2MinimalPair.checklist.length < 200 && validateRealSavePlanContract(g2MinimalPair.plan, g2MinimalPair.checklist).ok, true)
  const g2FactoryIo = { atomic: 0, committed: null }
  const g2Factories = createSaveToolFactories({
    savePlanDir: '.extra-plan',
    atomicCommit: (...args) => { g2FactoryIo.atomic += 1; g2FactoryIo.committed = args },
    getPathContext: () => createPathContext({ workspaceRoot: g2FactoryCwd }),
  })
  const g2SavePlanDefinition = g2Factories.defineSavePlan()
  let g2ShortFactoryError = null
  try { await g2SavePlanDefinition.execute(g2MinimalPair, { agent: { session: { header: { cwd: g2FactoryCwd, id: 'g2-factory' } } } }) } catch (error) { g2ShortFactoryError = error instanceof Error ? error.message : String(error) }
  check('G2-H factory短正文按双方至少200字符拒绝', g2ShortFactoryError !== null && g2ShortFactoryError.includes('内容过短') && g2FactoryIo.atomic === 0, true)
  const g2InvalidLongPair = {
    plan: g2Pad(g2OneTaskPair.plan),
    checklist: g2Pad(g2OneTaskPair.checklist.replace('- 正式验收：[检查1]', '- 正式验收：[检查9]')),
  }
  let g2InvalidFactoryError = null
  try { await g2SavePlanDefinition.execute(g2InvalidLongPair) } catch (error) { g2InvalidFactoryError = error instanceof Error ? error.message : String(error) }
  check('G2-H 非法结构在atomic前拒绝', g2InvalidFactoryError !== null && g2InvalidFactoryError.startsWith('save_plan: 文件级任务合同校验不通过') && g2FactoryIo.atomic === 0, true)
  const g2FactoryValidPlan = g2Pad(g2MinimalPair.plan + '\n普通方案补充：保持正文逐字保存\nPLAN_FIELD_SENTINEL')
  const g2FactoryValidChecklist = g2Pad(g2MinimalPair.checklist + '\n普通验收补充：保持正文逐字保存\nCHECKLIST_FIELD_SENTINEL')
  let g2FactoryResult = null
  let g2FactoryError = null
  try {
    g2FactoryResult = await g2SavePlanDefinition.execute({ plan: g2FactoryValidPlan, checklist: g2FactoryValidChecklist }, { agent: { session: { header: { cwd: g2FactoryCwd, id: 'g2-factory' } } } })
  } catch (error) { g2FactoryError = error instanceof Error ? error.message : String(error) }
  check('G2-H factory合法正文双方至少200字符并返回两paths', g2FactoryError === null && g2FactoryValidPlan.length >= 200 && g2FactoryValidChecklist.length >= 200 && g2FactoryResult !== null && Array.isArray(g2FactoryResult.paths) && g2FactoryResult.paths.length === 2 && g2FactoryIo.atomic === 1, true)
  check('G2-H factory双正文逐字保留', g2FactoryIo.committed !== null && Array.isArray(g2FactoryIo.committed[2]) && g2FactoryIo.committed[2][0].content === g2FactoryValidPlan && g2FactoryIo.committed[2][1].content === g2FactoryValidChecklist, true)
  const g2FactoryRendered = g2FactoryResult === null ? [] : g2SavePlanDefinition.output.render({ plan: g2FactoryValidPlan, checklist: g2FactoryValidChecklist }, g2FactoryResult)
  const g2FactoryRenderText = Array.isArray(g2FactoryRendered) && g2FactoryRendered.length === 1 && g2FactoryRendered[0].type === 'text' ? g2FactoryRendered[0].text : ''
  const g2FactoryExpectedText = g2FactoryResult !== null && Array.isArray(g2FactoryResult.paths) ? g2FactoryResult.paths.map((path) => String(path)).join('\n') : ''
  check('G2-H factory structured output只含paths且render精确双路径', JSON.stringify(Object.keys(g2SavePlanDefinition.output.schema.properties || {})) === JSON.stringify(['paths']) && JSON.stringify(g2SavePlanDefinition.output.schema.required) === JSON.stringify(['paths']) && g2SavePlanDefinition.output.schema.additionalProperties === false && g2FactoryResult !== null && Array.isArray(g2FactoryRendered) && g2FactoryRendered.length === 1 && g2FactoryRendered[0].type === 'text' && g2FactoryRenderText === g2FactoryExpectedText, true)
  const g2TokenMeasurement = 'NOT-RUN'
  check('G2-H schema与renderer字符可测且token口径保持NOT-RUN', typeof schemaPlanDescription === 'string' && schemaPlanDescription.length > 0 && JSON.stringify(schemaPlanParameters).length > 0 && g2FactoryRendered.length === 1 && g2FactoryRenderText === g2FactoryExpectedText && !g2FactoryRenderText.includes('PLAN_FIELD_SENTINEL') && !g2FactoryRenderText.includes('CHECKLIST_FIELD_SENTINEL') && !g2FactoryRenderText.includes('派遣摘要（') && !g2FactoryRenderText.includes('[任务') && g2TokenMeasurement === 'NOT-RUN' && !g2FactoryRenderText.includes('token'), true)
} finally {
  rmSync(g2FactoryEvidenceRoot, { recursive: true, force: true })
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

// ── E6-E9:证据引用装饰剥除（反引号包裹 / 顿号连列 / 绝对路径；拆分+清洗语义） ──────
// 用例引用的证据文件在 .extra-plan 下真实存在；E9 对提取结果逐个做存在性断言
// （probePathOf 解析 + existsSync），故「剥装饰后得到的即真实路径」是实测判据。
const EVIDENCE_REL_A = 'READAI.md'
const EVIDENCE_REL_B = 'pe-test/docs/ai-概览.md'
const WORKSPACE_ROOT = fileURLToPath(new URL('../../', import.meta.url))
const EVIDENCE_ABS_A = join(WORKSPACE_ROOT, EVIDENCE_REL_A)
const E6_E8 = [
  ['E6 反引号包裹 → 剥装饰后提取裸路径', extractProbeEvidenceRefs(`【探查者已核实】·证据：\`${EVIDENCE_REL_A}\``), [EVIDENCE_REL_A]],
  ['E7 顿号连列（各带反引号）→ 拆分为两条', extractProbeEvidenceRefs(`【探查者已核实】·证据：\`${EVIDENCE_REL_A}\`、\`${EVIDENCE_REL_B}\``), [EVIDENCE_REL_A, EVIDENCE_REL_B]],
  ['E8 绝对路径带反引号 → 剥装饰后原样提取', extractProbeEvidenceRefs(`【探查者已核实】·证据：\`${EVIDENCE_ABS_A}\``), [EVIDENCE_ABS_A]],
]
for (const [name, got, expected] of E6_E8) check(name, got, expected)
const E6_E8_REFS = E6_E8.flatMap(([, got]) => got)
check('E9 E6-E8 提取结果逐一 probePathOf(工作区根, ref) + existsSync 为真', E6_E8_REFS.length === 4 && E6_E8_REFS.every((ref) => existsSync(probePathOf(WORKSPACE_ROOT, ref))), true)

// ── E10-E12:清洗误伤修正（成对剥除；单侧装饰不剥） ──────────────────────────
// 上一轮曾用「单侧循环剥除」，把合法文件名自身的首字符也剥掉（`_private.md` → `private.md`、
// `(abc).md` → `abc).md`），表现为「文件存在却判不存在」。E10/E11 钉住「单侧不剥」，
// E12 钉住「成对剥除生效后不继续误剥内部字符」。
const E10_E12 = [
  ['E10 单侧下划线开头 → 不剥，原样保留', extractProbeEvidenceRefs('【探查者已核实】·证据：_private.md'), ['_private.md']],
  ['E11 单侧首括号 → 不剥，原样保留', extractProbeEvidenceRefs('【探查者已核实】·证据：(abc).md'), ['(abc).md']],
  ['E12 反引号成对包裹下划线文件名 → 剥成裸路径', extractProbeEvidenceRefs('【探查者已核实】·证据：`_private.md`'), ['_private.md']],
]
for (const [name, got, expected] of E10_E12) check(name, got, expected)

// ── PM 系列:decidePlannerModelUse（静默降级判定纯函数） ─────────────────
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
    && message.source !== undefined && message.source.kind === 'plugin:dsh-extra-plan'
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
      // 0.2.1：planner 身份判据改为 header.agentPreset（descriptor.mode 恒 continuable，不再作判据）。
      header: { id: 'planner-id', origin: 'subagent', delegationDepth: 1, parentSession: 'parent-id', agentPreset: 'extra-plan-planner' },
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
    // 调用节奏改关系式（不写死 9/7）：每个候选恰列一次；列表失败者不得再 prepare，其余候选各 prepare 恰一次。
    const listFailureProviders = Object.keys(catalogs).filter((id) => typeof catalogs[id] === 'string')
    const preparedProviders = fake.state.prepareCalls.map((prepare) => prepare.provider)
    const listEachCandidateOnce = fake.state.listModels.length === providers.length && new Set(fake.state.listModels).size === providers.length
    const prepareEachRemainingOnce = preparedProviders.length === providers.length - listFailureProviders.length && new Set(preparedProviders).size === preparedProviders.length && listFailureProviders.every((id) => !preparedProviders.includes(id))
    markActualPlanner(harness)
    return { provider: result.provider, model: result.model, listProviders: fake.state.listProviders, listEachCandidateOnce, prepareEachRemainingOnce, actualBeforeSelection, timerClean: active.size === 0, timeoutWasAttempted: fake.state.listModels.includes('p-timeout') && fake.state.streamCalls.some((call) => call.provider === 'p-timeout') }
  }), { provider: 'p-good', model: 'planner-model', listProviders: 1, listEachCandidateOnce: true, prepareEachRemainingOnce: true, actualBeforeSelection: false, timerClean: true, timeoutWasAttempted: true }],
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
      header: { id: 'planner-id', origin: 'subagent', delegationDepth: 1, parentSession: 'main-id', agentPreset: 'extra-plan-planner' },
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
  ['AS1 首问标准三词+第二问带选项 → deny（standard 单报路径）', (() => { const r = askPreExecute('ask_user_question', { questions: [...askStandardQ1, { id: 'q2', question: '修改意见', options: [{ label: '无' }, { label: '有意见（填写）' }] }] }); return r !== null && r !== undefined && r.kind === 'deny' })(), true],
  ['AS2 首问标准三词+第二问无 options → allow', (() => { const r = askPreExecute('ask_user_question', { questions: [...askStandardQ1, { id: 'q2', question: '修改意见' }] }); return r !== null && r !== undefined && r.kind === 'allow' })(), true],
  ['AS3 首问非白名单变体+第二问无 options → deny（kind 特异性回归）', (() => { const r = askPreExecute('ask_user_question', { questions: [{ id: 'q1', options: [{ label: '同意执行!' }, { label: '转交pro规划' }, { label: '不同意' }] }, { id: 'q2', question: '修改意见' }] }); return r !== null && r !== undefined && r.kind === 'deny' })(), true],
  ['AS4 单问「同意执行!」变体 → deny（approve 模板路径）', (() => { const r = askPreExecute('ask_user_question', { questions: [{ id: 'q1', options: [{ label: '同意执行!' }] }] }); return r !== null && r !== undefined && r.kind === 'deny' })(), true],
  ['AS5 路由变体（直接执行!）+第二问纯文本 → deny（route 特异不回归）', (() => { const r = askPreExecute('ask_user_question', { questions: [{ id: 'q1', options: [{ label: '直接执行!' }, { label: '进行pro规划' }, { label: '不同意' }] }, { id: 'q2', question: '补充要求' }] }); return r !== null && r !== undefined && r.kind === 'deny' })(), true],
  ['AS8 cordis_inspect_list 路由未确认 → allow', (() => { const r = askPreExecute('cordis_inspect_list', {}); return r !== null && r !== undefined && r.kind === 'allow' })(), true],
  ['AS9 目的标准二选一 route=none → deny', (() => { const r = askPreExecute('ask_user_question', JSON.parse(purposeArgs), []); return r !== null && r !== undefined && r.kind === 'deny' })(), true],
  ['AS9b 目的标准二选一 route=direct → deny', (() => { const r = askPreExecute('ask_user_question', JSON.parse(purposeArgs), askDirectEvents); return r !== null && r !== undefined && r.kind === 'deny' })(), true],
  ['AS9c 目的标准二选一 route=plan → allow', (() => { const r = askPreExecute('ask_user_question', JSON.parse(purposeArgs), askPlanEvents); return r !== null && r !== undefined && r.kind === 'allow' })(), true],
  ['AS9d 目的标准二选一 channelBroken → allow（逃生）', (() => { const r = askPreExecute('ask_user_question', JSON.parse(purposeArgs), askChannelBrokenEvents); return r !== null && r !== undefined && r.kind === 'allow' })(), true],
  ['AS9e 单问路由 ask（缺第二问）route=none → deny', (() => { const r = askPreExecute('ask_user_question', JSON.parse(routeArgs), []); return r !== null && r !== undefined && r.kind === 'deny' })(), true],
  ['AS9h 路由双问（第二问纯文本）route=none → allow', (() => { const r = askPreExecute('ask_user_question', JSON.parse(route2qArgs), []); return r !== null && r !== undefined && r.kind === 'allow' })(), true],
  ['AS9i 路由双问第二问带 options route=none → deny', (() => { const r = askPreExecute('ask_user_question', JSON.parse(route2qArgsWithOpts), []); return r !== null && r !== undefined && r.kind === 'deny' })(), true],
  ['AS9f ordinary 探查 ask route=none → allow', (() => { const r = askPreExecute('ask_user_question', ordinaryProbeArgs, []); return r !== null && r !== undefined && r.kind === 'allow' })(), true],
  ['AS9g ordinary 澄清 ask route=none → allow', (() => { const r = askPreExecute('ask_user_question', ordinaryClarifyArgs, []); return r !== null && r !== undefined && r.kind === 'allow' })(), true],
  ['AS10 目的缺一词 ask → deny', (() => { const r = askPreExecute('ask_user_question', JSON.parse(wordPurposeArgs)); return r !== null && r !== undefined && r.kind === 'deny' })(), true],
  ['AS11 非计划目的 2 问 ask → deny', (() => { const r = askPreExecute('ask_user_question', { questions: [{ id: 'q1', options: [{ label: '完善方案' }, { label: '重新规划' }] }, { id: 'q2', question: '补充' }] }); return r !== null && r !== undefined && r.kind === 'deny' })(), true],
  ['AS12 run_code 内 none 态目的 ask → deny', (() => { const r = askPreExecute('run_code', purposeRunCode, []); return r !== null && r !== undefined && r.kind === 'deny' })(), true],
  ['AS12b run_code 内 direct 态目的 ask → deny', (() => { const r = askPreExecute('run_code', purposeRunCode, askDirectEvents); return r !== null && r !== undefined && r.kind === 'deny' })(), true],
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
// 嵌套失败结果按两类语义划分 denied/error（测试内既不持有文案副本，也不从源码抠字面量）：
// ① 插件闸门拒绝 = 'Error: ' + lib purposeRouteDenyReason 返回的整句 → kind:'denied'，状态不重置；
// ② 取消/中断 = 嵌套层只按 isError 信封分类（正文不参与断言）→ kind:'error'，清四字段。
//    故夹具只用最小 isError 信封，不复制宿主取消句；分类本身由 FC0 只断 kind 与结构字段。
const FC_DENY_TEXT = 'Error: ' + purposeRouteDenyReason(gateRuntime)
const fcCancelEnd = (sid) => ({ type: ev.end, data: { rootCallId: 'r1', parentCallId: 'pc1', subCallId: sid, name: 'ask_user_question', arguments: {}, isError: true, content: [] } })
const fcCancelParsed = parseDispatchAskResult(fcCancelEnd('fc-cancel-classify').data)
checkTrue('FC0 嵌套取消信封的解析分类为 error（只断 kind 与结构字段，不比对正文）', fcCancelParsed.kind === 'error' && fcCancelParsed.callId === 'fc-cancel-classify' && fcCancelParsed.code === '')
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
  ['FC11 嵌套完整阶段后取消/中断（kind:error 清四字段）→ 五字段清理', fullNestedPlanApprovedEvents.concat([cdStart('ask_user_question', 'fn5', nestedRouteArgs), fcCancelEnd('fn5')]), { route: 'none', clarified: false, approved: false, purpose: 'none', channelBroken: false }],
  ['FC12 嵌套完整阶段后闸门拒绝（denied）→ 五字段全保留（route=plan、目的/澄清/批准不动）', fullNestedPlanApprovedEvents.concat([cdStart('ask_user_question', 'fn5', nestedRouteArgs), cdEnd('fn5', FC_DENY_TEXT, true)]), { route: 'plan', clarified: true, approved: true, purpose: 'refine', channelBroken: false }],
]
for (const [name, events, expected] of FC) {
  check(name, deriveFlowState(events, gateRuntime), expected)
}

// ── F-MATRIX：普通 tool/result 与 PTC dispatch 的可表达语义对照（独立期望） ──
const FLOW_DEFAULT = { route: 'none', clarified: false, approved: false, purpose: 'none', channelBroken: false }
const FLOW_FULL = { route: 'plan', clarified: true, approved: true, purpose: 'refine', channelBroken: false }
function nativePlanFull(prefix = 'mx') {
  return [um(), call('ask_user_question', prefix + '-route', routeArgs), ok(prefix + '-route', answer(['进行pro规划'])), call('ask_user_question', prefix + '-purpose', purposeArgs), ok(prefix + '-purpose', answer(['完善方案'])), call('ask_user_question', prefix + '-clarify', clarifyArgs), ok(prefix + '-clarify', answer(['方案A'])), call('ask_user_question', prefix + '-approve', approvalArgs), ok(prefix + '-approve', answer(['同意执行']))]
}
function ptcPlanFull(prefix = 'mx') {
  return [um(), ptcStart(prefix + '-route', 'ask_user_question', nestedRouteArgs), ptcEnd(prefix + '-route', answer(['进行pro规划'])), ptcStart(prefix + '-purpose', 'ask_user_question', nestedPurposeArgs), ptcEnd(prefix + '-purpose', answer(['完善方案'])), ptcStart(prefix + '-clarify', 'ask_user_question', nestedClarifyArgs), ptcEnd(prefix + '-clarify', answer(['方案A'])), ptcStart(prefix + '-approve', 'ask_user_question', nestedApprovalArgs), ptcEnd(prefix + '-approve', answer(['同意执行']))]
}
const STATE_MATRIX = [
  ['direct', [um(), call('ask_user_question', 'mx-direct', routeArgs), ok('mx-direct', answer(['直接执行']))], [um(), ptcStart('mx-direct', 'ask_user_question', nestedRouteArgs), ptcEnd('mx-direct', answer(['直接执行']))], { route: 'direct', clarified: false, approved: false, purpose: 'none', channelBroken: false }],
  ['plan-refine-clarify-approve', nativePlanFull(), ptcPlanFull(), FLOW_FULL],
  ['disagree', [um(), call('ask_user_question', 'mx-disagree', routeArgs), ok('mx-disagree', answer(['不同意']))], [um(), ptcStart('mx-disagree', 'ask_user_question', nestedRouteArgs), ptcEnd('mx-disagree', answer(['不同意']))], FLOW_DEFAULT],
  ['purpose-redo', [um(), call('ask_user_question', 'mx-route', routeArgs), ok('mx-route', answer(['进行pro规划'])), call('ask_user_question', 'mx-purpose', purposeArgs), ok('mx-purpose', answer(['重新规划']))], [um(), ptcStart('mx-route', 'ask_user_question', nestedRouteArgs), ptcEnd('mx-route', answer(['进行pro规划'])), ptcStart('mx-purpose', 'ask_user_question', nestedPurposeArgs), ptcEnd('mx-purpose', answer(['重新规划']))], { route: 'plan', clarified: false, approved: false, purpose: 'redo', channelBroken: false }],
]
for (const [name, nativeEvents, ptcEvents, expected] of STATE_MATRIX) {
  const nativeState = deriveFlowState(nativeEvents, gateRuntime)
  const ptcState = deriveFlowState(ptcEvents, gateRuntime)
  check('F-MATRIX ' + name + ' 普通通道独立期望', nativeState, expected)
  check('F-MATRIX ' + name + ' PTC通道同语义对照', ptcState, expected)
  check('F-MATRIX ' + name + ' 两通道规范化字段一致', nativeState, ptcState)
}
const deniedNative = nativePlanFull('mx-deny').concat([call('ask_user_question', 'mx-deny-route', routeArgs), deny('mx-deny-route', '路由闸门拒绝')])
const deniedPtc = ptcPlanFull('mx-deny').concat([ptcStart('mx-deny-route', 'ask_user_question', nestedRouteArgs), ptcEnd('mx-deny-route', FC_DENY_TEXT, true)])
check('F-MATRIX denied 普通拒绝保持既有五字段', deriveFlowState(deniedNative, gateRuntime), FLOW_FULL)
check('F-MATRIX denied PTC文本拒绝保持既有五字段', deriveFlowState(deniedPtc, gateRuntime), FLOW_FULL)
const cancelNative = nativePlanFull('mx-cancel').concat([call('ask_user_question', 'mx-cancel-route', routeArgs), err('mx-cancel-route', 'ASK_CANCELLED')])
const cancelPtc = ptcPlanFull('mx-cancel').concat([ptcStart('mx-cancel-route', 'ask_user_question', nestedRouteArgs), fcCancelEnd('mx-cancel-route')])
check('F-MATRIX cancel 普通 ASK_CANCELLED 清理阶段', deriveFlowState(cancelNative, gateRuntime), FLOW_DEFAULT)
check('F-MATRIX cancel PTC 取消/中断清理阶段', deriveFlowState(cancelPtc, gateRuntime), FLOW_DEFAULT)
const nativeChannel = [um(), call('ask_user_question', 'mx-channel', routeArgs), ok('mx-channel', answer(['直接执行'])), call('ask_user_question', 'mx-channel-fail', routeArgs), err('mx-channel-fail', 'NO_PROVIDER')]
const ptcTextError = [um(), ptcStart('mx-channel', 'ask_user_question', nestedRouteArgs), ptcEnd('mx-channel', answer(['直接执行'])), ptcStart('mx-channel-fail', 'ask_user_question', nestedRouteArgs), ptcEnd('mx-channel-fail', 'Error: NO_PROVIDER', true)]
check('F-MATRIX native code NO_PROVIDER 置 channelBroken 且保留 route', deriveFlowState(nativeChannel, gateRuntime), { route: 'direct', clarified: false, approved: false, purpose: 'none', channelBroken: true })
check('F-MATRIX PTC文本 NO_PROVIDER 不推断原生 code（拒绝语义不置 channelBroken）', deriveFlowState(ptcTextError, gateRuntime), { route: 'direct', clarified: false, approved: false, purpose: 'none', channelBroken: false })
checkTrue('F-MATRIX native code 与 PTC 文本错误差异保留', JSON.stringify(deriveFlowState(nativeChannel, gateRuntime)) !== JSON.stringify(deriveFlowState(ptcTextError, gateRuntime)))
check('F-MATRIX 新 human 消息普通通道重置窗口', deriveFlowState(nativePlanFull('mx-human').concat([um()]), gateRuntime), FLOW_DEFAULT)
check('F-MATRIX 新 human 消息 PTC通道重置窗口', deriveFlowState(ptcPlanFull('mx-human').concat([um()]), gateRuntime), FLOW_DEFAULT)
const badNative = [um(), call('ask_user_question', 'mx-bad', routeArgs), { type: 'tool/result', data: { message: { toolCallId: 'mx-bad', isError: false, content: 'bad-shape' } } }, ok('unpaired', answer(['直接执行']))]
const badPtc = [um(), ptcStart('mx-bad', 'ask_user_question', { bad: true }), { type: 'tool/ptc-dispatch', data: { subCallId: 'mx-bad', isError: false, content: 'bad-shape' } }, ptcEnd('unpaired', answer(['直接执行']))]
check('F-MATRIX 坏形状/未配对普通事件忽略', deriveFlowState(badNative, gateRuntime), FLOW_DEFAULT)
check('F-MATRIX 坏形状/未配对 PTC事件忽略', deriveFlowState(badPtc, gateRuntime), FLOW_DEFAULT)

// ── CFG-DEFAULT：十项默认、显式 false/空串与角色边界独立期望 ──
// 默认值不在测试内落第二份：插件配置类键与资产 YAML（真源）对拍，设置页独有键与 settings 生成真源对拍；键集合仍显式锁定。
const EXPECTED_SETTINGS_KEYS = ['anchoredBootstrap', 'creativeMode', 'webFetch', 'toolPresentationMode', 'runcodeCatchGate', 'crossProviderPlannerModel', 'plannerModel', 'plannerPromptSuffix', 'exploreBudget', 'otherAgentModel']
const defaultSettingsValues = createDefaultSettings()
checkTrue('CFG-DEFAULT createDefaultSettings 恰十键且默认值与资产 YAML/settings 真源对拍', isDeepStrictEqual(Object.keys(defaultSettingsValues).sort(), EXPECTED_SETTINGS_KEYS.slice().sort()) && EXPECTED_SETTINGS_KEYS.every((key) => isDeepStrictEqual(defaultSettingsValues[key], Object.hasOwn(assetExtraPlanConfig, key) ? assetExtraPlanConfig[key] : DEFAULT_SETTINGS[key])))
const explicitSettings = { anchoredBootstrap: false, creativeMode: false, webFetch: false, toolPresentationMode: 'ptc', runcodeCatchGate: false, crossProviderPlannerModel: false, plannerModel: '', plannerPromptSuffix: '', exploreBudget: 1, otherAgentModel: '' }
let explicitResolved = null
try { explicitResolved = SETTINGS_CONFIG(explicitSettings) } catch {}
const explicitResolvedValues = explicitResolved === null ? null : Object.fromEntries(Object.entries(explicitResolved).map(([key, reference]) => [key, typeof reference?.get === 'function' ? reference.get() : reference]))
check('CFG-DEFAULT 显式 false/空串/ptc/额度1 不被默认覆盖', explicitResolvedValues, explicitSettings)
const EXPECTED_ROLE_IDS = ['extra-plan-executor', 'extra-plan-planner', 'extra-plan-reviewer', 'extra-plan-prober']
const EXPECTED_ROLE_ORDERS = [101, 102, 103, 104]
checkTrue('ROLE-BOUNDARY 角色常量/生成器/preset-sync/agent-runtime 重导出与独立 ID/order 对拍', JSON.stringify([...ROLE_IDS]) === JSON.stringify(EXPECTED_ROLE_IDS) && JSON.stringify([...ROLE_ORDERS]) === JSON.stringify(EXPECTED_ROLE_ORDERS) && roleGenerator.ROLE_IDS === ROLE_IDS && roleGenerator.ROLE_ORDERS === ROLE_ORDERS && PRESET_SYNC_ROLE_IDS === ROLE_IDS && agentRuntime.PLANNER_PRESET_ID === PLANNER_PRESET_ID && PLANNER_PRESET_ID === EXPECTED_ROLE_IDS[1] && PROBER_PRESET_ID === EXPECTED_ROLE_IDS[3] && ROLE_DEFINITION_FILES.length === EXPECTED_ROLE_IDS.length && ROLE_DEFINITION_FILES.every((file, index) => String(file).replaceAll('\\', '/').endsWith('/preset-definition-' + EXPECTED_ROLE_IDS[index] + '.generated.yml')))

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
runDispatchSeries({ start: 'tool/ptc-dispatch-start', end: 'tool/ptc-dispatch' })

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
  ['CLC4 [{name:run_code},{name:read}] → false(混合目录不折叠；0.2.1 both 已退出，保留为历史形态对照)', [{ name: 'run_code' }, { name: 'read' }], false],
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
  ['AR13 MCP静态方括号调用不误判 ask 返回链', "return await tools['mcp__chrome-devtools-mcp__list_pages']({})", null],
]
for (const [name, code, expected] of ASK_RETURN) {
  const got = askUserQuestionReturnGateReason(code)
  const okResult = expected === null
    ? got === null
    : typeof got === 'string' && got.includes('结果未正确返回用户层')
  if (okResult) { pass += 1 } else { fail += 1 }
  output.assertion(okResult, name, expected, got)
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
  output.assertion(okResult, name, expected, got)
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
  output.assertion(okResult, name, expected, got)
}

// ── J 系列:decomposeRunCode 拆解器（F7' v4 静态预审，返回 {members,dynamic} 全文） ──
const J = [
  ['J1 单工具 await 提取（JSON 参数可解析）', "await tools.read({ \"file_path\": \"x\" })", { members: [{ kind: 'tool', name: 'read', argsParsed: true, args: { file_path: 'x' }, argsText: '{ "file_path": "x" }' }], dynamic: false }],
  ['J2 多工具+多行嵌套参数', "await tools.read({ \"file_path\": \"x\" })\nawait tools.glob({ \"pattern\": \"**/*.md\" })", { members: [{ kind: 'tool', name: 'read', argsParsed: true, args: { file_path: 'x' }, argsText: '{ "file_path": "x" }' }, { kind: 'tool', name: 'glob', argsParsed: true, args: { pattern: '**/*.md' }, argsText: '{ "pattern": "**/*.md" }' }], dynamic: false }],
   ['J3 参数内括号字符串不干扰配平（安全 JS literal 单引号可解析）', "await tools.read({ path: 'a)(' })", { members: [{ kind: 'tool', name: 'read', argsParsed: true, args: { path: 'a)(' }, argsText: "{ path: 'a)(' }" }], dynamic: false }],
  ['J4 字符串内 tools.read 不提取', "const s = 'tools.read({ file_path: 1 })'", { members: [], dynamic: false }],
  ['J5 注释内 tools.write 不提取', "// tools.write({})\nreadFileSync('x')", { members: [], dynamic: false }],
  ['J6 同名同参去重→1 项', "tools.read({ \"file_path\": \"x\" }); tools.read({ \"file_path\": \"x\" })", { members: [{ kind: 'tool', name: 'read', argsParsed: true, args: { file_path: 'x' }, argsText: '{ "file_path": "x" }' }], dynamic: false }],
  ['J7 同名不同参保留→2 项', "tools.read({ \"file_path\": \"x\" }); tools.read({ \"file_path\": \"y\" })", { members: [{ kind: 'tool', name: 'read', argsParsed: true, args: { file_path: 'x' }, argsText: '{ "file_path": "x" }' }, { kind: 'tool', name: 'read', argsParsed: true, args: { file_path: 'y' }, argsText: '{ "file_path": "y" }' }], dynamic: false }],
  ['J8 参数不可解析（变量）→argsParsed:false', 'tools.read(args)', { members: [{ kind: 'tool', name: 'read', argsParsed: false, args: null, argsText: 'args' }], dynamic: false }],
  ['J9 裸写 writeFileSync→{kind:bare-write,name:write,hints:[fs-write]}', "await writeFileSync('x', '1')", { members: [{ kind: 'bare-write', name: 'write', hints: ['fs-write'] }], dynamic: false }],
  ['J10 工具+裸写同现→2 项且裸写排末尾', "tools.read({ \"file_path\": \"x\" }); writeFileSync('x', '1')", { members: [{ kind: 'tool', name: 'read', argsParsed: true, args: { file_path: 'x' }, argsText: '{ "file_path": "x" }' }, { kind: 'bare-write', name: 'write', hints: ['fs-write'] }], dynamic: false }],
  ['J11 tools[\'write\'] 字面量方括号→静态名 write', "await tools['write']({ \"file_path\": \"x\", \"content\": \"1\" })", { members: [{ kind: 'tool', name: 'write', argsParsed: true, args: { file_path: 'x', content: '1' }, argsText: '{ "file_path": "x", "content": "1" }' }], dynamic: false }],
  ['J-MCP1 单引号连字符名→真实成员', "tools['mcp__chrome-devtools-mcp__list_pages']({})", { members: [{ kind: 'tool', name: 'mcp__chrome-devtools-mcp__list_pages', argsParsed: true, args: {}, argsText: '{}' }], dynamic: false }],
  ['J-MCP2 双引号/右括号后注释→真实成员', 'tools["mcp__chrome-devtools-mcp__list_pages"] /* comment */ ({})', { members: [{ kind: 'tool', name: 'mcp__chrome-devtools-mcp__list_pages', argsParsed: true, args: {}, argsText: '{}' }], dynamic: false }],
  ['J-MCP3 动态参数对象保留真实name且argsParsed=false', 'tools["mcp__chrome-devtools-mcp__take_snapshot"]({ query: args })', { members: [{ kind: 'tool', name: 'mcp__chrome-devtools-mcp__take_snapshot', argsParsed: false, args: null, argsText: '{ query: args }' }], dynamic: false }],
  ['J-MCP4 同名同参连字符调用去重→1项', "tools['mcp__chrome-devtools-mcp__list_pages']({}); tools['mcp__chrome-devtools-mcp__list_pages']({})", { members: [{ kind: 'tool', name: 'mcp__chrome-devtools-mcp__list_pages', argsParsed: true, args: {}, argsText: '{}' }], dynamic: false }],
  ['J-MCP5 方括号拼接名→dynamic=true', "tools['mcp__chrome-' + 'devtools-mcp__list_pages']({})", { members: [], dynamic: true }],
  ['J12 tools[name](...)→members=[] 且 dynamic=true', "const name = 'read'; tools[name]({ file_path: 'x' })", { members: [], dynamic: true }],
  ['J13 空 code→{members:[],dynamic:false}', '', { members: [], dynamic: false }],
  ['J14 纯只读裸代码→空组', "await readFileSync('x', 'utf8')", { members: [], dynamic: false }],
]
for (const [name, code, expected] of J) {
  check(name, decomposeRunCode(code), expected)
}
const escapedMcpCode = 'tools["mcp__chrome' + String.fromCharCode(92) + 'x2ddevtools-mcp__list_pages"]({})'
const escapedMcpResult = decomposeRunCode(escapedMcpCode)
checkTrue('J-MCP6 转义连字符名保持动态且不生成假成员', escapedMcpResult.members.length === 0 && escapedMcpResult.dynamic === true)

// ── J-LITERAL：安全 JS literal 子集正反矩阵（A10/A11 静态参数合同） ───────
const J_LITERAL = [
  ['对象单引号/标识符键/尾逗号', "tools.read({ file_path: 'x', enabled: true, })", true],
  ['数组/布尔/null/有限数字/尾逗号', "tools.read({ values: [true, false, null, -2.5e3,] })", true],
  ['变量', 'tools.read(args)', false],
  ['简写', 'tools.read({ args })', false],
  ['spread', 'tools.read({ ...args })', false],
  ['computed key', 'tools.read({ [key]: 1 })', false],
  ['getter', 'tools.read({ get value() { return 1 } })', false],
  ['setter', 'tools.read({ set value(next) {} })', false],
  ['method', 'tools.read({ value() {} })', false],
  ['调用', 'tools.read({ value: makeValue() })', false],
  ['成员访问', 'tools.read({ value: args.value })', false],
  ['模板插值', 'tools.read({ value: ' + String.fromCharCode(96) + '${value}' + String.fromCharCode(96) + ' })', false],
  ['正则', 'tools.read({ value: /x/ })', false],
  ['undefined', 'tools.read({ value: undefined })', false],
  ['NaN', 'tools.read({ value: NaN })', false],
  ['Infinity', 'tools.read({ value: Infinity })', false],
  ['BigInt', 'tools.read({ value: 1n })', false],
  ['重复键', 'tools.read({ value: 1, value: 2 })', false],
  ['__proto__', "tools.read({ '__proto__': 1 })", false],
  ['constructor', 'tools.read({ constructor: 1 })', false],
  ['prototype', 'tools.read({ prototype: 1 })', false],
]
for (const [label, code, expected] of J_LITERAL) {
  const result = decomposeRunCode(code)
  const member = result.members[0]
  checkTrue('J-LITERAL ' + label + ' → ' + (expected ? 'argsParsed=true' : 'argsParsed=false'), member !== undefined && member.argsParsed === expected && (expected || typeof member.argsText === 'string'))
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
checkTrue('RC-L1 模板纯文本 write 忽略、${tools.edit(...)} 计入并与后续 read 共2成员', rcL1Masked.length === rcL1Code.length && rcL1Result.dynamic === false && rcL1Result.members.length === 2 && rcL1Result.members.map((member) => member.name).join('|') === 'edit|read')
const rcL1NestedTemplateCode = 'const nested = ' + String.fromCharCode(96) + 'outer ' + String.fromCharCode(36) + '{' + String.fromCharCode(96) + 'inner ' + String.fromCharCode(36) + '{tools.edit({})}' + String.fromCharCode(96) + '}' + String.fromCharCode(96)
check('RC-L1 嵌套模板插值实际调用计入', decomposeRunCode(rcL1NestedTemplateCode).members.map((member) => member.name), ['edit'])

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
const rcMcpCode = 'return await tools[\"mcp__chrome-devtools-mcp__list_pages\"]({})'
const rcMcpResult = decomposeRunCode(rcMcpCode)
const rcMcpSites = plugin.decisions.collectRunCodeSites(rcMcpCode, maskCodeLiteralsAndComments(rcMcpCode))
checkTrue('RC-D2 MCP静态双引号真实name、dynamic=false且单站点', rcMcpResult.dynamic === false && rcMcpResult.members.length === 1 && rcMcpResult.members[0].name === 'mcp__chrome-devtools-mcp__list_pages' && rcMcpSites.length === 1 && rcMcpSites[0].name === 'mcp__chrome-devtools-mcp__list_pages')

const rcN1Inner = 'await tools.write({})'
const rcN1Code = 'await tools.run_code({ "code": ' + JSON.stringify(rcN1Inner) + ' })'
const rcN1Result = decomposeRunCode(rcN1Code)
const rcN1FlattenReason = runCodeGroupDenyReason(noneStateFx, { name: 'run_code', arguments: { code: rcN1Code } }, { kind: 'main' }, { gateRuntime })
const rcN1UnparsedCode = 'await tools.run_code({ code: nested })'
const rcN1UnparsedResult = decomposeRunCode(rcN1UnparsedCode)
const rcN1UnparsedReason = runCodeGroupDenyReason(noneStateFx, { name: 'run_code', arguments: { code: rcN1UnparsedCode } }, { kind: 'main' }, { gateRuntime })
const rcN2Code = "await tools.run_code({ code: 'await tools.write({})', description: 'nested', })"
const rcN2Result = decomposeRunCode(rcN2Code)
const rcN2Reason = runCodeGroupDenyReason(noneStateFx, { name: 'run_code', arguments: { code: rcN2Code } }, { kind: 'main' }, { gateRuntime })
const rcN3Code = 'await tools.run_code({ code: nested, })'
const rcN3Result = decomposeRunCode(rcN3Code)
const rcN3Reason = runCodeGroupDenyReason(noneStateFx, { name: 'run_code', arguments: { code: rcN3Code } }, { kind: 'main' }, { gateRuntime })
checkTrue('RC-N2 JS literal nested run_code 共用静态入口并展平拒写', rcN2Result.members.length === 1 && rcN2Result.members[0].argsParsed === true && typeof rcN2Reason === 'string' && rcN2Reason.includes('- write:'))
checkTrue('RC-N3 动态 nested run_code 保留 argsText 并由运行时瀑布兜底', rcN3Result.members.length === 1 && rcN3Result.members[0].argsParsed === false && rcN3Result.members[0].argsText.includes('nested') && rcN3Reason === null)
checkTrue('RC-N1 可解析嵌套 run_code 一层展平、不可解析参数保留运行时', rcN1Result.dynamic === false && rcN1Result.members.length === 1 && rcN1Result.members[0].name === 'run_code' && rcN1Result.members[0].argsParsed === true && typeof rcN1FlattenReason === 'string' && rcN1FlattenReason.includes('- write:') && rcN1UnparsedResult.members.length === 1 && rcN1UnparsedResult.members[0].name === 'run_code' && rcN1UnparsedResult.members[0].argsParsed === false && rcN1UnparsedReason === null)

const rcP1Result = decomposeRunCode('tools.read({ "file_path": "x" }); tools.read({ "file_path": "y" })')
checkTrue('RC-P1 同名不同 JSON 参数保留两个成员', rcP1Result.members.length === 2 && rcP1Result.members[0].name === 'read' && rcP1Result.members[1].name === 'read' && rcP1Result.members[0].args.file_path === 'x' && rcP1Result.members[1].args.file_path === 'y')

const rcDgEvents = [
  { type: 'tool/ptc-dispatch-start', data: { rootCallId: 'rc-same' } },
  { type: 'tool/ptc-dispatch-start', data: { rootCallId: 'rc-same' } },
  { type: 'tool/ptc-dispatch-start', data: { rootCallId: 'rc-other' } },
]
const rcDgExceeded = runCodeDispatchGateReason(rcDgEvents, { rootCallId: 'rc-same' }, 1)
checkTrue('RC-DG1 新旧 dispatch-start 同 root 计数、异 root 不计，非法 cap/root 返回 null', typeof rcDgExceeded === 'string' && rcDgExceeded.includes('子调用数 2') && runCodeDispatchGateReason(rcDgEvents, { rootCallId: 'rc-same' }, 2) === null && runCodeDispatchGateReason(rcDgEvents, { rootCallId: 'rc-same' }, 0) === null && runCodeDispatchGateReason(rcDgEvents, { rootCallId: 'rc-same' }, -1) === null && runCodeDispatchGateReason(rcDgEvents, { rootCallId: 'rc-same' }, 1.5) === null && runCodeDispatchGateReason(rcDgEvents, { rootCallId: 7 }, 1) === null)

const rcAgReason = runCodeGroupDenyReason(undefined, { name: 'run_code', arguments: { code: 'await tools.write({})\nawait tools.subagent_probe({})' } }, { kind: 'planner' }, {})
checkTrue('RC-AG1 planner write+subagent_probe 聚合 2 项且保持成员顺序', typeof rcAgReason === 'string' && rcAgReason.includes('工具组共 2 项（去重后），2 项触发闸门') && rcAgReason.includes('规划子代理只读') && rcAgReason.includes('仅主会话可用') && rcAgReason.indexOf('- write:') < rcAgReason.indexOf('- subagent_probe:'))

// ── K 系列:子代理角色组判定（F7' v4;role = {kind:'planner'}/{kind:'child',readOnly,probe}） ──
// 预算耗尽白名单 fixture：18 个成功配对使用 18/18，与 step-04 的 budgetEvents 一致。
const kBudgetFx = 18
const budgetEventsFx = [um(), ...Array.from({ length: kBudgetFx }, (_, i) => [call('read', 'b' + i), ok('b' + i, 'ok')]).flat()]
const K = [
  ['K1 planner+裸写 → 聚合含「只读角色仅允许只读探查」与「命中」', { kind: 'planner' }, writeCodeFx, ['只读角色仅允许只读探查', '命中']],
  ['K2 planner+tools.write → 聚合含「规划子代理只读」', { kind: 'planner' }, "await tools.write({ file_path: 'x', content: '1' })", ['规划子代理只读']],
  ['K3 planner+纯只读 → 放行(null)', { kind: 'planner' }, readOnlyCodeFx, null],
  ['K4 child-probe+裸写 → 聚合含「只读角色仅允许只读探查」', { kind: 'child', readOnly: true, probe: true }, writeCodeFx, ['只读角色仅允许只读探查']],
  ['K5 child-probe+tools.write → 聚合含「探查者只读」', { kind: 'child', readOnly: true, probe: true }, "await tools.write({ file_path: 'x', content: '1' })", ['探查者只读']],
  ['K6 child-reviewer+tools.write → 聚合含「验收复核者只读」', { kind: 'child', readOnly: true, probe: false }, "await tools.write({ file_path: 'x', content: '1' })", ['验收复核者只读']],
  ['K7 执行者+裸写 → 放行(null)', { kind: 'child', readOnly: false, probe: false }, writeCodeFx, null],
  ['K8 执行者+tools.write → 放行(null)', { kind: 'child', readOnly: false, probe: false }, "await tools.write({ file_path: 'x', content: '1' })", null],
  ['K9 planner+预算耗尽+仅 save_plan 成员 → 放行(null)', { kind: 'planner' }, 'await tools.save_plan({ "plan": "p", "checklist": "c" })', null, { events: budgetEventsFx, exploreBudget: kBudgetFx }],
  ['K10 planner+预算耗尽+read 成员 → 拒绝且结构化 used/total=上限/上限 + 仅可调用 save_plan', { kind: 'planner' }, "await tools.read({ file_path: 'x' })", (got) => typeof got === 'string' && [...String(got).matchAll(/(\d+)\s*\/\s*(\d+)/gu)].some((matched) => Number(matched[1]) === kBudgetFx && Number(matched[2]) === kBudgetFx) && got.includes('仅可调用 save_plan'), { events: budgetEventsFx, exploreBudget: kBudgetFx }],
  ['K11 main+MCP静态只读成员 → 放行(null)且不误判ask', { kind: 'main' }, "try { await tools['mcp__chrome-devtools-mcp__list_pages']({}) } catch (e) {}", null],
]
for (const [name, role, code, expected, gateCtx] of K) {
  const got = runCodeGroupDenyReason(undefined, { arguments: { code } }, role, Object.assign({}, gateCtx !== undefined ? gateCtx : {}, { gateRuntime }))
  // expected 可为 null（放行）／字符串片段数组（文案片段）／谓词函数（结构化判据，如 used/total）。
  const okResult = expected === null ? got === null : typeof expected === 'function' ? expected(got) === true : typeof got === 'string' && expected.every((s) => got.includes(s))
  if (okResult) { pass += 1 } else { fail += 1 }
  output.assertion(okResult, name, expected, got)
}
// ── CONTROL-GATE：FREE_TOOLS 与全角色控制工具矩阵（子代理硬拒、主会话对照） ──
check('CONTROL1 FREE_TOOLS 恰为 save_plan', [...FREE_TOOLS], ['save_plan'])
const controlRoles = [
  ['planner', { kind: 'planner' }],
  ['readOnly', { kind: 'child', readOnly: true, probe: true }],
  ['executor', { kind: 'child', readOnly: false, probe: false }],
  ['unknown-child', { kind: 'child', readOnly: false, probe: false }],
]
for (const [roleName, role] of controlRoles) {
  for (const controlName of ['send_message', 'interrupt_agent']) {
    const directReason = runCodeGroupDenyReason(undefined, { name: 'run_code', arguments: { code: 'await tools.' + controlName + '({})' } }, role, { gateRuntime })
    checkTrue('CONTROL2 ' + roleName + ' ' + controlName + ' 直呼语义 → childControlGateReason deny', typeof childControlGateReason({ name: controlName }) === 'string' && typeof directReason === 'string' && directReason.includes(controlName))
    const nestedCode = 'await tools.run_code({ "code": ' + JSON.stringify('await tools.' + controlName + '({})') + ' })'
    const nestedReason = runCodeGroupDenyReason(undefined, { name: 'run_code', arguments: { code: nestedCode } }, role, { gateRuntime })
    checkTrue('CONTROL3 ' + roleName + ' ' + controlName + ' 一层嵌套 run_code → 稳定 deny', typeof nestedReason === 'string' && nestedReason.includes(controlName))
  }
}
for (const controlName of ['send_message', 'interrupt_agent']) {
  check('CONTROL4 main ' + controlName + ' helper 对照不命中', mainGateReason(noneStateFx, { name: controlName, arguments: {} }, { gateRuntime }), null)
  check('CONTROL5 main ' + controlName + ' group 对照不命中', runCodeGroupDenyReason(noneStateFx, { name: 'run_code', arguments: { code: 'await tools.' + controlName + '({})' } }, { kind: 'main' }, { gateRuntime }), null)
}
const mcpWriteReason = runCodeGroupDenyReason(noneStateFx, { name: 'run_code', arguments: { code: "try { await tools['mcp__chrome-devtools-mcp__list_pages']({}) } catch (e) {}\nawait tools.write({ file_path: 'x', content: '1' })" } }, { kind: 'main' }, { gateRuntime })
checkTrue('K12 MCP独立catch+受阻write混合组只报write且不出现假ask', typeof mcpWriteReason === 'string' && mcpWriteReason.includes('路由未确认：write/edit') && !mcpWriteReason.includes('结果未正确返回用户层'))

// ── GW 系列：YAML 单一来源、prompt variable 契约、严格校验与动态词表 ────────
const GATE_FIELD_NAMES = ['routeDirect', 'routePlan', 'routeDisagree', 'approvalApprove', 'approvalReplan', 'purposeRefine', 'purposeRedo']
const GATE_VARIABLE_NAMES = ['extra_plan_route_direct', 'extra_plan_route_plan', 'extra_plan_route_disagree', 'extra_plan_approval_approve', 'extra_plan_approval_replan', 'extra_plan_purpose_refine', 'extra_plan_purpose_redo']
const factoryValuesPattern = new RegExp(GATE_FIELD_NAMES.map((field) => assetGateWords[field]).join('|'))

// GWY1-GWY3：YAML 七键布局 / 字段元数据契约（迁移叶 locator 已随搬迁链删除，不再断言）
check('GWY1 资产 YAML config.gateWords 直属键恰为 7 个闸门字段', Object.keys(assetGateWords), GATE_FIELD_NAMES)
check('GWY2 GATE_WORD_FIELDS 恰 7 项且每项只含 field/variable 元数据', GATE_WORD_FIELDS.map((item) => Object.keys(item).sort().join('+')), GATE_FIELD_NAMES.map(() => 'field+variable'))
check('GWY3 GATE_WORD_FIELDS 的 field/variable 与 YAML 键一一对应', GATE_WORD_FIELDS.map((item) => [item.field, item.variable]), GATE_FIELD_NAMES.map((field, index) => [field, GATE_VARIABLE_NAMES[index]]))

// GWY5-GWY7：persona prefix-only（正文仅 prefix 键）、7 个变量引用、无值字面量
const personaRow = assetRowsAll.find((row) => row.id === 'persona')
const personaText = personaRow.config.prefix
check('GWY5 persona config 正文键集合恰为 [prefix]（prefix-only，不含旧 text 兼容键）', Object.keys(personaRow.config), ['prefix'])
check('GWY6 persona 正文引用的变量集合恰为 7 个', Array.from(new Set(personaText.match(/\{\{extra_plan_[a-z_]+\}\}/g) || [])).sort(), GATE_VARIABLE_NAMES.map((name) => '{{' + name + '}}').sort())
check('GWY7 persona 正文不含任何闸门值字面量', factoryValuesPattern.test(personaText), false)

// GWY8：宿主严格 renderPrompt 对 prefix-only 路径完成替换
let hostSystemPromptUrl = null
try { hostSystemPromptUrl = import.meta.resolve('@deepseek-ai/dsh-system-prompt') } catch {}
const explicitRoot = typeof process.env.DSH_INSTALL_ROOT === 'string' ? process.env.DSH_INSTALL_ROOT.trim() : ''
const hostSystemPromptEntry = hostSystemPromptUrl !== null && hostSystemPromptUrl.startsWith('file:') ? fileURLToPath(hostSystemPromptUrl) : null
const normalizedHostRoot = explicitRoot.replace(/[\\/]+$/, '').replaceAll('/', '\\').toLowerCase()
const normalizedHostEntry = hostSystemPromptEntry === null ? '' : hostSystemPromptEntry.replaceAll('/', '\\').toLowerCase()
const hostSystemPromptInRoot = explicitRoot !== '' && hostSystemPromptEntry !== null && existsSync(hostSystemPromptEntry) && (normalizedHostEntry === normalizedHostRoot || normalizedHostEntry.startsWith(normalizedHostRoot + '\\'))
const hostRenderPrompt = hostSystemPromptInRoot ? (await import(hostSystemPromptUrl)).renderPrompt : null
const renderedPrefix = typeof hostRenderPrompt === 'function' ? hostRenderPrompt({ sections: [{ name: 'deployment:persona', text: personaText }], contexts: [], variables: gateRuntime.variables }) : ''
checkTrue('GWY8 宿主严格 renderPrompt 对 prefix 完成全部变量替换且含 7 个当前值', typeof hostRenderPrompt === 'function' && !renderedPrefix.includes('{{') && GATE_FIELD_NAMES.every((field) => renderedPrefix.includes(assetGateWords[field])))

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
    output.error('     validator 矩阵未按前缀抛错: ' + label + ' -> ' + String(message))
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

output.summary(pass, fail)
process.exit(fail === 0 ? 0 : 1)
