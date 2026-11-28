import { readFileSync } from 'node:fs'
import { basename, dirname, resolve } from 'node:path'
import { TextDecoder } from 'node:util'
import { resolveProbeTarget } from './save-probe-validation.js'
import { createPathContext, resolveWorkspacePath, validateReadTarget } from './path-policy.js'
import { errorCodeOf } from './runtime-static.js'

const sourceDecoder = new TextDecoder('utf-8', { fatal: true })

// 证据错误用 JSON.stringify 展示引用，必要时追加非权威的装饰提示。
// 提示只检查下方诊断字符集的首字符；成对清洗在 save-contract.js，
// 文件名中的单侧装饰保持不变，供存在性校验使用。
const PROBE_REF_DECOR_RE = /^[`*_"'<>[\]()（）「」【】『』，。；：！？、|]/
function probeRefDecorationHint(ref) {
  return PROBE_REF_DECOR_RE.test(ref) ? '（疑似含 Markdown 装饰；引用证据请使用裸路径，每条单独一行）' : ''
}

// 仅读取会话头部工作区，不计算目录、短名或工件 base。
export function cwdOf(exec) {
  const session = exec !== undefined && exec !== null && exec.agent !== undefined && exec.agent !== null ? exec.agent.session : undefined
  const header = session !== undefined && session !== null && session.header !== undefined && session.header !== null ? session.header : undefined
  return header !== undefined && typeof header.cwd === 'string' ? header.cwd : ''
}

export function pathContextOf(cwd, getPathContext) {
  if (typeof getPathContext === 'function') {
    const supplied = getPathContext(cwd)
    if (supplied !== undefined && supplied !== null) return supplied
  }
  return createPathContext({ workspaceRoot: cwd })
}

const SOURCE_RANGE_RE = /^L([1-9]\d*)(?:-([1-9]\d*))?$/

function sourceCacheKey(value) {
  const normalized = String(value).replace(/\\/g, '/')
  return process.platform === 'win32' ? normalized.toLowerCase() : normalized
}

function resolveMissingWorkspaceIdentity(pathContext, target) {
  const missingSegments = []
  let missingPath = target.path
  for (;;) {
    const parentPath = dirname(missingPath)
    missingSegments.unshift(basename(missingPath))
    const parentTarget = resolveWorkspacePath(pathContext, parentPath, { purpose: 'save-plan-source' })
    try {
      const parent = validateReadTarget(pathContext, parentTarget, { expectedType: 'directory', purpose: 'save-plan-source' })
      return resolve(parent.realPath, ...missingSegments)
    } catch (error) {
      if (errorCodeOf(error) !== 'TARGET_MISSING') throw error
      missingPath = parentPath
    }
  }
}

function resolveWorkspaceEntry(pathContext, relativePath, cache) {
  const target = resolveWorkspacePath(pathContext, relativePath, { purpose: 'save-plan-source' })
  const key = sourceCacheKey(target.path)
  if (cache.has(key)) return cache.get(key)
  let readTarget
  try {
    readTarget = validateReadTarget(pathContext, target, { expectedType: 'file', purpose: 'save-plan-source' })
  } catch (error) {
    if (errorCodeOf(error) !== 'TARGET_MISSING') throw new Error('无法读取目标路径：' + relativePath + '（' + String(error.message || error) + '）')
    let identityPath
    try {
      identityPath = resolveMissingWorkspaceIdentity(pathContext, target)
    } catch (identityError) {
      throw new Error('无法读取目标路径：' + relativePath + '（' + String(identityError.message || identityError) + '）')
    }
    const entry = { exists: false, path: identityPath, buffer: null, text: undefined, lines: undefined }
    cache.set(key, entry)
    return entry
  }
  let buffer
  try { buffer = readFileSync(readTarget.realPath) } catch (error) { throw new Error('无法读取目标文件：' + relativePath + '（' + String(error.message || error) + '）') }
  const entry = { exists: true, path: readTarget.realPath, buffer, text: undefined, lines: undefined }
  cache.set(key, entry)
  return entry
}

function strictTextEntry(entry, relativePath) {
  if (entry.text !== undefined) return entry
  let text
  try { text = sourceDecoder.decode(entry.buffer) } catch (error) { throw new Error('源文件不是合法 UTF-8：' + relativePath + '（' + String(error.message || error) + '）') }
  if (text.includes('\u0000')) throw new Error('源文件包含 NUL：' + relativePath)
  if (text.startsWith('\uFEFF')) text = text.slice(1)
  text = text.replace(/\r\n?/g, '\n')
  const lines = text === '' ? [] : text.split('\n')
  if (lines.length > 0 && lines[lines.length - 1] === '') lines.pop()
  entry.text = text
  entry.lines = lines
  return entry
}

function literalCount(line, needle) {
  let count = 0
  let from = 0
  for (;;) {
    const index = line.indexOf(needle, from)
    if (index < 0) return count
    count += 1
    from = index + Math.max(needle.length, 1)
  }
}

function verifyModificationPoint(entry, relativePath, point) {
  const location = String(point.modificationLocation || '').trim()
  const anchor = String(point.anchor || '').trim()
  if (location === '空文件' && anchor === '空文件') {
    if (entry.lines.length !== 0) throw new Error('空文件例外要求源文件去 BOM 后为空：' + relativePath)
    return
  }
  const match = location.match(SOURCE_RANGE_RE)
  if (match === null) throw new Error('修改位置格式无效：' + relativePath + '#' + String(point.id || ''))
  const start = Number(match[1])
  const end = match[2] === undefined ? start : Number(match[2])
  if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start < 1 || end < start) throw new Error('修改位置不是安全正整数区间：' + relativePath + '#' + String(point.id || ''))
  if (end > entry.lines.length) throw new Error('修改位置超出源文件实际行数：' + relativePath + '#' + String(point.id || '') + '（上界 ' + end + '，实际 ' + entry.lines.length + '）')
  if (anchor === '' || anchor.includes('\n') || anchor.includes('\r')) throw new Error('定位锚点必须是非空单行原文：' + relativePath + '#' + String(point.id || ''))
  let matches = 0
  for (const line of entry.lines.slice(start - 1, end)) matches += literalCount(line, anchor)
  if (matches !== 1) throw new Error('定位锚点在指定范围内必须恰好匹配一次：' + relativePath + '#' + String(point.id || '') + '（实际 ' + matches + ' 次）')
}

// 源核实与证据核实为 save_plan 与草稿工具共用实现，导出复用，禁止复制语义。
export function verifyPlanSources(summary, pathContext) {
  const cache = new Map()
  const targetOwners = new Map()
  const verifyFile = (fileRecord) => {
    const operation = String(fileRecord.operation || '')
    const entry = resolveWorkspaceEntry(pathContext, fileRecord.path, cache)
    const targetKey = sourceCacheKey(entry.path)
    const firstPath = targetOwners.get(targetKey)
    if (firstPath !== undefined) throw new Error('多个文件记录指向同一真实目标：' + firstPath + ' 与 ' + fileRecord.path)
    targetOwners.set(targetKey, fileRecord.path)
    if (operation === '新建') {
      if (entry.exists) throw new Error('新建目标已存在：' + fileRecord.path)
      return
    }
    if (operation === '删除' || operation === '修改') {
      if (!entry.exists) throw new Error('目标文件不存在：' + fileRecord.path)
      if (operation === '修改') {
        const textEntry = strictTextEntry(entry, fileRecord.path)
        for (const point of fileRecord.points || []) verifyModificationPoint(textEntry, fileRecord.path, point)
      }
      return
    }
    if (operation === '生成') {
      for (const point of fileRecord.points || []) {
        for (const source of point.generationSources || []) {
          const sourceEntry = resolveWorkspaceEntry(pathContext, source, cache)
          if (!sourceEntry.exists) throw new Error('生成来源文件不存在：' + source)
        }
      }
    }
  }
  for (const task of summary.tasks || []) for (const fileRecord of task.fileRecords || []) verifyFile(fileRecord)
  if (summary.closure !== null && summary.closure !== undefined) for (const fileRecord of summary.closure.fileRecords || []) verifyFile(fileRecord)
  return { cache }
}

export function verifyProbeEvidenceRef(cwd, reference, sourceState, pathContext, toolLabel = 'save_plan') {
  // 前缀由调用方指定：非空才拼「label: 」；空串表示外层调用方已带工具名，不得重复拼。
  const labelPrefix = typeof toolLabel === 'string' && toolLabel !== '' ? toolLabel + ': ' : ''
  const target = resolveProbeTarget(cwd, reference, pathContext)
  let readTarget
  try {
    readTarget = validateReadTarget(pathContext, target, { expectedType: 'file', purpose: 'probe-evidence' })
  } catch (error) {
    if (errorCodeOf(error) === 'TARGET_MISSING') throw new Error(labelPrefix + '【探查者已核实】证据文件不存在：' + JSON.stringify(reference) + probeRefDecorationHint(reference))
    throw new Error(labelPrefix + '【探查者已核实】证据文件无法读取：' + JSON.stringify(reference) + '（' + String(error.message || error) + '）')
  }
  const key = sourceCacheKey(readTarget.realPath)
  let buffer
  const cached = sourceState.cache.get(key)
  if (cached !== undefined && cached.buffer !== null) buffer = cached.buffer
  else {
    try { buffer = readFileSync(readTarget.realPath) } catch (error) { throw new Error(labelPrefix + '【探查者已核实】证据文件无法读取：' + JSON.stringify(reference) + '（' + String(error.message || error) + '）') }
    sourceState.cache.set(key, { exists: true, path: readTarget.realPath, buffer, text: undefined, lines: undefined })
  }
  const head = buffer.toString('utf8').slice(0, 200)
  if (!head.includes('探查证据报告')) throw new Error(labelPrefix + '【探查者已核实】证据文件非探查者落盘（缺「探查证据报告」标题）：' + JSON.stringify(reference))
}

// 方括号包裹的未探查/待确认标记：命中返回匹配文本，未命中返回 null。
// save_plan 与 edit_plan_draft 共用同一判定与同一时机（合同校验之前），否则草稿工具会
// 旁路 save_plan 的未探查拒绝，把带标记的方案转正。
const UNEXPLORED_MARKER_RE = /【[^】]*(?:未探查|待确认)[^】]*】/
export function unexploredMarkerOf(plan) {
  if (typeof plan !== 'string') return null
  const matched = UNEXPLORED_MARKER_RE.exec(plan)
  return matched === null ? null : matched[0]
}
