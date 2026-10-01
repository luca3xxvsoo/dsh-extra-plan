// step-06-真实会话查看.mjs — 只读 extra-plan 会话冒烟取证。
// 用法: node step-06-真实会话查看.mjs [sessions-dir|会话目录名|路径]
// 输出: 每个会话的 request/header（model/effort/tools 数）、pwsh 调用命令与拒绝、
//       subagent_plan/ask 调用与结果摘要、error/retry 相关事件。
import fs from 'node:fs'
import path from 'node:path'
import { framesOf, decodeText } from '../_shared/zstd-frames.mjs'
import { findSession } from '../_shared/session-finder.mjs'
import { toolResultOf, v4LogPath } from '../_shared/v4-tool-result.mjs'

const found = findSession(process.argv[2])
if (found.kind === 'notfound') { console.error('未找到目录：', found.arg); process.exit(1) }
if (found.kind === 'none') { console.error('未发现使用过按需规划模式的会话'); process.exit(1) }

let invalidLog = false
for (const dir of found.dirs) {
  console.log(`\n===== 会话 ${dir} =====`)
  const lp = v4LogPath(path.join(found.base, dir)); if (!lp) { invalidLog = true; console.error('仅支持 v4 会话日志：目标日志必须是 session.v4.jsonl.zstd：', path.join(found.base, dir)); continue }
  const buf = fs.readFileSync(lp)
  let lineNo = 0
  for (const f of framesOf(buf)) {
    const text = decodeText(buf, f)
    for (const raw of text.split('\n')) {
      lineNo++
      const line = raw.trim()
      if (!line) continue
      let ev
      try { ev = JSON.parse(line) } catch { continue }
      const t = ev.type
      const data = ev.data ?? {}
      const trunc = (s, n) => (typeof s !== 'string' ? s : s.length > n ? s.slice(0, n) + '…' : s)
      if (t === 'request/header') {
        const h = data.header || {}
        console.log(`L${lineNo} HEADER model=${h.config?.model} effort=${h.config?.reasoningEffort ?? '-'} tools=${(h.tools || []).length}`)
      } else if (t === 'tool/call') {
        if (data.name === 'pwsh') {
          let cmd = ''
          try { cmd = JSON.parse(data.arguments || '{}').command ?? '' } catch { cmd = String(data.arguments) }
          console.log(`L${lineNo} PWSH-CALL ${trunc(cmd, 220)}`)
        } else if (data.name === 'subagent_plan' || data.name === 'ask_user_question' || data.name === 'send_message' || data.name === 'subagent' || data.name === 'subagent_review' || data.name === 'subagent_probe') {
          console.log(`L${lineNo} CALL ${data.name} ${trunc(data.arguments, 220)}`)
        }
      } else if (t === 'tool/result') {
        const result = toolResultOf(ev)
        if (result !== null && result.isError === true) console.log(`L${lineNo} TOOL-ERROR ${trunc(result.text || 'tool result isError=true', 260)}`)
      } else if (typeof t === 'string' && /retry|error|failed/i.test(t)) {
        console.log(`L${lineNo} EVENT[${t}] ${trunc(JSON.stringify(data), 300)}`)
      }
    }
  }
}
process.exitCode = invalidLog ? 1 : 0
