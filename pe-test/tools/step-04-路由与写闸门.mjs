// reviewer pwsh 写动词拦截（工具目录判定）验证：
// ①纯函数断言（catalogHasWriteTools / isReadOnlyChildByCatalog）
// ②预设静态断言（agent.cordis.yml 三行子代理 deny 清单）
// ③真实监听器拦截行为（mock ctx 走插件 apply 注册的 assemble/pre-execute）
// ④回归（主会话路由闸门、planner 拦截、anchored 引导收窄）
import { pathToFileURL, fileURLToPath } from 'node:url'
import { join } from 'node:path'
import { createRequire } from 'node:module'
import { readFileSync, writeFileSync, existsSync, mkdtempSync, rmSync } from 'node:fs'
import { homedir, tmpdir } from 'node:os'

// 隔离前的原始 DSH_HOME：仅供下方 createRequire 锚定宿主 profile 的 js-yaml；
// 插件运行时的 DSH_HOME 见紧随 registerHostDeps 之后的隔离块。
const DSH_HOME = (process.env.DSH_HOME || homedir() + '/.dsh').replaceAll('\\', '/')
const PLUGIN_PATH = fileURLToPath(new URL('../../plugins/dsh-extra-plan/index.js', import.meta.url))
const AGENT_RUNTIME_PATH = fileURLToPath(new URL('../../plugins/dsh-extra-plan/lib/agent-runtime.js', import.meta.url))
const SHELL_MUTATION_PATH = fileURLToPath(new URL('../../plugins/dsh-extra-plan/lib/shell-mutation.js', import.meta.url))
import { registerHostDeps } from '../_shared/host-deps.mjs'
// host-deps 必须在隔离前完成解析：它按候选① DSH_HOME/profiles/web 锚定宿主真包，
// 隔离后该锚点不存在（会退到 npm 全局候选，非确定）。
await registerHostDeps()

// ── 测试隔离（方案 A 构造期读盘） ──────────────────────────────────────────
// live-config 构造期无条件读盘一次（DSH_HOME/.agent-presets/extra-plan/agent.cordis.yml，或
// 优先级更高的 DSH_EXTRA_PLAN_CONFIG_PATH）。若命中现场真值，本脚本各 harness 传入的 config
// 快照（期望值全部按入参硬编码）会被现场配置污染。故在【插件 import 之前】把 DSH_HOME 指向
// 一个空的临时目录、并清空 DSH_EXTRA_PLAN_CONFIG_PATH，使构造期读盘必然失败 → 各实例回退到
// 自己的 fallbackDefaults（= 该 harness 的入参）。测试结束（含 process.exit 与异常退出路径）
// 由 process.on('exit') 恢复原值并删除临时目录。
const previousDshHome = process.env.DSH_HOME
const previousConfigPath = process.env.DSH_EXTRA_PLAN_CONFIG_PATH
const isolatedDshHome = mkdtempSync(join(tmpdir(), 'dsh-extra-plan-step04-home-'))
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

const plugin = await import(pathToFileURL(PLUGIN_PATH).href)
import { createSdkTextCache, sdkSchemasFingerprint, sdkTextCacheEntryMatches } from '../../plugins/dsh-extra-plan/lib/sdk-text-cache.js'
import { createGateRuntime } from '../../plugins/dsh-extra-plan/lib/gate-words.js'
import { createLiveConfig } from '../../plugins/dsh-extra-plan/lib/live-config.js'
import { CREATIVE_SKILL_NAMES as CREATIVE_SKILL_NAMES_FOR_TEST } from '../../plugins/dsh-extra-plan/lib/assembly-presentation.js'
import { SETTING_DEFINITIONS as SETTING_DEFINITIONS_E, SETTING_GROUPS as SETTING_GROUPS_E, PRESET_ROW_ID as PRESET_ROW_ID_E, SETTINGS_ROW_ID as SETTINGS_ROW_ID_E, EXTRA_PLAN_SETTING_DEFINITIONS as EXTRA_PLAN_SETTING_DEFINITIONS_E, findPluginsRow as findPluginsRowE } from '../../plugins/dsh-extra-plan/lib/preset-settings.js'
import { restatePresetPlugins as restatePresetPluginsE, declarationCoversAsset as declarationCoversAssetE, ASSET_PATCH_FILE as ASSET_PATCH_FILE_E, pluginRowIds as pluginRowIdsE } from '../../plugins/dsh-extra-plan/lib/preset-sync.js'
// 说明：不 import lib/settings.js——它顶层 import '@deepseek-ai/schemastery'，解析环境依赖宿主副本
// （本机 npm 全局 dsh 实测 0.1.7-rc.2，profiles/web 另有 profile 内副本）；
// 故 Config 的 volatile/默认值契约改用源码文本静态核对（机械可核对），不依赖本机 schemastery 版本。
import { readFileSync as readFileSyncE } from 'node:fs'
const decisions = plugin.decisions
const { catalogHasWriteTools, isReadOnlyChildByCatalog, routeDenyReason, runCodeCatchGateReason, runCodeGroupDenyReason, askUserQuestionReturnGateReason, probeDisposalWarning, runCodeSiteCount, isRunCodeSubCall, runCodeDispatchGateReason, CORDIS_PRESENTATION_TOOLS, projectAssemblyForPresentation, renderFilteredToolsSdk, toolPresentationModeOf, projectSkillCatalogDecision, isBootstrapPhase, shellMutationReason, recordJobOutputCall, parseAskResultData, parseDispatchAskResult, deriveFlowState } = decisions

// ── F 段（HP 首轮）tool:read 手写文案（变量②）的两个基准字符串 ──────────────
// HINT_READ_DEFAULT：内置兜底文案的逐字副本，同时是预设 bootstrapReadHint 的示例值
//   （下方「预设静态断言」会核对两者逐字一致，防止测试副本与预设/内置漂移）。
// HOST_READ_TEXT：宿主 tool:read 原文（宿主 section 文本），即 N/P/B 与 L 段的直通夹具值——F/PTC 由插件
//   借槽覆盖为手写文案，故两者必须可区分（断言要求 F 段逐字等于前者、且不等于后者）。
const HINT_READ_DEFAULT = [
  '在 run_code 程序里读文件：调用 tools.read({ file_path })，file_path 必填；可选 offset（默认 1）与 limit（默认 2000）。返回含 path、offset、totalLines 与带行号的 lines（每项为 { number, text }）。示例：',
  "const r = await tools.read({ file_path: 'README.md' })",
  'return r',
].join('\n')
const HOST_READ_TEXT = 'Use the read tool — not shell commands like cat — to inspect text files. Results include line numbers. Use offset and limit to continue reading large files.'
const PRESET_READ_HINT = ['run_code 调用 read 示例：', "const r = await tools.read({ file_path: 'README.md' })", 'return r'].join('\n')
// 变量②文案的四要素判据：工具名、调用形态、参数与默认值、返回形状；且不得含官方 SDK 骨架。
function hintReadOk(text) {
  return typeof text === 'string'
    && text.includes('tools.read') && text.includes('file_path')
    && text.includes('offset') && text.includes('limit')
    && text.includes('run_code') && text.includes('totalLines') && text.includes('lines')
    && !text.includes('interface ToolArgsMap') && !text.includes('declare const tools') && !text.includes('Use the read tool')
}

let pass = 0
let fail = 0
function check(name, got, expected) {
  const okResult = JSON.stringify(got) === JSON.stringify(expected)
  if (okResult) { pass += 1 } else { fail += 1 }
  console.log(`${okResult ? 'PASS' : 'FAIL'}  ${name}  (期望 ${JSON.stringify(expected)}, 实际 ${JSON.stringify(got)})`)
}
function checkTrue(name, got) {
  const okResult = got === true
  if (okResult) { pass += 1 } else { fail += 1 }
  console.log(`${okResult ? 'PASS' : 'FAIL'}  ${name}  (期望 true, 实际 ${JSON.stringify(got)})`)
}

// ── ① 纯函数断言（[任务5]） ────────────────────────────────────────────
check('G1 catalogHasWriteTools 只读目录 → false', catalogHasWriteTools(['read', 'pwsh']), false)
check('G2 catalogHasWriteTools 含 write → true', catalogHasWriteTools(['read', 'write']), true)
check('G3 catalogHasWriteTools 含 edit → true', catalogHasWriteTools(['read', 'edit']), true)
check('G4 catalogHasWriteTools 元素缺 name → false', catalogHasWriteTools([{ name: 'read' }]), false)
check('G5 catalogHasWriteTools([]) → false', catalogHasWriteTools([]), false)
check('G6 catalogHasWriteTools(undefined) → false', catalogHasWriteTools(undefined), false)
check('G7 isReadOnlyChildByCatalog 只读目录 → true', isReadOnlyChildByCatalog(['read', 'pwsh']), true)
check('G8 isReadOnlyChildByCatalog 含 write → false', isReadOnlyChildByCatalog(['write', 'read']), false)
check('G9 isReadOnlyChildByCatalog 含 edit → false', isReadOnlyChildByCatalog(['edit']), false)
check('G10 isReadOnlyChildByCatalog([]) → false', isReadOnlyChildByCatalog([]), false)

// ── ② 预设静态断言（[任务4]，读文件核对，不跑装配） ────────────────────
const require = createRequire(DSH_HOME + '/profiles/web/node_modules/package.json')
const yaml = require('js-yaml')
const JsExpr = new yaml.Type('tag:yaml.org,2002:js', { kind: 'scalar', resolve: () => true, construct: (data) => data })
const schema = yaml.JSON_SCHEMA.extend(JsExpr)
// 2026-09-10 修订：预设静态断言改为读【工作区模板资产】，与 step-01-预设完整性 同源。
// 原实现读现场 DSH_HOME 预设，会导致「工作区已改、断言要等用户部署后才可能通过」的悖论。
const presetFile = fileURLToPath(new URL('../../plugins/dsh-extra-plan/assets/presets/extra-plan/agent.cordis.yml', import.meta.url))
const presetText = readFileSync(presetFile, 'utf8')
let rows
try {
  rows = yaml.load(presetText, { schema })
} catch (error) {
  console.error(`FAIL  YAML 解析失败: ${error.message}`)
  process.exit(1)
}
console.log(`PASS  YAML 解析成功（${Array.isArray(rows) ? rows.length : '非数组!'} 行）`)

function flatten(list) {
  const out = []
  for (const r of list) {
    if (r === null || typeof r !== 'object') continue
    out.push(r)
    if (r.group === true && Array.isArray(r.config)) out.push(...flatten(r.config))
  }
  return out
}
const all = flatten(rows)

// ── 闸门词唯一真源 = 资产 YAML 的 config.gateWords ─────────────────────────
// 插件 apply 对 gateWords 做整组严格校验：缺失/非法同步抛错。故 harness 默认经
// withGateWords 合并 YAML 词表（调用方显式传 gateWords 时以调用方为准，供坏配置用例）；
// 期望文案（路由确认句等）同样由当前词表派生，测试不手写第二份词值。
const assetExtraPlanConfig = all.find((row) => row.id === 'extra-plan').config
const assetGateWords = assetExtraPlanConfig.gateWords
const gateRuntime = createGateRuntime(assetGateWords)
const ROUTE_CONFIRM_TEXT = gateRuntime.confirm.route
function withGateWords(config) { return { gateWords: assetGateWords, ...config } }
function checkDeny(id, expectCount, mustContain, mustNotContain, label) {
  const row = all.find((r) => r.id === id)
  const deny = row !== undefined && row.config !== undefined && Array.isArray(row.config.toolFilter.deny) ? row.config.toolFilter.deny : null
  if (deny === null) {
    fail += 1
    console.log(`FAIL  ${label} 缺 toolFilter.deny`)
    return
  }
  const okCount = expectCount === null || deny.length === expectCount
  const okContains = mustContain.every((n) => deny.includes(n))
  const okExcludes = mustNotContain.every((n) => !deny.includes(n))
  if (okCount && okContains && okExcludes) {
    pass += 1
    console.log(`PASS  ${label}（${deny.length} 项${mustContain.length > 0 ? '，含 ' + mustContain.join('/') : ''}${mustNotContain.length > 0 ? '，不含 ' + mustNotContain.join('/') : ''}）`)
  } else {
    fail += 1
    console.log(`FAIL  ${label}（实际 ${deny.length} 项: ${deny.join(', ')}）`)
  }
}
checkDeny('tool-subagent-review', 13, ['write', 'edit', 'subagent_probe'], [], 'reviewer deny 恰 13 项且含 write/edit/subagent_probe')
checkDeny('tool-subagent', 11, ['subagent_probe'], ['write', 'edit'], 'executor deny 恰 11 项、不含 write/edit、含 subagent_probe')
checkDeny('tool-subagent-plan', 13, ['write', 'edit', 'subagent_probe'], [], 'planner deny 恰 13 项且含 write/edit/subagent_probe')
checkDeny('tool-subagent-probe', 14, ['write', 'edit', 'subagent_probe'], ['subagent_fork'], 'probe deny 恰 14 项且含 write/edit/subagent_probe、不含 subagent_fork')
{
  const extraPlanRow = all.find((r) => r.id === 'extra-plan')
  const presetHint = extraPlanRow !== undefined && extraPlanRow.config !== undefined ? extraPlanRow.config.bootstrapReadHint : undefined
  check('P0-0 预设 bootstrapReadHint 保持工作区模板现值', presetHint, PRESET_READ_HINT)
  check('P0-1 预设 bootstrapPersona 未被回退（中文现值逐字保留）', extraPlanRow !== undefined && extraPlanRow.config !== undefined ? extraPlanRow.config.bootstrapPersona : undefined, '你是一位乐于助人的软件工程师助手，使用简体中文思考和回复。')
}

// ── ③ 真实监听器拦截行为（[任务5]，mock ctx 走插件 apply） ─────────────
// 0.1.7 取径订正：C=1 创造 skill 面不再经 agentPresets.resolve('cordis') 运行期注册
// （该 resolve 在 0.1.7 只返回 {id[,broken]}，path 恒 undefined），改为预设 skill-filesystem
// 行 config.customSkillDirs 静态注册——故 agentPresets/skills mock 与其断言整体退役。
function makeHarness(config = {}) {
  const listeners = {}
  const variables = []
  const systemPrompt = { variable: (name, provider) => { variables.push({ name, provider }); return () => {} } }
  const ctx = {
    systemPrompt,
    get: (name) => {
      if (name === 'systemPrompt') return systemPrompt
      // 0.1.7 服务名换代：codeRuntime → ptcRuntime（SDK renderer 语言来源）。
      if (name === 'ptcRuntime') return { language: typeof config.language === 'string' ? config.language : 'typescript' }
      return undefined
    },
    on: (name, fn, options) => {
      if (listeners[name] === undefined) listeners[name] = []
      if (options !== null && typeof options === 'object' && options.prepend === true) listeners[name].unshift(fn)
      else listeners[name].push(fn)
    },
    effect: (effectFn) => effectFn(),
    // 修复（mock 契约补齐）：真实宿主 ctx 有 provide（插件 apply 顶层注册只读服务），
    // mock 缺此方法导致 apply 抛 TypeError；与 step-06 同款写法。
    provide: (name, value) => { ctx[name] = value },
  }
  plugin.apply(ctx, withGateWords(config))
  listeners.variables = variables
  return listeners
}
const harness = makeHarness({ anchoredBootstrap: false })
const harnessBoot = makeHarness({ anchoredBootstrap: true })
const harnessCatchOn = makeHarness({ runcodeCatchGate: true })

const childAgent = (id) => ({
  session: {
    header: { id, origin: 'subagent', delegationDepth: 1, parentSession: 'parent-1', cwd: 'C:/work' },
    snapshotEvents: () => [],
    append: () => {},
  },
  options: {},
  ctx: undefined,
})
const mainAgent = {
  session: { header: { id: 'main-1', cwd: 'C:/work' }, snapshotEvents: () => [] },
  options: {},
  ctx: undefined,
}
// 修复（mock 数据补齐）：插件判定 planner 身份要求会话 events 含
// subagent/descriptor 事件且 data.mode === 'continuable'（与 step-06-线索落盘同款 DESC）。
// 缺此事件时 planner 被误判为普通执行者，R11（planner write 应 deny）与 R13（收窄）走错分支。
const DESC = { type: 'subagent/descriptor', data: { mode: 'continuable' } }

const plannerAgent = {
  session: { header: { id: 'planner-1', origin: 'subagent', delegationDepth: 1, parentSession: 'parent-1', cwd: 'C:/work' }, snapshotEvents: () => [DESC] },
  options: { model: 'deepseek-v4-pro' },
  ctx: undefined,
}

async function assemble(listeners, agent, tools, sections = []) {
  const entry = listeners['system-prompt/assemble']
  if (entry === undefined || entry.length === 0) throw new Error('assemble 监听器未注册')
  return await entry[0](null, { agent }, async () => ({ tools, sections, contexts: [] }))
}
function preExecute(listeners, agent, name, argumentsObj, execExtras) {
  const entry = listeners['tools/pre-execute']
  if (entry === undefined || entry.length === 0) throw new Error('pre-execute 监听器未注册')
  return entry[0]({ agent, name, arguments: argumentsObj, ...(execExtras !== undefined && execExtras !== null ? execExtras : {}) }, () => ({ kind: 'allow' }))
}

// 只读目录（reviewer 类）：pwsh 写 → deny；pwsh 只读 → 放行；write/edit → deny
const reviewer = childAgent('reviewer-1')
await assemble(harness, reviewer, [{ name: 'read' }, { name: 'glob' }, { name: 'grep' }, { name: 'pwsh' }])
let r = preExecute(harness, reviewer, 'pwsh', { command: 'New-Item x.txt' })
checkTrue('R1 reviewer pwsh New-Item → deny', r !== null && r !== undefined && r.kind === 'deny' && String(r.reason).includes('验收复核者只读'))
checkTrue('R2 reviewer pwsh deny 文案含只读限定', r !== null && r !== undefined && r.kind === 'deny' && String(r.reason).includes('pwsh 仅限只读探查命令，禁止创建/修改/删除文件'))
r = preExecute(harness, reviewer, 'pwsh', { command: 'Set-Content a.txt x' })
checkTrue('R3 reviewer pwsh Set-Content → deny', r !== null && r !== undefined && r.kind === 'deny' && String(r.reason).includes('验收复核者只读'))
r = preExecute(harness, reviewer, 'pwsh', { command: 'Get-ChildItem' })
checkTrue('R4 reviewer pwsh Get-ChildItem → 放行', r !== null && r !== undefined && r.kind === 'allow')
r = preExecute(harness, reviewer, 'write', {})
checkTrue('R5 reviewer write → deny', r !== null && r !== undefined && r.kind === 'deny' && String(r.reason).includes('验收复核者只读'))
r = preExecute(harness, reviewer, 'edit', {})
checkTrue('R6 reviewer edit → deny', r !== null && r !== undefined && r.kind === 'deny' && String(r.reason).includes('验收复核者只读'))

// 执行者目录（含 write/edit）：缓存未命中 → 放行（现状不变）
const executor = childAgent('executor-1')
await assemble(harness, executor, [{ name: 'read' }, { name: 'write' }, { name: 'edit' }, { name: 'pwsh' }])
r = preExecute(harness, executor, 'pwsh', { command: 'New-Item x.txt' })
checkTrue('R7 executor pwsh New-Item → 放行（现状不变）', r !== null && r !== undefined && r.kind === 'allow')

// 缓存未装配（目录尚未记录）→ 放行（fail-open，不误伤）
const fresh = childAgent('fresh-1')
r = preExecute(harness, fresh, 'write', {})
checkTrue('R8 缓存未命中（未装配）→ 放行 fail-open', r !== null && r !== undefined && r.kind === 'allow')

// ── ④ 回归 ────────────────────────────────────────────────────────────
// 主会话路由未确认：write/pwsh 写拦截不变（bootstrapOn=false 下同样生效）
r = preExecute(harness, mainAgent, 'write', {})
checkTrue('R9 主会话路由未确认 write → deny（回归）', r !== null && r !== undefined && r.kind === 'deny' && String(r.reason).includes('路由未确认'))
r = preExecute(harness, mainAgent, 'pwsh', { command: 'New-Item x.txt' })
checkTrue('R10 主会话路由未确认 pwsh 写 → deny（回归）', r !== null && r !== undefined && r.kind === 'deny' && String(r.reason).includes('路由未确认'))

// planner 分支拦截照旧（write deny 文案含「规划子代理只读」）
r = preExecute(harness, plannerAgent, 'write', {})
checkTrue('R11 planner write → deny（回归）', r !== null && r !== undefined && r.kind === 'deny' && String(r.reason).includes('规划子代理只读'))

// bootstrapOn=true：主会话/规划子代理首轮目录收窄为 shell+read；executor 不引导
const bootMain = await assemble(harnessBoot, mainAgent, [{ name: 'read' }, { name: 'pwsh' }, { name: 'write' }, { name: 'glob' }])
check('R12 bootstrapOn=true 主会话首轮收窄为 shell+read', Array.isArray(bootMain.tools) ? bootMain.tools.map((t) => t.name).sort() : null, ['pwsh', 'read'])
const bootPlanner = await assemble(harnessBoot, plannerAgent, [{ name: 'read' }, { name: 'pwsh' }, { name: 'write' }])
check('R13 bootstrapOn=true planner 首轮收窄为 shell+read', Array.isArray(bootPlanner.tools) ? bootPlanner.tools.map((t) => t.name).sort() : null, ['pwsh', 'read'])
const bootExecutor = await assemble(harnessBoot, executor, [{ name: 'read' }, { name: 'pwsh' }, { name: 'write' }])
check('R14 bootstrapOn=true executor 不引导（目录原样）', Array.isArray(bootExecutor.tools) ? bootExecutor.tools.map((t) => t.name).sort() : null, ['pwsh', 'read', 'write'])

// ── ⑤ 探查子代理（subagent_probe）行为断言（R15-R21，任意路由状态放行） ──
// 事件构造辅助（同 step-00 F 系列形状：user/message + ask_user_question call/result）
const umE = () => ({ type: 'user/message', data: { source: { kind: 'user' } } })
const callE = (name, cid, argumentsStr = '{}') => ({ type: 'tool/call', data: { name, callId: cid, arguments: argumentsStr } })
const okE = (cid, text) => ({ type: 'tool/result', data: { message: { content: [{ type: 'tool-result', toolCallId: cid, content: [{ type: 'text', text }] }] } } })
const errE = (cid, code) => ({ type: 'tool/result', data: { error: { name: 'Error', code }, message: { content: [{ type: 'tool-result', toolCallId: cid, content: [] }] } } })
const routeArgsE = JSON.stringify({ questions: [{ id: 'q1', options: [{ label: '直接执行' }, { label: '进行pro规划' }, { label: '不同意' }] }] })
// D7：路由 ask 双问夹具（第二问纯文本「补充要求」）——D7 后单问夹具会被结构校验拒绝
const route2qArgsE = JSON.stringify({ questions: [{ id: 'q1', options: [{ label: '直接执行' }, { label: '进行pro规划' }, { label: '不同意' }] }, { id: 'supplement', question: '补充要求' }] })
const clarifyArgsE = JSON.stringify({ questions: [{ id: 'q1', options: [{ label: '方案A' }, { label: '方案B' }] }] })
const purposeArgsE = JSON.stringify({ questions: [{ id: 'q1', options: [{ label: '完善方案' }, { label: '重新规划' }] }] })
const approvalArgsE = JSON.stringify({ questions: [{ id: 'q1', options: [{ label: '同意执行' }, { label: '转交pro规划' }, { label: '不同意' }] }] })
const answerE = (labels) => JSON.stringify({ answers: labels.map((l) => ({ id: 'q1', selected: [l] })) })
const mainWithEvents = (events) => ({ session: { header: { id: 'main-1', cwd: 'C:/work' }, snapshotEvents: () => events }, options: {}, ctx: undefined })

// direct 态：路由已确认「直接执行」；无确认态：无事件；plan+clarified 态：规划+澄清完成
const directMain = mainWithEvents([umE(), callE('ask_user_question', 'a1', routeArgsE), okE('a1', answerE(['直接执行']))])
const noneMain = mainWithEvents([])
const planMain = mainWithEvents([umE(), callE('ask_user_question', 'a1', routeArgsE), okE('a1', answerE(['进行pro规划'])), callE('ask_user_question', 'a2', clarifyArgsE), okE('a2', answerE(['方案A']))]) // 目的未定前置态夹具（R70/R81/T3-4 依赖 purpose=none）
// planPurposeMain：路由 + 目的确认（「完善方案」）+ 澄清 三锚点齐备（目的 ask 位于澄清之前，同 persona 新顺序）
const planPurposeMain = mainWithEvents([umE(), callE('ask_user_question', 'a1', routeArgsE), okE('a1', answerE(['进行pro规划'])), callE('ask_user_question', 'a2', purposeArgsE), okE('a2', answerE(['完善方案'])), callE('ask_user_question', 'a3', clarifyArgsE), okE('a3', answerE(['方案A']))])
const channelBrokenMain = mainWithEvents([umE(), callE('ask_user_question', 'a1', routeArgsE), errE('a1', 'NO_PROVIDER')])
const ordinaryProbeArgsE = { questions: [{ id: 'q1', options: [{ label: '主会话探查' }, { label: '探查者探查' }] }] }
const ordinaryClarifyArgsE = { questions: [{ id: 'q1', options: [{ label: '方案A' }, { label: '方案B' }] }] }

// 精确目的 ask 只在 route=plan 放行；route=none/direct 拒绝且引用固定路由确认句，ordinary 与 channelBroken 保持放行。
r = preExecute(harness, noneMain, 'ask_user_question', JSON.parse(purposeArgsE))
checkTrue('R18a 主会话 none 态精确目的 ask → deny 且含固定路由确认句', r !== null && r !== undefined && r.kind === 'deny' && String(r.reason).includes(ROUTE_CONFIRM_TEXT))
r = preExecute(harness, directMain, 'ask_user_question', JSON.parse(purposeArgsE))
checkTrue('R18b 主会话 direct 态精确目的 ask → deny 且含固定路由确认句', r !== null && r !== undefined && r.kind === 'deny' && String(r.reason).includes(ROUTE_CONFIRM_TEXT))
r = preExecute(harness, planMain, 'ask_user_question', JSON.parse(purposeArgsE))
checkTrue('R18c 主会话 plan 态精确目的 ask → allow', r !== null && r !== undefined && r.kind === 'allow')
r = preExecute(harness, channelBrokenMain, 'ask_user_question', JSON.parse(purposeArgsE))
checkTrue('R18d 主会话 channelBroken 精确目的 ask → allow（逃生）', r !== null && r !== undefined && r.kind === 'allow')
r = preExecute(harness, noneMain, 'ask_user_question', JSON.parse(route2qArgsE))
checkTrue('R18e 主会话 none 态路由 ask 双问（第二问纯文本）→ allow', r !== null && r !== undefined && r.kind === 'allow')
r = preExecute(harness, noneMain, 'ask_user_question', ordinaryProbeArgsE)
checkTrue('R18f 主会话 none 态 ordinary 探查 ask → allow', r !== null && r !== undefined && r.kind === 'allow')
r = preExecute(harness, noneMain, 'ask_user_question', ordinaryClarifyArgsE)
checkTrue('R18g 主会话 none 态 ordinary 澄清 ask → allow', r !== null && r !== undefined && r.kind === 'allow')

// R18：direct 态派探查者（run_in_background: true）→ 放行（同时把 main-1 挂「待认领计数」，
// 供 C1/C2/C2b 认领用例经 parentSession=main-1 消费验证；R15-R17 判读走真实工具集，不依赖认领）
r = preExecute(harness, directMain, 'subagent_probe', { run_in_background: true })
checkTrue('R18 主会话 direct 态 subagent_probe(run_in_background: true) → 放行', r !== null && r !== undefined && r.kind === 'allow')
r = preExecute(harness, directMain, 'subagent_probe', {})
checkTrue('R19 主会话 direct 态 subagent_probe(缺 run_in_background) → deny 且文案含 run_in_background: true', r !== null && r !== undefined && r.kind === 'deny' && String(r.reason).includes('run_in_background: true'))
r = preExecute(harness, noneMain, 'subagent_probe', { run_in_background: true })
checkTrue('R20 主会话无路由确认态 subagent_probe(run_in_background: true) → 放行（任意状态放行）', r !== null && r !== undefined && r.kind === 'allow')
r = preExecute(harness, planMain, 'subagent_probe', { run_in_background: true })
checkTrue('R21 主会话 plan+clarified 态 subagent_probe(run_in_background: true) → 放行', r !== null && r !== undefined && r.kind === 'allow')

