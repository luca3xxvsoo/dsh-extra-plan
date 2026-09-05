// reviewer pwsh 写动词拦截（工具目录判定）验证：
// ①纯函数断言（catalogHasWriteTools / isReadOnlyChildByCatalog）
// ②预设静态断言（agent.cordis.yml 三行子代理 deny 清单）
// ③真实监听器拦截行为（mock ctx 走插件 apply 注册的 assemble/pre-execute）
// ④回归（主会话路由闸门、planner 拦截、anchored 引导收窄）
import { pathToFileURL, fileURLToPath } from 'node:url'
import { createRequire } from 'node:module'
import { readFileSync } from 'node:fs'
import { homedir } from 'node:os'

const DSH_HOME = (process.env.DSH_HOME || homedir() + '/.dsh').replaceAll('\\', '/')
const PLUGIN_PATH = fileURLToPath(new URL('../../plugins/dsh-extra-plan/index.js', import.meta.url))
const plugin = await import(pathToFileURL(PLUGIN_PATH).href)
const decisions = plugin.decisions
const { catalogHasWriteTools, isReadOnlyChildByCatalog, routeDenyReason } = decisions

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
const presetFile = DSH_HOME + '/.agent-presets/extra-plan/agent.cordis.yml'
let rows
try {
  rows = yaml.load(readFileSync(presetFile, 'utf8'), { schema })
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
checkDeny('tool-subagent-review', 14, ['write', 'edit', 'subagent_probe', 'cordis_run'], [], 'reviewer deny 恰 14 项且含 write/edit/subagent_probe/cordis_run')
checkDeny('tool-subagent', 12, ['subagent_probe', 'cordis_run'], ['write', 'edit'], 'executor deny 恰 12 项、不含 write/edit、含 subagent_probe/cordis_run')
checkDeny('tool-subagent-plan', null, ['write', 'edit', 'cordis_run'], ['subagent_probe'], 'planner deny 含 write/edit/cordis_run 且不含 subagent_probe')
checkDeny('tool-subagent-probe', 14, ['write', 'edit', 'subagent_probe', 'cordis_run'], ['subagent_fork'], 'probe deny 恰 14 项且含 write/edit/subagent_probe/cordis_run、不含 subagent_fork')

// ── ③ 真实监听器拦截行为（[任务5]，mock ctx 走插件 apply） ─────────────
function makeHarness(config) {
  const listeners = {}
  const ctx = {
    get: () => undefined,
    on: (name, fn) => {
      if (listeners[name] === undefined) listeners[name] = []
      listeners[name].push(fn)
    },
    // 修复（mock 契约补齐）：真实宿主 ctx 有 provide（插件 apply 顶层注册只读服务如
    // extra-plan/effectiveModel），mock 缺此方法导致 apply 抛 TypeError；与 step-06 同款写法。
    provide: (name, value) => { ctx[name] = value },
  }
  plugin.apply(ctx, config)
  return listeners
}
const harness = makeHarness({ anchoredBootstrap: false })
const harnessBoot = makeHarness({ anchoredBootstrap: true })

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

async function assemble(listeners, agent, tools) {
  const entry = listeners['system-prompt/assemble']
  if (entry === undefined || entry.length === 0) throw new Error('assemble 监听器未注册')
  return await entry[0](null, { agent }, async () => ({ tools, sections: [], contexts: [] }))
}
function preExecute(listeners, agent, name, argumentsObj) {
  const entry = listeners['tools/pre-execute']
  if (entry === undefined || entry.length === 0) throw new Error('pre-execute 监听器未注册')
  return entry[0]({ agent, name, arguments: argumentsObj }, () => ({ kind: 'allow' }))
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
const clarifyArgsE = JSON.stringify({ questions: [{ id: 'q1', options: [{ label: '方案A' }, { label: '方案B' }] }] })
const approvalArgsE = JSON.stringify({ questions: [{ id: 'q1', options: [{ label: '同意执行' }, { label: '转交pro规划' }, { label: '不同意' }] }] })
const answerE = (labels) => JSON.stringify({ answers: labels.map((l) => ({ id: 'q1', selected: [l] })) })
const mainWithEvents = (events) => ({ session: { header: { id: 'main-1', cwd: 'C:/work' }, snapshotEvents: () => events }, options: {}, ctx: undefined })

// direct 态：路由已确认「直接执行」；无确认态：无事件；plan+clarified 态：规划+澄清完成
const directMain = mainWithEvents([umE(), callE('ask_user_question', 'a1', routeArgsE), okE('a1', answerE(['直接执行']))])
const noneMain = mainWithEvents([])
const planMain = mainWithEvents([umE(), callE('ask_user_question', 'a1', routeArgsE), okE('a1', answerE(['进行pro规划'])), callE('ask_user_question', 'a2', clarifyArgsE), okE('a2', answerE(['方案A']))])

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
const sessionStart = (listeners, agent) => {
  const entry = listeners['agent/session-start']
  if (entry === undefined || entry.length === 0) throw new Error('session-start 监听器未注册')
  for (const fn of entry) fn({ agent })
}
// C1 probe 子会话（parent=main-1 已有 R18/R20/R21 放行累计的待认领计数、schemas 无写）→ 注册 save_probe
{
  const c1Registered = []
  const c1Probe = claimChild('probe-c1', 'main-1', claimTools(c1Registered, [{ name: 'read' }, { name: 'save_probe' }]))
  sessionStart(harness, c1Probe)
  checkTrue('C1 probe 子会话（parent=main-1 有待认领计数）session-start → save_probe 已注册', c1Registered.includes('save_probe'))
}
// C2 executor 子会话（schemas 含写、同父 main-1）→ 不注册且不消费
{
  const c2Registered = []
  const c2Exec = claimChild('exec-c2', 'main-1', claimTools(c2Registered, [{ name: 'read' }, { name: 'write' }]))
  sessionStart(harness, c2Exec)
  checkTrue('C2 executor 子会话（schemas 含写）session-start → 不注册', !c2Registered.includes('save_probe'))
  // 不消费验证：同父再触发 probe 子会话仍可认领（计数未被 C2 消耗）
  const c2bRegistered = []
  const c2bProbe = claimChild('probe-c2b', 'main-1', claimTools(c2bRegistered, [{ name: 'read' }, { name: 'save_probe' }]))
  sessionStart(harness, c2bProbe)
  checkTrue('C2b 同父再触发 probe 子会话 → 仍可认领（C2 未消费计数）', c2bRegistered.includes('save_probe'))
}
// C3 reviewer 子会话（schemas 无写、parent=parent-1 无 pending）→ 不注册
{
  const c3Registered = []
  const c3Rev = claimChild('review-c3', 'parent-1', claimTools(c3Registered, [{ name: 'read' }, { name: 'glob' }]))
  sessionStart(harness, c3Rev)
  checkTrue('C3 reviewer 子会话（无 pending）session-start → 不注册', !c3Registered.includes('save_probe'))
}

// ── ⑥ R-code 系列:F1 桥接（run_code 内嵌套 ask 驱动状态机） ──────────────
// 嵌套事件 fixture（同 step-00 F-code 系形状）：code-dispatch-start 的 arguments 为对象形态，
// code-dispatch 的 content 直接是 ContentBlock 数组（无 tool-result 外层）。
const cdStartE = (name, sid, argsObj) => ({ type: 'tool/code-dispatch-start', data: { rootCallId: 'r1', parentCallId: 'pc1', subCallId: sid, name, arguments: argsObj } })
const cdEndE = (sid, text, isError = false) => ({ type: 'tool/code-dispatch', data: { rootCallId: 'r1', parentCallId: 'pc1', subCallId: sid, name: 'ask_user_question', arguments: {}, isError, content: [{ type: 'text', text }] } })
const nestedRouteE = { questions: [{ id: 'q1', options: [{ label: '直接执行' }, { label: '进行pro规划' }, { label: '不同意' }] }] }
const nestedClarifyE = { questions: [{ id: 'q1', options: [{ label: '方案A' }, { label: '方案B' }] }] }
const nestedApprovalE = { questions: [{ id: 'q1', options: [{ label: '同意执行' }, { label: '转交pro规划' }, { label: '不同意' }] }] }
const nestedCustomE = '{"answers":[{"id":"q1","custom":"改成XX"}]}'

const nestedDirectMain = mainWithEvents([umE(), cdStartE('ask_user_question', 'n1', nestedRouteE), cdEndE('n1', answerE(['直接执行']))])
const nestedPlanMain = mainWithEvents([umE(), cdStartE('ask_user_question', 'n1', nestedRouteE), cdEndE('n1', answerE(['进行pro规划'])), cdStartE('ask_user_question', 'n2', nestedClarifyE), cdEndE('n2', nestedCustomE)])
const nestedApproveMain = mainWithEvents([umE(), cdStartE('ask_user_question', 'n1', nestedRouteE), cdEndE('n1', answerE(['进行pro规划'])), cdStartE('ask_user_question', 'n2', nestedClarifyE), cdEndE('n2', answerE(['方案A'])), cdStartE('ask_user_question', 'n3', nestedApprovalE), cdEndE('n3', answerE(['同意执行']))])

r = preExecute(harness, nestedDirectMain, 'write', {})
checkTrue('R22 嵌套路由答「直接执行」→ write 放行（F1 桥接）', r !== null && r !== undefined && r.kind === 'allow')
r = preExecute(harness, nestedPlanMain, 'subagent_plan', {})
checkTrue('R23 嵌套路由 plan+嵌套澄清 → subagent_plan 放行（F1 桥接）', r !== null && r !== undefined && r.kind === 'allow')
r = preExecute(harness, nestedApproveMain, 'subagent', { run_in_background: true })
checkTrue('R24 嵌套批准「同意执行」→ subagent 委派放行（F1 桥接）', r !== null && r !== undefined && r.kind === 'allow')

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
const approvedMain = mainWithEvents([umE(), callE('ask_user_question', 'a1', routeArgsE), okE('a1', answerE(['进行pro规划'])), callE('ask_user_question', 'a2', clarifyArgsE), okE('a2', answerE(['方案A'])), callE('ask_user_question', 'a3', approvalArgsE), okE('a3', answerE(['同意执行']))])
const escapeMain = mainWithEvents([umE(), callE('ask_user_question', 'a1', routeArgsE), errE('a1', 'NO_PROVIDER')])
const writeCode = { code: "await writeFileSync('x', '1')", description: '写文件' }
const readOnlyCode = { code: "await readFileSync('x', 'utf8')", description: '只读' }

r = preExecute(harness, noneMain, 'run_code', readOnlyCode)
checkTrue('R28 主会话 none 态 run_code（纯只读）→ 放行（终版：无写模式放行，ptc 死锁解除）', r !== null && r !== undefined && r.kind === 'allow')
r = preExecute(harness, noneMain, 'run_code', writeCode)
checkTrue('R29 主会话 none 态 run_code（含写）→ deny 且聚合含 routeDenyReason(\'write/edit\', { route: \'none\' }) 全文（组判定聚合报错）', r !== null && r !== undefined && r.kind === 'deny' && String(r.reason).includes(routeDenyReason('write/edit', { route: 'none' })))
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
checkTrue('R42 主会话 none 态 run_code（code 含嵌套 ask_user_question）→ 放行（外壳不拦嵌套，嵌套 ask 由瀑布判定）', r !== null && r !== undefined && r.kind === 'allow')
r = preExecute(harness, noneMain, 'run_code', nestedPlanCode)
checkTrue('R43 主会话 none 态 run_code（code 含嵌套 subagent_plan）→ deny 且含「子代理未放行：subagent_plan」（v4：组判定按直呼同闸门预审）', r !== null && r !== undefined && r.kind === 'deny' && String(r.reason).includes('子代理未放行：subagent_plan'))
r = preExecute(harness, noneMain, 'subagent_plan', { run_in_background: true })
checkTrue('R44 主会话 none 态直呼 subagent_plan（嵌套瀑布等价）→ deny 且文案含「子代理未放行：subagent_plan」（route 不符，与嵌套调用同文案）', r !== null && r !== undefined && r.kind === 'deny' && String(r.reason).includes('子代理未放行：subagent_plan'))
r = preExecute(harness, noneMain, 'run_code', nestedProbeCode)
checkTrue('R45 主会话 none 态 run_code（code 含嵌套 subagent_probe）→ 放行（外壳不拦嵌套探查委派）', r !== null && r !== undefined && r.kind === 'allow')
r = preExecute(harness, planMain, 'run_code', writeCode)
checkTrue('R46 主会话 plan+clarified 态 run_code（含写）→ deny 且聚合含 routeDenyReason(\'write/edit\', { route: \'plan\' }) 全文（含「规划态下主会话不可写文件」）', r !== null && r !== undefined && r.kind === 'deny' && String(r.reason).includes(routeDenyReason('write/edit', { route: 'plan' })))
r = preExecute(harness, approvedMain, 'run_code', writeCode)
checkTrue('R47 主会话 approved 态 run_code（含写）→ deny 且聚合含「方案已批准，执行请走 subagent 委派」', r !== null && r !== undefined && r.kind === 'deny' && String(r.reason).includes('方案已批准，执行请走 subagent 委派'))
r = preExecute(harness, approvedMain, 'run_code', { code: "await tools.subagent({ task: '执行', run_in_background: true })", description: '嵌套委派' })
checkTrue('R48 主会话 approved 态 run_code（code 含嵌套 tools.subagent(run_in_background:true)）→ 放行（v4：组判定 subagent 闸门 approved 放行，ptc 死锁解除）', r !== null && r !== undefined && r.kind === 'allow')
r = preExecute(harness, noneMain, 'run_code', { code: "await writeFileSync('x', '1'); await tools.subagent_plan({ task: '规划', run_in_background: true })", description: '多工具组' })
checkTrue('R49 主会话 none 态 run_code（裸写+subagent_plan 工具组）→ deny 且聚合同时含「路由未确认：write/edit」与「子代理未放行：subagent_plan」（多错误聚合）', r !== null && r !== undefined && r.kind === 'deny' && String(r.reason).includes('路由未确认：write/edit') && String(r.reason).includes('子代理未放行：subagent_plan'))
r = preExecute(harness, noneMain, 'run_code', { code: "await tools.read({ file_path: 'x' }); await tools.read({ file_path: 'x' }); await tools.subagent_probe({ run_in_background: true })", description: '去重组' })
checkTrue('R50 主会话 none 态 run_code（read 去重×2+subagent_probe(run_in_background:true)）→ 放行（去重后全过）', r !== null && r !== undefined && r.kind === 'allow')
r = preExecute(harness, noneMain, 'run_code', { code: "await tools.write({ file_path: 'x', content: '1' })", description: '显式 write' })
checkTrue('R51 主会话 none 态 run_code（code 含显式 tools.write）→ deny 且聚合含「路由未确认：write/edit」（显式 write 成员与裸写同文案）', r !== null && r !== undefined && r.kind === 'deny' && String(r.reason).includes('路由未确认：write/edit'))

// ── ⑩ R52-R84：全闸门补测（预算修复与测试缺口 2026-09-05） ─────────────
// 预算耗尽场景：18 组成功配对 = 已用 18/18（修复A 成功配对口径；修复B 收尾豁免）。
const budgetEvents = [DESC, ...Array.from({ length: 18 }, (_, i) => [callE('read', 'b' + i), okE('b' + i, 'ok')]).flat()]
const budgetPlanner = {
  session: { header: { id: 'planner-budget', origin: 'subagent', delegationDepth: 1, parentSession: 'parent-1', cwd: 'C:/work' }, snapshotEvents: () => budgetEvents },
  options: { model: 'deepseek-v4-pro' },
  ctx: undefined,
}
const planChildMain = mainWithEvents([umE(), callE('subagent_plan', 'p1', '{}'), okE('p1', '已启动规划子代理 3a7c1e5b-9d2f-4e8a-b6c4-1f0e9d8c7b6a，可 send_message 继续')])
const freeCode = { code: "await tools.save_plan({ plan: 'p', checklist: 'c' }); await tools.send_message({ agent_id: 'parent', message: '收尾' })", description: 'FREE_TOOLS 组' }
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
checkTrue('R70 save_probe 主会话 plan 态 → allow', r !== null && r !== undefined && r.kind === 'allow')
r = preExecute(harness, budgetPlanner, 'read', {})
checkTrue('R71 planner 预算耗尽 listener 层 → deny 且含「探查预算已耗尽（本轮已用 18/18）」', r !== null && r !== undefined && r.kind === 'deny' && String(r.reason).includes('探查预算已耗尽（本轮已用 18/18）'))
r = preExecute(harness, budgetPlanner, 'run_code', freeCode)
checkTrue('R72 planner 预算耗尽 FREE_TOOLS 组 → allow（修复B 收尾豁免）', r !== null && r !== undefined && r.kind === 'allow')
r = preExecute(harness, budgetPlanner, 'run_code', readMemberCode)
checkTrue('R73 planner 预算耗尽非豁免组 → deny 且含「探查预算已耗尽（本轮已用 18/18）」', r !== null && r !== undefined && r.kind === 'deny' && String(r.reason).includes('探查预算已耗尽（本轮已用 18/18）'))
r = preExecute(harness, plannerAgent, 'pwsh', { command: 'New-Item x.txt' })
checkTrue('R74 planner pwsh 写 → deny 且「规划子代理只读：pwsh 仅限只读探查命令」', r !== null && r !== undefined && r.kind === 'deny' && String(r.reason).includes('规划子代理只读：pwsh 仅限只读探查命令'))
r = preExecute(harness, plannerAgent, 'bash', { command: 'rm -rf x' })
checkTrue('R75 planner bash 写 → deny 且「规划子代理只读：bash 仅限只读探查命令」', r !== null && r !== undefined && r.kind === 'deny' && String(r.reason).includes('规划子代理只读：bash 仅限只读探查命令'))
r = preExecute(harness, probeAgent, 'bash', { command: 'rm -rf x' })
checkTrue('R76 probe bash 写 → deny 且「探查者只读：bash 仅限只读探查命令」', r !== null && r !== undefined && r.kind === 'deny' && String(r.reason).includes('探查者只读：bash 仅限只读探查命令'))
r = preExecute(harness, plannerAgent, 'send_message', { agent_id: 'parent', message: 'hi' })
checkTrue('R77 planner send_message → allow（FREE_TOOLS 豁免）', r !== null && r !== undefined && r.kind === 'allow')
r = preExecute(harness, probeAgent, 'send_message', { agent_id: 'parent', message: 'hi' })
checkTrue('R78 probe send_message → allow（child 分支不拦）', r !== null && r !== undefined && r.kind === 'allow')
r = preExecute(harness, planMain, 'subagent_plan', { run_in_background: false })
checkTrue('R79 subagent_plan 前台参数 → deny 且含「规划子代理不可前台等待」', r !== null && r !== undefined && r.kind === 'deny' && String(r.reason).includes('规划子代理不可前台等待'))
r = preExecute(harness, noneMain, 'cordis_inspect_query', {})
checkTrue('R80 cordis 只读族 → allow', r !== null && r !== undefined && r.kind === 'allow')
r = preExecute(harness, noneMain, 'run_code', smCode)
checkTrue('R81 组内 send_message 成员 → allow（白名单已删除，组判定放行）', r !== null && r !== undefined && r.kind === 'allow')
r = preExecute(harness, approvedMain, 'run_code', revCode)
checkTrue('R82 组内 subagent_review 成员（批准+后台）→ allow', r !== null && r !== undefined && r.kind === 'allow')
r = preExecute(harness, noneMain, 'run_code', joCode)
checkTrue('R83 组内 job_output wait 成员 → deny 且含「job_output 禁止带 wait: true」', r !== null && r !== undefined && r.kind === 'deny' && String(r.reason).includes('job_output 禁止带 wait: true'))
r = preExecute(harness, noneMain, 'run_code', revCode)
checkTrue('R84 组内 subagent_review 成员无批准 → deny 且含「执行类委派未放行：subagent_review」', r !== null && r !== undefined && r.kind === 'deny' && String(r.reason).includes('执行类委派未放行：subagent_review'))


console.log(`\n通过 ${pass}, 失败 ${fail}`)
process.exit(fail === 0 ? 0 : 1)
