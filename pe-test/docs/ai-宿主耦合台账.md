# 宿主耦合台账（当前 DSH/QQBot 升级核对）

> 本台账只保留当前活动契约、风险、未核实项和升级 checklist（核对清单）。宿主侧按“包名 + 包内相对路径 + 符号名”定位，不写宿主固定行号；本仓库函数行号见 [ai-代码地图](ai-代码地图.md)。旧版本、已删除耦合、77/217/209 等历史快照与 evidence 勾销见[宿主耦合历史归档](ai-宿主耦合历史归档.md)，不作当前统计。

## ① 当前基线与判读规则

| 项 | 当前值/口径 | 状态 |
|:--|:--|:--|
| DSH | `0.1.7-rc.1 || 0.1.7-rc.2 || 0.2.0-rc.1 || 0.2.0-rc.2` | 四版本精确 peer 目标；0.2.0-rc.2 有用户提供的范围受限 HUMAN 兼容基线，rc.1 与本轮 post-fix 待复测 |
| QQBot 目标 | `0.5.0` | 静态目标，不等于集成通过 |
| 核心插件 | `@local/dsh-extra-plan` `0.3.0` | 当前包契约 |
| QQBot 精简插件 | `@local/dsh-qqbot-user-questions` `2.0.0` | 仍有 postinstall（安装后脚本）；allow-build 是否放行待 HUMAN |
| 预设载体 | profile patch 根级 `preset-extra-plan` 声明行 | `dsh.bundle.patch` 第二项为生成产物；旧 `.agent-presets` 不作读取方 |
| 状态判读 | `【已核实】` 表示台账静态/源码核对；`【未核实】`、`HUMAN`、`SKIP` 不得改为通过 | 当前台账纪律 |

### 四版本证据分栏

| 版本 | peer 目标 | 当前静态证据 | 结论 |
|:--|:--|:--|:--|
| `0.1.7-rc.1` | 纳入 | 既有台账基线 | 本轮不重跑 |
| `0.1.7-rc.2` | 纳入 | 既有台账基线 | 本轮不重跑 |
| `0.2.0-rc.1` | 纳入（用户决策） | 本机无安装根、无 SlotMap/API 证据 | `【未核实·HUMAN】`；不得由 rc.2 推出 |
| `0.2.0-rc.2` | 纳入 | 用户提供的 2026-10-01 rc2 兼容反馈批次；本机仅作静态回归 | `【HUMAN 基线通过·范围受限】`；本轮 post-fix A09/A10/A11/UI 待复测 |

