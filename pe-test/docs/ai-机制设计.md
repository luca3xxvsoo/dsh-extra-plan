# 核心机制与设计意图（AI 改核心前读）

> 本文回答“为什么这样设计、当前不变量是什么”。源码注释是实现详版；流程交接读 [ai-流程备查](ai-流程备查.md)，维护操作读 [ai-维护手册](ai-维护手册.md)。历史事故、退役实现和日期化批次见[历史归档](ai-历史故障与机制归档.md)，不作当前运行真源。

## 一、四级机械锚点与 gateWords

- 双根合同 B1：维护 W 由可信源树布局锚定，部署/会话 W 取运行时 `session.header.cwd`；两者都不取 `process.cwd`、插件安装目录或普通文件 `dirname`。H 只来自真实 Host ctx/精确能力，或维护测试显式 `--host-root` 加精确 `--profile`/`--file`/会话目标；`DSH_HOME`/`DSH_PROFILE`/`SESSION_ID` 的存在不能授权，`DSH_INSTALL_ROOT`+host-preload 仅授只读代码根，不授数据 H。
- 双根合同 B2：`createPathContext` 只接收已分类的 `workspaceRoot`、`hostDataRoot` 与可信 Host capability；原始根先经真实路径/链接校验，非法根、无盘符或 drive-relative、URI/变量/NUL、前缀相似 Other 与 native junction 在任何扫描或内容 IO 前拒绝。`resolveWorkspacePath`/`resolveHostPath` 只计算目标，不隐式建目录，实际 IO 仍由 `assertAllowedPath`、`validateReadTarget`、`prepareWriteTarget` 复核最近存在父级、真实身份、链接和用途；普通文件与代码只读能力不能上抬父根。
- 双根合同 B3：相对值按用途固定基准——普通相对值、CLI、覆盖、任务源、工件/fixture/temp/home/cache/capture/report 归 W，运行时账本按用途归 H；不以 `exists` 在两根间试探，不展开 `~`/环境变量。无选择为 `NOT-RUN`/目标 IO 0；会话仅以 `--session-dir`，或 `--session`+`--sessions-dir` 精确选择，子发现必须显式 `--discover-children`，最多 512 候选、每个日志头 262144 字节，坏头/超限为 `INCOMPLETE`；通用路径边界与审计数量以真实源码及对应检查为准，不引用旧批次；H/W 合法重叠按用途分类而非一概拒绝。
- 双根合同 B4：Host 文档/数据的维护取证只经精确能力只读，Host 代码只读；测试与生成暂存、报告、备份和回滚只写 W。维护 CLI step-99 仅保留统计：手工归档已移除，`--archive` 报 `usage-removed` 且在任何 IO 前拒绝；归档统一由 lib/usage-archive.js 的 `archiveLedger` 与插件内置启动归档执行；不提供手工清理/归档；`--archive` 或清理 `--apply` 均在 H IO 前拒绝且零 Host 写，W 只承载统计所需的快照与临时输出；无根、冲突或不合法输入在对应 IO 前失败。插件内置启动归档（lib/usage-archive.js）例外：DSH 服务进程启动时按用途 usage-ledger 对 H 默认账本执行一次合并归档并写诊断日志，失败回滚且不阻断启动。

