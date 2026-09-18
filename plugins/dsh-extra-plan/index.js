// @local/dsh-extra-plan (v0.2.1)
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
// 4. ask_user_question 答案以 tool/result 回流（tool-result 信封的 toolCallId
//    与 tool/call 的 callId 精确配对），渲染文本为 {"answers":[...]} JSON；
//    提问通道级错误码全集（v0.1.2-rc.1 实际）：ASK_ABORTED / EMPTY_QUESTIONS /
//    CALLER_NOT_LIVE / DELEGATED_CALLER / BAD_INTENT / NO_PROVIDER；宿主无独立
//    取消码（取消/中断统一以 ASK_ABORTED 上报）；BAD_INTENT 为新增码、非通道
//    故障，落入 else 分支重置 route/purpose/clarified/approved（安全方向）；
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
//       pwsh 写命令、禁一切委派；「不同意」保持未确认；
//     - 直行态（route==='direct'）：放行主会话写工具；委派恒拒（无计划批准
//       锚点，机械保证"点直行 = 不派子代理"）；
//     - 规划态（route==='plan'）：澄清完成才放行 subagent_plan 与 save_probe
//       （save_probe 与 subagent_plan 同条件放行，v3 口径）；
//     - 计划已批准（approved）：放行执行类委派（subagent/subagent_fork/
//       workflow/ralph/subagent_review）与写工具；
//     - send_message：完全放行（目标合法性由宿主校验；续轮转达语义不变）；
//     - save_plan：主会话同注册，仅直行态（route==='direct'）放行；其余路由态
//       返回拒绝文案（T3；内容闸门与规划子代理共用同一实现，强度一致）；
//     - subagent_probe：仅主会话可委派（任意路由状态放行 + 固定后台）；规划子代理
//       被闸门拒绝（T5，改用「申请继续探查」升级通道）；
//     - 空白回复（answers:[]）/取消/中断/验词失败一律视为未确认；仅提问
//       通道级错误码白名单逃生放行（防死锁，v11 口径）。
//  2) 规划子代理（subagent_plan 创建、model=pro 的子会话）：
//     - save_plan 工具注册在此子会话与主会话层（session-start 时按
//       isPlannerChild / 非子代理判定；主会话侧仅 direct 路由放行，见 1)）；
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
//     sections 为 persona + tools:ptc-only + tool:read（read 是官方最小契约）；
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
//     保证跨插件实例安全。
//
// 不挂 force-plan、不挂 plan mode、无 exit_plan_mode——本模式没有计划模式预锁
// （快通道教训：不引入启动预锁）。

const CHANNEL_BROKEN_CODES = new Set(['NO_PROVIDER', 'CALLER_NOT_LIVE', 'DELEGATED_CALLER'])

// 路由/目的/批准 ask 的固定枚举词（persona 约定；验词按包含匹配）。
const ROUTE_WORD_DIRECT = '直接执行'
const ROUTE_WORD_PLAN = '进行pro规划'
const ROUTE_WORD_DISAGREE = '不同意'
const APPROVAL_WORD_APPROVE = '同意执行'
const APPROVAL_WORD_REPLAN = '转交pro规划'
const PURPOSE_WORD_REFINE = '完善方案'
const PURPOSE_WORD_REDO = '重新规划'

// 选项集合文本（唯一真源，引用词表常量；各 deny 提示引用，不重复写词）
const ROUTE_OPTIONS_TEXT = `「${ROUTE_WORD_DIRECT}」「${ROUTE_WORD_PLAN}」「${ROUTE_WORD_DISAGREE}」`
const APPROVAL_OPTIONS_TEXT = `「${APPROVAL_WORD_APPROVE}」「${APPROVAL_WORD_REPLAN}」「${ROUTE_WORD_DISAGREE}」`
const ROUTE_CONFIRM_TEXT = `须先 ask_user_question 路由确认（选项固定为${ROUTE_OPTIONS_TEXT}）`
const APPROVAL_CONFIRM_TEXT = `须先 ask_user_question 让用户对方案点「${APPROVAL_WORD_APPROVE}」（批准选项固定为${APPROVAL_OPTIONS_TEXT}）`
const PURPOSE_OPTIONS_TEXT = `「${PURPOSE_WORD_REFINE}」「${PURPOSE_WORD_REDO}」`
const PURPOSE_CONFIRM_TEXT = `须先 ask_user_question 询问用户本次 pro 规划的目的（选项固定为${PURPOSE_OPTIONS_TEXT}）`
function purposeRouteDenyReason() {
  return `目的确认 ask 未按路由顺序：${ROUTE_CONFIRM_TEXT}，选择「${ROUTE_WORD_PLAN}」后再询问规划目的（目的选项固定为${PURPOSE_OPTIONS_TEXT}）`
}

