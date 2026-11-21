// 精简版 QQBot 静态/迁移回归：直接 import heal.js 纯函数与W内显式profile夹具。
// scripts/heal.mjs CLI 只走无参帮助、显式 --host-root/--profile --dry-run 或W内 --install；
// 不触碰工作区或生产 profile，所有路径/捕获文件均在W。
import { spawnSync } from 'node:child_process'
import { createRequire, registerHooks, syncBuiltinESMExports } from 'node:module'
import fs from 'node:fs'
import { createHash } from 'node:crypto'
import { closeSync, existsSync, lstatSync, mkdirSync, openSync, readdirSync, readFileSync, realpathSync, rmSync, statSync, symlinkSync, writeFileSync } from 'node:fs'
import { createIsolatedEnv, makeFixtureDir } from '../_shared/workspace-paths.mjs'
import { createPathContext } from '../../plugins/dsh-extra-plan-qqbot/lib/path-policy.js'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { isDeepStrictEqual } from 'node:util'
import {
  findOwnQqbotProfiles,
  sameRealPath,
  healPatchRows,
  healQqbotCompatibility,
} from '../../plugins/dsh-extra-plan-qqbot/lib/heal.js'
import { apply as applyLitePlugin } from '../../plugins/dsh-extra-plan-qqbot/index.js'

const HERE = dirname(fileURLToPath(import.meta.url))
const SOURCE_ROOT = join(HERE, '..', '..')
const SOURCE_PACKAGE = join(SOURCE_ROOT, 'plugins', 'dsh-extra-plan-qqbot')
const SOURCE_HEAL = join(SOURCE_PACKAGE, 'scripts', 'heal.mjs')
const SOURCE_PACKAGE_MANIFEST = join(SOURCE_PACKAGE, 'package.json')
const SOURCE_HEAL_TEXT = readFileSync(join(SOURCE_PACKAGE, 'lib', 'heal.js'), 'utf8')
const CORE_PATH_POLICY = join(SOURCE_ROOT, 'plugins', 'dsh-extra-plan', 'lib', 'path-policy.js')
const QQBOT_PATH_POLICY = join(SOURCE_PACKAGE, 'lib', 'path-policy.js')
function sha256Of(file) { return createHash('sha256').update(readFileSync(file)).digest('hex') }

let pass = 0
let fail = 0
let skipCount = 0
function check(label, condition, detail = '') {
  if (condition) {
    pass += 1
    console.log('PASS  ' + label)
  } else {
    fail += 1
    const suffix = detail === '' ? '' : ' ' + String(detail).replace(/\r?\n/g, ' ')
    console.log('FAIL  ' + label + suffix)
  }
}
function emitSkip(scope, reason, details) {
  skipCount += 1
  console.log('SKIP  ' + JSON.stringify({ scope, reason, details }))
}

const corePathPolicyHash = sha256Of(CORE_PATH_POLICY)
const qqbotPathPolicyHash = sha256Of(QQBOT_PATH_POLICY)
check('QB-path-policy 双包副本逐字节一致（引导死锁下的受控冗余）', corePathPolicyHash === qqbotPathPolicyHash, JSON.stringify({ core: corePathPolicyHash, qqbot: qqbotPathPolicyHash }))
let sourcePackageJson = null
try { sourcePackageJson = JSON.parse(readFileSync(SOURCE_PACKAGE_MANIFEST, 'utf8')) } catch { sourcePackageJson = null }
check('QB5 健壮性改进：QQBot package-local 声明 js-yaml ^4.2.0',
  sourcePackageJson !== null && sourcePackageJson.dependencies !== null && typeof sourcePackageJson.dependencies === 'object' && sourcePackageJson.dependencies['js-yaml'] === '^4.2.0')
check('QB6 manifest 身份为 dsh-extra-plan-qqbot@2.0.1 且 postinstall 严格进入 --install、无 private', sourcePackageJson !== null && sourcePackageJson.name === 'dsh-extra-plan-qqbot' && sourcePackageJson.version === '2.0.1' && !Object.prototype.hasOwnProperty.call(sourcePackageJson, 'private') && sourcePackageJson.scripts?.postinstall === 'node scripts/heal.mjs --install')
check('G1 sameRealPath 在 win32 下忽略大小写', sameRealPath('C:/DSH/Profiles/QQBot', 'c:/dsh/profiles/qqbot', 'win32'))
check('G1 sameRealPath 在非 win32 下区分大小写', !sameRealPath('C:/DSH/Profiles/QQBot', 'c:/dsh/profiles/qqbot', 'linux'))

function contextOf(home) { return createPathContext({ hostDataRoot: home }) }
function healAt(home, options = {}) { return healQqbotCompatibility(home, { ...options, context: contextOf(home) }) }
function healPatchAt(profileDir) { return healPatchRows(profileDir, { context: contextOf(resolve(profileDir, '..', '..')) }) }
function profilesAt(home) { return findOwnQqbotProfiles(home, { context: contextOf(home) }) }
function profileContextOf(home, name = 'qqbot') {
  const dir = join(home, 'profiles', name)
  return { home, dir, patchPath: join(dir, 'cordis.patch.yml'), name, startedBundles: name === 'qqbot' ? ['@tencent-connect/dsh-qqbot'] : [] }
}
function applyAt(home) {
  const profileContext = profileContextOf(home)
  return applyLitePlugin({ get: (name) => name === 'profileContext' ? profileContext : name === 'dshHomePath' ? () => home : undefined })
}

function isLink(path) {
  try {
    const stat = lstatSync(path)
    if (stat.isSymbolicLink()) return true
    return process.platform === 'win32' && !sameRealPath(realpathSync(path), resolve(path))
  } catch { return false }
}
function qqProfileDir(home) { return join(home, 'profiles', 'qqbot') }
function qqPatch(home) { return join(home, 'profiles', 'qqbot', 'cordis.patch.yml') }
function qqExtraPlanDir(home) { return join(home, 'profiles', 'qqbot', 'node_modules', 'dsh-extra-plan') }
function webExtraPlanDir(home) { return join(home, 'profiles', 'web', 'node_modules', 'dsh-extra-plan') }

function makeProfile(home, name) {
  const dir = join(home, 'profiles', name)
  mkdirSync(dir, { recursive: true })
  writeFileSync(join(dir, 'package.json'), JSON.stringify({ name: name + '-profile', dsh: { profile: { bundles: ['@tencent-connect/dsh-qqbot'] } } }), 'utf8')
  return dir
}
function installOwnPlugin(home, name) {
  const dir = join(home, 'profiles', name, 'node_modules', 'dsh-extra-plan-qqbot')
  mkdirSync(dir, { recursive: true })
  writeFileSync(join(dir, 'package.json'), readFileSync(SOURCE_PACKAGE_MANIFEST, 'utf8'), 'utf8')
}
function createWebPackage(home) {
  const dir = webExtraPlanDir(home)
  mkdirSync(dir, { recursive: true })
  writeFileSync(join(dir, 'package.json'), '{"name":"dsh-extra-plan"}\n', 'utf8')
  return dir
}
function captureWarn(fn) {
  const original = console.warn
  const messages = []
  console.warn = (...args) => { messages.push(args.map(String).join(' ')) }
  try { return { messages, result: fn() } } finally { console.warn = original }
}
function prepareCliPackage(home, profile = 'qqbot') {
  const packageRoot = join(home, '.cli-package')
  const libDir = join(packageRoot, 'lib')
  const scriptsDir = join(packageRoot, 'scripts')
  mkdirSync(libDir, { recursive: true })
  mkdirSync(scriptsDir, { recursive: true })
  writeFileSync(join(packageRoot, 'package.json'), readFileSync(SOURCE_PACKAGE_MANIFEST, 'utf8'), 'utf8')
  writeFileSync(join(libDir, 'path-policy.js'), readFileSync(join(SOURCE_PACKAGE, 'lib', 'path-policy.js'), 'utf8'), 'utf8')
  writeFileSync(join(libDir, 'heal.js'), readFileSync(join(SOURCE_PACKAGE, 'lib', 'heal.js'), 'utf8'), 'utf8')
  writeFileSync(join(scriptsDir, 'heal.mjs'), readFileSync(SOURCE_HEAL, 'utf8'), 'utf8')
  const ownDir = join(home, 'profiles', profile, 'node_modules', 'dsh-extra-plan-qqbot')
  rmSync(ownDir, { recursive: true, force: true })
  mkdirSync(dirname(ownDir), { recursive: true })
  symlinkSync(packageRoot, ownDir, process.platform === 'win32' ? 'junction' : 'dir')
  return join(scriptsDir, 'heal.mjs')
}

function runCli(home, opts = {}) {
  const stdoutPath = join(home, '.cli.stdout')
  const stderrPath = join(home, '.cli.stderr')
  const stdoutFd = openSync(stdoutPath, 'w')
  const stderrFd = openSync(stderrPath, 'w')
  let result
  try {
    const resolvedYaml = yamlResolution !== null && yamlResolution.module !== null && yamlResolution.anchor !== null
      ? createRequire(yamlResolution.anchor.path).resolve('js-yaml')
      : ''
    const yamlNodePath = resolvedYaml === '' ? '' : dirname(dirname(resolvedYaml))
    const env = { ...process.env }
    delete env.DSH_HOME
    delete env.DSH_PROFILE
    delete env.SESSION_ID
    if (yamlNodePath !== '') env.NODE_PATH = [yamlNodePath, env.NODE_PATH].filter((value) => typeof value === 'string' && value !== '').join(process.platform === 'win32' ? ';' : ':')
    if (typeof opts.injectLinkPath === 'string') env.DSH_EXTRA_PLAN_INJECT_LINK_PATH = opts.injectLinkPath
    if (typeof opts.injectMarkerPath === 'string') env.DSH_EXTRA_PLAN_INJECT_MARKER = opts.injectMarkerPath
    const mode = opts.mode === undefined ? 'help' : opts.mode
    const profile = opts.profile === undefined ? 'qqbot' : opts.profile
    const cliScript = mode === 'help' ? SOURCE_HEAL : prepareCliPackage(home, profile)
    let args = []
    if (mode === 'dryRun') args = ['--host-root', home, '--profile', profile, '--dry-run']
    else if (mode === 'install') {
      args = ['--install']
      env.DSH_HOME = home
    }
    else if (mode !== 'help') throw new Error('unknown-cli-mode:' + mode)
    if (typeof opts.beforeSpawn === 'function') opts.beforeSpawn({ cliScript, args, env })
    const nodeArgs = ['--import', pathToFileURL(join(SOURCE_ROOT, 'pe-test', '_shared', 'host-preload.mjs')).href]
    if (typeof opts.preloadPath === 'string') nodeArgs.push('--import', pathToFileURL(opts.preloadPath).href)
    nodeArgs.push(cliScript, ...args)
    result = spawnSync(process.execPath, nodeArgs, {
      cwd: home,
      timeout: 120000,
      stdio: ['ignore', stdoutFd, stderrFd],
      env,
    })
  } finally {
    closeSync(stdoutFd)
    closeSync(stderrFd)
  }
  const stdout = readFileSync(stdoutPath, 'utf8')
  const stderr = readFileSync(stderrPath, 'utf8')
  rmSync(stdoutPath, { force: true })
  rmSync(stderrPath, { force: true })
  return { status: result.status, error: result.error, stdout, stderr }
}
function bakCount(dir) {
  try { return readdirSync(dir).filter((f) => f.includes('.bak-')).length } catch { return 0 }
}
let testYamlResolution = null
function errorDetail(error) {
  return error instanceof Error ? error.message : String(error)
}
function loadTestYaml() {
  if (testYamlResolution !== null) return testYamlResolution
  const candidates = [{ kind: 'workspace-qqbot-package', path: join(SOURCE_PACKAGE, 'package.json') }]
  const installRoot = typeof process.env.DSH_INSTALL_ROOT === 'string' && process.env.DSH_INSTALL_ROOT.trim() !== ''
    ? process.env.DSH_INSTALL_ROOT.trim()
    : ''
  if (installRoot !== '') {
    candidates.push({ kind: 'explicit-install-root', path: join(installRoot, 'package.json') })
    candidates.push({ kind: 'explicit-host-dsh-package', path: join(installRoot, 'node_modules', '@deepseek-ai', 'dsh', 'package.json') })
  }
  const failures = []
  for (const candidate of candidates) {
    try {
      const module = createRequire(candidate.path)('js-yaml')
      const JsScalar = new module.Type('tag:yaml.org,2002:js', { kind: 'scalar', resolve: (data) => typeof data === 'string', construct: (data) => ({ __jsExpr: data }), predicate: (data) => data !== null && typeof data === 'object' && typeof data.__jsExpr === 'string', represent: (data) => data.__jsExpr })
      const schema = module.JSON_SCHEMA.extend(JsScalar)
      testYamlResolution = { module, schema, anchor: candidate, candidates, failures }
      return testYamlResolution
    } catch (error) {
      failures.push({ anchor: candidate, error: errorDetail(error) })
    }
  }
  testYamlResolution = { module: null, anchor: null, candidates, failures }
  return testYamlResolution
}
function parseYaml(text) {
  const resolution = loadTestYaml()
  if (resolution.module === null) return { ok: false, value: null, error: 'yaml-parser-unavailable', anchor: null }
  try {
    return { ok: true, value: resolution.module.load(text, { schema: resolution.schema }), error: null, anchor: resolution.anchor }
  } catch (error) {
    return { ok: false, value: null, error: errorDetail(error), anchor: resolution.anchor }
  }
}
function isMap(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}
function rootInsertNodes(parsed) {
  return Array.isArray(parsed) ? parsed.filter((row) => isMap(row) && Array.isArray(row.insert)) : []
}
function rootRow(parsed, id) {
  return Array.isArray(parsed) ? parsed.find((row) => isMap(row) && row.id === id) : undefined
}
function patchBackups(dir) {
  try { return readdirSync(dir).filter((f) => f.startsWith('cordis.patch.yml.bak-')) } catch { return [] }
}
async function withBuiltinFsPatch(name, replacement, action) {
  const original = fs[name]
  try {
    fs[name] = replacement
    syncBuiltinESMExports()
    return await action()
  } finally {
    fs[name] = original
    syncBuiltinESMExports()
  }
}
function legacyPatch(includeIm = true) {
  const lines = []
  if (includeIm) {
    lines.push('- id: im-qqbot', "  name: '@tencent-connect/dsh-qqbot'")
  }
  lines.push(
    '- id: code-runtime',
    "  name: '@deepseek-ai/dsh-code-runtime-worker-thread'",
    '- id: agent-presets',
    "  name: '@deepseek-ai/dsh-agent-presets'",
    '  config:',
    '    default: standard',
  )
  return lines.join('\n') + '\n'
}

