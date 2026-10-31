import { createHash } from 'node:crypto'
import { mkdirSync, writeFileSync, readFileSync } from 'node:fs'
import { join, relative, resolve } from 'node:path'
import { getWorkspaceRoot } from './workspace-paths.mjs'
import { createPathContext, prepareWriteTarget, resolveWorkspacePath, validateReadTarget } from '../../plugins/dsh-extra-plan/lib/path-policy.js'

export const OUTPUT_MODES = Object.freeze({
  COMPACT: 'compact',
  VERBOSE: 'verbose',
  FULL: 'full',
})

function digest(value) {
  return createHash('sha256').update(String(value), 'utf8').digest('hex')
}

function normalize(value, seen = new WeakSet()) {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return value
  if (typeof value === 'number') return Number.isFinite(value) ? value : String(value)
  if (typeof value === 'bigint') return String(value) + 'n'
  if (typeof value === 'undefined') return undefined
  if (typeof value === 'function') return '[Function]'
  if (typeof value !== 'object') return String(value)
  if (seen.has(value)) return '[Circular]'
  seen.add(value)
  if (Array.isArray(value)) return value.map((item) => normalize(item, seen))
  const out = {}
  for (const key of Object.keys(value).sort()) {
    const item = normalize(value[key], seen)
    if (item !== undefined) out[key] = item
  }
  return out
}

export function stableStringify(value) {
  const normalized = normalize(value)
  const text = JSON.stringify(normalized)
  return text === undefined ? String(value) : text
}

export function parseOutputMode(argv = []) {
  const args = Array.isArray(argv) ? argv.map((item) => String(item)) : []
  let explicit
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index]
    if (arg === '--output-mode') {
      explicit = args[index + 1]
      index += 1
      if (explicit === undefined) throw new Error('test-output: --output-mode requires compact|verbose|full')
    } else if (arg.startsWith('--output-mode=')) {
      explicit = arg.slice('--output-mode='.length)
    }
  }
  if (explicit !== undefined && !Object.values(OUTPUT_MODES).includes(explicit)) {
    throw new Error('test-output: invalid output mode: ' + explicit)
  }
  if (args.includes('--full') || explicit === OUTPUT_MODES.FULL) return OUTPUT_MODES.FULL
  if (args.includes('--verbose') || explicit === OUTPUT_MODES.VERBOSE) return OUTPUT_MODES.VERBOSE
  return OUTPUT_MODES.COMPACT
}

export function summarizeValue(value, options = {}) {
  const maxString = Number.isInteger(options.maxString) ? options.maxString : 160
  const maxKeys = Number.isInteger(options.maxKeys) ? options.maxKeys : 32
  if (typeof value === 'string') {
    if (value.length <= maxString) return value
    return { type: 'string', length: value.length, sha256: digest(value), preview: value.slice(0, maxString) }
  }
  if (value === null || typeof value !== 'object') return value
  if (Array.isArray(value)) return { type: 'array', count: value.length }
  const keys = Object.keys(value).sort()
  return { type: 'object', keyCount: keys.length, keys: keys.slice(0, maxKeys), truncatedKeys: Math.max(0, keys.length - maxKeys) }
}

export function assertionLine(mode, ok, label, expected, actual) {
  const prefix = (ok ? 'PASS' : 'FAIL') + '  ' + label
  if (ok && mode === OUTPUT_MODES.COMPACT) return ''
  if (ok && mode === OUTPUT_MODES.VERBOSE) return prefix
  return prefix + '  (期望 ' + stableStringify(expected) + ', 实际 ' + stableStringify(actual) + ')'
}

