// 设置页同页配置、HTTP 写闸门与真实 lazy client 保存回归；只使用内存 editor/slot/React 夹具。
import { createHash } from 'node:crypto'
import { createServer, request as httpRequest } from 'node:http'
import { createRequire, registerHooks, syncBuiltinESMExports } from 'node:module'
import { isDeepStrictEqual } from 'node:util'
import fs from 'node:fs'
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { createIsolatedEnv, makeFixtureDir } from '../_shared/workspace-paths.mjs'
import { createPathContext } from '../../plugins/dsh-extra-plan/lib/path-policy.js'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { createOutput } from '../_shared/test-output.mjs'
import { runInNewContext } from 'node:vm'

const REPO_ROOT = fileURLToPath(new URL('../..', import.meta.url))
const TARGET_INSTALL_ROOT = typeof process.env.DSH_INSTALL_ROOT === 'string' && process.env.DSH_INSTALL_ROOT.trim() !== ''
  ? process.env.DSH_INSTALL_ROOT.trim()
  : undefined
function firstExistingPath(paths) {
  for (const path of paths) if (existsSync(path)) return path
  return undefined
}
function readHostJson(paths) {
  const path = firstExistingPath(paths)
  if (path === undefined) return undefined
  try { return { path, value: JSON.parse(readFileSync(path, 'utf8')) } } catch { return undefined }
}
function readHostText(paths) {
  const path = firstExistingPath(paths)
  if (path === undefined) return undefined
  try { return { path, value: readFileSync(path, 'utf8') } } catch { return undefined }
}
function hostCandidates(relativePath) {
  if (TARGET_INSTALL_ROOT === undefined) return []
  return [
    join(TARGET_INSTALL_ROOT, relativePath),
    join(TARGET_INSTALL_ROOT, 'node_modules', '@deepseek-ai', 'dsh', relativePath),
  ]
}
// 0.2.1：优先读安装根 node_modules 下的 dsh 清单（真实宿主安装形态），根 package.json 只作后备。
const targetDsh = TARGET_INSTALL_ROOT === undefined
  ? undefined
  : readHostJson([join(TARGET_INSTALL_ROOT, 'node_modules', '@deepseek-ai', 'dsh', 'package.json'), join(TARGET_INSTALL_ROOT, 'package.json')])
const targetDshLlm = readHostJson([
  ...hostCandidates('node_modules/@deepseek-ai/dsh-llm/package.json'),
  ...hostCandidates('node_modules/@deepseek-ai/dsh/node_modules/@deepseek-ai/dsh-llm/package.json'),
])
const targetSlotMap = readHostText([
  ...hostCandidates('node_modules/@deepseek-ai/dsh-client-ui-plugin-manager/lib/types/client/slot-contract.d.ts'),
  ...hostCandidates('node_modules/@deepseek-ai/dsh/node_modules/@deepseek-ai/dsh-client-ui-plugin-manager/lib/types/client/slot-contract.d.ts'),
])
const targetConfigForms = readHostText([
  ...hostCandidates('node_modules/@deepseek-ai/dsh-client-ui-settings/lib/types/client/config-form.d.ts'),
  ...hostCandidates('node_modules/@deepseek-ai/dsh/node_modules/@deepseek-ai/dsh-client-ui-settings/lib/types/client/config-form.d.ts'),
])
const OFFICIAL_ROOT = TARGET_INSTALL_ROOT === undefined ? undefined : join(TARGET_INSTALL_ROOT, 'node_modules', '@deepseek-ai', 'dsh')
const INSTALL_ANCHOR = OFFICIAL_ROOT === undefined ? undefined : join(OFFICIAL_ROOT, 'package.json')


const patchText = readFileSync(join(REPO_ROOT, 'plugins/dsh-extra-plan/cordis.patch.yml'), 'utf8')
const syncText = readFileSync(join(REPO_ROOT, 'plugins/dsh-extra-plan/lib/preset-sync.js'), 'utf8')
const clientText = readFileSync(join(REPO_ROOT, 'plugins/dsh-extra-plan/lib/client.js'), 'utf8')
const keys = ['anchoredBootstrap', 'creativeMode', 'webFetch', 'toolPresentationMode', 'runcodeCatchGate', 'crossProviderPlannerModel', 'plannerModel', 'plannerPromptSuffix', 'exploreBudget', 'otherAgentModel']

let pass = 0
let fail = 0
const output = createOutput({ argv: process.argv.slice(2) })
function check(label, condition) {
  if (condition) pass += 1
  else fail += 1
  output.assertion(condition, label, true, condition)
}

const settingsBootstrapFixture = makeFixtureDir({ label: 'settings-bootstrap' })
const settingsEnvKeys = Object.freeze(['DSH_HOME', 'HOME', 'USERPROFILE', 'APPDATA', 'LOCALAPPDATA', 'XDG_CACHE_HOME', 'DSH_EXTRA_PLAN_CAPTURE_DIR', 'DSH_EXTRA_PLAN_REPORT_DIR', 'TEMP', 'TMP', 'TMPDIR', 'DSH_PROFILE'])
const originalBootstrapEnv = Object.fromEntries(settingsEnvKeys.map((key) => [key, process.env[key]]))
const originalTestEnvironment = { DSH_HOME: process.env.DSH_HOME, DSH_PROFILE: process.env.DSH_PROFILE, USERPROFILE: process.env.USERPROFILE, HOME: process.env.HOME }
const settingsIsolatedEnv = createIsolatedEnv({ fixture: settingsBootstrapFixture, extra: { DSH_PROFILE: 'fixture' } })
for (const key of settingsEnvKeys) {
  const value = settingsIsolatedEnv[key]
  if (value === undefined) delete process.env[key]
  else process.env[key] = value
}
try {
  const anchor = createRequire(INSTALL_ANCHOR)
  const schemaUrl = pathToFileURL(anchor.resolve('@deepseek-ai/schemastery')).href
  const yamlUrl = pathToFileURL(anchor.resolve('js-yaml')).href
  if (typeof registerHooks === 'function') registerHooks({ resolve(specifier, context, next) {
    if (specifier === '@deepseek-ai/schemastery') return { url: schemaUrl, shortCircuit: true }
    if (specifier === 'js-yaml') return { url: yamlUrl, shortCircuit: true }
    return next(specifier, context)
  } })
} catch { /* 静态合同仍可执行；宿主缺依赖时运行时项会明确失败 */ }
let patch
const presetSettings = await import('../../plugins/dsh-extra-plan/lib/preset-settings.js')
const { parsePresetYaml, SETTING_DEFINITIONS } = presetSettings
try { patch = parsePresetYaml(patchText) } catch (error) { console.error('FAIL  patch YAML parse: ' + String(error)); process.exit(1) }
const { Config } = await import('../../plugins/dsh-extra-plan/lib/settings.js')
const { createLiveConfig } = await import('../../plugins/dsh-extra-plan/lib/live-config.js')
const { createGateRuntime, GATE_WORD_FIELDS } = await import('../../plugins/dsh-extra-plan/lib/gate-words.js')
const { createQqbotSettingsSynchronizer, stableSnapshotHash, planQqbotSettingsPatch, writeQqbotSettingsPatch } = await import('../../plugins/dsh-extra-plan/lib/qqbot-settings-sync.js')
const { planCanonicalSettingsMigration } = await import('../../plugins/dsh-extra-plan/lib/preset-yaml.js')
for (const key of settingsEnvKeys) {
  const value = originalBootstrapEnv[key]
  if (value === undefined) delete process.env[key]
  else process.env[key] = value
}
// 业务夹具均有明确 profile/document 根；不让宿主环境 DSH_HOME 与该根形成矛盾来源。
delete process.env.DSH_HOME
const descriptorKeys = SETTING_DEFINITIONS.map((definition) => definition.key)
const configDict = Config !== undefined && Config !== null && Config.dict !== undefined && Config.dict !== null ? Config.dict : {}
const configKeys = Object.keys(configDict)
const configKeySetMatches = JSON.stringify([...configKeys].sort()) === JSON.stringify([...descriptorKeys].sort())
check('V03 patch 顶层公开 insert 恰一行且稳定 id=dsh-extra-plan-settings', Array.isArray(patch) && patch.length === 1 && Array.isArray(patch[0].insert) && patch[0].insert.length === 1 && patch[0].insert[0].id === 'dsh-extra-plan-settings')


check('V03 descriptor 与 Config 实际字段集合均恰10项且包含两项宿主值', descriptorKeys.length === 10 && configKeys.length === 10 && configKeySetMatches && JSON.stringify([...configKeys].sort()) === JSON.stringify(keys.slice().sort()) && descriptorKeys.includes('webFetch') && descriptorKeys.includes('toolPresentationMode'))
check('V02 当前词表严格拒绝、旧值安全解析且不求值', syncText.includes('当前全局 gateWords 非法') && syncText.includes('readLegacyState') && syncText.includes('parsePresetYaml') && !syncText.includes('eval(') && !syncText.includes('Function('))





function slotHasKind(text, name, kind) {
  if (text === undefined) return false
  const start = text.indexOf("'" + name + "'")
  return start >= 0 && text.slice(start, start + 260).includes("kind: '" + kind + "'")
}
if (TARGET_INSTALL_ROOT === undefined) {
  console.log('HUMAN  {"scope":"HOST-VERSION","reason":"DSH_INSTALL_ROOT 未提供；真实宿主版本/manifest/SlotMap/ConfigForms 本轮未执行，工作区夹具与静态检查不受此边界覆盖"}')
} else if (targetDsh === undefined || targetDshLlm === undefined) {
  console.log('HUMAN  {"scope":"HOST-VERSION","reason":"DSH_INSTALL_ROOT 缺少可读取的 dsh/dsh-llm manifest，未伪造宿主结论"}')
} else {
  const dshVersion = targetDsh.value !== null && typeof targetDsh.value === 'object' ? targetDsh.value.version : undefined
  const dshLlmVersion = targetDshLlm.value !== null && typeof targetDshLlm.value === 'object' ? targetDshLlm.value.version : undefined
  console.log('INFO  HOST 真实 manifest dsh=' + String(dshVersion) + ' dsh-llm=' + String(dshLlmVersion) + ' root=' + TARGET_INSTALL_ROOT)
  // 版本门改为语义门：以本包 package.json 声明的 peer/semver 范围判定宿主是否被支持，不硬编码版本号。
  let semverModule = null
  try { semverModule = createRequire(join(TARGET_INSTALL_ROOT, 'package.json'))('semver') } catch { semverModule = null }
  let declaredDsh = null
  let declaredLlm = null
  try {
    const manifest = JSON.parse(readFileSync(new URL('../../plugins/dsh-extra-plan/package.json', import.meta.url), 'utf8'))
    declaredDsh = manifest.peerDependencies?.['@deepseek-ai/dsh']
    declaredLlm = manifest.peerDependencies?.['@deepseek-ai/dsh-llm']
  } catch { declaredDsh = null; declaredLlm = null }
  const versionGateOk = typeof declaredDsh === 'string' && typeof declaredLlm === 'string'
    && typeof dshVersion === 'string' && typeof dshLlmVersion === 'string'
    && (semverModule === null
      ? (declaredDsh.split('||').map((part) => part.trim()).includes(dshVersion) && declaredLlm.split('||').map((part) => part.trim()).includes(dshLlmVersion))
      : (semverModule.satisfies(dshVersion, declaredDsh, { includePrerelease: true }) && semverModule.satisfies(dshLlmVersion, declaredLlm, { includePrerelease: true })))
  console.log('INFO  HOST 语义门 declared=' + String(declaredDsh) + ' / ' + String(declaredLlm) + ' actual=' + String(dshVersion) + ' / ' + String(dshLlmVersion) + ' ok=' + String(versionGateOk))
  if (!versionGateOk) {
    console.log('HUMAN  {"scope":"HOST-VERSION","reason":"目标宿主版本不满足本包声明的 peer 语义门（未伪造宿主结论）"}')
  } else if (targetSlotMap === undefined || targetConfigForms === undefined) {
    console.log('HUMAN  {"scope":"HOST-CONTRACT","reason":"目标宿主缺少正式插件管理 SlotMap 或 ConfigForms 类型定义"}')
  } else {
    const slotText = targetSlotMap.value
    const configFormText = targetConfigForms.value
    check('F04 HOST 实际 SlotMap 提供 keyed plugins.bundle.config 与 list plugins.detail.section', slotHasKind(slotText, 'plugins.bundle.config', 'keyed') && slotHasKind(slotText, 'plugins.detail.section', 'list'))
    check('F04 HOST 实际 ConfigForms 提供 get 与 whileServed', configFormText.includes('get<T>(entryId: string)') && configFormText.includes('whileServed(namespaces: readonly string[]'))
  }
}

