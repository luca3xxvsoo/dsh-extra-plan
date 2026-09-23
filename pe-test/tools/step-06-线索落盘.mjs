// save_probe 注册层 + 硬闸门五态 + planner 预算回归（v1 口径）验证（v3）：
// ①注册层断言（mock ctx 走插件 apply：主会话 save_probe 幂等 + save_plan（受限规划工件，任意路由态放行）/
//   planner save_plan / executor 均不注册）
// ②pre-execute save_probe 五态闸门（none→deny、plan 未澄清→deny、非通道取消后五字段清理→deny、
//   plan 已澄清且目的已定→allow、direct→deny、channelBroken→allow；deny 文案含「探查线索未放行」）
// ②b pre-execute save_plan 五态闸门（D8-B，主会话：受限规划工件，任意路由态→allow）
// ③planner 预算回归（v1 口径）：18 次成功配对耗尽后 read（含线索文件路径）仍 deny
//   （reason 含「探查预算已耗尽」）、save_plan 仍 allow——不引入任何预算豁免。
// ④执行层冒烟（真实落盘）：save_plan 双写 / save_probe 单写 + journal 双形状自愈。
// ⑤持久化事务逐阶段故障注入（P0-3）：atomicCommit/recoverJournals 各自的末位可选 fs 依赖桩
//   （无全局 monkeypatch）——正常双写、tmp 写失败、journal 已落盘后写桩抛错（pre-journal 条件清理
//   成功/失败）、两次 rename 失败、最终删 journal 失败、目标确认失败、恢复 rename 失败与缺失目标保护。
import { pathToFileURL, fileURLToPath } from 'node:url'
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, readdirSync, rmSync, renameSync, unlinkSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const PLUGIN_PATH = fileURLToPath(new URL('../../plugins/dsh-extra-plan/index.js', import.meta.url))
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
const isolatedDshHome = mkdtempSync(join(tmpdir(), 'dsh-extra-plan-step06-home-'))
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
import { DEFAULT_EXPLORE_BUDGET } from '../../plugins/dsh-extra-plan/lib/preset-defaults.generated.js'
import { parsePresetYaml } from '../../plugins/dsh-extra-plan/lib/preset-settings.js'
import { createGateRuntime } from '../../plugins/dsh-extra-plan/lib/gate-words.js'
const { deriveFlowState } = plugin.decisions

// ── 闸门词注入（与 step-04 同口径） ──────────────────────────────────────
// 插件在 apply 里对 config.gateWords 做整组严格校验：缺失/非法同步抛错。故所有 harness
// 必须先从【资产 YAML】解析 extra-plan config，再合并 gateWords 后 apply——测试不手写词值。
const ASSET_AGENT_FILE = fileURLToPath(new URL('../../plugins/dsh-extra-plan/assets/presets/extra-plan/agent.cordis.yml', import.meta.url))
function flattenRows(list) {
  const out = []
  for (const row of list) {
    if (row === null || typeof row !== 'object') continue
    out.push(row)
    if (row.group === true && Array.isArray(row.config)) out.push(...flattenRows(row.config))
  }
  return out
}
const assetExtraPlanConfig = flattenRows(parsePresetYaml(readFileSync(ASSET_AGENT_FILE, 'utf8'))).find((row) => row.id === 'extra-plan').config
const assetGateWords = assetExtraPlanConfig.gateWords
const gateRuntime = createGateRuntime(assetGateWords)
/** 合并资产 YAML 的 gateWords（调用方显式值优先，便于坏配置用例覆盖）。 */
function withGateWords(config) { return { gateWords: assetGateWords, ...config } }
/** ctx.systemPrompt mock：记录 variable 注册（当前 agent scope，恰 7 个）。 */
function systemPromptMock(registry) {
  return { variable: (name, provider) => { registry.push({ name, provider }); return () => {} } }
}

// P0-3：持久化函数直连导入（故障注入用；与 index.js 注入给 save 工具工厂的是同一模块实例）
const PERSISTENCE_PATH = fileURLToPath(new URL('../../plugins/dsh-extra-plan/lib/save-persistence.js', import.meta.url))
const { atomicCommit, recoverJournals } = await import(pathToFileURL(PERSISTENCE_PATH).href)

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

// ── 事件构造（同 step-00-全流程回归.mjs 真实形状） ─────────────────────
const DESC = { type: 'subagent/descriptor', data: { mode: 'continuable' } }
const um = () => ({ type: 'user/message', data: { source: { kind: 'user' } } })
const umk = (kind) => ({ type: 'user/message', data: { source: { kind } } })
const call = (name, cid, argumentsStr = '{}') => ({ type: 'tool/call', data: { name, callId: cid, arguments: argumentsStr } })
const ok = (cid, text) => ({ type: 'tool/result', data: { message: { content: [{ type: 'tool-result', toolCallId: cid, content: [{ type: 'text', text }] }] } } })
const err = (cid, code) => ({ type: 'tool/result', data: { error: { name: 'Error', ...(code === undefined ? {} : { code }) }, message: { content: [{ type: 'tool-result', toolCallId: cid, content: [] }] } } })
const routeArgs = JSON.stringify({ questions: [{ id: 'q1', options: [{ label: '直接执行' }, { label: '进行pro规划' }, { label: '不同意' }] }] })
const clarifyArgs = JSON.stringify({ questions: [{ id: 'q1', options: [{ label: '方案A' }, { label: '方案B' }] }] })
const purposeArgs = JSON.stringify({ questions: [{ id: 'q1', options: [{ label: '完善方案' }, { label: '重新规划' }] }] })
const approvalArgs = JSON.stringify({ questions: [{ id: 'q1', options: [{ label: '同意执行' }, { label: '转交pro规划' }, { label: '不同意' }] }] })
const answer = (labels) => JSON.stringify({ answers: labels.map((l) => ({ id: 'q1', selected: [l] })) })

// ── mock ctx harness（ctx.get 按 name==='tools' 返回注册表） ─────────────
function makeHarness(config, toolsMock) {
  const listeners = {}
  const variables = []
  const ctx = {
    systemPrompt: systemPromptMock(variables),
    get: (name) => (name === 'tools' ? toolsMock : undefined),
    on: (name, fn) => {
      if (listeners[name] === undefined) listeners[name] = []
      listeners[name].push(fn)
    },
    effect: (fn) => fn(),
    provide: (name, value) => {
      ctx[name] = value
    },
  }
  plugin.apply(ctx, withGateWords(config))
  listeners.variables = variables
  return listeners
}
const registered = []
const toolsMock = { register: (t) => registered.push(t) }
const agentCtx = { get: (name) => (name === 'tools' ? toolsMock : undefined) }
const harness = makeHarness({ anchoredBootstrap: false }, toolsMock)

