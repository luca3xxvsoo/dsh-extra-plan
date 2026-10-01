// QQBot 环境依赖验证：严格预检、junction 能力/临时夹具、真实 profile 只读核验。
// 真实 DSH_HOME 分支只读；所有 heal 调用仅接收 mkdtemp 生成的临时 home。
import { createRequire } from 'node:module'
import { existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { homedir, tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { findOwnQqbotProfiles, healQqbotCompatibility as healFixture } from '../../plugins/dsh-qqbot-user-questions/lib/heal.js'

const HERE = dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = join(HERE, '..', '..')
const SOURCE_PACKAGE = join(REPO_ROOT, 'plugins', 'dsh-qqbot-user-questions')
const SOURCE_PACKAGE_MANIFEST = join(SOURCE_PACKAGE, 'package.json')
const SOURCE_HEAL_TEXT = readFileSync(join(SOURCE_PACKAGE, 'lib', 'heal.js'), 'utf8')
const LINK_TYPE = process.platform === 'win32' ? 'junction' : 'dir'
const QQBOT_BUNDLE = '@tencent-connect/dsh-qqbot'
const QQBOT_PACKAGE = '@local/dsh-qqbot-user-questions'
const WEB_PACKAGE = '@local/dsh-extra-plan'

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

function emitInfo(value) {
  console.log('INFO  ' + JSON.stringify(value))
}

function emitSkip(scope, reason, details) {
  skipCount += 1
  console.log('SKIP  ' + JSON.stringify({ scope, reason, details }))
}

let sourcePackageJson = null
try { sourcePackageJson = JSON.parse(readFileSync(SOURCE_PACKAGE_MANIFEST, 'utf8')) } catch { sourcePackageJson = null }
check('QB5 健壮性改进：QQBot package-local 声明 js-yaml ^4.2.0',
  sourcePackageJson !== null && sourcePackageJson.dependencies !== null && typeof sourcePackageJson.dependencies === 'object' && sourcePackageJson.dependencies['js-yaml'] === '^4.2.0')
check('QB5 健壮性改进：heal.js 移除 APPDATA/固定宿主后备并保留包自身解析',
  SOURCE_HEAL_TEXT.includes("createRequire(import.meta.url)('js-yaml')") && !SOURCE_HEAL_TEXT.includes('APPDATA') &&
  !SOURCE_HEAL_TEXT.includes("from 'node:os'") && !SOURCE_HEAL_TEXT.includes('@deepseek-ai/dsh/package.json'))

function errorCode(error) {
  if (error && typeof error.code === 'string') return error.code
  return error instanceof Error ? error.message : String(error)
}

function isAccessError(error) {
  return Boolean(error && (error.code === 'EACCES' || error.code === 'EPERM'))
}

function isObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function pathState(path) {
  try {
    lstatSync(path)
    return { exists: true, readable: true }
  } catch (error) {
    if (error && error.code === 'ENOENT') return { exists: false, readable: false }
    return { exists: true, readable: false, error: errorCode(error) }
  }
}

function readText(path) {
  try {
    return { ok: true, text: readFileSync(path, 'utf8') }
  } catch (error) {
    return { ok: false, error: errorCode(error) }
  }
}

function dshHomeOf() {
  const configured = process.env.DSH_HOME
  return typeof configured === 'string' && configured.trim() !== ''
    ? configured
    : join(homedir(), '.dsh')
}

function profilePaths(dshHome) {
  const profileDir = join(dshHome, 'profiles', 'qqbot')
  return {
    profileDir,
    manifest: join(profileDir, 'package.json'),
    adapterPlugin: join(profileDir, 'node_modules', '@local', 'dsh-qqbot-user-questions'),
    webCore: join(dshHome, 'profiles', 'web', 'node_modules', '@local', 'dsh-extra-plan'),
    patch: join(profileDir, 'cordis.patch.yml'),
    mapping: join(profileDir, 'node_modules', '@local', 'dsh-extra-plan'),
  }
}

function emptyPreflight(dshHome, paths) {
  return {
    kind: 'qqbot-preflight',
    dshHome,
    profileDir: { path: paths.profileDir, exists: false, readable: false },
    manifest: { path: paths.manifest, exists: false, readable: false, validJson: false, bundlePresent: false },
    adapterPlugin: { path: paths.adapterPlugin, exists: false, readable: false },
    webCore: { path: paths.webCore, exists: false, readable: false },
    patch: { path: paths.patch, exists: false, readable: false },
    ready: false,
    missing: [],
  }
}

function buildPreflight(dshHome) {
  const paths = profilePaths(dshHome)
  const info = emptyPreflight(dshHome, paths)
  const missing = info.missing
  const profile = pathState(paths.profileDir)
  info.profileDir = { path: paths.profileDir, exists: profile.exists, readable: profile.readable }
  if (!profile.exists || !profile.readable) {
    missing.push('profile-dir')
    return { info, ready: false, patchText: null, paths }
  }

  const manifest = pathState(paths.manifest)
  info.manifest.exists = manifest.exists
  info.manifest.readable = manifest.readable
  if (!manifest.exists) {
    missing.push('manifest-missing')
  } else if (!manifest.readable) {
    missing.push('manifest-unreadable')
  } else {
    const manifestRead = readText(paths.manifest)
    if (!manifestRead.ok) {
      info.manifest.readable = false
      missing.push('manifest-unreadable')
    } else {
      try {
        const parsed = JSON.parse(manifestRead.text)
        info.manifest.validJson = true
        const bundles = isObject(parsed) && isObject(parsed.dsh) && isObject(parsed.dsh.profile) && Array.isArray(parsed.dsh.profile.bundles)
          ? parsed.dsh.profile.bundles
          : []
        info.manifest.bundlePresent = bundles.includes(QQBOT_BUNDLE)
        if (!info.manifest.bundlePresent) missing.push('bundle-missing')
      } catch {
        missing.push('manifest-invalid-json')
      }
    }
  }

  const adapter = pathState(paths.adapterPlugin)
  info.adapterPlugin = { path: paths.adapterPlugin, exists: adapter.exists, readable: adapter.readable }
  if (!adapter.exists || !adapter.readable) missing.push('adapter-plugin-missing')

  const web = pathState(paths.webCore)
  info.webCore = { path: paths.webCore, exists: web.exists, readable: web.readable }
  if (!web.exists || !web.readable) missing.push('web-core-missing')

  const patch = pathState(paths.patch)
  info.patch.exists = patch.exists
  info.patch.readable = patch.readable
  let patchText = null
  if (!patch.exists) {
    missing.push('patch-missing')
  } else if (!patch.readable) {
    missing.push('patch-unreadable')
  } else {
    const patchRead = readText(paths.patch)
    if (!patchRead.ok) {
      info.patch.readable = false
      missing.push('patch-unreadable')
    } else {
      patchText = patchRead.text
    }
  }

  info.missing = missing
  info.ready = missing.length === 0
  return { info, ready: info.ready, patchText, paths }
}

let yamlResolution = null
function yamlCandidates(preflight) {
  const candidates = []
  const add = (kind, path) => {
    const state = pathState(path)
    candidates.push({ kind, path, available: state.exists && state.readable, error: state.error || null })
  }
  add('live-profile-plugin-manifest', join(preflight.paths.adapterPlugin, 'package.json'))
  add('live-profile-manifest', preflight.paths.manifest)
  add('workspace-qqbot-package', SOURCE_PACKAGE_MANIFEST)
  const installRoot = typeof process.env.DSH_INSTALL_ROOT === 'string' ? process.env.DSH_INSTALL_ROOT.trim() : ''
  if (installRoot !== '') {
    add('explicit-install-root', join(installRoot, 'package.json'))
    add('explicit-host-dsh-package', join(installRoot, 'node_modules', '@deepseek-ai', 'dsh', 'package.json'))
  }
  return candidates
}
function loadYaml(preflight) {
  if (yamlResolution !== null) return yamlResolution
  const candidates = yamlCandidates(preflight)
  const failures = []
  for (const candidate of candidates) {
    if (!candidate.available) {
      failures.push({ anchor: candidate, error: candidate.error || 'manifest-unavailable' })
      continue
    }
    try {
      const module = createRequire(candidate.path)('js-yaml')
      yamlResolution = { module, anchor: candidate, candidates, failures }
      return yamlResolution
    } catch (error) {
      failures.push({ anchor: candidate, error: errorCode(error) })
    }
  }
  yamlResolution = { module: null, anchor: null, candidates, failures }
  return yamlResolution
}

function parseYaml(text, preflight) {
  const resolution = loadYaml(preflight)
  if (resolution.module === null) return { ok: false, value: null, error: 'yaml-parser-unavailable', anchor: null }
  try {
    return { ok: true, value: resolution.module.load(text), error: null, anchor: resolution.anchor }
  } catch (error) {
    return { ok: false, value: null, error: errorCode(error), anchor: resolution.anchor }
  }
}

function probeJunctionCapability() {
  let probeRoot = null
  let supported = false
  let error = null
  try {
    probeRoot = mkdtempSync(join(tmpdir(), 'dsh-extra-plan-qqbot-junction-probe-'))
    const source = join(probeRoot, 'source')
    const target = join(probeRoot, 'target')
    mkdirSync(source)
    symlinkSync(source, target, LINK_TYPE)
    const targetStat = lstatSync(target)
    supported = targetStat.isSymbolicLink() && realpathSync(target) === realpathSync(source)
    if (!supported) error = 'link-created-but-lstat-or-realpath-check-failed'
  } catch (caught) {
    error = errorCode(caught)
  } finally {
    if (probeRoot !== null) rmSync(probeRoot, { recursive: true, force: true })
  }
  const result = { kind: 'junction-capability', supported, linkType: LINK_TYPE }
  if (error !== null) result.error = error
  emitInfo(result)
  return supported
}

function fixturePaths(home, name = 'qqbot') {
  const profileDir = join(home, 'profiles', name)
  return {
    profileDir,
    manifest: join(profileDir, 'package.json'),
    adapterPlugin: join(profileDir, 'node_modules', '@local', 'dsh-qqbot-user-questions'),
    webCore: join(home, 'profiles', 'web', 'node_modules', '@local', 'dsh-extra-plan'),
    patch: join(profileDir, 'cordis.patch.yml'),
    mapping: join(profileDir, 'node_modules', '@local', 'dsh-extra-plan'),
  }
}

function makeFixtureHome(prefix) {
  const home = mkdtempSync(join(tmpdir(), prefix))
  const paths = fixturePaths(home)
  mkdirSync(paths.profileDir, { recursive: true })
  mkdirSync(paths.adapterPlugin, { recursive: true })
  mkdirSync(paths.webCore, { recursive: true })
  writeFileSync(paths.manifest, JSON.stringify({ name: 'qqbot-profile', dsh: { profile: { bundles: [QQBOT_BUNDLE] } } }), 'utf8')
  writeFileSync(paths.patch, '[]\n', 'utf8')
  return { home, paths }
}

function isLink(path) {
  try { return lstatSync(path).isSymbolicLink() } catch { return false }
}

function sameTarget(path, expected) {
  try { return realpathSync(path) === realpathSync(expected) } catch { return false }
}

function runJunctionFixture() {
  const homes = []
  try {
    const first = makeFixtureHome('dsh-extra-plan-qqbot-junction-fixture-')
    homes.push(first.home)
    healFixture(first.home)
    check('临时 fixture 目标缺失时建立 junction/dir link', isLink(first.paths.mapping))
    check('临时 fixture 新建链接 realpath 指向 web', sameTarget(first.paths.mapping, first.paths.webCore))
    const before = realpathSync(first.paths.mapping)
    healFixture(first.home)
    check('临时 fixture 重复运行保持正确链接', isLink(first.paths.mapping) && realpathSync(first.paths.mapping) === before)

    const other = makeFixtureHome('dsh-extra-plan-qqbot-other-link-')
    homes.push(other.home)
    const otherDestination = join(other.home, 'other-target')
    mkdirSync(otherDestination, { recursive: true })
    symlinkSync(otherDestination, other.paths.mapping, LINK_TYPE)
    healFixture(other.home)
    check('临时 fixture 非目标链接原样保留', isLink(other.paths.mapping) && sameTarget(other.paths.mapping, otherDestination))
  } catch (error) {
    check('junction 临时 fixture 执行', false, errorCode(error))
  } finally {
    for (const home of homes) rmSync(home, { recursive: true, force: true })
  }
}

function inspectMapping(target, expected) {
  let stat
  try {
    stat = lstatSync(target)
  } catch (error) {
    if (error && error.code === 'ENOENT') return { category: 'missing' }
    if (isAccessError(error)) return { category: 'unavailable', error: errorCode(error) }
    return { category: 'inspection-error', error: errorCode(error) }
  }
  if (!stat.isSymbolicLink()) return { category: 'entity' }

  let expectedReal
  try {
    expectedReal = realpathSync(expected)
  } catch (error) {
    if (isAccessError(error)) return { category: 'unavailable', error: errorCode(error) }
    return { category: 'inspection-error', error: errorCode(error) }
  }
  try {
    const actualReal = realpathSync(target)
    if (actualReal === expectedReal) return { category: 'correct-link', realpath: actualReal }
    return { category: 'other-link', realpath: actualReal, expectedReal }
  } catch (error) {
    if (error && error.code === 'ENOENT') return { category: 'dangling-link' }
    if (isAccessError(error)) return { category: 'unavailable', error: errorCode(error) }
    return { category: 'inspection-error', error: errorCode(error) }
  }
}

function mappingSignature(value) {
  return value.category + '|' + (value.realpath || '')
}

function runLiveReadonly(preflight) {
  const yaml = loadYaml(preflight)
  if (yaml.module === null) {
    emitSkip('live-profile', 'yaml-parser-unavailable', {
      candidates: yaml.candidates,
      failures: yaml.failures,
    })
    return
  }
  emitInfo({ kind: 'yaml-parser', anchor: yaml.anchor, failures: yaml.failures })
  const { info, paths, patchText } = preflight
  const profiles = findOwnQqbotProfiles(info.dshHome)
  check('真实 profile 扫描结果含 qqbot', profiles.includes('qqbot'), JSON.stringify(profiles))

  const parsedPatch = parseYaml(patchText, preflight)
  check('真实 cordis.patch.yml 为顶层数组', parsedPatch.ok && Array.isArray(parsedPatch.value), parsedPatch.error || '')
  const imQqbot = parsedPatch.ok && Array.isArray(parsedPatch.value)
    ? parsedPatch.value.find((row) => isObject(row) && row.id === 'im-qqbot')
    : undefined

  const mappingBefore = inspectMapping(paths.mapping, paths.webCore)
  let patchAfter = null
  try {
    patchAfter = readFileSync(paths.patch, 'utf8')
  } catch (error) {
    check('真实 patch 只读二次读取', false, errorCode(error))
  }
  check('真实 patch 检查前后字节保持一致', patchAfter !== null && patchAfter === patchText)

  const mappingAfter = inspectMapping(paths.mapping, paths.webCore)
  if (mappingBefore.category === 'unavailable' || mappingAfter.category === 'unavailable') {
    emitSkip('live-profile', 'link-inspection-unavailable', {
      path: paths.mapping,
      before: mappingBefore,
      after: mappingAfter,
    })
    return
  }
  check('真实映射分类为 correct-link', mappingBefore.category === 'correct-link', JSON.stringify(mappingBefore))
  check('真实映射分类与 realpath 检查前后保持一致', mappingSignature(mappingBefore) === mappingSignature(mappingAfter), JSON.stringify({ before: mappingBefore, after: mappingAfter }))
}

const dshHome = dshHomeOf()
const preflight = buildPreflight(dshHome)
emitInfo(preflight.info)
const junctionSupported = probeJunctionCapability()
if (junctionSupported) {
  runJunctionFixture()
} else {
  emitSkip('junction-fixture', 'junction-unavailable', { linkType: LINK_TYPE })
}
if (!preflight.ready) {
  emitSkip('live-profile', 'qqbot-environment-unavailable', {
    dshHome,
    missing: preflight.info.missing,
  })
} else {
  runLiveReadonly(preflight)
}

console.log('通过 ' + pass + ', 失败 ' + fail + ', 跳过 ' + skipCount)
process.exitCode = fail > 0 ? 1 : 0
