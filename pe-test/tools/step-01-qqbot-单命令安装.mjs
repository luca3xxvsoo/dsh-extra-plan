#!/usr/bin/env node
import { createHash, randomBytes } from 'node:crypto'
import { createRequire } from 'node:module'
import { closeSync, cpSync, existsSync, lstatSync, mkdirSync, openSync, readFileSync, readdirSync, readlinkSync, realpathSync, symlinkSync, writeFileSync, appendFileSync } from 'node:fs'
import { spawn } from 'node:child_process'
import { createServer } from 'node:http'
import { dirname, join, relative, resolve, basename, delimiter, isAbsolute, sep } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { isDeepStrictEqual } from 'node:util'

// DSH版本期望不写死：允许集合取自核心包 package.json 的 engines.dsh（以双竖线分隔多个受支持版本）。
// 读取或解析失败必须 fail-closed——抛 IncompleteError 并回显路径，绝不回退到任何硬编码版本。
function coreManifestPath() {
  return join(WORKSPACE, 'plugins', CORE_PACKAGE, 'package.json')
}

function allowedDshVersions() {
  const manifestPath = coreManifestPath()
  const manifest = tryReadJson(manifestPath)
  if (!manifest) throw new IncompleteError('核心包package.json不可读: ' + manifestPath)
  const declared = manifest.engines && typeof manifest.engines.dsh === 'string' ? manifest.engines.dsh : ''
  const allowed = declared.split('||').map((item) => item.trim()).filter((item) => item !== '')
  if (allowed.length === 0) throw new IncompleteError('核心包engines.dsh未声明允许的DSH版本: ' + manifestPath)
  return allowed
}
const TARGET_PACKAGE = 'dsh-extra-plan-qqbot'
const CORE_PACKAGE = 'dsh-extra-plan'
const TARGET_VERSION = '2.0.1'
const SETTINGS_ROW_ID = 'dsh-extra-plan-settings'
const SCRIPT_FILE = fileURLToPath(import.meta.url)
const WORKSPACE = resolve(dirname(SCRIPT_FILE), '../..')
const REPORTS_ROOT = join(WORKSPACE, 'pe-test', 'reports', 'qqbot-single-add', 'integration')
const NL = String.fromCharCode(10)
const activeChildren = new Set()

class IncompleteError extends Error {
  constructor(message) {
    super(message)
    this.name = 'IncompleteError'
    this.code = 2
  }
}

function isoRunId() {
  const stamp = new Date().toISOString().replace(/[-:.TZ]/g, '')
  return stamp + '-' + randomBytes(5).toString('hex')
}

function ensureUniqueRunDir() {
  mkdirSync(REPORTS_ROOT, { recursive: true })
  for (;;) {
    const runId = isoRunId()
    const dir = join(REPORTS_ROOT, runId)
    try {
      mkdirSync(dir)
      return { runId, dir }
    } catch (error) {
      if (error && error.code === 'EEXIST') continue
      throw error
    }
  }
}

function jsonWrite(file, value) {
  mkdirSync(dirname(file), { recursive: true })
  writeFileSync(file, JSON.stringify(value, null, 2) + NL, 'utf8')
}

function readJson(file) {
  return JSON.parse(readFileSync(file, 'utf8'))
}

function tryReadJson(file) {
  try {
    return readJson(file)
  } catch {
    return undefined
  }
}

function pathForEvidence(file) {
  const value = resolve(file)
  const rel = relative(WORKSPACE, value)
  if (rel === '') return '.'
  const outside = isAbsolute(rel) || rel === '..' || rel.startsWith('..' + sep)
  return outside ? value : rel
}

function fileSha256(file) {
  return createHash('sha256').update(readFileSync(file)).digest('hex').toUpperCase()
}

function fingerprintPath(file) {
  const result = { path: pathForEvidence(file) }
  let stat
  try {
    stat = lstatSync(file)
  } catch (error) {
    result.exists = false
    result.error = error && error.code === 'ENOENT' ? 'ENOENT' : String(error)
    return result
  }
  result.exists = true
  result.type = stat.isSymbolicLink() ? 'symlink' : stat.isDirectory() ? 'directory' : stat.isFile() ? 'file' : 'other'
  result.mode = stat.mode
  result.size = stat.size
  result.mtimeMs = stat.mtimeMs
  if (stat.isSymbolicLink()) {
    try { result.linkTarget = readlinkSync(file) } catch {}
    try { result.realPath = pathForEvidence(realpathSync(file)) } catch (error) { result.realPathError = String(error) }
  } else if (stat.isFile()) {
    try { result.sha256 = fileSha256(file) } catch (error) { result.sha256Error = String(error) }
  } else if (stat.isDirectory()) {
    try {
      result.entries = readdirSync(file).sort()
      result.entryCount = result.entries.length
    } catch (error) {
      result.entriesError = String(error)
    }
  }
  return result
}

function fingerprints(files) {
  return [...new Set(files.filter(Boolean).map((file) => resolve(file)))].map(fingerprintPath)
}

function shellQuote(value) {
  const text = String(value)
  if (text.length === 0) return '""'
  if (!/[\\s"']/u.test(text)) return text
  return '"' + text.replace(/"/g, '\\"') + '"'
}

function commandText(executable, args) {
  return [executable, ...args].map(shellQuote).join(' ')
}

function parseArgs(argv) {
  if (argv.includes('--help') || argv.includes('-h')) return { help: true }
  let dshRoot
  let caseName
  const unknown = []
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]
    if (arg === '--dsh-root') {
      dshRoot = argv[++index]
    } else if (arg.startsWith('--dsh-root=')) {
      dshRoot = arg.slice('--dsh-root='.length)
    } else if (arg === '--case') {
      caseName = argv[++index]
    } else if (arg.startsWith('--case=')) {
      caseName = arg.slice('--case='.length)
    } else {
      unknown.push(arg)
    }
  }
  if (unknown.length > 0) throw new IncompleteError('未知参数: ' + unknown.join(', '))
  if (!dshRoot) throw new IncompleteError('缺少 --dsh-root')
  if (!['install', 'compose', 'cache'].includes(caseName)) throw new IncompleteError('缺少或非法 --case=install|compose|cache')
  return { dshRoot: resolve(dshRoot), caseName }
}

function findExecutable(name) {
  const names = process.platform === 'win32' ? [name + '.cmd', name + '.exe', name] : [name]
  for (const directory of String(process.env.PATH || '').split(delimiter).filter(Boolean)) {
    for (const candidate of names) {
      const file = join(directory, candidate)
      if (existsSync(file)) return resolve(file)
    }
  }
  throw new IncompleteError('找不到可执行文件: ' + name)
}

function validateDshRoot(root) {
  let realRoot
  try { realRoot = realpathSync(root) } catch (error) { throw new IncompleteError('DSH根不可读: ' + root + ' ' + String(error)) }
  const manifestPath = join(realRoot, 'package.json')
  const manifest = tryReadJson(manifestPath)
  if (!manifest || manifest.name !== '@deepseek-ai/dsh') throw new IncompleteError('DSH根package.json不匹配: ' + manifestPath)
  const allowedDsh = allowedDshVersions()
  if (!allowedDsh.includes(String(manifest.version))) throw new IncompleteError('DSH版本不符: 实际 ' + String(manifest.version) + '，允许 ' + allowedDsh.join(' || ') + '（声明于 ' + coreManifestPath() + '）')
  const binValue = typeof manifest.bin === 'string' ? manifest.bin : manifest.bin && manifest.bin.dsh
  if (!binValue) throw new IncompleteError('DSH package.json缺少dsh入口')
  const cliPath = resolve(realRoot, binValue)
  if (!existsSync(cliPath)) throw new IncompleteError('DSH CLI入口不存在: ' + cliPath)
  const pnpm = findExecutable('pnpm')
  const npm = findExecutable('npm')
  return { root: realRoot, manifestPath, version: manifest.version, cliPath, pnpm, npm, nodeModules: join(realRoot, 'node_modules') }
}

function makeRunRecord(run, parsed) {
  return {
    suite: 'qqbot-single-add',
    source: pathForEvidence(SCRIPT_FILE),
    case: parsed?.caseName,
    runId: run.runId,
    argv: process.argv.slice(2),
    workspace: WORKSPACE,
    evidenceDirectory: run.dir,
    status: 'RUNNING',
    operations: [],
    artifacts: [],
  }
}

function persistRun(run) {
  jsonWrite(join(run.dir, 'run.json'), run.record)
}

function addArtifact(run, artifact) {
  run.record.artifacts.push(artifact)
  persistRun(run)
}

function selectedEnv(env) {
  const names = [
    'DSH_HOME', 'DSH_PROFILE', 'DSH_PROFILE_DIR', 'HOME', 'USERPROFILE', 'TEMP', 'TMP', 'TMPDIR',
    'npm_config_cache', 'npm_config_userconfig', 'npm_config_registry', 'pnpm_config_store_dir',
    'NPM_CONFIG_CACHE', 'NPM_CONFIG_USERCONFIG', 'NPM_CONFIG_REGISTRY', 'PNPM_CONFIG_STORE_DIR',
    'NO_PROXY', 'HTTP_PROXY', 'HTTPS_PROXY', 'ALL_PROXY', 'PATH',
  ]
  return Object.fromEntries(names.filter((name) => env[name] !== undefined).map((name) => [name, env[name]]))
}

function closeCommandFd(resource, key) {
  const fd = resource[key]
  resource[key] = undefined
  if (typeof fd !== 'number') return
  try { closeSync(fd) } catch (error) { (resource.fdErrors ??= []).push(String(error)) }
}

function closeCommandFds(resource) {
  closeCommandFd(resource, 'stdoutFd')
  closeCommandFd(resource, 'stderrFd')
  resource.fdsClosed = true
}

function notifyCommandWaiters(resource) {
  for (const waiter of [...resource.waiters]) waiter()
}

function waitForCommandClose(resource, timeoutMs) {
  if (resource.terminal) return Promise.resolve(true)
  return new Promise((resolvePromise) => {
    let settled = false
    const finish = (closed) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      resource.waiters.delete(finish)
      resolvePromise(closed)
    }
    const timer = setTimeout(() => finish(false), timeoutMs)
    resource.waiters.add(finish)
  })
}

