// YAML 解析、行定位、捕获和保格式文本 patch 纯职责。
import { createHash } from 'node:crypto'
import { createRequire } from 'node:module'
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
import {
  DEFAULT_SETTINGS,
  EXTRA_PLAN_SETTING_DEFINITIONS,
  PROJECTION_SETTING_DEFINITIONS,
  SETTING_DEFINITIONS,
  SETTINGS_ROW_ID,
  getSettingDefinition,
  normalizeSettingValue,
  validateSettingValue,
} from './settings-contract.js'
import { validateGateWords } from './gate-words.js'

// 多文档作者源（agent.cordis.yml：第一文档=主预设，第二文档=4 角色）只取第一文档；
// 空流仍返回 undefined，单文档结果与 yaml.load 逐字一致。
export function parsePresetYaml(text) {
  const documents = yaml.loadAll(text, { schema: YAML_SCHEMA })
  return documents.length === 0 ? undefined : documents[0]
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

function collectRowsById(document, rowId) {
  const rows = []
  const seen = new Set()
  const visit = (value, path) => {
    if (value === null || typeof value !== 'object' || seen.has(value)) return
    seen.add(value)
    if (hasOwn(value, 'id') && value.id === rowId) rows.push({ row: value, path: [...path] })
    if (Array.isArray(value)) {
      for (let index = 0; index < value.length; index += 1) visit(value[index], [...path, index])
    } else {
      for (const [key, child] of Object.entries(value)) visit(child, [...path, key])
    }
  }
  visit(document, [])
  return rows
}

/** 深度优先返回指定 id 的行；仅返回行对象，兼容既有消费者。 */
export function rowsById(document, rowId) {
  return collectRowsById(document, rowId).map((item) => item.row)
}

/** 返回指定 id 的全部候选及 YAML 数据路径，供唯一行诊断/迁移使用。 */
export function rowsByIdWithPath(document, rowId) {
  return collectRowsById(document, rowId).map((item, index) => ({
    index,
    row: item.row,
    path: item.path,
    pathText: item.path.map((part) => String(part)).join('.'),
  }))
}

function resolveLocator(document, locator) {
  let rows = rowsById(document, locator.rowId)
  // 可选 rowName 精确过滤：settings 行落点从「id」收紧为「id + 规范 name」双条件，
  // 同 id 的旧行（如 name 为 @local/dsh-extra-plan/settings 的历史行）不再参与候选；
  // locator 无 rowName 时行为与收紧前逐字一致（源模板行、宿主行投影不受影响）。
  if (typeof locator.rowName === 'string') {
    rows = rows.filter((row) => row !== null && typeof row === 'object' && row.name === locator.rowName)
  }
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
 * 行定位解析：接受 descriptor（用其 sourceLocator）或裸 locator { rowId, rowName?, path }。
 * rowName 为字符串时先按 id 收集、再按 name 精确过滤（settings 行 = id + 规范 name）。
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

/** 出厂默认（2 项宿主行）：读模板 sourceLocator，缺项/解析失败回落内置。 */
export function hostRowDefaultsFromTemplate(templateText) {
  const fallback = { webFetch: DEFAULT_SETTINGS.webFetch, toolPresentationMode: DEFAULT_SETTINGS.toolPresentationMode }
  try {
    const captured = captureSettings(templateText)
    const out = {}
    for (const definition of PROJECTION_SETTING_DEFINITIONS) {
      const key = definition.key
      const hit = captured.states[key] === 'captured' && Object.prototype.hasOwnProperty.call(captured.values, key)
      out[key] = hit ? captured.values[key] : fallback[key]
    }
    return out
  } catch {
    return fallback
  }
}

/**
 * 权威值捕获（settings 行）：逐项按 rowLocator（行 id SETTINGS_ROW_ID + 规范 name
 * SETTINGS_ROW_NAME + config.<key>）解析，形状与 captureSettings 同构。
 * 只有旧别名行（name 非规范值）时行候选为空 → 一律 missing，不再读旧行的值。
 * 行缺失/多命中/叶缺失一律 missing/ambiguous → 消费端回退。
 * rowPresent（按行 id 计数，不判 name）区分「settings 行缺席（不可判定，保守不改写现场）」
 * 与「行在但缺该项（可一次性回填）」；装载期严格校验据此区分出厂形态与行不完整。
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

const CANONICAL_SETTINGS_NAME = 'dsh-extra-plan/settings'
function migrationEntryName(entry) {
  if (entry !== null && typeof entry === 'object' && entry.entry !== undefined && entry.entry.options !== undefined) return entry.entry.options.name
  return entry !== null && typeof entry === 'object' ? entry.name : undefined
}

function migrationEntryConfig(entry) {
  if (entry === null || typeof entry !== 'object') return undefined
  const inherited = entry.inherited !== null && typeof entry.inherited === 'object' ? entry.inherited : {}
  const own = entry.entry !== undefined && entry.entry.options !== undefined && entry.entry.options.config !== null && typeof entry.entry.options.config === 'object' ? entry.entry.options.config : entry.config
  const override = entry.override !== null && typeof entry.override === 'object' ? (entry.override.config !== undefined ? entry.override.config : entry.override) : {}
  return { ...inherited, ...(own !== null && typeof own === 'object' && !Array.isArray(own) ? own : {}), ...(override !== null && typeof override === 'object' && !Array.isArray(override) ? override : {}) }
}

function migrationManagedConfig(config) {
  if (config === null || typeof config !== 'object' || Array.isArray(config)) return undefined
  const values = {}
  for (const definition of SETTING_DEFINITIONS) {
    if (!hasOwn(config, definition.key) || !validateSettingValue(definition, config[definition.key])) return undefined
    values[definition.key] = normalizeSettingValue(definition, config[definition.key])
  }
  let gateWords
  try { gateWords = validateGateWords(config.gateWords) } catch { return undefined }
  return { values, gateWords }
}

function migrationComparable(config) {
  const checked = migrationManagedConfig(config)
  return checked === undefined ? undefined : { ...checked.values, gateWords: { ...checked.gateWords } }
}

function migrationHash(text) { return createHash('sha256').update(Buffer.from(text, 'utf8')).digest('hex') }
function migrationIgnorable(line) { const value = line.trim(); return value === '' || value.startsWith('#') }
function migrationIndent(line) { return (line.match(/^[ \t]*/) || [''])[0].length }

