// step-07-子代理模型与引导取证.mjs — 显式会话的只读实机证据查看
// 用法：传入 --session <顶层主会话ID> 与 --sessions-dir，并显式提供 PLANNER_PROMPT_SUFFIX。
// 本工具只读会话日志；无会话选择时 NOT-RUN，不创建会话、不发起 Provider 请求、不写生产 DSH_HOME。
import fs from 'node:fs'
import path from 'node:path'
import { framesOf, decodeText } from '../_shared/zstd-frames.mjs'
import { authorizedSessionLogPath, findSession } from '../_shared/session-finder.mjs'
import { parseMaintenanceArgs, createMaintenanceContext } from '../_shared/workspace-paths.mjs'
import { toolResultOf } from '../_shared/v4-tool-result.mjs'
import { createOutput, sha256Text } from '../_shared/test-output.mjs'

const failInput = (message) => {
  console.error('输入错误：' + message)
  process.exit(1)
}
let maintenanceArgs
let maintenanceContext
try {
  maintenanceArgs = parseMaintenanceArgs(process.argv.slice(2))
  maintenanceContext = createMaintenanceContext(maintenanceArgs)
} catch (error) {
  failInput(error instanceof Error ? error.message : String(error))
}
const argv = maintenanceArgs.domainArgv
const output = createOutput({ argv })
const hasOwn = (name) => Object.prototype.hasOwnProperty.call(process.env, name)
const sessionInput = maintenanceContext.session
if (sessionInput === null || typeof sessionInput !== 'object' || sessionInput.mode === 'none') {
  console.log('NOT-RUN：未显式选择会话；未读取会话日志')
  process.exit(0)
}
if (sessionInput.mode !== 'id' || typeof sessionInput.id !== 'string' || sessionInput.id.trim() === '') failInput('--session 必须显式传入顶层主会话ID，并同时提供 --sessions-dir')
const sessionId = sessionInput.id
if (sessionId.includes('/') || sessionId.includes('\\')) failInput('SESSION_ID 必须是顶层会话 ID，不接受会话路径')
if (!hasOwn('PLANNER_PROMPT_SUFFIX')) failInput('必须显式设置 PLANNER_PROMPT_SUFFIX；空串也必须显式传入')
const plannerPromptSuffix = process.env.PLANNER_PROMPT_SUFFIX
if (typeof plannerPromptSuffix !== 'string') failInput('PLANNER_PROMPT_SUFFIX 必须是字符串')

const found = findSession(undefined, { maintenanceContext })
if (found.kind === 'notfound') failInput('SESSION_ID 未找到：' + found.arg)
if (found.kind === 'incomplete') { console.error('INCOMPLETE ' + found.reason); process.exit(1) }
if (found.kind !== 'explicit' || !Array.isArray(found.dirs) || found.dirs.length === 0 || typeof found.base !== 'string' || found.pathContext === undefined) {
  failInput('SESSION_ID 未定位到显式顶层主会话或可信读取上下文')
}
function v4LogOf(dir) {
  const log = authorizedSessionLogPath(path.join(found.base, dir), found.pathContext, { kind: found.pathKind, names: ['session.v4.jsonl.zstd'] })
  return log === null ? null : log.realPath
}

const isObject = (value) => value !== null && typeof value === 'object' && !Array.isArray(value)
const typeNames = (event) => {
  const raw = event === null || typeof event !== 'object' ? undefined : event.type
  return (Array.isArray(raw) ? raw : [raw]).filter((value) => value !== undefined).map((value) => String(value))
}
const hasType = (event, name) => typeNames(event).includes(name)
const dataOf = (event) => (event !== null && typeof event === 'object' && isObject(event.data) ? event.data : {})
const messageOf = (data) => {
  if (isObject(data.message)) return data.message
  if (isObject(data.data) && isObject(data.data.message)) return data.data.message
  return null
}
const contentOf = (data) => {
  const message = messageOf(data)
  if (message !== null && Array.isArray(message.content)) return message.content
  if (Array.isArray(data.content)) return data.content
  return []
}
const sourceOf = (data) => {
  const message = messageOf(data)
  if (message !== null && isObject(message.source)) return message.source
  if (isObject(data.source)) return data.source
  return {}
}
const valueText = (value) => {
  if (value === undefined) return '<缺失>'
  if (typeof value === 'string') return value
  try { return JSON.stringify(value) } catch { return String(value) }
}
const jsonText = (value) => {
  try { return JSON.stringify(value) } catch { return String(value) }
}
const firstDefined = (...values) => values.find((value) => value !== undefined)
const stripSessionPrefix = (value) => typeof value === 'string' ? value.replace(/^session-/, '') : value