function killCommand(resource, signal) {
  resource.killRequested = true
  try {
    const returned = signal === undefined ? resource.child.kill() : resource.child.kill(signal)
    resource.killResults.push({ signal: signal ?? null, returned })
    return returned
  } catch (error) {
    resource.killError = String(error)
    resource.killResults.push({ signal: signal ?? null, error: resource.killError })
    return false
  }
}

function refreshCommandRecord(resource) {
  if (!resource.record) return
  const outcome = resource.terminal ? resource.outcome : resource.resultRef
  if (!outcome) return
  resource.record.stdout = readFileSync(resource.stdoutPath, 'utf8')
  resource.record.stderr = readFileSync(resource.stderrPath, 'utf8')
  resource.record.exitCode = outcome.exitCode ?? null
  resource.record.signal = outcome.signal ?? null
  resource.record.timedOut = resource.timedOut === true
  resource.record.error = outcome.error ?? null
  resource.record.spawnError = outcome.spawnError === true
  resource.record.processStillRunning = !resource.terminal
  resource.record.killRequested = resource.killRequested === true
  resource.record.killError = resource.killError
  resource.record.before = resource.before
  resource.record.after = fingerprints(resource.afterPaths)
  resource.record.finishedAt = new Date().toISOString()
  resource.record.resource = {
    terminal: resource.terminal,
    active: activeChildren.has(resource),
    fdsClosed: resource.fdsClosed === true,
    fdErrors: resource.fdErrors,
    killResults: resource.killResults,
  }
  jsonWrite(resource.jsonPath, resource.record)
  persistRun(resource.run)
}

function resolveCommandOutcome(resource, outcome) {
  const resolver = resource.resolveOutcome
  resource.resolveOutcome = undefined
  if (resolver) resolver(outcome)
}

function markCommandTerminal(resource, outcome) {
  if (resource.terminal) return
  resource.terminal = true
  resource.outcome = { ...outcome, timedOut: resource.timedOut === true, processStillRunning: false }
  clearTimeout(resource.timer)
  clearTimeout(resource.graceTimer)
  closeCommandFds(resource)
  activeChildren.delete(resource)
  resolveCommandOutcome(resource, resource.outcome)
  if (resource.resultRef) Object.assign(resource.resultRef, resource.outcome, { timedOut: resource.timedOut, processStillRunning: false })
  notifyCommandWaiters(resource)
  refreshCommandRecord(resource)
}

function storeCommandRecord(run, jsonPath, record) {
  jsonWrite(jsonPath, record)
  run.record.operations.push(record)
  persistRun(run)
  return record
}

function makeCommandRecord(run, options, paths, before, startedAt, outcome) {
  return {
    id: options.id,
    startedAt,
    finishedAt: new Date().toISOString(),
    command: commandText(options.executable, options.args),
    executable: options.executable,
    args: options.args,
    cwd: options.cwd,
    env: selectedEnv(options.env),
    stdout: readFileSync(paths.stdoutPath, 'utf8'),
    stderr: readFileSync(paths.stderrPath, 'utf8'),
    exitCode: outcome.exitCode ?? null,
    signal: outcome.signal ?? null,
    timedOut: outcome.timedOut === true,
    error: outcome.error ?? null,
    spawnError: outcome.spawnError === true,
    processStillRunning: outcome.processStillRunning === true,
    killRequested: outcome.killRequested === true,
    before,
    after: fingerprints(options.afterPaths || options.beforePaths || []),
    rawFiles: {
      stdout: pathForEvidence(paths.stdoutPath),
      stderr: pathForEvidence(paths.stderrPath),
      json: pathForEvidence(paths.jsonPath),
    },
  }
}

async function runCommand(run, options) {
  const id = options.id.replace(/[^A-Za-z0-9._-]/g, '_')
  const paths = {
    stdoutPath: join(run.dir, 'raw', 'commands', id + '.stdout.txt'),
    stderrPath: join(run.dir, 'raw', 'commands', id + '.stderr.txt'),
    jsonPath: join(run.dir, 'raw', 'commands', id + '.json'),
  }
  mkdirSync(dirname(paths.stdoutPath), { recursive: true })
  writeFileSync(paths.stdoutPath, '', 'utf8')
  writeFileSync(paths.stderrPath, '', 'utf8')
  const before = fingerprints(options.beforePaths || [])
  const startedAt = new Date().toISOString()
  const resource = {
    run,
    child: undefined,
    stdoutPath: paths.stdoutPath,
    stderrPath: paths.stderrPath,
    jsonPath: paths.jsonPath,
    before,
    afterPaths: options.afterPaths || options.beforePaths || [],
    stdoutFd: undefined,
    stderrFd: undefined,
    fdsClosed: false,
    terminal: false,
    timedOut: false,
    waiters: new Set(),
    killResults: [],
  }
  try {
    resource.stdoutFd = openSync(paths.stdoutPath, 'w')
    resource.stderrFd = openSync(paths.stderrPath, 'w')
  } catch (error) {
    closeCommandFds(resource)
    return storeCommandRecord(run, paths.jsonPath, makeCommandRecord(run, options, paths, before, startedAt, {
      exitCode: null,
      signal: null,
      timedOut: false,
      error: String(error),
      spawnError: true,
      processStillRunning: false,
    }))
  }
  try {
    resource.child = spawn(options.executable, options.args, {
      cwd: options.cwd,
      env: options.env,
      stdio: ['ignore', resource.stdoutFd, resource.stderrFd],
      windowsHide: true,
    })
  } catch (error) {
    closeCommandFds(resource)
    return storeCommandRecord(run, paths.jsonPath, makeCommandRecord(run, options, paths, before, startedAt, {
      exitCode: null,
      signal: null,
      timedOut: false,
      error: String(error),
      spawnError: true,
      processStillRunning: false,
    }))
  }
  activeChildren.add(resource)
  const timeoutMs = options.timeoutMs ?? 180000
  const graceMs = options.graceMs ?? 5000
  const outcomePromise = new Promise((resolvePromise) => {
    let resolved = false
    const resolveOnce = (value) => {
      if (resolved) return
      resolved = true
      resource.resultRef = value
      resolvePromise(value)
    }
    resource.resolveOutcome = resolveOnce
    resource.timer = setTimeout(() => {
      resource.timedOut = true
      killCommand(resource)
      resource.graceTimer = setTimeout(() => {
        if (!resource.terminal) resolveCommandOutcome(resource, { exitCode: null, signal: null, error: null, timedOut: true, processStillRunning: true, killRequested: true })
      }, graceMs)
    }, timeoutMs)
    resource.child.once('error', (error) => markCommandTerminal(resource, { exitCode: null, signal: null, error: String(error), spawnError: true }))
    resource.child.once('close', (exitCode, signal) => markCommandTerminal(resource, { exitCode, signal, error: null, spawnError: false }))
  })
  const outcome = await outcomePromise
  const record = makeCommandRecord(run, options, paths, before, startedAt, resource.terminal ? resource.outcome : outcome)
  if (!resource.terminal) {
    record.processStillRunning = true
    record.killRequested = resource.killRequested === true
  }
  storeCommandRecord(run, paths.jsonPath, record)
  resource.record = record
  if (resource.terminal) refreshCommandRecord(resource)
  return record
}

async function runProcessWrapperSmoke(run) {
  const commandRecord = await runCommand(run, {
    id: 'oracle-process-wrapper-close',
    executable: process.execPath,
    args: ['-e', 'process.exit(0)'],
    cwd: WORKSPACE,
    env: baseChildEnv(),
    beforePaths: [],
    afterPaths: [],
    timeoutMs: 5000,
    graceMs: 1000,
  })
  const sandboxBlocked = isSandboxSpawnEperm(commandRecord)
  const fdsClosed = commandRecord.resource?.fdsClosed === true
  const active = commandRecord.resource?.active === true
  const clean = commandCompletedCleanly(commandRecord)
  const status = sandboxBlocked ? 'INCOMPLETE' : clean && commandRecord.processStillRunning === false && fdsClosed && active === false ? 'PASS' : 'FAIL'
  const result = {
    status,
    commandCompletedCleanly: clean,
    processStillRunning: commandRecord.processStillRunning,
    fdsClosed,
    active,
    sandboxBlocked,
    commandRecord,
  }
  addArtifact(run, { kind: 'oracle/process-wrapper', result })
  return result
}

function baseChildEnv() {
  const env = {}
  const blocked = /^(DSH_|npm_config_|NPM_CONFIG_|pnpm_config_|PNPM_CONFIG_|HTTP_PROXY$|HTTPS_PROXY$|ALL_PROXY$|NO_PROXY$|HOME$|USERPROFILE$|APPDATA$|LOCALAPPDATA$|TEMP$|TMP$|TMPDIR$|XDG_|COREPACK_HOME$|NODE_PATH$)/i
  for (const [key, value] of Object.entries(process.env)) if (!blocked.test(key) && value !== undefined) env[key] = value
  return env
}

