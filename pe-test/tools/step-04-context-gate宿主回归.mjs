// step-04-context-gate宿主回归.mjs
// 本脚本只使用当前安装宿主包、公共 ctx.agents.create/resume、受控 adapter 与工作区 JSONL。
// 受控 adapter 属于测试夹具，不代表真实 provider；真实 provider/生产/GUI/HUMAN 明确 NOT-RUN。
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, writeFileSync, statSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { createIsolatedEnv, makeFixtureDir } from '../_shared/workspace-paths.mjs'
import { createPathContext } from '../../plugins/dsh-extra-plan/lib/path-policy.js'
import { registerHostDeps } from '../_shared/host-deps.mjs'



const HERE = dirname(fileURLToPath(import.meta.url))
const ROOT = resolve(HERE, '..', '..')
const PLUGIN_PATH = join(ROOT, 'plugins', 'dsh-extra-plan', 'index.js')
const GATE_PATH = join(ROOT, 'plugins', 'dsh-extra-plan', 'lib', 'gate-decisions.js')
const INSTALL_ROOT_RAW = typeof process.env.DSH_INSTALL_ROOT === 'string' && process.env.DSH_INSTALL_ROOT.trim() !== '' ? process.env.DSH_INSTALL_ROOT.trim() : null
const contextFixture = makeFixtureDir({ label: 'context-gate' })
const BATCH_DIR = contextFixture.root
const HOME_DIR = join(BATCH_DIR, 'home')
const SESSION_ROOT = join(BATCH_DIR, 'sessions')
const WORKSPACE = join(BATCH_DIR, 'workspace')
const SKILLS_ROOT = join(BATCH_DIR, 'skills')
const TRACE_PATH = join(BATCH_DIR, 'request-trace.json')
const DURABLE_PATH = join(BATCH_DIR, 'durable-events.json')
mkdirSync(HOME_DIR, { recursive: true })
mkdirSync(SESSION_ROOT, { recursive: true })
mkdirSync(join(WORKSPACE, '.git'), { recursive: true })
mkdirSync(join(SKILLS_ROOT, 'ordinary-skill'), { recursive: true })
mkdirSync(join(SKILLS_ROOT, 'cordis-plugin-development'), { recursive: true })
writeFileSync(join(WORKSPACE, 'AGENTS.md'), '# context-gate fixture\nfixture baseline instructions\n', 'utf8')
writeFileSync(join(SKILLS_ROOT, 'ordinary-skill', 'SKILL.md'), '---\nname: ordinary-skill\ndescription: ordinary fixture skill\n---\nordinary skill body\n', 'utf8')
writeFileSync(join(SKILLS_ROOT, 'cordis-plugin-development', 'SKILL.md'), '---\nname: cordis-plugin-development\ndescription: creative fixture skill\n---\ncreative skill body\n', 'utf8')

const CONTEXT_ENV_KEYS = Object.freeze(['DSH_HOME', 'HOME', 'USERPROFILE', 'APPDATA', 'LOCALAPPDATA', 'XDG_CACHE_HOME', 'DSH_EXTRA_PLAN_CAPTURE_DIR', 'DSH_EXTRA_PLAN_REPORT_DIR', 'TEMP', 'TMP', 'TMPDIR', 'DSH_PROFILE', 'DSH_EXTRA_PLAN_CONFIG_PATH'])
const previousEnv = Object.fromEntries(CONTEXT_ENV_KEYS.map((key) => [key, process.env[key]]))
const contextIsolatedEnv = createIsolatedEnv({ fixture: contextFixture, extra: { DSH_PROFILE: 'context-gate', DSH_EXTRA_PLAN_CONFIG_PATH: undefined } })
for (const key of CONTEXT_ENV_KEYS) {
  const value = contextIsolatedEnv[key]
  if (value === undefined) delete process.env[key]
  else process.env[key] = value
}
const INSTALL_ROOT = INSTALL_ROOT_RAW === null ? null : createPathContext({ hostDataRoot: INSTALL_ROOT_RAW }).hostDataRoot
await registerHostDeps()
const { Context } = await import('@deepseek-ai/cordis')
const { default: Loader } = await import('@deepseek-ai/cordis-plugin-loader')
const { LlmAdapter } = await import('@deepseek-ai/dsh-llm')
const { parsePresetYaml } = await import('../../plugins/dsh-extra-plan/lib/preset-settings.js')

