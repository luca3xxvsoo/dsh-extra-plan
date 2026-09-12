# 实机闸门测试流程（AI 给脚本 · 用户照做 · 当场取证判定）

> 适用对象：`@local/dsh-extra-plan`（仓库内 `plugins/dsh-extra-plan/index.js`，头注释 v0.1.9）。宿主 DSH 0.1.5-rc.2（会话日志 `session.v3.jsonl.zstd`）与 0.1.2-rc.1 及更早（`session.jsonl.zstd`）双兼容。
> 用途：**发版前跑全量**；**改闸门后按域增量跑**（域分组 D1-D8 见第七部分，按域映射到 U 序号）。
> 被测形态：**both（混合）为唯一被测形态 × `runcodeCatchGate` 两轮**（第一轮固定拦截面轮）；**动手前先做第 0 节前置检查**。
> 行号纪律：本文所有 `index.js` 行号以 `pe-test/docs/ai-代码地图.md` 与 `node pe-test/tools/代码地图生成.mjs --check` 为准；改动闸门后按域增量重跑对应域。
> 出处口径：
> - 【B】= .extra-plan/线索-闸门清单-修订-20260912135726.md（探查者证据报告：全量闸门清点 / 触发条件 / 生效角色 / 可测性分档）
> - 【A】= .extra-plan/线索-extra-plan-机械闸门实机测试资产盘点-20260912135639.md（探查者证据报告：资产盘点与 mock/静态/实机分档）
> - 【C】= .extra-plan/线索-实机取证与编排基建-20260912135718.md（探查者证据报告：取证链 / 编排与报告规则 / 硬缺口）
> - 【模式】= .extra-plan/线索-模式切换真源与生效成本-20260912151033.md（探查者证据报告：mode／presentAs 是预设级装载期快照、切换只需新开会话）
> - 【形态】= .extra-plan/线索-两模式闸门覆盖与证据形态-20260912151022.md（探查者证据报告：两模式闸门覆盖 / 证据形态 / 两条硬判据）
> - 【自核】= 本流程实施者于 2026-09-12 对 `plugins/dsh-extra-plan/index.js`、`assets/presets/extra-plan/agent.cordis.yml`、`lib/preset-settings.js`、`lib/executor-spawn.js` 逐条 grep/read 复核（行号与文案一致）。
> - 【批准项】= 主会话委派附加批准项原文（其中宿主 dsh-agent-presets 行号来自该批准项，未在本仓库自核）。

## 0. 前置检查：先检测当前模式

每个读取本文档的 AI **动手前必须先做本节三步检查**；不满足就先请用户改设置，**不得跳过**。

1. **只读部署侧两个值**：read `DSH_HOME/.agent-presets/extra-plan/agent.cordis.yml`，取 `mode`（L365）与 `runcodeCatchGate`（L108）。该文件是设置页的受管文件（`lib/settings.js` L35-37 证实，L138 即设置页正常写入路径），AI **只读**、不写（见 7.1）。【探查者已核实，证据来源：.extra-plan/线索-模式切换真源与生效成本-20260912151033.md】
2. **mode 必须是 both**：若 `mode` 不是 `both`，先明确提示用户切换、**等用户确认后再开始**；提示语模板（照读）：
   > 当前模式为 <值>，本流程需在 both（混合）模式执行：请在设置页把「工具呈现模式」改为「混合」并保存，然后重启 Harness 开新会话，完成后告诉我
   用户侧成本 = 1 次设置页保存 ＋ 新开会话/重启（见 1.5、7.1）。
3. **第一轮固定按 `catchGate=true`（拦截面轮）执行**：起步 `runcodeCatchGate` 已是 `true` → 直接开始第一轮；起步非 true → 在切 both 的**同一次保存**中一并设为 `true`（`toolPresentationMode` 与 `runcodeCatchGate` **同一张卡片、同一次保存**，搭车不新增用户操作）。第二轮再切为 `false`（见 3.3／3.4 与 1.4.2）。

依据（both 为什么能一轮通吃两条平面）：both = **全部工具 schema ＋ run_code** —— 宿主 `wireSchemas` 的 both 分支返回全部 schema 且 knownNames 追加 `run_code`（dsh-tools L2739-2742）；`collapseSection` 在 both 渲染空串（dsh-tools L2627 注释「native calls do execute there」）；插件侧 `catalogIsCollapsed` 只认「恰 1 项且名为 run_code」（index.js L1187-1191）→ **both 不塌缩**。于是**直呼面**（单条 `Error:` 卡片）与 **run_code 面**（聚合行）在**同一会话内同时可达**；A18-A23 正常触发，A29/A31/A33 经 run_code 成员实机（组判定不查 toolFilter/restrict）。【探查者已核实，证据来源：.extra-plan/线索-两模式闸门覆盖与证据形态-20260912151022.md】

## 一、总则

### 1.1 实机测试定义
- 实机测试 = 在**真实 DSH 会话**里，由真实宿主派发 `tools/pre-execute`、由**真实用户操作**（选哪个选项 / 空白回车 / 取消 / 连续调用工具 / 点设置页开关 / 重启进程）触发闸门；判定证据取**模型侧工具结果卡片文案**与**落盘会话日志**。
- 宿主把 deny reason 渲染为工具结果文本「Error: <reason>」并带 `isError:true`（宿主 dsh-tools L3132-3137）【探查者已核实，证据来源：.extra-plan/线索-闸门清单-修订-20260912135726.md L63】。
- 全部运行期闸门只挂在 `ctx.on('tools/pre-execute')`（L3252-3407）一处，统一 `return { kind: 'deny', reason }`（全文件 10 处：L3320/L3324/L3338/L3341/L3345/L3358/L3370/L3373/L3377/L3394）【自核】；另有 3 类非 pre-execute 拒绝：save_plan/save_probe 工具 `execute` 内 throw、静态层 `toolFilter.deny`（yml 四行 + executor-spawn 注入）、assemble 目录裁剪（L3113-3156，只影响可见性、不产生文案）【B L51】。

### 1.2 与 mock/静态自检的分工边界
- 自动层（发版前工程门槛，本流程不替代）：`step-00-全流程回归` / `step-04-路由与写闸门` / `step-06-线索落盘` = mock ctx 走插件 apply 的 in-process 回归；`step-00-跨平台写拦截` = 纯函数；`step-01-*` 与 `代码地图生成.mjs --check` = 静态；`一键step测试.mjs` 11 个自动判定项。【探查者已核实，证据来源：.extra-plan/线索-extra-plan-机械闸门实机测试资产盘点-20260912135639.md L54】
- 本流程 = **实机验收层**：只做「真实会话里制造边界操作 → 对照期望文案 → 当场取证判定通过/不通过」，不重复自动层已覆盖的断言。

### 1.3 用户操作计数规则
- **用户操作定义**：用户必须亲手、AI 不可代做的动作，仅四类 —— ①选选项（点选 ask 弹窗中的某一项）；②空白答复或取消（空白回车 / Esc 取消）；③点设置页开关/保存；④必要时重启进程（重启 Harness 并开新会话）。
- **AI 的一切工具调用不计入**：含委派子代理、子代理会话内连调、一次 run_code 的组判定与聚合取证。
- **常数项 U0**：开一个新会话。任何实测方式都不可避免，不计入变量操作、不单独占用户操作清单行。
- **设置页保存与随后的重启/新开会话合并计 1 次用户操作**（同属「设置页前置档」：`toolPresentationMode` 与 `runcodeCatchGate` 都是装载期快照，改值必须换会话才生效，见 1.4.2 ⑤ 与 7.1）。
- **空白与取消**：视为两种不同响应形态。「必测」取**空白回车**（U1）；「取消」列为可选加测（差异见 7.2 陷阱⑦）。

### 1.4 下界论证（编排设计依据）

#### 1.4.1 状态推进只能靠用户动作（代码证据）
- `deriveFlowState`（L585-665）从「最近一条 `source.kind==='user'` 的人类消息之后的 ask 事件」推导 route/clarified/approved：route 仅由用户选「直接执行 / 进行pro规划」置 direct/plan（L627-630、L651-654），选「不同意」或其它一律回 none；clarified 仅在澄清 ask 答复 `answersLen>0` 时置位（L632/L656，L582 注释「空白回复不算」）；approved 仅在批准 ask 选「同意执行」时置位（L635/L659），「转交pro规划 / 不同意 / 其它」复位 false（L660-661）；通道错误码整体回退 `route=none`、`approved=false`（L622/L645）。【自核】
- 空白答复解析：`parseAskResultData`（L509-544）对空白返回 `kind:'ok'`、`answersLen:0`、`selected:[]`（L525-543，返回 L543）；`matchRouteLabel`（L483-492）对空数组返回 null → route 保持推导默认 none（L649-654）。即路由 ask 空白在 route=none 默认态**零扰动**；澄清 ask 空白不置 clarified；批准 ask 空白不置 approved。【自核】
- 每次用户操作（点选项 / 空白）= 新人类消息 = 状态重算锚点（L588-599）；同轮内 AI 连发不产生新锚点、状态稳定 → **「状态批次」成立**。【自核】

#### 1.4.2 下界推导（两栏：起步非 both 7 次／起步已 both 6 次）
- ① route 维度：none 为初始默认态（0 成本）；direct 与 plan 互斥且只能由用户选择（L627-630）→ 覆盖两态至少 2 次（U2 direct、U3 plan）。**为何不能再压**：direct/plan 单值互斥，一次选择只能推进一态。
- ② plan 线推进：选 plan 仅得 plan·未澄清；clarified 仅用户答复可置位 → 至少 1 次（U4）；approved 仅用户选「同意」可置位 → 至少 1 次（U5）。**为何不能再压**：两个状态位均为用户专属动作，AI 无法代做（正是被实测的边界本身）。
- ③ 未确认语义（空白/取消）：必须至少一次真实空白/取消响应；同一弹窗一次响应只能是一种形态，空白与「选择」不可合并 → 至少 1 次（U1，放路由 ask 上：route=none 默认态、空白不扰动状态，与 S0 批次一次操作双收）。**为何不能再压**：空白形态只能由用户产生，且不能与「点选项」合并。
- ④ 设置页前置档（mode ＋ 开关）：`toolPresentationMode`（key → `tool-presentation` 的 config.mode，`lib/preset-settings.js` L85-94）与 `runcodeCatchGate`（L78-79）的唯一入口都是设置页、且**同一张卡片**【自核】；仅用户可动 → 至少 1 次保存（起步非 both 时另需 1 次把 catchGate 从 true 切回 false，见下）。
- ⑤ 重启／新开会话：`runcodeCatchGateOn` 在 apply(ctx, config) **装载期一次性快照**（L2389-2397，`const runcodeCatchGateOn = cfg.runcodeCatchGate === true` 在 L2397），pre-execute 三处闭包复用（L3340 planner 组判定、L3372 只读 child 组判定、L3393 主会话 mainGateReason 的 gateCtx）【自核】；mode／presentAs 同为预设级装载期快照（1.5）→ 设置页改值后**必须重启 Harness 或新开会话**才生效；设置页保存与随之的重启/新开会话**合并计 1 次用户操作**（1.3）。**为何不能再压**：进程级快照约束，重启不可与开开关同次完成。
- ⑥ **第二轮不推进状态**（本版关键修正）：catchGate 的运行期**唯一读点**是组判定内的 catch 闸门接入（仅 `runcodeCatchGate===true` 时生效，index.js L2215-2217）；组判定逐成员走 mainGateReason（L2209）/ plannerGateReason（L2205）/ childReadonlyGateReason（L2207），**与 catchGate 无关** → 该开关只影响「run_code 多调用容错检查」。故第二轮补验内容（A21 放行面 ＋ 开关局部性佐证）在 **route=none** 即可测、**不依赖 U1-U5 任何状态** → **第二轮 0 次状态舞**。【探查者已核实，证据来源：.extra-plan/线索-两模式闸门覆盖与证据形态-20260912151022.md】
- **合计（两栏）**：
  - **起步非 both = 7 次**：设置页 1 次保存（**同一张卡片同时切 both ＋ 定第一轮 catchGate=true**）＋ 5 次状态推进（U1-U5）＋ 轮间 1 次保存（切 catchGate=false）＋ 第二轮 0 次状态推进 = 1 ＋ 5 ＋ 1 ＋ 0 = **7 次**。
  - **起步已 both = 6 次**：设置页 1 次保存（轮间切 catchGate=false）＋ 5 次状态推进（U1-U5）＋ 第二轮 0 次状态推进 = 1 ＋ 5 ＋ 0 = **6 次**。
