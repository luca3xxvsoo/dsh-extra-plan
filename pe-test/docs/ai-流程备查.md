# 完整流程（实际机制校订版）

> 本节按 index.js 头部版本行 (v0.3.0) 及其「宿主事实依赖清单 / 行为：」注释块与 agent.cordis.yml 校订（首次校订 2026-09-05，最近同步 2026-09-25：适配 dsh 0.1.7-rc.1 / 0.1.7-rc.2），为运行时真实流程。
> **以 persona 为准**（用户 2026-09-12 确认）：persona 中「主会话探查/探查者探查二选一」是**现行口径**——复杂度评估完成后必弹该 ask，选项固定、推荐排第一；第 ⑤ 节的三条判据只用于**决定推荐哪一项**，不用于自动决策（本节已按此对齐）。
> 机制细节权威来源：index.js 头部行为注释 + agent.cordis.yml 各 tool-subagent 行；函数定位用 ai-代码地图.md。
> save 工具拆分边界：`plugins/dsh-extra-plan/lib/save-contract.js` 维护命名、限制与 ContentBlock 渲染合同，`lib/save-probe-validation.js` 负责校验，`lib/save-persistence.js` 负责阶段感知原子落盘与 journal 自愈（pre-journal 条件清理：先删 journal 并确认不存在才清 tmp；post-journal 保留 journal 与现场；全部目标确认就位后才删 journal；恢复逐项确认目标存在、全项就位才清 journal），`lib/save-tool-factories.js` 负责 save_plan/save_probe 定义；根 `plugins/dsh-extra-plan/index.js` 仅创建工厂、注册工具并接入生命周期/闸门。
> 注册与兜底口径：注册成功后写「已注册」标记（WeakSet 按 agent 自去重）；分类 A（重名）与分类 B（永久性定义期错误）也写标记、记终态不再重试；只有服务未就绪与分类 C（可重试）不写标记，由后续 pre-step 重试。**0.1.7 起会话启动钩子由 `agent/session-start` 换为 `agent/created`**（前者已删；后者是 **serial**：监听器被宿主 await，抛错即会话创建失败，故启动块整体 try/catch 吞错只留 warn），每会话只发一次且 recompose 不重发，故 pre-step 每步的幂等兜底是第二通道（注册发生在 `await next()` 之前，与 decision.kind 无关）。pre-step 中注册的工具只进下一步 assembly（宿主先 assemble 快照、后派发 pre-step）。

## 1. 完整流程

① 用户以按需规划模式进入（会话预设「按需规划模式」）

② A/C/M 展示时序（默认 A=1、C=0；M=native|ptc|both）：F 精确表示 session 尚无任何 tool/call，首个 tool/call 落盘后为 L。A=1/F/main-planner 的 native/both 是 HN/HB：顶层保留 bootstrap shell(s)+read，sections 仅 extra-plan-bootstrap，不加 tool:read；PTC 是 HP：顶层精确为 [run_code]，sections 精确为 extra-plan-bootstrap、tool:read 两项（宿主 tools:ptc-only 段已按用户要求停用、不再透传），其中 tool:read 的文本由插件手写（cfg.bootstrapReadHint，空串/非字符串回退内置中文兜底；借宿主段名只改模型可见副本），不含完整 tools:sdk/Cordis，也不再调用官方 renderer。A=1 的 L 和 A=0 从 N/P/B 基线开始，执行者/验收者/探查者不走 anchored 首轮。C=0 时所有角色、F/L 隐藏 2 个 Cordis 展示项及**三个**创造 skill（cordis-plugin-development / editing-cordis-compositions / cordis-composition-reference，由预设 `skill-filesystem` 行 `config.customSkillDirs` 静态注册）catalog；C=1 恢复完整 SDK/Cordis/三个创造 skill，唯一 HP1（F/main-planner）暂隐 catalog。`tool:cordis` 段在 0.1.7 宿主侧已删（常数保留、恒空转）。所有变化只改变模型可见面，不是 PTC runtime binding 安全隔离；既有 registry namespace、deny 与 pre-execute 仍按原逻辑执行。

