import * as fs from 'node:fs'
import * as path from 'node:path'

const nativePath = process.platform === 'win32' ? path.win32 : path.posix
const isWindows = process.platform === 'win32'
const OTHER = 'other'
const KINDS = new Set(['workspace', 'host'])
const CAPABILITY_TYPES = new Set(['file', 'directory'])
const realpathSync = typeof fs.realpathSync.native === 'function' ? fs.realpathSync.native : fs.realpathSync
const INTERNAL_PURPOSE = Symbol('path-policy-purpose')
const targetMetadata = new WeakMap()

function policyError(code, message, details = {}) {
  const error = new TypeError('[path-policy:' + code + '] ' + message)
  error.code = code
  error.details = Object.freeze({ ...details })
  return error
}

function isObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function isOther(value) {
  return typeof value === 'string' && value.toLowerCase() === OTHER
}

function rejectOther(value, label) {
  if (!isObject(value)) return
  for (const key of ['kind', 'scope', 'source', 'category', 'purpose']) {
    if (isOther(value[key])) throw policyError('OTHER_REJECTED', label + '.' + key + ' 使用保留类别 Other')
  }
}

function rejectOtherOptions(options, label) {
  rejectOther(options, label)
  if (isObject(options) && isOther(options.capability)) {
    throw policyError('OTHER_REJECTED', label + '.capability 使用保留类别 Other')
  }
}

function isFullyQualifiedAbsolute(value) {
  if (isWindows) return /^[A-Za-z]:[\\/]/.test(value) || /^\\\\/.test(value)
  return value.startsWith('/')
}

function rejectVariable(value, label) {
  if (/(?:%[A-Za-z_][A-Za-z0-9_]*%)/.test(value)) {
    throw policyError('VARIABLE_PATH', label + ' 拒绝环境变量字面量')
  }
  if (/(?:^|[\\/])\$(?:\{[A-Za-z_][A-Za-z0-9_]*\}|[A-Za-z_][A-Za-z0-9_]*)/.test(value)) {
    throw policyError('VARIABLE_PATH', label + ' 拒绝环境变量字面量')
  }
  if (/(?:^|[\\/])~(?:[\\/]|$)/.test(value) || value.startsWith('~')) {
    throw policyError('VARIABLE_PATH', label + ' 拒绝家目录缩写')
  }
}

function lexicalPath(value, label) {
  if (typeof value !== 'string') throw policyError('PATH_TYPE', label + ' 必须是字符串')
  if (value.length === 0 || value.trim() === '') throw policyError('EMPTY_PATH', label + ' 不能为空')
  if (value.includes(String.fromCharCode(0))) throw policyError('NUL_PATH', label + ' 含 NUL')
  rejectVariable(value, label)
  const driveRelative = /^[A-Za-z]:[^\\/]/.test(value)
  if (driveRelative) throw policyError('DRIVE_RELATIVE', label + ' 拒绝 drive-relative 路径')
  const protocol = /^[A-Za-z][A-Za-z0-9+.-]*:/.test(value)
  const driveAbsolute = /^[A-Za-z]:[\\/]/.test(value)
  if (protocol && !driveAbsolute) throw policyError('INVALID_URI', label + ' 拒绝URI/协议路径')
  if (nativePath.isAbsolute(value) && !isFullyQualifiedAbsolute(value)) {
    throw policyError('AMBIGUOUS_ABSOLUTE', label + ' 不是明确的绝对路径')
  }
  return value
}

function rootPath(value, label) {
  if (value === undefined || value === null) throw policyError('ROOT_REQUIRED', label + ' 必须明确提供')
  const lexical = lexicalPath(value, label)
  if (!isFullyQualifiedAbsolute(lexical) || !nativePath.isAbsolute(lexical)) {
    throw policyError('ROOT_REQUIRED', label + ' 必须是明确的绝对根')
  }
  return nativePath.normalize(lexical)
}

function keyOf(value) {
  const normalized = nativePath.normalize(value)
  return isWindows ? normalized.toLowerCase() : normalized
}

function samePath(left, right) {
  return keyOf(left) === keyOf(right)
}

function isWithin(root, candidate) {
  const rootKey = keyOf(root)
  const candidateKey = keyOf(candidate)
  if (rootKey === candidateKey) return true
  const relative = nativePath.relative(rootKey, candidateKey)
  return relative !== '' && relative !== '..' && !relative.startsWith('..' + nativePath.sep) && !nativePath.isAbsolute(relative)
}

