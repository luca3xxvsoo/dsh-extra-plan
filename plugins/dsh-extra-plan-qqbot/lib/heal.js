// QQBot 兼容自愈纯模块；import 不产生文件系统副作用。
// 供启动 apply、CLI 兜底和测试复用：定位自有 profile，只清理完整根级旧块，再确保 web 包链接。
// 备份/校验/恢复以及 profile/link 合同分别在对应函数内；总调度器告警但不阻断启动。
// question/approval 行为由原生 QQBot 提供，不属于本兼容模块。
import { copyFileSync, lstatSync, mkdirSync, readFileSync, readdirSync, realpathSync, symlinkSync, unlinkSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { assertAllowedPath, createPathContext, prepareWriteTarget, resolveHostPath, validateReadTarget } from './path-policy.js'

const nativeRealpathSync = typeof realpathSync.native === 'function' ? realpathSync.native : realpathSync

const LOG_PREFIX = '[dsh-extra-plan-qqbot]'

export function sameRealPath(left, right, platform = process.platform) {
  return platform === 'win32' ? left.toLowerCase() === right.toLowerCase() : left === right
}

// ── package-local js-yaml（惰性加载，导入零副作用）──
let yamlModule = null
let yamlSchema = null
let yamlResolved = false
function loadYamlModule() {
  if (yamlResolved) return yamlModule
  yamlResolved = true
  try {
    yamlModule = createRequire(import.meta.url)('js-yaml')
    return yamlModule
  } catch {
    yamlModule = null
    return null
  }
}

function loadYamlSchema() {
  const yaml = loadYamlModule()
  if (yaml === null) return null
  if (yamlSchema === null) {
    const JsScalar = new yaml.Type('tag:yaml.org,2002:js', {
      kind: 'scalar',
      resolve: (data) => typeof data === 'string',
      construct: (data) => ({ __jsExpr: data }),
      predicate: (data) => data !== null && typeof data === 'object' && typeof data.__jsExpr === 'string',
      represent: (data) => data.__jsExpr,
    })
    yamlSchema = yaml.JSON_SCHEMA.extend(JsScalar)
  }
  return yamlSchema
}

function timestamp() {
  const d = new Date()
  const pad = (n) => String(n).padStart(2, '0')
  return String(d.getFullYear()) + pad(d.getMonth() + 1) + pad(d.getDate()) + pad(d.getHours()) + pad(d.getMinutes()) + pad(d.getSeconds()) + pad(d.getMilliseconds())
}

const OWN_PACKAGE_NAME = 'dsh-extra-plan-qqbot'
const WEB_PACKAGE_NAME = 'dsh-extra-plan'
const QQBOT_BUNDLE_NAME = '@tencent-connect/dsh-qqbot'

function errorText(error) {
  return error instanceof Error ? error.message : String(error)
}

function isMissingError(error) {
  return error !== null && typeof error === 'object' && (error.code === 'ENOENT' || error.code === 'ENOTDIR' || error.code === 'TARGET_MISSING')
}

function ownPackageRoot() {
  return nativeRealpathSync(dirname(dirname(fileURLToPath(import.meta.url))))
}

function isLinkEntity(path, stat) {
  if (stat.isSymbolicLink()) return true
  if (process.platform !== 'win32' || !stat.isDirectory()) return false
  try { return !sameRealPath(nativeRealpathSync(path), path) } catch { return false }
}

function createHostAccess(dshHome, context) {
  const hostContext = context === undefined ? createPathContext({ hostDataRoot: dshHome }) : context
  if (context !== undefined) {
    const expectedRoot = createPathContext({ hostDataRoot: dshHome }).hostDataRoot
    if (hostContext.hostDataRoot === null || !sameRealPath(hostContext.hostDataRoot, expectedRoot)) throw new TypeError('host-root-context-mismatch')
  }
  const rootCandidate = resolveHostPath(hostContext, '.', { purpose: 'qqbot-host-root' })
  const root = validateReadTarget(hostContext, rootCandidate, { expectedType: 'directory' })
  return { context: hostContext, root }
}

function hostPath(access, value, purpose) {
  return resolveHostPath(access.context, value, { purpose })
}

function readHostJson(access, value, purpose) {
  const candidate = hostPath(access, value, purpose)
  const checked = validateReadTarget(access.context, candidate, { expectedType: 'file' })
  return { target: checked, value: JSON.parse(readFileSync(checked.path, 'utf8')) }
}

function safeProfileName(name) {
  if (typeof name !== 'string' || name.length === 0 || name === '.' || name === '..' || name.includes('/') || name.includes('\\') || name.includes(String.fromCharCode(0))) {
    throw new TypeError('invalid-profile-name')
  }
  return name
}

function profilePath(access, profileName, suffix = '') {
  const safeName = safeProfileName(profileName)
  return hostPath(access, join('profiles', safeName, suffix), 'qqbot-profile')
}

function ownPluginEntry(access, profileName) {
  const candidate = assertAllowedPath(access.context, profilePath(access, profileName, join('node_modules', OWN_PACKAGE_NAME)))
  let stat
  try {
    stat = lstatSync(candidate.path)
  } catch (error) {
    if (error?.code === 'ENOENT' || error?.code === 'ENOTDIR') return false
    throw error
  }
  if (isLinkEntity(candidate.path, stat)) {
    try { return sameRealPath(nativeRealpathSync(candidate.path), ownPackageRoot()) } catch { return false }
  }
  if (!stat.isDirectory()) return false
  try {
    const manifest = readHostJson(access, join(candidate.path, 'package.json'), 'qqbot-package-manifest')
    return manifest.value?.name === OWN_PACKAGE_NAME
  } catch {
    return false
  }
}

function contextMember(ctx, key) {
  if (!isObject(ctx)) return undefined
  if (typeof ctx.get === 'function') {
    try {
      const value = ctx.get(key)
      if (value !== undefined) return value
    } catch { /* 缺少可选Host字段按缺失处理 */ }
  }
  return ctx[key]
}

function resolveRootProvider(value) {
  if (typeof value !== 'function') return value
  try { return value() } catch { return undefined }
}

function profileIdentityOf(profile) {
  try {
    const name = profile !== undefined && profile !== null && typeof profile.name === 'string' ? profile.name.trim().toLowerCase() : null
    const startedBundles = profile !== undefined && profile !== null && Array.isArray(profile.startedBundles) && profile.startedBundles.every((item) => typeof item === 'string')
      ? [...profile.startedBundles]
      : null
    if (name === null || startedBundles === null) return { state: 'unknown', kind: 'unknown', name, startedBundles, reason: 'profile-identity-missing' }
    const qqbot = startedBundles.includes(QQBOT_BUNDLE_NAME)
    if (name === 'web' && !qqbot) return { state: 'valid', kind: 'web', name, startedBundles, reason: null }
    if (name === 'qqbot' && qqbot) return { state: 'valid', kind: 'qqbot', name, startedBundles, reason: null }
    if (name !== 'web' && name !== 'qqbot') return { state: 'unknown', kind: 'unknown', name, startedBundles, reason: 'profile-name-unknown' }
    return { state: 'conflict', kind: 'unknown', name, startedBundles, reason: 'profile-identity-conflict' }
  } catch (error) {
    return { state: 'unknown', kind: 'unknown', name: null, startedBundles: null, reason: 'profile-identity-unreadable' }
  }
}

export function resolveQqbotHostRoot(ctx) {
  const sources = []
  const profileContext = contextMember(ctx, 'profileContext')
  const identity = profileIdentityOf(profileContext)
  const profileFacts = {
    profileName: identity.name,
    startedBundles: identity.startedBundles,
    profileKind: identity.kind,
    profileIdentityState: identity.state,
    profileIdentityReason: identity.reason,
  }
  if (isObject(profileContext) && Object.prototype.hasOwnProperty.call(profileContext, 'home') && profileContext.home !== undefined) {
    sources.push({ name: 'profileContext.home', value: profileContext.home })
  }
  let dshHomePath = contextMember(ctx, 'dshHomePath')
  if (dshHomePath === undefined && isObject(ctx)) dshHomePath = ctx.dshHomePath
  dshHomePath = resolveRootProvider(dshHomePath)
  if (dshHomePath !== undefined) sources.push({ name: 'dshHomePath()', value: dshHomePath })
  if (sources.length === 0) return { ...profileFacts, root: null, reason: 'host-root-required' }
  const normalized = []
  for (const source of sources) {
    try {
      normalized.push({ name: source.name, value: createPathContext({ hostDataRoot: source.value }).hostDataRoot })
    } catch (error) {
      return { ...profileFacts, root: null, reason: 'host-root-invalid', source: source.name, detail: errorText(error) }
    }
  }
  for (const item of normalized.slice(1)) {
    if (!sameRealPath(item.value, normalized[0].value)) {
      return { ...profileFacts, root: null, reason: 'host-root-conflict', sources: normalized.map((entry) => entry.name) }
    }
  }
  return { ...profileFacts, root: normalized[0].value, source: normalized.map((entry) => entry.name).join('+') }
}

// ── 旧版错误块：只迁移根级完整生成条目，静态 insert 由 cordis.patch.yml 唯一提供 ──
// 静态包族由静态回归覆盖；严格环境命中时由环境脚本执行只读核验；
// QQBot 消息、/preset、question/approval 与 postinstall 仍属部署后 HUMAN。
const LEGACY_ROOT_ENTRIES = [
  {
    id: 'ptc-runtime',
    name: '@deepseek-ai/dsh-ptc-runtime-node',
  },
  {
    id: 'agent-preset-registry',
    name: '@deepseek-ai/dsh-agent-preset-registry',
    default: 'extra-plan',
  },
  {
    id: 'code-runtime',
    name: '@deepseek-ai/dsh-code-runtime-worker-thread',
  },
  {
    id: 'agent-presets',
    name: '@deepseek-ai/dsh-agent-presets',
    default: 'standard',
  },
]

function isObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function stripBom(line) {
  return line.startsWith('\uFEFF') ? line.slice(1) : line
}

function lineIndent(line) {
  return (line.match(/^[ \t]*/) || [''])[0].length
}

function isIgnorableLine(line) {
  const trimmed = line.trim()
  return trimmed.length === 0 || trimmed.startsWith('#')
}



function parseEntryBlock(blockLines) {
  const yaml = loadYamlModule()
  if (yaml === null) return { status: 'yaml-unavailable', entry: null }
  try {
    const parsed = yaml.load(blockLines.join('\n'), { schema: loadYamlSchema() })
    if (Array.isArray(parsed) && parsed.length === 1 && isObject(parsed[0])) return { status: 'parsed', entry: parsed[0] }
  } catch { return { status: 'parse-failed', entry: null } }
  return { status: 'parse-failed', entry: null }
}

function legacyEntryKind(entry) {
  if (!isObject(entry)) return null
  for (const legacy of LEGACY_ROOT_ENTRIES) {
    if (entry.id !== legacy.id || entry.name !== legacy.name) continue
    if (legacy.default !== undefined) {
      if (!isObject(entry.config) || entry.config.default !== legacy.default) continue
    }
    return legacy.id
  }
  return null
}

function rootSequenceIndent(lines) {
  for (const line of lines) {
    const normalized = stripBom(line)
    if (isIgnorableLine(normalized)) continue
    const trimmed = normalized.trim()
    if (trimmed === '---' || trimmed.startsWith('%')) continue
    const match = /^([ \t]*)-\s+/.exec(normalized)
    return match === null ? null : match[1].length
  }
  return null
}

function isRootSequenceLine(line, rootIndent) {
  const normalized = stripBom(line)
  const match = /^([ \t]*)-\s+/.exec(normalized)
  return match !== null && match[1].length === rootIndent
}

function scanRootBlocks(content) {
  const lines = content.split(/\r?\n/)
  const rootIndent = rootSequenceIndent(lines)
  if (rootIndent === null) return { lines, rootIndent, blocks: [] }
  const starts = []
  for (let i = 0; i < lines.length; i += 1) {
    if (isRootSequenceLine(lines[i], rootIndent)) starts.push(i)
  }
  const blocks = []
  for (let i = 0; i < starts.length; i += 1) {
    const start = starts[i]
    let end = lines.length
    for (let j = start + 1; j < lines.length; j += 1) {
      if (isRootSequenceLine(lines[j], rootIndent)) {
        end = j
        break
      }
      // 未缩进的非注释行不是当前条目的一部分，保留给写后 YAML 校验发现。
      if (!isIgnorableLine(lines[j]) && lineIndent(stripBom(lines[j])) <= rootIndent) {
        end = j
        break
      }
    }
    blocks.push({ start, end, kind: null })
  }
  return { lines, rootIndent, blocks }
}

function findLegacyRootBlocks(content) {
  const scan = scanRootBlocks(content)
  const legacyBlocks = []
  let parseIssue = null
  for (const block of scan.blocks) {
    const blockLines = scan.lines.slice(block.start, block.end)
    const parsed = parseEntryBlock(blockLines)
    if (parsed.status !== 'parsed') {
      parseIssue = parseIssue === null ? parsed.status : parseIssue
      continue
    }
    const kind = legacyEntryKind(parsed.entry)
    if (kind !== null) legacyBlocks.push({ ...block, kind })
  }
  return { ...scan, blocks: legacyBlocks, parseIssue }
}

function removeLegacyRootBlocks(content, migration) {
  const removed = new Set()
  for (const block of migration.blocks) {
    for (let i = block.start; i < block.end; i += 1) {
      const normalized = stripBom(migration.lines[i])
      const trimmed = normalized.trim()
      if (trimmed.length === 0) continue
      if (trimmed.startsWith('#') && lineIndent(normalized) <= migration.rootIndent) continue
      removed.add(i)
    }
  }
  const eol = content.includes('\r\n') ? '\r\n' : '\n'
  const kept = migration.lines.filter((_line, index) => !removed.has(index))
  const hasMeaningful = kept.some((line) => !isIgnorableLine(line))
  if (hasMeaningful) return kept.join(eol)
  const firstRemoved = Math.min(...removed)
  const output = []
  for (let index = 0; index < migration.lines.length; index += 1) {
    if (index === firstRemoved) output.push('[]')
    if (!removed.has(index)) output.push(migration.lines[index])
  }
  return output.join(eol)
}

function verifyMigratedPatch(content) {
  const yaml = loadYamlModule()
  if (yaml === null) return false
  try {
    const parsed = yaml.load(content, { schema: loadYamlSchema() })
    if (!Array.isArray(parsed)) return false
    return !parsed.some((entry) => legacyEntryKind(entry))
  } catch {
    return false
  }
}


/**
 * 只迁移旧版自愈生成的根级完整块：
 * - ptc-runtime 的 name 必须是 dsh-ptc-runtime-node；
 * - agent-preset-registry 的 name 必须匹配且 config.default 必须为 extra-plan；
 * - code-runtime / agent-presets 只按其根级形状匹配（config.default 分别为未声明与 standard）；
 * - 嵌套 insert、im-qqbot 及其他用户条目原样保留。
 * 实际迁移前备份，写后验证顶层 YAML 数组和旧块消失，失败恢复原文；无旧块零写入零备份。
 */
export function healPatchRows(profileDir, options = {}) {
  const context = isObject(options) ? options.context : undefined
  if (context === undefined) return { status: 'skipped', reason: 'host-root-required' }
  let profile
  let patchTarget
  try {
    profile = validateReadTarget(context, resolveHostPath(context, profileDir, { purpose: 'qqbot-profile' }), { expectedType: 'directory' })
    patchTarget = resolveHostPath(context, join(profile.path, 'cordis.patch.yml'), { purpose: 'qqbot-patch' })
  } catch (error) {
    console.warn(LOG_PREFIX + ' profile 根校验失败，跳过迁移:', errorText(error))
    return { status: 'skipped', reason: 'path-invalid', error: errorText(error) }
  }
  let checkedPatch
  try {
    checkedPatch = validateReadTarget(context, patchTarget, { expectedType: 'file' })
  } catch (error) {
    if (isMissingError(error)) return { status: 'skipped', reason: 'no-file' }
    console.warn(LOG_PREFIX + ' 读取 ' + patchTarget.path + ' 失败，跳过迁移:', errorText(error))
    return { status: 'skipped', reason: 'read-failed', error: errorText(error) }
  }
  let content
  try {
    content = readFileSync(checkedPatch.path, 'utf8')
  } catch (error) {
    console.warn(LOG_PREFIX + ' 读取 ' + checkedPatch.path + ' 失败，跳过迁移:', errorText(error))
    return { status: 'skipped', reason: 'read-failed' }
  }
  const migration = findLegacyRootBlocks(content)
  if (migration.parseIssue !== null) {
    console.warn(LOG_PREFIX + ' 解析 patch 失败，跳过迁移：' + migration.parseIssue)
    return { status: 'skipped', reason: migration.parseIssue }
  }
  if (migration.blocks.length === 0) return { status: 'idempotent' }
  const merged = removeLegacyRootBlocks(content, migration)
  if (merged === content) return { status: 'idempotent' }
  let writeTarget
  let backupTarget
  const backupFile = checkedPatch.path + '.bak-' + timestamp()
  try {
    writeTarget = prepareWriteTarget(context, checkedPatch, { expectedType: 'file' })
    backupTarget = prepareWriteTarget(context, resolveHostPath(context, backupFile, { purpose: 'qqbot-patch-backup' }), { expectedType: 'file' })
    if (backupTarget.exists) return { status: 'failed', reason: 'backup-exists', backup: backupFile }
  } catch (error) {
    console.warn(LOG_PREFIX + ' 写入目标校验失败，跳过迁移:', errorText(error))
    return { status: 'failed', reason: 'write-target-invalid', error: errorText(error) }
  }
  if (options.dryRun === true) return { status: 'ready', backup: backupFile, migrated: migration.blocks.map((block) => block.kind) }
  try {
    copyFileSync(writeTarget.path, backupTarget.path)
  } catch (error) {
    console.warn(LOG_PREFIX + ' 备份失败，跳过迁移:', errorText(error))
    return { status: 'failed', reason: 'backup-failed' }
  }
  try {
    writeFileSync(writeTarget.path, merged, 'utf8')
  } catch (error) {
    try { copyFileSync(backupTarget.path, writeTarget.path) } catch { /* 保留原始错误 */ }
    console.warn(LOG_PREFIX + ' 迁移失败（已尝试用备份恢复，请核对备份）:', errorText(error))
    return { status: 'failed', reason: 'write-failed', backup: backupTarget.path }
  }
  let verified = false
  try { verified = verifyMigratedPatch(merged) } catch { /* 将校验器异常视为校验失败 */ }
  if (!verified) {
    try { copyFileSync(backupTarget.path, writeTarget.path) } catch { /* 保留原始错误 */ }
    console.warn(LOG_PREFIX + ' 迁移后校验失败，已尝试用备份恢复，请核对备份: ' + writeTarget.path)
    return { status: 'failed', reason: 'verify-failed', backup: backupTarget.path }
  }
  const migrated = migration.blocks.map((block) => block.kind)
  console.log(LOG_PREFIX + ' 已迁移旧版根级块 ' + migrated.join('/') + ' → ' + writeTarget.path)
  return { status: 'migrated', backup: backupTarget.path, migrated }
}

/**
 * 扫描 $DSH_HOME/profiles/*，锚定「安装了本插件的 qqbot profile」：
 * ① package.json 可读且 dsh.profile.bundles 含 '@tencent-connect/dsh-qqbot'；
 * ② node_modules/dsh-extra-plan-qqbot 目录存在（本插件已装）。
 * 任一不满足 → 跳过；只处理所选Host根内标准位置，根外副本/未装插件的 profile 天然排除。
 */
export function findOwnQqbotProfiles(dshHome, options = {}) {
  const MAX_PROFILE_CANDIDATES = 128
  const out = []
  const diagnostics = []
  const requested = isObject(options) ? options.profileNames : undefined
  const finish = (profiles, meta = {}) => {
    const details = meta.diagnostics === undefined ? diagnostics : meta.diagnostics
    Object.defineProperties(profiles, {
      diagnostics: { value: details, enumerable: false },
      status: { value: meta.status === undefined ? (profiles.length === 0 ? 'not-installed' : 'installed') : meta.status, enumerable: false },
      reason: { value: meta.reason, enumerable: false },
      error: { value: meta.error === undefined ? meta.reason : meta.error, enumerable: false },
      candidateCount: { value: meta.candidateCount, enumerable: false },
      candidateLimit: { value: MAX_PROFILE_CANDIDATES, enumerable: false },
    })
    return profiles
  }
  if (requested !== undefined) {
    if (!Array.isArray(requested) || requested.some((name) => typeof name !== 'string')) {
      return finish([], { status: 'unavailable', reason: 'invalid-profileNames', diagnostics: [{ reason: 'invalid-profileNames' }] })
    }
    try {
      requested.forEach((name) => safeProfileName(name))
    } catch (error) {
      return finish([], { status: 'unavailable', reason: errorText(error), diagnostics: [{ reason: errorText(error) }] })
    }
  }
  let access
  try {
    access = createHostAccess(dshHome, isObject(options) ? options.context : undefined)
  } catch (error) {
    return finish([], { status: 'unavailable', reason: 'host-root-unavailable', diagnostics: [{ reason: 'host-root-unavailable', detail: errorText(error) }] })
  }
  let profilesRoot
  try {
    profilesRoot = validateReadTarget(access.context, hostPath(access, 'profiles', 'qqbot-profiles'), { expectedType: 'directory' })
  } catch (error) {
    return finish([], { status: 'unavailable', reason: 'profiles-root-unavailable', diagnostics: [{ reason: 'profiles-root-unavailable', detail: errorText(error) }] })
  }
  let names
  if (requested !== undefined) {
    names = [...new Set(requested)]
  } else {
    try {
      names = readdirSync(profilesRoot.path).sort()
    } catch (error) {
      return finish([], { status: 'unavailable', reason: 'profiles-root-read-failed', diagnostics: [{ reason: 'profiles-root-read-failed', detail: errorText(error) }] })
    }
    if (names.length > MAX_PROFILE_CANDIDATES) {
      const diagnostic = { reason: 'candidate-limit-exceeded', candidateCount: names.length, candidateLimit: MAX_PROFILE_CANDIDATES }
      return finish([], { status: 'unavailable', reason: diagnostic.reason, candidateCount: names.length, diagnostics: [diagnostic] })
    }
  }
  for (const name of names) {
    try {
      const profile = validateReadTarget(access.context, profilePath(access, name), { expectedType: 'directory' })
      const pkg = readHostJson(access, join(profile.path, 'package.json'), 'qqbot-profile-manifest').value
      const bundles = pkg && pkg.dsh && pkg.dsh.profile && Array.isArray(pkg.dsh.profile.bundles)
        ? pkg.dsh.profile.bundles : []
      if (!bundles.includes(QQBOT_BUNDLE_NAME)) {
        diagnostics.push({ profile: name, reason: 'bundle-anchor-missing' })
        continue
      }
      if (!ownPluginEntry(access, name)) {
        diagnostics.push({ profile: name, reason: 'plugin-anchor-missing' })
        continue
      }
      out.push(name)
    } catch (error) {
      diagnostics.push({ profile: name, reason: 'profile-read-failed', detail: errorText(error) })
    }
  }
  return finish(out, { candidateCount: names.length })
}

/**
 * 建链与旧块迁移职责分离。web 缺失 → warn 跳过；已正确链接 → 不动；
 * 非目标链接/实体目录 → 保留并提示 pnpm 迁移；
 * 仅 ENOENT → mkdirSync(node_modules) + symlinkSync(webPkg, target, win32 ? junction : dir)；
 * 全程 try/catch 只记录日志不阻断；目标用绝对路径 webPkg（Windows junction 支持跨盘符）。
 */
export function ensureDshExtraPlanLink(dshHome, profileName, options = {}) {
  try {
    const access = createHostAccess(dshHome, isObject(options) ? options.context : undefined)
    const profile = validateReadTarget(access.context, profilePath(access, profileName), { expectedType: 'directory' })
    if (!ownPluginEntry(access, profileName)) return { status: 'skipped', reason: 'not-own-profile' }
    const webCandidate = hostPath(access, join('profiles', 'web', 'node_modules', WEB_PACKAGE_NAME), 'qqbot-web-source')
    let webChecked
    try {
      webChecked = validateReadTarget(access.context, webCandidate, { expectedType: 'directory' })
    } catch (error) {
      if (isMissingError(error)) {
        console.warn(LOG_PREFIX + ' 未找到 web 的 ' + WEB_PACKAGE_NAME + '，跳过映射')
        return { status: 'skipped', reason: 'web-missing' }
      }
      throw error
    }
    const webManifest = readHostJson(access, join(webChecked.path, 'package.json'), 'qqbot-web-manifest').value
    if (webManifest?.name !== WEB_PACKAGE_NAME) return { status: 'skipped', reason: 'web-not-own-package' }
    const target = hostPath(access, join(profile.path, 'node_modules', WEB_PACKAGE_NAME), 'qqbot-profile-link')
    let targetStat = null
    try {
      targetStat = lstatSync(target.path)
    } catch (error) {
      if (error?.code !== 'ENOENT' && error?.code !== 'ENOTDIR') throw error
    }
    if (targetStat !== null) {
      if (isLinkEntity(target.path, targetStat)) {
        try {
          if (sameRealPath(nativeRealpathSync(target.path), webChecked.realPath)) return { status: 'up-to-date' }
        } catch { /* 外部或失效链接只保留，不跟随写入 */ }
        console.warn(LOG_PREFIX + ' ' + profileName + ' 目标已存在非目标链接，保留原状；请通过 pnpm 完成迁移后重试')
        return { status: 'kept', reason: 'other-link' }
      }
      try { validateReadTarget(access.context, target, { expectedType: 'any' }) } catch (error) {
        return { status: 'kept', reason: 'entity-unverified', error: errorText(error) }
      }
      console.warn(LOG_PREFIX + ' ' + profileName + ' 目标已存在实体对象，保留原状；请通过 pnpm 完成迁移后重试')
      return { status: 'kept', reason: 'entity' }
    }
    const writeTarget = prepareWriteTarget(access.context, target, { expectedType: 'any' })
    if (options.dryRun === true) return { status: 'planned' }
    mkdirSync(writeTarget.parentPath, { recursive: true })
    symlinkSync(webChecked.path, writeTarget.path, process.platform === 'win32' ? 'junction' : 'dir')
    try {
      const finalStat = lstatSync(writeTarget.path)
      const finalRealPath = nativeRealpathSync(writeTarget.path)
      if (!isLinkEntity(writeTarget.path, finalStat) || !sameRealPath(finalRealPath, webChecked.realPath)) throw new Error('link-verification-failed')
    } catch (error) {
      try { unlinkSync(writeTarget.path) } catch { /* 仅清理本次创建失败的映射 */ }
      return { status: 'failed', reason: 'link-verification-failed', error: errorText(error) }
    }
    console.log(LOG_PREFIX + ' 已建立映射: ' + profileName + ' → web')
    return { status: 'linked' }
  } catch (error) {
    console.error(LOG_PREFIX + ' 映射建立失败:', errorText(error))
    return { status: 'failed', error: errorText(error) }
  }
}

/**
 * 对 findOwnQqbotProfiles 命中的每个 profile 先迁移旧块再 ensureDshExtraPlanLink；
 * options.profileNames 只传递精确目录，不先扫描全量候选；整体 try/catch 仍不阻断插件加载与 DSH 启动。
 */
export function healQqbotCompatibility(dshHome, options) {
  try {
    if (options !== undefined && !isObject(options)) {
      return { profiles: [], count: 0, results: [], failed: [], error: 'invalid-options' }
    }
    const requested = options === undefined ? undefined : options.profileNames
    if (requested !== undefined && (!Array.isArray(requested) || requested.some((name) => typeof name !== 'string'))) {
      return { profiles: [], count: 0, results: [], failed: [], error: 'invalid-profileNames' }
    }
    if (requested !== undefined) {
      try { requested.forEach((name) => safeProfileName(name)) } catch (error) {
        return { profiles: [], count: 0, results: [], failed: [], error: errorText(error) }
      }
    }
    const context = isObject(options) ? options.context : undefined
    const access = createHostAccess(dshHome, context)
    const discoveryOptions = { context: access.context }
    if (requested !== undefined) discoveryOptions.profileNames = requested
    const discovered = findOwnQqbotProfiles(dshHome, discoveryOptions)
    const discoveryDiagnostics = Array.isArray(discovered.diagnostics) ? discovered.diagnostics : []
    if (discovered.status === 'unavailable') {
      return {
        profiles: [],
        count: 0,
        results: [],
        failed: [],
        error: discovered.reason || 'profile-discovery-failed',
        diagnostics: discoveryDiagnostics,
        candidateCount: discovered.candidateCount,
        candidateLimit: discovered.candidateLimit,
      }
    }
    const profiles = [...discovered]
    const results = []
    const failed = []
    const dryRun = isObject(options) && options.dryRun === true
    for (const profileName of profiles) {
      const profileDir = profilePath(access, profileName).path
      const patch = healPatchRows(profileDir, { context: access.context, dryRun })
      const link = ensureDshExtraPlanLink(dshHome, profileName, { context: access.context, dryRun })
      const summary = { profile: profileName, patch, link }
      results.push(summary)
      if (patch.status === 'failed' || patch.reason === 'read-failed' || patch.reason === 'path-invalid' || link.status === 'failed') failed.push(summary)
    }
    return {
      profiles,
      count: profiles.length,
      results,
      failed,
      diagnostics: discoveryDiagnostics,
      candidateCount: discovered.candidateCount,
      candidateLimit: discovered.candidateLimit,
    }
  } catch (error) {
    const message = errorText(error)
    console.warn(LOG_PREFIX + ' 自愈遍历异常（不阻断）:', message)
    return { profiles: [], count: 0, results: [], failed: [], error: message, errorCode: error?.code }
  }
}
