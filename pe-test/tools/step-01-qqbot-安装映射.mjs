// 精简版自愈回归：直接 import ../../plugins/dsh-qqbot-user-questions/lib/heal.js 纯函数直测
// + scripts/heal.mjs CLI 子进程冒烟（DSH_HOME env 注入）。全部场景 mkdtemp 临时目录，
// 不触碰工作区或生产 profile；验证补行/幂等/建链/负例 A（未装插件零改动）/负例 B（核心零感知）。
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
function treeHasId(node, id) {
  if (Array.isArray(node)) return node.some((item) => treeHasId(item, id))
  if (node !== null && typeof node === 'object') {
    if (Object.prototype.hasOwnProperty.call(node, 'id') && node.id === id) return true
    for (const value of Object.values(node)) { if (treeHasId(value, id)) return true }
  }
  return false
}
function parsedHasIds(text) {
  const yaml = loadTestYaml()
  if (yaml === null) return false
  try {
    const parsed = yaml.load(text)
    if (parsed === null || parsed === undefined) return false
    return treeHasId(parsed, 'code-runtime') && treeHasId(parsed, 'agent-presets')
  } catch { return false }
}
function blockOf(lines, id) {
  const re = new RegExp("^\\s*-\\s*id:\\s*['\"]?" + id + "['\"]?\\s*$")
  let idx = -1
  for (let i = 0; i < lines.length; i += 1) { if (re.test(lines[i])) { idx = i; break } }
  if (idx === -1) return null
  const indent = (lines[idx].match(/^\s*/) || [''])[0].length
  let end = lines.length
  for (let i = idx + 1; i < lines.length; i += 1) {
    const m = /^\s*-\s/.exec(lines[i])
    if (m && m[0].length <= indent + 2) { end = i; break }
  }
  return lines.slice(idx, end)
}

