import * as fs from 'node:fs'
import * as path from 'node:path'
import { randomUUID } from 'node:crypto'
import { fileURLToPath } from 'node:url'
import { createPathContext, resolveHostPath, resolveWorkspacePath } from '../../plugins/dsh-extra-plan/lib/path-policy.js'

const nativePath = process.platform === 'win32' ? path.win32 : path.posix
const isWindows = process.platform === 'win32'
const realpathSync = typeof fs.realpathSync.native === 'function' ? fs.realpathSync.native : fs.realpathSync

function factoryError(code, message, details = {}) {
  const error = new TypeError('[workspace-paths:' + code + '] ' + message)
  error.code = code
  error.details = Object.freeze({ ...details })
  return error
}

function isAbsolute(value) {
  if (typeof value !== 'string') return false
  if (isWindows) return /^[A-Za-z]:[\\/]/.test(value) || /^\\\\/.test(value)
  return value.startsWith('/')
}

function lexical(value, label, allowAbsolute = true) {
  if (typeof value !== 'string' || value.length === 0 || value.trim() === '') throw factoryError('INVALID_PATH', label + ' 必须是非空字符串')
  if (value.includes(String.fromCharCode(0))) throw factoryError('NUL_PATH', label + ' 含 NUL')
  if (/(?:%[A-Za-z_][A-Za-z0-9_]*%)/.test(value) || /(?:^|[\\/])\$(?:\{[A-Za-z_][A-Za-z0-9_]*\}|[A-Za-z_][A-Za-z0-9_]*)/.test(value) || value.startsWith('~')) {
    throw factoryError('VARIABLE_PATH', label + ' 拒绝变量或家目录缩写')
  }
  if (/^[A-Za-z]:[^\\/]/.test(value)) throw factoryError('DRIVE_RELATIVE', label + ' 拒绝 drive-relative 路径')
  const protocol = /^[A-Za-z][A-Za-z0-9+.-]*:/.test(value)
  if (protocol && !/^[A-Za-z]:[\\/]/.test(value)) throw factoryError('INVALID_URI', label + ' 拒绝URI/协议路径')
  if (!allowAbsolute && isAbsolute(value)) throw factoryError('ABSOLUTE_NOT_ALLOWED', label + ' 必须是相对路径')
  return value
}

function keyOf(value) {
  const normalized = nativePath.normalize(value)
  return isWindows ? normalized.toLowerCase() : normalized
}

function within(root, candidate) {
  const rootKey = keyOf(root)
  const candidateKey = keyOf(candidate)
  if (rootKey === candidateKey) return true
  const relative = nativePath.relative(rootKey, candidateKey)
  return relative !== '' && relative !== '..' && !relative.startsWith('..' + nativePath.sep) && !nativePath.isAbsolute(relative)
}

function requireAbsoluteRoot(value, label) {
  lexical(value, label)
  if (!isAbsolute(value) || (isWindows && !/^[A-Za-z]:[\\/]/.test(value) && !/^\\\\/.test(value))) {
    throw factoryError('ROOT_REQUIRED', label + ' 必须是明确绝对路径')
  }
  return nativePath.normalize(value)
}

function assertExistingChain(root, candidate) {
  let cursor = nativePath.normalize(candidate)
  const rootPath = nativePath.normalize(root)
  while (true) {
    let stat
    try {
      stat = fs.lstatSync(cursor)
    } catch (error) {
      if (error.code !== 'ENOENT' && error.code !== 'ENOTDIR') throw factoryError('PATH_PROBE_FAILED', '无法探查工作区路径', { path: cursor, cause: error.code || String(error) })
      if (error.code === 'ENOTDIR') throw factoryError('PARENT_NOT_DIRECTORY', '工作区父路径不是目录', { path: cursor })
      const parent = nativePath.dirname(cursor)
      if (parent === cursor) throw factoryError('ROOT_CHAIN_MISSING', '工作区父链未到达根')
      cursor = parent
      continue
    }
    let real
    try { real = realpathSync(cursor) } catch (error) { throw factoryError('REALPATH_FAILED', '无法验证工作区真实路径', { path: cursor, cause: error.code || String(error) }) }
    if (!within(rootPath, real)) throw factoryError('ROOT_ESCAPE', '工作区路径真实链路越界', { root: rootPath, path: cursor, realPath: real })
    if (stat.isSymbolicLink() && keyOf(cursor) !== keyOf(rootPath)) throw factoryError('LINK_REJECTED', '工作区测试路径不跟随链接', { path: cursor })
    if (keyOf(cursor) === keyOf(rootPath)) return
    const parent = nativePath.dirname(cursor)
    if (parent === cursor) throw factoryError('ROOT_CHAIN_MISSING', '工作区父链未到达根')
    cursor = parent
  }
}

