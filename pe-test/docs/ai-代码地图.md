# 代码地图（dsh-extra-plan）

> **维护分工**：行号区间/增删行由脚本 node pe-test/tools/代码地图生成.mjs 增量同步；**功能描述、备注、以及「意图速查」整节由 AI/人维护**（脚本刷新不会覆盖）。
> **用法**：先看「意图速查」按意图词找函数名 → 再到「函数索引」按函数名取行号区间 → read 该区间。
> 上次同步：2026-10-21 12:31:45（脚本自动更新时间戳行）

## 意图速查（人工维护：意图词 → 函数名；行号请到下方「函数索引」按函数名取）

> 用法：拿用户/AI 口里的词在「想找什么」列 grep → 得函数名 → 到「函数索引」grep 该函数名 → 取行号区间 → read 该区间。
> 本节引用的函数名若不存在于索引，生成脚本会报 `[导航失效]`（防止入口过期）。

| 想找什么（含同义词/英文标识） | 文件 | 函数名 |
|:--|:--|:--|
| 四级闸门／路由确认／目的确认／批准／流程状态（route/purpose/clarified/approved；普通与 PTC ask 分别解码后统一推进；拒绝/取消/通道故障边界不变） | index.js、plugins/dsh-extra-plan/lib/gate-decisions.js | deriveFlowState、applyAskOutcome、mainGateReason、routeDenyReason、gateAskDenyReason、validateGateAskStructure、matchPurposeLabel |
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
| 会话事件快照／角色常量与身份识别（ROLE_IDS/ROLE_ORDERS 只描述身份与顺序，不承载权限）／单次快照复用（execEvents）／planner descriptor 缓存／events 可选入参 | lib/agent-session.js、lib/agent-runtime.js、lib/runtime-lifecycle.js、lib/role-contract.js、index.js | sessionEvents、isSubagentChild、isLiveDelegation、childPolicyNeedsFloor、createAgentRuntime、isChild、isPlannerChild、isProberRole、toolSchemasOf、usageRoleOf、childBaseline |
| 会话状态生命周期／disposed 收尾／末轮 usage 结算／usage 账本续载／可信用量字段（provider/cw/rs）（session 分桶、final flush、cursor 降级、session.seq 水位 + snapshotEvents(from,to) 区间增量、水位未变直接返回、截断回退全量） | index.js、lib/agent-runtime.js | foldUsage、readUsageCursorTable、warnUsageCursorDegraded、usageCursorEntryOf、usageRoleOf、noteRunCodeSubCall、childBaseline |
| 方案与验收落盘／save_plan 双写（逐文件操作与 M 点合同；修改前范围/唯一原文锚点→未来验收定位；真实源核实与行漂移取证；主会话侧任意路由态放行的受限规划工件，仅写 cwd/.extra-plan；工具不自动调度） | lib/save-tool-factories.js、lib/save-contract.js、index.js | defineSavePlan、registerSavePlan、saveArtifactBase |
| 落盘单次提交／有限清理（atomic/commit） | lib/save-persistence.js、index.js | atomicCommit |
| 线索落盘／save_probe／证据报告（probe/evidence；限制值唯一来自 `save-contract.js#PROBE_LIMITS`；step-00 PR23/PR34/PR35 回归；主会话侧放行条件保持现状——route=plan + 目的已定 + 澄清完成；extractProbeEvidenceRefs 顺序固定：整体成对剥除（循环）→ 按顿号/分号/竖线拆分 → 逐段成对剥除 + trim → 过滤空串 → 去重；拆分符与剥除集均不含空格、半角逗号、`.`、`/`，单侧一律不剥） | lib/save-contract.js、lib/save-probe-validation.js、lib/save-tool-factories.js、index.js | validateProbe、renderProbeMarkdown、extractProbeEvidenceRefs |
| save_plan 限制值／确定性 summary／ContentBlock 渲染（SAVE_PLAN_LIMITS；formatSavePlanSummary 与 renderSavePlan 共用同一摘要口径；并保留 save_probe 合同） | lib/save-contract.js | sanitizeTaskName、timestamp、sessionTagOf、saveArtifactBase、formatSavePlanSummary、renderSavePlan、renderProbeMarkdown、renderSaveProbe、extractProbeEvidenceRefs |
| save_probe 校验／路径存在性与聚合拒绝 | lib/save-probe-validation.js | validateProbe、probePathOf |
| save 工具工厂／严格校验顺序／paths-only／真实源核实 owner | lib/save-tool-factories.js | createSaveToolFactories、defineSavePlan、resolveSaveContext、verifyPlanSources、defineSaveProbe |
| save_plan 模式／任务块／卷首职责与块边界／逐文件与修改点解析 | plugins/dsh-extra-plan/lib/save-plan-validation.js | parseTaskDocument、validateIds、validateTaskShape |
| save_plan 路径／资源／文件所有权与组 DAG（initialState 仅静态资格）／文件点与定位摘要 | plugins/dsh-extra-plan/lib/save-plan-validation.js | pathIssue、parseResources、validatePlanRelations、buildInternalOrder、buildSummary |
| save_plan 检查引用／验收组／收尾全局／早拒／双文档文件点映射 | plugins/dsh-extra-plan/lib/save-plan-validation.js | parseCheckRefs、validateChecks、validateClosure、validateGlobal、validateSavePlanContract |
| step-00／step-06 save_plan 通用合同回归覆盖（模式、任务/组 DAG、资源/检查引用、收尾/全局、摘要/早拒、paths-only 与零副作用） | pe-test/tools/step-00-全流程回归.mjs、pe-test/tools/step-06-线索落盘.mjs |  |
| 五份文档的通用派遣／验收边界（工件自包含；执行组与人数分离；执行者自检与 reviewer 验收分离；冻结、证据复用、失败复验、生产与 HUMAN 边界） | READAI.md、pe-test/docs/ai-概览.md、pe-test/docs/ai-机制设计.md、pe-test/docs/ai-流程备查.md、pe-test/docs/ai-维护手册.md |  |
| PTC F→L／native HN 与 ptc 聚合面实机取证 | pe-test/docs/ai-实机闸门测试流程.md |  |
| 实机子代理模型／提供方／planner 引导取证（A42/A43、C11/C12、HUMAN；显式 SESSION_ID + PLANNER_PROMPT_SUFFIX；默认索引与 `--full` 原文/raw 分层；request/header attempted route（尝试路由） 与 assistant/message actual provenance（实际来源） 分栏；suffix 等级与 exact match；两阶段头扫描 `headerOfDir` 只解析命中直接 child） | pe-test/tools/step-07-子代理模型与引导取证.mjs |  |
| 80格 A/C/M/F-L 路由与目录断言／显式 header catalog 取证 | pe-test/tools/step-04-路由与写闸门.mjs、pe-test/tools/step-04-工具清单查看.mjs |
| MJS 三模式输出合同／有限摘要／稳定 JSON／HUMAN 双通道 raw hash | pe-test/_shared/test-output.mjs、pe-test/tools/一键step测试.mjs |  |
| 探查者委派／禁止 planner 派探查（subagent_probe） | index.js、plugins/dsh-extra-plan/lib/model-routing.js | subagentProbeGateReason、resolveOtherAgentEntry |
| 只读子代理／验收者只读（reviewer/readonly） | index.js | childReadonlyGateReason、shellMutationReason、isReadOnlyChildByCatalog |
| 子代理沙箱下限／权限抬升（floor/sandbox） | lib/agent-runtime.js、index.js | childPolicyNeedsFloor、createAgentRuntime |
| 工具目录折叠／PTC 单入口（catalog/ptc） | index.js | catalogIsCollapsed |
| 设置后端／唯一全局 owner／settings-only no-remount（10 项 volatile Config + profileSync settled 镜像；adapter failure 独立；8 热读/2 需重启/gateWords restart；默认对象与 UI metadata 分源） | lib/settings.js、lib/settings-contract.js、lib/preset-settings.js、lib/preset-sync.js | apply、createApiHandler、proPayload、createDefaultSettings、readUnifiedState、findSettingsRow、effectiveRowConfig、resolveUnifiedConfig、restateSettingsConfig、findPluginsRow、applyPlan、mountPresetSync、initialMount、settledSettingsUpdate、structuralHandoff、syncEditor、settledSettings、profileSyncPath、reportProfileSync |
| Web→QQBot profile 同步／documentPath 首选／显式备用／双锚点／局部 YAML 安全写与恢复 | plugins/dsh-extra-plan/lib/qqbot-settings-sync.js；pe-test/tools/step-01-设置页配置.mjs、step-01-安装同步.mjs、step-01-qqbot-安装映射.mjs（分别覆盖路径/API、settled 生命周期、YAML 正负例） | resolveProfilesRoot、findOwnQqbotProfiles、validateSettingsSnapshot、planQqbotSettingsPatch、writeQqbotSettingsPatch、createQqbotSettingsSynchronizer |
| 设置值定位与捕获（source/row/legacy projection locator；10 项全局行 + 旧行安全读取；PUT 兼容入口合并全局值） | lib/preset-settings.js、lib/settings.js、lib/preset-sync.js | captureSettings、captureRowSettings、hostRowDefaultsFromTemplate、readProjectedValue、resolveSetting、findTextLocatorMatches、patchYamlScalar、serializeScalar、publicField、readLegacyState |
| 配置热读／生效标志／后端权威行更新无需重启（live-config/hot-read；增强 stamp dev/ino/size/mtimeNs/ctimeNs，兼容回退 ino/size/mtimeMs/ctimeMs） | plugins/dsh-extra-plan/lib/live-config.js、plugins/dsh-extra-plan/index.js | createLiveConfig、refresh、read、currentPath、readDiskValues、statStamp、pick |
| 预设核对／纯 definition／首次 adapter／旧行非破坏迁移／settled-only 与 structuralHandoff 分离 | lib/preset-sync.js、lib/preset-settings.js | syncPreset、assetDefinition、definitionWithProjection、readUnifiedState、readLegacyState、resolveUnifiedConfig、restateSettingsConfig、declarationBodyMatchesAsset、stripUserWritable、carryUserWritable、assetPlugins、pluginRowIds、readDeclaredPluginsFromPatch、applyPlan、structuralFingerprint、mountPresetSync、initialMount、settledSettingsUpdate、structuralHandoff、reportSettledError |
| 同页共享客户端表单／仅经 detail.section 渲染于 bundle 详情页行列表之后（自绘标题；字段常量只来自生成器标记区块；不注册 bundle.config/row/item/tab，本包 bundle.config 槽被任何一方注册条目时 detail.section 让位） | lib/client.js、scripts/generate-runtime-defaults.mjs | apply、SettingsCard、ExtraPlanForm、DetailSettingsSection、registerClientSurfaces |
> client.js 设置入口定位：`DetailSettingsSection` 与 `registerClientSurfaces`；设置表单仅经 plugins.detail.section 渲染于 bundle 页行列表之后，若本包 bundle.config 槽被任何一方注册条目则让位保持唯一表单；ConfigForms.get(NS) 订阅快照并一次 mutate 十项，不注册 bundle.config/row.config/settings.plugins.tab/plugins.item。
| 执行者工具裁剪／deny（executor-spawn；注册引用计数幂等 = 稳定键幂等——槽键 = 服务实现本体（读全局注册符号 Symbol.for('cordis.original')，取不到时降级回代理本身），跨预设世代/行重建共享同一注册与 disposer） | lib/executor-spawn.js | apply、slotKey |
| qqbot 兼容自愈／建链 | dsh-extra-plan-qqbot（仓库目录 plugins/dsh-extra-plan-qqbot）/lib/heal.js（选装包，本机未安装） | healQqbotCompatibility、ensureDshExtraPlanLink |
| 十项默认值 sourceLocator → DEFAULT_SETTINGS／兼容别名／消费者；纯 definition、四角色 definition 与 client 标记区块生成／last-known-good／事务发布（默认仓库七输出；自定义 client 默认关闭；--check 零写） | lib/preset-settings.js、lib/settings-contract.js、scripts/generate-runtime-defaults.mjs、lib/preset-defaults.generated.js、lib/client.js、assets/presets/extra-plan/preset-definition.generated.yml | resolveTemplateSettingDefault、runtimeDefaultsFromTemplate、renderRuntimeDefaults、renderClientFieldBlock、renderClientFields、renderPresetDefinition、topLevelRowsOf、generateRuntimeDefaults、normalizedOutputEntries、publishGeneratedOutputs、checkOutput |
| 闸门关键词单一来源／7 词唯一手工编辑位／prompt variable 注册／旧词拒绝／严格校验（gateWords/extra_plan_*） | plugins/dsh-extra-plan/assets/presets/extra-plan/agent.cordis.yml、plugins/dsh-extra-plan/lib/gate-words.js、index.js | validateGateWords、createGateRuntime、normalizeGateLabel、matchExactKind、deriveFlowState、mainGateReason |
| gateWords 启动核对／厂商模板整组校验／旧声明行 carry（无破坏性迁移） | plugins/dsh-extra-plan/lib/preset-sync.js | syncPreset、readDefinitionGateWords、assertTemplateGateWords、readLegacyState |
| runtime-static 纯 helper（cause-chain） | lib/runtime-static.js | causeChainOf |
| 普通/PTC ask 解码／拒绝中文呈现／状态推进（闸门拒绝不重置路由、取消仍清四字段；HOST_ASK_CANCEL_TEXTS 宿主取消句） | plugins/dsh-extra-plan/lib/gate-decisions.js、index.js | parseAskResultData、parseDispatchAskResult、askResultTextIsDenied、firstTextOfBlocks、applyAskOutcome、deriveFlowState |
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
| pe-test/_shared/host-deps.mjs | 325 | 解析宿主依赖候选并注册隔离加载钩子 |
| pe-test/_shared/preset-hash.mjs | 3 | （待补充） |
| pe-test/_shared/session-finder.mjs | 127 | 按会话ID或目录扫描定位日志并兼容三代命名 |
| pe-test/_shared/test-output.mjs | 143 | 统一compact、verbose、full输出合同与raw证据哈希 |
| pe-test/_shared/v4-tool-result.mjs | 28 | 识别v4会话日志并提取tool result |
| pe-test/_shared/zstd-frames.mjs | 107 | 解析zstd帧并解码会话文本 |
| plugins/dsh-extra-plan-qqbot/index.js | 22 | qqbot 精简版自愈插件：apply 启动时调 healQqbotCompatibility 自愈（迁移旧错误块+建链），不阻断启动 |
| plugins/dsh-extra-plan-qqbot/lib/heal.js | 355 | 自愈纯函数模块（定位 profile/旧块迁移/建链；供 index.js/CLI/测试复用） |
| plugins/dsh-extra-plan-qqbot/scripts/heal.mjs | 28 | CLI 兜底入口（postinstall/手动触发；invokedAsMain 判定） |
| plugins/dsh-extra-plan/index.js | 973 | 核心入口：四级闸门、预算、save 工具注册与生命周期；接线 planner/非 planner 路由、A/C/M 投影、P2-2 cache、session 分桶 usage final fold、v4 MALFORMED 自愈。gateWords 只来自 YAML，apply 先校验再副作用。 |
| plugins/dsh-extra-plan/lib/agent-runtime.js | 104 | 每次 apply 的角色识别、descriptor/工具 schema 缓存、usage role baseline 与 sandbox floor 工厂；不 import index.js |
| plugins/dsh-extra-plan/lib/agent-session.js | 32 | 会话事件与子代理识别的唯一来源：sessionEvents/isSubagentChild 零依赖纯函数，被 index.js 与 lib/model-routing.js 共用（无镜像副本；不 import index.js） |
| plugins/dsh-extra-plan/lib/assembly-presentation.js | 242 | A/C/M 与 skill catalog 模型可见投影；从 scoped tools 读 schema/模式，SDK renderer 按 language 整体重建；F/PTC 的 tool:read 由 index.js 手写，L 段回宿主原文。 |
| plugins/dsh-extra-plan/lib/client-carrier.js | 7 | settings 内部 Loader Group 的无副作用 Client carrier；不对应 bundle row/公开 export。 |
| plugins/dsh-extra-plan/lib/client.js | 321 | 客户端模块加载共享样式/词条与 SettingsCard/ExtraPlanForm；设置表单仅经 detail.section 渲染于当前包详情行列表之后（自绘标题，不注册 bundle.config；若本包 bundle.config 槽出现条目则让位）；后端全局 settings API/Config/旧值迁移与 definition/adapter 由同一 owner 活动。 |
| plugins/dsh-extra-plan/lib/executor-spawn.js | 132 | 执行者子代理 provider：委托宿主 spawn，注入工具 deny（防委派递归/追问）；registerProvider 走引用计数幂等（**稳定键幂等**：模块级 WeakMap 槽表的槽键 = subagents 服务实现本体——读全局注册符号 Symbol.for('cordis.original')，由 traceable 代理 get 拦截器返回 target，root 单例跨预设世代恒同一对象；取不到符号值时降级回代理本身；跨预设世代/行重建复用同一注册，归零才反注册） |
| plugins/dsh-extra-plan/lib/gate-decisions.js | 1059 | 四级闸门与角色分流判定纯函数集 |
| plugins/dsh-extra-plan/lib/gate-words.js | 114 | 闸门关键词共享契约（唯一值源是 YAML 的 config.gateWords）：字段规格 GATE_WORD_FIELDS/GATE_WORDS_GROUP_DEFINITION + 整组严格校验 validateGateWords（错误一律以 extra-plan: config.gateWords 开头）+ 运行时词表 createGateRuntime（显式入参严格校验，无默认词表）；纯模块：不含任何出厂词值、不读文件与环境变量，被 index.js（运行时）与 lib/preset-sync.js（启动自愈）共享（迁移叶 locator 已随跨版本搬迁链删除） |
| plugins/dsh-extra-plan/lib/live-config.js | 239 | 配置热读：仅 8 项运行时 getter；2 项宿主行权威设置只读并派生到内存 definition，不暴露为 getter；构造期读盘一次，后续按增强 stamp（dev/ino/size/mtimeNs/ctimeNs，兼容 ino/size/mtimeMs/ctimeMs）重读；失败整组回退并告警，不读 DSH_HOME 旧目录 |
| plugins/dsh-extra-plan/lib/model-routing.js | 509 | planner/非 planner 子代理模型路由：顶层纯判定函数 + createModelRouting per-apply 工厂（per-instance WeakMap、惰性 llm/agents getter；不 import index.js） |
| plugins/dsh-extra-plan/lib/planner-budget.js | 137 | planner 工具计数、消息后缀/预算提示/耗尽文案；**预算提醒消息经宿主 createUserMessage 构造，source 用生产者自有 kind `plugin:dsh-extra-plan`（v4 行准入禁旧包裹 `plugin`，违者会话当场终止）**；默认预算由生成模块提供，FREE_TOOLS 仍在根入口 |
| plugins/dsh-extra-plan/lib/preset-defaults.generated.js | 16 | 由 YAML 模板生成的十键 `DEFAULT_SETTINGS` 与兼容别名 runtime fallback（回退）常量；generated（生成）/do not edit（勿手改） |
| plugins/dsh-extra-plan/lib/preset-settings.js | 3 | 10 项设置描述与 YAML 定位；settings 行是权威值，声明行只投影 2 项宿主行；capture/投影读取、plugins 行整体重述与保格式标量改写。 |
| plugins/dsh-extra-plan/lib/preset-sync.js | 966 | 读取并严格校验纯 definition；旧 preset-extra-plan/extra-plan-preset-sync 仅安全读取迁移，统一全局行补齐后派生 definition 并由同一 owner 挂载官方 AgentPreset；新写入仅经唯一全局行 configEditor.edit；mountPresetSync 以通用 settled 回调交付最终十项/gateWords。 |
| plugins/dsh-extra-plan/lib/preset-yaml.js | 589 | 预设 YAML 纯职责模块：解析、行与叶定位及歧义分类、权威与投影值捕获、保格式标量改写。 |
| plugins/dsh-extra-plan/lib/qqbot-settings-sync.js | 893 | Web documentPath 首选、显式 DSH_HOME 备用、双锚点 profile 扫描、完整 10 项/gateWords 安全快照、局部 YAML 保格式写入、排他临时/备份/恢复与串行同步队列；不读用户目录、不触碰未知根。 |
| plugins/dsh-extra-plan/lib/role-contract.js | 7 | 冻结角色 ID/order 数组并由同一数组派生 planner/prober preset ID；只提供身份与装配顺序，不承载权限、沙箱或生命周期策略。 |
| plugins/dsh-extra-plan/lib/run-code-scanner.js | 342 | run_code 无宿主状态词法扫描器：字符串/注释遮蔽、括号配平、tools 调用点收集与动态访问判定。 |
| plugins/dsh-extra-plan/lib/run-code-static.js | 571 | run_code 纯静态解析/理由模块：安全 JSON/JS literal 解析、动态 argsText 瀑布兜底、写模式 hint、工具组拆解、ask 返回值白名单、调用点计数与当前 PTC dispatch cap；仅显式注入普通依赖，不持有宿主状态。 |
| plugins/dsh-extra-plan/lib/runtime-lifecycle.js | 147 | per-apply 运行时生命周期：save 工具注册、probe 名额认领与 run_code 子调用计数/拒绝记录，状态在闭包内并按会话清理 |
| plugins/dsh-extra-plan/lib/runtime-static.js | 15 | 显式参数纯 helper：SKILL frontmatter 与 cause 链解析；不持有宿主状态 |
| plugins/dsh-extra-plan/lib/save-contract.js | 277 | save 合同唯一真源：任务名/sessionTag/base、SAVE_PLAN_LIMITS 与确定性 summary/render、PROBE_LIMITS、ContentBlock/Markdown 渲染与证据引用清洗；无宿主状态，运行时限制只在本文件维护。 |
| plugins/dsh-extra-plan/lib/save-persistence.js | 76 | 单次调用阶段感知提交：mkdir→临时文件逐项写入→逐项检查并顺序发布；失败保留首错/阶段，仅清理本次临时与已发布半套工件，清理失败附残留路径与原因，预存目标不覆盖；不创建/扫描/恢复跨调用 journal；末位 fs 依赖可注入。 |
| plugins/dsh-extra-plan/lib/save-plan-validation.js | 1249 | save_plan 文本合同校验：模式/任务/路径所有权/依赖与执行组 DAG/资源/检查引用与验收组/收尾全局/摘要早拒；不启动代理或执行命令。 |
| plugins/dsh-extra-plan/lib/save-probe-validation.js | 113 | save_probe 参数校验：数组/条目/长度/总量/path 存在性/range/evidence 聚合拒绝 |
| plugins/dsh-extra-plan/lib/save-tool-factories.js | 388 | 显式依赖工厂：save_plan 按类型/长度→合同/摘要→context/base→证据 IO→单次 atomicCommit 严格接线；合法正文逐字保存、structured output 仅 paths、render 为 text ContentBlock；save_probe 保留既有证据诊断与落盘；不缓存 ctx/agent/会话状态。 |
| plugins/dsh-extra-plan/lib/sdk-text-cache.js | 161 | apply 级 agent-keyed WeakMap SDK 文本缓存：完整 renderer 输入保守指纹、language/renderer 身份比较、并发 Promise 合并、reject/过期 Promise 不回写、dispose 回收；不持有 sessionId 或 PromptAssembly |
| plugins/dsh-extra-plan/lib/settings-contract.js | 176 | 服务端设置 descriptor 单一合同：10 项的类型/生成默认引用/校验/UI metadata 与权威-投影双定位器，并导出 `createDefaultSettings`、分组与投影遍历源 |
| plugins/dsh-extra-plan/lib/settings.js | 574 | 10 字段 volatile Config、页面策略与 loopback GET/PUT；权威值在唯一 settings 行，PUT 先拒绝空/null/数组/原始/未知/非法混合载荷并严校验当前 gateWords，再只 edit 全局行，no-op 也重读最终快照并等待 profileSync，结构化区分 synced/not-installed/unavailable/failed/partial。 |
| plugins/dsh-extra-plan/lib/shell-mutation.js | 182 | 跨平台命令文本解码与 pwsh/bash 写形态判定；纯函数、不持有 apply 状态 |
| plugins/dsh-extra-plan/lib/usage-ledger.js | 174 | per-apply usage 账本：cursor 表读取与降级告警、按水位增量 fold 会话 usage 并追加 JSONL。 |
| plugins/dsh-extra-plan/scripts/generate-runtime-defaults.mjs | 647 | 从 agent.cordis.yml 校验并生成 runtime 默认常量、纯主/角色 definition 与 client 标记区块（顶层结构逐字平移并保留 group/isolate/!!js）；默认仓库七输出，自定义 client 默认关闭；支持 --check 且坏源不覆盖 last-known-good（上次已知良好版本） |

