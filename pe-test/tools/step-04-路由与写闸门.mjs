// reviewer pwsh 写动词拦截（工具目录判定）验证：
// ①纯函数断言（catalogHasWriteTools / isReadOnlyChildByCatalog）
// ②预设静态断言（agent.cordis.yml 三行子代理 deny 清单）
// ③真实监听器拦截行为（mock ctx 走插件 apply 注册的 assemble/pre-execute）
// ④回归（主会话路由闸门、planner 拦截、anchored 引导收窄）
import { pathToFileURL } from 'node:url'
import { createRequire } from 'node:module'
import { readFileSync } from 'node:fs'
import { homedir } from 'node:os'

const DSH_HOME = (process.env.DSH_HOME || homedir() + '/.dsh').replaceAll('\\', '/')
const PLUGIN_PATH = DSH_HOME + '/profiles/web/node_modules/@local/dsh-extra-plan/index.js'
const plugin = await import(pathToFileURL(PLUGIN_PATH).href)
const decisions = plugin.decisions
const { catalogHasWriteTools, isReadOnlyChildByCatalog } = decisions

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
const routeArgsE = JSON.stringify({ questions: [{ id: 'q1', options: [{ label: '直接执行' }, { label: '进行pro规划' }, { label: '不同意' }] }] })
const clarifyArgsE = JSON.stringify({ questions: [{ id: 'q1', options: [{ label: '方案A' }, { label: '方案B' }] }] })
const answerE = (labels) => JSON.stringify({ answers: labels.map((l) => ({ id: 'q1', selected: [l] })) })
const mainWithEvents = (events) => ({ session: { header: { id: 'main-1', cwd: 'C:/work' }, snapshotEvents: () => events }, options: {}, ctx: undefined })

// direct 态：路由已确认「直接执行」；无确认态：无事件；plan+clarified 态：规划+澄清完成
const directMain = mainWithEvents([umE(), callE('ask_user_question', 'a1', routeArgsE), okE('a1', answerE(['直接执行']))])
const noneMain = mainWithEvents([])
const planMain = mainWithEvents([umE(), callE('ask_user_question', 'a1', routeArgsE), okE('a1', answerE(['进行pro规划'])), callE('ask_user_question', 'a2', clarifyArgsE), okE('a2', answerE(['方案A']))])

// R18：direct 态派探查者（run_in_background: true）→ 放行（同时把 main-1 记入 probeParents，
// 供 R15-R17 的 probe 子会话经 header.parentSession 反查命中）
r = preExecute(harness, directMain, 'subagent_probe', { run_in_background: true })
checkTrue('R18 主会话 direct 态 subagent_probe(run_in_background: true) → 放行', r !== null && r !== undefined && r.kind === 'allow')
r = preExecute(harness, directMain, 'subagent_probe', {})
checkTrue('R19 主会话 direct 态 subagent_probe(缺 run_in_background) → deny 且文案含 run_in_background: true', r !== null && r !== undefined && r.kind === 'deny' && String(r.reason).includes('run_in_background: true'))
r = preExecute(harness, noneMain, 'subagent_probe', { run_in_background: true })
checkTrue('R20 主会话无路由确认态 subagent_probe(run_in_background: true) → 放行（任意状态放行）', r !== null && r !== undefined && r.kind === 'allow')
r = preExecute(harness, planMain, 'subagent_probe', { run_in_background: true })
checkTrue('R21 主会话 plan+clarified 态 subagent_probe(run_in_background: true) → 放行', r !== null && r !== undefined && r.kind === 'allow')

// probe 子会话（parentSession=main-1 已在 probeParents）：write → probe 文案 deny；
// pwsh 只读 → 放行；save_probe → 放行（child 分支不拦）
const probeAgent = {
  session: { header: { id: 'probe-1', origin: 'subagent', delegationDepth: 1, parentSession: 'main-1', cwd: 'C:/work' }, snapshotEvents: () => [] },
  options: {},
  ctx: undefined,
}
await assemble(harness, probeAgent, [{ name: 'read' }, { name: 'glob' }, { name: 'grep' }, { name: 'pwsh' }, { name: 'save_probe' }])
r = preExecute(harness, probeAgent, 'write', {})
checkTrue('R15 probe 会话 write → deny 且文案含「探查者只读」', r !== null && r !== undefined && r.kind === 'deny' && String(r.reason).includes('探查者只读'))
r = preExecute(harness, probeAgent, 'pwsh', { command: 'Get-ChildItem' })
checkTrue('R16 probe 会话 pwsh 只读 → 放行', r !== null && r !== undefined && r.kind === 'allow')
r = preExecute(harness, probeAgent, 'save_probe', { fileMap: [], focusAreas: [], exclusions: [], background: [] })
checkTrue('R17 probe 会话 save_probe → 放行', r !== null && r !== undefined && r.kind === 'allow')

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

console.log(`\n通过 ${pass}, 失败 ${fail}`)
process.exit(fail === 0 ? 0 : 1)