// probe 子会话（parentSession=main-1，真实工具集含 save_probe）：write → probe 文案 deny；
// pwsh 只读 → 放行；save_probe → 放行（child 分支不拦）
const probeAgent = {
  session: { header: { id: 'probe-1', origin: 'subagent', delegationDepth: 1, parentSession: 'main-1', cwd: 'C:/work' }, snapshotEvents: () => [] },
  options: {},
  ctx: { get: (n) => (n === 'tools' ? { schemas: () => [{ name: 'read' }, { name: 'glob' }, { name: 'grep' }, { name: 'pwsh' }, { name: 'save_probe' }] } : undefined) },
}
await assemble(harness, probeAgent, [{ name: 'read' }, { name: 'glob' }, { name: 'grep' }, { name: 'pwsh' }, { name: 'save_probe' }])
r = preExecute(harness, probeAgent, 'write', {})
checkTrue('R15 probe 会话 write → deny 且文案含「探查者只读」', r !== null && r !== undefined && r.kind === 'deny' && String(r.reason).includes('探查者只读'))
r = preExecute(harness, probeAgent, 'pwsh', { command: 'Get-ChildItem' })
checkTrue('R16 probe 会话 pwsh 只读 → 放行', r !== null && r !== undefined && r.kind === 'allow')
r = preExecute(harness, probeAgent, 'save_probe', { fileMap: [], focusAreas: [], exclusions: [], background: [] })
checkTrue('R17 probe 会话 save_probe → 放行', r !== null && r !== undefined && r.kind === 'allow')

// ── ⑤b 真实工具集判定（方案B：ptc 折叠误判修复；T1-T8） ──────────────────
// 子代理夹具工厂：目录与真实工具集（tools.schemas）双信号；schemas 不可得时回落目录判定。
const childWithSchemas = (id, schemas) => ({
  session: {
    header: { id, origin: 'subagent', delegationDepth: 1, parentSession: 'parent-1', cwd: 'C:/work' },
    snapshotEvents: () => [],
    append: () => {},
  },
  options: {},
  ctx: { get: (n) => (n === 'tools' ? { schemas: () => schemas } : undefined) },
})
// T1 折叠+executor：目录 [run_code]、真实工具集含 write/edit → write 放行（防回归 R39 语义：执行者在折叠目录可写）
{
  const t1 = childWithSchemas('t-exec-1', [{ name: 'read' }, { name: 'write' }, { name: 'edit' }])
  await assemble(harness, t1, [{ name: 'run_code' }])
  r = preExecute(harness, t1, 'write', {})
  checkTrue('T1 折叠+executor（schemas 含 write/edit）write → 放行（误判修复）', r !== null && r !== undefined && r.kind === 'allow')
}
// T2 折叠+probe：目录 [run_code]、真实工具集无写含 save_probe → write deny 且文案含「探查者只读」
{
  const t2 = childWithSchemas('t-probe-1', [{ name: 'read' }, { name: 'glob' }, { name: 'save_probe' }])
  await assemble(harness, t2, [{ name: 'run_code' }])
  r = preExecute(harness, t2, 'write', {})
  checkTrue('T2 折叠+probe（无写含 save_probe）write → deny 且含「探查者只读」', r !== null && r !== undefined && r.kind === 'deny' && String(r.reason).includes('探查者只读'))
}
// T3 折叠+reviewer：目录 [run_code]、真实工具集无写无 save_probe → write deny 且文案含「验收复核者只读」
{
  const t3 = childWithSchemas('t-review-1', [{ name: 'read' }, { name: 'glob' }])
  await assemble(harness, t3, [{ name: 'run_code' }])
  r = preExecute(harness, t3, 'write', {})
  checkTrue('T3 折叠+reviewer（无写无 save_probe）write → deny 且含「验收复核者只读」', r !== null && r !== undefined && r.kind === 'deny' && String(r.reason).includes('验收复核者只读'))
}
// T4 非折叠+executor：目录含 write、真实工具集含 write → write 放行
{
  const t4 = childWithSchemas('t-exec-2', [{ name: 'read' }, { name: 'write' }])
  await assemble(harness, t4, [{ name: 'read' }, { name: 'write' }])
  r = preExecute(harness, t4, 'write', {})
  checkTrue('T4 非折叠+executor（schemas 含 write）write → 放行', r !== null && r !== undefined && r.kind === 'allow')
}
// T5 非折叠+probe：目录无写、真实工具集无写含 save_probe → write deny 且文案含「探查者只读」
{
  const t5 = childWithSchemas('t-probe-2', [{ name: 'read' }, { name: 'save_probe' }])
  await assemble(harness, t5, [{ name: 'read' }, { name: 'glob' }])
  r = preExecute(harness, t5, 'write', {})
  checkTrue('T5 非折叠+probe（无写含 save_probe）write → deny 且含「探查者只读」', r !== null && r !== undefined && r.kind === 'deny' && String(r.reason).includes('探查者只读'))
}
// T6 非折叠+reviewer：目录无写、真实工具集无写 → write deny 且文案含「验收复核者只读」
{
  const t6 = childWithSchemas('t-review-2', [{ name: 'read' }, { name: 'glob' }])
  await assemble(harness, t6, [{ name: 'read' }, { name: 'glob' }])
  r = preExecute(harness, t6, 'write', {})
  checkTrue('T6 非折叠+reviewer（无写）write → deny 且含「验收复核者只读」', r !== null && r !== undefined && r.kind === 'deny' && String(r.reason).includes('验收复核者只读'))
}
// T7 折叠+schemas 不可得（ctx: undefined）：目录 [run_code] → write 放行（回落 fail-open，同 R25）
{
  const t7 = childAgent('t-fresh-1')
  await assemble(harness, t7, [{ name: 'run_code' }])
  r = preExecute(harness, t7, 'write', {})
  checkTrue('T7 折叠+schemas 不可得 write → 放行（回落 fail-open）', r !== null && r !== undefined && r.kind === 'allow')
}
// T8 非折叠无写目录+schemas 不可得：目录 [read] → write deny 且含「验收复核者只读」（回落目录判定，同 R26）
{
  const t8 = childAgent('t-fresh-2')
  await assemble(harness, t8, [{ name: 'read' }])
  r = preExecute(harness, t8, 'write', {})
  checkTrue('T8 非折叠无写目录+schemas 不可得 write → deny 且含「验收复核者只读」（回落目录判定）', r !== null && r !== undefined && r.kind === 'deny' && String(r.reason).includes('验收复核者只读'))
}

// ── ⑤c 认领（放行→待认领计数→probe 子会话 session-start 认领并注册 save_probe；C1-C3） ──
const claimTools = (record, schemas) => ({
  register: (def) => { record.push(def.name) },
  schemas: (agent) => schemas,
})
const claimChild = (id, parentSession, tools) => ({
  session: {
    header: { id, origin: 'subagent', delegationDepth: 1, parentSession, cwd: 'C:/work' },
    snapshotEvents: () => [],
    append: () => {},
  },
  options: {},
  ctx: { get: (n) => (n === 'tools' ? tools : undefined) },
})
// 0.1.7 换代：agent/session-start 已删除，会话启动注册改由 agent/created（serial，payload
// { agent, source }) 承担——监听器被宿主 await，抛错即会话创建失败。
const agentCreated = (listeners, agent) => {
  const entry = listeners['agent/created']
  if (entry === undefined || entry.length === 0) throw new Error('agent/created 监听器未注册')
  for (const fn of entry) fn({ agent, source: 'startup' })
}
// C1 probe 子会话（parent=main-1 已有 R18/R20/R21 放行累计的待认领计数、schemas 无写）→ 注册 save_probe
{
  const c1Registered = []
  const c1Probe = claimChild('probe-c1', 'main-1', claimTools(c1Registered, [{ name: 'read' }, { name: 'save_probe' }]))
  agentCreated(harness, c1Probe)
  checkTrue('C1 probe 子会话（parent=main-1 有待认领计数）session-start → save_probe 已注册', c1Registered.includes('save_probe'))
}
// C2 executor 子会话（schemas 含写、同父 main-1）→ 不注册且不消费
{
  const c2Registered = []
  const c2Exec = claimChild('exec-c2', 'main-1', claimTools(c2Registered, [{ name: 'read' }, { name: 'write' }]))
  agentCreated(harness, c2Exec)
  checkTrue('C2 executor 子会话（schemas 含写）session-start → 不注册', !c2Registered.includes('save_probe'))
  // 不消费验证：同父再触发 probe 子会话仍可认领（计数未被 C2 消耗）
  const c2bRegistered = []
  const c2bProbe = claimChild('probe-c2b', 'main-1', claimTools(c2bRegistered, [{ name: 'read' }, { name: 'save_probe' }]))
  agentCreated(harness, c2bProbe)
  checkTrue('C2b 同父再触发 probe 子会话 → 仍可认领（C2 未消费计数）', c2bRegistered.includes('save_probe'))
}
// C3 reviewer 子会话（schemas 无写、parent=parent-1 无 pending）→ 不注册
{
  const c3Registered = []
  const c3Rev = claimChild('review-c3', 'parent-1', claimTools(c3Registered, [{ name: 'read' }, { name: 'glob' }]))
  agentCreated(harness, c3Rev)
  checkTrue('C3 reviewer 子会话（无 pending）session-start → 不注册', !c3Registered.includes('save_probe'))
}


// ── ⑤d 注册失败路径与重试（P0-2/D1：认领后注册失败 → 下一步重试；A/B 记终态不重试） ──
// 桩必须带真实 name 字段（TypeError / JsonSchemaError）且是真实 Error 实例，否则判据落空、测试自证失败。
const failTools = (record, schemas, failFn) => ({
  register: (def) => {
    record.push(def.name)
    if (typeof failFn === 'function') failFn(def.name)
  },
  schemas: () => schemas,
})
const stepProbe = (listeners, agent) => {
  const entry = listeners['agent/pre-step']
  if (entry === undefined || entry.length === 0) throw new Error('pre-step 监听器未注册')
  const chain = (i) => {
    if (i >= entry.length) return Promise.resolve({ kind: 'enter', messages: [] })
    return Promise.resolve(entry[i]({ agent }, () => chain(i + 1)))
  }
  return chain(0)
}
const probeSchemas = [{ name: 'read' }, { name: 'glob' }, { name: 'save_probe' }]
// 认领前置：每次放行 subagent_probe 给 main-1 挂 1 个待认领计数（同 R18 口径）。
const grantClaim = () => {
  preExecute(harness, directMain, 'subagent_probe', { run_in_background: true })
}
// C4 认领时 tools 服务不可用：不写标记 → 下一步 pre-step 重试成功，且只需 1 个计数
{
  const record4 = []
  const probe4 = claimChild('probe-c4', 'main-1', undefined)
  grantClaim()
  agentCreated(harness, probe4)
  checkTrue('C4 认领时 tools 不可用 → 本轮不注册', !record4.includes('save_probe'))
  probe4.ctx = { get: (n) => (n === 'tools' ? failTools(record4, probeSchemas) : undefined) }
  await stepProbe(harness, probe4)
  checkTrue('C4 下一步 pre-step 重试注册成功（分类 C 不写标记）', record4.includes('save_probe'))
  // 计数哨兵：成功重试不再消费计数 → 再挂 1 个计数后，同父新 probe 仍能认领并注册。
  const record4b = []
  const probe4b = claimChild('probe-c4b', 'main-1', failTools(record4b, probeSchemas))
  grantClaim()
  agentCreated(harness, probe4b)
  checkTrue('C4 重试不额外消费计数：同父新 probe 仍可认领并注册', record4b.includes('save_probe'))
}
// C5 可重试错（无 name 的普通 Error → 分类 C）：粘性 probeClaimed 使重试不再消费计数
{
  const record5 = []
  let attempts5 = 0
  const probe5 = claimChild('probe-c5', 'main-1', undefined)
  grantClaim()
  agentCreated(harness, probe5)
  probe5.ctx = { get: (n) => (n === 'tools' ? failTools(record5, probeSchemas, () => { attempts5 += 1; if (attempts5 === 1) throw new Error('transient claim register failure') }) : undefined) }
  await stepProbe(harness, probe5)
  check('C5 可重试错首次尝试 1 次', attempts5, 1)
  await stepProbe(harness, probe5)
  check('C5 粘性认领 → 次轮重试成功（不再消费计数）', [attempts5, record5.filter((n) => n === 'save_probe').length], [2, 2])
  // 计数哨兵：重试不再消费计数 → 再挂 1 个计数后，同父新 probe 仍能认领并注册。
  const record5b = []
  const probe5b = claimChild('probe-c5b', 'main-1', failTools(record5b, probeSchemas))
  grantClaim()
  agentCreated(harness, probe5b)
  checkTrue('C5 重试未额外消费计数：同父新 probe 仍可认领并注册', record5b.includes('save_probe'))
}
// C6 重名（分类 A：message 含 already registered）→ 记终态不重试
{
  const record6 = []
  let attempts6 = 0
  const dup6 = new Error('tool "save_probe" is already registered in this scope')
  const probe6 = claimChild('probe-c6', 'main-1', undefined)
  grantClaim()
  agentCreated(harness, probe6)
  probe6.ctx = { get: (n) => (n === 'tools' ? failTools(record6, probeSchemas, () => { attempts6 += 1; if (attempts6 === 1) throw dup6 }) : undefined) }
  await stepProbe(harness, probe6)
  await stepProbe(harness, probe6)
  check('C6 重名（分类 A）2 次 pre-step 只尝试 1 次', attempts6, 1)
}
// C7 永久性错误（真实 name=TypeError / JsonSchemaError）→ 分类 B 记终态不重试
{
  const record7 = []
  let attempts7 = 0
  const probe7 = claimChild('probe-c7', 'main-1', undefined)
  grantClaim()
  agentCreated(harness, probe7)
  probe7.ctx = { get: (n) => (n === 'tools' ? failTools(record7, probeSchemas, () => { attempts7 += 1; throw new TypeError('tool "save_probe" must declare output { schema, render, presentationMeta? }') }) : undefined) }
  await stepProbe(harness, probe7)
  await stepProbe(harness, probe7)
  check('C7 TypeError 桩（name 为真实 TypeError、分类 B）2 次 pre-step 只尝试 1 次', attempts7, 1)
  const record7b = []
  let attempts7b = 0
  const schemaError7 = new Error('unsupported JSON schema: unsupported keyword: oneOf')
  schemaError7.name = 'JsonSchemaError'
  const probe7b = claimChild('probe-c7b', 'main-1', undefined)
  grantClaim()
  agentCreated(harness, probe7b)
  probe7b.ctx = { get: (n) => (n === 'tools' ? failTools(record7b, probeSchemas, () => { attempts7b += 1; throw schemaError7 }) : undefined) }
  await stepProbe(harness, probe7b)
  await stepProbe(harness, probe7b)
  check('C7 JsonSchemaError 桩（name 为真实 JsonSchemaError）只尝试 1 次', attempts7b, 1)
}
// ── ⑥ R-code 系列:F1 桥接（run_code 内嵌套 ask 驱动状态机） ──────────────
// 嵌套事件 fixture（同 step-00 F-code 系形状）：dispatch-start 的 arguments 为对象形态，
// dispatch 的 content 直接是 ContentBlock 数组（无 tool-result 外层）。
// 事件名双兼容两代：0.1.5-rc.2 新名 = tool/ptc-dispatch-start / tool/ptc-dispatch；
// 0.1.2-rc.1 旧名 = tool/code-dispatch-start / tool/code-dispatch，均由 runDispatchSeriesE(ev) 注入。
const nestedRouteE = { questions: [{ id: 'q1', options: [{ label: '直接执行' }, { label: '进行pro规划' }, { label: '不同意' }] }] }
const nestedClarifyE = { questions: [{ id: 'q1', options: [{ label: '方案A' }, { label: '方案B' }] }] }
// 目的确认嵌套 fixture（第四锚点：route=plan 后、澄清之前的二选一）
const nestedPurposeE = { questions: [{ id: 'q1', options: [{ label: '完善方案' }, { label: '重新规划' }] }] }
const nestedApprovalE = { questions: [{ id: 'q1', options: [{ label: '同意执行' }, { label: '转交pro规划' }, { label: '不同意' }] }] }
const nestedCustomE = '{"answers":[{"id":"q1","custom":"改成XX"}]}'

function runDispatchSeriesE(ev) {
  const cdStartE = (name, sid, argsObj) => ({ type: ev.start, data: { rootCallId: 'r1', parentCallId: 'pc1', subCallId: sid, name, arguments: argsObj } })
  const cdEndE = (sid, text, isError = false) => ({ type: ev.end, data: { rootCallId: 'r1', parentCallId: 'pc1', subCallId: sid, name: 'ask_user_question', arguments: {}, isError, content: [{ type: 'text', text }] } })

const nestedDirectMain = mainWithEvents([umE(), cdStartE('ask_user_question', 'n1', nestedRouteE), cdEndE('n1', answerE(['直接执行']))])
const nestedPlanMain = mainWithEvents([umE(), cdStartE('ask_user_question', 'n1', nestedRouteE), cdEndE('n1', answerE(['进行pro规划'])), cdStartE('ask_user_question', 'n2', nestedPurposeE), cdEndE('n2', answerE(['完善方案'])), cdStartE('ask_user_question', 'n3', nestedClarifyE), cdEndE('n3', nestedCustomE)])
const nestedApproveMain = mainWithEvents([umE(), cdStartE('ask_user_question', 'n1', nestedRouteE), cdEndE('n1', answerE(['进行pro规划'])), cdStartE('ask_user_question', 'n2', nestedClarifyE), cdEndE('n2', answerE(['方案A'])), cdStartE('ask_user_question', 'n3', nestedApprovalE), cdEndE('n3', answerE(['同意执行']))])
const nestedPurposeNoneMain = mainWithEvents([umE(), cdStartE('ask_user_question', 'n1', nestedRouteE), cdEndE('n1', answerE(['不同意']))])
const nestedPurposeDirectMain = mainWithEvents([umE(), cdStartE('ask_user_question', 'n1', nestedRouteE), cdEndE('n1', answerE(['直接执行']))])
const nestedPurposeEscapeMain = mainWithEvents([umE(), callE('ask_user_question', 'outer1', routeArgsE), errE('outer1', 'NO_PROVIDER')])

r = preExecute(harness, nestedDirectMain, 'write', {})
checkTrue('R22 嵌套路由答「直接执行」→ write 放行（F1 桥接）', r !== null && r !== undefined && r.kind === 'allow')
r = preExecute(harness, nestedPlanMain, 'subagent_plan', {})
checkTrue('R23 嵌套路由 plan+嵌套澄清 → subagent_plan 放行（F1 桥接）', r !== null && r !== undefined && r.kind === 'allow')
r = preExecute(harness, nestedApproveMain, 'subagent', { run_in_background: true })
checkTrue('R24 嵌套批准「同意执行」→ subagent 委派放行（F1 桥接）', r !== null && r !== undefined && r.kind === 'allow')
r = preExecute(harness, nestedPurposeNoneMain, 'ask_user_question', nestedPurposeE)
checkTrue('R24a 嵌套 none 态精确目的 ask → deny 且含固定路由确认句', r !== null && r !== undefined && r.kind === 'deny' && String(r.reason).includes(ROUTE_CONFIRM_TEXT))
r = preExecute(harness, nestedPurposeDirectMain, 'ask_user_question', nestedPurposeE)
checkTrue('R24b 嵌套 direct 态精确目的 ask → deny 且含固定路由确认句', r !== null && r !== undefined && r.kind === 'deny' && String(r.reason).includes(ROUTE_CONFIRM_TEXT))
r = preExecute(harness, nestedPlanMain, 'ask_user_question', nestedPurposeE)
checkTrue('R24c 嵌套 plan 态精确目的 ask → allow', r !== null && r !== undefined && r.kind === 'allow')
r = preExecute(harness, nestedPurposeEscapeMain, 'ask_user_question', nestedPurposeE)
checkTrue('R24d 嵌套 channelBroken 精确目的 ask → allow（逃生）', r !== null && r !== undefined && r.kind === 'allow')

checkTrue('UC27 runCodeDispatchGateReason：18×→null / 19×→拒含「超过上限」 / 无rootCallId→null', (() => { const evs18 = Array.from({ length: 18 }, (_, i) => cdStartE('read', 's' + i, {})); const evs19 = evs18.concat([cdStartE('read', 's19', {})]); return runCodeDispatchGateReason(evs18, { rootCallId: 'r1' }, 18) === null && (() => { const got = runCodeDispatchGateReason(evs19, { rootCallId: 'r1' }, 18); return typeof got === 'string' && got.includes('超过上限') })() && runCodeDispatchGateReason(evs18, {}, 18) === null })())
}
runDispatchSeriesE({ start: 'tool/ptc-dispatch-start', end: 'tool/ptc-dispatch' })
if (process.env.EXTRA_PLAN_LEGACY_ROUND === '1') runDispatchSeriesE({ start: 'tool/code-dispatch-start', end: 'tool/code-dispatch' })

// ── ⑦ R-code 系列:F4 桥接（ptc 折叠目录只读判定退化为角色信号） ──────────
// ptc 折叠形态（wireSchemas 塌缩为仅 [run_code]）：修复前 executor 被误判只读恒拒 write；
// 修复后目录信号不可用 → 非 probe 默认放行（目录层 deny 兜底）。
const ptcExecutor = childAgent('ptc-executor-1')
await assemble(harness, ptcExecutor, [{ name: 'run_code' }])
r = preExecute(harness, ptcExecutor, 'write', {})
checkTrue('R25 ptc 折叠目录 executor write → 放行（F4 桥接：不再误判只读）', r !== null && r !== undefined && r.kind === 'allow')
// 只读目录（非折叠形态）：原判定路径不受影响，write → deny 且文案含「只读」
const roCatalogChild = childAgent('ro-catalog-1')
await assemble(harness, roCatalogChild, [{ name: 'read' }])
r = preExecute(harness, roCatalogChild, 'write', {})
checkTrue('R26 只读目录 write → deny 且文案含「只读」', r !== null && r !== undefined && r.kind === 'deny' && String(r.reason).includes('只读'))
// 含 write 目录（非折叠形态）：write → 放行
const rwCatalogChild = childAgent('rw-catalog-1')
await assemble(harness, rwCatalogChild, [{ name: 'read' }, { name: 'write' }])
r = preExecute(harness, rwCatalogChild, 'write', {})
checkTrue('R27 含 write 目录 write → 放行', r !== null && r !== undefined && r.kind === 'allow')

// ── ⑧ R-code 系列:F7'（run_code 统一审查关口） ────────────────────────────
const approvedBaseEvents = [umE(), callE('ask_user_question', 'a1', routeArgsE), okE('a1', answerE(['进行pro规划'])), callE('ask_user_question', 'a2', purposeArgsE), okE('a2', answerE(['完善方案'])), callE('ask_user_question', 'a3', clarifyArgsE), okE('a3', answerE(['方案A'])), callE('ask_user_question', 'a4', approvalArgsE), okE('a4', answerE(['同意执行']))]
const approvedMain = mainWithEvents(approvedBaseEvents)
const reselectDirectMain = mainWithEvents(approvedBaseEvents.concat([callE('ask_user_question', 'a5', routeArgsE), okE('a5', answerE(['直接执行']))]))
const reselectDisagreeMain = mainWithEvents(approvedBaseEvents.concat([callE('ask_user_question', 'a5', routeArgsE), okE('a5', answerE(['不同意']))]))
const reselectPlanMain = mainWithEvents(approvedBaseEvents.concat([callE('ask_user_question', 'a5', routeArgsE), okE('a5', answerE(['进行pro规划']))]))
const reselectPlanReadyMain = mainWithEvents(approvedBaseEvents.concat([callE('ask_user_question', 'a5', routeArgsE), okE('a5', answerE(['进行pro规划'])), callE('ask_user_question', 'a6', purposeArgsE), okE('a6', answerE(['重新规划'])), callE('ask_user_question', 'a7', clarifyArgsE), okE('a7', answerE(['方案B']))]))
const escapeMain = mainWithEvents([umE(), callE('ask_user_question', 'a1', routeArgsE), errE('a1', 'NO_PROVIDER')])
const writeCode = { code: "await writeFileSync('x', '1')", description: '写文件' }
const readOnlyCode = { code: "await readFileSync('x', 'utf8')", description: '只读' }

// 完整批准后重选路由必须清掉 approved；重选 plan 后目的必须重新确认，按 route→purpose→clarify 才恢复放行。
r = preExecute(harness, reselectDirectMain, 'subagent', { run_in_background: true })
checkTrue('R27a 完整批准后重选 direct → 执行类委派仍 deny（approved 清理）', r !== null && r !== undefined && r.kind === 'deny' && String(r.reason).includes('执行类委派未放行：subagent'))
r = preExecute(harness, reselectDisagreeMain, 'subagent', { run_in_background: true })
checkTrue('R27b 完整批准后重选不同意 → 执行类委派仍 deny（approved 清理）', r !== null && r !== undefined && r.kind === 'deny' && String(r.reason).includes('执行类委派未放行：subagent'))
r = preExecute(harness, reselectPlanMain, 'subagent', { run_in_background: true })
checkTrue('R27c 完整批准后重选 plan → 执行类委派仍 deny（approved 清理）', r !== null && r !== undefined && r.kind === 'deny' && String(r.reason).includes('执行类委派未放行：subagent'))
r = preExecute(harness, reselectPlanMain, 'save_probe', {})
checkTrue('R27d 重选 plan 后 save_probe → deny 且含「规划目的尚未确认」', r !== null && r !== undefined && r.kind === 'deny' && String(r.reason).includes('规划目的尚未确认'))
r = preExecute(harness, reselectPlanMain, 'subagent_plan', {})
checkTrue('R27e 重选 plan 后 subagent_plan → deny 且含「规划目的尚未确认」', r !== null && r !== undefined && r.kind === 'deny' && String(r.reason).includes('规划目的尚未确认'))
r = preExecute(harness, reselectPlanReadyMain, 'save_probe', {})
checkTrue('R27f 重选 plan 后按目的→澄清顺序 save_probe → allow', r !== null && r !== undefined && r.kind === 'allow')
r = preExecute(harness, reselectPlanReadyMain, 'subagent_plan', {})
checkTrue('R27g 重选 plan 后按目的→澄清顺序 subagent_plan → allow', r !== null && r !== undefined && r.kind === 'allow')

