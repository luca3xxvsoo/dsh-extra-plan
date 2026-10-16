# 核心机制与设计意图（AI 改核心前读）

> 本文回答“为什么这样设计、当前不变量是什么”。源码注释是实现详版；流程交接读 [ai-流程备查](ai-流程备查.md)，维护操作读 [ai-维护手册](ai-维护手册.md)。历史事故、退役实现和日期化批次见[历史归档](ai-历史故障与机制归档.md)，不作当前运行真源。

## 一、四级机械锚点与 gateWords

- 状态不是四次提问，而是事件流推导的 `{ route, purpose, clarified, approved, channelBroken }`。主会话顺序固定为 `route → purpose → clarify`；ordinary（普通）探查/澄清可在路由前发生。
- route 规划词后，第一个 purpose ask（目的提问）必须是当前 `config.gateWords` 的二选一；只有 `route=plan` 且目的已定后，澄清答复才置 `clarified=true`。`save_probe` 与 `subagent_plan` 需要目的和澄清，执行类委派只认独立的 `approved` 锚点。
- 闸门拒绝 `kind:'denied'` 不清除阶段状态，便于按拒绝文案修正后重提；用户取消/中断清 `route/purpose/clarified/approved`；通道级故障只置 `channelBroken` 逃生位；新 user/message 切断旧事件窗。
- `config.gateWords` 在 [agent.cordis.yml](../../plugins/dsh-extra-plan/assets/presets/extra-plan/agent.cordis.yml) 中是唯一人工值源。[gate-words.js](../../plugins/dsh-extra-plan/lib/gate-words.js) 只保存字段元数据、整组严格校验、运行时派生和七个 prompt variable；apply 先校验再产生工具/监听器/服务副作用。
- 所有 match、deny 文案和状态推导都消费同一 `gateRuntime`；推荐后缀只做白名单归一，推进状态必须与当前词精确相等，旧词不会复活旧事件。

## 二、run_code 组判定与 planner 预算

- `run_code` 是批量调用边界，静态拆解出的成员逐个复用直呼闸门；任一成员拒绝则整条 run_code 拒绝，成员不执行、不落地。参数先走 JSON.parse 快路径，再走无 eval/Function/vm/YAML 的安全 literal 子集（对象/数组、标识符或引号键、单/双引号、布尔/null、有限数字、尾逗号）；变量、spread、computed、getter/setter/方法、调用/成员/模板/正则、重复键和污染键均保留 argsText 交运行时瀑布兜底。
- 多调用容错闸门只认“一个 try 块一个调用点、后接 catch”；单调用豁免，嵌套 run_code 与 decompose 共用安全 literal 入口。主会话/planner/只读子代理受此检查，执行者保持既有豁免；ask 的返回链另有保守静态证明。动态 tools[...] 访问（包括 const 绑定、参数遮蔽、注释伪绑定、字符串拼接、方括号拼接和转义名）统一 fail-closed；只有直接 tools.ask_user_question(args) 的参数可动态，直接 return-await 语义不变。
- planner 预算按最近主会话消息或续轮转达的锚点计数；run_code 容器计一次，直呼工具按一次计，被拒调用不烧预算。提醒和耗尽文案由 [planner-budget.js](../../plugins/dsh-extra-plan/lib/planner-budget.js) 负责，耗尽后只能按流程申请继续探查。
- 预算与 `save_probe` 的参数限制是两套合同：预算检查由 planner 计数实现，`PROBE_LIMITS` 的字段与数值唯一来自 [save-contract.js](../../plugins/dsh-extra-plan/lib/save-contract.js)，校验由 [save-probe-validation.js](../../plugins/dsh-extra-plan/lib/save-probe-validation.js) 执行；step-00/step-06 是回归入口，文档不复制完整值表。

## 三、规划工件与原子落盘

- `save_plan` 必须成对写入方案与验收文件，主会话侧是任意路由态可用的受限规划工件；内容、目录和文件名合同不因路由放宽。`save_probe` 只在主会话/已认领探查者层可用，规划子代理不得委派探查者。
- [save-persistence.js](../../plugins/dsh-extra-plan/lib/save-persistence.js) 的当前顺序是 tmp → journal → 逐项 rename → 确认目标 → 清 journal。pre-journal 失败按条件清理；post-journal 失败保留 journal 与现场；恢复只接受当前非空 `entries` 形状，全部目标确认就位后才清 journal。
- 双写、单写共用阶段感知提交；不承诺跨进程 fsync。工具 schema/输出/渲染/execute 在 [save-tool-factories.js](../../plugins/dsh-extra-plan/lib/save-tool-factories.js)，路径基准取会话 cwd；限制与证据引用合同不能由入口文档另写第二份。

