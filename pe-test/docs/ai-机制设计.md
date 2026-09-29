# 核心机制与设计意图（AI 改核心前读）

> 本文回答“为什么这样设计、当前不变量是什么”。源码注释是实现详版；流程交接读 [ai-流程备查](ai-流程备查.md)，维护操作读 [ai-维护手册](ai-维护手册.md)。历史事故、退役实现和日期化批次见[历史归档](ai-历史故障与机制归档.md)，不作当前运行真源。

## 一、四级机械锚点与 gateWords

- 状态不是四次提问，而是事件流推导的 `{ route, purpose, clarified, approved, channelBroken }`。主会话顺序固定为 `route → purpose → clarify`；ordinary 探查/澄清可在路由前发生。
- route 规划词后，第一个 purpose ask 必须是当前 `config.gateWords` 的二选一；只有 `route=plan` 且目的已定后，澄清答复才置 `clarified=true`。`save_probe` 与 `subagent_plan` 需要目的和澄清，执行类委派只认独立的 `approved` 锚点。
- 闸门拒绝 `kind:'denied'` 不清除阶段状态，便于按拒绝文案修正后重提；用户取消/中断清 `route/purpose/clarified/approved`；通道级故障只置 `channelBroken` 逃生位；新 user/message 切断旧事件窗。
- `config.gateWords` 在 [agent.cordis.yml](../../plugins/dsh-extra-plan/assets/presets/extra-plan/agent.cordis.yml) 中是唯一人工值源。[gate-words.js](../../plugins/dsh-extra-plan/lib/gate-words.js) 只保存字段元数据、整组严格校验、运行时派生和七个 prompt variable；apply 先校验再产生工具/监听器/服务副作用。
- 所有 match、deny 文案和状态推导都消费同一 `gateRuntime`；推荐后缀只做白名单归一，推进状态必须与当前词精确相等，旧词不会复活旧事件。

## 二、run_code 组判定与 planner 预算

- `run_code` 是批量调用边界，静态拆解出的成员逐个复用直呼闸门；任一成员拒绝则整条 run_code 拒绝，成员不执行、不落地。动态访问、无法解析参数和嵌套深度等边界按安全方向交给运行时瀑布兜底。
- 多调用容错闸门只认“一个 try 块一个调用点、后接 catch”；单调用豁免，嵌套调用展平。主会话/planner/只读子代理受此检查，执行者保持既有豁免；ask 的返回链另有保守静态证明。
- planner 预算按最近主会话消息或续轮转达的锚点计数；run_code 容器计一次，直呼工具按一次计，被拒调用不烧预算。提醒和耗尽文案由 [planner-budget.js](../../plugins/dsh-extra-plan/lib/planner-budget.js) 负责，耗尽后只能按流程申请继续探查。
- 预算与 `save_probe` 的参数限制是两套合同：预算检查由 planner 计数实现，`PROBE_LIMITS` 的字段与数值唯一来自 [save-contract.js](../../plugins/dsh-extra-plan/lib/save-contract.js)，校验由 [save-probe-validation.js](../../plugins/dsh-extra-plan/lib/save-probe-validation.js) 执行；step-00/step-06 是回归入口，文档不复制完整值表。

## 三、规划工件与原子落盘

- `save_plan` 必须成对写入方案与验收文件，主会话侧是任意路由态可用的受限规划工件；内容、目录和文件名合同不因路由放宽。`save_probe` 只在主会话/已认领探查者层可用，规划子代理不得委派探查者。
- [save-persistence.js](../../plugins/dsh-extra-plan/lib/save-persistence.js) 的当前顺序是 tmp → journal → 逐项 rename → 确认目标 → 清 journal。pre-journal 失败按条件清理；post-journal 失败保留 journal 与现场；恢复只接受当前非空 `entries` 形状，全部目标确认就位后才清 journal。
- 双写、单写共用阶段感知提交；不承诺跨进程 fsync。工具 schema/输出/渲染/execute 在 [save-tool-factories.js](../../plugins/dsh-extra-plan/lib/save-tool-factories.js)，路径基准取会话 cwd；限制与证据引用合同不能由入口文档另写第二份。

## 四、模型路由与真实探针

