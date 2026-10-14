// 单一全局行迁移回归：完整值、旧投影/旧 body/默认优先级、歧义、非法词表与真实 edit 目标。
// 所有 patch 与 editor 均为内存夹具；不访问或写入生产 profile/DSH_HOME。
import { readFileSync } from 'node:fs'
import { isDeepStrictEqual } from 'node:util'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  SETTING_DEFINITIONS,
  SETTINGS_ROW_ID,
  captureRowSettings,
  parsePresetYaml,
} from '../../plugins/dsh-extra-plan/lib/preset-settings.js'
import {
  assetDefinition,
  readLegacyState,
  resolveUnifiedConfig,
  restateSettingsConfig,
  syncPreset,
} from '../../plugins/dsh-extra-plan/lib/preset-sync.js'
import { validateGateWords } from '../../plugins/dsh-extra-plan/lib/gate-words.js'

const ROOT = fileURLToPath(new URL('../..', import.meta.url))
const ASSET = join(ROOT, 'plugins/dsh-extra-plan/assets/presets/extra-plan/agent.cordis.yml')
function findTemplateGateWords(value) {
  if (Array.isArray(value)) {
    for (const item of value) {
      const found = findTemplateGateWords(item)
      if (found !== undefined) return found
    }
    return undefined
  }
  if (value === null || typeof value !== 'object') return undefined
  if (value.id === 'extra-plan' && value.config !== null && typeof value.config === 'object' && value.config.gateWords !== undefined) {
    return structuredClone(value.config.gateWords)
  }
  for (const child of Object.values(value)) {
    const found = findTemplateGateWords(child)
    if (found !== undefined) return found
  }
  return undefined
}
const gate = findTemplateGateWords(parsePresetYaml(readFileSync(ASSET, 'utf8')))
if (gate === undefined) throw new Error('模板缺少 extra-plan gateWords')
const descriptorDefaults = Object.fromEntries(SETTING_DEFINITIONS.map((item) => [item.key, item.defaultValue]))
const legacyProjectionDefaults = Object.freeze({ webFetch: true, toolPresentationMode: 'ptc' })
const legacyBodyDefaults = Object.freeze({
  anchoredBootstrap: true,
  creativeMode: false,
  webFetch: true,
  toolPresentationMode: 'ptc',
  runcodeCatchGate: false,
  crossProviderPlannerModel: false,
  plannerModel: 'body-model',
  plannerPromptSuffix: 'body-suffix',
  exploreBudget: 7,
  otherAgentModel: 'body-other',
})
function defaultGlobalAfter() {
  return { ...descriptorDefaults, gateWords: structuredClone(gate) }
}
const invalidGate = { routeDirect: 'one' }
const complete = {
  anchoredBootstrap: true,
  creativeMode: false,
  webFetch: false,
  toolPresentationMode: 'native',
  runcodeCatchGate: false,
  crossProviderPlannerModel: false,
  plannerModel: 'authority-model',
  plannerPromptSuffix: 'authority-suffix',
  exploreBudget: 31,
  otherAgentModel: 'authority-other',
  gateWords: gate,
}

