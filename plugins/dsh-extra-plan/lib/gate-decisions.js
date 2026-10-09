// plugins 根入口的纯决策与 run_code 聚合；无反向 index.js 依赖。
import { sessionEvents, isSubagentChild } from './agent-session.js'
import { budgetExceeded, budgetExhaustedReason, toolCallsSinceUser, DEFAULT_EXPLORE_BUDGET } from './planner-budget.js'
import { runCodeTextOf, codeMutationHints, createRunCodeStatic } from './run-code-static.js'
import { pwshMutationMatches, bashMutationMatches } from './shell-mutation.js'
import { normalizeGateLabel } from './gate-words.js'

const ASK_TOOL = 'ask_user_question'
const isDispatchStart = (t) => t === 'tool/ptc-dispatch-start'
const isDispatch = (t) => t === 'tool/ptc-dispatch'
const CHANNEL_BROKEN_CODES = new Set(['NO_PROVIDER', 'CALLER_NOT_LIVE', 'DELEGATED_CALLER'])
function purposeRouteDenyReason(gateRuntime) {
  return `目的确认 ask 未按路由顺序：${gateRuntime.confirm.route}，选择「${gateRuntime.words.routePlan}」后再询问规划目的（目的选项固定为${gateRuntime.options.purpose}）`
}

// deny 提示模板（与闸门验词同源：引用本次 apply 的 gateRuntime，改词表则提示自动跟随）
function routeDenyReason(toolLabel, state, gateRuntime) {
  if (state && state.route === 'plan') {
    return `规划态下主会话不可写文件：${toolLabel}。探查请走 save_probe，写文件请等方案批准后走执行者委派`
  }
  return `路由未确认：${toolLabel}。只读探查可随时进行。创建/修改/删除文件${gateRuntime.confirm.route}，用户批准后才可动手`
}
function planDenyReason(action, state, gateRuntime) {
  if (state && state.route === 'direct') {
    return `直行态下不可规划：${action}。「${gateRuntime.words.routeDirect}」已选，请直接使用 write/edit/pwsh/bash 等工具动手完成任务`
  }
  if (state && state.route === 'plan' && state.purpose !== 'refine' && state.purpose !== 'redo') {
    return `规划目的尚未确认：${action}。${gateRuntime.confirm.purpose}，答复后再调用 ${action}`
  }
  if (state && state.route === 'plan' && state.clarified === false) {
    return `澄清问答尚未完成：${action}。请先独立发一次 ask_user_question 做澄清问答（1-3 个关键问题，给候选选项），完成后再调用 ${action}`
  }
  return `子代理未放行：${action}。${gateRuntime.confirm.route}，意图澄清问答后再调用 ${action}`
}
function approvalDenyReason(action, state, gateRuntime) {
  return `执行类委派未放行：${action}。${gateRuntime.confirm.approval}，用户批准后才可委派`
}

// 当前宿主事件只保留 PTC dispatch 形状；旧 code-dispatch 运行分支已删除。

// shell mutation 辅助函数由 lib/shell-mutation.js 提供；下方 import 保持公开 decisions 绑定。



// ── 纯判定函数（模块顶层；经 decisions 导出供场景测试直接复用，防复制漂移） ──

// 宿主在「用户取消/中断 ask」时回流的文案句（逐字常量，2026-09-23 实测：嵌套 PTC 路径
// 与 native 路径同句）。嵌套路径无错误码，故只按文案判别取消；以 'Error: ' 开头且不等于
// 本表任一条 → 判为闸门拒绝（parseAskResultData/parseDispatchAskResult 返回 kind:'denied'），
// 不触发 resetRouteState（状态机连带修复）。
const HOST_ASK_CANCEL_TEXTS = ['Error: ask_user_question was aborted before the user answered', 'Error: the user cancelled ask_user_question']

// 会话事件快照（sessionEvents）与子代理识别（isSubagentChild）的唯一来源 = lib/agent-session.js
// （index.js 与 lib/model-routing.js 共用，模块内不再保留镜像副本）；见下方 import 行，
// decisions 继续 re-export isSubagentChild（名字数不变）。

// 委派角色判定由下方从 lib/agent-runtime.js 导入。
// anchored 引导阶段判定：会话尚未落盘任何 tool/call 事件。
function filterBootstrapContextDecision(decision, gated) {
  if (gated !== true || decision === null || typeof decision !== 'object' || decision.kind !== 'enter' || !Array.isArray(decision.messages)) return decision
  const messages = decision.messages.filter((message) => {
    if (message === null || typeof message !== 'object' || message.source === null || typeof message.source !== 'object') return true
    return message.source.kind !== 'agent-instructions' && message.source.kind !== 'skill-catalog'
  })
  return messages.length === decision.messages.length ? decision : { ...decision, messages }
}

function projectedSkillCatalogSignature(message) {
  if (message === null || typeof message !== 'object' || message.source === null || typeof message.source !== 'object' || message.source.kind !== 'skill-catalog' || !Array.isArray(message.source.entries)) return undefined
  const entries = []
  for (const entry of message.source.entries) {
    if (entry === null || typeof entry !== 'object' || typeof entry.name !== 'string' || entry.name === '' || typeof entry.description !== 'string') return undefined
    entries.push([entry.name, entry.description])
  }
  return JSON.stringify(entries)
}

function dedupeProjectedSkillCatalogDecision(decision, visibleMessages) {
  if (decision === null || typeof decision !== 'object' || decision.kind !== 'enter' || !Array.isArray(decision.messages)) return decision
  let lastSignature
  if (Array.isArray(visibleMessages)) {
    for (const message of visibleMessages) {
      const signature = projectedSkillCatalogSignature(message)
      if (signature !== undefined) lastSignature = signature
    }
  }
  let changed = false
  const messages = []
  for (const message of decision.messages) {
    const signature = projectedSkillCatalogSignature(message)
    if (signature !== undefined && signature === lastSignature) {
      changed = true
      continue
    }
    messages.push(message)
    if (signature !== undefined) lastSignature = signature
  }
  return changed ? { ...decision, messages } : decision
}

function isBootstrapPhase(agent) {
  if (agent === undefined || agent === null) return false
  const session = agent.session
  if (session === undefined || session === null) return false
  const events = sessionEvents(session)
  if (!Array.isArray(events)) return false
  return !events.some((event) => {
    if (event === null || typeof event !== 'object') return false
    return event.type === 'tool/call' || (Array.isArray(event.type) && event.type.includes('tool/call'))
  })
}

// shell 命令解码与 mutation 匹配由 lib/shell-mutation.js 提供。


// 从 ask_user_question 的 tool/call 事件解析选项标签集——只收首问 questions[0] 的选项标签（第二问「补充要求／修改意见」为纯文本输入，其选项不进入验词集合）。
// 事件里 arguments 是 JSON 字符串；解析失败返回 null（跳过该调用的分类）。
function labelsOfCallData(data) {
  if (data === null || typeof data !== 'object') return null
  let parsed = null
  if (typeof data.arguments === 'string' && data.arguments.length > 0) {
    try { parsed = JSON.parse(data.arguments) } catch (error) { return null }
  } else if (data.arguments !== null && typeof data.arguments === 'object') {
    parsed = data.arguments
  }
  if (parsed === null || !Array.isArray(parsed.questions)) return null
  const labels = []
  const q = parsed.questions[0]
  if (q === null || typeof q !== 'object' || !Array.isArray(q.options)) return labels
  for (const opt of q.options) {
    if (opt !== null && typeof opt === 'object' && typeof opt.label === 'string') labels.push(opt.label)
  }
  return labels
}

// 路由/批准/目的的标准词集合来自本次 apply 的 gateRuntime（routeSet/approvalSet/
// purposeSet）；模块内不再保留任何静态 Set，也不存在默认词表。