export function createOutput(options = {}) {
  const mode = options.mode || parseOutputMode(options.argv === undefined ? process.argv.slice(2) : options.argv)
  const write = typeof options.write === 'function' ? options.write : (line) => console.log(line)
  const errorWrite = typeof options.errorWrite === 'function' ? options.errorWrite : (line) => console.error(line)
  const emit = (line, error = false) => {
    if (line === undefined || line === null || line === '') return
    ;(error ? errorWrite : write)(String(line))
  }
  const assertion = (ok, label, expected, actual) => {
    emit(assertionLine(mode, ok, label, expected, actual), !ok)
    return ok
  }
  const structured = (label, fullValue, compactValue = summarizeValue(fullValue), options2 = {}) => {
    const isFailure = options2.failure === true || options2.success === false
    const value = mode === OUTPUT_MODES.FULL || isFailure ? fullValue : compactValue
    emit(label + ' ' + stableStringify(value), options2.error === true)
    return value
  }
  const detail = (line, options2 = {}) => {
    if (mode === OUTPUT_MODES.FULL || options2.always === true) emit(line, options2.error === true)
  }
  const marker = (state, value) => emit(state + '  ' + (typeof value === 'string' ? value : stableStringify(value)), state === 'FAIL')
  const summary = (pass, fail, extras = {}) => {
    const parts = ['通过 ' + pass, '失败 ' + fail]
    if (extras.skip !== undefined) parts.push('跳过 ' + extras.skip)
    if (extras.human !== undefined) parts.push('HUMAN ' + extras.human)
    if (extras.incomplete !== undefined) parts.push('未完成 ' + extras.incomplete)
    emit('\n' + parts.join(', '))
  }
  return Object.freeze({ mode, emit, error: (line) => emit(line, true), assertion, structured, detail, marker, summary })
}

const WORKSPACE_CONTEXT = createPathContext({ workspaceRoot: resolve(getWorkspaceRoot()) })

function workspaceTarget(value, label) {
  if (typeof value !== 'string' || value.trim() === '') throw new Error('test-output: ' + label + ' must be a non-empty path')
  return resolveWorkspacePath(WORKSPACE_CONTEXT, value, { purpose: label })
}

function workspacePathOf(value, label) {
  return workspaceTarget(value, label).path
}

function prepareOutputDirectory(directory, label) {
  const target = workspaceTarget(directory, label)
  try {
    return prepareWriteTarget(WORKSPACE_CONTEXT, target, { expectedType: 'directory' })
  } catch (error) {
    if (error?.code !== 'TARGET_MISSING') throw error
    return prepareWriteTarget(WORKSPACE_CONTEXT, target, { expectedType: 'file' })
  }
}

function prepareOutputFile(filePath, label) {
  const target = workspaceTarget(filePath, label)
  return prepareWriteTarget(WORKSPACE_CONTEXT, target, { expectedType: 'file' })
}

export function fileEvidence(filePath, root = undefined) {
  const safeFilePath = workspacePathOf(filePath, 'fileEvidence path')
  const readTarget = validateReadTarget(WORKSPACE_CONTEXT, safeFilePath, { kind: 'workspace', expectedType: 'file' })
  const content = readFileSync(readTarget.path, 'utf8')
  let pathValue = filePath
  if (root !== undefined) {
    const rootTarget = prepareWriteTarget(WORKSPACE_CONTEXT, workspaceTarget(root, 'fileEvidence root'), { expectedType: 'directory' })
    pathValue = relative(rootTarget.path, readTarget.path).replaceAll('\\', '/')
  }
  return { path: pathValue, bytes: Buffer.byteLength(content, 'utf8'), lines: content === '' ? 0 : content.split(/\r?\n/).length - (content.endsWith('\n') ? 1 : 0), sha256: digest(content) }
}

export function writeRawEvidence(options) {
  const directory = workspacePathOf(options?.directory, 'raw evidence directory')
  const baseName = options?.baseName
  if (typeof baseName !== 'string' || baseName === '') throw new Error('test-output: raw directory and baseName are required')
  prepareOutputDirectory(directory, 'raw evidence directory')
  mkdirSync(directory, { recursive: true })
  prepareOutputDirectory(directory, 'raw evidence directory after mkdir')
  const entries = [
    ['stdout', String(options.stdout === undefined ? '' : options.stdout)],
    ['stderr', String(options.stderr === undefined ? '' : options.stderr)],
  ]
  const files = []
  for (const [channel, content] of entries) {
    const filePath = workspacePathOf(join(directory, baseName + '.' + channel + '.raw.log'), 'raw evidence file')
    const writeTarget = prepareOutputFile(filePath, 'raw evidence file')
    writeFileSync(writeTarget.path, content, 'utf8')
    files.push({ channel, ...fileEvidence(filePath) })
  }
  const combined = entries.map((entry) => entry[1]).join('')
  return { files, bytes: Buffer.byteLength(combined, 'utf8'), lines: combined === '' ? 0 : combined.split(/\r?\n/).length - (combined.endsWith('\n') ? 1 : 0), sha256: digest(combined) }
}

export function sha256Text(value) {
  return digest(value)
}
