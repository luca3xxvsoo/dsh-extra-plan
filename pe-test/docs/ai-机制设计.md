# 核心机制与设计意图（AI 改前必读）

> 改闸门/预算/落盘/工具裁剪等核心逻辑前必读；机制「为什么」的详版注释在各源码内，此处只给结论与指向。
> 教训索引：复踩坑前先看下表；细节读指向注释。

## 一、四级机械锚点（路由/目的/澄清/批准）
- 是什么：不是「问四次」，而是「状态机 + 选项验词」——deriveFlowState 从事件流推导 { route, clarified, approved, purpose, channelBroken }，mainGateReason 按状态逐工具判定，非标选项被拒。主会话顺序固定为 route→purpose→clarify：ordinary 探查/澄清 ask 仍可在路由前发生；选「进行pro规划」后必须先发一次精确目的二选一 ask（选项仅有「完善方案」「重新规划」），且仅 route==='plan' 且结构正确时放行，route=none/direct 的拒绝原因必须包含「须先 ask_user_question 路由确认（选项固定为「直接执行」「进行pro规划」「不同意」）」；channelBroken 仅作逃生放行。purpose ∈ 'none' | 'refine' | 'redo'，未定则 save_probe 与 subagent_plan 一律教学式拒绝；clarified 置位前提＝route==='plan' 且 purpose∈{refine,redo}；route 重选无条件清 purpose/clarified/approved，有效目的重选清 clarified/approved，非通道取消清五字段阶段状态；最近一条 user/message 仍切断旧事件窗并回默认态。
- 为什么：用户要求「每一步动手前由用户确认」，机械强制不依赖 AI 自觉。
- 动它：改状态机/判定/拒绝文案。

## 二、run_code 组判定
- 是什么：run_code 能一次做多件事，是绕开「单工具闸门」的后门。静态拆解 code 为工具成员组（decomposeRunCode：扫描 tools.xxx 调用 + 裸写扫描），逐成员走与直呼完全相同的判定，聚合拒绝。
- 边界（**不产生成员** → 组判定放行 → 运行时瀑布兜底，安全方向）：动态访问（tools[var]）/运行时拼名、嵌套 run_code 深度超限、eval/Function 动态代码。
- 边界（**成员保留、仅参数依赖检查跳过**）：参数不可解析（参数不是合法 JSON，例如 JS 对象字面量用了无引号键名）→ 成员照常产生（`argsParsed:false`，聚合标签为 `<工具名>（参数不可解析）`），**状态型闸门（route/clarified/approved/purpose）照常判定**，只跳过**参数依赖检查**（run_in_background / wait / sandbox_permissions / agent_id / command / questions），由运行时 `tools/pre-execute` 瀑布按直呼闸门拦截（文案同源）。
- **组拒零副作用（兜底缺口）**：组内任一成员触发闸门 → 整条 `run_code` 不执行、成员全部不落地 → **此时运行时瀑布也不会跑**。故参数依赖型闸门（A10/A11/A16/A30 等）在组判定路径下存在「静态未评估、运行时也未兜底」的窗口：正确取法＝参数写成**严格 JSON**（使 `argsParsed=true`）＋锚点状态齐备＋组内不被其它成员先拒（若为安全而搭配必然拒绝成员，则接受该项在聚合里不可见）。
- 多调用容错硬闸门：code 内 tools.* 调用点（未去重，裸写不计）≥2 时，要求每个调用点独立容错——只认独立 try/catch 组（try 块内恰 1 个调用点、块后紧跟 catch；allSettled 数组 / .catch 链 / 包装函数一律不认）；不足→教学式聚合拒绝（「run_code 内 N 个工具调用未全部独立容错…已保护 M 个」）。单调用豁免；嵌套 run_code 展平纳入；静态识别失败保守按未保护拒绝。job_output 全角色禁 wait:true（等完成通知）；被 pre-execute 拒绝的调用不计探查预算（配对按 tool-result 块级 isError 排除）。
- runcodeCatchGate 开关：cfg.runcodeCatchGate===true 默认 false（设置页开启，仿 anchoredBootstrap；装载时快照，改后需重启 Harness）。开启时 runCodeCatchGateReason 参与组判定（多调用无独立容错拒绝）；**仅影响本检查**。作用面已全仓核实（2026-09-10）：全仓唯一判定读点与唯一调用点 = runCodeGroupDenyReason 内 runcodeCatchGate 判定分支（if (ctx.runcodeCatchGate === true) → runCodeCatchGateReason，产物仅一个 kind:'catch' 拒绝成员）；生效角色 = 主会话/planner/只读子代理（runCodeGroupDenyReason 内 roleKind 分流：main 走 mainGateReason、planner 走 plannerGateReason、child·readOnly 走 childReadonlyGateReason），执行者（child 非只读）豁免（reason 保持 null 直接放行）。
- ask 返回值白名单（恒开，与 runcodeCatchGate 解耦）：主会话 run_code 内出现 tools.ask_user_question 时，仅放行两种写法——return await tools.ask_user_question(...)；或 const q = await tools.ask_user_question(...); return JSON.stringify({ question: q })；其余形态（别名/动态访问/静态属性引用/.then 包装/只赋值不 return）→ 聚合拒绝（askUserQuestionReturnGateReason，函数区间见代码地图函数索引）。接入点 = runCodeGroupDenyReason 内 visit 的 askReason 判定（roleKind==='main' 才调用，planner 与只读子代理不接）；嵌套超展开深度由 pre-execute 重入兜底。
- 预算容器计费：planner 预算按容器计——run_code 本身计 1 次（tool/call+tool/result 配对），子调用（code-dispatch）不再计入；直呼 1 次 1 计不变；toolCallCount 已删嵌套分支。
- 单实例子调用上限（planner）：单 run_code 实例子调用 ≤ exploreBudget；静态点计数>上限组判定快路径拒 + 运行时按 rootCallId（内存 Map）聚合超限拒；循环/动态放大同样受限。