let pass = 0
let fail = 0
function check(label, condition) {
  if (condition) { pass += 1; console.log('PASS  ' + label) }
  else { fail += 1; console.log('FAIL  ' + label) }
}
function throws(fn, text) {
  try { fn(); return false } catch (error) { return text === undefined || String(error && error.message || error).includes(text) }
}
function yamlScalar(value) {
  if (typeof value === 'string') return "'" + value.replaceAll("'", "''") + "'"
  return String(value)
}
function gateLines(indent) {
  return Object.entries(gate).map(([key, value]) => indent + key + ': ' + yamlScalar(value))
}
function syncRow(values = {}) {
  const lines = [
    '- id: extra-plan-preset-sync',
    '  config:',
    '    webFetch: ' + yamlScalar(values.webFetch === undefined ? true : values.webFetch),
    '    toolPresentationMode: ' + yamlScalar(values.toolPresentationMode === undefined ? 'ptc' : values.toolPresentationMode),
    '    gateWords:',
  ]
  return lines.concat(gateLines('      ')).join('\n')
}
function bodyRow(values = {}) {
  const plannerModel = values.plannerModel === undefined ? 'body-model' : values.plannerModel
  const budget = values.exploreBudget === undefined ? 7 : values.exploreBudget
  const lines = [
    '- id: preset-extra-plan',
    '  config:',
    '    id: extra-plan',
    '    name: legacy',
    '    description: legacy',
    '    order: 100',
    '    plugins:',
    '      - id: extra-plan',
    '        config:',
    '          anchoredBootstrap: true',
    '          creativeMode: false',
    '          runcodeCatchGate: false',
    '          crossProviderPlannerModel: false',
    '          plannerModel: ' + yamlScalar(plannerModel),
    '          plannerPromptSuffix: body-suffix',
    '          exploreBudget: ' + yamlScalar(budget),
    '          otherAgentModel: body-other',
    '          gateWords:',
  ]
  const bodyGate = values.gateWords === undefined ? gate : values.gateWords
  if (bodyGate === invalidGate) lines.push('            routeDirect: !!js "not-evaluated"')
  else lines.push(...Object.entries(bodyGate).map(([key, value]) => '            ' + key + ': ' + yamlScalar(value)))
  lines.push('      - id: tool-web', '        config:', '          fetch: ' + yamlScalar(values.webFetch === undefined ? true : values.webFetch))
  lines.push('      - id: tool-presentation', '        config:', '          mode: ' + yamlScalar(values.toolPresentationMode === undefined ? 'ptc' : values.toolPresentationMode))
  return lines.join('\n')
}
function patchOf({ sync = false, body = false, duplicateSync = false, invalidBodyGate = false } = {}) {
  const parts = []
  if (sync) parts.push(syncRow())
  if (duplicateSync) { parts.push(syncRow()); parts.push(syncRow()) }
  if (body) parts.push(bodyRow({ gateWords: invalidBodyGate ? invalidGate : undefined }))
  return parts.length === 0 ? '' : parts.join('\n') + '\n'
}
function makeEditor(initial = {}) {
  const row = { entry: { options: { id: SETTINGS_ROW_ID, config: structuredClone(initial) } }, inherited: {}, override: {} }
  const state = { rows: [row], edits: [] }
  return {
    state,
    configuration: () => state.rows,
    edit: async (entry, change) => {
      const current = state.rows.find((item) => item.entry === entry)
      if (current === undefined) throw new Error('settings entry disappeared')
      const next = change(structuredClone(current.entry.options.config), current.inherited)
      current.entry.options.config = next
      state.edits.push({ id: entry.options.id, config: structuredClone(next) })
    },
  }
}

function persistentRecordsFromPatch(patch) {
  const parsed = typeof patch === 'string' && patch.trim() !== '' ? parsePresetYaml(patch) : []
  return (Array.isArray(parsed) ? parsed : [])
    .filter((row) => row !== null && typeof row === 'object' && typeof row.id === 'string')
    .map((row, index) => {
      const config = row.config !== null && typeof row.config === 'object' ? structuredClone(row.config) : {}
      return {
        id: row.id,
        name: typeof row.name === 'string' ? row.name : 'legacy-' + row.id,
        config,
        gateWords: config.gateWords === undefined ? null : structuredClone(config.gateWords),
        plugins: Array.isArray(config.plugins) ? structuredClone(config.plugins) : [],
        metadata: { persistent: true, position: index },
      }
    })
}

function patchFromPersistentStore(store) {
  return JSON.stringify(store.legacyRows.map((row) => ({
    id: row.id,
    name: row.name,
    config: structuredClone(row.config),
  })))
}

