// 闸门专用工具 extra_plan_gate：route/规划目的两类提问的选项由插件生成，clarify 类由模型提供、插件原样转交，
// 模型不再手写 ask_user_question 的选项文案，插件事后校验也随之退化为只读派生。
// 每次 apply 由 createGateToolFactories 绑定当前 gateRuntime 词表、注入的 ask 通道与 getState 状态读取闭包；
// get 到的 defineGateTool(agent) 只产出工具定义，执行期任何失败都以普通对象返回。
// outcome 的取值集合恰为四种：answered、skipped、cancelled、channel-error；主会话据此区分
// 用户作答、跳过（selected 为空）、取消与提问通道故障。取消类错误 → cancelled，
// 其余错误 → channel-error 并附 error.code。
// route/purpose 分支的选项文案一律取自 gateRuntime.words 词表；clarify 分支的 questions/header/options 由模型提供；route/purpose 的 header、问题正文与 noteLabel 是固定提示语，可硬编码。
// 结果的 content 固定为一个 text ContentBlock、正文是返回值整体 JSON：宿主 spill-policy 的 post-execute 与 PTC 提交都按数组消费 content，状态机只解析这块 JSON。

const GATE_TOOL_NAME = 'extra_plan_gate'

// 固定提示语（不是闸门选项文案）：三问的 header、问题正文与 note 标签。
const ROUTE_HEADER = '路线确认'
const ROUTE_QUESTION = '这次任务走哪条路线？'
const NOTE_HEADER = '其他说明'
const NOTE_QUESTION = '其他说明：如转交pro规划等。可置空'
const NOTE_LABEL = '其他说明'
const PURPOSE_HEADER = '规划目的'
const PURPOSE_QUESTION = '这次让规划者分析的目的？'
const PURPOSE_DETAIL = '完善方案＝在已有方案基础上修改；重新规划＝把原始需求交给规划者重新理解'

// 取消类错误码：命中即按用户取消处理（不算通道故障），execute 以 outcome='cancelled' 返回。
const CANCEL_CODES = new Set(['ASK_CANCELLED', 'CANCELLED', 'CANCELED', 'ABORTED', 'ABORT_ERR', 'ERR_CANCELED'])

function errorCodeOf(error) {
  return error !== null && typeof error === 'object' && typeof error.code === 'string' ? error.code : ''
}

// 取消判别：只认取消类错误码、AbortError 名或宿主的取消句（cancel/abort 文案）；
// 通道码（NO_PROVIDER/CALLER_NOT_LIVE/DELEGATED_CALLER 等）不含这些词，仍落 channel-error。
function isCancelError(error) {
  if (error === null || typeof error !== 'object') return false
  if (typeof error.name === 'string' && error.name === 'AbortError') return true
  if (CANCEL_CODES.has(errorCodeOf(error))) return true
  const message = typeof error.message === 'string' ? error.message.toLowerCase() : ''
  return message.includes('cancelled') || message.includes('canceled') || message.includes('aborted')
}

// ask 成功返回：宿主给 { answers }，个别通道直接回传数组；两种都接收，其余按空答复处理。
function answersOf(asked) {
  if (Array.isArray(asked)) return asked
  if (asked !== null && typeof asked === 'object' && Array.isArray(asked.answers)) return asked.answers
  return []
}

// 单条答复的选中标签（宿主可能回传 selected 为空数组或非字符串项）。
function selectedLabelsOf(answer) {
  const labels = []
  if (answer === null || typeof answer !== 'object' || !Array.isArray(answer.selected)) return labels
  for (const label of answer.selected) if (typeof label === 'string') labels.push(label)
  return labels
}

// 单条答复的自由文本原文（route 第二问「其他说明」用 custom）；缺失一律空串。
function customTextOf(answer) {
  if (answer === null || typeof answer !== 'object') return ''
  return typeof answer.custom === 'string' ? answer.custom : ''
}

// 路线四选项：数组顺序即 ask 返回的序号口径（0 main、1 executor、2 plan、3 none）。
// label 只取词表；description 是固定提示语，不参与闸门词的精确匹配。
function routeOptionsOf(words) {
  return [
    { route: 'main', label: words.routeMain, description: '本次会话直接动手执行' },
    { route: 'executor', label: words.routeExecutor, description: '按已有方案转交执行者落地' },
    { route: 'plan', label: words.routePlan, description: '先转交 pro 规划出方案，再按方案动手' },
    { route: 'none', label: words.routeDisagree, description: '暂不推进，先澄清方向' },
  ]
}

