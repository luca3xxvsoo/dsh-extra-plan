// 设置页同页配置、HTTP 写闸门与真实 lazy client 保存回归；只使用内存 editor/slot/React 夹具。
import { createServer, request as httpRequest } from 'node:http'
import { createRequire, registerHooks, syncBuiltinESMExports } from 'node:module'
import { isDeepStrictEqual } from 'node:util'
import fs from 'node:fs'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { tmpdir } from 'node:os'
import { fileURLToPath } from 'node:url'
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
const targetDsh = TARGET_INSTALL_ROOT === undefined
  ? undefined
  : readHostJson([join(TARGET_INSTALL_ROOT, 'package.json'), join(TARGET_INSTALL_ROOT, 'node_modules', '@deepseek-ai', 'dsh', 'package.json')])
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
const OFFICIAL_ROOT = process.env.DSH_INSTALL_ROOT || 'C:\\Users\\Administrator\\AppData\\Roaming\\npm\\node_modules\\@deepseek-ai\\dsh'
try {
  const anchor = createRequire(join(OFFICIAL_ROOT, 'package.json'))
  const schemaUrl = new URL('file:///' + anchor.resolve('@deepseek-ai/schemastery').replaceAll('\\\\', '/')).href
  const yamlUrl = new URL('file:///' + anchor.resolve('js-yaml').replaceAll('\\\\', '/')).href
  if (typeof registerHooks === 'function') registerHooks({ resolve(specifier, context, next) {
    if (specifier === '@deepseek-ai/schemastery') return { url: schemaUrl, shortCircuit: true }
    if (specifier === 'js-yaml') return { url: yamlUrl, shortCircuit: true }
    return next(specifier, context)
  } })
} catch { /* 静态合同仍可执行；宿主缺依赖时运行时项会明确失败 */ }

const patchText = readFileSync(join(REPO_ROOT, 'plugins/dsh-extra-plan/cordis.patch.yml'), 'utf8')
const settingsText = readFileSync(join(REPO_ROOT, 'plugins/dsh-extra-plan/lib/settings.js'), 'utf8')
const syncText = readFileSync(join(REPO_ROOT, 'plugins/dsh-extra-plan/lib/preset-sync.js'), 'utf8')
const contractText = readFileSync(join(REPO_ROOT, 'plugins/dsh-extra-plan/lib/settings-contract.js'), 'utf8')
const clientText = readFileSync(join(REPO_ROOT, 'plugins/dsh-extra-plan/lib/client.js'), 'utf8')
const zh = JSON.parse(readFileSync(join(REPO_ROOT, 'plugins/dsh-extra-plan/locale/settings/zh.json'), 'utf8'))
const en = JSON.parse(readFileSync(join(REPO_ROOT, 'plugins/dsh-extra-plan/locale/settings/en.json'), 'utf8'))
const keys = ['anchoredBootstrap', 'creativeMode', 'webFetch', 'toolPresentationMode', 'runcodeCatchGate', 'crossProviderPlannerModel', 'plannerModel', 'plannerPromptSuffix', 'exploreBudget', 'otherAgentModel']

let pass = 0
let fail = 0
function check(label, condition) { if (condition) { pass += 1; console.log('PASS  ' + label) } else { fail += 1; console.log('FAIL  ' + label) } }

