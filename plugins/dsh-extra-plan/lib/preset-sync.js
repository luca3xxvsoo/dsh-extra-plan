// 预设核对组件：读取生成 definition，直接挂载官方 AgentPreset adapter。
// 新公开行 extra-plan-preset-sync 只承载 webFetch/toolPresentationMode/gateWords 投影；
// 旧 preset-extra-plan 只做非破坏读取迁移，新的 profile 写入一律经 configEditor.edit。
// definition 的 group/isolate/!!js 原文交给官方 adapter，不能提前求值或复制 registry。

import { createHash } from 'node:crypto'
import { existsSync, readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createRequire } from 'node:module'
import {
  HOST_ROW_IDS,
  HOST_ROW_LEAF_KEYS,
  HOST_ROW_SETTING_DEFINITIONS,
  LEGACY_PRESET_ROW_ID,
  PRESET_ROW_ID,
  PROJECTION_SETTING_DEFINITIONS,
  SETTINGS_ROW_ID,
  SETTING_DEFINITIONS,
  captureRowSettings,
  effectivePluginsOf,
  hostRowDefaultsFromTemplate,
  findPluginsRow,
  normalizeSettingValue,
  readPath,
  readProjectedValue,
  restatePluginsRow,
  validateSettingValue,
} from './preset-settings.js'
import {
  GATE_WORDS_GROUP_DEFINITION,
  validateGateWords,
} from './gate-words.js'
import { parsePresetYaml, resolveSetting, resolveTemplateSettingDefault } from './preset-settings.js'

const localRequire = createRequire(import.meta.url)
function loadOfficialAgentPreset() {
  try {
    const loaded = localRequire('@deepseek-ai/dsh-agent-preset')
    return loaded !== null && typeof loaded === 'object' && loaded.default !== undefined ? loaded.default : loaded
  } catch (firstError) {
    const home = process.env.APPDATA || join(homedir(), 'AppData', 'Roaming')
    try {
      const officialRequire = createRequire(join(home, 'npm', 'node_modules', '@deepseek-ai', 'dsh', 'package.json'))
      const loaded = officialRequire('@deepseek-ai/dsh-agent-preset')
      return loaded !== null && typeof loaded === 'object' && loaded.default !== undefined ? loaded.default : loaded
    } catch {
      return undefined
    }
  }
}
const OfficialAgentPreset = loadOfficialAgentPreset()

const PRESET_ID = 'extra-plan'
export const CORE_FILES = ['preset.yml', 'agent.cordis.yml']
/** 生成 definition 顶层的 17 条 agent plugin 行。 */
export const DECLARATION_ROW_IDS = Object.freeze(['extra-plan', HOST_ROW_IDS.webFetch, HOST_ROW_IDS.toolPresentationMode])
export const PRESET_SYNC_CONFIG_KEYS = Object.freeze(['webFetch', 'toolPresentationMode', 'gateWords'])

const HERE = dirname(fileURLToPath(import.meta.url))
export const ASSET_DIR = join(HERE, '..', 'assets', 'presets', PRESET_ID)
export const ASSET_DEFINITION_FILE = join(ASSET_DIR, 'preset-definition.generated.yml')

export function defaultDshHome() {
  return process.env.DSH_HOME === undefined || process.env.DSH_HOME === ''
    ? join(homedir(), '.dsh')
    : process.env.DSH_HOME
}

export function contentHash(dir) {
  const h = createHash('sha256')
  for (const file of CORE_FILES) {
    const filePath = join(dir, file)
    if (!existsSync(filePath)) return null
    h.update(readFileSync(filePath))
  }
  return h.digest('hex')
}

/** 单一深度优先遍历来源：按当前数组顺序展开 group.config 子行。 */
export function pluginRows(plugins) {
  const rows = []
  const visit = (items) => {
    if (!Array.isArray(items)) return
    for (const row of items) {
      if (row === null || typeof row !== 'object' || Array.isArray(row)) continue
      rows.push(row)
      if (Array.isArray(row.config)) visit(row.config)
    }
  }
  visit(plugins)
  return rows
}

