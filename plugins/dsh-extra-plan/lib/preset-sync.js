// 预设核对组件：读取生成 definition，直接挂载官方 AgentPreset adapter。
// 当前规范配置唯一来源为 settings 行（id=dsh-extra-plan-settings，name=dsh-extra-plan/settings）；普通缺项只取新默认。
// gateWords 与普通项同口径：属性缺失或显式对象非法都回落当前资产默认并写入补齐，旧键随整组写盘删除；资产本身坏才严格抛错。
// 历史配置 ID 不读取、不迁移、不回退；profile 写入仍一律经 configEditor.edit。
// definition 的 group/isolate/!!js 原文交给官方 adapter，不能提前求值或复制 registry。

import { createHash } from 'node:crypto'
import { existsSync, readFileSync } from 'node:fs'
import { join, dirname, isAbsolute } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createRequire } from 'node:module'
import { createPathContext, resolveHostPath, resolveWorkspacePath, validateReadTarget } from './path-policy.js'
import {
  HOST_ROW_IDS,
  HOST_ROW_LEAF_KEYS,
  PROJECTION_SETTING_DEFINITIONS,
  SETTINGS_ROW_ID,
  SETTING_DEFINITIONS,
  createDefaultSettings,
  findPluginsRow,
  normalizeSettingValue,
  validateSettingValue,
} from './preset-settings.js'
import {
  GATE_WORDS_GROUP_DEFINITION,
  validateGateWords,
} from './gate-words.js'
import { parsePresetYaml, resolveSetting, EXECUTOR_TOOL_NAME_PREFIX } from './preset-settings.js'
import { ROLE_IDS } from './role-contract.js'

const officialAgentPresetByAnchor = new Map()
function errorWithCause(message, cause) {
  const error = new Error(message)
  error.cause = cause
  return error
}

function assertInstallAnchor(installAnchor) {
  if (typeof installAnchor !== 'string' || installAnchor.trim() === '' || !isAbsolute(installAnchor) || installAnchor.split(/[\\/]/).pop() !== 'package.json') {
    throw new Error('extra-plan: installAnchor 必须是绝对 dsh 应用 package.json 文件')
  }
  if (!existsSync(installAnchor)) throw new Error('extra-plan: installAnchor 不存在：' + installAnchor)
  let manifest
  try {
    manifest = JSON.parse(readFileSync(installAnchor, 'utf8'))
  } catch (cause) {
    throw errorWithCause('extra-plan: installAnchor manifest 无法读取：' + installAnchor, cause)
  }
  if (manifest === null || typeof manifest !== 'object' || manifest.name !== '@deepseek-ai/dsh') {
    throw new Error('extra-plan: installAnchor 不是 @deepseek-ai/dsh 应用 package.json：' + installAnchor)
  }
  return installAnchor
}

function loadOfficialAgentPreset(installAnchor) {
  const cached = officialAgentPresetByAnchor.get(installAnchor)
  if (cached !== undefined) return cached
  try {
    const anchor = assertInstallAnchor(installAnchor)
    const officialRequire = createRequire(anchor)
    const loaded = officialRequire('@deepseek-ai/dsh-agent-preset')
    const adapter = loaded !== null && typeof loaded === 'object' && loaded.default !== undefined ? loaded.default : loaded
    if (adapter === null || adapter === undefined) throw new Error('@deepseek-ai/dsh-agent-preset 导出为空')
    officialAgentPresetByAnchor.set(anchor, adapter)
    return adapter
  } catch (cause) {
    throw errorWithCause('extra-plan: @deepseek-ai/dsh-agent-preset 官方 adapter 不可用（installAnchor=' + String(installAnchor) + '）', cause)
  }
}

const PRESET_ID = 'extra-plan'
export const CORE_FILES = ['preset.yml', 'agent.cordis.yml']
/** 生成 definition 顶层的 17 条 agent plugin 行。 */