// 规划目的两选项：顺序即序号口径（0 refine、1 redo），解释统一放在问题的 detail 里。
function purposeOptionsOf(words) {
  return [
    { purpose: 'refine', label: words.purposeRefine },
    { purpose: 'redo', label: words.purposeRedo },
  ]
}

// 按选中标签回查选项：标签由本插件生成，按精确值比对；未选/跳过返回 null。
function pickBySelected(options, labels) {
  if (labels.length === 0) return null
  for (const option of options) if (labels.includes(option.label)) return option
  return null
}

// 失败返回：取消类 → cancelled（保留已填字段）；其余 → channel-error 并附 error.code。
// 无论哪种分支都返回普通对象，绝不向外抛错。
function failResult(result, error) {
  if (isCancelError(error)) {
    result.outcome = 'cancelled'
    return result
  }
  result.outcome = 'channel-error'
  result.error = { code: errorCodeOf(error) }
  return result
}

// 私有绑定：校验依赖，把本次 apply 的词表、ask 通道与 getState 状态读取绑到三支分支上，返回 { defineGateTool }。
// 依赖不合法在创建期同步报错（apply 期问题），execute 内不再抛错。
function boundGateTool(gateRuntime, ask, getState) {
  if (gateRuntime === null || typeof gateRuntime !== 'object' || gateRuntime.words === null || typeof gateRuntime.words !== 'object') {
    throw new Error('extra-plan: extra_plan_gate 需要含 words 词表的 gateRuntime')
  }
  if (typeof ask !== 'function') throw new Error('extra-plan: extra_plan_gate 需要注入 ask 通道函数')
  const words = gateRuntime.words

  // route 分支：两问（路线四选一 + 其他说明可空），返回中文 routeLabel 供主会话直接读。
  async function askRoute(execAgent, signal) {
    const options = routeOptionsOf(words)
    const result = {
      gate: 'route',
      route: null,
      routeLabel: null,
      purpose: null,
      note: '',
      noteLabel: NOTE_LABEL,
      outcome: 'answered',
    }
    let answers
    try {
      const asked = await ask({
        questions: [
          {
            header: ROUTE_HEADER,
            question: ROUTE_QUESTION,
            options: options.map((option) => ({ label: option.label, description: option.description })),
          },
          { header: NOTE_HEADER, question: NOTE_QUESTION },
        ],
        agent: execAgent,
        signal,
      })
      answers = answersOf(asked)
    } catch (error) {
      return failResult(result, error)
    }
    result.note = customTextOf(answers[1])
    const selected = selectedLabelsOf(answers[0])
    // 第一问未选中（用户跳过，selected 为空）→ outcome='skipped'：route 仍落 none（与旧机制同口径），
    // routeLabel 置空串，绝不回填 disagree 词值，避免把「没作答」误报成「不同意」。
    if (selected.length === 0) {
      result.route = 'none'
      result.routeLabel = ''
      result.outcome = 'skipped'
      return result
    }
    // 选中项按选项序号落 route；选中 disagree 项 → route=none、routeLabel 回填该词值、outcome 仍 answered。
    const chosen = pickBySelected(options, selected) || options[3]
    result.route = chosen.route
    result.routeLabel = chosen.label
    return result
  }

  // purpose 分支：单问两选一（目的解释在 detail 里），返回中文 purposeLabel。
  async function askPurpose(execAgent, signal) {
    // 路线前置守卫（2c）：purpose 只在 route=plan 路线成立；非 plan 或状态不可判定一律不弹卡、
    // 直接以 skipped 返回（applyGateOutcome 对 skipped 不改动任何字段），避免用户被问无效问题。
    let state = null
    let stateUnavailable = false
    if (typeof getState === 'function') {
      try { state = getState(execAgent) } catch (error) { stateUnavailable = true }
    } else { stateUnavailable = true }
    if (stateUnavailable || state === null || typeof state !== 'object' || state.route !== 'plan') {
      return { gate: 'purpose', purpose: null, purposeLabel: null, outcome: 'skipped', reason: stateUnavailable ? 'state-unavailable' : 'route-not-plan' }
    }
    const options = purposeOptionsOf(words)
    const result = { gate: 'purpose', purpose: null, purposeLabel: null, outcome: 'answered' }
    let answers
    try {
      const asked = await ask({
        questions: [
          {
            header: PURPOSE_HEADER,
            question: PURPOSE_QUESTION,
            detail: PURPOSE_DETAIL,
            options: options.map((option) => ({ label: option.label })),
          },
        ],
        agent: execAgent,
        signal,
      })
      answers = answersOf(asked)
    } catch (error) {
      return failResult(result, error)
    }
    const selected = selectedLabelsOf(answers[0])
    // 未选中（用户跳过）→ outcome='skipped'，purpose 保持 null，purposeLabel 置空串。
    if (selected.length === 0) {
      result.purposeLabel = ''
      result.outcome = 'skipped'
      return result
    }
    // 选中任一项 → outcome 保持 answered 并回填对应词值。
    const chosen = pickBySelected(options, selected)
    if (chosen !== null) {
      result.purpose = chosen.purpose
      result.purposeLabel = chosen.label
    }
    return result
  }

  // clarify 分支：questions 原样透传给 ask，答复原样回传，不在插件侧构造任何选项。
  async function askClarify(questions, execAgent, signal) {
    let answers
    try {
      const asked = await ask({ questions, agent: execAgent, signal })
      answers = answersOf(asked)
    } catch (error) {
      return failResult({ gate: 'clarify', answers: [], outcome: 'answered' }, error)
    }
    // 全空答复（所有问题都没选中项且没有自定义文本，含 answers 为空数组）→ skipped；否则 answered。
    const hasAnswer = answers.some((answer) => selectedLabelsOf(answer).length > 0 || customTextOf(answer) !== '')
    return { gate: 'clarify', answers, outcome: hasAnswer ? 'answered' : 'skipped' }
  }

  // defineGateTool(agent)：返回工具定义。agent 只作为注册锚点透传，工具行为不依赖具体会话
  // （词表、ask 通道与 getState 已在工厂创建时绑定）。
  function defineGateTool(agent) {
    return {
      name: GATE_TOOL_NAME,
      description: '闸门提问：gate=route（路线确认）与 gate=purpose（规划目的）两个分支的选项与文案一律由插件按当前 gateWords 词表生成，模型不得自行构造、追加或改写这两个分支的选项文案；gate=clarify（意图澄清）的 questions 与候选 options 由模型提供、插件原样转交用户，不生成也不改写。'
        + 'gate=route 时插件发两问：第一问四选一（依次对应 route 枚举 main/executor/plan/none），第二问为纯文本可空的其他说明；返回 gate、route、routeLabel（中文路线词）、purpose=null、note（其他说明原文或空串）、noteLabel（说明标签）。'
        + 'gate=purpose 时插件发一问两选一（依次对应 purpose 枚举 refine/redo）；返回 gate、purpose、purposeLabel（中文目的词）。'
        + 'gate=clarify 时由你在 questions 里给 1-3 个意图澄清问题，插件原样转交用户；返回 gate、answers。'
        + '三个分支都不向外抛错：outcome=answered（用户作答）、skipped（用户跳过未作答）、cancelled（用户取消）、channel-error（提问通道失败，附 error.code）。',
      parameters: {
        type: 'object',
        properties: {
          gate: {
            type: 'string',
            enum: ['route', 'purpose', 'clarify'],
            description: 'route=路线确认；purpose=规划目的确认；clarify=意图澄清问答',
          },
          questions: {
            type: 'array',
            minItems: 1,
            maxItems: 3,
            items: { type: 'object' },
            description: '仅 gate=clarify 使用：意图澄清问题数组（1-3 个问题，每问含 header/question 与候选 options），插件原样转交用户；gate=route/purpose 时不要传',
          },
        },
        required: ['gate'],
        additionalProperties: false,
      },
      output: {
        schema: {
          type: 'object',
          properties: {
            gate: { type: 'string', description: '回填入参 gate 取值（route/purpose/clarify）' },
            reason: { type: 'string', description: '仅 outcome=skipped 时可能出现：route-not-plan=purpose 前置守卫因路线非 plan 未弹卡；state-unavailable=状态读取不可用未弹卡' },
            outcome: { type: 'string', enum: ['answered', 'skipped', 'cancelled', 'channel-error'], description: 'answered=用户作答；skipped=用户跳过未作答（route/purpose 的 label 为空串、route 恒为 none）；cancelled=用户取消；channel-error=提问通道失败（见 error.code）' },
            route: { description: 'route 分支：main/executor/plan/none 之一（跳过时仍为 none）；其它分支不返回' },
            routeLabel: { description: 'route 分支：route 对应的中文路线词（取自 gateRuntime 词表）；跳过时为空串；其它分支为 null' },
            purpose: { description: 'purpose 分支：refine/redo，未选中为 null；route 分支恒为 null' },
            purposeLabel: { description: 'purpose 分支：purpose 对应的中文目的词（取自 gateRuntime 词表）；跳过时为空串' },
            note: { type: 'string', description: 'route 分支：第二问「其他说明」的原文，未填为空串' },
            noteLabel: { type: 'string', description: 'route 分支：note 的固定标签（其他说明）' },
            answers: { type: 'array', items: { type: 'object' }, description: 'clarify 分支：宿主原样返回的答复数组' },
            error: {
              type: 'object',
              description: 'channel-error 时的错误摘要',
              properties: { code: { type: 'string', description: '宿主错误码，缺失时为空串' } },
              required: ['code'],
              additionalProperties: false,
            },
          },
          required: ['gate', 'outcome'],
          additionalProperties: false,
        },
        // 结果 content 必须恰为一个 text ContentBlock、正文是返回值整体 JSON：
        // 宿主按数组消费 content（spill-policy 的 post-execute 与 PTC 提交都对 content 调 .some），
        // 状态机只解析这块 JSON 的 outcome 与 route/purpose；裸字符串会崩宿主，人类摘要会让三锚点停在原地。
        render(_args, value) {
          return [{ type: 'text', text: JSON.stringify(value) }]
        },
      },
      async execute(args, exec) {
        const gate = args !== null && typeof args === 'object' && typeof args.gate === 'string' ? args.gate : ''
        const execAgent = exec !== null && typeof exec === 'object' ? exec.agent : undefined
        const signal = exec !== null && typeof exec === 'object' ? exec.signal : undefined
        try {
          if (gate === 'route') return await askRoute(execAgent, signal)
          if (gate === 'purpose') return await askPurpose(execAgent, signal)
          if (gate === 'clarify') {
            const questions = args !== null && typeof args === 'object' ? args.questions : undefined
            // clarify 要求非空数组；参数 schema 的 minItems 已拦截，此处只做不抛错的兜底。
            if (!Array.isArray(questions) || questions.length === 0) {
              return { gate: 'clarify', answers: [], outcome: 'channel-error', error: { code: 'INVALID_QUESTIONS' } }
            }
            return await askClarify(questions, execAgent, signal)
          }
          // 非法 gate（schema enum 已拦截）同样不抛错，保留原值便于诊断。
          return { gate: gate === '' ? 'unknown' : gate, outcome: 'channel-error', error: { code: 'INVALID_GATE' } }
        } catch (error) {
          // 兜底：任何未预期异常都收敛成普通对象，不让 execute 向外抛错。
          return { gate: gate === '' ? 'unknown' : gate, outcome: 'channel-error', error: { code: errorCodeOf(error) } }
        }
      },
    }
  }

  return Object.freeze({ defineGateTool })
}

// 工具工厂：绑定本次 apply 的词表、ask 通道与 getState，返回 { defineGateTool }。
// 与 createSaveToolFactories 同形，便于后续按 agent 注册时统一取定义。
export function createGateToolFactories({ gateRuntime, ask, getState } = {}) {
  return boundGateTool(gateRuntime, ask, getState)
}

// 直取定义的便捷出口：defineGateTool(agent, { gateRuntime, ask, getState }) 与工厂返回值同一实现。
export function defineGateTool(agent, { gateRuntime, ask, getState } = {}) {
  return boundGateTool(gateRuntime, ask, getState).defineGateTool(agent)
}
