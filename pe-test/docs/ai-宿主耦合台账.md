# 宿主耦合台账（当前 DSH/QQBot 升级核对）

> 本台账只保留当前活动契约、风险、未核实项和升级 checklist（核对清单）。宿主侧按“包名 + 包内相对路径 + 符号名”定位，不写宿主固定行号；本仓库函数行号见 [ai-代码地图](ai-代码地图.md)。旧版本、已删除耦合、77/217/209 等历史快照与 evidence 勾销见[宿主耦合历史归档](ai-宿主耦合历史归档.md)，不作当前统计。

## ① 当前基线与判读规则

| 项 | 当前值/口径 | 状态 |
|:--|:--|:--|
| DSH | `0.2.1-rc.1` \|\| `0.2.1-rc.2` \|\| `0.2.1-rc.3` \|\| `0.2.1-rc.4` \|\| `0.2.1-rc.5` | 五版本精确声明范围（`engines.dsh` 与三项 @deepseek-ai peer 同值）；旧版兼容见旧版分支，不据声明推导实机通过 |
| QQBot 目标 | `0.5.0` | 静态目标，不等于集成通过 |
| 核心插件 | `dsh-extra-plan` `1.6.0` | 当前包契约；仓库子目录安装路径不变 |
| QQBot 精简插件 | `dsh-extra-plan-qqbot` `2.0.1` | 源码合同为 `2.0.1`，仓库子目录为 plugins/dsh-extra-plan-qqbot；标准包 `postinstall` 的 `--install` 受 `--allow-build=dsh-extra-plan-qqbot` 授权后执行严格单目标校验，普通启动保留非阻断兜底；核心/宿主范围不变，公共发布、真实安装/运行及 allow-build 放行仍未核实（HUMAN） |
| 预设载体 | `dsh-extra-plan-settings` 全局管理行 + 内部纯 definition（主 1 + 角色 4） | `dsh.bundle.patch` 只装载一行；旧 `extra-plan-preset-sync` / `preset-extra-plan` 仅 raw patch 非破坏读取迁移，`./preset-sync` 与 locale exports 已退役；官方 adapter 由 settings owner 内部按主在前、角色 101..104 在后的顺序尝试挂载 5 个 definition；旧行参与结构指纹与 adapter 诊断而非抑制挂载，同 ID 可能装载失败，任一角色失败整体回滚；真实相遇效果仍 HUMAN |
| 状态判读 | `【已核实】` 表示台账静态/源码核对；`【未核实】`、`HUMAN`、`SKIP` 不得改为通过 | 当前台账纪律 |

### 双根与可信 Host 接口

- W 有两种用途口径：维护 W 取可信源树布局，不取进程 cwd、插件安装目录或普通文件 `dirname`；部署/会话 W 取运行时 `session.header.cwd`。H 只接受真实 Host ctx 的精确能力（包括 `profileContext.home/dir/patchPath/installAnchor`、可信 `profileContext.name`/`startedBundles`、Boot 提供的 `dshHomePath`）或维护测试显式 `--host-root` 与精确目标；`profileContext.cwd` 不能充 W。
- `configEditor` 只授予其对应 profile/精确文档能力，不升格共同父目录；`installAnchor` 是 dsh 应用 `package.json` 文件，用标准解析只读宿主代码。显式 `DSH_INSTALL_ROOT`+host-preload 只作本次只读代码验证，不能代替运行时真实 Host data/adapter 根；`DSH_HOME`/`DSH_PROFILE`/`SESSION_ID` 的存在不授权，普通文件参数不自授权。
- 普通相对值、CLI 覆盖、工件、fixture、temp、home、cache、capture、report 与测试输出归 W；运行时账本按用途归 H。无盘符/drive-relative、URI、变量/NUL、前缀相似 Other、非法原始根与 native junction 在授权前拒绝；真实路径、最近存在父级与链接不能证明时拒绝。H/W 合法重叠按用途分类而非一概拒绝，Host 只读资源保护真实身份；来源同时存在且冲突时阻塞对应 IO。

### 五版本声明与证据口径