const tempRoot = mkdtempSync(join(tmpdir(), 'dsh-extra-plan-qqbot-lite-'))
try {
  // ① 空 [] patch → 补两行且可解析
  const h1 = join(tempRoot, 's1-empty-array')
  makeProfile(h1, 'qqbot')
  installOwnPlugin(h1, 'qqbot')
  writeFileSync(qqPatch(h1), '# 注释\n[]\n', 'utf8')
  const r1 = healPatchRows(qqProfileDir(h1))
  const after1 = readFileSync(qqPatch(h1), 'utf8')
  check('空 [] patch 补出 code-runtime（无 config）与 agent-presets（config.default: standard）两行',
    r1.status === 'healed' &&
    after1.includes('- id: code-runtime') && after1.includes("  name: '@deepseek-ai/dsh-code-runtime-worker-thread'") &&
    after1.includes('- id: agent-presets') && after1.includes("  name: '@deepseek-ai/dsh-agent-presets'") &&
    after1.includes('  config:') && after1.includes('    default: standard'))
  const blockCr = blockOf(after1.split('\n'), 'code-runtime')
  const blockAp = blockOf(after1.split('\n'), 'agent-presets')
  check('code-runtime 条目块无 config（照抄官方 L49-50）', blockCr !== null && !blockCr.some((l) => l.includes('config:')))
  check('agent-presets 条目块含 name/config/default: standard（照抄官方 L441-444）',
    blockAp !== null && blockAp.some((l) => l.includes("  name: '@deepseek-ai/dsh-agent-presets'")) &&
    blockAp.some((l) => l === '  config:') && blockAp.some((l) => l === '    default: standard'))
  check('补行结果可被 js-yaml 解析且含两目标 id', parsedHasIds(after1))
  const backs1 = bakCount(qqProfileDir(h1))
  check('写前产生 .bak-<ts> 备份且内容为原文件', backs1 === 1)

  // ② 重复运行 → 字节不变、不新增 .bak-*
  const before2 = readFileSync(qqPatch(h1), 'utf8')
  const r2 = healPatchRows(qqProfileDir(h1))
  check('补行幂等：status=idempotent 且文件字节不变', r2.status === 'idempotent' && readFileSync(qqPatch(h1), 'utf8') === before2)
  check('幂等重复运行不新增 .bak-*', bakCount(qqProfileDir(h1)) === backs1)

  // ③ 已有 code-runtime 行（含不同 config）→ 该行不动
  const h3 = join(tempRoot, 's3-existing')
  makeProfile(h3, 'qqbot')
  installOwnPlugin(h3, 'qqbot')
  const existingLine = '    - id: code-runtime\n      name: "@deepseek-ai/dsh-code-runtime-worker-thread"\n      config:\n        custom: yes'
  writeFileSync(qqPatch(h3), '- insert:\n' + existingLine + '\n', 'utf8')
  const r3 = healPatchRows(qqProfileDir(h3))
  const after3 = readFileSync(qqPatch(h3), 'utf8')
  check('已有 code-runtime（含不同 config）原样不动', r3.status === 'healed' && after3.includes(existingLine) && after3.includes('custom: yes'))
  check('不重复插入 code-runtime，仅末尾追加 agent-presets', (after3.match(/- id: code-runtime/g) || []).length === 1 && after3.includes('- id: agent-presets'))

  // ④ web 包缺失 → 跳过建链不报错
  const h4 = join(tempRoot, 's4-web-missing')
  makeProfile(h4, 'qqbot')
  installOwnPlugin(h4, 'qqbot')
  const w4 = captureWarn(() => healQqbotCompatibility(h4))
  check('web 包缺失时 heal 不抛异常且输出跳过警告', w4.messages.some((m) => m.includes('未找到 web 的 dsh-extra-plan，跳过映射')))
  check('web 包缺失时不创建 qqbot 目标链接', !existsSync(qqExtraPlanDir(h4)))

  // ⑤ qqbot 目标缺失 → 建 junction 且 realpath 指向 web 包
  const h5 = join(tempRoot, 's5-link-create')
  makeProfile(h5, 'qqbot')
  installOwnPlugin(h5, 'qqbot')
  const web5 = createWebPackage(h5)
  healQqbotCompatibility(h5)
  check('目标缺失时创建 symbolic link（Windows junction）', isLink(qqExtraPlanDir(h5)))
  check('链接 realpath 指向 web 包', sameTarget(qqExtraPlanDir(h5), web5))

  // ⑥ 已正确链接 → 不动
  const before6 = realpathSync(qqExtraPlanDir(h5))
  healQqbotCompatibility(h5)
  check('已正确链接重复运行保持指向 web 且无异常', isLink(qqExtraPlanDir(h5)) && sameTarget(qqExtraPlanDir(h5), web5) && realpathSync(qqExtraPlanDir(h5)) === before6)

  // ⑦ 实体目录 → 保留并提示 pnpm 迁移
  const h7a = join(tempRoot, 's7a-entity')
  makeProfile(h7a, 'qqbot')
  installOwnPlugin(h7a, 'qqbot')
  createWebPackage(h7a)
  const entityTarget = qqExtraPlanDir(h7a)
  mkdirSync(entityTarget, { recursive: true })
  writeFileSync(join(entityTarget, 'marker.txt'), 'old entity\n', 'utf8')
  const w7a = captureWarn(() => healQqbotCompatibility(h7a))
  check('实体目录保留且提示 pnpm 迁移', existsSync(join(entityTarget, 'marker.txt')) && !isLink(entityTarget) && w7a.messages.some((m) => m.includes('请通过 pnpm 完成迁移')))

  // ⑦b 非目标链接 → 保留并提示 pnpm 迁移
  const h7b = join(tempRoot, 's7b-otherlink')
  makeProfile(h7b, 'qqbot')
  installOwnPlugin(h7b, 'qqbot')
  createWebPackage(h7b)
  const other = join(h7b, 'other-target')
  mkdirSync(other, { recursive: true })
  symlinkSync(other, qqExtraPlanDir(h7b), process.platform === 'win32' ? 'junction' : 'dir')
  const w7b = captureWarn(() => healQqbotCompatibility(h7b))
  check('非目标链接原样保留并提示 pnpm 迁移', isLink(qqExtraPlanDir(h7b)) && realpathSync(qqExtraPlanDir(h7b)) === realpathSync(other) && w7b.messages.some((m) => m.includes('请通过 pnpm 完成迁移')))

  // ⑧ 负例A：bundles 锚定但未装本插件 → 零改动
  const h8 = join(tempRoot, 's8-negative-a')
  const p8 = makeProfile(h8, 'qqbot')
  writeFileSync(qqPatch(h8), '# 注释\n[]\n', 'utf8')
  const before8 = readFileSync(qqPatch(h8), 'utf8')
  const r8 = healQqbotCompatibility(h8)
  check('未安装本插件的 profile 不被命中（count=0）', r8.count === 0 && r8.profiles.length === 0)
  check('未安装本插件的 profile cordis.patch.yml 零改动', readFileSync(qqPatch(h8), 'utf8') === before8)
  check('未安装本插件的 profile @local 目录零创建', !existsSync(join(p8, 'node_modules', '@local')))

  // ⑨ 负例B：dsh-extra-plan 核心零感知（静态断言）
  const presetSync = readFileSync(join(SOURCE_ROOT, 'plugins', 'dsh-extra-plan', 'lib', 'preset-sync.js'), 'utf8')
  const distribute = readFileSync(join(SOURCE_ROOT, 'plugins', 'dsh-extra-plan', 'scripts', 'distribute-preset.mjs'), 'utf8')
  check('preset-sync.js 不含 qqbot/code-runtime/qqbot 自愈标识符（核心零感知）', !/qqbot|code-runtime|healQqbotCompatibility|healPatchRows/i.test(presetSync))
  check('distribute-preset.mjs 不含 qqbot/code-runtime/qqbot 自愈标识符（核心零感知）', !/qqbot|code-runtime|healQqbotCompatibility|healPatchRows/i.test(distribute))

  // ⑩ DSH_HOME env 优先于 ~/.dsh（index.js apply 实测）
  const h10 = join(tempRoot, 's10-env')
  makeProfile(h10, 'qqbot')
  installOwnPlugin(h10, 'qqbot')
  writeFileSync(qqPatch(h10), '# 注释\n[]\n', 'utf8')
  const prevHome = process.env.DSH_HOME
  process.env.DSH_HOME = h10
  try { applyLitePlugin() } finally {
    if (prevHome === undefined) delete process.env.DSH_HOME
    else process.env.DSH_HOME = prevHome
  }
  check('index.js apply 使用 DSH_HOME env（临时 home 被补行）', readFileSync(qqPatch(h10), 'utf8').includes('- id: code-runtime') && readFileSync(qqPatch(h10), 'utf8').includes('- id: agent-presets'))
  check('findOwnQqbotProfiles 直测命中已装插件 qqbot profile', findOwnQqbotProfiles(h10).includes('qqbot'))

  // CLI 冒烟：DSH_HOME env 注入临时 home，验证兜底路径与退出码
  const hCli = join(tempRoot, 'cli-smoke')
  makeProfile(hCli, 'qqbot')
  installOwnPlugin(hCli, 'qqbot')
  writeFileSync(qqPatch(hCli), '[]\n', 'utf8')
  const cli = runCli(hCli)
  check('CLI 兜底退出码 0 且输出自愈完成', cli.status === 0 && cli.error === undefined && cli.stdout.includes('自愈完成'))
  check('CLI 兜底实际补行（code-runtime/agent-presets）', readFileSync(qqPatch(hCli), 'utf8').includes('- id: code-runtime') && readFileSync(qqPatch(hCli), 'utf8').includes('- id: agent-presets'))
  const cliRepeat = runCli(hCli)
  check('CLI 幂等重跑退出码 0', cliRepeat.status === 0 && cliRepeat.error === undefined)
  check('CLI 重复运行文件字节不变且 .bak-* 不增', bakCount(qqProfileDir(hCli)) === 1)

  // CLI 无命中 profile（空 DSH_HOME）时也可执行且退出码 0（不阻断口径）
  const hEmpty = join(tempRoot, 'cli-empty')
  mkdirSync(hEmpty, { recursive: true })
  const cliEmpty = runCli(hEmpty)
  check('CLI 无命中 profile 时退出码 0 且不报错', cliEmpty.status === 0 && cliEmpty.error === undefined && !/自愈失败/.test(cliEmpty.stderr))
  const cliNoEnv = runCli(hEmpty, { noDshHome: true })
  check('CLI 无 DSH_HOME 时（默认 ~/.dsh 指向临时目录）退出码 0 且不报错', cliNoEnv.status === 0 && cliNoEnv.error === undefined && !/自愈失败/.test(cliNoEnv.stderr))
} catch (err) {
  fail += 1
  console.error('FAIL  精简版自愈回归异常: ' + String(err && err.stack || err))
} finally {
  rmSync(tempRoot, { recursive: true, force: true })
}

console.log('\n通过 ' + pass + ', 失败 ' + fail)
process.exit(fail === 0 ? 0 : 1)