// deny 提示模板（与闸门验词同源：引用词表常量，改词表则提示自动跟随）
function routeDenyReason(toolLabel, state) {
  if (state && state.route === 'plan') {
    return `规划态下主会话不可写文件：${toolLabel}。探查请走 save_probe，写文件请等方案批准后走执行者委派`
  }
  return `路由未确认：${toolLabel}。只读探查可随时进行。创建/修改/删除文件${ROUTE_CONFIRM_TEXT}，用户批准后才可动手`
}
function planDenyReason(action, state) {
  if (state && state.route === 'direct') {
    return `直行态下不可规划：${action}。「直接执行」已选，请直接使用 write/edit/pwsh/bash 等工具动手完成任务`
  }
  if (state && state.route === 'plan' && state.purpose !== 'refine' && state.purpose !== 'redo') {
    return `规划目的尚未确认：${action}。${PURPOSE_CONFIRM_TEXT}，答复后再调用 ${action}`
  }
  if (state && state.route === 'plan' && state.clarified === false) {
    return `澄清问答尚未完成：${action}。请先独立发一次 ask_user_question 做澄清问答（1-3 个关键问题，给候选选项），完成后再调用 ${action}`
  }
  return `子代理未放行：${action}。${ROUTE_CONFIRM_TEXT}，意图澄清问答后再调用 ${action}`
}
function approvalDenyReason(action, state) {
  return `执行类委派未放行：${action}。${APPROVAL_CONFIRM_TEXT}，用户批准后才可委派`
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

// PWSH 写动词判定（P2 位置判定）：语法级写形态全文本匹配（git 写子命令/.NET 静态/COM FSO/
// Export-Csv/Export-Clixml/Tee-Object/Start-Transcript）；裸写动词按段首词判定（参数位置裸词不再拦）。
const PWSH_MUTATION = /\bgit\s+(add|commit|checkout|switch|restore|clean|rm|mv|reset)\b|\b(Export-Csv|Export-Clixml|Tee-Object|Start-Transcript)\b|\[System\.IO\.File\]::(WriteAllText|WriteAllBytes|AppendAllText|Delete|Move|Copy|Replace|Encrypt|Decrypt)|\[IO\.File\]::(WriteAllText|WriteAllBytes|AppendAllText|Delete|Move|Copy|Replace|Encrypt|Decrypt)|\[System\.IO\.(FileStream|StreamWriter|BinaryWriter)\]::new|\[System\.IO\.Compression\.ZipFile\]::(CreateFromDirectory|ExtractToDirectory)|\[System\.IO\.Directory\]::(Delete|Move|CreateDirectory)|New-Object\s+-ComObject\s+Scripting\.FileSystemObject/i
const PWSH_BARE_WORDS = /\b(New-Item|Remove-Item|Rename-Item|Move-Item|Copy-Item|Set-Content|Add-Content|Clear-Content|Out-File|Set-Item|New-ItemProperty|Set-ItemProperty|Remove-ItemProperty|mkdir|rmdir|rd|del|erase|copy|move|ren|rename|xcopy|robocopy)\b/i

// bash 写命令（与 PWSH_MUTATION 严格对等，识别创建/修改/删除文件的操作；P2 起为位置判定）：
//   - 裸命令词：rm/mv/cp/mkdir/rmdir/touch/tee/chmod/chown/ln/install/rsync/truncate/
//     fallocate/shred/zip 按段首词判定——按 ; 换行 && || | & 切段后只判每段首个命令词，
//     段首为 sudo/env/nohup/command 时取下一词；参数位置裸词不再拦（如 grep -rn rm src/、
//     echo "del done" 放行）。
//   - 已知边界（与 PWSH_MUTATION 对等）：语法级写形态出现在参数位置仍全文本命中；位置判定下
//     包管理器命令首词非写动词不拦（此前 install 裸词全文本匹配曾使 npm install -g 误拦，
//     本改动修复）；首词即 install/rsync/truncate/fallocate/shred/zip 仍拦。
//   - git 写子命令：add/commit/checkout/switch/restore/clean/rm/mv/reset
//   - sed 原地修改：sed -i / sed -i.bak / sed --in-place（sed\s+(?:--in-place\b|(?:-[A-Za-z]*\s+)*-i\b)：
//     覆盖 -i 前带其他短选项（如 sed -n -i），且不误拦 sed 脚本内容里的 -i 字符串
//     （如 sed 's/-i/x/' file 只读输出）；残余边界（极罕见）：-e 带脚本参数后再 -i
//     的复合写法会漏拦，PWSH 无对等物，按严格对等不扩大）
//   - 重定向写：> >> 2> 2>> &> >&（fd→fd 重定向属只读管道不拦截：2>&1/1>&2 由
//     [0-9]?>>? 后负向前瞻排除 &N；>&2 由 >& 后负向前瞻排除数字）
//   v0.1.7 起：PWSH_MUTATION 已覆盖 .NET 静态方法（System.IO.File/IO.File/FileStream/
//   StreamWriter/BinaryWriter/ZipFile/Directory）、COM Scripting.FileSystemObject、
//   Export-Csv/Export-Clixml/Tee-Object/Start-Transcript；BASH_MUTATION 已覆盖
//   dd of=/install/rsync/truncate/fallocate/shred/wget -O/curl -o/vim/vi/nano/tar -c/zip
//   （Linux 待真机验证）。
const BASH_MUTATION = /git\s+(add|commit|checkout|switch|restore|clean|rm|mv|reset)\b|sed\s+(?:--in-place\b|(?:-[A-Za-z]*\s+)*-i\b)|(?:[0-9]?>>?(?!&\d)|&>|>&(?!\d))|\bdd\b[^|]*\sof=|wget\s+.*-O\b|curl\s+.*-o\b|\bvi(m)?\s+\S|\bnano\s+\S|tar\s+-[A-Za-z]*c/i
const BASH_BARE_WORDS = /\b(rm|mv|cp|mkdir|rmdir|touch|tee|chmod|chown|ln|install|rsync|truncate|fallocate|shred|zip)\b/i



// ── 纯判定函数（模块顶层；经 decisions 导出供场景测试直接复用，防复制漂移） ──

// 会话事件快照（sessionEvents）与子代理识别（isSubagentChild）的唯一来源 = lib/agent-session.js
// （index.js 与 lib/model-routing.js 共用，模块内不再保留镜像副本）；见下方 import 行，
// decisions 继续 re-export isSubagentChild（名字数不变）。

// 此刻是否受委派（父会话 agent 存活）；调用方已确认 isSubagentChild。
// 缺 parentSession / agents 缺席 / 读取失败一律偏安全豁免（v11 口径）。
function isLiveDelegation(agent, agents) {
  const header = agent.session.header
  if (header === undefined || header === null) return true
  const parentSession = header.parentSession
  if (parentSession === undefined) return true
  if (agents === undefined) return true
  try {
    return agents.get(parentSession) !== undefined
  } catch (error) {
    return true
  }
}

// 子代理沙箱下限判定：会话级 read-only override 或部署默认 read-only 时抬升。
function childPolicyNeedsFloor(session, sandboxPolicy) {
  if (sandboxPolicy === undefined) return false
  const override = sandboxPolicy.overrideOf(session)
  const effective = override !== undefined ? override : sandboxPolicy.defaultMode
  return effective === 'read-only'
}

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

// pwsh/bash 命令文本（对象/字符串双形状，v11 修复）。已探查核实：bash 与 pwsh 的
// exec.arguments 形状一致——dsh-tool-bash 与 dsh-tool-pwsh 的 defineTool 参数定义均为
// { command: { type: "string", required: true } }。
function commandTextOf(exec) {
  const raw = exec.arguments
  if (raw === undefined || raw === null) return ''
  if (typeof raw === 'string') {
    if (raw.length === 0) return ''
    let parsed = null
    try { parsed = JSON.parse(raw) } catch (error) { /* 非 JSON，原样使用 */ }
    if (parsed !== null && typeof parsed === 'object' && typeof parsed.command === 'string') return parsed.command
    return raw
  }
  if (typeof raw === 'object' && typeof raw.command === 'string') return raw.command
  return ''
}
function pwshCommandOf(exec) { return commandTextOf(exec) }
function bashCommandOf(exec) { return commandTextOf(exec) }
const SHELL_PREFIX_WORDS = new Set(['sudo', 'env', 'nohup', 'command'])
const INNER_SHELL_WORDS = new Set(['pwsh', 'powershell', 'cmd', 'bash', 'sh'])
function mutationTextMatches(text, syntaxRe, bareRe, depth) {
  if (text === '' || depth >= 4) return false
  if (syntaxRe.test(text)) return true
  const segs = text.split(/[;\r\n]|\s*&&\s*|\s*\|\|\s*|\s*\|\s*|\s*&\s*/)
  for (let s = 0; s < segs.length; s += 1) {
    const seg = segs[s]
    const first = /^\s*([A-Za-z0-9_.:\/-]+)/.exec(seg)
    if (first === null) continue
    let word = first[1]
    if (SHELL_PREFIX_WORDS.has(word)) {
      const second = /^\s*([A-Za-z0-9_.:\/-]+)/.exec(seg.slice(first[0].length))
      if (second === null) continue
      word = second[1]
    }
    if (INNER_SHELL_WORDS.has(word)) {
      const arg = /-(?:Command|c)\s+(?:"([^"]*)"|'([^']*)')/i.exec(seg)
      if (arg !== null) {
        const inner = arg[1] !== undefined ? arg[1] : arg[2]
        // 内层为另一平台 shell（pwsh 内嵌 bash 或反向）时两侧写形态并判（保守方向=拦）
        if (mutationTextMatches(inner, syntaxRe, bareRe, depth + 1) || mutationTextMatches(inner, PWSH_MUTATION, PWSH_BARE_WORDS, depth + 1) || mutationTextMatches(inner, BASH_MUTATION, BASH_BARE_WORDS, depth + 1)) return true
      }
      continue
    }
    if (bareRe.test(word)) return true
  }
  return false
}
function mutationMatches(commandOf, exec, syntaxRe, bareRe) {
  const cmd = commandOf(exec)
  return cmd !== '' && mutationTextMatches(cmd, syntaxRe, bareRe, 0)
}
function pwshMutationMatches(exec) { return mutationMatches(pwshCommandOf, exec, PWSH_MUTATION, PWSH_BARE_WORDS) }
function bashMutationMatches(exec) { return mutationMatches(bashCommandOf, exec, BASH_MUTATION, BASH_BARE_WORDS) }



// 从 ask_user_question 的 tool/call 事件解析选项标签集——只收首问 questions[0] 的选项标签（第二问「修改意见」为纯文本输入，其选项不进入验词集合）。
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

// 路由 ask 与批准 ask 的标准词集合（用于三分法判定）。
const ROUTE_GATE_SET = new Set([ROUTE_WORD_DIRECT, ROUTE_WORD_PLAN, ROUTE_WORD_DISAGREE])
const APPROVAL_GATE_SET = new Set([APPROVAL_WORD_APPROVE, APPROVAL_WORD_REPLAN, ROUTE_WORD_DISAGREE])
const PURPOSE_GATE_SET = new Set([PURPOSE_WORD_REFINE, PURPOSE_WORD_REDO])

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
function categorizeGateAsk(labels) {
  if (isExactGateSet(labels, ROUTE_GATE_SET) || isExactGateSet(labels, APPROVAL_GATE_SET) || isExactGateSet(labels, PURPOSE_GATE_SET)) return 'standard'
  if (isPartialGateSet(labels, ROUTE_GATE_SET) || isPartialGateSet(labels, APPROVAL_GATE_SET) || isPartialGateSet(labels, PURPOSE_GATE_SET)) return 'malformed'
  return 'ordinary'
}

