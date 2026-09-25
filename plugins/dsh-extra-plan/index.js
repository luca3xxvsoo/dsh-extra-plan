// @local/dsh-extra-plan (v0.3.0)
// v2（2026-09-04）：agent/request planner 前置注入
// 额外规划模式（extra-plan 预设专用）：按需规划 + 四级机械锚点（路由/目的/澄清/批准）
// + 主会话与规划子代理 anchored 引导 + 规划子代理探查硬上限 + 力度继承 +
// save_plan 方案落盘（原子双写）+ 子代理沙箱下限 + usage 账本。
//
// ── 宿主事实依赖清单（来自 force-plan v11.8.3 的踩坑记录，逐条继承） ──
// 1. session.header.origin/delegationDepth 在会话创建时即已冻结可用；
// 2. tools/pre-execute 的 exec.arguments 是已解析的对象，不是 JSON 字符串；
//    会话事件里 tool/call 的 data.arguments 则是 JSON 字符串；
// 3. 子代理判定已弃用 agents.roots()（v0.1.2-rc.1 真实机制：子代理 runtime
//    owner=父，agent-loop enter(agent, ownerCtx.agent)——按 owner 的根判定不会
//    把子代理当根）——一律用「子代理标记 + 父会话存活」公式；
// 4. ask_user_question 答案以 tool/result 回流（0.1.7 起 callId/isError 在 message 顶层、
//    content 直接是内容块；0.1.2-rc.1 旧形状的 tool-result 信封仍兼容），
//    与 tool/call 的 callId 精确配对，渲染文本为 {"answers":[...]} JSON；
//    提问通道级错误码全集（v0.1.2-rc.1 声明）：ASK_ABORTED / EMPTY_QUESTIONS /
//    CALLER_NOT_LIVE / DELEGATED_CALLER / BAD_INTENT / NO_PROVIDER；取消码实测口径
//    （2026-09-23 复核）：native 直呼取消上报 ASK_CANCELLED（全库唯一实证
//    session-368b8b1f L3140），嵌套（PTC）取消无码、只有宿主文案句（见
//    HOST_ASK_CANCEL_TEXTS）；ASK_ABORTED 全库 423 会话 0 命中；BAD_INTENT 为新增码、
//    非通道故障，落入 else 分支重置 route/purpose/clarified/approved（安全方向）；
//    闸门拒绝（插件中文文案）另判为 kind:'denied'，不重置路由与阶段状态（见 deriveFlowState）；
// 5. preStep 先装配后 pre-step——目录裁剪/引导一律走 system-prompt/assemble
//    装配级过滤（await next() 后替换），与时序无关、每次请求（含首个）生效；
// 6. web 会话先按默认预设发布、约 3 秒后 recompose 且不重发 agent/session-start
//    ——依赖 session-start 的逻辑需 pre-step 兜底（本插件 save_plan 注册在
//    session-start，规划子代理由本预设行创建、session-start 必达，无需兜底）；
// 7. 子代理经 applyChildComposition 加入父预设组合——本插件同样活在子会话里，
//    每个会话各有一份实例，ctx 为该会话 agent 的作用域；
// 8. dsh-subagent 在委派边界把子代理审批固定为 never；沙箱下限需插件补种
//    （childPolicyNeedsFloor，F 系列用例已测）；
// 9. 子代理的 reasoningEffort 由 agent/request 瀑布继承；当前 DSH AgentOptions
//    已声明该字段，实际来源与覆盖规则见下方 agent/request 逻辑。
//    真实机制：宿主 installModelSelection 仅由主会话侧会话控制器安装
//    （setup: installSelection 先于 presets.mount），其 agent/request 钩子无条件
//    覆写 provider/model/reasoningEffort（剥除 resolved 的 effort）；子代理瀑布
//    不安装该监听器 → 插件注入在 next() 解析后执行并最终生效。
//
// 行为：
//  1) 四级机械锚点（主会话，硬闸门，tools/pre-execute）：
//     - 路由未确认（state.route==='none' 且无通道逃生）：禁 write/edit 与
//       pwsh 写命令、禁一切委派；路由否决词（routeDisagree）保持未确认；
//     - 直行态（route==='direct'）：放行主会话写工具；委派恒拒（无计划批准
//       锚点，机械保证"点直行 = 不派子代理"）；
//     - 规划态（route==='plan'）：澄清完成才放行 subagent_plan 与 save_probe
//       （save_probe 与 subagent_plan 同条件放行，v3 口径）；
//     - 计划已批准（approved）：放行执行类委派（subagent/subagent_fork/
//       workflow/ralph/subagent_review）与写工具；
//     - send_message：完全放行（目标合法性由宿主校验；续轮转达语义不变）；
//     - save_plan：主会话同注册，任意路由态放行（受限规划工件：仅写 cwd/.extra-plan
//       固定形状 Markdown；内容闸门与规划子代理共用同一实现，强度一致）；
//     - subagent_probe：仅主会话可委派（任意路由状态放行 + 固定后台）；规划子代理
//       被闸门拒绝（T5，改用「申请继续探查」升级通道）；
//     - 空白回复（answers:[]）/取消/中断/验词失败一律视为未确认；仅提问
//       通道级错误码白名单逃生放行（防死锁，v11 口径）。
//  2) 规划子代理（subagent_plan 创建、model=pro 的子会话）：
//     - save_plan 工具注册在此子会话与主会话层（session-start 时按
//       isPlannerChild / 非子代理判定；主会话侧任意路由态放行（受限规划工件），见 1)）；
//     - save_probe 工具注册在主会话层与已认领的探查子会话层（session-start +
//       pre-step 幂等兜底；probe 子代理经放行-认领关联认领），规划子代理/执行者/
//       reviewer 不可见；
//     - 探查硬上限：自最近一条主会话发往本子代理的消息（初始任务
//       kind=user / send_message 续轮转达 kind=agent-message；用户不直接对话
//       子代理）起的 tool/call（含 save_plan）≥ exploreBudget 后拒绝后续
//       工具调用并注入收敛指令；每条主会话转达消息重置预算（=用户授权继续
//       探查）；save_plan 与运行时上下文快照（kind=plugin）不重置；
//     - write/edit 与 pwsh 写命令拒绝（toolFilter 之外的备份防线）。
//     - plannerPromptSuffix 配置：委派的初始任务消息（kind=user）与续轮转达
//       （kind=agent-message）末尾机械拼接「\n\n + 配置文本」（任务要求 + 回车换行
//       + 文本）；运行时快照（kind=plugin）不追加。
//  3) anchored 引导（默认开）：主会话与规划子代理在首个 tool/call 落盘前，
//     装配级注入极简 persona、清空运行时上下文、目录收窄——native/both 保持
//     bootstrap shell(s)+read，sections 仅 persona；Pure PTC 只保留 run_code，
//     sections 为 persona + tool:read（宿主 tools:ptc-only 段已按用户要求停用；tool:read 文本
//     由 cfg.bootstrapReadHint 手写、内置中文兜底，不再调官方 renderer；L 段自动回到宿主原文）；
//     无 shell 且无 run_code → 跳过并每实例警告一次；执行者/reviewer 子代理不引导。
//  4) planner 与非 planner child 模型及首请求屏障：planner 只用 plannerModel，executor/reviewer/probe
//     与 workflow/ralph worker 只用 otherAgentModel；非 planner 显式 agentOptions/provider/model 优先，
//     未显式时 fallback 固定取顶层主会话。crossProviderPlannerModel 仅严格等于 true 时，agent/request
//     await 全部匹配 provider 的真实 OK probe、排序和必要 fallback 验证后才返回最终 LlmCallConfig，
//     随后宿主才可 prepareCall/stream。False、缺失、非法值的非 planner 仅查主会话 provider advisory
//     listModels；所有 True 路由失败时固定阻断，不交未验证配置。
//  5) 子代理沙箱下限（复用 childPolicyNeedsFloor）：read-only → workspace-write。
//  6) usage 账本（config.usageLedger.enabled）：折叠 assistant/message.usage
//     逐行写 JSONL，行 = 一次调用；role：main（主会话）/ planner（规划子代理）/
//     executor（执行者/reviewer 子代理）；写入带 (sessionId,seq) 去重，
//     保证跨插件实例安全。foldUsage 为同步函数（禁止改成异步）：agent/disposed 是
//     emit/void，宿主只为监听器返回的 Promise 挂 catch、不等待完成，末轮 final flush
//     必须在监听器同步路径内完成（此时 driver 已静止、session 尚未解绑）。
//  7) 会话状态生命周期（P0-4）：运行时状态一律按 sessionId 分桶——subCallCounters 为
//     sessionId→rootCallId→已放行子调用数，锚点变化只删当前 session 桶（已移除全局
//     clear()）；agent/disposed 先同步 final fold（role 取 childBaseline 缓存的 WeakMap
//     角色），再按 sessionId 回收 jobOutputCallCounters、jobOutputLastAnchors、
//     toolJobsNoticesConsumed、subCallCounters 与 usageCursors（重复 disposed 幂等，
//     其它 session 状态不受影响）。usageCursors 内存 Map 只保存活跃 session：同 session
//     再次激活且内存无项时按 sessionId 从 cursor JSON 单项续载 { seq, index }（不再保留内存
//     态 ref 字段；增量改由 session.seq 水位 + snapshotEvents(from,to) 区间读取实现）。cursor JSON 不存在（ENOENT）
//     静默按空表；其它读取错误、JSON 解析失败或根值非对象（含数组）→ 每插件实例首次
//     降级告警一次并进入空表降级，此后写回以「空表 + 当前 session」覆盖写（其它 session
//     的去重基准会丢失、其后续恢复可能重复追加 ledger 行）；正常可解析时写前重读、读改写
//     保留其它合法 session 条目。snapshot 增量扫描与 cursor 批量/延迟持久化留后续批次。
//
// 不挂 force-plan、不挂 plan mode、无 exit_plan_mode——本模式没有计划模式预锁
// （快通道教训：不引入启动预锁）。

const CHANNEL_BROKEN_CODES = new Set(['NO_PROVIDER', 'CALLER_NOT_LIVE', 'DELEGATED_CALLER'])

// F 段（HP 首轮）tool:read 的内置兜底文案（= 预设 agent.cordis.yml 的 bootstrapReadHint 示例，逐字一致）。
// 除代码外用中文；四要素必须保留：工具名 read、程序内 tools.read(...) 调用形态、file_path 必填与
// offset/limit 默认值、返回形状（path/offset/totalLines/lines 带行号）。文案不再由官方 renderer 生成，
// 与宿主 read 契约（dsh-tool-fs）的人工核对见台账 HS26。
const BOOTSTRAP_READ_HINT_FALLBACK = [
  '在 run_code 程序里读文件：调用 tools.read({ file_path })，file_path 必填；可选 offset（默认 1）与 limit（默认 2000）。返回含 path、offset、totalLines 与带行号的 lines（每项为 { number, text }）。示例：',
  "const r = await tools.read({ file_path: 'README.md' })",
  'return r',
].join('\n')

// 路由/目的/批准 ask 的关键词唯一真源是 YAML（config.gateWords，见 agent.cordis.yml）：
// JS 侧只有字段规格、派生与严格校验（lib/gate-words.js），没有内置词值、没有默认词表。
// 每次 apply 现场 createGateRuntime(cfg.gateWords) 建立本 agent scope 的词表，并作为
// 显式参数贯穿全部 helper、状态机与闸门（helper 不得自建默认词表、不得改走模块全局）。
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

