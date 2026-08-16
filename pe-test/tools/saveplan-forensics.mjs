// saveplan-forensics.mjs — 精确定位 save_plan 的 call/result 配对与错误
import fs from 'node:fs'
import { homedir } from 'node:os'
const DSH_HOME = (process.env.DSH_HOME || homedir() + '/.dsh').replaceAll('\\', '/')
const base = DSH_HOME + '/sessions/--E-Soft-AI~9879~76EE-extra-plan-smoke--'
for (const dir of fs.readdirSync(base)) {
  const decoded = `${base}/${dir}/decoded.txt`
  if (!fs.existsSync(decoded)) continue
  console.log(`===== ${dir} =====`)
  const lines = fs.readFileSync(decoded, 'utf8').split('\n')
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