export function pluginRowIds(plugins) {
  return pluginRows(plugins).filter((row) => typeof row.id === 'string' && row.id !== '').map((row) => row.id)
}

export function declarationCoversAsset(plugins) {
  if (!Array.isArray(plugins)) return false
  const ids = new Set(pluginRowIds(plugins))
  return DECLARATION_ROW_IDS.every((id) => ids.has(id))
}

function plainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function userWritableByRow() {
  const table = new Map()
  const push = (rowId, path) => {
    if (typeof rowId !== 'string' || rowId === '' || typeof path !== 'string') return
    const key = path.startsWith('config.') ? path.slice('config.'.length) : path
    if (key === '' || key.includes('.')) return
    const set = table.get(rowId)
    if (set === undefined) table.set(rowId, new Set([key]))
    else set.add(key)
  }
  for (const definition of HOST_ROW_SETTING_DEFINITIONS) {
    const locator = definition.legacyProjectionLocator || definition.projectionLocator
    if (locator !== null && typeof locator === 'object') push(locator.pluginsRowId, locator.path)
  }
  push(GATE_WORDS_GROUP_DEFINITION.rowId, GATE_WORDS_GROUP_DEFINITION.path)
  return table
}

export function stripUserWritable(plugins) {
  if (!Array.isArray(plugins)) return plugins
  const next = structuredClone(plugins)
  const table = userWritableByRow()
  for (const row of pluginRows(next)) {
    if (Array.isArray(row.config) || !plainObject(row.config)) continue
    const writable = typeof row.id === 'string' ? table.get(row.id) : undefined
    if (writable === undefined) continue
    for (const key of writable) if (Object.prototype.hasOwnProperty.call(row.config, key)) row.config[key] = '__user__'
  }
  return next
}

export function declarationBodyMatchesAsset(declaredPlugins, assetBody) {
  if (!Array.isArray(declaredPlugins) || !Array.isArray(assetBody)) return true
  return JSON.stringify(stripUserWritable(declaredPlugins)) === JSON.stringify(stripUserWritable(assetBody))
}

export function carryUserWritable(plugins) {
  const hostRowConfig = {}
  let gateWords = null
  if (!Array.isArray(plugins)) return { hostRowConfig, gateWords }
  const table = userWritableByRow()
  const gateRowId = GATE_WORDS_GROUP_DEFINITION.rowId
  const gateKey = GATE_WORDS_GROUP_DEFINITION.path.startsWith('config.')
    ? GATE_WORDS_GROUP_DEFINITION.path.slice('config.'.length)
    : GATE_WORDS_GROUP_DEFINITION.path
  for (const row of pluginRows(plugins)) {
    if (Array.isArray(row.config) || typeof row.id !== 'string' || !plainObject(row.config)) continue
    const writable = table.get(row.id)
    if (writable === undefined) continue
    const pick = {}
    for (const key of writable) if (Object.prototype.hasOwnProperty.call(row.config, key)) pick[key] = row.config[key]
    if (Object.keys(pick).length === 0) continue
    if (row.id === gateRowId) {
      if (Object.prototype.hasOwnProperty.call(pick, gateKey)) gateWords = pick[gateKey]
      continue
    }
    const merged = hostRowConfig[row.id] === undefined ? {} : hostRowConfig[row.id]
    hostRowConfig[row.id] = { ...merged, ...pick }
  }
  return { hostRowConfig, gateWords }
}

export function effectiveRowConfig(row) {
  if (row === null || typeof row !== 'object') return null
  const layers = []
  if (plainObject(row.inherited)) layers.push(row.inherited)
  const own = row.entry !== undefined && row.entry.options !== undefined ? row.entry.options.config : undefined
  if (plainObject(own)) layers.push(own)
  if (plainObject(row.override)) {
    if (plainObject(row.override.config)) layers.push(row.override.config)
    else layers.push(row.override)
  }
  return layers.length === 0 ? null : Object.assign({}, ...layers)
}