function makePersistentEditor(initial = {}, patch = '', legacyVisible = true) {
  const store = {
    settings: {
      id: SETTINGS_ROW_ID,
      name: 'dsh-extra-plan/settings',
      config: structuredClone(initial),
      metadata: { owner: 'dsh-extra-plan-settings' },
    },
    legacyRows: persistentRecordsFromPatch(patch),
  }
  const globalRow = {
    entry: { options: { id: SETTINGS_ROW_ID, name: store.settings.name, config: store.settings.config } },
    inherited: {},
    override: {},
  }
  const legacyRows = store.legacyRows.map((record) => ({
    entry: { options: { id: record.id, name: record.name, config: record.config } },
    inherited: {},
    override: {},
  }))
  const allRows = [globalRow, ...legacyRows]
  const state = {
    rows: legacyVisible ? allRows : [globalRow],
    allRows,
    store,
    edits: [],
    rejectedEdits: [],
  }
  return {
    state,
    configuration: () => state.rows,
    readPatch: () => patchFromPersistentStore(state.store),
    edit: async (entry, change) => {
      const current = state.allRows.find((item) => item.entry === entry)
      if (current === undefined) throw new Error('settings entry disappeared')
      const id = entry.options.id
      if (id !== SETTINGS_ROW_ID) {
        state.rejectedEdits.push({ id })
        throw new Error('legacy entry writes are forbidden: ' + id)
      }
      const next = change(structuredClone(current.entry.options.config), current.inherited)
      current.entry.options.config = structuredClone(next)
      state.store.settings.config = structuredClone(next)
      state.edits.push({ id, config: structuredClone(next) })
    },
  }
}

async function runPersistentSync(settingsValues, patch, legacyVisible) {
  const editor = makePersistentEditor(settingsValues, patch, legacyVisible)
  const legacyBefore = structuredClone(editor.state.store.legacyRows)
  let applyCount = 0
  let appliedPlan = null
  const result = await syncPreset({
    settingsValues,
    readPatch: editor.readPatch,
    apply: async (plan) => {
      applyCount += 1
      appliedPlan = plan
      await applyPlanToEditor(plan, editor)
    },
  })
  return {
    result,
    editor,
    appliedPlan,
    applyCount,
    legacyBefore,
    legacyAfter: structuredClone(editor.state.store.legacyRows),
    patchAfter: editor.readPatch(),
  }
}

async function applyPlanToEditor(plan, editor) {
  if (plan === null || plan.settings === null) return
  const row = editor.state.rows.find((item) => item.entry.options.id === SETTINGS_ROW_ID)
  if (row === undefined) throw new Error('settings row missing in fixture')
  await editor.edit(row.entry, (current, inherited) => restateSettingsConfig(current, inherited, plan.settings.values))
}
async function runSync(settingsValues, patch) {
  const editor = makeEditor(settingsValues)
  let appliedPlan = null
  const result = await syncPreset({
    settingsValues,
    readPatch: () => patch,
    apply: async (plan) => { appliedPlan = plan; await applyPlanToEditor(plan, editor) },
  })
  return { result, editor, appliedPlan }
}

const definition = assetDefinition()
function findPluginRow(items, id) {
  for (const row of items || []) {
    if (row !== null && typeof row === 'object' && row.id === id) return row
    if (row !== null && typeof row === 'object' && Array.isArray(row.config)) {
      const nested = findPluginRow(row.config, id)
      if (nested !== undefined) return nested
    }
  }
  return undefined
}
function projectionOf(result) {
  const plugins = result.plan === undefined ? [] : result.plan.definition.plugins
  return {
    webFetch: findPluginRow(plugins, 'tool-web').config.fetch,
    toolPresentationMode: findPluginRow(plugins, 'tool-presentation').config.mode,
    gateWords: structuredClone(findPluginRow(plugins, 'extra-plan').config.gateWords),
  }
}
const expectedKeys = 'anchoredBootstrap|creativeMode|webFetch|toolPresentationMode|runcodeCatchGate|crossProviderPlannerModel|plannerModel|plannerPromptSuffix|exploreBudget|otherAgentModel'
check('V04 descriptor 十键顺序与稳定 settings locator', SETTING_DEFINITIONS.length === 10 && SETTING_DEFINITIONS.map((item) => item.key).join('|') === expectedKeys && SETTING_DEFINITIONS.every((item) => item.rowLocator.rowId === SETTINGS_ROW_ID))
check('V07 asset definition 17 行与 raw marker 保留（仅证明 marker 保留）', definition.plugins.length === 17 && JSON.stringify(definition).includes('__jsExpr') && readFileSync(ASSET, 'utf8').includes('!!js'))
check('V04 合法 gateWords 恰七键且输入不可变', (() => { const before = structuredClone(gate); const after = validateGateWords(gate); return Object.keys(after).length === 7 && JSON.stringify(gate) === JSON.stringify(before) })())