// 免计瀑布预算的工具白名单（planner 预算计数与 pre-execute 闸门豁免共用）。
const FREE_TOOLS = new Set(['save_plan', 'send_message'])

// 白名单后缀剥离：把选项标签末尾的推荐标记去掉，用于精确匹配前净化。
// 四种白名单后缀：(Recommended)、（Recommended）、(推荐)、（推荐）；英文不区分大小写。
// 对齐前端 parseRecommendedLabel（本轮）：后缀前后任意空白、半角组不再要求前置空格。
// 三分法判定：labels 集合是否与 gateSet 集合完全相等（精确字符串比较，不用 indexOf）。
function isExactGateSet(labels, gateSet) {
  const labelSet = new Set(labels.map(normalizeGateLabel))
  if (labelSet.size !== gateSet.size) return false
  for (const word of gateSet) {
    if (!labelSet.has(word)) return false
  }
  return true
}

// 三分法判定：labels 是否与 gateSet 有交集（≥1 个词相同，用 indexOf 包含匹配）但不完全相等。
function isPartialGateSet(labels, gateSet) {
  if (isExactGateSet(labels, gateSet)) return false
  for (const label of labels) {
    for (const word of gateSet) {
      if (label.indexOf(word) !== -1) return true
    }
  }
  return false
}

// 综合三分法判定：对 ask 的选项做「完全等于 / 部分相交 / 完全不相交」分类。
function categorizeGateAsk(labels, gateRuntime) {
  if (isExactGateSet(labels, gateRuntime.routeSet) || isExactGateSet(labels, gateRuntime.approvalSet) || isExactGateSet(labels, gateRuntime.purposeSet)) return 'standard'
  if (isPartialGateSet(labels, gateRuntime.routeSet) || isPartialGateSet(labels, gateRuntime.approvalSet) || isPartialGateSet(labels, gateRuntime.purposeSet)) return 'malformed'
  return 'ordinary'
}

// 根据缺失的词生成大白话 deny 提示，列出标准模板和具体缺项。
function gateAskDenyReason(labels, gateRuntime) {
  const routeMissing = []
  for (const word of gateRuntime.routeSet) {
    let found = false
    for (const label of labels) {
      if (label.indexOf(word) !== -1) { found = true; break }
    }
    if (!found) routeMissing.push(word)
  }
  const approvalMissing = []
  for (const word of gateRuntime.approvalSet) {
    let found = false
    for (const label of labels) {
      if (label.indexOf(word) !== -1) { found = true; break }
    }
    if (!found) approvalMissing.push(word)
  }
  const purposeMissing = []
  for (const word of gateRuntime.purposeSet) {
    let found = false
    for (const label of labels) {
      if (label.indexOf(word) !== -1) { found = true; break }
    }
    if (!found) purposeMissing.push(word)
  }
  let msg = `ask 选项不规范。路由 ask 选项固定为${gateRuntime.options.route}；批准 ask 选项固定为${gateRuntime.options.approval}；目的 ask 选项固定为${gateRuntime.options.purpose}。`
  const pickPurpose = purposeMissing.length < routeMissing.length && purposeMissing.length < approvalMissing.length
  const pickRoute = !pickPurpose && routeMissing.length <= approvalMissing.length
  const missing = pickPurpose ? purposeMissing : pickRoute ? routeMissing : approvalMissing
  if (missing.length === 0) {
    msg += ' 当前选项包含了标准三词但带有非标准修饰（如额外字符、非白名单后缀）。推荐标记仅限 (Recommended)/（Recommended）/(推荐)/（推荐）四种'
  } else {
    msg += ` 当前${pickPurpose ? '目的' : pickRoute ? '路由' : '批准'} ask 缺少：${missing.join('、')}。`
  }
  msg += ' 请按标准模板重提'
  return msg
}

// 结构校验纯函数：校验标准 ask 的 questions 结构是否符合规范。
// kind='route'：须至少 2 个问题（第二个为补充要求可空）；kind='approve'：须至少 2 个问题（第二个为修改意见可空）。
// kind='route'/'approve' 追加：第二问（questions[1]）起不得带非空 options（补充要求/修改意见必须纯文本输入）。
// 通过返回 null，不通过返回 deny reason 字符串（路由文案含"补充要求"、批准文案含"修改意见"提示）。
function validateGateAskStructure(kind, questions, gateRuntime) {
  if (!Array.isArray(questions)) return 'ask 结构错误：缺少 questions 数组'
  if (kind === 'route') {
    if (questions.length < 2) return `路由 ask 结构错误：须至少 2 个问题（第一个为路由选项固定为${gateRuntime.options.route}，第二个为补充要求可空），当前 ${questions.length} 个问题`
    for (let i = 1; i < questions.length; i += 1) {
      const q = questions[i]
      if (q !== null && typeof q === 'object' && Array.isArray(q.options) && q.options.length > 0) {
        return `路由 ask 结构错误：第 ${i + 1} 个问题（补充要求）必须为纯文本输入，不得提供选项（预设选项不符合用户想法），当前带 ${q.options.length} 个选项。请改为纯文本大文本框、去掉 options`
      }
    }
    return null
  }
  if (kind === 'purpose') {
    if (questions.length !== 1) return `目的 ask 结构错误：须恰好 1 个问题（规划目的确认 ask 只做一次二选一，后续澄清请另发一次 ask_user_question。选项固定为${gateRuntime.options.purpose}），当前 ${questions.length} 个问题`
    return null
  }
  if (kind === 'approve') {
    if (questions.length < 2) return `批准 ask 结构错误：须至少 2 个问题（第一个为批准选项固定为${gateRuntime.options.approval}，第二个为修改意见可空），当前 ${questions.length} 个问题`
    for (let i = 1; i < questions.length; i += 1) {
      const q = questions[i]
      if (q !== null && typeof q === 'object' && Array.isArray(q.options) && q.options.length > 0) {
        return `批准 ask 结构错误：第 ${i + 1} 个问题（修改意见）必须为纯文本输入，不得提供选项（预设选项不符合用户想法），当前带 ${q.options.length} 个选项。请改为纯文本大文本框、去掉 options`
      }
    }
    return null
  }
  return `ask 结构错误：未知的 ask 类型 "${kind}"。`
}

// 测试契约 API（非死代码）：运行时状态机只用 askKindOfRelaxed（见 L436），本严格版
// 仅经 decisions 导出（L1244）供 pe-test step-00-全流程回归.mjs L149 调用（K1-K5）。
// 删除定义会使 decisions 顶层求值 ReferenceError（index.js 模块加载即崩）——保留。
// ask 分类：路由 ask（同时含路由特有词 routeDirect/routePlan）、批准 ask（含
// 批准特有词 approvalApprove）、其余视为澄清 ask。词值一律来自当前 config.gateWords。
function askKindOf(labels, gateRuntime) {
  let hasDirect = false
  let hasPlan = false
  let hasApprove = false
  let hasRefine = false
  let hasRedo = false
  for (const label of labels) {
    if (label.indexOf(gateRuntime.words.routeDirect) !== -1) hasDirect = true
    if (label.indexOf(gateRuntime.words.routePlan) !== -1) hasPlan = true
    if (label.indexOf(gateRuntime.words.approvalApprove) !== -1) hasApprove = true
    if (label.indexOf(gateRuntime.words.purposeRefine) !== -1) hasRefine = true
    if (label.indexOf(gateRuntime.words.purposeRedo) !== -1) hasRedo = true
  }
  if (hasDirect && hasPlan) return 'route'
  if (hasApprove) return 'approve'
  if (hasRefine && hasRedo) return 'purpose'
  return 'clarify'
}

