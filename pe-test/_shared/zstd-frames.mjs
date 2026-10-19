// _shared/zstd-frames.mjs — 会话日志 zstd 帧解析（step-04/05/06 取证工具共用）
// step-04/05/06 取证工具共用 frame parser；调用方依赖 frame boundary。
import { zstdDecompressSync } from 'node:zlib'

// 起点 magic 已由调用方验证；只解析这一帧，缺损/非法块边界返回 null。
function frameEndAt(buf, start) {
  let q = start + 4
  const desc = buf[q]
  if (desc === undefined) return null
  q += 1
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
    if (q + 3 > buf.length) return null
    const bh = buf.readUIntLE(q, 3)
    const bt = (bh >> 1) & 3
    const bs = bh >> 3
    if (bt === 3 || bs > 0x20000) return null
    last = (bh & 1) === 1
    // RLE 的 Block_Size 是解压后长度，压缩载荷仅 1 字节。
    const payloadSize = bt === 1 ? 1 : bs
    if (q + 3 + payloadSize > buf.length) return null
    q += 3 + payloadSize
  }
  if (checksum) q += 4
  return q <= buf.length ? q : null
}

export function framesOf(buf) {
  const MAGIC = 0xfd2fb528
  const frames = []
  let pos = 0
  while (pos + 4 <= buf.length) {
    if (buf.readUInt32LE(pos) !== MAGIC) { pos++; continue }
    const end = frameEndAt(buf, pos)
    if (end === null) break
    frames.push({ start: pos, end })
    pos = end
  }
  return frames
}

export function decodeText(buf, frame) {
  return zstdDecompressSync(buf.subarray(frame.start, frame.end)).toString('utf8')
}

const ZSTD_MAGIC = 0xfd2fb528
const SKIPPABLE_MIN = 0x184d2a50
const SKIPPABLE_MAX = 0x184d2a5f

function* decompressedFrameBytes(buf) {
  let cursor = 0
  let regularFrames = 0
  while (cursor < buf.length) {
    if (buf.length - cursor < 4) throw new Error('truncated frame header at byte ' + cursor)
    const magic = buf.readUInt32LE(cursor)
    if (magic >= SKIPPABLE_MIN && magic <= SKIPPABLE_MAX) {
      if (buf.length - cursor < 8) throw new Error('truncated skippable frame header at byte ' + cursor)
      const end = cursor + 8 + buf.readUInt32LE(cursor + 4)
      if (end > buf.length) throw new Error('truncated skippable frame at byte ' + cursor)
      cursor = end
      continue
    }
    if (magic !== ZSTD_MAGIC) throw new Error('unexpected bytes at byte ' + cursor)
    const end = frameEndAt(buf, cursor)
    if (end === null) throw new Error('incomplete zstd frame at byte ' + cursor)
    let bytes
    try {
      bytes = zstdDecompressSync(buf.subarray(cursor, end))
    } catch (error) {
      throw new Error('zstd frame decode failed at byte ' + cursor + ': ' + (error instanceof Error ? error.message : String(error)))
    }
    regularFrames += 1
    yield bytes
    cursor = end
  }
  if (regularFrames === 0) throw new Error('no complete zstd frame')
}

export function* decodedJsonlLines(buf) {
  if (!Buffer.isBuffer(buf)) throw new TypeError('decodedJsonlLines requires a Buffer')
  const decoder = new TextDecoder('utf-8', { fatal: true })
  let pending = ''
  let lineNo = 0
  for (const bytes of decompressedFrameBytes(buf)) {
    pending += decoder.decode(bytes, { stream: true })
    let newline
    while ((newline = pending.indexOf(String.fromCharCode(10))) !== -1) {
      const line = pending.slice(0, newline)
      pending = pending.slice(newline + 1)
      lineNo += 1
      yield { lineNo, line }
    }
  }
  pending += decoder.decode()
  if (pending !== '') {
    lineNo += 1
    yield { lineNo, line: pending }
  }
}
