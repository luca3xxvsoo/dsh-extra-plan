# 按需规划模式（AI 入口导航）

> 本文件是导航层：先读这里，按「想查什么」打开二级文档；本文档不存机制细节，只保留导航与易漂移的数值/投影口径锚点（防漂移与信息过载）。
> 运行时行为以 persona（agent.cordis.yml 注入内容）与机械闸门为准。

## 项目一句话
dsh 插件「按需规划模式」预设：AI 未经用户同意不得修改源码/配置/执行态，经路由/目的/澄清/批准四级机械闸门后按规划执行；路由确认前唯一写例外 = 受限规划工件 save_plan（任意路由态可落盘 cwd/.extra-plan 的固定形状方案/验收双文件，内容闸门与目录/文件名形态不变），save_probe 仍限 pro 规划窗口（route=plan + 目的已定 + 澄清完成）；Pure PTC 顶层始终只保留 run_code。
五角色：主会话（入口协调）→ 探查者（只读批量+证据落盘，**仅主会话可委派**）→ 规划子代理（方案+验收双文件，不得委派探查者）→ 执行者（按方案改）→ 验收者（逐条核对）。save_probe 的 `PROBE_LIMITS` 当前为 evidence 150 条、单条 evidence.text 1000 字；step-00 PR23=151、PR34/PR35=1000/1001；exploreBudget=18 与台账历史 80/209 是不同口径。
兼容：**仅 dsh 0.1.7-rc.1 / 0.1.7-rc.2**（package.json peerDependencies 精确钉 `'0.1.7-rc.1 || 0.1.7-rc.2'`——两版逐字列举、无 ^/~ 范围符；不再支持 0.1.2-rc.1~0.1.5-rc.2 同码兼容；rc.1↔rc.2 契约复核见 ai-宿主耦合台账.md §⑦-2）；qqbot 0.5.0 版 + 精简版 dsh-qqbot-user-questions（仅自愈+mklink，选装；qqbot 侧两行按新包族静态重写，**【待有 QQBOT 环境再测试，本机不做验证】**）。A=anchoredBootstrap、C=creativeMode、M=toolPresentationMode（native/ptc/both），F=尚无 tool/call、L=首个 tool/call 后。
A=1/F/main-planner：M=native/both 为 HN/HB（bootstrap shell(s)+read，sections 仅 extra-plan-bootstrap，无 tool:read）；M=ptc 为 HP（顶层仅 run_code，sections 精确为 extra-plan-bootstrap、tool:read 两项；宿主 tools:ptc-only 段已停用、不再下发，其中 read 文本由插件手写 cfg.bootstrapReadHint（空串/非字符串回退内置中文兜底），不含完整 tools:sdk/Cordis）。A=1 的 L 与 A=0 从 N/P/B 基线（N=native/P=ptc/B=both）开始；C=0 全角色隐藏 2 个 Cordis 展示项且**三个创造 skill**（cordis-plugin-development / editing-cordis-compositions / cordis-composition-reference）不出现在 catalog（取径已改 static `customSkillDirs`，见下「新载体」节），C=1 不因 C 隐藏——非 HP1 且非 anchored 时保留完整 SDK/Cordis/三个创造 skill，HP1 仅 F/main-planner 暂隐 catalog。以上是模型可见投影，不是 runtime binding 安全隔离（详见 ai-流程备查.md / ai-机制设计.md）。