- 另加 1 次开新会话常数项 U0（不计入变量操作）；全部变量操作由 U1-U5（状态推进）与设置页 1-2 行承担（子代理三会话 planner/probe/reviewer 全部由 AI 委派、会话内由 AI 连调，**0 用户操作**）。
- 第 ⑤ 步的操作口径补充见本节末行【批准项】。
操作上取「重启」（保守、必定生效）；按宿主 dsh-agent-presets 的 standing mount 指纹重挂载实现（ensureStanding L1768-1776 / compositionStamp L1807-1817），设置页改完后新开会话亦会生效，本流程不依赖此差异。

### 1.5 模式口径（工具呈现模式 toolPresentationMode）

四要素（本节全部【探查者已核实，证据来源：.extra-plan/线索-模式切换真源与生效成本-20260912151033.md】，行号经【自核】复核）：

- **(a) 预设级、全角色同形**：设置页 key = `toolPresentationMode` → `tool-presentation` 的 `config.mode`（lib/preset-settings.js L85-94）；宿主 `presentAs` 声明落在预设的 **standing mount scope** 上，**影响该预设下全部 agent**（主会话与 planner/probe/reviewer 子代理同形 —— 子代理绑定父的同一 standing 组合，dsh-agent-presets composeFrom L1533-1540）。
- **(b) 装载期快照**：mode 在装载期定格；宿主按指纹（mtimeMs + size）变化触发世代重建（ensureStanding L1768-1776 / compositionStamp L1806-1821）→ **切换只需新开会话、不必重启进程**（设置页「需重启」文案为保守口径）。同一机制的 `runcodeCatchGateOn` 见 1.4.2 ⑤（L2397）。
- **(c) 已开会话锁死**：已开会话不能原地切换模式 —— swap 抛 `agent-preset/locked`（L1742-1751）。
- **(d) 取值与两栏现状**：取值域 native／ptc／both（宿主 z.union L31-35）；**仓库默认** = `assets/presets/extra-plan/agent.cordis.yml` L365 `mode: native`、L108 `runcodeCatchGate: false`（step-01-预设完整性.mjs L96 断言默认 native）；**部署实况** = `DSH_HOME/.agent-presets/extra-plan/agent.cordis.yml` L365 `mode: 'ptc'`、L108 `runcodeCatchGate: true`【已探查核实】。

**本流程唯一被测形态 = both**（both = 全部工具 ＋ run_code，直呼面与 run_code 面同会话可达，依据见第 0 节）；**native／ptc 单形态不单独成轮**，其目录形态判据不在必测范围（A39 行单形态对照说明与 7.5 第 ⑨ 条）。

## 二、A 表·闸门用例字典（A01-A40）

定位：**用例字典**。验收与编排表共同引用编号；本表不描述编排顺序（见第三部分）。
出处：本节全部条目【探查者已核实，证据来源：.extra-plan/线索-闸门清单-修订-20260912135726.md（第五节全量证据）】；行号/文案另经【自核】逐条 grep/read 复核（2026-09-12）。非 `index.js` 的出处逐行标注（yml / preset-settings.js / executor-spawn.js）。
可实机性分档口径：**实机直测**（默认前置）｜**实机·需设置页开关前置**（runcodeCatchGate，预设默认 false，yml L108；本流程下第一轮固定 catchGate=true）｜**实机·仅 ptc 可实机**（A29/A31/A33：ptc／both 经 run_code 成员可达，native 单形态被 toolFilter.deny 前置遮住）｜**目录观察**（toolFilter.deny 与目录裁剪不产生文案，看工具清单）｜**B 表替代**（实机走不到，见第五部分）。
形态两列口径：**【模式相关性】**取值四种 —— 「形态不同」（直呼面单条 Error 卡片／run_code 面聚合行，两条平面都可得，both 下同会话并用）｜「仅 ptc 可实机」｜「需 run_code 面（ptc／both 可达；native 独跑时不可达）」｜「无关」（静态/替代）；**【各模式触发手法】**给出该条在 both 下的取证写法与单形态差异。