const mainAgent = { session: { header: { id: 'main-1', cwd: 'C:/work' }, snapshotEvents: () => [] }, options: {}, ctx: agentCtx }
const plannerAgent = { session: { header: { id: 'planner-1', origin: 'subagent', delegationDepth: 1, parentSession: 'parent-1', cwd: 'C:/work' }, snapshotEvents: () => [DESC] }, options: { model: 'deepseek-v4-pro' }, ctx: agentCtx }
const executorAgent = { session: { header: { id: 'exec-1', origin: 'subagent', delegationDepth: 1, parentSession: 'parent-1', cwd: 'C:/work' }, snapshotEvents: () => [] }, options: {}, ctx: agentCtx }

function fireSessionStart(listeners, agent) {
  const entry = listeners['agent/session-start']
  if (entry === undefined || entry.length === 0) throw new Error('session-start 监听器未注册')
  for (const fn of entry) fn({ agent })
}
// T3 前置修复：pre-step 是宿主 waterfall——必须逐个 await 全部监听器，
// 否则只取 [0] 只命中创造目录投影处理器，注册处理器（排在其后）永不执行。
async function firePreStep(listeners, agent, defaultDecision) {
  const entry = listeners['agent/pre-step']
  if (entry === undefined || entry.length === 0) throw new Error('pre-step 监听器未注册')
  const fallback = defaultDecision !== undefined && defaultDecision !== null ? defaultDecision : { kind: 'enter', messages: [] }
  const chain = (i) => {
    if (i >= entry.length) return Promise.resolve(fallback)
    return Promise.resolve(entry[i]({ agent }, () => chain(i + 1)))
  }
  return chain(0)
}
function preExecute(listeners, agent, name, argumentsObj) {
  const entry = listeners['tools/pre-execute']
  if (entry === undefined || entry.length === 0) throw new Error('pre-execute 监听器未注册')
  return entry[0]({ agent, name, arguments: argumentsObj }, () => ({ kind: 'allow' }))
}

// ── ① 注册层断言（[任务3]） ─────────────────────────────────────────────
registered.length = 0
fireSessionStart(harness, mainAgent)
await firePreStep(harness, mainAgent)
await firePreStep(harness, mainAgent) // 幂等：重复触发不重复注册
check('S1 主会话注册恰一条 save_probe（幂等）', registered.filter((t) => t.name === 'save_probe').length, 1)
check('S2 主会话注册 save_plan（受限规划工件：与 save_probe 同构的工厂；放行不再按路由判定）', registered.filter((t) => t.name === 'save_plan').length, 1)

registered.length = 0
fireSessionStart(harness, plannerAgent)
check('S3 planner 注册恰一条 save_plan', registered.filter((t) => t.name === 'save_plan').length, 1)
check('S4 planner 不注册 save_probe', registered.filter((t) => t.name === 'save_probe').length, 0)

registered.length = 0
fireSessionStart(harness, executorAgent)
await firePreStep(harness, executorAgent)
check('S5 executor 均不注册（空）', registered.length, 0)


// ── ①b 注册失败路径与重试（P0-2/D1：失败不写标记、下一步重试；A/B 记终态） ──
// 桩必须带真实 name 字段（TypeError / JsonSchemaError），否则判据落空、测试自证失败。
function stubToolsOf(record, outcome) {
  const stub = {
    register: (definition) => {
      record.push(definition.name)
      if (typeof outcome.fail === 'function') outcome.fail(definition.name)
    },
  }
  stub.schemas = () => [{ name: 'read' }].concat(record.map((name) => ({ name })))
  return stub
}
// 永久性错误桩：真实抛出 Error 实例（宿主 register 的 TypeError/JsonSchemaError 都是 Error 子类）。
function permanentStub() {
  const error = new TypeError('tool "save_probe" must declare output { schema, render, presentationMeta? }')
  return error
}
function jsonSchemaStub() {
  const error = new Error('unsupported JSON schema: unsupported keyword: oneOf')
  error.name = 'JsonSchemaError'
  error.code = 'UNSUPPORTED_SCHEMA'
  return error
}
// 真实形态：重名是普通 Error 实例（dsh-tools ToolLayer duplicateError 经 NamedEntries.insert 同步抛出），
// 仅 message 区分 A 类；用普通对象冒充 Error 会落到分类 C（判据以 instanceof Error 为前置）。
function duplicateStub() {
  const error = new Error('tool "save_probe" is already registered in this scope')
  error.name = 'Error'
  return error
}
function registrationAgent(id, toolsRef) {
  return {
    session: { header: { id, cwd: 'C:/work' }, snapshotEvents: () => [] },
    options: {},
    ctx: { get: (name) => (name === 'tools' ? toolsRef.current : undefined) },
  }
}
// 独立 harness：插件 ctx 与 agent ctx 同源（都把 tools 指向 ref.current，null 表示服务不可用）。
function refHarness(toolsRef) {
  const ctx = {
    systemPrompt: systemPromptMock([]),
    get: (name) => (name === 'tools' ? toolsRef.current : undefined),
    on: (name, fn) => {
      if (toolsRef.listeners[name] === undefined) toolsRef.listeners[name] = []
      toolsRef.listeners[name].push(fn)
    },
    effect: (fn) => fn(),
    provide: () => {},
  }
  plugin.apply(ctx, withGateWords({ anchoredBootstrap: false }))
  return toolsRef.listeners
}
// 宿主口径：assemble 先于本步 pre-step 派发（快照即本步工具目录），pre-step 中注册只进下一步 assembly。
async function assembleWith(listeners, agent, snapshot) {
  const entry = listeners['system-prompt/assemble']
  if (entry === undefined || entry.length === 0) throw new Error('assemble 监听器未注册')
  const hook = entry[entry.length - 1]
  return await hook(null, { agent }, async () => ({ tools: snapshot, sections: [], contexts: [] }))
}
function visibleNames(assembly) {
  return Array.isArray(assembly.tools) ? assembly.tools.map((tool) => tool.name) : []
}

// S6：session-start 时 tools 服务不可用（分类 C）→ 不写标记 → 下一步 pre-step 注册成功恰一次
{
  const ref = { current: undefined, listeners: {} }
  const harness6 = refHarness(ref)
  const registered6 = []
  const agent6 = registrationAgent('retry-main-1', ref)
  fireSessionStart(harness6, agent6)
  check('S6 save_plan 服务不可用首轮未注册', registered6.length, 0)
  ref.current = stubToolsOf(registered6, { mode: 'ok' })
  await firePreStep(harness6, agent6)
  check('S6 服务不可用 → 次轮 pre-step 两个工具各注册一次', registered6, ['save_plan', 'save_probe'])
  registered6.length = 0
  await firePreStep(harness6, agent6)
  check('S6 注册成功后 WeakSet 短路：后续 pre-step 不再注册', registered6, [])
}