### 1.1 PTC 实机专项
- C=0 与 C=1 各开一条干净的 A=1/M=ptc 顶层会话：任何 tool/call 前记录 F header；完成首个顶层 run_code 后在同一会话记录 L，再发第二调用确认仍为 L。
- F 只由会话是否已有 tool/call 判定，旧会话不得冒充 F；native/both HN/HB 回归单独编排，旧会话仅可提供 L 证据。

③ 用户提出需求

④ 只读探查理解任务：收到需求后先用只读探查（read/glob/grep/web_search、shell 只读命令（Windows 用 pwsh、Linux/macOS 用 bash））理解任务。只读工具不受路由限制可随时用；路由前的 ordinary 探查/澄清 ask 也继续允许，不得误拦。仅探查任务可直接探查展示。定位优先查 pe-test/docs/ai-代码地图.md（见 ai-维护手册.md）。

⑤ 探查方式二选一（**必问 ask**，persona 口径）：复杂度评估完成后用 ask_user_question 弹一次二选一——选项固定为「主会话探查」「探查者探查」，把自己的推荐排第一，用户选谁就走谁。下列三条判据**只用于形成推荐**（不再用于自动决策；委派有一次往返与落盘成本）：
   - ① 并行收益：探查点可拆成 ≥2 个互不依赖的子任务
   - ② 上下文隔离收益：探查对象单次 read 读不完（约 >1000 行 / 64KB），或回传文本会显著挤占主会话上下文
   - ③ 方向侦察收益：探查方向未定，需要先扫一遍地图（结构/关键位置）再决策
   - 选「主会话探查」→ 主会话自己 read/glob/grep（三条判据都不满足时这也正是推荐项，最省）；选「探查者探查」→ 用 subagent_probe 委派探查者（**委派权仅主会话**）——任意状态可用、无需路由确认、固定后台；≥2 个互不依赖方向时优先并行多派
   - 探查者（one-shot 后台，必须显式传 run_in_background: true）：只读探查、save_probe 落盘【含证据报告】（路径+行号+数值+文案照实写）、回主会话只给路径+2-3 行摘要
   - save_probe 只在主会话与探查者层注册（规划子代理/执行者/验收者不可见）
   - 规划子代理**不得**委派探查者（探查者**仅主会话可委派**；planner 行 toolFilter.deny 已含 subagent_probe 使其在**工具目录层不可见**，闸门 subagentProbeGateReason 同时拒绝 planner，构成**双层禁止**）；执行者/验收者/探查者自身同样禁止（防递归）
   - save_plan 检测适配：方案中【探查者已核实】步骤须注明证据文件路径（探查者落盘），插件校验文件存在且为证据报告

⑥ 预估任务复杂度 → 推荐路径：基于探查结果预估（涉及对象数/代码行数/信息完整度）：简单明确 → 推荐直接执行；复杂/多文件/需方案 → 推荐进行pro规划；需求不明确 → 先澄清

⑦ 路由确认（主会话流程首问、每次流程重开/动手前必问，硬闸门）：用 ask_user_question 弹**一次两问**——第一问三选一，**选项取现场 `agent.cordis.yml` 的 `config.gateWords`**（routeDirect/routePlan/routeDisagree；括号内为出厂示例：「直接执行」「进行pro规划」「不同意」——文档里的词值一律只是出厂示例，不是运行时第二真源）（把自己的判断——含复杂度评估与是否已用探查者——排第一）；第二问为纯文本「补充要求」（id=supplement，可留空、不得提供 options）——标准 persona 流程固定发这两问，机械层为「至少两问」（第 2 问起全部须为纯文本且不得带非空 options）。固定顺序为 route→purpose→普通澄清；任何 route 状态都可重新发起该路由 ask（重发同样须为两问同形）。
   - **未确认语义**：空白答复（answers:[]）/取消/中断/验词失败一律视为未确认；仅通道级故障码（NO_PROVIDER/CALLER_NOT_LIVE/DELEGATED_CALLER）白名单逃生（防死锁）
   - **ask 失败流转分支（2026-09-23 细分）**：闸门拒绝（插件中文拒绝文案，`kind:'denied'`）**不重置** route/purpose/clarified/approved——结构错误被拒后按文案改好重提即可放行，不再出现「合规重提仍被拒」死循环；用户取消/中断（native ASK_CANCELLED、嵌套宿主取消句）仍清四字段回 ⑦ 重新路由确认；通道码只置 channelBroken 逃生。PTC 下拒绝的呈现由 tools/post-execute 改写为「Error: 中文 reason」（台账 HK25）
   - route 的直行词（出厂示例「直接执行」）→ 直接执行路径：主会话亲自用全套工具动手，完工前对照需求逐项自查，简短汇报（≤10 行）；direct 态放行主会话 write/edit 与 shell 写命令；**执行类委派只认批准锚点**——approved===true 才放行（subagent / subagent_fork / workflow / ralph / subagent_review；route 不参与判定），直行态通常 approved 未置位故委派被拒，但用户若在直行态确认过批准 ask（点出厂示例「同意执行」）委派同样放行（**设计如此**：支撑「用户自备方案 → 主会话确认 → 派执行者」这条快捷路径）；subagent_plan 另按 route=plan + 澄清前置拒绝（直行态文案「直行态下不可规划」，index.js:918-920）；仅允许只读探查子代理（subagent_probe）任意路由态可派；简单任务不要绕道规划，中等任务规划后执行
   - route 的规划词（出厂示例「进行pro规划」）→ 进入 ⑧-⑫
   - route 的否决词（出厂示例「不同意」）→ 不动作、对话询问
   - 执行类委派只认批准锚点（approved）；路由锚点只约束 subagent_plan / save_probe 与主会话写工具；send_message 完全放行（目标合法性由宿主校验，续轮转达语义不变）

