// 预设核对组件：读取生成 definition，直接挂载官方 AgentPreset adapter。
// 旧 extra-plan-preset-sync 仅作非破坏读取来源；新结构不再写入或依赖该公开行。
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
  createDefaultSettings,
  hostRowDefaultsFromTemplate,
  findPluginsRow,
  normalizeSettingValue,
  readPath,
  validateSettingValue,
} from './preset-settings.js'
import {
  GATE_WORDS_GROUP_DEFINITION,
  validateGateWords,
} from './gate-words.js'
import { parsePresetYaml, resolveSetting } from './preset-settings.js'
import { ROLE_IDS } from './role-contract.js'

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

const HERE = dirname(fileURLToPath(import.meta.url))
export const ASSET_DIR = join(HERE, '..', 'assets', 'presets', PRESET_ID)
export const ASSET_DEFINITION_FILE = join(ASSET_DIR, 'preset-definition.generated.yml')
/** 角色预设固定顺序（order 101..104），与生成器 ROLE_IDS 同源同序：主在前、角色在后。 */
export { ROLE_IDS }
export const ROLE_DEFINITION_FILES = Object.freeze(ROLE_IDS.map((roleId) => join(ASSET_DIR, 'preset-definition-' + roleId + '.generated.yml')))
/** 角色 definition 里固定前两行：dsh-persona 与 dsh-extra-plan。 */
export const ROLE_DEFINITION_LEADING_ROW_IDS = Object.freeze(['persona', 'extra-plan'])

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


function findRowsById(document, rowId) {
  const rows = []
  const seen = new Set()
  const visit = (value) => {
    if (value === null || typeof value !== 'object' || seen.has(value)) return
    seen.add(value)
    if (value.id === rowId) rows.push(value)
    if (Array.isArray(value)) {
      for (const item of value) visit(item)
    } else {
      for (const child of Object.values(value)) visit(child)
    }
  }
  visit(document)
  return rows
}

function validDefinitionValue(definition, value) {
  return validateSettingValue(definition, value)
}

function captureLegacyValues(plugins) {
  const values = {}
  const states = {}
  for (const definition of SETTING_DEFINITIONS) {
    const locator = definition.sourceLocator
    const rows = findRowsById(plugins, locator.rowId)
    if (rows.length !== 1) {
      states[definition.key] = rows.length > 1 ? 'ambiguous' : 'missing'
      continue
    }
    const read = readPath(rows[0], locator.path)
    if (!read.exists) {
      states[definition.key] = 'missing'
      continue
    }
    if (!validDefinitionValue(definition, read.value)) {
      states[definition.key] = 'invalid'
      continue
    }
    values[definition.key] = normalizeSettingValue(definition, read.value)
    states[definition.key] = 'captured'
  }
  return { values, states }
}

function validGateWordsOrUndefined(value) {
  try { return validateGateWords(value) } catch { return undefined }
}

function legacyStateFromPlugins(plugins) {
  const capture = captureLegacyValues(plugins)
  const rows = findRowsById(plugins, GATE_WORDS_GROUP_DEFINITION.rowId)
  let gateWords
  let gateWordsState = rows.length === 0 ? 'missing' : rows.length > 1 ? 'ambiguous' : 'missing'
  if (rows.length === 1) {
    const raw = rows[0].config === undefined ? undefined : rows[0].config.gateWords
    if (raw === undefined) gateWordsState = 'missing'
    else {
      gateWords = validGateWordsOrUndefined(raw)
      gateWordsState = gateWords === undefined ? 'invalid' : 'captured'
    }
  }
  return { ...capture, gateWords, gateWordsState, plugins }
}

