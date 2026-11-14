// 当前 settings 行解析/补齐回归：旧输入只作旁路哨兵，不再提供任何生产值。
// 所有 fixture 均在 W 内存/临时目录；不访问或写入生产 profile、DSH_HOME 或真实会话。
import { readFileSync } from 'node:fs'
import { isDeepStrictEqual } from 'node:util'
import { join } from 'node:path'
import { makeFixtureDir } from '../_shared/workspace-paths.mjs'
import { createPathContext } from '../../plugins/dsh-extra-plan/lib/path-policy.js'
import { fileURLToPath } from 'node:url'
import { DEFAULT_SETTINGS } from '../../plugins/dsh-extra-plan/lib/preset-defaults.generated.js'
import {
  SETTING_DEFINITIONS,
  SETTINGS_ROW_ID,
  captureRowSettings,
  parsePresetYaml,
} from '../../plugins/dsh-extra-plan/lib/preset-settings.js'
import * as presetSyncModule from '../../plugins/dsh-extra-plan/lib/preset-sync.js'
import { GATE_WORD_FIELDS, validateGateWords } from '../../plugins/dsh-extra-plan/lib/gate-words.js'
import { createOutput } from '../_shared/test-output.mjs'

const {
  assetDefinition,
  roleDefinitionOf,
  roleDefinitionsWithPresentation,
  resolveUnifiedConfig,
  restateSettingsConfig,
  syncPreset,
} = presetSyncModule

const ROOT = fileURLToPath(new URL('../..', import.meta.url))
const migrationFixture = makeFixtureDir({ label: 'settings-migration' })
const MIGRATION_PATH_CONTEXT = createPathContext({ hostDataRoot: migrationFixture.root })
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
  if (value.id === 'extra-plan' && value.config !== null && typeof value.config === 'object' && value.config.gateWords !== undefined) return structuredClone(value.config.gateWords)
  for (const child of Object.values(value)) {
    const found = findTemplateGateWords(child)
    if (found !== undefined) return found
  }
  return undefined
}

const gate = findTemplateGateWords(parsePresetYaml(readFileSync(ASSET, 'utf8')))
if (gate === undefined) throw new Error('模板缺少 extra-plan gateWords')
const frozenDefaults = Object.freeze({ ...DEFAULT_SETTINGS })
const descriptorKeys = SETTING_DEFINITIONS.map((item) => item.key)
const expectedKeys = 'anchoredBootstrap|creativeMode|webFetch|toolPresentationMode|runcodeCatchGate|crossProviderPlannerModel|plannerModel|plannerPromptSuffix|exploreBudget|otherAgentModel|reviewerUsesPlannerModel'
const defaultGlobalAfter = () => ({ ...frozenDefaults, gateWords: structuredClone(gate) })
const invalidGate = { routeMain: 'not-valid' }
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
  reviewerUsesPlannerModel: false,
  gateWords: structuredClone(gate),
}
const legacyGate = Object.fromEntries(GATE_WORD_FIELDS.map((item) => [item.field, 'legacy-' + item.field]))
const legacySentinelValues = Object.freeze({ webFetch: true, toolPresentationMode: 'ptc', plannerModel: 'legacy-model', exploreBudget: 7 })

let pass = 0
let fail = 0
const output = createOutput({ argv: process.argv.slice(2) })
function check(label, condition) {
  if (condition) pass += 1
  else fail += 1
  output.assertion(condition, label, true, condition)
}
function throws(fn, text) {
  try { fn(); return false } catch (error) { return text === undefined || String(error && error.message || error).includes(text) }
}
function yamlScalar(value) {
  if (typeof value === 'string') return "'" + value.replaceAll("'", "''") + "'"
  return String(value)
}
function gateLines(indent, words = legacyGate) {
  return Object.entries(words).map(([key, value]) => indent + key + ': ' + yamlScalar(value))
}
function legacyRow(values = legacySentinelValues, id = 'extra-plan-preset-sync') {
  return [
    '- id: ' + id,
    '  config:',
    '    webFetch: ' + yamlScalar(values.webFetch),
    '    toolPresentationMode: ' + yamlScalar(values.toolPresentationMode),
    '    gateWords:',
    ...gateLines('      '),
  ].join('\n')
}
function legacyBodyRow(values = legacySentinelValues, words = legacyGate) {
  return [
    '- id: preset-extra-plan',
    '  config:',
    '    id: extra-plan',
    '    name: legacy',
    '    plugins:',
    '      - id: extra-plan',
    '        config:',
    '          plannerModel: ' + yamlScalar(values.plannerModel),
    '          exploreBudget: ' + yamlScalar(values.exploreBudget),
    '          gateWords:',
    ...gateLines('            ', words),
    '      - id: tool-web',
    '        config:',
    '          fetch: ' + yamlScalar(values.webFetch),
    '      - id: tool-presentation',
    '        config:',
    '          mode: ' + yamlScalar(values.toolPresentationMode),
  ].join('\n')
}
const legacyPatch = legacyRow() + '\n' + legacyBodyRow() + '\n'
const duplicateLegacyPatch = legacyRow() + '\n' + legacyRow() + '\n'
const invalidLegacyPatch = legacyBodyRow(legacySentinelValues, { ...legacyGate, routeMain: { __jsExpr: 'must-not-run' } }) + '\n'

