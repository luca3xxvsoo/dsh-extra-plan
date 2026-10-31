// step-05-角色预设宿主回归.mjs
// 0.2.1 角色预设宿主契约：真实安装宿主包 + 内嵌 Loader 夹具（照 step-04-context-gate宿主回归 手法）。
// 只验证机械契约（roster / assertProvider / header.agentPreset / 工具面 / persona 渲染 / 旧值回落）；
// 真实 provider、模型行为、GUI 显示与生产 profile 一律 HUMAN/NOT-RUN，不由本脚本证明。
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { symlinkSync } from 'node:fs'
import { createIsolatedEnv, makeFixtureDir } from '../_shared/workspace-paths.mjs'
import { createPathContext } from '../../plugins/dsh-extra-plan/lib/path-policy.js'
import { registerHostDeps } from '../_shared/host-deps.mjs'



const HERE = dirname(fileURLToPath(import.meta.url))
const THIS_FILE = fileURLToPath(import.meta.url)
const ROOT = resolve(HERE, '..', '..')
const PLUGIN_PATH = join(ROOT, 'plugins', 'dsh-extra-plan', 'index.js')
const PRESET_DIR = join(ROOT, 'plugins', 'dsh-extra-plan', 'assets', 'presets', 'extra-plan')
const INSTALL_ROOT_RAW = typeof process.env.DSH_INSTALL_ROOT === 'string' && process.env.DSH_INSTALL_ROOT.trim() !== '' ? process.env.DSH_INSTALL_ROOT.trim() : null
const roleFixture = makeFixtureDir({ label: 'role-preset' })
const BATCH_DIR = roleFixture.root
const HOME_DIR = join(BATCH_DIR, 'home')
const SESSION_ROOT = join(BATCH_DIR, 'sessions')
const WORKSPACE = join(BATCH_DIR, 'workspace')
for (const dir of [HOME_DIR, SESSION_ROOT, WORKSPACE, join(BATCH_DIR, 'temp'), join(HOME_DIR, 'skills')]) mkdirSync(dir, { recursive: true })
writeFileSync(join(WORKSPACE, 'AGENTS.md'), '# role preset fixture\nfixture baseline instructions\n', 'utf8')
const ROLE_ENV_KEYS = Object.freeze(['DSH_HOME', 'HOME', 'USERPROFILE', 'APPDATA', 'LOCALAPPDATA', 'XDG_CACHE_HOME', 'DSH_EXTRA_PLAN_CAPTURE_DIR', 'DSH_EXTRA_PLAN_REPORT_DIR', 'TEMP', 'TMP', 'TMPDIR', 'DSH_PROFILE', 'DSH_EXTRA_PLAN_CONFIG_PATH'])
const previousEnv = Object.fromEntries(ROLE_ENV_KEYS.map((key) => [key, process.env[key]]))
const roleIsolatedEnv = createIsolatedEnv({ fixture: roleFixture, extra: { DSH_PROFILE: 'role-preset', DSH_EXTRA_PLAN_CONFIG_PATH: undefined } })
for (const key of ROLE_ENV_KEYS) {
  const value = roleIsolatedEnv[key]
  if (value === undefined) delete process.env[key]
  else process.env[key] = value
}
const INSTALL_ROOT = INSTALL_ROOT_RAW === null ? null : createPathContext({ hostDataRoot: INSTALL_ROOT_RAW }).hostDataRoot
const INSTALL_ANCHOR = INSTALL_ROOT === null ? null : join(INSTALL_ROOT, 'node_modules', '@deepseek-ai', 'dsh', 'package.json')
await registerHostDeps()
// 角色/主 definition 里的插件行写的是包名（生产由 profile 安装解析）。夹具用进程级解析钩子把
// 本仓插件名映射到源码，等价于生产安装后的 'dsh-extra-plan' 解析，不改宿主也不写仓库。
const moduleHooks = await import('node:module')
if (typeof moduleHooks.registerHooks === 'function') {
  const PLUGIN_ENTRY = pathToFileURL(join(resolve(dirname(fileURLToPath(import.meta.url)), '..', '..'), 'plugins', 'dsh-extra-plan', 'index.js')).href
  moduleHooks.registerHooks({ resolve(specifier, context, nextResolve) {
    if (specifier === 'dsh-extra-plan') return { url: PLUGIN_ENTRY, shortCircuit: true }
    return nextResolve(specifier, context)
  } })
}
const { Context } = await import('@deepseek-ai/cordis')
const { assembleContextFor } = await import('@deepseek-ai/dsh-agent')
const { default: Loader } = await import('@deepseek-ai/cordis-plugin-loader')
const { default: AgentPresetAdapter } = await import('@deepseek-ai/dsh-agent-preset')
const { parsePresetYaml } = await import('../../plugins/dsh-extra-plan/lib/preset-settings.js')

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

