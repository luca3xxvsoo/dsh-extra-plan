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
import { registerHostDeps } from '../_shared/host-deps.mjs'
await registerHostDeps()
const plugin = await import(pathToFileURL(PLUGIN_PATH).href)
const decisions = plugin.decisions
const { catalogHasWriteTools, isReadOnlyChildByCatalog, routeDenyReason, runCodeCatchGateReason, runCodeGroupDenyReason, askUserQuestionReturnGateReason, probeDisposalWarning, runCodeSiteCount, isRunCodeSubCall, runCodeDispatchGateReason } = decisions

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
checkDeny('tool-subagent-plan', 13, ['write', 'edit', 'cordis_run', 'subagent_probe'], [], 'planner deny 恰 13 项且含 write/edit/cordis_run/subagent_probe')
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
    // 修复（mock 契约补齐）：真实宿主 ctx 有 provide（插件 apply 顶层注册只读服务），
    // mock 缺此方法导致 apply 抛 TypeError；与 step-06 同款写法。
    provide: (name, value) => { ctx[name] = value },
  }
  plugin.apply(ctx, config)
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

async function assemble(listeners, agent, tools) {
  const entry = listeners['system-prompt/assemble']
  if (entry === undefined || entry.length === 0) throw new Error('assemble 监听器未注册')
  return await entry[0](null, { agent }, async () => ({ tools, sections: [], contexts: [] }))
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
const clarifyArgsE = JSON.stringify({ questions: [{ id: 'q1', options: [{ label: '方案A' }, { label: '方案B' }] }] })
const purposeArgsE = JSON.stringify({ questions: [{ id: 'q1', options: [{ label: '完善方案' }, { label: '重新规划' }] }] })
const approvalArgsE = JSON.stringify({ questions: [{ id: 'q1', options: [{ label: '同意执行' }, { label: '转交pro规划' }, { label: '不同意' }] }] })
const answerE = (labels) => JSON.stringify({ answers: labels.map((l) => ({ id: 'q1', selected: [l] })) })
const mainWithEvents = (events) => ({ session: { header: { id: 'main-1', cwd: 'C:/work' }, snapshotEvents: () => events }, options: {}, ctx: undefined })

// direct 态：路由已确认「直接执行」；无确认态：无事件；plan+clarified 态：规划+澄清完成
const directMain = mainWithEvents([umE(), callE('ask_user_question', 'a1', routeArgsE), okE('a1', answerE(['直接执行']))])
const noneMain = mainWithEvents([])
const planMain = mainWithEvents([umE(), callE('ask_user_question', 'a1', routeArgsE), okE('a1', answerE(['进行pro规划'])), callE('ask_user_question', 'a2', clarifyArgsE), okE('a2', answerE(['方案A']))])
// planPurposeMain：路由 + 目的确认（「完善方案」）+ 澄清 三锚点齐备（目的 ask 位于澄清之前，同 persona 新顺序）
const planPurposeMain = mainWithEvents([umE(), callE('ask_user_question', 'a1', routeArgsE), okE('a1', answerE(['进行pro规划'])), callE('ask_user_question', 'a2', purposeArgsE), okE('a2', answerE(['完善方案'])), callE('ask_user_question', 'a3', clarifyArgsE), okE('a3', answerE(['方案A']))])

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

r = preExecute(harness, nestedDirectMain, 'write', {})
checkTrue('R22 嵌套路由答「直接执行」→ write 放行（F1 桥接）', r !== null && r !== undefined && r.kind === 'allow')
r = preExecute(harness, nestedPlanMain, 'subagent_plan', {})
checkTrue('R23 嵌套路由 plan+嵌套澄清 → subagent_plan 放行（F1 桥接）', r !== null && r !== undefined && r.kind === 'allow')
r = preExecute(harness, nestedApproveMain, 'subagent', { run_in_background: true })
checkTrue('R24 嵌套批准「同意执行」→ subagent 委派放行（F1 桥接）', r !== null && r !== undefined && r.kind === 'allow')

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
checkTrue('R42 主会话 none 态 run_code（code 含未返回的嵌套 ask_user_question）→ deny（返回值白名单）', r !== null && r !== undefined && r.kind === 'deny' && String(r.reason).includes('return await tools.ask_user_question(...)') && String(r.reason).includes('const q = await tools.ask_user_question(...); return JSON.stringify({ question: q })'))
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

// ── ⑭b T3：主会话 save_plan 路由矩阵（仅 direct 放行，其余路由态拒绝） ──────
// 内容闸门与规划子代理共用同一 defineSavePlan 实现（强度一致），本节只锁路由闸门；
// 若漏加显式分支，mainGateReason 兜底 return null 会让所有路由态放行 —— 逐态锁定。
const planUnclarifiedMain = mainWithEvents([umE(), callE('ask_user_question', 'a1', routeArgsE), okE('a1', answerE(['进行pro规划']))])
r = preExecute(harness, directMain, 'save_plan', { plan: 'p', checklist: 'c' })
checkTrue('T3-1 主会话 direct 态 save_plan → allow', r !== null && r !== undefined && r.kind === 'allow')
r = preExecute(harness, noneMain, 'save_plan', { plan: 'p', checklist: 'c' })
checkTrue('T3-2 主会话 none 态 save_plan → deny 且含「save_plan 仅允许在直接执行」与「当前路由态：none」', r !== null && r !== undefined && r.kind === 'deny' && String(r.reason).includes('save_plan 仅允许在直接执行') && String(r.reason).includes('当前路由态：none'))
r = preExecute(harness, planUnclarifiedMain, 'save_plan', { plan: 'p', checklist: 'c' })
checkTrue('T3-3 主会话 plan 未澄清态 save_plan → deny 且含「当前路由态：plan」', r !== null && r !== undefined && r.kind === 'deny' && String(r.reason).includes('当前路由态：plan'))
r = preExecute(harness, planMain, 'save_plan', { plan: 'p', checklist: 'c' })
checkTrue('T3-4 主会话 plan+clarified 态 save_plan → deny（路由仍为 plan）', r !== null && r !== undefined && r.kind === 'deny' && String(r.reason).includes('当前路由态：plan'))
r = preExecute(harness, approvedMain, 'save_plan', { plan: 'p', checklist: 'c' })
// 注：approved 是独立标志，deriveFlowState 的 route 仍为 'plan'（拒绝文案报的就是 route 态）。
checkTrue('T3-5 主会话 approved 态 save_plan → deny（文案含「save_plan 仅允许在直接执行」与「当前路由态：plan」）', r !== null && r !== undefined && r.kind === 'deny' && String(r.reason).includes('save_plan 仅允许在直接执行') && String(r.reason).includes('当前路由态：plan') && String(r.reason).includes('转交pro规划') === false)

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

// ── ⑨ ptc 锚定（anchored 引导放宽：无 shell 有 run_code 也锚定；P1-P11） ──
// ptc 折叠目录 [run_code]（wireSchemas 塌缩）：修复前 shells 为空 → 跳过锚定；
// 修复后 keep 在无 shell 分支加入 run_code → tools 收窄为 [run_code]、
// sections 替换为极简 persona、contexts 清空（SDK bindings 随之端出）。
{
  const ptcMain = await assemble(harnessBoot, mainAgent, [{ name: 'run_code' }])
  check('P1 ptc 主会话首轮 tools 恰为 [run_code]（锚定启用不跳过）', Array.isArray(ptcMain.tools) ? ptcMain.tools.map((t) => t.name) : null, ['run_code'])
  check('P2 ptc 主会话 sections 恰为极简 persona 单条', ptcMain.sections, [{ name: 'extra-plan-bootstrap', text: 'You are a helpful software engineer assistant.' }])
  check('P3 ptc 主会话 contexts 清空', ptcMain.contexts, [])
}
{
  const ptcPlanner = await assemble(harnessBoot, plannerAgent, [{ name: 'run_code' }])
  check('P4 ptc planner 首轮 tools 恰为 [run_code]', Array.isArray(ptcPlanner.tools) ? ptcPlanner.tools.map((t) => t.name) : null, ['run_code'])
  check('P5 ptc planner sections 恰为极简 persona 单条', ptcPlanner.sections, [{ name: 'extra-plan-bootstrap', text: 'You are a helpful software engineer assistant.' }])
  check('P6 ptc planner contexts 清空', ptcPlanner.contexts, [])
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
  check('P11 ptc executor 不引导（tools 原样 [run_code]）', Array.isArray(ptcExecutor.tools) ? ptcExecutor.tools.map((t) => t.name) : null, ['run_code'])
}


// ── ⑩b ASK 系列：主会话 ask 返回值白名单 + pre-execute 重入 ─────────────
const askReturnRunCases = [
  ['R-ASK1 裸 await ask → deny', 'await tools.ask_user_question({})', 'deny'],
  ['R-ASK2 只赋值不返回 → deny', 'const q = await tools.ask_user_question({})', 'deny'],
  ['R-ASK3 console.log 消费 → deny', 'console.log(await tools.ask_user_question({}))', 'deny'],
  ['R-ASK4 .then 包装 → deny', 'return await tools.ask_user_question({}).then((x) => x)', 'deny'],
  ['R-ASK5 工具别名 → deny', 'const ask = tools.ask_user_question; return await ask({})', 'deny'],
  ['R-ASK6 动态工具访问 → deny', "const name = 'ask_user_question'; return await tools[name]({})", 'deny'],
  ['R-ASK7 直接 return-await → allow', 'return await tools.ask_user_question({})', 'allow'],
  ['R-ASK8 单变量 JSON.stringify → allow', 'const q = await tools.ask_user_question({}); return JSON.stringify({ question: q })', 'allow'],
]
for (const [label, code, expectedKind] of askReturnRunCases) {
  r = preExecute(harness, noneMain, 'run_code', { code, description: label })
  const hasExamples = expectedKind === 'allow' || (r !== null && r !== undefined && String(r.reason).includes('return await tools.ask_user_question(...)') && String(r.reason).includes('const q = await tools.ask_user_question(...); return JSON.stringify({ question: q })'))
  checkTrue(label + '（默认 harness，闸门不依赖 runcodeCatchGate）', r !== null && r !== undefined && r.kind === expectedKind && hasExamples)
}

// 外层静态展开达到既有 depth 边界时先放行；实际内层带 parent 重新进入主会话 pre-execute，必须拒绝裸 await ask。
const nestedAskInnerCode = 'await tools.ask_user_question({})'
const nestedAskLevelOneCode = 'await tools.run_code({ "code": ' + JSON.stringify(nestedAskInnerCode) + ' })'
const nestedAskOuterCode = 'await tools.run_code({ "code": ' + JSON.stringify(nestedAskLevelOneCode) + ' })'
r = preExecute(harness, noneMain, 'run_code', { code: nestedAskOuterCode, description: '嵌套 ask 外层容器' })
checkTrue('R-ASK9 外层嵌套容器沿用 depth 边界 → allow', r !== null && r !== undefined && r.kind === 'allow')
r = preExecute(harness, noneMain, 'run_code', { code: nestedAskInnerCode, description: '嵌套 ask 实际内层' }, { rootCallId: 'nested-ask-root', parent: Symbol('nested-ask-parent') })
checkTrue('R-ASK10 带 parent 的实际内层裸 await ask 重入 → deny', r !== null && r !== undefined && r.kind === 'deny' && String(r.reason).includes('return await tools.ask_user_question(...)') && String(r.reason).includes('const q = await tools.ask_user_question(...); return JSON.stringify({ question: q })'))

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
checkTrue('UC16 runcodeCatchGate:false → null（开关关纯函数）', runCodeGroupDenyReason(undefined, { name: 'run_code', arguments: { code: "await tools.read({ file_path: 'x' })\nawait tools.read({ file_path: 'y' })" } }, { kind: 'main' }, { runcodeCatchGate: false }) === null)
checkTrue('UC17 显式 runcodeCatchGate:true → 拒且含「未全部独立容错」', (() => { const got = runCodeGroupDenyReason(undefined, { name: 'run_code', arguments: { code: "await tools.read({ file_path: 'x' })\nawait tools.read({ file_path: 'y' })" } }, { kind: 'main' }, { runcodeCatchGate: true }); return typeof got === 'string' && got.includes('未全部独立容错') })())
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
      source: { kind: 'plugin', plugin: 'tool-jobs', form: 'notice' },
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

console.log(`\n通过 ${pass}, 失败 ${fail}`)
process.exit(fail === 0 ? 0 : 1)
