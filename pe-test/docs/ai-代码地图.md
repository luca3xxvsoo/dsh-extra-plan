# 代码地图（dsh-extra-plan）

> **维护分工**：行号区间/增删行由脚本 node pe-test/tools/代码地图生成.mjs 增量同步；**功能描述、备注、以及「意图速查」整节由 AI/人维护**（脚本刷新不会覆盖）。
> **用法**：先看「意图速查」按意图词找函数名 → 再到「函数索引」按函数名取行号区间 → read 该区间。
> 上次同步：2026-10-15 08:05:01（脚本自动更新时间戳行）

## 意图速查（人工维护：意图词 → 函数名；行号请到下方「函数索引」按函数名取）

> 用法：拿用户/AI 口里的词在「想找什么」列 grep → 得函数名 → 到「函数索引」grep 该函数名 → 取行号区间 → read 该区间。
> 本节引用的函数名若不存在于索引，生成脚本会报 `[导航失效]`（防止入口过期）。

| 想找什么（含同义词/英文标识） | 文件 | 函数名 |
|:--|:--|:--|
| 四级闸门／路由确认／目的确认／批准／流程状态（route/purpose/clarified/approved；路由 ask 标准流程两问、机械层至少两问——第一问固定三选一、第 2 问起纯文本「补充要求」不得带非空 options；目的 ask 仍单问） | index.js | deriveFlowState、mainGateReason、routeDenyReason、gateAskDenyReason、validateGateAskStructure、matchPurposeLabel |
| 探查预算／额度／剩余次数／耗尽（exploreBudget/budget；剩余 ≤3 注入的提醒消息 source 用生产者自有 kind `plugin:dsh-extra-plan`——v4 行准入禁旧包裹 `plugin`） | plugins/dsh-extra-plan/lib/planner-budget.js、index.js | toolCallCount、toolCallsSinceUser、withPlannerPromptSuffix、budgetNoticeText、budgetReminderText、budgetReminderMessage、budgetReminderSent、budgetExhaustedReason、budgetExceeded |
| run_code 组判定／绕道拆解／调用点扫描（decompose） | plugins/dsh-extra-plan/lib/run-code-static.js、plugins/dsh-extra-plan/index.js | decomposeRunCode、collectRunCodeSites、runCodeGroupDenyReason |
| run_code 多调用容错／教学文案（容错检查开关） | plugins/dsh-extra-plan/lib/run-code-static.js | runCodeCatchGateReason |
| ask 结果返回用户层／返回链闸门 | plugins/dsh-extra-plan/lib/run-code-static.js | askUserQuestionReturnGateReason |
| 单实例调用点上限／循环放大 | plugins/dsh-extra-plan/lib/run-code-static.js | runCodeSiteCount、runCodeDispatchGateReason、runCodeDispatchCapText |
| job_output 禁 wait:true／同 job 查重／放行后记录计数器 | index.js | jobOutputGateReason、recordJobOutputCall |
| job_kill 仅直行放行／send_message 主会话方向限制／job_list·list_agents 同锚点防轮询 | index.js | mainGateReason、pollGuardGateReason、recordPollGuardCall |
| 命令文本提取／写操作判定／只读角色 shell 拒绝文案／runner 写暗示（write/拦截） | plugins/dsh-extra-plan/lib/shell-mutation.js、index.js、plugins/dsh-extra-plan/lib/run-code-static.js | commandTextOf、pwshCommandOf、bashCommandOf、mutationTextMatches、pwshMutationMatches、bashMutationMatches、shellMutationReason、runCodeTextOf、codeMutationHints |
| 锚定引导／F-L 首轮极简／bootstrap／HN-HB-HP／F 段 tool:read 手写文案（bootstrapReadHint） | index.js、plugins/dsh-extra-plan/lib/assembly-presentation.js | isBootstrapPhase、projectAssemblyForPresentation |
| A/C/M 展示投影／C7 过滤／Pure PTC 手写 read（变量② bootstrapReadHint）／SDK 重建 | index.js、plugins/dsh-extra-plan/lib/assembly-presentation.js | projectAssemblyForPresentation、renderFilteredToolsSdk、resolveToolsSdkRenderer、filteredCordisSchemas、sdkSchemasForRendering、toolSdkSchemasOf |
| P2-2 SDK 文本复用／agent-only（仅 Agent）cache／F-L 分离／三元组失效／dispose-restart／失败不缓存／并发合并／计数硬门槛 | index.js、plugins/dsh-extra-plan/lib/assembly-presentation.js、plugins/dsh-extra-plan/lib/sdk-text-cache.js | createSdkTextCache、sdkSchemasFingerprint、sdkTextCacheEntryMatches |
| skill catalog 暂隐／普通 skill 保留／HP1 | index.js、plugins/dsh-extra-plan/lib/assembly-presentation.js | skillCatalogEntriesOf、renderSkillCatalogText、projectSkillCatalogDecision、shouldHideCreativeCatalog |
| durable context gate／F-L source 过滤／agent-instructions／skill-catalog／按 kind context 去重／Session surface | index.js、plugins/dsh-extra-plan/lib/gate-decisions.js | filterBootstrapContextDecision、dedupeProjectedContextDecision、isBootstrapPhase、isAnchoredContextGate |
| 方案/询问工具在未确认路由下的拒绝文案（plan route） | index.js | planDenyReason |
| 批准前禁委派（approval deny） | index.js | approvalDenyReason |
| 规划子代理分支闸门（planner 写禁+预算） | index.js | plannerGateReason、shellMutationReason |
| 会话事件快照/子代理角色识别／单次快照复用（execEvents）／planner descriptor 缓存／events 可选入参 | lib/agent-session.js、lib/agent-runtime.js、index.js | sessionEvents、isSubagentChild、isLiveDelegation、childPolicyNeedsFloor、createAgentRuntime、isChild、isPlannerChild、toolSchemasOf、usageRoleOf、childBaseline |
| 会话状态生命周期／disposed 收尾／末轮 usage 结算／usage 账本续载／可信用量字段（provider/cw/rs）（session 分桶、final flush、cursor 降级、session.seq 水位 + snapshotEvents(from,to) 区间增量、水位未变直接返回、截断回退全量） | index.js、lib/agent-runtime.js | foldUsage、readUsageCursorTable、warnUsageCursorDegraded、usageCursorEntryOf、usageRoleOf、noteRunCodeSubCall、childBaseline |
| 方案与验收落盘／save_plan 双写（plan/checklist；主会话侧任意路由态放行的受限规划工件，仅写 cwd/.extra-plan） | lib/save-tool-factories.js、lib/save-contract.js、index.js | defineSavePlan、registerSavePlan、saveArtifactBase |
| 落盘原子提交／journal 崩溃自愈（atomic/commit） | lib/save-persistence.js、index.js | atomicCommit、recoverJournals |
| 线索落盘／save_probe／证据报告（probe/evidence；限制值唯一来自 `save-contract.js#PROBE_LIMITS`；step-00 PR23/PR34/PR35 回归；主会话侧放行条件保持现状——route=plan + 目的已定 + 澄清完成；extractProbeEvidenceRefs 顺序固定：整体成对剥除（循环）→ 按顿号/分号/竖线拆分 → 逐段成对剥除 + trim → 过滤空串 → 去重；拆分符与剥除集均不含空格、半角逗号、`.`、`/`，单侧一律不剥） | lib/save-contract.js、lib/save-probe-validation.js、lib/save-tool-factories.js、index.js | validateProbe、renderProbeMarkdown、extractProbeEvidenceRefs |
| save 合同／限制值／ContentBlock 渲染（统一 artifact base：sessionTag/毫秒/pid/序号；PROBE_LIMITS、LINE_FORMAT_HINT、RANGE_FORMAT_HINT 与渲染合同） | lib/save-contract.js | sanitizeTaskName、timestamp、sessionTagOf、saveArtifactBase、renderSavePlan、renderProbeMarkdown、renderSaveProbe、extractProbeEvidenceRefs |
| save_probe 校验／路径存在性与聚合拒绝 | lib/save-probe-validation.js | validateProbe、probePathOf |
| save 工具显式依赖工厂 | lib/save-tool-factories.js | createSaveToolFactories、defineSavePlan、defineSaveProbe |
| PTC F→L／native-both HN-HB 实机取证 | pe-test/docs/ai-实机闸门测试流程.md |  |
| 实机子代理模型／提供方／planner 引导取证（A42/A43、C11/C12、HUMAN；显式 SESSION_ID + PLANNER_PROMPT_SUFFIX；request/header attempted route（尝试路由） 与 assistant/message actual provenance（实际来源） 分栏；suffix 等级与完整文本；两阶段头扫描 `headerOfDir` 只解析命中直接 child、事件不保留 raw，默认堆可跑通） | pe-test/tools/step-07-子代理模型与引导取证.mjs |  |
| 120格 A/C/M/F-L 路由与目录断言／显式 header catalog 取证 | pe-test/tools/step-04-路由与写闸门.mjs、pe-test/tools/step-04-工具清单查看.mjs |  |
| 探查者委派／禁止 planner 派探查（subagent_probe） | index.js、plugins/dsh-extra-plan/lib/model-routing.js | subagentProbeGateReason、resolveOtherAgentEntry |
| 只读子代理／验收者只读（reviewer/readonly） | index.js | childReadonlyGateReason、shellMutationReason、isReadOnlyChildByCatalog |
| 子代理沙箱下限／权限抬升（floor/sandbox） | lib/agent-runtime.js、index.js | childPolicyNeedsFloor、createAgentRuntime |
| 工具目录折叠／PTC 单入口（catalog/ptc） | index.js | catalogIsCollapsed |
| 设置后端／唯一全局 owner 与旧值迁移（10 项 volatile Config + 内存 definition/adapter + Web→QQBot settled 镜像与失败诊断） | lib/settings.js、lib/preset-settings.js、lib/preset-sync.js | apply、createApiHandler、proPayload、readUnifiedState、findSettingsRow、effectiveRowConfig、resolveUnifiedConfig、restateSettingsConfig、findPluginsRow、applyPlan、mountPresetSync、syncEditor、settledSettings、profileSyncPath、reportProfileSync |
| Web→QQBot profile 同步／documentPath 首选／显式备用／双锚点／局部 YAML 安全写与恢复 | plugins/dsh-extra-plan/lib/qqbot-settings-sync.js；pe-test/tools/step-01-设置页配置.mjs、step-01-安装同步.mjs、step-01-qqbot-安装映射.mjs（分别覆盖路径/API、settled 生命周期、YAML 正负例） | resolveProfilesRoot、findOwnQqbotProfiles、validateSettingsSnapshot、planQqbotSettingsPatch、writeQqbotSettingsPatch、createQqbotSettingsSynchronizer |
| 设置值定位与捕获（source/row/legacy projection locator；10 项全局行 + 旧行安全读取；PUT 兼容入口合并全局值） | lib/preset-settings.js、lib/settings.js、lib/preset-sync.js | captureSettings、captureRowSettings、hostRowDefaultsFromTemplate、readProjectedValue、resolveSetting、findTextLocatorMatches、patchYamlScalar、serializeScalar、publicField、readLegacyState |
| 配置热读／生效标志／后端权威行更新无需重启（live-config/hot-read；增强 stamp dev/ino/size/mtimeNs/ctimeNs，兼容回退 ino/size/mtimeMs/ctimeMs） | plugins/dsh-extra-plan/lib/live-config.js、plugins/dsh-extra-plan/index.js | createLiveConfig、refresh、read、currentPath、readDiskValues、statStamp、pick |
| 预设核对／纯 definition／官方 adapter／旧行非破坏迁移／settled 通用回调 | lib/preset-sync.js、lib/preset-settings.js | syncPreset、assetDefinition、definitionWithProjection、readUnifiedState、readLegacyState、resolveUnifiedConfig、restateSettingsConfig、declarationBodyMatchesAsset、stripUserWritable、carryUserWritable、assetPlugins、pluginRowIds、readDeclaredPluginsFromPatch、applyPlan、mountPresetSync、notifySettled、reportSettledError |
| 同页共享客户端表单／仅经 detail.section 渲染于 bundle 详情页行列表之后（自绘标题；不注册 bundle.config/row/item/tab，本包 bundle.config 槽被任何一方注册条目时 detail.section 让位） | lib/client.js | apply、SettingsCard、ExtraPlanForm、DetailSettingsSection、registerClientSurfaces |
> client.js 设置入口定位：`DetailSettingsSection` 与 `registerClientSurfaces`；设置表单仅经 plugins.detail.section 渲染于 bundle 页行列表之后，若本包 bundle.config 槽被任何一方注册条目则让位保持唯一表单；ConfigForms.get(NS) 订阅快照并一次 mutate 十项，不注册 bundle.config/row.config/settings.plugins.tab/plugins.item。
| 执行者工具裁剪／deny（executor-spawn；注册引用计数幂等 = 稳定键幂等——槽键 = 服务实现本体（读全局注册符号 Symbol.for('cordis.original')，取不到时降级回代理本身），跨预设世代/行重建共享同一注册与 disposer） | lib/executor-spawn.js | apply、slotKey |
| qqbot 兼容自愈／建链 | dsh-extra-plan-qqbot（仓库目录 plugins/dsh-extra-plan-qqbot）/lib/heal.js（选装包，本机未安装） | healQqbotCompatibility、ensureDshExtraPlanLink |
| YAML 默认值真源／生成／last-known-good（上次已知良好版本）（exploreBudget/plannerPromptSuffix）＋纯 preset definition 产物（顶层结构按 PLUGINS_INDENT 逐字平移 · --check 比对） | lib/preset-settings.js、scripts/generate-runtime-defaults.mjs、lib/preset-defaults.generated.js、assets/presets/extra-plan/preset-definition.generated.yml | resolveTemplateSettingDefault、renderRuntimeDefaults、renderPresetDefinition、topLevelRowsOf、generateRuntimeDefaults、indentBlock、quoteYamlSingle、assertDefinition、assertParses、writeOrCheck |
| 闸门关键词单一来源／7 词唯一手工编辑位／prompt variable 注册／旧词拒绝／严格校验（gateWords/extra_plan_*） | plugins/dsh-extra-plan/assets/presets/extra-plan/agent.cordis.yml、plugins/dsh-extra-plan/lib/gate-words.js、index.js | validateGateWords、createGateRuntime、normalizeGateLabel、matchExactKind、deriveFlowState、mainGateReason |
| gateWords 启动核对／厂商模板整组校验／旧声明行 carry（无破坏性迁移） | plugins/dsh-extra-plan/lib/preset-sync.js | syncPreset、readDefinitionGateWords、assertTemplateGateWords、readLegacyState |
| runtime-static 纯 helper（cause-chain） | lib/runtime-static.js | causeChainOf |
| PTC 拒绝中文呈现／post-execute 失败结果改写／denied 判别（闸门拒绝不重置路由、取消仍清四字段；HOST_ASK_CANCEL_TEXTS 宿主取消句） | index.js | parseAskResultData、parseDispatchAskResult、askResultTextIsDenied、firstTextOfBlocks、deriveFlowState、recordRunCodeDeny |
| 代码地图自身维护／口径／严格模式 | pe-test/tools/代码地图生成.mjs（不在索引范围，读文件头注释） |  |
| 新载体选型与 isolate 审计（纯 definition／官方 adapter／三组 isolate 名单：extra-plan-group.extraPlan · compaction.compaction+toolResultPruner · delegation.workflowEngine+subagentModelSelection） | plugins/dsh-extra-plan/assets/presets/extra-plan/agent.cordis.yml、plugins/dsh-extra-plan/assets/presets/extra-plan/preset-definition.generated.yml、README.md（READAI.md「新载体」节） |  |
| 创造 skill 静态注册／bundledSkillDir／C=0 与 C=1 的 catalog 语义（skill-filesystem 行的 config.bundledSkillDir 指向 agent-preset 包内 skills/ 且 watch: false——0.2.0-rc.2 换通道修法，旧 customSkillDirs 经 ctx.fs 扫 asar 抛非 absent 错；「不注册」已改为 catalog 隐藏） | plugins/dsh-extra-plan/assets/presets/extra-plan/agent.cordis.yml、plugins/dsh-extra-plan/lib/assembly-presentation.js、plugins/dsh-extra-plan/index.js | shouldHideCreativeCatalog、projectSkillCatalogDecision、skillCatalogEntriesOf、renderSkillCatalogText |
| 0.1.7 服务名换代／ptcRuntime／SDK renderer 语言取值 | plugins/dsh-extra-plan/index.js、plugins/dsh-extra-plan/lib/assembly-presentation.js | apply、resolveToolsSdkRenderer、renderFilteredToolsSdk、sdkSchemasForRendering |
| tool-jobs 完成通知解锁（`agent/inbox/claimed` 同步主入口 + `tools/pre-execute` durable snapshot fallback；两入口共用 `consumeToolJobsNotice`；严格校验非空 `message.id`、source.kind=tool-jobs/form=notice 与正文 /background job (\S+)/；session 内以 notice `message.id` 判重，同 id 跨 claimed/durable 幂等，不同 id 即使复用 jobId 也代表新通知实例；双动作：①jobId 只清当前 session 对应的 job_output 计数 ②job_list/list_agents 轮询守卫 pollGuardCounters 清整表；consumed 在双解锁后写入，用户/agent-message 锚点不删 notice-id Set，disposeSession 才回收，重复/坏输入零副作用；HK9：旧 plugin kind 已废） | plugins/dsh-extra-plan/index.js | consumeToolJobsNotice、apply、recordJobOutputCall、jobOutputGateReason、pollGuardGateReason |
| agent/created 钩子（serial；agent/session-start 已删除）／会话启动基线＋save_plan/save_probe 注册，整块吞错不阻断会话创建 | plugins/dsh-extra-plan/index.js（agent/created 调用点）、plugins/dsh-extra-plan/lib/agent-runtime.js（childBaseline/isPlannerChild 定义）、plugins/dsh-extra-plan/lib/agent-session.js（isSubagentChild 定义） | apply、childBaseline、isPlannerChild、isSubagentChild、registerSavePlan、registerSaveProbe、probeClaimFor |
| MALFORMED_RESPONSE 限次自愈／请求失败兜底 retry／注入模型可读提示（source.kind 用生产者自有 `plugin:dsh-extra-plan`；developer/message 须自带 ≥1 的 turn/step，宿主 append 不补坐标；坐标缺失/非正整数 → 不注入但仍返回 retry） | index.js | malformedRecovery、recordRequestError |
| 会话日志格式 v4 代际／session.v4.jsonl.zstd／共享 session-finder/logPath 三代候选名并存（v4/v3/旧名，未知形状归 v0）；step-06/07/08 只接受 session.v4.jsonl.zstd | pe-test/_shared/session-finder.mjs、pe-test/tools/step-07-子代理模型与引导取证.mjs |  |

> QQBot 环境验证：`pe-test/tools/step-01-qqbot-环境验证.mjs` 的 `buildPreflight`（五条件/缺失码）、`probeJunctionCapability` 与 `runJunctionFixture`（能力探针/临时 fixture（夹具））、`runLiveReadonly` 与 `inspectMapping`（真实 profile patch/映射只读对拍）；该测试工具不在插件源码生成根，函数行号不手填。