## P2-2 SDK 文本复用边界（终版）
- 缓存只存在每个 plugin `apply` 闭包内的 agent-keyed WeakMap：同一 agent 对象同一 session 的 L 首次生成、后续相同有效输入复用；不按 sessionId 跨 agent 共享，不缓存 PromptAssembly/sections/tools/contexts/persona，不落盘。
- F/L 严格分离：F/PTC 不再生成任何 SDK 文本（`tool:read` 段由预设键 `bootstrapReadHint` 手写），因此不读写完整缓存；F/native 与 F/both 不渲染随后会被剥离的完整 SDK；L 且 C=0、存在 `tools:sdk` 才取得 live effective schemas，整体重建并查询缓存。
- 命中三元组 = `sdkSchemasForRendering` 后完整嵌套输入的保守结构指纹（保留数组/对象键顺序与字段存在性）+ 原始 language 字符串 + active renderer 函数引用；schema、language、renderer 任一变化即失效，无法无损指纹则 miss 且不写入。
- 同 key 并发共享 in-flight Promise；renderer reject、调用方 catch 的空文本降级、过期 Promise 均不缓存/不回写；agent/disposed 先 dispose（即使缺 sessionId），新 agent、new apply、部署或重启从空缓存开始。
- step-04 的 renderer 调用计数是硬门槛：PTC F→L→L 两次相同完整 L 必须精确调用 1 次且文本逐字相等；耗时只报告、不设毫秒阈值。P2-3 不在本批；根 `README.md`、ai-宿主耦合台账与官方安装目录不改。

## 文档索引（想查什么 → 打开哪个）
| 想查什么 | 打开 | 建议时机 |
|:--|:--|:--|
| 项目全貌/文件职责（改哪里） | pe-test/docs/ai-概览.md | 每次动手前 |
| 体检工具包怎么跑（普通用户版） | pe-test/README.md | 装完插件第一次体检时 |
| 核心机制为什么这么设计、历史教训 | pe-test/docs/ai-机制设计.md | 改闸门/预算/落盘/裁剪等核心前 |
| 维护纪律+自检+地图同步 | pe-test/docs/ai-维护手册.md | 动手前、改完后 |
| 函数在几行/干什么 | pe-test/docs/ai-代码地图.md | 定位功能时：**先看文件头部「意图速查」**（意图词 → 函数名），再按函数名到索引区取行号区间 |
| 完整流程（实际机制校订版） | pe-test/docs/ai-流程备查.md | 流程细节拿不准时 |
| 宿主耦合点全表（DSH/qqbot 升级比对） | pe-test/docs/ai-宿主耦合台账.md | 升级 DSH/qqbot 前必读 |
| 预设新载体与 isolate 名单（0.1.7-rc.1） | 本文下方「新载体」节 + pe-test/docs/ai-机制设计.md | 改预设行/加服务行前必读 |
| PTC 首轮 F→L 与 native/both HN/HB 回归实机取证 | pe-test/docs/ai-实机闸门测试流程.md | PTC 的 C=0/C=1 各用干净新顶层会话；both 回归独立 |
| 子代理模型/提供方与 pro规划引导实机取证（A42/A43、C11/C12） | pe-test/tools/step-07-子代理模型与引导取证.mjs | 首次实机取证前；已优化为两阶段流式头扫描（只解析命中子会话），不加堆参数默认堆可跑通 |

> 脚注（step-07 行用法）：HUMAN：显式 SESSION_ID + PLANNER_PROMPT_SUFFIX；request/header attempted route、assistant/message actual provenance、suffix 等级分栏。内存口径：先只读头信息筛出直接 child、再只解析命中目录（事件不再保留 raw 行），配合 `_shared/session-finder.mjs` 首行读分块渐读，277 份会话工作区下默认堆可跑通。

## 必守纪律（一句）
改前逐文件备份到 `.extra-plan/backup-<任务名>-<timestamp>/`（与维护手册备份条款口径一致）；工作目录固定为 dsh-extra-plan（仓库根）；改完按固定顺序执行根入口与 9 个新增 lib 的 `node --check`（`plugins/dsh-extra-plan/index.js`、`lib/run-code-static.js`、`lib/save-contract.js`、`lib/save-probe-validation.js`、`lib/save-persistence.js`、`lib/save-tool-factories.js`、`lib/agent-session.js`、`lib/model-routing.js`、`lib/assembly-presentation.js`、`lib/sdk-text-cache.js`），再运行 `node pe-test/tools/step-00-全流程回归.mjs`、`node pe-test/tools/step-04-路由与写闸门.mjs`、`node pe-test/tools/step-06-线索落盘.mjs`、`node pe-test/tools/代码地图生成.mjs`，人工段维护后执行 `node pe-test/tools/代码地图生成.mjs --check`，最后执行 `node pe-test/tools/一键step测试.mjs`。**改完不同步地图 = 一键体检「代码地图一致性」判红**。**唯一禁改文档：根 `dsh-extra-plan/README.md`（与 READAI.md 同层级）；其余文档（含各级 README.md、pe-test/docs/ai-宿主耦合台账.md）均可改；官方安装的预设与技能只读引用、不复制不改写。**