r = preExecute(harness, noneMain, 'run_code', readOnlyCode)
checkTrue('R28 主会话 none 态 run_code（纯只读）→ 放行（终版：无写模式放行，ptc 死锁解除）', r !== null && r !== undefined && r.kind === 'allow')
r = preExecute(harness, noneMain, 'run_code', writeCode)
checkTrue('R29 主会话 none 态 run_code（含写）→ deny 且聚合含 routeDenyReason(\'write/edit\', { route: \'none\' }) 全文（组判定聚合报错）', r !== null && r !== undefined && r.kind === 'deny' && String(r.reason).includes(routeDenyReason('write/edit', { route: 'none' }, gateRuntime)))
r = preExecute(harness, directMain, 'run_code', writeCode)
checkTrue('R30 主会话 direct 态 run_code（含写）→ 放行', r !== null && r !== undefined && r.kind === 'allow')
r = preExecute(harness, planMain, 'run_code', readOnlyCode)
checkTrue('R31 主会话 plan+clarified 态 run_code（纯只读）→ 放行（终版：无写模式放行）', r !== null && r !== undefined && r.kind === 'allow')
r = preExecute(harness, approvedMain, 'run_code', readOnlyCode)
checkTrue('R32 主会话 approved 态 run_code（纯只读）→ 放行（v4：组空全过，ptc 死锁解除）', r !== null && r !== undefined && r.kind === 'allow')
r = preExecute(harness, escapeMain, 'run_code', writeCode)
checkTrue('R33 主会话 channelBroken 逃生态 run_code → 放行（escape）', r !== null && r !== undefined && r.kind === 'allow')
r = preExecute(harness, plannerAgent, 'run_code', readOnlyCode)
checkTrue('R34 planner run_code 纯只读 → 放行', r !== null && r !== undefined && r.kind === 'allow')
r = preExecute(harness, plannerAgent, 'run_code', writeCode)
checkTrue('R35 planner run_code 含写 → deny 且文案含「只读角色仅允许只读探查」与「命中」', r !== null && r !== undefined && r.kind === 'deny' && String(r.reason).includes('只读角色仅允许只读探查') && String(r.reason).includes('命中'))
r = preExecute(harness, reviewer, 'run_code', writeCode)
checkTrue('R36 reviewer（只读目录）run_code 含写 → deny（同文案）', r !== null && r !== undefined && r.kind === 'deny' && String(r.reason).includes('只读角色仅允许只读探查'))
r = preExecute(harness, reviewer, 'run_code', readOnlyCode)
checkTrue('R37 reviewer run_code 纯只读 → 放行', r !== null && r !== undefined && r.kind === 'allow')
r = preExecute(harness, executor, 'run_code', writeCode)
checkTrue('R38 executor（含写目录）run_code 含写 → 放行（执行者豁免）', r !== null && r !== undefined && r.kind === 'allow')
r = preExecute(harness, ptcExecutor, 'run_code', writeCode)
checkTrue('R39 ptc 折叠目录 executor run_code 含写 → 放行（折叠默认放行）', r !== null && r !== undefined && r.kind === 'allow')
r = preExecute(harness, probeAgent, 'run_code', writeCode)
checkTrue('R40 probe（只读目录+放行记录）run_code 含写 → deny', r !== null && r !== undefined && r.kind === 'deny' && String(r.reason).includes('只读角色仅允许只读探查'))
r = preExecute(harness, fresh, 'run_code', writeCode)
checkTrue('R41 缓存未命中子代理 run_code → 放行（fail-open）', r !== null && r !== undefined && r.kind === 'allow')

// ── ⑨ R-ptc 系列:F7' 终版修订（ptc 死锁解除 + 嵌套瀑布等价） ───────────────
const nestedAskCode = { code: "const ans = await tools.ask_user_question({ questions: [{ id: 'q1', options: ['直接执行', '进行pro规划', '不同意'] }] })", description: '嵌套ask' }
const nestedPlanCode = { code: "await tools.subagent_plan({ task: '规划', run_in_background: true })", description: '嵌套规划委派' }
const nestedProbeCode = { code: "await tools.subagent_probe({ run_in_background: true })", description: '嵌套探查委派' }

r = preExecute(harness, noneMain, 'run_code', nestedAskCode)
checkTrue('R42 主会话 none 态 run_code（code 含未返回的嵌套 ask_user_question）→ deny（返回链闸门）', r !== null && r !== undefined && r.kind === 'deny' && String(r.reason).includes('结果未正确返回用户层'))
r = preExecute(harness, noneMain, 'run_code', nestedPlanCode)
checkTrue('R43 主会话 none 态 run_code（code 含嵌套 subagent_plan）→ deny 且含「子代理未放行：subagent_plan」（v4：组判定按直呼同闸门预审）', r !== null && r !== undefined && r.kind === 'deny' && String(r.reason).includes('子代理未放行：subagent_plan'))
r = preExecute(harness, noneMain, 'subagent_plan', { run_in_background: true })
checkTrue('R44 主会话 none 态直呼 subagent_plan（嵌套瀑布等价）→ deny 且文案含「子代理未放行：subagent_plan」（route 不符，与嵌套调用同文案）', r !== null && r !== undefined && r.kind === 'deny' && String(r.reason).includes('子代理未放行：subagent_plan'))
r = preExecute(harness, noneMain, 'run_code', nestedProbeCode)
checkTrue('R45 主会话 none 态 run_code（code 含嵌套 subagent_probe）→ 放行（外壳不拦嵌套探查委派）', r !== null && r !== undefined && r.kind === 'allow')
r = preExecute(harness, planMain, 'run_code', writeCode)
checkTrue('R46 主会话 plan+clarified 态 run_code（含写）→ deny 且聚合含 routeDenyReason(\'write/edit\', { route: \'plan\' }) 全文（含「规划态下主会话不可写文件」）', r !== null && r !== undefined && r.kind === 'deny' && String(r.reason).includes(routeDenyReason('write/edit', { route: 'plan' }, gateRuntime)))
r = preExecute(harness, approvedMain, 'run_code', writeCode)
checkTrue('R47 主会话 approved 态 run_code（含写）→ deny 且聚合含「方案已批准，执行请走 subagent 委派」', r !== null && r !== undefined && r.kind === 'deny' && String(r.reason).includes('方案已批准，执行请走 subagent 委派'))
r = preExecute(harness, approvedMain, 'run_code', { code: "await tools.subagent({ task: '执行', run_in_background: true })", description: '嵌套委派' })
checkTrue('R48 主会话 approved 态 run_code（code 含嵌套 tools.subagent(run_in_background:true)）→ 放行（v4：组判定 subagent 闸门 approved 放行，ptc 死锁解除）', r !== null && r !== undefined && r.kind === 'allow')
r = preExecute(harness, noneMain, 'run_code', { code: "await writeFileSync('x', '1'); await tools.subagent_plan({ task: '规划', run_in_background: true })", description: '多工具组' })
checkTrue('R49 主会话 none 态 run_code（裸写+subagent_plan 工具组）→ deny 且聚合同时含「路由未确认：write/edit」与「子代理未放行：subagent_plan」（多错误聚合）', r !== null && r !== undefined && r.kind === 'deny' && String(r.reason).includes('路由未确认：write/edit') && String(r.reason).includes('子代理未放行：subagent_plan'))
r = preExecute(harness, noneMain, 'run_code', { code: "try { await tools.read({ file_path: 'x' }) } catch (e) {}\ntry { await tools.read({ file_path: 'x' }) } catch (e) {}\ntry { await tools.subagent_probe({ run_in_background: true }) } catch (e) {}", description: '去重组（独立容错）' })
checkTrue('R50 主会话 none 态 run_code（read 去重×2+subagent_probe(run_in_background:true)）→ 放行（去重后全过）', r !== null && r !== undefined && r.kind === 'allow')
r = preExecute(harness, noneMain, 'run_code', { code: "await tools.write({ file_path: 'x', content: '1' })", description: '显式 write' })
checkTrue('R51 主会话 none 态 run_code（code 含显式 tools.write）→ deny 且聚合含「路由未确认：write/edit」（显式 write 成员与裸写同文案）', r !== null && r !== undefined && r.kind === 'deny' && String(r.reason).includes('路由未确认：write/edit'))

// ── ⑩ R52-R84：全闸门补测（预算修复与测试缺口 2026-09-05） ─────────────
// 预算耗尽场景：18 组成功配对 = 已用 18/18（修复A 成功配对口径；预算耗尽后 run_code 组判定仅放行全 FREE_TOOLS 白名单组）。
const budgetEvents = [DESC, ...Array.from({ length: 18 }, (_, i) => [callE('read', 'b' + i), okE('b' + i, 'ok')]).flat()]
const budgetPlanner = {
  session: { header: { id: 'planner-budget', origin: 'subagent', delegationDepth: 1, parentSession: 'parent-1', cwd: 'C:/work' }, snapshotEvents: () => budgetEvents },
  options: { model: 'deepseek-v4-pro' },
  ctx: undefined,
}
const planChildMain = mainWithEvents([umE(), callE('subagent_plan', 'p1', '{}'), okE('p1', '已启动规划子代理 3a7c1e5b-9d2f-4e8a-b6c4-1f0e9d8c7b6a，可 send_message 继续')])
const freeCode = { code: "try { await tools.save_plan({ plan: 'p', checklist: 'c' }) } catch (e) {}\ntry { await tools.send_message({ agent_id: 'parent', message: '收尾' }) } catch (e) {}", description: 'FREE_TOOLS 组' }
const readMemberCode = { code: "await tools.read({ file_path: 'x' })", description: '读成员' }
const smCode = { code: 'await tools.send_message({ "agent_id": "session-x", "message": "hi" })', description: 'send_message 成员' }
const joCode = { code: 'await tools.job_output({ "job_id": "j1", "wait": true })', description: 'job_output 成员' }
const revCode = { code: "await tools.subagent_review({ task: '验收', run_in_background: true })", description: 'subagent_review 成员' }

r = preExecute(harness, noneMain, 'subagent_review', {})
checkTrue('R52 subagent_review 无批准 → deny 且含「执行类委派未放行：subagent_review」', r !== null && r !== undefined && r.kind === 'deny' && String(r.reason).includes('执行类委派未放行：subagent_review'))
r = preExecute(harness, approvedMain, 'subagent_review', { run_in_background: true })
checkTrue('R53 subagent_review 批准放行 → allow', r !== null && r !== undefined && r.kind === 'allow')
r = preExecute(harness, approvedMain, 'subagent_review', {})
checkTrue('R54 subagent_review 缺后台 → deny 且含「执行者/reviewer 必须后台运行」', r !== null && r !== undefined && r.kind === 'deny' && String(r.reason).includes('执行者/reviewer 必须后台运行'))
r = preExecute(harness, noneMain, 'subagent_fork', {})
checkTrue('R55 subagent_fork 无批准 → deny 且含「执行类委派未放行：subagent_fork」', r !== null && r !== undefined && r.kind === 'deny' && String(r.reason).includes('执行类委派未放行：subagent_fork'))
r = preExecute(harness, noneMain, 'workflow', {})
checkTrue('R56 workflow 无批准 → deny 且含「执行类委派未放行：workflow」', r !== null && r !== undefined && r.kind === 'deny' && String(r.reason).includes('执行类委派未放行：workflow'))
r = preExecute(harness, noneMain, 'ralph', {})
checkTrue('R57 ralph 无批准 → deny 且含「执行类委派未放行：ralph」', r !== null && r !== undefined && r.kind === 'deny' && String(r.reason).includes('执行类委派未放行：ralph'))
r = preExecute(harness, approvedMain, 'subagent_fork', {})
checkTrue('R58 subagent_fork 批准放行 → allow', r !== null && r !== undefined && r.kind === 'allow')
r = preExecute(harness, approvedMain, 'workflow', {})
checkTrue('R59 workflow 批准放行 → allow', r !== null && r !== undefined && r.kind === 'allow')
r = preExecute(harness, approvedMain, 'ralph', {})
checkTrue('R60 ralph 批准放行 → allow', r !== null && r !== undefined && r.kind === 'allow')
r = preExecute(harness, noneMain, 'send_message', { agent_id: 'session-x', message: 'hi' })
checkTrue('R61 send_message 任意目标 → allow（白名单已删除）', r !== null && r !== undefined && r.kind === 'allow')
r = preExecute(harness, planChildMain, 'send_message', { agent_id: '3a7c1e5b-9d2f-4e8a-b6c4-1f0e9d8c7b6a', message: 'hi' })
checkTrue('R62 send_message planner 目标 → allow（白名单已删除后语义不变）', r !== null && r !== undefined && r.kind === 'allow')
r = preExecute(harness, mainAgent, 'job_output', { job_id: 'j1', wait: true })
checkTrue('R63 job_output wait → deny 且含「job_output 禁止带 wait: true」', r !== null && r !== undefined && r.kind === 'deny' && String(r.reason).includes('job_output 禁止带 wait: true'))
r = preExecute(harness, mainAgent, 'job_output', { job_id: 'j1' })
checkTrue('R64 job_output 正常 → allow（并 set 计数器，供 R65 查重）', r !== null && r !== undefined && r.kind === 'allow')
r = preExecute(harness, mainAgent, 'job_output', { job_id: 'j1' })
checkTrue('R65 job_output 同 job 重复 → deny 且含「job_output 禁止对同一 job 重复调用」', r !== null && r !== undefined && r.kind === 'deny' && String(r.reason).includes('job_output 禁止对同一 job 重复调用'))
r = preExecute(harness, mainAgent, 'job_output', { job_id: 'j2' })
checkTrue('R66 job_output 不同 job → allow', r !== null && r !== undefined && r.kind === 'allow')
r = preExecute(harness, noneMain, 'cordis_run', {})
checkTrue('R67 cordis_run 未确认 → deny 且含「路由未确认：cordis_run」', r !== null && r !== undefined && r.kind === 'deny' && String(r.reason).includes('路由未确认：cordis_run'))
r = preExecute(harness, approvedMain, 'cordis_run', {})
checkTrue('R68 cordis_run 批准放行 → allow', r !== null && r !== undefined && r.kind === 'allow')
r = preExecute(harness, noneMain, 'save_probe', { fileMap: [], focusAreas: [], exclusions: [], background: [] })
checkTrue('R69 save_probe 主会话 none 态 → deny 且含「子代理未放行：save_probe」', r !== null && r !== undefined && r.kind === 'deny' && String(r.reason).includes('子代理未放行：save_probe'))
r = preExecute(harness, planMain, 'save_probe', { fileMap: [], focusAreas: [], exclusions: [], background: [] })
checkTrue('R70 save_probe 主会话 plan 态但目的未定 → deny 且含「规划目的尚未确认」', r !== null && r !== undefined && r.kind === 'deny' && String(r.reason).includes('规划目的尚未确认'))
r = preExecute(harness, planPurposeMain, 'save_probe', { fileMap: [], focusAreas: [], exclusions: [], background: [] })
checkTrue('R70b save_probe 主会话 plan 态（目的已定+已澄清）→ allow', r !== null && r !== undefined && r.kind === 'allow')
r = preExecute(harness, budgetPlanner, 'read', {})
checkTrue('R71 planner 预算耗尽 listener 层 → deny 且含「探查预算已耗尽（本轮已用 18/18）」', r !== null && r !== undefined && r.kind === 'deny' && String(r.reason).includes('探查预算已耗尽（本轮已用 18/18）'))
r = preExecute(harness, budgetPlanner, 'run_code', freeCode)
checkTrue('R72 planner 预算耗尽 FREE_TOOLS 组 → allow（白名单放行）', r !== null && r !== undefined && r.kind === 'allow')
r = preExecute(harness, budgetPlanner, 'run_code', readMemberCode)
checkTrue('R73 planner 预算耗尽 非豁免组成员（read）→ deny 且含「探查预算已耗尽（本轮已用 18/18）」与「仅可调用 save_plan/send_message」', r !== null && r !== undefined && r.kind === 'deny' && String(r.reason).includes('探查预算已耗尽（本轮已用 18/18）') && String(r.reason).includes('仅可调用 save_plan/send_message'))
const emptyGroupCode = { code: 'const x = 1', description: '空组（无 tools 调用）' }
const dynamicMemberCode = { code: "const fn = 'read'\nawait tools[fn]({ file_path: 'x' })", description: '动态访问成员' }
const spOnlyCode = { code: 'await tools.save_plan({ "plan": "p", "checklist": "c" })', description: '仅 save_plan 成员' }
r = preExecute(harness, budgetPlanner, 'run_code', emptyGroupCode)
checkTrue('R74 planner 预算耗尽 空组（无 tools 调用）→ deny 且含「仅可调用 save_plan/send_message」', r !== null && r !== undefined && r.kind === 'deny' && String(r.reason).includes('探查预算已耗尽（本轮已用 18/18）') && String(r.reason).includes('仅可调用 save_plan/send_message'))
r = preExecute(harness, budgetPlanner, 'run_code', dynamicMemberCode)
checkTrue('R74b planner 预算耗尽 动态访问成员（tools[var]）→ deny 且含「仅可调用 save_plan/send_message」', r !== null && r !== undefined && r.kind === 'deny' && String(r.reason).includes('探查预算已耗尽（本轮已用 18/18）') && String(r.reason).includes('仅可调用 save_plan/send_message'))
r = preExecute(harness, budgetPlanner, 'run_code', spOnlyCode)
checkTrue('R75 planner 预算耗尽 仅 save_plan 单成员 → allow', r !== null && r !== undefined && r.kind === 'allow')
r = preExecute(harness, plannerAgent, 'pwsh', { command: 'New-Item x.txt' })
checkTrue('R76 planner pwsh 写 → deny 且「规划子代理只读：pwsh 仅限只读探查命令」', r !== null && r !== undefined && r.kind === 'deny' && String(r.reason).includes('规划子代理只读：pwsh 仅限只读探查命令'))
r = preExecute(harness, plannerAgent, 'bash', { command: 'rm -rf x' })
checkTrue('R77 planner bash 写 → deny 且「规划子代理只读：bash 仅限只读探查命令」', r !== null && r !== undefined && r.kind === 'deny' && String(r.reason).includes('规划子代理只读：bash 仅限只读探查命令'))
r = preExecute(harness, probeAgent, 'bash', { command: 'rm -rf x' })
checkTrue('R78 probe bash 写 → deny 且「探查者只读：bash 仅限只读探查命令」', r !== null && r !== undefined && r.kind === 'deny' && String(r.reason).includes('探查者只读：bash 仅限只读探查命令'))
r = preExecute(harness, plannerAgent, 'send_message', { agent_id: 'parent', message: 'hi' })
checkTrue('R79 planner send_message → allow（FREE_TOOLS 豁免）', r !== null && r !== undefined && r.kind === 'allow')
r = preExecute(harness, probeAgent, 'send_message', { agent_id: 'parent', message: 'hi' })
checkTrue('R80 probe send_message → allow（child 分支不拦）', r !== null && r !== undefined && r.kind === 'allow')
r = preExecute(harness, planMain, 'subagent_plan', { run_in_background: false })
checkTrue('R81 subagent_plan 目的未定+前台参数 → deny 且含「规划目的尚未确认」、不含「规划子代理不可前台等待」', r !== null && r !== undefined && r.kind === 'deny' && String(r.reason).includes('规划目的尚未确认') && !String(r.reason).includes('规划子代理不可前台等待'))
r = preExecute(harness, planPurposeMain, 'subagent_plan', { run_in_background: false })
checkTrue('R81b subagent_plan 目的已定+前台参数 → deny 且含「规划子代理不可前台等待」', r !== null && r !== undefined && r.kind === 'deny' && String(r.reason).includes('规划子代理不可前台等待'))
r = preExecute(harness, planPurposeMain, 'subagent_plan', {})
checkTrue('R81c subagent_plan 目的已定+不传参 → allow', r !== null && r !== undefined && r.kind === 'allow')
r = preExecute(harness, noneMain, 'cordis_inspect_query', {})
checkTrue('R82 cordis 只读族 → allow', r !== null && r !== undefined && r.kind === 'allow')
r = preExecute(harness, noneMain, 'run_code', smCode)
checkTrue('R83 组内 send_message 成员 → allow（白名单已删除，组判定放行）', r !== null && r !== undefined && r.kind === 'allow')
r = preExecute(harness, approvedMain, 'run_code', revCode)
checkTrue('R84 组内 subagent_review 成员（批准+后台）→ allow', r !== null && r !== undefined && r.kind === 'allow')
r = preExecute(harness, noneMain, 'run_code', joCode)
checkTrue('R85 组内 job_output wait 成员 → deny 且含「job_output 禁止带 wait: true」', r !== null && r !== undefined && r.kind === 'deny' && String(r.reason).includes('job_output 禁止带 wait: true'))
r = preExecute(harness, noneMain, 'run_code', revCode)
checkTrue('R86 组内 subagent_review 成员无批准 → deny 且含「执行类委派未放行：subagent_review」', r !== null && r !== undefined && r.kind === 'deny' && String(r.reason).includes('执行类委派未放行：subagent_review'))

// ── ⑭b T3：主会话 save_plan 受限规划工件（任意路由态放行，D8-B 口径） ──────
// 内容闸门与规划子代理共用同一 defineSavePlan 实现（强度一致），本节只锁路由闸门；
// save_plan 已移除路由态限制：mainGateReason 无显式分支，由兜底 return null 放行 —— 逐态锁定。
// 反面证据（不随本批放开）：write/edit → R29、cordis_run → R67、写 shell/subagent_plan/执行委派各节照旧。
const planUnclarifiedMain = mainWithEvents([umE(), callE('ask_user_question', 'a1', routeArgsE), okE('a1', answerE(['进行pro规划']))])
r = preExecute(harness, directMain, 'save_plan', { plan: 'p', checklist: 'c' })
checkTrue('T3-1 主会话 direct 态 save_plan → allow（受限工件）', r !== null && r !== undefined && r.kind === 'allow')
r = preExecute(harness, noneMain, 'save_plan', { plan: 'p', checklist: 'c' })
checkTrue('T3-2 主会话 none 态 save_plan → allow（路由态不再拦截）', r !== null && r !== undefined && r.kind === 'allow')
r = preExecute(harness, planUnclarifiedMain, 'save_plan', { plan: 'p', checklist: 'c' })
checkTrue('T3-3 主会话 plan 未澄清态 save_plan → allow（路由态不再拦截）', r !== null && r !== undefined && r.kind === 'allow')
r = preExecute(harness, planMain, 'save_plan', { plan: 'p', checklist: 'c' })
checkTrue('T3-4 主会话 plan 态(目的未定·未澄清) save_plan → allow（路由态不再拦截）', r !== null && r !== undefined && r.kind === 'allow')
r = preExecute(harness, approvedMain, 'save_plan', { plan: 'p', checklist: 'c' })
// 注：approved 是独立标志，deriveFlowState 的 route 仍为 'plan'；本态同样放行。
checkTrue('T3-5 主会话 approved 态 save_plan → allow', r !== null && r !== undefined && r.kind === 'allow')

// ── ⑭c T5：planner 不得委派探查者（subagent_probe 仅主会话可用） ───────────
// planner 身份由 events 含 subagent/descriptor(mode=continuable) 判定，路由态对其无意义；
// 三态各锁一次，确保拒绝不依赖路由（闸门只看 isPlanner）。
const plannerWithEvents = (events) => ({
  session: { header: { id: 'planner-1', origin: 'subagent', delegationDepth: 1, parentSession: 'parent-1', cwd: 'C:/work' }, snapshotEvents: () => [DESC, ...events] },
  options: { model: 'deepseek-v4-pro' },
  ctx: undefined,
})
const plannerProbeStates = [
  ['T5-1 planner none 态', plannerWithEvents([])],
  ['T5-2 planner plan+clarified 态', plannerWithEvents([umE(), callE('ask_user_question', 'a1', routeArgsE), okE('a1', answerE(['进行pro规划'])), callE('ask_user_question', 'a2', clarifyArgsE), okE('a2', answerE(['方案A']))])],
  ['T5-3 planner direct 态', plannerWithEvents([umE(), callE('ask_user_question', 'a1', routeArgsE), okE('a1', answerE(['直接执行']))])],
]
for (const [label, agent] of plannerProbeStates) {
  r = preExecute(harness, agent, 'subagent_probe', { run_in_background: true })
  checkTrue(label + ' 直呼 subagent_probe(run_in_background: true) → deny 且含「仅主会话可用」与「申请继续探查」', r !== null && r !== undefined && r.kind === 'deny' && String(r.reason).includes('仅主会话可用') && String(r.reason).includes('申请继续探查'))
}
r = preExecute(harness, plannerAgent, 'subagent_probe', {})
checkTrue('T5-4 planner 缺 run_in_background → 角色拒绝分支先命中（含「规划子代理不得委派探查者」，非 run_in_background 文案）', r !== null && r !== undefined && r.kind === 'deny' && String(r.reason).includes('规划子代理不得委派探查者') && !String(r.reason).includes('探查者必须后台运行'))
const nestedProbeGroupCode = { code: "await tools.subagent_probe({ run_in_background: true })", description: '嵌套探查委派' }
r = preExecute(harness, plannerAgent, 'run_code', nestedProbeGroupCode)
checkTrue('T5-5 planner 经 run_code 组内调用 subagent_probe 成员 → 聚合拒绝（含「仅主会话可用」与「申请继续探查」）', r !== null && r !== undefined && r.kind === 'deny' && String(r.reason).includes('run_code 拆解预审未通过') && String(r.reason).includes('仅主会话可用') && String(r.reason).includes('申请继续探查'))
r = preExecute(harness, noneMain, 'run_code', nestedProbeGroupCode)
checkTrue('T5-6 主会话 none 态 run_code 组内 subagent_probe → 仍放行（禁令只针对 planner）', r !== null && r !== undefined && r.kind === 'allow')

// ── ⑨ PTC/HN/HB 锚定基线（首轮按真实 phase、mode、role 分支） ─────────────
// 宿主 read tool 的注册 schema 复刻（registry mock）：F/PTC 不再渲染它，仅供工具过滤/mode 判定。
const PTC_READ_SCHEMA = {
  name: 'read',
  description: 'Read a UTF-8 text file and return line-numbered content.',
  parameters: { type: 'object', required: ['file_path'], properties: { file_path: { type: 'string', description: 'Path to read, resolved by the filesystem backend.' }, offset: { type: 'number', description: '1-based first line to return. Defaults to 1.' }, limit: { type: 'number', description: 'Maximum number of lines to return. Defaults to 2000.' } }, additionalProperties: false },
  output: { type: 'object', additionalProperties: true },
}
const PTC_BOOT_SCHEMAS = [PTC_READ_SCHEMA, { name: 'run_code', description: 'Run a program.', parameters: { type: 'object' }, output: { type: 'object', additionalProperties: true } }]
const ptcBootAgent = {
  session: { header: { id: 'ptc-boot-main', cwd: 'C:/work' }, snapshotEvents: () => [] },
  options: {},
  ctx: { get: (name) => name === 'tools' ? { schemas: () => PTC_BOOT_SCHEMAS, sdkSchemas: () => [PTC_READ_SCHEMA], modeFor: () => 'ptc' } : undefined },
}
const ptcBootSections = [
  // 宿主仍会下发 tools:ptc-only；插件 HP 分支已按用户要求停用该段透传（下方断言其不出现在产物中）。
  { name: 'tools:ptc-only', text: 'Only the run_code transport is directly callable.' },
  // 宿主 tool:read 原文（N/P/B 与 L 直通值）。F/PTC 由插件借槽覆盖为变量②手写文案，
  // 故此处刻意保持宿主原文：断言要求 F 段逐字等于 HINT_READ_DEFAULT 且不等于本夹具文本。
  { name: 'tool:read', text: HOST_READ_TEXT },
  { name: 'tools:sdk', text: 'Original SDK declarations should be replaced in HP.' },
  { name: 'matrix-user-section', text: 'ordinary section' },
]
const hpMain = await assemble(harnessBoot, ptcBootAgent, [{ name: 'run_code' }], ptcBootSections)
const hpRead = Array.isArray(hpMain.sections) ? hpMain.sections.find((section) => section.name === 'tool:read') : undefined
const hpReadText = hpRead !== undefined && typeof hpRead.text === 'string' ? hpRead.text : ''
check('P1 HP0 主会话首轮 tools 恰为 [run_code]', hpMain.tools.map((tool) => tool.name), ['run_code'])
check('P2 HP0 sections 恰为 persona/read 两项（宿主 tools:ptc-only 段已停用）', hpMain.sections.map((section) => section.name), ['extra-plan-bootstrap', 'tool:read'])
checkTrue('P3 HP0 无顶层 read、无 SDK/Cordis，contexts 清空', !hpMain.tools.some((tool) => tool.name === 'read') && !hpMain.sections.some((section) => section.name === 'tools:sdk' || section.name === 'tool:cordis') && Array.isArray(hpMain.contexts) && hpMain.contexts.length === 0)
check('P4 HP0 tool:read 逐字等于变量②手写文案（默认值）', hpReadText, HINT_READ_DEFAULT)
checkTrue('P4a HP0 tool:read 含四要素（tools.read/file_path/offset/limit/totalLines）且不含官方骨架与宿主原文',
  hintReadOk(hpReadText) && !hpReadText.includes('Use the read tool') && !CORDIS_PRESENTATION_TOOLS.some((name) => hpReadText.includes(name)))