| 编号 | 闸门标识+index.js 行号 | 生效角色 | 前置状态 | 触发操作 | 期望结果（拒文案关键句） | 判定方式 | 可实机性分档 | 模式相关性 | 各模式触发手法 |
|:--|:--|:--|:--|:--|:--|:--|:--|:--|:--|
| A01 | routeDenyReason(plan)｜L100-105（返回 L102） | 主会话 | route=plan | 调 write/edit（或 pwsh/bash 写命令） | `规划态下主会话不可写文件：${toolLabel}。探查请走 save_probe，写文件请等方案批准后走执行者委派` | 卡片 Error 文案 + step-05 解码 | 实机直测 | 形态不同 | 直呼 → 单条 `Error:` 卡片；run_code 成员 write/edit → 聚合行 `- write: …`（两侧子文案逐字一致，C9） |
| A02 | routeDenyReason(none)｜L104 | 主会话 | route=none（未做路由 ask，或选「不同意」后回 none） | 首轮直接调 write/edit | `路由未确认：${toolLabel}。只读探查可随时进行。创建/修改/删除文件须先 ask_user_question 路由确认（选项固定为「直接执行」「进行pro规划」「不同意」），用户批准后才可动手` | 同上 | 实机直测 | 形态不同 | 直呼 write → 单条卡片（S0 第 6 步直呼面）；run_code 成员 write → 聚合行 `- write: …`；两侧子文案逐字一致（C9） |
| A03 | planDenyReason(direct)｜L106-114（返回 L108） | 主会话 | route=direct | 调 subagent_plan 或 save_probe | `直行态下不可规划：${action}。「直接执行」已选，请直接使用 write/edit/pwsh/bash 等工具动手完成任务` | 同上 | 实机直测 | 形态不同 | 直呼 → 单条卡片；run_code 成员 subagent_plan／save_probe → 聚合行（标签 = 工具名） |
| A04 | planDenyReason(plan 未澄清)｜L111 | 主会话 | route=plan 且 clarified=false | 调 subagent_plan | `澄清问答尚未完成：${action}。请先独立发一次 ask_user_question 做澄清问答（1-3 个关键问题，给候选选项），完成后再调用 ${action}` | 同上 | 实机直测 | 形态不同 | 直呼 → 单条卡片；run_code 成员 subagent_plan → 聚合行（子文案同一条闸门返回值） |
| A05 | planDenyReason(none)｜L113 | 主会话 | route=none（含选「不同意」后） | 调 subagent_plan | `子代理未放行：${action}。须先 ask_user_question 路由确认（选项固定为「直接执行」「进行pro规划」「不同意」），意图澄清问答后再调用 ${action}` | 同上 | 实机直测 | 形态不同 | 直呼 → 单条卡片；run_code 成员 subagent_plan → 聚合行 |
| A06 | approvalDenyReason｜L115-117（返回 L116） | 主会话 | approved!==true | 调 subagent / subagent_fork / workflow / ralph / subagent_review | `执行类委派未放行：${action}。须先 ask_user_question 让用户对方案点「同意执行」（批准选项固定为「同意执行」「转交pro规划」「不同意」），用户批准后才可委派` | 同上 | 实机直测 | 形态不同 | 直呼 → 单条卡片；run_code 成员 subagent → 聚合行（S0-S4 各批同形） |
| A07 | mainGateReason 写闸门第二段｜L2057-2065（返回 L2063） | 主会话 | approved=true 且 route!=='direct' | 主会话自己调 write/edit | `方案已批准，执行请走 subagent 委派 flash 执行者（读方案/验收文件执行）。主会话直做仅限越界操作（工作区外写入，走 shell（Windows 用 pwsh、Linux/macOS 用 bash）+ sandbox_permissions）` | 同上 | 实机直测 | 形态不同 | 直呼 → 单条卡片；run_code 成员 write → 聚合行 |
| A08 | mainGateReason cordis 段｜L2067-2080（返回 L2077） | 主会话 | route!=='direct' 且 approved!==true | 调 cordis_run；**对照面**：cordis_inspect_*/cordis_define/cordis_stop/cordis_undefine 任意路由放行（L2072-2074） | `路由未确认：cordis_run。cordis 只读/暂存工具（cordis_inspect_*、cordis_define、cordis_stop、cordis_undefine）可随时使用；cordis_run 会在会话内执行模型 JS 并挂载临时插件，须先 ask_user_question 路由确认（选项固定为「直接执行」「进行pro规划」「不同意」），用户批准后才可动手` | 同上 | 实机直测 | 形态不同 | 直呼 cordis_run → 单条卡片；run_code 成员 cordis_run → 聚合行；对照面 cordis_inspect_* 直呼或成员写法均放行（无文案） |
| A09 | mainGateReason shell 段｜L2081-2097（返回 L2093） | 主会话 | approved=true 且 route!=='direct' 且 `args.sandbox_permissions` 非字符串（hasEscalation 判定 L2091） | pwsh/bash 写命令**不带** sandbox_permissions | `方案已批准，工作区内写入请走 subagent 委派执行者。越界操作（工作区外写入）请带 sandbox_permissions 参数（如 sandbox_permissions: "workspace-write"）与 justification 重试` | 同上 | 实机直测 | 形态不同 | 直呼 pwsh 写命令 → 单条卡片；run_code 成员 pwsh → 聚合行 `- pwsh: …` |
| A10 | mainGateReason planTool 段｜L2098-2107（返回 L2105） | 主会话 | route=plan 且 clarified=true | 调 subagent_plan 且显式传 run_in_background:false | `规划子代理不可前台等待：run_in_background 参数不得传 false（continuable 固定后台运行）。请移除 run_in_background: false 或省略该参数` | 同上 | 实机直测 | 形态不同 | 直呼／run_code 成员均可；**参数依赖**：object 型参数判定 L2104 → 成员写法下参数必须为合法 JSON，否则判定跳过、标签变「参数不可解析」（L2248-2250） |
| A11 | mainGateReason 委派族段｜L2125-2136（返回 L2133） | 主会话 | approved=true | subagent / subagent_review 未传 run_in_background:true | `执行者/reviewer 必须后台运行：请传 run_in_background: true` | 同上 | 实机直测 | 形态不同 | 直呼／run_code 成员均可；**参数依赖**：object 型参数判定 L2132（同 A10 的「参数不可解析」退化口径） |
| A12 | mainGateReason save_plan 段｜L2115-2124（返回 L2121） | 主会话 | route!=='direct' | 主会话调 save_plan | `save_plan 仅允许在直接执行路由下落盘方案与验收；当前路由态：${state.route}` | 同上 | 实机直测 | 形态不同 | 直呼 → 单条卡片；run_code 成员 save_plan → 聚合行 |
| A13 | mainGateReason save_probe 段｜L2109-2114（返回 L2111 = planDenyReason('save_probe', state)） | 主会话 | route!=='plan' 或 clarified!==true | 主会话调 save_probe | 随前置态取 A02/A03/A04 同源文案：route=none →「子代理未放行：save_probe。…」；route=direct →「直行态下不可规划：save_probe。…」；plan 未澄清 →「澄清问答尚未完成：save_probe。…」 | 同上 | 实机直测 | 形态不同 | 直呼 → 单条卡片；run_code 成员 save_probe → 聚合行 |
| A14 | gateAskDenyReason｜L393-420（返回 L410/L416） | 主会话 | —（任意路由） | 发部分相交/非标选项 ask（例：只含「直接执行」一项） | `ask 选项不规范。路由 ask 选项固定为「直接执行」「进行pro规划」「不同意」；批准 ask 选项固定为「同意执行」「转交pro规划」「不同意」。` + ` 当前路由 ask 缺少：…。`（缺项清单 L416） | 同上 | 实机直测 | 形态不同 | 直呼 ask#1（S0 第 2 步）；run_code 成员 ask 为运行时 Error；**参数依赖**：ask 参数判定 L332，非合法 JSON 时聚合标签变「参数不可解析」 |
| A15 | validateGateAskStructure｜L426-443（返回 L433/L437） | 主会话 | — | 发标准三词但结构错：路由 ask 非 1 问 / 批准 ask 少于 2 问 / 第 2 问带 options | `批准 ask 结构错误：须至少 2 个问题（第一个为批准选项固定为「同意执行」「转交pro规划」「不同意」，第二个为修改意见可空），当前 N 个问题`；或 `批准 ask 结构错误：第 N 个问题（修改意见）必须为纯文本输入，不得提供选项（预设选项不符合用户想法），当前带 M 个选项。请改为纯文本大文本框、去掉 options` | 同上 | 实机直测 | 形态不同 | 直呼 ask#2（S0 第 3 步）；run_code 成员写法同 A14 的参数可解析要求 |
| A16 | jobOutputGateReason 闸门1｜L1981-1994（返回 L1985） | 任意角色（主会话 / planner / 只读子代理） | — | 调 job_output 带 wait:true | `job_output 禁止带 wait: true 前台等待。请省略 wait 参数或设 wait: false，job 完成后会收到通知` | 同上 | 实机直测 | 形态不同 | 直呼 → 单条卡片；run_code 成员 job_output（wait:true）→ 聚合行；S0-S4 各批与 probe/reviewer 序列均覆盖 |
| A17 | jobOutputGateReason 闸门2 同 job 查重｜L1990-2000（返回 L1998） | 任意角色 | 同一轮内已成功调用过同一 job_id | 同轮内第二次调 job_output（同一 job） | `job_output 禁止对同一 job 重复调用。job "<job_id>" 在本轮已调用过，请等待通知或使用 job_list 查看状态` | 同上 | 实机直测（须同轮内，见陷阱③） | 形态不同 | **同一次 run_code 内两次同参 job_output**（组判定同参去重只留 1 成员，第二次为运行时嵌套 re-entry 被拒）；both 下同轮直呼两次为对照写法（中间不得插入新的 user/message） |
| A18 | runCodeGroupDenyReason planner 静态调用点上限｜L2219-2221（runCodeSiteCount L1870-1888；exploreBudget 默认 18，yml L117） | planner | — | planner 的 run_code 写 19 个 tools.* 调用点 | `run_code 静态调用点 19 处超过单实例子调用上限 18（exploreBudget）：请拆分多个 run_code 或减少单次调用点` | 同上（聚合行「- run_code: …」） | 实机直测（planner 序列） | 需 run_code 面（ptc／both 可达；native 独跑时不可达） | run_code 成员/组写法；native 独跑时 run_code 不入 visible（dsh-tools L2874）但 collapsed 仅当 `visible!==void 0`（L3035）→ 直呼 run_code 仍走 pre-execute、拒侧文案可取证（放行侧最终 unknown tool "run_code"，见 C10）；生效角色仅 planner |
| A19 | 裸写成员｜L2194-2203（返回 L2200；写特征 hints L166-176） | planner / 只读 child | — | run_code 内裸写 writeFileSync 等写特征 | `只读角色仅允许只读探查：run_code 代码命中写模式特征 N 处（…）。请改用 read/glob/grep 或 shell 只读命令` | 同上（聚合标签形如 `write（裸写特征：…）`） | 实机直测（planner/probe 序列） | 需 run_code 面（ptc／both 可达；native 独跑时不可达） | 必须写成 run_code 的裸写成员（直呼无此闸门）；planner 序列第 3 步与 probe 序列第 3 步各取证一次 |
| A20 | 实例（rootCallId）子调用上限｜文案 runCodeDispatchCapText L1900-1902 + 判定 L1907-1921（内联 L3324/L3358） | planner | — | 单次 run_code 循环 25 次子调用 | `run_code 实例（rootCallId ${rid}）子调用数 25 超过上限 18（exploreBudget）：请拆分 run_code 或提高 exploreBudget；循环/动态放大同样受限` | 同上 | 实机直测（planner 序列；先例预期 success≈18 / denied≈7【A L58】） | 需 run_code 面（ptc／both 可达；native 独跑时不可达） | run_code 组写法；两处内联计数（L3321-3325、L3355-3359）均在 planner 分支、只读 child 段无计数 → **生效角色仅 planner**（该计数只挂在 planner 分支，只读 child 段无计数） |
| A21 | runCodeCatchGateReason｜L1508-1581（早退 L1578-1579，返回 L1580） | 主会话 / planner | runcodeCatchGate=true（唯一开关 `cfg.runcodeCatchGate === true` L2397；预设默认 false yml L108；设置项 preset-settings.js L78-79） | run_code 内含 ≥2 个调用点且未逐点独立 try/catch | `run_code 内 N 个工具调用未全部独立容错：请给每个调用点各写一个独立 try/catch——一次只包 1 个调用、块后紧跟 catch。已保护 M 个。写法示例：try { await tools.read({ file_path: "x" }) } catch (e) {}` | 同上 | 实机（第一轮 catchGate=true 拦截面 ＋ 第二轮 catchGate=false 放行面）；planner 侧由 mock 兜底（见 3.2.6.1 与 3.2.7） | 需 run_code 面（ptc／both 可达；native 独跑时不可达） | 第一轮：run_code#7 组判定（未逐点 try/catch 代码 ＋ write 成员 → A21 行 ＋ A02 行同批聚合）；第二轮：同代码放行、无 A21 行（开关接入点 L2215-2217） |
| A22 | askUserQuestionReturnGateReason｜L1673-1866（返回 L1677；命中分支 L1741-1743、L1835-1836、L1863） | 主会话（恒开） | — | run_code 内出现 ask 别名 / 动态访问 / 非白名单返回形态 | `run_code 内 ask_user_question 返回值未通过返回值白名单：仅允许以下两种写法：return await tools.ask_user_question(...)；或 const q = await tools.ask_user_question(...); return JSON.stringify({ question: q })` | 同上 | 实机直测 | 需 run_code 面（ptc／both 可达；native 独跑时不可达） | run_code 组写法（S0 组2 ＋ 3.2.7 复验）；**生效角色仅主会话**（恒开，与路由状态无关） |
| A23 | aggregateRunCodeDenyReason｜L2242-2254（header L2243） | 随 A18/A19/A21/A22 | 组内 ≥1 成员触发闸门 | 一次 run_code 触发任一闸门 | `run_code 拆解预审未通过：工具组共 ${members.length} 项（去重后），${denies.length} 项触发闸门，任一触发即整体拒绝：` + 逐行 `- <标签>: <子文案>`（标签规则 L2248-2250） | 聚合文案逐行对照 | 随各批自带（0 用户操作） | 需 run_code 面（ptc／both 可达；native 独跑时不可达） | 聚合 header＋逐行；两轮同口径（逐行子文案按 C9 比对） |
| A24 | budgetExhaustedReason｜L899-901（触发 plannerGateReason L1954-1958；判定 budgetExceeded L904-906） | planner | 本轮非白名单工具真实调用已达 18 次 | 第 19 次真实调用非白名单工具 | `探查预算已耗尽（本轮已用 ${used}/${budget}）：输出「申请继续探查：<待查项> — <原因>」。主会话将探查待查项并转达线索文件路径，你读取线索继续工作。探查完成则直接调用 save_plan 落盘。` | 同上 | 实机直测（planner 序列，须真实连调，见陷阱②） | 形态不同 | planner 序列第 1 步；both 下 19 次真实调用可写成 19 次 run_code（每次单成员），与原直呼写法等价 |
| A25 | 预算耗尽白名单把关｜L2222-2232（FREE_TOOLS = save_plan/send_message，L355；判定 L2226） | planner | 预算耗尽（budgetExceeded(used+1, 18)） | 调 run_code：成员组为空 / 动态访问 / 含非白名单成员 → 拒；成员组非空且**全部** ∈ FREE_TOOLS → 放行 | `探查预算已耗尽（本轮已用 18/18）：… 预算耗尽后 run_code 仅可调用 save_plan/send_message，其他工具均不放行` | 同上（拒批与放行侧各取证一次） | 实机直测（planner 序列：先拒后放行） | 形态不同 | planner 序列第 5 步（run_code 组写法，拒批成员组 ＋ 单成员组 send_message 放行） |
| A26 | budgetReminderText｜L859-863（幂等 budgetReminderSent L872-895；pre-step 注入 L3036-3038） | planner | 剩余 ≤ 阈值且 0<remaining | 继续调用工具（**非拒绝**） | `本轮探查预算还剩 N 次` | 卡片消息文案 | 实机直测（planner 序列途中记录） | 形态不同 | planner 序列第 1 步途中记录（run_code 连调途中同样可记录） |
| A27 | plannerGateReason pwsh｜L1943-1961（返回 L1948） | planner | — | planner 会话内 pwsh 写命令 | `规划子代理只读：pwsh 仅限只读探查命令，禁止创建/修改/删除文件` | 卡片 Error 文案 + step-05 解码 | 实机直测（planner 序列） | 形态不同 | planner 会话内直呼 pwsh（both 下 shell 可见）／run_code 成员 pwsh 写命令，两者均可 |
| A28 | plannerGateReason bash｜L1951 | planner | — | planner 会话内 bash 写命令 | `规划子代理只读：bash 仅限只读探查命令，禁止创建/修改/删除文件` | 同上 | 实机直测（planner 序列） | 形态不同 | 同 A27（bash 分支） |
| A29 | plannerGateReason write/edit｜L1945 | planner | — | 调 write/edit | `规划子代理只读：方案经 save_plan 落盘，其余写入一律禁止（toolFilter 之外的第二道防线）` | mock/直调 或 聚合行（run_code 成员） | 实机·仅 ptc 可实机 | 仅 ptc 可实机 | 升级为实机条目：run_code 成员 write/edit（组判定不查 toolFilter/restrict，index.js L2179-2212 按 name 走闸门 → ptc／both 可达）；native 下被 toolFilter.deny 前置遮住、不产生文案（自动层 mock/直调断言仍有效） |
| A30 | subagentProbeGateReason 闸门2（后台参数）｜L1931-1940（返回 L1937） | 主会话（任意路由状态，L3318） | — | 调 subagent_probe 未传/不显式传 run_in_background:true（参数不可解析时跳过） | `探查者必须后台运行：请传 run_in_background: true`；**放行侧**：带 run_in_background:true → 放行并挂待认领计数（L3328） | 同上 | 实机直测（S0/S1 组 ＋ 放行侧委派 probe） | 形态不同 | 拒侧：直呼（不带参）／run_code 成员（不带参）；放行侧：直呼 subagent_probe 带 run_in_background:true（组判定成员仅取拒侧，放行侧走直呼） |
| A31 | subagentProbeGateReason T5｜L1931-1934（返回 L1933） | planner | — | planner 调 subagent_probe | `规划子代理不得委派探查者：subagent_probe 仅主会话可用（探查者属主会话的探查能力）。请用 read/glob/grep 自行核对；确有缺口时输出「申请继续探查：<待查项> — <原因>」，由主会话派探查者并把线索文件路径转达给你（toolFilter 之外的第二道防线）` | mock/直调 或 聚合行（run_code 成员） | 实机·仅 ptc 可实机 | 仅 ptc 可实机 | 升级为实机条目：run_code 成员 subagent_probe（组判定不查 restrict → ptc／both 可达）；native 下 deny 清单已遮住、实机走不到 |
| A32 | childReadonlyGateReason pwsh/bash｜L1964-1976（返回 L1969/L1972） | reviewer / probe（只读子代理） | — | 只读子会话内 pwsh/bash 写命令 | probe：`探查者只读：pwsh 仅限只读探查命令，禁止创建/修改/删除文件`（bash 同构）；reviewer：`验收复核者只读：pwsh 仅限只读探查命令，禁止创建/修改/删除文件`（bash 同构） | 同上 | 实机直测（probe/reviewer 序列） | 形态不同 | 只读子会话内直呼 pwsh/bash（both 下 shell 可见）／run_code 成员写法，两者均可 |
| A33 | childReadonlyGateReason write/edit｜L1966 | reviewer / probe | — | 调 write/edit | `探查者只读：探查不修改任何文件，write/edit 一律禁止（工具目录判定）` / `验收复核者只读：验收复核不修改任何文件，write/edit 一律禁止（工具目录判定）` | mock/直调 或 聚合行（run_code 成员） | 实机·仅 ptc 可实机 | 仅 ptc 可实机 | 升级为实机条目：run_code 成员 write/edit（只读 child 成员走 childReadonlyGateReason，L2207 → ptc／both 可达）；native 下目录不含 write/edit、实机走不到 |
| A34 | save_plan 参数闸门（工具内 throw）｜L2790-2793（throw L2792） | planner | — | plan/checklist 缺失或内容过短（plan < 200 字） | throw `save_plan: plan/checklist 参数缺失或内容过短（未收到合法参数；调用参数须为合法 JSON，请检查后重试）` | 卡片 Error 文案 | 实机直测（planner 序列） | 形态不同 | save_plan 的 throw 是**运行时 Error**（非 pre-execute 闸门）→ 直呼或 run_code 成员写法均可得 |
| A35 | save_plan 内容闸门（未核实标记）｜L2795-2796 | planner | — | plan 内含未探查/待确认类标记 | throw（原标记字面量与原文案见【B L107】；本文档不复述该字面量，避免被后续会话误当待确认标记） | 同上 | 实机直测（planner 序列，变体描述） | 形态不同 | 同上（运行时 Error，两种写法均可；**变体描述**） |
| A36 | save_plan 证据引用闸门｜L2798-2808（throw L2800/L2805/L2807） | planner | — | 会话缺 cwd / 引用不存在的证据文件 / 引用文件缺「探查证据报告」标题 | throw `save_plan: 会话缺少工作区路径，无法落盘` / `save_plan: 【探查者已核实】证据文件不存在：<ref>` / `save_plan: 【探查者已核实】证据文件非探查者落盘（缺「探查证据报告」标题）：<ref>` | 同上 | 实机直测（planner 序列） | 形态不同 | 同上（运行时 Error） |
| A37 | validateProbe｜L983-1082（上限 PROBE_LIMITS L954-955；execute 内抛出 L2957-2958；文案 L1081） | 主会话 / 已认领探查子代理 | — | save_probe 四字段非数组 / 条目超上限（fileMap、focusAreas 50；exclusions、background 20；evidence 80）/ path 不存在 / range 格式错（`^L?\d+(?:-\d+)?$`）/ evidence.line 带区间 | throw `save_probe: 校验不通过，共发现 N 处违规（超限一律拒绝、不静默截断，请逐条修正后重试）：` + 逐条 `- …` | 同上 | 实机直测（probe 序列） | 形态不同 | 同上（运行时 Error；probe 序列第 2 步） |
| A38 | toolFilter.deny 四行（静态层，无文案）｜agent.cordis.yml L184-197（执行者）/ L233-247（planner，含 write/edit、subagent_probe）/ L258-273（reviewer）/ L290-305（probe） | 执行者 / planner / reviewer / probe | — | 观察对应子会话工具清单 | 不产生拒绝文案；判据 = 该子会话 request/header 的 tools 清单中 deny 名单内工具**不可见**（四行共同禁 cordis_run，yml L373 注释） | step-04-工具清单查看 | 目录观察 | 形态不同 | **both 下目录观察有效**（不塌缩、四角色目录不同形）；ptc 单形态下退化（全角色 `[run_code]` 同形）→ 佐证改用行为/文案观察 |
| A39 | 目录裁剪与 anchored 引导｜index.js L3113-3156（catalogIsCollapsed L1187-1191） | 主会话 / planner | anchoredBootstrap=true（yml L107） | 观察首轮工具目录：both 开态 = 全部工具 ＋ run_code；anchored 收窄后对照 | 不产生拒绝文案；判据 = 逐轮 request/header 的 tools 清单（**both 判据＝全部+run_code**）【A L64 口径：pe-test/README.md L35「人工对比（无自动工具）」】 | step-04-工具清单查看 | 目录观察（S0 开态 ＋ 3.2.7 复验） | **both 判据＝全部+run_code**（首轮 anchored 收窄后 keep={bash,pwsh,read}=3 项，index.js L3148）；native（tools=3）与 ptc（tools=1）两个单形态判据不在必测范围内 | 主会话与 planner 两角色各观察一次：首轮（anchored）观察全部工具 ＋ run_code；收窄后 keep={bash,pwsh,read} |
| A40 | executor-spawn config.deny｜agent.cordis.yml L312-329（12 项）＋ lib/executor-spawn.js L28-88（DEFAULT_DENY L31-47 共 15 项，注入 L55/L63/L81） | workflow / ralph worker | — | worker 请求缺 toolFilter 时注入执行者 deny（防递归委派） | 不产生拒绝文案（工具不可见）；fallback 变体见 B01 | 静态断言 +（可选）工具清单观察 | **B 表替代**（B01） | 无关 | 静态替代为主（第五部分 B01）；可选 U5 后委派 workflow 观察 worker 工具清单 |

