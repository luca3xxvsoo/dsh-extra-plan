// print-header-tools.mjs — 打印指定会话全部 request/header 的 tools 名称列表
// 用法: node print-header-tools.mjs <session-dir-name>
import fs from 'node:fs'
import path from 'node:path'
import { homedir } from 'node:os'
import { zstdDecompressSync } from 'node:zlib'

const DSH_HOME = (process.env.DSH_HOME || homedir() + '/.dsh').replaceAll('\\', '/')
const base = DSH_HOME + '/sessions/--E-Soft-AI~9879~76EE-~516C~7528~9879~76EE--'
const dir = process.argv[2]
const p = path.join(base, dir, 'session.jsonl.zstd')
const buf = fs.readFileSync(p)
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