const { assetDefinitions, assetDefinition, definitionWithProjection, roleDefinitionsWithPresentation } = await import('../../plugins/dsh-extra-plan/lib/preset-sync.js')

const EXPECTED_ROSTER = ['extra-plan', 'extra-plan-executor', 'extra-plan-planner', 'extra-plan-reviewer', 'extra-plan-prober']
const EXPECTED_ROSTER_RECORDS = [
  { id: 'extra-plan', order: 100, name: '按需规划模式' },
  { id: 'extra-plan-executor', order: 101, name: '按需规划模式-执行者' },
  { id: 'extra-plan-planner', order: 102, name: '按需规划模式-规划者' },
  { id: 'extra-plan-reviewer', order: 103, name: '按需规划模式-验收者' },
  { id: 'extra-plan-prober', order: 104, name: '按需规划模式-探查者' },
]
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

async function runMode(mode) {
  let root
  const handles = []
  const adapters = []
  const entries = new Map()
  const modeHome = join(HOME_DIR, mode)
  const modeSessionRoot = join(SESSION_ROOT, mode)
  const modeWorkspace = join(WORKSPACE, mode)
  const modeTemp = join(BATCH_DIR, 'temp', mode)
  for (const dir of [modeHome, modeSessionRoot, modeWorkspace, modeTemp, join(modeHome, 'skills')]) mkdirSync(dir, { recursive: true })
  writeFileSync(join(modeWorkspace, 'AGENTS.md'), '# role preset fixture\nfixture baseline instructions\n', 'utf8')
  try {
    root = new Context()
    // AgentPresetRegistry stores the declaring Loader context.baseUrl in its public definition record.
    const loaderRoot = join(BATCH_DIR, 'loader-root-' + mode)
    const resolutionBase = pathToFileURL(join(loaderRoot, 'fixture-entry.mjs')).href
    root.baseUrl = resolutionBase
    root.provide('dshHomePath', (...parts) => join(modeHome, ...parts.map((part) => String(part))))
    root.provide('profileContext', { home: modeHome, dir: modeHome, patchPath: join(modeHome, 'cordis.patch.yml'), installAnchor: INSTALL_ANCHOR })
    mkdirSync(join(loaderRoot, 'node_modules'), { recursive: true })
    try { symlinkSync(join(ROOT, 'plugins', 'dsh-extra-plan'), join(loaderRoot, 'node_modules', 'dsh-extra-plan'), 'junction') } catch { /* 已存在 */ }
    await root.plugin(Loader, { baseUrl: resolutionBase })
    const rows = [
      { id: 'session', name: '@deepseek-ai/dsh-session' },
      { id: 'session-projection', name: '@deepseek-ai/dsh-session-projection' },
      { id: 'session-persistence-jsonl', name: '@deepseek-ai/dsh-session-persistence-jsonl', config: { root: modeSessionRoot, compression: 'zstd' } },
      { id: 'llm', name: '@deepseek-ai/dsh-llm' },
      { id: 'subprocess', name: '@deepseek-ai/dsh-subprocess-local' },
      { id: 'sandbox-policy', name: '@deepseek-ai/dsh-sandbox-policy', config: { mode: 'workspace-write', workspaceRoot: modeWorkspace } },
      { id: 'fs-sandbox', name: '@deepseek-ai/dsh-fs-sandbox', config: { cwd: modeWorkspace } },
      { id: 'fs-observation-policy', name: '@deepseek-ai/dsh-fs-observation-policy' },
      { id: 'sandbox', name: '@deepseek-ai/dsh-sandbox' },
      { id: 'ptc-runtime', name: '@deepseek-ai/dsh-ptc-runtime-node' },
      { id: 'working-directory', name: '@deepseek-ai/dsh-working-directory', config: { defaultDirectory: modeWorkspace } },
      { id: 'shell', name: '@deepseek-ai/dsh-shell' },
      { id: 'shell-env', name: '@deepseek-ai/dsh-shell-env', config: { dshHome: modeHome } },
      { id: 'pwsh-local', name: '@deepseek-ai/dsh-pwsh-local' },
      { id: 'jobs', name: '@deepseek-ai/dsh-jobs' },
      { id: 'jobs-local', name: '@deepseek-ai/dsh-jobs-local' },
      { id: 'skills', name: '@deepseek-ai/dsh-skill' },
      { id: 'skills-filesystem', name: '@deepseek-ai/dsh-skill-filesystem' },
      { id: 'web', name: '@deepseek-ai/dsh-web' },
      { id: 'cordis-host-runner', name: '@deepseek-ai/dsh-cordis-host-runner' },
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
    for (const entry of root.loader.entries()) entries.set(entry.options.id, entry)
    console.log('CORE_SERVICES=' + mode + '=ok')
    check('组0 ' + mode + ' 宿主 fs 提供方公开 resolve 可用', root.fs !== undefined && typeof root.fs.resolve === 'function')

    const sourceDefinitions = assetDefinitions()
    const mainDefinition = definitionWithProjection({ toolPresentationMode: mode })
    const definitions = [mainDefinition, ...roleDefinitionsWithPresentation(mainDefinition)]
    const projectedRecords = definitions.map((item) => ({ id: item.id, order: item.order, name: item.name }))
    check('组1 ' + mode + ' source definition 的主名/四角色 ID-order 保持冻结', JSON.stringify(sourceDefinitions.map((item) => ({ id: item.id, order: item.order, name: item.name }))) === JSON.stringify(EXPECTED_ROSTER_RECORDS))
    check('组1 ' + mode + ' 内存投影不改主/角色 ID-name-order', JSON.stringify(projectedRecords) === JSON.stringify(EXPECTED_ROSTER_RECORDS), JSON.stringify(projectedRecords))
    check('组1 ' + mode + ' 主 definition 顶层 17 条、角色首两行为 persona/extra-plan', definitions[0].plugins.length === 17 && definitions.slice(1).every((item) => JSON.stringify(item.plugins.slice(0, 2).map((row) => row.id)) === JSON.stringify(['persona', 'extra-plan'])))
    check('组1 ' + mode + ' 仅内存切换全部 tool-presentation.mode', definitions.every((item) => item.plugins.filter((row) => row.id === 'tool-presentation').length === 1 && item.plugins.find((row) => row.id === 'tool-presentation').config.mode === mode))

    for (const definition of definitions) adapters.push(await root.plugin(AgentPresetAdapter, definition))
    const roster = await root.agentPresets.list()
    const rosterIds = roster.map((item) => item.id)
    check('组1 ' + mode + ' roster 含原始 5 个 definition id（无 PTC 副本）', JSON.stringify(rosterIds) === JSON.stringify(EXPECTED_ROSTER), JSON.stringify(rosterIds))
    const rosterRecords = roster.map((item) => ({ id: item.id, order: item.order, name: item.name }))
    check('组1 ' + mode + ' registry.list 实际主名/四角色展示名与 ID/order 精确匹配', JSON.stringify(rosterRecords) === JSON.stringify(EXPECTED_ROSTER_RECORDS), JSON.stringify(rosterRecords))

    await root.loader.create({ id: 'tool-subagent', name: '@deepseek-ai/dsh-tool-subagent', config: { provider: 'spawn', toolName: 'subagent', agentPreset: 'extra-plan-executor' } })
    await root.loader.await()
    for (const entry of root.loader.entries()) entries.set(entry.options.id, entry)
    let toolSubagentRow = null
    const rowEntry = entries.get('tool-subagent')
    const toolSubagentMounted = rowEntry !== undefined && rowEntry.fiber !== undefined && rowEntry.fiber !== null && rowEntry.fiber.state === 2
    check('组2 ' + mode + ' tool-subagent 三键行装载成功（provider/toolName/agentPreset），即宿主 assertProvider 通过', toolSubagentMounted, rowEntry === undefined ? 'loader entry missing' : 'fiberState=' + String(rowEntry.fiber === undefined ? 'undefined' : rowEntry.fiber.state))
    if (rowEntry !== undefined) {
      const config = rowEntry.options !== undefined && rowEntry.options.config !== undefined ? rowEntry.options.config : {}
      toolSubagentRow = { provider: config.provider, toolName: config.toolName, agentPreset: config.agentPreset, keys: Object.keys(config).sort() }
    }
    check('组2 ' + mode + ' tool-subagent 配置恰三键且 agentPreset=extra-plan-executor', toolSubagentRow !== null && JSON.stringify(toolSubagentRow.keys) === JSON.stringify(['agentPreset', 'provider', 'toolName']) && toolSubagentRow.provider === 'spawn' && toolSubagentRow.toolName === 'subagent' && toolSubagentRow.agentPreset === 'extra-plan-executor', toolSubagentRow === null ? 'row missing' : JSON.stringify(toolSubagentRow))
    check('组2 ' + mode + ' extra-executor-spawn provider 缺席', root.subagents.getProvider('extra-executor-spawn') === undefined)
    check('组2 ' + mode + ' executor-spawn provider 缺席', root.subagents.getProvider('executor-spawn') === undefined)
    const spawner = root.subagents.getProvider('spawn')
    check('组2 ' + mode + ' spawn 提供者声明 agentPreset 能力且不继承父上下文', spawner !== undefined && spawner.capabilities !== undefined && spawner.capabilities.agentPreset === true && spawner.inheritsParentContext !== true, spawner === undefined ? 'provider missing' : JSON.stringify({ agentPreset: spawner.capabilities?.agentPreset, inherits: spawner.inheritsParentContext }))
    const rootSchemas = namesOf(root.tools.schemas(root))
    check('组2 ' + mode + ' 委派工具 subagent 已注册到根工具面', rootSchemas.includes('subagent'), JSON.stringify(rootSchemas.slice(0, 12)))
    root.loader.root.remove('tool-subagent')
    await root.loader.await()
    check('组2 ' + mode + ' 摘除夹具根级委派行后子作用域不再继承 subagent 工具', !namesOf(root.tools.schemas(root)).includes('subagent'))

    async function createChild(presetId, index) {
      const sessionId = 'role-preset-' + mode + '-' + presetId + '-' + String(index)
      const handle = await root.agents.create({
        sessionId,
        meta: { cwd: modeWorkspace, agentPreset: presetId, origin: 'subagent', delegationDepth: 1, isSeeded: false },
        setup: async (agentCtx) => {
          // rc.4 AgentPresetRegistry 的 profile preflight 读取 ctx.baseUrl；真实 AgentLoop child context 不自动继承 Loader tree 元数据，按公开 Context.baseUrl 字段补齐同一 W fixture 基准。
          const childBaseUrl = agentCtx.baseUrl ?? root.baseUrl ?? resolutionBase
          if (typeof childBaseUrl !== 'string' || childBaseUrl === '') throw new Error('role-preset fixture resolution base unavailable')
          agentCtx.baseUrl = childBaseUrl
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
    const plannerAgent = await createChild('extra-plan-planner', 1)
    check('组3 ' + mode + ' planner 子会话 header.agentPreset === extra-plan-planner', plannerAgent.session.header.agentPreset === 'extra-plan-planner', String(plannerAgent.session.header.agentPreset))
    check('组3 ' + mode + ' isPlannerChild(planner 子会话) === true', runtime.isPlannerChild(plannerAgent) === true)
    check('组3 ' + mode + ' isPlannerChild(主会话/非 planner 子会话) === false', runtime.isPlannerChild({ session: { header: { id: 'planner-like-main', cwd: modeWorkspace }, snapshotEvents: () => [] } }) === false)

    const executorAgent = await createChild('extra-plan-executor', 2)
    const executorTools = namesOf(root.tools.schemas(executorAgent))
    const FORBIDDEN = ['subagent', 'workflow', 'ralph', 'ask_user_question', 'todo_write']
    check('组4 ' + mode + ' executor 工具面不含 subagent/workflow/ralph/ask_user_question/todo_write', FORBIDDEN.every((name) => !executorTools.includes(name)), JSON.stringify(FORBIDDEN.filter((name) => executorTools.includes(name))))
    check('组4 ' + mode + ' executor 工具面含 write 与 edit', executorTools.includes('write') && executorTools.includes('edit'), JSON.stringify(executorTools))
    console.log('EXECUTOR_TOOLS=' + JSON.stringify({ mode, tools: executorTools }))
    const reviewerAgent = await createChild('extra-plan-reviewer', 3)
    const proberAgent = await createChild('extra-plan-prober', 4)
    const plannerTools = namesOf(root.tools.schemas(plannerAgent))
    check('组5 ' + mode + ' planner 工具面不含 write/edit 且含只读 shell pwsh', !plannerTools.includes('write') && !plannerTools.includes('edit') && plannerTools.includes('pwsh'), JSON.stringify({ write: plannerTools.includes('write'), edit: plannerTools.includes('edit'), pwsh: plannerTools.includes('pwsh') }))
    check('组5 ' + mode + ' planner 工具面含 web/coredis 只读工具且 web_fetch 按 fetch=false 不注册', plannerTools.includes('web_search') && plannerTools.includes('cordis_inspect_list') && !plannerTools.includes('web_fetch'), JSON.stringify(plannerTools.filter((name) => name.startsWith('web_') || name.startsWith('cordis_'))))
    console.log('PLANNER_TOOLS=' + JSON.stringify({ mode, tools: plannerTools }))

    const CONTROL_BINDING_NAMES = ['send_message', 'interrupt_agent']
    const CORDIS_BINDING_NAMES = ['cordis_inspect_list', 'cordis_inspect_query']
    const roleCases = [['executor', executorAgent], ['planner', plannerAgent], ['reviewer', reviewerAgent], ['prober', proberAgent]]
    for (const [roleName, agent] of roleCases) {
      const schemas = root.tools.schemas(agent)
      const schemaNames = namesOf(schemas)
      const bindingDefinitions = CONTROL_BINDING_NAMES.map((name) => root.tools.get(name, agent))
      const bindingNames = bindingDefinitions.map((definition) => definition === undefined || definition === null ? undefined : definition.name)
      const cordisDefinitions = CORDIS_BINDING_NAMES.map((name) => root.tools.get(name, agent))
      const cordisNames = cordisDefinitions.map((definition) => definition === undefined || definition === null ? undefined : definition.name)
      const controlAbsent = CONTROL_BINDING_NAMES.every((name, index) => !schemaNames.includes(name) && bindingNames[index] === undefined)
      const cordisOk = CORDIS_BINDING_NAMES.every((name, index) => schemaNames.includes(name) && cordisNames[index] === name)
      check('组8 ' + mode + ' ' + roleName + ' schemas/get 无 send/interrupt 且 Cordis 两工具为真实定义', controlAbsent && cordisOk, JSON.stringify({ names: schemaNames, control: bindingNames, cordis: cordisNames }))
      if (mode === 'ptc') {
        let assembly = null
        let assemblyError = ''
        try {
          assembly = await root.systemPrompt.assemble(assembleContextFor(agent))
        } catch (error) {
          assemblyError = error instanceof Error ? error.message : String(error)
        }
        const assemblySections = assembly !== null && Array.isArray(assembly.sections) ? assembly.sections : []
        const assemblyTools = assembly !== null ? namesOf(assembly.tools) : []
        const sdkSection = assemblySections.find((section) => section.name === 'tools:sdk')
        const sdkText = sdkSection === undefined ? '' : (typeof sdkSection.text === 'string' ? sdkSection.text : '')
        const ptcTopLevelOk = assemblyTools.length === 1 && assemblyTools[0] === 'run_code'
        const ptcTextOk = !sdkText.includes('send_message') && !sdkText.includes('interrupt_agent')
        check('组8 ' + mode + ' ' + roleName + ' PTC F 顶层仅 run_code、SDK 无 send/interrupt、Cordis schemas/get 保留', ptcTopLevelOk && controlAbsent && cordisOk && ptcTextOk, JSON.stringify({ topLevel: assemblyTools, sections: assemblySections.map((section) => section.name), sdkControlAbsent: ptcTextOk, cordis: cordisNames, assemblyError }))
        console.log('ROLE_BINDING=' + JSON.stringify({ mode, role: roleName, phase: 'F', creative: false, schemas: schemaNames, controlBindings: bindingNames, cordisBindings: cordisNames, topLevel: assemblyTools, sdkControlAbsent: ptcTextOk, sdkCordisObserved: sdkText.includes('cordis_inspect_list') || sdkText.includes('cordis_inspect_query') }))
      } else {
        console.log('ROLE_BINDING=' + JSON.stringify({ mode, role: roleName, phase: 'native', creative: false, schemas: schemaNames, controlBindings: bindingNames, cordisBindings: cordisNames, sdkControlAbsent: 'NOT-RUN' }))
      }
    }

    let plannerPrompt = ''
    let plannerAssembly = null
    try {
      plannerAssembly = await root.systemPrompt.assemble(assembleContextFor(plannerAgent))
      plannerPrompt = sectionTexts(plannerAssembly)
    } catch (error) {
      plannerPrompt = ''
      console.log('ASSEMBLE_ERROR=' + JSON.stringify({ mode, role: 'planner', phase: mode === 'ptc' ? 'F' : 'native', creative: false, error: error instanceof Error ? error.message : String(error) }))
    }
    const rolePersona = ROLE_PERSONAS['extra-plan-planner']
    const roleDefinition = definitions.find((item) => item.id === 'extra-plan-planner')
    const rolePrefix = roleDefinition?.plugins?.find((row) => row.id === 'persona')?.config?.prefix
    check('组6 ' + mode + ' planner personaPrefix 基础注册层保持原文（不证明最终请求）', typeof rolePersona === 'string' && rolePersona !== '' && rolePrefix === rolePersona, 'prefixLen=' + String(typeof rolePrefix === 'string' ? rolePrefix.length : 0))
    check('组6 ' + mode + ' planner assembleContextFor 返回文本（不把基础 persona 当最终请求）', plannerPrompt !== '', 'promptLen=' + String(plannerPrompt.length))
    check('组6 ' + mode + ' planner 组装输出不含主会话 persona 前缀', plannerPrompt !== '' && MAIN_PERSONA_SENTINEL !== '' && !plannerPrompt.includes(MAIN_PERSONA_SENTINEL))
    console.log('ASSEMBLY=' + JSON.stringify({ mode, role: 'planner', phase: mode === 'ptc' ? 'F' : 'native', creative: false, textObserved: plannerPrompt !== '', sectionNames: plannerAssembly === null ? [] : plannerAssembly.sections.map((section) => section.name), contextNames: plannerAssembly === null ? [] : plannerAssembly.contexts.map((context) => context.name) }))

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
    check('组7 ' + mode + ' 旧值 both 回落 native 且不抛错', fallbackOk, fallbackDetail)
    const nativeProjected = definitionWithProjection({ toolPresentationMode: 'ptc' })
    check('组7 ' + mode + ' 合法值 ptc 原样投影（回落只作用于旧值）', nativeProjected.plugins.find((item) => item.id === 'tool-presentation').config.mode === 'ptc')
  } catch (error) {
    incompleteCheck('角色预设宿主回归集成层[' + mode + ']', error instanceof Error ? error.stack || error.message : String(error))
  } finally {
    await Promise.all(adapters.map((dispose) => Promise.resolve(typeof dispose === 'function' ? dispose() : undefined)))
    for (const handle of handles) {
      try { await handle.dispose() } catch (error) { console.error('宿主 handle dispose failed: ' + (error instanceof Error ? error.message : String(error))) }
    }
    if (root !== undefined) {
      try { if (root.fiber !== undefined && typeof root.fiber.dispose === 'function') await root.fiber.dispose() } catch (error) { console.error('Cordis root dispose failed: ' + (error instanceof Error ? error.message : String(error))) }
    }
  }
}

await runMode('native')
await runMode('ptc')
console.log('CONTROL_BINDINGS=四角色 schemas/get/native/PTC SDK 均无 send_message/interrupt_agent；Cordis 两工具 schemas/get 真实存在；真实投递/中断=HUMAN/NOT-RUN；createChild 非 managedActivation')
console.log('HUMAN 真实 provider/模型行为/GUI/生产 profile/消息投递/中断生命周期: 未核实，不计 PASS；native/PTC SDK 仅完成静态呈现核对')
console.log('首失败=' + (firstFailure === null ? '无' : firstFailure.label + ' @line ' + String(firstFailure.line)))
console.log('通过 ' + pass + ', 失败 ' + fail + ', INCOMPLETE ' + incomplete)
process.exitCode = fail === 0 && incomplete === 0 ? 0 : 1
for (const [key, value] of Object.entries(previousEnv)) {
  if (value === undefined) delete process.env[key]
  else process.env[key] = value
}
