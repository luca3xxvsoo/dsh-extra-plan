// C回归任务1：独立可复用的路径边界安全矩阵；所有夹具与报告仅落在明确W内。
import fs from 'node:fs'
import { closeSync, copyFileSync, existsSync, lstatSync, mkdirSync, mkdtempSync, openSync, readFileSync, realpathSync, renameSync, rmSync, statSync, symlinkSync, unlinkSync, writeFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { spawnSync } from 'node:child_process'
import { createRequire, syncBuiltinESMExports } from 'node:module'
import { dirname, join, relative, resolve } from 'node:path'
import { fileURLToPath as urlFileURLToPath, pathToFileURL } from 'node:url'
import { makeFixtureDir, parseMaintenanceArgs } from '../_shared/workspace-paths.mjs'
import { createOutput } from '../_shared/test-output.mjs'
import * as corePaths from '../../plugins/dsh-extra-plan/lib/path-policy.js'
import * as qqPaths from '../../plugins/dsh-extra-plan-qqbot/lib/path-policy.js'

const HERE = dirname(urlFileURLToPath(import.meta.url))
const ROOT = resolve(HERE, '..', '..')
const THIS_SOURCE = join(ROOT, 'pe-test', 'tools', 'step-00-路径边界.mjs')
const HOST_PRELOAD = join(ROOT, 'pe-test', '_shared', 'host-preload.mjs')
const QQ_CLI = join(ROOT, 'plugins', 'dsh-extra-plan-qqbot', 'scripts', 'heal.mjs')
const MAX_AUDIT_ENTRIES = 128
let EVIDENCE_ROOT = null
const output = createOutput({ argv: process.argv.slice(2) })
const nativeRealpathSync = typeof realpathSync.native === 'function' ? realpathSync.native : realpathSync

function sourceEntriesOf(value) {
  return value?.sourceAudit?.sources || value?.sourceAudit?.sourceFiles || value?.sourceFiles || []
}

function samePath(left, right) {
  const a = resolve(left)
  const b = resolve(right)
  return process.platform === 'win32' ? a.toLowerCase() === b.toLowerCase() : a === b
}

function reportError(code, message, details = {}) {
  const error = new Error('[path-boundary:' + code + '] ' + message)
  error.code = code
  error.details = details
  return error
}

function parseReportArgs(argv) {
  if (!Array.isArray(argv)) throw reportError('ARGV_INVALID', '报告参数必须是数组')
  const domainArgv = []
  let evidenceDir = null
  let auditBaseline = null
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]
    if (arg === '--evidence-dir' || arg === '--audit-baseline') {
      const value = argv[index + 1]
      if (typeof value !== 'string' || value === '' || value.startsWith('--')) throw reportError('ARGUMENT_REQUIRED', arg + ' 必须有独立路径参数')
      if (arg === '--evidence-dir') evidenceDir = value
      else auditBaseline = value
      index += 1
      continue
    }
    if (arg.startsWith('--evidence-dir=') || arg.startsWith('--audit-baseline=')) throw reportError('OPTION_FORM', '报告路径参数必须使用独立的下一个参数')
    domainArgv.push(arg)
  }
  return { evidenceDir, auditBaseline, domainArgv }
}

function lstatIfPresent(filePath) {
  try {
    return lstatSync(filePath)
  } catch (error) {
    if (error?.code === 'ENOENT') return null
    throw error
  }
}

function validateWorkspaceChain(candidate) {
  const target = resolve(candidate)
  if (!isWithin(ROOT, target)) throw reportError('ROOT_ESCAPE', '报告路径超出W', { path: target })
  const rootPath = resolve(ROOT)
  const rootReal = nativeRealpathSync(rootPath)
  let cursor = target
  while (true) {
    const stat = lstatIfPresent(cursor)
    if (stat !== null) {
      if (stat.isSymbolicLink() && !samePath(cursor, rootPath)) throw reportError('LINK_REJECTED', '报告路径父链含链接', { path: cursor })
      if (stat.isSymbolicLink()) throw reportError('LINK_REJECTED', '报告根不能是链接', { path: cursor })
      const real = nativeRealpathSync(cursor)
      if (!isWithin(rootReal, real)) throw reportError('REALPATH_ESCAPE', '报告路径真实父链越出W', { path: cursor, realPath: real })
      if (!samePath(cursor, target) && !stat.isDirectory()) throw reportError('PARENT_NOT_DIRECTORY', '报告路径父项不是目录', { path: cursor })
    }
    if (samePath(cursor, rootPath)) break
    const parent = dirname(cursor)
    if (samePath(parent, cursor)) throw reportError('ROOT_CHAIN_MISSING', '报告路径父链未到达W')
    cursor = parent
  }
  return target
}

function prepareEvidenceRoot(reportArgs) {
  const explicit = reportArgs.evidenceDir !== null
  const base = explicit ? resolve(ROOT, reportArgs.evidenceDir) : join(ROOT, '.extra-plan', 'reports')
  validateWorkspaceChain(base)
  const existing = lstatIfPresent(base)
  if (explicit && existing !== null) throw reportError('EVIDENCE_EXISTS', '显式报告目录已存在，拒绝覆盖', { path: base })
  if (existing !== null && !existing.isDirectory()) throw reportError('EVIDENCE_NOT_DIRECTORY', '报告根不是目录', { path: base })
  if (existing === null) {
    mkdirSync(base, { recursive: true })
    validateWorkspaceChain(base)
  }
  if (explicit) return base
  const prefix = join(base, 'path-boundary-')
  validateWorkspaceChain(prefix)
  const unique = mkdtempSync(prefix)
  validateWorkspaceChain(unique)
  return unique
}

const scenarioRecords = []
const commandRecords = []
let pass = 0
let fail = 0
let skip = 0
let incomplete = 0
let notRun = 0
let human = 0
let unhandled = null

function textOf(value) {
  return value instanceof Error ? value.message : String(value)
}

function errorShape(error) {
  if (error === null || error === undefined) return null
  return {
    name: error.name,
    code: typeof error.code === 'string' ? error.code : null,
    message: textOf(error),
    cause: error.cause === undefined ? null : String(error.cause),
  }
}

function capture(fn) {
  try {
    return { ok: true, value: fn(), error: null }
  } catch (error) {
    return { ok: false, value: null, error: errorShape(error) }
  }
}

async function captureAsync(fn) {
  try {
    return { ok: true, value: await fn(), error: null }
  } catch (error) {
    return { ok: false, value: null, error: errorShape(error) }
  }
}

function sameValue(left, right) {
  return JSON.stringify(left) === JSON.stringify(right)
}

function record(label, expected, actual, ok, extra = {}) {
  const status = ok ? 'PASS' : 'FAIL'
  const item = { label, status, expected, actual, ...extra }
  scenarioRecords.push(item)
  if (ok) {
    pass += 1
    output.assertion(true, label, expected, actual)
  } else {
    fail += 1
    output.assertion(false, label, expected, actual)
  }
  return ok
}

function markNotRun(label, expected, actual, reason) {
  notRun += 1
  scenarioRecords.push({ label, status: 'NOT-RUN', expected, actual, reason })
  output.marker('NOT-RUN', { label, expected, actual, reason })
}

function isWithin(root, candidate) {
  const child = relative(resolve(root), resolve(candidate))
  return child === '' || (child !== '..' && !child.startsWith('..' + requireSep()) && !isAbsolutePath(child))
}

function requireSep() {
  return process.platform === 'win32' ? '\\' : '/'
}

function isAbsolutePath(value) {
  return process.platform === 'win32' ? /^[A-Za-z]:[\\/]/.test(value) || /^\\\\/.test(value) : value.startsWith('/')
}

function sha256File(filePath) {
  return createHash('sha256').update(readFileSync(filePath)).digest('hex')
}

function bytesOf(filePath) {
  return statSync(filePath).size
}

function fixturePath(fixtureRoot, value) {
  const candidate = resolve(value)
  if (!isWithin(fixtureRoot, candidate)) throw new Error('path-boundary fixture path escaped W: ' + candidate)
  return candidate
}

function fixtureWrite(fixtureRoot, filePath, content) {
  const target = fixturePath(fixtureRoot, filePath)
  mkdirSync(dirname(target), { recursive: true })
  writeFileSync(target, content, 'utf8')
  return target
}

function ensureEvidenceDir(relativeDir) {
  if (typeof EVIDENCE_ROOT !== 'string' || EVIDENCE_ROOT === '') throw reportError('REPORT_NOT_READY', '报告根尚未授权')
  const target = resolve(EVIDENCE_ROOT, relativeDir)
  if (!isWithin(EVIDENCE_ROOT, target)) throw reportError('EVIDENCE_ESCAPE', '报告路径超出本次报告根', { path: target })
  validateWorkspaceChain(target)
  const existing = lstatIfPresent(target)
  if (existing !== null) {
    if (!existing.isDirectory() || existing.isSymbolicLink()) throw reportError('EVIDENCE_PARENT_INVALID', '报告目录不是可信目录', { path: target })
    return target
  }
  mkdirSync(target, { recursive: true })
  validateWorkspaceChain(target)
  return target
}

function writeEvidence(relativeFile, content) {
  if (typeof EVIDENCE_ROOT !== 'string' || EVIDENCE_ROOT === '') throw reportError('REPORT_NOT_READY', '报告根尚未授权')
  const target = resolve(EVIDENCE_ROOT, relativeFile)
  if (!isWithin(EVIDENCE_ROOT, target)) throw reportError('EVIDENCE_ESCAPE', '报告文件超出本次报告根', { path: target })
  ensureEvidenceDir(dirname(relativeFile))
  validateWorkspaceChain(target)
  if (lstatIfPresent(target) !== null) throw reportError('EVIDENCE_COLLISION', '报告文件已存在，拒绝覆盖', { path: target })
  const context = corePaths.createPathContext({ workspaceRoot: ROOT })
  const candidate = corePaths.resolveWorkspacePath(context, target, { purpose: 'path-boundary-report' })
  const prepared = corePaths.prepareWriteTarget(context, candidate, { expectedType: 'file', purpose: 'path-boundary-report' })
  writeFileSync(prepared.path, String(content), { encoding: 'utf8', flag: 'wx' })
  return prepared.path
}

function fsSpy(action) {
  const names = ['existsSync', 'lstatSync', 'statSync', 'readFileSync', 'writeFileSync', 'appendFileSync', 'readdirSync', 'openSync', 'readSync', 'fstatSync', 'closeSync', 'mkdirSync', 'renameSync', 'unlinkSync']
  const originals = {}
  const counts = Object.fromEntries(names.map((name) => [name, 0]))
  let calibrated = true
  let result = null
  let error = null
  let readBytes = 0
  try {
    for (const name of names) {
      originals[name] = fs[name]
      if (typeof originals[name] !== 'function') continue
      fs[name] = (...args) => {
        counts[name] += 1
        if (name === 'readSync' && Number.isInteger(args[3])) readBytes += args[3]
        return originals[name](...args)
      }
    }
    syncBuiltinESMExports()
    result = action(counts)
  } catch (caught) {
    error = errorShape(caught)
  } finally {
    try {
      for (const name of names) if (originals[name] !== undefined) fs[name] = originals[name]
      syncBuiltinESMExports()
    } catch (restoreError) {
      calibrated = false
      error = errorShape(restoreError)
    }
  }
  return { calibrated, counts, readBytes, result, error }
}

function totalIo(counts) {
  return Object.values(counts).reduce((sum, value) => sum + value, 0)
}

function packageManifest(root, packageName) {
  const candidates = [
    join(root, 'node_modules', '@deepseek-ai', packageName, 'package.json'),
    join(root, 'node_modules', '@deepseek-ai', 'dsh', 'node_modules', '@deepseek-ai', packageName, 'package.json'),
  ]
  for (const candidate of candidates) {
    try {
      const stat = lstatSync(candidate)
      if (!stat.isFile()) continue
      const real = realpathSync(candidate)
      if (!isWithin(root, real)) throw new Error('package manifest realpath escaped DSH_INSTALL_ROOT: ' + real)
      const manifest = JSON.parse(readFileSync(real, 'utf8'))
      return { manifestPath: candidate, realManifestPath: real, manifest }
    } catch (error) {
      if (error?.code === 'ENOENT' || error?.code === 'ENOTDIR') continue
      throw error
    }
  }
  throw new Error('explicit Host package missing: @deepseek-ai/' + packageName)
}

function conditionalExport(value) {
  if (typeof value === 'string') return value
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return null
  for (const key of ['default', 'import', 'require', 'node']) if (typeof value[key] === 'string') return value[key]
  return null
}

function packageEntry(root, packageRecord, subpath = '.') {
  const pkg = packageRecord.manifest
  let relativeEntry = null
  if (typeof pkg.exports === 'string' && subpath === '.') relativeEntry = pkg.exports
  else if (pkg.exports !== null && typeof pkg.exports === 'object' && !Array.isArray(pkg.exports)) {
    const direct = Object.prototype.hasOwnProperty.call(pkg.exports, subpath)
      ? pkg.exports[subpath]
      : subpath === '.' && !Object.keys(pkg.exports).some((key) => key.startsWith('.')) ? pkg.exports : null
    relativeEntry = conditionalExport(direct)
  }
  if (relativeEntry === null && subpath === '.' && typeof pkg.main === 'string') relativeEntry = pkg.main
  if (relativeEntry === null) throw new Error('Host package has no requested entry: ' + String(pkg.name) + ' ' + subpath)
  const relativeEntryPath = relativeEntry.startsWith('./') ? relativeEntry.slice(2) : relativeEntry
  const entry = resolve(dirname(packageRecord.realManifestPath), relativeEntryPath)
  if (!isWithin(root, entry)) throw new Error('Host package entry escaped DSH_INSTALL_ROOT: ' + entry)
  const realEntry = realpathSync(entry)
  if (!isWithin(root, realEntry)) throw new Error('Host package entry realpath escaped DSH_INSTALL_ROOT: ' + realEntry)
  if (!statSync(realEntry).isFile()) throw new Error('Host package entry is not a file: ' + realEntry)
  return { entry, realEntry, url: pathToFileURL(realEntry).href, exportValue: relativeEntry, subpath }
}

