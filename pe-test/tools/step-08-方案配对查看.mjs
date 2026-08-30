// step-08-方案配对查看.mjs（原 saveplan-forensics.mjs）— 精确定位 save_plan 的 call/result 配对与错误
// 用法: node step-08-方案配对查看.mjs [sessions-dir|会话目录名|路径]
import fs from 'node:fs'
import path from 'node:path'
import { framesOf, decodeText } from './_shared/zstd-frames.mjs'
import { findSession } from './_shared/session-finder.mjs'

const found = findSession(process.argv[2])
if (found.kind === 'notfound') { console.error('dir not found:', found.arg); process.exit(1) }
if (found.kind === 'none') { console.error('未发现使用过按需规划模式的会话'); process.exit(1) }
for (const dir of found.dirs) {
  console.log(`===== ${dir} =====`)
  const buf = fs.readFileSync(path.join(found.base, dir, 'session.jsonl.zstd'))
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
      const envelope = ev.data?.message?.content?.[0]
      const callId = envelope?.toolCallId
      if (callId && calls.has(callId)) {
        calls.delete(callId)
        if (ev.data.error) {
          console.log(`  → L${i + 1} 结果 ERROR: ${JSON.stringify(ev.data.error).slice(0, 400)}`)
        } else {
          const inner = envelope.content
          const txt = Array.isArray(inner) ? inner.map((b) => (typeof b === 'object' && b !== null && typeof b.text === 'string' ? b.text : '')).join('') : JSON.stringify(inner).slice(0, 160)
          console.log(`  → L${i + 1} 结果 OK: ${txt.slice(0, 160)}`)
        }
      }
    }
  }
  for (const [callId, at] of calls) console.log(`  → 调用 L${at}（id=${callId}）未找到配对结果（可能仍挂起/被中断）`)
}
