# 宿主耦合台账（当前 DSH/QQBot 升级核对）

> 本台账只保留当前活动契约、风险、未核实项和升级 checklist（核对清单）。宿主侧按“包名 + 包内相对路径 + 符号名”定位，不写宿主固定行号；本仓库函数行号见 [ai-代码地图](ai-代码地图.md)。旧版本、已删除耦合、77/217/209 等历史快照与 evidence 勾销见[宿主耦合历史归档](ai-宿主耦合历史归档.md)，不作当前统计。

## ① 当前基线与判读规则

| 项 | 当前值/口径 | 状态 |
|:--|:--|:--|
| DSH | `0.2.1-rc.2` | 单一声明范围（`engines.dsh` 与三项 @deepseek-ai peer 同值）；旧版兼容见旧版分支，不再声明也不设兼容开关 |
| QQBot 目标 | `0.5.0` | 静态目标，不等于集成通过 |
| 核心插件 | `dsh-extra-plan` `0.3.0` | 当前包契约；仓库子目录安装路径不变 |
| QQBot 精简插件 | `dsh-extra-plan-qqbot` `2.0.0` | 仓库子目录为 plugins/dsh-extra-plan-qqbot；仍有 postinstall（安装后脚本）；allow-build 是否放行待 HUMAN |
| 预设载体 | `dsh-extra-plan-settings` 全局管理行 + 内部纯 definition（主 1 + 角色 4） | `dsh.bundle.patch` 只装载一行；旧 `extra-plan-preset-sync` / `preset-extra-plan` 仅 raw patch 非破坏读取迁移，`./preset-sync` 与 locale exports 已退役；官方 adapter 由 settings owner 内部顺序挂载 5 个 definition（主在前、角色 101..104 在后，任一角色失败整体回滚） |
| 状态判读 | `【已核实】` 表示台账静态/源码核对；`【未核实】`、`HUMAN`、`SKIP` 不得改为通过 | 当前台账纪律 |

### 单版本基线与证据口径

| 版本 | peer 目标 | 当前静态证据 | 结论 |
|:--|:--|:--|:--|
| `0.2.1-rc.2` | 唯一纳入 | 新宿主根 `E:\Soft\AI项目\dsh-v0.2.1-rc.2` 实跑：step-01-安装同步/预设完整性/设置页配置、step-01-qqbot-安装映射、step-04-路由与写闸门、step-04-context-gate宿主回归、step-05-角色预设宿主回归 | `【已核实·集成】`；真实 provider/模型行为/GUI/生产 profile 仍 HUMAN |
| 旧版（本分支之前的历史宿主版本） | 已迁出 | 旧版兼容见旧版分支；历史归档保留；本分支不再声明、不再回归 | `【历史归档】`（不是当前合同，也不作当前通过） |



生产事实：用户已核实 `C:\Users\Administrator\.dsh\profiles\qqbot\node_modules\js-yaml\package.json` 为 `4.3.2`；QQBot 先从包自身解析，QB5 属于“健壮性改进”而非当前生产阻断。AI 不写入或重装生产 profile，生产动作仅由用户部署流程执行。

### 当前宿主接触面总表

| 层 | 当前活动范围 | 复核入口 |
|:--|:--|:--|
| HS 服务/注册 | HS1-HS6、HS8-HS27（HS7 已删除历史） | 下面“当前 HS” |
| HK 钩子/组合 | HK1-HK10、HK11-HK22、HK24-HK27；HK23 无定义不补造 | 下面“当前 HK” |
| SD 数据/布局 | SD1-SD8、SD10-SD12、SD14-SD15、SD16-SD32、SD33、SD35-SD40；SD9/SD13 保留缺号说明 | 下面“当前 SD” |
| CF 安装配置 | CF3-CF12；CF1/CF2 已删除历史 | 下面“当前 CF” |
| QB 兼容包 | QB1-QB3、QB5-QB21、QB25-QB26；QB27-QB31 为测试/条件环境面 | 下面“当前 QB” |

## ② 当前 HS：宿主服务与注册面