function repoRoot() {
  const moduleFile = realpathSync(fileURLToPath(import.meta.url))
  const sharedDir = nativePath.dirname(moduleFile)
  const peTestDir = nativePath.dirname(sharedDir)
  const root = nativePath.dirname(peTestDir)
  if (nativePath.basename(peTestDir) !== 'pe-test') throw factoryError('STRUCTURE_INVALID', '维护根缺少 pe-test 结构锚')
  for (const marker of [peTestDir, nativePath.join(root, 'plugins')]) {
    let stat
    try { stat = fs.statSync(marker) } catch (error) { throw factoryError('STRUCTURE_INVALID', '维护根结构锚不可读', { path: marker, cause: error.code || String(error) }) }
    if (!stat.isDirectory()) throw factoryError('STRUCTURE_INVALID', '维护根结构锚不是目录', { path: marker })
  }
  return realpathSync(root)
}

function fixtureLabel(value) {
  if (value === undefined) return 'fixture'
  if (typeof value !== 'string' || value.trim() === '' || value === '.' || value === '..') throw factoryError('LABEL_INVALID', 'fixture label 无效')
  if (value.includes('/') || value.includes('\\') || value.includes(String.fromCharCode(0))) throw factoryError('LABEL_INVALID', 'fixture label 不能含路径分隔符')
  if (value.includes('..')) throw factoryError('LABEL_INVALID', 'fixture label 不能含 ..')
  return value
}

export function getWorkspaceRoot() {
  return repoRoot()
}

export function makeFixtureDir(options = {}) {
  if (options === null || typeof options !== 'object' || Array.isArray(options)) throw factoryError('OPTIONS_INVALID', 'makeFixtureDir 参数必须是对象')
  const workspaceRoot = getWorkspaceRoot()
  const label = fixtureLabel(options.label)
  const base = nativePath.join(workspaceRoot, '.extra-plan', 'test-tmp')
  assertExistingChain(workspaceRoot, base)
  fs.mkdirSync(base, { recursive: true })
  let fixtureRoot = null
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const candidate = nativePath.join(base, label + '-' + randomUUID())
    try {
      fs.mkdirSync(candidate)
      fixtureRoot = candidate
      break
    } catch (error) {
      if (error.code !== 'EEXIST') throw factoryError('FIXTURE_CREATE_FAILED', '无法创建独立fixture目录', { path: candidate, cause: error.code || String(error) })
    }
  }
  if (fixtureRoot === null) throw factoryError('FIXTURE_COLLISION', 'fixture目录名重复')
  const directories = Object.freeze({
    root: fixtureRoot,
    home: nativePath.join(fixtureRoot, 'home'),
    cache: nativePath.join(fixtureRoot, 'cache'),
    capture: nativePath.join(fixtureRoot, 'capture'),
    report: nativePath.join(fixtureRoot, 'report'),
    temp: nativePath.join(fixtureRoot, 'temp'),
  })
  for (const directory of Object.values(directories).slice(1)) fs.mkdirSync(directory)
  const cleanup = () => {
    assertExistingChain(workspaceRoot, fixtureRoot)
    fs.rmSync(fixtureRoot, { recursive: true, force: true })
  }
  return Object.freeze({
    workspaceRoot,
    path: fixtureRoot,
    fixtureRoot,
    ...directories,
    cleanup,
  })
}