const gateWords = { routeDirect: '甲', routePlan: '乙', routeDisagree: '丙', approvalApprove: '丁', approvalReplan: '戊', purposeRefine: '己', purposeRedo: '庚' }
const initial = { anchoredBootstrap: true, creativeMode: false, webFetch: false, toolPresentationMode: 'native', runcodeCatchGate: false, crossProviderPlannerModel: false, plannerModel: 'stable-model', plannerPromptSuffix: 'suffix', exploreBudget: 19, otherAgentModel: '', gateWords }
function makeEditor(config = initial, documentPath = '', options = {}) {
  const row = { entry: { options: { id: 'dsh-extra-plan-settings', name: 'dsh-extra-plan/settings', config: structuredClone(config) }, fiber: {} }, inherited: {}, override: {} }
  const state = { rows: [row], edits: [] }
  const persistDocument = documentPath !== '' && existsSync(documentPath)
  if (persistDocument) writeFileSync(documentPath, JSON.stringify([{ id: row.entry.options.id, name: row.entry.options.name, config: row.entry.options.config }]), 'utf8')
  return {
    state,
    documentPath,
    profileContext: options.profileContext,
    dshHomePath: options.dshHomePath,
    configuration: () => state.rows,
    edit: async (entry, change) => {
      const current = state.rows.find((item) => item.entry === entry)
      if (current === undefined) throw new Error('entry disappeared')
      const next = change(structuredClone(current.entry.options.config), current.inherited)
      current.entry.options.config = next
      if (persistDocument) writeFileSync(documentPath, JSON.stringify([{ id: entry.options.id, name: entry.options.name, config: next }]), 'utf8')
      state.edits.push({ id: entry.options.id, next: structuredClone(next) })
    },
  }
}
function requestRaw(port, method, route, raw) {
  return new Promise((resolve, reject) => {
    const payload = raw === undefined ? '' : raw
    const headers = { accept: 'application/json', 'content-type': 'application/json', 'content-length': Buffer.byteLength(payload) }
    const req = httpRequest({ hostname: '127.0.0.1', port, path: route, method, headers }, (res) => {
      const chunks = []
      res.setEncoding('utf8')
      res.on('data', (chunk) => chunks.push(chunk))
      res.on('end', () => { let body = null; try { body = JSON.parse(chunks.join('')) } catch {} resolve({ status: res.statusCode, body }) })
    })
    req.on('error', reject)
    req.write(payload)
    req.end()
  })
}
function requestJson(port, method, route, value) { return requestRaw(port, method, route, JSON.stringify(value)) }
async function requestApiJson(port, method, route, value, trace) {
  const response = await requestJson(port, method, route, value)
  if (Array.isArray(trace) && response.body?.profileSync?.pending === false) trace.push('api-profile-sync-terminal')
  return response
}
function deferred() {
  let resolve
  const promise = new Promise((done) => { resolve = done })
  return { promise, resolve }
}
async function flush(times = 5) {
  for (let i = 0; i < times; i += 1) {
    await Promise.resolve()
    await new Promise((resolve) => setImmediate(resolve))
  }
}
async function waitForTerminal(port) {
  let last
  for (let i = 0; i < 40; i += 1) {
    last = await requestJson(port, 'GET', '/api/dsh-extra-plan-settings/pro-config', {})
    if (last.body === null || last.body.profileSync === undefined || last.body.profileSync.pending !== true) return last
    await flush(2)
  }
  return last
}
function fullSnapshotShapeOk(snapshot) {
  return snapshot !== null && typeof snapshot === 'object' && snapshot.values !== undefined && snapshot.gateWords !== undefined &&
    JSON.stringify(Object.keys(snapshot.values).sort()) === JSON.stringify([...keys].sort()) &&
    JSON.stringify(Object.keys(snapshot.gateWords).sort()) === JSON.stringify(GATE_WORD_FIELDS.map((item) => item.field).sort())
}
async function waitForFullSnapshotTerminal(port, fixture, snapshot) {
  const expected = { ...snapshot.values, gateWords: snapshot.gateWords }
  let last
  for (let index = 0; index < 60; index += 1) {
    last = await requestJson(port, 'GET', '/api/dsh-extra-plan-settings/pro-config', {})
    try {
      const webConfig = syncConfigOf(readFileSync(fixture.webPatch, 'utf8'))
      const qqConfig = syncConfigOf(readFileSync(fixture.qqPatch, 'utf8'))
      if (last.body?.profileSync?.status === 'synced' && last.body.profileSync.pending === false &&
        isDeepStrictEqual(last.body.values, snapshot.values) && isDeepStrictEqual(webConfig, expected) && isDeepStrictEqual(qqConfig, expected)) return last
    } catch {}
    await flush(2)
  }
  return last
}
async function waitForAdapterRegister(counts, expected = 1) {
  for (let i = 0; i < 40; i += 1) {
    if (counts.register >= expected) return
    await flush(2)
  }
}
async function waitForTrace(trace, event) {
  for (let i = 0; i < 40; i += 1) {
    if (trace.includes(event)) return
    await flush(2)
  }
}
async function start(editor, options = {}) {
  const routes = []
  const policies = []
  const lifecycle = { cleanup: undefined, update: undefined }
  const trace = Array.isArray(options.trace) ? options.trace : []
  const getCalls = []
  const injectRequests = []
  const mode = options.hostProxyMode || 'normal-injection'
  const matrixStats = options.matrixStats
  const proxy = {
    outerDirectError: undefined,
    getCalls,
    injectRequests,
    getResult: undefined,
    childServiceIdentity: 'missing',
  }
  const childForInjection = () => {
    const childTarget = {
      ...(mode === 'child-missing-configEditor' ? {} : { configEditor: editor }),
      on: (event, callback) => {
        if (event !== 'internal/update') return undefined
        lifecycle.update = callback
        trace.push('child-on-internal/update')
        return () => { lifecycle.update = undefined; trace.push('child-cleanup') }
      },
      plugin: async (...args) => {
        if (matrixStats !== undefined) matrixStats.register += 1
        trace.push('adapter-start')
        try {
          const fiber = typeof options.plugin === 'function' ? await options.plugin(...args) : { dispose: async () => {} }
          trace.push('adapter-resolved')
          return {
            dispose: async () => {
              if (matrixStats !== undefined) matrixStats.dispose += 1
              if (fiber !== undefined && typeof fiber.dispose === 'function') await fiber.dispose()
            },
          }
        } catch (error) {
          trace.push(options.adapterFailureEvent || 'adapter-rejected')
          throw error
        }
      },
      effect: (fn) => { lifecycle.cleanup = fn(); return lifecycle.cleanup },
    }
    if (mode !== 'child-missing-configEditor') proxy.childServiceIdentity = childTarget.configEditor === editor ? 'same-editor' : 'missing'
    if (mode !== 'child-missing-configEditor') return childTarget
    return new Proxy(childTarget, {
      get(target, property, receiver) {
        if (property === 'configEditor') {
          trace.push('child-configEditor-missing')
          throw new Error('cannot get property "configEditor" without inject')
        }
        return Reflect.get(target, property, receiver)
      },
    })
  }
  const documentPath = editor !== undefined && typeof editor.documentPath === 'string' ? editor.documentPath : ''
  const profileContext = options.profileContext !== undefined
    ? options.profileContext
    : editor !== undefined && editor !== null ? editor.profileContext : undefined
  const explicitHome = options.dshHomePath !== undefined
    ? options.dshHomePath
    : editor !== undefined && editor !== null ? editor.dshHomePath : undefined
  const targetCtx = {
    fiber: { uid: 'settings-test' },
    get: (name) => {
      if (name === 'configEditor') {
        getCalls.push({ name, result: editor === undefined ? 'undefined' : 'editor' })
        trace.push('ctx.get:configEditor')
        proxy.getResult = editor === undefined ? 'undefined' : 'editor'
        return editor
      }
      if (name === 'profileContext') return profileContext
      if (name === 'dshHomePath') {
        if (typeof explicitHome === 'function') return explicitHome
        if (typeof explicitHome === 'string') return () => explicitHome
        return undefined
      }
      getCalls.push({ name, result: 'undefined' })
      return undefined
    },
    inject(deps, callback) {
      const name = deps[0]
      const request = { deps: [...deps], outcome: 'requested' }
      injectRequests.push(request)
      trace.push('inject:' + name)
      if (name === 'loader') { request.outcome = 'callback'; callback({ get: () => undefined, loader: { builtins: {} }, effect: (fn) => fn() }); return }
      if (name === 'settings') { request.outcome = 'callback'; callback({ settings: { configure: (policy, owner) => { policies.push({ policy, owner }); return () => {} } }, effect: (fn) => fn() }); return }
      if (name === 'webServer') { request.outcome = 'callback'; callback({ webServer: { register: (definition) => { routes.push(definition); return () => {} } }, effect: (fn) => fn() }); return }
      if (name === 'configEditor') {
        if (options.mount !== true) { request.outcome = 'not-mounted'; return }
        if (mode === 'inject-throws') {
          request.outcome = 'error=inject-error'
          trace.push('inject-error')
          throw new Error('inject-error')
        }
        if (mode === 'get-only/no-op-inject') {
          request.outcome = 'no-op-inject'
          trace.push('mount=NOT-RUN')
          return
        }
        const child = childForInjection()
        request.outcome = mode === 'child-missing-configEditor' ? 'callback-child-missing' : 'callback'
        trace.push('inject-callback')
        callback(child)
        return
      }
      throw new Error('unexpected inject ' + deps.join(','))
    },
  }
  proxy.readViaGet = () => targetCtx.get('configEditor')
  const ctx = new Proxy(targetCtx, {
    get(target, property, receiver) {
      if (property === 'configEditor') {
        const error = new Error('cannot get property "configEditor" without inject')
        proxy.outerDirectError = error.message
        trace.push('outer-configEditor-error')
        throw error
      }
      return Reflect.get(target, property, receiver)
    },
  })
  try { void ctx.configEditor } catch {}
  const settingsModule = await import('../../plugins/dsh-extra-plan/lib/settings.js')
  let applyError
  try {
    settingsModule.apply(ctx)
  } catch (error) {
    applyError = error
    if (options.allowApplyError !== true) throw error
  }
  proxy.applyError = applyError === undefined ? undefined : String(applyError && applyError.message || applyError)
  if (applyError !== undefined) return { lifecycle, proxy, applyError }
  const route = routes.find((item) => item.path === '/api/dsh-extra-plan-settings')
  check('V03 apply 注册单一路由与 auto:false policy', route !== undefined && policies.length === 1 && policies[0].policy.auto === false)
  const server = createServer((req, res) => Promise.resolve(route.handler(req, res)).catch((error) => { if (!res.headersSent) { res.writeHead(500, { 'content-type': 'application/json' }); res.end(JSON.stringify({ error: String(error) })) } }))
  const port = await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', () => resolve(server.address().port)) })
  return { server, port, lifecycle, proxy }
}

const TEST_ENV_KEYS = Object.freeze(['DSH_HOME', 'DSH_PROFILE', 'USERPROFILE', 'HOME'])
function captureEnvironment() {
  return Object.fromEntries(TEST_ENV_KEYS.map((key) => [key, process.env[key]]))
}
function restoreEnvironment(snapshot) {
  for (const key of TEST_ENV_KEYS) {
    if (snapshot[key] === undefined) delete process.env[key]
    else process.env[key] = snapshot[key]
  }
}
function makeWRoot(label) { return makeFixtureDir({ label }).root }

async function withEnvironment(changes, action) {
  const previous = captureEnvironment()
  try {
    for (const key of TEST_ENV_KEYS) {
      if (!Object.prototype.hasOwnProperty.call(changes, key)) continue
      if (changes[key] === undefined) delete process.env[key]
      else process.env[key] = changes[key]
    }
    return await action()
  } finally {
    restoreEnvironment(previous)
  }
}
const testEnvironment = originalTestEnvironment
const initialAuthorityFixture = makeSyncFixture()
const editor = makeEditor(initial, initialAuthorityFixture.webPatch, { profileContext: initialAuthorityFixture.webProfileContext })
const run = await start(editor)
try {
  const before = await requestJson(run.port, 'GET', '/api/dsh-extra-plan-settings/pro-config', {})
  check('V03 GET 读取统一行两项宿主值', before.status === 200 && before.body.values.webFetch === false && before.body.values.toolPresentationMode === 'native' && before.body.fields.length === 2)
  check('PROFILE_SYNC_INITIAL_PENDING_TRUE', before.status === 200 && before.body.profileSync.status === 'pending' && before.body.profileSync.pending === true)
  const put = await requestJson(run.port, 'PUT', '/api/dsh-extra-plan-settings/pro-config', { webFetch: true, toolPresentationMode: 'ptc' })



  const rowConfig = editor.state.rows[0].entry.options.config
  const localReadback = syncConfigOf(readFileSync(initialAuthorityFixture.webPatch, 'utf8'))
  const expectedLocalConfig = { ...initial, webFetch: true, toolPresentationMode: 'ptc' }
  const localReadbackOk = isDeepStrictEqual(localReadback, expectedLocalConfig)
   const matchingGet = await requestJson(run.port, 'GET', '/api/dsh-extra-plan-settings/pro-config?saveRunId=' + encodeURIComponent(put.body.profileSync.saveRunId), {})
   const mismatchGet = await requestJson(run.port, 'GET', '/api/dsh-extra-plan-settings/pro-config?saveRunId=missing-run-id', {})
   const cacheGet = await requestJson(run.port, 'GET', '/api/dsh-extra-plan-settings/pro-config', {})
   const terminal = put.body.profileSync
   const profile = terminal?.profiles?.[0]
   const associationOk = put.status === 200 && terminal?.profileKind === 'web' && terminal?.profileIdentityState === 'valid' && terminal?.request?.saveRunId === terminal?.saveRunId && terminal.request.syncRevision === terminal.syncRevision && terminal.request.snapshotHash === terminal.snapshotHash && terminal.terminalMatch === true && matchingGet.status === 200 && matchingGet.body.profileSync.terminalMatch === true && mismatchGet.status === 409 && mismatchGet.body.profileSync.terminalMatch === false && mismatchGet.body.profileSync.status !== 'synced' && mismatchGet.body.profileSync.source === 'last-terminal-cache' && cacheGet.body.profileSync.cache === true && cacheGet.body.profileSync.terminalMatch === false && cacheGet.body.profileSync.source === 'last-terminal-cache'
   const patchMetadataOk = typeof terminal.snapshotHash === 'string' && terminal.webAfter?.patchBytes > 0 && typeof terminal.webAfter.patchMtimeMs === 'number' && typeof terminal.webAfter.patchSha256 === 'string' && terminal.webAfter.managedSnapshotHash === terminal.snapshotHash && profile?.patchBytes > 0 && typeof profile.patchMtimeMs === 'number' && typeof profile.patchSha256 === 'string' && profile.managedSnapshotHash === terminal.snapshotHash && typeof profile.backupPath === 'string' && typeof profile.backupSha256 === 'string' && profile.before?.patchSha256 !== undefined && profile.after?.patchSha256 === profile.patchSha256
   if (associationOk) console.log('SAVE_RUN_ID_TERMINAL_HASH_MATCH_OK')
   if (patchMetadataOk) console.log('PATCH_MTIME_MANAGED_HASH_COMPARE_OK')
   check('V03 合法 PUT 仅 edit 唯一全局行并保留另八项与 gateWords（终态关联）', put.status === 200 && put.body.profileSync.status === 'synced' && put.body.profileSync.terminalMatch === true && put.body.overall === 'synced' && put.body.web.applied === true && put.body.projection.owner === 'dsh-extra-plan-settings' && editor.state.edits.length === 1 && editor.state.edits[0].id === 'dsh-extra-plan-settings' && rowConfig.webFetch === true && rowConfig.toolPresentationMode === 'ptc' && rowConfig.plannerModel === initial.plannerModel && rowConfig.exploreBudget === initial.exploreBudget && JSON.stringify(rowConfig.gateWords) === JSON.stringify(gateWords) && localReadbackOk)
  const noOp = await requestJson(run.port, 'PUT', '/api/dsh-extra-plan-settings/pro-config', { webFetch: true, toolPresentationMode: 'ptc' })
   check('V03 本地Web patch真实保存并读回完整十键/gateWords', localReadbackOk)
  check('V03 同值 PUT 深等 no-op 零新增 edit且产生新关联终态', noOp.status === 200 && noOp.body.profileSync.status === 'synced' && noOp.body.profileSync.terminalMatch === true && noOp.body.projection.applied === true && editor.state.edits.length === 1 && noOp.body.profileSync.saveRunId !== put.body.profileSync.saveRunId && noOp.body.profileSync.webAfter?.managedSnapshotHash === noOp.body.profileSync.snapshotHash)
  const invalidCases = [
    ['empty', {}], ['null', null], ['array', []], ['primitive', 'raw'], ['unknown', { notAField: 'x' }],
    ['bad-type', { webFetch: 1 }], ['mixed', { webFetch: false, unknown: true }],
  ]
  for (const [label, value] of invalidCases) {
    const bad = await requestJson(run.port, 'PUT', '/api/dsh-extra-plan-settings/pro-config', value)
    check('V03 PUT ' + label + ' 先拒绝且零新增 edit', bad.status === 400 && editor.state.edits.length === 1)
  }
  const invalidJson = await requestRaw(run.port, 'PUT', '/api/dsh-extra-plan-settings/pro-config', '{"webFetch":')
  check('V03 PUT 非法 JSON 返回 400 且零 edit', invalidJson.status === 400 && editor.state.edits.length === 1)
  const sameServerEmpty = await requestJson(run.port, 'PUT', '/api/dsh-extra-plan-settings/pro-config', {})
  check('V03 成功后同一 server 收到空对象仍拒绝，不是成功 no-op', sameServerEmpty.status === 400 && editor.state.edits.length === 1)
} finally { await new Promise((resolve) => run.server.close(resolve)); rmSync(initialAuthorityFixture.root, { recursive: true, force: true }) }

function makeSyncFixture() {
  const fixture = makeFixtureDir({ label: 'settings-sync' })
  const root = fixture.root
  const webDir = join(root, 'profiles', 'web')
  const profileDir = join(root, 'profiles', 'qqbot-sync')
  mkdirSync(webDir, { recursive: true })
  mkdirSync(join(profileDir, 'node_modules', 'dsh-extra-plan-qqbot'), { recursive: true })
  writeFileSync(join(profileDir, 'package.json'), JSON.stringify({ name: 'qqbot-sync-profile', dsh: { profile: { bundles: ['@tencent-connect/dsh-qqbot'] } } }), 'utf8')
  const webPatch = join(webDir, 'cordis.patch.yml')
  const qqPatch = join(profileDir, 'cordis.patch.yml')
  writeFileSync(webPatch, '# web fixture\n- id: web-fixture\n  name: web\n', 'utf8')
  writeFileSync(qqPatch, '# keep this row\n- id: user-custom\n  name: custom\n  config:\n    marker: !!js "globalThis.__syncFixture = true"\n', 'utf8')
  const webProfileContext = { home: root, dir: webDir, patchPath: webPatch, name: 'web', startedBundles: [] }
  const qqProfileContext = { home: root, dir: profileDir, patchPath: qqPatch, name: 'qqbot', startedBundles: ['@tencent-connect/dsh-qqbot'] }
  if (INSTALL_ANCHOR !== undefined) {
    webProfileContext.installAnchor = INSTALL_ANCHOR
    qqProfileContext.installAnchor = INSTALL_ANCHOR
  }
  return {
    root,
    home: root,
    dir: webDir,
    patchPath: webPatch,
    name: 'web',
    startedBundles: [],
    webDir,
    webPatch,
    profileDir,
    qqPatch,
    fixture,
    webProfileContext,
    qqProfileContext,
    profileContext: webProfileContext,
    pathContext: createPathContext({ hostDataRoot: root }),
  }
}
const FS_PROBE_METHODS = Object.freeze(['accessSync', 'statSync', 'readdirSync', 'readFileSync', 'existsSync', 'openSync', 'writeFileSync', 'copyFileSync', 'renameSync', 'unlinkSync'])
function createFsAccessProbe(entries) {
  const roots = entries.map(({ name, root }) => ({ name, root: resolve(root) }))
  const counts = Object.fromEntries(roots.map(({ name }) => [name, 0]))
  const originals = new Map()
  let installed = false
  const pathValue = (value) => typeof value === 'string' ? value : undefined
  const record = (value) => {
    const valuePath = pathValue(value)
    if (valuePath === undefined) return
    const normalized = resolve(valuePath)
    for (const entry of roots) {
      if (normalized === entry.root || normalized.startsWith(entry.root + '\\')) counts[entry.name] += 1
    }
  }
  const restore = () => {
    if (!installed) return
    for (const [name, original] of originals) fs[name] = original
    syncBuiltinESMExports()
    installed = false
  }
  const install = () => {
    if (installed) throw new Error('fs probe already installed')
    originals.clear()
    try {
      for (const name of FS_PROBE_METHODS) {
        const original = fs[name]
        originals.set(name, original)
        const pathIndexes = name === 'copyFileSync' || name === 'renameSync' ? [0, 1] : [0]
        fs[name] = (...args) => {
          for (const index of pathIndexes) record(args[index])
          return original(...args)
        }
      }
      syncBuiltinESMExports()
      installed = true
    } catch (error) {
      for (const [name, original] of originals) fs[name] = original
      syncBuiltinESMExports()
      throw error
    }
  }
  return { install, restore, count: (name) => counts[name] || 0 }
}
async function withFsAccessProbe(probe, action) {
  let installed = false
  try {
    probe.install()
    installed = true
    return await action()
  } finally {
    if (installed) probe.restore()
  }
}
function addAnchoredProfile(root, name, patchText) {
  const dir = join(root, 'profiles', name)
  mkdirSync(join(dir, 'node_modules', 'dsh-extra-plan-qqbot'), { recursive: true })
  writeFileSync(join(dir, 'package.json'), JSON.stringify({ name: name + '-profile', dsh: { profile: { bundles: ['@tencent-connect/dsh-qqbot'] } } }), 'utf8')
  const patch = join(dir, 'cordis.patch.yml')
  if (patchText !== undefined) writeFileSync(patch, patchText, 'utf8')
  return { dir, patch }
}
function patchBackupCount(profileDir) {
  try { return readdirSync(profileDir).filter((name) => name.startsWith('cordis.patch.yml.bak-dsh-extra-plan-settings-')).length } catch { return 0 }
}
function syncConfigOf(text) {
  const parsed = parsePresetYaml(text)
  const row = Array.isArray(parsed) ? parsed.find((item) => item && typeof item === 'object' && (item.id === 'dsh-extra-plan-settings' || item.override?.id === 'dsh-extra-plan-settings')) : undefined
  return row?.override?.config || row?.config
}
function apiTerminalBodyOk(response) {
  return response !== null && response !== undefined && response.status >= 200 && response.status < 300 && response.body !== null &&
    response.body.web?.applied === true && response.body.projection?.applied === true && response.body.overall === 'synced' &&
    response.body.profileSync?.status === 'synced' && response.body.profileSync?.pending === false
}
function apiPatchDetails(fixture, snapshot) {
  const expected = { ...snapshot.values, gateWords: snapshot.gateWords }
  try {
    const webConfig = syncConfigOf(readFileSync(fixture.webPatch, 'utf8'))
    const qqConfig = syncConfigOf(readFileSync(fixture.qqPatch, 'utf8'))
    return { expected, webConfig, qqConfig, webMatch: isDeepStrictEqual(webConfig, expected), qqMatch: isDeepStrictEqual(qqConfig, expected) }
  } catch (error) { return { expected, error: String(error) } }
}
function apiPatchOk(fixture, snapshot) {
  const details = apiPatchDetails(fixture, snapshot)
  return details.webMatch === true && details.qqMatch === true
}
function apiSnapshotBodyOk(response, snapshot) {
  return response?.body?.values !== undefined && isDeepStrictEqual(response.body.values, snapshot.values)
}
const syncValues = { anchoredBootstrap: false, creativeMode: true, webFetch: true, toolPresentationMode: 'ptc', runcodeCatchGate: true, crossProviderPlannerModel: true, plannerModel: 'planner-sync-test', plannerPromptSuffix: 'sync-suffix-test', exploreBudget: 37, otherAgentModel: 'other-sync-test' }
const syncGateWords = { routeDirect: '甲', routePlan: '乙', routeDisagree: '丙', approvalApprove: '丁', approvalReplan: '戊', purposeRefine: '己', purposeRedo: '庚' }
const syncSnapshot = { values: syncValues, gateWords: syncGateWords }

