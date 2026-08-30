// step-05-会话解码.mjs（原 decode-session.mjs）— 解码会话日志，输出事件类型统计、预设相关事件、plan/mode、request/header 摘要
// 用法: node step-05-会话解码.mjs [<会话目录名>]  |  无参=自动查找最新主会话+子会话；
//       设置环境变量 SESSION_ID=<会话ID>（uuid / session-uuid / 目录名皆兼容）按 ID 精确定位（主会话连带其子会话）
import fs from 'node:fs'
import path from 'node:path'
import { zstdDecompressSync } from 'node:zlib'
import { framesOf } from './_shared/zstd-frames.mjs'
import { findSession } from './_shared/session-finder.mjs'

const found = findSession(process.argv[2])
if (found.kind === 'notfound') { console.error('log not found:', found.arg); process.exit(1) }
if (found.kind === 'none') { console.error('未发现使用过按需规划模式的会话'); process.exit(1) }
for (const dir of found.dirs) {
  console.log(`\n===== 会话 ${dir} =====`)
  const buf = fs.readFileSync(path.join(found.base, dir, 'session.jsonl.zstd'))
  const frames = framesOf(buf)
  let lineNo = 0
  const types = {}
  const presetEvents = []
  const planEvents = []
  const headers = []
  for (const f of frames) {
    const text = zstdDecompressSync(buf.subarray(f.start, f.end)).toString('utf8')
    for (const raw of text.split('\n')) {
      lineNo++
      const line = raw.trim()
      if (!line) continue
      let ev
      try { ev = JSON.parse(line) } catch { continue }
      const t = ev.type
      const keys = Array.isArray(t) ? t : [t]
      for (const k of keys) { const s = String(k); types[s] = (types[s] || 0) + 1 }
      const joined = keys.join('|')
      if (joined.includes('agent-preset')) {
        presetEvents.push({ line: lineNo, type: joined, data: JSON.stringify(ev.data).slice(0, 240) })
      }
      if (joined === 'plan/mode') planEvents.push({ line: lineNo, data: JSON.stringify(ev.data) })
      if (joined === 'request/header') {
        const h = (ev.data && ev.data.header) || ev.data || {}
        headers.push({ line: lineNo, model: h.config && h.config.model, ntools: Array.isArray(h.tools) ? h.tools.length : 0 })
      }
    }
  }
  console.log('type counts:', JSON.stringify(types))
  console.log('--- agent-preset related events ---')
  for (const e of presetEvents) console.log(`L${e.line} ${e.type} ${e.data}`)
  console.log('--- plan/mode ---')
  for (const e of planEvents) console.log(`L${e.line} ${e.data}`)
  console.log('--- request/header summaries ---')
  for (const e of headers) console.log(`L${e.line} model=${e.model} tools=${e.ntools}`)
}