## PTC 拒绝中文呈现兜底与状态机口径（2026-09-23）
- **PTC 子调用被闸门拒绝 → tools/post-execute 把失败结果 content 改写为 `Error: <中文 reason>`**：pre-execute deny 时按 sessionId→rootCallId 记录本次 reason，post-execute 在 run_code 失败结果的 `error.message` 含精确子串 `ToolCallError: <reason>` 时只替换 `content`（PostToolDecision 禁止对失败结果替换 value），模型不再看到 `code run failed (exception)` 与 worker.cjs 堆栈；未命中/非 run_code/非失败一律 `next()` 透传（不吞错），记录消费即清、agent/disposed 按 session 清桶。
- **状态机对闸门拒绝不重置路由、用户取消仍清四字段**：`kind:'denied'`（插件中文拒绝文案）不改任何状态字段；用户取消/中断（native 直呼码 ASK_CANCELLED、嵌套为宿主取消句 HOST_ASK_CANCEL_TEXTS）仍走 resetRouteState 清 route/purpose/clarified/approved；CHANNEL_BROKEN_CODES 只置 channelBroken。
- 宿主接触面登记见 pe-test/docs/ai-宿主耦合台账.md HK25（0.1.2-rc.1 实测；0.1.5-rc.2 已于本机静态契约复核通过——钩子签名、waterfall 语义、PostToolDecision 形状、content 替换允许性及该版新增两条守卫均不触发；实机行为面待部署后实测）；用例见 step-04 ⑮ DZ1-DZ12。

## 真相源
（以下路径相对 plugins/dsh-extra-plan/）
- 角色 persona/deny 清单 → assets/presets/extra-plan/agent.cordis.yml（预设本体 = 生成产物 `assets/presets/extra-plan/preset-patch.generated.yml` 的声明行 `config.plugins`，与 agent.cordis.yml 顶层条目逐字一致）
- 闸门关键词值（唯一真源） → assets/presets/extra-plan/agent.cordis.yml 的 config.gateWords（7 字段；JS 侧 schema/校验/派生见 lib/gate-words.js，无词值）
- 函数行号/描述 → pe-test/docs/ai-代码地图.md（唯一来源模块登记：lib/agent-session.js 会话快照/子代理识别）
- 机制「为什么」详版注释 → 各源码文件注释（指向见 ai-机制设计.md 教训索引表）