function hostPackages(installRoot) {
  const root = realpathSync(installRoot)
  const dshRecord = packageManifest(root, 'dsh')
  const llmRecord = packageManifest(root, 'dsh-llm')
  const agentPresetRecord = packageManifest(root, 'dsh-agent-preset')
  const registryRecord = packageManifest(root, 'dsh-agent-preset-registry')
  const dshEntry = packageEntry(root, dshRecord, './profile-boot')
  const llmEntry = packageEntry(root, llmRecord, '.')
  const agentPresetEntry = packageEntry(root, agentPresetRecord, '.')
  const registryEntry = packageEntry(root, registryRecord, '.')
  const dshExports = dshRecord.manifest.exports
  const dshDotExport = dshExports !== null && typeof dshExports === 'object' && Object.prototype.hasOwnProperty.call(dshExports, '.')
  const installAnchor = dshRecord.realManifestPath
  if (basenameOf(installAnchor) !== 'package.json' || dshRecord.manifest.name !== '@deepseek-ai/dsh') throw new Error('installAnchor is not dsh package.json')
  let requireResolved = {}
  try {
    const require = createRequire(installAnchor)
    requireResolved = {
      llm: require.resolve('@deepseek-ai/dsh-llm'),
      agentPreset: require.resolve('@deepseek-ai/dsh-agent-preset'),
    }
  } catch (error) {
    requireResolved = { error: errorShape(error) }
  }
  return {
    root,
    installAnchor,
    dsh: { name: dshRecord.manifest.name, version: dshRecord.manifest.version, manifest: dshRecord.realManifestPath, entry: dshEntry.realEntry, entryUrl: dshEntry.url, exportValue: dshEntry.exportValue, dotExportPresent: dshDotExport, packagePresentWithoutDotExport: !dshDotExport },
    llm: { name: llmRecord.manifest.name, version: llmRecord.manifest.version, manifest: llmRecord.realManifestPath, entry: llmEntry.realEntry, entryUrl: llmEntry.url, exportValue: llmEntry.exportValue },
    agentPreset: { name: agentPresetRecord.manifest.name, version: agentPresetRecord.manifest.version, manifest: agentPresetRecord.realManifestPath, entry: agentPresetEntry.realEntry, entryUrl: agentPresetEntry.url, exportValue: agentPresetEntry.exportValue },
    agentPresetRegistry: { name: registryRecord.manifest.name, version: registryRecord.manifest.version, manifest: registryRecord.realManifestPath, entry: registryEntry.realEntry, exportValue: registryEntry.exportValue },
    requireResolved,
  }
}

function basenameOf(value) {
  return process.platform === 'win32' ? value.split(/[\\/]/).pop() : value.split('/').pop()
}

function childResult(label, args, env, cwd, usePreload = true) {
  const captureDir = join(cwd, '.path-boundary-capture-' + label)
  mkdirSync(captureDir, { recursive: true })
  const stdoutPath = join(captureDir, 'stdout.log')
  const stderrPath = join(captureDir, 'stderr.log')
  const stdoutFd = openSync(stdoutPath, 'w')
  const stderrFd = openSync(stderrPath, 'w')
  const commandArgs = usePreload ? ['--import', pathToFileURL(HOST_PRELOAD).href, ...args] : args
  let result
  try {
    result = spawnSync(process.execPath, commandArgs, { cwd, env, timeout: 120000, stdio: ['ignore', stdoutFd, stderrFd] })
  } finally {
    closeSync(stdoutFd)
    closeSync(stderrFd)
  }
  const stdout = readFileSync(stdoutPath, 'utf8')
  const stderr = readFileSync(stderrPath, 'utf8')
  const error = result.error === undefined ? null : errorShape(result.error)
  rmSync(captureDir, { recursive: true, force: true })
  const command = { label, command: [process.execPath, ...commandArgs], cwd, status: result.status, signal: result.signal, error, stdout, stderr }
  commandRecords.push({ ...command, rawPaths: ['raw/' + label + '.stdout.log', 'raw/' + label + '.stderr.log'] })
  return command
}

function commandHasFatalText(result) {
  const text = result.stdout + '\n' + result.stderr
  return /SyntaxError|UnhandledPromiseRejection|ETIMEDOUT/.test(text) || result.error?.code === 'ETIMEDOUT'
}

