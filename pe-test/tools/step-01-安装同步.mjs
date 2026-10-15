// 安装/启动同步专项：初始官方 adapter、settled-only 保存与结构 handoff 分离。
// 不触碰真实 DSH_HOME/profile；真实 Loader/生产消息链保留 HUMAN 边界。
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { createRequire, registerHooks } from 'node:module'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { isDeepStrictEqual } from 'node:util'
import { parsePresetYaml } from '../../plugins/dsh-extra-plan/lib/preset-settings.js'
import {
  SETTINGS_ROW_ID,
  activeLegacyRow,
  assetDefinition,
  definitionWithProjection,
  mountPresetSync,
  structuralFingerprint,
} from '../../plugins/dsh-extra-plan/lib/preset-sync.js'
import { GATE_WORD_FIELDS } from '../../plugins/dsh-extra-plan/lib/gate-words.js'
import { createQqbotSettingsSynchronizer } from '../../plugins/dsh-extra-plan/lib/qqbot-settings-sync.js'

const ROOT = new URL('../..', import.meta.url)
const OFFICIAL_ROOT = 'C:\\Users\\Administrator\\AppData\\Roaming\\npm\\node_modules\\@deepseek-ai\\dsh'
try {
  const anchor = createRequire(join(OFFICIAL_ROOT, 'package.json'))
  const yamlUrl = new URL('file:///' + anchor.resolve('js-yaml').replaceAll('\\\\', '/')).href
  if (typeof registerHooks === 'function') registerHooks({ resolve(specifier, context, next) {
    if (specifier === 'js-yaml') return { url: yamlUrl, shortCircuit: true }
    return next(specifier, context)
  } })
} catch { /* 静态合同仍可执行；宿主缺依赖时运行时项会明确失败 */ }
const patchText = readFileSync(new URL('plugins/dsh-extra-plan/cordis.patch.yml', ROOT), 'utf8')
const definition = assetDefinition()
const gate = Object.fromEntries(GATE_WORD_FIELDS.map((item, index) => [item.field, '词' + index]))
const completeSettings = {
  anchoredBootstrap: true,
  creativeMode: false,
  webFetch: true,
  toolPresentationMode: 'ptc',
  runcodeCatchGate: false,
  crossProviderPlannerModel: false,
  plannerModel: 'model-initial',
  plannerPromptSuffix: 'suffix-initial',
  exploreBudget: 18,
  otherAgentModel: '',
  gateWords: gate,
}
let pass = 0
let fail = 0
function check(label, condition) {
  if (condition) { pass += 1; console.log('PASS  ' + label) }
  else { fail += 1; console.log('FAIL  ' + label) }
}
function deferred() {
  let resolve
  const promise = new Promise((done) => { resolve = done })
  return { promise, resolve }
}
async function flush(times = 4) {
  for (let i = 0; i < times; i += 1) {
    await Promise.resolve()
    await new Promise((resolve) => setImmediate(resolve))
  }
}
function makeEditor(config) {
  const row = { entry: { options: { id: SETTINGS_ROW_ID, config: structuredClone(config) } }, inherited: {}, override: {} }
  const state = { rows: [row], edits: 0 }
  return {
    state,
    configuration: () => state.rows,
    documentPath: '',
    edit: async (entry, change) => {
      const current = state.rows.find((item) => item.entry === entry)
      if (current === undefined) throw new Error('entry disappeared')
      current.entry.options.config = change(structuredClone(current.entry.options.config), current.inherited)
      state.edits += 1
    },
  }
}
function makeContext(editor, pluginImpl, trace = [], adapterFailureEvent = 'adapter-rejected') {
  let updateListener
  let updateOff = 0
  let pluginCalls = 0
  let pluginDisposals = 0
  const received = []
  const ctx = {
    configEditor: editor,
    on: (event, callback) => {
      if (event !== 'internal/update') return undefined
      updateListener = callback
      return () => { updateOff += 1; updateListener = undefined }
    },
    plugin: async (preset, receivedDefinition) => {
      pluginCalls += 1
      received.push(receivedDefinition)
      trace.push('adapter-start')
      try {
        const fiber = await pluginImpl(receivedDefinition)
        trace.push('adapter-resolved')
        return { dispose: async () => { pluginDisposals += 1; trace.push('adapter-dispose'); if (fiber !== undefined && typeof fiber.dispose === 'function') await fiber.dispose() } }
      } catch (error) {
        trace.push(adapterFailureEvent)
        throw error
      }
    },
  }
  return {
    ctx,
    received,
    get updateListener() { return updateListener },
    get updateOff() { return updateOff },
    get pluginCalls() { return pluginCalls },
    get pluginDisposals() { return pluginDisposals },
  }
}
function settledShape(snapshot) {
  return snapshot !== null && typeof snapshot === 'object' && snapshot.values !== undefined && snapshot.gateWords !== undefined &&
    Object.keys(snapshot.values).sort().join('/') === 'anchoredBootstrap/creativeMode/crossProviderPlannerModel/exploreBudget/otherAgentModel/plannerModel/plannerPromptSuffix/runcodeCatchGate/toolPresentationMode/webFetch' &&
    Object.keys(snapshot.gateWords).sort().join('/') === GATE_WORD_FIELDS.map((item) => item.field).sort().join('/')
}
const SETTING_KEYS = Object.freeze(['anchoredBootstrap', 'creativeMode', 'webFetch', 'toolPresentationMode', 'runcodeCatchGate', 'crossProviderPlannerModel', 'plannerModel', 'plannerPromptSuffix', 'exploreBudget', 'otherAgentModel'])
function targetConfigOf(text) {
  const parsed = parsePresetYaml(text)
  const row = Array.isArray(parsed) ? parsed.find((item) => item !== null && typeof item === 'object' && (item.id === SETTINGS_ROW_ID || item.override?.id === SETTINGS_ROW_ID)) : undefined
  return row === undefined ? undefined : row.override?.config || row.config
}
function completeSyncConfig(text, snapshot) {
  try { return isDeepStrictEqual(targetConfigOf(text), { ...snapshot.values, gateWords: snapshot.gateWords }) } catch { return false }
}
function makeProfileFixture() {
  const root = mkdtempSync(join(tmpdir(), 'dsh-extra-plan-install-adapter-'))
  const webDir = join(root, 'profiles', 'web')
  const qqDir = join(root, 'profiles', 'qqbot-sync')
  mkdirSync(webDir, { recursive: true })
  mkdirSync(join(qqDir, 'node_modules', 'dsh-extra-plan-qqbot'), { recursive: true })
  writeFileSync(join(webDir, 'package.json'), JSON.stringify({ dsh: { profile: { bundles: [] } } }), 'utf8')
  writeFileSync(join(qqDir, 'package.json'), JSON.stringify({ dsh: { profile: { bundles: ['@tencent-connect/dsh-qqbot'] } } }), 'utf8')
  const webPatch = join(webDir, 'cordis.patch.yml')
  const qqPatch = join(qqDir, 'cordis.patch.yml')
  writeFileSync(webPatch, '[]', 'utf8')
  writeFileSync(qqPatch, '- id: user-custom\n  name: custom\n', 'utf8')
  return { root, webPatch, qqPatch }
}
function createProfileSync(fixture, trace) {
  const terminal = []
  const synchronizer = createQqbotSettingsSynchronizer({ onResult: (result) => { terminal.push(result); trace.push('profile-sync-terminal') } })
  const settle = async (snapshot) => {
    trace.push('settled-snapshot')
    writeFileSync(fixture.webPatch, JSON.stringify([{ id: SETTINGS_ROW_ID, config: { ...snapshot.values, gateWords: snapshot.gateWords } }]), 'utf8')
    trace.push('web-patch-written')
    return await synchronizer.enqueue({ documentPath: fixture.webPatch, snapshot, env: { DSH_HOME: undefined, DSH_PROFILE: undefined } })
  }
  return { settle, terminal }
}
function profileSyncOk(fixture, snapshot, terminal) {
  return terminal.length > 0 && terminal.at(-1).status === 'synced' && terminal.at(-1).pending === false && existsSync(fixture.webPatch) && existsSync(fixture.qqPatch) && completeSyncConfig(readFileSync(fixture.webPatch, 'utf8'), snapshot) && completeSyncConfig(readFileSync(fixture.qqPatch, 'utf8'), snapshot)
}
function trigger(stats) {
  if (typeof stats.updateListener === 'function') stats.updateListener()
}