checkTrue('P4b HP0 tool:read 不再由宿主原文/官方 renderer 生成（与直通夹具文本可区分）', hpReadText !== HOST_READ_TEXT && !hpReadText.includes('Use the read tool'))
const hpPlanner = { ...ptcBootAgent, session: { ...ptcBootAgent.session, header: { id: 'ptc-boot-planner', origin: 'subagent', delegationDepth: 1, parentSession: 'parent-1', cwd: 'C:/work' }, snapshotEvents: () => [DESC] } }
const hpPlannerAssembly = await assemble(harnessBoot, hpPlanner, [{ name: 'run_code' }], ptcBootSections)
check('P5 HP0 planner sections 恰为 persona/read 两项（宿主 tools:ptc-only 段已停用）', hpPlannerAssembly.sections.map((section) => section.name), ['extra-plan-bootstrap', 'tool:read'])
checkTrue('P6 HP0 planner 仍只暴露 run_code', hpPlannerAssembly.tools.map((tool) => tool.name).join('|') === 'run_code')

// ── ⑨b 变量② bootstrapReadHint：显式覆盖生效 / 空串与非字符串回退内置默认 ──
// 覆盖语义 = 只改模型可见副本的 tool:read text，宿主注册表与段名/透传均不动。
{
  const HINT_READ_EXPLICIT = '显式覆盖：在 run_code 程序里调用 tools.read({ file_path })；file_path 必填，offset 默认 1，limit 默认 2000，返回带行号的 lines。'
  const explicitHarness = makeHarness({ anchoredBootstrap: true, bootstrapReadHint: HINT_READ_EXPLICIT })
  const explicitAssembly = await assemble(explicitHarness, ptcBootAgent, [{ name: 'run_code' }], ptcBootSections)
  const explicitText = sectionText(explicitAssembly, 'tool:read')
  check('V2-1 显式 cfg.bootstrapReadHint 覆盖生效（HP tool:read 逐字等于该值）', explicitText, HINT_READ_EXPLICIT)
  checkTrue('V2-2 显式覆盖时段名与透传不变：sections 恰 persona/read、tools 仍 [run_code]、宿主 tools:ptc-only 不再下发',
    sectionNames(explicitAssembly).join('|') === 'extra-plan-bootstrap|tool:read'
    && explicitAssembly.tools.map((tool) => tool.name).join('|') === 'run_code'
    && !sectionNames(explicitAssembly).includes('tools:ptc-only')
    && sectionText(explicitAssembly, 'extra-plan-bootstrap') === 'You are a helpful software engineer assistant.')
  const emptyHarness = makeHarness({ anchoredBootstrap: true, bootstrapReadHint: '' })
  const emptyText = sectionText(await assemble(emptyHarness, ptcBootAgent, [{ name: 'run_code' }], ptcBootSections), 'tool:read')
  const nonStringHarness = makeHarness({ anchoredBootstrap: true, bootstrapReadHint: 42 })
  const nonStringText = sectionText(await assemble(nonStringHarness, ptcBootAgent, [{ name: 'run_code' }], ptcBootSections), 'tool:read')
  check('V2-3 空串 bootstrapReadHint → 回退内置默认文案', emptyText, HINT_READ_DEFAULT)
  check('V2-4 非字符串 bootstrapReadHint → 回退内置默认文案', nonStringText, HINT_READ_DEFAULT)
  checkTrue('V2-5 四个实例互不影响（默认/显式/空串/非字符串各自独立）', hpReadText === HINT_READ_DEFAULT && explicitText === HINT_READ_EXPLICIT && emptyText !== HINT_READ_EXPLICIT && nonStringText !== HINT_READ_EXPLICIT)
}
{
  const emptyBoot = await assemble(harnessBoot, mainAgent, [{ name: 'read' }, { name: 'glob' }])
  check('P7 无 shell 无 run_code → 跳过（tools 原样）', Array.isArray(emptyBoot.tools) ? emptyBoot.tools.map((t) => t.name).sort() : null, ['glob', 'read'])
  check('P8 无 shell 无 run_code → sections 原样（未注入 persona）', emptyBoot.sections, [])
}
{
  const bothMain = await assemble(harnessBoot, mainAgent, [{ name: 'read' }, { name: 'pwsh' }, { name: 'run_code' }, { name: 'write' }])
  check('P9 有 shell 目录 run_code 仍被滤掉（keep=shells+read 现状保持）', Array.isArray(bothMain.tools) ? bothMain.tools.map((t) => t.name).sort() : null, ['pwsh', 'read'])
  check('P10 有 shell 目录 sections 仍为极简 persona 单条', bothMain.sections, [{ name: 'extra-plan-bootstrap', text: 'You are a helpful software engineer assistant.' }])
}
{
  const ptcExecutor = await assemble(harnessBoot, executor, [{ name: 'run_code' }])
  check('P11 PTC executor 不引导（tools 原样 [run_code]）', Array.isArray(ptcExecutor.tools) ? ptcExecutor.tools.map((t) => t.name) : null, ['run_code'])
}


// ── ⑩b ASK 系列：主会话 ask 返回链闸门 + pre-execute 重入 ─────────────
const askReturnRunCases = [
  ['R-ASK1 裸 await ask → deny', 'await tools.ask_user_question({})', 'deny'],
  ['R-ASK2 只赋值不返回 → deny', 'const q = await tools.ask_user_question({})', 'deny'],
  ['R-ASK3 console.log 消费 → deny', 'console.log(await tools.ask_user_question({}))', 'deny'],
  ['R-ASK4 .then 包装 → deny', 'return await tools.ask_user_question({}).then((x) => x)', 'deny'],
  ['R-ASK5 工具别名 → deny', 'const ask = tools.ask_user_question; return await ask({})', 'deny'],
  ['R-ASK6 动态工具访问 → deny', "const name = 'ask_user_question'; return await tools[name]({})", 'deny'],
  ['R-ASK7 直接 return-await → allow', 'return await tools.ask_user_question({})', 'allow'],
  ['R-ASK8 单变量 JSON.stringify → allow', 'const q = await tools.ask_user_question({}); return JSON.stringify({ question: q })', 'allow'],
  ['R-ASK8b 单变量直接 return → allow', 'const q = await tools.ask_user_question({}); return q', 'allow'],
]
for (const [label, code, expectedKind] of askReturnRunCases) {
  r = preExecute(harness, noneMain, 'run_code', { code, description: label })
  const hasExamples = expectedKind === 'allow' || (r !== null && r !== undefined && String(r.reason).includes('结果未正确返回用户层'))
  checkTrue(label + '（默认 harness，闸门不依赖 runcodeCatchGate）', r !== null && r !== undefined && r.kind === expectedKind && hasExamples)
}

// 外层静态展开达到既有 depth 边界时先放行；实际内层带 parent 重新进入主会话 pre-execute，必须拒绝裸 await ask。
const nestedAskInnerCode = 'await tools.ask_user_question({})'
const nestedAskLevelOneCode = 'await tools.run_code({ "code": ' + JSON.stringify(nestedAskInnerCode) + ' })'
const nestedAskOuterCode = 'await tools.run_code({ "code": ' + JSON.stringify(nestedAskLevelOneCode) + ' })'
r = preExecute(harness, noneMain, 'run_code', { code: nestedAskOuterCode, description: '嵌套 ask 外层容器' })
checkTrue('R-ASK9 外层嵌套容器沿用 depth 边界 → allow', r !== null && r !== undefined && r.kind === 'allow')
r = preExecute(harness, noneMain, 'run_code', { code: nestedAskInnerCode, description: '嵌套 ask 实际内层' }, { rootCallId: 'nested-ask-root', parent: Symbol('nested-ask-parent') })
checkTrue('R-ASK10 带 parent 的实际内层裸 await ask 重入 → deny', r !== null && r !== undefined && r.kind === 'deny' && String(r.reason).includes('结果未正确返回用户层'))

// ── ⑪ UC 系列:runCodeCatchGateReason 纯函数（多调用容错硬闸门，任务1/3） ──
checkTrue('UC1 ≥2 无保护→拒', (() => { const got = runCodeCatchGateReason("await tools.read({ file_path: 'x' })\nawait tools.read({ file_path: 'y' })"); return typeof got === 'string' && got.includes('run_code 内 2 个工具调用未全部独立容错') && got.includes('已保护 0 个') })())
checkTrue('UC2 独立 try 全覆盖→null', runCodeCatchGateReason("try { await tools.read({ file_path: 'x' }) } catch (e) {}\ntry { await tools.read({ file_path: 'y' }) } catch (e) {}") === null)
checkTrue('UC3 allSettled→拒（只认逐点 try/catch）', (() => { const got = runCodeCatchGateReason("const r = await Promise.allSettled([tools.read({ file_path: 'x' }), tools.read({ file_path: 'y' })])"); return typeof got === 'string' && got.includes('未全部独立容错') && got.includes('已保护 0 个') })())
checkTrue('UC4 .catch 链→拒（只认逐点 try/catch）', (() => { const got = runCodeCatchGateReason("await tools.read({ file_path: 'x' }).catch(() => {})\nawait tools.read({ file_path: 'y' }).catch(() => {})"); return typeof got === 'string' && got.includes('未全部独立容错') && got.includes('已保护 0 个') })())
checkTrue('UC5 部分保护→拒', (() => { const got = runCodeCatchGateReason("try { await tools.read({ file_path: 'x' }) } catch (e) {}\nawait tools.read({ file_path: 'y' })"); return typeof got === 'string' && got.includes('已保护 1 个') })())
checkTrue('UC6 单调用→null', runCodeCatchGateReason("await tools.read({ file_path: 'x' })") === null)
checkTrue('UC7 裸写+单调用→null', runCodeCatchGateReason("await writeFileSync('x', '1'); await tools.read({ file_path: 'y' })") === null)
checkTrue('UC8 动态 tools[var] 计数→触发', (() => { const got = runCodeCatchGateReason("await tools.read({ file_path: 'x' })\nconst fn = 'glob'\nawait tools[fn]({ pattern: '**/*.md' })"); return typeof got === 'string' && got.includes('run_code 内 2 个工具调用未全部独立容错') })())
checkTrue('UC9 单 try 包 2 调用→拒', (() => { const got = runCodeCatchGateReason("try { await tools.read({ file_path: 'x' }); await tools.read({ file_path: 'y' }) } catch (e) {}"); return typeof got === 'string' && got.includes('已保护 0 个') })())
checkTrue('UC10 动态+.catch→拒（只认逐点 try/catch）', (() => { const got = runCodeCatchGateReason("await tools.read({ file_path: 'x' }).catch(() => {})\nconst fn = 'glob'\nawait tools[fn]({ pattern: '**/*.md' }).catch(() => {})"); return typeof got === 'string' && got.includes('未全部独立容错') && got.includes('已保护 0 个') })())
checkTrue('UC11 嵌套展平无保护→触发', (() => { const got = runCodeCatchGateReason("await tools.run_code({ \"code\": \"await tools.read({ file_path: 'x' })\" })\nawait tools.read({ file_path: 'y' })"); return typeof got === 'string' && got.includes('run_code 内 2 个工具调用未全部独立容错') })())
checkTrue('UC12 嵌套各自 try→null', runCodeCatchGateReason("await tools.run_code({ \"code\": \"try { await tools.read({ file_path: 'x' }) } catch (e) {}\" })\ntry { await tools.read({ file_path: 'y' }) } catch (e) {}") === null)
checkTrue('UC13 注释/字符串内 tools.x 不计数→null', runCodeCatchGateReason("const s = 'tools.read({ file_path: 1 })'\n// tools.write({})\nawait tools.glob({ pattern: '**/*.md' })") === null)
checkTrue("UC14 tools['read'] 字面量方括号计数→触发", (() => { const got = runCodeCatchGateReason("await tools['read']({ file_path: 'x' })\nawait tools['read']({ file_path: 'y' })"); return typeof got === 'string' && got.includes('run_code 内 2 个') })())
checkTrue('UC15 probeDisposalWarning(0)→null 且 (2)→含「2 个未认领探查者委派」与「委派方会话销毁时」（T5 文案中性化，不再硬编码「规划子代理会话销毁」）', probeDisposalWarning(0) === null && (() => { const got = probeDisposalWarning(2); return typeof got === 'string' && got.includes('2 个未认领探查者委派') && got.includes('委派方会话销毁时') && !got.includes('规划子代理会话销毁') })())
checkTrue('UC16 runcodeCatchGate:false → null（开关关纯函数）', runCodeGroupDenyReason(undefined, { name: 'run_code', arguments: { code: "await tools.read({ file_path: 'x' })\nawait tools.read({ file_path: 'y' })" } }, { kind: 'main' }, { runcodeCatchGate: false, gateRuntime }) === null)
checkTrue('UC17 显式 runcodeCatchGate:true → 拒且含「未全部独立容错」', (() => { const got = runCodeGroupDenyReason(undefined, { name: 'run_code', arguments: { code: "await tools.read({ file_path: 'x' })\nawait tools.read({ file_path: 'y' })" } }, { kind: 'main' }, { runcodeCatchGate: true, gateRuntime }); return typeof got === 'string' && got.includes('未全部独立容错') })())
checkTrue('UC18 safe 包装→拒（只认逐点 try/catch）', (() => { const got = runCodeCatchGateReason("const safe = (p) => p.catch((e) => ({ _error: String(e).slice(0, 200) }))\nawait safe(tools.read({ file_path: 'x' }))\ntry { await tools.read({ file_path: 'y' }) } catch (e) {}"); return typeof got === 'string' && got.includes('已保护 1 个') })())
checkTrue('UC19 safe 实参含 2 调用点 → 拒且含「已保护 0 个」', (() => { const got = runCodeCatchGateReason("const safe = (p) => p.catch((e) => ({ _error: String(e).slice(0, 200) }))\nawait safe(tools.read({ file_path: 'x' }).then(() => tools.read({ file_path: 'y' })))"); return typeof got === 'string' && got.includes('已保护 0 个') })())
checkTrue('UC20 空转 safe (p=>p) → 拒且含「已保护 0 个」', (() => { const got = runCodeCatchGateReason("const safe = (p) => p\nawait safe(tools.read({ file_path: 'x' }))\nawait tools.read({ file_path: 'y' })"); return typeof got === 'string' && got.includes('已保护 0 个') })())
checkTrue('UC21 非白名单包装（花括号 body）→ 拒且含「已保护 0 个」', (() => { const got = runCodeCatchGateReason("const wrap = (p) => { return p.catch((e) => ({})) }\nawait wrap(tools.read({ file_path: 'x' }))\nawait tools.read({ file_path: 'y' })"); return typeof got === 'string' && got.includes('已保护 0 个') })())
checkTrue('UC22 命名任意→拒（只认逐点 try/catch）', (() => { const got = runCodeCatchGateReason("const guard = (p) => p.catch((e) => ({ _error: String(e).slice(0, 200) }))\nawait guard(tools.read({ file_path: 'x' }))\ntry { await tools.read({ file_path: 'y' }) } catch (e) {}"); return typeof got === 'string' && got.includes('已保护 1 个') })())
checkTrue('UC23 嵌套 safe→拒（只认逐点 try/catch）', (() => { const got = runCodeCatchGateReason("const safe = (p) => p.catch((e) => ({ _error: String(e).slice(0, 200) }))\nawait safe(safe(tools.read({ file_path: 'x' })))\ntry { await tools.read({ file_path: 'y' }) } catch (e) {}"); return typeof got === 'string' && got.includes('已保护 1 个') })())
checkTrue('UC24 教学文案只讲逐点 try/catch', (() => { const got = runCodeCatchGateReason("await tools.read({ file_path: 'x' })\nawait tools.read({ file_path: 'y' })"); return typeof got === 'string' && got.includes('请给每个调用点各写一个独立 try/catch') && got.includes('写法示例：try { await tools.read({ file_path: "x" }) } catch (e) {}') })())
checkTrue('UC25 runCodeSiteCount：2 调用→2 / 嵌套展平→3', runCodeSiteCount("await tools.read({ file_path: 'x' })\nawait tools.read({ file_path: 'y' })") === 2 && runCodeSiteCount(String.raw`await tools.run_code({ "code": "await tools.read({ file_path: 'a' })\nawait tools.read({ file_path: 'b' })" })\nawait tools.read({ file_path: 'c' })`) === 3)
checkTrue('UC26 isRunCodeSubCall：parent→true / sub:true→true / 普通→false', isRunCodeSubCall({ parent: Symbol('p') }) === true && isRunCodeSubCall({ sub: true }) === true && isRunCodeSubCall({ name: 'read' }) === false)

// ── ⑫ R87-R93：多调用容错硬闸门监听器级（任务3） ──
r = preExecute(harnessCatchOn, noneMain, 'run_code', { code: "await tools.read({ file_path: 'x' })\nawait tools.read({ file_path: 'y' })", description: 'UC1 同款' })
checkTrue('R87 runcodeCatchGate:true 主会话 none 态多调用无容错 → deny 且含「未全部独立容错」', r !== null && r !== undefined && r.kind === 'deny' && String(r.reason).includes('未全部独立容错'))
r = preExecute(harness, noneMain, 'run_code', { code: "const r = await Promise.allSettled([tools.read({ file_path: 'x' }), tools.read({ file_path: 'y' })])", description: 'UC3 同款' })
checkTrue('R88 主会话 none 态 allSettled → allow', r !== null && r !== undefined && r.kind === 'allow')
r = preExecute(harnessCatchOn, plannerAgent, 'run_code', { code: "await tools.read({ file_path: 'x' })\nawait tools.read({ file_path: 'y' })", description: 'UC1 同款' })
checkTrue('R89 runcodeCatchGate:true planner 多调用无容错 → deny 且含「未全部独立容错」', r !== null && r !== undefined && r.kind === 'deny' && String(r.reason).includes('未全部独立容错'))
await assemble(harnessCatchOn, probeAgent, [{ name: 'read' }, { name: 'glob' }, { name: 'grep' }, { name: 'pwsh' }, { name: 'save_probe' }])
r = preExecute(harnessCatchOn, probeAgent, 'run_code', { code: "await tools.read({ file_path: 'x' })\nawait tools.read({ file_path: 'y' })", description: 'UC1 同款' })
checkTrue('R90 runcodeCatchGate:true probe（只读 child）多调用无容错 → deny 且含「未全部独立容错」', r !== null && r !== undefined && r.kind === 'deny' && String(r.reason).includes('未全部独立容错'))
r = preExecute(harness, noneMain, 'run_code', { code: "try { await tools.read({ file_path: 'x' }) } catch (e) {}\ntry { await tools.read({ file_path: 'x' }) } catch (e) {}\ntry { await tools.subagent_probe({ run_in_background: true }) } catch (e) {}", description: '去重组（独立容错）' })
checkTrue('R91 R50 改造后 → allow（去重后全过语义保持）', r !== null && r !== undefined && r.kind === 'allow')
r = preExecute(harness, executor, 'run_code', { code: "await tools.read({ file_path: 'x' })\nawait tools.read({ file_path: 'y' })", description: 'UC1 同款' })
checkTrue('R92 executor 多调用无容错 → allow（执行者豁免）', r !== null && r !== undefined && r.kind === 'allow')
r = preExecute(harnessCatchOn, noneMain, 'run_code', { code: "await tools.run_code({ \"code\": \"await tools.read({ file_path: 'x' })\" })\nawait tools.read({ file_path: 'y' })", description: 'UC11 同款' })
checkTrue('R93 runcodeCatchGate:true 主会话 none 态嵌套展平无容错 → deny 且含「未全部独立容错」', r !== null && r !== undefined && r.kind === 'deny' && String(r.reason).includes('未全部独立容错'))

// ── ⑬ R94-R99：job_output 全角色 wait 禁令/查重（任务4/5） ──
r = preExecute(harness, plannerAgent, 'job_output', { job_id: 'j1', wait: true })
checkTrue('R94 planner job_output wait → deny 且含「job_output 禁止带 wait: true」', r !== null && r !== undefined && r.kind === 'deny' && String(r.reason).includes('job_output 禁止带 wait: true'))
r = preExecute(harness, reviewer, 'job_output', { job_id: 'j1', wait: true })
checkTrue('R95 reviewer job_output wait → deny 且含「job_output 禁止带 wait: true」', r !== null && r !== undefined && r.kind === 'deny' && String(r.reason).includes('job_output 禁止带 wait: true'))
r = preExecute(harness, plannerAgent, 'job_output', { job_id: 'j1' })
checkTrue('R96 planner job_output 正常 → allow', r !== null && r !== undefined && r.kind === 'allow')
r = preExecute(harness, plannerAgent, 'job_output', { job_id: 'j1' })
checkTrue('R96b planner 同 job 再调 → deny 且含「job_output 禁止对同一 job 重复调用」', r !== null && r !== undefined && r.kind === 'deny' && String(r.reason).includes('job_output 禁止对同一 job 重复调用'))
r = preExecute(harness, plannerAgent, 'job_output', { job_id: 'j2' })
checkTrue('R96c planner 不同 job → allow', r !== null && r !== undefined && r.kind === 'allow')
r = preExecute(harness, probeAgent, 'job_output', { job_id: 'j1' })
checkTrue('R97 probeAgent job_output 正常 → allow', r !== null && r !== undefined && r.kind === 'allow')
r = preExecute(harness, executor, 'job_output', { job_id: 'j1', wait: true })
checkTrue('R98 executor job_output wait → allow（执行者豁免保持）', r !== null && r !== undefined && r.kind === 'allow')
r = preExecute(harness, plannerAgent, 'run_code', joCode)
checkTrue('R99 planner run_code 组内 job_output wait → deny 且含「job_output 禁止带 wait: true」', r !== null && r !== undefined && r.kind === 'deny' && String(r.reason).includes('job_output 禁止带 wait: true'))

// ── ⑭d 可变事件流 tool-jobs 完成通知解锁（任务4） ──────────────────────
{
  const sharedEvents = []
  const mutableMain = {
    session: { header: { id: 'mutable-main', cwd: 'C:/work' }, snapshotEvents: () => sharedEvents },
    options: {},
    ctx: undefined,
  }
  // 首次 job_output j1 → allow
  r = preExecute(harness, mutableMain, 'job_output', { job_id: 'j1' })
  checkTrue('TJ1 可变事件流 job_output j1 首次 → allow', r !== null && r !== undefined && r.kind === 'allow')
  // 无通知时同 job 再调 → deny（回归）
  r = preExecute(harness, mutableMain, 'job_output', { job_id: 'j1' })
  checkTrue('TJ2 可变事件流 job_output j1 无通知再调 → deny', r !== null && r !== undefined && r.kind === 'deny' && String(r.reason).includes('job_output 禁止对同一 job 重复调用'))
  // 注入 tool-jobs 完成通知事件
  sharedEvents.push({
    type: 'user/message',
    data: {
      // 0.1.7 换代：dsh-tool-jobs 的完成通知源为 { kind:'tool-jobs', form:'notice' }（旧 plugin 兜底 kind 已废）。
      source: { kind: 'tool-jobs', form: 'notice' },
      content: [{ type: 'text', text: 'background job j1 (subagent: test) finished [status: completed]. Read its output with job_output.' }],
    },
  })
  // 通知注入后 job_output j1 → allow（修复生效）
  r = preExecute(harness, mutableMain, 'job_output', { job_id: 'j1' })
  checkTrue('TJ3 可变事件流 tool-jobs 通知后 job_output j1 → allow（修复生效）', r !== null && r !== undefined && r.kind === 'allow')
}

// ── ⑭ R100-R105：runcodeCatchGate 开关 + safe 白名单 + 容器计费 + 实例上限（2026-09-06） ──
r = preExecute(harness, noneMain, 'run_code', { code: "await tools.read({ file_path: 'x' })\nawait tools.read({ file_path: 'y' })", description: 'UC1 同款' })
checkTrue('R100 默认（runcodeCatchGate 缺省=关）多调用无容错 → allow（默认关放行）', r !== null && r !== undefined && r.kind === 'allow')
r = preExecute(harnessCatchOn, noneMain, 'run_code', { code: "await tools.read({ file_path: 'x' })\nawait tools.read({ file_path: 'y' })", description: 'UC1 同款' })
checkTrue('R100b runcodeCatchGate:true 多调用无容错 → deny 且含「未全部独立容错」', r !== null && r !== undefined && r.kind === 'deny' && String(r.reason).includes('未全部独立容错'))
r = preExecute(harness, noneMain, 'run_code', { code: "const safe = (p) => p.catch((e) => ({ _error: String(e).slice(0, 200) }))\nawait safe(tools.read({ file_path: 'x' }))\ntry { await tools.read({ file_path: 'y' }) } catch (e) {}", description: 'UC18 同款' })
checkTrue('R101 safe 白名单监听器级 → allow', r !== null && r !== undefined && r.kind === 'allow')
r = preExecute(harnessCatchOn, noneMain, 'run_code', { code: "const safe = (p) => p.catch((e) => ({ _error: String(e).slice(0, 200) }))\nawait safe(tools.read({ file_path: 'x' }).then(() => tools.read({ file_path: 'y' })))", description: 'UC19 同款' })
checkTrue('R102 runcodeCatchGate:true safe 实参 2 调用点 → deny 且含「已保护 0 个」', r !== null && r !== undefined && r.kind === 'deny' && String(r.reason).includes('已保护 0 个'))
r = preExecute(harness, budgetPlanner, 'read', { file_path: 'x' }, { rootCallId: 'r9', parent: Symbol('r101') })
checkTrue('R103 planner 子调用（语义）预算 → allow（容器计费）', r !== null && r !== undefined && r.kind === 'allow')
{
  const dgExec = () => ({ rootCallId: 'r1', parent: Symbol('r102') })
  let r102Ok = true
  for (let i = 1; i <= 100; i += 1) {
    const rr = preExecute(harness, budgetPlanner, 'read', { file_path: 'x' }, dgExec())
    if (i <= 18 && !(rr !== null && rr !== undefined && rr.kind === 'allow')) r102Ok = false
    if (i >= 19 && !(rr !== null && rr !== undefined && rr.kind === 'deny' && String(rr.reason).includes('超过上限'))) r102Ok = false
  }
  checkTrue('R104 单实例子调用循环 100 次 → i≤18 allow、i≥19 deny 且含「超过上限」', r102Ok)
}
{
  const plannerMock = plannerAgent
  const longCode = Array.from({ length: 19 }, (_, i) => "await tools.read({ file_path: 'x" + i + "' })").join('\n')
  r = preExecute(harness, plannerMock, 'run_code', { code: longCode, description: '19 行 read 调用' })
  checkTrue('R105 planner 静态调用点 19 处 → deny 且含「超过单实例子调用上限」', r !== null && r !== undefined && r.kind === 'deny' && String(r.reason).includes('超过单实例子调用上限'))
}


const rcBridgePlannerCode = 'await tools.write({})\nawait tools.subagent_probe({})'
r = preExecute(harness, plannerAgent, 'run_code', { code: rcBridgePlannerCode, description: 'R106 planner 组判定桥接' })
const rcBridgeReason = r !== null && r !== undefined && r.kind === 'deny' ? String(r.reason) : ''
checkTrue('R106 planner run_code write+subagent_probe → 聚合两项拒绝且成员顺序 write→subagent_probe', r !== null && r !== undefined && r.kind === 'deny' && rcBridgeReason.includes('工具组共 2 项（去重后），2 项触发闸门') && rcBridgeReason.includes('规划子代理只读') && rcBridgeReason.includes('仅主会话可用') && rcBridgeReason.indexOf('- write:') < rcBridgeReason.indexOf('- subagent_probe:'))
r = preExecute(harness, noneMain, 'run_code', { code: 'await tools.save_plan({})\nawait tools.write({})', description: 'R107 noneMain 组判定：save_plan 放行 + write 仍拒' })
const rc107Reason = r !== null && r !== undefined && r.kind === 'deny' ? String(r.reason) : ''
checkTrue('R107 noneMain run_code save_plan+write → 组内 save_plan 放行、write 仍拒 → 聚合 deny（2 项 1 项触发，不含 save_plan 行）', r !== null && r !== undefined && r.kind === 'deny' && rc107Reason.includes('工具组共 2 项（去重后），1 项触发闸门') && rc107Reason.includes(routeDenyReason('write/edit', { route: 'none' }, gateRuntime)) && rc107Reason.includes('- write:') && rc107Reason.includes('save_plan') === false)