export function readAuthoritySettings(options) {
  const input = options !== null && typeof options === 'object' ? options : {}
  const provided = input.settingsValues
  if (provided !== undefined && provided !== null && plainObject(provided)) {
    const values = {}
    for (const definition of SETTING_DEFINITIONS) {
      const raw = provided[definition.key]
      if (validateSettingValue(definition, raw)) values[definition.key] = normalizeSettingValue(definition, raw)
    }
    return { present: true, values }
  }
  if (typeof input.readPatch === 'function') {
    try {
      const text = input.readPatch()
      if (typeof text === 'string' && text.trim() !== '') {
        const captured = captureRowSettings(text, SETTING_DEFINITIONS)
        return { present: captured.rowPresent === true, values: captured.values }
      }
    } catch {
      return { present: false, values: {} }
    }
  }
  return { present: false, values: {} }
}

export const hostRowDefaultsOf = hostRowDefaultsFromTemplate

function projectionLeafExists(target, definition) {
  const locator = Array.isArray(target) && definition.legacyProjectionLocator !== undefined
    ? definition.legacyProjectionLocator
    : definition.projectionLocator
  if (locator === undefined || locator === null) return false
  if (locator.pluginsRowId !== undefined) {
    const row = findPluginsRow(target, locator.pluginsRowId)
    return row !== null && readPath(row, locator.path).exists
  }
  return readPath(target, locator.path).exists
}

/**
 * 计算两项宿主投影。publicConfig 传入时使用新公开 preset-sync 行；未传入时保留
 * 旧 body 纯函数合同，供迁移回归和历史夹具核对。
 */
export function planHostRowProjection(authority, declaredPlugins, defaults, extraAuthority, publicConfig) {
  const authorityValues = {
    ...(authority !== null && typeof authority === 'object' && authority.values !== undefined ? authority.values : {}),
    ...(extraAuthority !== null && typeof extraAuthority === 'object' && !Array.isArray(extraAuthority) ? extraAuthority : {}),
  }
  const settingsRowHas = authority !== null && typeof authority === 'object' && authority.present === true
  const factory = defaults !== null && typeof defaults === 'object' ? defaults : {}
  const usePublic = publicConfig !== undefined
  const backfill = {}
  const targets = {}
  const hostRowConfig = {}
  const publicPatch = {}
  let needed = false
  for (const definition of PROJECTION_SETTING_DEFINITIONS) {
    const key = definition.key
    const defaultValue = factory[key]
    const legacyCurrent = readProjectedValue(declaredPlugins, definition)
    const publicCurrent = usePublic ? readProjectedValue(publicConfig, definition) : undefined
    const current = publicCurrent === undefined ? legacyCurrent : publicCurrent
    const captured = Object.prototype.hasOwnProperty.call(authorityValues, key)
    let target
    if (captured) target = authorityValues[key]
    else if (current !== undefined && current !== defaultValue) {
      target = current
      if (settingsRowHas) backfill[key] = current
    } else target = defaultValue
    targets[key] = target
    const projected = publicCurrent === undefined ? (usePublic ? defaultValue : (legacyCurrent === undefined ? defaultValue : legacyCurrent)) : publicCurrent
    const invalidPublic = usePublic && Object.prototype.hasOwnProperty.call(publicConfig, key) && publicCurrent === undefined
    if (projected !== target || invalidPublic) needed = true
    if (usePublic) {
      if (invalidPublic || publicCurrent === undefined && target !== defaultValue || publicCurrent !== undefined && publicCurrent !== target) publicPatch[key] = target
    } else if (projected !== target || invalidPublic) {
      const locator = definition.legacyProjectionLocator || definition.projectionLocator
      const merged = hostRowConfig[locator.pluginsRowId] === undefined ? {} : hostRowConfig[locator.pluginsRowId]
      hostRowConfig[locator.pluginsRowId] = { ...merged, [HOST_ROW_LEAF_KEYS[key]]: target }
    }
  }
  if (Object.keys(backfill).length > 0) needed = true
  return { needed, backfill, targets, hostRowConfig, publicPatch, publicConfig: usePublic }
}

