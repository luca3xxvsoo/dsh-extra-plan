// save_probe 注册、五态闸门、planner 预算、持久化与故障注入回归：
// 注册保持 save_probe/save_plan 的角色可见性；闸门覆盖 none/plan/direct/cancel/channelBroken
// 五种结果；18 个成功配对耗尽预算且 save_plan 不豁免。持久化覆盖
// 单次双写/单写、失败阶段与有限清理及各 fs 依赖注入；不扫描/恢复 journal；fs 故障注入不做全局 monkeypatch；O1 只在 try/finally 临界区固定并恢复 Date。
import { pathToFileURL, fileURLToPath } from 'node:url'
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, readdirSync, rmSync, renameSync, unlinkSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const PLUGIN_PATH = fileURLToPath(new URL('../../plugins/dsh-extra-plan/index.js', import.meta.url))
import { registerHostDeps } from '../_shared/host-deps.mjs'
import { createOutput } from '../_shared/test-output.mjs'
// host-deps 先于隔离完成解析（它按候选① DSH_HOME/profiles/web 锚定宿主真包）。
await registerHostDeps()

// ── 测试隔离（构造期配置读取）─────────────────────────
// live-config 构造期会无条件读盘一次（优先 DSH_EXTRA_PLAN_CONFIG_PATH，否则读取 settings 行的
// configEditor.documentPath）。本脚本各 plugin.apply 都传入 config 快照（如
// anchoredBootstrap: false），若命中现场真值，按入参硬编码的期望会被现场配置污染；因此在
// 【插件 import 之前】将 DSH_HOME 指向空临时目录并清空 DSH_EXTRA_PLAN_CONFIG_PATH，使
// 构造期读盘失败，各实例回退到自己的 fallbackDefaults（即 apply 入参）。
// 测试结束（包括 process.exit 与异常退出路径）由 process.on('exit') 恢复原值并删除临时目录。
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
const saveContractNamespace = await import(pathToFileURL(fileURLToPath(new URL('../../plugins/dsh-extra-plan/lib/save-contract.js', import.meta.url))).href)
const { saveArtifactBase } = saveContractNamespace
const { validateSavePlanContract } = await import(pathToFileURL(fileURLToPath(new URL('../../plugins/dsh-extra-plan/lib/save-plan-validation.js', import.meta.url))).href)
const { createSaveToolFactories } = await import(pathToFileURL(fileURLToPath(new URL('../../plugins/dsh-extra-plan/lib/save-tool-factories.js', import.meta.url))).href)
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
const { atomicCommit } = await import(pathToFileURL(PERSISTENCE_PATH).href)

let pass = 0
let fail = 0
const output = createOutput({ argv: process.argv.slice(2) })
checkTrue('T1 save-contract 收回 savePlanBase 且保留 saveArtifactBase', !Object.prototype.hasOwnProperty.call(saveContractNamespace, 'savePlanBase') && typeof saveContractNamespace.saveArtifactBase === 'function')
function check(name, got, expected) {
  const okResult = JSON.stringify(got) === JSON.stringify(expected)
  if (okResult) { pass += 1 } else { fail += 1 }
  output.assertion(okResult, name, expected, got)
}
function checkTrue(name, got) {
  const okResult = got === true
  if (okResult) { pass += 1 } else { fail += 1 }
  output.assertion(okResult, name, true, got)
}

// ── 事件构造（同 step-00-全流程回归.mjs 真实形状） ─────────────────────
const DESC = { type: 'subagent/descriptor', data: { mode: 'continuable' } }
const um = () => ({ type: 'user/message', data: { source: { kind: 'user' } } })
const umk = (kind) => ({ type: 'user/message', data: { source: { kind } } })
const call = (name, cid, argumentsStr = '{}') => ({ type: 'tool/call', data: { name, callId: cid, arguments: argumentsStr } })
const ok = (cid, text) => ({ type: 'tool/result', data: { message: { toolCallId: cid, isError: false, content: [{ type: 'text', text }] } } })
const err = (cid, code) => ({ type: 'tool/result', data: { error: { name: 'Error', ...(code === undefined ? {} : { code }) }, message: { toolCallId: cid, isError: true, content: [] } } })
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