export function resolveEvidencePath(relativePath, options = {}) {
  if (options === null || typeof options !== 'object' || Array.isArray(options)) throw factoryError('OPTIONS_INVALID', 'resolveEvidencePath options 必须是对象')
  const workspaceRoot = getWorkspaceRoot()
  const evidenceRoot = options.evidenceRoot === undefined
    ? nativePath.join(workspaceRoot, '.extra-plan', 'evidence')
    : (isAbsolute(options.evidenceRoot) ? requireAbsoluteRoot(options.evidenceRoot, 'evidenceRoot') : nativePath.normalize(nativePath.resolve(workspaceRoot, lexical(options.evidenceRoot, 'evidenceRoot', false))))
  if (!within(workspaceRoot, evidenceRoot)) throw factoryError('ROOT_ESCAPE', '证据根必须位于工作区内', { workspaceRoot, evidenceRoot })
  const relative = lexical(relativePath, 'relative evidence path', false)
  const candidate = nativePath.normalize(nativePath.resolve(evidenceRoot, relative))
  if (!within(evidenceRoot, candidate)) throw factoryError('ROOT_ESCAPE', '证据路径超出证据根', { evidenceRoot, candidate })
  return candidate
}

function fixtureRootOf(fixture) {
  if (fixture === null || typeof fixture !== 'object') throw factoryError('FIXTURE_REQUIRED', '隔离环境必须传入makeFixtureDir结果')
  const root = fixture.fixtureRoot === undefined ? fixture.path : fixture.fixtureRoot
  const workspaceRoot = requireAbsoluteRoot(fixture.workspaceRoot, 'fixture.workspaceRoot')
  const fixtureRoot = requireAbsoluteRoot(root, 'fixture.fixtureRoot')
  if (!within(workspaceRoot, fixtureRoot)) throw factoryError('ROOT_ESCAPE', 'fixture必须位于工作区内')
  return { workspaceRoot, fixtureRoot }
}

export function createIsolatedEnv(options = {}) {
  if (options === null || typeof options !== 'object' || Array.isArray(options)) throw factoryError('OPTIONS_INVALID', 'createIsolatedEnv 参数必须是对象')
  const { workspaceRoot, fixtureRoot } = fixtureRootOf(options.fixture)
  const fixture = options.fixture
  const home = fixture.home || nativePath.join(fixtureRoot, 'home')
  const cache = fixture.cache || nativePath.join(fixtureRoot, 'cache')
  const capture = fixture.capture || nativePath.join(fixtureRoot, 'capture')
  const report = fixture.report || nativePath.join(fixtureRoot, 'report')
  const temp = fixture.temp || nativePath.join(fixtureRoot, 'temp')
  for (const [label, value] of Object.entries({ home, cache, capture, report, temp })) {
    const absolute = requireAbsoluteRoot(value, 'fixture.' + label)
    if (!within(workspaceRoot, absolute)) throw factoryError('ROOT_ESCAPE', '隔离环境路径必须位于工作区内', { label, path: absolute })
  }
  const baseEnv = options.baseEnv === undefined ? process.env : options.baseEnv
  if (baseEnv === null || typeof baseEnv !== 'object') throw factoryError('ENV_INVALID', 'baseEnv 必须是对象')
  const extra = options.extra === undefined ? {} : options.extra
  if (extra === null || typeof extra !== 'object' || Array.isArray(extra)) throw factoryError('ENV_INVALID', 'extra 必须是对象')
  const env = {
    ...baseEnv,
    ...extra,
    DSH_HOME: home,
    HOME: home,
    USERPROFILE: home,
    APPDATA: home,
    LOCALAPPDATA: home,
    XDG_CACHE_HOME: cache,
    DSH_EXTRA_PLAN_CAPTURE_DIR: capture,
    DSH_EXTRA_PLAN_REPORT_DIR: report,
    TEMP: temp,
    TMP: temp,
    TMPDIR: temp,
  }
  for (const [key, value] of Object.entries(env)) {
    if (value !== undefined && typeof value !== 'string') throw factoryError('ENV_INVALID', '环境变量必须是字符串: ' + key)
  }
  return Object.freeze(env)
}