- 状态不是四次提问，而是事件流推导的 `{ route, purpose, clarified, approved, channelBroken }`。主会话顺序固定为 `route → purpose → clarify`；ordinary（普通）探查/澄清可在路由前发生。入口判定只决定引导词顺序，不改变 `route`、`purpose`、`clarified`、`approved` 四个机械锚点。
- route 规划词后，第一个 purpose ask（目的提问）必须是当前 `config.gateWords` 的二选一；只有 `route=plan` 且目的已定后，澄清答复才置 `clarified=true`。`save_probe` 与 `subagent_plan` 需要目的和澄清，执行类委派只认独立的 `approved` 锚点。
- 闸门拒绝 `kind:'denied'` 不清除阶段状态，便于按拒绝文案修正后重提；用户取消/中断清 `route/purpose/clarified/approved`；通道级故障只置 `channelBroken` 逃生位；新 user/message 切断旧事件窗。
- `config.gateWords` 在 [agent.cordis.yml](../../plugins/dsh-extra-plan/assets/presets/extra-plan/agent.cordis.yml) 中是唯一人工值源。[gate-words.js](../../plugins/dsh-extra-plan/lib/gate-words.js) 只保存字段元数据、整组严格校验、运行时派生和七个 prompt variable；apply 先校验再产生工具/监听器/服务副作用。
- 所有 match、deny 文案和状态推导都消费同一 `gateRuntime`；推荐后缀只做白名单归一，推进状态必须与当前词精确相等，旧词不会复活旧事件。
- 两种 ask 结果先分别由 `parseAskResultData`（普通 result）与 `parseDispatchAskResult`（PTC dispatch）解码，匹配后的规范化结果只进入 `applyAskOutcome` 这一处，再由 `deriveFlowState` 推进状态；保留普通错误码与 PTC 文本错误的原有差异。
- `ROLE_IDS`、`ROLE_ORDERS`、`PLANNER_PRESET_ID`、`PROBER_PRESET_ID` 只提供冻结身份/装配顺序；角色标识不承载工具权限、沙箱或生命周期策略。
- 宿主运行时只按当前 Session 的精确 `agentPreset`/角色 ID 分配 child 的 Host `mode`；四个固定目标为 `extra-plan-executor → workspace-write`、`extra-plan-planner → read-only`、`extra-plan-reviewer → workspace-write`、`extra-plan-prober → read-only`。这只是宿主 Session mode 的唯一功能变化，不改变身份、工具面、提示词或模型路由。
- `childBaseline` 是三个入口 `agent/created`、`agent/pre-step`、`tools/pre-execute` 的共用路径；每次 apply 的 runtime factory 独立，模式事件只追加到当前 `agent.session`，同一 mode 已由当前 override 提供时幂等不重复。main 不按角色目标追加 mode；其它 live child 缺少/不匹配四个精确 ID 时也不获默认目标，父 Session、默认目标和其它 Session 不参与选定或串改。
- unknown 或断链 child 的边界与原判据不变：宿主 role-mode 映射只在现有 child 判定允许时生效；即使原始子代理判据仍识别为 child，`control`/`run_code` 等模型层硬拒仍照常生效。若原闸门拒绝，立即停止并记为 `NOT-RUN`/`INCOMPLETE`，不得改 gate、加许可/白名单/包装，或借 scanner 未识别绕行。
- `workspace-write` 仅是宿主沙箱/工作区写入下限，不是模型的 `write/edit`、shell mutation、control、`run_code` 或写型 MJS 授权；reviewer 即使取该 Host mode，仍受原工具面与插件硬拒，executor 也不能绕过自身既有 control/run_code、route/approved、预算及其它门禁。不得承诺验收者能运行写型 MJS。
- save 的受控写入例外仍是可信 Host 的 `atomicCommit`（含既有 `save_plan`/`save_probe` 资格与保存路径），原 save schema/合同、预算、会话 cwd、路径/链接校验和本次有限清理均不变；Host 代提交不等同模型直接写盘，也不因 workspace mode 新增 save 权限。
- 正式验收只读核宿主 mode 事件、Session 状态隔离、既有 deny/`next=0`/原 reason 与 save 例外；mock、普通 Node 落盘和 Host 装配分层记录，不能冒充真实 OS/生产证明。未执行的真实 owner、工具隔离、provider/GUI/生产会话标为 `NOT-RUN` 或 `HUMAN`，不把未执行项计为 PASS；纯读 `--check`/viewer 只证明自身范围。

## 二、run_code 组判定与 planner 预算

- `run_code` 是批量调用边界，静态拆解出的成员逐个复用直呼闸门；任一成员拒绝则整条 run_code 拒绝，成员不执行、不落地。参数先走 JSON.parse 快路径，再走无 eval/Function/vm/YAML 的安全 literal 子集（对象/数组、标识符或引号键、单/双引号、布尔/null、有限数字、尾逗号）；变量、spread、computed、getter/setter/方法、调用/成员/模板/正则、重复键和污染键均保留 argsText 交运行时瀑布兜底。静态方括号工具名允许 MCP 合同中的连字符，并按 masked 文本跳过 `]` 后行/块注释；不放开点访问或真正动态表达式。
- 多调用容错闸门只认“一个 try 块一个调用点、后接 catch”；单调用豁免，嵌套 run_code 与 decompose 共用安全 literal 入口。主会话/planner/只读子代理受此检查，执行者保持既有豁免；ask 的返回链另有保守静态证明。真正动态 `tools[var]`、const 绑定、参数遮蔽、注释伪绑定、字符串/方括号拼接和转义名仍按原约束处理；非 ask 静态工具别名的既有边界不夸大为统一预审拒绝。只有直接 `tools.ask_user_question(args)` 的参数可动态，直接 return-await 语义不变。
- planner 预算按最近主会话消息或续轮转达的锚点计数；run_code 容器计一次，直呼工具按一次计，被拒调用不烧预算。提醒和耗尽文案由 [planner-budget.js](../../plugins/dsh-extra-plan/lib/planner-budget.js) 负责，耗尽后只能按流程申请继续探查。control 包仅挂 main，`FREE_TOOLS` 仅 `save_plan`；`isSubagentChild` 对 `send_message`/`interrupt_agent` 的直呼与 `run_code` 成员硬拒，覆盖 planner、只读 child、executor 及 unknown/断链 child；mainGateReason 与自动最终结果不变。child 阻塞疑问以最终回复回传，main 可向 idle child 续轮。Client 查询有界等待（默认 10000ms 为配置口径、非现场时延实测），C 投影也不是安全隔离。
- 预算与 `save_probe` 的参数限制是两套合同：预算检查由 planner 计数实现，`PROBE_LIMITS` 的字段与数值唯一来自 [save-contract.js](../../plugins/dsh-extra-plan/lib/save-contract.js)，校验由 [save-probe-validation.js](../../plugins/dsh-extra-plan/lib/save-probe-validation.js) 执行；step-00/step-06 是回归入口，文档不复制完整值表。