// 宽松版 ask 分类：专给状态机用，只要 ask 选项里出现任一路由词/批准词就归类，
// 不要求同时包含两个词（run_code 子调用路径不做选项集校验，宽松分类器避免状态机误判）。
// 路由否决词（routeDisagree）是路由组与批准组的共享词，按特异性优先：路由特有词
// （routeDirect/routePlan）→ route；批准特有词（approvalApprove/approvalReplan）→ approve；
// 仅有 routeDisagree → route。
function askKindOfRelaxed(labels, gateRuntime) {
  let hasRouteSpecific = false
  let hasApproveSpecific = false
  let hasDisagree = false
  let hasPurposeSpecific = false
  for (const label of labels) {
    if (label.indexOf(gateRuntime.words.routeDirect) !== -1 || label.indexOf(gateRuntime.words.routePlan) !== -1) hasRouteSpecific = true
    if (label.indexOf(gateRuntime.words.approvalApprove) !== -1 || label.indexOf(gateRuntime.words.approvalReplan) !== -1) hasApproveSpecific = true
    if (label.indexOf(gateRuntime.words.routeDisagree) !== -1) hasDisagree = true
    if (label.indexOf(gateRuntime.words.purposeRefine) !== -1 || label.indexOf(gateRuntime.words.purposeRedo) !== -1) hasPurposeSpecific = true
  }
  if (hasRouteSpecific) return 'route'
  if (hasApproveSpecific) return 'approve'
  if (hasDisagree) return 'route'
  if (hasPurposeSpecific) return 'purpose'
  return 'clarify'
}

// 三类 match 的唯一判定口径：标签先按白名单后缀归一（normalizeGateLabel），再与当前
// config.gateWords 的值**精确相等**才返回内部枚举；禁止 indexOf 子串推进 route/
// purpose/approved（旧词与任何变体都不得靠子串或推荐后缀重新生效）。
function matchExactKind(selected, table) {
  for (const label of selected) {
    const normalized = normalizeGateLabel(label)
    for (const entry of table) {
      if (normalized === entry[0]) return entry[1]
    }
  }
  return null
}

function matchRouteLabel(selected, gateRuntime) {
  const routeSpecific = matchExactKind(selected, [
    [gateRuntime.words.routeDirect, 'direct'],
    [gateRuntime.words.routePlan, 'plan'],
  ])
  if (routeSpecific !== null) return routeSpecific
  return matchExactKind(selected, [[gateRuntime.words.routeDisagree, 'disagree']])
}

function matchApprovalLabel(selected, gateRuntime) {
  const approvalSpecific = matchExactKind(selected, [
    [gateRuntime.words.approvalApprove, 'approve'],
    [gateRuntime.words.approvalReplan, 'replan'],
  ])
  if (approvalSpecific !== null) return approvalSpecific
  return matchExactKind(selected, [[gateRuntime.words.routeDisagree, 'disagree']])
}

function matchPurposeLabel(selected, gateRuntime) {
  return matchExactKind(selected, [
    [gateRuntime.words.purposeRefine, 'refine'],
    [gateRuntime.words.purposeRedo, 'redo'],
  ])
}

// ContentBlock 数组首条 text 块的文本（无 text 块 → ''）
function firstTextOfBlocks(blocks) {
  if (!Array.isArray(blocks)) return ''
  for (const block of blocks) {
    if (block !== null && typeof block === 'object' && block.type === 'text' && typeof block.text === 'string') return block.text
  }
  return ''
}

// 闸门拒绝判别：以 'Error: ' 开头且不等于宿主取消句（HOST_ASK_CANCEL_TEXTS）→ true。
// 依据（2026-09-23 实测）：嵌套拒绝=插件中文文案（本插件 deny reason），嵌套取消=宿主英文句，
// 两者其它字段同构（同键集、同 isError:true、同无 error/code），只能按文案判别。
function askResultTextIsDenied(text) {
  return typeof text === 'string' && text.startsWith('Error: ') && !HOST_ASK_CANCEL_TEXTS.includes(text)
}

// 解析一次 ask 的结果（tool/result 事件）。返回：
//   { callId, kind: 'ok', answersLen, selected } —— 正常答复（answersLen=0 为空白回复）
//   { callId, kind: 'denied', code: '' } —— 闸门拒绝（插件中文文案，isError:true、无 data.error）
//   { callId, kind: 'error', code } —— 错误结果（取消/中断/通道错误/参数错误）
//   { callId: undefined } —— 与该次 ask 无关的结果
function parseAskResultData(data) {
  if (data === null || typeof data !== 'object') return { callId: undefined }
  const message = data.message
  if (message === null || typeof message !== 'object' || !Array.isArray(message.content)) return { callId: undefined }
  const callId = message.toolCallId
  const inner = message.content
  const outerIsError = message.isError === true
  const outerText = firstTextOfBlocks(message.content)
  if (typeof callId !== 'string') return { callId: undefined }
  if (data.error !== undefined && data.error !== null) {
    return { callId, kind: 'error', code: typeof data.error.code === 'string' ? data.error.code : '' }
  }
  // 无 data.error 但信封 isError:true：闸门拒绝（中文文案）→ denied；其余（含宿主取消句）→ error。
  // 空 code 走既有 else 分支（取消清四字段/denied 不重置由 deriveFlowState 区分）。
  if (outerIsError) {
    if (askResultTextIsDenied(outerText)) return { callId, kind: 'denied', code: '' }
    return { callId, kind: 'error', code: '' }
  }
  let answersLen = 0
  const selected = []
  if (inner !== undefined) {
    for (const block of inner) {
      if (block !== null && typeof block === 'object' && block.type === 'text' && typeof block.text === 'string') {
        let parsed = null
        try { parsed = JSON.parse(block.text) } catch (error) { /* 非 JSON，跳过 */ }
        if (parsed !== null && parsed !== undefined && Array.isArray(parsed.answers)) {
          answersLen = parsed.answers.length
          for (const answer of parsed.answers) {
            if (answer !== null && typeof answer === 'object' && Array.isArray(answer.selected)) {
              for (const label of answer.selected) if (typeof label === 'string') selected.push(label)
            }
          }
        }
      }
    }
  }
  return { callId, kind: 'ok', answersLen, selected }
}

// 解析一次嵌套 ask 的结果（tool/ptc-dispatch 事件，run_code 程序内嵌套调用）。
// data.content 直接是 ContentBlock 数组。
// 返回（与 parseAskResultData 同构）：
//   { callId, kind: 'ok', answersLen, selected } —— 正常答复（answersLen=0 为空白回复）
//   { callId, kind: 'denied', code: '' } —— 闸门拒绝（isError===true + 插件中文文案，非宿主取消句）
//   { callId, kind: 'error', code } —— isError===true 的其它情形（嵌套层无错误码 → code=''）
//   { callId: undefined } —— 防御（subCallId 非 string）
function parseDispatchAskResult(data) {
  if (data === null || typeof data !== 'object') return { callId: undefined }
  const callId = data.subCallId
  if (typeof callId !== 'string') return { callId: undefined }
  if (data.isError === true) {
    // 嵌套层无错误码：闸门拒绝=插件中文文案 → denied；宿主取消句等其它 → error（清四字段语义保留）。
    if (askResultTextIsDenied(firstTextOfBlocks(data.content))) return { callId, kind: 'denied', code: '' }
    return { callId, kind: 'error', code: '' }
  }
  let answersLen = 0
  const selected = []
  if (Array.isArray(data.content)) {
    for (const block of data.content) {
      if (block !== null && typeof block === 'object' && block.type === 'text' && typeof block.text === 'string') {
        let parsed = null
        try { parsed = JSON.parse(block.text) } catch (error) { /* 非 JSON，跳过 */ }
        if (parsed !== null && parsed !== undefined && Array.isArray(parsed.answers)) {
          answersLen = parsed.answers.length
          for (const answer of parsed.answers) {
            if (answer !== null && typeof answer === 'object' && Array.isArray(answer.selected)) {
              for (const label of answer.selected) if (typeof label === 'string') selected.push(label)
            }
          }
        }
      }
    }
  }
  return { callId, kind: 'ok', answersLen, selected }
}