function assertLexicalWithin(root, candidate, label) {
  if (!isWithin(root, candidate)) {
    throw policyError('ROOT_ESCAPE', label + ' 超出授权根', { root, candidate })
  }
}

function readOnlyCapabilityForLogicalPath(context, candidate) {
  for (const descriptor of Object.values(context.hostCapabilities)) {
    if (descriptor.access !== 'read') continue
    const protectedPath = descriptor.path
    if (descriptor.type === 'file' ? samePath(protectedPath, candidate) : isWithin(protectedPath, candidate)) return descriptor
  }
  return null
}

function readOnlyCapabilityForRealPath(context, candidate) {
  if (candidate === null || candidate === undefined) return null
  for (const descriptor of Object.values(context.hostCapabilities)) {
    if (descriptor.access !== 'read') continue
    let protectedRealPath
    try { protectedRealPath = realpathSync(descriptor.path) } catch { continue }
    if (descriptor.type === 'file' ? samePath(protectedRealPath, candidate) : isWithin(protectedRealPath, candidate)) return descriptor
  }
  return null
}

function rejectReadOnlyCapability(descriptor) {
  if (descriptor !== null) throw policyError('HOST_RESOURCE_READONLY', 'Host代码/资源能力只读', { capability: descriptor.name })
}

function purposeOf(options, fallback) {
  const purpose = options === undefined || options.purpose === undefined ? fallback : options.purpose
  if (typeof purpose !== 'string' || purpose.trim() === '') throw policyError('PURPOSE_REQUIRED', '用途必须是非空字符串')
  if (isOther(purpose)) throw policyError('OTHER_REJECTED', '用途使用保留类别 Other')
  if (purpose.includes(String.fromCharCode(0))) throw policyError('PURPOSE_INVALID', '用途含 NUL')
  return purpose
}

function capabilityName(value) {
  if (value === undefined || value === null) return null
  if (typeof value !== 'string' || value.trim() === '') throw policyError('CAPABILITY_INVALID', 'Host capability 必须是非空名称')
  if (isOther(value)) throw policyError('OTHER_REJECTED', 'Host capability 使用保留类别 Other')
  if (value.includes(String.fromCharCode(0))) throw policyError('CAPABILITY_INVALID', 'Host capability 含 NUL')
  return value
}

function normalizeCapabilities(value) {
  if (value === undefined || value === null) return Object.freeze(Object.create(null))
  const entries = Array.isArray(value)
    ? value.map((item) => {
        if (!isObject(item) || typeof item.name !== 'string') throw policyError('CAPABILITY_INVALID', 'Host capability 列表项必须含 name')
        return [item.name, item]
      })
    : Object.entries(value)
  const out = Object.create(null)
  for (const [name, raw] of entries) {
    capabilityName(name)
    if (Object.prototype.hasOwnProperty.call(out, name)) throw policyError('CAPABILITY_DUPLICATE', 'Host capability 重复: ' + name)
    const descriptor = typeof raw === 'string' ? { path: raw, type: 'file' } : raw
    if (!isObject(descriptor)) throw policyError('CAPABILITY_INVALID', 'Host capability ' + name + ' 必须是描述对象')
    const type = descriptor.type === undefined ? 'file' : descriptor.type
    if (!CAPABILITY_TYPES.has(type)) throw policyError('CAPABILITY_INVALID', 'Host capability ' + name + ' type 无效')
    const access = descriptor.access === undefined ? 'read' : descriptor.access
    if (access !== 'read' && access !== 'write') throw policyError('CAPABILITY_INVALID', 'Host capability ' + name + ' access 无效')
    const capabilityPath = rootPath(descriptor.path, 'hostCapabilities.' + name + '.path')
    const purpose = descriptor.purpose === undefined ? null : purposeOf(descriptor, name)
    out[name] = Object.freeze({ name, path: capabilityPath, type, purpose, access })
  }
  return Object.freeze(out)
}

export function createPathContext(options = {}) {
  if (!isObject(options)) throw policyError('CONTEXT_TYPE', 'createPathContext 参数必须是对象')
  rejectOtherOptions(options, 'context')
  const workspaceRoot = options.workspaceRoot === undefined || options.workspaceRoot === null
    ? null
    : rootPath(options.workspaceRoot, 'workspaceRoot')
  const hostDataRoot = options.hostDataRoot === undefined || options.hostDataRoot === null
    ? null
    : rootPath(options.hostDataRoot, 'hostDataRoot')
  const hostCapabilities = normalizeCapabilities(options.hostCapabilities)
  if (workspaceRoot === null && hostDataRoot === null && Object.keys(hostCapabilities).length === 0) {
    throw policyError('ROOT_REQUIRED', '至少需要明确的 workspaceRoot、hostDataRoot 或 Host capability')
  }
  return Object.freeze({
    workspaceRoot,
    hostDataRoot,
    hostCapabilities,
  })
}