| 编号 | 本仓位置 | 当前契约/升级敏感点 | 状态 |
|:--|:--|:--|:--|
| HS1 | `lib/settings.js` Config + `settings.configure` | 10 字段 `.volatile()`；全局 owner 由 ConfigForms 管理 describe/update/replace/mutate，并统一拥有同步与 adapter | 【已核实·静态】 |
| HS2 | settings 行 `dsh-extra-plan-settings` | 行 id 同时是命名空间、configForms key、插件行详情 key | 【已核实·静态】 |
| HS3 | `lib/settings.js` webServer prefix | `/api/dsh-extra-plan-settings` prefix 路由 | 【已核实·静态】 |
| HS4 | `live-config.js` 路径决议 | `configPath → DSH_EXTRA_PLAN_CONFIG_PATH → configEditor.documentPath`；不读旧预设目录 | 【已核实·静态】 |
| HS5 | `settings.js` owner → `preset-sync.js` `configEditor.edit` | 旧值迁移/补齐只 edit 唯一全局行；合法十项与 gateWords 重述不丢键；当前非法 gateWords/非法 PUT 先失败且零 edit，插件不直写 patch | 【已核实·静态+专项】 |
| HS6 | `preset-definition.generated.yml` | 纯 definition 的 id/name/description/order/plugins；由生成器维护，preset-sync 交官方 adapter | 【已核实·静态】 |
| HS8 | `executor-spawn.js` `subagents.registerProvider` | 薄委托层保留可执行（lib 与 `./executor-spawn` export 均在），但 0.2.1 不再对 worker 应用 deny 注入，故注入失效；provider 引用计数幂等与稳定槽键语义不变 | 【已核实·静态；失效面已记录】 |
| HS9 | executor `delegate/getProvider` | 默认 delegate 与 providerName 解析仍可装载；当前无 worker 行引用（workflow-ptc/tool-ralph 段已注释） | 【已核实·静态】 |
| HS10 | executor `toolFilter.deny`（历史面） | 0.2.1 起 worker 不再接收 deny 注入；角色的「不可见」改由角色预设不挂对应工具实现（`agent.cordis.yml` 第二文档），executor-spawn 行仅留历史 11 项清单 | 【已核实·静态】 |
| HS11 | `prepareContinuable` | 能力存在时才透传 continuable；0.2.1 宿主把 descriptor.mode 固定为 continuable，该能力不再是角色判据 | 【已核实·静态】 |
| HS12 | `resolveChildAgentOptions` | 对象展开合并，空对象继承父路由；child 角色改由 `agentPreset` 选组合 | 【已核实·静态】 |
| HS13 | `preset-settings.js` `loadYaml` | 核心包自有 js-yaml；QQBot 由 package-local js-yaml 依赖保障，失败返回 null | 【已核实·静态】 |
| HS14 | `!!js` YAML 标签 | YAML_SCHEMA 对 `dshHomePath` 等表达式的解析 | 【已核实·静态】 |
| HS15 | `SETTING_DEFINITIONS` | 10 项 source/row/projection 定位与 8+2 分组 | 【已核实·静态】 |
| HS16 | `tool-presentation.config.mode` | 二值 `native/ptc`（`both` 随 0.2.1 二值化退出；旧值归一化回落 native、不写迁移） | 【已核实·静态】 |
| HS17 | `client.js` `__ModuleLoader__` | loader id 必须与包名/组合图一致 | 【已核实·静态】 |
| HS18 | `client.js` `require("react")` | 共享 client module 提供 React | 【已核实·静态】 |
| HS19 | locale bind/register（语言环境绑定/注册） | 包级与行级 locale 通道 | 【已核实·静态】 |
| HS20 | client.js 同页配置注册面 | 仅注册 `plugins.detail.section`（order 100，设置表单自绘标题渲染于 bundle 详情页行列表之后）；实时检查 bundle.config 槽并让位；不注册 `plugins.row.config`、`settings.plugins.tab` 或 `plugins.item`；ConfigForms 通过稳定 namespace 快照订阅并一次 mutate，SettingsCard 固定 page 形态 | 【已核实·静态+专项；四版本同页 HUMAN 待复测】 |
| HS21 | `client.js` `esp-*` | 本插件自持样式；不依赖旧宿主 CSS hash | 【已核实·静态】 |
| HS22 | 主题 token | 颜色/可读性依赖主题变量名 | 【已核实·静态】 |
| HS23 | settings 内部 client-carrier | 官方 Loader Group 创建唯一 pathLike child，随 settings 生命周期同步移除并触发 client graph/HMR 更新；同步队列关闭时不启动新 edit/adapter，在途 adapter 结算后恰一次释放 | 【已核实·静态+deferred/Loader专项】 |
| HS24 | extra-plan row config | 宿主 schema 将行 config 传入 apply | 【已核实·静态】 |
| HS25 | `index.js` plugin contract | `name/inject/apply` 与 agent 预设组合 | 【已核实·静态】 |
| HS26 | HP 首轮 `tool:read` | section、参数默认值、输出字段与手写 F 文案必须同步核对 | 【已核实·静态；行为待实机】 |
| HS27 | `executor-spawn.js` `slotKey` | `Symbol.for('cordis.original')`/traceable 语义决定跨世代幂等 | 【已核实·静态】 |
| HS28 | context-gate 宿主回归 | 当前安装根版本、生产源码 hash、公共 AgentLoop/受控 adapter、完整 request trace 与工作区 JSONL 证据；受控 adapter 不冒称真实 provider | 【已核实·集成；真实provider/HUMAN NOT-RUN】 |
| HS30 | 角色预设 definition（`agent.cordis.yml` 第二文档 → `preset-definition-<role>.generated.yml`） | 4 角色（order 101..104）personaPrefix 由作者源逐字搬运、extra-plan 行 config 由主预设同 id 行逐字复制（含 gateWords）；工具面按 5f3cc68 可见面回填：planner/reviewer/prober 各挂 `tool-pwsh`/`tool-bash`（win32 条件 disabled）/`tool-web`（fetch:false、searchTimeoutMs:60000）/`tool-cordis` 且 `dsh-tool-fs` 置 write/edit=false，planner 另挂 `tool-subagent-control`（连带可见 `interrupt_agent`，0.2.1 包不可拆）；executor 保留 write/edit 与既有两行 shell，另挂 `tool-web`/`tool-cordis`；四个角色 definition 的派生范围跟随同一 `toolPresentationMode`（与主 definition 同源派生、各恰一行 `tool-presentation`，派生异常保留生成物默认值且不抛错）；生成物不得手改；注册顺序主在前角色在后 | 【已核实·静态+宿主回归】 |
| HS31 | `pe-test/tools/step-05-角色预设宿主回归.mjs` | 七组断言：roster 5 id、三键 tool-subagent 装载（assertProvider）、planner header.agentPreset/isPlannerChild、executor 工具面（可写 + 双 shell + web/cordis）、planner 只读（无 write/edit、有 pwsh）、persona 渲染、both 旧值回落 native | 【已核实·集成；真实 provider/模型/GUI NOT-RUN】 |
| HS29 | `pe-test/_shared/host-deps.mjs` | scoped package exports 按完整 `./subpath` 解析；根入口与 `/list-agents` 分离；根包无可用 exports/main 时回退 `index.js`，显式未知子路径透传；同步/异步 hook 共用语义，生成 data URL hookSource 需 ESM 回放 | 【已核实·step-01 安装同步；真实宿主/HUMAN NOT-RUN】 |

## ②-A Web→QQBot 镜像路径契约（独立于 HS4）

| 项 | 当前合同 | 状态 |
|:--|:--|:--|
| Web→QQBot 真源 | Web `configEditor.documentPath` 首选；由 `profiles/web/cordis.patch.yml` 反推同级 `profiles`，不从当前进程 cwd 或用户目录猜测 | 【已核实·专项】 |
| 显式备用 | 仅 documentPath 缺失时接受绝对 `DSH_HOME` 且 `DSH_PROFILE=web`，来源标记为 `explicit-DSH_HOME`；不使用 homedir、USERPROFILE/HOME 或 `home/.dsh` 回退 | 【已核实·专项】 |
| QQBot 双锚点 | 直接同级 profile 的 `package.json` 必须含 `@tencent-connect/dsh-qqbot` bundle，且 `node_modules/dsh-extra-plan-qqbot` 存在；否则不写 | 【已核实·专项】 |
| 持久化范围 | 同步完整 10 项与完整 `gateWords`；局部 YAML 安全改写保留未知行、注释、`!!js` 与嵌套 insert，写前临时文件/备份/落盘后终验并支持恢复 | 【已核实·专项】 |
| 状态与生效 | `synced`/`not-installed`/`unavailable`/`failed`/`partial` 结构化回执；8 项沿既有热读，`webFetch` 与 `toolPresentationMode` 为 2 项宿主重启生效，不发送跨进程 reload | 【已核实·专项】 |
| 与 HS4 边界 | `live-config.js` 的 `DSH_EXTRA_PLAN_CONFIG_PATH` 热读优先级只服务 Web 核心消费，不是跨 profile 根定位依据；两条用途不得混用 | 【已核实·专项】 |

