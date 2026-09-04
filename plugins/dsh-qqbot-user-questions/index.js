// @local/dsh-qqbot-user-questions
// 为 qqbot 提供 userQuestions provider，让 extra-plan 的 ask_user_question
// 在 QQ 上真实问答往返，闸门语义完全保留。
//
// 设计依据（方案 v4 已探查核实）：
// - dsh-qqbot bootstrap.js 由主会话在步骤 2 中执行 ctx.provide 导出 bot 与 sessionManager
// - QQBot.js L349-353：消息链 = [...this.middlewares, emit('message')]，
//   bot.use() 注册的 middleware 天然先于 message 事件执行，不调 next() 即短路
// - session-manager.js L295-301：manager.findByAgent(agent) 反查 QQ peer record
// - dsh-extra-plan/index.js L76-80、L239-258：闸门用 indexOf 包含匹配固定词 label
import { UserQuestionError } from '@deepseek-ai/dsh-user-questions'
import { rm } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { createUserMessage } from '@deepseek-ai/dsh-llm'

export const name = 'dsh-qqbot-user-questions'
export const inject = ['qqbot.bot', 'qqbot.sessionManager', 'userQuestions']

export function apply(ctx, config) {
  const bot = ctx['qqbot.bot']
  const manager = ctx['qqbot.sessionManager']
  const userQuestions = ctx.userQuestions

  // ── 1.5) 解析会话持久化 root（~/.dsh/sessions 探测，不存在则跳过文件删除）──
  function resolveRoot() {
    const root = join(homedir(), '.dsh', 'sessions')
    if (existsSync(root)) return root
    console.warn('[dsh-qqbot-user-questions] 未找到可用的会话持久化目录，bot-reset/bot-new 将跳过文件删除')
    return null
  }
  const root = resolveRoot()

  // ── 1.6) Monkey-patch manager.remove：清内存之外额外删除持久化会话目录 ──
  // bot-reset/bot-clear/bot-new 都会调用 manager.remove（slashCommand 短路中间件链，
  // 无法用 bot.use 拦截），故在此统一包装：①取 sessionId → ②原始 remove → ③删目录。
  const originalRemove = manager.remove.bind(manager)

  manager.remove = async function (scope, peerId) {
    // 1) 在 remove 之前获取 sessionId
    const record = manager.getSessionRecord(scope, peerId)
    const sessionId = record?.sessionId

    // 2) 调用原始 remove（清内存）；异常正常传播，不吞掉
    await originalRemove(scope, peerId)

    // 3) 有 root 且 sessionId 时才删除整个会话目录（失败不阻断命令）
    if (root && sessionId) {
      await deleteSessionDir(sessionId, root).catch(err => {
        console.error('[dsh-qqbot-user-questions] 删除会话目录失败:', err.message)
      })
    }
  }

  // 审批 answerer 开关（默认关闭；由 cordis.patch.yml config 显式开启）
  const approvalEnabled = config.approvalEnabled ?? false

  // ── 待处理问题映射：key = `${scope}:${peerId}` → entry ──
  // entry = {
  //   resolve, reject, signal, cleanupSignal,
  //   questions,            // 原始 questions 数组
  //   questionIndex: 0,     // 当前正在问的问题下标（0 开始）
  //   collectedAnswers: [], // 已收集的答案数组
  //   scope, peerId,        // 用于发送问题消息
  // }
  const pending = new Map()

  // ── 审批 pending：key = `${scope}:${peerId}` → { resolve, signal, cleanupSignal } ──
  // 与 userQuestions pending 完全独立（entry 结构不同，语义不同）
  const approvalPending = new Map()

  // ── 1) 注册 QQBot middleware（拦截答案消息，单阶段队列逐题处理）──
  // QQBot.js L349-353：消息链 = [...this.middlewares, emit('message')]
  // bot.use() 注册的 middleware 天然先于 message 事件，不调 next() 即短路
  bot.use(async (mwCtx, next) => {
    const msg = mwCtx.message
    // 与 session-manager 的 scope/peerId 语义保持一致：
    // group 消息用 groupOpenid（回退 senderId），c2c 用 senderId
    const scope = msg.kind === 'group' ? 'group' : 'c2c'
    const peerId = scope === 'group' ? (msg.groupOpenid ?? msg.senderId) : msg.senderId
    const key = `${scope}:${peerId}`

    // ── /优先对话：把本次对话内容边界插入优先处理（静默，不回执）──
    const raw = msg.content ?? ''
    // 情况A：精确命令 "/优先对话"（5字符）→ 旧逻辑
    if (raw === '/优先对话') {
      if (scope === 'group' && !(mwCtx.state?.mention?.wasMentioned)) return
      const record = manager.getSessionRecord(scope, peerId)
      const agent = record?.agent
      if (agent === undefined || agent === null) return
      const inbox = agent.inbox
      if (inbox === undefined || inbox.nextTurn.length === 0) return
      if (agent.status !== 'running') return
      const [target] = inbox.splice('next-turn', 0, 1, [])
      if (target === undefined) return
      agent.steer(target)
      return
    }
    // 情况B：命令+空格/回车+非空内容 → 新逻辑
    if (typeof raw === 'string' && /^\/优先对话[\r\n ]/.test(raw)) {
      const body = raw.slice(5).trim()
      if (body.length === 0) return next()  // 仅空格/空白 → 不触发，当普通消息
      if (scope === 'group' && !(mwCtx.state?.mention?.wasMentioned)) return
      const record = manager.getSessionRecord(scope, peerId)
      const agent = record?.agent
      if (agent === undefined || agent === null) return
      const message = createUserMessage({
        content: [{ type: 'text', text: body }],
        source: { kind: 'user' },
      })
      if (agent.status === 'running') {
        agent.steer(message)   // 分支3：运行中 → 边界插入本条
      } else {
        agent.followup(message) // 分支2：空闲 → 正常入队唤醒
      }
      return  // 短路：不进 handleInbound、不回执
    }
    // 情况C：其他一切 → 不触发，继续往下走

    // ── 先检查审批 pending（审批优先于 userQuestions）──
    const approvalEntry = approvalPending.get(key)
    if (approvalEntry !== undefined) {
      const text = (msg.content ?? '').trim()
      if (text.length === 0) return next()  // 空消息放行，不消费审批 pending
      const outcome = text === '1' ? 'allowed-once' : 'rejected'  // 2/其他 → rejected（fail-closed）
      approvalPending.delete(key)
      if (approvalEntry.cleanupSignal) approvalEntry.cleanupSignal()
      approvalEntry.resolve(outcome)
      return  // 短路，消息不会到达后续处理器
    }

    const entry = pending.get(key)

    if (entry === undefined) {
      // 不是答案消息，放行给正常消息处理
      return next()
    }

    const text = (msg.content ?? '').trim()

    // ── 单阶段：队列逐题推进 ──
    // 只解析当前问题 entry.questions[entry.questionIndex]：
    //   1) parseSingleAnswer 解析单条回复（纯数字/越界/非数字/空）
    //   2) 空消息（answer === null）→ return next() 放行，不消费 pending
    //   3) 非空答案 → 记录 collectedAnswers、推进 questionIndex
    //   4) 未答完 → 发送下一题并保留 pending；全部答完 → resolve
    const q = entry.questions[entry.questionIndex]
    const answer = parseSingleAnswer(text, q)
    if (answer === null) return next()  // 空消息放行，不消费 pending

    entry.collectedAnswers.push(answer)
    entry.questionIndex += 1

    if (entry.questionIndex < entry.questions.length) {
      // 还有下一题：发送下一个问题，保留 pending 继续等待用户回复
      const nextText = formatSingleQuestion(
        entry.questions[entry.questionIndex],
        entry.questionIndex + 1,
        entry.questions.length
      )
      await bot.sendText({ scope: entry.scope, targetId: entry.peerId }, nextText.text)
    } else {
      // 全部答完：清理并 resolve
      pending.delete(key)
      if (entry.cleanupSignal) entry.cleanupSignal()
      entry.resolve({ answers: entry.collectedAnswers })
    }
    return  // 短路，消息不会到达 dsh-qqbot 的 message 事件处理器
  })

  // ── 2) 注册 userQuestions provider（双版本兼容）──
  // v0.1.1-rc.2：userQuestions.registerProvider({ ask }) 旧 API（返回卸载函数）；
  // v0.1.2-rc.1：registerProvider 已删除，应答者 = ctx.on('user-questions/request', handler)
  //（不调 next 即认领；handler throw 向上传播，NO_PROVIDER 口径两版等价）。
  async function providerAsk(request) {
    // 2a) 从 agent 反查 QQ peer（使用 SessionManager 现成方法 L295-301）
    const record = manager.findByAgent(request.agent)
    if (record === undefined) {
      throw new UserQuestionError(
        '无法找到该 agent 对应的 QQ 会话',
        'NO_PROVIDER'
      )
    }
    const scope = record.scope
    const peerId = record.peerId
    const key = `${scope}:${peerId}`

    // 2b) 空数组防御：没有问题直接返回空答案（不发送消息）
    if (!request.questions.length) return { answers: [] }

    // 2c) 只格式化并发送第一个问题，后续问题在队列中逐题询问
    const { text } = formatSingleQuestion(request.questions[0], 1, request.questions.length)
    await bot.sendText({ scope, targetId: peerId }, text)

    // 2d) 等待用户回复（Promise，逐题推进）
    // 队列式 entry：questionIndex 指向当前问题，collectedAnswers 累积答案；
    // 全部答完后由 middleware 清理 pending 并 resolve({ answers })
    return new Promise((resolve, reject) => {
      const entry = {
        resolve, reject,
        signal: request.signal,
        questions: request.questions,
        questionIndex: 0,
        collectedAnswers: [],
        cleanupSignal: undefined,
        scope, peerId,
      }

      // signal abort 处理（与 dsh 原生一致：无超时，取消靠 exec.signal）
      if (request.signal) {
        const onAbort = () => {
          pending.delete(key)
          reject(new UserQuestionError('ask_user_question 被取消', 'ASK_ABORTED'))
        }
        request.signal.addEventListener('abort', onAbort, { once: true })
        entry.cleanupSignal = () =>
          request.signal.removeEventListener('abort', onAbort)
      }

      pending.set(key, entry)
    })
  }
  let dispose
  if (typeof userQuestions.registerProvider === 'function') {
    dispose = userQuestions.registerProvider({ ask: providerAsk })
  } else {
    dispose = ctx.on('user-questions/request', async (request, next) => providerAsk(request))
  }

  // ── 2.5) 注册审批 answerer（受开关控制，默认关闭）──
  // ctx.on('approval/request') 是标准事件监听：服务未安装时事件永不触发，不会报错。
  if (approvalEnabled) {
    ctx.on('approval/request', async (req, next) => {
      // 反查 QQ peer；找不到说明不是我们的 agent，交还 next() 放行
      const record = manager.findByAgent(req.agent)
      if (record === undefined) return next()

      const scope = record.scope
      const peerId = record.peerId
      const key = `${scope}:${peerId}`

      // 发送审批消息到 QQ
      await bot.sendText(
        { scope, targetId: peerId },
        formatApprovalMessage(req)
      )

      // 等待用户回复（由中间件 resolve），signal abort → 'cancelled'
      return new Promise((resolve) => {
        const entry = { resolve, signal: req.signal, cleanupSignal: undefined }
        if (req.signal) {
          const onAbort = () => {
            approvalPending.delete(key)
            resolve('cancelled')
          }
          req.signal.addEventListener('abort', onAbort, { once: true })
          entry.cleanupSignal = () => req.signal.removeEventListener('abort', onAbort)
        }
        approvalPending.set(key, entry)
      })
    })
  }

  // ── 3) 生命周期清理 ──
  ctx.effect(() => {
    return () => {
      dispose()
      // 恢复原始 manager.remove，不留 Monkey-patch 残留
      manager.remove = originalRemove
      for (const [, entry] of pending) {
        entry.reject(new UserQuestionError('插件已卸载', 'NO_PROVIDER'))
      }
      pending.clear()
      // 审批 pending：无 reject，resolve 为 'unavailable'（fail-closed）
      for (const [, entry] of approvalPending) {
        entry.resolve('unavailable')
      }
      approvalPending.clear()
    }
  }, 'dsh-qqbot-user-questions.lifecycle')
}

