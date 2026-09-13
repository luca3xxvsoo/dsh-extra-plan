# 核心机制与设计意图（AI 改前必读）

> 改闸门/预算/落盘/工具裁剪等核心逻辑前必读；机制「为什么」的详版注释在各源码内，此处只给结论与指向。
> 教训索引：复踩坑前先看下表；细节读指向注释。

## 一、四级机械锚点（路由/目的/澄清/批准）
- 是什么：不是「问四次」，而是「状态机 + 选项验词」——deriveFlowState 从事件流推导 { route, clarified, approved, purpose, channelBroken }，mainGateReason 按状态逐工具判定，非标选项被拒。目的闸门：选「进行pro规划」后必须先发一次目的二选一 ask（选项仅有「完善方案」/「重新规划」），purpose ∈ 'none' | 'refine' | 'redo'，未定则 save_probe 与 subagent_plan 一律教学式拒绝（只做放行前置，不拦澄清 ask）；clarified 置位前提＝route==='plan' 且 purpose∈{refine,redo}；目的未定前普通 ask 答复不置位、不拦截；唯一重置＝新人类消息重开事件窗；取消/中断不归零（混合态为已知接受残留）。
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

## 五、子代理工具裁剪
- 是什么：agent.cordis.yml 各 tool-subagent-* 行的 toolFilter.deny 清单 + lib/executor-spawn.js 薄代理（覆盖引擎内部调用的 workflow/ralph worker）。planner 行 deny 含 subagent_probe（探查者仅主会话可委派：目录层不可见 + 闸门拒绝，双层禁止）。
- 为什么：防委派递归（执行者不得再委派）、执行者/验收者只读；save_plan 注册于规划子代理层与主会话层（T3：主会话侧仅 direct 路由放行、其余路由态拒绝，内容闸门同一实现），其余代理不可见、无需 deny。

## 六、模型/力度继承
- 是什么：子代理模型/reasoningEffort 继承父会话；plannerModel（设置页显式配置）优先于父会话当前模型；**置空 = 继承主会话模型**（T4）；resolvePlannerEntry 单点解析+缓存，并按 provider 目录做**静默降级**判定（T2：清单非空且未命中 → 继承主会话模型，落 type:'degrade' 诊断）。
- 为什么：规划用高质量模型可配置；配置模型不被支持时静默降级（不报错、不中断、不打扰用户）；后台规划时父会话空闲，解析不得依赖「父会话进行中请求头」或模型目录 advisory 命中（2026-09-03 修复）。

## 七、anchored 引导（首轮极简，ptc 兼容）
- 是什么：主会话与规划子代理在会话首个 tool/call 落盘前（isBootstrapPhase，index.js），system-prompt/assemble 钩子装配级注入极简 persona（bootstrapPersona）、清空运行时上下文、目录收窄——有 shell（bash/pwsh，native/both）收窄为 shell + read（run_code 被滤掉）；仅 run_code（ptc 折叠目录）保留 run_code；无 shell 且无 run_code 跳过并每实例警告一次。首个工具调用后每步 assemble 重查事件流 → 恢复全量 persona 与完整目录。执行者/reviewer 子代理不引导。
- 为什么：「先看再答」防止首轮全量工具目录诱使模型未理解先动手；首轮上下文极简降低首轮发散。
- 动它：index.js 锚定钩子（触发判定 isBootstrapPhase、目录筛选 shells/runCodes/keep 构造、sections/contexts 收窄）；cfg：anchoredBootstrap/bootstrapPersona/bootstrapShellTools/bootstrapCommonTools。