const ASK_TOOL = 'ask_user_question'




// ── 会话事件名双兼容层（DSH 0.1.2-rc.1 / 0.1.5-rc.2）────────────────────────
// 为什么双兼容：生产仍是 0.1.2-rc.1 且需回放旧会话日志，同一份代码须两代都能工作。
// 两代出处：tool/code-dispatch(-start)（子调用 id 前缀 :code:）属 0.1.2-rc.1；
//   tool/ptc-dispatch(-start)（前缀 :ptc:）属 0.1.5-rc.2（dsh-session known-event-types：
//   0.1.2-rc.1 L66-67 / 0.1.5-rc.2 L71-72；载荷字段两代未变）。
// 删除条件：生产整体切到 0.1.5-rc.2 且不再回放旧日志（含 tool/code-dispatch(-start) 的旧会话）。
// 删除动作：删两个 Set 里带 COMPAT 标记的那一项；判定点无需改动。
// 删除判据：grep "COMPAT"（后跟左括号）应为 0 命中。
const DISPATCH_START = new Set(['tool/ptc-dispatch-start', 'tool/code-dispatch-start']) // COMPAT(0.1.2-rc.1)
const DISPATCH = new Set(['tool/ptc-dispatch', 'tool/code-dispatch']) // COMPAT(0.1.2-rc.1)
const isDispatchStart = (t) => DISPATCH_START.has(t) // 含旧名 tool/code-dispatch-start（0.1.2-rc.1）
const isDispatch = (t) => DISPATCH.has(t)

// Shell mutation helpers live in lib/shell-mutation.js; imports below preserve the public decisions bindings.



// ── 纯判定函数（模块顶层；经 decisions 导出供场景测试直接复用，防复制漂移） ──

// 宿主在「用户取消/中断 ask」时回流的文案句（逐字常量，2026-09-23 实测：嵌套 PTC 路径
// 与 native 路径同句）。嵌套路径无错误码，故只按文案判别取消；以 'Error: ' 开头且不等于
// 本表任一条 → 判为闸门拒绝（parseAskResultData/parseDispatchAskResult 返回 kind:'denied'），
// 不触发 resetRouteState（状态机连带修复）。
const HOST_ASK_CANCEL_TEXTS = ['Error: ask_user_question was aborted before the user answered', 'Error: the user cancelled ask_user_question']

// 会话事件快照（sessionEvents）与子代理识别（isSubagentChild）的唯一来源 = lib/agent-session.js
// （index.js 与 lib/model-routing.js 共用，模块内不再保留镜像副本）；见下方 import 行，
// decisions 继续 re-export isSubagentChild（名字数不变）。

// Delegation role predicates are imported from lib/agent-runtime.js below.
// anchored 引导阶段判定：会话尚未落盘任何 tool/call 事件。
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

// Shell command decoding and mutation matching are imported from lib/shell-mutation.js.


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
function normalizeLabel(label) {
  return label.trim().replace(/\s*(?:\((?:recommended|推荐)\)|（(?:recommended|推荐)）)\s*$/i, '').trim()
}