// ── 辅助函数 ──

/**
 * 格式化单个问题为发送文本，返回 { text }。
 * 有选项问题：生成编号选项列表，提示回复数字或直接输入其他内容。
 * 无选项问题：生成补充说明模板，提示直接回复文本，无需补充请留空。
 */
function formatSingleQuestion(q, index, total) {
  const hasOptions = q.options && q.options.length > 0
  if (hasOptions) {
    const lines = [`📋 **请选择（${index}/${total}）：**`, '']
    if (q.header) lines.push(`**${q.header}**`)
    lines.push(q.question)
    q.options.forEach((opt, i) => lines.push(`${i + 1}. ${opt.label}`))
    lines.push('', '---', '请回复数字，或直接输入其他内容')
    return { text: lines.join('\n') }
  }
  const header = q.header || q.question
  const lines = [
    `📝 **补充说明（${index}/${total}）：${header}**`,
    '',
    q.question,
    '',
    '请直接回复文本内容，无需补充请留空。',
  ]
  return { text: lines.join('\n') }
}

/**
 * 解析单条回复，返回单个 answer 对象 { id, selected, custom } 或 null。
 * - 空消息（trim 后为空）：返回 null（放行，不消费 pending）
 * - 纯数字且在选项范围内：selected = [对应 label]，custom = undefined
 * - 纯数字但越界：selected = []，custom = 输入原文（视为默认意见）
 * - 非纯数字：selected = []，custom = 输入原文（视为用户意见）
 * - 无选项问题：selected 始终为 []，custom = 输入原文（空消息仍返回 null）
 */
