// step-05-角色预设宿主回归.mjs
// 0.2.1 角色预设宿主契约：真实安装宿主包 + 内嵌 Loader 夹具（照 step-04-context-gate宿主回归 手法）。
// 只验证机械契约（roster / assertProvider / header.agentPreset / 工具面 / persona 渲染 / 旧值回落）；
// 真实 provider、模型行为、GUI 显示与生产 profile 一律 HUMAN/NOT-RUN，不由本脚本证明。
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { symlinkSync } from 'node:fs'
import { homedir } from 'node:os'
import { registerHostDeps } from '../_shared/host-deps.mjs'

await registerHostDeps()
// 角色/主 definition 里的插件行写的是包名（生产由 profile 安装解析）。夹具用进程级解析钩子把
// 本仓插件名映射到源码，等价于生产安装后的 'dsh-extra-plan' 解析，不改宿主也不写仓库。
const moduleHooks = await import('node:module')
if (typeof moduleHooks.registerHooks === 'function') {
  const PLUGIN_ENTRY = pathToFileURL(join(resolve(dirname(fileURLToPath(import.meta.url)), '..', '..'), 'plugins', 'dsh-extra-plan', 'index.js')).href
  const SPAWN_ENTRY = pathToFileURL(join(resolve(dirname(fileURLToPath(import.meta.url)), '..', '..'), 'plugins', 'dsh-extra-plan', 'lib', 'executor-spawn.js')).href
  moduleHooks.registerHooks({ resolve(specifier, context, nextResolve) {
    if (specifier === 'dsh-extra-plan') return { url: PLUGIN_ENTRY, shortCircuit: true }
    if (specifier === 'dsh-extra-plan/executor-spawn') return { url: SPAWN_ENTRY, shortCircuit: true }
    return nextResolve(specifier, context)
  } })
}
const { Context } = await import('@deepseek-ai/cordis')
const { default: Loader } = await import('@deepseek-ai/cordis-plugin-loader')
const { default: AgentPresetAdapter } = await import('@deepseek-ai/dsh-agent-preset')
const { parsePresetYaml } = await import('../../plugins/dsh-extra-plan/lib/preset-settings.js')

const HERE = dirname(fileURLToPath(import.meta.url))
const THIS_FILE = fileURLToPath(import.meta.url)
const ROOT = resolve(HERE, '..', '..')
const PLUGIN_PATH = join(ROOT, 'plugins', 'dsh-extra-plan', 'index.js')
const PRESET_DIR = join(ROOT, 'plugins', 'dsh-extra-plan', 'assets', 'presets', 'extra-plan')
const INSTALL_ROOT = resolve(process.env.DSH_INSTALL_ROOT || join(homedir(), 'AppData', 'Roaming', 'npm', 'node_modules', '@deepseek-ai', 'dsh'))
const BATCH_DIR = resolve(process.env.ROLE_PRESET_BATCH_DIR || join(ROOT, '.extra-plan', 'step-05-角色预设', 'run-' + String(Date.now())))
const HOME_DIR = join(BATCH_DIR, 'home')
const SESSION_ROOT = join(BATCH_DIR, 'sessions')
const WORKSPACE = join(BATCH_DIR, 'workspace')
for (const dir of [HOME_DIR, SESSION_ROOT, WORKSPACE, join(BATCH_DIR, 'temp'), join(HOME_DIR, 'skills')]) mkdirSync(dir, { recursive: true })
writeFileSync(join(WORKSPACE, 'AGENTS.md'), '# role preset fixture\nfixture baseline instructions\n', 'utf8')
const previousEnv = { DSH_HOME: process.env.DSH_HOME, TEMP: process.env.TEMP, TMP: process.env.TMP, DSH_EXTRA_PLAN_CONFIG_PATH: process.env.DSH_EXTRA_PLAN_CONFIG_PATH }
process.env.DSH_HOME = HOME_DIR
process.env.TEMP = join(BATCH_DIR, 'temp')
process.env.TMP = process.env.TEMP
delete process.env.DSH_EXTRA_PLAN_CONFIG_PATH