// G5 任务11：直接调用QQBot同步修复模块，覆盖新行、既有id-only、冲突零写和fatal汇总。
const qbotConfigValues = { ...syncValues, gateWords: syncGateWords }
function qbotSettingsRow(values, options = {}) {
  const eol = options.eol === undefined ? '\n' : options.eol
  const lines = [options.override === true ? '- override:' : '- id: dsh-extra-plan-settings']
  if (options.override === true) lines.push('    id: dsh-extra-plan-settings')
  if (options.name !== undefined) lines.push((options.override === true ? '    ' : '  ') + 'name: ' + options.name)
  if (options.metadata === true) lines.push((options.override === true ? '    ' : '  ') + 'metadata: keep')
  lines.push((options.override === true ? '    ' : '  ') + 'config:')
  const indent = options.override === true ? '      ' : '    '
  if (options.extra === true) lines.push(indent + 'customKey: !!js "globalThis.__g5Unknown = true"')
  for (const key of keys) lines.push(indent + key + ': ' + JSON.stringify(values[key]))
  lines.push(indent + 'gateWords:')
  for (const item of GATE_WORD_FIELDS) lines.push(indent + '  ' + item.field + ': ' + JSON.stringify(values.gateWords[item.field]))
  return lines.join(eol)
}
function qbotManagedCaptured(text) {
  const captured = presetSettings.captureRowSettings(text, SETTING_DEFINITIONS)
  return { captured, ok: SETTING_DEFINITIONS.every((definition) => captured.states[definition.key] === 'captured') }
}
const qbotEmptyPlan = planQqbotSettingsPatch('[]', syncSnapshot)
const qbotEmptyCaptured = qbotManagedCaptured(qbotEmptyPlan.text || '')
check('G5 QQBot空patch新增规范name与完整10+7快照', qbotEmptyPlan.status === 'planned' && qbotEmptyPlan.text.includes('name: dsh-extra-plan/settings') && qbotEmptyCaptured.ok && qbotEmptyCaptured.captured.values.plannerModel === syncValues.plannerModel)
const qbotDirectIdOnly = '# outside comment\r\n' + qbotSettingsRow(qbotConfigValues, { metadata: true, extra: true, eol: '\r\n' }) + '\r\n# trailing comment'
const qbotDirectPlan = planQqbotSettingsPatch(qbotDirectIdOnly, syncSnapshot)
const qbotDirectAgain = qbotDirectPlan.text === undefined ? null : planQqbotSettingsPatch(qbotDirectPlan.text, syncSnapshot)
check('G5 既有同值id-only补name并保留未知字段/CRLF', qbotDirectPlan.status === 'planned' && qbotDirectPlan.text.includes('name: dsh-extra-plan/settings') && qbotDirectPlan.text.includes('customKey: !!js "globalThis.__g5Unknown = true"') && qbotDirectPlan.text.includes('\r\n') && !qbotDirectPlan.text.replace(/\r\n/g, '').includes('\n'))
check('G5 QQBot补名后二次保存幂等', qbotDirectAgain?.status === 'idempotent')
const qbotWrongNameText = qbotSettingsRow(qbotConfigValues, { name: 'wrong/name' })
const qbotDuplicateNameText = '- id: dsh-extra-plan-settings\n  name: wrong/name\n  name: another/name\n  config:\n    plannerModel: ' + JSON.stringify(syncValues.plannerModel) + '\n'
const qbotWrongNamePlan = planQqbotSettingsPatch(qbotWrongNameText, syncSnapshot)
const qbotDuplicateNamePlan = planQqbotSettingsPatch(qbotDuplicateNameText, syncSnapshot)
check('G5 非空错名计划conflict且零文本', qbotWrongNamePlan.status === 'conflict' && qbotWrongNamePlan.text === undefined)
check('G5 重名计划conflict且零文本', qbotDuplicateNamePlan.status === 'conflict' && qbotDuplicateNamePlan.text === undefined)
const foreignDuplicateInputs = [
  '- override:\n    id: unrelated\n    name: x\n    name: y\n',
  '- id: unrelated\n  config:\n    id: dsh-extra-plan-settings\n    name: x\n    name: y\n',
]
for (const [index, text] of foreignDuplicateInputs.entries()) {
  const result = planQqbotSettingsPatch(text, syncSnapshot)
  check('G5 非目标重名保留原始YAML错误 ' + index, result.status === 'invalid' && result.reason.startsWith('invalid-yaml:') && result.text === undefined)
}
const qbotNoWriteRoot = makeWRoot('settings-qqbot-negative')
try {
  for (const [label, text, expectedReason] of [['wrong-name', qbotWrongNameText, 'settings-row-name-conflict'], ['duplicate-name', qbotDuplicateNameText, 'duplicate-name']]) {
    const dir = join(qbotNoWriteRoot, label)
    mkdirSync(dir, { recursive: true })
    const patch = join(dir, 'cordis.patch.yml')
    writeFileSync(patch, text, 'utf8')
    const before = readFileSync(patch)
    const result = writeQqbotSettingsPatch(dir, syncSnapshot, { pathContext: createPathContext({ hostDataRoot: qbotNoWriteRoot }) })
    const after = readFileSync(patch)
    const aux = readdirSync(dir).filter((name) => name.includes('.bak-dsh-extra-plan-settings-') || name.includes('.tmp-dsh-extra-plan-settings-'))
    check('G5 ' + label + '实际零写零备份', result.status === 'failed' && result.reason === expectedReason && before.equals(after) && aux.length === 0)
  }
  const overridePlan = planQqbotSettingsPatch(qbotSettingsRow(qbotConfigValues, { override: true }), syncSnapshot)
  check('G5 旧override兼容holder补规范name', overridePlan.status === 'planned' && overridePlan.text.includes('    name: dsh-extra-plan/settings'))
} finally {
  rmSync(qbotNoWriteRoot, { recursive: true, force: true })
}
const fatalRoot = makeWRoot('settings-fatal')
try {
  addAnchoredProfile(fatalRoot, 'fatal-profile', qbotSettingsRow(qbotConfigValues))
  const fatalWebDir = join(fatalRoot, 'profiles', 'web')
  const fatalWebPatch = join(fatalWebDir, 'cordis.patch.yml')
  mkdirSync(fatalWebDir, { recursive: true })
  writeFileSync(fatalWebPatch, qbotSettingsRow(qbotConfigValues), 'utf8')
  const fatalWebProfileContext = { home: fatalRoot, dir: fatalWebDir, patchPath: fatalWebPatch, name: 'web', startedBundles: [] }
  const fatalFs = { ...fs, copyFileSync() { throw new Error('restore-fault') } }
  const fatalSync = createQqbotSettingsSynchronizer({ fs: fatalFs, hooks: { beforeFinalVerify() { throw new Error('final-fault') } } })
  const fatalResult = await fatalSync.enqueue({ documentPath: fatalWebPatch, pathContext: createPathContext({ hostDataRoot: fatalRoot }), profileFacts: fatalWebProfileContext, env: {}, snapshot: syncSnapshot })
  const fatalProfile = fatalResult.profiles?.[0]
  check('G5 profile汇总保留profile名称与fatal状态', fatalResult.status === 'failed' && fatalProfile?.profile === 'fatal-profile' && fatalProfile?.status === 'fatal' && fatalProfile?.reason === 'final-fault')
} finally {
  rmSync(fatalRoot, { recursive: true, force: true })
}

const identityFixture = makeSyncFixture()
try {
  const qqBefore = readFileSync(identityFixture.qqPatch)
  const qqSynchronizer = createQqbotSettingsSynchronizer()
  const qqNotApplicable = await qqSynchronizer.enqueue({
    documentPath: identityFixture.qqPatch,
    pathContext: identityFixture.pathContext,
    profileFacts: identityFixture.qqProfileContext,
    env: {},
    snapshot: syncSnapshot,
    saveRunId: 'qq-not-applicable',
    syncRevision: 1,
    snapshotHash: stableSnapshotHash(syncSnapshot),
    trigger: 'api-put',
    associated: false,
  })
  check('SYNC Web/QQ身份事实显式可观测且QQ profile not-applicable零写', identityFixture.webProfileContext.name === 'web' && identityFixture.webProfileContext.startedBundles.length === 0 && qqNotApplicable.status === 'not-applicable' && qqNotApplicable.profileKind === 'qqbot' && qqNotApplicable.profileIdentityState === 'valid' && qqNotApplicable.reason === 'qqbot-profile-not-applicable' && readFileSync(identityFixture.qqPatch).equals(qqBefore))
} finally {
  rmSync(identityFixture.root, { recursive: true, force: true })
}

function migrationRow(name, config) {
  const lines = ['- id: dsh-extra-plan-settings', '  name: ' + JSON.stringify(name), '  config:']
  for (const key of keys) if (key !== 'gateWords') lines.push('    ' + key + ': ' + JSON.stringify(config[key]))
  lines.push('    gateWords:')
  for (const item of GATE_WORD_FIELDS) lines.push('      ' + item.field + ': ' + JSON.stringify(config.gateWords[item.field]))
  return lines.join('\n')
}

const duplicateFixture = makeSyncFixture()
const duplicateEditor = makeEditor({ ...syncValues, gateWords: syncGateWords, creativeMode: false }, duplicateFixture.webPatch, { profileContext: duplicateFixture.webProfileContext })
const duplicateBefore = readFileSync(duplicateFixture.qqPatch)
const duplicateRaw = [
  '# migration comment',
  migrationRow('@local/dsh-extra-plan/settings', { ...syncValues, gateWords: syncGateWords, creativeMode: true }),
  '# keep between duplicate rows',
  migrationRow('dsh-extra-plan/settings', { ...syncValues, gateWords: syncGateWords, creativeMode: false }),
  '- id: user-row',
  '  name: user',
  '  config:',
  '    marker: !!js \"globalThis.__migrationUser = true\"'
].join('\n') + '\n'
writeFileSync(duplicateFixture.webPatch, duplicateRaw, 'utf8')
const duplicateRun = await start(duplicateEditor)
try {
  const duplicateGet = await requestJson(duplicateRun.port, 'GET', '/api/dsh-extra-plan-settings/pro-config', {})
  const duplicatePut = await requestJson(duplicateRun.port, 'PUT', '/api/dsh-extra-plan-settings/pro-config', { creativeMode: true })
  const duplicateProfile = duplicatePut.body?.profileSync
  const conflictOk = duplicateGet.status === 409 && duplicatePut.status === 409 && duplicateGet.body?.settingsRow?.rawCount === 2 && duplicateGet.body?.settingsRow?.effectiveCount === 1 && duplicateGet.body?.settingsRow?.canonicalNameCount === 1 && duplicateGet.body?.settingsRow?.status === 'conflict' && duplicatePut.body?.projection?.applied === false && duplicateProfile?.status === 'conflict' && duplicateEditor.state.edits.length === 0 && readFileSync(duplicateFixture.qqPatch).equals(duplicateBefore) && patchBackupCount(duplicateFixture.profileDir) === 0
  if (conflictOk) console.log('SETTINGS_ROW_UNIQUE_OR_CONFLICT_EXPLICIT_OK')

  check('重复 settings 行 GET/PUT 显式 conflict 且零 edit/enqueue/QQBot 写', conflictOk)
  const migrationEffective = duplicateEditor.state.rows[0]
  const migration = planCanonicalSettingsMigration(duplicateRaw, migrationEffective)
  let migrationAfterRows = []
  try {
    const parsedAfter = parsePresetYaml(migration.afterText)
    migrationAfterRows = Array.isArray(parsedAfter) ? parsedAfter.filter((row) => row && typeof row === 'object' && row.id === 'dsh-extra-plan-settings') : []
  } catch {}
  const migrationConfig = migrationAfterRows[0]?.config
  const migrationSnapshot = migrationConfig === undefined ? undefined : { values: Object.fromEntries(keys.map((key) => [key, migrationConfig[key]])), gateWords: migrationConfig.gateWords }
  const migrationOk = (migration.status === 'planned' || migration.status === 'idempotent') && migration.rawRowCount === 2 && migration.afterRawCount === 1 && migration.afterCanonicalNameCount === 1 && migration.removedRows === 1 && migration.beforeBytes === migration.rollbackBytes && migration.beforeSha256 === migration.rollbackSha256 && migration.beforeText === migration.rollback.text && migration.afterText.includes('# migration comment') && migration.afterText.includes('# keep between duplicate rows') && migration.afterText.includes('globalThis.__migrationUser = true') && migrationAfterRows[0]?.name === 'dsh-extra-plan/settings' && fullSnapshotShapeOk(migrationSnapshot) && migrationSnapshot.values.creativeMode === false
  if (migrationOk) console.log('CANONICAL_MIGRATION_PLANNER_OK')
  check('canonical migration 取 effective canonical 值、删 duplicate、保留无关内容并可 rollback', migrationOk)
} finally { await new Promise((resolve) => duplicateRun.server.close(resolve)); rmSync(duplicateFixture.root, { recursive: true, force: true }) }

const creativeFixture = makeSyncFixture()
const creativeBase = { ...syncValues, gateWords: syncGateWords, creativeMode: false }
const creativeEditor = makeEditor(creativeBase, creativeFixture.webPatch, { profileContext: creativeFixture.webProfileContext })
const creativeRun = await start(creativeEditor)
try {
  const creativePut = await requestJson(creativeRun.port, 'PUT', '/api/dsh-extra-plan-settings/pro-config', { creativeMode: true })
  const creativeExpected = { ...creativeBase, creativeMode: true }
  const creativeWeb = syncConfigOf(readFileSync(creativeFixture.webPatch, 'utf8'))
  const creativeQq = syncConfigOf(readFileSync(creativeFixture.qqPatch, 'utf8'))
  const creativeOk = creativePut.status === 200 && creativePut.body.profileSync?.status === 'synced' && creativePut.body.profileSync.terminalMatch === true && creativePut.body.values.creativeMode === true && isDeepStrictEqual(creativeWeb, creativeExpected) && isDeepStrictEqual(creativeQq, creativeExpected) && creativePut.body.profileSync.webAfter?.managedSnapshotHash === creativePut.body.profileSync.snapshotHash && creativePut.body.profileSync.profiles?.every((item) => item.managedSnapshotHash === creativePut.body.profileSync.snapshotHash)
  if (creativeOk) console.log('CREATIVE_PERSISTED_BEFORE_RESTART_OK')

  check('creativeMode 单字段保存先核对双端 managed hash，运行时重启留 HUMAN', creativeOk)
} finally { await new Promise((resolve) => creativeRun.server.close(resolve)); rmSync(creativeFixture.root, { recursive: true, force: true }) }