## 三、探查预算（规划子代理）
- 是什么：机械上限（默认 18 次工具调用）。开局告知 + 剩 3 次提醒 + 耗尽拒绝并注入数字指令；预算自最近一条主会话消息起计，每条转达消息 = 重置 = 授权继续。
- planner 的探查只能自行 read/glob/grep（T5：不得委派探查者——探查者仅主会话可委派）；预算耗尽或确有缺口时走「申请继续探查」往返：主会话派探查者并转达线索文件路径，planner 读取后继续。
- 为什么：规划子代理只读但可能无限探索（"越探越远/想太久"），机械预算强制收敛。

## 四、save_plan 双写 + journal 自愈
- 是什么：方案+验收两文件程序定死双写（两个 payload 必填），原子提交（tmp→journal→rename→清 journal），崩溃后下次 save_plan 自愈补完（新旧 journal 形状兼容）。
- 为什么：方案/验收必须成对出现；崩溃不产生半成品。

## 四-1、save_probe 机械上限与证据边界
- `PROBE_LIMITS` 是 save_probe 独立于 planner 预算的参数校验：当前 `maxEvidenceEntries=150`、`maxEvidenceTextLen=1000`，四类集合上限仍为 fileMap/focusAreas 50、exclusions/background 20，证据总量上限为 32000；超限拒绝且不静默截断。step-00 PR23=151 条拒绝，PR34/PR35=1000 通过、1001 拒绝，工具描述/schema 从同一常量动态生成。
- `exploreBudget=18` 只约束 planner 工具调用与单个 run_code 子调用，不是 PROBE_LIMITS；宿主台账的历史「80 条」「80+79+50=209」是归档 evidence 统计，也不是当前上限。

## 五、子代理工具裁剪
- 是什么：agent.cordis.yml 各 tool-subagent-* 行的 toolFilter.deny 清单 + lib/executor-spawn.js 薄代理（覆盖引擎内部调用的 workflow/ralph worker）。planner 行 deny 含 subagent_probe（探查者仅主会话可委派：目录层不可见 + 闸门拒绝，双层禁止）。
- 为什么：防委派递归（执行者不得再委派）、执行者/验收者只读；save_plan 注册于规划子代理层与主会话层（T3：主会话侧仅 direct 路由放行、其余路由态拒绝，内容闸门同一实现），其余代理不可见、无需 deny。

