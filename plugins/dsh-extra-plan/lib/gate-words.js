// gateWords 元数据、整组严格校验与每次 apply 的运行时词表派生。
// YAML 的 config.gateWords 是唯一人工值源；本模块只保存字段规格与校验规则，不保存默认词值，
// 不读文件或环境变量；非法整组以 extra-plan: config.gateWords 前缀同步抛错。
// 有效结果冻结，并由显式参数传入各 helper；每次 apply 独立派生，避免模块全局状态串扰。
// 推荐后缀仅按文档白名单归一，匹配仍使用当前词的精确值。
const RECOMMENDED_SUFFIX = /\s*(?:\((?:recommended|推荐)\)|（(?:recommended|推荐)）)\s*$/i

/** 7 个闸门词字段与对应 prompt variable 名（仅元数据，不含任何词值）。 */
export const GATE_WORD_FIELDS = Object.freeze([
  Object.freeze({ field: 'routeDirect', variable: 'extra_plan_route_direct' }),
  Object.freeze({ field: 'routePlan', variable: 'extra_plan_route_plan' }),
  Object.freeze({ field: 'routeDisagree', variable: 'extra_plan_route_disagree' }),
  Object.freeze({ field: 'approvalApprove', variable: 'extra_plan_approval_approve' }),
  Object.freeze({ field: 'approvalReplan', variable: 'extra_plan_approval_replan' }),
  Object.freeze({ field: 'purposeRefine', variable: 'extra_plan_purpose_refine' }),
  Object.freeze({ field: 'purposeRedo', variable: 'extra_plan_purpose_redo' }),
])

/** 7 个字段名（顺序即 YAML 中的集中排列顺序）。 */
export const GATE_WORD_FIELD_NAMES = Object.freeze(GATE_WORD_FIELDS.map((item) => item.field))

/** 整组 locator：源模板（资产）内 id=extra-plan 行的 config.gateWords（供 resolveSetting 直接使用）。 */
export const GATE_WORDS_GROUP_DEFINITION = Object.freeze({
  id: 'extra-plan',
  rowId: 'extra-plan',
  path: 'config.gateWords',
  keys: GATE_WORD_FIELD_NAMES,
  sourceLocator: Object.freeze({ rowId: 'extra-plan', path: 'config.gateWords' }),
})

function fail(detail) {
  throw new Error('extra-plan: config.gateWords ' + detail)
}

/** 推荐后缀归一（与 index.js normalizeLabel 逐字同规则；仅用于判定保留后缀，不做子串匹配）。 */
export function normalizeGateLabel(label) {
  return String(label).trim().replace(RECOMMENDED_SUFFIX, '').trim()
}

/**
 * 整组严格校验：合法 → 返回冻结副本；任何一条不合法 → 抛 Error（消息以
 * 'extra-plan: config.gateWords' 开头并指出字段与原因）。禁止部分接受。
 */
export function validateGateWords(raw) {
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) {
    fail('必须是含恰好 7 个字段的普通对象（当前 ' + (raw === null ? 'null' : Array.isArray(raw) ? 'array' : typeof raw) + '）')
  }
  const keys = Object.keys(raw)
  for (const field of GATE_WORD_FIELD_NAMES) {
    if (!Object.prototype.hasOwnProperty.call(raw, field)) fail('缺少字段 ' + field)
  }
  for (const key of keys) {
    if (!GATE_WORD_FIELD_NAMES.includes(key)) fail('存在未定义字段 ' + key)
  }
  const seenByValue = new Map()
  const words = {}
  for (const field of GATE_WORD_FIELD_NAMES) {
    const value = raw[field]
    if (typeof value !== 'string' || value === '') fail('.' + field + ' 必须是非空字符串')
    if (value !== value.trim()) fail('.' + field + ' 首尾不得有空白')
    if (value.includes('\n') || value.includes('\r')) fail('.' + field + ' 不得包含 CR/LF')
    if (normalizeGateLabel(value) !== value) {
      fail('.' + field + ' 不得以保留的推荐后缀结尾（(Recommended)/（Recommended）/(推荐)/（推荐））')
    }
    const twin = seenByValue.get(value)
    if (twin !== undefined) fail('.' + field + ' 与 .' + twin + ' 取值重复（7 个词必须两两不同）')
    seenByValue.set(value, field)
    words[field] = value
  }
  return Object.freeze(words)
}

function bracketed(words) {
  return words.map((word) => '「' + word + '」').join('')
}

/**
 * 运行时词表：只从入参派生（无参默认值不存在）。
 * 返回 { words, route, approval, purpose, routeSet, approvalSet, purposeSet, options, confirm, variables }：
 *  - words：7 个字段 → 值（冻结）
 *  - route/approval/purpose：冻结数组（approval 第三项与 route 共享 routeDisagree 词）
 *  - options/confirm：deny 教学文案插值片段（与历史静态文案逐字同构）
 *  - variables：prompt variable 名 → 本次 apply 的值（冻结映射）
 */
export function createGateRuntime(raw) {
  const words = validateGateWords(raw)
  const route = Object.freeze([words.routeDirect, words.routePlan, words.routeDisagree])
  const approval = Object.freeze([words.approvalApprove, words.approvalReplan, words.routeDisagree])
  const purpose = Object.freeze([words.purposeRefine, words.purposeRedo])
  const options = Object.freeze({
    route: bracketed(route),
    approval: bracketed(approval),
    purpose: bracketed(purpose),
  })
  const confirm = Object.freeze({
    route: '须先 ask_user_question 路由确认（选项固定为' + options.route + '）',
    approval: '须先 ask_user_question 让用户对方案点「' + words.approvalApprove + '」（批准选项固定为' + options.approval + '）',
    purpose: '须先 ask_user_question 询问用户本次 pro 规划的目的（选项固定为' + options.purpose + '）',
  })
  const variables = {}
  for (const item of GATE_WORD_FIELDS) variables[item.variable] = words[item.field]
  return Object.freeze({
    words,
    route,
    approval,
    purpose,
    routeSet: new Set(route),
    approvalSet: new Set(approval),
    purposeSet: new Set(purpose),
    options,
    confirm,
    variables: Object.freeze(variables),
  })
}