## 三、规划工件与原子落盘

- `save_plan` 必须成对写入方案与验收文件，主会话侧是任意路由态可用的受限规划工件；内容、目录和文件名合同不因路由放宽。`save_probe` 只在主会话/已认领探查者层可用，规划子代理不得委派探查者。
- [save-persistence.js](../../plugins/dsh-extra-plan/lib/save-persistence.js) 只处理单次调用：mkdir → 临时文件逐项写入 → 逐项检查并顺序发布。失败保留首错与阶段，仅有限清理本次临时文件/已发布半套工件；清理失败附残留路径与原因，预存文件不覆盖，下一次调用不扫描、不恢复旧 journal，由 AI 主动重试。
- 双写、单写共用阶段感知提交；不承诺跨进程 fsync。工具 schema/输出/渲染/execute 在 [save-tool-factories.js](../../plugins/dsh-extra-plan/lib/save-tool-factories.js)，路径基准取会话 cwd；限制与证据引用合同不能由入口文档另写第二份。
- `save_plan` 的摘要边界与预算影响以 [save-contract.js](../../plugins/dsh-extra-plan/lib/save-contract.js) 为唯一真源；本节只导航该源码，并说明摘要按每个修改点的锚点、验收定位与期望逐点展开，过长会阻止保存，调整合同后须同步 step-00 的 G2-F 边界用例复验；不在本文复制限制数值或比例表。

## 四、模型路由与真实探针