## 六、模型/力度继承与双路由真实探针
- 是什么：子代理的 reasoningEffort 与 maxTokens 仍按既有父会话语义继承；planner 只读取 plannerModel，非 planner child（executor、reviewer、probe、workflow/ralph worker）只读取 otherAgentModel。两项均为设置页装载期快照，保存后需重新装载 Harness 生效，运行中的 Agent 不动态切换。
- 不可绕过的首请求时序：planner 与非 planner child 都可以先创建并显示为等待，这不等于模型已执行；True 路径的真正首请求必须按 agent/request await → 全部候选真实 OK probe 完成 → 排序/必要 fallback probe → 返回 final LlmCallConfig → DSH prepareCall → DSH stream 顺序进行。agent/request 的异步 listener reject 会在 DSH prepareCall 前结束该 turn。
- 非 planner 显式路由优先：相对直接父的 agentOptions.provider/model 已变化时视为显式，直接保留调用方 route，不读取 otherAgentModel、不列举 provider、不做 probe；未显式时 provider/model fallback 统一取顶层主会话，planner 父模型不会污染 probe 或 worker。
- False、缺失或非法值：planner 保留旧单 provider advisory listModels 语义；非 planner 对非空 otherAgentModel 只查询顶层主会话 provider 的 listModels，精确命中才覆盖 model，空串、未命中、空目录、异常或无 llm 均回退主会话 route；非 planner 不调用 listProviders、真实 prepareCall/stream 或 strict fallback probe。
- True 且非 planner otherAgentModel 非空：枚举所有已注册 provider，逐一读取 listModels，只对精确命中的 provider 串行发起一次 prepareCall({ provider, model, maxTokens: 1 })，并完整消费同一 prepared stream。请求只有一条由 createUserMessage 构造的 plugin-source OK text 消息；所有候选结束后再按既有 provider name/id、父 provider、deepseek-official 排序，不能首个成功即提前 dispatch。planner 仍只按 plannerModel 走其原 resolver/cache。
- True 的严格 fallback：非 planner 候选为空、未匹配或全部 prepare/stream/finish/timeout 失败后，顶层主会话 provider/model 必须完成同规格真实 OK probe；若同一路由已在本次 Agent 解析中探测则复用 outcome，不二次请求。无 llm、主会话路由缺失或 fallback 失败时返回固定非 planner 阻断，未验证路由不得进入实际 child dispatch；planner 继续使用原 planner 阻断。
- True 且非 planner otherAgentModel 为空：跳过跨 Provider 枚举，只验证顶层主会话 fallback；False 的空模型保持零 probe 的原继承语义。
- 探针边界与副作用：planner/非 planner 每个候选使用串行 AbortController/race 与 30000 ms deadline，prepareCall 和 prepared stream 共享同一 signal；真实探针只保证调用前时点，网络、认证、额度和模型状态随后仍可能变化。探针不创建 Agent 或 session event，但会经过全局 llm/stream middleware，并可能产生真实网络、用量与计费，不是免费或零副作用；不遵守 abort 的第三方 adapter 可能留下遗留 I/O。
- 缓存：plannerModelCache 与 otherAgentModelCache 完全分离，均在各自首次入口立即保存同一 in-flight promise；成功 entry 与 strict rejection 都固定到单个 Agent，不跨角色/Agent 共享成功或失败 outcome。
- 为什么：以一次可控且可审计的最小真实调用换取 child route 的时点验证，同时保持 planner 与非 planner 配置边界，并以 False 默认值保护旧部署的行为与成本边界。

## 六-1、step-07 实机证据分层（A42/A43、C11/C12，HUMAN）
- `pe-test/tools/step-07-子代理模型与引导取证.mjs` 只接受显式 `SESSION_ID`（顶层主会话 ID）与显式 `PLANNER_PROMPT_SUFFIX`，复用 `_shared/session-finder.mjs` 和 `_shared/zstd-frames.mjs`，兼容 `session.v3.jsonl.zstd` 与 `session.jsonl.zstd`；缺失/定位失败不得无参 auto 或伪造通过。
- 角色只分 pro规划/非pro规划：直接 child 的 `parentSession`、`origin=subagent`、`delegationDepth`、`subagent/descriptor.mode` 与父 `subagent_plan` call/result child ID 关联共同给出证据；不能依据 provider/model 猜角色，也不细分 executor/reviewer/probe。
- request/header.config.provider/model、request/context.provider/model/contextWindow、model/selection 是 attempted route；`assistant/message.data.message.source.kind=model` 的 source.provider/model 才是 actual provenance。重复的 header/message 原样逐条保留；前栏有而后栏无标 `attempted-only`，两栏均无标 `no-log`。
- 仅 pro规划 child 的初始首个 text block与父 `subagent_plan` 原始 prompt参与 suffix 判定；完整输出每个 text block，`budgetNotice`、宿主 `Your parent agent id is …` guidance、`header.system` 单列且不计 suffix。精确匹配并按 `verified-injection` / `content-only` / `attempted-only` / `absent` / `no-log` 记录，配置 snapshot 与实际 route 分列。