## 函数索引

| 文件 | 函数 | 行号 | 功能描述 | 备注 |
|:--|:--|:--|:--|:--|
| pe-test/_shared/host-deps.mjs | profileNames | L30-39 | 从宿主包元数据读取候选profile名称 |  |
| pe-test/_shared/host-deps.mjs | readFileSync0 | L41-45 | 只列宿主依赖目录名；异常由调用者处理，避免顶层再引入 readdirSync。 |  |
| pe-test/_shared/host-deps.mjs | anchorCandidates | L50-96 | 生成宿主依赖锚点目录候选并去重 |  |
| pe-test/_shared/host-deps.mjs | exportTarget | L98-115 | 从依赖入口导出目标包的指定绑定 |  |
| pe-test/_shared/host-deps.mjs | entryOf | L117-134 | 解析宿主依赖导出入口并校验路径 |  |
| pe-test/_shared/host-deps.mjs | findHostAnchor | L136-154 | 选择可用宿主包锚点并报告候选来源 |  |
| pe-test/_shared/host-deps.mjs | scopedEntryOf | L157-165 | 解析scoped包的本地入口路径 |  |
| pe-test/_shared/host-deps.mjs | warnShadowedHostCopies | L169-194 | 告警被工作区副本遮蔽的宿主依赖 |  |
| pe-test/_shared/host-deps.mjs | buildAsyncHookSource | L196-257 | 构造异步import钩子源码供隔离宿主依赖 |  |
| pe-test/_shared/host-deps.mjs | registerHostDeps | L261-325 | 注册测试所需宿主依赖并校验实际版本 |  |
| pe-test/_shared/host-deps.mjs | resolveScoped | L274-280 | 解析scoped宿主包候选路径 |  |
| pe-test/_shared/host-deps.mjs | resolveBare | L281-288 | 解析非scoped宿主包候选路径 |  |
| pe-test/_shared/host-deps.mjs | resolveOne | L290-300 | 按包名统一尝试scoped与bare解析 |  |
| pe-test/_shared/host-deps.mjs | resolve | L304-310 | 为动态加载钩子提供依赖解析入口 |  |
| pe-test/_shared/session-finder.mjs | logPath | L17-23 | 在目录中按v4、v3、旧名顺序寻找会话日志 |  |
| pe-test/_shared/session-finder.mjs | readMeta | L25-48 | 读取会话目录元数据并提取定位字段 |  |
| pe-test/_shared/session-finder.mjs | scanAll | L50-69 | 扫描sessions目录并按时间整理候选 |  |
| pe-test/_shared/session-finder.mjs | byName | L71 | 按目录名或会话ID匹配候选 |  |
| pe-test/_shared/session-finder.mjs | findSession | L73-127 | 返回显式或自动会话定位结果及关联子会话 |  |
| pe-test/_shared/test-output.mjs | digest | L11-13 | 计算UTF-8文本SHA-256摘要 |  |
| pe-test/_shared/test-output.mjs | normalize | L15-31 | 递归稳定化值并处理循环引用与特殊类型 |  |
| pe-test/_shared/test-output.mjs | stableStringify | L33-37 | 按键排序序列化断言值 |  |
| pe-test/_shared/test-output.mjs | parseOutputMode | L39-58 | 解析compact、verbose、full模式及优先级 |  |
| pe-test/_shared/test-output.mjs | summarizeValue | L60-71 | 将成功大对象压缩为类型、键数和预览摘要 |  |
| pe-test/_shared/test-output.mjs | assertionLine | L73-78 | 按模式渲染断言并始终保留失败差异 |  |
| pe-test/_shared/test-output.mjs | createOutput | L80-110 | 创建统一断言、结构化输出与统计接口 |  |
| pe-test/_shared/test-output.mjs | emit | L84-87 | 将普通行或错误行写入对应通道 |  |
| pe-test/_shared/test-output.mjs | assertion | L88-91 | 输出断言行并返回布尔结果 |  |
| pe-test/_shared/test-output.mjs | structured | L92-97 | 按模式输出完整值或稳定摘要 |  |
| pe-test/_shared/test-output.mjs | detail | L98-100 | 仅在full或强制条件下输出细节 |  |
| pe-test/_shared/test-output.mjs | marker | L101 | 输出SKIP、HUMAN等结构化状态标记 |  |
| pe-test/_shared/test-output.mjs | summary | L102-108 | 输出统一通过失败及扩展状态统计 |  |
| pe-test/_shared/test-output.mjs | fileEvidence | L112-116 | 读取文件并计算bytes、lines、SHA-256 |  |
| pe-test/_shared/test-output.mjs | requireFile | L118-120 | 以UTF-8读取证据文件 |  |
| pe-test/_shared/test-output.mjs | writeRawEvidence | L122-139 | 保存stdout、stderr并返回合并证据统计 |  |
| pe-test/_shared/test-output.mjs | sha256Text | L141-143 | 对文本返回SHA-256用于raw复核 |  |
| pe-test/_shared/v4-tool-result.mjs | isObject | L6 | 判定非空普通对象 |  |
| pe-test/_shared/v4-tool-result.mjs | isToolResultType | L8-10 | 判定事件是否为tool/result类型 |  |
| pe-test/_shared/v4-tool-result.mjs | isV4SessionFile | L12-14 | 判定路径是否为v4会话日志文件 |  |
| pe-test/_shared/v4-tool-result.mjs | v4LogPath | L16-20 | 返回目录中的v4日志路径或空值 |  |
| pe-test/_shared/v4-tool-result.mjs | toolResultOf | L22-28 | 从v4事件提取调用ID、错误标记和文本 |  |
| pe-test/_shared/zstd-frames.mjs | frameEndAt | L6-34 | 在已验证 magic 的帧起点解析 FCS/字典/checksum 与 raw/RLE/compressed 块，只返回当前帧结束位置；不完整或非法块边界返回 null。 | 私有边界算法由 framesOf 与严格逐帧解码复用，不扫描后续帧。 |
| pe-test/_shared/zstd-frames.mjs | framesOf | L36-48 | 解析完整zstd帧及块边界 |  |
| pe-test/_shared/zstd-frames.mjs | decodeText | L50-52 | 解压单帧并转为UTF-8文本 |  |
| pe-test/_shared/zstd-frames.mjs | decompressedFrameBytes | L58-85 | 逐帧计算一次边界并解压，边界解析次数随帧数线性增长；按长度跳过 skippable 载荷，产出每帧 Buffer，截断/非法 magic/无完整帧抛出不完整错误。 | skippable 载荷内的 zstd magic 不作为真实帧。 |
| pe-test/_shared/zstd-frames.mjs | decodedJsonlLines | L87-107 | 以 fatal UTF-8 TextDecoder 跨帧累积并按物理换行 yield { lineNo, line }，保留 CR/空行/末行无换行；帧截断、非法 UTF-8 和无完整帧由调用方归类 INCOMPLETE。 |  |
| plugins/dsh-extra-plan-qqbot/index.js | apply | L11-22 | 插件入口：apply 启动时调 healQqbotCompatibility 自愈（迁移旧错误块+建链；try/catch 不阻断启动） |  |
| plugins/dsh-extra-plan-qqbot/lib/heal.js | loadYamlModule | L15-25 | 仅按 package-local import.meta.url 惰性加载 js-yaml；不可用时由迁移入口保守跳过，导入零副作用。 |  |
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
| plugins/dsh-extra-plan-qqbot/lib/heal.js | parseEntryBlock | L92-100 | 用 js-yaml 严格解析单个根级条目，返回 parsed/yaml-unavailable/parse-failed 状态；不做文本猜测。 |  |
| plugins/dsh-extra-plan-qqbot/lib/heal.js | legacyEntryKind | L102-112 | 旧版根级完整块匹配（id+name[+config.default=standard]）→ 返回 id 或 null |  |
| plugins/dsh-extra-plan-qqbot/lib/heal.js | rootSequenceIndent | L114-124 | 根级序列缩进探测（首条 - 行的缩进宽度） |  |
| plugins/dsh-extra-plan-qqbot/lib/heal.js | isRootSequenceLine | L126-130 | 指定缩进处的根级序列行判定 |  |
| plugins/dsh-extra-plan-qqbot/lib/heal.js | scanRootBlocks | L132-158 | 按根级缩进切分顶层条目块（返回 lines/rootIndent/blocks） |  |
| plugins/dsh-extra-plan-qqbot/lib/heal.js | findLegacyRootBlocks | L160-175 | 扫描根级块并仅按解析对象匹配完整旧条目；任一解析不可用/失败返回 parseIssue，整体跳过删除。 |  |
| plugins/dsh-extra-plan-qqbot/lib/heal.js | removeLegacyRootBlocks | L177-199 | 移除旧版根级块（移除后无实质内容时写顶层 []） |  |
| plugins/dsh-extra-plan-qqbot/lib/heal.js | verifyMigratedPatch | L201-211 | 迁移后只用 js-yaml 校验顶层数组且无完整旧块残留，不使用行级 fallback。 |  |
| plugins/dsh-extra-plan-qqbot/lib/heal.js | healPatchRows | L222-264 | 幂等迁移旧版根级 code-runtime/agent-presets 错误块（实为清旧块；静态补行由包内 cordis.patch.yml 唯一提供）；写前 .bak-* 备份、写后校验失败恢复；文件不存在跳过 |  |
| plugins/dsh-extra-plan-qqbot/lib/heal.js | findOwnQqbotProfiles | L272-292 | 扫描 $DSH_HOME/profiles/* 找出锚定本插件的 qqbot profile（bundles + node_modules 双条件） |  |
| plugins/dsh-extra-plan-qqbot/lib/heal.js | ensureDshExtraPlanLink | L300-330 | 建平铺 dsh-extra-plan → Web 包链接：web 缺失跳过/已正确不动/实体或非目标链接提示 pnpm 迁移/仅 ENOENT 建 junction |  |
| plugins/dsh-extra-plan-qqbot/lib/heal.js | healQqbotCompatibility | L336-355 | 对每个自有 profile 依次执行 healPatchRows（清旧错误块）与 ensureDshExtraPlanLink（建链）；整体 try/catch 只记录日志不阻断 |  |
| plugins/dsh-extra-plan-qqbot/scripts/heal.mjs | invokedAsMain | L9-14 | 主脚本判定（node 直跑时执行自愈；本仓插件 CLI 通用写法） |  |
| plugins/dsh-extra-plan/index.js | malformedRecovery | L205-239 | MALFORMED_RESPONSE 限次自愈：llm-retry 已给 {kind:'retry'} 原样透传（不叠加）；否则按 sessionId→Set('turn:step') 同回合只兜底 1 次（防死循环），注入 developer/message 中文提示（append 带 surfaceOp:'append'、纯文本禁带 headerSeq、source.kind 用生产者自有 plugin:dsh-extra-plan）并返回 {kind:'retry'}；**payload 须自带 ≥1 的 turn/step（宿主 append 不补坐标），坐标缺失/非正整数 → 跳过注入但仍返回 {kind:'retry'}**；aborted/无 agent/超次 → null 回退原 action 透传 |  |
| plugins/dsh-extra-plan/index.js | recordAgentError | L253-271 | agent/error 回合错误取证：把宿主回合/步骤级错误（payload {agent,turn,step,error}）逐字落盘到插件目录 extra-plan-agent-errors.jsonl，行 = {ts, sessionId, turn, step, chain}；整体吞错 + 一次性 warn 防刷屏；模块级函数经命名导出供回归冒烟直呼 | 与 recordRequestError 同诊断模式 |
| plugins/dsh-extra-plan/index.js | apply | L275-973 | 插件主入口：第一步 createGateRuntime(cfg.gateWords)（缺失/非法同步抛错，早于任何工具/监听器/服务副作用）→ ctx.effect 在当前 agent scope 注册恰好 7 个 extra_plan_* prompt variable（provider 返回本次 apply 捕获值）→ 配置解析（含变量② bootstrapReadHint）/服务注册/工具注册/creativeMode 模型可见投影/锚点钩子（HP 首轮 tool:read text 用变量②覆盖）；planner 与非 planner child 双模型路由；会话状态按 sessionId 分桶与 agent/disposed 同步 final flush + 单会话回收；tool-jobs 通知由 `agent/inbox/claimed` 同步主入口与 `tools/pre-execute` durable snapshot fallback 共用 `consumeToolJobsNotice`，以 notice `message.id` 建立跨锚点基线，复用 jobId 的新 incarnation 仍可解锁 |  |
| plugins/dsh-extra-plan/index.js | resolveDocumentPath | L307-314 | 取 configEditor 服务的 documentPath 作为 profile patch 文件绝对路径，异常或非字符串时返回空串，供 live-config 决议热读路径。 |  |
| plugins/dsh-extra-plan/index.js | plannerModel | L327 | 热读箭头 getter：pro 规划默认模型（liveConfig.plannerModel；消费点=model-routing 的 getPlannerModel） |  |
| plugins/dsh-extra-plan/index.js | otherAgentModel | L328 | 热读箭头 getter：其他子代理默认模型（消费点=model-routing 的 getOtherAgentModel） |  |
| plugins/dsh-extra-plan/index.js | exploreBudget | L329 | 热读箭头 getter：pro 规划探查额度/单实例子调用上限（消费点=预算文案、noteRunCodeSubCall、plannerGateReason 与组判定） |  |
| plugins/dsh-extra-plan/index.js | plannerPromptSuffix | L330 | 热读箭头 getter：pre-step 拼接的额外引导后缀 |  |
| plugins/dsh-extra-plan/index.js | bootstrapOn | L331 | 热读箭头 getter：anchored 首轮引导开关（消费点=shouldHideCreativeCatalog 与 anchoredFirst 装配） |  |
| plugins/dsh-extra-plan/index.js | runcodeCatchGateOn | L332 | 热读箭头 getter：PTC try/catch 闸门开关（消费点=planner/只读 child/主会话三处组判定传参） |  |
| plugins/dsh-extra-plan/index.js | crossProviderPlannerModelOn | L333 | 热读箭头 getter：跨提供方模型选择开关（消费点=model-routing 双 resolver 入口，新 agent 重决议） |  |
| plugins/dsh-extra-plan/index.js | creativeModeOn | L336 | 热读箭头 getter：创造模式开关（liveConfig.creativeMode；消费点=shouldHideCreativeCatalog 与装配投影 hideCordis） |  |
| plugins/dsh-extra-plan/index.js | getAgents | L356 | 惰性返回 ctx.get('agents') 服务；注入 createAgentRuntime，供判定子会话是否为其父代理下的活跃派发。 |  |
| plugins/dsh-extra-plan/index.js | warn | L359 | 把告警参数原样转发到 console.warn；注入 createAgentRuntime，作为缺父代理等异常情况的告警出口。 |  |
| plugins/dsh-extra-plan/index.js | getPlannerModel | L367 | 返回热读配置 plannerModel（planner 子代理所用模型名）；注入 createModelRouting 供 planner 模型路由决议。 |  |
| plugins/dsh-extra-plan/index.js | getOtherAgentModel | L368 | 返回热读配置 otherAgentModel（非 planner 子代理所用模型名，空串表示不覆盖）；供非 planner 路由决议。 |  |
| plugins/dsh-extra-plan/index.js | getCrossProviderPlannerModel | L369 | 返回热读布尔开关 crossProviderPlannerModel；决定 planner 路由走跨 provider 严格探针还是旧单 provider 路径。 |  |
| plugins/dsh-extra-plan/index.js | getLlm | L370 | 返回 ctx.get('llm') 服务；供 model-routing 查 provider 模型目录（listModels）与真实探针调用。 |  |
| plugins/dsh-extra-plan/index.js | getAgents | L371 | 返回 ctx.get('agents') 服务（同名第 2 处，消费方为 model-routing）；供经 agents.get 回溯父会话链的 provider/model/maxTokens。 |  |
| plugins/dsh-extra-plan/index.js | getDiagPath | L372 | 返回诊断文件路径 diagPath（取自 cfg.diagFile，缺省为插件目录下 extra-plan-request-errors.jsonl）；供追加 planner 降级诊断行。 |  |
| plugins/dsh-extra-plan/index.js | noteRunCodeSubCall | L399 | 单实例子调用上限（planner）：按 sessionId→rootCallId 桶读计数、未超限则 +1；返回拒绝文案或 null；空 rootCallId 与 exploreBudget 文案保持 |  |
| plugins/dsh-extra-plan/index.js | consumeToolJobsNotice | L400-433 | 统一幂等 tool-jobs notice 消费：校验 session/message/非空 message.id/source/content 与 `/background job (\S+)/`；session 内以 message.id 判重，同 id 跨 claimed/durable 幂等，不同 id 即使复用 jobId 也算新通知；首次有效通知按 session 精确删除 jobId 对应的 job_output 键、清空 pollGuard 整表，双解锁后写 notice-id；坏输入与重复通知返回 false 且零 Map 副作用，锚点不删除 notice-id Set | `agent/inbox/claimed` 同步主入口与 `tools/pre-execute` durable user/message fallback 共用；Set 由 disposeSession 按 session 回收，不查询 job running/terminal 状态 |
| plugins/dsh-extra-plan/index.js | shouldHideCreativeCatalog | L463-470 | HP1 判定：C=1、A=1、F、main/planner、M=ptc 时暂隐两个创造 skill |  |
| plugins/dsh-extra-plan/index.js | isAnchoredContextGate | L474-479 | 判定当前 agent 是否满足 anchored context gate：bootstrap 开启、Session 仍处 F，且角色为 main 或 planner（非 live child） | 只读 payload.agent；角色沿现有 isPlannerChild/isChild 语义，不使用 selfAgent 或父 Session 相位 |
| plugins/dsh-extra-plan/index.js | warnPreStepFailure | L481-485 | pre-step 可降级 C 投影/去重异常的一次性告警 helper；返回路径仍保留已经完成的 source 过滤副本，并保证 next 只调用一次 | 不得在关键 source gate/phase 失败时吞错后发送未过滤 decision |
| plugins/dsh-extra-plan/index.js | recordRequestError | L554-576 | 记录 agent/request-error 失败诊断到插件目录 extra-plan-request-errors.jsonl（diagPath 可经 cfg.diagFile 覆盖；行含 turn/step/provider/message/code/causeChain） |  |
| plugins/dsh-extra-plan/lib/agent-runtime.js | isLiveDelegation | L10-21 | 按父会话 registry 存活状态判定委托是否仍有效 |  |
| plugins/dsh-extra-plan/lib/agent-runtime.js | childPolicyNeedsFloor | L24-29 | 判定 read-only（只读） 子代理是否需要 workspace-write floor |  |
| plugins/dsh-extra-plan/lib/agent-runtime.js | createAgentRuntime | L31-104 | 创建 per-apply 角色/缓存/usage baseline 工厂 |  |
| plugins/dsh-extra-plan/lib/agent-runtime.js | isChild | L37-45 | 按显式 events 判定 live child 并发出恢复为 root 警示 |  |
| plugins/dsh-extra-plan/lib/agent-runtime.js | isPlannerChild | L50-58 | 每次按当前 Agent 的 header.agentPreset 与 isSubagentChild 判定 planner 子会话；不共享跨 Agent 的预设名布尔缓存，缺失必要信息返回 false。 |  |
| plugins/dsh-extra-plan/lib/agent-runtime.js | toolSchemasOf | L61-79 | 防御式读取 agent scoped tools.schemas，失败/非数组返回 undefined |  |
| plugins/dsh-extra-plan/lib/agent-runtime.js | floorChildPolicy | L81-85 | 为 read-only（只读） child 同步追加 workspace-write sandbox 事件 |  |
| plugins/dsh-extra-plan/lib/agent-runtime.js | usageRoleOf | L87-91 | 优先读取 role WeakMap，保证 disposed 后角色不漂移 |  |
| plugins/dsh-extra-plan/lib/agent-runtime.js | childBaseline | L93-101 | 同步确定 main/planner/executor role、fold usage 并应用 child floor |  |
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
| plugins/dsh-extra-plan/lib/assembly-presentation.js | toolPresentationModeOf | L233-242 | 从 scoped tools registry 读取 native/ptc 二值模式（both 已退出） |  |
| plugins/dsh-extra-plan/lib/client-carrier.js | apply | L5-7 | 空实现的内部 Client carrier 入口：由 settings 动态 Loader entry 通过 dsh.client manifest 触发 lib/client.js 加载，不注册 row、export 或业务副作用。 |  |
| plugins/dsh-extra-plan/lib/client.js | factory | L3-320 | 模块工厂：接收 require，装配并返回本插件客户端模块导出（apply 与 inject 声明），由 __ModuleLoader__ 调用。 |  |
| plugins/dsh-extra-plan/lib/client.js | apply | L112-315 | 客户端插件入口：注入 esp-* 样式表与中英词条；仅注册 detail.section 于当前包详情行列表之后呈现唯一表单（不注册 bundle.config；槽内出现本包条目时让位）；稳定 namespace 的 ConfigForms 快照订阅与一次十项 mutate 共用一份表单，不注册 row/item/tab。 |  |
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
| plugins/dsh-extra-plan/lib/client.js | ExtraPlanForm | L178-271 | 共享十项设置表单：从 ConfigForms.get(NS) 适配的 state/mutate 播种 draft（value/writable/revision/status），按 general/pro 两组 esp-section 渲染字段，footer 一次性提交十个 set ops + revision fence 后提示已保存/失败。 |  |
| plugins/dsh-extra-plan/lib/client.js | fieldValue | L201-208 | 取字段草稿值：number 控件把草稿转 Number（非有限数值原样返回），其余控件原样返回 | ExtraPlanForm 内部闭包 |
| plugins/dsh-extra-plan/lib/client.js | saveAll | L210-235 | 双步保存：第一步十项 mutate(ops, revision)（宿主规范写盘，accepted===true 才继续）；accepted 分支内第二步静默同源 PUT /api/dsh-extra-plan-settings/pro-config（body 为 10 项 draft 值）触发 QQBot 全量同步——独立 try/catch 吞异常，PUT 响应不驱动 UI 消息（同步状态经 GET pro-config 查询，含 stale 检测）；提示保持原样 accepted→已保存、否则保存失败；mutate 失败路径不变。 |  |
| plugins/dsh-extra-plan/lib/client.js | renderField | L237-246 | 按 field 渲染十项设置中的一个字段：esp-field 内「locale 名称→renderControl（随 snapshot.writable 禁用）→静态 hint」，编辑写回 draft 并清提示。 | ExtraPlanForm 内部闭包；本地稳定字段样式 |
| plugins/dsh-extra-plan/lib/client.js | SettingsCard | L273-281 | SHARED 卡片根组件：固定 page 形态，接收规范化 configForm/translate，渲染 esp-wrap 与唯一 ExtraPlanForm；不保留 summary/view 分支。 |  |
| plugins/dsh-extra-plan/lib/client.js | hasBundleConfigEntry | L283-290 | 检查稳定包名 key 是否已被注册进 bundle.config 槽，供 detail.section 让位避免重复表单。 |  |
| plugins/dsh-extra-plan/lib/client.js | DetailSettingsSection | L292-298 | 仅匹配当前包 bundle subject；bundle.config 槽无本包条目时呈现同一共享表单（唯一通道），槽内出现本包条目则让位返回 null。 |  |
| plugins/dsh-extra-plan/lib/client.js | safeInject | L300-302 | 尝试挂载 detail.section 正式槽；版本缺槽时保留真实缺失而不伪造 row/tab 兼容。 |  |
| plugins/dsh-extra-plan/lib/client.js | registerClientSurfaces | L304-311 | 在 ConfigForms namespace served 时注册 detail.section 唯一正式槽（自绘标题呈现于行列表之后），生命周期由同一 owner 释放。 |  |
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
| plugins/dsh-extra-plan/lib/gate-decisions.js | filterBootstrapContextDecision | L57-64 | F gated decision 按 source.kind 精确整条删除 agent-instructions/skill-catalog；非 enter、非数组、非 gated 或无命中均透传，命中时复制 decision 并保留其它字段、消息顺序与身份 | 纯函数；不读宿主状态、不改输入；由 index.js 的 agent/pre-step prepend gate 调用 |
| plugins/dsh-extra-plan/lib/gate-decisions.js | projectedSkillCatalogSignature | L66-74 | 校验 skill-catalog 的 entries 并生成有序 [name,description] JSON 签名；空 entries 合法，坏条目返回 undefined 不作去重基准 | 纯函数；签名不使用 id/update/提醒文案，也不访问父 Session 或全局缓存 |
| plugins/dsh-extra-plan/lib/gate-decisions.js | jsonShapeSignature | L76-108 | 对 JSON-like 值生成可比较的规范签名；拒绝循环、getter/非 plain object、非 JSON 类型，供 agent-instructions content 身份比较 |  |
| plugins/dsh-extra-plan/lib/gate-decisions.js | projectedAgentInstructionsSignature | L110-114 | 校验 agent-instructions 的非空 content JSON 形状并生成签名；忽略消息 id/seq/role/source 动态字段 |  |
| plugins/dsh-extra-plan/lib/gate-decisions.js | projectedContextSignature | L116-123 | 按 source.kind 选择 agent-instructions/content 或 skill-catalog/[name,description] 签名；未知 source/坏形状返回 undefined |  |
| plugins/dsh-extra-plan/lib/gate-decisions.js | dedupeProjectedContextDecision | L125-146 | 按 kind 从当前 visibleMessages 取最后合法签名，顺序删除同签名消息并保留变化/移出 surface 重现；无共享缓存且冻结输入可用 |  |
| plugins/dsh-extra-plan/lib/gate-decisions.js | isBootstrapPhase | L147-157 | 判定会话是否处于引导阶段（尚未落盘任何 tool/call 事件），无会话时返回 false | 顶层函数；防御 agent/session 为空、events 非数组；事件源为 agent-session.js 的 sessionEvents |
| plugins/dsh-extra-plan/lib/gate-decisions.js | labelsOfCallData | L164-180 | 解析 ask 调用数据，返回首问 questions[0] 的选项标签数组；JSON 解析失败返回 null | 顶层函数；arguments 为字符串则 JSON.parse、为对象则直用；缺 questions 返回 null，首问无选项返回空数组 |
| plugins/dsh-extra-plan/lib/gate-decisions.js | isExactGateSet | L192-199 | 判定标签集归一后与闸门标准词集合完全相等（精确比较，不用子串） | 顶层函数；先 normalizeGateLabel 去推荐后缀；三分法「完全等于」一侧 |
| plugins/dsh-extra-plan/lib/gate-decisions.js | isPartialGateSet | L202-210 | 判定标签与标准词集合部分相交（≥1 个 indexOf 命中）但不完全相等 | 顶层函数；内部先排除完全相等情形；三分法「部分相交」一侧 |
| plugins/dsh-extra-plan/lib/gate-decisions.js | categorizeGateAsk | L213-217 | 把 ask 选项三分：与路由/批准/目的词集完全相等→standard，相交→malformed，否则 ordinary |  |
| plugins/dsh-extra-plan/lib/gate-decisions.js | gateAskDenyReason | L220-256 | 生成「ask 选项不规范」拒绝文案：列出缺项最少那类标准词，无缺项则提示非白名单修饰 | 顶层函数；缺项数最小项相同时取路由；提示模板块列出路由/批准/目的三组标准选项 |
| plugins/dsh-extra-plan/lib/gate-decisions.js | validateGateAskStructure | L262-289 | 校验标准 ask 的 questions 结构（route/purpose/approve 的问题数与第二问必须纯文本），通过返回 null | 顶层函数；不通过返回中文 deny 文案，未知 kind 返回「未知的 ask 类型」 |
| plugins/dsh-extra-plan/lib/gate-decisions.js | askKindOf | L296-313 | 严格分类 ask：同含路由两词→route，含批准词→approve，同含目的两词→purpose，否则 clarify | 顶层函数；测试契约 API，仅经 decisions 导出供 pe-test 调用（导出实际在 L998，非注释所称 L1244），运行时状态机用 askKindOfRelaxed |
| plugins/dsh-extra-plan/lib/gate-decisions.js | askKindOfRelaxed | L320-336 | 宽松版 ask 分类（状态机用）：按路由特有词、批准特有词、路由否决词、目的词的优先级归类，未命中为 clarify | 顶层函数；不要求同时命中两词，避免 run_code 子调用路径误判；实际调用点 L424/L430/L743（注释所称 L436 已过时） |
| plugins/dsh-extra-plan/lib/gate-decisions.js | matchExactKind | L341-349 | 选中标签归一后与词表条目精确相等，命中返回其内部枚举值，未命中返回 null | 顶层函数；三类 match 的唯一判定口径，禁止 indexOf 子串推进（L250-252 注释） |
| plugins/dsh-extra-plan/lib/gate-decisions.js | matchRouteLabel | L351-358 | 把路由选择映射为内部枚举：direct/plan，无则回退 routeDisagree→disagree，未命中 null | 顶层函数；先路由特有词再路由否决词；依赖 matchExactKind |
| plugins/dsh-extra-plan/lib/gate-decisions.js | matchApprovalLabel | L360-367 | 把批准选择映射为内部枚举：approve/replan，无则回退 routeDisagree→disagree，未命中 null | 顶层函数；先批准特有词再共享的路由否决词；依赖 matchExactKind |
| plugins/dsh-extra-plan/lib/gate-decisions.js | matchPurposeLabel | L369-374 | 把规划目的选择映射为内部枚举：refine/redo；未命中返回 null | 顶层函数；依赖 matchExactKind，无回退词 |
| plugins/dsh-extra-plan/lib/gate-decisions.js | firstTextOfBlocks | L377-383 | 取 ContentBlock 数组中首个 text 块文本；非数组或无 text 块返回空串 | 顶层函数；防御空值/非对象块；被 parseAskResultData（L316）与 parseDispatchAskResult（L361）复用 |
| plugins/dsh-extra-plan/lib/gate-decisions.js | askResultTextIsDenied | L388-390 | 按文案判闸门拒绝：以 'Error: ' 开头且不属于宿主取消句 → true | 顶层函数；宿主取消句常量 HOST_ASK_CANCEL_TEXTS 在 L51（两条逐字常量） |
| plugins/dsh-extra-plan/lib/gate-decisions.js | parseAskResultData | L397-434 | 解析 ask 的 tool/result 事件：正常答复返回 answersLen/selected，闸门拒绝→denied，其余错误→error | 顶层函数；与本 ask 无关（信封不合法或 toolCallId 非字符串）返回 {callId: undefined}；isError:true 且无 data.error 时按文案区分 denied/error；调用点 L470 |
| plugins/dsh-extra-plan/lib/gate-decisions.js | parseDispatchAskResult | L443-471 | 解析嵌套 ask（tool/ptc-dispatch 事件，run_code 程序内嵌套调用）的结果：按 subCallId 与 isError 判定，返回 ok（answersLen/selected）、denied（闸门拒绝）、error（其它错误）或 callId undefined（subCallId 非字符串） | 与 parseAskResultData 同构，供 deriveFlowState 与组判定复用；入参为 dispatch 事件 data |
| plugins/dsh-extra-plan/lib/gate-decisions.js | resetStageState | L473-477 | 重置阶段层状态：purpose 回 none、clarified 与 approved 回 false（不动 route） | deriveFlowState 内部闭包；路由选择后与 purpose 生效时调用 |
| plugins/dsh-extra-plan/lib/gate-decisions.js | resetRouteState | L479-482 | 重置路由层状态：route 回 none，并级联调用 resetStageState 清空阶段层三字段 | deriveFlowState 内部闭包；取消/非通道码错误时调用 |
| plugins/dsh-extra-plan/lib/gate-decisions.js | applyAskOutcome | L484-514 | 唯一规范化结果推进入口：按 ask kind 与 result 更新 route/purpose/clarified/approved；denied 保持状态、取消清阶段、通道故障只置 channelBroken。 | deriveFlowState 同时接收普通 result 与 PTC dispatch 解码结果 |
| plugins/dsh-extra-plan/lib/gate-decisions.js | deriveFlowState | L524-568 | 四级锚点状态机：自最近一条人类消息后的事件推导 route（none/direct/plan）、clarified、approved、purpose（none/refine/redo）与 channelBroken；闸门拒绝不改字段，宿主取消/通道错误按码清四字段 | 纯函数；事件含 tool/call、dispatch、tool/result 三条路径 |
| plugins/dsh-extra-plan/lib/gate-decisions.js | catalogHasWriteTools | L580-585 | 判定工具目录是否含写工具：元素为字符串或 { name } 对象，命中 write 或 edit 即 true（非数组 false） | 目录形状判定回落分支；被 isReadOnlyChildByCatalog 调用 |
| plugins/dsh-extra-plan/lib/gate-decisions.js | isReadOnlyChildByCatalog | L588-590 | 只读子代理判定：目录非空且不含 write/edit 即 true，用于识别 reviewer/探查者角色 | 依赖 catalogHasWriteTools；目录折叠时改用 schemasHasWriteTools |
| plugins/dsh-extra-plan/lib/gate-decisions.js | schemasHasWriteTools | L595-600 | 判定真实工具集（tools.schemas）是否含 write/edit：有则可写（executor），无可写则只读（probe/reviewer）；非数组 false | 与 catalogHasWriteTools 同形状约定，用于 ptc 折叠目录时的角色判定 |
| plugins/dsh-extra-plan/lib/gate-decisions.js | schemasHasTool | L604-609 | 判定真实工具集是否含指定工具名（如 save_probe 信号：仅主会话与已认领探查者注册）；非数组 false | 形状约定同上 |
| plugins/dsh-extra-plan/lib/gate-decisions.js | catalogIsCollapsed | L616-621 | 判定 ptc 折叠目录：工具数组长度恰为 1 且唯一项是 run_code 即 true；折叠时目录不含 write/edit 不能推断只读，须改用真实工具集 | native 模式不折叠（both 已退出） |
| plugins/dsh-extra-plan/lib/gate-decisions.js | subagentProbeGateReason | L627-639 | 探查者委派闸门：仅 main 放行（0.2.1 委派工具参数表已无后台标志，原「必须后台」判定删除）；planner 返回「申请继续探查」，其它 child 用只读角色文案拒绝 | 直呼与 run_code 组判定共用 |
| plugins/dsh-extra-plan/lib/gate-decisions.js | shellMutationReason | L645-659 | 只读角色的 shell 写命令拒绝文案：planner/探查者/验收复核者三类角色命中 pwsh/bash 写形态时返回对应中文理由，其余（未知角色、非 shell、只读命令）返回 null | role 仅接受 planner/probe/reviewer；写形态判定复用 shell-mutation |
| plugins/dsh-extra-plan/lib/gate-decisions.js | plannerGateReason | L663-677 | planner 角色工具闸门：write/edit 拒绝 → shell 写命令拒绝 → job_output 走进同一闸门 → 非免费工具且预算超限则返回预算耗尽文案；不含 run_code，通过返回 null | 自 apply 提取的纯部分；run_code 由调用方处理 |
| plugins/dsh-extra-plan/lib/gate-decisions.js | childReadonlyGateReason | L681-689 | 只读子代理工具闸门：write/edit 按 probe 布尔选探查者/验收复核者文案拒绝 → shell 写命令 → job_output 查重；不含 run_code，通过返回 null | probe=true 时文案为「探查者只读」 |
| plugins/dsh-extra-plan/lib/gate-decisions.js | jobOutputGateReason | L694-716 | job_output 全角色闸门：禁 wait: true 前台等待；同一 session 内对同一 job_id 重复调用则拒绝（查重只读）；计数器或会话 id 缺失时跳过查重，通过返回 null | 写入侧唯一位点是 recordJobOutputCall |
| plugins/dsh-extra-plan/lib/gate-decisions.js | recordJobOutputCall | L722-734 | job_output 放行后记录计数器：工具名恰为 job_output、job_id 与会话 id 均为字符串且 counters 可用时惰性建 session Map 并写 jobId→1，返回 true；不满足即 false 且零副作用 | B3 收敛唯一写入位点；planner/只读 child/主会话共用，执行者豁免；返回值仅测试断言用 |
| plugins/dsh-extra-plan/lib/gate-decisions.js | pollGuardGateReason | L740-753 | 主会话 job_list/list_agents 防轮询闸门：同一锚点周期内该工具已调用过则返回「禁止轮询子代理状态」拒绝文案，首次或非两工具返回 null | 只读查重；vExec 无 agent（组判定成员）时跳过 |
| plugins/dsh-extra-plan/lib/gate-decisions.js | recordPollGuardCall | L755-766 | job_list/list_agents 放行后记录计数器：按 sessionId 建 Set 并加入工具名，返回 true；工具名不符、会话 id 非字符串或 counters 缺失返回 false | 唯一写入位点，仅主会话路径调用 |
| plugins/dsh-extra-plan/lib/gate-decisions.js | probeDisposalWarning | L774-777 | 探查者级联中止告警文案：remaining 为正整数时提示委派方会话销毁仍有未认领探查者委派、后台 job 可能已被宿主级联取消，并注明属已知引擎限制；否则返回 null | 触发点=agent/disposed 清理时仍有未认领计数 |
| plugins/dsh-extra-plan/lib/gate-decisions.js | mainGateReason | L787-917 | 主会话工具闸门总分派：按 ask→write/edit→cordis 只读→shell→planToolName→save_probe→委派族→job_kill/send_message→轮询守卫→run_code（depth+1）→job_output 顺序判定，返回拒绝文案或 null 放行 | gateRuntime 必填否则抛错；save_plan 已无显式分支，落兜底放行 |
| plugins/dsh-extra-plan/lib/gate-decisions.js | runCodeGroupDenyReason | L929-1013 | run_code 组判定：拆解代码为成员后逐成员按角色（main/planner/只读 child）走与直呼相同的闸门，再叠加多调用容错、planner 调用点上限与预算耗尽白名单，任一拒绝即聚合整组拒绝文案，全通过返回 null | 内部闭包 visit（L892-935）另有地图条目，不重复描述；role 缺省按 main |
| plugins/dsh-extra-plan/lib/gate-decisions.js | visit | L947-990 | run_code 组判定递归拆解器：主会话侧 ASK 返回值硬闸门 → 拆解成员 → 嵌套 run_code 原位展平（depth≥1 或参数不可解析则跳过，交运行时瀑布）→ 逐成员按角色分流闸门（subagent_probe／裸写／planner／只读 child／main）；组内任一拒绝即整体拒绝 | runCodeGroupGateReason 内部闭包 |
| plugins/dsh-extra-plan/lib/gate-decisions.js | aggregateRunCodeDenyReason | L1019-1031 | 把组判定的成员与拒绝项聚合为统一报错文本：header 给出组规模与触发计数（任一触发即整体拒绝），再逐行「- 标签: 子文案」，裸写与参数不可解析各有标签规则 | 标签序=展平后组员顺序；行 1004 为空行（文件末），非函数条目 |
| plugins/dsh-extra-plan/lib/gate-words.js | fail | L31-33 | 统一抛出 'extra-plan: config.gateWords ' 前缀的校验错误（错误前缀的唯一出口） |  |
| plugins/dsh-extra-plan/lib/gate-words.js | normalizeGateLabel | L36-38 | 推荐后缀归一（(Recommended)/（Recommended）/(推荐)/（推荐），四级后缀、英文大小写不敏感、前后空白），与 index.js normalizeLabel 同规则；仅供校验保留后缀用 |  |
| plugins/dsh-extra-plan/lib/gate-words.js | validateGateWords | L44-71 | 整组严格校验：非数组对象、键集合恰为 7 键、每值为非空字符串、首尾无空白、无 CR/LF、7 值两两不同、不以保留推荐后缀结尾；合法返回冻结副本，任何一条不合法即抛错（禁止部分接受） |  |
| plugins/dsh-extra-plan/lib/gate-words.js | bracketed | L73-75 | 选项集合文本拼接（「词」「词」…），与历史静态 OPTIONS_TEXT 逐字同构 |  |
| plugins/dsh-extra-plan/lib/gate-words.js | createGateRuntime | L85-114 | 运行时词表工厂：仅从入参派生 words/route/approval/purpose 冻结数组 + 三套 Set + options/confirm 插值片段 + variables（变量名→本次 apply 值）；无默认词表，缺失/非法即抛错 |  |
| plugins/dsh-extra-plan/lib/live-config.js | textOf | L37-39 | 非空字符串 trim 取值（空串/非串 → ''），用于路径与环境变量决议 |  |
| plugins/dsh-extra-plan/lib/live-config.js | envConfigPath | L41-43 | 环境变量 DSH_EXTRA_PLAN_CONFIG_PATH 取值（空/缺省 → ''，体检用它隔离生产现场配置） |  |
| plugins/dsh-extra-plan/lib/live-config.js | statStamp | L46-64 | fs.statSync 优先取 dev/ino/size/mtimeNs/ctimeNs，兼容回退 ino/size/mtimeMs/ctimeMs 拼变更 stamp；失败返回 { ok:false, reason } 不抛出 |  |
| plugins/dsh-extra-plan/lib/live-config.js | pick | L66-70 | 按 key 的标量类型收口（布尔含 webFetch／trim 字符串／正整数／工具呈现模式枚举），非法值一律回落 fallback（回退） |  |
| plugins/dsh-extra-plan/lib/live-config.js | describeProblems | L73-75 | （待补充） |  |
| plugins/dsh-extra-plan/lib/live-config.js | normalizedFallback | L77-84 | 归一 fallback（回退）Defaults：只取 8 个热读键，缺失键用内置兜底（2 项宿主行值仍由 settings 权威行/宿主装载期快照消费） |  |
| plugins/dsh-extra-plan/lib/live-config.js | createLiveConfig | L92-239 | 热读工厂：决议路径 + 构造期**无条件读盘一次**（文件真值作首拍基准，成功即记 stamp；失败回退 fallback（回退）Defaults + warnOnce）；返回 8 个 getter（取值先 refresh 再做 stamp 比对），宿主行设置不作为运行时 getter；creativeMode getter 保留且由 live-config 热读消费；不做监听/轮询/订阅 |  |
| plugins/dsh-extra-plan/lib/live-config.js | warnOnce | L103-107 | 同实例只告警一次（防抖）：不可用原因 + 生效路径 + 「回退到 apply 期快照兜底」 |  |
| plugins/dsh-extra-plan/lib/live-config.js | currentPath | L110-120 | 路径决议（构造期与每次取值现场调用）：显式 configPath → 环境变量 DSH_EXTRA_PLAN_CONFIG_PATH → resolver()（宿主 configEditor.documentPath）；resolver 缺失或抛出返回空串 |  |
| plugins/dsh-extra-plan/lib/live-config.js | readDiskValues | L125-152 | 读盘→解析→取值单一实现（构造期与 stamp 变化后的刷新共用）：readFileSync + **captureRowSettings(SETTING_DEFINITIONS)**，只按 8 项热读键的 states 覆盖、其余回落 fallback（回退）；未捕获到任何键视为取值失败；失败返回 { ok:false, reason } 不抛出 |  |
| plugins/dsh-extra-plan/lib/live-config.js | refresh | L178-213 | 变更检测主体：stamp 未变直接返回（零 IO 零解析）；变了才 readFileSync + captureRowSettings 解析，按 8 项热读键 states 覆盖 fallback（回退）；stat/解析失败回落 fallback（回退）并 warnOnce |  |
| plugins/dsh-extra-plan/lib/live-config.js | read | L215-218 | getter 取值通道：refresh() 后读当前 values[key] |  |
| plugins/dsh-extra-plan/lib/live-config.js | anchoredBootstrap | L222 | 读取 anchoredBootstrap 开关当前值：首轮极简工具+提示词；供 index.js pre-step 装配 bootstrap 收窄，热读即时生效。 |  |
| plugins/dsh-extra-plan/lib/live-config.js | creativeMode | L224 | 读取 creativeMode 开关当前值：dsh 官方创造模式；供 index.js C 矩阵隐藏集合与装配投影 hideCordis 消费，热读即时生效。 |  |
| plugins/dsh-extra-plan/lib/live-config.js | runcodeCatchGate | L226 | 读取 runcodeCatchGate 开关当前值：PTC 模式每个工具调用的 try/catch 闸门；供 index.js 组判定消费，热读即时生效。 |  |
| plugins/dsh-extra-plan/lib/live-config.js | crossProviderPlannerModel | L228 | 读取 crossProviderPlannerModel 开关当前值：是否跨提供方选模型；供 model-routing.js 双 resolver 入口消费，热读即时生效。 |  |
| plugins/dsh-extra-plan/lib/live-config.js | plannerModel | L230 | 读取 plannerModel 当前值：pro 规划默认模型名；供 model-routing.js 解析 planner 模型时消费，热读即时生效。 |  |
| plugins/dsh-extra-plan/lib/live-config.js | plannerPromptSuffix | L232 | 读取 plannerPromptSuffix 当前值：pro 规划额外引导后缀文本；供 index.js pre-step 拼接到任务末尾，热读即时生效。 |  |
| plugins/dsh-extra-plan/lib/live-config.js | exploreBudget | L234 | 读取 exploreBudget 当前值：pro 规划探查额度；供 index.js 预算文案、单实例子调用上限与组判定消费，热读即时生效。 |  |
| plugins/dsh-extra-plan/lib/live-config.js | otherAgentModel | L236 | 读取 otherAgentModel 当前值：其他子代理默认模型名；供 model-routing.js 非 planner 解析消费，热读即时生效。 |  |
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
| plugins/dsh-extra-plan/lib/preset-sync.js | loadOfficialAgentPreset | L37-51 | 从 workspace/官方 dsh 安装树加载 @deepseek-ai/dsh-agent-preset 默认导出；失败返回 undefined，由 apply 记录不阻断告警 |  |
| plugins/dsh-extra-plan/lib/preset-sync.js | contentHash | L68-76 | 预设资产内容哈希 |  |
| plugins/dsh-extra-plan/lib/preset-sync.js | pluginRows | L79-91 | plugins 行深度优先展平（唯一的遍历来源）：按当前数组顺序收集行对象，并递归展开 group 行 config 子行；非数组返回空数组。 |  |
| plugins/dsh-extra-plan/lib/preset-sync.js | visit | L81-88 | 递归遍历 plugins 行数组：字符串 id 推入 ids，遇 config 数组继续下钻（非数组直接返回） | pluginRowIds 内部闭包 |
| plugins/dsh-extra-plan/lib/preset-sync.js | pluginRowIds | L93-95 | 声明行 plugins 的行 id 集合（含 group 行 config 子行数组，扁平化；空串与非对象行跳过） |  |
| plugins/dsh-extra-plan/lib/preset-sync.js | declarationCoversAsset | L97-101 | 声明行是否仍承载本预设组合：行 id 集合覆盖 DECLARATION_ROW_IDS（extra-plan + 2 项宿主行 id），非数组一律 false |  |
| plugins/dsh-extra-plan/lib/preset-sync.js | plainObject | L103-105 | 判定非 null、非数组对象，供 config 层合并与 definition 校验复用 |  |
| plugins/dsh-extra-plan/lib/preset-sync.js | userWritableByRow | L107-123 | 用户可写位置表（行 id → 该行「用户可改」的 config 键集合）：唯一来源 = HOST_ROW_SETTING_DEFINITIONS.**projectionLocator**（声明行子行 tool-web.fetch / tool-presentation.mode —— 权威值已上移 settings 行，本体剥离只看声明行）与 GATE_WORDS_GROUP_DEFINITION（extra-plan.gateWords）；**与搬运写回清单严格同源，剥离表与写回清单必须恒等** |  |
| plugins/dsh-extra-plan/lib/preset-sync.js | push | L109-116 | 归一化 `config.` 前缀后的单键写入表（含点号的多级路径与空键一律忽略） | userWritableByRow 内部闭包 |
| plugins/dsh-extra-plan/lib/preset-sync.js | stripUserWritable | L125-136 | 剥离用户可写键（置 `__user__` 占位、保持键序与结构）得到「本体」视图；递归处理 group 行的 config 数组 |  |
| plugins/dsh-extra-plan/lib/preset-sync.js | declarationBodyMatchesAsset | L138-141 | 声明行「本体」是否与资产一致（剥离用户可写键后逐字比 JSON）；任一输入非数组 → 保守 true（不触发重建，信息不全时绝不改写现场） |  |
| plugins/dsh-extra-plan/lib/preset-sync.js | carryUserWritable | L143-167 | 从现有声明行抽出用户可写项（与剥离表同源）：显式迁移值缺省时的用户值来源；**旧副本缺席（source: absent）时靠它保住现场定制**（2 项宿主行 + 7 词） |  |
| plugins/dsh-extra-plan/lib/preset-sync.js | effectiveRowConfig | L169-180 | **权威值读取原语**：宿主 configuration() 行 → 生效 config（inherited 层 → Loader 行 declared config → profile override 浅合并，高优先层胜）；宿主 override 就是该行 config 本身，另兼容 override.config 行节点形状；无层 → null（不可判定） | settings.js 与 preset-sync.js 共用（同一实现，单点） |
| plugins/dsh-extra-plan/lib/preset-sync.js | readAuthoritySettings | L182-205 | **权威值上移读取**：settings 行 = 10 项设置的唯一权威落点 —— 宿主侧取 options.settingsValues（present=true），夹具侧由 options.readPatch() 文本经 captureRowSettings 捕获（rowPresent 区分「行缺席」与「行在但缺项」）；两者皆无 → { present:false, values:{} }，信息不全时不改写现场 |  |
| plugins/dsh-extra-plan/lib/preset-sync.js | findRowsById | L208-223 | 深度优先查找指定 id 的 raw patch/插件行，去重循环对象 | raw 迁移读取 |
| plugins/dsh-extra-plan/lib/preset-sync.js | visit | L211-220 | 递归遍历 plugins（含 group 子行），按剥离表抽出用户可写键值 → hostRowConfig / gateWords | carryUserWritable 内部闭包 |
| plugins/dsh-extra-plan/lib/preset-sync.js | validDefinitionValue | L225-227 | 以 settings descriptor validator 判定旧值是否合法 | 迁移辅助 |
| plugins/dsh-extra-plan/lib/preset-sync.js | captureLegacyValues | L229-252 | 从旧 preset body 按 sourceLocator 捕获十项合法值并记录 missing/ambiguous/invalid 状态 | 不求值 |
| plugins/dsh-extra-plan/lib/preset-sync.js | validGateWordsOrUndefined | L254-256 | 仅对旧迁移/兼容投影尝试整组校验，非法返回 undefined 供诊断/跳过；当前权威值走 resolveUnifiedConfig 的严格抛错路径。 |  |
| plugins/dsh-extra-plan/lib/preset-sync.js | legacyStateFromPlugins | L258-272 | 从旧声明 plugins 捕获合法十项兼容值与严格 gateWords；重复/非法保持状态诊断，不求值表达式。 |  |
| plugins/dsh-extra-plan/lib/preset-sync.js | readLegacyState | L275-329 | 安全解析旧公开投影与 preset-extra-plan body；分别记录来源、重复/非法诊断，保留 !!js 数据而不求值，供缺项迁移。 |  |
| plugins/dsh-extra-plan/lib/preset-sync.js | resolveUnifiedConfig | L332-400 | 解析 settings 权威值→合法旧投影→旧 body→`createDefaultSettings()` 默认快照；当前显式 gateWords 非法立即抛错并不生成替换 patch，记录每键来源与唯一全局行补齐计划。 | 默认值不读取作者 YAML |
| plugins/dsh-extra-plan/lib/preset-sync.js | restateSettingsConfig | L402-427 | 合并继承/当前全局 config 的合法十项与 gateWords，再应用指定 patch；不清除其它权威字段，非法 gateWords 整组抛错。 |  |
| plugins/dsh-extra-plan/lib/preset-sync.js | assertPresetDefinition | L431-445 | 严格校验纯 definition 元数据、17 条 plugins、三个 group 与 isolate=true；拒绝 Loader insert wrapper |  |
| plugins/dsh-extra-plan/lib/preset-sync.js | parsePresetDefinition | L447-449 | 用 !!js-preserving YAML schema 解析并校验生成 definition |  |
| plugins/dsh-extra-plan/lib/preset-sync.js | assetDefinition | L451-454 | 读取 preset-definition.generated.yml；缺失/坏资产立即抛错，不回写目标 |  |
| plugins/dsh-extra-plan/lib/preset-sync.js | assertRoleDefinition | L457-469 | 校验角色 definition 的元数据、首两行、tools 数量与末行 tool-presentation；异常不交给 adapter。 |  |
| plugins/dsh-extra-plan/lib/preset-sync.js | roleDefinitionOf | L471-477 | 按共享 `ROLE_IDS` 找对应角色 definition 资产并解析校验；顺序与生成器一致。 |  |
| plugins/dsh-extra-plan/lib/preset-sync.js | assetDefinitions | L480-482 | 返回主 definition 与按 `ROLE_IDS` 顺序排列的四个角色 definition 资产。 |  |
| plugins/dsh-extra-plan/lib/preset-sync.js | roleDefinitionsWithPresentation | L490-512 | 把权威 toolPresentationMode 派生进四个角色 definition 的 tool-presentation 行；行缺失或行数不等于 1 时原样返回，派生异常保留生成物默认值且不抛错 |  |
| plugins/dsh-extra-plan/lib/preset-sync.js | assetPlugins | L514-516 | 读取纯 definition 的 plugins；资产缺失或解析失败一律 undefined（旧 body 夹具仍可保守回退） |  |
| plugins/dsh-extra-plan/lib/preset-sync.js | readDefinitionGateWords | L518-522 | 从 definition 的 extra-plan 行读取并整组校验七个 gateWords |  |
| plugins/dsh-extra-plan/lib/preset-sync.js | projectHostRow | L530-537 | 宿主行派生原语：按 HOST_ROW_IDS/HOST_ROW_LEAF_KEYS 定位行与叶、经 validateSettingValue/normalizeSettingValue 校验后写入叶值；主 definition 与角色 definition 两条路径共用 |  |
| plugins/dsh-extra-plan/lib/preset-sync.js | cloneDefinitionWithProjection | L539-551 | 深拷贝 definition，仅重述两项宿主行投影与 gateWords；保留 raw !!js marker |  |
| plugins/dsh-extra-plan/lib/preset-sync.js | definitionWithProjection | L553-555 | 读取资产并生成供官方 adapter 使用的新 revision definition |  |
| plugins/dsh-extra-plan/lib/preset-sync.js | publicConfigOf | L557-560 | 兼容 configuration row wrapper 与直接 config 对象：前者取 effectiveRowConfig，后者取 plain object；其它值返回空对象 |  |
| plugins/dsh-extra-plan/lib/preset-sync.js | directProjectionFromLegacy | L562-573 | 将旧 preset body 的 tool-web/tool-presentation/gateWords 转成公开行支持字段 |  |
| plugins/dsh-extra-plan/lib/preset-sync.js | assertTemplateGateWords | L575-579 | 厂商模板整组前置校验：缺失/非法一律抛错（在 hash/idle 判定与任何目标目录动作之前，坏模板不得进入发布流程） |  |
| plugins/dsh-extra-plan/lib/preset-sync.js | readDeclaredPluginsFromPatch | L581-594 | 从 profile patch 文本旁路只读旧 id=preset-extra-plan 的 config.plugins；空文本、YAML 非法或未命中返回 undefined |  |
| plugins/dsh-extra-plan/lib/preset-sync.js | visit | L586-591 | 递归遍历 raw patch 对象，提取旧 preset-extra-plan plugins | readDeclaredPluginsFromPatch 内部 |
| plugins/dsh-extra-plan/lib/preset-sync.js | readLegacyPresetState | L596-599 | 从 profile 文本只读抽取旧 preset-extra-plan 支持投影，不删除旧行 |  |
| plugins/dsh-extra-plan/lib/preset-sync.js | syncPreset | L605-658 | 统一全局行同步：当前十项合法值优先，旧公开行/body/raw patch 只填缺项；两项宿主值与 gateWords 派生到纯 definition，再由 owner 交官方 adapter；无运行期台账。 | action 在全局行需要补齐或声明本体过时时为 `written`，稳态为 `idle` |
| plugins/dsh-extra-plan/lib/preset-sync.js | findEntry | L660-663 | 在 configuration() rows 中按 entry.options.id 匹配唯一 entry，供 activeLegacyRow 与 applyPlan 共用；非唯一或未命中返回 undefined |  |
| plugins/dsh-extra-plan/lib/preset-sync.js | applyPlan | L665-673 | 仅在 planned.settings 非 null 时定位唯一 dsh-extra-plan-settings 行并执行一次 configEditor.edit；settings 为空（包括仅声明/body 差异）为 no-op，active fence 防止停止期间写入，完整保留合法十项与 gateWords，不写旧公开/body 行 |  |
| plugins/dsh-extra-plan/lib/preset-sync.js | readRawPatch | L675-679 | 只读 configEditor.documentPath，供旧行迁移；不直接写 profile |  |
| plugins/dsh-extra-plan/lib/preset-sync.js | settingsValuesFromRows | L681-684 | 读取 dsh-extra-plan-settings 权威 config；缺行返回 undefined |  |
| plugins/dsh-extra-plan/lib/preset-sync.js | activeLegacyRow | L686-693 | 检测旧 preset-extra-plan 是否仍是活动 Loader entry，避免官方 adapter duplicate |  |
| plugins/dsh-extra-plan/lib/preset-sync.js | projectedAssetDefinition | L696-706 | （待补充） |  |
| plugins/dsh-extra-plan/lib/preset-sync.js | readPatch | L699 | 对象字面量中的 captured rawPatch 快照回调，供 definitionFromRows 传入统一配置解析；不直接读取 configEditor | mountPresetSync 内部 |
| plugins/dsh-extra-plan/lib/preset-sync.js | structuralValue | L708-719 | 结构指纹的稳定递归序列化：忽略 fiber/entry 动态对象并保留声明配置结构 | mountPresetSync 内部 |
| plugins/dsh-extra-plan/lib/preset-sync.js | rowStructureRecord | L721-740 | 提取非 settings 行的 id/name/非 settings config/禁用状态/override，settings 行直接排除 | structuralFingerprint 内部 |
| plugins/dsh-extra-plan/lib/preset-sync.js | structuralFingerprint | L743-761 | 生成不含 settings 行十项/gateWords 的结构指纹，并纳入 active legacy owner 状态；决定是否 handoff | settings-only no-remount 闸门 |
| plugins/dsh-extra-plan/lib/preset-sync.js | visit | L745-758 | （待补充） |  |
| plugins/dsh-extra-plan/lib/preset-sync.js | mountPresetSync | L763-963 | 分离 initialMount、settled-only/update 与 structuralHandoff：settings-only 不调用/等待/dispose/rebuild adapter；结构 handoff 独立，关闭等待 settled 与结构在途工作 | no-remount 硬合同；adapter failure 不阻断 profile sync |
| plugins/dsh-extra-plan/lib/preset-sync.js | disposeFiber | L776-779 | 安全 await adapter/fiber disposer；供 adapter 注册在途时关闭竞态回收候选资源，缺少 disposer 时保持幂等 no-op。 | mountPresetSync 内部 |
| plugins/dsh-extra-plan/lib/preset-sync.js | reportSettledError | L780-787 | 把 settled 回调异常交给独立 reporter，不污染 adapter 主异常路径 | mountPresetSync 内部闭包 |
| plugins/dsh-extra-plan/lib/preset-sync.js | reportAdapterError | L788-796 | （待补充） |  |
| plugins/dsh-extra-plan/lib/preset-sync.js | readState | L797-810 | 现场快照 configEditor rows、raw patch、legacyState、结构指纹与 owner，供 settled/structural 两条队列共享 | mountPresetSync 内部 |
| plugins/dsh-extra-plan/lib/preset-sync.js | snapshotOf | L811-821 | 从当前 settings row/raw patch/legacyState 解析最终完整 10 项与 gateWords 快照 | settled-only 输入 |
| plugins/dsh-extra-plan/lib/preset-sync.js | readPatch | L814 | 对象字面量中的 captured rawPatch 快照回调，将 run 已读的 patch 传入 syncPreset；不直接读取 configEditor | mountPresetSync 内部 |
| plugins/dsh-extra-plan/lib/preset-sync.js | enqueueSettled | L822-833 | 串行提交完整 10 项/gateWords settled 快照；回调失败只进入独立 settledError | settled-only 队列 |
| plugins/dsh-extra-plan/lib/preset-sync.js | settledSettingsUpdate | L834-842 | 从当前 rows/raw patch 解析最终完整快照并立即排入 profileSync，不触碰 adapter 生命周期 | settings-only 保存路径 |
| plugins/dsh-extra-plan/lib/preset-sync.js | enqueueStructural | L843-851 | 独立串行结构队列；结构 handoff 异常只告警，不撤销 settled/profile 同步 | adapter/structural 生命周期 |
| plugins/dsh-extra-plan/lib/preset-sync.js | mountOfficialAdapter | L856-881 | 仅首次启动或结构 handoff 调用官方 AgentPreset child.plugin；关闭竞态释放候选 fiber | settings-only 禁止进入 |
| plugins/dsh-extra-plan/lib/preset-sync.js | disposeCurrentAdapter | L882-886 | 结构 handoff/关闭时安全释放当前官方 adapter fiber；settled-only 不调用 | settings-only no-remount |
| plugins/dsh-extra-plan/lib/preset-sync.js | structuralHandoff | L887-907 | 等待先提交的 settled 快照后处理非 settings 结构/legacy owner transition，才允许 dispose/rebuild 官方 adapter | adapter failure 不阻断 QQBot |
| plugins/dsh-extra-plan/lib/preset-sync.js | readPatch | L896 | settled 回调前的 raw patch 快照读取闭包，不推导路径、不执行写入 | mountPresetSync 内部 |
| plugins/dsh-extra-plan/lib/preset-sync.js | apply | L898 | syncPreset 参数对象中的落盘回调：调用 applyPlan 写唯一 settings 行；不是 Cordis 插件入口 |  |
| plugins/dsh-extra-plan/lib/preset-sync.js | initialMount | L908-935 | 首次读取/迁移 settings、提交完整 settled 快照，再按 activeLegacyRow 保留旧 owner 或 register 官方 AgentPreset 一次 | 首次启动路径 |
| plugins/dsh-extra-plan/lib/preset-sync.js | readPatch | L917 | （待补充） |  |
| plugins/dsh-extra-plan/lib/preset-sync.js | apply | L919 | （待补充） |  |
| plugins/dsh-extra-plan/lib/preset-sync.js | settledOnlyUpdate | L936 | internal/update 的 settings-only 入口：只解析并入队最终快照，绝不调用 child.plugin/disposeFiber/等待 adapter | no-remount 闸门 |
| plugins/dsh-extra-plan/lib/preset-sync.js | dispose | L952-960 | 关闭 settings owner 的 update listener、等待在途队列并幂等释放 adapter fiber | mountPresetSync 内部 |
| plugins/dsh-extra-plan/lib/preset-yaml.js | loadYaml | L7-20 | 加载 js-yaml：先本模块 require，失败回落 %APPDATA% 下官方 dsh 包，仍失败抛原错误。 | 模块内部函数（未导出）；L22 模块加载期即调用 |
| plugins/dsh-extra-plan/lib/preset-yaml.js | resolve | L25 | js-yaml 自定义 tag 的标量判定：仅接受字符串标量，使 !!js 表达式按原文保留而不求值。 |  |
| plugins/dsh-extra-plan/lib/preset-yaml.js | construct | L26 | 把 !!js 标量的表达式文本包装成 { __jsExpr } 对象，供后续按对象识别与还原。 |  |
| plugins/dsh-extra-plan/lib/preset-yaml.js | predicate | L27 | 反向识别由本 tag 产生的对象：仅当是非空对象且 __jsExpr 为字符串时为真。 |  |
| plugins/dsh-extra-plan/lib/preset-yaml.js | represent | L28 | 把 { __jsExpr } 包装对象拆回原始表达式字符串，供 YAML 输出时还原 !!js 标量。 |  |
| plugins/dsh-extra-plan/lib/preset-yaml.js | parsePresetYaml | L45-48 | 用扩展 js 标量标签的 YAML schema 解析预设文本，返回首文档对象（多文档流只取第一文档，空流返回 undefined）。 | 导出函数；作者源 agent.cordis.yml 有两文档，角色侧另走 secondDocumentOf |
| plugins/dsh-extra-plan/lib/preset-yaml.js | hasOwn | L50-52 | 安全判定值为对象且含指定自有属性，返回布尔；null 或非对象直接 false。 | 模块内部工具函数（未导出） |
| plugins/dsh-extra-plan/lib/preset-yaml.js | pathParts | L54-56 | 把点分路径字符串拆成非空片段数组。 | 模块内部工具函数（未导出） |
| plugins/dsh-extra-plan/lib/preset-yaml.js | readPath | L58-65 | 按点分路径逐级读取对象，返回 exists 与 value；任一环缺键即 exists 为 false。 | 导出函数 |
| plugins/dsh-extra-plan/lib/preset-yaml.js | collectRowsById | L67-82 | （待补充） |  |
| plugins/dsh-extra-plan/lib/preset-yaml.js | visit | L70-79 | 按 id 深度优先遍历文档对象（同引用去重防环），收集所有 id === rowId 的节点并按出现顺序返回 | rowsById 内部闭包 |
| plugins/dsh-extra-plan/lib/preset-yaml.js | rowsById | L85-87 | 深度优先遍历文档收集所有 id 等于 rowId 的节点，按出现顺序返回数组（同引用去重防环）。 | 模块内部函数（未导出）；其内部闭包 visit 地图已有描述 |
| plugins/dsh-extra-plan/lib/preset-yaml.js | rowsByIdWithPath | L90-97 | （待补充） |  |
| plugins/dsh-extra-plan/lib/preset-yaml.js | resolveLocator | L99-112 | 解析单个 locator：多命中判 ambiguous，缺行或缺叶判 missing，唯一命中返回 ok 及行与值。 | 模块内部函数（未导出） |
| plugins/dsh-extra-plan/lib/preset-yaml.js | locatorFor | L114-119 | 取描述符的 sourceLocator；无该字段时把入参本身当裸 locator 返回。 | 模块内部函数（未导出） |
| plugins/dsh-extra-plan/lib/preset-yaml.js | aliasesFor | L121-126 | 取描述符的 locatorAliases 数组；非数组或缺省时返回空数组。 | 模块内部函数（未导出） |
| plugins/dsh-extra-plan/lib/preset-yaml.js | resolveSetting | L133-146 | 主 locator 与别名逐个解析，歧义或多命中判 ambiguous，全缺失判 missing，唯一 ok 即返回。 | 导出函数；L118-121 注释已说明三态语义 |
| plugins/dsh-extra-plan/lib/preset-yaml.js | resolveTemplateSettingDefault | L148-163 | 解析模板文本并定位设置项；定位非 ok 或值非法即抛错，否则返回规范化默认值。 | 导出函数；不启用别名 |
| plugins/dsh-extra-plan/lib/preset-yaml.js | captureSettings | L169-185 | 按 sourceLocator 逐项捕获设置，返回文档、captured 值与缺失/歧义/非法三态表。 | 导出函数；states 四态为 captured/missing/ambiguous/invalid，仅 captured 进 values；definitions 缺省用 SETTING_DEFINITIONS |
| plugins/dsh-extra-plan/lib/preset-yaml.js | hostRowDefaultsFromTemplate | L188-202 | 从模板捕获 2 项宿主行设置，缺项或解析失败回落 `DEFAULT_SETTINGS` 相应值；整体异常也回落。 | 导出函数；兼容 helper，不作为 settings/sync 正常作者源 |
| plugins/dsh-extra-plan/lib/preset-yaml.js | captureRowSettings | L212-228 | 按 settings 行定位捕获权威值，返回 values、states 与 rowPresent（该行是否存在）。 | 导出函数；definitions 缺省用 EXTRA_PLAN_SETTING_DEFINITIONS |
| plugins/dsh-extra-plan/lib/preset-yaml.js | migrationEntryName | L231-234 | （待补充） |  |
| plugins/dsh-extra-plan/lib/preset-yaml.js | migrationEntryConfig | L236-242 | （待补充） |  |
| plugins/dsh-extra-plan/lib/preset-yaml.js | migrationManagedConfig | L244-254 | （待补充） |  |
| plugins/dsh-extra-plan/lib/preset-yaml.js | migrationComparable | L256-259 | （待补充） |  |
| plugins/dsh-extra-plan/lib/preset-yaml.js | migrationHash | L261 | （待补充） |  |
| plugins/dsh-extra-plan/lib/preset-yaml.js | migrationIgnorable | L262 | （待补充） |  |
| plugins/dsh-extra-plan/lib/preset-yaml.js | migrationIndent | L263 | （待补充） |  |
| plugins/dsh-extra-plan/lib/preset-yaml.js | migrationScalarToken | L265-270 | （待补充） |  |
| plugins/dsh-extra-plan/lib/preset-yaml.js | migrationRowStarts | L272-278 | （待补充） |  |
| plugins/dsh-extra-plan/lib/preset-yaml.js | migrationRowId | L280-286 | （待补充） |  |
| plugins/dsh-extra-plan/lib/preset-yaml.js | planCanonicalSettingsMigration | L289-352 | （待补充） |  |
| plugins/dsh-extra-plan/lib/preset-yaml.js | findPluginsRow | L354-365 | 在 plugins 数组（含 group 行 config 子数组）内按 id 深度优先找子行，找不到返回 null。 | 导出函数 |
| plugins/dsh-extra-plan/lib/preset-yaml.js | readProjectedValue | L372-391 | 按 projectionLocator 在 plugins 内定位子行与叶键，缺失或值非法一律返回 undefined。 | 导出函数；只服务 2 项宿主行设置 |
| plugins/dsh-extra-plan/lib/preset-yaml.js | restatePluginsRow | L394-401 | 深拷贝 plugins 后重述目标子行的指定 config 键（键覆盖非深合并），目标行不存在返回 null。 | 导出函数 |
| plugins/dsh-extra-plan/lib/preset-yaml.js | inlineCommentIndex | L403-421 | 扫描一行值，跳过单双引号内内容，返回行内注释 # 起始下标；无注释返回 -1。 | 模块内部函数（未导出）；被 parseRowId、replaceLineScalar、isBlockScalarLine 共用 |
| plugins/dsh-extra-plan/lib/preset-yaml.js | lineIndent | L423-426 | 返回行首空格数，即该行的缩进量。 | 模块内部工具函数（未导出） |
| plugins/dsh-extra-plan/lib/preset-yaml.js | withoutCr | L428-430 | 去掉行尾回车符，其余内容不变。 | 模块内部工具函数（未导出） |
| plugins/dsh-extra-plan/lib/preset-yaml.js | parseRowId | L432-444 | 从「- id: 值」样式的行解析出行 id，处理引号转义与行内注释；不匹配返回 null。 | 模块内部函数（未导出） |
| plugins/dsh-extra-plan/lib/preset-yaml.js | parseMapKey | L446-450 | 解析非数组项的「key:」映射行，返回键名与缩进；不匹配返回 null。 | 模块内部函数（未导出） |
| plugins/dsh-extra-plan/lib/preset-yaml.js | rowEnd | L452-460 | 从起始行找本行块结束下标：首个非空非注释且缩进不大于本行的行；到末尾返回总行数。 | 模块内部函数（未导出） |
| plugins/dsh-extra-plan/lib/preset-yaml.js | findDirectKey | L462-480 | 按区间内首个子键缩进定层，找指定直接子键所在行号；找不到返回 null。 | 模块内部函数（未导出） |
| plugins/dsh-extra-plan/lib/preset-yaml.js | textPathLine | L482-494 | 沿点分路径逐段下钻文本行，返回末段键所在行号；任一段缺失返回 null。 | 模块内部函数（未导出） |
| plugins/dsh-extra-plan/lib/preset-yaml.js | findTextLocatorMatches | L496-508 | 文本扫描：按 rowId 定位行块、再按路径定位叶行，返回行首、行尾与叶行号的匹配列表。 | 导出函数 |
| plugins/dsh-extra-plan/lib/preset-yaml.js | yamlString | L510-514 | 序列化为 YAML 字符串：单引号包裹并翻倍转义单引号，含换行改用 JSON 双引号。 | 模块内部函数（未导出） |
| plugins/dsh-extra-plan/lib/preset-yaml.js | serializeScalar | L516-520 | 按 scalarType 序列化标量：布尔转 true/false，整数转数字串，其余走字符串化。 | 导出函数 |
| plugins/dsh-extra-plan/lib/preset-yaml.js | escapeRegex | L522-524 | 转义字符串中的正则元字符，返回可安全拼进 RegExp 的文本。 | 模块内部工具函数（未导出） |
| plugins/dsh-extra-plan/lib/preset-yaml.js | replaceLineScalar | L526-538 | 替换某个「key:」行的标量值，保留缩进、行尾空格与行内注释；键不匹配返回 null。 | 模块内部函数（未导出） |
| plugins/dsh-extra-plan/lib/preset-yaml.js | isBlockScalarLine | L540-550 | 判定该行是否为指定键的块标量（值以竖线或大于号开头），返回布尔。 | 模块内部函数（未导出） |
| plugins/dsh-extra-plan/lib/preset-yaml.js | scalarTypeFor | L552-557 | 取描述符的 scalarType；未定义时按 string 处理。 | 模块内部函数（未导出） |
| plugins/dsh-extra-plan/lib/preset-yaml.js | patchYamlScalar | L563-589 | 保格式定点改写标量：无命中判 missing，多命中且未允许取首判 ambiguous，成功返回新文本与行号。 | 导出函数；L545-548 注释声明仅用于迁移期文本改写、不写文件 |
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
| plugins/dsh-extra-plan/lib/qqbot-settings-sync.js | canonicalSnapshot | L222-227 | 按固定 MANAGED_KEYS/GATE_KEYS 顺序构造 10 项设置与 7 项 gateWords 规范快照，供哈希和比较。 |  |
| plugins/dsh-extra-plan/lib/qqbot-settings-sync.js | stableSnapshotHash | L230-233 | 校验并冻结完整 10+7 快照，按稳定键序列计算 SHA-256；同值保存与同步使用该指纹。 |  |
| plugins/dsh-extra-plan/lib/qqbot-settings-sync.js | managedSnapshotHashFromConfig | L235-241 | 从配置提取完整托管键并校验 gateWords；不完整/非法返回 null，否则复用规范快照哈希。 |  |
| plugins/dsh-extra-plan/lib/qqbot-settings-sync.js | patchDiagnostic | L243-271 | 只读计算 patch/备份的 bytes、mtime、SHA 及托管快照哈希；缺失或解析异常保留 null 诊断，不抛出。 |  |
| plugins/dsh-extra-plan/lib/qqbot-settings-sync.js | strictAssociation | L273-275 | 仅接受 associated=true 且 saveRunId 为非空字符串，作为请求与终态匹配的严格关联门。 |  |
| plugins/dsh-extra-plan/lib/qqbot-settings-sync.js | splitText | L277-283 | 按原始 EOL 拆分 patch 文本 |  |
| plugins/dsh-extra-plan/lib/qqbot-settings-sync.js | joinText | L285-288 | 按原始 EOL/尾换行重组 patch 文本 |  |
| plugins/dsh-extra-plan/lib/qqbot-settings-sync.js | indentOf | L290-292 | 计算行首缩进宽度 |  |
| plugins/dsh-extra-plan/lib/qqbot-settings-sync.js | ignorable | L294-297 | 识别空白/注释行 |  |
| plugins/dsh-extra-plan/lib/qqbot-settings-sync.js | rootSequenceInfo | L299-317 | 识别顶层 YAML 序列项边界 |  |
| plugins/dsh-extra-plan/lib/qqbot-settings-sync.js | keyMatch | L319-322 | 识别简单 YAML map 键行 |  |
| plugins/dsh-extra-plan/lib/qqbot-settings-sync.js | targetKind | L324-331 | 识别 direct/override settings 目标行 |  |
| plugins/dsh-extra-plan/lib/qqbot-settings-sync.js | configHolder | L333-335 | 取得目标行 config 所属 map |  |
| plugins/dsh-extra-plan/lib/qqbot-settings-sync.js | locateConfigLine | L337-350 | 定位唯一可证明的 config 行边界 |  |
| plugins/dsh-extra-plan/lib/qqbot-settings-sync.js | blockEndForChild | L352-358 | 按缩进确定子块结束位置 |  |
| plugins/dsh-extra-plan/lib/qqbot-settings-sync.js | directKeyLines | L360-367 | 定位 config 直接子键行并检测重复 |  |
| plugins/dsh-extra-plan/lib/qqbot-settings-sync.js | configChildIndent | L369-379 | 推导 config 直接子键缩进 |  |
| plugins/dsh-extra-plan/lib/qqbot-settings-sync.js | scalar | L381-385 | 把设置值渲染为安全 YAML 标量 |  |
| plugins/dsh-extra-plan/lib/qqbot-settings-sync.js | renderedConfig | L387-399 | 渲染十项与完整 gateWords config |  |
| plugins/dsh-extra-plan/lib/qqbot-settings-sync.js | renderedRow | L402-411 | 渲染缺失目标的最小 override 行 |  |
| plugins/dsh-extra-plan/lib/qqbot-settings-sync.js | spaces | L403 | 生成指定数量空格 |  |
| plugins/dsh-extra-plan/lib/qqbot-settings-sync.js | parsedTarget | L413-422 | 解析顶层目标唯一性与冲突 |  |
| plugins/dsh-extra-plan/lib/qqbot-settings-sync.js | configState | L424-441 | 校验目标 config map 与可局部改写边界 |  |
| plugins/dsh-extra-plan/lib/qqbot-settings-sync.js | managedProjection | L443-447 | 提取已托管设置键 |  |
| plugins/dsh-extra-plan/lib/qqbot-settings-sync.js | equalManaged | L449-458 | 深比较十项与 gateWords 是否已收敛 |  |
| plugins/dsh-extra-plan/lib/qqbot-settings-sync.js | reparseAndCheck | L460-469 | 落盘前后安全解析并验证唯一目标深等 |  |
| plugins/dsh-extra-plan/lib/qqbot-settings-sync.js | existingNameState | L471-488 | 检查目标块规范 name 的缺失、唯一、重复与错名状态；仅可证明缺失时返回 missing，否则返回 canonical 或 conflict。 |  |
| plugins/dsh-extra-plan/lib/qqbot-settings-sync.js | applyExistingTarget | L490-552 | 按已证明边界补齐规范 name，并只替换托管 config 键；保留未知文本，重解析核对后返回 planned/idempotent 或冲突。 |  |
| plugins/dsh-extra-plan/lib/qqbot-settings-sync.js | appendTarget | L554-566 | 在合法顶层数组末尾追加最小 override |  |
| plugins/dsh-extra-plan/lib/qqbot-settings-sync.js | scalarTokenEquals | L568-571 | 比较去行内注释和空白后的 YAML 标量，兼容裸值、JSON 双引号和单引号形式。 |  |
| plugins/dsh-extra-plan/lib/qqbot-settings-sync.js | duplicateTargetNameText | L573-601 | 仅在首行形态与直接 id 能证明的目标块中识别 name 重复，为目标解析失败提供 duplicate-name 诊断。 | 无关 override 或普通行的嵌套 id 不作目标证明，其余语法错误保留原始 invalid-yaml 原因。 |
| plugins/dsh-extra-plan/lib/qqbot-settings-sync.js | planQqbotSettingsPatch | L604-629 | 生成局部 YAML 计划且不写文件 |  |
| plugins/dsh-extra-plan/lib/qqbot-settings-sync.js | writeExclusive | L631-639 | 以 wx 写入并 fsync 文件 |  |
| plugins/dsh-extra-plan/lib/qqbot-settings-sync.js | nextFilePath | L641-647 | 生成同目录排他临时/备份路径 |  |
| plugins/dsh-extra-plan/lib/qqbot-settings-sync.js | hook | L649-651 | 运行可注入故障钩子 |  |
| plugins/dsh-extra-plan/lib/qqbot-settings-sync.js | writeQqbotSettingsPatch | L654-737 | 临时文件→备份→rename→终验/恢复的安全提交 |  |
| plugins/dsh-extra-plan/lib/qqbot-settings-sync.js | fingerprint | L739-741 | 按根路径、来源与完整快照生成去重指纹 |  |
| plugins/dsh-extra-plan/lib/qqbot-settings-sync.js | resultForPath | L743-752 | 合并路径来源与结构化状态字段 |  |
| plugins/dsh-extra-plan/lib/qqbot-settings-sync.js | webDocumentPath | L755-760 | 优先从绝对 web/cordis.patch.yml documentPath 解析；无效时使用已证明 profilesRoot/web 路径，再回原值。 |  |
| plugins/dsh-extra-plan/lib/qqbot-settings-sync.js | createQqbotSettingsSynchronizer | L762-891 | 创建串行 profile 同步队列并汇总状态 |  |
| plugins/dsh-extra-plan/lib/qqbot-settings-sync.js | emit | L768-773 | 更新同步状态并隔离回调异常 |  |
| plugins/dsh-extra-plan/lib/qqbot-settings-sync.js | execute | L774-857 | 解析路径、扫描双锚点并逐 profile 持久化 |  |
| plugins/dsh-extra-plan/lib/qqbot-settings-sync.js | finish | L783-795 | 汇总请求元数据、时间和同步终态；terminalMatch 仅在严格关联、快照哈希存在且 status=synced 时为真，再发出 profile 同步结果。 |  |
| plugins/dsh-extra-plan/lib/qqbot-settings-sync.js | enqueue | L858-885 | 按指纹排队同步请求且等待完成 |  |
| plugins/dsh-extra-plan/lib/qqbot-settings-sync.js | getState | L889 | 读取最新 profile 同步状态 |  |
| plugins/dsh-extra-plan/lib/run-code-scanner.js | maskCodeLiteralsAndComments | L3-196 | 等长遮蔽字符串、模板纯文本、正则与完整行/块注释并保留 CR/LF；模板插值继续扫描，属性关键词及函数表达式后的除法不被误当正则。 | 行注释不重置此前表达式上下文；遮蔽索引供括号配平与调用点扫描对齐。 |
| plugins/dsh-extra-plan/lib/run-code-scanner.js | isIdentifierStart | L12 | 识别 ASCII 标识符起始字符，供词法状态机判断工具/单词边界。 |  |
| plugins/dsh-extra-plan/lib/run-code-scanner.js | isIdentifierPart | L13 | 识别 ASCII 标识符后续字符，供词法状态机判断正则后缀与工具名边界。 |  |
| plugins/dsh-extra-plan/lib/run-code-scanner.js | blank | L14-18 | 将指定区间的非换行字符遮蔽为空格，保持原长度与 CR/LF 对齐。 |  |
| plugins/dsh-extra-plan/lib/run-code-scanner.js | scanString | L19-30 | 从引号起扫描字符串并遮蔽转义与内容，返回闭合后的索引或文本末尾。 |  |
| plugins/dsh-extra-plan/lib/run-code-scanner.js | scanRegex | L31-51 | 按转义和字符类边界遮蔽正则字面量及 flags，返回正则结束索引。 |  |
| plugins/dsh-extra-plan/lib/run-code-scanner.js | scanTemplate | L52-68 | 遮蔽模板字面量文本；遇 ${...} 递归扫描实际表达式，保持行号和索引对齐。 |  |
| plugins/dsh-extra-plan/lib/run-code-scanner.js | scanCode | L69-193 | 维护表达式、属性名、控制括号与函数声明/表达式体上下文，区分正则与除法；模板表达式递归扫描，注释保留此前词法状态。 |  |
| plugins/dsh-extra-plan/lib/run-code-scanner.js | sliceBalancedArgs | L202-218 | 从调用括号起在遮蔽文本上配平括号并从原文切出参数片段，未闭合时取文末。 | 返回 { closeIdx, innerText }，保留原始参数文本供安全解析。 |
| plugins/dsh-extra-plan/lib/run-code-scanner.js | hasDynamicRunCodeAccess | L222-272 | 标记无法静态证明的 tools[...] 访问；未转义 ASCII 静态方括号键允许连字符，按遮蔽文本定位闭括号及 ] 后行/块注释后的调用；外层静态调用的参数继续扫描，不遮蔽内层动态访问。 | 真正动态键、拼接、转义或无法配平仍判 dynamic；由调用方按现有运行时合同处理，本函数不直接拒绝。 |
| plugins/dsh-extra-plan/lib/run-code-scanner.js | isIdentifierPart | L225 | 判定 tools[...] 动态访问中的标识符边界字符。 |  |
| plugins/dsh-extra-plan/lib/run-code-scanner.js | skipWhitespace | L226-230 | 从给定位置跳过连续空白字符，返回首个非空白字符的索引。 | hasDynamicRunCodeAccess 内部闭包，在遮蔽文本上处理空白或中括号边界。 |
| plugins/dsh-extra-plan/lib/run-code-scanner.js | bracketEndOf | L231-241 | 从 '[' 起配平中括号，返回匹配的闭括号位置，未闭合返回 -1。 | hasDynamicRunCodeAccess 内部闭包，在遮蔽文本上处理空白或中括号边界。 |
| plugins/dsh-extra-plan/lib/run-code-scanner.js | collectRunCodeSites | L274-341 | 收集静态与动态 tools 调用站点，保留起止位置、参数原文与 name；未转义 ASCII 静态方括号工具名允许连字符，] 后行/块注释按遮蔽文本定位；外层参数中的内层调用也收录。 | 真正动态键、拼接、转义或无法证明静态键的调用仍计入站点并保留 name=undefined；未知 name 站点不丢弃，动态性由 hasDynamicRunCodeAccess 标记。非 ask 静态属性别名若没有直接调用点仍沿用运行时兜底，不宣称所有别名均被预审拒绝。 |
| plugins/dsh-extra-plan/lib/run-code-scanner.js | isIdentifierStart | L278 | 判定 tools.静态成员名的起始字符。 |  |
| plugins/dsh-extra-plan/lib/run-code-scanner.js | isIdentifierPart | L279 | 判定 tools.静态成员名和标识符边界的后续字符。 |  |
| plugins/dsh-extra-plan/lib/run-code-scanner.js | skipWhitespace | L280-284 | 跳过工具访问语法间的连续空白，定位下一个有效字符。 |  |
| plugins/dsh-extra-plan/lib/run-code-scanner.js | bracketEndOf | L285-295 | 在遮蔽文本上配平 tools[...] 的中括号，找不到闭括号返回 -1。 |  |
| plugins/dsh-extra-plan/lib/run-code-static.js | runCodeTextOf | L22-26 | 提取 run_code 的 code 参数文本 |  |
| plugins/dsh-extra-plan/lib/run-code-static.js | codeMutationHints | L29-37 | 对文本扫描 RUNCODE_MUTATION_HINTS 返回命中写暗示 id 列表 |  |
| plugins/dsh-extra-plan/lib/run-code-static.js | parseStaticLiteral | L41-175 | 安全静态 literal 入口：JSON.parse 快路径 + 无执行 JS literal 子集；重复/污染键与动态语法拒绝并返回 argsText |  |
| plugins/dsh-extra-plan/lib/run-code-static.js | fail | L52 | 静态 literal 解析失败控制流抛错，不执行输入文本 |  |
| plugins/dsh-extra-plan/lib/run-code-static.js | skipWhitespace | L53-55 | 跳过安全 literal 中允许的空白字符 |  |
| plugins/dsh-extra-plan/lib/run-code-static.js | isIdentifierStart | L56 | 判断对象标识符键起始字符 |  |
| plugins/dsh-extra-plan/lib/run-code-static.js | isIdentifierChar | L57 | 判断标识符键/布尔 null 边界字符 |  |
| plugins/dsh-extra-plan/lib/run-code-static.js | parseString | L59-99 | 解析单/双引号字符串与有限转义，不接受模板插值 |  |
| plugins/dsh-extra-plan/lib/run-code-static.js | parseValue | L101-165 | 递归解析对象/数组、字符串、布尔/null 与有限数字，拒绝调用/成员/污染键 |  |
| plugins/dsh-extra-plan/lib/run-code-static.js | createRunCodeStatic | L177-571 | 创建 run_code 静态 helper 闭包，仅注入 askTool 与当前 PTC dispatch-start 判定 |  |
| plugins/dsh-extra-plan/lib/run-code-static.js | decomposeRunCode | L190-228 | 静态拆解 run_code 的 code 为工具成员组（含裸写伪工具） |  |
| plugins/dsh-extra-plan/lib/run-code-static.js | addMember | L197-206 | 成员去重添加（decomposeRunCode 内部闭包） |  |
| plugins/dsh-extra-plan/lib/run-code-static.js | markRange | L207-209 | 标记已占用区间（decomposeRunCode 内部闭包） |  |
| plugins/dsh-extra-plan/lib/run-code-static.js | runCodeCatchGateReason | L234-305 | run_code 多调用容错闸门：tools.* 调用点≥2 时要求每点独立容错，不足即教学式拒绝（单调用豁免；嵌套展平） |  |
| plugins/dsh-extra-plan/lib/run-code-static.js | within | L261 | 调用点区间包含判定（site.start 是否落在 a、b 之间）：把调用点归入 try 块或数组实参区间 |  |
| plugins/dsh-extra-plan/lib/run-code-static.js | askUserQuestionReturnGateReason | L309-504 | 主会话 run_code 的 ask 返回链闸门：静态 MCP 方括号调用不再误串 ask；真正 ask 仅允许直接 return-await，或变量接收后在紧随的顶层 return 中按标识符边界返回；直接 ask 的参数可动态。 | 真正 ask 的只调用、只赋值、别名/动态访问、.then 或函数包装仍拒绝；非 ask 静态属性别名缺直接调用点时沿用运行时兜底，不宣称所有别名均被预审拒绝。 |
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
| plugins/dsh-extra-plan/lib/runtime-lifecycle.js | createRuntimeLifecycle | L4-147 | per-apply 运行时生命周期：save 工具注册、探查名额认领、子调用计数与拒绝记录的共享容器，返回 API | 顶层导出工厂，依赖全部经 options 显式注入，内部状态为 WeakSet/Map |
| plugins/dsh-extra-plan/lib/runtime-lifecycle.js | registerTool | L11-40 | 按 agent 单次注册工具定义：查重后注册；tools 服务缺失或已存在/永久非法时只告警并记账，不重试 | 工厂内闭包，被 registerSavePlan/registerSaveProbe 转调 |
| plugins/dsh-extra-plan/lib/runtime-lifecycle.js | registerSavePlan | L53 | 以 save_plan 定义注册工具的一次性薄封装 | 内部闭包，转调 registerTool（savePlanRegistered WeakSet 去重） |
| plugins/dsh-extra-plan/lib/runtime-lifecycle.js | registerSaveProbe | L54 | 以 save_probe 定义注册工具的一次性薄封装 | 内部闭包，转调 registerTool（saveProbeRegistered WeakSet 去重） |
| plugins/dsh-extra-plan/lib/runtime-lifecycle.js | isProberRole | L60-73 | 角色身份判据：读 session.header.agentPreset 并与共享 `PROBER_PRESET_ID` 比较；header 缺失或取值非字符串时吞错返回 false，供 save_probe 注册使用（F1：认领表跨实例不可见，故以角色身份兜底） | 角色常量不承载权限策略 |
| plugins/dsh-extra-plan/lib/runtime-lifecycle.js | probeClaimFor | L75-92 | 探查子会话认领放行名额：非普通子代理、planner、无父会话或带写工具即拒；成功扣减名额并返回 true | 内部闭包。名额由 index.js L867 recordProbeClaim 产生，此处消费（pending-1，归零即删键） |
| plugins/dsh-extra-plan/lib/runtime-lifecycle.js | recordProbeClaim | L94-96 | 主会话放行 subagent_probe 时为其记一个待认领名额，同会话累加 | 内部闭包，写 pendingProbeClaims（Map<parentSessionId, count>） |
| plugins/dsh-extra-plan/lib/runtime-lifecycle.js | noteRunCodeSubCall | L98-105 | 按 rootCallId 记 run_code 子调用数：达上限或 rootCallId 缺失返回超限文案，否则加一返回 null | 内部闭包，cap 由 index.js L398 以 exploreBudget() 传入 |
| plugins/dsh-extra-plan/lib/runtime-lifecycle.js | recordRunCodeDeny | L107-118 | 记录 run_code 子调用被拒原因：非子调用、原因为空或无会话 id 不记；按会话与根调用 id 去重累计 | 内部闭包，写 runCodeDenyRecords（Map<sessionId, Map<rid, Set<reason>>>） |
| plugins/dsh-extra-plan/lib/runtime-lifecycle.js | takeRunCodeDenyRecords | L120-128 | 取出并删除某会话某根调用的拒绝原因集合（消费即清），无记录或参数非法返回 undefined | 内部闭包，消费方 index.js L947-963 命中原因时改写失败结果文本 |
| plugins/dsh-extra-plan/lib/runtime-lifecycle.js | disposeSession | L130-138 | 会话销毁时清空该 sessionId 在名额、拒绝记录、各类计数与通知中的残留条目 | 内部闭包，只清 7 个 Map，不清 WeakSet（按 agent 键自然回收） |
| plugins/dsh-extra-plan/lib/runtime-lifecycle.js | pendingProbeCount | L145 | 读取指定会话尚未认领的探查计数：无记录时返回 0。 |  |
| plugins/dsh-extra-plan/lib/runtime-static.js | causeChainOf | L3-15 | 按显式 depth 提取错误 cause 链 |  |
| plugins/dsh-extra-plan/lib/save-contract.js | sanitizeTaskName | L4-12 | 任务名净化（截断/去非法字符） |  |
| plugins/dsh-extra-plan/lib/save-contract.js | timestampOf | L15-18 | 生成本地 yyyyMMddHHmmss 部分，供公共 timestamp 与 artifact base 使用 |  |
| plugins/dsh-extra-plan/lib/save-contract.js | pad | L16 | timestamp 内部数字补零 |  |
| plugins/dsh-extra-plan/lib/save-contract.js | timestamp | L20-22 | 秒级公共时间戳 yyyyMMddHHmmss（仅保证格式可读；工件唯一基座见 saveArtifactBase） |  |
| plugins/dsh-extra-plan/lib/save-contract.js | sessionTagOf | L26-28 | 会话标识段（去分隔符后取前 8 位字母数字） |  |
| plugins/dsh-extra-plan/lib/save-contract.js | saveArtifactBase | L34-49 | 统一生成任务名+sessionTag+毫秒+process.pid+进程序号的碰撞安全 base |  |
| plugins/dsh-extra-plan/lib/save-contract.js | summaryList | L56-58 | 将摘要数组稳定连接为确定性展示片段。 |  |
| plugins/dsh-extra-plan/lib/save-contract.js | summaryBool | L60-62 | 将 summary 布尔覆盖标志格式化为中文是或否。 |  |
| plugins/dsh-extra-plan/lib/save-contract.js | formatSavePlanSummary | L65-120 | 格式化不含落盘路径的确定性派遣摘要，覆盖任务、逐文件逐点、执行组、R 组、检查、收尾、全局与职责，保留旧信息并提供有界定位摘要，供限长和 render 共用。 |  |
| plugins/dsh-extra-plan/lib/save-contract.js | renderSavePlan | L127-144 | save_plan 结果渲染为单元素 text ContentBlock[]，展示双路径、保留旧 summary 范围并带有界逐文件逐点摘要与职责提示，不替代原始工件。 |  |
| plugins/dsh-extra-plan/lib/save-contract.js | renderProbeMarkdown | L179-220 | save_probe 线索/证据报告 Markdown 渲染（固定标题与五节模板） |  |
| plugins/dsh-extra-plan/lib/save-contract.js | trimProbeEvidenceDecor | L246-257 | 成对剥除装饰并循环；单侧装饰不剥，`.` 与 `/` 保留，避免误伤合法路径。 | extractProbeEvidenceRefs 整体/逐段调用；step-00 E10-E12 |
| plugins/dsh-extra-plan/lib/save-contract.js | extractProbeEvidenceRefs | L258-271 | 从方案正文的探查者已核实标记提取证据路径，兼容证据与证据来源标签，按既有成对装饰/分隔与去重规则规范化。 | step-00 E1-E12 覆盖路径与清洗边界 |
| plugins/dsh-extra-plan/lib/save-contract.js | renderSaveProbe | L275-277 | save_probe 结果渲染为单元素 ContentBlock[] |  |
| plugins/dsh-extra-plan/lib/save-persistence.js | fsOpsOf | L8-11 | 合并末位可选文件系统操作依赖：未提供的操作项回退冻结只读的默认 node:fs 同义实现（另建新对象，不就地改写共享默认集） |  |
| plugins/dsh-extra-plan/lib/save-persistence.js | errorText | L13-15 | 将异常归一为保留首错原因的文本。 |  |
| plugins/dsh-extra-plan/lib/save-persistence.js | cleanupCreated | L17-27 | 只删除本次尝试的临时/已发布路径，并收集清理失败残留。 |  |
| plugins/dsh-extra-plan/lib/save-persistence.js | commitError | L29-35 | 组合失败阶段、原始原因与清理失败详情，并保留 cause。 |  |
| plugins/dsh-extra-plan/lib/save-persistence.js | atomicCommit | L40-76 | 单次 mkdir→临时写入→逐项检查/发布；失败仅清理本次路径，保留首错与阶段，清理失败报告残留；成功不创建 journal。 | 末位 fs 依赖可注入；step-06 覆盖首写/后续写/发布/清理失败 |
| plugins/dsh-extra-plan/lib/save-plan-validation.js | newFileRecord | L54-56 | 创建文件操作与修改点容器，承载路径、角色、操作和点集合。 |  |
| plugins/dsh-extra-plan/lib/save-plan-validation.js | newTask | L58-70 | 创建带字段数组、文件集合和引用缓存的数字任务中间结构。 |  |
| plugins/dsh-extra-plan/lib/save-plan-validation.js | newClosure | L72-83 | 创建收尾中间结构，承载文件、依赖、动作、自检与覆盖引用。 |  |
| plugins/dsh-extra-plan/lib/save-plan-validation.js | newCheck | L86-92 | 创建检查定义中间结构，承载验收组、取证、动作、证据与覆盖。 |  |
| plugins/dsh-extra-plan/lib/save-plan-validation.js | newGlobal | L94-96 | 创建全局验收中间结构及正式检查引用。 |  |
| plugins/dsh-extra-plan/lib/save-plan-validation.js | makeDiagnostic | L98-107 | 统一生成含最小修复模板的结构诊断对象。 |  |
| plugins/dsh-extra-plan/lib/save-plan-validation.js | defaultTemplate | L109-144 | 按字段提供有界的最小合法修复模板。 |  |
| plugins/dsh-extra-plan/lib/save-plan-validation.js | normalizeText | L146-148 | 统一 CRLF 和 CR 为 LF，保持合同文本解析口径。 |  |
| plugins/dsh-extra-plan/lib/save-plan-validation.js | fieldOf | L150-155 | 按列首字段前缀识别结构字段及其值。 |  |
| plugins/dsh-extra-plan/lib/save-plan-validation.js | isPlaceholderAnchor | L164-166 | 识别整文件、相关逻辑、待定等占位锚点。 |  |
| plugins/dsh-extra-plan/lib/save-plan-validation.js | isAcceptancePlaceholder | L168-171 | 识别同方案、同上、M点等验收占位定位。 |  |
| plugins/dsh-extra-plan/lib/save-plan-validation.js | parseLocation | L173-181 | 安全解析 L 起始或闭区间并拒绝非正整数与倒序。 |  |
| plugins/dsh-extra-plan/lib/save-plan-validation.js | pointIdentity | L183-185 | 提取修改点或验收点的稳定 M 点 ID。 |  |
| plugins/dsh-extra-plan/lib/save-plan-validation.js | headingCandidate | L188-200 | 识别任务、检查、收尾、全局块，并将伪标题归入早拒诊断。 |  |
| plugins/dsh-extra-plan/lib/save-plan-validation.js | pushEmptyFieldDiagnostic | L202-206 | 拒绝空结构字段并附字段级诊断。 |  |
| plugins/dsh-extra-plan/lib/save-plan-validation.js | parseTaskDocument | L208-464 | 按模式与职责解析 plan 或 checklist 的任务、收尾、检查、全局块，并绑定逐文件操作、修改点和验收点；忽略围栏和缩进伪标记并记录顺序及职责错误。 |  |
| plugins/dsh-extra-plan/lib/save-plan-validation.js | flush | L222-229 | 结束当前结构块并写入对应任务、检查、收尾或全局集合。 |  |
| plugins/dsh-extra-plan/lib/save-plan-validation.js | wrongHeading | L231-233 | 记录列首结构标题、顺序或职责错位的早拒诊断。 |  |
| plugins/dsh-extra-plan/lib/save-plan-validation.js | pushField | L235-239 | 向当前结构块按字段追加值并维护文件/修改点绑定。 |  |
| plugins/dsh-extra-plan/lib/save-plan-validation.js | requireFile | L241-245 | 要求当前文件记录并把后续字段绑定到该文件。 |  |
| plugins/dsh-extra-plan/lib/save-plan-validation.js | requirePoint | L247-253 | 要求当前修改点并把后续字段绑定到该点。 |  |
| plugins/dsh-extra-plan/lib/save-plan-validation.js | validateIds | L466-477 | 验证任务或检查 ID 唯一、连续且按序出现。 |  |
| plugins/dsh-extra-plan/lib/save-plan-validation.js | isMarkdownWrapped | L479-490 | 识别路径是否被 Markdown 或成对装饰包裹。 |  |
| plugins/dsh-extra-plan/lib/save-plan-validation.js | pathIssue | L492-505 | 拒绝绝对、盘符、反斜杠、点段、空段、尾斜杠或 Markdown 包裹路径。 |  |
| plugins/dsh-extra-plan/lib/save-plan-validation.js | workdirIssue | L507-512 | 允许根目录点号并复用相对路径规则校验检查工作目录。 |  |
| plugins/dsh-extra-plan/lib/save-plan-validation.js | platformIsCaseInsensitive | L514-518 | 按注入平台或开关决定路径键的大小写口径。 |  |
| plugins/dsh-extra-plan/lib/save-plan-validation.js | pathKey | L520-523 | 生成按平台归一化的路径所有权和冲突比较键。 |  |
| plugins/dsh-extra-plan/lib/save-plan-validation.js | parseDependencies | L525-534 | 解析“无”或任务引用列表，拒绝空、非法及重复依赖。 |  |
| plugins/dsh-extra-plan/lib/save-plan-validation.js | parseResources | L536-544 | 解析可选独占资源列表，拒绝空、重复或“无”混用。 |  |
| plugins/dsh-extra-plan/lib/save-plan-validation.js | parseCheckRefs | L546-554 | 解析正式验收检查引用列表，拒绝空、非法或重复 ID。 |  |
| plugins/dsh-extra-plan/lib/save-plan-validation.js | addPathDiagnostics | L556-561 | 对主、关联、收尾文件或工作目录统一追加路径诊断。 |  |
| plugins/dsh-extra-plan/lib/save-plan-validation.js | validatePathSet | L563-577 | 校验任务文件集合、路径键重复并缓存原始和规范集合。 |  |
| plugins/dsh-extra-plan/lib/save-plan-validation.js | validateResourceField | L579-587 | 校验独占资源单值基数并解析资源标识。 |  |
| plugins/dsh-extra-plan/lib/save-plan-validation.js | validatePointIds | L589-597 | 校验同文件修改点 ID 的格式与唯一性。 |  |
| plugins/dsh-extra-plan/lib/save-plan-validation.js | validatePlanFileRecord | L599-644 | 校验计划文件记录的路径、操作、点及新建/删除/生成例外。 |  |
| plugins/dsh-extra-plan/lib/save-plan-validation.js | validatePlanFileRecords | L646-651 | 遍历校验计划中的主、关联和收尾文件记录并检查覆盖。 |  |
| plugins/dsh-extra-plan/lib/save-plan-validation.js | validateAcceptanceFileRecord | L653-669 | 校验验收文件的同文件操作、对应 M 点、未来定位和客观期望。 |  |
| plugins/dsh-extra-plan/lib/save-plan-validation.js | validateAcceptanceFileRecords | L670-675 | 遍历验收文件点记录并核对文件与点覆盖。 |  |
| plugins/dsh-extra-plan/lib/save-plan-validation.js | validateTaskShape | L677-714 | 校验任务标题、文件、执行组、依赖、修改自检，或期望禁止及正式验收字段。 |  |
| plugins/dsh-extra-plan/lib/save-plan-validation.js | graphCycles | L716-737 | 对任务或执行组依赖图检测并去重环路。 |  |
| plugins/dsh-extra-plan/lib/save-plan-validation.js | visit | L721-734 | 深度优先访问依赖图节点并收集环路，供 graphCycles 使用。 |  |
| plugins/dsh-extra-plan/lib/save-plan-validation.js | groupSort | L739-743 | 按 G 组编号稳定排序。 |  |
| plugins/dsh-extra-plan/lib/save-plan-validation.js | firstTaskForGroup | L745-748 | 定位执行组首个任务，用于组环诊断归属。 |  |
| plugins/dsh-extra-plan/lib/save-plan-validation.js | validatePlanRelations | L750-822 | 校验任务依赖与组折叠 DAG、文件所有权、同组理由及执行资源冲突。 |  |
| plugins/dsh-extra-plan/lib/save-plan-validation.js | fileRecordKey | L824-826 | 生成规范化的跨文档文件记录键。 |  |
| plugins/dsh-extra-plan/lib/save-plan-validation.js | pointIdSet | L828-830 | 提取并规范化文件记录的 M 点 ID 集合。 |  |
| plugins/dsh-extra-plan/lib/save-plan-validation.js | equalStringSets | L832-836 | 比较两个字符串集合是否完全相等。 |  |
| plugins/dsh-extra-plan/lib/save-plan-validation.js | validateFileRecordMapping | L838-860 | 校验计划/验收文件记录的文件、操作和点集合映射。 |  |
| plugins/dsh-extra-plan/lib/save-plan-validation.js | validateCrossDocument | L862-887 | 校验 plan 和 checklist 的模式、任务 ID、文件集合及收尾存在性一致。 |  |
| plugins/dsh-extra-plan/lib/save-plan-validation.js | validateClosure | L889-939 | 校验收尾文件、全任务依赖、所有权隔离、动作自检、资源及正式验收引用。 |  |
| plugins/dsh-extra-plan/lib/save-plan-validation.js | validateGlobal | L941-951 | 校验全局期望、禁止与唯一正式验收引用。 |  |
| plugins/dsh-extra-plan/lib/save-plan-validation.js | validateChecks | L953-1010 | 校验检查 ID、验收组、取证、目录、动作、证据、资源、签名去重、引用覆盖及孤儿拒绝。 |  |
| plugins/dsh-extra-plan/lib/save-plan-validation.js | attachRefs | L988-1001 | 将任务、收尾或全局正式验收引用解析为覆盖关系，早拒不存在检查。 |  |
| plugins/dsh-extra-plan/lib/save-plan-validation.js | sortIds | L1012-1014 | 去重并数值排序覆盖 ID。 |  |
| plugins/dsh-extra-plan/lib/save-plan-validation.js | buildInternalOrder | L1016-1040 | 按任务依赖计算执行组内拓扑顺序。 |  |
| plugins/dsh-extra-plan/lib/save-plan-validation.js | reviewGroupSort | L1042-1046 | 按 R 组编号稳定排序。 |  |
| plugins/dsh-extra-plan/lib/save-plan-validation.js | summarizeFileRecord | L1048-1069 | 生成逐文件逐点的有界摘要，保留操作、M点和定位信息。 |  |
| plugins/dsh-extra-plan/lib/save-plan-validation.js | buildSummary | L1071-1194 | 构造通用派遣摘要并加入逐文件逐点摘要：任务、文件、执行组外依赖与 initialState、检查及 R 组覆盖、收尾和全局；不输出人数或实时状态。 |  |
| plugins/dsh-extra-plan/lib/save-plan-validation.js | formatDiagnostic | L1196-1201 | 将诊断压缩为有界且可修复的文本。 |  |
| plugins/dsh-extra-plan/lib/save-plan-validation.js | finalizeFailure | L1203-1209 | 限制展示诊断数量并汇总剩余数，形成失败结果。 |  |
| plugins/dsh-extra-plan/lib/save-plan-validation.js | validateSavePlanContract | L1211-1246 | 按类型、双文档解析、结构关系、逐文件操作/M点映射、检查覆盖及摘要限长顺序校验；合法返回 summary，失败早于工厂 context/base、证据 IO 与单次发布。 |  |
| plugins/dsh-extra-plan/lib/save-probe-validation.js | validateProbe | L8-107 | 校验 save_probe 的数组/长度上限、路径存在性、正行号/区间端点与 evidence 至少一项内容，聚合返回拒绝原因。 | 不提取方案正文中的证据来源关键词；该职责在 extractProbeEvidenceRefs。 |
| plugins/dsh-extra-plan/lib/save-probe-validation.js | probePathOf | L110-113 | 相对路径按 cwd 解析、绝对路径原样返回 |  |
| plugins/dsh-extra-plan/lib/save-tool-factories.js | probeRefDecorationHint | L12-14 | ref 首字符属装饰集（反引号/引号/半全角括号/中文标点等）时返回「疑似含 Markdown 装饰；引用证据请使用裸路径，每条单独一行」提示，否则返回空串 | 工具侧诊断文本（非界面文案）；报错中 ref 一律 JSON.stringify 呈现 |
| plugins/dsh-extra-plan/lib/save-tool-factories.js | cwdOf | L17-21 | 从 exec.agent.session.header 读取会话工作区 cwd：任一层缺失或 cwd 非字符串时返回空串；不计算目录、短名或工件 base。 |  |
| plugins/dsh-extra-plan/lib/save-tool-factories.js | resolveSaveContext | L24-34 | 返回 save 工具共用的四字段 `{ cwd, sessionTag, dir, base }`；cwd/会话标签、落盘目录与工件 base 各自按输入解析，参数校验与提交形状仍由各工具自理 |  |
| plugins/dsh-extra-plan/lib/save-tool-factories.js | canonicalRealpath | L38-43 | 惰性调用原生真实路径解析；能力缺失即拒绝。 |  |
| plugins/dsh-extra-plan/lib/save-tool-factories.js | sourceCacheKey | L47-50 | 生成规范化的源路径缓存键，按平台处理大小写。 |  |
| plugins/dsh-extra-plan/lib/save-tool-factories.js | pathInside | L52-55 | 用 relative 与分隔符边界判断目标是否包含于根路径。 |  |
| plugins/dsh-extra-plan/lib/save-tool-factories.js | lexicalExists | L57-62 | 用 lstat 检查路径词法存在性，不跟随别名读取内容。 |  |
| plugins/dsh-extra-plan/lib/save-tool-factories.js | nearestExistingParent | L64-74 | 查找目标最近存在的目录，供新建目标边界核实。 |  |
| plugins/dsh-extra-plan/lib/save-tool-factories.js | resolveWorkspaceEntry | L76-101 | 解析真实目标/最近父目录的工作区边界并缓存源字节。 |  |
| plugins/dsh-extra-plan/lib/save-tool-factories.js | strictTextEntry | L103-115 | 严格 UTF-8 解码并拒绝 NUL，规范化 BOM、换行和代码行。 |  |
| plugins/dsh-extra-plan/lib/save-tool-factories.js | literalCount | L117-126 | 统计单行原文片段的字面出现次数。 |  |
| plugins/dsh-extra-plan/lib/save-tool-factories.js | verifyModificationPoint | L128-145 | 核实修改点范围/安全闭区间与唯一原文锚点，支持空文件例外。 |  |
| plugins/dsh-extra-plan/lib/save-tool-factories.js | verifyPlanSources | L147-183 | 遍历任务和收尾文件操作，核实工作区真实目标、源点及生成来源。 |  |
| plugins/dsh-extra-plan/lib/save-tool-factories.js | verifyFile | L152-179 | 按文件操作核实存在性、文本修改点或生成来源；不执行生成命令。 |  |
| plugins/dsh-extra-plan/lib/save-tool-factories.js | verifyProbeEvidenceRef | L185-198 | 按既有证据引用、标题与缓存契约只读核实探查报告。 |  |
| plugins/dsh-extra-plan/lib/save-tool-factories.js | createSaveToolFactories | L201-388 | 创建只捕获目录与单次持久化依赖的 save 工具定义工厂；仅注入 savePlanDir、atomicCommit，不持有宿主会话状态。 |  |
| plugins/dsh-extra-plan/lib/save-tool-factories.js | defineSavePlan | L202-272 | 定义 save_plan schema、paths-only output、ContentBlock render 与 execute；合同/证据校验先于单次双文件顺序发布。 |  |
| plugins/dsh-extra-plan/lib/save-tool-factories.js | render | L223-230 | save_plan render 复用合同 summary，返回单个 text ContentBlock；structured output 不扩展 paths。 |  |
| plugins/dsh-extra-plan/lib/save-tool-factories.js | execute | L233-270 | save_plan 按类型和长度、未探查标记、合同摘要、context/base、证据 IO、单次 atomicCommit 顺序执行；合法正文逐字保存并仅返回 paths，早拒不触碰后续 IO。 |  |
| plugins/dsh-extra-plan/lib/save-tool-factories.js | defineSaveProbe | L274-385 | save_probe schema/output/render/execute（限制校验与线索/证据落盘） |  |
| plugins/dsh-extra-plan/lib/save-tool-factories.js | render | L362-364 | save_probe 工具结果渲染：结合是否含 evidence 生成模型可见提示，说明落盘的是证据报告还是线索文件。 |  |
| plugins/dsh-extra-plan/lib/save-tool-factories.js | execute | L367-383 | save_probe 执行体：校验参数与路径后，将探查结果渲染为 Markdown 单次顺序发布单文件，返回其路径。 |  |
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
| plugins/dsh-extra-plan/lib/settings-contract.js | isString | L5 | 判定值是否为字符串类型，供设置 descriptor 的 validator 复用 | 模块内私有箭头常量（未导出） |
| plugins/dsh-extra-plan/lib/settings-contract.js | isPositiveInteger | L6 | 判定值是否为大于 0 的整数，作 exploreBudget 的 validator | 模块内私有箭头常量 |
| plugins/dsh-extra-plan/lib/settings-contract.js | isBoolean | L7 | 判定值是否为布尔类型，作布尔设置项的 validator | 模块内私有箭头常量 |
| plugins/dsh-extra-plan/lib/settings-contract.js | isMode | L11 | 判定值是否为合法工具呈现模式（native/ptc 二值） | 已达成：行号列已修正为 L8；原备注所指区间问题已消除，实际 isMode 仅第 8 行，L10-19 为导出常量与注释 |
| plugins/dsh-extra-plan/lib/settings-contract.js | setting | L28-50 | 标准化并冻结一条设置 descriptor：补齐类型、定位器、别名与 UI，产出只读条目 | 唯一构造 descriptor 的工厂，对嵌套对象逐层 Object.freeze |
| plugins/dsh-extra-plan/lib/settings-contract.js | settingsRowLocator | L56-60 | 生成权威值落点定位器：settings 行 config.<key>，路径可覆盖 | 私有箭头函数，rowId 固定 SETTINGS_ROW_ID（'dsh-extra-plan-settings'） |
| plugins/dsh-extra-plan/lib/settings-contract.js | sourceLocator | L61 | 生成源模板行定位器：声明行 extra-plan 的 config.<key>，路径可覆盖 | 私有箭头函数，rowId 固定 'extra-plan' |
| plugins/dsh-extra-plan/lib/settings-contract.js | hostRowProjectionLocator | L63-66 | 生成旧公开 preset-sync 行的兼容 config.<key> 读取定位器；新结构不写该行。 | 私有箭头函数，仅 2 项宿主行设置使用；旧 body 叶键由 legacyHostRowProjectionLocator 保留 |
| plugins/dsh-extra-plan/lib/settings-contract.js | legacyHostRowProjectionLocator | L68-72 | 为旧 preset-extra-plan 声明行生成兼容投影定位：旧 row id、对应 host plugins 子行 id 与 config 叶键；仅供安全读取迁移和旧 body carry。 |  |
| plugins/dsh-extra-plan/lib/settings-contract.js | createDefaultSettings | L147-149 | 按十项 `SETTING_DEFINITIONS` 从冻结 `DEFAULT_SETTINGS` 构造新的普通对象，避免消费者共享可变默认快照。 |  |
| plugins/dsh-extra-plan/lib/settings-contract.js | getSettingDefinition | L165-167 | 按 key 从冻结的 descriptor 索引取设置定义，未命中返回 undefined | 导出 API，索引 descriptorByKey 在 L138 由 SETTING_DEFINITIONS 构建 |
| plugins/dsh-extra-plan/lib/settings-contract.js | validateSettingValue | L169-171 | 用定义自带 validator 校验取值；定义缺失或无校验函数一律返回 false | 导出 API |
| plugins/dsh-extra-plan/lib/settings-contract.js | normalizeSettingValue | L173-175 | 用定义自带 normalize 归一取值，无 normalize 时原样返回 | 导出 API，目前仅 plannerModel/otherAgentModel 带 normalize（trim） |
| plugins/dsh-extra-plan/lib/settings.js | mountClientCarrier | L34-64 | 按 Loader 实例复用内部 Group child，注册带绝对 client-carrier.js file URL 的唯一 entry；以引用计数幂等创建与释放，最后一个 settings 卸载时 dispose 并清理缓存。 |  |
| plugins/dsh-extra-plan/lib/settings.js | schemaField | L67-73 | 按 descriptor 的 scalarType 生成 schemastery 字段（boolean→布尔、integer→步长 1 的 ≥1 数值、其余字符串），并挂默认值与 volatile 标记。 |  |
| plugins/dsh-extra-plan/lib/settings.js | isLoopback | L82-85 | 环回地址判定（API 仅本机） |  |
| plugins/dsh-extra-plan/lib/settings.js | json | L87-90 | HTTP JSON 响应 |  |
| plugins/dsh-extra-plan/lib/settings.js | readJsonBody | L92-110 | 读取请求体（限 1MB） |  |
| plugins/dsh-extra-plan/lib/settings.js | plainJsonObject | L112-114 | PUT 载荷形状守卫：只接受非 null、非数组的 JSON 对象，空对象/原始值由 API 继续拒绝。 | createApiHandler 内部 |
| plugins/dsh-extra-plan/lib/settings.js | activeSettingsRows | L120-125 | （待补充） |  |
| plugins/dsh-extra-plan/lib/settings.js | rowConfigOf | L127-133 | （待补充） |  |
| plugins/dsh-extra-plan/lib/settings.js | completeConfig | L135-145 | （待补充） |  |
| plugins/dsh-extra-plan/lib/settings.js | rowSummary | L147-159 | （待补充） |  |
| plugins/dsh-extra-plan/lib/settings.js | rawPatchInfo | L161-166 | （待补充） |  |
| plugins/dsh-extra-plan/lib/settings.js | inspectSettingsAuthority | L169-209 | （待补充） |  |
| plugins/dsh-extra-plan/lib/settings.js | findSettingsRow | L211-214 | 从 configEditor.configuration() 中按 entry.options.id=SETTINGS_ROW_ID 找 settings 行（**权威值载体**，GET 三层回退的首选读取层），未命中返回 undefined |  |
| plugins/dsh-extra-plan/lib/settings.js | readRawPatch | L216-218 | 只读 configEditor.documentPath 的原始 patch，为旧声明迁移提供安全 YAML 数据源；不可读时返回 undefined。 |  |
| plugins/dsh-extra-plan/lib/settings.js | stableSnapshot | L221-238 | （待补充） |  |
| plugins/dsh-extra-plan/lib/settings.js | readUnifiedState | L243-279 | 读取唯一 settings 行的完整权威快照，交 resolveUnifiedConfig 处理旧 raw patch/默认层级；非法当前 gateWords 直接抛错，供 GET/PUT 准确失败。 |  |
| plugins/dsh-extra-plan/lib/settings.js | publicField | L281-295 | 把 descriptor 构造成设置页字段描述：key/type/control/locale + 可选 options、optionLocale + value/default/overridden + source（取值层来源） |  |
| plugins/dsh-extra-plan/lib/settings.js | profileSyncPath | L297-307 | 为失败/不可用诊断解析 profile/path，优先使用目标路径或已证明 profilesRoot |  |
| plugins/dsh-extra-plan/lib/settings.js | reportProfileSync | L309-321 | 对 failed/unavailable/not-installed 输出含 status/pathSource/profile/path/reason 的诊断，不改变 API/adapter 生命周期 |  |
| plugins/dsh-extra-plan/lib/settings.js | cacheProfileSync | L323-326 | （待补充） |  |
| plugins/dsh-extra-plan/lib/settings.js | cacheProfileSyncWithStale | L329-348 | GET 无参缓存兜底：缓存 terminal 含 rawWebPatchFingerprint 时以 editor.documentPath 现算磁盘 sha256 比对，不一致则 profileSync 附加 stale:true/source:'stale-terminal-cache' 并 console.warn；只读无副作用，documentPath 不可读/异常按现状返回。 |  |
| plugins/dsh-extra-plan/lib/settings.js | requestProfileSync | L350-354 | （待补充） |  |
| plugins/dsh-extra-plan/lib/settings.js | proPayload | L356-374 | 设置页 API 响应体：fields（2 项宿主行的控件元数据 + 当期值/默认/覆盖标记/来源层）+ values + defaults；读取失败一律回落出厂默认（不抛） |  |
| plugins/dsh-extra-plan/lib/settings.js | conflictProfileSync | L376-386 | （待补充） |  |
| plugins/dsh-extra-plan/lib/settings.js | createApiHandler | L388-464 | GET/PUT loopback API：GET 读取唯一全局行并按旧 raw patch/默认回退；PUT 先拒绝非法 JSON、null/数组/空对象、未知键、混合非法值，再合并全局十项与 gateWords，只 edit 全局行；当前非法 gateWords 报错且零写，深等 no-op 才回执 applied。 | 不含 qqbot；失败不伪装为写入成功 |
| plugins/dsh-extra-plan/lib/settings.js | responseForProfile | L389-398 | 把 profileSync 状态映射为 HTTP 状态、overall 与 web.applied |  |
| plugins/dsh-extra-plan/lib/settings.js | apply | L466-572 | 插件入口（HTTP 服务注册） |  |
| plugins/dsh-extra-plan/lib/settings.js | onResult | L472 | 接收同步器结果并更新 API 状态 |  |
| plugins/dsh-extra-plan/lib/settings.js | editorOf | L474-481 | 安全取得当前 configEditor |  |
| plugins/dsh-extra-plan/lib/settings.js | documentPathOf | L482-490 | 现场读取 configEditor.documentPath |  |
| plugins/dsh-extra-plan/lib/settings.js | environmentSnapshot | L491 | 捕获显式 DSH_HOME/DSH_PROFILE 快照 |  |
| plugins/dsh-extra-plan/lib/settings.js | conflictResult | L492-506 | settings 行权威冲突终态构造器：status=conflict/request-result，写入 lastTerminalCache 并作为 syncEditor 的 conflict 返回。 | syncEditor 闭包依赖 |
| plugins/dsh-extra-plan/lib/settings.js | syncEditor | L507-545 | 从最新 editor 状态入队完整快照与路径 |  |
| plugins/dsh-extra-plan/lib/settings.js | settledSettings | L546-550 | 把通用 settled 快照交给同步器 |  |
| plugins/dsh-extra-plan/lib/settings.js | settledError | L551-563 | 独立记录 settled 回调异常 |  |
| plugins/dsh-extra-plan/lib/shell-mutation.js | commandTextOf | L36-48 | 解码对象/JSON 字符串两形状的 command 参数 |  |
| plugins/dsh-extra-plan/lib/shell-mutation.js | pwshCommandOf | L50 | 提取 pwsh command 文本 |  |
| plugins/dsh-extra-plan/lib/shell-mutation.js | bashCommandOf | L51 | 提取 bash command 文本 |  |
| plugins/dsh-extra-plan/lib/shell-mutation.js | shellWords | L56-80 | 将 shell segment 按引号与空白拆成词，供 wrapper/内层 shell 位置判定 | 纯函数 |
| plugins/dsh-extra-plan/lib/shell-mutation.js | isInnerShellWord | L84-87 | 识别大小写无关的 pwsh/bash/cmd 包装，并支持 cmd.exe 路径及引号包装。 | 纯函数；/c 内层命令交回既有 mutation 判定。 |
| plugins/dsh-extra-plan/lib/shell-mutation.js | isEnvAssignment | L88-90 | 识别 NAME=VALUE 前缀，避免 env wrapper 赋值被当作命令 | 纯函数 |
| plugins/dsh-extra-plan/lib/shell-mutation.js | mutationTextMatches | L97-174 | 按正则、段首词与内嵌 shell 深度判定写操作 |  |
| plugins/dsh-extra-plan/lib/shell-mutation.js | mutationMatches | L176-179 | 组合 command 提取与写模式判定 |  |
| plugins/dsh-extra-plan/lib/shell-mutation.js | pwshMutationMatches | L181 | 判定 pwsh 命令是否包含写操作 |  |
| plugins/dsh-extra-plan/lib/shell-mutation.js | bashMutationMatches | L182 | 判定 bash 命令是否包含写操作 |  |
| plugins/dsh-extra-plan/lib/usage-ledger.js | createUsageLedger | L4-174 | usage 账本工厂：读 enabled/path 选项建立闭包状态，返回 foldUsage 与 disposeSession。 | cursor 路径由 account 路径拼 '.cursor.json'；被 index.js L347 以 { enabled, path } 调用。地图行号区间 L4-174。 |
| plugins/dsh-extra-plan/lib/usage-ledger.js | readUsageCursorTable | L24-45 | 读取 cursor JSON 并返回 {ok, table}：文件不存在按空表正常返回，其余读取/解析/形状错误降级空表并告警。 | createUsageLedger（L4）内部闭包。ENOENT 静默 ok:true；其它错误 ok:false。地图行号区间 L24-45。 |
| plugins/dsh-extra-plan/lib/usage-ledger.js | warnUsageCursorDegraded | L48-52 | cursor 读取降级时每个插件实例只打印一次告警，避免重复刷屏。 | createUsageLedger（L4）内部闭包，靠 cursorDegradedWarned 标志限一次。地图行号区间 L48-52。 |
| plugins/dsh-extra-plan/lib/usage-ledger.js | usageCursorEntryOf | L56-63 | 归一单个会话的 cursor 项：兼容旧数字形状与 {seq,index}，无法识别返回 undefined。 | createUsageLedger（L4）内部闭包，旧数字形状按水位 index=0 处理。地图行号区间 L56-63。 |
| plugins/dsh-extra-plan/lib/usage-ledger.js | foldUsage | L71-171 | 按水位增量或全量扫描会话事件，把 assistant/message 的 usage 追加到账本并推进 cursor。 | createUsageLedger（L4）内部闭包；无新增行时只推进内存水位、不触碰账本与 cursor 文件。地图行号区间 L71-171。 |
| plugins/dsh-extra-plan/scripts/generate-runtime-defaults.mjs | roleDefinitionFile | L37-39 | 按角色 id 在目标目录生成 preset-definition-<role>.generated.yml 路径。 |  |
| plugins/dsh-extra-plan/scripts/generate-runtime-defaults.mjs | runtimeDefaultsFromTemplate | L41-46 | 遍历十项设置定义，按各自 sourceLocator 从作者模板解析、校验并归一默认值；缺失/歧义/非法即失败。 |  |
| plugins/dsh-extra-plan/scripts/generate-runtime-defaults.mjs | renderRuntimeDefaults | L48-58 | 将完整十键默认对象渲染为冻结 `DEFAULT_SETTINGS`，兼容 `DEFAULT_EXPLORE_BUDGET`/`DEFAULT_PLANNER_PROMPT_SUFFIX` 只引用对象字段。 |  |
| plugins/dsh-extra-plan/scripts/generate-runtime-defaults.mjs | clientFieldMetadata | L64-77 | 从设置 descriptor 的 UI metadata 取客户端字段允许的控件/选项/locale/section/min/step/hint；不带默认值、validator 或宿主对象。 |  |
| plugins/dsh-extra-plan/scripts/generate-runtime-defaults.mjs | clientFieldLines | L79-85 | 将一组 definitions 的 metadata 序列化为客户端字段常量文本。 |  |
| plugins/dsh-extra-plan/scripts/generate-runtime-defaults.mjs | renderClientFieldBlock | L87-98 | 按 8 项 extra-plan + 2 项 host-rows 分组顺序渲染 `EXTRA_FIELDS`/`HOST_ROW_FIELDS`/`ALL_FIELDS`，要求分组合同成立。 |  |
| plugins/dsh-extra-plan/scripts/generate-runtime-defaults.mjs | markerMatches | L100-103 | 查找成对客户端生成标记的整行匹配位置。 |  |
| plugins/dsh-extra-plan/scripts/generate-runtime-defaults.mjs | clientFieldMarkerRange | L105-113 | 要求开始/结束标记各恰一处且顺序正确，并返回区块边界与原始换行风格。 |  |
| plugins/dsh-extra-plan/scripts/generate-runtime-defaults.mjs | renderClientFields | L115-120 | 只替换客户端标记区块内容，保留区块外字节与 EOL；输入或标记不合同时失败。 |  |
| plugins/dsh-extra-plan/scripts/generate-runtime-defaults.mjs | separatorIndexOf | L125-127 | 返回首个顶格 YAML 文档分隔行「---」的下标，缺分隔行返回 -1。 | 模块内部函数（未导出） |
| plugins/dsh-extra-plan/scripts/generate-runtime-defaults.mjs | topLevelRowsOf | L130-140 | 抽取 agent.cordis.yml 第一文档的顶层条目区间（首个根级「- id:/insert:」行到首个顶格「---」分隔行，无分隔行才到末个非空行）；缺失/空即抛，注释、锚点、!!js 与 isolate 键逐字保留 |  |
| plugins/dsh-extra-plan/scripts/generate-runtime-defaults.mjs | secondDocumentOf | L143-148 | 抽取 agent.cordis.yml 第二文档原文（分隔行之后全部行，保留注释与工具面原文）；缺分隔行即抛。 |  |
| plugins/dsh-extra-plan/scripts/generate-runtime-defaults.mjs | indentBlock | L150-153 | 整段平移 PLUGINS_INDENT 列缩进（空行保持空行），供声明行 config.plugins 嵌套 |  |
| plugins/dsh-extra-plan/scripts/generate-runtime-defaults.mjs | indentOf | L155-159 | 计算行首空格缩进宽度，供 raw 块边界与缩进平移使用。 |  |
| plugins/dsh-extra-plan/scripts/generate-runtime-defaults.mjs | shiftBlock | L161-169 | 按 delta 平移非空行缩进并保留空行；负向缩进越界抛错。 |  |
| plugins/dsh-extra-plan/scripts/generate-runtime-defaults.mjs | rawBlockFrom | L175-186 | 从起始行抽取至同级结束前的原始缩进行块，保留注释/空行并去除尾部空行。 |  |
| plugins/dsh-extra-plan/scripts/generate-runtime-defaults.mjs | quoteYamlSingle | L188-190 | YAML 单引号标量：整体加单引号并把内部单引号双写 |  |
| plugins/dsh-extra-plan/scripts/generate-runtime-defaults.mjs | assertDefinition | L192-200 | 严格校验 preset definition 为 extra-plan 对象，要求元数据完整、顶层 17 条 plugins 且禁止 Loader insert wrapper。 |  |
| plugins/dsh-extra-plan/scripts/generate-runtime-defaults.mjs | renderPresetDefinition | L202-221 | 从 agent.cordis.yml 抽取顶层行并缩进，结合 preset.yml 元数据生成纯 definition YAML；保留 group、isolate、!!js 原文并回解析校验。 |  |
| plugins/dsh-extra-plan/scripts/generate-runtime-defaults.mjs | mainExtraPlanRowBlock | L224-235 | 从主 definition 抽取 extra-plan 行及其 config 原始块，验证 name/config 存在，供角色 definition 逐字复制。 |  |
| plugins/dsh-extra-plan/scripts/generate-runtime-defaults.mjs | personaPrefixBlock | L238-264 | 按 personaPrefix 解析角色源并返回内容匹配的折叠正文块，避免按位置错配角色人设。 |  |
| plugins/dsh-extra-plan/scripts/generate-runtime-defaults.mjs | roleToolsBlock | L267-278 | 按角色序号抽取对应 tools 原始块，并校验 tools 行数等于角色数。 |  |
| plugins/dsh-extra-plan/scripts/generate-runtime-defaults.mjs | findRowById | L281-292 | 按行 id 深度优先查找插件行，未命中返回 null；供 tool-presentation 默认 mode 读取，解析/校验异常由调用者回落 native。 |  |
| plugins/dsh-extra-plan/scripts/generate-runtime-defaults.mjs | mainToolPresentationMode | L298-310 | 从主 definition 的 tool-presentation 行取默认 mode；缺失、值非法或解析异常一律回落 native，不抛错 |  |
| plugins/dsh-extra-plan/scripts/generate-runtime-defaults.mjs | assertRoleSource | L312-332 | 校验 4 角色 id/order 顺序、name/description/personaPrefix/tools，并禁止手写 gateWords 与 tool-presentation。 |  |
| plugins/dsh-extra-plan/scripts/generate-runtime-defaults.mjs | assertRoleDefinition | L334-353 | 校验角色 definition 元数据、首两行、工具数量、唯一末行 tool-presentation 及 mode 投影，并返回 definition。 |  |
| plugins/dsh-extra-plan/scripts/generate-runtime-defaults.mjs | renderRoleDefinitions | L360-406 | 按 personaPrefix、主 extra-plan config、角色 tools 与唯一 tool-presentation 顺序渲染 4 份角色 definition，并逐份解析、校验、配置等值。 |  |
| plugins/dsh-extra-plan/scripts/generate-runtime-defaults.mjs | assertParses | L408-416 | 用 parsePresetYaml 预解析校验文本，失败抛出带标签的 YAML parse failed 错误 |  |
| plugins/dsh-extra-plan/scripts/generate-runtime-defaults.mjs | checkOutput | L418-422 | --check 只读确认目标存在且与渲染文本逐字一致，不创建临时文件或改变 mtime。 |  |
| plugins/dsh-extra-plan/scripts/generate-runtime-defaults.mjs | publishFsOpsOf | L427-430 | 合并可注入的发布阶段 fs 操作；未覆盖项使用冻结的默认 node:fs 操作。 |  |
| plugins/dsh-extra-plan/scripts/generate-runtime-defaults.mjs | errorText | L432-434 | 将异常转换为可读错误文本，供发布/恢复诊断保留首错。 |  |
| plugins/dsh-extra-plan/scripts/generate-runtime-defaults.mjs | uniquePaths | L436-438 | 按首次出现顺序去重发布临时/备份路径。 |  |
| plugins/dsh-extra-plan/scripts/generate-runtime-defaults.mjs | cleanupPublishFiles | L440-450 | 按唯一路径清理本次临时/备份文件，并收集清理失败残留。 |  |
| plugins/dsh-extra-plan/scripts/generate-runtime-defaults.mjs | restorePublishedEntry | L452-465 | 按原先存在状态逆序恢复已发布目标或删除本次新目标，返回恢复错误文本或 null。 |  |
| plugins/dsh-extra-plan/scripts/generate-runtime-defaults.mjs | publishFailure | L467-479 | 组合发布阶段、首错、恢复/清理错误和残留路径，构造非成功诊断并保留 cause。 |  |
| plugins/dsh-extra-plan/scripts/generate-runtime-defaults.mjs | normalizedOutputEntries | L481-490 | 解析并拒绝重复规范化输出路径，返回稳定的生成目标清单。 |  |
| plugins/dsh-extra-plan/scripts/generate-runtime-defaults.mjs | publishGeneratedOutputs | L492-554 | 为全部目标排他创建同目录临时/备份，暂存后顺序发布；中途失败逆序有限回滚并保留真实诊断和材料。 |  |
| plugins/dsh-extra-plan/scripts/generate-runtime-defaults.mjs | generateRuntimeDefaults | L562-628 | 先完整校验、渲染、编译并规范化 runtime/definition/4 角色/client 全部目标；默认仓库七输出，自定义 source/output 默认关闭 client；`--check` 只读，普通模式统一暂存/顺序发布并有限回滚，失败保留旧字节及诊断。 | 迁移顺序：先生成新导出，再切消费者 |
| plugins/dsh-extra-plan/scripts/generate-runtime-defaults.mjs | invokedAsMain | L630-633 | 跨平台判断脚本是否作为 CLI 主入口运行 |  |

---

*本文件由脚本增量维护；直接编辑功能描述/备注列是安全的。*
