// step-08-方案配对查看.mjs — 定位显式选择 session 的 save_plan call/result 配对及错误。
// 用法: node step-08-方案配对查看.mjs [<会话目录名或路径>] [--session <ID> --sessions-dir <根>]；无选择=NOT-RUN，不扫描会话目录。
import fs from 'node:fs'
import path from 'node:path'
import { decodedJsonlLines } from '../_shared/zstd-frames.mjs'
import { authorizedSessionLogPath, findSession } from '../_shared/session-finder.mjs'
import { parseMaintenanceArgs, createMaintenanceContext } from '../_shared/workspace-paths.mjs'
import { toolResultOf } from '../_shared/v4-tool-result.mjs'

const maintenanceArgs = parseMaintenanceArgs(process.argv.slice(2))
const maintenanceContext = createMaintenanceContext(maintenanceArgs)
const explicit = maintenanceArgs.domainArgv.find((value) => !String(value).startsWith('--'))
const found = findSession(explicit, { maintenanceContext })
if (found.kind === 'none') { console.log('NOT-RUN：未显式选择会话；未读取会话日志'); process.exit(0) }
if (found.kind === 'unavailable') { console.log('NOT-RUN：会话 Host 根不可用；' + found.reason); process.exit(0) }
if (found.kind === 'incomplete') { console.error('INCOMPLETE ' + found.reason); process.exit(1) }
if (found.kind === 'notfound') { console.error('未找到目录：', found.arg); process.exit(1) }
let invalidLog = false
let unmatchedCount = 0
for (const dir of found.dirs) {
  console.log(`===== ${dir} =====`)
  const lp = authorizedSessionLogPath(path.join(found.base, dir), found.pathContext, { kind: found.pathKind, names: ['session.v4.jsonl.zstd'] }); if (lp === null) { invalidLog = true; console.error('仅支持 v4 会话日志：目标日志必须是 session.v4.jsonl.zstd：', path.join(found.base, dir)); continue }
  const buf = fs.readFileSync(lp.realPath)
  const calls = new Map()
  let recordCount = 0
  try {
    for (const { lineNo, line: raw } of decodedJsonlLines(buf)) {
      const line = raw.trim()
      if (!line) continue
      let ev
      try {
        ev = JSON.parse(line)
      } catch (error) {
        invalidLog = true
        console.error('INCOMPLETE L' + lineNo + ' invalid JSON: ' + (error instanceof Error ? error.message : String(error)))
        continue
      }
      recordCount += 1
      if (ev.type === 'tool/call' && ev.data?.name === 'save_plan') {
        const callId = ev.data.callId
        let keys = []
        try { keys = Object.keys(JSON.parse(ev.data.arguments)) } catch {}
        console.log('L' + lineNo + ' save_plan CALL id=' + callId + ' 参数键=[' + keys.join(',') + ']')
        calls.set(callId, lineNo)
      } else if (ev.type === 'tool/result') {
        const result = toolResultOf(ev)
        if (result !== null && calls.has(result.callId)) {
          calls.delete(result.callId)
          const txt = (result.text || '<无 text block>').slice(0, 160)
          console.log('  → L' + lineNo + ' 结果 ' + (result.isError ? 'ERROR' : 'OK') + ': ' + txt)
        }
      }
    }
  } catch (error) {
    invalidLog = true
    console.error('INCOMPLETE ' + (error instanceof Error ? error.message : String(error)))
  }
  if (recordCount === 0) {
    invalidLog = true
    console.error('INCOMPLETE no JSON records')
  }
  for (const [callId, at] of calls) {
    unmatchedCount += 1
    console.log(`\u001b[31m🔴 未配对 调用 L${at}（id=${callId}）\u001b[0m`)
  }
}
process.exitCode = invalidLog || unmatchedCount > 0 ? 1 : 0
