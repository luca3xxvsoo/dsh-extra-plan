# 核心机制与设计意图（AI 改前必读）

> 改闸门/预算/落盘/工具裁剪等核心逻辑前必读；机制「为什么」的详版注释在各源码内，此处只给结论与指向。
> 教训索引：复踩坑前先看下表；细节读指向注释。

## 一、三级机械锚点（路由/澄清/批准）
- 是什么：不是「问三次」，而是「状态机 + 选项验词」——deriveFlowState 从事件流推导 { route, clarified, approved, channelBroken }，mainGateReason 按状态逐工具判定，非标选项被拒。
- 为什么：用户要求「每一步动手前由用户确认」，机械强制不依赖 AI 自觉。
- 动它：改状态机/判定/拒绝文案。

## 二、run_code 组判定
- 是什么：run_code 能一次做多件事，是绕开「单工具闸门」的后门。静态拆解 code 为工具成员组（decomposeRunCode：扫描 tools.xxx 调用 + 裸写扫描），逐成员走与直呼完全相同的判定，聚合拒绝。
- 边界：动态访问（tools[var]）、参数不可解析、嵌套超深 → 不产生成员，运行时瀑布兜底（安全方向放行）。
- 多调用容错硬闸门：code 内 tools.* 调用点（未去重，裸写不计）≥2 时，要求每个调用点独立容错（①独立 try/catch 组——try 块内恰 1 个调用点 ②allSettled([...]) 数组内 ③.catch 链）；不足→教学式聚合拒绝（「run_code 内 N 个工具调用未全部独立容错…已保护 M 个」）。单调用豁免；嵌套 run_code 展平纳入；静态识别失败保守按未保护拒绝。job_output 全角色禁 wait:true（等完成通知）；被 pre-execute 拒绝的调用不计探查预算（配对按 tool-result 块级 isError 排除）。
- catchGate 开关：cfg.catchGate===true 默认 false（设置页开启，仿 anchoredBootstrap）；开启时 runCodeCatchGateReason 参与组判定（多调用无独立容错拒绝）；仅影响本检查。
- safe 白名单：const NAME=(P)=>P.catch(CB) 形态（任意命名；let/var/async/花括号 body/非 p.catch 形状不入；同名非匹配再定义剔除）；NAME(...) 实参区间恰 1 个 tools 调用点→保护、≥2→不保护（与 try 同口径）；拒绝文案含模板 const safe = (p) => p.catch((e) => ({ _error: String(e).slice(0, 200) }))。
- 预算容器计费：planner 预算按容器计——run_code 本身计 1 次（tool/call+tool/result 配对），子调用（code-dispatch）不再计入；直呼 1 次 1 计不变；toolCallCount 已删嵌套分支。
- 单实例子调用上限（planner）：单 run_code 实例子调用 ≤ exploreBudget；静态点计数>上限组判定快路径拒 + 运行时按 rootCallId（内存 Map）聚合超限拒；循环/动态放大同样受限。

## 三、探查预算（规划子代理）
- 是什么：机械上限（默认 18 次工具调用）。开局告知 + 剩 3 次提醒 + 耗尽拒绝并注入数字指令；预算自最近一条主会话消息起计，每条转达消息 = 重置 = 授权继续。
- 为什么：规划子代理只读但可能无限探索（"越探越远/想太久"），机械预算强制收敛。

## 四、save_plan 双写 + journal 自愈
- 是什么：方案+验收两文件程序定死双写（两个 payload 必填），原子提交（tmp→journal→rename→清 journal），崩溃后下次 save_plan 自愈补完（新旧 journal 形状兼容）。
- 为什么：方案/验收必须成对出现；崩溃不产生半成品。

## 五、子代理工具裁剪
- 是什么：agent.cordis.yml 各 tool-subagent-* 行的 toolFilter.deny 清单 + lib/executor-spawn.js 薄代理（覆盖引擎内部调用的 workflow/ralph worker）。
- 为什么：防委派递归（执行者不得再委派）、执行者/验收者只读；save_plan 只注册于规划子代理层（scoped），其余代理不可见、无需 deny。

## 六、模型/力度继承
- 是什么：子代理模型/reasoningEffort 继承父会话；plannerModel（设置页显式配置）优先于父会话当前模型；resolvePlannerEntry 单点解析+缓存。
- 为什么：规划用高质量模型可配置；后台规划时父会话空闲，解析不得依赖「父会话进行中请求头」或模型目录 advisory 命中（2026-09-03 修复）。