// 三分法判定：labels 集合是否与 gateSet 集合完全相等（精确字符串比较，不用 indexOf）。
function isExactGateSet(labels, gateSet) {
  const labelSet = new Set(labels.map(normalizeLabel))
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

// 三类 match 的唯一判定口径：标签先按白名单后缀归一（normalizeLabel），再与当前
// config.gateWords 的值**精确相等**才返回内部枚举；禁止 indexOf 子串推进 route/
// purpose/approved（旧词与任何变体都不得靠子串或推荐后缀重新生效）。
function matchExactKind(selected, table) {
  for (const label of selected) {
    const normalized = normalizeLabel(label)
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
  let callId
  let inner
  let outerIsError = false
  let outerText = ''
  // 0.1.7-rc.2 起：tool-result 信封拍平到 message 顶层（toolCallId / isError 在 message 上，
  // content 直接是内容块）。旧形状（0.1.2-rc.1 / 0.1.5-rc.2）保留兼容。
  if (typeof message.toolCallId === 'string') {
    callId = message.toolCallId
    inner = message.content
    outerIsError = message.isError === true
    outerText = firstTextOfBlocks(message.content)
  } else {
    for (const outer of message.content) {
      if (outer !== null && typeof outer === 'object' && outer.type === 'tool-result') {
        if (typeof outer.toolCallId === 'string') callId = outer.toolCallId
        if (inner === undefined && Array.isArray(outer.content)) {
          inner = outer.content
          // isError 在 tool-result 信封（message.content[0]）上，不在 data 上（native 闸门拒绝实证）。
          outerIsError = outer.isError === true
          outerText = firstTextOfBlocks(outer.content)
        }
      }
    }
  }
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

// 解析一次嵌套 ask 的结果（tool/ptc-dispatch / tool/code-dispatch 事件，run_code 程序内嵌套调用）。
// data.content 直接是 ContentBlock 数组（无 tool/result 的 tool-result 外层）。
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


// Planner budget helpers are imported from lib/planner-budget.js.

// Planner prompt and budget notice helpers are imported from lib/planner-budget.js.

// Planner budget policy helpers are imported from lib/planner-budget.js.
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
  if (exec.name === 'cordis_run') {
    return '规划子代理只读：cordis_run 会在会话内执行模型 JS 并挂载临时插件，规划期一律禁止（宿主版本仍注册该工具时生效）'
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
  if (exec.name === 'cordis_run') {
    return probe
      ? '探查者只读：cordis_run 会在会话内执行模型 JS 并挂载临时插件，一律禁止（宿主版本仍注册该工具时生效）'
      : '验收复核者只读：cordis_run 会在会话内执行模型 JS 并挂载临时插件，一律禁止（宿主版本仍注册该工具时生效）'
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
        return `job_output 禁止对同一 job 重复调用。job "${args.job_id}" 在本轮已调用过，请等待通知或使用 job_list 查看状态`
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
//    ask → write/edit → cordis 2 只读 → cordis_run → pwsh/bash → planToolName
//    → save_probe 分支保持不变（route=plan + purpose∈{refine,redo} + clarified）
//    → subagent 族 → run_code（调 runCodeGroupDenyReason，depth+1）
//    → job_output（wait 检查 + 计数器查重，只读不写入；set 由 recordJobOutputCall 在放行路径执行）→ null。
//    save_plan 已移除路由态限制：无显式分支，由本函数兜底 return null 任意路由态放行
//    （受限规划工件：仅写 cwd/.extra-plan 固定形状 Markdown，内容闸门与规划子代理同一实现）。
//    gateCtx: { events, planToolName, jobOutputCallCounters, runCodeDepth, gateRuntime }（gateRuntime 必填）。
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
  // cordis（官方工具集，只读引用）：0.1.7-rc.2 宿主 dsh-tool-cordis 只注册
  // cordis_inspect_list / cordis_inspect_query 两个只读工具；cordis_run 等 5 名已不存在。
  // 下方判定为防御性保留（若某受支持版本仍注册该工具时生效）：cordis_run 是唯一执行口
  // （模型 JS 求值+挂载临时插件，纯内存、会话级、重启即失）——与 write/edit 同规则：
  // 路由未确认拒绝，批准/直行放行。子代理侧静态 deny 已移除（deny 未知名会使
  // tools.restrict() 抛错、子代理创建失败），改由 planner/只读子代理的运行时闸门兜住。
  if (name === 'cordis_inspect_list' || name === 'cordis_inspect_query' || name === 'cordis_inspect_self' || name === 'cordis_define' || name === 'cordis_stop' || name === 'cordis_undefine') {
    return null
  }
  if (name === 'cordis_run') {
    if (!escape && state.route !== 'direct' && state.approved !== true) {
      return `路由未确认：cordis_run。cordis 只读/暂存工具（cordis_inspect_*、cordis_define、cordis_stop、cordis_undefine）可随时使用；cordis_run 会在会话内执行模型 JS 并挂载临时插件，${gateRuntime.confirm.route}，用户批准后才可动手`
    }
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
  if (name === 'run_code') {
    return runCodeGroupDenyReason(state, exec, { kind: 'main' }, { events, planToolName, jobOutputCallCounters: ctx.jobOutputCallCounters, runcodeCatchGate: ctx.runcodeCatchGate, runCodeDepth: (typeof ctx.runCodeDepth === 'number' ? ctx.runCodeDepth : 0) + 1, gateRuntime })
  }
  if (name === 'job_output') return jobOutputGateReason(exec, ctx.jobOutputCallCounters)
  return null
}

// 组判定：run_code 拆解 → 逐成员走「与直呼完全相同的闸门」→ 聚合拒绝。
// state：主会话 flow state（role.kind==='main' 时必传；其它角色忽略）；缺省归一化为
// { route:'none', clarified:false, approved:false, purpose:'none', channelBroken:false }。
// role：{ kind:'main' } | { kind:'planner' } | { kind:'child', readOnly:boolean, probe:boolean }。
// gateCtx 缺省：{ events:[], planToolName:'subagent_plan', jobOutputCallCounters:new Map(),
// exploreBudget:DEFAULT_EXPLORE_BUDGET, runCodeDepth:0, runcodeCatchGate:false }；gateRuntime 必须由调用方显式传入（词表唯一值源是 config.gateWords，helper 无默认词表）。
// 多调用容错硬闸门：成员逐项判定之后、聚合之前执行 runCodeCatchGateReason（教学式文案）。
// 返回 null=放行；非 null=聚合拒绝文案。
function runCodeGroupDenyReason(state, exec, role, gateCtx) {
  const ctx = {
    events: [],
    planToolName: 'subagent_plan',
    jobOutputCallCounters: new Map(),
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

// 供场景测试直接复用（消除"复制品"漂移）。模块顶层无副作用，纯 Node 可 import。
export const decisions = {
  CHANNEL_BROKEN_CODES,
  PWSH_MUTATION,
  BASH_MUTATION,
  PWSH_BARE_WORDS,
  BASH_BARE_WORDS,
  bashCommandOf,
  bashMutationMatches,
  isSubagentChild,
  isExplicitRoute,
  isExplicitEffort,
  isLiveDelegation,
  childPolicyNeedsFloor,
  isBootstrapPhase,
  pwshCommandOf,
  pwshMutationMatches,
  catalogHasWriteTools,
  isReadOnlyChildByCatalog,
  catalogIsCollapsed,
  schemasHasWriteTools,
  schemasHasTool,
  labelsOfCallData,
  askKindOf,
  askKindOfRelaxed,
  isExactGateSet,
  isPartialGateSet,
  categorizeGateAsk,
  gateAskDenyReason,
  validateGateAskStructure,
  matchRouteLabel,
  matchApprovalLabel,
  matchPurposeLabel,
  parseAskResultData,
  parseDispatchAskResult,
  deriveFlowState,
  toolCallCount,
  toolCallsSinceUser,
  withPlannerPromptSuffix,
  BUDGET_REMINDER_THRESHOLD,
  budgetNoticeText,
  withBudgetNotice,
  budgetReminderText,
  budgetReminderMessage,
  budgetReminderSent,
  budgetExhaustedReason,
  budgetExceeded,
  routeDenyReason,
  planDenyReason,
  approvalDenyReason,
  sanitizeTaskName,
  timestamp,
  renderSavePlan,
  PROBE_LIMITS,
  validateProbe,
  renderSaveProbe,
  renderProbeMarkdown,
  extractProbeEvidenceRefs,
  RUNCODE_MUTATION_HINTS,
  codeMutationHints,
  decomposeRunCode,
  runCodeCatchGateReason,
  collectRunCodeSites,
  askUserQuestionReturnGateReason,
  runCodeSiteCount,
  isRunCodeSubCall,
  runCodeDispatchGateReason,
  runCodeDispatchCapText,
  runCodeGroupDenyReason,
  subagentProbeGateReason,
  shellMutationReason,
  plannerGateReason,
  childReadonlyGateReason,
  mainGateReason,
  aggregateRunCodeDenyReason,
  jobOutputGateReason,
  recordJobOutputCall,
  probeDisposalWarning,
  resolveAgentRouteSources,
  decidePlannerModelUse,
  PLANNER_PROBE_TIMEOUT_MS,
  PLANNER_BLOCKED_REASON,
  NON_PLANNER_BLOCKED_REASON,
  sortPlannerCandidates,
  CORDIS_PRESENTATION_TOOLS,
  projectAssemblyForPresentation,
  renderFilteredToolsSdk,
  resolveToolsSdkRenderer,
  sdkSchemasForRendering,
  toolPresentationModeOf,
  projectSkillCatalogDecision,
}

export const name = 'extra-plan'
export const inject = ['systemPrompt']

import { mkdirSync, readFileSync, writeFileSync, appendFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { PROBE_LIMITS, sanitizeTaskName, timestamp, renderSavePlan, renderSaveProbe, renderProbeMarkdown, extractProbeEvidenceRefs } from './lib/save-contract.js'
import { validateProbe } from './lib/save-probe-validation.js'
import { atomicCommit, recoverJournals } from './lib/save-persistence.js'
import { createSaveToolFactories } from './lib/save-tool-factories.js'
import { RUNCODE_MUTATION_HINTS, runCodeTextOf, codeMutationHints, createRunCodeStatic } from './lib/run-code-static.js'
import { PWSH_MUTATION, BASH_MUTATION, PWSH_BARE_WORDS, BASH_BARE_WORDS, pwshCommandOf, bashCommandOf, pwshMutationMatches, bashMutationMatches } from './lib/shell-mutation.js'
import { DEFAULT_EXPLORE_BUDGET, toolCallCount, toolCallsSinceUser, withPlannerPromptSuffix, BUDGET_REMINDER_THRESHOLD, budgetNoticeText, withBudgetNotice, budgetReminderText, budgetReminderMessage, budgetReminderSent, budgetExhaustedReason, budgetExceeded } from './lib/planner-budget.js'
import { causeChainOf } from './lib/runtime-static.js'
import { createAgentRuntime, isLiveDelegation, childPolicyNeedsFloor } from './lib/agent-runtime.js'
import { sessionEvents, isSubagentChild } from './lib/agent-session.js'
import { createModelRouting, isExplicitRoute, isExplicitEffort, resolveAgentRouteSources, decidePlannerModelUse, PLANNER_PROBE_TIMEOUT_MS, PLANNER_BLOCKED_REASON, NON_PLANNER_BLOCKED_REASON, sortPlannerCandidates } from './lib/model-routing.js'
import { CORDIS_PRESENTATION_TOOLS, projectAssemblyForPresentation, renderFilteredToolsSdk, resolveToolsSdkRenderer, sdkSchemasForRendering, toolPresentationModeOf, toolRegistryOf, toolSdkSchemasOf, projectSkillCatalogDecision, PTC_SECTION_NAME, READ_SECTION_NAME, SDK_SECTION_NAME, sectionOf, hasSection, hasNonEmptySection } from './lib/assembly-presentation.js'
import { createSdkTextCache } from './lib/sdk-text-cache.js'
import { GATE_WORD_FIELDS, createGateRuntime } from './lib/gate-words.js'
import { createLiveConfig } from './lib/live-config.js'
import { createDeveloperMessage } from '@deepseek-ai/dsh-llm'

// ── save_probe/任意工具参数截断 → MALFORMED_RESPONSE 整轮致命的限次自愈（v0.3.1） ──────
// 机制：宿主 dsh-llm-deepseek 在消息流结束处对每个 tool-call 参数严格 JSON.parse，失败抛
// LlmError('... tool input is invalid JSON', 'MALFORMED_RESPONSE')；该码不在宿主默认重试码集
// （DEFAULT_RETRYABLE_CODES），llm-retry 直接放行 → agent/request-error waterfall 若无人返回
// {kind:'retry'}，本轮整体终止。参数非法时工具 execute 根本不会被调用（解析发生在宿主流层），
// 修复只能落在 request-error 兜底、不能落在 save_probe 工具内；失败回合工具未执行、无副作用，
// 重试一次是安全的。
// malformedRecovery 为模块级函数（须被导出供回归冒烟直呼，apply 闭包函数无法导出）；
// per-session 重试账本 malformedRetried 按 sessionId 分桶（本插件每个会话各持一份 apply
// 实例，模块级 Map + sessionId 键在「模块共享/每会话独立」两种装载模型下语义一致），
// disposed 时按 sessionId 回收（见 agent/disposed 监听器）。
// 注入形状（已按宿主 0.1.7-rc.2 源码核实；2026-09-25 订正）：developer/message 在已知事件白名单
// （dsh-session lib/types/known-event-types.js L36）；append 必须带 surfaceOp:'append'
// （dsh-session lib/index.js L294-308）；message 需非空 id、role='developer'、source.kind
// 非空字符串、content 数组（同文件 L1151-1176）；纯文本 content 不得带 headerSeq（L246-256）。
// **原记「invariant.js 无该分支（故无需坐标）」已被宿主源码证伪**：v4 行准入要求
// developer/message 自带 turn/step 且均为 ≥1 的整数，宿主 append 只补 seq/time、绝不补坐标，
// 坐标必须由调用方给出（实机报错为 SessionFormatError: developer/message turn must be a
// non-negative safe integer）；关系校验 companion 未挂载于活动 profile，故只需满足行准入。
// source 同须用生产者自有 kind，v4 禁止旧包裹形状（kind 取旧兜底值 plugin + plugin 包名字段）；本插件统一 plugin:@local/dsh-extra-plan。
const MALFORMED_RETRY_HINT = '你上一次的某个工具调用参数在传输中被截断，宿主侧无法把参数解析成合法 JSON，本次请求以 MALFORMED_RESPONSE 失败，该工具未执行、没有产生任何副作用。请在重试时压缩并重写该工具调用的参数：缩短长文本与证据列表、只保留核实结论必需的行号/数值/文案，确保参数是完整合法的 JSON，再原样重发同一调用。'

// sessionId → Set('turn:step')：同一回合同一步只兜底 1 次（防重试死循环）。
const malformedRetried = new Map()

// 判定链：① 非 MALFORMED_RESPONSE 不干预；② signal.aborted 绝不干扰用户取消；
// ③ agent.session.header.id 非字符串不干预；④ 同 (turn:step) 已兜底过则不重复；
// ⑤ 首次命中：记账 + 注入中文 developer 提示（模型在重试请求中可见），注入失败只吞掉、
// 不阻断自愈；⑥ 返回 { kind: 'retry' } → dsh-agent-loop 重试该步。任何意外异常一律
// 返回 null 透传（自愈兜底绝不放大故障）。
function malformedRecovery(payload) {
  try {
    if (payload === undefined || payload === null || typeof payload !== 'object') return null
    const failure = payload.failure
    if (failure === undefined || failure === null || failure.code !== 'MALFORMED_RESPONSE') return null
    if (payload.signal !== undefined && payload.signal !== null && payload.signal.aborted) return null
    const agent = payload.agent
    const sessionId = agent !== undefined && agent !== null && agent.session !== undefined && agent.session !== null && agent.session.header !== undefined && agent.session.header !== null
      ? agent.session.header.id
      : ''
    if (typeof sessionId !== 'string' || sessionId === '') return null
    const key = `${payload.turn}:${payload.step}`
    let set = malformedRetried.get(sessionId)
    if (set !== undefined && set.has(key)) return null
    if (set === undefined) {
      set = new Set()
      malformedRetried.set(sessionId, set)
    }
    set.add(key)
    // 坐标防御：v4 行准入要求 developer/message 自带 ≥1 的 turn/step 且宿主 append 不补坐标，
    // 而 request-error 的 payload 在个别场景可能缺坐标或非正整数——此时跳过注入，但仍返回
    // { kind: 'retry' }，使自愈主路径不因注入条件不满足而失效。
    if (Number.isInteger(payload.turn) && payload.turn >= 1 && Number.isInteger(payload.step) && payload.step >= 1) {
      try {
        const message = createDeveloperMessage({ content: [{ type: 'text', text: MALFORMED_RETRY_HINT }], source: { kind: 'plugin:@local/dsh-extra-plan' } })
        agent.session.append('developer/message', { turn: payload.turn, step: payload.step, message }, { surfaceOp: 'append' })
      } catch (error) {
        console.warn(`extra-plan: malformed retry hint append failed: ${error instanceof Error ? error.message : String(error)}`)
      }
    }
    return { kind: 'retry' }
  } catch (error) {
    return null
  }
}

// ── agent/error 回合错误取证落盘（与 recordRequestError 同诊断模式） ──────
// 宿主在回合/步骤级错误时 emit 'agent/error'（payload = { agent, turn, step, error }，
// error 为逐字原始错误；派发点 dsh-agent-loop throwError、签名 dsh-tool-cordis
// api-catalog），宿主不把该错误写 console → 由监听器逐字落盘留证。本插件每个会话
// 各持一份实例，主会话与全部子代理的任何 runTurn 级错误（含子代理"腰斩"的流建立
// 失败）都会留痕。
// recordAgentError 为模块级函数（须被导出供回归冒烟直呼）：与 recordRequestError
// 同模式——整体 try/catch 吞错、写失败一次性 console.warn 防刷屏；落盘文件与
// diagPath 同目录（diagPath 默认 = 本插件目录，此处同由本模块文件位置派生）。
const agentErrorDiagPath = join(dirname(fileURLToPath(import.meta.url)), 'extra-plan-agent-errors.jsonl')
let agentErrorDiagWarned = false

function recordAgentError(payload) {
  try {
    const sessionId = payload?.agent?.session?.header?.id
    const row = {
      ts: new Date().toISOString(),
      sessionId: typeof sessionId === 'string' ? sessionId : '',
      turn: payload.turn,
      step: payload.step,
      chain: causeChainOf(payload.error, 8),
    }
    mkdirSync(dirname(agentErrorDiagPath), { recursive: true })
    appendFileSync(agentErrorDiagPath, JSON.stringify(row) + '\n', { encoding: 'utf8' })
  } catch (error) {
    if (!agentErrorDiagWarned) {
      agentErrorDiagWarned = true
      console.warn(`extra-plan: agent-error diagnostics write failed: ${error instanceof Error ? error.message : String(error)}`)
    }
  }
}

export { PROBE_LIMITS, extractProbeEvidenceRefs, malformedRecovery, recordAgentError }

export function apply(ctx, config) {
  const cfg = config !== null && typeof config === 'object' ? config : {}
  // 闸门词表（唯一值源 = 本次 apply 的 YAML config.gateWords）：缺失/非法同步抛出，
  // 阻止该预设被使用（不回退到任何内置旧词）。必须在任何工具/监听器/服务副作用之前求值。
  const gateRuntime = createGateRuntime(cfg.gateWords)
  // prompt variable 注册（当前 agent scope，恰好 7 个）：persona 的 {{extra_plan_*}} 依赖它。
  // provider 返回本次 apply 捕获的值（改 YAML 后普通重启即生效）；effect 随 scope 释放，
  // 不注册全局变量、不跨 apply 缓存。
  ctx.effect(() => {
    const disposers = []
    for (const item of GATE_WORD_FIELDS) {
      const dispose = ctx.systemPrompt.variable(item.variable, () => gateRuntime.words[item.field])
      if (typeof dispose === 'function') disposers.push(dispose)
    }
    return () => {
      for (const dispose of disposers) dispose()
    }
  })
  const planToolName = typeof cfg.planTool === 'string' ? cfg.planTool : 'subagent_plan'
  const savePlanDir = typeof cfg.savePlanDir === 'string' && cfg.savePlanDir !== '' ? cfg.savePlanDir : '.extra-plan'
  const { defineSavePlan, defineSaveProbe } = createSaveToolFactories({
    savePlanDir,
    atomicCommit,
    recoverJournals,
  })
  // ── 配置热读：7 项设置从「apply 期一次性常量」改为「消费点现场取值」 ──────
  // 设置页改 YAML 后同会话即时生效（无需重启）；取值经 mtime+size 变更检测缓存，
  // 文件未变时零读盘零解析，详见 lib/live-config.js。fallbackDefaults = apply 期
  // cfg 快照：既是磁盘不可用/解析失败时的兜底，也是本实例初始值（生产上与该
  // YAML 同源——cfg 就是该文件当时的解析结果）。
  const liveConfig = createLiveConfig({
    // 路径决议（T6）：profile cordis.patch.yml（configEditor.documentPath）——设置值的新落点
    // （settings 行 config）；旧 .agent-presets/extra-plan/agent.cordis.yml 已无读取方。
    resolveDocumentPath: () => {
      try {
        const editor = ctx.get('configEditor')
        return editor !== undefined && editor !== null && typeof editor.documentPath === 'string' ? editor.documentPath : ''
      } catch (error) {
        return ''
      }
    },
    fallbackDefaults: {
      plannerModel: typeof cfg.plannerModel === 'string' ? cfg.plannerModel : 'deepseek-v4-pro',
      otherAgentModel: typeof cfg.otherAgentModel === 'string' ? cfg.otherAgentModel.trim() : '',
      exploreBudget: Number.isInteger(cfg.exploreBudget) && cfg.exploreBudget > 0 ? cfg.exploreBudget : DEFAULT_EXPLORE_BUDGET,
      plannerPromptSuffix: typeof cfg.plannerPromptSuffix === 'string' ? cfg.plannerPromptSuffix : '',
      anchoredBootstrap: cfg.anchoredBootstrap !== false,
      creativeMode: cfg.creativeMode === true,
      runcodeCatchGate: cfg.runcodeCatchGate === true,
      crossProviderPlannerModel: cfg.crossProviderPlannerModel === true,
    },
  })
  // ── 7 项热读：消费点现场取值（全部加括号调用） ──
  const plannerModel = () => liveConfig.plannerModel
  const otherAgentModel = () => liveConfig.otherAgentModel
  const exploreBudget = () => liveConfig.exploreBudget
  const plannerPromptSuffix = () => liveConfig.plannerPromptSuffix
  const bootstrapOn = () => liveConfig.anchoredBootstrap
  const runcodeCatchGateOn = () => liveConfig.runcodeCatchGate
  const crossProviderPlannerModelOn = () => liveConfig.crossProviderPlannerModel
  // creativeMode 三消费点全部改走 live-config getter（T5-5）：C 隐藏集合（shouldHideCreativeCatalog）
  // 与装配投影 hideCordis 两处现场取值，链 = settings 行 override → cfg 快照 → BUILTIN_DEFAULTS。
  const creativeModeOn = () => liveConfig.creativeMode
  const bootstrapPersona = typeof cfg.bootstrapPersona === 'string' ? cfg.bootstrapPersona : 'You are a helpful software engineer assistant.'
  // 变量②：F 段（HP 首轮）tool:read 的手写文案；空串/非字符串一律回退内置同文案兜底。
  const bootstrapReadHint = typeof cfg.bootstrapReadHint === 'string' && cfg.bootstrapReadHint !== ''
    ? cfg.bootstrapReadHint
    : BOOTSTRAP_READ_HINT_FALLBACK
  const bootstrapShellTools = new Set(Array.isArray(cfg.bootstrapShellTools) ? cfg.bootstrapShellTools : ['bash', 'pwsh'])
  const bootstrapCommonTools = new Set(Array.isArray(cfg.bootstrapCommonTools) ? cfg.bootstrapCommonTools : ['read'])
  let bootstrapShellMissingWarned = false
  const sdkTextCache = createSdkTextCache()

  // usage 账本（写入带 (sessionId,seq) 去重，跨插件实例安全）
  const ledgerCfg = cfg.usageLedger !== null && typeof cfg.usageLedger === 'object' ? cfg.usageLedger : null
  const ledgerOn = ledgerCfg !== null && ledgerCfg.enabled === true
  const ledgerPath = ledgerCfg !== null && typeof ledgerCfg.path === 'string' ? ledgerCfg.path : ''
  const ledgerCursorPath = ledgerPath === '' ? '' : ledgerPath + '.cursor.json'
  let ledgerWarned = false
  // cursor 降级告警口径：每插件实例（= 每个会话各一份）首次进入空表降级时告警一次
  // （与 ledgerWarned 同一次式风格）；同一实例内多次降级读不重复告警。
  let cursorDegradedWarned = false
  // usageCursors 只保存活跃 session：sessionId → { seq, index }（index = 上次折叠时读到的
  // session.seq 水位＝会话日志长度）。disposed final fold 后删除本 session 项；同 session 再次
  // 激活且内存无项时按 sessionId 从 cursor JSON 单项续载（水位可续做增量：只读 [index, seq)
  // 区间；水位不可读/日志截断/首次折叠才回退全量扫描，靠 seq 跳过旧消息）。
  const usageCursors = new Map()
  // job_output 同轮防重复：内存计数器（Map<sessionId, Map<jobId, 1>>）
  // 替代 session.events 推导——tool/call 先落盘、后 pre-execute（宿主 agent-loop 先
  // appendToolCall 后 scheduler.prepare）；jobOutputCallCounters 内存计数器不依赖该时序。
  const jobOutputCallCounters = new Map()
  const jobOutputLastAnchors = new Map() // sessionId → 上次锚点索引
  // sessionId → Map<rootCallId, 已放行子调用数>（单实例上限，planner 专属）。
  // 按 session 分桶：锚点变化 / disposed 只删当前 session 桶，不再全局 clear()——
  // 全局清空会连带清掉其它 session 正在执行的 run_code 子调用计数。
  const subCallCounters = new Map()
  const toolJobsNoticesConsumed = new Map() // sessionId → Set<jobId> 已处理过的 tool-jobs 完成通知的 jobId
  // cursor JSON 读取（续载与写回前的现状盘点共用）：返回 { ok, table }。
  // - ENOENT（首次运行尚无 cursor 文件）→ ok:true + 空表，静默不告警（本就没有可保留内容）；
  // - 其它读取错误 / JSON 解析失败 / 根值非对象（null、数组、标量）→ 本实例首次降级告警一次，
  //   ok:false + 空表降级：写回只能覆盖写「空表 + 当前 session」，其它 session 的去重基准会
  //   丢失、其后续恢复可能重复追加 ledger 行（机制说明与风险已写入 ai-机制设计.md）。
  function readUsageCursorTable() {
    let raw
    try {
      raw = readFileSync(ledgerCursorPath, 'utf8')
    } catch (error) {
      if (error !== null && typeof error === 'object' && error.code === 'ENOENT') return { ok: true, table: {} }
      warnUsageCursorDegraded(error)
      return { ok: false, table: {} }
    }
    let saved
    try {
      saved = JSON.parse(raw)
    } catch (error) {
      warnUsageCursorDegraded(error)
      return { ok: false, table: {} }
    }
    if (saved === null || typeof saved !== 'object' || Array.isArray(saved)) {
      warnUsageCursorDegraded(new Error('cursor root is not a plain object: ' + (Array.isArray(saved) ? 'array' : typeof saved)))
      return { ok: false, table: {} }
    }
    return { ok: true, table: saved }
  }

  // 降级告警：每插件实例首次降级时一次（同 ledgerWarned 口径），避免多次降级读重复刷屏。
  function warnUsageCursorDegraded(error) {
    if (cursorDegradedWarned) return
    cursorDegradedWarned = true
    console.warn('extra-plan: usage cursor JSON unreadable or corrupt — falling back to an empty cursor table; other sessions dedupe baselines may be lost on the next write: ' + (error instanceof Error ? error.message : String(error)))
  }

  // cursor 单项归一：兼容旧数字形状（sessionId: seq，按水位 0 处理）与现有 { seq, index } 形状。
  // 不再保留内存 ref 字段——增量改由 session.seq 水位 + snapshotEvents(from, to) 区间读取实现。
  function usageCursorEntryOf(table, sessionId) {
    const value = table[sessionId]
    if (typeof value === 'number') return { seq: value, index: 0 }
    if (value !== null && typeof value === 'object' && typeof value.seq === 'number') {
      return { seq: value.seq, index: typeof value.index === 'number' ? value.index : 0 }
    }
    return undefined
  }

  // usage 折叠：同步函数（禁止改成 async——agent/disposed 是 emit/void，宿主不等待 Promise，
  // 异步文件 I/O 会重新打开末轮漏记窗口）。既有语义保持：事件扫描、token/model/role 与 JSONL
  // 字段、只有新增行才追加并持久化 cursor、cursor JSON 整文件改写。
  // 增量口径（P1-4）：以宿主 session.seq（＝会话日志长度，O(1)、不物化数组）为水位，配合
  // session.snapshotEvents(from, to) 区间读取只物化新增区间；水位不可读 / prevIndex > 水位
  // （日志截断）/ 首次折叠（无 prev）才回退全量快照。绝不在同一趟里同时跑全量与增量再对拍。
  function foldUsage(agent, role) {
    if (!ledgerOn || ledgerPath === '') return
    const session = agent.session
    if (session === undefined || session === null) return
    if (typeof session.snapshotEvents !== 'function') return
    try {
      const sid = session.header.id
      // ① 水位读取（O(1)，不物化数组）：宿主 session.seq ≡ 日志长度（seq === 索引的宿主契约）。
      const logLen = session.seq
      const hasWatermark = typeof logLen === 'number' && Number.isFinite(logLen) && logLen >= 0
      // 内存无项（首次 fold / disposed 回收后同 session 再次激活）→ 只按 sessionId 从 cursor JSON
      // 续载本项；不再把 JSON 里其它历史 session 一次性灌进内存 Map。
      let prev = usageCursors.get(sid)
      if (prev === undefined) prev = usageCursorEntryOf(readUsageCursorTable().table, sid)
      let cursor = 0
      let prevIndex = -1
      if (prev !== undefined && prev !== null) {
        cursor = typeof prev === 'number' ? prev : (typeof prev.seq === 'number' ? prev.seq : 0)
        if (typeof prev.index === 'number' && Number.isFinite(prev.index) && prev.index >= 0) prevIndex = prev.index
      }
      let start = 0
      let events
      if (hasWatermark && prevIndex === logLen) return // ② 无新增 → 直接返回（不物化数组、不写文件）
      if (hasWatermark && prevIndex >= 0 && prevIndex <= logLen) {
        // ③ 增量路径：只物化 [prevIndex, logLen) 区间
        start = prevIndex
        events = session.snapshotEvents(prevIndex, logLen)
      } else {
        // ④ 回退全量：首次折叠（无 prev）/ 会话无水位（非宿主会话对象）/ prevIndex > logLen（日志截断）
        events = session.snapshotEvents()
      }
      if (!Array.isArray(events)) return
      const rows = []
      for (let idx = 0; idx < events.length; idx += 1) {
        const event = events[idx]
        if (event === null || typeof event !== 'object' || event.type !== 'assistant/message') continue
        const seq = typeof event.seq === 'number' ? event.seq : start + idx
        if (seq <= cursor) continue
        cursor = seq
        const data = event.data
        if (data === null || typeof data !== 'object') continue
        const usage = data.usage
        if (usage === null || typeof usage !== 'object') continue
        const hit = typeof usage.cacheReadTokens === 'number' ? usage.cacheReadTokens : 0
        const miss = typeof usage.inputTokens === 'number' ? usage.inputTokens : 0
        const out = typeof usage.outputTokens === 'number' ? usage.outputTokens : 0
        const cacheWriteTokens = typeof usage.cacheWriteTokens === 'number' ? usage.cacheWriteTokens : 0
        const reasoningTokens = typeof usage.reasoningTokens === 'number' ? usage.reasoningTokens : 0
        if (hit === 0 && miss === 0 && out === 0 && cacheWriteTokens === 0 && reasoningTokens === 0) continue
        const msg = data.message
        const model = msg !== null && typeof msg === 'object' && msg.source !== null && typeof msg.source === 'object' && typeof msg.source.model === 'string' ? msg.source.model : ''
        const provider = msg !== null && typeof msg === 'object' && msg.source !== null && typeof msg.source === 'object' && typeof msg.source.provider === 'string' ? msg.source.provider : ''
        rows.push(JSON.stringify({
          ts: new Date().toISOString(),
          sessionId: sid,
          role,
          model,
          provider,
          hit,
          miss,
          out,
          cacheWriteTokens,
          reasoningTokens,
          seq,
        }))
      }
      // 游标写回：index 为本次读到的水位（增量下一次从该水位续做）；无水位会话退化为本次快照长度。
      const nextIndex = hasWatermark ? logLen : events.length
      usageCursors.set(sid, { seq: cursor, index: nextIndex })
      if (rows.length === 0) return
      const sepA = ledgerPath.lastIndexOf('\\')
      const sepB = ledgerPath.lastIndexOf('/')
      const dir = ledgerPath.slice(0, Math.max(sepA, sepB))
      if (dir !== '') mkdirSync(dir, { recursive: true })
      appendFileSync(ledgerPath, rows.join('\n') + '\n', 'utf8')
      // cursor 持久化：写前重读现状——可解析时更新本 session 项并逐项保留其它合法 session
      // （归一为 { seq, index }）；降级态（读不到/解析失败/根值非对象）以空表 + 当前 session
      // 覆盖写，其它 session 去重基准丢失的风险见 readUsageCursorTable 注释。仍是「有新增行才
      // 整文件改写」，本批不引入批量/延迟持久化。
      const persisted = {}
      const current = readUsageCursorTable()
      if (current.ok) {
        for (const key of Object.keys(current.table)) {
          if (key === sid) continue
          const entry = usageCursorEntryOf(current.table, key)
          if (entry === undefined) continue
          persisted[key] = { seq: entry.seq, index: entry.index }
        }
      }
      persisted[sid] = { seq: cursor, index: nextIndex }
      try { writeFileSync(ledgerCursorPath, JSON.stringify(persisted), 'utf8') } catch (error) { /* cursor 持久化尽力而为 */ }
    } catch (error) {
      if (!ledgerWarned) {
        ledgerWarned = true
        console.warn(`extra-plan: usage ledger fold failed: ${error instanceof Error ? error.message : String(error)}`)
      }
    }
  }

  const sandboxPolicy = ctx.get('sandboxPolicy')
  const { isChild, isPlannerChild, toolSchemasOf, usageRoleOf, childBaseline } = createAgentRuntime({
    getAgents: () => ctx.get('agents'),
    sandboxPolicy,
    foldUsage,
    warn: (...args) => console.warn(...args),
  })


  // ── planner / 非 planner 模型单点解析（工厂实例；缓存 per-apply） ──
  // 见 lib/model-routing.js：plannerModelCache / otherAgentModelCache 每次 apply 各新建一份
  // WeakMap（绝不提升为模块全局）；llm/agents/诊断路径按惰性 getter 取用。
  const { resolvePlannerEntry, resolveOtherAgentEntry } = createModelRouting({
    getPlannerModel: () => liveConfig.plannerModel,
    getOtherAgentModel: () => liveConfig.otherAgentModel,
    getCrossProviderPlannerModel: () => liveConfig.crossProviderPlannerModel,
    getLlm: () => ctx.get('llm'),
    getAgents: () => ctx.get('agents'),
    getDiagPath: () => diagPath,
  })

  // ── C=1 创造模式的官方 skill 面（T5-3 取径订正）────────────────────────────
  // 旧实现（0.1.2-rc.1~0.1.5-rc.2）在 apply 期经 agentPresets.resolve('cordis') 取 shipped
  // 预设目录后 skills.register 两个 SKILL.md。dsh 0.1.7-rc.1 的 resolve() 只返回 {id[,broken]}，
  // 恒无 path → 整块静默失效（预设挂载成功但 skill 永远不注册）。
  // 现取径 = 静态注册：预设 skill-filesystem 行的 config.customSkillDirs 指向
  // @deepseek-ai/dsh-agent-preset 包内 skills/（见 agent.cordis.yml），三个 SKILL.md 随
  // skill-filesystem 行进入本预设组合；creativeMode=false 不再靠「不注册」，而由
  // assembly-presentation 的 CREATIVE_SKILL_NAMES 在 catalog 投影里隐藏（语义等价）。

  // childBaseline/usageRoleOf and sandbox floor live in the per-apply agent runtime factory.

  // save_plan/save_probe 的合同、校验、渲染与公共原子落盘由 lib 工厂提供；此处仅保留注册与生命周期接线。
  // 工具注册公共实现：WeakSet 去重 + tools 服务取用 + warn/error 文案模板 + try/catch。
  // 两个注册函数各自闭包持有各自 WeakSet 与工具名，跨工具幂等互不共享。
  function registerTool(registered, toolName, defineFn, agent) {
    // 幂等短路：注册成功、分类 A（重名）与分类 B（永久性定义期错误）都写标记（A/B 记终态不再重试）；仅 tools 服务未就绪与分类 C（可重试）不写标记、留给后续 pre-step 重试。
    if (registered.has(agent)) return
    let tools
    try {
      tools = agent.ctx !== undefined && agent.ctx !== null && typeof agent.ctx.get === 'function' ? agent.ctx.get('tools') : undefined
    } catch (error) {
      tools = undefined
    }
    // 分类 C（服务未就绪）：时序可自愈 → 不写标记，下一步重试。
    if (tools === undefined || tools === null || typeof tools.register !== 'function') {
      console.warn('extra-plan: tools service unavailable — ' + toolName + ' not registered')
      return
    }
    try {
      tools.register(defineFn())
      registered.add(agent)
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      // 分类 A（重名：同名工具已存在，不构成缺失）→ 记终态，不重试。
      if (error instanceof Error && message.includes('already registered')) {
        registered.add(agent)
        console.warn('extra-plan: ' + toolName + ' already registered in this scope — keeping the existing tool, no retry')
        return
      }
      // 分类 B（永久性定义期错误：JsonSchemaError / TypeError / 保留名）→ 记终态，不重试。
      if (error instanceof Error && (error.name === 'JsonSchemaError' || error.name === 'TypeError' || message.includes('is reserved'))) {
        registered.add(agent)
        console.error('extra-plan: ' + toolName + ' registration failed permanently: ' + message)
        return
      }
      // 分类 C（其它非预期错误：可能瞬态）→ 不写标记、不 return，下一步重试。
      console.error('extra-plan: ' + toolName + ' registration failed: ' + message)
    }
  }

  const savePlanRegistered = new WeakSet()
  function registerSavePlan(agent) { registerTool(savePlanRegistered, 'save_plan', defineSavePlan, agent) }

  // save_probe 定义由显式依赖工厂提供；注册状态仍由 apply 实例独立持有。
  const saveProbeRegistered = new WeakSet()
  function registerSaveProbe(agent) { registerTool(saveProbeRegistered, 'save_probe', defineSaveProbe, agent) }

  // 放行-认领关联：父会话放行 subagent_probe 后挂「待认领计数」（parentSessionId → 次数），
  // probe 子会话 session-start/pre-step 经 probeClaimFor 认领：消费计数、标记 probeClaimed、
  // 注册 save_probe。同父执行者（schemas 含 write/edit）不认领；reviewer 无待认领不认领；
  // 规划子代理不认领（T5：planner 已不得委派探查者，若放行其认领会抢走主会话派出的探查者
  // 的待认领计数，害真探查者落不了证据报告）；
  // probeClaimed 幂等（session-start 与 pre-step 双入口不双消费）。
  const probeClaimed = new WeakSet()
  const pendingProbeClaims = new Map()
  function probeClaimFor(agent) {
    if (probeClaimed.has(agent)) return true
    if (!isSubagentChild(agent)) return false
    // T5 守卫：规划子代理不得认领（见上方注释）。
    if (isPlannerChild(agent)) return false
    const header = agent.session.header
    const parentSession = header !== undefined && header !== null ? header.parentSession : undefined
    if (typeof parentSession !== 'string') return false
    const pending = pendingProbeClaims.get(parentSession)
    if (pending === undefined || typeof pending !== 'number' || pending <= 0) return false
    const schemas = toolSchemasOf(agent)
    if (schemas === undefined || schemasHasWriteTools(schemas)) return false
    pendingProbeClaims.set(parentSession, pending - 1)
    if (pending - 1 <= 0) pendingProbeClaims.delete(parentSession)
    probeClaimed.add(agent)
    return true
  }

  let selfAgent = undefined

  // 1) 会话启动：子代理基线（账本 + 沙箱下限）；规划子代理与主会话注册 save_plan
  //    （主会话侧任意路由态放行：受限规划工件，判定在 mainGateReason 兜底）；主会话与探查子代理
  //    注册 save_probe（scoped；recompose 不重发 session-start，pre-step 兜底）。
  // HK1（0.1.7 换代）：agent/session-start 已删除；agent/created 升为 serial——
  // 监听器被宿主 await，任何抛出都会让会话创建失败。故整块必须吞错：内部异常只
  // console.warn 留痕，绝不放任传播（gateRuntime 已在 apply 期求值，此处不再抛）。
  ctx.on('agent/created', (payload) => {
    try {
      const agent = payload.agent
      if (agent === undefined) return
      selfAgent = agent
      childBaseline(agent)
      if (isPlannerChild(agent) || !isSubagentChild(agent)) registerSavePlan(agent)
      if (!isSubagentChild(agent) || probeClaimFor(agent)) { registerSaveProbe(agent) }
    } catch (error) {
      console.warn('extra-plan: agent/created 初始化失败（不阻断会话创建）：' + (error instanceof Error ? error.message : String(error)))
    }
  })

  // 2) pre-step：账本补记（会话最终消息的行延迟到此）；规划子代理初始任务与
  // 续轮转达机械拼接 plannerPromptSuffix（「任务要求 + 空行 + 配置文本」——宿主
  // exec.arguments 与消息对象均 deepFreeze，拼接走 pre-step 消息替换通道，
  // 与 agent-instructions 基线注入同通道）。
  // C=0：三个官方 cordis skill 由 skill-filesystem 的 customSkillDirs 静态注册进本预设组合
  // （不再靠「不注册」），一律从模型可见 catalog 隐藏——与旧「不注册」语义等价。
  // C=1：保留原 HP1 首轮暂隐逻辑（仅 A=1、F、main/planner、M=ptc 的极简首轮）。
  function shouldHideCreativeCatalog(agent) {
    if (!creativeModeOn()) return true
    if (!bootstrapOn() || !isBootstrapPhase(agent)) return false
    const planner = isPlannerChild(agent)
    const child = isChild(agent)
    if (!planner && child) return false
    return toolPresentationModeOf(agent) === 'ptc'
  }

  // skill catalog 属于 agent/pre-step 消息通道；只改当前请求副本，不注销 skill binding。
  // 仅 HP1（C=1、A=1、F、main/planner、M=ptc）暂隐两个创造 skill；L 与其它组合
  // 保持完整 catalog。prepend 让本投影在 tool-skill 的 catalog 生成之后收到最终 decision。
  ctx.on('agent/pre-step', async (payload, next) => {
    const decision = await next()
    return shouldHideCreativeCatalog(payload.agent) ? projectSkillCatalogDecision(decision) : decision
  }, { prepend: true })

  ctx.on('agent/pre-step', async (payload, next) => {
    if (payload.agent !== undefined) {
      selfAgent = payload.agent
      childBaseline(payload.agent)
      // T3：save_plan 与 save_probe 同构——主会话侧同样在 pre-step 幂等兜底注册
      // （web 会话先按默认预设发布、recompose 不重发 session-start，仅靠 session-start
      // 会漏注册；registerTool 的 WeakSet 保证不重复注册）。
      if (isPlannerChild(payload.agent) || !isSubagentChild(payload.agent)) registerSavePlan(payload.agent)
      if (!isSubagentChild(payload.agent) || probeClaimFor(payload.agent)) { registerSaveProbe(payload.agent) }
    }
    const decision = await next()
    if (decision.kind !== 'enter') return decision
    if (selfAgent === undefined || !isPlannerChild(selfAgent)) return decision
    if (!Array.isArray(decision.messages)) return decision
    // 预算告知（先于 suffix 拼接，suffix 为空也生效）+ 阈值提示（剩余 ≤3 且未注入过时追加一条）。
    const budgetNotice = budgetNoticeText(exploreBudget())
    const used = toolCallsSinceUser(sessionEvents(selfAgent.session), FREE_TOOLS)
    const reminder = budgetReminderText(exploreBudget() - used, exploreBudget(), BUDGET_REMINDER_THRESHOLD)
    let messages = decision.messages.map((message) => withPlannerPromptSuffix(withBudgetNotice(message, budgetNotice), plannerPromptSuffix()))
    if (reminder !== '' && !budgetReminderSent(sessionEvents(selfAgent.session), '本轮探查预算还剩 ')) {
      messages = [...messages, budgetReminderMessage(reminder)]
    }
    return { ...decision, messages }
  })

  // 2.5) 模型请求失败诊断 + MALFORMED_RESPONSE 限次自愈（v0.3.1）：把 failure 的完整
  // cause 链逐行写进诊断文件，用于定位"save_plan 后请求流中断"的真实底层错误（TRANSPORT
  // 只是包装码）；记账之外，对 MALFORMED_RESPONSE 做一次兜底自愈（malformedRecovery，
  // 见模块级注释）：llm-retry 已返回 {kind:'retry'} 时原样透传（不与宿主重试叠加、不
  // 重复重试），否则交 malformedRecovery 判定——命中返回 retry 让 dsh-agent-loop 重试该
  // 步，未命中回退原 action 透传（其余失败码行为不变）。
  const __dirname = dirname(fileURLToPath(import.meta.url))
  const diagPath = typeof cfg.diagFile === 'string' && cfg.diagFile !== '' ? cfg.diagFile : join(__dirname, 'extra-plan-request-errors.jsonl')
  let diagWarned = false
  // causeChainOf is imported from lib/runtime-static.js.

  function recordRequestError(payload) {
    try {
      const row = {
        ts: new Date().toISOString(),
        sessionId: payload.agent !== undefined && payload.agent.session !== undefined ? payload.agent.session.header.id : '',
        role: payload.agent !== undefined ? (isPlannerChild(payload.agent) ? 'planner' : isSubagentChild(payload.agent) ? 'executor' : 'main') : 'unknown',
        turn: payload.turn,
        step: payload.step,
        provider: payload.provider,
        message: payload.failure !== undefined && payload.failure !== null && typeof payload.failure.message === 'string' ? payload.failure.message.slice(0, 400) : '',
        ...(payload.failure !== undefined && payload.failure !== null && payload.failure.code !== undefined ? { code: String(payload.failure.code) } : {}),
        causeChain: causeChainOf(payload.failure, 8),
      }
      const dir = diagPath.slice(0, Math.max(diagPath.lastIndexOf('\\'), diagPath.lastIndexOf('/')))
      if (dir !== '') mkdirSync(dir, { recursive: true })
      writeFileSync(diagPath, JSON.stringify(row) + '\n', { flag: 'a', encoding: 'utf8' })
    } catch (error) {
      if (!diagWarned) {
        diagWarned = true
        console.warn(`extra-plan: request-error diagnostics write failed: ${error instanceof Error ? error.message : String(error)}`)
      }
    }
  }

  ctx.on('agent/request-error', async (payload, next) => {
    let action
    try {
      action = await next()
    } finally {
      recordRequestError(payload)
    }
    if (action !== undefined && action !== null && action.kind === 'retry') return action
    return malformedRecovery(payload) ?? action
  })

  // 2.6) 回合错误取证（agent/error 为 emit、同步回调）：宿主不把回合级错误写
  // console，由 recordAgentError 逐字落盘诊断文件供根因定位
  // （含子代理"腰斩"的流建立失败等 runTurn 级错误）；recordAgentError 内部全吞错、
  // 写失败仅一次性告警，监听器绝不放大故障。
  ctx.on('agent/error', recordAgentError)

  // 4) 会话销毁：同步 final flush + 单会话状态回收。必须保持同步回调——agent/disposed 是
  //    emit/void，宿主调用监听器后只对返回的 Promise 挂 catch、不等待完成；此处 driver 已静止、
  //    session 尚未解绑，同步路径内才能读到最终 snapshot 并结算末轮 usage。
  //    顺序不可换：① 先按缓存 role 同步 foldUsage（在任何 Map 删除之前）；② 保留
  //    pendingProbeClaims 的剩余数量告警语义，再删除该 session 的待认领计数（含
  //    runCodeDenyRecords 的 PTC 拒绝记录桶）；③ 最后按
  //    sessionId 依次回收 jobOutputCallCounters、jobOutputLastAnchors、toolJobsNoticesConsumed、
  //    subCallCounters、usageCursors 与 malformedRetried（MALFORMED 自愈限次账本）。
  //    重复 disposed 幂等；其它 session 的同名 rootCallId、
  //    计数与 cursor 均不受影响（本 session 的去重基准留在 cursor JSON，靠单项续载恢复）。
  //    final fold 写入失败仍走既有单次 ledger warning 且不抛出，不阻断后续清理。
  ctx.on('agent/disposed', (payload) => {
    const agent = payload.agent
    sdkTextCache.dispose(agent)
    const sessionId = agent?.session?.header?.id
    if (typeof sessionId !== 'string') return
    foldUsage(agent, usageRoleOf(agent))
    const pending = pendingProbeClaims.get(sessionId)
    if (Number.isInteger(pending) && pending > 0) {
      const warning = probeDisposalWarning(pending)
      if (warning !== null) console.warn(warning)
    }
    pendingProbeClaims.delete(sessionId)
    runCodeDenyRecords.delete(sessionId)
    malformedRetried.delete(sessionId)
    jobOutputCallCounters.delete(sessionId)
    jobOutputLastAnchors.delete(sessionId)
    toolJobsNoticesConsumed.delete(sessionId)
    subCallCounters.delete(sessionId)
    usageCursors.delete(sessionId)
  })

  // 3) anchored 引导（默认开）：主会话与规划子代理首轮极简；执行者/reviewer 不引导。
  //    native/both 首轮保留 bootstrap shell(s)+read，sections 仅 persona；Pure PTC
  //    首轮保留唯一 run_code、persona 与 tool:read 手写文案——宿主 tools:ptc-only 段已按
  //    用户要求停用、不透传；借宿主段名覆盖 text（cfg.bootstrapReadHint），不生成完整 SDK。
  //    无 shell 无 run_code 跳过+警告一次。钩子常驻（bootstrapOn=false 时也注册）：
  //    另负责按装配目录机械识别只读子代理（reviewer）写入 per-agent 缓存，供
  //    pre-execute 拦截复用；bootstrapOn=false 时仅记录目录、不改装配产物。
  const readOnlyChildren = new WeakSet()
  ctx.on('system-prompt/assemble', async (assembly, context, next) => {
    const result = await next()
    const agent = context.agent
    if (agent === undefined) return result
    const planner = isPlannerChild(agent)
    const child = isChild(agent)
    const schemas = toolSchemasOf(agent)
    if (child && !planner) {
      // 只读分类使用 registry.schemas，而不是装配返回数组；模型可见隐藏不改变执行分类。
      if (schemas !== undefined) {
        if (schemasHasWriteTools(schemas)) readOnlyChildren.delete(agent)
        else readOnlyChildren.add(agent)
      } else if (catalogIsCollapsed(result.tools)) {
        readOnlyChildren.delete(agent)
      } else if (isReadOnlyChildByCatalog(result.tools)) {
        readOnlyChildren.add(agent)
      } else {
        readOnlyChildren.delete(agent)
      }
    }

    // 展示决策按 phase → creative → mode 分层；所有分支只返回模型可见副本。
    const phase = isBootstrapPhase(agent) ? 'first' : 'later'
    const role = planner ? 'planner' : child ? 'executor' : 'main'
    const mode = hasNonEmptySection(result.sections, PTC_SECTION_NAME)
      ? 'ptc'
      : hasNonEmptySection(result.sections, SDK_SECTION_NAME) ? 'both' : 'native'
    const anchoredFirst = bootstrapOn() && phase === 'first' && (role === 'main' || role === 'planner')
    const anchoredPtc = anchoredFirst && mode === 'ptc'
    let presented = result
    if (anchoredPtc) {
      // HP0/HP1：PTC 首轮只保留传输、persona 与手写 read 文案（覆盖 tool:read 的 text）；不先生成完整 SDK。
      presented = projectAssemblyForPresentation(result, schemas, {
        hideCordis: !creativeModeOn(),
        ptcOnly: true,
        keepSectionNames: new Set([PTC_SECTION_NAME, READ_SECTION_NAME]),
      })
    } else if (!creativeModeOn()) {
      let sdkText
      // F/native 与 F/both 随后只返回 bootstrap shell(s)+read，不能为被剥离的完整 SDK 预热。
      if (!anchoredFirst && hasSection(result.sections, SDK_SECTION_NAME)) {
        let language = 'typescript'
        try {
          // 0.1.7 服务名换代：codeRuntime → ptcRuntime（dsh-tools 的 PTC 运行服务）。
          const runtime = typeof ctx.get === 'function' ? ctx.get('ptcRuntime') : undefined
          if (runtime !== undefined && runtime !== null && typeof runtime.language === 'string') language = runtime.language
        } catch (error) { /* 缺少 ptcRuntime 时按测试/兼容默认使用 TypeScript renderer */ }
        try {
          const effectiveSchemas = toolSdkSchemasOf(agent) ?? schemas
          const rendererInput = sdkSchemasForRendering(effectiveSchemas)
          const renderer = await resolveToolsSdkRenderer(language)
          sdkText = await sdkTextCache.getOrCreate(agent, rendererInput, language, renderer)
        } catch (error) {
          console.warn('extra-plan: filtered tools:sdk render failed (' + (error instanceof Error ? error.message : String(error)) + ')')
          sdkText = ''
        }
      }
      presented = projectAssemblyForPresentation(result, schemas, { sdkText, ptcOnly: mode === 'ptc' })
    } else if (mode === 'ptc') {
      // Pure PTC 的保留传输始终是唯一顶层工具；其余 binding 只在嵌套 SDK 中出现。
      presented = projectAssemblyForPresentation(result, schemas, { hideCordis: false, ptcOnly: true })
    }

    if (!anchoredFirst) return presented
    if (!Array.isArray(presented.tools) || presented.tools.length === 0) return presented
    const shells = presented.tools.filter((tool) => tool !== null && typeof tool === 'object' && bootstrapShellTools.has(tool.name))
    const runCodes = presented.tools.filter((tool) => tool !== null && typeof tool === 'object' && tool.name === 'run_code')
    if (shells.length === 0 && runCodes.length === 0) {
      if (!bootstrapShellMissingWarned) {
        bootstrapShellMissingWarned = true
        console.warn('extra-plan: anchoredBootstrap enabled but neither a bootstrap shell nor run_code is present in the catalog — bootstrap skipped for this assembly')
      }
      return presented
    }
    const keep = new Set([...shells.map((tool) => tool.name), ...(shells.length === 0 ? runCodes.map((tool) => tool.name) : []), ...bootstrapCommonTools])
    const bootstrapped = presented.tools.filter((tool) => tool !== null && typeof tool === 'object' && keep.has(tool.name))
    if (anchoredPtc) {
      // 借宿主段名覆盖文本：只改「模型可见副本」的 tool:read text（= 变量②手写文案），
      // 不动宿主注册表；L 段（首个 tool/call 之后）不再进入本分支，自动回到宿主原文。
      const ptcSection = sectionOf(presented.sections, PTC_SECTION_NAME)
      const readSection = sectionOf(presented.sections, READ_SECTION_NAME)
      const sections = [
        { name: 'extra-plan-bootstrap', text: bootstrapPersona },
        // 2026-09-22 按用户要求停用宿主 tools:ptc-only 段的透传：HP 段集固定为 persona + 手写
        // tool:read；原行保留在下以备回滚（ptcSection 取值仅为回滚保留，当前不再使用）。
        // ...(ptcSection === undefined ? [{ name: PTC_SECTION_NAME, text: '' }] : [{ ...ptcSection }]),
        ...(readSection === undefined ? [{ name: READ_SECTION_NAME, text: bootstrapReadHint }] : [{ ...readSection, text: bootstrapReadHint }]),
      ]
      return {
        ...presented,
        sections,
        contexts: [],
        tools: bootstrapped,
      }
    }
    return {
      ...presented,
      sections: [{ name: 'extra-plan-bootstrap', text: bootstrapPersona }],
      contexts: [],
      tools: bootstrapped,
    }
  })

  // 4) 模型与力度继承：子代理 agent/request 解析后，把 provider/model/maxTokens
  //    与 reasoningEffort 注入为父会话当前配置（requestHeader().config，非创建时
  //    快照）。one-shot（执行者/验收者）直接继承当前值；planner（continuable）的
  //    有效模型由 resolvePlannerEntry 现场解析并缓存（本钩子只读缓存，不再做
  //    模型目录查询）：已创建的 planner 不随父会话改模型而变。
  //    真实机制（注释订正）：宿主 installModelSelection 仅由主会话侧会话控制器安装
  //    （setup: installSelection 先于 presets.mount），其 agent/request 钩子无条件
  //    覆写 provider/model/reasoningEffort（剥除 resolved 的 effort）；子代理瀑布不安装
  //    该监听器 → 本插件注入在 next() 解析后执行并最终生效。
  //    显式选择不覆盖：resolved（next() 结果，首请求=创建时 AgentOptions、后续请求=
  //    logged header）的 provider/model 与父会话当前值不同 → 视为显式（官方
  //    routeChanged 口径）→ 不注入；未显式维持现状注入。父会话在子代理运行期间
  //    切换模型 → 子代理保持创建时值（planner 已有 entry 缓存同语义，one-shot 亦冻结）。
  //    effort：resolved 存在且 ≠ 父值 → 显式不注入；路由显式且 resolved 无 effort →
  //    不注入（对齐官方 routeChanged 清 effort）；其余维持父 effort 继承（现状）。
  ctx.on('agent/request', async (payload, next) => {
    const resolved = await next()
    if (payload.agent === undefined || !isSubagentChild(payload.agent)) return resolved
    // planner 模型注入（修复 v2）：在父会话 header 处理之前生效——planner 使用
    // 设置页 plannerModel（resolvePlannerEntry 现场解析/缓存）；不再依赖父 header
    // 非空与 WeakMap 缓存命中（断点①pcfg-null 早退 ②缓存 miss 回退父值 均已消除）。
    if (isPlannerChild(payload.agent)) {
      const entry = await resolvePlannerEntry(payload.agent, payload.signal)
      const nextConfig = { ...resolved }
      if (entry.model !== undefined) nextConfig.model = entry.model
      if (entry.provider !== undefined) nextConfig.provider = entry.provider
      if (entry.maxTokens !== undefined) nextConfig.maxTokens = entry.maxTokens
      // effort 继承（验收补遗）：保持「力度完全继承主会话」（agent.cordis.yml 设计）；
      // 原钩子尾部的 effort 继承对 planner 已不可达（前置早退）。
      try {
        const agents = ctx.get('agents')
        let parent
        try {
          parent = agents !== undefined ? agents.get(payload.agent.session.header.parentSession) : undefined
        } catch (error) {
          parent = undefined
        }
        if (parent !== undefined) {
          const header = typeof parent.session.requestHeader === 'function' ? parent.session.requestHeader() : undefined
          const pcfg = header !== undefined && header.config !== undefined && header.config !== null ? header.config : null
          const parentEffort = pcfg !== null && typeof pcfg.reasoningEffort === 'string' ? pcfg.reasoningEffort : ''
          if (parentEffort !== '') nextConfig.reasoningEffort = parentEffort
        }
      } catch (error) {
        // effort 取不到则不注入（与尾部继承的宽松语义一致）
      }
      return nextConfig
    }
    let agents
    try { agents = ctx.get('agents') } catch (error) { agents = undefined }
    const sources = resolveAgentRouteSources(payload.agent, agents)
    if (sources.available !== true || sources.direct === null) return resolved
    const parentConfig = sources.direct
    const parentProvider = parentConfig.provider
    const parentModel = parentConfig.model
    const resolvedProvider = typeof resolved.provider === 'string' ? resolved.provider : ''
    const resolvedModel = typeof resolved.model === 'string' ? resolved.model : ''
    const resolvedEffort = typeof resolved.reasoningEffort === 'string' ? resolved.reasoningEffort : ''
    const parentEffort = parentConfig.reasoningEffort
    const routeExplicit = isExplicitRoute(resolvedProvider, resolvedModel, parentProvider, parentModel)
    const effortExplicit = isExplicitEffort(resolvedEffort, parentEffort)
    const probe = schemasHasTool(toolSchemasOf(payload.agent), 'save_probe')
    const tokenSource = probe && sources.source !== null ? sources.source : parentConfig
    const nextConfig = { ...resolved }
    // 显式 agentOptions/provider/model 相对直接父路由优先：短路 resolver、目录与真实探针。
    if (!routeExplicit) {
      // 非 planner resolver 内部把 provider/model fallback 固定取顶层主会话；probe 同样不绕过该入口。
      const entry = await resolveOtherAgentEntry(payload.agent, payload.signal, probe)
      if (entry !== null && entry.model !== undefined) nextConfig.model = entry.model
      if (entry !== null && entry.provider !== undefined) nextConfig.provider = entry.provider
      if (entry !== null && entry.maxTokens !== undefined) nextConfig.maxTokens = entry.maxTokens
    } else if (tokenSource.maxTokens !== undefined) {
      // 显式 route 仍保持原 maxTokens 继承语义；probe 沿用顶层来源。
      nextConfig.maxTokens = tokenSource.maxTokens
    }
    const suppressEffort = effortExplicit || (routeExplicit && resolvedEffort === '')
    if (parentEffort !== '' && !suppressEffort) nextConfig.reasoningEffort = parentEffort
    return nextConfig
  })

  // 单实例子调用上限（planner）：按当前 session 的 rootCallId 桶读取计数，未超限则计数 +1。
  // 返回拒绝文案或 null（放行）；空 rootCallId 与 exploreBudget 上限的既有拒绝文案、
  // 计数时机（先判上限、再写入）逐字保持不变。
  function noteRunCodeSubCall(sessionId, rid) {
    const bucket = subCallCounters.get(sessionId)
    const passed = rid === '' || bucket === undefined ? 0 : (bucket.get(rid) || 0)
    if (rid === '' || passed >= exploreBudget()) return runCodeDispatchCapText(rid === '' ? '?' : rid, passed + 1, exploreBudget())
    if (bucket === undefined) subCallCounters.set(sessionId, new Map([[rid, passed + 1]]))
    else bucket.set(rid, passed + 1)
    return null
  }

  // 4b) PTC 闸门拒绝记录（呈现层兜底用）：pre-execute 拒绝 run_code 子调用时，把本次中文
  //     reason 记入 sessionId → rootCallId → Set<reason>；tools/post-execute 在 run_code 失败
  //     结果里按精确子串 'ToolCallError: <reason>' 命中后，把宿主英文包装（worker.cjs 堆栈）
  //     换成「Error: <reason>」。只记子调用（isRunCodeSubCall：exec.sub===true 或
  //     exec.parent!==undefined）——native 直呼被拒时外层结果本就是拒绝文案，无需改写。
  //     记录在 post-execute 消费即清（成败都清），agent/disposed 按 session 清整桶（双保险）。
  const runCodeDenyRecords = new Map()
  function recordRunCodeDeny(agent, exec, reason) {
    if (!isRunCodeSubCall(exec)) return
    if (typeof reason !== 'string' || reason === '') return
    const sessionId = agent !== undefined && agent !== null && agent.session !== undefined && agent.session !== null && agent.session.header !== undefined && agent.session.header !== null ? agent.session.header.id : undefined
    if (typeof sessionId !== 'string' || sessionId === '') return
    const rid = typeof exec.rootCallId === 'string' && exec.rootCallId !== '' ? exec.rootCallId : (typeof exec.callId === 'string' ? exec.callId : '')
    let byRoot = runCodeDenyRecords.get(sessionId)
    if (byRoot === undefined) { byRoot = new Map(); runCodeDenyRecords.set(sessionId, byRoot) }
    let reasons = byRoot.get(rid)
    if (reasons === undefined) { reasons = new Set(); byRoot.set(rid, reasons) }
    reasons.add(reason)
  }

  // 5) 硬闸门（tools/pre-execute）：规划子代理只读 + 探查硬上限；主会话四级锚点。
  ctx.on('tools/pre-execute', (exec, next) => {
    if (exec.agent === undefined) return next()
    const agent = exec.agent
    // 单次会话事件快照（P1-4）：本钩子内全部消费点（锚点扫描、tool-jobs 通知扫描、角色判定、
    // planner 闸门、main 闸门与状态推导）复用同一份快照引用，只取一次。宿主 snapshotEvents()
    // 无参时返回缓存全量快照（无新事件即同一引用），故此处只做快照来源收敛与可读性整理——
    // 本批**不减少**各消费点各自的 O(n) 扫描次数（6 个独立循环各自保持 O(n)）。
    const execEvents = sessionEvents(agent.session)
    // job_output 计数器锚点重置：新用户消息或 send_message 续轮转达时清空该 session 的计数器
    {
      const sessId = agent.session.header.id
      let currentAnchor = -1
      for (let i = execEvents.length - 1; i >= 0; i -= 1) {
        const e = execEvents[i]
        if (e === null || typeof e !== 'object' || e.type !== 'user/message') continue
        const d = e.data
        const kind = d !== null && typeof d === 'object' && d.source !== null && typeof d.source === 'object' ? d.source.kind : ''
        if (kind === 'user' || kind === 'agent-message') {
          currentAnchor = i
          break
        }
      }
      const lastAnchor = jobOutputLastAnchors.get(sessId)
      if (lastAnchor !== currentAnchor) {
        // 只清当前 session：job_output 查重、tool-jobs 消费集与本 session 的 rootCall 桶。
        // subCallCounters 已按 sessionId 分桶，故删除全局 clear()——它会把其它 session
        // 正在执行的 run_code 子调用计数一并清掉（跨会话锚点互不干扰）。
        jobOutputCallCounters.delete(sessId)
        toolJobsNoticesConsumed.delete(sessId)
        subCallCounters.delete(sessId)
        jobOutputLastAnchors.set(sessId, currentAnchor)
      }
    }
    // tool-jobs 完成通知解锁扫描：匹配 source.kind==='tool-jobs' && source.form==='notice'
    // （v4 形状；旧三元组表述（kind 取旧兜底值 plugin + plugin 包名字段）已废，见下方 HK9 注）
    // 从正文用 /background job (\S+)/ 解析 jobId；若存在于本 session 的 jobOutputCallCounters 中则删除该
    // jobId 计数（只清这一个，不清整表、不动 subCallCounters）；解析失败或未跟踪 → 无操作（保守不放行）。
    {
      const sessId = agent.session.header.id
      const consumed = toolJobsNoticesConsumed.get(sessId)
      for (const se of execEvents) {
        if (se === null || typeof se !== 'object' || se.type !== 'user/message') continue
        const sd = se.data
        if (sd === null || typeof sd !== 'object' || sd.source === null || typeof sd.source !== 'object') continue
        const src = sd.source
        // HK9（0.1.7 换代）：dsh-tool-jobs 的完成通知源已改为
        // { kind: 'tool-jobs', form: 'notice', summary }（旧 'plugin' 兜底 kind 已废）。
        if (src.kind !== 'tool-jobs' || src.form !== 'notice') continue
        if (!Array.isArray(sd.content)) continue
        let noticeText = ''
        for (const block of sd.content) {
          if (block !== null && typeof block === 'object' && block.type === 'text' && typeof block.text === 'string') {
            noticeText = block.text
            break
          }
        }
        if (noticeText === '') continue
        const m = noticeText.match(/background job (\S+)/)
        if (m === null) continue
        const jobId = m[1]
        if (consumed !== undefined && consumed.has(jobId)) continue
        const perSession = jobOutputCallCounters.get(sessId)
        if (perSession === undefined || !perSession.has(jobId)) continue
        perSession.delete(jobId)
        if (consumed !== undefined) consumed.add(jobId)
        else toolJobsNoticesConsumed.set(sessId, new Set([jobId]))
      }
    }
    const child = childBaseline(agent, execEvents)
    const planner = isPlannerChild(agent, execEvents)
    // 探查者委派属只读探查能力（与 read/glob/grep 同级）：主会话在任意路由状态放行，
    // 仅强制 one-shot 固定后台（与 subagent/subagent_review 同机械闸门口径）。
    // 置于 planner/child 判定之前，但闸门函数内首先按角色拒绝 planner（T5）：
    // subagent_probe 仅主会话可委派；放行时挂「待认领计数」供 probe 子会话
    // session-start 认领（否则 probe 子会话经 parentSession 无放行痕迹）。
    if (exec.name === 'subagent_probe') {
      const reason = subagentProbeGateReason(exec, planner)
      if (reason !== null) {
        recordRunCodeDeny(agent, exec, reason)
        return { kind: 'deny', reason }
      }
      if (planner && isRunCodeSubCall(exec)) {
        const rid = typeof exec.rootCallId === 'string' ? exec.rootCallId : ''
        const capReason = noteRunCodeSubCall(agent.session.header.id, rid)
        if (capReason !== null) {
          recordRunCodeDeny(agent, exec, capReason)
          return { kind: 'deny', reason: capReason }
        }
      }
      const parentId = agent.session.header.id
      pendingProbeClaims.set(parentId, (pendingProbeClaims.get(parentId) || 0) + 1)
      return next()
    }
    if (planner) {
      let reason = plannerGateReason(exec, execEvents, exploreBudget(), jobOutputCallCounters)
      // 预算耗尽时 run_code 不在此直拒：plannerGateReason 对 run_code 仅可能因预算耗尽返回非 null
      // （run_code 非 write/edit/pwsh/bash/job_output），置 null 让预算判定进入组判定——组判定内按白名单把关：
      // 成员组非空且全部 ∈ FREE_TOOLS 才放行；含非白名单成员或空组/动态访问 → 拒绝（动态拼接文案）。
      if (exec.name === 'run_code' && reason !== null) reason = null
      if (reason !== null) {
        recordRunCodeDeny(agent, exec, reason)
        return { kind: 'deny', reason }
      }
      if (exec.name === 'run_code') {
        const runReason = runCodeGroupDenyReason(undefined, exec, { kind: 'planner' }, { events: execEvents, exploreBudget: exploreBudget(), jobOutputCallCounters, runcodeCatchGate: runcodeCatchGateOn(), gateRuntime })
        if (runReason !== null) {
          recordRunCodeDeny(agent, exec, runReason)
          return { kind: 'deny', reason: runReason }
        }
      }
      // job_output 的 wait 禁令与同 job 查重已由上方 plannerGateReason 首次判定完成
      // （B3 收敛：不再二次调用 jobOutputGateReason）；此处只在全部闸门放行后记录计数器。
      if (exec.name === 'job_output') {
        recordJobOutputCall(agent, exec, jobOutputCallCounters)
      }
      if (planner && isRunCodeSubCall(exec)) {
        const rid = typeof exec.rootCallId === 'string' ? exec.rootCallId : ''
        const capReason = noteRunCodeSubCall(agent.session.header.id, rid)
        if (capReason !== null) {
          recordRunCodeDeny(agent, exec, capReason)
          return { kind: 'deny', reason: capReason }
        }
      }
      return next()
    }
    if (child) {
      // 只读子代理（reviewer/probe，真实工具集判定命中缓存）：write/edit 与 pwsh/bash 写命令
      // 一律拒绝；文案按 save_probe 信号区分（probe 走「探查者只读」，reviewer 文案逐字保持）。
      // 注：此段到达时 planner 必已 return（planner 段在前），`!planner` 条件可省略（保留原状）。
      if (!planner && readOnlyChildren.has(agent)) {
        const probe = schemasHasTool(toolSchemasOf(agent), 'save_probe')
        const reason = childReadonlyGateReason(exec, probe, jobOutputCallCounters)
        if (reason !== null) {
          recordRunCodeDeny(agent, exec, reason)
          return { kind: 'deny', reason }
        }
        if (exec.name === 'run_code') {
          const runReason = runCodeGroupDenyReason(undefined, exec, { kind: 'child', readOnly: true, probe }, { jobOutputCallCounters, runcodeCatchGate: runcodeCatchGateOn(), gateRuntime })
          if (runReason !== null) {
            recordRunCodeDeny(agent, exec, runReason)
            return { kind: 'deny', reason: runReason }
          }
        }
        // job_output 的 wait 禁令与同 job 查重已由上方 childReadonlyGateReason 首次判定完成
        // （B3 收敛：不再二次调用 jobOutputGateReason）；此处只在全部闸门放行后记录计数器。
        if (exec.name === 'job_output') {
          recordJobOutputCall(agent, exec, jobOutputCallCounters)
        }
      }
      return next() // 执行者子代理豁免（目录含 write/edit，缓存未命中）
    }

    const state = deriveFlowState(execEvents, gateRuntime)
    const reason = mainGateReason(state, exec, { events: execEvents, planToolName, jobOutputCallCounters, runcodeCatchGate: runcodeCatchGateOn(), runCodeDepth: 0, gateRuntime })
    if (reason !== null) {
      recordRunCodeDeny(agent, exec, reason)
      return { kind: 'deny', reason }
    }
    // 放行副作用：job_output 计数器记录（B3 收敛：与 planner/只读 child 共用 recordJobOutputCall；
    // 仅在全部闸门放行后执行，时序等价）
    recordJobOutputCall(agent, exec, jobOutputCallCounters)
    return next()
  })

  // 6) 呈现兜底（tools/post-execute）：run_code 失败结果的 error.message 含本插件刚记下的
  //    闸门拒绝 reason（精确子串 'ToolCallError: <reason>'）时，把失败结果 content 改写为
  //    「Error: <reason>」——宿主英文包装（'code run failed (exception)' + worker.cjs 堆栈）
  //    不再进入模型上下文。只改 content（PostToolDecision 禁止对失败结果替换 value）。
  //    fail-open：无记录/未命中/非 run_code/非失败一律 next() 透传（不吞错）；命中与未命中
  //    都在读取后清掉本 root 记录（消费即清）；钩子内异常由宿主 catch 后按 toolErrorResult 兜底。
  ctx.on('tools/post-execute', (exec, result, next) => {
    if (exec === null || typeof exec !== 'object') return next()
    if (exec.agent === undefined || exec.name !== 'run_code') return next()
    if (result === null || typeof result !== 'object' || result.isError !== true) return next()
    const sessionId = exec.agent.session !== undefined && exec.agent.session !== null && exec.agent.session.header !== undefined && exec.agent.session.header !== null ? exec.agent.session.header.id : ''
    const rootId = typeof exec.rootCallId === 'string' && exec.rootCallId !== '' ? exec.rootCallId : (typeof exec.callId === 'string' ? exec.callId : '')
    const reasons = typeof sessionId === 'string' && sessionId !== '' ? (runCodeDenyRecords.get(sessionId) || new Map()).get(rootId) : undefined
    if (reasons === undefined || reasons.size === 0) return next()
    if (typeof sessionId === 'string' && sessionId !== '') {
      const byRoot = runCodeDenyRecords.get(sessionId)
      if (byRoot !== undefined) byRoot.delete(rootId)
    }
    const error = result.error
    const message = error !== null && error !== undefined && typeof error === 'object' && typeof error.message === 'string' ? error.message : ''
    let matched = null
    for (const reason of reasons) {
      if (reason !== '' && message.includes('ToolCallError: ' + reason)) { matched = reason; break }
    }
    if (matched === null) return next()
    return { kind: 'accept', content: [{ type: 'text', text: 'Error: ' + matched }] }
  })
}
