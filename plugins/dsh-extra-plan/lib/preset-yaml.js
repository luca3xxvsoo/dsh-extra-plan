// YAML 解析、行定位、捕获和保格式文本 patch 纯职责。
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
import {
  EXTRA_PLAN_SETTING_DEFINITIONS,
  PROJECTION_SETTING_DEFINITIONS,
  SETTING_DEFINITIONS,
  SETTINGS_ROW_ID,
  getSettingDefinition,
  normalizeSettingValue,
  validateSettingValue,
} from './settings-contract.js'

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

/** 生效 plugins：profile override → Loader 行 config → 继承层。 */
export function effectivePluginsOf(row) {
  if (row === null || typeof row !== 'object') return undefined
  const override = row.override
  if (override !== null && typeof override === 'object' && Array.isArray(override.plugins)) return override.plugins
  const own = row.entry !== undefined && row.entry.options !== undefined ? row.entry.options.config : undefined
  if (own !== null && typeof own === 'object' && Array.isArray(own.plugins)) return own.plugins
  const inherited = row.inherited
  if (inherited !== null && typeof inherited === 'object' && Array.isArray(inherited.plugins)) return inherited.plugins
  return undefined
}

/** 出厂默认（2 项宿主行）：读模板 sourceLocator，缺项/解析失败回落内置。 */
export function hostRowDefaultsFromTemplate(templateText) {
  const fallback = { webFetch: false, toolPresentationMode: 'native' }
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