// ── ⑭e P0-4：会话状态生命周期 + 末轮 usage final flush（T2/T3/T4 监听器级） ──
// 口径：账本用例显式传 config.usageLedger.enabled=true + 临时 config.usageLedger.path；
// disposed 断言在监听器同步返回后立即读盘（宿主 agent/disposed 是 emit/void、不等待 Promise）；
// console.warn 局部捕获（临时替换 + finally 还原）；全部临时文件在 finally 删除。
const plannerWithId = (id, events) => ({
  session: { header: { id, origin: 'subagent', delegationDepth: 1, parentSession: 'parent-1', cwd: 'C:/work' }, snapshotEvents: () => events, append: () => {} },
  options: { model: 'deepseek-v4-pro' },
  ctx: undefined,
})
const childWithId = (id, events) => ({
  session: { header: { id, origin: 'subagent', delegationDepth: 1, parentSession: 'parent-1', cwd: 'C:/work' }, snapshotEvents: () => events, append: () => {} },
  options: {},
  ctx: undefined,
})
const agentCreatedListener = (listeners, agent) => {
  const entry = listeners['agent/created']
  if (entry === undefined || entry.length === 0) throw new Error('agent/created 监听器未注册')
  return entry[0]({ agent, source: 'startup' })
}
const disposedListener = (listeners, agent) => {
  const entry = listeners['agent/disposed']
  if (entry === undefined || entry.length === 0) throw new Error('agent/disposed 监听器未注册')
  return entry[0]({ agent })
}
const subCall = (listeners, agent, rid, tag) => preExecute(listeners, agent, 'read', { file_path: 'x' }, { rootCallId: rid, parent: Symbol(tag) })
// opts = 第 6 参数（可含 provider / cacheWriteTokens / reasoningTokens）：只写显式提供的键，
// 未提供时保持旧行形状（缺字段 → 账本按 空串/0/0 缺省）；现有调用点一律补 {}。
const usageRowE = (seq, hit, miss, out, model, opts) => {
  const o = opts === undefined || opts === null ? {} : opts
  const usage = { cacheReadTokens: hit, inputTokens: miss, outputTokens: out }
  if (o.cacheWriteTokens !== undefined) usage.cacheWriteTokens = o.cacheWriteTokens
  if (o.reasoningTokens !== undefined) usage.reasoningTokens = o.reasoningTokens
  const source = { model }
  if (o.provider !== undefined) source.provider = o.provider
  return { type: 'assistant/message', seq, data: { usage, message: { source } } }
}
const readLedgerRows = (path) => existsSync(path) ? readFileSync(path, 'utf8').split(String.fromCharCode(10)).filter((line) => line.trim() !== '').map((line) => JSON.parse(line)) : []
const captureWarnings = (fn) => {
  const original = console.warn
  const messages = []
  console.warn = (message) => { messages.push(String(message)) }
  try { fn() } finally { console.warn = original }
  return messages
}
const captureFilteredSdkWarnings = async (fn) => {
  const original = console.warn
  const messages = []
  console.warn = (...args) => {
    const message = args.map((arg) => String(arg)).join(' ')
    if (message.includes('extra-plan: filtered tools:sdk render failed')) messages.push(message)
    else original(...args)
  }
  try {
    await fn()
  } finally {
    console.warn = original
  }
  return messages
}
const cursorWarnings = (messages) => messages.filter((message) => message.includes('usage cursor JSON'))
const makeTmpDir = () => mkdtempSync(join(tmpdir(), 'extra-plan-p4-'))

// P4-1/P4-2：源码级不变量（T2.2/T3.1/T3.5/T4.1/T4.7）
const pluginSource = readFileSync(PLUGIN_PATH, 'utf8')
const agentRuntimeSource = readFileSync(AGENT_RUNTIME_PATH, 'utf8')
const shellMutationSource = readFileSync(SHELL_MUTATION_PATH, 'utf8')
checkTrue('P4-1 源码：无 usageCursorsLoaded 灌表路径、无 subCallCounters.clear()、foldUsage 非 async、计数走 noteRunCodeSubCall',
  !pluginSource.includes('usageCursorsLoaded') && !pluginSource.includes('subCallCounters.clear()') && !pluginSource.includes('async function foldUsage') && pluginSource.includes('function noteRunCodeSubCall(sessionId, rid)'))
checkTrue('P4-2 源码：disposed 先同步 fold，再按 sessionId 删除；agent runtime 独立持有角色 WeakMap 与同步 floor',
  pluginSource.includes('foldUsage(agent, usageRoleOf(agent))')
  && pluginSource.indexOf('foldUsage(agent, usageRoleOf(agent))') < pluginSource.indexOf('jobOutputCallCounters.delete(sessionId)')
  && !pluginSource.includes('const usageRoles = new WeakMap()')
  && agentRuntimeSource.includes('const usageRoles = new WeakMap()')
  && agentRuntimeSource.includes('foldUsage(agent, role)')
  && agentRuntimeSource.includes("error.code === 'ENOENT'") || pluginSource.includes("error.code === 'ENOENT'"))

// P4-3：两个 session 同 rootCallId 各自 1~18 allow、19 deny（计数按 session 隔离）
{
  const pA = plannerWithId('p4-iso-A', [DESC])
  const pB = plannerWithId('p4-iso-B', [DESC])
  let isoOk = true
  for (let i = 1; i <= 19; i += 1) {
    const ra = subCall(harness, pA, 'rc-iso', 'isoA')
    const rb = subCall(harness, pB, 'rc-iso', 'isoB')
    if (i <= 18 && !(ra.kind === 'allow' && rb.kind === 'allow')) isoOk = false
    if (i >= 19 && !(ra.kind === 'deny' && rb.kind === 'deny' && String(ra.reason).includes('超过上限') && String(ra.reason).includes('子调用数 19') && String(rb.reason).includes('子调用数 19'))) isoOk = false
  }
  checkTrue('P4-3 两 session 同 rootCallId：各自 1~18 allow、第 19 次 deny 且文案含「子调用数 19 … 超过上限」（计数按 session 隔离）', isoOk)
}

// P4-4/P4-5：session B 锚点变化不清空 session A 的计数；B 自身从 0 重开
{
  const evA = [DESC]
  const evB = [DESC]
  const pA = plannerWithId('p4-anchor-A', evA)
  const pB = plannerWithId('p4-anchor-B', evB)
  let aOk = true
  for (let i = 1; i <= 18; i += 1) { if (subCall(harness, pA, 'rc-anchor', 'anchorA').kind !== 'allow') aOk = false }
  const a19 = subCall(harness, pA, 'rc-anchor', 'anchorA')
  let bOk = true
  for (let i = 1; i <= 5; i += 1) { if (subCall(harness, pB, 'rc-anchor', 'anchorB').kind !== 'allow') bOk = false }
  evB.push(umE())
  const bAfterAnchor = subCall(harness, pB, 'rc-anchor', 'anchorB')
  const aAfterAnchor = subCall(harness, pA, 'rc-anchor', 'anchorA')
  checkTrue('P4-4 session B 锚点变化后 A 已累计次数不变（A 下一次仍 deny 且含「子调用数 19」），B 自身首调 allow（只删当前 session 桶）',
    aOk && bOk && a19.kind === 'deny' && bAfterAnchor.kind === 'allow' && aAfterAnchor.kind === 'deny' && String(aAfterAnchor.reason).includes('子调用数 19'))
  let bRestartOk = true
  for (let i = 1; i <= 17; i += 1) { if (subCall(harness, pB, 'rc-anchor', 'anchorB').kind !== 'allow') bRestartOk = false }
  const b19 = subCall(harness, pB, 'rc-anchor', 'anchorB')
  checkTrue('P4-5 锚点变化后的 session B 从 0 重新计数：再 17 次仍 allow、第 19 次 deny', bRestartOk && b19.kind === 'deny' && String(b19.reason).includes('子调用数 19'))
}

// P4-6/P4-7：disposed A 后同 sessionId 新建 agent 状态从空开始；B 的计数保持
{
  const evA = [DESC]
  const evB = [DESC]
  const dA = plannerWithId('p4-disp-A', evA)
  const dB = plannerWithId('p4-disp-B', evB)
  let aOk = true
  for (let i = 1; i <= 18; i += 1) { if (subCall(harness, dA, 'rc-disp', 'dispA').kind !== 'allow') aOk = false }
  let bOk = true
  for (let i = 1; i <= 5; i += 1) { if (subCall(harness, dB, 'rc-disp', 'dispB').kind !== 'allow') bOk = false }
  const jFirst = preExecute(harness, dA, 'job_output', { job_id: 'job-p4-disp' })
  const jSecond = preExecute(harness, dA, 'job_output', { job_id: 'job-p4-disp' })
  disposedListener(harness, dA)
  const dA2 = plannerWithId('p4-disp-A', evA)
  const jAfter = preExecute(harness, dA2, 'job_output', { job_id: 'job-p4-disp' })
  let a2Ok = true
  for (let i = 1; i <= 18; i += 1) { if (subCall(harness, dA2, 'rc-disp', 'dispA2').kind !== 'allow') a2Ok = false }
  const a2Deny = subCall(harness, dA2, 'rc-disp', 'dispA2')
  checkTrue('P4-6 disposed A 后同 sessionId 新建 agent：job_output 查重从空开始（首调 allow，此前重复 deny）与 rootCall 从 0 计数（18 次 allow、第 19 次 deny）',
    aOk && bOk && jFirst.kind === 'allow' && jSecond.kind === 'deny' && jAfter.kind === 'allow' && a2Ok && a2Deny.kind === 'deny')
  let bKeepOk = true
  for (let i = 1; i <= 13; i += 1) { if (subCall(harness, dB, 'rc-disp', 'dispB').kind !== 'allow') bKeepOk = false }
  const b19 = subCall(harness, dB, 'rc-disp', 'dispB')
  checkTrue('P4-7 disposed A 不影响 session B：B 第 6~18 次仍 allow、第 19 次 deny 且含「子调用数 19」', bKeepOk && b19.kind === 'deny' && String(b19.reason).includes('子调用数 19'))
}

// P4-8~P4-13：one-shot 末轮 flush、重复 disposed 幂等、同 session 续载去重（临时账本目录）
{
  const dir = makeTmpDir()
  try {
    const ledger = join(dir, 'usage-ledger.jsonl')
    const h = makeHarness({ anchoredBootstrap: false, usageLedger: { enabled: true, path: ledger } })
    const events = []
    const child = childWithId('p4-oneshot', events)
    agentCreatedListener(h, child)
    checkTrue('P4-8 session-start 无 usage → 不写 ledger 行（cursor 亦不落盘）', !existsSync(ledger) && !existsSync(ledger + '.cursor.json'))
    events.push(usageRowE(42, 10, 20, 30, 'deepseek-v4-pro', {}))
    const listenerReturn = disposedListener(h, child)
    const rows = readLedgerRows(ledger)
    checkTrue('P4-9 disposed 同步返回后立即读到末轮行：恰 1 行且 seq=42/hit=10/miss=20/out=30/model 正确/role=executor/provider 空串/cacheWriteTokens=0/reasoningTokens=0，监听器返回非 Promise',
      rows.length === 1 && rows[0].sessionId === 'p4-oneshot' && rows[0].role === 'executor' && rows[0].seq === 42 && rows[0].hit === 10 && rows[0].miss === 20 && rows[0].out === 30 && rows[0].model === 'deepseek-v4-pro' && rows[0].provider === '' && rows[0].cacheWriteTokens === 0 && rows[0].reasoningTokens === 0 && !(listenerReturn instanceof Promise))
    disposedListener(h, child)
    checkTrue('P4-10 重复 disposed 不重复追加 final usage（仍 1 行，靠持久 cursor 去重）', readLedgerRows(ledger).length === 1)
    events.push(usageRowE(50, 1, 2, 3, 'deepseek-v4-reasoner', {}))
    const revived = childWithId('p4-oneshot', events)
    agentCreatedListener(h, revived)
    const rows2 = readLedgerRows(ledger)
    checkTrue('P4-11 同 sessionId 续载（disposed 后内存项已删）：旧 seq 42 不重写、新 seq 50 恰写一次，且新行 provider 空串/cacheWriteTokens=0/reasoningTokens=0',
      rows2.length === 2 && rows2[0].seq === 42 && rows2[1].seq === 50 && rows2[1].model === 'deepseek-v4-reasoner' && rows2[1].role === 'executor' && rows2[1].provider === '' && rows2[1].cacheWriteTokens === 0 && rows2[1].reasoningTokens === 0)
    disposedListener(h, revived)
    checkTrue('P4-12 续载后再次 disposed 仍幂等（ledger 仍 2 行）', readLedgerRows(ledger).length === 2)
    const table = JSON.parse(readFileSync(ledger + '.cursor.json', 'utf8'))
    checkTrue('P4-13 持久 cursor 保留去重基准（本 session seq=50）而内存活跃项已随 disposed 回收', table['p4-oneshot'] !== undefined && table['p4-oneshot'].seq === 50 && table['p4-oneshot'].index === 2)
  } finally { rmSync(dir, { recursive: true, force: true }) }
}

// P4-14/P4-15：final fold 的 role 取缓存 WeakMap；无缓存时走稳定兜底
{
  const dir = makeTmpDir()
  try {
    const ledger = join(dir, 'usage-ledger.jsonl')
    const h = makeHarness({ anchoredBootstrap: false, usageLedger: { enabled: true, path: ledger } })
    const plannerEvents = [DESC]
    const planner = plannerWithId('p4-planner-role', plannerEvents)
    agentCreatedListener(h, planner)
    plannerEvents.push(usageRowE(8, 1, 1, 1, 'deepseek-v4-pro', {}))
    disposedListener(h, planner)
    const rows = readLedgerRows(ledger)
    checkTrue('P4-14 规划子代理 disposed final fold 复用 childBaseline 缓存 role=planner', rows.length === 1 && rows[0].role === 'planner' && rows[0].sessionId === 'p4-planner-role' && rows[0].seq === 8)
    const orphanEvents = [usageRowE(3, 2, 2, 2, 'deepseek-v4-pro', {})]
    const orphan = childWithId('p4-orphan-child', orphanEvents)
    disposedListener(h, orphan)
    const rows2 = readLedgerRows(ledger)
    checkTrue('P4-15 无 childBaseline 缓存（从未 session-start/pre-step）的 disposed 走稳定兜底：role=executor', rows2.length === 2 && rows2[1].role === 'executor' && rows2[1].sessionId === 'p4-orphan-child')
  } finally { rmSync(dir, { recursive: true, force: true }) }
}

// P4-16：cursor JSON 可解析 → 读改写保留其它合法 session 条目
{
  const dir = makeTmpDir()
  try {
    const ledger = join(dir, 'usage-ledger.jsonl')
    const cursorPath = ledger + '.cursor.json'
    writeFileSync(cursorPath, JSON.stringify({ 'other-session': { seq: 7, index: 3 }, 'legacy-session': 5 }), 'utf8')
    const h = makeHarness({ anchoredBootstrap: false, usageLedger: { enabled: true, path: ledger } })
    const warnings = captureWarnings(() => { agentCreatedListener(h, childWithId('p4-keep', [usageRowE(11, 1, 1, 1, 'm', {})])) })
    const table = JSON.parse(readFileSync(cursorPath, 'utf8'))
    checkTrue('P4-16 可解析 cursor 读改写：0 warning、更新本 session 且保留其它 session（含旧数字形状归一为 {seq,index}）',
      cursorWarnings(warnings).length === 0 && table['other-session'] !== undefined && table['other-session'].seq === 7 && table['other-session'].index === 3 && table['legacy-session'] !== undefined && table['legacy-session'].seq === 5 && table['p4-keep'] !== undefined && table['p4-keep'].seq === 11 && readLedgerRows(ledger).length === 1)
  } finally { rmSync(dir, { recursive: true, force: true }) }
}

// P4-17：ENOENT 静默按空表
{
  const dir = makeTmpDir()
  try {
    const ledger = join(dir, 'usage-ledger.jsonl')
    const h = makeHarness({ anchoredBootstrap: false, usageLedger: { enabled: true, path: ledger } })
    const enoentAgent = childWithId('p4-enoent', [usageRowE(1, 1, 1, 1, 'm', {})])
    const warnings = captureWarnings(() => { agentCreatedListener(h, enoentAgent); disposedListener(h, enoentAgent) })
    checkTrue('P4-17 ENOENT（首次运行无 cursor 文件）静默按空表：0 条降级 warning，ledger 与 cursor 正常落盘',
      cursorWarnings(warnings).length === 0 && readLedgerRows(ledger).length === 1 && JSON.parse(readFileSync(ledger + '.cursor.json', 'utf8'))['p4-enoent'].seq === 1)
  } finally { rmSync(dir, { recursive: true, force: true }) }
}

// P4-18/P4-19：损坏 cursor → 1 条 warning + 覆盖写仅当前 session；同实例再次降级不重复告警
{
  const dir = makeTmpDir()
  try {
    const ledger = join(dir, 'usage-ledger.jsonl')
    const cursorPath = ledger + '.cursor.json'
    writeFileSync(cursorPath, '{"other-session": {', 'utf8')
    const h = makeHarness({ anchoredBootstrap: false, usageLedger: { enabled: true, path: ledger } })
    const events = [usageRowE(5, 2, 3, 4, 'm', {})]
    const agent = childWithId('p4-corrupt', events)
    const warnings = captureWarnings(() => { agentCreatedListener(h, agent) })
    const table = JSON.parse(readFileSync(cursorPath, 'utf8'))
    checkTrue('P4-18 损坏 cursor JSON：已捕获到恰 1 条降级 warning + 写成功后覆盖为仅当前 session（预置的 other-session 条目不再保留）',
      cursorWarnings(warnings).length === 1 && table['p4-corrupt'] !== undefined && table['p4-corrupt'].seq === 5 && table['other-session'] === undefined && readLedgerRows(ledger).length === 1)
    writeFileSync(cursorPath, 'not-json-at-all', 'utf8')
    events.push(usageRowE(9, 1, 1, 1, 'm', {}))
    const warnings2 = captureWarnings(() => { disposedListener(h, agent) })
    const table2 = JSON.parse(readFileSync(cursorPath, 'utf8'))
    checkTrue('P4-19 同一实例再次降级读不重复告警（「每实例首次降级时一次」口径）：0 条新 warning，且降级态覆盖写仍含本 session',
      cursorWarnings(warnings2).length === 0 && readLedgerRows(ledger).length === 2 && table2['p4-corrupt'] !== undefined && table2['p4-corrupt'].seq === 9)
  } finally { rmSync(dir, { recursive: true, force: true }) }
}

// P4-20：cursor 根值为非对象（数组）
{
  const dir = makeTmpDir()
  try {
    const ledger = join(dir, 'usage-ledger.jsonl')
    const cursorPath = ledger + '.cursor.json'
    writeFileSync(cursorPath, '[1,2,3]', 'utf8')
    const h = makeHarness({ anchoredBootstrap: false, usageLedger: { enabled: true, path: ledger } })
    const warnings = captureWarnings(() => { agentCreatedListener(h, childWithId('p4-nonobj', [usageRowE(2, 1, 1, 1, 'm', {})])) })
    const table = JSON.parse(readFileSync(cursorPath, 'utf8'))
    checkTrue('P4-20 cursor 根值为非对象（数组）：1 条降级 warning + 覆盖写为普通对象且仅当前 session',
      cursorWarnings(warnings).length === 1 && !Array.isArray(table) && table['p4-nonobj'] !== undefined && table['p4-nonobj'].seq === 2)
  } finally { rmSync(dir, { recursive: true, force: true }) }
}

// P4-21：final fold 写入失败 → 既有单次 warning、不抛出、不阻断单会话状态清理
{
  const dir = makeTmpDir()
  try {
    const blocked = join(dir, 'blocked')
    writeFileSync(blocked, 'not-a-dir', 'utf8')
    const ledger = join(blocked, 'usage-ledger.jsonl')
    const h = makeHarness({ anchoredBootstrap: false, usageLedger: { enabled: true, path: ledger } })
    const events = [DESC]
    const agent = plannerWithId('p4-foldfail', events)
    events.push(usageRowE(7, 1, 1, 1, 'm', {}))
    // 写入目标父路径是文件 → mkdirSync 抛 EEXIST，foldUsage 走既有 catch（ledgerWarned 只发一次）。
    // 首次 fold 由 preExecute→childBaseline 触发，故捕获窗口覆盖整个序列（首次 + 两次 disposed）。
    let first = null
    let thrown = null
    const warnings = captureWarnings(() => {
      try {
        first = preExecute(h, agent, 'job_output', { job_id: 'job-p4-foldfail' })
        disposedListener(h, agent)
        disposedListener(h, agent)
      } catch (error) { thrown = error }
    })
    const revived = plannerWithId('p4-foldfail', events)
    const after = preExecute(h, revived, 'job_output', { job_id: 'job-p4-foldfail' })
    checkTrue('P4-21 final fold 写入失败：既有单次 ledger warning（三次折叠尝试仍只 1 条）、不抛出，且不阻断清理（同 session 新 agent 的 job_output 查重已重置为 allow）',
      thrown === null && first.kind === 'allow' && warnings.filter((message) => message.includes('usage ledger fold failed')).length === 1 && after.kind === 'allow' && !existsSync(ledger))
  } finally { rmSync(dir, { recursive: true, force: true }) }
}

// P4-22/P4-23：disposed 仍按既有条件发 pending 探查者委派告警（在删除该 session 待认领计数之前），且重复 disposed 幂等
{
  const p4PendingEvents = [umE(), callE('ask_user_question', 'pa1', routeArgsE), okE('pa1', answerE(['直接执行']))]
  const p4PendingMain = { session: { header: { id: 'p4-main-pending', cwd: 'C:/work' }, snapshotEvents: () => p4PendingEvents }, options: {}, ctx: undefined }
  const grantA = preExecute(harness, p4PendingMain, 'subagent_probe', { run_in_background: true })
  const grantB = preExecute(harness, p4PendingMain, 'subagent_probe', { run_in_background: true })
  const warnings = captureWarnings(() => { disposedListener(harness, p4PendingMain) })
  const pendingWarns = warnings.filter((message) => message.includes('个未认领探查者委派'))
  checkTrue('P4-22 disposed 仍按既有条件发 pending 探查者委派告警（计数未被提前删除）：恰 1 条、含「2 个未认领探查者委派」与「委派方会话销毁时」',
    grantA.kind === 'allow' && grantB.kind === 'allow' && pendingWarns.length === 1 && pendingWarns[0].includes('2 个未认领探查者委派') && pendingWarns[0].includes('委派方会话销毁时'))
  const warnings2 = captureWarnings(() => { disposedListener(harness, p4PendingMain) })
  checkTrue('P4-23 重复 disposed 幂等：待认领计数已删除 → 不再告警', warnings2.filter((message) => message.includes('个未认领探查者委派')).length === 0)
}

// ── P4-24：可信用量字段落盘（provider/cacheWriteTokens/reasoningTokens）与零行跳过条件扩展到五字段 ──
{
  const dir = makeTmpDir()
  try {
    const ledger = join(dir, 'usage-ledger.jsonl')
    const h = makeHarness({ anchoredBootstrap: false, usageLedger: { enabled: true, path: ledger } })
    // 首行：hit/miss/out 全零而 cacheWriteTokens 非零 → 五字段跳过条件必须放行（旧条件会跳过该行）。
    // 次行：旧形状（opts={} → 不写 provider/cacheWriteTokens/reasoningTokens 键）→ 按 空串/0/0 落盘。
    const events = [usageRowE(61, 0, 0, 0, 'deepseek-v4-pro', { provider: 'deepseek', cacheWriteTokens: 7, reasoningTokens: 9 })]
    const child = childWithId('p4-usage-fields', events)
    agentCreatedListener(h, child)
    events.push(usageRowE(62, 1, 2, 3, 'deepseek-v4-pro', {}))
    disposedListener(h, child)
    const rows = readLedgerRows(ledger)
    checkTrue('P4-24 新字段落盘：provider/cacheWriteTokens/reasoningTokens 取值正确；hit/miss/out 全零而 cw 非零的行不被跳过；旧形状行缺字段按 空串/0/0 落盘',
      rows.length === 2
      && rows[0].sessionId === 'p4-usage-fields' && rows[0].role === 'executor' && rows[0].seq === 61 && rows[0].provider === 'deepseek'
      && rows[0].cacheWriteTokens === 7 && rows[0].reasoningTokens === 9 && rows[0].hit === 0 && rows[0].miss === 0 && rows[0].out === 0
      && rows[1].seq === 62 && rows[1].provider === '' && rows[1].cacheWriteTokens === 0 && rows[1].reasoningTokens === 0
      && rows[1].hit === 1 && rows[1].miss === 2 && rows[1].out === 3)
  } finally { rmSync(dir, { recursive: true, force: true }) }
}

// ── P4-25~P4-27（P1-4-4 对拍）：per-session 游标增量（session.seq 水位 + snapshotEvents(from,to)）──
// 口径：mock session 严格实现宿主契约「seq === log 索引、append-only 日志」；foldUsage 保持同步函数。
// 全量对拍只在验收期跑这一处（生产热路径只跑增量，不存在同一趟双跑）：全量参考 = 同一 sessionId、
// 但游标为空的独立实例首次折叠（prev 缺失 → 必走无参全量分支），故两路结果可逐行（除 ts）比较。
const watermarkSession = (id, log) => {
  const calls = []
  const session = {
    header: { id, origin: 'subagent', delegationDepth: 1, parentSession: 'parent-1', cwd: 'C:/work' },
    log,
    calls,
    append: () => {},
    eventAt: (seq) => log[seq],
    get seq() { return log.length },
    snapshotEvents: (from, to) => {
      calls.push([from, to])
      if (typeof from === 'number' && typeof to === 'number') return Object.freeze(log.slice(from, to))
      return Object.freeze(log.slice())
    },
  }
  return { session, calls, agent: { session, options: {}, ctx: undefined } }
}
const stripTs = (rows) => rows.map(({ ts, ...rest }) => rest)
const rangeCalls = (calls) => calls.filter((pair) => typeof pair[0] === 'number' && typeof pair[1] === 'number')
const fullCalls = (calls) => calls.filter((pair) => pair[0] === undefined)