// 四级锚点状态机（纯函数，自最近一条人类消息起的事件推导）：
//   route: 'none' | 'direct' | 'plan'（routeDisagree → 回 'none'，保持未确认）
//   clarified: 是否有完成的澄清问答（空白回复不算）
//   approved: 是否已获 approvalApprove（approvalReplan / routeDisagree → 重置 false）
//   purpose: 'none' | 'refine' | 'redo'（purposeRefine → refine / purposeRedo → redo）
//   channelBroken: 提问通道级错误（逃生放行标记）
// 失败分支判别：kind==='denied'（插件闸门拒绝）→ 不改任何字段；kind==='error' →
// 通道码置 channelBroken，其余（含宿主取消句 / ASK_CANCELLED）resetRouteState 清四字段。
function deriveFlowState(events, gateRuntime) {
  const state = { route: 'none', clarified: false, approved: false, purpose: 'none', channelBroken: false }
  const resetStageState = () => {
    state.purpose = 'none'
    state.clarified = false
    state.approved = false
  }
  const resetRouteState = () => {
    state.route = 'none'
    resetStageState()
  }
  if (!Array.isArray(events)) return state
  let lastHuman = -1
  for (let i = events.length - 1; i >= 0; i -= 1) {
    const e = events[i]
    if (e !== null && typeof e === 'object' && e.type === 'user/message' &&
        e.data !== null && typeof e.data === 'object' &&
        e.data.source !== null && typeof e.data.source === 'object' &&
        e.data.source.kind === 'user') {
      lastHuman = i
      break
    }
  }
  if (lastHuman === -1) return state
  const asks = new Map() // callId → kind
  for (let i = lastHuman + 1; i < events.length; i += 1) {
    const e = events[i]
    if (e === null || typeof e !== 'object') continue
    if (e.type === 'tool/call' && e.data !== null && typeof e.data === 'object' &&
        e.data.name === ASK_TOOL && typeof e.data.callId === 'string') {
      const labels = labelsOfCallData(e.data)
      if (labels !== null) asks.set(e.data.callId, askKindOfRelaxed(labels, gateRuntime))
      continue
    }
    if (isDispatchStart(e.type) && e.data !== null && typeof e.data === 'object' &&
        e.data.name === ASK_TOOL && typeof e.data.subCallId === 'string') {
      const labels = labelsOfCallData(e.data)
      if (labels !== null) asks.set(e.data.subCallId, askKindOfRelaxed(labels, gateRuntime))
      continue
    }
    if (isDispatch(e.type) && e.data !== null && typeof e.data === 'object' &&
        typeof e.data.subCallId === 'string') {
      const result = parseDispatchAskResult(e.data)
      if (result.callId === undefined || !asks.has(result.callId)) continue
      // 闸门拒绝不重置：route/purpose/clarified/approved 原样保留（合规重提即可放行）；
      // 取消/中断/通道错误仍走下方 error 分支（清四字段语义不变）。
      if (result.kind === 'denied') continue
      if (result.kind === 'error') {
        if (CHANNEL_BROKEN_CODES.has(result.code)) state.channelBroken = true
        else resetRouteState()
        continue
      }
      const kind = asks.get(result.callId)
      if (kind === 'route') {
        resetStageState()
        const matched = matchRouteLabel(result.selected, gateRuntime)
        if (matched === 'direct') state.route = 'direct'
        else if (matched === 'plan') state.route = 'plan'
        else state.route = 'none'
      } else if (kind === 'purpose') {
        if (state.route === 'plan' && result.answersLen > 0) {
          const matched = matchPurposeLabel(result.selected, gateRuntime)
          if (matched !== null) {
            resetStageState()
            state.purpose = matched
          }
        }
      } else if (kind === 'clarify') {
        if (result.answersLen > 0 && state.route === 'plan' && (state.purpose === 'refine' || state.purpose === 'redo')) state.clarified = true
      } else if (kind === 'approve') {
        const matched = matchApprovalLabel(result.selected, gateRuntime)
        if (matched === 'approve') state.approved = true
        else state.approved = false
      }
      continue
    }
    if (e.type !== 'tool/result') continue
    const result = parseAskResultData(e.data)
    if (result.callId === undefined || !asks.has(result.callId)) continue
    // 同 dispatch 分支：闸门拒绝（denied）不重置任何状态字段。
    if (result.kind === 'denied') continue
    if (result.kind === 'error') {
      if (CHANNEL_BROKEN_CODES.has(result.code)) state.channelBroken = true
      else resetRouteState()
      continue
    }
    const kind = asks.get(result.callId)
    if (kind === 'route') {
      resetStageState()
      const matched = matchRouteLabel(result.selected, gateRuntime)
      if (matched === 'direct') state.route = 'direct'
      else if (matched === 'plan') state.route = 'plan'
      // disagree 与其它未识别标签同义：路由不成立（原 else if (disagree) 与本分支同值，合并）。
      else state.route = 'none'
    } else if (kind === 'purpose') {
      if (state.route === 'plan' && result.answersLen > 0) {
        const matched = matchPurposeLabel(result.selected, gateRuntime)
        if (matched !== null) {
          resetStageState()
          state.purpose = matched
        }
      }
    } else if (kind === 'clarify') {
      if (result.answersLen > 0 && state.route === 'plan' && (state.purpose === 'refine' || state.purpose === 'redo')) state.clarified = true
    } else if (kind === 'approve') {
      const matched = matchApprovalLabel(result.selected, gateRuntime)
      if (matched === 'approve') state.approved = true
      // replan/disagree 与其它未识别标签同义：未获批准（原 else if (replan|disagree) 与本分支同值，合并）。
      else state.approved = false
    }
  }
  return state
}


// planner budget 辅助函数由 lib/planner-budget.js 提供。

// planner prompt 与预算提示辅助函数由 lib/planner-budget.js 提供。

// planner budget 策略辅助函数由 lib/planner-budget.js 提供。
// save_plan/save_probe 合同、校验与渲染已拆至 plugins/dsh-extra-plan/lib。

// 工具集判定（真实工具集 tools.schemas，restrict 后非折叠；目录判定保留为 schemas 不可得时的回落）。
// 元素支持两种形状：字符串工具名、{ name } 对象（装配目录/工具集均为对象形状）。
function catalogHasWriteTools(tools) {
  if (!Array.isArray(tools)) return false
  return tools.some((tool) =>
    (typeof tool === 'string' && (tool === 'write' || tool === 'edit')) ||
    (tool !== null && typeof tool === 'object' && (tool.name === 'write' || tool.name === 'edit')))
}

// 只读子代理（reviewer）判定：目录非空且不含 write/edit。
function isReadOnlyChildByCatalog(tools) {
  return Array.isArray(tools) && tools.length > 0 && !catalogHasWriteTools(tools)
}

// 工具集判定：真实工具集（tools.schemas，restrict 后非折叠）是否含 write/edit——
// 含 write/edit=可写（executor），无 write/edit=只读（probe/reviewer）。
// 形状约定与 catalogHasWriteTools 同（字符串元素 / { name } 对象）；非数组 → false。
function schemasHasWriteTools(schemas) {
  if (!Array.isArray(schemas)) return false
  return schemas.some((tool) =>
    (typeof tool === 'string' && (tool === 'write' || tool === 'edit')) ||
    (tool !== null && typeof tool === 'object' && (tool.name === 'write' || tool.name === 'edit')))
}

// 工具集判定：真实工具集是否含指定工具名（save_probe 信号：仅主会话与认领的 probe 子代理注册）。
// 形状约定同上；非数组 → false。
function schemasHasTool(schemas, toolName) {
  if (!Array.isArray(schemas)) return false
  return schemas.some((tool) =>
    (typeof tool === 'string' && tool === toolName) ||
    (tool !== null && typeof tool === 'object' && tool.name === toolName))
}