| 版本 | peer 目标 | 当前静态/隔离证据 | 结论 |
|:--|:--|:--|:--|
| `0.2.1-rc.1` | 声明范围 | 无代码样本、无下载/安装或实机样本 | `NOT-RUN`；不编造通过 |
| `0.2.1-rc.2` | 声明范围 | 既有新宿主根 `E:\Soft\AI项目\dsh-v0.2.1-rc.2` 实跑：step-01-安装同步/预设完整性/设置页配置、step-01-qqbot-安装映射、step-04-路由与写闸门、step-04-context-gate宿主回归、step-05-角色预设宿主回归 | `【既有证据·集成】`；来源保留且证据等级不提升；真实 provider/模型行为/GUI/生产 profile 仍 HUMAN |
| `0.2.1-rc.3` | 声明范围 | 无代码样本、无下载/安装或实机样本 | `NOT-RUN`；不编造通过 |
| `0.2.1-rc.4` | 声明范围 | 显式 `DSH_INSTALL_ROOT=<本次真实代码根>` 仅作只读 Host 代码样本根；当前统一证据入口为 [acceptance.json](../../.extra-plan/evidence-dsh-extra-plan-review-fix-20261031081834/acceptance.json)（收尾生成，源码 SHA 与原始日志逐项匹配），均不替代真实部署 | `【已核实·静态/隔离自动】`；静态/隔离自动完成，正式统一取证与真实 Web/QQ/GUI/Provider/模型/消息/重启仍待 HUMAN 或待 V，不由此销账 |
| `0.2.1-rc.5` | 声明范围 | 只读静态核对声明文本 + 以该安装树作显式 `DSH_INSTALL_ROOT` 的隔离实跑（借安装树内 @deepseek-ai/* 真包与版本比对，见 .extra-plan/evidence-rc5-20261031/）；未下载/安装该宿主版本本身，未启动真实宿主进程与 Web GUI、未做真实 client 挂载与真实会话读写，真实 profile 与 QQBot 链路未触碰；实机闸门与 HUMAN 项全部未运行 | `【已核实·静态/隔离实跑】`；限只读静态核对与隔离实跑，HUMAN 未跑，不表示已通过、已部署或已销账 |
| 旧版（本分支之前的历史宿主版本） | 已迁出 | 旧版兼容见旧版分支；历史归档保留；本分支不再声明、不再回归 | `【历史归档】`（不是当前合同，也不作当前通过） |



生产事实：用户已核实 `C:\Users\Administrator\.dsh\profiles\qqbot\node_modules\js-yaml\package.json` 为 `4.3.2`；QQBot 先从包自身解析，QB5 属于“健壮性改进”而非当前生产阻断。AI 不写入或重装生产 profile，生产动作仅由用户部署流程执行。

### 当前宿主接触面总表

| 层 | 当前活动范围 | 复核入口 |
|:--|:--|:--|
| HS 服务/注册 | HS1-HS6、HS12-HS26、HS28-HS31 | 下面“当前 HS” |
| HK 钩子/组合 | HK1-HK17（含6a/6b）、HK19-HK22、HK24-HK28 | 下面“当前 HK” |
| SD 数据/布局 | SD1-SD8、SD10-SD33、SD35-SD40；SD9 保留缺号说明 | 下面“当前 SD” |
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
| HS12 | 官方 spawn／四类 tool-subagent | 父路由继承；显式 `agentOptions` 覆盖；`agentPreset` 选择子角色组合 | 【已核实·静态】 |
| HS13 | `preset-settings.js` `loadYaml` | 核心包自有 js-yaml；QQBot 由 package-local js-yaml 依赖保障，失败返回 null | 【已核实·静态】 |
| HS14 | `!!js` YAML 标签 | YAML_SCHEMA 对 `dshHomePath` 等表达式的解析 | 【已核实·静态】 |
| HS15 | `settings-contract.js` `SETTING_DEFINITIONS` + `DEFAULT_SETTINGS` | 10 项 source/row/projection 定位与 8+2 分组；默认值来自生成对象，validator/合法性与 UI metadata 仍以合同手工声明 | 【已核实·静态】 |
| HS16 | `tool-presentation.config.mode` | 二值 `native/ptc`（`both` 随 0.2.1 二值化退出；旧值归一化回落 native、不写迁移） | 【已核实·静态】 |
| HS17 | `client.js` `__ModuleLoader__` | loader id 必须与包名/组合图一致 | 【已核实·静态】 |
| HS18 | `client.js` `require("react")` | 共享 client module 提供 React | 【已核实·静态】 |
| HS19 | locale bind/register（语言环境绑定/注册） | 包级与行级 locale 通道 | 【已核实·静态】 |
| HS20 | `client.js` 同页配置注册面 | `EXTRA_FIELDS`/`HOST_ROW_FIELDS`/`ALL_FIELDS` 只在生成器成对标记区块内派生 UI metadata；仅注册 `plugins.detail.section`（order 100，设置表单自绘标题渲染于 bundle 详情页行列表之后）；实时检查 bundle.config 槽并让位；不注册 `plugins.row.config`、`settings.plugins.tab` 或 `plugins.item`；ConfigForms 通过稳定 namespace 快照订阅并一次 mutate，SettingsCard 固定 page 形态 | 【已核实·静态+专项；0.2.1-rc.2 同页 HUMAN 待复测】 |
| HS21 | `client.js` `esp-*` | 本插件自持样式；不依赖旧宿主 CSS hash | 【已核实·静态】 |
| HS22 | 主题 token | 颜色/可读性依赖主题变量名 | 【已核实·静态】 |
| HS23 | settings 内部 client-carrier | 官方 Loader Group 创建唯一 pathLike child，随 settings 生命周期同步移除并触发 client graph/HMR 更新；同步队列关闭时不启动新 edit/adapter，在途 adapter 结算后恰一次释放 | 【已核实·静态+deferred/Loader专项】 |
| HS24 | extra-plan row config | 宿主 schema 将行 config 传入 apply | 【已核实·静态】 |
| HS25 | `index.js` plugin contract | `name/inject/apply` 与 agent 预设组合 | 【已核实·静态】 |
| HS26 | HP 首轮 `tool:read` | section、参数默认值、输出字段与手写 F 文案必须同步核对 | 【已核实·静态；行为待实机】 |
| HS28 | context-gate 宿主回归 | 当前安装根版本、生产源码 hash、公共 AgentLoop/受控 adapter、完整 request trace 与工作区 JSONL 证据；受控 adapter 不冒称真实 provider | 【已核实·集成；真实provider/HUMAN NOT-RUN】 |
| HS30 | 角色预设 definition（`agent.cordis.yml` 第二文档 → `preset-definition-<role>.generated.yml`） | 4 角色的 id/order 由 `ROLE_IDS`/`ROLE_ORDERS` 统一校验（身份常量不承载权限）；personaPrefix 由作者源逐字搬运、extra-plan 行 config 由主预设同 id 行逐字复制（含 gateWords）；各角色均挂 `tool-web`（fetch:false、searchTimeoutMs:60000）与只读 `tool-cordis`，四角色 definition 均不挂 `tool-subagent-control`/`send_message`/`interrupt_agent`；main definition 保留 `tool-subagent-control` 与 `list-agents`。运行时按原始 `isSubagentChild` 对 child 的两控制工具直呼与 `run_code` 成员硬拒，覆盖 unknown/断链 child；main 的 send 直属父子、interrupt 仅调用者获授权后代、running 子原禁扰与自动最终结果保持。planner/reviewer/prober 的 `dsh-tool-fs` 置 write/edit=false，executor 保留 write/edit 与既有两行 shell；四个角色 definition 的派生范围跟随同一 `toolPresentationMode`（各恰一行 `tool-presentation`，派生异常保留生成物默认值且不抛错）；生成物不得手改；native/PTC 双模式由宿主回归实际 mount、schemas/get、sdkSchemas 与 SDK 文本解析取证 | 【已核实·静态+宿主回归；真实消息/中断 HUMAN】 |
| HS31 | `pe-test/tools/step-05-角色预设宿主回归.mjs` | 两个串行独立 Context 注册原始五 ID；各模式真实 agents.create + preset mount，planner 两模式均以原 ID 与 `isPlannerChild` 核实；每角色/每模式以 `tools.schemas`/`tools.get` 同时核实 `send_message`/`interrupt_agent` 缺席和 Cordis 两工具存在；PTC F 顶层仅 `run_code` 且 `tools:sdk` 无 control 文本；Cordis schemas/get 仍在；保留 roster、三键 tool-subagent、只读/可写、persona、both 回落与禁委派/list_agents；不证明真实父子投递/中断 | 【已核实·集成；真实 provider/模型/GUI/消息/中断 HUMAN】 |
| HS29 | `pe-test/_shared/host-deps.mjs` | scoped package exports 按完整 `./subpath` 解析；根入口与 `/list-agents` 分离；根包无可用 exports/main 时回退 `index.js`，显式未知子路径透传；同步/异步 hook 共用语义，生成 data URL hookSource 需 ESM 回放 | 【已核实·step-01 安装同步；真实宿主/HUMAN NOT-RUN】 |

## ②-A Web→QQBot 镜像路径契约（独立于 HS4）

| 项 | 当前合同 | 状态 |
|:--|:--|:--|
| Web→QQBot 真源 | Web `configEditor.documentPath` 首选；由 `profiles/web/cordis.patch.yml` 反推同级 `profiles`，不从当前进程 cwd 或用户目录猜测 | 【已核实·专项】 |
| 显式授权边界 | 真实运行时只接受可信 `profileContext.name`/`startedBundles` 与精确能力；维护数据须显式 `--host-root` 加精确 `--profile`/`--file`/会话目标。`DSH_HOME`/`DSH_PROFILE`/`SESSION_ID`、homedir、USERPROFILE/HOME 与 `home/.dsh` 均不授根；`DSH_INSTALL_ROOT`+host-preload 只授只读代码根 | 【已核实·专项】 |
| 标准 Web/QQ 身份与双锚点 | 仅 `profileContext.name='web'` 且 `startedBundles`/直接同级 profile 的 `package.json` 与 `node_modules/dsh-extra-plan-qqbot` 双锚点一致时做 Web→QQ 镜像；QQ 当前 profile 返回 `not-applicable`，不误启动跨 profile | 【已核实·专项】 |
| 持久化范围 | 同步完整 10 项与完整 `gateWords`；局部 YAML 安全改写保留未知行、注释、`!!js` 与嵌套 insert，写前临时文件/备份/落盘后终验并支持恢复 | 【已核实·专项】 |
| 状态与生效 | `synced` 仅代表标准 Web→QQ 镜像；QQ owner 不适用为 `not-applicable`，另区分 `not-installed`/`unavailable`/`failed`/`partial`；8 项沿既有热读，`webFetch` 与 `toolPresentationMode` 为 2 项宿主重启生效，不发送跨进程 reload | 【已核实·专项】 |
| 与 HS4 边界 | `live-config.js` 的 `DSH_EXTRA_PLAN_CONFIG_PATH` 热读优先级只服务 Web 核心消费，不是跨 profile 根定位依据；两条用途不得混用 | 【已核实·专项】 |

### ②-B settings-only no-remount 生命周期合同

| 场景 | 允许动作 | 禁止/失败语义 | 状态 |
|:--|:--|:--|:--|
| 首次启动 | 读取/迁移 settings、构造 17 条纯 definition；官方 AgentPreset 主预设 register=1 仅表示主 definition 一次注册，同轮按主 1 份 + 角色 4 份共 5 份尝试挂载 | 旧 owner/旧行参与结构指纹与 adapter 诊断，不据此抑制挂载；同 ID 可能失败，真实相遇效果仍 HUMAN | 【已核实·专项】 |
| settings-only | 读取最终完整 10 项 + `gateWords`，settled-only 队列直接交 `profileSync`/QQBot | **no-remount**：adapter register/dispose/rebuild 均不得发生；不调用、不等待、不 dispose 官方 AgentPreset | 【已核实·专项】 |
| structuralHandoff | 仅非 settings 声明结构变化或旧 owner ↔ 官方 transition 才进入 adapter/structural 队列 | 与 settled-only 分离；adapter failure/reject/hang 不得撤销 Web 或阻断 QQBot 同步 | 【已核实·专项】 |
| profileSync | 初始 `pending=true`，terminal 后 `pending=false`；记录真实 `synced/not-applicable/not-installed/unavailable/failed/partial` | 禁止 `pending/pending=false`、把 QQ 的 `not-applicable` 伪造为 `synced`、双端成功伪造或用 adapter register 充当保存成功条件 | 【已核实·专项】 |
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
| SD13 | v4 request/header 不落 system 字段；system 段以独立 system/message 事件落盘（source.kind=system-prompt） | F 段=bootstrap persona 与手写 tool:read 文案、L 段=宿主原文（含 run_code SDK 指引）；tools:sdk 判据观察面以 system/message 为准（2026-10-23 实机复现） |
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
| SD39 | agents.get(id).status | AgentRegistry.get(id)（dsh-agent）返回驻留 Agent，.status getter 真源 dsh-agent-loop：phase idle/maintenance（空闲/维护）→ 'idle'，否则 'running'（运行中）；插件经 ctx.get('agents') 查询 main `send_message` 目标运行状态，child 不进入该放行路径 |
| SD40 | ToolExecution.agent / arguments.agent_id | main `send_message` 方向判定契约：agent=调用者、arguments.agent_id=目标；child 控制工具由 `isSubagentChild` 硬拒；SD25 字段清单未列 agent 字段，此处补记 |

SD9 是历史缺定义编号、保留不补；SD34 是本插件不调用 `sessionProjections.stateOf` 的反向记录；SD13 已由 2026-10-23 实机核证定义为 system 段落盘形态合同。

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
| CF12 | `@deepseek-ai/*` 不进 dependencies；dsh/dsh-llm peer 与 `engines.dsh` 精确钉五版本并集 `0.2.1-rc.1 || 0.2.1-rc.2 || 0.2.1-rc.3 || 0.2.1-rc.4 || 0.2.1-rc.5`；bundle 不兼容时 skipped/disabled | 【已核实·静态；rc.2 门控核对沿用既有来源，rc.1/rc.3 无样本 NOT-RUN，rc.4 为只读代码样本/隔离自动；profile 清理与 422 消失待 HUMAN】 |

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
| QB19 | QQBot bundle patch 第五行 `- insert:` 下保留 canonical 行 `id: dsh-extra-plan-settings` / `name: dsh-extra-plan/settings`；核心 bundle/预设仍由核心独立提供 | 【已核实·源码静态；受控 compose 有效实例】 |
| QB20-QB21 | `scripts/heal.mjs --install` 为 postinstall 严格入口：单目标、patch/link/最终 realpath 失败 exit 1；普通无参启动兜底告警但 exit 0 且不阻断；allow-build 放行与实际生命周期安装待 HUMAN | 【已核实·源码静态；lifecycle 尚无完整通过证据】 |
| QB25-QB26 | 静态服务/config.default 断言与间接消费 extra-plan | 【已核实·静态】 |
| QB27/QB31 | 一键 AUTO/四态汇总仅引用对应原始证据；install、compose、cache 分开判定，install/cache 的 INCOMPLETE/NOT-RUN 不改写为 AUTO PASS；只有实际证实跳钩子且缺链才记 CACHE-BLOCKED，受限 child-spawn EPERM 保持 INCOMPLETE；六项 HUMAN 单列且不销账 | 【已核实·证据边界】 |
| QB28-QB30 | 五条件预检、junction 能力、真实 profile 只读映射；缺环境/权限为 SKIP | 【已核实·静态；SKIP 不销账】 |

QB6/QB7 旧包匹配、QB22 根 README 文档入口属于历史/导航说明；QB4、QB23、QB24 继续列为未核实，不改成通过。

## ⑦ 五版本声明下的风险与开放验证

1. isolate 审计：`mountPreset/leakedServices` 对未隔离 root service 抛错；必要/保险名单必须保持 `isolate: true`。
2. settings 换代：设置表单仅经 `plugins.detail.section` 渲染于当前插件包详情行列表之后（自绘标题），不注册 `plugins.bundle.config`、`plugins.row.config`、`settings.plugins.tab` 或 `plugins.item`，若本包 bundle.config 槽被任何一方注册条目则 detail.section 让位保持唯一表单；ConfigForms 通过稳定 namespace 订阅快照并一次 mutate 十项。settings 行 10 项 Config、API、旧值迁移、内存 definition/adapter 仍是活动后端合同；截至 2026-10-01，0.2.1-rc.2 同页 UI/A09/A10/A11 仍为 HUMAN 待复测。
3. profile patch 载体：旧 `.agent-presets` 无读取方；`compatibility.json`/peer 门控可能使 bundle skipped、loader disabled；QQBot 仍有 allow-build/postinstall 欠账。
4. 包/服务换代：workflow-ptc/tool-workflow/tool-ralph 三段在作者源里已注释（暂不挂载，恢复条件见 agent.cordis.yml）；`ptcRuntime` 服务名、tool:cordis 只注册两项只读工具、Client 查询有界等待（默认 10000ms 为配置口径、非实测）、`bundledSkillDir`（配 `watch:false`；旧 `customSkillDirs` 已删）必须按当前真值核对。MCP `publicToolName` 只允许 `[A-Za-z0-9_-]`（当前前缀形如 `mcp__chrome-devtools-mcp__...`），不支持点或 Unicode；静态扫描器仅同步连字符与注释遮蔽合同。descriptor 属 child、catalog 属 parent；保留 header-first+descriptor，不新增运行时兼容分支。
5. 五版本声明不等于五版本实机通过：rc.1/rc.3 无实机样本为 `NOT-RUN`，rc.5 仅有只读静态核对、同样为 `NOT-RUN`，rc.2 仅保留既有证据来源，rc.4 仅有只读代码样本与隔离自动结果；任何一版均不得据此推出未取证的跨代实机结论。
6. session v4：`session.v4.jsonl.zstd`、自有 source.kind、developer/message 坐标和 step-07 三代候选必须保留。
7. CF12 422 开放 incident：profile 中宿主运行时副本曾导致 `tool_removal` 422；清理 profile node_modules/lock、污染会话续聊、native↔PTC 切换三项均待用户验证。当前单一全局行、内部 carrier、内存 definition/adapter 仍需用户部署后 HUMAN 验证。native↔PTC 切换的会话边界与规避见 ⑭。

### 当前验证状态

| 版本 | 当前证据与边界 | 当前结论 |
|:--|:--|:--|
| `0.2.1-rc.1` | 无样本、未下载/安装、无实机取证 | `NOT-RUN`；不销账 |
| `0.2.1-rc.2` | 静态/集成证据沿用既有新宿主根实跑；来源不变且证据等级不提升 | `【既有证据·集成】`；真实 provider/模型行为/GUI/生产 profile/QQBot 消息/`/preset`/question/approval/postinstall/allow-build 仍 HUMAN |
| `0.2.1-rc.3` | 无样本、未下载/安装、无实机取证 | `NOT-RUN`；不销账 |
| `0.2.1-rc.4` | 显式 `DSH_INSTALL_ROOT=<本次真实代码根>` 仅作只读 Host 代码样本根；当前统一证据入口为 [acceptance.json](../../.extra-plan/evidence-dsh-extra-plan-review-fix-20261031081834/acceptance.json)（收尾生成，源码 SHA 与原始日志逐项匹配），均不替代真实部署 | `【已核实·静态/隔离自动】`；静态/隔离自动完成，正式统一取证与真实 Web/QQ/GUI/Provider/模型/消息/重启仍待 HUMAN 或待 V，不由此销账 |
| `0.2.1-rc.5` | 临时兼容性验证根 `E:\Soft\AI项目\dsh-v0.2.1-rc.5` 只读静态核对，并以该安装树作 `DSH_INSTALL_ROOT` 实跑 step-00/step-04/step-06/step-01-预设完整性/step-01-设置页配置/step-01-qqbot-环境验证 通过（失败 0）；统一证据入口为 [summary.md](../../.extra-plan/evidence-rc5-20261031/summary.md)（6 脚本共 2088 通过 / 0 失败 / 1 SKIP，退出码全 0，log 首行证明宿主解析为 0.2.1-rc.5）；不替代真实部署 | `【已核实·静态/隔离实跑】`；真实 provider/模型/GUI/QQBot 消息/preset/question/approval 与生产 profile 仍 HUMAN，不销账 |

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

- 核心入口 `plugins/dsh-extra-plan/index.js` 负责宿主 hook、配置快照与 session-scoped 状态；统一全局 owner 由 `lib/settings.js` 调度 `lib/preset-sync.js`，设置合同由 `lib/preset-settings.js`/`lib/settings-contract.js` 提供；`lib/client.js` 仅经 `plugins.detail.section` 接线稳定 namespace 的唯一共享表单（bundle.config 槽若有本包条目则让位）。角色身份与装配顺序由 `lib/role-contract.js` 提供，不参与权限策略。
- QQBot 启动默认路径仍为 `plugins/dsh-extra-plan-qqbot/index.js#apply` → `lib/heal.js#healQqbotCompatibility`；严格安装入口为 `scripts/heal.mjs --install`。自愈只处理当前明确 profile；必要的一层候选发现最多 128 个，超限只出诊断，不跨 profile 启动，CLI 不改变启动不阻断语义。
- 当前静态核对不等于部署通过；真实 profile、消息、`/preset`、postinstall 和 allow-build 仍按本台账 HUMAN 项执行，严格入口不扩张核心/生产写入授权。

## ⑨ 升级 checklist（核对清单，顺序固定）

- 维护数据取证先显式选择 `--host-root` 与精确 `--profile`/`--file`/会话目标；会话只能用 `--session-dir`，或 `--session`+`--sessions-dir`，`--discover-children` 才开启一层发现（最多 128 候选、每个日志头 262144 字节）。无选择为 `NOT-RUN`/目标 IO 0，Host 统计最多两次稳定观察，Host archive/清理 `--apply` 零写拒绝；`DSH_INSTALL_ROOT`+host-preload 仅用于只读代码根。AUTO 数量按实际 runner 数组为 14，正式 13 脚本矩阵另列。

1. 从当前 `dsh` 命令与安装 `package.json` 只读取得绝对安装根后显式设置 `DSH_INSTALL_ROOT`；版本声明范围为 `0.2.1-rc.1 || 0.2.1-rc.2 || 0.2.1-rc.3 || 0.2.1-rc.4 || 0.2.1-rc.5`，rc.1/rc.3 无样本记 `NOT-RUN`，rc.4 只读样本根必须由本次命令显式提供，rc.5 仅有声明文本的只读静态核对、HUMAN 未跑，不写死机器盘符。再从 W 运行 `DSH_INSTALL_ROOT=<本次真实代码根> node --import ./pe-test/_shared/host-preload.mjs pe-test/tools/step-01-qqbot-安装映射.mjs`，再运行同前缀的 `step-01-qqbot-环境验证.mjs`；静态先行，环境项条件只读，SKIP/HUMAN 不销账。
2. `DSH_INSTALL_ROOT=<本次真实代码根> node --import ./pe-test/_shared/host-preload.mjs pe-test/tools/step-01-设置页配置.mjs` 与同前缀的 `step-04-路由与写闸门.mjs`；确认全局 owner/configEditor 后端合同、detail.section 同页唯一表单（行列表之后）、A09/A10/A11 与工具呈现面。
3. `DSH_INSTALL_ROOT=<本次真实代码根> node --import ./pe-test/_shared/host-preload.mjs pe-test/tools/一键step测试.mjs`；AUTO 数量按实际数组为 14，正式最终回归的 13 脚本矩阵与两项 check 另行判读，不能混称；HUMAN/参数项按四态判读。
4. 按 HS/HK/SD/CF/QB 当前表，先钩子 mode，再服务方法，再事件/Session 形状，再 bundle/exports/patch/isolate 契约；旧 API 只作负向核对。
5. `node pe-test/tools/代码地图生成.mjs --check`，退出码必须为 0；地图只读 W roots，临时测试 map 也在 W，人工描述/固定尾部另做对拍；本组不生成正式地图。
6. 逐条复核本节六项 HUMAN；保留未核实状态，用户部署后再销账。

## ⑩ P2-4 与 gateWords 当前合同

- `agent.cordis.yml` 的十项设置叶值由 `SETTING_DEFINITIONS` 的 sourceLocator 唯一定位；`generate-runtime-defaults.mjs#runtimeDefaultsFromTemplate/renderRuntimeDefaults` 生成 `DEFAULT_SETTINGS` 与兼容别名，运行时由 settings contract、Config/fallback、快照和 preset-sync 统一消费，不解析作者 YAML。
- 角色作者源与主预设同文件（`---` 分隔多文档）：第一文档=主预设 17 条顶层条目，第二文档=4 角色定义；人工真源收敛为 1 个文件，生成器按首个 `---` 行切分（主 definition 边界止于分隔行，角色数据取自第二文档）；`parsePresetYaml` 只取首文档，角色侧另走第二文档读取。
- `SETTING_DEFINITIONS` 的 validator/合法性与 UI metadata 仍是合同手工来源；`createDefaultSettings()` 提供非共享默认快照，`preset-yaml#hostRowDefaultsFromTemplate` 的兼容 fallback 也回到生成默认对象，不作为 settings/sync 的作者 YAML 读取入口。
- `client.js` 的三组字段常量只允许生成器在成对标记区块内更新；默认仓库路径七个输出一并校验/发布，自定义 source/output 默认关闭仓库 client，显式 client source/output 才启用。
- 迁移顺序固定为先生成并验证新导出，再切换消费者；生成器先完整 parse/validate/编译，再同目录暂存、备份、顺序发布和逆序有限回滚。`--check` 零写；失败不保留新版本，恢复失败保留首错、阶段和残留诊断。
- `preset-sync` 的 idle（空闲稳态）以全局行十项权威值、旧值兼容读取与 gateWords 派生收敛为准；旧 `extra-plan-preset-sync` / `preset-extra-plan` 只读迁移，不写旧 body/旧公开行；新写入只走唯一全局行 `configEditor.edit`，无 manifest（清单）台账。
- gateWords 是 YAML 七键唯一值源；apply 先 `createGateRuntime`，当前 agent scope 注册七个 `systemPrompt.variable`；deny、match、状态机和投影都消费当前词表；旧词不推进。
- `system-prompt/assemble` 的模型可见副本必须保留 variables 映射；宿主严格渲染失败、变量缺失或未知变量属于升级敏感面，静态台账不冒充实机通过。

## ⑪ 生产注入与取证合同

- settled callback 在触发时经 `editorOf(undefined)` 使用 `ctx.get('configEditor')` 解析当前服务；`mountPresetSync` 仍只在 `ctx.inject(['configEditor'])` 的 child 作用域读取 editor，未把 child 捕获到外层。
- 受控证据合同分四态 host-proxy：`normal-injection` 要求外层直接访问保留 `cannot get property "configEditor" without inject`、ctx.get 成功、初始 settled 先于 adapter；`get-only/no-op-inject` 为 `HUMAN`（`HOST-PROXY-GET-ONLY`），不得以 register=0 销账；`inject-throws` 与 `child-missing-configEditor` 保留显式失败。
- 单字段触发仍核对完整十项 values 与完整七键 gateWords，并对 Web patch、每个 QQBot patch 与 terminal 输入做同一快照对拍；旧 no-remount 结果只作历史归档，不能销当前验证状态。
- 缺少显式 `DSH_INSTALL_ROOT` 的只读代码样本记 `NOT-RUN`；缺少 `--host-root` 或精确 Host 数据选择时为 `NOT-RUN`/目标 IO 0，不由环境变量补根。真实宿主/provider/profile、生产 QQBot、GUI、消息链与重启仍保持结构化 `HUMAN`；本项目维护只写工作区，不作生产副本部署。

## ⑫ 唯一 settings 行与可关联保存终态

- canonical 权威行固定为 `id=dsh-extra-plan-settings`、`name=dsh-extra-plan/settings`；`inspectSettingsAuthority` 同时报告 raw/effective/canonicalName 计数、选中 name、documentPath、候选摘要。raw 或 effective 不唯一时 GET/PUT 返回 409 conflict，PUT 在 `editor.edit` 与 synchronizer enqueue 前停止。
- 每次 API PUT、`settled-initial`、`settled-update` 都生成 `saveRunId`、单调 `syncRevision`、固定 10 项 values + 7 键 gateWords 的 `snapshotHash` 与 trigger；PUT 返回 request/terminal 全等，GET 无参数只显示 `source=last-terminal-cache,cache=true,terminalMatch=false`。
- Web 与每个 QQBot 目标分别保留 bytes/mtime/raw SHA、managed snapshot hash、backup 路径/SHA；raw SHA 可不同，但 managed hash 必须和 request snapshotHash 相等。外部 writer 漂移归类 `drift-detected`，不回写旧 backup。
- `creativeMode` 自动验收只看双端即时 patch/managed hash 和 terminal 关联；运行时重启、真实 profile 清理、QQBot 消息链继续 `HUMAN`。

## ⑬ UI 保存不产生 internal/update（宿主契约事实）

- 真实 UI 保存走宿主 ConfigForms `form.mutate`（dsh-client-ui-settings ConfigForm.mutate → remote.settings.mutate → settings.mutate → configEditor.edit）；10 项 settings 字段全部 `.volatile()`，Loader 判定 volatile-only（`equalExceptVolatile` 把 volatile 字段视为相等）后就地替换 `fiber._config` 直接 return，不调 `fiber.update`，`internal/update` waterfall 根本不运行（cordis 4.0.4 宿主源码核对）。
- 即使产生该事件，`internal/update` 也是 fiber 定向 waterfall（非 global 注册存入注册者 `child.fiber._hooks`，`thisArg`=被 update 的 fiber）；`preset-sync.js` 的监听器位于 `ctx.inject(['configEditor'])` child fiber ≠ settings 行 entry.fiber，永远收不到。两层都断 ⇒ 保存时不产生可消费的 settled 链。
- 结论：UI 保存的 QQBot 同步主触发是 client.js saveAll 第二步同源 PUT（`api-put` trigger，无条件全量 syncEditor）；settled 链仅作 Web 宿主重启/装载兜底（settled-initial）。真实生产漂移、旧批次证据和部署动作保持 HUMAN，历史经过见[宿主耦合历史归档](ai-宿主耦合历史归档.md)。

## ⑭ toolPresentationMode 切换与会话边界（0.2.1-rc.2 当前合同）

**一、操作契约**

- 切换 `toolPresentationMode` 后必须重启 Harness 并**新开会话**；原会话在切 mode 后不可继续。
- `native` 开头的会话切到 `ptc` 并重启后，resume 该会话的每一轮请求都以 400 被拒，上游原文为 `tools: at least one tool must have defer_loading=false. All tools cannot be deferred.`（code `INVALID_REQUEST`；宿主只透传上游 message，不做本地校验）。
- 同配置下**新开会话**正常：工具面只有 `run_code` 且不带 defer 标记，可正常回答。
- 把 mode 切回 `native` 并重启后，该原会话恢复（投影回到 25 个直呼工具、零 deferred）。
- 边界：本条只约束 `toolPresentationMode` 切换；`creativeMode` 属 8 项热读；`runcodeCatchGate`（U9）继续热读、无需重启/新开会话，`gateWords` 则在 apply 时捕获，改词需重启 Harness（不因词表切换要求新开会话），均不改变本契约。

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

**四、当前验证状态**

- 真实宿主重启、provider、GUI、生产 profile、消息链与中断保持 HUMAN；历史现场实测/重放原文只在[宿主耦合历史归档](ai-宿主耦合历史归档.md)追溯。

**五、状态行**

【已核实·集成（复现）】：wire 形态由宿主模块在真实会话数据上重放得出，400 原文以上游返回为准；不作通过、不销任何 HUMAN 欠账。

## ⑮ settings 行定位合同与重复行风险（0.2.1-rc.2）

**一、定位规则（id + 规范 name）**

- settings 行按「id = `dsh-extra-plan-settings` 且 name = `dsh-extra-plan/settings`」精确定位：`lib/settings-contract.js` 的 `settingsRowLocator` 产出 `rowName: SETTINGS_ROW_NAME`，`lib/preset-yaml.js#resolveLocator` 先按 id 收集候选行、再按 name 严格相等过滤，之后才走「0 行 missing / 多行 ambiguous / 1 行读叶 ok」的既有分支。
- 旧别名 `@local/dsh-extra-plan/settings` 不再作为候选：该 descriptor 的 `locatorAliases` 已清空，`resolveSetting` 不再把旧名字行并入候选集。
- 同 id 多行时：只有一行是规范名 → 取规范行（ok）；都非规范名、或都规范名 → ambiguous。`locator` 不带 `rowName` 的旧调用（源模板行、宿主行投影等）行为与收紧前逐字一致。

**二、宿主事实（重复行不报错）**

- Cordis Loader 对同 id 条目不做唯一性校验、不报错（静默共存）：0.2.1-rc.2 安装根 `node_modules/@deepseek-ai/cordis-plugin-loader/lib/index.js` 的 `ensureId` 只为缺 id 的条目补随机 id（且仅避让 `store` 键），入口装载与 `resolve` 均无唯一性断言，因此 profile patch 里并列的两条 `- id: dsh-extra-plan-settings` 不会被宿主拒绝。
- 插件侧因此多命中：只按 id 收候选会拿到 2 行 → ambiguous → 回退 apply 期 cfg 快照/兜底值，可能表现为用户值未生效。

**三、装载期严格校验与运行期热读**

- 装载期（apply 构造 `createLiveConfig`）严格校验：settings 行存在但出现缺键（missing）、非法（invalid）、多命中（ambiguous）→ 直接抛 `extra-plan: settings 行校验失败：<key> = <state>（期望在 dsh-extra-plan-settings 行、name 为 dsh-extra-plan/settings 的 config 内取得合法值）`，插件拒绝装载。
- 整行缺席（首次安装、profile 无任何 settings 覆盖）仍按出厂形态静默：不抛错、不告警，整组取 cfg 快照。
- 运行期热读保留 fail-safe（未 captured 的键一律沿用 fallback，fallback 取值顺序不变），但 ambiguous 与 invalid 改为 `warnOnce` 告警，missing 仍静默——配置被改坏变得可见，不再无声吞掉。

**四、当前验证状态**

- 生产 profile 清理、历史 bytes/SHA/行数、skill catalog 现场值和夹具修正经过已移入[宿主耦合历史归档](ai-宿主耦合历史归档.md)；当前不以历史现场结果销账，部署复测仍按 HUMAN 保留。

**状态行**

【已核实·静态（待部署复测）】：不作通过、不销任何 HUMAN 欠账。