const MAINTENANCE_VALUE_OPTIONS = new Set([
  '--host-root',
  '--profile',
  '--session-dir',
  '--session',
  '--sessions-dir',
  '--archive',
  '--request-trace',
])

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function strictMaintenancePath(value, label) {
  if (typeof value !== 'string') throw factoryError('INVALID_PATH', label + ' 必须是字符串')
  if (value.trim() !== value) throw factoryError('INVALID_PATH', label + ' 不能含首尾空白')
  return lexical(value, label)
}

function strictAbsoluteMaintenancePath(value, label) {
  const checked = strictMaintenancePath(value, label)
  return requireAbsoluteRoot(checked, label)
}

function strictMaintenanceSegment(value, label) {
  const checked = strictMaintenancePath(value, label)
  if (checked === '.' || checked === '..' || checked.includes('/') || checked.includes('\\') || /\s/.test(checked)) {
    throw factoryError('SCOPE_INVALID', label + ' 必须是单段名称')
  }
  return checked
}

function strictSessionScopePath(value, label) {
  const checked = strictMaintenancePath(value, label)
  if (checked === '.' || checked === '..') throw factoryError('SESSION_SCOPE_INVALID', label + ' 不能是当前目录或父目录')
  return checked
}

function nextMaintenanceValue(argv, index, option) {
  const value = argv[index + 1]
  if (value === undefined || value === '' || value.startsWith('--')) {
    throw factoryError('MISSING_VALUE', option + ' 必须显式提供值')
  }
  return value
}

function markMaintenanceOption(seen, option) {
  if (seen.has(option)) throw factoryError('DUPLICATE_OPTION', option + ' 不得重复')
  seen.add(option)
}

function sameStringArray(left, right) {
  return Array.isArray(left) && Array.isArray(right) && left.length === right.length && left.every((value, index) => value === right[index])
}

export function parseMaintenanceArgs(argv = []) {
  if (!Array.isArray(argv)) throw factoryError('ARGV_INVALID', 'parseMaintenanceArgs argv 必须是数组')
  for (const [index, value] of argv.entries()) {
    if (typeof value !== 'string') throw factoryError('ARGV_INVALID', 'argv 项必须是字符串', { index })
  }
  const seen = new Set()
  const domainArgv = []
  let hostRoot = null
  let profile = null
  let sessionDir = null
  let sessionId = null
  let sessionsDir = null
  let discoverChildren = false
  let archivePath = null
  let requestTrace = null

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]
    if (arg === '--') {
      domainArgv.push(...argv.slice(index + 1))
      break
    }
    for (const option of MAINTENANCE_VALUE_OPTIONS) {
      if (arg.startsWith(option + '=')) throw factoryError('OPTION_FORM', option + ' 必须使用独立的下一个参数')
    }
    if (arg === '--discover-children') {
      markMaintenanceOption(seen, arg)
      discoverChildren = true
      continue
    }
    if (arg === '--host-root') {
      markMaintenanceOption(seen, arg)
      hostRoot = strictAbsoluteMaintenancePath(nextMaintenanceValue(argv, index, arg), 'hostRoot')
      index += 1
      continue
    }
    if (arg === '--profile') {
      markMaintenanceOption(seen, arg)
      profile = strictMaintenanceSegment(nextMaintenanceValue(argv, index, arg), 'profile')
      index += 1
      continue
    }
    if (arg === '--session-dir') {
      markMaintenanceOption(seen, arg)
      sessionDir = strictSessionScopePath(nextMaintenanceValue(argv, index, arg), 'sessionDir')
      index += 1
      continue
    }
    if (arg === '--session') {
      markMaintenanceOption(seen, arg)
      sessionId = strictMaintenanceSegment(nextMaintenanceValue(argv, index, arg), 'session')
      index += 1
      continue
    }
    if (arg === '--sessions-dir') {
      markMaintenanceOption(seen, arg)
      sessionsDir = strictSessionScopePath(nextMaintenanceValue(argv, index, arg), 'sessionsDir')
      index += 1
      continue
    }
    if (arg === '--archive') {
      markMaintenanceOption(seen, arg)
      archivePath = strictMaintenancePath(nextMaintenanceValue(argv, index, arg), 'archive')
      index += 1
      continue
    }
    if (arg === '--request-trace') {
      markMaintenanceOption(seen, arg)
      requestTrace = strictMaintenancePath(nextMaintenanceValue(argv, index, arg), 'requestTrace')
      index += 1
      continue
    }
    domainArgv.push(arg)
  }

  if (sessionDir !== null && (sessionId !== null || sessionsDir !== null || discoverChildren)) {
    throw factoryError('MUTUALLY_EXCLUSIVE', '--session-dir 不能与 --session/--sessions-dir/--discover-children 共用')
  }
  if (sessionId !== null && sessionsDir === null) throw factoryError('SESSION_ROOT_REQUIRED', '--session 必须同时提供 --sessions-dir')
  if (sessionId === null && sessionsDir !== null) throw factoryError('SESSION_ID_REQUIRED', '--sessions-dir 必须同时提供 --session')
  if (discoverChildren && sessionId === null) throw factoryError('SESSION_SELECTION_REQUIRED', '--discover-children 必须绑定明确 --session')

  const sessionMode = sessionDir !== null ? 'dir' : sessionId !== null ? 'id' : 'none'
  const session = Object.freeze({
    mode: sessionMode,
    dir: sessionDir,
    sessionDir,
    id: sessionId,
    sessionsDir,
    discoverChildren,
  })
  const ledger = Object.freeze({
    mode: archivePath === null ? 'none' : 'archive',
    activePath: archivePath,
    archivePath,
  })
  const frozenArgv = Object.freeze(domainArgv)
  return Object.freeze({
    argv: frozenArgv,
    domainArgv: frozenArgv,
    hostRoot,
    profile,
    session,
    ledger,
    requestTrace,
  })
}