⑧-1 目的确认（第四锚点）：选 route 的规划词（出厂示例「进行pro规划」）后**第一个** ask 必须是目的 ask——**另发一次独立的 ask_user_question**，恰好 1 个问题、选项仅有当前 `config.gateWords` 的 purposeRefine/purposeRedo（出厂示例「完善方案」「重新规划」）。机械层仅对首问选项精确等于该二选一的 purpose ask 做顺序闸门：route=none/direct 时拒绝，原因必须包含**由当前 `config.gateWords` 拼出的路由确认句**（恒为「须先 ask_user_question 路由确认（选项固定为<当前三词>）」，出厂值下逐字为「须先 ask_user_question 路由确认（选项固定为「直接执行」「进行pro规划」「不同意」）」）；route=plan 时放行；channelBroken=true 维持逃生放行。目的未定则 save_probe 与 subagent_plan 一律教学式拒绝，不拦 ordinary 澄清 ask；目的未定时澄清答复只提供信息、不置 clarified。
⑧-2 澄清意图：目的确认答复后，**再另发一次独立的 ask_user_question** 澄清最关键的 1~3 个问题（给候选选项）；与路由确认或目的确认合并进同一次提问将触发闸门（路由 ask 机械层须**至少 2 个问题**——第一问固定三选一、第 2 问起全部为纯文本且不得带非空 options（标准流程即「补充要求」这一问）；目的 ask 须**恰好 1 个问题**）。**澄清选项不得包含当前 `config.gateWords` 目的词（出厂示例「完善方案」「重新规划」）的任何子串**——否则整条 ask 被判 purpose/malformed 拒绝；机械层既有三分法判定的自然后果，不新增规则。clarified 置位前提：route=plan 且 purpose∈{当前 purposeRefine, 当前 purposeRedo}；route 重选前清 purpose/clarified/approved；有效目的重选前清 clarified/approved；非通道取消/中断清 route/purpose/clarified/approved；CHANNEL_BROKEN_CODES 逃生只置 channelBroken 并保留旧阶段状态；最近一条 user/message 仍切断旧事件窗并回五字段默认态。

⑨ 探查线索落盘（save_probe）：主会话把本轮只读探查留下的「线索地图」经 save_probe 落盘为 `.extra-plan` 下**单个文件** `线索-<任务名>-<时间戳>.md`（按工具要求填四字段），拿到返回的线索文件路径。任务名为空或非 string 时 sanitizeTaskName（save-contract.js L4-11）返回空串 → save_probe 自建 base（save-tool-factories.js L174-176：`const nameSeg = sanitizeTaskName(args.taskName); const ts = timestamp(); const base = (nameSeg === '' ? '' : nameSeg + '-') + ts`，不含 sessionTag）→ 文件名退化为 `线索-<时间戳>.md`（无占位字样）；save-contract.js L31-34 的 savePlanBase（含 sessionTag）只用于 save_plan 双文件。
   - 只含四类定位线索：文件地图（fileMap）/ 重点区域（focusAreas）/ 排除项（exclusions）/ 背景与意图（background），**不含证据**（行号/数值/文案摘录）
   - plan 态下 save_probe 与 subagent_plan **同条件放行**（目的已定 + 澄清完成后；澄清完成＝目的已定后的澄清答复置位 clarified）