const staleFingerprintFixture = makeSyncFixture()
const staleFingerprintEditor = makeEditor({ ...syncValues, gateWords: syncGateWords }, staleFingerprintFixture.webPatch, { profileContext: staleFingerprintFixture.webProfileContext })
const staleFingerprintRun = await start(staleFingerprintEditor)
try {
  const stalePut = await requestJson(staleFingerprintRun.port, 'PUT', '/api/dsh-extra-plan-settings/pro-config', { webFetch: true })
  const staleFresh = await requestJson(staleFingerprintRun.port, 'GET', '/api/dsh-extra-plan-settings/pro-config', {})
  const staleFreshOk = stalePut.status === 200 && stalePut.body.profileSync?.status === 'synced' && staleFresh.status === 200 && staleFresh.body.profileSync?.cache === true && staleFresh.body.profileSync?.source === 'last-terminal-cache' && staleFresh.body.profileSync?.stale === undefined
  if (staleFreshOk) console.log('GET_CACHE_FINGERPRINT_FRESH_OK')
  check('GET 无参缓存指纹一致：保持缓存视图现状且无 stale 键', staleFreshOk)
  const driftedPatchText = [
    '# drifted web patch（仍含合法 settings 行，authority 保持 ok）',
    '- id: dsh-extra-plan-settings',
    '  name: dsh-extra-plan/settings',
    '  config:',
    '    anchoredBootstrap: false',
    '    creativeMode: false',
    '    webFetch: false',
    '    toolPresentationMode: native',
    '    runcodeCatchGate: false',
    '    crossProviderPlannerModel: false',
    '    plannerModel: drifted-value',
    '    plannerPromptSuffix: drifted',
    '    exploreBudget: 3',
    '    otherAgentModel: drifted',
    '    gateWords:',
    ...GATE_WORD_FIELDS.map((item) => '      ' + item.field + ': 漂移词' + item.field),
  ].join('\n') + '\n'
  writeFileSync(staleFingerprintFixture.webPatch, driftedPatchText, 'utf8')
  const staleMarked = await requestJson(staleFingerprintRun.port, 'GET', '/api/dsh-extra-plan-settings/pro-config', {})
  const staleMarkedOk = staleMarked.status === 200 && staleMarked.body.profileSync?.stale === true && staleMarked.body.profileSync?.source === 'stale-terminal-cache'
  if (staleMarkedOk) console.log('GET_CACHE_FINGERPRINT_STALE_MARKED_OK')
  check('GET 无参缓存指纹与磁盘不一致：profileSync.stale===true 且 source=stale-terminal-cache', staleMarkedOk)
} finally { await new Promise((resolve) => staleFingerprintRun.server.close(resolve)); rmSync(staleFingerprintFixture.root, { recursive: true, force: true }) }

const pendingDocumentFixture = makeSyncFixture()
const pendingDocumentEditor = makeEditor({ ...syncValues, gateWords: syncGateWords }, pendingDocumentFixture.webPatch, { profileContext: pendingDocumentFixture.webProfileContext })
const pendingDocumentRun = await start(pendingDocumentEditor)
try {
  const pendingGet = await requestJson(pendingDocumentRun.port, 'GET', '/api/dsh-extra-plan-settings/pro-config', {})
  check('GET 无缓存无指纹（stale 检测异常输入提前返回）：仍 200、无 stale 键且不抛错', pendingGet.status === 200 && pendingGet.body.profileSync?.status === 'pending' && pendingGet.body.profileSync?.stale === undefined)
} finally { await new Promise((resolve) => pendingDocumentRun.server.close(resolve)); rmSync(pendingDocumentFixture.root, { recursive: true, force: true }) }

const externalDriftFixture = makeSyncFixture()
const externalDriftEditor = makeEditor({ ...syncValues, gateWords: syncGateWords }, externalDriftFixture.webPatch, { persistDocument: true, profileContext: externalDriftFixture.webProfileContext })
const externalDriftText = '# external writer value\n- id: external-writer\n  name: external\n  config:\n    marker: !!js \"globalThis.__externalWriter = true\"\n'
const externalDriftSynchronizer = createQqbotSettingsSynchronizer({ hooks: { beforeFinalVerify: ({ patchFile }) => writeFileSync(patchFile, externalDriftText, 'utf8') } })
const externalDriftRun = await externalDriftSynchronizer.enqueue({ documentPath: externalDriftFixture.webPatch, pathContext: externalDriftFixture.pathContext, profileFacts: externalDriftFixture.webProfileContext, env: {}, snapshot: syncSnapshot, saveRunId: 'external-drift-run', syncRevision: 1, snapshotHash: stableSnapshotHash(syncSnapshot), trigger: 'api-put', associated: true })
const externalDriftAfter = readFileSync(externalDriftFixture.qqPatch, 'utf8')
const externalDriftProfile = externalDriftRun.profiles?.find((item) => item.status === 'drift-detected')
const externalDriftSha256 = createHash('sha256').update(externalDriftAfter).digest('hex')
const externalDriftOk = externalDriftRun.status === 'drift-detected' &&
  externalDriftRun.terminalMatch === false &&
  externalDriftRun.failureOrder?.includes('before-final-verify') &&
  externalDriftRun.failureOrder?.includes('external-writer-drift') &&
  externalDriftRun.diagnostics?.some((item) => item.stage === 'before-final-verify' && item.reason === 'external-writer-drift') &&
  externalDriftProfile?.after?.patchSha256 === externalDriftSha256 &&
  externalDriftProfile.after.managedSnapshotHash === null &&
  typeof externalDriftProfile.backupSha256 === 'string' &&
  externalDriftProfile.backupSha256 === externalDriftProfile.after.backupSha256 &&
  externalDriftProfile.before.patchSha256 !== externalDriftProfile.after.patchSha256 &&
  !externalDriftRun.profiles?.some((item) => item.status === 'synced') &&
  externalDriftAfter.includes('external-writer') &&
  !externalDriftAfter.includes('dsh-extra-plan-settings')
if (externalDriftOk) {
  console.log('EXTERNAL_WRITER_DRIFT_BLOCKED_OK')
  output.structured('EXTERNAL_WRITER_DRIFT_EVIDENCE', { status: externalDriftRun.status, terminalMatch: externalDriftRun.terminalMatch, failureOrder: externalDriftRun.failureOrder, diagnostics: externalDriftRun.diagnostics, before: externalDriftProfile.before, after: externalDriftProfile.after, externalContent: externalDriftAfter }, { status: externalDriftRun.status, terminalMatch: externalDriftRun.terminalMatch, failureOrder: externalDriftRun.failureOrder, diagnosticCount: Array.isArray(externalDriftRun.diagnostics) ? externalDriftRun.diagnostics.length : 0, beforeHash: externalDriftProfile.before?.patchSha256, afterHash: externalDriftProfile.after?.patchSha256, externalContentBytes: Buffer.byteLength(String(externalDriftAfter || ''), 'utf8') }, { failure: externalDriftRun.status === 'failed' })
}
check('外部 writer 在 terminal 前漂移不被旧 backup 覆盖且不伪造 synced', externalDriftOk)
rmSync(externalDriftFixture.root, { recursive: true, force: true })

const syncFixtureRoots = []
const previousSyncEnvironment = captureEnvironment()
try {
  const webFixture = makeSyncFixture(); syncFixtureRoots.push(webFixture.root)
  delete process.env.DSH_HOME; delete process.env.DSH_PROFILE
  const webEditor = makeEditor({ ...syncValues, gateWords: syncGateWords, webFetch: false }, webFixture.webPatch, { profileContext: webFixture.webProfileContext })
  const webRun = await start(webEditor)
  try {
    const webPut = await requestJson(webRun.port, 'PUT', '/api/dsh-extra-plan-settings/pro-config', { webFetch: true })
    const qqConfig = syncConfigOf(readFileSync(webFixture.qqPatch, 'utf8'))
    check('SYNC documentPath 首选且无 DSH_HOME 仍双端 synced、完整十项/gateWords 深等', webPut.status >= 200 && webPut.status < 300 && webPut.body.profileSync.status === 'synced' && webPut.body.profileSync.pathSource === 'configEditor.documentPath' && webPut.body.web.applied === true && isDeepStrictEqual(webEditor.state.rows[0].entry.options.config, { ...syncValues, gateWords: syncGateWords }) && isDeepStrictEqual(qqConfig, { ...syncValues, gateWords: syncGateWords }))
    check('SYNC Web documentPath 目标使用 override 且保留目标外 !!js/用户行', readFileSync(webFixture.qqPatch, 'utf8').includes('globalThis.__syncFixture = true') && readFileSync(webFixture.qqPatch, 'utf8').includes('user-custom'))
  } finally { await new Promise((resolve) => webRun.server.close(resolve)) }

  const decoy = makeSyncFixture(); syncFixtureRoots.push(decoy.root)
  const decoyBefore = readFileSync(decoy.qqPatch, 'utf8')
  const decoyBeforeBytes = readFileSync(decoy.qqPatch)
  const decoyBeforeStat = statSync(decoy.qqPatch)
  const decoyBeforeBackups = patchBackupCount(decoy.profileDir)
  const decoyBeforeEntries = readdirSync(decoy.profileDir).sort().join('\n')
  const targetBeforeBackups = patchBackupCount(dirname(webFixture.qqPatch))
  const previousPriorityEnvironment = captureEnvironment()
  try {
  // 目标由fixture记录的显式profileContext提供；decoy仅作为未访问的Other夹具。
  const priorityEditor = makeEditor({ ...syncValues, gateWords: syncGateWords }, webFixture.webPatch, { profileContext: webFixture.webProfileContext })
  const priorityRun = await start(priorityEditor)
  try {
    const priorityProbe = createFsAccessProbe([
      { name: 'targetProfilesRoot', root: join(webFixture.root, 'profiles') },
      { name: 'decoyProfilesRoot', root: join(decoy.root, 'profiles') },
    ])
    const priorityPut = await withFsAccessProbe(priorityProbe, () => requestJson(priorityRun.port, 'PUT', '/api/dsh-extra-plan-settings/pro-config', { toolPresentationMode: 'native' }))
    const decoyAfterBytes = readFileSync(decoy.qqPatch)
    const decoyAfterStat = statSync(decoy.qqPatch)
    const decoyAfterBackups = patchBackupCount(decoy.profileDir)
    const decoyAfterEntries = readdirSync(decoy.profileDir).sort().join('\n')
    check('SYNC 有效 documentPath 真实同级目标访问>0、诱饵profiles根访问=0且仅写目标：target访问=' + priorityProbe.count('targetProfilesRoot') + ' decoyProfiles访问=' + priorityProbe.count('decoyProfilesRoot'), priorityPut.status >= 200 && priorityPut.status < 300 && priorityPut.body.profileSync.pathSource === 'configEditor.documentPath' && priorityProbe.count('targetProfilesRoot') > 0 && priorityProbe.count('decoyProfilesRoot') === 0 && decoyAfterBytes.equals(decoyBeforeBytes) && decoyAfterStat.mtimeMs === decoyBeforeStat.mtimeMs && decoyAfterBackups === decoyBeforeBackups && decoyAfterEntries === decoyBeforeEntries && patchBackupCount(dirname(webFixture.qqPatch)) === targetBeforeBackups + 1)
    check('SYNC 诱饵目标零变化：patch字节/mtimeMs/备份数/目录项均相等', decoyAfterBytes.equals(decoyBeforeBytes) && decoyAfterStat.mtimeMs === decoyBeforeStat.mtimeMs && decoyAfterBackups === decoyBeforeBackups && decoyAfterEntries === decoyBeforeEntries)
  } finally { await new Promise((resolve) => priorityRun.server.close(resolve)) }
  } finally {
    restoreEnvironment(previousPriorityEnvironment)
  }

  const fallback = makeSyncFixture(); syncFixtureRoots.push(fallback.root)
   const fallbackEditor = makeEditor({ ...syncValues, gateWords: syncGateWords, webFetch: false }, fallback.webPatch, { profileContext: fallback.webProfileContext })
  fallbackEditor.syncDocumentPath = ''
  const fallbackBefore = readFileSync(fallback.qqPatch)
  const previousFallbackEnvironment = captureEnvironment()
  try {
    const fallbackRun = await start(fallbackEditor)
    try {
      const fallbackPut = await requestJson(fallbackRun.port, 'PUT', '/api/dsh-extra-plan-settings/pro-config', { webFetch: true })
      check('SYNC documentPath 缺失且无显式根拒绝、QQBot零写', fallbackPut.status >= 400 && fallbackPut.body.profileSync.status === 'unavailable' && fallbackPut.body.profileSync.reason === 'document-path-unavailable' && readFileSync(fallback.qqPatch).equals(fallbackBefore))
    } finally { await new Promise((resolve) => fallbackRun.server.close(resolve)) }
  } finally {
    restoreEnvironment(previousFallbackEnvironment)
  }

  const conflictFixture = makeSyncFixture(); syncFixtureRoots.push(conflictFixture.root)
  const conflictEditor = makeEditor({ ...syncValues, gateWords: syncGateWords, webFetch: false }, conflictFixture.webPatch, {
    profileContext: { ...conflictFixture.webProfileContext, home: decoy.root },
    dshHomePath: () => conflictFixture.root,
  })
  const conflictBefore = readFileSync(conflictFixture.qqPatch)
  const conflictRun = await start(conflictEditor)
  try {
    const conflictPut = await requestJson(conflictRun.port, 'PUT', '/api/dsh-extra-plan-settings/pro-config', { webFetch: true })
    check('SYNC profile home与显式dshHomePath冲突拒绝且QQBot零写', conflictPut.status >= 400 && conflictPut.body.profileSync.status === 'unavailable' && typeof conflictPut.body.profileSync.reason === 'string' && readFileSync(conflictFixture.qqPatch).equals(conflictBefore))
  } finally {
    await new Promise((resolve) => conflictRun.server.close(resolve))
  }
  rmSync(conflictFixture.root, { recursive: true, force: true })

  const failedFixture = makeSyncFixture(); syncFixtureRoots.push(failedFixture.root)
  const failedEditor = makeEditor({ ...syncValues, gateWords: syncGateWords, webFetch: false }, failedFixture.webPatch, { profileContext: failedFixture.webProfileContext })
  rmSync(failedFixture.qqPatch, { force: true })
  const failedRun = await start(failedEditor)
  try {
    const failedPut = await requestJson(failedRun.port, 'PUT', '/api/dsh-extra-plan-settings/pro-config', { webFetch: true })
    const failedProfile = failedPut.body?.profileSync?.profiles?.[0]
    check('SYNC API 写失败返回非2xx/failed、Web applied且逐 profile reason，不伪造 synced', failedPut.status >= 400 && failedPut.body.web.applied === true && failedPut.body.overall === 'partial' && failedPut.body.profileSync.status === 'failed' && failedPut.body.profileSync.status !== 'synced' && failedProfile?.status === 'failed' && failedProfile.reason === 'patch-missing')
  } finally { await new Promise((resolve) => failedRun.server.close(resolve)) }

  const invalidRequestFixture = makeSyncFixture(); syncFixtureRoots.push(invalidRequestFixture.root)
  const invalidRequestEditor = makeEditor({ ...syncValues, gateWords: syncGateWords, webFetch: false }, invalidRequestFixture.webPatch, { profileContext: invalidRequestFixture.webProfileContext })
  const invalidRequestBefore = readFileSync(invalidRequestFixture.qqPatch, 'utf8')
  const invalidRequestRun = await start(invalidRequestEditor)
  try {
    const invalidRequest = await requestJson(invalidRequestRun.port, 'PUT', '/api/dsh-extra-plan-settings/pro-config', { webFetch: 1 })
    check('SYNC API 非法写请求400且Web/QQBot均零写', invalidRequest.status === 400 && invalidRequestEditor.state.edits.length === 0 && readFileSync(invalidRequestFixture.qqPatch, 'utf8') === invalidRequestBefore && patchBackupCount(invalidRequestFixture.profileDir) === 0)
  } finally { await new Promise((resolve) => invalidRequestRun.server.close(resolve)) }

  const partialFixture = makeSyncFixture(); syncFixtureRoots.push(partialFixture.root)
  const partialFailed = addAnchoredProfile(partialFixture.root, 'qqbot-partial-failed')
  rmSync(partialFailed.patch, { force: true })
  const partialEditor = makeEditor({ ...syncValues, gateWords: syncGateWords, webFetch: false }, partialFixture.webPatch, { profileContext: partialFixture.webProfileContext })
  const partialRun = await start(partialEditor)
  try {
    const partialPut = await requestJson(partialRun.port, 'PUT', '/api/dsh-extra-plan-settings/pro-config', { webFetch: true })
    const partialProfiles = partialPut.body?.profileSync?.profiles || []
    check('SYNC API 多目标 partial 同时报告 applied/failed 与逐 profile reason', partialPut.status >= 400 && partialPut.body.web.applied === true && partialPut.body.overall === 'partial' && partialPut.body.profileSync.status === 'failed' && partialProfiles.some((item) => item.status === 'applied') && partialProfiles.some((item) => item.status === 'failed' && item.reason === 'patch-missing'))
  } finally { await new Promise((resolve) => partialRun.server.close(resolve)) }

  const unavailable = makeSyncFixture(); syncFixtureRoots.push(unavailable.root)
  const unavailableBeforeBytes = readFileSync(unavailable.qqPatch)
  const unavailableBeforeStat = statSync(unavailable.qqPatch)
  const unavailableBeforeBackups = patchBackupCount(unavailable.profileDir)
  const unavailableBeforeEntries = readdirSync(unavailable.profileDir).sort().join('\n')
  const unavailableUserProfile = join(unavailable.root, 'missing-userprofile')
  const unavailableHome = join(unavailable.root, 'missing-home')
  rmSync(unavailableUserProfile, { recursive: true, force: true })
  rmSync(unavailableHome, { recursive: true, force: true })
  const unavailableProfilesRoot = join(unavailable.root, 'profiles')
  let unavailableProbe
  await withEnvironment({ DSH_HOME: undefined, DSH_PROFILE: undefined, USERPROFILE: unavailableUserProfile, HOME: unavailableHome }, async () => {
     const unavailableEditor = makeEditor({ ...syncValues, gateWords: syncGateWords, webFetch: false }, unavailable.webPatch, { profileContext: unavailable.webProfileContext })
     unavailableEditor.syncDocumentPath = ''
    const unavailableRun = await start(unavailableEditor)
    try {
      unavailableProbe = createFsAccessProbe([{ name: 'unavailableTarget', root: unavailable.profileDir }])
      const unavailablePut = await withFsAccessProbe(unavailableProbe, () => requestJson(unavailableRun.port, 'PUT', '/api/dsh-extra-plan-settings/pro-config', { webFetch: true }))
      const unavailableAfterBytes = readFileSync(unavailable.qqPatch)
      const unavailableAfterStat = statSync(unavailable.qqPatch)
      const unavailableAfterBackups = patchBackupCount(unavailable.profileDir)
      const unavailableAfterEntries = readdirSync(unavailable.profileDir).sort().join('\n')
      const unavailableTempEntries = unavailableAfterEntries.split('\n').filter((name) => name.startsWith('cordis.patch.yml.tmp-dsh-extra-plan-settings-'))
      check('SYNC USERPROFILE/HOME 两不存在来源零创建且目标访问=0：target访问=' + unavailableProbe.count('unavailableTarget'), !(unavailablePut.status >= 200 && unavailablePut.status < 300) && unavailablePut.body.profileSync.status === 'unavailable' && unavailablePut.body.profileSync.reason === 'document-path-unavailable' && unavailablePut.body.web.applied === true && unavailablePut.body.overall === 'partial' && unavailableProbe.count('unavailableTarget') === 0 && unavailableBeforeBytes.equals(unavailableAfterBytes) && unavailableAfterStat.mtimeMs === unavailableBeforeStat.mtimeMs && unavailableAfterBackups === unavailableBeforeBackups && unavailableAfterEntries === unavailableBeforeEntries && unavailableTempEntries.length === 0 && unavailableUserProfile !== unavailableHome && !existsSync(unavailableUserProfile) && !existsSync(unavailableHome))
    } finally { await new Promise((resolve) => unavailableRun.server.close(resolve)) }
  })

  const invalidPaths = [
    'profiles/web/cordis.patch.yml',
    join(webFixture.root, 'profiles', 'desktop', 'cordis.patch.yml'),
    join(webFixture.root, 'profiles', 'web', 'wrong.yml'),
    join(webFixture.root, 'other', 'web', 'cordis.patch.yml'),
  ]
  for (const invalidPath of invalidPaths) {
     const invalidEditor = makeEditor({ ...syncValues, gateWords: syncGateWords, webFetch: false }, webFixture.webPatch, { profileContext: webFixture.webProfileContext })
     invalidEditor.syncDocumentPath = invalidPath
    const invalidRun = await start(invalidEditor)
    try {
      const invalidPut = await requestJson(invalidRun.port, 'PUT', '/api/dsh-extra-plan-settings/pro-config', { webFetch: true })
      check('SYNC 非空矛盾 documentPath 禁止降级 DSH_HOME：' + invalidPath, invalidPut.status >= 400 && invalidPut.body.profileSync.status === 'unavailable' && invalidPut.body.profileSync.reason === 'invalid-document-path' && readFileSync(decoy.qqPatch, 'utf8') === decoyBefore)
    } finally { await new Promise((resolve) => invalidRun.server.close(resolve)) }
  }

  const noTarget = makeSyncFixture(); syncFixtureRoots.push(noTarget.root)
  rmSync(join(noTarget.profileDir, 'node_modules', 'dsh-extra-plan-qqbot'), { recursive: true, force: true })
  const noTargetEditor = makeEditor({ ...syncValues, gateWords: syncGateWords, webFetch: false }, noTarget.webPatch, { profileContext: noTarget.webProfileContext })
  const noTargetRun = await start(noTargetEditor)
  try {
    const noTargetPut = await requestJson(noTargetRun.port, 'PUT', '/api/dsh-extra-plan-settings/pro-config', { webFetch: true })
    check('SYNC 已证明 profilesRoot 但无双锚点目标返回 200/not-installed', noTargetPut.status === 200 && noTargetPut.body.profileSync.status === 'not-installed' && noTargetPut.body.profileSync.status !== 'synced')
  } finally { await new Promise((resolve) => noTargetRun.server.close(resolve)) }

  const drift = makeSyncFixture(); syncFixtureRoots.push(drift.root)
  const driftEditor = makeEditor({ ...syncValues, gateWords: syncGateWords, webFetch: false }, drift.webPatch, { profileContext: drift.webProfileContext })
  const driftRun = await start(driftEditor)
  try {
    const first = await requestJson(driftRun.port, 'PUT', '/api/dsh-extra-plan-settings/pro-config', { webFetch: true })
    const driftText = '- override:\n    id: dsh-extra-plan-settings\n    config:\n      plannerModel: drifted\n      gateWords:\n        routeDirect: 甲\n        routePlan: 乙\n        routeDisagree: 丙\n        approvalApprove: 丁\n        approvalReplan: 戊\n        purposeRefine: 己\n        purposeRedo: 庚\n'
    writeFileSync(drift.qqPatch, driftText, 'utf8')
    const second = await requestJson(driftRun.port, 'PUT', '/api/dsh-extra-plan-settings/pro-config', { webFetch: true })
    check('SYNC 同值保存仍检查并修复 QQBot 漂移', first.body.profileSync.status === 'synced' && second.body.profileSync.status === 'synced' && syncConfigOf(readFileSync(drift.qqPatch, 'utf8')).plannerModel === syncValues.plannerModel)
  } finally { await new Promise((resolve) => driftRun.server.close(resolve)) }
} finally {
  restoreEnvironment(previousSyncEnvironment)
  for (const root of syncFixtureRoots) rmSync(root, { recursive: true, force: true })
}