// ptc 折叠目录判定：ptc 模式 wireSchemas 塌缩为仅 [run_code]（dsh-tools types/index.js L410-414），
// 此时目录无 write/edit 不代表只读角色（executor/reviewer/probe 目录同为 [run_code]）；both=全部+run_code、
// native=无 run_code 均不折叠。折叠时目录信号不可用 → 只读判定改用真实工具集
// （schemas(agent) 不受折叠影响）：含 write/edit=可写（executor），无 write/edit=只读（probe/reviewer），
// reviewer 的 write/edit 由目录层 deny 兜底。
function catalogIsCollapsed(tools) {
  if (!Array.isArray(tools) || tools.length !== 1) return false
  const only = tools[0]
  return (typeof only === 'string' && only === 'run_code') ||
    (only !== null && typeof only === 'object' && only.name === 'run_code')
}

// ① subagent_probe 分支（唯一功能点）：planner 角色拒绝 + run_in_background 检查。
// T5：探查者仅主会话可委派——planner 派出的 one-shot 探查者 owner=委派者，planner 轮次
// 结束即被宿主级联取消（owner disposed），故从源头禁止 planner 委派；拒绝分支置于函数
// 顶部（run_in_background 检查之前、且不依赖 args 解析），两个调用点——组判定
// （run_code 内成员）与直呼/listener——都经本函数，单点覆盖两条路径。
// 文案必须指向「申请继续探查」（否则模型会反复重试烧预算）：planner 的探查只能自行
// read/glob/grep，缺口走申请继续探查往返，由主会话派探查者并转达线索文件路径。
// 参数不可解析（组判定 vExec 传字符串）时跳过 run_in_background 检查（运行时瀑布兜底）。
function subagentProbeGateReason(exec, isPlanner) {
  if (isPlanner) {
    return '规划子代理不得委派探查者：subagent_probe 仅主会话可用（探查者属主会话的探查能力）。请用 read/glob/grep 自行核对；确有缺口时输出「申请继续探查：<待查项> — <原因>」，由主会话派探查者并把线索文件路径转达给你（toolFilter 之外的第二道防线）'
  }
  const args = exec !== undefined && exec !== null ? exec.arguments : undefined
  if (args !== undefined && args !== null && typeof args === 'object' && args.run_in_background !== true) {
    return '探查者必须后台运行：请传 run_in_background: true'
  }
  return null
}

// shell 写命令的只读角色拒绝文案（B3 收敛：唯一实现，planner/探查者/验收复核者 × pwsh/bash 共六格；
// 六格文案与重构前逐字一致）。只处理 pwsh/bash 且确实命中既有 mutation 判定的调用；role 只接受
// planner/probe/reviewer，其余（含未知角色、非 shell 工具、只读命令）一律返回 null。
// write/edit 分支与本函数无关，各自 GateReason 内逐字保留。
function shellMutationReason(role, exec) {
  let label = null
  if (role === 'planner') label = '规划子代理'
  else if (role === 'probe') label = '探查者'
  else if (role === 'reviewer') label = '验收复核者'
  if (label === null) return null
  if (exec === undefined || exec === null) return null
  if (exec.name === 'pwsh') {
    return pwshMutationMatches(exec) ? `${label}只读：pwsh 仅限只读探查命令，禁止创建/修改/删除文件` : null
  }
  if (exec.name === 'bash') {
    return bashMutationMatches(exec) ? `${label}只读：bash 仅限只读探查命令，禁止创建/修改/删除文件` : null
  }
  return null
}

// ② planner 分支（plannerGateReason；自 apply 内提取的纯部分）：write/edit → shell 写命令
// （shellMutationReason）→ job_output → 预算；不含 run_code（由调用方处理）。
function plannerGateReason(exec, events, exploreBudget, jobOutputCallCounters) {
  if (exec.name === 'write' || exec.name === 'edit') {
    return '规划子代理只读：方案经 save_plan 落盘，其余写入一律禁止（toolFilter 之外的第二道防线）'
  }
  const shellReason = shellMutationReason('planner', exec)
  if (shellReason !== null) return shellReason
  if (exec.name === 'job_output') return jobOutputGateReason(exec, jobOutputCallCounters)
  if (!FREE_TOOLS.has(exec.name) && !isRunCodeSubCall(exec)) {
    const used = toolCallsSinceUser(events !== undefined ? events : [], FREE_TOOLS)
    if (budgetExceeded(used + 1, exploreBudget)) {
      return budgetExhaustedReason(Math.min(used, exploreBudget), exploreBudget)
    }
  }
  return null
}

// ③ child 只读块（childReadonlyGateReason；自 apply 内提取的纯部分）：write/edit → shell 写命令
// （shellMutationReason，probe 布尔选角色）→ job_output；不含 run_code。
function childReadonlyGateReason(exec, probe, jobOutputCallCounters) {
  if (exec.name === 'write' || exec.name === 'edit') {
    return probe ? '探查者只读：探查不修改任何文件，write/edit 一律禁止（工具目录判定）' : '验收复核者只读：验收复核不修改任何文件，write/edit 一律禁止（工具目录判定）'
  }
  const shellReason = shellMutationReason(probe ? 'probe' : 'reviewer', exec)
  if (shellReason !== null) return shellReason
  if (exec.name === 'job_output') return jobOutputGateReason(exec, jobOutputCallCounters)
  return null
}

// job_output 全角色闸门（v0.1.10）：wait:true 禁令 + 同 job 查重（自原 mainGateReason 分支逐字搬移，
// 闸门 1/2 文案逐字不变）；counters undefined/null 或 vExec 无 agent（组判定成员）时
// 跳过查重、wait 检查照常。本函数只读查重，写入侧唯一位点是 recordJobOutputCall（B3 收敛）。
function jobOutputGateReason(exec, jobOutputCallCounters) {
  const args = exec !== undefined && exec !== null ? exec.arguments : undefined
  // 闸门 1：禁止 wait: true 前台等待（参数不可解析时跳过，运行时瀑布兜底）
  if (args !== undefined && args !== null && typeof args === 'object' && args.wait === true) {
    return 'job_output 禁止带 wait: true 前台等待。请省略 wait 参数或设 wait: false，job 完成后会收到通知'
  }
  // 闸门 2：禁止同一 jobId 连续调用（防轮询）——内存计数器替代 events 推导。
  // 只读查重（写入由 recordJobOutputCall 在放行路径执行，时序等价）；组判定成员无会话上下文时
  // 跳过（运行时瀑布兜底）。
  if (args !== undefined && args !== null && typeof args === 'object' && typeof args.job_id === 'string') {
    const execAgent = exec !== undefined && exec !== null ? exec.agent : undefined
    const header = execAgent !== undefined && execAgent !== null && execAgent.session !== undefined && execAgent.session !== null ? execAgent.session.header : undefined
    const sessId = header !== undefined && header !== null ? header.id : undefined
    const counters = jobOutputCallCounters
    if (typeof sessId === 'string' && counters !== undefined && counters !== null) {
      const perSession = counters.get(sessId)
      if (perSession !== undefined && perSession !== null && perSession.has(args.job_id)) {
        return `job_output 禁止对同一 job 重复调用。job "${args.job_id}" 在本轮已调用过，请等待子代理返回结果，禁止提前收尾、结束`
      }
    }
  }
  return null
}