⑨-1 **save_probe 限制口径**：当前 `PROBE_LIMITS.maxEvidenceEntries=150`、`maxEvidenceTextLen=1000`；step-00 PR23=151 条拒绝（用 `PROBE_LIMITS.maxEvidenceEntries + 1` 动态构造），PR34/PR35 用 `PROBE_LIMITS.maxEvidenceTextLen` 与加一覆盖 `evidence.text` 1000 通过、1001 拒绝；save_probe 描述/schema 随常量动态生成。`exploreBudget=18` 仍是 planner 探查预算/单实例子调用上限，不是 PROBE_LIMITS；台账历史 80 条、80+79+50=209 仍是归档统计。

⑩ 启用 pro 规划子代理（subagent_plan 工具，continuable 固定后台）：
   - 委派 prompt 自包含（目标、范围、相关文件、产出要求）并带上用户目的选择（当前 purposeRefine/purposeRedo，出厂示例「完善方案/重新规划」）与线索文件路径，说明「先 read 该线索文件、再按需补查」，避免重复探查
   - **探查硬上限**（默认 18 次，计数含 save_plan）：每轮开局告知预算；剩余 ≤3 次注入一次「还剩 N 次」提醒（预算值 ≤3 时不注入；每轮只注入一次）；预算耗尽 → 拒绝后续工具调用并注入带数字收敛指令。预算自最近一条主会话发往子代理的消息起计：初始任务/续轮转达（kind=user/agent-message）= 一次重置 = 授权继续；运行时快照（kind=plugin）不重置
   - 预算紧张（剩 ≤3）时优先申请继续探查，由主会话委派探查者一次性换取信息
   - **run_code 多调用容错硬闸门**：主会话/planner/只读子代理（probe/reviewer）用 run_code 批量调用时，≥2 个 tools.* 调用必须给每个调用点各写一个独立 try/catch——一次只包 1 个调用、块后紧跟 catch（否则组判定拒绝，教学式文案含「已保护 M 个」；执行者子代理豁免=既有架构）；job_output 全角色禁 wait:true——等完成通知唤醒续轮，勿前台等待
   - **runcodeCatchGate 开关退避**：run_code 容错检查教学文案可经设置页开启（默认 false）；开启后多调用无独立容错才被拦截（仅影响本检查）
   - **预算容器计费与单实例上限**：planner 预算按容器计（run_code 计 1 次、子调用不计）；单 run_code 实例子调用 ≤ exploreBudget（默认 18），超限运行时拒绝（循环放大同样被拒）
   - **探查者委派（背景）**：one-shot 探查者 owner=委派者，此前 planner 派出的探查者会因 planner 轮次结束被宿主级联取消（owner disposed）——已改为**禁止 planner 委派探查者**（planner 只能 read/glob/grep 自查 + 申请继续探查）；已知引擎限制见 ai-机制设计.md 教训索引「探查者级联中止」
   - **预算耗尽 → 往返**：子代理输出「申请继续探查：<待查项> — <原因>」；主会话原样展示并弹 ask（选项「继续探查」「取消规划」）确认；用户确认继续后，主会话自己探查或委派探查者批量探查（**委派探查者只由主会话执行**）→ save_probe 落盘新线索 → send_message 把线索路径转达 → 预算重置继续；探查完成后子代理直接调用 save_plan 落盘
   - **产出格式**：规划方案（目标、步骤分解：每步做什么/涉及文件/关键命令、风险与回滚；已探查核实的步骤标【已探查核实】，步骤正文保留精确定位信息）；验收标准清单（每条带对应任务编号，形如「[任务N] 文件路径 + 期望值/行号/数值/文案 + 禁止项」，保持机械精确）——**路径/行号/数值/文案照实写，不得编造、不得概括**
   - **证据引用**：来自探查者【含证据报告】的可标【探查者已核实】并注明「证据来源：<文件路径>」（插件校验文件存在且为证据报告）
   - 用户可随时中断：说「取消规划」或改选直行 → 主会话 interrupt_agent 停止子代理当前轮次（interrupt 仅停轮、不销毁会话，子代理仍存续、可随时唤醒）；非通道取消同时清 route/purpose/clarified/approved，回到 ⑦ 重新路由确认后再动手；通道级故障仍保留 channelBroken 逃生与旧状态。

