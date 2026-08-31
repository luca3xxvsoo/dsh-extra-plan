// step-06-真实会话查看.mjs（原 smoke-forensics-extra-plan.mjs）— extra-plan 冒烟会话取证
// 用法: node step-06-真实会话查看.mjs [sessions-dir|会话目录名|路径]
// 输出: 每个会话的 request/header（model/effort/tools 数）、pwsh 调用命令与拒绝、
//       subagent_plan/ask 调用与结果摘要、error/retry 相关事件。
import fs from 'node:fs'
import path from 'node:path'
import { zstdDecompressSync } from 'node:zlib'
import { framesOf } from './_shared/zstd-frames.mjs'
import { findSession } from './_shared/session-finder.mjs'

const found = findSession(process.argv[2])
if (found.kind === 'notfound') { console.error('dir not found:', found.arg); process.exit(1) }
if (found.kind === 'none') { console.error('未发现使用过按需规划模式的会话'); process.exit(1) }

for (const dir of found.dirs) {
  console.log(`\n===== 会话 ${dir} =====`)
  const buf = fs.readFileSync(path.join(found.base, dir, 'session.jsonl.zstd'))
  let lineNo = 0
  for (const f of framesOf(buf)) {
    const text = zstdDecompressSync(buf.subarray(f.start, f.end)).toString('utf8')
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
        const err = data.error
        const reason = err ? trunc(String(err.reason || err.message || JSON.stringify(err)), 260) : ''
        if (reason !== '') console.log(`L${lineNo} TOOL-ERROR ${trunc(reason, 260)}`)
      } else if (typeof t === 'string' && /retry|error|failed/i.test(t)) {
        console.log(`L${lineNo} EVENT[${t}] ${trunc(JSON.stringify(data), 300)}`)
      }
    }
  }
}