function parseSingleAnswer(text, question) {
  const trimmed = text.trim()
  if (trimmed.length === 0) return null  // 空消息放行

  // 无选项问题：原文作为 custom 答案
  if (!question.options || question.options.length === 0) {
    return { id: question.id, selected: [], custom: text }
  }

  // 纯数字回复
  if (/^\d+$/.test(trimmed)) {
    const idx = parseInt(trimmed, 10) - 1
    if (idx >= 0 && idx < question.options.length) {
      return { id: question.id, selected: [question.options[idx].label], custom: undefined }
    }
    // 纯数字越界：视为默认意见
    return { id: question.id, selected: [], custom: text }
  }

  // 非纯数字：视为用户意见
  return { id: question.id, selected: [], custom: text }
}

/**
 * 格式化审批请求为 QQ 消息文本。
 * 含「1. 同意」「2. 拒绝」选项 + 工具名 + 原因；纯函数，不修改 req，无副作用。
 */
function formatApprovalMessage(req) {
  const lines = [
    '⚠️ **提权审批**',
    '',
    `工具：${req.toolName}`,
    `原因：${req.reason || '（无说明）'}`,
    '',
    '请选择：',
    '1. 同意',
    '2. 拒绝',
    '',
    '---',
    '回复数字 1 或 2',
  ]
  return lines.join('\n')
}