⑩-1 **planner 与非 planner 首请求时序屏障（crossProviderPlannerModel）**：child/session 的创建、agent/created、childId 与等待可以先发生，但都不算模型执行。planner 仍只解析 plannerModel；executor、reviewer、probe、workflow worker、ralph worker 等非 planner child 解析 otherAgentModel。非 planner 先按直接父比较显式 agentOptions.provider/model，显式 route 直接保留；未显式时 fallback 来源统一为顶层主会话，不被 planner 父模型污染。True 路径中 agent/request listener 必须先 await 上游 next()，再等待全部匹配 provider 的真实 OK probe 完整结束并完成排序——候选探测为**有界并发池**（写死常量 PLANNER_PROBE_CONCURRENCY=5，去重后的候选按序启动、超出排队、每候选各自 30s deadline 与独立 AbortController，全部结束后才按发起顺序回填并排序，结果与串行逐项一致）；tools/pre-execute 钩子内只取一次 sessionEvents 快照（execEvents）供锚点扫描/tool-jobs 通知/childBaseline/isPlannerChild/两处闸门复用，不再各自取快照（本批只做代码整理，不减少每趟扫描次数）；若没有成功候选，再等待已验证的顶层主会话 provider/model fallback；只有这些步骤完成后才返回 final LlmCallConfig，随后 DSH 才允许 prepareCall，再进入 stream。任何候选与 fallback 都失败时 listener 在实际 child prepareCall/stream 前 reject；planner 使用原固定错误，非 planner 使用固定非 planner 阻断。False、缺失、非法值的非 planner 只查主会话 provider 的 advisory listModels，不做真实 probe；planner 旧流程保持不变。

⑩-2 **step-07 实机模型/引导取证（A42/A43、C11/C12，HUMAN）**：用户必须在同一部署配置快照下显式提供 `SESSION_ID`（顶层主会话 ID）与 `PLANNER_PROMPT_SUFFIX`（空串也必须显式存在），运行 `node pe-test/tools/step-07-子代理模型与引导取证.mjs`；脚本只读两代日志，按 parentSession/origin/delegationDepth/descriptor.mode 与父 `subagent_plan` call/result 关联 child，只区分 pro规划/非pro规划。request/header.config.provider/model、request/context、model/selection 只记 attempted route；assistant/message.source.provider/model 才记 actual provenance。仅 pro规划 child 的首个 text block参与 suffix 精确匹配，完整输出所有 text block，budgetNotice、宿主 `Your parent agent id is …` guidance、header.system 分列且不计 suffix；等级按 verified-injection/content-only/attempted-only/absent/no-log，不能用 mock、候选 probe 或模型猜角色代替实机结论。内存与扫描面：脚本先只用 `headerOfDir` 有界分块读头信息筛出直接 child，再只对命中目录解析事件（不再保留 raw 行），共用 `session-finder.mjs` 首行读改分块渐读——输出逐字节与优化前一致，但不加堆参数默认堆即可跑通。

⑪ 计划回传 → 主会话读取方案文件与验收文件（用 read 工具读取展示）、把内容**原样展示给用户（不要改写、不要润色）**，并 ask 确认下一步操作。路由确认 ask 标准流程固定发 2 个问题（机械层接受至少 2 个）——第一问为三选一（**取当前 `config.gateWords` 三词**；出厂示例「直接执行」「进行pro规划」「不同意」），第二个问题为纯文本「补充要求」（可留空），不得提供 options（机械层会拒绝：「路由 ask 结构错误：须至少 2 个问题（第一个为路由选项固定为<当前三词>，第二个为补充要求可空），当前 N 个问题」；或「路由 ask 结构错误：第 N 个问题（补充要求）必须为纯文本输入，不得提供选项（预设选项不符合用户想法），当前带 M 个选项。请改为纯文本大文本框、去掉 options」）；批准 ask 标准流程固定发 2 个问题（机械层同样接受至少 2 个）——第一问选项取当前 `config.gateWords` 的 approvalApprove/approvalReplan/routeDisagree（出厂示例「同意执行」「转交pro规划」「不同意」），第二个问题为纯文本「修改意见」（可留空），不得提供 options（机械层会拒绝：「批准 ask 结构错误：第 N 个问题（修改意见）必须为纯文本输入，不得提供选项（预设选项不符合用户想法），当前带 M 个选项。请改为纯文本大文本框、去掉 options」）：
   - 批准词（出厂示例「同意执行」）→ 进入 ⑫
   - 转规划词（出厂示例「转交pro规划」）→ 重新规划（批准后回炉，区别于目的闸门二选一中的目的词）
   - 否决词（出厂示例「不同意」）→ 回到 ⑦