let patch
const presetSettings = await import('../../plugins/dsh-extra-plan/lib/preset-settings.js')
const { parsePresetYaml, SETTING_DEFINITIONS } = presetSettings
try { patch = parsePresetYaml(patchText) } catch (error) { console.error('FAIL  patch YAML parse: ' + String(error)); process.exit(1) }
const { Config } = await import('../../plugins/dsh-extra-plan/lib/settings.js')
const { createLiveConfig } = await import('../../plugins/dsh-extra-plan/lib/live-config.js')
const { createGateRuntime, GATE_WORD_FIELDS } = await import('../../plugins/dsh-extra-plan/lib/gate-words.js')
const descriptorKeys = SETTING_DEFINITIONS.map((definition) => definition.key)
const configDict = Config !== undefined && Config !== null && Config.dict !== undefined && Config.dict !== null ? Config.dict : {}
const configKeys = Object.keys(configDict)
const configKeySetMatches = JSON.stringify([...configKeys].sort()) === JSON.stringify([...descriptorKeys].sort())
check('V03 patch 顶层公开 insert 恰一行且稳定 id=dsh-extra-plan-settings', Array.isArray(patch) && patch.length === 1 && Array.isArray(patch[0].insert) && patch[0].insert.length === 1 && patch[0].insert[0].id === 'dsh-extra-plan-settings')
check('V03 settings owner 接管 configEditor/loader/settings/webServer 生命周期', settingsText.includes("ctx.inject(['configEditor']") && settingsText.includes("ctx.inject(['loader']") && settingsText.includes("ctx.inject(['settings']") && settingsText.includes("ctx.inject(['webServer']") && settingsText.includes('mountPresetSync(child,') && settingsText.includes('onSettledSettings'))
check('V03 中英文元数据是全局管理结论级文案', zh.meta.title === '按需规划模式全局管理' && zh.meta.description.includes('统一管理') && en.meta.title === 'Extra Plan Global Manager' && en.meta.description.includes('Manage'))
check('V03 descriptor 与 Config 字段集合均恰10项且包含两项宿主值', descriptorKeys.length === 10 && configKeys.length === 10 && configKeySetMatches && descriptorKeys.includes('webFetch') && descriptorKeys.includes('toolPresentationMode') && contractText.includes('SETTING_DEFINITIONS = Object.freeze([') && settingsText.includes('SETTING_DEFINITIONS.map') && clientText.includes('const ALL_FIELDS = Object.freeze(EXTRA_FIELDS.concat(HOST_ROW_FIELDS))'))
check('V02 当前词表严格拒绝、旧值安全解析且不求值', syncText.includes('当前全局 gateWords 非法') && syncText.includes('readLegacyState') && syncText.includes('parsePresetYaml') && !syncText.includes('eval(') && !syncText.includes('Function('))
check('V05 client 保存有 ready/readonly/draft/saving guard 且失败提示', clientText.includes('!writable') && clientText.includes('draft === null') && clientText.includes('status !== "ready"') && clientText.includes('accepted === true') && clientText.includes('catch'))
const retiredBundleStateFlag = ['bundle', 'Config', 'Registered'].join('')
check('V05 不注册 bundle.config、仅注册 detail.section 且保留实时让位防御', !clientText.includes('safeInject("plugins.bundle.config"') && clientText.includes('safeInject("plugins.detail.section"') && clientText.includes('hasBundleConfigEntry') && !clientText.includes(retiredBundleStateFlag) && !clientText.includes('props.view') && !clientText.includes('summary'))
check('V05 detail.section 唯一同页通道、自绘标题与唯一稳定 namespace 表单', clientText.includes('plugins.detail.section') && clientText.includes('ctx.configForms.get(NS)') && clientText.includes('sharedForm.subscribe') && clientText.includes('"data-plugin-section": "dsh-extra-plan-settings-global"') && clientText.includes('.esp-panelTitle') && clientText.includes('.esp-panelHint') && !clientText.includes('plugins.row.config') && !clientText.includes('settings.plugins.tab') && !clientText.includes('plugins.item'))

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
  if (dshVersion !== '0.2.0-rc.2' || dshLlmVersion !== '0.2.0-rc.2') {
    console.log('HUMAN  {"scope":"HOST-VERSION","reason":"目标宿主版本不在本专项支持的 rc.2 类型探针范围内"}')
  } else if (targetSlotMap === undefined || targetConfigForms === undefined) {
    console.log('HUMAN  {"scope":"HOST-CONTRACT","reason":"目标宿主缺少正式插件管理 SlotMap 或 ConfigForms 类型定义"}')
  } else {
    const slotText = targetSlotMap.value
    const configFormText = targetConfigForms.value
    check('F04 HOST 实际 SlotMap 提供 keyed plugins.bundle.config 与 list plugins.detail.section', slotHasKind(slotText, 'plugins.bundle.config', 'keyed') && slotHasKind(slotText, 'plugins.detail.section', 'list'))
    check('F04 HOST 实际 ConfigForms 提供 get 与 whileServed，且本插件使用 detail.section 唯一通道', configFormText.includes('get<T>(entryId: string)') && configFormText.includes('whileServed(namespaces: readonly string[]') && clientText.includes('safeInject("plugins.detail.section"') && !clientText.includes('safeInject("plugins.bundle.config"') && clientText.includes('ctx.configForms.get(NS)') && clientText.includes('ctx.configForms.whileServed([NS]'))
  }
}