- planner 只使用 `plannerModel`；executor、probe、workflow/ralph worker 等非 planner child 只使用 `otherAgentModel`。已显式指定的直接父 provider/model 优先，不被默认模型覆盖。
- 验收者开关 `reviewerUsesPlannerModel` 只在「非显式路由」分支生效：开启且当前 child 是验收者时，模型来源按 `plannerModel` 解析（`crossProviderPlannerModel` 仍决定 strict 真实探针或 legacy advisory），解析失败普通回退为直接父 fallback，取消原样传播；缓存键精确为 `plannerModel`、cross 开关、`fallback.provider`、`fallback.model`、`fallback.maxTokens` 五段。fallback 由 `nonPlannerRouteSources`/`nonPlannerFallbackEntry(false)` 取得，其中 provider/model 来自顶层 `source`，maxTokens 来自直接父 `direct`；pending 按 ownerSignal 隔离，同 signal 合并、不同 signal 独立，预取消与等待取消的 Error 原对象传播，取消不进入 settled。reasoningEffort 仍继承主会话，不进入 planner 早退分支。关闭时验收者与其它非 planner child 同走 `otherAgentModel`。
- 空串等于继承主会话：`plannerModel` 或 `otherAgentModel` 解析出的目标模型为空串时，父 fallback 即最终路由，零网络、零探针（legacy 与 strict 同语义），也不产生 strict 候选枚举。
- `crossProviderPlannerModel=false/缺失/非法` 走旧的单 provider advisory（建议）路径；严格开启时枚举 provider，只对精确命中的模型做真实 OK probe，所有候选完成后按发起顺序收集、排序，再返回最终路由；候选失败后必须验证顶层主会话 fallback（回退）。
- probe 是有界并发、独立超时/AbortController 的真实调用，可能有网络、额度与计费副作用；它不是目录命中，也不是 `resolveCallConfig` 的替代。成功与失败 promise 均按 Agent 隔离缓存，不跨角色/Agent 共享。
- 唯一详版与取证入口：[model-routing.js](../../plugins/dsh-extra-plan/lib/model-routing.js)、[流程备查](ai-流程备查.md#⑩-规划子代理)、[step-07](../tools/step-07-子代理模型与引导取证.mjs)。step-07 必须显式提供 `--session`+`--sessions-dir`（会话在宿主数据根时加 `--host-root`，取直接 child 加 `--discover-children`）和 `PLANNER_PROMPT_SUFFIX`（空串也算显式提供），`SESSION_ID` 只作报告/输出字段；request/header 是 attempted（尝试路由），assistant/message source 才是 actual provenance（实际来源）。

## 五、A/C/M 投影、P2-2 与配置默认链

- A=anchoredBootstrap、C=creativeMode、M=`native|ptc`（`both` 随 0.2.1 二值契约退出，旧值归一化回落 native）是模型可见投影维度；F 是首个 `tool/call` 前，L 是其后。C=0 隐藏模型可见 Cordis 工具/创造 skill，但不改变 registry binding、`tools.restrict` 或 `tools/pre-execute` 安全边界。
- Pure PTC 顶层仍只保留 `run_code`；装配隔离矩阵只观察 `assembly.sections`：A=1/F/main-planner/ptc 的 F 段恰为 persona 与插件手写 `tool:read`，L 段回宿主 SDK 原文（宿主 `tools:ptc-only` 段自 HP 分支起已停用透传，段名仅用于 Pure-PTC 识别与 F 段 text 覆盖，F/L 投影均不出现该段）；native 轮的实机观察面看 `header.tools`，且无 `tool:read` section。实机 system 正文只从 `system/message` 且 `source.kind=system-prompt` 观察，不用 `header.system` 冒充。详细时序和两轮矩阵（80 格）见 [step-04](../tools/step-04-路由与写闸门.mjs) 与[实机流程](ai-实机闸门测试流程.md)。
- P2-2 cache 只存在单个 apply 闭包内，以 agent 对象为 WeakMap key；命中键包含完整 renderer-visible（渲染器可见）schema 指纹、原始 language、renderer 函数身份。并发同 key 合并，reject/空文本降级/过期 promise 不缓存；dispose、新 Agent、新 apply、重启都隔离边界。完整 L 文本逐字相等且 renderer 调用计数为 1 是硬门槛。
- 默认链是 `agent.cordis.yml` 十一项设置叶值 → `generate-runtime-defaults.mjs#runtimeDefaultsFromTemplate/renderRuntimeDefaults` → 生成的 `DEFAULT_SETTINGS` 与兼容别名，再由 settings contract、Config/fallback、快照和同步消费者统一消费；运行时不解析作者 YAML。生成器先 parse/validate（解析/校验）全部输入，再渲染 runtime、纯 definition、角色 definition 与 client 标记区块；坏模板、`--check`、prepack 失败时保留 last-known-good（上次已知良好版本），生成物禁止手改。
- 作者 sourceLocator、合同 validator/合法性规则、UI metadata 是三类不同来源：前者只用于生成默认值，`SETTING_DEFINITIONS` 手工维护校验与界面元数据，`createDefaultSettings()` 每次返回十一键新对象；`client.js` 只由生成器在成对标记区块内派生控件元数据，不带默认值/validator/宿主对象。
- 11 项 volatile Config 共用 `dsh-extra-plan-settings` 唯一全局行，旧 `extra-plan-preset-sync` / `preset-extra-plan` 只作 raw patch 非破坏读取；`./preset-sync` 与 locale exports 已退役，settings.js 仍内部相对调用 `mountPresetSync`。两项宿主设置与合法 gateWords 由全局快照派生到内存 definition。当前显式非法 gateWords 必须在 resolve/restate/sync/API 入口抛错或失败回执，零 edit、零自动替换；旧非法值只诊断并跳过，合法整组显式修复单独放行。PUT 只 edit 唯一全局行并保留其它字段；前端保存一次带 revision 的十一项 mutate，readonly/false/throw/恢复失败均不显示成功。纯 definition 的 17 条本体与 group/isolate/!!js 由官方 AgentPreset adapter 直接复用。设置表单仅经 detail.section 渲染于 bundle 详情页行列表之后（自绘标题），不注册 bundle.config、row.config、settings.plugins.tab 或 plugins.item；若本包 bundle.config 槽被任何一方注册条目则 detail.section 让位保持唯一表单。
- 生成迁移顺序固定为“先生成并校验新导出，再切换消费者”；默认仓库路径包含七个输出，自定义 source/output 默认不生成仓库 client，只有显式 client source/output 才启用。发布采用同目录暂存、备份、顺序 rename 与逆序有限回滚，失败不保留新版本；恢复失败必须保留首错、阶段、残留与诊断。

## 六、session 生命周期与 usage 账本

- 运行时状态按 `sessionId` 分桶；rootCall、job_output、tool-jobs 通知、usage cursor 不能跨会话清理。锚点变化只清当前 session 的临时桶。通知消费合同是 **agent/inbox/claimed 同步主入口 + durable snapshot fallback + 统一幂等 helper**：claimed 直接取 `payload.message`，在消息尚未进入 `snapshotEvents` 时先解锁；`tools/pre-execute` 只扫描 durable `user/message` 的 `event.data` 作恢复、重放与旧日志兜底，两入口都调用 `consumeToolJobsNotice(agent, message)`。helper 严格校验非空稳定 `message.id`、`source.kind/form` 与 `/background job (\S+)/`；session 内 consumed 的身份是通知实例 `message.id`，同一 id 跨 claimed/durable 只消费一次，不同 id 即使复用同一 jobId 也代表新 incarnation。首次有效通知先按 session 精确删除 `jobOutputCallCounters` 的该 jobId，再清 `pollGuardCounters` 整表，双解锁完成后才把 notice id 写入 consumed；jobId 只用于这次当前 session 的单键删除，不能作为去重键。用户/agent-message 锚点仍清 jobOutput、pollGuard、subCall 临时桶，但 notice-id Set 跨锚点保留，直到 `agent/disposed` 的 `disposeSession` 按 session 回收；这些 Map 是可重建缓存，不是 job running/terminal 状态合同，resume/replay 仍以 durable user/message 为兜底。
- `agent/disposed` 是 emit/void，宿主不等待异步 Promise；因此必须在监听器同步路径先做 final fold，再处理 pending probe，再按 sessionId 回收 Map、notice、rootCall 与 cursor。每次 `agent/pre-step` 在 await next 前捕获本次 payload.agent，预算、suffix、sessionEvents 不读取 apply 级共享 Agent。重复 disposed 幂等，其它 session 不受影响。
- usage 增量以宿主 `session.seq` 水位配合 `snapshotEvents(from,to)` 读取新增区间；水位不变直接返回，日志截断或首次折叠才回退全量，`seq` 去重后 append 成功才推进 cursor。writer 的 cursor 读取、事件折叠、ledger append 与 cursor 写回在同一把跨进程锁内；锁等待约 1 秒超时静默返回 `delayed`，ledger、内存水位和 cursor 均不推进，后续 fold 补记。生产热路径不每趟同时跑全量和增量；全量对拍只在验收回归运行。水位恢复只在 cursor 表不可用时发生：内存与表均无该会话项，且表读取降级（损坏、解析失败或根值非对象）或表整体为空（ENOENT、0 字节/纯空白）时，fold 扫描 ledger 取该会话最大 `seq` 作去重基线并把 `index` 置 -1，因而走全量快照、仍按 `seq` 去重，历史行不重复追加；表完好且非空、只是没有该会话记录时视为新会话，不扫描 ledger。该判据不覆盖「表可解析且非空、仅缺该会话项」的手工编辑形态，此时同样按新会话处理，其 ledger 历史行会被再次追加。
- 当前成功消息账本独立写入 `ledger-v2.jsonl`，每行固定 `schemaVersion: 2`，来源仅为 `assistant/message` 的 usage；身份同时记录 `rootSessionId`、自身 `sessionId`、`parentSessionId`、`agentPreset`、`delegationDepth`、精确 `role` 与消息 `model/provider`。主会话 root 为自身；一级 child 的 root 直接取 `parentSessionId`，不依赖父 Agent 在线；更深层沿 registry 最多 8 层求 root，断链或循环仍生成合法行并将 `rootSessionId` 置空；只有非法 context 拒绝落账。`rootSessionId` 与 `agentPreset` 的空字符串是合法值，不能据此拒绝。
- V2 只落四桶 `inputTokens`、`cacheReadTokens`、`cacheWriteTokens`、`outputTokens`，命中=cacheRead，未命中=input+cacheWrite，输出=output，总量=四桶和；`reasoningTokens` 不落盘、不统计，`attempt` 不参与统计。writer 输出固定15键并负责 active append 与 cursor 推进；生产 writer 的 active/cursor 合同不变，归档写事务不由 writer 承担。统计 CLI 仅做只读统计，无严格归档校验；默认采用宽松解析：坏 JSON、非 V2 行、说明行分别按 `badJsonLines`、`skippedNonV2Objects`、`noticeLines` 记录并跳过；不执行 `archiveLedger` 严格校验；旧 `strict: true` 只显式报 `strict-parser-removed`，`--archive` 在任何 IO 前拒绝并报 `usage-removed`。严格解析、唯一性、归档汇总、序列化与事务写入只在 `lib/usage-archive.js` 的公开 `archiveLedger`/`startupArchive`；归档测试只走这两个真实公开 API，不借统计 `parse`。完整九字段身份、累计 `seq` 水位和 `covered` 去重语义保留；维护 Host 数据取证只读，Host `--archive`/清理 `--apply` 提前拒绝且零写，W 模式保留统计；输出与归档聚合均不生成调用计数列，旧 V1 `ledger.jsonl` 与旧 cursor 只读留存，零自动迁移、改写或清空；新增发布去重不等于删除历史，合法历史仍保留，A 只核对新增发布。
- cursor 文件 ENOENT 或 0 字节/纯空白按空表自愈（0 字节不可能存在任何 session 基准，一次性提示后按空表处理、下次写入重建）；损坏、解析失败或根值非对象时首次告警并保留原始字节，避免覆盖其它 session 的去重基准；cursor 项只接受 `{seq,index}`，旧数字形状视为无效。四桶全零的事件不写行；非法 context 不推进 cursor，合法空 `rootSessionId`/`agentPreset` 不属于非法；writer 锁忙或 timeout 静默返回 `delayed` 且不推进 cursor，后续 fold 补记；接管失败时才返回 stale-lock 可见诊断，由维护者核实 owner 后显式维护。
- 共享锁合同固定为 active 路径加 `.lock`，即 `ledger-v2.jsonl.lock`；锁文件 JSON 记录 owner PID、唯一 token 与创建时间。`acquireUsageLedgerLock` 只做原子独占创建和有界短等，并返回 owner 诊断；活 PID 锁绝不强删，死 PID 锁由 acquireUsageLedgerLock 原子接管（rename 到 .stale- 随机名 + token 校验，不匹配立即还原；接管成功继续取锁，接管失败才返回 stale-lock 并告警），接管失败时 canonical lock 保持不变。接管失败后，writer 每实例对 stale-lock 最多发出一次可见告警，维护者必须先核实 owner 后显式维护，不手动执行接管或删除；`releaseUsageLedgerLock` 仅在 token 匹配时释放自己的锁，失败必须显式返回失败状态。
- 生产 writer 只负责 active append 与 cursor 推进；维护 `step-99-用量统计.mjs` 的 Host 统计必须有显式 `--host-root` 与精确目标，稳定观察最多 2 次；锁忙或内容变化记 `INCOMPLETE`，只把工作快照/临时文件落 W，不称 Host 统计锁定或原子一致。维护 CLI step-99 仅做统计：手工归档已移除，`--archive` 报 `usage-removed` 且在任何 IO 前拒绝，归档不由 CLI 执行；不提供手工清理/归档；清理 `--apply` 在 H IO 前拒绝且零 Host 写，W 只承载统计所需的快照与临时输出。
- 插件启动归档（公开 `startupArchive`）：settings 行 apply 时仅对 H 根下默认 usage-ledger/ledger-v2.jsonl 执行一次合并归档（3 秒预算、失败逆序回滚、成功清空 active），锁忙跳过、失败写 usage-ledger/archive-failed.log 且不阻断 DSH 启动；自定义 usageLedger.path 的账本不在启动归档范围。

## 当前安全结论索引

| 结论 | 当前落点 |
|:--|:--|
| 拒绝不能造成状态残留清除；取消必须清四字段 | 根入口状态机；step-04 DZ 对照 |
| 组拒绝无工具副作用；参数不可解析不能绕过状态闸门 | `run-code-static.js`；step-00/04 |
| 方案/验收必须成对、失败按本次有限清理并主动重试 | save 四模块；step-06 |
| 模型路由必须真实验证或可靠 fallback（回退） | `model-routing.js`；流程 ⑩/step-00 |
| 展示隐藏不是 runtime 安全隔离；P2-2 cache 不跨 Agent | `assembly-presentation.js`、`sdk-text-cache.js`；step-04 |
| usage final fold 必须同步且按 session 隔离 | 根入口/`agent-runtime.js`；step-04 P4 |
| job_kill 仅直行放行 | `mainGateReason`；step-04 |
| send_message 主会话向 running 目标拒绝 | `mainGateReason`（gateCtx.getAgents）；step-04 |
| job_list/list_agents 同锚点防轮询 | `pollGuardGateReason`/`recordPollGuardCall`；step-04 |
| 通知解锁双动作（job_output 单键+pollGuard 清表） | apply 的 `agent/inbox/claimed` 同步主入口 + `tools/pre-execute` durable snapshot fallback，共用 `consumeToolJobsNotice`；按 session 内 `message.id` 幂等，jobId 仅删除当前 job_output 键；notice-id Set 跨锚点保留、dispose 回收；step-04 TJ/PG/CN |
| 宿主变更先看当前台账，历史快照不作当前事实 | [ai-宿主耦合台账](ai-宿主耦合台账.md)；[宿主历史归档](ai-宿主耦合历史归档.md) |

机制变化时先核对源码真源与对应回归，再同步本文件；旧事故和批次不要重新写入当前合同。

## 七、局部安全合同指针

- `lib/shell-mutation.js` 的 pwsh/bash 识别是位置敏感的写边界：段首裸写词、语法级写形态、连续剥离 sudo/env/nohup/command wrapper、带值 wrapper 选项（含 sudo 的 `-p`/`--prompt`；`--prompt=value` 是单 token）与 NAME=VALUE 环境赋值、嵌套 shell 与重定向例外必须以源码纯函数为准，不能用文档替代；`mutationTextEvidence` 返回 null 或 `{rule,value}`，`pwshMutationEvidence`/`bashMutationEvidence` 与旧布尔 matcher 同源，拒因只追加规则名及白名单 bare 命中词，不回显命令、路径或秘密。PowerShell 侧赋值右值（$var =、[type]$var =、粘连 $var=）之后、return 之后、$()/@(/( 子表达式入口与块头关键字带括号粘连（foreach($i in …)）的块体均为命令位，裸写动词仍只在命令位命中。
- 当前 bash 边界：静态 `echo "x; then rm"` 引号参数中的分号与 `rm` 不形成命令，`bashMutationEvidence` 返回 `null`、`bashMutationMatches` 返回 `false`；引号外 `rm`、`bash -c` 内层、双引号 `$()` 与外部重定向仍按实际可执行形态判写。这不是完整 shell 解析器或普遍安全证明，真实工具权限与其它闸门仍独立生效；以 `splitShellSegments`、`shellWords`、`shellSyntaxText`、`executableShellSubexpressions`、`mutationTextEvidence` 及 step-04 的 H3/H3Q 回归为准。
- `lib/shell-mutation.js` 的 PWSH_MUTATION 识别 `1-6` 流号与 `*>`/`*>>` 重定向，保留 `2>&1`、`1>&2`、`*>&1` 等 stream→stream 合并例外；裸 >/>> 按左邻语境判定：引号内文本不判写；左邻 =- 复合序列（=>、->）不判写——豁免集由 =<>!- 收窄为 =- 是为语义准确（< 与 ! 不是重定向运算符），不改变 >= 的既有判写行为；右邻 & 流合并目标不判写；其余形态一律判写——PowerShell 中裸 >/>> 无条件为重定向运算符（比较须用 -gt/-ge），> 右邻纯数字如 if ($i > 4)、$i > 4、for ($i = 0; $i > 0; $i--) 都会把输出写为文件名 4/0；`>=` 序列词法上即为重定向、本实现一直判写（本次补回归样本锁定）；$a <= 5 与 $a != 5 不含 > 字符、不进入重定向判定，且是语法错误不落盘，保持放行；圆括号深度不参与——`$(Get-Date > f.txt)`、`@(Get-Item a > b)` 等子表达式内重定向仍判写。已知边界：引号内、=>/-> 序列与流合并豁免之外不存在只读的裸 > 用法。BASH_MUTATION 原合同不变。
- `lib/sdk-text-cache.js` 只做 agent-keyed、非 session 的 JSON-like 指纹缓存；字段/数组顺序、getter/cycle 失败、dispose 与迟到 Promise 都是局部合同。
- QQBot 自愈只处理拥有本插件且满足双锚点的 profile；迁移写前备份、写后 YAML 校验失败恢复，链接仅在 ENOENT 时建立，实体/异链保留，整体不阻断。当前机制由 `plugins/dsh-extra-plan-qqbot/lib/heal.js` 与对应 step-01 夹具共同锁定。

## 八、context-gate：F 写闸门与 projected catalog 去重

- 当 `anchoredBootstrap=true`、当前 Session 为 F（尚无任意 durable `tool/call`）、角色为 main/planner 时，现有 `agent/pre-step` prepend hook 在 `await next()` 得到最终 decision 后，按 source.kind 精确过滤整条 `agent-instructions` 与 `skill-catalog` 消息；不按正文、role 或未知 source 推断。A=0、executor/reviewer/probe 不新增 gate。
- 首个字符串 `tool/call` 或数组包含 `tool/call` 的 durable 事件结束 F；L 不 replay F，宿主 agent-instructions/tool-skill 自然重组最新 baseline/catalog。assistant-only、宿主内部扫描/读取不晋升 L；Session/父子历史各自隔离。
- 过滤是 source gate 的关键边界，先于现有 C 投影与目录去重；关键 gate/phase 失败走宿主错误路径，不把未过滤 decision 发送出去。
- `projectSkillCatalogDecision` 只处理 `source.kind=skill-catalog` 且 entries 合法的消息；其它 source 即使带 entries 也保持对象和正文不变。`dedupeProjectedContextDecision` 分别按 source.kind 读取当前 agent `session.deriveMessages()` 最后一个合法可见签名：skill-catalog 只比较有序 `[name,description]`，agent-instructions 只比较非空 `content` 的 JSON 形状并忽略动态 id/seq/role/source；空 catalog 合法，坏形状、变化、移出 surface 后重现必须保留。无共享缓存、无 sent/released 标志，不比较父 Session。
- 纯函数 `filterBootstrapContextDecision` 与 `dedupeProjectedContextDecision` 不读文件/环境/registry/Inbox，不持有 agent/global 状态；冻结输入可用，无变化透传原对象，未知 source 原样保留。

## 九、save_plan 并行派遣与分组验收合同

- `save_plan` 仍是成对的方案/验收工件。两份正文必须各自携带职责说明；数字任务规模由实际任务数决定，不由当前批次的任务、检查、组或文件数量决定。工件本身要能恢复派遣、验收和交接，不依赖父会话看到 planner render 或本仓维护文档。
- 数字任务声明主/关联文件的唯一所有权、真实实现依赖和执行组；文件重叠、未说明的共享输出或不确定的物理别名不能被文本合同宣称为安全并行。收尾文件与数字任务文件分开计入覆盖，全局验收只是引用同轮检查，不是第二套调度。
- 新合同校验分两层：纯文本、关系和摘要先于 `cwd`、`base` 与全部源/证据 IO；文本合法后才在当前源工作区做只读核实，并且早于 `base` 构造、目录/临时文件和发布。每个主文件、关联文件和带文件收尾均绑定文件操作与 `M` 点；计划与验收按（任务或 `closure`、文件、M点）身份键及点集合精确对应。
- 方案中的修改位置和唯一原文锚点是源的旧基线，验收定位是未来修改后的符号、结构或行为，两者分离；行漂移按目标/锚点确认，证据记录实际新行号，不回写方案追坐标。
- 路径先用 `canonicalRealpath` 原生解析，再以 `relative`/分隔符边界判断是否包含于真实工作区；原生解析不可用即拒绝。主文件、关联文件和生成来源的计划目标必须在真实工作区内；既有证据报告引用仍沿用原绝对/相对只读合同，不夸大为所有读文件均禁止工作区外。
- 空文件以及新建、删除、生成使用受控例外：不伪填旧行号；生成只核实声明的工作区来源、命令和产物，不执行命令。工具不执行生成命令、不调度代理、不限制源码 `read` 窗口；未做真实同口径测量不宣称 token 已下降。
- 执行组由其成员任务的依赖并集折叠：只保留组外依赖，`groupDependsOn` 为空时 `initialState=eligible`，否则为 `waiting`。这只是静态初始资格，不是 ready/running/done 的实时状态，也不启动调度器；同组保留内部拓扑顺序且不可拆派，但可与资源独立的其它组并行。一名执行者可以领取多个组，组数不等于人数。
- 独占资源是稳定的声明边界，用来标识共享输出目录、缓存或固定环境等非修改文件冲突；同资源的数字任务应归并执行组，不同验收组声明同资源应合并。资源声明不能证明隐藏共享状态、物理别名、命令无副作用或代理实际遵守范围。
- 检查定义有唯一身份，可由多个任务、收尾或全局引用；完全相同的取证方式、工作目录和按序检查行不得另建重复 ID。公共检查只由一个领取者在同一冻结源与条件下运行，其他引用复用原始结果；执行组 G 与验收组 R 是独立命名空间，不要求对应。
- 只读复核由 reviewer 在只读权限内完成；执行取证由已获批准的执行者或直行主会话运行，reviewer 只读原始 stdout/stderr、退出码和源文件后独立判定。取证方式是职责声明，不自动放宽 route/approved、文件写入或命令安全权限。
- 结构、关系、交叉引用和摘要边界必须早于 context/base、证据 IO 与单次发布拒绝；合法正文逐字保存，structured output 仍只有 `paths`；`formatSavePlanSummary` 仍只生成内部确定性 summary 并受 24000 上限约束，`output.render` 不读取原始 plan/checklist、不重建 summary，只把两个返回路径经 String 转换后用单个换行符放入唯一 text ContentBlock。失败不跨调用恢复旧事务，AI 必须根据首错/阶段主动重试；事务发布、错误路径和 PASS/FAIL/SKIP/HUMAN/NOT-RUN 分类不变。任何源文件变化都会使受影响任务、依赖消费者和共享检查的旧证据失效；无法证明无影响时按固定顺序复验。main 最后汇总任务、检查、收尾和全局覆盖，漏项、矛盾或过期证据不得宣布通过。
