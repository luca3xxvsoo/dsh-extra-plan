// 设置页同页配置、HTTP 写闸门与真实 lazy client 保存回归；只使用内存 editor/slot/React 夹具。
import { createHash } from 'node:crypto'
import { createRequire, registerHooks, syncBuiltinESMExports } from 'node:module'
import { isDeepStrictEqual } from 'node:util'
import fs from 'node:fs'
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { createIsolatedEnv, makeFixtureDir } from '../_shared/workspace-paths.mjs'
import { createPathContext } from '../../lib/path-policy.js'
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
// 优先读安装根 node_modules 下的 dsh 清单（真实宿主安装形态），根 package.json 只作后备。
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
// DSH_COMPAT_RC1（rc1 兼容路径）：rc.1 安装形态在 CLI 包 node_modules 下嵌套 dsh 自副本，副本存在时优先，保留 rc.1 取证兼容。
// DSH_CURRENT_RC2（最新路径，rc.2 与 rc.3 共用该路径）：rc.3 安装形态不含嵌套自副本，以安装根 package.json 为锚点后备；删除边界=撤销 rc.1 兼容时移除嵌套候选。
const INSTALL_ANCHOR = OFFICIAL_ROOT === undefined ? undefined : (existsSync(join(OFFICIAL_ROOT, 'package.json')) ? join(OFFICIAL_ROOT, 'package.json') : join(TARGET_INSTALL_ROOT, 'package.json'))


const patchText = readFileSync(join(REPO_ROOT, 'cordis.patch.yml'), 'utf8')
const clientText = readFileSync(join(REPO_ROOT, 'lib/client.js'), 'utf8')
const keys = ['anchoredBootstrap', 'creativeMode', 'webFetch', 'toolPresentationMode', 'runcodeCatchGate', 'crossProviderPlannerModel', 'plannerModel', 'plannerPromptSuffix', 'exploreBudget', 'otherAgentModel', 'reviewerUsesPlannerModel']

let pass = 0
let fail = 0
const rootCleanupErrors = []
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
const presetSettings = await import('../../lib/preset-settings.js')
const { parsePresetYaml, SETTING_DEFINITIONS } = presetSettings
try { patch = parsePresetYaml(patchText) } catch (error) { console.error('FAIL  patch YAML parse: ' + String(error)); settingsBootstrapFixture.cleanup(); process.exit(1) }
const { Config } = await import('../../lib/settings.js')
const { createLiveConfig } = await import('../../lib/live-config.js')
const { createGateRuntime, GATE_WORD_FIELDS } = await import('../../lib/gate-words.js')
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


check('V03 descriptor 与 Config 实际字段集合均恰11项且包含十项热读与一项宿主值', descriptorKeys.length === 11 && configKeys.length === 11 && configKeySetMatches && JSON.stringify([...configKeys].sort()) === JSON.stringify(keys.slice().sort()) && descriptorKeys.includes('webFetch') && descriptorKeys.includes('toolPresentationMode'))





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
    const manifest = JSON.parse(readFileSync(new URL('../../package.json', import.meta.url), 'utf8'))
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
    check('F04 已安装包静态 d.ts SlotMap 声明提供 keyed plugins.bundle.config 与 list plugins.detail.section', slotHasKind(slotText, 'plugins.bundle.config', 'keyed') && slotHasKind(slotText, 'plugins.detail.section', 'list'))
    check('F04 已安装包静态 d.ts ConfigForms 声明提供 get 与 whileServed', configFormText.includes('get<T>(entryId: string)') && configFormText.includes('whileServed(namespaces: readonly string[]'))
  }
}