function ensureContext(context) {
  if (!isObject(context)) throw policyError('CONTEXT_TYPE', '路径上下文必须是 createPathContext 返回的对象')
  if (context.workspaceRoot !== null && context.workspaceRoot !== undefined) rootPath(context.workspaceRoot, 'context.workspaceRoot')
  if (context.hostDataRoot !== null && context.hostDataRoot !== undefined) rootPath(context.hostDataRoot, 'context.hostDataRoot')
  if (!isObject(context.hostCapabilities)) throw policyError('CAPABILITY_INVALID', '上下文 hostCapabilities 无效')
  if (context.workspaceRoot === null && context.hostDataRoot === null && Object.keys(context.hostCapabilities).length === 0) {
    throw policyError('ROOT_REQUIRED', '至少需要明确的 workspaceRoot、hostDataRoot 或 Host capability')
  }
  return context
}

function capabilityOf(context, name) {
  const capability = capabilityName(name)
  if (capability === null) return null
  const descriptor = context.hostCapabilities[capability]
  if (descriptor === undefined) throw policyError('CAPABILITY_UNKNOWN', '未注册的 Host capability: ' + capability)
  return descriptor
}

function relativeInput(base, value, label) {
  const lexical = lexicalPath(value, label)
  const absolute = isFullyQualifiedAbsolute(lexical)
  if (absolute) return nativePath.normalize(lexical)
  if (nativePath.isAbsolute(lexical)) throw policyError('AMBIGUOUS_ABSOLUTE', label + ' 不是明确的绝对路径')
  return nativePath.normalize(nativePath.resolve(base, lexical))
}

function makeTarget(context, kind, input, options = {}) {
  rejectOtherOptions(options, 'path options')
  if (!KINDS.has(kind)) throw policyError('KIND_INVALID', '路径类别必须是 workspace 或 host')
  const capability = kind === 'host' ? capabilityOf(context, options.capability) : null
  if (kind === 'workspace' && options.capability !== undefined && options.capability !== null) {
    throw policyError('CAPABILITY_INVALID', 'workspace 路径不能使用 Host capability')
  }
  let root
  let exactPath = null
  if (capability !== null) {
    root = capability.type === 'file' ? nativePath.dirname(capability.path) : capability.path
    exactPath = capability.type === 'file' ? capability.path : null
    if (input === undefined || input === null || input === '') {
      input = capability.path
    }
  } else {
    root = kind === 'workspace' ? context.workspaceRoot : context.hostDataRoot
    if (root === null || root === undefined) {
      throw policyError('ROOT_REQUIRED', kind === 'workspace' ? '缺少明确的 workspaceRoot' : '缺少明确的 hostDataRoot')
    }
    if (input === undefined || input === null) throw policyError('PATH_REQUIRED', '路径值不能为空')
  }
  const purposeExplicit = options[INTERNAL_PURPOSE] === undefined
    ? options.purpose !== undefined && typeof options.purpose === 'string' && options.purpose.trim() !== ''
    : options[INTERNAL_PURPOSE] === true
  const purpose = purposeOf(options, capability === null || capability.purpose === null ? kind : capability.purpose)
  if (capability !== null && capability.purpose !== null && purpose !== capability.purpose) {
    throw policyError('PURPOSE_MISMATCH', '用途与 Host capability 不匹配', { expected: capability.purpose, actual: purpose })
  }
  const candidate = relativeInput(root, input, kind + ' path')
  assertLexicalWithin(root, candidate, kind + ' path')
  if (exactPath !== null && !samePath(candidate, exactPath)) {
    throw policyError('CAPABILITY_ESCAPE', '精确 Host 文件 capability 不允许扩展为目录')
  }
  const target = {
    kind,
    scope: kind,
    path: candidate,
    root,
    relativePath: nativePath.relative(root, candidate),
    purpose,
    purposeExplicit,
    access: capability === null ? (kind === 'host' ? 'data' : 'write') : capability.access,
    capability: capability === null ? null : capability.name,
    exactPath,
  }
  targetMetadata.set(target, { purposeExplicit })
  return Object.freeze(target)
}