## 历史教训索引（细节读指向注释）
| 编号 | 坑 | 指向 |
|:--|:--|:--|
| R2 | deny 只列本预设实际注册的工具名——列了未注册的会 tools.restrict 抛错、子代理无法创建 | agent.cordis.yml 文件头注释 + tool-subagent 行注释 |
| R1 | 静态黑名单不覆盖动态 require/Function 构造/编码拼串（不产生成员→组判定放行→运行时瀑布兜底） | index.js decomposeRunCode 附近注释 |
| E8 | workflow/ralph worker 由引擎内部调用不携带 toolFilter，预设 tool-subagent 行裁剪对其不生效；经 executor-spawn 薄代理注入 deny | lib/executor-spawn.js 文件头注释 |
| v2→v4 | run_code 裸写扫描必须屏蔽已提取工具调用区间后再扫，防「工具参数字符串被误判为裸写」 | index.js decomposeRunCode 尾部注释 |
| 模型目录 | plannerModel 解析不依赖目录「命中」作生效前提；目录仅作降级判定启发式：清单非空且未命中→静默降级主会话模型；清单空/取不到目录→保守沿用并落诊断（目录是 advisory：未列出 id 仍原样传递；旧逻辑父会话空闲时 provider 空导致 plannerModel 永不生效） | index.js resolvePlannerEntry 注释 + decidePlannerModelUse |
| 启动预锁 | 不引入启动预锁（启动即重活拖慢会话启动，快通道教训） | index.js 头部注释 |
| PTC×锚定 | ptc 模式 wireSchemas 塌缩为仅 [run_code]，锚定钩子凭 shell 判定 catalog 无 shell → 曾静默跳过（首轮全量 persona+SDK bindings 暴露引发模型误判直调 glob）；2026-09-06 修复：目录含 run_code 亦锚定（无 shell 分支 keep 并入 run_code；有 shell 时 run_code 仍滤除；无 shell 无 run_code 维持跳过+警告） | index.js 头注释 + 锚定钩子注释 |
| 多调用容错 | run_code ≥2 个 tools.* 调用点未独立容错 → 组判定整体拒绝；一个 try 块包 2 个调用不算各自独立保护 | index.js runCodeCatchGateReason 注释 |
| 被拒不烧预算 | pre-execute deny 的 tool/result 无 data.error（仅 HarnessError 有 .info），成功配对须按块级 isError 排除，否则被拒调用计入探查预算 | index.js toolCallCount 注释 |
| 探查者级联中止 | planner 派探查者曾因引擎 owner 级联取消而全部丢失（planner 轮次结束→activation dispose→jobs-local 取消 one-shot 探查者 job，owner disposed）→ **已改为禁止 planner 委派探查者**（闸门 subagentProbeGateReason 拒绝 planner，文案指向「申请继续探查」），委派权收归主会话；历史备注：若将来放开并行派探查，候选 A（引擎侧 stateOf 计入 job）/候选 B（探查者 job 改挂主会话 owner）均需官方包配合 | index.js subagentProbeGateReason/probeDisposalWarning 注释 |
| runcodeCatchGate 开关 | 教学文案螺旋时用户可关闸退避；开关仅影响多调用容错检查，不影响其它闸门（2026-09-10 全仓核实：唯一读点 = runCodeGroupDenyReason 的 runcodeCatchGate 判定分支；ask 返回值白名单、单实例子调用上限 exploreBudget、预算耗尽白名单、job_output 禁 wait 均不受本开关控制；执行者豁免） | index.js runCodeGroupDenyReason runcodeCatchGate 注释 |
| 容器计费 | run_code 子调用（code-dispatch）不再计入 planner 预算：toolCallCount 删除嵌套分支；预算检查用 isRunCodeSubCall（exec.parent!==undefined）跳过子调用 | index.js toolCallCount 注释 |
| 实例上限 | 静态计数防不住循环放大（1 点=计 1）：运行时按 rootCallId 内存 Map 聚合，超 exploreBudget 拒 | index.js runCodeDispatchGateReason 注释 |
| 代码地图维护 | 地图是 AI 的「第一眼落点」：**人工段管语义、机器段管行号**——头部「意图速查」写 意图词→函数名、**故意不写行号**（人工段行号必漂移），引用的函数名失效由脚本报 [导航失效]；覆盖口径用**形态规则**（任意缩进的 `function NAME` / `const NAME = (…) =>` / `= function`）取代「缩进代理」，并**不做例外清单**（接受清单/排除清单均已删）；文本推断的天花板（正则字面量里的引号毁掉遮罩、无花括号多行箭头区间越界、同名函数描述串位）由 `pe-test/_maptest` 三个夹具固化回归，运行时计数器只报实现层漏检；「改完忘同步」由 `--check`（一键体检内置，不写盘）判红 | pe-test/tools/代码地图生成.mjs 头注释 + pe-test/docs/ai-维护手册.md |
| 会话消息身份 | 注入会话事件流的 user/message 必须经宿主构造器 createUserMessage 生成（自带 role:'user' 与 id；手拼 {source,content} 缺 id/role 会被会话判损坏） | index.js budgetReminderMessage（经 createUserMessage 构造）+ 台账 SD37 |
| 目的 ask 白答坑 | 目的二词不含任何路由/批准词，askKindOfRelaxed 默认回落 clarify（L509），不加 purpose 分支则答复目的 ask 会顺带置 clarified=true；上一轮已由分类侧修复（purpose 分支）；本轮在置位侧收紧（index.js deriveFlowState L675/L704 加 route+purpose 前置条件） | index.js askKindOfRelaxed/deriveFlowState |
| clarified 越界置位 | clarified 越界置位坑：目的未定/路由未确认时普通 ask 答复曾无条件置 clarified=true，澄清锚点形同虚设；本轮以置位前置修复（index.js deriveFlowState L675/L704） | index.js deriveFlowState L675/L704 |
| 澄清选项子串坑（B） | 澄清 ask 的选项不得包含「完善方案」「重新规划」的任何子串（isPartialGateSet 的 indexOf 包含匹配），否则整条 ask 被判 malformed 拒绝 | index.js categorizeGateAsk/isPartialGateSet |

---

*机制「为什么」的详版以此表指向的源码注释为准；本文件仅索引层。*