function nextMatrixValue(base, key, index) {
  if (typeof base[key] === 'boolean') return !base[key]
  if (key === 'toolPresentationMode') return base[key] === 'native' ? 'ptc' : 'native'
  if (typeof base[key] === 'number') return base[key] + index + 1
  return String(base[key]) + '-matrix-' + index
}
async function runHostProxyMatrix() {
  const baseValues = { ...syncValues }
  const gate = structuredClone(syncGateWords)
  const matrixFixture = makeSyncFixture()
  const matrixEditor = makeEditor({ ...baseValues, gateWords: gate }, matrixFixture.webPatch, { persistDocument: true, profileContext: matrixFixture.webProfileContext })
  const initialSnapshot = { values: { ...baseValues }, gateWords: gate }
  writeFileSync(matrixFixture.webPatch, JSON.stringify([{ id: 'dsh-extra-plan-settings', name: 'dsh-extra-plan/settings', config: { ...baseValues, gateWords: gate } }]), 'utf8')
  const normalTrace = []
  const normalStats = { register: 0, dispose: 0 }
  const normalRun = await start(matrixEditor, { mount: true, trace: normalTrace, hostProxyMode: 'normal-injection', matrixStats: normalStats })
  let normalOk = true
  let normalTerminal = await waitForFullSnapshotTerminal(normalRun.port, matrixFixture, initialSnapshot)
  await waitForAdapterRegister(normalStats)
  const initialRegister = normalStats.register
  const initialDispose = normalStats.dispose
  for (const [index, key] of keys.entries()) {
    const nextValues = { ...baseValues, [key]: nextMatrixValue(baseValues, key, index) }
    const nextSnapshot = { values: nextValues, gateWords: gate }
    matrixEditor.state.rows[0].entry.options.config = { ...nextValues, gateWords: gate }
    writeFileSync(matrixFixture.webPatch, JSON.stringify([{ id: 'dsh-extra-plan-settings', name: 'dsh-extra-plan/settings', config: { ...nextValues, gateWords: gate } }]), 'utf8')
    if (typeof normalRun.lifecycle.update === 'function') normalRun.lifecycle.update()
    await flush(4)
    normalTerminal = await waitForFullSnapshotTerminal(normalRun.port, matrixFixture, nextSnapshot)
    normalOk = normalOk && fullSnapshotShapeOk(nextSnapshot) && normalTerminal?.body?.profileSync?.status === 'synced' &&
      normalTerminal.body.profileSync.pending === false && isDeepStrictEqual(normalTerminal.body.values, nextValues) &&
      isDeepStrictEqual(syncConfigOf(readFileSync(matrixFixture.webPatch, 'utf8')), { ...nextValues, gateWords: gate }) &&
      isDeepStrictEqual(syncConfigOf(readFileSync(matrixFixture.qqPatch, 'utf8')), { ...nextValues, gateWords: gate })
  }
  const normalProxy = normalRun.proxy
  const normalCase = {
    case: 'normal-injection',
    getCalls: normalProxy.getCalls,
    getResult: normalProxy.getResult,
    injectRequests: normalProxy.injectRequests,
    injectCallback: normalProxy.injectRequests.filter((item) => item.deps[0] === 'configEditor' && item.outcome === 'callback').length,
    childServiceIdentity: normalProxy.childServiceIdentity,
    documentPath: matrixEditor.documentPath,
    initialRegister,
    settingsRegisterDelta: normalStats.register - initialRegister,
    disposeDelta: normalStats.dispose - initialDispose,
     profileSyncTerminal: { status: normalTerminal?.body?.profileSync?.status, pending: normalTerminal?.body?.profileSync?.pending, saveRunId: normalTerminal?.body?.profileSync?.saveRunId, syncRevision: normalTerminal?.body?.profileSync?.syncRevision, snapshotHash: normalTerminal?.body?.profileSync?.snapshotHash, trigger: normalTerminal?.body?.profileSync?.trigger },
    failureOrder: ['outer-configEditor-error', 'ctx.get:configEditor', 'settled-terminal', 'adapter-start'],
    classification: 'PASS',
  }
  output.structured('HOST_PROXY_MATRIX_CASE', normalCase, { case: normalCase.case, status: normalCase.classification, getCalls: normalCase.getCalls.length, injectRequests: normalCase.injectRequests.length, injectCallback: normalCase.injectCallback, initialRegister: normalCase.initialRegister, settingsRegisterDelta: normalCase.settingsRegisterDelta, disposeDelta: normalCase.disposeDelta, profileSyncTerminal: normalCase.profileSyncTerminal, failureOrder: normalCase.failureOrder })
  const normalBoundaryOk = normalProxy.outerDirectError === 'cannot get property "configEditor" without inject' &&
    normalProxy.getResult === 'editor' && normalCase.injectCallback === 1 && normalProxy.childServiceIdentity === 'same-editor' &&
    // 0.2.1 预设链注册 5 个 definition（主 + 4 角色）：初始化注册数 = 5，settings-only 增量仍为 0。
    initialRegister === 5 && normalCase.settingsRegisterDelta === 0 && normalCase.disposeDelta === 0 &&
     normalCase.profileSyncTerminal.status === 'synced' && normalCase.profileSyncTerminal.pending === false && typeof normalCase.profileSyncTerminal.saveRunId === 'string' && normalCase.profileSyncTerminal.saveRunId !== '' && Number.isInteger(normalCase.profileSyncTerminal.syncRevision) && normalCase.profileSyncTerminal.syncRevision > 0 && typeof normalCase.profileSyncTerminal.snapshotHash === 'string' && normalCase.profileSyncTerminal.trigger === 'settled-update' && normalOk
  if (normalBoundaryOk) console.log('HOST_PROXY_NORMAL_SETTLED_CTX_GET_OK')
  check('host-proxy normal settled assertion', normalBoundaryOk)
  check('V03 settings owner 生命周期由真实 host-proxy trace 覆盖', normalBoundaryOk && ['loader', 'settings', 'webServer', 'configEditor'].every((name) => normalCase.injectRequests.some((item) => item.deps[0] === name)) && normalTrace.includes('ctx.get:configEditor') && normalTrace.includes('adapter-start'))
  if (normalOk) console.log('FULL_SNAPSHOT_10_PLUS_7_EACH_TRIGGER_OK')
  check('full snapshot each trigger assertion', normalOk)
  if (typeof normalRun.lifecycle.cleanup === 'function') await normalRun.lifecycle.cleanup()
  await new Promise((resolve) => normalRun.server.close(resolve))
  rmSync(matrixFixture.root, { recursive: true, force: true })

  const negativeCases = ['get-only/no-op-inject', 'inject-throws', 'child-missing-configEditor']
  let negativeOk = true
  for (const caseName of negativeCases) {
    const fixture = makeSyncFixture()
    const negativeEditor = makeEditor({ ...baseValues, gateWords: gate }, fixture.webPatch)
    const trace = []
    const stats = { register: 0, dispose: 0 }
    const run = await start(negativeEditor, { mount: true, trace, hostProxyMode: caseName, matrixStats: stats, allowApplyError: caseName === 'inject-throws' })
    const proxy = run.proxy
    let profileSyncTerminal = { status: 'unavailable', pending: false }
    if (caseName === 'get-only/no-op-inject') {
      const getResponse = await requestJson(run.port, 'GET', '/api/dsh-extra-plan-settings/pro-config', {})
      profileSyncTerminal = { status: getResponse.body?.profileSync?.status || 'pending', pending: getResponse.body?.profileSync?.pending === true, mount: 'NOT-RUN' }
      if (typeof run.lifecycle.cleanup === 'function') await run.lifecycle.cleanup()
      await new Promise((resolve) => run.server.close(resolve))
    } else if (caseName === 'child-missing-configEditor') {
      await flush(8)
      profileSyncTerminal = { status: 'unavailable', pending: false, reason: 'child configEditor missing' }
      if (typeof run.lifecycle.cleanup === 'function') await run.lifecycle.cleanup()
    }
    const result = {
      case: caseName,
      getCalls: proxy.getCalls,
      getResult: proxy.readViaGet() === negativeEditor ? 'editor' : 'unexpected',
      injectRequests: proxy.injectRequests,
      injectCallback: proxy.injectRequests.filter((item) => item.deps[0] === 'configEditor' && item.outcome.startsWith('callback')).length,
      childServiceIdentity: proxy.childServiceIdentity,
      documentPath: negativeEditor.documentPath,
      initialRegister: stats.register,
      settingsRegisterDelta: 0,
      disposeDelta: stats.dispose,
      profileSyncTerminal,
      failureOrder: [...trace],
      classification: 'HUMAN',
    }
    output.structured('HOST_PROXY_MATRIX_CASE', result, { case: result.case, status: result.classification, getCalls: result.getCalls.length, injectRequests: result.injectRequests.length, injectCallback: result.injectCallback, initialRegister: result.initialRegister, settingsRegisterDelta: result.settingsRegisterDelta, disposeDelta: result.disposeDelta, profileSyncTerminal: result.profileSyncTerminal, failureOrder: result.failureOrder })
    if (caseName === 'get-only/no-op-inject') {
      negativeOk = negativeOk && result.getResult === 'editor' && result.injectCallback === 0 && profileSyncTerminal.mount === 'NOT-RUN' && profileSyncTerminal.pending === true
      console.log('HUMAN  {"scope":"HOST-PROXY-GET-ONLY","reason":"ctx.get 可解析 editor，但 no-op inject 未挂载；不计 no-remount PASS"}')
    } else if (caseName === 'inject-throws') {
      negativeOk = negativeOk && result.getResult === 'editor' && result.injectRequests.some((item) => item.outcome === 'error=inject-error') && result.initialRegister === 0 && run.proxy.applyError === 'inject-error'
    } else {
      negativeOk = negativeOk && result.getResult === 'editor' && result.childServiceIdentity === 'missing' && result.injectCallback === 1 && result.initialRegister === 0 && trace.includes('child-configEditor-missing')
    }
    rmSync(fixture.root, { recursive: true, force: true })
  }
  if (negativeOk) console.log('HOST_PROXY_NEGATIVE_BOUNDARIES_EXPLICIT_OK')
  check('host-proxy negative boundaries assertion', negativeOk)
  const matrixComplete = normalBoundaryOk && negativeOk
  if (matrixComplete) console.log('HOST_PROXY_MATRIX_COMPLETE_OK')
  check('host-proxy matrix complete assertion', matrixComplete)
}
await runHostProxyMatrix()
const adapterFixtureRoots = []
const adapterFixture = makeSyncFixture(); adapterFixtureRoots.push(adapterFixture.root)
const adapterEditor = makeEditor({ ...syncValues, gateWords: syncGateWords }, adapterFixture.webPatch, { profileContext: adapterFixture.webProfileContext })
const adapterCounts = { register: 0, dispose: 0 }
let adapterNoRemount = false
const adapterRun = await start(adapterEditor, {
  mount: true,
  plugin: async () => { adapterCounts.register += 1; return { dispose: async () => { adapterCounts.dispose += 1 } } },
})
try {
  await flush(8)
  const adapterInitial = await waitForTerminal(adapterRun.port)
  await waitForAdapterRegister(adapterCounts)
  adapterEditor.state.rows[0].entry.options.config.plannerModel = 'no-remount-model'
   writeFileSync(adapterEditor.documentPath, JSON.stringify([{ id: 'dsh-extra-plan-settings', name: 'dsh-extra-plan/settings', config: adapterEditor.state.rows[0].entry.options.config }]), 'utf8')
  if (typeof adapterRun.lifecycle.update === 'function') adapterRun.lifecycle.update()
  await flush(8)
  const adapterAfter = await waitForTerminal(adapterRun.port)
  await waitForAdapterRegister(adapterCounts)
  // no-remount 合同（0.2.1）：初次挂载登记 5 个 definition（主 + 4 角色），settings-only 保存不新增 register、dispose 恒 0。
  adapterNoRemount = adapterInitial.body.profileSync.status === 'synced' && adapterAfter.body.profileSync.status === 'synced' && adapterCounts.register === 5 && adapterCounts.dispose === 0
  check('SETTINGS_ONLY_HTTP_SAVE_ADAPTER_REGISTER_0_DISPOSE_0', adapterNoRemount)
  check('SETTINGS_ONLY_HTTP_SAVE_ADAPTER_MOUNT_COUNT_5', adapterCounts.register === 5)
} finally {
  if (typeof adapterRun.lifecycle.cleanup === 'function') await adapterRun.lifecycle.cleanup()
  await new Promise((resolve) => adapterRun.server.close(resolve))
}