function sessionHeaderOf(event) {
  const data = dataOf(event)
  const nested = isObject(data.header) ? data.header : {}
  const pick = (name) => firstDefined(event[name], data[name], nested[name])
  return {
    id: pick('id'),
    parentSession: pick('parentSession'),
    origin: pick('origin'),
    delegationDepth: pick('delegationDepth'),
    cwd: pick('cwd'),
    version: pick('version'),
  }
}

function parseSession(dir) {
  const directory = path.join(found.base, dir)
  const file = v4LogOf(dir)
  if (file === null) return { dir, directory, file: null, events: [], parseFailures: 0, decodeFailures: 0, lineCount: 0, header: {} }
  const buf = fs.readFileSync(file)
  const events = []
  let lineCount = 0
  let parseFailures = 0
  let decodeFailures = 0
  let pending = ''
  const consumeRaw = (raw) => {
    lineCount += 1
    const line = raw.trim()
    if (line === '') return
    try {
      events.push({ line: lineCount, event: JSON.parse(line) })
    } catch {
      parseFailures += 1
    }
  }
  for (const frame of framesOf(buf)) {
    let text
    try {
      text = decodeText(buf, frame)
    } catch (error) {
      decodeFailures += 1
      console.error('L? 解码失败（' + dir + '）：' + (error instanceof Error ? error.message : String(error)))
      continue
    }
    const parts = (pending + text).split(/\r?\n/)
    pending = parts.pop() || ''
    for (const raw of parts) consumeRaw(raw)
  }
  if (pending !== '') consumeRaw(pending)
  const first = events.find((item) => hasType(item.event, 'session'))
  return {
    dir,
    directory,
    file,
    fileName: path.basename(file),
    generation: 'v4',
    events,
    parseFailures,
    decodeFailures,
    lineCount,
    header: first === undefined ? {} : sessionHeaderOf(first.event),
  }
}



function textBlocksOf(data) {
  return contentOf(data).map((block, index) => ({
    index,
    type: isObject(block) ? block.type : undefined,
    text: isObject(block) && typeof block.text === 'string' ? block.text : undefined,
  })).filter((block) => block.type === 'text' && typeof block.text === 'string')
}

function parseCallArguments(raw) {
  if (isObject(raw)) return raw
  if (typeof raw !== 'string') return null
  try {
    const parsed = JSON.parse(raw)
    return isObject(parsed) ? parsed : null
  } catch {
    return null
  }
}

const CHILD_TOOL_NAMES = new Set([
  'subagent_plan', 'subagent', 'subagent_probe', 'subagent_review', 'subagent_fork',
  'workflow', 'ralph', 'subagent_run',
])
function ptcDispatchCallOf(item) {
  if (!hasType(item.event, 'tool/ptc-dispatch-start')) return null
  const data = dataOf(item.event)
  if (typeof data.name !== 'string' || !CHILD_TOOL_NAMES.has(data.name)) return null
  return {
    line: item.line,
    name: data.name,
    callId: data.subCallId,
    arguments: parseCallArguments(data.arguments),
    rawArguments: data.arguments,
    event: item.event,
  }
}
function toolCallOf(item) {
  if (!hasType(item.event, 'tool/call')) return null
  const data = dataOf(item.event)
  if (typeof data.name !== 'string' || !CHILD_TOOL_NAMES.has(data.name)) return null
  const args = parseCallArguments(data.arguments)
  return {
    line: item.line,
    name: data.name,
    callId: data.callId,
    arguments: args,
    rawArguments: data.arguments,
    event: item.event,
  }
}

function resultRecordsOf(session) {
  return session.events.map((item) => {
    const result = toolResultOf(item.event)
    if (result === null) return null
    return { line: item.line, callId: result.callId, isError: result.isError, text: result.text, event: item.event }
  }).filter((record) => record !== null)
}