function assertPresetDefinition(definition, label = 'preset definition') {
  if (!plainObject(definition)) throw new Error(label + ' 必须是对象')
  if (definition.id !== PRESET_ID) throw new Error(label + ' id 必须为 ' + PRESET_ID)
  if (typeof definition.name !== 'string' || definition.name === '') throw new Error(label + ' name 非法')
  if (typeof definition.description !== 'string' || definition.description === '') throw new Error(label + ' description 非法')
  if (!Number.isInteger(definition.order)) throw new Error(label + ' order 非法')
  if (!Array.isArray(definition.plugins) || definition.plugins.length !== 17) throw new Error(label + ' plugins 顶层必须为 17 条')
  if (definition.plugins.some((row) => !plainObject(row) || row.insert !== undefined)) throw new Error(label + ' 不得包含 Loader insert wrapper')
  const groups = definition.plugins.filter((row) => row.group === true)
  if (groups.length !== 3) throw new Error(label + ' 必须包含三个 group')
  for (const group of groups) {
    if (!plainObject(group.isolate) || Object.values(group.isolate).some((value) => value !== true)) throw new Error(label + ' isolate 必须全部为 true')
  }
  return definition
}

export function parsePresetDefinition(text) {
  return assertPresetDefinition(parsePresetYaml(text))
}

export function assetDefinition() {
  if (!existsSync(ASSET_DEFINITION_FILE)) throw new Error('预设 definition 缺失：' + ASSET_DEFINITION_FILE)
  return parsePresetDefinition(readFileSync(ASSET_DEFINITION_FILE, 'utf8'))
}

export function assetPlugins() {
  try { return assetDefinition().plugins } catch { return undefined }
}

export function readDefinitionGateWords(definition = assetDefinition()) {
  const row = findPluginsRow(definition.plugins, GATE_WORDS_GROUP_DEFINITION.rowId)
  if (row === null || !plainObject(row.config)) throw new Error('definition 缺少 gateWords 行')
  return validateGateWords(row.config.gateWords)
}

function cloneDefinitionWithProjection(definition, projection = {}) {
  const next = structuredClone(definition)
  for (const [key, value] of Object.entries(projection)) {
    if (key === 'gateWords') continue
    const setting = PROJECTION_SETTING_DEFINITIONS.find((item) => item.key === key)
    if (setting === undefined || !validateSettingValue(setting, value)) continue
    const row = findPluginsRow(next.plugins, HOST_ROW_IDS[key])
    if (row === null || !plainObject(row.config)) throw new Error('definition 缺少宿主行 ' + HOST_ROW_IDS[key])
    row.config[HOST_ROW_LEAF_KEYS[key]] = normalizeSettingValue(setting, value)
  }
  if (projection.gateWords !== undefined && projection.gateWords !== null) {
    const row = findPluginsRow(next.plugins, GATE_WORDS_GROUP_DEFINITION.rowId)
    if (row === null || !plainObject(row.config)) throw new Error('definition 缺少 extra-plan gateWords 行')
    row.config.gateWords = validateGateWords(projection.gateWords)
  }
  return next
}

export function definitionWithProjection(projection = {}) {
  return cloneDefinitionWithProjection(assetDefinition(), projection)
}

function publicConfigOf(value) {
  if (value !== null && typeof value === 'object' && value.entry !== undefined) return effectiveRowConfig(value) || {}
  return plainObject(value) ? value : {}
}

function validPublicGateWords(config) {
  if (!Object.prototype.hasOwnProperty.call(config, 'gateWords')) return null
  try { return validateGateWords(config.gateWords) } catch { return undefined }
}

function directProjectionFromLegacy(plugins) {
  const carry = carryUserWritable(plugins)
  const result = {}
  const web = carry.hostRowConfig[HOST_ROW_IDS.webFetch]
  const mode = carry.hostRowConfig[HOST_ROW_IDS.toolPresentationMode]
  if (web !== undefined && validateSettingValue(PROJECTION_SETTING_DEFINITIONS.find((item) => item.key === 'webFetch'), web[HOST_ROW_LEAF_KEYS.webFetch])) result.webFetch = web[HOST_ROW_LEAF_KEYS.webFetch]
  if (mode !== undefined && validateSettingValue(PROJECTION_SETTING_DEFINITIONS.find((item) => item.key === 'toolPresentationMode'), mode[HOST_ROW_LEAF_KEYS.toolPresentationMode])) result.toolPresentationMode = mode[HOST_ROW_LEAF_KEYS.toolPresentationMode]
  if (carry.gateWords !== null && carry.gateWords !== undefined) {
    try { result.gateWords = validateGateWords(carry.gateWords) } catch { /* 非法旧值回落默认 */ }
  }
  return result
}

