// 设置页同页配置、HTTP 写闸门与真实 lazy client 保存回归；只使用内存 editor/slot/React 夹具。
import { createServer, request as httpRequest } from 'node:http'
import { createRequire, registerHooks } from 'node:module'
import { isDeepStrictEqual } from 'node:util'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
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
  if (typeof registerHooks === 'function') registerHooks({ resolve(specifier, context, next) { return specifier === '@deepseek-ai/schemastery' ? { url: schemaUrl, shortCircuit: true } : next(specifier, context) } })
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
try { const { parsePresetYaml } = await import('../../plugins/dsh-extra-plan/lib/preset-settings.js'); patch = parsePresetYaml(patchText) } catch (error) { console.error('FAIL  patch YAML parse: ' + String(error)); process.exit(1) }
const { SETTING_DEFINITIONS } = await import('../../plugins/dsh-extra-plan/lib/preset-settings.js')
const { Config } = await import('../../plugins/dsh-extra-plan/lib/settings.js')
const descriptorKeys = SETTING_DEFINITIONS.map((definition) => definition.key)
const configDict = Config !== undefined && Config !== null && Config.dict !== undefined && Config.dict !== null ? Config.dict : {}
const configKeys = Object.keys(configDict)
const configKeySetMatches = JSON.stringify([...configKeys].sort()) === JSON.stringify([...descriptorKeys].sort())
check('V03 patch 顶层公开 insert 恰一行且稳定 id=dsh-extra-plan-settings', Array.isArray(patch) && patch.length === 1 && Array.isArray(patch[0].insert) && patch[0].insert.length === 1 && patch[0].insert[0].id === 'dsh-extra-plan-settings')
check('V03 settings owner 接管 configEditor/loader/settings/webServer 生命周期', settingsText.includes("ctx.inject(['configEditor']") && settingsText.includes("ctx.inject(['loader']") && settingsText.includes("ctx.inject(['settings']") && settingsText.includes("ctx.inject(['webServer']") && settingsText.includes('mountPresetSync(child)'))
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
  console.log('SKIP  {"scope":"HOST-VERSION","reason":"DSH_INSTALL_ROOT 未提供，未读取真实 manifest/SlotMap/ConfigForms"}')
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
function makeEditor(config = initial) {
  const row = { entry: { options: { id: 'dsh-extra-plan-settings', name: '@local/dsh-extra-plan/settings', config: structuredClone(config) }, fiber: {} }, inherited: {}, override: {} }
  const state = { rows: [row], edits: [] }
  return {
    state,
    documentPath: '',
    configuration: () => state.rows,
    edit: async (entry, change) => {
      const current = state.rows.find((item) => item.entry === entry)
      if (current === undefined) throw new Error('entry disappeared')
      const next = change(structuredClone(current.entry.options.config), current.inherited)
      current.entry.options.config = next
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
async function start(editor) {
  const routes = []
  const policies = []
  const ctx = {
    fiber: { uid: 'settings-test' },
    get: (name) => name === 'configEditor' ? editor : undefined,
    inject(deps, callback) {
      if (deps[0] === 'loader') { callback({ get: () => undefined, loader: { builtins: {} }, effect: (fn) => fn() }); return }
      if (deps[0] === 'settings') { callback({ settings: { configure: (policy, owner) => { policies.push({ policy, owner }); return () => {} } }, effect: (fn) => fn() }); return }
      if (deps[0] === 'webServer') { callback({ webServer: { register: (definition) => { routes.push(definition); return () => {} } }, effect: (fn) => fn() }); return }
      if (deps[0] === 'configEditor') return
      throw new Error('unexpected inject ' + deps.join(','))
    },
  }
  const settingsModule = await import('../../plugins/dsh-extra-plan/lib/settings.js')
  settingsModule.apply(ctx)
  const route = routes.find((item) => item.path === '/api/dsh-extra-plan-settings')
  check('V03 apply 注册单一路由与 auto:false policy', route !== undefined && policies.length === 1 && policies[0].policy.auto === false)
  const server = createServer((req, res) => Promise.resolve(route.handler(req, res)).catch((error) => { if (!res.headersSent) { res.writeHead(500, { 'content-type': 'application/json' }); res.end(JSON.stringify({ error: String(error) })) } }))
  const port = await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', () => resolve(server.address().port)) })
  return { server, port }
}

const editor = makeEditor()
const run = await start(editor)
try {
  const before = await requestJson(run.port, 'GET', '/api/dsh-extra-plan-settings/pro-config', {})
  check('V03 GET 读取统一行两项宿主值', before.status === 200 && before.body.values.webFetch === false && before.body.values.toolPresentationMode === 'native' && before.body.fields.length === 2)
  const put = await requestJson(run.port, 'PUT', '/api/dsh-extra-plan-settings/pro-config', { webFetch: true, toolPresentationMode: 'ptc' })
  const rowConfig = editor.state.rows[0].entry.options.config
  check('V03 合法 PUT 仅 edit 唯一全局行并保留另八项与 gateWords', put.status === 200 && put.body.projection.owner === 'dsh-extra-plan-settings' && editor.state.edits.length === 1 && editor.state.edits[0].id === 'dsh-extra-plan-settings' && rowConfig.webFetch === true && rowConfig.toolPresentationMode === 'ptc' && rowConfig.plannerModel === initial.plannerModel && rowConfig.exploreBudget === initial.exploreBudget && JSON.stringify(rowConfig.gateWords) === JSON.stringify(gateWords))
  const noOp = await requestJson(run.port, 'PUT', '/api/dsh-extra-plan-settings/pro-config', { webFetch: true, toolPresentationMode: 'ptc' })
  check('V03 同值 PUT 深等 no-op 零新增 edit', noOp.status === 200 && noOp.body.projection.applied === true && editor.state.edits.length === 1)
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
  function renderDetail(config = {}, subject = { kind: 'bundle', pkg: { name: '@local/dsh-extra-plan' } }) {
    let view
    let rounds = 0
    do {
      view = renderDetailOnce(subject)
      rounds += 1
      if (config.flush === false || (!detailRunner.dirty && !detailFormRunner.dirty) || rounds >= 12) break
    } while (true)
    return view
  }
  function detailChrome(subject = { kind: 'bundle', pkg: { name: '@local/dsh-extra-plan' } }) {
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
const thirdPartyOff = surface.context.slots.register({ name: 'plugins.bundle.config', key: '@local/dsh-extra-plan', locale: 'third-party', inject: () => ({}) }, () => null)
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

console.log('\\n通过 ' + pass + ', 失败 ' + fail)
process.exit(fail === 0 ? 0 : 1)