const legacyBoth = patchOf({ sync: true, body: true })
const legacyState = readLegacyState(legacyBoth)
check('V04 旧公开行优先：投影/词表/旧 body 可解析且来源准确', legacyState.projection.webFetch === true && legacyState.projectionSources.webFetch === 'legacy-projection' && legacyState.gateWordsSource === 'legacy-projection' && legacyState.legacyPlugins !== undefined)
const authority = resolveUnifiedConfig({ settingsValues: complete, readPatch: () => legacyBoth })
check('V04 完整当前值优先于旧冲突，十键与词表均保留', authority.values.plannerModel === complete.plannerModel && authority.values.exploreBudget === complete.exploreBudget && authority.values.webFetch === false && authority.values.toolPresentationMode === 'native' && authority.sources.webFetch === 'settings-row' && authority.sources.gateWords === 'settings-row')

const partial = resolveUnifiedConfig({ settingsValues: { plannerModel: complete.plannerModel }, readPatch: () => legacyBoth })
check('V04 部分当前值回退旧投影再到旧 body/默认，来源不混淆', partial.values.plannerModel === complete.plannerModel && partial.values.webFetch === true && partial.values.toolPresentationMode === 'ptc' && partial.values.exploreBudget === 7 && partial.sources.webFetch === 'legacy-projection' && partial.sources.exploreBudget === 'legacy-preset')
const bodyOnly = patchOf({ body: true })
const bodyState = readLegacyState(bodyOnly)
const bodyResolved = resolveUnifiedConfig({ settingsValues: {}, readPatch: () => bodyOnly })
check('V04 仅旧 body 独立覆盖：值来自旧 body，不伪称旧投影', bodyState.projectionSources.webFetch === 'legacy-preset' && bodyResolved.sources.webFetch === 'legacy-preset' && bodyResolved.sources.plannerModel === 'legacy-preset')
const projectionOnly = patchOf({ sync: true })
const projectionResolved = resolveUnifiedConfig({ settingsValues: {}, readPatch: () => projectionOnly })
check('V04 仅旧投影独立覆盖：实际读取 projection 行', projectionResolved.sources.webFetch === 'legacy-projection' && projectionResolved.values.webFetch === true && projectionResolved.values.toolPresentationMode === 'ptc')
const noOldResolved = resolveUnifiedConfig({ settingsValues: {}, readPatch: () => '' })
check('V04 完全无旧值仅使用资产默认', noOldResolved.sources.webFetch === 'default' && noOldResolved.sources.plannerModel === 'default' && noOldResolved.values.exploreBudget === 18)

const duplicatePatch = patchOf({ duplicateSync: true })
const duplicateState = readLegacyState(duplicatePatch)
const duplicateResolved = resolveUnifiedConfig({ settingsValues: {}, readPatch: () => duplicatePatch })
check('V04 重复旧行同值仍歧义，保留诊断且不取第一条', duplicateState.diagnostics.some((item) => item.includes('duplicate extra-plan-preset-sync')) && duplicateState.projection.webFetch === undefined && duplicateResolved.sources.webFetch === 'default')
const invalidOldPatch = patchOf({ body: true, invalidBodyGate: true })
const invalidOldState = readLegacyState(invalidOldPatch)
const invalidOldResolved = resolveUnifiedConfig({ settingsValues: {}, readPatch: () => invalidOldPatch })
check('V04 非法旧 gateWords 仅诊断/skip，不求值且回资产默认', invalidOldState.diagnostics.some((item) => item.includes('invalid legacy body gateWords')) && invalidOldResolved.sources.gateWords === 'default' && JSON.stringify(invalidOldState.legacyPlugins).includes('__jsExpr') && JSON.stringify(invalidOldState.legacyPlugins).includes('not-evaluated'))