export function restatePresetSyncConfig(current, inherited, patch = {}) {
  const currentConfig = publicConfigOf(current)
  const inheritedConfig = publicConfigOf(inherited)
  const source = { ...inheritedConfig, ...currentConfig }
  const next = {}
  for (const key of PRESET_SYNC_CONFIG_KEYS) {
    if (!Object.prototype.hasOwnProperty.call(source, key)) continue
    if (key === 'gateWords') {
      try { next[key] = validateGateWords(source[key]) } catch { /* 非法值不复制 */ }
      continue
    }
    const definition = PROJECTION_SETTING_DEFINITIONS.find((item) => item.key === key)
    if (definition !== undefined && validateSettingValue(definition, source[key])) next[key] = normalizeSettingValue(definition, source[key])
  }
  for (const [key, value] of Object.entries(patch)) {
    if (!PRESET_SYNC_CONFIG_KEYS.includes(key)) continue
    if (key === 'gateWords') next[key] = validateGateWords(value)
    else {
      const definition = PROJECTION_SETTING_DEFINITIONS.find((item) => item.key === key)
      if (definition === undefined || !validateSettingValue(definition, value)) throw new Error('非法 preset-sync 投影：' + key)
      next[key] = normalizeSettingValue(definition, value)
    }
  }
  return next
}

/** 旧声明行 plugins 整体重述 helper，仅用于读取迁移/纯内存回归；不再写旧 row。 */
export function restatePresetPlugins(current, inherited, preset, basePlugins) {
  const fromCurrent = current !== null && typeof current === 'object' && Array.isArray(current.plugins) ? current.plugins : null
  const fromInherited = inherited !== null && typeof inherited === 'object' && Array.isArray(inherited.plugins) ? inherited.plugins : null
  const base = Array.isArray(basePlugins) ? basePlugins : fromCurrent !== null ? fromCurrent : fromInherited
  if (base === null) throw new Error('旧声明行 ' + LEGACY_PRESET_ROW_ID + ' 的 config.plugins 不可定位')
  const presetPlan = preset !== null && typeof preset === 'object' ? preset : {}
  let plugins = structuredClone(base)
  const carry = carryUserWritable(fromCurrent)
  const explicitHostRows = plainObject(presetPlan.hostRowConfig) ? presetPlan.hostRowConfig : {}
  const hostRowConfig = { ...carry.hostRowConfig, ...explicitHostRows }
  for (const [rowId, config] of Object.entries(hostRowConfig)) {
    const next = restatePluginsRow(plugins, rowId, config)
    if (next === null) throw new Error('旧声明行 plugins 内缺少宿主行 ' + rowId)
    plugins = next
  }
  const explicitGateWords = presetPlan.gateWords !== null && presetPlan.gateWords !== undefined ? presetPlan.gateWords : null
  if (explicitGateWords !== null) {
    const next = restatePluginsRow(plugins, GATE_WORDS_GROUP_DEFINITION.rowId, { gateWords: explicitGateWords })
    if (next === null) throw new Error('旧声明行 plugins 内缺少 extra-plan 行')
    const row = findPluginsRow(next, GATE_WORDS_GROUP_DEFINITION.rowId)
    validateGateWords(row.config.gateWords)
    plugins = next
  } else if (carry.gateWords !== null && carry.gateWords !== undefined) {
    try {
      const next = restatePluginsRow(plugins, GATE_WORDS_GROUP_DEFINITION.rowId, { gateWords: carry.gateWords })
      if (next !== null) {
        const row = findPluginsRow(next, GATE_WORDS_GROUP_DEFINITION.rowId)
        validateGateWords(row.config.gateWords)
        plugins = next
      }
    } catch { /* 非法旧值不写回 */ }
  }
  return { ...current, plugins }
}

