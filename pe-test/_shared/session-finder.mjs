// step-04/05/06/08 共用的 session 定位器。只有显式位置目标或公共会话选项才定位会话。
// 所有目录、日志及首帧元数据读取都必须经过 G1 pathContext 的真实根/链接校验。
// 无选择时在任何会话 FS 前返回 none，不探测 DSH_HOME、sessions、最新会话或 marker。
import fs from 'node:fs'
import path from 'node:path'
import { framesOf, decodeText } from './zstd-frames.mjs'
import { createMaintenanceContext } from './workspace-paths.mjs'
import { resolveHostPath, resolveWorkspacePath, validateReadTarget } from '../../plugins/dsh-extra-plan/lib/path-policy.js'

const SESSION_LOG_NAMES = ['session.v4.jsonl.zstd', 'session.v3.jsonl.zstd', 'session.jsonl.zstd']
const SESSION_PURPOSE = 'session-forensics-read'

function errorCodeOf(error) { return error !== null && typeof error === 'object' && typeof error.code === 'string' ? error.code : '' }
function errorMessageOf(error) { return error instanceof Error ? error.message : String(error) }
function isMissingTarget(error) { return errorCodeOf(error) === 'TARGET_MISSING' || errorCodeOf(error) === 'TARGET_TYPE' }
function isAbsolute(value) { return typeof value === 'string' && path.isAbsolute(value) }
function pathKindOf(value, options = {}) {
  if (options.kind === 'host' || options.kind === 'workspace') return options.kind
  return isAbsolute(value) ? undefined : 'workspace'
}

function contextOf(options = {}) {
  const source = options !== null && typeof options === 'object' ? options : {}
  if (source.pathContext !== undefined && source.pathContext !== null && source.session === undefined) {
    return { pathContext: source.pathContext, session: { mode: 'none', status: 'NOT-RUN', target: null, rootTarget: null, discoverChildren: false } }
  }
  if (source.maintenanceContext !== undefined && source.maintenanceContext !== null) {
    if (source.maintenanceContext.pathContext === undefined) throw new Error('maintenanceContext缺少pathContext')
    return source.maintenanceContext
  }
  if (source.pathContext !== undefined && source.pathContext !== null) {
    return { ...source, pathContext: source.pathContext }
  }
  return createMaintenanceContext(source.maintenanceArgs === undefined ? source : source.maintenanceArgs)
}

function hasHostRoot(context) { return context !== null && typeof context === 'object' && typeof context.hostDataRoot === 'string' && context.hostDataRoot !== '' }
function readTarget(context, kind, value, expectedType = 'any') {
  const target = kind === 'host' ? resolveHostPath(context, value, { purpose: SESSION_PURPOSE }) : resolveWorkspacePath(context, value, { purpose: SESSION_PURPOSE })
  return validateReadTarget(context, target, { expectedType, purpose: SESSION_PURPOSE })
}
function tryReadTarget(context, kind, value, expectedType = 'any') {
  try { return readTarget(context, kind, value, expectedType) } catch (error) { if (isMissingTarget(error)) return null; throw error }
}
function authorizedAnyPath(value, context, options = {}) {
  const forcedKind = pathKindOf(value, options)
  const kinds = forcedKind === undefined
    ? isAbsolute(value) && hasHostRoot(context) ? ['host', 'workspace'] : ['workspace', 'host']
    : [forcedKind]
  let firstError
  for (const kind of kinds) {
    try { return readTarget(context, kind, value, 'any') } catch (error) {
      firstError = firstError || error
      if (!isMissingTarget(error) && errorCodeOf(error) !== 'ROOT_REQUIRED' && errorCodeOf(error) !== 'ROOT_ESCAPE') throw error
    }
  }
  throw firstError || new Error('路径不在可信W/H根内')
}
function authorizedLogPath(dir, context, options = {}) {
  const kind = options.kind || pathKindOf(dir, options)
  const directory = kind === undefined ? authorizedAnyPath(dir, context, options) : readTarget(context, kind, dir, 'directory')
  const names = Array.isArray(options.names) ? options.names : SESSION_LOG_NAMES
  for (const name of names) {
    const candidate = path.join(directory.realPath, name)
    try {
      const target = readTarget(context, directory.kind, candidate, 'file')
      return { ...target, logicalPath: target.path, realPath: target.realPath, fileName: name, kind: directory.kind }
    } catch (error) { if (isMissingTarget(error)) continue; throw error }
  }
  return null
}
export function authorizedSessionLogPath(dir, pathContext, options = {}) {
  if (pathContext === undefined || pathContext === null) throw new Error('session log read requires pathContext')
  return authorizedLogPath(dir, pathContext, options)
}
export function authorizedSessionReadPath(value, pathContext, options = {}) {
  if (pathContext === undefined || pathContext === null) throw new Error('session read requires pathContext')
  const expectedType = options.expectedType === undefined ? 'file' : options.expectedType
  const kind = options.kind === 'host' || options.kind === 'workspace' ? options.kind : undefined
  if (kind !== undefined) return readTarget(pathContext, kind, value, expectedType).realPath
  const target = authorizedAnyPath(value, pathContext, options)
  if (expectedType === 'any') return target.realPath
  return readTarget(pathContext, target.kind, value, expectedType).realPath
}
export function logPath(dir, pathContext, options = {}) {
  const found = authorizedSessionLogPath(dir, pathContext, options)
  return found === null ? null : found.realPath
}