function aliasMapOf(children) {
  const aliases = new Map()
  const add = (alias, dir) => {
    if (typeof alias !== 'string' || alias.length < 4) return
    const set = aliases.get(alias) || new Set()
    set.add(dir)
    aliases.set(alias, set)
  }
  const addVariants = (value, dir) => {
    if (typeof value !== 'string' || value === '') return
    const bare = stripSessionPrefix(value)
    add(value, dir)
    add(bare, dir)
    if (typeof bare === 'string' && bare !== '') add('session-' + bare, dir)
  }
  for (const child of children) {
    addVariants(child.dir, child.dir)
    addVariants(child.header.id, child.dir)
  }
  return aliases
}
function childDirsMentioned(value, aliases) {
  const haystack = typeof value === 'string' ? value : jsonText(value)
  const dirs = new Set()
  for (const [alias, candidates] of aliases) {
    if (haystack.includes(alias)) for (const dir of candidates) dirs.add(dir)
  }
  return [...dirs]
}

function buildParentLinks(parent, children) {
  const aliases = aliasMapOf(children)
  const calls = parent.events.map(toolCallOf).filter((call) => call !== null)
  const results = resultRecordsOf(parent)
  const dispatchCalls = parent.events.map(ptcDispatchCallOf).filter((call) => call !== null)
  const dispatchResults = parent.events.map((item) => {
    if (!hasType(item.event, 'tool/ptc-dispatch')) return null
    const data = dataOf(item.event)
    if (typeof data.subCallId !== 'string' || data.subCallId === '') return null
    if (typeof data.name !== 'string' || !CHILD_TOOL_NAMES.has(data.name)) return null
    const text = (Array.isArray(data.content) ? data.content : []).map((block) => isObject(block) && block !== null && typeof block.text === 'string' ? block.text : '').join('')
    return { line: item.line, callId: data.subCallId, isError: data.isError === true, text, event: item.event }
  }).filter((result) => result !== null)
  const seenCallIds = new Set(calls.map((call) => call.callId).filter((id) => id !== undefined))
  for (const call of dispatchCalls) {
    if (call.callId === undefined || seenCallIds.has(call.callId)) continue
    seenCallIds.add(call.callId)
    calls.push(call)
    const result = dispatchResults.find((record) => record.callId === call.callId)
    if (result !== undefined) results.push(result)
  }
  const links = []
  for (const result of results) {
    const matchedCalls = calls.filter((call) => result.callId !== undefined && call.callId === result.callId)
    const dirs = childDirsMentioned(result.event, aliases)
    for (const dir of dirs) {
      const call = matchedCalls[0]
      links.push({
        dir,
        name: call === undefined ? '<未配对工具结果>' : call.name,
        call,
        result,
        complete: call !== undefined && result.isError !== true,
      })
    }
  }
  for (const call of calls) {
    const callDirs = childDirsMentioned(call.arguments !== null ? call.arguments : call.rawArguments, aliases)
    if (callDirs.length === 0) continue
    const hasMatchedResult = links.some((link) => link.call === call)
    if (!hasMatchedResult) {
      for (const dir of callDirs) links.push({ dir, name: call.name, call, result: null, complete: false })
    }
  }
  return { calls, results, links }
}

function descriptorRecordsOf(session) {
  return session.events.filter((item) => hasType(item.event, 'subagent/descriptor')).map((item) => ({
    line: item.line,
    data: dataOf(item.event),
    event: item.event,
  }))
}
function descriptorModeOf(session) {
  const item = descriptorRecordsOf(session).find((record) => {
    const nested = isObject(record.data.descriptor) ? record.data.descriptor : {}
    return typeof firstDefined(record.data.mode, nested.mode) === 'string'
  })
  if (item === undefined) return undefined
  const nested = isObject(item.data.descriptor) ? item.data.descriptor : {}
  return firstDefined(item.data.mode, nested.mode)
}
function roleOf(child, parentLinks) {
  const complete = parentLinks.filter((link) => link.complete)
  const plan = complete.filter((link) => link.name === 'subagent_plan')
  const nonPlan = complete.filter((link) => link.name !== 'subagent_plan')
  if (child.mode === 'continuable' && plan.length > 0) return 'pro规划'
  if (nonPlan.length > 0 || (child.mode === 'one-shot' && complete.length > 0)) return '非pro规划'
  return 'role-evidence-insufficient'
}