## 四、模型路由与真实探针

- planner 只使用 `plannerModel`；executor、reviewer、probe、workflow/ralph worker 等非 planner child 只使用 `otherAgentModel`。已显式指定的直接父 provider/model 优先，不被默认模型覆盖。
- `crossProviderPlannerModel=false/缺失/非法` 走旧的单 provider advisory（建议）路径；严格开启时枚举 provider，只对精确命中的模型做真实 OK probe，所有候选完成后按发起顺序收集、排序，再返回最终路由；候选失败后必须验证顶层主会话 fallback（回退）。
- probe 是有界并发、独立超时/AbortController 的真实调用，可能有网络、额度与计费副作用；它不是目录命中，也不是 `resolveCallConfig` 的替代。成功与失败 promise 均按 Agent 隔离缓存，不跨角色/Agent 共享。
- 唯一详版与取证入口：[model-routing.js](../../plugins/dsh-extra-plan/lib/model-routing.js)、[流程备查](ai-流程备查.md#⑩-规划子代理)、[step-07](../tools/step-07-子代理模型与引导取证.mjs)。step-07 必须显式提供 `SESSION_ID` 和 `PLANNER_PROMPT_SUFFIX`，request/header 是 attempted（尝试路由），assistant/message source 才是 actual provenance（实际来源）。

## 五、A/C/M 投影、P2-2 与配置默认链

- A=anchoredBootstrap、C=creativeMode、M=`native|ptc|both` 是模型可见投影维度；F 是首个 `tool/call` 前，L 是其后。C=0 隐藏模型可见 Cordis 工具/创造 skill，但不改变 registry binding、`tools.restrict` 或 `tools/pre-execute` 安全边界。
- Pure PTC 顶层仍只保留 `run_code`；A=1/F/main-planner/ptc 的两段是预设引导和插件手写 `tool:read`，L 段回宿主原文。native/both 的 HN/HB 只保留引导段与 read。详细时序和 120 格回归见 [step-04](../tools/step-04-路由与写闸门.mjs) 与[实机流程](ai-实机闸门测试流程.md)。
- P2-2 cache 只存在单个 apply 闭包内，以 agent 对象为 WeakMap key；命中键包含完整 renderer-visible（渲染器可见）schema 指纹、原始 language、renderer 函数身份。并发同 key 合并，reject/空文本降级/过期 promise 不缓存；dispose、新 Agent、新 apply、重启都隔离边界。完整 L 文本逐字相等且 renderer 调用计数为 1 是硬门槛。
- 默认链是 `agent.cordis.yml` 叶值 → `generate-runtime-defaults.mjs` 生成常量与纯 `preset-definition.generated.yml` → 运行时 fallback/官方 adapter；运行时不解析作者 YAML。生成器先 parse/validate（解析/校验）再替换，坏模板、`--check`、prepack 失败时保留 last-known-good（上次已知良好版本）；生成物禁止手改。
- 10 项 volatile Config 共用 `dsh-extra-plan-settings` 唯一全局行，旧 `extra-plan-preset-sync` / `preset-extra-plan` 只作 raw patch 非破坏读取；`./preset-sync` 与 locale exports 已退役，settings.js 仍内部相对调用 `mountPresetSync`。两项宿主设置与合法 gateWords 由全局快照派生到内存 definition。当前显式非法 gateWords 必须在 resolve/restate/sync/API 入口抛错或失败回执，零 edit、零自动替换；旧非法值只诊断并跳过，合法整组显式修复单独放行。PUT 只 edit 唯一全局行并保留其它字段；前端保存一次带 revision 的十项 mutate，readonly/false/throw/恢复失败均不显示成功。纯 definition 的 17 条本体与 group/isolate/!!js 由官方 AgentPreset adapter 直接复用。设置表单仅经 detail.section 渲染于 bundle 详情页行列表之后（自绘标题），不注册 bundle.config、row.config、settings.plugins.tab 或 plugins.item；若本包 bundle.config 槽被任何一方注册条目则 detail.section 让位保持唯一表单。

## 六、session 生命周期与 usage 账本

- 运行时状态按 `sessionId` 分桶；rootCall、job_output、tool-jobs 通知、usage cursor 不能跨会话清理。锚点变化只清当前 session 的临时桶。通知消费合同是 **agent/inbox/claimed 同步主入口 + durable snapshot fallback + 统一幂等 helper**：claimed 直接取 `payload.message`，在消息尚未进入 `snapshotEvents` 时先解锁；`tools/pre-execute` 只扫描 durable `user/message` 的 `event.data` 作恢复、重放与旧日志兜底，两入口都调用 `consumeToolJobsNotice(agent, message)`。helper 严格校验非空稳定 `message.id`、`source.kind/form` 与 `/background job (\S+)/`；session 内 consumed 的身份是通知实例 `message.id`，同一 id 跨 claimed/durable 只消费一次，不同 id 即使复用同一 jobId 也代表新 incarnation。首次有效通知先按 session 精确删除 `jobOutputCallCounters` 的该 jobId，再清 `pollGuardCounters` 整表，双解锁完成后才把 notice id 写入 consumed；jobId 只用于这次当前 session 的单键删除，不能作为去重键。用户/agent-message 锚点仍清 jobOutput、pollGuard、subCall 临时桶，但 notice-id Set 跨锚点保留，直到 `agent/disposed` 的 `disposeSession` 按 session 回收；这些 Map 是可重建缓存，不是 job running/terminal 状态合同，resume/replay 仍以 durable user/message 为兜底。
- `agent/disposed` 是 emit/void，宿主不等待异步 Promise；因此必须在监听器同步路径先做 final fold，再处理 pending probe，再按 sessionId 回收 Map、notice、rootCall 与 cursor。每次 `agent/pre-step` 在 await next 前捕获本次 payload.agent，预算、suffix、sessionEvents 不读取 apply 级共享 Agent。重复 disposed 幂等，其它 session 不受影响。
- usage 增量以宿主 `session.seq` 水位配合 `snapshotEvents(from,to)` 读取新增区间；水位不变直接返回，日志截断或首次折叠才回退全量，`seq` 去重后 append 成功才推进 cursor。生产热路径不每趟同时跑全量和增量；全量对拍只在验收回归运行。
- cursor 文件 ENOENT 按空表；损坏、解析失败或根值非对象时首次告警并保留原始字节，避免覆盖其它 session 的去重基准。账本字段缺失按空值/零兼容，五类计数全零的事件不写行。

## 当前安全结论索引

| 结论 | 当前落点 |
|:--|:--|
| 拒绝不能造成状态残留清除；取消必须清四字段 | 根入口状态机；step-04 DZ 对照 |
| 组拒绝无工具副作用；参数不可解析不能绕过状态闸门 | `run-code-static.js`；step-00/04 |
| 方案/验收必须成对、journal 不完整不清理 | save 四模块；step-06 |
| 模型路由必须真实验证或可靠 fallback（回退） | `model-routing.js`；流程 ⑩-1/step-00 |
| 展示隐藏不是 runtime 安全隔离；P2-2 cache 不跨 Agent | `assembly-presentation.js`、`sdk-text-cache.js`；step-04 |
| usage final fold 必须同步且按 session 隔离 | 根入口/`agent-runtime.js`；step-04 P4 |
| job_kill 仅直行放行 | `mainGateReason`；step-04 |
| send_message 主会话向 running 目标拒绝 | `mainGateReason`（gateCtx.getAgents）；step-04 |
| job_list/list_agents 同锚点防轮询 | `pollGuardGateReason`/`recordPollGuardCall`；step-04 |
| 通知解锁双动作（job_output 单键+pollGuard 清表） | apply 的 `agent/inbox/claimed` 同步主入口 + `tools/pre-execute` durable snapshot fallback，共用 `consumeToolJobsNotice`；按 session 内 `message.id` 幂等，jobId 仅删除当前 job_output 键；notice-id Set 跨锚点保留、dispose 回收；step-04 TJ/PG/CN |
| 宿主变更先看当前台账，历史快照不作当前事实 | [ai-宿主耦合台账](ai-宿主耦合台账.md)；[宿主历史归档](ai-宿主耦合历史归档.md) |

机制变化时先核对源码真源与对应回归，再同步本文件；旧事故和批次不要重新写入当前合同。

## 七、局部安全合同指针

- `lib/shell-mutation.js` 的 pwsh/bash 识别是位置敏感的写边界：段首裸写词、语法级写形态、连续剥离 sudo/env/nohup/command wrapper、带值 wrapper 选项（含 sudo 的 `-p`/`--prompt`；`--prompt=value` 是单 token）与 NAME=VALUE 环境赋值、嵌套 shell 与重定向例外必须以源码纯函数为准，不能用文档替代。
- `lib/shell-mutation.js` 的 PWSH_MUTATION 识别裸 `>`/`>>`、`1-6` 流号和 `*>`/`*>>`，但保留 `2>&1`、`1>&2`、`*>&1` 等 stream→stream 合并例外；BASH_MUTATION 原合同不变。
- `lib/sdk-text-cache.js` 只做 agent-keyed、非 session 的 JSON-like 指纹缓存；字段/数组顺序、getter/cycle 失败、dispose 与迟到 Promise 都是局部合同。
- QQBot 自愈只处理拥有本插件且满足双锚点的 profile；迁移写前备份、写后 YAML 校验失败恢复，链接仅在 ENOENT 时建立，实体/异链保留，整体不阻断。当前机制由 `plugins/dsh-extra-plan-qqbot/lib/heal.js` 与对应 step-01 夹具共同锁定。

## 八、context-gate：F 写闸门与 projected catalog 去重

- 当 `anchoredBootstrap=true`、当前 Session 为 F（尚无任意 durable `tool/call`）、角色为 main/planner 时，现有 `agent/pre-step` prepend hook 在 `await next()` 得到最终 decision 后，按 source.kind 精确过滤整条 `agent-instructions` 与 `skill-catalog` 消息；不按正文、role 或未知 source 推断。A=0、executor/reviewer/probe 不新增 gate。
- 首个字符串 `tool/call` 或数组包含 `tool/call` 的 durable 事件结束 F；L 不 replay F，宿主 agent-instructions/tool-skill 自然重组最新 baseline/catalog。assistant-only、宿主内部扫描/读取不晋升 L；Session/父子历史各自隔离。
- 过滤是 source gate 的关键边界，先于现有 C 投影与目录去重；关键 gate/phase 失败走宿主错误路径，不把未过滤 decision 发送出去。
- `projectSkillCatalogDecision` 只处理 `source.kind=skill-catalog` 且 entries 合法的消息；其它 source 即使带 entries 也保持对象和正文不变。`dedupeProjectedContextDecision` 分别按 source.kind 读取当前 agent `session.deriveMessages()` 最后一个合法可见签名：skill-catalog 只比较有序 `[name,description]`，agent-instructions 只比较非空 `content` 的 JSON 形状并忽略动态 id/seq/role/source；空 catalog 合法，坏形状、变化、移出 surface 后重现必须保留。无共享缓存、无 sent/released 标志，不比较父 Session。
- 纯函数 `filterBootstrapContextDecision` 与 `dedupeProjectedContextDecision` 不读文件/环境/registry/Inbox，不持有 agent/global 状态；冻结输入可用，无变化透传原对象，未知 source 原样保留。

## 九、save_plan 并行派遣与分组验收合同

- `save_plan` 仍是成对的方案/验收工件。两份正文必须各自携带模式与职责说明；`single` 只有一个数字任务，`batch` 才允许多个连续任务，未来规模由实际工件决定，不由当前批次的任务、检查、组或文件数量决定。工件本身要能恢复派遣、验收和交接，不依赖父会话看到 planner render 或本仓维护文档。
- 数字任务声明主/关联文件的唯一所有权、真实实现依赖和执行组；文件重叠、未说明的共享输出或不确定的物理别名不能被文本合同宣称为安全并行。收尾文件与数字任务文件分开计入覆盖，全局验收只是引用同轮检查，不是第二套调度。
- 执行组由其成员任务的依赖并集折叠：只保留组外依赖，`groupDependsOn` 为空时 `initialState=eligible`，否则为 `waiting`。这只是静态初始资格，不是 ready/running/done 的实时状态，也不启动调度器；同组保留内部拓扑顺序且不可拆派，但可与资源独立的其它组并行。一名执行者可以领取多个组，组数不等于人数。
- 独占资源是稳定的声明边界，用来标识共享输出目录、缓存或固定环境等非修改文件冲突；同资源的数字任务应归并执行组，不同验收组声明同资源应合并。资源声明不能证明隐藏共享状态、物理别名、命令无副作用或代理实际遵守范围。
- 检查定义有唯一身份，可由多个任务、收尾或全局引用；完全相同的取证方式、工作目录和按序检查行不得另建重复 ID。公共检查只由一个领取者在同一冻结源与条件下运行，其他引用复用原始结果；执行组 G 与验收组 R 是独立命名空间，不要求对应。
- 只读复核由 reviewer 在只读权限内完成；执行取证由已获批准的执行者或直行主会话运行，reviewer 只读原始 stdout/stderr、退出码和源文件后独立判定。取证方式是职责声明，不自动放宽 route/approved、文件写入或命令安全权限。
- 结构、关系、交叉引用和摘要边界必须早于 context/base、证据 IO、journal 恢复与 atomic commit 拒绝；合法正文逐字双写，structured output 仍只有 `paths`，render 只是摘要，不是父会话唯一事实源。任何源文件变化都会使受影响任务、依赖消费者和共享检查的旧证据失效；无法证明无影响时按固定顺序复验。main 最后汇总任务、检查、收尾和全局覆盖，漏项、矛盾或过期证据不得宣布通过。