⑫ 执行（方案批准后）：
   - 创建执行子代理（subagent，one-shot 后台，必须显式传 run_in_background: true）执行
   - 执行者 route 解析时机：任何 child 的首请求都在 agent/request 内完成「全部候选真实 OK probe（有界并发池，上限 PLANNER_PROBE_CONCURRENCY=5，每候选各自 30s deadline 与独立 AbortController）→ 全部结束后按发起顺序排序/必要 fallback → 返回 final LlmCallConfig」之后才进入 prepareCall/stream，不能首个成功即提前 dispatch
   - 执行者 persona：先读「方案」+「验收」文件、以文件内容为准执行，**不要重新规划整体方案**；执行过程中持续对照验收文件自验证，发现问题立即修正
   - 执行者权限：审批策略在委派边界固定为 never——**写工作区以外的路径必然被拒绝**：不要逐条尝试、更不要设 sandbox_permissions（不会弹窗、只会失败）；任务要求写工作区外时，先完成工作区内能做的部分，把越界操作清单（命令、目标路径、用途、预期内容）写进汇报，由主会话统一越界执行（shell + sandbox_permissions）
   - 执行者工具裁剪 deny（12 项）：subagent / subagent_review / subagent_probe / workflow / ralph / send_message / interrupt_agent / list_agents / ask_user_question / todo_write / subagent_plan / cordis_run（防委派递归；预设侧配置见 agent.cordis.yml tool-subagent 行）；creativeMode 的模型可见投影不新增、不改写该 deny，亦不改变执行者 run_code 内既有 binding。
   - 汇报格式（≤15 行，禁止粘贴大段文件内容）：①完成清单——逐项做了什么、关键结果值；②自验证结论——逐项通过/不通过，附一行证据；③越界需求（如有）
   - 主会话**不得自己动手改文件**（write/edit 与 shell 写命令被闸门机械拦截；批准态下主会话仅可执行越界 shell 写：带 sandbox_permissions + justification）
   - **修改范围 = 工作区仓库内**：执行者与主会话在验收通过前不得执行任何生产环境同步/部署动作（如 dsh plugin 更新、复制到 DSH_HOME 安装目录、.agent-presets 下发）——部署时机由用户掌控

⑬ 验收：
   - **增量对拍只在验收期跑一次**：游标增量（session.seq 水位 + snapshotEvents(from,to) 区间读取）与全量的等价性由 step-04 P4-25~P4-27 在验收/回归期证明；生产热路径只跑增量 + 廉价水位前提检查，严禁每趟全量+增量双跑
   - **验收范围 = 仓库/工作区**：在仓库内完成所有可验收项；生产环境（DSH 安装目录/预设/运行时）的同步与部署**不属于验收动作**——验收通过后由用户部署，部署后由用户在生产环境继续相关测试
   - 创建验收复核者（subagent_review，one-shot 后台，run_in_background: true），给它验收文件的路径
   - 复核者只读「验收」文件（按路径读取、以文件内容为准）逐条机械核对——输出格式：逐项「通过/不通过 + 一行证据」，最后一行给总结论「验收通过」或「验收不通过：N 项问题」；全文 ≤20 行
   - 「通过」→ 主会话采纳并汇总；「不通过」→ 把问题清单修正进执行委派重派（最多 2 轮）；两轮仍不通过 → 收集两轮不通过原因、原样返回用户，由用户决策