/** 安全读取旧公开行与旧 preset-extra-plan body；parsePresetYaml 只做数据解析，不求值 !!js。 */
export function readLegacyState(text) {
  const empty = { authority: { values: {}, states: {} }, projection: {}, projectionSources: {}, gateWords: undefined, gateWordsSource: undefined, diagnostics: [], legacyPlugins: undefined }
  if (typeof text !== 'string' || text.trim() === '') return empty
  let document
  try { document = parsePresetYaml(text) } catch (error) {
    return { ...empty, diagnostics: ['legacy patch YAML parse failed: ' + String(error && error.message || error)] }
  }
  const diagnostics = []
  const syncRows = findRowsById(document, PRESET_ROW_ID)
  const legacyRows = findRowsById(document, LEGACY_PRESET_ROW_ID)
  let legacyPlugins
  if (legacyRows.length > 1) diagnostics.push('duplicate legacy preset rows')
  else if (legacyRows.length === 1 && plainObject(legacyRows[0].config) && Array.isArray(legacyRows[0].config.plugins)) legacyPlugins = legacyRows[0].config.plugins
  const body = legacyStateFromPlugins(legacyPlugins)
  if (legacyRows.length === 1 && legacyPlugins === undefined) diagnostics.push('legacy preset plugins missing')
  const projection = {}
  const projectionSources = {}
  let publicConfig
  if (syncRows.length > 1) diagnostics.push('duplicate extra-plan-preset-sync rows')
  else if (syncRows.length === 1 && plainObject(syncRows[0].config)) publicConfig = syncRows[0].config
  for (const definition of PROJECTION_SETTING_DEFINITIONS) {
    const key = definition.key
    if (publicConfig !== undefined && Object.prototype.hasOwnProperty.call(publicConfig, key)) {
      if (!validateSettingValue(definition, publicConfig[key])) diagnostics.push('invalid legacy projection ' + key)
      else {
        projection[key] = normalizeSettingValue(definition, publicConfig[key])
        projectionSources[key] = 'legacy-projection'
      }
    } else if (Object.prototype.hasOwnProperty.call(body.values, key)) {
      projection[key] = body.values[key]
      projectionSources[key] = 'legacy-preset'
    }
  }
  let publicGate
  let gateWordsSource
  if (publicConfig !== undefined && Object.prototype.hasOwnProperty.call(publicConfig, 'gateWords')) {
    publicGate = validGateWordsOrUndefined(publicConfig.gateWords)
    if (publicGate === undefined) diagnostics.push('invalid legacy gateWords')
    else gateWordsSource = 'legacy-projection'
  }
  const gateWords = publicGate !== undefined ? publicGate : body.gateWords
  if (gateWords !== undefined && gateWordsSource === undefined) gateWordsSource = 'legacy-preset'
  if (body.gateWordsState === 'ambiguous') diagnostics.push('ambiguous legacy gateWords')
  if (body.gateWordsState === 'invalid') diagnostics.push('invalid legacy body gateWords')
  return {
    authority: body,
    projection,
    projectionSources,
    gateWords,
    gateWordsSource,
    diagnostics,
    legacyPlugins,
    publicConfig: publicConfig || {},
  }
}

