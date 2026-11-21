// step-06-真实会话查看.mjs — 只读显式选择的 extra-plan 会话冒烟取证。
// 用法: node step-06-真实会话查看.mjs [<会话目录名或路径>] [--session <ID> --sessions-dir <根>]；无选择=NOT-RUN，不扫描会话目录。
// 输出: 每个会话的 request/header（model/effort/tools 数）、pwsh 调用命令与拒绝、
//       subagent_plan/ask 调用与结果摘要、error/retry 相关事件。
import fs from 'node:fs'
import path from 'node:path'
import { decodedJsonlLines } from '../_shared/zstd-frames.mjs'
import { authorizedSessionLogPath, findSession } from '../_shared/session-finder.mjs'
import { parseMaintenanceArgs, createMaintenanceContext } from '../_shared/workspace-paths.mjs'
import { toolResultOf } from '../_shared/v4-tool-result.mjs'

const maintenanceArgs = parseMaintenanceArgs(process.argv.slice(2))
const maintenanceContext = createMaintenanceContext(maintenanceArgs)
const explicit = maintenanceArgs.domainArgv.find((value) => !String(value).startsWith('--'))
const found = findSession(explicit, { maintenanceContext })
if (found.kind === 'none') { console.log('NOT-RUN：未显式选择会话；未读取会话日志'); process.exit(0) }
if (found.kind === 'unavailable') { console.log('NOT-RUN：会话 Host 根不可用；' + found.reason); process.exit(0) }
if (found.kind === 'incomplete') { console.error('INCOMPLETE ' + found.reason); process.exit(1) }
if (found.kind === 'notfound') { console.error('未找到目录：', found.arg); process.exit(1) }

let invalidLog = false
for (const dir of found.dirs) {
  console.log(`\n===== 会话 ${dir} =====`)
  const lp = authorizedSessionLogPath(path.join(found.base, dir), found.pathContext, { kind: found.pathKind, names: ['session.v4.jsonl.zstd'] }); if (lp === null) { invalidLog = true; console.error('仅支持 v4 会话日志：目标日志必须是 session.v4.jsonl.zstd：', path.join(found.base, dir)); continue }
  const buf = fs.readFileSync(lp.realPath)
  let recordCount = 0
  try {
    for (const { lineNo, line: raw } of decodedJsonlLines(buf)) {
      const line = raw.trim()
      if (!line) continue
      let ev
      try {
        ev = JSON.parse(line)
      } catch (error) {
        invalidLog = true
        console.error('INCOMPLETE L' + lineNo + ' invalid JSON: ' + (error instanceof Error ? error.message : String(error)))
        continue
      }
      const validEvent = ev !== null && typeof ev === 'object' && !Array.isArray(ev) && (
        (typeof ev.type === 'string' && ev.type.length > 0) ||
        (Array.isArray(ev.type) && ev.type.length > 0 && ev.type.every((value) => typeof value === 'string' && value.length > 0))
      )
      if (!validEvent) {
        invalidLog = true
        console.error('INCOMPLETE L' + lineNo + ' invalid event structure')
        continue
      }
      recordCount += 1
      const t = ev.type
      const data = ev.data ?? {}
      const trunc = (s, n) => (typeof s !== 'string' ? s : s.length > n ? s.slice(0, n) + '…' : s)
      const isCompound = Array.isArray(t)
      const hasType = (type) => isCompound ? t.includes(type) : t === type
      const dataObject = data !== null && typeof data === 'object' && !Array.isArray(data) ? data : null
      const nestedHeader = dataObject && dataObject.header !== null && typeof dataObject.header === 'object' && !Array.isArray(dataObject.header) ? dataObject.header : null
      if (hasType('request/header')) {
        if (!isCompound) {
          const h = data.header || {}
          console.log('L' + lineNo + ' HEADER model=' + h.config?.model + ' effort=' + (h.config?.reasoningEffort ?? '-') + ' tools=' + (h.tools || []).length)
        } else if (nestedHeader !== null) {
          const config = nestedHeader.config !== null && typeof nestedHeader.config === 'object' && !Array.isArray(nestedHeader.config) ? nestedHeader.config : null
          const model = config && typeof config.model === 'string' && config.model.length > 0 ? config.model : undefined
          const effort = config && typeof config.reasoningEffort === 'string' && config.reasoningEffort.length > 0 ? config.reasoningEffort : undefined
          const tools = Array.isArray(nestedHeader.tools) ? nestedHeader.tools.length : null
          if (model !== undefined || effort !== undefined || tools !== null) console.log('L' + lineNo + ' HEADER model=' + model + ' effort=' + (effort ?? '-') + ' tools=' + (tools === null ? 'unknown' : tools))
        }
      }
      if (hasType('tool/call')) {
        if (!isCompound) {
          if (data.name === 'pwsh') {
            let cmd = ''
            try { cmd = JSON.parse(data.arguments || '{}').command ?? '' } catch { cmd = String(data.arguments) }
            console.log('L' + lineNo + ' PWSH-CALL ' + trunc(cmd, 220))
          } else if (data.name === 'subagent_plan' || data.name === 'ask_user_question' || data.name === 'send_message' || data.name === 'subagent' || data.name === 'subagent_review' || data.name === 'subagent_probe') {
            console.log('L' + lineNo + ' CALL ' + data.name + ' ' + trunc(data.arguments, 220))
          }
        } else {
          const argumentsText = typeof data.arguments === 'string' ? data.arguments : null
          if (data.name === 'pwsh') {
            let cmd = ''
            if (argumentsText !== null) {
              try {
                const parsed = JSON.parse(argumentsText)
                if (parsed !== null && typeof parsed === 'object' && !Array.isArray(parsed) && typeof parsed.command === 'string' && parsed.command.length > 0) cmd = parsed.command
              } catch {}
            }
            if (cmd.length > 0) console.log('L' + lineNo + ' PWSH-CALL ' + trunc(cmd, 220))
          } else if ((data.name === 'subagent_plan' || data.name === 'ask_user_question' || data.name === 'send_message' || data.name === 'subagent' || data.name === 'subagent_review' || data.name === 'subagent_probe') && argumentsText !== null && argumentsText.length > 0) {
            console.log('L' + lineNo + ' CALL ' + data.name + ' ' + trunc(argumentsText, 220))
          }
        }
      }
      if (hasType('tool/result')) {
        const result = toolResultOf(ev)
        if (result !== null && result.isError === true) console.log('L' + lineNo + ' TOOL-ERROR ' + trunc(result.text || 'tool result isError=true', 260))
      }
      if (!isCompound && typeof t === 'string' && /retry|error|failed/i.test(t)) {
        console.log('L' + lineNo + ' EVENT[' + t + '] ' + trunc(JSON.stringify(data), 300))
      }
    }
  } catch (error) {
    invalidLog = true
    console.error('INCOMPLETE ' + (error instanceof Error ? error.message : String(error)))
  }
  if (recordCount === 0) {
    invalidLog = true
    console.error('INCOMPLETE no valid events')
  }
}
process.exitCode = invalidLog ? 1 : 0
