// 精简版 QQBot 静态/迁移回归：直接 import heal.js 纯函数与W内显式profile夹具。
// scripts/heal.mjs CLI 只走无参帮助、显式 --host-root/--profile --dry-run 或W内 --install；
// 不触碰工作区或生产 profile，所有路径/捕获文件均在W。
import { spawnSync } from 'node:child_process'
import { createRequire, registerHooks, syncBuiltinESMExports } from 'node:module'
import fs from 'node:fs'
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
const SOURCE_CLI_TEXT = readFileSync(SOURCE_HEAL, 'utf8')

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

let sourcePackageJson = null
try { sourcePackageJson = JSON.parse(readFileSync(SOURCE_PACKAGE_MANIFEST, 'utf8')) } catch { sourcePackageJson = null }
check('QB5 健壮性改进：QQBot package-local 声明 js-yaml ^4.2.0',
  sourcePackageJson !== null && sourcePackageJson.dependencies !== null && typeof sourcePackageJson.dependencies === 'object' && sourcePackageJson.dependencies['js-yaml'] === '^4.2.0')
check('QB5 健壮性改进：heal.js 仅从包自身 import.meta.url 解析，移除 APPDATA/固定宿主后备',
  SOURCE_HEAL_TEXT.includes("createRequire(import.meta.url)('js-yaml')") && !SOURCE_HEAL_TEXT.includes('APPDATA') &&
  !SOURCE_HEAL_TEXT.includes("from 'node:os'") && !SOURCE_HEAL_TEXT.includes('@deepseek-ai/dsh/package.json'))
check('QB6 manifest 身份为 dsh-extra-plan-qqbot@2.0.1 且 postinstall 严格进入 --install、无 private', sourcePackageJson !== null && sourcePackageJson.name === 'dsh-extra-plan-qqbot' && sourcePackageJson.version === '2.0.1' && !Object.prototype.hasOwnProperty.call(sourcePackageJson, 'private') && sourcePackageJson.scripts?.postinstall === 'node scripts/heal.mjs --install')
check('QB6 heal 只暴露新 QQBot/核心平铺路径且不含旧 @local 包路径', SOURCE_HEAL_TEXT.includes("const OWN_PACKAGE_NAME = 'dsh-extra-plan-qqbot'") && SOURCE_HEAL_TEXT.includes("const WEB_PACKAGE_NAME = 'dsh-extra-plan'") && SOURCE_HEAL_TEXT.includes("join(profile.path, 'node_modules', WEB_PACKAGE_NAME)") && !SOURCE_HEAL_TEXT.includes('node_modules/@local') && !SOURCE_HEAL_TEXT.includes("'@local'"))
check('G5 恢复失败提示只称已尝试恢复且不伪报成功', SOURCE_HEAL_TEXT.includes('已尝试用备份恢复，请核对备份') && !SOURCE_HEAL_TEXT.includes('迁移失败（已恢复备份）') && !SOURCE_HEAL_TEXT.includes('迁移后校验失败，已用备份恢复'))
check('G1 sameRealPath 在 win32 下忽略大小写', sameRealPath('C:/DSH/Profiles/QQBot', 'c:/dsh/profiles/qqbot', 'win32'))
check('G1 sameRealPath 在非 win32 下区分大小写', !sameRealPath('C:/DSH/Profiles/QQBot', 'c:/dsh/profiles/qqbot', 'linux'))
check('G1 CLI 与库共用 sameRealPath 且无重复实现',
  SOURCE_CLI_TEXT.includes('sameRealPath') &&
  !SOURCE_CLI_TEXT.includes('function sameRealPath') &&
  !SOURCE_CLI_TEXT.includes('.toLowerCase()') &&
  SOURCE_CLI_TEXT.includes('sameRealPath(called, self)') &&
  SOURCE_CLI_TEXT.includes('sameRealPath(candidateRoot, packageRoot)') &&
  SOURCE_CLI_TEXT.includes('sameRealPath(targetRealPath, webRealPath)') &&
  SOURCE_CLI_TEXT.includes('sameRealPath(finalSource, finalTarget)'))