/** 统一解析全局权威值；当前 settings 行合法值优先，旧值仅填缺项。 */
export function resolveUnifiedConfig(options = {}) {
  const input = options !== null && typeof options === 'object' ? options : {}
  const defaults = createDefaultSettings()
  const legacy = input.legacyState !== undefined
    ? input.legacyState
    : (input.declaredPlugins !== undefined && typeof input.readPatch !== 'function'
      ? (() => {
          const body = legacyStateFromPlugins(input.declaredPlugins)
          const projection = directProjectionFromLegacy(input.declaredPlugins)
          const projectionSources = Object.fromEntries(Object.keys(projection).map((key) => [key, 'legacy-preset']))
          return { authority: body, projection, projectionSources, gateWords: body.gateWords, gateWordsSource: body.gateWords === undefined ? undefined : 'legacy-preset', diagnostics: [], legacyPlugins: input.declaredPlugins }
        })()
      : readLegacyState(typeof input.readPatch === 'function' ? input.readPatch() : undefined))
  const authority = plainObject(input.settingsValues) ? input.settingsValues : {}
  const authorityHasGateWords = Object.prototype.hasOwnProperty.call(authority, 'gateWords')
  if (authorityHasGateWords) {
    try { validateGateWords(authority.gateWords) }
    catch (error) { throw new Error('当前全局 gateWords 非法：' + String(error && error.message || error)) }
  }
  const publicFallback = { ...(legacy.projection || {}) }
  const legacyProjectionSources = legacy.projectionSources !== null && typeof legacy.projectionSources === 'object' ? legacy.projectionSources : {}
  const values = {}
  const sources = {}
  const patch = {}
  for (const definition of SETTING_DEFINITIONS) {
    const key = definition.key
    let value
    if (validDefinitionValue(definition, authority[key])) {
      value = normalizeSettingValue(definition, authority[key])
      sources[key] = 'settings-row'
    } else if (PROJECTION_SETTING_DEFINITIONS.includes(definition) && validDefinitionValue(definition, publicFallback[key]) && (legacyProjectionSources[key] === 'legacy-projection' || legacyProjectionSources[key] === undefined)) {
      value = normalizeSettingValue(definition, publicFallback[key])
      sources[key] = 'legacy-projection'
    } else if (validDefinitionValue(definition, legacy.authority && legacy.authority.values[key])) {
      value = normalizeSettingValue(definition, legacy.authority.values[key])
      sources[key] = 'legacy-preset'
    } else if (validDefinitionValue(definition, publicFallback[key])) {
      value = normalizeSettingValue(definition, publicFallback[key])
      sources[key] = 'legacy-projection'
    } else {
      value = defaults[key]
      sources[key] = 'default'
    }
    values[key] = value
    if (!validDefinitionValue(definition, authority[key])) patch[key] = value
  }
  let gateWords
  if (authorityHasGateWords) {
    gateWords = validateGateWords(authority.gateWords)
    sources.gateWords = 'settings-row'
  }
  if (gateWords === undefined && legacy.gateWords !== undefined) {
    const legacyGateWords = validGateWordsOrUndefined(legacy.gateWords)
    if (legacyGateWords !== undefined) {
      gateWords = legacyGateWords
      sources.gateWords = legacy.gateWordsSource || 'legacy-preset'
    }
  }
  if (gateWords === undefined && validGateWordsOrUndefined(publicFallback.gateWords) !== undefined) {
    gateWords = validGateWordsOrUndefined(publicFallback.gateWords)
    sources.gateWords = 'legacy-projection'
  }
  if (gateWords === undefined) {
    gateWords = readDefinitionGateWords(assetDefinition())
    sources.gateWords = 'default'
  }
  if (!authorityHasGateWords) patch.gateWords = gateWords
  return { values, defaults, sources, patch, gateWords, legacy, authority }
}

export function restateSettingsConfig(current, inherited, patch = {}) {
  const currentConfig = publicConfigOf(current)
  const inheritedConfig = publicConfigOf(inherited)
  const source = { ...inheritedConfig, ...currentConfig }
  const hasGatePatch = Object.prototype.hasOwnProperty.call(patch, 'gateWords')
  const validatedPatch = {}
  for (const [key, value] of Object.entries(patch)) {
    if (key === 'gateWords') validatedPatch.gateWords = validateGateWords(value)
    else {
      const definition = SETTING_DEFINITIONS.find((item) => item.key === key)
      if (definition === undefined || !validDefinitionValue(definition, value)) throw new Error('非法全局配置：' + key)
      validatedPatch[key] = normalizeSettingValue(definition, value)
    }
  }
  const next = {}
  for (const definition of SETTING_DEFINITIONS) {
    const key = definition.key
    if (validDefinitionValue(definition, source[key])) next[key] = normalizeSettingValue(definition, source[key])
  }
  if (hasGatePatch) next.gateWords = validatedPatch.gateWords
  else if (Object.prototype.hasOwnProperty.call(source, 'gateWords')) next.gateWords = validateGateWords(source.gateWords)
  for (const [key, value] of Object.entries(validatedPatch)) {
    if (key !== 'gateWords') next[key] = value
  }
  return next
}

export const hostRowDefaultsOf = hostRowDefaultsFromTemplate

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

/** 角色 definition 校验：不套用主预设的 17 条/三组契约，只固定 id/name/description/order 与前两行。 */
function assertRoleDefinition(definition, roleId, label) {
  if (!plainObject(definition)) throw new Error(label + ' 必须是对象')
  if (definition.id !== roleId) throw new Error(label + ' id 必须为 ' + roleId)
  if (typeof definition.name !== 'string' || definition.name === '') throw new Error(label + ' name 非法')
  if (typeof definition.description !== 'string' || definition.description === '') throw new Error(label + ' description 非法')
  if (!Number.isInteger(definition.order)) throw new Error(label + ' order 非法')
  if (!Array.isArray(definition.plugins) || definition.plugins.length < 3) throw new Error(label + ' plugins 至少 3 行')
  if (definition.plugins.some((row) => !plainObject(row) || row.insert !== undefined)) throw new Error(label + ' 不得包含 Loader insert wrapper')
  const leading = definition.plugins.slice(0, 2).map((row) => row.id)
  if (JSON.stringify(leading) !== JSON.stringify(ROLE_DEFINITION_LEADING_ROW_IDS)) throw new Error(label + ' 首两行必须为 persona 与 extra-plan')
  if (definition.plugins[0].name !== '@deepseek-ai/dsh-persona' || definition.plugins[1].name !== 'dsh-extra-plan') throw new Error(label + ' 首两行 name 不符')
  return definition
}