function normalizeConfigPath(file) {
  return resolve(file).replace(/\\/g, '/')
}

function makeChildEnv(instance, registryUrl, storeDir) {
  const env = baseChildEnv()
  const osHome = instance.osHome
  const cache = join(osHome, 'npm-cache')
  const temp = join(osHome, 'temp')
  const userConfig = join(osHome, 'npmrc')
  mkdirSync(cache, { recursive: true })
  mkdirSync(temp, { recursive: true })
  writeFileSync(userConfig, [
    'registry=' + registryUrl,
    'cache=' + normalizeConfigPath(cache),
    'store-dir=' + normalizeConfigPath(storeDir),
    'proxy=',
    'https-proxy=',
    'noproxy=127.0.0.1,localhost',
  ].join(NL) + NL, 'utf8')
  env.DSH_HOME = instance.dshHome
  env.DSH_PROFILE = 'qqbot'
  env.DSH_PROFILE_DIR = join(instance.dshHome, 'profiles', 'qqbot')
  env.HOME = osHome
  env.USERPROFILE = osHome
  env.APPDATA = join(osHome, 'appdata')
  env.LOCALAPPDATA = join(osHome, 'localappdata')
  env.TEMP = temp
  env.TMP = temp
  env.TMPDIR = temp
  env.XDG_CACHE_HOME = cache
  env.XDG_CONFIG_HOME = join(osHome, 'config')
  env.COREPACK_HOME = join(osHome, 'corepack')
  env.npm_config_cache = cache
  env.NPM_CONFIG_CACHE = cache
  env.npm_config_userconfig = userConfig
  env.NPM_CONFIG_USERCONFIG = userConfig
  env.npm_config_registry = registryUrl
  env.NPM_CONFIG_REGISTRY = registryUrl
  env.pnpm_config_store_dir = storeDir
  env.PNPM_CONFIG_STORE_DIR = storeDir
  env.pnpm_config_registry = registryUrl
  env.PNPM_CONFIG_REGISTRY = registryUrl
  env.HTTP_PROXY = ''
  env.HTTPS_PROXY = ''
  env.ALL_PROXY = ''
  env.NO_PROXY = '127.0.0.1,localhost'
  mkdirSync(env.APPDATA, { recursive: true })
  mkdirSync(env.LOCALAPPDATA, { recursive: true })
  mkdirSync(env.XDG_CONFIG_HOME, { recursive: true })
  mkdirSync(env.COREPACK_HOME, { recursive: true })
  return env
}

function startRegistry(run) {
  const requestPath = join(run.dir, 'raw', 'registry-requests.jsonl')
  mkdirSync(dirname(requestPath), { recursive: true })
  writeFileSync(requestPath, '', 'utf8')
  const packages = new Map()
  const server = createServer((request, response) => {
    const rawUrl = request.url || '/'
    const pathname = new URL(rawUrl, 'http://127.0.0.1').pathname
    let decoded
    try { decoded = decodeURIComponent(pathname) } catch { decoded = pathname }
    const parts = decoded.split('/').filter(Boolean)
    let packageName
    let rest
    if (parts[0] && parts[0].startsWith('@')) {
      packageName = parts.slice(0, 2).join('/')
      rest = parts.slice(2)
    } else {
      packageName = parts[0]
      rest = parts.slice(1)
    }
    const item = packageName ? packages.get(packageName) : undefined
    let status = 404
    let kind = 'not-found'
    let body = Buffer.from(JSON.stringify({ error: 'not-found' }))
    if (item && rest.length === 0) {
      status = 200
      kind = 'metadata'
      body = Buffer.from(JSON.stringify(item.metadata))
    } else if (item && rest[0] === '-' && rest[1] === item.tarballName) {
      status = 200
      kind = 'tarball'
      body = item.tarball
    } else if (decoded === '/-/ping') {
      status = 200
      kind = 'ping'
      body = Buffer.from('{}')
    }
    appendFileSync(requestPath, JSON.stringify({ time: new Date().toISOString(), method: request.method, url: rawUrl, decoded, packageName, kind, status }) + NL)
    response.statusCode = status
    response.setHeader('content-type', kind === 'tarball' ? 'application/octet-stream' : 'application/json; charset=utf-8')
    response.setHeader('content-length', String(body.length))
    response.end(body)
  })
  return new Promise((resolvePromise, reject) => {
    server.once('error', reject)
    server.listen(0, '127.0.0.1', () => {
      const address = server.address()
      const port = typeof address === 'object' && address ? address.port : 0
      const url = 'http://127.0.0.1:' + String(port) + '/'
      resolvePromise({
        url,
        requestPath,
        packages,
        addPackage(name, value) { packages.set(name, value) },
        async close() {
          await new Promise((resolveClose) => server.close(() => resolveClose()))
        },
      })
    })
  })
}

function packageDir(root, name) {
  return join(root, 'node_modules', ...name.split('/'))
}

function collectInstalledDependencies(dshInfo, name, seen = new Map()) {
  if (seen.has(name)) return seen
  const source = packageDir(dshInfo.root, name)
  if (!existsSync(source)) throw new IncompleteError('已有安装缺少依赖: ' + name + '，来源 ' + source)
  const manifest = tryReadJson(join(source, 'package.json'))
  if (!manifest || manifest.name !== name) throw new IncompleteError('已有依赖清单不可读或名称不符: ' + source)
  seen.set(name, { source, manifest })
  for (const dependencyName of Object.keys(manifest.dependencies || {})) collectInstalledDependencies(dshInfo, dependencyName, seen)
  return seen
}

function parsePackOutput(text) {
  const trimmed = text.trim()
  try { return JSON.parse(trimmed) } catch {}
  const start = trimmed.indexOf('[')
  const end = trimmed.lastIndexOf(']')
  if (start >= 0 && end > start) return JSON.parse(trimmed.slice(start, end + 1))
  throw new Error('npm pack --json输出不是JSON: ' + trimmed)
}

async function packPackage(run, npm, env, id, sourceDir, destination, beforePaths) {
  mkdirSync(destination, { recursive: true })
  const npmCli = process.platform === 'win32' && /\.cmd$/iu.test(npm) ? join(dirname(npm), 'node_modules', 'npm', 'bin', 'npm-cli.js') : undefined
  const executable = npmCli && existsSync(npmCli) ? process.execPath : npm
  const args = npmCli && existsSync(npmCli) ? [npmCli, 'pack', '--ignore-scripts', '--json', '--pack-destination', destination] : ['pack', '--ignore-scripts', '--json', '--pack-destination', destination]
  const record = await runCommand(run, {
    id,
    executable,
    args,
    cwd: sourceDir,
    env,
    beforePaths,
    afterPaths: [...beforePaths, destination],
  })
  if (record.exitCode !== 0) throw new Error('npm pack失败: ' + id + ' exitCode=' + String(record.exitCode))
  const parsed = parsePackOutput(record.stdout)
  const info = Array.isArray(parsed) ? parsed[0] : parsed
  const candidate = info && info.filename ? join(destination, info.filename) : readdirSync(destination).find((entry) => entry.endsWith('.tgz'))
  if (!candidate || !existsSync(candidate)) throw new Error('npm pack未产出tarball: ' + id)
  const tarball = readFileSync(candidate)
  const manifest = readJson(join(sourceDir, 'package.json'))
  return {
    id,
    sourceDir,
    sourceManifest: manifest,
    tarballPath: candidate,
    tarballName: basename(candidate),
    tarball,
    packInfo: info,
    files: Array.isArray(info?.files) ? info.files.map((item) => item.path) : [],
    sha256: createHash('sha256').update(tarball).digest('hex').toUpperCase(),
    shasum: createHash('sha1').update(tarball).digest('hex'),
    integrity: 'sha512-' + createHash('sha512').update(tarball).digest('base64'),
  }
}

function registryMetadata(registry, packageInfo) {
  const manifest = packageInfo.sourceManifest
  const tarballUrl = registry.url + encodeURIComponent(manifest.name).replace('%40', '@') + '/-/' + packageInfo.tarballName
  const versionManifest = {
    ...manifest,
    dist: { tarball: tarballUrl, shasum: packageInfo.shasum, integrity: packageInfo.integrity },
  }
  return {
    metadata: {
      name: manifest.name,
      'dist-tags': { latest: manifest.version },
      versions: { [manifest.version]: versionManifest },
    },
    tarball: packageInfo.tarball,
    tarballName: packageInfo.tarballName,
  }
}

function copyInstalledRuntimePackage(dshInfo, fixtureRoot, name, seen = new Set()) {
  if (seen.has(name)) return
  seen.add(name)
  const source = packageDir(dshInfo.root, name)
  if (!existsSync(source)) throw new IncompleteError('核心fixture缺少运行依赖: ' + name)
  const destination = join(fixtureRoot, 'node_modules', ...name.split('/'))
  mkdirSync(dirname(destination), { recursive: true })
  if (!existsSync(destination)) cpSync(source, destination, { recursive: true })
  const manifest = tryReadJson(join(source, 'package.json'))
  for (const dependencyName of Object.keys(manifest?.dependencies || {})) copyInstalledRuntimePackage(dshInfo, fixtureRoot, dependencyName, seen)
}

function coreFixture(run, coreSource, dshInfo) {
  const fixtureRoot = join(run.dir, 'fixture', 'core-web')
  if (!existsSync(fixtureRoot)) cpSync(coreSource, fixtureRoot, { recursive: true })
  copyInstalledRuntimePackage(dshInfo, fixtureRoot, '@deepseek-ai/schemastery')
  copyInstalledRuntimePackage(dshInfo, fixtureRoot, 'js-yaml')
  return fixtureRoot
}