// job_output 放行后的计数器记录（B3 收敛：唯一实现；planner、只读 child、主会话三处共用，
// 执行者仍完全豁免）。仅当工具名恰为 job_output、job_id 为字符串、sessionId 为字符串且
// counters 可用时惰性建 session Map 并写 jobId→1；任一条件不满足即返回 false 且零副作用。
// 返回值仅供场景测试断言状态迁移，运行时调用方忽略。
function recordJobOutputCall(agent, exec, counters) {
  if (exec === undefined || exec === null || exec.name !== 'job_output') return false
  const args = exec.arguments
  if (args === undefined || args === null || typeof args !== 'object' || typeof args.job_id !== 'string') return false
  const header = agent !== undefined && agent !== null && agent.session !== undefined && agent.session !== null ? agent.session.header : undefined
  const sessId = header !== undefined && header !== null ? header.id : undefined
  if (typeof sessId !== 'string') return false
  if (counters === undefined || counters === null) return false
  let perSession = counters.get(sessId)
  if (perSession === undefined) { perSession = new Map(); counters.set(sessId, perSession) }
  perSession.set(args.job_id, 1)
  return true
}

// job_list/list_agents 主会话防轮询闸门（v0.4.0）：同锚点周期内第二次调用拒绝（首次放行）。
// 无参数键，按调用行为计数：pollGuardCounters 为 Map<sessionId, Set<'job_list'|'list_agents'>>。
// 只读查重；写入侧唯一位点是 recordPollGuardCall（B3 收敛同款）；vExec 无 agent（组判定成员）时
// 跳过查重（运行时瀑布重入兜底，与 jobOutputGateReason 同口径）。
function pollGuardGateReason(exec, pollGuardCounters) {
  const name = exec !== undefined && exec !== null && typeof exec.name === 'string' ? exec.name : ''
  if (name !== 'job_list' && name !== 'list_agents') return null
  const execAgent = exec !== undefined && exec !== null ? exec.agent : undefined
  const header = execAgent !== undefined && execAgent !== null && execAgent.session !== undefined && execAgent.session !== null ? execAgent.session.header : undefined
  const sessId = header !== undefined && header !== null ? header.id : undefined
  if (typeof sessId === 'string' && pollGuardCounters !== undefined && pollGuardCounters !== null) {
    const called = pollGuardCounters.get(sessId)
    if (called !== undefined && called !== null && called.has(name)) {
      return '禁止轮询子代理状态，停止操作并等待子代理通知'
    }
  }
  return null
}
// job_list/list_agents 放行后的计数器记录（唯一写入位点；仅主会话路径调用）。
function recordPollGuardCall(agent, exec, counters) {
  if (exec === undefined || exec === null) return false
  if (exec.name !== 'job_list' && exec.name !== 'list_agents') return false
  const header = agent !== undefined && agent !== null && agent.session !== undefined && agent.session !== null ? agent.session.header : undefined
  const sessId = header !== undefined && header !== null ? header.id : undefined
  if (typeof sessId !== 'string') return false
  if (counters === undefined || counters === null) return false
  let called = counters.get(sessId)
  if (called === undefined) { called = new Set(); counters.set(sessId, called) }
  called.add(exec.name)
  return true
}

// 探查者级联中止告警：委派方轮次结束 → activation dispose → 宿主 jobs-local owner
// 级联取消 one-shot 探查者 job（owner disposed）——agent/disposed 清理时若仍有未认领
// 探查者委派计数即告警留痕。T5 后 planner 不得委派探查者（闸门拒绝），委派方只剩主
// 会话，故文案中性化为「委派方会话销毁时」（触发路径 = 主会话在探查者认领前被销毁；
// 原硬编码「规划子代理」属错配）。已知引擎限制：根治需官方包配合（dsh-jobs-local/
// dsh-tool-subagent/dsh-subagent），extra-plan 侧只能告警+文档说明（见教训索引）。
function probeDisposalWarning(remaining) {
  if (!Number.isInteger(remaining) || remaining <= 0) return null
  return '委派方会话销毁时仍有 ' + remaining + ' 个未认领探查者委派：其后台 job 可能已被宿主级联取消（owner disposed）。已知引擎限制：one-shot 探查者 owner=委派者，级联取消修复需官方包配合（dsh-jobs-local/dsh-tool-subagent/dsh-subagent）'
}