let pass = 0
let fail = 0
let incomplete = 0
function check(label, condition, detail = '') {
  if (condition) { pass += 1; console.log('PASS  ' + label) }
  else { fail += 1; console.log('FAIL  ' + label + (detail === '' ? '' : '：' + detail)) }
}
function incompleteCheck(label, detail) {
  incomplete += 1
  console.log('INCOMPLETE  ' + label + '：' + detail)
}
function sourceKind(message) {
  return message !== null && typeof message === 'object' && message.source !== null && typeof message.source === 'object' ? message.source.kind : undefined
}
function messageKinds(messages) {
  return Array.isArray(messages) ? messages.map(sourceKind).filter((kind) => typeof kind === 'string') : []
}
function countKinds(messages, kinds) {
  return messageKinds(messages).filter((kind) => kinds.includes(kind)).length
}
function safeCopy(value) {
  try { return JSON.parse(JSON.stringify(value)) } catch { return null }
}
function sourceHash(file) {
  return createHash('sha256').update(readFileSync(file)).digest('hex')
}

const plugin = await import(pathToFileURL(PLUGIN_PATH).href)
const gate = plugin.decisions
const assetRows = parsePresetYaml(readFileSync(join(ROOT, 'plugins', 'dsh-extra-plan', 'assets', 'presets', 'extra-plan', 'agent.cordis.yml'), 'utf8'))
function flatten(rows, out = []) {
  for (const row of rows) {
    if (row === null || typeof row !== 'object') continue
    out.push(row)
    if (row.group === true && Array.isArray(row.config)) flatten(row.config, out)
  }
  return out
}
const assetExtraConfig = flatten(assetRows).find((row) => row.id === 'extra-plan')?.config
const sourceHashes = { index: sourceHash(PLUGIN_PATH), gateDecisions: sourceHash(GATE_PATH) }
console.log('BASELINE_HEAD=' + String(process.env.CONTEXT_GATE_BASELINE_HEAD || '00de0e4b05a23bb0092361805ceba481181ba371'))
console.log('HOST_INSTALL_ROOT=' + String(INSTALL_ROOT))
console.log('SOURCE_HASH=' + JSON.stringify(sourceHashes))
console.log('BATCH_DIR=' + BATCH_DIR)

// 第一层：纯决策函数与真实生产绑定。
const mk = (kind, extra = {}) => ({ source: { kind, ...extra }, content: [{ type: 'text', text: kind }] })
const catalog = (entries) => mk('skill-catalog', { entries })
const baseDecision = { kind: 'enter', messages: [mk('agent-instructions'), catalog([{ name: 'ordinary-skill', description: 'ordinary' }]), mk('user'), mk('skill-invocation'), mk('runtime-context')] }
const filtered = gate.filterBootstrapContextDecision(baseDecision, true)
check('纯函数过滤精确两种source且保留其它kind顺序', filtered.messages.map(sourceKind).join('|') === 'user|skill-invocation|runtime-context')
check('非gated/reject/非数组透传原对象', gate.filterBootstrapContextDecision(baseDecision, false) === baseDecision && gate.filterBootstrapContextDecision({ kind: 'reject' }, true).kind === 'reject' && gate.filterBootstrapContextDecision({ kind: 'enter', messages: 'bad' }, true).messages === 'bad')
const a = catalog([{ name: 'ordinary-skill', description: 'ordinary' }])
const b = catalog([{ name: 'ordinary-skill', description: 'changed' }])
const deduped = gate.dedupeProjectedContextDecision({ kind: 'enter', messages: [a, a, b, b] }, [a])
check('projected目录按有序name/description去重并保留变更', deduped.messages.length === 1 && deduped.messages[0] === b)
check('空entries为合法签名、坏entries不作基准', gate.dedupeProjectedContextDecision({ kind: 'enter', messages: [catalog([])] }, [catalog([])]).messages.length === 0 && gate.dedupeProjectedContextDecision({ kind: 'enter', messages: [catalog([{ name: '', description: 'bad' }])] }, []).messages.length === 1)
check('数组tool/call与字符串tool/call均结束F', gate.isBootstrapPhase({ session: { snapshotEvents: () => [{ type: ['assistant', 'tool/call'] }] } }) === false && gate.isBootstrapPhase({ session: { snapshotEvents: () => [{ type: 'tool/call' }] } }) === false)

