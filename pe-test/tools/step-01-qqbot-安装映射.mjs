// 精简版 QQBot 静态/迁移回归：直接 import heal.js 纯函数与临时 DSH_HOME 夹具
// + scripts/heal.mjs CLI 子进程冒烟（DSH_HOME env 注入）。全部场景 mkdtemp 临时目录，
// 不触碰工作区或生产 profile；环境相关 junction 能力与真实 profile 只读核验见独立脚本。
import { spawnSync } from 'node:child_process'
import { createRequire } from 'node:module'
import { closeSync, existsSync, lstatSync, mkdtempSync, mkdirSync, openSync, readdirSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { homedir, tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  findOwnQqbotProfiles,
  healPatchRows,
  healQqbotCompatibility,
} from '../../plugins/dsh-qqbot-user-questions/lib/heal.js'
import { apply as applyLitePlugin } from '../../plugins/dsh-qqbot-user-questions/index.js'

const HERE = dirname(fileURLToPath(import.meta.url))
const SOURCE_ROOT = join(HERE, '..', '..')
const SOURCE_PACKAGE = join(SOURCE_ROOT, 'plugins', 'dsh-qqbot-user-questions')
const SOURCE_HEAL = join(SOURCE_PACKAGE, 'scripts', 'heal.mjs')
const SOURCE_PACKAGE_MANIFEST = join(SOURCE_PACKAGE, 'package.json')
const SOURCE_HEAL_TEXT = readFileSync(join(SOURCE_PACKAGE, 'lib', 'heal.js'), 'utf8')

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

function isLink(path) {
  try { return lstatSync(path).isSymbolicLink() } catch { return false }
}
function qqProfileDir(home) { return join(home, 'profiles', 'qqbot') }
function qqPatch(home) { return join(home, 'profiles', 'qqbot', 'cordis.patch.yml') }
function qqExtraPlanDir(home) { return join(home, 'profiles', 'qqbot', 'node_modules', '@local', 'dsh-extra-plan') }
function webExtraPlanDir(home) { return join(home, 'profiles', 'web', 'node_modules', '@local', 'dsh-extra-plan') }

function makeProfile(home, name) {
  const dir = join(home, 'profiles', name)
  mkdirSync(dir, { recursive: true })
  writeFileSync(join(dir, 'package.json'), JSON.stringify({ name: name + '-profile', dsh: { profile: { bundles: ['@tencent-connect/dsh-qqbot'] } } }), 'utf8')
  return dir
}
function installOwnPlugin(home, name) {
  const dir = join(home, 'profiles', name, 'node_modules', '@local', 'dsh-qqbot-user-questions')
  mkdirSync(dir, { recursive: true })
}
function createWebPackage(home) {
  const dir = webExtraPlanDir(home)
  mkdirSync(dir, { recursive: true })
  writeFileSync(join(dir, 'package.json'), '{"name":"@local/dsh-extra-plan"}\n', 'utf8')
  return dir
}
function captureWarn(fn) {
  const original = console.warn
  const messages = []
  console.warn = (...args) => { messages.push(args.map(String).join(' ')) }
  try { return { messages, result: fn() } } finally { console.warn = original }
}
function runCli(home, opts = {}) {
  const stdoutPath = join(home, '.cli.stdout')
  const stderrPath = join(home, '.cli.stderr')
  const stdoutFd = openSync(stdoutPath, 'w')
  const stderrFd = openSync(stderrPath, 'w')
  let result
  try {
    const env = { ...process.env, DSH_HOME: home }
    if (opts.noDshHome) {
      delete env.DSH_HOME
      // 无 DSH_HOME 时默认 ~/.dsh（homedir 读 USERPROFILE/HOME），指向临时目录避免触碰真实环境
      env.USERPROFILE = home
      env.HOME = home
    }
    result = spawnSync(process.execPath, [SOURCE_HEAL], {
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
  const installRoot = typeof process.env.DSH_INSTALL_ROOT === 'string' ? process.env.DSH_INSTALL_ROOT.trim() : ''
  if (installRoot !== '') {
    candidates.push({ kind: 'explicit-install-root', path: join(installRoot, 'package.json') })
    candidates.push({ kind: 'explicit-host-dsh-package', path: join(installRoot, 'node_modules', '@deepseek-ai', 'dsh', 'package.json') })
  }
  const failures = []
  for (const candidate of candidates) {
    try {
      const module = createRequire(candidate.path)('js-yaml')
      testYamlResolution = { module, anchor: candidate, candidates, failures }
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
    return { ok: true, value: resolution.module.load(text), error: null, anchor: resolution.anchor }
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
  const tempRoot = mkdtempSync(join(tmpdir(), 'dsh-extra-plan-qqbot-lite-'))
  try {
  // ① 静态兼容 patch：单一根级 insert 注册四个行，agent-presets 默认 extra-plan
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
  check('兼容 patch 是顶层数组且仅有一个根级 insert', staticPatchResult.ok && Array.isArray(staticPatch) && staticPatch.length === 1 && Array.isArray(staticInserts) && staticInserts.length === 1, staticPatchResult.error || '')
  check('静态 insert 第 4 行 cordis-host-runner 包名准确且无 config', isMap(staticRunner) && staticRunner.name === '@deepseek-ai/dsh-cordis-host-runner')
  // 此处覆盖静态包映射；真实 profile 的只读检查由独立环境脚本负责。
  check('静态 insert 恰四行且 qqbot-user-questions/ptc-runtime/agent-preset-registry 包名准确', Array.isArray(staticRows) && staticRows.length === 4 &&
    isMap(staticCode) && staticCode.name === '@deepseek-ai/dsh-ptc-runtime-node' &&
    isMap(staticAgent) && staticAgent.name === '@deepseek-ai/dsh-agent-preset-registry' &&
    isMap(staticQqbot) && staticQqbot.name === '@local/dsh-qqbot-user-questions')
  check('cordis-host-runner 行无 config（保持原语义）', isMap(staticRunner) && staticRunner.name === '@deepseek-ai/dsh-cordis-host-runner' && staticRunner.config === undefined)
  check('静态 agent-preset-registry 默认严格为 extra-plan', isMap(staticAgent) && isMap(staticAgent.config) && staticAgent.config.default === 'extra-plan')
  check('ptc-runtime/agent-preset-registry 不在根级非-insert patch', staticPatchResult.ok && Array.isArray(staticPatch) && !staticPatch.some((row) => isMap(row) && (row.id === 'ptc-runtime' || row.id === 'agent-preset-registry')), staticPatchResult.error || '')
  check('静态 patch 不再出现 0.1.5 世代两包名', !staticPatchText.includes('@deepseek-ai/dsh-code-runtime-worker-thread') && !staticPatchText.includes('@deepseek-ai/dsh-agent-presets') && staticPatchText.includes('本机不做验证'))
  check('cordis-host-runner 不在根级非-insert patch（无第二处 cordis 行）', staticPatchResult.ok && Array.isArray(staticPatch) && !staticPatch.some((row) => isMap(row) && (row.id === 'cordis-host-runner' || row.name === '@deepseek-ai/dsh-cordis-host-runner')), staticPatchResult.error || '')

  // ② 生产同形 fixture：只迁移两个旧根级块，保留 im-qqbot 与备份原文
  const h1 = join(tempRoot, 's1-legacy-root')
  makeProfile(h1, 'qqbot')
  installOwnPlugin(h1, 'qqbot')
  const before1 = legacyPatch(true) + "- id: user-custom\n  name: '@local/user-custom'\n"
  writeFileSync(qqPatch(h1), before1, 'utf8')
  const r1 = healPatchRows(qqProfileDir(h1))
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
  check('实际迁移产生一份备份且备份字节等于迁移前', backups1.length === 1 && backupText1 === before1)
  const repeatBefore1 = after1
  const repeatResult1 = healPatchRows(qqProfileDir(h1))
  check('迁移重复调用字节不变且不新增备份', repeatResult1.status === 'idempotent' && readFileSync(qqPatch(h1), 'utf8') === repeatBefore1 && patchBackups(qqProfileDir(h1)).length === 1)

  // ③ 仅剩旧块 → 写入 []；正确 [] 与重复调用均不写不备份
  const hOnly = join(tempRoot, 's3-only-legacy')
  makeProfile(hOnly, 'qqbot')
  installOwnPlugin(hOnly, 'qqbot')
  const beforeOnly = legacyPatch(false)
  writeFileSync(qqPatch(hOnly), beforeOnly, 'utf8')
  const onlyResult = healPatchRows(qqProfileDir(hOnly))
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
  const emptyResult = healPatchRows(qqProfileDir(hEmpty))
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
  const nestedResult = healPatchRows(qqProfileDir(hNested))
  const nestedAfter = readFileSync(qqPatch(hNested), 'utf8')
  const nestedParsedResult = parseYaml(nestedAfter)
  const nestedParsed = nestedParsedResult.ok ? nestedParsedResult.value : null
  check('嵌套 insert 不迁移、不追加根级目标块且无备份', nestedResult.status === 'idempotent' && nestedAfter === nestedText && nestedParsedResult.ok && patchBackups(qqProfileDir(hNested)).length === 0 && rootInsertNodes(nestedParsed).length === 1, nestedParsedResult.error || '')

  // ⑤ 含旧块但移除后仍非法 YAML → 写后校验失败并恢复原文
  const hInvalid = join(tempRoot, 's5-invalid-after-remove')
  makeProfile(hInvalid, 'qqbot')
  installOwnPlugin(hInvalid, 'qqbot')
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
  const invalidResult = healPatchRows(qqProfileDir(hInvalid))
  const invalidAfter = readFileSync(qqPatch(hInvalid), 'utf8')
  check('非法 YAML 写后校验失败并恢复原文', invalidResult.status === 'failed' && invalidResult.reason === 'verify-failed' && invalidAfter === invalidText && patchBackups(qqProfileDir(hInvalid)).length === 1)

  // ⑥ web 包缺失 → 跳过建链不报错
  const h4 = join(tempRoot, 's6-web-missing')
  makeProfile(h4, 'qqbot')
  installOwnPlugin(h4, 'qqbot')
  const w4 = captureWarn(() => healQqbotCompatibility(h4))
  check('web 包缺失时 heal 不抛异常且输出跳过警告', w4.messages.some((m) => m.includes('未找到 web 的 dsh-extra-plan，跳过映射')))
  check('web 包缺失时不创建 qqbot 目标链接', !existsSync(qqExtraPlanDir(h4)))

  // ⑦ 实体目录 → 保留并提示 pnpm 迁移
  const h9a = join(tempRoot, 's9a-entity')
  makeProfile(h9a, 'qqbot')
  installOwnPlugin(h9a, 'qqbot')
  createWebPackage(h9a)
  const entityTarget = qqExtraPlanDir(h9a)
  mkdirSync(entityTarget, { recursive: true })
  writeFileSync(join(entityTarget, 'marker.txt'), 'old entity\n', 'utf8')
  const w9a = captureWarn(() => healQqbotCompatibility(h9a))
  check('实体目录保留且提示 pnpm 迁移', existsSync(join(entityTarget, 'marker.txt')) && !isLink(entityTarget) && w9a.messages.some((m) => m.includes('请通过 pnpm 完成迁移')))

  // ⑧ 负例A：bundles 锚定但未装本插件 → 零改动
  const h10 = join(tempRoot, 's10-negative-a')
  const p10 = makeProfile(h10, 'qqbot')
  writeFileSync(qqPatch(h10), '# 注释\n[]\n', 'utf8')
  const before10 = readFileSync(qqPatch(h10), 'utf8')
  const r10 = healQqbotCompatibility(h10)
  check('未安装本插件的 profile 不被命中（count=0）', r10.count === 0 && r10.profiles.length === 0)
  check('未安装本插件的 profile cordis.patch.yml 零改动', readFileSync(qqPatch(h10), 'utf8') === before10)
  check('未安装本插件的 profile @local 目录零创建', !existsSync(join(p10, 'node_modules', '@local')))

  // ⑨ 负例B：dsh-extra-plan 核心零感知（静态断言）

  // ⑩ DSH_HOME env 优先于 ~/.dsh（index.js apply 实测）
  const h12 = join(tempRoot, 's12-env')
  makeProfile(h12, 'qqbot')
  installOwnPlugin(h12, 'qqbot')
  writeFileSync(qqPatch(h12), legacyPatch(true), 'utf8')
  const prevHome = process.env.DSH_HOME
  process.env.DSH_HOME = h12
  try { applyLitePlugin() } finally {
    if (prevHome === undefined) delete process.env.DSH_HOME
    else process.env.DSH_HOME = prevHome
  }
  const applied12Result = parseYaml(readFileSync(qqPatch(h12), 'utf8'))
  const applied12 = applied12Result.ok ? applied12Result.value : null
  check('index.js apply 使用 DSH_HOME env 迁移临时 home 的旧根级块', applied12Result.ok && Array.isArray(applied12) && isMap(rootRow(applied12, 'im-qqbot')) && !applied12.some((row) => isMap(row) && (row.id === 'code-runtime' || row.id === 'agent-presets')), applied12Result.error || '')
  check('findOwnQqbotProfiles 直测命中已装插件 qqbot profile', findOwnQqbotProfiles(h12).includes('qqbot'))

  // CLI 冒烟：DSH_HOME env 注入临时 home，验证兜底迁移路径与退出码
  const hCli = join(tempRoot, 'cli-smoke')
  makeProfile(hCli, 'qqbot')
  installOwnPlugin(hCli, 'qqbot')
  writeFileSync(qqPatch(hCli), legacyPatch(true), 'utf8')
  const cli = runCli(hCli)
  const cliParsedResult = parseYaml(readFileSync(qqPatch(hCli), 'utf8'))
  const cliParsed = cliParsedResult.ok ? cliParsedResult.value : null
  check('CLI 兜底退出码 0 且输出自愈完成', cli.status === 0 && cli.error === undefined && cli.stdout.includes('自愈完成'))
  check('CLI 兜底实际迁移旧根级块', cliParsedResult.ok && Array.isArray(cliParsed) && isMap(rootRow(cliParsed, 'im-qqbot')) && !cliParsed.some((row) => isMap(row) && (row.id === 'code-runtime' || row.id === 'agent-presets')), cliParsedResult.error || '')
  const cliRepeat = runCli(hCli)
  check('CLI 幂等重跑退出码 0', cliRepeat.status === 0 && cliRepeat.error === undefined)
  check('CLI 重复运行文件字节不变且 .bak-* 不增', bakCount(qqProfileDir(hCli)) === 1)

  // CLI 无命中 profile（空 DSH_HOME）时也可执行且退出码 0（不阻断口径）
  const hEmptyCli = join(tempRoot, 'cli-empty')
  mkdirSync(hEmptyCli, { recursive: true })
  const cliEmpty = runCli(hEmptyCli)
  check('CLI 无命中 profile 时退出码 0 且不报错', cliEmpty.status === 0 && cliEmpty.error === undefined && !cliEmpty.stderr.includes('自愈失败'))
  const cliNoEnv = runCli(hEmptyCli, { noDshHome: true })
  check('CLI 无 DSH_HOME 时（默认 ~/.dsh 指向临时目录）退出码 0 且不报错', cliNoEnv.status === 0 && cliNoEnv.error === undefined && !cliNoEnv.stderr.includes('自愈失败'))
} catch (err) {
  fail += 1
  console.error('FAIL  精简版自愈回归异常: ' + String(err && err.stack || err))
} finally {
  rmSync(tempRoot, { recursive: true, force: true })
}
}

console.log('\n通过 ' + pass + ', 失败 ' + fail + ', 跳过 ' + skipCount)
process.exit(fail === 0 ? 0 : 1)
