// step-05-会话解码.mjs — 解码显式选择的会话日志，汇总事件类型、预设事件、plan/mode 以及 request/header 摘要。
// 用法: node step-05-会话解码.mjs [<会话目录名或路径>] [--session <ID> --sessions-dir <根>]；无选择=NOT-RUN，不扫描会话目录。
import fs from 'node:fs'
import path from 'node:path'
import { decodedJsonlLines } from '../_shared/zstd-frames.mjs'
import { authorizedSessionLogPath, findSession } from '../_shared/session-finder.mjs'
import { parseMaintenanceArgs, createMaintenanceContext } from '../_shared/workspace-paths.mjs'
import { createOutput, summarizeValue } from '../_shared/test-output.mjs'

const maintenanceArgs = parseMaintenanceArgs(process.argv.slice(2))
const maintenanceContext = createMaintenanceContext(maintenanceArgs)
const argv = maintenanceArgs.domainArgv

export function positionalArgsOf(args = []) {
  const positional = []
  for (let index = 0; index < args.length; index += 1) {
    const arg = String(args[index])
    if (arg === '--compact' || arg === '--verbose' || arg === '--full') continue
    if (arg === '--output-mode') { index += 1; continue }
    if (arg.startsWith('--output-mode=')) continue
    positional.push(arg)
  }
  return positional
}

const output = createOutput({ argv })
const found = findSession(positionalArgsOf(argv)[0], { maintenanceContext })
if (found.kind === 'none') { console.log('NOT-RUN：未显式选择会话；未读取会话日志'); process.exitCode = 0 }
else if (found.kind === 'unavailable') { console.log('NOT-RUN：会话 Host 根不可用；' + found.reason); process.exitCode = 0 }
else if (found.kind === 'incomplete') { console.error('INCOMPLETE ' + found.reason); process.exit(1) }
else if (found.kind === 'notfound') { console.error('未找到日志：', found.arg); process.exit(1) }
if (found.kind === 'none' || found.kind === 'unavailable') process.exit(0)
for (const dir of found.dirs) {
  console.log(`\n===== 会话 ${dir} =====`)
  const lp = authorizedSessionLogPath(path.join(found.base, dir), found.pathContext, { kind: found.pathKind }); if (lp === null) { console.error('会话日志文件不存在（三代候选名均未命中）：', path.join(found.base, dir)); continue }
  const buf = fs.readFileSync(lp.realPath)
  let incompleteReasons = []
  let recordCount = 0
  const types = {}
  const presetEvents = []
  const planEvents = []
  const headers = []
  try {
    for (const { lineNo, line: raw } of decodedJsonlLines(buf)) {
      const line = raw.trim()
      if (!line) continue
      let ev
      try {
        ev = JSON.parse(line)
      } catch (error) {
        incompleteReasons.push('L' + lineNo + ' invalid JSON: ' + (error instanceof Error ? error.message : String(error)))
        continue
      }
      recordCount += 1
      const t = ev.type
      const keys = Array.isArray(t) ? t : [t]
      for (const k of keys) { const s = String(k); types[s] = (types[s] || 0) + 1 }
      const joined = keys.join('|')
      if (joined.includes('agent-preset')) {
        presetEvents.push({ line: lineNo, type: joined, data: JSON.stringify(ev.data) })
      }
      if (joined === 'plan/mode') planEvents.push({ line: lineNo, data: JSON.stringify(ev.data) })
      if (joined === 'request/header') {
        const h = (ev.data && ev.data.header) || ev.data || {}
        headers.push({ line: lineNo, model: h.config && h.config.model, ntools: Array.isArray(h.tools) ? h.tools.length : 0 })
      }
    }
  } catch (error) {
    incompleteReasons.push(error instanceof Error ? error.message : String(error))
  }
  if (recordCount === 0) incompleteReasons.push('no JSON records')
  console.log('事件类型计数：', JSON.stringify(types))
  if (output.mode === 'full') {
    console.log('--- agent-preset 相关事件 ---')
    for (const e of presetEvents) console.log(`L${e.line} ${e.type} ${e.data}`)
    console.log('--- plan/mode 事件 ---')
    for (const e of planEvents) console.log(`L${e.line} ${e.data}`)
  } else {
    console.log('--- agent-preset 相关事件 count=' + presetEvents.length + ' ---')
    for (const e of presetEvents) console.log(`L${e.line} ${e.type}`)
    console.log('--- plan/mode 事件 count=' + planEvents.length + ' ---')
    for (const e of planEvents) {
      let parsed
      try { parsed = JSON.parse(e.data) } catch { parsed = { textLength: e.data.length } }
      console.log('L' + e.line + ' summary=' + JSON.stringify(summarizeValue(parsed)))
    }
  }
  console.log('--- request/header 摘要 ---')
  for (const e of headers) console.log(`L${e.line} model=${e.model} tools=${e.ntools}`)
  if (incompleteReasons.length > 0) {
    console.log('INCOMPLETE ' + incompleteReasons.join('; '))
    process.exitCode = 1
  }
}