⑭ 地图维护（所有改动完成后必做）：
   - 主会话在交付前先运行 node pe-test/tools/代码地图生成.mjs 更新机器段，再核对 stdout（[新增] 补描述 / [删除] 核对是否改名 / [行号] 无动作）→ 按本轮改动补写/更新人工意图速查的意图词与函数名（示例：A/C/M 展示投影、HP 手写 read 提示、HN/HB 基线、binding 边界）；人工段不写行号，行号到函数索引按函数名取，最后运行 --check
   - 无论改动来自「直接执行」还是「执行者委派」路径，此步都由主会话执行；验收发现问题需修正重跑时，修正后再次执行本步

## P2-2 SDK 文本复用执行口径
- 先以干净 PTC C=0 顶层会话取 F，再取第一次完整 L、第二次相同完整 L；F 证据只能出现手写 read 提示（`bootstrapReadHint`，不含完整 `tools:sdk`），完整 L renderer 调用必须从基线 2 降为精确 1，两个 L 的 `tools:sdk` 文本逐字相等。调用计数是通过/失败硬门槛，耗时只记录不设阈值。
- 生产缓存为 apply 闭包内 agent-keyed WeakMap：同 agent 同 session 才复用；不同 agent/相同 sessionId、新 agent、new apply、部署/重启不共享。完整 key = 保留 `sdkSchemasForRendering` 后嵌套顺序与字段存在性的指纹 + 原始 language + active renderer 引用；任一变化失效，无法无损指纹不写缓存。
- F/PTC 的 tool:read 手写文案不读写完整 cache，F/native 与 F/both 不生成会被剥离的完整 SDK；L/C=0/有 `tools:sdk` 才缓存文本。并发同 key 合并 Promise；reject、降级空文本和过期 Promise 不缓存/不回写；agent/disposed 先 dispose（缺 sessionId 也执行）。
- step-04 还需对拍 C=0 的模型可见 tools/sections 与既有 runtime deny/权限行为；历史 session 的 textLength/textHits 不作命中证据。本批不做 P2-3、生产部署或 DSH_HOME 同步。

## 2. 子代理通用机制（贯穿 ⑩-⑬）

- **模型/力度继承与跨 Provider 开关**：子代理 reasoningEffort/maxTokens 仍按既有继承/显式抑制语义；plannerModel 仅供 planner，otherAgentModel 仅供非 planner child。crossProviderPlannerModel 默认 false，且仅 cfg.crossProviderPlannerModel === true 才启用严格真实探针。设置保存后需重新装载 Harness，运行中的 Agent 不动态切换。非 planner 在 False/缺失/非法时只对顶层主会话 provider 调用 listModels advisory，精确命中 otherAgentModel 才覆盖；空、未命中、空目录、异常或无 llm 回退主会话 route，不调用 listProviders、真实 prepareCall/stream 或 strict fallback probe。True 的非空 otherAgentModel 枚举全 provider，所有精确命中 provider 串行完成 prepareCall({provider,model,maxTokens:1}) + 完整 prepared stream 的 plugin-source OK probe 后再按既有排序，全部候选结束后才选择；候选失败/未命中/空配置时先验证顶层主会话 provider/model fallback，同路由复用结果；无验证路由在实际 child dispatch 前固定阻断。planner 的 True/False 与原 planner resolver/cache 独立，planner 仍只使用 plannerModel。
- **子代理沙箱下限**：read-only → 自动抬升为 workspace-write（childPolicyNeedsFloor），保证子代理能写工作区
- **usage 账本**：每次调用（含子代理）按 role（main/planner/executor）折叠写入 usage-ledger JSONL（配置见 agent.cordis.yml extra-plan.usageLedger）。折叠入口 foldUsage 是同步函数：agent/created/pre-step/pre-execute 触发补记，agent/disposed 在宿主 driver 静止、session 解绑前同步结算末轮（宿主 emit/void 不等待监听器 Promise，禁止改异步）；每行字段 = ts/sessionId/role/model/provider/hit/miss/out/cacheWriteTokens/reasoningTokens/seq（provider 取自 msg.source.provider、缺省空串；cacheWriteTokens/reasoningTokens 缺省 0；hit/miss/out/cw/rs 五字段全零的事件不写行），读侧 step-99 为纯 token 统计（明细列 sessionId|role|model|provider|calls|hit|miss|out|cw|rs，不做任何按 provider 或按 model 的汇总）。写入带 (sessionId,seq) 去重，cursor JSON 只在有新增行时整文件写回。foldUsage 的增量口径（P1-4）= 宿主 session.seq 水位 + snapshotEvents(from, to) 区间读取：水位未变直接返回（不物化数组、不写文件）、有新增只物化 [prevIndex, 水位) 区间、prevIndex > 水位（日志截断）或首次折叠回退无参全量，seq 去重（seq <= cursor → skip）保证任何路径都不重写旧行；全量对拍只在验收/回归期跑一次（step-04 P4-25~P4-27），生产热路径严禁每趟全量+增量双跑。同 session 续载（disposed 回收内存项后）按 sessionId 从 cursor JSON 单项恢复 { seq, index } 去重，不重写旧行；cursor 文件不存在静默按空表，读取错误/JSON 损坏/根值非对象则每实例首次告警一次并降级为空表覆盖写（其它 session 去重基准会丢失）。运行时计数（rootCall 子调用、job_output 查重、tool-jobs 消费集）按 sessionId 分桶，跨会话互不清理。回归入口：step-04 e 段（P4-1~P4-24 期望不变 + 新增 P4-25+ 增量对拍）。