function headerRecordsOf(session) {
  const headers = []
  const contexts = []
  const selections = []
  const systems = []
  for (const item of session.events) {
    const data = dataOf(item.event)
    if (hasType(item.event, 'request/header')) {
      const header = isObject(data.header) ? data.header : data
      const config = isObject(header.config) ? header.config : {}
      headers.push({ line: item.line, provider: config.provider, model: config.model, event: item.event })
      if (header.system !== undefined) systems.push({ line: item.line, value: header.system })
    }
    if (hasType(item.event, 'request/context')) {
      const context = isObject(data.context) ? data.context : data
      contexts.push({ line: item.line, provider: context.provider, model: context.model, contextWindow: context.contextWindow, event: item.event })
    }
    if (hasType(item.event, 'model/selection')) selections.push({ line: item.line, data, event: item.event })
  }
  return { headers, contexts, selections, systems }
}
function provenanceRecordsOf(session) {
  return session.events.filter((item) => hasType(item.event, 'assistant/message')).map((item) => {
    const data = dataOf(item.event)
    const source = sourceOf(data)
    return { line: item.line, source, event: item.event, blocks: textBlocksOf(data) }
  }).filter((record) => record.source.kind === 'model')
}
function plannerMessagesOf(session) {
  return session.events.map((item) => {
    const data = dataOf(item.event)
    const source = sourceOf(data)
    if (source.kind !== 'user' && source.kind !== 'agent-message') return null
    const blocks = textBlocksOf(data)
    if (blocks.length === 0) return null
    return { line: item.line, kind: source.kind, blocks, event: item.event }
  }).filter((record) => record !== null)
}

const budgetPatterns = [
  /本轮探查预算上限为[\s\S]*?（系统会自动检测未探查项）/g,
  /本轮探查预算还剩[\s\S]*?未查项记入待确认假设清单/g,
  /探查预算已耗尽（[\s\S]*?save_plan 落盘。/g,
]
function budgetFragmentsOf(text) {
  const out = []
  for (const pattern of budgetPatterns) {
    pattern.lastIndex = 0
    for (const match of text.matchAll(pattern)) if (!out.includes(match[0])) out.push(match[0])
  }
  return out
}
function isHostGuidance(text) {
  return text.includes('Your parent agent id is ')
}
function firstTextForSuffix(messages) {
  if (messages.length === 0) return null
  const first = messages[0]
  return first.blocks.length === 0 ? null : first.blocks[0]
}
function linkedPlanLinks(parentLinks) {
  return parentLinks.filter((link) => link.name === 'subagent_plan' && link.complete)
}
function parentPromptEvidence(parentLinks) {
  return linkedPlanLinks(parentLinks).filter((link) => link.call !== undefined && typeof link.call.arguments?.prompt === 'string')
}
function suffixLevel(child, parentLinks, route, messages) {
  if (child.role !== 'pro规划' && child.role !== 'role-evidence-insufficient') return 'role-evidence-insufficient'
  if (child.mode !== 'continuable') return 'role-evidence-insufficient'
  const planningRequest = parentLinks.length > 0 || route.headers.length > 0 || route.contexts.length > 0 || route.selections.length > 0
  if (!planningRequest && messages.length === 0) return 'no-log'
  if (messages.length === 0) return 'attempted-only'
  const first = firstTextForSuffix(messages)
  const textExcludingBudget = first !== null ? budgetFragmentsOf(first.text).reduce((t, f) => t.replaceAll(f, ''), first.text) : ''
  const suffixMatch = plannerPromptSuffix !== '' && first !== null && !isHostGuidance(first.text) && textExcludingBudget.includes(plannerPromptSuffix)
  if (!suffixMatch) return 'absent'
  if (child.role !== 'pro规划') return 'content-only'
  const prompts = parentPromptEvidence(parentLinks)
  const parentHasSuffix = prompts.some((record) => record.call.arguments.prompt.includes(plannerPromptSuffix))
  const associationComplete = linkedPlanLinks(parentLinks).length > 0 && prompts.length === linkedPlanLinks(parentLinks).length
  if (parentHasSuffix || !associationComplete) return 'content-only'
  return 'verified-injection'
}

