// QQBot 环境依赖验证：严格预检、junction 能力/临时夹具、真实 profile 只读核验。
// 真实显式Host分支只读；所有 heal 调用仅接收工作区内独立fixture home。
import { createRequire } from 'node:module'
import { existsSync, lstatSync, mkdirSync, readFileSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { createMaintenanceContext, makeFixtureDir, parseMaintenanceArgs } from '../_shared/workspace-paths.mjs'
import { createPathContext, resolveHostPath, resolveWorkspacePath, validateReadTarget } from '../../plugins/dsh-extra-plan-qqbot/lib/path-policy.js'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { healQqbotCompatibility as healImplementation } from '../../plugins/dsh-extra-plan-qqbot/lib/heal.js'

const nativeRealpathSync = typeof realpathSync.native === 'function' ? realpathSync.native : realpathSync
const healCallCounts = { workspaceFixture: 0, liveReadonly: 0 }

function callHeal(scope, ...args) {
  healCallCounts[scope] += 1
  return healImplementation(...args)
}

const HERE = dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = join(HERE, '..', '..')
const SOURCE_PACKAGE = join(REPO_ROOT, 'plugins', 'dsh-extra-plan-qqbot')
const SOURCE_PACKAGE_MANIFEST = join(SOURCE_PACKAGE, 'package.json')
const LINK_TYPE = process.platform === 'win32' ? 'junction' : 'dir'
const ENV_FIXTURE = makeFixtureDir({ label: 'qqbot-env' })
const QQBOT_BUNDLE = '@tencent-connect/dsh-qqbot'
const QQBOT_PACKAGE = 'dsh-extra-plan-qqbot'
const WEB_PACKAGE = 'dsh-extra-plan'

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
check('QB6 环境验证夹具常量使用 dsh-extra-plan-qqbot/dsh-extra-plan 平铺包名', QQBOT_PACKAGE === 'dsh-extra-plan-qqbot' && WEB_PACKAGE === 'dsh-extra-plan')

function errorCode(error) {
  if (error && typeof error.code === 'string') return error.code
  return error instanceof Error ? error.message : String(error)
}

function isAccessError(error) {
  return Boolean(error && (error.code === 'EACCES' || error.code === 'EPERM'))
}

function isJunctionCapabilityError(error) {
  return ['EPERM', 'EACCES', 'ENOSYS', 'EOPNOTSUPP', 'ENOTSUP', 'ERROR_PRIVILEGE_NOT_HELD'].includes(errorCode(error))
}

function isObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function pathState(context, target, expectedType) {
  try {
    const proof = validateReadTarget(context.pathContext, target, { expectedType })
    return { exists: true, readable: true, proof }
  } catch (error) {
    if (error && error.code === 'TARGET_MISSING') return { exists: false, readable: false }
    return { exists: true, readable: false, error: errorCode(error) }
  }
}

function readText(context, target, expectedType = 'file') {
  try {
    const proof = validateReadTarget(context.pathContext, target, { expectedType })
    return { ok: true, text: readFileSync(proof.path, 'utf8'), proof }
  } catch (error) {
    return { ok: false, error: errorCode(error) }
  }
}

function profilePaths(hostRoot, profile) {
  const profileDir = join(hostRoot, 'profiles', profile)
  return {
    profileDir,
    manifest: join(profileDir, 'package.json'),
    adapterPlugin: join(profileDir, 'node_modules', 'dsh-extra-plan-qqbot'),
    webCore: join(hostRoot, 'profiles', 'web', 'node_modules', 'dsh-extra-plan'),
    patch: join(profileDir, 'cordis.patch.yml'),
    mapping: join(profileDir, 'node_modules', 'dsh-extra-plan'),
  }
}

function emptyPreflight(hostRoot, profile, paths) {
  return {
    kind: 'qqbot-preflight',
    hostRoot,
    profile,
    hostAuthorized: hostRoot !== null,
    profileDir: { path: paths.profileDir, exists: false, readable: false },
    manifest: { path: paths.manifest, exists: false, readable: false, validJson: false, bundlePresent: false },
    adapterPlugin: { path: paths.adapterPlugin, exists: false, readable: false },
    webCore: { path: paths.webCore, exists: false, readable: false },
    patch: { path: paths.patch, exists: false, readable: false },
    ready: false,
    missing: [],
  }
}

function buildPreflight(context) {
  const authorizationMissing = []
  if (context.hostRoot === null) authorizationMissing.push('explicit-host-root')
  if (context.profile === null) authorizationMissing.push('explicit-profile')
  if (authorizationMissing.length > 0) {
    return {
      info: {
        kind: 'qqbot-preflight',
        hostRoot: context.hostRoot,
        profile: context.profile,
        hostAuthorized: context.hostAuthorized,
        ready: false,
        missing: authorizationMissing,
      },
      ready: false,
      authorizationMissing: true,
      patchText: null,
      paths: null,
      targets: null,
      context,
    }
  }

  const paths = profilePaths(context.hostRoot, context.profile)
  const info = emptyPreflight(context.hostRoot, context.profile, paths)
  const missing = info.missing
  const targets = {}
  const setState = (name, path, state) => {
    info[name] = { path, exists: state.exists, readable: state.readable }
    if (state.error) info[name].error = state.error
  }

  try {
    validateReadTarget(context.pathContext, context.hostRootTarget.policyTarget, { expectedType: 'directory' })
    targets.profileDir = resolveHostPath(context.pathContext, paths.profileDir, { purpose: 'qqbot-profile-read' })
    targets.manifest = resolveHostPath(context.pathContext, paths.manifest, { purpose: 'qqbot-profile-manifest-read' })
    targets.adapterPlugin = resolveHostPath(context.pathContext, paths.adapterPlugin, { purpose: 'qqbot-adapter-read' })
    targets.webCore = resolveHostPath(context.pathContext, paths.webCore, { purpose: 'qqbot-web-read' })
    targets.patch = resolveHostPath(context.pathContext, paths.patch, { purpose: 'qqbot-patch-read' })
    targets.mapping = resolveHostPath(context.pathContext, paths.mapping, { purpose: 'qqbot-mapping-read' })
  } catch (error) {
    info.missing.push('host-root-or-target-invalid')
    info.error = errorCode(error)
    return { info, ready: false, authorizationMissing: false, patchText: null, paths, targets, context }
  }

  const profile = pathState(context, targets.profileDir, 'directory')
  setState('profileDir', paths.profileDir, profile)
  if (!profile.exists || !profile.readable) {
    missing.push('profile-dir')
    return { info, ready: false, authorizationMissing: false, patchText: null, paths, targets, context }
  }

  const manifest = pathState(context, targets.manifest, 'file')
  setState('manifest', paths.manifest, manifest)
  if (!manifest.exists) {
    missing.push('manifest-missing')
  } else if (!manifest.readable) {
    missing.push('manifest-unreadable')
  } else {
    const manifestRead = readText(context, targets.manifest, 'file')
    if (!manifestRead.ok) {
      info.manifest.readable = false
      info.manifest.error = manifestRead.error
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

  const adapter = pathState(context, targets.adapterPlugin, 'directory')
  setState('adapterPlugin', paths.adapterPlugin, adapter)
  if (!adapter.exists || !adapter.readable) missing.push('adapter-plugin-missing')

  const web = pathState(context, targets.webCore, 'directory')
  setState('webCore', paths.webCore, web)
  if (!web.exists || !web.readable) missing.push('web-core-missing')

  const patch = pathState(context, targets.patch, 'file')
  setState('patch', paths.patch, patch)
  let patchText = null
  if (!patch.exists) {
    missing.push('patch-missing')
  } else if (!patch.readable) {
    missing.push('patch-unreadable')
  } else {
    const patchRead = readText(context, targets.patch, 'file')
    if (!patchRead.ok) {
      info.patch.readable = false
      info.patch.error = patchRead.error
      missing.push('patch-unreadable')
    } else {
      patchText = patchRead.text
    }
  }

  info.missing = missing
  info.ready = missing.length === 0
  return { info, ready: info.ready, authorizationMissing: false, patchText, paths, targets, context }
}

let yamlResolution = null
function yamlCandidates(preflight) {
  const candidates = []
  const addWorkspace = (kind, path) => {
    try {
      const target = resolveWorkspacePath(preflight.context.pathContext, path, { purpose: 'yaml-dependency-read' })
      const proof = validateReadTarget(preflight.context.pathContext, target, { expectedType: 'file' })
      candidates.push({ kind, path: proof.path, available: true, error: null })
    } catch (error) {
      candidates.push({ kind, path, available: false, error: errorCode(error) })
    }
  }
  const addCodeRoot = (kind, path, capability) => {
    try {
      const codeContext = createPathContext({
        hostCapabilities: {
          [capability]: { path, type: 'file', access: 'read', purpose: 'yaml-code-root-read' },
        },
      })
      const target = resolveHostPath(codeContext, path, { capability, purpose: 'yaml-code-root-read' })
      const proof = validateReadTarget(codeContext, target, { expectedType: 'file' })
      candidates.push({ kind, path: proof.path, available: true, error: null })
    } catch (error) {
      candidates.push({ kind, path, available: false, error: errorCode(error) })
    }
  }
  addWorkspace('workspace-qqbot-package', SOURCE_PACKAGE_MANIFEST)
  const installRoot = typeof process.env.DSH_INSTALL_ROOT === 'string' ? process.env.DSH_INSTALL_ROOT.trim() : ''
  if (installRoot !== '') {
    addCodeRoot('explicit-install-root', join(installRoot, 'package.json'), 'codeRootManifest')
    addCodeRoot('explicit-host-dsh-package', join(installRoot, 'node_modules', '@deepseek-ai', 'dsh', 'package.json'), 'dshPackageManifest')
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
  let skip = false
  let failure = null
  let error = null
  let sourceRealPath = null
  let targetRealPath = null
  try {
    probeRoot = join(ENV_FIXTURE.root, 'junction-probe')
    mkdirSync(probeRoot, { recursive: true })
    const source = join(probeRoot, 'source')
    const target = join(probeRoot, 'target')
    mkdirSync(source)
    symlinkSync(source, target, LINK_TYPE)
    sourceRealPath = nativeRealpathSync(source)
    targetRealPath = nativeRealpathSync(target)
    supported = sourceRealPath === targetRealPath
    if (!supported) failure = 'link-created-but-realpath-identity-mismatch'
  } catch (caught) {
    error = errorCode(caught)
    if (isJunctionCapabilityError(caught)) skip = true
    else failure = error
  } finally {
    if (probeRoot !== null) {
      try {
        rmSync(probeRoot, { recursive: true, force: true })
      } catch (caught) {
        error = errorCode(caught)
        skip = false
        failure = error
        supported = false
      }
    }
  }
  const result = { kind: 'junction-capability', supported, skip, linkType: LINK_TYPE, postcondition: 'native-realpath-identity' }
  if (sourceRealPath !== null) result.sourceRealPath = sourceRealPath
  if (targetRealPath !== null) result.targetRealPath = targetRealPath
  if (error !== null) result.error = error
  if (failure !== null) result.failure = failure
  emitInfo(result)
  return { supported, skip, failure, sourceRealPath, targetRealPath }
}

function fixturePaths(home, name = 'qqbot') {
  const profileDir = join(home, 'profiles', name)
  return {
    profileDir,
    manifest: join(profileDir, 'package.json'),
    adapterPlugin: join(profileDir, 'node_modules', 'dsh-extra-plan-qqbot'),
    webCore: join(home, 'profiles', 'web', 'node_modules', 'dsh-extra-plan'),
    patch: join(profileDir, 'cordis.patch.yml'),
    mapping: join(profileDir, 'node_modules', 'dsh-extra-plan'),
  }
}

function makeFixtureHome(prefix) {
  const home = join(ENV_FIXTURE.root, prefix)
  mkdirSync(home, { recursive: true })
  const paths = fixturePaths(home)
  mkdirSync(paths.profileDir, { recursive: true })
  mkdirSync(paths.adapterPlugin, { recursive: true })
  mkdirSync(paths.webCore, { recursive: true })
  writeFileSync(join(paths.adapterPlugin, 'package.json'), JSON.stringify({ name: QQBOT_PACKAGE }), 'utf8')
  writeFileSync(join(paths.webCore, 'package.json'), JSON.stringify({ name: WEB_PACKAGE }), 'utf8')
  writeFileSync(paths.manifest, JSON.stringify({ name: 'qqbot-profile', dsh: { profile: { bundles: [QQBOT_BUNDLE] } } }), 'utf8')
  writeFileSync(paths.patch, '[]\n', 'utf8')
  return { home, paths }
}

function isLink(path) {
  try { return nativeRealpathSync(path) !== path } catch { return false }
}

function sameTarget(path, expected) {
  try { return nativeRealpathSync(path) === nativeRealpathSync(expected) } catch { return false }
}

function runJunctionFixture() {
  const homes = []
  try {
    const first = makeFixtureHome('dsh-extra-plan-qqbot-junction-fixture-')
    homes.push(first.home)
    const firstHeal = callHeal('workspaceFixture', first.home, { context: createPathContext({ hostDataRoot: first.home }) })
    emitInfo({ kind: 'workspace-heal-result', fixture: 'first', result: firstHeal })
    check('临时 fixture 目标缺失时建立 junction/dir link', isLink(first.paths.mapping))
    check('临时 fixture 新建链接 realpath 指向 web', sameTarget(first.paths.mapping, first.paths.webCore))
    check('临时 fixture 不创建 node_modules/@local', !existsSync(join(first.home, 'profiles', 'qqbot', 'node_modules', '@local')))
    const before = nativeRealpathSync(first.paths.mapping)
    const secondHeal = callHeal('workspaceFixture', first.home, { context: createPathContext({ hostDataRoot: first.home }) })
    emitInfo({ kind: 'workspace-heal-result', fixture: 'first-repeat', result: secondHeal })
    check('临时 fixture 重复运行保持正确链接且不创建 @local', isLink(first.paths.mapping) && nativeRealpathSync(first.paths.mapping) === before && !existsSync(join(first.home, 'profiles', 'qqbot', 'node_modules', '@local')))

    const other = makeFixtureHome('dsh-extra-plan-qqbot-other-link-')
    homes.push(other.home)
    const otherDestination = join(other.home, 'other-target')
    mkdirSync(otherDestination, { recursive: true })
    symlinkSync(otherDestination, other.paths.mapping, LINK_TYPE)
    const otherHeal = callHeal('workspaceFixture', other.home, { context: createPathContext({ hostDataRoot: other.home }) })
    emitInfo({ kind: 'workspace-heal-result', fixture: 'other', result: otherHeal })
    check('临时 fixture 非目标链接原样保留', isLink(other.paths.mapping) && sameTarget(other.paths.mapping, otherDestination))
  } catch (error) {
    check('junction 临时 fixture 执行', false, errorCode(error))
  } finally {
    for (const home of homes) rmSync(home, { recursive: true, force: true })
  }
}

function inspectMapping(context, target, expected) {
  let expectedProof
  try {
    expectedProof = validateReadTarget(context.pathContext, expected, { expectedType: 'directory' })
  } catch (error) {
    if (isAccessError(error)) return { category: 'unavailable', error: errorCode(error) }
    return { category: 'inspection-error', error: errorCode(error) }
  }

  let mappingProof
  try {
    mappingProof = validateReadTarget(context.pathContext, target, { expectedType: 'any' })
  } catch (error) {
    if (error && error.code === 'TARGET_MISSING') return { category: 'missing' }
    if (isAccessError(error)) return { category: 'unavailable', error: errorCode(error) }
    return { category: 'inspection-error', error: errorCode(error) }
  }

  let stat
  try {
    stat = lstatSync(mappingProof.path)
  } catch (error) {
    if (error && error.code === 'ENOENT') return { category: 'missing' }
    if (isAccessError(error)) return { category: 'unavailable', error: errorCode(error) }
    return { category: 'inspection-error', error: errorCode(error) }
  }
  const actualReal = mappingProof.realPath
  const expectedReal = expectedProof.realPath
  if (!stat.isSymbolicLink() && actualReal === mappingProof.path) return { category: 'entity' }
  if (actualReal === expectedReal) return { category: 'correct-link', realpath: actualReal }
  return { category: 'other-link', realpath: actualReal, expectedReal }
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
  const { paths, patchText, targets, context } = preflight
  emitInfo({
    kind: 'live-profile-selection',
    profile: context.profile,
    hostRoot: context.hostRoot,
    profileDir: paths.profileDir,
    scope: context.hostAccess,
  })

  const parsedPatch = parseYaml(patchText, preflight)
  check('真实 cordis.patch.yml 为顶层数组', parsedPatch.ok && Array.isArray(parsedPatch.value), parsedPatch.error || '')

  const mappingBefore = inspectMapping(context, targets.mapping, targets.webCore)
  let patchAfter = null
  const patchReadAfter = readText(context, targets.patch, 'file')
  if (patchReadAfter.ok) {
    patchAfter = patchReadAfter.text
  } else {
    check('真实 patch 只读二次读取', false, patchReadAfter.error)
  }
  check('真实 patch 检查前后字节保持一致', patchAfter !== null && patchAfter === patchText)

  const mappingAfter = inspectMapping(context, targets.mapping, targets.webCore)
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

let maintenanceContext = null
let maintenanceError = null
try {
  const parsed = parseMaintenanceArgs(process.argv.slice(2))
  maintenanceContext = createMaintenanceContext(parsed)
} catch (error) {
  maintenanceError = error
}
check('公共维护参数与上下文有效', maintenanceError === null, maintenanceError === null ? '' : errorCode(maintenanceError))

const preflight = maintenanceContext === null
  ? {
      info: {
        kind: 'qqbot-preflight',
        hostRoot: null,
        profile: null,
        hostAuthorized: false,
        ready: false,
        missing: ['maintenance-context-invalid'],
        error: errorCode(maintenanceError),
      },
      ready: false,
      authorizationMissing: false,
      patchText: null,
      paths: null,
      targets: null,
      context: null,
    }
  : buildPreflight(maintenanceContext)
emitInfo(preflight.info)
const junctionProbe = probeJunctionCapability()
if (junctionProbe.supported) {
  runJunctionFixture()
} else if (junctionProbe.skip) {
  emitSkip('junction-fixture', 'junction-unavailable', { linkType: LINK_TYPE, error: junctionProbe.failure || null })
} else {
  check('junction能力后验真实身份一致', false, JSON.stringify(junctionProbe))
}
if (!preflight.ready) {
  if (maintenanceError !== null) {
    // 参数错误已由上面的 FAIL 明确报告，不用 SKIP 掩盖。
  } else if (preflight.authorizationMissing) {
    emitSkip('live-profile', 'explicit-host-root-and-profile-required', {
      status: 'NOT-RUN',
      missing: preflight.info.missing,
    })
  } else {
    check('真实 profile 只读预检', false, JSON.stringify(preflight.info))
  }
} else {
  runLiveReadonly(preflight)
}

emitInfo({ kind: 'heal-call-counts', counts: healCallCounts })
rmSync(ENV_FIXTURE.root, { recursive: true, force: true })
console.log('通过 ' + pass + ', 失败 ' + fail + ', 跳过 ' + skipCount)
process.exitCode = fail > 0 ? 1 : 0