export function roleDefinitionOf(roleId) {
  const index = ROLE_IDS.indexOf(roleId)
  if (index === -1) throw new Error('未知角色预设：' + roleId)
  const file = ROLE_DEFINITION_FILES[index]
  if (!existsSync(file)) throw new Error('角色 definition 缺失：' + file)
  return assertRoleDefinition(parsePresetYaml(readFileSync(file, 'utf8')), roleId, '角色 definition ' + roleId)
}

/** 注册顺序：主 definition 在前，4 个角色 definition 按 order 101..104 在后。 */
export function assetDefinitions() {
  return [assetDefinition(), ...ROLE_IDS.map((roleId) => roleDefinitionOf(roleId))]
}

/**
 * 四个角色 definition 跟随主 definition 的 toolPresentationMode：取值 = 主 definition
 * （已由 cloneDefinitionWithProjection 按权威快照派生）内 tool-presentation 行的 config.mode——
 * 复用同一派生结果，不新增第二份配置读取；落点与原语走 projectHostRow（与主 definition 同一条派生路径）。
 * 行缺失/重复/值非法/克隆异常时原样返回生成物 definition（保留生成物默认值），永不抛错、不中断预设挂载。
 */
export function roleDefinitionsWithPresentation(mainDefinition) {
  const definitions = assetDefinitions().slice(1)
  let mode
  try {
    const plugins = mainDefinition !== null && typeof mainDefinition === 'object' ? mainDefinition.plugins : undefined
    const row = findPluginsRow(plugins, HOST_ROW_IDS.toolPresentationMode)
    if (row === null || !plainObject(row.config)) return definitions
    mode = row.config[HOST_ROW_LEAF_KEYS.toolPresentationMode]
  } catch {
    return definitions
  }
  return definitions.map((definition) => {
    try {
      const next = structuredClone(definition)
      if (projectHostRow(next.plugins, 'toolPresentationMode', mode) !== 'ok') return definition
      // 同一 definition 内绝不允许第二行 tool-presentation（宿主判为矛盾并拒绝挂载）：行数不为 1 时保留生成物默认值。
      if (pluginRowIds(next.plugins).filter((id) => id === HOST_ROW_IDS.toolPresentationMode).length !== 1) return definition
      return next
    } catch {
      return definition
    }
  })
}

export function assetPlugins() {
  try { return assetDefinition().plugins } catch { return undefined }
}

export function readDefinitionGateWords(definition = assetDefinition()) {
  const row = findPluginsRow(definition.plugins, GATE_WORDS_GROUP_DEFINITION.rowId)
  if (row === null || !plainObject(row.config)) throw new Error('definition 缺少 gateWords 行')
  return validateGateWords(row.config.gateWords)
}

/**
 * 宿主行投影的单一实现：主 definition 与 4 个角色 definition 共用同一张定位表（HOST_ROW_IDS /
 * HOST_ROW_LEAF_KEYS）与同一套校验/归一化原语（validateSettingValue / normalizeSettingValue）。
 * 返回 'ok' = 已重述该叶；'skipped' = 值非法或非投影键（调用方跳过）；'missing' = 值合法但 definition
 * 缺该行或行内无 config 对象（主 definition 视为坏资产，角色 definition 保留生成物默认值）。
 */
function projectHostRow(plugins, key, value) {
  const setting = PROJECTION_SETTING_DEFINITIONS.find((item) => item.key === key)
  if (setting === undefined || !validateSettingValue(setting, value)) return 'skipped'
  const row = findPluginsRow(plugins, HOST_ROW_IDS[key])
  if (row === null || !plainObject(row.config)) return 'missing'
  row.config[HOST_ROW_LEAF_KEYS[key]] = normalizeSettingValue(setting, value)
  return 'ok'
}

