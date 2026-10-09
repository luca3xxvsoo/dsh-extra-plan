// step-04-工具清单查看.mjs — 读取指定 session 的逻辑 JSONL，报告模型可见工具。
// 旧摘要模式：node step-04-工具清单查看.mjs <显式会话目录名>
// 严格模式：node step-04-工具清单查看.mjs <单会话目录> --messages [--request-trace <工作区trace>]
import fs from 'node:fs'
import path from 'node:path'
import { framesOf, decodeText } from '../_shared/zstd-frames.mjs'
import { findSession, logPath } from '../_shared/session-finder.mjs'
import { CORDIS_PRESENTATION_TOOLS } from '../../plugins/dsh-extra-plan/lib/assembly-presentation.js'

const NL = String.fromCharCode(10)
const CREATIVE_SKILLS = new Set(['cordis-plugin-development', 'editing-cordis-compositions', 'cordis-composition-reference'])
function jsonText(value) {
  try { return JSON.stringify(value) } catch { return 'null' }
}
function textOf(value, depth = 0) {
  if (depth > 8 || value === null || value === undefined) return ''
  if (typeof value === 'string') return value
  if (Array.isArray(value)) return value.map((item) => textOf(item, depth + 1)).filter(Boolean).join(NL)
  if (typeof value !== 'object') return ''
  const parts = []
  for (const key of ['text', 'content', 'parts', 'messages', 'system']) {
    if (Object.prototype.hasOwnProperty.call(value, key)) {
      const part = textOf(value[key], depth + 1)
      if (part !== '') parts.push(part)
    }
  }
  return parts.join(NL)
}
function skillCatalogSources(value, out = [], seen = new Set(), depth = 0) {
  if (depth > 8 || value === null || typeof value !== 'object' || seen.has(value)) return out
  seen.add(value)
  if (value.kind === 'skill-catalog' && Array.isArray(value.entries)) out.push(value)
  if (Array.isArray(value)) for (const item of value) skillCatalogSources(item, out, seen, depth + 1)
  else for (const item of Object.values(value)) skillCatalogSources(item, out, seen, depth + 1)
  return out
}
function systemTextHits(systemText) {
  const c7 = CORDIS_PRESENTATION_TOOLS.filter((name) => systemText.includes(name))
  return {
    ptcInstruction: systemText.includes('Writing code for run_code') || systemText.includes('Only the run_code transport is directly callable') || systemText.includes('tools:ptc-only') || systemText.includes('PTC'),
    readHostText: systemText.includes('Use the read tool') && systemText.includes('not shell commands like cat'),
    readHint: systemText.includes('在 run_code 程序里读文件') && systemText.includes('tools.read') && systemText.includes('file_path') && systemText.includes('offset') && systemText.includes('limit'),
    minimalRead: (systemText.includes('read:') || systemText.includes('tools.read')) && systemText.includes('file_path') && systemText.includes('offset') && systemText.includes('limit'),
    sdkRenderer: systemText.includes('interface ToolArgsMap') && systemText.includes('declare const tools'),
    c7,
    toolCordis: systemText.includes('tool:cordis'),
  }
}
function headerOf(event) {
  const data = event !== null && typeof event === 'object' && event.data !== null && typeof event.data === 'object' ? event.data : {}
  return data.header !== null && typeof data.header === 'object' ? data.header : data
}
function eventTypes(event) {
  return Array.isArray(event?.type) ? event.type.map((type) => String(type)) : [String(event?.type)]
}
function parseRecordsStrict(logicalText) {
  const records = []
  let line = 0
  for (const raw of logicalText.split(NL)) {
    line += 1
    if (raw.trim() === '') continue
    let event
    try { event = JSON.parse(raw) } catch (error) { throw new Error('坏JSON行 line=' + line + ': ' + (error instanceof Error ? error.message : String(error))) }
    records.push({ line, event, types: eventTypes(event) })
  }
  if (records.length === 0) throw new Error('逻辑JSONL为空')
  const seqs = records.map((record) => record.event?.seq).filter((seq) => Number.isInteger(seq))
  for (let index = 1; index < seqs.length; index += 1) if (seqs[index] !== seqs[index - 1] + 1) throw new Error('seq不连续: ' + seqs[index - 1] + ' -> ' + seqs[index])
  return records
}
function physicalMeta(records, dir) {
  let id = ''
  let version
  let cwd = ''
  for (const record of records) {
    const event = record.event
    const data = event?.data && typeof event.data === 'object' ? event.data : {}
    const header = data.header && typeof data.header === 'object' ? data.header : event?.header && typeof event.header === 'object' ? event.header : {}
    if (typeof event?.version === 'number') version = event.version
    if (typeof data.version === 'number') version = data.version
    if (typeof event?.id === 'string') id = event.id
    if (typeof data.id === 'string') id = data.id
    if (typeof header.id === 'string') id = header.id
    if (typeof event?.cwd === 'string') cwd = event.cwd
    if (typeof data.cwd === 'string') cwd = data.cwd
    if (typeof header.cwd === 'string') cwd = header.cwd
  }
  if (id === '') throw new Error('物理header缺Session id: ' + dir)
  if (!Number.isInteger(version)) throw new Error('物理header缺version: ' + dir)
  if (cwd === '') throw new Error('物理header缺cwd: ' + dir)
  return { id, version, cwd }
}
function sourceOfMessage(message) {
  return message !== null && typeof message === 'object' && message.source !== undefined ? message.source : undefined
}
function messageFromEvent(record) {
  const type = record.types
  const event = record.event
  const data = event?.data
  if (type.includes('user/message')) return data?.message ?? data
  if (type.includes('system/message') || type.includes('developer/message') || type.includes('assistant/message') || type.includes('tool/result')) return data?.message
  return undefined
}
function strictMessages(records, meta) {
  const output = []
  const inboxOnly = []
  let precedingToolCalls = 0
  let activeHeaderSeq = null
  for (const record of records) {
    const event = record.event
    if (record.types.includes('request/header')) {
      const header = headerOf(event)
      activeHeaderSeq = Number.isInteger(event.seq) ? event.seq : activeHeaderSeq
      console.log('HEADER line=' + record.line + ' seq=' + String(activeHeaderSeq) + ' sessionId=' + meta.id + ' version=' + meta.version + ' cwd=' + meta.cwd + ' tools=' + jsonText(header.tools || []) + ' systemTextEvidenceOnly=' + jsonText(systemTextHits(textOf(header.system || header.message || ''))))
    }
    const inbox = record.types.some((type) => type.startsWith('agent/inbox/'))
    const message = messageFromEvent(record)
    if (inbox && message !== undefined) {
      inboxOnly.push({ line: record.line, seq: event.seq ?? null, type: record.types, id: message.id ?? null, role: message.role ?? null, source: sourceOfMessage(message), content: message.content ?? null, inboxOnly: true })
    }
    if (message !== undefined) {
      output.push({
        line: record.line,
        seq: event.seq ?? null,
        type: record.types,
        sessionId: meta.id,
        parentSession: event?.data?.parentSession ?? null,
        id: message.id ?? null,
        role: message.role ?? (record.types.includes('user/message') ? 'user' : null),
        source: sourceOfMessage(message),
        content: message.content ?? null,
        surfaceOp: event.surfaceOp ?? event.data?.surfaceOp ?? null,
        sourceEventSeqs: event.sourceEventSeqs ?? event.data?.sourceEventSeqs ?? null,
        precedingDurableToolCalls: precedingToolCalls,
        activeHeaderSeq,
        inboxOnly: false,
      })
    }
    if (record.types.includes('tool/call')) precedingToolCalls += 1
  }
  return { output, inboxOnly }
}
function strictSessionDir(value) {
  if (value === undefined || value.startsWith('--')) throw new Error('--messages必须显式传入单会话目录')
  const dir = path.resolve(value)
  if (!fs.existsSync(dir) || !fs.statSync(dir).isDirectory()) throw new Error('单会话目录不存在: ' + dir)
  const log = logPath(dir)
  if (!log) throw new Error('会话日志文件不存在: ' + dir)
  return { dir, log }
}
function readStrictSession(value) {
  const found = strictSessionDir(value)
  const bytes = fs.readFileSync(found.log)
  let logicalText
  try { logicalText = framesOf(bytes).map((frame) => decodeText(bytes, frame)).join('') } catch (error) { throw new Error('frame/尾部不完整或不支持: ' + (error instanceof Error ? error.message : String(error))) }
  const records = parseRecordsStrict(logicalText)
  const meta = physicalMeta(records, found.dir)
  return { ...found, records, meta }
}
function traceRequests(value) {
  const raw = JSON.parse(fs.readFileSync(value, 'utf8'))
  if (Array.isArray(raw)) return { meta: {}, requests: raw }
  if (raw === null || typeof raw !== 'object' || !Array.isArray(raw.requests)) throw new Error('request trace必须是数组或{requests:[]}')
  return { meta: raw, requests: raw.requests }
}
function printTrace(tracePath, sessionId) {
  const trace = traceRequests(tracePath)
  if (trace.meta.sessionId !== undefined && trace.meta.sessionId !== sessionId) throw new Error('trace sessionId不匹配: ' + trace.meta.sessionId + ' != ' + sessionId)
  if (trace.requests.some((request) => request.sessionId !== undefined && request.sessionId !== sessionId)) throw new Error('trace存在错SessionId request')
  console.log('REQUEST_EXACT=' + String(trace.requests.length > 0 && trace.requests.every((request) => request.sessionId === sessionId && Number.isInteger(request.requestIndex))))
  for (const request of trace.requests) console.log('REQUEST ' + JSON.stringify(request))
}
function legacySummary(args) {
  const found = findSession(args[0])
  if (found.kind === 'notfound') { console.error('未找到日志：', found.arg); process.exitCode = 1; return }
  if (found.kind === 'none') { console.error('未发现使用过按需规划模式的会话'); process.exitCode = 1; return }
  for (const dir of found.dirs) {
    console.log(NL + '===== 会话 ' + dir + ' =====')
    const lp = logPath(path.join(found.base, dir))
    if (!lp) { console.error('会话日志文件不存在（三代候选名均未命中）:', path.join(found.base, dir)); process.exitCode = 1; continue }
    const buf = fs.readFileSync(lp)
    const logicalText = framesOf(buf).map((frame) => decodeText(buf, frame)).join('')
    const records = parseRecordsStrict(logicalText)
    let previousHeader = null
    let precedingToolCalls = 0
    for (const record of records) {
      if (record.types.includes('request/header')) {
        const header = headerOf(record.event)
        const rawTools = Array.isArray(header.tools) ? header.tools : []
        const toolNames = rawTools.map((tool) => typeof tool === 'string' ? tool : tool !== null && typeof tool === 'object' ? tool.name : tool)
        const systemText = textOf(header.system || header.message || '')
        previousHeader = { line: record.line, phase: precedingToolCalls === 0 ? 'first' : 'later', precedingToolCalls, tools: rawTools }
        console.log('L' + record.line + ' session=' + dir + ' precedingToolCalls=' + precedingToolCalls + ' phase=' + previousHeader.phase + ' header.tools=' + jsonText(rawTools) + ' tools.names=' + jsonText(toolNames))
        console.log('L' + record.line + ' header.system.textLength=' + systemText.length + ' textHits=' + jsonText(systemTextHits(systemText)) + ' textEvidenceOnly=true sectionNames=not-inferred-from-text')
      }
      for (const source of skillCatalogSources(record.event)) {
        const names = source.entries.filter((entry) => entry !== null && typeof entry === 'object' && typeof entry.name === 'string').map((entry) => entry.name)
        const creative = names.filter((name) => CREATIVE_SKILLS.has(name))
        const ordinary = names.filter((name) => !CREATIVE_SKILLS.has(name))
        console.log('L' + record.line + ' source.kind=skill-catalog entries=' + jsonText(names) + ' ordinary=' + jsonText(ordinary) + ' creativeSkills=' + jsonText(creative) + ' creativeCount=' + creative.length + ' adjacentHeader=' + jsonText(previousHeader))
      }
      if (record.types.includes('tool/call')) precedingToolCalls += 1
    }
  }
}
const argv = process.argv.slice(2)
const messagesMode = argv.includes('--messages')
if (!messagesMode) {
  legacySummary(argv.filter((arg) => !arg.startsWith('--')))
} else {
  try {
    const positional = argv.filter((arg, index) => !arg.startsWith('--') && argv[index - 1] !== '--request-trace')
    if (positional.length !== 1) throw new Error('--messages要求恰好一个显式单会话目录')
    const session = readStrictSession(positional[0])
    console.log('SESSION_META ' + JSON.stringify(session.meta))
    const messages = strictMessages(session.records, session.meta)
    for (const message of messages.output) console.log('MESSAGE ' + JSON.stringify(message))
    for (const message of messages.inboxOnly) console.log('INBOX_ONLY ' + JSON.stringify(message))
    const traceIndex = argv.indexOf('--request-trace')
    if (traceIndex >= 0) {
      const tracePath = argv[traceIndex + 1]
      if (tracePath === undefined || tracePath.startsWith('--') || !fs.existsSync(tracePath)) throw new Error('--request-trace目标不存在')
      printTrace(tracePath, session.meta.id)
    } else console.log('REQUEST_EXACT=false')
  } catch (error) {
    console.error('INCOMPLETE ' + (error instanceof Error ? error.message : String(error)))
    process.exitCode = 1
  }
}
