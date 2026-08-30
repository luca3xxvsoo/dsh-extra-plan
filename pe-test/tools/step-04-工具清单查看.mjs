// step-04-工具清单查看.mjs（原 print-header-tools.mjs）— 打印指定会话全部 request/header 的 tools 名称列表
// 用法: node step-04-工具清单查看.mjs [<会话目录名>]
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
  for (const f of frames) {
    const text = zstdDecompressSync(buf.subarray(f.start, f.end)).toString('utf8')
    for (const raw of text.split('\n')) {
      lineNo++
      const line = raw.trim()
      if (!line) continue
      let ev
      try { ev = JSON.parse(line) } catch { continue }
      const joined = (Array.isArray(ev.type) ? ev.type : [ev.type]).join('|')
      if (joined === 'request/header') {
        const h = (ev.data && ev.data.header) || ev.data || {}
        const tools = Array.isArray(h.tools) ? h.tools.map((x) => (typeof x === 'string' ? x : x.name)) : []
        console.log(`L${lineNo} model=${h.config && h.config.model} tools(${tools.length})=${tools.join(', ')}`)
      }
    }
  }
}