// S7：首次 register 抛可重试错（无 name 的普通 Error）→ 分类 C → 次轮成功，且每次重试各记一次日志
{
  const ref = { current: undefined, listeners: {} }
  const harness7 = refHarness(ref)
  const registered7 = []
  const agent7 = registrationAgent('retry-probe-1', ref)
  const backup = { warn: console.warn, error: console.error }
  const logs7 = []
  console.warn = (...args) => { logs7.push(['warn', args.join(' ')]) }
  console.error = (...args) => { logs7.push(['error', args.join(' ')]) }
  try {
    let attempts7 = 0
    // 只统计 save_probe 的注册尝试：首次抛可重试错（分类 C），save_plan 走成功路径可作对照。
    let planAttempts7 = 0
    const tools7 = stubToolsOf(registered7, { mode: 'ok', fail: (name) => {
      if (name === 'save_plan') { planAttempts7 += 1; return }
      if (name !== 'save_probe') return
      attempts7 += 1
      if (attempts7 === 1) throw new Error('transient tools layer failure')
    } })
    ref.current = tools7
    fireSessionStart(harness7, agent7)
    check('S7 可重试错首轮：save_probe 尝试 1 次（分类 C 不写标记）、save_plan 尝试 1 次', [attempts7, planAttempts7], [1, 1])
    checkTrue('S7 可重试错走分类 C 文案（无永久化后缀）', logs7.some(([lvl, text]) => lvl === 'error' && text.includes('save_probe registration failed: transient tools layer failure')))
    await firePreStep(harness7, agent7)
    check('S7 可重试错 → 次轮重试并成功', [attempts7, planAttempts7], [2, 1])
    await firePreStep(harness7, agent7)
    check('S7 成功后 WeakSet 短路：后续 pre-step 两个工具都不再进 register', [attempts7, planAttempts7], [2, 1])
  } finally { console.warn = backup.warn; console.error = backup.error }
}

// S8：重名（分类 A：message 含 already registered）→ 记终态标记、不重试、不刷日志
{
  const ref = { current: undefined, listeners: {} }
  const harness8 = refHarness(ref)
  const registered8 = []
  const agent8 = registrationAgent('dup-probe-1', ref)
  const backup8 = { warn: console.warn, error: console.error }
  let warns8 = 0
  console.warn = () => { warns8 += 1 }
  console.error = () => { warns8 += 1 }
  try {
    let attempts8 = 0
    let probeAttempts8 = 0
    // save_plan 抛重名（分类 A）应记终态不再重试；save_probe 正常注册后同样短路，可作对照。
    ref.current = stubToolsOf(registered8, { mode: 'ok', fail: (name) => {
      if (name === 'save_probe') { probeAttempts8 += 1; return }
      if (name !== 'save_plan') return
      attempts8 += 1
      if (attempts8 === 1) throw duplicateStub()
    } })
    await firePreStep(harness8, agent8)
    await firePreStep(harness8, agent8)
    await firePreStep(harness8, agent8)
    check('S8 重名（分类 A）3 次 pre-step 只尝试 1 次：WeakSet 记终态后不再重试', [attempts8, probeAttempts8], [1, 1])
    check('S8 重名日志只记一次（分类 A 的 warn）', warns8, 1)
  } finally { console.warn = backup8.warn; console.error = backup8.error }
}

// S9：永久性错误（真实 name=TypeError）→ 分类 B 记终态、不重试；JsonSchemaError 同分支
{
  const backup9 = { warn: console.warn, error: console.error }
  const logs9 = []
  console.warn = () => {}
  console.error = (...args) => { logs9.push(args.join(' ')) }
  try {
    const ref9 = { current: undefined, listeners: {} }
    const harness9 = refHarness(ref9)
    const registered9 = []
    const agent9 = registrationAgent('permanent-probe-1', ref9)
    let attempts9 = 0
    ref9.current = stubToolsOf(registered9, { mode: 'permanent', fail: (name) => { if (name !== 'save_probe') return; attempts9 += 1; throw permanentStub() } })
    await firePreStep(harness9, agent9)
    await firePreStep(harness9, agent9)
    check('S9 TypeError 桩（name 为真实 TypeError、分类 B）2 次 pre-step 只尝试 1 次', attempts9, 1)
    checkTrue('S9 永久性错误使用永久化文案', logs9.some((text) => text.includes('save_probe registration failed permanently:')))
    const ref9b = { current: undefined, listeners: {} }
    const harness9b = refHarness(ref9b)
    const registered9b = []
    const agent9b = registrationAgent('permanent-main-1', ref9b)
    let attempts9b = 0
    ref9b.current = stubToolsOf(registered9b, { mode: 'permanent', fail: (name) => { if (name !== 'save_plan') return; attempts9b += 1; throw jsonSchemaStub() } })
    fireSessionStart(harness9b, agent9b)
    await firePreStep(harness9b, agent9b)
    await firePreStep(harness9b, agent9b)
    check('S9 JsonSchemaError 桩（name 为真实 JsonSchemaError、save_plan 路径）只尝试 1 次', attempts9b, 1)
  } finally { console.warn = backup9.warn; console.error = backup9.error }
}

// S10：时序不变量——pre-step 注册只影响下一步（assemble 快照早于 pre-step 派发）
{
  const ref = { current: undefined, listeners: {} }
  const harness10 = refHarness(ref)
  const registered10 = []
  const agent10 = registrationAgent('timing-main-1', ref)
  const store = { names: ['read'] }
  const snapshotOf = () => store.names.map((name) => ({ name }))
  // 第 1 步：服务不可用 → 本步 assemble 快照只有 read，pre-step 注册失败
  const firstAssembly = await assembleWith(harness10, agent10, snapshotOf())
  let planAttempts10 = 0
  let probeAttempts10 = 0
  ref.current = stubToolsOf(registered10, { mode: 'permanent', fail: (name) => {
    if (name === 'save_plan') planAttempts10 += 1
    if (name === 'save_probe') probeAttempts10 += 1
  } })
  await firePreStep(harness10, agent10)
  // 第 2 步：注册成功 → 宿主在下一步 assemble 时才看到新工具（本步快照仍无 save_plan）
  store.names.push('save_plan')
  const secondAssembly = await assembleWith(harness10, agent10, snapshotOf())
  check('S10 本步目录不含新注册工具（第一步快照）', visibleNames(firstAssembly), ['read'])
  check('S10 注册只在下一步生效：第二步快照含 save_plan（两个工具各注册一次）', [visibleNames(secondAssembly), planAttempts10, probeAttempts10], [['read', 'save_plan'], 1, 1])
}
// ── ② pre-execute save_probe 五态闸门（[任务4.2]，主会话） ───────────────
const FIVE = [
  ['S6g route=none → deny', [um()], 'deny'],
  ['S7g route=plan 未澄清 → deny', [um(), call('ask_user_question', 'a1', routeArgs), ok('a1', answer(['进行pro规划']))], 'deny'],
  ['S8g 取消后五字段清理:route=none·目的归零·未澄清 → deny', [um(), call('ask_user_question', 'a1', routeArgs), ok('a1', answer(['进行pro规划'])), call('ask_user_question', 'a2', purposeArgs), ok('a2', answer(['完善方案'])), call('ask_user_question', 'a3', clarifyArgs), ok('a3', answer(['方案A'])), call('ask_user_question', 'a4', clarifyArgs), err('a4', 'ASK_CANCELLED')], 'deny'],
  ['S8bg route=plan 已澄清且目的已定 → allow', [um(), call('ask_user_question', 'a1', routeArgs), ok('a1', answer(['进行pro规划'])), call('ask_user_question', 'a2', purposeArgs), ok('a2', answer(['完善方案'])), call('ask_user_question', 'a3', clarifyArgs), ok('a3', answer(['方案A']))], 'allow'],
  ['S9g route=direct → deny', [um(), call('ask_user_question', 'a1', routeArgs), ok('a1', answer(['直接执行']))], 'deny'],
  ['S10g channelBroken → allow（逃生）', [um(), call('ask_user_question', 'a1', routeArgs), err('a1', 'NO_PROVIDER')], 'allow'],
]
for (const [name, events, expected] of FIVE) {
  const agent = { session: { header: { id: 'main-1', cwd: 'C:/work' }, snapshotEvents: () => events }, options: {}, ctx: agentCtx }
  const r = preExecute(harness, agent, 'save_probe', {})
  if (expected === 'deny') {
    checkTrue(`${name}`, r !== null && r !== undefined && r.kind === 'deny')
  } else {
    checkTrue(`${name}`, r !== null && r !== undefined && r.kind === 'allow')
  }
}
const cancelledState = deriveFlowState(FIVE[2][1], gateRuntime)
check('S8g ASK_CANCELLED 后状态五字段全清', cancelledState, { route: 'none', clarified: false, approved: false, purpose: 'none', channelBroken: false })