### ②-B settings-only no-remount 生命周期合同

| 场景 | 允许动作 | 禁止/失败语义 | 状态 |
|:--|:--|:--|:--|
| 首次启动 | 读取/迁移 settings、构造 17 条纯 definition；无旧 owner 时官方 AgentPreset register=1 | 不是每次保存的前置；旧 owner 活动时不抢占、不编辑、不删除 | 【已核实·专项】 |
| settings-only | 读取最终完整 10 项 + `gateWords`，settled-only 队列直接交 `profileSync`/QQBot | **no-remount**：adapter register/dispose/rebuild 均不得发生；不调用、不等待、不 dispose 官方 AgentPreset | 【已核实·专项】 |
| structuralHandoff | 仅非 settings 声明结构变化或旧 owner ↔ 官方 transition 才进入 adapter/structural 队列 | 与 settled-only 分离；adapter failure/reject/hang 不得撤销 Web 或阻断 QQBot 同步 | 【已核实·专项】 |
| profileSync | 初始 `pending=true`，terminal 后 `pending=false`；记录真实 `synced/not-installed/unavailable/failed/partial` | 禁止 `pending/pending=false`、双端成功伪造或用 adapter register 充当保存成功条件 | 【已核实·专项】 |
| 生效分组 | 8 项沿 live-config 热读；`webFetch`/`toolPresentationMode` 为 2 项需重启投影；完整 7 键 `gateWords` 立即持久化 | 当前 apply 词表不原地换词；重启、旧词拒绝、非法词无 fallback 为 HUMAN | 【已核实·专项/HUMAN】 |

## ③ 当前 HK：钩子与文件组合契约

| 编号 | 当前本仓位置/钩子 | 当前合同与风险 | 状态 |
|:--|:--|:--|:--|
| HK1 | `agent/created` | serial；启动注册错误必须吞掉；`agent/session-start` 已删除 | 【已核实·静态】 |
| HK2 | 两处 `agent/pre-step` | waterfall（瀑布式处理）；prepend gate 在最终 decision 写入 durable user/message 前过滤 F 的两类 source，再走 C 投影/按 source.kind 的 context 去重；引导与注册兜底必须各自保留 | 【已核实·静态+集成】 |
| HK3 | `agent/request-error` | waterfall retry（瀑布式重试）；MALFORMED 限次恢复与诊断 | 【已核实·静态】 |
| HK4 | `agent/disposed` | emit/void（发出/无返回）；final fold（最终折叠）必须同步完成 | 【已核实·静态】 |
| HK5 | `system-prompt/assemble` | 三参 waterfall（瀑布式处理）；投影保留 variables | 【已核实·静态】 |
| HK6 | `agent/request` | next 后再做模型路由屏障与 fallback（回退） | 【已核实·静态】 |
| HK6a | `model-routing.js` listModels/listProviders | strict（严格）路径候选枚举；legacy（兼容）不枚举 | 【已核实·静态】 |
| HK6b | `model-routing.js` prepareCall/stream | 真实 OK probe 完整消费、超时/abort 独立 | 【已核实·静态】 |
| HK7 | `tools/pre-execute` | waterfall（瀑布式处理）；四级闸门与组判定；next 默认 allow | 【已核实·静态】 |
| HK8 | 七个钩子 `payload.agent` | agentEvents fused 形状 | 【已核实·静态】 |
| HK9 | tool-jobs 通知 | `source.kind='tool-jobs'` 且 `form='notice'`；旧三元组已废；v0.4.0 起新增 job_list/list_agents 轮询守卫清整表消费方（consumed 标记与 job_output 跟踪命中解耦） | 【已核实·静态】 |
| HK10 | step-06 事件夹具 | 事件负载必须与真实 subagent/ask/tool 形状一致 | 【已核实·静态】 |
| HK11 | `cordis.patch.yml` 单条 insert | 仅 `dsh-extra-plan-settings` 全局行公开；carrier、同步、迁移与官方 adapter 均归同一 owner 内部 | 【已核实·静态】 |
| HK12 | package `dsh.bundle.patch` | 依次装载 cordis.patch 与生成的 preset patch | 【已核实·静态】 |
| HK13 | package exports | 根包、settings/client、根 locale/settings locale 当前子路径必须可解析；`./preset-sync` 根与 locale 子路径必须解析失败 | 【已核实·静态】 |
| HK14 | package `dsh.client` | platform=web、inject 顺序与 `./client` export | 【已核实·静态】 |
| HK15 | 预设 isolate | mountPreset 审计；必要/保险服务名均 `isolate: true` | 【已核实·静态】 |
| HK16 | `!!js dshHomePath` | 宿主提供 dshHomePath 与标签 schema | 【已核实·静态】 |
| HK17 | 四行 tool-subagent | 合法键仅 `provider`/`toolName`/`modelSelectionSettings`/`agentOptions`/`agentPreset`/`allowedAgentPresets`/`maxDepth`；本预设四行各留三键（provider/toolName/agentPreset）并指向 4 个角色 id；persona/toolFilter 会被宿主抛错、backgroundMode 已无此键 | 【已核实·静态】 |
| HK28 | 委派工具参数表（0.2.1） | 已无后台标志：subagent/subagent_plan/subagent_review/subagent_probe 恒为立即返回 subagentId 加完成通知；本仓闸门不再判定该参数（后台约束上移宿主层） | 【已核实·静态+两轮矩阵】 |
| HK18 | executor-spawn 行 | providerName/delegate 仍指向本仓薄委托层（保留可执行），但 0.2.1 下 deny 注入失效；恢复条件见 agent.cordis.yml 注释 | 【已核实·静态】 |
| HK19 | tool-subagent-control 子路径 | 宿主 exports 子路径与行名 | 【已核实·静态】 |
| HK20 | child 识别与 sandbox floor | `parentSession/origin/delegationDepth` 仍是 child 判据；planner 判据改为 `session.header.agentPreset === 'extra-plan-planner'`（descriptor.mode 恒 continuable，不再参与） | 【已核实·静态+宿主回归】 |
| HK21 | run-code 子调用识别 | `exec.parent` 是宿主面；`exec.sub` 是本仓合成标记 | 【已核实·静态】 |
| HK22 | shell mutation | 已解析 `ToolExecution.arguments.command` 与 pwsh/bash 写判定 | 【已核实·静态】 |
| HK24 | client bridge/package | 相对路径行须满足 pathLike 扫描规则 | 【已核实·静态】 |
| HK25 | `tools/post-execute` | 仅替换失败结果 content；PostToolDecision 静态契约可核；真实 PTC 改写仍待部署 | 【已核实·静态；行为待实机】 |
| HK26 | `developer/message` append | `surfaceOp:'append'`、正整数 turn/step、自有 source.kind；坐标非法仍 retry | 【已核实·静态】 |
| HK27 | `agent/error` | 同步逐字错误链落盘；静态接线不等于宿主现场运行通过 | 【已核实·静态】 |