const MAX_DISCOVERY_CANDIDATES = 128
const MAX_DISCOVERY_BYTES = 262144
function incompleteError(message) { const error = new Error(message); error.code = 'INCOMPLETE'; return error }
function insideRealRoot(root, value) {
  const relativePath = path.relative(root, value)
  return relativePath === '' || (relativePath !== '..' && !relativePath.startsWith('..' + path.sep) && !path.isAbsolute(relativePath))
}
function isLinkPath(value) {
  try {
    const nativePath = fs.realpathSync.native(value)
    const normalize = (item) => process.platform === 'win32' ? path.normalize(item).toLowerCase() : path.normalize(item)
    if (normalize(nativePath) !== normalize(value)) return true
  } catch {}
  try { if (fs.lstatSync(value).isSymbolicLink()) return true } catch {}
  try { fs.readlinkSync(value); return true } catch {}
  return false
}
function validatedView(context, view, expectedType = 'directory', purpose = SESSION_PURPOSE) {
  if (view === null || view === undefined || typeof view !== 'object') return null
  if (view.policyTarget !== undefined && view.policyTarget !== null) return validateReadTarget(context.pathContext, view.policyTarget, { expectedType, purpose })
  if (typeof view.path !== 'string' || (view.kind !== 'host' && view.kind !== 'workspace')) return null
  return readTarget(context.pathContext, view.kind, view.path, expectedType)
}
function readDiscoveryHead(dir, context, options = {}, maxBytes = MAX_DISCOVERY_BYTES) {
  const found = authorizedLogPath(dir, context, options)
  if (found === null) return null
  const fd = fs.openSync(found.realPath, 'r')
  try {
    const total = fs.fstatSync(fd).size
    const budget = Math.min(total, maxBytes)
    const buf = Buffer.alloc(budget)
    const chunkSize = Math.min(4096, maxBytes)
    let read = 0
    let processedFrames = 0
    let pending = ''
    const metaOf = (parsed) => {
      const types = Array.isArray(parsed?.type) ? parsed.type.map((type) => String(type)) : [String(parsed?.type)]
      if (!types.includes('session')) return null
      const data = parsed !== null && typeof parsed === 'object' && parsed.data !== null && typeof parsed.data === 'object' && !Array.isArray(parsed.data) ? parsed.data : {}
      return { ...parsed, ...data }
    }
    const processText = (text, final = false) => {
      pending += text
      const lines = pending.split('\n')
      pending = lines.pop() || ''
      for (const raw of lines) {
        const line = raw.trim()
        if (line === '') continue
        let parsed
        try { parsed = JSON.parse(line) } catch (error) { throw incompleteError('会话头坏JSON：' + dir + '：' + errorMessageOf(error)) }
        const meta = metaOf(parsed)
        if (meta !== null) return meta
      }
      if (pending.trim() !== '') {
        try {
          const parsed = JSON.parse(pending)
          pending = ''
          return metaOf(parsed)
        } catch (error) {
          if (final) throw incompleteError('会话头不可判定：' + dir + '：' + errorMessageOf(error))
        }
      }
      return null
    }
    while (read < budget) {
      const n = fs.readSync(fd, buf, read, Math.min(chunkSize, budget - read), read)
      if (n <= 0) break
      read += n
      let frames
      try { frames = framesOf(buf.subarray(0, read)) } catch (error) {
        if (read >= budget) throw incompleteError('会话头压缩帧不可判定：' + dir + '：' + errorMessageOf(error))
        continue
      }
      while (processedFrames < frames.length) {
        let text
        try { text = decodeText(buf.subarray(0, read), frames[processedFrames]) } catch (error) { throw incompleteError('会话头解码不可判定：' + dir + '：' + errorMessageOf(error)) }
        processedFrames += 1
        const meta = processText(text)
        if (meta !== null) return meta
      }
    }
    if (read === 0) throw incompleteError('会话头为空：' + dir)
    const finalMeta = processText('', true)
    if (finalMeta !== null) return finalMeta
    if (total > maxBytes || read >= budget) throw incompleteError('会话头超过压缩字节上限 ' + maxBytes + ' 或不可判定：' + dir)
    throw incompleteError('会话头不可判定：' + dir)
  } finally { fs.closeSync(fd) }
}
function idVariants(value) { const raw = String(value); const bare = raw.replace(/^session-/, ''); return new Set([raw, bare, 'session-' + bare]) }
function sameId(left, right) { return typeof left === 'string' && typeof right === 'string' && idVariants(left).has(right) }
function byName(a, b) { return a.name < b.name ? -1 : a.name > b.name ? 1 : 0 }
function directChildren(workspacePath, mainName, context, kind, options = {}) {
  const workspace = options.workspaceTarget || readTarget(context, kind, workspacePath, 'directory')
  const maxCandidates = Number.isInteger(options.maxCandidates) ? options.maxCandidates : MAX_DISCOVERY_CANDIDATES
  const maxBytes = Number.isInteger(options.maxCompressedBytesPerLog) ? options.maxCompressedBytesPerLog : MAX_DISCOVERY_BYTES
  const children = []
  let candidates = 0
  for (const name of fs.readdirSync(workspace.realPath)) {
    if (name === mainName) continue
    const candidate = path.join(workspace.realPath, name)
    if (isLinkPath(candidate)) throw incompleteError('直接子会话链接目标被拒绝：' + name)
    const entry = tryReadTarget(context, kind, candidate, 'any')
    if (entry === null || !entry.isDirectory) continue
    candidates += 1
    if (candidates > maxCandidates) throw incompleteError('直接子会话候选超过上限 ' + maxCandidates)
    if (!insideRealRoot(workspace.realPath, entry.realPath)) throw incompleteError('直接子会话越出选定根：' + name)
    const log = authorizedLogPath(entry.realPath, context, { kind })
    if (log === null) continue
    const meta = readDiscoveryHead(entry.realPath, context, { kind }, maxBytes)
    if (sameId(meta.parentSession, mainName)) children.push({ name, mtimeMs: fs.statSync(log.realPath).mtimeMs, parentSession: meta.parentSession })
  }
  return children.sort((a, b) => a.mtimeMs - b.mtimeMs || byName(a, b)).map((item) => item.name)
}
function selectedGroup(workspacePath, mainName, context, kind, bySessionId = false, options = {}) {
  const workspace = options.workspaceTarget || readTarget(context.pathContext, kind, workspacePath, 'directory')
  const dirs = [mainName]
  if (options.discoverChildren === true) dirs.push(...directChildren(workspace.realPath, mainName, context.pathContext, kind, { ...options, workspaceTarget: workspace }))
  return { kind: 'explicit', pathKind: kind, base: workspace.realPath, dirs, pathContext: context.pathContext, bySessionId }
}
function explicitPathResult(value, context, pathOptions = {}) {
  const target = authorizedAnyPath(value, context.pathContext, pathOptions)
  const directLog = target.isDirectory ? authorizedLogPath(target.realPath, context.pathContext, { kind: target.kind }) : null
  if (directLog === null) return { kind: 'notfound', arg: value, reason: '显式目标不是会话目录；不从其子目录枚举会话' }
  const sessionDir = path.dirname(directLog.realPath)
  return { kind: 'explicit', pathKind: target.kind, base: path.dirname(sessionDir), dirs: [path.basename(sessionDir)], pathContext: context.pathContext }
}
function looksLikePath(value) {
  const text = String(value)
  const normalized = text.replaceAll('\\', '/')
  return isAbsolute(text) || normalized.includes('/') || text === '.' || text === '..' || normalized.startsWith('./') || normalized.startsWith('../') || text.includes(String.fromCharCode(0)) || /^[A-Za-z]:[^\\/]/.test(text) || (/^[A-Za-z][A-Za-z0-9+.-]*:/.test(text) && !/^[A-Za-z]:[\\/]/.test(text)) || /(?:%[A-Za-z_][A-Za-z0-9_]*%)/.test(text) || /(?:^|[\\/])\$(?:\{[A-Za-z_][A-Za-z0-9_]*\}|[A-Za-z_][A-Za-z0-9_]*)/.test(text) || text.startsWith('~')
}
function sessionRootTarget(context) {
  const session = context.session
  return validatedView(context, session?.rootTarget || session?.target, 'directory', 'session-root-read')
}
function exactIdResult(id, context) {
  const session = context.session
  if (session === null || typeof session !== 'object' || session.mode !== 'id' || typeof session.id !== 'string' || session.id === '') return { kind: 'unavailable', arg: id, reason: 'ID模式必须显式提供--session与--sessions-dir' }
  if (!sameId(id, session.id)) return { kind: 'notfound', arg: id, reason: '位置参数与公共--session不一致' }
  const sessions = sessionRootTarget(context)
  if (sessions === null) return { kind: 'unavailable', arg: id, reason: '会话根不可用' }
  const hits = []
  for (const name of idVariants(session.id)) {
    const candidate = path.join(sessions.realPath, name)
    if (isLinkPath(candidate)) return { kind: 'unavailable', arg: id, reason: 'ID目标链接被拒绝：' + name }
    const target = tryReadTarget(context.pathContext, sessions.kind, candidate, 'directory')
    if (target === null || !insideRealRoot(sessions.realPath, target.realPath)) continue
    const log = authorizedLogPath(target.realPath, context.pathContext, { kind: sessions.kind })
    if (log !== null && !hits.some((hit) => hit.path === target.realPath)) hits.push({ path: target.realPath, name })
  }
  if (hits.length === 0) return { kind: 'notfound', arg: id }
  if (hits.length > 1) return { kind: 'notfound', arg: id, reason: 'ID变体在选定会话根中产生歧义', candidates: hits.map((hit) => hit.path) }
  return selectedGroup(sessions.realPath, hits[0].name, context, sessions.kind, true, {
    workspaceTarget: sessions,
    discoverChildren: session.discoverChildren === true,
    maxCandidates: session.maxCandidates,
    maxCompressedBytesPerLog: session.maxCompressedBytesPerLog,
  })
}
function contextSelectionResult(context) {
  const session = context.session
  if (session === null || typeof session !== 'object' || session.mode === 'none') return { kind: 'none', selected: false, reason: '未显式选择会话；未执行会话磁盘探测' }
  if (session.mode === 'id') return exactIdResult(session.id, context)
  if (session.mode !== 'dir') return { kind: 'unavailable', reason: '会话选择模式无效' }
  const target = validatedView(context, session.target || session.rootTarget, 'directory', 'session-read')
  if (target === null) return { kind: 'unavailable', reason: '单会话目标不可用' }
  const log = authorizedLogPath(target.realPath, context.pathContext, { kind: target.kind })
  if (log === null) return { kind: 'notfound', arg: session.dir || session.sessionDir, reason: '显式单会话目录缺少会话日志' }
  const sessionDir = path.dirname(log.realPath)
  return { kind: 'explicit', pathKind: target.kind, base: path.dirname(sessionDir), dirs: [path.basename(sessionDir)], pathContext: context.pathContext }
}
export function findSession(explicit, options = {}) {
  const rawExplicit = explicit === undefined || explicit === null ? '' : String(explicit).trim()
  const requested = rawExplicit !== '' && !rawExplicit.startsWith('--') ? rawExplicit : undefined
  let context
  try { context = contextOf(options) } catch (error) { return { kind: 'unavailable', arg: requested, reason: errorMessageOf(error) } }
  try {
    const session = context.session
    if (requested === undefined) return contextSelectionResult(context)
    if (session !== null && typeof session === 'object' && session.mode !== undefined && session.mode !== 'none') {
      if (session.mode === 'id' && !looksLikePath(requested)) return exactIdResult(requested, context)
      return { kind: 'unavailable', arg: requested, reason: '公共会话选项与位置参数冲突' }
    }
    if (looksLikePath(requested)) return explicitPathResult(requested, context, { kind: options.pathKind || options.kind })
    return { kind: 'unavailable', arg: requested, reason: 'ID选择必须显式使用--session与--sessions-dir' }
  } catch (error) {
    if (errorCodeOf(error) === 'INCOMPLETE') return { kind: 'incomplete', arg: requested, reason: errorMessageOf(error) }
    if (isMissingTarget(error)) return { kind: 'notfound', arg: requested, reason: errorMessageOf(error) }
    return { kind: 'unavailable', arg: requested, reason: errorMessageOf(error) }
  }
}