function controlledFixture(run) {
  const root = join(run.dir, 'fixture', 'controlled-owner')
  const modules = join(root, 'node_modules')
  const packageRoot = join(modules, 'dsh-extra-plan')
  mkdirSync(packageRoot, { recursive: true })
  const moduleFile = join(packageRoot, 'controlled-owner.mjs')
  const probeFile = join(packageRoot, 'controlled-settings-owner.mjs')
  if (!existsSync(moduleFile)) writeFileSync(moduleFile, 'export default function controlledOwner() {}' + NL, 'utf8')
  if (!existsSync(probeFile)) writeFileSync(probeFile, [
    'export const controlledApplyState = { settings: 0, events: [] }',
    'export default function controlledSettingsOwner() {',
    '  controlledApplyState.settings += 1',
    '  controlledApplyState.events.push("dsh-extra-plan-settings")',
    '}',
  ].join(NL) + NL, 'utf8')
  jsonWrite(join(packageRoot, 'package.json'), {
    name: 'dsh-extra-plan',
    version: '0.0.0-controlled-owner',
    type: 'module',
    exports: { '.': './controlled-owner.mjs', './settings': './controlled-settings-owner.mjs', './package.json': './package.json' },
  })
  return {
    root,
    baseUrl: pathToFileURL(join(root, 'entry.mjs')).href,
    moduleUrl: './node_modules/dsh-extra-plan/controlled-owner.mjs',
    probeFileUrl: pathToFileURL(probeFile).href,
  }
}

async function prepareArtifacts(run, dshInfo, registry) {
  const coreSource = join(WORKSPACE, 'plugins', 'dsh-extra-plan')
  const qqbotSource = join(WORKSPACE, 'plugins', 'dsh-extra-plan-qqbot')
  const sourceFiles = [
    join(qqbotSource, 'package.json'), join(qqbotSource, 'scripts', 'heal.mjs'), join(qqbotSource, 'lib', 'heal.js'), join(qqbotSource, 'cordis.patch.yml'),
    join(coreSource, 'package.json'), join(coreSource, 'cordis.patch.yml'), join(coreSource, 'lib', 'settings.js'),
  ]
  const sourceBefore = fingerprints(sourceFiles)
  const coreRoot = coreFixture(run, coreSource, dshInfo)
  controlledFixture(run)
  const packageRoot = join(run.dir, 'fixture', 'packs')
  const dependencyRoot = join(run.dir, 'fixture', 'dependency-copies')
  const packInstance = makeInstance(join(run.dir, 'fixture', 'pack-environment'), join(run.dir, 'fixture', 'pack-store'))
  const packEnv = makeChildEnv(packInstance, registry.url, packInstance.storeDir)
  const targetPack = await packPackage(run, dshInfo.npm, packEnv, 'pack-target', qqbotSource, packageRoot, [join(qqbotSource, 'package.json'), join(qqbotSource, 'scripts', 'heal.mjs'), join(qqbotSource, 'lib', 'heal.js'), join(qqbotSource, 'cordis.patch.yml')])
  const dependencies = collectInstalledDependencies(dshInfo, 'js-yaml')
  const dependencyPacks = []
  for (const [name, item] of dependencies) {
    const copyPath = join(dependencyRoot, ...name.split('/'))
    mkdirSync(dirname(copyPath), { recursive: true })
    cpSync(item.source, copyPath, { recursive: true })
    const pack = await packPackage(run, dshInfo.npm, packEnv, 'pack-dependency-' + name.replace(/[^A-Za-z0-9._-]/g, '_'), copyPath, packageRoot, [join(item.source, 'package.json')])
    dependencyPacks.push({ name, installedSource: item.source, copyPath, pack })
  }
  const allPackages = [targetPack, ...dependencyPacks.map((item) => item.pack)]
  for (const item of allPackages) registry.addPackage(item.sourceManifest.name, registryMetadata(registry, item))
  const targetFiles = new Set(['package.json', 'scripts/heal.mjs', 'lib/heal.js', 'cordis.patch.yml'])
  const packageAudit = {
    name: targetPack.sourceManifest.name,
    version: targetPack.sourceManifest.version,
    versionExpected: TARGET_VERSION,
    postinstall: targetPack.sourceManifest.scripts?.postinstall,
    expectedPostinstall: 'node scripts/heal.mjs --install',
    filesFromPack: targetPack.files,
    hasExpectedFiles: [...targetFiles].every((file) => targetPack.files.includes('package/' + file) || targetPack.files.includes(file)),
    tarballSha256: targetPack.sha256,
    dependenciesCopiedFromExistingInstall: dependencyPacks.map((item) => ({ name: item.name, installedSource: pathForEvidence(item.installedSource), copyPath: pathForEvidence(item.copyPath), tarballSha256: item.pack.sha256 })),
  }
  if (targetPack.sourceManifest.name !== TARGET_PACKAGE || targetPack.sourceManifest.version !== TARGET_VERSION || packageAudit.postinstall !== packageAudit.expectedPostinstall || !packageAudit.hasExpectedFiles) throw new Error('标准包审计失败: ' + JSON.stringify(packageAudit))
  const sourceAfter = fingerprints(sourceFiles)
  const sourceUnchanged = JSON.stringify(sourceBefore) === JSON.stringify(sourceAfter)
  const artifact = { coreFixture: pathForEvidence(coreRoot), controlledFixture: pathForEvidence(join(run.dir, 'fixture', 'controlled-owner')), packageAudit, sourceBefore, sourceAfter, sourceUnchanged }
  addArtifact(run, artifact)
  return { coreRoot, targetPack, dependencyPacks, sourceBefore, sourceAfter, sourceUnchanged, packageAudit }
}

function profilePatch(options = {}) {
  if (options.patch === 'missing') return null
  if (options.patch === 'invalid') return 'broken: [invalid' + NL
  const legacy = options.legacy === false ? '' : [
    '- id: code-runtime',
    '  name: @deepseek-ai/dsh-code-runtime-worker-thread',
  ].join(NL) + NL
  return '# fixture user comment' + NL + legacy + [
    '- id: fixture-user-row',
    '  name: fixture/user',
    '  config:',
    '    userField: preserve-me',
  ].join(NL) + NL
}

function writeProfile(home, profileName, options = {}) {
  const profileDir = join(home, 'profiles', profileName)
  const nodeModules = join(profileDir, 'node_modules')
  mkdirSync(nodeModules, { recursive: true })
  jsonWrite(join(profileDir, 'package.json'), {
    name: profileName,
    version: '0.0.0-fixture',
    private: true,
    dsh: { profile: { bundles: options.nativeMarker === false ? [] : ['@tencent-connect/dsh-qqbot'] } },
    dependencies: {},
    fixtureOwner: 'controlled-fixture-only',
  })
  if (options.patch !== 'missing') {
    const text = profilePatch(options)
    if (text !== null) writeFileSync(join(profileDir, 'cordis.patch.yml'), text, 'utf8')
  }
  writeFileSync(join(profileDir, 'pnpm-workspace.yaml'), [
    'onlyBuiltDependencies:',
    options.allowBuild === false ? '  []' : '  - ' + TARGET_PACKAGE,
  ].join(NL) + NL, 'utf8')
  return profileDir
}

function createHome(instance, coreRoot, options = {}) {
  const home = instance.dshHome
  const profileDir = writeProfile(home, 'qqbot', options)
  const webDir = join(home, 'profiles', 'web')
  const webModules = join(webDir, 'node_modules')
  mkdirSync(webModules, { recursive: true })
  jsonWrite(join(webDir, 'package.json'), { name: 'web', version: '0.0.0-fixture', private: true })
  if (options.withWeb !== false) {
    const webTarget = join(webModules, CORE_PACKAGE)
    const targetRoot = options.webName === 'wrong-name' ? join(instance.root, 'wrong-web-core') : coreRoot
    if (options.webName === 'wrong-name' && !existsSync(targetRoot)) {
      mkdirSync(targetRoot, { recursive: true })
      jsonWrite(join(targetRoot, 'package.json'), { name: 'wrong-web-name', version: '0.0.0' })
    }
    symlinkSync(targetRoot, webTarget, process.platform === 'win32' ? 'junction' : 'dir')
  }
  if (options.target === 'entity') mkdirSync(join(profileDir, 'node_modules', CORE_PACKAGE), { recursive: true })
  if (options.target === 'other-link') {
    const foreign = join(instance.root, 'foreign-target')
    mkdirSync(foreign, { recursive: true })
    jsonWrite(join(foreign, 'package.json'), { name: 'foreign', version: '0.0.0' })
    symlinkSync(foreign, join(profileDir, 'node_modules', CORE_PACKAGE), process.platform === 'win32' ? 'junction' : 'dir')
  }
  if (options.target === 'broken-link') {
    const brokenTarget = join(profileDir, 'node_modules', CORE_PACKAGE)
    const brokenSource = join(instance.root, 'missing-target.txt')
    try {
      symlinkSync(brokenSource, brokenTarget, 'file')
      instance.fixtureConstruction = { status: 'constructed', path: pathForEvidence(brokenTarget), source: pathForEvidence(brokenSource) }
    } catch (error) {
      instance.fixtureConstruction = { status: 'INCOMPLETE', path: pathForEvidence(brokenTarget), source: pathForEvidence(brokenSource), error: String(error && error.message || error), code: error?.code }
    }
  }
  if (options.multiple) {
    const otherDir = writeProfile(home, 'qqbot-other', { nativeMarker: true, allowBuild: options.allowBuild })
    const futureTarget = join(profileDir, 'node_modules', TARGET_PACKAGE)
    const otherTarget = join(otherDir, 'node_modules', TARGET_PACKAGE)
    let futureLink = false
    try {
      symlinkSync(futureTarget, otherTarget, process.platform === 'win32' ? 'junction' : 'dir')
      futureLink = true
    } catch {}
    instance.multipleTarget = { otherTarget, futureTarget, futureLink }
  }
  return { profileDir, webDir }
}