check('G1 ensureDshExtraPlanLink 使用共享 sameRealPath',
  SOURCE_HEAL_TEXT.includes('export function sameRealPath') &&
  SOURCE_HEAL_TEXT.includes('sameRealPath(hostContext.hostDataRoot, expectedRoot)') &&
  SOURCE_HEAL_TEXT.includes('sameRealPath(nativeRealpathSync(target.path), webChecked.realPath)') &&
  SOURCE_HEAL_TEXT.includes('sameRealPath(finalRealPath, webChecked.realPath)'))

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
    result = spawnSync(process.execPath, ['--import', pathToFileURL(join(SOURCE_ROOT, 'pe-test', '_shared', 'host-preload.mjs')).href, cliScript, ...args], {
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

const presetSync = readFileSync(join(SOURCE_ROOT, 'plugins', 'dsh-extra-plan', 'lib', 'preset-sync.js'), 'utf8')
check('preset-sync.js 不含 qqbot/code-runtime/qqbot 自愈标识符（核心零感知）', !/qqbot|code-runtime|healQqbotCompatibility|healPatchRows/i.test(presetSync))

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
  check('静态 patch 不再出现旧 QQBot 包路径/0.1.5 包名且拒绝旧过程措辞', !staticPatchText.includes('@local/dsh-qqbot-user-questions') && !staticPatchText.includes('@deepseek-ai/dsh-code-runtime-worker-thread') && !staticPatchText.includes('@deepseek-ai/dsh-agent-presets') && !staticPatchText.includes('本机不做验证') && !staticPatchText.includes('方案 U3') && !staticPatchText.includes('方案 U4') && !staticPatchText.includes('待有 QQBOT 环境再测试') && !staticPatchText.includes('未核实项'))
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
  const backupText1 = backups1.length === 1 ? readFileSync(join(qqProfileDir(h1), backups1[0]), 'utf8') : ''
  const hasLegacy1 = Array.isArray(parsed1) && parsed1.some((row) => isMap(row) &&
    ((row.id === 'code-runtime' && row.name === '@deepseek-ai/dsh-code-runtime-worker-thread') ||
     (row.id === 'agent-presets' && row.name === '@deepseek-ai/dsh-agent-presets' && isMap(row.config) && row.config.default === 'standard')))
  check('生产同形 patch 只迁移两个旧根级完整块', r1.status === 'migrated' && Array.isArray(r1.migrated) && r1.migrated.join('/') === 'code-runtime/agent-presets')
  check('迁移后顶层数组有效且 im-qqbot/非旧版完整用户行保留、旧根级块消失', parsed1Result.ok && Array.isArray(parsed1) && isMap(rootRow(parsed1, 'im-qqbot')) && isMap(rootRow(parsed1, 'user-custom')) && !hasLegacy1, parsed1Result.error || '')
  const parsedMarker1 = rootRow(parsed1, 'user-custom')?.config?.marker
  check('合法非目标 !!js 条目迁移后保留原表达式且不求值', after1.includes('marker: !!js "' + markerExpr + '"') && !after1.includes(markerExpr + '()') && parsedMarker1?.__jsExpr === markerExpr && globalThis.__qqbotFixtureSideEffect === undefined)
  check('实际迁移产生一份备份且备份字节等于迁移前', backups1.length === 1 && backupText1 === before1)
  const repeatBefore1 = after1
  const repeatResult1 = healPatchAt(qqProfileDir(h1))
  check('迁移重复调用字节不变且不新增备份', repeatResult1.status === 'idempotent' && readFileSync(qqPatch(h1), 'utf8') === repeatBefore1 && patchBackups(qqProfileDir(h1)).length === 1)

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
  const commentsOldGone = !commentsAfter.includes('code-runtime-worker-thread') && !commentsAfter.includes('dsh-agent-presets')
  check('G5 旧块前后/块内根级注释保留且旧块完整删除', commentsResult.status === 'migrated' && commentsOldGone && commentsAfter.includes('# before-old') && commentsAfter.includes('# root comment between rows') && commentsAfter.includes('# root comment between mapping keys') && commentsAfter.includes('# root comment after old block') && commentsAfter.includes('# file-tail') && commentsAfter.includes('user-before') && commentsParsed.ok)
  check('G5 注释夹具保留CRLF与无末尾换行、备份保留原字节', !commentsAfter.includes('\n') || commentsAfter.includes('\r\n') && !commentsAfter.replace(/\r\n/g, '').includes('\n') && !commentsAfter.endsWith('\n') && commentsBackups.length === 1 && readFileSync(join(qqProfileDir(hComments), commentsBackups[0]), 'utf8') === commentsBefore)
  const commentsRepeat = healPatchAt(qqProfileDir(hComments))
  check('G5 注释夹具二次迁移幂等且备份不增', commentsRepeat.status === 'idempotent' && readFileSync(qqPatch(hComments), 'utf8') === commentsAfter && patchBackups(qqProfileDir(hComments)).length === 1)

  // 仅余根级注释时补合法顶层空数组，保留CRLF和无末尾换行。
  const hOnlyComments = join(tempRoot, 's3-only-comments-crlf-noeol')
  makeProfile(hOnlyComments, 'qqbot')
  installOwnPlugin(hOnlyComments, 'qqbot')
  const onlyCommentsBefore = ['# top', '- id: code-runtime', "  name: '@deepseek-ai/dsh-code-runtime-worker-thread'", '  config:', '    enabled: true', '# tail'].join('\r\n')
  writeFileSync(qqPatch(hOnlyComments), onlyCommentsBefore, 'utf8')
  const onlyCommentsResult = healPatchAt(qqProfileDir(hOnlyComments))
  const onlyCommentsAfter = readFileSync(qqPatch(hOnlyComments), 'utf8')
  const onlyCommentsParsed = parseYaml(onlyCommentsAfter)
  check('G5 仅余根级注释时保留注释并补[]/EOL', onlyCommentsResult.status === 'migrated' && onlyCommentsAfter === '# top\r\n[]\r\n# tail' && onlyCommentsParsed.ok && Array.isArray(onlyCommentsParsed.value))
  check('G5 仅余注释二次迁移幂等', healPatchAt(qqProfileDir(hOnlyComments)).status === 'idempotent')

  // ③ 仅剩旧块 → 写入 []；正确 [] 与重复调用均不写不备份
  const hOnly = join(tempRoot, 's3-only-legacy')
  makeProfile(hOnly, 'qqbot')
  installOwnPlugin(hOnly, 'qqbot')
  const beforeOnly = legacyPatch(false)
  writeFileSync(qqPatch(hOnly), beforeOnly, 'utf8')
  const onlyResult = healPatchAt(qqProfileDir(hOnly))
  const onlyAfter = readFileSync(qqPatch(hOnly), 'utf8')
  const onlyParsedResult = parseYaml(onlyAfter)
  const onlyParsed = onlyParsedResult.ok ? onlyParsedResult.value : null
  check('仅剩旧块时迁移结果为顶层 [] 而非空文件', onlyResult.status === 'migrated' && onlyAfter === '[]\n' && onlyParsedResult.ok && Array.isArray(onlyParsed) && onlyParsed.length === 0, onlyParsedResult.error || '')
  check('仅剩旧块时产生一份备份', patchBackups(qqProfileDir(hOnly)).length === 1)

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
  check('非法 YAML 写后校验失败并恢复原文', invalidResult.status === 'failed' && invalidResult.reason === 'verify-failed' && invalidAfter === invalidText && patchBackups(qqProfileDir(hInvalid)).length === 1)
   const invalidSummary = captureWarn(() => healAt(hInvalid))
   check('healQqbotCompatibility 返回逐 profile patch/link 摘要并收集 failed', invalidSummary.result !== undefined && invalidSummary.result.results.length === 1 && invalidSummary.result.failed.length === 1 && invalidSummary.result.failed[0].patch.status === 'failed')
   const applySummary = captureWarn(() => applyAt(hInvalid))
   check('启动 apply 对 failed 项输出结构化失败摘要且不抛', applySummary.messages.some((message) => message.includes('自愈失败摘要') && message.includes('verify-failed')))
   const cliInvalidBefore = readFileSync(qqPatch(hInvalid), 'utf8')
   const cliInvalidBackups = bakCount(qqProfileDir(hInvalid))
   const cliInvalid = runCli(hInvalid, { mode: 'install' })
   check('CLI --install 非法迁移恢复原文但保留恢复备份并返回非零', cliInvalid.status === 1 && cliInvalid.error === undefined && cliInvalid.stderr.includes('严格安装失败') && cliInvalid.stderr.includes('patch-failed') && cliInvalid.stderr.includes('verify-failed') && readFileSync(qqPatch(hInvalid), 'utf8') === cliInvalidBefore && bakCount(qqProfileDir(hInvalid)) === cliInvalidBackups + 1, JSON.stringify({ status: cliInvalid.status, error: cliInvalid.error, stdout: cliInvalid.stdout, stderr: cliInvalid.stderr, backups: [cliInvalidBackups, bakCount(qqProfileDir(hInvalid))] }))

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
  check('web 包缺失时 heal 不抛异常且输出跳过警告', w4.messages.some((m) => m.includes('未找到 web 的 dsh-extra-plan，跳过映射')))
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
  writeFileSync(qqPatch(h12), legacyPatch(true), 'utf8')
  applyAt(h12)
  const applied12Result = parseYaml(readFileSync(qqPatch(h12), 'utf8'))
  const applied12 = applied12Result.ok ? applied12Result.value : null
  check('index.js apply 使用显式W内QQ profile事实迁移旧根级块', applied12Result.ok && Array.isArray(applied12) && isMap(rootRow(applied12, 'im-qqbot')) && !applied12.some((row) => isMap(row) && (row.id === 'code-runtime' || row.id === 'agent-presets')), applied12Result.error || '')
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
  check('CLI --install 完整W假树退出码 0 且严格安装完成', cli.status === 0 && cli.error === undefined && cli.stdout.includes('严格安装完成'), JSON.stringify({ status: cli.status, error: cli.error, stdout: cli.stdout, stderr: cli.stderr }))
  check('CLI --install 实际迁移旧根级块并完成W内目标最终链接核验', cli.status === 0 && cli.stdout.includes('严格安装完成') && cliParsedResult.ok && Array.isArray(cliParsed) && isMap(rootRow(cliParsed, 'im-qqbot')) && !cliParsed.some((row) => isMap(row) && (row.id === 'code-runtime' || row.id === 'agent-presets')), JSON.stringify({ parseError: cliParsedResult.error, parsed: cliParsed, cliStatus: cli.status, cliStdout: cli.stdout, linkObserver: existsSync(qqExtraPlanDir(hCli)) && isLink(qqExtraPlanDir(hCli)), exists: existsSync(qqExtraPlanDir(hCli)), resolved: resolve(qqExtraPlanDir(hCli)), real: existsSync(qqExtraPlanDir(hCli)) ? realpathSync(qqExtraPlanDir(hCli)) : null, platform: process.platform }))
  const cliRepeat = runCli(hCli, { mode: 'install' })
  check('CLI --install 幂等重跑退出码 0', cliRepeat.status === 0 && cliRepeat.error === undefined, JSON.stringify({ status: cliRepeat.status, error: cliRepeat.error, stdout: cliRepeat.stdout, stderr: cliRepeat.stderr }))
  const cliLinkPath = qqExtraPlanDir(hCli)
  let cliLinkDetail
  try { const linkStat = lstatSync(cliLinkPath); cliLinkDetail = { platform: process.platform, exists: true, symbolic: linkStat.isSymbolicLink(), directory: linkStat.isDirectory(), resolved: resolve(cliLinkPath), real: realpathSync(cliLinkPath), detected: isLink(cliLinkPath) } } catch (error) { cliLinkDetail = { platform: process.platform, exists: false, error: String(error) } }
  check('CLI --install 重复运行文件字节不变且 .bak-* 不增', bakCount(qqProfileDir(hCli)) === 1, JSON.stringify({ backups: bakCount(qqProfileDir(hCli)), cliLinkDetail }))

  // 无参CLI仅帮助；显式维护仅dryRun，均不依赖普通环境自愈。
  const hEmptyCli = join(tempRoot, 'cli-empty')
  mkdirSync(hEmptyCli, { recursive: true })
  const cliEmpty = runCli(hEmptyCli)
  check('CLI 无参仅帮助且不读写profile', cliEmpty.status === 0 && cliEmpty.error === undefined && cliEmpty.stdout.includes('--host-root') && cliEmpty.stderr === '')
  const hDryRun = join(tempRoot, 'cli-dry-run')
  makeProfile(hDryRun, 'qqbot')
  installOwnPlugin(hDryRun, 'qqbot')
  createWebPackage(hDryRun)
  writeFileSync(qqPatch(hDryRun), legacyPatch(true), 'utf8')
  const dryBefore = readFileSync(qqPatch(hDryRun), 'utf8')
  const dryBackups = bakCount(qqProfileDir(hDryRun))
  const cliDryRun = runCli(hDryRun, { mode: 'dryRun', profile: 'qqbot' })
  check('CLI 显式 --host-root+--profile 仅dryRun且零写', cliDryRun.status === 0 && cliDryRun.error === undefined && cliDryRun.stdout.includes('dryRun完成') && readFileSync(qqPatch(hDryRun), 'utf8') === dryBefore && bakCount(qqProfileDir(hDryRun)) === dryBackups && !existsSync(qqExtraPlanDir(hDryRun)))

  // ⑪ Web documentPath 真源、双锚点与完整快照局部写回
  const syncKeys = ['anchoredBootstrap', 'creativeMode', 'webFetch', 'toolPresentationMode', 'runcodeCatchGate', 'crossProviderPlannerModel', 'plannerModel', 'plannerPromptSuffix', 'exploreBudget', 'otherAgentModel']
  const syncValues = { anchoredBootstrap: false, creativeMode: true, webFetch: true, toolPresentationMode: 'ptc', runcodeCatchGate: true, crossProviderPlannerModel: true, plannerModel: 'planner-sync-test', plannerPromptSuffix: 'sync-suffix-test', exploreBudget: 37, otherAgentModel: 'other-sync-test' }
  const syncGateWords = { routeDirect: '甲', routePlan: '乙', routeDisagree: '丙', approvalApprove: '丁', approvalReplan: '戊', purposeRefine: '己', purposeRedo: '庚' }
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
  check('SYNC 缺 settings 行时末尾追加 id 行（0.2.1：不写 override）且完整十项/gateWords 深等', firstSync.status === 'applied' && isDeepStrictEqual(syncProjection(firstConfig), { ...syncValues, gateWords: syncGateWords }) && firstText.includes('globalThis.__sync = true') && firstText.includes('user-row'))
  const firstBackupCount = syncBackupCount(syncTarget)
  const repeatSync = qqbotSync.writeQqbotSettingsPatch(syncTarget, syncSnapshot, { pathContext: contextOf(syncHome) })
  check('SYNC 同字节重复写返回 idempotent 且备份数不增加', repeatSync.status === 'idempotent' && readFileSync(join(syncTarget, 'cordis.patch.yml'), 'utf8') === firstText && syncBackupCount(syncTarget) === firstBackupCount)

  const directText = '# outside comment\n- id: dsh-extra-plan-settings\n  metadata: keep\n  config:\n    customKey: !!js "globalThis.__unknown = true"\n    plannerModel: old-model\n    exploreBudget: invalid\n    gateWords:\n      routeDirect: 乙\n      routePlan: 乙\n      routeDisagree: 丙\n      approvalApprove: 丁\n      approvalReplan: 戊\n      purposeRefine: 己\n      purposeRedo: 庚\n- insert:\n    - id: nested-user-row\n      config:\n        marker: !!js "globalThis.__nested = true"\n'
  writeFileSync(join(syncTarget, 'cordis.patch.yml'), directText, 'utf8')
  const directBefore = readFileSync(join(syncTarget, 'cordis.patch.yml'), 'utf8')
  const directSync = qqbotSync.writeQqbotSettingsPatch(syncTarget, syncSnapshot, { pathContext: contextOf(syncHome) })
  const directAfter = readFileSync(join(syncTarget, 'cordis.patch.yml'), 'utf8')
  check('SYNC 已有 direct settings 行更新并修复非法托管值，未知 config/注释/嵌套 insert 保留', directSync.status === 'applied' && directAfter.includes('customKey: !!js "globalThis.__unknown = true"') && directAfter.includes('nested-user-row') && directAfter.includes('# outside comment') && isDeepStrictEqual(syncProjection(syncConfigOf(directAfter)), { ...syncValues, gateWords: syncGateWords }) && directBefore !== directAfter)

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
  const invalidGate = { values: { ...syncValues }, gateWords: { ...syncGateWords, routeDirect: syncGateWords.routePlan } }
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
