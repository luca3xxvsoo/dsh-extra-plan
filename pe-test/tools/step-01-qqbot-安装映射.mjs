// 精简版自愈回归：直接 import ../../plugins/dsh-qqbot-user-questions/lib/heal.js 纯函数直测
// + scripts/heal.mjs CLI 子进程冒烟（DSH_HOME env 注入）。全部场景 mkdtemp 临时目录，
// 不触碰工作区或生产 profile；验证静态 insert/旧根级块迁移/幂等/恢复/建链/职责边界。
import { spawnSync } from 'node:child_process'
import { createRequire } from 'node:module'
import { closeSync, existsSync, lstatSync, mkdtempSync, mkdirSync, openSync, readdirSync, readFileSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { homedir, tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  findOwnQqbotProfiles,
  healPatchRows,
  ensureDshExtraPlanLink,
  healQqbotCompatibility,
} from '../../plugins/dsh-qqbot-user-questions/lib/heal.js'
import { apply as applyLitePlugin } from '../../plugins/dsh-qqbot-user-questions/index.js'

const HERE = dirname(fileURLToPath(import.meta.url))
const SOURCE_ROOT = join(HERE, '..', '..')
const SOURCE_PACKAGE = join(SOURCE_ROOT, 'plugins', 'dsh-qqbot-user-questions')
const SOURCE_HEAL = join(SOURCE_PACKAGE, 'scripts', 'heal.mjs')

let pass = 0
let fail = 0
function check(label, condition) {
  if (condition) {
    pass += 1
    console.log('PASS  ' + label)
  } else {
    fail += 1
    console.log('FAIL  ' + label)
  }
}

function isLink(path) {
  try { return lstatSync(path).isSymbolicLink() } catch { return false }
}
function sameTarget(path, expected) {
  try { return realpathSync(path) === realpathSync(expected) } catch { return false }
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
function loadTestYaml() {
  try { return createRequire(import.meta.url)('js-yaml') } catch (firstError) {
    const home = process.env.APPDATA || join(homedir(), 'AppData', 'Roaming')
    try { return createRequire(join(home, 'npm', 'node_modules', '@deepseek-ai', 'dsh', 'package.json'))('js-yaml') } catch { return null }
  }
}
function parseYaml(text) {
  const yaml = loadTestYaml()
  if (yaml === null) return null
  try { return yaml.load(text) } catch { return null }
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

const tempRoot = mkdtempSync(join(tmpdir(), 'dsh-extra-plan-qqbot-lite-'))
try {
  // ① 静态兼容 patch：单一根级 insert 注册三个行，agent-presets 默认 extra-plan
  const staticPatchText = readFileSync(join(SOURCE_PACKAGE, 'cordis.patch.yml'), 'utf8')
  const staticPatch = parseYaml(staticPatchText)
  const staticInserts = rootInsertNodes(staticPatch)
  const staticRows = staticInserts.length === 1 && Array.isArray(staticInserts[0].insert) ? staticInserts[0].insert : []
  const staticCode = staticRows.find((row) => isMap(row) && row.id === 'code-runtime')
  const staticAgent = staticRows.find((row) => isMap(row) && row.id === 'agent-presets')
  const staticQqbot = staticRows.find((row) => isMap(row) && row.id === 'qqbot-user-questions')
  check('兼容 patch 是顶层数组且仅有一个根级 insert', Array.isArray(staticPatch) && staticPatch.length === 1 && staticInserts.length === 1)
  check('静态 insert 包含三个目标行及准确包名', staticRows.length === 3 &&
    isMap(staticCode) && staticCode.name === '@deepseek-ai/dsh-code-runtime-worker-thread' &&
    isMap(staticAgent) && staticAgent.name === '@deepseek-ai/dsh-agent-presets' &&
    isMap(staticQqbot) && staticQqbot.name === '@local/dsh-qqbot-user-questions')
  check('静态 agent-presets 默认严格为 extra-plan', isMap(staticAgent) && isMap(staticAgent.config) && staticAgent.config.default === 'extra-plan')
  check('code-runtime/agent-presets 不在根级非-insert patch', Array.isArray(staticPatch) && !staticPatch.some((row) => isMap(row) && (row.id === 'code-runtime' || row.id === 'agent-presets')))

  // ② 生产同形 fixture：只迁移两个旧根级块，保留 im-qqbot 与备份原文
  const h1 = join(tempRoot, 's1-legacy-root')
  makeProfile(h1, 'qqbot')
  installOwnPlugin(h1, 'qqbot')
  const before1 = legacyPatch(true) + "- id: user-custom\n  name: '@local/user-custom'\n"
  writeFileSync(qqPatch(h1), before1, 'utf8')
  const r1 = healPatchRows(qqProfileDir(h1))
  const after1 = readFileSync(qqPatch(h1), 'utf8')
  const parsed1 = parseYaml(after1)
  const backups1 = patchBackups(qqProfileDir(h1))
  const backupText1 = backups1.length === 1 ? readFileSync(join(qqProfileDir(h1), backups1[0]), 'utf8') : ''
  const hasLegacy1 = Array.isArray(parsed1) && parsed1.some((row) => isMap(row) &&
    ((row.id === 'code-runtime' && row.name === '@deepseek-ai/dsh-code-runtime-worker-thread') ||
     (row.id === 'agent-presets' && row.name === '@deepseek-ai/dsh-agent-presets' && isMap(row.config) && row.config.default === 'standard')))
  check('生产同形 patch 只迁移两个旧根级完整块', r1.status === 'migrated' && Array.isArray(r1.migrated) && r1.migrated.join('/') === 'code-runtime/agent-presets')
  check('迁移后顶层数组有效且 im-qqbot/非旧版完整用户行保留、旧根级块消失', Array.isArray(parsed1) && isMap(rootRow(parsed1, 'im-qqbot')) && isMap(rootRow(parsed1, 'user-custom')) && !hasLegacy1)
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
  const onlyParsed = parseYaml(onlyAfter)
  check('仅剩旧块时迁移结果为顶层 [] 而非空文件', onlyResult.status === 'migrated' && onlyAfter === '[]\n' && Array.isArray(onlyParsed) && onlyParsed.length === 0)
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
  const nestedParsed = parseYaml(nestedAfter)
  check('嵌套 insert 不迁移、不追加根级目标块且无备份', nestedResult.status === 'idempotent' && nestedAfter === nestedText && patchBackups(qqProfileDir(hNested)).length === 0 && rootInsertNodes(nestedParsed).length === 1)

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

  // ⑦ qqbot 目标缺失 → 建 junction 且 realpath 指向 web 包
  const h5 = join(tempRoot, 's7-link-create')
  makeProfile(h5, 'qqbot')
  installOwnPlugin(h5, 'qqbot')
  const web5 = createWebPackage(h5)
  healQqbotCompatibility(h5)
  check('目标缺失时创建 symbolic link（Windows junction）', isLink(qqExtraPlanDir(h5)))
  check('链接 realpath 指向 web 包', sameTarget(qqExtraPlanDir(h5), web5))

  // ⑧ 已正确链接 → 不动
  const before8 = realpathSync(qqExtraPlanDir(h5))
  healQqbotCompatibility(h5)
  check('已正确链接重复运行保持指向 web 且无异常', isLink(qqExtraPlanDir(h5)) && sameTarget(qqExtraPlanDir(h5), web5) && realpathSync(qqExtraPlanDir(h5)) === before8)

  // ⑨ 实体目录 → 保留并提示 pnpm 迁移
  const h9a = join(tempRoot, 's9a-entity')
  makeProfile(h9a, 'qqbot')
  installOwnPlugin(h9a, 'qqbot')
  createWebPackage(h9a)
  const entityTarget = qqExtraPlanDir(h9a)
  mkdirSync(entityTarget, { recursive: true })
  writeFileSync(join(entityTarget, 'marker.txt'), 'old entity\n', 'utf8')
  const w9a = captureWarn(() => healQqbotCompatibility(h9a))
  check('实体目录保留且提示 pnpm 迁移', existsSync(join(entityTarget, 'marker.txt')) && !isLink(entityTarget) && w9a.messages.some((m) => m.includes('请通过 pnpm 完成迁移')))

  // ⑨b 非目标链接 → 保留并提示 pnpm 迁移
  const h9b = join(tempRoot, 's9b-otherlink')
  makeProfile(h9b, 'qqbot')
  installOwnPlugin(h9b, 'qqbot')
  createWebPackage(h9b)
  const other = join(h9b, 'other-target')
  mkdirSync(other, { recursive: true })
  symlinkSync(other, qqExtraPlanDir(h9b), process.platform === 'win32' ? 'junction' : 'dir')
  const w9b = captureWarn(() => healQqbotCompatibility(h9b))
  check('非目标链接原样保留并提示 pnpm 迁移', isLink(qqExtraPlanDir(h9b)) && realpathSync(qqExtraPlanDir(h9b)) === realpathSync(other) && w9b.messages.some((m) => m.includes('请通过 pnpm 完成迁移')))

  // ⑩ 负例A：bundles 锚定但未装本插件 → 零改动
  const h10 = join(tempRoot, 's10-negative-a')
  const p10 = makeProfile(h10, 'qqbot')
  writeFileSync(qqPatch(h10), '# 注释\n[]\n', 'utf8')
  const before10 = readFileSync(qqPatch(h10), 'utf8')
  const r10 = healQqbotCompatibility(h10)
  check('未安装本插件的 profile 不被命中（count=0）', r10.count === 0 && r10.profiles.length === 0)
  check('未安装本插件的 profile cordis.patch.yml 零改动', readFileSync(qqPatch(h10), 'utf8') === before10)
  check('未安装本插件的 profile @local 目录零创建', !existsSync(join(p10, 'node_modules', '@local')))

  // ⑪ 负例B：dsh-extra-plan 核心零感知（静态断言）
  const presetSync = readFileSync(join(SOURCE_ROOT, 'plugins', 'dsh-extra-plan', 'lib', 'preset-sync.js'), 'utf8')
  const distribute = readFileSync(join(SOURCE_ROOT, 'plugins', 'dsh-extra-plan', 'scripts', 'distribute-preset.mjs'), 'utf8')
  check('preset-sync.js 不含 qqbot/code-runtime/qqbot 自愈标识符（核心零感知）', !/qqbot|code-runtime|healQqbotCompatibility|healPatchRows/i.test(presetSync))
  check('distribute-preset.mjs 不含 qqbot/code-runtime/qqbot 自愈标识符（核心零感知）', !/qqbot|code-runtime|healQqbotCompatibility|healPatchRows/i.test(distribute))

  // ⑫ DSH_HOME env 优先于 ~/.dsh（index.js apply 实测）
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
  const applied12 = parseYaml(readFileSync(qqPatch(h12), 'utf8'))
  check('index.js apply 使用 DSH_HOME env 迁移临时 home 的旧根级块', Array.isArray(applied12) && isMap(rootRow(applied12, 'im-qqbot')) && !applied12.some((row) => isMap(row) && (row.id === 'code-runtime' || row.id === 'agent-presets')))
  check('findOwnQqbotProfiles 直测命中已装插件 qqbot profile', findOwnQqbotProfiles(h12).includes('qqbot'))

  // CLI 冒烟：DSH_HOME env 注入临时 home，验证兜底迁移路径与退出码
  const hCli = join(tempRoot, 'cli-smoke')
  makeProfile(hCli, 'qqbot')
  installOwnPlugin(hCli, 'qqbot')
  writeFileSync(qqPatch(hCli), legacyPatch(true), 'utf8')
  const cli = runCli(hCli)
  const cliParsed = parseYaml(readFileSync(qqPatch(hCli), 'utf8'))
  check('CLI 兜底退出码 0 且输出自愈完成', cli.status === 0 && cli.error === undefined && cli.stdout.includes('自愈完成'))
  check('CLI 兜底实际迁移旧根级块', Array.isArray(cliParsed) && isMap(rootRow(cliParsed, 'im-qqbot')) && !cliParsed.some((row) => isMap(row) && (row.id === 'code-runtime' || row.id === 'agent-presets')))
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

console.log('\n通过 ' + pass + ', 失败 ' + fail)
process.exit(fail === 0 ? 0 : 1)