const completeRun = await runSync(complete, '')
check('V04 完整合法当前值同步 idle，真实 editor 零 edit', completeRun.result.action === 'idle' && completeRun.editor.state.edits.length === 0)
const partialRun = await runSync({ plannerModel: complete.plannerModel }, legacyBoth)
check('V04 旧值迁移真实 apply 只 edit 唯一 settings entry 且保留完整十键', partialRun.result.action === 'written' && partialRun.editor.state.edits.length === 1 && partialRun.editor.state.edits[0].id === SETTINGS_ROW_ID && Object.keys(partialRun.editor.state.edits[0].config).filter((key) => key !== 'gateWords').length === 10 && partialRun.editor.state.edits[0].config.gateWords !== undefined)
const projectionRun = await runSync({}, projectionOnly)
check('V04 仅旧投影实际 apply 目标为唯一 settings 行，旧文本未变', projectionRun.result.action === 'written' && projectionRun.editor.state.edits.length === 1 && projectionRun.editor.state.edits[0].id === SETTINGS_ROW_ID && projectionOnly === patchOf({ sync: true }))
const bodyRun = await runSync({}, bodyOnly)
check('V04 仅旧 body 实际 apply 目标为唯一 settings 行且 body-model 保留', bodyRun.result.action === 'written' && bodyRun.editor.state.edits.length === 1 && bodyRun.editor.state.edits[0].id === SETTINGS_ROW_ID && bodyRun.editor.state.edits[0].config.plannerModel === 'body-model')
const noOldRun = await runSync({}, '')
check('V04 无旧值实际 apply 默认配置且无旧行 edit', noOldRun.result.action === 'written' && noOldRun.editor.state.edits.length === 1 && noOldRun.editor.state.edits[0].id === SETTINGS_ROW_ID && noOldRun.editor.state.edits[0].config.exploreBudget === 18)
const duplicateRun = await runSync({}, duplicatePatch)
check('V04 歧义迁移实际只写唯一 settings 行一次', duplicateRun.result.action === 'written' && duplicateRun.editor.state.edits.length === 1 && duplicateRun.editor.state.edits[0].id === SETTINGS_ROW_ID)

const invalidCurrentGateCases = [
  ['missing-key', (() => { const value = structuredClone(gate); delete value.routeDirect; return value })()],
  ['duplicate-value', { ...gate, routePlan: gate.routeDirect }],
  ['recommended-suffix', { ...gate, routeDirect: gate.routeDirect + ' (recommended)' }],
  ['crlf', { ...gate, routeDirect: 'direct\r\nline' }],
  ['js-expression', { ...gate, routeDirect: { __jsExpr: 'must-not-run' } }],
]
for (const [kind, words] of invalidCurrentGateCases) {
  const invalidCurrent = { ...complete, gateWords: words }
  const resolveBefore = structuredClone(invalidCurrent)
  const resolveFailed = throws(() => resolveUnifiedConfig({ settingsValues: invalidCurrent, readPatch: () => legacyBoth }), '当前全局 gateWords 非法')
  check('V02 ' + kind + ' resolve 拒绝且完整当前对象深等不变', resolveFailed && isDeepStrictEqual(invalidCurrent, resolveBefore))

  const restateBefore = structuredClone(invalidCurrent)
  const restateFailed = throws(() => restateSettingsConfig(invalidCurrent, {}, { webFetch: true }), 'gateWords')
  check('V02 ' + kind + ' restate 拒绝且输入深等不变', restateFailed && isDeepStrictEqual(invalidCurrent, restateBefore))

  const invalidEditor = makeEditor(invalidCurrent)
  const invalidSettingsConfig = invalidEditor.state.rows[0].entry.options.config
  const syncInputBefore = structuredClone(invalidSettingsConfig)
  const storageBefore = structuredClone(invalidEditor.state)
  const inputIdentity = invalidSettingsConfig === invalidEditor.state.rows[0].entry.options.config
  let applyCount = 0
  let syncFailed = false
  let syncError = ''
  try {
    await syncPreset({
      settingsValues: invalidSettingsConfig,
      readPatch: () => legacyBoth,
      apply: async (plan) => {
        applyCount += 1
        await applyPlanToEditor(plan, invalidEditor)
      },
    })
  } catch (error) {
    syncFailed = true
    syncError = String(error && error.message || error)
  }
  const inputUnchanged = isDeepStrictEqual(invalidSettingsConfig, syncInputBefore)
  const storageUnchanged = isDeepStrictEqual(invalidEditor.state, storageBefore)
  check('V02 ' + kind + ' sync 直接绑定真实 entry.options.config 身份', inputIdentity)
  check('V02 ' + kind + ' sync 严格失败且错误指向当前全局 gateWords', syncFailed && syncError.includes('当前全局 gateWords 非法'))
  check('V02 ' + kind + ' sync 在apply前失败、apply/edit均为零且输入/完整存储深等不变', applyCount === 0 && invalidEditor.state.edits.length === 0 && inputUnchanged && storageUnchanged)
}