> 表注：A40 共 1 条为 B 表替代项（第五部分 B01）；**A29/A31/A33 共 3 条已升级为实机条目**（标注「仅 ptc 可实机」，触发手法见本表对应行与 3.2.6 的 planner／probe／reviewer 序列）；其余 **39 条为实机可测项**（第四部分并集核对：39 ＋ 1 ＝ A 表 40）。

## 三、编排表（轮次 × 配置组合 × 你的操作 × 覆盖内容）

### 3.1 组判定与聚合取证口径（编排依据）
- `runCodeGroupDenyReason`（L2153-2236）对一次 run_code 拆解出的每个成员**逐条走与直呼完全相同的闸门**：主会话成员走 mainGateReason（L2209）、planner 走 plannerGateReason（L2205）、只读 child 走 childReadonlyGateReason（L2207）；denies **非短路全量收集** —— 逐成员 push（L2211）、catch 闸门（L2217）、planner 静态调用点上限（L2221）、预算耗尽白名单（L2230）：**一次 run_code 可一次取证多条**。【自核】
- `aggregateRunCodeDenyReason`（L2242-2254）输出 header「run_code 拆解预审未通过：工具组共 ${members.length} 项（去重后），${denies.length} 项触发闸门，任一触发即整体拒绝：」（L2243）+ 逐行「- <标签>: <子文案>」（L2244-2252）；标签规则：普通成员 = 工具名、裸写 = `write（裸写特征：…）`、参数不可解析 = `<工具名>（参数不可解析）`、catch/cap/budget = 成员 name（L2248-2250）。**两侧子文案逐字一致**（同一条闸门返回值，C9）。【自核】
- **组拒零副作用**：denies≥1 时 `if (denies.length === 0) return null` 不成立 → 返回聚合文案、run_code 整体不执行、成员全部不落地（L2234-2235）。【自核】
- 放行侧（denies=0 才真执行）成员**只设计为只读工具**：read / glob / grep / job_output / job_list / cordis_inspect_*；确需副作用的放行侧一律走**直呼**且限定单成员（如 subagent_probe 带 run_in_background:true、send_message 单成员组）。
- **both 下两条平面同轮并用**：同一条闸门既可经 run_code 成员取聚合行、也可经直呼取单条 `Error:` 卡片（both = 全部工具 ＋ run_code）；两轮只在 `runcodeCatchGate` 一个开关上分叉（见 3.5 轮次总表）。
- 各节「期望文案」列只给**关键句**，逐字模板以 A 表为准（两处一致）。

### 3.2 第一轮：both ＋ catchGate=true（拦截面轮）
配置 = **both ＋ catchGate=true**（`runcodeCatchGateOn` 装载期快照 L2397 已生效）；用 U1-U5 五批（AI 连发、用户 0 额外工具操作）把 **39 条实机项中的 38 条** 与 **A21 的拦截面** 一次跑完。