function rejectOtherCategory(value, label) {
  if (typeof value === 'string' && value.toLowerCase() === 'other') throw factoryError('OTHER_REJECTED', label + ' 使用保留类别 Other')
}

function rejectUnknownKeys(record, allowed, label) {
  for (const key of Object.keys(record)) {
    if (!allowed.has(key)) {
      rejectOtherCategory(record[key], label + '.' + key)
      throw factoryError('OPTION_UNKNOWN', label + ' 不接受选项: ' + key)
    }
  }
}

function contextOptionsOf(options) {
  if (options === undefined) return {}
  if (!isRecord(options)) throw factoryError('OPTIONS_INVALID', 'createMaintenanceContext 参数必须是对象')
  if (options.workspaceRoot !== undefined) throw factoryError('WORKSPACE_ROOT_OVERRIDE', '维护根只能由getWorkspaceRoot结构锚定')
  if (options.hostDataRoot !== undefined) throw factoryError('HOST_ROOT_FIELD_INVALID', 'Host数据根必须使用显式 hostRoot')
  const allowed = new Set([
    'argv',
    'domainArgv',
    'hostRoot',
    'profile',
    'session',
    'sessionDir',
    'sessionId',
    'sessionsDir',
    'discoverChildren',
    'ledger',
    'archive',
    'requestTrace',
  ])
  rejectUnknownKeys(options, allowed, 'createMaintenanceContext')
  return options
}

function chooseContextValue(nestedValue, directValue, label) {
  if (nestedValue !== undefined && directValue !== undefined && nestedValue !== directValue) {
    throw factoryError('OPTIONS_CONFLICT', label + ' 的嵌套值与顶层值冲突')
  }
  return nestedValue === undefined ? directValue : nestedValue
}