function inspectInstallState(instance, commandRecord) {
  const profileDir = join(instance.dshHome, 'profiles', 'qqbot')
  const target = join(profileDir, 'node_modules', TARGET_PACKAGE)
  const coreTarget = join(profileDir, 'node_modules', CORE_PACKAGE)
  const web = join(instance.dshHome, 'profiles', 'web', 'node_modules', CORE_PACKAGE)
  const pkg = tryReadJson(join(profileDir, 'package.json'))
  const patchPath = join(profileDir, 'cordis.patch.yml')
  const patchText = existsSync(patchPath) ? readFileSync(patchPath, 'utf8') : undefined
  let targetStat
  try { targetStat = lstatSync(target) } catch {}
  let targetReal
  try { targetReal = realpathSync(target) } catch {}
  let coreTargetStat
  try { coreTargetStat = lstatSync(coreTarget) } catch {}
  let coreTargetReal
  try { coreTargetReal = realpathSync(coreTarget) } catch {}
  let webReal
  try { webReal = realpathSync(web) } catch {}
  const hookOutput = String(commandRecord?.stdout || '') + String(commandRecord?.stderr || '')
  const backups = existsSync(profileDir) ? readdirSync(profileDir).filter((name) => name.startsWith('cordis.patch.yml.bak-')).sort() : []
  return {
    profile: 'qqbot',
    targetPath: pathForEvidence(target),
    targetType: targetStat ? (targetStat.isSymbolicLink() ? 'symlink' : targetStat.isDirectory() ? 'directory' : 'file') : 'missing',
    targetRealPath: targetReal ? pathForEvidence(targetReal) : undefined,
    compatPackageExists: Boolean(targetStat),
    coreTargetPath: pathForEvidence(coreTarget),
    coreTargetType: coreTargetStat ? (coreTargetStat.isSymbolicLink() ? 'symlink' : coreTargetStat.isDirectory() ? 'directory' : 'file') : 'missing',
    coreTargetRealPath: coreTargetReal ? pathForEvidence(coreTargetReal) : undefined,
    webRealPath: webReal ? pathForEvidence(webReal) : undefined,
    linkedToWeb: Boolean(coreTargetReal && webReal && (process.platform === 'win32' ? coreTargetReal.toLowerCase() === webReal.toLowerCase() : coreTargetReal === webReal)),
    profileDependency: pkg?.dependencies?.[TARGET_PACKAGE],
    profileDependencyInstalled: Boolean(pkg?.dependencies?.[TARGET_PACKAGE]),
    selectedBundle: Array.isArray(pkg?.dsh?.profile?.bundles) && pkg.dsh.profile.bundles.includes(TARGET_PACKAGE),
    userFieldPreserved: typeof patchText === 'string' && patchText.includes('userField: preserve-me'),
    legacyCodeRuntimeRemoved: typeof patchText === 'string' && !patchText.includes('dsh-code-runtime-worker-thread'),
    patchExists: patchText !== undefined,
    patchSha256: patchText === undefined ? undefined : createHash('sha256').update(patchText).digest('hex').toUpperCase(),
    backupCount: backups.length,
    backups,
    strictHookCompleted: hookOutput.includes('严格安装完成'),
    strictReasons: ['web-source-missing', 'target-count', 'target-entity', 'target-other-link', 'target-link-unresolved', 'patch-failed', 'candidate-root-unresolved'].filter((reason) => hookOutput.includes(reason)),
    rootPackageExists: existsSync(join(instance.dshHome, 'package.json')),
  }
}

function installBeforeAfterPaths(instance, storeDir) {
  const profile = join(instance.dshHome, 'profiles', 'qqbot')
  return [
    join(instance.dshHome, 'package.json'),
    join(profile, 'package.json'),
    join(profile, 'cordis.patch.yml'),
    join(profile, 'pnpm-workspace.yaml'),
    join(profile, 'node_modules', TARGET_PACKAGE),
    join(profile, 'node_modules', CORE_PACKAGE),
    join(instance.dshHome, 'profiles', 'web', 'node_modules', CORE_PACKAGE),
    storeDir,
  ]
}

async function runDshAdd(run, dshInfo, registry, instance, options = {}) {
  const env = makeChildEnv(instance, registry.url, instance.storeDir)
  const args = [dshInfo.cliPath, 'plugin', '--profile', 'qqbot', 'add', TARGET_PACKAGE, '--registry=' + registry.url]
  if (options.allowBuild !== false) args.push('--allow-build=' + TARGET_PACKAGE)
  return await runCommand(run, {
      id: options.id || 'dsh-add-' + basename(instance.root),
      executable: process.execPath,
      args,
      cwd: instance.dshHome,
      env,
      beforePaths: installBeforeAfterPaths(instance, instance.storeDir),
      afterPaths: installBeforeAfterPaths(instance, instance.storeDir),
      timeoutMs: options.timeoutMs || 180000,
    })
}

function makeInstance(root, storeDir) {
  const instance = { root, dshHome: join(root, 'dsh-home'), osHome: join(root, 'os-home'), storeDir }
  mkdirSync(instance.dshHome, { recursive: true })
  mkdirSync(instance.osHome, { recursive: true })
  return instance
}

function successObserved(record, state) {
  return commandCompletedCleanly(record) && state.compatPackageExists === true && state.linkedToWeb && state.strictHookCompleted
}

function commandCompletedCleanly(record) {
  return Boolean(record) && Number.isInteger(record.exitCode) && record.exitCode === 0 && record.timedOut === false && record.signal === null && (record.error === null || record.error === undefined || record.error === '') && record.spawnError !== true && record.processStillRunning === false
}

function commandHasExpectedFailure(record, reason, state) {
  if (!record || !Number.isInteger(record.exitCode) || record.exitCode === 0 || record.timedOut !== false || record.signal !== null || !(record.error === null || record.error === undefined || record.error === '') || record.processStillRunning !== false) return false
  const output = String(record.stdout || '') + String(record.stderr || '')
  if (isSandboxSpawnEperm(record) || /MODULE_NOT_FOUND|\bTIMEOUT\b/i.test(output)) return false
  const reasons = new Set(state?.strictReasons || [])
  if (/Ignored build scripts:\s*dsh-extra-plan-qqbot|approve-builds|IGNORED_BUILDS/i.test(output)) reasons.add('authorization-blocked')
  return reasons.has(reason)
}

function expectedFailureObserved(spec, record, state) {
  return commandHasExpectedFailure(record, spec.expected, state)
}

function isSandboxSpawnEperm(record) {
  return /\bspawn EPERM\b/i.test([record?.error, record?.stdout, record?.stderr].filter(Boolean).join(' '))
}

function classifyCaseStatus({ pass, fail, sandboxBlocked = false, notCovered = false }) {
  if (fail) return 'FAIL'
  if (sandboxBlocked || notCovered) return 'INCOMPLETE'
  return pass ? 'PASS' : 'FAIL'
}

function classifyInstallResult({ normalPass, normalClean = normalPass, errorMatrixPass, errors, normalSandboxBlocked = false, errorMatrixSandboxBlocked = false, sandboxBlocked = false, sourceUnchanged, loopbackOnly }) {
  const notCovered = errors.some((item) => item.notCovered === true || item.status === 'NOT-COVERED')
  const matrixSandboxBlocked = errorMatrixSandboxBlocked || errors.some((item) => item.sandboxBlocked === true)
  const anySandboxBlocked = normalSandboxBlocked || matrixSandboxBlocked || sandboxBlocked
  const confirmedFailure = errors.some((item) => item.status === 'FAIL' || (item.observed === false && item.notCovered !== true && item.sandboxBlocked !== true))
  const normalFailure = !normalSandboxBlocked && (normalClean !== true || !normalPass)
  const structuralFailure = !normalSandboxBlocked && (!normalPass || !sourceUnchanged || !loopbackOnly)
  const fail = confirmedFailure || normalFailure || structuralFailure
  const pass = normalPass && errorMatrixPass && sourceUnchanged && loopbackOnly
  return {
    status: classifyCaseStatus({ pass, fail, sandboxBlocked: anySandboxBlocked, notCovered }),
    pass,
    fail,
    notCovered,
    normalClean,
    normalSandboxBlocked,
    errorMatrixSandboxBlocked: matrixSandboxBlocked,
    sandboxBlocked: anySandboxBlocked,
  }
}

function classifyCacheResult({ firstRecord, firstState, secondRecord, secondState }) {
  const records = [firstRecord, secondRecord]
  const sandboxBlocked = records.some(isSandboxSpawnEperm)
  const firstSandboxBlocked = isSandboxSpawnEperm(firstRecord)
  const secondSandboxBlocked = isSandboxSpawnEperm(secondRecord)
  const firstClean = commandCompletedCleanly(firstRecord)
  const secondClean = commandCompletedCleanly(secondRecord)
  const firstReady = firstClean && firstState?.compatPackageExists === true && firstState?.strictHookCompleted === true && firstState?.linkedToWeb === true && firstState?.selectedBundle === true
  const secondReady = secondClean && secondState?.compatPackageExists === true && secondState?.linkedToWeb === true && secondState?.selectedBundle === true
  const secondDependencyWritten = Boolean(secondState?.profileDependencyInstalled ?? secondState?.profileDependency)
  const cacheBlocked = !sandboxBlocked && firstReady && secondClean && secondState?.compatPackageExists === true && secondDependencyWritten && secondState?.selectedBundle === true && secondState?.strictHookCompleted !== true && secondState?.linkedToWeb !== true
  const pass = !sandboxBlocked && firstReady && secondReady
  const recordFailure = (!firstClean && !firstSandboxBlocked) || (!secondClean && !secondSandboxBlocked)
  const fail = recordFailure || (!sandboxBlocked && !cacheBlocked && !pass)
  return {
    status: cacheBlocked ? 'CACHE-BLOCKED' : classifyCaseStatus({ pass, fail, sandboxBlocked }),
    firstClean,
    secondClean,
    firstReady,
    secondReady,
    secondDependencyWritten,
    firstSandboxBlocked,
    secondSandboxBlocked,
    recordFailure,
    sandboxBlocked,
    cacheBlocked,
    pass,
    fail,
  }
}