/**
 * 复刻 dsh-session-persistence-jsonl 的 encodeSegment（纯函数）：
 * `.` → ~002E、`..` → ~002E~002E；安全字符 [A-Za-z0-9._-]（除 ~ 外）保持原样；
 * 其余字符编码为 ~XXXX（四位大写十六进制）。空字符串抛错。
 * 保留原因：上游 @deepseek-ai/dsh-session-persistence-jsonl（0.1.2-rc.1）未公开导出
 * 此函数（仅导出 JsonlCompressionSchema/JsonlSessionPersistence），且本插件无
 * dependencies（自包含）无法依赖上游——上游语义变更须同步对齐（上游 lib/index.js L92）。
 */
function encodeSegment(raw) {
  if (raw.length === 0) throw new Error('cannot encode an empty path segment')
  if (raw === '.') return '~002E'
  if (raw === '..') return '~002E~002E'
  let out = ''
  for (let i = 0; i < raw.length; i++) {
    const code = raw.charCodeAt(i)
    const ch = String.fromCharCode(code)
    if (ch !== '~' && /^[A-Za-z0-9._-]$/.test(ch)) out += ch
    else out += '~' + code.toString(16).toUpperCase().padStart(4, '0')
  }
  return out
}

/**
 * 复刻 dsh-session-persistence-jsonl 的 projectKey（纯函数）：
 * 分隔符 / \ : → '-'（连续只保留一个）；安全字符 [A-Za-z0-9._-]（除 ~ 外）保持原样；
 * 其余字符编码为 ~XXXX；结果 -- 前后缀、去开头 '-'、截断 251。空字符串抛错。
 * 保留原因：同 encodeSegment（上游未导出 + 本插件自包含）；上游语义变更须同步对齐（上游 L114）。
 */
function projectKey(cwd) {
  if (cwd.length === 0) throw new Error('cannot encode an empty project path')
  let readable = ''
  let separatorRun = false
  for (let i = 0; i < cwd.length; i++) {
    const code = cwd.charCodeAt(i)
    const ch = String.fromCharCode(code)
    if (ch === '/' || ch === '\\' || ch === ':') {
      if (!separatorRun) readable += '-'
      separatorRun = true
    } else if (ch !== '~' && /^[A-Za-z0-9._-]$/.test(ch)) {
      readable += ch
      separatorRun = false
    } else {
      readable += '~' + code.toString(16).toUpperCase().padStart(4, '0')
      separatorRun = false
    }
  }
  return `--${(readable.replace(/^-+/, '') || 'root').slice(0, 251)}--`
}

/**
 * 删除主会话的整个持久化目录：<root>/<projectKey(process.cwd())>/<encodeSegment(sessionId)>/。
 * 删除整个目录（含 session.jsonl.zstd 及任何其他会话产物）。try/catch 幂等：
 * rm 已带 force:true（ENOENT 不会抛出），任何错误打 console.error 日志，不向调用方抛错。
 */
async function deleteSessionDir(sessionId, root) {
  try {
    const cwd = process.cwd()
    const project = projectKey(cwd)
    const encoded = encodeSegment(sessionId)
    const sessionDir = join(root, project, encoded)
    await rm(sessionDir, { recursive: true, force: true })
  } catch (err) {
    console.error('[dsh-qqbot-user-questions] 删除会话目录失败:', err.message)
  }
}