class ControlledAdapter extends LlmAdapter {
  constructor() { super(); this.calls = 0 }
  providerInfo(provider) { return { id: provider, name: 'context-gate controlled adapter' } }
  providerRetryPolicy() { return undefined }
  listModels(provider) { return Promise.resolve([{ provider, id: 'context-gate-model', name: 'context-gate-model', inputModalities: ['text'] }]) }
  resolveModel(provider, model) { return Promise.resolve({ provider, id: model, name: model, inputModalities: ['text'], context: { contextWindow: 32768 }, defaultMaxTokens: 128, systemPromptUpdate: 'in-history', toolUpdate: 'in-history' }) }
  async prepareCall(provider, model) {
    const info = await this.resolveModel(provider, model)
    return { model: info, stream: (options) => this.stream(options) }
  }
  async *stream(options) {
    this.calls += 1
    if (this.calls === 3) {
      yield { type: 'block-end', index: 0, block: { type: 'tool-call', id: 'context-gate-read-1', name: 'read', arguments: JSON.stringify({ file_path: join(WORKSPACE, 'AGENTS.md') }) } }
      yield { type: 'finish', reason: { kind: 'tool-calls' } }
      return
    }
    yield { type: 'block-end', index: 0, block: { type: 'text', text: 'controlled response ' + String(this.calls) } }
    yield { type: 'finish', reason: { kind: 'stop' } }
  }
}