function assertTemplateGateWords(text) {
  const captured = resolveSetting(parsePresetYaml(text), GATE_WORDS_GROUP_DEFINITION, { aliases: false })
  if (captured.kind !== 'ok') throw new Error('extra-plan: 厂商模板 gateWords ' + captured.kind)
  return validateGateWords(captured.value)
}

export function readDeclaredPluginsFromPatch(text) {
  if (typeof text !== 'string' || text.trim() === '') return undefined
  let document
  try { document = parsePresetYaml(text) } catch { return undefined }
  const found = []
  const visit = (value) => {
    if (value === null || typeof value !== 'object') return
    if (Array.isArray(value)) { for (const item of value) visit(item); return }
    if (value.id === LEGACY_PRESET_ROW_ID && plainObject(value.config) && Array.isArray(value.config.plugins)) found.push(value.config.plugins)
    for (const child of Object.values(value)) visit(child)
  }
  visit(document)
  return found.length === 0 ? undefined : found[0]
}

export function readLegacyPresetState(text) {
  const plugins = readDeclaredPluginsFromPatch(text)
  return { plugins, projection: directProjectionFromLegacy(plugins) }
}

function planPublicGateWords(publicConfig, legacyProjection, assetGateWords) {
  const publicGate = validPublicGateWords(publicConfig)
  if (publicGate !== null && publicGate !== undefined) return { target: publicGate, present: true, invalid: false }
  if (publicGate === undefined) return { target: legacyProjection.gateWords || assetGateWords, present: true, invalid: true }
  return { target: legacyProjection.gateWords || assetGateWords, present: false, invalid: false }
}

/**
 * 计算启动迁移与 public row 收敛。publicConfig 存在时只计划新公开行/­settings 行写入；
 * 未传 publicConfig 时保留旧纯内存 body 合同，便于验证旧值 carry 与 gateWords。
 */
export async function syncPreset(options = {}) {
  const templateFile = join(ASSET_DIR, 'agent.cordis.yml')
  if (!existsSync(templateFile)) throw new Error('预设模板缺失：' + templateFile)
  const templateText = readFileSync(templateFile, 'utf8')
  resolveTemplateSettingDefault(templateText, 'exploreBudget')
  assertTemplateGateWords(templateText)
  const currentHash = contentHash(ASSET_DIR)
  if (currentHash === null) throw new Error('预设资产缺失：' + ASSET_DIR)
  const definition = assetDefinition()
  let declaredPlugins = options.declaredPlugins
  if (declaredPlugins === undefined && typeof options.readPatch === 'function') declaredPlugins = readDeclaredPluginsFromPatch(options.readPatch())
  const authority = readAuthoritySettings(options)
  const assetBody = options.assetPlugins === undefined ? definition.plugins : options.assetPlugins
  const bodyOk = declarationBodyMatchesAsset(declaredPlugins, assetBody)
  const declarationOk = declaredPlugins === undefined ? true : declarationCoversAsset(declaredPlugins)
  const hostDefaults = hostRowDefaultsFromTemplate(templateText)
  const publicPresent = options.presetSyncConfig !== undefined
  const publicConfig = publicPresent ? publicConfigOf(options.presetSyncConfig) : undefined
  const projection = planHostRowProjection(authority, declaredPlugins, hostDefaults, undefined, publicConfig)
  const legacyProjection = directProjectionFromLegacy(declaredPlugins)
  const assetGateWords = readDefinitionGateWords(definition)
  const gate = publicPresent ? planPublicGateWords(publicConfig, legacyProjection, assetGateWords) : null
  const planned = {}
  const backfillKeys = Object.keys(projection.backfill)
  planned.settings = backfillKeys.length > 0 ? { values: Object.fromEntries(backfillKeys.map((key) => [key, projection.backfill[key]])) } : null
  if (publicPresent) {
    const patch = { ...projection.publicPatch }
    if (gate !== null && (gate.invalid || !Object.prototype.hasOwnProperty.call(publicConfig, 'gateWords') || JSON.stringify(publicConfig.gateWords) !== JSON.stringify(gate.target))) patch.gateWords = gate.target
    const unsupported = Object.keys(publicConfig).some((key) => !PRESET_SYNC_CONFIG_KEYS.includes(key))
    planned.preset = Object.keys(patch).length > 0 || unsupported ? { config: patch } : null
    planned.hostRowConfig = {}
    planned.bodyStale = false
    planned.definition = cloneDefinitionWithProjection(definition, {
      webFetch: projection.targets.webFetch,
      toolPresentationMode: projection.targets.toolPresentationMode,
      gateWords: gate === null ? assetGateWords : gate.target,
    })
    const needsWrite = planned.preset !== null || planned.settings !== null
    if (needsWrite && typeof options.apply === 'function') await options.apply(planned, { action: 'written' })
    return needsWrite ? { action: 'written', plan: planned } : { action: 'idle' }
  }
  const projectionNeeded = projection.needed
  const idle = declarationOk && bodyOk && !projectionNeeded
  if (idle) return { action: 'idle' }
  planned.preset = Object.keys(projection.hostRowConfig).length > 0 ? { hostRowConfig: projection.hostRowConfig, gateWords: null } : null
  planned.bodyStale = !bodyOk
  planned.definition = cloneDefinitionWithProjection(definition, {
    webFetch: projection.targets.webFetch,
    toolPresentationMode: projection.targets.toolPresentationMode,
    gateWords: legacyProjection.gateWords || assetGateWords,
  })
  if (typeof options.apply === 'function') await options.apply(planned, { action: 'written' })
  return { action: 'written', plan: planned }
}

