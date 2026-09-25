// Shared settings descriptors, YAML parsing, and format-preserving scalar patches.
// The descriptor list is the only source of truth for settings-page fields.
//
// dsh 0.1.7-rc.1 载体订正（2026-09-25 二轮：权威值上移 settings 行 + 声明行投影）：
// 设置值有三个落点，descriptor 用三套行定位元数据表达——
//  - rowLocator：**权威值落点** = settings 行 dsh-extra-plan-settings 的 config.<key>。
//    10 项设置（8 项 UI + 2 项宿主行）的权威值全部在此行：宿主不清理、安装/重装流程不动它
//    （configEditor.edit 对该行的继承层是空对象，永不判「值==继承层」而删行）。
//    captureRowSettings / live-config 的读路径都走它。
//  - projectionLocator：**投影落点** = 声明行 preset-extra-plan 的 config.plugins 内
//    tool-web / tool-presentation 子行（仅 2 项宿主行设置）。消费方是宿主行装载期快照，
//    故必须投影到声明行；**投影被宿主删除是无害状态**（权威值在 settings 行，按权威值重建）。
//  - sourceLocator：源模板（资产）的行定位 =
//    assets/presets/extra-plan/agent.cordis.yml（顶层 id=extra-plan / tool-web /
//    tool-presentation 行），captureSettings、resolveTemplateSettingDefault 与
//    patchYamlScalar 都走它（跨版本搬迁链已于 2026-09-25 死代码清理删除）。
// group 标记「消费方分组」（不表示权威值落点）：8 项 extra-plan（本插件自己热读）
//   / 2 项 host-rows（投影给宿主行 tool-web / tool-presentation）。