// ④ 主会话段（mainGateReason；自 apply 内提取的纯部分，分支顺序逐字同序）：
//    ask → write/edit → cordis 2 只读 → pwsh/bash → planToolName
//    → save_probe 分支保持不变（route=plan + purpose∈{refine,redo} + clarified）
//    → subagent 族 → run_code（调 runCodeGroupDenyReason，depth+1）
//    → job_output（wait 检查 + 计数器查重，只读不写入；set 由 recordJobOutputCall 在放行路径执行）→ null。
//    save_plan 已移除路由态限制：无显式分支，由本函数兜底 return null 任意路由态放行
//    （受限规划工件：仅写 cwd/.extra-plan 固定形状 Markdown，内容闸门与规划子代理同一实现）。
//    gateCtx: { events, planToolName, jobOutputCallCounters, pollGuardCounters, runCodeDepth, runcodeCatchGate, getAgents(可选), gateRuntime }（gateRuntime 必填）。
function mainGateReason(state, exec, gateCtx) {
  const ctx = gateCtx !== undefined && gateCtx !== null ? gateCtx : {}
  const gateRuntime = ctx.gateRuntime
  if (gateRuntime === undefined || gateRuntime === null) {
    throw new Error('extra-plan: mainGateReason 需要本次 apply 的 gateRuntime（config.gateWords）；helper 不得自建默认词表')
  }
  const events = ctx.events !== undefined && ctx.events !== null ? ctx.events : []
  const planToolName = typeof ctx.planToolName === 'string' && ctx.planToolName !== '' ? ctx.planToolName : 'subagent_plan'
  state = state !== undefined && state !== null ? state : { route: 'none', clarified: false, approved: false, purpose: 'none', channelBroken: false }
  const escape = state.channelBroken === true
  const name = exec !== undefined && exec !== null && typeof exec.name === 'string' ? exec.name : ''
  if (name === ASK_TOOL) {
    const labels = labelsOfCallData(exec)
    if (labels !== null) {
      const category = categorizeGateAsk(labels, gateRuntime)
      if (category === 'malformed') {
        const denyMsg = gateAskDenyReason(labels, gateRuntime)
        // 同时检查结构错误，合并为一条报错，一次性告知模型两个问题
        const kind = askKindOfRelaxed(labels, gateRuntime) === 'approve' ? 'approve' : askKindOfRelaxed(labels, gateRuntime) === 'purpose' ? 'purpose' : 'route'
        // kind 按特异性判定（复用 askKindOfRelaxed 语义）：批准特异词→approve；路由特异词或仅共享 routeDisagree→route
        const args = exec.arguments
        const questions = args !== undefined && args !== null && typeof args === 'object' ? args.questions : undefined
        const structErr = validateGateAskStructure(kind, questions, gateRuntime)
        if (structErr !== null) {
          return `${denyMsg.replace(/请按标准模板重提$/, '')}同时，${structErr} 请一并修正后重提。`
        }
        return denyMsg
      }
      if (category === 'standard') {
        const kind = isExactGateSet(labels, gateRuntime.routeSet) ? 'route' : isExactGateSet(labels, gateRuntime.purposeSet) ? 'purpose' : 'approve'
        const args = exec.arguments
        const questions = args !== undefined && args !== null && typeof args === 'object' ? args.questions : undefined
        const structErr = validateGateAskStructure(kind, questions, gateRuntime)
        if (structErr !== null) {
          if (kind === 'purpose' && !escape && state.route !== 'plan') return `${purposeRouteDenyReason(gateRuntime)}同时，${structErr} 请一并修正后重提。`
          return structErr
        }
        if (kind === 'purpose' && !escape && state.route !== 'plan') return purposeRouteDenyReason(gateRuntime)
      }
      // 'ordinary' → 放行；'standard' 结构校验通过 → 放行
    }
    return null
  }
  if (name === 'write' || name === 'edit') {
    if (!escape && state.route !== 'direct' && state.approved !== true) {
      return routeDenyReason('write/edit', state, gateRuntime)
    }
    // 新增：approved 态下，主会话不得自己动手改工作区内文件
    if (!escape && state.approved === true && state.route !== 'direct') {
      return '方案已批准，执行请走 subagent 委派 flash 执行者（读方案/验收文件执行）。主会话直做仅限越界操作（工作区外写入，走 shell（Windows 用 pwsh、Linux/macOS 用 bash）+ sandbox_permissions）'
    }
    return null
  }
  // cordis（官方工具集，只读引用）：当前支持两个只读工具。
  if (name === 'cordis_inspect_list' || name === 'cordis_inspect_query') {
    return null
  }
  const isPwshMutation = name === 'pwsh' && pwshMutationMatches(exec)
  const isBashMutation = name === 'bash' && bashMutationMatches(exec)
  if (isPwshMutation || isBashMutation) {
    const shellLabel = isBashMutation ? 'bash' : 'pwsh'
    if (!escape && state.route !== 'direct' && state.approved !== true) {
      return routeDenyReason(shellLabel, state, gateRuntime)
    }
    // 新增：approved 态下，shell 写命令需区分工作区内/越界（pwsh 与 bash 同口径）
    if (!escape && state.approved === true && state.route !== 'direct') {
      const args = exec.arguments
      const hasEscalation = args !== undefined && args !== null && typeof args === 'object' && typeof args.sandbox_permissions === 'string'
      if (!hasEscalation) {
        return '方案已批准，工作区内写入请走 subagent 委派执行者。越界操作（工作区外写入）请带 sandbox_permissions 参数（如 sandbox_permissions: "workspace-write"）与 justification 重试'
      }
    }
    return null
  }
  if (name === planToolName) {
    if (!escape && (state.route !== 'plan' || state.clarified !== true || (state.purpose !== 'refine' && state.purpose !== 'redo'))) {
      return planDenyReason('subagent_plan', state, gateRuntime)
    }
    // 新增：continuable 默认后台，传 false 是试图前台等待绕开续轮
    const args = exec.arguments
    if (args !== undefined && args !== null && typeof args === 'object' && args.run_in_background === false) {
      return '规划子代理不可前台等待：run_in_background 参数不得传 false（continuable 固定后台运行）。请移除 run_in_background: false 或省略该参数'
    }
    return null
  }
  if (name === 'save_probe') {
    if (!escape && (state.route !== 'plan' || state.clarified !== true || (state.purpose !== 'refine' && state.purpose !== 'redo'))) {
      return planDenyReason('save_probe', state, gateRuntime)
    }
    return null
  }
  if (name === 'subagent' || name === 'subagent_fork' || name === 'workflow' || name === 'ralph' || name === 'subagent_review') {
    if (!escape && state.approved !== true) {
      return approvalDenyReason(name, state, gateRuntime)
    }
    // 新增：one-shot 默认前台，需模型显式传 true 走后台 job
    if (name === 'subagent' || name === 'subagent_review') {
      const args = exec.arguments
      if (args !== undefined && args !== null && typeof args === 'object' && args.run_in_background !== true) {
        return '执行者/reviewer 必须后台运行：请传 run_in_background: true'
      }
    }
    return null
  }
  // 主会话层工具限制（v0.4.0 四工具治理）：job_kill 仅直行路线放行；
  // send_message 主会话向 running 目标拒绝；job_list/list_agents 同锚点防轮询。
  // planner/只读 child/执行者不进本函数（pre-execute 角色分流），子代理侧维持现状。
  if (name === 'job_kill') {
    if (!escape && state.route !== 'direct') {
      return `当前状态禁止job_kill。如用户要求停止子代理，${gateRuntime.confirm.route}，选择「${gateRuntime.words.routeDirect}」后才可执行 job_kill`
    }
    return null
  }
  if (name === 'send_message') {
    // 主会话调用者：目标 running → 拒；idle/未驻留/agents 服务不可用 → 放行
    // （one-shot 目标由宿主 coldResume NOT_RESUMABLE 自拒；escape 通道逃生放行防死锁）。
    if (!escape && typeof ctx.getAgents === 'function') {
      const agents = ctx.getAgents()
      if (agents !== undefined && agents !== null && typeof agents.get === 'function') {
        const smArgs = exec !== undefined && exec !== null ? exec.arguments : undefined
        const targetId = smArgs !== undefined && smArgs !== null && typeof smArgs === 'object' && typeof smArgs.agent_id === 'string' ? smArgs.agent_id : undefined
        if (targetId !== undefined) {
          const target = agents.get(targetId)
          if (target !== undefined && target !== null && target.status === 'running') {
            return '子代理running中，禁止打扰'
          }
        }
      }
    }
    return null
  }
  if (name === 'job_list' || name === 'list_agents') return pollGuardGateReason(exec, ctx.pollGuardCounters)
  if (name === 'run_code') {
    return runCodeGroupDenyReason(state, exec, { kind: 'main' }, { events, planToolName, jobOutputCallCounters: ctx.jobOutputCallCounters, pollGuardCounters: ctx.pollGuardCounters, getAgents: ctx.getAgents, runcodeCatchGate: ctx.runcodeCatchGate, runCodeDepth: (typeof ctx.runCodeDepth === 'number' ? ctx.runCodeDepth : 0) + 1, gateRuntime })
  }
  if (name === 'job_output') return jobOutputGateReason(exec, ctx.jobOutputCallCounters)
  return null
}