async function runApiAdapterCase(label, caseName, failureEvent, changed) {
  const fixture = makeSyncFixture(); adapterFixtureRoots.push(fixture.root)
  const trace = []
  const counts = { register: 0, dispose: 0 }
  const gate = deferred()
  const fiber = { dispose: async () => { counts.dispose += 1 } }
  const editor = makeEditor({ ...syncValues, gateWords: syncGateWords }, fixture.webPatch, { persistDocument: true, profileContext: fixture.webProfileContext })
  const run = await start(editor, {
    mount: true,
    trace,
    adapterFailureEvent: failureEvent,
    plugin: async () => {
      counts.register += 1
      await gate.promise
      if (caseName === 'throw') throw new Error('injected adapter throw')
      if (caseName === 'reject') return Promise.reject(new Error('injected adapter reject'))
      return fiber
    },
  })
  let released = false
  let cleaned = false
  const release = () => {
    if (released) return
    released = true
    gate.resolve(caseName === 'hang' ? fiber : undefined)
  }
  try {
    await waitForTrace(trace, 'adapter-start')
    const snapshot = { values: { ...syncValues, ...changed }, gateWords: syncGateWords }
    const put = await requestApiJson(run.port, 'PUT', '/api/dsh-extra-plan-settings/pro-config', changed, trace)
    const adapterStartIndex = trace.indexOf('adapter-start')
    const terminalIndex = trace.indexOf('api-profile-sync-terminal')
    let ok = apiTerminalBodyOk(put) && apiSnapshotBodyOk(put, snapshot) && apiPatchOk(fixture, snapshot) &&
      adapterStartIndex >= 0 && terminalIndex > adapterStartIndex && counts.register === 1 && counts.dispose === 0
    if (caseName === 'hang') {
      const beforeRelease = ok && !trace.includes('adapter-resolved') && !trace.includes('adapter-thrown') && !trace.includes('adapter-rejected')
      release()
      await waitForTrace(trace, 'adapter-resolved')
      const resolvedIndex = trace.indexOf('adapter-resolved')
      const afterRelease = resolvedIndex > terminalIndex && counts.dispose === 0
      const get = await requestJson(run.port, 'GET', '/api/dsh-extra-plan-settings/pro-config', {})
      if (typeof run.lifecycle.cleanup === 'function') { await run.lifecycle.cleanup(); cleaned = true }
      ok = beforeRelease && afterRelease && apiTerminalBodyOk({ status: 200, body: { web: { applied: true }, projection: { applied: true }, overall: 'synced', profileSync: get.body.profileSync } }) &&
        // hang 释放后主 + 4 角色顺序挂载 = 5 次 register；cleanup 时整体回滚 5 次 dispose。
        apiSnapshotBodyOk(get, snapshot) && apiPatchOk(fixture, snapshot) && counts.register === 5 && counts.dispose === 5
      output.structured('API_TRACE', { case: caseName, trace, adapterStartIndex, terminalIndex, putStatus: put.status, apiBodyOk: apiTerminalBodyOk(put), snapshotBodyOk: apiSnapshotBodyOk(put, snapshot), patchOk: apiPatchOk(fixture, snapshot), patchDetails: apiPatchDetails(fixture, snapshot), resolvedIndex, pluginCalls: counts.register, pluginDisposals: counts.dispose }, { case: caseName, status: ok ? 'PASS' : 'FAIL', events: trace.length, adapterStartIndex, terminalIndex, resolvedIndex, putStatus: put.status, apiBodyOk: apiTerminalBodyOk(put), snapshotBodyOk: apiSnapshotBodyOk(put, snapshot), patchOk: apiPatchOk(fixture, snapshot), pluginCalls: counts.register, pluginDisposals: counts.dispose }, { failure: !ok })
    } else {
      release()
      await waitForTrace(trace, failureEvent)
      const failureIndex = trace.indexOf(failureEvent)
      const get = await requestJson(run.port, 'GET', '/api/dsh-extra-plan-settings/pro-config', {})
      ok = ok && failureIndex > terminalIndex && trace.filter((event) => event === failureEvent).length === 1 &&
        get.status >= 200 && get.status < 300 && get.body.profileSync?.status === 'synced' && get.body.profileSync?.pending === false &&
        // 首个（主）definition 挂载即 throw/reject → register 恰 1 次、无已挂载项可回滚（角色尚未开始挂载）。
        apiSnapshotBodyOk(get, snapshot) && apiPatchOk(fixture, snapshot) && counts.register === 1 && counts.dispose === 0
      output.structured('API_TRACE', { case: caseName, trace, adapterStartIndex, terminalIndex, putStatus: put.status, apiBodyOk: apiTerminalBodyOk(put), snapshotBodyOk: apiSnapshotBodyOk(put, snapshot), patchOk: apiPatchOk(fixture, snapshot), patchDetails: apiPatchDetails(fixture, snapshot), failureIndex, pluginCalls: counts.register, pluginDisposals: counts.dispose }, { case: caseName, status: ok ? 'PASS' : 'FAIL', events: trace.length, adapterStartIndex, terminalIndex, failureIndex, putStatus: put.status, apiBodyOk: apiTerminalBodyOk(put), snapshotBodyOk: apiSnapshotBodyOk(put, snapshot), patchOk: apiPatchOk(fixture, snapshot), pluginCalls: counts.register, pluginDisposals: counts.dispose }, { failure: !ok })
    }
    check(label, ok)
  } finally {
    release()
    await flush(8)
    if (!cleaned && typeof run.lifecycle.cleanup === 'function') await run.lifecycle.cleanup()
    await new Promise((resolve) => run.server.close(resolve))
  }
}
await runApiAdapterCase('API_ADAPTER_THROW_COMPLETE_PATCH_SETTLED_BEFORE_FAILURE_OK', 'throw', 'adapter-thrown', { webFetch: false })
await runApiAdapterCase('API_ADAPTER_REJECT_COMPLETE_PATCH_SETTLED_BEFORE_FAILURE_OK', 'reject', 'adapter-rejected', { webFetch: false })
await runApiAdapterCase('API_ADAPTER_HANG_COMPLETE_PATCH_SETTLED_BEFORE_RESOLVE_OK', 'hang', 'adapter-resolved', { webFetch: false })


const liveRoot = makeWRoot('settings-live-config')
const livePathContext = createPathContext({ workspaceRoot: liveRoot })
const liveDir = join(liveRoot, 'profiles', 'web')
mkdirSync(liveDir, { recursive: true })
let livePath = join(liveDir, 'cordis.patch.yml')
const hotKeys = ['anchoredBootstrap', 'creativeMode', 'runcodeCatchGate', 'crossProviderPlannerModel', 'plannerModel', 'plannerPromptSuffix', 'exploreBudget', 'otherAgentModel']
const hotGetters = { anchoredBootstrap: 'anchoredBootstrap', creativeMode: 'creativeMode', runcodeCatchGate: 'runcodeCatchGate', crossProviderPlannerModel: 'crossProviderPlannerModel', plannerModel: 'plannerModel', plannerPromptSuffix: 'plannerPromptSuffix', exploreBudget: 'exploreBudget', otherAgentModel: 'otherAgentModel' }
const hotNext = { anchoredBootstrap: true, creativeMode: false, runcodeCatchGate: false, crossProviderPlannerModel: false, plannerModel: 'hot-model', plannerPromptSuffix: 'hot-suffix', exploreBudget: 47, otherAgentModel: 'hot-other' }
writeFileSync(livePath, JSON.stringify([{ id: 'dsh-extra-plan-settings', name: 'dsh-extra-plan/settings', config: { ...syncValues } }]), 'utf8')
const liveWarnings = []
const liveWarn = console.warn
console.warn = (...args) => liveWarnings.push(args.map(String).join(' '))
try {
  const liveConfig = createLiveConfig({ resolveDocumentTarget: () => ({ kind: 'workspace', path: livePath }), getPathContext: () => livePathContext, fallbackDefaults: syncValues })
  let hotReadOk = true
  for (const key of hotKeys) {
    const next = { ...syncValues, [key]: hotNext[key] }
    livePath = join(liveDir, 'cordis.patch.' + key + '.yml')
    writeFileSync(livePath, JSON.stringify([{ id: 'dsh-extra-plan-settings', name: 'dsh-extra-plan/settings', config: next }]), 'utf8')
    if (!Object.is(liveConfig.get(hotGetters[key], { session: { header: { cwd: liveRoot } } }), hotNext[key])) hotReadOk = false
  }
  const missingLivePath = join(liveDir, 'cordis.patch.missing.yml')
  livePath = missingLivePath
  const fallbackAfterMissing = Object.fromEntries(hotKeys.map((key) => [key, liveConfig.get(hotGetters[key], { session: { header: { cwd: liveRoot } } })]))
  const fallbackOk = hotKeys.every((key) => Object.is(fallbackAfterMissing[key], syncValues[key]))
  const warningsAfterMissing = liveWarnings.length
  livePath = join(liveDir, 'cordis.patch.recovered.yml')
  const recoveredValues = { ...syncValues, ...hotNext }
  writeFileSync(livePath, JSON.stringify([{ id: 'dsh-extra-plan-settings', name: 'dsh-extra-plan/settings', config: recoveredValues }]), 'utf8')
  const recovered = Object.fromEntries(hotKeys.map((key) => [key, liveConfig.get(hotGetters[key], { session: { header: { cwd: liveRoot } } })]))
  const recoveredOk = hotKeys.every((key) => Object.is(recovered[key], hotNext[key]))
  check('G5 A可读→B缺失→B可读：8项回退/恢复且缺失最多一次告警', hotReadOk && fallbackOk && recoveredOk && warningsAfterMissing === 1 && liveWarnings.length === 1 && adapterNoRemount)
} finally {
  console.warn = liveWarn
}
const generatedDefinition = parsePresetYaml(readFileSync(join(REPO_ROOT, 'plugins/dsh-extra-plan/assets/presets/extra-plan/preset-definition.generated.yml'), 'utf8'))
const restartRows = generatedDefinition.plugins || []
const restartWeb = restartRows.find((row) => row && row.id === 'tool-web')
const restartPresentation = restartRows.find((row) => row && row.id === 'tool-presentation')
const restartOk = restartWeb !== undefined && restartPresentation !== undefined && restartWeb.config !== undefined && restartPresentation.config !== undefined &&
  !hotKeys.includes('webFetch') && !hotKeys.includes('toolPresentationMode')
console.log('HOT=8 RESTART=2')
check('RESTART_2_DEFINITION_PROJECTIONS_REMAIN_LOAD_TIME', restartOk)
const oldRuntime = createGateRuntime(syncGateWords)
const restartGate = Object.fromEntries(GATE_WORD_FIELDS.map((item, index) => [item.field, '重词' + index]))
const nextRuntime = createGateRuntime(restartGate)
check('GATEWORDS_FULL_SYNC_RESTART_SEMANTICS', oldRuntime.words.routeDirect === syncGateWords.routeDirect && nextRuntime.words.routeDirect === restartGate.routeDirect && oldRuntime.words.routeDirect !== nextRuntime.words.routeDirect)
console.log('HUMAN  {"scope":"RESTART-AND-GATEWORDS","reason":"真实 Harness/QQBot 重启、旧词拒绝与非法词无 fallback 需部署后复测"}')
rmSync(liveRoot, { recursive: true, force: true })
for (const root of adapterFixtureRoots) rmSync(root, { recursive: true, force: true })

const invalidApiGateCases = [
  ['missing-key', (() => { const value = structuredClone(gateWords); delete value.routeDirect; return value })()],
  ['duplicate-value', { ...gateWords, routePlan: gateWords.routeDirect }],
  ['recommended-suffix', { ...gateWords, routeDirect: gateWords.routeDirect + ' (recommended)' }],
  ['crlf', { ...gateWords, routeDirect: 'direct\r\nline' }],
  ['js-expression', { ...gateWords, routeDirect: { __jsExpr: 'must-not-run' } }],
]
for (const [kind, words] of invalidApiGateCases) {
  const badGateEditor = makeEditor({ ...initial, gateWords: words })
  const originalConfig = structuredClone(badGateEditor.state.rows[0].entry.options.config)
  const badGateRun = await start(badGateEditor)
  try {
    const badGet = await requestJson(badGateRun.port, 'GET', '/api/dsh-extra-plan-settings/pro-config', {})
    const badPut = await requestJson(badGateRun.port, 'PUT', '/api/dsh-extra-plan-settings/pro-config', { webFetch: true })
     check('V02 API ' + kind + ' GET/PUT均冲突、零edit且完整存储深等不变', badGet.status === 409 && badPut.status === 409 && badGet.body?.settingsRow?.status === 'conflict' && badPut.body?.settingsRow?.status === 'conflict' && badGateEditor.state.edits.length === 0 && isDeepStrictEqual(badGateEditor.state.rows[0].entry.options.config, originalConfig))
  } finally { await new Promise((resolve) => badGateRun.server.close(resolve)) }
}