// S8cg：独立事件流（route→clarify、目的未定）的 save_probe 拒绝文案（第四锚点教学式文案，机械层放行前置）
const s8Agent = { session: { header: { id: 'main-1', cwd: 'C:/work' }, snapshotEvents: () => [um(), call('ask_user_question', 'a1', routeArgs), ok('a1', answer(['进行pro规划'])), call('ask_user_question', 'a2', clarifyArgs), ok('a2', answer(['方案A']))] }, options: {}, ctx: agentCtx }
const s8r = preExecute(harness, s8Agent, 'save_probe', {})
checkTrue('S8cg 目的未定 save_probe 拒绝文案含「规划目的尚未确认」与「须先 ask_user_question 询问用户本次 pro 规划的目的」', s8r !== null && s8r !== undefined && s8r.kind === 'deny' && String(s8r.reason).includes('规划目的尚未确认') && String(s8r.reason).includes('须先 ask_user_question 询问用户本次 pro 规划的目的'))

let r
// 完整阶段后重选 route=plan 必须清掉旧目的/澄清/批准；按 route→purpose→clarify 才恢复下游放行。
const completePlanEvents = [um(), call('ask_user_question', 'r1', routeArgs), ok('r1', answer(['进行pro规划'])), call('ask_user_question', 'r2', purposeArgs), ok('r2', answer(['完善方案'])), call('ask_user_question', 'r3', clarifyArgs), ok('r3', answer(['方案A'])), call('ask_user_question', 'r4', approvalArgs), ok('r4', answer(['同意执行']))]
const reselectPlanEvents = completePlanEvents.concat([call('ask_user_question', 'r5', routeArgs), ok('r5', answer(['进行pro规划']))])
const reselectPlanAgent = { session: { header: { id: 'main-1', cwd: 'C:/work' }, snapshotEvents: () => reselectPlanEvents }, options: {}, ctx: agentCtx }
r = preExecute(harness, reselectPlanAgent, 'save_probe', {})
checkTrue('S8dg 完整阶段后重选 plan 的 save_probe → deny 且含「规划目的尚未确认」', r !== null && r !== undefined && r.kind === 'deny' && String(r.reason).includes('规划目的尚未确认'))
r = preExecute(harness, reselectPlanAgent, 'subagent_plan', {})
checkTrue('S8eg 完整阶段后重选 plan 的 subagent_plan → deny 且含「规划目的尚未确认」', r !== null && r !== undefined && r.kind === 'deny' && String(r.reason).includes('规划目的尚未确认'))
const reselectPlanReadyEvents = reselectPlanEvents.concat([call('ask_user_question', 'r6', purposeArgs), ok('r6', answer(['重新规划'])), call('ask_user_question', 'r7', clarifyArgs), ok('r7', answer(['方案B']))])
const reselectPlanReadyAgent = { session: { header: { id: 'main-1', cwd: 'C:/work' }, snapshotEvents: () => reselectPlanReadyEvents }, options: {}, ctx: agentCtx }
r = preExecute(harness, reselectPlanReadyAgent, 'save_probe', {})
checkTrue('S8fg 重选 plan 后目的→澄清完成的 save_probe → allow', r !== null && r !== undefined && r.kind === 'allow')
r = preExecute(harness, reselectPlanReadyAgent, 'subagent_plan', {})
checkTrue('S8gg 重选 plan 后目的→澄清完成的 subagent_plan → allow', r !== null && r !== undefined && r.kind === 'allow')

// ── ②b pre-execute save_plan 路由矩阵（D8-B，主会话：任意路由态放行） ───────
// 与上表同五态：direct / none / plan 未澄清（目的未定）/ approved / 非通道取消后五字段清理 → 全部 allow
// （save_plan 已移除路由态限制，由 mainGateReason 兜底 return null 放行；内容闸门见 ④ 执行层冒烟，与规划子代理同一实现）。
const SAVE_PLAN_STATES = [
  ['S28 主会话 route=direct → save_plan allow', [um(), call('ask_user_question', 'a1', routeArgs), ok('a1', answer(['直接执行']))], 'allow'],
  ['S29 主会话 route=none → save_plan allow（受限工件）', [um()], 'allow'],
  ['S30 主会话 route=plan 未澄清 → save_plan allow（路由态不再拦截）', [um(), call('ask_user_question', 'a1', routeArgs), ok('a1', answer(['进行pro规划']))], 'allow'],
  ['S31 主会话 route=plan 未澄清（目的未定）→ save_plan allow（路由态不再拦截）', [um(), call('ask_user_question', 'a1', routeArgs), ok('a1', answer(['进行pro规划'])), call('ask_user_question', 'a2', clarifyArgs), ok('a2', answer(['方案A']))], 'allow'],
  ['S32 主会话 route=approved → save_plan allow（路由态不再拦截）', [um(), call('ask_user_question', 'a1', routeArgs), ok('a1', answer(['进行pro规划'])), call('ask_user_question', 'a2', clarifyArgs), ok('a2', answer(['方案A'])), call('ask_user_question', 'a3', approvalArgs), ok('a3', answer(['同意执行']))], 'allow'],
]
for (const [name, events, expected] of SAVE_PLAN_STATES) {
  const agent = { session: { header: { id: 'main-1', cwd: 'C:/work' }, snapshotEvents: () => events }, options: {}, ctx: agentCtx }
  const r = preExecute(harness, agent, 'save_plan', { plan: 'p', checklist: 'c' })
  if (expected === 'deny') {
    checkTrue(`${name}`, r !== null && r !== undefined && r.kind === 'deny')
  } else {
    checkTrue(`${name}`, r !== null && r !== undefined && r.kind === 'allow')
  }
}