生产事实：用户已核实 `C:\Users\Administrator\.dsh\profiles\qqbot\node_modules\js-yaml\package.json` 为 `4.3.2`；QQBot 先从包自身解析，QB5 属于“健壮性改进”而非当前生产阻断。本轮不写入或重装生产 profile。

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
| HS1 | `lib/settings.js` Config + `settings.configure` | 10 字段 `.volatile()`；SettingsForms 管理 describe/update/replace/mutate | 【已核实·静态】 |
| HS2 | settings 行 `dsh-extra-plan-settings` | 行 id 同时是命名空间、configForms key、插件行详情 key | 【已核实·静态】 |
| HS3 | `lib/settings.js` webServer prefix | `/api/dsh-extra-plan-settings` prefix 路由 | 【已核实·静态】 |
| HS4 | `live-config.js` 路径决议 | `configPath → DSH_EXTRA_PLAN_CONFIG_PATH → configEditor.documentPath`；不读旧预设目录 | 【已核实·静态】 |
| HS5 | `preset-sync.js` `configEditor.edit` | 事务/reconcile/回滚；插件不直写 patch | 【已核实·静态】 |
| HS6 | `preset-patch.generated.yml` | 声明行 Config 与完整 `plugins` 组合；由生成器维护 | 【已核实·静态】 |
| HS8 | `executor-spawn.js` `subagents.registerProvider` | provider 引用计数幂等；稳定槽键取服务实现本体 | 【已核实·静态】 |
| HS9 | executor `delegate/getProvider` | 默认 delegate 与 providerName 解析 | 【已核实·静态】 |
| HS10 | executor `toolFilter.deny` | deny 名单必须是宿主实际工具名 | 【已核实·静态】 |
| HS11 | `prepareContinuable` | 能力存在时才透传 continuable | 【已核实·静态】 |
| HS12 | `resolveChildAgentOptions` | 对象展开合并，空对象继承父路由 | 【已核实·静态】 |
| HS13 | `preset-settings.js` `loadYaml` | 核心包自有 js-yaml；QQBot 由 package-local js-yaml 依赖保障，失败返回 null | 【已核实·静态】 |
| HS14 | `!!js` YAML 标签 | YAML_SCHEMA 对 `dshHomePath` 等表达式的解析 | 【已核实·静态】 |
| HS15 | `SETTING_DEFINITIONS` | 10 项 source/row/projection 定位与 8+2 分组 | 【已核实·静态】 |
| HS16 | `tool-presentation.config.mode` | 仅 `native/ptc/both` | 【已核实·静态】 |
| HS17 | `client.js` `__ModuleLoader__` | loader id 必须与包名/组合图一致 | 【已核实·静态】 |
| HS18 | `client.js` `require("react")` | 共享 client module 提供 React | 【已核实·静态】 |
| HS19 | locale bind/register（语言环境绑定/注册） | 包级与行级 locale 通道 | 【已核实·静态】 |
| HS20 | 双版本 client.js 设置 UI 注册面 | 0.2 独立 `settings.plugins.tab` 已移除；0.1.7 原始 `plugins.row.config` keyed row 接线由 0.1.7/0.2 支持构建保留，宿主提供对应 legacy row slot 时在插件详情呈现；slot 缺失时走 configEditor/SettingsForms 或 profile 权威行后备路径；settings 后端/Config/投影/热读仍活动 | 【已核实·静态；双版本 post-fix HUMAN 待复测】 |
| HS21 | `client.js` `esp-*` | 本插件自持样式；不依赖旧宿主 CSS hash | 【已核实·静态】 |
| HS22 | 主题 token | 颜色/可读性依赖主题变量名 | 【已核实·静态】 |
| HS23 | client-bridge 空壳行 | pathLike + package exports 扫描 client | 【已核实·静态】 |
| HS24 | extra-plan row config | 宿主 schema 将行 config 传入 apply | 【已核实·静态】 |
| HS25 | `index.js` plugin contract | `name/inject/apply` 与 agent 预设组合 | 【已核实·静态】 |
| HS26 | HP 首轮 `tool:read` | section、参数默认值、输出字段与手写 F 文案必须同步核对 | 【已核实·静态；行为待实机】 |
| HS27 | `executor-spawn.js` `slotKey` | `Symbol.for('cordis.original')`/traceable 语义决定跨世代幂等 | 【已核实·静态】 |

## ③ 当前 HK：钩子与文件组合契约