import { createRequire } from 'node:module'
import { existsSync, readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'

function loadYaml() {
  const localRequire = createRequire(import.meta.url)
  try {
    return localRequire('js-yaml')
  } catch (firstError) {
    const home = process.env.APPDATA || join(homedir(), 'AppData', 'Roaming')
    try {
      const officialRequire = createRequire(join(home, 'npm', 'node_modules', '@deepseek-ai', 'dsh', 'package.json'))
      return officialRequire('js-yaml')
    } catch {
      throw firstError
    }
  }
}

const yaml = loadYaml()
const JsExpr = new yaml.Type('tag:yaml.org,2002:js', {
  kind: 'scalar',
  resolve: (data) => typeof data === 'string',
  construct: (data) => ({ __jsExpr: data }),
  predicate: (data) => data !== null && typeof data === 'object' && typeof data.__jsExpr === 'string',
  represent: (data) => data.__jsExpr,
})
export const YAML_SCHEMA = yaml.JSON_SCHEMA.extend(JsExpr)

const isString = (value) => typeof value === 'string'
const isPositiveInteger = (value) => typeof value === 'number' && Number.isInteger(value) && value > 0
const isBoolean = (value) => typeof value === 'boolean'
const modeOptions = Object.freeze(['native', 'ptc', 'both'])
const isMode = (value) => typeof value === 'string' && modeOptions.includes(value)

/** 新载体行 id（settings 命名空间 = profile 行 id）。 */
export const SETTINGS_ROW_ID = 'dsh-extra-plan-settings'
/** 预设声明行 id 与模块名（config.plugins = agent.cordis.yml 顶层条目）。 */
export const PRESET_ROW_ID = 'preset-extra-plan'
export const PRESET_PLUGIN_NAME = '@deepseek-ai/dsh-agent-preset'
/** 声明行 plugins 内承载 2 项宿主行设置的子行 id（投影落点的行 id）。 */
export const HOST_ROW_IDS = Object.freeze({ webFetch: 'tool-web', toolPresentationMode: 'tool-presentation' })
/** 投影落点的叶键（宿主行 config 内键名）：源模板与投影共用同一份 leaf 名，不新增第二份键名清单。 */
export const HOST_ROW_LEAF_KEYS = Object.freeze({ webFetch: 'fetch', toolPresentationMode: 'mode' })
/** descriptor 分组（消费方）：8 项落 settings 行 / 2 项另投影到声明行 plugins 子行。 */
export const SETTING_GROUPS = Object.freeze({ EXTRA_PLAN: 'extra-plan', HOST_ROWS: 'host-rows' })

const setting = (definition) => Object.freeze({
  ...definition,
  type: definition.scalarType,
  sourceLocator: Object.freeze({ ...definition.sourceLocator }),
  rowLocator: Object.freeze({ ...definition.rowLocator }),
  ...(definition.projectionLocator === undefined
    ? {}
    : { projectionLocator: Object.freeze({ ...definition.projectionLocator }) }),
  locatorAliases: Object.freeze((definition.locatorAliases || []).map((alias) => Object.freeze({
    rowId: alias.rowId,
    path: alias.path,
  }))),
  ui: Object.freeze({
    ...definition.ui,
    options: definition.ui.options === undefined ? undefined : Object.freeze([...definition.ui.options]),
    optionLocale: definition.ui.optionLocale === undefined
      ? undefined
      : Object.freeze({ ...definition.ui.optionLocale }),
  }),
})

/** 权威值落点：settings 行（10 项统一）config.<key>。 */
const settingsRowLocator = (key, path) => ({ rowId: SETTINGS_ROW_ID, path: path === undefined ? 'config.' + key : path })
const sourceLocator = (key, path) => ({ rowId: 'extra-plan', path: path === undefined ? 'config.' + key : path })
/** 投影落点：声明行 plugins 内 host-rows 子行 config.<leaf>（leaf 名与源模板同名）。 */
const hostRowProjectionLocator = (key) => ({
  rowId: PRESET_ROW_ID,
  pluginsRowId: HOST_ROW_IDS[key],
  path: 'config.' + HOST_ROW_LEAF_KEYS[key],
})

export const SETTING_DEFINITIONS = Object.freeze([
  setting({
    key: 'anchoredBootstrap', group: SETTING_GROUPS.EXTRA_PLAN, scalarType: 'boolean',
    sourceLocator: sourceLocator('anchoredBootstrap'), rowLocator: settingsRowLocator('anchoredBootstrap'),
    validator: isBoolean, ui: { control: 'select', options: [true, false], locale: 'anchoredBootstrap', section: 'general' }, locatorAliases: [],
  }),
  setting({
    key: 'creativeMode', group: SETTING_GROUPS.EXTRA_PLAN, scalarType: 'boolean',
    sourceLocator: sourceLocator('creativeMode'), rowLocator: settingsRowLocator('creativeMode'),
    validator: isBoolean, ui: { control: 'select', options: [true, false], locale: 'creativeMode', section: 'general' }, locatorAliases: [],
  }),
  setting({
    key: 'webFetch', group: SETTING_GROUPS.HOST_ROWS, scalarType: 'boolean',
    // 源模板行 = 投影落点同行同叶（tool-web.config.fetch）；
    // 权威值落点 = settings 行 config.webFetch；投影落点 = 声明行 tool-web 子行（须与源同形）。
    sourceLocator: { rowId: HOST_ROW_IDS.webFetch, path: 'config.' + HOST_ROW_LEAF_KEYS.webFetch },
    rowLocator: settingsRowLocator('webFetch'),
    projectionLocator: hostRowProjectionLocator('webFetch'),
    validator: isBoolean, ui: { control: 'select', options: [true, false], locale: 'webFetch', section: 'general' }, locatorAliases: [],
  }),
  setting({
    key: 'toolPresentationMode', group: SETTING_GROUPS.HOST_ROWS, scalarType: 'mode',
    sourceLocator: { rowId: HOST_ROW_IDS.toolPresentationMode, path: 'config.' + HOST_ROW_LEAF_KEYS.toolPresentationMode },
    rowLocator: settingsRowLocator('toolPresentationMode'),
    projectionLocator: hostRowProjectionLocator('toolPresentationMode'),
    validator: isMode,
    ui: {
      control: 'select', options: modeOptions,
      optionLocale: { native: 'toolPresentationModeNative', ptc: 'toolPresentationModePtc', both: 'toolPresentationModeBoth' },
      locale: 'toolPresentationMode',
      section: 'general',
    },
    locatorAliases: [],
  }),
  setting({
    key: 'runcodeCatchGate', group: SETTING_GROUPS.EXTRA_PLAN, scalarType: 'boolean',
    sourceLocator: sourceLocator('runcodeCatchGate'), rowLocator: settingsRowLocator('runcodeCatchGate'),
    validator: isBoolean, ui: { control: 'select', options: [true, false], locale: 'runcodeCatchGate', section: 'general' }, locatorAliases: [],
  }),
  setting({
    key: 'crossProviderPlannerModel', group: SETTING_GROUPS.EXTRA_PLAN, scalarType: 'boolean',
    sourceLocator: sourceLocator('crossProviderPlannerModel'), rowLocator: settingsRowLocator('crossProviderPlannerModel'),
    validator: isBoolean, ui: { control: 'select', options: [true, false], locale: 'crossProviderPlannerModel', section: 'pro' }, locatorAliases: [],
  }),
  setting({
    key: 'plannerModel', group: SETTING_GROUPS.EXTRA_PLAN, scalarType: 'string',
    sourceLocator: sourceLocator('plannerModel'), rowLocator: settingsRowLocator('plannerModel'),
    // T4：允许空串（= 显式清空 = 继承主会话模型；解析侧只判 !==''，键缺失才用代码缺省值）。
    // 空白串经 normalize trim 归一为 ''，与空串同义；非 string（如 YAML 数字）仍非法。
    validator: isString, normalize: (value) => value.trim(),
    ui: { control: 'text', locale: 'plannerModel', section: 'pro' }, locatorAliases: [],
  }),
  setting({
    key: 'plannerPromptSuffix', group: SETTING_GROUPS.EXTRA_PLAN, scalarType: 'string',
    sourceLocator: sourceLocator('plannerPromptSuffix'), rowLocator: settingsRowLocator('plannerPromptSuffix'),
    validator: isString, ui: { control: 'textarea', locale: 'plannerPromptSuffix', section: 'pro' }, locatorAliases: [],
  }),
  setting({
    key: 'exploreBudget', group: SETTING_GROUPS.EXTRA_PLAN, scalarType: 'integer',
    sourceLocator: sourceLocator('exploreBudget'), rowLocator: settingsRowLocator('exploreBudget'),
    validator: isPositiveInteger, ui: { control: 'number', min: 1, step: 1, locale: 'exploreBudget', section: 'pro' }, locatorAliases: [],
  }),
  setting({
    key: 'otherAgentModel', group: SETTING_GROUPS.EXTRA_PLAN, scalarType: 'string',
    sourceLocator: sourceLocator('otherAgentModel'), rowLocator: settingsRowLocator('otherAgentModel'),
    validator: isString, normalize: (value) => value.trim(),
    ui: { control: 'text', locale: 'otherAgentModel', section: 'pro' }, locatorAliases: [],
  }),
])

/** 8 项 UI 设置（权威值落 settings 行；= live-config 热读键集合）。 */
export const EXTRA_PLAN_SETTING_DEFINITIONS = Object.freeze(
  SETTING_DEFINITIONS.filter((item) => item.group === SETTING_GROUPS.EXTRA_PLAN),
)
/** 2 项宿主行设置（权威值同样落 settings 行；另经 projectionLocator 投影到声明行 plugins 子行）。 */
export const HOST_ROW_SETTING_DEFINITIONS = Object.freeze(
  SETTING_DEFINITIONS.filter((item) => item.group === SETTING_GROUPS.HOST_ROWS),
)
/** 带投影面的设置（= 2 项宿主行设置）——投影一致性与投影 plan 的唯一遍历源。 */
export const PROJECTION_SETTING_DEFINITIONS = Object.freeze(
  SETTING_DEFINITIONS.filter((item) => item.projectionLocator !== undefined),
)

export const TOOL_PRESENTATION_MODES = Object.freeze([
  ...SETTING_DEFINITIONS.find((item) => item.key === 'toolPresentationMode').ui.options,
])
const descriptorByKey = new Map(SETTING_DEFINITIONS.map((item) => [item.key, item]))

export function getSettingDefinition(key) {
  return descriptorByKey.get(key)
}

export function parsePresetYaml(text) {
  return yaml.load(text, { schema: YAML_SCHEMA })
}

function hasOwn(object, key) {
  return object !== null && typeof object === 'object' && Object.prototype.hasOwnProperty.call(object, key)
}

function pathParts(path) {
  return String(path).split('.').filter((part) => part !== '')
}

export function readPath(object, path) {
  let value = object
  for (const part of pathParts(path)) {
    if (!hasOwn(value, part)) return { exists: false, value: undefined }
    value = value[part]
  }
  return { exists: true, value }
}

function rowsById(document, rowId) {
  const rows = []
  const seen = new Set()
  const visit = (value) => {
    if (value === null || typeof value !== 'object' || seen.has(value)) return
    seen.add(value)
    if (hasOwn(value, 'id') && value.id === rowId) rows.push(value)
    if (Array.isArray(value)) {
      for (const item of value) visit(item)
    } else {
      for (const child of Object.values(value)) visit(child)
    }
  }
  visit(document)
  return rows
}

function resolveLocator(document, locator) {
  const rows = rowsById(document, locator.rowId)
  if (rows.length === 0) return { kind: 'missing', locator }
  if (rows.length > 1) return { kind: 'ambiguous', locator, matches: rows.length }
  const value = readPath(rows[0], locator.path)
  if (!value.exists) return { kind: 'missing', locator }
  return { kind: 'ok', locator, row: rows[0], value: value.value }
}

function locatorFor(definitionOrLocator) {
  if (definitionOrLocator !== null && definitionOrLocator !== undefined && definitionOrLocator.sourceLocator !== undefined) {
    return definitionOrLocator.sourceLocator
  }
  return definitionOrLocator
}

function aliasesFor(definitionOrLocator) {
  if (definitionOrLocator !== null && definitionOrLocator !== undefined && Array.isArray(definitionOrLocator.locatorAliases)) {
    return definitionOrLocator.locatorAliases
  }
  return []
}

/**
 * 行定位解析：接受 descriptor（用其 sourceLocator）或裸 locator { rowId, path }。
 * 多命中/别名歧义 → ambiguous；缺行或缺叶 → missing；否则 ok。
 */
export function resolveSetting(document, definitionOrLocator, options = {}) {
  const locators = [locatorFor(definitionOrLocator)]
  if (options.aliases !== false) locators.push(...aliasesFor(definitionOrLocator))
  const candidates = []
  let sawAmbiguous = false
  for (const locator of locators) {
    const result = resolveLocator(document, locator)
    if (result.kind === 'ambiguous') sawAmbiguous = true
    if (result.kind === 'ok') candidates.push(result)
  }
  if (candidates.length === 0) return sawAmbiguous ? { kind: 'ambiguous' } : { kind: 'missing' }
  if (candidates.length > 1 || sawAmbiguous) return { kind: 'ambiguous', matches: candidates.length }
  return candidates[0]
}

export function validateSettingValue(definition, value) {
  return definition !== undefined && typeof definition.validator === 'function' && definition.validator(value)
}

export function normalizeSettingValue(definition, value) {
  return typeof definition.normalize === 'function' ? definition.normalize(value) : value
}

export function resolveTemplateSettingDefault(defaultText, key) {
  const definition = getSettingDefinition(key)
  if (definition === undefined) throw new Error('template default ' + String(key) + ': descriptor missing')
  let document
  try {
    document = parsePresetYaml(defaultText)
  } catch (error) {
    throw new Error('template default ' + key + ': YAML parse failed: ' + (error instanceof Error ? error.message : String(error)))
  }
  const result = resolveSetting(document, definition, { aliases: false })
  if (result.kind !== 'ok') throw new Error('template default ' + key + ': locator ' + result.kind)
  if (!validateSettingValue(definition, result.value)) {
    throw new Error('template default ' + key + ': value invalid (expected ' + definition.scalarType + ' positive integer)')
  }
  return normalizeSettingValue(definition, result.value)
}

/**
 * 源模板（资产）捕获（10 项）：逐项按 sourceLocator 解析 → {document, values, states}。
 * states 四态（captured/missing/ambiguous/invalid），仅 captured 进 values。
 */
export function captureSettings(text, definitions) {
  const document = parsePresetYaml(text)
  const list = definitions === undefined ? SETTING_DEFINITIONS : definitions
  const values = {}
  const states = {}
  for (const definition of list) {
    const result = resolveSetting(document, definition)
    if (result.kind === 'missing') states[definition.key] = 'missing'
    else if (result.kind === 'ambiguous') states[definition.key] = 'ambiguous'
    else if (!validateSettingValue(definition, result.value)) states[definition.key] = 'invalid'
    else {
      values[definition.key] = normalizeSettingValue(definition, result.value)
      states[definition.key] = 'captured'
    }
  }
  return { document, values, states }
}

/**
 * 权威值捕获（settings 行）：逐项按 rowLocator（行 id SETTINGS_ROW_ID + config.<key>）解析，
 * 形状与 captureSettings 同构。行缺失/多命中/叶缺失一律 missing/ambiguous → 消费端回退。
 * rowPresent 区分「settings 行缺席（不可判定，保守不改写现场）」与「行在但缺该项（可一次性回填）」。
 */
export function captureRowSettings(text, definitions) {
  const document = parsePresetYaml(text)
  const list = definitions === undefined ? EXTRA_PLAN_SETTING_DEFINITIONS : definitions
  const values = {}
  const states = {}
  for (const definition of list) {
    const result = resolveSetting(document, definition.rowLocator, { aliases: false })
    if (result.kind === 'missing') states[definition.key] = 'missing'
    else if (result.kind === 'ambiguous') states[definition.key] = 'ambiguous'
    else if (!validateSettingValue(definition, result.value)) states[definition.key] = 'invalid'
    else {
      values[definition.key] = normalizeSettingValue(definition, result.value)
      states[definition.key] = 'captured'
    }
  }
  return { document, values, states, rowPresent: rowsById(document, SETTINGS_ROW_ID).length > 0 }
}

/** 声明行 config.plugins 内按 id 定位子行（含 group 行的 config 子行数组，深度优先；找不到返回 null）。 */
export function findPluginsRow(plugins, rowId) {
  if (!Array.isArray(plugins)) return null
  for (const row of plugins) {
    if (row === null || typeof row !== 'object') continue
    if (row.id === rowId) return row
    if (Array.isArray(row.config)) {
      const nested = findPluginsRow(row.config, rowId)
      if (nested !== null) return nested
    }
  }
  return null
}

/**
 * 读声明行 plugins 内某项设置的**当前投影值**（按 projectionLocator 定位子行 + 叶键）。
 * 返回 undefined = 该投影缺失（子行缺失 / 叶缺失 / 值非法）——判定侧一律按出厂默认参与比较。
 * 只服务 2 项宿主行设置；权威值不走这里（见 captureRowSettings）。
 */
export function readProjectedValue(plugins, definition) {
  const locator = definition === null || definition === undefined ? undefined : definition.projectionLocator
  if (locator === undefined || locator === null) return undefined
  const row = findPluginsRow(plugins, locator.pluginsRowId)
  if (row === null) return undefined
  const read = readPath(row, locator.path)
  if (!read.exists || !validateSettingValue(definition, read.value)) return undefined
  return normalizeSettingValue(definition, read.value)
}

/** 声明行 config.plugins 深拷贝后整体重述：只改目标子行的指定 config 键（config 不深合并语义）。 */
export function restatePluginsRow(plugins, rowId, patch) {
  const next = structuredClone(plugins)
  const row = findPluginsRow(next, rowId)
  if (row === null) return null
  const base = row.config !== null && typeof row.config === 'object' && !Array.isArray(row.config) ? row.config : {}
  row.config = { ...base, ...structuredClone(patch) }
  return next
}

function inlineCommentIndex(value) {
  let quote = null
  for (let i = 0; i < value.length; i += 1) {
    const char = value[i]
    if (quote === "'") {
      if (char === "'" && value[i + 1] === "'") { i += 1; continue }
      if (char === "'") quote = null
      continue
    }
    if (quote === '"') {
      if (char === '\\') { i += 1; continue }
      if (char === '"') quote = null
      continue
    }
    if (char === "'" || char === '"') { quote = char; continue }
    if (char === '#' && (i === 0 || /\s/.test(value[i - 1]))) return i
  }
  return -1
}

function lineIndent(line) {
  const match = line.match(/^ */)
  return match === null ? 0 : match[0].length
}

function withoutCr(line) {
  return line.endsWith('\r') ? line.slice(0, -1) : line
}

function parseRowId(line) {
  const body = withoutCr(line)
  const match = body.match(/^( *)(?:-\s*)id\s*:\s*(.*)$/)
  if (match === null) return null
  const valuePart = match[2]
  const comment = inlineCommentIndex(valuePart)
  const token = (comment === -1 ? valuePart : valuePart.slice(0, comment)).trim()
  if (token.startsWith("'") && token.endsWith("'") && token.length >= 2) return token.slice(1, -1).replace(/''/g, "'")
  if (token.startsWith('"') && token.endsWith('"') && token.length >= 2) {
    try { return JSON.parse(token) } catch { return token.slice(1, -1) }
  }
  return token
}

function parseMapKey(line) {
  const body = withoutCr(line)
  const match = body.match(/^ *(?!-)([A-Za-z0-9_.-]+)\s*:/)
  return match === null ? null : { key: match[1], indent: lineIndent(body) }
}

function rowEnd(lines, start, indent) {
  for (let i = start + 1; i < lines.length; i += 1) {
    const body = withoutCr(lines[i])
    const trimmed = body.trim()
    if (trimmed === '' || trimmed.startsWith('#')) continue
    if (lineIndent(body) <= indent) return i
  }
  return lines.length
}

function findDirectKey(lines, start, end, parentIndent, key) {
  let childIndent = null
  for (let i = start; i < end; i += 1) {
    const body = withoutCr(lines[i])
    const trimmed = body.trim()
    if (trimmed === '' || trimmed.startsWith('#')) continue
    const indent = lineIndent(body)
    if (indent <= parentIndent) return null
    const parsed = parseMapKey(body)
    if (childIndent === null) {
      if (parsed === null) return null
      childIndent = parsed.indent
    }
    if (indent < childIndent) return null
    if (indent !== childIndent || parsed === null) continue
    if (parsed.key === key) return i
  }
  return null
}

function textPathLine(lines, rowStart, rowEndIndex, rowIndent, path) {
  let start = rowStart + 1
  let parentIndent = rowIndent
  const parts = pathParts(path)
  for (let p = 0; p < parts.length; p += 1) {
    const index = findDirectKey(lines, start, rowEndIndex, parentIndent, parts[p])
    if (index === null) return null
    if (p === parts.length - 1) return index
    start = index + 1
    parentIndent = lineIndent(withoutCr(lines[index]))
  }
  return null
}

export function findTextLocatorMatches(text, definitionOrLocator) {
  const locator = locatorFor(definitionOrLocator)
  const lines = String(text).split('\n')
  const matches = []
  for (let i = 0; i < lines.length; i += 1) {
    if (parseRowId(lines[i]) !== locator.rowId) continue
    const indent = lineIndent(withoutCr(lines[i]))
    const end = rowEnd(lines, i, indent)
    const line = textPathLine(lines, i, end, indent, locator.path)
    if (line !== null) matches.push({ rowStart: i, rowEnd: end, line })
  }
  return matches
}

function yamlString(value) {
  const text = String(value)
  if (text.includes('\n') || text.includes('\r')) return JSON.stringify(text)
  return "'" + text.replace(/'/g, "''") + "'"
}

export function serializeScalar(value, scalarType) {
  if (scalarType === 'boolean') return value ? 'true' : 'false'
  if (scalarType === 'integer') return String(value)
  return yamlString(value)
}

function escapeRegex(value) {
  return String(value).split('').map((char) => '\\^$*+?.()|{}[]'.includes(char) ? '\\' + char : char).join('')
}

function replaceLineScalar(line, key, serialized) {
  const body = withoutCr(line)
  const eol = line.endsWith('\r') ? '\r' : ''
  const keyMatch = body.match(new RegExp('^( *)(?!-)' + escapeRegex(key) + '\\s*:(.*)$'))
  if (keyMatch === null) return null
  const rest = keyMatch[2]
  const commentIndex = inlineCommentIndex(rest)
  const beforeComment = commentIndex === -1 ? rest : rest.slice(0, commentIndex)
  const comment = commentIndex === -1 ? '' : rest.slice(commentIndex)
  const leading = (beforeComment.match(/^\s*/) || [''])[0]
  const trailing = (beforeComment.match(/\s*$/) || [''])[0]
  return body.slice(0, body.length - rest.length) + leading + serialized + trailing + comment + eol
}

function isBlockScalarLine(line, key) {
  const body = withoutCr(line)
  const parsed = parseMapKey(body)
  if (parsed === null || parsed.key !== key) return false
  const colon = body.indexOf(':', parsed.indent + key.length)
  if (colon < 0) return false
  const rest = body.slice(colon + 1)
  const commentIndex = inlineCommentIndex(rest)
  const token = (commentIndex === -1 ? rest : rest.slice(0, commentIndex)).trim()
  return /^[|>]/.test(token)
}

function scalarTypeFor(definitionOrLocator) {
  if (definitionOrLocator !== null && definitionOrLocator !== undefined && definitionOrLocator.scalarType !== undefined) {
    return definitionOrLocator.scalarType
  }
  return 'string'
}

/**
 * 保格式定点改写 YAML 标量（按 sourceLocator 定位）。仅用于迁移期文本改写，
 * 纯字符串处理、不写文件；dsh 0.1.7-rc.1 的宿主写链一律走 configEditor.edit。
 */
export function patchYamlScalar(text, definitionOrLocator, value, options = {}) {
  const locator = locatorFor(definitionOrLocator)
  const scalarType = scalarTypeFor(definitionOrLocator)
  const matches = findTextLocatorMatches(text, locator)
  if (matches.length === 0) return { ok: false, reason: 'missing' }
  if (matches.length > 1 && options.first !== true) return { ok: false, reason: 'ambiguous', matches: matches.length }
  const selected = matches[0]
  const lines = String(text).split('\n')
  const parts = pathParts(locator.path)
  const key = parts[parts.length - 1]
  const targetIndent = lineIndent(withoutCr(lines[selected.line]))
  const blockScalar = isBlockScalarLine(lines[selected.line], key)
  const nextLine = replaceLineScalar(lines[selected.line], key, serializeScalar(value, scalarType))
  if (nextLine === null) return { ok: false, reason: 'missing' }
  lines[selected.line] = nextLine
  if (blockScalar) {
    let end = selected.line + 1
    while (end < lines.length) {
      const body = withoutCr(lines[end])
      const trimmed = body.trim()
      if (trimmed === '' || trimmed.startsWith('#') || lineIndent(body) > targetIndent) end += 1
      else break
    }
    lines.splice(selected.line + 1, end - selected.line - 1)
  }
  return { ok: true, text: lines.join('\n'), line: selected.line }
}