// ── ③ planner 预算回归（v1 口径，[任务4.3]/[任务7.4]） ───────────────────
const plannerEvents = [DESC, umk('user')]
check('S10b 生成默认预算仍为 18', DEFAULT_EXPLORE_BUDGET, 18)
for (let i = 0; i < DEFAULT_EXPLORE_BUDGET; i += 1) {
  plannerEvents.push(call('read', `r${i}`))
  plannerEvents.push(ok(`r${i}`, 'ok'))
}
const exhaustedPlanner = { session: { header: { id: 'planner-1', origin: 'subagent', delegationDepth: 1, parentSession: 'parent-1', cwd: 'C:/work' }, snapshotEvents: () => plannerEvents }, options: { model: 'deepseek-v4-pro' }, ctx: agentCtx }
r = preExecute(harness, exhaustedPlanner, 'read', { file_path: 'C:/work/.extra-plan/线索-x-20260816090000.md' })
checkTrue('S11 预算耗尽后 read 线索文件 → deny（read 线索计入预算，v1 口径）', r !== null && r !== undefined && r.kind === 'deny' && String(r.reason).includes('探查预算已耗尽'))
r = preExecute(harness, exhaustedPlanner, 'save_plan', { plan: 'p', checklist: 'c' })
checkTrue('S12 预算耗尽后 save_plan → allow（跳过名单仍仅 save_plan）', r !== null && r !== undefined && r.kind === 'allow')
// 11 次成功配对后第 12 次 read（线索文件）不拒绝——12 ≤ DEFAULT_EXPLORE_BUDGET（默认）未超预算
const plannerEvents11 = [DESC, umk('user')]
for (let i = 0; i < 11; i += 1) {
  plannerEvents11.push(call('read', `q${i}`))
  plannerEvents11.push(ok(`q${i}`, 'ok'))
}
const planner11 = { session: { header: { id: 'planner-1', origin: 'subagent', delegationDepth: 1, parentSession: 'parent-1', cwd: 'C:/work' }, snapshotEvents: () => plannerEvents11 }, options: { model: 'deepseek-v4-pro' }, ctx: agentCtx }
r = preExecute(harness, planner11, 'read', { file_path: 'C:/work/.extra-plan/线索-x-20260816090000.md' })
checkTrue('S13 第 12 次 read（线索文件）→ allow（11 配对 + 本次 = 12 ≤ 18 未超预算）', r !== null && r !== undefined && r.kind === 'allow')
const plannerEventsWithTransfer = [...plannerEvents, umk('agent-message')]
const transferredPlanner = { session: { header: { id: 'planner-1', origin: 'subagent', delegationDepth: 1, parentSession: 'parent-1', cwd: 'C:/work' }, snapshotEvents: () => plannerEventsWithTransfer }, options: { model: 'deepseek-v4-pro' }, ctx: agentCtx }
r = preExecute(harness, transferredPlanner, 'read', { file_path: 'C:/work/.extra-plan/线索-x-20260816090000.md' })
checkTrue('S14 预算耗尽后收到 agent-message 转达 → 预算重置 read allow', r !== null && r !== undefined && r.kind === 'allow')

// ── ④ 执行层冒烟（真实落盘：原子双写/单写 + journal 双形状自愈，[任务1]） ──
const smokeMain = { session: { header: { id: 'smoke-main', cwd: 'C:/work' }, snapshotEvents: () => [] }, options: {}, ctx: agentCtx }
const smokePlanner = { session: { header: { id: 'smoke-planner', origin: 'subagent', delegationDepth: 1, parentSession: 'parent-1', cwd: 'C:/work' }, snapshotEvents: () => [DESC] }, options: { model: 'deepseek-v4-pro' }, ctx: agentCtx }
registered.length = 0
fireSessionStart(harness, smokeMain)
const saveProbeDef = registered.find((t) => t.name === 'save_probe')
registered.length = 0
fireSessionStart(harness, smokePlanner)
const savePlanDef = registered.find((t) => t.name === 'save_plan')
check('S14 冒烟捕获 save_probe 工具定义', saveProbeDef !== undefined && typeof saveProbeDef.execute === 'function', true)
check('S15 冒烟捕获 save_plan 工具定义', savePlanDef !== undefined && typeof savePlanDef.execute === 'function', true)