function findEntry(rows, id) {
  const row = rows.find((item) => item !== null && typeof item === 'object' && item.entry !== undefined && item.entry.options !== undefined && item.entry.options.id === id)
  return row === undefined ? undefined : row.entry
}

async function applyPlan(editor, rows, planned, isActive = () => true) {
  if (planned.preset !== null) {
    const entry = findEntry(rows, PRESET_ROW_ID)
    if (entry === undefined) throw new Error('公开预设核对行缺失：' + PRESET_ROW_ID)
    if (!isActive()) return
    if (planned.preset.config !== undefined) await editor.edit(entry, (current, inherited) => restatePresetSyncConfig(current, inherited, planned.preset.config))
    else {
      const direct = {}
      for (const [rowId, config] of Object.entries(planned.preset.hostRowConfig || {})) {
        if (rowId === HOST_ROW_IDS.webFetch) direct.webFetch = config[HOST_ROW_LEAF_KEYS.webFetch]
        if (rowId === HOST_ROW_IDS.toolPresentationMode) direct.toolPresentationMode = config[HOST_ROW_LEAF_KEYS.toolPresentationMode]
      }
      await editor.edit(entry, (current, inherited) => restatePresetSyncConfig(current, inherited, direct))
    }
    if (!isActive()) return
  }
  if (planned.settings !== null) {
    const entry = findEntry(rows, SETTINGS_ROW_ID)
    if (entry === undefined) throw new Error('settings 行缺失：' + SETTINGS_ROW_ID)
    if (!isActive()) return
    await editor.edit(entry, (current) => ({ ...current, ...planned.settings.values }))
    if (!isActive()) return
  }
}

function readRawPatch(editor) {
  const path = editor !== undefined && typeof editor.documentPath === 'string' ? editor.documentPath : ''
  if (path === '' || !existsSync(path)) return undefined
  try { return readFileSync(path, 'utf8') } catch { return undefined }
}

function publicConfigFromRows(rows) {
  const row = rows.find((item) => item !== null && typeof item === 'object' && item.entry !== undefined && item.entry.options !== undefined && item.entry.options.id === PRESET_ROW_ID)
  return row === undefined ? {} : effectiveRowConfig(row) || {}
}