HK23 当前无定义，不补造编号；历史/旧钩子见归档。

## ④ 当前 SD：事件、Session 与布局形状

| 编号 | 当前形状/入口 | 升级敏感点 |
|:--|:--|:--|
| SD1 | sessions 目录与 `parentSession` 首行 | step-07 定位直接 child；v4/v3/旧日志候选 |
| SD2 | zstd MAGIC 与 `.jsonl.zstd` 三代文件名 | 解压/帧切分与代际判定 |
| SD3 | user/message 锚点 | deriveFlowState 与 planner 预算起点 |
| SD4 | tool/call turn/step/callId/name/arguments 字符串 | JSON.parse 与 ask 判定 |
| SD5 | tool/result 与块级 `isError` | 被拒不烧预算 |
| SD6 | assistant/message usage/source provider/model | usage ledger 字段来源 |
| SD7 | PTC dispatch start/dispatch | root/parent/sub call 与 content/isError |
| SD8 | subagent/descriptor.mode（历史形状） | 0.2.1 起 mode 恒为 continuable（宿主 manager 固定值），角色分离改判 `session.header.agentPreset`；descriptor 仅作「确属子代理会话」的日志形状 |
| SD10 | `session.seq` + `snapshotEvents(from,to)` | cursor 增量、水位未变与截断回退 |
| SD11 | `Session.requestHeader().config` | 顶层 provider/model 与 fallback（回退）来源 |
| SD12 | sandbox/mode append | read-only（只读） child workspace-write floor（工作区写入下限） |
| SD14 | agents.get(parentSession) | 父链与主会话 fallback（回退） |
| SD15 | llm.listModels | legacy（兼容） advisory（建议）/strict（严格）候选 |
| SD16 | skill-filesystem/bundledSkillDir（换通道：trustedHost=true → node:fs；watch:false；旧 customSkillDirs 因 ctx.fs 扫 asar 抛非 absent 错被 registry 整体跳过） | 当前 skill 载体；旧 customSkillDirs 静态注册与更旧 resolve/register 仅历史 |
| SD17 | ctx.effect 生命周期 | prompt variables 与作用域释放 |
| SD18 | tools.schemas(scope) | 当前工具可见面与引导收窄 |
| SD19 | ToolRuntime.register/definition | save 工具 schema/render/execute |
| SD19b | register 抛错分类 | A 重名、B 永久定义错误、C 可重试错误 |
| SD20/SD21 | SessionHeader.cwd | save_plan/save_probe 落盘基准 |
| SD22 | PromptAssembly | sections/contexts/tools/variables 投影 |
| SD23 | PreStepDecision | enter/reject/messages/waterfall（瀑布式处理）；F gate 精确过滤 agent-instructions/skill-catalog，L 由宿主自然重组 |
| SD24 | PreToolDecision/PostToolDecision | deny/allow 与失败 content 改写 |
| SD25 | ToolExecution | callId/rootCallId/name/arguments/parent/signal |
| SD26 | scoped 事件 subject 解析 | payload.agent/scope 注入 |
| SD27 | LlmCallConfig | provider/model/reasoning/maxTokens 屏障 |
| SD28 | TokenUsage | input/output/cache/reasoning 字段 |
| SD29 | ToolResultBlock | 内容块与 isError 计费排除 |
| SD30 | ToolSchema | name/description/parameters |
| SD31 | AssembleContext | context.agent/scope |
| SD32 | ask 错误码 | channelBroken 白名单 |
| SD33 | profile node_modules/宿主安装锚点 | step-04/step-01 依赖解析；静态入口不等于实机通过 |
| SD35 | 宿主工具名清单 | deny 必须与宿主真值对拍 |
| SD36 | backgroundMode→descriptor.mode（已退役） | 两个键都不再参与角色判定：0.2.1 委派恒为立即返回加通知（工具参数表已无后台标志），角色由 `agentPreset` 区分；本仓已在闸门与测试侧清零 |
| SD37 | Session.deriveMessages() | context 去重按 kind 只读取当前 Session 可见 durable message surface；catalog 比较有序 [name,description]，agent-instructions 比较非空 content JSON 形状；缺能力的 mock 不推断已发布 |
| SD37 | createUserMessage/source.kind | v4 自有 producer kind 与 id/role |
| SD38 | step-07 输出 | attempted（尝试路由）/actual provenance（实际来源）、suffix、父子行号 |
| SD39 | agents.get(id).status | AgentRegistry.get(id)（dsh-agent）返回驻留 Agent，.status getter 真源 dsh-agent-loop：phase idle/maintenance（空闲/维护）→ 'idle'，否则 'running'（运行中）；插件经 ctx.get('agents') 查询 send_message 目标运行状态 |
| SD40 | ToolExecution.agent / arguments.agent_id | send_message 方向判定契约：agent=调用者、arguments.agent_id=目标；SD25 字段清单未列 agent 字段，此处补记 |