const tmpRoot = mkdtempSync(join(tmpdir(), 'extra-plan-smoke-'))
try {
  const work = join(tmpRoot, 'work')
  mkdirSync(work)
  writeFileSync(join(work, 'a.txt'), 'hello')
  const execFake = (cwd) => ({ agent: { session: { header: { cwd } } } })
  const probeResult = await saveProbeDef.execute({
    taskName: 'smoke',
    fileMap: [{ path: 'a.txt', relation: '相关文件' }],
    focusAreas: [{ path: 'a.txt', note: '重点' }],
    exclusions: [{ note: '排除说明' }],
    background: [{ topic: '背景', detail: '细节' }],
  }, execFake(work))
  checkTrue('S16 save_probe 返回 {path}', probeResult !== null && typeof probeResult === 'object' && typeof probeResult.path === 'string')
  const probeFile = probeResult.path
  checkTrue('S17 线索文件位于 .extra-plan 且命名 线索-smoke-<14位时间戳>.md', typeof probeFile === 'string' && probeFile.includes(join(work, '.extra-plan')) && /线索-smoke-\d{14}\.md$/.test(probeFile))
  checkTrue('S18 线索文件存在且含标题/卷首声明/四节', existsSync(probeFile) && (() => {
    const c = readFileSync(probeFile, 'utf8')
    return c.includes('# 探查线索（save_probe 落盘，非结论）') && c.includes('只有定位线索、没有证据') && ['## 一、文件地图', '## 二、重点区域', '## 三、排除项', '## 四、背景与意图'].every((s) => c.includes(s))
  })())
  checkTrue('S19 落盘后无残留 .tmp/.journal', readdirSync(join(work, '.extra-plan')).every((n) => !n.startsWith('.tmp-') && !n.startsWith('.journal-')))
  const rejectResult = await (async () => {
    try {
      await saveProbeDef.execute({ taskName: 'bad', fileMap: [{ path: '不存在.md', relation: 'r' }], focusAreas: [], exclusions: [], background: [] }, execFake(work))
      return false
    } catch (error) {
      return String(error.message).includes('不存在')
    }
  })()
  checkTrue('S20 校验拒绝面：不存在路径 → execute 抛错并指明', rejectResult)

  // 旧形状 journal 自愈：plan/check 两个 tmp 都残留 → 触发 save_plan 补完两端
  // （T3.3 起「tmp 与目标同时缺失」的项会保留 journal，夹具必须补齐两个 tmp，否则 S23 判红）
  const ep = join(work, '.extra-plan')
  const stalePlan = join(ep, '方案-stale.md')
  const staleCheck = join(ep, '验收-stale.md')
  writeFileSync(join(ep, '.journal-stale.json'), JSON.stringify({ planTmp: join(ep, '方案-stale.md.tmp-x'), checkTmp: join(ep, '验收-stale.md.tmp-x'), planFile: stalePlan, checkFile: staleCheck }))
  writeFileSync(join(ep, '方案-stale.md.tmp-x'), '旧残留-方案')
  writeFileSync(join(ep, '验收-stale.md.tmp-x'), '旧残留-验收')
  const planResult = await savePlanDef.execute({ plan: 'p'.repeat(300), checklist: 'c'.repeat(300), taskName: 'smoke2' }, execFake(work))
  const tsMatch = (p) => (String(p).match(/(\d{14})\.md$/) || [])[1]
  checkTrue('S21 save_plan 双文件落盘成功（同 timestamp）', Array.isArray(planResult.paths) && planResult.paths.length === 2 && existsSync(planResult.paths[0]) && existsSync(planResult.paths[1]) && tsMatch(planResult.paths[0]) === tsMatch(planResult.paths[1]))
  checkTrue('S22 旧形状 journal 残留被补完（方案-stale.md 存在且内容为旧残留-方案）', existsSync(stalePlan) && readFileSync(stalePlan, 'utf8') === '旧残留-方案')
  checkTrue('S22b 旧形状 journal 另一端同步机械核对（验收-stale.md 存在且内容为旧残留-验收）', existsSync(staleCheck) && readFileSync(staleCheck, 'utf8') === '旧残留-验收')
  checkTrue('S23 补完后无残留 .tmp/.journal', readdirSync(ep).every((n) => !n.startsWith('.tmp-') && !n.startsWith('.journal-')))

  // 新形状 journal 自愈：entries 残留 → 触发 save_probe 补完
  const staleTmp = join(ep, '线索-stale.md.tmp-y')
  const staleFile = join(ep, '线索-stale.md')
  writeFileSync(staleTmp, 'stale')
  writeFileSync(join(ep, '.journal-stale2.json'), JSON.stringify({ entries: [{ tmp: staleTmp, file: staleFile }] }))
  await saveProbeDef.execute({ taskName: 'stale', fileMap: [{ path: 'a.txt', relation: 'r' }], focusAreas: [], exclusions: [], background: [] }, execFake(work))
  checkTrue('S24 新形状 journal 残留被补完（线索-stale.md 存在）', existsSync(staleFile))
  checkTrue('S25 补完后无残留 .tmp/.journal', readdirSync(ep).every((n) => !n.startsWith('.tmp-') && !n.startsWith('.journal-')))
  const emptyArgsReject = await (async () => {
    try {
      await savePlanDef.execute({}, execFake(work))
      return false
    } catch (error) {
      return String(error.message).includes('save_plan')
    }
  })()
  checkTrue('S26 空参数防护：execute({}) 抛错且文案含 save_plan', emptyArgsReject)
  const shortArgsReject = await (async () => {
    try {
      await savePlanDef.execute({ plan: 'x', checklist: 'y' }, execFake(work))
      return false
    } catch (error) {
      return String(error.message).includes('内容过短')
    }
  })()
  checkTrue('S27 超短参数防护：execute 抛错且文案含 内容过短', shortArgsReject)
} finally {
  rmSync(tmpRoot, { recursive: true, force: true })
}

