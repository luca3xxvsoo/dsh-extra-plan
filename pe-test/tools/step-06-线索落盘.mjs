// save_probe 注册层 + 硬闸门五态 + planner 预算回归（v1 口径）验证（v3）：
// ①注册层断言（mock ctx 走插件 apply：主会话 save_probe 幂等 / planner 只 save_plan /
//   executor 均不注册）
// ②pre-execute save_probe 五态闸门（none→deny、plan 未澄清→deny、plan 已澄清→allow、
//   direct→deny、channelBroken→allow；deny 文案含「探查线索未放行」）
// ③planner 预算回归（v1 口径）：12 次耗尽后 read（含线索文件路径）仍 deny
//   （reason 含「探查预算已耗尽」）、save_plan 仍 allow——不引入任何预算豁免。
// ④执行层冒烟（真实落盘）：save_plan 双写 / save_probe 单写 + journal 双形状自愈。
import { pathToFileURL, fileURLToPath } from 'node:url'
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, readdirSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const PLUGIN_PATH = fileURLToPath(new URL('../../plugins/dsh-extra-plan/index.js', import.meta.url))
const plugin = await import(pathToFileURL(PLUGIN_PATH).href)

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
const answer = (labels) => JSON.stringify({ answers: labels.map((l) => ({ id: 'q1', selected: [l] })) })

// ── mock ctx harness（ctx.get 按 name==='tools' 返回注册表） ─────────────
function makeHarness(config, toolsMock) {
  const listeners = {}
  const ctx = {
    get: (name) => (name === 'tools' ? toolsMock : undefined),
    on: (name, fn) => {
      if (listeners[name] === undefined) listeners[name] = []
      listeners[name].push(fn)
    },
    provide: (name, value) => {
      ctx[name] = value
    },
  }
  plugin.apply(ctx, config)
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
async function firePreStep(listeners, agent) {
  const entry = listeners['agent/pre-step']
  if (entry === undefined || entry.length === 0) throw new Error('pre-step 监听器未注册')
  await entry[0]({ agent }, async () => ({ kind: 'enter', messages: [] }))
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
check('S2 主会话不注册 save_plan', registered.filter((t) => t.name === 'save_plan').length, 0)

registered.length = 0
fireSessionStart(harness, plannerAgent)
check('S3 planner 注册恰一条 save_plan', registered.filter((t) => t.name === 'save_plan').length, 1)
check('S4 planner 不注册 save_probe', registered.filter((t) => t.name === 'save_probe').length, 0)

registered.length = 0
fireSessionStart(harness, executorAgent)
await firePreStep(harness, executorAgent)
check('S5 executor 均不注册（空）', registered.length, 0)

// ── ② pre-execute save_probe 五态闸门（[任务4.2]，主会话） ───────────────
const FIVE = [
  ['S6 route=none → deny', [um()], 'deny'],
  ['S7 route=plan 未澄清 → deny', [um(), call('ask_user_question', 'a1', routeArgs), ok('a1', answer(['进行pro规划']))], 'deny'],
  ['S8 route=plan 已澄清 → allow', [um(), call('ask_user_question', 'a1', routeArgs), ok('a1', answer(['进行pro规划'])), call('ask_user_question', 'a2', clarifyArgs), ok('a2', answer(['方案A']))], 'allow'],
  ['S9 route=direct → deny', [um(), call('ask_user_question', 'a1', routeArgs), ok('a1', answer(['直接执行']))], 'deny'],
  ['S10 channelBroken → allow（逃生）', [um(), call('ask_user_question', 'a1', routeArgs), err('a1', 'NO_PROVIDER')], 'allow'],
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

// ── ③ planner 预算回归（v1 口径，[任务4.3]/[任务7.4]） ───────────────────
const plannerEvents = [DESC, umk('user')]
for (let i = 0; i < 20; i += 1) plannerEvents.push(call('read', `r${i}`))
const exhaustedPlanner = { session: { header: { id: 'planner-1', origin: 'subagent', delegationDepth: 1, parentSession: 'parent-1', cwd: 'C:/work' }, snapshotEvents: () => plannerEvents }, options: { model: 'deepseek-v4-pro' }, ctx: agentCtx }
let r = preExecute(harness, exhaustedPlanner, 'read', { file_path: 'C:/work/.extra-plan/线索-x-20260816090000.md' })
checkTrue('S11 预算耗尽后 read 线索文件 → deny（read 线索计入预算，v1 口径）', r !== null && r !== undefined && r.kind === 'deny' && String(r.reason).includes('探查预算已耗尽'))
r = preExecute(harness, exhaustedPlanner, 'save_plan', { plan: 'p', checklist: 'c' })
checkTrue('S12 预算耗尽后 save_plan → allow（跳过名单仍仅 save_plan）', r !== null && r !== undefined && r.kind === 'allow')
// 12 次内（含线索文件 read 共 12 次）不拒绝——预算边界恰好在第 13 次触发
const plannerEvents11 = [DESC, umk('user')]
for (let i = 0; i < 11; i += 1) plannerEvents11.push(call('read', `q${i}`))
const planner11 = { session: { header: { id: 'planner-1', origin: 'subagent', delegationDepth: 1, parentSession: 'parent-1', cwd: 'C:/work' }, snapshotEvents: () => plannerEvents11 }, options: { model: 'deepseek-v4-pro' }, ctx: agentCtx }
r = preExecute(harness, planner11, 'read', { file_path: 'C:/work/.extra-plan/线索-x-20260816090000.md' })
checkTrue('S13 第 12 次 read（线索文件）→ allow（读线索 1 次 = 预算减 1，剩 0 次余量）', r !== null && r !== undefined && r.kind === 'allow')
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

  // 旧形状 journal 自愈：planTmp 残留 → 触发 save_plan 补完
  const ep = join(work, '.extra-plan')
  const stalePlan = join(ep, '方案-stale.md')
  writeFileSync(join(ep, '.journal-stale.json'), JSON.stringify({ planTmp: join(ep, '方案-stale.md.tmp-x'), checkTmp: join(ep, '验收-stale.md.tmp-x'), planFile: stalePlan, checkFile: join(ep, '验收-stale.md') }))
  writeFileSync(join(ep, '方案-stale.md.tmp-x'), '旧残留')
  const planResult = await savePlanDef.execute({ plan: 'p'.repeat(300), checklist: 'c'.repeat(300), taskName: 'smoke2' }, execFake(work))
  const tsMatch = (p) => (String(p).match(/(\d{14})\.md$/) || [])[1]
  checkTrue('S21 save_plan 双文件落盘成功（同 timestamp）', Array.isArray(planResult.paths) && planResult.paths.length === 2 && existsSync(planResult.paths[0]) && existsSync(planResult.paths[1]) && tsMatch(planResult.paths[0]) === tsMatch(planResult.paths[1]))
  checkTrue('S22 旧形状 journal 残留被补完（方案-stale.md 存在）', existsSync(stalePlan))
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

console.log(`\n通过 ${pass}, 失败 ${fail}`)
process.exit(fail === 0 ? 0 : 1)