// 根据缺失的词生成大白话 deny 提示，列出标准模板和具体缺项。
function gateAskDenyReason(labels) {
  const routeMissing = []
  for (const word of ROUTE_GATE_SET) {
    let found = false
    for (const label of labels) {
      if (label.indexOf(word) !== -1) { found = true; break }
    }
    if (!found) routeMissing.push(word)
  }
  const approvalMissing = []
  for (const word of APPROVAL_GATE_SET) {
    let found = false
    for (const label of labels) {
      if (label.indexOf(word) !== -1) { found = true; break }
    }
    if (!found) approvalMissing.push(word)
  }
  const purposeMissing = []
  for (const word of PURPOSE_GATE_SET) {
    let found = false
    for (const label of labels) {
      if (label.indexOf(word) !== -1) { found = true; break }
    }
    if (!found) purposeMissing.push(word)
  }
  let msg = `ask 选项不规范。路由 ask 选项固定为${ROUTE_OPTIONS_TEXT}；批准 ask 选项固定为${APPROVAL_OPTIONS_TEXT}；目的 ask 选项固定为${PURPOSE_OPTIONS_TEXT}。`
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
// kind='route'：须恰好 1 个问题；kind='approve'：须至少 2 个问题（第二个为修改意见可空）。
// kind='approve' 追加：第二问（questions[1]）起不得带非空 options（修改意见必须纯文本输入）。
// 通过返回 null，不通过返回 deny reason 字符串（含"修改意见"提示）。
function validateGateAskStructure(kind, questions) {
  if (!Array.isArray(questions)) return 'ask 结构错误：缺少 questions 数组'
  if (kind === 'route') {
    if (questions.length !== 1) return `路由 ask 结构错误：须恰好 1 个问题（路由确认 ask 只做一次三选一，后续澄清请另发一次 ask_user_question。选项固定为${ROUTE_OPTIONS_TEXT}），当前 ${questions.length} 个问题`
    return null
  }
  if (kind === 'purpose') {
    if (questions.length !== 1) return `目的 ask 结构错误：须恰好 1 个问题（规划目的确认 ask 只做一次二选一，后续澄清请另发一次 ask_user_question。选项固定为${PURPOSE_OPTIONS_TEXT}），当前 ${questions.length} 个问题`
    return null
  }
  if (kind === 'approve') {
    if (questions.length < 2) return `批准 ask 结构错误：须至少 2 个问题（第一个为批准选项固定为${APPROVAL_OPTIONS_TEXT}，第二个为修改意见可空），当前 ${questions.length} 个问题`
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
// 仅经 decisions 导出（L1232）供 pe-test step-00-全流程回归.mjs L149 调用（K1-K5）。
// 删除定义会使 decisions 顶层求值 ReferenceError（index.js 模块加载即崩）——保留。
// ask 分类：路由 ask（同时含「直接执行」「进行pro规划」）、批准 ask（含
// 「同意执行」）、其余视为澄清 ask。persona 约定选项措辞固定。
function askKindOf(labels) {
  let hasDirect = false
  let hasPlan = false
  let hasApprove = false
  let hasRefine = false
  let hasRedo = false
  for (const label of labels) {
    if (label.indexOf(ROUTE_WORD_DIRECT) !== -1) hasDirect = true
    if (label.indexOf(ROUTE_WORD_PLAN) !== -1) hasPlan = true
    if (label.indexOf(APPROVAL_WORD_APPROVE) !== -1) hasApprove = true
    if (label.indexOf(PURPOSE_WORD_REFINE) !== -1) hasRefine = true
    if (label.indexOf(PURPOSE_WORD_REDO) !== -1) hasRedo = true
  }
  if (hasDirect && hasPlan) return 'route'
  if (hasApprove) return 'approve'
  if (hasRefine && hasRedo) return 'purpose'
  return 'clarify'
}

// 宽松版 ask 分类：专给状态机用，只要 ask 选项里出现任一路由词/批准词就归类，
// 不要求同时包含两个词（run_code 子调用路径不做选项集校验，宽松分类器避免状态机误判）。
// 「不同意」是路由组与批准组的共享词，按特异性优先：路由特有词（直接执行/进行pro规划）
// → route；批准特有词（同意执行/转交pro规划）→ approve；仅有「不同意」→ route。
function askKindOfRelaxed(labels) {
  let hasRouteSpecific = false
  let hasApproveSpecific = false
  let hasDisagree = false
  let hasPurposeSpecific = false
  for (const label of labels) {
    if (label.indexOf(ROUTE_WORD_DIRECT) !== -1 || label.indexOf(ROUTE_WORD_PLAN) !== -1) hasRouteSpecific = true
    if (label.indexOf(APPROVAL_WORD_APPROVE) !== -1 || label.indexOf(APPROVAL_WORD_REPLAN) !== -1) hasApproveSpecific = true
    if (label.indexOf(ROUTE_WORD_DISAGREE) !== -1) hasDisagree = true
    if (label.indexOf(PURPOSE_WORD_REFINE) !== -1 || label.indexOf(PURPOSE_WORD_REDO) !== -1) hasPurposeSpecific = true
  }
  if (hasRouteSpecific) return 'route'
  if (hasApproveSpecific) return 'approve'
  if (hasDisagree) return 'route'
  if (hasPurposeSpecific) return 'purpose'
  return 'clarify'
}

function matchRouteLabel(selected) {
  for (const label of selected) {
    if (label.indexOf(ROUTE_WORD_DIRECT) !== -1) return 'direct'
    if (label.indexOf(ROUTE_WORD_PLAN) !== -1) return 'plan'
  }
  for (const label of selected) {
    if (label.indexOf(ROUTE_WORD_DISAGREE) !== -1) return 'disagree'
  }
  return null
}

function matchApprovalLabel(selected) {
  for (const label of selected) {
    if (label.indexOf(APPROVAL_WORD_APPROVE) !== -1) return 'approve'
    if (label.indexOf(APPROVAL_WORD_REPLAN) !== -1) return 'replan'
  }
  for (const label of selected) {
    if (label.indexOf(ROUTE_WORD_DISAGREE) !== -1) return 'disagree'
  }
  return null
}

function matchPurposeLabel(selected) {
  for (const label of selected) {
    if (label.indexOf(PURPOSE_WORD_REFINE) !== -1) return 'refine'
    if (label.indexOf(PURPOSE_WORD_REDO) !== -1) return 'redo'
  }
  return null
}

// 解析一次 ask 的结果（tool/result 事件）。返回：
//   { callId, kind: 'ok', answersLen, selected } —— 正常答复（answersLen=0 为空白回复）
//   { callId, kind: 'error', code } —— 错误结果（取消/中断/通道错误/参数错误）
//   { callId: undefined } —— 与该次 ask 无关的结果
function parseAskResultData(data) {
  if (data === null || typeof data !== 'object') return { callId: undefined }
  const message = data.message
  if (message === null || typeof message !== 'object' || !Array.isArray(message.content)) return { callId: undefined }
  let callId
  let inner
  for (const outer of message.content) {
    if (outer !== null && typeof outer === 'object' && outer.type === 'tool-result') {
      if (typeof outer.toolCallId === 'string') callId = outer.toolCallId
      if (inner === undefined && Array.isArray(outer.content)) inner = outer.content
    }
  }
  if (typeof callId !== 'string') return { callId: undefined }
  if (data.error !== undefined && data.error !== null) {
    return { callId, kind: 'error', code: typeof data.error.code === 'string' ? data.error.code : '' }
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
//   { callId, kind: 'error', code } —— isError===true（嵌套层无错误码 → code=''）
//   { callId: undefined } —— 防御（subCallId 非 string）
function parseDispatchAskResult(data) {
  if (data === null || typeof data !== 'object') return { callId: undefined }
  const callId = data.subCallId
  if (typeof callId !== 'string') return { callId: undefined }
  if (data.isError === true) {
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
//   route: 'none' | 'direct' | 'plan'（「不同意」→ 回 'none'，保持未确认）
//   clarified: 是否有完成的澄清问答（空白回复不算）
//   approved: 是否已获「同意执行」（「转交pro规划」「不同意」→ 重置 false）
//   purpose: 'none' | 'refine' | 'redo'（目的确认：「完善方案」→ refine / 「重新规划」→ redo）
//   channelBroken: 提问通道级错误（逃生放行标记）
function deriveFlowState(events) {
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
      if (labels !== null) asks.set(e.data.callId, askKindOfRelaxed(labels))
      continue
    }
    if (isDispatchStart(e.type) && e.data !== null && typeof e.data === 'object' &&
        e.data.name === ASK_TOOL && typeof e.data.subCallId === 'string') {
      const labels = labelsOfCallData(e.data)
      if (labels !== null) asks.set(e.data.subCallId, askKindOfRelaxed(labels))
      continue
    }
    if (isDispatch(e.type) && e.data !== null && typeof e.data === 'object' &&
        typeof e.data.subCallId === 'string') {
      const result = parseDispatchAskResult(e.data)
      if (result.callId === undefined || !asks.has(result.callId)) continue
      if (result.kind === 'error') {
        if (CHANNEL_BROKEN_CODES.has(result.code)) state.channelBroken = true
        else resetRouteState()
        continue
      }
      const kind = asks.get(result.callId)
      if (kind === 'route') {
        resetStageState()
        const matched = matchRouteLabel(result.selected)
        if (matched === 'direct') state.route = 'direct'
        else if (matched === 'plan') state.route = 'plan'
        else state.route = 'none'
      } else if (kind === 'purpose') {
        if (state.route === 'plan' && result.answersLen > 0) {
          const matched = matchPurposeLabel(result.selected)
          if (matched !== null) {
            resetStageState()
            state.purpose = matched
          }
        }
      } else if (kind === 'clarify') {
        if (result.answersLen > 0 && state.route === 'plan' && (state.purpose === 'refine' || state.purpose === 'redo')) state.clarified = true
      } else if (kind === 'approve') {
        const matched = matchApprovalLabel(result.selected)
        if (matched === 'approve') state.approved = true
        else state.approved = false
      }
      continue
    }
    if (e.type !== 'tool/result') continue
    const result = parseAskResultData(e.data)
    if (result.callId === undefined || !asks.has(result.callId)) continue
    if (result.kind === 'error') {
      if (CHANNEL_BROKEN_CODES.has(result.code)) state.channelBroken = true
      else resetRouteState()
      continue
    }
    const kind = asks.get(result.callId)
    if (kind === 'route') {
      resetStageState()
      const matched = matchRouteLabel(result.selected)
      if (matched === 'direct') state.route = 'direct'
      else if (matched === 'plan') state.route = 'plan'
      // disagree 与其它未识别标签同义：路由不成立（原 else if (disagree) 与本分支同值，合并）。
      else state.route = 'none'
    } else if (kind === 'purpose') {
      if (state.route === 'plan' && result.answersLen > 0) {
        const matched = matchPurposeLabel(result.selected)
        if (matched !== null) {
          resetStageState()
          state.purpose = matched
        }
      }
    } else if (kind === 'clarify') {
      if (result.answersLen > 0 && state.route === 'plan' && (state.purpose === 'refine' || state.purpose === 'redo')) state.clarified = true
    } else if (kind === 'approve') {
      const matched = matchApprovalLabel(result.selected)
      if (matched === 'approve') state.approved = true
      // replan/disagree 与其它未识别标签同义：未获批准（原 else if (replan|disagree) 与本分支同值，合并）。
      else state.approved = false
    }
  }
  return state
}


// 会话内 tool/call 成功配对计数（排除 skipNames，如 save_plan/send_message）——探查硬上限判据。
// 直呼 = tool/call + tool/result(ok) 配对计（data.error undefined/null + message.content 内
// tool-result 的 toolCallId 命中 + 块级 isError!==true 排除）；ptc/code-dispatch（run_code 子调用）
// 不再计入——容器计费：run_code 本身计 1 次（tool/call+tool/result 配对），子调用由实例上限单独约束。
// 修复B（被拒不烧预算）：pre-execute deny 的 tool/result 无 data.error（仅 HarnessError 有 .info），
// 但 tool-result 块恒带块级 isError:true → 配对判定按块级 isError 排除，被拒调用才真实不计。
function toolCallCount(events, skipNames) {
  if (!Array.isArray(events)) return 0
  const okCalls = new Set()
  for (const e of events) {
    if (e === null || typeof e !== 'object') continue
    if (e.type === 'tool/result') {
      const d = e.data
      if (d === null || typeof d !== 'object') continue
      if (d.error !== undefined && d.error !== null) continue
      const message = d.message
      if (message === null || typeof message !== 'object' || !Array.isArray(message.content)) continue
      for (const outer of message.content) {
        if (outer !== null && typeof outer === 'object' && outer.type === 'tool-result' && typeof outer.toolCallId === 'string' && outer.isError !== true) okCalls.add(outer.toolCallId)
      }
      continue
    }
  }
  let count = 0
  for (const e of events) {
    if (e === null || typeof e !== 'object') continue
    if (e.type !== 'tool/call') continue
    const d = e.data
    if (d === null || typeof d !== 'object' || typeof d.name !== 'string') continue
    if (skipNames !== undefined && skipNames.has(d.name)) continue
    if (typeof d.callId === 'string' && okCalls.has(d.callId)) count += 1
  }
  return count
}

// 探查预算锚点计数：自最近一条主会话发往本子代理的消息（初始任务
// kind=user，或 send_message 续轮转达 kind=agent-message）之后的 tool/call
// 数。用户不直接对话子代理，这两类消息均由主会话触发——每条 = 一次用户
// 授权（预算重置）；运行时上下文快照（kind=plugin）不构成锚点。无锚点时
// 与 toolCallCount 同口径。
function toolCallsSinceUser(events, skipNames) {
  if (!Array.isArray(events)) return 0
  let anchor = -1
  for (let i = events.length - 1; i >= 0; i -= 1) {
    const e = events[i]
    if (e === null || typeof e !== 'object' || e.type !== 'user/message') continue
    const d = e.data
    const kind = d !== null && typeof d === 'object' && d.source !== null && typeof d.source === 'object' ? d.source.kind : ''
    if (kind === 'user' || kind === 'agent-message') {
      anchor = i
      break
    }
  }
  if (anchor === -1) return toolCallCount(events, skipNames)
  return toolCallCount(events.slice(anchor + 1), skipNames)
}


// 规划任务附加指令拼接（v0.1.5）：主会话委派 subagent_plan 的初始任务消息
// （source.kind=user）与 send_message 续轮转达（source.kind=agent-message）末尾
// 机械追加配置文本——「任务要求 + 空行 + 配置文本」。运行时快照（kind=plugin）
// 不追加；非单文本块或已含后缀时原样返回（幂等）。返回新消息（宿主消息对象
// deepFreeze，不可原地改）。
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
function withPlannerPromptSuffix(message, suffix) {
  const r = appendSuffixBlock(message, suffix)
  // 外层拼接后统一补一次换行：多块消息（DSH 英文块在末尾）时避免跨块 join 贴连；
  // 幂等（末尾已有 \n 则不再补）；单块消息不受影响。
  if (!Array.isArray(r.content) || r.content.length <= 1) return r
  const first = r.content[0]
  if (first === null || typeof first !== 'object' || first.type !== 'text' || typeof first.text !== 'string') return r
  if (first.text.endsWith('\n')) return r
  return { ...r, content: [{ ...first, text: first.text + '\n' }, ...r.content.slice(1)] }
}

// ── 预算告知/阈值提示（v0.1.6）：规划子代理创建/续轮即知预算上限 ──
// 阈值固定 3（不进配置文件）
const BUDGET_REMINDER_THRESHOLD = 3

// 预算告知文本：本轮探查预算上限为 {budget} 次工具调用。
function budgetNoticeText(budget) {
  return `本轮探查预算上限为 ${budget} 次工具调用。探查时 ≥ 2 个独立方向自行 read/glob/grep 分批核对；缺信息时输出「申请继续探查：<待查项> — <原因>」交主会话委派探查者。预算耗尽时输出「申请继续探查：<待查项> — <原因>」，主会话将探查待查项并转达线索文件路径，你读取线索继续工作。探查完成后直接调用 save_plan 落盘（系统会自动检测未探查项）`
}

// 预算告知拼接：结构同 withPlannerPromptSuffix（kind 限定 user/agent-message、
// 单文本块、已含则幂等、返回新对象不原地改）。
function withBudgetNotice(message, notice) { return appendSuffixBlock(message, notice) }

// 阈值提示文本：budget <= threshold 不提示；remaining 不在 (0, threshold] 不提示。
function budgetReminderText(remaining, budget, threshold) {
  if (budget <= threshold) return ''
  if (remaining <= 0 || remaining > threshold) return ''
  return `本轮探查预算还剩 ${remaining} 次`
}

// 阈值提示消息：kind 必须为 'plugin'（锚点规则只认 user/agent-message，kind=user 会误重置预算）。
// 身份（id/role）必须由宿主构造器给出：手写对象缺 id/role 会被 dsh-session 判为损坏会话。
function budgetReminderMessage(reminder) {
  return createUserMessage({ source: { kind: 'plugin', plugin: 'dsh-extra-plan' }, content: [{ type: 'text', text: reminder }] })
}

// 阈值提示幂等：自最近一条 user/agent-message 锚点之后是否已注入过含 marker 的消息
// （无锚点全量扫描；元素缺 content 按无命中处理、不抛异常）。天然每轮重置。
function budgetReminderSent(events, marker) {
  if (!Array.isArray(events)) return false
  let anchor = -1
  for (let i = events.length - 1; i >= 0; i -= 1) {
    const e = events[i]
    if (e === null || typeof e !== 'object' || e.type !== 'user/message') continue
    const d = e.data
    const kind = d !== null && typeof d === 'object' && d.source !== null && typeof d.source === 'object' ? d.source.kind : ''
    if (kind === 'user' || kind === 'agent-message') {
      anchor = i
      break
    }
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

// deny 文案：used 语义 = 已成功次数（不含本次被拒调用）；仅把基线文案开头
// 「探查预算已耗尽：」改为「探查预算已耗尽（本轮已用 {used}/{budget}）：」。
function budgetExhaustedReason(used, budget) {
  return `探查预算已耗尽（本轮已用 ${used}/${budget}）：输出「申请继续探查：<待查项> — <原因>」。主会话将探查待查项并转达线索文件路径，你读取线索继续工作。探查完成则直接调用 save_plan 落盘。`
}

// 判定比较：used > budget 才拒绝（成功上限 = 预算值，第 budget+1 次尝试才拒）。
function budgetExceeded(used, budget) {
  return used > budget
}

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

// ② planner 分支（plannerGateReason；自 apply 内提取的纯部分）：write/edit → pwsh → bash → 预算；不含 run_code（由调用方处理）。
function plannerGateReason(exec, events, exploreBudget, jobOutputCallCounters) {
  if (exec.name === 'write' || exec.name === 'edit') {
    return '规划子代理只读：方案经 save_plan 落盘，其余写入一律禁止（toolFilter 之外的第二道防线）'
  }
  if (exec.name === 'pwsh' && pwshMutationMatches(exec)) {
    return '规划子代理只读：pwsh 仅限只读探查命令，禁止创建/修改/删除文件'
  }
  if (exec.name === 'bash' && bashMutationMatches(exec)) {
    return '规划子代理只读：bash 仅限只读探查命令，禁止创建/修改/删除文件'
  }
  if (exec.name === 'job_output') return jobOutputGateReason(exec, jobOutputCallCounters)
  if (!FREE_TOOLS.has(exec.name) && !isRunCodeSubCall(exec)) {
    const used = toolCallsSinceUser(events !== undefined ? events : [], FREE_TOOLS)
    if (budgetExceeded(used + 1, exploreBudget)) {
      return budgetExhaustedReason(Math.min(used, exploreBudget), exploreBudget)
    }
  }
  return null
}

// ③ child 只读块（childReadonlyGateReason；自 apply 内提取的纯部分）：write/edit → pwsh → bash；probe 布尔选文案；不含 run_code。
function childReadonlyGateReason(exec, probe, jobOutputCallCounters) {
  if (exec.name === 'write' || exec.name === 'edit') {
    return probe ? '探查者只读：探查不修改任何文件，write/edit 一律禁止（工具目录判定）' : '验收复核者只读：验收复核不修改任何文件，write/edit 一律禁止（工具目录判定）'
  }
  if (exec.name === 'pwsh' && pwshMutationMatches(exec)) {
    return probe ? '探查者只读：pwsh 仅限只读探查命令，禁止创建/修改/删除文件' : '验收复核者只读：pwsh 仅限只读探查命令，禁止创建/修改/删除文件'
  }
  if (exec.name === 'bash' && bashMutationMatches(exec)) {
    return probe ? '探查者只读：bash 仅限只读探查命令，禁止创建/修改/删除文件' : '验收复核者只读：bash 仅限只读探查命令，禁止创建/修改/删除文件'
  }
  if (exec.name === 'job_output') return jobOutputGateReason(exec, jobOutputCallCounters)
  return null
}

// job_output 全角色闸门（v0.1.10）：wait:true 禁令 + 同 job 查重（自原 mainGateReason 分支逐字搬移，
// 闸门 1/2 文案逐字不变）；counters undefined/null 或 vExec 无 agent（组判定成员）时
// 跳过查重、wait 检查照常。
function jobOutputGateReason(exec, jobOutputCallCounters) {
  const args = exec !== undefined && exec !== null ? exec.arguments : undefined
  // 闸门 1：禁止 wait: true 前台等待（参数不可解析时跳过，运行时瀑布兜底）
  if (args !== undefined && args !== null && typeof args === 'object' && args.wait === true) {
    return 'job_output 禁止带 wait: true 前台等待。请省略 wait 参数或设 wait: false，job 完成后会收到通知'
  }
  // 闸门 2：禁止同一 jobId 连续调用（防轮询）——内存计数器替代 events 推导。
  // 只读查重（写入由 listener 放行路径执行，时序等价）；组判定成员无会话上下文时
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
//    ask → write/edit → cordis 6 只读 → cordis_run → pwsh/bash → planToolName
//    → save_probe → save_plan（T3：仅 direct 放行）→ subagent 族
//    → run_code（调 runCodeGroupDenyReason，depth+1）
//    → job_output（wait 检查 + 计数器查重，只读不写入；set 由 listener 放行路径执行）→ null。
//    gateCtx: { events, planToolName, jobOutputCallCounters, runCodeDepth }。
function mainGateReason(state, exec, gateCtx) {
  const ctx = gateCtx !== undefined && gateCtx !== null ? gateCtx : {}
  const events = ctx.events !== undefined && ctx.events !== null ? ctx.events : []
  const planToolName = typeof ctx.planToolName === 'string' && ctx.planToolName !== '' ? ctx.planToolName : 'subagent_plan'
  state = state !== undefined && state !== null ? state : { route: 'none', clarified: false, approved: false, purpose: 'none', channelBroken: false }
  const escape = state.channelBroken === true
  const name = exec !== undefined && exec !== null && typeof exec.name === 'string' ? exec.name : ''
  if (name === ASK_TOOL) {
    const labels = labelsOfCallData(exec)
    if (labels !== null) {
      const category = categorizeGateAsk(labels)
      if (category === 'malformed') {
        const denyMsg = gateAskDenyReason(labels)
        // 同时检查结构错误，合并为一条报错，一次性告知模型两个问题
        const kind = askKindOfRelaxed(labels) === 'approve' ? 'approve' : askKindOfRelaxed(labels) === 'purpose' ? 'purpose' : 'route'
        // kind 按特异性判定（复用 askKindOfRelaxed 语义）：批准特异词→approve；路由特异词或仅共享「不同意」→route
        const args = exec.arguments
        const questions = args !== undefined && args !== null && typeof args === 'object' ? args.questions : undefined
        const structErr = validateGateAskStructure(kind, questions)
        if (structErr !== null) {
          return `${denyMsg.replace(/请按标准模板重提$/, '')}同时，${structErr} 请一并修正后重提。`
        }
        return denyMsg
      }
      if (category === 'standard') {
        const kind = isExactGateSet(labels, ROUTE_GATE_SET) ? 'route' : isExactGateSet(labels, PURPOSE_GATE_SET) ? 'purpose' : 'approve'
        const args = exec.arguments
        const questions = args !== undefined && args !== null && typeof args === 'object' ? args.questions : undefined
        const structErr = validateGateAskStructure(kind, questions)
        if (structErr !== null) {
          if (kind === 'purpose' && !escape && state.route !== 'plan') return `${purposeRouteDenyReason()}同时，${structErr} 请一并修正后重提。`
          return structErr
        }
        if (kind === 'purpose' && !escape && state.route !== 'plan') return purposeRouteDenyReason()
      }
      // 'ordinary' → 放行；'standard' 结构校验通过 → 放行
    }
    return null
  }
  if (name === 'write' || name === 'edit') {
    if (!escape && state.route !== 'direct' && state.approved !== true) {
      return routeDenyReason('write/edit', state)
    }
    // 新增：approved 态下，主会话不得自己动手改工作区内文件
    if (!escape && state.approved === true && state.route !== 'direct') {
      return '方案已批准，执行请走 subagent 委派 flash 执行者（读方案/验收文件执行）。主会话直做仅限越界操作（工作区外写入，走 shell（Windows 用 pwsh、Linux/macOS 用 bash）+ sandbox_permissions）'
    }
    return null
  }
  // cordis（官方创造模式工具集，只读引用）：6 个只读/暂存工具任意路由状态放行
  // （inspect_* 只读；define 只存源码+语法校验不执行；stop/undefine 无对象可操作）；
  // cordis_run 是唯一执行口（模型 JS 求值+挂载临时插件，纯内存、会话级、重启即失）
  // ——与 write/edit 同规则：路由未确认拒绝，批准/直行放行。执行者/规划/验收/探查
  // 子代理侧由 agent.cordis.yml 的 toolFilter.deny 禁 cordis_run（其余 cordis 放行）。
  if (name === 'cordis_inspect_list' || name === 'cordis_inspect_query' || name === 'cordis_inspect_self' || name === 'cordis_define' || name === 'cordis_stop' || name === 'cordis_undefine') {
    return null
  }
  if (name === 'cordis_run') {
    if (!escape && state.route !== 'direct' && state.approved !== true) {
      return `路由未确认：cordis_run。cordis 只读/暂存工具（cordis_inspect_*、cordis_define、cordis_stop、cordis_undefine）可随时使用；cordis_run 会在会话内执行模型 JS 并挂载临时插件，${ROUTE_CONFIRM_TEXT}，用户批准后才可动手`
    }
    return null
  }
  const isPwshMutation = name === 'pwsh' && pwshMutationMatches(exec)
  const isBashMutation = name === 'bash' && bashMutationMatches(exec)
  if (isPwshMutation || isBashMutation) {
    const shellLabel = isBashMutation ? 'bash' : 'pwsh'
    if (!escape && state.route !== 'direct' && state.approved !== true) {
      return routeDenyReason(shellLabel, state)
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
      return planDenyReason('subagent_plan', state)
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
      return planDenyReason('save_probe', state)
    }
    return null
  }
  // T3：save_plan 主会话侧——仅直接执行（direct）路由放行落盘；其余路由态拒绝。
  // 必须显式分支：本函数兜底 return null 会让所有路由态被放行。内容闸门与规划
  // 子代理完全一致（同一 defineSavePlan 工厂）；规划子代理侧走 plannerGateReason
  // 兜底放行，不受本分支影响。
  if (name === 'save_plan') {
    if (!escape && state.route !== 'direct') {
      return `save_plan 仅允许在直接执行路由下落盘方案与验收；当前路由态：${state.route}`
    }
    return null
  }
  if (name === 'subagent' || name === 'subagent_fork' || name === 'workflow' || name === 'ralph' || name === 'subagent_review') {
    if (!escape && state.approved !== true) {
      return approvalDenyReason(name, state)
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
    return runCodeGroupDenyReason(state, exec, { kind: 'main' }, { events, planToolName, jobOutputCallCounters: ctx.jobOutputCallCounters, runcodeCatchGate: ctx.runcodeCatchGate, runCodeDepth: (typeof ctx.runCodeDepth === 'number' ? ctx.runCodeDepth : 0) + 1 })
  }
  if (name === 'job_output') return jobOutputGateReason(exec, ctx.jobOutputCallCounters)
  return null
}

// 组判定：run_code 拆解 → 逐成员走「与直呼完全相同的闸门」→ 聚合拒绝。
// state：主会话 flow state（role.kind==='main' 时必传；其它角色忽略）；缺省归一化为
// { route:'none', clarified:false, approved:false, purpose:'none', channelBroken:false }。
// role：{ kind:'main' } | { kind:'planner' } | { kind:'child', readOnly:boolean, probe:boolean }。
// gateCtx 缺省：{ events:[], planToolName:'subagent_plan', jobOutputCallCounters:new Map(),
// exploreBudget:18, runCodeDepth:0, runcodeCatchGate:false }。
// 多调用容错硬闸门：成员逐项判定之后、聚合之前执行 runCodeCatchGateReason（教学式文案）。
// 返回 null=放行；非 null=聚合拒绝文案。
function runCodeGroupDenyReason(state, exec, role, gateCtx) {
  const ctx = {
    events: [],
    planToolName: 'subagent_plan',
    jobOutputCallCounters: new Map(),
    exploreBudget: 18,
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
  ROUTE_WORD_DIRECT,
  ROUTE_WORD_PLAN,
  ROUTE_WORD_DISAGREE,
  APPROVAL_WORD_APPROVE,
  APPROVAL_WORD_REPLAN,
  PURPOSE_WORD_REFINE,
  PURPOSE_WORD_REDO,
  ROUTE_OPTIONS_TEXT,
  APPROVAL_OPTIONS_TEXT,
  PURPOSE_OPTIONS_TEXT,
  ROUTE_CONFIRM_TEXT,
  APPROVAL_CONFIRM_TEXT,
  PURPOSE_CONFIRM_TEXT,
  PURPOSE_GATE_SET,
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
  plannerGateReason,
  childReadonlyGateReason,
  mainGateReason,
  aggregateRunCodeDenyReason,
  jobOutputGateReason,
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
  readSchemasForRendering,
  renderMinimalReadText,
  toolPresentationModeOf,
  projectSkillCatalogDecision,
}

export const name = 'extra-plan'
export const inject = []

import { mkdirSync, readFileSync, writeFileSync, existsSync, appendFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createUserMessage } from '@deepseek-ai/dsh-llm'
import { PROBE_LIMITS, sanitizeTaskName, timestamp, renderSavePlan, renderSaveProbe, renderProbeMarkdown, extractProbeEvidenceRefs } from './lib/save-contract.js'
import { validateProbe } from './lib/save-probe-validation.js'
import { atomicCommit, recoverJournals } from './lib/save-persistence.js'
import { createSaveToolFactories } from './lib/save-tool-factories.js'
import { RUNCODE_MUTATION_HINTS, runCodeTextOf, codeMutationHints, createRunCodeStatic } from './lib/run-code-static.js'
import { sessionEvents, isSubagentChild } from './lib/agent-session.js'
import { createModelRouting, isExplicitRoute, isExplicitEffort, resolveAgentRouteSources, decidePlannerModelUse, PLANNER_PROBE_TIMEOUT_MS, PLANNER_BLOCKED_REASON, NON_PLANNER_BLOCKED_REASON, sortPlannerCandidates } from './lib/model-routing.js'
import { CORDIS_PRESENTATION_TOOLS, projectAssemblyForPresentation, renderFilteredToolsSdk, readSchemasForRendering, renderMinimalReadText, toolPresentationModeOf, toolRegistryOf, toolSdkSchemasOf, projectSkillCatalogDecision, PTC_SECTION_NAME, READ_SECTION_NAME, SDK_SECTION_NAME, sectionOf, hasSection, hasNonEmptySection } from './lib/assembly-presentation.js'

export { PROBE_LIMITS, extractProbeEvidenceRefs }

export function apply(ctx, config) {
  const cfg = config !== null && typeof config === 'object' ? config : {}
  const plannerModel = typeof cfg.plannerModel === 'string' ? cfg.plannerModel : 'deepseek-v4-pro'
  const otherAgentModel = typeof cfg.otherAgentModel === 'string' ? cfg.otherAgentModel.trim() : ''
  const planToolName = typeof cfg.planTool === 'string' ? cfg.planTool : 'subagent_plan'
  const exploreBudget = Number.isInteger(cfg.exploreBudget) && cfg.exploreBudget > 0 ? cfg.exploreBudget : 18
  const savePlanDir = typeof cfg.savePlanDir === 'string' && cfg.savePlanDir !== '' ? cfg.savePlanDir : '.extra-plan'
  const { defineSavePlan, defineSaveProbe } = createSaveToolFactories({
    savePlanDir,
    atomicCommit,
    recoverJournals,
  })
  const plannerPromptSuffix = typeof cfg.plannerPromptSuffix === 'string' ? cfg.plannerPromptSuffix : ''
  const bootstrapOn = cfg.anchoredBootstrap !== false
  const creativeModeOn = cfg.creativeMode === true
  const runcodeCatchGateOn = cfg.runcodeCatchGate === true
  const crossProviderPlannerModelOn = cfg.crossProviderPlannerModel === true
  const bootstrapPersona = typeof cfg.bootstrapPersona === 'string' ? cfg.bootstrapPersona : 'You are a helpful software engineer assistant.'
  const bootstrapShellTools = new Set(Array.isArray(cfg.bootstrapShellTools) ? cfg.bootstrapShellTools : ['bash', 'pwsh'])
  const bootstrapCommonTools = new Set(Array.isArray(cfg.bootstrapCommonTools) ? cfg.bootstrapCommonTools : ['read'])
  let bootstrapShellMissingWarned = false

  // usage 账本（写入带 (sessionId,seq) 去重，跨插件实例安全）
  const ledgerCfg = cfg.usageLedger !== null && typeof cfg.usageLedger === 'object' ? cfg.usageLedger : null
  const ledgerOn = ledgerCfg !== null && ledgerCfg.enabled === true
  const ledgerPath = ledgerCfg !== null && typeof ledgerCfg.path === 'string' ? ledgerCfg.path : ''
  const ledgerCursorPath = ledgerPath === '' ? '' : ledgerPath + '.cursor.json'
  let ledgerWarned = false
  const usageCursors = new Map()
  let usageCursorsLoaded = false
  // job_output 同轮防重复：内存计数器（Map<sessionId, Map<jobId, 1>>）
  // 替代 session.events 推导——tool/call 先落盘、后 pre-execute（宿主 agent-loop 先
  // appendToolCall 后 scheduler.prepare）；jobOutputCallCounters 内存计数器不依赖该时序。
  const jobOutputCallCounters = new Map()
  const jobOutputLastAnchors = new Map() // sessionId → 上次锚点索引
  const subCallCounters = new Map() // rootCallId → 已放行子调用数（单实例上限，planner 专属）
  const toolJobsNoticesConsumed = new Map() // sessionId → Set<jobId> 已处理过的 tool-jobs 完成通知的 jobId
  async function foldUsage(agent, role) {
    if (!ledgerOn || ledgerPath === '') return
    const session = agent.session
    if (session === undefined || session === null) return
    const events = sessionEvents(session)
    if (!Array.isArray(events)) return
    try {
      if (!usageCursorsLoaded) {
        usageCursorsLoaded = true
        try {
          const saved = JSON.parse(readFileSync(ledgerCursorPath, 'utf8'))
          if (saved !== null && typeof saved === 'object') {
            for (const key of Object.keys(saved)) {
              const v = saved[key]
              if (typeof v === 'number') usageCursors.set(key, { seq: v, index: 0, ref: null })
              else if (v !== null && typeof v === 'object' && typeof v.seq === 'number') usageCursors.set(key, { seq: v.seq, index: typeof v.index === 'number' ? v.index : 0, ref: null })
            }
          }
        } catch (error) { /* 首次运行无 cursor 文件 */ }
      }
      const sid = session.header.id
      const prev = usageCursors.get(sid)
      let cursor = 0
      let start = 0
      if (prev !== undefined) {
        cursor = typeof prev === 'number' ? prev : (typeof prev.seq === 'number' ? prev.seq : 0)
        if (typeof prev === 'object' && prev.ref === events && typeof prev.index === 'number' && prev.index >= 0 && prev.index <= events.length) start = prev.index
      }
      const rows = []
      for (let idx = start; idx < events.length; idx += 1) {
        const event = events[idx]
        if (event === null || typeof event !== 'object' || event.type !== 'assistant/message') continue
        const seq = typeof event.seq === 'number' ? event.seq : idx
        if (seq <= cursor) continue
        cursor = seq
        const data = event.data
        if (data === null || typeof data !== 'object') continue
        const usage = data.usage
        if (usage === null || typeof usage !== 'object') continue
        const hit = typeof usage.cacheReadTokens === 'number' ? usage.cacheReadTokens : 0
        const miss = typeof usage.inputTokens === 'number' ? usage.inputTokens : 0
        const out = typeof usage.outputTokens === 'number' ? usage.outputTokens : 0
        if (hit === 0 && miss === 0 && out === 0) continue
        const msg = data.message
        const model = msg !== null && typeof msg === 'object' && msg.source !== null && typeof msg.source === 'object' && typeof msg.source.model === 'string' ? msg.source.model : ''
        rows.push(JSON.stringify({
          ts: new Date().toISOString(),
          sessionId: sid,
          role,
          model,
          hit,
          miss,
          out,
          seq,
        }))
      }
      usageCursors.set(sid, { seq: cursor, index: events.length, ref: events })
      if (rows.length === 0) return
      const sepA = ledgerPath.lastIndexOf('\\')
      const sepB = ledgerPath.lastIndexOf('/')
      const dir = ledgerPath.slice(0, Math.max(sepA, sepB))
      if (dir !== '') mkdirSync(dir, { recursive: true })
      appendFileSync(ledgerPath, rows.join('\n') + '\n', 'utf8')
      const persisted = {}
      for (const [k, v] of usageCursors) {
        persisted[k] = v !== null && typeof v === 'object' ? { seq: v.seq, index: v.index } : v
      }
      try { writeFileSync(ledgerCursorPath, JSON.stringify(persisted), 'utf8') } catch (error) { /* cursor 持久化尽力而为 */ }
    } catch (error) {
      if (!ledgerWarned) {
        ledgerWarned = true
        console.warn(`extra-plan: usage ledger fold failed: ${error instanceof Error ? error.message : String(error)}`)
      }
    }
  }

  const sandboxPolicy = ctx.get('sandboxPolicy')
  const subagentAsPlannerWarned = new WeakSet()

  function isChild(agent) {
    if (!isSubagentChild(agent)) return false
    const child = isLiveDelegation(agent, ctx.get('agents'))
    if (!child && !subagentAsPlannerWarned.has(agent)) {
      subagentAsPlannerWarned.add(agent)
      console.warn(`extra-plan: subagent session "${agent.session.header.id}" is live without its parent agent — root gates apply (resumed-as-root or misclassification)`)
    }
    return child
  }

  // 规划子代理：子会话且 descriptor.mode === 'continuable'（tool-subagent-plan 行
  // backgroundMode: continuable 生成；'one-shot' = 执行者/验收复核者）。
  function isPlannerChild(agent) {
    if (!isSubagentChild(agent)) return false
    const session = agent.session
    if (session === undefined || session === null) return false
    const events = sessionEvents(session)
    if (!Array.isArray(events)) return false
    for (const event of events) {
      if (event !== null && typeof event === 'object' && event.type === 'subagent/descriptor'
          && event.data !== undefined && event.data !== null
          && typeof event.data.mode === 'string') {
        return event.data.mode === 'continuable'
      }
    }
    return false
  }

  // 真实工具集防御取数：agent/agent.ctx 缺失、ctx.get('tools') 非对象、schemas 非函数、
  // 调用抛异常 → 一律返回 undefined；否则返回 schemas(agent)（数组；非数组视为不可得）。
  // 不缓存：保证 restrict 后状态即时正确；schemas() 为同步投影，每步 assemble 调用成本可忽略。
  function toolSchemasOf(agent) {
    if (agent === undefined || agent === null) return undefined
    const agentCtx = agent.ctx
    if (agentCtx === undefined || agentCtx === null) return undefined
    let tools
    try {
      tools = typeof agentCtx.get === 'function' ? agentCtx.get('tools') : undefined
    } catch (error) {
      tools = undefined
    }
    if (tools === undefined || tools === null || typeof tools !== 'object') return undefined
    if (typeof tools.schemas !== 'function') return undefined
    try {
      const schemas = tools.schemas(agent)
      return Array.isArray(schemas) ? schemas : undefined
    } catch (error) {
      return undefined
    }
  }

  // ── planner / 非 planner 模型单点解析（工厂实例；缓存 per-apply） ──
  // 见 lib/model-routing.js：plannerModelCache / otherAgentModelCache 每次 apply 各新建一份
  // WeakMap（绝不提升为模块全局）；llm/agents/诊断路径按惰性 getter 取用。
  const { resolvePlannerEntry, resolveOtherAgentEntry } = createModelRouting({
    plannerModel,
    otherAgentModel,
    crossProviderPlannerModelOn,
    getLlm: () => ctx.get('llm'),
    getAgents: () => ctx.get('agents'),
    getDiagPath: () => diagPath,
  })

  // ── cordis 官方技能引用（runtime-skill 注册，零副本） ──
  // 从官方 agentPresets 服务 resolve('cordis') 拿 shipped 预设真实路径
  // （path=.../presets/cordis/agent.cordis.yml，目录=dirname(path)），读取官方
  // skills/ 下两个 SKILL.md 原文，把 name/description/content 注册为 runtime
  // skill 进本插件所在 standing 层（scopeOf(调用者 ctx)）——extra-plan 主会话
  // 经 tool-skill 的 list/get（scope=agent，链上合并 standing 层）可见、可 load。
  // 失败降级：任一环节异常仅 console.warn，不影响闸门与其余功能。
  const agentPresets = ctx.get('agentPresets')
  const skills = ctx.get('skills')
  // creativeMode=false 不注册两个官方创造模式 skill；skill 工具及其它用户 skill 不受影响。
  if (creativeModeOn && agentPresets !== undefined && skills !== undefined) {
    ctx.effect(() => {
      let dead = false
      const disposers = []
      agentPresets.resolve('cordis').then((preset) => {
        if (dead || preset === undefined || preset === null) return
        if (typeof preset.path !== 'string' || preset.path === '') return
        const skillsDir = join(dirname(preset.path), 'skills')
        for (const id of ['editing-cordis-compositions', 'cordis-plugin-development']) {
          const file = join(skillsDir, id, 'SKILL.md')
          if (!existsSync(file)) continue
          const text = readFileSync(file, 'utf8')
          const meta = parseSkillFrontmatter(text)
          if (meta.name === '' || meta.description === '') continue
          disposers.push(skills.register({
            name: meta.name,
            description: meta.description,
            source: file,
            path: file,
            content: text,
          }))
        }
      }).catch((error) => {
        console.warn(`extra-plan: 官方 cordis 技能引用失败（${error instanceof Error ? error.message : String(error)}）`)
      })
      return () => {
        dead = true
        for (const dispose of disposers) dispose()
      }
    })
  }

  // 提取 SKILL.md 头部 frontmatter 的 name/description（官方两文件仅这两个字段）。
  function parseSkillFrontmatter(text) {
    let name = ''
    let description = ''
    for (const line of text.split(/\r?\n/)) {
      if (name === '' && line.startsWith('name:')) name = line.slice('name:'.length).trim()
      else if (description === '' && line.startsWith('description:')) description = line.slice('description:'.length).trim()
      else if (name !== '' && description !== '') break
    }
    return { name, description }
  }

  function floorChildPolicy(agent) {
    if (childPolicyNeedsFloor(agent.session, sandboxPolicy)) {
      agent.session.append('sandbox/mode', { mode: 'workspace-write', source: 'delegation' })
    }
  }

  function childBaseline(agent) {
    const child = isChild(agent)
    const planner = isPlannerChild(agent)
    void foldUsage(agent, planner ? 'planner' : child ? 'executor' : 'main')
    if (child) floorChildPolicy(agent)
    return child
  }

  // save_plan/save_probe 的合同、校验、渲染与公共原子落盘由 lib 工厂提供；此处仅保留注册与生命周期接线。
  // 工具注册公共实现：WeakSet 去重 + tools 服务取用 + warn/error 文案模板 + try/catch。
  // 三个注册函数各自闭包持有各自 WeakSet 与工具名，跨工具幂等互不共享。
  function registerTool(registered, toolName, defineFn, agent) {
    if (registered.has(agent)) return
    registered.add(agent)
    const tools = agent.ctx !== undefined && agent.ctx !== null ? agent.ctx.get('tools') : undefined
    if (tools === undefined || typeof tools.register !== 'function') {
      console.warn('extra-plan: tools service unavailable — ' + toolName + ' not registered')
      return
    }
    try {
      tools.register(defineFn())
    } catch (error) {
      console.error('extra-plan: ' + toolName + ' registration failed: ' + (error instanceof Error ? error.message : String(error)))
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
  //    （T3：主会话仅 direct 路由放行，判定在 mainGateReason）；主会话与探查子代理
  //    注册 save_probe（scoped；recompose 不重发 session-start，pre-step 兜底）。
  ctx.on('agent/session-start', (payload) => {
    const agent = payload.agent
    if (agent === undefined) return
    selfAgent = agent
    childBaseline(agent)
    if (isPlannerChild(agent) || !isSubagentChild(agent)) registerSavePlan(agent)
    if (!isSubagentChild(agent) || probeClaimFor(agent)) { registerSaveProbe(agent) }
  })

  // 2) pre-step：账本补记（会话最终消息的行延迟到此）；规划子代理初始任务与
  // 续轮转达机械拼接 plannerPromptSuffix（「任务要求 + 空行 + 配置文本」——宿主
  // exec.arguments 与消息对象均 deepFreeze，拼接走 pre-step 消息替换通道，
  // 与 agent-instructions 基线注入同通道）。
  function shouldHideCreativeCatalog(agent) {
    if (!creativeModeOn || !bootstrapOn || !isBootstrapPhase(agent)) return false
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
    const budgetNotice = budgetNoticeText(exploreBudget)
    const used = toolCallsSinceUser(sessionEvents(selfAgent.session), FREE_TOOLS)
    const reminder = budgetReminderText(exploreBudget - used, exploreBudget, BUDGET_REMINDER_THRESHOLD)
    let messages = decision.messages.map((message) => withPlannerPromptSuffix(withBudgetNotice(message, budgetNotice), plannerPromptSuffix))
    if (reminder !== '' && !budgetReminderSent(sessionEvents(selfAgent.session), '本轮探查预算还剩 ')) {
      messages = [...messages, budgetReminderMessage(reminder)]
    }
    return { ...decision, messages }
  })

  // 2.5) 模型请求失败诊断（v0.1.2）：把 failure 的完整 cause 链逐行写进诊断文件，
  // 用于定位"save_plan 后请求流中断"的真实底层错误（TRANSPORT 只是包装码）。
  // 只记录、不干预：waterfall 返回值原样透传（llm-retry 的 {kind:'retry'} 不受影响）。
  const __dirname = dirname(fileURLToPath(import.meta.url))
  const diagPath = typeof cfg.diagFile === 'string' && cfg.diagFile !== '' ? cfg.diagFile : join(__dirname, 'extra-plan-request-errors.jsonl')
  let diagWarned = false
  function causeChainOf(error, depth) {
    const chain = []
    let current = error
    for (let i = 0; i < depth && current !== undefined && current !== null; i += 1) {
      chain.push({
        name: typeof current.name === 'string' ? current.name : '',
        message: typeof current.message === 'string' ? current.message.slice(0, 400) : '',
        ...(current.code !== undefined ? { code: String(current.code) } : {}),
      })
      current = current.cause
    }
    return chain
  }
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
    try {
      return await next()
    } finally {
      recordRequestError(payload)
    }
  })

  ctx.on('agent/disposed', (payload) => {
    const sessionId = payload.agent?.session?.header?.id
    if (typeof sessionId === 'string') {
      const pending = pendingProbeClaims.get(sessionId)
      if (Number.isInteger(pending) && pending > 0) {
        const warning = probeDisposalWarning(pending)
        if (warning !== null) console.warn(warning)
      }
      pendingProbeClaims.delete(sessionId)
    }
  })

  // 3) anchored 引导（默认开）：主会话与规划子代理首轮极简；执行者/reviewer 不引导。
  //    native/both 首轮保留 bootstrap shell(s)+read，sections 仅 persona；Pure PTC
  //    首轮保留唯一 run_code、persona、tools:ptc-only 与 tool:read 最小契约，不生成完整 SDK。
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
    const anchoredFirst = bootstrapOn && phase === 'first' && (role === 'main' || role === 'planner')
    const anchoredPtc = anchoredFirst && mode === 'ptc'
    let presented = result
    if (anchoredPtc) {
      // HP0/HP1：PTC 首轮只保留传输、persona 与 read 最小契约；不先生成完整 SDK。
      presented = projectAssemblyForPresentation(result, schemas, {
        hideCordis: !creativeModeOn,
        ptcOnly: true,
        keepSectionNames: new Set([PTC_SECTION_NAME, READ_SECTION_NAME]),
      })
    } else if (!creativeModeOn) {
      let sdkText
      if (hasSection(result.sections, SDK_SECTION_NAME)) {
        let language = 'typescript'
        try {
          const runtime = typeof ctx.get === 'function' ? ctx.get('codeRuntime') : undefined
          if (runtime !== undefined && runtime !== null && typeof runtime.language === 'string') language = runtime.language
        } catch (error) { /* 缺少 codeRuntime 时按测试/兼容默认使用 TypeScript renderer */ }
        try {
          const sdkSchemas = toolSdkSchemasOf(agent)
          sdkText = await renderFilteredToolsSdk(sdkSchemas === undefined ? schemas : sdkSchemas, language)
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
      let language = 'typescript'
      try {
        const runtime = typeof ctx.get === 'function' ? ctx.get('codeRuntime') : undefined
        if (runtime !== undefined && runtime !== null && typeof runtime.language === 'string') language = runtime.language
      } catch (error) { /* 缺少 codeRuntime 时按测试/兼容默认使用 TypeScript renderer */ }
      const sdkSchemas = toolSdkSchemasOf(agent)
      const readText = await renderMinimalReadText(result.sections, sdkSchemas === undefined ? schemas : sdkSchemas, language)
      const ptcSection = sectionOf(presented.sections, PTC_SECTION_NAME)
      const readSection = sectionOf(presented.sections, READ_SECTION_NAME)
      const sections = [
        { name: 'extra-plan-bootstrap', text: bootstrapPersona },
        ...(ptcSection === undefined ? [{ name: PTC_SECTION_NAME, text: '' }] : [{ ...ptcSection }]),
        ...(readSection === undefined ? [{ name: READ_SECTION_NAME, text: readText }] : [{ ...readSection, text: readText }]),
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

  // 5) 硬闸门（tools/pre-execute）：规划子代理只读 + 探查硬上限；主会话四级锚点。
  ctx.on('tools/pre-execute', (exec, next) => {
    if (exec.agent === undefined) return next()
    const agent = exec.agent
    // job_output 计数器锚点重置：新用户消息或 send_message 续轮转达时清空该 session 的计数器
    {
      const sessId = agent.session.header.id
      const events = sessionEvents(agent.session)
      let currentAnchor = -1
      for (let i = events.length - 1; i >= 0; i -= 1) {
        const e = events[i]
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
        jobOutputCallCounters.delete(sessId)
        toolJobsNoticesConsumed.delete(sessId)
        subCallCounters.clear()
        jobOutputLastAnchors.set(sessId, currentAnchor)
      }
    }
    // tool-jobs 完成通知解锁扫描：匹配 source.kind==='plugin' && source.plugin==='tool-jobs' && source.form==='notice'
    // 从正文用 /background job (\S+)/ 解析 jobId；若存在于本 session 的 jobOutputCallCounters 中则删除该
    // jobId 计数（只清这一个，不清整表、不动 subCallCounters）；解析失败或未跟踪 → 无操作（保守不放行）。
    {
      const sessId = agent.session.header.id
      const scanEvents = sessionEvents(agent.session)
      const consumed = toolJobsNoticesConsumed.get(sessId)
      for (const se of scanEvents) {
        if (se === null || typeof se !== 'object' || se.type !== 'user/message') continue
        const sd = se.data
        if (sd === null || typeof sd !== 'object' || sd.source === null || typeof sd.source !== 'object') continue
        const src = sd.source
        if (src.kind !== 'plugin' || src.plugin !== 'tool-jobs' || src.form !== 'notice') continue
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
    const child = childBaseline(agent)
    const planner = isPlannerChild(agent)
    // 探查者委派属只读探查能力（与 read/glob/grep 同级）：主会话在任意路由状态放行，
    // 仅强制 one-shot 固定后台（与 subagent/subagent_review 同机械闸门口径）。
    // 置于 planner/child 判定之前，但闸门函数内首先按角色拒绝 planner（T5）：
    // subagent_probe 仅主会话可委派；放行时挂「待认领计数」供 probe 子会话
    // session-start 认领（否则 probe 子会话经 parentSession 无放行痕迹）。
    if (exec.name === 'subagent_probe') {
      const reason = subagentProbeGateReason(exec, planner)
      if (reason !== null) return { kind: 'deny', reason }
      if (planner && isRunCodeSubCall(exec)) {
        const rid = typeof exec.rootCallId === 'string' ? exec.rootCallId : ''
        const passed = rid === '' ? 0 : (subCallCounters.get(rid) || 0)
        if (rid === '' || passed >= exploreBudget) return { kind: 'deny', reason: runCodeDispatchCapText(rid === '' ? '?' : rid, passed + 1, exploreBudget) }
        subCallCounters.set(rid, passed + 1)
      }
      const parentId = agent.session.header.id
      pendingProbeClaims.set(parentId, (pendingProbeClaims.get(parentId) || 0) + 1)
      return next()
    }
    if (planner) {
      const plannerEvents = sessionEvents(agent.session)
      let reason = plannerGateReason(exec, plannerEvents, exploreBudget)
      // 预算耗尽时 run_code 不在此直拒：plannerGateReason 对 run_code 仅可能因预算耗尽返回非 null
      // （run_code 非 write/edit/pwsh/bash/job_output），置 null 让预算判定进入组判定——组判定内按白名单把关：
      // 成员组非空且全部 ∈ FREE_TOOLS 才放行；含非白名单成员或空组/动态访问 → 拒绝（动态拼接文案）。
      if (exec.name === 'run_code' && reason !== null) reason = null
      if (reason !== null) return { kind: 'deny', reason }
      if (exec.name === 'run_code') {
        const runReason = runCodeGroupDenyReason(undefined, exec, { kind: 'planner' }, { events: plannerEvents, exploreBudget, jobOutputCallCounters, runcodeCatchGate: runcodeCatchGateOn })
        if (runReason !== null) return { kind: 'deny', reason: runReason }
      }
      if (exec.name === 'job_output') {
        const jobReason = jobOutputGateReason(exec, jobOutputCallCounters)
        if (jobReason !== null) return { kind: 'deny', reason: jobReason }
        const args = exec.arguments
        const jobId = args !== undefined && args !== null && typeof args === 'object' ? args.job_id : undefined
        if (typeof jobId === 'string') {
          const sessId = agent.session.header.id
          let perSession = jobOutputCallCounters.get(sessId)
          if (perSession === undefined) { perSession = new Map(); jobOutputCallCounters.set(sessId, perSession) }
          perSession.set(jobId, 1)
        }
      }
      if (planner && isRunCodeSubCall(exec)) {
        const rid = typeof exec.rootCallId === 'string' ? exec.rootCallId : ''
        const passed = rid === '' ? 0 : (subCallCounters.get(rid) || 0)
        if (rid === '' || passed >= exploreBudget) return { kind: 'deny', reason: runCodeDispatchCapText(rid === '' ? '?' : rid, passed + 1, exploreBudget) }
        subCallCounters.set(rid, passed + 1)
      }
      return next()
    }
    if (child) {
      // 只读子代理（reviewer/probe，真实工具集判定命中缓存）：write/edit 与 pwsh/bash 写命令
      // 一律拒绝；文案按 save_probe 信号区分（probe 走「探查者只读」，reviewer 文案逐字保持）。
      // 注：此段到达时 planner 必已 return（planner 段在前），`!planner` 条件可省略（保留原状）。
      if (!planner && readOnlyChildren.has(agent)) {
        const probe = schemasHasTool(toolSchemasOf(agent), 'save_probe')
        const reason = childReadonlyGateReason(exec, probe)
        if (reason !== null) return { kind: 'deny', reason }
        if (exec.name === 'run_code') {
          const runReason = runCodeGroupDenyReason(undefined, exec, { kind: 'child', readOnly: true, probe }, { jobOutputCallCounters, runcodeCatchGate: runcodeCatchGateOn })
          if (runReason !== null) return { kind: 'deny', reason: runReason }
        }
        if (exec.name === 'job_output') {
          const jobReason = jobOutputGateReason(exec, jobOutputCallCounters)
          if (jobReason !== null) return { kind: 'deny', reason: jobReason }
          const args = exec.arguments
          const jobId = args !== undefined && args !== null && typeof args === 'object' ? args.job_id : undefined
          if (typeof jobId === 'string') {
            const sessId = agent.session.header.id
            let perSession = jobOutputCallCounters.get(sessId)
            if (perSession === undefined) { perSession = new Map(); jobOutputCallCounters.set(sessId, perSession) }
            perSession.set(jobId, 1)
          }
        }
      }
      return next() // 执行者子代理豁免（目录含 write/edit，缓存未命中）
    }

    const events = sessionEvents(agent.session)
    const state = deriveFlowState(events)
    const reason = mainGateReason(state, exec, { events, planToolName, jobOutputCallCounters, runcodeCatchGate: runcodeCatchGateOn, runCodeDepth: 0 })
    if (reason !== null) return { kind: 'deny', reason }
    // 放行副作用：job_output 计数器记录（自 apply 内提取的 set 部分，仅在放行时执行，时序等价）
    if (exec.name === 'job_output') {
      const args = exec.arguments
      const jobId = args !== undefined && args !== null && typeof args === 'object' ? args.job_id : undefined
      if (typeof jobId === 'string') {
        const sessId = agent.session.header.id
        let perSession = jobOutputCallCounters.get(sessId)
        if (perSession === undefined) { perSession = new Map(); jobOutputCallCounters.set(sessId, perSession) }
        perSession.set(jobId, 1)
      }
    }
    return next()
  })
}