let pass = 0
let fail = 0
let incomplete = 0
let firstFailure = null
function callLine() {
  const stack = String(new Error().stack || '').split('\n')
  for (const line of stack) {
    if (!line.includes(THIS_FILE)) continue
    const match = /:(\d+):(\d+)\)?$/.exec(line.trim())
    if (match !== null) return Number(match[1])
  }
  return 0
}
function check(label, condition, detail = '') {
  if (condition) { pass += 1; console.log('PASS  ' + label); return true }
  fail += 1
  const line = callLine()
  if (firstFailure === null) firstFailure = { label, line }
  console.log('FAIL  ' + label + '  @line ' + String(line) + (detail === '' ? '' : '：' + detail))
  return false
}
function incompleteCheck(label, detail) {
  incomplete += 1
  const line = callLine()
  if (firstFailure === null) firstFailure = { label, line }
  console.log('INCOMPLETE  ' + label + '  @line ' + String(line) + '：' + detail)
}
function namesOf(schemas) {
  return Array.isArray(schemas) ? schemas.map((schema) => (schema !== null && typeof schema === 'object' && typeof schema.name === 'string') ? schema.name : String(schema)) : []
}
function sectionTexts(assembly) {
  return Array.isArray(assembly.sections) ? assembly.sections.map((section) => typeof section.text === 'string' ? section.text : '').join('\n') : ''
}

const { assetDefinitions, assetDefinition, definitionWithProjection } = await import('../../plugins/dsh-extra-plan/lib/preset-sync.js')

const EXPECTED_ROSTER = ['extra-plan', 'extra-plan-executor', 'extra-plan-planner', 'extra-plan-reviewer', 'extra-plan-prober']
const ROLE_PERSONAS = {}
for (const roleId of EXPECTED_ROSTER.slice(1)) {
  const file = join(PRESET_DIR, 'preset-definition-' + roleId + '.generated.yml')
  const definition = parsePresetYaml(readFileSync(file, 'utf8'))
  ROLE_PERSONAS[roleId] = definition.plugins[0].config.prefix
}
const mainDefinition = assetDefinition()
const mainPersonaRow = (mainDefinition.plugins.find((row) => row.id === 'persona') || {})
const mainPersonaPrefix = mainPersonaRow.config !== undefined && typeof mainPersonaRow.config.prefix === 'string' ? mainPersonaRow.config.prefix : ''
const MAIN_PERSONA_SENTINEL = mainPersonaPrefix.slice(0, 24)
console.log('HOST_INSTALL_ROOT=' + INSTALL_ROOT)
console.log('BATCH_DIR=' + BATCH_DIR)
console.log('MAIN_PERSONA_SENTINEL=' + JSON.stringify(MAIN_PERSONA_SENTINEL))

