// @local/dsh-extra-plan planner budget helpers.
// Pure message, count, and budget-policy functions; FREE_TOOLS remains in index.js.

import { createUserMessage } from '@deepseek-ai/dsh-llm'
import { DEFAULT_EXPLORE_BUDGET } from './preset-defaults.generated.js'

export { DEFAULT_EXPLORE_BUDGET }

// 会话内 tool/call 成功配对计数（排除 skipNames，如 save_plan/send_message）——探查硬上限判据。
// 直呼 = tool/call + tool/result(ok) 配对；run_code 子调用由实例上限单独约束。
export function toolCallCount(events, skipNames) {
  if (!Array.isArray(events)) return 0
  const okCalls = new Set()
  for (const e of events) {
    if (e === null || typeof e !== 'object') continue
    if (e.type !== 'tool/result') continue
    const d = e.data
    if (d === null || typeof d !== 'object') continue
    if (d.error !== undefined && d.error !== null) continue
    const message = d.message
    if (message === null || typeof message !== 'object' || !Array.isArray(message.content)) continue
    for (const outer of message.content) {
      if (outer !== null && typeof outer === 'object' && outer.type === 'tool-result' && typeof outer.toolCallId === 'string' && outer.isError !== true) okCalls.add(outer.toolCallId)
    }
  }
  let count = 0
  for (const e of events) {
    if (e === null || typeof e !== 'object' || e.type !== 'tool/call') continue
    const d = e.data
    if (d === null || typeof d !== 'object' || typeof d.name !== 'string') continue
    if (skipNames !== undefined && skipNames.has(d.name)) continue
    if (typeof d.callId === 'string' && okCalls.has(d.callId)) count += 1
  }
  return count
}

// 自最近一条主会话 user/agent-message 锚点之后计数；无锚点时与 toolCallCount 同口径。
export function toolCallsSinceUser(events, skipNames) {
  if (!Array.isArray(events)) return 0
  let anchor = -1
  for (let i = events.length - 1; i >= 0; i -= 1) {
    const e = events[i]
    if (e === null || typeof e !== 'object' || e.type !== 'user/message') continue
    const d = e.data
    const kind = d !== null && typeof d === 'object' && d.source !== null && typeof d.source === 'object' ? d.source.kind : ''
    if (kind === 'user' || kind === 'agent-message') { anchor = i; break }
  }
  if (anchor === -1) return toolCallCount(events, skipNames)
  return toolCallCount(events.slice(anchor + 1), skipNames)
}

function appendSuffixBlock(message, text) {
  if (text === '') return message
  if (message === null || typeof message !== 'object') return message
  const src = message.source
  if (src === null || typeof src !== 'object' || (src.kind !== 'user' && src.kind !== 'agent-message')) return message
  if (!Array.isArray(message.content)) return message
  let target = -1
  for (let i = 0; i < message.content.length; i += 1) {
    const block = message.content[i]
    if (block === null || typeof block !== 'object' || block.type !== 'text' || typeof block.text !== 'string') continue
    if (block.text.indexOf(text) !== -1) return message
    if (target === -1) target = i
  }
  if (target === -1) return message
  const next = [...message.content]
  next[target] = { type: 'text', text: next[target].text + '\n' + text }
  return { ...message, content: next }
}

export function withPlannerPromptSuffix(message, suffix) {
  const r = appendSuffixBlock(message, suffix)
  if (!Array.isArray(r.content) || r.content.length <= 1) return r
  const first = r.content[0]
  if (first === null || typeof first !== 'object' || first.type !== 'text' || typeof first.text !== 'string') return r
  if (first.text.endsWith('\n')) return r
  return { ...r, content: [{ ...first, text: first.text + '\n' }, ...r.content.slice(1)] }
}

// 阈值固定 3（不进配置文件）。
export const BUDGET_REMINDER_THRESHOLD = 3

export function budgetNoticeText(budget) {
  return `本轮探查预算上限为 ${budget} 次工具调用。探查时 ≥ 2 个独立方向自行 read/glob/grep 分批核对；缺信息时输出「申请继续探查：<待查项> — <原因>」交主会话委派探查者。预算耗尽时输出「申请继续探查：<待查项> — <原因>」，主会话将探查待查项并转达线索文件路径，你读取线索继续工作。探查完成后直接调用 save_plan 落盘（系统会自动检测未探查项）`
}

export function withBudgetNotice(message, notice) { return appendSuffixBlock(message, notice) }

export function budgetReminderText(remaining, budget, threshold) {
  if (budget <= threshold) return ''
  if (remaining <= 0 || remaining > threshold) return ''
  return `本轮探查预算还剩 ${remaining} 次`
}

export function budgetReminderMessage(reminder) {
  return createUserMessage({ source: { kind: 'plugin', plugin: 'dsh-extra-plan' }, content: [{ type: 'text', text: reminder }] })
}

export function budgetReminderSent(events, marker) {
  if (!Array.isArray(events)) return false
  let anchor = -1
  for (let i = events.length - 1; i >= 0; i -= 1) {
    const e = events[i]
    if (e === null || typeof e !== 'object' || e.type !== 'user/message') continue
    const d = e.data
    const kind = d !== null && typeof d === 'object' && d.source !== null && typeof d.source === 'object' ? d.source.kind : ''
    if (kind === 'user' || kind === 'agent-message') { anchor = i; break }
  }
  for (let i = anchor + 1; i < events.length; i += 1) {
    const e = events[i]
    if (e === null || typeof e !== 'object' || e.type !== 'user/message') continue
    const d = e.data
    if (d === null || typeof d !== 'object' || !Array.isArray(d.content)) continue
    for (const block of d.content) {
      if (block !== null && typeof block === 'object' && block.type === 'text' && typeof block.text === 'string' && block.text.indexOf(marker) !== -1) return true
    }
  }
  return false
}

export function budgetExhaustedReason(used, budget) {
  return `探查预算已耗尽（本轮已用 ${used}/${budget}）：输出「申请继续探查：<待查项> — <原因>」。主会话将探查待查项并转达线索文件路径，你读取线索继续工作。探查完成则直接调用 save_plan 落盘。`
}

export function budgetExceeded(used, budget) {
  return used > budget
}