SD9、SD13 是历史缺定义编号，SD34 是本插件不调用 `sessionProjections.stateOf` 的反向记录；三者不补造成当前合同。

## ⑤ 当前 CF：安装配置面

| 编号 | 当前合同 | 状态 |
|:--|:--|:--|
| CF3 | SDK renderer 只读候选路径 | `dshToolsEntryCandidates`/`resolveToolsSdkRenderer` 负责活动 renderer 加载；preset-sync 不再提供旧 DSH_HOME 决议公共 helper | 【已核实·静态】 |
| CF4 | package `dsh.bundle.patch` 单一入口 | 只装载 `cordis.patch.yml` 的全局管理行；definition 由 owner 读生成资产后交官方 adapter | 【已核实·静态】 |
| CF5 | `dsh.client.platform=web` 与 inject | 【已核实·静态】 |
| CF6 | exports 单一公开组件 | 新 patch 只加载 settings owner；definition 资产由全局 owner 读取，旧 `./preset-sync` 根/locale 子路径已退役且应解析失败，raw patch 仍作迁移来源 | 【已核实·静态】 |
| CF7 | step-01 设置页从宿主安装目录解析依赖 | 【已核实·静态】 |
| CF8 | dependencies 仅 js-yaml | 【已核实·静态】 |
| CF9 | 临时 DSH_HOME/profile 夹具形状 | 【已核实·静态】 |
| CF10 | preset.yml 元数据与纯 definition Config | id/name/description/order/plugins 与作者源同源，definition 不含 Loader insert wrapper | 【已核实·静态】 |
| CF11 | QQBot 映射测试的 profile/依赖夹具 | 【已核实·静态】 |
| CF12 | `@deepseek-ai/*` 不进 dependencies；dsh/dsh-llm peer 与 `engines.dsh` 精确钉 `0.2.1-rc.2`（旧版不声明）；bundle 不兼容时 skipped/disabled | 【已核实·静态；rc.2 门控核对，profile 清理与 422 消失待 HUMAN】 |

CF1/CF2（extra-plan postinstall/distribute-preset）已删除，作为历史归档，不列当前安装合同。

## ⑥ 当前 QB：QQBot 活动面与测试面

| 编号 | 当前契约/边界 | 状态 |
|:--|:--|:--|
| QB1 | 精简插件 `inject=[]` | 【已核实·静态】 |
| QB2-QB3 | DSH_HOME/profile 解析与启动 apply 自愈 | 【已核实·静态】 |
| QB5 | package-local `js-yaml:^4.2.0`，heal.js 移除 APPDATA/固定宿主后备；失败返回 null | 【已核实·静态；健壮性改进】 |
| QB8-QB9 | profile bundles 与 `node_modules/dsh-extra-plan-qqbot` 双条件锚定 | 【已核实·静态】 |
| QB10-QB11 | Web `node_modules/dsh-extra-plan` 到 QQBot `node_modules/dsh-extra-plan` 的 junction/dir 建链；非目标实体不替换 | 【已核实·静态；部署结果待 HUMAN】 |
| QB12-QB13 | patch 写前备份、写后 YAML 顶层数组/旧块校验；不引用旧 AgentPresetSettingsSchema 为当前合同 | 【已核实·静态】 |
| QB14-QB18 | QQBot patch、ptc-runtime、agent-preset-registry、cordis-host-runner 当前行 | 【已核实·静态】 |
| QB19 | QQBot bundle patch | 【已核实·静态】 |
| QB20-QB21 | `scripts/heal.mjs` postinstall 与异常退出 0；allow-build 是否实际放行待 HUMAN | 【已核实·静态；HUMAN】 |
| QB25-QB26 | 静态服务/config.default 断言与间接消费 extra-plan | 【已核实·静态】 |
| QB27/QB31 | 一键 AUTO/四态汇总 | 【已核实·静态】 |
| QB28-QB30 | 五条件预检、junction 能力、真实 profile 只读映射；缺环境/权限为 SKIP | 【已核实·静态；SKIP 不销账】 |

QB6/QB7 旧包匹配、QB22 根 README 文档入口属于历史/导航说明；QB4、QB23、QB24 继续列为未核实，不改成通过。

## ⑦ 单版本（0.2.1-rc.2）风险与开放验证

1. isolate 审计：`mountPreset/leakedServices` 对未隔离 root service 抛错；必要/保险名单必须保持 `isolate: true`。
2. settings 换代：设置表单仅经 `plugins.detail.section` 渲染于当前插件包详情行列表之后（自绘标题），不注册 `plugins.bundle.config`、`plugins.row.config`、`settings.plugins.tab` 或 `plugins.item`，若本包 bundle.config 槽被任何一方注册条目则 detail.section 让位保持唯一表单；ConfigForms 通过稳定 namespace 订阅快照并一次 mutate 十项。settings 行 10 项 Config、API、旧值迁移、内存 definition/adapter 仍是活动后端合同；截至 2026-10-01，四版本同页 UI/A09/A10/A11 仍为 HUMAN 待复测。
3. profile patch 载体：旧 `.agent-presets` 无读取方；`compatibility.json`/peer 门控可能使 bundle skipped、loader disabled；QQBot 仍有 allow-build/postinstall 欠账。
4. 包/服务换代：workflow-ptc/tool-workflow/tool-ralph 三段在作者源里已注释（暂不挂载，恢复条件见 agent.cordis.yml）；`ptcRuntime` 服务名、tool:cordis 只注册两项只读工具、`bundledSkillDir`（配 `watch:false`；旧 `customSkillDirs` 已删）必须按当前真值核对。
5. rc.2 单侧风险：`sanitizeProfile` 整体搬移 patch、`configEditor.edit` 值等于继承层删行；0.2.1-rc.2 是当前唯一目标，旧版现场不再保留、不能推出跨代结论。
6. session v4：`session.v4.jsonl.zstd`、自有 source.kind、developer/message 坐标和 step-07 三代候选必须保留。
7. CF12 422 开放 incident：profile 中宿主运行时副本曾导致 `tool_removal` 422；清理 profile node_modules/lock、污染会话续聊、native↔PTC 切换三项均待用户验证。当前单一全局行、内部 carrier、内存 definition/adapter 仍需用户部署后 HUMAN 验证。native↔PTC 切换的会话边界与规避见 ⑭。