#### 3.2.1 S0 route=none（U1 空白回车后）
状态：route=none、clarified=false、approved=false（deriveFlowState 默认态 L586）。
一次性连发清单（AI 一轮内全部发出，用户 0 操作；both 下直呼面与 run_code 面同轮并用）：
1. **组判定 run_code#1**（8 成员，一次聚合取证 8 条）：write / subagent_plan / cordis_run / save_plan / save_probe / subagent / subagent_probe（不带 run_in_background）/ job_output（wait:true）
2. 直呼 ask#1：非标选项 ask（只含「直接执行」）→ A14
3. 直呼 ask#2：标准三词但结构错（批准 ask 只有 1 问或第 2 问带 options）→ A15
4. **组判定 run_code#2**：ask 返回值非白名单形态 → A22
5. 直呼只读对照：read / glob / grep（放行、无文案）
6. **直呼单条对照（直呼面）**：直呼 write → 单条 `Error:` 卡片（A02）；其子文案必须与第 1 步聚合行 `- write: …` 逐字一致（C9 硬判据②）
7. 目录观察：首轮 request/header 的 tools 清单 → A39（both 开态 = 全部工具 ＋ run_code，不塌缩）
命中 A 编号与逐条期望文案：

| 命中 A | 成员/路径 | 期望文案关键句 |
|:--|:--|:--|
| `A02` | 组1 成员 write | `路由未确认：write/edit。只读探查可随时进行。…` |
| `A05` | 组1 成员 subagent_plan | `子代理未放行：subagent_plan。须先 ask_user_question 路由确认…，意图澄清问答后再调用 subagent_plan` |
| `A08` | 组1 成员 cordis_run | `路由未确认：cordis_run。cordis 只读/暂存工具（cordis_inspect_*、cordis_define、cordis_stop、cordis_undefine）可随时使用…` |
| `A12` | 组1 成员 save_plan | `save_plan 仅允许在直接执行路由下落盘方案与验收；当前路由态：none` |
| `A13` | 组1 成员 save_probe | `子代理未放行：save_probe。须先 ask_user_question 路由确认…`（route=none 分支） |
| `A06` | 组1 成员 subagent | `执行类委派未放行：subagent。须先 ask_user_question 让用户对方案点「同意执行」…` |
| `A30` | 组1 成员 subagent_probe（不带 run_in_background） | `探查者必须后台运行：请传 run_in_background: true` |
| `A16` | 组1 成员 job_output（wait:true） | `job_output 禁止带 wait: true 前台等待。请省略 wait 参数或设 wait: false，job 完成后会收到通知` |
| `A02` | 直呼 write（直呼面单条） | 单条 `Error:` 卡片；子文案与组1 的 `- write: …` 行**逐字一致**（C9） |
| `A14` | 直呼 ask#1 | `ask 选项不规范。路由 ask 选项固定为「直接执行」「进行pro规划」「不同意」；批准 ask 选项固定为「同意执行」「转交pro规划」「不同意」。` |
| `A15` | 直呼 ask#2 | `批准 ask 结构错误：须至少 2 个问题（…），当前 N 个问题` |
| `A22` | 组2 run_code | `run_code 内 ask_user_question 返回值未通过返回值白名单：仅允许以下两种写法…` |
| `A39` | 目录观察 | 无拒绝文案；both 开态 tools 清单 = 全部工具 ＋ run_code（不塌缩）；anchored 收窄后 keep={bash,pwsh,read}=3 项（index.js L3148） |

组1 预期聚合 header：`工具组共 8 项（去重后），8 项触发闸门，任一触发即整体拒绝：` + 8 行「- <标签>: <子文案>」；缺任一行即判该条不通过（成员参数不可解析等情形按 3.1 标签规则核对）。

#### 3.2.2 S1 route=direct（U2 选「直接执行」后）
状态：route=direct。
一次性连发清单：
1. **组判定 run_code#3**（5 成员）：subagent_plan / save_probe / subagent / subagent_probe（不带 run_in_background）/ job_output（wait:true）
2. 直呼放行侧：subagent_probe 带 run_in_background:true → 放行（A30 放行侧），随即委派 **probe 会话**执行 3.2.6.2 序列（0 用户操作）
3. 直呼对照：cordis_inspect_list / cordis_inspect_query（任意路由放行、无文案）→ A08 对照面

| 命中 A | 成员/路径 | 期望文案关键句 |
|:--|:--|:--|
| `A03` | 组 成员 subagent_plan | `直行态下不可规划：subagent_plan。「直接执行」已选，请直接使用 write/edit/pwsh/bash 等工具动手完成任务` |
| `A03` | 组 成员 save_probe | `直行态下不可规划：save_probe。…`（与上同一模板、同一分支） |
| `A06` | 组 成员 subagent | `执行类委派未放行：subagent。须先 ask_user_question 让用户对方案点「同意执行」…` |
| `A30` | 组 成员 subagent_probe（不带 run_in_background） | `探查者必须后台运行：请传 run_in_background: true` |
| `A16` | 组 成员 job_output（wait:true） | `job_output 禁止带 wait: true 前台等待。…` |
| A30 放行侧 | 直呼 subagent_probe + run_in_background:true | 无拒绝文案；返回后台会话信息，probe 子会话开始（L3328 挂待认领计数） |
| A08 对照 | 直呼 cordis_inspect_* | 无拒绝文案（任意路由放行） |

#### 3.2.3 S2 route=plan·未澄清（U3 选「进行pro规划」后）
状态：route=plan、clarified=false。
一次性连发清单：
1. **组判定 run_code#4**（7 成员，一次聚合）：write / subagent_plan / save_probe / save_plan / cordis_run / subagent / job_output（wait:true）

| 命中 A | 成员/路径 | 期望文案关键句 |
|:--|:--|:--|
| `A01` | 组 成员 write | `规划态下主会话不可写文件：write/edit。探查请走 save_probe，写文件请等方案批准后走执行者委派` |
| `A04` | 组 成员 subagent_plan | `澄清问答尚未完成：subagent_plan。请先独立发一次 ask_user_question 做澄清问答（1-3 个关键问题，给候选选项），完成后再调用 subagent_plan` |
| `A13` | 组 成员 save_probe | `澄清问答尚未完成：save_probe。…`（澄清文案分支） |
| `A12` | 组 成员 save_plan | `save_plan 仅允许在直接执行路由下落盘方案与验收；当前路由态：plan` |
| `A08` | 组 成员 cordis_run | `路由未确认：cordis_run。…` |
| `A06` | 组 成员 subagent | `执行类委派未放行：subagent。…` |
| `A16` | 组 成员 job_output（wait:true） | `job_output 禁止带 wait: true 前台等待。…` |

#### 3.2.4 S3 route=plan·已澄清（U4 澄清答复后）
状态：route=plan、clarified=true。
一次性连发清单：
1. **组判定 run_code#5**（4 成员）：subagent_plan（显式 run_in_background:false）/ subagent / save_plan / job_output（wait:true）
2. 起一个后台 pwsh job（只读命令，如列目录）→ **同轮内** job_output 调两次（第一次放行、第二次拒 → A17）；both 下推荐写成**同一次 run_code 内两次同参 job_output**（组判定同参去重只留 1 成员，第二次为运行时嵌套 re-entry 被拒），直呼两次为对照写法
3. 直呼放行侧：委派 **planner 会话**（subagent_plan，不带 run_in_background；参数跳过检查=放行）执行 3.2.6.1 序列（0 用户操作）

| 命中 A | 成员/路径 | 期望文案关键句 |
|:--|:--|:--|
| `A10` | 组 成员 subagent_plan + run_in_background:false | `规划子代理不可前台等待：run_in_background 参数不得传 false（continuable 固定后台运行）。请移除 run_in_background: false 或省略该参数` |
| `A06` | 组 成员 subagent | `执行类委派未放行：subagent。…` |
| `A12` | 组 成员 save_plan | `save_plan 仅允许在直接执行路由下落盘方案与验收；当前路由态：plan` |
| `A16` | 组 成员 job_output（wait:true） | `job_output 禁止带 wait: true 前台等待。…` |
| `A17` | 同一次 run_code 内第二次同参 job_output（或同轮直呼第二次） | `job_output 禁止对同一 job 重复调用。job "<job_id>" 在本轮已调用过，请等待通知或使用 job_list 查看状态` |

注：A17 必须与第一次**放行**调用同轮内完成（中间不插入新的 user/message；锚点重置机制见陷阱③）。

#### 3.2.5 S4 route=plan·已批准（U5 批准「同意执行」后）
状态：route=plan、approved=true。
一次性连发清单：
1. **组判定 run_code#6**（5 成员）：write / pwsh 写命令（不带 sandbox_permissions）/ subagent（不带 run_in_background:true）/ save_plan / cordis_run（A08 对照面：批准态本应放行，此处仅作组员随全拒批一并被拦，不单独产生文案）
2. 直呼放行侧：subagent_review 带 run_in_background:true → 放行（A11 放行侧），随即委派 **reviewer 会话**执行 3.2.6.3 序列（0 用户操作）

| 命中 A | 成员/路径 | 期望文案关键句 |
|:--|:--|:--|
| `A07` | 组 成员 write | `方案已批准，执行请走 subagent 委派 flash 执行者（读方案/验收文件执行）。主会话直做仅限越界操作（工作区外写入，走 shell…+ sandbox_permissions）` |
| `A09` | 组 成员 pwsh 写命令（无 sandbox_permissions） | `方案已批准，工作区内写入请走 subagent 委派执行者。越界操作（工作区外写入）请带 sandbox_permissions 参数…与 justification 重试` |
| `A11` | 组 成员 subagent（无 run_in_background:true） | `执行者/reviewer 必须后台运行：请传 run_in_background: true` |
| `A12` | 组 成员 save_plan | `save_plan 仅允许在直接执行路由下落盘方案与验收；当前路由态：plan` |
| A11 放行侧 | 直呼 subagent_review + run_in_background:true | 无拒绝文案；reviewer 子会话开始（one-shot 后台） |

#### 3.2.6 S5 子代理三序列（0 用户操作）
统一口径：planner（U4 批次委派）、probe（U2 批次委派）、reviewer（U5 批次委派）；**各只开 1 个会话、各 1 条指令序列**；序列内连调全部由 AI 完成，用户 **0 操作**；序列结束由主会话收口判定。both 是预设级形态 → **子代理与父同一 standing 组合、同为 both**（1.5 (a)），故子会话内直呼面与 run_code 面同样并用。