const gateWords = { routeMain: '甲', routeExecutor: '丁', routePlan: '乙', routeDisagree: '丙', purposeRefine: '己', purposeRedo: '庚' }
const initial = { anchoredBootstrap: true, creativeMode: false, webFetch: false, toolPresentationMode: 'native', runcodeCatchGate: false, crossProviderPlannerModel: false, plannerModel: 'stable-model', plannerPromptSuffix: 'suffix', exploreBudget: 19, otherAgentModel: '', reviewerUsesPlannerModel: false, gateWords }
function makeEditor(config = initial, documentPath = '', options = {}) {
  const layers = options.layers
  const inherited = structuredClone(layers?.inherited ?? {})
  const row = { entry: { options: { id: 'dsh-extra-plan-settings', name: 'dsh-extra-plan/settings', config: structuredClone(layers === undefined ? config : layers.local ?? inherited) }, fiber: {} }, inherited, override: structuredClone(layers?.local ?? {}) }
  const state = { rows: [row], edits: [], callbackInputs: [], beforeEdit: undefined }
  const persistDocument = documentPath !== '' && existsSync(documentPath)
  const persist = (local) => {
    if (persistDocument) writeFileSync(documentPath, JSON.stringify([{ id: row.entry.options.id, name: row.entry.options.name, ...(local === undefined ? {} : { config: local }) }]), 'utf8')
  }
  persist(layers === undefined ? row.entry.options.config : layers.local)
  return {
    state,
    documentPath,
    profileContext: options.profileContext,
    dshHomePath: options.dshHomePath,
    configuration: () => state.rows.map((item) => item === row ? {
      ...item,
      inherited: structuredClone(item.inherited),
      // 不分层的老夹具把整个 config 作为本地事实；分层夹具必须从独立的覆写取值。
      override: structuredClone(layers === undefined ? item.entry.options.config ?? {} : item.override),
    } : item),
    edit: async (entry, change) => {
      const current = state.rows.find((item) => item.entry === entry)
      if (current === undefined) throw new Error('entry disappeared')
      if (layers !== undefined) {
        if (state.beforeEdit !== undefined) state.beforeEdit(current, persist)
        state.callbackInputs.push({ current: structuredClone(entry.options.config), inherited: structuredClone(current.inherited), override: structuredClone(current.override) })
      }
      const next = change(structuredClone(entry.options.config), current.inherited)
      // 宿主按整组覆写，Loader 原始 config 不自动合并继承层。
      entry.options.config = next
      if (layers !== undefined) current.override = structuredClone(next)
      persist(next)
      state.edits.push({ id: entry.options.id, next: structuredClone(next) })
    },
  }
}
async function start(editor, options = {}) {
  const policies = []
  const lifecycle = { cleanup: undefined, update: undefined }
  const rootCleanups = []
  let rootDisposePromise
  const disposeRoot = () => {
    if (rootDisposePromise !== undefined) return rootDisposePromise
    rootDisposePromise = (async () => {
      try {
        for (const cleanup of rootCleanups) if (typeof cleanup === 'function') await cleanup()
      } catch (error) {
        rootCleanupErrors.push(error)
        throw error
      }
    })()
    return rootDisposePromise
  }
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
    root: options.rootIdentity === undefined || options.rootIdentity === null ? {} : options.rootIdentity,
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
      // appReady 分支探针：返回 options.appReady（未传即 undefined），不写入 getCalls/trace，避免影响既有断言计数。
      if (name === 'appReady') return options.appReady
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
      if (name === 'webServer') { request.outcome = 'callback'; callback({ webServer: { register: () => () => {} }, effect: (fn) => fn() }); return }
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
    effect: (fn) => {
      const cleanup = fn()
      rootCleanups.push(cleanup)
      return cleanup
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
  const settingsModule = options.settingsModule === undefined ? await import('../../lib/settings.js') : options.settingsModule
  let applyError
  try {
    settingsModule.apply(ctx)
  } catch (error) {
    applyError = error
    if (options.allowApplyError !== true) {
      let cleanupError
      try { await disposeRoot() } catch (errorDuringCleanup) { cleanupError = errorDuringCleanup }
      if (cleanupError !== undefined && error !== null && typeof error === 'object') error.cleanupError = cleanupError
      throw error
    }
  }
  proxy.applyError = applyError === undefined ? undefined : String(applyError && applyError.message || applyError)
  if (applyError !== undefined) {
    await disposeRoot()
    return { lifecycle, proxy, applyError, disposeRoot }
  }
  check('V03 apply 注册单一 settings policy 且 auto:false', policies.length === 1 && policies[0].policy.auto === false)
  const server = {
    close: (callback) => {
      disposeRoot().then(() => {
        if (typeof callback === 'function') callback()
      }, (cleanupError) => {
        proxy.rootCleanupError = cleanupError
        trace.push('root-cleanup-error')
        if (typeof callback === 'function') callback(cleanupError)
      })
    },
  }
  return { server, lifecycle, proxy, disposeRoot }
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

const testEnvironment = originalTestEnvironment




function makeSyncFixture() {
  const fixture = makeFixtureDir({ label: 'settings-sync' })
  const root = fixture.root
  const webDir = join(root, 'profiles', 'web')
  mkdirSync(webDir, { recursive: true })
  const webPatch = join(webDir, 'cordis.patch.yml')
  writeFileSync(webPatch, '# web fixture\n- id: web-fixture\n  name: web\n', 'utf8')
  const webProfileContext = { home: root, dir: webDir, patchPath: webPatch, name: 'web', startedBundles: [] }
  if (INSTALL_ANCHOR !== undefined) {
    webProfileContext.installAnchor = INSTALL_ANCHOR
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
    fixture,
    webProfileContext,
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
const syncValues = { anchoredBootstrap: false, creativeMode: true, webFetch: true, toolPresentationMode: 'ptc', runcodeCatchGate: true, crossProviderPlannerModel: true, plannerModel: 'planner-sync-test', plannerPromptSuffix: 'sync-suffix-test', exploreBudget: 37, otherAgentModel: 'other-sync-test', reviewerUsesPlannerModel: true }
const syncGateWords = { routeMain: '甲', routeExecutor: '丁', routePlan: '乙', routeDisagree: '丙', purposeRefine: '己', purposeRedo: '庚' }





const liveRoot = makeWRoot('settings-live-config')
const liveDir = join(liveRoot, 'profiles', 'web')
mkdirSync(liveDir, { recursive: true })
const livePath = join(liveDir, 'cordis.patch.yml')
const liveCapability = (name) => ({ name, path: livePath, type: 'file', purpose: 'config-editor', access: 'read' })
const hotKeys = ['anchoredBootstrap', 'creativeMode', 'webFetch', 'runcodeCatchGate', 'crossProviderPlannerModel', 'plannerModel', 'plannerPromptSuffix', 'exploreBudget', 'otherAgentModel', 'reviewerUsesPlannerModel']
const hotGetters = { anchoredBootstrap: 'anchoredBootstrap', creativeMode: 'creativeMode', webFetch: 'webFetch', runcodeCatchGate: 'runcodeCatchGate', crossProviderPlannerModel: 'crossProviderPlannerModel', plannerModel: 'plannerModel', plannerPromptSuffix: 'plannerPromptSuffix', exploreBudget: 'exploreBudget', otherAgentModel: 'otherAgentModel', reviewerUsesPlannerModel: 'reviewerUsesPlannerModel' }
const hotNext = { anchoredBootstrap: true, creativeMode: false, webFetch: false, runcodeCatchGate: false, crossProviderPlannerModel: false, plannerModel: 'hot-model', plannerPromptSuffix: 'hot-suffix', exploreBudget: 47, otherAgentModel: 'hot-other', reviewerUsesPlannerModel: false }
const liveMatrixRoot = makeWRoot('settings-live-config-matrix')
const liveMatrixWarnings = []
const liveMatrixWarn = console.warn
try {
  const liveMatrixDir = join(liveMatrixRoot, 'profiles', 'web')
  mkdirSync(liveMatrixDir, { recursive: true })
  let liveMatrixPath = join(liveMatrixDir, 'cordis.patch.yml')
  const liveMatrixPathContext = createPathContext({ workspaceRoot: liveMatrixRoot })
  writeFileSync(liveMatrixPath, JSON.stringify([{ id: 'dsh-extra-plan-settings', name: 'dsh-extra-plan/settings', config: { ...syncValues } }]), 'utf8')
  console.warn = (...args) => liveMatrixWarnings.push(args.map(String).join(' '))
  const liveMatrixConfig = createLiveConfig({ resolveDocumentTarget: () => ({ kind: 'workspace', path: liveMatrixPath }), getPathContext: () => liveMatrixPathContext, fallbackDefaults: syncValues })
  let matrixHotReadOk = true
  for (const key of hotKeys) {
    const next = { ...syncValues, [key]: hotNext[key] }
    liveMatrixPath = join(liveMatrixDir, 'cordis.patch.' + key + '.yml')
    writeFileSync(liveMatrixPath, JSON.stringify([{ id: 'dsh-extra-plan-settings', name: 'dsh-extra-plan/settings', config: next }]), 'utf8')
    if (!Object.is(liveMatrixConfig.get(hotGetters[key], { session: { header: { cwd: liveMatrixRoot } } }), hotNext[key])) matrixHotReadOk = false
  }
  liveMatrixPath = join(liveMatrixDir, 'cordis.patch.missing.yml')
  const matrixFallback = Object.fromEntries(hotKeys.map((key) => [key, liveMatrixConfig.get(hotGetters[key], { session: { header: { cwd: liveMatrixRoot } } })]))
  const matrixFallbackOk = hotKeys.every((key) => Object.is(matrixFallback[key], syncValues[key]))
  const matrixWarningsAfterMissing = liveMatrixWarnings.length
  liveMatrixPath = join(liveMatrixDir, 'cordis.patch.recovered.yml')
  writeFileSync(liveMatrixPath, JSON.stringify([{ id: 'dsh-extra-plan-settings', name: 'dsh-extra-plan/settings', config: { ...syncValues, ...hotNext } }]), 'utf8')
  const matrixRecovered = Object.fromEntries(hotKeys.map((key) => [key, liveMatrixConfig.get(hotGetters[key], { session: { header: { cwd: liveMatrixRoot } } })]))
  const matrixRecoveredOk = hotKeys.every((key) => Object.is(matrixRecovered[key], hotNext[key]))
  check('G5 A可读→B缺失→B可读：10项回退/恢复且缺失最多一次告警', matrixHotReadOk && matrixFallbackOk && matrixRecoveredOk && matrixWarningsAfterMissing === 1 && liveMatrixWarnings.length === 1)
} finally {
  console.warn = liveMatrixWarn
  rmSync(liveMatrixRoot, { recursive: true, force: true })
}
const liveValues = { ...syncValues, ...hotNext }
writeFileSync(livePath, JSON.stringify([{ id: 'dsh-extra-plan-settings', name: 'dsh-extra-plan/settings', config: liveValues }]), 'utf8')
const liveBytes = readFileSync(livePath)
const liveStamp = () => {
  const info = statSync(livePath, { bigint: true })
  return { dev: String(info.dev), ino: String(info.ino), size: String(info.size), mtime: String(info.mtimeNs), ctime: String(info.ctimeNs) }
}
const liveOriginalStamp = liveStamp()
const liveBytesSha256 = createHash('sha256').update(liveBytes).digest('hex')
const liveResolvedPath = resolve(livePath)
const liveOriginalReadFileSync = fs.readFileSync
let liveReadCount = 0
fs.readFileSync = (...args) => {
  if (typeof args[0] === 'string' && resolve(args[0]) === liveResolvedPath) liveReadCount += 1
  return liveOriginalReadFileSync(...args)
}
syncBuiltinESMExports()
const liveWarnings = []
const liveWarn = console.warn
console.warn = (...args) => liveWarnings.push(args.map(String).join(' '))
let liveCapabilityName = 'profilePatch'
let livePathContext = createPathContext({ hostCapabilities: [liveCapability('profilePatch'), liveCapability('editorDocument')] })
const readHotValues = (liveConfig) => Object.fromEntries(hotKeys.map((key) => [key, liveConfig.get(hotGetters[key], { session: { header: { cwd: liveRoot } } })]))
const hotValuesEqual = (values, expected) => hotKeys.every((key) => Object.is(values[key], expected[key]))
try {
  const liveConfig = createLiveConfig({ resolveDocumentTarget: () => ({ kind: 'host', path: livePath, capability: liveCapabilityName }), getPathContext: () => livePathContext, fallbackDefaults: syncValues })
  const initialValues = readHotValues(liveConfig)
  const readsAfterInitial = liveReadCount
  const sameIdentityValues = readHotValues(liveConfig)
  const readsAfterSameIdentity = liveReadCount
  liveCapabilityName = 'editorDocument'
  const capabilityChangedValues = readHotValues(liveConfig)
  const readsAfterCapabilityChange = liveReadCount
  const sameCapabilityValues = readHotValues(liveConfig)
  const readsAfterSameCapability = liveReadCount
  livePathContext = createPathContext({ workspaceRoot: liveRoot })
  const revokedValues = readHotValues(liveConfig)
  const readsAfterRevoke = liveReadCount
  livePathContext = createPathContext({ hostCapabilities: [liveCapability('editorDocument')] })
  const restoredValues = readHotValues(liveConfig)
  const readsAfterRestore = liveReadCount
  const readCountsOk = readsAfterInitial === 1 && readsAfterSameIdentity === 1 && readsAfterCapabilityChange === 2 && readsAfterSameCapability === 2 && readsAfterRevoke === 2 && readsAfterRestore === 3
  const bytesUnchanged = liveOriginalReadFileSync(livePath).equals(liveBytes)
  const stampUnchanged = isDeepStrictEqual(liveOriginalStamp, liveStamp())
  const sameIdentityOk = hotValuesEqual(initialValues, hotNext) && hotValuesEqual(sameIdentityValues, hotNext) && sameIdentityValues.reviewerUsesPlannerModel === initialValues.reviewerUsesPlannerModel
  const capabilityChangedOk = hotValuesEqual(capabilityChangedValues, hotNext) && hotValuesEqual(sameCapabilityValues, hotNext)
  const revokedOk = hotValuesEqual(revokedValues, syncValues) && hotKeys.some((key) => !Object.is(revokedValues[key], hotNext[key]))
  const restoredOk = hotValuesEqual(restoredValues, hotNext)
  const evidence = { path: livePath, bytesSha256: liveBytesSha256, bytes: liveBytes.length, stamp: liveOriginalStamp, reads: { initial: readsAfterInitial, sameIdentity: readsAfterSameIdentity, capabilityChange: readsAfterCapabilityChange, sameCapability: readsAfterSameCapability, revoke: readsAfterRevoke, restore: readsAfterRestore }, warnings: liveWarnings.length, values: { initial: initialValues, capabilityChanged: capabilityChangedValues, revoked: revokedValues, restored: restoredValues } }
  output.structured('G5_LIVE_CONFIG_EVIDENCE', evidence, { path: livePath, bytes: liveBytes.length, stamp: liveOriginalStamp, reads: evidence.reads, warningCount: liveWarnings.length }, { failure: !(readCountsOk && bytesUnchanged && stampUnchanged && sameIdentityOk && capabilityChangedOk && revokedOk && restoredOk) })
  check('G5 10热读键同路径同stamp能力切换/撤权/恢复、真实read计数且字节stamp不变', readCountsOk && bytesUnchanged && stampUnchanged && sameIdentityOk && capabilityChangedOk && revokedOk && restoredOk && liveWarnings.length === 1)
} finally {
  fs.readFileSync = liveOriginalReadFileSync
  syncBuiltinESMExports()
  console.warn = liveWarn
}
// G6 boot 装载：settings 行存在但缺新键（reviewerUsesPlannerModel）→ 不抛错、告警一次并按
// apply 快照回填；非法键值（plannerModel: 12345）→ 仍按装载期严格校验抛错。
const g6Root = makeWRoot('settings-boot-missing-key')
const g6PathContext = createPathContext({ workspaceRoot: g6Root })
const g6Dir = join(g6Root, 'profiles', 'web')
mkdirSync(g6Dir, { recursive: true })
const g6MissingPath = join(g6Dir, 'cordis.patch.yml')
const g6Config = { ...syncValues }
delete g6Config.reviewerUsesPlannerModel
writeFileSync(g6MissingPath, JSON.stringify([{ id: 'dsh-extra-plan-settings', name: 'dsh-extra-plan/settings', config: g6Config }]), 'utf8')
const g6Warnings = []
const g6Warn = console.warn
console.warn = (...args) => g6Warnings.push(args.map(String).join(' '))
let g6BootError = ''
let g6Reviewer = undefined
try {
  const g6Live = createLiveConfig({ resolveDocumentTarget: () => ({ kind: 'workspace', path: g6MissingPath }), getPathContext: () => g6PathContext, fallbackDefaults: syncValues })
  g6Reviewer = g6Live.reviewerUsesPlannerModel
} catch (error) {
  g6BootError = String(error !== null && error !== undefined && error.message !== undefined ? error.message : error)
}
const g6WarnCountAfterBoot = g6Warnings.length
let g6InvalidError = ''
try {
  const g6InvalidPath = join(g6Dir, 'cordis.patch.invalid.yml')
  writeFileSync(g6InvalidPath, JSON.stringify([{ id: 'dsh-extra-plan-settings', name: 'dsh-extra-plan/settings', config: { ...syncValues, plannerModel: 12345 } }]), 'utf8')
  createLiveConfig({ resolveDocumentTarget: () => ({ kind: 'workspace', path: g6InvalidPath }), getPathContext: () => g6PathContext, fallbackDefaults: syncValues })
} catch (error) {
  g6InvalidError = String(error !== null && error !== undefined && error.message !== undefined ? error.message : error)
}
console.warn = g6Warn
check('G6 settings 行缺新键仍能装载并回填、非法键值仍抛错', g6BootError === '' && g6Reviewer === true && g6WarnCountAfterBoot === 1 && g6InvalidError.includes('settings 行校验失败'))
rmSync(g6Root, { recursive: true, force: true })
const generatedDefinition = parsePresetYaml(readFileSync(join(REPO_ROOT, 'assets/presets/extra-plan/preset-definition.generated.yml'), 'utf8'))
const restartRows = generatedDefinition.plugins || []
const restartWeb = restartRows.find((row) => row && row.id === 'tool-web')
const restartPresentation = restartRows.find((row) => row && (row.id === 'tool-executor-native' || row.id === 'tool-executor-ptc'))
// 热读键集合取 settings contract 的 EXTRA_PLAN 组（10 项，含 webFetch）；toolPresentationMode 属装载期宿主行投影。
const restartHotKeys = presetSettings.EXTRA_PLAN_SETTING_DEFINITIONS.map((item) => item.key)
const restartOk = restartWeb !== undefined && restartWeb.config !== undefined && restartWeb.config.fetch === true && restartPresentation !== undefined && restartPresentation.config === undefined &&
  restartHotKeys.length === 10 && restartHotKeys.includes('webFetch') && !restartHotKeys.includes('toolPresentationMode')
check('RESTART_1_DEFINITION_PROJECTION_REMAINS_LOAD_TIME', restartOk)
const oldRuntime = createGateRuntime(syncGateWords)
const restartGate = Object.fromEntries(GATE_WORD_FIELDS.map((item, index) => [item.field, '重词' + index]))
const nextRuntime = createGateRuntime(restartGate)
check('GATEWORDS_FULL_SYNC_RESTART_SEMANTICS', oldRuntime.words.routeMain === syncGateWords.routeMain && nextRuntime.words.routeMain === restartGate.routeMain && oldRuntime.words.routeMain !== nextRuntime.words.routeMain)
console.log('HUMAN  {"scope":"RESTART-AND-GATEWORDS","reason":"真实 Harness 重启、旧词拒绝与非法词按同口径回落资产默认需部署后复测"}')
rmSync(liveRoot, { recursive: true, force: true })


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
  const sandbox = { window: { __ModuleLoader__: { load(value) { definition = value } } }, document, console, Symbol, Object, Array, String, Number, Boolean, JSON, structuredClone, Set, Map, Error,
    fetch: async (url, init) => {
      fetchCalls.push({ url: String(url), method: init === undefined || init === null ? 'GET' : String(init.method || 'GET'), body: init === undefined || init === null || typeof init.body !== 'string' ? undefined : JSON.parse(init.body) })
      throw new Error('unexpected-fetch: ' + String(url))
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
const values = { anchoredBootstrap: true, creativeMode: false, webFetch: false, toolPresentationMode: 'native', runcodeCatchGate: false, crossProviderPlannerModel: false, plannerModel: 'm', plannerPromptSuffix: 's', exploreBudget: 18, otherAgentModel: '', reviewerUsesPlannerModel: false }
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
const UI_FIELD_ORDER = ['anchoredBootstrap', 'creativeMode', 'webFetch', 'toolPresentationMode', 'runcodeCatchGate', 'crossProviderPlannerModel', 'plannerModel', 'plannerPromptSuffix', 'exploreBudget', 'otherAgentModel', 'reviewerUsesPlannerModel']
// 六个 pro/通用开关的 descriptor hint 统一写「新会话/新子代理生效」；HINT_SCOPE_SUFFIXES 保留旧口径仅为兼容历史 descriptor。
const HINT_SCOPE_SUFFIXES = ['立即生效', '重启生效', '新会话/新子代理生效', '新子代理生效']
const RESTART_SCOPE_KEYS = ['toolPresentationMode']
function hintScopeOf(hint) {
  if (typeof hint !== 'string') return ''
  return HINT_SCOPE_SUFFIXES.find((suffix) => hint.endsWith(suffix)) || ''
}
function uiFieldContractOk(rows) {
  if (rows.length !== UI_FIELD_ORDER.length || JSON.stringify(rows.map((row) => row.key)) !== JSON.stringify(UI_FIELD_ORDER)) return false
  const booleanKeys = new Set(['anchoredBootstrap', 'creativeMode', 'webFetch', 'runcodeCatchGate', 'crossProviderPlannerModel', 'reviewerUsesPlannerModel'])
  const restartScopeKeys = []
  for (const row of rows) {
    const hintScope = hintScopeOf(row.hint)
    if (hintScope === '') return false
    if (hintScope === '重启生效') restartScopeKeys.push(row.key)
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
  return JSON.stringify(restartScopeKeys.slice().sort()) === JSON.stringify(RESTART_SCOPE_KEYS)
}
async function exerciseInteractiveControls(snapshot, options = {}) {
  const harness = makeClientHarness(snapshot, true, false, false, options)
  const firstView = harness.renderDetail()
  const rows = fieldRowsOf(firstView)
  const target = options.target === undefined ? { anchoredBootstrap: false, creativeMode: true, webFetch: true, toolPresentationMode: 'ptc', runcodeCatchGate: true, crossProviderPlannerModel: true, plannerModel: 'interactive-model', plannerPromptSuffix: 'changed\n"suffix\\path', exploreBudget: 27, otherAgentModel: 'child-model', reviewerUsesPlannerModel: true } : options.target
  for (const row of rows) if (Object.prototype.hasOwnProperty.call(target, row.key)) row.control.props.onChange({ target: { value: String(target[row.key]) } })
  const changedView = harness.renderDetail()
  const button = changedView?.button
  if (button !== undefined) await button.props.onClick()
  const call = harness.calls[0]
  return { harness, rows, target, call }
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
check('V05 实际渲染十一控件顺序/控件类型/选项/min-step/hint', uiFieldContractOk(interactive.rows))
check('V05 点选十一控件后一次 mutate 带全十一键、revision42 与正确类型', interactive.call !== undefined && interactive.call.revision === 42 && interactiveOps.length === 11 && new Set(interactiveOps.map((op) => op.path[0])).size === 11 && isDeepStrictEqual(interactiveValues, interactive.target) && typeof interactiveValues.anchoredBootstrap === 'boolean' && typeof interactiveValues.creativeMode === 'boolean' && typeof interactiveValues.webFetch === 'boolean' && typeof interactiveValues.toolPresentationMode === 'string' && typeof interactiveValues.runcodeCatchGate === 'boolean' && typeof interactiveValues.crossProviderPlannerModel === 'boolean' && typeof interactiveValues.plannerModel === 'string' && typeof interactiveValues.plannerPromptSuffix === 'string' && typeof interactiveValues.exploreBudget === 'number' && typeof interactiveValues.otherAgentModel === 'string')

const ptcRow = interactive.rows.find((row) => row.key === 'toolPresentationMode')
const ptcOptions = (ptcRow?.control?.children || []).flatMap((child) => Array.isArray(child) ? child : [child]).map((option) => option?.props?.value)
check('V05 工具执行器控件结构化事实：类型 select 且选项集合恰为 native/ptc', ptcRow !== undefined && ptcRow.control?.type === 'select' && JSON.stringify([...ptcOptions].sort()) === JSON.stringify(['native', 'ptc']))
const successClient = await exerciseClient(readySnapshot, true, 'ok', 'V05 实际 lazy client 成功保存')
check('V05 成功保存恰一次十一项 mutate、revision正确、每键一条 set op', successClient.calls.length === 1 && successClient.calls[0].revision === 42 && successClient.calls[0].ops.length === 11 && new Set(successClient.calls[0].ops.map((op) => op.path[0])).size === 11 && successClient.calls[0].ops.every((op) => op.op === 'set'))
await exerciseClient(readySnapshot, false, 'error', 'V05 mutate=false 不显示保存成功')
await exerciseClient(readySnapshot, 'throw', 'error', 'V05 mutate抛错不显示保存成功')
const clientPutAccepted = makeClientHarness(readySnapshot, true, false, false)
const acceptedPutView = clientPutAccepted.renderDetail()
if (acceptedPutView === undefined || acceptedPutView.button === undefined) {
  check('UI双步保存 accepted 渲染保存按钮', false)
} else {
  await acceptedPutView.button.props.onClick()
  check('UI双步保存 accepted 恰一次同源十一项 mutate、提示 saved 且不再发起任何 fetch', clientPutAccepted.calls.length === 1 && clientPutAccepted.calls[0].ops.length === 11 && messageKind(clientPutAccepted) === 'ok' && messageText(clientPutAccepted) === 'saved' && clientPutAccepted.fetchCalls.length === 0)
}
const clientPutRejected = makeClientHarness(readySnapshot, false)
const rejectedPutView = clientPutRejected.renderDetail()
if (rejectedPutView !== undefined && rejectedPutView.button !== undefined) await rejectedPutView.button.props.onClick()
check('UI双步保存 mutate 失败（false）→ 无 PUT 且提示 savedPartial', clientPutRejected.fetchCalls.length === 0 && messageKind(clientPutRejected) === 'error' && messageText(clientPutRejected) === 'savedPartial')
const clientPutThrown = makeClientHarness(readySnapshot, 'throw')
const thrownPutView = clientPutThrown.renderDetail()
if (thrownPutView !== undefined && thrownPutView.button !== undefined) await thrownPutView.button.props.onClick()
check('UI双步保存 mutate 抛错 → 无 PUT 且提示 savedPartial', clientPutThrown.fetchCalls.length === 0 && messageKind(clientPutThrown) === 'error' && messageText(clientPutThrown) === 'savedPartial')
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
check('V05 Q04 初次draft=null先effect后重render，通知后读取rev43新十一键', firstPass !== undefined && firstPass.button === undefined && stable42View !== undefined && stable42View.button !== undefined && stable43View !== undefined && stable43View.button !== undefined && latestClient.subscribeCount === 1 && latestClient.notificationCount === 1 && latestClient.activeListeners === 1 && latestClient.renderStats.formRenders >= 3 && latestClient.renderStats.effectRuns >= 3 && latestCall !== undefined && latestCall.revision === 43 && latestCall.ops.length === 11 && isDeepStrictEqual(opValues(latestCall), updatedValues))

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
check('V05 Q04 恢复后新回调用rev43成功且仍仅一条十一键mutate', staleClient.calls.length === 2 && accepted43.revision === 43 && accepted43.ops.length === 11 && isDeepStrictEqual(opValues(accepted43), updatedValues) && messageKind(staleClient) === 'ok')

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
const localeDictionaries = localeRegistration === undefined ? {} : localeRegistration.dictionaries
const localeZhKeys = Object.keys(localeDictionaries.zh || {}).sort()
const localeEnKeys = Object.keys(localeDictionaries.en || {}).sort()
const localeDictionaryOk = localeZhKeys.length > 0 && JSON.stringify(localeZhKeys) === JSON.stringify(localeEnKeys) && [localeDictionaries.zh, localeDictionaries.en].every((dict) => dict !== null && typeof dict === 'object' && Object.keys(dict).length === localeZhKeys.length && Object.values(dict).every((value) => typeof value === 'string' && value.trim() !== ''))
check('V03/V05 locale.register 与 ConfigForms/slot 实际 trace 输入正确', localeRegistration !== undefined && localeDictionaryOk && surface.configFormGets.includes('dsh-extra-plan-settings') && surface.configFormServes.some((names) => names.length === 1 && names[0] === 'dsh-extra-plan-settings') && surface.slotInjectCalls.includes('plugins.detail.section') && surface.slotRegisterCalls.some((item) => item.name === 'plugins.detail.section' && item.id === 'dsh-extra-plan-settings-global'))
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


// ── G5-NOREMOUNT：settings 值变更不重挂 adapter，register 保持 5、dispose 保持 0 ──
{
  const noRemountFixture = makeSyncFixture()
  const noRemountEditor = makeEditor({ ...syncValues, gateWords: syncGateWords }, noRemountFixture.webPatch, { profileContext: noRemountFixture.webProfileContext })
  const noRemountCounts = { register: 0, dispose: 0 }
  const noRemountRun = await start(noRemountEditor, { mount: true, matrixStats: noRemountCounts })
  try {
    await new Promise((resolve) => setImmediate(resolve))
    await new Promise((resolve) => setImmediate(resolve))
    const mountedRegister = noRemountCounts.register
    noRemountEditor.state.rows[0].entry.options.config.plannerModel = 'no-remount-model'
    if (typeof noRemountRun.lifecycle.update === 'function') noRemountRun.lifecycle.update()
    await new Promise((resolve) => setImmediate(resolve))
    await new Promise((resolve) => setImmediate(resolve))
    check('SETTINGS_ONLY_SAVE_ADAPTER_MOUNT_COUNT_5', mountedRegister === 5 && noRemountCounts.register === 5)
    check('SETTINGS_ONLY_SAVE_ADAPTER_REGISTER_0_DISPOSE_0', noRemountCounts.dispose === 0 && noRemountRun.proxy.applyError === undefined)
  } finally {
    if (typeof noRemountRun.lifecycle.cleanup === 'function') await noRemountRun.lifecycle.cleanup()
    await noRemountRun.disposeRoot()
    rmSync(noRemountFixture.root, { recursive: true, force: true })
  }
}

// ── G5-HOSTPROXY：hostProxy 缺 configEditor 时 get-only 与 child 降级回调 ──
{
  const getOnlyFixture = makeSyncFixture()
  const getOnlyEditor = makeEditor({ ...syncValues, gateWords: syncGateWords }, getOnlyFixture.webPatch, { profileContext: getOnlyFixture.webProfileContext })
  const getOnlyRun = await start(getOnlyEditor, { mount: true, hostProxyMode: 'get-only/no-op-inject' })
  try {
    const getOnlyCallbacks = getOnlyRun.proxy.injectRequests.filter((item) => item.deps[0] === 'configEditor' && item.outcome.startsWith('callback')).length
    check('HOST-PROXY get-only：ctx.get 可解析 editor 但 inject 不回调', getOnlyRun.proxy.readViaGet() === getOnlyEditor && getOnlyCallbacks === 0)
  } finally {
    await getOnlyRun.disposeRoot()
    rmSync(getOnlyFixture.root, { recursive: true, force: true })
  }
  const childMissingFixture = makeSyncFixture()
  const childMissingEditor = makeEditor({ ...syncValues, gateWords: syncGateWords }, childMissingFixture.webPatch, { profileContext: childMissingFixture.webProfileContext })
  const childMissingRun = await start(childMissingEditor, { mount: true, hostProxyMode: 'child-missing-configEditor' })
  try {
    const childMissingCallbacks = childMissingRun.proxy.injectRequests.filter((item) => item.deps[0] === 'configEditor' && item.outcome.startsWith('callback')).length
    check('HOST-PROXY child 缺 configEditor：降级回调一次且 identity=missing', childMissingRun.proxy.readViaGet() === childMissingEditor && childMissingRun.proxy.childServiceIdentity === 'missing' && childMissingCallbacks === 1)
  } finally {
    if (typeof childMissingRun.lifecycle.cleanup === 'function') await childMissingRun.lifecycle.cleanup()
    await childMissingRun.disposeRoot()
    rmSync(childMissingFixture.root, { recursive: true, force: true })
  }
}

// ── G5-WORKER：root effect 独立生命周期、apply/API 非阻塞与幂等卸载 ──
{
  const lifecycleFixture = makeSyncFixture()
  const lifecycleEditor = makeEditor({ ...syncValues, gateWords: syncGateWords, webFetch: false }, lifecycleFixture.webPatch, { persistDocument: true, profileContext: lifecycleFixture.webProfileContext })
  const lifecycleRun = await start(lifecycleEditor, { mount: true })
  const childCleanupBefore = lifecycleRun.lifecycle.cleanup
  try {
    check('G5-WORKER 设置apply后不抛错且root可清理', lifecycleRun.proxy.applyError === undefined && typeof lifecycleRun.disposeRoot === 'function')
    const firstDispose = lifecycleRun.disposeRoot()
    const secondDispose = lifecycleRun.disposeRoot()
    check('G5-WORKER root disposer重复调用幂等且共享Promise', firstDispose === secondDispose)
    let disposeError
    try { await firstDispose } catch (error) { disposeError = error }
    check('G5-WORKER root disposer等待后台退出且无清理错误', disposeError === undefined)
    check('G5-WORKER root清理独立于configEditor子effect', typeof childCleanupBefore === 'function' && lifecycleRun.lifecycle.cleanup === childCleanupBefore)
  } finally {
    await lifecycleRun.disposeRoot()
    if (typeof lifecycleRun.lifecycle.cleanup === 'function') await lifecycleRun.lifecycle.cleanup()
    await new Promise((resolve) => lifecycleRun.server.close(resolve))
    rmSync(lifecycleFixture.root, { recursive: true, force: true })
  }
}

// ── G5-R5：settings真实忙算期间API、构造失败warn与默认早失败清理 ──
{
  const workerThreads = createRequire(import.meta.url)('node:worker_threads')
  const originalWorker = workerThreads.Worker
  const waitForMarker = async (markerPath) => {
    for (let index = 0; index < 100000; index += 1) {
      if (existsSync(markerPath)) return true
      await new Promise((resolve) => setImmediate(resolve))
    }
    return existsSync(markerPath)
  }
  const busyFixture = makeSyncFixture()
  const busyProgress = join(busyFixture.root, 'settings-worker-progress.marker')
  const busyDone = join(busyFixture.root, 'settings-worker-done.marker')
  const busyWorkerFile = join(busyFixture.root, 'settings-busy-worker.mjs')
  const busyProgressLiteral = JSON.stringify(busyProgress)
  const busyDoneLiteral = JSON.stringify(busyDone)
  const busyWorkerSource = [
    "import { parentPort, threadId, workerData } from 'node:worker_threads'",
    "import { writeFileSync } from 'node:fs'",
    "const release = new Int32Array(workerData.cancelBuffer)",
    "const progressMarker = " + busyProgressLiteral,
    "const doneMarker = " + busyDoneLiteral,
    "let started = false",
    "let progressed = false",
    "parentPort.postMessage({ type: 'ready', version: 1, id: workerData.id, threadId })",
    "parentPort.on('message', (message) => {",
    "  if (message.type === 'cancel') { Atomics.store(release, 0, 1); return }",
    "  if (message.type !== 'run' || started) return",
    "  started = true",
    "  parentPort.postMessage({ type: 'running', version: 1, id: workerData.id, threadId })",
    "  while (Atomics.load(release, 0) === 0) { let value = 0; for (let index = 0; index < 50000; index += 1) value = (value + index) & 65535; if (!progressed) { progressed = true; writeFileSync(progressMarker, 'progress') } }",
    "  writeFileSync(doneMarker, 'done')",
    "  parentPort.postMessage({ type: 'result', version: 1, id: workerData.id, result: { status: 'cancelled', reason: 'cancel-requested' } })",
    "  parentPort.close()",
    "})",
  ].join('\n')
  writeFileSync(busyWorkerFile, busyWorkerSource, 'utf8')
  const busyEditor = makeEditor({ ...syncValues, gateWords: syncGateWords, webFetch: false }, busyFixture.webPatch, { persistDocument: true, profileContext: busyFixture.webProfileContext })
  const BusyWorker = class extends originalWorker {
    constructor(_url, options) { super(busyWorkerFile, options) }
  }
  let busyRun
  try {
    workerThreads.Worker = BusyWorker
    syncBuiltinESMExports()
    busyRun = await start(busyEditor, { mount: true })
    const busyRunning = await waitForMarker(busyProgress)
    check('G5-R5 settings真实忙算running期间done未结束', busyRunning && !existsSync(busyDone))
    console.log('SETTINGS_BUSY_HTTP=' + JSON.stringify({ runningProgress: busyRunning, doneBeforeDispose: existsSync(busyDone) }))
    const busyDispose = busyRun.disposeRoot()
    const busyDisposeAgain = busyRun.disposeRoot()
    check('G5-R5 settings busy root dispose幂等', busyDispose === busyDisposeAgain)
    await busyDispose
    check('G5-R5 settings busy root dispose后真实Worker exit证据', existsSync(busyDone))
  } catch (error) {
    check('G5-R5 settings忙算夹具启动无异常', false)
  } finally {
    workerThreads.Worker = originalWorker
    syncBuiltinESMExports()
    if (busyRun !== undefined) {
      try { await busyRun.disposeRoot() } catch {}
      if (typeof busyRun.lifecycle?.cleanup === 'function') await busyRun.lifecycle.cleanup()
      await new Promise((resolve) => busyRun.server.close(resolve))
    }
    rmSync(busyFixture.root, { recursive: true, force: true })
  }
  const failedWorkerFixture = makeSyncFixture()
  const failedWorkerLedgerDir = join(failedWorkerFixture.root, 'logs', 'dsh-extra-plan')
  const failedWorkerSharedLogNames = ['extra-plan-agent-errors.jsonl', 'extra-plan-anchored.jsonl', 'extra-plan-request-errors.jsonl']
  mkdirSync(failedWorkerLedgerDir, { recursive: true })
  for (const [index, name] of failedWorkerSharedLogNames.entries()) writeFileSync(join(failedWorkerLedgerDir, name), JSON.stringify({ fixture: 'settings-shared-log', index }) + '\n', 'utf8')
  const failedWorkerSharedLogSnapshot = failedWorkerSharedLogNames.map((name) => {
    const target = join(failedWorkerLedgerDir, name)
    return { name, bytes: readFileSync(target), mtimeMs: statSync(target).mtimeMs }
  })
  const failedWorkerSharedLogsUnchanged = () => failedWorkerSharedLogSnapshot.every(({ name, bytes, mtimeMs }) => {
    const target = join(failedWorkerLedgerDir, name)
    return existsSync(target) && statSync(target).mtimeMs === mtimeMs && readFileSync(target).equals(bytes)
  })
  const failedWorkerArchive = join(failedWorkerLedgerDir, 'extra-plan-usage-ledger.jsonl')
  const failedWorkerDiagnostic = join(failedWorkerLedgerDir, 'extra-plan-usage-errors.jsonl')
  const failedWorkerEditor = makeEditor({ ...syncValues, gateWords: syncGateWords, webFetch: false }, failedWorkerFixture.webPatch, { persistDocument: true, profileContext: failedWorkerFixture.webProfileContext })
  const failureWarnings = []
  const previousWarn = console.warn
  let failedWorkerRun
  try {
    workerThreads.Worker = class {
      constructor() { throw new Error('g5-settings-worker-construction') }
    }
    syncBuiltinESMExports()
    console.warn = (...args) => { failureWarnings.push(args.map(String).join(' ')); previousWarn(...args) }
    failedWorkerRun = await start(failedWorkerEditor, { mount: true })
    await new Promise((resolve) => setImmediate(resolve))
    check('G5-R5 settings构造失败后告警且无同步归档兜底', failureWarnings.some((line) => line.includes('startup archive failed') && line.includes('worker-create-failed')) && !existsSync(failedWorkerArchive) && !existsSync(failedWorkerDiagnostic) && failedWorkerSharedLogsUnchanged())
    console.log('SETTINGS_WORKER_CREATE_FAILURE=' + JSON.stringify({ warned: failureWarnings.some((line) => line.includes('worker-create-failed')), ledgerProduced: existsSync(failedWorkerArchive), errorsProduced: existsSync(failedWorkerDiagnostic), sharedLogsUnchanged: failedWorkerSharedLogsUnchanged() }))
  } catch (error) {
    check('G5-R5 settings构造失败不阻断apply/API', false)
  } finally {
    console.warn = previousWarn
    workerThreads.Worker = originalWorker
    syncBuiltinESMExports()
    if (failedWorkerRun !== undefined) {
      try { await failedWorkerRun.disposeRoot() } catch {}
      if (typeof failedWorkerRun.lifecycle?.cleanup === 'function') await failedWorkerRun.lifecycle.cleanup()
      await new Promise((resolve) => failedWorkerRun.server.close(resolve))
    }
    rmSync(failedWorkerFixture.root, { recursive: true, force: true })
  }
  const earlyFixture = makeSyncFixture()
  const earlyEditor = makeEditor({ ...syncValues, gateWords: syncGateWords, webFetch: false }, earlyFixture.webPatch, { persistDocument: true, profileContext: earlyFixture.webProfileContext })
  let earlyError
  try {
    await start(earlyEditor, { mount: true, hostProxyMode: 'inject-throws' })
  } catch (error) {
    earlyError = error
  } finally {
    rmSync(earlyFixture.root, { recursive: true, force: true })
  }
  check('G5-R5 默认allowApplyError=false先保留inject-error再完成root清理', earlyError?.message === 'inject-error' && earlyError?.cleanupError === undefined)
  console.log('EARLY_APPLY_ERROR_CLEANUP=' + JSON.stringify({ message: earlyError?.message, cleanupError: earlyError?.cleanupError }))
}
check('G5-R5 root cleanupError统一进入最终FAIL计数', rootCleanupErrors.length === 0)

// ── G3：diagnostic prune 全局 owner 调度生命周期隔离取证 ──
{
  const cleanupFixture = makeSyncFixture()
  const errorFixture = makeSyncFixture()
  const cleanupLogDir = join(cleanupFixture.root, 'logs', 'dsh-extra-plan')
  const cleanupLogPath = join(cleanupLogDir, 'extra-plan-anchored.jsonl')
  const errorLogDir = join(errorFixture.root, 'logs', 'dsh-extra-plan')
  const errorLogPath = join(errorLogDir, 'extra-plan-anchored.jsonl')
  const expiredRow = JSON.stringify({ ts: '2000-01-01T00:00:00.000Z', fixture: 'g3-cleanup' }) + String.fromCharCode(10)
  mkdirSync(cleanupLogDir, { recursive: true })
  mkdirSync(errorLogDir, { recursive: true })
  writeFileSync(cleanupLogPath, expiredRow, 'utf8')
  writeFileSync(errorLogPath, expiredRow, 'utf8')
  const timerQueue = []
  const timerStats = { scheduled: 0, cleared: 0, callbackRuns: 0, lateCallbackRuns: 0 }
  const originalSetTimeout = globalThis.setTimeout
  const originalClearTimeout = globalThis.clearTimeout
  const originalWarn = console.warn
  const warningLines = []
  const cleanupErrors = []
  const activeRuns = new Set()
  const observedRuns = []
  const fsProbe = createFsAccessProbe([
    { name: 'cleanup', root: cleanupFixture.root },
    { name: 'error', root: errorFixture.root },
  ])
  const renameCounts = { cleanup: 0, error: 0 }
  const normalizeProbePath = (value) => {
    try { return resolve(String(value)).toLowerCase() } catch { return '' }
  }
  const pathUnder = (value, root) => {
    const target = normalizeProbePath(value)
    const base = normalizeProbePath(root)
    return target === base || target.startsWith(base + '\\') || target.startsWith(base + '/')
  }
  let originalRename
  let originalReaddir
  let errorReaddir = false
  let probesInstalled = false
  let closeCleanupRun
  const nextPendingTimer = () => {
    let pending
    for (const item of timerQueue) if (!item.fired && !item.cancelled) pending = item
    return pending
  }
  const fireTimer = (item, late = false) => {
    if (item === undefined) return
    item.invoke(late)
  }
  const diagnosticStateOf = (root) => root !== null && (typeof root === 'object' || typeof root === 'function')
    ? root[Symbol.for('dsh-extra-plan.diagnostic-prune-state')]
    : undefined
  const diagnosticKeyOf = (fixture) => {
    const normalized = resolve(fixture.root)
    return process.platform === 'win32' ? normalized.toLowerCase() : normalized
  }
  const cleanupRecordOf = (root, fixture) => {
    const state = diagnosticStateOf(root)
    return state instanceof Map ? state.get(diagnosticKeyOf(fixture)) : undefined
  }
  const waitForCleanupRecord = async (root, fixture) => {
    const record = cleanupRecordOf(root, fixture)
    if (record === undefined || record.promise === null || record.promise === undefined) return { record, done: false }
    await record.promise
    return { record, done: record.status === 'done' }
  }
  const createCleanupAppReady = () => {
    const state = { listeners: [], cancels: 0, commits: 0 }
    const service = {
      onReady(listener) {
        state.listeners.push(listener)
        return () => { state.cancels += 1 }
      },
      commit() {
        state.commits += 1
        for (const listener of [...state.listeners]) listener()
      },
    }
    return { service, state }
  }
  try {
    console.warn = (...args) => { warningLines.push(args.map(String).join(' ')) }
    globalThis.setTimeout = (callback, delay, ...args) => {
      if (delay !== 0) return originalSetTimeout(callback, delay, ...args)
      const item = {
        g3Controlled: true,
        cancelled: false,
        fired: false,
        unref() { return this },
        ref() { return this },
        invoke(late = false) {
          if (this.fired && !late) return
          this.fired = true
          timerStats.callbackRuns += 1
          if (late) timerStats.lateCallbackRuns += 1
          return callback(...args)
        },
      }
      timerQueue.push(item)
      timerStats.scheduled += 1
      return item
    }
    globalThis.clearTimeout = (item) => {
      if (item !== null && typeof item === 'object' && item.g3Controlled === true) {
        if (!item.cancelled) timerStats.cleared += 1
        item.cancelled = true
        return
      }
      return originalClearTimeout(item)
    }
    fsProbe.install()
    probesInstalled = true
    originalRename = fs.renameSync
    fs.renameSync = (...args) => {
      for (const name of ['cleanup', 'error']) {
        if (pathUnder(args[0], name === 'cleanup' ? cleanupFixture.root : errorFixture.root) || pathUnder(args[1], name === 'cleanup' ? cleanupFixture.root : errorFixture.root)) renameCounts[name] += 1
      }
      return originalRename(...args)
    }
    originalReaddir = fs.readdirSync
    fs.readdirSync = (target, ...args) => {
      if (errorReaddir && normalizeProbePath(target) === normalizeProbePath(errorLogDir)) throw new Error('g3-forced-prune-error')
      return originalReaddir(target, ...args)
    }
    syncBuiltinESMExports()
    const cleanupSettingsModule = await import('../../lib/settings.js')
    const hmrSettingsModule = await import('../../lib/settings.js?g3-cleanup-hmr')
    const hmrRunningSettingsModule = await import('../../lib/settings.js?g3-cleanup-hmr-running')
    const corePluginModule = await import('../../index.js')
    const coreCleanups = []
    const coreApply = (root) => {
      const ctx = {
        root,
        systemPrompt: { variable: () => () => {} },
        get: (name) => {
          if (name === 'profileContext') return cleanupFixture.webProfileContext
          if (name === 'dshHomePath') return () => cleanupFixture.root
          return undefined
        },
        effect: (fn) => { const cleanup = fn(); coreCleanups.push(cleanup); return cleanup },
        on: () => () => {},
      }
      corePluginModule.apply(ctx, { gateWords: syncGateWords })
    }
    const openCleanupRun = async (fixture, rootIdentity, settingsModule = cleanupSettingsModule, mount = false) => {
      const editor = makeEditor({ ...syncValues, gateWords: syncGateWords, webFetch: false }, fixture.webPatch, { persistDocument: true, profileContext: fixture.webProfileContext })
      const ready = createCleanupAppReady()
      const run = await start(editor, { mount, appReady: ready.service, rootIdentity, settingsModule })
      const opened = { run, ready, fixture, closed: false }
      activeRuns.add(opened)
      observedRuns.push(opened)
      return opened
    }
    closeCleanupRun = async (opened) => {
      if (opened === undefined || opened.closed) return
      opened.closed = true
      try { await opened.run.disposeRoot() } catch (error) { cleanupErrors.push(error) }
      try {
        if (typeof opened.run.lifecycle?.cleanup === 'function') await opened.run.lifecycle.cleanup()
      } catch (error) { cleanupErrors.push(error) }
      try {
        if (opened.run.server !== undefined) await new Promise((resolve) => opened.run.server.close(resolve))
      } catch (error) { cleanupErrors.push(error) }
      activeRuns.delete(opened)
    }
    const sharedRoot = {}
    const sharedRuns = []
    sharedRuns.push(await openCleanupRun(cleanupFixture, sharedRoot))
    for (let index = 0; index < 5; index += 1) sharedRuns.push(await openCleanupRun(cleanupFixture, sharedRoot))
    const sharedTimer = nextPendingTimer()
    check('G3 同root六次settings owner只安排一次0ms清理', timerStats.scheduled === 1 && sharedTimer !== undefined)
    const coreScheduleBefore = timerStats.scheduled
    const coreRenameBefore = renameCounts.cleanup
    for (let index = 0; index < 5; index += 1) coreApply(sharedRoot)
    check('G3 五次真实core apply不新增清理调度或实际清理', timerStats.scheduled === coreScheduleBefore && renameCounts.cleanup === coreRenameBefore)
    for (const cleanup of coreCleanups) if (typeof cleanup === 'function') cleanup()
    const hmrPendingScheduleBefore = timerStats.scheduled
    const hmrPendingRun = await openCleanupRun(cleanupFixture, sharedRoot, hmrSettingsModule)
    check('G3 pending共享owner期间HMR不重复调度', timerStats.scheduled === hmrPendingScheduleBefore && nextPendingTimer() === sharedTimer)
    const clearBeforeOldOwnerDispose = timerStats.cleared
    await sharedRuns[0].run.disposeRoot()
    check('G3 重叠owner先卸旧不取消仍存活的共享timer', timerStats.cleared === clearBeforeOldOwnerDispose && sharedTimer.cancelled === false)
    fireTimer(sharedTimer)
    const sharedRecordAtRun = cleanupRecordOf(sharedRoot, cleanupFixture)
    const hmrRunningRun = await openCleanupRun(cleanupFixture, sharedRoot, hmrRunningSettingsModule)
    check('G3 running共享owner期间HMR不重复调度', sharedRecordAtRun?.status === 'running' && timerStats.scheduled === hmrPendingScheduleBefore && nextPendingTimer() === undefined)
    const sharedBarrier = await waitForCleanupRecord(sharedRoot, cleanupFixture)
    const sharedFsAfterCleanup = fsProbe.count('cleanup')
    check('G3 同root实际清理恰一次且仅触达fixture fs', sharedBarrier.done && renameCounts.cleanup === 1 && sharedFsAfterCleanup > 0)
    await closeCleanupRun(hmrRunningRun)
    await closeCleanupRun(hmrPendingRun)
    for (const opened of sharedRuns) await closeCleanupRun(opened)
    check('G3 未commit fake appReady隔离账本', sharedRuns.every((opened) => opened.ready.state.commits === 0 && opened.ready.state.listeners.length === 1) && hmrPendingRun.ready.state.commits === 0 && hmrRunningRun.ready.state.commits === 0)
    const hmrScheduleBefore = timerStats.scheduled
    const hmrRun = await openCleanupRun(cleanupFixture, sharedRoot, hmrSettingsModule)
    check('G3 完成后同root模块HMR不再重复调度', timerStats.scheduled === hmrScheduleBefore && nextPendingTimer() === undefined)
    await closeCleanupRun(hmrRun)
    writeFileSync(cleanupLogPath, expiredRow, 'utf8')
    const newRoot = {}
    const newRootRun = await openCleanupRun(cleanupFixture, newRoot)
    const newRootTimer = nextPendingTimer()
    check('G3 新root允许新一轮调度', timerStats.scheduled === hmrScheduleBefore + 1 && newRootTimer !== undefined)
    const renameBeforeInFlightDispose = renameCounts.cleanup
    if (newRootTimer !== undefined) {
      fireTimer(newRootTimer)
      const firstDispose = newRootRun.run.disposeRoot()
      const secondDispose = newRootRun.run.disposeRoot()
      check('G3 在途清理卸载幂等并共享等待Promise', firstDispose === secondDispose)
      await firstDispose
      const newRootBarrier = await waitForCleanupRecord(newRoot, cleanupFixture)
      check('G3 卸载等待在途清理结算并完成一次真实重写', newRootBarrier.done && renameCounts.cleanup === renameBeforeInFlightDispose + 1 && !readFileSync(cleanupLogPath, 'utf8').includes('2000-01-01'))
    }
    await closeCleanupRun(newRootRun)
    writeFileSync(cleanupLogPath, expiredRow, 'utf8')
    const cancelRoot = {}
    const cancelRun = await openCleanupRun(cleanupFixture, cancelRoot)
    const cancelTimer = nextPendingTimer()
    const renameBeforeCancel = renameCounts.cleanup
    await cancelRun.run.disposeRoot()
    check('G3 所有owner在timer前卸载则取消且零实际清理', cancelTimer !== undefined && timerStats.cleared >= 1 && renameCounts.cleanup === renameBeforeCancel)
    const reOwnerScheduleBefore = timerStats.scheduled
    const reOwnerRun = await openCleanupRun(cleanupFixture, cancelRoot)
    const reOwnerTimer = nextPendingTimer()
    check('G3 取消后同root新owner可重新安排新timer', reOwnerTimer !== undefined && reOwnerTimer !== cancelTimer && timerStats.scheduled === reOwnerScheduleBefore + 1)
    const fsBeforeLateCancel = fsProbe.count('cleanup')
    if (cancelTimer !== undefined) fireTimer(cancelTimer, true)
    check('G3 旧callback在新记录存在时仍无效', timerStats.lateCallbackRuns >= 1 && fsProbe.count('cleanup') === fsBeforeLateCancel && renameCounts.cleanup === renameBeforeCancel)
    if (reOwnerTimer !== undefined) {
      fireTimer(reOwnerTimer)
      const reOwnerBarrier = await waitForCleanupRecord(cancelRoot, cleanupFixture)
      check('G3 新owner重新安排后仅实际清理一次', reOwnerBarrier.done && renameCounts.cleanup === renameBeforeCancel + 1 && !readFileSync(cleanupLogPath, 'utf8').includes('2000-01-01'))
    }
    await closeCleanupRun(cancelRun)
    await closeCleanupRun(reOwnerRun)
    const noRootReady = createCleanupAppReady()
    const noRootEditor = makeEditor({ ...syncValues, gateWords: syncGateWords, webFetch: false })
    const noRootScheduleBefore = timerStats.scheduled
    const noRootRun = await start(noRootEditor, { appReady: noRootReady.service, rootIdentity: {}, settingsModule: cleanupSettingsModule })
    check('G3 无H根不调度且只给可观测跳过告警', timerStats.scheduled === noRootScheduleBefore && warningLines.some((line) => line.includes('diagnostic log prune skipped: no-host-root')))
    const noRootOpened = { run: noRootRun, ready: noRootReady, closed: false }
    activeRuns.add(noRootOpened)
    observedRuns.push(noRootOpened)
    await closeCleanupRun(noRootOpened)
    errorReaddir = true
    const errorRoot = {}
    const errorRun = await openCleanupRun(errorFixture, errorRoot, cleanupSettingsModule)
    const errorTimer = nextPendingTimer()
    if (errorTimer !== undefined) fireTimer(errorTimer)
    const errorBarrier = await waitForCleanupRecord(errorRoot, errorFixture)
    check('G3 清理错误只warn且清理链可继续', errorTimer !== undefined && errorBarrier.done && warningLines.some((line) => line.includes('diagnostic log prune failed') && line.includes('g3-forced-prune-error')) && renameCounts.error === 0)
    errorReaddir = false
    await closeCleanupRun(errorRun)
    check('G3 全部fake appReady保持未commit且无root清理错误', observedRuns.every((opened) => opened.ready.state.commits === 0) && cleanupErrors.length === 0)
    console.log('MARKER G3 cleanup lifecycle ' + JSON.stringify({ scheduled: timerStats.scheduled, cleared: timerStats.cleared, callbackRuns: timerStats.callbackRuns, lateCallbackRuns: timerStats.lateCallbackRuns, renameCounts, fixtureFs: { cleanup: fsProbe.count('cleanup'), error: fsProbe.count('error') }, appReadyCommits: observedRuns.map((opened) => opened.ready.state.commits), cleanupErrors: cleanupErrors.length }))
  } catch (error) {
    check('G3 独立清理生命周期夹具未抛出异常', false)
    console.log('MARKER G3 cleanup lifecycle error=' + String(error && error.stack || error))
  } finally {
    for (const opened of [...activeRuns]) {
      try { await closeCleanupRun(opened) } catch {}
    }
    if (originalReaddir !== undefined) fs.readdirSync = originalReaddir
    if (originalRename !== undefined) fs.renameSync = originalRename
    if (originalReaddir !== undefined || originalRename !== undefined) syncBuiltinESMExports()
    if (probesInstalled) fsProbe.restore()
    globalThis.setTimeout = originalSetTimeout
    globalThis.clearTimeout = originalClearTimeout
    console.warn = originalWarn
    rmSync(cleanupFixture.root, { recursive: true, force: true })
    rmSync(errorFixture.root, { recursive: true, force: true })
  }
}

// ── G5-R7：appReady 分支后置扫描（apply 期零 Worker 构造、commit 后宏任务才起扫、dispose 两条拦截路径）──
{
  const workerThreads = createRequire(import.meta.url)('node:worker_threads')
  const originalWorker = workerThreads.Worker
  const constructionLog = []
  const cleanupErrors = []
  // 计数型 Worker stub：只记录构造次数，并按 usage-ledger Worker 协议回一条终态再 exit，使后台 done 可收敛、root 清理不悬挂。
  class CountingWorker {
    constructor(url, workerOptions) {
      const data = workerOptions !== null && typeof workerOptions === 'object' && workerOptions.workerData !== null && typeof workerOptions.workerData === 'object' ? workerOptions.workerData : {}
      this.workerDataSnapshot = data
      this.threadId = 9100 + constructionLog.length + 1
      this.listeners = new Map()
      this.postedMessages = []
      constructionLog.push({ url: String(url), id: data.id, threadId: this.threadId })
      setImmediate(() => this.emitStubTerminal())
    }
    on(event, listener) {
      const bucket = this.listeners.get(event)
      if (bucket === undefined) this.listeners.set(event, [listener])
      else bucket.push(listener)
      return this
    }
    postMessage(message) { this.postedMessages.push(message) }
    dispatchStubEvent(event, payload) {
      for (const listener of this.listeners.get(event) || []) listener(payload)
    }
    emitStubTerminal() {
      const data = this.workerDataSnapshot
      const version = data.version === undefined ? 1 : data.version
      this.dispatchStubEvent('message', { version, id: data.id, type: 'ready', threadId: this.threadId })
      const cancelled = this.postedMessages.some((message) => message !== null && typeof message === 'object' && message.type === 'cancel')
      if (!cancelled) this.dispatchStubEvent('message', { version, id: data.id, type: 'running', threadId: this.threadId })
      this.dispatchStubEvent('message', { version, id: data.id, type: 'result', threadId: this.threadId, result: { id: data.id, version, status: cancelled ? 'cancelled' : 'up-to-date', reason: cancelled ? 'cancel-requested' : 'stub-up-to-date' } })
      this.dispatchStubEvent('exit', 0)
    }
  }
  // 假 appReady 服务：onReady 收集 listener 并返回取消函数（保留已注册 listener 以便验证 closed 闸门）；commit 同步遍历已收集 listener。
  const createFakeAppReady = () => {
    const state = { listeners: [], cancels: 0, commits: 0 }
    const service = {
      onReady(listener) {
        state.listeners.push(listener)
        return () => { state.cancels += 1 }
      },
      commit() {
        state.commits += 1
        for (const listener of [...state.listeners]) listener()
      },
    }
    return { service, state, listenerCount: () => state.listeners.length }
  }
  const nextImmediate = () => new Promise((resolve) => setImmediate(resolve))
  const openReadyRun = async (fixture) => {
    const editor = makeEditor({ ...syncValues, gateWords: syncGateWords, webFetch: false }, fixture.webPatch, { persistDocument: true, profileContext: fixture.webProfileContext })
    const ready = createFakeAppReady()
    const run = await start(editor, { mount: true, appReady: ready.service })
    return { run, ready }
  }
  const closeReadyRun = async (run, fixture) => {
    try { await run.disposeRoot() } catch (error) { cleanupErrors.push(error) }
    if (typeof run.lifecycle?.cleanup === 'function') await run.lifecycle.cleanup()
    await new Promise((resolve) => run.server.close(resolve))
    rmSync(fixture.root, { recursive: true, force: true })
  }
  const readyFixture = makeSyncFixture()
  let constructedAfterStart = -1
  let listenerCountAfterStart = -1
  let constructedAfterCommitStack = -1
  let constructedAfterImmediate = -1
  let clearImmediatePathConstructed = -1
  let disposeFirstPathConstructed = -1
  try {
    workerThreads.Worker = CountingWorker
    syncBuiltinESMExports()
    const opened = await openReadyRun(readyFixture)
    try {
      constructedAfterStart = constructionLog.length
      listenerCountAfterStart = opened.ready.listenerCount()
      check('G5-R7 appReady启动后Worker构造数为0', constructedAfterStart === 0)
      check('G5-R7 appReady启动后onReady listener数为1', listenerCountAfterStart === 1)
      opened.ready.service.commit()
      constructedAfterCommitStack = constructionLog.length
      check('G5-R7 commit同一同步栈内Worker构造数仍为0', constructedAfterCommitStack === 0)
      await nextImmediate()
      constructedAfterImmediate = constructionLog.length
      check('G5-R7 commit后一拍setImmediate Worker构造数为1', constructedAfterImmediate === 1)
      // 再让一拍，等 stub 的 ready/running/result/exit 协议终态收敛，使 dispose 走正常退出而非取消协议。
      await nextImmediate()
    } finally {
      await closeReadyRun(opened.run, readyFixture)
    }
    // clearImmediate 路径：commit 已排好待起扫宏任务后同栈 dispose，待起扫任务被清掉，构造数不增。
    const clearImmediateFixture = makeSyncFixture()
    const clearImmediateOpened = await openReadyRun(clearImmediateFixture)
    try {
      clearImmediateOpened.ready.service.commit()
      const constructedBeforeDispose = constructionLog.length
      await closeReadyRun(clearImmediateOpened.run, clearImmediateFixture)
      await nextImmediate()
      clearImmediatePathConstructed = constructionLog.length
      check('G5-R7 commit后同栈dispose经clearImmediate使Worker构造数不增', clearImmediatePathConstructed === constructedBeforeDispose)
    } finally {
      rmSync(clearImmediateFixture.root, { recursive: true, force: true })
    }
    // closed 闸门：commit 之前 dispose，之后的 commit 回调不再起扫，构造数不增。
    const disposeFirstFixture = makeSyncFixture()
    const disposeFirstOpened = await openReadyRun(disposeFirstFixture)
    try {
      await closeReadyRun(disposeFirstOpened.run, disposeFirstFixture)
      const constructedBeforeCommit = constructionLog.length
      disposeFirstOpened.ready.service.commit()
      await nextImmediate()
      disposeFirstPathConstructed = constructionLog.length
      check('G5-R7 commit前dispose则commit后Worker构造数不增', disposeFirstPathConstructed === constructedBeforeCommit)
    } finally {
      rmSync(disposeFirstFixture.root, { recursive: true, force: true })
    }
    check('G5-R7 appReady用例root清理无错误', cleanupErrors.length === 0)
  } finally {
    workerThreads.Worker = originalWorker
    syncBuiltinESMExports()
    rmSync(readyFixture.root, { recursive: true, force: true })
  }
  console.log('MARKER G5-R7 appReady后置扫描 ' + JSON.stringify({ constructedAfterStart, listenerCountAfterStart, constructedAfterCommitStack, constructedAfterImmediate, clearImmediatePathConstructed, disposeFirstPathConstructed, cleanupErrors: cleanupErrors.length, checks: ['G5-R7 appReady启动后Worker构造数为0', 'G5-R7 appReady启动后onReady listener数为1', 'G5-R7 commit同一同步栈内Worker构造数仍为0', 'G5-R7 commit后一拍setImmediate Worker构造数为1', 'G5-R7 commit后同栈dispose经clearImmediate使Worker构造数不增', 'G5-R7 commit前dispose则commit后Worker构造数不增'] }))
}

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