const yamlResolution = loadTestYaml()
if (yamlResolution.module === null) {
  emitSkip('qqbot-install-mapping', 'yaml-parser-unavailable', {
    candidates: yamlResolution.candidates,
    failures: yamlResolution.failures,
  })
} else {
  const tempFixture = makeFixtureDir({ label: 'qqbot-lite' })
  const tempRoot = tempFixture.root
  const qqbotEnvKeys = Object.freeze(['DSH_HOME', 'HOME', 'USERPROFILE', 'APPDATA', 'LOCALAPPDATA', 'XDG_CACHE_HOME', 'DSH_EXTRA_PLAN_CAPTURE_DIR', 'DSH_EXTRA_PLAN_REPORT_DIR', 'TEMP', 'TMP', 'TMPDIR', 'DSH_PROFILE'])
  const previousQqbotEnv = Object.fromEntries(qqbotEnvKeys.map((key) => [key, process.env[key]]))
  const qqbotIsolatedEnv = createIsolatedEnv({ fixture: tempFixture, extra: { DSH_PROFILE: 'web' } })
  for (const key of qqbotEnvKeys) {
    const value = qqbotIsolatedEnv[key]
    if (value === undefined) delete process.env[key]
    else process.env[key] = value
  }
  try {
    if (typeof registerHooks === 'function') {
      try {
        const yamlUrl = pathToFileURL(createRequire(yamlResolution.anchor.path).resolve('js-yaml')).href
        registerHooks({ resolve(specifier, context, next) { return specifier === 'js-yaml' ? { url: yamlUrl, shortCircuit: true } : next(specifier, context) } })
      } catch { /* 下面的统一 SKIP/失败结论负责显式报告依赖问题 */ }
    }
    const qqbotSync = await import('../../plugins/dsh-extra-plan/lib/qqbot-settings-sync.js')
    // Fixture-only business probes use explicit path contexts; remove ambient host-home facts after the isolated import.
    for (const key of qqbotEnvKeys) {
      const value = previousQqbotEnv[key]
      if (value === undefined) delete process.env[key]
      else process.env[key] = value
    }
    delete process.env.DSH_HOME
    delete process.env.DSH_PROFILE
  // ① 静态兼容 patch：单一根级 insert 注册五个行，agent-presets 默认 extra-plan
  // （第 4 行 cordis-host-runner 为 T1 修复：qqbot 宿主平面补齐 cordisInspect /
  //  dynamicCordisRunner 两个服务，否则预设的 tool-cordis 行恒 pending、预设挂载失败）
  const staticPatchText = readFileSync(join(SOURCE_PACKAGE, 'cordis.patch.yml'), 'utf8')
  const staticPatchResult = parseYaml(staticPatchText)
  const staticPatch = staticPatchResult.ok ? staticPatchResult.value : null
  const staticInserts = staticPatchResult.ok ? rootInsertNodes(staticPatch) : null
  const staticRows = Array.isArray(staticInserts) && staticInserts.length === 1 && Array.isArray(staticInserts[0].insert) ? staticInserts[0].insert : null
  const staticCode = Array.isArray(staticRows) ? staticRows.find((row) => isMap(row) && row.id === 'ptc-runtime') : undefined
  const staticAgent = Array.isArray(staticRows) ? staticRows.find((row) => isMap(row) && row.id === 'agent-preset-registry') : undefined
  const staticQqbot = Array.isArray(staticRows) ? staticRows.find((row) => isMap(row) && row.id === 'qqbot-user-questions') : undefined
  const staticRunner = Array.isArray(staticRows) ? staticRows.find((row) => isMap(row) && row.id === 'cordis-host-runner') : undefined
  const staticSettings = Array.isArray(staticRows) ? staticRows.find((row) => isMap(row) && row.id === 'dsh-extra-plan-settings') : undefined
  check('兼容 patch 是顶层数组且仅有一个根级 insert', staticPatchResult.ok && Array.isArray(staticPatch) && staticPatch.length === 1 && Array.isArray(staticInserts) && staticInserts.length === 1, staticPatchResult.error || '')
  check('静态 insert 第 4 行 cordis-host-runner 包名准确且无 config', isMap(staticRunner) && staticRunner.name === '@deepseek-ai/dsh-cordis-host-runner')
  // 此处覆盖静态包映射；真实 profile 的只读检查由独立环境脚本负责。
  check('静态 insert 恰五行且 qqbot-user-questions/ptc-runtime/agent-preset-registry 包名准确', Array.isArray(staticRows) && staticRows.length === 5 &&
    isMap(staticCode) && staticCode.name === '@deepseek-ai/dsh-ptc-runtime-node' &&
    isMap(staticAgent) && staticAgent.name === '@deepseek-ai/dsh-agent-preset-registry' &&
    isMap(staticQqbot) && staticQqbot.name === 'dsh-extra-plan-qqbot')
  check('静态 canonical settings 行 id/name 且无 config/disabled', isMap(staticSettings) && staticSettings.id === 'dsh-extra-plan-settings' && staticSettings.name === 'dsh-extra-plan/settings' && staticSettings.config === undefined && staticSettings.disabled === undefined)
  check('cordis-host-runner 行无 config（保持原语义）', isMap(staticRunner) && staticRunner.name === '@deepseek-ai/dsh-cordis-host-runner' && staticRunner.config === undefined)
  check('静态 agent-preset-registry 默认严格为 extra-plan', isMap(staticAgent) && isMap(staticAgent.config) && staticAgent.config.default === 'extra-plan')
  check('ptc-runtime/agent-preset-registry 不在根级非-insert patch', staticPatchResult.ok && Array.isArray(staticPatch) && !staticPatch.some((row) => isMap(row) && (row.id === 'ptc-runtime' || row.id === 'agent-preset-registry')), staticPatchResult.error || '')
  check('静态 patch 不再出现旧 QQBot 包路径/0.1.5 包名', !staticPatchText.includes('@local/dsh-qqbot-user-questions') && !staticPatchText.includes('@deepseek-ai/dsh-code-runtime-worker-thread') && !staticPatchText.includes('@deepseek-ai/dsh-agent-presets'))
  check('cordis-host-runner 不在根级非-insert patch（无第二处 cordis 行）', staticPatchResult.ok && Array.isArray(staticPatch) && !staticPatch.some((row) => isMap(row) && (row.id === 'cordis-host-runner' || row.name === '@deepseek-ai/dsh-cordis-host-runner')), staticPatchResult.error || '')

  // ② 生产同形 fixture：只迁移两个旧根级块，保留 im-qqbot 与备份原文
  const h1 = join(tempRoot, 's1-legacy-root')
  makeProfile(h1, 'qqbot')
  installOwnPlugin(h1, 'qqbot')
  const markerExpr = "globalThis.__qqbotFixtureSideEffect = 'executed'"
  const before1 = legacyPatch(true) + "- id: user-custom\n  name: '@local/user-custom'\n  config:\n    marker: !!js \"globalThis.__qqbotFixtureSideEffect = 'executed'\"\n"
  writeFileSync(qqPatch(h1), before1, 'utf8')
  delete globalThis.__qqbotFixtureSideEffect
  const r1 = healPatchAt(qqProfileDir(h1))
  const after1 = readFileSync(qqPatch(h1), 'utf8')
  const parsed1Result = parseYaml(after1)
  const parsed1 = parsed1Result.ok ? parsed1Result.value : null
  const backups1 = patchBackups(qqProfileDir(h1))
  const hasLegacy1 = Array.isArray(parsed1) && parsed1.some((row) => isMap(row) &&
    ((row.id === 'code-runtime' && row.name === '@deepseek-ai/dsh-code-runtime-worker-thread') ||
     (row.id === 'agent-presets' && row.name === '@deepseek-ai/dsh-agent-presets' && isMap(row.config) && row.config.default === 'standard')))
  check('无所有权旧根级块保留即成功且列出两个 retained', r1.status === 'preserved' && Array.isArray(r1.retained) && r1.retained.join('/') === 'code-runtime/agent-presets')
  check('保留后顶层数组有效且 im-qqbot/用户行/旧根级块均保留', parsed1Result.ok && Array.isArray(parsed1) && isMap(rootRow(parsed1, 'im-qqbot')) && isMap(rootRow(parsed1, 'user-custom')) && hasLegacy1 && after1 === before1, parsed1Result.error || '')
  const parsedMarker1 = rootRow(parsed1, 'user-custom')?.config?.marker
  check('合法非目标 !!js 条目保留原表达式且不求值', after1.includes('marker: !!js "' + markerExpr + '"') && !after1.includes(markerExpr + '()') && parsedMarker1?.__jsExpr === markerExpr && globalThis.__qqbotFixtureSideEffect === undefined)
  check('无所有权旧块零写且不创建备份', backups1.length === 0 && readFileSync(qqPatch(h1), 'utf8') === before1)
  const repeatBefore1 = after1
  const repeatResult1 = healPatchAt(qqProfileDir(h1))
  check('无所有权重复调用仍保留、字节不变且不新增备份', repeatResult1.status === 'preserved' && readFileSync(qqPatch(h1), 'utf8') === repeatBefore1 && patchBackups(qqProfileDir(h1)).length === 0)

  // 同 ID 的 bundle insert 候选是实际冲突：独立夹具必须阻塞并保持原文/备份集合。
  const hConflict = join(tempRoot, 's2-legacy-root-conflict')
  makeProfile(hConflict, 'qqbot')
  installOwnPlugin(hConflict, 'qqbot')
  const conflictText = [
    '- id: ptc-runtime',
    "  name: '@deepseek-ai/dsh-ptc-runtime-node'",
    '- id: agent-preset-registry',
    "  name: '@deepseek-ai/dsh-agent-preset-registry'",
    '  config:',
    '    default: extra-plan',
    '- id: user-custom',
    '  name: user',
    '',
  ].join('\n')
  writeFileSync(qqPatch(hConflict), conflictText, 'utf8')
  const conflictBefore = readFileSync(qqPatch(hConflict), 'utf8')
  const conflictResult = healPatchAt(qqProfileDir(hConflict))
  check('ptc-runtime 与 agent-preset-registry 同 ID 候选实际冲突阻断且零写', conflictResult.status === 'failed' && conflictResult.reason === 'legacy-root-conflict' && conflictResult.conflicts?.join('/') === 'ptc-runtime/agent-preset-registry' && readFileSync(qqPatch(hConflict), 'utf8') === conflictBefore && patchBackups(qqProfileDir(hConflict)).length === 0)

  const independentLegacyForms = [
    { id: 'code-runtime', name: '@deepseek-ai/dsh-code-runtime-worker-thread', kind: 'preserved' },
    { id: 'agent-presets', name: '@deepseek-ai/dsh-agent-presets', default: 'standard', kind: 'preserved' },
    { id: 'ptc-runtime', name: '@deepseek-ai/dsh-ptc-runtime-node', kind: 'conflict' },
    { id: 'agent-preset-registry', name: '@deepseek-ai/dsh-agent-preset-registry', default: 'extra-plan', kind: 'conflict' },
  ]
  for (const form of independentLegacyForms) {
    const home = join(tempRoot, 's2-independent-' + form.id)
    makeProfile(home, 'qqbot')
    installOwnPlugin(home, 'qqbot')
    const lines = ['- id: ' + form.id, '  name: ' + JSON.stringify(form.name)]
    if (form.default !== undefined) lines.push('  config:', '    default: ' + form.default)
    const text = lines.join('\n') + '\n'
    writeFileSync(qqPatch(home), text, 'utf8')
    const beforeBytes = readFileSync(qqPatch(home))
    const beforeEntries = readdirSync(qqProfileDir(home)).sort()
    const result = healPatchAt(qqProfileDir(home))
    const afterBytes = readFileSync(qqPatch(home))
    const afterEntries = readdirSync(qqProfileDir(home)).sort()
    const bytesUnchanged = beforeBytes.equals(afterBytes)
    const directoryUnchanged = isDeepStrictEqual(beforeEntries, afterEntries)
    const backupsUnchanged = patchBackups(qqProfileDir(home)).length === 0
    const observed = form.kind === 'preserved'
      ? result.status === 'preserved' && result.retained?.join('/') === form.id
      : result.status === 'failed' && result.reason === 'legacy-root-conflict' && result.conflicts?.join('/') === form.id
    check('独立根级形态 ' + form.id + ' 判据/原始字节/目录/备份集合', observed && bytesUnchanged && directoryUnchanged && backupsUnchanged)
  }

  // G5：根级注释可出现在旧块前后或映射键之间；CRLF 与无末尾换行均须保真。
  const hComments = join(tempRoot, 's2-comments-crlf-noeol')
  makeProfile(hComments, 'qqbot')
  installOwnPlugin(hComments, 'qqbot')
  const commentsBefore = [
    '# before-old',
    '- id: user-before',
    '  name: user',
    '# root comment between rows',
    '- id: code-runtime',
    "  name: '@deepseek-ai/dsh-code-runtime-worker-thread'",
    '# root comment between mapping keys',
    '  config:',
    '    enabled: true',
    '# root comment after old block',
    '- id: agent-presets',
    "  name: '@deepseek-ai/dsh-agent-presets'",
    '  config:',
    '    default: standard',
    '# file-tail',
  ].join('\r\n')
  writeFileSync(qqPatch(hComments), commentsBefore, 'utf8')
  const commentsResult = healPatchAt(qqProfileDir(hComments))
  const commentsAfter = readFileSync(qqPatch(hComments), 'utf8')
  const commentsParsed = parseYaml(commentsAfter)
  const commentsBackups = patchBackups(qqProfileDir(hComments))
  const commentsOldKept = commentsAfter.includes('code-runtime-worker-thread') && commentsAfter.includes('dsh-agent-presets')
  check('G5 无所有权旧块及前后/块内根级注释全部保留', commentsResult.status === 'preserved' && commentsOldKept && commentsAfter.includes('# before-old') && commentsAfter.includes('# root comment between rows') && commentsAfter.includes('# root comment between mapping keys') && commentsAfter.includes('# root comment after old block') && commentsAfter.includes('# file-tail') && commentsAfter.includes('user-before') && commentsAfter === commentsBefore && commentsParsed.ok)
  check('G5 注释夹具保留CRLF与无末尾换行、零备份', commentsAfter.includes('\r\n') && !commentsAfter.replace(/\r\n/g, '').includes('\n') && !commentsAfter.endsWith('\n') && commentsBackups.length === 0)
  const commentsRepeat = healPatchAt(qqProfileDir(hComments))
  check('G5 注释夹具二次保留且备份不增', commentsRepeat.status === 'preserved' && readFileSync(qqPatch(hComments), 'utf8') === commentsAfter && patchBackups(qqProfileDir(hComments)).length === 0)

  // 仅余根级注释时补合法顶层空数组，保留CRLF和无末尾换行。
  const hOnlyComments = join(tempRoot, 's3-only-comments-crlf-noeol')
  makeProfile(hOnlyComments, 'qqbot')
  installOwnPlugin(hOnlyComments, 'qqbot')
  const onlyCommentsBefore = ['# top', '- id: code-runtime', "  name: '@deepseek-ai/dsh-code-runtime-worker-thread'", '  config:', '    enabled: true', '# tail'].join('\r\n')
  writeFileSync(qqPatch(hOnlyComments), onlyCommentsBefore, 'utf8')
  const onlyCommentsResult = healPatchAt(qqProfileDir(hOnlyComments))
  const onlyCommentsAfter = readFileSync(qqPatch(hOnlyComments), 'utf8')
  const onlyCommentsParsed = parseYaml(onlyCommentsAfter)
  check('G5 仅余根级注释与无所有权旧块原文保留', onlyCommentsResult.status === 'preserved' && onlyCommentsAfter === onlyCommentsBefore && onlyCommentsParsed.ok && Array.isArray(onlyCommentsParsed.value) && onlyCommentsAfter.includes('code-runtime-worker-thread'))
  check('G5 仅余注释二次仍保留且无备份', healPatchAt(qqProfileDir(hOnlyComments)).status === 'preserved' && patchBackups(qqProfileDir(hOnlyComments)).length === 0)

  // ③ 仅剩无所有权旧块 → 保留原文；正确 [] 与重复调用均不写不备份
  const hOnly = join(tempRoot, 's3-only-legacy')
  makeProfile(hOnly, 'qqbot')
  installOwnPlugin(hOnly, 'qqbot')
  const beforeOnly = legacyPatch(false)
  writeFileSync(qqPatch(hOnly), beforeOnly, 'utf8')
  const onlyResult = healPatchAt(qqProfileDir(hOnly))
  const onlyAfter = readFileSync(qqPatch(hOnly), 'utf8')
  const onlyParsedResult = parseYaml(onlyAfter)
  const onlyParsed = onlyParsedResult.ok ? onlyParsedResult.value : null
  check('仅剩旧块时保留顶层数组原文且仍可解析', onlyResult.status === 'preserved' && onlyAfter === beforeOnly && onlyParsedResult.ok && Array.isArray(onlyParsed) && onlyParsed.length > 0, onlyParsedResult.error || '')
  check('仅剩旧块时零写且不产生备份', patchBackups(qqProfileDir(hOnly)).length === 0)

  const hEmpty = join(tempRoot, 's3-empty-array')
  makeProfile(hEmpty, 'qqbot')
  installOwnPlugin(hEmpty, 'qqbot')
  const emptyText = '# 注释\n[]\n'
  writeFileSync(qqPatch(hEmpty), emptyText, 'utf8')
  const emptyResult = healPatchAt(qqProfileDir(hEmpty))
  check('正确 [] 无旧块时字节不变且不建备份', emptyResult.status === 'idempotent' && readFileSync(qqPatch(hEmpty), 'utf8') === emptyText && bakCount(qqProfileDir(hEmpty)) === 0)

  // ④ 嵌套 insert 仅保留，不得被当作根级旧块迁移
  const hNested = join(tempRoot, 's4-nested-insert')
  makeProfile(hNested, 'qqbot')
  installOwnPlugin(hNested, 'qqbot')
  const nestedText = [
    '- insert:',
    '    - id: code-runtime',
    "      name: '@deepseek-ai/dsh-code-runtime-worker-thread'",
    '    - id: agent-presets',
    "      name: '@deepseek-ai/dsh-agent-presets'",
    '      config:',
    '        default: standard',
    '',
  ].join('\n')
  writeFileSync(qqPatch(hNested), nestedText, 'utf8')
  const nestedResult = healPatchAt(qqProfileDir(hNested))
  const nestedAfter = readFileSync(qqPatch(hNested), 'utf8')
  const nestedParsedResult = parseYaml(nestedAfter)
  const nestedParsed = nestedParsedResult.ok ? nestedParsedResult.value : null
  check('嵌套 insert 不迁移、不追加根级目标块且无备份', nestedResult.status === 'idempotent' && nestedAfter === nestedText && nestedParsedResult.ok && patchBackups(qqProfileDir(hNested)).length === 0 && rootInsertNodes(nestedParsed).length === 1, nestedParsedResult.error || '')

  // ④b 正常 parser 下根级 id 搭配嵌套 config.name/default/insert 不是旧根级条目。
  const hNestedFields = join(tempRoot, 's4b-nested-fields')
  makeProfile(hNestedFields, 'qqbot')
  installOwnPlugin(hNestedFields, 'qqbot')
  const nestedFieldsText = [
    '- id: code-runtime',
    '  config:',
    "    name: '@deepseek-ai/dsh-code-runtime-worker-thread'",
    '- id: agent-presets',
    '  config:',
    "    name: '@deepseek-ai/dsh-agent-presets'",
    '    default: standard',
    '- id: user-row',
    '  config:',
    '    insert:',
    '      - id: code-runtime',
    "        name: '@deepseek-ai/dsh-code-runtime-worker-thread'",
    '',
  ].join('\n')
  writeFileSync(qqPatch(hNestedFields), nestedFieldsText, 'utf8')
  const nestedFieldsResult = healPatchAt(qqProfileDir(hNestedFields))
  check('正常 parser 下嵌套 name/default/insert 不误删且零备份', nestedFieldsResult.status === 'idempotent' && readFileSync(qqPatch(hNestedFields), 'utf8') === nestedFieldsText && bakCount(qqProfileDir(hNestedFields)) === 0)

  // ④c 解析失败时不猜测迁移：原文与备份均不变。
  const hParseFailed = join(tempRoot, 's4c-parse-failed')
  makeProfile(hParseFailed, 'qqbot')
  installOwnPlugin(hParseFailed, 'qqbot')
  const parseFailedText = "- id: code-runtime\n  name: '@deepseek-ai/dsh-code-runtime-worker-thread'\n  config: [\n"
  writeFileSync(qqPatch(hParseFailed), parseFailedText, 'utf8')
  const parseFailedResult = healPatchAt(qqProfileDir(hParseFailed))
  check('解析失败跳过迁移并说明原因、原文零写零备份', parseFailedResult.status === 'skipped' && parseFailedResult.reason === 'parse-failed' && readFileSync(qqPatch(hParseFailed), 'utf8') === parseFailedText && bakCount(qqProfileDir(hParseFailed)) === 0)

  // ④d 将 heal.js 放到无 js-yaml 搜索路径，验证解析器不可用同样跳过且不写。
  const hYamlUnavailable = join(tempRoot, 's4d-yaml-unavailable')
  makeProfile(hYamlUnavailable, 'qqbot')
  installOwnPlugin(hYamlUnavailable, 'qqbot')
  const unavailablePatch = legacyPatch(false)
  writeFileSync(qqPatch(hYamlUnavailable), unavailablePatch, 'utf8')
  const isolatedHealPath = join(tempRoot, 'heal-no-yaml.mjs')
  const isolatedPathPolicyPath = join(tempRoot, 'path-policy.js')
  writeFileSync(isolatedPathPolicyPath, readFileSync(join(SOURCE_PACKAGE, 'lib', 'path-policy.js'), 'utf8'), 'utf8')
  writeFileSync(isolatedHealPath, SOURCE_HEAL_TEXT.replace("createRequire(import.meta.url)('js-yaml')", "createRequire(import.meta.url)('definitely-missing-js-yaml-for-test')"), 'utf8')
  const isolatedHeal = await import(pathToFileURL(isolatedHealPath).href + '?yaml-unavailable')
  const unavailableResult = isolatedHeal.healPatchRows(qqProfileDir(hYamlUnavailable), { context: contextOf(hYamlUnavailable) })
  check('解析器不可用跳过迁移并说明原因、原文零写零备份', unavailableResult.status === 'skipped' && unavailableResult.reason === 'yaml-unavailable' && readFileSync(qqPatch(hYamlUnavailable), 'utf8') === unavailablePatch && bakCount(qqProfileDir(hYamlUnavailable)) === 0)

  // ⑤ 含旧块但移除后仍非法 YAML → 写后校验失败并恢复原文
  const hInvalid = join(tempRoot, 's5-invalid-after-remove')
  makeProfile(hInvalid, 'qqbot')
  installOwnPlugin(hInvalid, 'qqbot')
  createWebPackage(hInvalid)
  const invalidText = [
    '- id: code-runtime',
    "  name: '@deepseek-ai/dsh-code-runtime-worker-thread'",
    '- id: agent-presets',
    "  name: '@deepseek-ai/dsh-agent-presets'",
    '  config:',
    '    default: standard',
    'broken: [invalid',
    '',
  ].join('\n')
  writeFileSync(qqPatch(hInvalid), invalidText, 'utf8')
  const invalidResult = healPatchAt(qqProfileDir(hInvalid))
  const invalidAfter = readFileSync(qqPatch(hInvalid), 'utf8')
  check('非法 YAML 在解析阶段跳过、原文与备份均不变', invalidResult.status === 'skipped' && invalidResult.reason === 'parse-failed' && invalidAfter === invalidText && patchBackups(qqProfileDir(hInvalid)).length === 0)
   const invalidSummary = captureWarn(() => healAt(hInvalid))
   check('healQqbotCompatibility 返回逐 profile patch/link 摘要且解析失败不伪报 failed', invalidSummary.result !== undefined && invalidSummary.result.results.length === 1 && invalidSummary.result.failed.length === 0 && invalidSummary.result.results[0].patch.status === 'skipped' && invalidSummary.result.results[0].patch.reason === 'parse-failed')
   const applySummary = captureWarn(() => applyAt(hInvalid))
   check('启动 apply 对解析失败保留原状且不输出伪造失败摘要', applySummary.messages.every((message) => !message.includes('自愈失败摘要')))
   const cliInvalidBefore = readFileSync(qqPatch(hInvalid), 'utf8')
   const cliInvalidBackups = bakCount(qqProfileDir(hInvalid))
   const cliInvalid = runCli(hInvalid, { mode: 'install' })
   check('CLI --install 非法 patch 预检失败、原文保留且零新增备份', cliInvalid.status === 1 && cliInvalid.error === undefined && cliInvalid.stderr.includes('严格安装失败') && cliInvalid.stderr.includes('patch-preflight-failed') && cliInvalid.stderr.includes('parse-failed') && readFileSync(qqPatch(hInvalid), 'utf8') === cliInvalidBefore && bakCount(qqProfileDir(hInvalid)) === cliInvalidBackups, JSON.stringify({ status: cliInvalid.status, error: cliInvalid.error, stdout: cliInvalid.stdout, stderr: cliInvalid.stderr, backups: [cliInvalidBackups, bakCount(qqProfileDir(hInvalid))] }))

  const cliNoFollowIdentity = (path) => {
    try {
      const stat = lstatSync(path)
      return { exists: true, type: stat.isSymbolicLink() ? 'symlink' : stat.isDirectory() ? 'directory' : stat.isFile() ? 'file' : 'other', mode: stat.mode, dev: stat.dev, ino: stat.ino, size: stat.size, mtimeMs: stat.mtimeMs, birthtimeMs: stat.birthtimeMs }
    } catch (error) { return { exists: false, code: error?.code || String(error) } }
  }
  const cliStateNoFollow = (home) => {
    const profileDir = qqProfileDir(home)
    const nodeModules = join(profileDir, 'node_modules')
    return {
      patch: readFileSync(qqPatch(home)),
      backups: readdirSync(profileDir).filter((name) => name.startsWith('cordis.patch.yml.bak-')).sort(),
      link: cliNoFollowIdentity(qqExtraPlanDir(home)),
      profileEntries: readdirSync(profileDir).sort(),
      nodeModulesEntries: readdirSync(nodeModules).sort(),
    }
  }
  // 独立 CLI 预检失败：不提前建 dsh-extra-plan 链接，子进程前后原始状态必须全等。
  const hCliPreflight = join(tempRoot, 'cli-preflight-failure')
  makeProfile(hCliPreflight, 'qqbot')
  installOwnPlugin(hCliPreflight, 'qqbot')
  createWebPackage(hCliPreflight)
  writeFileSync(qqPatch(hCliPreflight), invalidText, 'utf8')
  let cliPreflightBefore
  const cliPreflight = runCli(hCliPreflight, { mode: 'install', beforeSpawn: () => { cliPreflightBefore = cliStateNoFollow(hCliPreflight) } })
  const cliPreflightAfter = cliStateNoFollow(hCliPreflight)
  const cliPreflightExact = cliPreflightBefore !== undefined && cliPreflight.status === 1 && cliPreflight.error === undefined && cliPreflight.stderr.includes('patch-preflight-failed') && cliPreflight.stderr.includes('parse-failed') && cliPreflightBefore.patch.equals(cliPreflightAfter.patch) && isDeepStrictEqual(cliPreflightBefore.backups, cliPreflightAfter.backups) && isDeepStrictEqual(cliPreflightBefore.link, cliPreflightAfter.link) && isDeepStrictEqual(cliPreflightBefore.profileEntries, cliPreflightAfter.profileEntries) && isDeepStrictEqual(cliPreflightBefore.nodeModulesEntries, cliPreflightAfter.nodeModulesEntries)
  check('M9 独立 CLI 预检失败子进程前后 patch/备份名称/链接身份/目录项全等', cliPreflightExact, JSON.stringify({ mode: 'strictInstall-cli-preflight', status: cliPreflight.status, error: cliPreflight.error, stdout: cliPreflight.stdout, stderr: cliPreflight.stderr, before: cliPreflightBefore, after: cliPreflightAfter }))
  console.log('M9_CLI_PREFLIGHT_EVIDENCE ' + JSON.stringify({ mode: 'strictInstall-cli-preflight', status: cliPreflight.status, stdout: cliPreflight.stdout, stderr: cliPreflight.stderr, before: cliPreflightBefore, after: cliPreflightAfter, exact: cliPreflightExact }))

  // ⑤a 写回失败即恢复失败路径：返回 failed/write-failed，不改写原文、不伪报成功
  const hWriteFailed = join(tempRoot, 's5a-write-failed')
  makeProfile(hWriteFailed, 'qqbot')
  installOwnPlugin(hWriteFailed, 'qqbot')
  createWebPackage(hWriteFailed)
  writeFileSync(qqPatch(hWriteFailed), legacyPatch(true), 'utf8')
  const writeFailedText = readFileSync(qqPatch(hWriteFailed), 'utf8')
  const writeFailedPath = resolve(qqPatch(hWriteFailed))
  const originalWriteFile = fs.writeFileSync
  const writeFailedSummary = await withBuiltinFsPatch('writeFileSync', (...args) => {
    if (typeof args[0] === 'string' && resolve(args[0]) === writeFailedPath) {
      const error = new Error('write failure injected')
      error.code = 'EIO'
      throw error
    }
    return originalWriteFile(...args)
  }, () => captureWarn(() => healAt(hWriteFailed)))
  const writeFailedPatch = writeFailedSummary.result?.results?.[0]?.patch
  check('无所有权旧块不进入写回路径且注入写错误不改变原文', writeFailedPatch !== undefined && writeFailedPatch.status === 'preserved' && writeFailedPatch.reason === 'legacy-ownership-unverified' && writeFailedSummary.result.failed.length === 0 && readFileSync(qqPatch(hWriteFailed), 'utf8') === writeFailedText && patchBackups(qqProfileDir(hWriteFailed)).length === 0)

  // ⑤b patch 文件可见但读取失败：保留 healPatchRows 原形状，dryRun CLI 进入失败分类
  const hReadFailed = join(tempRoot, 's5b-read-failed')
  makeProfile(hReadFailed, 'qqbot')
  installOwnPlugin(hReadFailed, 'qqbot')
  writeFileSync(qqPatch(hReadFailed), '# read failure fixture\n[]\n', 'utf8')
  createWebPackage(hReadFailed)
  const readFailedPath = resolve(qqPatch(hReadFailed))
  const originalReadFile = fs.readFileSync
  const readFailedSummary = await withBuiltinFsPatch('readFileSync', (...args) => {
    if (typeof args[0] === 'string' && resolve(args[0]) === readFailedPath) {
      const error = new Error('read failure injected')
      error.code = 'EIO'
      throw error
    }
    return originalReadFile(...args)
  }, () => captureWarn(() => healAt(hReadFailed)))
  const readFailedPatch = readFailedSummary.result?.results?.[0]?.patch
  check('read-failed 保留 healPatchRows 原形状且进入 failed 汇总', readFailedPatch !== undefined && readFailedPatch.status === 'skipped' && readFailedPatch.reason === 'read-failed' && Object.keys(readFailedPatch).join('/') === 'status/reason' && readFailedSummary.result.failed.length === 1 && readFailedSummary.result.failed[0].patch === readFailedPatch)
  rmSync(qqPatch(hReadFailed), { recursive: true, force: true })
  mkdirSync(qqPatch(hReadFailed))
  const cliReadFailed = runCli(hReadFailed, { mode: 'dryRun', profile: 'qqbot' })
  check('read-failed CLI dryRun 输出结构化失败摘要且非零', cliReadFailed.status === 1 && cliReadFailed.error === undefined && cliReadFailed.stderr.includes('dry-run-failed') && cliReadFailed.stderr.includes('read-failed'))
  // ⑥ web 包缺失 → 跳过建链不报错
  const h4 = join(tempRoot, 's6-web-missing')
  makeProfile(h4, 'qqbot')
  installOwnPlugin(h4, 'qqbot')
  const w4 = captureWarn(() => healAt(h4))
  check('web 包缺失时 heal 不抛异常且跳过建链', w4.result !== undefined && w4.result.count === 1 && w4.result.results.length === 1 && w4.result.results[0].link.status === 'skipped' && w4.result.results[0].link.reason === 'web-missing')
  check('web 包缺失时不创建 qqbot 新平铺目标链接或 @local 目录', !existsSync(qqExtraPlanDir(h4)) && !existsSync(join(h4, 'profiles', 'qqbot', 'node_modules', '@local')))

  // ⑦ 实体目录 → 保留并提示 pnpm 迁移
  const h9a = join(tempRoot, 's9a-entity')
  makeProfile(h9a, 'qqbot')
  installOwnPlugin(h9a, 'qqbot')
  createWebPackage(h9a)
  const entityTarget = qqExtraPlanDir(h9a)
  mkdirSync(entityTarget, { recursive: true })
  writeFileSync(join(entityTarget, 'marker.txt'), 'old entity\n', 'utf8')
  const w9a = captureWarn(() => healAt(h9a))
  check('实体目录保留且提示 pnpm 迁移', existsSync(join(entityTarget, 'marker.txt')) && !isLink(entityTarget) && w9a.messages.some((m) => m.includes('请通过 pnpm 完成迁移')))
   check('实体目录场景也不创建 node_modules/@local', !existsSync(join(h9a, 'profiles', 'qqbot', 'node_modules', '@local')))

  // ⑧ 负例A：bundles 锚定但未装本插件 → 零改动
  const h10 = join(tempRoot, 's10-negative-a')
  const p10 = makeProfile(h10, 'qqbot')
  writeFileSync(qqPatch(h10), '# 注释\n[]\n', 'utf8')
  const before10 = readFileSync(qqPatch(h10), 'utf8')
  const r10 = healAt(h10)
  check('未安装本插件的 profile 不被命中（count=0）', r10.count === 0 && r10.profiles.length === 0)
  check('未安装本插件的 profile cordis.patch.yml 零改动', readFileSync(qqPatch(h10), 'utf8') === before10)
  check('未安装本插件的 profile @local 目录零创建', !existsSync(join(p10, 'node_modules', '@local')))

  // ⑨ 负例B：dsh-extra-plan 核心零感知（静态断言）

  // ⑩ apply 仅消费W内显式QQ profile事实，不读取继承的DSH_HOME。
  const h12 = join(tempRoot, 's12-explicit-profile')
  makeProfile(h12, 'qqbot')
  installOwnPlugin(h12, 'qqbot')
  const applyBefore12 = legacyPatch(true)
  writeFileSync(qqPatch(h12), applyBefore12, 'utf8')
  applyAt(h12)
  const applied12Result = parseYaml(readFileSync(qqPatch(h12), 'utf8'))
  const applied12 = applied12Result.ok ? applied12Result.value : null
  check('index.js apply 使用显式W内QQ profile事实保留无所有权旧根级块且零写', applied12Result.ok && Array.isArray(applied12) && isMap(rootRow(applied12, 'im-qqbot')) && isMap(rootRow(applied12, 'code-runtime')) && isMap(rootRow(applied12, 'agent-presets')) && readFileSync(qqPatch(h12), 'utf8') === applyBefore12, applied12Result.error || '')
  check('findOwnQqbotProfiles 直测命中显式QQ profile', profilesAt(h12).includes('qqbot'))

  // CLI 冒烟：完整W假安装树显式 --install，验证迁移/建链与退出码
  const hCli = join(tempRoot, 'cli-smoke')
  makeProfile(hCli, 'qqbot')
  installOwnPlugin(hCli, 'qqbot')
  writeFileSync(qqPatch(hCli), legacyPatch(true), 'utf8')
  createWebPackage(hCli)
  const cli = runCli(hCli, { mode: 'install' })
  const cliParsedResult = parseYaml(readFileSync(qqPatch(hCli), 'utf8'))
  const cliParsed = cliParsedResult.ok ? cliParsedResult.value : null
  const cliLegacyKept = Array.isArray(cliParsed) && cliParsed.some((row) => isMap(row) && row.id === 'code-runtime' && row.name === '@deepseek-ai/dsh-code-runtime-worker-thread') && cliParsed.some((row) => isMap(row) && row.id === 'agent-presets' && row.name === '@deepseek-ai/dsh-agent-presets' && isMap(row.config) && row.config.default === 'standard')
  const cliLinkPath = qqExtraPlanDir(hCli)
  const cliWebPath = webExtraPlanDir(hCli)
  const cliNativeRealpath = typeof realpathSync.native === 'function' ? realpathSync.native : realpathSync
  const cliLinkReal = existsSync(cliLinkPath) ? cliNativeRealpath(cliLinkPath) : undefined
  const cliWebReal = existsSync(cliWebPath) ? cliNativeRealpath(cliWebPath) : undefined
  let cliLinkStat
  try { cliLinkStat = lstatSync(cliLinkPath) } catch {}
  const cliLinkEntity = cliLinkStat !== undefined && (cliLinkStat.isSymbolicLink() || process.platform === 'win32' && cliLinkReal !== undefined && !sameRealPath(cliLinkReal, resolve(cliLinkPath), process.platform))
  const cliLinkToAuthorizedWeb = cliLinkEntity && cliLinkReal !== undefined && cliWebReal !== undefined && sameRealPath(cliLinkReal, cliWebReal, process.platform)
  check('CLI --install 完整W假树退出码 0 且严格安装完成', cli.status === 0 && cli.error === undefined && cli.stdout.includes('严格安装完成'), JSON.stringify({ status: cli.status, error: cli.error, stdout: cli.stdout, stderr: cli.stderr }))
  check('CLI --install 实际迁移旧根级块并完成授权Web目标真实路径核验', cli.status === 0 && cli.stdout.includes('严格安装完成') && cliParsedResult.ok && Array.isArray(cliParsed) && isMap(rootRow(cliParsed, 'im-qqbot')) && cliLegacyKept && cliLinkToAuthorizedWeb, JSON.stringify({ parseError: cliParsedResult.error, parsed: cliParsed, cliStatus: cli.status, cliStdout: cli.stdout, linkObserver: cliLinkEntity, linkPath: resolve(cliLinkPath), linkReal: cliLinkReal, webPath: resolve(cliWebPath), webReal: cliWebReal, linkToAuthorizedWeb: cliLinkToAuthorizedWeb, platform: process.platform }))
  const cliRepeatPatchBefore = readFileSync(qqPatch(hCli), 'utf8')
  const cliRepeatBackupsBefore = patchBackups(qqProfileDir(hCli)).slice().sort()
  const cliRepeat = runCli(hCli, { mode: 'install' })
  const cliRepeatPatchAfter = readFileSync(qqPatch(hCli), 'utf8')
  const cliRepeatBackupsAfter = patchBackups(qqProfileDir(hCli)).slice().sort()
  check('CLI --install 幂等重跑退出码 0且patch字节/备份集合不变', cliRepeat.status === 0 && cliRepeat.error === undefined && cliRepeatPatchAfter === cliRepeatPatchBefore && isDeepStrictEqual(cliRepeatBackupsAfter, cliRepeatBackupsBefore), JSON.stringify({ status: cliRepeat.status, error: cliRepeat.error, stdout: cliRepeat.stdout, stderr: cliRepeat.stderr, patchUnchanged: cliRepeatPatchAfter === cliRepeatPatchBefore, backupsBefore: cliRepeatBackupsBefore, backupsAfter: cliRepeatBackupsAfter }))
  let cliLinkDetail
  try { const linkStat = lstatSync(cliLinkPath); cliLinkDetail = { platform: process.platform, exists: true, symbolic: linkStat.isSymbolicLink(), directory: linkStat.isDirectory(), resolved: resolve(cliLinkPath), real: cliLinkReal, detected: cliLinkEntity, authorizedWebReal: cliWebReal, linkToAuthorizedWeb: cliLinkToAuthorizedWeb } } catch (error) { cliLinkDetail = { platform: process.platform, exists: false, error: String(error), authorizedWebReal: cliWebReal, linkToAuthorizedWeb: false } }
  check('CLI --install 重复运行文件字节不变且 .bak-* 不增', cliRepeatPatchAfter === cliRepeatPatchBefore && isDeepStrictEqual(cliRepeatBackupsAfter, cliRepeatBackupsBefore), JSON.stringify({ backupsBefore: cliRepeatBackupsBefore, backupsAfter: cliRepeatBackupsAfter, cliLinkDetail }))

  // 无参CLI仅帮助；显式维护仅dryRun，均不依赖普通环境自愈。
  const hEmptyCli = join(tempRoot, 'cli-empty')
  mkdirSync(hEmptyCli, { recursive: true })
  const cliEmpty = runCli(hEmptyCli)
  check('CLI 无参退出码 0、无 stderr、不读写profile', cliEmpty.status === 0 && cliEmpty.error === undefined && cliEmpty.stderr === '')
  const hDryRun = join(tempRoot, 'cli-dry-run')
  makeProfile(hDryRun, 'qqbot')
  installOwnPlugin(hDryRun, 'qqbot')
  createWebPackage(hDryRun)
  writeFileSync(qqPatch(hDryRun), legacyPatch(true), 'utf8')
  const dryBefore = readFileSync(qqPatch(hDryRun), 'utf8')
  const dryBackups = bakCount(qqProfileDir(hDryRun))
  const cliDryRun = runCli(hDryRun, { mode: 'dryRun', profile: 'qqbot' })
  check('CLI 显式 --host-root+--profile 仅dryRun且零写', cliDryRun.status === 0 && cliDryRun.error === undefined && readFileSync(qqPatch(hDryRun), 'utf8') === dryBefore && bakCount(qqProfileDir(hDryRun)) === dryBackups && !existsSync(qqExtraPlanDir(hDryRun)))

  // ⑪ Web documentPath 真源、双锚点与完整快照局部写回
  const syncKeys = ['anchoredBootstrap', 'creativeMode', 'webFetch', 'toolPresentationMode', 'runcodeCatchGate', 'crossProviderPlannerModel', 'plannerModel', 'plannerPromptSuffix', 'exploreBudget', 'otherAgentModel', 'reviewerUsesPlannerModel']
  const syncValues = { anchoredBootstrap: false, creativeMode: true, webFetch: true, toolPresentationMode: 'ptc', runcodeCatchGate: true, crossProviderPlannerModel: true, plannerModel: 'planner-sync-test', plannerPromptSuffix: 'sync-suffix-test', exploreBudget: 37, otherAgentModel: 'other-sync-test', reviewerUsesPlannerModel: true }
  const syncGateWords = { routeMain: '甲', routeExecutor: '乙', routePlan: '丙', routeDisagree: '丁', purposeRefine: '戊', purposeRedo: '己' }
  const syncSnapshot = { values: syncValues, gateWords: syncGateWords }
  function makeSyncDocument(home) {
    const dir = join(home, 'profiles', 'web')
    mkdirSync(dir, { recursive: true })
    const path = join(dir, 'cordis.patch.yml')
    writeFileSync(path, '# web document fixture\n- id: web\n  name: web\n', 'utf8')
    return path
  }
  function makeSyncProfile(home, name, text) {
    const dir = makeProfile(home, name)
    installOwnPlugin(home, name)
    writeFileSync(join(dir, 'cordis.patch.yml'), text === undefined ? '# keep\n- id: user-row\n  name: user\n  config:\n    marker: !!js "globalThis.__sync = true"\n' : text, 'utf8')
    return dir
  }
  function syncConfigOf(text) {
    const parsed = parseYaml(text)
    if (!parsed.ok || !Array.isArray(parsed.value)) return undefined
    const row = parsed.value.find((item) => isMap(item) && (item.id === 'dsh-extra-plan-settings' || (isMap(item.override) && item.override.id === 'dsh-extra-plan-settings')))
    return row === undefined ? undefined : row.override?.config || row.config
  }
  function syncProjection(config) {
    if (!isMap(config)) return undefined
    return { ...Object.fromEntries(syncKeys.map((key) => [key, config[key]])), gateWords: config.gateWords }
  }
  function syncBackupCount(dir) { return patchBackups(dir).length }
  const syncHome = join(tempRoot, 'sync-document-root')
  const syncDocument = makeSyncDocument(syncHome)
  const syncProfileFacts = profileContextOf(syncHome, 'web')
  const syncTarget = makeSyncProfile(syncHome, 'sync-target')
  const syncProfilesRoot = join(syncHome, 'profiles')
  const syncRootResult = qqbotSync.resolveProfilesRoot({ documentPath: syncDocument, profileFacts: syncProfileFacts, pathContext: contextOf(syncHome), env: {} })
  const syncNames = qqbotSync.findOwnQqbotProfiles(syncProfilesRoot, contextOf(syncHome), syncProfileFacts)
  const healNames = profilesAt(syncHome)
  check('SYNC 新模块与 heal.js 双锚点命中集合相等且只扫 profiles 直接子目录', isDeepStrictEqual(syncNames, healNames) && syncNames.join('/') === 'sync-target', JSON.stringify({ syncNames: [...syncNames], syncStatus: syncNames.status, syncDiagnostics: syncNames.diagnostics, healNames }))
  check('SYNC documentPath 证明 profilesRoot 且来源标记正确', syncRootResult.status === 'available' && syncRootResult.profilesRoot === syncProfilesRoot && syncRootResult.pathSource === 'configEditor.documentPath')
  const firstSync = qqbotSync.writeQqbotSettingsPatch(syncTarget, syncSnapshot, { pathContext: contextOf(syncHome) })
  const firstText = readFileSync(join(syncTarget, 'cordis.patch.yml'), 'utf8')
  const firstConfig = syncConfigOf(firstText)
  check('SYNC 缺 settings 行时末尾追加 id 行（单版本：不写 override）且完整十一项/gateWords 深等', firstSync.status === 'applied' && isDeepStrictEqual(syncProjection(firstConfig), { ...syncValues, gateWords: syncGateWords }) && firstText.includes('globalThis.__sync = true') && firstText.includes('user-row'))
  const firstBackupCount = syncBackupCount(syncTarget)
  const repeatSync = qqbotSync.writeQqbotSettingsPatch(syncTarget, syncSnapshot, { pathContext: contextOf(syncHome) })
  check('SYNC 同字节重复写返回 idempotent 且备份数不增加', repeatSync.status === 'idempotent' && readFileSync(join(syncTarget, 'cordis.patch.yml'), 'utf8') === firstText && syncBackupCount(syncTarget) === firstBackupCount)

  const directText = '# outside comment\n- id: dsh-extra-plan-settings\n  metadata: keep\n  config:\n    customKey: !!js "globalThis.__unknown = true"\n    plannerModel: old-model\n    exploreBudget: invalid\n    gateWords:\n      routeMain: 乙\n      routeExecutor: 丁\n      routePlan: 乙\n      routeDisagree: 丙\n      purposeRefine: 戊\n      purposeRedo: 己\n- insert:\n    - id: nested-user-row\n      config:\n        marker: !!js "globalThis.__nested = true"\n'
  writeFileSync(join(syncTarget, 'cordis.patch.yml'), directText, 'utf8')
  const directBefore = readFileSync(join(syncTarget, 'cordis.patch.yml'), 'utf8')
  const directSync = qqbotSync.writeQqbotSettingsPatch(syncTarget, syncSnapshot, { pathContext: contextOf(syncHome) })
  const directAfter = readFileSync(join(syncTarget, 'cordis.patch.yml'), 'utf8')
  check('SYNC 已有 direct settings 行更新并修复非法托管值，未知 config/注释/嵌套 insert 保留', directSync.status === 'applied' && directAfter.includes('customKey: !!js "globalThis.__unknown = true"') && directAfter.includes('nested-user-row') && directAfter.includes('# outside comment') && isDeepStrictEqual(syncProjection(syncConfigOf(directAfter)), { ...syncValues, gateWords: syncGateWords }) && directBefore !== directAfter)

  // M11：W夹具锁定裸apostrophe/引号#、gateWords注释、CRLF无尾换行与重复同步幂等。
  const wCommentText = [
    '# W root comment',
    '- id: dsh-extra-plan-settings',
    '  name: dsh-extra-plan/settings',
    '  config:',
    '    plannerPromptSuffix: don' + String.fromCharCode(39) + 't # keep',
    '    customKey: ' + String.fromCharCode(34) + 'quoted # keep' + String.fromCharCode(34),
    '    plannerModel: old-model',
    '    gateWords:',
    '      # gateWords comment',
    '      routeMain: old-main # direct comment',
    '      routeExecutor: old-executor',
    '      routePlan: old-plan',
    '      routeDisagree: old-disagree',
    '      purposeRefine: old-refine',
    '      purposeRedo: old-redo',
    '# W tail comment',
  ].join('\r\n')
  const wProfile = makeSyncProfile(syncHome, 'w-comment-crlf-noeol', wCommentText)
  const wPath = join(wProfile, 'cordis.patch.yml')
  const wFirst = qqbotSync.writeQqbotSettingsPatch(wProfile, syncSnapshot, { pathContext: contextOf(syncHome) })
  const wAfter = readFileSync(wPath, 'utf8')
  const wFirstStat = statSync(wPath)
  const wFirstBackups = syncBackupCount(wProfile)
  const wProjection = syncProjection(syncConfigOf(wAfter))
  check('M11 W裸apostrophe不吞# keep、引号#/gateWords注释保留且11+6快照正确', wFirst.status === 'applied' && wAfter.includes('plannerPromptSuffix: ' + String.fromCharCode(34) + 'sync-suffix-test' + String.fromCharCode(34) + ' # keep') && wAfter.includes('customKey: ' + String.fromCharCode(34) + 'quoted # keep' + String.fromCharCode(34)) && wAfter.includes('# gateWords comment') && wAfter.includes('# direct comment') && wAfter.includes('# W root comment') && wAfter.includes('# W tail comment') && wAfter.includes('\r\n') && !wAfter.replace(/\r\n/g, '').includes('\n') && !wAfter.endsWith('\n') && isDeepStrictEqual(wProjection, { ...syncValues, gateWords: syncGateWords }))
  const wRepeat = qqbotSync.writeQqbotSettingsPatch(wProfile, syncSnapshot, { pathContext: contextOf(syncHome) })
  const wAfterRepeat = readFileSync(wPath, 'utf8')
  const wRepeatStat = statSync(wPath)
  check('M11 W重复同步字节/mtime/备份数均不增且返回idempotent', wRepeat.status === 'idempotent' && wAfterRepeat === wAfter && wRepeatStat.mtimeMs === wFirstStat.mtimeMs && syncBackupCount(wProfile) === wFirstBackups)

  const missingConfig = makeSyncProfile(syncHome, 'missing-config', '- override:\n    id: dsh-extra-plan-settings\n    metadata: keep\n')
  const missingConfigResult = qqbotSync.writeQqbotSettingsPatch(missingConfig, syncSnapshot, { pathContext: contextOf(syncHome) })
  check('SYNC 已有唯一 override 但缺 config 时补 map', missingConfigResult.status === 'applied' && isDeepStrictEqual(syncProjection(syncConfigOf(readFileSync(join(missingConfig, 'cordis.patch.yml'), 'utf8'))), { ...syncValues, gateWords: syncGateWords }))

  function assertNoWrite(label, home, name, patchText, snapshot = syncSnapshot) {
    const dir = makeSyncProfile(home, name, patchText)
    const path = join(dir, 'cordis.patch.yml')
    const before = readFileSync(path, 'utf8')
    const result = qqbotSync.writeQqbotSettingsPatch(dir, snapshot, { pathContext: contextOf(negativeHome) })
    const after = readFileSync(path, 'utf8')
    check(label, (result.status === 'failed' || result.status === 'fatal') && before === after && syncBackupCount(dir) === 0)
    return { dir, path, before, result }
  }
  const negativeHome = join(tempRoot, 'sync-negative-root')
  makeSyncDocument(negativeHome)
  const missingBundle = makeProfile(negativeHome, 'missing-plugin')
  installOwnPlugin(negativeHome, 'missing-plugin')
  writeFileSync(join(missingBundle, 'package.json'), JSON.stringify({ dsh: { profile: { bundles: ['other-bundle'] } } }), 'utf8')
  const onlyBundle = makeProfile(negativeHome, 'missing-own-plugin')
  writeFileSync(join(onlyBundle, 'cordis.patch.yml'), '# unchanged\n[]\n', 'utf8')
  const negativeNames = qqbotSync.findOwnQqbotProfiles(join(negativeHome, 'profiles'), contextOf(negativeHome))
  check('SYNC 双锚点任缺其一均跳过且与 heal.js 集合一致', negativeNames.length === 0 && isDeepStrictEqual(negativeNames, profilesAt(negativeHome)))
  const badPackage = makeProfile(negativeHome, 'bad-package')
  installOwnPlugin(negativeHome, 'bad-package')
  writeFileSync(join(badPackage, 'package.json'), '{bad json', 'utf8')
  check('SYNC 坏 package.json 不命中且零写', !qqbotSync.findOwnQqbotProfiles(join(negativeHome, 'profiles'), contextOf(negativeHome)).includes('bad-package'))
  const missingPatch = makeSyncProfile(negativeHome, 'missing-patch')
  rmSync(join(missingPatch, 'cordis.patch.yml'), { force: true })
  const missingPatchResult = qqbotSync.writeQqbotSettingsPatch(missingPatch, syncSnapshot, { pathContext: contextOf(negativeHome) })
  check('SYNC 目标 patch 缺失返回 failed 且不创建猜测文件/备份', missingPatchResult.status === 'failed' && missingPatchResult.reason === 'patch-missing' && syncBackupCount(missingPatch) === 0 && !existsSync(join(missingPatch, 'cordis.patch.yml')))
  const unreadablePatch = makeSyncProfile(negativeHome, 'unreadable-patch')
  const unreadablePatchFile = join(unreadablePatch, 'cordis.patch.yml')
  const originalUnreadableReadFile = readFileSync
  const unreadableFs = {
    existsSync,
    readFileSync: (...args) => {
      if (typeof args[0] === 'string' && resolve(args[0]) === resolve(unreadablePatchFile)) {
        const error = new Error('patch read failure injected')
        error.code = 'EIO'
        throw error
      }
      return originalUnreadableReadFile(...args)
    },
    copyFileSync: fs.copyFileSync,
    renameSync: fs.renameSync,
    unlinkSync: fs.unlinkSync,
  }
  const unreadableResult = qqbotSync.writeQqbotSettingsPatch(unreadablePatch, syncSnapshot, { pathContext: contextOf(negativeHome), fs: unreadableFs })
  check('SYNC 目标 patch 读取失败返回 failed 且零备份', unreadableResult.status === 'failed' && syncBackupCount(unreadablePatch) === 0)
  assertNoWrite('SYNC 非法 YAML 原文不变且零备份', negativeHome, 'invalid-yaml', 'broken: [invalid\n')
  assertNoWrite('SYNC 顶层非数组原文不变且零备份', negativeHome, 'top-not-array', 'settings: true\n')
  assertNoWrite('SYNC 重复 settings 行原文不变且零备份', negativeHome, 'duplicate-row', '- id: dsh-extra-plan-settings\n  config: {}\n- override:\n    id: dsh-extra-plan-settings\n    config: {}\n')
  assertNoWrite('SYNC config 非 map 原文不变且零备份', negativeHome, 'config-not-map', '- override:\n    id: dsh-extra-plan-settings\n    config: []\n')
  const invalidSnapshot = { values: { ...syncValues }, gateWords: { ...syncGateWords } }
  delete invalidSnapshot.values.plannerModel
  assertNoWrite('SYNC 源快照缺键原文不变且零备份', negativeHome, 'invalid-snapshot-missing', '- id: user\n', invalidSnapshot)
  const invalidType = { values: { ...syncValues, exploreBudget: 0 }, gateWords: { ...syncGateWords } }
  assertNoWrite('SYNC 源快照类型/范围非法原文不变且零备份', negativeHome, 'invalid-snapshot-type', '- id: user\n', invalidType)
  const invalidGate = { values: { ...syncValues }, gateWords: { ...syncGateWords, routeMain: syncGateWords.routePlan } }
  assertNoWrite('SYNC 源 gateWords 非法原文不变且零备份', negativeHome, 'invalid-snapshot-gate', '- id: user\n', invalidGate)

  function faultCase(label, hookName) {
    const dir = makeSyncProfile(negativeHome, 'fault-' + hookName, '- id: user\n  name: user\n')
    const path = join(dir, 'cordis.patch.yml')
    const before = readFileSync(path, 'utf8')
    const result = qqbotSync.writeQqbotSettingsPatch(dir, syncSnapshot, { pathContext: contextOf(negativeHome), hooks: { [hookName]: () => { throw new Error(hookName) } } })
    const after = readFileSync(path, 'utf8')
    check(label, (result.status === 'failed' || result.status === 'fatal') && after === before && result.status !== 'synced')
  }
  faultCase('SYNC 注入临时写错误返回 failed/fatal 且原文保留', 'beforeTempWrite')
  faultCase('SYNC 注入备份错误返回 failed/fatal 且原文保留', 'beforeBackup')
  faultCase('SYNC 注入 rename 错误恢复原文且不伪装 synced', 'beforeRename')
  faultCase('SYNC 注入终验错误从备份恢复原文且不伪装 synced', 'beforeFinalVerify')

  // M9 strictInstall 真实 CLI 最终核验失败：仅在W合成子进程内区分本轮身份、同名实体、外来替换与身份不明，禁止真实删除 Junction。
  const cliFinalScenarios = [
    { id: 'created-link', kind: 'created-link', label: '本轮创建映射' },
    { id: 'same-name-directory', kind: 'ordinary-directory', label: '同名普通目录' },
    { id: 'identity-changed-same-destination', kind: 'identity-changed', label: '身份变化但目的相同' },
    { id: 'destination-changed-same-identity', kind: 'destination-changed', label: '目的变化但身份相同' },
    { id: 'unknown-identity', kind: 'unknown-identity', label: '身份不明' },
  ]
  const sameFixturePath = (left, right) => typeof left === 'string' && typeof right === 'string' && left.split(String.fromCharCode(92)).join('/').toLowerCase() === right.split(String.fromCharCode(92)).join('/').toLowerCase()
  for (const cliFinalScenario of cliFinalScenarios) {
    const hCliFinal = join(tempRoot, 'G1-cli-final-verify-failure-' + cliFinalScenario.id)
    makeProfile(hCliFinal, 'qqbot')
    installOwnPlugin(hCliFinal, 'qqbot')
    createWebPackage(hCliFinal)
    writeFileSync(qqPatch(hCliFinal), legacyPatch(true), 'utf8')
    const cliFinalTarget = qqExtraPlanDir(hCliFinal)
    const cliFinalMarker = join(hCliFinal, 'G1-' + cliFinalScenario.id + '-marker.json')
    const cliFinalPreload = join(hCliFinal, 'G1-' + cliFinalScenario.id + '-preload.mjs')
    writeFileSync(cliFinalPreload, [
      "import fs from 'node:fs'",
      "import { syncBuiltinESMExports } from 'node:module'",
      "const target = process.env.DSH_EXTRA_PLAN_INJECT_LINK_PATH",
      "const marker = process.env.DSH_EXTRA_PLAN_INJECT_MARKER",
      "const scenario = " + JSON.stringify(cliFinalScenario.kind),
      "const key = (value) => String(value).split(String.fromCharCode(92)).join('/').toLowerCase()",
      "const sameTarget = (value) => target !== undefined && key(value) === key(target)",
      "const native = fs.realpathSync.native",
      "const originalLstat = fs.lstatSync",
      "const originalReadlink = fs.readlinkSync",
      "const originalUnlink = fs.unlinkSync",
      "const separator = target !== undefined && target.includes(String.fromCharCode(92)) ? String.fromCharCode(92) : '/'",
      "const expectedWeb = target === undefined ? undefined : target.replace(separator + 'qqbot' + separator, separator + 'web' + separator)",
      "const foreignWeb = expectedWeb === undefined ? undefined : expectedWeb + '-foreign-identity'",
      "const toJson = (value) => JSON.stringify(value, (_, item) => typeof item === 'bigint' ? String(item) : item)",
      "const evidence = { fixture: 'W-synthetic-fs', scenario, target, expectedWeb, foreignWeb, targetCalls: 0, postCreateRealpathCalls: 0, createdObserved: false, syntheticTargetPresent: false, syntheticLstatReads: 0, syntheticReadlinkReads: 0, syntheticAbsenceRechecks: 0, syntheticUnlinkCalls: 0, syntheticUnlinkIntercepted: false, syntheticEvents: [], syntheticCreatedIdentity: { dev: 7101n, ino: 9201n, birthtimeNs: 1700000000000000000n, ctimeNs: 1700000000000001000n }, syntheticChangedIdentity: { dev: 7101n, ino: 9202n, birthtimeNs: 1700000000000000000n, ctimeNs: 1700000000000002000n }, syntheticFinalObject: undefined, syntheticRollback: undefined, actualDiskBefore: undefined, actualDiskAfterCreate: undefined, actualDiskAtExit: undefined }",
      "const identitySummary = (identity) => ({ dev: String(identity.dev), ino: String(identity.ino), birthtimeNs: String(identity.birthtimeNs), ctimeNs: String(identity.ctimeNs) })",
      "const linkStat = (identity) => ({ isSymbolicLink: () => true, isDirectory: () => true, isFile: () => false, ...identity })",
      "const directoryStat = () => ({ isSymbolicLink: () => false, isDirectory: () => true, isFile: () => false, ino: 0n, dev: 0n, birthtimeNs: 0n, ctimeNs: 0n })",
      "const diskSnapshot = () => { if (target === undefined) return { exists: false, reason: 'target-unset' }; try { const stat = originalLstat(target); let realPath; try { realPath = native(target) } catch (error) { realPath = 'unavailable:' + String(error) }; let actualReadlink; try { actualReadlink = originalReadlink(target) } catch {} return { exists: true, objectType: stat.isSymbolicLink() ? 'symlink' : stat.isDirectory() ? 'directory' : stat.isFile() ? 'file' : 'other', symbolic: stat.isSymbolicLink(), directory: stat.isDirectory(), realPath, actualReadlink } } catch (error) { return { exists: false, code: error?.code || String(error) } } }",
      "evidence.actualDiskBefore = diskSnapshot()",
      "const captureCreation = () => { if (evidence.createdObserved || target === undefined) return; try { originalLstat(target); evidence.createdObserved = true; evidence.syntheticTargetPresent = true; evidence.actualDiskAfterCreate = diskSnapshot(); evidence.syntheticEvents.push({ phase: 'creation-observed', actualDisk: evidence.actualDiskAfterCreate, synthetic: { objectType: 'link', identity: identitySummary(evidence.syntheticCreatedIdentity), readlink: expectedWeb } }) } catch {} }",
      "const finalIdentity = () => scenario === 'identity-changed' ? evidence.syntheticChangedIdentity : evidence.syntheticCreatedIdentity",
      "const finalObject = () => { const identity = finalIdentity(); evidence.syntheticFinalObject = { objectType: 'link', identity: identitySummary(identity), readlink: expectedWeb, destination: expectedWeb }; evidence.syntheticEvents.push({ phase: 'final-object', objectType: 'link', identity: evidence.syntheticFinalObject.identity, readlink: expectedWeb }); return linkStat(identity) }",
      "const rollbackObject = () => { if (scenario === 'ordinary-directory') { evidence.syntheticRollback = { objectType: 'directory', identityAvailable: false, deletionExpected: false }; evidence.syntheticEvents.push({ phase: 'rollback-object', objectType: 'directory', unlinkExpected: false }); return directoryStat() }; if (scenario === 'unknown-identity') { evidence.syntheticRollback = { objectType: 'unknown-identity', reason: 'synthetic-identity-unavailable', deletionExpected: false }; evidence.syntheticEvents.push({ phase: 'rollback-object', objectType: 'unknown-identity', unlinkExpected: false }); const error = new Error('synthetic-identity-unavailable'); error.code = 'EIO'; throw error }; const identity = scenario === 'identity-changed' ? evidence.syntheticChangedIdentity : evidence.syntheticCreatedIdentity; const readlink = scenario === 'destination-changed' ? foreignWeb : expectedWeb; const identitySame = scenario === 'created-link' && identitySummary(identity).ino === identitySummary(evidence.syntheticCreatedIdentity).ino && readlink === expectedWeb; evidence.syntheticRollback = { objectType: 'link', identity: identitySummary(identity), readlink, identitySame, deletionExpected: identitySame }; evidence.syntheticEvents.push({ phase: 'rollback-object', objectType: 'link', identity: evidence.syntheticRollback.identity, readlink, identitySame, unlinkExpected: identitySame }); return linkStat(identity) }",
      "const wrappedNative = (value, ...args) => { const result = native(value, ...args); if (!sameTarget(value)) return result; evidence.targetCalls += 1; captureCreation(); if (!evidence.createdObserved) return result; evidence.postCreateRealpathCalls += 1; if (evidence.postCreateRealpathCalls >= 2) { evidence.syntheticEvents.push({ phase: 'final-realpath', result: 'synthetic-final-mismatch', targetCalls: evidence.targetCalls }); return String(value) + '-synthetic-final-mismatch' }; return result }",
      "const wrappedLstat = (value, ...args) => { if (!sameTarget(value)) return originalLstat(value, ...args); const actual = originalLstat(value, ...args); captureCreation(); if (!evidence.createdObserved) return actual; if (!evidence.syntheticTargetPresent) { evidence.syntheticAbsenceRechecks += 1; if (evidence.syntheticRollback !== undefined) evidence.syntheticRollback.status = 'restored'; evidence.syntheticEvents.push({ phase: 'synthetic-absence-recheck', target: value, status: 'restored', actualDelete: false }); const error = new Error('synthetic-target-absent'); error.code = 'ENOENT'; error.path = value; throw error }; evidence.syntheticLstatReads += 1; if (evidence.syntheticLstatReads <= 2) { evidence.syntheticEvents.push({ phase: evidence.syntheticLstatReads === 1 ? 'creation-identity' : 'creation-verification', objectType: 'link', identity: identitySummary(evidence.syntheticCreatedIdentity), readlink: expectedWeb }); return linkStat(evidence.syntheticCreatedIdentity) }; if (evidence.syntheticFinalObject === undefined) return finalObject(); if (evidence.syntheticRollback === undefined) return rollbackObject(); return linkStat(evidence.syntheticCreatedIdentity) }",
      "const wrappedReadlink = (value, ...args) => { if (sameTarget(value)) { if (!evidence.syntheticTargetPresent) { const error = new Error('synthetic-target-absent'); error.code = 'ENOENT'; error.path = value; throw error }; evidence.syntheticReadlinkReads += 1; if (evidence.syntheticFinalObject !== undefined && scenario === 'destination-changed') return foreignWeb; if (evidence.syntheticFinalObject !== undefined && scenario === 'unknown-identity') { const error = new Error('synthetic-identity-unavailable'); error.code = 'EIO'; throw error }; return expectedWeb }; return originalReadlink(value, ...args) }",
      "const wrappedUnlink = (value, ...args) => { if (sameTarget(value)) { evidence.syntheticUnlinkCalls += 1; evidence.syntheticUnlinkIntercepted = true; if (scenario === 'created-link') evidence.syntheticTargetPresent = false; evidence.syntheticEvents.push({ phase: 'synthetic-unlink', target: value, actualDelete: false, modelPresentAfter: evidence.syntheticTargetPresent }); return }; return originalUnlink(value, ...args) }",
      "const writeMarker = () => { evidence.actualDiskAtExit = diskSnapshot(); if (marker) fs.writeFileSync(marker, toJson(evidence), 'utf8') }",
      "try { fs.realpathSync.native = wrappedNative } catch { Object.defineProperty(fs.realpathSync, 'native', { value: wrappedNative, configurable: true }) }",
      "fs.lstatSync = wrappedLstat",
      "fs.readlinkSync = wrappedReadlink",
      "fs.unlinkSync = wrappedUnlink",
      "syncBuiltinESMExports()",
      "process.on('exit', writeMarker)",
    ].join('\n'), 'utf8')
    let cliFinalBefore
    const cliFinal = runCli(hCliFinal, { mode: 'install', preloadPath: cliFinalPreload, injectLinkPath: cliFinalTarget, injectMarkerPath: cliFinalMarker, beforeSpawn: () => { cliFinalBefore = cliStateNoFollow(hCliFinal) } })
    const cliFinalAfter = cliStateNoFollow(hCliFinal)
    let cliFinalMarkerValue
    let cliFinalMarkerError
    try { cliFinalMarkerValue = JSON.parse(readFileSync(cliFinalMarker, 'utf8')) } catch (error) { cliFinalMarkerError = String(error); cliFinalMarkerValue = undefined }
    const cliFinalExpectedNodeModules = cliFinalBefore === undefined ? [] : [...new Set([...cliFinalBefore.nodeModulesEntries, 'dsh-extra-plan'])].sort()
    const positiveIdentity = cliFinalMarkerValue?.syntheticCreatedIdentity
    const identityValid = (identity) => identity !== undefined && ['dev', 'ino', 'birthtimeNs', 'ctimeNs'].every((keyName) => typeof identity[keyName] === 'string' && /^[1-9][0-9]*$/.test(identity[keyName]))
    const identityEqual = (left, right) => identityValid(left) && identityValid(right) && left.dev === right.dev && left.ino === right.ino && left.birthtimeNs === right.birthtimeNs && left.ctimeNs === right.ctimeNs
    const creationEvent = cliFinalMarkerValue?.syntheticEvents?.find((event) => event.phase === 'creation-observed')
    const cliFinalSyntheticReady = cliFinalMarkerValue?.fixture === 'W-synthetic-fs' && cliFinalMarkerValue.createdObserved === true && identityValid(positiveIdentity) && sameFixturePath(cliFinalMarkerValue.expectedWeb, creationEvent?.synthetic?.readlink) && cliFinalMarkerValue.actualDiskBefore?.exists === false && cliFinalMarkerValue.actualDiskAfterCreate?.exists === true && cliFinalMarkerValue.actualDiskAtExit?.exists === true
    const cliFinalActualDiskStable = cliFinalMarkerValue?.actualDiskAfterCreate?.objectType === cliFinalMarkerValue?.actualDiskAtExit?.objectType && sameFixturePath(cliFinalMarkerValue?.actualDiskAfterCreate?.realPath, cliFinalMarkerValue?.actualDiskAtExit?.realPath)
    const cliFinalScenarioOk = cliFinalScenario.kind === 'created-link'
      ? cliFinalMarkerValue?.syntheticFinalObject?.objectType === 'link' && cliFinalMarkerValue?.syntheticRollback?.objectType === 'link' && identityEqual(cliFinalMarkerValue.syntheticRollback.identity, positiveIdentity) && sameFixturePath(cliFinalMarkerValue.syntheticRollback.readlink, cliFinalMarkerValue.expectedWeb) && cliFinalMarkerValue.syntheticRollback.identitySame === true && cliFinalMarkerValue.syntheticRollback.status === 'restored' && cliFinalMarkerValue.syntheticUnlinkCalls === 1 && cliFinalMarkerValue.syntheticUnlinkIntercepted === true && cliFinalMarkerValue.syntheticAbsenceRechecks >= 1 && cliFinalMarkerValue.syntheticTargetPresent === false
      : cliFinalScenario.kind === 'ordinary-directory'
        ? cliFinalMarkerValue?.syntheticFinalObject?.objectType === 'link' && cliFinalMarkerValue?.syntheticRollback?.objectType === 'directory' && cliFinalMarkerValue.syntheticUnlinkCalls === 0 && cliFinalMarkerValue.syntheticAbsenceRechecks === 0 && cliFinalMarkerValue.syntheticTargetPresent === true
        : cliFinalScenario.kind === 'identity-changed'
          ? cliFinalMarkerValue?.syntheticFinalObject?.objectType === 'link' && cliFinalMarkerValue?.syntheticRollback?.objectType === 'link' && !identityEqual(cliFinalMarkerValue.syntheticRollback.identity, positiveIdentity) && sameFixturePath(cliFinalMarkerValue.syntheticRollback.readlink, cliFinalMarkerValue.expectedWeb) && cliFinalMarkerValue.syntheticRollback.identitySame === false && cliFinalMarkerValue.syntheticUnlinkCalls === 0 && cliFinalMarkerValue.syntheticAbsenceRechecks === 0 && cliFinalMarkerValue.syntheticTargetPresent === true
          : cliFinalScenario.kind === 'destination-changed'
            ? cliFinalMarkerValue?.syntheticFinalObject?.objectType === 'link' && cliFinalMarkerValue?.syntheticRollback?.objectType === 'link' && identityEqual(cliFinalMarkerValue.syntheticRollback.identity, positiveIdentity) && !sameFixturePath(cliFinalMarkerValue.syntheticRollback.readlink, cliFinalMarkerValue.expectedWeb) && cliFinalMarkerValue.syntheticRollback.identitySame === false && cliFinalMarkerValue.syntheticUnlinkCalls === 0 && cliFinalMarkerValue.syntheticAbsenceRechecks === 0 && cliFinalMarkerValue.syntheticTargetPresent === true
            : cliFinalMarkerValue?.syntheticFinalObject?.objectType === 'link' && cliFinalMarkerValue?.syntheticRollback?.objectType === 'unknown-identity' && cliFinalMarkerValue.syntheticUnlinkCalls === 0 && cliFinalMarkerValue.syntheticAbsenceRechecks === 0 && cliFinalMarkerValue.syntheticTargetPresent === true
    const cliFinalCommand = [process.execPath, '--import', pathToFileURL(join(SOURCE_ROOT, 'pe-test', '_shared', 'host-preload.mjs')).href, '--import', pathToFileURL(cliFinalPreload).href, join(hCliFinal, '.cli-package', 'scripts', 'heal.mjs'), '--install'].map((value) => JSON.stringify(value)).join(' ')
    const cliFinalFailureOk = cliFinalBefore !== undefined && cliFinal.status === 1 && cliFinal.error === undefined && cliFinal.stderr.includes('严格安装失败') && cliFinal.stderr.includes('final-realpath-mismatch') && (cliFinalScenario.kind !== 'created-link' || cliFinal.stderr.includes('"rollback":{"status":"restored"}')) && !cliFinal.stdout.includes('严格安装完成') && cliFinalSyntheticReady && cliFinalActualDiskStable && cliFinalScenarioOk && cliFinalMarkerValue?.syntheticEvents?.some((event) => event.phase === 'final-realpath') && cliFinalBefore.patch.equals(cliFinalAfter.patch) && isDeepStrictEqual(cliFinalBefore.backups, cliFinalAfter.backups) && isDeepStrictEqual(cliFinalBefore.profileEntries, cliFinalAfter.profileEntries) && isDeepStrictEqual(cliFinalAfter.nodeModulesEntries, cliFinalExpectedNodeModules) && cliFinalBefore.link.exists === false && cliFinalAfter.link.exists === true
    check('M9 ' + cliFinalScenario.label + ' CLI严格终验身份/目的与安全回滚分支', cliFinalFailureOk, JSON.stringify({ mode: 'strictInstall-cli-synthetic-fs', scenario: cliFinalScenario.kind, status: cliFinal.status, command: cliFinalCommand, cwd: hCliFinal, env: { DSH_HOME: hCliFinal, DSH_INSTALL_ROOT: process.env.DSH_INSTALL_ROOT || null }, exitCode: cliFinal.status, error: cliFinal.error, stdout: cliFinal.stdout, stderr: cliFinal.stderr, synthetic: cliFinalMarkerValue, markerError: cliFinalMarkerError, actualDiskBefore: cliFinalMarkerValue?.actualDiskBefore, actualDiskAfterCreate: cliFinalMarkerValue?.actualDiskAfterCreate, actualDiskAtExit: cliFinalMarkerValue?.actualDiskAtExit, before: cliFinalBefore, after: cliFinalAfter, expectedNodeModules: cliFinalExpectedNodeModules }))
    console.log('M9_CLI_FINAL_EVIDENCE ' + JSON.stringify({ mode: 'strictInstall-cli-synthetic-fs', scenario: cliFinalScenario.kind, label: cliFinalScenario.label, command: cliFinalCommand, cwd: hCliFinal, env: { DSH_HOME: hCliFinal, DSH_INSTALL_ROOT: process.env.DSH_INSTALL_ROOT || null }, exitCode: cliFinal.status, stdout: cliFinal.stdout, stderr: cliFinal.stderr, synthetic: cliFinalMarkerValue, markerError: cliFinalMarkerError, actualDiskBefore: cliFinalMarkerValue?.actualDiskBefore, actualDiskAfterCreate: cliFinalMarkerValue?.actualDiskAfterCreate, actualDiskAtExit: cliFinalMarkerValue?.actualDiskAtExit, before: cliFinalBefore, after: cliFinalAfter, expectedNodeModules: cliFinalExpectedNodeModules, passed: cliFinalFailureOk }))
  }
  if (process.platform === 'win32') emitSkip('M9-WINDOWS-JUNCTION-DELETE', 'INCOMPLETE', { mode: 'real-windows-junction', reason: '实机安全删除未验证；未尝试其它删除方式；W合成身份证据已单列', identityAvailable: false })

  const missingRootDoc = join(tempRoot, 'missing-root', 'profiles', 'web', 'cordis.patch.yml')
  const unavailableRoot = qqbotSync.resolveProfilesRoot({ documentPath: missingRootDoc, profileFacts: profileContextOf(tempRoot, 'web'), pathContext: contextOf(tempRoot), env: {} })
  check('SYNC profilesRoot 不存在时 unavailable 且不创建目录', unavailableRoot.status === 'unavailable' && !existsSync(join(tempRoot, 'missing-root')))

  const unreadableRootHome = join(tempRoot, 'sync-unreadable-profiles-root')
  const unreadableDocument = makeSyncDocument(unreadableRootHome)
  const unreadableTarget = makeSyncProfile(unreadableRootHome, 'unreadable-target')
  const unreadableProfilesRoot = join(unreadableRootHome, 'profiles')
  const unreadablePatchPath = join(unreadableTarget, 'cordis.patch.yml')
  const unreadableBeforeBytes = readFileSync(unreadablePatchPath)
  const unreadableBeforeStat = statSync(unreadablePatchPath)
  const unreadableBeforeBackups = patchBackups(unreadableTarget)
  const unreadableBeforeEntries = readdirSync(unreadableTarget).sort().join('\n')
  const unreadableRootPath = resolve(unreadableProfilesRoot)
  const unreadableSynchronizer = qqbotSync.createQqbotSettingsSynchronizer()
  const originalUnreadableReaddirSync = fs.readdirSync
  const unreadableRootResult = await withBuiltinFsPatch('readdirSync', (...args) => {
    if (typeof args[0] === 'string' && resolve(args[0]) === unreadableRootPath) {
      const error = new Error('profiles root intentionally unreadable')
      error.code = 'EACCES'
      throw error
    }
    return originalUnreadableReaddirSync(...args)
  }, () => unreadableSynchronizer.enqueue({ documentPath: unreadableDocument, profileFacts: profileContextOf(unreadableRootHome, 'web'), pathContext: contextOf(unreadableRootHome), env: {}, snapshot: syncSnapshot }))
  const unreadableAfterBytes = readFileSync(unreadablePatchPath)
  const unreadableAfterStat = statSync(unreadablePatchPath)
  const unreadableAfterBackups = patchBackups(unreadableTarget)
  const unreadableAfterEntries = readdirSync(unreadableTarget).sort().join('\n')
  const unreadableTempEntries = unreadableAfterEntries.split('\n').filter((name) => name.startsWith('cordis.patch.yml.tmp-dsh-extra-plan-settings-'))
  const unreadableDiagnosticReason = unreadableRootResult.diagnostics?.[0]?.reason
  check('SYNC 不可读 profilesRoot 精确EACCES注入返回 unavailable：status=' + unreadableRootResult.status + ' reason=' + unreadableRootResult.reason + ' diagnostic=' + unreadableDiagnosticReason, unreadableRootResult.status === 'unavailable' && (unreadableRootResult.reason === 'profiles-root-unavailable' || unreadableDiagnosticReason === 'profiles-root-read-failed') && unreadableRootResult.pathSource === 'configEditor.documentPath' && Array.isArray(unreadableRootResult.profiles) && unreadableRootResult.profiles.length === 0 && unreadableRootResult.status !== 'synced')
  check('SYNC 不可读 profilesRoot 恢复后目标 patch/mtimeMs/备份/目录项/临时文件均零变化', unreadableBeforeBytes.equals(unreadableAfterBytes) && unreadableAfterStat.mtimeMs === unreadableBeforeStat.mtimeMs && unreadableAfterBackups.length === unreadableBeforeBackups.length && unreadableAfterEntries === unreadableBeforeEntries && unreadableTempEntries.length === 0)

  const sourceEvents = []
  const synchronizer = qqbotSync.createQqbotSettingsSynchronizer({ onResult: (result) => sourceEvents.push(result) })
  const syncResultOne = await synchronizer.enqueue({ documentPath: syncDocument, profileFacts: syncProfileFacts, pathContext: contextOf(syncHome), env: {}, snapshot: syncSnapshot })
  const syncSecondBefore = readFileSync(join(syncTarget, 'cordis.patch.yml'), 'utf8')
  const syncResultTwo = await synchronizer.enqueue({ documentPath: '', profileFacts: syncProfileFacts, pathContext: contextOf(syncHome), env: {}, snapshot: syncSnapshot })
  check('SYNC synchronizer 显式Web事实可写，缺documentPath不再走DSH_HOME回退且零写', syncResultOne.status === 'synced' && syncResultOne.pathSource === 'configEditor.documentPath' && syncResultTwo.status === 'unavailable' && syncResultTwo.reason === 'document-path-unavailable' && readFileSync(join(syncTarget, 'cordis.patch.yml'), 'utf8') === syncSecondBefore && sourceEvents.length === 2)
} catch (err) {
  fail += 1
  console.error('FAIL  精简版自愈回归异常: ' + String(err && err.stack || err))
} finally {
  for (const key of qqbotEnvKeys) {
    const value = previousQqbotEnv[key]
    if (value === undefined) delete process.env[key]
    else process.env[key] = value
  }
  tempFixture.cleanup()
}
}

console.log('\n通过 ' + pass + ', 失败 ' + fail + ', 跳过 ' + skipCount)
process.exit(fail === 0 ? 0 : 1)