function makeClientHarness(snapshot, outcome = true, failDetail = false, savingInitial = false, options = {}) {
  let definition
  const registrations = []
  const injectionDisposers = {}
  const injectionRecords = {}
  const cleanups = []
  const states = []
  const renderStats = { bundleRenders: 0, formRenders: 0, detailRenders: 0, effectRuns: 0, effectCleanups: 0, postUnmountSetState: 0 }
  const registerCalls = {}
  const registerDisposeCounts = {}
  let registrationDisposals = 0
  let styleAppends = 0
  let styleRemoves = 0
  let currentRunner
  let surfaceEffectRecord
  const pluginEffectRecords = []
  const controllerState = { snapshot: structuredClone(snapshot) }
  const listeners = new Set()
  let subscribeCount = 0
  let unsubscribeCount = 0
  let notificationCount = 0
  let recoveryReadAttempts = 0
  const calls = []
  const fetchCalls = []
  const localeRegisters = []
  const configFormGets = []
  const configFormServes = []
  const slotInjectCalls = []
  const slotRegisterCalls = []

  function sameDeps(left, right) {
    if (left === undefined || right === undefined) return false
    if (!Array.isArray(left) || !Array.isArray(right) || left.length !== right.length) return false
    return left.every((value, index) => Object.is(value, right[index]))
  }
  function createRunner(name) {
    const runner = {
      name,
      slots: [],
      hookIndex: 0,
      pendingEffects: [],
      dirty: false,
      mounted: true,
      renderCount: 0,
      render(fn, props) {
        if (!runner.mounted) return undefined
        runner.dirty = false
        runner.hookIndex = 0
        runner.pendingEffects = []
        runner.renderCount += 1
        renderStats[name === 'bundle' ? 'bundleRenders' : name === 'form' || name === 'detail-form' ? 'formRenders' : 'detailRenders'] += 1
        const previous = currentRunner
        currentRunner = runner
        let result
        try { result = fn(props) } finally { currentRunner = previous }
        for (const pending of runner.pendingEffects) {
          const slot = runner.slots[pending.index]
          if (typeof slot.cleanup === 'function') { slot.cleanup(); slot.cleanup = undefined; renderStats.effectCleanups += 1 }
          const cleanup = pending.fn()
          slot.cleanup = typeof cleanup === 'function' ? cleanup : undefined
          renderStats.effectRuns += 1
        }
        return result
      },
      useState(initialValue) {
        const index = runner.hookIndex++
        let slot = runner.slots[index]
        if (slot === undefined) {
          let value = typeof initialValue === 'function' ? initialValue() : initialValue
          if (value === false && savingInitial === true && (runner.name === 'form' || runner.name === 'detail-form')) value = true
          slot = { kind: 'state', value }
          runner.slots[index] = slot
        }
        const holder = {}
        Object.defineProperty(holder, 'value', { get: () => slot.value })
        states.push(holder)
        const setValue = (next) => {
          if (!runner.mounted) { renderStats.postUnmountSetState += 1; return }
          slot.value = typeof next === 'function' ? next(slot.value) : next
          runner.dirty = true
        }
        return [slot.value, setValue]
      },
      useEffect(fn, deps) {
        const index = runner.hookIndex++
        let slot = runner.slots[index]
        const changed = slot === undefined || !sameDeps(slot.deps, deps)
        if (slot === undefined) { slot = { kind: 'effect', deps: undefined, cleanup: undefined }; runner.slots[index] = slot }
        slot.deps = Array.isArray(deps) ? deps.slice() : undefined
        if (changed) runner.pendingEffects.push({ index, fn })
      },
      unmount() {
        if (!runner.mounted) return
        runner.mounted = false
        for (const slot of runner.slots) {
          if (slot !== undefined && typeof slot.cleanup === 'function') { slot.cleanup(); slot.cleanup = undefined; renderStats.effectCleanups += 1 }
        }
      },
    }
    return runner
  }
  const detailRunner = createRunner('detail')
  const detailFormRunner = createRunner('detail-form')
  const fakeReact = {
    Fragment: Symbol('Fragment'),
    createElement(type, props, ...children) { return { type, props: props || {}, children } },
    useState(initialValue) {
      if (currentRunner === undefined) throw new Error('useState outside component runner')
      return currentRunner.useState(initialValue)
    },
    useEffect(fn, deps) {
      if (currentRunner === undefined) throw new Error('useEffect outside component runner')
      return currentRunner.useEffect(fn, deps)
    },
  }
  const document = {
    head: { appendChild() { styleAppends += 1 } },
    createElement: () => ({ dataset: {}, remove() { styleRemoves += 1 } }),
  }
  const fetchResponses = {
    synced: { ok: true, status: 200, json: async () => ({ overall: 'synced', profileSync: { status: 'synced', pending: false } }) },
    'not-installed': { ok: true, status: 200, json: async () => ({ overall: 'not-installed', profileSync: { status: 'not-installed', pending: false } }) },
    failed: { ok: false, status: 502, json: async () => ({ overall: 'partial', profileSync: { status: 'failed', profiles: [{ profile: 'qqbot', reason: 'snapshot-hash-mismatch' }] } }) },
    conflict: { ok: false, status: 409, json: async () => ({ overall: 'conflict', profileSync: { status: 'conflict', reason: 'terminal-saveRunId-mismatch' } }) },
  }
  const sandbox = { window: { __ModuleLoader__: { load(value) { definition = value } } }, document, console, Symbol, Object, Array, String, Number, Boolean, JSON, structuredClone, Set, Map, Error,
    fetch: async (url, init) => {
      fetchCalls.push({ url: String(url), method: init === undefined || init === null ? 'GET' : String(init.method || 'GET'), body: init === undefined || init === null || typeof init.body !== 'string' ? undefined : JSON.parse(init.body) })
      if (options.fetchBehavior === 'network') throw new Error('network down')
      return fetchResponses[options.fetchBehavior] || fetchResponses.synced
    },
  }
  const clientSourceText = typeof options.clientSourceText === 'string' ? options.clientSourceText : clientText
  runInNewContext(clientSourceText, sandbox)
  const moduleExports = definition.factory((name) => { if (name === 'react') return fakeReact; throw new Error('unexpected require ' + name) })

  function notify(nextSnapshot = controllerState.snapshot) {
    controllerState.snapshot = structuredClone(nextSnapshot)
    notificationCount += 1
    for (const listener of [...listeners]) listener()
  }
  const formController = {
    getSnapshot: () => controllerState.snapshot,
    subscribe: (listener) => {
      subscribeCount += 1
      listeners.add(listener)
      let active = true
      return () => { if (active) { active = false; if (listeners.delete(listener)) unsubscribeCount += 1 } }
    },
    mutate: async (ops, revision) => {
      calls.push({ ops: structuredClone(ops), revision })
      if (revision !== controllerState.snapshot.revision) {
        if (options.recoveryFailure === true) { recoveryReadAttempts += 1; throw new Error('snapshot restore read failed') }
        notify(controllerState.snapshot)
        return false
      }
      if (outcome === 'throw') throw new Error('mutate failed')
      return outcome
    },
  }
  const surfaceContext = {
    locale: {
      bind: () => (key) => key,
      register: (namespace, dictionaries) => { localeRegisters.push({ namespace, dictionaries: structuredClone(dictionaries) }); return () => {} },
    },
    configForms: {
      get: (namespace) => { configFormGets.push(namespace); return formController },
      whileServed: (names, callback) => { configFormServes.push([...names]); return callback() },
    },
    slots: {
      inject: (name, callback) => {
        slotInjectCalls.push(name)
        const record = { name, callback, active: true, cleanup: undefined }
        const off = () => {
          if (!record.active) return
          record.active = false
          if (typeof record.cleanup === 'function') record.cleanup()
        }
        record.off = off
        injectionRecords[name] = record
        injectionDisposers[name] = off
        try {
          record.cleanup = callback()
        } catch (error) {
          record.error = error
          record.active = false
          if (name === 'plugins.detail.section') surfaceContext.detailRegisterError = error
          throw error
        }
        return off
      },
      register: (registerOptions, component) => {
        slotRegisterCalls.push({ ...registerOptions })
        if (failDetail && registerOptions.name === 'plugins.detail.section') throw new Error('detail register failed')
        const entry = { options: registerOptions, component }
        registrations.push(entry)
        registerCalls[registerOptions.name] = (registerCalls[registerOptions.name] || 0) + 1
        let disposed = false
        return () => {
          if (disposed) return
          disposed = true
          registrationDisposals += 1
          registerDisposeCounts[registerOptions.name] = (registerDisposeCounts[registerOptions.name] || 0) + 1
          const index = registrations.indexOf(entry)
          if (index >= 0) registrations.splice(index, 1)
        }
      },
      entries: () => registrations,
    },
    effect: (fn, label) => {
      const record = { fn, label, active: true, cleanup: undefined }
      const runEffect = () => {
        if (!record.active) return
        if (typeof record.cleanup === 'function') { record.cleanup(); record.cleanup = undefined }
        record.cleanup = fn()
      }
      record.rerun = runEffect
      runEffect()
      pluginEffectRecords.push(record)
      const cleanup = () => {
        if (!record.active) return
        record.active = false
        if (typeof record.cleanup === 'function') { record.cleanup(); record.cleanup = undefined }
      }
      record.dispose = cleanup
      cleanups.push(cleanup)
      if (label === 'dsh-extra-plan-settings: same-page config surfaces') surfaceEffectRecord = record
      return cleanup
    },
  }
  moduleExports.apply(surfaceContext)

  function find(node, predicate) {
    if (node === null || node === undefined) return undefined
    if (predicate(node)) return node
    for (const child of node.children || []) {
      const found = find(child, predicate)
      if (found !== undefined) return found
    }
    return undefined
  }
  function formViewFromTree(formTree, entry) {
    return { entry, button: find(formTree, (node) => node && node.type === 'button'), tree: formTree }
  }
  function renderDetailOnce(subject) {
    const entry = registrations.find((item) => item.options.name === 'plugins.detail.section')
    if (entry === undefined) return undefined
    const section = detailRunner.render(entry.component, { subject })
    if (section === null) return null
    const settingsCard = section.type(section.props)
    const formCandidates = (settingsCard.children || []).filter((child) => child !== null && child !== undefined && typeof child.type === 'function' && child.props !== null && child.props !== undefined && Object.prototype.hasOwnProperty.call(child.props, 'configForm'))
    if (formCandidates.length !== 1) return undefined
    const formElement = formCandidates[0]
    const formTree = detailFormRunner.render(formElement.type, formElement.props)
    return formViewFromTree(formTree, entry)
  }
  function renderDetail(config = {}, subject = { kind: 'bundle', pkg: { name: 'dsh-extra-plan' } }) {
    let view
    let rounds = 0
    do {
      view = renderDetailOnce(subject)
      rounds += 1
      if (config.flush === false || (!detailRunner.dirty && !detailFormRunner.dirty) || rounds >= 12) break
    } while (true)
    return view
  }
  function detailChrome(subject = { kind: 'bundle', pkg: { name: 'dsh-extra-plan' } }) {
    const entry = registrations.find((item) => item.options.name === 'plugins.detail.section')
    if (entry === undefined) return undefined
    const section = detailRunner.render(entry.component, { subject })
    if (section === null) return null
    return { section, settingsCard: section.type(section.props) }
  }
  function rebuildSurfaces() {
    if (surfaceEffectRecord === undefined) throw new Error('surface effect not captured')
    surfaceEffectRecord.rerun()
  }
  function unmount() {
    for (const cleanup of cleanups) cleanup()
    detailRunner.unmount()
    detailFormRunner.unmount()
  }
  const result = { calls, fetchCalls, localeRegisters, configFormGets, configFormServes, slotInjectCalls, slotRegisterCalls, states, registrations, injectionDisposers, cleanups, context: surfaceContext, renderDetail, detailChrome, notify, rebuildSurfaces, unmount, renderStats, formController }
  Object.defineProperty(result, 'registrationDisposals', { get: () => registrationDisposals })
  Object.defineProperty(result, 'registerCalls', { get: () => ({ ...registerCalls }) })
  Object.defineProperty(result, 'registerDisposeCounts', { get: () => ({ ...registerDisposeCounts }) })
  Object.defineProperty(result, 'styleAppends', { get: () => styleAppends })
  Object.defineProperty(result, 'styleRemoves', { get: () => styleRemoves })
  Object.defineProperty(result, 'subscribeCount', { get: () => subscribeCount })
  Object.defineProperty(result, 'unsubscribeCount', { get: () => unsubscribeCount })
  Object.defineProperty(result, 'activeListeners', { get: () => listeners.size })
  Object.defineProperty(result, 'notificationCount', { get: () => notificationCount })
  Object.defineProperty(result, 'recoveryReadAttempts', { get: () => recoveryReadAttempts })
  return result
}
const values = { anchoredBootstrap: true, creativeMode: false, webFetch: false, toolPresentationMode: 'native', runcodeCatchGate: false, crossProviderPlannerModel: false, plannerModel: 'm', plannerPromptSuffix: 's', exploreBudget: 18, otherAgentModel: '' }
function walkTree(node, output = []) {
  if (node === null || node === undefined) return output
  if (Array.isArray(node)) { for (const child of node) walkTree(child, output); return output }
  output.push(node)
  for (const child of node.children || []) walkTree(child, output)
  return output
}
function fieldRowsOf(view) {
  return walkTree(view?.tree).filter((node) => node !== null && node !== undefined && node.type === 'label' && Array.isArray(node.children) && node.children.length >= 3).map((label) => ({
    key: label.children[0]?.children?.[0]?.children?.[0],
    control: label.children[1],
    hint: label.children[2]?.children?.[0],
  }))
}
const UI_FIELD_ORDER = ['anchoredBootstrap', 'creativeMode', 'webFetch', 'toolPresentationMode', 'runcodeCatchGate', 'crossProviderPlannerModel', 'plannerModel', 'plannerPromptSuffix', 'exploreBudget', 'otherAgentModel']
const UI_HINTS = {
  anchoredBootstrap: '首轮极简工具 + 提示词 ｜ 新会话/新子代理生效',
  creativeMode: '是否开启dsh官方创造模式 ｜ 立即生效',
  webFetch: '是否开启web_fetch ｜ 重启生效',
  toolPresentationMode: '工具呈现方式切换（默认/PTC模式），无法进行会话内切换 ｜ 重启生效',
  runcodeCatchGate: 'PTC模式下，增加每个工具调用需要try catch的闸门。通过限制+建议的模式保障仅单个调用报错 ｜ 立即生效',
  crossProviderPlannerModel: '允许跨提供方选择模型。开启时将以 其他提供方 - 主会话提供方 - deepseek官方 的顺序，获取可用模型。关闭时仅从主会话提供方获取。默认关闭 ｜ 新会话/新子代理生效',
  plannerModel: 'pro规划默认使用模型。未匹配/置空时：使用主会话模型 ｜ 新会话/新子代理生效',
  plannerPromptSuffix: '在主会话发送给pro规划的任务结尾，拼接上的内容。可能能增加pro规划的智商（未验证）。可置空 ｜ 立即生效',
  exploreBudget: '允许pro规划调用工具的次数，避免后台无限制调用。同时限制一次runcode内可调用的工具上限数 ｜ 立即生效',
  otherAgentModel: '其他子代理默认使用模型。未匹配/置空时：使用主会话模型 ｜ 新会话/新子代理生效',
}
function uiFieldContractOk(rows) {
  if (rows.length !== UI_FIELD_ORDER.length || JSON.stringify(rows.map((row) => row.key)) !== JSON.stringify(UI_FIELD_ORDER)) return false
  const booleanKeys = new Set(['anchoredBootstrap', 'creativeMode', 'webFetch', 'runcodeCatchGate', 'crossProviderPlannerModel'])
  for (const row of rows) {
    if (row.hint !== UI_HINTS[row.key]) return false
    const optionValues = (row.control?.children || []).flatMap((child) => Array.isArray(child) ? child : [child]).map((option) => option?.props?.value)
    if (booleanKeys.has(row.key)) {
      if (row.control?.type !== 'select' || JSON.stringify(optionValues) !== JSON.stringify(['true', 'false'])) return false
    } else if (row.key === 'toolPresentationMode') {
      if (row.control?.type !== 'select' || JSON.stringify(optionValues) !== JSON.stringify(['native', 'ptc'])) return false
    } else if (row.key === 'plannerPromptSuffix') {
      if (row.control?.type !== 'textarea') return false
    } else if (row.key === 'exploreBudget') {
      if (row.control?.type !== 'input' || row.control.props?.type !== 'number' || row.control.props?.min !== '1' || row.control.props?.step !== '1') return false
    } else if (row.control?.type !== 'input' || row.control.props?.type !== 'text') return false
  }
  return true
}
async function exerciseInteractiveControls(snapshot, options = {}) {
  const harness = makeClientHarness(snapshot, true, false, false, options)
  const firstView = harness.renderDetail()
  const rows = fieldRowsOf(firstView)
  const target = options.target === undefined ? { anchoredBootstrap: false, creativeMode: true, webFetch: true, toolPresentationMode: 'ptc', runcodeCatchGate: true, crossProviderPlannerModel: true, plannerModel: 'interactive-model', plannerPromptSuffix: 'changed\n"suffix\\path', exploreBudget: 27, otherAgentModel: 'child-model' } : options.target
  for (const row of rows) if (Object.prototype.hasOwnProperty.call(target, row.key)) row.control.props.onChange({ target: { value: String(target[row.key]) } })
  const changedView = harness.renderDetail()
  const button = changedView?.button
  if (button !== undefined) await button.props.onClick()
  const call = harness.calls[0]
  return { harness, rows, target, call }
}
function interactiveSaveContract(result) {
  if (result === undefined || result.call === undefined || result.harness.calls.length !== 1) return false
  const ops = result.call.ops
  const values = Object.fromEntries(ops.map((op) => [op.path[0], op.value]))
  const expectedTypes = { anchoredBootstrap: 'boolean', creativeMode: 'boolean', webFetch: 'boolean', toolPresentationMode: 'string', runcodeCatchGate: 'boolean', crossProviderPlannerModel: 'boolean', plannerModel: 'string', plannerPromptSuffix: 'string', exploreBudget: 'number', otherAgentModel: 'string' }
  const put = result.harness.fetchCalls[0]
  return result.call.revision === 42 && ops.length === 10 && new Set(ops.map((op) => op.path[0])).size === 10 && ops.every((op) => op.op === 'set') && isDeepStrictEqual(values, result.target) && Object.entries(expectedTypes).every(([key, type]) => typeof values[key] === type) && result.harness.fetchCalls.length === 1 && put.method === 'PUT' && put.url.includes('/api/dsh-extra-plan-settings/pro-config') && isDeepStrictEqual(put.body, result.target)
}
async function exerciseClient(snapshot, outcome, expectedKind, label, savingInitial = false) {
  const harness = makeClientHarness(snapshot, outcome, false, savingInitial)
  const view = harness.renderDetail()
  if (view === undefined || view.button === undefined) { check(label + ' 渲染保存按钮', false); return harness }
  await view.button.props.onClick()
  const message = harness.states.find((state) => state.value !== null && typeof state.value === 'object' && state.value.kind !== undefined)
  const gotKind = message === undefined ? '' : message.value.kind
  check(label + ' 提示状态正确', gotKind === expectedKind)
  return harness
}
const readySnapshot = { status: 'ready', writable: true, revision: 42, value: values }
const interactive = await exerciseInteractiveControls(readySnapshot)
const interactiveOps = interactive.call === undefined ? [] : interactive.call.ops
const interactiveValues = Object.fromEntries(interactiveOps.map((op) => [op.path[0], op.value]))
check('V05 实际渲染十控件顺序/控件类型/选项/min-step/hint', uiFieldContractOk(interactive.rows))
check('V05 点选十控件后一次 mutate 带全十键、revision42 与正确类型', interactive.call !== undefined && interactive.call.revision === 42 && interactiveOps.length === 10 && new Set(interactiveOps.map((op) => op.path[0])).size === 10 && isDeepStrictEqual(interactiveValues, interactive.target) && typeof interactiveValues.anchoredBootstrap === 'boolean' && typeof interactiveValues.creativeMode === 'boolean' && typeof interactiveValues.webFetch === 'boolean' && typeof interactiveValues.toolPresentationMode === 'string' && typeof interactiveValues.runcodeCatchGate === 'boolean' && typeof interactiveValues.crossProviderPlannerModel === 'boolean' && typeof interactiveValues.plannerModel === 'string' && typeof interactiveValues.plannerPromptSuffix === 'string' && typeof interactiveValues.exploreBudget === 'number' && typeof interactiveValues.otherAgentModel === 'string')
const commentClientText = clientText.replace('function ExtraPlanForm(props) {', '// equivalent comment variant\n      function ExtraPlanForm(props) {')
const newlineClientText = clientText.replace('const ALL_FIELDS = Object.freeze(EXTRA_FIELDS.concat(HOST_ROW_FIELDS));', 'const ALL_FIELDS = Object.freeze(\n      EXTRA_FIELDS.concat(HOST_ROW_FIELDS)\n    );')
const renamedClientText = clientText.replace('function ExtraPlanForm(props)', 'function RenamedSettingsForm(props)').replace('el(ExtraPlanForm, { configForm: props.configForm })', 'el(RenamedSettingsForm, { configForm: props.configForm })')
const commentInteractive = await exerciseInteractiveControls(readySnapshot, { clientSourceText: commentClientText, target: { anchoredBootstrap: true, creativeMode: true, webFetch: false, toolPresentationMode: 'native', runcodeCatchGate: false, crossProviderPlannerModel: true, plannerModel: 'comment-model', plannerPromptSuffix: 'comment\n"suffix\\path', exploreBudget: 31, otherAgentModel: 'comment-child' } })
const newlineInteractive = await exerciseInteractiveControls(readySnapshot, { clientSourceText: newlineClientText, target: { anchoredBootstrap: false, creativeMode: false, webFetch: true, toolPresentationMode: 'ptc', runcodeCatchGate: true, crossProviderPlannerModel: false, plannerModel: 'newline-model', plannerPromptSuffix: 'newline\n"suffix\\path', exploreBudget: 32, otherAgentModel: 'newline-child' } })
const renamedInteractive = await exerciseInteractiveControls(readySnapshot, { clientSourceText: renamedClientText, target: { anchoredBootstrap: true, creativeMode: false, webFetch: true, toolPresentationMode: 'ptc', runcodeCatchGate: false, crossProviderPlannerModel: true, plannerModel: 'renamed-model', plannerPromptSuffix: 'renamed\n"suffix\\path', exploreBudget: 33, otherAgentModel: 'renamed-child' } })
check('V05 注释等价内存变体真实十键交互/保存/revision/mutate/PUT', commentClientText !== clientText && interactiveSaveContract(commentInteractive))
check('V05 等价换行内存变体真实十键交互/保存/revision/mutate/PUT', newlineClientText !== clientText && interactiveSaveContract(newlineInteractive))
check('V05 等价私有表单函数改名内存变体真实十键交互/保存/revision/mutate/PUT', renamedClientText !== clientText && interactiveSaveContract(renamedInteractive))
const missingPtcText = clientText.replace('{"key":"toolPresentationMode","control":"select","options":["native","ptc"]', '{"key":"toolPresentationMode","control":"select","options":["native"]')
const missingPtcClient = makeClientHarness(readySnapshot, true, false, false, { clientSourceText: missingPtcText })
const missingPtcRows = fieldRowsOf(missingPtcClient.renderDetail())
const missingPtcOptions = (missingPtcRows.find((row) => row.key === 'toolPresentationMode')?.control?.children || []).flatMap((child) => Array.isArray(child) ? child : [child]).map((option) => option?.props?.value)
const missingPtcDetected = missingPtcOptions.join('|') !== 'native|ptc'
check('V05 错误变体漏 ptc 选项被独立观察识别', missingPtcText !== clientText && missingPtcDetected)
const missingSaveKeyText = clientText.replace('const ALL_FIELDS = Object.freeze(EXTRA_FIELDS.concat(HOST_ROW_FIELDS));', 'const ALL_FIELDS = Object.freeze(EXTRA_FIELDS.slice(0, -1).concat(HOST_ROW_FIELDS));')
const missingSaveKeyClient = makeClientHarness(readySnapshot, true, false, false, { clientSourceText: missingSaveKeyText })
const missingSaveView = missingSaveKeyClient.renderDetail()
if (missingSaveView?.button !== undefined) await missingSaveView.button.props.onClick()
check('V05 错误变体漏保存键被独立观察识别', missingSaveKeyText !== clientText && missingSaveKeyClient.calls.length === 1 && missingSaveKeyClient.calls[0].ops.length !== 10)
const successClient = await exerciseClient(readySnapshot, true, 'ok', 'V05 实际 lazy client 成功保存')
check('V05 成功保存恰一次十项 mutate、revision正确、每键一条 set op', successClient.calls.length === 1 && successClient.calls[0].revision === 42 && successClient.calls[0].ops.length === 10 && new Set(successClient.calls[0].ops.map((op) => op.path[0])).size === 10 && successClient.calls[0].ops.every((op) => op.op === 'set'))
await exerciseClient(readySnapshot, false, 'error', 'V05 mutate=false 不显示保存成功')
await exerciseClient(readySnapshot, 'throw', 'error', 'V05 mutate抛错不显示保存成功')
const clientPutAccepted = makeClientHarness(readySnapshot, true, false, false, { fetchBehavior: 'synced' })
const acceptedPutView = clientPutAccepted.renderDetail()
if (acceptedPutView === undefined || acceptedPutView.button === undefined) {
  check('UI双步保存 accepted 渲染保存按钮', false)
} else {
  await acceptedPutView.button.props.onClick()
  check('UI双步保存第二步恰一次同源 PUT /api/dsh-extra-plan-settings/pro-config 且 body 为十项 draft 值', clientPutAccepted.fetchCalls.length === 1 && clientPutAccepted.fetchCalls[0].method === 'PUT' && clientPutAccepted.fetchCalls[0].url.includes('/api/dsh-extra-plan-settings/pro-config') && clientPutAccepted.fetchCalls[0].body !== undefined && JSON.stringify(Object.keys(clientPutAccepted.fetchCalls[0].body).sort()) === JSON.stringify([...keys].sort()) && isDeepStrictEqual(clientPutAccepted.fetchCalls[0].body, values))
  check('UI双步保存 mutate 仍恰一次十项且失败路径不变', clientPutAccepted.calls.length === 1 && clientPutAccepted.calls[0].ops.length === 10)
  check('UI双步保存 mutate accepted → PUT 被调用（fetch mock 断言）且提示 saved', clientPutAccepted.fetchCalls.length === 1 && messageKind(clientPutAccepted) === 'ok' && messageText(clientPutAccepted) === 'saved')
}
const clientPutRejected = makeClientHarness(readySnapshot, false)
const rejectedPutView = clientPutRejected.renderDetail()
if (rejectedPutView !== undefined && rejectedPutView.button !== undefined) await rejectedPutView.button.props.onClick()
check('UI双步保存 mutate 失败（false）→ 无 PUT 且提示 savedPartial', clientPutRejected.fetchCalls.length === 0 && messageKind(clientPutRejected) === 'error' && messageText(clientPutRejected) === 'savedPartial')
const clientPutThrown = makeClientHarness(readySnapshot, 'throw')
const thrownPutView = clientPutThrown.renderDetail()
if (thrownPutView !== undefined && thrownPutView.button !== undefined) await thrownPutView.button.props.onClick()
check('UI双步保存 mutate 抛错 → 无 PUT 且提示 savedPartial', clientPutThrown.fetchCalls.length === 0 && messageKind(clientPutThrown) === 'error' && messageText(clientPutThrown) === 'savedPartial')
const clientPutNetwork = makeClientHarness(readySnapshot, true, false, false, { fetchBehavior: 'network' })
const networkPutView = clientPutNetwork.renderDetail()
if (networkPutView !== undefined && networkPutView.button !== undefined) await networkPutView.button.props.onClick()
check('UI双步保存 PUT 网络失败静默吞异常且提示仍 saved', clientPutNetwork.fetchCalls.length === 1 && messageKind(clientPutNetwork) === 'ok' && messageText(clientPutNetwork) === 'saved')
const readOnly = makeClientHarness({ ...readySnapshot, writable: false }, true)
const readOnlyView = readOnly.renderDetail()
if (readOnlyView !== undefined && readOnlyView.button !== undefined) await readOnlyView.button.props.onClick()
check('V05 readonly 实际按钮禁用且不调用 mutate', readOnlyView !== undefined && readOnlyView.button.props.disabled === true && readOnly.calls.length === 0)
const unavailable = makeClientHarness({ ...readySnapshot, status: 'unavailable' }, true)
const unavailableView = unavailable.renderDetail()
check('V05 draft/status 不可用实际不渲染可提交按钮', unavailableView !== undefined && unavailableView.button === undefined && unavailable.calls.length === 0)
const saving = makeClientHarness(readySnapshot, true, false, true)
const savingView = saving.renderDetail()
if (savingView !== undefined && savingView.button !== undefined) await savingView.button.props.onClick()
check('V05 正在保存按钮禁用且 mutate为零', savingView !== undefined && savingView.button.props.disabled === true && saving.calls.length === 0)
const updatedValues = { ...values, plannerModel: 'new-model', exploreBudget: 43 }
const snapshot43 = { status: 'ready', writable: true, revision: 43, value: updatedValues }
function messageKind(harness) {
  const message = [...harness.states].reverse().find((state) => state.value !== null && typeof state.value === 'object' && state.value.kind !== undefined)
  return message === undefined ? '' : message.value.kind
}
function messageText(harness) {
  const message = [...harness.states].reverse().find((state) => state.value !== null && typeof state.value === 'object' && state.value.kind !== undefined)
  return message === undefined ? '' : message.value.text
}
function opValues(call) {
  return Object.fromEntries((call === undefined ? [] : call.ops).map((op) => [op.path[0], op.value]))
}
const latestClient = makeClientHarness(readySnapshot, true)
const firstPass = latestClient.renderDetail({ flush: false })
const stable42View = latestClient.renderDetail()
latestClient.notify(snapshot43)
const stable43View = latestClient.renderDetail()
if (stable43View !== undefined && stable43View.button !== undefined) await stable43View.button.props.onClick()
latestClient.renderDetail()
const latestCall = latestClient.calls.at(-1)
check('V05 Q04 初次draft=null先effect后重render，通知后读取rev43新十键', firstPass !== undefined && firstPass.button === undefined && stable42View !== undefined && stable42View.button !== undefined && stable43View !== undefined && stable43View.button !== undefined && latestClient.subscribeCount === 1 && latestClient.notificationCount === 1 && latestClient.activeListeners === 1 && latestClient.renderStats.formRenders >= 3 && latestClient.renderStats.effectRuns >= 3 && latestCall !== undefined && latestCall.revision === 43 && latestCall.ops.length === 10 && isDeepStrictEqual(opValues(latestCall), updatedValues))