let root
const handles = []
try {
  root = new Context()
  // definition 内 !!js 求值域：宿主由 dsh-app-boot 的 ctx.provide('dshHomePath', ...) 提供，夹具等价提供。
  root.provide('dshHomePath', (...parts) => join(HOME_DIR, ...parts.map((part) => String(part))))
  // 角色 definition 里 dsh-extra-plan 行写的是包名（生产由 profile 安装解析）；夹具在临时目录里
  // 建 node_modules 软链，使 Loader 以该目录为 baseUrl 时能按包名解析到本仓插件源码。
  const loaderRoot = join(BATCH_DIR, 'loader-root')
  mkdirSync(join(loaderRoot, 'node_modules'), { recursive: true })
  try { symlinkSync(join(ROOT, 'plugins', 'dsh-extra-plan'), join(loaderRoot, 'node_modules', 'dsh-extra-plan'), 'junction') } catch { /* 已存在 */ }
  await root.plugin(Loader, { baseUrl: pathToFileURL(join(loaderRoot, 'fixture-entry.mjs')).href })
  const rows = [
    { id: 'session', name: '@deepseek-ai/dsh-session' },
    { id: 'session-projection', name: '@deepseek-ai/dsh-session-projection' },
    { id: 'session-persistence-jsonl', name: '@deepseek-ai/dsh-session-persistence-jsonl', config: { root: SESSION_ROOT, compression: 'zstd' } },
    { id: 'llm', name: '@deepseek-ai/dsh-llm' },
    { id: 'fs', name: '@deepseek-ai/dsh-fs' },
    { id: 'fs-local', name: '@deepseek-ai/dsh-fs-local', config: { cwd: WORKSPACE } },
    { id: 'subprocess', name: '@deepseek-ai/dsh-subprocess-local' },
    { id: 'working-directory', name: '@deepseek-ai/dsh-working-directory', config: { defaultDirectory: WORKSPACE } },
    { id: 'shell', name: '@deepseek-ai/dsh-shell' },
    { id: 'shell-env', name: '@deepseek-ai/dsh-shell-env', config: { dshHome: HOME_DIR } },
    { id: 'pwsh-local', name: '@deepseek-ai/dsh-pwsh-local' },
    { id: 'jobs', name: '@deepseek-ai/dsh-jobs' },
    { id: 'jobs-local', name: '@deepseek-ai/dsh-jobs-local' },
    { id: 'skills', name: '@deepseek-ai/dsh-skill' },
    { id: 'skills-filesystem', name: '@deepseek-ai/dsh-skill-filesystem' },
    { id: 'tools', name: '@deepseek-ai/dsh-tools', config: { mode: 'native' } },
    { id: 'system-prompt', name: '@deepseek-ai/dsh-system-prompt', config: { personaPrefix: '' } },
    { id: 'agent', name: '@deepseek-ai/dsh-agent' },
    { id: 'agent-loop', name: '@deepseek-ai/dsh-agent-loop', config: { agents: [] } },
    { id: 'subagent', name: '@deepseek-ai/dsh-subagent' },
    { id: 'subagent-spawn', name: '@deepseek-ai/dsh-subagent-spawn-in-process' },
    { id: 'agent-preset-registry', name: '@deepseek-ai/dsh-agent-preset-registry', config: { default: 'extra-plan' } },
  ]
  for (const row of rows) await root.loader.create(row)
  await root.loader.await()
  const entries = new Map()
  for (const entry of root.loader.entries()) entries.set(entry.options.id, entry)
  console.log('CORE_SERVICES=ok')

  // ── 组 1：5 个 definition 注册后 roster 含 5 个 id ─────────────────────────
  // 说明：主 definition 的完整挂载需要宿主全组合（skill-filesystem 的 bundledSkillDir、compaction、
  // tool-web 等），夹具不模拟；本组只断言 roster 含 5 个 id，角色契约由组 3-6 在 4 个角色预设上验证。
  const definitions = assetDefinitions()
  const adapters = []
  for (const definition of definitions) adapters.push(await root.plugin(AgentPresetAdapter, definition))
  const roster = await root.agentPresets.list()
  const rosterIds = roster.map((item) => item.id)
  check('组1 roster 含 5 个 definition id（主在前、角色 101..104 在后）', JSON.stringify(rosterIds) === JSON.stringify(EXPECTED_ROSTER), JSON.stringify(rosterIds))
  check('组1 主 definition 顶层 17 条、4 个角色 definition 首两行为 persona/extra-plan',
    definitions[0].plugins.length === 17 && definitions.slice(1).every((item) => JSON.stringify(item.plugins.slice(0, 2).map((row) => row.id)) === JSON.stringify(['persona', 'extra-plan'])))

  // tool-subagent 的 validate() 会 readDocument(agentPreset)，必须等 5 个 definition 注册完成后再装载。
  await root.loader.create({ id: 'tool-subagent', name: '@deepseek-ai/dsh-tool-subagent', config: { provider: 'spawn', toolName: 'subagent', agentPreset: 'extra-plan-executor' } })
  await root.loader.await()
  for (const entry of root.loader.entries()) entries.set(entry.options.id, entry)

  // ── 组 2：tool-subagent 装载不抛错即 assertProvider 通过 ──────────────────
  let toolSubagentRow = null
  const rowEntry = entries.get('tool-subagent')
  const toolSubagentMounted = rowEntry !== undefined && rowEntry.fiber !== undefined && rowEntry.fiber !== null && rowEntry.fiber.state === 2
  check('组2 tool-subagent 三键行装载成功（provider/toolName/agentPreset），即宿主 assertProvider 通过', toolSubagentMounted,
    rowEntry === undefined ? 'loader entry missing' : 'fiberState=' + String(rowEntry.fiber === undefined ? 'undefined' : rowEntry.fiber.state))
  if (rowEntry !== undefined) {
    const config = rowEntry.options !== undefined && rowEntry.options.config !== undefined ? rowEntry.options.config : {}
    toolSubagentRow = { provider: config.provider, toolName: config.toolName, agentPreset: config.agentPreset, keys: Object.keys(config).sort() }
  }
  check('组2 tool-subagent 配置恰三键且 agentPreset=extra-plan-executor',
    toolSubagentRow !== null && JSON.stringify(toolSubagentRow.keys) === JSON.stringify(['agentPreset', 'provider', 'toolName'])
    && toolSubagentRow.provider === 'spawn' && toolSubagentRow.toolName === 'subagent' && toolSubagentRow.agentPreset === 'extra-plan-executor',
    toolSubagentRow === null ? 'row missing' : JSON.stringify(toolSubagentRow))
  const spawner = root.subagents.getProvider('spawn')
  check('组2 spawn 提供者声明 agentPreset 能力且不继承父上下文（assertProvider 的判据）',
    spawner !== undefined && spawner.capabilities !== undefined && spawner.capabilities.agentPreset === true && spawner.inheritsParentContext !== true,
    spawner === undefined ? 'provider missing' : JSON.stringify({ agentPreset: spawner.capabilities?.agentPreset, inherits: spawner.inheritsParentContext }))
  const rootSchemas = namesOf(root.tools.schemas(root))
  check('组2 委派工具 subagent 已注册到根工具面', rootSchemas.includes('subagent'), JSON.stringify(rootSchemas.slice(0, 12)))
  // 组 3-6 观察的是角色预设内的工具面；根级夹具委派行属夹具自身，先摘除以免污染子会话工具清单
  // （生产里 subagent 工具由主预设 composition 提供，不在根作用域）。
  root.loader.root.remove('tool-subagent')
  await root.loader.await()
  check('组2 摘除夹具根级委派行后子作用域不再继承 subagent 工具', !namesOf(root.tools.schemas(root)).includes('subagent'))

  // ── 子会话工厂：真实 agents.create + 角色预设 mount（agentPreset 写入 header） ──
  async function createChild(presetId, index) {
    const sessionId = 'role-preset-' + presetId + '-' + String(index)
    const handle = await root.agents.create({
      sessionId,
      meta: { cwd: WORKSPACE, agentPreset: presetId, origin: 'subagent', delegationDepth: 1, isSeeded: false },
      setup: async (agentCtx) => {
        const presets = agentCtx.get ? agentCtx.get('agentPresets') : undefined
        if (presets === undefined) throw new Error('agentPresets service unavailable in child setup')
        await presets.mount(agentCtx, presetId)
      },
    })
    handles.push(handle)
    return handle.agent
  }
  const { createAgentRuntime } = await import('../../plugins/dsh-extra-plan/lib/agent-runtime.js')
  const runtime = createAgentRuntime({ getAgents: () => root.agents, sandboxPolicy: undefined, foldUsage: () => {}, warn: () => {} })

  // ── 组 3：planner 子会话 header.agentPreset 与 isPlannerChild ──────────────
  const plannerAgent = await createChild('extra-plan-planner', 1)
  check('组3 planner 子会话 header.agentPreset === extra-plan-planner', plannerAgent.session.header.agentPreset === 'extra-plan-planner', String(plannerAgent.session.header.agentPreset))
  check('组3 isPlannerChild(planner 子会话) === true', runtime.isPlannerChild(plannerAgent) === true)
  check('组3 isPlannerChild(主会话/非 planner 子会话) === false',
    runtime.isPlannerChild({ session: { header: { id: 'planner-like-main', cwd: WORKSPACE }, snapshotEvents: () => [] } }) === false)

  // ── 组 4：executor 子会话工具面 ───────────────────────────────────────────
  const executorAgent = await createChild('extra-plan-executor', 2)
  const executorTools = namesOf(root.tools.schemas(executorAgent))
  const FORBIDDEN = ['subagent', 'workflow', 'ralph', 'ask_user_question', 'todo_write']
  check('组4 executor 子会话工具面不含 subagent/workflow/ralph/ask_user_question/todo_write',
    FORBIDDEN.every((name) => !executorTools.includes(name)), JSON.stringify(FORBIDDEN.filter((name) => executorTools.includes(name))))
  check('组4 executor 子会话工具面含 write 与 edit', executorTools.includes('write') && executorTools.includes('edit'), JSON.stringify(executorTools))
  console.log('EXECUTOR_TOOLS=' + JSON.stringify(executorTools))

  // ── 组 5：planner 只读（无 write/edit） ───────────────────────────────────
  const plannerTools = namesOf(root.tools.schemas(plannerAgent))
  check('组5 planner 子会话工具面不含 write 与 edit', !plannerTools.includes('write') && !plannerTools.includes('edit'), JSON.stringify(plannerTools.includes('write') ? 'has write' : plannerTools.includes('edit') ? 'has edit' : 'clean'))
  console.log('PLANNER_TOOLS=' + JSON.stringify(plannerTools))

  // ── 组 6：planner 组装输出含角色 persona 原文、不含主会话 persona 前缀 ──────
  let plannerPrompt = ''
  try {
    const assembly = await root.systemPrompt.assemble({ scope: plannerAgent })
    plannerPrompt = sectionTexts(assembly)
  } catch (error) {
    plannerPrompt = ''
    console.log('ASSEMBLE_ERROR=' + (error instanceof Error ? error.message : String(error)))
  }
  const rolePersona = ROLE_PERSONAS['extra-plan-planner']
  check('组6 planner 组装输出含角色 persona 原文', plannerPrompt !== '' && rolePersona !== undefined && plannerPrompt.includes(rolePersona), 'promptLen=' + String(plannerPrompt.length))
  check('组6 planner 组装输出不含主会话 persona 前缀', plannerPrompt !== '' && MAIN_PERSONA_SENTINEL !== '' && !plannerPrompt.includes(MAIN_PERSONA_SENTINEL))

  // ── 组 7：toolPresentationMode 旧值 both 回落 native 且不抛错 ──────────────
  let fallbackOk = false
  let fallbackDetail = ''
  try {
    const projected = definitionWithProjection({ toolPresentationMode: 'both' })
    const row = projected.plugins.find((item) => item.id === 'tool-presentation')
    fallbackOk = row !== undefined && row.config !== undefined && row.config.mode === 'native'
    fallbackDetail = row === undefined ? 'row missing' : JSON.stringify(row.config)
  } catch (error) {
    fallbackDetail = error instanceof Error ? error.message : String(error)
  }
  check('组7 旧值 both 回落 native 且不抛错', fallbackOk, fallbackDetail)
  const nativeProjected = definitionWithProjection({ toolPresentationMode: 'ptc' })
  check('组7 合法值 ptc 原样投影（回落只作用于旧值）', nativeProjected.plugins.find((item) => item.id === 'tool-presentation').config.mode === 'ptc')

  await Promise.all(adapters.map((dispose) => Promise.resolve(typeof dispose === 'function' ? dispose() : undefined)))
} catch (error) {
  incompleteCheck('角色预设宿主回归集成层', error instanceof Error ? error.stack || error.message : String(error))
}

for (const handle of handles) {
  try { await handle.dispose() } catch (error) { console.error('宿主 handle dispose failed: ' + (error instanceof Error ? error.message : String(error))) }
}
if (root !== undefined) {
  try { if (root.fiber !== undefined && typeof root.fiber.dispose === 'function') await root.fiber.dispose() } catch (error) { console.error('Cordis root dispose failed: ' + (error instanceof Error ? error.message : String(error))) }
}
console.log('真实 provider/模型行为/GUI/生产 profile/HUMAN: NOT-RUN')
console.log('首失败=' + (firstFailure === null ? '无' : firstFailure.label + ' @line ' + String(firstFailure.line)))
console.log('通过 ' + pass + ', 失败 ' + fail + ', INCOMPLETE ' + incomplete)
process.exitCode = fail === 0 && incomplete === 0 ? 0 : 1
for (const [key, value] of Object.entries(previousEnv)) {
  if (value === undefined) delete process.env[key]
  else process.env[key] = value
}