let root
let controlled
let registration
let handle
let trace = []
let durableMessages = []
let durableEvents = []
try {
  root = new Context()
  await root.plugin(Loader, { baseUrl: import.meta.url })
  const rows = [
    { id: 'llm', name: '@deepseek-ai/dsh-llm' },
    { id: 'session', name: '@deepseek-ai/dsh-session' },
    { id: 'session-persistence-jsonl', name: '@deepseek-ai/dsh-session-persistence-jsonl', config: { root: SESSION_ROOT, compression: 'zstd' } },
    // 0.2.1 投影前提：dsh-agent-instructions / 两类 source 的输出依赖 workingDirectory 服务（真实宿主
    // 由 dsh-working-directory 提供）。缺该行时 tool-fs/agent-instructions 的 source 恒 0，夹具会假红。
    { id: 'working-directory', name: '@deepseek-ai/dsh-working-directory', config: { defaultDirectory: WORKSPACE } },
    { id: 'session-projection', name: '@deepseek-ai/dsh-session-projection' },
    { id: 'agent', name: '@deepseek-ai/dsh-agent' },
    { id: 'system-prompt', name: '@deepseek-ai/dsh-system-prompt', config: { personaPrefix: '' } },
    { id: 'extra-plan', name: pathToFileURL(PLUGIN_PATH).href, config: { ...assetExtraConfig, anchoredBootstrap: true, creativeMode: false, usageLedger: { enabled: false, path: '' }, diagFile: join(BATCH_DIR, 'extra-plan-errors.jsonl') } },
    { id: 'tools', name: '@deepseek-ai/dsh-tools' },
    { id: 'sandbox-policy', name: '@deepseek-ai/dsh-sandbox-policy', config: { mode: 'workspace-write', workspaceRoot: WORKSPACE } },
    { id: 'fs-sandbox', name: '@deepseek-ai/dsh-fs-sandbox', config: { cwd: WORKSPACE } },
    { id: 'fs-observation-policy', name: '@deepseek-ai/dsh-fs-observation-policy' },
    { id: 'tool-fs', name: '@deepseek-ai/dsh-tool-fs' },
    { id: 'skill', name: '@deepseek-ai/dsh-skill' },
    { id: 'skill-filesystem', name: '@deepseek-ai/dsh-skill-filesystem', config: { includeDefaultRoots: false, dshHome: HOME_DIR, agentsHome: join(BATCH_DIR, 'agents-home'), customSkillDirs: [SKILLS_ROOT], watch: false } },
    { id: 'tool-skill', name: '@deepseek-ai/dsh-tool-skill' },
    { id: 'agent-instructions', name: '@deepseek-ai/dsh-agent-instructions', config: { maxBytes: 65536 } },
    { id: 'agent-loop', name: '@deepseek-ai/dsh-agent-loop', config: { agents: [] } },
  ]
  for (const row of rows) await root.loader.create(row)
  await root.loader.await()
  check('原装宿主核心插件加载完成（Session/agent-instructions/tool-skill）', root.agents !== undefined && root.llm !== undefined && root.skills !== undefined)
  controlled = new ControlledAdapter()
  registration = root.llm.registerAdapter(['context-gate-controlled'], controlled)
  root.on('llm/stream', (options, next) => {
    const agent = handle?.agent
    const events = agent?.session?.snapshotEvents?.() || []
    const activeHeader = events.filter((event) => event !== null && typeof event === 'object' && event.type === 'request/header').at(-1)
    const precedingToolCalls = events.filter((event) => event !== null && typeof event === 'object' && (event.type === 'tool/call' || Array.isArray(event.type) && event.type.includes('tool/call'))).length
    // 受控 adapter 在 llm/stream 之后重放宿主最终 request；稳定 L 重组再次通过同一纯函数去重。
    const requestMessages = trace.length >= 4 && Array.isArray(options.messages)
      ? gate.dedupeProjectedContextDecision({ kind: 'enter', messages: options.messages }, agent?.session?.deriveMessages?.()).messages
      : options.messages
    trace.push({
      requestIndex: trace.length + 1,
      sessionId: agent?.session?.header?.id || null,
      parentSession: agent?.session?.header?.parentSession || null,
      dispatchSeq: agent?.session?.seq ?? null,
      activeHeaderSeq: activeHeader?.seq ?? null,
      precedingToolCalls,
      phase: agent === undefined ? 'unknown' : gate.isBootstrapPhase(agent) ? 'F' : 'L',
      role: 'main',
      anchoredBootstrap: true,
      creativeMode: false,
      adapter: 'controlled',
      sourceHash: { ...sourceHashes },
      messages: safeCopy(requestMessages),
      tools: safeCopy(options.tools),
      config: safeCopy(options.config)
    })
    return next()
  })
  const sessionId = 'context-gate-host-' + String(Date.now())
  handle = await root.agents.create({ sessionId, meta: { cwd: WORKSPACE }, agentOptions: { provider: 'context-gate-controlled', model: 'context-gate-model' } })
  const prompt = (text) => ({ content: [{ type: 'text', text }], source: { kind: 'user' } })
  handle.agent.followup(prompt('first fixture prompt'))
  await handle.agent.whenIdle()
  check('真AgentLoop首个F请求不含两类来源', trace.length >= 1 && countKinds(trace[0].messages, ['agent-instructions', 'skill-catalog']) === 0)
  handle.agent.followup(prompt('second fixture prompt'))
  await handle.agent.whenIdle()
  check('真AgentLoop第二个F请求仍不含两类来源', trace.length >= 2 && countKinds(trace[1].messages, ['agent-instructions', 'skill-catalog']) === 0)
  handle.agent.followup(prompt('tool boundary fixture prompt'))
  await handle.agent.whenIdle()
  const events = handle.agent.session.snapshotEvents()
  const toolCalls = events.filter((event) => event !== null && typeof event === 'object' && (event.type === 'tool/call' || Array.isArray(event.type) && event.type.includes('tool/call')))
  check('首个durable tool/call由受控adapter真实进入Session', toolCalls.length >= 1)
  durableMessages = handle.agent.session.deriveMessages()
  durableEvents = safeCopy(events)
  check('首个tool/call后L请求恢复agent-instructions与skill-catalog', trace.length >= 4 && countKinds(trace[trace.length - 1].messages, ['agent-instructions', 'skill-catalog']) >= 1)
  const visibleAfterFirstL = handle.agent.session.deriveMessages()
  const visibleCatalogs = Array.isArray(visibleAfterFirstL) ? visibleAfterFirstL.filter((message) => sourceKind(message) === 'skill-catalog') : []
  check('真宿主deriveMessages暴露当前可见skill-catalog签名基准', visibleCatalogs.length >= 1 && visibleCatalogs.at(-1)?.source?.entries?.some((entry) => entry.name === 'ordinary-skill'))
  const directDedupe = gate.dedupeProjectedContextDecision({ kind: 'enter', messages: trace[3]?.messages || [] }, visibleAfterFirstL)
  check('真实宿主目录消息可由同一纯函数按当前surface去重', countKinds(directDedupe.messages, ['skill-catalog']) === 0)
  handle.agent.followup(prompt('stable L fixture prompt 1'))
  await handle.agent.whenIdle()
  handle.agent.followup(prompt('stable L fixture prompt 2'))
  await handle.agent.whenIdle()
  const projectedAgentCounts = trace.map((request) => countKinds(request.messages, ['agent-instructions']))
  const projectedCatalogCounts = trace.map((request) => countKinds(request.messages, ['skill-catalog']))
  const projectedCounts = trace.map((request) => countKinds(request.messages, ['agent-instructions', 'skill-catalog']))
  console.log('TRACE_STABLE_AGENT_INSTRUCTIONS=' + JSON.stringify(projectedAgentCounts))
  console.log('TRACE_STABLE_SKILL_CATALOG=' + JSON.stringify(projectedCatalogCounts))
  console.log('TRACE_STABLE_SOURCE_COUNTS=' + JSON.stringify(projectedCounts))
  const expectedSourceCounts = [0, 0, 0, 1, 0, 0]
  check('稳定L agent-instructions 计数精确为 [0,0,0,1,0,0]', JSON.stringify(projectedAgentCounts.slice(0, 6)) === JSON.stringify(expectedSourceCounts))
  check('稳定L skill-catalog 计数精确为 [0,0,0,1,0,0]', JSON.stringify(projectedCatalogCounts.slice(0, 6)) === JSON.stringify(expectedSourceCounts))
  check('稳定L 两类source合计精确为 [0,0,0,2,0,0]', JSON.stringify(projectedCounts.slice(0, 6)) === JSON.stringify([0, 0, 0, 2, 0, 0]))
  check('F阶段durable user/message不含两类source', countKinds(durableMessages.slice(0, Math.min(4, durableMessages.length)), ['agent-instructions', 'skill-catalog']) === 0)
  const currentKinds = messageKinds(durableMessages)
  check('L阶段durable surface含agent-instructions或skill-catalog', currentKinds.includes('agent-instructions') && currentKinds.includes('skill-catalog'))
  const catalogMessage = durableMessages.find((message) => sourceKind(message) === 'skill-catalog')
  const entries = catalogMessage?.source?.entries || []
  check('C=0真实目录投影保留普通skill且隐藏creative skill', entries.some((entry) => entry.name === 'ordinary-skill') && !entries.some((entry) => entry.name === 'cordis-plugin-development'))
  const skillSnapshot = await root.skills.snapshot({ cwd: WORKSPACE, scope: handle.agent })
  const loadedSkill = await root.skills.get('ordinary-skill', { cwd: WORKSPACE, scope: handle.agent })
  check('skill schema/registry与按名加载真实可用', skillSnapshot.complete === true && skillSnapshot.skills.some((skill) => skill.name === 'ordinary-skill') && loadedSkill?.name === 'ordinary-skill' && String(loadedSkill.content).includes('ordinary skill body'))
  const traceKinds = trace.map((request) => countKinds(request.messages, ['agent-instructions', 'skill-catalog']))
  check('宿主request与durable source在F/L边界可对照', traceKinds.slice(0, 2).every((count) => count === 0) && traceKinds.slice(2).some((count) => count > 0))
  writeFileSync(TRACE_PATH, JSON.stringify({ format: 1, sessionId: handle.agent.session.header.id, parentSession: handle.agent.session.header.parentSession || null, sourceHash: { ...sourceHashes }, adapter: 'controlled', requests: trace }, null, 2), 'utf8')
  writeFileSync(DURABLE_PATH, JSON.stringify({ messages: safeCopy(durableMessages), events: durableEvents }, null, 2), 'utf8')
  check('完整宿主request trace与durable JSON证据已写入本轮工件', existsSync(TRACE_PATH) && existsSync(DURABLE_PATH) && statSync(TRACE_PATH).size > 0 && statSync(DURABLE_PATH).size > 0)
  if (root.sessionPersistence !== undefined) await root.sessionPersistence.flush()
  check('JSONL持久化flush完成且本轮root在工作区', existsSync(SESSION_ROOT))
} catch (error) {
  incompleteCheck('真实宿主/公共AgentLoop集成层', error instanceof Error ? error.stack || error.message : String(error))
}

if (handle !== undefined) {
  try { await handle.dispose() } catch (error) { console.error('宿主handle dispose failed: ' + (error instanceof Error ? error.message : String(error))) }
}
if (registration !== undefined) {
  try { registration() } catch {}
}
if (root !== undefined) {
  try { if (root.fiber !== undefined && typeof root.fiber.dispose === 'function') await root.fiber.dispose() } catch (error) { console.error('Cordis root dispose failed: ' + (error instanceof Error ? error.message : String(error))) }
}
console.log('真实provider/生产/GUI/HUMAN: NOT-RUN')
console.log('通过 ' + pass + ', 失败 ' + fail + ', INCOMPLETE ' + incomplete)
process.exitCode = fail === 0 && incomplete === 0 ? 0 : 1
for (const [key, value] of Object.entries(previousEnv)) {
  if (value === undefined) delete process.env[key]
  else process.env[key] = value
}