### 当前验证状态（截至 2026-10-01 已知证据）

0.2.1-rc.2 为本分支唯一目标：静态/集成证据来自新宿主根实跑（step-01-安装同步、step-01-预设完整性、step-01-设置页配置、step-01-qqbot-安装映射、step-04-路由与写闸门、step-04-context-gate宿主回归、step-05-角色预设宿主回归）。该证据不覆盖 OS/生产 profile、真实 provider 与模型行为、GUI 显示、QQBot 真实消息/`/preset`/question/approval、postinstall/allow-build；单一全局 owner 的同页 detail.section 唯一表单（含让位防御）仍待用户部署后 HUMAN 复测。

## ⑧ 六项 HUMAN 欠账（全部未销账）

| 序号 | 待核实事项 | 后续动作 | 状态 |
|:--|:--|:--|:--|
| 1 | QuestionChannel/ApprovalChannel 静态声明与真实消息链 | 静态检查 + 部署后真实问答/审批 | 【未核实·HUMAN】 |
| 2 | QQBot 0.5.0 manifest 实际装载运行 | 环境脚本只读 + 部署后运行 | 【未核实·HUMAN】 |
| 3 | `im-qqbot` 宿主 schema/id/name/config | 用户侧按真实宿主 schema 比对 | 【未核实·HUMAN】 |
| 4 | web→qqbot 建链真实结果 | 环境脚本只读；必要时用户 `dir`/`fsutil` 复核 | 【未核实·HUMAN】 |
| 5 | 新会话默认 `extra-plan`、旧 `preset-extra-plan` 迁移与 QQBot `/preset` 行为 | 部署后由用户执行 `/preset`；AI 不清理旧 profile 行 | 【未核实·HUMAN】 |
| 6 | QQBot postinstall 是否被 allow-build 放行 | 用户部署时查命令与安装日志 | 【未核实·HUMAN】 |

环境不足、权限不足或脚本输出 SKIP 不能销账；自动全通过也不能替代以上六项。

## 当前代码落点（符号级）

- 核心入口 `plugins/dsh-extra-plan/index.js` 负责宿主 hook、配置快照与 session-scoped 状态；统一全局 owner 由 `lib/settings.js` 调度 `lib/preset-sync.js`，设置合同由 `lib/preset-settings.js` 提供；`lib/client.js` 仅经 `plugins.detail.section` 接线稳定 namespace 的唯一共享表单（bundle.config 槽若有本包条目则让位）。
- QQBot 兼容面由 `plugins/dsh-extra-plan-qqbot/index.js#apply` → `lib/heal.js#healQqbotCompatibility` 驱动；CLI `scripts/heal.mjs` 不改变启动不阻断语义。
- 当前静态核对不等于部署通过；真实 profile、消息、`/preset`、postinstall 和 allow-build 仍按本台账 HUMAN 项执行。

## ⑨ 升级 checklist（核对清单，顺序固定）

1. 设置只读 `DSH_INSTALL_ROOT`（本机为 `E:/Soft/AI项目/dsh-v0.2.1-rc.2`）后运行 `node pe-test/tools/step-01-qqbot-安装映射.mjs`，再 `node pe-test/tools/step-01-qqbot-环境验证.mjs`；静态先行，环境项条件只读，SKIP 不销账；rc.1 设备复用现有脚本并保留 HUMAN。
2. `node pe-test/tools/step-01-设置页配置.mjs` 与 `node pe-test/tools/step-04-路由与写闸门.mjs`；确认全局 owner/configEditor 后端合同、detail.section 同页唯一表单（行列表之后）、A09/A10/A11 与工具呈现面。
3. `node pe-test/tools/一键step测试.mjs`；AUTO/HUMAN/参数项按脚本实际数组与四态判读。
4. 按 HS/HK/SD/CF/QB 当前表，先钩子 mode，再服务方法，再事件/Session 形状，再 bundle/exports/patch/isolate 契约；旧 API 只作负向核对。
5. `node pe-test/tools/代码地图生成.mjs --check`，退出码必须为 0；人工描述/固定尾部另做对拍。
6. 逐条复核本节六项 HUMAN；保留未核实状态，用户部署后再销账。

## ⑩ P2-4 与 gateWords 当前合同

- `agent.cordis.yml` 的 `exploreBudget`/`plannerPromptSuffix` 是作者叶值；生成器产出 `preset-defaults.generated.js` 与纯 `preset-definition.generated.yml`，先校验再替换，失败保留 last-known-good（上次已知良好版本）；运行时由 preset-sync 解析 definition 并交官方 adapter。
- 角色作者源与主预设同文件（`---` 分隔多文档）：第一文档=主预设 17 条顶层条目，第二文档=4 角色定义；人工真源收敛为 1 个文件，生成器按首个 `---` 行切分（主 definition 边界止于分隔行，角色数据取自第二文档）；`parsePresetYaml` 只取首文档，角色侧另走第二文档读取。
- `preset-sync` 的 idle（空闲稳态）以全局行十项权威值、旧值兼容读取与 gateWords 派生收敛为准；旧 `extra-plan-preset-sync` / `preset-extra-plan` 只读迁移，不写旧 body/旧公开行；新写入只走唯一全局行 `configEditor.edit`，无 manifest（清单）台账。
- gateWords 是 YAML 七键唯一值源；apply 先 `createGateRuntime`，当前 agent scope 注册七个 `systemPrompt.variable`；deny、match、状态机和投影都消费当前词表；旧词不推进。
- `system-prompt/assemble` 的模型可见副本必须保留 variables 映射；宿主严格渲染失败、变量缺失或未知变量属于升级敏感面，静态台账不冒充实机通过。

## ⑪ 生产注入修复工作区批次

