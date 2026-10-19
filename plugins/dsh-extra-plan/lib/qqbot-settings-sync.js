// Web configEditor → QQBot profile settings mirror.
// This module proves the profile root first, scans only direct children, and rewrites one YAML block locally.
import { createRequire } from 'node:module'
import { createHash, randomUUID } from 'node:crypto'
import {
  accessSync,
  closeSync,
  constants,
  copyFileSync,
  existsSync,
  fsyncSync,
  openSync,
  readFileSync,
  readdirSync,
  renameSync,
  statSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs'
import { basename, dirname, isAbsolute, join, resolve } from 'node:path'
import { isDeepStrictEqual } from 'node:util'
import { SETTING_DEFINITIONS, SETTINGS_ROW_NAME } from './preset-settings.js'
import { GATE_WORD_FIELDS, validateGateWords } from './gate-words.js'

const SETTINGS_ROW_ID = 'dsh-extra-plan-settings'
const QQBOT_BUNDLE = '@tencent-connect/dsh-qqbot'
const OWN_PACKAGE = 'dsh-extra-plan-qqbot'
const MANAGED_KEYS = Object.freeze(SETTING_DEFINITIONS.map((item) => item.key))
const MANAGED_KEY_SET = new Set(MANAGED_KEYS)
const GATE_KEYS = Object.freeze(GATE_WORD_FIELDS.map((item) => item.field))
const PATCH_KEYS = Object.freeze([...MANAGED_KEYS, 'gateWords'])
const localRequire = createRequire(import.meta.url)
let yamlModule
let yamlSchema
let yamlLoadError
let tempSequence = 0

function plainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function errorText(error) {
  return error instanceof Error ? error.message : String(error)
}

function loadYaml() {
  if (yamlModule !== undefined) return yamlModule
  if (yamlLoadError !== undefined) throw yamlLoadError
  try {
    yamlModule = localRequire('js-yaml')
    const JsScalar = new yamlModule.Type('tag:yaml.org,2002:js', {
      kind: 'scalar',
      resolve: (data) => typeof data === 'string',
      construct: (data) => ({ __jsExpr: data }),
      predicate: (data) => plainObject(data) && typeof data.__jsExpr === 'string',
      represent: (data) => data.__jsExpr,
    })
    yamlSchema = yamlModule.JSON_SCHEMA.extend(JsScalar)
    return yamlModule
  } catch (error) {
    yamlLoadError = error instanceof Error ? error : new Error(String(error))
    throw yamlLoadError
  }
}

function parseYaml(text) {
  const yaml = loadYaml()
  return yaml.load(text, { schema: yamlSchema })
}

function readableDirectory(path) {
  try {
    if (!statSync(path).isDirectory()) return false
    accessSync(path, constants.R_OK | constants.X_OK)
    readdirSync(path)
    return true
  } catch {
    return false
  }
}

function unavailable(reason, extra = {}) {
  return { status: 'unavailable', reason, ...extra }
}

function documentPathValue(value) {
  return typeof value === 'string' ? value.trim() : ''
}

function rootFromDocumentPath(value) {
  const trimmed = documentPathValue(value)
  if (trimmed === '') return { kind: 'missing' }
  if (!isAbsolute(trimmed)) return { kind: 'invalid', reason: 'invalid-document-path' }
  const normalized = resolve(trimmed)
  if (basename(normalized).toLowerCase() !== 'cordis.patch.yml' ||
      basename(dirname(normalized)).toLowerCase() !== 'web' ||
      basename(dirname(dirname(normalized))).toLowerCase() !== 'profiles') {
    return { kind: 'invalid', reason: 'invalid-document-path' }
  }
  return { kind: 'valid', path: normalized, root: dirname(dirname(normalized)) }
}

function environmentValue(env, key) {
  return env !== null && typeof env === 'object' && typeof env[key] === 'string' ? env[key].trim() : ''
}

/** Resolve the only two allowed sources of a profiles root. */
export function resolveProfilesRoot(documentPath, env = process.env) {
  if (documentPath !== null && typeof documentPath === 'object' && !Array.isArray(documentPath)) {
    const input = documentPath
    env = input.env === undefined ? env : input.env
    documentPath = input.documentPath
  }
  const document = rootFromDocumentPath(documentPath)
  if (document.kind === 'invalid') return unavailable(document.reason, { pathSource: 'configEditor.documentPath' })
  if (document.kind === 'valid') {
    if (!readableDirectory(document.root)) return unavailable('profiles-root-unavailable', { pathSource: 'configEditor.documentPath', profilesRoot: document.root })
    return { status: 'available', profilesRoot: document.root, pathSource: 'configEditor.documentPath' }
  }
  const dshHome = environmentValue(env, 'DSH_HOME')
  const profile = environmentValue(env, 'DSH_PROFILE')
  if (dshHome === '' || !isAbsolute(dshHome) || profile !== 'web') {
    return unavailable('document-path-unavailable', { pathSource: 'explicit-DSH_HOME', fallbackReason: 'document-path-unavailable' })
  }
  const root = resolve(dshHome, 'profiles')
  if (!readableDirectory(root)) return unavailable('profiles-root-unavailable', { pathSource: 'explicit-DSH_HOME', fallbackReason: 'document-path-unavailable', profilesRoot: root })
  return { status: 'available', profilesRoot: root, pathSource: 'explicit-DSH_HOME', fallbackReason: 'document-path-unavailable' }
}

function sortedNames(names) {
  return [...names].sort((left, right) => left < right ? -1 : left > right ? 1 : 0)
}

function scanOwnQqbotProfiles(profilesRoot) {
  const diagnostics = []
  let names
  try {
    if (!statSync(profilesRoot).isDirectory()) return { status: 'unavailable', profiles: [], diagnostics: [{ reason: 'profiles-root-not-directory' }] }
    names = sortedNames(readdirSync(profilesRoot))
  } catch (error) {
    return { status: 'unavailable', profiles: [], diagnostics: [{ reason: 'profiles-root-read-failed', detail: errorText(error) }] }
  }
  const profiles = []
  for (const name of names) {
    const profileDir = join(profilesRoot, name)
    try {
      if (!statSync(profileDir).isDirectory()) {
        diagnostics.push({ profile: name, reason: 'not-directory' })
        continue
      }
      const packageFile = join(profileDir, 'package.json')
      const packageText = readFileSync(packageFile, 'utf8')
      const pkg = JSON.parse(packageText)
      const bundles = pkg !== null && typeof pkg === 'object' && pkg.dsh !== null && typeof pkg.dsh === 'object' &&
        pkg.dsh.profile !== null && typeof pkg.dsh.profile === 'object' && Array.isArray(pkg.dsh.profile.bundles)
        ? pkg.dsh.profile.bundles
        : []
      if (!bundles.includes(QQBOT_BUNDLE)) {
        diagnostics.push({ profile: name, reason: 'bundle-anchor-missing' })
        continue
      }
      const ownDir = join(profileDir, 'node_modules', OWN_PACKAGE)
      if (!existsSync(ownDir)) {
        diagnostics.push({ profile: name, reason: 'plugin-anchor-missing' })
        continue
      }
      profiles.push(name)
    } catch (error) {
      diagnostics.push({ profile: name, reason: 'profile-read-failed', detail: errorText(error) })
    }
  }
  return { status: profiles.length === 0 ? 'not-installed' : 'installed', profiles, diagnostics }
}

/** Return names for compatibility with the heal.js helper; diagnostics are attached, not hidden. */
export function findOwnQqbotProfiles(profilesRoot) {
  const result = scanOwnQqbotProfiles(profilesRoot)
  Object.defineProperties(result.profiles, {
    diagnostics: { value: result.diagnostics, enumerable: false },
    status: { value: result.status, enumerable: false },
  })
  return result.profiles
}

function snapshotValues(snapshot) {
  if (!plainObject(snapshot)) throw new Error('invalid-source-snapshot')
  if (plainObject(snapshot.values)) return snapshot.values
  const values = {}
  for (const key of MANAGED_KEYS) if (Object.prototype.hasOwnProperty.call(snapshot, key)) values[key] = snapshot[key]
  return values
}

function snapshotGateWords(snapshot) {
  if (Object.prototype.hasOwnProperty.call(snapshot, 'gateWords')) return snapshot.gateWords
  if (plainObject(snapshot.values) && Object.prototype.hasOwnProperty.call(snapshot.values, 'gateWords')) return snapshot.values.gateWords
  return undefined
}

/** Copy, normalize, validate and freeze the complete ten-value plus gateWords snapshot. */
export function validateSettingsSnapshot(snapshot) {
  if (!plainObject(snapshot)) throw new Error('invalid-source-snapshot')
  const values = snapshotValues(snapshot)
  const extra = Object.keys(values).filter((key) => !MANAGED_KEY_SET.has(key) && key !== 'gateWords')
  if (extra.length > 0) throw new Error('invalid-source-snapshot-extra-key:' + extra.join(','))
  const normalized = {}
  for (const definition of SETTING_DEFINITIONS) {
    if (!Object.prototype.hasOwnProperty.call(values, definition.key)) throw new Error('invalid-source-snapshot-missing:' + definition.key)
    const value = values[definition.key]
    if (typeof definition.validator !== 'function' || !definition.validator(value)) throw new Error('invalid-source-snapshot-type:' + definition.key)
    normalized[definition.key] = typeof definition.normalize === 'function' ? definition.normalize(value) : value
  }
  let gateWords
  try { gateWords = validateGateWords(snapshotGateWords(snapshot)) } catch (error) { throw new Error('invalid-source-snapshot-gateWords:' + errorText(error)) }
  return Object.freeze({ values: Object.freeze(normalized), gateWords })
}

function expectedManaged(snapshot) {
  const checked = snapshot.values !== undefined ? snapshot : validateSettingsSnapshot(snapshot)
  return { ...checked.values, gateWords: checked.gateWords }
}

function canonicalSnapshot(checked) {
  return {
    values: Object.fromEntries(MANAGED_KEYS.map((key) => [key, checked.values[key]])),
    gateWords: Object.fromEntries(GATE_KEYS.map((key) => [key, checked.gateWords[key]])),
  }
}

/** 固定 10 项 values + 7 项 gateWords 的规范快照哈希。 */
export function stableSnapshotHash(snapshot) {
  const checked = validateSettingsSnapshot(snapshot)
  return createHash('sha256').update(JSON.stringify(canonicalSnapshot(checked))).digest('hex')
}

function managedSnapshotHashFromConfig(config) {
  if (!plainObject(config) || !MANAGED_KEYS.every((key) => Object.prototype.hasOwnProperty.call(config, key))) return null
  let gateWords
  try { gateWords = validateGateWords(config.gateWords) } catch { return null }
  const values = Object.fromEntries(MANAGED_KEYS.map((key) => [key, config[key]]))
  try { return stableSnapshotHash({ values, gateWords }) } catch { return null }
}

function patchDiagnostic(path, backupFile) {
  const result = {
    patchPath: typeof path === 'string' ? path : null,
    patchBytes: null,
    patchMtimeMs: null,
    patchSha256: null,
    managedSnapshotHash: null,
    backupPath: backupFile === undefined ? null : backupFile,
    backupSha256: null,
  }
  if (typeof path === 'string' && path !== '') {
    try {
      const bytes = readFileSync(path)
      const stat = statSync(path)
      const text = bytes.toString('utf8')
      const parsed = parseYaml(text)
      const target = parsedTarget(parsed)
      const config = target.kind === 'ok' && target.hit !== undefined ? configHolder(target.hit.row, target.hit.kind).config : undefined
      result.patchBytes = bytes.length
      result.patchMtimeMs = stat.mtimeMs
      result.patchSha256 = createHash('sha256').update(bytes).digest('hex')
      result.managedSnapshotHash = managedSnapshotHashFromConfig(config)
    } catch { /* missing/invalid patch is represented by null metadata */ }
  }
  if (typeof backupFile === 'string' && backupFile !== '') {
    try { result.backupSha256 = createHash('sha256').update(readFileSync(backupFile)).digest('hex') } catch { /* backup is absent for idempotent/failed writes */ }
  }
  return result
}

function strictAssociation(input) {
  return input !== null && typeof input === 'object' && input.associated === true && typeof input.saveRunId === 'string' && input.saveRunId !== ''
}

function splitText(text) {
  const eol = text.includes('\r\n') ? '\r\n' : '\n'
  const trailing = text.endsWith('\n')
  const lines = text.split(/\r?\n/)
  if (trailing) lines.pop()
  return { eol, trailing, lines }
}

function joinText(parts) {
  const text = parts.lines.join(parts.eol)
  return parts.trailing ? text + parts.eol : text
}

function indentOf(line) {
  return (line.match(/^[ \t]*/) || [''])[0].length
}

function ignorable(line) {
  const text = line.trim()
  return text === '' || text.startsWith('#')
}

function rootSequenceInfo(lines) {
  let rootIndent = null
  for (const line of lines) {
    if (ignorable(line)) continue
    const trimmed = line.trim()
    if (trimmed === '---' || trimmed === '...') continue
    const match = /^([ \t]*)-\s*/.exec(line)
    if (match === null) return { rootIndent: null, starts: [] }
    rootIndent = match[1].length
    break
  }
  if (rootIndent === null) return { rootIndent: null, starts: [] }
  const starts = []
  for (let i = 0; i < lines.length; i += 1) {
    const match = /^([ \t]*)-\s*/.exec(lines[i])
    if (match !== null && match[1].length === rootIndent) starts.push(i)
  }
  return { rootIndent, starts }
}

function keyMatch(line) {
  const match = /^([ \t]*)([A-Za-z0-9_$-]+)\s*:(.*)$/.exec(line)
  return match === null ? null : { indent: match[1].length, key: match[2], rest: match[3] }
}

function targetKind(row) {
  const direct = row !== null && typeof row === 'object' && !Array.isArray(row) && row.id === SETTINGS_ROW_ID
  const override = plainObject(row && row.override) && row.override.id === SETTINGS_ROW_ID
  if (direct && override) return 'ambiguous'
  if (direct) return 'direct'
  if (override) return 'override'
  return null
}

function configHolder(row, kind) {
  return kind === 'override' ? row.override : row
}

function locateConfigLine(lines, start, end, rootIndent, kind) {
  const expected = kind === 'override' ? rootIndent + 4 : rootIndent + 2
  const candidates = []
  for (let i = start; i < end; i += 1) {
    const parsed = keyMatch(lines[i])
    if (parsed !== null && parsed.key === 'config' && parsed.indent > rootIndent) candidates.push({ index: i, ...parsed })
  }
  const exact = candidates.filter((item) => item.indent === expected)
  if (exact.length === 1) return exact[0]
  if (exact.length > 1) return { conflict: 'duplicate-config' }
  if (candidates.length === 1) return candidates[0]
  if (candidates.length > 1) return { conflict: 'ambiguous-config' }
  return null
}

function blockEndForChild(lines, start, end, keyIndent) {
  for (let i = start; i < end; i += 1) {
    if (ignorable(lines[i])) continue
    if (indentOf(lines[i]) <= keyIndent) return i
  }
  return end
}

function directKeyLines(lines, start, end, childIndent, key) {
  const out = []
  for (let i = start; i < end; i += 1) {
    const parsed = keyMatch(lines[i])
    if (parsed !== null && parsed.indent === childIndent && parsed.key === key) out.push({ index: i, ...parsed })
  }
  return out
}

function configChildIndent(lines, start, end, configIndent) {
  let smallest = null
  for (let i = start; i < end; i += 1) {
    if (ignorable(lines[i])) continue
    const indent = indentOf(lines[i])
    if (indent <= configIndent) continue
    const parsed = keyMatch(lines[i])
    if (parsed !== null && (smallest === null || indent < smallest)) smallest = indent
  }
  return smallest === null ? configIndent + 2 : smallest
}

function scalar(value) {
  if (typeof value === 'boolean') return value ? 'true' : 'false'
  if (typeof value === 'number') return String(value)
  return JSON.stringify(value)
}

function renderedConfig(snapshot, configIndent) {
  const childIndent = ' '.repeat(configIndent + 2)
  const gateIndent = ' '.repeat(configIndent + 4)
  const lines = []
  for (const definition of SETTING_DEFINITIONS) {
    const key = definition.key
    if (key === 'gateWords') continue
    lines.push(childIndent + key + ': ' + scalar(snapshot.values[key]))
  }
  lines.push(childIndent + 'gateWords:')
  for (const key of GATE_KEYS) lines.push(gateIndent + key + ': ' + scalar(snapshot.gateWords[key]))
  return lines
}

// 0.2.1 patch 方言：新写入一律用「- id: <设置行 id> + 全量 config」的朴素行，不再写 override 包装键。
function renderedRow(snapshot, rootIndent) {
  const spaces = (value) => ' '.repeat(value)
  const lines = [
    spaces(rootIndent) + '- id: ' + SETTINGS_ROW_ID,
    spaces(rootIndent + 2) + 'name: ' + SETTINGS_ROW_NAME,
    spaces(rootIndent + 2) + 'config:',
  ]
  lines.push(...renderedConfig(snapshot, rootIndent + 2))
  return lines
}

function parsedTarget(parsed) {
  if (!Array.isArray(parsed)) return { kind: 'invalid', reason: 'top-level-not-array' }
  const hits = []
  for (let i = 0; i < parsed.length; i += 1) {
    const kind = targetKind(parsed[i])
    if (kind !== null) hits.push({ index: i, kind, row: parsed[i] })
  }
  if (hits.some((item) => item.kind === 'ambiguous') || hits.length > 1) return { kind: 'conflict', reason: 'duplicate-settings-row', hits }
  return { kind: 'ok', hit: hits[0] }
}

function configState(row, kind, blockLines, blockStart, blockEnd, rootIndent) {
  const holder = configHolder(row, kind)
  const line = locateConfigLine(blockLines, 0, blockLines.length, rootIndent, kind)
  if (line !== null && line.conflict !== undefined) return { kind: 'conflict', reason: line.conflict }
  if (!Object.prototype.hasOwnProperty.call(holder, 'config')) return { kind: 'missing', line }
  const rest = line === null ? '' : line.rest.trim()
  if (line !== null && rest !== '' && !rest.startsWith('#')) {
    if (!plainObject(holder.config)) return { kind: 'invalid', reason: 'config-not-map' }
  }
  if (holder.config === null || holder.config === undefined) return { kind: 'missing', line }
  if (!plainObject(holder.config)) return { kind: 'invalid', reason: 'config-not-map' }
  if (line === null) return { kind: 'conflict', reason: 'config-boundary-unproven' }
  if (rest !== '' && !rest.startsWith('#')) return { kind: 'conflict', reason: 'inline-config-boundary-unproven' }
  const configIndent = line.indent
  const end = blockEndForChild(blockLines, line.index + 1, blockLines.length, configIndent)
  const childIndent = configChildIndent(blockLines, line.index + 1, end, configIndent)
  return { kind: 'map', line, end, configIndent, childIndent }
}

function managedProjection(config) {
  const out = {}
  for (const key of MANAGED_KEYS) if (Object.prototype.hasOwnProperty.call(config, key)) out[key] = config[key]
  return out
}

function equalManaged(config, expected) {
  if (!plainObject(config)) return false
  if (!MANAGED_KEYS.every((key) => Object.prototype.hasOwnProperty.call(config, key))) return false
  try {
    const gate = validateGateWords(config.gateWords)
    return isDeepStrictEqual({ ...managedProjection(config), gateWords: gate }, expected)
  } catch {
    return false
  }
}

function reparseAndCheck(text, expected) {
  let parsed
  try { parsed = parseYaml(text) } catch (error) { return { ok: false, reason: 'verify-parse-failed:' + errorText(error) } }
  const target = parsedTarget(parsed)
  if (target.kind !== 'ok' || target.hit === undefined) return { ok: false, reason: target.reason || 'verify-settings-row-missing' }
  const holder = configHolder(target.hit.row, target.hit.kind)
  if (holder.name !== SETTINGS_ROW_NAME) return { ok: false, reason: 'verify-settings-name-mismatch' }
  if (!plainObject(holder.config) || !equalManaged(holder.config, expected)) return { ok: false, reason: 'verify-settings-mismatch' }
  return { ok: true, parsed }
}

function existingNameState(holder, blockLines, rootIndent, kind) {
  const expectedIndent = kind === 'override' ? rootIndent + 4 : rootIndent + 2
  const names = []
  for (let i = 0; i < blockLines.length; i += 1) {
    const parsed = keyMatch(blockLines[i])
    if (parsed !== null && parsed.indent === expectedIndent && parsed.key === 'name') names.push({ index: i, ...parsed })
  }
  if (names.length > 1) return { kind: 'conflict', reason: 'duplicate-name' }
  if (names.length === 0) {
    if (Object.prototype.hasOwnProperty.call(holder, 'name')) return { kind: 'conflict', reason: 'name-boundary-unproven' }
    return { kind: 'missing', line: null }
  }
  if (holder.name === SETTINGS_ROW_NAME) return { kind: 'canonical', line: names[0] }
  if (holder.name === null || holder.name === undefined || (typeof holder.name === 'string' && holder.name.trim() === '')) {
    return { kind: 'missing', line: names[0] }
  }
  return { kind: 'conflict', reason: 'settings-row-name-conflict' }
}

function applyExistingTarget(parts, block, hit, snapshot, rootIndent) {
  const blockLines = parts.lines.slice(block.start, block.end)
  const state = configState(hit.row, hit.kind, blockLines, block.start, block.end, rootIndent)
  if (state.kind === 'conflict' || state.kind === 'invalid') return { status: state.kind, reason: state.reason }
  const holder = configHolder(hit.row, hit.kind)
  const nameState = existingNameState(holder, blockLines, rootIndent, hit.kind)
  if (nameState.kind === 'conflict') return { status: 'conflict', reason: nameState.reason }
  const expected = expectedManaged(snapshot)
  if (state.kind === 'map' && nameState.kind === 'canonical' && equalManaged(holder.config, expected)) {
    return { status: 'idempotent', text: joinText(parts) }
  }
  const edits = []
  if (nameState.kind === 'missing') {
    const nameIndent = hit.kind === 'override' ? rootIndent + 4 : rootIndent + 2
    if (nameState.line !== null) {
      const comment = /\s+(#.*)$/.exec(nameState.line.rest)
      const suffix = comment === null ? '' : ' ' + comment[1]
      edits.push({ start: nameState.line.index, end: nameState.line.index + 1, lines: [' '.repeat(nameIndent) + 'name: ' + SETTINGS_ROW_NAME + suffix] })
    } else {
      const nameIndex = state.line === null ? blockLines.length : state.line.index
      edits.push({ start: nameIndex, end: nameIndex, lines: [' '.repeat(nameIndent) + 'name: ' + SETTINGS_ROW_NAME] })
    }
  }
  if (state.kind === 'missing') {
    const configIndent = state.line === null ? (hit.kind === 'override' ? rootIndent + 4 : rootIndent + 2) : state.line.indent
    const insert = []
    if (state.line === null) insert.push(' '.repeat(configIndent) + 'config:')
    insert.push(...renderedConfig(snapshot, configIndent))
    edits.push({ start: blockLines.length, end: blockLines.length, lines: insert })
  } else {
    for (const key of PATCH_KEYS) {
      const matches = directKeyLines(blockLines, state.line.index + 1, state.end, state.childIndent, key)
      if (matches.length > 1) return { status: 'conflict', reason: 'duplicate-config-key:' + key }
      if (matches.length === 1) {
        const match = matches[0]
        edits.push({ start: match.index, end: blockEndForChild(blockLines, match.index + 1, state.end, state.childIndent), lines: key === 'gateWords' ? (() => {
          const out = [' '.repeat(state.childIndent) + 'gateWords:']
          for (const gateKey of GATE_KEYS) out.push(' '.repeat(state.childIndent + 2) + gateKey + ': ' + scalar(snapshot.gateWords[gateKey]))
          return out
        })() : [' '.repeat(state.childIndent) + key + ': ' + scalar(snapshot.values[key])] })
      }
    }
    const missing = PATCH_KEYS.filter((key) => directKeyLines(blockLines, state.line.index + 1, state.end, state.childIndent, key).length === 0)
    if (missing.length > 0) {
      const add = []
      for (const key of missing) {
        if (key === 'gateWords') {
          add.push(' '.repeat(state.childIndent) + 'gateWords:')
          for (const gateKey of GATE_KEYS) add.push(' '.repeat(state.childIndent + 2) + gateKey + ': ' + scalar(snapshot.gateWords[gateKey]))
        } else add.push(' '.repeat(state.childIndent) + key + ': ' + scalar(snapshot.values[key]))
      }
      edits.push({ start: state.end, end: state.end, lines: add })
    }
  }
  edits.sort((left, right) => right.start - left.start)
  const nextBlock = [...blockLines]
  for (const edit of edits) nextBlock.splice(edit.start, edit.end - edit.start, ...edit.lines)
  const nextLines = [...parts.lines]
  nextLines.splice(block.start, block.end - block.start, ...nextBlock)
  const next = joinText({ ...parts, lines: nextLines })
  const verified = reparseAndCheck(next, expected)
  return verified.ok ? { status: 'planned', text: next } : { status: 'invalid', reason: verified.reason }
}

function appendTarget(parts, snapshot, rootIndent, parsed) {
  const row = renderedRow(snapshot, rootIndent)
  const emptyLineIndex = parts.lines.findIndex((line) => /^\s*\[\s*\]\s*$/.test(line))
  const nextLines = [...parts.lines]
  if (emptyLineIndex >= 0 && Array.isArray(parsed) && parsed.length === 0) nextLines.splice(emptyLineIndex, 1, ...row)
  else {
    while (nextLines.length > 0 && nextLines[nextLines.length - 1] === '') nextLines.pop()
    nextLines.push(...row)
  }
  const next = joinText({ ...parts, lines: nextLines })
  const verified = reparseAndCheck(next, expectedManaged(snapshot))
  return verified.ok ? { status: 'planned', text: next } : { status: 'invalid', reason: verified.reason }
}

function scalarTokenEquals(value, expected) {
  const token = value.trim().replace(/\s+#.*$/, '').trim()
  return token === expected || token === JSON.stringify(expected) || token === "'" + expected + "'"
}

function duplicateTargetNameText(text) {
  const parts = splitText(text)
  const root = rootSequenceInfo(parts.lines)
  if (root.rootIndent === null) return false
  for (let index = 0; index < root.starts.length; index += 1) {
    const start = root.starts[index]
    const end = index + 1 < root.starts.length ? root.starts[index + 1] : parts.lines.length
    const rowLine = parts.lines[start]
    const direct = /^([ \t]*)-\s+id\s*:(.*)$/.exec(rowLine)
    const emptyDash = /^([ \t]*)-\s*$/.exec(rowLine)
    const override = /^([ \t]*)-\s+override\s*:/.test(rowLine)
    let directTarget = direct !== null && direct[1].length === root.rootIndent && scalarTokenEquals(direct[2], SETTINGS_ROW_ID)
    let overrideTarget = false
    for (let lineIndex = start + 1; lineIndex < end; lineIndex += 1) {
      const parsed = keyMatch(parts.lines[lineIndex])
      if (override && parsed !== null && parsed.key === 'id' && parsed.indent === root.rootIndent + 4 && scalarTokenEquals(parsed.rest, SETTINGS_ROW_ID)) overrideTarget = true
      if (emptyDash !== null && parsed !== null && parsed.key === 'id' && parsed.indent === root.rootIndent + 2 && scalarTokenEquals(parsed.rest, SETTINGS_ROW_ID)) directTarget = true
    }
    const nameIndent = overrideTarget ? root.rootIndent + 4 : root.rootIndent + 2
    if (!directTarget && !overrideTarget) continue
    let count = 0
    for (let lineIndex = start; lineIndex < end; lineIndex += 1) {
      const parsed = keyMatch(parts.lines[lineIndex])
      if (parsed !== null && parsed.key === 'name' && parsed.indent === nameIndent) count += 1
    }
    if (count > 1) return true
  }
  return false
}

/** Plan a local textual patch; no filesystem mutation occurs here. */
export function planQqbotSettingsPatch(patchText, snapshot) {
  let checked
  try { checked = validateSettingsSnapshot(snapshot) } catch (error) { return { status: 'invalid', reason: errorText(error) } }
  if (typeof patchText !== 'string') return { status: 'failed', reason: 'patch-not-readable' }
  let parsed
  try { parsed = parseYaml(patchText) } catch (error) {
    if (duplicateTargetNameText(patchText)) return { status: 'conflict', reason: 'duplicate-name' }
    return { status: 'invalid', reason: 'invalid-yaml:' + errorText(error) }
  }
  const target = parsedTarget(parsed)
  if (target.kind !== 'ok') return { status: target.kind, reason: target.reason }
  const parts = splitText(patchText)
  const root = rootSequenceInfo(parts.lines)
  if (target.hit === undefined) {
    if (!Array.isArray(parsed)) return { status: 'invalid', reason: 'top-level-not-array' }
    if (parsed.length === 0 && root.rootIndent === null) {
      const rootIndent = 0
      return appendTarget(parts, checked, rootIndent, parsed)
    }
    if (root.rootIndent === null || root.starts.length !== parsed.length) return { status: 'conflict', reason: 'top-level-boundary-unproven' }
    return appendTarget(parts, checked, root.rootIndent, parsed)
  }
  if (root.rootIndent === null || root.starts.length !== parsed.length) return { status: 'conflict', reason: 'top-level-boundary-unproven' }
  const block = { start: root.starts[target.hit.index], end: target.hit.index + 1 < root.starts.length ? root.starts[target.hit.index + 1] : parts.lines.length }
  return applyExistingTarget(parts, block, target.hit, checked, root.rootIndent)
}

function writeExclusive(path, text) {
  const fd = openSync(path, 'wx')
  try {
    writeFileSync(fd, text, 'utf8')
    fsyncSync(fd)
  } finally {
    closeSync(fd)
  }
}

function nextFilePath(base, suffix, fsApi) {
  for (;;) {
    tempSequence += 1
    const candidate = base + suffix + Date.now() + '-' + process.pid + '-' + tempSequence + '-' + randomUUID()
    if (!fsApi.existsSync(candidate)) return candidate
  }
}

function hook(hooks, name, ...args) {
  if (hooks !== null && typeof hooks === 'object' && typeof hooks[name] === 'function') hooks[name](...args)
}

/** Safely commit one already anchored QQBot patch, with exclusive runtime backup and recovery. */
export function writeQqbotSettingsPatch(profileDir, snapshot, options = {}) {
  let checked
  try { checked = validateSettingsSnapshot(snapshot) } catch (error) { return { status: 'failed', reason: errorText(error) } }
  const patchFile = join(profileDir, 'cordis.patch.yml')
  const fsApi = options.fs !== undefined ? options.fs : {
    existsSync,
    readFileSync,
    copyFileSync,
    renameSync,
    unlinkSync,
  }
  const before = patchDiagnostic(patchFile, undefined)
  let original
  try {
    if (!fsApi.existsSync(patchFile)) return { ...before, status: 'failed', profile: profileDir, reason: 'patch-missing', before, after: before }
    original = fsApi.readFileSync(patchFile, 'utf8')
  } catch (error) {
    return { ...before, status: 'failed', profile: profileDir, reason: 'patch-read-failed:' + errorText(error), before, after: before }
  }
  const plan = planQqbotSettingsPatch(original, checked)
  if (plan.status === 'idempotent') {
    const after = patchDiagnostic(patchFile, undefined)
    return { ...after, status: 'idempotent', profile: profileDir, before, after, backup: null, backupPath: null, backupSha256: null }
  }
  if (plan.status !== 'planned') return { ...before, status: 'failed', profile: profileDir, reason: plan.reason || plan.status, before, after: before }
  const hooks = options.hooks || {}
  const tempFile = nextFilePath(patchFile, '.tmp-dsh-extra-plan-settings-', fsApi)
  let backupFile
  let backupVerified = false
  let tempCreated = false
  try {
    hook(hooks, 'beforeTempWrite', { patchFile, tempFile, original, next: plan.text })
    writeExclusive(tempFile, plan.text)
    tempCreated = true
    const tempText = fsApi.readFileSync(tempFile, 'utf8')
    if (tempText !== plan.text || reparseAndCheck(tempText, expectedManaged(checked)).ok !== true) throw new Error('temp-verify-failed')
    hook(hooks, 'beforeBackup', { patchFile, tempFile, original })
    backupFile = nextFilePath(patchFile, '.bak-dsh-extra-plan-settings-', fsApi)
    writeExclusive(backupFile, original)
    const backupText = fsApi.readFileSync(backupFile, 'utf8')
    if (backupText !== original) throw new Error('backup-verify-failed')
    backupVerified = true
    hook(hooks, 'beforeRename', { patchFile, tempFile, backupFile })
    fsApi.renameSync(tempFile, patchFile)
    tempCreated = false
    hook(hooks, 'beforeFinalVerify', { patchFile, backupFile })
    const landed = fsApi.readFileSync(patchFile, 'utf8')
    const verify = reparseAndCheck(landed, expectedManaged(checked))
    if (!verify.ok) throw new Error(verify.reason || 'final-verify-failed')
    const after = patchDiagnostic(patchFile, backupFile)
    return { ...after, status: 'applied', profile: profileDir, backup: backupFile, backupPath: backupFile, before, after }
  } catch (error) {
    let restored = true
    let externalDrift = false
    try {
      const currentText = fsApi.readFileSync(patchFile, 'utf8')
      externalDrift = currentText !== plan.text && currentText !== original
    } catch { /* patch disappearance is handled as ordinary recovery failure */ }
    if (backupFile !== undefined && backupVerified && !externalDrift) {
      try { fsApi.copyFileSync(backupFile, patchFile) } catch { restored = false }
    }
    if (tempCreated || fsApi.existsSync(tempFile)) {
      try { fsApi.unlinkSync(tempFile) } catch { /* cleanup best effort */ }
    }
    if (backupFile !== undefined && !backupVerified) {
      try { fsApi.unlinkSync(backupFile) } catch { /* cleanup best effort */ }
    }
    const after = patchDiagnostic(patchFile, backupFile)
    const failureStatus = externalDrift ? 'drift-detected' : restored ? 'failed' : 'fatal'
    const driftDiagnostic = externalDrift ? {
      failureOrder: ['before-final-verify', 'external-writer-drift', 'preserve-external-value'],
      diagnostic: {
        target: 'qqbot',
        stage: 'before-final-verify',
        reason: 'external-writer-drift',
        preserveExternalValue: true,
        before,
        after,
      },
    } : {}
    return { ...after, status: failureStatus, ...driftDiagnostic, profile: profileDir, reason: externalDrift ? 'external-writer-drift' : errorText(error), backup: backupFile, backupPath: backupFile, before, after }  } finally {
    try { if (fsApi.existsSync(tempFile)) fsApi.unlinkSync(tempFile) } catch { /* cleanup best effort */ }
  }
}

function fingerprint(root, source, snapshot) {
  return JSON.stringify({ root: root === undefined ? '' : root, source, values: snapshot.values, gateWords: snapshot.gateWords })
}

function resultForPath(pathInfo, status, extra = {}) {
  return {
    status,
    pathSource: pathInfo.pathSource,
    ...(pathInfo.profilesRoot === undefined ? {} : { profilesRoot: pathInfo.profilesRoot }),
    ...(pathInfo.reason === undefined ? {} : { reason: pathInfo.reason }),
    ...(pathInfo.fallbackReason === undefined ? {} : { fallbackReason: pathInfo.fallbackReason }),
    ...extra,
  }
}

// Queue API 与 internal/update 共用同一串行同步器。
function webDocumentPath(documentPath, pathInfo) {
  const direct = rootFromDocumentPath(documentPath)
  if (direct.kind === 'valid') return direct.path
  if (pathInfo !== null && pathInfo !== undefined && typeof pathInfo.profilesRoot === 'string') return join(pathInfo.profilesRoot, 'web', 'cordis.patch.yml')
  return documentPath
}

export function createQqbotSettingsSynchronizer(options = {}) {
  const onResult = typeof options.onResult === 'function' ? options.onResult : undefined
  let tail = Promise.resolve()
  let pendingKey = null
  let pendingPromise = null
  let state = { status: 'pending', pending: false }
  const emit = (next) => {
    state = { ...next, pending: false }
    if (onResult !== undefined) {
      try { onResult({ ...state }) } catch { /* diagnostics callback cannot break the write queue */ }
    }
  }
  const execute = async (input = {}) => {
    const startedAt = new Date().toISOString()
    const associated = strictAssociation(input)
    const meta = {
      saveRunId: typeof input.saveRunId === 'string' && input.saveRunId !== '' ? input.saveRunId : randomUUID(),
      syncRevision: Number.isInteger(input.syncRevision) ? input.syncRevision : 0,
      snapshotHash: typeof input.snapshotHash === 'string' && input.snapshotHash !== '' ? input.snapshotHash : null,
      trigger: typeof input.trigger === 'string' && input.trigger !== '' ? input.trigger : 'direct',
    }
    const finish = (result) => {
      const final = {
        ...result,
        ...meta,
        startedAt,
        finishedAt: new Date().toISOString(),
        pending: false,
        terminalMatch: associated && meta.snapshotHash !== null && result.status === 'synced',
        request: { ...meta },
      }
      emit(final)
      return final
    }
    let snapshot
    try {
      snapshot = validateSettingsSnapshot(input.snapshot)
      const calculatedHash = stableSnapshotHash(snapshot)
      if (meta.snapshotHash === null) meta.snapshotHash = calculatedHash
      else if (meta.snapshotHash !== calculatedHash) return finish({ status: 'failed', reason: 'snapshot-hash-mismatch' })
    } catch (error) {
      return finish({ status: 'failed', reason: errorText(error) })
    }
    const pathInfo = resolveProfilesRoot(input.documentPath, input.env === undefined ? process.env : input.env)
    if (pathInfo.status !== 'available') {
      return finish(resultForPath(pathInfo, 'unavailable', { profiles: [], diagnostics: [] }))
    }
    let webBefore
    const webPath = associated ? webDocumentPath(input.documentPath, pathInfo) : undefined
    if (associated) {
      webBefore = patchDiagnostic(webPath, undefined)
      if (webBefore.managedSnapshotHash !== meta.snapshotHash) return finish(resultForPath(pathInfo, 'drift-detected', { profiles: [], diagnostics: [{ reason: 'web-managed-snapshot-mismatch' }], webBefore, webAfter: webBefore, rawWebPatchFingerprint: webBefore, managedWebSnapshotHash: webBefore.managedSnapshotHash }))
    }
    const scanned = scanOwnQqbotProfiles(pathInfo.profilesRoot)
    if (scanned.status === 'unavailable') {
      return finish(resultForPath(pathInfo, 'unavailable', { profiles: [], diagnostics: scanned.diagnostics, ...(associated ? { webBefore, webAfter: webBefore, rawWebPatchFingerprint: webBefore, managedWebSnapshotHash: webBefore.managedSnapshotHash } : {}) }))
    }
    if (scanned.profiles.length === 0) {
      return finish(resultForPath(pathInfo, 'not-installed', { profiles: [], diagnostics: scanned.diagnostics, ...(associated ? { webBefore, webAfter: webBefore, rawWebPatchFingerprint: webBefore, managedWebSnapshotHash: webBefore.managedSnapshotHash } : {}) }))
    }
    const profiles = []
    for (const profile of scanned.profiles) {
      const profileDir = join(pathInfo.profilesRoot, profile)
      const written = writeQqbotSettingsPatch(profileDir, snapshot, options)
      profiles.push({ ...written, profile })
    }
    const webAfter = associated ? patchDiagnostic(webPath, undefined) : undefined
    const webDrift = associated && webAfter.patchSha256 !== webBefore.patchSha256
    const webDiagnostic = webDrift ? {
      target: 'web',
      stage: 'final-web-verify',
      reason: 'external-writer-drift',
      preserveExternalValue: true,
      failureOrder: ['final-web-verify', 'external-writer-drift', 'preserve-external-value'],
      before: webBefore,
      after: webAfter,
    } : null
    const profileDiagnostics = profiles
      .filter((item) => item.diagnostic !== undefined)
      .map((item) => ({ profile: item.profile, failureOrder: item.failureOrder, ...item.diagnostic }))
    const driftDiagnostics = webDiagnostic === null ? profileDiagnostics : [webDiagnostic, ...profileDiagnostics]
    const failureOrder = [...new Set(driftDiagnostics.flatMap((item) => Array.isArray(item.failureOrder) ? item.failureOrder : []))]
    const failed = profiles.filter((item) => item.status === 'failed' || item.status === 'fatal')
    const profileManagedOk = profiles.length > 0 && profiles.every((item) => (item.status === 'applied' || item.status === 'idempotent') && item.managedSnapshotHash === meta.snapshotHash)
    const webManagedOk = !associated || (webAfter.managedSnapshotHash === meta.snapshotHash && webAfter.patchSha256 === webBefore.patchSha256)
    let status
    if (failed.length > 0) status = 'failed'
    else if (!profileManagedOk || !webManagedOk) status = 'drift-detected'
    else status = 'synced'
    return finish(resultForPath(pathInfo, status, {
      profiles,
      diagnostics: [...scanned.diagnostics, ...driftDiagnostics],
      failureOrder,
      ...(associated ? { webBefore, webAfter, rawWebPatchFingerprint: webAfter, managedWebSnapshotHash: webAfter.managedSnapshotHash } : {}),
    }))
  }
  const enqueue = (input = {}) => {
    const rawSnapshot = input.snapshot
    let checked
    try { checked = validateSettingsSnapshot(rawSnapshot) } catch {
      checked = null
    }
    const pathInfo = checked === null ? null : resolveProfilesRoot(input.documentPath, input.env === undefined ? process.env : input.env)
    const association = [input.saveRunId || '', input.syncRevision === undefined ? '' : String(input.syncRevision), input.trigger || ''].join('|')
    const key = fingerprint(pathInfo === null ? undefined : pathInfo.profilesRoot, pathInfo === null ? 'invalid' : pathInfo.pathSource, checked === null ? { values: {}, gateWords: null } : checked) + '|' + association
    if (pendingKey === key && pendingPromise !== null) return pendingPromise
    state = { ...state, pending: true, pathSource: pathInfo === null ? undefined : pathInfo.pathSource }
    const run = tail.then(() => execute({ ...input, snapshot: rawSnapshot }))
    pendingKey = key
    pendingPromise = run
    run.then(() => {
      if (pendingPromise === run) {
        pendingKey = null
        pendingPromise = null
      }
    }, () => {
      if (pendingPromise === run) {
        pendingKey = null
        pendingPromise = null
      }
    })
    tail = run.catch(() => undefined)
    return run
  }
  return Object.freeze({
    enqueue,
    sync: enqueue,
    getState: () => ({ ...state }),
  })
}

export { MANAGED_KEYS, SETTINGS_ROW_ID }
