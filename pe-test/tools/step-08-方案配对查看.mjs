// step-08-方案配对查看.mjs — 定位 save_plan 的 call/result 配对及错误。
// 用法: node step-08-方案配对查看.mjs [sessions-dir|会话目录名|路径]
import fs from 'node:fs'
import path from 'node:path'
import { framesOf, decodeText } from '../_shared/zstd-frames.mjs'
import { findSession } from '../_shared/session-finder.mjs'
import { toolResultOf, v4LogPath } from '../_shared/v4-tool-result.mjs'

const found = findSession(process.argv[2])
if (found.kind === 'notfound') { console.error('未找到目录：', found.arg); process.exit(1) }
if (found.kind === 'none') { console.error('未发现使用过按需规划模式的会话'); process.exit(1) }
let invalidLog = false
let unmatchedCount = 0
for (const dir of found.dirs) {
  console.log(`===== ${dir} =====`)
  const lp = v4LogPath(path.join(found.base, dir)); if (!lp) { invalidLog = true; console.error('仅支持 v4 会话日志：目标日志必须是 session.v4.jsonl.zstd：', path.join(found.base, dir)); continue }
  const buf = fs.readFileSync(lp)
  const lines = []
  for (const f of framesOf(buf)) lines.push(...decodeText(buf, f).split('\n'))
  const calls = new Map()
  for (let i = 0; i < lines.length; i++) {
    let ev
    try { ev = JSON.parse(lines[i]) } catch { continue }
    if (ev.type === 'tool/call' && ev.data?.name === 'save_plan') {
      const callId = ev.data.callId
      let keys = []
      try { keys = Object.keys(JSON.parse(ev.data.arguments)) } catch {}
      console.log(`L${i + 1} save_plan CALL id=${callId} 参数键=[${keys.join(',')}]`)
      calls.set(callId, i + 1)
    } else if (ev.type === 'tool/result') {
      const result = toolResultOf(ev)
      if (result !== null && calls.has(result.callId)) {
        calls.delete(result.callId)
        const txt = (result.text || '<无 text block>').slice(0, 160)
        console.log(`  → L${i + 1} 结果 ${result.isError ? 'ERROR' : 'OK'}: ${txt}`)
      }
    }
  }
  for (const [callId, at] of calls) {
    unmatchedCount += 1
    console.log(`\u001b[31m🔴 未配对 调用 L${at}（id=${callId}）\u001b[0m`)
  }
}
process.exitCode = invalidLog || unmatchedCount > 0 ? 1 : 0