- settled callback 在触发时经 `editorOf(undefined)` 使用 `ctx.get('configEditor')` 解析当前服务；`mountPresetSync` 仍只在 `ctx.inject(['configEditor'])` 的 child 作用域读取 editor，未把 child 捕获到外层。
- 本轮受控证据使用四态 host-proxy：`normal-injection` 要求外层直接访问保留 `cannot get property "configEditor" without inject`、ctx.get 成功、初始 settled 先于 adapter；`get-only/no-op-inject` 为 `HUMAN`（`HOST-PROXY-GET-ONLY`），不得以 register=0 销账；`inject-throws` 与 `child-missing-configEditor` 保留显式失败。
- 单字段触发仍核对完整十项 values 与完整七键 gateWords，并对 Web patch、每个 QQBot patch 与 terminal 输入做同一快照对拍；旧 no-remount 批次 `AUTO_REGRESSION_PASS=NO`，不可作为本轮结果。
- 缺少 `DSH_INSTALL_ROOT`、真实宿主/provider/profile、生产 QQBot、GUI、消息链与重启均保持结构化 `HUMAN`；本轮仅写工作区，不作生产副本部署。

## ⑫ 唯一 settings 行与可关联保存终态

- canonical 权威行固定为 `id=dsh-extra-plan-settings`、`name=dsh-extra-plan/settings`；`inspectSettingsAuthority` 同时报告 raw/effective/canonicalName 计数、选中 name、documentPath、候选摘要。raw 或 effective 不唯一时 GET/PUT 返回 409 conflict，PUT 在 `editor.edit` 与 synchronizer enqueue 前停止。
- 每次 API PUT、`settled-initial`、`settled-update` 都生成 `saveRunId`、单调 `syncRevision`、固定 10 项 values + 7 键 gateWords 的 `snapshotHash` 与 trigger；PUT 返回 request/terminal 全等，GET 无参数只显示 `source=last-terminal-cache,cache=true,terminalMatch=false`。
- Web 与每个 QQBot 目标分别保留 bytes/mtime/raw SHA、managed snapshot hash、backup 路径/SHA；raw SHA 可不同，但 managed hash 必须和 request snapshotHash 相等。外部 writer 漂移归类 `drift-detected`，不回写旧 backup。
- `creativeMode` 自动验收只看双端即时 patch/managed hash 和 terminal 关联；运行时重启、真实 profile 清理、QQBot 消息链继续 `HUMAN`。

## ⑬ UI 保存不产生 internal/update（宿主契约事实）

- 真实 UI 保存走宿主 ConfigForms `form.mutate`（dsh-client-ui-settings ConfigForm.mutate → remote.settings.mutate → settings.mutate → configEditor.edit）；10 项 settings 字段全部 `.volatile()`，Loader 判定 volatile-only（`equalExceptVolatile` 把 volatile 字段视为相等）后就地替换 `fiber._config` 直接 return，不调 `fiber.update`，`internal/update` waterfall 根本不运行（cordis 4.0.4 宿主源码核对）。
- 即使产生该事件，`internal/update` 也是 fiber 定向 waterfall（非 global 注册存入注册者 `child.fiber._hooks`，`thisArg`=被 update 的 fiber）；`preset-sync.js` 的监听器位于 `ctx.inject(['configEditor'])` child fiber ≠ settings 行 entry.fiber，永远收不到。两层都断 ⇒ 保存时不产生可消费的 settled 链。
- 结论：UI 保存的 QQBot 同步主触发是 client.js saveAll 第二步同源 PUT（`api-put` trigger，无条件全量 syncEditor）；settled 链仅作 Web 宿主重启/装载兜底（settled-initial）。生产漂移取证：`.extra-plan/线索-生产实况取证-Web到QQBot配置漂移-be2839cd-20261015151724897-24332-0.md`（settledCount 停在 1、缓存停在 settled-initial+syncRevision=1）。【已核实·宿主源码+生产取证】

## ⑭ toolPresentationMode 切换与会话边界（0.2.1-rc.2 实测）

**一、操作契约**

- 切换 `toolPresentationMode` 后必须重启 Harness 并**新开会话**；原会话在切 mode 后不可继续。
- `native` 开头的会话切到 `ptc` 并重启后，resume 该会话的每一轮请求都以 400 被拒，上游原文为 `tools: at least one tool must have defer_loading=false. All tools cannot be deferred.`（code `INVALID_REQUEST`；宿主只透传上游 message，不做本地校验）。
- 同配置下**新开会话**正常：工具面只有 `run_code` 且不带 defer 标记，可正常回答。
- 把 mode 切回 `native` 并重启后，该原会话恢复（投影回到 25 个直呼工具、零 deferred）。
- 边界：本条只约束 `toolPresentationMode` 切换；`runcodeCatchGate`（U9）与 `pe-test/docs/ai-实机闸门测试流程.md` 7.6 的 `gateWords` 定制是热读/词表面，**不重启、不新开会话**，不在本契约内。

**二、机制链**

- 宿主 `dsh-session` 的 `ToolHistoryProjection`：baseline 固化在会话首条 `request/header`；`resume` 落盘的新 header（`reason=resume`、无 `startsSeries`）不重建 baseline（只有 `reason=series`／`startsSeries`／redeclared 才重置），故 `history.tools` 仍是 native 轮的 25 项声明。
- 宿主 `dsh-llm` 的 `toolDeclarations`：对 baseline 之外的 `tool-addition` 定义一律补 `deferLoading: true`；当前工具面里的 `run_code` 正落这一支。
- `deepseek-flash`（DeepSeek-V4.1-Flash）目录元数据 `toolUpdate: "addition-only"`：该模式裁掉所有非当前 active 的声明，裁完只剩 `run_code`，而它正是被标 deferred 的那个 ⇒ wire 上全 deferred。
- 适配器对照：`dsh-llm-deepseek` 只把 `deferLoading` 原样映射成 wire 字段 `defer_loading`，**没有** all-deferred 兜底；`dsh-llm-pi-ai` 在 `anthropic-messages` 路由且 `tools.every(deferLoading === true)` 时前置占位工具 `DeferredToolPlaceholder`，DeepSeek Messages 路由永不进入该兜底。

**三、插件侧边界（三条均封死）**