check('DEFINITION_INITIAL_17_ROWS_OK', definition.id === 'extra-plan' && definition.plugins.length === 17 && definitionWithProjection({ webFetch: true, toolPresentationMode: 'both', gateWords: gate }).plugins.length === 17)
check('LEGACY_OWNER_STATES_OK', [0, 1, 2].every((state) => activeLegacyRow([{ entry: { options: { id: 'preset-extra-plan' }, fiber: { state } } }])) && !activeLegacyRow([{ entry: { options: { id: 'preset-extra-plan' }, fiber: { state: 3 } } }]))
const source = readFileSync(new URL('../../plugins/dsh-extra-plan/lib/preset-sync.js', import.meta.url), 'utf8')
function sourceBlock(sourceText, marker) {
  const start = sourceText.indexOf(marker)
  if (start < 0) return ''
  const firstOpen = sourceText.indexOf('{', start)
  const signatureClose = sourceText.indexOf(')', start)
  const open = signatureClose >= 0 && firstOpen < signatureClose ? sourceText.indexOf('{', signatureClose) : firstOpen
  if (open < 0) return sourceText.slice(start)
  let depth = 0
  let quote = ''
  let escaped = false
  let lineComment = false
  let blockComment = false
  for (let index = open; index < sourceText.length; index += 1) {
    const char = sourceText[index]
    const next = sourceText[index + 1]
    if (lineComment) { if (char === String.fromCharCode(10)) lineComment = false; continue }
    if (blockComment) { if (char === '*' && next === '/') { blockComment = false; index += 1 }; continue }
    if (quote !== '') {
      if (escaped) { escaped = false; continue }
      if (char === String.fromCharCode(92)) { escaped = true; continue }
      if (char === quote) quote = ''
      continue
    }
    if (char === '/' && next === '/') { lineComment = true; index += 1; continue }
    if (char === '/' && next === '*') { blockComment = true; index += 1; continue }
    if (char === String.fromCharCode(34) || char === "'" || char === String.fromCharCode(96)) { quote = char; continue }
    if (char === '{') depth += 1
    if (char === '}') { depth -= 1; if (depth === 0) return sourceText.slice(start, index + 1) }
  }
  return sourceText.slice(start)
}
const mountSource = sourceBlock(source, 'export function mountPresetSync')
const initialSource = sourceBlock(mountSource, 'const initialMount = async () =>')
const structuralSource = sourceBlock(mountSource, 'const structuralHandoff = async')
const settledStart = mountSource.indexOf('const settledOnlyUpdate =')
const settledEnd = mountSource.indexOf('const offUpdate', settledStart)
const settledSource = settledStart >= 0 && settledEnd > settledStart ? mountSource.slice(settledStart, settledEnd) : ''
const updateSource = sourceBlock(mountSource, "const offUpdate = typeof child.on === 'function' ? child.on('internal/update'")
const structuralStop = updateSource.indexOf('if (!structural) return')
const settingsOnlySource = structuralStop >= 0 ? updateSource.slice(0, structuralStop + 'if (!structural) return'.length) : ''
const noRemountStaticOk =
  mountSource.includes('child.plugin(OfficialAgentPreset') &&
  mountSource.includes('activeLegacyRow(') &&
  mountSource.includes('structuralFingerprint') &&
  mountSource.includes('structuralHandoff') &&
  /const settledOnlyUpdate\s*=\s*\(state\) => settledSettingsUpdate\(state\)/.test(settledSource) &&
  settingsOnlySource.includes('const settledPromise = settledOnlyUpdate(state)') &&
  settingsOnlySource.includes('if (!structural) return') &&
  !/child\.plugin\s*\(|disposeFiber\s*\(|adapterFiber/.test(settledSource + settingsOnlySource) &&
  initialSource.indexOf('settledSettingsUpdate') >= 0 &&
  initialSource.indexOf('mountOfficialAdapter') > initialSource.indexOf('settledSettingsUpdate') &&
  structuralSource.indexOf('await settledPromise') >= 0 &&
  structuralSource.indexOf('await mountOfficialAdapter') > structuralSource.indexOf('await settledPromise')
check('SETTLED_STRUCTURAL_LIFECYCLE_SYMBOLS_OK', mountSource.includes('initialMount') && mountSource.includes('settledOnlyUpdate') && mountSource.includes('structuralHandoff') && mountSource.includes('structuralFingerprint'))
if (noRemountStaticOk) console.log('SETTINGS_ONLY_NO_REMOUNT_STATIC_OK')
else { console.log('FAIL SETTINGS_ONLY_NO_REMOUNT_STATIC_OK'); fail += 1 }

const settledEvents = []
const initialEditor = makeEditor(completeSettings)
const initialStats = makeContext(initialEditor, async () => ({ dispose: async () => {} }))
const initialDispose = mountPresetSync(initialStats.ctx, { onSettledSettings: async (snapshot) => { settledEvents.push(snapshot) } })
await flush()
check('INITIAL_OFFICIAL_ADAPTER_REGISTER_1_17_DEFINITION_OK', initialStats.pluginCalls === 1 && initialStats.received.length === 1 && initialStats.received[0].plugins.length === 17)
check('INITIAL_SETTLED_COMPLETE_10_PLUS_GATE_OK', settledEvents.length === 1 && settledShape(settledEvents[0]))
const initialCalls = initialStats.pluginCalls
const initialDisposals = initialStats.pluginDisposals
const settingsChanges = {
  anchoredBootstrap: false,
  creativeMode: true,
  webFetch: false,
  toolPresentationMode: 'native',
  runcodeCatchGate: true,
  crossProviderPlannerModel: true,
  plannerModel: 'model-next',
  plannerPromptSuffix: 'suffix-next',
  exploreBudget: 27,
  otherAgentModel: 'other-next',
  gateWords: Object.fromEntries(GATE_WORD_FIELDS.map((item, index) => [item.field, '新词' + index])),
}
for (const [key, value] of Object.entries(settingsChanges)) {
  initialEditor.state.rows[0].entry.options.config[key] = structuredClone(value)
  trigger(initialStats)
  await flush()
}
check('SETTINGS_ONLY_ADAPTER_REGISTER_0_DISPOSE_0_OK', initialStats.pluginCalls === initialCalls && initialStats.pluginDisposals === initialDisposals && settledEvents.length === 12 && settledShape(settledEvents.at(-1)))
await initialDispose()

const baseSnapshot = { values: Object.fromEntries(SETTING_KEYS.map((key) => [key, completeSettings[key]])), gateWords: completeSettings.gateWords }
async function runFixtureFailureCase(label, pluginImpl, failureEvent, plannerModel) {
  const trace = []
  const diagnostics = []
  const fixture = makeProfileFixture()
  const profileSync = createProfileSync(fixture, trace)
  const editor = makeEditor(completeSettings)
  const stats = makeContext(editor, pluginImpl, trace, failureEvent)
  const dispose = mountPresetSync(stats.ctx, {
    onSettledSettings: profileSync.settle,
    onAdapterError: (diagnostic) => { diagnostics.push(diagnostic); trace.push('adapter-diagnostic') },
  })
  await flush(8)
  editor.state.rows[0].entry.options.config.plannerModel = plannerModel
  trigger(stats)
  await flush(8)
  const snapshot = { values: { ...baseSnapshot.values, plannerModel }, gateWords: baseSnapshot.gateWords }
  const terminalIndex = trace.indexOf('profile-sync-terminal')
  const adapterStartIndex = trace.indexOf('adapter-start')
  const failureIndex = trace.indexOf(failureEvent)
  const ok = profileSync.terminal.length >= 2 && profileSyncOk(fixture, snapshot, profileSync.terminal) &&
    terminalIndex >= 0 && terminalIndex < adapterStartIndex && adapterStartIndex < failureIndex &&
    trace.filter((event) => event === failureEvent).length === 1 && stats.pluginCalls === 1 && stats.pluginDisposals === 0 &&
    diagnostics.length === 1 && diagnostics[0].phase === 'initialMount'
  console.log('FIXTURE_TRACE ' + JSON.stringify({ case: failureEvent, trace, terminalIndex, adapterStartIndex, failureIndex, pluginCalls: stats.pluginCalls, pluginDisposals: stats.pluginDisposals, terminal: profileSync.terminal.at(-1) }))
  check(label, ok)
  await dispose()
  rmSync(fixture.root, { recursive: true, force: true })
}
await runFixtureFailureCase('FIXTURE_ADAPTER_THROW_COMPLETE_PATCH_SETTLED_BEFORE_FAILURE_OK', () => { throw new Error('adapter throw') }, 'adapter-thrown', 'after-throw')
await runFixtureFailureCase('FIXTURE_ADAPTER_REJECT_COMPLETE_PATCH_SETTLED_BEFORE_FAILURE_OK', () => Promise.reject(new Error('adapter reject')), 'adapter-rejected', 'after-reject')

const adapterGate = deferred()
let hangingResolved = false
const hangingTrace = []
const hangingDiagnostics = []
const hangingFixture = makeProfileFixture()
const hangingProfileSync = createProfileSync(hangingFixture, hangingTrace)
const hangingEditor = makeEditor(completeSettings)
const hangingStats = makeContext(hangingEditor, async () => adapterGate.promise.then((fiber) => { hangingResolved = true; return fiber }), hangingTrace)
const hangingDispose = mountPresetSync(hangingStats.ctx, {
  onSettledSettings: hangingProfileSync.settle,
  onAdapterError: (diagnostic) => { hangingDiagnostics.push(diagnostic); hangingTrace.push('adapter-diagnostic') },
})
await flush(8)
hangingEditor.state.rows[0].entry.options.config.plannerModel = 'while-adapter-hangs'
trigger(hangingStats)
await flush(8)
const hangingSnapshot = { values: { ...baseSnapshot.values, plannerModel: 'while-adapter-hangs' }, gateWords: baseSnapshot.gateWords }
const hangingTerminalIndex = hangingTrace.indexOf('profile-sync-terminal')
const hangingAdapterStartIndex = hangingTrace.indexOf('adapter-start')
const hangingBeforeRelease = profileSyncOk(hangingFixture, hangingSnapshot, hangingProfileSync.terminal) &&
  hangingTerminalIndex >= 0 && hangingTerminalIndex < hangingAdapterStartIndex && hangingResolved === false &&
  !hangingTrace.includes('adapter-resolved') && !hangingTrace.includes('adapter-diagnostic') &&
  hangingStats.pluginCalls === 1 && hangingStats.pluginDisposals === 0 && hangingDiagnostics.length === 0
adapterGate.resolve({ dispose: async () => {} })
await flush(8)
const hangingResolvedIndex = hangingTrace.indexOf('adapter-resolved')
const hangingAfterRelease = hangingResolved && hangingResolvedIndex > hangingTerminalIndex && hangingStats.pluginDisposals === 0
await hangingDispose()
const hangingOk = hangingBeforeRelease && hangingAfterRelease && hangingStats.pluginDisposals === 1
console.log('FIXTURE_TRACE ' + JSON.stringify({ case: 'hang', trace: hangingTrace, terminalIndex: hangingTerminalIndex, adapterStartIndex: hangingAdapterStartIndex, resolvedIndex: hangingResolvedIndex, pluginCalls: hangingStats.pluginCalls, pluginDisposals: hangingStats.pluginDisposals }))
check('FIXTURE_ADAPTER_HANG_COMPLETE_PATCH_SETTLED_BEFORE_RESOLVE_OK', hangingOk)
rmSync(hangingFixture.root, { recursive: true, force: true })

const structuralEditor = makeEditor(completeSettings)
const structuralStats = makeContext(structuralEditor, async () => ({ dispose: async () => {} }))
const structuralEvents = []
const structuralDispose = mountPresetSync(structuralStats.ctx, { onSettledSettings: async (snapshot) => { structuralEvents.push(snapshot) } })
await flush()
const beforeStructural = structuralStats.pluginCalls
structuralEditor.state.rows.push({ entry: { options: { id: 'non-settings-declaration', name: 'declaration', config: { enabled: true } } }, disabled: false })
trigger(structuralStats)
await flush(8)
const afterAdd = structuralStats.pluginCalls
structuralEditor.state.rows.pop()
trigger(structuralStats)
await flush(8)
const afterRemove = structuralStats.pluginCalls
const legacyRow = { entry: { options: { id: 'preset-extra-plan', name: 'legacy', config: {} }, fiber: { state: 1 } }, disabled: false }
structuralEditor.state.rows.push(legacyRow)
trigger(structuralStats)
await flush(8)
const afterLegacy = structuralStats.pluginCalls
structuralEditor.state.rows.pop()
trigger(structuralStats)
await flush(8)
const afterReturn = structuralStats.pluginCalls
check('STRUCTURAL_HANDOFF_ONLY_OK', beforeStructural === 1 && afterAdd === 2 && afterRemove === 3 && afterLegacy === 3 && afterReturn === 4 && structuralStats.pluginDisposals === 3 && structuralEvents.length >= 5)
await structuralDispose()

const disposeGate = deferred()
let disposeSettledStarted = 0
const disposeEditor = makeEditor(completeSettings)
const disposeStats = makeContext(disposeEditor, async () => ({ dispose: async () => {} }))
const disposeOwner = mountPresetSync(disposeStats.ctx, { onSettledSettings: async () => { disposeSettledStarted += 1; await disposeGate.promise } })
await flush()
const closing = disposeOwner()
await flush()
check('DISPOSE_WAITS_IN_FLIGHT_SETTLED_AND_OFFS_UPDATES', disposeSettledStarted === 1 && disposeStats.updateOff === 1)
disposeGate.resolve()
await closing
trigger(disposeStats)
await flush()
check('DISPOSE_AFTER_SETTLED_NO_NEW_ADAPTER_OR_SYNC', disposeStats.pluginCalls === 0 && disposeStats.pluginDisposals === 0)
await disposeOwner()

console.log('HUMAN  {"scope":"REAL-LOADER-OR-ADAPTER","reason":"未执行真实部署/生产 profile；官方 adapter 图由部署后复测"}')
console.log('\n通过 ' + pass + ', 失败 ' + fail)
if (fail > 0) {
  process.exitCode = 1
  process.exit(1)
}