function normalizeSessionOptions(source) {
  const raw = source.session
  let nested = {}
  if (typeof raw === 'string') nested = { id: raw }
  else if (raw === undefined || raw === null) nested = {}
  else if (isRecord(raw)) {
    rejectUnknownKeys(raw, new Set(['mode', 'dir', 'sessionDir', 'id', 'sessionsDir', 'discoverChildren']), 'session')
    nested = raw
  }
  else throw factoryError('SESSION_OPTIONS_INVALID', 'session 必须是字符串或对象')

  const dirRaw = chooseContextValue(nested.dir === undefined ? nested.sessionDir : nested.dir, source.sessionDir, 'sessionDir')
  const idRaw = chooseContextValue(nested.id, source.sessionId, 'session')
  const sessionsDirRaw = chooseContextValue(nested.sessionsDir, source.sessionsDir, 'sessionsDir')
  const discoverRaw = chooseContextValue(nested.discoverChildren, source.discoverChildren, 'discoverChildren')
  const dir = dirRaw === undefined || dirRaw === null ? null : strictSessionScopePath(dirRaw, 'sessionDir')
  const id = idRaw === undefined || idRaw === null ? null : strictMaintenanceSegment(idRaw, 'session')
  const sessionsDir = sessionsDirRaw === undefined || sessionsDirRaw === null ? null : strictSessionScopePath(sessionsDirRaw, 'sessionsDir')
  const discoverChildren = discoverRaw === undefined ? false : discoverRaw
  if (typeof discoverChildren !== 'boolean') throw factoryError('SESSION_OPTIONS_INVALID', 'discoverChildren 必须是布尔值')
  if (dir !== null && (id !== null || sessionsDir !== null || discoverChildren)) {
    throw factoryError('MUTUALLY_EXCLUSIVE', 'sessionDir 不能与 session/sessionsDir/discoverChildren 共用')
  }
  if (id !== null && sessionsDir === null) throw factoryError('SESSION_ROOT_REQUIRED', 'session 必须同时提供 sessionsDir')
  if (id === null && sessionsDir !== null) throw factoryError('SESSION_ID_REQUIRED', 'sessionsDir 必须同时提供 session')
  if (discoverChildren && id === null) throw factoryError('SESSION_SELECTION_REQUIRED', 'discoverChildren 必须绑定明确 session')
  const mode = dir !== null ? 'dir' : id !== null ? 'id' : 'none'
  if (nested.mode !== undefined && nested.mode !== mode) throw factoryError('SESSION_OPTIONS_INVALID', 'session.mode 与字段不一致')
  return Object.freeze({ mode, dir, sessionDir: dir, id, sessionsDir, discoverChildren })
}

function normalizeLedgerOptions(source) {
  const raw = source.ledger
  let nested = {}
  if (typeof raw === 'string') nested = { activePath: raw }
  else if (raw === undefined || raw === null) nested = {}
  else if (isRecord(raw)) {
    rejectUnknownKeys(raw, new Set(['mode', 'activePath', 'archivePath']), 'ledger')
    nested = raw
  }
  else throw factoryError('LEDGER_OPTIONS_INVALID', 'ledger 必须是路径或对象')
  const nestedPath = nested.activePath === undefined ? nested.archivePath : nested.activePath
  const activeRaw = chooseContextValue(nestedPath, source.archive, 'archive')
  const activePath = activeRaw === undefined || activeRaw === null ? null : strictMaintenancePath(activeRaw, 'archive')
  const mode = activePath === null ? 'none' : 'archive'
  if (nested.mode !== undefined && nested.mode !== 'none' && nested.mode !== 'stats' && nested.mode !== 'archive') {
    throw factoryError('LEDGER_OPTIONS_INVALID', 'ledger.mode 无效')
  }
  if ((nested.mode === 'archive') !== (activePath !== null) && nested.mode !== undefined && nested.mode !== 'stats') {
    throw factoryError('LEDGER_OPTIONS_INVALID', 'ledger.mode 与 archive 路径不一致')
  }
  return Object.freeze({ mode, activePath, archivePath: activePath })
}

function normalizeRequestTrace(source) {
  const raw = source.requestTrace
  if (raw === undefined || raw === null) return null
  if (isRecord(raw)) rejectUnknownKeys(raw, new Set(['path']), 'requestTrace')
  const value = isRecord(raw) ? raw.path : raw
  return strictMaintenancePath(value, 'requestTrace')
}