##### 3.2.6.1 planner 序列（覆盖 A18/A19/A20/A24/A25/A26/A27/A28/A29/A31/A34/A35/A36；工具清单观察覆盖 A38）
1. 连调 19 次只读工具（read/glob/grep）→ 途中记录预算提醒（A26：`本轮探查预算还剩 N 次`）；第 20 次调用非白名单工具 → 拒（A24：`探查预算已耗尽（本轮已用 19/18）：…`）。**必须真实连调**（被拒调用不烧预算，陷阱②）。both 下这 19 次可写成 **19 次 run_code（每次单成员）**，与原直呼写法等价。
2. run_code 静态 19 个 tools.* 调用点 → A18（聚合行 `- run_code: run_code 静态调用点 19 处超过单实例子调用上限 18（exploreBudget）…`）。
3. run_code 裸写 writeFileSync → A19（聚合标签 `write（裸写特征：…）`）。
4. run_code 循环 25 次子调用 → A20（`run_code 实例（rootCallId <id>）子调用数 25 超过上限 18（exploreBudget）：请拆分 run_code 或提高 exploreBudget；循环/动态放大同样受限`；先例预期 success≈18 / denied≈7【A L58】）。
5. 预算耗尽后：run_code 含非白名单成员 → 拒（A25 拒侧：`…预算耗尽后 run_code 仅可调用 save_plan/send_message，其他工具均不放行`）；run_code 单成员组 `send_message`（纯 FREE_TOOLS）→ 放行（A25 放行侧，副作用仅为一条回报消息）。
6. pwsh 写命令 → A27（`规划子代理只读：pwsh 仅限只读探查命令，禁止创建/修改/删除文件`）；bash 写命令 → A28（`规划子代理只读：bash 仅限只读探查命令，禁止创建/修改/删除文件`）。
7. **A29/A31 实机（仅 ptc 可实机）**：run_code 成员 write/edit → A29（`规划子代理只读：方案经 save_plan 落盘，其余写入一律禁止（toolFilter 之外的第二道防线）`）；run_code 成员 subagent_probe → A31（`规划子代理不得委派探查者：…`）。both／ptc 下组判定按 name 走闸门、不查 restrict（index.js L2179-2212）。
8. save_plan 三连测：plan 过短 → A34（`save_plan: plan/checklist 参数缺失或内容过短…`）；plan 含未探查/待确认类标记（**变体描述**，字面量见【B L107】）→ A35（throw）；证据引用不存在 / 引用文件非证据报告 → A36（`save_plan: 【探查者已核实】证据文件不存在：<ref>` / `…证据文件非探查者落盘（缺「探查证据报告」标题）：<ref>`）。
9. 工具清单观察 → A38（**both 下有效**：planner 目录有 shell 与 read、无 write/edit、无 subagent_probe，四角色不同形）。
批次串扰说明：第 2-4 步在预算耗尽后发起，聚合文案会同时出现 cap / 裸写 / 实例上限与 budget 白名单行（denies 非短路全量收集，L2211/L2217/L2221/L2230）—— 逐行对照本表，不视为串扰（陷阱⑨）。

##### 3.2.6.2 probe 序列（覆盖 A30 放行侧 / A37 / A19 / A32 / A33 / A16；工具清单观察覆盖 A38）
1. 入口即 A30 放行侧（主会话直呼 subagent_probe 带 run_in_background:true，见 S1）。
2. save_probe 坏参数（五类违规中挑 3 类：path 不存在 / range 格式错 / 字段非数组）→ A37（throw `save_probe: 校验不通过，共发现 N 处违规…`）。
3. run_code 裸写 → A19（只读 child 侧同文案）。
4. pwsh 写命令 → A32（`探查者只读：pwsh 仅限只读探查命令，禁止创建/修改/删除文件`）。
5. **A33 实机（仅 ptc 可实机）**：run_code 成员 write/edit → A33（`探查者只读：探查不修改任何文件，write/edit 一律禁止（工具目录判定）`）。
6. job_output 带 wait:true → A16。
7. 工具清单观察 → A38（**both 下有效**：probe 目录不塌缩、无 write/edit）。

##### 3.2.6.3 reviewer 序列（覆盖 A11 放行侧 / A32 / A33 / A16；工具清单观察覆盖 A38）
1. 入口即 A11 放行侧（主会话直呼 subagent_review 带 run_in_background:true，见 S4）。
2. pwsh 写命令 → A32（`验收复核者只读：pwsh 仅限只读探查命令，禁止创建/修改/删除文件`）。
3. **A33 实机（仅 ptc 可实机）**：run_code 成员 write/edit → A33（`验收复核者只读：验收复核不修改任何文件，write/edit 一律禁止（工具目录判定）`）。
4. job_output 带 wait:true → A16。
5. 工具清单观察 → A38（**both 下有效**：reviewer 目录不塌缩、无 write/edit）。

#### 3.2.7 S6 第一轮·A21 拦截面批次（catchGate=true；0 用户操作）
配置：both ＋ catchGate=true（装载期快照 L2397 已在第一轮生效）；**不依赖任何路由状态**，可在 S0 同轮或其后任意时刻发起。
一次性连发清单：
1. **组判定 run_code#7**（2 成员）：一个含 ≥2 个调用点、未逐点独立 try/catch 的代码块（→ A21）+ write 成员（→ A02 复验）→ 验证**同批双闸门聚合**（header + A21 行 + A02 行）
2. **组判定 run_code#8**：ask 返回值非白名单形态（→ A22 复验）
3. 目录观察：首轮 tools 清单（→ A39 复验，both 判据 = 全部工具 ＋ run_code）
期望文案：A21 行 = `run_code 内 N 个工具调用未全部独立容错：请给每个调用点各写一个独立 try/catch…`；A02 行 = `路由未确认：write/edit。…`。
A21 的 **planner 侧**另由 mock 兜底（不另开 planner 会话）：`step-04-路由与写闸门.mjs` L650-676 UC1-UC26 系列（runCodeCatchGateReason / runCodeSiteCount / isRunCodeSubCall 纯函数矩阵）【探查者已核实，证据来源：.extra-plan/线索-extra-plan-机械闸门实机测试资产盘点-20260912135639.md L37】。
陷阱：本批脚本自身必须逐调用点独立 try/catch，否则先被 A21 拒（陷阱④）。

#### 3.2.8 通道故障特例（不占编排批次）
channelBroken 逃生（`CHANNEL_BROKEN_CODES` L84 = NO_PROVIDER / CALLER_NOT_LIVE / DELEGATED_CALLER；逃生总开关 L2027）会让主会话锚点闸门**整体放行**；本地实机制造通道级故障码不可控 → 由第五部分 B02 替代 + 陷阱①，**不占任何编排批次**【探查者已核实，证据来源：.extra-plan/线索-闸门清单-修订-20260912135726.md L79】。

### 3.3 轮间：1 次设置页保存（把 catchGate 切为 false）＋ 新会话

第一轮跑完后，AI 用下面这段**转告语**（原文入档，照读）请用户做轮间切换；**轮间不重走任何批次**：

> 本轮（both ＋ catchGate=true）已覆盖 39 条实机项中的 38 条与 A21 的拦截面。剩余内容需在 catchGate=false 下验：A21 的放行面 ＋ 开关局部性佐证（第二轮 0 次状态操作）。请你在设置页把 runcodeCatchGate 改为 false（与工具呈现模式同一张卡片）并重启 Harness 开新会话，完成后告诉我，我立即补测并把两轮结果合并成报告。

轮间成本 = **1 次设置页保存**（`runcodeCatchGate` true→false，`toolPresentationMode` 不动）**＋ 新开会话/重启**（装载期快照 L2397 决定必须换会话才生效）。

### 3.4 第二轮：both ＋ catchGate=false（放行面轮）

第二轮配置 = **both ＋ catchGate=false**；**0 次状态操作**（route=none 即可，理由见 1.4.2 ⑥）。**只做两件事，不再重走 U1-U5 的任何批次**：

| 项 | 操作（AI 发起，用户 0 操作） | 判定口径 |
|:--|:--|:--|
| ① A21 放行面 | 发**与第一轮完全相同**的未逐点独立 try/catch 代码（≥2 个调用点、不含 write 成员） | **放行、无 A21 行**：catch 闸门只在 `runcodeCatchGate===true` 时接入组判定（index.js L2215-2217） |
| ② 开关局部性佐证 | route=none 下发一个**带 write 成员**的 run_code | 组内 write **仍被 A02 拒**（`路由未确认：write/edit。…`）→ 佐证该开关不改其它闸门（组判定逐成员走 mainGateReason/plannerGateReason/childReadonlyGateReason，L2205/L2207/L2209） |

第二轮结束后：AI 把两轮结果合并成报告（落点与命名见第八部分）。

### 3.5 轮次总表（轮次 × 配置组合 × 你的操作 × 覆盖内容）

| 轮次 | 配置组合 | 你的操作 | 覆盖内容 |
|:--|:--|:--|:--|
| 第一轮（拦截面轮） | both ＋ catchGate=true（起步非 true 时在切 both 的**同一张卡片、同一次保存**中搭车设为 true） | 5 次状态推进（U1-U5，见第四部分）＋ 设置页前置档 1 次保存（仅起步非 both 需要） | 39 条实机项中的 **38 条** ＋ **A21 的拦截面**（＝ 39 条实机项全覆盖） |
| 轮间 | 设置页 1 次保存把 runcodeCatchGate 切为 false（与工具呈现模式同一张卡片）＋ 新开会话 | 1 次设置页保存 ＋ 新开会话 | —（不产出判定） |
| 第二轮（放行面轮） | both ＋ catchGate=false | **0 次状态操作**（不推进任何路由状态，无需复走 U1-U5） | A21 的放行面（1 条）＋ 开关局部性佐证 |

## 四、用户操作清单（第一轮 U1-U5 五行 ＋ 设置页 1-2 行）+ 映射表

### 4.1 用户操作清单（第一轮 U1-U5 五行 ＋ 设置页 1-2 行；常数项 U0 不占行）

| 序号 | 轮次 | 用户动作 | 推进到状态 | 覆盖 A 编号集合 | 覆盖条数 | 合并理由 |
|:--|:--|:--|:--|:--|:--|:--|
| U1 | 第一轮 | 空白回车（路由 ask） | S0（route=none 默认态） | A02,A05,A06,A08,A12,A13,A14,A15,A16,A22,A30,A39 | 12 | 空白放路由 ask 上，route=none 默认态零扰动（L525-543 空 selected → L649-654 保持 none），未确认语义与 S0 全量一次操作双收；「取消」与空白同属未确认形态，标注择一必测、另一可选（差异见陷阱⑦） |
| U2 | 第一轮 | 选「直接执行」 | S1（route=direct） | A03,A06,A16,A30 | 4（＋probe 委派，0 用户操作） | direct 态只有用户能进；A30 放行侧委派 probe 与其同批 |
| U3 | 第一轮 | 选「进行pro规划」 | S2（route=plan·未澄清） | A01,A04,A06,A08,A12,A13,A16 | 7 | plan 态只有用户能进 |
| U4 | 第一轮 | 澄清答复（选探查方式） | S3（route=plan·已澄清） | A10,A06,A12,A16,A17 | 5（＋planner 委派，0 用户操作） | clarified 只有答复可置位；A17 需同轮内完成（计数锚点 L3256-3277） |
| U5 | 第一轮 | 批准同意（点「同意执行」） | S4（route=plan·已批准） | A07,A09,A11,A08,A12 | 5（＋reviewer 委派，0 用户操作） | approved 只有「同意」可置位 |
| U6 | 第一轮前置（**仅起步非 both 需要**，起步已 both 时省去） | 设置页 1 次保存：**把工具呈现模式（`toolPresentationMode`）切到 both ＋ 把 `runcodeCatchGate` 置 true**（**同一张卡片、同一次保存**，搭车不新增操作）＋ 重启 Harness 开新会话 | 前置（不推进 flow state） | —（0 条直接） | 0 | 两个 key 唯一入口都是设置页（preset-settings.js L85-94 / L78-79）；装载期快照口径（L2397 ／ 1.5）导致必须换会话，与第一轮批次解耦 |
| U7 | 轮间（第一轮与第二轮之间） | 设置页 1 次保存：**把 `runcodeCatchGate` 切为 false**（`toolPresentationMode` 不动；与工具呈现模式同一张卡片、同一次保存口径）＋ 重启 Harness 开新会话 | 前置（不推进 flow state；第二轮 route=none 即可） | —（0 条直接；第二轮两项见 3.4） | 0 | 开关装载期快照（L2397）；轮间必须换会话；**第二轮 0 次状态舞** |