// P4-25：水位未变 → 直接返回（不物化数组、不写文件）。用 planner 子代理（日志含 descriptor）
// 使 isPlannerChild 在第一趟后命中 descriptor 缓存，第二趟除 foldUsage 外无其它快照消费者，
// 因此「第二趟零次 snapshotEvents 调用」可同时证明早返回未物化任何数组。
{
  const dir = makeTmpDir()
  try {
    const ledger = join(dir, 'usage-ledger.jsonl')
    const h = makeHarness({ anchoredBootstrap: false, usageLedger: { enabled: true, path: ledger } })
    const log = [DESC, usageRowE(1, 1, 2, 3, 'deepseek-v4-pro', {}), usageRowE(2, 4, 5, 6, 'deepseek-v4-pro', {})]
    const w = watermarkSession('p4-cursor-nochange', log)
    agentCreatedListener(h, w.agent)
    const ledgerA = existsSync(ledger) ? readFileSync(ledger, 'utf8') : ''
    const cursorA = existsSync(ledger + '.cursor.json') ? readFileSync(ledger + '.cursor.json', 'utf8') : ''
    w.calls.length = 0
    agentCreatedListener(h, w.agent)
    const ledgerB = existsSync(ledger) ? readFileSync(ledger, 'utf8') : ''
    const cursorB = existsSync(ledger + '.cursor.json') ? readFileSync(ledger + '.cursor.json', 'utf8') : ''
    checkTrue('P4-25 水位未变（prevIndex === session.seq === 3）→ 直接返回：ledger 与 cursor 字节不变、行数不变，且本次零次 snapshotEvents 调用（不物化数组、不写文件）',
      ledgerA !== '' && cursorA !== '' && readLedgerRows(ledger).length === 2
      && ledgerA === ledgerB && cursorA === cursorB && w.calls.length === 0)
  } finally { rmSync(dir, { recursive: true, force: true }) }
}
// P4-26：增量续扫等价——追加事件后只物化 [prevIndex, logLen) 区间，仅新事件被折叠；
// 全量参考（同 sessionId、游标为空的独立实例首折走无参全量）逐行（除 ts）一致。
{
  const dirA = makeTmpDir()
  const dirB = makeTmpDir()
  try {
    const sid = 'p4-cursor-incr'
    const ledgerA = join(dirA, 'usage-ledger.jsonl')
    const ledgerB = join(dirB, 'usage-ledger.jsonl')
    const hA = makeHarness({ anchoredBootstrap: false, usageLedger: { enabled: true, path: ledgerA } })
    const hB = makeHarness({ anchoredBootstrap: false, usageLedger: { enabled: true, path: ledgerB } })
    // seq 从 1 起（seq 0 落在「seq <= cursor」的初始去重窗口内，与 P4-8~P4-13 既有口径一致）。
    const log = [usageRowE(1, 1, 1, 1, 'deepseek-v4-pro', {}), usageRowE(2, 2, 2, 2, 'deepseek-v4-pro', {})]
    const wInc = watermarkSession(sid, log)
    agentCreatedListener(hA, wInc.agent)
    const first = readLedgerRows(ledgerA)
    wInc.calls.length = 0
    log.push(usageRowE(3, 3, 3, 3, 'deepseek-v4-reasoner', {}), usageRowE(4, 4, 4, 4, 'deepseek-v4-reasoner', {}))
    agentCreatedListener(hA, wInc.agent)
    const incr = readLedgerRows(ledgerA)
    const wFull = watermarkSession(sid, log.slice())
    agentCreatedListener(hB, wFull.agent)
    const full = readLedgerRows(ledgerB)
    const rc = rangeCalls(wInc.calls)
    checkTrue('P4-26 增量续扫等价：区间读恰为 (2,4) 一次（只物化新增区间）、恰追加 2 行、seq 序列 1..4 无重复；与同 sessionId 的全量参考逐行（除 ts）一致',
      first.length === 2 && incr.length === 4 && incr.map((row) => row.seq).join(',') === '1,2,3,4'
      && rc.length === 1 && rc[0][0] === 2 && rc[0][1] === 4
      && full.length === 4 && JSON.stringify(stripTs(incr)) === JSON.stringify(stripTs(full)))
  } finally { rmSync(dirA, { recursive: true, force: true }); rmSync(dirB, { recursive: true, force: true }) }
}
// P4-27：水位前提不成立（cursor.index > session.seq，日志截断）→ 回退无参全量快照；
// seq 去重（seq <= cursor.seq → skip）保证不重写已折叠行；结果与增量路径对同一输入一致。
{
  const dirA = makeTmpDir()
  const dirB = makeTmpDir()
  try {
    const sid = 'p4-cursor-trunc'
    const ledgerA = join(dirA, 'usage-ledger.jsonl')
    const ledgerB = join(dirB, 'usage-ledger.jsonl')
    // 预置游标：index=99 远超水位 4（截断模拟）；另含旧数字形状的其它 session 项（读改写须保留）。
    writeFileSync(ledgerA + '.cursor.json', JSON.stringify({ [sid]: { seq: 2, index: 99 }, 'other-session': 7 }), 'utf8')
    const hA = makeHarness({ anchoredBootstrap: false, usageLedger: { enabled: true, path: ledgerA } })
    const hB = makeHarness({ anchoredBootstrap: false, usageLedger: { enabled: true, path: ledgerB } })
    // seq 1..4（同 P4-26：seq 0 落在初始去重窗口内）；预置游标 seq=2 表示「前两行已折叠」。
    const log = [usageRowE(1, 1, 1, 1, 'deepseek-v4-pro', {}), usageRowE(2, 2, 2, 2, 'deepseek-v4-pro', {}), usageRowE(3, 3, 3, 3, 'deepseek-v4-reasoner', {}), usageRowE(4, 4, 4, 4, 'deepseek-v4-reasoner', {})]
    const wTrunc = watermarkSession(sid, log)
    agentCreatedListener(hA, wTrunc.agent)
    const truncated = readLedgerRows(ledgerA)
    const tableA = JSON.parse(readFileSync(ledgerA + '.cursor.json', 'utf8'))
    // 增量参考：同 sid 分两步折叠（首折全量 + 追加后区间）→ 其增量段即回退路径应当得到的行。
    const logB = log.slice(0, 2)
    const wRef = watermarkSession(sid, logB)
    agentCreatedListener(hB, wRef.agent)
    logB.push(log[2], log[3])
    agentCreatedListener(hB, wRef.agent)
    const refRows = readLedgerRows(ledgerB)
    const rc = rangeCalls(wTrunc.calls)
    checkTrue('P4-27 回退全量：index(99) > session.seq(4) → 走无参全量快照（零次区间读）、seq 去重不产生重复行（仅 seq 3/4 两行），结果与增量路径对同一输入逐行（除 ts）一致；游标写回 index=4 且保留其它 session（旧数字形状归一）',
      truncated.length === 2 && truncated.map((row) => row.seq).join(',') === '3,4'
      && rc.length === 0 && fullCalls(wTrunc.calls).length >= 1
      && refRows.length === 4 && JSON.stringify(stripTs(truncated)) === JSON.stringify(stripTs(refRows.slice(2)))
      && tableA[sid] !== undefined && tableA[sid].seq === 4 && tableA[sid].index === 4
      && tableA['other-session'] !== undefined && tableA['other-session'].seq === 7 && tableA['other-session'].index === 0)
  } finally { rmSync(dirA, { recursive: true, force: true }); rmSync(dirB, { recursive: true, force: true }) }
}

// ── ⑮ 创造模式装配投影矩阵：4 × 3 × 2 × 5 = 120 ───────────────────────
// 使用真实 registry schema 形状的 mock；只断言模型可见 assembly，不把隐藏误报为 runtime binding 安全隔离。
const MATRIX_CORDIS_TOOLS = CORDIS_PRESENTATION_TOOLS
const MATRIX_CREATIVE_SKILLS = ['cordis-plugin-development', 'editing-cordis-compositions']
const MATRIX_SCHEMA = (name, description, parameters) => ({
  name,
  description,
  parameters,
  output: { type: 'object', additionalProperties: true },
})
const MATRIX_OBJECT = { type: 'object', additionalProperties: true }
// 宿主 read tool 的注册 schema 复刻（registry mock）：F/PTC 段不再渲染它，仅用于工具过滤/mode 判定；
// 段文本断言见下方 readOk（F 段逐字等于 HINT_READ_DEFAULT）。
const MATRIX_READ_PARAMETERS = { type: 'object', required: ['file_path'], properties: { file_path: { type: 'string', description: 'Path to read, resolved by the filesystem backend.' }, offset: { type: 'number', description: '1-based first line to return. Defaults to 1.' }, limit: { type: 'number', description: 'Maximum number of lines to return. Defaults to 2000.' } }, additionalProperties: false }
const MATRIX_TOOL_DEFINITIONS = [
  MATRIX_SCHEMA('bash', 'Run a bash command.', MATRIX_OBJECT),
  MATRIX_SCHEMA('pwsh', 'Run a PowerShell command.', MATRIX_OBJECT),
  MATRIX_SCHEMA('edit', 'Edit a UTF-8 text file.', MATRIX_OBJECT),
  MATRIX_SCHEMA('glob', 'Find files by glob.', MATRIX_OBJECT),
  MATRIX_SCHEMA('grep', 'Search file contents.', MATRIX_OBJECT),
  MATRIX_SCHEMA('read', 'Read a UTF-8 text file and return line-numbered content.', MATRIX_READ_PARAMETERS),
  MATRIX_SCHEMA('save_probe', 'Save an evidence report.', MATRIX_OBJECT),
  MATRIX_SCHEMA('skill', 'Load a named skill.', MATRIX_OBJECT),
  MATRIX_SCHEMA('web_search', 'Search the web.', MATRIX_OBJECT),
  MATRIX_SCHEMA('write', 'Write a UTF-8 text file.', MATRIX_OBJECT),
  ...MATRIX_CORDIS_TOOLS.map((name) => MATRIX_SCHEMA(name, 'Cordis presentation schema for ' + name + '.', MATRIX_OBJECT)),
  MATRIX_SCHEMA('run_code', 'Run a program.', { type: 'object', required: ['code', 'description'], properties: { code: { type: 'string' }, description: { type: 'string' } }, additionalProperties: false }),
]
const MATRIX_NO_WRITE = MATRIX_TOOL_DEFINITIONS.filter((schema) => schema.name !== 'write' && schema.name !== 'edit')
function matrixSchemasFor(role) {
  return role === 'main' || role === 'executor' ? MATRIX_TOOL_DEFINITIONS : MATRIX_NO_WRITE
}
function matrixDirectTools(schemas, mode) {
  if (mode === 'ptc') return schemas.filter((schema) => schema.name === 'run_code')
  if (mode === 'native') return schemas.filter((schema) => schema.name !== 'run_code')
  return schemas
}
function matrixSections(mode) {
  const sections = []
  if (mode === 'ptc') sections.push({ name: 'tools:ptc-only', text: 'Only the run_code transport is directly callable.' })
  // 宿主 tool:read 原文（非 anchored 的直通夹具值）：anchored PTC 行由插件借槽覆盖为
  // 变量②手写文案，断言据此要求「逐字等于 HINT_READ_DEFAULT 且不等于本夹具文本」。
  sections.push({ name: 'tool:read', text: HOST_READ_TEXT })
  sections.push({ name: 'tool:cordis', text: 'Cordis guidance: ' + MATRIX_CORDIS_TOOLS.join(', ') })
  if (mode !== 'native') sections.push({ name: 'tools:sdk', text: 'Original SDK declarations: ' + MATRIX_CORDIS_TOOLS.join(', ') + ', read, skill, file_path, offset, limit.' })
  sections.push({ name: 'matrix-user-section', text: 'ordinary user skill and prompt section' })
  return sections
}
function matrixAgent(role, phase, serial, mode, sdkSchemasOverride) {
  const schemas = matrixSchemasFor(role)
  const sdkSchemas = sdkSchemasOverride === undefined ? schemas.filter((schema) => schema.name !== 'run_code') : sdkSchemasOverride
  const events = phase === 'first' ? [] : [{ type: 'tool/call', data: {} }]
  if (role === 'planner') events.unshift(DESC)
  const header = role === 'main'
    ? { id: 'matrix-main-' + serial, cwd: 'C:/work' }
    : { id: 'matrix-' + role + '-' + serial, origin: 'subagent', delegationDepth: 1, parentSession: 'parent-1', cwd: 'C:/work' }
  return {
    session: { header, snapshotEvents: () => events },
    options: {},
    ctx: { get: (name) => name === 'tools' ? { schemas: () => schemas, sdkSchemas: () => sdkSchemas, modeFor: () => mode } : undefined },
  }
}
function sectionNames(assembly) {
  return Array.isArray(assembly.sections) ? assembly.sections.map((section) => section.name) : []
}
function sectionText(assembly, name) {
  const section = Array.isArray(assembly.sections) ? assembly.sections.find((item) => item.name === name) : undefined
  return section !== undefined && typeof section.text === 'string' ? section.text : ''
}
// 旧 declarationNames（从官方单-read SDK 骨架里抽声明名）随 F 段改为手写文案而失去调用点，已删除。
function matrixCatalogDecision(creativeMode) {
  const entries = [
    { name: 'matrix-ordinary-skill', description: 'Ordinary skill kept in every catalog.' },
    ...(creativeMode ? MATRIX_CREATIVE_SKILLS.map((name) => ({ name, description: 'Creative Cordis skill.' })) : []),
  ]
  return { kind: 'enter', messages: [{ source: { kind: 'skill-catalog', update: false, entries }, content: [{ type: 'text', text: 'matrix skill catalog' }] }] }
}
async function matrixCatalog(listeners, agent, creativeMode) {
  const decision = matrixCatalogDecision(creativeMode)
  const entry = listeners['agent/pre-step'] !== undefined ? listeners['agent/pre-step'][0] : undefined
  return entry === undefined ? decision : await entry({ agent }, async () => decision)
}
const matrixModes = ['native', 'ptc', 'both']
const matrixRoles = ['main', 'planner', 'executor', 'reviewer', 'probe']
let matrixCases = 0
let matrixSerial = 0
for (const anchoredBootstrap of [false, true]) {
  for (const creativeMode of [false, true]) {
    for (const mode of matrixModes) {
      for (const phase of ['first', 'later']) {
        for (const role of matrixRoles) {
          matrixSerial += 1
          const harnessMatrix = makeHarness({ anchoredBootstrap, creativeMode })
          const agent = matrixAgent(role, phase, matrixSerial, mode)
          const schemas = matrixSchemasFor(role)
          const rawTools = matrixDirectTools(schemas, mode)
          const assembled = await assemble(harnessMatrix, agent, rawTools, matrixSections(mode))
          const anchored = anchoredBootstrap && phase === 'first' && (role === 'main' || role === 'planner')
          const anchoredPtc = anchored && mode === 'ptc'
          const visibleRawTools = creativeMode ? rawTools : rawTools.filter((tool) => !MATRIX_CORDIS_TOOLS.includes(tool.name))
          const expectedNames = anchoredPtc
            ? ['run_code']
            : anchored
              ? visibleRawTools.filter((tool) => ['bash', 'pwsh', 'read'].includes(tool.name)).map((tool) => tool.name)
              : visibleRawTools.map((tool) => tool.name)
          const gotNames = Array.isArray(assembled.tools) ? assembled.tools.map((tool) => tool.name) : []
          const expectedSectionNames = anchoredPtc
            ? ['extra-plan-bootstrap', 'tool:read']
            : anchored
              ? ['extra-plan-bootstrap']
              : matrixSections(mode).filter((section) => creativeMode || section.name !== 'tool:cordis').map((section) => section.name)
          const gotSectionNames = sectionNames(assembled)
          const namesOk = gotNames.join('|') === expectedNames.join('|')
          const sectionsOk = gotSectionNames.join('|') === expectedSectionNames.join('|')
          const sdk = sectionText(assembled, 'tools:sdk')
          const sdkCordisHits = MATRIX_CORDIS_TOOLS.filter((name) => sdk.includes(name))
          const sdkPresent = !anchored && mode !== 'native'
          const sdkOk = sdkPresent
            ? creativeMode
              ? sdkCordisHits.length === MATRIX_CORDIS_TOOLS.length && sdk.includes('read')
              : sdkCordisHits.length === 0 && sdk.includes('read:') && sdk.includes('file_path') && sdk.includes('offset') && sdk.includes('limit')
            : sdk === ''
          const cordisSection = sectionText(assembled, 'tool:cordis')
          const cordisSectionHits = MATRIX_CORDIS_TOOLS.filter((name) => cordisSection.includes(name))
          const topCordisHits = gotNames.filter((name) => MATRIX_CORDIS_TOOLS.includes(name))
          const c7Expected = creativeMode && !anchored ? MATRIX_CORDIS_TOOLS.length : 0
          const cordisOk = c7Expected === MATRIX_CORDIS_TOOLS.length
            ? cordisSectionHits.length === MATRIX_CORDIS_TOOLS.length && (mode === 'ptc' ? topCordisHits.length === 0 : topCordisHits.length === MATRIX_CORDIS_TOOLS.length)
            : cordisSectionHits.length === 0 && topCordisHits.length === 0
          const readText = sectionText(assembled, 'tool:read')
          let readOk
          if (anchoredPtc) {
            // F/PTC 的 tool:read 逐字等于变量②手写文案（此处实例未配置 → 内置默认），
            // 且不再含宿主原文、不再含官方单-read SDK 骨架与 Cordis 名称。
            readOk = readText === HINT_READ_DEFAULT && hintReadOk(readText)
              && readText !== HOST_READ_TEXT
              && readText !== '' && gotSectionNames.includes('tool:read')
              && MATRIX_CORDIS_TOOLS.every((name) => !readText.includes(name))
          } else if (anchored) {
            readOk = readText === '' && !gotSectionNames.includes('tool:read')
          } else {
            // 非 anchored（N/P/B 与全部 L）：tool:read 保持宿主原文直通，插件不碰。
            readOk = readText === HOST_READ_TEXT
          }
          const phaseOk = (isBootstrapPhase(agent) ? 'first' : 'later') === phase
          const contextsOk = !anchored || (Array.isArray(assembled.contexts) && assembled.contexts.length === 0)
          const catalog = await matrixCatalog(harnessMatrix, agent, creativeMode)
          const catalogMessage = Array.isArray(catalog.messages) ? catalog.messages.find((message) => message !== null && typeof message === 'object' && message.source !== undefined) : undefined
          const catalogEntries = catalogMessage !== undefined && catalogMessage.source !== null && typeof catalogMessage.source === 'object' && Array.isArray(catalogMessage.source.entries) ? catalogMessage.source.entries : []
          const catalogCreative = catalogEntries.filter((entry) => entry !== null && typeof entry === 'object' && MATRIX_CREATIVE_SKILLS.includes(entry.name))
          const catalogExpected = creativeMode && !anchoredPtc ? 2 : 0
          const catalogOk = catalogCreative.length === catalogExpected && catalogEntries.some((entry) => entry !== null && typeof entry === 'object' && entry.name === 'matrix-ordinary-skill')
          const ordinarySkillToolOk = anchoredPtc ? schemas.some((schema) => schema.name === 'skill') : mode === 'ptc' ? sdk.includes('skill') : visibleRawTools.some((tool) => tool.name === 'skill')
          const ptcBoundaryOk = mode !== 'ptc' || (gotNames.length === 1 && gotNames[0] === 'run_code' && !gotNames.includes('read') && (anchoredPtc ? !gotSectionNames.includes('tools:ptc-only') : gotSectionNames.includes('tools:ptc-only')) && gotSectionNames.includes('tool:read') && (anchoredPtc ? !gotSectionNames.includes('tools:sdk') : gotSectionNames.includes('tools:sdk')))
          const hpOk = !anchoredPtc || (gotSectionNames.join('|') === 'extra-plan-bootstrap|tool:read' && sdk === '' && cordisSection === '' && !gotSectionNames.includes('matrix-user-section'))
          const hnHbOk = !(anchored && mode !== 'ptc') || (gotSectionNames.join('|') === 'extra-plan-bootstrap' && gotNames.includes('read') && !gotSectionNames.includes('tool:read') && !gotSectionNames.includes('tools:ptc-only') && !gotSectionNames.includes('tools:sdk') && !gotSectionNames.includes('tool:cordis'))
          const label = 'M' + matrixSerial + ' A=' + (anchoredBootstrap ? '1' : '0') + ' C=' + (creativeMode ? '1' : '0') + ' M=' + mode + ' phase=' + phase + ' role=' + role + ' C7=' + c7Expected + ' catalog=' + catalogExpected
          checkTrue(label + ' tools/sections/phase/presentation', namesOk && sectionsOk && phaseOk && sdkOk && cordisOk && readOk && contextsOk && catalogOk && ordinarySkillToolOk && ptcBoundaryOk && hpOk && hnHbOk)
          matrixCases += 1
        }
      }
    }
  }
}
check('装配矩阵案例总数', matrixCases, 120)
checkTrue('Cordis 固定集合恰有 2 项且名称唯一', MATRIX_CORDIS_TOOLS.length === 2 && new Set(MATRIX_CORDIS_TOOLS).size === 2)
const projectionSource = { tools: [{ name: 'read' }, { name: MATRIX_CORDIS_TOOLS[0] }], sections: [{ name: 'tool:cordis', text: 'hidden' }, { name: 'tools:sdk', text: 'old' }] }
const projectionCopy = projectAssemblyForPresentation(projectionSource, projectionSource.tools, { sdkText: 'read:' })
checkTrue('projectAssemblyForPresentation 返回新 assembly 且不原地修改', projectionCopy !== projectionSource && projectionSource.tools.length === 2 && projectionSource.sections[0].name === 'tool:cordis' && projectionCopy.tools.length === 1 && projectionCopy.tools[0].name === 'read' && sectionText(projectionCopy, 'tool:cordis') === '' && sectionText(projectionCopy, 'tools:sdk') === 'read:')
// C=1 创造 skill 面（0.1.7 静态注册）：预设 skill-filesystem 行的 config.customSkillDirs
// 指向官方包内 skills/（含 3 个 SKILL.md 目录）；表达式逐字含 createRequire(baseUrl) 与 'skills'。
const expectedCreativeSkills = ['cordis-plugin-development', 'editing-cordis-compositions', 'cordis-composition-reference']
{
  const skillFsRow = all.find((row) => row.id === 'skill-filesystem')
  const dirs = skillFsRow !== undefined && skillFsRow.config !== undefined && Array.isArray(skillFsRow.config.customSkillDirs) ? skillFsRow.config.customSkillDirs : []
  checkTrue('T9-3a 预设 skill-filesystem 行 config.customSkillDirs 存在（恰 1 项）', skillFsRow !== undefined && dirs.length === 1)
  checkTrue("T9-3b customSkillDirs 表达式逐字含 createRequire(baseUrl).resolve('@deepseek-ai/dsh-agent-preset/package.json') 与 'skills'",
    presetText.includes("createRequire(baseUrl).resolve('@deepseek-ai/dsh-agent-preset/package.json')") && presetText.includes("'skills'"))
}
// 隐藏集合（C=0 语义等价旧「不注册」）：三 id 全在 CREATIVE_SKILL_NAMES，且 C=0 时从 catalog 隐藏。
const skillCatalogFixture = (names) => ({
  kind: 'enter',
  messages: [{
    source: { kind: 'skill-catalog', update: false, entries: [{ name: 'matrix-ordinary-skill', description: 'ordinary' }].concat(names.map((name) => ({ name, description: 'creative' }))) },
    content: [{ type: 'text', text: 'matrix skill catalog' }],
  }],
})
const catalogNamesOf = (decision) => {
  const message = Array.isArray(decision.messages) ? decision.messages.find((item) => item !== null && typeof item === 'object' && item.source !== undefined && Array.isArray(item.source.entries)) : undefined
  return message === undefined ? [] : message.source.entries.map((entry) => entry.name)
}
{
  checkTrue('T9-3c 隐藏集合恰含 3 个 cordis skill 且全部为 true 名单', expectedCreativeSkills.every((name) => CREATIVE_SKILL_NAMES_FOR_TEST.has(name)) && CREATIVE_SKILL_NAMES_FOR_TEST.size === 3)
  const offHarness = makeHarness({ anchoredBootstrap: false, creativeMode: false })
  const hiddenOff = await offHarness['agent/pre-step'][0]({ agent: mainAgent }, async () => skillCatalogFixture(expectedCreativeSkills))
  const namesOff = catalogNamesOf(hiddenOff)
  checkTrue('T9-3d C=0 全 phase 隐藏 3 个 cordis skill 且保留普通 skill', expectedCreativeSkills.every((name) => !namesOff.includes(name)) && namesOff.includes('matrix-ordinary-skill'))
  const onHarness = makeHarness({ anchoredBootstrap: false, creativeMode: true })
  const keptOn = await onHarness['agent/pre-step'][0]({ agent: mainAgent }, async () => skillCatalogFixture(expectedCreativeSkills))
  const namesOn = catalogNamesOf(keptOn)
  checkTrue('T9-3e C=1 非 HP1 窗口保留 3 个创造 skill（投影不隐藏）', expectedCreativeSkills.every((name) => namesOn.includes(name)))
}
checkTrue('skill 工具仍属于普通模型可见工具', matrixDirectTools(MATRIX_TOOL_DEFINITIONS, 'native').some((tool) => tool.name === 'skill'))
checkTrue('F/L 判定识别数组型 tool/call 事件', !isBootstrapPhase({ session: { snapshotEvents: () => [{ type: ['assistant', 'tool/call'] }] } }))

// ── ⑮b P2-2：agent 级 SDK 文本复用（受控 renderer，计数是硬门槛） ────────
// 受控 renderer 只接收已完成 sdkSchemasForRendering 形状，故可逐字对拍输入与输出；
// F 只走 read 输入，完整 L 才交给 cache。耗时不参与通过/失败判定。
const p2ReadInput = [{ name: 'read', parameters: { type: 'object', required: ['file_path'] }, output: { type: 'object' } }]
const p2FullInput = [
  ...p2ReadInput,
  { name: 'alpha', parameters: { type: 'object', properties: { nested: { type: 'string' } } }, output: { type: 'array', items: { type: 'string' } } },
]
const p2AgentA = { session: { header: { id: 'p2-same-session' } } }
const p2AgentB = { session: { header: { id: 'p2-same-session' } } }
const p2Cache = createSdkTextCache()
const p2Calls = []
const p2Renderer = async (input) => {
  p2Calls.push(JSON.parse(JSON.stringify(input)))
  return 'SDK<' + JSON.stringify(input) + '>'
}
let baselineCount = 0
const baselineRenderer = (input) => { baselineCount += 1; return 'SDK<' + JSON.stringify(input) + '>' }
await baselineRenderer(p2FullInput)
await baselineRenderer(p2FullInput)
const fTextP2 = await p2Renderer(p2ReadInput)
const lTextP2a = await p2Cache.getOrCreate(p2AgentA, p2FullInput, 'typescript', p2Renderer)
const lTextP2b = await p2Cache.getOrCreate(p2AgentA, p2FullInput, 'typescript', p2Renderer)
const p2FullCalls = p2Calls.filter((input) => input.length === p2FullInput.length)
check('P2-1 基线两次完整 L renderer 计数', baselineCount, 2)
checkTrue('P2-2 受控 PTC F→L→L：F 输入只含 read、完整 L 调用精确 1 次',
  p2Calls.length === 2 && p2Calls[0].length === 1 && p2Calls[0][0].name === 'read' && p2FullCalls.length === 1)
checkTrue('P2-3 同 agent 同 key 命中且两次 L 文本逐字相等', lTextP2a === lTextP2b && p2FullCalls.length === 1 && fTextP2 !== lTextP2a)
const p2DifferentAgentBefore = p2Calls.length
await p2Cache.getOrCreate(p2AgentB, p2FullInput, 'typescript', p2Renderer)
checkTrue('P2-4 不同 agent（同 sessionId）不共享', p2Calls.length === p2DifferentAgentBefore + 1)
const p2NestedChanged = [{ ...p2FullInput[0] }, { ...p2FullInput[1], parameters: { type: 'object', properties: { nested: { type: 'number' } } } }]
const p2NestedBefore = p2Calls.length
await p2Cache.getOrCreate(p2AgentA, p2NestedChanged, 'typescript', p2Renderer)
checkTrue('P2-5 同名工具嵌套 parameters/output 改变重渲染', p2Calls.length === p2NestedBefore + 1)
const p2OutputChanged = [{ ...p2FullInput[0] }, { ...p2FullInput[1], output: { type: 'object', properties: { changed: { type: 'boolean' } } } }]
const p2OutputBefore = p2Calls.length
await p2Cache.getOrCreate(p2AgentA, p2OutputChanged, 'typescript', p2Renderer)
checkTrue('P2-6 同名工具 output schema 改变重渲染', p2Calls.length === p2OutputBefore + 1)
const p2LanguageBefore = p2Calls.length
await p2Cache.getOrCreate(p2AgentA, p2FullInput, 'python', p2Renderer)
checkTrue('P2-7 language 原值改变重渲染', p2Calls.length === p2LanguageBefore + 1)
let alternateRendererCalls = 0
const alternateRenderer = (input) => { alternateRendererCalls += 1; return 'ALT<' + JSON.stringify(input) + '>' }
const alternateText = await p2Cache.getOrCreate(p2AgentA, p2FullInput, 'python', alternateRenderer)
checkTrue('P2-8 renderer 函数引用改变重渲染', alternateRendererCalls === 1 && alternateText.startsWith('ALT<'))
const p2NewApplyCache = createSdkTextCache()
const newApplyBefore = p2Calls.length
await p2NewApplyCache.getOrCreate(p2AgentA, p2FullInput, 'typescript', p2Renderer)
checkTrue('P2-9 新 plugin apply/cache factory 无旧 entry', p2Calls.length === newApplyBefore + 1)
const fingerprintNestedA = sdkSchemasFingerprint([{ name: 'same', parameters: { alpha: 1, beta: { nested: true } }, output: { type: 'object' } }])
const fingerprintNestedB = sdkSchemasFingerprint([{ name: 'same', parameters: { alpha: 1, beta: { nested: false } }, output: { type: 'object' } }])
const fingerprintOutputB = sdkSchemasFingerprint([{ name: 'same', parameters: { alpha: 1, beta: { nested: true } }, output: { type: 'array' } }])
const fingerprintOrderA = sdkSchemasFingerprint([{ name: 'same', parameters: { alpha: 1, beta: 2 } }])
const fingerprintOrderB = sdkSchemasFingerprint([{ name: 'same', parameters: { beta: 2, alpha: 1 } }])
const fingerprintAbsent = sdkSchemasFingerprint([{ name: 'same' }])
const fingerprintUndefined = sdkSchemasFingerprint([{ name: 'same', output: undefined }])
const cyclicSchema = { name: 'cycle' }
cyclicSchema.parameters = cyclicSchema
const getterSchema = {}
Object.defineProperty(getterSchema, 'name', { enumerable: true, get: () => 'getter' })
checkTrue('P2-10 指纹覆盖嵌套 parameters/output、数组与对象键顺序及字段存在性',
  fingerprintNestedA !== fingerprintNestedB && fingerprintNestedA !== fingerprintOutputB && fingerprintOrderA !== fingerprintOrderB && fingerprintAbsent !== fingerprintUndefined)
