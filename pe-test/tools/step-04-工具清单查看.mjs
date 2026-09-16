// step-04-工具清单查看.mjs（原 print-header-tools.mjs）— 读取指定会话的逻辑 JSONL 并取证模型可见目录
// 用法: node step-04-工具清单查看.mjs <显式会话目录名>
// 只读输出：request/header 的逻辑行号、前置 tool/call 数、F/L、精确 header.tools，
// header.system 文本命中与 source.kind=skill-catalog；文本命中不冒充命名 section。
import fs from 'node:fs'
import path from 'node:path'
import { framesOf, decodeText } from '../_shared/zstd-frames.mjs'
import { findSession, logPath } from '../_shared/session-finder.mjs'

const NL = String.fromCharCode(10)
const CREATIVE_SKILLS = new Set(['cordis-plugin-development', 'editing-cordis-compositions'])
const CORDIS_PRESENTATION_TOOLS = [
  'cordis_inspect_list',
  'cordis_inspect_query',
  'cordis_inspect_self',
  'cordis_define',
  'cordis_run',
  'cordis_stop',
  'cordis_undefine',
]
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
  if (Array.isArray(value)) {
    for (const item of value) skillCatalogSources(item, out, seen, depth + 1)
  } else {
    for (const item of Object.values(value)) skillCatalogSources(item, out, seen, depth + 1)
  }
  return out
}
function systemTextHits(systemText) {
  const c7 = CORDIS_PRESENTATION_TOOLS.filter((name) => systemText.includes(name))
  return {
    ptcInstruction: systemText.includes('Writing code for run_code') || systemText.includes('Only the run_code transport is directly callable') || systemText.includes('tools:ptc-only') || systemText.includes('PTC'),
    readGuidance: systemText.includes('Use the read tool') && systemText.includes('not shell commands like cat'),
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
function parsedRecords(logicalText) {
  const records = []
  let lineNo = 0
  for (const raw of logicalText.split(NL)) {
    lineNo += 1
    const line = raw.trim()
    if (line === '') continue
    let event
    try { event = JSON.parse(line) } catch { continue }
    const types = Array.isArray(event.type) ? event.type.map((type) => String(type)) : [String(event.type)]
    records.push({ line: lineNo, event, types })
  }
  return records
}

const found = findSession(process.argv[2])
if (found.kind === 'notfound') { console.error('log not found:', found.arg); process.exit(1) }
if (found.kind === 'none') { console.error('未发现使用过按需规划模式的会话'); process.exit(1) }
for (const dir of found.dirs) {
  console.log(NL + '===== 会话 ' + dir + ' =====')
  const lp = logPath(path.join(found.base, dir))
  if (!lp) { console.error('会话日志文件不存在（两代候选名均未命中）:', path.join(found.base, dir)); continue }
  const buf = fs.readFileSync(lp)
  // 先按 frame 原顺序拼接，再按逻辑 JSONL 分行；记录可跨 zstd frame 的边界。
  const logicalText = framesOf(buf).map((frame) => decodeText(buf, frame)).join('')
  const records = parsedRecords(logicalText)
  const headerMeta = new Map()
  let precedingToolCalls = 0
  for (const record of records) {
    if (record.types.includes('request/header')) {
      const header = headerOf(record.event)
      const rawTools = Array.isArray(header.tools) ? header.tools : []
      const toolNames = rawTools.map((tool) => typeof tool === 'string' ? tool : tool !== null && typeof tool === 'object' ? tool.name : tool)
      const systemText = textOf(header.system)
      headerMeta.set(record, { line: record.line, phase: precedingToolCalls === 0 ? 'first' : 'later', precedingToolCalls, tools: rawTools, toolNames, systemText })
    }
    if (record.types.includes('tool/call')) precedingToolCalls += 1
  }
  let previousHeader = null
  for (let index = 0; index < records.length; index += 1) {
    const record = records[index]
    const meta = headerMeta.get(record)
    if (meta !== undefined) {
      previousHeader = meta
      console.log('L' + meta.line + ' session=' + dir + ' precedingToolCalls=' + meta.precedingToolCalls + ' phase=' + meta.phase + ' header.tools=' + jsonText(meta.tools) + ' tools.names=' + jsonText(meta.toolNames))
      console.log('L' + meta.line + ' header.system.textLength=' + meta.systemText.length + ' textHits=' + jsonText(systemTextHits(meta.systemText)) + ' textEvidenceOnly=true sectionNames=not-inferred-from-text')
    }
    const catalogs = skillCatalogSources(record.event)
    for (const source of catalogs) {
      const entries = source.entries.filter((entry) => entry !== null && typeof entry === 'object' && typeof entry.name === 'string')
      const names = entries.map((entry) => entry.name)
      const creative = names.filter((name) => CREATIVE_SKILLS.has(name))
      const ordinary = names.filter((name) => !CREATIVE_SKILLS.has(name))
      let adjacent = previousHeader
      if (adjacent === null) {
        for (let nextIndex = index + 1; nextIndex < records.length; nextIndex += 1) {
          const nextMeta = headerMeta.get(records[nextIndex])
          if (nextMeta !== undefined) { adjacent = nextMeta; break }
        }
      }
      const adjacentOutput = adjacent === null ? { headerLine: null, headerPhase: 'unknown', headerPrecedingToolCalls: null, headerTools: [] } : { headerLine: adjacent.line, headerPhase: adjacent.phase, headerPrecedingToolCalls: adjacent.precedingToolCalls, headerTools: adjacent.tools }
      console.log('L' + record.line + ' source.kind=skill-catalog entries=' + jsonText(names) + ' ordinary=' + jsonText(ordinary) + ' creativeSkills=' + jsonText(creative) + ' creativeCount=' + creative.length + ' adjacentHeader=' + jsonText(adjacentOutput))
    }
  }
}