const HERE = dirname(fileURLToPath(import.meta.url))
export const ASSET_DIR = join(HERE, '..', 'assets', 'presets', PRESET_ID)
export const ASSET_DEFINITION_FILE = join(ASSET_DIR, 'preset-definition.generated.yml')
/** 角色预设固定顺序（order 101..104），与生成器 ROLE_IDS 同源同序：主在前、角色在后。 */
export { ROLE_IDS }
export const ROLE_DEFINITION_FILES = Object.freeze(ROLE_IDS.map((roleId) => join(ASSET_DIR, 'preset-definition-' + roleId + '.generated.yml')))
/** 角色 definition 里固定前两行：dsh-persona 与 dsh-extra-plan。 */
export const ROLE_DEFINITION_LEADING_ROW_IDS = Object.freeze(['persona', 'extra-plan'])

const ASSET_CAPABILITY = 'dsh-extra-plan-assets'
const ASSET_RESOURCE_CONTEXT = createPathContext({
  hostCapabilities: [{
    name: ASSET_CAPABILITY,
    path: ASSET_DIR,
    type: 'directory',
    access: 'read',
    purpose: ASSET_CAPABILITY,
  }],
})

function assetReadTarget(filePath) {
  const candidate = resolveHostPath(ASSET_RESOURCE_CONTEXT, filePath, {
    capability: ASSET_CAPABILITY,
    purpose: ASSET_CAPABILITY,
  })
  return validateReadTarget(ASSET_RESOURCE_CONTEXT, candidate, { expectedType: 'file' }).path
}

function readAssetBytes(filePath, label) {
  try {
    return readFileSync(assetReadTarget(filePath))
  } catch (error) {
    if (error !== null && typeof error === 'object' && error.code === 'TARGET_MISSING') {
      throw new Error(label + ' 缺失：' + filePath)
    }
    throw error
  }
}

function resourceReadTarget(filePath, options = {}) {
  const context = options.pathContext
  if (context === undefined || context === null) throw new Error('extra-plan: 自定义资源读取缺少 pathContext')
  const kind = options.kind
  const pathOptions = {
    ...(options.capability === undefined ? {} : { capability: options.capability }),
    purpose: options.purpose === undefined ? 'preset-resource' : options.purpose,
  }
  const candidate = kind === 'host'
    ? resolveHostPath(context, filePath, pathOptions)
    : kind === 'workspace'
      ? resolveWorkspacePath(context, filePath, pathOptions)
      : (() => { throw new Error('extra-plan: 自定义资源 kind 必须为 workspace 或 host') })()
  return validateReadTarget(context, candidate, { expectedType: 'file' }).path
}

function readResourceBytes(filePath, options = {}) {
  try {
    return readFileSync(resourceReadTarget(filePath, options))
  } catch (error) {
    if (error !== null && typeof error === 'object' && error.code === 'TARGET_MISSING') return null
    throw error
  }
}

