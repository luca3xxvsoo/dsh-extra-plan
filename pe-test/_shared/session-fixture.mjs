// _shared/session-fixture.mjs — step-06-08-v4取证回归专用夹具
// 本模块是 step-06-08-v4取证回归.mjs 专用的 v4 合成会话夹具构造器（session / request-header /
// tool-call / tool-result 事件、session.v4.jsonl.zstd 落盘、zstd 帧与多帧/可跳过帧构造）。
// 全仓唯一消费者即该脚本（step-06-08:11 import 全 11 项导出）。
// 仅依赖 node 内置模块（node:fs、node:path、node:zlib）与 ./zstd-frames.mjs；
// 不依赖断言设施与宿主包，函数体与参数与来源脚本逐字一致。
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { zstdCompressSync } from 'node:zlib'
import { decodeText, framesOf } from './zstd-frames.mjs'

const session = (id, fields = {}) => ({ type: 'session', data: { id, ...fields } })
const descriptor = () => ({ type: 'subagent/descriptor', data: { mode: 'continuable' } })
const call = (name, callId, argumentsValue = {}) => ({ type: 'tool/call', data: { name, callId, arguments: JSON.stringify(argumentsValue) } })
const canonicalResultMessage = (callId, isError, text) => ({
  id: 'result-' + callId,
  role: 'tool',
  source: { kind: 'tool', callId },
  toolCallId: callId,
  ...(isError === undefined ? {} : { isError }),
  content: [{ type: 'text', text }],
})
const result = (callId, isError, text) => ({ type: 'tool/result', data: { message: canonicalResultMessage(callId, isError, text) } })
const inboxResult = (callId, text) => ({ type: 'agent/inbox/spliced', data: { message: canonicalResultMessage(callId, true, text) } })
const badIdentityResult = (callId, text) => ({ type: 'tool/result', data: { message: { ...canonicalResultMessage(callId, true, text), source: { kind: 'tool', callId: 'other-' + callId } } } })

function writeSession(directory, fileName, events) {
  mkdirSync(directory, { recursive: true })
  const jsonl = events.map((event) => JSON.stringify(event)).join('\n') + '\n'
  writeFileSync(join(directory, fileName), zstdCompressSync(Buffer.from(jsonl, 'utf8')))
}

function replayJsonl(file) {
  const compressed = readFileSync(file)
  const frames = framesOf(compressed)
  let text = ''
  for (const frame of frames) text += decodeText(compressed, frame)
  const rows = text.split(/\r?\n/).filter((row) => row.trim() !== '')
  let invalid = 0
  for (const row of rows) {
    try { JSON.parse(row) } catch { invalid += 1 }
  }
  return { frameCount: frames.length, rowCount: rows.length, invalid }
}

function syntheticFrame(blocks, contentSize) {
  const header = Buffer.from([0x28, 0xb5, 0x2f, 0xfd, 0x20, contentSize])
  const parts = [header]
  for (const block of blocks) {
    const blockHeader = Buffer.alloc(3)
    const value = (block.size << 3) | (block.type << 1) | (block.last ? 1 : 0)
    blockHeader.writeUIntLE(value, 0, 3)
    parts.push(blockHeader, block.payload)
  }
  return Buffer.concat(parts)
}

function g5MultiFrame(raw, cuts) {
  const frames = []
  let start = 0
  for (const end of cuts) {
    if (end > start) frames.push(zstdCompressSync(raw.subarray(start, end)))
    start = end
  }
  if (start < raw.length) frames.push(zstdCompressSync(raw.subarray(start)))
  return Buffer.concat(frames)
}
function skippable(payload) {
  const frame = Buffer.alloc(8 + payload.length)
  frame.writeUInt32LE(0x184d2a50, 0)
  frame.writeUInt32LE(payload.length, 4)
  payload.copy(frame, 8)
  return frame
}

export { badIdentityResult, call, descriptor, g5MultiFrame, inboxResult, replayJsonl, result, session, skippable, syntheticFrame, writeSession }