// 组判定：run_code 拆解 → 逐成员走「与直呼完全相同的闸门」→ 聚合拒绝。
// state：主会话 flow state（role.kind==='main' 时必传；其它角色忽略）；缺省归一化为
// { route:'none', clarified:false, approved:false, purpose:'none', channelBroken:false }。
// role：{ kind:'main' } | { kind:'planner' } | { kind:'child', readOnly:boolean, probe:boolean }。
// gateCtx: { events, planToolName, jobOutputCallCounters, pollGuardCounters, runCodeDepth, runcodeCatchGate, getAgents(可选), gateRuntime }（gateRuntime 必填）。
// 缺省：events:[]、planToolName:'subagent_plan'、jobOutputCallCounters:new Map()、pollGuardCounters:new Map()、
// exploreBudget:DEFAULT_EXPLORE_BUDGET、runCodeDepth:0、runcodeCatchGate:false；getAgents 不设缺省（undefined 即 fail-open 放行）；
// gateRuntime 必须由调用方显式传入（词表唯一值源是 config.gateWords，helper 无默认词表）。
// 多调用容错硬闸门：成员逐项判定之后、聚合之前执行 runCodeCatchGateReason（教学式文案）。
// 返回 null=放行；非 null=聚合拒绝文案。
function runCodeGroupDenyReason(state, exec, role, gateCtx) {
  const ctx = {
    events: [],
    planToolName: 'subagent_plan',
    jobOutputCallCounters: new Map(),
    pollGuardCounters: new Map(),
    exploreBudget: DEFAULT_EXPLORE_BUDGET,
    runCodeDepth: 0,
    runcodeCatchGate: false,
    ...(gateCtx !== undefined && gateCtx !== null ? gateCtx : {}),
  }
  const st = state !== undefined && state !== null
    ? state
    : { route: 'none', clarified: false, approved: false, purpose: 'none', channelBroken: false }
  const r = role !== undefined && role !== null && typeof role === 'object' && typeof role.kind === 'string' ? role : { kind: 'main' }
  const roleKind = r.kind
  const members = []
  const denies = []
  const visit = (codeArg, depth) => {
    // ask 返回值硬闸门只接入主会话；嵌套超出既有展开深度的部分仍由实际 pre-execute 重入兜底。
    const askReason = roleKind === 'main' ? askUserQuestionReturnGateReason(codeArg) : null
    const decomposed = decomposeRunCode(codeArg)
    if (askReason !== null) {
      const askMember = { kind: 'tool', name: ASK_TOOL, argsParsed: true, args: {}, argsText: '' }
      if (!decomposed.members.some((member) => member.kind === 'tool' && member.name === ASK_TOOL)) members.push(askMember)
      denies.push({ member: askMember, reason: askReason })
    }
    for (const member of decomposed.members) {
      // 嵌套 run_code 成员展平：depth>=1 或参数不可解析 → 跳过（运行时瀑布兜底）；
      // 否则递归拆解 member.args.code 并原位展平（子成员按 role 继续判定）。
      if (member.name === 'run_code' && member.kind === 'tool') {
        if (depth >= 1 || !member.argsParsed || member.args === null || typeof member.args.code !== 'string') continue
        visit(member.args.code, depth + 1)
        continue
      }
      members.push(member)
      const vExec = member.kind === 'bare-write'
        ? { name: 'write', bare: true, hints: member.hints, arguments: {}, sub: true }
        : { name: member.name, arguments: member.argsParsed ? member.args : member.argsText, sub: true }
      let reason = null
      if (member.name === 'subagent_probe') {
        reason = subagentProbeGateReason(vExec, roleKind === 'planner')
      } else if (member.kind === 'bare-write') {
        // 裸写成员按角色分流：只读角色保留 v2 共享文案（hits 拼写与既有共享文案逐字同构）；
        // 主会话走 write/edit 闸门（routeDenyReason 与 approved 文案）；
        // 执行者（child 非只读）豁免。
        if (roleKind === 'planner' || (roleKind === 'child' && r.readOnly === true)) {
          const h = member.hints
          reason = `只读角色仅允许只读探查：run_code 代码命中写模式特征 ${h.length} 处（${h.slice(0, 3).join('、')}${h.length > 3 ? ' 等' : ''}）。请改用 read/glob/grep 或 shell 只读命令`
        } else if (roleKind === 'main') {
          reason = mainGateReason(st, vExec, ctx)
        } // 执行者豁免：reason 保持 null
      } else if (roleKind === 'planner') {
        reason = plannerGateReason(vExec, ctx.events !== undefined ? ctx.events : [], ctx.exploreBudget, ctx.jobOutputCallCounters)
      } else if (roleKind === 'child') {
        reason = r.readOnly === true ? childReadonlyGateReason(vExec, r.probe === true, ctx.jobOutputCallCounters) : null
      } else {
        reason = mainGateReason(st, vExec, ctx)
      }
      if (reason !== null) denies.push({ member, reason })
    }
  }
  visit(runCodeTextOf(exec), ctx.runCodeDepth)
  if (ctx.runcodeCatchGate === true) {
    const catchReason = runCodeCatchGateReason(runCodeTextOf(exec))
    if (catchReason !== null) denies.push({ member: { kind: 'catch', name: 'run_code' }, reason: catchReason })
  }
  if (roleKind === 'planner') {
    const siteCount = runCodeSiteCount(runCodeTextOf(exec))
    if (siteCount > ctx.exploreBudget) denies.push({ member: { kind: 'cap', name: 'run_code' }, reason: `run_code 静态调用点 ${siteCount} 处超过单实例子调用上限 ${ctx.exploreBudget}（exploreBudget）：请拆分多个 run_code 或减少单次调用点` })
    // 新增（T2 修复）：预算耗尽白名单把关——budgetExceeded(toolCallsSinceUser(events, FREE_TOOLS)+1, exploreBudget) 时，
    // run_code 工具组必须成员组非空且全部 ∈ FREE_TOOLS 才放行；空组/动态访问（decomposeRunCode 置 dynamic）/
    // 任何非 FREE_TOOLS 成员（含嵌套 run_code、bare-write）→ 拒绝（保守）。拒绝文案=预算耗尽原文+动态拼接白名单。
    const budgetUsed = toolCallsSinceUser(ctx.events !== undefined ? ctx.events : [], FREE_TOOLS)
    if (budgetExceeded(budgetUsed + 1, ctx.exploreBudget)) {
      const budgetDecomposed = decomposeRunCode(runCodeTextOf(exec))
      const allFree = budgetDecomposed.dynamic !== true && budgetDecomposed.members.length > 0 && budgetDecomposed.members.every((m) => FREE_TOOLS.has(m.name))
      if (!allFree) {
        denies.push({ member: { kind: 'budget', name: 'run_code' }, reason: budgetExhaustedReason(Math.min(budgetUsed, ctx.exploreBudget), ctx.exploreBudget) + ` 预算耗尽后 run_code 仅可调用 ${[...FREE_TOOLS].join('/')}，其他工具均不放行` })
      }
    }
  }
  if (denies.length === 0) return null
  return aggregateRunCodeDenyReason(members, denies)
}

// 聚合报错（统一格式，任何一次组判定拒绝均用此格式；子文案逐字不变）：
// header 一行（组规模 + 触发明细计数 + 「全通过才放行」语义）+ 逐行 `- <标签>: <子文案>`；
// 标签规则：普通成员=工具名；裸写=`write（裸写特征：<hints 顿号连接>）`；
// 参数不可解析=`<工具名>（参数不可解析）`；行序=组员顺序（展平后）；子文案来自闸门函数原返回值；catch/cap/budget 直接取成员 name。
function aggregateRunCodeDenyReason(members, denies) {
  const lines = [`run_code 拆解预审未通过：工具组共 ${members.length} 项（去重后），${denies.length} 项触发闸门，任一触发即整体拒绝：`]
  for (const d of denies) {
    if (d.member.kind === 'catch') { lines.push(`- ${d.member.name}: ${d.reason}`); continue }
    if (d.member.kind === 'cap') { lines.push(`- ${d.member.name}: ${d.reason}`); continue }
    if (d.member.kind === 'budget') { lines.push(`- ${d.member.name}: ${d.reason}`); continue }
    let label = d.member.name
    if (d.member.kind === 'bare-write') label = `write（裸写特征：${d.member.hints.join('、')}）`
    else if (!d.member.argsParsed) label = `${d.member.name}（参数不可解析）`
    lines.push(`- ${label}: ${d.reason}`)
  }
  return lines.join('\n')
}





// run_code 静态 helper 单向接线：依赖只由根的 ASK_TOOL 与双兼容 dispatch 判定显式注入。
const {
  decomposeRunCode,
  runCodeCatchGateReason,
  collectRunCodeSites,
  askUserQuestionReturnGateReason,
  runCodeSiteCount,
  isRunCodeSubCall,
  runCodeDispatchGateReason,
  runCodeDispatchCapText,
} = createRunCodeStatic({ askTool: ASK_TOOL, isDispatchStart })

export {
  CHANNEL_BROKEN_CODES, FREE_TOOLS, ASK_TOOL,
  purposeRouteDenyReason, routeDenyReason, planDenyReason, approvalDenyReason,
  isBootstrapPhase, filterBootstrapContextDecision, dedupeProjectedSkillCatalogDecision, labelsOfCallData,
  askKindOf, askKindOfRelaxed, isExactGateSet, isPartialGateSet, categorizeGateAsk, gateAskDenyReason, validateGateAskStructure,
  matchRouteLabel, matchApprovalLabel, matchPurposeLabel, parseAskResultData, parseDispatchAskResult, deriveFlowState,
  catalogHasWriteTools, isReadOnlyChildByCatalog, schemasHasWriteTools, schemasHasTool, catalogIsCollapsed,
  subagentProbeGateReason, shellMutationReason, plannerGateReason, childReadonlyGateReason, jobOutputGateReason, recordJobOutputCall,
  pollGuardGateReason, recordPollGuardCall, probeDisposalWarning, mainGateReason, runCodeGroupDenyReason, aggregateRunCodeDenyReason,
  decomposeRunCode, runCodeCatchGateReason, collectRunCodeSites, askUserQuestionReturnGateReason, runCodeSiteCount, isRunCodeSubCall, runCodeDispatchGateReason, runCodeDispatchCapText,
}