function assertOracleContracts() {
  const cleanBusinessFailure = { exitCode: 17, timedOut: false, signal: null, error: null, processStillRunning: false, stdout: '', stderr: '' }
  const businessSpec = { expected: 'target-count' }
  const businessState = { strictReasons: ['target-count'] }
  const cacheReadyState = { compatPackageExists: true, strictHookCompleted: true, linkedToWeb: true, selectedBundle: true, profileDependencyInstalled: true }
  const cacheBlockedState = { compatPackageExists: true, strictHookCompleted: false, linkedToWeb: false, selectedBundle: true, profileDependencyInstalled: true }
  const cleanSuccess = { exitCode: 0, timedOut: false, signal: null, error: null, processStillRunning: false }
  const checks = [
    { name: 'matching-business-nonzero', expected: true, actual: expectedFailureObserved(businessSpec, cleanBusinessFailure, businessState) },
    { name: 'timeout-rejected', expected: false, actual: expectedFailureObserved(businessSpec, { ...cleanBusinessFailure, exitCode: null, timedOut: true }, businessState) },
    { name: 'signal-rejected', expected: false, actual: expectedFailureObserved(businessSpec, { ...cleanBusinessFailure, exitCode: null, signal: 'SIGTERM' }, businessState) },
    { name: 'spawn-error-rejected', expected: false, actual: expectedFailureObserved(businessSpec, { ...cleanBusinessFailure, exitCode: null, error: 'spawn EPERM', spawnError: true }, businessState) },
    { name: 'unknown-nonzero-rejected', expected: false, actual: expectedFailureObserved(businessSpec, { ...cleanBusinessFailure, exitCode: 19 }, { strictReasons: [] }) },
    { name: 'fail-precedes-not-covered', expected: 'FAIL', actual: classifyInstallResult({ normalPass: false, errorMatrixPass: false, errors: [{ status: 'FAIL', observed: false }, { status: 'NOT-COVERED', observed: false, notCovered: true }], sandboxBlocked: false, sourceUnchanged: true, loopbackOnly: true }).status },
    { name: 'normal-failure-precedes-matrix-sandbox', expected: 'FAIL', actual: classifyInstallResult({ normalPass: false, normalClean: false, errorMatrixPass: false, errors: [{ status: 'INCOMPLETE', sandboxBlocked: true }], normalSandboxBlocked: false, errorMatrixSandboxBlocked: true, sourceUnchanged: true, loopbackOnly: true }).status },
    { name: 'normal-sandbox-only-is-incomplete', expected: 'INCOMPLETE', actual: classifyInstallResult({ normalPass: false, normalClean: false, errorMatrixPass: false, errors: [], normalSandboxBlocked: true, sourceUnchanged: true, loopbackOnly: true }).status },
    { name: 'only-not-covered-is-incomplete', expected: 'INCOMPLETE', actual: classifyInstallResult({ normalPass: true, errorMatrixPass: false, errors: [{ status: 'NOT-COVERED', observed: false, notCovered: true }], sandboxBlocked: false, sourceUnchanged: true, loopbackOnly: true }).status },
    { name: 'second-ordinary-failure-not-cache-blocked', expected: 'FAIL', actual: classifyCacheResult({ firstRecord: cleanSuccess, firstState: cacheReadyState, secondRecord: { ...cleanSuccess, exitCode: 1 }, secondState: cacheBlockedState }).status },
    { name: 'legal-cache-blocked', expected: 'CACHE-BLOCKED', actual: classifyCacheResult({ firstRecord: cleanSuccess, firstState: cacheReadyState, secondRecord: cleanSuccess, secondState: cacheBlockedState }).status },
    { name: 'sandbox-eperm-incomplete', expected: 'INCOMPLETE', actual: classifyCacheResult({ firstRecord: { ...cleanSuccess, exitCode: null, error: 'Error: spawn EPERM', spawnError: true }, firstState: cacheReadyState, secondRecord: cleanSuccess, secondState: cacheBlockedState }).status },
  ]
  return { status: checks.every((check) => check.actual === check.expected) ? 'PASS' : 'FAIL', pure: true, checks }
}

async function runInstall(run, dshInfo) {
  const registry = await startRegistry(run)
  try {
    const artifacts = await prepareArtifacts(run, dshInfo, registry)
    const caseRoot = join(run.dir, 'fixture', 'install')
    const store = join(caseRoot, 'cold-store')
    const cold = makeInstance(join(caseRoot, 'cold'), store)
    createHome(cold, artifacts.coreRoot, { legacy: true, allowBuild: true })
    const coldAdd = await runDshAdd(run, dshInfo, registry, cold, { id: 'dsh-add-cold' })
    const coldState = inspectInstallState(cold, coldAdd)
    const beforeRepeat = fingerprints([join(cold.dshHome, 'profiles', 'qqbot', 'cordis.patch.yml'), join(cold.dshHome, 'profiles', 'qqbot', 'package.json')])
    const repeatAdd = await runDshAdd(run, dshInfo, registry, cold, { id: 'dsh-add-repeat' })
    const repeatState = inspectInstallState(cold, repeatAdd)
    const afterRepeat = fingerprints([join(cold.dshHome, 'profiles', 'qqbot', 'cordis.patch.yml'), join(cold.dshHome, 'profiles', 'qqbot', 'package.json')])
    const repeatStable = JSON.stringify(beforeRepeat) === JSON.stringify(afterRepeat) && repeatState.linkedToWeb && commandCompletedCleanly(repeatAdd)
    const errors = []
    const errorSpecs = [
      { name: 'missing-web', withWeb: false, expected: 'web-source-missing' },
      { name: 'no-target', nativeMarker: false, expected: 'target-count' },
      { name: 'invalid-patch', patch: 'invalid', expected: 'patch-failed' },
      { name: 'multi-target', multiple: true, staticMultiple: true, expected: 'target-count' },
      { name: 'target-entity', target: 'entity', expected: 'target-entity' },
      { name: 'target-other-link', target: 'other-link', expected: 'target-other-link' },
      { name: 'target-broken-link', target: 'broken-link', expected: 'target-link-unresolved' },
      { name: 'unauthorized', allowBuild: false, noAuthorization: true, expected: 'authorization-blocked' },
      { name: 'no-patch-file', patch: 'missing', expectedSuccess: true },
    ]
    for (const spec of errorSpecs) {
      const instance = makeInstance(join(caseRoot, 'errors', spec.name), join(caseRoot, 'errors', spec.name, 'store'))
      createHome(instance, artifacts.coreRoot, {
        withWeb: spec.withWeb,
        nativeMarker: spec.nativeMarker,
        patch: spec.patch,
        target: spec.target,
        multiple: spec.multiple,
        allowBuild: spec.allowBuild !== false,
      })
      if (spec.staticMultiple && !instance.multipleTarget?.futureLink) {
        errors.push({ name: spec.name, expected: spec.expected, status: 'NOT-COVERED', reason: 'static multi-target candidate could not be created before add; no asynchronous mutation and no add evidence claimed', observed: false, notCovered: true, state: { staticCandidatePrepared: false } })
        continue
      }
      if (spec.target === 'broken-link' && instance.fixtureConstruction?.status !== 'constructed') {
        errors.push({ name: spec.name, expected: spec.expected, status: 'NOT-COVERED', notCovered: true, observed: false, reason: 'broken-link fixture construction rejected before add', construction: instance.fixtureConstruction, state: { target: pathForEvidence(join(instance.dshHome, 'profiles', 'qqbot', 'node_modules', CORE_PACKAGE)) } })
        continue
      }
      const command = await runDshAdd(run, dshInfo, registry, instance, { id: 'dsh-add-error-' + spec.name, allowBuild: !spec.noAuthorization })
      const state = inspectInstallState(instance, command)
      const expectedSuccess = spec.expectedSuccess === true
      const observedReason = expectedSuccess ? false : expectedFailureObserved(spec, command, state)
      const observed = expectedSuccess ? successObserved(command, state) : observedReason
      const commandSandboxBlocked = isSandboxSpawnEperm(command)
      errors.push({ name: spec.name, expected: expectedSuccess ? 'success/no-file' : spec.expected, commandId: command.id, commandRecord: command, exitCode: command.exitCode, sandboxBlocked: commandSandboxBlocked, observedReason, observed, notCovered: false, status: commandSandboxBlocked ? 'INCOMPLETE' : observed ? 'PASS' : 'FAIL', state })
    }
    const normalRecords = [coldAdd, repeatAdd]
    const normalClean = normalRecords.every(commandCompletedCleanly)
    const normalSandboxBlocked = normalRecords.some(isSandboxSpawnEperm)
    const errorMatrixSandboxBlocked = errors.some((item) => item.sandboxBlocked === true)
    const sandboxBlocked = normalSandboxBlocked || errorMatrixSandboxBlocked
    const errorMatrixPass = errors.every((item) => item.status === 'PASS')
    const normalPass = normalClean && coldState.compatPackageExists === true && coldState.linkedToWeb === true && coldState.strictHookCompleted && coldState.selectedBundle && coldState.userFieldPreserved && coldState.legacyCodeRuntimeRemoved && repeatState.compatPackageExists === true && repeatState.linkedToWeb === true && repeatStable
    const sourceUnchanged = artifacts.sourceUnchanged && JSON.stringify(artifacts.sourceBefore) === JSON.stringify(artifacts.sourceAfter)
    const requestLines = existsSync(registry.requestPath) ? readFileSync(registry.requestPath, 'utf8').split(NL).filter(Boolean).map((line) => JSON.parse(line)) : []
    const loopbackOnly = requestLines.every((item) => String(item.url).startsWith('/') || String(item.url).includes('127.0.0.1'))
    const classification = classifyInstallResult({ normalPass, normalClean, errorMatrixPass, errors, normalSandboxBlocked, errorMatrixSandboxBlocked, sourceUnchanged, loopbackOnly })
    const result = {
      status: classification.status,
      scope: '临时标准包/临时DSH_HOME/临时qqbot fixture；不等于真实QQBot或生产实测',
      dsh: { root: pathForEvidence(dshInfo.root), version: dshInfo.version, cli: pathForEvidence(dshInfo.cliPath), pnpm: pathForEvidence(dshInfo.pnpm), npm: pathForEvidence(dshInfo.npm) },
      commandContract: { normal: 'dsh plugin --profile qqbot add dsh-extra-plan-qqbot --registry=<loopback> --allow-build=dsh-extra-plan-qqbot', unauthorizedCase: '仅错误矩阵故意省略allow-build', noHealRebuildActivationAfterAdd: true },
      packageAudit: artifacts.packageAudit,
      cold: { commandId: coldAdd.id, exitCode: coldAdd.exitCode, compatPackageInstalled: coldState.compatPackageExists, coreLinkToWeb: coldState.linkedToWeb, state: coldState },
      repeat: { commandId: repeatAdd.id, exitCode: repeatAdd.exitCode, stable: repeatStable, compatPackageInstalled: repeatState.compatPackageExists, coreLinkToWeb: repeatState.linkedToWeb, state: repeatState },
      errors,
      checks: { normalPass, normalClean, normalSandboxBlocked, errorMatrixPass, errorMatrixSandboxBlocked, sandboxBlocked, sourceUnchanged, loopbackOnly, requestCount: requestLines.length, classification },
      rawRegistryRequests: pathForEvidence(registry.requestPath),
    }
    addArtifact(run, { kind: 'install-result', result })
    return result
  } finally {
    await registry.close()
  }
}