export function resolveWorkspacePath(context, value, options = {}) {
  ensureContext(context)
  rejectOtherOptions(options, 'workspace options')
  return makeTarget(context, 'workspace', value, options)
}

export function resolveHostPath(context, value, options = {}) {
  ensureContext(context)
  rejectOtherOptions(options, 'host options')
  return makeTarget(context, 'host', value, options)
}

function targetInput(context, candidate, options = {}) {
  rejectOther(candidate, 'target')
  rejectOtherOptions(options, 'target options')
  let kind = options.kind
  let value = candidate
  let capability = options.capability
  let purpose = options.purpose
  let purposeExplicit = typeof purpose === 'string' && purpose.trim() !== ''
  let candidateMetadata = null
  if (isObject(candidate)) {
    candidateMetadata = targetMetadata.get(candidate) || null
    kind = candidate.kind === undefined ? kind : candidate.kind
    value = candidate.path
    capability = candidate.capability === undefined ? capability : candidate.capability
    purpose = candidate.purpose === undefined ? purpose : candidate.purpose
    if (candidateMetadata !== null) purposeExplicit = candidateMetadata.purposeExplicit === true
    else purposeExplicit = typeof purpose === 'string' && purpose.trim() !== ''
  }
  if (typeof kind !== 'string' || !KINDS.has(kind)) throw policyError('KIND_REQUIRED', '必须显式指定 workspace 或 host 类别')
  const pathOptions = { ...options, capability, purpose, [INTERNAL_PURPOSE]: purposeExplicit, kind: undefined }
  delete pathOptions.kind
  return kind === 'workspace'
    ? resolveWorkspacePath(context, value, pathOptions)
    : resolveHostPath(context, value, pathOptions)
}

export function assertAllowedPath(context, candidate, options = {}) {
  ensureContext(context)
  const target = targetInput(context, candidate, options)
  const allowed = Object.freeze({ ...target, allowed: true })
  const metadata = targetMetadata.get(target)
  if (metadata !== undefined) targetMetadata.set(allowed, metadata)
  return allowed
}

function isMissing(error) {
  return error !== null && typeof error === 'object' && (error.code === 'ENOENT' || error.code === 'ENOTDIR')
}

function sameOrChildReal(root, candidate, label) {
  if (!isWithin(root, candidate)) throw policyError('REALPATH_ESCAPE', label + ' 的真实路径越界', { rootRealPath: root, realPath: candidate })
}

function physicalRoot(target, operation) {
  let rootRealPath
  try {
    rootRealPath = realpathSync(target.root)
  } catch (error) {
    throw policyError('ROOT_UNAVAILABLE', operation + ' 授权根不可解析', { root: target.root, cause: error.code || String(error) })
  }
  let rootStat
  try {
    rootStat = fs.statSync(rootRealPath)
  } catch (error) {
    throw policyError('ROOT_UNAVAILABLE', operation + ' 授权根不可读取', { root: target.root, cause: error.code || String(error) })
  }
  if (!rootStat.isDirectory()) throw policyError('ROOT_NOT_DIRECTORY', operation + ' 授权根不是目录', { root: target.root })
  return rootRealPath
}

function inspectChain(target, rootRealPath, operation, rejectLinks) {
  const rootPath = nativePath.normalize(target.root)
  const targetPath = nativePath.normalize(target.path)
  const targetParentPath = nativePath.dirname(targetPath)
  let cursor = targetPath
  let candidateStat = null
  let candidateRealPath = null
  let parentRealPath = null
  while (true) {
    let stat
    try {
      stat = fs.lstatSync(cursor)
    } catch (error) {
      if (!isMissing(error)) throw policyError('PATH_PROBE_FAILED', operation + ' 路径探查失败', { path: cursor, cause: error.code || String(error) })
      if (error.code === 'ENOTDIR') throw policyError('PARENT_NOT_DIRECTORY', operation + ' 父路径不是目录', { path: cursor })
      const parent = nativePath.dirname(cursor)
      if (samePath(parent, cursor)) throw policyError('ROOT_CHAIN_MISSING', operation + ' 找不到授权根父链')
      cursor = parent
      continue
    }
    let realPath
    try {
      realPath = realpathSync(cursor)
    } catch (error) {
      throw policyError('REALPATH_FAILED', operation + ' 无法验证真实路径', { path: cursor, cause: error.code || String(error) })
    }
    sameOrChildReal(rootRealPath, realPath, operation)
    const isLink = typeof stat.isSymbolicLink === 'function' && stat.isSymbolicLink()
    if (rejectLinks && isLink && !samePath(cursor, rootPath)) {
      throw policyError('LINK_WRITE_REJECTED', operation + ' 不跟随链接写入', { path: cursor })
    }
    if (samePath(cursor, targetPath)) {
      candidateStat = stat
      candidateRealPath = realPath
    }
    if (samePath(cursor, targetParentPath) || (samePath(cursor, targetPath) && samePath(cursor, rootPath))) {
      parentRealPath = realPath
    }
    if (parentRealPath === null && !samePath(cursor, targetPath)) parentRealPath = realPath
    if (samePath(cursor, rootPath)) break
    const parent = nativePath.dirname(cursor)
    if (samePath(parent, cursor)) throw policyError('ROOT_CHAIN_MISSING', operation + ' 未到达授权根')
    cursor = parent
  }
  return { candidateStat, candidateRealPath, parentRealPath }
}