## 新载体与 isolate 名单（0.1.7，rc.1 起 / rc.2 沿用；v0.3.0）
- **预设载体换代**：预设不再是「分发到 `$DSH_HOME/.agent-presets/extra-plan` 的目录」（0.1.7 无任何读取方），而是 profile patch 根级 insert 一行声明行 `preset-extra-plan`（`name: '@deepseek-ai/dsh-agent-preset'`，`config{id,name,description,order,plugins}`），其中 `config.plugins` = `agent.cordis.yml` **顶层 17 条目**（group 3：extra-plan-group/compaction/delegation + 普通行 14；组内子行 14，总 31）逐字平移。产物由 `scripts/generate-runtime-defaults.mjs` 生成到 `assets/presets/extra-plan/preset-patch.generated.yml`，随 `package.json` 的 `dsh.bundle.patch` 数组 `['./cordis.patch.yml','./assets/presets/extra-plan/preset-patch.generated.yml']` 装载；**该文件是生成物，禁手改**（改预设只改 `agent.cordis.yml`，再跑生成器）。
- **postinstall 已删除（2026-09-25 死代码清理）**：不再初始化任何状态目录（0.1.7 无读取方）；启动自愈（lib/preset-sync.js apply）是唯一落地点，失败不阻断启动。
- **isolate 名单（审计硬门槛）**：预设三组都带 `isolate` 键且值**一律 `true`**（每条目各自 LocalRealm；具名字符串 label 会让四个同名服务实例共享 GlobalRealm 互相覆盖，**禁止**）——delegation `{workflowEngine: true, subagentModelSelection: true}`（`dsh-workflow-ptc` 的行实例仍注册 workflowEngine；四行 `dsh-tool-subagent` 的插件类即 `SubagentModelSelectionConfig extends Service`，未隔离即抛 `Preset services require isolate realms: subagentModelSelection`）、compaction `{compaction: true, toolResultPruner: true}`、extra-plan-group `{extraPlan: true}`（本仓零服务注册，属保险项）。审计只认「少写必炸、多写未注册名不触发」，故**宁多勿少**；**删任何一项前先逐包 grep `extends Service|super(ctx,`**。
- **创造模式 skill 面**：C=1 的官方 skill 不再由插件运行期 `agentPresets.resolve('cordis')` 注册（0.1.7 该 resolve 只返回 `{id[,broken]}`，`path` 恒 undefined → 旧实现静默失效），改为预设 `skill-filesystem` 行 `config.customSkillDirs` 指向 `@deepseek-ai/dsh-agent-preset` 包内 `skills/`（三个 SKILL.md 目录：cordis-plugin-development / editing-cordis-compositions / cordis-composition-reference）；C=0 由 `assembly-presentation` 的 `CREATIVE_SKILL_NAMES`（3 项）在 catalog 投影里隐藏。
- **设置页双通道**：见上方「闸门关键词单一来源」节末条——8 项走 settings 行 `Config`（全 `.volatile()`，官方 configForms，ns = 行 id `dsh-extra-plan-settings`），2 项走声明行 plugins（本插件专用 PUT + `configEditor.edit`）。客户端卡片的插槽是 Plugins 页的 `plugins.item`（`configForms.whileServed` 包裹；旧 `settings.plugin.item` 在 0.1.7 全库 0 命中）。**0.1.7 设置入口（C1 订正）**：DSH web 界面 → 左侧边栏「插件」页 → 官方分组 →「按需规划模式配置」卡片（Plugins 页 `plugins.item`；旧「设置 → 插件 → 插件配置」路径在 0.1.7 已不存在）。
- **钩子/契约换代（index.js 五处）**：`agent/session-start` 删除 → `agent/created`（**serial：监听器被 await，抛错即会话创建失败**，整块必须吞错；pre-step 兜底保留）；tool-jobs 完成通知源 `{kind:'tool-jobs', form:'notice'}`；`ctx.get('codeRuntime')` → `ptcRuntime`（取不到回落 `typescript`）；`creativeMode` 改 live-config 热读（settings 行 override → cfg → BUILTIN_DEFAULTS）；`tool:cordis` 段在宿主侧已删（`CORDIS_SECTION_NAME` 标废弃、2 个只读工具呈现隐藏仍生效）。
- **安装口径**：`dsh plugin` 装载不再有任何安装期脚本动作（`postinstall` 已于 2026-09-25 死代码清理删除，启动自愈兜底；旧「跳过构建仅少一次状态目录初始化」口径随之作废）；兼容门控 = `evaluatePluginCompatibility` 只查 peerDependencies 中 `@deepseek-ai/dsh` / `@deepseek-ai/dsh-` 前缀键，不满足时 bundle 装载抛错。**部署由用户执行（AI 不执行部署）**。

---