| 编号 | 当前本仓位置/钩子 | 当前合同与风险 | 状态 |
|:--|:--|:--|:--|
| HK1 | `agent/created` | serial；启动注册错误必须吞掉；`agent/session-start` 已删除 | 【已核实·静态】 |
| HK2 | 两处 `agent/pre-step` | waterfall（瀑布式处理）；引导与注册兜底必须各自保留 | 【已核实·静态】 |
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
| HK11 | `cordis.patch.yml` 三条 insert | client-bridge/settings/preset-sync 行注入 | 【已核实·静态】 |
| HK12 | package `dsh.bundle.patch` | 依次装载 cordis.patch 与生成的 preset patch | 【已核实·静态】 |
| HK13 | package exports | settings/preset-sync/client/locale 子路径必须可解析 | 【已核实·静态】 |
| HK14 | package `dsh.client` | platform=web、inject 顺序与 `./client` export | 【已核实·静态】 |
| HK15 | 预设 isolate | mountPreset 审计；必要/保险服务名均 `isolate: true` | 【已核实·静态】 |
| HK16 | `!!js dshHomePath` | 宿主提供 dshHomePath 与标签 schema | 【已核实·静态】 |
| HK17 | 四行 tool-subagent | provider/toolName/backgroundMode/toolFilter/maxDepth schema | 【已核实·静态】 |
| HK18 | executor-spawn 行 | providerName/delegate 指向本仓薄委托层 | 【已核实·静态】 |
| HK19 | tool-subagent-control 子路径 | 宿主 exports 子路径与行名 | 【已核实·静态】 |
| HK20 | child 识别与 sandbox floor | `parentSession/origin/delegationDepth/descriptor.mode` | 【已核实·静态】 |
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
| SD8 | subagent/descriptor.mode | continuable 与 one-shot 角色分离 |
| SD10 | `session.seq` + `snapshotEvents(from,to)` | cursor 增量、水位未变与截断回退 |
| SD11 | `Session.requestHeader().config` | 顶层 provider/model 与 fallback（回退）来源 |
| SD12 | sandbox/mode append | read-only（只读） child workspace-write floor（工作区写入下限） |
| SD14 | agents.get(parentSession) | 父链与主会话 fallback（回退） |
| SD15 | llm.listModels | legacy（兼容） advisory（建议）/strict（严格）候选 |
| SD16 | skill-filesystem/bundledSkillDir（0.2.0-rc.2 换通道：trustedHost=true → node:fs；watch:false；旧 customSkillDirs 因 ctx.fs 扫 asar 抛非 absent 错被 registry 整体跳过） | 当前 skill 载体；旧 customSkillDirs 静态注册与更旧 resolve/register 仅历史 |
| SD17 | ctx.effect 生命周期 | prompt variables 与作用域释放 |
| SD18 | tools.schemas(scope) | 当前工具可见面与引导收窄 |
| SD19 | ToolRuntime.register/definition | save 工具 schema/render/execute |
| SD19b | register 抛错分类 | A 重名、B 永久定义错误、C 可重试错误 |
| SD20/SD21 | SessionHeader.cwd | save_plan/save_probe 落盘基准 |
| SD22 | PromptAssembly | sections/contexts/tools/variables 投影 |
| SD23 | PreStepDecision | enter/reject/messages/waterfall（瀑布式处理） |
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
| SD36 | backgroundMode→descriptor.mode | 角色与 probe claim |
| SD37 | createUserMessage/source.kind | v4 自有 producer kind 与 id/role |
| SD38 | step-07 输出 | attempted（尝试路由）/actual provenance（实际来源）、suffix、父子行号 |
| SD39 | agents.get(id).status | AgentRegistry.get(id)（dsh-agent）返回驻留 Agent，.status getter 真源 dsh-agent-loop：phase idle/maintenance（空闲/维护）→ 'idle'，否则 'running'（运行中）；插件经 ctx.get('agents') 查询 send_message 目标运行状态 |
| SD40 | ToolExecution.agent / arguments.agent_id | send_message 方向判定契约：agent=调用者、arguments.agent_id=目标；SD25 字段清单未列 agent 字段，此处补记 |

SD9、SD13 是历史缺定义编号，SD34 是本插件不调用 `sessionProjections.stateOf` 的反向记录；三者不补造成当前合同。

## ⑤ 当前 CF：安装配置面

| 编号 | 当前合同 | 状态 |
|:--|:--|:--|
| CF3 | `defaultDshHome` 仅公共 API/夹具；活动 renderer 由 `resolveToolsSdkRenderer` 负责 | 【已核实·静态】 |
| CF4 | package `dsh.bundle.patch` 两项入口 | 【已核实·静态】 |
| CF5 | `dsh.client.platform=web` 与 inject | 【已核实·静态】 |
| CF6 | exports 含 settings/preset-sync/client/client-bridge/locale 通道 | 【已核实·静态】 |
| CF7 | step-01 设置页从宿主安装目录解析依赖 | 【已核实·静态】 |
| CF8 | dependencies 仅 js-yaml | 【已核实·静态】 |
| CF9 | 临时 DSH_HOME/profile 夹具形状 | 【已核实·静态】 |
| CF10 | preset.yml 元数据与声明行 Config | 【已核实·静态】 |
| CF11 | QQBot 映射测试的 profile/依赖夹具 | 【已核实·静态】 |
| CF12 | `@deepseek-ai/*` 不进 dependencies；dsh/dsh-llm peer 精确钉四版本；bundle 不兼容时 skipped/disabled | 【已核实·静态；rc.2 门控核对，profile 清理与 422 消失待 HUMAN】 |

CF1/CF2（extra-plan postinstall/distribute-preset）已删除，作为历史归档，不列当前安装合同。

## ⑥ 当前 QB：QQBot 活动面与测试面