function settingsValuesFromRows(rows) {
  const row = rows.find((item) => item !== null && typeof item === 'object' && item.entry !== undefined && item.entry.options !== undefined && item.entry.options.id === SETTINGS_ROW_ID)
  return row === undefined ? undefined : effectiveRowConfig(row)
}

export function activeLegacyRow(rows) {
  const entry = findEntry(rows, LEGACY_PRESET_ROW_ID)
  return entry !== undefined
    && entry.disabled !== true
    && entry.fiber !== undefined
    && entry.fiber !== null
    && (entry.fiber.state === 0 || entry.fiber.state === 1 || entry.fiber.state === 2)
}

function definitionFromRows(rows, legacyPlugins) {
  const publicConfig = publicConfigFromRows(rows)
  const legacy = directProjectionFromLegacy(legacyPlugins)
  const asset = assetDefinition()
  const gate = validPublicGateWords(publicConfig)
  return cloneDefinitionWithProjection(asset, {
    webFetch: publicConfig.webFetch === undefined ? (legacy.webFetch === undefined ? hostRowDefaultsFromTemplate(readFileSync(join(ASSET_DIR, 'agent.cordis.yml'), 'utf8')).webFetch : legacy.webFetch) : publicConfig.webFetch,
    toolPresentationMode: publicConfig.toolPresentationMode === undefined ? (legacy.toolPresentationMode === undefined ? hostRowDefaultsFromTemplate(readFileSync(join(ASSET_DIR, 'agent.cordis.yml'), 'utf8')).toolPresentationMode : legacy.toolPresentationMode) : publicConfig.toolPresentationMode,
    gateWords: gate === null || gate === undefined ? (legacy.gateWords || readDefinitionGateWords(asset)) : gate,
  })
}

export const name = 'extra-plan-preset-sync'
export const inject = []

/** 宿主入口：迁移/投影只写两个公开行，definition 交官方 adapter；失败不阻断启动。 */
export function apply(ctx) {
  ctx.inject(['configEditor'], (child) => {
    let active = true
    let adapterFiber
    let queue = Promise.resolve()
    const run = async () => {
      if (!active) return
      try {
        const editor = child.configEditor
        const rows = typeof editor.configuration === 'function' ? editor.configuration() : []
        const rawPatch = readRawPatch(editor)
        const legacyPlugins = rawPatch === undefined ? undefined : readDeclaredPluginsFromPatch(rawPatch)
        const result = await syncPreset({
          declaredPlugins: legacyPlugins,
          presetSyncConfig: publicConfigFromRows(rows),
          settingsValues: settingsValuesFromRows(rows),
          apply: async (planned) => applyPlan(editor, rows, planned, () => active),
        })
        if (!active) return
        const latestRows = typeof editor.configuration === 'function' ? editor.configuration() : rows
        const definition = result.plan !== undefined && result.plan.definition !== undefined ? result.plan.definition : definitionFromRows(latestRows, legacyPlugins)
        // 若旧 row 仍是活动 Loader entry，它已经由官方 adapter 注册；跳过第二次注册，避免 duplicate。
        if (activeLegacyRow(latestRows)) return
        if (OfficialAgentPreset === undefined) throw new Error('@deepseek-ai/dsh-agent-preset 官方 adapter 不可用')
        if (adapterFiber !== undefined) {
          await adapterFiber.dispose()
          adapterFiber = undefined
        }
        adapterFiber = child.plugin(OfficialAgentPreset, definition)
        await adapterFiber
      } catch (error) {
        console.warn('[dsh-extra-plan] 预设 definition/adapter 启动核对失败（不阻断启动）：' + (error instanceof Error ? error.message : String(error)))
      }
    }
    const schedule = () => {
      queue = queue.then(run, run)
      return queue
    }
    child.on('internal/update', () => { void schedule() })
    child.effect(() => {
      void schedule()
      return () => {
        active = false
        if (adapterFiber === undefined) return undefined
        const fiber = adapterFiber
        adapterFiber = undefined
        return fiber.dispose()
      }
    }, 'extra-plan-preset-sync: definition and adapter')
  })
}

export { SETTINGS_ROW_ID, PRESET_ROW_ID, LEGACY_PRESET_ROW_ID }