**AI 禁改文档仅一处：根 `dsh-extra-plan/README.md`（与本文同层级）；其余文档（含各级 README.md、台账）均可改。**
## 闸门关键词单一来源（v0.3.0）
- 7 个闸门关键词（routeDirect/routePlan/routeDisagree/approvalApprove/approvalReplan/purposeRefine/purposeRedo）的**唯一人工编辑位置**是 `assets/presets/extra-plan/agent.cordis.yml` 的 `config.gateWords`（部署现场为 profile patch 声明行 `preset-extra-plan` 的 `config.plugins` 内 `extra-plan` 行 `config.gateWords`，即 `profileContext.patchPath`；旧 `DSH_HOME/.agent-presets/extra-plan/agent.cordis.yml` 已无读取方）；出厂示例值为「直接执行｜进行pro规划｜不同意｜同意执行｜转交pro规划｜完善方案｜重新规划」，**只是示例，不是运行时第二真源**。
- `lib/gate-words.js` 只保存字段名/prompt variable 名/校验规则/迁移 locator 与运行时派生（`createGateRuntime`），**不含任何出厂词值、不读文件/环境变量、没有无参默认词表**；`index.js` 每次 apply 第一步 `createGateRuntime(cfg.gateWords)`，缺失/非法同步抛错（阻止该预设被使用，不回退旧词），并在当前 agent scope 经 `ctx.effect(() => ctx.systemPrompt.variable(...))` 注册恰好 7 个 `extra_plan_*` 变量；persona 的 `prefix`/`text` 双键只引用这 7 个变量。
- deny 教学文案（路由确认句、批准选项句、目的选项句、三类 ask 模板）现由**当前** `config.gateWords` 插值拼出；出厂值下与历史静态文案逐字相同。三类 match 只认「推荐后缀归一后精确等于当前词值」，旧词与任意变体都不能推进 route/purpose/approved。
- 两条保留链：**台账 hash 与资产一致且声明行覆盖资产行 id 集合** → `idle`（不写盘、台账字节不变）；**hash 变化/声明行失覆盖** → 迁移一次：8 项 UI 设置写 settings 行、2 项宿主行写声明行 `config.plugins` 子行、整组合法的 7 个旧词写回 `extra-plan` 行 `config.gateWords`（缺失/非法/歧义整组缺席，禁止部分迁移）。写盘只经 `configEditor.edit`（事务 + reconcile + 回滚），本插件不直写任何 `cordis.patch.yml`。
- 设置页拆成**双通道**：**8 项 UI 设置**（anchoredBootstrap/creativeMode/runcodeCatchGate/crossProviderPlannerModel/plannerModel/plannerPromptSuffix/exploreBudget/otherAgentModel）落 settings 行 `dsh-extra-plan-settings` 的 `Config`（8 字段全链 `.volatile()`，读写走官方 SettingsForms）；**2 项宿主行设置**（webFetch→`tool-web` 行 `config.fetch`、toolPresentationMode→`tool-presentation` 行 `config.mode`）落声明行 `config.plugins`，经 `PUT /api/dsh-extra-plan-settings/pro-config`（body 仅这 2 项）→ `configEditor.edit` 整体重述 plugins。gateWords 是**迁移专用字段（7 项）**，不进设置页 metadata、不进 `preset-defaults.generated.js`、不新增构建步骤。manifest 仍是 `format: 2`（状态目录 `$DSH_HOME/.agent-presets/extra-plan/`）：`settingsMigration` 10 项 + 并列加法字段 `gateWordsMigration`（7 项状态，只记状态不记用户词值）。

## P2-4 默认值与拆分边界
- `assets/presets/extra-plan/agent.cordis.yml` 的 `config.exploreBudget` 是唯一默认作者真源；构建期 `scripts/generate-runtime-defaults.mjs` 生成 `lib/preset-defaults.generated.js`，运行时只 import 该常量，不解析 YAML，descriptor 仅负责定位、校验与 UI metadata。
- 生成器先完整解析/校验再替换；缺失或非法模板时生成、`--check`、prepack 非 0，保留 last-known-good；preset-sync 在任何 DSH_HOME 目标写入前失败，postinstall/startup 外壳仍非阻断。
- P2-4 B1 将无宿主状态的 shell mutation、planner budget、runtime-static 与 per-apply agent runtime factory 下沉；usage、工具注册/claim、disposed 同步 final fold、监听器顺序和 tools/pre-execute 仍留在 `index.js`。