| 编号 | 当前契约/边界 | 状态 |
|:--|:--|:--|
| QB1 | 精简插件 `inject=[]` | 【已核实·静态】 |
| QB2-QB3 | DSH_HOME/profile 解析与启动 apply 自愈 | 【已核实·静态】 |
| QB5 | package-local `js-yaml:^4.2.0`，heal.js 移除 APPDATA/固定宿主后备；失败返回 null | 【已核实·静态；健壮性改进】 |
| QB8-QB9 | profile bundles 与 `node_modules/@local` 双条件锚定 | 【已核实·静态】 |
| QB10-QB11 | web 核心包到 qqbot 的 junction/dir 建链；非目标实体不替换 | 【已核实·静态；部署结果待 HUMAN】 |
| QB12-QB13 | patch 写前备份、写后 YAML 顶层数组/旧块校验；不引用旧 AgentPresetSettingsSchema 为当前合同 | 【已核实·静态】 |
| QB14-QB18 | QQBot patch、ptc-runtime、agent-preset-registry、cordis-host-runner 当前行 | 【已核实·静态】 |
| QB19 | QQBot bundle patch | 【已核实·静态】 |
| QB20-QB21 | `scripts/heal.mjs` postinstall 与异常退出 0；allow-build 是否实际放行待 HUMAN | 【已核实·静态；HUMAN】 |
| QB25-QB26 | 静态服务/config.default 断言与间接消费 extra-plan | 【已核实·静态】 |
| QB27/QB31 | 一键 AUTO/四态汇总 | 【已核实·静态】 |
| QB28-QB30 | 五条件预检、junction 能力、真实 profile 只读映射；缺环境/权限为 SKIP | 【已核实·静态；SKIP 不销账】 |

QB6/QB7 旧包匹配、QB22 根 README 文档入口属于历史/导航说明；QB4、QB23、QB24 继续列为未核实，不改成通过。

## ⑦ 四版本风险与开放验证

1. isolate 审计：`mountPreset/leakedServices` 对未隔离 root service 抛错；必要/保险名单必须保持 `isolate: true`。
2. settings 换代：0.2 独立 `settings.plugins.tab` 按本轮需求移除；0.1.7 `plugins.row.config` keyed row 接线保留并由 0.1.7/0.2 支持构建携带，宿主提供对应 legacy slot 时显示插件详情配置，slot 缺失时走 configEditor/SettingsForms 或 profile 权威行后备路径；settings 行 10 项 Config、API、投影、preset-sync/live-config 仍是活动后端合同；双版本 post-fix UI/A09/A10/A11 仍待 HUMAN。
3. profile patch 载体：旧 `.agent-presets` 无读取方；`compatibility.json`/peer 门控可能使 bundle skipped、loader disabled；QQBot 仍有 allow-build/postinstall 欠账。
4. 包/服务换代：workflow-ptc、`ptcRuntime`、tool:cordis 删除、当前两项 Cordis 工具与 `bundledSkillDir`（0.2.0-rc.2 换通道，配 `watch:false`；旧 `customSkillDirs` 已删）必须按当前真值核对。
5. rc.2 单侧风险：`sanitizeProfile` 整体搬移 patch、`configEditor.edit` 值等于继承层删行；rc.1 现场缺失，不能推出跨代结论。
6. session v4：`session.v4.jsonl.zstd`、自有 source.kind、developer/message 坐标和 step-07 三代候选必须保留。
7. CF12 422 开放 incident：profile 中宿主运行时副本曾导致 `tool_removal` 422；清理 profile node_modules/lock、污染会话续聊、native↔PTC 切换三项均待用户验证。

### 本轮 rc2 兼容基线与 post-fix 状态

0.2.0-rc.2 已通过用户提供的 HUMAN 实机兼容测试（范围受限；2026-10-01 rc2 兼容反馈批次）。该基线来源为用户反馈，未提供 OS、profile/mode、SESSION_ID、部署 commit、原始报告/日志路径；不覆盖完整 A01-A56、生产、QQBot、真实消息、/preset、question/approval、postinstall/allow-build。A09/A10/A11 与本轮双版本设置入口纠偏完成后仍待用户在 0.1.7-rc.2 与 0.2.0-rc.2 复测：0.2 独立 tab 不出现，legacy row 是否可见取决于宿主是否提供对应 slot。

## ⑧ 六项 HUMAN 欠账（全部未销账）

