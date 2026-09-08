// Shared settings descriptors, YAML parsing, and format-preserving scalar patches.
// The descriptor list is the only source of truth for settings-page fields.

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

const isNonEmptyString = (value) => typeof value === 'string' && value.trim() !== ''
const isString = (value) => typeof value === 'string'
const isPositiveInteger = (value) => typeof value === 'number' && Number.isInteger(value) && value > 0
const isBoolean = (value) => typeof value === 'boolean'
const modeOptions = Object.freeze(['native', 'ptc', 'both'])
const isMode = (value) => typeof value === 'string' && modeOptions.includes(value)

const setting = (definition) => Object.freeze({
  ...definition,
  type: definition.scalarType,
  locator: Object.freeze({ pluginId: definition.pluginId, path: definition.path }),
  locatorAliases: Object.freeze((definition.locatorAliases || []).map((alias) => Object.freeze({
    pluginId: alias.pluginId,
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

export const SETTING_DEFINITIONS = Object.freeze([
  setting({
    key: 'plannerModel', pluginId: 'extra-plan', path: 'config.plannerModel', scalarType: 'string',
    validator: isNonEmptyString, normalize: (value) => value.trim(),
    ui: { control: 'text', locale: 'plannerModel' }, locatorAliases: [],
  }),
  setting({
    key: 'plannerPromptSuffix', pluginId: 'extra-plan', path: 'config.plannerPromptSuffix', scalarType: 'string',
    validator: isString, ui: { control: 'textarea', locale: 'plannerPromptSuffix' }, locatorAliases: [],
  }),
  setting({
    key: 'exploreBudget', pluginId: 'extra-plan', path: 'config.exploreBudget', scalarType: 'integer',
    validator: isPositiveInteger, ui: { control: 'number', min: 1, step: 1, locale: 'exploreBudget' }, locatorAliases: [],
  }),
  setting({
    key: 'anchoredBootstrap', pluginId: 'extra-plan', path: 'config.anchoredBootstrap', scalarType: 'boolean',
    validator: isBoolean, ui: { control: 'select', options: [true, false], locale: 'anchoredBootstrap' }, locatorAliases: [],
  }),
  setting({
    key: 'runcodeCatchGate', pluginId: 'extra-plan', path: 'config.runcodeCatchGate', scalarType: 'boolean',
    validator: isBoolean, ui: { control: 'select', options: [true, false], locale: 'runcodeCatchGate' }, locatorAliases: [],
  }),
  setting({
    key: 'webFetch', pluginId: 'tool-web', path: 'config.fetch', scalarType: 'boolean',
    validator: isBoolean, ui: { control: 'select', options: [true, false], locale: 'webFetch' }, locatorAliases: [],
  }),
  setting({
    key: 'toolPresentationMode', pluginId: 'tool-presentation', path: 'config.mode', scalarType: 'mode',
    validator: isMode,
    ui: {
      control: 'select', options: modeOptions,
      optionLocale: { native: 'toolPresentationModeNative', ptc: 'toolPresentationModePtc', both: 'toolPresentationModeBoth' },
      locale: 'toolPresentationMode',
    },
    locatorAliases: [],
  }),
])

export const PRESET_SETTINGS = SETTING_DEFINITIONS
export const SETTINGS_DESCRIPTORS = SETTING_DEFINITIONS
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

function rowsById(document, pluginId) {
  const rows = []
  const seen = new Set()
  const visit = (value) => {
    if (value === null || typeof value !== 'object' || seen.has(value)) return
    seen.add(value)
    if (hasOwn(value, 'id') && value.id === pluginId) rows.push(value)
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
  const rows = rowsById(document, locator.pluginId)
  if (rows.length === 0) return { kind: 'missing', locator }
  if (rows.length > 1) return { kind: 'ambiguous', locator, matches: rows.length }
  const value = readPath(rows[0], locator.path)
  if (!value.exists) return { kind: 'missing', locator }
  return { kind: 'ok', locator, row: rows[0], value: value.value }
}

export function resolveSetting(document, definition, options = {}) {
  const locators = [definition.locator]
  if (options.aliases !== false) locators.push(...definition.locatorAliases)
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

export function captureSettings(text) {
  const document = parsePresetYaml(text)
  const values = {}
  const states = {}
  for (const definition of SETTING_DEFINITIONS) {
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

export const readManagedSettings = captureSettings

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

export function findTextLocatorMatches(text, locator) {
  const lines = String(text).split('\n')
  const matches = []
  for (let i = 0; i < lines.length; i += 1) {
    if (parseRowId(lines[i]) !== locator.pluginId) continue
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

function locatorFor(definitionOrLocator) {
  if (definitionOrLocator !== null && definitionOrLocator.locator !== undefined) return definitionOrLocator.locator
  return definitionOrLocator
}

function scalarTypeFor(definitionOrLocator) {
  if (definitionOrLocator !== null && definitionOrLocator.scalarType !== undefined) return definitionOrLocator.scalarType
  return 'string'
}

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

export const patchFirstYamlScalar = (text, definitionOrLocator, value) => patchYamlScalar(text, definitionOrLocator, value, { first: true })

export function publicSettingMetadata(defaultText, actualText = defaultText) {
  const defaultDocument = parsePresetYaml(defaultText)
  const actualDocument = parsePresetYaml(actualText)
  const fields = []
  const values = {}
  const defaults = {}
  for (const definition of SETTING_DEFINITIONS) {
    const defaultResult = resolveSetting(defaultDocument, definition, { aliases: false })
    const actualResult = resolveSetting(actualDocument, definition, { aliases: false })
    const defaultValue = defaultResult.kind === 'ok' && validateSettingValue(definition, defaultResult.value)
      ? normalizeSettingValue(definition, defaultResult.value) : undefined
    const actualValue = actualResult.kind === 'ok' && validateSettingValue(definition, actualResult.value)
      ? normalizeSettingValue(definition, actualResult.value) : defaultValue
    const ui = definition.ui
    const publicUi = {
      control: ui.control,
      locale: ui.locale,
      ...(ui.min === undefined ? {} : { min: ui.min }),
      ...(ui.step === undefined ? {} : { step: ui.step }),
      ...(ui.options === undefined ? {} : { options: [...ui.options] }),
      ...(ui.optionLocale === undefined ? {} : { optionLocale: { ...ui.optionLocale } }),
      ...(ui.separate === undefined ? {} : { separate: ui.separate }),
    }
    const field = {
      key: definition.key, pluginId: definition.pluginId, path: definition.path,
      type: definition.scalarType, ui: publicUi, ...publicUi,
      ...(defaultValue === undefined ? {} : { default: defaultValue }),
      ...(actualValue === undefined ? {} : { value: actualValue }),
    }
    fields.push(field)
    if (actualValue !== undefined) values[definition.key] = actualValue
    if (defaultValue !== undefined) defaults[definition.key] = defaultValue
  }
  return { fields, values, defaults }
}

export function settingsFileValues(text) {
  const document = parsePresetYaml(text)
  const values = {}
  for (const definition of SETTING_DEFINITIONS) {
    const result = resolveSetting(document, definition, { aliases: false })
    if (result.kind === 'ok' && validateSettingValue(definition, result.value)) {
      values[definition.key] = normalizeSettingValue(definition, result.value)
    }
  }
  return values
}

export function yamlFileExists(file) {
  return existsSync(file)
}

export function readYamlFile(file) {
  return readFileSync(file, 'utf8')
}
