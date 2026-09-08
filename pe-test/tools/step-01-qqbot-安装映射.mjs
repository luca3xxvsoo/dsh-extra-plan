// QQBot postinstall 建链回归：所有安装布局与 DSH_HOME 均位于系统临时目录。
// 通过实际 node scripts/apply-patch.mjs 子进程验证，不触碰工作区或生产 profile。
import { spawnSync } from 'node:child_process'
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
function installMinimalPackage(home) {
  const packageDir = installedPackageDir(home)
  mkdirSync(join(packageDir, 'scripts'), { recursive: true })
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
  check('已有任意 symbolic link 时 postinstall 退出码为 0', existingLinkRun.status === 0 && existingLinkRun.error === undefined)
  check('已有其他目标 symbolic link 原样保留', isLink(existingTarget) && realpathSync(existingTarget) === beforeExisting)

  const entityHome = join(tempRoot, 'entity-replace')
  mkdirSync(entityHome, { recursive: true })
  installMinimalPackage(entityHome)
  const entityWeb = createWebPackage(entityHome)
  const entityTarget = qqExtraPlanDir(entityHome)
  mkdirSync(entityTarget, { recursive: true })
  const marker = join(entityTarget, 'old-entity-marker.txt')
  writeFileSync(marker, 'old entity\n', 'utf8')
  const entityFirst = runPostinstall(entityHome, entityHome)
  check('实体 qqbot 目录替换后 postinstall 退出码为 0', entityFirst.status === 0 && entityFirst.error === undefined)
  check('实体目录替换为指向 web 的 symbolic link', isLink(entityTarget) && sameTarget(entityTarget, entityWeb))
  check('实体目录标记文件已删除', !existsSync(marker))
  const entitySecond = runPostinstall(entityHome, entityHome)
  check('再次运行保持同一 link 且退出码为 0', entitySecond.status === 0 && entitySecond.error === undefined && isLink(entityTarget) && sameTarget(entityTarget, entityWeb))
  check('幂等重跑不输出建链异常', !entitySecond.output.includes('映射建立失败:'))

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