> 表注一：「覆盖条数」列 = 该行**直接连发清单**命中的 A 编号条数（合计 33 条次，含跨行重复）；由该行批次委派的子代理序列所覆盖的编号在 4.2 映射表按同一 U 序号归属，两者合计覆盖 39 条实机可测项（见 4.3）。
> 表注二：**清单行数 = 第一轮 U1-U5 共 5 行 ＋ 第二轮 0 行 ＋ 设置页 1-2 行**（U6 仅起步非 both 需要；U7 恒定）；与 1.4.2 两栏下界一一对应 —— 起步非 both **7 次** = U1-U5（5 次状态推进）＋ U6（1 次保存）＋ U7（1 次保存）；起步已 both **6 次** = U1-U5（5 次）＋ U7（1 次）。**第二轮 0 行 = 第二轮 0 次状态舞**（理由见 1.4.2 ⑥）。
> 表注三：设置页行动作均含「切到 both／切 catchGate」与 `runcodeCatchGate`、同卡片/同一次保存措辞；**第二轮不新增任何用户操作行**。

### 4.2 映射表（A 编号 → 覆盖位置 → 用户操作序号）

| A 编号 | 覆盖位置（批次 / 序列 / 替代） | U 序号 |
|:--|:--|:--|
| `A01` | 第一轮 S2 组判定（成员 write） | U3 |
| `A02` | 第一轮 S0 组判定（成员 write）＋ S0 直呼单条对照 ＋ 3.2.7 拦截面批次复验 | U1 |
| `A03` | 第一轮 S1 组判定（成员 subagent_plan / save_probe 各一次） | U2 |
| `A04` | S2 组判定（成员 subagent_plan） | U3 |
| `A05` | S0 组判定（成员 subagent_plan） | U1 |
| `A06` | S0/S1/S2/S3/S4 组判定（成员 subagent） | U1/U2/U3/U4/U5 |
| `A07` | S4 组判定（成员 write） | U5 |
| `A08` | S0/S2 组判定（成员 cordis_run）；S4 组内对照、S1 直呼对照 | U1/U3（＋U2/U5） |
| `A09` | S4 组判定（成员 pwsh 写命令） | U5 |
| `A10` | S3 组判定（成员 subagent_plan + run_in_background:false） | U4 |
| `A11` | S4 组判定（成员 subagent）＋ S4 直呼放行侧（subagent_review + run_in_background:true） | U5 |
| `A12` | S0/S2/S3/S4 组判定（成员 save_plan） | U1/U3/U4/U5 |
| `A13` | S0 组（none 分支）/ S1 组（direct 分支）/ S2 组（澄清分支） | U1/U2/U3 |
| `A14` | S0 直呼 ask#1（非标选项） | U1 |
| `A15` | S0 直呼 ask#2（结构错） | U1 |
| `A16` | S0-S4 各组判定（成员 job_output wait:true）＋ probe/reviewer 序列 | U1/U2/U3/U4/U5 |
| `A17` | S3 同一次 run_code 内两次同参 job_output（同轮直呼两次为对照） | U4 |
| `A18` | 3.2.6.1 planner 序列第 2 步（静态 19 调用点） | U4 |
| `A19` | 3.2.6.1 planner 序列第 3 步（裸写）/ 3.2.6.2 probe 序列第 3 步 | U4/U2 |
| `A20` | 3.2.6.1 planner 序列第 4 步（循环 25 子调用） | U4 |
| `A21` | **第一轮 3.2.7 组判定（拦截面，随 U1 会话）＋ 第二轮 3.4 同代码放行面**（U7 后新会话）；planner 侧由 mock 兜底（step-04 L650-676） | U1＋U7 |
| `A22` | S0 组2（ask 返回值非白名单）＋ 3.2.7 复验 | U1 |
| `A23` | 聚合 header + 逐行，随各批自带（A18/A19/A21/A22 任一触发即出现） | U1/U2/U3/U4/U5 |
| `A24` | 3.2.6.1 planner 序列第 1 步（第 20 次调用被拒） | U4 |
| `A25` | 3.2.6.1 planner 序列第 5 步（拒侧 ＋ 放行侧） | U4 |
| `A26` | 3.2.6.1 planner 序列第 1 步途中（预算提醒） | U4 |
| `A27` | 3.2.6.1 planner 序列第 6 步（pwsh 写命令） | U4 |
| `A28` | 3.2.6.1 planner 序列第 6 步（bash 写命令） | U4 |
| `A29` | **3.2.6.1 planner 序列第 7 步（run_code 成员 write/edit；仅 ptc 可实机）** | U4 |
| `A30` | S0/S1 组判定（不带参）＋ S1 直呼放行侧（带 run_in_background:true） | U1/U2 |
| `A31` | **3.2.6.1 planner 序列第 7 步（run_code 成员 subagent_probe；仅 ptc 可实机）** | U4 |
| `A32` | 3.2.6.2 probe 序列第 4 步（探查者文案）/ 3.2.6.3 reviewer 序列第 2 步（验收复核者文案） | U2/U5 |
| `A33` | **3.2.6.2 probe 序列第 5 步 / 3.2.6.3 reviewer 序列第 3 步（run_code 成员 write/edit；仅 ptc 可实机）** | U2/U5 |
| `A34` | 3.2.6.1 planner 序列第 8 步（plan 过短） | U4 |
| `A35` | 3.2.6.1 planner 序列第 8 步（未核实标记，变体描述） | U4 |
| `A36` | 3.2.6.1 planner 序列第 8 步（坏证据引用） | U4 |
| `A37` | 3.2.6.2 probe 序列第 2 步（save_probe 坏参数） | U2 |
| `A38` | 3.2.6 planner/probe/reviewer 三序列工具清单观察（**both 下有效**） | U4/U2/U5 |
| `A39` | S0 目录观察（both 判据）＋ 3.2.7 复验 | U1 |
| `A40` | B01 替代（静态断言；可选 workflow 工具清单观察） | 不实机（无 U） |

### 4.3 并集核对
- U1-U5 与设置页行（U6/U7）覆盖集合之并集 ⊇ A01-A40 中**全部 39 条实机可测项**（其中 A29/A31/A33 标注「仅 ptc 可实机」，both 下经 run_code 成员实机）；不覆盖的 1 条为 B 表替代项：A40→B01。
- 子代理三序列（planner/probe/reviewer）**各只开 1 个会话、各 1 条指令序列**，全部由 AI 委派、会话内由 AI 连调，**0 用户操作**；其覆盖的 A18/A19/A20/A24-A28/A29/A31/A32/A34-A38 按「委派它的批次」归属 U 序号（planner→U4、probe→U2、reviewer→U5）；A33 在 probe（U2）与 reviewer（U5）两序列各取证一次。
- A23 为聚合格式、A26 为预算提醒，随各批/planner 序列自带，不额外占用用户操作。
- 互查：4.2 映射表与第三部分编排表逐条对应，同一条编号的期望文案关键句在两处一致（抽查 A01 / A06 / A16 / A20 / A24 与 A03/A04/A05/A08/A10/A12/A13/A17/A30 全部一致）。
- **三处一致**：用户操作次数声明值 = **起步非 both 7 次／起步已 both 6 次**（1.4.2 下界推导两栏）= 用户操作清单行数 **7 行／6 行**（4.1：U1-U5 五行的状态推进 ＋ 设置页 1-2 行；不含常数项 U0）= 全部用户变量操作数；**并集覆盖 = 39 条实机可测 ＋ 1 条 B 表替代（A40）= A 表 40 条**。

## 五、B 表·不可实机复现项的替代手法（2 项）

每项三要素：**不可实机原因 ＋ 替代手法 ＋ 实机佐证物**。

| 编号 | 对象（A 编号） | 不可实机原因 | 替代手法 | 实机佐证物 |
|:--|:--|:--|:--|:--|
| B01 | executor-spawn config.deny 与 DEFAULT_DENY 一族（A40 + fallback） | 预设加载路径下 DEFAULT_DENY 不可达（lib/executor-spawn.js L28-30 注释自述；config.deny 12 项恒由 agent.cordis.yml L312-329 提供）【B L115】 | 源码静态断言：fallback 常量 L31-47（15 项）与 config.deny 12 项逐项对照；不追求实机 | 可选：U5 后委派 workflow，step-04-工具清单查看 观察 worker 工具清单（worker 请求缺 toolFilter 时注入） |
| B02 | channelBroken 逃生放行 | 本地实机制造通道级故障码（NO_PROVIDER / CALLER_NOT_LIVE / DELEGATED_CALLER，index.js L84 / L2027）不可控【B L79】 | mock 事件流断言（step-04 已有） | 实机处置 = 陷阱①：出现逃生码则该组作废重测（见 3.2.8） |

> 表注：原先的三项 toolFilter 遮挡类替代项（planner write/edit 拒绝、planner 委派探查者拒绝、只读子代理 write/edit 文案分支）**已升级为实机条目**（标注「仅 ptc 可实机」；触发手法见第二部分 A 表对应行与 3.2.6 的 planner／probe／reviewer 序列），不再列入本表；本表恰 2 项。

## 六、C 表·取证方式