## 文件总览

| 文件 | 行数 | 说明 |
|:--|--:|:--|
| plugins/dsh-extra-plan-qqbot/index.js | 22 | qqbot 精简版自愈插件：apply 启动时调 healQqbotCompatibility 自愈（迁移旧错误块+建链），不阻断启动 |
| plugins/dsh-extra-plan-qqbot/lib/heal.js | 394 | 自愈纯函数模块（定位 profile/旧块迁移/建链；供 index.js/CLI/测试复用） |
| plugins/dsh-extra-plan-qqbot/scripts/heal.mjs | 28 | CLI 兜底入口（postinstall/手动触发；invokedAsMain 判定） |
| plugins/dsh-extra-plan/index.js | 975 | 核心入口：四级闸门、预算、save 工具注册与生命周期；接线 planner/非 planner 路由、A/C/M 投影、P2-2 cache、session 分桶 usage final fold、v4 MALFORMED 自愈。gateWords 只来自 YAML，apply 先校验再副作用。 |
| plugins/dsh-extra-plan/lib/agent-runtime.js | 109 | 每次 apply 的角色识别、descriptor/工具 schema 缓存、usage role baseline 与 sandbox floor 工厂；不 import index.js |
| plugins/dsh-extra-plan/lib/agent-session.js | 32 | 会话事件与子代理识别的唯一来源：sessionEvents/isSubagentChild 零依赖纯函数，被 index.js 与 lib/model-routing.js 共用（无镜像副本；不 import index.js） |
| plugins/dsh-extra-plan/lib/assembly-presentation.js | 242 | A/C/M 与 skill catalog 模型可见投影；从 scoped tools 读 schema/模式，SDK renderer 按 language 整体重建；F/PTC 的 tool:read 由 index.js 手写，L 段回宿主原文。 |
| plugins/dsh-extra-plan/lib/client-carrier.js | 7 | settings 内部 Loader Group 的无副作用 Client carrier；不对应 bundle row/公开 export。 |
| plugins/dsh-extra-plan/lib/client.js | 311 | 客户端模块加载共享样式/词条与 SettingsCard/ExtraPlanForm；设置表单仅经 detail.section 渲染于当前包详情行列表之后（自绘标题，不注册 bundle.config；若本包 bundle.config 槽出现条目则让位）；后端全局 settings API/Config/旧值迁移与 definition/adapter 由同一 owner 活动。 |
| plugins/dsh-extra-plan/lib/executor-spawn.js | 132 | 执行者子代理 provider：委托宿主 spawn，注入工具 deny（防委派递归/追问）；registerProvider 走引用计数幂等（**稳定键幂等**：模块级 WeakMap 槽表的槽键 = subagents 服务实现本体——读全局注册符号 Symbol.for('cordis.original')，由 traceable 代理 get 拦截器返回 target，root 单例跨预设世代恒同一对象；取不到符号值时降级回代理本身；跨预设世代/行重建复用同一注册，归零才反注册） |
| plugins/dsh-extra-plan/lib/gate-decisions.js | 1095 | 四级闸门与角色分流判定纯函数集 |
| plugins/dsh-extra-plan/lib/gate-words.js | 114 | 闸门关键词共享契约（唯一值源是 YAML 的 config.gateWords）：字段规格 GATE_WORD_FIELDS/GATE_WORDS_GROUP_DEFINITION + 整组严格校验 validateGateWords（错误一律以 extra-plan: config.gateWords 开头）+ 运行时词表 createGateRuntime（显式入参严格校验，无默认词表）；纯模块：不含任何出厂词值、不读文件与环境变量，被 index.js（运行时）与 lib/preset-sync.js（启动自愈）共享（迁移叶 locator 已随跨版本搬迁链删除） |
| plugins/dsh-extra-plan/lib/live-config.js | 210 | 配置热读：仅 8 项运行时 getter；2 项宿主行权威设置只读并派生到内存 definition，不暴露为 getter；构造期读盘一次，后续按增强 stamp（dev/ino/size/mtimeNs/ctimeNs，兼容 ino/size/mtimeMs/ctimeMs）重读；失败整组回退并告警，不读 DSH_HOME 旧目录 |
| plugins/dsh-extra-plan/lib/model-routing.js | 509 | planner/非 planner 子代理模型路由：顶层纯判定函数 + createModelRouting per-apply 工厂（per-instance WeakMap、惰性 llm/agents getter；不 import index.js） |
| plugins/dsh-extra-plan/lib/planner-budget.js | 137 | planner 工具计数、消息后缀/预算提示/耗尽文案；**预算提醒消息经宿主 createUserMessage 构造，source 用生产者自有 kind `plugin:dsh-extra-plan`（v4 行准入禁旧包裹 `plugin`，违者会话当场终止）**；默认预算由生成模块提供，FREE_TOOLS 仍在根入口 |
| plugins/dsh-extra-plan/lib/preset-defaults.generated.js | 4 | 由 YAML 模板生成的 runtime fallback（回退） 常量；generated（生成）/do not edit（勿手改） |
| plugins/dsh-extra-plan/lib/preset-settings.js | 3 | 10 项设置描述与 YAML 定位；settings 行是权威值，声明行只投影 2 项宿主行；capture/投影读取、plugins 行整体重述与保格式标量改写。 |
| plugins/dsh-extra-plan/lib/preset-sync.js | 755 | 读取并严格校验纯 definition；旧 preset-extra-plan/extra-plan-preset-sync 仅安全读取迁移，统一全局行补齐后派生 definition 并由同一 owner 挂载官方 AgentPreset；新写入仅经唯一全局行 configEditor.edit；mountPresetSync 以通用 settled 回调交付最终十项/gateWords。 |
| plugins/dsh-extra-plan/lib/preset-yaml.js | 436 | 预设 YAML 纯职责模块：解析、行与叶定位及歧义分类、权威与投影值捕获、保格式标量改写。 |
| plugins/dsh-extra-plan/lib/qqbot-settings-sync.js | 684 | Web documentPath 首选、显式 DSH_HOME 备用、双锚点 profile 扫描、完整 10 项/gateWords 安全快照、局部 YAML 保格式写入、排他临时/备份/恢复与串行同步队列；不读用户目录、不触碰未知根。 |
| plugins/dsh-extra-plan/lib/run-code-scanner.js | 216 | run_code 无宿主状态词法扫描器：字符串/注释遮蔽、括号配平、tools 调用点收集与动态访问判定。 |
| plugins/dsh-extra-plan/lib/run-code-static.js | 571 | run_code 纯静态解析/理由模块：安全 JSON/JS literal 解析、动态 argsText 瀑布兜底、写模式 hint、工具组拆解、ask 返回值白名单、调用点计数与双兼容 dispatch cap；仅显式注入普通依赖，不持有宿主状态。 |
| plugins/dsh-extra-plan/lib/runtime-lifecycle.js | 124 | per-apply 运行时生命周期：save 工具注册、probe 名额认领与 run_code 子调用计数/拒绝记录，状态在闭包内并按会话清理 |
| plugins/dsh-extra-plan/lib/runtime-static.js | 15 | 显式参数纯 helper：SKILL frontmatter 与 cause 链解析；不持有宿主状态 |
| plugins/dsh-extra-plan/lib/save-contract.js | 191 | save 合同唯一真源：任务名/sessionTag/base、PROBE_LIMITS、ContentBlock/Markdown 渲染与证据引用清洗；无宿主状态，限制值只在本文件维护。 |
| plugins/dsh-extra-plan/lib/save-persistence.js | 85 | 阶段感知公共原子落盘与 journal 自愈：tmp→journal→rename→逐项确认目标就位→清 journal；pre-journal 条件清理（先删 journal 并确认不存在才清 tmp）、post-journal 一律保留 journal 与现场、全目标确认后才删 journal；恢复逐项确认目标存在、全项就位才清 journal，形状非法/目标缺失保留 journal 并告警；按 sessionTag 过滤；末位可选 fs 依赖默认同义映射 node:fs（冻结只读、未提供项回退默认） |
| plugins/dsh-extra-plan/lib/save-probe-validation.js | 113 | save_probe 参数校验：数组/条目/长度/总量/path 存在性/range/evidence 聚合拒绝 |
| plugins/dsh-extra-plan/lib/save-tool-factories.js | 215 | 显式依赖工厂：定义 save_plan/save_probe schema/output/render/execute；证据引用报错以 JSON.stringify(ref) 呈现（首字符属装饰集时附「疑似含 Markdown 装饰」提示）；不缓存 ctx/agent/会话状态 |
| plugins/dsh-extra-plan/lib/sdk-text-cache.js | 161 | apply 级 agent-keyed WeakMap SDK 文本缓存：完整 renderer 输入保守指纹、language/renderer 身份比较、并发 Promise 合并、reject/过期 Promise 不回写、dispose 回收；不持有 sessionId 或 PromptAssembly |
| plugins/dsh-extra-plan/lib/settings-contract.js | 160 | 服务端设置 descriptor 单一合同：10 项的类型/默认值/校验/UI 与权威-投影双定位器，并导出分组与投影遍历源 |
| plugins/dsh-extra-plan/lib/settings.js | 329 | 10 字段 volatile Config、页面策略与 loopback GET/PUT；权威值在唯一 settings 行，PUT 先拒绝空/null/数组/原始/未知/非法混合载荷并严校验当前 gateWords，再只 edit 全局行，no-op 也重读最终快照并等待 profileSync，结构化区分 synced/not-installed/unavailable/failed/partial。 |
| plugins/dsh-extra-plan/lib/shell-mutation.js | 125 | 跨平台命令文本解码与 pwsh/bash 写形态判定；纯函数、不持有 apply 状态 |
| plugins/dsh-extra-plan/lib/usage-ledger.js | 174 | per-apply usage 账本：cursor 表读取与降级告警、按水位增量 fold 会话 usage 并追加 JSONL。 |
| plugins/dsh-extra-plan/scripts/generate-runtime-defaults.mjs | 155 | 从 agent.cordis.yml 校验并生成 runtime 默认常量 + 纯 preset-definition.generated.yml（顶层结构逐字平移并保留 group/isolate/!!js）；支持 --check 且坏源不覆盖 last-known-good（上次已知良好版本） |

## 函数索引