// ── ⑤ 持久化事务逐阶段故障注入（P0-3：atomicCommit/recoverJournals 各自的末位可选 fs 依赖桩） ──
// 桩只交给对应的一次调用（局部依赖对象），未提供的操作项回退默认 node:fs 实现；不使用全局 monkeypatch。
// 每个场景使用独立临时目录，finally 清理。
const isJournalName = (n) => n.startsWith('.journal-')
const isTmpName = (n) => n.indexOf('.tmp-') >= 0
const leftovers = (dir) => readdirSync(dir).filter((n) => isJournalName(n) || isTmpName(n)).sort()
const tmpBaseNames = (dir) => readdirSync(dir).filter(isTmpName).map((n) => n.replace(/\.tmp-\d+-\d+$/, '')).sort()
const contentsOf = (dir, names) => names.map((n) => readFileSync(join(dir, n), 'utf8'))
const pairOf = (base) => [{ name: '方案-' + base + '.md', content: 'PLAN-' + base }, { name: '验收-' + base + '.md', content: 'CHECK-' + base }]
const journalOf = (dir, base) => join(dir, '.journal-' + base + '.json')
const crossedAt = (dir, base) => [existsSync(join(dir, '方案-' + base + '.md')), existsSync(join(dir, '验收-' + base + '.md'))]
function thrownBy(fn) {
  try { fn(); return null } catch (error) { return error }
}
function captureWarn(fn) {
  const backup = console.warn
  const logs = []
  console.warn = function () { logs.push(Array.prototype.join.call(arguments, ' ')) }
  try { fn() } finally { console.warn = backup }
  return logs
}
function inScenario(label, body) {
  const dir = mkdtempSync(join(tmpdir(), 'extra-plan-fault-' + label + '-'))
  try {
    body(dir)
  } catch (error) {
    fail += 1
    console.log('FAIL  F-' + label + ' 场景自身异常  (' + (error instanceof Error ? error.message : String(error)) + ')')
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}

// F1 正常双写（T2.1 基线：不改调用形状时生产语义）
inScenario('f1-ok', (dir) => {
  atomicCommit(dir, 'f1', pairOf('f1'), 'tagf1')
  check('F1 正常双写：两目标内容与输入一致', contentsOf(dir, ['方案-f1.md', '验收-f1.md']), ['PLAN-f1', 'CHECK-f1'])
  check('F1 正常双写：tmp/journal 无残留', leftovers(dir), [])
})

// F2 tmp 写入阶段失败（T2.2）：pre-journal，目标不存在，journal 与本次 tmp 无残留
inScenario('f2-tmp-write', (dir) => {
  const injected = new Error('inject: tmp write failed')
  let writes = 0
  const error = thrownBy(() => atomicCommit(dir, 'f2', pairOf('f2'), undefined, {
    writeFileSync: () => { writes += 1; throw injected },
  }))
  check('F2 tmp 写失败：对外抛注入错误', error === injected, true)
  check('F2 tmp 写失败：第一次写即失败', writes, 1)
  check('F2 tmp 写失败：无目标文件', crossedAt(dir, 'f2'), [false, false])
  check('F2 tmp 写失败：journal 与本次 tmp 无残留', leftovers(dir), [])
})

// F3 journal 已实际落盘、写桩在返回前抛错（T2.3）：仍按 pre-journal 条件清理
inScenario('f3-journal-write-throw', (dir) => {
  const injected = new Error('inject: journal write threw after landing')
  const journal = journalOf(dir, 'f3')
  const error = thrownBy(() => atomicCommit(dir, 'f3', pairOf('f3'), undefined, {
    writeFileSync: (p, c, enc) => { writeFileSync(p, c, enc); if (String(p) === journal) throw injected },
  }))
  check('F3 journal 已落盘但写桩抛错：对外抛原始写入错误', error === injected, true)
  check('F3 pre-journal 条件清理：journal 已删除并确认不存在', existsSync(journal), false)
  check('F3 pre-journal 条件清理：本次 tmp 全部清理', leftovers(dir), [])
  recoverJournals(dir)
  check('F3 后续 recoverJournals 不发现该事务', readdirSync(dir).filter(isJournalName), [])
  check('F3 未进入 rename 阶段：目标文件不存在', crossedAt(dir, 'f3'), [false, false])
})

// F4 F3 场景再注入 journal 删除失败（T2.4）：journal 与全部 tmp 同时保留、不再继续清 tmp
inScenario('f4-journal-unlink-fail', (dir) => {
  const injected = new Error('inject: journal write threw after landing')
  const unlinkError = new Error('inject: journal unlink failed')
  const journal = journalOf(dir, 'f4')
  const unlinks = []
  const error = thrownBy(() => atomicCommit(dir, 'f4', pairOf('f4'), undefined, {
    writeFileSync: (p, c, enc) => { writeFileSync(p, c, enc); if (String(p) === journal) throw injected },
    unlinkSync: (p) => { unlinks.push(String(p)); if (String(p) === journal) throw unlinkError },
  }))
  check('F4 journal 删不掉：对外仍抛原始写入错误（非清理错误）', error === injected, true)
  check('F4 journal 与全部 tmp 同时保留', [existsSync(journal), tmpBaseNames(dir)], [true, ['方案-f4.md', '验收-f4.md']])
  check('F4 tmp 清理不再继续（unlink 只试探过 journal）', unlinks.filter(isTmpName), [])
  check('F4 目标文件仍未就位', crossedAt(dir, 'f4'), [false, false])
})

// F5 第一次 rename 失败（T2.5）：post-journal 保留，正常恢复可补全两端
inScenario('f5-first-rename', (dir) => {
  const injected = new Error('inject: first rename failed')
  const journal = journalOf(dir, 'f5')
  let renames = 0
  const error = thrownBy(() => atomicCommit(dir, 'f5', pairOf('f5'), undefined, {
    renameSync: (a, b) => { renames += 1; if (renames === 1) throw injected; renameSync(a, b) },
  }))
  check('F5 第一次 rename 失败：对外抛注入错误', error === injected, true)
  check('F5 post-journal：journal 未删除（保留恢复入口）', existsSync(journal), true)
  check('F5 post-journal：两笔 tmp 保留、两目标均未就位', [tmpBaseNames(dir), crossedAt(dir, 'f5')], [['方案-f5.md', '验收-f5.md'], [false, false]])
  recoverJournals(dir)
  check('F5 正常恢复：两目标内容与输入一致', contentsOf(dir, ['方案-f5.md', '验收-f5.md']), ['PLAN-f5', 'CHECK-f5'])
  check('F5 恢复后 journal/tmp 清空', leftovers(dir), [])
})

// F6 第二次 rename 失败（T2.6：P0-3 核心复现）
inScenario('f6-second-rename', (dir) => {
  const injected = new Error('inject: second rename failed')
  const journal = journalOf(dir, 'f6')
  let renames = 0
  const error = thrownBy(() => atomicCommit(dir, 'f6', pairOf('f6'), undefined, {
    renameSync: (a, b) => { renames += 1; if (renames === 2) throw injected; renameSync(a, b) },
  }))
  check('F6 第二次 rename 失败：对外抛注入错误', error === injected, true)
  check('F6 首个目标已存在、第二个 tmp 与 journal 保留', [crossedAt(dir, 'f6'), tmpBaseNames(dir), existsSync(journal)], [[true, false], ['验收-f6.md'], true])
  recoverJournals(dir)
  check('F6 恢复后两目标内容均正确', contentsOf(dir, ['方案-f6.md', '验收-f6.md']), ['PLAN-f6', 'CHECK-f6'])
  check('F6 恢复后无临时残留（journal/tmp 清空）', leftovers(dir), [])
})

// F7 两个 rename 完成但最终删除 journal 失败（T2.7）
inScenario('f7-final-unlink', (dir) => {
  const unlinkError = new Error('inject: journal unlink failed')
  const journal = journalOf(dir, 'f7')
  const error = thrownBy(() => atomicCommit(dir, 'f7', pairOf('f7'), undefined, {
    unlinkSync: (p) => { if (String(p) === journal) throw unlinkError; unlinkSync(p) },
  }))
  check('F7 最终删 journal 失败：对外抛注入错误', error === unlinkError, true)
  check('F7 两目标已就位且 journal 保留', [crossedAt(dir, 'f7'), existsSync(journal)], [[true, true], true])
  recoverJournals(dir)
  check('F7 下一次恢复只做完成确认并删 journal，目标内容不变', [existsSync(journal), contentsOf(dir, ['方案-f7.md', '验收-f7.md']), leftovers(dir)], [false, ['PLAN-f7', 'CHECK-f7'], []])
})

// F8 目标存在性确认失败（T2.8）：全部目标确认通过前不得尝试删除 journal
inScenario('f8-target-confirm', (dir) => {
  const journal = journalOf(dir, 'f8')
  const unlinks = []
  const error = thrownBy(() => atomicCommit(dir, 'f8', pairOf('f8'), undefined, {
    existsSync: (p) => (String(p).indexOf('验收-f8.md') >= 0 ? false : existsSync(p)),
    unlinkSync: (p) => { unlinks.push(String(p)); unlinkSync(p) },
  }))
  checkTrue('F8 目标未确认就位即抛错', error !== null && String(error.message).indexOf('目标文件未就位') >= 0)
  check('F8 全部目标确认通过前不调用 unlinkSync（不删 journal）', unlinks, [])
  check('F8 post-journal：journal 与两目标均在（rename 均已执行）', [existsSync(journal), crossedAt(dir, 'f8')], [true, [true, true]])
})

// R1 恢复过程中第二次 rename 注入失败（T3.4：用 recoverJournals 自己的末位 fs 依赖）
inScenario('r1-recovery-rename-fail', (dir) => {
  const journal = journalOf(dir, 'r1')
  let setupRenames = 0
  thrownBy(() => atomicCommit(dir, 'r1', pairOf('r1'), undefined, {
    renameSync: (a, b) => { setupRenames += 1; if (setupRenames === 1) throw new Error('setup: first rename failed'); renameSync(a, b) },
  }))
  let renames = 0
  const logs = captureWarn(() => recoverJournals(dir, undefined, {
    renameSync: (a, b) => { renames += 1; if (renames === 2) throw new Error('inject: recovery rename 2 failed'); renameSync(a, b) },
  }))
  check('R1 恢复中第二次 rename 注入失败：journal 保留', existsSync(journal), true)
  checkTrue('R1 恢复失败走既有告警路径', logs.some((t) => t.indexOf('journal recovery failed') >= 0))
  recoverJournals(dir)
  check('R1 移除故障后再调用：补全两目标并清理 journal/tmp', [contentsOf(dir, ['方案-r1.md', '验收-r1.md']), leftovers(dir)], [['PLAN-r1', 'CHECK-r1'], []])
})

// R2 某项 tmp 已不存在但目标存在（T3.2）：按已完成处理并继续后续项
inScenario('r2-tmp-done', (dir) => {
  const journal = journalOf(dir, 'r2')
  writeFileSync(join(dir, '方案-r2.md'), 'DONE-r2')
  writeFileSync(join(dir, '验收-r2.md.tmp-z'), 'PENDING-r2')
  writeFileSync(journal, JSON.stringify({ entries: [
    { tmp: join(dir, '方案-r2.md.tmp-z'), file: join(dir, '方案-r2.md') },
    { tmp: join(dir, '验收-r2.md.tmp-z'), file: join(dir, '验收-r2.md') },
  ] }))
  recoverJournals(dir)
  check('R2 已完成的项凭目标存在继续，后续项照常补完并清 journal', [contentsOf(dir, ['方案-r2.md', '验收-r2.md']), leftovers(dir)], [['DONE-r2', 'PENDING-r2'], []])
})

// R3 某项 tmp 与目标同时缺失（T3.3）：journal 保留 + 既有告警，不被误判为完成
inScenario('r3-missing-both', (dir) => {
  const journal = journalOf(dir, 'r3')
  writeFileSync(join(dir, '方案-r3.md.tmp-z'), 'PARTIAL-r3')
  writeFileSync(journal, JSON.stringify({ entries: [
    { tmp: join(dir, '方案-r3.md.tmp-z'), file: join(dir, '方案-r3.md') },
    { tmp: join(dir, '验收-r3.md.tmp-z'), file: join(dir, '验收-r3.md') },
  ] }))
  const logs = captureWarn(() => recoverJournals(dir))
  check('R3 tmp 与目标均缺失：journal 保留不被误删', [existsSync(journal), existsSync(join(dir, '验收-r3.md'))], [true, false])
  checkTrue('R3 输出既有恢复失败告警', logs.some((t) => t.indexOf('journal recovery failed') >= 0))
})

// R4 旧形状 journal（plan/check 两端）机械核对（T3.1）
inScenario('r4-legacy-shape', (dir) => {
  const journal = journalOf(dir, 'r4')
  const planTmp = join(dir, '方案-r4.md.tmp-z')
  const checkTmp = join(dir, '验收-r4.md.tmp-z')
  writeFileSync(planTmp, 'PLAN-r4')
  writeFileSync(checkTmp, 'CHECK-r4')
  writeFileSync(journal, JSON.stringify({ planTmp, checkTmp, planFile: join(dir, '方案-r4.md'), checkFile: join(dir, '验收-r4.md') }))
  recoverJournals(dir)
  check('R4 旧形状 journal：plan/check 两端同时恢复后清 journal', [contentsOf(dir, ['方案-r4.md', '验收-r4.md']), leftovers(dir)], [['PLAN-r4', 'CHECK-r4'], []])
})

// R5 形状非法/字段缺失的 journal（T3.1）：走既有告警路径并保留 journal
const BAD_SHAPES = [
  ['entries 为空数组', () => ({ entries: [] })],
  ['记录为空对象', () => ({})],
  ['旧形状缺半对', (dir) => ({ planTmp: join(dir, 'x.md.tmp-z') })],
  ['entries 条目形状非法', (dir) => ({ entries: [{ tmp: join(dir, 'x.md.tmp-z') }] })],
  ['记录非对象', () => null],
]
for (let i = 0; i < BAD_SHAPES.length; i += 1) {
  const label = 'r5-shape-' + i
  const name = BAD_SHAPES[i][0]
  const recordOf = BAD_SHAPES[i][1]
  inScenario(label, (dir) => {
    const journal = journalOf(dir, label)
    writeFileSync(journal, JSON.stringify(recordOf(dir)))
    const logs = captureWarn(() => recoverJournals(dir))
    check('R5 ' + name + '：journal 保留且输出既有告警', [existsSync(journal), logs.some((t) => t.indexOf('journal recovery failed') >= 0)], [true, true])
  })
}

// R6 sessionTag 不匹配仍跳过（T3.5）：不恢复、不告警、不删 journal
inScenario('r6-session-tag', (dir) => {
  const other = journalOf(dir, 'r6other')
  const mine = journalOf(dir, 'r6mine')
  writeFileSync(join(dir, '方案-r6other.md.tmp-z'), 'OTHER')
  writeFileSync(other, JSON.stringify({ session: 'other001', entries: [{ tmp: join(dir, '方案-r6other.md.tmp-z'), file: join(dir, '方案-r6other.md') }] }))
  writeFileSync(join(dir, '方案-r6mine.md.tmp-z'), 'MINE')
  writeFileSync(mine, JSON.stringify({ session: 'mine0001', entries: [{ tmp: join(dir, '方案-r6mine.md.tmp-z'), file: join(dir, '方案-r6mine.md') }] }))
  const logs = captureWarn(() => recoverJournals(dir, 'mine0001'))
  check('R6 sessionTag 不匹配：跳过且不告警、journal 保留', [existsSync(other), existsSync(join(dir, '方案-r6other.md')), logs.length], [true, false, 0])
  check('R6 sessionTag 匹配：正常恢复并清 journal', [existsSync(join(dir, '方案-r6mine.md')), existsSync(mine)], [true, false])
})

// R7 一个 journal 失败不阻断目录内其它 journal 的扫描（T3.5）
inScenario('r7-isolation', (dir) => {
  const bad = journalOf(dir, 'r7bad')
  const good = journalOf(dir, 'r7good')
  writeFileSync(bad, JSON.stringify({ entries: [{ tmp: join(dir, '方案-r7bad.md.tmp-z'), file: join(dir, '方案-r7bad.md') }] }))
  writeFileSync(join(dir, '方案-r7good.md.tmp-z'), 'GOOD')
  writeFileSync(good, JSON.stringify({ entries: [{ tmp: join(dir, '方案-r7good.md.tmp-z'), file: join(dir, '方案-r7good.md') }] }))
  const logs = captureWarn(() => recoverJournals(dir))
  check('R7 失败 journal 保留、其它 journal 照常恢复清理', [existsSync(bad), existsSync(good), existsSync(join(dir, '方案-r7good.md')), logs.length >= 1], [true, false, true, true])
})


console.log(`\n通过 ${pass}, 失败 ${fail}`)
process.exit(fail === 0 ? 0 : 1)