function printFullText(label, text) {
  console.log(label)
  console.log(text)
}
function printParentEvidence(parentBundle, parent) {
  const planCalls = parentBundle.calls.filter((call) => call.name === 'subagent_plan')
  const planCallIds = new Set(planCalls.map((call) => call.callId).filter((id) => id !== undefined))
  const planResults = parentBundle.results.filter((result) => planCallIds.has(result.callId))
  if (output.mode !== 'full') {
    console.log('A42 parent subagent_plan index session=' + parent.dir + ' calls=' + planCalls.length + ' results=' + planResults.length)
    for (const call of planCalls) {
      const childIds = parentBundle.links.filter((link) => link.call === call).map((link) => link.dir)
      console.log('L' + call.line + ' PARENT CALL subagent_plan callId=' + valueText(call.callId) + ' childIds=' + jsonText(childIds))
    }
    for (const result of planResults) console.log('L' + result.line + ' PARENT RESULT subagent_plan callId=' + valueText(result.callId) + ' isError=' + (result.isError ? 'true' : 'false'))
    console.log('父会话=' + parent.dir + '；subagent_plan association indexed=true')
    return
  }
  console.log('--- 父会话 subagent_plan 原始材料（逐条、完整） ---')
  if (planCalls.length === 0 && planResults.length === 0) console.log('(无 subagent_plan call/result)')
  for (const call of planCalls) {
    const prompt = call.arguments !== null && typeof call.arguments.prompt === 'string' ? call.arguments.prompt : undefined
    console.log('L' + call.line + ' PARENT CALL subagent_plan callId=' + valueText(call.callId))
    console.log('arguments.prompt（完整' + (prompt === undefined ? '·缺失' : '') + '）')
    if (prompt === undefined) console.log('<缺失>')
    else console.log(prompt)
    console.log('arguments（完整）=' + (typeof call.rawArguments === 'string' ? call.rawArguments : jsonText(call.rawArguments)))
    console.log('parent prompt suffix exact match=' + (plannerPromptSuffix !== '' && prompt !== undefined && prompt.includes(plannerPromptSuffix) ? 'yes' : 'no'))
  }
  for (const result of planResults) {
    console.log('L' + result.line + ' PARENT RESULT subagent_plan callId=' + valueText(result.callId) + ' isError=' + (result.isError ? 'true' : 'false'))
    printFullText('result text（完整）', result.text === '' ? '<无 text block>' : result.text)
    console.log('result event（完整）=' + jsonText(result.event))
  }
  console.log('父会话=' + parent.dir + '；父会话首行 header=' + jsonText(parent.header))
}

