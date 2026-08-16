// smoke-forensics-extra-plan.mjs — extra-plan 冒烟会话取证
// 用法: node smoke-forensics-extra-plan.mjs [sessions-dir]
// 输出: 每个会话的 request/header（model/effort/tools 数）、pwsh 调用命令与拒绝、
//       subagent_plan/ask 调用与结果摘要、error/retry 相关事件。
import fs from 'node:fs'
import path from 'node:path'
import { homedir } from 'node:os'
import { zstdDecompressSync } from 'node:zlib'

const DSH_HOME = (process.env.DSH_HOME || homedir() + '/.dsh').replaceAll('\\', '/')
const base = process.argv[2] || DSH_HOME + '/sessions/--E-Soft-AI~9879~76EE-extra-plan-smoke--'
if (!fs.existsSync(base)) { console.error('dir not found:', base); process.exit(1) }

function framesOf(buf) {
  const MAGIC = 0xfd2fb528
  const frames = []
  let pos = 0
  while (pos + 4 <= buf.length) {
    if (buf.readUInt32LE(pos) !== MAGIC) { pos++; continue }
    let q = pos + 4
    const desc = buf[q]
    if (desc === undefined) break
    q++
    const singleSeg = (desc >> 5) & 1
    const fcsFlag = (desc >> 6) & 3
    const dictFlag = desc & 3
    const checksum = (desc >> 2) & 1
    if (!singleSeg) q += 1
    q += dictFlag === 1 ? 1 : dictFlag === 2 ? 2 : dictFlag === 3 ? 4 : 0
    if (fcsFlag) q += fcsFlag === 1 ? 2 : fcsFlag === 2 ? 4 : 8
    else if (singleSeg) q += 1
    let last = false
    while (!last) {
      if (q + 3 > buf.length) { q = buf.length + 5; break }
      const bh = buf.readUIntLE(q, 3)
      const bt = (bh >> 1) & 3
      const bs = bh >> 3
      if (bt === 3 || bs > 0x20000) { q = buf.length + 5; break }
      last = (bh & 1) === 1
      q += 3 + bs
    }
    if (checksum) q += 4
    if (q <= buf.length) { frames.push({ start: pos, end: q }); pos = q }
    else break
  }
  return frames
}

const dirs = fs.readdirSync(base).filter((d) => fs.existsSync(path.join(base, d, 'session.jsonl.zstd')))
for (const dir of dirs) {
  console.log(`\n===== 会话 ${dir} =====`)
  const buf = fs.readFileSync(path.join(base, dir, 'session.jsonl.zstd'))
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
        } else if (data.name === 'subagent_plan' || data.name === 'ask_user_question' || data.name === 'send_message' || data.name === 'subagent' || data.name === 'subagent_review') {
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