// 当前宿主注册钩子是 agent/created（serial，载荷 { agent, source }）；
// 它负责 session-start 阶段的 save_plan/save_probe 注册。
function fireAgentCreated(listeners, agent) {
  const entry = listeners['agent/created']
  if (entry === undefined || entry.length === 0) throw new Error('agent/created 监听器未注册')
  for (const fn of entry) fn({ agent, source: 'startup' })
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
fireAgentCreated(harness, mainAgent)
await firePreStep(harness, mainAgent)
await firePreStep(harness, mainAgent) // 幂等：重复触发不重复注册
check('S1 主会话注册恰一条 save_probe（幂等）', registered.filter((t) => t.name === 'save_probe').length, 1)
check('S2 主会话注册 save_plan（受限规划工件：与 save_probe 同构的工厂；放行不再按路由判定）', registered.filter((t) => t.name === 'save_plan').length, 1)

registered.length = 0
fireAgentCreated(harness, plannerAgent)
check('S3 planner 注册恰一条 save_plan', registered.filter((t) => t.name === 'save_plan').length, 1)
check('S4 planner 不注册 save_probe', registered.filter((t) => t.name === 'save_probe').length, 0)

registered.length = 0
fireAgentCreated(harness, executorAgent)
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
  fireAgentCreated(harness6, agent6)
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
    fireAgentCreated(harness7, agent7)
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
    fireAgentCreated(harness9b, agent9b)
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
const ROUTE_GATE_ARGS = { plan: '路由闸门样例方案', checklist: '路由闸门样例验收' }
const SAVE_PLAN_STATES = [
  ['S28 主会话 route=direct → save_plan allow', [um(), call('ask_user_question', 'a1', routeArgs), ok('a1', answer(['直接执行']))], 'allow'],
  ['S29 主会话 route=none → save_plan allow（受限工件）', [um()], 'allow'],
  ['S30 主会话 route=plan 未澄清 → save_plan allow（路由态不再拦截）', [um(), call('ask_user_question', 'a1', routeArgs), ok('a1', answer(['进行pro规划']))], 'allow'],
  ['S31 主会话 route=plan 未澄清（目的未定）→ save_plan allow（路由态不再拦截）', [um(), call('ask_user_question', 'a1', routeArgs), ok('a1', answer(['进行pro规划'])), call('ask_user_question', 'a2', clarifyArgs), ok('a2', answer(['方案A']))], 'allow'],
  ['S32 主会话 route=approved → save_plan allow（路由态不再拦截）', [um(), call('ask_user_question', 'a1', routeArgs), ok('a1', answer(['进行pro规划'])), call('ask_user_question', 'a2', clarifyArgs), ok('a2', answer(['方案A'])), call('ask_user_question', 'a3', approvalArgs), ok('a3', answer(['同意执行']))], 'allow'],
]
for (const [name, events, expected] of SAVE_PLAN_STATES) {
  const agent = { session: { header: { id: 'main-1', cwd: 'C:/work' }, snapshotEvents: () => events }, options: {}, ctx: agentCtx }
  const r = preExecute(harness, agent, 'save_plan', ROUTE_GATE_ARGS)
  if (expected === 'deny') {
    checkTrue(`${name}`, r !== null && r !== undefined && r.kind === 'deny')
  } else {
    checkTrue(`${name}`, r !== null && r !== undefined && r.kind === 'allow')
  }
}

// ── ③ planner 预算回归 ───────────────────
const plannerEvents = [DESC, umk('user')]
check('S10b 生成默认预算仍为 18', DEFAULT_EXPLORE_BUDGET, 18)
for (let i = 0; i < DEFAULT_EXPLORE_BUDGET; i += 1) {
  plannerEvents.push(call('read', `r${i}`))
  plannerEvents.push(ok(`r${i}`, 'ok'))
}
const exhaustedPlanner = { session: { header: { id: 'planner-1', origin: 'subagent', delegationDepth: 1, parentSession: 'parent-1', cwd: 'C:/work' }, snapshotEvents: () => plannerEvents }, options: { model: 'deepseek-v4-pro' }, ctx: agentCtx }
r = preExecute(harness, exhaustedPlanner, 'read', { file_path: 'C:/work/.extra-plan/线索-x-20260816090000.md' })
checkTrue('S11 预算耗尽后 read 线索文件 → deny（read 线索计入预算，v1 口径）', r !== null && r !== undefined && r.kind === 'deny' && String(r.reason).includes('探查预算已耗尽'))
r = preExecute(harness, exhaustedPlanner, 'save_plan', ROUTE_GATE_ARGS)
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

// ── ④ 执行层冒烟（真实落盘：单次双写/单写 + 失败主动重试，[任务1]） ──
const smokeMain = { session: { header: { id: 'smoke-main', cwd: 'C:/work' }, snapshotEvents: () => [] }, options: {}, ctx: agentCtx }
const smokePlanner = { session: { header: { id: 'smoke-planner', origin: 'subagent', delegationDepth: 1, parentSession: 'parent-1', cwd: 'C:/work' }, snapshotEvents: () => [DESC] }, options: { model: 'deepseek-v4-pro' }, ctx: agentCtx }
registered.length = 0
fireAgentCreated(harness, smokeMain)
const saveProbeDef = registered.find((t) => t.name === 'save_probe')
const smokeMainPlanDef = registered.find((t) => t.name === 'save_plan')
registered.length = 0
fireAgentCreated(harness, smokePlanner)
const savePlanDef = registered.find((t) => t.name === 'save_plan')
const smokePlannerPlanDef = savePlanDef
const g3TmpRoot = mkdtempSync(join(tmpdir(), 'extra-plan-g3-fixture-'))
const work = join(g3TmpRoot, 'work')
mkdirSync(work)
writeFileSync(join(work, 'a.txt'), 'hello')
const execFake = (cwd) => ({ agent: { session: { header: { cwd, id: 'g3-exec-1' } } } })
check('S14 冒烟捕获 save_probe 工具定义', saveProbeDef !== undefined && typeof saveProbeDef.execute === 'function', true)
check('S15 冒烟捕获 save_plan 工具定义', savePlanDef !== undefined && typeof savePlanDef.execute === 'function', true)
const savePlanDefinitionShape = (definition) => definition === undefined ? null : { name: definition.name, description: definition.description, parameters: definition.parameters, outputSchema: definition.output === undefined ? undefined : definition.output.schema }
checkTrue('G3-H main/planner 共用同一save_plan合同', JSON.stringify(savePlanDefinitionShape(smokeMainPlanDef)) === JSON.stringify(savePlanDefinitionShape(smokePlannerPlanDef)))
check('G3-H save_plan structured schema只声明paths', Object.keys(savePlanDef.output.schema.properties), ['paths'])

// ── ④b G3 合同夹具与早拒回归（矩阵 A/E/H；只用真实合同正文） ───────
function g3PlanTask({ id, file, relatedFiles, group, dependency, dependencyReason, groupReason, resource, pad }) {
  const lines = [
    '[任务' + id + '] G3真实合同任务' + pad,
    '- 主文件：' + file,
    '- 执行组：' + group,
    '- 依赖：' + dependency,
    '- 依赖理由：' + dependencyReason,
    '- 分组理由：' + groupReason,
    '- 修改：按任务范围完成实现并保留原始正文' + pad,
    '- 自检：运行有限结构与落盘断言，不执行完整回归' + pad,
    '- 独占资源：' + resource,
  ]
  if (Array.isArray(relatedFiles) && relatedFiles.length > 0) lines.splice(2, 0, ...relatedFiles.map((filePath) => '- 关联文件：' + filePath))
  return lines.join('\n')
}
function g3ChecklistTask({ id, file, relatedFiles, checkRefs, pad }) {
  const lines = [
    '[任务' + id + '] G3真实验收任务' + pad,
    '- 主文件：' + file,
    '- 期望：任务文件范围、合同关系与逐字落盘结果均可复核' + pad,
    '- 禁止：不得把任意占位正文当作合法成功输入' + pad,
    '- 正式验收：' + checkRefs,
  ]
  if (Array.isArray(relatedFiles) && relatedFiles.length > 0) lines.splice(2, 0, ...relatedFiles.map((filePath) => '- 关联文件：' + filePath))
  return lines.join('\n')
}
function makeG3Fixture({ slug = 'fixture', mode = 'single', related = false, dependent = false, closure = false, global = false, taskCount, resourceConflict = false, pad = '' } = {}) {
  const count = taskCount === undefined ? (mode === 'single' ? 1 : 2) : taskCount
  const planTasks = []
  const checklistTasks = []
  const taskIds = Array.from({ length: count }, (_, index) => index + 1)
  for (const id of taskIds) {
    const file = 'pe-test/g3-fixtures/' + slug + '-task-' + id + '.mjs'
    const relatedFiles = related && id === 1 ? ['pe-test/g3-fixtures/' + slug + '-helper-' + id + '.mjs'] : []
    const dependency = dependent && id === 2 ? '[任务1]' : '无'
    const dependencyReason = dependent && id === 2 ? '先完成任务1再实现任务2' : '无'
    const groupReason = relatedFiles.length > 0 ? '关联文件必须与主文件共同修改并核对' : '无'
    const resource = resourceConflict ? 'g3-shared-fixture-resource' : '无'
    const checkRefs = count > 1 && id === 2 ? '[检查1]、[检查2]' : '[检查1]'
    planTasks.push(g3PlanTask({ id, file, relatedFiles, group: 'G' + id, dependency, dependencyReason, groupReason, resource, pad }))
    checklistTasks.push(g3ChecklistTask({ id, file, relatedFiles, checkRefs, pad }))
  }
  const planParts = [
    '- 执行模式：' + mode,
    '- 派遣说明：本夹具声明实际任务、文件、依赖与执行组，完成后按原文冻结并验收',
    planTasks.join('\n'),
  ]
  const checklistParts = [
    '- 执行模式：' + mode,
    '- 验收说明：按任务和检查ID复核合同，漏项、矛盾与过期证据不得通过',
    checklistTasks.join('\n'),
  ]
  const closurePath = 'pe-test/g3-fixtures/' + slug + '-closure.mjs'
  const closureDependencies = taskIds.map((id) => '[任务' + id + ']').join('、')
  if (closure) {
    planParts.push('', '[收尾]', '- 收尾文件：' + closurePath, '- 收尾依赖：' + closureDependencies, '- 收尾动作：核对全部数字任务交付并更新收尾文件', '- 自检：确认收尾文件与冻结源状态一致')
  }
  if (closure) checklistParts.push('', '[收尾]', '- 收尾文件：' + closurePath, '- 期望：收尾文件独立于数字任务且覆盖全部任务', '- 禁止：收尾不得重写数字任务文件', '- 正式验收：[检查1]')
  checklistParts.push('', '[检查1] G3共享合同与正文复核', '- 验收组：R1', '- 取证方式：只读复核', '- 工作目录：.', '- 检查：逐字读取方案、验收及任务文件范围', '- 验收证据：两份正文逐字一致，结构摘要与覆盖范围可复核')
  if (count > 1) checklistParts.push('', '[检查2] G3第二验收组独立复核', '- 验收组：R2', '- 取证方式：只读复核', '- 工作目录：.', '- 检查：复核第二任务依赖、执行组与R组分工', '- 验收证据：真实依赖或独立组状态与文件所有权符合合同')
  if (global) checklistParts.push('', '[全局验收]', '- 期望：任务、收尾与共享检查覆盖完整', '- 禁止：不得以单组或过期证据推断全局通过', '- 正式验收：[检查1]')
  planParts.push('', '补充说明：本方案夹具用于验证真实结构、早拒顺序、执行组关系和有限自检，不代表代理已执行。')
  checklistParts.push('', '补充说明：本验收夹具用于验证期望、禁止、检查引用和共享验收组，不替代正式回归。')
  return { plan: planParts.join('\n'), checklist: checklistParts.join('\n'), mode, taskCount: count, related, dependent, closureEnabled: closure, globalEnabled: global }
}
const g3ShortSingle = {
  plan: ['- 执行模式：single', '- 派遣说明：先读两份工件，完成后冻结再验收', '[任务1] 短单任务', '- 主文件：src/a.js', '- 执行组：G1', '- 依赖：无', '- 依赖理由：无', '- 分组理由：无', '- 修改：完成短单任务', '- 自检：运行结构检查'].join('\n'),
  checklist: ['- 执行模式：single', '- 验收说明：按检查ID复核，漏项不得通过', '[任务1] 验收短单任务', '- 主文件：src/a.js', '- 期望：结构解析正确', '- 禁止：不得自动执行命令', '- 正式验收：[检查1]', '[检查1] 核对结构合同', '- 验收组：R1', '- 取证方式：只读复核', '- 工作目录：.', '- 检查：读取src/a.js', '- 验收证据：读取结果符合合同'].join('\n'),
}
const shortValidation = validateSavePlanContract(g3ShortSingle.plan, g3ShortSingle.checklist)
checkTrue('G3-A 纯validator允许短single且不受factory长度门槛影响', shortValidation.ok === true && g3ShortSingle.plan.length < 200 && g3ShortSingle.checklist.length < 200)
const g3FixtureCases = [
  ['G3-A single单文件无可选块', makeG3Fixture({ slug: 'single-file', mode: 'single' })],
  ['G3-B single关联文件', makeG3Fixture({ slug: 'single-related', mode: 'single', related: true })],
  ['G3-E single仅收尾', makeG3Fixture({ slug: 'single-closure', mode: 'single', closure: true })],
  ['G3-E single仅全局', makeG3Fixture({ slug: 'single-global', mode: 'single', global: true })],
  ['G3-C batch独立双组共享检查', makeG3Fixture({ slug: 'batch-independent', mode: 'batch' })],
  ['G3-C batch真实依赖', makeG3Fixture({ slug: 'batch-dependent', mode: 'batch', dependent: true })],
  ['G3-E batch收尾全局组合', makeG3Fixture({ slug: 'batch-closure-global', mode: 'batch', closure: true, global: true })],
]
const g3Validations = new Map()
for (const [label, fixture] of g3FixtureCases) {
  const validation = validateSavePlanContract(fixture.plan, fixture.checklist)
  g3Validations.set(label, validation)
  checkTrue(label + ' 真实validator通过', validation.ok === true)
  checkTrue(label + ' factory两正文各至少200字符', fixture.plan.length >= 200 && fixture.checklist.length >= 200)
}
const independentSummary = g3Validations.get('G3-C batch独立双组共享检查').summary
check('G3-C 独立双组均为初始可派且共享检查覆盖两任务', independentSummary.groups.map((group) => [group.group, group.groupDependsOn, group.initialState]), [['G1', [], 'eligible'], ['G2', [], 'eligible']])
check('G3-D R组独立且共享检查覆盖正确', [independentSummary.reviewGroups.map((group) => group.reviewGroup), independentSummary.checks.map((item) => item.coverage.tasks)], [['R1', 'R2'], [[1, 2], [2]]])
const dependentSummary = g3Validations.get('G3-C batch真实依赖').summary
check('G3-C 真实依赖折叠为G2等待G1交付', dependentSummary.groups.map((group) => [group.group, group.groupDependsOn, group.initialState]), [['G1', [], 'eligible'], ['G2', ['G1'], 'waiting']])
for (const [label, fixture] of g3FixtureCases.filter((entry) => entry[1].mode === 'single')) {
  const summary = g3Validations.get(label).summary
  check(label + ' 收尾/全局组合标志', [summary.hasClosure, summary.hasGlobalAcceptance], [fixture.closureEnabled, fixture.globalEnabled])
}
const closureGlobalSummary = g3Validations.get('G3-E batch收尾全局组合').summary
check('G3-E batch收尾全局组合标志', [closureGlobalSummary.hasClosure, closureGlobalSummary.hasGlobalAcceptance], [true, true])
check('G3-F fileCount/totalFileCount包含收尾文件', [closureGlobalSummary.taskFileCount, closureGlobalSummary.closureFileCount, closureGlobalSummary.fileCount, closureGlobalSummary.totalFileCount], [2, 1, 3, 3])

const g3StubCalls = []
const g3StubFactory = createSaveToolFactories({
  savePlanDir: '.extra-plan',
  atomicCommit: (...args) => g3StubCalls.push(['atomic', args]),
})
const g3StubPlanDef = g3StubFactory.defineSavePlan()
for (let index = 0; index < g3FixtureCases.length; index += 1) {
  const [label, fixture] = g3FixtureCases[index]
  const before = g3StubCalls.length
  let result
  try {
    result = await g3StubPlanDef.execute({ plan: fixture.plan, checklist: fixture.checklist, taskName: 'g3-' + index }, execFake(work))
  } catch (error) {
    result = null
    checkTrue(label + ' stub execute合法正文未抛错：' + String(error.message), false)
  }
  const calls = g3StubCalls.slice(before)
  const atomic = calls.find((item) => item[0] === 'atomic')
  const entries = atomic !== undefined && Array.isArray(atomic[1][2]) ? atomic[1][2] : []
  check('G3-H ' + label + ' 只调用一次atomic且双写两项', calls.map((item) => item[0]), ['atomic'])
  check('G3-H ' + label + ' 两项正文逐字保持', entries.map((entry) => entry.content), [fixture.plan, fixture.checklist])
  check('G3-H ' + label + ' structured output仅paths', result === null ? [] : Object.keys(result), ['paths'])
  checkTrue('G3-H ' + label + ' 返回两个路径', result !== null && Array.isArray(result.paths) && result.paths.length === 2 && result.paths.every((path) => typeof path === 'string'))
}

const invalidStructurePlan = g3FixtureCases[0][1].plan + '\n- 期望：方案中不允许的错位字段\n【探查者已核实】证据：pe-test/g3-fixtures/missing-evidence-report.md'
const invalidReference = {
  plan: g3FixtureCases[0][1].plan,
  checklist: g3FixtureCases[0][1].checklist.replace('- 正式验收：[检查1]', '- 正式验收：[检查9]'),
}
const invalidResource = makeG3Fixture({ slug: 'invalid-resource', mode: 'batch', resourceConflict: true })
const closureFixture = makeG3Fixture({ slug: 'invalid-closure', mode: 'single', closure: true })
const closureStart = closureFixture.checklist.indexOf('\n[收尾]')
const checkStart = closureFixture.checklist.indexOf('\n[检查1]', closureStart)
const invalidClosure = {
  plan: closureFixture.plan,
  checklist: closureStart >= 0 && checkStart > closureStart ? closureFixture.checklist.slice(0, closureStart) + closureFixture.checklist.slice(checkStart) : closureFixture.checklist,
}
const oversizedSummary = makeG3Fixture({ slug: 'invalid-summary', mode: 'batch', taskCount: 20, pad: '摘要上限复现文本'.repeat(120) })
const invalidCases = [
  ['G3-H 非法结构含证据标记', { plan: invalidStructurePlan, checklist: g3FixtureCases[0][1].checklist, needle: '字段出现在错误结构块', evidenceGuard: true }],
  ['G3-H 非法检查引用', { plan: invalidReference.plan, checklist: invalidReference.checklist, needle: '正式验收引用的检查 ID 不存在' }],
  ['G3-H 跨执行组资源冲突', { plan: invalidResource.plan, checklist: invalidResource.checklist, needle: '独占资源' }],
  ['G3-E 收尾双文档不一致', { plan: invalidClosure.plan, checklist: invalidClosure.checklist, needle: '收尾' }],
  ['G3-F 摘要超过12000字符', { plan: oversizedSummary.plan, checklist: oversizedSummary.checklist, needle: '派遣摘要' }],
]
const invalidEffects = { atomic: 0 }
const invalidFactory = createSaveToolFactories({
  savePlanDir: '.extra-plan',
  atomicCommit: () => { invalidEffects.atomic += 1 },
})
const invalidPlanDef = invalidFactory.defineSavePlan()
async function rejectG3BeforeIO(label, item) {
  let message = ''
  try {
    await invalidPlanDef.execute({ plan: item.plan, checklist: item.checklist, taskName: 'g3-invalid' }, execFake(work))
  } catch (error) {
    message = String(error.message)
  }
  checkTrue(label + ' 在context/base、证据IO、atomic前拒绝', message.includes(item.needle) && message.includes('文件级任务合同校验不通过'))
  if (item.evidenceGuard === true) checkTrue(label + ' 未先触发证据文件IO', !message.includes('证据文件不存在'))
}
const g3DateBeforeInvalid = globalThis.Date
const g3FixedMillis = 1893456000123
class G3FixedDate extends g3DateBeforeInvalid {
  constructor(...args) { super(...(args.length === 0 ? [g3FixedMillis] : args)) }
}
let invalidBaseBefore
let invalidBaseAfter
try {
  globalThis.Date = G3FixedDate
  invalidBaseBefore = saveArtifactBase('g3-invalid-sequence', 'g3-session-123')
  for (const [label, item] of invalidCases) await rejectG3BeforeIO(label, item)
  invalidBaseAfter = saveArtifactBase('g3-invalid-sequence', 'g3-session-123')
} finally {
  globalThis.Date = g3DateBeforeInvalid
}
const g3BaseSequence = (value) => Number((String(value).match(/-(\d+)$/) || [])[1])
checkTrue('G3-H 所有非法合同不消耗context/base序号且恢复Date', globalThis.Date === g3DateBeforeInvalid && g3BaseSequence(invalidBaseAfter) === g3BaseSequence(invalidBaseBefore) + 1 && invalidEffects.atomic === 0)
rmSync(g3TmpRoot, { recursive: true, force: true })

const tmpRoot = mkdtempSync(join(tmpdir(), 'extra-plan-smoke-'))
try {
  const work = join(tmpRoot, 'work')
  mkdirSync(work)
  writeFileSync(join(work, 'a.txt'), 'hello')
  const execFake = (cwd) => ({ agent: { session: { header: { cwd, id: 'smoke-exec-1' } } } })
  const contextProbeArgs = {
    taskName: 'context',
    fileMap: [{ path: join(work, 'a.txt'), relation: '相关文件' }],
    focusAreas: [{ path: join(work, 'a.txt'), note: '重点' }],
    exclusions: [{ note: '排除说明' }],
    background: [{ topic: '背景', detail: '细节' }],
  }
  const missingCwdExec = { agent: { session: { header: { id: 'missing-cwd' } } } }
  const invalidIdExec = { agent: { session: { header: { cwd: work, id: '---' } } } }
  let missingCwdMessage = ''
  let invalidIdMessage = ''
  try { await saveProbeDef.execute(contextProbeArgs, missingCwdExec) } catch (error) { missingCwdMessage = String(error.message) }
  try { await saveProbeDef.execute(contextProbeArgs, invalidIdExec) } catch (error) { invalidIdMessage = String(error.message) }
  checkTrue('T3 缺 cwd 在 validateProbe 后按原文案拒绝', missingCwdMessage === 'save_probe: 会话缺少工作区路径，无法落盘')
  checkTrue('T3 非法 session id 按原文案拒绝', invalidIdMessage === 'save_probe: 会话缺少有效标识，无法隔离落盘事务')
  const contextCalls = []
  const contextFactory = createSaveToolFactories({
    savePlanDir: '.extra-plan',
    atomicCommit: (...args) => contextCalls.push(['atomic', args]),
  })
  const contextSingleFixture = g3FixtureCases[0][1]
  const contextPlanResult = await contextFactory.defineSavePlan().execute({ plan: contextSingleFixture.plan, checklist: contextSingleFixture.checklist, taskName: 'order' }, execFake(work))
  const contextProbeResult = await contextFactory.defineSaveProbe().execute({ ...contextProbeArgs, taskName: 'order-probe', fileMap: [{ path: 'a.txt', relation: '相关文件' }], focusAreas: [{ path: 'a.txt', note: '重点' }] }, execFake(work))
  const atomicCalls = contextCalls.filter((item) => item[0] === 'atomic')
  checkTrue('T3 两次保存只各自调用一次 atomicCommit，不扫描旧事务', contextCalls.map((item) => item[0]).join('|') === 'atomic|atomic')
  checkTrue('T3 save_plan 提交双文件且返回 paths，save_probe 提交单文件且返回 path', atomicCalls.length === 2 && atomicCalls[0][1][2].length === 2 && atomicCalls[1][1][2].length === 1 && Array.isArray(contextPlanResult.paths) && typeof contextProbeResult.path === 'string')
  check('T3 合法single正文逐字交给atomicCommit', atomicCalls[0][1][2].map((entry) => entry.content), [contextSingleFixture.plan, contextSingleFixture.checklist])
  check('T3 save_plan structured output仅paths', Object.keys(contextPlanResult), ['paths'])
  const probeResult = await saveProbeDef.execute({
    taskName: 'smoke',
    fileMap: [{ path: 'a.txt', relation: '相关文件' }],
    focusAreas: [{ path: 'a.txt', note: '重点' }],
    exclusions: [{ note: '排除说明' }],
    background: [{ topic: '背景', detail: '细节' }],
  }, execFake(work))
  checkTrue('S16 save_probe 返回 {path}', probeResult !== null && typeof probeResult === 'object' && typeof probeResult.path === 'string')
  const probeFile = probeResult.path
  checkTrue('S17 线索文件位于 .extra-plan 且命名含 sessionTag/毫秒/pid/序号', typeof probeFile === 'string' && probeFile.includes(join(work, '.extra-plan')) && /线索-smoke-[A-Za-z0-9]+-\d{17}-\d+-\d+\.md$/.test(probeFile))
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

  const invalidEffects = { atomic: 0 }
  const invalidProbe = createSaveToolFactories({
    savePlanDir: '.extra-plan',
    atomicCommit: () => { invalidEffects.atomic += 1 },
  }).defineSaveProbe()
  for (const badArgs of [null, undefined, {}]) {
    try { await invalidProbe.execute(badArgs, execFake(work)) } catch {}
  }
  checkTrue('S20a 非法 args 先校验且零副作用（atomic/rename/unlink 均为 0）', invalidEffects.atomic === 0)
  const RealDate = globalThis.Date
  const fixedMillis = 1893456000123
  class FixedDate extends RealDate {
    constructor(...args) {
      super(...(args.length === 0 ? [fixedMillis] : args))
    }
  }
  let baseBefore
  let baseAfter
  try {
    globalThis.Date = FixedDate
    baseBefore = saveArtifactBase('sequence', 'session-123456')
    try {
      await invalidProbe.execute(null, execFake(work))
    } catch (error) {
      if (!(error instanceof Error) || error.message !== 'save_probe: 参数必须是对象（四字段 fileMap/focusAreas/exclusions/background 均为数组）') throw error
    }
    baseAfter = saveArtifactBase('sequence', 'session-123456')
  } finally {
    globalThis.Date = RealDate
  }
  const artifactTail = /-(\d{17})-(\d+)-(\d+)$/
  const beforeMatch = baseBefore.match(artifactTail)
  const afterMatch = baseAfter.match(artifactTail)
  const beforeSeq = beforeMatch === null ? NaN : Number(beforeMatch[3])
  const afterSeq = afterMatch === null ? NaN : Number(afterMatch[3])
  checkTrue('S20c 非法 save_probe 不消耗同毫秒序号且固定 Date 已恢复', globalThis.Date === RealDate && beforeMatch !== null && afterMatch !== null && beforeMatch[1] === afterMatch[1] && beforeMatch[2] === String(process.pid) && afterMatch[2] === String(process.pid) && Number.isInteger(beforeSeq) && Number.isInteger(afterSeq) && afterSeq === beforeSeq + 1 && invalidEffects.atomic === 0)
  const baseA = saveArtifactBase('collision', 'session-123456')
  const baseB = saveArtifactBase('collision', 'session-123456')
  checkTrue('S20b 同 task/session 同毫秒连续 base 不碰撞且含毫秒/pid/序号', baseA !== baseB && /collision-session1-\d{17}-\d+-\d+/.test(baseA) && /collision-session1-\d{17}-\d+-\d+/.test(baseB))

  // 旧 journal 仅作为历史哨兵：本轮保存不读取、不重放、不删除。
  const ep = join(work, '.extra-plan')
  const stalePlan = join(ep, '方案-stale.md')
  const staleCheck = join(ep, '验收-stale.md')
  const staleJournal = join(ep, '.journal-stale.json')
  const stalePlanTmp = join(ep, '方案-stale.md.tmp-x')
  const staleCheckTmp = join(ep, '验收-stale.md.tmp-x')
  const staleRecord = JSON.stringify({ planTmp: stalePlanTmp, checkTmp: staleCheckTmp, planFile: stalePlan, checkFile: staleCheck })
  writeFileSync(staleJournal, staleRecord)
  writeFileSync(stalePlanTmp, '旧残留-方案')
  writeFileSync(staleCheckTmp, '旧残留-验收')
  const productionFixture = g3FixtureCases.find((entry) => entry[0] === 'G3-E batch收尾全局组合')[1]
  const planResult = await savePlanDef.execute({ plan: productionFixture.plan, checklist: productionFixture.checklist, taskName: 'smoke2' }, execFake(work))
  const tsMatch = (p) => (String(p).match(/-[A-Za-z0-9]+-(\d{17})-\d+-\d+\.md$/) || [])[1]
  checkTrue('S21 save_plan 双文件落盘成功（同毫秒 artifact base）', Array.isArray(planResult.paths) && planResult.paths.length === 2 && existsSync(planResult.paths[0]) && existsSync(planResult.paths[1]) && tsMatch(planResult.paths[0]) === tsMatch(planResult.paths[1]))
  check('S21a 合法batch正文逐字双写', planResult.paths.map((path) => readFileSync(path, 'utf8')), [productionFixture.plan, productionFixture.checklist])
  check('S21b save_plan structured output仅paths', Object.keys(planResult), ['paths'])
  const staleBefore = [readFileSync(staleJournal, 'utf8'), readFileSync(stalePlanTmp, 'utf8'), readFileSync(staleCheckTmp, 'utf8')]
  checkTrue('S22 旧 journal/tmp 哨兵在 save_plan 后字节不变且不生成目标', !existsSync(stalePlan) && !existsSync(staleCheck) && JSON.stringify(staleBefore) === JSON.stringify([readFileSync(staleJournal, 'utf8'), readFileSync(stalePlanTmp, 'utf8'), readFileSync(staleCheckTmp, 'utf8')]))

  // 新 journal 哨兵同样不被下一次 save_probe 扫描或清理；本次只发布新参数对应文件。
  const staleTmp = join(ep, '线索-stale.md.tmp-y')
  const staleFile = join(ep, '线索-stale.md')
  const staleJournal2 = join(ep, '.journal-stale2.json')
  writeFileSync(staleTmp, 'stale')
  writeFileSync(staleJournal2, JSON.stringify({ session: 'smokeexe', entries: [{ tmp: staleTmp, file: staleFile }] }))
  await saveProbeDef.execute({ taskName: 'stale-new-call', fileMap: [{ path: 'a.txt', relation: 'r' }], focusAreas: [], exclusions: [], background: [] }, execFake(work))
  checkTrue('S23 save_probe 只处理新参数：旧 journal/tmp/目标字节均不变', existsSync(staleJournal2) && existsSync(staleTmp) && !existsSync(staleFile) && readFileSync(staleTmp, 'utf8') === 'stale')
  check('S24 正常 save_probe 不产生新 journal（仅保留两个历史哨兵）', readdirSync(ep).filter((name) => name.startsWith('.journal-')).sort(), ['.journal-stale.json', '.journal-stale2.json'])
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

// ── ⑤ 单次持久化逐阶段故障注入（无跨调用恢复） ─────────────────────────
// 桩只交给对应的一次调用（局部依赖对象），未提供的操作项回退默认 node:fs 实现；不使用全局 monkeypatch。
// 每个场景使用独立临时目录，finally 清理；失败断言保留首错、阶段和本次清理结果。
const isTmpName = (name) => name.indexOf('.tmp-') >= 0
const leftovers = (dir) => readdirSync(dir).filter(isTmpName).sort()
const tmpBaseNames = (dir) => readdirSync(dir).filter(isTmpName).map((name) => name.replace(/\.tmp-\d+-\d+$/, '')).sort()
const contentsOf = (dir, names) => names.map((name) => readFileSync(join(dir, name), 'utf8'))
const pairOf = (base) => [{ name: '方案-' + base + '.md', content: 'PLAN-' + base }, { name: '验收-' + base + '.md', content: 'CHECK-' + base }]
const crossedAt = (dir, base) => [existsSync(join(dir, '方案-' + base + '.md')), existsSync(join(dir, '验收-' + base + '.md'))]
function thrownBy(fn) {
  try { fn(); return null } catch (error) { return error }
}
function inScenario(label, body) {
  const dir = mkdtempSync(join(tmpdir(), 'extra-plan-fault-' + label + '-'))
  try {
    body(dir)
  } catch (error) {
    fail += 1
    output.error('FAIL  F-' + label + ' 场景自身异常  (' + (error instanceof Error ? error.message : String(error)) + ')')
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}

// F1 正常保存：两文件按序发布，成功不产生 journal/tmp。
inScenario('f1-ok', (dir) => {
  atomicCommit(dir, 'f1', pairOf('f1'))
  check('F1 正常双写：两目标内容与输入一致', contentsOf(dir, ['方案-f1.md', '验收-f1.md']), ['PLAN-f1', 'CHECK-f1'])
  check('F1 正常双写：tmp/journal 无残留', [leftovers(dir), readdirSync(dir).filter((name) => name.startsWith('.journal-'))], [[], []])
})

// F2 首次临时写失败：部分文件也只清理本次尝试的临时文件。
inScenario('f2-first-write', (dir) => {
  const injected = new Error('inject: first write failed')
  let writes = 0
  const error = thrownBy(() => atomicCommit(dir, 'f2', pairOf('f2'), {
    writeFileSync: (path, content, encoding) => {
      writes += 1
      writeFileSync(path, 'PARTIAL-f2', encoding)
      throw injected
    },
  }))
  checkTrue('F2 首写失败：保留首错与临时写入1阶段', error !== null && error.cause === injected && error.message.includes('阶段=临时写入1') && error.message.includes('inject: first write failed'))
  check('F2 首写失败：只清理本次临时文件且目标未发布', [writes, leftovers(dir), crossedAt(dir, 'f2')], [1, [], [false, false]])
})

// F3 后续临时写失败：首个临时文件和失败中的第二个临时文件均清理。
inScenario('f3-second-write', (dir) => {
  const injected = new Error('inject: second write failed')
  let writes = 0
  const error = thrownBy(() => atomicCommit(dir, 'f3', pairOf('f3'), {
    writeFileSync: (path, content, encoding) => {
      writes += 1
      writeFileSync(path, content, encoding)
      if (writes === 2) throw injected
    },
  }))
  checkTrue('F3 后续写失败：保留首错与临时写入2阶段', error !== null && error.cause === injected && error.message.includes('阶段=临时写入2') && error.message.includes('inject: second write failed'))
  check('F3 后续写失败：两笔临时文件清理且目标未发布', [writes, leftovers(dir), crossedAt(dir, 'f3')], [2, [], [false, false]])
})

// F4 首次发布失败：未发布目标不产生半套新工件。
inScenario('f4-first-publish', (dir) => {
  const injected = new Error('inject: first publish failed')
  let renames = 0
  const error = thrownBy(() => atomicCommit(dir, 'f4', pairOf('f4'), {
    renameSync: (from, to) => {
      renames += 1
      if (renames === 1) throw injected
      renameSync(from, to)
    },
  }))
  checkTrue('F4 首次发布失败：保留首错与发布1阶段', error !== null && error.cause === injected && error.message.includes('阶段=发布1') && error.message.includes('inject: first publish failed'))
  check('F4 首次发布失败：临时文件清理且目标未发布', [renames, leftovers(dir), crossedAt(dir, 'f4')], [1, [], [false, false]])
})

// F5 后续发布失败：已发布的首个新目标也属于本次半套工件并清理。
inScenario('f5-second-publish', (dir) => {
  const injected = new Error('inject: second publish failed')
  let renames = 0
  const error = thrownBy(() => atomicCommit(dir, 'f5', pairOf('f5'), {
    renameSync: (from, to) => {
      renames += 1
      if (renames === 2) throw injected
      renameSync(from, to)
    },
  }))
  checkTrue('F5 后续发布失败：保留首错与发布2阶段', error !== null && error.cause === injected && error.message.includes('阶段=发布2') && error.message.includes('inject: second publish failed'))
  check('F5 后续发布失败：已发布目标与余下临时文件均清理', [renames, leftovers(dir), crossedAt(dir, 'f5')], [2, [], [false, false]])
})

// F6 清理失败：首错/阶段不被覆盖，并报告残留路径与清理原因；其它本次文件继续清理。
inScenario('f6-cleanup-fail', (dir) => {
  const injected = new Error('inject: publish failed before cleanup')
  const cleanupError = new Error('inject: cleanup failed')
  let cleanupAttempts = 0
  const error = thrownBy(() => atomicCommit(dir, 'f6', pairOf('f6'), {
    renameSync: () => { throw injected },
    unlinkSync: (path) => {
      cleanupAttempts += 1
      if (cleanupAttempts === 1) throw cleanupError
      unlinkSync(path)
    },
  }))
  checkTrue('F6 清理失败：保留发布首错/阶段并附清理原因', error !== null && error.cause === injected && error.message.includes('阶段=发布1') && error.message.includes('inject: publish failed before cleanup') && error.message.includes('清理失败') && error.message.includes('inject: cleanup failed'))
  checkTrue('F6 清理失败：残留仅为本次首个临时文件且记录清理尝试', leftovers(dir).length === 1 && cleanupAttempts === 2)
})

// F7 预存文件保护：不覆盖预存目标，也不因失败清理它。
inScenario('f7-preexisting', (dir) => {
  const existing = join(dir, '方案-f7.md')
  writeFileSync(existing, 'PREEXISTING-f7')
  let writes = 0
  const error = thrownBy(() => atomicCommit(dir, 'f7', pairOf('f7'), {
    writeFileSync: (...args) => { writes += 1; writeFileSync(...args) },
  }))
  checkTrue('F7 预存目标立即拒绝且阶段/原因明确', error !== null && error.message.includes('阶段=准备目标') && error.message.includes('预存目标已存在'))
  check('F7 预存目标字节不变且未进入写入/清理', [writes, readFileSync(existing, 'utf8'), leftovers(dir), crossedAt(dir, 'f7')], [0, 'PREEXISTING-f7', [], [true, false]])
})

// F8 旧 journal 哨兵与预存文件不参与后续调用；第二次调用只发布自己的新参数。
inScenario('f8-retry-new-args', (dir) => {
  const oldJournal = join(dir, '.journal-old-sentinel.json')
  const oldTarget = join(dir, '方案-old-sentinel.md')
  writeFileSync(oldJournal, 'OLD-JOURNAL-BYTES')
  writeFileSync(oldTarget, 'OLD-TARGET-BYTES')
  atomicCommit(dir, 'f8', pairOf('f8'))
  atomicCommit(dir, 'f9', pairOf('f9'))
  check('F8/F9 第二次调用只处理新参数且旧现场字节不变', [contentsOf(dir, ['方案-f8.md', '验收-f8.md', '方案-f9.md', '验收-f9.md']), readFileSync(oldJournal, 'utf8'), readFileSync(oldTarget, 'utf8')], [['PLAN-f8', 'CHECK-f8', 'PLAN-f9', 'CHECK-f9'], 'OLD-JOURNAL-BYTES', 'OLD-TARGET-BYTES'])
  check('F8/F9 正常调用无新 journal/tmp', [leftovers(dir), readdirSync(dir).filter((name) => name.startsWith('.journal-'))], [[], ['.journal-old-sentinel.json']])
})

output.summary(pass, fail)
process.exit(fail === 0 ? 0 : 1)