function normalizeDomainArgv(source) {
  const domainArgv = source.domainArgv
  const argv = source.argv
  if (domainArgv !== undefined && !Array.isArray(domainArgv)) throw factoryError('ARGV_INVALID', 'domainArgv 必须是数组')
  if (argv !== undefined && !Array.isArray(argv)) throw factoryError('ARGV_INVALID', 'argv 必须是数组')
  if (domainArgv !== undefined && argv !== undefined && !sameStringArray(domainArgv, argv)) throw factoryError('OPTIONS_CONFLICT', 'argv 与 domainArgv 不一致')
  const value = domainArgv === undefined ? (argv === undefined ? [] : argv) : domainArgv
  for (const [index, item] of value.entries()) {
    if (typeof item !== 'string') throw factoryError('ARGV_INVALID', '领域argv项必须是字符串', { index })
  }
  return Object.freeze([...value])
}

function policyTargetFor(pathContext, kind, value, purpose, label) {
  try {
    return kind === 'host'
      ? resolveHostPath(pathContext, value, { purpose })
      : resolveWorkspacePath(pathContext, value, { purpose })
  } catch (error) {
    const code = error !== null && typeof error === 'object' && typeof error.code === 'string' ? error.code : 'PATH_POLICY_REJECTED'
    throw factoryError(code, label + ' 被路径策略拒绝', { path: value, cause: error && error.message ? error.message : String(error) })
  }
}

function targetView(target, access) {
  const canWrite = target.kind === 'workspace' && access !== 'read'
  const readOnly = target.kind === 'host' || access === 'read'
  return Object.freeze({
    kind: target.kind,
    scope: target.kind,
    path: target.path,
    root: target.root,
    relativePath: target.relativePath,
    purpose: target.purpose,
    access,
    readOnly,
    canRead: true,
    canWrite,
    physicalProof: target.kind === 'host' ? 'validateReadTarget' : canWrite ? 'prepareWriteTarget' : 'validateReadTarget',
    policyTarget: target,
  })
}

function targetForInput(pathContext, workspaceRoot, hostRoot, value, options = {}) {
  const purpose = options.purpose
  const label = options.label || purpose || 'path'
  const access = options.access === undefined ? 'read' : options.access
  const workspaceOnly = options.workspaceOnly === true
  const preferHost = options.preferHost === true
  if (!isAbsolute(value)) return targetView(policyTargetFor(pathContext, 'workspace', value, purpose, label), access)
  const normalized = nativePath.normalize(value)
  const inWorkspace = within(workspaceRoot, normalized)
  const inHost = hostRoot !== null && within(hostRoot, normalized)
  if (workspaceOnly) {
    if (!inWorkspace) throw factoryError('ROOT_ESCAPE', label + ' 必须位于维护W内', { path: normalized, workspaceRoot })
    return targetView(policyTargetFor(pathContext, 'workspace', normalized, purpose, label), access)
  }
  if (preferHost && inHost) return targetView(policyTargetFor(pathContext, 'host', normalized, purpose, label), 'read')
  if (inWorkspace) return targetView(policyTargetFor(pathContext, 'workspace', normalized, purpose, label), access)
  if (inHost) return targetView(policyTargetFor(pathContext, 'host', normalized, purpose, label), 'read')
  if (hostRoot === null) throw factoryError('HOST_ROOT_REQUIRED', label + ' 为绝对路径，必须显式提供 hostRoot', { path: normalized })
  throw factoryError('TARGET_SCOPE_INVALID', label + ' 不在维护W或显式Host根内', { path: normalized, workspaceRoot, hostRoot })
}