const declaredOnlyGate = { routeDirect: '旧直', routePlan: '旧规', routeDisagree: '旧异', approvalApprove: '旧同', approvalReplan: '旧转', purposeRefine: '旧完', purposeRedo: '旧重' }
const declaredOnlyPlugins = structuredClone(definition.plugins)
findPluginRow(declaredOnlyPlugins, 'tool-web').config.fetch = true
findPluginRow(declaredOnlyPlugins, 'tool-presentation').config.mode = 'ptc'
findPluginRow(declaredOnlyPlugins, 'extra-plan').config.gateWords = structuredClone(declaredOnlyGate)
const declaredOnlyBefore = structuredClone(declaredOnlyPlugins)
const declaredOnlyRun = await syncPreset({ declaredPlugins: declaredOnlyPlugins })
const declaredOnlyExpected = { webFetch: true, toolPresentationMode: 'ptc', gateWords: declaredOnlyGate }
check('F03 syncPreset 仅 declaredPlugins 保留旧 web/mode/自定义七词', declaredOnlyRun.action === 'written' && isDeepStrictEqual(projectionOf(declaredOnlyRun), declaredOnlyExpected))
check('F03 declaredPlugins 回归输入不变', isDeepStrictEqual(declaredOnlyPlugins, declaredOnlyBefore))
const explicitGlobalRun = await syncPreset({
  declaredPlugins: declaredOnlyPlugins,
  settingsValues: { webFetch: false, toolPresentationMode: 'native', gateWords: gate },
})
const explicitGlobalExpected = { webFetch: false, toolPresentationMode: 'native', gateWords: gate }
check('F03 显式全局值优先于 declaredPlugins 旧投影/词表', explicitGlobalRun.action === 'written' && isDeepStrictEqual(projectionOf(explicitGlobalRun), explicitGlobalExpected))
let readPatchCalls = 0
const readPatchRun = await syncPreset({ readPatch: () => { readPatchCalls += 1; return bodyOnly } })
const readPatchExpected = { webFetch: true, toolPresentationMode: 'ptc', gateWords: gate }
check('F03 readPatch 分支保留旧 body 解析且只读取一次原始输入', readPatchRun.action === 'written' && readPatchCalls === 1 && isDeepStrictEqual(projectionOf(readPatchRun), readPatchExpected))
const explicitLegacyGate = { routeDirect: '显直', routePlan: '显规', routeDisagree: '显异', approvalApprove: '显同', approvalReplan: '显转', purposeRefine: '显完', purposeRedo: '显重' }
const explicitLegacyState = {
  authority: { values: {}, states: {} },
  projection: { webFetch: false, toolPresentationMode: 'native' },
  projectionSources: { webFetch: 'legacy-projection', toolPresentationMode: 'legacy-projection' },
  gateWords: explicitLegacyGate,
  gateWordsSource: 'legacy-projection',
  diagnostics: ['explicit legacyState marker'],
  legacyPlugins: declaredOnlyPlugins,
}
const explicitLegacyRun = await syncPreset({ declaredPlugins: declaredOnlyPlugins, readPatch: () => bodyOnly, legacyState: explicitLegacyState })
const explicitLegacyExpected = { webFetch: false, toolPresentationMode: 'native', gateWords: explicitLegacyGate }
check('F03 显式 legacyState 优先于 readPatch 与 declaredPlugins', explicitLegacyRun.action === 'written' && isDeepStrictEqual(projectionOf(explicitLegacyRun), explicitLegacyExpected) && explicitLegacyRun.plan.diagnostics.includes('explicit legacyState marker'))

