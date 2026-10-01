// _shared/v4-tool-result.mjs — v4 会话 tool/result 纯解析
import fs from 'node:fs'
import path from 'node:path'

const V4_LOG_NAME = 'session.v4.jsonl.zstd'
const isObject = (value) => value !== null && typeof value === 'object' && !Array.isArray(value)

function isToolResultType(value) {
  return value === 'tool/result' || (Array.isArray(value) && value.includes('tool/result'))
}

export function isV4SessionFile(file) {
  return typeof file === 'string' && path.basename(file) === V4_LOG_NAME
}

export function v4LogPath(directory) {
  if (typeof directory !== 'string' || directory === '') return null
  const file = path.join(directory, V4_LOG_NAME)
  return fs.existsSync(file) && isV4SessionFile(file) ? file : null
}

export function toolResultOf(event) {
  if (!isObject(event) || !isToolResultType(event.type) || !isObject(event.data)) return null
  const message = event.data.message
  if (!isObject(message) || typeof message.toolCallId !== 'string' || typeof message.isError !== 'boolean' || !Array.isArray(message.content)) return null
  const text = message.content.map((block) => isObject(block) && block.type === 'text' && typeof block.text === 'string' ? block.text : '').join('')
  return { callId: message.toolCallId, isError: message.isError, text }
}