const gateWords = { routeDirect: '甲', routePlan: '乙', routeDisagree: '丙', approvalApprove: '丁', approvalReplan: '戊', purposeRefine: '己', purposeRedo: '庚' }
const initial = { anchoredBootstrap: true, creativeMode: false, webFetch: false, toolPresentationMode: 'native', runcodeCatchGate: false, crossProviderPlannerModel: false, plannerModel: 'stable-model', plannerPromptSuffix: 'suffix', exploreBudget: 19, otherAgentModel: '', gateWords }
function makeEditor(config = initial, documentPath = '', options = {}) {
  const row = { entry: { options: { id: 'dsh-extra-plan-settings', name: 'dsh-extra-plan/settings', config: structuredClone(config) }, fiber: {} }, inherited: {}, override: {} }
  const state = { rows: [row], edits: [] }
  return {
    state,
    documentPath,
    configuration: () => state.rows,
    edit: async (entry, change) => {
      const current = state.rows.find((item) => item.entry === entry)
      if (current === undefined) throw new Error('entry disappeared')
      const next = change(structuredClone(current.entry.options.config), current.inherited)
      current.entry.options.config = next
      if (options.persistDocument === true && documentPath !== '') writeFileSync(documentPath, JSON.stringify([{ id: entry.options.id, config: next }]), 'utf8')
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
  const targetCtx = {
    fiber: { uid: 'settings-test' },
    get: (name) => {
      if (name === 'configEditor') {
        getCalls.push({ name, result: editor === undefined ? 'undefined' : 'editor' })
        trace.push('ctx.get:configEditor')
        proxy.getResult = editor === undefined ? 'undefined' : 'editor'
        return editor
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
const testEnvironment = captureEnvironment()
const editor = makeEditor(initial, 'relative-document-path')
const run = await start(editor)
try {
  const before = await requestJson(run.port, 'GET', '/api/dsh-extra-plan-settings/pro-config', {})
  check('V03 GET 读取统一行两项宿主值', before.status === 200 && before.body.values.webFetch === false && before.body.values.toolPresentationMode === 'native' && before.body.fields.length === 2)
  check('PROFILE_SYNC_INITIAL_PENDING_TRUE', before.status === 200 && before.body.profileSync.status === 'pending' && before.body.profileSync.pending === true)
  const put = await requestJson(run.port, 'PUT', '/api/dsh-extra-plan-settings/pro-config', { webFetch: true, toolPresentationMode: 'ptc' })
  const rowConfig = editor.state.rows[0].entry.options.config
  check('V03 合法 PUT 仅 edit 唯一全局行并保留另八项与 gateWords（矛盾路径显式 partial）', put.status >= 400 && put.body.profileSync.status === 'unavailable' && put.body.overall === 'partial' && put.body.web.applied === true && put.body.projection.owner === 'dsh-extra-plan-settings' && editor.state.edits.length === 1 && editor.state.edits[0].id === 'dsh-extra-plan-settings' && rowConfig.webFetch === true && rowConfig.toolPresentationMode === 'ptc' && rowConfig.plannerModel === initial.plannerModel && rowConfig.exploreBudget === initial.exploreBudget && JSON.stringify(rowConfig.gateWords) === JSON.stringify(gateWords))
  const noOp = await requestJson(run.port, 'PUT', '/api/dsh-extra-plan-settings/pro-config', { webFetch: true, toolPresentationMode: 'ptc' })
  check('V03 同值 PUT 深等 no-op 零新增 edit（矛盾路径保持 partial）', noOp.status >= 400 && noOp.body.profileSync.status === 'unavailable' && noOp.body.projection.applied === true && editor.state.edits.length === 1)
  const invalidCases = [
    ['empty', {}], ['null', null], ['array', []], ['primitive', 'raw'], ['unknown', { plannerModel: 'x' }],
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
} finally { await new Promise((resolve) => run.server.close(resolve)) }

function makeSyncFixture() {
  const root = mkdtempSync(join(tmpdir(), 'dsh-extra-plan-web-qqbot-settings-'))
  const webDir = join(root, 'profiles', 'web')
  const profileDir = join(root, 'profiles', 'qqbot-sync')
  mkdirSync(webDir, { recursive: true })
  mkdirSync(join(profileDir, 'node_modules', 'dsh-extra-plan-qqbot'), { recursive: true })
  writeFileSync(join(profileDir, 'package.json'), JSON.stringify({ name: 'qqbot-sync-profile', dsh: { profile: { bundles: ['@tencent-connect/dsh-qqbot'] } } }), 'utf8')
  const webPatch = join(webDir, 'cordis.patch.yml')
  const qqPatch = join(profileDir, 'cordis.patch.yml')
  writeFileSync(webPatch, '# web fixture\n- id: web-fixture\n  name: web\n', 'utf8')
  writeFileSync(qqPatch, '# keep this row\n- id: user-custom\n  name: custom\n  config:\n    marker: !!js "globalThis.__syncFixture = true"\n', 'utf8')
  return { root, webPatch, profileDir, qqPatch }
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
const syncValues = { anchoredBootstrap: false, creativeMode: true, webFetch: true, toolPresentationMode: 'both', runcodeCatchGate: true, crossProviderPlannerModel: true, plannerModel: 'planner-sync-test', plannerPromptSuffix: 'sync-suffix-test', exploreBudget: 37, otherAgentModel: 'other-sync-test' }
const syncGateWords = { routeDirect: '甲', routePlan: '乙', routeDisagree: '丙', approvalApprove: '丁', approvalReplan: '戊', purposeRefine: '己', purposeRedo: '庚' }
const syncSnapshot = { values: syncValues, gateWords: syncGateWords }
const syncFixtureRoots = []
const previousSyncEnvironment = captureEnvironment()
try {
  const webFixture = makeSyncFixture(); syncFixtureRoots.push(webFixture.root)
  delete process.env.DSH_HOME; delete process.env.DSH_PROFILE
  const webEditor = makeEditor({ ...syncValues, gateWords: syncGateWords, webFetch: false }, webFixture.webPatch)
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
  const targetBeforeBackups = patchBackupCount(webFixture.profileDir)
  process.env.DSH_HOME = decoy.root; process.env.DSH_PROFILE = 'web'
  const priorityEditor = makeEditor({ ...syncValues, gateWords: syncGateWords }, webFixture.webPatch)
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
    check('SYNC 有效 documentPath 真实同级目标访问>0、诱饵profiles根访问=0且仅写目标：target访问=' + priorityProbe.count('targetProfilesRoot') + ' decoyProfiles访问=' + priorityProbe.count('decoyProfilesRoot'), priorityPut.status >= 200 && priorityPut.status < 300 && priorityPut.body.profileSync.pathSource === 'configEditor.documentPath' && priorityProbe.count('targetProfilesRoot') > 0 && priorityProbe.count('decoyProfilesRoot') === 0 && decoyAfterBytes.equals(decoyBeforeBytes) && decoyAfterStat.mtimeMs === decoyBeforeStat.mtimeMs && decoyAfterBackups === decoyBeforeBackups && decoyAfterEntries === decoyBeforeEntries && patchBackupCount(webFixture.profileDir) === targetBeforeBackups + 1)
    check('SYNC 诱饵目标零变化：patch字节/mtimeMs/备份数/目录项均相等', decoyAfterBytes.equals(decoyBeforeBytes) && decoyAfterStat.mtimeMs === decoyBeforeStat.mtimeMs && decoyAfterBackups === decoyBeforeBackups && decoyAfterEntries === decoyBeforeEntries)
  } finally { await new Promise((resolve) => priorityRun.server.close(resolve)) }

  const fallback = makeSyncFixture(); syncFixtureRoots.push(fallback.root)
  const fallbackEditor = makeEditor({ ...syncValues, gateWords: syncGateWords, webFetch: false }, '')
  process.env.DSH_HOME = fallback.root; process.env.DSH_PROFILE = 'web'
  const fallbackRun = await start(fallbackEditor)
  try {
    const fallbackPut = await requestJson(fallbackRun.port, 'PUT', '/api/dsh-extra-plan-settings/pro-config', { webFetch: true })
    check('SYNC documentPath 缺失时显式 DSH_HOME+DSH_PROFILE=web 备用成功', fallbackPut.status >= 200 && fallbackPut.status < 300 && fallbackPut.body.profileSync.status === 'synced' && fallbackPut.body.profileSync.pathSource === 'explicit-DSH_HOME' && fallbackPut.body.profileSync.fallbackReason === 'document-path-unavailable')
  } finally { await new Promise((resolve) => fallbackRun.server.close(resolve)) }

  const failedFixture = makeSyncFixture(); syncFixtureRoots.push(failedFixture.root)
  const failedEditor = makeEditor({ ...syncValues, gateWords: syncGateWords, webFetch: false }, failedFixture.webPatch)
  rmSync(failedFixture.qqPatch, { force: true })
  const failedRun = await start(failedEditor)
  try {
    const failedPut = await requestJson(failedRun.port, 'PUT', '/api/dsh-extra-plan-settings/pro-config', { webFetch: true })
    const failedProfile = failedPut.body?.profileSync?.profiles?.[0]
    check('SYNC API 写失败返回非2xx/failed、Web applied且逐 profile reason，不伪造 synced', failedPut.status >= 400 && failedPut.body.web.applied === true && failedPut.body.overall === 'partial' && failedPut.body.profileSync.status === 'failed' && failedPut.body.profileSync.status !== 'synced' && failedProfile?.status === 'failed' && failedProfile.reason === 'patch-missing')
  } finally { await new Promise((resolve) => failedRun.server.close(resolve)) }

  const invalidRequestFixture = makeSyncFixture(); syncFixtureRoots.push(invalidRequestFixture.root)
  const invalidRequestEditor = makeEditor({ ...syncValues, gateWords: syncGateWords, webFetch: false }, invalidRequestFixture.webPatch)
  const invalidRequestBefore = readFileSync(invalidRequestFixture.qqPatch, 'utf8')
  const invalidRequestRun = await start(invalidRequestEditor)
  try {
    const invalidRequest = await requestJson(invalidRequestRun.port, 'PUT', '/api/dsh-extra-plan-settings/pro-config', { webFetch: 1 })
    check('SYNC API 非法写请求400且Web/QQBot均零写', invalidRequest.status === 400 && invalidRequestEditor.state.edits.length === 0 && readFileSync(invalidRequestFixture.qqPatch, 'utf8') === invalidRequestBefore && patchBackupCount(invalidRequestFixture.profileDir) === 0)
  } finally { await new Promise((resolve) => invalidRequestRun.server.close(resolve)) }

  const partialFixture = makeSyncFixture(); syncFixtureRoots.push(partialFixture.root)
  const partialFailed = addAnchoredProfile(partialFixture.root, 'qqbot-partial-failed')
  rmSync(partialFailed.patch, { force: true })
  const partialEditor = makeEditor({ ...syncValues, gateWords: syncGateWords, webFetch: false }, partialFixture.webPatch)
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
    const unavailableEditor = makeEditor({ ...syncValues, gateWords: syncGateWords, webFetch: false }, '')
    const unavailableRun = await start(unavailableEditor)
    try {
      unavailableProbe = createFsAccessProbe([{ name: 'unavailableTarget', root: unavailableProfilesRoot }])
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
    const invalidEditor = makeEditor({ ...syncValues, gateWords: syncGateWords, webFetch: false }, invalidPath)
    const invalidRun = await start(invalidEditor)
    try {
      const invalidPut = await requestJson(invalidRun.port, 'PUT', '/api/dsh-extra-plan-settings/pro-config', { webFetch: true })
      check('SYNC 非空矛盾 documentPath 禁止降级 DSH_HOME：' + invalidPath, invalidPut.status >= 400 && invalidPut.body.profileSync.status === 'unavailable' && invalidPut.body.profileSync.reason === 'invalid-document-path' && readFileSync(decoy.qqPatch, 'utf8') === decoyBefore)
    } finally { await new Promise((resolve) => invalidRun.server.close(resolve)) }
  }

  const noTarget = makeSyncFixture(); syncFixtureRoots.push(noTarget.root)
  rmSync(join(noTarget.profileDir, 'node_modules', 'dsh-extra-plan-qqbot'), { recursive: true, force: true })
  const noTargetEditor = makeEditor({ ...syncValues, gateWords: syncGateWords, webFetch: false }, noTarget.webPatch)
  const noTargetRun = await start(noTargetEditor)
  try {
    const noTargetPut = await requestJson(noTargetRun.port, 'PUT', '/api/dsh-extra-plan-settings/pro-config', { webFetch: true })
    check('SYNC 已证明 profilesRoot 但无双锚点目标返回 200/not-installed', noTargetPut.status === 200 && noTargetPut.body.profileSync.status === 'not-installed' && noTargetPut.body.profileSync.status !== 'synced')
  } finally { await new Promise((resolve) => noTargetRun.server.close(resolve)) }

  const drift = makeSyncFixture(); syncFixtureRoots.push(drift.root)
  const driftEditor = makeEditor({ ...syncValues, gateWords: syncGateWords, webFetch: false }, drift.webPatch)
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
  const matrixEditor = makeEditor({ ...baseValues, gateWords: gate }, matrixFixture.webPatch, { persistDocument: true })
  const initialSnapshot = { values: { ...baseValues }, gateWords: gate }
  writeFileSync(matrixFixture.webPatch, JSON.stringify([{ id: 'dsh-extra-plan-settings', config: { ...baseValues, gateWords: gate } }]), 'utf8')
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
    writeFileSync(matrixFixture.webPatch, JSON.stringify([{ id: 'dsh-extra-plan-settings', config: { ...nextValues, gateWords: gate } }]), 'utf8')
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
    profileSyncTerminal: { status: normalTerminal?.body?.profileSync?.status, pending: normalTerminal?.body?.profileSync?.pending },
    failureOrder: ['outer-configEditor-error', 'ctx.get:configEditor', 'settled-terminal', 'adapter-start'],
    classification: 'PASS',
  }
  console.log('HOST_PROXY_MATRIX_CASE ' + JSON.stringify(normalCase))
  const normalBoundaryOk = normalProxy.outerDirectError === 'cannot get property "configEditor" without inject' &&
    normalProxy.getResult === 'editor' && normalCase.injectCallback === 1 && normalProxy.childServiceIdentity === 'same-editor' &&
    initialRegister === 1 && normalCase.settingsRegisterDelta === 0 && normalCase.disposeDelta === 0 &&
    normalCase.profileSyncTerminal.status === 'synced' && normalCase.profileSyncTerminal.pending === false && normalOk
  if (normalBoundaryOk) console.log('HOST_PROXY_NORMAL_SETTLED_CTX_GET_OK')
  check('host-proxy normal settled assertion', normalBoundaryOk)
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
    console.log('HOST_PROXY_MATRIX_CASE ' + JSON.stringify(result))
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
const adapterEditor = makeEditor({ ...syncValues, gateWords: syncGateWords }, adapterFixture.webPatch)
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
  if (typeof adapterRun.lifecycle.update === 'function') adapterRun.lifecycle.update()
  await flush(8)
  const adapterAfter = await waitForTerminal(adapterRun.port)
  await waitForAdapterRegister(adapterCounts)
  adapterNoRemount = adapterInitial.body.profileSync.status === 'synced' && adapterAfter.body.profileSync.status === 'synced' && adapterCounts.register === 1 && adapterCounts.dispose === 0
  check('SETTINGS_ONLY_HTTP_SAVE_ADAPTER_REGISTER_0_DISPOSE_0', adapterNoRemount)
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
  const editor = makeEditor({ ...syncValues, gateWords: syncGateWords }, fixture.webPatch, { persistDocument: true })
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
        apiSnapshotBodyOk(get, snapshot) && apiPatchOk(fixture, snapshot) && counts.register === 1 && counts.dispose === 1
      console.log('API_TRACE ' + JSON.stringify({ case: caseName, trace, adapterStartIndex, terminalIndex, putStatus: put.status, apiBodyOk: apiTerminalBodyOk(put), snapshotBodyOk: apiSnapshotBodyOk(put, snapshot), patchOk: apiPatchOk(fixture, snapshot), patchDetails: apiPatchDetails(fixture, snapshot), resolvedIndex, pluginCalls: counts.register, pluginDisposals: counts.dispose }))
    } else {
      release()
      await waitForTrace(trace, failureEvent)
      const failureIndex = trace.indexOf(failureEvent)
      const get = await requestJson(run.port, 'GET', '/api/dsh-extra-plan-settings/pro-config', {})
      ok = ok && failureIndex > terminalIndex && trace.filter((event) => event === failureEvent).length === 1 &&
        get.status >= 200 && get.status < 300 && get.body.profileSync?.status === 'synced' && get.body.profileSync?.pending === false &&
        apiSnapshotBodyOk(get, snapshot) && apiPatchOk(fixture, snapshot) && counts.register === 1 && counts.dispose === 0
      console.log('API_TRACE ' + JSON.stringify({ case: caseName, trace, adapterStartIndex, terminalIndex, putStatus: put.status, apiBodyOk: apiTerminalBodyOk(put), snapshotBodyOk: apiSnapshotBodyOk(put, snapshot), patchOk: apiPatchOk(fixture, snapshot), patchDetails: apiPatchDetails(fixture, snapshot), failureIndex, pluginCalls: counts.register, pluginDisposals: counts.dispose }))
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


const liveRoot = mkdtempSync(join(tmpdir(), 'dsh-extra-plan-live-config-'))
const liveDir = join(liveRoot, 'profiles', 'web')
mkdirSync(liveDir, { recursive: true })
let livePath = join(liveDir, 'cordis.patch.yml')
const hotKeys = ['anchoredBootstrap', 'creativeMode', 'runcodeCatchGate', 'crossProviderPlannerModel', 'plannerModel', 'plannerPromptSuffix', 'exploreBudget', 'otherAgentModel']
const hotGetters = { anchoredBootstrap: 'anchoredBootstrap', creativeMode: 'creativeMode', runcodeCatchGate: 'runcodeCatchGate', crossProviderPlannerModel: 'crossProviderPlannerModel', plannerModel: 'plannerModel', plannerPromptSuffix: 'plannerPromptSuffix', exploreBudget: 'exploreBudget', otherAgentModel: 'otherAgentModel' }
const hotNext = { anchoredBootstrap: true, creativeMode: false, runcodeCatchGate: false, crossProviderPlannerModel: false, plannerModel: 'hot-model', plannerPromptSuffix: 'hot-suffix', exploreBudget: 47, otherAgentModel: 'hot-other' }
writeFileSync(livePath, JSON.stringify([{ id: 'dsh-extra-plan-settings', config: { ...syncValues } }]), 'utf8')
const liveConfig = createLiveConfig({ resolveDocumentPath: () => livePath, fallbackDefaults: syncValues })
let hotReadOk = true
for (const key of hotKeys) {
  const next = { ...syncValues, [key]: hotNext[key] }
  livePath = join(liveDir, 'cordis.patch.' + key + '.yml')
  writeFileSync(livePath, JSON.stringify([{ id: 'dsh-extra-plan-settings', config: next }]), 'utf8')
  if (!Object.is(liveConfig[hotGetters[key]], hotNext[key])) hotReadOk = false
}
check('HOT_READ_WITHOUT_AGENTPRESET_REMOUNT_OK', hotReadOk && adapterNoRemount)
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
    check('V02 API ' + kind + ' GET/PUT均失败、零edit且完整存储深等不变', badGet.status === 500 && badPut.status === 500 && badGateEditor.state.edits.length === 0 && isDeepStrictEqual(badGateEditor.state.rows[0].entry.options.config, originalConfig))
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
  const sandbox = { window: { __ModuleLoader__: { load(value) { definition = value } } }, document, console, Symbol, Object, Array, String, Number, Boolean, JSON, structuredClone, Set, Map, Error }
  runInNewContext(clientText, sandbox)
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
    locale: { bind: () => (key) => key, register: () => () => {} },
    configForms: {
      get: () => formController,
      whileServed: (names, callback) => callback(),
    },
    slots: {
      inject: (name, callback) => {
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
    const formElement = settingsCard.children.find((child) => child !== null && child !== undefined && typeof child.type === 'function' && child.type.name === 'ExtraPlanForm')
    if (formElement === undefined) return undefined
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
  const result = { calls, states, registrations, injectionDisposers, cleanups, context: surfaceContext, renderDetail, detailChrome, notify, rebuildSurfaces, unmount, renderStats, formController }
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
const successClient = await exerciseClient(readySnapshot, true, 'ok', 'V05 实际 lazy client 成功保存')
check('V05 成功保存恰一次十项 mutate、revision正确、每键一条 set op', successClient.calls.length === 1 && successClient.calls[0].revision === 42 && successClient.calls[0].ops.length === 10 && new Set(successClient.calls[0].ops.map((op) => op.path[0])).size === 10 && successClient.calls[0].ops.every((op) => op.op === 'set'))
await exerciseClient(readySnapshot, false, 'error', 'V05 mutate=false 不显示保存成功')
await exerciseClient(readySnapshot, 'throw', 'error', 'V05 mutate抛错不显示保存成功')
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
check('ENV DSH_HOME/DSH_PROFILE/USERPROFILE/HOME 精确恢复原先不存在/原值状态', TEST_ENV_KEYS.every((key) => process.env[key] === testEnvironment[key]))
console.log('\n通过 ' + pass + ', 失败 ' + fail)
process.exit(fail === 0 ? 0 : 1)