function expectedType(options, fallback) {
  const value = options.expectedType === undefined ? fallback : options.expectedType
  if (!['file', 'directory', 'any'].includes(value)) throw policyError('TYPE_INVALID', 'expectedType 必须是 file、directory 或 any')
  return value
}

function checkType(stat, expected, operation, targetPath) {
  if (expected === 'any') return
  if (expected === 'file' && !stat.isFile()) throw policyError('TARGET_TYPE', operation + ' 目标不是文件', { path: targetPath })
  if (expected === 'directory' && !stat.isDirectory()) throw policyError('TARGET_TYPE', operation + ' 目标不是目录', { path: targetPath })
}

export function validateReadTarget(context, candidate, options = {}) {
  ensureContext(context)
  rejectOther(candidate, 'read target')
  rejectOtherOptions(options, 'read options')
  const target = assertAllowedPath(context, candidate, options)
  const expected = expectedType(options, 'file')
  const rootRealPath = physicalRoot(target, 'read')
  const chain = inspectChain(target, rootRealPath, 'read', false)
  if (chain.candidateStat === null) throw policyError('TARGET_MISSING', 'read 目标不存在', { path: target.path })
  let actualStat
  try {
    actualStat = fs.statSync(target.path)
  } catch (error) {
    throw policyError('TARGET_UNREADABLE', 'read 目标不可读取', { path: target.path, cause: error.code || String(error) })
  }
  checkType(actualStat, expected, 'read', target.path)
  return Object.freeze({
    ...target,
    operation: 'read',
    rootRealPath,
    realPath: chain.candidateRealPath,
    parentRealPath: chain.parentRealPath,
    exists: true,
    isFile: actualStat.isFile(),
    isDirectory: actualStat.isDirectory(),
  })
}

export function prepareWriteTarget(context, candidate, options = {}) {
  ensureContext(context)
  rejectOther(candidate, 'write target')
  rejectOtherOptions(options, 'write options')
  const target = assertAllowedPath(context, candidate, options)
  rejectReadOnlyCapability(readOnlyCapabilityForLogicalPath(context, target.path))
  const expected = expectedType(options, 'file')
  if (target.kind === 'host') {
    if (!target.purposeExplicit) throw policyError('PURPOSE_REQUIRED', 'Host写入必须显式提供用途')
    if (target.capability !== null && target.access !== 'write') throw policyError('HOST_RESOURCE_READONLY', 'Host代码/资源能力只读')
  }
  const rootRealPath = physicalRoot(target, 'write')
  const chain = inspectChain(target, rootRealPath, 'write', true)
  rejectReadOnlyCapability(readOnlyCapabilityForRealPath(context, chain.candidateRealPath))
  rejectReadOnlyCapability(readOnlyCapabilityForRealPath(context, chain.parentRealPath))
  const exists = chain.candidateStat !== null
  if (exists) {
    if (chain.candidateStat.isSymbolicLink()) throw policyError('LINK_WRITE_REJECTED', 'write 目标不能是链接', { path: target.path })
    checkType(chain.candidateStat, expected, 'write', target.path)
  } else if (expected === 'directory') {
    throw policyError('TARGET_MISSING', 'write 目录目标不存在，解析函数不会隐式建目录', { path: target.path })
  }
  return Object.freeze({
    ...target,
    operation: 'write',
    rootRealPath,
    realPath: chain.candidateRealPath,
    parentRealPath: chain.parentRealPath,
    parentPath: nativePath.dirname(target.path),
    exists,
    isFile: exists && chain.candidateStat.isFile(),
    isDirectory: exists && chain.candidateStat.isDirectory(),
  })
}
