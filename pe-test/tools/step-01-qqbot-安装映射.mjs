// QQBot postinstall 建链回归：所有安装布局与 DSH_HOME 均位于系统临时目录。
// 通过实际 node scripts/apply-patch.mjs 子进程验证，不触碰工作区或生产 profile。
import { spawnSync } from 'node:child_process'
import { createRequire } from 'node:module'
import { closeSync, copyFileSync, existsSync, lstatSync, mkdtempSync, mkdirSync, openSync, readFileSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { homedir, tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const SOURCE_ROOT = join(HERE, '..', '..')
const SOURCE_PACKAGE = join(SOURCE_ROOT, 'plugins', 'dsh-qqbot-user-questions')
const SOURCE_APPLY = join(SOURCE_PACKAGE, 'scripts', 'apply-patch.mjs')
const SOURCE_HELPER = join(SOURCE_PACKAGE, 'scripts', 'ensure-dsh-extra-plan-link.mjs')
const SOURCE_MANIFEST = join(SOURCE_PACKAGE, 'package.json')
const SOURCE_INDEX = join(SOURCE_PACKAGE, 'index.js')

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

function installedPackageDir(home) {
  return join(home, 'profiles', 'qqbot', 'node_modules', '@local', 'dsh-qqbot-user-questions')
}
function qqExtraPlanDir(home) {
  return join(home, 'profiles', 'qqbot', 'node_modules', '@local', 'dsh-extra-plan')
}
function webExtraPlanDir(home) {
  return join(home, 'profiles', 'web', 'node_modules', '@local', 'dsh-extra-plan')
}
function qqProfileDir(home) {
  return join(home, 'profiles', 'qqbot')
}
function resolveFromQqbot(home) {
  return createRequire(join(qqProfileDir(home), 'package.json')).resolve('@local/dsh-extra-plan/package.json')
}
function installMinimalPackage(home) {
  const packageDir = installedPackageDir(home)
  mkdirSync(join(packageDir, 'scripts'), { recursive: true })
  writeFileSync(join(home, 'profiles', 'qqbot', 'package.json'), '{"name":"qqbot-profile"}\n', 'utf8')
  copyFileSync(SOURCE_APPLY, join(packageDir, 'scripts', 'apply-patch.mjs'))
  copyFileSync(SOURCE_HELPER, join(packageDir, 'scripts', 'ensure-dsh-extra-plan-link.mjs'))
  copyFileSync(SOURCE_MANIFEST, join(packageDir, 'package.json'))
  return packageDir
}
function createWebPackage(home) {
  const webDir = webExtraPlanDir(home)
  mkdirSync(webDir, { recursive: true })
  writeFileSync(join(webDir, 'package.json'), '{"name":"@local/dsh-extra-plan"}\n', 'utf8')
  return webDir
}
function createDirLink(source, target) {
  symlinkSync(source, target, process.platform === 'win32' ? 'junction' : 'dir')
}
function runPostinstall(packageHome, dshHome) {
  const script = join(installedPackageDir(packageHome), 'scripts', 'apply-patch.mjs')
  const stdoutPath = join(packageHome, '.postinstall.stdout')
  const stderrPath = join(packageHome, '.postinstall.stderr')
  const stdoutFd = openSync(stdoutPath, 'w')
  const stderrFd = openSync(stderrPath, 'w')
  let result
  try {
    result = spawnSync(process.execPath, [script], {
      cwd: packageHome,
      timeout: 120000,
      stdio: ['ignore', stdoutFd, stderrFd],
      env: { ...process.env, DSH_HOME: dshHome },
    })
  } finally {
    closeSync(stdoutFd)
    closeSync(stderrFd)
  }
  const stdout = readFileSync(stdoutPath, 'utf8')
  const stderr = readFileSync(stderrPath, 'utf8')
  rmSync(stdoutPath, { force: true })
  rmSync(stderrPath, { force: true })
  return {
    status: result.status,
    error: result.error,
    output: stdout + stderr,
  }
}
function isLink(path) {
  try { return lstatSync(path).isSymbolicLink() } catch { return false }
}
function sameTarget(path, expected) {
  try { return realpathSync(path) === realpathSync(expected) } catch { return false }
}

const sourceIndex = readFileSync(SOURCE_INDEX, 'utf8')
const sourceApply = readFileSync(SOURCE_APPLY, 'utf8')
const sourceHelper = readFileSync(SOURCE_HELPER, 'utf8')
const helperCallIndex = sourceApply.indexOf('ensureDshExtraPlanLink()')
const targetsIndex = sourceApply.indexOf('const TARGETS = [')
check('index.js 不再含运行时建链 helper', !sourceIndex.includes('ensureDshExtraPlanLink'))
check('apply-patch 先调用 helper 再处理 patch', helperCallIndex >= 0 && targetsIndex > helperCallIndex)
check('helper 不含递归删除', !/rmSync\([^)]*recursive:\s*true/.test(sourceHelper))

const tempRoot = mkdtempSync(join(tmpdir(), 'dsh-extra-plan-qqbot-link-'))
try {
  const webMissingHome = join(tempRoot, 'web-missing')
  mkdirSync(webMissingHome, { recursive: true })
  installMinimalPackage(webMissingHome)
  const webMissingRun = runPostinstall(webMissingHome, webMissingHome)
  check('web 包缺失时 postinstall 退出码为 0', webMissingRun.status === 0 && webMissingRun.error === undefined)
  check('web 包缺失时输出跳过警告', webMissingRun.output.includes('未找到 web 的 dsh-extra-plan，跳过映射'))
  check('web 包缺失时不创建 qqbot 目标', !existsSync(qqExtraPlanDir(webMissingHome)))

  const missingQqHome = join(tempRoot, 'qq-missing')
  mkdirSync(missingQqHome, { recursive: true })
  installMinimalPackage(missingQqHome)
  const missingQqWeb = createWebPackage(missingQqHome)
  const missingQqRun = runPostinstall(missingQqHome, missingQqHome)
  check('qqbot 目标缺失时 postinstall 退出码为 0', missingQqRun.status === 0 && missingQqRun.error === undefined)
  check('qqbot 目标缺失时创建 symbolic link', isLink(qqExtraPlanDir(missingQqHome)))
  check('Windows junction/跨平台目录链接指向 web 包', sameTarget(qqExtraPlanDir(missingQqHome), missingQqWeb))
  const resolvedMissingQq = resolveFromQqbot(missingQqHome)
  check('以 qqbot profile 为基点解析 scoped 包落到 web fixture', realpathSync(resolvedMissingQq) === realpathSync(join(missingQqWeb, 'package.json')))
  const missingQqRepeat = runPostinstall(missingQqHome, missingQqHome)
  check('已有正确映射重复运行保持指向 web 且无建链异常', missingQqRepeat.status === 0 && missingQqRepeat.error === undefined && sameTarget(qqExtraPlanDir(missingQqHome), missingQqWeb) && !missingQqRepeat.output.includes('映射建立失败:'))

  const existingLinkHome = join(tempRoot, 'existing-link')
  mkdirSync(existingLinkHome, { recursive: true })
  installMinimalPackage(existingLinkHome)
  createWebPackage(existingLinkHome)
  const otherTarget = join(existingLinkHome, 'other-existing-target')
  mkdirSync(otherTarget, { recursive: true })
  const existingTarget = qqExtraPlanDir(existingLinkHome)
  createDirLink(otherTarget, existingTarget)
  const beforeExisting = realpathSync(existingTarget)
  const existingLinkRun = runPostinstall(existingLinkHome, existingLinkHome)
  check('已有非目标 symbolic link 时 postinstall 退出码为 0', existingLinkRun.status === 0 && existingLinkRun.error === undefined)
  check('已有非目标 symbolic link 原样保留', isLink(existingTarget) && realpathSync(existingTarget) === beforeExisting)
  check('已有非目标 link 输出 pnpm 迁移提示', existingLinkRun.output.includes('请通过 pnpm 完成迁移'))

  const entityHome = join(tempRoot, 'entity-replace')
  mkdirSync(entityHome, { recursive: true })
  installMinimalPackage(entityHome)
  createWebPackage(entityHome)
  const entityTarget = qqExtraPlanDir(entityHome)
  mkdirSync(entityTarget, { recursive: true })
  const marker = join(entityTarget, 'old-entity-marker.txt')
  writeFileSync(marker, 'old entity\n', 'utf8')
  const entityFirst = runPostinstall(entityHome, entityHome)
  check('实体 qqbot 目录保留且 postinstall 退出码为 0', entityFirst.status === 0 && entityFirst.error === undefined)
  check('实体目录原样保留且不是 symbolic link', existsSync(entityTarget) && !isLink(entityTarget))
  check('实体目录 marker 原样保留并输出 pnpm 迁移提示', existsSync(marker) && readFileSync(marker, 'utf8') === 'old entity\n' && entityFirst.output.includes('请通过 pnpm 完成迁移'))
  const entitySecond = runPostinstall(entityHome, entityHome)
  check('再次运行保留实体目录与 marker 且退出码为 0', entitySecond.status === 0 && entitySecond.error === undefined && existsSync(entityTarget) && !isLink(entityTarget) && existsSync(marker) && readFileSync(marker, 'utf8') === 'old entity\n')
  check('幂等重跑持续提示迁移且不输出建链异常', entitySecond.output.includes('请通过 pnpm 完成迁移') && !entitySecond.output.includes('映射建立失败:'))

  // packageHome 与 DSH_HOME 分离，使非法目标父路径仍执行真实安装脚本。
  const packageHome = join(tempRoot, 'invalid-run-package')
  const invalidHome = join(tempRoot, 'invalid-target-home')
  mkdirSync(packageHome, { recursive: true })
  mkdirSync(invalidHome, { recursive: true })
  installMinimalPackage(packageHome)
  createWebPackage(invalidHome)
  const invalidQqProfile = join(invalidHome, 'profiles', 'qqbot')
  mkdirSync(invalidQqProfile, { recursive: true })
  writeFileSync(join(invalidQqProfile, 'node_modules'), 'not a directory\n', 'utf8')
  const invalidRun = runPostinstall(packageHome, invalidHome)
  check('模拟建链异常时 postinstall 仍退出码为 0', invalidRun.status === 0 && invalidRun.error === undefined)
  check('模拟建链异常仅记录映射建立失败日志', invalidRun.output.includes('映射建立失败:'))
} catch (err) {
  fail += 1
  console.error('FAIL  建链场景测试异常: ' + String(err && err.stack || err))
} finally {
  rmSync(tempRoot, { recursive: true, force: true })
}

console.log('\n通过 ' + pass + ', 失败 ' + fail)
process.exit(fail === 0 ? 0 : 1)