function makeEditor(initial = {}) {
  const row = { entry: { options: { id: SETTINGS_ROW_ID, name: 'dsh-extra-plan/settings', config: structuredClone(initial) } }, inherited: {}, override: {} }
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
      return { id: row.id, name: typeof row.name === 'string' ? row.name : 'legacy-' + row.id, config, gateWords: config.gateWords === undefined ? null : structuredClone(config.gateWords), plugins: Array.isArray(config.plugins) ? structuredClone(config.plugins) : [], metadata: { persistent: true, position: index } }
    })
}
function patchFromPersistentStore(store) {
  return JSON.stringify(store.legacyRows.map((row) => ({ id: row.id, name: row.name, config: structuredClone(row.config) })))
}
function makePersistentEditor(initial = {}, patch = '', legacyVisible = true) {
  const store = {
    settings: { id: SETTINGS_ROW_ID, name: 'dsh-extra-plan/settings', config: structuredClone(initial), metadata: { owner: 'dsh-extra-plan-settings' } },
    legacyRows: persistentRecordsFromPatch(patch),
  }
  const globalRow = { entry: { options: { id: SETTINGS_ROW_ID, name: store.settings.name, config: store.settings.config } }, inherited: {}, override: {} }
  const legacyRows = store.legacyRows.map((record) => ({ entry: { options: { id: record.id, name: record.name, config: record.config } }, inherited: {}, override: {} }))
  const allRows = [globalRow, ...legacyRows]
  const state = { rows: legacyVisible ? allRows : [globalRow], allRows, store, edits: [], rejectedEdits: [] }
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
function retiredOptions(base, counters) {
  const options = { ...base }
  for (const name of ['declaredPlugins', 'readPatch', 'legacyState', 'assetPlugins']) Object.defineProperty(options, name, { enumerable: true, get() { counters[name] += 1; throw new Error('retired option touched: ' + name) } })
  return options
}
async function applyPlanToEditor(plan, editor) {
  if (plan === null || plan.settings === null) return
  const row = editor.state.allRows === undefined ? editor.state.rows.find((item) => item.entry.options.id === SETTINGS_ROW_ID) : editor.state.allRows.find((item) => item.entry.options.id === SETTINGS_ROW_ID)
  if (row === undefined) throw new Error('settings row missing in fixture')
  await editor.edit(row.entry, (current, inherited) => restateSettingsConfig(current, inherited, plan.settings.values))
}
async function runSync(settingsValues) {
  const editor = makeEditor(settingsValues)
  const counters = { declaredPlugins: 0, readPatch: 0, legacyState: 0, assetPlugins: 0 }
  let appliedPlan = null
  let applyCount = 0
  const result = await syncPreset(retiredOptions({ pathContext: MIGRATION_PATH_CONTEXT, settingsValues, apply: async (plan) => { applyCount += 1; appliedPlan = plan; await applyPlanToEditor(plan, editor) } }, counters))
  return { result, editor, appliedPlan, applyCount, counters }
}
async function runPersistentSync(settingsValues, patch, legacyVisible) {
  const editor = makePersistentEditor(settingsValues, patch, legacyVisible)
  const legacyBefore = structuredClone(editor.state.store.legacyRows)
  const counters = { declaredPlugins: 0, readPatch: 0, legacyState: 0, assetPlugins: 0 }
  let appliedPlan = null
  let applyCount = 0
  const result = await syncPreset(retiredOptions({ pathContext: MIGRATION_PATH_CONTEXT, settingsValues, apply: async (plan) => { applyCount += 1; appliedPlan = plan; await applyPlanToEditor(plan, editor) } }, counters))
  return { result, editor, appliedPlan, applyCount, counters, legacyBefore, legacyAfter: structuredClone(editor.state.store.legacyRows) }
}
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
function projectionOf(definition) {
  const plugins = definition === undefined ? [] : definition.plugins
  const web = findPluginRow(plugins, 'tool-web')
  const native = findPluginRow(plugins, 'tool-executor-native')
  const ptc = findPluginRow(plugins, 'tool-executor-ptc')
  const gateRow = findPluginRow(plugins, 'extra-plan')
  return { webFetch: web?.config?.fetch, native: native !== undefined, ptc: ptc !== undefined, gateWords: gateRow?.config?.gateWords }
}
function currentOnlyOptions(settingsValues, counters) {
  return retiredOptions({ settingsValues }, counters)
}

check('M17 namespace 导入后退役旧导出缺席', presetSyncModule.readLegacyState === undefined && presetSyncModule.declarationBodyMatchesAsset === undefined && typeof presetSyncModule.mountPresetSync === 'function')
check('V04 descriptor 十一键顺序与稳定 settings locator', SETTING_DEFINITIONS.length === 11 && descriptorKeys.join('|') === expectedKeys && SETTING_DEFINITIONS.every((item) => item.rowLocator.rowId === SETTINGS_ROW_ID))
check('V04 合法 gateWords 恰六键且输入不可变', (() => { const before = structuredClone(gate); const after = validateGateWords(gate); return Object.keys(after).length === 6 && isDeepStrictEqual(gate, before) })())
const definition = assetDefinition()
check('M21 主资产可解析且保留17条插件行', Array.isArray(definition.plugins) && definition.plugins.length === 17)
check('M21 全部角色definition可解析且保留17条插件行', (() => { try { const roles = roleDefinitionsWithPresentation(definition); return roles.length === 4 && roles.every((item) => Array.isArray(item.plugins) && item.plugins.length > 0) } catch { return false } })())
check('M21 缺失角色资产严格失败', throws(() => roleDefinitionOf('__missing-role__'), '未知角色预设'))

const fullCounters = { declaredPlugins: 0, readPatch: 0, legacyState: 0, assetPlugins: 0 }
const fullResolved = resolveUnifiedConfig(currentOnlyOptions(complete, fullCounters))
check('M18 完整当前值只取settings-row且patch为空', isDeepStrictEqual(fullResolved.values, Object.fromEntries(Object.entries(complete).filter(([key]) => key !== 'gateWords'))) && fullResolved.sources.gateWords === 'settings-row' && Object.keys(fullResolved.patch).length === 0 && fullResolved.diagnostics.length === 0 && fullCounters.declaredPlugins === 0 && fullCounters.readPatch === 0 && fullCounters.legacyState === 0)
const partialCounters = { declaredPlugins: 0, readPatch: 0, legacyState: 0, assetPlugins: 0 }
const partialResolved = resolveUnifiedConfig(currentOnlyOptions({ plannerModel: complete.plannerModel }, partialCounters))
check('M20 部分当前值只取新默认不受旧哨兵影响', partialResolved.values.plannerModel === complete.plannerModel && partialResolved.values.webFetch === frozenDefaults.webFetch && partialResolved.values.toolPresentationMode === frozenDefaults.toolPresentationMode && partialResolved.values.exploreBudget === frozenDefaults.exploreBudget && partialResolved.sources.plannerModel === 'settings-row' && partialResolved.sources.webFetch === 'default' && partialResolved.sources.gateWords === 'default' && Object.keys(partialResolved.patch).length === 11 && partialCounters.readPatch === 0 && partialCounters.declaredPlugins === 0)
const oldOnlyCounters = { declaredPlugins: 0, readPatch: 0, legacyState: 0, assetPlugins: 0 }
const oldOnlyResolved = resolveUnifiedConfig(currentOnlyOptions({}, oldOnlyCounters))
check('M20 仅旧ID/旧mode/旧词表输入不进入值来源patch诊断', isDeepStrictEqual(oldOnlyResolved.values, frozenDefaults) && oldOnlyResolved.sources.webFetch === 'default' && oldOnlyResolved.sources.toolPresentationMode === 'default' && oldOnlyResolved.sources.gateWords === 'default' && oldOnlyResolved.diagnostics.length === 0 && oldOnlyCounters.readPatch === 0 && oldOnlyCounters.declaredPlugins === 0 && oldOnlyCounters.legacyState === 0)
const ordinaryInvalid = { webFetch: 'true', toolPresentationMode: 'old-mode', plannerModel: 7, exploreBudget: 0, gateWords: structuredClone(gate) }
const ordinaryInvalidBefore = structuredClone(ordinaryInvalid)
const ordinaryInvalidResolved = resolveUnifiedConfig(currentOnlyOptions(ordinaryInvalid, { declaredPlugins: 0, readPatch: 0, legacyState: 0, assetPlugins: 0 }))
check('M20 当前普通非法项只取新默认并生成patch，合法gateWords保留', ordinaryInvalidResolved.values.webFetch === frozenDefaults.webFetch && ordinaryInvalidResolved.values.toolPresentationMode === frozenDefaults.toolPresentationMode && ordinaryInvalidResolved.values.plannerModel === frozenDefaults.plannerModel && ordinaryInvalidResolved.values.exploreBudget === frozenDefaults.exploreBudget && ordinaryInvalidResolved.sources.webFetch === 'default' && ordinaryInvalidResolved.sources.gateWords === 'settings-row' && isDeepStrictEqual(ordinaryInvalid, ordinaryInvalidBefore))
const emptyFalse = { ...complete, webFetch: false, creativeMode: false, plannerModel: '', plannerPromptSuffix: '', otherAgentModel: '', gateWords: structuredClone(gate) }
const emptyFalseResolved = resolveUnifiedConfig(currentOnlyOptions(emptyFalse, { declaredPlugins: 0, readPatch: 0, legacyState: 0, assetPlugins: 0 }))
check('M20 合法空串/false不被当作缺失', emptyFalseResolved.values.webFetch === false && emptyFalseResolved.values.creativeMode === false && emptyFalseResolved.values.plannerModel === '' && emptyFalseResolved.values.plannerPromptSuffix === '' && emptyFalseResolved.values.otherAgentModel === '' && emptyFalseResolved.sources.plannerModel === 'settings-row')
const retiredResolverOptions = { settingsValues: complete }
let retiredResolverTouches = 0
for (const name of ['declaredPlugins', 'readPatch', 'legacyState']) Object.defineProperty(retiredResolverOptions, name, { get() { retiredResolverTouches += 1; throw new Error(name) } })
const retiredResolverResult = resolveUnifiedConfig(retiredResolverOptions)
check('M18 resolver getter禁触探针为0', retiredResolverTouches === 0 && retiredResolverResult.diagnostics.length === 0)

const legalRepairInput = { ...complete, gateWords: invalidGate }
const legalRepairBefore = structuredClone(legalRepairInput)
const legalRepair = restateSettingsConfig(legalRepairInput, {}, { gateWords: gate })
check('M21 合法显式整组修复允许且不改输入', isDeepStrictEqual(legalRepair.gateWords, gate) && isDeepStrictEqual(legalRepairInput, legalRepairBefore))

for (const [kind, words] of [
  ['missing-key', (() => { const value = structuredClone(gate); delete value.routeMain; return value })()],
  ['duplicate-value', { ...gate, routePlan: gate.routeMain }],
  ['recommended-suffix', { ...gate, routeMain: gate.routeMain + ' (recommended)' }],
  ['crlf', { ...gate, routeMain: 'direct\r\nline' }],
  ['js-expression', { ...gate, routeMain: { __jsExpr: 'must-not-run' } }],
]) {
  const invalidCurrent = { ...complete, gateWords: words }
  const resolveBefore = structuredClone(invalidCurrent)
  const resolveFailed = throws(() => resolveUnifiedConfig({ settingsValues: invalidCurrent }), '当前全局 gateWords 非法')
  check('M21 ' + kind + ' resolve拒绝且输入深等不变', resolveFailed && isDeepStrictEqual(invalidCurrent, resolveBefore))

  const restateBefore = structuredClone(invalidCurrent)
  const restateFailed = throws(() => restateSettingsConfig(invalidCurrent, {}, { webFetch: true }), 'gateWords')
  check('M21 ' + kind + ' restate拒绝且输入深等不变', restateFailed && isDeepStrictEqual(invalidCurrent, restateBefore))

  const invalidEditor = makeEditor(invalidCurrent)
  const invalidSettingsConfig = invalidEditor.state.rows[0].entry.options.config
  const inputIdentity = invalidSettingsConfig === invalidEditor.state.rows[0].entry.options.config
  const syncInputBefore = structuredClone(invalidSettingsConfig)
  const storageBefore = structuredClone(invalidEditor.state)
  const syncCounters = { declaredPlugins: 0, readPatch: 0, legacyState: 0, assetPlugins: 0 }
  let applyCount = 0
  let syncFailed = false
  let syncError = ''
  try {
    const syncOptions = retiredOptions({
      pathContext: MIGRATION_PATH_CONTEXT,
      settingsValues: invalidSettingsConfig,
      apply: async (plan) => {
        applyCount += 1
        await applyPlanToEditor(plan, invalidEditor)
      },
    }, syncCounters)
    await syncPreset(syncOptions)
  } catch (error) {
    syncFailed = true
    syncError = String(error && error.message || error)
  }
  const inputUnchanged = isDeepStrictEqual(invalidSettingsConfig, syncInputBefore)
  const storageUnchanged = isDeepStrictEqual(invalidEditor.state, storageBefore)
  check('M21 ' + kind + ' sync直接绑定真实entry.options.config身份', inputIdentity)
  check('M21 ' + kind + ' sync严格失败且错误指向当前全局gateWords', syncFailed && syncError.includes('当前全局 gateWords 非法'))
  check('M21 ' + kind + ' sync在apply前失败、apply/真实edit均为零且输入/完整storage深等不变', applyCount === 0 && invalidEditor.state.edits.length === 0 && inputUnchanged && storageUnchanged)
  check('M21 ' + kind + ' sync退役参数getter/回调均未触达', Object.values(syncCounters).every((value) => value === 0))
}
const completeRun = await runSync(complete)
check('M20 完整当前值sync idle且真实editor零edit', completeRun.result.action === 'idle' && completeRun.applyCount === 0 && completeRun.editor.state.edits.length === 0 && Object.values(completeRun.counters).every((value) => value === 0))
const partialRun = await runSync({ plannerModel: complete.plannerModel })
check('M22 部分当前值只补新默认且单次edit当前settings行', partialRun.result.action === 'written' && partialRun.applyCount === 1 && partialRun.editor.state.edits.length === 1 && partialRun.editor.state.edits[0].id === SETTINGS_ROW_ID && Object.keys(partialRun.editor.state.edits[0].config).filter((key) => key !== 'gateWords').length === 11 && partialRun.editor.state.edits[0].config.gateWords !== undefined && Object.values(partialRun.counters).every((value) => value === 0))
const oldOnlyRun = await runSync({})
check('M22 仅旧输入旁路不迁值，实际只写新默认', oldOnlyRun.result.action === 'written' && oldOnlyRun.editor.state.edits.length === 1 && isDeepStrictEqual(oldOnlyRun.editor.state.edits[0].config, defaultGlobalAfter()) && Object.values(oldOnlyRun.counters).every((value) => value === 0))
const fullOldRun = await runSync(complete)
check('M22 完整当前值即使存在旧哨兵也idle零edit', fullOldRun.result.action === 'idle' && fullOldRun.editor.state.edits.length === 0 && Object.values(fullOldRun.counters).every((value) => value === 0))
const projectionRun = await syncPreset({ settingsValues: { webFetch: false, toolPresentationMode: 'ptc', gateWords: structuredClone(gate) } })
const projection = projectionOf(projectionRun.plan?.definition)
check('M21 当前主definition投影保留webFetch/ptc/六词', projectionRun.action === 'written' && projection.webFetch === false && projection.native === false && projection.ptc === true && isDeepStrictEqual(projection.gateWords, gate))
check('M21 当前角色definition投影与主definition一致', (() => { try { return roleDefinitionsWithPresentation(projectionRun.plan.definition).every((item) => { const p = projectionOf(item); return p.webFetch === false && p.native === false && p.ptc === true && isDeepStrictEqual(p.gateWords, gate) }) } catch { return false } })())

for (const [caseName, settingsValues, patch, expectedEditCount, expected] of [
  ['complete-current-old', complete, legacyPatch, 0, complete],
  ['partial-current-old', { plannerModel: complete.plannerModel }, legacyPatch, 1, { ...defaultGlobalAfter(), plannerModel: complete.plannerModel }],
  ['only-old-input', {}, legacyPatch, 1, defaultGlobalAfter()],
  ['duplicate-old-input', {}, duplicateLegacyPatch, 1, defaultGlobalAfter()],
  ['invalid-old-input', {}, invalidLegacyPatch, 1, defaultGlobalAfter()],
  ['complete-current-no-old', complete, '', 0, complete],
]) {
  for (const legacyVisible of [true, false]) {
    const run = await runPersistentSync(settingsValues, patch, legacyVisible)
    const actual = run.editor.state.store.settings.config
    const editedIds = run.editor.state.edits.map((edit) => edit.id)
    const legacyRows = run.editor.state.store.legacyRows
    const configTreeOk = legacyVisible ? run.editor.state.rows.slice(1).map((row) => row.entry.options.id).join('|') === legacyRows.map((row) => row.id).join('|') : run.editor.state.rows.length === 1 && run.editor.state.rows[0].entry.options.id === SETTINGS_ROW_ID
    const exact = isDeepStrictEqual(actual, expected)
    const oldUntouched = isDeepStrictEqual(run.legacyBefore, run.legacyAfter)
    output.structured('K03', { case: caseName, mode: legacyVisible ? 'visible' : 'withdrawn', expectedGlobalAfter: expected, actualGlobalAfter: actual, editCount: run.editor.state.edits.length, expectedEditCount, editedIds, oldUntouched, retiredTouches: run.counters }, { case: caseName, mode: legacyVisible ? 'visible' : 'withdrawn', editCount: run.editor.state.edits.length, expectedEditCount, editedIds, oldUntouched, deepEqual: exact }, { failure: !exact })
    check('M22 ' + caseName + ' ' + (legacyVisible ? 'visible' : 'withdrawn') + ' 全局11+6独立期望deep-equal', exact)
    check('M22 ' + caseName + ' ' + (legacyVisible ? 'visible' : 'withdrawn') + ' edit次数/目标仅当前settings行', run.editor.state.edits.length === expectedEditCount && editedIds.every((id) => id === SETTINGS_ROW_ID) && run.applyCount === expectedEditCount)
    check('M22 ' + caseName + ' ' + (legacyVisible ? 'visible' : 'withdrawn') + ' 旧行原始store前后deep-equal且fixture树准确', oldUntouched && configTreeOk && run.editor.state.rejectedEdits.length === 0 && Object.values(run.counters).every((value) => value === 0))
  }
}
const blockedLegacyEditor = makePersistentEditor({}, legacyPatch, true)
const blockedBefore = structuredClone(blockedLegacyEditor.state.store.legacyRows)
for (const legacyId of ['extra-plan-preset-sync', 'preset-extra-plan']) {
  const entry = blockedLegacyEditor.state.allRows.find((row) => row.entry.options.id === legacyId).entry
  let rejected = false
  try { await blockedLegacyEditor.edit(entry, () => ({ overwritten: true })) } catch { rejected = true }
  check('M23 误写旧ID ' + legacyId + ' 明确失败且旧store不变', rejected && blockedLegacyEditor.state.rejectedEdits.at(-1).id === legacyId && isDeepStrictEqual(blockedBefore, blockedLegacyEditor.state.store.legacyRows))
}
const captured = captureRowSettings('- id: dsh-extra-plan-settings\n  name: dsh-extra-plan/settings\n  config:\n    plannerModel: x\n', SETTING_DEFINITIONS)
check('M23 当前唯一行缺项可识别rowPresent=true且不猜旧行', captured.rowPresent === true && captured.states.plannerModel === 'captured' && captured.states.webFetch === 'missing')

migrationFixture.cleanup()
output.summary(pass, fail)
process.exit(fail === 0 ? 0 : 1)