checkTrue('P2-11 无法无损签名时 cache miss（循环引用/getter 不写入 entry）', sdkSchemasFingerprint([cyclicSchema]) === undefined && sdkSchemasFingerprint([getterSchema]) === undefined)
const p2ConcurrentAgent = { session: { header: { id: 'p2-concurrent' } } }
let concurrentResolve
let concurrentCalls = 0
const concurrentRenderer = () => {
  concurrentCalls += 1
  return new Promise((resolve) => { concurrentResolve = resolve })
}
const concurrentA = p2Cache.getOrCreate(p2ConcurrentAgent, p2FullInput, 'typescript', concurrentRenderer)
const concurrentB = p2Cache.getOrCreate(p2ConcurrentAgent, p2FullInput, 'typescript', concurrentRenderer)
checkTrue('P2-12 同 key 并发请求共享同一个 in-flight Promise', concurrentA === concurrentB)
await Promise.resolve()
concurrentResolve('concurrent-text')
await Promise.all([concurrentA, concurrentB])
checkTrue('P2-13 同 key 并发只启动一次 renderer', concurrentCalls === 1)
const p2RejectAgent = { session: { header: { id: 'p2-reject' } } }
let rejectNext = true
let rejectCalls = 0
const rejectThenRetryRenderer = () => {
  rejectCalls += 1
  if (rejectNext) { rejectNext = false; return Promise.reject(new Error('controlled reject')) }
  return 'retry-text'
}
let rejected = false
try { await p2Cache.getOrCreate(p2RejectAgent, p2FullInput, 'typescript', rejectThenRetryRenderer) } catch (error) { rejected = true }
const retryText = await p2Cache.getOrCreate(p2RejectAgent, p2FullInput, 'typescript', rejectThenRetryRenderer)
checkTrue('P2-14 renderer reject 不缓存，下一次相同 L 重试', rejected && rejectCalls === 2 && retryText === 'retry-text')
const p2DisposeAgent = { session: { header: { id: 'p2-dispose' } } }
let disposeCalls = 0
const disposeRenderer = (input) => { disposeCalls += 1; return 'dispose-text' }
await p2Cache.getOrCreate(p2DisposeAgent, p2FullInput, 'typescript', disposeRenderer)
p2Cache.dispose(p2DisposeAgent)
await p2Cache.getOrCreate(p2DisposeAgent, p2FullInput, 'typescript', disposeRenderer)
checkTrue('P2-15 dispose 后同 agent 再请求重渲染', disposeCalls === 2)
const p2StaleAgent = { session: { header: { id: 'p2-stale' } } }
let resolveOld
const oldPromise = p2Cache.getOrCreate(p2StaleAgent, p2FullInput, 'typescript', () => new Promise((resolve) => { resolveOld = resolve }))
await Promise.resolve()
const freshInput = [{ ...p2FullInput[0] }, { ...p2FullInput[1], parameters: { type: 'object', properties: { fresh: { type: 'string' } } } }]
const freshRenderer = () => 'fresh-text'
const freshPromise = p2Cache.getOrCreate(p2StaleAgent, freshInput, 'typescript', freshRenderer)
const freshText = await freshPromise
resolveOld('old-text')
await oldPromise
let staleConfirmCalls = 0
const staleConfirm = await p2Cache.getOrCreate(p2StaleAgent, freshInput, 'typescript', freshRenderer)
checkTrue('P2-16 旧 key 迟到 resolve 不覆盖新 entry', freshText === 'fresh-text' && staleConfirm === 'fresh-text' && staleConfirmCalls === 0)
checkTrue('P2-17 entry 三元组按 renderer 身份比较且 dispose 可回收',
  sdkTextCacheEntryMatches({ fingerprint: 'f', language: 'typescript', renderer: p2Renderer }, 'f', 'typescript', p2Renderer)
  && !sdkTextCacheEntryMatches({ fingerprint: 'f', language: 'typescript', renderer: p2Renderer }, 'f', 'python', p2Renderer)
  && !sdkTextCacheEntryMatches({ fingerprint: 'f', language: 'typescript', renderer: p2Renderer }, 'f', 'typescript', alternateRenderer))
const p2Source = pluginSource
checkTrue('P2-18 F/native 与 F/both 不渲染完整 SDK，L 才按完整 renderer 输入接 cache',
  p2Source.includes('if (!anchoredFirst && hasSection(result.sections, SDK_SECTION_NAME))')
  && p2Source.includes('const effectiveSchemas = toolSdkSchemasOf(agent) ?? schemas')
  && p2Source.includes('const rendererInput = sdkSchemasForRendering(effectiveSchemas)')
  && p2Source.includes('sdkTextCache.dispose(agent)'))
const p2PresentationHarness = makeHarness({ anchoredBootstrap: true, creativeMode: false })
const p2FTrapHarness = makeHarness({ anchoredBootstrap: true, creativeMode: false, language: '__p2-unsupported-renderer-sentinel__' })
let p2FullSdkRendererPathAttempts = 0
const p2RendererTrapSchema = {}
Object.defineProperty(p2RendererTrapSchema, 'name', {
  enumerable: true,
  get() {
    p2FullSdkRendererPathAttempts += 1
    throw new Error('p2 full SDK renderer trap')
  },
})
const p2OriginalWarn = console.warn
let p2FNative
let p2FBoth
const p2RendererWarnings = await captureFilteredSdkWarnings(async () => {
  const p2FNativeAgent = matrixAgent('main', 'first', 1001, 'native', [p2RendererTrapSchema])
  const p2FBothAgent = matrixAgent('main', 'first', 1002, 'both', [p2RendererTrapSchema])
  p2FNative = await assemble(p2FTrapHarness, p2FNativeAgent, matrixDirectTools(matrixSchemasFor('main'), 'native'), matrixSections('native'))
  p2FBoth = await assemble(p2FTrapHarness, p2FBothAgent, matrixDirectTools(matrixSchemasFor('main'), 'both'), matrixSections('both'))
})
checkTrue('P2-19 F/native 与 F/both 模型可见面不含完整 tools:sdk',
  !sectionNames(p2FNative).includes('tools:sdk') && !sectionNames(p2FBoth).includes('tools:sdk')
  && sectionNames(p2FNative).join('|') === 'extra-plan-bootstrap'
  && sectionNames(p2FBoth).join('|') === 'extra-plan-bootstrap')
checkTrue('P2-19 F/native 与 F/both 不进入完整 SDK renderer（sentinel trap 无 warning/入径，console.warn 已恢复）',
  p2RendererWarnings.length === 0 && p2FullSdkRendererPathAttempts === 0 && console.warn === p2OriginalWarn)
const p2LLaterAgent = matrixAgent('main', 'later', 1003, 'both')
const p2LLater = await assemble(p2PresentationHarness, p2LLaterAgent, matrixDirectTools(matrixSchemasFor('main'), 'both'), matrixSections('both'))
checkTrue('P2-20 C=0 L 对拍 tools/sections：Cordis 隐藏、SDK 保留 read 且不缓存 assembly',
  !p2LLater.tools.some((tool) => MATRIX_CORDIS_TOOLS.includes(tool.name))
  && !sectionNames(p2LLater).includes('tool:cordis')
  && sectionText(p2LLater, 'tools:sdk').includes('read')
  && sectionText(p2LLater, 'tools:sdk').includes('file_path'))
const p2RuntimeDeny = preExecute(harness, mainAgent, 'write', {})
checkTrue('P2-21 C=0 runtime deny/权限行为保持：主会话未确认 write 仍 deny', p2RuntimeDeny !== null && p2RuntimeDeny.kind === 'deny' && String(p2RuntimeDeny.reason).includes('路由未确认'))

// ── ⑯ B3 收敛：shell 只读文案单源 + job_output 记录单源（T2/T3） ─────────────
// ① 六格逐字矩阵：完整字符串等值比较（不用 includes），负例锁 null 边界。
const SHELL_MATRIX = [
  ['planner', 'pwsh', { command: 'New-Item x.txt' }, '规划子代理只读：pwsh 仅限只读探查命令，禁止创建/修改/删除文件'],
  ['planner', 'bash', { command: 'rm -rf x' }, '规划子代理只读：bash 仅限只读探查命令，禁止创建/修改/删除文件'],
  ['probe', 'pwsh', { command: 'Set-Content a.txt x' }, '探查者只读：pwsh 仅限只读探查命令，禁止创建/修改/删除文件'],
  ['probe', 'bash', { command: 'mkdir d' }, '探查者只读：bash 仅限只读探查命令，禁止创建/修改/删除文件'],
  ['reviewer', 'pwsh', { command: 'Remove-Item x' }, '验收复核者只读：pwsh 仅限只读探查命令，禁止创建/修改/删除文件'],
  ['reviewer', 'bash', { command: 'echo hi > f.txt' }, '验收复核者只读：bash 仅限只读探查命令，禁止创建/修改/删除文件'],
]
for (const [role, toolName, args, expected] of SHELL_MATRIX) {
  check('B3-1 ' + role + '×' + toolName + ' shellMutationReason 逐字等值', shellMutationReason(role, { name: toolName, arguments: args }), expected)
}
check('B3-2 planner pwsh 只读命令（Get-ChildItem）→ null', shellMutationReason('planner', { name: 'pwsh', arguments: { command: 'Get-ChildItem' } }), null)
check('B3-3 probe bash 参数位裸词（grep -rn rm src/）→ null', shellMutationReason('probe', { name: 'bash', arguments: { command: 'grep -rn rm src/' } }), null)
check('B3-4 planner write（非 shell）→ null', shellMutationReason('planner', { name: 'write', arguments: {} }), null)
check('B3-5 reviewer edit（非 shell）→ null', shellMutationReason('reviewer', { name: 'edit', arguments: {} }), null)
checkTrue('B3-6 未知角色与缺失入参 → null（无异常）',
  shellMutationReason('executor', { name: 'pwsh', arguments: { command: 'New-Item x' } }) === null
  && shellMutationReason(undefined, { name: 'pwsh', arguments: { command: 'New-Item x' } }) === null
  && shellMutationReason('planner', undefined) === null
  && shellMutationReason('planner', { name: 'pwsh' }) === null)

// ② 记录函数状态迁移：惰性建表 / 同 session 多 job / 跨 session 隔离 / 同 job 幂等覆盖 / 非法输入零副作用。
{
  const counters = new Map()
  const snap = (m) => JSON.stringify([...m.entries()].map(([k, v]) => [k, [...v.entries()]]).sort())
  const agentA = { session: { header: { id: 'b3-sess-A' }, snapshotEvents: () => [] }, options: {}, ctx: undefined }
  const agentB = { session: { header: { id: 'b3-sess-B' }, snapshotEvents: () => [] }, options: {}, ctx: undefined }
  const joExec = (jobId) => ({ name: 'job_output', arguments: { job_id: jobId } })
  const emptyBefore = snap(counters)
  checkTrue('B3-7 首次调用惰性建表（返回 true，表恰为 b3-sess-A → j1→1）',
    recordJobOutputCall(agentA, joExec('j1'), counters) === true && counters.size === 1 && snap(counters) === '[["b3-sess-A",[["j1",1]]]]')
  checkTrue('B3-8 同 session 多 job 累积（j1/j2 并存，值均为 1）',
    recordJobOutputCall(agentA, joExec('j2'), counters) === true && counters.size === 1 && counters.get('b3-sess-A').size === 2 && counters.get('b3-sess-A').get('j1') === 1 && counters.get('b3-sess-A').get('j2') === 1)
  checkTrue('B3-9 跨 session 隔离（B 建表不影响 A 的表项）',
    recordJobOutputCall(agentB, joExec('j1'), counters) === true && counters.size === 2 && counters.get('b3-sess-B').size === 1 && counters.get('b3-sess-A').size === 2 && !counters.get('b3-sess-B').has('j2'))
  checkTrue('B3-10 同 job 幂等覆盖（表项数与值不变）',
    recordJobOutputCall(agentA, joExec('j1'), counters) === true && counters.get('b3-sess-A').size === 2 && counters.get('b3-sess-A').get('j1') === 1)
  const before = snap(counters)
  const noHeader = { session: { snapshotEvents: () => [] }, options: {}, ctx: undefined }
  const badAgent = { session: { header: { id: 7 }, snapshotEvents: () => [] }, options: {}, ctx: undefined }
  const badCalls = [
    recordJobOutputCall(agentA, { name: 'job_output', arguments: {} }, counters),
    recordJobOutputCall(agentA, { name: 'job_output', arguments: { job_id: 42 } }, counters),
    recordJobOutputCall(agentA, { name: 'job_output', arguments: { job_id: null } }, counters),
    recordJobOutputCall(agentA, { name: 'job_output', arguments: '{ bad json' }, counters),
    recordJobOutputCall(agentA, { name: 'read', arguments: { job_id: 'j9' } }, counters),
    recordJobOutputCall(agentA, undefined, counters),
    recordJobOutputCall(undefined, joExec('j9'), counters),
    recordJobOutputCall(noHeader, joExec('j9'), counters),
    recordJobOutputCall(badAgent, joExec('j9'), counters),
    recordJobOutputCall(agentA, joExec('j9'), undefined),
    recordJobOutputCall(agentA, joExec('j9'), null),
  ]
  checkTrue('B3-11 非法输入（缺/非字符串 job_id、非 job_output、agent/sessionId/counters 缺失）→ 全部 false、Map 零副作用',
    badCalls.every((v) => v === false) && snap(counters) === before && before !== emptyBefore)
  checkTrue('B3-12 counters 缺失不建表（两 session 表项数与值保持）',
    counters.size === 2 && counters.get('b3-sess-A').size === 2 && counters.get('b3-sess-B').size === 1 && !counters.has('undefined'))
}

// ③ 源码单点结构断言：唯一写入点、三处内联实现已删、监听器无二次判定、三类角色统一调用。
{
  const recordStart = pluginSource.indexOf('function recordJobOutputCall(')
  const recordBody = recordStart === -1 ? '' : pluginSource.slice(recordStart, pluginSource.indexOf('\n}\n', recordStart))
  checkTrue('B3-13 jobId→1 写入全文件唯一（perSession.set( 恰 1 处）且只位于 recordJobOutputCall',
    pluginSource.split('perSession.set(').length - 1 === 1 && recordBody.includes('perSession.set(args.job_id, 1)') && recordBody.includes('counters.set(sessId, perSession)'))
  checkTrue('B3-14 三处内联实现已删（无 let perSession = jobOutputCallCounters.get(sessId)）',
    pluginSource.split('let perSession = jobOutputCallCounters.get(sessId)').length - 1 === 0)
  checkTrue('B3-15 监听器无局部 jobReason 二次判定（jobReason 0 命中）',
    pluginSource.split('jobReason').length - 1 === 0)
  checkTrue('B3-16 三类受保护角色均调用统一记录函数：调用点恰 3 处（加定义共 4 处），执行者分支无第 4 处调用',
    pluginSource.split('recordJobOutputCall(agent, exec, jobOutputCallCounters)').length - 1 === 3 && pluginSource.split('recordJobOutputCall(').length - 1 === 4)
  checkTrue('B3-17 首次判定已带 counters：planner 与只读 child 监听器调用点均传 jobOutputCallCounters',
    pluginSource.includes('plannerGateReason(exec, execEvents, exploreBudget(), jobOutputCallCounters)') && pluginSource.includes('childReadonlyGateReason(exec, probe, jobOutputCallCounters)'))
  // mutation 实现已下沉到 shell-mutation.js；根仅保留只读单点与主会话分支调用。
  checkTrue('B3-18 shellMutationReason 唯一实现；六格文案只剩两条模板；mutation 实现位于新模块且根只保留两处调用',
    pluginSource.split('function shellMutationReason(').length - 1 === 1
    && pluginSource.split('仅限只读探查命令').length - 1 === 2
    && pluginSource.split('pwshMutationMatches(exec)').length - 1 === 2
    && pluginSource.split('bashMutationMatches(exec)').length - 1 === 2
    && shellMutationSource.split('function mutationMatches(').length - 1 === 1
    && shellMutationSource.split('export function pwshMutationMatches(exec)').length - 1 === 1
    && shellMutationSource.split('export function bashMutationMatches(exec)').length - 1 === 1)
  checkTrue('B3-19 decisions 导出两个新函数（测试直接复用生产实现，无镜像副本）',
    typeof decisions.shellMutationReason === 'function' && typeof decisions.recordJobOutputCall === 'function')
}

// ④ 监听器级：job_output 子调用真实 re-entry（首次放行后记录、同 job 第二次拒绝）与组拒零副作用。
{
  const reEntryPlanner = plannerWithId('b3-reentry-planner', [DESC])
  const subExec = { rootCallId: 'b3-re-entry', parent: Symbol('b3-re-entry') }
  r = preExecute(harness, reEntryPlanner, 'job_output', { job_id: 'jr1' }, subExec)
  checkTrue('B3-20 planner run_code 内 job_output 子调用首次 re-entry → allow（容器计费口径不变）', r !== null && r !== undefined && r.kind === 'allow')
  r = preExecute(harness, reEntryPlanner, 'job_output', { job_id: 'jr1' }, subExec)
  checkTrue('B3-21 同 job 第二次 re-entry → deny 且含「job_output 禁止对同一 job 重复调用」（首次放行已记录）', r !== null && r !== undefined && r.kind === 'deny' && String(r.reason).includes('job_output 禁止对同一 job 重复调用'))
  const sideFxPlanner = plannerWithId('b3-group-deny-planner', [DESC])
  r = preExecute(harness, sideFxPlanner, 'run_code', { code: "await tools.job_output({ job_id: 'jg3' })\nawait tools.write({})", description: 'B3 组拒（write 成员）含 job_output 成员' })
  checkTrue('B3-22 组内含 job_output 成员的组拒 → deny（write 成员触发，文案不变）', r !== null && r !== undefined && r.kind === 'deny' && String(r.reason).includes('run_code 拆解预审未通过') && String(r.reason).includes('- write:'))
  r = preExecute(harness, sideFxPlanner, 'job_output', { job_id: 'jg3' })
  checkTrue('B3-23 组拒零副作用：该 job 直呼仍首次放行（组判定未写入计数器）', r !== null && r !== undefined && r.kind === 'allow')
}

// ── ⑯ GW 系列：闸门词单源（资产 YAML config.gateWords）运行时贯通 ──────────
// 口径：apply 从本次 config.gateWords 建运行时词表（缺失/非法同步抛错、零副作用）；
// 注册恰好 7 个 prompt variable；helper/状态机/闸门共用同一实例；旧词不得推进状态。
const GATE_VARIABLE_ORDER = ['extra_plan_route_direct', 'extra_plan_route_plan', 'extra_plan_route_disagree', 'extra_plan_approval_approve', 'extra_plan_approval_replan', 'extra_plan_purpose_refine', 'extra_plan_purpose_redo']
const GATE_FIELD_ORDER = ['routeDirect', 'routePlan', 'routeDisagree', 'approvalApprove', 'approvalReplan', 'purposeRefine', 'purposeRedo']
// 裸 harness（不合并 YAML 词表）：坏配置入口与独立实例用。
function rawHarness(config, listeners, variables) {
  const systemPrompt = { variable: (name, provider) => { variables.push({ name, provider }); return () => {} } }
  const ctx = {
    systemPrompt,
    get: (name) => (name === 'systemPrompt' ? systemPrompt : name === 'ptcRuntime' ? { language: 'typescript' } : undefined),
    on: (name, fn) => {
      if (listeners[name] === undefined) listeners[name] = []
      listeners[name].push(fn)
    },
    effect: (effectFn) => effectFn(),
    provide: (name, value) => { ctx[name] = value },
  }
  plugin.apply(ctx, config)
  return listeners
}
async function assembleWithVariables(listeners, agent, tools, sections, variables) {
  const entry = listeners['system-prompt/assemble']
  if (entry === undefined || entry.length === 0) throw new Error('assemble 监听器未注册')
  return await entry[0](null, { agent }, async () => ({ tools, sections, contexts: [], variables }))
}

check('GW1 合法配置 apply 恰好注册 7 个 prompt variable（名称与顺序）', harness.variables.map((item) => item.name), GATE_VARIABLE_ORDER)
check('GW2 provider 逐项返回当前 apply 的 config.gateWords 值', harness.variables.map((item) => item.provider({})), GATE_FIELD_ORDER.map((field) => assetGateWords[field]))
{
  // 坏配置：rawHarness 不合并默认词表 → 整组校验在 apply 内同步抛错，且此前零监听器/零变量副作用。
  const badListeners = {}
  const badVariables = []
  const badCases = [
    ['整组缺失', { anchoredBootstrap: false }],
    ['单键缺失', { anchoredBootstrap: false, gateWords: Object.assign({}, assetGateWords, { routePlan: undefined }) }],
    ['数组', { anchoredBootstrap: false, gateWords: [] }],
    ['重复值', { anchoredBootstrap: false, gateWords: Object.assign({}, assetGateWords, { approvalApprove: assetGateWords.routeDirect }) }],
  ]
  let allThrowWithPrefix = true
  for (const [label, config] of badCases) {
    let message = null
    try { rawHarness(config, badListeners, badVariables) } catch (error) { message = error instanceof Error ? error.message : String(error) }
    if (message === null || !message.startsWith('extra-plan: config.gateWords')) {
      allThrowWithPrefix = false
      console.log('     坏配置用例未按前缀抛错: ' + label + ' -> ' + String(message))
    }
  }
  checkTrue('GW3 坏配置（缺组/缺键/数组/重复值）apply 同步抛错且错误前缀为 extra-plan: config.gateWords', allThrowWithPrefix)
  check('GW4 坏配置抛错前零监听器/零变量副作用', [Object.keys(badListeners).length, badVariables.length], [0, 0])
}

// 定制七词：与出厂词无子串重叠（每词互不为子串，也不含出厂词片段）。
const CUSTOM_WORDS = { routeDirect: '甲直行', routePlan: '乙规划', routeDisagree: '丙否决', approvalApprove: '丁批准', approvalReplan: '戊转规划', purposeRefine: '己完整', purposeRedo: '庚重做' }
const customHarness = makeHarness({ anchoredBootstrap: false, gateWords: CUSTOM_WORDS })
const customRuntime = createGateRuntime(CUSTOM_WORDS)
const cRouteArgs = JSON.stringify({ questions: [{ id: 'q1', options: [{ label: '甲直行' }, { label: '乙规划' }, { label: '丙否决' }] }] })
const cPurposeArgs = JSON.stringify({ questions: [{ id: 'q1', options: [{ label: '己完整' }, { label: '庚重做' }] }] })
const cApprovalArgs = JSON.stringify({ questions: [{ id: 'q1', options: [{ label: '丁批准' }, { label: '戊转规划' }, { label: '丙否决' }] }] })
const cClarifyArgs = JSON.stringify({ questions: [{ id: 'q1', options: [{ label: '方案A' }, { label: '方案B' }] }] })
const FACTORY_WORDS_PATTERN = /直接执行|进行pro规划|不同意|同意执行|转交pro规划|完善方案|重新规划/

check('GW5 fresh apply：第二实例 variables 只含第二份 config 的词值', customHarness.variables.map((item) => item.provider({})), GATE_FIELD_ORDER.map((field) => CUSTOM_WORDS[field]))
check('GW6 第一实例 provider 不受第二实例影响（无跨 apply 缓存）', harness.variables.map((item) => item.provider({})).join('|'), GATE_FIELD_ORDER.map((field) => assetGateWords[field]).join('|'))

// 直呼路径（tool/call + tool/result）：定制词全链 direct / plan+refine / plan+redo / approve。
const cDirect = mainWithEvents([umE(), callE('ask_user_question', 'c1', cRouteArgs), okE('c1', answerE(['甲直行']))])
r = preExecute(customHarness, cDirect, 'write', {})
checkTrue('GW7 定制词「甲直行」直呼路由 → write 放行', r !== null && r !== undefined && r.kind === 'allow')
const cPlanRefine = mainWithEvents([umE(), callE('ask_user_question', 'c1', cRouteArgs), okE('c1', answerE(['乙规划'])), callE('ask_user_question', 'c2', cPurposeArgs), okE('c2', answerE(['己完整'])), callE('ask_user_question', 'c3', cClarifyArgs), okE('c3', answerE(['方案A']))])
check('GW8 定制词三锚点 → deriveFlowState plan/refine/clarified', decisions.deriveFlowState(cPlanRefine.session.snapshotEvents(), customRuntime), { route: 'plan', clarified: true, approved: false, purpose: 'refine', channelBroken: false })
r = preExecute(customHarness, cPlanRefine, 'subagent_plan', { run_in_background: true })
checkTrue('GW9 定制词 plan 态 → subagent_plan 放行', r !== null && r !== undefined && r.kind === 'allow')
const cApprove = mainWithEvents([umE(), callE('ask_user_question', 'c1', cRouteArgs), okE('c1', answerE(['乙规划'])), callE('ask_user_question', 'c2', cPurposeArgs), okE('c2', answerE(['庚重做'])), callE('ask_user_question', 'c3', cClarifyArgs), okE('c3', answerE(['方案A'])), callE('ask_user_question', 'c4', cApprovalArgs), okE('c4', answerE(['丁批准']))])
check('GW10 定制词「丁批准」→ approved + purpose=redo', decisions.deriveFlowState(cApprove.session.snapshotEvents(), customRuntime), { route: 'plan', clarified: true, approved: true, purpose: 'redo', channelBroken: false })
r = preExecute(customHarness, cApprove, 'subagent', { run_in_background: true })
checkTrue('GW11 定制词批准态 → subagent 委派放行', r !== null && r !== undefined && r.kind === 'allow')
const cReplan = mainWithEvents([umE(), callE('ask_user_question', 'c1', cRouteArgs), okE('c1', answerE(['乙规划'])), callE('ask_user_question', 'c2', cApprovalArgs), okE('c2', answerE(['戊转规划']))])
check('GW12 定制词「戊转规划」→ 未获批准', decisions.deriveFlowState(cReplan.session.snapshotEvents(), customRuntime).approved, false)
const cDisagree = mainWithEvents([umE(), callE('ask_user_question', 'c1', cRouteArgs), okE('c1', answerE(['丙否决']))])
check('GW13 定制词「丙否决」→ route 回 none', decisions.deriveFlowState(cDisagree.session.snapshotEvents(), customRuntime).route, 'none')