function printRouteEvidence(route) {
  if (output.mode !== 'full') {
    console.log('A42 attempted route index headers=' + route.headers.length + ' contexts=' + route.contexts.length + ' selections=' + route.selections.length)
    for (const record of route.headers) {
      const config = isObject(record.event?.data?.header?.config) ? record.event.data.header.config : {}
      console.log('L' + record.line + ' REQUEST/HEADER attempted route provider=' + valueText(config.provider) + ' model=' + valueText(config.model))
    }
    for (const record of route.contexts) console.log('L' + record.line + ' REQUEST/CONTEXT attempted route provider=' + valueText(record.provider) + ' model=' + valueText(record.model) + ' contextWindow=' + valueText(record.contextWindow))
    for (const record of route.selections) console.log('L' + record.line + ' MODEL/SELECTION attempted route fields=' + jsonText(Object.keys(record.data).sort()))
    return
  }
  console.log('--- 请求/路由证据（attempted route；逐条保留） ---')
  if (route.headers.length === 0 && route.contexts.length === 0 && route.selections.length === 0) console.log('(无 request/header、request/context、model/selection)')
  for (const record of route.headers) {
    const data = dataOf(record.event)
    const header = isObject(data.header) ? data.header : data
    const config = isObject(header.config) ? header.config : {}
    console.log('L' + record.line + ' REQUEST/HEADER attempted route request/header.data.header.config.provider=' + valueText(config.provider) + ' request/header.data.header.config.model=' + valueText(config.model))
    console.log('request/header event（完整）=' + jsonText(record.event))
  }
  for (const record of route.contexts) {
    console.log('L' + record.line + ' REQUEST/CONTEXT attempted route request/context.data.provider=' + valueText(record.provider) + ' request/context.data.model=' + valueText(record.model) + ' contextWindow=' + valueText(record.contextWindow))
    console.log('request/context event（完整）=' + jsonText(record.event))
  }
  for (const record of route.selections) console.log('L' + record.line + ' MODEL/SELECTION auxiliary fields（完整）=' + jsonText(record.data))
  console.log('--- header.system（单列，绝不计作 suffix） ---')
  if (route.systems.length === 0) console.log('(无 header.system)')
  for (const system of route.systems) printFullText('L' + system.line + ' header.system（完整；not suffix）', valueText(system.value))
}
function printProvenanceEvidence(provenance) {
  if (output.mode !== 'full') {
    console.log('A42 actual provenance index count=' + provenance.length)
    for (const record of provenance) console.log('L' + record.line + ' ASSISTANT/MESSAGE actual provenance source.kind=model provider=' + valueText(record.source.provider) + ' model=' + valueText(record.source.model))
    return
  }
  console.log('--- 实际产出 provenance（assistant/message；逐条保留） ---')
  if (provenance.length === 0) console.log('(无 assistant/message.data.message.source.kind=model)')
  for (const record of provenance) {
    console.log('L' + record.line + ' ASSISTANT/MESSAGE actual provenance source.kind=model provider=' + valueText(record.source.provider) + ' model=' + valueText(record.source.model))
    console.log('assistant/message event（完整）=' + jsonText(record.event))
  }
}
function printPlannerMessages(messages) {
  if (output.mode !== 'full') {
    console.log('A43 planner message index count=' + messages.length)
    const first = firstTextForSuffix(messages)
    if (first !== null) {
      const firstMessage = messages[0]
      const textExcludingBudget = budgetFragmentsOf(first.text).reduce((t, f) => t.replaceAll(f, ''), first.text)
      const exact = plannerPromptSuffix !== '' && !isHostGuidance(first.text) && textExcludingBudget.includes(plannerPromptSuffix)
      console.log('L' + firstMessage.line + ' first planner text block kind=' + firstMessage.kind + ' block[' + first.index + '] length=' + first.text.length + ' sha256=' + sha256Text(first.text))
      console.log('suffix exact match=' + (exact ? 'yes' : 'no'))
    }
    return
  }
  console.log('--- planner user/agent-message（逐块完整；仅首个 text block参与 suffix 判定） ---')
  if (messages.length === 0) console.log('(无 source.kind=user/agent-message 的可读 text block)')
  for (let messageIndex = 0; messageIndex < messages.length; messageIndex += 1) {
    const message = messages[messageIndex]
    for (const block of message.blocks) {
      const budget = budgetFragmentsOf(block.text)
      const category = []
      if (budget.length > 0) category.push('budgetNotice')
      if (isHostGuidance(block.text)) category.push('host guidance')
      const suffixCandidate = messageIndex === 0 && block.index === message.blocks[0].index
      console.log('L' + message.line + ' PLANNER-MESSAGE kind=' + message.kind + ' block[' + block.index + '] ' + (suffixCandidate ? 'suffix-candidate=initial-first-text' : 'suffix-candidate=no') + ' category=' + (category.length === 0 ? 'content' : category.join('+')))
      printFullText('text（完整）', block.text)
      for (const fragment of budget) printFullText('budgetNotice fragment（完整；not suffix）', fragment)
      if (isHostGuidance(block.text)) printFullText('host guidance block（完整；not suffix）', block.text)
      if (suffixCandidate) {
        const textExcludingBudget = block.text ? budgetFragmentsOf(block.text).reduce((t, f) => t.replaceAll(f, ''), block.text) : block.text
        console.log('suffix exact match=' + (plannerPromptSuffix !== '' && !isHostGuidance(block.text) && textExcludingBudget.includes(plannerPromptSuffix) ? 'yes' : 'no'))
      }
    }
  }
}

const mainDir = found.dirs[0]
if (v4LogOf(mainDir) === null) failInput('仅支持 v4 会话日志：目标日志必须是 session.v4.jsonl.zstd')
const parent = parseSession(mainDir)
if (Object.prototype.hasOwnProperty.call(parent.header, 'parentSession') && parent.header.parentSession !== undefined && parent.header.parentSession !== null && parent.header.parentSession !== '') {
  failInput('SESSION_ID 不是顶层主会话（parentSession=' + parent.header.parentSession + '）')
}
// 子会话集合由共享定位器在显式 --discover-children 下有界选出；此处只解析已选目录。
const children = found.dirs.slice(1).map(parseSession)
const sessions = [parent, ...children]
const parentBundle = buildParentLinks(parent, children)
const linksByDir = new Map(children.map((child) => [child.dir, parentBundle.links.filter((link) => link.dir === child.dir)]))