const staleClient = makeClientHarness(readySnapshot, true)
const stale42View = staleClient.renderDetail()
const staleButton = stale42View.button
staleClient.notify(snapshot43)
staleClient.renderDetail()
await staleButton.props.onClick()
staleClient.renderDetail()
const conflictKind = messageKind(staleClient)
const conflictCall = staleClient.calls[0]
check('V05 Q04 旧回调携rev42被当前rev43拒绝并恢复新快照，错误而非Saved', staleClient.calls.length === 1 && conflictCall.revision === 42 && conflictKind === 'error' && staleClient.notificationCount === 2 && staleClient.activeListeners === 1)
const fresh43View = staleClient.renderDetail()
await fresh43View.button.props.onClick()
staleClient.renderDetail()
const accepted43 = staleClient.calls.at(-1)
check('V05 Q04 恢复后新回调用rev43成功且仍仅一条十键mutate', staleClient.calls.length === 2 && accepted43.revision === 43 && accepted43.ops.length === 10 && isDeepStrictEqual(opValues(accepted43), updatedValues) && messageKind(staleClient) === 'ok')

const recoveryFailureClient = makeClientHarness(readySnapshot, true, false, false, { recoveryFailure: true })
const recoveryOldButton = recoveryFailureClient.renderDetail().button
recoveryFailureClient.notify(snapshot43)
recoveryFailureClient.renderDetail()
await recoveryOldButton.props.onClick()
recoveryFailureClient.renderDetail()
check('V05 Q04 独立恢复读取失败显示错误、无Saved且不新增第二条持久写', recoveryFailureClient.calls.length === 1 && recoveryFailureClient.calls[0].revision === 42 && recoveryFailureClient.recoveryReadAttempts === 1 && messageKind(recoveryFailureClient) === 'error')
latestClient.unmount()
staleClient.unmount()
recoveryFailureClient.unmount()

const surface = makeClientHarness(readySnapshot)
const surfaceView = surface.renderDetail()
check('V05 Q05 初始仅注册 detail.section 一份且表单可交互', surfaceView !== undefined && surfaceView.button !== undefined && surface.registerCalls['plugins.detail.section'] === 1 && surface.registerCalls['plugins.bundle.config'] === undefined && surface.registrations.length === 1)
const localeRegistration = surface.localeRegisters.find((item) => item.namespace === 'dsh-extra-plan-settings')
check('V03/V05 locale.register 与 ConfigForms/slot 实际 trace 输入正确', localeRegistration !== undefined && localeRegistration.dictionaries.zh.cardTitle === '按需规划模式全局管理' && localeRegistration.dictionaries.zh.trueValue === '开启' && localeRegistration.dictionaries.en.cardTitle === 'Extra Plan Global Manager' && localeRegistration.dictionaries.en.trueValue === 'True' && surface.configFormGets.includes('dsh-extra-plan-settings') && surface.configFormServes.some((names) => names.length === 1 && names[0] === 'dsh-extra-plan-settings') && surface.slotInjectCalls.includes('plugins.detail.section') && surface.slotRegisterCalls.some((item) => item.name === 'plugins.detail.section' && item.id === 'dsh-extra-plan-settings-global'))
check('V05 Q05 detail 表单自绘区块标题、描述与定位属性', (() => { const chrome = surface.detailChrome(); return chrome !== null && chrome !== undefined && chrome.settingsCard.type === 'section' && chrome.settingsCard.props['data-plugin-section'] === 'dsh-extra-plan-settings-global' && chrome.settingsCard.children[0].type === 'h4' && chrome.settingsCard.children[0].children[0] === 'cardTitle' && chrome.settingsCard.children[1].type === 'p' && chrome.settingsCard.children[1].children[0] === 'cardDescription' })())
check('V05 Q05 其他包详情为空', surface.renderDetail({}, { kind: 'bundle', pkg: { name: '@other/package' } }) === null)
const thirdPartyOff = surface.context.slots.register({ name: 'plugins.bundle.config', key: 'dsh-extra-plan', locale: 'third-party', inject: () => ({}) }, () => null)
const shadowed = surface.renderDetail()
check('V05 Q05 本包 bundle.config 槽被第三方注册时 detail.section 让位', shadowed === null)
thirdPartyOff()
const restored = surface.renderDetail()
check('V05 Q05 第三方条目移除后 detail.section 恢复唯一表单', restored !== undefined && restored !== null && restored.button !== undefined)
surface.rebuildSurfaces()
const rebuiltView = surface.renderDetail()
check('V05 Q05 effect 重建后仍仅一份 detail.section 注册且表单可见', rebuiltView !== undefined && rebuiltView.button !== undefined && surface.registerCalls['plugins.detail.section'] === 2 && surface.registrations.length === 1)
const failedSurface = makeClientHarness(readySnapshot, true, true)
const failedOther = failedSurface.renderDetail({}, { kind: 'bundle', pkg: { name: '@other/package' } })
check('V05 Q05 detail.section 注册失败时零注册、不崩溃且渲染为空', failedSurface.context.detailRegisterError !== undefined && failedSurface.registerCalls['plugins.detail.section'] === undefined && failedSurface.registrations.length === 0 && failedSurface.renderDetail() === undefined && failedOther === undefined)

const lifecycle = makeClientHarness(readySnapshot)
lifecycle.renderDetail()
const rendersBeforeUnmount = lifecycle.renderStats.detailRenders + lifecycle.renderStats.formRenders
lifecycle.unmount()
const lifecycleCounts = { disposals: lifecycle.registrationDisposals, styleRemoves: lifecycle.styleRemoves, unsubscribes: lifecycle.unsubscribeCount }
lifecycle.unmount()
lifecycle.notify(snapshot43)
const rendersAfterNotify = lifecycle.renderStats.detailRenders + lifecycle.renderStats.formRenders
check('V05 Q05 卸载精确释放registration=1/style=1/listener=0且旧通知不setState', lifecycle.activeListeners === 0 && lifecycle.unsubscribeCount === 1 && lifecycleCounts.disposals === 1 && lifecycle.registerDisposeCounts['plugins.detail.section'] === 1 && lifecycle.styleRemoves === 1 && rendersAfterNotify === rendersBeforeUnmount && lifecycle.renderStats.postUnmountSetState === 0 && lifecycle.notificationCount === 1)
check('V05 Q05 重复dispose不增加任何释放计数', lifecycle.registrationDisposals === lifecycleCounts.disposals && lifecycle.styleRemoves === lifecycleCounts.styleRemoves && lifecycle.unsubscribeCount === lifecycleCounts.unsubscribes)
surface.unmount()
failedSurface.unmount()

restoreEnvironment(testEnvironment)
for (const key of settingsEnvKeys) {
  const value = originalBootstrapEnv[key]
  if (value === undefined) delete process.env[key]
  else process.env[key] = value
}
check('ENV DSH_HOME/DSH_PROFILE/USERPROFILE/HOME 精确恢复原先不存在/原值状态', TEST_ENV_KEYS.every((key) => process.env[key] === testEnvironment[key]))
settingsBootstrapFixture.cleanup()
output.summary(pass, fail)
process.exit(fail === 0 ? 0 : 1)