## 七、anchored 引导（首轮极简，ptc 兼容）
| 多调用容错 | run_code ≥2 个 tools.* 调用点未独立容错 → 组判定整体拒绝；一个 try 块包 2 个调用不算各自独立保护 | index.js runCodeCatchGateReason 注释 |
| 被拒不烧预算 | pre-execute deny 的 tool/result 无 data.error（仅 HarnessError 有 .info），成功配对须按块级 isError 排除，否则被拒调用计入探查预算 | index.js toolCallCount 注释 |
| 探查者级联中止 | planner 派探查者曾因引擎 owner 级联取消而全部丢失（planner 轮次结束→activation dispose→jobs-local 取消 one-shot 探查者 job，owner disposed）→ **已改为禁止 planner 委派探查者**（闸门 subagentProbeGateReason 拒绝 planner，文案指向「申请继续探查」），委派权收归主会话；历史备注：若将来放开并行派探查，候选 A（引擎侧 stateOf 计入 job）/候选 B（探查者 job 改挂主会话 owner）均需官方包配合 | index.js subagentProbeGateReason/probeDisposalWarning 注释 |
| runcodeCatchGate 开关 | 教学文案螺旋时用户可关闸退避；开关仅影响多调用容错检查，不影响其它闸门（2026-09-10 全仓核实：唯一读点 = runCodeGroupDenyReason 的 runcodeCatchGate 判定分支；ask 返回值白名单、单实例子调用上限 exploreBudget、预算耗尽白名单、job_output 禁 wait 均不受本开关控制；执行者豁免） | index.js runCodeGroupDenyReason runcodeCatchGate 注释 |
| 模型目录与真实探针 | plannerModel 不能以目录命中或 resolveCallConfig/resolveModelInfo 代替真实可用性；False/缺失/非法开关保留旧单 provider advisory 流程，True 才枚举全 provider，对精确命中者串行 prepareCall + 完整 prepared stream 探针，全部完成后排序；全失败必须验证父 provider/model fallback，否则固定阻断 planner 请求 | index.js resolvePlannerEntry、probePlannerRoute、sortPlannerCandidates |
| 实例上限 | 静态计数防不住循环放大（1 点=计 1）：运行时按 rootCallId 内存 Map 聚合，超 exploreBudget 拒 | index.js runCodeDispatchGateReason 注释 |
| 代码地图维护 | 地图是 AI 的「第一眼落点」：**人工段管语义、机器段管行号**——头部「意图速查」写 意图词→函数名、**故意不写行号**（人工段行号必漂移），引用的函数名失效由脚本报 [导航失效]；覆盖口径用**形态规则**（任意缩进的 `function NAME` / `const NAME = (…) =>` / `= function`）取代「缩进代理」，并**不做例外清单**（接受清单/排除清单均已删）；文本推断的天花板（正则字面量里的引号毁掉遮罩、无花括号多行箭头区间越界、同名函数描述串位）由 `pe-test/_maptest` 三个夹具固化回归，运行时计数器只报实现层漏检；「改完忘同步」由 `--check`（一键体检内置，不写盘）判红 | pe-test/tools/代码地图生成.mjs 头注释 + pe-test/docs/ai-维护手册.md |
| 会话消息身份 | 注入会话事件流的 user/message 必须经宿主构造器 createUserMessage 生成（自带 role:'user' 与 id；手拼 {source,content} 缺 id/role 会被会话判损坏） | index.js budgetReminderMessage（经 createUserMessage 构造）+ 台账 SD37 |
| 目的 ask 路由前置 | 只有首问选项与 PURPOSE_GATE_SET 精确相等的目的 ask 才检查顺序；route=none/direct 拒绝并直接引用固定文案「须先 ask_user_question 路由确认（选项固定为「直接执行」「进行pro规划」「不同意」）」；route=plan 且恰好 1 问放行；ordinary 探查/澄清与 malformed 仍走原分类路径 | index.js purposeRouteDenyReason/mainGateReason/categorizeGateAsk |
| 阶段状态残留 | route 正常重选前清 purpose/clarified/approved；有效目的重选前清 clarified/approved；非 CHANNEL_BROKEN_CODES 的 ask error（含 ASK_CANCELLED）清 route/purpose/clarified/approved；NO_PROVIDER/CALLER_NOT_LIVE/DELEGATED_CALLER 只置 channelBroken 并保留旧状态；最近一条 user/message 仍切换到五字段默认态 | index.js deriveFlowState |
| 澄清选项子串坑（B） | 澄清 ask 的选项不得包含「完善方案」「重新规划」的任何子串（isPartialGateSet 的 indexOf 包含匹配），否则整条 ask 被判 malformed 拒绝 | index.js categorizeGateAsk/isPartialGateSet |

---

*机制「为什么」的详版以此表指向的源码注释为准；本文件仅索引层。*