| 文件 | 函数 | 行号 | 功能描述 | 备注 |
|:--|:--|:--|:--|:--|
| plugins/dsh-extra-plan-qqbot/index.js | apply | L11-22 | 插件入口：apply 启动时调 healQqbotCompatibility 自愈（迁移旧错误块+建链；try/catch 不阻断启动） |  |
| plugins/dsh-extra-plan-qqbot/lib/heal.js | loadYamlModule | L15-25 | js-yaml 双 fallback（回退）加载（本地 createRequire 失败回退官方 APPDATA DSH 包）；惰性缓存，导入零副作用 |  |
| plugins/dsh-extra-plan-qqbot/lib/heal.js | loadYamlSchema | L27-41 | 惰性构造只保留 Loader `!!js` 标量的 JSON schema，表达式只转 __jsExpr 不求值 |  |
| plugins/dsh-extra-plan-qqbot/lib/heal.js | resolve | L33 | 惰性 js-yaml 类型的标量判定，仅接受字符串数据 |  |
| plugins/dsh-extra-plan-qqbot/lib/heal.js | construct | L34 | 将 `!!js` 标量包装为惰性 __jsExpr 标记，绝不执行 |  |
| plugins/dsh-extra-plan-qqbot/lib/heal.js | predicate | L35 | 识别惰性 __jsExpr 标记对象 |  |
| plugins/dsh-extra-plan-qqbot/lib/heal.js | represent | L36 | 为 schema 重新表示惰性表达式文本 |  |
| plugins/dsh-extra-plan-qqbot/lib/heal.js | timestamp | L43-47 | 时间戳 yyyyMMddHHmmssSSS（毫秒粒度备份时间戳，不作同毫秒唯一承诺） |  |
| plugins/dsh-extra-plan-qqbot/lib/heal.js | pad | L45 | 数字补零（timestamp 内部闭包） |  |
| plugins/dsh-extra-plan-qqbot/lib/heal.js | isObject | L73-75 | 非空普通对象判定（排除 null/数组） |  |
| plugins/dsh-extra-plan-qqbot/lib/heal.js | stripBom | L77-79 | 去除行首 BOM（迁移扫描用） |  |
| plugins/dsh-extra-plan-qqbot/lib/heal.js | lineIndent | L81-83 | 行首缩进宽度 |  |
| plugins/dsh-extra-plan-qqbot/lib/heal.js | isIgnorableLine | L85-88 | 空行/注释行判定（块扫描跳过） |  |
| plugins/dsh-extra-plan-qqbot/lib/heal.js | parseScalar | L90-98 | YAML 标量去引号（单/双引号成对时剥离） |  |
| plugins/dsh-extra-plan-qqbot/lib/heal.js | parseEntryBlock | L100-108 | 条目块文本解析为单个对象（js-yaml；失败/非单元素 → null） |  |
| plugins/dsh-extra-plan-qqbot/lib/heal.js | legacyEntryKind | L110-120 | 旧版根级完整块匹配（id+name[+config.default=standard]）→ 返回 id 或 null |  |
| plugins/dsh-extra-plan-qqbot/lib/heal.js | fallbackLegacyEntryKind | L122-157 | js-yaml 不可用时按行匹配旧版根级块（id/name/config.default 逐行核对） |  |
| plugins/dsh-extra-plan-qqbot/lib/heal.js | rootSequenceIndent | L159-169 | 根级序列缩进探测（首条 - 行的缩进宽度） |  |
| plugins/dsh-extra-plan-qqbot/lib/heal.js | isRootSequenceLine | L171-175 | 指定缩进处的根级序列行判定 |  |
| plugins/dsh-extra-plan-qqbot/lib/heal.js | scanRootBlocks | L177-203 | 按根级缩进切分顶层条目块（返回 lines/rootIndent/blocks） |  |
| plugins/dsh-extra-plan-qqbot/lib/heal.js | findLegacyRootBlocks | L205-215 | 扫描并返回旧版根级块清单（解析判定优先、行级兜底） |  |
| plugins/dsh-extra-plan-qqbot/lib/heal.js | removeLegacyRootBlocks | L217-228 | 移除旧版根级块（移除后无实质内容时写顶层 []） |  |
| plugins/dsh-extra-plan-qqbot/lib/heal.js | verifyMigratedPatch | L230-255 | 迁移后校验：顶层为数组且无旧块残留（js-yaml 优先、行级兜底） |  |
| plugins/dsh-extra-plan-qqbot/lib/heal.js | emptyArrayLine | L243 | 顶层空数组行（[]）判定（行级兜底用） |  |
| plugins/dsh-extra-plan-qqbot/lib/heal.js | healPatchRows | L265-303 | 幂等迁移旧版根级 code-runtime/agent-presets 错误块（实为清旧块；静态补行由包内 cordis.patch.yml 唯一提供）；写前 .bak-* 备份、写后校验失败恢复；文件不存在跳过 |  |
| plugins/dsh-extra-plan-qqbot/lib/heal.js | findOwnQqbotProfiles | L311-331 | 扫描 $DSH_HOME/profiles/* 找出锚定本插件的 qqbot profile（bundles + node_modules 双条件） |  |
| plugins/dsh-extra-plan-qqbot/lib/heal.js | ensureDshExtraPlanLink | L339-369 | 建平铺 dsh-extra-plan → Web 包链接：web 缺失跳过/已正确不动/实体或非目标链接提示 pnpm 迁移/仅 ENOENT 建 junction |  |
| plugins/dsh-extra-plan-qqbot/lib/heal.js | healQqbotCompatibility | L375-394 | 对每个自有 profile 依次执行 healPatchRows（清旧错误块）与 ensureDshExtraPlanLink（建链）；整体 try/catch 只记录日志不阻断 |  |
| plugins/dsh-extra-plan-qqbot/scripts/heal.mjs | invokedAsMain | L9-14 | 主脚本判定（node 直跑时执行自愈；本仓插件 CLI 通用写法） |  |
| plugins/dsh-extra-plan/index.js | malformedRecovery | L205-239 | MALFORMED_RESPONSE 限次自愈：llm-retry 已给 {kind:'retry'} 原样透传（不叠加）；否则按 sessionId→Set('turn:step') 同回合只兜底 1 次（防死循环），注入 developer/message 中文提示（append 带 surfaceOp:'append'、纯文本禁带 headerSeq、source.kind 用生产者自有 plugin:dsh-extra-plan）并返回 {kind:'retry'}；**payload 须自带 ≥1 的 turn/step（宿主 append 不补坐标），坐标缺失/非正整数 → 跳过注入但仍返回 {kind:'retry'}**；aborted/无 agent/超次 → null 回退原 action 透传 |  |
| plugins/dsh-extra-plan/index.js | recordAgentError | L253-271 | agent/error 回合错误取证：把宿主回合/步骤级错误（payload {agent,turn,step,error}）逐字落盘到插件目录 extra-plan-agent-errors.jsonl，行 = {ts, sessionId, turn, step, chain}；整体吞错 + 一次性 warn 防刷屏；模块级函数经命名导出供回归冒烟直呼 | 与 recordRequestError 同诊断模式 |
| plugins/dsh-extra-plan/index.js | apply | L275-975 | 插件主入口：第一步 createGateRuntime(cfg.gateWords)（缺失/非法同步抛错，早于任何工具/监听器/服务副作用）→ ctx.effect 在当前 agent scope 注册恰好 7 个 extra_plan_* prompt variable（provider 返回本次 apply 捕获值）→ 配置解析（含变量② bootstrapReadHint）/服务注册/工具注册/creativeMode 模型可见投影/锚点钩子（HP 首轮 tool:read text 用变量②覆盖）；planner 与非 planner child 双模型路由；会话状态按 sessionId 分桶与 agent/disposed 同步 final flush + 单会话回收；tool-jobs 通知由 `agent/inbox/claimed` 同步主入口与 `tools/pre-execute` durable snapshot fallback 共用 `consumeToolJobsNotice`，以 notice `message.id` 建立跨锚点基线，复用 jobId 的新 incarnation 仍可解锁 |  |
| plugins/dsh-extra-plan/index.js | resolveDocumentPath | L308-315 | 取 configEditor 服务的 documentPath 作为 profile patch 文件绝对路径，异常或非字符串时返回空串，供 live-config 决议热读路径。 |  |
| plugins/dsh-extra-plan/index.js | plannerModel | L328 | 热读箭头 getter：pro 规划默认模型（liveConfig.plannerModel；消费点=model-routing 的 getPlannerModel） |  |
| plugins/dsh-extra-plan/index.js | otherAgentModel | L329 | 热读箭头 getter：其他子代理默认模型（消费点=model-routing 的 getOtherAgentModel） |  |
| plugins/dsh-extra-plan/index.js | exploreBudget | L330 | 热读箭头 getter：pro 规划探查额度/单实例子调用上限（消费点=预算文案、noteRunCodeSubCall、plannerGateReason 与组判定） |  |
| plugins/dsh-extra-plan/index.js | plannerPromptSuffix | L331 | 热读箭头 getter：pre-step 拼接的额外引导后缀 |  |
| plugins/dsh-extra-plan/index.js | bootstrapOn | L332 | 热读箭头 getter：anchored 首轮引导开关（消费点=shouldHideCreativeCatalog 与 anchoredFirst 装配） |  |
| plugins/dsh-extra-plan/index.js | runcodeCatchGateOn | L333 | 热读箭头 getter：PTC try/catch 闸门开关（消费点=planner/只读 child/主会话三处组判定传参） |  |
| plugins/dsh-extra-plan/index.js | crossProviderPlannerModelOn | L334 | 热读箭头 getter：跨提供方模型选择开关（消费点=model-routing 双 resolver 入口，新 agent 重决议） |  |
| plugins/dsh-extra-plan/index.js | creativeModeOn | L337 | 热读箭头 getter：创造模式开关（liveConfig.creativeMode；消费点=shouldHideCreativeCatalog 与装配投影 hideCordis） |  |
| plugins/dsh-extra-plan/index.js | getAgents | L357 | 惰性返回 ctx.get('agents') 服务；注入 createAgentRuntime，供判定子会话是否为其父代理下的活跃派发。 |  |
| plugins/dsh-extra-plan/index.js | warn | L360 | 把告警参数原样转发到 console.warn；注入 createAgentRuntime，作为缺父代理等异常情况的告警出口。 |  |
| plugins/dsh-extra-plan/index.js | getPlannerModel | L368 | 返回热读配置 plannerModel（planner 子代理所用模型名）；注入 createModelRouting 供 planner 模型路由决议。 |  |
| plugins/dsh-extra-plan/index.js | getOtherAgentModel | L369 | 返回热读配置 otherAgentModel（非 planner 子代理所用模型名，空串表示不覆盖）；供非 planner 路由决议。 |  |
| plugins/dsh-extra-plan/index.js | getCrossProviderPlannerModel | L370 | 返回热读布尔开关 crossProviderPlannerModel；决定 planner 路由走跨 provider 严格探针还是旧单 provider 路径。 |  |
| plugins/dsh-extra-plan/index.js | getLlm | L371 | 返回 ctx.get('llm') 服务；供 model-routing 查 provider 模型目录（listModels）与真实探针调用。 |  |
| plugins/dsh-extra-plan/index.js | getAgents | L372 | 返回 ctx.get('agents') 服务（同名第 2 处，消费方为 model-routing）；供经 agents.get 回溯父会话链的 provider/model/maxTokens。 |  |
| plugins/dsh-extra-plan/index.js | getDiagPath | L373 | 返回诊断文件路径 diagPath（取自 cfg.diagFile，缺省为插件目录下 extra-plan-request-errors.jsonl）；供追加 planner 降级诊断行。 |  |
| plugins/dsh-extra-plan/index.js | noteRunCodeSubCall | L400 | 单实例子调用上限（planner）：按 sessionId→rootCallId 桶读计数、未超限则 +1；返回拒绝文案或 null；空 rootCallId 与 exploreBudget 文案保持 |  |
| plugins/dsh-extra-plan/index.js | consumeToolJobsNotice | L401-434 | 统一幂等 tool-jobs notice 消费：校验 session/message/非空 message.id/source/content 与 `/background job (\S+)/`；session 内以 message.id 判重，同 id 跨 claimed/durable 幂等，不同 id 即使复用 jobId 也算新通知；首次有效通知按 session 精确删除 jobId 对应的 job_output 键、清空 pollGuard 整表，双解锁后写 notice-id；坏输入与重复通知返回 false 且零 Map 副作用，锚点不删除 notice-id Set | `agent/inbox/claimed` 同步主入口与 `tools/pre-execute` durable user/message fallback 共用；Set 由 disposeSession 按 session 回收，不查询 job running/terminal 状态 |
| plugins/dsh-extra-plan/index.js | shouldHideCreativeCatalog | L464-471 | HP1 判定：C=1、A=1、F、main/planner、M=ptc 时暂隐两个创造 skill |  |
| plugins/dsh-extra-plan/index.js | isAnchoredContextGate | L475-480 | 判定当前 agent 是否满足 anchored context gate：bootstrap 开启、Session 仍处 F，且角色为 main 或 planner（非 live child） | 只读 payload.agent；角色沿现有 isPlannerChild/isChild 语义，不使用 selfAgent 或父 Session 相位 |
| plugins/dsh-extra-plan/index.js | warnPreStepFailure | L482-486 | pre-step 可降级 C 投影/去重异常的一次性告警 helper；返回路径仍保留已经完成的 source 过滤副本，并保证 next 只调用一次 | 不得在关键 source gate/phase 失败时吞错后发送未过滤 decision |
| plugins/dsh-extra-plan/index.js | recordRequestError | L555-577 | 记录 agent/request-error 失败诊断到插件目录 extra-plan-request-errors.jsonl（diagPath 可经 cfg.diagFile 覆盖；行含 turn/step/provider/message/code/causeChain） |  |
| plugins/dsh-extra-plan/lib/agent-runtime.js | isLiveDelegation | L6-17 | 按父会话 registry 存活状态判定委托是否仍有效 |  |
| plugins/dsh-extra-plan/lib/agent-runtime.js | childPolicyNeedsFloor | L20-25 | 判定 read-only（只读） 子代理是否需要 workspace-write floor |  |
| plugins/dsh-extra-plan/lib/agent-runtime.js | createAgentRuntime | L27-109 | 创建 per-apply 角色/缓存/usage baseline 工厂 |  |
| plugins/dsh-extra-plan/lib/agent-runtime.js | isChild | L34-42 | 按显式 events 判定 live child 并发出恢复为 root 警示 |  |
| plugins/dsh-extra-plan/lib/agent-runtime.js | isPlannerChild | L45-63 | 扫描 continuable descriptor；无 descriptor 不缓存 false |  |
| plugins/dsh-extra-plan/lib/agent-runtime.js | toolSchemasOf | L66-84 | 防御式读取 agent scoped tools.schemas，失败/非数组返回 undefined |  |
| plugins/dsh-extra-plan/lib/agent-runtime.js | floorChildPolicy | L86-90 | 为 read-only（只读） child 同步追加 workspace-write sandbox 事件 |  |
| plugins/dsh-extra-plan/lib/agent-runtime.js | usageRoleOf | L92-96 | 优先读取 role WeakMap，保证 disposed 后角色不漂移 |  |
| plugins/dsh-extra-plan/lib/agent-runtime.js | childBaseline | L98-106 | 同步确定 main/planner/executor role、fold usage 并应用 child floor |  |
| plugins/dsh-extra-plan/lib/agent-session.js | sessionEvents | L6-10 | 取 agent.session 事件快照（缺失兜底空数组）；唯一来源 |  |
| plugins/dsh-extra-plan/lib/agent-session.js | isSubagentChild | L17-32 | 判定会话属于子代理（header.origin/delegationDepth/descriptor 三路探测）；唯一来源，index.js 经 decisions re-export |  |
| plugins/dsh-extra-plan/lib/assembly-presentation.js | sectionOf | L30-33 | 按名称取 PromptAssembly section |  |
| plugins/dsh-extra-plan/lib/assembly-presentation.js | skillCatalogEntriesOf | L39-47 | 校验并提取 skill catalog 的最小 name/description 条目 |  |
| plugins/dsh-extra-plan/lib/assembly-presentation.js | renderSkillCatalogText | L49-71 | 按条目重建系统 skill catalog 文本 |  |
| plugins/dsh-extra-plan/lib/assembly-presentation.js | projectSkillCatalogDecision | L73-99 | 在当前消息副本中暂隐创造 skill，不注销 binding |  |
| plugins/dsh-extra-plan/lib/assembly-presentation.js | isCordisPresentationTool | L101-103 | 判断名称是否属于固定 2 项 Cordis 模型可见工具集合 | 模型可见投影；不改变 registry binding |
| plugins/dsh-extra-plan/lib/assembly-presentation.js | filteredCordisSchemas | L105-108 | 从 schema 数组排除固定 2 项 Cordis 工具，供 SDK 整体重建 |  |
| plugins/dsh-extra-plan/lib/assembly-presentation.js | hasSection | L110-112 | 判断 PromptAssembly 是否含指定命名 section |  |
| plugins/dsh-extra-plan/lib/assembly-presentation.js | hasNonEmptySection | L114-116 | 判断 tools:ptc-only 是否为有效非空 section，识别 Pure PTC |  |
| plugins/dsh-extra-plan/lib/assembly-presentation.js | projectAssemblyForPresentation | L119-143 | 创建不原地修改的模型可见 assembly：按当前 schema 交集过滤工具，替换 SDK 文本并隐藏 tool:cordis，另支持 Pure PTC 顶层单入口 | 不改变 registry/restrict/pre-execute |
| plugins/dsh-extra-plan/lib/assembly-presentation.js | sdkSchemasForRendering | L145-152 | 从 schema 输入排除 run_code 与 Cordis，并确保 renderer 获得输出 schema | 不读取原始 tools:sdk 文本 |
| plugins/dsh-extra-plan/lib/assembly-presentation.js | dshToolsEntryCandidates | L154-170 | 生成 DSH_HOME/profile 与平台官方 dsh-tools SDK renderer 候选路径 | 只读加载官方包，不修改安装目录 |
| plugins/dsh-extra-plan/lib/assembly-presentation.js | loadSdkRendererModule | L173-187 | 惰性加载官方 SDK renderer 模块；失败 promise 清空，候选补齐后可重试 |  |
| plugins/dsh-extra-plan/lib/assembly-presentation.js | pending | L175-184 | loadSdkRendererModule 的 in-flight（进行中）module promise（模块 Promise）；reject 后 identity-check 清空供下次重试 |  |
| plugins/dsh-extra-plan/lib/assembly-presentation.js | resolveToolsSdkRenderer | L190-195 | 按 language 选择当前官方 TypeScript/Python SDK renderer，返回函数身份供 cache key 使用；复用模块级动态 import promise |  |
| plugins/dsh-extra-plan/lib/assembly-presentation.js | renderFilteredToolsSdk | L198-201 | 仅以过滤后的 schema 整体调用官方 renderer 生成 tools:sdk，按 ptcRuntime language 选择 TS/Python | 不做原始文本正则删块 |
| plugins/dsh-extra-plan/lib/assembly-presentation.js | toolRegistryOf | L203-211 | 防御式读取 agent scoped tools service，服务缺失或异常返回 undefined |  |
| plugins/dsh-extra-plan/lib/assembly-presentation.js | toolSdkSchemasOf | L213-231 | 优先读取 tools.sdkSchemas；兼容旧服务时从 schemas 补 owned（自有） output schema，供 SDK renderer 使用 |  |
| plugins/dsh-extra-plan/lib/assembly-presentation.js | toolPresentationModeOf | L233-242 | 从 scoped tools registry 读取 native/ptc/both 模式 |  |
| plugins/dsh-extra-plan/lib/client-carrier.js | apply | L5-7 | 空实现的内部 Client carrier 入口：由 settings 动态 Loader entry 通过 dsh.client manifest 触发 lib/client.js 加载，不注册 row、export 或业务副作用。 |  |
| plugins/dsh-extra-plan/lib/client.js | factory | L3-310 | 模块工厂：接收 require，装配并返回本插件客户端模块导出（apply 与 inject 声明），由 __ModuleLoader__ 调用。 |  |
| plugins/dsh-extra-plan/lib/client.js | apply | L112-305 | 客户端插件入口：注入 esp-* 样式表与中英词条；仅注册 detail.section 于当前包详情行列表之后呈现唯一表单（不注册 bundle.config；槽内出现本包条目时让位）；稳定 namespace 的 ConfigForms 快照订阅与一次十项 mutate 共用一份表单，不注册 row/item/tab。 |  |
| plugins/dsh-extra-plan/lib/client.js | useSharedConfigForm | L125-136 | 通过稳定 namespace 调用 ConfigForms.get(NS)，订阅快照并适配为页面期望的 state/mutate facade；不把 bundle key 当 namespace。 | apply 内部闭包 |
| plugins/dsh-extra-plan/lib/client.js | update | L128 | ConfigForms 快照订阅回调：从 getSnapshot 取得最新 state，驱动同页表单刷新。 | useSharedConfigForm 内部 |
| plugins/dsh-extra-plan/lib/client.js | mutate | L134 | ConfigForms mutate facade：把十项 set ops 与读到的 revision 交回官方 controller。 | useSharedConfigForm 内部 |
| plugins/dsh-extra-plan/lib/client.js | optionLabel | L138-143 | 选项显示名：优先 optionLocale 词条，其次布尔 trueValue/falseValue，最后原值字符串 | apply 内部闭包（设置页控件共用） |
| plugins/dsh-extra-plan/lib/client.js | optionValue | L145-149 | 把后端返回的字符串值映射回 field.options 里的原始类型（不在选项中则原样返回） | apply 内部闭包（设置页控件共用） |
| plugins/dsh-extra-plan/lib/client.js | renderControl | L151-176 | 按 field.control 渲染受控控件：textarea／number（透传 min、step）／select（选项文案走 optionLabel、回值走 optionValue）／其余回落 text input；统一 disabled 与 onChange 回传 |  |
| plugins/dsh-extra-plan/lib/client.js | onChange | L155 | textarea 分支的 onChange：把多行文本框当前字符串值透传给上层 onChange 回调。 |  |
| plugins/dsh-extra-plan/lib/client.js | onChange | L162 | number 分支的 onChange：把数字输入框当前字符串值原样透传给上层回调，不做数值转换。 |  |
| plugins/dsh-extra-plan/lib/client.js | onChange | L167 | select 分支的 onChange：把选中值经 optionValue 归一化回原始选项类型后交给上层回调。 |  |
| plugins/dsh-extra-plan/lib/client.js | onChange | L174 | 默认 text 分支的 onChange（非 textarea/number/select 时）：把单行文本框字符串值透传给上层回调。 |  |
| plugins/dsh-extra-plan/lib/client.js | ExtraPlanForm | L178-261 | 共享十项设置表单：从 ConfigForms.get(NS) 适配的 state/mutate 播种 draft（value/writable/revision/status），按 general/pro 两组 esp-section 渲染字段，footer 一次性提交十个 set ops + revision fence 后提示已保存/失败。 |  |
| plugins/dsh-extra-plan/lib/client.js | fieldValue | L201-208 | 取字段草稿值：number 控件把草稿转 Number（非有限数值原样返回），其余控件原样返回 | ExtraPlanForm 内部闭包 |
| plugins/dsh-extra-plan/lib/client.js | saveAll | L210-225 | 只调用一次十项 mutate(ops, revision)；accepted 非 true 或异常均显示失败，不先 PUT 旧公开行、不伪造成功。 |  |
| plugins/dsh-extra-plan/lib/client.js | renderField | L227-236 | 按 field 渲染十项设置中的一个字段：esp-field 内「locale 名称→renderControl（随 snapshot.writable 禁用）→静态 hint」，编辑写回 draft 并清提示。 | ExtraPlanForm 内部闭包；本地稳定字段样式 |
| plugins/dsh-extra-plan/lib/client.js | SettingsCard | L263-271 | SHARED 卡片根组件：固定 page 形态，接收规范化 configForm/translate，渲染 esp-wrap 与唯一 ExtraPlanForm；不保留 summary/view 分支。 |  |
| plugins/dsh-extra-plan/lib/client.js | hasBundleConfigEntry | L273-280 | 检查稳定包名 key 是否已被注册进 bundle.config 槽，供 detail.section 让位避免重复表单。 |  |
| plugins/dsh-extra-plan/lib/client.js | DetailSettingsSection | L282-288 | 仅匹配当前包 bundle subject；bundle.config 槽无本包条目时呈现同一共享表单（唯一通道），槽内出现本包条目则让位返回 null。 |  |
| plugins/dsh-extra-plan/lib/client.js | safeInject | L290-292 | 尝试挂载 detail.section 正式槽；版本缺槽时保留真实缺失而不伪造 row/tab 兼容。 |  |
| plugins/dsh-extra-plan/lib/client.js | registerClientSurfaces | L294-301 | 在 ConfigForms namespace served 时注册 detail.section 唯一正式槽（自绘标题呈现于行列表之后），生命周期由同一 owner 释放。 |  |
| plugins/dsh-extra-plan/lib/executor-spawn.js | resolveDeny | L27-29 | deny 解析纯函数：config.deny 合法（非 null 对象且为数组）时原样返回，否则回退 DEFAULT_DENY | 由 apply 调用；DEFAULT_DENY 已与预设 config.deny 收敛为同集 11 项 |
| plugins/dsh-extra-plan/lib/executor-spawn.js | slotKey | L48-54 | 稳定槽键纯函数：读全局注册符号 Symbol.for('cordis.original') 取 subagents 服务实现本体（traceable 代理 get 拦截器返回 target；root 单例跨 ctx/跨预设世代恒同一对象），非 traceable/取不到符号值时降级回代理本身 | registrationSlots 查表的键来源，槽键语义 = 幂等跨世代命中的前提 |
| plugins/dsh-extra-plan/lib/executor-spawn.js | apply | L56-132 | 插件入口：注册执行者 provider（委托宿主 spawn，注入 deny 工具裁剪）；注册走引用计数幂等——槽键取 slotKey(ctx.subagents)（服务实现本体，不再以 ctx.subagents 代理为键），槽 count>0 时只加持有并 console.warn 后返回，count==0 且已存在同名 provider 时抛真实冲突错，全新注册时保存 host disposer（含 delegator 校验与 defaultedAgentOptions） |  |
| plugins/dsh-extra-plan/lib/executor-spawn.js | releaseSlot | L82-90 | 释放一份注册持有：count 递减，归零且已有宿主 disposer 时调用它反注册并置空（以 ctx.effect 清理回调形式挂载，标签 'executor-spawn: shared provider slot'） |  |
| plugins/dsh-extra-plan/lib/executor-spawn.js | defaultedAgentOptions | L110-114 | 执行者 agentOptions 透传（请求自带优先，否则空对象继承父会话） |  |
| plugins/dsh-extra-plan/lib/executor-spawn.js | start | L119-125 | 执行者 provider 的启动入口：未指定工具过滤时补默认 deny 清单，再转发宿主 provider 启动子代理。 |  |
| plugins/dsh-extra-plan/lib/gate-decisions.js | isDispatchStart | L9 | 判定事件类型是否为 PTC dispatch 起点事件（tool/ptc-dispatch-start），返回布尔值 | 顶层箭头函数常量；值判定另经 L992 注入 run-code-static.js（该文件 L549 复用） |
| plugins/dsh-extra-plan/lib/gate-decisions.js | isDispatch | L10 | 判定事件类型是否为嵌套 PTC dispatch 事件（tool/ptc-dispatch），返回布尔值 | 顶层箭头函数常量；调用点在 deriveFlowState 内（L433） |
| plugins/dsh-extra-plan/lib/gate-decisions.js | purposeRouteDenyReason | L12-14 | 生成「目的确认 ask 未按路由顺序」的拒绝文案，提示先选规划路由词再询问规划目的 | 顶层函数；文案引用本次 apply 的 gateRuntime，提示与验词同源 |
| plugins/dsh-extra-plan/lib/gate-decisions.js | routeDenyReason | L17-22 | 生成路由闸门拒绝文案：规划态下禁主会话写文件，或路由未确认时仅放行只读探查 | 顶层函数；按 state.route==='plan' 二选一返回 |
| plugins/dsh-extra-plan/lib/gate-decisions.js | planDenyReason | L23-34 | 生成规划/委派闸门拒绝文案：直行态禁规划、目的未确认、澄清未完成或子代理未放行 | 顶层函数；按 state.route/purpose/clarified 顺序回落四条文案 |
| plugins/dsh-extra-plan/lib/gate-decisions.js | approvalDenyReason | L35-37 | 生成执行类委派未放行的拒绝文案，提示先经批准 ask 取得用户批准 | 顶层函数；无分支，直接返回模板串 |
| plugins/dsh-extra-plan/lib/gate-decisions.js | filterBootstrapContextDecision | L59-66 | F gated decision 按 source.kind 精确整条删除 agent-instructions/skill-catalog；非 enter、非数组、非 gated 或无命中均透传，命中时复制 decision 并保留其它字段、消息顺序与身份 | 纯函数；不读宿主状态、不改输入；由 index.js 的 agent/pre-step prepend gate 调用 |
| plugins/dsh-extra-plan/lib/gate-decisions.js | projectedSkillCatalogSignature | L68-76 | 校验 skill-catalog 的 entries 并生成有序 [name,description] JSON 签名；空 entries 合法，坏条目返回 undefined 不作去重基准 | 纯函数；签名不使用 id/update/提醒文案，也不访问父 Session 或全局缓存 |
| plugins/dsh-extra-plan/lib/gate-decisions.js | jsonShapeSignature | L78-110 | 对 JSON-like 值生成可比较的规范签名；拒绝循环、getter/非 plain object、非 JSON 类型，供 agent-instructions content 身份比较 |  |
| plugins/dsh-extra-plan/lib/gate-decisions.js | projectedAgentInstructionsSignature | L112-116 | 校验 agent-instructions 的非空 content JSON 形状并生成签名；忽略消息 id/seq/role/source 动态字段 |  |
| plugins/dsh-extra-plan/lib/gate-decisions.js | projectedContextSignature | L118-125 | 按 source.kind 选择 agent-instructions/content 或 skill-catalog/[name,description] 签名；未知 source/坏形状返回 undefined |  |
| plugins/dsh-extra-plan/lib/gate-decisions.js | dedupeProjectedContextDecision | L127-148 | 按 kind 从当前 visibleMessages 取最后合法签名，顺序删除同签名消息并保留变化/移出 surface 重现；无共享缓存且冻结输入可用 |  |
| plugins/dsh-extra-plan/lib/gate-decisions.js | isBootstrapPhase | L149-159 | 判定会话是否处于引导阶段（尚未落盘任何 tool/call 事件），无会话时返回 false | 顶层函数；防御 agent/session 为空、events 非数组；事件源为 agent-session.js 的 sessionEvents |
| plugins/dsh-extra-plan/lib/gate-decisions.js | labelsOfCallData | L166-182 | 解析 ask 调用数据，返回首问 questions[0] 的选项标签数组；JSON 解析失败返回 null | 顶层函数；arguments 为字符串则 JSON.parse、为对象则直用；缺 questions 返回 null，首问无选项返回空数组 |
| plugins/dsh-extra-plan/lib/gate-decisions.js | isExactGateSet | L194-201 | 判定标签集归一后与闸门标准词集合完全相等（精确比较，不用子串） | 顶层函数；先 normalizeGateLabel 去推荐后缀；三分法「完全等于」一侧 |
| plugins/dsh-extra-plan/lib/gate-decisions.js | isPartialGateSet | L204-212 | 判定标签与标准词集合部分相交（≥1 个 indexOf 命中）但不完全相等 | 顶层函数；内部先排除完全相等情形；三分法「部分相交」一侧 |
| plugins/dsh-extra-plan/lib/gate-decisions.js | categorizeGateAsk | L215-219 | 把 ask 选项三分：与路由/批准/目的词集完全相等→standard，相交→malformed，否则 ordinary |  |
| plugins/dsh-extra-plan/lib/gate-decisions.js | gateAskDenyReason | L222-258 | 生成「ask 选项不规范」拒绝文案：列出缺项最少那类标准词，无缺项则提示非白名单修饰 | 顶层函数；缺项数最小项相同时取路由；提示模板块列出路由/批准/目的三组标准选项 |
| plugins/dsh-extra-plan/lib/gate-decisions.js | validateGateAskStructure | L264-291 | 校验标准 ask 的 questions 结构（route/purpose/approve 的问题数与第二问必须纯文本），通过返回 null | 顶层函数；不通过返回中文 deny 文案，未知 kind 返回「未知的 ask 类型」 |
| plugins/dsh-extra-plan/lib/gate-decisions.js | askKindOf | L298-315 | 严格分类 ask：同含路由两词→route，含批准词→approve，同含目的两词→purpose，否则 clarify | 顶层函数；测试契约 API，仅经 decisions 导出供 pe-test 调用（导出实际在 L998，非注释所称 L1244），运行时状态机用 askKindOfRelaxed |
| plugins/dsh-extra-plan/lib/gate-decisions.js | askKindOfRelaxed | L322-338 | 宽松版 ask 分类（状态机用）：按路由特有词、批准特有词、路由否决词、目的词的优先级归类，未命中为 clarify | 顶层函数；不要求同时命中两词，避免 run_code 子调用路径误判；实际调用点 L424/L430/L743（注释所称 L436 已过时） |
| plugins/dsh-extra-plan/lib/gate-decisions.js | matchExactKind | L343-351 | 选中标签归一后与词表条目精确相等，命中返回其内部枚举值，未命中返回 null | 顶层函数；三类 match 的唯一判定口径，禁止 indexOf 子串推进（L250-252 注释） |
| plugins/dsh-extra-plan/lib/gate-decisions.js | matchRouteLabel | L353-360 | 把路由选择映射为内部枚举：direct/plan，无则回退 routeDisagree→disagree，未命中 null | 顶层函数；先路由特有词再路由否决词；依赖 matchExactKind |
| plugins/dsh-extra-plan/lib/gate-decisions.js | matchApprovalLabel | L362-369 | 把批准选择映射为内部枚举：approve/replan，无则回退 routeDisagree→disagree，未命中 null | 顶层函数；先批准特有词再共享的路由否决词；依赖 matchExactKind |
| plugins/dsh-extra-plan/lib/gate-decisions.js | matchPurposeLabel | L371-376 | 把规划目的选择映射为内部枚举：refine/redo；未命中返回 null | 顶层函数；依赖 matchExactKind，无回退词 |
| plugins/dsh-extra-plan/lib/gate-decisions.js | firstTextOfBlocks | L379-385 | 取 ContentBlock 数组中首个 text 块文本；非数组或无 text 块返回空串 | 顶层函数；防御空值/非对象块；被 parseAskResultData（L316）与 parseDispatchAskResult（L361）复用 |
| plugins/dsh-extra-plan/lib/gate-decisions.js | askResultTextIsDenied | L390-392 | 按文案判闸门拒绝：以 'Error: ' 开头且不属于宿主取消句 → true | 顶层函数；宿主取消句常量 HOST_ASK_CANCEL_TEXTS 在 L51（两条逐字常量） |
| plugins/dsh-extra-plan/lib/gate-decisions.js | parseAskResultData | L399-436 | 解析 ask 的 tool/result 事件：正常答复返回 answersLen/selected，闸门拒绝→denied，其余错误→error | 顶层函数；与本 ask 无关（信封不合法或 toolCallId 非字符串）返回 {callId: undefined}；isError:true 且无 data.error 时按文案区分 denied/error；调用点 L470 |
| plugins/dsh-extra-plan/lib/gate-decisions.js | parseDispatchAskResult | L445-473 | 解析嵌套 ask（tool/ptc-dispatch 事件，run_code 程序内嵌套调用）的结果：按 subCallId 与 isError 判定，返回 ok（answersLen/selected）、denied（闸门拒绝）、error（其它错误）或 callId undefined（subCallId 非字符串） | 与 parseAskResultData 同构，供 deriveFlowState 与组判定复用；入参为 dispatch 事件 data |
| plugins/dsh-extra-plan/lib/gate-decisions.js | deriveFlowState | L483-595 | 四级锚点状态机：自最近一条人类消息后的事件推导 route（none/direct/plan）、clarified、approved、purpose（none/refine/redo）与 channelBroken；闸门拒绝不改字段，宿主取消/通道错误按码清四字段 | 纯函数；事件含 tool/call、dispatch、tool/result 三条路径 |
| plugins/dsh-extra-plan/lib/gate-decisions.js | resetStageState | L485-489 | 重置阶段层状态：purpose 回 none、clarified 与 approved 回 false（不动 route） | deriveFlowState 内部闭包；路由选择后与 purpose 生效时调用 |
| plugins/dsh-extra-plan/lib/gate-decisions.js | resetRouteState | L490-493 | 重置路由层状态：route 回 none，并级联调用 resetStageState 清空阶段层三字段 | deriveFlowState 内部闭包；取消/非通道码错误时调用 |
| plugins/dsh-extra-plan/lib/gate-decisions.js | catalogHasWriteTools | L607-612 | 判定工具目录是否含写工具：元素为字符串或 { name } 对象，命中 write 或 edit 即 true（非数组 false） | 目录形状判定回落分支；被 isReadOnlyChildByCatalog 调用 |
| plugins/dsh-extra-plan/lib/gate-decisions.js | isReadOnlyChildByCatalog | L615-617 | 只读子代理判定：目录非空且不含 write/edit 即 true，用于识别 reviewer/探查者角色 | 依赖 catalogHasWriteTools；目录折叠时改用 schemasHasWriteTools |
| plugins/dsh-extra-plan/lib/gate-decisions.js | schemasHasWriteTools | L622-627 | 判定真实工具集（tools.schemas）是否含 write/edit：有则可写（executor），无可写则只读（probe/reviewer）；非数组 false | 与 catalogHasWriteTools 同形状约定，用于 ptc 折叠目录时的角色判定 |
| plugins/dsh-extra-plan/lib/gate-decisions.js | schemasHasTool | L631-636 | 判定真实工具集是否含指定工具名（如 save_probe 信号：仅主会话与已认领探查者注册）；非数组 false | 形状约定同上 |
| plugins/dsh-extra-plan/lib/gate-decisions.js | catalogIsCollapsed | L643-648 | 判定 ptc 折叠目录：工具数组长度恰为 1 且唯一项是 run_code 即 true；折叠时目录不含 write/edit 不能推断只读，须改用真实工具集 | both/native 模式均不折叠 |
| plugins/dsh-extra-plan/lib/gate-decisions.js | subagentProbeGateReason | L654-667 | 探查者委派闸门：仅 main 且 run_in_background=true 放行；planner 返回「申请继续探查」，其它 child 用只读角色文案拒绝；参数不可解析时交运行时瀑布兜底 | 直呼与 run_code 组判定共用 |
| plugins/dsh-extra-plan/lib/gate-decisions.js | shellMutationReason | L673-687 | 只读角色的 shell 写命令拒绝文案：planner/探查者/验收复核者三类角色命中 pwsh/bash 写形态时返回对应中文理由，其余（未知角色、非 shell、只读命令）返回 null | role 仅接受 planner/probe/reviewer；写形态判定复用 shell-mutation |
| plugins/dsh-extra-plan/lib/gate-decisions.js | plannerGateReason | L691-705 | planner 角色工具闸门：write/edit 拒绝 → shell 写命令拒绝 → job_output 走进同一闸门 → 非免费工具且预算超限则返回预算耗尽文案；不含 run_code，通过返回 null | 自 apply 提取的纯部分；run_code 由调用方处理 |
| plugins/dsh-extra-plan/lib/gate-decisions.js | childReadonlyGateReason | L709-717 | 只读子代理工具闸门：write/edit 按 probe 布尔选探查者/验收复核者文案拒绝 → shell 写命令 → job_output 查重；不含 run_code，通过返回 null | probe=true 时文案为「探查者只读」 |
| plugins/dsh-extra-plan/lib/gate-decisions.js | jobOutputGateReason | L722-744 | job_output 全角色闸门：禁 wait: true 前台等待；同一 session 内对同一 job_id 重复调用则拒绝（查重只读）；计数器或会话 id 缺失时跳过查重，通过返回 null | 写入侧唯一位点是 recordJobOutputCall |
| plugins/dsh-extra-plan/lib/gate-decisions.js | recordJobOutputCall | L750-762 | job_output 放行后记录计数器：工具名恰为 job_output、job_id 与会话 id 均为字符串且 counters 可用时惰性建 session Map 并写 jobId→1，返回 true；不满足即 false 且零副作用 | B3 收敛唯一写入位点；planner/只读 child/主会话共用，执行者豁免；返回值仅测试断言用 |
| plugins/dsh-extra-plan/lib/gate-decisions.js | pollGuardGateReason | L768-781 | 主会话 job_list/list_agents 防轮询闸门：同一锚点周期内该工具已调用过则返回「禁止轮询子代理状态」拒绝文案，首次或非两工具返回 null | 只读查重；vExec 无 agent（组判定成员）时跳过 |
| plugins/dsh-extra-plan/lib/gate-decisions.js | recordPollGuardCall | L783-794 | job_list/list_agents 放行后记录计数器：按 sessionId 建 Set 并加入工具名，返回 true；工具名不符、会话 id 非字符串或 counters 缺失返回 false | 唯一写入位点，仅主会话路径调用 |
| plugins/dsh-extra-plan/lib/gate-decisions.js | probeDisposalWarning | L802-805 | 探查者级联中止告警文案：remaining 为正整数时提示委派方会话销毁仍有未认领探查者委派、后台 job 可能已被宿主级联取消，并注明属已知引擎限制；否则返回 null | 触发点=agent/disposed 清理时仍有未认领计数 |
| plugins/dsh-extra-plan/lib/gate-decisions.js | mainGateReason | L815-953 | 主会话工具闸门总分派：按 ask→write/edit→cordis 只读→shell→planToolName→save_probe→委派族→job_kill/send_message→轮询守卫→run_code（depth+1）→job_output 顺序判定，返回拒绝文案或 null 放行 | gateRuntime 必填否则抛错；save_plan 已无显式分支，落兜底放行 |
| plugins/dsh-extra-plan/lib/gate-decisions.js | runCodeGroupDenyReason | L965-1049 | run_code 组判定：拆解代码为成员后逐成员按角色（main/planner/只读 child）走与直呼相同的闸门，再叠加多调用容错、planner 调用点上限与预算耗尽白名单，任一拒绝即聚合整组拒绝文案，全通过返回 null | 内部闭包 visit（L892-935）另有地图条目，不重复描述；role 缺省按 main |
| plugins/dsh-extra-plan/lib/gate-decisions.js | visit | L983-1026 | run_code 组判定递归拆解器：主会话侧 ASK 返回值硬闸门 → 拆解成员 → 嵌套 run_code 原位展平（depth≥1 或参数不可解析则跳过，交运行时瀑布）→ 逐成员按角色分流闸门（subagent_probe／裸写／planner／只读 child／main）；组内任一拒绝即整体拒绝 | runCodeGroupGateReason 内部闭包 |
| plugins/dsh-extra-plan/lib/gate-decisions.js | aggregateRunCodeDenyReason | L1055-1067 | 把组判定的成员与拒绝项聚合为统一报错文本：header 给出组规模与触发计数（任一触发即整体拒绝），再逐行「- 标签: 子文案」，裸写与参数不可解析各有标签规则 | 标签序=展平后组员顺序；行 1004 为空行（文件末），非函数条目 |
| plugins/dsh-extra-plan/lib/gate-words.js | fail | L31-33 | 统一抛出 'extra-plan: config.gateWords ' 前缀的校验错误（错误前缀的唯一出口） |  |
| plugins/dsh-extra-plan/lib/gate-words.js | normalizeGateLabel | L36-38 | 推荐后缀归一（(Recommended)/（Recommended）/(推荐)/（推荐），四级后缀、英文大小写不敏感、前后空白），与 index.js normalizeLabel 同规则；仅供校验保留后缀用 |  |
| plugins/dsh-extra-plan/lib/gate-words.js | validateGateWords | L44-71 | 整组严格校验：非数组对象、键集合恰为 7 键、每值为非空字符串、首尾无空白、无 CR/LF、7 值两两不同、不以保留推荐后缀结尾；合法返回冻结副本，任何一条不合法即抛错（禁止部分接受） |  |
| plugins/dsh-extra-plan/lib/gate-words.js | bracketed | L73-75 | 选项集合文本拼接（「词」「词」…），与历史静态 OPTIONS_TEXT 逐字同构 |  |
| plugins/dsh-extra-plan/lib/gate-words.js | createGateRuntime | L85-114 | 运行时词表工厂：仅从入参派生 words/route/approval/purpose 冻结数组 + 三套 Set + options/confirm 插值片段 + variables（变量名→本次 apply 值）；无默认词表，缺失/非法即抛错 |  |
| plugins/dsh-extra-plan/lib/live-config.js | textOf | L32-34 | 非空字符串 trim 取值（空串/非串 → ''），用于路径与环境变量决议 |  |
| plugins/dsh-extra-plan/lib/live-config.js | envConfigPath | L36-38 | 环境变量 DSH_EXTRA_PLAN_CONFIG_PATH 取值（空/缺省 → ''，体检用它隔离生产现场配置） |  |
| plugins/dsh-extra-plan/lib/live-config.js | statStamp | L41-59 | fs.statSync 优先取 dev/ino/size/mtimeNs/ctimeNs，兼容回退 ino/size/mtimeMs/ctimeMs 拼变更 stamp；失败返回 { ok:false, reason } 不抛出 |  |
| plugins/dsh-extra-plan/lib/live-config.js | pick | L61-65 | 按 key 的标量类型收口（布尔含 webFetch／trim 字符串／正整数／工具呈现模式枚举），非法值一律回落 fallback（回退） |  |
| plugins/dsh-extra-plan/lib/live-config.js | normalizedFallback | L67-74 | 归一 fallback（回退）Defaults：只取 8 个热读键，缺失键用内置兜底（2 项宿主行值仍由 settings 权威行/宿主装载期快照消费） |  |
| plugins/dsh-extra-plan/lib/live-config.js | createLiveConfig | L82-210 | 热读工厂：决议路径 + 构造期**无条件读盘一次**（文件真值作首拍基准，成功即记 stamp；失败回退 fallback（回退）Defaults + warnOnce）；返回 8 个 getter（取值先 refresh 再做 stamp 比对），宿主行设置不作为运行时 getter；creativeMode getter 保留且由 live-config 热读消费；不做监听/轮询/订阅 |  |
| plugins/dsh-extra-plan/lib/live-config.js | warnOnce | L93-97 | 同实例只告警一次（防抖）：不可用原因 + 生效路径 + 「回退到 apply 期快照兜底」 |  |
| plugins/dsh-extra-plan/lib/live-config.js | currentPath | L100-110 | 路径决议（构造期与每次取值现场调用）：显式 configPath → 环境变量 DSH_EXTRA_PLAN_CONFIG_PATH → resolver()（宿主 configEditor.documentPath）；resolver 缺失或抛出返回空串 |  |
| plugins/dsh-extra-plan/lib/live-config.js | readDiskValues | L113-135 | 读盘→解析→取值单一实现（构造期与 stamp 变化后的刷新共用）：readFileSync + **captureRowSettings(SETTING_DEFINITIONS)**，只按 8 项热读键的 states 覆盖、其余回落 fallback（回退）；未捕获到任何键视为取值失败；失败返回 { ok:false, reason } 不抛出 |  |
| plugins/dsh-extra-plan/lib/live-config.js | refresh | L155-184 | 变更检测主体：stamp 未变直接返回（零 IO 零解析）；变了才 readFileSync + captureRowSettings 解析，按 8 项热读键 states 覆盖 fallback（回退）；stat/解析失败回落 fallback（回退）并 warnOnce |  |
| plugins/dsh-extra-plan/lib/live-config.js | read | L186-189 | getter 取值通道：refresh() 后读当前 values[key] |  |
| plugins/dsh-extra-plan/lib/live-config.js | anchoredBootstrap | L193 | 读取 anchoredBootstrap 开关当前值：首轮极简工具+提示词；供 index.js pre-step 装配 bootstrap 收窄，热读即时生效。 |  |
| plugins/dsh-extra-plan/lib/live-config.js | creativeMode | L195 | 读取 creativeMode 开关当前值：dsh 官方创造模式；供 index.js C 矩阵隐藏集合与装配投影 hideCordis 消费，热读即时生效。 |  |
| plugins/dsh-extra-plan/lib/live-config.js | runcodeCatchGate | L197 | 读取 runcodeCatchGate 开关当前值：PTC 模式每个工具调用的 try/catch 闸门；供 index.js 组判定消费，热读即时生效。 |  |
| plugins/dsh-extra-plan/lib/live-config.js | crossProviderPlannerModel | L199 | 读取 crossProviderPlannerModel 开关当前值：是否跨提供方选模型；供 model-routing.js 双 resolver 入口消费，热读即时生效。 |  |
| plugins/dsh-extra-plan/lib/live-config.js | plannerModel | L201 | 读取 plannerModel 当前值：pro 规划默认模型名；供 model-routing.js 解析 planner 模型时消费，热读即时生效。 |  |
| plugins/dsh-extra-plan/lib/live-config.js | plannerPromptSuffix | L203 | 读取 plannerPromptSuffix 当前值：pro 规划额外引导后缀文本；供 index.js pre-step 拼接到任务末尾，热读即时生效。 |  |
| plugins/dsh-extra-plan/lib/live-config.js | exploreBudget | L205 | 读取 exploreBudget 当前值：pro 规划探查额度；供 index.js 预算文案、单实例子调用上限与组判定消费，热读即时生效。 |  |
| plugins/dsh-extra-plan/lib/live-config.js | otherAgentModel | L207 | 读取 otherAgentModel 当前值：其他子代理默认模型名；供 model-routing.js 非 planner 解析消费，热读即时生效。 |  |
| plugins/dsh-extra-plan/lib/model-routing.js | isExplicitRoute | L11-17 | 按直接父 provider/model 比较 child resolved route，判断 agentOptions 显式路由并短路模型解析 |  |
| plugins/dsh-extra-plan/lib/model-routing.js | isExplicitEffort | L21-23 | 显式指定 reasoningEffort 判断 |  |
| plugins/dsh-extra-plan/lib/model-routing.js | requestConfigSnapshot | L33-46 | 从 Agent 的 requestHeader 只提取 provider/model/maxTokens/reasoningEffort owned（自有） 路由快照，异常或缺 config 返回 null | 不序列化/持有 Cordis 对象 |
| plugins/dsh-extra-plan/lib/model-routing.js | agentFromRegistry | L48-51 | 防御式按 session id 从 agents registry 取父 Agent，服务缺失或 get 异常返回 undefined |  |
| plugins/dsh-extra-plan/lib/model-routing.js | resolveAgentRouteSources | L54-79 | 沿 parentSession 链解析直接父与完整顶层主会话来源；断链标记 incomplete，不把中间 child 当主会话 fallback（回退） | 非 planner 与 probe 共用 |
| plugins/dsh-extra-plan/lib/model-routing.js | decidePlannerModelUse | L101-114 | T2 静默降级判定：目录命中→用 plannerModel；清单非空未命中→不覆盖（inherit-parent）；空/异常→沿用 |  |
| plugins/dsh-extra-plan/lib/model-routing.js | routeKey | L125-127 | 以 provider 与 model 组成 probe outcome 复用键，避免 fallback（回退） 同路由二次请求 | 仅 resolver 内部使用 |
| plugins/dsh-extra-plan/lib/model-routing.js | comparePlannerText | L129-133 | 规划 provider name/id 的确定性字典序比较 |  |
| plugins/dsh-extra-plan/lib/model-routing.js | plannerProviderRank | L135-139 | 候选排序层级：普通 provider、父会话 provider、deepseek-official |  |
| plugins/dsh-extra-plan/lib/model-routing.js | sortPlannerCandidates | L141-152 | 真实探针成功候选排序：普通 name/id 正序，父 provider 倒数第二，官方最后 |  |
| plugins/dsh-extra-plan/lib/model-routing.js | createModelRouting | L157-509 | 创建 per-apply 模型路由工厂：内部新建 plannerModelCache/otherAgentModelCache WeakMap，承载 planner 与非 planner 的 legacy/strict 双路径解析，返回 { resolvePlannerEntry, resolveOtherAgentEntry } | 每次 apply 各一份（绝不提升为模块全局）；llm/agents/诊断路径走惰性 getter |
| plugins/dsh-extra-plan/lib/model-routing.js | plannerAbortError | L165-168 | 保留外部 turn abort 原因，避免改写为严格路由阻断 |  |
| plugins/dsh-extra-plan/lib/model-routing.js | withPlannerProbeDeadline | L172-205 | planner 与非 planner route 共用本地 30000ms AbortController/race 覆盖目录、准备与流消费并清理计时器 | 不遵守 signal 的第三方 adapter 可能遗留 I/O |
| plugins/dsh-extra-plan/lib/model-routing.js | probePlannerRoute | L209-251 | planner 与非 planner 候选或顶层 fallback（回退） 共用 prepareCall + 完整 prepared stream 的 OK probe，隔离失败终止块/无终止块/超时 | 仅 True 路径调用，不把目录或 resolveCallConfig 当成功 |
| plugins/dsh-extra-plan/lib/model-routing.js | probePlannerCandidates | L258-274 | 有界并发探针池（上限 PLANNER_PROBE_CONCURRENCY=5）：候选按入参顺序启动、超出排队；返回值与入参一一对应且按发起顺序排列（完成顺序不影响结果），调用方在全部结束后回填 probeOutcomes/successes 再排序 |  |
| plugins/dsh-extra-plan/lib/model-routing.js | worker | L261-268 | probePlannerCandidates 的并发池内层 worker：用共享游标 next 领取下一个候选索引直到取尽；每个候选各自走 probePlannerRoute（独立 AbortController + 30s deadline，不共享） |  |
| plugins/dsh-extra-plan/lib/model-routing.js | uniqueProviderCandidates | L276-285 | provider 候选去重规范化：跳过非对象、id 非字符串或空串及重复项，返回 {id, name}（name 缺失回退 id）数组。 |  |
| plugins/dsh-extra-plan/lib/model-routing.js | collectStrictProbeCandidates | L288-308 | strict 路径共用收集：取全量 provider 目录（超时/异常按不可用），逐个并发探针，返回命中映射 Map 与成功候选数组。 |  |
| plugins/dsh-extra-plan/lib/model-routing.js | resolvePlannerEntryLegacy | L311-367 | False/缺失/非法开关的旧单 provider listModels advisory 解析与原降级诊断 | 不枚举 provider、不做真实 probe |
| plugins/dsh-extra-plan/lib/model-routing.js | resolvePlannerEntryStrict | L370-415 | True 路径枚举全 provider、等待全部匹配候选排序，并验证父 provider/model fallback（回退）；无验证路由固定 reject | plannerModel 为空仅验证父 fallback（回退） |
| plugins/dsh-extra-plan/lib/model-routing.js | resolvePlannerEntry | L419-428 | 单点分流并立即缓存 in-flight promise：False 走旧 advisory，True 走全 provider 真实 probe 与严格 fallback（回退） | 成功 entry 与 rejection 均固定到 Agent |
| plugins/dsh-extra-plan/lib/model-routing.js | nonPlannerRouteSources | L432-436 | 读取非 planner resolver 所需的 agents registry，并把服务异常转换为不可用来源 |  |
| plugins/dsh-extra-plan/lib/model-routing.js | nonPlannerFallbackEntry | L438-446 | 组装顶层主会话 provider/model fallback（回退）；普通 child 继承直接父 maxTokens，probe 保留顶层 maxTokens |  |
| plugins/dsh-extra-plan/lib/model-routing.js | resolveOtherAgentEntryLegacy | L449-466 | cross=false/缺失/非法时只查顶层主会话 provider 的 advisory listModels，命中 otherAgentModel 才覆盖，否则回退 | 不枚举 provider、不做真实 probe |
| plugins/dsh-extra-plan/lib/model-routing.js | resolveOtherAgentEntryStrict | L470-495 | cross=true 时枚举全 provider，串行 probe otherAgentModel，候选全失败后验证主会话 fallback（回退），失败固定阻断 | 复用 probePlannerRoute/withPlannerProbeDeadline |
| plugins/dsh-extra-plan/lib/model-routing.js | resolveOtherAgentEntry | L498-507 | 非 planner 单一入口，按 cross 开关选择 legacy/strict，并立即缓存单 Agent 的 in-flight（进行中）/成功/rejection promise | 不读写 plannerModelCache |
| plugins/dsh-extra-plan/lib/planner-budget.js | toolCallCount | L11-40 | 按成功 tool/result 配对统计工具调用并跳过白名单工具 |  |
| plugins/dsh-extra-plan/lib/planner-budget.js | toolCallsSinceUser | L43-55 | 统计最近 user/agent-message 锚点后的预算调用数 |  |
| plugins/dsh-extra-plan/lib/planner-budget.js | appendSuffixBlock | L57-74 | 给 user/agent-message 的首个文本块幂等追加后缀 |  |
| plugins/dsh-extra-plan/lib/planner-budget.js | withPlannerPromptSuffix | L76-83 | 拼接 planner 任务后缀并保持多块换行语义 |  |
| plugins/dsh-extra-plan/lib/planner-budget.js | budgetNoticeText | L88-90 | 构造本轮探查预算告知文案 |  |
| plugins/dsh-extra-plan/lib/planner-budget.js | withBudgetNotice | L92 | 将预算告知幂等拼入任务消息 |  |
| plugins/dsh-extra-plan/lib/planner-budget.js | budgetReminderText | L94-98 | 按阈值构造剩余预算提醒文案 |  |
| plugins/dsh-extra-plan/lib/planner-budget.js | budgetReminderMessage | L105-107 | 用宿主消息构造器生成预算提醒 user/message，source 为生产者自有 kind plugin:dsh-extra-plan（v4 行准入禁旧包裹 plugin） |  |
| plugins/dsh-extra-plan/lib/planner-budget.js | budgetReminderSent | L109-129 | 判断当前 user/agent-message 锚点后是否已提醒 |  |
| plugins/dsh-extra-plan/lib/planner-budget.js | budgetExhaustedReason | L131-133 | 构造预算耗尽拒绝与继续探查指令 |  |
| plugins/dsh-extra-plan/lib/planner-budget.js | budgetExceeded | L135-137 | 判定 used 是否超过预算上限 |  |
| plugins/dsh-extra-plan/lib/preset-sync.js | loadOfficialAgentPreset | L35-49 | 从 workspace/官方 dsh 安装树加载 @deepseek-ai/dsh-agent-preset 默认导出；失败返回 undefined，由 apply 记录不阻断告警 |  |
| plugins/dsh-extra-plan/lib/preset-sync.js | contentHash | L61-69 | 预设资产内容哈希 |  |
| plugins/dsh-extra-plan/lib/preset-sync.js | pluginRows | L72-84 | plugins 行深度优先展平（唯一的遍历来源）：按当前数组顺序收集行对象，并递归展开 group 行 config 子行；非数组返回空数组。 |  |
| plugins/dsh-extra-plan/lib/preset-sync.js | visit | L74-81 | 递归遍历 plugins 行数组：字符串 id 推入 ids，遇 config 数组继续下钻（非数组直接返回） | pluginRowIds 内部闭包 |
| plugins/dsh-extra-plan/lib/preset-sync.js | pluginRowIds | L86-88 | 声明行 plugins 的行 id 集合（含 group 行 config 子行数组，扁平化；空串与非对象行跳过） |  |
| plugins/dsh-extra-plan/lib/preset-sync.js | declarationCoversAsset | L90-94 | 声明行是否仍承载本预设组合：行 id 集合覆盖 DECLARATION_ROW_IDS（extra-plan + 2 项宿主行 id），非数组一律 false |  |
| plugins/dsh-extra-plan/lib/preset-sync.js | plainObject | L96-98 | 判定非 null、非数组对象，供 config 层合并与 definition 校验复用 |  |
| plugins/dsh-extra-plan/lib/preset-sync.js | userWritableByRow | L100-116 | 用户可写位置表（行 id → 该行「用户可改」的 config 键集合）：唯一来源 = HOST_ROW_SETTING_DEFINITIONS.**projectionLocator**（声明行子行 tool-web.fetch / tool-presentation.mode —— 权威值已上移 settings 行，本体剥离只看声明行）与 GATE_WORDS_GROUP_DEFINITION（extra-plan.gateWords）；**与搬运写回清单严格同源，剥离表与写回清单必须恒等** |  |
| plugins/dsh-extra-plan/lib/preset-sync.js | push | L102-109 | 归一化 `config.` 前缀后的单键写入表（含点号的多级路径与空键一律忽略） | userWritableByRow 内部闭包 |
| plugins/dsh-extra-plan/lib/preset-sync.js | stripUserWritable | L118-129 | 剥离用户可写键（置 `__user__` 占位、保持键序与结构）得到「本体」视图；递归处理 group 行的 config 数组 |  |
| plugins/dsh-extra-plan/lib/preset-sync.js | declarationBodyMatchesAsset | L131-134 | 声明行「本体」是否与资产一致（剥离用户可写键后逐字比 JSON）；任一输入非数组 → 保守 true（不触发重建，信息不全时绝不改写现场） |  |
| plugins/dsh-extra-plan/lib/preset-sync.js | carryUserWritable | L136-160 | 从现有声明行抽出用户可写项（与剥离表同源）：显式迁移值缺省时的用户值来源；**旧副本缺席（source: absent）时靠它保住现场定制**（2 项宿主行 + 7 词） |  |
| plugins/dsh-extra-plan/lib/preset-sync.js | effectiveRowConfig | L162-173 | **权威值读取原语**：宿主 configuration() 行 → 生效 config（inherited 层 → Loader 行 declared config → profile override 浅合并，高优先层胜）；宿主 override 就是该行 config 本身，另兼容 override.config 行节点形状；无层 → null（不可判定） | settings.js 与 preset-sync.js 共用（同一实现，单点） |
| plugins/dsh-extra-plan/lib/preset-sync.js | readAuthoritySettings | L175-198 | **权威值上移读取**：settings 行 = 10 项设置的唯一权威落点 —— 宿主侧取 options.settingsValues（present=true），夹具侧由 options.readPatch() 文本经 captureRowSettings 捕获（rowPresent 区分「行缺席」与「行在但缺项」）；两者皆无 → { present:false, values:{} }，信息不全时不改写现场 |  |
| plugins/dsh-extra-plan/lib/preset-sync.js | findRowsById | L201-216 | 深度优先查找指定 id 的 raw patch/插件行，去重循环对象 | raw 迁移读取 |
| plugins/dsh-extra-plan/lib/preset-sync.js | visit | L204-213 | 递归遍历 plugins（含 group 子行），按剥离表抽出用户可写键值 → hostRowConfig / gateWords | carryUserWritable 内部闭包 |
| plugins/dsh-extra-plan/lib/preset-sync.js | validDefinitionValue | L218-220 | 以 settings descriptor validator 判定旧值是否合法 | 迁移辅助 |
| plugins/dsh-extra-plan/lib/preset-sync.js | captureLegacyValues | L222-245 | 从旧 preset body 按 sourceLocator 捕获十项合法值并记录 missing/ambiguous/invalid 状态 | 不求值 |
| plugins/dsh-extra-plan/lib/preset-sync.js | validGateWordsOrUndefined | L247-249 | 仅对旧迁移/兼容投影尝试整组校验，非法返回 undefined 供诊断/跳过；当前权威值走 resolveUnifiedConfig 的严格抛错路径。 |  |
| plugins/dsh-extra-plan/lib/preset-sync.js | legacyStateFromPlugins | L251-265 | 从旧声明 plugins 捕获合法十项兼容值与严格 gateWords；重复/非法保持状态诊断，不求值表达式。 |  |
| plugins/dsh-extra-plan/lib/preset-sync.js | readLegacyState | L268-322 | 安全解析旧公开投影与 preset-extra-plan body；分别记录来源、重复/非法诊断，保留 !!js 数据而不求值，供缺项迁移。 |  |
| plugins/dsh-extra-plan/lib/preset-sync.js | defaultsForSettings | L324-327 | 合并十项 descriptor 默认与作者模板派生的两项宿主默认，作为统一解析最后回退层。 |  |
| plugins/dsh-extra-plan/lib/preset-sync.js | resolveUnifiedConfig | L330-399 | 解析 settings 权威值→合法旧投影→旧 body→默认；当前显式 gateWords 非法立即抛错并不生成替换 patch，记录每键来源与唯一全局行补齐计划。 |  |
| plugins/dsh-extra-plan/lib/preset-sync.js | restateSettingsConfig | L401-426 | 合并继承/当前全局 config 的合法十项与 gateWords，再应用指定 patch；不清除其它权威字段，非法 gateWords 整组抛错。 |  |
| plugins/dsh-extra-plan/lib/preset-sync.js | assertPresetDefinition | L430-444 | 严格校验纯 definition 元数据、17 条 plugins、三个 group 与 isolate=true；拒绝 Loader insert wrapper |  |
| plugins/dsh-extra-plan/lib/preset-sync.js | parsePresetDefinition | L446-448 | 用 !!js-preserving YAML schema 解析并校验生成 definition |  |
| plugins/dsh-extra-plan/lib/preset-sync.js | assetDefinition | L450-453 | 读取 preset-definition.generated.yml；缺失/坏资产立即抛错，不回写目标 |  |
| plugins/dsh-extra-plan/lib/preset-sync.js | assetPlugins | L455-457 | 读取纯 definition 的 plugins；资产缺失或解析失败一律 undefined（旧 body 夹具仍可保守回退） |  |
| plugins/dsh-extra-plan/lib/preset-sync.js | readDefinitionGateWords | L459-463 | 从 definition 的 extra-plan 行读取并整组校验七个 gateWords |  |
| plugins/dsh-extra-plan/lib/preset-sync.js | cloneDefinitionWithProjection | L465-481 | 深拷贝 definition，仅重述两项宿主行投影与 gateWords；保留 raw !!js marker |  |
| plugins/dsh-extra-plan/lib/preset-sync.js | definitionWithProjection | L483-485 | 读取资产并生成供官方 adapter 使用的新 revision definition |  |
| plugins/dsh-extra-plan/lib/preset-sync.js | publicConfigOf | L487-490 | 兼容 configuration row wrapper 与直接 config 对象：前者取 effectiveRowConfig，后者取 plain object；其它值返回空对象 |  |
| plugins/dsh-extra-plan/lib/preset-sync.js | directProjectionFromLegacy | L492-503 | 将旧 preset body 的 tool-web/tool-presentation/gateWords 转成公开行支持字段 |  |
| plugins/dsh-extra-plan/lib/preset-sync.js | assertTemplateGateWords | L505-509 | 厂商模板整组前置校验：缺失/非法一律抛错（在 hash/idle 判定与任何目标目录动作之前，坏模板不得进入发布流程） |  |
| plugins/dsh-extra-plan/lib/preset-sync.js | readDeclaredPluginsFromPatch | L511-524 | 从 profile patch 文本旁路只读旧 id=preset-extra-plan 的 config.plugins；空文本、YAML 非法或未命中返回 undefined |  |
| plugins/dsh-extra-plan/lib/preset-sync.js | visit | L516-521 | 递归遍历 raw patch 对象，提取旧 preset-extra-plan plugins | readDeclaredPluginsFromPatch 内部 |
| plugins/dsh-extra-plan/lib/preset-sync.js | readLegacyPresetState | L526-529 | 从 profile 文本只读抽取旧 preset-extra-plan 支持投影，不删除旧行 |  |
| plugins/dsh-extra-plan/lib/preset-sync.js | syncPreset | L535-589 | 统一全局行同步：当前十项合法值优先，旧公开行/body/raw patch 只填缺项；两项宿主值与 gateWords 派生到纯 definition，再由 owner 交官方 adapter；无运行期台账。 | action 在全局行需要补齐或声明本体过时时为 `written`，稳态为 `idle` |
| plugins/dsh-extra-plan/lib/preset-sync.js | findEntry | L591-594 | 在 configuration() rows 中按 entry.options.id 匹配唯一 entry，供 activeLegacyRow 与 applyPlan 共用；非唯一或未命中返回 undefined |  |
| plugins/dsh-extra-plan/lib/preset-sync.js | applyPlan | L596-604 | 仅在 planned.settings 非 null 时定位唯一 dsh-extra-plan-settings 行并执行一次 configEditor.edit；settings 为空（包括仅声明/body 差异）为 no-op，active fence 防止停止期间写入，完整保留合法十项与 gateWords，不写旧公开/body 行 |  |
| plugins/dsh-extra-plan/lib/preset-sync.js | readRawPatch | L606-610 | 只读 configEditor.documentPath，供旧行迁移；不直接写 profile |  |
| plugins/dsh-extra-plan/lib/preset-sync.js | settingsValuesFromRows | L612-615 | 读取 dsh-extra-plan-settings 权威 config；缺行返回 undefined |  |
| plugins/dsh-extra-plan/lib/preset-sync.js | activeLegacyRow | L617-624 | 检测旧 preset-extra-plan 是否仍是活动 Loader entry，避免官方 adapter duplicate |  |
| plugins/dsh-extra-plan/lib/preset-sync.js | definitionFromRows | L626-638 | 以 settings 权威值为首选，结合 captured raw patch 与旧 body/声明迁移值解析统一配置；再从纯资产 definition 生成带两项宿主投影与 gateWords 的 adapter definition |  |
| plugins/dsh-extra-plan/lib/preset-sync.js | readPatch | L629 | 对象字面量中的 captured rawPatch 快照回调，供 definitionFromRows 传入统一配置解析；不直接读取 configEditor | mountPresetSync 内部 |
| plugins/dsh-extra-plan/lib/preset-sync.js | mountPresetSync | L640-752 | 唯一全局 owner 的同步/adapter 生命周期：Promise 队列串行处理启动与 internal/update，active gate 阻止关闭后的新 edit/adapter；await 官方 adapter 结算，关闭竞态释放候选 fiber。 |  |
| plugins/dsh-extra-plan/lib/preset-sync.js | disposeFiber | L648-651 | 安全 await adapter/fiber disposer；供 adapter 注册在途时关闭竞态回收候选资源，缺少 disposer 时保持幂等 no-op。 | mountPresetSync 内部 |
| plugins/dsh-extra-plan/lib/preset-sync.js | reportSettledError | L652-659 | 把 settled 回调异常交给独立 reporter，不污染 adapter 主异常路径 | mountPresetSync 内部闭包 |
| plugins/dsh-extra-plan/lib/preset-sync.js | notifySettled | L660-682 | 重新解析最终十项/gateWords 后调用通用 onSettledSettings；回调失败只走 onSettledError | mountPresetSync 内部闭包 |
| plugins/dsh-extra-plan/lib/preset-sync.js | readPatch | L666 | 对象字面量中的 captured rawPatch 快照回调，将 run 已读的 patch 传入 syncPreset；不直接读取 configEditor | mountPresetSync 内部 |
| plugins/dsh-extra-plan/lib/preset-sync.js | run | L683-733 | 串行同步：补齐唯一 settings 行并构造最终 definition；若活动 preset-extra-plan 仍存在则释放自有 adapter fiber 并交旧声明 owner 接管，否则装配官方 adapter | mountPresetSync 内部闭包 |
| plugins/dsh-extra-plan/lib/preset-sync.js | readPatch | L694 | settled 回调前的 raw patch 快照读取闭包，不推导路径、不执行写入 | mountPresetSync 内部 |
| plugins/dsh-extra-plan/lib/preset-sync.js | apply | L696 | syncPreset 参数对象中的落盘回调：调用 applyPlan 写唯一 settings 行；不是 Cordis 插件入口 |  |
| plugins/dsh-extra-plan/lib/preset-sync.js | schedule | L734-738 | 通过 Promise 队列串行化启动与 internal/update，避免重复官方 adapter active revision | mountPresetSync 内部闭包 |
| plugins/dsh-extra-plan/lib/preset-sync.js | dispose | L740-749 | 关闭 settings owner 的 update listener、等待在途队列并幂等释放 adapter fiber | mountPresetSync 内部 |
| plugins/dsh-extra-plan/lib/preset-yaml.js | loadYaml | L7-20 | 加载 js-yaml：先本模块 require，失败回落 %APPDATA% 下官方 dsh 包，仍失败抛原错误。 | 模块内部函数（未导出）；L22 模块加载期即调用 |
| plugins/dsh-extra-plan/lib/preset-yaml.js | resolve | L25 | js-yaml 自定义 tag 的标量判定：仅接受字符串标量，使 !!js 表达式按原文保留而不求值。 |  |
| plugins/dsh-extra-plan/lib/preset-yaml.js | construct | L26 | 把 !!js 标量的表达式文本包装成 { __jsExpr } 对象，供后续按对象识别与还原。 |  |
| plugins/dsh-extra-plan/lib/preset-yaml.js | predicate | L27 | 反向识别由本 tag 产生的对象：仅当是非空对象且 __jsExpr 为字符串时为真。 |  |
| plugins/dsh-extra-plan/lib/preset-yaml.js | represent | L28 | 把 { __jsExpr } 包装对象拆回原始表达式字符串，供 YAML 输出时还原 !!js 标量。 |  |
| plugins/dsh-extra-plan/lib/preset-yaml.js | parsePresetYaml | L41-43 | 用扩展 js 标量标签的 YAML schema 解析预设文本，返回文档对象。 | 导出函数 |
| plugins/dsh-extra-plan/lib/preset-yaml.js | hasOwn | L45-47 | 安全判定值为对象且含指定自有属性，返回布尔；null 或非对象直接 false。 | 模块内部工具函数（未导出） |
| plugins/dsh-extra-plan/lib/preset-yaml.js | pathParts | L49-51 | 把点分路径字符串拆成非空片段数组。 | 模块内部工具函数（未导出） |
| plugins/dsh-extra-plan/lib/preset-yaml.js | readPath | L53-60 | 按点分路径逐级读取对象，返回 exists 与 value；任一环缺键即 exists 为 false。 | 导出函数 |
| plugins/dsh-extra-plan/lib/preset-yaml.js | rowsById | L62-77 | 深度优先遍历文档收集所有 id 等于 rowId 的节点，按出现顺序返回数组（同引用去重防环）。 | 模块内部函数（未导出）；其内部闭包 visit 地图已有描述 |
| plugins/dsh-extra-plan/lib/preset-yaml.js | visit | L65-74 | 按 id 深度优先遍历文档对象（同引用去重防环），收集所有 id === rowId 的节点并按出现顺序返回 | rowsById 内部闭包 |
| plugins/dsh-extra-plan/lib/preset-yaml.js | resolveLocator | L79-86 | 解析单个 locator：多命中判 ambiguous，缺行或缺叶判 missing，唯一命中返回 ok 及行与值。 | 模块内部函数（未导出） |
| plugins/dsh-extra-plan/lib/preset-yaml.js | locatorFor | L88-93 | 取描述符的 sourceLocator；无该字段时把入参本身当裸 locator 返回。 | 模块内部函数（未导出） |
| plugins/dsh-extra-plan/lib/preset-yaml.js | aliasesFor | L95-100 | 取描述符的 locatorAliases 数组；非数组或缺省时返回空数组。 | 模块内部函数（未导出） |
| plugins/dsh-extra-plan/lib/preset-yaml.js | resolveSetting | L106-119 | 主 locator 与别名逐个解析，歧义或多命中判 ambiguous，全缺失判 missing，唯一 ok 即返回。 | 导出函数；L102-105 注释已说明三态语义 |
| plugins/dsh-extra-plan/lib/preset-yaml.js | resolveTemplateSettingDefault | L121-136 | 解析模板文本并定位设置项；定位非 ok 或值非法即抛错，否则返回规范化默认值。 | 导出函数；不启用别名 |
| plugins/dsh-extra-plan/lib/preset-yaml.js | captureSettings | L142-158 | 按 sourceLocator 逐项捕获设置，返回文档、captured 值与缺失/歧义/非法三态表。 | 导出函数；states 四态为 captured/missing/ambiguous/invalid，仅 captured 进 values；definitions 缺省用 SETTING_DEFINITIONS |
| plugins/dsh-extra-plan/lib/preset-yaml.js | hostRowDefaultsFromTemplate | L161-175 | 从模板捕获 2 项宿主行设置，缺项或解析失败回落内置默认；整体异常也回落。 | 导出函数；内置默认 webFetch=false、toolPresentationMode=native |
| plugins/dsh-extra-plan/lib/preset-yaml.js | captureRowSettings | L182-198 | 按 settings 行定位捕获权威值，返回 values、states 与 rowPresent（该行是否存在）。 | 导出函数；definitions 缺省用 EXTRA_PLAN_SETTING_DEFINITIONS |
| plugins/dsh-extra-plan/lib/preset-yaml.js | findPluginsRow | L201-212 | 在 plugins 数组（含 group 行 config 子数组）内按 id 深度优先找子行，找不到返回 null。 | 导出函数 |
| plugins/dsh-extra-plan/lib/preset-yaml.js | readProjectedValue | L219-238 | 按 projectionLocator 在 plugins 内定位子行与叶键，缺失或值非法一律返回 undefined。 | 导出函数；只服务 2 项宿主行设置 |
| plugins/dsh-extra-plan/lib/preset-yaml.js | restatePluginsRow | L241-248 | 深拷贝 plugins 后重述目标子行的指定 config 键（键覆盖非深合并），目标行不存在返回 null。 | 导出函数 |
| plugins/dsh-extra-plan/lib/preset-yaml.js | inlineCommentIndex | L250-268 | 扫描一行值，跳过单双引号内内容，返回行内注释 # 起始下标；无注释返回 -1。 | 模块内部函数（未导出）；被 parseRowId、replaceLineScalar、isBlockScalarLine 共用 |
| plugins/dsh-extra-plan/lib/preset-yaml.js | lineIndent | L270-273 | 返回行首空格数，即该行的缩进量。 | 模块内部工具函数（未导出） |
| plugins/dsh-extra-plan/lib/preset-yaml.js | withoutCr | L275-277 | 去掉行尾回车符，其余内容不变。 | 模块内部工具函数（未导出） |
| plugins/dsh-extra-plan/lib/preset-yaml.js | parseRowId | L279-291 | 从「- id: 值」样式的行解析出行 id，处理引号转义与行内注释；不匹配返回 null。 | 模块内部函数（未导出） |
| plugins/dsh-extra-plan/lib/preset-yaml.js | parseMapKey | L293-297 | 解析非数组项的「key:」映射行，返回键名与缩进；不匹配返回 null。 | 模块内部函数（未导出） |
| plugins/dsh-extra-plan/lib/preset-yaml.js | rowEnd | L299-307 | 从起始行找本行块结束下标：首个非空非注释且缩进不大于本行的行；到末尾返回总行数。 | 模块内部函数（未导出） |
| plugins/dsh-extra-plan/lib/preset-yaml.js | findDirectKey | L309-327 | 按区间内首个子键缩进定层，找指定直接子键所在行号；找不到返回 null。 | 模块内部函数（未导出） |
| plugins/dsh-extra-plan/lib/preset-yaml.js | textPathLine | L329-341 | 沿点分路径逐段下钻文本行，返回末段键所在行号；任一段缺失返回 null。 | 模块内部函数（未导出） |
| plugins/dsh-extra-plan/lib/preset-yaml.js | findTextLocatorMatches | L343-355 | 文本扫描：按 rowId 定位行块、再按路径定位叶行，返回行首、行尾与叶行号的匹配列表。 | 导出函数 |
| plugins/dsh-extra-plan/lib/preset-yaml.js | yamlString | L357-361 | 序列化为 YAML 字符串：单引号包裹并翻倍转义单引号，含换行改用 JSON 双引号。 | 模块内部函数（未导出） |
| plugins/dsh-extra-plan/lib/preset-yaml.js | serializeScalar | L363-367 | 按 scalarType 序列化标量：布尔转 true/false，整数转数字串，其余走字符串化。 | 导出函数 |
| plugins/dsh-extra-plan/lib/preset-yaml.js | escapeRegex | L369-371 | 转义字符串中的正则元字符，返回可安全拼进 RegExp 的文本。 | 模块内部工具函数（未导出） |
| plugins/dsh-extra-plan/lib/preset-yaml.js | replaceLineScalar | L373-385 | 替换某个「key:」行的标量值，保留缩进、行尾空格与行内注释；键不匹配返回 null。 | 模块内部函数（未导出） |
| plugins/dsh-extra-plan/lib/preset-yaml.js | isBlockScalarLine | L387-397 | 判定该行是否为指定键的块标量（值以竖线或大于号开头），返回布尔。 | 模块内部函数（未导出） |
| plugins/dsh-extra-plan/lib/preset-yaml.js | scalarTypeFor | L399-404 | 取描述符的 scalarType；未定义时按 string 处理。 | 模块内部函数（未导出） |
| plugins/dsh-extra-plan/lib/preset-yaml.js | patchYamlScalar | L410-436 | 保格式定点改写标量：无命中判 missing，多命中且未允许取首判 ambiguous，成功返回新文本与行号。 | 导出函数；L407-410 注释声明仅用于迁移期文本改写、不写文件 |
| plugins/dsh-extra-plan/lib/qqbot-settings-sync.js | plainObject | L38-40 | 判断非 null、非数组对象 |  |
| plugins/dsh-extra-plan/lib/qqbot-settings-sync.js | errorText | L42-44 | 把异常转换为可读错误文本 |  |
| plugins/dsh-extra-plan/lib/qqbot-settings-sync.js | loadYaml | L46-64 | 惰性加载 package-local js-yaml 并扩展安全 !!js schema |  |
| plugins/dsh-extra-plan/lib/qqbot-settings-sync.js | resolve | L53 | !!js 标量仅接受字符串 |  |
| plugins/dsh-extra-plan/lib/qqbot-settings-sync.js | construct | L54 | !!js 标量包装为 __jsExpr，不求值 |  |
| plugins/dsh-extra-plan/lib/qqbot-settings-sync.js | predicate | L55 | 识别安全 !!js 表达式对象 |  |
| plugins/dsh-extra-plan/lib/qqbot-settings-sync.js | represent | L56 | 保留 !!js 表达式文本 |  |
| plugins/dsh-extra-plan/lib/qqbot-settings-sync.js | parseYaml | L66-69 | 用安全 schema 解析 patch，不执行 !!js |  |
| plugins/dsh-extra-plan/lib/qqbot-settings-sync.js | readableDirectory | L71-80 | 证明目录存在且可读后允许扫描 |  |
| plugins/dsh-extra-plan/lib/qqbot-settings-sync.js | unavailable | L82-84 | 构造路径不可用结构化结果 |  |
| plugins/dsh-extra-plan/lib/qqbot-settings-sync.js | documentPathValue | L86-88 | trim documentPath 字符串 |  |
| plugins/dsh-extra-plan/lib/qqbot-settings-sync.js | rootFromDocumentPath | L90-101 | 校验绝对 profiles/web/cordis.patch.yml 形状并反推根 |  |
| plugins/dsh-extra-plan/lib/qqbot-settings-sync.js | environmentValue | L103-105 | 仅读取显式环境快照字段 |  |
| plugins/dsh-extra-plan/lib/qqbot-settings-sync.js | resolveProfilesRoot | L108-128 | documentPath 首选，缺失时显式 DSH_HOME+DSH_PROFILE=web 备用；矛盾路径不降级 |  |
| plugins/dsh-extra-plan/lib/qqbot-settings-sync.js | sortedNames | L130-132 | 按名称稳定排序 profile 子目录 |  |
| plugins/dsh-extra-plan/lib/qqbot-settings-sync.js | scanOwnQqbotProfiles | L134-173 | 在已证明 profilesRoot 下按双锚点扫描直接子 profile并收集诊断 |  |
| plugins/dsh-extra-plan/lib/qqbot-settings-sync.js | findOwnQqbotProfiles | L176-183 | 兼容 heal.js 形状返回双锚点命中名称并附诊断 |  |
| plugins/dsh-extra-plan/lib/qqbot-settings-sync.js | snapshotValues | L185-191 | 提取十项托管快照值 |  |
| plugins/dsh-extra-plan/lib/qqbot-settings-sync.js | snapshotGateWords | L193-197 | 提取完整 gateWords 快照 |  |
| plugins/dsh-extra-plan/lib/qqbot-settings-sync.js | validateSettingsSnapshot | L200-215 | 按 descriptor 与 gateWords 合同校验、归一并冻结完整快照 |  |
| plugins/dsh-extra-plan/lib/qqbot-settings-sync.js | expectedManaged | L217-220 | 生成用于深比较的托管字段视图 |  |
| plugins/dsh-extra-plan/lib/qqbot-settings-sync.js | splitText | L222-228 | 按原始 EOL 拆分 patch 文本 |  |
| plugins/dsh-extra-plan/lib/qqbot-settings-sync.js | joinText | L230-233 | 按原始 EOL/尾换行重组 patch 文本 |  |
| plugins/dsh-extra-plan/lib/qqbot-settings-sync.js | indentOf | L235-237 | 计算行首缩进宽度 |  |
| plugins/dsh-extra-plan/lib/qqbot-settings-sync.js | ignorable | L239-242 | 识别空白/注释行 |  |
| plugins/dsh-extra-plan/lib/qqbot-settings-sync.js | rootSequenceInfo | L244-262 | 识别顶层 YAML 序列项边界 |  |
| plugins/dsh-extra-plan/lib/qqbot-settings-sync.js | keyMatch | L264-267 | 识别简单 YAML map 键行 |  |
| plugins/dsh-extra-plan/lib/qqbot-settings-sync.js | targetKind | L269-276 | 识别 direct/override settings 目标行 |  |
| plugins/dsh-extra-plan/lib/qqbot-settings-sync.js | configHolder | L278-280 | 取得目标行 config 所属 map |  |
| plugins/dsh-extra-plan/lib/qqbot-settings-sync.js | locateConfigLine | L282-295 | 定位唯一可证明的 config 行边界 |  |
| plugins/dsh-extra-plan/lib/qqbot-settings-sync.js | blockEndForChild | L297-303 | 按缩进确定子块结束位置 |  |
| plugins/dsh-extra-plan/lib/qqbot-settings-sync.js | directKeyLines | L305-312 | 定位 config 直接子键行并检测重复 |  |
| plugins/dsh-extra-plan/lib/qqbot-settings-sync.js | configChildIndent | L314-324 | 推导 config 直接子键缩进 |  |
| plugins/dsh-extra-plan/lib/qqbot-settings-sync.js | scalar | L326-330 | 把设置值渲染为安全 YAML 标量 |  |
| plugins/dsh-extra-plan/lib/qqbot-settings-sync.js | renderedConfig | L332-344 | 渲染十项与完整 gateWords config |  |
| plugins/dsh-extra-plan/lib/qqbot-settings-sync.js | renderedRow | L346-351 | 渲染缺失目标的最小 override 行 |  |
| plugins/dsh-extra-plan/lib/qqbot-settings-sync.js | spaces | L347 | 生成指定数量空格 |  |
| plugins/dsh-extra-plan/lib/qqbot-settings-sync.js | parsedTarget | L353-362 | 解析顶层目标唯一性与冲突 |  |
| plugins/dsh-extra-plan/lib/qqbot-settings-sync.js | configState | L364-381 | 校验目标 config map 与可局部改写边界 |  |
| plugins/dsh-extra-plan/lib/qqbot-settings-sync.js | managedProjection | L383-387 | 提取已托管设置键 |  |
| plugins/dsh-extra-plan/lib/qqbot-settings-sync.js | equalManaged | L389-398 | 深比较十项与 gateWords 是否已收敛 |  |
| plugins/dsh-extra-plan/lib/qqbot-settings-sync.js | reparseAndCheck | L400-408 | 落盘前后安全解析并验证唯一目标深等 |  |
| plugins/dsh-extra-plan/lib/qqbot-settings-sync.js | applyExistingTarget | L410-459 | 只替换目标 config 管理键，保留未知文本 |  |
| plugins/dsh-extra-plan/lib/qqbot-settings-sync.js | appendTarget | L461-474 | 在合法顶层数组末尾追加最小 override |  |
| plugins/dsh-extra-plan/lib/qqbot-settings-sync.js | planQqbotSettingsPatch | L477-499 | 生成局部 YAML 计划且不写文件 |  |
| plugins/dsh-extra-plan/lib/qqbot-settings-sync.js | writeExclusive | L501-509 | 以 wx 写入并 fsync 文件 |  |
| plugins/dsh-extra-plan/lib/qqbot-settings-sync.js | nextFilePath | L511-517 | 生成同目录排他临时/备份路径 |  |
| plugins/dsh-extra-plan/lib/qqbot-settings-sync.js | hook | L519-521 | 运行可注入故障钩子 |  |
| plugins/dsh-extra-plan/lib/qqbot-settings-sync.js | writeQqbotSettingsPatch | L524-585 | 临时文件→备份→rename→终验/恢复的安全提交 |  |
| plugins/dsh-extra-plan/lib/qqbot-settings-sync.js | fingerprint | L587-589 | 按根路径、来源与完整快照生成去重指纹 |  |
| plugins/dsh-extra-plan/lib/qqbot-settings-sync.js | resultForPath | L591-600 | 合并路径来源与结构化状态字段 |  |
| plugins/dsh-extra-plan/lib/qqbot-settings-sync.js | createQqbotSettingsSynchronizer | L603-682 | 创建串行 profile 同步队列并汇总状态 |  |
| plugins/dsh-extra-plan/lib/qqbot-settings-sync.js | emit | L609-614 | 更新同步状态并隔离回调异常 |  |
| plugins/dsh-extra-plan/lib/qqbot-settings-sync.js | execute | L615-649 | 解析路径、扫描双锚点并逐 profile 持久化 |  |
| plugins/dsh-extra-plan/lib/qqbot-settings-sync.js | enqueue | L650-676 | 按指纹排队同步请求且等待完成 |  |
| plugins/dsh-extra-plan/lib/qqbot-settings-sync.js | getState | L680 | 读取最新 profile 同步状态 |  |
| plugins/dsh-extra-plan/lib/run-code-scanner.js | maskCodeLiteralsAndComments | L3-41 | 把源码中的字符串字面量与行/块注释逐字符替换为空格（保留换行），返回等长遮蔽文本。 | 遮蔽后长度与原文一致，供后续按索引对齐的括号配平与调用点扫描使用。地图行号区间 L3-41。 |
| plugins/dsh-extra-plan/lib/run-code-scanner.js | sliceBalancedArgs | L47-63 | 从括号处起配平 ()[]{}，返回闭括号索引（未闭合取文末）与取自原文的参数片段。 | 配平用遮蔽文本、innerText 取原文本（JSON.parse 需原始字面量）；返回 {closeIdx, innerText}。地图行号区间 L47-63。 |
| plugins/dsh-extra-plan/lib/run-code-scanner.js | hasDynamicRunCodeAccess | L67-131 | 判定代码是否存在无法静态解析的 tools[...] 访问（键非字符串字面量），命中返回 true。 | 静态调用的充分条件是字符串键 + 紧邻 ']' + 紧跟 '('；已识别静态调用区间（sites）会被跳过。地图行号区间 L67-131。 |
| plugins/dsh-extra-plan/lib/run-code-scanner.js | skipWhitespace | L73-77 | 从给定位置跳过连续空白字符，返回首个非空白字符的索引。 | hasDynamicRunCodeAccess（L67）内部闭包，非导出函数。地图行号区间 L73-77。 |
| plugins/dsh-extra-plan/lib/run-code-scanner.js | bracketEndOf | L78-88 | 从 '[' 起配平中括号，返回匹配的闭括号位置，未闭合返回 -1。 | hasDynamicRunCodeAccess（L67）内部闭包，在遮蔽文本上扫描。地图行号区间 L78-88。 |
| plugins/dsh-extra-plan/lib/run-code-scanner.js | inStaticRange | L89 | 判断给定字符位置是否落在已识别的静态调用点区间内，返回布尔值。 | hasDynamicRunCodeAccess（L67）内部闭包，用于跳过已解析的静态调用参数区。 |
| plugins/dsh-extra-plan/lib/run-code-scanner.js | collectRunCodeSites | L133-216 | 扫描源码收集 tools.名(...) 与 tools[键](...) 调用点，返回起止位置、参数原文与工具名的数组。 | 动态键分支只在后面能跟到 '(' 时才计为调用点；返回条目为 {start, end, innerText, name}。地图行号区间 L133-216。 |
| plugins/dsh-extra-plan/lib/run-code-static.js | runCodeTextOf | L22-26 | 提取 run_code 的 code 参数文本 |  |
| plugins/dsh-extra-plan/lib/run-code-static.js | codeMutationHints | L29-37 | 对文本扫描 RUNCODE_MUTATION_HINTS 返回命中写暗示 id 列表 |  |
| plugins/dsh-extra-plan/lib/run-code-static.js | parseStaticLiteral | L41-175 | 安全静态 literal 入口：JSON.parse 快路径 + 无执行 JS literal 子集；重复/污染键与动态语法拒绝并返回 argsText |  |
| plugins/dsh-extra-plan/lib/run-code-static.js | fail | L52 | 静态 literal 解析失败控制流抛错，不执行输入文本 |  |
| plugins/dsh-extra-plan/lib/run-code-static.js | skipWhitespace | L53-55 | 跳过安全 literal 中允许的空白字符 |  |
| plugins/dsh-extra-plan/lib/run-code-static.js | isIdentifierStart | L56 | 判断对象标识符键起始字符 |  |
| plugins/dsh-extra-plan/lib/run-code-static.js | isIdentifierChar | L57 | 判断标识符键/布尔 null 边界字符 |  |
| plugins/dsh-extra-plan/lib/run-code-static.js | parseString | L59-99 | 解析单/双引号字符串与有限转义，不接受模板插值 |  |
| plugins/dsh-extra-plan/lib/run-code-static.js | parseValue | L101-165 | 递归解析对象/数组、字符串、布尔/null 与有限数字，拒绝调用/成员/污染键 |  |
| plugins/dsh-extra-plan/lib/run-code-static.js | createRunCodeStatic | L177-571 | 创建 run_code 静态 helper 闭包，仅注入 askTool 与双兼容 isDispatchStart |  |
| plugins/dsh-extra-plan/lib/run-code-static.js | decomposeRunCode | L190-228 | 静态拆解 run_code 的 code 为工具成员组（含裸写伪工具） |  |
| plugins/dsh-extra-plan/lib/run-code-static.js | addMember | L197-206 | 成员去重添加（decomposeRunCode 内部闭包） |  |
| plugins/dsh-extra-plan/lib/run-code-static.js | markRange | L207-209 | 标记已占用区间（decomposeRunCode 内部闭包） |  |
| plugins/dsh-extra-plan/lib/run-code-static.js | runCodeCatchGateReason | L234-305 | run_code 多调用容错闸门：tools.* 调用点≥2 时要求每点独立容错，不足即教学式拒绝（单调用豁免；嵌套展平） |  |
| plugins/dsh-extra-plan/lib/run-code-static.js | within | L261 | 调用点区间包含判定（site.start 是否落在 a、b 之间）：把调用点归入 try 块或数组实参区间 |  |
| plugins/dsh-extra-plan/lib/run-code-static.js | askUserQuestionReturnGateReason | L309-504 | 主会话 run_code 的 ask 返回链闸门：动态 tools[...] 访问统一 fail-closed；仅允许直接 return-await 或变量接收后紧随顶层 return 引用结果，直接 ask 的参数可动态 |  |
| plugins/dsh-extra-plan/lib/run-code-static.js | isIdChar | L314 | 标识符字符判定（decomposeRunCode 内部闭包） |  |
| plugins/dsh-extra-plan/lib/run-code-static.js | skipWs | L315-319 | 自 start 起跳过空白字符，返回首个非空白字符下标（词法扫描的跳白工具） |  |
| plugins/dsh-extra-plan/lib/run-code-static.js | isTopLevel | L404 | 位置是否处于花括号/圆括号/方括号深度全为 0 的顶层语句中 |  |
| plugins/dsh-extra-plan/lib/run-code-static.js | candidateStarts | L405-412 | 收集 pos 之前的顶层语句起点，用于把调用归入所属顶层语句 |  |
| plugins/dsh-extra-plan/lib/run-code-static.js | tokenAt | L413-414 | pos 处是否恰为指定关键字且两侧均为标识符边界 |  |
| plugins/dsh-extra-plan/lib/run-code-static.js | expressionEnd | L415-424 | 求顶层语句的结束下标：顶层分号或语句起始换行 |  |
| plugins/dsh-extra-plan/lib/run-code-static.js | references | L425-440 | 按标识符边界在表达式内查找变量真实引用，排除成员访问与对象键 |  |
| plugins/dsh-extra-plan/lib/run-code-static.js | hasReassignment | L441-458 | 判定变量在表达式内是否被重新赋值，用于否掉被改写的伪白名单形态 |  |
| plugins/dsh-extra-plan/lib/run-code-static.js | afterCall | L459-469 | 取调用点之后的首个有效 token 位置并回传原始 gap，用于校验顶层 return |  |
| plugins/dsh-extra-plan/lib/run-code-static.js | runCodeSiteCount | L508-525 | run_code 静态调用点计数（planner 单实例上限快路径；run_code 调用点自身不计） |  |
| plugins/dsh-extra-plan/lib/run-code-static.js | isRunCodeSubCall | L529-534 | 子调用判定：exec.sub 或 exec.parent!==undefined |  |
| plugins/dsh-extra-plan/lib/run-code-static.js | runCodeDispatchCapText | L537-539 | 单实例子调用超限文案（T3 逐字）：rootCallId 实例子调用数超过 exploreBudget 上限 |  |
| plugins/dsh-extra-plan/lib/run-code-static.js | runCodeDispatchGateReason | L544-558 | 运行时单实例上限（planner）：按 rootCallId 计数，超 cap 返回 T3 文案 |  |
| plugins/dsh-extra-plan/lib/runtime-lifecycle.js | createRuntimeLifecycle | L2-124 | per-apply 运行时生命周期：save 工具注册、探查名额认领、子调用计数与拒绝记录的共享容器，返回 API | 顶层导出工厂，依赖全部经 options 显式注入，内部状态为 WeakSet/Map |
| plugins/dsh-extra-plan/lib/runtime-lifecycle.js | registerTool | L9-38 | 按 agent 单次注册工具定义：查重后注册；tools 服务缺失或已存在/永久非法时只告警并记账，不重试 | 工厂内闭包，被 registerSavePlan/registerSaveProbe 转调 |
| plugins/dsh-extra-plan/lib/runtime-lifecycle.js | registerSavePlan | L51 | 以 save_plan 定义注册工具的一次性薄封装 | 内部闭包，转调 registerTool（savePlanRegistered WeakSet 去重） |
| plugins/dsh-extra-plan/lib/runtime-lifecycle.js | registerSaveProbe | L52 | 以 save_probe 定义注册工具的一次性薄封装 | 内部闭包，转调 registerTool（saveProbeRegistered WeakSet 去重） |
| plugins/dsh-extra-plan/lib/runtime-lifecycle.js | probeClaimFor | L54-69 | 探查子会话认领放行名额：非普通子代理、planner、无父会话或带写工具即拒；成功扣减名额并返回 true | 内部闭包。名额由 index.js L867 recordProbeClaim 产生，此处消费（pending-1，归零即删键） |
| plugins/dsh-extra-plan/lib/runtime-lifecycle.js | recordProbeClaim | L71-73 | 主会话放行 subagent_probe 时为其记一个待认领名额，同会话累加 | 内部闭包，写 pendingProbeClaims（Map<parentSessionId, count>） |
| plugins/dsh-extra-plan/lib/runtime-lifecycle.js | noteRunCodeSubCall | L75-82 | 按 rootCallId 记 run_code 子调用数：达上限或 rootCallId 缺失返回超限文案，否则加一返回 null | 内部闭包，cap 由 index.js L398 以 exploreBudget() 传入 |
| plugins/dsh-extra-plan/lib/runtime-lifecycle.js | recordRunCodeDeny | L84-95 | 记录 run_code 子调用被拒原因：非子调用、原因为空或无会话 id 不记；按会话与根调用 id 去重累计 | 内部闭包，写 runCodeDenyRecords（Map<sessionId, Map<rid, Set<reason>>>） |
| plugins/dsh-extra-plan/lib/runtime-lifecycle.js | takeRunCodeDenyRecords | L97-105 | 取出并删除某会话某根调用的拒绝原因集合（消费即清），无记录或参数非法返回 undefined | 内部闭包，消费方 index.js L947-963 命中原因时改写失败结果文本 |
| plugins/dsh-extra-plan/lib/runtime-lifecycle.js | disposeSession | L107-115 | 会话销毁时清空该 sessionId 在名额、拒绝记录、各类计数与通知中的残留条目 | 内部闭包，只清 7 个 Map，不清 WeakSet（按 agent 键自然回收） |
| plugins/dsh-extra-plan/lib/runtime-lifecycle.js | pendingProbeCount | L122 | 读取指定会话尚未认领的探查计数：无记录时返回 0。 |  |
| plugins/dsh-extra-plan/lib/runtime-static.js | causeChainOf | L3-15 | 按显式 depth 提取错误 cause 链 |  |
| plugins/dsh-extra-plan/lib/save-contract.js | sanitizeTaskName | L4-12 | 任务名净化（截断/去非法字符） |  |
| plugins/dsh-extra-plan/lib/save-contract.js | timestampOf | L15-18 | 生成本地 yyyyMMddHHmmss 部分，供公共 timestamp 与 artifact base 使用 |  |
| plugins/dsh-extra-plan/lib/save-contract.js | pad | L16 | timestamp 内部数字补零 |  |
| plugins/dsh-extra-plan/lib/save-contract.js | timestamp | L20-22 | 秒级公共时间戳 yyyyMMddHHmmss（仅保证格式可读；工件唯一基座见 saveArtifactBase） |  |
| plugins/dsh-extra-plan/lib/save-contract.js | sessionTagOf | L26-28 | 会话标识段（去分隔符后取前 8 位字母数字） |  |
| plugins/dsh-extra-plan/lib/save-contract.js | saveArtifactBase | L34-49 | 统一生成任务名+sessionTag+毫秒+process.pid+进程序号的碰撞安全 base |  |
| plugins/dsh-extra-plan/lib/save-contract.js | renderSavePlan | L56-58 | save_plan 结果渲染为单元素 ContentBlock[] |  |
| plugins/dsh-extra-plan/lib/save-contract.js | renderProbeMarkdown | L93-134 | save_probe 线索/证据报告 Markdown 渲染（固定标题与五节模板） |  |
| plugins/dsh-extra-plan/lib/save-contract.js | trimProbeEvidenceDecor | L160-171 | 成对剥除装饰并循环；单侧装饰不剥，`.` 与 `/` 保留，避免误伤合法路径。 | extractProbeEvidenceRefs 整体/逐段调用；step-00 E10-E12 |
| plugins/dsh-extra-plan/lib/save-contract.js | extractProbeEvidenceRefs | L172-185 | 按“整体成对剥除→顿号/分号/竖线拆分→逐段成对剥除→trim→过滤→按序去重”提取证据路径；拆分不含空格/半角逗号。 | step-00 E1-E12 覆盖路径与清洗边界 |
| plugins/dsh-extra-plan/lib/save-contract.js | renderSaveProbe | L189-191 | save_probe 结果渲染为单元素 ContentBlock[] |  |
| plugins/dsh-extra-plan/lib/save-persistence.js | fsOpsOf | L8-11 | 合并末位可选文件系统操作依赖：未提供的操作项回退冻结只读的默认 node:fs 同义实现（另建新对象，不就地改写共享默认集） |  |
| plugins/dsh-extra-plan/lib/save-persistence.js | atomicCommit | L17-47 | 阶段感知提交：mkdir→tmp→journal→逐项 rename→确认目标→清 journal；pre-journal 条件清理，post-journal 失败保留 journal/现场，抛原始错误。 | 末位 fs 依赖可注入；step-06 故障恢复覆盖 |
| plugins/dsh-extra-plan/lib/save-persistence.js | recoveryTargetsOf | L51-60 | journal 只接受非空当前 entries 列表；旧形状/非法形状只告警并保留 journal 与 tmp |  |
| plugins/dsh-extra-plan/lib/save-persistence.js | recoverJournals | L64-85 | journal 崩溃自愈：逐项「tmp 存在则 rename、随后确认目标存在」，已完成项凭目标存在幂等续做，任一项失败保留 journal，全项就位才删；形状非法/目标缺失告警后保留并继续扫其它 journal；兼容新旧形状并按 sessionTag 过滤；末位可选 fs 依赖注入 |  |
| plugins/dsh-extra-plan/lib/save-probe-validation.js | validateProbe | L8-107 | save_probe 参数校验：上限、路径存在性、range/evidence 规则与聚合拒绝 |  |
| plugins/dsh-extra-plan/lib/save-probe-validation.js | probePathOf | L110-113 | 相对路径按 cwd 解析、绝对路径原样返回 |  |
| plugins/dsh-extra-plan/lib/save-tool-factories.js | probeRefDecorationHint | L10-12 | ref 首字符属装饰集（反引号/引号/半全角括号/中文标点等）时返回「疑似含 Markdown 装饰；引用证据请使用裸路径，每条单独一行」提示，否则返回空串 | 工具侧诊断文本（非界面文案）；报错中 ref 一律 JSON.stringify 呈现 |
| plugins/dsh-extra-plan/lib/save-tool-factories.js | cwdOf | L15-19 | 从 exec.agent.session.header 读取会话工作区 cwd：任一层缺失或 cwd 非字符串时返回空串；不计算目录、短名或工件 base。 |  |
| plugins/dsh-extra-plan/lib/save-tool-factories.js | resolveSaveContext | L22-32 | 返回 save 工具共用的四字段 `{ cwd, sessionTag, dir, base }`；cwd/会话标签、落盘目录与工件 base 各自按输入解析，参数校验与提交形状仍由各工具自理 |  |
| plugins/dsh-extra-plan/lib/save-tool-factories.js | createSaveToolFactories | L35-215 | 创建只捕获目录与原子持久化依赖的 save 工具定义工厂；注入依赖：savePlanDir、atomicCommit、recoverJournals |  |
| plugins/dsh-extra-plan/lib/save-tool-factories.js | defineSavePlan | L36-98 | save_plan schema/output/render/execute（双写与证据引用校验） |  |
| plugins/dsh-extra-plan/lib/save-tool-factories.js | render | L57-59 | save_plan 工具结果渲染：把落盘后的方案与验收清单两个文件路径格式化为模型可见文本块。 |  |
| plugins/dsh-extra-plan/lib/save-tool-factories.js | execute | L62-96 | save_plan 执行体：校验 plan/checklist 与证据引用后原子双写方案、验收两文件，返回其路径。 |  |
| plugins/dsh-extra-plan/lib/save-tool-factories.js | defineSaveProbe | L100-212 | save_probe schema/output/render/execute（限制校验与线索/证据落盘） |  |
| plugins/dsh-extra-plan/lib/save-tool-factories.js | render | L188-190 | save_probe 工具结果渲染：结合是否含 evidence 生成模型可见提示，说明落盘的是证据报告还是线索文件。 |  |
| plugins/dsh-extra-plan/lib/save-tool-factories.js | execute | L193-210 | save_probe 执行体：校验参数与路径后，将探查结果渲染为 Markdown 原子落盘单文件，返回其路径。 |  |
| plugins/dsh-extra-plan/lib/sdk-text-cache.js | isWeakKey | L7-9 | 判断值是否可作为 WeakMap key |  |
| plugins/dsh-extra-plan/lib/sdk-text-cache.js | numberTag | L11-17 | 为 NaN/Infinity/-0 等数字生成无歧义指纹标签 |  |
| plugins/dsh-extra-plan/lib/sdk-text-cache.js | isArrayIndexKey | L19-23 | 识别数组数字索引，保留额外自有字段顺序 |  |
| plugins/dsh-extra-plan/lib/sdk-text-cache.js | encode | L27-89 | 保守编码完整嵌套 schema：保留数组/对象键顺序与字段存在性，遇循环、getter、symbol、非 plain 数据即失败 |  |
| plugins/dsh-extra-plan/lib/sdk-text-cache.js | sdkSchemasFingerprint | L91-99 | 生成 renderer-visible schema 的保守结构指纹；无法无损签名返回 undefined 以强制 cache miss |  |
| plugins/dsh-extra-plan/lib/sdk-text-cache.js | sdkTextCacheEntryMatches | L101-107 | 比较 entry 的 schema 指纹、原始 language 与 renderer 函数身份 |  |
| plugins/dsh-extra-plan/lib/sdk-text-cache.js | renderUncached | L109-119 | 指纹失败或参数不可缓存时执行一次 renderer，并校验返回文本但不写 entry |  |
| plugins/dsh-extra-plan/lib/sdk-text-cache.js | createSdkTextCache | L121-161 | 创建无模块级结果 Map 的 agent-keyed WeakMap 缓存工厂，提供 getOrCreate/dispose |  |
| plugins/dsh-extra-plan/lib/sdk-text-cache.js | dispose | L124-126 | 删除 agent entry，阻止 disposed 后迟到 Promise 回写 |  |
| plugins/dsh-extra-plan/lib/sdk-text-cache.js | getOrCreate | L128-158 | 按完整 schema 指纹+language+renderer 命中/替换 entry；同 key 合并 Promise，成功文本缓存，reject/过期结果删除或不回写 |  |
| plugins/dsh-extra-plan/lib/settings-contract.js | isString | L4 | 判定值是否为字符串类型，供设置 descriptor 的 validator 复用 | 模块内私有箭头常量（未导出） |
| plugins/dsh-extra-plan/lib/settings-contract.js | isPositiveInteger | L5 | 判定值是否为大于 0 的整数，作 exploreBudget 的 validator | 模块内私有箭头常量 |
| plugins/dsh-extra-plan/lib/settings-contract.js | isBoolean | L6 | 判定值是否为布尔类型，作布尔设置项的 validator | 模块内私有箭头常量 |
| plugins/dsh-extra-plan/lib/settings-contract.js | isMode | L8 | 判定值是否为合法工具呈现模式（native/ptc/both 之一） | 已达成：行号列已修正为 L8；原备注所指区间问题已消除，实际 isMode 仅第 8 行，L10-19 为导出常量与注释 |
| plugins/dsh-extra-plan/lib/settings-contract.js | setting | L23-45 | 标准化并冻结一条设置 descriptor：补齐类型、定位器、别名与 UI，产出只读条目 | 唯一构造 descriptor 的工厂，对嵌套对象逐层 Object.freeze |
| plugins/dsh-extra-plan/lib/settings-contract.js | settingsRowLocator | L48 | 生成权威值落点定位器：settings 行 config.<key>，路径可覆盖 | 私有箭头函数，rowId 固定 SETTINGS_ROW_ID（'dsh-extra-plan-settings'） |
| plugins/dsh-extra-plan/lib/settings-contract.js | sourceLocator | L49 | 生成源模板行定位器：声明行 extra-plan 的 config.<key>，路径可覆盖 | 私有箭头函数，rowId 固定 'extra-plan' |
| plugins/dsh-extra-plan/lib/settings-contract.js | hostRowProjectionLocator | L51-54 | 生成旧公开 preset-sync 行的兼容 config.<key> 读取定位器；新结构不写该行。 | 私有箭头函数，仅 2 项宿主行设置使用；旧 body 叶键由 legacyHostRowProjectionLocator 保留 |
| plugins/dsh-extra-plan/lib/settings-contract.js | legacyHostRowProjectionLocator | L56-60 | 为旧 preset-extra-plan 声明行生成兼容投影定位：旧 row id、对应 host plugins 子行 id 与 config 叶键；仅供安全读取迁移和旧 body carry。 |  |
| plugins/dsh-extra-plan/lib/settings-contract.js | getSettingDefinition | L149-151 | 按 key 从冻结的 descriptor 索引取设置定义，未命中返回 undefined | 导出 API，索引 descriptorByKey 在 L138 由 SETTING_DEFINITIONS 构建 |
| plugins/dsh-extra-plan/lib/settings-contract.js | validateSettingValue | L153-155 | 用定义自带 validator 校验取值；定义缺失或无校验函数一律返回 false | 导出 API |
| plugins/dsh-extra-plan/lib/settings-contract.js | normalizeSettingValue | L157-159 | 用定义自带 normalize 归一取值，无 normalize 时原样返回 | 导出 API，目前仅 plannerModel/otherAgentModel 带 normalize（trim） |
| plugins/dsh-extra-plan/lib/settings.js | mountClientCarrier | L36-66 | 按 Loader 实例复用内部 Group child，注册带绝对 client-carrier.js file URL 的唯一 entry；以引用计数幂等创建与释放，最后一个 settings 卸载时 dispose 并清理缓存。 |  |
| plugins/dsh-extra-plan/lib/settings.js | schemaField | L69-75 | 按 descriptor 的 scalarType 生成 schemastery 字段（boolean→布尔、integer→步长 1 的 ≥1 数值、其余字符串），并挂默认值与 volatile 标记。 |  |
| plugins/dsh-extra-plan/lib/settings.js | isLoopback | L84-87 | 环回地址判定（API 仅本机） |  |
| plugins/dsh-extra-plan/lib/settings.js | json | L89-92 | HTTP JSON 响应 |  |
| plugins/dsh-extra-plan/lib/settings.js | readJsonBody | L94-112 | 读取请求体（限 1MB） |  |
| plugins/dsh-extra-plan/lib/settings.js | plainJsonObject | L114-116 | PUT 载荷形状守卫：只接受非 null、非数组的 JSON 对象，空对象/原始值由 API 继续拒绝。 | createApiHandler 内部 |
| plugins/dsh-extra-plan/lib/settings.js | findSettingsRow | L118-122 | 从 configEditor.configuration() 中按 entry.options.id=SETTINGS_ROW_ID 找 settings 行（**权威值载体**，GET 三层回退的首选读取层），未命中返回 undefined |  |
| plugins/dsh-extra-plan/lib/settings.js | readRawPatch | L124-128 | 只读 configEditor.documentPath 的原始 patch，为旧声明迁移提供安全 YAML 数据源；不可读时返回 undefined。 |  |
| plugins/dsh-extra-plan/lib/settings.js | defaultValues | L130-133 | 由十项 descriptor 默认与作者模板两项宿主默认组成，不复制 gateWords 第二份真源。 |  |
| plugins/dsh-extra-plan/lib/settings.js | readUnifiedState | L136-159 | 读取唯一 settings 行的完整权威快照，交 resolveUnifiedConfig 处理旧 raw patch/默认层级；非法当前 gateWords 直接抛错，供 GET/PUT 准确失败。 |  |
| plugins/dsh-extra-plan/lib/settings.js | publicField | L161-175 | 把 descriptor 构造成设置页字段描述：key/type/control/locale + 可选 options、optionLocale + value/default/overridden + source（取值层来源） |  |
| plugins/dsh-extra-plan/lib/settings.js | profileSyncPath | L177-187 | 为失败/不可用诊断解析 profile/path，优先使用目标路径或已证明 profilesRoot |  |
| plugins/dsh-extra-plan/lib/settings.js | reportProfileSync | L189-201 | 对 failed/unavailable/not-installed 输出含 status/pathSource/profile/path/reason 的诊断，不改变 API/adapter 生命周期 |  |
| plugins/dsh-extra-plan/lib/settings.js | proPayload | L203-214 | 设置页 API 响应体：fields（2 项宿主行的控件元数据 + 当期值/默认/覆盖标记/来源层）+ values + defaults；读取失败一律回落出厂默认（不抛） |  |
| plugins/dsh-extra-plan/lib/settings.js | createApiHandler | L216-277 | GET/PUT loopback API：GET 读取唯一全局行并按旧 raw patch/默认回退；PUT 先拒绝非法 JSON、null/数组/空对象、未知键、混合非法值，再合并全局十项与 gateWords，只 edit 全局行；当前非法 gateWords 报错且零写，深等 no-op 才回执 applied。 | 不含 qqbot；失败不伪装为写入成功 |
| plugins/dsh-extra-plan/lib/settings.js | responseForProfile | L217-222 | 把 profileSync 状态映射为 HTTP 状态、overall 与 web.applied |  |
| plugins/dsh-extra-plan/lib/settings.js | apply | L279-327 | 插件入口（HTTP 服务注册） |  |
| plugins/dsh-extra-plan/lib/settings.js | onResult | L283 | 接收同步器结果并更新 API 状态 |  |
| plugins/dsh-extra-plan/lib/settings.js | editorOf | L285-292 | 安全取得当前 configEditor |  |
| plugins/dsh-extra-plan/lib/settings.js | documentPathOf | L293-300 | 现场读取 configEditor.documentPath |  |
| plugins/dsh-extra-plan/lib/settings.js | environmentSnapshot | L301 | 捕获显式 DSH_HOME/DSH_PROFILE 快照 |  |
| plugins/dsh-extra-plan/lib/settings.js | syncEditor | L302-316 | 从最新 editor 状态入队完整快照与路径 |  |
| plugins/dsh-extra-plan/lib/settings.js | settledSettings | L317 | 把通用 settled 快照交给同步器 |  |
| plugins/dsh-extra-plan/lib/settings.js | settledError | L318 | 独立记录 settled 回调异常 |  |
| plugins/dsh-extra-plan/lib/shell-mutation.js | commandTextOf | L28-40 | 解码对象/JSON 字符串两形状的 command 参数 |  |
| plugins/dsh-extra-plan/lib/shell-mutation.js | pwshCommandOf | L42 | 提取 pwsh command 文本 |  |
| plugins/dsh-extra-plan/lib/shell-mutation.js | bashCommandOf | L43 | 提取 bash command 文本 |  |
| plugins/dsh-extra-plan/lib/shell-mutation.js | shellWords | L48-72 | 将 shell segment 按引号与空白拆成词，供 wrapper/内层 shell 位置判定 | 纯函数 |
| plugins/dsh-extra-plan/lib/shell-mutation.js | isEnvAssignment | L75-77 | 识别 NAME=VALUE 前缀，避免 env wrapper 赋值被当作命令 | 纯函数 |
| plugins/dsh-extra-plan/lib/shell-mutation.js | mutationTextMatches | L79-117 | 按正则、段首词与内嵌 shell 深度判定写操作 |  |
| plugins/dsh-extra-plan/lib/shell-mutation.js | mutationMatches | L119-122 | 组合 command 提取与写模式判定 |  |
| plugins/dsh-extra-plan/lib/shell-mutation.js | pwshMutationMatches | L124 | 判定 pwsh 命令是否包含写操作 |  |
| plugins/dsh-extra-plan/lib/shell-mutation.js | bashMutationMatches | L125 | 判定 bash 命令是否包含写操作 |  |
| plugins/dsh-extra-plan/lib/usage-ledger.js | createUsageLedger | L4-174 | usage 账本工厂：读 enabled/path 选项建立闭包状态，返回 foldUsage 与 disposeSession。 | cursor 路径由 account 路径拼 '.cursor.json'；被 index.js L347 以 { enabled, path } 调用。地图行号区间 L4-174。 |
| plugins/dsh-extra-plan/lib/usage-ledger.js | readUsageCursorTable | L24-45 | 读取 cursor JSON 并返回 {ok, table}：文件不存在按空表正常返回，其余读取/解析/形状错误降级空表并告警。 | createUsageLedger（L4）内部闭包。ENOENT 静默 ok:true；其它错误 ok:false。地图行号区间 L24-45。 |
| plugins/dsh-extra-plan/lib/usage-ledger.js | warnUsageCursorDegraded | L48-52 | cursor 读取降级时每个插件实例只打印一次告警，避免重复刷屏。 | createUsageLedger（L4）内部闭包，靠 cursorDegradedWarned 标志限一次。地图行号区间 L48-52。 |
| plugins/dsh-extra-plan/lib/usage-ledger.js | usageCursorEntryOf | L56-63 | 归一单个会话的 cursor 项：兼容旧数字形状与 {seq,index}，无法识别返回 undefined。 | createUsageLedger（L4）内部闭包，旧数字形状按水位 index=0 处理。地图行号区间 L56-63。 |
| plugins/dsh-extra-plan/lib/usage-ledger.js | foldUsage | L71-171 | 按水位增量或全量扫描会话事件，把 assistant/message 的 usage 追加到账本并推进 cursor。 | createUsageLedger（L4）内部闭包；无新增行时只推进内存水位、不触碰账本与 cursor 文件。地图行号区间 L71-171。 |
| plugins/dsh-extra-plan/scripts/generate-runtime-defaults.mjs | renderRuntimeDefaults | L19-29 | 校验模板并渲染 DEFAULT_EXPLORE_BUDGET 与 DEFAULT_PLANNER_PROMPT_SUFFIX 两个默认常量生成文本 |  |
| plugins/dsh-extra-plan/scripts/generate-runtime-defaults.mjs | topLevelRowsOf | L32-41 | 抽取 agent.cordis.yml 顶层条目区间（首个根级「- id:/insert:」行到末个非空行）；缺失/空即抛，注释、锚点、!!js 与 isolate 键逐字保留 |  |
| plugins/dsh-extra-plan/scripts/generate-runtime-defaults.mjs | indentBlock | L43-46 | 整段平移 PLUGINS_INDENT 列缩进（空行保持空行），供声明行 config.plugins 嵌套 |  |
| plugins/dsh-extra-plan/scripts/generate-runtime-defaults.mjs | quoteYamlSingle | L48-50 | YAML 单引号标量：整体加单引号并把内部单引号双写 |  |
| plugins/dsh-extra-plan/scripts/generate-runtime-defaults.mjs | assertDefinition | L52-60 | 严格校验 preset definition 为 extra-plan 对象，要求元数据完整、顶层 17 条 plugins 且禁止 Loader insert wrapper。 |  |
| plugins/dsh-extra-plan/scripts/generate-runtime-defaults.mjs | renderPresetDefinition | L62-81 | 从 agent.cordis.yml 抽取顶层行并缩进，结合 preset.yml 元数据生成纯 definition YAML；保留 group、isolate、!!js 原文并回解析校验。 |  |
| plugins/dsh-extra-plan/scripts/generate-runtime-defaults.mjs | assertParses | L83-91 | 用 parsePresetYaml 预解析校验文本，失败抛出带标签的 YAML parse failed 错误 |  |
| plugins/dsh-extra-plan/scripts/generate-runtime-defaults.mjs | writeOrCheck | L93-102 | --check 模式只比对产物（缺失或文本不一致即抛），否则 mkdir -p 后写盘 |  |
| plugins/dsh-extra-plan/scripts/generate-runtime-defaults.mjs | generateRuntimeDefaults | L108-138 | 先校验再生成或 --check 比对，失败保留旧生成物 |  |
| plugins/dsh-extra-plan/scripts/generate-runtime-defaults.mjs | invokedAsMain | L140-143 | 跨平台判断脚本是否作为 CLI 主入口运行 |  |

---

*本文件由脚本增量维护；直接编辑功能描述/备注列是安全的。*