## 七、anchored 引导（首轮极简，ptc 兼容）
- 是什么：主会话与规划子代理在会话首个 tool/call 落盘前（isBootstrapPhase，index.js L236-243），system-prompt/assemble 钩子（约 L2580）装配级注入极简 persona（bootstrapPersona）、清空运行时上下文、目录收窄——有 shell（bash/pwsh，native/both）收窄为 shell + read（run_code 被滤掉）；仅 run_code（ptc 折叠目录）保留 run_code；无 shell 且无 run_code 跳过并每实例警告一次。首个工具调用后每步 assemble 重查事件流 → 恢复全量 persona 与完整目录。执行者/reviewer 子代理不引导。
- 为什么：「先看再答」防止首轮全量工具目录诱使模型未理解先动手；首轮上下文极简降低首轮发散。
- 动它：index.js 锚定钩子（触发判定 isBootstrapPhase、目录筛选 shells/runCodes/keep 构造、sections/contexts 收窄）；cfg：anchoredBootstrap/bootstrapPersona/bootstrapShellTools/bootstrapCommonTools。

## 历史教训索引（细节读指向注释）
| 编号 | 坑 | 指向 |
|:--|:--|:--|
| R2 | deny 只列本预设实际注册的工具名——列了未注册的会 tools.restrict 抛错、子代理无法创建 | agent.cordis.yml 文件头注释 + tool-subagent 行注释 |
| R1 | 静态黑名单不覆盖动态 require/Function 构造/编码拼串（不产生成员→组判定放行→运行时瀑布兜底） | index.js decomposeRunCode 附近注释 |
| E8 | workflow/ralph worker 由引擎内部调用不携带 toolFilter，预设 tool-subagent 行裁剪对其不生效；经 executor-spawn 薄代理注入 deny | lib/executor-spawn.js 文件头注释 |
| v2→v4 | run_code 裸写扫描必须屏蔽已提取工具调用区间后再扫，防「工具参数字符串被误判为裸写」 | index.js decomposeRunCode 尾部注释 |
| 模型目录 | plannerModel 解析不得依赖 llm 模型目录命中（目录是 advisory：未列出 id 仍原样传递）；旧逻辑父会话空闲时 provider 空导致 plannerModel 永不生效 | index.js resolvePlannerEntry 注释 |
| 启动预锁 | 不引入启动预锁（启动即重活拖慢会话启动，快通道教训） | index.js 头部注释（约 L74） |
| PTC×锚定 | ptc 模式 wireSchemas 塌缩为仅 [run_code]，锚定钩子凭 shell 判定 catalog 无 shell → 曾静默跳过（首轮全量 persona+SDK bindings 暴露引发模型误判直调 glob）；2026-09-06 修复：目录含 run_code 亦锚定（无 shell 分支 keep 并入 run_code；有 shell 时 run_code 仍滤除；无 shell 无 run_code 维持跳过+警告） | index.js 头注释（约 L62-64）+ 锚定钩子注释（L2575 附近） |
| 多调用容错 | run_code ≥2 个 tools.* 调用点未独立容错 → 组判定整体拒绝；一个 try 块包 2 个调用不算各自独立保护 | index.js runCodeCatchGateReason 注释 |
| 被拒不烧预算 | pre-execute deny 的 tool/result 无 data.error（仅 HarnessError 有 .info），成功配对须按块级 isError 排除，否则被拒调用计入探查预算 | index.js toolCallCount 注释 |
| 探查者级联中止 | planner 轮次结束→activation dispose→jobs-local owner 级联取消 one-shot 探查者 job（owner disposed）；extra-plan 侧只能告警+文档说明，根治需官方包配合 | index.js probeDisposalWarning 注释 |
| catchGate 开关 | 教学文案螺旋时用户可关闸退避；开关仅影响多调用容错检查，不影响其它闸门 | index.js runCodeGroupDenyReason catchGate 注释 |
| safe 白名单 | 形态匹配（任意命名）兼顾 AI 可写性与防绕性（参数/回调内新增调用点仍被独立计数）；逐字模板对 AI 实际写法过脆 | index.js runCodeCatchGateReason safe 注释 |
| 容器计费 | run_code 子调用（code-dispatch）不再计入 planner 预算：toolCallCount 删除嵌套分支；预算检查用 isRunCodeSubCall（exec.parent!==undefined）跳过子调用 | index.js toolCallCount 注释 |
| 实例上限 | 静态计数防不住循环放大（1 点=计 1）：运行时按 rootCallId 内存 Map 聚合，超 exploreBudget 拒 | index.js runCodeDispatchGateReason 注释 |

---

*机制「为什么」的详版以此表指向的源码注释为准；本文件仅索引层。*