export function contentHash(dir, options = {}) {
  const h = createHash('sha256')
  for (const file of CORE_FILES) {
    const filePath = join(dir, file)
    const bytes = dir === ASSET_DIR && options.pathContext === undefined && options.kind === undefined
      ? (() => {
          try { return readFileSync(assetReadTarget(filePath)) }
          catch (error) {
            if (error !== null && typeof error === 'object' && error.code === 'TARGET_MISSING') return null
            throw error
          }
        })()
      : readResourceBytes(filePath, options)
    if (bytes === null) return null
    h.update(bytes)
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



function plainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
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




function validDefinitionValue(definition, value) {
  return validateSettingValue(definition, value)
}









/**
 * 统一解析当前 settings 行；缺失或非法普通项只取新默认。
 * gateWords 与普通项同口径：整个属性缺失或显式对象非法都回落当前资产默认（agent.cordis.yml 当前值），
 * 并写入 patch 补齐——非法对象被整组替换，旧键随本次写盘删除。
 * 资产自身损坏（缺 gateWords 行/资产值非法）仍由 assetDefinition/readDefinitionGateWords 严格抛错，不吞代码缺陷。
 */
export function resolveUnifiedConfig(options = {}) {
  const input = options !== null && typeof options === 'object' ? options : {}
  const defaults = createDefaultSettings()
  const authority = plainObject(input.settingsValues) ? input.settingsValues : {}
  const authorityHasGateWords = Object.prototype.hasOwnProperty.call(authority, 'gateWords')
  const diagnostics = []
  let capturedGateWords
  if (authorityHasGateWords) {
    try { capturedGateWords = validateGateWords(authority.gateWords) }
    catch (error) { diagnostics.push('gateWords-invalid-fallback-default:' + String(error && error.message || error)) }
  }
  const values = {}
  const sources = {}
  const patch = {}
  for (const definition of SETTING_DEFINITIONS) {
    const key = definition.key
    const captured = validDefinitionValue(definition, authority[key])
    if (captured) {
      values[key] = normalizeSettingValue(definition, authority[key])
      sources[key] = 'settings-row'
    } else {
      values[key] = defaults[key]
      sources[key] = 'default'
      patch[key] = values[key]
    }
  }
  const gateWords = capturedGateWords === undefined
    ? readDefinitionGateWords(assetDefinition())
    : capturedGateWords
  sources.gateWords = capturedGateWords === undefined ? 'default' : 'settings-row'
  if (capturedGateWords === undefined) patch.gateWords = gateWords
  return { values, defaults, sources, patch, gateWords, authority, diagnostics }
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
  else if (Object.prototype.hasOwnProperty.call(source, 'gateWords')) {
    // 与 resolveUnifiedConfig 同口径：持久值非法时回落当前资产默认，旧键随本次整组重述删除；
    // 资产自身损坏仍抛错（代码缺陷不静默）。
    try { next.gateWords = validateGateWords(source.gateWords) }
    catch { next.gateWords = readDefinitionGateWords(assetDefinition()) }
  }
  for (const [key, value] of Object.entries(validatedPatch)) {
    if (key !== 'gateWords') next[key] = value
  }
  return next
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

// 资产构建期生成、运行期不可变；缓存对象视为只读，所有变异方均先 structuredClone。
let cachedAsset = null

export function assetDefinition() {
  if (cachedAsset !== null) return cachedAsset
  const parsed = parsePresetDefinition(readAssetBytes(ASSET_DEFINITION_FILE, '预设 definition').toString('utf8'))
  cachedAsset = parsed
  return cachedAsset
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
  return assertRoleDefinition(parsePresetYaml(readAssetBytes(file, '角色 definition').toString('utf8')), roleId, '角色 definition ' + roleId)
}

/** 注册顺序：主 definition 在前，4 个角色 definition 按 order 101..104 在后。 */
export function assetDefinitions() {
  return [assetDefinition(), ...ROLE_IDS.map((roleId) => roleDefinitionOf(roleId))]
}

/**
 * 四个角色 definition 跟随主 definition 的 toolPresentationMode：取值 = 主 definition
 * （已由 cloneDefinitionWithProjection 按权威快照派生）plugins 内唯一一个 executor 行 id
 * （tool-executor-native → native、tool-executor-ptc → ptc）——复用同一派生结果，不新增第二份配置读取；
 * 落点与原语走 projectHostRow（与主 definition 同一条派生路径）。
 * executor 行缺失/两行并存/克隆异常时原样返回生成物 definition（保留生成物默认值），永不抛错、不中断预设挂载。
 */
export function roleDefinitionsWithPresentation(mainDefinition) {
  const definitions = assetDefinitions().slice(1)
  let mode
  try {
    const plugins = mainDefinition !== null && typeof mainDefinition === 'object' ? mainDefinition.plugins : undefined
    const ids = pluginRowIds(plugins)
    const nativeRows = ids.filter((id) => id === HOST_ROW_IDS.toolPresentationMode.native).length
    const ptcRows = ids.filter((id) => id === HOST_ROW_IDS.toolPresentationMode.ptc).length
    if (nativeRows + ptcRows !== 1) return definitions
    mode = nativeRows === 1 ? 'native' : 'ptc'
  } catch {
    return definitions
  }
  return definitions.map((definition) => {
    try {
      const next = structuredClone(definition)
      if (projectHostRow(next.plugins, 'toolPresentationMode', mode) !== 'ok') return definition
      // 同一 definition 内绝不允许两个 executor 行并存（宿主判为矛盾并拒绝挂载）：两行 id 合计不为 1 时保留生成物默认值。
      if (pluginRowIds(next.plugins).filter((id) => id === HOST_ROW_IDS.toolPresentationMode.native || id === HOST_ROW_IDS.toolPresentationMode.ptc).length !== 1) return definition
      return next
    } catch {
      return definition
    }
  })
}

export function readDefinitionGateWords(definition = assetDefinition()) {
  const row = findPluginsRow(definition.plugins, GATE_WORDS_GROUP_DEFINITION.rowId)
  if (row === null || !plainObject(row.config)) throw new Error('definition 缺少 gateWords 行')
  return validateGateWords(row.config.gateWords)
}

/**
 * 宿主行投影的单一实现：主 definition 与 4 个角色 definition 共用同一张定位表（HOST_ROW_IDS /
 * HOST_ROW_LEAF_KEYS）与同一套校验/归一化原语（validateSettingValue / normalizeSettingValue）。
 * toolPresentationMode 按 executor 行身份处理：按两个 executor 行 id 合计判定，恰一行时按目标 mode
 * 改写该行 id/name 并删除其 config（executor 行无 config）；webFetch 等叶值键沿用原叶改写。
 * 返回 'ok' = 已重述该值；'skipped' = 值非法或非投影键（调用方跳过）；'missing' = 值合法但 definition
 * 缺该行（executor 行 0 行或多行）或叶值键所在行无 config 对象（主 definition 视为坏资产，
 * 角色 definition 保留生成物默认值）。
 */
function projectHostRow(plugins, key, value) {
  const setting = PROJECTION_SETTING_DEFINITIONS.find((item) => item.key === key)
  if (setting === undefined || !validateSettingValue(setting, value)) return 'skipped'
  if (key === 'toolPresentationMode') {
    const nativeRow = findPluginsRow(plugins, HOST_ROW_IDS[key].native)
    const ptcRow = findPluginsRow(plugins, HOST_ROW_IDS[key].ptc)
    if ((nativeRow === null) === (ptcRow === null)) return 'missing'
    const row = nativeRow !== null ? nativeRow : ptcRow
    if (row.id === HOST_ROW_IDS[key][value]) return 'ok'
    row.id = HOST_ROW_IDS[key][value]
    row.name = EXECUTOR_TOOL_NAME_PREFIX + value
    delete row.config
    return 'ok'
  }
  const row = findPluginsRow(plugins, HOST_ROW_IDS[key])
  if (row === null || !plainObject(row.config)) return 'missing'
  row.config[HOST_ROW_LEAF_KEYS[key]] = normalizeSettingValue(setting, value)
  return 'ok'
}

function cloneDefinitionWithProjection(definition, projection = {}) {
  const next = structuredClone(definition)
  for (const [key, value] of Object.entries(projection)) {
    if (key === 'gateWords') continue
    if (projectHostRow(next.plugins, key, value) === 'missing') throw new Error('definition 缺少宿主行 ' + (key === 'toolPresentationMode' ? 'tool-executor-native/tool-executor-ptc' : HOST_ROW_IDS[key]))
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



function assertTemplateGateWords(text) {
  const captured = resolveSetting(parsePresetYaml(text), GATE_WORDS_GROUP_DEFINITION, { aliases: false })
  if (captured.kind !== 'ok') throw new Error('extra-plan: 厂商模板 gateWords ' + captured.kind)
  return validateGateWords(captured.value)
}



/** 计算当前 settings 行补齐与官方 definition；不读取历史声明或原始 patch。 */
export async function syncPreset(options = {}) {
  const templateFile = join(ASSET_DIR, 'agent.cordis.yml')
  const templateText = readAssetBytes(templateFile, '预设模板').toString('utf8')
  assertTemplateGateWords(templateText)
  const currentHash = contentHash(ASSET_DIR)
  if (currentHash === null) throw new Error('预设资产缺失：' + ASSET_DIR)
  const definition = assetDefinition()
  const resolved = resolveUnifiedConfig({ settingsValues: options.settingsValues })
  const settingsPatch = resolved.patch
  const planned = {
    settings: Object.keys(settingsPatch).length === 0 ? null : { values: settingsPatch, diagnostics: resolved.diagnostics },
    definition: cloneDefinitionWithProjection(definition, {
      webFetch: resolved.values.webFetch,
      toolPresentationMode: resolved.values.toolPresentationMode,
      gateWords: resolved.gateWords,
    }),
    diagnostics: resolved.diagnostics,
  }
  if (planned.settings === null) return { action: 'idle' }
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

function trustedProfileContextOf(ctx) {
  const direct = ctx !== null && typeof ctx === 'object' ? ctx.profileContext : undefined
  if (direct !== undefined) return direct
  if (ctx !== null && typeof ctx === 'object' && typeof ctx.get === 'function') {
    try { return ctx.get('profileContext') } catch { return undefined }
  }
  return undefined
}



function settingsValuesFromRows(rows) {
  const matches = rows.filter((item) => item !== null && typeof item === 'object' && item.entry !== undefined && item.entry.options !== undefined && item.entry.options.id === SETTINGS_ROW_ID)
  return matches.length === 1 ? effectiveRowConfig(matches[0]) : undefined
}



/** 幂等落定路径的 definition：只按当前 settings 行值解析投影。 */
function projectedAssetDefinition(settingsValues) {
  const resolved = resolveUnifiedConfig({ settingsValues })
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

/** 非 settings 结构指纹：settings 行及其十一项/gateWords 永不参与 adapter handoff 判定。 */
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
  return JSON.stringify({ rows: records })
}

function installAnchorOf(ctx, options) {
  const profileContext = trustedProfileContextOf(ctx)
  return profileContext !== undefined ? profileContext.installAnchor : options.installAnchor
}

export function mountPresetSync(ctx, options = {}) {
  const child = ctx
  const installAnchor = installAnchorOf(child, options)
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
    return {
      editor,
      rows,
      structureKey: structuralFingerprint(rows),
    }
  }
  const snapshotOf = (state) => {
    const resolved = resolveUnifiedConfig({
      settingsValues: settingsValuesFromRows(state.rows),
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
    if (!active) return
    const officialAgentPreset = loadOfficialAgentPreset(installAnchor)
    const mounted = []
    for (const definition of definitions) {
      if (!active) {
        for (let index = mounted.length - 1; index >= 0; index -= 1) await disposeFiber(mounted[index])
        return
      }
      try {
        mounted.push(await child.plugin(officialAgentPreset, definition))
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
      settingsValues: settingsValuesFromRows(rows),
      apply: async (planned) => applyPlan(editor, rows, planned, () => active),
    })
    if (!active) return
    const latest = readState()
    const mainDefinition = result.plan !== undefined && result.plan.definition !== undefined
      ? result.plan.definition
      : projectedAssetDefinition(settingsValuesFromRows(latest.rows))
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
        settingsValues: settingsValuesFromRows(initial.rows),
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
        : projectedAssetDefinition(settingsValuesFromRows(latest.rows))
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


export { SETTINGS_ROW_ID }
