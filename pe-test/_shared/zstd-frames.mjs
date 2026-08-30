// _shared/zstd-frames.mjs — 会话日志 zstd 帧解析（step-04/05/06 取证工具共用）
// 原实现曾分别在三个取证工具中复制，现抽为单点，避免格式升级需同步改三处。
import { zstdDecompressSync } from 'node:zlib'

export function framesOf(buf) {
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

export function decodeText(buf, frame) {
  return zstdDecompressSync(buf.subarray(frame.start, frame.end)).toString('utf8')
}