function migrationScalarToken(value) {
  const token = value.trim().replace(/\s+#.*$/, '').trim()
  if (token.startsWith('"') && token.endsWith('"')) { try { return JSON.parse(token) } catch { return token.slice(1, -1) } }
  if (token.startsWith("'") && token.endsWith("'")) return token.slice(1, -1).replace(/''/g, "'")
  return token
}

function migrationRowStarts(lines) {
  const starts = []
  for (let index = 0; index < lines.length; index += 1) {
    if (/^[ \t]*-\s*(?:id\s*:|override\s*:)/.test(lines[index])) starts.push(index)
  }
  return starts
}

function migrationRowId(lines, start, end) {
  for (let index = start; index < end; index += 1) {
    const match = lines[index].match(/^[ \t]*(?:-\s*)?id\s*:\s*(.*?)\s*(?:#.*)?$/)
    if (match !== null) return migrationScalarToken(match[1])
  }
  return undefined
}

/** 仅规划临时 fixture 的 canonical settings 行迁移，不写文件。 */
export function planCanonicalSettingsMigration(rawText, effectiveEntry) {
  if (typeof rawText !== 'string') return { status: 'failed', reason: 'raw-patch-not-readable' }
  if (migrationEntryName(effectiveEntry) !== CANONICAL_SETTINGS_NAME) return { status: 'conflict', reason: 'effective-entry-not-canonical' }
  const effective = migrationManagedConfig(migrationEntryConfig(effectiveEntry))
  if (effective === undefined) return { status: 'conflict', reason: 'effective-config-incomplete' }
  let document
  try { document = parsePresetYaml(rawText) } catch (error) { return { status: 'invalid', reason: 'invalid-yaml:' + String(error && error.message || error) } }
  const targets = rowsByIdWithPath(document, SETTINGS_ROW_ID)
  if (targets.length === 0) return { status: 'conflict', reason: 'settings-row-missing', rawRowCount: 0, canonicalNameCount: 0 }
  const canonicalIndexes = targets.map((item, index) => migrationEntryName(item.row) === CANONICAL_SETTINGS_NAME || item.row.name === CANONICAL_SETTINGS_NAME ? index : -1).filter((index) => index >= 0)
  if (canonicalIndexes.length !== 1) return { status: 'conflict', reason: 'canonical-name-ambiguous', rawRowCount: targets.length, canonicalNameCount: canonicalIndexes.length }
  const canonicalIndex = canonicalIndexes[0]
  const canonicalComparable = migrationComparable(targets[canonicalIndex].row.config !== undefined ? targets[canonicalIndex].row.config : targets[canonicalIndex].row.override?.config)
  if (canonicalComparable === undefined || JSON.stringify(canonicalComparable) !== JSON.stringify({ ...effective.values, gateWords: effective.gateWords })) return { status: 'conflict', reason: 'canonical-effective-mismatch', rawRowCount: targets.length, canonicalNameCount: 1 }
  const eol = rawText.includes('\r\n') ? '\r\n' : '\n'
  const trailing = rawText.endsWith('\n')
  const lines = rawText.split(/\r?\n/)
  if (trailing) lines.pop()
  const starts = migrationRowStarts(lines)
  const blocks = []
  for (let index = 0; index < starts.length; index += 1) {
    const start = starts[index]
    const nextStart = index + 1 < starts.length ? starts[index + 1] : lines.length
    let end = nextStart
    while (end > start + 1 && migrationIgnorable(lines[end - 1])) end -= 1
    blocks.push({ start, end, id: migrationRowId(lines, start, nextStart) })
  }
  const targetBlocks = blocks.filter((item) => item.id === SETTINGS_ROW_ID)
  if (targetBlocks.length !== targets.length) return { status: 'conflict', reason: 'text-row-boundary-unproven', rawRowCount: targets.length, textRowCount: targetBlocks.length, canonicalNameCount: 1 }
  const remove = []
  for (let index = 0; index < targets.length; index += 1) {
    if (index !== canonicalIndex) remove.push(targetBlocks[index])
  }
  const beforeBytes = Buffer.byteLength(rawText, 'utf8')
  const beforeSha256 = migrationHash(rawText)
  const nextLines = [...lines]
  for (const item of [...remove].sort((left, right) => right.start - left.start)) nextLines.splice(item.start, item.end - item.start)
  const afterText = nextLines.join(eol) + (trailing ? eol : '')
  let afterDocument
  try { afterDocument = parsePresetYaml(afterText) } catch (error) { return { status: 'invalid', reason: 'after-parse-failed:' + String(error && error.message || error) } }
  const afterRows = rowsByIdWithPath(afterDocument, SETTINGS_ROW_ID)
  const afterCanonicalNameCount = afterRows.filter((item) => item.row.name === CANONICAL_SETTINGS_NAME).length
  const afterConfig = afterRows.length === 1 ? migrationComparable(afterRows[0].row.config !== undefined ? afterRows[0].row.config : afterRows[0].row.override?.config) : undefined
  if (afterRows.length !== 1 || afterCanonicalNameCount !== 1 || afterConfig === undefined || JSON.stringify(afterConfig) !== JSON.stringify({ ...effective.values, gateWords: effective.gateWords })) return { status: 'conflict', reason: 'after-unique-check-failed', beforeBytes, beforeSha256, rawRowCount: targets.length, canonicalNameCount: 1 }
  const afterBytes = Buffer.byteLength(afterText, 'utf8')
  const afterSha256 = migrationHash(afterText)
  return {
    status: remove.length === 0 ? 'idempotent' : 'planned',
    rawRowCount: targets.length,
    canonicalNameCount: 1,
    afterRawCount: afterRows.length,
    afterCanonicalNameCount,
    removedRows: remove.length,
    beforeBytes,
    beforeSha256,
    afterBytes,
    afterSha256,
    rollbackBytes: beforeBytes,
    rollbackSha256: beforeSha256,
    rollback: { bytes: beforeBytes, sha256: beforeSha256, text: rawText },
    beforeText: rawText,
    afterText,
  }
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
export function readProjectedValue(target, definition) {
  if (definition === null || definition === undefined) return undefined
  // 新公开 preset-sync 行直接读取 config.<key>；旧 preset-extra-plan body
  // 仍按 legacyProjectionLocator 读取，仅用于非破坏迁移和 carry。
  const locator = Array.isArray(target) && definition.legacyProjectionLocator !== undefined
    ? definition.legacyProjectionLocator
    : definition.projectionLocator
  if (locator === undefined || locator === null) return undefined
  if (locator.pluginsRowId !== undefined) {
    const row = findPluginsRow(target, locator.pluginsRowId)
    if (row === null) return undefined
    const read = readPath(row, locator.path)
    if (!read.exists || !validateSettingValue(definition, read.value)) return undefined
    return normalizeSettingValue(definition, read.value)
  }
  const path = locator.path.startsWith('config.') ? locator.path.slice('config.'.length) : locator.path
  const read = readPath(target, path)
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
 * 纯字符串处理、不写文件；宿主写链一律走 configEditor.edit。
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
