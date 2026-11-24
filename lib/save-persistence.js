import { mkdirSync, writeFileSync, renameSync, existsSync, unlinkSync, readFileSync, lstatSync, fstatSync, openSync, closeSync } from 'node:fs'
import { join } from 'node:path'
import { resolveWorkspacePath, prepareWriteTarget, validateReadTarget } from './path-policy.js'
import { errorText } from './runtime-static.js'

// 单次调用的临时写入与顺序发布；不创建、不扫描、不恢复跨调用 journal。
// fsOps 仅供隔离测试注入，默认操作冻结以避免夹具修改共享依赖。
const DEFAULT_FS_OPS = Object.freeze({ mkdirSync, writeFileSync, renameSync, existsSync, unlinkSync, readFileSync, lstatSync, fstatSync, openSync, closeSync })

function fsOpsOf(overrides) {
  if (overrides === null || overrides === undefined || typeof overrides !== 'object') return DEFAULT_FS_OPS
  return { ...DEFAULT_FS_OPS, ...overrides }
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

function replaceError(stage, original, cleanupFailures, restoreFailures) {
  const parts = ['atomicReplace: 阶段=' + stage + '；原始失败=' + errorText(original)]
  if (restoreFailures.length !== 0) parts.push('恢复失败：' + restoreFailures.join('；'))
  if (cleanupFailures.length !== 0) parts.push('清理失败：' + cleanupFailures.join('；'))
  return new Error(parts.join('；'), { cause: original })
}

function sameFile(left, right) {
  return left !== undefined && right !== undefined && left.isFile() && right.isFile()
    && left.ino > 0n && left.ino === right.ino && left.dev === right.dev
}

function stagePairFile(ops, path, content, pending) {
  const fd = ops.openSync(path, 'wx')
  pending.set(path, undefined)
  let failed = false
  try {
    pending.set(path, ops.fstatSync(fd, { bigint: true }))
    ops.writeFileSync(fd, content, 'utf8')
  } catch (error) {
    failed = true
    throw error
  } finally {
    try { ops.closeSync(fd) } catch (error) { if (!failed) throw error }
  }
}

// 成对覆盖只在本次调用中保留旧字节；不承诺外部并发或跨进程崩溃原子性。
export function atomicReplace(dir, files, fsOps, policyOptions) {
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
  const paired = entries.length === 2
  const attemptedTemps = []
  const pending = new Map()
  const published = []
  let stage = '准备'
  try {
    stage = '目录授权'
    if (pathContext === undefined || pathContext === null) throw new Error('atomicReplace: 缺少workspace授权上下文')
    if (authorizedDir === null) throw new Error('atomicReplace: 缺少workspace授权上下文')
    stage = '目录创建'
    ops.mkdirSync(dir, { recursive: true })
    if (pathContext !== undefined && pathContext !== null) validateReadTarget(pathContext, resolveWorkspacePath(pathContext, dir, { purpose }), { expectedType: 'directory', purpose })
    stage = '准备目标'
    for (const entry of entries) {
      const target = authorizeFile(entry.file, pathContext, purpose)
      authorizeFile(entry.tmp, pathContext, purpose)
      if (paired) entry.previous = target.exists ? ops.readFileSync(target.realPath) : null
    }
    for (let index = 0; index < entries.length; index += 1) {
      const entry = entries[index]
      stage = '临时写入' + (index + 1)
      authorizeFile(entry.tmp, pathContext, purpose)
      if (paired) stagePairFile(ops, entry.tmp, entry.content, pending)
      else {
        attemptedTemps.push(entry.tmp)
        ops.writeFileSync(entry.tmp, entry.content, 'utf8')
      }
    }
    for (let index = 0; index < entries.length; index += 1) {
      const entry = entries[index]
      stage = '覆盖' + (index + 1)
      authorizeFile(entry.file, pathContext, purpose)
      if (paired) entry.identity = pending.get(entry.tmp)
      ops.renameSync(entry.tmp, entry.file)
      if (paired) {
        published.push(entry)
        pending.delete(entry.tmp)
      }
      authorizeFile(entry.file, pathContext, purpose)
      if (!ops.existsSync(entry.file)) throw new Error('覆盖后目标未就位：' + entry.file)
    }
  } catch (error) {
    const restoreFailures = []
    for (const entry of published.reverse()) {
      try {
        const target = authorizeFile(entry.file, pathContext, purpose)
        if (!target.exists && entry.previous === null) continue
        if (!target.exists || !sameFile(entry.identity, ops.lstatSync(entry.file, { bigint: true }))) throw new Error('无法确认是本轮发布，保留现场')
        if (entry.previous === null) {
          ops.unlinkSync(entry.file)
          if (authorizeFile(entry.file, pathContext, purpose).exists) throw new Error('本轮新增目标未恢复为缺席')
        } else {
          const restoreTmp = entry.tmp + '-restore'
          authorizeFile(restoreTmp, pathContext, purpose)
          stagePairFile(ops, restoreTmp, entry.previous, pending)
          ops.renameSync(restoreTmp, entry.file)
          pending.delete(restoreTmp)
          const restored = authorizeFile(entry.file, pathContext, purpose)
          if (!restored.exists || !ops.readFileSync(restored.realPath).equals(entry.previous)) throw new Error('原始字节未恢复')
        }
      } catch (restoreError) {
        restoreFailures.push(entry.file + '（' + errorText(restoreError) + '）')
      }
    }
    const cleanupFailures = cleanupCreated(attemptedTemps, ops, pathContext, purpose)
    for (const [temp, identity] of pending) {
      try {
        if (!authorizeFile(temp, pathContext, purpose).exists) continue
        if (!sameFile(identity, ops.lstatSync(temp, { bigint: true }))) throw new Error('无法确认本轮临时文件，保留现场')
        ops.unlinkSync(temp)
      } catch (cleanupError) {
        cleanupFailures.push(temp + '（' + errorText(cleanupError) + '）')
      }
    }
    throw replaceError(stage, error, cleanupFailures, restoreFailures)
  }
}