async function main() {
  const reportArgs = parseReportArgs(process.argv.slice(2))
  EVIDENCE_ROOT = prepareEvidenceRoot(reportArgs)
  const previousEnv = {}
  const envKeys = ['DSH_HOME', 'DSH_PROFILE', 'HOME', 'USERPROFILE', 'APPDATA', 'LOCALAPPDATA', 'XDG_CACHE_HOME', 'DSH_EXTRA_PLAN_CAPTURE_DIR', 'DSH_EXTRA_PLAN_REPORT_DIR', 'TEMP', 'TMP', 'TMPDIR', 'SESSION_ID']
  for (const key of envKeys) previousEnv[key] = process.env[key]
  let fixture = null
  try {
    fixture = makeFixtureDir({ label: 'path-boundary' })
    const hostRoot = join(fixture.root, 'host-data')
    const workspaceRoot = join(fixture.root, 'workspace-root')
    const otherRoot = join(fixture.root, 'Other-simulated-root')
    const resourceDir = join(hostRoot, 'code-resource')
    mkdirSync(hostRoot, { recursive: true })
    mkdirSync(workspaceRoot, { recursive: true })
    mkdirSync(otherRoot, { recursive: true })
    mkdirSync(resourceDir, { recursive: true })
    const isolated = {
      DSH_HOME: hostRoot,
      HOME: join(fixture.root, 'home-fake'),
      USERPROFILE: join(fixture.root, 'userprofile-fake'),
      APPDATA: join(fixture.root, 'appdata-fake'),
      LOCALAPPDATA: join(fixture.root, 'localappdata-fake'),
      XDG_CACHE_HOME: fixture.cache,
      DSH_EXTRA_PLAN_CAPTURE_DIR: fixture.capture,
      DSH_EXTRA_PLAN_REPORT_DIR: fixture.report,
      TEMP: fixture.temp,
      TMP: fixture.temp,
      TMPDIR: fixture.temp,
    }
    for (const [key, value] of Object.entries(isolated)) process.env[key] = value
    delete process.env.SESSION_ID
    const installRootRaw = typeof process.env.DSH_INSTALL_ROOT === 'string' ? process.env.DSH_INSTALL_ROOT.trim() : ''
    let hostInfo = null
    const sourceBeforeSha = typeof process.env.DSH_G13_SOURCE_BEFORE_SHA === 'string' && /^[a-f0-9]{64}$/i.test(process.env.DSH_G13_SOURCE_BEFORE_SHA.trim())
      ? process.env.DSH_G13_SOURCE_BEFORE_SHA.trim().toLowerCase()
      : null
    const auditEntries = reportArgs.auditBaseline === null ? [] : (() => {
      const baselinePath = resolve(ROOT, reportArgs.auditBaseline)
      validateWorkspaceChain(baselinePath)
      const stat = lstatIfPresent(baselinePath)
      if (stat === null || !stat.isFile() || stat.isSymbolicLink()) throw reportError('AUDIT_BASELINE_INVALID', '审计基线必须是W内真实文件', { path: baselinePath })
      const baseline = JSON.parse(readFileSync(baselinePath, 'utf8'))
      const entries = sourceEntriesOf(baseline)
      if (!Array.isArray(entries) || entries.length > MAX_AUDIT_ENTRIES) throw reportError('AUDIT_BASELINE_LIMIT', '审计基线条目超过128或不是数组', { count: Array.isArray(entries) ? entries.length : null })
      return entries.map((entry) => ({ ...entry, baselinePath }))
    })()

    const context = corePaths.createPathContext({ workspaceRoot, hostDataRoot: hostRoot })
  const qqContext = qqPaths.createPathContext({ workspaceRoot, hostDataRoot: hostRoot })
  const ownFile = fixtureWrite(fixture.root, join(workspaceRoot, 'owned.txt'), 'owned-W\n')
  const hostFile = fixtureWrite(fixture.root, join(hostRoot, 'host-data.txt'), 'host-data\n')
  const resourceFile = fixtureWrite(fixture.root, join(resourceDir, 'read-only.txt'), 'host-code\n')
  const anchorFile = fixtureWrite(fixture.root, join(hostRoot, 'app-package.json'), JSON.stringify({ name: '@deepseek-ai/dsh', version: 'fixture-only' }) + '\n')
  const otherFile = fixtureWrite(fixture.root, join(otherRoot, 'Other-existing.txt'), 'Other fixture file\n')

  const calibration = fsSpy(() => { fs.statSync(workspaceRoot); return true })
  record('IO spy校准可观测statSync', { calibrated: true, statSync: 1 }, { calibrated: calibration.calibrated, statSync: calibration.counts.statSync }, calibration.calibrated && calibration.result === true && calibration.counts.statSync === 1)

  const maintenanceEnvOnly = fsSpy(() => parseMaintenanceArgs([]))
  record('维护env-only无授权无选择且零目标IO', { hostRoot: null, profile: null, session: 'none', ledger: 'none', requestTrace: null, io: 0 }, { hostRoot: maintenanceEnvOnly.result?.hostRoot || null, profile: maintenanceEnvOnly.result?.profile || null, session: maintenanceEnvOnly.result?.session?.mode || null, ledger: maintenanceEnvOnly.result?.ledger?.mode || null, requestTrace: maintenanceEnvOnly.result?.requestTrace || null, io: totalIo(maintenanceEnvOnly.counts) }, maintenanceEnvOnly.calibrated && maintenanceEnvOnly.result?.hostRoot === null && maintenanceEnvOnly.result?.profile === null && maintenanceEnvOnly.result?.session?.mode === 'none' && maintenanceEnvOnly.result?.ledger?.mode === 'none' && maintenanceEnvOnly.result?.requestTrace === null && totalIo(maintenanceEnvOnly.counts) === 0)
  const parsedMaintenance = capture(() => parseMaintenanceArgs(['--host-root', hostRoot, '--profile', 'web', '--session', 'session-a', '--sessions-dir', 'sessions', '--archive', 'archive-v2.jsonl', '--request-trace', 'request-trace.jsonl', '--', '--check']))
  record('parseMaintenanceArgs字段与domainArgv保持精确', { domainArgv: ['--check'], hostRoot, profile: 'web', session: { mode: 'id', id: 'session-a', sessionsDir: 'sessions' }, ledger: { mode: 'archive', archivePath: 'archive-v2.jsonl' }, requestTrace: 'request-trace.jsonl' }, { domainArgv: parsedMaintenance.value?.domainArgv, hostRoot: parsedMaintenance.value?.hostRoot, profile: parsedMaintenance.value?.profile, session: parsedMaintenance.value?.session ? { mode: parsedMaintenance.value.session.mode, id: parsedMaintenance.value.session.id, sessionsDir: parsedMaintenance.value.session.sessionsDir } : null, ledger: parsedMaintenance.value?.ledger ? { mode: parsedMaintenance.value.ledger.mode, archivePath: parsedMaintenance.value.ledger.archivePath } : null, requestTrace: parsedMaintenance.value?.requestTrace }, parsedMaintenance.ok && JSON.stringify(parsedMaintenance.value?.domainArgv) === JSON.stringify(['--check']) && parsedMaintenance.value.hostRoot === hostRoot && parsedMaintenance.value.profile === 'web' && parsedMaintenance.value.session?.mode === 'id' && parsedMaintenance.value.session?.id === 'session-a' && parsedMaintenance.value.session?.sessionsDir === 'sessions' && parsedMaintenance.value.ledger?.mode === 'archive' && parsedMaintenance.value.ledger?.archivePath === 'archive-v2.jsonl' && parsedMaintenance.value.requestTrace === 'request-trace.jsonl')
  const sameRootContext = corePaths.createPathContext({ workspaceRoot, hostDataRoot: workspaceRoot })
  const sameW = corePaths.resolveWorkspacePath(sameRootContext, 'owned.txt', { purpose: 'same-root-w' })
  const sameH = corePaths.resolveHostPath(sameRootContext, 'owned.txt', { purpose: 'same-root-h' })
  record('H=W时保持显式kind与用途隔离', { wKind: 'workspace', hKind: 'host', samePath: true }, { wKind: sameW.kind, hKind: sameH.kind, samePath: sameW.path === sameH.path }, sameW.kind === 'workspace' && sameH.kind === 'host' && sameW.path === sameH.path)
  const nestedHostRoot = join(workspaceRoot, 'nested-host')
  mkdirSync(nestedHostRoot, { recursive: true })
  const nestedContext = corePaths.createPathContext({ workspaceRoot, hostDataRoot: nestedHostRoot })
  const nestedW = corePaths.resolveWorkspacePath(nestedContext, 'nested-host/owned.txt', { purpose: 'containment-w' })
  const nestedH = corePaths.resolveHostPath(nestedContext, 'owned.txt', { purpose: 'containment-h' })
  record('H包含于W时不因相互包含混根', { wKind: 'workspace', hKind: 'host', distinctKind: true }, { wKind: nestedW.kind, hKind: nestedH.kind, distinctKind: nestedW.kind !== nestedH.kind }, nestedW.kind === 'workspace' && nestedH.kind === 'host' && nestedW.kind !== nestedH.kind)

  const ledgerLockModule = await import('../../plugins/dsh-extra-plan/lib/usage-ledger.js')
  const ledgerStep99 = await import('./step-99-用量统计.mjs')
  const ledgerMatrixRow = (sessionId) => JSON.stringify({ schemaVersion: 2, ts: '2026-01-01T00:00:00.000Z', sessionId, parentSessionId: '', rootSessionId: sessionId, agentPreset: '', delegationDepth: 0, role: 'reviewer', model: '', provider: '', inputTokens: 1, cacheReadTokens: 0, cacheWriteTokens: 0, outputTokens: 0, seq: 0 })
  const ledgerMatrixActive = fixtureWrite(fixture.root, join(workspaceRoot, 'ledger-matrix', 'ledger-v2.jsonl'), ledgerMatrixRow('matrix-w-row') + '\n')
  const ledgerNoHostContext = corePaths.createPathContext({ workspaceRoot })
  const ledgerStatW = await ledgerStep99.statLedger(ledgerMatrixActive, { pathContext: ledgerNoHostContext, purpose: 'ledger-read' })
  const ledgerWLockPath = ledgerLockModule.usageLedgerLockPath(ledgerMatrixActive)
  record('账本无H根W绝对统计命中真实文件身份', { sessionId: 'matrix-w-row', hostObservation: false, lockUnderW: true, lockResidue: false }, { sessionIds: ledgerStatW.rows.map((row) => row.sessionId), observationLevel: ledgerStatW.observationLevel === undefined ? null : ledgerStatW.observationLevel, lockUnderW: isWithin(workspaceRoot, ledgerWLockPath), lockResidue: existsSync(ledgerWLockPath) }, ledgerStatW.rows.some((row) => row.sessionId === 'matrix-w-row') && ledgerStatW.observationLevel === undefined && isWithin(workspaceRoot, ledgerWLockPath) && !existsSync(ledgerWLockPath))
  const ledgerChildCode = [
    "import { pathToFileURL } from 'node:url'",
    'const step99 = await import(pathToFileURL(process.env.LEDGER_STEP99).href)',
    'const { createPathContext } = await import(pathToFileURL(process.env.LEDGER_POLICY).href)',
    "const hostRootValue = process.env.LEDGER_HOST === '' ? null : process.env.LEDGER_HOST",
    'const contextValue = hostRootValue === null ? createPathContext({ workspaceRoot: process.env.LEDGER_WS }) : createPathContext({ workspaceRoot: process.env.LEDGER_WS, hostDataRoot: hostRootValue })',
    'try {',
    '  const result = await step99.statLedger(process.env.LEDGER_REL, { pathContext: contextValue, purpose: "ledger-read" })',
    '  process.stdout.write(JSON.stringify({ ok: true, sessionIds: result.rows.map((row) => row.sessionId) }))',
    '} catch (error) {',
    '  process.stdout.write(JSON.stringify({ ok: false, code: error && error.code || null, message: String(error && error.message || error) }))',
    '}',
  ].join('\n')
  const ledgerChildEnvBase = { ...process.env, LEDGER_STEP99: join(ROOT, 'pe-test', 'tools', 'step-99-用量统计.mjs'), LEDGER_POLICY: join(ROOT, 'plugins', 'dsh-extra-plan', 'lib', 'path-policy.js'), LEDGER_WS: workspaceRoot, LEDGER_REL: 'ledger-matrix/ledger-v2.jsonl' }
  const ledgerChildNoHost = childResult('ledger-rel-no-host', ['--input-type=module', '-e', ledgerChildCode], { ...ledgerChildEnvBase, LEDGER_HOST: '' }, workspaceRoot, false)
  writeEvidence('raw/ledger-rel-no-host.stdout.log', ledgerChildNoHost.stdout)
  writeEvidence('raw/ledger-rel-no-host.stderr.log', ledgerChildNoHost.stderr)
  const ledgerChildNoHostOut = capture(() => JSON.parse(ledgerChildNoHost.stdout))
  record('账本无H根相对输入隔离子进程固定W身份', { exit: 0, ok: true, sessionId: 'matrix-w-row', lockResidue: false, fatal: false }, { exit: ledgerChildNoHost.status, ok: ledgerChildNoHostOut.value?.ok || null, sessionIds: ledgerChildNoHostOut.value?.sessionIds || null, lockResidue: existsSync(ledgerWLockPath), fatal: commandHasFatalText(ledgerChildNoHost) }, ledgerChildNoHost.status === 0 && ledgerChildNoHostOut.value?.ok === true && ledgerChildNoHostOut.value?.sessionIds?.includes('matrix-w-row') === true && !existsSync(ledgerWLockPath) && !commandHasFatalText(ledgerChildNoHost))
  const ledgerChildWithHost = childResult('ledger-rel-with-host', ['--input-type=module', '-e', ledgerChildCode], { ...ledgerChildEnvBase, LEDGER_HOST: hostRoot }, workspaceRoot, false)
  writeEvidence('raw/ledger-rel-with-host.stdout.log', ledgerChildWithHost.stdout)
  writeEvidence('raw/ledger-rel-with-host.stderr.log', ledgerChildWithHost.stderr)
  const ledgerChildWithHostOut = capture(() => JSON.parse(ledgerChildWithHost.stdout))
  record('账本有H根相对输入不漂移仍命中W真实身份', { exit: 0, ok: true, sessionId: 'matrix-w-row', fatal: false }, { exit: ledgerChildWithHost.status, ok: ledgerChildWithHostOut.value?.ok || null, sessionIds: ledgerChildWithHostOut.value?.sessionIds || null, fatal: commandHasFatalText(ledgerChildWithHost) }, ledgerChildWithHost.status === 0 && ledgerChildWithHostOut.value?.ok === true && ledgerChildWithHostOut.value?.sessionIds?.includes('matrix-w-row') === true && !commandHasFatalText(ledgerChildWithHost))
  const ledgerSameRootWTarget = corePaths.resolveWorkspacePath(sameRootContext, ledgerMatrixActive, { purpose: 'ledger-read' })
  const ledgerSameRootHTarget = corePaths.resolveHostPath(sameRootContext, ledgerMatrixActive, { purpose: 'ledger-read' })
  const ledgerStatExplicitW = await ledgerStep99.statLedger(ledgerMatrixActive, { pathContext: sameRootContext, target: ledgerSameRootWTarget, purpose: 'ledger-read' })
  record('账本H=W显式W目标保持W锁统计不重贴H', { hostObservation: false, sessionId: 'matrix-w-row' }, { observationLevel: ledgerStatExplicitW.observationLevel === undefined ? null : ledgerStatExplicitW.observationLevel, sessionIds: ledgerStatExplicitW.rows.map((row) => row.sessionId) }, ledgerStatExplicitW.observationLevel === undefined && ledgerStatExplicitW.rows.some((row) => row.sessionId === 'matrix-w-row'))
  const ledgerStatExplicitH = await ledgerStep99.statLedger(ledgerMatrixActive, { pathContext: sameRootContext, target: ledgerSameRootHTarget, purpose: 'ledger-read' })
  record('账本显式Host只读目标保持H稳定观察不重贴W', { observationLevel: 'stable-read-only', scope: 'host', activeSha256: 'matrix-file' }, { observationLevel: ledgerStatExplicitH.observationLevel || null, scope: ledgerStatExplicitH.observation?.scope || null, activeSha256: ledgerStatExplicitH.observation?.activeSha256 || null }, ledgerStatExplicitH.observationLevel === 'stable-read-only' && ledgerStatExplicitH.observation?.scope === 'host' && ledgerStatExplicitH.observation?.activeSha256 === sha256File(ledgerMatrixActive))
  const ledgerNestedActive = fixtureWrite(fixture.root, join(nestedHostRoot, 'ledger-matrix', 'ledger-v2.jsonl'), ledgerMatrixRow('matrix-nested-row') + '\n')
  const ledgerNestedWTarget = corePaths.resolveWorkspacePath(nestedContext, ledgerNestedActive, { purpose: 'ledger-read' })
  const ledgerNestedStatW = await ledgerStep99.statLedger(ledgerNestedActive, { pathContext: nestedContext, target: ledgerNestedWTarget, purpose: 'ledger-read' })
  record('账本H嵌于W显式W目标W身份不混根', { hostObservation: false, sessionId: 'matrix-nested-row' }, { observationLevel: ledgerNestedStatW.observationLevel === undefined ? null : ledgerNestedStatW.observationLevel, sessionIds: ledgerNestedStatW.rows.map((row) => row.sessionId) }, ledgerNestedStatW.observationLevel === undefined && ledgerNestedStatW.rows.some((row) => row.sessionId === 'matrix-nested-row'))
  const ledgerNestedHTarget = corePaths.resolveHostPath(nestedContext, ledgerNestedActive, { purpose: 'ledger-read' })
  const ledgerNestedStatH = await ledgerStep99.statLedger(ledgerNestedActive, { pathContext: nestedContext, target: ledgerNestedHTarget, purpose: 'ledger-read' })
  record('账本H嵌于W显式H目标只读观察不混根', { observationLevel: 'stable-read-only', scope: 'host', activeSha256: 'nested-file' }, { observationLevel: ledgerNestedStatH.observationLevel || null, scope: ledgerNestedStatH.observation?.scope || null, activeSha256: ledgerNestedStatH.observation?.activeSha256 || null }, ledgerNestedStatH.observationLevel === 'stable-read-only' && ledgerNestedStatH.observation?.scope === 'host' && ledgerNestedStatH.observation?.activeSha256 === sha256File(ledgerNestedActive))
  const ledgerUnnormalized = join(workspaceRoot, 'ledger-matrix', 'lexical', '..', basenameOf(ledgerMatrixActive))
  const ledgerStatNormalized = await ledgerStep99.statLedger(ledgerUnnormalized, { pathContext: ledgerNoHostContext, purpose: 'ledger-read' })
  const ledgerUnnormalizedLockPath = ledgerLockModule.usageLedgerLockPath(ledgerUnnormalized)
  record('账本非规范化绝对输入按词法W解析不漂移', { sessionId: 'matrix-w-row', lockUnderW: true, lockResidue: false }, { sessionIds: ledgerStatNormalized.rows.map((row) => row.sessionId), lockUnderW: isWithin(workspaceRoot, ledgerUnnormalizedLockPath), lockResidue: existsSync(ledgerUnnormalizedLockPath) }, ledgerStatNormalized.rows.some((row) => row.sessionId === 'matrix-w-row') && isWithin(workspaceRoot, ledgerUnnormalizedLockPath) && !existsSync(ledgerUnnormalizedLockPath))

  const corePositive = corePaths.resolveWorkspacePath(context, 'owned.txt', { purpose: 'workspace-read' })
  const qqPositive = qqPaths.resolveWorkspacePath(qqContext, 'owned.txt', { purpose: 'workspace-read' })
  record('核心/QQ合法W值对拍且目标形状一致', { samePath: true, coreKind: 'workspace', qqKind: 'workspace', sameRelativePath: true }, { samePath: corePositive.path === qqPositive.path, coreKind: corePositive.kind, qqKind: qqPositive.kind, sameRelativePath: corePositive.relativePath === qqPositive.relativePath }, corePositive.path === qqPositive.path && corePositive.kind === 'workspace' && qqPositive.kind === 'workspace' && corePositive.relativePath === qqPositive.relativePath)
  record('W/H两根有效不同值不复用', { distinct: true, w: ownFile, h: hostFile }, { distinct: corePositive.path !== corePaths.resolveHostPath(context, 'host-data.txt', { purpose: 'host-read' }).path, w: corePositive.path, h: corePaths.resolveHostPath(context, 'host-data.txt', { purpose: 'host-read' }).path }, corePositive.path !== corePaths.resolveHostPath(context, 'host-data.txt', { purpose: 'host-read' }).path)

  const negativeCases = [
    ['空值', '', 'EMPTY_PATH'],
    ['环境变量百分号', '%APPDATA%/x', 'VARIABLE_PATH'],
    ['环境变量美元', '$HOME/x', 'VARIABLE_PATH'],
    ['家目录缩写', '~/x', 'VARIABLE_PATH'],
    ['NUL', 'bad' + String.fromCharCode(0) + 'x', 'NUL_PATH'],
    ['非法file URI', 'file:///tmp/x', 'INVALID_URI'],
    ['非法http URI', 'http://example.invalid/x', 'INVALID_URI'],
    ['drive-relative', 'C:relative.txt', 'DRIVE_RELATIVE'],
  ]
  for (const [name, value, expectedCode] of negativeCases) {
    const coreError = capture(() => corePaths.resolveWorkspacePath(context, value, { purpose: 'negative-' + name }))
    const qqError = capture(() => qqPaths.resolveWorkspacePath(qqContext, value, { purpose: 'negative-' + name }))
    record('核心/QQ拒绝' + name + '且错误码精确', { core: expectedCode, qq: expectedCode }, { core: coreError.error?.code || null, qq: qqError.error?.code || null }, coreError.error?.code === expectedCode && qqError.error?.code === expectedCode)
  }
  const prefixOutside = join(fixture.root, 'workspace-root-sibling')
  mkdirSync(prefixOutside, { recursive: true })
  const prefixCore = capture(() => corePaths.resolveWorkspacePath(context, prefixOutside, { purpose: 'prefix-outside' }))
  const prefixQq = capture(() => qqPaths.resolveWorkspacePath(qqContext, prefixOutside, { purpose: 'prefix-outside' }))
  record('根前缀相似的Other绝对路径仍拒绝', { core: 'ROOT_ESCAPE', qq: 'ROOT_ESCAPE' }, { core: prefixCore.error?.code || null, qq: prefixQq.error?.code || null }, prefixCore.error?.code === 'ROOT_ESCAPE' && prefixQq.error?.code === 'ROOT_ESCAPE')
  const rootMissing = capture(() => corePaths.createPathContext({}))
  const qqRootMissing = capture(() => qqPaths.createPathContext({}))
  record('缺根不猜默认目录', { core: 'ROOT_REQUIRED', qq: 'ROOT_REQUIRED' }, { core: rootMissing.error?.code || null, qq: qqRootMissing.error?.code || null }, rootMissing.error?.code === 'ROOT_REQUIRED' && qqRootMissing.error?.code === 'ROOT_REQUIRED')
  const noHostContext = corePaths.createPathContext({ workspaceRoot })
  const noHost = capture(() => corePaths.resolveHostPath(noHostContext, 'host-data.txt', { purpose: 'missing-host' }))
  const noHostQq = capture(() => qqPaths.resolveHostPath(qqPaths.createPathContext({ workspaceRoot }), 'host-data.txt', { purpose: 'missing-host' }))
  record('缺Host根拒绝而不回退W', { core: 'ROOT_REQUIRED', qq: 'ROOT_REQUIRED' }, { core: noHost.error?.code || null, qq: noHostQq.error?.code || null }, noHost.error?.code === 'ROOT_REQUIRED' && noHostQq.error?.code === 'ROOT_REQUIRED')
  const unavailableRoot = join(fixture.root, 'missing-root')
  const unavailableContext = corePaths.createPathContext({ workspaceRoot: unavailableRoot })
  const unavailable = capture(() => corePaths.validateReadTarget(unavailableContext, corePaths.resolveWorkspacePath(unavailableContext, 'missing.txt', { purpose: 'missing-root' }), { expectedType: 'file' }))
  record('存在性缺失只返回ROOT_UNAVAILABLE不试探第二根', { code: 'ROOT_UNAVAILABLE' }, { code: unavailable.error?.code || null }, unavailable.error?.code === 'ROOT_UNAVAILABLE')
  const missingTarget = capture(() => corePaths.validateReadTarget(context, corePaths.resolveWorkspacePath(context, 'not-created.txt', { purpose: 'read-missing' }), { expectedType: 'file' }))
  record('授权根内缺目标返回TARGET_MISSING', { code: 'TARGET_MISSING' }, { code: missingTarget.error?.code || null }, missingTarget.error?.code === 'TARGET_MISSING')
  const newTarget = corePaths.prepareWriteTarget(context, corePaths.resolveWorkspacePath(context, 'new-output.txt', { purpose: 'fixture-output' }), { expectedType: 'file', purpose: 'fixture-output' })
  record('解析/写准备不隐式建目录或文件', { exists: false, fileAbsent: true }, { exists: newTarget.exists, fileAbsent: !existsSync(newTarget.path) }, newTarget.exists === false && !existsSync(newTarget.path))

  const capContext = corePaths.createPathContext({
    workspaceRoot,
    hostDataRoot: hostRoot,
    hostCapabilities: {
      installAnchor: { path: anchorFile, type: 'file', access: 'read', purpose: 'install-anchor' },
      codeResource: { path: resourceDir, type: 'directory', access: 'read', purpose: 'host-code' },
    },
  })
  const anchorRead = capture(() => corePaths.validateReadTarget(capContext, corePaths.resolveHostPath(capContext, '', { capability: 'installAnchor', purpose: 'install-anchor' }), { expectedType: 'file' }))
  record('Host精确installAnchor只读读取通过', { exists: true, realPath: anchorFile }, { exists: anchorRead.value?.exists || false, realPath: anchorRead.value?.realPath || null }, anchorRead.value?.exists === true && anchorRead.value?.realPath === realpathSync(anchorFile))
  const anchorWrite = capture(() => corePaths.prepareWriteTarget(capContext, corePaths.resolveHostPath(capContext, '', { capability: 'installAnchor', purpose: 'install-anchor' }), { expectedType: 'file' }))
  record('Host代码/资源写入精确拒绝HOST_RESOURCE_READONLY', { code: 'HOST_RESOURCE_READONLY' }, { code: anchorWrite.error?.code || null }, anchorWrite.error?.code === 'HOST_RESOURCE_READONLY')
  const resourceWrite = capture(() => corePaths.prepareWriteTarget(capContext, corePaths.resolveHostPath(capContext, 'code-resource/read-only.txt', { purpose: 'host-code' }), { expectedType: 'file' }))
  record('Host目录资源子项写入拒绝HOST_RESOURCE_READONLY', { code: 'HOST_RESOURCE_READONLY' }, { code: resourceWrite.error?.code || null }, resourceWrite.error?.code === 'HOST_RESOURCE_READONLY')
  const hostBusiness = capture(() => corePaths.prepareWriteTarget(context, corePaths.resolveHostPath(context, 'business-output.txt', { purpose: 'business-data' }), { expectedType: 'file' }))
  record('Host业务数据用途显式提供时仅准备目标', { prepared: true, kind: 'host', exists: false }, { prepared: hostBusiness.ok, kind: hostBusiness.value?.kind || null, exists: hostBusiness.value?.exists ?? null }, hostBusiness.ok && hostBusiness.value?.kind === 'host' && hostBusiness.value?.exists === false)
  const hostNoPurpose = capture(() => corePaths.prepareWriteTarget(context, corePaths.resolveHostPath(context, 'no-purpose.txt'), { expectedType: 'file' }))
  record('Host写入缺用途精确拒绝PURPOSE_REQUIRED', { code: 'PURPOSE_REQUIRED' }, { code: hostNoPurpose.error?.code || null }, hostNoPurpose.error?.code === 'PURPOSE_REQUIRED')
  const wOutput = capture(() => corePaths.prepareWriteTarget(context, corePaths.resolveWorkspacePath(context, 'w-output.txt', { purpose: 'artifact' }), { expectedType: 'file', purpose: 'artifact' }))
  record('W工件目标可准备且不升级为Host', { kind: 'workspace', exists: false }, { kind: wOutput.value?.kind || null, exists: wOutput.value?.exists ?? null }, wOutput.ok && wOutput.value?.kind === 'workspace' && wOutput.value?.exists === false)

  const otherSpy = fsSpy(() => {
    const coreError = capture(() => corePaths.resolveWorkspacePath(context, otherFile, { purpose: 'Other' }))
    const qqError = capture(() => qqPaths.resolveWorkspacePath(qqContext, otherFile, { purpose: 'Other' }))
    return { coreCode: coreError.error?.code || null, qqCode: qqError.error?.code || null }
  })
  record('已存在Other文件拒绝前后exists/stat/readdir/read/write均为0', { core: 'OTHER_REJECTED', qq: 'OTHER_REJECTED', io: 0, otherExists: true }, { core: otherSpy.result?.coreCode || null, qq: otherSpy.result?.qqCode || null, io: totalIo(otherSpy.counts), otherExists: existsSync(otherFile) }, otherSpy.calibrated && otherSpy.result?.coreCode === 'OTHER_REJECTED' && otherSpy.result?.qqCode === 'OTHER_REJECTED' && totalIo(otherSpy.counts) === 0 && existsSync(otherFile))

  const outsideCwd = join(fixture.root, 'outside-effective-cwd')
  mkdirSync(outsideCwd, { recursive: true })
  const cwdEscape = capture(() => corePaths.resolveWorkspacePath(context, outsideCwd, { purpose: 'cwd-must-not-expand' }))
  record('有效cwd在根外不扩大授权', { code: 'ROOT_ESCAPE' }, { code: cwdEscape.error?.code || null }, cwdEscape.error?.code === 'ROOT_ESCAPE')

  const linkInsideTarget = join(workspaceRoot, 'real-inside')
  mkdirSync(linkInsideTarget, { recursive: true })
  const linkInside = join(workspaceRoot, 'inside-link')
  const linkOutside = join(workspaceRoot, 'outside-link')
  let linkReady = true
  let linkFailure = null
  try {
    symlinkSync(linkInsideTarget, linkInside, process.platform === 'win32' ? 'junction' : 'dir')
    symlinkSync(otherRoot, linkOutside, process.platform === 'win32' ? 'junction' : 'dir')
  } catch (error) {
    linkReady = false
    linkFailure = errorShape(error)
  }
  if (linkReady) {
    const linkRead = capture(() => corePaths.validateReadTarget(context, corePaths.resolveWorkspacePath(context, 'outside-link/escape.txt', { purpose: 'link-read' }), { expectedType: 'file' }))
    const linkWrite = capture(() => corePaths.prepareWriteTarget(context, corePaths.resolveWorkspacePath(context, 'outside-link/new.txt', { purpose: 'link-write' }), { expectedType: 'file', purpose: 'link-write' }))
    record('越界链接读取精确拒绝REALPATH_ESCAPE', { code: 'REALPATH_ESCAPE' }, { code: linkRead.error?.code || null }, linkRead.error?.code === 'REALPATH_ESCAPE')
    record('越界链接写入精确拒绝REALPATH_ESCAPE', { code: 'REALPATH_ESCAPE' }, { code: linkWrite.error?.code || null }, linkWrite.error?.code === 'REALPATH_ESCAPE')
  } else if (linkFailure?.code === 'EPERM' || linkFailure?.code === 'EACCES') {
    markNotRun('native链接真实realpath场景', { code: 'REALPATH_ESCAPE/LINK_WRITE_REJECTED' }, linkFailure, '环境未提供junction/symlink权限；EPERM/EACCES不作路径护栏PASS')
  } else {
    record('native链接真实realpath场景可建立', { created: true }, { created: false, error: linkFailure }, false)
  }

  const projectCases = [
    ['project with spaces # one', 'space-root'],
    ['项目中文#二', 'unicode-root'],
  ]
  for (const [projectName, marker] of projectCases) {
    const projectRoot = join(fixture.root, projectName)
    const projectOwned = join(projectRoot, 'owned-source.mjs')
    mkdirSync(join(projectRoot, 'pe-test', 'tools'), { recursive: true })
    copyFileSync(THIS_SOURCE, join(projectRoot, 'pe-test', 'tools', 'step-00-路径边界.mjs'))
    fixtureWrite(fixture.root, projectOwned, 'export const marker = ' + JSON.stringify(marker) + '\n')
    const projectContext = corePaths.createPathContext({ workspaceRoot: projectRoot })
    const target = corePaths.validateReadTarget(projectContext, corePaths.resolveWorkspacePath(projectContext, 'owned-source.mjs', { purpose: 'dynamic-project-source' }), { expectedType: 'file' })
    const imported = await import(pathToFileURL(target.realPath).href + '?path-boundary=' + encodeURIComponent(marker))
    const entries = fs.readdirSync(projectRoot).sort()
    record('改名最小项目树动态W解析：' + projectName, { marker, onlyOwnSourceTree: true, rootNamePreserved: true }, { marker: imported.marker, onlyOwnSourceTree: !entries.includes('node_modules') && !entries.includes('plugins'), rootNamePreserved: basenameOf(projectRoot) === projectName }, imported.marker === marker && !entries.includes('node_modules') && !entries.includes('plugins') && basenameOf(projectRoot) === projectName)
  }

  const urlFile = fixtureWrite(fixture.root, join(workspaceRoot, 'URL 空格中文#百分号%.txt'), 'url-roundtrip\n')
  const url = pathToFileURL(urlFile).href
  const roundTrip = urlFileURLToPath(url)
  record('空格中文#百分号file URL正规往返', { path: urlFile, roundTrip: urlFile }, { path: urlFile, roundTrip }, roundTrip === urlFile && url.includes('%20') && url.includes('%23'))

  const pathScanTargets = [
    'plugins/dsh-extra-plan/lib/path-policy.js',
    'plugins/dsh-extra-plan-qqbot/lib/path-policy.js',
    'plugins/dsh-extra-plan/index.js',
    'plugins/dsh-extra-plan-qqbot/index.js',
    'plugins/dsh-extra-plan-qqbot/lib/heal.js',
    'plugins/dsh-extra-plan-qqbot/scripts/heal.mjs',
    'plugins/dsh-extra-plan/lib/usage-ledger.js',
    'plugins/dsh-extra-plan/lib/qqbot-settings-sync.js',
    'plugins/dsh-extra-plan/lib/settings.js',
    'plugins/dsh-extra-plan/lib/live-config.js',
    'plugins/dsh-extra-plan/lib/preset-sync.js',
    'plugins/dsh-extra-plan/lib/save-persistence.js',
    'plugins/dsh-extra-plan/lib/save-probe-validation.js',
    'plugins/dsh-extra-plan/lib/save-tool-factories.js',
    'plugins/dsh-extra-plan/scripts/generate-runtime-defaults.mjs',
    'pe-test/_shared/workspace-paths.mjs',
    'pe-test/_shared/session-finder.mjs',
    'pe-test/_shared/host-deps.mjs',
    'pe-test/tools/step-01-qqbot-环境验证.mjs',
    'pe-test/tools/step-99-用量统计.mjs',
    'pe-test/tools/代码地图生成.mjs',
    'pe-test/tools/step-00-跨平台写拦截.mjs',
  ]
  function codeOnlySource(text) {
    let state = 'code'
    let quote = null
    let escape = false
    let out = ''
    for (let index = 0; index < text.length; index += 1) {
      const current = text[index]
      const next = text[index + 1]
      if (state === 'line-comment') {
        if (current === '\n') { state = 'code'; out += current }
        else out += ' '
        continue
      }
      if (state === 'block-comment') {
        if (current === '*' && next === '/') { state = 'code'; out += '  '; index += 1 }
        else out += current === '\n' ? '\n' : ' '
        continue
      }
      if (state === 'string') {
        if (escape) { escape = false; out += current === '\n' ? '\n' : ' '; continue }
        if (current === '\\') { escape = true; out += ' '; continue }
        if (current === quote) { state = 'code'; quote = null }
        out += current === '\n' ? '\n' : ' '
        continue
      }
      if (current === '/' && next === '/') { state = 'line-comment'; out += '  '; index += 1; continue }
      if (current === '/' && next === '*') { state = 'block-comment'; out += '  '; index += 1; continue }
      if (current === '\'' || current === '"' || current === String.fromCharCode(96)) { state = 'string'; quote = current; out += ' '; continue }
      out += current
    }
    return out
  }
  const forbidden = /(?:os\.(?:tmpdir|homedir|userInfo)\s*\(|process\.cwd\s*\(\s*\))/g
  const scanResults = []
  for (const relativePath of pathScanTargets) {
    const filePath = join(ROOT, relativePath)
    const scanned = capture(() => {
      const text = readFileSync(filePath, 'utf8')
      const code = codeOnlySource(text)
      const hits = []
      for (const match of code.matchAll(forbidden)) hits.push({ index: match.index, text: match[0], line: code.slice(0, match.index).split(/\r?\n/).length })
      return hits
    })
    scanResults.push({ path: relativePath, forbiddenHits: scanned.ok ? scanned.value : [], error: scanned.error })
  }
  const forbiddenHitCount = scanResults.reduce((sum, item) => sum + item.forbiddenHits.length, 0)
  const scanOk = scanResults.every((item) => item.error === null && item.forbiddenHits.length === 0)
  record('主动取址22源代码区辅助扫描；行为spy才是零IO判据', { targetCount: 22, forbiddenHitCount: 0, auxiliary: true }, { targetCount: pathScanTargets.length, forbiddenHitCount, auxiliary: true, errors: scanResults.filter((item) => item.error !== null).length }, scanOk && pathScanTargets.length === 22, { auxiliary: true })

  try {
    const coreManifest = JSON.parse(readFileSync(join(ROOT, 'plugins', 'dsh-extra-plan', 'package.json'), 'utf8'))
    record('核心package.json JSON.parse及安装锚版本声明', { name: 'dsh-extra-plan', parsed: true }, { name: coreManifest.name, parsed: coreManifest.name === 'dsh-extra-plan' }, coreManifest.name === 'dsh-extra-plan')
    const qqManifest = JSON.parse(readFileSync(join(ROOT, 'plugins', 'dsh-extra-plan-qqbot', 'package.json'), 'utf8'))
    record('QQ package.json JSON.parse及安装锚版本声明', { name: 'dsh-extra-plan-qqbot', parsed: true }, { name: qqManifest.name, parsed: qqManifest.name === 'dsh-extra-plan-qqbot' }, qqManifest.name === 'dsh-extra-plan-qqbot')
  } catch (error) {
    record('两个项目manifest JSON.parse', { parsed: true }, { parsed: false, error: errorShape(error) }, false)
  }

  const qqModule = await import('../../plugins/dsh-extra-plan-qqbot/lib/heal.js')
  const runtimeRoot = qqModule.resolveQqbotHostRoot({ profileContext: { home: hostRoot }, dshHomePath: () => hostRoot })
  const runtimeConflict = qqModule.resolveQqbotHostRoot({ profileContext: { home: hostRoot }, dshHomePath: () => otherRoot })
  const runtimeMissing = qqModule.resolveQqbotHostRoot({})
  const runtimeInvalid = qqModule.resolveQqbotHostRoot({ profileContext: { home: '%APPDATA%' } })
  record('运行时Host根同源返回绝对根', { root: realpathSync(hostRoot), source: 'profileContext.home+dshHomePath()' }, { root: runtimeRoot.root, source: runtimeRoot.source }, runtimeRoot.root === realpathSync(hostRoot) && runtimeRoot.source === 'profileContext.home+dshHomePath()')
  record('运行时Host根冲突拒绝不并集', { reason: 'host-root-conflict' }, { reason: runtimeConflict.reason }, runtimeConflict.reason === 'host-root-conflict')
  record('运行时缺根独立返回host-root-required', { reason: 'host-root-required' }, { reason: runtimeMissing.reason }, runtimeMissing.reason === 'host-root-required')
  record('运行时非法根独立返回host-root-invalid', { reason: 'host-root-invalid' }, { reason: runtimeInvalid.reason }, runtimeInvalid.reason === 'host-root-invalid')
  const runtimeWeb = qqModule.resolveQqbotHostRoot({ profileContext: { home: hostRoot, name: 'web', startedBundles: [] }, dshHomePath: () => hostRoot })
  const runtimeQq = qqModule.resolveQqbotHostRoot({ profileContext: { home: hostRoot, name: 'qqbot', startedBundles: ['@tencent-connect/dsh-qqbot'] }, dshHomePath: () => hostRoot })
  const runtimeUnknown = qqModule.resolveQqbotHostRoot({ profileContext: { home: hostRoot, name: 'mystery', startedBundles: [] }, dshHomePath: () => hostRoot })
  const runtimeProfileConflict = qqModule.resolveQqbotHostRoot({ profileContext: { home: hostRoot, name: 'web', startedBundles: ['@tencent-connect/dsh-qqbot'] }, dshHomePath: () => hostRoot })
  record('运行时Web身份有效且不误入QQ', { kind: 'web', state: 'valid' }, { kind: runtimeWeb.profileKind, state: runtimeWeb.profileIdentityState }, runtimeWeb.profileKind === 'web' && runtimeWeb.profileIdentityState === 'valid')
  record('运行时QQ身份有效且不误入Web', { kind: 'qqbot', state: 'valid' }, { kind: runtimeQq.profileKind, state: runtimeQq.profileIdentityState }, runtimeQq.profileKind === 'qqbot' && runtimeQq.profileIdentityState === 'valid')
  record('运行时未知身份保留unknown', { kind: 'unknown', state: 'unknown' }, { kind: runtimeUnknown.profileKind, state: runtimeUnknown.profileIdentityState }, runtimeUnknown.profileKind === 'unknown' && runtimeUnknown.profileIdentityState === 'unknown')
  record('运行时冲突身份保留conflict', { kind: 'unknown', state: 'conflict' }, { kind: runtimeProfileConflict.profileKind, state: runtimeProfileConflict.profileIdentityState }, runtimeProfileConflict.profileKind === 'unknown' && runtimeProfileConflict.profileIdentityState === 'conflict')
  const settingsSync = await import('../../plugins/dsh-extra-plan/lib/qqbot-settings-sync.js')
  const synchronizer = settingsSync.createQqbotSettingsSynchronizer()
  const webQueueInput = { profileFacts: { name: 'web', startedBundles: [] }, snapshot: {}, saveRunId: 'queue-run-1', syncRevision: 1, trigger: 'path-boundary' }
  const receiptOnePromise = synchronizer.enqueue(webQueueInput)
  const receiptTwoPromise = synchronizer.enqueue(webQueueInput)
  const [receiptOne, receiptTwo] = await Promise.all([receiptOnePromise, receiptTwoPromise])
  record('Web同步队列相同身份关联返回同一回执', { samePromise: true, status: 'failed', saveRunId: 'queue-run-1' }, { samePromise: receiptOnePromise === receiptTwoPromise, status: receiptOne.status, saveRunId: receiptOne.request?.saveRunId || null, terminalMatch: receiptOne.terminalMatch }, receiptOnePromise === receiptTwoPromise && receiptOne.status === 'failed' && receiptOne.request?.saveRunId === 'queue-run-1' && receiptOne.terminalMatch === false && receiptTwo.request?.saveRunId === receiptOne.request?.saveRunId)
  const qqTerminal = await synchronizer.enqueue({ profileFacts: { name: 'qqbot', startedBundles: ['@tencent-connect/dsh-qqbot'] }, snapshot: {}, saveRunId: 'qq-terminal', syncRevision: 1, trigger: 'path-boundary' })
  record('QQ同步队列回执明确not-applicable且不执行Web', { status: 'not-applicable', profileKind: 'qqbot', terminalMatch: false, saveRunId: 'qq-terminal' }, { status: qqTerminal.status, profileKind: qqTerminal.profileKind, terminalMatch: qqTerminal.terminalMatch, saveRunId: qqTerminal.request?.saveRunId || null }, qqTerminal.status === 'not-applicable' && qqTerminal.profileKind === 'qqbot' && qqTerminal.terminalMatch === false && qqTerminal.request?.saveRunId === 'qq-terminal')

  const qqHome = join(fixture.root, 'qq-home')
  const qqWeb = join(qqHome, 'profiles', 'web', 'node_modules', 'dsh-extra-plan')
  const qqProfile = join(qqHome, 'profiles', 'qq-profile')
  const qqOwn = join(qqProfile, 'node_modules', 'dsh-extra-plan-qqbot')
  fixtureWrite(fixture.root, join(qqWeb, 'package.json'), '{"name":"dsh-extra-plan","version":"fixture"}\n')
  fixtureWrite(fixture.root, join(qqProfile, 'package.json'), JSON.stringify({ name: 'qq-profile', dsh: { profile: { bundles: ['@tencent-connect/dsh-qqbot'] } } }) + '\n')
  mkdirSync(dirname(qqOwn), { recursive: true })
  symlinkSync(join(ROOT, 'plugins', 'dsh-extra-plan-qqbot'), qqOwn, process.platform === 'win32' ? 'junction' : 'dir')
  const qqFixtureContext = qqPaths.createPathContext({ hostDataRoot: qqHome })
  const ownProfiles = qqModule.findOwnQqbotProfiles(qqHome, { context: qqFixtureContext })
  record('QQ仅发现自有profile且根来自fixture', { profiles: ['qq-profile'], onlyFixture: true }, { profiles: ownProfiles, onlyFixture: ownProfiles.every((name) => isWithin(fixture.root, join(qqHome, 'profiles', name))) }, sameValue(ownProfiles, ['qq-profile']) && ownProfiles.every((name) => isWithin(fixture.root, join(qqHome, 'profiles', name))))
  const qqLinkTarget = join(qqProfile, 'node_modules', 'dsh-extra-plan')
  const preview = qqModule.ensureDshExtraPlanLink(qqHome, 'qq-profile', { context: qqFixtureContext, dryRun: true })
  record('QQ preview只计算fixture目标且零发布', { status: 'planned', targetAbsent: true }, { status: preview.status, targetAbsent: !existsSync(qqLinkTarget) }, preview.status === 'planned' && !existsSync(qqLinkTarget))
  const applyResult = qqModule.ensureDshExtraPlanLink(qqHome, 'qq-profile', { context: qqFixtureContext })
  if (applyResult.status === 'failed' && (String(applyResult.error || '').includes('EPERM') || String(applyResult.error || '').includes('EACCES'))) {
    markNotRun('QQ apply真实fixture映射', { status: 'linked/up-to-date' }, applyResult, '环境链接能力受阻；EPERM/EACCES不作QQ路径PASS')
  } else {
    const appliedReal = existsSync(qqLinkTarget) ? nativeRealpathSync(qqLinkTarget) : null
    const qqWebReal = nativeRealpathSync(qqWeb)
    record('QQ apply只写fixture且最终realpath指向web', { status: 'linked', realPath: qqWebReal }, { status: applyResult.status, realPath: appliedReal }, (applyResult.status === 'linked' || applyResult.status === 'up-to-date') && appliedReal === qqWebReal && isWithin(fixture.root, appliedReal))
  }
  const secondApply = qqModule.ensureDshExtraPlanLink(qqHome, 'qq-profile', { context: qqFixtureContext })
  record('QQ自有根重复apply保持up-to-date不换根', { status: 'up-to-date' }, { status: secondApply.status }, secondApply.status === 'up-to-date')

  if (installRootRaw === '') {
    markNotRun('显式DSH_INSTALL_ROOT真实包核验', { installRoot: 'D:/AI项目/dsh-v0.2.1-rc.4' }, { installRoot: null }, '正式命令未通过host-preload')
  } else {
    try {
      hostInfo = hostPackages(installRootRaw)
      record('真实Host dsh/dsh-llm/AgentPreset版本入口/installAnchor/realpath', { dsh: '0.2.1-rc.4', llm: '0.2.1-rc.4', agentPreset: '0.2.1-rc.4', dshPackagePresentWithoutDotExport: true, installAnchorBasename: 'package.json', root: realpathSync(installRootRaw) }, { dsh: hostInfo.dsh.version, llm: hostInfo.llm.version, agentPreset: hostInfo.agentPreset.version, dshPackagePresentWithoutDotExport: hostInfo.dsh.packagePresentWithoutDotExport, installAnchorBasename: basenameOf(hostInfo.installAnchor), root: hostInfo.root }, hostInfo.dsh.version === '0.2.1-rc.4' && hostInfo.llm.version === '0.2.1-rc.4' && hostInfo.agentPreset.version === '0.2.1-rc.4' && hostInfo.dsh.packagePresentWithoutDotExport === true && basenameOf(hostInfo.installAnchor) === 'package.json' && hostInfo.root === realpathSync(installRootRaw))
      record('dsh无“.”导出不等于包不存在且入口可证明', { packagePresent: true, dotExportPresent: false, entryFile: true }, { packagePresent: hostInfo.dsh.packagePresentWithoutDotExport, dotExportPresent: hostInfo.dsh.dotExportPresent, entryFile: statSync(hostInfo.dsh.entry).isFile() }, hostInfo.dsh.packagePresentWithoutDotExport === true && hostInfo.dsh.dotExportPresent === false && statSync(hostInfo.dsh.entry).isFile())
      writeEvidence('raw/host-packages.json', JSON.stringify(hostInfo, null, 2) + '\n')
    } catch (error) {
      record('真实Host dsh/dsh-llm/AgentPreset版本入口/installAnchor/realpath', { readable: true }, { readable: false, error: errorShape(error) }, false)
    }
  }

  const dynamicHostDeps = await import('../_shared/host-deps.mjs')
  const retryOne = capture(() => dynamicHostDeps.registerHostDeps())
  if (retryOne.ok && retryOne.value && typeof retryOne.value.then === 'function') await retryOne.value
  const retryTwo = capture(() => dynamicHostDeps.registerHostDeps())
  if (retryTwo.ok && retryTwo.value && typeof retryTwo.value.then === 'function') await retryTwo.value
  record('Host注册同根重试幂等且不复用未知根', { first: 'resolve', second: 'resolve' }, { first: retryOne.error?.code || 'resolve', second: retryTwo.error?.code || 'resolve' }, retryOne.ok && retryTwo.ok)
  const alternateRoot = join(fixture.root, 'registration-root-different')
  mkdirSync(alternateRoot, { recursive: true })
  const registrationEnv = { ...process.env, DSH_INSTALL_ROOT: alternateRoot }
  const differentRegistration = childResult('register-different-root', ['-e', ''], registrationEnv, fixture.root, true)
  writeEvidence('raw/register-different-root.stdout.log', differentRegistration.stdout)
  writeEvidence('raw/register-different-root.stderr.log', differentRegistration.stderr)
  record('Host注册不同根失败为真实宿主缺失而非EPERM/EACCES', { exit: 1, message: '未找到宿主真包' }, { exit: differentRegistration.status, message: differentRegistration.stderr.includes('未找到宿主真包') ? '未找到宿主真包' : differentRegistration.stderr.slice(0, 240), fatalText: commandHasFatalText(differentRegistration) }, differentRegistration.status === 1 && differentRegistration.stderr.includes('未找到宿主真包') && !commandHasFatalText(differentRegistration))

  if (hostInfo !== null) {
    const hookBuilder = dynamicHostDeps.buildAsyncHookSource
    const hookRoots = [join(hostInfo.root, 'node_modules')]
    const realHookSource = hookBuilder({ target: '@deepseek-ai/dsh-llm', anchor: hostInfo.llm.entryUrl, yaml: null, roots: hookRoots, strictRoot: hostInfo.root })
    const realHookPath = writeEvidence('raw/hook-source-real.mjs', realHookSource + '\n')
    const realHook = await import(pathToFileURL(realHookPath).href + '?path-boundary=real-hook')
    const realResolved = await realHook.resolve('@deepseek-ai/dsh-llm', {}, async () => ({ url: 'file:///unexpected-next.mjs' }))
    const builtinResolved = await realHook.resolve('node:fs', {}, async () => ({ url: 'node:fs', shortCircuit: true }))
    const dataResolved = await realHook.resolve('data:text/javascript,export default 1', {}, async () => ({ url: 'data:text/javascript,export default 1', shortCircuit: true }))
    const wOwned = pathToFileURL(ownFile).href
    const wResolved = await realHook.resolve('./owned.txt', { parentURL: wOwned }, async () => ({ url: wOwned, shortCircuit: true }))
    record('生成hookSource ESM回放：真实Host file URL通过', { file: true, withinInstallRoot: true }, { file: typeof realResolved?.url === 'string' && realResolved.url.startsWith('file:'), withinInstallRoot: typeof realResolved?.url === 'string' && isWithin(hostInfo.root, urlFileURLToPath(realResolved.url)) }, typeof realResolved?.url === 'string' && realResolved.url.startsWith('file:') && isWithin(hostInfo.root, urlFileURLToPath(realResolved.url)))
    record('生成hookSource ESM回放：builtin/node透传', { url: 'node:fs' }, { url: builtinResolved?.url || null }, builtinResolved?.url === 'node:fs')
    record('生成hookSource ESM回放：W import透传', { url: wOwned }, { url: wResolved?.url || null }, wResolved?.url === wOwned)
    record('生成hookSource ESM回放：data透传', { url: 'data:text/javascript,export default 1' }, { url: dataResolved?.url || null }, dataResolved?.url === 'data:text/javascript,export default 1')
    const badHookCases = [
      ['data-host', 'data:text/javascript,export default 1'],
      ['node-host', 'node:fs'],
      ['no-url-host', null],
    ]
    for (const [name, badAnchor] of badHookCases) {
      const badSource = hookBuilder({ target: '@deepseek-ai/dsh-llm', anchor: badAnchor, yaml: null, roots: hookRoots, strictRoot: hostInfo.root })
      const badPath = writeEvidence('raw/hook-source-' + name + '.mjs', badSource + '\n')
      const badHook = await import(pathToFileURL(badPath).href + '?path-boundary=' + name)
      const bad = await captureAsync(() => badHook.resolve('@deepseek-ai/dsh-llm', {}, async () => ({ url: 'file:///next.mjs' })))
      record('Host data/node/no-url结果精确拒绝：' + name, { message: 'Host请求必须解析为file URL' }, { message: bad.error?.message?.includes('Host请求必须解析为file URL') ? 'Host请求必须解析为file URL' : bad.error?.message || null, code: bad.error?.code || null }, bad.error?.message?.includes('Host请求必须解析为file URL') === true && !/EPERM|EACCES|ETIMEDOUT/.test(bad.error?.message || ''))
    }
  }

  const sessionFinder = await import('../_shared/session-finder.mjs')
  const previousSessionId = process.env.SESSION_ID
  delete process.env.SESSION_ID
  const noArgSession = fsSpy(() => ({ result: sessionFinder.findSession(undefined, { pathContext: context }) }))
  record('无参会话定位返回none且零会话IO', { kind: 'none', selected: false, io: 0 }, { kind: noArgSession.result?.result?.kind || null, selected: noArgSession.result?.result?.selected || false, io: totalIo(noArgSession.counts) }, noArgSession.calibrated && noArgSession.result?.result?.kind === 'none' && noArgSession.result?.result?.selected === false && totalIo(noArgSession.counts) === 0)
  const sessionDir = join(workspaceRoot, 'sessions', 'explicit-session')
  fixtureWrite(fixture.root, join(sessionDir, 'session.v4.jsonl.zstd'), '{}\n')
  const explicitSession = sessionFinder.findSession(sessionDir, { pathContext: context, pathKind: 'workspace' })
  record('显式会话只定位指定W目录', { kind: 'explicit', pathKind: 'workspace', dir: 'explicit-session' }, { kind: explicitSession.kind, pathKind: explicitSession.pathKind, dir: explicitSession.dirs?.[0] || null }, explicitSession.kind === 'explicit' && explicitSession.pathKind === 'workspace' && explicitSession.dirs?.[0] === 'explicit-session')
  const siblingDir = join(workspaceRoot, 'sessions', 'sibling-session')
  fixtureWrite(fixture.root, join(siblingDir, 'session.v4.jsonl.zstd'), 'sibling-bad-header')
  const preciseSpy = fsSpy(() => sessionFinder.findSession(sessionDir, { pathContext: context, pathKind: 'workspace' }))
  record('精确会话选择不读取兄弟坏头', { kind: 'explicit', readBytes: 0, readSync: 0 }, { kind: preciseSpy.result?.kind || null, readBytes: preciseSpy.readBytes, readSync: preciseSpy.counts.readSync }, preciseSpy.calibrated && preciseSpy.result?.kind === 'explicit' && preciseSpy.readBytes === 0 && preciseSpy.counts.readSync === 0)
  const discoveryRoot = join(workspaceRoot, 'sessions', 'discovery-root')
  const discoveryMain = join(discoveryRoot, 'main')
  const discoveryChild = join(discoveryRoot, 'child-bad')
  fixtureWrite(fixture.root, join(discoveryMain, 'session.v4.jsonl.zstd'), 'main-header')
  fixtureWrite(fixture.root, join(discoveryChild, 'session.v4.jsonl.zstd'), 'not-a-zstd-frame')
  const discoveryTarget = corePaths.resolveWorkspacePath(context, discoveryRoot, { purpose: 'session-root-read' })
  const discoveryView = { kind: 'workspace', path: discoveryTarget.path, policyTarget: discoveryTarget }
  const discoverySpy = fsSpy(() => sessionFinder.findSession(undefined, { pathContext: context, session: { mode: 'id', id: 'main', rootTarget: discoveryView, target: discoveryView, discoverChildren: true, maxCandidates: 128, maxCompressedBytesPerLog: 32 } }))
  record('会话发现坏头返回INCOMPLETE且按实际字节读取', { kind: 'incomplete', readBytes: 1, readSync: 1 }, { kind: discoverySpy.result?.kind || null, readBytes: discoverySpy.readBytes, readSync: discoverySpy.counts.readSync }, discoverySpy.calibrated && discoverySpy.result?.kind === 'incomplete' && discoverySpy.readBytes > 0 && discoverySpy.counts.readSync > 0)
  if (previousSessionId === undefined) delete process.env.SESSION_ID
  else process.env.SESSION_ID = previousSessionId

  const usageLedger = await import('../../plugins/dsh-extra-plan/lib/usage-ledger.js')
  const activeLedger = join(workspaceRoot, '.extra-plan', 'ledger-v2.jsonl')
  mkdirSync(dirname(activeLedger), { recursive: true })
  writeFileSync(activeLedger, '', 'utf8')
  const lockContext = corePaths.createPathContext({ workspaceRoot })
  const lockOne = usageLedger.acquireUsageLedgerLock(activeLedger, { pathContext: lockContext, purpose: 'path-boundary-lock', timeoutMs: 0 })
  const lockTwo = usageLedger.acquireUsageLedgerLock(activeLedger, { pathContext: lockContext, purpose: 'path-boundary-lock', timeoutMs: 0 })
  const released = usageLedger.releaseUsageLedgerLock(lockOne)
  record('账本锁只落W且同一根第二获取超时', { first: true, second: 'timeout', released: true, lockUnderW: true }, { first: lockOne.acquired, second: lockTwo.reason || null, released: released.released, lockUnderW: isWithin(workspaceRoot, usageLedger.usageLedgerLockPath(activeLedger)) }, lockOne.acquired === true && lockTwo.acquired === false && lockTwo.reason === 'timeout' && released.released === true && isWithin(workspaceRoot, usageLedger.usageLedgerLockPath(activeLedger)))
  record('账本锁释放后无残留lock/stale', { lock: false, stale: false }, { lock: existsSync(usageLedger.usageLedgerLockPath(activeLedger)), stale: existsSync(usageLedger.usageLedgerLockPath(activeLedger) + '.stale') }, !existsSync(usageLedger.usageLedgerLockPath(activeLedger)) && !existsSync(usageLedger.usageLedgerLockPath(activeLedger) + '.stale'))

  const ledgerIoRow = (sessionId, seq) => JSON.stringify({ schemaVersion: 2, ts: '2026-01-02T00:00:00.000Z', sessionId, parentSessionId: '', rootSessionId: sessionId, agentPreset: '', delegationDepth: 0, role: 'executor', model: '', provider: '', inputTokens: 2, cacheReadTokens: 0, cacheWriteTokens: 0, outputTokens: 1, seq })
  const ledgerIoActive = fixtureWrite(fixture.root, join(workspaceRoot, 'ledger-io', 'ledger-v2.jsonl'), ledgerIoRow('io-active-a', 0) + '\n' + ledgerIoRow('io-active-b', 1) + '\n')
  const ledgerIoArchive = fixtureWrite(fixture.root, join(workspaceRoot, 'ledger-io', 'ledger-v2.archive.jsonl'), '')
  const ledgerIoLog = []
  const ledgerIoFsOps = {}
  for (const [name, fn] of Object.entries({ mkdirSync, readFileSync, renameSync, rmSync, statSync, unlinkSync, writeFileSync })) {
    ledgerIoFsOps[name] = (...args) => {
      ledgerIoLog.push({ op: name, path: String(args[0]) })
      return fn(...args)
    }
  }
  const ledgerCalibrationMark = ledgerIoLog.length
  const ledgerCalibrationStat = ledgerIoFsOps.statSync(ledgerIoActive)
  record('账本IO spy校准statSync计数与真实stat一致', { calibrated: true, delta: 1, sizeMatch: true }, { delta: ledgerIoLog.length - ledgerCalibrationMark, spySize: ledgerCalibrationStat.size, realSize: statSync(ledgerIoActive).size }, ledgerIoLog.length - ledgerCalibrationMark === 1 && ledgerCalibrationStat.size === statSync(ledgerIoActive).size)
  const ledgerWriteOps = ['writeFileSync', 'mkdirSync', 'renameSync', 'unlinkSync', 'rmSync']
  const ledgerWShaBefore = { active: sha256File(ledgerIoActive), archive: sha256File(ledgerIoArchive) }
  const ledgerStatIo = await ledgerStep99.statLedger(ledgerIoActive, { pathContext: lockContext, purpose: 'ledger-read', fsOps: ledgerIoFsOps })
  const ledgerWShaAfter = { active: sha256File(ledgerIoActive), archive: sha256File(ledgerIoArchive) }
  record('账本W统计锁内读真实行且active/archive字节SHA不变', { rows: 2, shaUnchanged: true, lockResidue: false }, { rows: ledgerStatIo.rows.length, before: ledgerWShaBefore, after: ledgerWShaAfter, lockResidue: existsSync(usageLedger.usageLedgerLockPath(ledgerIoActive)) }, ledgerStatIo.rows.length === 2 && ledgerWShaBefore.active === ledgerWShaAfter.active && ledgerWShaBefore.archive === ledgerWShaAfter.archive && !existsSync(usageLedger.usageLedgerLockPath(ledgerIoActive)))
  const ledgerArchiveIoMark = ledgerIoLog.length
  const ledgerArchiveBefore = { activeBytes: bytesOf(ledgerIoActive), archiveBytes: bytesOf(ledgerIoArchive), active: sha256File(ledgerIoActive), archive: sha256File(ledgerIoArchive) }
  const ledgerArchiveResult = await ledgerStep99.archiveLedger(ledgerIoActive, { pathContext: lockContext, fsOps: ledgerIoFsOps })
  const ledgerArchiveAfter = { activeBytes: bytesOf(ledgerIoActive), archiveBytes: bytesOf(ledgerIoArchive), active: sha256File(ledgerIoActive), archive: sha256File(ledgerIoArchive) }
  const ledgerArchiveWrites = ledgerIoLog.slice(ledgerArchiveIoMark).filter((item) => ledgerWriteOps.includes(item.op))
  record('账本W归档聚合真实行清空active且写调用全在W', { groups: 2, covered: 0, activeCleared: true, archiveGrew: true, ioUnderW: true, lockResidue: false }, { groups: ledgerArchiveResult.groups, covered: ledgerArchiveResult.coveredByArchiveRows, before: ledgerArchiveBefore, after: ledgerArchiveAfter, writeCalls: ledgerArchiveWrites.length, ioUnderW: ledgerArchiveWrites.every((item) => isWithin(fixture.root, resolve(item.path))), lockResidue: existsSync(usageLedger.usageLedgerLockPath(ledgerIoActive)) }, ledgerArchiveResult.groups === 2 && ledgerArchiveResult.coveredByArchiveRows === 0 && ledgerArchiveAfter.activeBytes === 0 && ledgerArchiveAfter.archiveBytes > ledgerArchiveBefore.archiveBytes && ledgerArchiveWrites.length > 0 && ledgerArchiveWrites.every((item) => isWithin(fixture.root, resolve(item.path))) && !existsSync(usageLedger.usageLedgerLockPath(ledgerIoActive)))
  const ledgerHostActive = fixtureWrite(fixture.root, join(hostRoot, 'ledger-host', 'ledger-v2.jsonl'), ledgerIoRow('host-stable', 0) + '\n')
  const ledgerHostArchive = fixtureWrite(fixture.root, join(hostRoot, 'ledger-host', 'ledger-v2.archive.jsonl'), ledgerIoRow('host-stable-arch', 0) + '\n')
  const ledgerHostContext = corePaths.createPathContext({ workspaceRoot, hostDataRoot: hostRoot })
  const ledgerHostBefore = { active: sha256File(ledgerHostActive), archive: sha256File(ledgerHostArchive) }
  const ledgerHostIoMark = ledgerIoLog.length
  const ledgerHostStat = await ledgerStep99.statLedger(ledgerHostActive, { pathContext: ledgerHostContext, purpose: 'ledger-read', hostReadOnly: true, fsOps: ledgerIoFsOps })
  const ledgerHostAfter = { active: sha256File(ledgerHostActive), archive: sha256File(ledgerHostArchive) }
  const ledgerHostWrites = ledgerIoLog.slice(ledgerHostIoMark).filter((item) => ledgerWriteOps.includes(item.op))
  const ledgerSnapshotCleaned = ledgerHostStat.observation !== undefined && typeof ledgerHostStat.observation.snapshotDir === 'string' && !existsSync(ledgerHostStat.observation.snapshotDir) && isWithin(workspaceRoot, ledgerHostStat.observation.snapshotDir)
  record('账本Host稳定观察零Host写且W暂存清理', { observationLevel: 'stable-read-only', scope: 'host', hostShaUnchanged: true, hostWrites: 0, snapshotCleaned: true }, { observationLevel: ledgerHostStat.observationLevel || null, scope: ledgerHostStat.observation?.scope || null, before: ledgerHostBefore, after: ledgerHostAfter, hostWrites: ledgerHostWrites.filter((item) => isWithin(hostRoot, resolve(item.path))).length, writeCalls: ledgerHostWrites.length, snapshotDir: ledgerHostStat.observation?.snapshotDir || null, snapshotCleaned: ledgerSnapshotCleaned }, ledgerHostStat.observationLevel === 'stable-read-only' && ledgerHostStat.observation?.scope === 'host' && ledgerHostStat.observation?.activeSha256 === ledgerHostBefore.active && ledgerHostStat.observation?.archiveSha256 === ledgerHostBefore.archive && ledgerHostBefore.active === ledgerHostAfter.active && ledgerHostBefore.archive === ledgerHostAfter.archive && ledgerHostWrites.every((item) => !isWithin(hostRoot, resolve(item.path))) && ledgerSnapshotCleaned)
  const ledgerBusyActive = fixtureWrite(fixture.root, join(hostRoot, 'ledger-host-busy', 'ledger-v2.jsonl'), ledgerIoRow('host-busy', 0) + '\n')
  const ledgerBusyLock = fixtureWrite(fixture.root, join(hostRoot, 'ledger-host-busy', 'ledger-v2.jsonl.lock'), '{"pid":1,"token":"fixture"}\n')
  const ledgerBusyBefore = sha256File(ledgerBusyActive)
  const ledgerBusy = await captureAsync(() => ledgerStep99.statLedger(ledgerBusyActive, { pathContext: ledgerHostContext, purpose: 'ledger-read', hostReadOnly: true, fsOps: ledgerIoFsOps }))
  record('账本Host锁忙返回INCOMPLETE且锁与字节不动', { code: 'incomplete', messageIncludesLock: true, shaUnchanged: true, lockKept: true }, { code: ledgerBusy.error?.code || null, messageIncludesLock: ledgerBusy.error?.message?.includes('锁') || false, shaAfter: sha256File(ledgerBusyActive), lockKept: existsSync(ledgerBusyLock) }, ledgerBusy.error?.code === 'incomplete' && ledgerBusy.error?.message?.includes('锁') === true && sha256File(ledgerBusyActive) === ledgerBusyBefore && existsSync(ledgerBusyLock))
  const ledgerMetaActive = fixtureWrite(fixture.root, join(hostRoot, 'ledger-host-meta', 'ledger-v2.jsonl'), ledgerIoRow('host-meta', 0) + '\n')
  let ledgerMetaJitter = 0
  const ledgerMetaFsOps = { ...ledgerIoFsOps, statSync: (...args) => {
    const stat = statSync(...args)
    if (resolve(String(args[0])) === ledgerMetaActive) {
      ledgerMetaJitter += 1
      return { dev: String(stat.dev), ino: String(stat.ino), size: stat.size, mtimeMs: stat.mtimeMs + ledgerMetaJitter * 1000, ctimeMs: String(stat.ctimeMs) }
    }
    return stat
  } }
  const ledgerMeta = await captureAsync(() => ledgerStep99.statLedger(ledgerMetaActive, { pathContext: ledgerHostContext, purpose: 'ledger-read', hostReadOnly: true, fsOps: ledgerMetaFsOps }))
  record('账本Host元数据抖动返回INCOMPLETE', { code: 'incomplete', messageIncludesMetadataChange: true }, { code: ledgerMeta.error?.code || null, messageIncludesMetadataChange: ledgerMeta.error?.message?.includes('元数据变化') || false }, ledgerMeta.error?.code === 'incomplete' && ledgerMeta.error?.message?.includes('元数据变化') === true)
  const ledgerBytesActive = fixtureWrite(fixture.root, join(hostRoot, 'ledger-host-bytes', 'ledger-v2.jsonl'), ledgerIoRow('host-bytes', 0) + '\n')
  let ledgerBytesReads = 0
  const ledgerBytesFsOps = { ...ledgerIoFsOps, readFileSync: (...args) => {
    const bytes = readFileSync(...args)
    if (resolve(String(args[0])) === ledgerBytesActive) {
      ledgerBytesReads += 1
      if (ledgerBytesReads >= 2) return Buffer.concat([bytes, Buffer.from(ledgerIoRow('host-bytes-drift', 9) + '\n', 'utf8')])
    }
    return bytes
  } }
  const ledgerBytes = await captureAsync(() => ledgerStep99.statLedger(ledgerBytesActive, { pathContext: ledgerHostContext, purpose: 'ledger-read', hostReadOnly: true, fsOps: ledgerBytesFsOps }))
  record('账本Host两次读字节不一致返回INCOMPLETE', { code: 'incomplete', messageIncludesBytesChange: true }, { code: ledgerBytes.error?.code || null, messageIncludesBytesChange: ledgerBytes.error?.message?.includes('字节不一致') || false }, ledgerBytes.error?.code === 'incomplete' && ledgerBytes.error?.message?.includes('字节不一致') === true)
  const ledgerHostTarget = corePaths.resolveHostPath(ledgerHostContext, ledgerHostActive, { purpose: 'ledger-read' })
  const ledgerHostArchiveDeny = await captureAsync(() => ledgerStep99.archiveLedger(ledgerHostActive, { pathContext: ledgerHostContext, target: ledgerHostTarget }))
  record('账本显式Host只读目标归档拒绝', { code: 'path-not-authorized', messageIncludesDeny: true }, { code: ledgerHostArchiveDeny.error?.code || null, messageIncludesDeny: ledgerHostArchiveDeny.error?.message?.includes('不能归档') || false }, ledgerHostArchiveDeny.error?.code === 'path-not-authorized' && ledgerHostArchiveDeny.error?.message?.includes('不能归档') === true)
  const ledgerAliasDeny = await captureAsync(() => ledgerStep99.archiveLedger(ledgerHostActive, { pathContext: ledgerHostContext, maintenanceContext: { pathContext: ledgerHostContext, hostAccess: 'read-only', workspaceRoot } }))
  record('账本Host只读上下文拒绝经W别名归档', { code: 'path-not-authorized', messageIncludesAlias: true }, { code: ledgerAliasDeny.error?.code || null, messageIncludesAlias: ledgerAliasDeny.error?.message?.includes('别名') || false }, ledgerAliasDeny.error?.code === 'path-not-authorized' && ledgerAliasDeny.error?.message?.includes('别名') === true)

  const pluginModule = await import('../../plugins/dsh-extra-plan/index.js')
  const agent = { session: { header: { id: 'path-boundary-agent', cwd: workspaceRoot } } }
  const hostLogPath = join(hostRoot, 'logs', 'dsh-extra-plan', 'extra-plan-agent-errors.jsonl')
  const diagnosticCtx = { get(key) { return key === 'profileContext' ? { home: hostRoot } : key === 'dshHomePath' ? () => hostRoot : undefined } }
  pluginModule.recordAgentError({ agent, turn: 1, step: 'path-boundary-bare-log', error: new Error('path-boundary fixture error') }, { ctx: diagnosticCtx })
  record('裸日志名按Host data根/logs/dsh-extra-plan解析且工件仍W-only', { hostLog: hostLogPath, exists: true, hostFixtureOnly: true, evidenceUnderW: true }, { hostLog: hostLogPath, exists: existsSync(hostLogPath), hostFixtureOnly: isWithin(fixture.root, hostLogPath), evidenceUnderW: isWithin(ROOT, resolve(ROOT, EVIDENCE_ROOT)) }, existsSync(hostLogPath) && isWithin(fixture.root, hostLogPath) && isWithin(ROOT, resolve(ROOT, EVIDENCE_ROOT)))

  const generator = await import('../../plugins/dsh-extra-plan/scripts/generate-runtime-defaults.mjs')
  const templatePath = join(ROOT, 'plugins', 'dsh-extra-plan', 'assets', 'presets', 'extra-plan', 'agent.cordis.yml')
  const metaPath = join(ROOT, 'plugins', 'dsh-extra-plan', 'assets', 'presets', 'extra-plan', 'preset.yml')
  const checkOutputPath = join(workspaceRoot, 'generator-check', 'preset-defaults.generated.js')
  const rendered = generator.renderRuntimeDefaults(readFileSync(templatePath, 'utf8'))
  fixtureWrite(fixture.root, checkOutputPath, rendered)
  const checkBefore = sha256File(checkOutputPath)
  let checkIo = 0
  const checkResult = generator.generateRuntimeDefaults({ workspaceRoot: ROOT, sourcePath: templatePath, metaSourcePath: metaPath, outputPath: checkOutputPath, definitionOutputPath: null, roleDefinitionDir: null, clientOutputPath: null, check: true, fsOps: { writeFileSync() { checkIo += 1; throw new Error('check must not write') }, mkdirSync() { checkIo += 1; throw new Error('check must not mkdir') } } })
  const checkAfter = sha256File(checkOutputPath)
  record('generator --check只读fixture输出且零发布', { changed: false, hashStable: true, fsWrites: 0 }, { changed: checkResult.changed, hashStable: checkBefore === checkAfter, fsWrites: checkIo }, checkResult.changed === false && checkBefore === checkAfter && checkIo === 0)
  const applyOutputPath = join(workspaceRoot, 'generator-apply', 'preset-defaults.generated.js')
  const generatorApplyResult = generator.generateRuntimeDefaults({ workspaceRoot: ROOT, sourcePath: templatePath, metaSourcePath: metaPath, outputPath: applyOutputPath, definitionOutputPath: null, roleDefinitionDir: null, clientOutputPath: null, check: false })
  record('generator apply只发布W内fixture', { changed: true, outputUnderW: true, exists: true }, { changed: generatorApplyResult.changed, outputUnderW: isWithin(workspaceRoot, applyOutputPath), exists: existsSync(applyOutputPath) }, generatorApplyResult.changed === true && isWithin(workspaceRoot, applyOutputPath) && existsSync(applyOutputPath))

  const contract = await import('../../plugins/dsh-extra-plan/lib/save-contract.js')
  const baseSummary = { groupCount: 1, reviewGroupCount: 1, checkCount: 1, hasClosure: false, hasGlobalAcceptance: false, tasks: [{ id: 1, title: '', mainFiles: [], relatedFiles: [], executionGroup: 'G13', dependencies: [], dependencyReason: '', groupReason: '', resources: [], modifications: [], selfChecks: [], fileRecords: [] }], groups: [], checks: [], reviewGroups: [] }
  const baseSummaryText = contract.formatSavePlanSummary(baseSummary)
  const exactSummary = { ...baseSummary, tasks: [{ ...baseSummary.tasks[0], title: 'x'.repeat(Math.max(0, contract.SAVE_PLAN_LIMITS.maxSummaryChars - baseSummaryText.length)) }] }
  const overSummary = { ...baseSummary, tasks: [{ ...baseSummary.tasks[0], title: exactSummary.tasks[0].title + 'x' }] }
  const exactLength = contract.formatSavePlanSummary(exactSummary).length
  const overLength = contract.formatSavePlanSummary(overSummary).length
  record('save_plan摘要12000边界逐字准确', { limit: 12000, exact: 12000, overGreater: true }, { limit: contract.SAVE_PLAN_LIMITS.maxSummaryChars, exact: exactLength, overGreater: overLength > contract.SAVE_PLAN_LIMITS.maxSummaryChars }, contract.SAVE_PLAN_LIMITS.maxSummaryChars === 12000 && exactLength === 12000 && overLength > 12000)

  const cliBaseEnv = { ...process.env, DSH_HOME: undefined, DSH_INSTALL_ROOT: undefined }
  delete cliBaseEnv.DSH_HOME
  delete cliBaseEnv.DSH_INSTALL_ROOT
  const cliNoRoot = childResult('cli-install-no-root', [QQ_CLI, '--install'], cliBaseEnv, fixture.root, false)
  writeEvidence('raw/cli-install-no-root.stdout.log', cliNoRoot.stdout)
  writeEvidence('raw/cli-install-no-root.stderr.log', cliNoRoot.stderr)
  record('QQ CLI --install缺根返回精确dsh-home-required且零安装写', { exit: 1, reason: 'dsh-home-required' }, { exit: cliNoRoot.status, reason: cliNoRoot.stderr.includes('dsh-home-required') ? 'dsh-home-required' : null, fatalText: commandHasFatalText(cliNoRoot) }, cliNoRoot.status === 1 && cliNoRoot.stderr.includes('dsh-home-required') && !commandHasFatalText(cliNoRoot))
  const cliNoArgEnv = { ...process.env, DSH_HOME: undefined, DSH_INSTALL_ROOT: installRootRaw }
  delete cliNoArgEnv.DSH_HOME
  const cliNoArg = childResult('cli-no-arg-no-home', [QQ_CLI], cliNoArgEnv, fixture.root, installRootRaw !== '')
  writeEvidence('raw/cli-no-arg-no-home.stdout.log', cliNoArg.stdout)
  writeEvidence('raw/cli-no-arg-no-home.stderr.log', cliNoArg.stderr)
  record('QQ CLI无参仅提示且exit0不执行自愈', { exit: 0, warning: true }, { exit: cliNoArg.status, warning: cliNoArg.stdout.includes('规则: 无参仅提示'), fatalText: commandHasFatalText(cliNoArg) }, cliNoArg.status === 0 && cliNoArg.stdout.includes('规则: 无参仅提示') && !commandHasFatalText(cliNoArg))
  if (installRootRaw !== '') {
    const cliInstallEnv = { ...process.env, DSH_HOME: qqHome, DSH_INSTALL_ROOT: installRootRaw }
    const cliInstall = childResult('cli-install-fixture', [QQ_CLI, '--install'], cliInstallEnv, fixture.root, true)
    writeEvidence('raw/cli-install-fixture.stdout.log', cliInstall.stdout)
    writeEvidence('raw/cli-install-fixture.stderr.log', cliInstall.stderr)
    const installOk = cliInstall.status === 0 && cliInstall.stdout.includes('严格安装完成') && !commandHasFatalText(cliInstall)
    if (!installOk && /EPERM|EACCES/.test(cliInstall.stderr + cliInstall.stdout)) markNotRun('QQ CLI --install合法离线fixture', { exit: 0, completed: true }, { exit: cliInstall.status, stdout: cliInstall.stdout.slice(-240), stderr: cliInstall.stderr.slice(-240) }, '环境链接或Host权限受阻；EPERM/EACCES不作路径护栏PASS')
    else record('QQ CLI --install只操作本地fixture/offline并完成', { exit: 0, completed: true }, { exit: cliInstall.status, completed: installOk, stdoutTail: cliInstall.stdout.slice(-240), stderrTail: cliInstall.stderr.slice(-240) }, installOk)
  } else {
    markNotRun('QQ CLI --install合法离线fixture', { exit: 0, completed: true }, { installRoot: null }, '缺少显式DSH_INSTALL_ROOT')
  }

  if (hostInfo !== null) {
    const hostHashes = [hostInfo.dsh.manifest, hostInfo.dsh.entry, hostInfo.llm.manifest, hostInfo.llm.entry, hostInfo.agentPreset.manifest, hostInfo.agentPreset.entry].map((filePath) => ({ path: filePath, sha256: sha256File(filePath), bytes: bytesOf(filePath) }))
    writeEvidence('raw/host-readonly-hashes.json', JSON.stringify({ root: hostInfo.root, files: hostHashes }, null, 2) + '\n')
  }

  const currentTargetHash = sha256File(THIS_SOURCE)
  const currentTargetBytes = bytesOf(THIS_SOURCE)
  const currentSources = []
  for (const source of auditEntries) {
    let actual = null
    let bytes = null
    let error = null
    let filePath = null
    try {
      if (typeof source.path !== 'string' || source.path === '') throw reportError('AUDIT_ENTRY_INVALID', '审计条目缺少path')
      filePath = resolve(ROOT, source.path)
      validateWorkspaceChain(filePath)
      const stat = lstatIfPresent(filePath)
      if (stat === null || !stat.isFile() || stat.isSymbolicLink()) throw reportError('AUDIT_ENTRY_INVALID', '审计条目不是W内真实文件', { path: filePath })
      actual = sha256File(filePath)
      bytes = bytesOf(filePath)
    } catch (caught) {
      error = errorShape(caught)
    }
    const expected = source.sha256 || source.afterSha256 || source.actual || source.currentSha256 || source.expected || null
    const matches = actual !== null && typeof expected === 'string' && actual === expected
    const item = { path: source.path || null, expected, actual, bytes, matches, error }
    currentSources.push(item)
    record('显式W基线逐条重算：' + (source.path || '<invalid>'), { matches: true, maxEntries: MAX_AUDIT_ENTRIES }, item, matches)
  }
  const auditRequested = reportArgs.auditBaseline !== null
  const auditAllMatch = auditRequested && currentSources.length > 0 && currentSources.every((item) => item.matches === true)
  const sourceAudit = {
    requested: auditRequested,
    status: auditRequested ? (auditAllMatch ? 'VERIFIED' : 'FAILED') : 'NOT-RUN',
    baseline: auditRequested ? reportArgs.auditBaseline : null,
    maxEntries: MAX_AUDIT_ENTRIES,
    count: currentSources.length,
    allMatch: auditAllMatch,
    files: currentSources,
  }
  if (auditRequested) writeEvidence('raw/source-audit.json', JSON.stringify(sourceAudit, null, 2) + '\n')
  writeEvidence('raw/source-scan.json', JSON.stringify({ schema: 'path-boundary-source-scan.v2', targets: scanResults, activeCodeOnly: true, auxiliary: true }, null, 2) + '\n')
  writeEvidence('raw/scenarios.json', JSON.stringify({ schema: 'path-boundary-scenarios.v2', executionGroup: 'G13', task: 'C/任务1/M1-M5', workspaceRoot: ROOT, fixtureRoot: fixture.root, hostDataFixture: hostRoot, scenarios: scenarioRecords, counts: { pass, fail, skip, incomplete, notRun, human }, sourceAudit: { requested: sourceAudit.requested, status: sourceAudit.status }, limitations: ['真实Host项仅显式DSH_INSTALL_ROOT只读核验', 'NOT-RUN/HUMAN按实际执行保留', '共享静态检查3由后置统一执行'] }, null, 2) + '\n')
  const freeze = {
    schema: 'path-boundary-freeze.v2',
    executionGroup: 'G13',
    task: 'C/任务1/M1-M5',
    workspaceRoot: ROOT,
    evidenceRoot: EVIDENCE_ROOT,
    hostVerificationRoot: installRootRaw || null,
    currentSource: { path: 'pe-test/tools/step-00-路径边界.mjs', sha256: currentTargetHash, bytes: currentTargetBytes },
    audit: { requested: sourceAudit.requested, status: sourceAudit.status, count: sourceAudit.count },
    status: sourceAudit.requested ? sourceAudit.status : 'NOT-RUN',
    limitations: ['未请求--audit-baseline时不读取历史基线且不宣称源码冻结', '共享静态检查3后置', '真实Host数据/profile/会话/Provider不执行'],
  }
  writeEvidence('freeze.json', JSON.stringify(freeze, null, 2) + '\n')
  const delivery = {
    schema: 'path-boundary-delivery.v1',
    executionGroup: 'G13',
    task: 'C/回归任务1',
    milestones: {
      M1: { status: 'EXECUTED', reportMode: reportArgs.evidenceDir === null ? 'default-unique-W' : 'explicit-W', auditRequested: auditRequested },
      M2: { status: 'EXECUTED', parentChain: true, collisionSafe: true, linkChecked: true },
      M3: { status: 'EXECUTED', caseCount: scenarioRecords.length, pass, fail, notRun, incomplete, human },
      M4: { status: 'EXECUTED', activeSourceTargetCount: pathScanTargets.length, auxiliaryScan: true },
      M5: { status: 'EXECUTED', reportSchema: 'path-boundary-scenarios.v2', auditStatus: sourceAudit.status },
    },
    raw: ['raw/scenarios.json', 'raw/source-scan.json', ...(auditRequested ? ['raw/source-audit.json'] : []), ...commandRecords.map((item) => item.rawPaths).flat().filter(Boolean)],
    exitCodes: commandRecords.map(({ label, status, signal, error }) => ({ label, status, signal, error })),
    calibration: { statSync: calibration.counts.statSync, calibrated: calibration.calibrated, io: calibration.counts },
    source: { beforeSha256: sourceBeforeSha, afterSha256: currentTargetHash, afterBytes: currentTargetBytes },
    reportPath: EVIDENCE_ROOT,
    freeze: { requested: auditRequested, status: freeze.status },
    unexecuted: scenarioRecords.filter((item) => item.status === 'NOT-RUN' || item.status === 'HUMAN'),
    firstError: scenarioRecords.find((item) => item.status === 'FAIL' || item.status === 'INCOMPLETE') || null,
  }
  writeEvidence('delivery.json', JSON.stringify(delivery, null, 2) + '\n')
  output.structured('路径边界场景汇总', { pass, fail, skip, incomplete, notRun, human, fixture: fixture.root, evidenceRoot: EVIDENCE_ROOT, sourceAudit: sourceAudit.status }, { pass, fail, skip, incomplete, notRun, human, sourceAudit: sourceAudit.status }, { failure: fail > 0 || incomplete > 0 })
  output.summary(pass, fail, { skip, incomplete })
  output.emit('NOT-RUN ' + notRun)
  output.emit('HUMAN ' + human)
  process.exitCode = fail === 0 && incomplete === 0 ? 0 : 1
} catch (error) {
  try {
    if (typeof EVIDENCE_ROOT === 'string' && EVIDENCE_ROOT !== '') writeEvidence('first-error.json', JSON.stringify({ schema: 'path-boundary-first-error.v1', error: errorShape(error) }, null, 2) + '\n')
  } catch {}
  throw error
} finally {
  try {
    if (fixture !== null) fixture.cleanup()
  } finally {
    for (const [key, value] of Object.entries(previousEnv)) {
      if (value === undefined) delete process.env[key]
      else process.env[key] = value
    }
  }
}
}

process.on('unhandledRejection', (reason) => {
  unhandled = errorShape(reason)
  process.exitCode = 1
  console.error('FAIL  UnhandledPromiseRejection: ' + JSON.stringify(unhandled))
})

try {
  await main()
} catch (error) {
  fail += 1
  console.error('FAIL  路径边界执行异常: ' + (error instanceof Error ? error.stack || error.message : String(error)))
  process.exitCode = 1
}
if (unhandled !== null) process.exitCode = 1