---

*本节于 2026-09-05 按实际机制校订；原 13 步版本已被替换。机制变化时优先更新 index.js 头注释，再同步本节（2026-09-25 同步 dsh 0.1.7-rc.1 / rc.2 适配）。*

## 设置页双通道写链（dsh 0.1.7，rc.1 起 / rc.2 沿用）
- **8 项 UI 设置**（anchoredBootstrap/creativeMode/runcodeCatchGate/crossProviderPlannerModel/plannerModel/plannerPromptSuffix/exploreBudget/otherAgentModel）：宿主半段 `lib/settings.js` 的 `export const Config`（8 字段全链 `.volatile()`，ns = 行 id `dsh-extra-plan-settings`）；`apply` 只做两件事——`ctx.inject(['settings'])` 内 `child.effect(() => child.settings.configure({ auto: false }, ctx.fiber))`（登记「不生成自动页」的页面策略）+ `ctx.inject(['webServer'])` 注册 prefix 路由。读写全部走官方 `configForms`（`remote.settings.mutate`，事务 + revision fencing + 回滚），本插件不自建写链。
- **2 项宿主行设置**（webFetch → 声明行 `plugins` 内 `tool-web` 行 `config.fetch`；toolPresentationMode → `tool-presentation` 行 `config.mode`）：消费方是宿主其它行，不在本行 Config 内，故走专用接口 `PUT /api/dsh-extra-plan-settings/pro-config`（body **仅**这 2 项，含其它键即 400）→ `ctx.configEditor.edit(presetEntry, (cur, inh) => restatePresetPlugins(cur, inh, { hostRowConfig }))` 整体重述 `config.plugins`；`GET` 只读 `configEditor.configuration()` 现值（声明行缺失时回落仓库模板出厂默认）。失败口径：行定位失败 404、edit/reconcile 失败 500；loopback 校验保留（非环回 403）。
- **前端**：`lib/client.js` 注册到 Plugins 页已安装包行详情的 keyed 插槽 `plugins.row.config`（key = `@local/dsh-extra-plan#dsh-extra-plan-settings`；`ctx.configForms.whileServed([NS], ...)` 包裹，`inject = ['slots','locale','configForms']`）；组件收 `{view, t, form}`——`form` 由宿主 `formFor(rowId)` 按同一 settings 命名空间注入（形状 `{state, mutate}` 不变），8 项用 `form.state` 播种、保存时 `form.mutate(ops, revision)`；2 项自绘控件走上面的 PUT。

## P2-4 运行时默认与模块边界补记
- exploreBudget 的默认读取顺序是工作区 `agent.cordis.yml` 叶值 → 构建期生成 `preset-defaults.generated.js` → 运行时 fallback；运行时不读 YAML，合法 cfg 值仍优先。
- 生成/--check/prepack 完整校验失败即非 0 且保留 last-known-good；preset-sync 在任何用户预设目标写入前失败，既有 postinstall/startup 外壳不阻断。
- shell mutation、planner budget、frontmatter/cause-chain 与 per-apply role/cache 工厂位于 lib；usage/注册/claim、disposed 同步 final fold、监听器顺序和 pre-execute 接线仍在根入口。