const invalidCurrent = { ...complete, gateWords: invalidGate }
const invalidEditor = makeEditor(invalidCurrent)
check('V02 缺键样例保留显式非法值，合法矩阵已单独覆盖', isDeepStrictEqual(invalidCurrent.gateWords, invalidGate))
const repaired = restateSettingsConfig(invalidCurrent, {}, { gateWords: gate })
check('V02 合法显式整组修复允许且不改输入', JSON.stringify(repaired.gateWords) === JSON.stringify(gate) && JSON.stringify(invalidCurrent.gateWords) === JSON.stringify(invalidGate))
const validNoGatePatch = restateSettingsConfig(complete, {}, { webFetch: true })
check('V02 合法普通 patch 保留当前 gateWords 与其它九项', validNoGatePatch.webFetch === true && validNoGatePatch.toolPresentationMode === complete.toolPresentationMode && validNoGatePatch.exploreBudget === complete.exploreBudget && JSON.stringify(validNoGatePatch.gateWords) === JSON.stringify(gate))
const persistentMigrationCases = [
  {
    caseName: 'complete-current-old',
    settingsValues: complete,
    patch: legacyBoth,
    expectedEditCount: 0,
    expectedGlobalAfter: structuredClone(complete),
  },
  {
    caseName: 'partial-current-old',
    settingsValues: { plannerModel: complete.plannerModel },
    patch: legacyBoth,
    expectedEditCount: 1,
    expectedGlobalAfter: {
      ...defaultGlobalAfter(),
      ...legacyBodyDefaults,
      ...legacyProjectionDefaults,
      plannerModel: complete.plannerModel,
      gateWords: structuredClone(gate),
    },
  },
  {
    caseName: 'projection-only',
    settingsValues: {},
    patch: projectionOnly,
    expectedEditCount: 1,
    expectedGlobalAfter: {
      ...defaultGlobalAfter(),
      ...legacyProjectionDefaults,
      gateWords: structuredClone(gate),
    },
  },
  {
    caseName: 'body-only',
    settingsValues: {},
    patch: bodyOnly,
    expectedEditCount: 1,
    expectedGlobalAfter: {
      ...defaultGlobalAfter(),
      ...legacyBodyDefaults,
      gateWords: structuredClone(gate),
    },
  },
  {
    caseName: 'no-old-value',
    settingsValues: {},
    patch: '',
    expectedEditCount: 1,
    expectedGlobalAfter: defaultGlobalAfter(),
  },
  {
    caseName: 'duplicate-old',
    settingsValues: {},
    patch: duplicatePatch,
    expectedEditCount: 1,
    expectedGlobalAfter: defaultGlobalAfter(),
  },
  {
    caseName: 'invalid-old',
    settingsValues: {},
    patch: invalidOldPatch,
    expectedEditCount: 1,
    expectedGlobalAfter: {
      ...defaultGlobalAfter(),
      ...legacyBodyDefaults,
      gateWords: structuredClone(gate),
    },
  },
  {
    caseName: 'complete-current-no-old',
    settingsValues: complete,
    patch: '',
    expectedEditCount: 0,
    expectedGlobalAfter: structuredClone(complete),
  },
]
for (const { caseName, settingsValues, patch, expectedEditCount, expectedGlobalAfter } of persistentMigrationCases) {
  for (const legacyVisible of [true, false]) {
    const run = await runPersistentSync(settingsValues, patch, legacyVisible)
    const mode = legacyVisible ? 'visible' : 'withdrawn'
    const legacyRows = run.editor.state.store.legacyRows
    const oldIds = legacyRows.map((row) => row.id)
    const editedIds = run.editor.state.edits.map((edit) => edit.id)
    const actualGlobalAfter = run.editor.state.store.settings.config
    const expectedGlobalKeys = Object.keys(expectedGlobalAfter).sort()
    const actualGlobalKeys = Object.keys(actualGlobalAfter).sort()
    const allGlobalKeys = [...new Set([...expectedGlobalKeys, ...actualGlobalKeys])]
    const differingKeys = allGlobalKeys.filter((key) => !isDeepStrictEqual(actualGlobalAfter[key], expectedGlobalAfter[key]))
    const globalDeepEqual = isDeepStrictEqual(actualGlobalAfter, expectedGlobalAfter)
    const globalKeySetEqual = JSON.stringify(actualGlobalKeys) === JSON.stringify(expectedGlobalKeys)
    const legacyStoreDeepEqual = isDeepStrictEqual(run.legacyBefore, run.legacyAfter)
    const shapeOk = legacyRows.every((row) => typeof row.id === 'string' && typeof row.name === 'string' && row.config !== null && typeof row.config === 'object' && Object.prototype.hasOwnProperty.call(row, 'gateWords') && Object.prototype.hasOwnProperty.call(row, 'plugins'))
    const configTreeOk = legacyVisible
      ? run.editor.state.rows.slice(1).map((row) => row.entry.options.id).join('|') === oldIds.join('|')
      : run.editor.state.rows.length === 1 && run.editor.state.rows[0].entry.options.id === SETTINGS_ROW_ID
    console.log('K03 ' + caseName + ' ' + mode + ' expectedGlobalAfter=' + JSON.stringify(expectedGlobalAfter) + ' actualGlobalAfter=' + JSON.stringify(actualGlobalAfter) + ' differingKeys=' + JSON.stringify(differingKeys) + ' editCount=' + run.editor.state.edits.length + ' expectedEditCount=' + expectedEditCount + ' editedIds=' + JSON.stringify(editedIds) + ' legacyStoreDeepEqual=' + legacyStoreDeepEqual)
    check('V04 Q03 ' + caseName + ' ' + mode + ' 完整十项+gateWords实际全局与独立期望deep-equal', globalDeepEqual)
    check('V04 Q03 ' + caseName + ' ' + mode + ' 实际全局键集合与独立期望一致', globalKeySetEqual)
    check('V04 Q03 ' + caseName + ' ' + mode + ' 旧store含id/name/config/gateWords/plugins且before/after deep-equal', shapeOk && legacyStoreDeepEqual && run.legacyBefore.length === legacyRows.length)
    check('V04 Q03 ' + caseName + ' ' + mode + ' configuration树与撤出状态准确，编辑仅全局ID', configTreeOk && run.editor.state.edits.length === expectedEditCount && editedIds.every((id) => id === SETTINGS_ROW_ID) && run.editor.state.rejectedEdits.length === 0)
    if (legacyRows.length > 0) {
      const patchBeforeProbe = run.editor.readPatch()
      const nameBeforeProbe = legacyRows[0].name
      legacyRows[0].name = nameBeforeProbe + '-probe'
      const patchChanged = run.editor.readPatch() !== patchBeforeProbe
      legacyRows[0].name = nameBeforeProbe
      check('V04 Q03 ' + caseName + ' ' + mode + ' readPatch由可变store实时生成且恢复后deep-equal', patchChanged && isDeepStrictEqual(run.legacyBefore, run.editor.state.store.legacyRows))
    }
  }
}