console.log('SESSION_ID（显式顶层主会话）=' + sessionId)
console.log('PLANNER_PROMPT_SUFFIX（显式存在=' + (hasOwn('PLANNER_PROMPT_SUFFIX') ? '是' : '否') + '；' + (plannerPromptSuffix === '' ? '空串' : '逐字基线') + '）')
if (output.mode === 'full') printFullText('suffix baseline（完整）', plannerPromptSuffix === '' ? '<empty string>' : plannerPromptSuffix)
else console.log('suffix baseline index length=' + plannerPromptSuffix.length + ' sha256=' + sha256Text(plannerPromptSuffix))
console.log('定位结果：' + found.kind + '；主会话=' + parent.dir + '；直接 child=' + children.length)
printParentEvidence(parentBundle, parent)

for (const session of sessions) {
  console.log('\n===== 会话 ' + session.dir + ' =====')
  if (session.file === null) {
    console.error('仅支持 v4 会话日志：目标日志必须是 session.v4.jsonl.zstd：' + session.directory)
    continue
  }
  console.log('日志文件名=' + session.fileName)
  console.log('会话目录=' + session.directory)
  console.log('日志代际=' + session.generation + '；header.version=' + valueText(session.header.version))
  console.log('JSONL行数=' + session.lineCount + '；解析失败计数=' + session.parseFailures + '；帧解码失败计数=' + session.decodeFailures)
  if (output.mode === 'full') console.log('session header（完整叶字段）=' + jsonText(session.header))
  else console.log('session header index keys=' + jsonText(Object.keys(session.header).sort()))
  const descriptors = descriptorRecordsOf(session)
  for (const descriptor of descriptors) {
    if (output.mode === 'full') console.log('L' + descriptor.line + ' DESCRIPTOR（完整）=' + jsonText(descriptor.event))
    else console.log('L' + descriptor.line + ' DESCRIPTOR index mode=' + valueText(descriptor.data.mode || descriptor.data.descriptor?.mode))
  }
  if (session === parent) continue
  const links = linksByDir.get(session.dir) || []
  const mode = descriptorModeOf(session)
  const role = roleOf({ mode }, links)
  const route = headerRecordsOf(session)
  const provenance = provenanceRecordsOf(session)
  const messages = mode === 'continuable' ? plannerMessagesOf(session) : []
  const routeStatus = (route.headers.length + route.contexts.length + route.selections.length) > 0
    ? (provenance.length > 0 ? 'actual-provenance' : 'attempted-only')
    : (provenance.length > 0 ? 'actual-provenance-without-request-header' : 'no-log')
  console.log('child谱系：parentSession=' + valueText(session.header.parentSession) + ' origin=' + valueText(session.header.origin) + ' delegationDepth=' + valueText(session.header.delegationDepth) + ' descriptor.mode=' + valueText(mode) + ' role=' + role)
  if (links.length === 0) console.log('父工具关联：role-evidence-insufficient（无可关联 parent call/result child ID）')
  for (const link of links) console.log('父工具关联：' + link.name + ' call=L' + (link.call === undefined ? '?' : link.call.line) + ' result=L' + (link.result === null ? '?' : link.result.line) + ' child ID=' + session.dir + ' complete=' + (link.complete ? 'yes' : 'no'))
  printRouteEvidence(route)
  printProvenanceEvidence(provenance)
  if (role === 'pro规划' || role === 'role-evidence-insufficient') {
    printPlannerMessages(messages)
    const level = suffixLevel({ role, mode }, links, route, messages)
    console.log('suffix判定=' + level)
    console.log('模型证据等级=' + routeStatus + '（前栏=request/header/context/selection attempted route；后栏=assistant/message actual provenance）')
  } else {
    console.log('suffix判定=not-applicable')
    console.log('模型证据等级=' + routeStatus + '（前栏=request/header/context/selection attempted route；后栏=assistant/message actual provenance）')
  }
}

const missingLog = sessions.some((session) => session.file === null)
process.exitCode = missingLog ? 1 : 0