| 序号 | 待核实事项 | 后续动作 | 状态 |
|:--|:--|:--|:--|
| 1 | QuestionChannel/ApprovalChannel 静态声明与真实消息链 | 静态检查 + 部署后真实问答/审批 | 【未核实·HUMAN】 |
| 2 | QQBot 0.5.0 manifest 实际装载运行 | 环境脚本只读 + 部署后运行 | 【未核实·HUMAN】 |
| 3 | `im-qqbot` 宿主 schema/id/name/config | 用户侧按真实宿主 schema 比对 | 【未核实·HUMAN】 |
| 4 | web→qqbot 建链真实结果 | 环境脚本只读；必要时用户 `dir`/`fsutil` 复核 | 【未核实·HUMAN】 |
| 5 | `preset-extra-plan`/`config.default=extra-plan` 在 QQBot `/preset` 生效 | 部署后由用户执行 `/preset` | 【未核实·HUMAN】 |
| 6 | QQBot postinstall 是否被 allow-build 放行 | 用户部署时查命令与安装日志 | 【未核实·HUMAN】 |

环境不足、权限不足或脚本输出 SKIP 不能销账；自动全通过也不能替代以上六项。

## 当前代码落点（符号级）

- 核心入口 `plugins/dsh-extra-plan/index.js` 负责宿主 hook、配置快照与 session-scoped 状态；设置权威值/投影由 `lib/settings.js`、`lib/preset-settings.js`、`lib/preset-sync.js` 分工；`lib/client.js` 保留一份共享表单并通过唯一 legacy keyed row 接线按宿主能力呈现，0.2 独立 `settings.plugins.tab` 不注册。
- QQBot 兼容面由 `plugins/dsh-qqbot-user-questions/index.js#apply` → `lib/heal.js#healQqbotCompatibility` 驱动；CLI `scripts/heal.mjs` 不改变启动不阻断语义。
- 当前静态核对不等于部署通过；真实 profile、消息、`/preset`、postinstall 和 allow-build 仍按本台账 HUMAN 项执行。

## ⑨ 升级 checklist（核对清单，顺序固定）

1. 设置只读 `DSH_INSTALL_ROOT`（本机为 `D:\AI项目\dsh-v0.2.0-rc2`）后运行 `node pe-test/tools/step-01-qqbot-安装映射.mjs`，再 `node pe-test/tools/step-01-qqbot-环境验证.mjs`；静态先行，环境项条件只读，SKIP 不销账；rc.1 设备复用现有脚本并保留 HUMAN。
2. `node pe-test/tools/step-01-设置页配置.mjs` 与 `node pe-test/tools/step-04-路由与写闸门.mjs`；确认 settings/configEditor 后端合同、0.2 独立 tab 移除、legacy row 的 slot 条件呈现、A09/A10/A11 与工具呈现面。
3. `node pe-test/tools/一键step测试.mjs`；AUTO/HUMAN/参数项按脚本实际数组与四态判读。
4. 按 HS/HK/SD/CF/QB 当前表，先钩子 mode，再服务方法，再事件/Session 形状，再 bundle/exports/patch/isolate 契约；旧 API 只作负向核对。
5. `node pe-test/tools/代码地图生成.mjs --check`，退出码必须为 0；人工描述/固定尾部另做对拍。
6. 逐条复核本节六项 HUMAN；保留未核实状态，用户部署后再销账。

## ⑩ P2-4 与 gateWords 当前合同

- `agent.cordis.yml` 的 `exploreBudget`/`plannerPromptSuffix` 是作者叶值；生成器产出 `preset-defaults.generated.js` 与 `preset-patch.generated.yml`，先校验再替换，失败保留 last-known-good（上次已知良好版本）；运行时不解析 YAML。
- `preset-sync` 的 idle（空闲稳态）条件是声明行覆盖资产、本体剥离一致、投影一致；写入只走 `configEditor.edit`，无 manifest（清单）/旧迁移链。
- gateWords 是 YAML 七键唯一值源；apply 先 `createGateRuntime`，当前 agent scope 注册七个 `systemPrompt.variable`；deny、match、状态机和投影都消费当前词表；旧词不推进。
- `system-prompt/assemble` 的模型可见副本必须保留 variables 映射；宿主严格渲染失败、变量缺失或未知变量属于升级敏感面，静态台账不冒充实机通过。