function cloneDefinitionWithProjection(definition, projection = {}) {
  const next = structuredClone(definition)
  for (const [key, value] of Object.entries(projection)) {
    if (key === 'gateWords') continue
    if (projectHostRow(next.plugins, key, value) === 'missing') throw new Error('definition 缺少宿主行 ' + HOST_ROW_IDS[key])
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

/**
 * 计算启动迁移与 public row 收敛。publicConfig 存在时只计划新公开行/­settings 行写入；
 * 未传 publicConfig 时保留旧纯内存 body 合同，便于验证旧值 carry 与 gateWords。
 */
export async function syncPreset(options = {}) {
  const templateFile = join(ASSET_DIR, 'agent.cordis.yml')
  if (!existsSync(templateFile)) throw new Error('预设模板缺失：' + templateFile)
  const templateText = readFileSync(templateFile, 'utf8')
  assertTemplateGateWords(templateText)
  const currentHash = contentHash(ASSET_DIR)
  if (currentHash === null) throw new Error('预设资产缺失：' + ASSET_DIR)
  const definition = assetDefinition()
  let declaredPlugins = options.declaredPlugins
  const hasReadPatch = typeof options.readPatch === 'function'
  let rawPatch
  if (hasReadPatch) {
    try { rawPatch = options.readPatch() } catch { rawPatch = undefined }
  }
  const resolveOptions = {
    settingsValues: options.settingsValues,
  }
  if (declaredPlugins !== undefined) resolveOptions.declaredPlugins = declaredPlugins
  if (hasReadPatch) resolveOptions.readPatch = () => rawPatch
  if (options.legacyState !== undefined) resolveOptions.legacyState = options.legacyState
  const resolved = resolveUnifiedConfig(resolveOptions)
  if (declaredPlugins === undefined && resolved.legacy !== null && typeof resolved.legacy === 'object') declaredPlugins = resolved.legacy.legacyPlugins
  const legacyDiagnostics = resolved.legacy !== null && typeof resolved.legacy === 'object' && Array.isArray(resolved.legacy.diagnostics)
    ? resolved.legacy.diagnostics
    : []
  const assetBody = options.assetPlugins === undefined ? definition.plugins : options.assetPlugins
  const bodyOk = declarationBodyMatchesAsset(declaredPlugins, assetBody)
  const declarationOk = declaredPlugins === undefined ? true : declarationCoversAsset(declaredPlugins)
  const settingsSource = plainObject(options.settingsValues) ? options.settingsValues : {}
  const settingsPatch = {}
  for (const [key, value] of Object.entries(resolved.patch)) {
    if (key === 'gateWords') {
      if (!Object.prototype.hasOwnProperty.call(settingsSource, key) || validGateWordsOrUndefined(settingsSource[key]) === undefined) settingsPatch[key] = value
      continue
    }
    if (!Object.prototype.hasOwnProperty.call(settingsSource, key) || !validDefinitionValue(SETTING_DEFINITIONS.find((item) => item.key === key), settingsSource[key])) settingsPatch[key] = value
  }
  const planned = {
    settings: Object.keys(settingsPatch).length === 0 ? null : { values: settingsPatch, diagnostics: legacyDiagnostics },
    preset: null,
    hostRowConfig: {},
    bodyStale: !bodyOk,
    diagnostics: legacyDiagnostics,
    definition: cloneDefinitionWithProjection(definition, {
      webFetch: resolved.values.webFetch,
      toolPresentationMode: resolved.values.toolPresentationMode,
      gateWords: resolved.gateWords,
    }),
  }
  const needsWork = planned.settings !== null || !declarationOk || !bodyOk
  if (!needsWork) return { action: 'idle' }
  if (typeof options.apply === 'function') await options.apply(planned, { action: 'written' })
  return { action: 'written', plan: planned }
}

function findEntry(rows, id) {
  const matches = rows.filter((item) => item !== null && typeof item === 'object' && item.entry !== undefined && item.entry.options !== undefined && item.entry.options.id === id)
  return matches.length === 1 ? matches[0].entry : undefined
}

async function applyPlan(editor, rows, planned, isActive = () => true) {
  if (planned.settings !== null) {
    const entry = findEntry(rows, SETTINGS_ROW_ID)
    if (entry === undefined) throw new Error('全局管理行缺失：' + SETTINGS_ROW_ID)
    if (!isActive()) return
    await editor.edit(entry, (current, inherited) => restateSettingsConfig(current, inherited, planned.settings.values))
    if (!isActive()) return
  }
}

function readRawPatch(editor) {
  const path = editor !== undefined && typeof editor.documentPath === 'string' ? editor.documentPath : ''
  if (path === '' || !existsSync(path)) return undefined
  try { return readFileSync(path, 'utf8') } catch { return undefined }
}

function settingsValuesFromRows(rows) {
  const matches = rows.filter((item) => item !== null && typeof item === 'object' && item.entry !== undefined && item.entry.options !== undefined && item.entry.options.id === SETTINGS_ROW_ID)
  return matches.length === 1 ? effectiveRowConfig(matches[0]) : undefined
}

export function activeLegacyRow(rows) {
  const entry = findEntry(rows, LEGACY_PRESET_ROW_ID)
  return entry !== undefined
    && entry.disabled !== true
    && entry.fiber !== undefined
    && entry.fiber !== null
    && (entry.fiber.state === 0 || entry.fiber.state === 1 || entry.fiber.state === 2)
}

/** 幂等落定路径的 definition：只按当前 settings 行与 raw patch 投影，不再走旧行（preset-extra-plan）迁移。 */
function projectedAssetDefinition(settingsValues, rawPatch) {
  const resolved = resolveUnifiedConfig({
    settingsValues,
    readPatch: () => rawPatch,
  })
  return cloneDefinitionWithProjection(assetDefinition(), {
    webFetch: resolved.values.webFetch,
    toolPresentationMode: resolved.values.toolPresentationMode,
    gateWords: resolved.gateWords,
  })
}

function structuralValue(value, seen = new Set()) {
  if (value === null || typeof value !== 'object') return typeof value === 'function' ? '[function]' : value
  if (seen.has(value)) return '[cycle]'
  seen.add(value)
  if (Array.isArray(value)) return value.map((item) => structuralValue(item, seen))
  const out = {}
  for (const key of Object.keys(value).sort()) {
    if (key === 'fiber' || key === 'entry') continue
    out[key] = structuralValue(value[key], seen)
  }
  return out
}

function rowStructureRecord(row) {
  if (row === null || typeof row !== 'object' || Array.isArray(row)) return undefined
  const entry = row.entry !== null && typeof row.entry === 'object' && row.entry.options !== null && typeof row.entry.options === 'object'
    ? row.entry.options
    : undefined
  const id = entry !== undefined && typeof entry.id === 'string'
    ? entry.id
    : typeof row.id === 'string' ? row.id : row.override !== null && typeof row.override === 'object' && typeof row.override.id === 'string' ? row.override.id : ''
  if (id === SETTINGS_ROW_ID) return undefined
  const config = entry !== undefined && Object.prototype.hasOwnProperty.call(entry, 'config')
    ? entry.config
    : Object.prototype.hasOwnProperty.call(row, 'config') ? row.config : row.override !== null && typeof row.override === 'object' ? row.override.config : undefined
  return {
    id,
    name: entry !== undefined && typeof entry.name === 'string' ? entry.name : typeof row.name === 'string' ? row.name : '',
    disabled: row.disabled === true || (entry !== undefined && entry.disabled === true),
    config: structuralValue(config),
    override: structuralValue(row.override),
  }
}

/** 非 settings 结构指纹：settings 行及其十项/gateWords 永不参与 adapter handoff 判定。 */
export function structuralFingerprint(rows) {
  const records = []
  const visit = (items) => {
    if (!Array.isArray(items)) return
    for (const row of items) {
      if (row === null || typeof row !== 'object' || Array.isArray(row)) continue
      const record = rowStructureRecord(row)
      if (record === undefined) continue
      records.push(record)
      const entry = row.entry !== null && typeof row.entry === 'object' && row.entry.options !== null && typeof row.entry.options === 'object'
        ? row.entry.options
        : undefined
      const nested = entry !== undefined && Array.isArray(entry.config) ? entry.config : Array.isArray(row.config) ? row.config : undefined
      if (nested !== undefined) visit(nested)
    }
  }
  visit(rows)
  return JSON.stringify({ owner: activeLegacyRow(rows) ? 'legacy' : 'official', rows: records })
}

export function mountPresetSync(ctx, options = {}) {
  const child = ctx
  const onSettledSettings = typeof options.onSettledSettings === 'function' ? options.onSettledSettings : undefined
  const onSettledError = typeof options.onSettledError === 'function' ? options.onSettledError : undefined
  const onAdapterError = typeof options.onAdapterError === 'function' ? options.onAdapterError : undefined
  let active = true
  let disposed = false
  /** 已挂载的官方 adapter fiber（主 definition + 4 角色），按注册顺序保存以便整体回滚。 */
  let adapterFibers = []
  let adapterOwner = 'none'
  let settledQueue = Promise.resolve()
  let structuralQueue = Promise.resolve()
  let lastStructureKey
  const disposeFiber = async (fiber) => {
    if (fiber !== undefined && fiber !== null && typeof fiber.dispose === 'function') return fiber.dispose()
    return undefined
  }
  const reportSettledError = async (error, snapshot) => {
    try {
      if (onSettledError !== undefined) await onSettledError(error, snapshot)
      else console.warn('[dsh-extra-plan] settled settings callback failed（不阻断 adapter）：' + (error instanceof Error ? error.message : String(error)))
    } catch (reportError) {
      console.warn('[dsh-extra-plan] settled settings error reporter failed：' + (reportError instanceof Error ? reportError.message : String(reportError)))
    }
  }
  const reportAdapterError = (error, phase) => {
    const diagnostic = { phase, message: error instanceof Error ? error.message : String(error) }
    try {
      if (onAdapterError !== undefined) onAdapterError(diagnostic)
      else console.warn('[dsh-extra-plan] adapter diagnostic phase=' + phase + '：' + diagnostic.message)
    } catch (reportError) {
      console.warn('[dsh-extra-plan] adapter diagnostic reporter failed：' + (reportError instanceof Error ? reportError.message : String(reportError)))
    }
  }
  const readState = () => {
    const editor = child.configEditor
    const rows = typeof editor.configuration === 'function' ? editor.configuration() : []
    const rawPatch = readRawPatch(editor)
    const legacyState = readLegacyState(rawPatch)
    return {
      editor,
      rows,
      rawPatch,
      legacyState,
      structureKey: structuralFingerprint(rows),
      owner: activeLegacyRow(rows) ? 'legacy' : 'official',
    }
  }
  const snapshotOf = (state) => {
    const resolved = resolveUnifiedConfig({
      settingsValues: settingsValuesFromRows(state.rows),
      readPatch: () => state.rawPatch,
      legacyState: state.legacyState,
    })
    return {
      values: { ...resolved.values },
      gateWords: structuredClone(resolved.gateWords),
    }
  }
  const enqueueSettled = (snapshot) => {
    const work = settledQueue.then(async () => {
      if (!active) return
      try {
        if (onSettledSettings !== undefined) await onSettledSettings(structuredClone(snapshot))
      } catch (error) {
        await reportSettledError(error, snapshot)
      }
    })
    settledQueue = work.catch(() => undefined)
    return work
  }
  const settledSettingsUpdate = (state) => {
    let snapshot
    try {
      snapshot = snapshotOf(state)
    } catch (error) {
      return reportSettledError(error, undefined)
    }
    return enqueueSettled(snapshot)
  }
  const enqueueStructural = (task) => {
    const work = structuralQueue.then(task, task)
    const safe = work.catch((error) => {
      reportAdapterError(error, 'structuralHandoff')
      console.warn('[dsh-extra-plan] structural handoff failed（不阻断 settled/profile sync）：' + (error instanceof Error ? error.message : String(error)))
    })
    structuralQueue = safe
    return safe
  }
  /**
   * 顺序挂载 5 个 definition（主在前、角色在后）；任一角色失败即整体回滚已挂载的全部 fiber，
   * 并把诊断按 phase=mount:<presetId> 上报，不留下半套注册。
   */
  const mountOfficialAdapter = async (definitions) => {
    if (OfficialAgentPreset === undefined) throw new Error('@deepseek-ai/dsh-agent-preset 官方 adapter 不可用')
    if (!active) return
    const mounted = []
    for (const definition of definitions) {
      if (!active) {
        for (let index = mounted.length - 1; index >= 0; index -= 1) await disposeFiber(mounted[index])
        return
      }
      try {
        mounted.push(await child.plugin(OfficialAgentPreset, definition))
      } catch (error) {
        // 整体回滚已挂载的 definition，再把失败冒泡给 initialMount/structuralHandoff 的
        // 既有单点诊断（phase 保持 initialMount/structuralHandoff），消息里带上失败的 preset id。
        for (let index = mounted.length - 1; index >= 0; index -= 1) {
          try { await disposeFiber(mounted[index]) } catch (disposeError) {
            reportAdapterError(disposeError, 'rollback:' + definition.id)
          }
        }
        const detail = error instanceof Error ? error.message : String(error)
        throw new Error('mount ' + definition.id + ' failed: ' + detail)
      }
    }
    adapterOwner = 'official'
    adapterFibers = mounted
  }
  const disposeCurrentAdapter = async () => {
    const previous = adapterFibers
    adapterFibers = []
    for (let index = previous.length - 1; index >= 0; index -= 1) await disposeFiber(previous[index])
  }
  const structuralHandoff = async (state, settledPromise) => {
    await settledPromise
    if (!active) return
    const current = readState()
    const editor = current.editor
    const rows = current.rows
    const result = await syncPreset({
      declaredPlugins: current.legacyState.legacyPlugins,
      settingsValues: settingsValuesFromRows(rows),
      readPatch: () => current.rawPatch,
      legacyState: current.legacyState,
      apply: async (planned) => applyPlan(editor, rows, planned, () => active),
    })
    if (!active) return
    const latest = readState()
    const mainDefinition = result.plan !== undefined && result.plan.definition !== undefined
      ? result.plan.definition
      : projectedAssetDefinition(settingsValuesFromRows(latest.rows), latest.rawPatch)
    if (adapterOwner === 'official') await disposeCurrentAdapter()
    await mountOfficialAdapter([mainDefinition, ...roleDefinitionsWithPresentation(mainDefinition)])
  }
  const initialMount = async () => {
    if (!active) return
    const initial = readState()
    lastStructureKey = initial.structureKey
    let result
    try {
      result = await syncPreset({
        declaredPlugins: initial.legacyState.legacyPlugins,
        settingsValues: settingsValuesFromRows(initial.rows),
        readPatch: () => initial.rawPatch,
        legacyState: initial.legacyState,
        apply: async (planned) => applyPlan(initial.editor, initial.rows, planned, () => active),
      })
      if (!active) return
      const latest = readState()
      lastStructureKey = latest.structureKey
      const settledPromise = settledSettingsUpdate(latest)
      await settledPromise
      if (!active) return
      const mainDefinition = result.plan !== undefined && result.plan.definition !== undefined
        ? result.plan.definition
        : projectedAssetDefinition(settingsValuesFromRows(latest.rows), latest.rawPatch)
      await mountOfficialAdapter([mainDefinition, ...roleDefinitionsWithPresentation(mainDefinition)])
    } catch (error) {
      reportAdapterError(error, 'initialMount')
      console.warn('[dsh-extra-plan] initial mount/adapter failed（不阻断 settled/profile sync）：' + (error instanceof Error ? error.message : String(error)))
    }
  }
  const settledOnlyUpdate = (state) => settledSettingsUpdate(state)
  const offUpdate = typeof child.on === 'function' ? child.on('internal/update', () => {
    if (!active) return
    let state
    try {
      state = readState()
    } catch (error) {
      void reportSettledError(error, undefined)
      return
    }
    const settledPromise = settledOnlyUpdate(state)
    const structural = lastStructureKey === undefined || state.structureKey !== lastStructureKey
    lastStructureKey = state.structureKey
    if (!structural) return
    void enqueueStructural(() => structuralHandoff(state, settledPromise))
  }) : undefined
  const dispose = async () => {
    if (disposed) return undefined
    disposed = true
    active = false
    if (typeof offUpdate === 'function') offUpdate()
    await settledQueue
    await structuralQueue
    await disposeCurrentAdapter()
  }
  void enqueueStructural(initialMount)
  return dispose
}


export { SETTINGS_ROW_ID, PRESET_ROW_ID, LEGACY_PRESET_ROW_ID }