export function createMaintenanceContext(options = {}) {
  const source = contextOptionsOf(options)
  const hostRoot = source.hostRoot === undefined || source.hostRoot === null ? null : strictAbsoluteMaintenancePath(source.hostRoot, 'hostRoot')
  const profile = source.profile === undefined || source.profile === null ? null : strictMaintenanceSegment(source.profile, 'profile')
  const sessionInput = normalizeSessionOptions(source)
  const ledgerInput = normalizeLedgerOptions(source)
  const requestTraceInput = normalizeRequestTrace(source)
  const domainArgv = normalizeDomainArgv(source)
  const workspaceRoot = getWorkspaceRoot()
  const pathContextOptions = { workspaceRoot }
  if (hostRoot !== null) pathContextOptions.hostDataRoot = hostRoot
  const pathContext = createPathContext(pathContextOptions)
  const workspaceRootTarget = targetView(policyTargetFor(pathContext, 'workspace', '.', 'maintenance-root', 'maintenance root'), 'read-write')
  const hostRootTarget = hostRoot === null
    ? null
    : targetView(policyTargetFor(pathContext, 'host', '.', 'host-data-read', 'host root'), 'read')

  let sessionTarget = null
  if (sessionInput.mode === 'dir') {
    sessionTarget = targetForInput(pathContext, workspaceRoot, hostRoot, sessionInput.dir, {
      purpose: 'session-read',
      access: 'read',
      preferHost: true,
      label: 'sessionDir',
    })
  } else if (sessionInput.mode === 'id') {
    sessionTarget = targetForInput(pathContext, workspaceRoot, hostRoot, sessionInput.sessionsDir, {
      purpose: 'session-root-read',
      access: 'read',
      preferHost: true,
      label: 'sessionsDir',
    })
  }
  const session = Object.freeze({
    ...sessionInput,
    status: sessionTarget === null ? 'NOT-RUN' : 'READY',
    target: sessionTarget,
    rootTarget: sessionTarget,
    scope: sessionTarget === null ? null : sessionTarget.scope,
    readOnly: sessionTarget !== null,
    writeAuthorized: false,
    maxCandidates: sessionInput.discoverChildren ? 128 : null,
    maxCompressedBytesPerLog: sessionInput.discoverChildren ? 262144 : null,
  })

  const ledgerTarget = ledgerInput.activePath === null
    ? null
    : targetForInput(pathContext, workspaceRoot, hostRoot, ledgerInput.activePath, {
      purpose: 'ledger-archive',
      access: 'write',
      workspaceOnly: true,
      label: 'archive',
    })
  const ledger = Object.freeze({
    ...ledgerInput,
    status: ledgerTarget === null ? 'NOT-RUN' : 'READY',
    target: ledgerTarget,
    scope: ledgerTarget === null ? null : ledgerTarget.scope,
    readOnly: ledgerTarget === null ? true : false,
    writeAuthorized: ledgerTarget !== null && ledgerTarget.canWrite,
  })

  const requestTraceTarget = requestTraceInput === null
    ? null
    : targetForInput(pathContext, workspaceRoot, hostRoot, requestTraceInput, {
      purpose: 'request-trace',
      access: 'read-write',
      workspaceOnly: true,
      label: 'requestTrace',
    })
  const authorization = Object.freeze({
    workspace: Object.freeze({
      root: workspaceRoot,
      access: 'read-write',
      readAuthorized: true,
      writeAuthorized: true,
      source: 'getWorkspaceRoot',
    }),
    host: hostRoot === null
      ? Object.freeze({ root: null, access: 'none', readAuthorized: false, writeAuthorized: false, source: 'explicit-hostRoot-required' })
      : Object.freeze({ root: hostRoot, access: 'read-only', readAuthorized: true, writeAuthorized: false, source: 'explicit-hostRoot' }),
    codeRoot: Object.freeze({ source: 'DSH_INSTALL_ROOT', access: 'independent-read-only', selectedByThisApi: false, writeAuthorized: false }),
  })
  return Object.freeze({
    workspaceRoot,
    maintenanceRoot: workspaceRoot,
    hostRoot,
    hostDataRoot: hostRoot,
    hostAuthorized: hostRoot !== null,
    hostAccess: hostRoot === null ? 'none' : 'read-only',
    profile,
    pathContext,
    workspaceRootTarget,
    hostRootTarget,
    authorization,
    purposes: Object.freeze({
      maintenance: 'workspace-write',
      session: 'read-only',
      sessionDiscovery: 'read-only',
      hostData: 'host-read-only',
      ledgerArchive: 'workspace-write',
      requestTrace: 'workspace-read-write',
      codeInstall: 'independent-read-only',
    }),
    session,
    ledger,
    requestTrace: requestTraceTarget,
    argv: domainArgv,
    domainArgv,
  })
}