- `run_code` 是宿主保留名：`tools.register` 直接抛 `tool name "run_code" is reserved for the PTC mode presentation transport and cannot be registered or shadowed`，插件不能自建同名工具去提供非 deferred 声明。
- PTC 视图按名字 filter：`projectAssemblyForPresentation` 的 `ptcOnly` 分支只保留 `run_code`（`if (ptcOnly && tool.name !== 'run_code') return false`），插件只裁工具面、不重写 schema、不加任何标记字段。
- 插件无 baseline 与 defer 写入点：插件全仓对 `defer_loading`/`deferLoading` 零命中（仓内 `deferred()` 只是测试用 Promise 辅助），baseline 由宿主 `request/header` 决定，插件侧没有写入接口。
- 结论：三条均无绕行空间，插件没有技术规避手段；修复点只能在宿主（`ToolHistoryProjection` 按新 declaration series 重建 baseline、`toolDeclarations` 不把当前 active 定义标 deferred、`dsh-llm-deepseek` 补齐全 deferred 兜底）。

**四、本次实机证据（2026-10-18）**

- PTC 轮 2A＋2B 全项通过：切到 `ptc` 后**新开会话**跑第二轮两段（2A 段 `catchGate=true` 取拦截面与 `run_code` 聚合面、2B 段 `catchGate=false` 取放行面），全部通过、无 400。
- 重放复现：用宿主 `ToolHistoryProjection` 与 `projectToolUpdates`（`addition-only`）对真实会话重放，resume 场景的 wire 为 `[{"name":"run_code","defer_loading":true}]`；对照新开会话的 wire 为 `[{"name":"run_code"}]`，后者即上游接受的形态。

**五、状态行**

【已核实·集成（复现）】：wire 形态由宿主模块在真实会话数据上重放得出，400 原文以上游返回为准；不作通过、不销任何 HUMAN 欠账。

## ⑮ settings 行定位合同与重复行风险（0.2.1-rc.2）

**一、定位规则（id + 规范 name）**

- settings 行按「id = `dsh-extra-plan-settings` 且 name = `dsh-extra-plan/settings`」精确定位：`lib/settings-contract.js` 的 `settingsRowLocator` 产出 `rowName: SETTINGS_ROW_NAME`，`lib/preset-yaml.js#resolveLocator` 先按 id 收集候选行、再按 name 严格相等过滤，之后才走「0 行 missing / 多行 ambiguous / 1 行读叶 ok」的既有分支。
- 旧别名 `@local/dsh-extra-plan/settings` 不再作为候选：该 descriptor 的 `locatorAliases` 已清空，`resolveSetting` 不再把旧名字行并入候选集。
- 同 id 多行时：只有一行是规范名 → 取规范行（ok）；都非规范名、或都规范名 → ambiguous。`locator` 不带 `rowName` 的旧调用（源模板行、宿主行投影等）行为与收紧前逐字一致。

**二、宿主事实（重复行不报错）**

- Cordis Loader 对同 id 条目不做唯一性校验、不报错（静默共存）：0.2.1-rc.2 安装根 `node_modules/@deepseek-ai/cordis-plugin-loader/lib/index.js` 的 `ensureId` 只为缺 id 的条目补随机 id（且仅避让 `store` 键），入口装载与 `resolve` 均无唯一性断言，因此 profile patch 里并列的两条 `- id: dsh-extra-plan-settings` 不会被宿主拒绝。
- 插件侧因此多命中：只按 id 收候选会拿到 2 行 → ambiguous → 回退 apply 期 cfg 快照/兜底值，用户刚改的值看起来不生效（本次现场即 `creativeMode` 被读成 false）。

**三、装载期严格校验与运行期热读**

- 装载期（apply 构造 `createLiveConfig`）严格校验：settings 行存在但出现缺键（missing）、非法（invalid）、多命中（ambiguous）→ 直接抛 `extra-plan: settings 行校验失败：<key> = <state>（期望在 dsh-extra-plan-settings 行、name 为 dsh-extra-plan/settings 的 config 内取得合法值）`，插件拒绝装载。
- 整行缺席（首次安装、profile 无任何 settings 覆盖）仍按出厂形态静默：不抛错、不告警，整组取 cfg 快照。
- 运行期热读保留 fail-safe（未 captured 的键一律沿用 fallback，fallback 取值顺序不变），但 ambiguous 与 invalid 改为 `warnOnce` 告警，missing 仍静默——配置被改坏变得可见，不再无声吞掉。

**四、本次 desktop profile 清理（生产操作，有备份）**

- 目标：`~/.dsh/profiles/desktop/cordis.patch.yml`；删除第 32–346 行（首个顶层 `- id: preset-extra-plan` 起的旧 preset 定义块 + `name: "@local/dsh-extra-plan/settings"` 旧 settings 行），384 行 → 69 行（删 315 行）。
- 备份：`.extra-plan/backup-dsh-extra-plan-desktop-旧settings行-20261018194246/cordis.patch.yml`，SHA-256 `dcf349bb519e9342e7dabbf8796f0d5556bcd7f76fd2df6b939a0bee643c1fa6`（384 行）。
- 清理后：SHA-256 `b23179b04f9d65ee1b70dce639625fba3b2aee8b95dcc2f3b07b433d0ee44ca7`（69 行）；剩余顶层 settings 行 1 条且 `name: dsh-extra-plan/settings`，全文无 `@local` 与 `preset-extra-plan` 残留。
- 取值不变性：清理前后 gateWords 七键 7/7、十项 settings 取值 10/10 逐项一致（对齐备份第 358–379 行与清理后第 43–64 行，块级 diff 计 0 行）。

**五、实机验证与夹具修正**

- 清理后实机 skill catalog 由 10 项变为 13 项，新增 `cordis-plugin-development`、`editing-cordis-compositions`、`cordis-composition-reference`（正是 `creativeMode=true` 才投影的 creative 技能组），证明此前 C=1 失效根因是同 id 重复行导致 ambiguous 回退、C 被读成 false，改宿主或 schema 并非必要。
- 同步修正两处测试夹具：`pe-test/tools/step-04-路由与写闸门.mjs` 的 `lcFixture` 与 `pe-test/tools/step-01-设置迁移.mjs` 的 `captureRowSettings` 夹具均补上规范 `name: dsh-extra-plan/settings` 并补齐热读键，否则夹具在新合同下会被判 missing/ambiguous 而产生假失败。

**状态行**

【已核实·静态（待部署复测）】：不作通过、不销任何 HUMAN 欠账。