| 条目 | 口径 / 命令 | 出处 |
|:--|:--|:--|
| C1 模型侧一手证据 | 被拒调用卡片文案 =「Error: <reason>」+ `isError:true`（宿主 dsh-tools L3132-3137）；AI 当场照录卡片原文 | 【B L63】 |
| C2 落盘侧 | `DSH_HOME/sessions/<会话目录>/` 下两代候选：`session.v3.jsonl.zstd`（DSH 0.1.5-rc.2）/ `session.jsonl.zstd`（0.1.2-rc.1 及更早）；解码链 = `pe-test/_shared/session-finder.mjs`（定位）+ `zstd-frames.mjs`（node:zlib 真解 zstd） | 【C L6-11】 |
| C3 四种只读视图 | `step-05-会话解码.mjs`（事件直方图 / agent-preset / header 摘要）、`step-04-工具清单查看.mjs`（逐轮 tools 清单）、`step-06-真实会话查看.mjs`（TOOL-ERROR）、`step-08-方案配对查看.mjs`（save_plan call/result 配对） | 【C L8-11】 |
| C4 **判据口径（关键）** | **闸门拒绝 = content[0].isError:true 且无 data.error**；`step-06-真实会话查看` 只打印 data.error 的 TOOL-ERROR → **闸门拒绝在该视图不可见、不可作闸门证据**；本工作区会话日志已有 2 条 isError=true、data.error=0 的实机样例 | 【C L31 / L66 / L103】 |
| C5 会话定位 | 显式传：`node pe-test/tools/step-05-会话解码.mjs <会话目录名>`；或设 `SESSION_ID=<uuid / session-uuid / 目录名>`（命中主会话连带子会话，未命中返回 notfound 不回退）；**禁无参 auto** | 【C L30】 |
| C6 EPERM 对策 | 一键step测试 的人眼项取证在受限沙箱下 100% EPERM（7 次历史 × 4 项 = 28 份报告全部只写「运行环境受限（spawn 失败: EPERM）」）→ 取证命令由**用户在系统终端手动执行**；本流程不改动任何 .mjs 脚本 | 【C L50 / L75】 |
| C7 预算侧佐证 | 被拒不烧预算：toolCallCount 按块级 isError!==true 配对计数（index.js L726-755，判定 L740） | 【B L65】 |
| C8 聚合文案取证口径 | header「run_code 拆解预审未通过：工具组共 N 项（去重后），M 项触发闸门，任一触发即整体拒绝：」（L2243）+ 逐行「- <标签>: <子文案>」（L2244-2252）；一次 run_code 取证多条时**逐行**对照 A 表期望 | 【自核】 |
| C9 **聚合文案按行比对（硬判据②）** | 只比对 `- <标签>: ` 之后子文案与 A 表期望**逐字一致**（aggregateRunCodeDenyReason 直接 push 闸门原返回值 L2244-2252，**子文案与 native 单条逐字一致**）；header（L2243）与行前缀另立模板；**禁止整卡比对**（header 计数、标签改写、参数不可解析都会造成整卡差异） | 【形态】 |
| C10 **unknown tool 陷阱（硬判据①）** | 直呼非 run_code 工具时宿主在 pre-execute 前早退（createExecution L3034-3035 / L3067-3077、prepareExecution L3107），文案 `unknown tool "<name>": only run_code is callable directly — call <name> from inside a run_code program instead` **不算闸门证据**，不得记入任何 A 编号判定 | 【形态】 |

## 七、执行协议

### 7.1 前置状态搭建
- 在本工作区（E:\Soft\AI项目\dsh-extra-plan）新开一个真实会话；先记录会话目录名 / SESSION_ID（见 C5）。
- **先执行第 0 节三步前置检查**：读部署侧 `DSH_HOME/.agent-presets/extra-plan/agent.cordis.yml` 的 `mode`（L365）与 `runcodeCatchGate`（L108）。**现状两栏对照**（以部署实况为准）：

| 来源 | mode（agent.cordis.yml L365） | runcodeCatchGate（L108） |
|:--|:--|:--|
| 仓库默认（assets/presets/extra-plan/agent.cordis.yml） | native（step-01-预设完整性.mjs L96 断言默认 native） | false（yml L108） |
| 部署实况（DSH_HOME/.agent-presets/extra-plan/agent.cordis.yml；本机路径 `C:\Users\SheepToken\.dsh\.agent-presets\extra-plan\agent.cordis.yml`）【已探查核实】 | 'ptc' | true |

  → **以部署实况为准**：起步 `mode='ptc'` → 按第 0 节第 2 步提示用户**切到 both**（1 次设置页保存 ＋ 新开会话）；起步 `runcodeCatchGate=true` → **第一轮固定 catchGate=true**、可直接开始（第 0 节第 3 步）。
- 其它前置值：anchoredBootstrap=true、exploreBudget=18、savePlanDir=.extra-plan、plannerModel=deepseek-v4-pro（agent.cordis.yml L107-118）【自核】。
- **设置页改动（由用户操作，AI 只旁读）**：第一轮前置 = 把「工具呈现模式」**切到 both** ＋ 把 `runcodeCatchGate` 置 true（**同一张卡片、同一次保存**；preset-settings.js L85-94 / L78-79【自核】），随后重启 Harness 开新会话；轮间 = 再 1 次保存把 `runcodeCatchGate` 切为 false（`toolPresentationMode` 不动）。两次保存即 4.1 的 U6／U7。
- 全程只动工作区会话；**AI 不触碰生产环境**（DSH_HOME/profiles、.agent-presets 零操作）；设置页改动**由用户操作** —— 其受管文件位于 `DSH_HOME/.agent-presets`，`lib/settings.js` L35-37 / L138 即设置页的**正常写入路径**（不是 AI 的写入路径）。

### 7.2 干扰项与陷阱（9 条，逐条写进实测记录）
① channelBroken 逃生（index.js L2027、L84）：每组实测前确认该会话 ask 通道无通道级故障码（NO_PROVIDER / CALLER_NOT_LIVE / DELEGATED_CALLER）；出现逃生码则该组作废重测（替代手法见 B02 与 3.2.8）。
② 被拒不烧预算（index.js L726-755，判定 L740）：A24/A25/A26 必须真实连调 19 次，不能靠重复被拒凑数。
③ job_output 计数锚点重置（index.js L3256-3277；tool-jobs 完成通知解锁 L3278-3310）：A17 的两次调用必须发生在**同一轮内**（中间插入一条新的 user/message 或 send_message 续轮即重置）。
④ runcodeCatchGate 自我合规（第一轮 3.2.7 批；组内 catch 判定 L2215-2217）：开启后测试脚本自身发给 run_code 的代码也必须逐调用点独立 try/catch，否则脚本先被 A21 拒。
⑤ 会话定位禁 auto：一律显式传会话目录名 / SESSION_ID（auto 可能取到别的「按需规划模式」会话）【C L30】。
⑥ 人眼项取证 EPERM：不跑一键step测试 的人眼项，取证命令由用户手动终端执行（见 C6）。
⑦ 空白 vs 取消差异：空白 = answersLen:0（index.js L525-543 / L543），仅不置位对应状态位（L632/L656/L659-661）；取消/中断若宿主带 error 且非通道码 → route 回 none、approved 复位（L643-646）。→ U1 用**空白回车**、不用 Esc；若用户按 Esc 导致状态回退属预期、不影响 S0（none 本为默认）；Esc 行为列为**可选加测**。
⑧ 组拒零副作用（index.js L2234-2235）：denies≥1 时 run_code 整体拒绝、成员不执行；放行侧成员只用只读工具（read/glob/grep/job_output/job_list/cordis_inspect_*），防止真写盘 / 真委派误伤。
⑨ 聚合多行串扰：预算耗尽后发起的 planner 组判定会同时出现 cap / 裸写 / 实例上限与 budget 白名单行（denies 非短路全量收集，L2211/L2217/L2221/L2230）—— 逐行对照 A 表，不视为串扰（见 3.2.6.1）。

### 7.3 用户配合协议
- AI 逐条给出精确操作脚本（点哪个选项、空白回车、连续调某个工具 N 次、带哪个参数）；用户照做；AI **当场**照录工具卡片文案并判定「通过（文案与期望关键句一致）/ 不通过（给出实际文案）」。
- 每完成一域由用户在清单勾选；支持「发版前跑全量、改闸门后按域增量」。
- 两轮之间 AI 只发 3.3 的**转告语**，等用户完成设置页切换与开新会话后再继续第二轮。

### 7.4 域分组（D1-D8，可勾选；增量跑按域映射到 U 序号）

| 域 | 范围 | A 编号 | 对应 U 序号 |
|:--|:--|:--|:--|
| D1 | 锚点（route/clarified/approved 与 ask 结构） | A01-A06、A14、A15 | U1/U2/U3 |
| D2 | 写/cordis/shell/planTool/委派 ＋ save_plan·save_probe 主会话路由 | A07-A13 | U1/U2/U3/U4/U5 |
| D3 | job_output | A16、A17 | U1-U5（A17 仅 U4） |
| D4 | run_code 组判定 | A18-A23 | U1（3.2.7 拦截面）/ U4（planner 序列）/ U7（第二轮放行面） |
| D5 | planner 预算 | A24-A28（A29 实机，仅 ptc） | U4（planner 序列） |
| D6 | 子代理侧 | A30-A33（A31/A33 实机，仅 ptc） | U1/U2/U5 |
| D7 | 落盘 | A34-A37 | U4（planner 序列）/ U2（probe 序列） |
| D8 | 静态目录 | A38-A40（A40→B01） | U2/U4/U5（工具清单观察） |

### 7.5 硬约束对策对照（九条全给对策）
① 切 both ＋ catchGate 两轮同属**设置页前置档**（同一张卡片、同一次保存口径）：起步非 both **7 次**／起步已 both **6 次**（1.4.2 两栏）；② A29/A31 在 ptc 下经 run_code 成员**实机**（组判定不查 toolFilter/restrict），native 下仍被 deny 遮住（自动层 mock 断言仍有效）；③ executor-spawn DEFAULT_DENY 不可达 → **B01** 静态替代；④ channelBroken 逃生 → **B02** ＋ 陷阱①；⑤ 人眼项 EPERM → C6 手动取证；⑥ 闸门拒绝判据与 TOOL-ERROR 口径不一致 → C4 判据口径；⑦ **unknown tool 不算闸门证据**（宿主折叠早退、pre-execute 不跑）→ C10；⑧ **聚合文案按行比对**（只比 `- <标签>: ` 之后子文案，禁止整卡比对）→ C9；⑨ **both 单形态覆盖声明**：A38/A39 的目录形态判据只能验 both 形态，**报告须显式声明「native／ptc 单形态目录判据未覆盖」**。

## 八、收尾
- 全量（或增量域）跑完后执行：`node pe-test/tools/代码地图生成.mjs --check`（**不写盘**；一致性 / 漏检 / 导航失效判非 0 退出）【探查者已核实，证据来源：.extra-plan/线索-实机取证与编排基建-20260912135718.md L13】。
- 报告落点：`pe-test/reports/实机闸门测试报告-<yyyyMMddHHmmss>.md`（沿用 `测试报告-<stamp>.md` 命名风格；`pe-test/reports/` 被 .gitignore 忽略、不入库）【探查者已核实，证据来源：.extra-plan/线索-实机取证与编排基建-20260912135718.md L29、L102】。
- 报告内容：逐条 A 编号 → 批次/序列 → 实际文案（逐字照录）→ 通过/不通过 → 取证方式（卡片照录 / step-05 解码）；域勾选结果；未跑项与原因（含 B 表替代项）。
- 收尾检查：本轮**不改动任何源码与脚本**；生产环境零操作（DSH_HOME/profiles、.agent-presets 不触碰）。