- planner 只使用 `plannerModel`；executor、reviewer、probe、workflow/ralph worker 等非 planner child 只使用 `otherAgentModel`。已显式指定的直接父 provider/model 优先，不被默认模型覆盖。
- `crossProviderPlannerModel=false/缺失/非法` 走旧的单 provider advisory 路径；严格开启时枚举 provider，只对精确命中的模型做真实 OK probe，所有候选完成后按发起顺序收集、排序，再返回最终路由；候选失败后必须验证顶层主会话 fallback。
- probe 是有界并发、独立超时/AbortController 的真实调用，可能有网络、额度与计费副作用；它不是目录命中，也不是 `resolveCallConfig` 的替代。成功与失败 promise 均按 Agent 隔离缓存，不跨角色/Agent 共享。
- 唯一详版与取证入口：[model-routing.js](../../plugins/dsh-extra-plan/lib/model-routing.js)、[流程备查](ai-流程备查.md#⑩-规划子代理)、[step-07](../tools/step-07-子代理模型与引导取证.mjs)。step-07 必须显式提供 `SESSION_ID` 和 `PLANNER_PROMPT_SUFFIX`，request/header 是 attempted，assistant/message source 才是 actual provenance。

## 五、A/C/M 投影、P2-2 与配置默认链

- A=anchoredBootstrap、C=creativeMode、M=`native|ptc|both` 是模型可见投影维度；F 是首个 `tool/call` 前，L 是其后。C=0 隐藏模型可见 Cordis 工具/创造 skill，但不改变 registry binding、`tools.restrict` 或 `tools/pre-execute` 安全边界。
- Pure PTC 顶层仍只保留 `run_code`；A=1/F/main-planner/ptc 的两段是预设引导和插件手写 `tool:read`，L 段回宿主原文。native/both 的 HN/HB 只保留引导段与 read。详细时序和 120 格回归见 [step-04](../tools/step-04-路由与写闸门.mjs) 与[实机流程](ai-实机闸门测试流程.md)。
- P2-2 cache 只存在单个 apply 闭包内，以 agent 对象为 WeakMap key；命中键包含完整 renderer-visible schema 指纹、原始 language、renderer 函数身份。并发同 key 合并，reject/空文本降级/过期 promise 不缓存；dispose、新 Agent、新 apply、重启都隔离边界。完整 L 文本逐字相等且 renderer 调用计数为 1 是硬门槛。
- 默认链是 `agent.cordis.yml` 叶值 → `generate-runtime-defaults.mjs` 生成常量/声明行产物 → 运行时 fallback；运行时不解析 YAML。生成器先 parse/validate 再替换，坏模板、`--check`、prepack 失败时保留 last-known-good；生成物禁止手改。
- 设置页的 8 项 UI 设置与 2 项宿主行设置共用 settings 权威值，声明行只承载宿主行投影；PUT 只做投影，GET 依次读取权威值、投影、默认值。设置表单、投影与默认链由 `lib/settings.js`、`lib/client.js`、`lib/preset-settings.js` 维护。

## 六、session 生命周期与 usage 账本

- 运行时状态按 `sessionId` 分桶；rootCall、job_output、tool-jobs 通知、usage cursor 不能跨会话清理。锚点变化只清当前 session 的临时桶。pollGuardCounters（job_list/list_agents 调用计数）按 sessionId 分桶；锚点变化与 tool-jobs 完成通知双通道清整表；通知 consumed 标记与 job_output 跟踪命中解耦。
- `agent/disposed` 是 emit/void，宿主不等待异步 Promise；因此必须在监听器同步路径先做 final fold，再处理 pending probe，再按 sessionId 回收 Map、notice、rootCall 与 cursor。重复 disposed 幂等，其它 session 不受影响。
- usage 增量以宿主 `session.seq` 水位配合 `snapshotEvents(from,to)` 读取新增区间；水位不变直接返回，日志截断或首次折叠才回退全量，`seq` 去重后 append 成功才推进 cursor。生产热路径不每趟同时跑全量和增量；全量对拍只在验收回归运行。
- cursor 文件 ENOENT 按空表；损坏、解析失败或根值非对象时首次告警并保留原始字节，避免覆盖其它 session 的去重基准。账本字段缺失按空值/零兼容，五类计数全零的事件不写行。

## 当前安全结论索引

| 结论 | 当前落点 |
|:--|:--|
| 拒绝不能造成状态残留清除；取消必须清四字段 | 根入口状态机；step-04 DZ 对照 |
| 组拒绝无工具副作用；参数不可解析不能绕过状态闸门 | `run-code-static.js`；step-00/04 |
| 方案/验收必须成对、journal 不完整不清理 | save 四模块；step-06 |
| 模型路由必须真实验证或可靠 fallback | `model-routing.js`；流程 ⑩-1/step-00 |
| 展示隐藏不是 runtime 安全隔离；P2-2 cache 不跨 Agent | `assembly-presentation.js`、`sdk-text-cache.js`；step-04 |
| usage final fold 必须同步且按 session 隔离 | 根入口/`agent-runtime.js`；step-04 P4 |
| job_kill 仅直行放行 | `mainGateReason`；step-04 |
| send_message 主会话向 running 目标拒绝 | `mainGateReason`（gateCtx.getAgents）；step-04 |
| job_list/list_agents 同锚点防轮询 | `pollGuardGateReason`/`recordPollGuardCall`；step-04 |
| 通知解锁双动作（job_output 单键+pollGuard 清表） | apply 锚点/通知扫描；step-04 TJ/PG |
| 宿主变更先看当前台账，历史快照不作当前事实 | [ai-宿主耦合台账](ai-宿主耦合台账.md)；[宿主历史归档](ai-宿主耦合历史归档.md) |

机制变化时先核对源码真源与对应回归，再同步本文件；旧事故和批次不要重新写入当前合同。
