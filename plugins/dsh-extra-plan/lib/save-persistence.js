import { mkdirSync, writeFileSync, renameSync, existsSync, unlinkSync } from 'node:fs'
import { join } from 'node:path'
import { resolveWorkspacePath, prepareWriteTarget, validateReadTarget } from './path-policy.js'

// 单次调用的临时写入与顺序发布；不创建、不扫描、不恢复跨调用 journal。
// fsOps 仅供隔离测试注入，默认操作冻结以避免夹具修改共享依赖。
const DEFAULT_FS_OPS = Object.freeze({ mkdirSync, writeFileSync, renameSync, existsSync, unlinkSync })

function fsOpsOf(overrides) {
  if (overrides === null || overrides === undefined || typeof overrides !== 'object') return DEFAULT_FS_OPS
  return { ...DEFAULT_FS_OPS, ...overrides }
}

function errorText(error) {
  return error instanceof Error ? error.message : String(error)
}

function errorCodeOf(error) {
  return error !== null && typeof error === 'object' && typeof error.code === 'string' ? error.code : ''
}

function policyOf(options) {
  return options !== null && typeof options === 'object' ? options : {}
}

function authorizeDirectory(dir, pathContext, purpose) {
  if (pathContext === undefined || pathContext === null) return null
  const target = resolveWorkspacePath(pathContext, dir, { purpose })
  return prepareWriteTarget(pathContext, target, { expectedType: 'any', purpose })
}

function authorizeFile(path, pathContext, purpose) {
  if (pathContext === undefined || pathContext === null) return null
  const target = resolveWorkspacePath(pathContext, path, { purpose })
  return prepareWriteTarget(pathContext, target, { expectedType: 'file', purpose })
}

function cleanupCreated(paths, ops, pathContext, purpose) {
  const failures = []
  for (const path of paths) {
    try {
      authorizeFile(path, pathContext, purpose)
      if (ops.existsSync(path)) ops.unlinkSync(path)
    } catch (error) {
      failures.push(path + '（' + errorText(error) + '）')
    }
  }
  return failures
}

function commitError(stage, original, cleanupFailures) {
  const prefix = 'atomicCommit: 阶段=' + stage + '；原始失败=' + errorText(original)
  const suffix = cleanupFailures.length === 0 ? '' : '；清理失败：' + cleanupFailures.join('；')
  const wrapped = new Error(prefix + suffix)
  wrapped.cause = original
  return wrapped
}

// 目录创建 → 逐个临时写入 → 逐个检查并发布。
// 目标存在时立即拒绝，发布失败只清理本次已尝试的临时文件/已发布文件；
// 预存目标与目录外历史文件不进入清理集合。
export function atomicCommit(dir, base, files, fsOps, policyOptions) {
  const ops = fsOpsOf(fsOps)
  const policy = policyOf(policyOptions)
  const pathContext = policy.pathContext
  const purpose = typeof policy.purpose === 'string' && policy.purpose !== '' ? policy.purpose : 'save-artifacts'
  const authorizedDir = authorizeDirectory(dir, pathContext, purpose)
  const suffix = '.tmp-' + process.pid + '-' + Date.now()
  const entries = files.map((file) => ({
    tmp: join(dir, file.name + suffix),
    file: join(dir, file.name),
    content: file.content,
  }))
  const attemptedTemps = []
  const published = []
  let stage = '准备'
  try {
    stage = '目录授权'
    if (pathContext === undefined || pathContext === null) throw new Error('atomicCommit: 缺少workspace授权上下文')
    if (authorizedDir === null) throw new Error('atomicCommit: 缺少workspace授权上下文')
    stage = '目录创建'
    ops.mkdirSync(dir, { recursive: true })
    if (pathContext !== undefined && pathContext !== null) validateReadTarget(pathContext, resolveWorkspacePath(pathContext, dir, { purpose }), { expectedType: 'directory', purpose })
    stage = '准备目标'
    for (const entry of entries) {
      authorizeFile(entry.file, pathContext, purpose)
      authorizeFile(entry.tmp, pathContext, purpose)
      if (ops.existsSync(entry.file)) throw new Error('预存目标已存在：' + entry.file)
      if (ops.existsSync(entry.tmp)) throw new Error('临时文件已存在：' + entry.tmp)
    }
    for (let index = 0; index < entries.length; index += 1) {
      const entry = entries[index]
      stage = '临时写入' + (index + 1)
      authorizeFile(entry.tmp, pathContext, purpose)
      attemptedTemps.push(entry.tmp)
      ops.writeFileSync(entry.tmp, entry.content, 'utf8')
    }
    for (let index = 0; index < entries.length; index += 1) {
      const entry = entries[index]
      stage = '发布' + (index + 1)
      authorizeFile(entry.file, pathContext, purpose)
      if (ops.existsSync(entry.file)) throw new Error('发布前目标已存在：' + entry.file)
      ops.renameSync(entry.tmp, entry.file)
      published.push(entry.file)
      authorizeFile(entry.file, pathContext, purpose)
      if (!ops.existsSync(entry.file)) throw new Error('发布后目标未就位：' + entry.file)
    }
  } catch (error) {
    const cleanupFailures = cleanupCreated([...attemptedTemps, ...published], ops, pathContext, purpose)
    throw commitError(stage, error, cleanupFailures)
  }
}