const blockedLegacyEditor = makePersistentEditor({}, legacyBoth, true)
const blockedBefore = structuredClone(blockedLegacyEditor.state.store.legacyRows)
for (const legacyId of ['extra-plan-preset-sync', 'preset-extra-plan']) {
  const legacyEntry = blockedLegacyEditor.state.allRows.find((row) => row.entry.options.id === legacyId).entry
  let rejected = false
  try { await blockedLegacyEditor.edit(legacyEntry, () => ({ overwritten: true })) } catch { rejected = true }
  check('V04 Q03 误写旧ID ' + legacyId + ' 明确失败且旧store deep-equal', rejected && blockedLegacyEditor.state.rejectedEdits.at(-1).id === legacyId && isDeepStrictEqual(blockedBefore, blockedLegacyEditor.state.store.legacyRows))
}

const captured = captureRowSettings('- id: dsh-extra-plan-settings\n  config:\n    plannerModel: x\n', SETTING_DEFINITIONS)
check('V04 当前唯一行缺项可识别 rowPresent=true，不能猜旧行', captured.rowPresent === true && captured.states.plannerModel === 'captured' && captured.states.webFetch === 'missing')

console.log('\n通过 ' + pass + ', 失败 ' + fail)
process.exit(fail === 0 ? 0 : 1)