// 两代嵌套 dispatch（tool/ptc-dispatch(-start) 与 tool/code-dispatch(-start)）同链。
for (const generation of [['ptc', 'tool/ptc-dispatch-start', 'tool/ptc-dispatch'], ['code', 'tool/code-dispatch-start', 'tool/code-dispatch']]) {
  const label = generation[0]
  const startE = (sid, argsObj) => ({ type: generation[1], data: { rootCallId: 'r1', parentCallId: 'pc1', subCallId: sid, name: 'ask_user_question', arguments: argsObj } })
  const endE = (sid, text) => ({ type: generation[2], data: { rootCallId: 'r1', parentCallId: 'pc1', subCallId: sid, name: 'ask_user_question', arguments: {}, isError: false, content: [{ type: 'text', text }] } })
  const fullEvents = [
    umE(),
    startE('n1', JSON.parse(cRouteArgs)), endE('n1', answerE(['乙规划'])),
    startE('n2', JSON.parse(cPurposeArgs)), endE('n2', answerE(['庚重做'])),
    startE('n3', JSON.parse(cClarifyArgs)), endE('n3', answerE(['方案A'])),
    startE('n4', JSON.parse(cApprovalArgs)), endE('n4', answerE(['戊转规划'])),
  ]
  const state = decisions.deriveFlowState(fullEvents, customRuntime)
  checkTrue('GW14 ' + label + ' dispatch 定制词全链 → plan/redo/clarified/未批准', state.route === 'plan' && state.purpose === 'redo' && state.clarified === true && state.approved === false)
  r = preExecute(customHarness, mainWithEvents(fullEvents), 'subagent', { run_in_background: true })
  checkTrue('GW15 ' + label + ' dispatch「戊转规划」→ subagent deny 且文案只含当前定制批准词', r !== null && r !== undefined && r.kind === 'deny' && String(r.reason).includes('戊转规划') && !FACTORY_WORDS_PATTERN.test(String(r.reason)))
  const approveEvents = [
    umE(),
    startE('n1', JSON.parse(cRouteArgs)), endE('n1', answerE(['乙规划'])),
    startE('n2', JSON.parse(cPurposeArgs)), endE('n2', answerE(['己完整'])),
    startE('n3', JSON.parse(cClarifyArgs)), endE('n3', answerE(['方案A'])),
    startE('n4', JSON.parse(cApprovalArgs)), endE('n4', answerE(['丁批准'])),
  ]
  r = preExecute(customHarness, mainWithEvents(approveEvents), 'subagent', { run_in_background: true })
  checkTrue('GW16 ' + label + ' dispatch「丁批准」→ subagent 委派放行', r !== null && r !== undefined && r.kind === 'allow')
}

// 旧出厂词负例：定制 runtime 下旧词不得推进任何状态，deny 文案只含当前定制词。
const oldWordEvents = [umE(), callE('ask_user_question', 'o1', routeArgsE), okE('o1', answerE(['直接执行'])), callE('ask_user_question', 'o2', purposeArgsE), okE('o2', answerE(['完善方案'])), callE('ask_user_question', 'o3', approvalArgsE), okE('o3', answerE(['同意执行']))]
check('GW17 定制 runtime 下提交旧出厂词 → route/purpose/approved 全部未确认', decisions.deriveFlowState(oldWordEvents, customRuntime), { route: 'none', clarified: false, approved: false, purpose: 'none', channelBroken: false })
const oldWordMain = mainWithEvents(oldWordEvents)
r = preExecute(customHarness, oldWordMain, 'write', {})
checkTrue('GW18 旧词不得推进 → write deny 且文案含当前定制三词、不含任何出厂词', r !== null && r !== undefined && r.kind === 'deny' && String(r.reason).includes('「甲直行」「乙规划」「丙否决」') && !FACTORY_WORDS_PATTERN.test(String(r.reason)))
r = preExecute(customHarness, oldWordMain, 'subagent', { run_in_background: true })
checkTrue('GW19 旧词不得推进 → subagent deny 且文案只含当前定制批准词', r !== null && r !== undefined && r.kind === 'deny' && String(r.reason).includes('丁批准') && !FACTORY_WORDS_PATTERN.test(String(r.reason)))
{
  const suffixState = decisions.deriveFlowState([umE(), callE('ask_user_question', 's1', cRouteArgs), okE('s1', answerE(['甲直行（推荐）']))], customRuntime)
  check('GW20 当前词带白名单推荐后缀 → 归一后精确匹配（direct）', suffixState.route, 'direct')
  const variantState = decisions.deriveFlowState([umE(), callE('ask_user_question', 'v1', cRouteArgs), okE('v1', answerE(['甲直行!']))], customRuntime)
  check('GW21 当前词的非白名单变体（! 等额外字符）→ 不推进（禁止 indexOf 子串）', variantState.route, 'none')
  const oldWordSuffixState = decisions.deriveFlowState([umE(), callE('ask_user_question', 'v2', cRouteArgs), okE('v2', answerE(['直接执行（推荐）']))], customRuntime)
  check('GW22 旧词带推荐后缀 → 仍不推进', oldWordSuffixState.route, 'none')
}

// A/C/M/F-L 装配投影：variables 哨兵必须在普通/过滤/anchored native-both/PTC/later 全部保留。
{
  const sentinel = { extra_plan_route_direct: 'SENTINEL-DIRECT', extra_plan_route_plan: 'SENTINEL-PLAN' }
  const sentinelTools = [{ name: 'read' }, { name: 'pwsh' }, { name: 'run_code' }]
  const ptcSections = [{ name: 'tools:ptc-only', text: 'Only the run_code transport is directly callable.' }, { name: 'tools:sdk', text: 'SDK-OLD' }]
  const plain = await assembleWithVariables(harness, mainAgent, sentinelTools, [{ name: 'tools:sdk', text: 'SDK-OLD' }], sentinel)
  check('GW23 非 anchored 过滤投影保留 variables', plain.variables, sentinel)
  const anchoredPtc = await assembleWithVariables(harnessBoot, mainAgent, sentinelTools, ptcSections, sentinel)
  check('GW24 anchored 首轮 PTC 投影保留 variables', anchoredPtc.variables, sentinel)
  const anchoredNative = await assembleWithVariables(harnessBoot, mainAgent, sentinelTools, [{ name: 'matrix-user-section', text: 'x' }], sentinel)
  check('GW25 anchored 首轮 native/both 投影保留 variables', anchoredNative.variables, sentinel)
  const laterAgent = mainWithEvents([callE('read', 'later-1')])
  const laterAssembly = await assembleWithVariables(harnessBoot, laterAgent, sentinelTools, ptcSections, sentinel)
  check('GW26 anchored later 恢复原 persona 变量引用且保留 variables', laterAssembly.variables, sentinel)
  const plannerAssembly = await assembleWithVariables(harnessBoot, plannerAgent, sentinelTools, ptcSections, sentinel)
  check('GW27 anchored 首轮 planner PTC 投影保留 variables', plannerAssembly.variables, sentinel)
}

// ── ⑬ live-config 构造期读盘（方案 A 新增回归） ─────────────────────────
// 方案 A 缺口的真实形状：宿主在「新会话 apply」时传入的 cfg 可能是改文件**之前**的快照；
// 若基线只取该快照、且文件 mtimeMs+size 恰好未变，实例第一拍就会拿到旧值。以下 5 条覆盖：
// ①显式 configPath ②env 路径（DSH_EXTRA_PLAN_CONFIG_PATH）③apply 集成双向对照（旧快照 vs 文件
// 真值）④文件改写后 stamp 变化仍跟进 ⑤读盘失败（文件不存在）构造期回退 fallback。
{
  const lcDir = mkdtempSync(join(tmpdir(), 'dsh-extra-plan-live-config-'))
  // 夹具 = profile patch 内的 settings 行（0.1.7 新载体：captureRowSettings 按
  // id='dsh-extra-plan-settings' + config.<key> 定位），exploreBudget 取与内置默认 18
  // 不同的值，确保「读到文件」与「回退 fallback」可区分。
  const lcFixture = (anchored, budget) => '- id: dsh-extra-plan-settings\n  config:\n    anchoredBootstrap: ' + anchored + '\n    runcodeCatchGate: true\n    exploreBudget: ' + budget + '\n'
  const lcOffFile = join(lcDir, 'agent-off.cordis.yml')
  const lcOnFile = join(lcDir, 'agent-on.cordis.yml')
  writeFileSync(lcOffFile, lcFixture(false, 7), 'utf8')
  writeFileSync(lcOnFile, lcFixture(true, 7), 'utf8')

  // ① 显式 configPath：构造完成即可取到文件真值，不需要任何 stamp 变化
  const lcExplicit = createLiveConfig({ configPath: lcOffFile, fallbackDefaults: { exploreBudget: 18, runcodeCatchGate: false, anchoredBootstrap: true } })
  check('LC1 构造期读盘（显式 configPath）：首次取值即文件值 exploreBudget=7（fallback 18 未生效）', lcExplicit.exploreBudget, 7)
  check('LC1b 构造期读盘：布尔键同样首拍取文件真值（runcodeCatchGate=true 覆盖 fallback false）', lcExplicit.runcodeCatchGate, true)

  const lcSavedConfigPath = process.env.DSH_EXTRA_PLAN_CONFIG_PATH
  try {
    // ② 路径决议 env 分支（测试隔离已清空该变量，此处临时指向夹具文件）
    process.env.DSH_EXTRA_PLAN_CONFIG_PATH = lcOffFile
    const lcByEnv = createLiveConfig({ fallbackDefaults: { exploreBudget: 18 } })
    check('LC2 构造期读盘（DSH_EXTRA_PLAN_CONFIG_PATH）：首次取值即文件值 exploreBudget=7', lcByEnv.exploreBudget, 7)

    // ③ apply 集成双向对照：传入 cfg 快照与文件真值相反时，首拍装配必须听文件（判据 = 是否注入
    //    extra-plan-bootstrap 段；anchoredBootstrap 的唯一装配读点在本插件 pre-step 装配路径）。
    const lcTools = [{ name: 'read' }, { name: 'pwsh' }, { name: 'run_code' }]
    const lcSections = [{ name: 'tools:ptc-only', text: 'Only the run_code transport is directly callable.' }]
    const lcOldTrueHarness = makeHarness({ anchoredBootstrap: true })
    const lcOldTrueAssembly = await assemble(lcOldTrueHarness, mainAgent, lcTools, lcSections)
    checkTrue('LC3 旧快照(true) vs 文件真值(false)：首拍装配不注入 extra-plan-bootstrap（文件真值胜出）', !lcOldTrueAssembly.sections.some((section) => section.name === 'extra-plan-bootstrap'))
    process.env.DSH_EXTRA_PLAN_CONFIG_PATH = lcOnFile
    const lcOldFalseHarness = makeHarness({ anchoredBootstrap: false })
    const lcOldFalseAssembly = await assemble(lcOldFalseHarness, mainAgent, lcTools, lcSections)
    checkTrue('LC3b 反向对照：旧快照(false) vs 文件真值(true) → 首拍装配注入 extra-plan-bootstrap（判据敏感）', lcOldFalseAssembly.sections.some((section) => section.name === 'extra-plan-bootstrap'))
  } finally {
    if (lcSavedConfigPath === undefined) delete process.env.DSH_EXTRA_PLAN_CONFIG_PATH
    else process.env.DSH_EXTRA_PLAN_CONFIG_PATH = lcSavedConfigPath
  }

  // ④ 后续取值仍走 mtimeMs+size 变更检测：文件改写（size 同步变化）→ 取值跟进
  writeFileSync(lcOffFile, lcFixture(false, 421), 'utf8')
  check('LC4 文件改写后 stamp 变化 → 取值跟进 exploreBudget=421', lcExplicit.exploreBudget, 421)

  // ⑤ 读盘失败（文件不存在）→ 构造期回退 fallbackDefaults 且不抛（自带一次 console.warn 防抖）
  const lcMissing = createLiveConfig({ configPath: join(lcDir, 'missing.cordis.yml'), fallbackDefaults: { exploreBudget: 18 } })
  check('LC5 文件不存在 → 构造期回退 fallback exploreBudget=18（不抛）', lcMissing.exploreBudget, 18)

  rmSync(lcDir, { recursive: true, force: true })
}

// ── ⑮（DZ 段）PTC 闸门拒绝中文呈现与状态机连带修复（2026-09-23 新增） ────────
// 编号沿用方案步骤 7 的「⑮ 段」口径（脚本内既有 ⑮ 为创造模式装配投影矩阵段，两段各归各的）。
// 覆盖：parse 函数 denied 判别（DZ1-DZ3 嵌套 / DZ4-DZ6 native 直呼与通道码）、状态机
// 「闸门拒绝不重置、取消仍清四字段」对照（DZ7/DZ8）、tools/post-execute 呈现改写（DZ9-DZ12）。
// 全部经 makeHarness 注册的真实监听器与真实 gateRuntime 词表；拒绝文案取闸门产物，不自造第二份。
{
  // 真实拒绝产物（purposeRouteDenyReason 经 mainGateReason 返回；direct 态精确目的 ask 必拒）
  const dzDeny = preExecute(harness, directMain, 'ask_user_question', JSON.parse(purposeArgsE), { sub: true, rootCallId: 'rc-1', parent: 'rc-1' })
  const dzDenyOk = dzDeny !== null && dzDeny !== undefined && dzDeny.kind === 'deny'
  const dzReason = dzDenyOk ? String(dzDeny.reason) : ''
  const dzText = 'Error: ' + dzReason
  // post-execute 宿主失败结果形状（逐字同宿主证据链：error.message 带英文包装与 worker.cjs 堆栈）
  const dzFailOf = (reason) => ({
    isError: true,
    error: { message: 'Error: code run failed (exception): ToolCallError: ' + reason + '\n    at bindingFailure (file:///D:/app/node_modules/@deepseek-ai/dsh-code-runtime/lib/worker.cjs:759:22)' },
    content: [{ type: 'text', text: 'Error: code run failed (exception): ToolCallError: ' + reason }],
  })
  const dzEntry = harness['tools/post-execute']
  const dzHook = dzEntry !== undefined && Array.isArray(dzEntry) && dzEntry.length > 0 ? dzEntry[0] : null
  const dzPass = { kind: 'accept', marker: 'passthrough' }
  const dzNext = () => dzPass

  // DZ1：嵌套（PTC）闸门拒绝文案（isError:true、无错误码）→ denied（不重置的判别入口）
  check('DZ1 parseDispatchAskResult 嵌套闸门拒绝中文文案 → denied', parseDispatchAskResult({ subCallId: 'x', isError: true, content: [{ type: 'text', text: 'Error: 目的确认 ask 未按路由顺序：须先 ask_user_question 路由确认（选项固定为「直接执行」「进行pro规划」「不同意」），选择「进行pro规划」后再询问规划目的（目的选项固定为「完善方案」「重新规划」）' }] }), { callId: 'x', kind: 'denied', code: '' })
  // DZ2：嵌套宿主取消句（HOST_ASK_CANCEL_TEXTS 逐字常量）→ error（取消清四字段语义保留）
  check('DZ2 parseDispatchAskResult 宿主取消句 → error（不误判为拒绝）', parseDispatchAskResult({ subCallId: 'x', isError: true, content: [{ type: 'text', text: 'Error: ask_user_question was aborted before the user answered' }] }), { callId: 'x', kind: 'error', code: '' })
  // DZ3：正常答复路径行为与改动前逐字一致
  check('DZ3 parseDispatchAskResult 正常答复 → ok/answersLen/selected 逐字不变', parseDispatchAskResult({ subCallId: 'x', content: [{ type: 'text', text: answerE(['完善方案 (Recommended)']) }] }), { callId: 'x', kind: 'ok', answersLen: 1, selected: ['完善方案 (Recommended)'] })
  // DZ4：native 直呼闸门拒绝（信封 isError:true、无 data.error）→ denied（修正原 kind:'ok' 误判）
  check('DZ4 parseAskResultData 信封 isError:true 中文文案 → denied', parseAskResultData({ message: { content: [{ type: 'tool-result', toolCallId: 'call_x', isError: true, content: [{ type: 'text', text: 'Error: 路由 ask 结构错误：请按标准模板重提' }] }] } }), { callId: 'call_x', kind: 'denied', code: '' })
  // DZ5/DZ6：data.error 路径（native 取消码 / 通道码）逐字不变
  check('DZ5 parseAskResultData data.error=ASK_CANCELLED → error（native 取消路径不变）', parseAskResultData(errE('call_c', 'ASK_CANCELLED').data), { callId: 'call_c', kind: 'error', code: 'ASK_CANCELLED' })
  check('DZ6 parseAskResultData data.error=NO_PROVIDER → error（通道码路径不变）', parseAskResultData(errE('call_p', 'NO_PROVIDER').data), { callId: 'call_p', kind: 'error', code: 'NO_PROVIDER' })

  // DZ7/DZ8：状态机双对照（同一事件序，仅结果文案不同）
  const dzStart = (sid, argsObj) => ({ type: 'tool/ptc-dispatch-start', data: { rootCallId: 'rc-1', parentCallId: 'pc-1', subCallId: sid, name: 'ask_user_question', arguments: argsObj } })
  const dzEnd = (sid, text) => ({ type: 'tool/ptc-dispatch', data: { rootCallId: 'rc-1', parentCallId: 'pc-1', subCallId: sid, name: 'ask_user_question', arguments: {}, isError: true, content: [{ type: 'text', text }] } })
  const dzRouteOk = [umE(), callE('ask_user_question', 'a1', routeArgsE), okE('a1', answerE(['进行pro规划']))]
  const dzDeniedEvents = dzRouteOk.concat([dzStart('n2', JSON.parse(purposeArgsE)), dzEnd('n2', dzText)])
  check('DZ7 闸门拒绝不重置：route ask ok（plan）→ purpose 被拒 → route 仍 plan、阶段状态不动', deriveFlowState(dzDeniedEvents, gateRuntime), { route: 'plan', clarified: false, approved: false, purpose: 'none', channelBroken: false })
  const dzCancelEvents = dzRouteOk.concat([dzStart('n2', JSON.parse(purposeArgsE)), dzEnd('n2', 'Error: ask_user_question was aborted before the user answered')])
  check('DZ8 取消仍清四字段：route ask ok（plan）→ purpose 取消（宿主取消句）→ route 回 none', deriveFlowState(dzCancelEvents, gateRuntime), { route: 'none', clarified: false, approved: false, purpose: 'none', channelBroken: false })

  // DZ9：钩子命中（记录来自上面真实 deny；rootCallId rc-1）
  const dzOut9 = dzHook === null ? null : dzHook({ agent: mainAgent, name: 'run_code', callId: 'rc-1', rootCallId: 'rc-1' }, dzFailOf(dzReason), dzNext)
  checkTrue('DZ9 post-execute 命中：content 改写为「Error: <真实 deny reason>」且无英文包装/堆栈', dzDenyOk && dzHook !== null && dzOut9 !== null && JSON.stringify(dzOut9) === JSON.stringify({ kind: 'accept', content: [{ type: 'text', text: dzText }] }) && !String(dzOut9.content[0].text).includes('code run failed') && !String(dzOut9.content[0].text).includes('bindingFailure') && !String(dzOut9.content[0].text).includes('worker.cjs'))
  // DZ10：无记录 → next() 透传（原样返回 next 结果，不改写）
  const dzOut10 = dzHook === null ? null : dzHook({ agent: mainAgent, name: 'run_code', callId: 'rc-none', rootCallId: 'rc-none' }, dzFailOf('未记录的其它失败原因'), dzNext)
  checkTrue('DZ10 无记录 → next() 透传（result 不被改写）', dzOut10 === dzPass)
  // DZ11：exec.name!=='run_code' → 透传；且记录不被消费（随后同名 rootCallId 的 run_code 仍命中）
  const dz11Pre = preExecute(harness, directMain, 'ask_user_question', JSON.parse(purposeArgsE), { sub: true, rootCallId: 'rc-11', parent: 'rc-11' })
  const dz11Reason = dz11Pre !== null && dz11Pre !== undefined && dz11Pre.kind === 'deny' ? String(dz11Pre.reason) : ''
  const dzOut11 = dzHook === null ? null : dzHook({ agent: mainAgent, name: 'write', callId: 'rc-11', rootCallId: 'rc-11' }, dzFailOf(dz11Reason), dzNext)
  const dzHit11 = dzHook === null ? null : dzHook({ agent: mainAgent, name: 'run_code', callId: 'rc-11', rootCallId: 'rc-11' }, dzFailOf(dz11Reason), dzNext)
  checkTrue('DZ11 exec.name!==run_code → 透传（且记录未消费：同名 run_code 随后仍命中）', dzOut11 === dzPass && dzHit11 !== null && dzHit11 !== dzPass && String(dzHit11.content[0].text) === 'Error: ' + dz11Reason)
  // DZ12：消费即清——rc-1 记录已在 DZ9 被消费，第二次调用（同一 rootId）透传
  const dzOut12 = dzHook === null ? null : dzHook({ agent: mainAgent, name: 'run_code', callId: 'rc-1', rootCallId: 'rc-1' }, dzFailOf(dzReason), dzNext)
  checkTrue('DZ12 消费即清：同一 rootId 第二次调用 → 透传', dzOut12 === dzPass)
}

// ── ⑰ T9-3 新契约硬门槛：isolate / volatile / 写链 / 声明行覆盖（2026-09-24） ────────
// 四组断言全部机械可核对：isolate 名单（预设挂载必过审计）、settings 行 Config 8 字段
// 全 volatile、2 项宿主行写链（声明行 plugins 整体重述）、声明行与生成产物一致性。
{
  // ① isolate：三组名单 ⊇ {subagentModelSelection, toolResultPruner, workflowEngine} 且值全 true。
  const requiredIsolate = ['subagentModelSelection', 'toolResultPruner', 'workflowEngine']
  const isolateGroups = all.filter((row) => row.group === true)
  const isolateMap = {}
  for (const group of isolateGroups) {
    if (group.isolate === undefined || group.isolate === null) continue
    for (const [name, value] of Object.entries(group.isolate)) {
      isolateMap[name] = isolateMap[name] === undefined ? [group.id, value] : [isolateMap[name][0] + ',' + group.id, isolateMap[name][1] && value]
      if (isolateMap[name][1] !== true) isolateMap[name][1] = value
    }
  }
  checkTrue('T9-3f 预设三组 isolate 名单 ⊇ {subagentModelSelection, toolResultPruner, workflowEngine}', requiredIsolate.every((name) => Object.prototype.hasOwnProperty.call(isolateMap, name)))
  checkTrue('T9-3g 三组 isolate 值全部 === true（禁止具名字符串 label）', Object.values(isolateMap).every((entry) => entry[1] === true) && requiredIsolate.every((name) => isolateMap[name][1] === true))
  const delegationRow = all.find((row) => row.id === 'delegation')
  const compactionRow = all.find((row) => row.id === 'compaction')
  const extraPlanGroupRow = all.find((row) => row.id === 'extra-plan-group')
  checkTrue('T9-3h delegation/compaction/extra-plan-group 各自带 isolate 键且覆盖必要项',
    delegationRow.isolate.subagentModelSelection === true && delegationRow.isolate.workflowEngine === true &&
    compactionRow.isolate.toolResultPruner === true &&
    extraPlanGroupRow.isolate !== undefined && Object.keys(extraPlanGroupRow.isolate).length > 0)

  // ② 生成产物：声明行存在 + plugins 行 id 集合覆盖资产 + 生成物与资产顶层条目逐行一致
  const generatedPatchText = readFileSyncE(ASSET_PATCH_FILE_E, 'utf8')
  checkTrue('T9-3i 生成产物含声明行 "- id: preset-extra-plan" 且下一行 name 为 @deepseek-ai/dsh-agent-preset',
    generatedPatchText.includes('    - id: preset-extra-plan\n      name: \'@deepseek-ai/dsh-agent-preset\'\n'))
  const generatedDoc = yaml.load(generatedPatchText, { schema })
  const generatedPlugins = generatedDoc[0].insert[0].config.plugins
  checkTrue('T9-3j 生成产物 plugins 行 id 集合覆盖资产顶层条目（declarationCoversAsset）且行数一致', declarationCoversAssetE(generatedPlugins) && pluginRowIdsE(generatedPlugins).length === pluginRowIdsE(rows).length)
  const assetTop = presetText.slice(presetText.indexOf('- id: persona')).replace(/\n+$/, '')
  const genPluginsText = generatedPatchText.slice(generatedPatchText.indexOf('        plugins:\n') + 17).replace(/\n+$/, '')
  const stripped = genPluginsText.split('\n').map((line) => (line.startsWith('          ') ? line.slice(10) : line)).join('\n')
  checkTrue('T9-3k 生成产物 plugins 与资产顶层条目逐行逐字一致（仅平移 10 列缩进）', stripped === assetTop)

  // ③ settings 行 Config：8 字段全 volatile（源码文本静态核对）+ 2 项宿主行 descriptor 分组
  const settingsText = readFileSyncE(fileURLToPath(new URL('../../plugins/dsh-extra-plan/lib/settings.js', import.meta.url)), 'utf8')
  // 只取代码行（剥注释），避免注释里的示例（如官方 maxParallelToolCalls 习语）混进字段集合。
  const settingsCodeOnly = settingsText.split('\n').filter((line) => !line.trim().startsWith('//')).join('\n')
  const configBody = settingsCodeOnly.slice(settingsCodeOnly.indexOf('export const Config = z.object({'), settingsCodeOnly.indexOf('})', settingsCodeOnly.indexOf('export const Config = z.object({')))
  const volatileKeys = [...configBody.matchAll(/([A-Za-z][A-Za-z0-9]*):\s*z\.[^\n]*?\.volatile\(\)/g)].map((match) => match[1])
  check('T9-3l settings 行 Config 恰 8 字段且每字段链 .volatile()', volatileKeys.slice().sort().join('|'), ['anchoredBootstrap', 'creativeMode', 'crossProviderPlannerModel', 'exploreBudget', 'otherAgentModel', 'plannerModel', 'plannerPromptSuffix', 'runcodeCatchGate'].sort().join('|'))
  checkTrue('T9-3m exploreBudget 为整数字段（z.number().step(1).min(1)）且默认 18、链 .volatile()', configBody.includes('exploreBudget: z.number().step(1).min(1).default(18).volatile()'))
  const settingsCode = settingsCodeOnly
  checkTrue('T9-3n settings.js 代码段无 settings.register / ExtraPlanSettingsSchema / 旧预设目录写入',
    !settingsCode.includes('settings.register') && !settingsCode.includes('ExtraPlanSettingsSchema') &&
    !settingsCode.includes('.agent-presets') && settingsCode.includes("child.settings.configure({ auto: false }, ctx.fiber)"))
  check('T9-3o descriptor 分组：extra-plan 恰 8 项、host-rows 恰 2 项', EXTRA_PLAN_SETTING_DEFINITIONS_E.length + '|' + SETTING_DEFINITIONS_E.filter((item) => item.group === SETTING_GROUPS_E.HOST_ROWS).length, '8|2')
  checkTrue('T9-3p 新载体行 id 常量与声明行一致', SETTINGS_ROW_ID_E === 'dsh-extra-plan-settings' && PRESET_ROW_ID_E === 'preset-extra-plan')

  // ④ 写链：2 项宿主行经 configEditor.edit 整体重述声明行 plugins（restatePresetPlugins 纯函数行为）
  const declared = generatedPlugins
  const restated = restatePresetPluginsE({ plugins: declared }, {}, { hostRowConfig: { 'tool-web': { fetch: true }, 'tool-presentation': { mode: 'ptc' } }, gateWords: null })
  const webRow = restated.plugins.find((row) => row.id === 'tool-web')
  const presentRow = restated.plugins.find((row) => row.id === 'tool-presentation')
  checkTrue('T9-3q restatePresetPlugins 整体重述 plugins：tool-web.fetch/tool-presentation.mode 落位且其余行原样',
    webRow.config.fetch === true && presentRow.config.mode === 'ptc' && webRow.config.searchTimeoutMs === 60000 &&
    pluginRowIdsE(restated.plugins).length === pluginRowIdsE(declared).length && declared.find((row) => row.id === 'tool-web').config.fetch === false)
  let gateThrew = false
  try { restatePresetPluginsE({ plugins: declared }, {}, { hostRowConfig: {}, gateWords: { routeDirect: '只有一个词' } }) } catch { gateThrew = true }
  checkTrue('T9-3r gateWords 整组校验失败即抛（不落盘语义）', gateThrew)
  const gateOk = restatePresetPluginsE({ plugins: declared }, {}, { hostRowConfig: {}, gateWords: assetGateWords })
  const gateRow = findPluginsRowE(gateOk.plugins, 'extra-plan')
  checkTrue('T9-3s gateWords 合法整组写回 extra-plan 行 config.gateWords', gateRow !== null && JSON.stringify(gateRow.config.gateWords) === JSON.stringify(assetGateWords))
  checkTrue('T9-3t settings.js 写链文本只经 configEditor.edit（无直写 cordis.patch.yml）',
    settingsText.includes('editor.edit(') && settingsText.includes('restatePresetPlugins') && !settingsText.includes('writeFileSync'))
}

console.log('\n通过 ' + pass + ', 失败 ' + fail)
process.exit(fail === 0 ? 0 : 1)