function userSettingsConfig() {
  return {
    anchoredBootstrap: false,
    creativeMode: true,
    webFetch: true,
    toolPresentationMode: 'ptc',
    runcodeCatchGate: true,
    crossProviderPlannerModel: true,
    plannerModel: 'user-planner',
    plannerPromptSuffix: 'user-suffix',
    exploreBudget: 37,
    otherAgentModel: 'user-other',
    gateWords: {
      routeDirect: 'user-a',
      routePlan: 'user-b',
      routeDisagree: 'user-c',
      approvalApprove: 'user-d',
      approvalReplan: 'user-e',
      purposeRefine: 'user-f',
      purposeRedo: 'user-g',
    },
  }
}

async function runCompose(run, dshInfo) {
  const processWrapper = await runProcessWrapperSmoke(run)
  const coreSource = join(WORKSPACE, 'plugins', 'dsh-extra-plan')
  const coreRoot = coreFixture(run, coreSource, dshInfo)
  const controlled = controlledFixture(run)
  const dshRequire = createRequire(pathToFileURL(join(dshInfo.root, 'package.json')).href)
  const yaml = dshRequire('yaml')
  const appBoot = await import(pathToFileURL(join(dshInfo.nodeModules, '@deepseek-ai', 'dsh-app-boot', 'lib', 'index.js')).href)
  const loaderModule = await import(pathToFileURL(join(dshInfo.nodeModules, '@deepseek-ai', 'cordis-plugin-loader', 'lib', 'index.js')).href)
  const cordis = await import(pathToFileURL(join(dshInfo.nodeModules, '@deepseek-ai', 'cordis', 'lib', 'index.js')).href)
  const previousAppData = process.env.APPDATA
  process.env.APPDATA = join(run.dir, 'fixture', 'compose-appdata')
  let settingsModule
  try {
    settingsModule = await import(pathToFileURL(join(coreRoot, 'lib', 'settings.js')).href)
  } finally {
    if (previousAppData === undefined) delete process.env.APPDATA
    else process.env.APPDATA = previousAppData
  }
  const corePatch = yaml.parse(readFileSync(join(coreSource, 'cordis.patch.yml'), 'utf8'))
  const compatPatch = yaml.parse(readFileSync(join(WORKSPACE, 'plugins', 'dsh-extra-plan-qqbot', 'cordis.patch.yml'), 'utf8'))
  const nativeLayer = [{ insert: [{ id: 'qqbot-native-marker', name: '@tencent-connect/dsh-qqbot' }] }]
  const userConfig = userSettingsConfig()
  const userBundleEntries = [
    { id: 'fixture-user-bundle', name: 'fixture/user-bundle', config: { marker: 'keep-user-field', customValue: 17 } },
    { id: 'fixture-user-note', name: 'fixture/user-note', config: { note: 'unmanaged-user-value' } },
  ]
  const userSettingsPatch = { id: SETTINGS_ROW_ID, name: 'dsh-extra-plan/settings', config: structuredClone(userConfig) }
  const userLayer = [userSettingsPatch, { insert: structuredClone(userBundleEntries) }]
  const userLayerExpected = [structuredClone(userSettingsPatch), { insert: structuredClone(userBundleEntries) }]
  const scenarios = [
    { name: 'compat-only', layers: [nativeLayer, compatPatch, userLayer], composedExpected: 1, expectedConfig: structuredClone(userConfig) },
    { name: 'old-double-core-then-compat', layers: [nativeLayer, corePatch, compatPatch, userLayer], composedExpected: 2, expectedConfig: structuredClone(userConfig) },
    { name: 'old-double-compat-then-core', layers: [nativeLayer, compatPatch, corePatch, userLayer], composedExpected: 2, expectedConfig: structuredClone(userConfig) },
  ]
  const results = []
  for (const scenario of scenarios) {
    const userLayerInput = scenario.layers.at(-1)
    const userInsertPatch = userLayerInput.find((patch) => Array.isArray(patch.insert))
    const userBefore = structuredClone(userInsertPatch?.insert || [])
    const userLayerInputPath = join(run.dir, 'raw', 'compose', scenario.name, 'user-layer.input.json')
    jsonWrite(userLayerInputPath, userLayerInput)
    const userBeforePath = join(run.dir, 'raw', 'compose', scenario.name, 'user-bundle.before.json')
    jsonWrite(userBeforePath, userBefore)
    globalThis.__controlledApply = { settings: 0, events: [] }
    const composed = appBoot.composeEntries(scenario.layers)
    const composedSettings = composed.filter((row) => row && row.id === SETTINGS_ROW_ID)
    const probeName = controlled.probeFileUrl + '?case=' + encodeURIComponent(scenario.name)
    const loaderRows = structuredClone(composed).map((row) => ({
      ...row,
      fixtureOriginalName: row.name,
      name: row.id === SETTINGS_ROW_ID ? probeName : controlled.moduleUrl,
    }))
    const context = new cordis.Context()
    const loader = new loaderModule.Loader(context, { baseUrl: controlled.baseUrl })
    let ownerImport
    try { ownerImport = { ok: true, namespace: await loader.import(probeName) } }
    catch (error) { ownerImport = { ok: false, error: String(error && error.stack || error) } }
    let authority
    let rawPath
    let userAfterPath
    try {
      await loader.root.update(loaderRows)
      await loader.await()
      const effective = [...loader.entries()]
      const effectiveSettings = effective.filter((entry) => entry.options.id === SETTINGS_ROW_ID)
      const probeNamespace = effectiveSettings[0]?.moduleNamespace
      const probeState = structuredClone(probeNamespace?.controlledApplyState || { settings: 0, events: [] })
      for (const entry of effectiveSettings) entry.options.name = 'dsh-extra-plan/settings'
      const userAfter = effective.filter((entry) => entry.options.id === 'fixture-user-bundle' || entry.options.id === 'fixture-user-note').map((entry) => ({
        id: entry.options.id,
        name: entry.options.fixtureOriginalName,
        config: structuredClone(entry.options.config),
      }))
      userAfterPath = join(run.dir, 'raw', 'compose', scenario.name, 'user-bundle.after.json')
      jsonWrite(userAfterPath, userAfter)
      const expectedValues = { ...scenario.expectedConfig }
      delete expectedValues.gateWords
      const expectedAuthority = { values: expectedValues, gateWords: scenario.expectedConfig.gateWords }
      rawPath = join(run.dir, 'raw', 'compose', scenario.name, 'authority.patch.json')
      jsonWrite(rawPath, [
        { id: SETTINGS_ROW_ID, name: 'dsh-extra-plan/settings', config: structuredClone(scenario.expectedConfig) },
        ...structuredClone(userBefore),
      ])
      const editor = {
        documentPath: rawPath,
        configuration: () => effective.map((entry) => ({ entry, disabled: false, inherited: {}, override: undefined })),
      }
      authority = settingsModule.inspectSettingsAuthority(editor)
      const userBundlesPreserved = isDeepStrictEqual(userAfter, userBefore)
      const checks = {
        loaderIsEntryTree: loader instanceof loaderModule.EntryTree,
        rootIsEntryGroup: loader.root instanceof loaderModule.EntryGroup,
        composedSettingsCount: composedSettings.length === scenario.composedExpected,
        userLayerInputDeepEqual: isDeepStrictEqual(userLayerInput, userLayerExpected),
        composedUserConfigDeepEqual: isDeepStrictEqual(composedSettings.at(-1)?.config, scenario.expectedConfig),
        effectiveSettingsCount: effectiveSettings.length === 1,
        effectiveConfigDeepEqual: isDeepStrictEqual(effectiveSettings[0]?.options.config, scenario.expectedConfig),
        ownerApplyOnceAfterSettle: probeState.settings === 1 && probeState.events.length === 1,
        authorityOk: authority.status === 'ok',
        authorityRawOne: authority.rawCount === 1 && authority.canonicalNameCount === 1,
        fullTenAndSeven: authority.selectedConfig?.values !== undefined && Object.keys(authority.selectedConfig.values).length === 10 && Object.keys(authority.selectedConfig.gateWords || {}).length === 7,
        fullConfigDeepEqual: isDeepStrictEqual(authority.selectedConfig, expectedAuthority),
        userBundlesPreserved,
      }
      results.push({
        name: scenario.name,
        status: Object.values(checks).every(Boolean) ? 'PASS' : 'FAIL',
        ownerScope: 'controlled Loader owner probe only; native marker and user bundles are fixture labels, not real QQBot',
        composedRowCount: composed.length,
        composedSettingsCount: composedSettings.length,
        effectiveEntryCount: effective.length,
        effectiveSettingsCount: effectiveSettings.length,
        ownerApplyCount: probeState.settings,
        ownerApplyEvents: probeState.events,
        ownerModuleLoaded: Boolean(effectiveSettings[0]?.moduleNamespace),
        ownerFiberLoaded: Boolean(effectiveSettings[0]?.fiber),
        ownerInitPending: Boolean(effectiveSettings[0]?._initTask),
        ownerImportOk: ownerImport.ok,
        ownerImportError: ownerImport.error,
        authority,
        expectedAuthority,
        userLayer: {
          inputPath: pathForEvidence(userLayerInputPath),
          input: userLayerInput,
          expected: userLayerExpected,
        },
        userBundle: {
          beforePath: pathForEvidence(userBeforePath),
          afterPath: pathForEvidence(userAfterPath),
          beforeSha256: fileSha256(userBeforePath),
          afterSha256: fileSha256(userAfterPath),
          before: userBefore,
          after: userAfter,
        },
        checks,
        rawAuthorityPath: pathForEvidence(rawPath),
      })
    } finally {
      try { loader.root.stop() } catch {}
      try { await Promise.resolve(context.fiber.dispose()) } catch {}
    }
  }
  const scenariosPass = results.every((item) => item.status === 'PASS')
  const status = processWrapper.status === 'FAIL' || !scenariosPass ? 'FAIL' : processWrapper.status === 'INCOMPLETE' ? 'INCOMPLETE' : 'PASS'
  const result = { status, scope: '真实Loader/EntryGroup/EntryTree + 受控owner apply probe + 核心inspectSettingsAuthority；不冒充真实QQBot/GUI/生产 profile', dshVersion: dshInfo.version, processWrapper, scenarios: results }
  addArtifact(run, { kind: 'compose-result', result })
  return result
}

async function runCache(run, dshInfo) {
  const registry = await startRegistry(run)
  try {
    const artifacts = await prepareArtifacts(run, dshInfo, registry)
    const caseRoot = join(run.dir, 'fixture', 'cache')
    const sharedStore = join(caseRoot, 'shared-pnpm-store')
    const first = makeInstance(join(caseRoot, 'home-a'), sharedStore)
    const second = makeInstance(join(caseRoot, 'home-b'), sharedStore)
    createHome(first, artifacts.coreRoot, { legacy: false, allowBuild: true })
    createHome(second, artifacts.coreRoot, { legacy: false, allowBuild: true })
    const firstAdd = await runDshAdd(run, dshInfo, registry, first, { id: 'dsh-add-cache-home-a' })
    const firstState = inspectInstallState(first, firstAdd)
    const secondAdd = await runDshAdd(run, dshInfo, registry, second, { id: 'dsh-add-cache-home-b' })
    const secondState = inspectInstallState(second, secondAdd)
    const classification = classifyCacheResult({ firstRecord: firstAdd, firstState, secondRecord: secondAdd, secondState })
    const secondHookExecuted = secondState.strictHookCompleted
    const result = {
      status: classification.status,
      scope: '两份隔离HOME/DSH_HOME共用唯一临时pnpm store；不改变默认缓存策略，不清缓存、不补rebuild、不预建链接',
      sharedStore: pathForEvidence(sharedStore),
      sameStore: first.storeDir === second.storeDir,
      samePackage: TARGET_PACKAGE + '@' + TARGET_VERSION,
      first: { commandId: firstAdd.id, exitCode: firstAdd.exitCode, clean: classification.firstClean, ready: classification.firstReady, hookExecuted: firstState.strictHookCompleted, state: firstState },
      second: { commandId: secondAdd.id, exitCode: secondAdd.exitCode, clean: classification.secondClean, ready: classification.secondReady, hookExecuted: secondHookExecuted, state: secondState },
      sandboxBlocked: classification.sandboxBlocked,
      checks: classification,
      limitation: classification.sandboxBlocked ? 'pnpm lifecycle child spawn hit confined-sandbox EPERM; ordinary cold failure is not classified as CACHE-BLOCKED' : undefined,
      cacheBlockedReason: classification.cacheBlocked ? '第二隔离home共用store后跳过postinstall且未建QQBot→Web链，按目标限制报告CACHE-BLOCKED' : undefined,
      rawRegistryRequests: pathForEvidence(registry.requestPath),
    }
    addArtifact(run, { kind: 'cache-result', result })
    return result
  } finally {
    await registry.close()
  }
}

async function cleanupActiveChildren() {
  for (const resource of [...activeChildren]) {
    resource.cleanupRequested = true
    killCommand(resource)
    let closed = await waitForCommandClose(resource, 1500)
    if (!closed && !resource.terminal) {
      killCommand(resource, 'SIGKILL')
      closed = await waitForCommandClose(resource, 1500)
    }
    closeCommandFds(resource)
    if (resource.record) {
      resource.record.cleanup = { requested: true, closeObserved: resource.terminal, closedWithinLimit: closed, fdsClosed: resource.fdsClosed === true }
      refreshCommandRecord(resource)
    }
  }
}

async function main() {
  const run = ensureUniqueRunDir()
  let parsed
  try { parsed = parseArgs(process.argv.slice(2)) } catch (error) {
    run.record = makeRunRecord(run, undefined)
    run.record.status = error instanceof IncompleteError ? 'INCOMPLETE' : 'FAIL'
    run.record.error = { name: error.name, message: error.message, stack: error.stack }
    persistRun(run)
    process.stderr.write(run.record.status + ': ' + error.message + NL)
    process.stdout.write(JSON.stringify({ runId: run.runId, status: run.record.status, evidence: pathForEvidence(join(run.dir, 'run.json')) }) + NL)
    process.exitCode = typeof error.code === 'number' ? error.code : 1
    return
  }
  run.record = makeRunRecord(run, parsed)
  run.record.dshRootArgument = parsed.dshRoot
  persistRun(run)
  try {
    const dshInfo = validateDshRoot(parsed.dshRoot)
    run.record.dsh = { root: pathForEvidence(dshInfo.root), version: dshInfo.version, cli: pathForEvidence(dshInfo.cliPath), pnpm: pathForEvidence(dshInfo.pnpm), npm: pathForEvidence(dshInfo.npm) }
    persistRun(run)
    const oracle = assertOracleContracts()
    run.record.oracle = oracle
    addArtifact(run, { kind: 'oracle-contracts', result: oracle })
    let result
    if (oracle.status !== 'PASS') result = { status: 'FAIL', scope: '纯oracle合同未通过，跳过case执行', oracle }
    else if (parsed.caseName === 'install') result = await runInstall(run, dshInfo)
    else if (parsed.caseName === 'compose') result = await runCompose(run, dshInfo)
    else result = await runCache(run, dshInfo)
    run.record.result = result
    run.record.status = result.status
    persistRun(run)
    process.stdout.write(JSON.stringify({ runId: run.runId, case: parsed.caseName, status: result.status, evidence: pathForEvidence(join(run.dir, 'run.json')), rawDirectory: pathForEvidence(join(run.dir, 'raw')) }) + NL)
    process.exitCode = result.status === 'PASS' ? 0 : result.status === 'CACHE-BLOCKED' || result.status === 'INCOMPLETE' ? 2 : 1
  } catch (error) {
    run.record.status = error instanceof IncompleteError ? 'INCOMPLETE' : 'FAIL'
    run.record.error = { name: error.name, message: error.message, stack: error.stack }
    persistRun(run)
    process.stderr.write(run.record.status + ': ' + error.message + NL)
    process.stdout.write(JSON.stringify({ runId: run.runId, case: parsed.caseName, status: run.record.status, evidence: pathForEvidence(join(run.dir, 'run.json')), rawDirectory: pathForEvidence(join(run.dir, 'raw')) }) + NL)
    process.exitCode = typeof error.code === 'number' ? error.code : 1
  } finally {
    await cleanupActiveChildren()
    persistRun(run)
  }
}

await main()
