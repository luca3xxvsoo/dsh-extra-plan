# 代码地图（dsh-extra-plan）

> **维护分工**：行号区间/增删行由脚本 node pe-test/tools/代码地图生成.mjs 增量同步；**功能描述、备注、以及「意图速查」整节由 AI/人维护**（脚本刷新不会覆盖）。
> **用法**：先看「意图速查」按意图词找函数名 → 再到「函数索引」按函数名取行号区间 → read 该区间。
> 上次同步：2026-11-08 17:07:17（脚本自动更新时间戳行）

## 意图速查（人工维护：意图词 → 函数名；行号请到下方「函数索引」按函数名取）

> 用法：拿用户/AI 口里的词在「想找什么」列 grep → 得函数名 → 到「函数索引」grep 该函数名 → 取行号区间 → read 该区间。
> 本节引用的函数名若不存在于索引，生成脚本会报 `[导航失效]`（防止入口过期）。

| 想找什么（含同义词/英文标识） | 文件 | 函数名 |
|:--|:--|:--|
| 双根路径策略／H-W 用途与 Other 拒绝／变量、drive-relative、链接与最近父级边界／只读能力和写入预检 | plugins/dsh-extra-plan/lib/path-policy.js | createPathContext、resolveWorkspacePath、resolveHostPath、assertAllowedPath、validateReadTarget、prepareWriteTarget |
| W 工作区／fixture、证据与隔离环境（结构锚、W-only、无用户目录探测） | pe-test/_shared/workspace-paths.mjs | getWorkspaceRoot、makeFixtureDir、resolveEvidencePath、createIsolatedEnv |
| 显式 Host 代码验证根／受控预加载／缺根拒绝（不回退 profile） | pe-test/_shared/host-preload.mjs | explicitInstallRoot |
| 四级闸门／路由确认／目的确认／批准／流程状态（route/purpose/clarified/approved；普通与 PTC ask 分别解码后统一推进；拒绝/取消/通道故障边界不变） | index.js、plugins/dsh-extra-plan/lib/gate-decisions.js | deriveFlowState、applyAskOutcome、mainGateReason、routeDenyReason、gateAskDenyReason、validateGateAskStructure、matchPurposeLabel |
| 探查预算／额度／剩余次数／耗尽（exploreBudget/budget；剩余 ≤3 注入的提醒消息 source 用生产者自有 kind `plugin:dsh-extra-plan`——v4 行准入禁旧包裹 `plugin`） | plugins/dsh-extra-plan/lib/planner-budget.js、index.js | toolCallCount、toolCallsSinceUser、withPlannerPromptSuffix、budgetNoticeText、budgetReminderText、budgetReminderMessage、budgetReminderSent、budgetExhaustedReason、budgetExceeded |
| run_code 组判定／绕道拆解／调用点扫描（decompose） | plugins/dsh-extra-plan/lib/run-code-static.js、plugins/dsh-extra-plan/index.js | decomposeRunCode、collectRunCodeSites、runCodeGroupDenyReason |
| run_code 多调用容错／教学文案（容错检查开关） | plugins/dsh-extra-plan/lib/run-code-static.js | runCodeCatchGateReason |
| ask 结果返回用户层／返回链闸门 | plugins/dsh-extra-plan/lib/run-code-static.js | askUserQuestionReturnGateReason |
| 单实例调用点上限／循环放大 | plugins/dsh-extra-plan/lib/run-code-static.js | runCodeSiteCount、runCodeDispatchGateReason、runCodeDispatchCapText |
| job_output 禁 wait:true／同 job 查重／放行后记录计数器 | index.js | jobOutputGateReason、recordJobOutputCall |
| job_kill 仅直行放行／main send_message 方向限制／job_list·list_agents 同锚点防轮询／child 控制工具硬拒 | index.js、lib/gate-decisions.js | mainGateReason、childControlGateReason、pollGuardGateReason、recordPollGuardCall |
| 原始 child 预审／直呼与 run_code 成员控制拒绝（unknown/断链也覆盖） | index.js、plugins/dsh-extra-plan/lib/agent-session.js、plugins/dsh-extra-plan/lib/gate-decisions.js | apply、isSubagentChild、childControlGateReason、runCodeGroupDenyReason |
| 命令文本提取／写操作判定／只读角色 shell 拒绝文案／触发依据（write/拦截） | plugins/dsh-extra-plan/lib/shell-mutation.js、plugins/dsh-extra-plan/lib/gate-decisions.js、index.js、plugins/dsh-extra-plan/lib/run-code-static.js | commandTextOf、pwshCommandOf、bashCommandOf、mutationTextEvidence、pwshMutationEvidence、bashMutationEvidence、mutationTextMatches、pwshMutationMatches、bashMutationMatches、withShellEvidence、shellMutationReason、runCodeTextOf、codeMutationHints |
| 锚定引导／F-L 首轮极简／bootstrap／HN-HB-HP／F 段 tool:read 手写文案（bootstrapReadHint） | index.js、plugins/dsh-extra-plan/lib/assembly-presentation.js | isBootstrapPhase、projectAssemblyForPresentation |
| A/C/M 展示投影／C7 过滤／Pure PTC 手写 read（变量② bootstrapReadHint）／SDK 重建 | index.js、plugins/dsh-extra-plan/lib/assembly-presentation.js | projectAssemblyForPresentation、renderFilteredToolsSdk、resolveToolsSdkRenderer、filteredCordisSchemas、sdkSchemasForRendering、toolSdkSchemasOf |
| P2-2 SDK 文本复用／agent-only（仅 Agent）cache／F-L 分离／三元组失效／dispose-restart／失败不缓存／并发合并／计数硬门槛 | index.js、plugins/dsh-extra-plan/lib/assembly-presentation.js、plugins/dsh-extra-plan/lib/sdk-text-cache.js | createSdkTextCache、sdkSchemasFingerprint、sdkTextCacheEntryMatches |
| skill catalog 暂隐／普通 skill 保留／HP1 | index.js、plugins/dsh-extra-plan/lib/assembly-presentation.js | skillCatalogEntriesOf、renderSkillCatalogText、projectSkillCatalogDecision、shouldHideCreativeCatalog |
| durable context gate／F-L source 过滤／agent-instructions／skill-catalog／按 kind context 去重／Session surface | index.js、plugins/dsh-extra-plan/lib/gate-decisions.js | filterBootstrapContextDecision、dedupeProjectedContextDecision、isBootstrapPhase、isAnchoredContextGate |
| 方案/询问工具在未确认路由下的拒绝文案（plan route） | index.js | planDenyReason |
| 批准前禁委派（approval deny） | index.js | approvalDenyReason |
| 规划子代理分支闸门（planner 写禁+预算） | index.js | plannerGateReason、shellMutationReason |
| 会话事件快照／角色常量与身份识别（ROLE_IDS/ROLE_ORDERS 只描述身份与顺序，不承载权限）／单次快照复用（execEvents）／planner descriptor 缓存／usage 血缘上下文 | lib/agent-session.js、lib/agent-runtime.js、lib/runtime-lifecycle.js、lib/role-contract.js、index.js | sessionEvents、isSubagentChild、isLiveDelegation、createAgentRuntime、applyChildPolicy、isChild、isPlannerChild、toolSchemasOf、usageContextOf、usageRootOf、childBaseline |
| 启动扫描 usage 聚合／覆盖式更新／路径授权（会话日志扫描入口在 startupArchive + scanUsageRows；写入按九字段身份覆盖式合并、单调性保护、temp→rename 原子发布；默认账本路径按 H/W 用途和 pathContext 判定，统计只读快照不负责归档事务） | plugins/dsh-extra-plan/lib/usage-ledger.js | enumerateSessionLogs、scanUsageRows、ensureLedgerDirectory、publishArchive |
| 会话状态生命周期／disposed 收尾／启动扫描聚合与单调性保护／root 与自身 session 血缘（断链/循环仍以空 root 合法落账；rootSessionId/agentPreset 可空，非法 context 拒绝）／四桶字段（provider、input/cacheRead/cacheWrite/output）／账本按九字段身份恒等一行、重复扫描结果恒等、本次扫描小于现状保留旧值并告警一次 | index.js、lib/agent-runtime.js、lib/usage-ledger.js | usageContextOf、usageRootOf、mergedArchiveGroups、archiveRowOf、noteRunCodeSubCall、childBaseline |
| 启动归档／插件内置自动归档／H 默认账本唯一严格归档（settings 行 apply 期执行一次启动扫描；archiveLedger/startupArchive 共用严格解析、身份唯一性校验、九字段身份聚合、四桶覆盖式更新、白名单过滤、序列化与 temp→rename 原子发布；单调性保护保留旧值并告警；预算 STARTUP_ARCHIVE_BUDGET_MS=3000ms 在各阶段检查点均生效，会话日志读取本身只读且不占写入互斥，archive-failed.log 留痕，锁忙跳过，绝不阻断启动；账本路径由启动归档固定拼接为该文件，配置项 usageLedger.path 已退役、无运行期消费者；首行说明行位置与固定15键校验由本实现负责，options.onCheck 仅测试探针） | plugins/dsh-extra-plan/lib/usage-ledger.js | archiveLedger、startupArchive、startupArchiveUnsafe、parseStrictLedgerText、assertUniqueArchiveRows、archiveTextOf、publishArchive、reportFailure、recordDiagnostic、acquireArchiveLock |
| 方案与验收落盘／save_plan 双写（逐文件操作与 M 点合同；修改前范围/唯一原文锚点→未来验收定位；真实源核实与行漂移取证；主会话侧任意路由态放行的受限规划工件，仅写 cwd/.extra-plan；工具不自动调度） | lib/save-tool-factories.js、lib/save-contract.js、index.js | defineSavePlan、registerSavePlan、saveArtifactBase |
| 落盘单次提交／有限清理（atomic/commit） | lib/save-persistence.js、index.js | atomicCommit |
| 线索落盘／save_probe／证据报告（probe/evidence；限制值唯一来自 `save-contract.js#PROBE_LIMITS`；step-00 PR23/PR34/PR35 回归；主会话侧放行条件保持现状——route=plan + 目的已定 + 澄清完成；extractProbeEvidenceRefs 顺序固定：整体成对剥除（循环）→ 按顿号/分号/竖线拆分 → 逐段成对剥除 + trim → 过滤空串 → 去重；拆分符与剥除集均不含空格、半角逗号、`.`、`/`，单侧一律不剥） | lib/save-contract.js、lib/save-probe-validation.js、lib/save-tool-factories.js、index.js | validateProbe、renderProbeMarkdown、extractProbeEvidenceRefs |
| save_plan 限制值／内部确定性 summary／双路径 ContentBlock 投影（SAVE_PLAN_LIMITS；formatSavePlanSummary 保留内部摘要口径，renderSavePlan 只把 paths 投影为唯一 text ContentBlock；并保留 save_probe 合同） | lib/save-contract.js | sanitizeTaskName、timestamp、sessionTagOf、saveArtifactBase、formatSavePlanSummary、renderSavePlan、renderProbeMarkdown、renderSaveProbe、extractProbeEvidenceRefs |
| save_probe 校验／路径存在性与聚合拒绝 | lib/save-probe-validation.js | validateProbe、probePathOf |
| save 工具工厂／严格校验顺序／paths-only／真实源核实 owner／W pathContext | lib/save-tool-factories.js | pathContextOf、resolveWorkspaceEntry、createSaveToolFactories、defineSavePlan、resolveSaveContext、verifyPlanSources、defineSaveProbe |
| save_plan 模式／任务块／卷首职责与块边界／逐文件与修改点解析 | plugins/dsh-extra-plan/lib/save-plan-validation.js | parseTaskDocument、validateIds、validateTaskShape |
| save_plan 路径／资源／文件所有权与组 DAG（initialState 仅静态资格）／文件点与定位摘要 | plugins/dsh-extra-plan/lib/save-plan-validation.js | pathIssue、parseResources、validatePlanRelations、buildInternalOrder、buildSummary |
| save_plan 检查引用／验收组／收尾全局／早拒／双文档文件点映射 | plugins/dsh-extra-plan/lib/save-plan-validation.js | parseCheckRefs、validateChecks、validateClosure、validateGlobal、validateSavePlanContract |
| step-00／step-06 save_plan 通用合同回归覆盖（模式、任务/组 DAG、资源/检查引用、收尾/全局、摘要/早拒、paths-only 与零副作用） | pe-test/tools/step-00-全流程回归.mjs、pe-test/tools/step-06-线索落盘.mjs |  |
| 五份文档的通用派遣／验收边界（工件自包含；执行组与人数分离；执行者自检与 reviewer 验收分离；冻结、证据复用、失败复验、生产与 HUMAN 边界） | READAI.md、pe-test/docs/ai-概览.md、pe-test/docs/ai-机制设计.md、pe-test/docs/ai-流程备查.md、pe-test/docs/ai-维护手册.md |  |
| PTC F→L／native HN 与 ptc 聚合面实机取证 | pe-test/docs/ai-实机闸门测试流程.md |  |
| 实机子代理模型／提供方／planner 引导取证（A42/A43、C11/C12、HUMAN；显式 `--session`+`--sessions-dir`（宿主数据根加 `--host-root`、直接 child 加 `--discover-children`）+ 显式 `PLANNER_PROMPT_SUFFIX`；默认索引与 `--full` 原文/raw 分层；request/header attempted route（尝试路由） 与 assistant/message actual provenance（实际来源） 分栏；suffix 等级与 exact match；共享定位器显式有界选择只解析命中直接 child（上限 512 候选/单日志头 262144 字节）） | pe-test/tools/step-07-子代理模型与引导取证.mjs |  |
| 80格 A/C/M/F-L 路由与目录断言／显式 header catalog 取证 | pe-test/tools/step-04-路由与写闸门.mjs、pe-test/tools/step-04-工具清单查看.mjs |
| MJS 三模式输出合同／有限摘要／稳定 JSON／HUMAN 双通道 raw hash | pe-test/_shared/test-output.mjs、pe-test/tools/一键step测试.mjs |  |
| 探查者委派／禁止 planner 派探查（subagent_probe） | index.js、plugins/dsh-extra-plan/lib/model-routing.js | subagentProbeGateReason、resolveOtherAgentEntry |
| 只读子代理／reviewer 模型只读（验收者/readonly）；reviewer 宿主 workspace-write | index.js | childReadonlyGateReason、shellMutationReason、isReadOnlyChildByCatalog |
| 四角色 definition 工具面／main control 保留／Cordis 只读绑定 | assets/presets/extra-plan/agent.cordis.yml、assets/presets/extra-plan/preset-definition-<role>.generated.yml、index.js | roleDefinitionsWithPresentation、toolSchemasOf |
| child 控制矩阵与宿主角色工具面测试入口 | pe-test/tools/step-00-全流程回归.mjs、pe-test/tools/step-04-路由与写闸门.mjs、pe-test/tools/step-05-角色预设宿主回归.mjs |  |
| 子代理宿主 mode／四角色按本 child 绑定与显式 override 幂等 | lib/agent-runtime.js、index.js | createAgentRuntime、applyChildPolicy、childBaseline |
| 工具目录折叠／PTC 单入口（catalog/ptc） | index.js | catalogIsCollapsed |
| 设置后端／唯一全局 owner／settings-only no-remount（11 项 volatile Config + profileSync settled 镜像；adapter failure 独立；9 热读/2 需重启/gateWords restart；默认对象与 UI metadata 分源） | lib/settings.js、lib/settings-contract.js、lib/preset-settings.js、lib/preset-sync.js | apply、createApiHandler、proPayload、createDefaultSettings、readUnifiedState、findSettingsRow、effectiveRowConfig、resolveUnifiedConfig、restateSettingsConfig、findPluginsRow、applyPlan、mountPresetSync、initialMount、settledSettingsUpdate、structuralHandoff、syncEditor、settledSettings、profileSyncPath、reportProfileSync |
| Web→QQBot profile 同步／documentPath 首选／显式备用／双锚点／局部 YAML 安全写与恢复 | plugins/dsh-extra-plan/lib/qqbot-settings-sync.js；pe-test/tools/step-01-设置页配置.mjs、step-01-qqbot-安装映射.mjs（分别覆盖路径/API、YAML 正负例） | resolveProfilesRoot、findOwnQqbotProfiles、validateSettingsSnapshot、planQqbotSettingsPatch、writeQqbotSettingsPatch、createQqbotSettingsSynchronizer |
| 设置值定位与捕获（source/row/legacy projection locator；11 项全局行 + 旧行安全读取；PUT 兼容入口合并全局值） | lib/preset-settings.js、lib/settings.js、lib/preset-sync.js | captureRowSettings、readProjectedValue、resolveSetting、findTextLocatorMatches、publicField、readLegacyState |
| 配置热读／生效标志／后端权威行更新无需重启（live-config/hot-read；增强 stamp dev/ino/size/mtimeNs/ctimeNs，兼容回退 ino/size/mtimeMs/ctimeMs；当前目标与 pathContext 分层） | plugins/dsh-extra-plan/lib/live-config.js、plugins/dsh-extra-plan/index.js | createLiveConfig、refresh、read、currentResolved、currentContext、readDiskValues、statStamp、pick |
| 预设核对／纯 definition／首次 adapter／旧行非破坏迁移／settled-only 与 structuralHandoff 分离 | lib/preset-sync.js、lib/preset-settings.js | syncPreset、assetDefinition、definitionWithProjection、readUnifiedState、readLegacyState、resolveUnifiedConfig、restateSettingsConfig、declarationBodyMatchesAsset、stripUserWritable、carryUserWritable、pluginRowIds、readDeclaredPluginsFromPatch、applyPlan、structuralFingerprint、mountPresetSync、initialMount、settledSettingsUpdate、structuralHandoff、reportSettledError |
| 同页共享客户端表单／仅经 detail.section 渲染于 bundle 详情页行列表之后（自绘标题；字段常量只来自生成器标记区块；不注册 bundle.config/row/item/tab，本包 bundle.config 槽被任何一方注册条目时 detail.section 让位） | lib/client.js、scripts/generate-runtime-defaults.mjs | apply、SettingsCard、ExtraPlanForm、DetailSettingsSection、registerClientSurfaces |
| qqbot 严格安装／shared sameRealPath 路径比较／可选目标 profile 筛选／兼容自愈建链 | dsh-extra-plan-qqbot（仓库目录 plugins/dsh-extra-plan-qqbot）/lib/heal.js、scripts/heal.mjs | sameRealPath、strictInstall、findOwnQqbotProfiles、healQqbotCompatibility、ensureDshExtraPlanLink |
| 十一项默认值 sourceLocator → DEFAULT_SETTINGS／兼容别名／消费者；纯 definition、四角色 definition 与 client 标记区块生成／last-known-good／事务发布（默认仓库七输出；自定义 client 默认关闭；--check 零写） | lib/preset-settings.js、lib/settings-contract.js、scripts/generate-runtime-defaults.mjs、lib/preset-defaults.generated.js、lib/client.js、assets/presets/extra-plan/preset-definition.generated.yml | resolveTemplateSettingDefault、runtimeDefaultsFromTemplate、renderRuntimeDefaults、renderClientFieldBlock、renderClientFields、renderPresetDefinition、topLevelRowsOf、generateRuntimeDefaults、normalizedOutputEntries、publishGeneratedOutputs、checkOutput |
| 闸门关键词单一来源／7 词唯一手工编辑位／prompt variable 注册／旧词拒绝／严格校验（gateWords/extra_plan_*） | plugins/dsh-extra-plan/assets/presets/extra-plan/agent.cordis.yml、plugins/dsh-extra-plan/lib/gate-words.js、index.js | validateGateWords、createGateRuntime、normalizeGateLabel、matchExactKind、deriveFlowState、mainGateReason |
| gateWords 启动核对／厂商模板整组校验／旧声明行 carry（无破坏性迁移） | plugins/dsh-extra-plan/lib/preset-sync.js | syncPreset、readDefinitionGateWords、assertTemplateGateWords、readLegacyState |
| runtime-static 纯 helper（cause-chain） | lib/runtime-static.js | causeChainOf |
| 普通/PTC ask 解码／拒绝中文呈现／状态推进（闸门拒绝不重置路由、取消仍清四字段；HOST_ASK_CANCEL_TEXTS 宿主取消句） | plugins/dsh-extra-plan/lib/gate-decisions.js、index.js | parseAskResultData、parseDispatchAskResult、askResultTextIsDenied、firstTextOfBlocks、applyAskOutcome、deriveFlowState |
| 代码地图自身维护／口径／严格模式 | pe-test/tools/代码地图生成.mjs（不在索引范围，读文件头注释） |  |
| 新载体选型与 isolate 审计（纯 definition／官方 adapter／三组 isolate 名单：extra-plan-group.extraPlan · compaction.compaction+toolResultPruner · delegation.subagentModelSelection） | plugins/dsh-extra-plan/assets/presets/extra-plan/agent.cordis.yml、plugins/dsh-extra-plan/assets/presets/extra-plan/preset-definition.generated.yml、READAI.md（「当前兼容与安全边界」「真相源短表」） |  |
| 创造 skill 静态注册／bundledSkillDir／C=0 与 C=1 的 catalog 语义（skill-filesystem 行的 config.bundledSkillDir 指向 agent-preset 包内 skills/ 且 watch: false——0.2.0-rc.2 换通道修法，旧 customSkillDirs 经 ctx.fs 扫 asar 抛非 absent 错；「不注册」已改为 catalog 隐藏） | plugins/dsh-extra-plan/assets/presets/extra-plan/agent.cordis.yml、plugins/dsh-extra-plan/lib/assembly-presentation.js、plugins/dsh-extra-plan/index.js | shouldHideCreativeCatalog、projectSkillCatalogDecision、skillCatalogEntriesOf、renderSkillCatalogText |
| 0.1.7 服务名换代／ptcRuntime／SDK renderer 语言取值 | plugins/dsh-extra-plan/index.js、plugins/dsh-extra-plan/lib/assembly-presentation.js | apply、resolveToolsSdkRenderer、renderFilteredToolsSdk、sdkSchemasForRendering |
| tool-jobs 完成通知解锁（`agent/inbox/claimed` 同步主入口 + `tools/pre-execute` durable snapshot fallback；两入口共用 `consumeToolJobsNotice`；严格校验非空 `message.id`、source.kind=tool-jobs/form=notice 与正文 /background job (\S+)/；session 内以 notice `message.id` 判重，同 id 跨 claimed/durable 幂等，不同 id 即使复用 jobId 也代表新通知实例；双动作：①jobId 只清当前 session 对应的 job_output 计数 ②job_list/list_agents 轮询守卫 pollGuardCounters 清整表；consumed 在双解锁后写入，用户/agent-message 锚点不删 notice-id Set，disposeSession 才回收，重复/坏输入零副作用；HK9：旧 plugin kind 已废） | plugins/dsh-extra-plan/index.js | consumeToolJobsNotice、apply、recordJobOutputCall、jobOutputGateReason、pollGuardGateReason |
| agent/created 钩子（serial；agent/session-start 已删除）／会话启动基线＋save_plan/save_probe 注册，整块吞错不阻断会话创建 | plugins/dsh-extra-plan/index.js（agent/created 调用点）、plugins/dsh-extra-plan/lib/agent-runtime.js（childBaseline/isPlannerChild 定义）、plugins/dsh-extra-plan/lib/agent-session.js（isSubagentChild 定义） | apply、childBaseline、isPlannerChild、isSubagentChild、registerSavePlan、registerSaveProbe、probeClaimFor |
| MALFORMED_RESPONSE 限次自愈／请求失败兜底 retry／注入模型可读提示（source.kind 用生产者自有 `plugin:dsh-extra-plan`；developer/message 须自带 ≥1 的 turn/step，宿主 append 不补坐标；坐标缺失/非正整数 → 不注入但仍返回 retry） | index.js | malformedRecovery、recordRequestError |
| 会话日志格式 v4 代际／session.v4.jsonl.zstd／共享 session-finder/logPath 三代候选名并存（v4/v3/旧名，未知形状归 v0）；step-06/07 与 step-06-08-v4取证回归 只接受 session.v4.jsonl.zstd | pe-test/_shared/session-finder.mjs、pe-test/tools/step-07-子代理模型与引导取证.mjs |  |

- step-99 文件说明：只读 usage 统计 CLI；默认模式直接读取单一 `ledger-v2.archive.jsonl`（不取锁：写入侧是 temp→rename 原子发布，读者只见完整版本），容错解析与宽松合并计数（坏 JSON、非账本对象、说明行仅计数，零写入）；新增 `--compare` 只读对拍（额外跑现场扫描并按 role→model 对拍，零写盘）；旧 `strict:true` 显式拒绝 `strict-parser-removed`，`--archive` 显式拒绝 `usage-removed`；归档路径与 H/W 访问委托公共 pathContext/usage-ledger 能力；统计不生产归档事务。
- step-99 统计关键符号（该测试工具不在生成根内，行号不在此维护；按函数名到源码定位；仅作统计说明来源）：`readSnapshots`、`parseLedgerText`、`summarizeSnapshotTexts`、`renderStats`、`statLedger`。
  - 统计读取与输出：`readSnapshots` → `summarizeSnapshotTexts` → `renderStats`；`parseLedgerText` 容错计数 badJson、非账本对象与说明行，不写归档。
  - 旧模式与路径：`parseLedgerText(options.strict=true)` 抛出 `strict-parser-removed`；`main` 前置拒绝 `--archive`/`usage-removed`；账本目标直接由位置参数给定（唯一账本 `ledger-v2.archive.jsonl`，不再经归档入口委托解析）；`--compare` 先由 `hasCompareFlag` 剥离，再走 `readLedgerReadOnly` 只读对拍。
  - 统计只汇总单一 `ledger-v2.archive.jsonl`（不取锁，写入侧 temp→rename 原子发布）；严格解析、首行位置、固定键与唯一性校验、归档序列化与事务发布全部归 plugins/dsh-extra-plan/lib/usage-ledger.js 的 `archiveLedger`/`startupArchive` 及其内部函数。
  - `lib/usage-ledger.js` 负责扫描聚合、覆盖式更新、单调性保护、白名单与一次 `O_EXCL` 简易互斥；统计读取链路（`parseLedgerText`/`summarizeSnapshotTexts`）是 step-99 自建解析与聚合副本、不 import lib 的聚合实现，仅 `--compare` 才额外调用 lib 的 `scanUsageRows` 取现场扫描，不等于生产归档事务。
  - 归档测试/启动路径应调用 `archiveLedger`/`startupArchive`；统计 CLI 不提供归档实现。
  - 本段不维护机器行号；函数名须在默认机器索引中可导航，step-99 仅作人工说明来源。
  - CLI：`main`（统计用法；旧 strict/--archive 模式拒绝），`parseCliArgs`（仅统计用法）。

> client.js 设置入口定位：`DetailSettingsSection` 与 `registerClientSurfaces`；设置表单仅经 plugins.detail.section 渲染于 bundle 页行列表之后，若本包 bundle.config 槽被任何一方注册条目则让位保持唯一表单；ConfigForms.get(NS) 订阅快照并一次 mutate 十一项，不注册 bundle.config/row.config/settings.plugins.tab/plugins.item。

> QQBot 环境验证：`pe-test/tools/step-01-qqbot-环境验证.mjs` 的 `buildPreflight`（五条件/缺失码）、`probeJunctionCapability` 与 `runJunctionFixture`（能力探针/临时 fixture（夹具））、`runLiveReadonly` 与 `inspectMapping`（真实 profile patch/映射只读对拍）；该测试工具不在插件源码生成根，函数行号不手填。

## 文件总览

| 文件 | 行数 | 说明 |
|:--|--:|:--|
| pe-test/_shared/host-deps.mjs | 413 | 解析宿主依赖候选并注册隔离加载钩子 |
| pe-test/_shared/host-preload.mjs | 52 | 测试侧预加载：从显式安装根环境变量解析真实宿主根并导出，缺失或非法即抛错、不回退 profile。 |
| pe-test/_shared/session-finder.mjs | 280 | 按会话ID或目录扫描定位日志并兼容三代命名 |
| pe-test/_shared/session-fixture.mjs | 76 | step-06-08-v4取证回归专用夹具：session/request-header/tool-call/tool-result 事件构造、session.v4.jsonl.zstd 落盘、zstd 帧与多帧/可跳过帧构造；11 项导出（canonicalResultMessage 私有未导出） |
| pe-test/_shared/test-output.mjs | 176 | 统一compact、verbose、full输出合同与raw证据哈希 |
| pe-test/_shared/v4-tool-result.mjs | 36 | 识别v4会话日志并提取tool result |
| pe-test/_shared/workspace-paths.mjs | 655 | 测试侧工作区路径合同：结构锚定维护根、夹具与隔离环境构造、维护参数解析与目标授权视图。 |
| pe-test/_shared/zstd-frames.mjs | 107 | 解析zstd帧并解码会话文本 |
| plugins/dsh-extra-plan-qqbot/index.js | 33 | qqbot 精简版自愈插件：apply 启动时调 healQqbotCompatibility 自愈（迁移旧错误块+建链），不阻断启动 |
| plugins/dsh-extra-plan-qqbot/lib/heal.js | 654 | 自愈纯函数模块（共享 sameRealPath 路径比较；profileNames 可缩小 profile 候选；定位/旧块迁移/建链；供 index.js/CLI/测试复用） |
| plugins/dsh-extra-plan-qqbot/lib/path-policy.js | 464 | QQBot 包 H/W 双根路径策略：按 QQBot 用途隔离读写边界，覆盖变量、链接、只读能力与写入预检 |
| plugins/dsh-extra-plan-qqbot/scripts/heal.mjs | 273 | CLI 入口：无参仅打印帮助、不自愈；--install 严格安装模式（失败非零）；显式 --host-root/--profile [--dry-run] 仅维护测试；启动自愈由 index.js#apply 调用 |
| plugins/dsh-extra-plan/index.js | 1490 | 核心入口：四级闸门、预算、save 工具注册与生命周期；接线 planner/非 planner 路由、A/C/M 投影、P2-2 cache、usage 启动扫描账本（覆盖式幂等更新）、v4 MALFORMED 自愈。gateWords 只来自 YAML，apply 先校验再副作用；tools/pre-execute 先用原始 `isSubagentChild` 预审 child 控制工具，再进入角色/root 闸门，main 控制与自动最终结果保持。 |
| plugins/dsh-extra-plan/lib/agent-runtime.js | 175 | 每次 apply 的角色识别、descriptor/工具 schema 缓存、usage 血缘上下文与 role baseline、四角色宿主 mode 与显式 override 幂等；不 import index.js |
| plugins/dsh-extra-plan/lib/agent-session.js | 65 | 会话事件与子代理识别的唯一来源：sessionEvents/isSubagentChild 零依赖纯函数，被 index.js 与 lib/model-routing.js 共用（无镜像副本；不 import index.js） |
| plugins/dsh-extra-plan/lib/assembly-presentation.js | 266 | A/C/M 与 skill catalog 模型可见投影；从 scoped tools 读 schema/模式，SDK renderer 按 language 整体重建；F/PTC 的 tool:read 由 index.js 手写，L 段回宿主原文。 |
| plugins/dsh-extra-plan/lib/client-carrier.js | 7 | settings 内部 Loader Group 的无副作用 Client carrier；不对应 bundle row/公开 export。 |
| plugins/dsh-extra-plan/lib/client.js | 324 | 客户端模块加载共享样式/词条与 SettingsCard/ExtraPlanForm；设置表单仅经 detail.section 渲染于当前包详情行列表之后（自绘标题，不注册 bundle.config；若本包 bundle.config 槽出现条目则让位）；后端全局 settings API/Config/旧值迁移与 definition/adapter 由同一 owner 活动。 |
| plugins/dsh-extra-plan/lib/gate-decisions.js | 1085 | 四级闸门与角色分流判定纯函数集 |
| plugins/dsh-extra-plan/lib/gate-words.js | 114 | 闸门关键词共享契约（唯一值源是 YAML 的 config.gateWords）：字段规格 GATE_WORD_FIELDS/GATE_WORDS_GROUP_DEFINITION + 整组严格校验 validateGateWords（错误一律以 extra-plan: config.gateWords 开头）+ 运行时词表 createGateRuntime（显式入参严格校验，无默认词表）；纯模块：不含任何出厂词值、不读文件与环境变量，被 index.js（运行时）与 lib/preset-sync.js（启动自愈）共享（迁移叶 locator 已随跨版本搬迁链删除） |
| plugins/dsh-extra-plan/lib/live-config.js | 298 | 配置热读：仅 9 项运行时 getter；2 项宿主行权威设置只读并派生到内存 definition，不暴露为 getter；构造期读盘一次，后续按增强 stamp（dev/ino/size/mtimeNs/ctimeNs，兼容 ino/size/mtimeMs/ctimeMs）重读；失败整组回退并告警，不读 DSH_HOME 旧目录 |
| plugins/dsh-extra-plan/lib/model-routing.js | 650 | planner/非 planner 子代理模型路由：顶层纯判定函数 + createModelRouting per-apply 工厂（per-instance WeakMap、惰性 llm/agents getter；不 import index.js） |
| plugins/dsh-extra-plan/lib/path-policy.js | 464 | 核心包双根路径策略入口：H/W 用途判定、变量与链接边界、只读能力与写入预检，供各工具复用 |
| plugins/dsh-extra-plan/lib/planner-budget.js | 137 | planner 工具计数、消息后缀/预算提示/耗尽文案；**预算提醒消息经宿主 createUserMessage 构造，source 用生产者自有 kind `plugin:dsh-extra-plan`（v4 行准入禁旧包裹 `plugin`，违者会话当场终止）**；默认预算由生成模块提供，FREE_TOOLS 仍在根入口 |
| plugins/dsh-extra-plan/lib/preset-defaults.generated.js | 17 | 由 YAML 模板生成的十一键 `DEFAULT_SETTINGS` 与兼容别名 runtime fallback（回退）常量；generated（生成）/do not edit（勿手改） |
| plugins/dsh-extra-plan/lib/preset-settings.js | 3 | 11 项设置描述与 YAML 定位；settings 行是权威值，声明行只投影 2 项宿主行；capture/投影读取、plugins 行整体重述。 |
| plugins/dsh-extra-plan/lib/preset-sync.js | 1161 | 读取并严格校验纯 definition；旧 preset-extra-plan/extra-plan-preset-sync 仅安全读取迁移，统一全局行补齐后派生 definition 并由同一 owner 挂载官方 AgentPreset；新写入仅经唯一全局行 configEditor.edit；mountPresetSync 以通用 settled 回调交付最终十一项/gateWords。 |
| plugins/dsh-extra-plan/lib/preset-yaml.js | 476 | 预设 YAML 纯职责模块：解析、行与叶定位及歧义分类、权威与投影值捕获。 |
| plugins/dsh-extra-plan/lib/qqbot-settings-sync.js | 1092 | Web documentPath 首选、显式 DSH_HOME 备用、双锚点 profile 扫描、完整 11 项/gateWords 安全快照、局部 YAML 保格式写入、排他临时/备份/恢复与串行同步队列；不读用户目录、不触碰未知根。 |
| plugins/dsh-extra-plan/lib/role-contract.js | 11 | 冻结角色 ID/order 数组，并由同一 ROLE_IDS 数组派生 planner/reviewer/prober preset ID；只提供身份与装配顺序，不承载权限、沙箱或生命周期策略。 |
| plugins/dsh-extra-plan/lib/run-code-scanner.js | 360 | run_code 无宿主状态词法扫描器：字符串/注释遮蔽、括号配平、tools 调用点收集与动态访问判定。 |
| plugins/dsh-extra-plan/lib/run-code-static.js | 571 | run_code 纯静态解析/理由模块：安全 JSON/JS literal 解析、动态 argsText 瀑布兜底、写模式 hint、工具组拆解、ask 返回值白名单、调用点计数与当前 PTC dispatch cap；仅显式注入普通依赖，不持有宿主状态。 |
| plugins/dsh-extra-plan/lib/runtime-lifecycle.js | 158 | per-apply 运行时生命周期：save 工具注册、probe 名额认领与 run_code 子调用计数/拒绝记录，状态在闭包内并按会话清理 |
| plugins/dsh-extra-plan/lib/runtime-static.js | 15 | 显式参数纯 helper：causeChainOf 解析 cause 链；不持有宿主状态 |
| plugins/dsh-extra-plan/lib/save-contract.js | 263 | save 合同唯一真源：任务名/sessionTag/base、SAVE_PLAN_LIMITS 与内部确定性 summary、paths-only ContentBlock 投影、PROBE_LIMITS、Markdown 渲染与证据引用清洗；无宿主状态，运行时限制只在本文件维护。 |
| plugins/dsh-extra-plan/lib/save-persistence.js | 112 | 单次调用阶段感知提交：mkdir→临时文件逐项写入→逐项检查并顺序发布；失败保留首错/阶段，仅清理本次临时与已发布半套工件，清理失败附残留路径与原因，预存目标不覆盖；不创建/扫描/恢复跨调用 journal；末位 fs 依赖可注入。 |
| plugins/dsh-extra-plan/lib/save-plan-validation.js | 1231 | save_plan 文本合同校验：模式/任务/路径所有权/依赖与执行组 DAG/资源/检查引用与验收组/收尾全局/摘要早拒；不启动代理或执行命令。 |
| plugins/dsh-extra-plan/lib/save-probe-validation.js | 175 | save_probe 参数校验：数组/条目/长度/总量/path 存在性/range/evidence 聚合拒绝 |
| plugins/dsh-extra-plan/lib/save-tool-factories.js | 389 | 显式依赖工厂：save_plan 按类型/长度→合同/摘要→context/base→证据 IO→单次 atomicCommit 严格接线；合法正文逐字保存、structured output 仅 paths、render 仅将两个 paths 投影为唯一 text ContentBlock；save_probe 保留既有证据诊断与落盘；不缓存 ctx/agent/会话状态。 |
| plugins/dsh-extra-plan/lib/sdk-text-cache.js | 161 | apply 级 agent-keyed WeakMap SDK 文本缓存：完整 renderer 输入保守指纹、language/renderer 身份比较、并发 Promise 合并、reject/过期 Promise 不回写、dispose 回收；不持有 sessionId 或 PromptAssembly |
| plugins/dsh-extra-plan/lib/settings-contract.js | 210 | 服务端设置 descriptor 单一合同：11 项的类型/生成默认引用/校验/UI metadata 与权威-投影双定位器，并导出 `createDefaultSettings`、分组与投影遍历源 |
| plugins/dsh-extra-plan/lib/settings.js | 758 | 11 字段 volatile Config、页面策略与 loopback GET/PUT；权威值在唯一 settings 行，PUT 先拒绝空/null/数组/原始/未知/非法混合载荷并严校验当前 gateWords，再只 edit 全局行，no-op 也重读最终快照并等待 profileSync，结构化区分 synced/not-installed/unavailable/failed/partial。 |
| plugins/dsh-extra-plan/lib/shell-mutation.js | 428 | 跨平台命令文本解码与 pwsh/bash 写形态判定；纯函数、不持有 apply 状态 |
| plugins/dsh-extra-plan/lib/usage-ledger.js | 1116 | 账本唯一实现：扫描聚合 + 覆盖式更新 + 启动入口（常量与身份键 → 扫描 %DSH_HOME%/sessions 下 v4 会话日志并按九字段身份聚合 → 读现有 archive 后覆盖式更新、单调性保护、说明行、temp→rename 原子发布 → startupArchive 启动入口）；固定15键（rootSessionId/agentPreset 可空）、四桶口径、严格白名单、一次 `O_EXCL` 简易互斥（拿不到即跳过、不接管不删他人锁），失败只留痕、绝不阻断启动。 |
| plugins/dsh-extra-plan/scripts/generate-runtime-defaults.mjs | 792 | 从 agent.cordis.yml 校验并生成 runtime 默认常量、纯主/角色 definition 与 client 标记区块（顶层结构逐字平移并保留 group/isolate/!!js）；默认仓库七输出，自定义 client 默认关闭；支持 --check 且坏源不覆盖 last-known-good（上次已知良好版本） |

## 函数索引

| 文件 | 函数 | 行号 | 功能描述 | 备注 |
|:--|:--|:--|:--|:--|
| pe-test/_shared/host-deps.mjs | samePath | L15-17 | 测试侧：以 relative 结果为空判定两条路径同指一处，不做大小写归一与真实路径解析。 |  |
| pe-test/_shared/host-deps.mjs | isWithinRoot | L19-23 | 测试侧：判定候选绝对路径是否位于根内（可等于根），非绝对或越界返回假，只做词法比较。 |  |
| pe-test/_shared/host-deps.mjs | explicitPath | L25-31 | 测试侧：以显式安装根构造路径上下文并返回规范化根，失败转成带标签的说明性错误文本。 |  |
| pe-test/_shared/host-deps.mjs | assertWithinRoot | L33-37 | 测试侧：根缺失或候选落在根外即抛错，根内则原样返回候选，供后续探查前统一拦截把关。 |  |
| pe-test/_shared/host-deps.mjs | physicalRoot | L39-51 | 测试侧：对显式根取 realpath 并校验为可读目录，无法证明真实路径即抛错，不探测其它根。 |  |
| pe-test/_shared/host-deps.mjs | proveCandidate | L53-92 | 测试侧：从候选沿父链逐级 lstat 与 realpath，证明每级都在真实根内，并返回候选路径证据。 |  |
| pe-test/_shared/host-deps.mjs | checkHostResolvedResult | L94-105 | 测试侧：要求宿主解析结果为 file URL、落在显式根内且指向真实文件，否则抛出说明性错误。 |  |
| pe-test/_shared/host-deps.mjs | isHostSpecifier | L107-109 | 测试侧：判定请求说明符是否属于宿主包（js-yaml 或 @deepseek-ai 作用域），其余视为普通模块。 |  |
| pe-test/_shared/host-deps.mjs | explicitInstallRoot | L111-115 | 测试侧：读取并规范化安装根环境变量，缺失即抛错，不探测 profile、全局前缀或家目录。 |  |
| pe-test/_shared/host-deps.mjs | anchorCandidates | L117-131 | 生成宿主依赖锚点目录候选并去重 |  |
| pe-test/_shared/host-deps.mjs | exportTarget | L133-150 | 从依赖入口导出目标包的指定绑定 |  |
| pe-test/_shared/host-deps.mjs | entryOf | L152-175 | 解析宿主依赖导出入口并校验路径 |  |
| pe-test/_shared/host-deps.mjs | findHostAnchor | L177-198 | 选择可用宿主包锚点并报告候选来源 |  |
| pe-test/_shared/host-deps.mjs | scopedEntryOf | L200-210 | 解析scoped包的本地入口路径 |  |
| pe-test/_shared/host-deps.mjs | buildAsyncHookSource | L212-345 | 构造异步import钩子源码供隔离宿主依赖 |  |
| pe-test/_shared/host-deps.mjs | registerHostDeps | L349-413 | 注册测试所需宿主依赖并校验实际版本 |  |
| pe-test/_shared/host-deps.mjs | resolveScoped | L364-370 | 解析scoped宿主包候选路径 |  |
| pe-test/_shared/host-deps.mjs | resolveBare | L371-377 | 解析非scoped宿主包候选路径 |  |
| pe-test/_shared/host-deps.mjs | resolveOne | L379-391 | 按包名统一尝试scoped与bare解析 |  |
| pe-test/_shared/host-preload.mjs | preloadError | L8-13 | 构造带 host-preload 前缀、错误码与冻结明细的错误对象，供预加载各失败分支统一抛出。 |  |
| pe-test/_shared/host-preload.mjs | isAbsolute | L15-18 | 按当前平台判定绝对路径：win32 兼容盘符与 UNC 前缀，其它平台要求前导斜杠，不做存在性检查。 |  |
| pe-test/_shared/host-preload.mjs | explicitInstallRoot | L20-47 | 测试侧：校验安装根环境变量，拒绝空值、变量、家目录缩写、URI 与盘符相对路径，再取真实目录。 |  |
| pe-test/_shared/session-finder.mjs | errorCodeOf | L13 | 取出异常的 code 字符串，非对象或无 code 时返回空串，供上层按错误码分流处理 |  |
| pe-test/_shared/session-finder.mjs | errorMessageOf | L14 | 把异常收敛为可读消息文本，Error 取 message，其它值直接转字符串且不抛错 |  |
| pe-test/_shared/session-finder.mjs | isMissingTarget | L15 | 判断异常是否为目标缺失或类型不符，仅这两种错误码返回真，其它错误码一律返回假，不抛错 |  |
| pe-test/_shared/session-finder.mjs | isAbsolute | L16 | 判断传入值是否为非空字符串且属于绝对路径，非字符串直接返回假，不做路径解析也不抛错 |  |
| pe-test/_shared/session-finder.mjs | pathKindOf | L17-20 | 按显式 kind 选项决定路径分类，未指定时绝对路径返回未定、相对路径按工作区处理 |  |
| pe-test/_shared/session-finder.mjs | contextOf | L22-35 | 把调用选项归一为带 pathContext 的维护上下文，缺上下文时按维护参数现建，缺字段抛错 |  |
| pe-test/_shared/session-finder.mjs | hasHostRoot | L37 | 判断上下文是否带非空 hostDataRoot 字符串，用于决定是否再尝试宿主根解析 |  |
| pe-test/_shared/session-finder.mjs | readTarget | L38-41 | 按分类解析目标并做真实根与链接校验，校验失败抛错，成功时返回含真实路径的可读视图 |  |
| pe-test/_shared/session-finder.mjs | tryReadTarget | L42-44 | 读目标的宽松版：目标缺失或类型不符时返回 null，其它错误照常向上抛出，不吞掉权限类错误 |  |
| pe-test/_shared/session-finder.mjs | authorizedAnyPath | L45-58 | 按候选分类顺序尝试授权解析，目标缺失类错误依次降级，根逃逸类错误立即上抛，不越权兜底 |  |
| pe-test/_shared/session-finder.mjs | authorizedLogPath | L59-71 | 在授权目录内按候选日志名逐个探测，命中即返回，全部缺席时返回 null 而不抛错，供上层判空 |  |
| pe-test/_shared/session-finder.mjs | authorizedSessionLogPath | L72-75 | 对外导出的会话日志定位入口：缺少 pathContext 直接抛错，其余委托授权探测 |  |
| pe-test/_shared/session-finder.mjs | authorizedSessionReadPath | L76-84 | 对外导出的会话读取路径校验：缺 pathContext 抛错，返回通过校验的真实路径 |  |
| pe-test/_shared/session-finder.mjs | logPath | L85-88 | 在目录中按v4、v3、旧名顺序寻找会话日志 |  |
| pe-test/_shared/session-finder.mjs | incompleteError | L92 | 构造带 INCOMPLETE 错误码的会话头不可判定异常，供上层归一为 incomplete 结果 |  |
| pe-test/_shared/session-finder.mjs | insideRealRoot | L93-96 | 判断目标真实路径是否落在给定真实根内，相等或为其子路径为真，越根或跨盘为假，不抛错 |  |
| pe-test/_shared/session-finder.mjs | isLinkPath | L97-106 | 三重判定路径是否为链接：真实路径不等、lstat 判符号链接、readlink 成功，异常吞掉 |  |
| pe-test/_shared/session-finder.mjs | normalize | L100 | 按平台归一化路径：Windows 下转小写，其余只归一分隔符，供链接判定时逐对比较使用 |  |
| pe-test/_shared/session-finder.mjs | validatedView | L107-112 | 把视图对象校验成可信读目标：策略目标直接校验，分类路径走授权解析，非法返回 null |  |
| pe-test/_shared/session-finder.mjs | readDiscoveryHead | L113-177 | 在字节与候选上限内增量读取会话日志头帧，取出首个会话元数据，坏帧与超限归为不可判定 |  |
| pe-test/_shared/session-finder.mjs | metaOf | L125-130 | 从已解析行提取会话元数据，仅当类型含 session 时返回，否则返回 null 不做猜测 |  |
| pe-test/_shared/session-finder.mjs | processText | L131-153 | 把解压文本按行切分并保留未完成残片，逐行解析首个会话元数据，坏 JSON 归为不可判定 |  |
| pe-test/_shared/session-finder.mjs | idVariants | L178 | 由会话 ID 派生带前缀、裸名与补前缀三种写法，返回集合供宽松匹配与去重时使用，不校验合法性 |  |
| pe-test/_shared/session-finder.mjs | sameId | L179 | 判断两个 ID 字符串是否属同一会话，任一侧非字符串即为假，否则比较派生出的变体集合 |  |
| pe-test/_shared/session-finder.mjs | byName | L180 | 按目录名或会话ID匹配候选 |  |
| pe-test/_shared/session-finder.mjs | directChildren | L181-202 | 枚举主会话目录的直接子目录，按链接、越根、候选上限逐项拦截，并按父会话 ID 过滤 |  |
| pe-test/_shared/session-finder.mjs | selectedGroup | L203-208 | 装配显式选择结果：以主会话目录为基，按开关追加直接子目录，并带上路径分类与根路径 |  |
| pe-test/_shared/session-finder.mjs | explicitPathResult | L209-215 | 把显式路径参数转成选择结果，目录内无会话日志时返回未找到，且不从其子孙目录枚举会话 |  |
| pe-test/_shared/session-finder.mjs | looksLikePath | L216-220 | 判断参数是否形似路径：绝对路径、分隔符、盘符、URL、环境变量与波浪号开头均算路径 |  |
| pe-test/_shared/session-finder.mjs | sessionRootTarget | L221-224 | 取上下文里的会话根目标并校验为可读目录，不可用或类型不符时返回 null，不向上抛错 |  |
| pe-test/_shared/session-finder.mjs | exactIdResult | L225-248 | 按 ID 模式在会话根内匹配变体目录，歧义、链接、越根或缺日志归为未找到或不可用 |  |
| pe-test/_shared/session-finder.mjs | contextSelectionResult | L249-260 | 按上下文里的会话模式分发选择：none 直接返回不探测，id 精确匹配，dir 校验单目录 |  |
| pe-test/_shared/session-finder.mjs | findSession | L261-280 | 返回显式或自动会话定位结果及关联子会话 |  |
| pe-test/_shared/session-fixture.mjs | session | L12 | 入参 id 与可选 fields，返回 session 事件对象 |  |
| pe-test/_shared/session-fixture.mjs | descriptor | L13 | 无入参，返回 subagent/descriptor 事件（continuable） |  |
| pe-test/_shared/session-fixture.mjs | call | L14 | 入参 name/callId/argumentsValue，返回 tool/call 事件，arguments 已序列化 |  |
| pe-test/_shared/session-fixture.mjs | canonicalResultMessage | L15-22 | 私有未导出，被 result/inboxResult/badIdentityResult 复用，产 tool 角色规范消息 |  |
| pe-test/_shared/session-fixture.mjs | result | L23 | 入参 callId/isError/text，返回 tool/result 事件 |  |
| pe-test/_shared/session-fixture.mjs | inboxResult | L24 | 入参 callId/text，返回 agent/inbox/spliced 事件，isError 固定 true |  |
| pe-test/_shared/session-fixture.mjs | badIdentityResult | L25 | 入参 callId/text，返回 source.callId 故意错配（other- 前缀）的 tool/result，用于身份非法取证 |  |
| pe-test/_shared/session-fixture.mjs | writeSession | L27-31 | 入参目录/文件名/事件数组，mkdirSync 后 zstdCompressSync 写盘，无返回值 |  |
| pe-test/_shared/session-fixture.mjs | replayJsonl | L33-44 | 入参压缩文件路径，返回 {frameCount,rowCount,invalid}，逐帧解码统计非法 JSON 行 |  |
| pe-test/_shared/session-fixture.mjs | syntheticFrame | L46-56 | 入参 block 数组与 contentSize，手工拼 zstd 帧头与 3 字节 block header，返回 Buffer |  |
| pe-test/_shared/session-fixture.mjs | g5MultiFrame | L58-67 | 入参 raw Buffer 与切点数组，按切点分帧压缩拼接，返回单 Buffer |  |
| pe-test/_shared/session-fixture.mjs | skippable | L68-74 | 入参 payload，写 0x184d2a50 魔数与长度，返回可跳过帧 Buffer |  |
| pe-test/_shared/test-output.mjs | digest | L13-15 | 计算UTF-8文本SHA-256摘要 |  |
| pe-test/_shared/test-output.mjs | normalize | L17-33 | 递归稳定化值并处理循环引用与特殊类型 |  |
| pe-test/_shared/test-output.mjs | stableStringify | L35-39 | 按键排序序列化断言值 |  |
| pe-test/_shared/test-output.mjs | parseOutputMode | L41-60 | 解析compact、verbose、full模式及优先级 |  |
| pe-test/_shared/test-output.mjs | summarizeValue | L62-73 | 将成功大对象压缩为类型、键数和预览摘要 |  |
| pe-test/_shared/test-output.mjs | assertionLine | L75-80 | 按模式渲染断言并始终保留失败差异 |  |
| pe-test/_shared/test-output.mjs | createOutput | L82-112 | 创建统一断言、结构化输出与统计接口 |  |
| pe-test/_shared/test-output.mjs | emit | L86-89 | 将普通行或错误行写入对应通道 |  |
| pe-test/_shared/test-output.mjs | assertion | L90-93 | 输出断言行并返回布尔结果 |  |
| pe-test/_shared/test-output.mjs | structured | L94-99 | 按模式输出完整值或稳定摘要 |  |
| pe-test/_shared/test-output.mjs | detail | L100-102 | 仅在full或强制条件下输出细节 |  |
| pe-test/_shared/test-output.mjs | marker | L103 | 输出SKIP、HUMAN等结构化状态标记 |  |
| pe-test/_shared/test-output.mjs | summary | L104-110 | 输出统一通过失败及扩展状态统计 |  |
| pe-test/_shared/test-output.mjs | workspaceTarget | L116-119 | 测试侧：把输出相对路径按工作区策略解析为受控目标，空串或非字符串直接抛错，不做兜底。 |  |
| pe-test/_shared/test-output.mjs | workspacePathOf | L121-123 | 测试侧：返回工作区受控目标的绝对路径字符串，供证据读取与写盘复用，越界时直接抛错。 |  |
| pe-test/_shared/test-output.mjs | prepareOutputDirectory | L125-133 | 测试侧：准备输出目录，目标缺失时按文件语义重试准备，仅吞目标缺失一类错误，其余抛出。 |  |
| pe-test/_shared/test-output.mjs | prepareOutputFile | L135-138 | 测试侧：在工作区策略下准备输出文件目标，路径越界或非法即抛错，不做静默回退或兜底。 |  |
| pe-test/_shared/test-output.mjs | fileEvidence | L140-150 | 读取文件并计算bytes、lines、SHA-256 |  |
| pe-test/_shared/test-output.mjs | writeRawEvidence | L152-172 | 保存stdout、stderr并返回合并证据统计 |  |
| pe-test/_shared/test-output.mjs | sha256Text | L174-176 | 对文本返回SHA-256用于raw复核 |  |
| pe-test/_shared/v4-tool-result.mjs | isObject | L6 | 判定非空普通对象 |  |
| pe-test/_shared/v4-tool-result.mjs | isToolResultType | L8-10 | 判定事件是否为tool/result类型 |  |
| pe-test/_shared/v4-tool-result.mjs | isV4SessionFile | L12-14 | 判定路径是否为v4会话日志文件 |  |
| pe-test/_shared/v4-tool-result.mjs | v4LogPath | L16-20 | 返回目录中的v4日志路径或空值 |  |
| pe-test/_shared/v4-tool-result.mjs | toolResultOf | L22-36 | 从v4事件提取调用ID、错误标记和文本 |  |
| pe-test/_shared/workspace-paths.mjs | factoryError | L11-16 | 构造带 code 与冻结 details 的 TypeError，统一夹具错误形状，不包装原始错误。 |  |
| pe-test/_shared/workspace-paths.mjs | isAbsolute | L18-22 | 按平台判定路径是否绝对：Windows 认盘符与 UNC 前缀，其它平台只认斜杠开头。 |  |
| pe-test/_shared/workspace-paths.mjs | lexical | L24-35 | 词法审查路径串：空值、NUL、变量、drive-relative 与 URI 一律拒绝，不查文件系统。 |  |
| pe-test/_shared/workspace-paths.mjs | keyOf | L37-40 | 把路径归一化为比较键，Windows 下额外转成小写，只做字符串层面的归一，不访问磁盘。 |  |
| pe-test/_shared/workspace-paths.mjs | within | L42-48 | 判断候选路径是否位于根内或与根相同，相对化后拒绝越界结果与绝对结果，不访问磁盘。 |  |
| pe-test/_shared/workspace-paths.mjs | requireAbsoluteRoot | L50-56 | 先做词法审查再要求给出显式绝对路径，不满足即抛错，通过时返回归一化后的绝对路径。 |  |
| pe-test/_shared/workspace-paths.mjs | assertExistingChain | L58-82 | 从候选路径开始逐级上溯校验父链的真实性与符号链接，越界、链接或缺失锚点一律抛错。 |  |
| pe-test/_shared/workspace-paths.mjs | repoRoot | L84-96 | 由模块位置推出维护根并校验 pe-test 与 plugins 锚点，结构不符即抛错。 |  |
| pe-test/_shared/workspace-paths.mjs | fixtureLabel | L98-104 | 校验夹具标签：缺省值为 fixture，含路径分隔符、上跳点或空白字符一律抛错。 |  |
| pe-test/_shared/workspace-paths.mjs | getWorkspaceRoot | L106-108 | 返回由结构锚定的工作区根，它同时也是维护根的唯一定义来源，也不读取任何环境变量。 |  |
| pe-test/_shared/workspace-paths.mjs | makeFixtureDir | L110-149 | 在 test-tmp 下创建唯一夹具目录树并返回冻结句柄，目录重名时自动重试，最多五次。 |  |
| pe-test/_shared/workspace-paths.mjs | cleanup | L138-141 | 夹具句柄上的清理闭包，先复验父链再递归删除整个夹具根，绝不触碰夹具以外的任何路径。 |  |
| pe-test/_shared/workspace-paths.mjs | resolveEvidencePath | L151-162 | 把相对证据路径解析到证据根内，根越界或最终路径越界都抛错，相对路径还须过词法审查。 |  |
| pe-test/_shared/workspace-paths.mjs | fixtureRootOf | L164-171 | 校验 fixture 句柄并取出工作区根与夹具根，非对象、缺字段或越界一律抛错。 |  |
| pe-test/_shared/workspace-paths.mjs | createIsolatedEnv | L173-209 | 由夹具句柄构造冻结的隔离环境变量，家目录、临时目录与各类缓存目录都指向夹具内部。 |  |
| pe-test/_shared/workspace-paths.mjs | isRecord | L222-224 | 判断入参是否为非空且非数组的普通对象，只用于选项形状校验，不检查具体的键名与值。 |  |
| pe-test/_shared/workspace-paths.mjs | strictMaintenancePath | L226-230 | 维护类路径串校验：必须是非空字符串且没有首尾空白，通过后再交给严苛的词法审查流程。 |  |
| pe-test/_shared/workspace-paths.mjs | strictAbsoluteMaintenancePath | L232-235 | 在严格路径校验之上再要求显式绝对路径，通过时返回归一化后的绝对结果，不满足即抛错。 |  |
| pe-test/_shared/workspace-paths.mjs | strictMaintenanceSegment | L237-243 | 要求单段名称：拒绝点、路径分隔符与空白字符，专门用于 profile 与会话标识。 |  |
| pe-test/_shared/workspace-paths.mjs | strictSessionScopePath | L245-249 | 会话作用域路径校验，会在严格路径校验之上额外拒绝当前目录与父目录这两类相对写法。 |  |
| pe-test/_shared/workspace-paths.mjs | nextMaintenanceValue | L251-257 | 取选项之后的紧邻下一个参数作为该选项的值，值缺失或误以双横线开头都会抛出缺值错误。 |  |
| pe-test/_shared/workspace-paths.mjs | markMaintenanceOption | L259-262 | 登记已经出现过的选项，同一选项重复出现时立即抛错，防止后者静默覆盖前一次给出的值。 |  |
| pe-test/_shared/workspace-paths.mjs | sameStringArray | L264-266 | 逐项比较两个字符串数组是否等长而且顺序一致，任何一侧不是数组的情形都直接返回假。 |  |
| pe-test/_shared/workspace-paths.mjs | parseMaintenanceArgs | L268-374 | 把维护命令行参数解析为冻结结构，校验会话与账本的互斥组合，其余参数留存为域参数。 |  |
| pe-test/_shared/workspace-paths.mjs | rejectOtherCategory | L376-378 | 拒绝保留类别 Other，只做与大小写无关的字符串比较，不做其它类型或语义校验。 |  |
| pe-test/_shared/workspace-paths.mjs | rejectUnknownKeys | L380-387 | 检查记录中是否存在白名单之外的键，先判定该值是否保留类别，再抛出未知选项的错误。 |  |
| pe-test/_shared/workspace-paths.mjs | contextOptionsOf | L389-410 | 校验维护上下文的选项：禁止覆盖工作区根与宿主数据根，出现任何未知键一律予以拒绝。 |  |
| pe-test/_shared/workspace-paths.mjs | chooseContextValue | L412-417 | 在嵌套值与顶层值之间取值，若两者同时出现而且彼此并不相等，就立即抛出冲突错误而不取其一。 |  |
| pe-test/_shared/workspace-paths.mjs | normalizeSessionOptions | L419-448 | 归一化会话选项并校验互斥与必配的搭配关系，模式与实际字段不一致时立即抛出明确错误。 |  |
| pe-test/_shared/workspace-paths.mjs | normalizeLedgerOptions | L450-471 | 把账本选项归一化为活动路径与模式两项，模式非法或与路径不一致时就会立即抛出错误。 |  |
| pe-test/_shared/workspace-paths.mjs | normalizeRequestTrace | L473-479 | 归一化请求追踪路径，接受字符串或带 path 字段的对象，空值返回 null 而不抛错。 |  |
| pe-test/_shared/workspace-paths.mjs | normalizeDomainArgv | L481-492 | 归一化领域参数数组，argv 与 domainArgv 不一致即抛错，每项都须为字符串，通过后返回冻结副本。 |  |
| pe-test/_shared/workspace-paths.mjs | policyTargetFor | L494-503 | 按目标类别走路径策略解析目标，并把策略异常转成夹具错误码、保留原始原因后再抛出。 |  |
| pe-test/_shared/workspace-paths.mjs | targetView | L505-522 | 把策略目标封装为只读视图，标注可写性与物理证明方式，其中写权限只授予工作区目标。 |  |
| pe-test/_shared/workspace-paths.mjs | targetForInput | L524-543 | 按绝对性与根归属选择工作区或宿主目标，越界、缺宿主根或落在双根之外时都抛出错误。 |  |
| pe-test/_shared/workspace-paths.mjs | createMaintenanceContext | L545-655 | 组装维护上下文：归一全部选项、定位会话与账本目标，最后输出授权矩阵与各用途能力表。 |  |
| pe-test/_shared/zstd-frames.mjs | frameEndAt | L6-34 | 在已验证 magic 的帧起点解析 FCS/字典/checksum 与 raw/RLE/compressed 块，只返回当前帧结束位置；不完整或非法块边界返回 null。 | 私有边界算法由 framesOf 与严格逐帧解码复用，不扫描后续帧。 |
| pe-test/_shared/zstd-frames.mjs | framesOf | L36-48 | 解析完整zstd帧及块边界 |  |
| pe-test/_shared/zstd-frames.mjs | decodeText | L50-52 | 解压单帧并转为UTF-8文本 |  |
| pe-test/_shared/zstd-frames.mjs | decompressedFrameBytes | L58-85 | 逐帧计算一次边界并解压，边界解析次数随帧数线性增长；按长度跳过 skippable 载荷，产出每帧 Buffer，截断/非法 magic/无完整帧抛出不完整错误。 | skippable 载荷内的 zstd magic 不作为真实帧。 |
| pe-test/_shared/zstd-frames.mjs | decodedJsonlLines | L87-107 | 以 fatal UTF-8 TextDecoder 跨帧累积并按物理换行 yield { lineNo, line }，保留 CR/空行/末行无换行；帧截断、非法 UTF-8 和无完整帧由调用方归类 INCOMPLETE。 |  |
| plugins/dsh-extra-plan-qqbot/index.js | apply | L9-33 | 插件入口：apply 启动时调 healQqbotCompatibility 自愈（迁移旧错误块+建链；try/catch 不阻断启动） |  |
| plugins/dsh-extra-plan-qqbot/lib/heal.js | sameRealPath | L15-17 | 共享路径比较 helper：Windows 忽略大小写、其它平台精确比较；供 CLI 入口、目标包与最终链接校验复用。 |  |
| plugins/dsh-extra-plan-qqbot/lib/heal.js | loadYamlModule | L23-33 | 仅按 package-local import.meta.url 惰性加载 js-yaml；不可用时由迁移入口保守跳过，导入零副作用。 |  |
| plugins/dsh-extra-plan-qqbot/lib/heal.js | loadYamlSchema | L35-49 | 惰性构造只保留 Loader `!!js` 标量的 JSON schema，表达式只转 __jsExpr 不求值 |  |
| plugins/dsh-extra-plan-qqbot/lib/heal.js | resolve | L41 | 惰性 js-yaml 类型的标量判定，仅接受字符串数据 |  |
| plugins/dsh-extra-plan-qqbot/lib/heal.js | construct | L42 | 将 `!!js` 标量包装为惰性 __jsExpr 标记，绝不执行 |  |
| plugins/dsh-extra-plan-qqbot/lib/heal.js | predicate | L43 | 识别惰性 __jsExpr 标记对象 |  |
| plugins/dsh-extra-plan-qqbot/lib/heal.js | represent | L44 | 为 schema 重新表示惰性表达式文本 |  |
| plugins/dsh-extra-plan-qqbot/lib/heal.js | timestamp | L51-55 | 时间戳 yyyyMMddHHmmssSSS（毫秒粒度备份时间戳，不作同毫秒唯一承诺） |  |
| plugins/dsh-extra-plan-qqbot/lib/heal.js | pad | L53 | 数字补零（timestamp 内部闭包） |  |
| plugins/dsh-extra-plan-qqbot/lib/heal.js | errorText | L61-63 | 迁移辅助：把任意抛出物收敛为可读文本，非 Error 值直接字符串化，不抛二次异常。 |  |
| plugins/dsh-extra-plan-qqbot/lib/heal.js | isMissingError | L65-67 | 迁移辅助：仅把 ENOENT、ENOTDIR、TARGET_MISSING 判为真，其余错误一律返回 false。 |  |
| plugins/dsh-extra-plan-qqbot/lib/heal.js | ownPackageRoot | L69-71 | 迁移辅助：由 import.meta.url 推出本包真实根目录，仅供链接指向比对，不校验目录存在性。 |  |
| plugins/dsh-extra-plan-qqbot/lib/heal.js | isLinkEntity | L73-77 | 迁移辅助：判定目录是否为链接实体，符号链接或 Windows 真实路径不一致即判真，异常回退判否。 |  |
| plugins/dsh-extra-plan-qqbot/lib/heal.js | createHostAccess | L79-88 | 迁移辅助：按 Host 根建立受限路径访问上下文并要求可读目录，根不一致直接抛错。 |  |
| plugins/dsh-extra-plan-qqbot/lib/heal.js | hostPath | L90-92 | 迁移辅助：在受限上下文内把相对片段解析成 Host 路径，越界一律由路径策略拒绝并抛错。 |  |
| plugins/dsh-extra-plan-qqbot/lib/heal.js | readHostJson | L94-98 | 迁移辅助：先校验目标为可读文件再解析 JSON，解析失败向上抛出，不做默认值回退。 |  |
| plugins/dsh-extra-plan-qqbot/lib/heal.js | safeProfileName | L100-105 | 迁移辅助：仅接受不含分隔符、点段与控制字符的 profile 名，非法名一律抛 TypeError。 |  |
| plugins/dsh-extra-plan-qqbot/lib/heal.js | profilePath | L107-110 | 迁移辅助：把已校验的 profile 名拼成 profiles 下的 Host 路径，名字非法时抛错不拼接。 |  |
| plugins/dsh-extra-plan-qqbot/lib/heal.js | ownPluginEntry | L112-131 | 迁移辅助：判定 profile 是否已装本插件，链接比对真实路径、目录只认清单名，缺失返回 false。 |  |
| plugins/dsh-extra-plan-qqbot/lib/heal.js | contextMember | L133-142 | 迁移辅助：优先经 ctx.get 取值再回落属性，取值异常按缺失处理并返回 undefined。 |  |
| plugins/dsh-extra-plan-qqbot/lib/heal.js | resolveRootProvider | L144-147 | 迁移辅助：宿主根允许直接值或惰性函数两种形态，调用抛错时回落 undefined 不中断扫描。 |  |
| plugins/dsh-extra-plan-qqbot/lib/heal.js | profileIdentityOf | L149-164 | 据 profile 名与已启动 bundle 判 web/qqbot 身份，冲突或缺失归 unknown 不抛错。 |  |
| plugins/dsh-extra-plan-qqbot/lib/heal.js | resolveQqbotHostRoot | L166-199 | 清理入口：汇总候选 Host 根并归一比对，缺失、非法或多源冲突时 root 置 null 并附原因。 |  |
| plugins/dsh-extra-plan-qqbot/lib/heal.js | isObject | L225-227 | 非空普通对象判定（排除 null/数组） |  |
| plugins/dsh-extra-plan-qqbot/lib/heal.js | stripBom | L229-231 | 去除行首 BOM（迁移扫描用） |  |
| plugins/dsh-extra-plan-qqbot/lib/heal.js | lineIndent | L233-235 | 行首缩进宽度 |  |
| plugins/dsh-extra-plan-qqbot/lib/heal.js | isIgnorableLine | L237-240 | 空行/注释行判定（块扫描跳过） |  |
| plugins/dsh-extra-plan-qqbot/lib/heal.js | parseEntryBlock | L244-252 | 用 js-yaml 严格解析单个根级条目，返回 parsed/yaml-unavailable/parse-failed 状态；不做文本猜测。 |  |
| plugins/dsh-extra-plan-qqbot/lib/heal.js | legacyEntryKind | L254-264 | 旧版根级完整块匹配（id+name[+config.default=standard]）→ 返回 id 或 null |  |
| plugins/dsh-extra-plan-qqbot/lib/heal.js | rootSequenceIndent | L266-276 | 根级序列缩进探测（首条 - 行的缩进宽度） |  |
| plugins/dsh-extra-plan-qqbot/lib/heal.js | isRootSequenceLine | L278-282 | 指定缩进处的根级序列行判定 |  |
| plugins/dsh-extra-plan-qqbot/lib/heal.js | scanRootBlocks | L284-310 | 按根级缩进切分顶层条目块（返回 lines/rootIndent/blocks） |  |
| plugins/dsh-extra-plan-qqbot/lib/heal.js | findLegacyRootBlocks | L312-327 | 扫描根级块并仅按解析对象匹配完整旧条目；任一解析不可用/失败返回 parseIssue，整体跳过删除。 |  |
| plugins/dsh-extra-plan-qqbot/lib/heal.js | removeLegacyRootBlocks | L329-351 | 移除旧版根级块（移除后无实质内容时写顶层 []） |  |
| plugins/dsh-extra-plan-qqbot/lib/heal.js | verifyMigratedPatch | L353-363 | 迁移后只用 js-yaml 校验顶层数组且无完整旧块残留，不使用行级 fallback。 |  |
| plugins/dsh-extra-plan-qqbot/lib/heal.js | healPatchRows | L374-444 | 幂等迁移旧版根级 code-runtime/agent-presets 错误块（实为清旧块；静态补行由包内 cordis.patch.yml 唯一提供）；写前 .bak-* 备份、写后校验失败恢复；文件不存在跳过 |  |
| plugins/dsh-extra-plan-qqbot/lib/heal.js | findOwnQqbotProfiles | L452-525 | 扫描 $DSH_HOME/profiles/* 找出锚定本插件的 qqbot profile（bundles + node_modules 双条件） |  |
| plugins/dsh-extra-plan-qqbot/lib/heal.js | finish | L457-468 | 扫描收尾：给结果数组挂不可枚举的诊断与状态元数据后返回，数组元素与长度均不改变。 |  |
| plugins/dsh-extra-plan-qqbot/lib/heal.js | ensureDshExtraPlanLink | L533-590 | 建平铺 dsh-extra-plan → Web 包链接：web 缺失跳过/已正确不动/实体或非目标链接提示 pnpm 迁移/仅 ENOENT 建 junction |  |
| plugins/dsh-extra-plan-qqbot/lib/heal.js | healQqbotCompatibility | L596-654 | QQBot 兼容自愈：对自有 profile 逐项迁移旧块并补链，整体异常只告警不阻断加载。 |  |
| plugins/dsh-extra-plan-qqbot/lib/path-policy.js | policyError | L13-18 | QQBot 包错误工厂：构造带 code 与冻结 details 的 TypeError，前缀统一便于上层按码分类 |  |
| plugins/dsh-extra-plan-qqbot/lib/path-policy.js | isObject | L20-22 | QQBot 包内类型判定：非 null、非数组的普通对象才为真，数组与函数一律返回 false |  |
| plugins/dsh-extra-plan-qqbot/lib/path-policy.js | isOther | L24-26 | QQBot 包保留类别判定：字符串转小写后等于 other 即为真，非字符串一律判假 |  |
| plugins/dsh-extra-plan-qqbot/lib/path-policy.js | rejectOther | L28-33 | QQBot 包保留类别拒绝：kind、scope、source、category 任一取 Other 即抛错 |  |
| plugins/dsh-extra-plan-qqbot/lib/path-policy.js | rejectOtherOptions | L35-40 | QQBot 包选项级拒绝：在 rejectOther 之外追加 capability 检查，命中保留类别即抛错 |  |
| plugins/dsh-extra-plan-qqbot/lib/path-policy.js | isFullyQualifiedAbsolute | L42-45 | QQBot 包绝对性判定：Windows 要盘符或 UNC 前缀，POSIX 只认斜杠开头，不做归一化 |  |
| plugins/dsh-extra-plan-qqbot/lib/path-policy.js | rejectVariable | L47-57 | QQBot 包变量路径拒绝：命中 %VAR%、$VAR 与 ~ 缩写均抛 VARIABLE_PATH，不展开变量 |  |
| plugins/dsh-extra-plan-qqbot/lib/path-policy.js | lexicalPath | L59-73 | QQBot 包纯词法校验：拒绝空串、NUL、变量、drive-relative 与 URI，原样返回不解析磁盘 |  |
| plugins/dsh-extra-plan-qqbot/lib/path-policy.js | rootPath | L75-82 | QQBot 包授权根解析：要求显式且明确的绝对路径，归一化后返回，缺失即抛 ROOT_REQUIRED |  |
| plugins/dsh-extra-plan-qqbot/lib/path-policy.js | keyOf | L84-87 | QQBot 包比较键生成：归一化后 Windows 再转小写，仅用于比较不回写调用方原值 |  |
| plugins/dsh-extra-plan-qqbot/lib/path-policy.js | samePath | L89-91 | QQBot 包同路径判定：两侧比较键完全相等才为真，不做真实路径解析与大小写变通 |  |
| plugins/dsh-extra-plan-qqbot/lib/path-policy.js | isWithin | L93-99 | QQBot 包包含判定：相等或相对路径不以 .. 起始为真，纯词法判断不跟随链接 |  |
| plugins/dsh-extra-plan-qqbot/lib/path-policy.js | assertLexicalWithin | L101-105 | QQBot 包词法越界断言：候选不在授权根内即抛 ROOT_ESCAPE，附带 root 与 candidate |  |
| plugins/dsh-extra-plan-qqbot/lib/path-policy.js | readOnlyCapabilityForLogicalPath | L107-114 | QQBot 包只读能力词法匹配：文件能力要求精确相等，目录能力要求包含，未命中返回 null |  |
| plugins/dsh-extra-plan-qqbot/lib/path-policy.js | readOnlyCapabilityForRealPath | L116-125 | QQBot 包只读能力真实匹配：realpath 解析失败的能力跳过，其余按文件相等或目录包含判定 |  |
| plugins/dsh-extra-plan-qqbot/lib/path-policy.js | rejectReadOnlyCapability | L127-129 | QQBot 包只读能力拒绝：描述符非空即抛 HOST_RESOURCE_READONLY，为空静默放行 |  |
| plugins/dsh-extra-plan-qqbot/lib/path-policy.js | purposeOf | L131-137 | QQBot 包用途解析：非空字符串且不得为 Other 或含 NUL，未指定时回退到传入 fallback |  |
| plugins/dsh-extra-plan-qqbot/lib/path-policy.js | capabilityName | L139-145 | QQBot 包能力名校验：空值归一为 null，非空字符串才合法，拒绝 Other 与 NUL 字符 |  |
| plugins/dsh-extra-plan-qqbot/lib/path-policy.js | normalizeCapabilities | L147-170 | QQBot 包能力表归一：数组与对象两种输入都支持，校验 name、type、access 后逐项冻结 |  |
| plugins/dsh-extra-plan-qqbot/lib/path-policy.js | createPathContext | L172-190 | QQBot 包上下文构造：工作区根、宿主根、能力表三者全空即抛 ROOT_REQUIRED |  |
| plugins/dsh-extra-plan-qqbot/lib/path-policy.js | ensureContext | L192-201 | QQBot 包上下文复检：重核根与能力表结构，避免绕过 createPathContext 伪造上下文 |  |
| plugins/dsh-extra-plan-qqbot/lib/path-policy.js | capabilityOf | L203-209 | QQBot 包能力查找：名称为空返回 null，未注册即抛 CAPABILITY_UNKNOWN 不静默降级 |  |
| plugins/dsh-extra-plan-qqbot/lib/path-policy.js | relativeInput | L211-217 | QQBot 包路径归一：明确绝对路径直接归一化，相对路径基于授权根解析，歧义绝对路径拒绝 |  |
| plugins/dsh-extra-plan-qqbot/lib/path-policy.js | makeTarget | L219-267 | QQBot 包目标构造核心：定根、核能力用途与词法范围、校验精确文件能力，产出冻结目标对象 |  |
| plugins/dsh-extra-plan-qqbot/lib/path-policy.js | resolveWorkspacePath | L269-273 | QQBot 包工作区路径解析：强制 workspace 类别，携带 capability 参数即判非法 |  |
| plugins/dsh-extra-plan-qqbot/lib/path-policy.js | resolveHostPath | L275-279 | QQBot 包宿主路径解析：强制 host 类别，能力未注册即报错，绝不回退工作区根 |  |
| plugins/dsh-extra-plan-qqbot/lib/path-policy.js | targetInput | L281-305 | QQBot 包入参归一：接受已解析目标或裸值，类别缺失即抛 KIND_REQUIRED，不猜默认类别 |  |
| plugins/dsh-extra-plan-qqbot/lib/path-policy.js | assertAllowedPath | L307-314 | QQBot 包放行判定：只做词法与类别校验不触碰磁盘，返回附 allowed 标记的冻结副本 |  |
| plugins/dsh-extra-plan-qqbot/lib/path-policy.js | isMissing | L316-318 | QQBot 包缺失错误识别：仅 ENOENT 与 ENOTDIR 视为不存在，其它错误码继续上抛 |  |
| plugins/dsh-extra-plan-qqbot/lib/path-policy.js | sameOrChildReal | L320-322 | QQBot 包真实路径越界断言：真实路径不在根内即抛 REALPATH_ESCAPE，用于堵链接逃逸 |  |
| plugins/dsh-extra-plan-qqbot/lib/path-policy.js | physicalRoot | L324-339 | QQBot 包物理根解析：realpath 后须为目录，失败区分不可解析、不可读取与非目录三类 |  |
| plugins/dsh-extra-plan-qqbot/lib/path-policy.js | inspectChain | L341-386 | QQBot 包父链探查：自目标回溯至授权根，收集候选与最近父级真实路径，写模式拒绝链接 |  |
| plugins/dsh-extra-plan-qqbot/lib/path-policy.js | expectedType | L388-392 | QQBot 包期望类型解析：只接受 file、directory、any 三值，其它取值抛 TYPE_INVALID |  |
| plugins/dsh-extra-plan-qqbot/lib/path-policy.js | checkType | L394-398 | QQBot 包类型核对：any 直接放行，file 与 directory 不符时抛 TARGET_TYPE 并附路径 |  |
| plugins/dsh-extra-plan-qqbot/lib/path-policy.js | validateReadTarget | L400-429 | QQBot 包读目标校验：目标必须存在且真实路径在根内，按期望类型核对后返回只读快照 |  |
| plugins/dsh-extra-plan-qqbot/lib/path-policy.js | prepareWriteTarget | L431-464 | QQBot 包写目标预检：宿主写须显式用途且能力可写，目标不得为链接，目录缺失不建 |  |
| plugins/dsh-extra-plan-qqbot/scripts/heal.mjs | isLinkEntity | L12-16 | 判断目录项是否为链接实体：符号链接即真，win32 目录再比对真实路径，解析异常按非链接处理。 |  |
| plugins/dsh-extra-plan-qqbot/scripts/heal.mjs | invokedAsMain | L18-23 | 主脚本判定（node 直跑时执行自愈；本仓插件 CLI 通用写法） |  |
| plugins/dsh-extra-plan-qqbot/scripts/heal.mjs | installFailure | L25-29 | 将严格安装失败原因与可选 detail 组装为 { error } 结构，供各失败分支统一返回。 |  |
| plugins/dsh-extra-plan-qqbot/scripts/heal.mjs | errorText | L31-33 | 把任意异常安全转成文本：Error 取 message，其它值走 String 转换，永不抛错。 |  |
| plugins/dsh-extra-plan-qqbot/scripts/heal.mjs | isMissingError | L35-37 | 识别目标缺失类错误码（ENOENT、ENOTDIR、TARGET_MISSING），非对象入参一律判为假。 |  |
| plugins/dsh-extra-plan-qqbot/scripts/heal.mjs | createInstallAccess | L39-43 | 以显式 DSH_HOME 建立路径上下文并校验安装根目录，供严格安装各步骤复用。 |  |
| plugins/dsh-extra-plan-qqbot/scripts/heal.mjs | readInstallJson | L45-48 | 在安装路径策略下校验并读取 JSON 文件，返回校验后的目标与解析值，非法路径直接抛错。 |  |
| plugins/dsh-extra-plan-qqbot/scripts/heal.mjs | strictInstall | L50-152 | --install 严格预检并收口：校验 Web 源、双锚点包根唯一匹配、目标实体与链；以 profileNames 限定自愈，要求 patch/link 成功态并复核最终 lstat/realpath，失败统一返回 error。 |  |
| plugins/dsh-extra-plan-qqbot/scripts/heal.mjs | reportInstallFailure | L154-157 | 将严格安装失败结构化 JSON 写入 stderr，并设置 process.exitCode=1。 |  |
| plugins/dsh-extra-plan-qqbot/scripts/heal.mjs | printHelp | L159-169 | 向 stdout 打印用法与规则：无参仅提示、维护须显式根与 profile、install 为部署入口，不自愈。 |  |
| plugins/dsh-extra-plan-qqbot/scripts/heal.mjs | parseArguments | L171-212 | 解析命令行参数并做互斥校验：重复项、未知参数、install 冲突、根与 profile 必须成对，失败抛错。 |  |
| plugins/dsh-extra-plan-qqbot/scripts/heal.mjs | setOnce | L174-178 | 登记一次性参数：同键重复出现即抛错，并写入解析结果，供各参数分支共用同一份状态。 |  |
| plugins/dsh-extra-plan-qqbot/scripts/heal.mjs | reportCliFailure | L214-219 | 把参数或测试失败原因以 JSON 写入 stderr 并置非零退出码，不抛异常中断流程。 |  |
| plugins/dsh-extra-plan-qqbot/scripts/heal.mjs | runDryRun | L221-233 | 以显式根与单个 profile 走试运行自愈（零写），失败或异常转成命令行失败报告。 |  |
| plugins/dsh-extra-plan/index.js | malformedRecovery | L207-241 | MALFORMED_RESPONSE 同回合限次自愈：注入失败或坐标缺失仍返回 retry，其余回退原 action。 |  |
| plugins/dsh-extra-plan/index.js | safeContextGet | L254-260 | 通过 ctx.get 取宿主服务，取不到或抛错时返回 undefined，不向上传播异常 |  |
| plugins/dsh-extra-plan/index.js | absoluteRoot | L264-271 | 把候选根路径归一成绝对工作区根，空串、非字符串或非法输入一律返回 null 而不抛错 |  |
| plugins/dsh-extra-plan/index.js | profileIdentityOf | L273-284 | 按 profile 名与已启动 bundle 判定 web、qqbot 或冲突身份，缺字段记为未知 |  |
| plugins/dsh-extra-plan/index.js | rootFact | L286-290 | 把带存在标记的根路径归一为 missing、invalid 或 valid 三态事实对象 |  |
| plugins/dsh-extra-plan/index.js | sameRoot | L292-297 | 两个根路径都非空时按平台归一后比较是否同一根，Windows 下转小写，任一侧为空即判否 |  |
| plugins/dsh-extra-plan/index.js | configEditorServiceOf | L299-302 | 取 configEditor 服务并校验具备读取与编辑方法，不合格返回 null |  |
| plugins/dsh-extra-plan/index.js | documentFact | L304-308 | 把配置文档路径归一为 missing、invalid 或 valid 事实，空值按缺失处理 |  |
| plugins/dsh-extra-plan/index.js | profileFactsOf | L310-375 | 汇总 profile、宿主根与配置文档的可信事实，并标注 valid、conflict 或 invalid 状态 |  |
| plugins/dsh-extra-plan/index.js | has | L312 | 判断 profile 对象是否为对象且自身带有某键，用于区分字段缺失与显式空值，不抛错 |  |
| plugins/dsh-extra-plan/index.js | installAnchorOf | L377-379 | 从 profile 事实里取出安装锚点路径，缺失或非法时返回 null，不抛错，供锚点钩子判空 |  |
| plugins/dsh-extra-plan/index.js | pathRootsOverlap | L383-391 | （待补充） |  |
| plugins/dsh-extra-plan/index.js | pathContextFor | L393-415 | 用可信 profile 事实装配路径上下文与写入口径能力，全部为空时返回 null 而不抛错 |  |
| plugins/dsh-extra-plan/index.js | resolveDocumentTargetFor | L417-425 | 按配置文档事实解析精确宿主目标路径，事实非法或矛盾时抛错拒绝热读，缺路径返回空串 |  |
| plugins/dsh-extra-plan/index.js | sessionCwdOf | L427-431 | 从 agent 的会话头里取工作目录，缺失或非字符串时返回空串，供路径上下文现算使用 |  |
| plugins/dsh-extra-plan/index.js | resolveAbsoluteLogTarget | L433-439 | 绝对诊断路径的两级解析：先按宿主根解析再按工作区根解析，两者皆失败时抛出首个错误 |  |
| plugins/dsh-extra-plan/index.js | diagnosticTargetOf | L441-456 | 决定诊断文件落点：裸文件名按宿主、工作区、缺根三态分派，不可用时返回 null 不抛错 |  |
| plugins/dsh-extra-plan/index.js | prepareDiagnosticPath | L458-474 | 先建父目录再校验写入目标，成功返回可写诊断路径，任一步失败都一律返回空串且不抛错 |  |
| plugins/dsh-extra-plan/index.js | appendDiagnostic | L476-481 | 以 UTF-8 追加一行 JSON 诊断记录，路径不可得时返回假而不抛错，供调用方判空 |  |
| plugins/dsh-extra-plan/index.js | recordAgentError | L483-500 | agent/error 回合错误取证：错误链逐字追加到诊断目录（落点见 getDiagPath），整体吞错不阻断。 | 与 recordRequestError 同诊断模式 |
| plugins/dsh-extra-plan/index.js | apply | L504-1490 | 插件主入口：闸门词表先校验，再接线投影、路由与 save 工具注册（顺序以机制设计为准）。 |  |
| plugins/dsh-extra-plan/index.js | getPathContext | L527 | 传给保存类工具工厂的取上下文回调：按 cwd 现算路径上下文，属宿主接线且不缓存 |  |
| plugins/dsh-extra-plan/index.js | resolveDocumentTarget | L537 | 传给配置热读器的文档目标回调：按 agent 现算精确宿主目标，属宿主接线不缓存 |  |
| plugins/dsh-extra-plan/index.js | getPathContext | L538 | 传给配置热读器的取上下文回调：按 agent 的会话工作目录现算路径上下文，属宿主接线 |  |
| plugins/dsh-extra-plan/index.js | plannerModel | L552 | 热读箭头 getter：pro 规划默认模型（liveConfig.plannerModel；消费点=model-routing 的 getPlannerModel） |  |
| plugins/dsh-extra-plan/index.js | otherAgentModel | L553 | 热读箭头 getter：其他子代理默认模型（消费点=model-routing 的 getOtherAgentModel） |  |
| plugins/dsh-extra-plan/index.js | reviewerUsesPlannerModel | L554 | 热读箭头 getter：验收者是否复用规划模型，按 agent 现取并回退 apply 快照 |  |
| plugins/dsh-extra-plan/index.js | exploreBudget | L555 | 热读箭头 getter：pro 规划探查额度/单实例子调用上限（消费点=预算文案、noteRunCodeSubCall、plannerGateReason 与组判定） |  |
| plugins/dsh-extra-plan/index.js | plannerPromptSuffix | L556 | 热读箭头 getter：pre-step 拼接的额外引导后缀 |  |
| plugins/dsh-extra-plan/index.js | bootstrapOn | L557 | 热读箭头 getter：anchored 首轮引导开关（消费点=shouldHideCreativeCatalog 与 anchoredFirst 装配） |  |
| plugins/dsh-extra-plan/index.js | runcodeCatchGateOn | L558 | 热读箭头 getter：PTC try/catch 闸门开关（消费点=planner/只读 child/主会话三处组判定传参） |  |
| plugins/dsh-extra-plan/index.js | crossProviderPlannerModel | L559 | 热读箭头 getter：跨 provider 规划模型开关，按 agent 现取配置值 |  |
| plugins/dsh-extra-plan/index.js | creativeModeOn | L562 | 热读箭头 getter：创造模式开关（liveConfig.creativeMode；消费点=shouldHideCreativeCatalog 与装配投影 hideCordis） |  |
| plugins/dsh-extra-plan/index.js | getAgents | L579 | 惰性返回 ctx.get('agents') 服务；注入 createAgentRuntime，供判定子会话是否为其父代理下的活跃派发。 |  |
| plugins/dsh-extra-plan/index.js | warn | L581 | 把告警参数原样转发到 console.warn；注入 createAgentRuntime，作为缺父代理等异常情况的告警出口。 |  |
| plugins/dsh-extra-plan/index.js | getPlannerModel | L589 | 返回热读配置 plannerModel（planner 子代理所用模型名）；注入 createModelRouting 供 planner 模型路由决议。 |  |
| plugins/dsh-extra-plan/index.js | getOtherAgentModel | L590 | 返回热读配置 otherAgentModel（非 planner 子代理所用模型名，空串表示不覆盖）；供非 planner 路由决议。 |  |
| plugins/dsh-extra-plan/index.js | getCrossProviderPlannerModel | L591 | 返回热读布尔开关 crossProviderPlannerModel；决定 planner 路由走跨 provider 严格探针还是旧单 provider 路径。 |  |
| plugins/dsh-extra-plan/index.js | getLlm | L592 | 返回 ctx.get('llm') 服务；供 model-routing 查 provider 模型目录（listModels）与真实探针调用。 |  |
| plugins/dsh-extra-plan/index.js | getAgents | L593 | 返回 ctx.get('agents') 服务（同名第 2 处，消费方为 model-routing）；供经 agents.get 回溯父会话链的 provider/model/maxTokens。 |  |
| plugins/dsh-extra-plan/index.js | getDiagPath | L594 | 返回诊断路径：诊断目录 host logs/dsh-extra-plan/ 或 W .extra-plan/logs/；供 planner 降级诊断。 |  |
| plugins/dsh-extra-plan/index.js | noteRunCodeSubCall | L622 | 单实例子调用上限（planner）：按 sessionId→rootCallId 桶读计数、未超限则 +1；返回拒绝文案或 null；空 rootCallId 与 exploreBudget 文案保持 |  |
| plugins/dsh-extra-plan/index.js | consumeToolJobsNotice | L623-656 | tool-jobs 通知按 message.id 判重：首次有效通知解锁 job_output 与 pollGuard。 | 消费与双解锁语义见 ai-机制设计.md 六「session 生命周期与 usage 账本」的通知消费合同条。 |
| plugins/dsh-extra-plan/index.js | selectChildModelOnCreate | L669-720 | （待补充） |  |
| plugins/dsh-extra-plan/index.js | toolsServiceOf | L728-741 | （待补充） |  |
| plugins/dsh-extra-plan/index.js | anchoredAllowNamesOf | L745-773 | （待补充） |  |
| plugins/dsh-extra-plan/index.js | armAnchoredToolRestriction | L774-863 | （待补充） |  |
| plugins/dsh-extra-plan/index.js | anchoredDiag | L779-800 | （待补充） |  |
| plugins/dsh-extra-plan/index.js | releaseAnchoredToolRestriction | L864-888 | （待补充） |  |
| plugins/dsh-extra-plan/index.js | releaseDiag | L869-880 | （待补充） |  |
| plugins/dsh-extra-plan/index.js | shouldHideCreativeCatalog | L913-915 | HP1 判定：C=1、A=1、F、main/planner、M=ptc 时暂隐两个创造 skill |  |
| plugins/dsh-extra-plan/index.js | isAnchoredContextGate | L919-924 | 判定当前 agent 是否满足 anchored context gate：bootstrap 开启、Session 仍处 F，且角色为 main 或 planner（非 live child） | 只读 payload.agent；角色沿现有 isPlannerChild/isChild 语义，不使用 selfAgent 或父 Session 相位 |
| plugins/dsh-extra-plan/index.js | warnPreStepFailure | L926-930 | pre-step 可降级 C 投影/去重异常的一次性告警 helper；返回路径仍保留已经完成的 source 过滤副本，并保证 next 只调用一次 | 不得在关键 source gate/phase 失败时吞错后发送未过滤 decision |
| plugins/dsh-extra-plan/index.js | recordRequestError | L1035-1055 | agent/request-error：按 diagPath 追加 jsonl，含 ts、role 与错误链，整体吞错。 |  |
| plugins/dsh-extra-plan/lib/agent-runtime.js | isLiveDelegation | L17-28 | 按父会话 registry 存活状态判定委托是否仍有效 |  |
| plugins/dsh-extra-plan/lib/agent-runtime.js | createAgentRuntime | L30-175 | 创建 per-apply 角色/缓存/usage baseline 工厂 |  |
| plugins/dsh-extra-plan/lib/agent-runtime.js | isChild | L37-45 | 按显式 events 判定 live child 并发出恢复为 root 警示 |  |
| plugins/dsh-extra-plan/lib/agent-runtime.js | isPlannerChild | L50-58 | 每次按当前 Agent 的 header.agentPreset 与 isSubagentChild 判定 planner 子会话；不共享跨 Agent 的预设名布尔缓存，缺失必要信息返回 false。 |  |
| plugins/dsh-extra-plan/lib/agent-runtime.js | isReviewerChild | L62-70 | 按当前 Agent 会话头的预设名与子会话判定验收者子代理，缺失必要信息或类型不符一律返回假。 |  |
| plugins/dsh-extra-plan/lib/agent-runtime.js | usageRootOf | L72-103 | 沿最多 8 层 parentSession 回溯 rootSessionId；断链、循环或异常返回空 rootSessionId，由 usageContextOf 保持合法上下文落账，不伪造根会话。 | createAgentRuntime 内部闭包。 |
| plugins/dsh-extra-plan/lib/agent-runtime.js | usageContextOf | L108-129 | 按 Agent 缓存 usage 血缘 context：断链或循环下 rootSessionId 为空仍合法。 | createAgentRuntime 内部 WeakMap 闭包。 |
| plugins/dsh-extra-plan/lib/agent-runtime.js | toolSchemasOf | L132-150 | 防御式读取 agent scoped tools.schemas，失败/非数组返回 undefined |  |
| plugins/dsh-extra-plan/lib/agent-runtime.js | applyChildPolicy | L152-163 | 仅按本 child 四角色 preset 追加 sandbox/mode，override 已是目标 mode 时幂等。 |  |
| plugins/dsh-extra-plan/lib/agent-runtime.js | childBaseline | L168-172 | 同步解析 main/四角色/未知 child 的 usage context，fold usage，并为本 child 应用四角色宿主 mode 的幂等策略。 | createAgentRuntime 内部闭包。 |
| plugins/dsh-extra-plan/lib/agent-session.js | sessionEvents | L13-22 | 取 agent.session 事件快照（缺失兜底空数组）；唯一来源 |  |
| plugins/dsh-extra-plan/lib/agent-session.js | observeSessionLeaseOf | L29-44 | sessionQuery 租约探测：能力缺失或异常返回 undefined，lease 由调用方 finally 释放。 |  |
| plugins/dsh-extra-plan/lib/agent-session.js | isSubagentChild | L51-65 | 判定会话属于子代理（header.origin/delegationDepth/descriptor 三路探测）；唯一来源，index.js 经 decisions re-export |  |
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
| plugins/dsh-extra-plan/lib/assembly-presentation.js | errorWithCause | L154-158 | 构造带 cause 链的 Error，供上层保留底层失败原因，不做额外包装也不吞错。 |  |
| plugins/dsh-extra-plan/lib/assembly-presentation.js | assertInstallAnchor | L160-175 | 校验锚点是否为存在的绝对 dsh 应用 package.json，且清单 name 匹配，任一条件不满足即抛错。 |  |
| plugins/dsh-extra-plan/lib/assembly-presentation.js | dshToolsEntryPath | L178-185 | 单候选入口解析：先断言 installAnchor 是 @deepseek-ai/dsh 的 package.json，再用 createRequire(anchor).resolve 解析 dsh-tool-executor-ptc 入口，返回单个路径字符串（不再返回数组），解析失败抛带 cause 的错误 |  |
| plugins/dsh-extra-plan/lib/assembly-presentation.js | loadSdkRendererModule | L188-206 | 按安装锚点缓存渲染模块的动态导入 Promise，导入失败带 cause 抛出且不留下失败缓存。 |  |
| plugins/dsh-extra-plan/lib/assembly-presentation.js | pending | L194-204 | 按锚点首次执行的异步导入体：逐个候选入口尝试，全部失败时带 cause 抛出最终错误。 |  |
| plugins/dsh-extra-plan/lib/assembly-presentation.js | resolveToolsSdkRenderer | L209-214 | 按语言选官方渲染函数（python 走 Python 版），不支持的语言抛错，模块按锚点隔离缓存。 |  |
| plugins/dsh-extra-plan/lib/assembly-presentation.js | renderFilteredToolsSdk | L217-220 | 只接收已过滤 schema，整体调用官方渲染函数重建 SDK 文本，不从原始文本里删块。 |  |
| plugins/dsh-extra-plan/lib/assembly-presentation.js | toolRegistryOf | L222-230 | 防御式取 agent 上下文里的工具注册表，缺失或读取抛错时返回 undefined，不向调用方抛错。 |  |
| plugins/dsh-extra-plan/lib/assembly-presentation.js | toolSdkSchemasOf | L232-266 | 优先从工具定义取 schema，失败再回退 schema 列表；两种来源都过滤两个固定内置呈现工具。 |  |
| plugins/dsh-extra-plan/lib/client-carrier.js | apply | L5-7 | 空实现的内部客户端入口：由设置组件经官方加载组动态挂载，真正加载交由客户端清单，无业务副作用。 |  |
| plugins/dsh-extra-plan/lib/client.js | factory | L3-323 | 客户端模块加载器工厂：包装生成物入口，返回 exports 并挂 apply 与 inject 依赖声明 |  |
| plugins/dsh-extra-plan/lib/client.js | apply | L115-318 | 客户端生效入口：注入样式表、注册中英双语字典并登记详情设置区块，不触碰宿主其它槽位与表单实例 |  |
| plugins/dsh-extra-plan/lib/client.js | useSharedConfigForm | L128-139 | 订阅共享配置表单快照的 hook，返回只读 state 与转发 mutate 的包装函数 |  |
| plugins/dsh-extra-plan/lib/client.js | update | L131 | 内部快照刷新函数：重取共享表单快照写入组件状态，仅在初始化与订阅回调时调用，不参与写盘 |  |
| plugins/dsh-extra-plan/lib/client.js | mutate | L137 | 把一组 set 操作与表单修订号原样转发给共享表单 mutate，不在本地合并或校验 |  |
| plugins/dsh-extra-plan/lib/client.js | optionLabel | L141-146 | 下拉选项显示文案：先查字段的语言键映射，布尔值取开启或关闭词，其余原样转成字符串返回 |  |
| plugins/dsh-extra-plan/lib/client.js | optionValue | L148-152 | 把下拉框回传的字符串值还原成字段声明的原始选项值，未命中任何选项时保留原串而不抛错 |  |
| plugins/dsh-extra-plan/lib/client.js | renderControl | L154-179 | 按字段控件类型分派渲染受控控件：多行文本域、数字框、下拉框与单行文本框，互斥只渲染其一 |  |
| plugins/dsh-extra-plan/lib/client.js | onChange | L158 | 文本域输入回调：把输入框当前文本直接回传给上游草稿写入函数，不做裁剪与校验，也不触发保存 |  |
| plugins/dsh-extra-plan/lib/client.js | onChange | L165 | 数字框输入回调：仅回传输入框原始字符串，数值化与有限性判断留给字段取值函数完成，此处不转数字 |  |
| plugins/dsh-extra-plan/lib/client.js | onChange | L170 | 下拉框输入回调：经选项值还原函数把字符串映射回原始类型后再回传给草稿，保证布尔值不串型 |  |
| plugins/dsh-extra-plan/lib/client.js | onChange | L177 | 单行文本框输入回调：直接回传输入文本，不在此处做任何校验、裁剪或类型转换，空串照传 |  |
| plugins/dsh-extra-plan/lib/client.js | ExtraPlanForm | L181-274 | 设置表单主体：维护草稿与保存提示，加载中或命名空间不可用时提前返回空态提示，不渲染字段 |  |
| plugins/dsh-extra-plan/lib/client.js | fieldValue | L204-211 | 取字段草稿值：数字控件尝试转有限数值，非数字则回退原始值，全程不抛错也不提示用户 |  |
| plugins/dsh-extra-plan/lib/client.js | saveAll | L213-238 | 汇总全部字段为 set 操作提交表单 mutate，通过后同源 PUT 静默触发同步 |  |
| plugins/dsh-extra-plan/lib/client.js | renderField | L240-249 | 渲染单个字段：拼装标签、受控控件与说明行，用户改动时清空上一条保存结果提示，不校验取值 |  |
| plugins/dsh-extra-plan/lib/client.js | SettingsCard | L276-284 | 设置卡片外壳：拼装标题、描述文案与表单组件，只做组装不持有状态也不含业务判断逻辑 |  |
| plugins/dsh-extra-plan/lib/client.js | hasBundleConfigEntry | L286-293 | 检查 bundle.config 槽是否已有本包条目，查询或读取异常一律按无条目处理，保证表单只渲染一份 |  |
| plugins/dsh-extra-plan/lib/client.js | DetailSettingsSection | L295-301 | 详情页设置段：仅包主体且槽内无同包条目时渲染设置卡片，其余情况返回空不占位也不报错 |  |
| plugins/dsh-extra-plan/lib/client.js | safeInject | L303-305 | 槽位注入包装：捕获注入过程异常并退回未定义值，不中断其余客户端界面登记与后续渲染 |  |
| plugins/dsh-extra-plan/lib/client.js | registerClientSurfaces | L307-314 | 在配置命名空间被服务期间登记详情设置段，返回注销函数供效果清理时调用，避免重复登记 |  |
| plugins/dsh-extra-plan/lib/gate-decisions.js | isDispatchStart | L9 | 判定宿主事件类型是否为嵌套派发起始事件 tool/ptc-dispatch-start，只做字符串等值比较。 |  |
| plugins/dsh-extra-plan/lib/gate-decisions.js | isDispatch | L10 | 判定事件类型是否为嵌套派发结果事件 tool/ptc-dispatch，供后续结果解析前做分流。 |  |
| plugins/dsh-extra-plan/lib/gate-decisions.js | purposeRouteDenyReason | L12-14 | 生成目的确认 ask 越序的拒绝文案，提示先选路由再问目的，选项文案取自本次闸门词表。 |  |
| plugins/dsh-extra-plan/lib/gate-decisions.js | routeDenyReason | L17-22 | 生成路由未确认的拒绝文案，规划态与未确认态文案不同，并带出工具名与后续放行路径。 |  |
| plugins/dsh-extra-plan/lib/gate-decisions.js | planDenyReason | L23-34 | 按直行态、目的未确认、澄清未完成等分支生成规划工具拒绝文案，缺省给出统一提示文案。 |  |
| plugins/dsh-extra-plan/lib/gate-decisions.js | approvalDenyReason | L35-37 | 生成执行类委派未获批准的拒绝文案，指明工具名并提示需先取得用户批准之后才能委派。 |  |
| plugins/dsh-extra-plan/lib/gate-decisions.js | filterBootstrapContextDecision | L57-64 | 锚点引导期从注入决策里剔掉代理指令与技能目录消息，未做裁剪时原样返回同一个对象。 |  |
| plugins/dsh-extra-plan/lib/gate-decisions.js | projectedSkillCatalogSignature | L66-74 | 把技能目录消息压成名称加描述的可比对签名，结构不符或条目缺字段时返回 undefined。 |  |
| plugins/dsh-extra-plan/lib/gate-decisions.js | jsonShapeSignature | L76-108 | 递归生成 JSON 形状签名，非普通对象、循环引用或非有限数一律返回 undefined 不抛错。 |  |
| plugins/dsh-extra-plan/lib/gate-decisions.js | projectedAgentInstructionsSignature | L110-114 | 生成代理指令消息的内容签名，来源不是 agent-instructions 或内容为空时返回 undefined。 |  |
| plugins/dsh-extra-plan/lib/gate-decisions.js | projectedContextSignature | L116-123 | 按消息来源种类选择指令或技能目录签名，非投影来源返回 undefined 供调用方直接跳过。 |  |
| plugins/dsh-extra-plan/lib/gate-decisions.js | dedupeProjectedContextDecision | L125-146 | 对进入决策的投影消息按基线签名去重，重复项被剔除，无重复时原样返回同一个决策对象。 |  |
| plugins/dsh-extra-plan/lib/gate-decisions.js | isBootstrapPhase | L151-160 | 判断会话是否仍处锚点引导期，会话缺失或事件里已出现 tool/call 即判为非引导期。 |  |
| plugins/dsh-extra-plan/lib/gate-decisions.js | labelsOfCallData | L167-183 | 解析 ask 调用参数并取首问的选项标签，参数非 JSON 或结构不符时返回 null 跳过分类。 |  |
| plugins/dsh-extra-plan/lib/gate-decisions.js | isExactGateSet | L195-202 | 判断选项标签归一后是否与闸门词集完全相等，用集合逐项比较而不是靠子串包含来判定。 |  |
| plugins/dsh-extra-plan/lib/gate-decisions.js | isPartialGateSet | L205-213 | 判断选项标签与闸门词集部分相交但非完全相等，用于识别带额外修饰的非标准选项写法。 |  |
| plugins/dsh-extra-plan/lib/gate-decisions.js | categorizeGateAsk | L216-220 | 把 ask 选项分为标准、带修饰与普通三类，任一闸门词集命中即归类，否则算普通。 |  |
| plugins/dsh-extra-plan/lib/gate-decisions.js | gateAskDenyReason | L223-259 | 生成 ask 选项不规范的拒绝文案，按缺口最少的词组列出缺失词并附上标准模板提示。 |  |
| plugins/dsh-extra-plan/lib/gate-decisions.js | validateGateAskStructure | L265-292 | 校验路由、目的与批准 ask 的问题数及非首问禁选项，通过返回 null 否则返回拒绝文案。 |  |
| plugins/dsh-extra-plan/lib/gate-decisions.js | askKindOf | L299-316 | 严格版 ask 分类：须同时含路由两词才判路由，再判断批准与目的词后回落到澄清。 |  |
| plugins/dsh-extra-plan/lib/gate-decisions.js | askKindOfRelaxed | L323-342 | 宽松版 ask 分类，先按词集精确匹配再按特异词归类，仅剩共享否决词时判为路由。 |  |
| plugins/dsh-extra-plan/lib/gate-decisions.js | matchExactKind | L347-355 | 在标签归一后与给定词表做精确比较，命中返回对应枚举值，全部不匹配返回 null。 |  |
| plugins/dsh-extra-plan/lib/gate-decisions.js | matchRouteLabel | L357-364 | 先匹配路由特有词再回落到共享否决词，得到直行、规划或否决，无命中返回 null。 |  |
| plugins/dsh-extra-plan/lib/gate-decisions.js | matchApprovalLabel | L366-373 | 先匹配批准特有词再回落到共享否决词，得到批准、重规划或否决，无命中返回 null。 |  |
| plugins/dsh-extra-plan/lib/gate-decisions.js | matchPurposeLabel | L375-380 | 在目的词表里精确匹配细化或重做选项，未命中返回 null 由调用方保持原有状态。 |  |
| plugins/dsh-extra-plan/lib/gate-decisions.js | firstTextOfBlocks | L383-389 | 取内容块数组里首个文本块的文本，无文本块、值非法或传入非数组时一律返回空字符串。 |  |
| plugins/dsh-extra-plan/lib/gate-decisions.js | askResultTextIsDenied | L394-396 | 按文案判定 ask 结果是否为闸门拒绝：以 Error: 开头且不是宿主取消句才算拒绝。 |  |
| plugins/dsh-extra-plan/lib/gate-decisions.js | parseAskResultData | L403-440 | 解析一次 ask 结果事件为正常、拒绝或错误三类，无关结果返回空 callId 由调用方跳过。 |  |
| plugins/dsh-extra-plan/lib/gate-decisions.js | parseDispatchAskResult | L449-477 | 解析嵌套派发里的 ask 结果，按 isError 与文案区分拒绝和错误，子调用号非字符串即忽略。 |  |
| plugins/dsh-extra-plan/lib/gate-decisions.js | resetStageState | L479-483 | 把目的、澄清与批准这三个状态字段重置为初始值，路由字段保持不动，留给上层单独复位处理。 |  |
| plugins/dsh-extra-plan/lib/gate-decisions.js | resetRouteState | L485-488 | 把路由复位为未确认并连带重置目的、澄清与批准，用于取消或普通错误之后的状态回收。 |  |
| plugins/dsh-extra-plan/lib/gate-decisions.js | applyAskOutcome | L490-520 | 按 ask 分类与结果更新流程状态：拒绝不动状态，通道故障置标记，其余按分类分支推进。 |  |
| plugins/dsh-extra-plan/lib/gate-decisions.js | deriveFlowState | L530-574 | 自最近一条用户消息起回放事件推导四级锚点状态，没有用户消息时直接返回初始状态值。 |  |
| plugins/dsh-extra-plan/lib/gate-decisions.js | catalogHasWriteTools | L586-591 | 判断工具目录是否含 write 或 edit，兼容字符串与对象两种元素形状，非数组返回 false。 |  |
| plugins/dsh-extra-plan/lib/gate-decisions.js | isReadOnlyChildByCatalog | L594-596 | 按目录判定只读子代理：目录非空且不含写工具才算只读，空目录与非数组都不算作只读。 |  |
| plugins/dsh-extra-plan/lib/gate-decisions.js | schemasHasWriteTools | L601-606 | 判断真实工具集是否含写工具，目录折叠时用它替代目录信号，非数组返回 false。 |  |
| plugins/dsh-extra-plan/lib/gate-decisions.js | schemasHasTool | L610-615 | 判断真实工具集是否含指定工具名，兼容字符串与对象两种形状，非数组返回 false。 |  |
| plugins/dsh-extra-plan/lib/gate-decisions.js | catalogIsCollapsed | L624-629 | 判断 ptc 目录是否折叠成仅 run_code，折叠后目录信号不可用需改看真实工具集。 |  |
| plugins/dsh-extra-plan/lib/gate-decisions.js | subagentProbeGateReason | L635-647 | 限制探查者委派只能由主会话发起，规划子代理与其它只读子角色各自返回专属的拒绝文案。 |  |
| plugins/dsh-extra-plan/lib/gate-decisions.js | withShellEvidence | L653-657 | 把 shell 命中的规则与取值追加到拒绝文案尾部，证据为 null 时原样返回传入文案。 |  |
| plugins/dsh-extra-plan/lib/gate-decisions.js | shellMutationReason | L659-675 | 对规划者、探查者与验收复核者的 pwsh/bash 写命令生成拒绝文案，其余角色返回 null。 |  |
| plugins/dsh-extra-plan/lib/gate-decisions.js | childControlGateReason | L678-682 | 仅允许 main 使用 `send_message`/`interrupt_agent`；child 直呼统一返回硬拒文案，供 planner/只读 child/执行者/unknown child 与 run_code 组判定复用。 | 纯函数；mainGateReason 不经此拒绝。 |
| plugins/dsh-extra-plan/lib/gate-decisions.js | plannerGateReason | L686-702 | 规划子代理的写工具、shell 写命令、job_output 与预算闸门串联判定，全不命中返回 null。 |  |
| plugins/dsh-extra-plan/lib/gate-decisions.js | childReadonlyGateReason | L706-716 | 只读子代理的写工具、shell 写命令与 job_output 闸门，按探查者或复核者挑选文案。 |  |
| plugins/dsh-extra-plan/lib/gate-decisions.js | jobOutputGateReason | L721-743 | job_output 禁止前台等待与同 job 重复调用，缺会话上下文时跳过去重只查等待参数。 |  |
| plugins/dsh-extra-plan/lib/gate-decisions.js | recordJobOutputCall | L749-761 | 放行后把已调用的 job 号记入会话计数，任一条件不满足即返回 false 且不做写入。 |  |
| plugins/dsh-extra-plan/lib/gate-decisions.js | pollGuardGateReason | L767-780 | 同锚点周期内第二次调用 job_list 或 list_agents 即拒绝，无会话上下文时跳过查重。 |  |
| plugins/dsh-extra-plan/lib/gate-decisions.js | recordPollGuardCall | L782-793 | 放行后把 job_list 或 list_agents 记入会话集合，参数不全时返回 false 且无副作用。 |  |
| plugins/dsh-extra-plan/lib/gate-decisions.js | probeDisposalWarning | L801-804 | 仍有未认领的探查者委派时生成级联取消告警文案，计数非正整数时返回 null 不告警。 |  |
| plugins/dsh-extra-plan/lib/gate-decisions.js | mainGateReason | L814-943 | 主会话工具闸门总入口，按 ask、写入、shell、规划、委派与轮询顺序逐项判定后兜底放行。 |  |
| plugins/dsh-extra-plan/lib/gate-decisions.js | runCodeGroupDenyReason | L955-1039 | 把 run_code 代码拆成成员逐个走对应角色闸门，聚合任何拒绝并追加预算与防护判定。 |  |
| plugins/dsh-extra-plan/lib/gate-decisions.js | visit | L973-1016 | run_code 组判定的递归访问器，展平嵌套 run_code 并对每个成员选取角色闸门判定。 |  |
| plugins/dsh-extra-plan/lib/gate-decisions.js | aggregateRunCodeDenyReason | L1045-1057 | 把成员与拒绝项拼成统一的组拒文案，首行给组规模与放行语义，后续逐行列出成员与原因。 |  |
| plugins/dsh-extra-plan/lib/gate-words.js | fail | L31-33 | 以 extra-plan: config.gateWords 前缀同步抛出整组校验错误，供各字段分支统一复用。 |  |
| plugins/dsh-extra-plan/lib/gate-words.js | normalizeGateLabel | L36-38 | 去掉标签首尾空白与保留的推荐后缀（中英文圆括号），只做归一不做子串匹配，也不改词值。 |  |
| plugins/dsh-extra-plan/lib/gate-words.js | validateGateWords | L44-71 | 严格校验 7 个闸门词字段的齐全、非空、无空白、无保留后缀与两两不同；合法即返回冻结副本。 |  |
| plugins/dsh-extra-plan/lib/gate-words.js | bracketed | L73-75 | 把词数组渲染成逐词加中文直角引号并拼接的选项文案，供确认话术插值，空数组返回空串。 |  |
| plugins/dsh-extra-plan/lib/gate-words.js | createGateRuntime | L85-114 | 由显式入参派生运行时词表：分组数组、集合、确认文案与 prompt variable 映射，无参不给默认词表。 |  |
| plugins/dsh-extra-plan/lib/live-config.js | textOf | L34-36 | 把配置项原始值收敛为非空字符串并去掉首尾空白，非字符串或空白串返回空字符串且不抛错 |  |
| plugins/dsh-extra-plan/lib/live-config.js | envConfigPath | L38-40 | 读取环境变量里的显式配置路径文本并去空白，未设置或空白时返回空字符串表示未指定路径 |  |
| plugins/dsh-extra-plan/lib/live-config.js | errorText | L42-44 | 把任意异常对象收敛成可读文本，Error 取 message，其它值直接转字符串，不抛错也不返回空 |  |
| plugins/dsh-extra-plan/lib/live-config.js | sameAbsolutePath | L46-50 | 把两侧路径先解析为绝对路径再判等，Windows 下按小写比较，避免同一路径不同写法误判 |  |
| plugins/dsh-extra-plan/lib/live-config.js | exactHostCapabilities | L52-62 | 筛出与目标路径精确相等的 config-editor 文件能力，profilePatch 优先排序，其余按名称排 |  |
| plugins/dsh-extra-plan/lib/live-config.js | rank | L59 | 能力排序权重：profilePatch 最优先、editorDocument 次之、其余能力排最后，供排序时逐对比较 |  |
| plugins/dsh-extra-plan/lib/live-config.js | exactHostTarget | L64-68 | 在精确命中的宿主能力下解析配置目标，未命中任何可信能力时立即抛错，不做宽松路径回退 |  |
| plugins/dsh-extra-plan/lib/live-config.js | resolveAbsoluteTarget | L70-79 | 绝对路径配置目标的两级解析：preferHost 直取宿主，否则先工作区再宿主，失败抛最后错误 |  |
| plugins/dsh-extra-plan/lib/live-config.js | contextFrom | L81-88 | 按 agent 取路径上下文，其次取预设上下文，都不可得时返回空值，不抛错交由调用方判空 |  |
| plugins/dsh-extra-plan/lib/live-config.js | targetFromValue | L90-102 | 把配置源值归一为可信目标：字符串按绝对或相对分流，带分类对象按 kind 解析，非法即抛错 |  |
| plugins/dsh-extra-plan/lib/live-config.js | targetOf | L104-109 | 结合路径上下文与两个解析器取出配置目标，并据是否用文档解析器判定按文档或工作区解析 |  |
| plugins/dsh-extra-plan/lib/live-config.js | statStamp | L111-126 | 生成由 dev、ino、size、mtime、ctime 拼成的读盘戳，stat 失败时只返回不可用原因而不抛错 |  |
| plugins/dsh-extra-plan/lib/live-config.js | pick | L128-132 | 按设置定义校验单个取值，不合法时回退到传入默认值，合法则归一化后返回，全程不抛错 |  |
| plugins/dsh-extra-plan/lib/live-config.js | describeProblems | L134-136 | 把缺键、歧义、非法等问题列表拼成「键 = 状态」的一行告警文案，便于日志单行呈现 |  |
| plugins/dsh-extra-plan/lib/live-config.js | normalizedFallback | L138-143 | 以 apply 期配置快照补齐全部热读键，缺失或非法键回退到内置默认值，保证读取始终有值 |  |
| plugins/dsh-extra-plan/lib/live-config.js | createLiveConfig | L153-298 | 创建配置热读器：构造期读盘建基线并做装载期严格校验，运行期只按键回退、不向调用方抛错 |  |
| plugins/dsh-extra-plan/lib/live-config.js | warnOnce | L166-170 | 热读降级只告警一次的提示，带回落原因与配置路径，避免每次取值都重复刷屏污染运行日志 |  |
| plugins/dsh-extra-plan/lib/live-config.js | currentResolved | L172-189 | 按显式路径、环境变量、文档解析器三段取当前配置目标，失败时返回空路径与原因不抛错 |  |
| plugins/dsh-extra-plan/lib/live-config.js | currentContext | L191-193 | 取当前调用方的路径上下文并原样透传，供授权校验与目标解析复用，过程中不做任何缓存 |  |
| plugins/dsh-extra-plan/lib/live-config.js | readDiskValues | L195-217 | 读盘并解析 settings 行，逐键记录 captured 或 missing 状态，整行缺席时静默回退默认值 |  |
| plugins/dsh-extra-plan/lib/live-config.js | refresh | L240-278 | 目标或读盘戳变化时重读配置，失败按键回退快照，歧义与非法只告警一次而不向调用方抛错 |  |
| plugins/dsh-extra-plan/lib/live-config.js | read | L280-283 | 取某个热读键的当前值：先按需刷新配置再读缓存，键不存在时返回 undefined 而不抛错 |  |
| plugins/dsh-extra-plan/lib/live-config.js | get | L286 | 按键热读配置值，接收 agent 以取得按会话隔离的结果，非法值在读取前已回退默认值 |  |
| plugins/dsh-extra-plan/lib/live-config.js | anchoredBootstrap | L287 | 热读箭头 getter：anchored 首轮引导开关，每次取值先刷新磁盘配置，失败回退快照 |  |
| plugins/dsh-extra-plan/lib/live-config.js | creativeMode | L288 | 热读箭头 getter：创造模式开关，取值即刷新配置，读盘失败按键回退到 apply 期快照 |  |
| plugins/dsh-extra-plan/lib/live-config.js | runcodeCatchGate | L289 | 热读箭头 getter：PTC try/catch 闸门开关，取值即刷新并按键校验，非法值回退快照 |  |
| plugins/dsh-extra-plan/lib/live-config.js | crossProviderPlannerModel | L290 | 热读箭头 getter：跨 provider 规划模型开关，取值即刷新配置，失败回退 apply 快照 |  |
| plugins/dsh-extra-plan/lib/live-config.js | plannerModel | L291 | 热读箭头 getter：pro 规划默认模型，取值即刷新并做键值校验，非法值回退 apply 快照 |  |
| plugins/dsh-extra-plan/lib/live-config.js | plannerPromptSuffix | L292 | 热读箭头 getter：pre-step 追加的引导后缀，取值即刷新配置，缺失时回退快照值 |  |
| plugins/dsh-extra-plan/lib/live-config.js | exploreBudget | L293 | 热读箭头 getter：pro 探查额度，取值即刷新配置，非法或缺失回退到内置默认额度 |  |
| plugins/dsh-extra-plan/lib/live-config.js | otherAgentModel | L294 | 热读箭头 getter：其他子代理默认模型，取值即刷新配置，失败时回退 apply 期快照 |  |
| plugins/dsh-extra-plan/lib/live-config.js | reviewerUsesPlannerModel | L295 | 热读箭头 getter：验收者是否复用规划模型，取值即刷新配置，失败回退快照布尔值 |  |
| plugins/dsh-extra-plan/lib/model-routing.js | isExplicitRoute | L11-17 | 显式路由判定：子级 provider 或 model 任一与父值不同即算显式，空串视为无选择 |  |
| plugins/dsh-extra-plan/lib/model-routing.js | isExplicitEffort | L21-23 | 显式 effort 判定：仅非空字符串且与父值不同才算显式，空串与 undefined 一律不算 |  |
| plugins/dsh-extra-plan/lib/model-routing.js | requestConfigSnapshot | L33-46 | 请求配置快照：从会话 header 取 provider、model 与 maxTokens，取不到即返回 null |  |
| plugins/dsh-extra-plan/lib/model-routing.js | agentFromRegistry | L48-51 | 注册表取 Agent：agents 无 get 或抛异常一律回 undefined，绝不上抛中断父链上溯 |  |
| plugins/dsh-extra-plan/lib/model-routing.js | resolveAgentRouteSources | L54-84 | 路由来源解析：沿 parentSession 链上溯顶层主会话，断链或超 8 层标记不完整且不给 source |  |
| plugins/dsh-extra-plan/lib/model-routing.js | decidePlannerModelUse | L106-119 | planner 模型取舍：目录命中才覆盖，未命中静默降级，目录空或报错保守沿用配置模型 |  |
| plugins/dsh-extra-plan/lib/model-routing.js | routeKey | L130-132 | 路由键拼接：provider 与 model 之间插 NUL 分隔，供探针结果与 fallback 复用查表 |  |
| plugins/dsh-extra-plan/lib/model-routing.js | comparePlannerText | L134-138 | 候选文案比较：两侧非字符串一律当空串，再按字典序给出 -1、0、1，供候选排序使用 |  |
| plugins/dsh-extra-plan/lib/model-routing.js | plannerProviderRank | L140-144 | 候选优先级打分：官方 provider 记 2、与父同 provider 记 1、其余 0，用于排序 |  |
| plugins/dsh-extra-plan/lib/model-routing.js | sortPlannerCandidates | L146-157 | 候选排序：先按 provider 优先级降序，再按名称与 id 字典序，保证选择可复现 |  |
| plugins/dsh-extra-plan/lib/model-routing.js | createModelRouting | L162-650 | per-apply 路由工厂：两份 WeakMap 与惰性 llm、agents getter，返回三个解析入口 |  |
| plugins/dsh-extra-plan/lib/model-routing.js | plannerAbortError | L170-173 | 中断错误归一：signal 的 reason 为 Error 就原样返回，否则造固定文案的新错误 |  |
| plugins/dsh-extra-plan/lib/model-routing.js | withPlannerProbeDeadline | L177-210 | 探针截止封装：本地 AbortController 覆盖 30 秒超时与父 signal，超时返回标记不抛错 |  |
| plugins/dsh-extra-plan/lib/model-routing.js | probePlannerRoute | L214-256 | 真实路由探针：可先查目录命中，再 prepareCall 并收流，只认单个非 error 的 finish |  |
| plugins/dsh-extra-plan/lib/model-routing.js | probePlannerCandidates | L263-279 | 候选并发探针：按上限建 worker 依序取号，结果按发起顺序回填，完成顺序不影响选择 |  |
| plugins/dsh-extra-plan/lib/model-routing.js | worker | L266-273 | 并发池工作体：循环领取下一个候选序号，越界即退出，逐个执行真实探针且不共享控制器 |  |
| plugins/dsh-extra-plan/lib/model-routing.js | uniqueProviderCandidates | L281-290 | 候选去重：跳过缺 id 或重复 id 的 provider，缺名时用 id 顶替名称 |  |
| plugins/dsh-extra-plan/lib/model-routing.js | collectStrictProbeCandidates | L293-313 | 严格候选收集：列 provider 后去重并发探针，按 routeKey 存 outcomes 并汇总成功候选 |  |
| plugins/dsh-extra-plan/lib/model-routing.js | resolvePlannerEntrySingleProvider | L316-374 | 单 provider 路径：只查父目录与 advisory 列表，命中才用配置模型，异常静默保留已取值 |  |
| plugins/dsh-extra-plan/lib/model-routing.js | resolvePlannerEntryStrict | L377-429 | 严格 planner 路径：空串直接继承父路由，否则并发探针排序，全失败才验父 fallback，拒未验证路由 |  |
| plugins/dsh-extra-plan/lib/model-routing.js | resolvePlannerEntry | L433-442 | planner 入口：首次调用即缓存 promise，成功与拒绝都固定在 Agent 生命周期，不重复探针 |  |
| plugins/dsh-extra-plan/lib/model-routing.js | nonPlannerRouteSources | L446-450 | 非 planner 来源：取 getAgents 异常兜底后解析父链来源，拿不到注册表也不抛错 |  |
| plugins/dsh-extra-plan/lib/model-routing.js | nonPlannerFallbackEntry | L452-460 | 非 planner 兜底项：来源缺失返回 null，probe 取顶层 maxTokens、普通 child 取父值 |  |
| plugins/dsh-extra-plan/lib/model-routing.js | resolveOtherAgentEntrySingleProvider | L463-480 | 单 provider 非 planner：父目录命中配置模型才覆盖，目录异常静默回退父路由 |  |
| plugins/dsh-extra-plan/lib/model-routing.js | resolveOtherAgentEntryStrict | L484-514 | 严格非 planner：来源缺失即拒，空串继承父路由免探针，否则并发探针排序后验 fallback |  |
| plugins/dsh-extra-plan/lib/model-routing.js | resolveOtherAgentEntry | L517-526 | 非 planner 入口：每 child 独立缓存首个 promise，成功与拒绝都不重复解析 |  |
| plugins/dsh-extra-plan/lib/model-routing.js | throwIfReviewerAborted | L535-537 | 验收者中断前置：父 signal 已取消就抛规划者中断错误，未取消则静默返回继续 |  |
| plugins/dsh-extra-plan/lib/model-routing.js | awaitReviewerPending | L539-571 | 验收者等待：无 signal 直接返回原 promise，取消时清理挂起项并拒绝，避免悬挂 |  |
| plugins/dsh-extra-plan/lib/model-routing.js | cleanup | L547-549 | 取消监听清理：移除父 signal 上的 abort 监听，重复调用安全，不触碰 pending 本体 |  |
| plugins/dsh-extra-plan/lib/model-routing.js | onAbort | L550-556 | 中断回调：只生效一次，先清监听再注销挂起项并拒绝，迟到结果被 done 标志拦住 |  |
| plugins/dsh-extra-plan/lib/model-routing.js | removeReviewerPending | L573-578 | 挂起项注销：仅当桶内仍是同一 promise 才删掉该条目，桶空时连同键一起清除 |  |
| plugins/dsh-extra-plan/lib/model-routing.js | reviewerPendingEntryCount | L580-584 | 挂起项计数：遍历所有桶逐个累加条目数，供总数超 32 条时整表清空挂起与已结算缓存 |  |
| plugins/dsh-extra-plan/lib/model-routing.js | resolveReviewerEntry | L586-648 | 验收者入口：空串回退父项，按五段键缓存 settled 与 pending，失败兜底父项且取消原样传播 |  |
| plugins/dsh-extra-plan/lib/path-policy.js | policyError | L13-18 | 核心包错误工厂：生成携带 code 与冻结 details 的 TypeError，前缀统一便于上层按码分类 |  |
| plugins/dsh-extra-plan/lib/path-policy.js | isObject | L20-22 | 核心包内类型判定：仅非 null 且非数组的普通对象为真，数组、函数与类实例一律返回假值 |  |
| plugins/dsh-extra-plan/lib/path-policy.js | isOther | L24-26 | 核心包保留类别判定：字符串转小写后等于 other 才为真，其它类型与非字符串直接返回假 |  |
| plugins/dsh-extra-plan/lib/path-policy.js | rejectOther | L28-33 | 核心包保留类别拒绝：五个身份字段任一取 Other 即抛 OTHER_REJECTED，非对象跳过 |  |
| plugins/dsh-extra-plan/lib/path-policy.js | rejectOtherOptions | L35-40 | 核心包选项级 Other 拒绝：在对象检查外追加 capability 字段，命中保留类别即抛错 |  |
| plugins/dsh-extra-plan/lib/path-policy.js | isFullyQualifiedAbsolute | L42-45 | 核心包绝对路径判定：Windows 认盘符与 UNC 前缀，POSIX 只认斜杠开头，不做归一化 |  |
| plugins/dsh-extra-plan/lib/path-policy.js | rejectVariable | L47-57 | 核心包变量拒写：%VAR%、$VAR、~ 三种字面量均抛 VARIABLE_PATH，绝不展开变量 |  |
| plugins/dsh-extra-plan/lib/path-policy.js | lexicalPath | L59-73 | 核心包词法路径校验：拒绝空串、NUL、变量、drive-relative、URI 与歧义绝对路径，原样返回 |  |
| plugins/dsh-extra-plan/lib/path-policy.js | rootPath | L75-82 | 核心包根解析：必须显式传入明确绝对路径，归一化后返回，缺失或相对即抛 ROOT_REQUIRED |  |
| plugins/dsh-extra-plan/lib/path-policy.js | keyOf | L84-87 | 核心包路径键：归一化后 Windows 转小写用于比较，不修改调用方持有的原字符串 |  |
| plugins/dsh-extra-plan/lib/path-policy.js | samePath | L89-91 | 核心包同一路径判定：两侧路径键完全相等即真，只做词法比较且不解析链接与真实大小写 |  |
| plugins/dsh-extra-plan/lib/path-policy.js | isWithin | L93-99 | 核心包隶属判定：相等或相对路径不以 .. 起始为真，纯词法判断不触碰磁盘与链接解析 |  |
| plugins/dsh-extra-plan/lib/path-policy.js | assertLexicalWithin | L101-105 | 核心包越界断言：候选超出授权根时抛 ROOT_ESCAPE，附带 root 与 candidate 便于定位 |  |
| plugins/dsh-extra-plan/lib/path-policy.js | readOnlyCapabilityForLogicalPath | L107-114 | 核心包只读能力词法匹配：文件能力要求相等、目录能力要求包含，未命中返回 null |  |
| plugins/dsh-extra-plan/lib/path-policy.js | readOnlyCapabilityForRealPath | L116-125 | 核心包只读能力真实匹配：realpath 失败的能力跳过，其余按文件或目录比对真实路径 |  |
| plugins/dsh-extra-plan/lib/path-policy.js | rejectReadOnlyCapability | L127-129 | 核心包只读拒绝：描述符非空即抛 HOST_RESOURCE_READONLY，为空则静默返回 |  |
| plugins/dsh-extra-plan/lib/path-policy.js | purposeOf | L131-137 | 核心包用途取值：非空字符串且非 Other、不含 NUL，未指定时回退 fallback |  |
| plugins/dsh-extra-plan/lib/path-policy.js | capabilityName | L139-145 | 核心包能力名校验：null 与 undefined 归一为 null，非空字符串方合法，拒绝 Other |  |
| plugins/dsh-extra-plan/lib/path-policy.js | normalizeCapabilities | L147-170 | 核心包能力表归一：数组与对象皆可，逐项校验 name、type、access 并冻结，重名即抛错 |  |
| plugins/dsh-extra-plan/lib/path-policy.js | createPathContext | L172-190 | 核心包上下文创建：归一化 workspaceRoot、hostDataRoot 与能力表，三者全空即拒绝 |  |
| plugins/dsh-extra-plan/lib/path-policy.js | ensureContext | L192-201 | 核心包上下文复核：重新校验根与能力表结构，拒绝非 createPathContext 产出的影子对象 |  |
| plugins/dsh-extra-plan/lib/path-policy.js | capabilityOf | L203-209 | 核心包能力查询：名称为空返回 null，未注册能力抛 CAPABILITY_UNKNOWN 而非 undefined |  |
| plugins/dsh-extra-plan/lib/path-policy.js | relativeInput | L211-217 | 核心包路径归一：明确绝对路径归一化返回，相对路径拼授权根，歧义绝对路径直接拒绝且不猜 |  |
| plugins/dsh-extra-plan/lib/path-policy.js | makeTarget | L219-267 | 核心包目标装配：定根、核能力用途与范围、校验精确文件能力，产出冻结目标并缓存用途来源 |  |
| plugins/dsh-extra-plan/lib/path-policy.js | resolveWorkspacePath | L269-273 | 核心包工作区入口：固定 workspace 类别，携带 capability 参数即判非法 |  |
| plugins/dsh-extra-plan/lib/path-policy.js | resolveHostPath | L275-279 | 核心包宿主入口：固定 host 类别，能力缺失报 ROOT_REQUIRED，不回退工作区根 |  |
| plugins/dsh-extra-plan/lib/path-policy.js | targetInput | L281-305 | 核心包入参归一：裸值走指定类别，已解析目标复用其类别、能力与用途，类别缺失即抛错 |  |
| plugins/dsh-extra-plan/lib/path-policy.js | assertAllowedPath | L307-314 | 核心包放行断言：仅做词法与能力校验不探磁盘，返回附 allowed 标记的冻结目标 |  |
| plugins/dsh-extra-plan/lib/path-policy.js | isMissing | L316-318 | 核心包缺失判定：仅 ENOENT 与 ENOTDIR 算不存在，其余错误码一律不算缺失 |  |
| plugins/dsh-extra-plan/lib/path-policy.js | sameOrChildReal | L320-322 | 核心包真实越界断言：真实路径不隶属根即抛 REALPATH_ESCAPE，堵住链接逃逸 |  |
| plugins/dsh-extra-plan/lib/path-policy.js | physicalRoot | L324-339 | 核心包物理根：realpath 后必须是目录，区分不可解析、不可读取与非目录三类错误码 |  |
| plugins/dsh-extra-plan/lib/path-policy.js | inspectChain | L341-386 | 核心包父链探查：自目标逐级回溯至授权根，收集候选与最近父级真实路径，写模式拒绝链接 |  |
| plugins/dsh-extra-plan/lib/path-policy.js | expectedType | L388-392 | 核心包期望类型：file、directory、any 之外取值抛 TYPE_INVALID，缺省用调用方回退值 |  |
| plugins/dsh-extra-plan/lib/path-policy.js | checkType | L394-398 | 核心包类型核对：any 跳过，file 与 directory 不符时抛 TARGET_TYPE 并附目标路径 |  |
| plugins/dsh-extra-plan/lib/path-policy.js | validateReadTarget | L400-429 | 核心包读校验：目标缺失即 TARGET_MISSING，读后核对类型，返回含真实路径的只读快照 |  |
| plugins/dsh-extra-plan/lib/path-policy.js | prepareWriteTarget | L431-464 | 核心包写校验：宿主写须显式用途且能力可写，目标不得是符号链接，目录缺失时不隐式创建 |  |
| plugins/dsh-extra-plan/lib/planner-budget.js | toolCallCount | L11-40 | 统计成功配对的工具调用次数，跳过 save_plan 一类豁免名，事件非数组直接返回 0。 |  |
| plugins/dsh-extra-plan/lib/planner-budget.js | toolCallsSinceUser | L43-55 | 只统计最近一条用户或代理消息锚点之后的成功工具调用，无锚点时退回与全量口径一致。 |  |
| plugins/dsh-extra-plan/lib/planner-budget.js | appendSuffixBlock | L57-74 | 把文案追加到首个文本块末尾并补换行，空文案、非用户来源或已含该文案时原样返回消息。 |  |
| plugins/dsh-extra-plan/lib/planner-budget.js | withPlannerPromptSuffix | L76-83 | 追加探查后缀并为非结尾文本块补换行，非文本首块或单块消息时只做追加、不改动结构。 |  |
| plugins/dsh-extra-plan/lib/planner-budget.js | budgetNoticeText | L88-90 | 生成探查预算说明文案，含本轮上限次数与申请继续探查的固定格式，纯文案不读会话状态。 |  |
| plugins/dsh-extra-plan/lib/planner-budget.js | withBudgetNotice | L92 | 把预算说明追加进用户消息的首个文本块，纯文案拼接，消息形状不合法时原样返回消息。 |  |
| plugins/dsh-extra-plan/lib/planner-budget.js | budgetReminderText | L94-98 | 按剩余次数生成提醒文案，预算不高于阈值或剩余次数不在提醒窗口内时一律返回空字符串。 |  |
| plugins/dsh-extra-plan/lib/planner-budget.js | budgetReminderMessage | L105-107 | 把提醒文案包成带插件自有来源标识的用户消息，规避宿主新格式的来源校验被当场拒收。 |  |
| plugins/dsh-extra-plan/lib/planner-budget.js | budgetReminderSent | L109-129 | 判定最近用户锚点之后是否已发过含标记的提醒消息，事件非数组或无该标记返回 false。 |  |
| plugins/dsh-extra-plan/lib/planner-budget.js | budgetExhaustedReason | L131-133 | 生成探查预算耗尽的说明文案，含已用与上限两个计数，纯文案自身不核对是否真的耗尽。 |  |
| plugins/dsh-extra-plan/lib/planner-budget.js | budgetExceeded | L135-137 | 预算超限判定：已用严格大于上限才为真，相等不算超限，也不负责计数增删与文案生成。 |  |
| plugins/dsh-extra-plan/lib/preset-sync.js | errorWithCause | L36-40 | 把 message 与底层 cause 组装成新的 Error 对象并返回，只构造错误、从不抛出 |  |
| plugins/dsh-extra-plan/lib/preset-sync.js | assertInstallAnchor | L42-57 | 校验 installAnchor 必须是存在的绝对 package.json 且属于官方应用，任一不符即抛错 |  |
| plugins/dsh-extra-plan/lib/preset-sync.js | loadOfficialAgentPreset | L59-73 | 按 installAnchor 加载官方 preset adapter 并按锚点缓存，失败包成带 cause 的错误 |  |
| plugins/dsh-extra-plan/lib/preset-sync.js | assetReadTarget | L100-106 | 把预设资产相对路径在只读能力上下文里解析并校验为文件，返回绝对路径，越界或缺失即抛错 |  |
| plugins/dsh-extra-plan/lib/preset-sync.js | readAssetBytes | L108-117 | 读取预设资产文件字节，目标缺失时改抛带 label 的中文错误，其它异常原样上抛 |  |
| plugins/dsh-extra-plan/lib/preset-sync.js | resourceReadTarget | L119-133 | 按 kind 分流 host 或 workspace 解析资源路径并校验为文件，缺上下文或 kind 非法即抛错 |  |
| plugins/dsh-extra-plan/lib/preset-sync.js | readResourceBytes | L135-142 | 读取自定义资源字节，目标缺失时返回 null 而不抛错，其它异常照常上抛给调用方 |  |
| plugins/dsh-extra-plan/lib/preset-sync.js | contentHash | L144-161 | 对预设两个核心文件按顺序累加做 sha256 摘要，任一文件缺失返回 null 而不抛错 |  |
| plugins/dsh-extra-plan/lib/preset-sync.js | pluginRows | L164-176 | 按当前数组顺序深度优先展开 group 子行，非数组或非对象行跳过且不改变原数组 |  |
| plugins/dsh-extra-plan/lib/preset-sync.js | visit | L166-173 | 插件行遍历内部函数：跳过非对象项，遇 config 数组继续下钻递归，不做过滤也不复制行 |  |
| plugins/dsh-extra-plan/lib/preset-sync.js | pluginRowIds | L178-180 | 从展开后的插件行里挑出非空字符串 id 组成列表，无 id 或非字符串的行被丢弃 |  |
| plugins/dsh-extra-plan/lib/preset-sync.js | declarationCoversAsset | L182-191 | 判断声明是否覆盖固定行与任一 executor 行，非数组时直接返回 false 不抛错 |  |
| plugins/dsh-extra-plan/lib/preset-sync.js | plainObject | L193-195 | 预设合并侧判据：确认 config、override、inherited 各层为可叠加普通映射，排除数组与空值。 |  |
| plugins/dsh-extra-plan/lib/preset-sync.js | userWritableByRow | L197-213 | 汇总每个宿主行可被用户改写的叶键表，非法键与含点号路径一律跳过不入表，供比对使用 |  |
| plugins/dsh-extra-plan/lib/preset-sync.js | push | L199-206 | 把行 id 与 config 叶键登记进用户可写表，空 id 与含点号路径等非法项直接忽略 |  |
| plugins/dsh-extra-plan/lib/preset-sync.js | userIdentityRowIds | L219-227 | 遍历 HOST_ROW_SETTING_DEFINITIONS，把 sourceLocator.rowIds 数组中的非空行 id 收成并集，供 stripUserWritable 识别行身份型设置 |  |
| plugins/dsh-extra-plan/lib/preset-sync.js | stripUserWritable | L229-247 | 克隆插件行并把其中用户可写叶值统一替换成占位符，用于抹平用户差异后再做深度等价比对 |  |
| plugins/dsh-extra-plan/lib/preset-sync.js | declarationBodyMatchesAsset | L249-252 | 抹掉用户可写值后比对声明与资产 body 是否等价，任一侧非数组时直接视为匹配成功 |  |
| plugins/dsh-extra-plan/lib/preset-sync.js | carryUserWritable | L254-278 | 从插件行挑出用户可写值按行 id 汇总成对象，并把 gateWords 单独拆出返回 |  |
| plugins/dsh-extra-plan/lib/preset-sync.js | effectiveRowConfig | L280-291 | 按继承配置、本轮配置与 override 三层依次合并出行生效配置，全无时返回 null |  |
| plugins/dsh-extra-plan/lib/preset-sync.js | findRowsById | L294-309 | 递归遍历文档对象收集所有 id 命中的行，用已访问集合防重复与自引用环，不做去重后过滤 |  |
| plugins/dsh-extra-plan/lib/preset-sync.js | visit | L297-306 | 文档遍历内部函数：按对象与数组分别下钻，跳过 null 与已访问值避免成环，命中行即收集 |  |
| plugins/dsh-extra-plan/lib/preset-sync.js | validDefinitionValue | L311-313 | 直接用设置定义校验传入值是否合法，只返回布尔值，既不抛错也不做任何归一化与改写处理 |  |
| plugins/dsh-extra-plan/lib/preset-sync.js | captureLegacyValues | L315-382 | 按定位从旧插件行逐个捕获设置值，逐项标注捕获、缺失、非法或歧义状态，供迁移判定使用 |  |
| plugins/dsh-extra-plan/lib/preset-sync.js | validGateWordsOrUndefined | L384-386 | 校验 gateWords 是否合法，非法时吞掉异常返回 undefined 而不向上抛错 |  |
| plugins/dsh-extra-plan/lib/preset-sync.js | legacyStateFromPlugins | L388-402 | 在候选值捕获结果上再读词表行的 gateWords，返回旧值、各状态与原始插件列表供迁移 |  |
| plugins/dsh-extra-plan/lib/preset-sync.js | readLegacyState | L405-459 | 解析旧 patch 文本并汇总权威值、投影值、词表与诊断，解析失败时返回空态并附诊断 |  |
| plugins/dsh-extra-plan/lib/preset-sync.js | resolveUnifiedConfig | L462-530 | 按设置行、旧投影、旧 body、默认值四级优先统一解析配置，并给出需要回写的 patch |  |
| plugins/dsh-extra-plan/lib/preset-sync.js | restateSettingsConfig | L532-557 | 合并当前与继承配置后按 patch 重述全局设置行，任何非法键或值直接抛错且不落盘 |  |
| plugins/dsh-extra-plan/lib/preset-sync.js | assertPresetDefinition | L559-573 | 校验主 definition 的 id、名称、17 条插件行与三个 group 契约，不符即抛错 |  |
| plugins/dsh-extra-plan/lib/preset-sync.js | parsePresetDefinition | L575-577 | 把 YAML 文本解析成 definition 并套用主预设契约校验，失败时向外抛错 |  |
| plugins/dsh-extra-plan/lib/preset-sync.js | assetDefinition | L582-587 | 读取生成的主 definition 并缓存，缓存对象视为只读，后续调用直接返回不再校验 |  |
| plugins/dsh-extra-plan/lib/preset-sync.js | assertRoleDefinition | L590-602 | 校验角色 definition 的 id、名称与固定首两行，不套用主预设 17 条契约 |  |
| plugins/dsh-extra-plan/lib/preset-sync.js | roleDefinitionOf | L604-609 | 按角色 id 取对应 definition 文件解析并校验，未知角色直接抛错不兜底 |  |
| plugins/dsh-extra-plan/lib/preset-sync.js | assetDefinitions | L612-614 | 返回主 definition 加四个角色 definition 的有序列表，主定义在前角色在后 |  |
| plugins/dsh-extra-plan/lib/preset-sync.js | roleDefinitionsWithPresentation | L623-647 | 把主 definition 的呈现模式投影到四个角色 definition，行数不为 1 或异常时原样返回 |  |
| plugins/dsh-extra-plan/lib/preset-sync.js | readDefinitionGateWords | L649-653 | 从 definition 的词表行取出词表并校验，缺该行或格式非法时直接抛错，不做默认兜底 |  |
| plugins/dsh-extra-plan/lib/preset-sync.js | projectHostRow | L664-682 | 按定位表把单个设置值改写到宿主行，返回 ok、skipped 或 missing 表示结果 |  |
| plugins/dsh-extra-plan/lib/preset-sync.js | cloneDefinitionWithProjection | L684-696 | 深克隆 definition 后逐项投影设置值，缺宿主行时抛错，绝不回退到生成物默认值 |  |
| plugins/dsh-extra-plan/lib/preset-sync.js | definitionWithProjection | L698-700 | 以资产 definition 为底克隆并套用给定投影，返回新的 definition 副本 |  |
| plugins/dsh-extra-plan/lib/preset-sync.js | publicConfigOf | L702-705 | 取行或配置对象的公开 config，取值非对象或取不到时一律返回空对象而不抛错，不做克隆 |  |
| plugins/dsh-extra-plan/lib/preset-sync.js | directProjectionFromLegacy | L711-725 | 从旧插件行抽出 webFetch、旧呈现模式叶与词表值，组装成可直接使用的投影对象 |  |
| plugins/dsh-extra-plan/lib/preset-sync.js | assertTemplateGateWords | L727-731 | 校验厂商模板文本里的 gateWords 能被解析且合法，任何不符情形都立即抛错 |  |
| plugins/dsh-extra-plan/lib/preset-sync.js | readDeclaredPluginsFromPatch | L733-746 | 从 patch 文本中取出旧预设行的插件数组，文本为空或解析失败返回 undefined |  |
| plugins/dsh-extra-plan/lib/preset-sync.js | visit | L738-743 | 旧预设扫描内部函数：递归遍历文档把旧行 config.plugins 收集进结果数组 |  |
| plugins/dsh-extra-plan/lib/preset-sync.js | readLegacyPresetState | L748-751 | 返回旧预设行声明的插件列表与其直接投影值，供启动迁移阶段读取旧值使用，全程不写盘 |  |
| plugins/dsh-extra-plan/lib/preset-sync.js | syncPreset | L757-808 | 计算启动迁移计划：待写设置、投影后 definition 与 stale 判定，无需工作时返回 idle |  |
| plugins/dsh-extra-plan/lib/preset-sync.js | findEntry | L810-813 | 在行数组里按 entry 选项中的 id 找唯一一项并返回其 entry，多命中返回 undefined |  |
| plugins/dsh-extra-plan/lib/preset-sync.js | applyPlan | L815-823 | 只把计划中的设置值经 editor.edit 重述到全局行，设置行缺失即抛错且不写入 |  |
| plugins/dsh-extra-plan/lib/preset-sync.js | trustedProfileContextOf | L825-832 | 优先取 ctx.profileContext，缺失时退回 ctx.get 读取，两者都不可得返回 undefined |  |
| plugins/dsh-extra-plan/lib/preset-sync.js | withProfilePatchCapability | L834-837 | 把 profilePatch 只读能力并入既有能力集合，按数组与对象两种形态分别适配 |  |
| plugins/dsh-extra-plan/lib/preset-sync.js | syncPathContext | L839-849 | 组装 config-editor 使用的路径上下文，无根也无能力时返回 null 而不抛错 |  |
| plugins/dsh-extra-plan/lib/preset-sync.js | readRawPatch | L851-868 | 按受信 patchPath 或 editor 文档路径读取 patch 文本，越权与读失败一律返回 undefined |  |
| plugins/dsh-extra-plan/lib/preset-sync.js | settingsValuesFromRows | L870-873 | 从行数组取全局设置行唯一的生效配置，该行不存在或出现多行时返回 undefined |  |
| plugins/dsh-extra-plan/lib/preset-sync.js | activeLegacyRow | L875-882 | 判断旧预设行是否启用且其 fiber 处于有效生命周期状态，仅返回布尔值、不改任何状态 |  |
| plugins/dsh-extra-plan/lib/preset-sync.js | projectedAssetDefinition | L885-895 | 只按当前设置行与 raw patch 投影出 definition，不再走旧预设行迁移分支 |  |
| plugins/dsh-extra-plan/lib/preset-sync.js | readPatch | L888 | 闭包直接返回已捕获的 raw patch 文本，全程不做重新读取文件动作，缺失时为 undefined |  |
| plugins/dsh-extra-plan/lib/preset-sync.js | structuralValue | L897-908 | 把值归一成可比对结构，函数转标记、环转占位并跳过 fiber 与 entry 键 |  |
| plugins/dsh-extra-plan/lib/preset-sync.js | rowStructureRecord | L910-929 | 把一行归一成 id、name、disabled 与 config 结构记录，设置行返回 undefined |  |
| plugins/dsh-extra-plan/lib/preset-sync.js | structuralFingerprint | L932-950 | 遍历行生成非设置结构指纹并附 legacy 或 official 归属，用于交接判定 |  |
| plugins/dsh-extra-plan/lib/preset-sync.js | visit | L934-947 | 结构指纹内部函数：展开嵌套 config 行收集结构记录，非数组、空行与无效行直接跳过 |  |
| plugins/dsh-extra-plan/lib/preset-sync.js | installAnchorOf | L952-955 | 取 profileContext 的 installAnchor，缺失时回退到 options 里传入的取值 |  |
| plugins/dsh-extra-plan/lib/preset-sync.js | mountPresetSync | L957-1158 | 挂载预设同步：首次收敛设置、投影并顺序挂载官方 adapter，返回幂等的释放函数 |  |
| plugins/dsh-extra-plan/lib/preset-sync.js | disposeFiber | L971-974 | 调用 fiber 的 dispose 释放已挂载项，fiber 无效或无 dispose 方法时返回 undefined |  |
| plugins/dsh-extra-plan/lib/preset-sync.js | reportSettledError | L975-982 | 上报落定设置回调的错误，上报回调自身再失败时只打印控制台告警，不阻断流程也不重抛 |  |
| plugins/dsh-extra-plan/lib/preset-sync.js | reportAdapterError | L983-991 | 组装 phase 与消息成诊断对象并转交错误回调，上报器自身抛错时降级为控制台告警 |  |
| plugins/dsh-extra-plan/lib/preset-sync.js | readState | L992-1005 | 读取当前行、raw patch、旧态与结构指纹快照，并附 legacy 或 official 归属 |  |
| plugins/dsh-extra-plan/lib/preset-sync.js | snapshotOf | L1006-1016 | 用行设置与 raw patch 解析出设置值与词表快照，深拷贝后交给落定回调上报，不做写入 |  |
| plugins/dsh-extra-plan/lib/preset-sync.js | readPatch | L1009 | 闭包把当前状态已捕获的 raw patch 交给统一解析，不重复读取文件，保持与快照一致 |  |
| plugins/dsh-extra-plan/lib/preset-sync.js | enqueueSettled | L1017-1028 | 把落定回调串进串行队列按序执行，回调异常转给错误上报且队列继续向下推进，不丢后续更新 |  |
| plugins/dsh-extra-plan/lib/preset-sync.js | settledSettingsUpdate | L1029-1037 | 先取当前设置快照再入队上报，取快照失败时只上报错误而不阻断后续更新，并返回上报结果 |  |
| plugins/dsh-extra-plan/lib/preset-sync.js | enqueueStructural | L1038-1046 | 把结构任务串进结构队列串行执行并吞掉失败，只打印告警不阻断设置同步流程，返回安全 promise |  |
| plugins/dsh-extra-plan/lib/preset-sync.js | mountOfficialAdapter | L1051-1076 | 按顺序挂载主与角色 definition，任一失败即回滚已挂载 fiber 并抛错 |  |
| plugins/dsh-extra-plan/lib/preset-sync.js | disposeCurrentAdapter | L1077-1081 | 倒序释放当前已挂载的全部 adapter fiber，随后清空本地引用，供重新挂载使用 |  |
| plugins/dsh-extra-plan/lib/preset-sync.js | structuralHandoff | L1082-1102 | 结构变化后重算同步计划、按需写设置并重新挂载官方 adapter，已失活时静默返回 |  |
| plugins/dsh-extra-plan/lib/preset-sync.js | readPatch | L1091 | 闭包把交接时捕获的 raw patch 交给同步计划，避免二次读取文件带来的漂移，口径同快照 |  |
| plugins/dsh-extra-plan/lib/preset-sync.js | apply | L1093 | 结构交接阶段应用设置计划的回调，已失活时由写入层内部自行跳过，不抛错也不重试写入 |  |
| plugins/dsh-extra-plan/lib/preset-sync.js | initialMount | L1103-1130 | 首次读取状态、收敛设置并按序挂载 definition，整体失败只上报诊断不阻断后续同步 |  |
| plugins/dsh-extra-plan/lib/preset-sync.js | readPatch | L1112 | 闭包把首次读取的 raw patch 交给同步计划，保证设置值与随后挂载的快照同源，不二次读盘 |  |
| plugins/dsh-extra-plan/lib/preset-sync.js | apply | L1114 | 首次挂载时应用设置计划的回调，绑定初始 editor 与当前活性判定，失活即跳过 |  |
| plugins/dsh-extra-plan/lib/preset-sync.js | settledOnlyUpdate | L1131 | 只处理落定设置更新的轻量入口，不触发结构重挂与 adapter 交接，避免多余挂载 |  |
| plugins/dsh-extra-plan/lib/preset-sync.js | dispose | L1147-1155 | 关闭更新订阅、等待两个队列收敛并释放 adapter，重复调用直接返回不再重复执行 |  |
| plugins/dsh-extra-plan/lib/preset-yaml.js | loadYaml | L5-8 | 按本模块地址创建 require 并加载 js-yaml，只在模块初始化时调用一次。 |  |
| plugins/dsh-extra-plan/lib/preset-yaml.js | resolve | L13 | 作为 !!js 标量类型的 resolve 回调，只判断解析值是否为字符串，不做其它校验。 |  |
| plugins/dsh-extra-plan/lib/preset-yaml.js | construct | L14 | 作为 !!js 标量类型的构造回调，把原文包成带 __jsExpr 的对象而不执行。 |  |
| plugins/dsh-extra-plan/lib/preset-yaml.js | predicate | L15 | 作为 !!js 标量类型的判定回调，只认带字符串 __jsExpr 字段的对象。 |  |
| plugins/dsh-extra-plan/lib/preset-yaml.js | represent | L16 | 作为 !!js 标量类型的序列化回调，输出 __jsExpr 原文而不额外加引号。 |  |
| plugins/dsh-extra-plan/lib/preset-yaml.js | parsePresetYaml | L31-34 | 解析多文档 YAML 只取第一文档，空流返回 undefined，不抛错也不做结构校验。 |  |
| plugins/dsh-extra-plan/lib/preset-yaml.js | hasOwn | L36-38 | 判断对象自身是否含有指定键，用与原型链无关的自有属性检查，非对象或空值入参一律返回假。 |  |
| plugins/dsh-extra-plan/lib/preset-yaml.js | pathParts | L40-42 | 把点分路径拆成非空段数组，空段与连续的点被忽略，不解析转义符也不做数组下标扩展。 |  |
| plugins/dsh-extra-plan/lib/preset-yaml.js | readPath | L44-51 | 逐段读取对象路径上的值，任一段缺失即返回 exists 为假，不抛错也不回退默认值。 |  |
| plugins/dsh-extra-plan/lib/preset-yaml.js | collectRowsById | L53-68 | 深度优先收集同 id 的全部行及其数据路径，按对象身份去重，防止环引用导致无限递归。 |  |
| plugins/dsh-extra-plan/lib/preset-yaml.js | visit | L56-65 | collectRowsById 的内部递归闭包，逐层遍历数组与对象并累积数据路径。 |  |
| plugins/dsh-extra-plan/lib/preset-yaml.js | rowsById | L71-73 | 返回同 id 的全部行对象，不附带任何数据路径，直接沿用既有消费者所需的返回形状。 |  |
| plugins/dsh-extra-plan/lib/preset-yaml.js | rowsByIdWithPath | L76-83 | 返回同 id 行的序号、行对象与点分数据路径，专门供唯一行诊断与迁移前的比对使用。 |  |
| plugins/dsh-extra-plan/lib/preset-yaml.js | resolveLocator | L85-112 | 按单个定位器解析行与叶值：零命中为 missing、多命中为 ambiguous、否则 ok。 |  |
| plugins/dsh-extra-plan/lib/preset-yaml.js | locatorFor | L114-119 | 取描述符的 sourceLocator，无该字段时把入参当作裸定位器原样返回，不校验形状。 |  |
| plugins/dsh-extra-plan/lib/preset-yaml.js | aliasesFor | L121-126 | 取描述符的别名定位器数组，缺该字段或不是数组时一律返回空数组，不回退到主定位器。 |  |
| plugins/dsh-extra-plan/lib/preset-yaml.js | resolveSetting | L135-148 | 依次试主定位器与别名定位器，多命中或任一歧义即判 ambiguous，全空判 missing。 |  |
| plugins/dsh-extra-plan/lib/preset-yaml.js | resolveTemplateSettingDefault | L150-165 | 从模板解析单项默认值并校验归一，描述符缺失、解析失败或值非法一律抛错，不回退默认。 |  |
| plugins/dsh-extra-plan/lib/preset-yaml.js | captureRowSettings | L176-192 | 按权威 settings 行捕获各设置并附 rowPresent 标志，只认规范 name 的行。 |  |
| plugins/dsh-extra-plan/lib/preset-yaml.js | migrationEntryName | L195-198 | 从迁移条目取插件名，兼容 entry.options.name 与顶层 name 两种形状。 |  |
| plugins/dsh-extra-plan/lib/preset-yaml.js | migrationEntryConfig | L200-206 | 按继承、本条目与覆盖三层浅合并迁移条目的 config，非对象层直接忽略，不深合并。 |  |
| plugins/dsh-extra-plan/lib/preset-yaml.js | migrationManagedConfig | L208-218 | 只取受管键并逐项校验归一，缺键、值非法或 gateWords 非法均返回 undefined。 |  |
| plugins/dsh-extra-plan/lib/preset-yaml.js | migrationComparable | L220-223 | 把受管 config 归一为可比较快照，非法时返回 undefined 供上层判冲突。 |  |
| plugins/dsh-extra-plan/lib/preset-yaml.js | migrationHash | L225 | 对文本按 UTF8 计算 sha256 十六进制摘要，不判空也不吞错，供迁移前后比对。 |  |
| plugins/dsh-extra-plan/lib/preset-yaml.js | migrationIgnorable | L226 | 判断某行是否为空行或整行注释，只做去掉空白后的前缀判断，不看缩进也不看引号状态。 |  |
| plugins/dsh-extra-plan/lib/preset-yaml.js | migrationIndent | L227 | 用行首空白正则量出缩进列数，制表符同样只按一个字符计入，不折算成固定的显示宽度。 |  |
| plugins/dsh-extra-plan/lib/preset-yaml.js | migrationScalarToken | L229-234 | 去掉行内注释后再解出引号标量，双引号转义失败时退化为直接删掉首尾字符，并不抛错。 |  |
| plugins/dsh-extra-plan/lib/preset-yaml.js | migrationRowStarts | L236-242 | 找出各行起始下标，只认行首列表项的 id 或 override 键，跳过缩进不符的行。 |  |
| plugins/dsh-extra-plan/lib/preset-yaml.js | migrationRowId | L244-250 | 在给定行区间内找首个 id 键并解出值，未找到返回 undefined 不抛错。 |  |
| plugins/dsh-extra-plan/lib/preset-yaml.js | planCanonicalSettingsMigration | L253-316 | 只规划临时 fixture 的 settings 行去重迁移，回读校验后给出新文本与回滚快照，从不写文件。 |  |
| plugins/dsh-extra-plan/lib/preset-yaml.js | findPluginsRow | L318-329 | 在插件行中按 id 深度优先查子行，含 group 行子行数组，未命中返回 null。 |  |
| plugins/dsh-extra-plan/lib/preset-yaml.js | readProjectedValue | L336-355 | 读声明行中某项设置的当前投影值，缺失或非法一律返回 undefined 而不回退默认。 |  |
| plugins/dsh-extra-plan/lib/preset-yaml.js | restatePluginsRow | L358-365 | 深拷贝插件行后整体重述目标子行的 config 键，找不到子行返回 null，不做深合并。 |  |
| plugins/dsh-extra-plan/lib/preset-yaml.js | inlineCommentIndex | L367-385 | 在引号态之外找行内注释起点，引号内的井号不算注释，未找到时返回 -1 而不抛错。 |  |
| plugins/dsh-extra-plan/lib/preset-yaml.js | lineIndent | L387-390 | 量出行首空格的个数作为缩进量，只认空格字符，制表符与其它空白字符一律不计入其中。 |  |
| plugins/dsh-extra-plan/lib/preset-yaml.js | withoutCr | L392-394 | 只去掉行尾的一个回车符，没有回车时原样返回同一字符串，不处理行中间出现的回车符。 |  |
| plugins/dsh-extra-plan/lib/preset-yaml.js | parseRowId | L396-408 | 从行里解出行 id 标量，支持单双引号与行内注释，非 id 行返回 null 不抛错。 |  |
| plugins/dsh-extra-plan/lib/preset-yaml.js | parseMapKey | L410-414 | 解出映射行的键名与缩进，列表项行或非键行返回 null，遇到引号包裹的键也不展开。 |  |
| plugins/dsh-extra-plan/lib/preset-yaml.js | rowEnd | L416-424 | 找出某个行块的结束下标，跳过空行与注释行，遇到首个同级或更浅缩进的非空行即停止。 |  |
| plugins/dsh-extra-plan/lib/preset-yaml.js | findDirectKey | L426-444 | 在行块内找指定键的直接子行下标，层级不符或未命中均返回 null，不做模糊匹配。 |  |
| plugins/dsh-extra-plan/lib/preset-yaml.js | textPathLine | L446-458 | 按点分路径逐层下钻查找文本行下标，任一层缺失即返回 null，不回头猜测近似行。 |  |
| plugins/dsh-extra-plan/lib/preset-yaml.js | findTextLocatorMatches | L460-476 | 在原文里按定位器查找行匹配，返回每项的行起止与叶行下标，无匹配时返回空数组不抛错。 |  |
| plugins/dsh-extra-plan/lib/qqbot-settings-sync.js | profileIdentityOf | L34-52 | 从传入上下文或 profile 对象判定 profile 名与已启动包身份，读不到时返回 unknown 而不抛错 |  |
| plugins/dsh-extra-plan/lib/qqbot-settings-sync.js | profileGate | L54-59 | 按身份判定给出放行或终态：web 放行、qqbot 标不适用、其余一律不可用并带原因 |  |
| plugins/dsh-extra-plan/lib/qqbot-settings-sync.js | absoluteRoot | L61-68 | 把传入路径经路径上下文锚成绝对根目录，空串或非法路径一律返回 null 而不抛错 |  |
| plugins/dsh-extra-plan/lib/qqbot-settings-sync.js | hostTarget | L70-78 | 在授权上下文下解析 host 路径，无能力失败时带能力重试一次，均失败抛首个错误 |  |
| plugins/dsh-extra-plan/lib/qqbot-settings-sync.js | authorizedReadPath | L80-83 | 解析并校验 host 只读目标路径，缺上下文时返回 null 而不抛错，也不读文件 |  |
| plugins/dsh-extra-plan/lib/qqbot-settings-sync.js | authorizedWritePath | L85-88 | 解析并校验 host 可写目标路径，缺上下文时返回 null 而不抛错，也不落盘 |  |
| plugins/dsh-extra-plan/lib/qqbot-settings-sync.js | plainObject | L95-97 | QQBot 迁移校验侧判据：校验镜像快照、行 override 与托管 config 均为普通映射，拒数组与空值。 |  |
| plugins/dsh-extra-plan/lib/qqbot-settings-sync.js | errorText | L99-101 | 取错误对象的 message 文本，非 Error 值直接转成字符串返回，自身不抛错 |  |
| plugins/dsh-extra-plan/lib/qqbot-settings-sync.js | loadYaml | L103-121 | 惰性加载 js-yaml 与自定义 JS 标量 schema 并缓存，失败缓存后重新抛出 |  |
| plugins/dsh-extra-plan/lib/qqbot-settings-sync.js | resolve | L110 | js 标量解析器：把标量文本原样透传成字符串返回，既不做求值也不做任何类型转换处理 |  |
| plugins/dsh-extra-plan/lib/qqbot-settings-sync.js | construct | L111 | js 标签构造器：把标量文本包成带 __jsExpr 的对象，永不求值执行，只留表达式原文 |  |
| plugins/dsh-extra-plan/lib/qqbot-settings-sync.js | predicate | L112 | js 标签判定器：仅当对象带字符串 __jsExpr 字段时才判定命中，否则返回 false |  |
| plugins/dsh-extra-plan/lib/qqbot-settings-sync.js | represent | L113 | js 标签输出器：把带 __jsExpr 的对象还原成原始文本写出，不做额外转义 |  |
| plugins/dsh-extra-plan/lib/qqbot-settings-sync.js | parseYaml | L123-126 | 用带 JS 标量 schema 的加载器解析 YAML 文本，解析失败直接向外抛错 |  |
| plugins/dsh-extra-plan/lib/qqbot-settings-sync.js | readableDirectory | L128-136 | 判定路径是否为授权可读目录，任何异常都吞掉并返回 false，不向上抛错也不提示 |  |
| plugins/dsh-extra-plan/lib/qqbot-settings-sync.js | unavailable | L138-140 | 构造函数化的不可用结果对象，带 reason 与可选附加字段，永不抛错也不写盘文件 |  |
| plugins/dsh-extra-plan/lib/qqbot-settings-sync.js | documentPathValue | L142-144 | 把文档路径值规整成去首尾空白的字符串，非字符串返回空串并不抛错，供后续形状判定用 |  |
| plugins/dsh-extra-plan/lib/qqbot-settings-sync.js | rootFromDocumentPath | L146-157 | 从文档路径按固定三层目录形状推断 profiles 根，形状不符时返回 invalid |  |
| plugins/dsh-extra-plan/lib/qqbot-settings-sync.js | environmentValue | L159-161 | 读取环境变量并去掉首尾空白字符，变量缺失或取值非字符串时返回空串，也不做任何猜测 |  |
| plugins/dsh-extra-plan/lib/qqbot-settings-sync.js | resolveProfilesRoot | L164-197 | 只接受 configEditor 文档路径与 DSH_HOME 两个来源定位 profiles 根，否则返回不可用 |  |
| plugins/dsh-extra-plan/lib/qqbot-settings-sync.js | sortedNames | L199-201 | 对名字列表按字典序升序排序后返回新数组，不修改传入的原数组，也不做任何去重或过滤 |  |
| plugins/dsh-extra-plan/lib/qqbot-settings-sync.js | scanOwnQqbotProfiles | L203-255 | 扫描 profiles 根下直接子目录，只保留装了 qqbot 包与本插件的 profile 目录 |  |
| plugins/dsh-extra-plan/lib/qqbot-settings-sync.js | findOwnQqbotProfiles | L258-270 | 返回自有 qqbot profile 名列表，诊断与状态挂在不可枚举属性上而不隐藏 |  |
| plugins/dsh-extra-plan/lib/qqbot-settings-sync.js | snapshotValues | L272-278 | 从快照对象取受管设置值，快照不是普通对象时直接抛错，不回退成空值也不补任何默认值 |  |
| plugins/dsh-extra-plan/lib/qqbot-settings-sync.js | snapshotGateWords | L280-284 | 从快照或快照 values 里取词表，两处都没有时返回 undefined 而不抛错 |  |
| plugins/dsh-extra-plan/lib/qqbot-settings-sync.js | validateSettingsSnapshot | L287-302 | 校验并归一化设置值与词表后冻结快照，缺键或类型不符即抛错且不回退，返回的快照只读 |  |
| plugins/dsh-extra-plan/lib/qqbot-settings-sync.js | expectedManaged | L304-307 | 把已校验快照转成受管键加词表的期望结果，未校验的快照先补一次校验，且不改动原对象 |  |
| plugins/dsh-extra-plan/lib/qqbot-settings-sync.js | canonicalSnapshot | L309-314 | 按固定键序整理设置值与词表项，生成可稳定序列化与哈希的规范快照，不夹带任何其它键 |  |
| plugins/dsh-extra-plan/lib/qqbot-settings-sync.js | stableSnapshotHash | L317-320 | 按规范快照计算 sha256 哈希，快照非法时直接抛错而不做兜底，保持哈希口径唯一 |  |
| plugins/dsh-extra-plan/lib/qqbot-settings-sync.js | managedSnapshotHashFromConfig | L322-328 | 从行配置计算受管快照哈希，缺键或词表非法时返回 null 而不抛错，也不补默认值 |  |
| plugins/dsh-extra-plan/lib/qqbot-settings-sync.js | patchDiagnostic | L330-362 | 采集 patch 与备份的字节、mtime 与哈希诊断，读取失败一律置 null 不抛错 |  |
| plugins/dsh-extra-plan/lib/qqbot-settings-sync.js | strictAssociation | L364-366 | 判定输入是否为带非空 saveRunId 的严格关联写入请求，只返回布尔值不抛错 |  |
| plugins/dsh-extra-plan/lib/qqbot-settings-sync.js | splitText | L368-374 | 把文本拆成行并记录换行风格与是否有结尾换行，供后续原位回写时还原出原始的文件形态 |  |
| plugins/dsh-extra-plan/lib/qqbot-settings-sync.js | joinText | L376-379 | 按记录的换行风格与结尾换行标记把行拼回文本，不改动任何行内容与顺序，保持结果幂等 |  |
| plugins/dsh-extra-plan/lib/qqbot-settings-sync.js | indentOf | L381-383 | 统计行首缩进的空格与制表符数量并返回数字，供层级比较使用，不做任何其它归一化处理 |  |
| plugins/dsh-extra-plan/lib/qqbot-settings-sync.js | ignorable | L385-388 | 判定行是否为空白行或注释行，缩进扫描时据此跳过，不去解析该行的键值语义与结构内容 |  |
| plugins/dsh-extra-plan/lib/qqbot-settings-sync.js | rootSequenceInfo | L390-408 | 定位根序列首项缩进与各顶层项起始行，传入非序列时返回空结果而不抛错，只做行级扫描 |  |
| plugins/dsh-extra-plan/lib/qqbot-settings-sync.js | keyMatch | L410-413 | 把单行匹配成缩进、键名与余下文本三部分，不匹配时返回 null 而不抛错，不做类型转换 |  |
| plugins/dsh-extra-plan/lib/qqbot-settings-sync.js | targetKind | L415-422 | 判定行是直接设置行还是 override 包装行，两种形态同时命中视为歧义，其余返回 null |  |
| plugins/dsh-extra-plan/lib/qqbot-settings-sync.js | configHolder | L424-426 | 按目标形态取出承载 config 的对象，override 形态返回包装层对象，不做任何拷贝 |  |
| plugins/dsh-extra-plan/lib/qqbot-settings-sync.js | locateConfigLine | L428-441 | 在块内定位 config 键所在行，重复或歧义时返回冲突标记而不猜测，找不到返回 null |  |
| plugins/dsh-extra-plan/lib/qqbot-settings-sync.js | blockEndForChild | L443-449 | 找出子块结束行，遇缩进不深于该键的行即截止，否则直接取块尾作为边界，绝不越过块尾 |  |
| plugins/dsh-extra-plan/lib/qqbot-settings-sync.js | directKeyLines | L451-458 | 收集块内指定缩进下同名直接键的全部命中行，供后续改写定位使用，不做去重也不做排序 |  |
| plugins/dsh-extra-plan/lib/qqbot-settings-sync.js | configChildIndent | L460-470 | 推断 config 子键缩进值，无子键时按父缩进加两空格兜底而不抛错，沿用既有风格 |  |
| plugins/dsh-extra-plan/lib/qqbot-settings-sync.js | scalar | L472-476 | 把布尔、数字与字符串渲染成 YAML 标量文本，字符串一律走 JSON 转义，不做猜测 |  |
| plugins/dsh-extra-plan/lib/qqbot-settings-sync.js | renderedConfig | L478-490 | 按设置定义渲染 config 行与嵌套词表行，键序固定不随机变化，便于比对与回读 |  |
| plugins/dsh-extra-plan/lib/qqbot-settings-sync.js | renderedRow | L493-502 | 渲染整条设置行文本，只用 id、name 与全量 config 三行头部，不写 override 包装键 |  |
| plugins/dsh-extra-plan/lib/qqbot-settings-sync.js | spaces | L494 | 生成指定数量的空格字符串，供各层级缩进拼接使用，不做截断、也不混入任何其它字符内容 |  |
| plugins/dsh-extra-plan/lib/qqbot-settings-sync.js | parsedTarget | L504-513 | 在解析结果里找出设置行，重复或多形态命中一律判为冲突而不挑选其中一行，歧义即拒绝 |  |
| plugins/dsh-extra-plan/lib/qqbot-settings-sync.js | configState | L515-532 | 判定设置行 config 是完整映射、缺失、非法还是边界不可证明四种情形之一，不做修复 |  |
| plugins/dsh-extra-plan/lib/qqbot-settings-sync.js | managedProjection | L534-538 | 只抽取行配置里的受管键组成投影对象，其它键一律忽略，既不比对也不写回，保持白名单 |  |
| plugins/dsh-extra-plan/lib/qqbot-settings-sync.js | equalManaged | L540-549 | 比较行配置与期望受管值是否深度相等，词表非法时直接返回 false 而不抛错也不告警 |  |
| plugins/dsh-extra-plan/lib/qqbot-settings-sync.js | reparseAndCheck | L551-560 | 回读文本重新解析并校验设置行 name 与受管值，任一处不符即返回原因，通过则返回解析结果 |  |
| plugins/dsh-extra-plan/lib/qqbot-settings-sync.js | existingNameState | L562-579 | 判定设置行 name 行是规范、缺失还是冲突，边界不可证时按冲突处理，缺失可原位补写 |  |
| plugins/dsh-extra-plan/lib/qqbot-settings-sync.js | applyExistingTarget | L581-697 | 对已存在的设置行原位改写或补键，改后回读全文校验，失败返回 invalid 状态与原因 |  |
| plugins/dsh-extra-plan/lib/qqbot-settings-sync.js | inlineCommentSuffix | L612-636 | 提取值行后的行内注释片段，按 YAML 引号与转义规则识别注释边界，缺失返回空串 |  |
| plugins/dsh-extra-plan/lib/qqbot-settings-sync.js | valueLine | L637-640 | 用原缩进与原行内注释重渲染单条键值行，保证已写注释不丢失，其余格式全部原样保留下来 |  |
| plugins/dsh-extra-plan/lib/qqbot-settings-sync.js | appendTarget | L699-711 | 在 patch 末尾追加整条设置行，空数组占位行会被直接替换，且不追加重复的设置行 |  |
| plugins/dsh-extra-plan/lib/qqbot-settings-sync.js | scalarTokenEquals | L713-716 | 比较标量 token 与期望值，兼容裸值、单引号与 JSON 三种写法，不做求值 |  |
| plugins/dsh-extra-plan/lib/qqbot-settings-sync.js | duplicateTargetNameText | L718-746 | 在解析失败的文本里探测设置行是否重复出现 name 键，命中即判冲突并返回布尔值 |  |
| plugins/dsh-extra-plan/lib/qqbot-settings-sync.js | planQqbotSettingsPatch | L749-774 | 纯文本规划补丁：校验快照并生成新 patch 文本，全程不做任何文件写入或改名动作 |  |
| plugins/dsh-extra-plan/lib/qqbot-settings-sync.js | writeExclusive | L776-784 | 以独占方式创建并写入文件后 fsync，句柄在 finally 中关闭，不覆盖已有文件 |  |
| plugins/dsh-extra-plan/lib/qqbot-settings-sync.js | nextFilePath | L786-792 | 循环生成不冲突的临时文件名，用时间戳、进程号与随机串拼装，直到确认该文件确实不存在 |  |
| plugins/dsh-extra-plan/lib/qqbot-settings-sync.js | hook | L794-796 | 若钩子对象存在同名函数则调用它并透传参数，钩子缺失或不是函数时一律静默跳过且不抛错 |  |
| plugins/dsh-extra-plan/lib/qqbot-settings-sync.js | writeQqbotSettingsPatch | L799-894 | 原子写入单个 qqbot 补丁：先写临时文件与备份再改名，任一校验失败即回滚并清理 |  |
| plugins/dsh-extra-plan/lib/qqbot-settings-sync.js | fingerprint | L896-898 | 拼装根、来源与快照的指纹串，供同步队列计算去重键使用，不参与任何落盘与校验逻辑处理 |  |
| plugins/dsh-extra-plan/lib/qqbot-settings-sync.js | resultForPath | L900-909 | 按路径解析结果组装返回对象，可选字段缺省时不出现在结果里，且不会改动任何入参对象 |  |
| plugins/dsh-extra-plan/lib/qqbot-settings-sync.js | webDocumentPath | L912-917 | 取 web profile 的补丁文件路径，文档路径非法时按 profiles 根拼出兜底路径 |  |
| plugins/dsh-extra-plan/lib/qqbot-settings-sync.js | createQqbotSettingsSynchronizer | L919-1090 | 创建串行同步器：入队去重、执行同步并暴露状态查询与结果订阅回调，返回冻结的实例对象 |  |
| plugins/dsh-extra-plan/lib/qqbot-settings-sync.js | emit | L925-930 | 更新当前同步状态并回调订阅者，订阅者抛错只吞掉、不影响写队列推进与状态值更新流程 |  |
| plugins/dsh-extra-plan/lib/qqbot-settings-sync.js | profileTerminal | L931-956 | 非 web profile 直接产出终态结果，补齐追踪字段后广播并返回，不进入写链 |  |
| plugins/dsh-extra-plan/lib/qqbot-settings-sync.js | execute | L957-1052 | 校验快照与路径后逐个 profile 写补丁，最后汇总漂移与失败终态并返回结果对象 |  |
| plugins/dsh-extra-plan/lib/qqbot-settings-sync.js | finish | L968-982 | 给结果补齐元数据与终态标记后广播，并返回同一份最终结果对象，不做任何二次加工计算 |  |
| plugins/dsh-extra-plan/lib/qqbot-settings-sync.js | enqueue | L1053-1084 | 把同步任务串进串行队列按序执行，键相同的在途请求复用同一 promise，不重复写 |  |
| plugins/dsh-extra-plan/lib/qqbot-settings-sync.js | getState | L1088 | 返回当前同步状态的浅拷贝对象，外部只能读取，也无法借此改写内部状态与队列信息字段 |  |
| plugins/dsh-extra-plan/lib/run-code-scanner.js | maskCodeLiteralsAndComments | L3-196 | 把代码里的字符串、模板、正则与注释按原长度抹成空格，保留行号与字符偏移对齐，不改变其它字符 |  |
| plugins/dsh-extra-plan/lib/run-code-scanner.js | isIdentifierStart | L12 | 判断单字符能否作为标识符首字符，仅接受 ASCII 字母、下划线、美元符，其余一律返回假 |  |
| plugins/dsh-extra-plan/lib/run-code-scanner.js | isIdentifierPart | L13 | 判断单字符能否作为标识符后续字符，在首字符集基础上额外接受十进制数字，其它字符返回假 |  |
| plugins/dsh-extra-plan/lib/run-code-scanner.js | blank | L14-18 | 把区间内字符抹为空格但跳过换行与回车，用于遮蔽字面量而不破坏原有行结构与行号对应 |  |
| plugins/dsh-extra-plan/lib/run-code-scanner.js | scanString | L19-30 | 从起始引号扫到配对收尾引号，正确处理反斜杠转义，未闭合或到文本末尾则返回文本长度 |  |
| plugins/dsh-extra-plan/lib/run-code-scanner.js | scanRegex | L31-51 | 扫描正则字面量：跳过字符类内的斜杠，遇换行即止，收尾一并吃掉后续修饰符字母与标志 |  |
| plugins/dsh-extra-plan/lib/run-code-scanner.js | scanTemplate | L52-68 | 扫描模板字符串：遇反引号收尾，遇美元花括号插值则递归扫描内部代码块，返回结束位置 |  |
| plugins/dsh-extra-plan/lib/run-code-scanner.js | scanCode | L69-193 | 主扫描循环：区分块与对象字面量、推断正则起点，遇字符串模板正则与注释即遮蔽后前进 |  |
| plugins/dsh-extra-plan/lib/run-code-scanner.js | sliceBalancedArgs | L202-218 | 自调用左括号配平圆括号、方括号与花括号取参数切片，返回闭括号位置与未遮蔽的参数字面原文 |  |
| plugins/dsh-extra-plan/lib/run-code-scanner.js | staticBracketKeyOf | L220-235 | 识别静态字符串下标中的合法键名，键非法或尾随非闭括号时返回空值，交给调用方按动态访问处理 |  |
| plugins/dsh-extra-plan/lib/run-code-scanner.js | skipStaticKeyTrivia | L237-256 | 跳过空白与块行注释定位下一个有效字符，注释未闭合时直接退到文本末尾，不抛错也不回退 |  |
| plugins/dsh-extra-plan/lib/run-code-scanner.js | hasDynamicRunCodeAccess | L260-297 | 判断代码里是否存在无法静态解析的工具下标访问，静态调用内的访问仍继续扫描不提前返回假 |  |
| plugins/dsh-extra-plan/lib/run-code-scanner.js | isIdentifierPart | L263 | 动态访问判定内的标识符续字符判定，用于排除粘连在工具名前的非空边界，与顶层同名函数职责不同 |  |
| plugins/dsh-extra-plan/lib/run-code-scanner.js | skipWhitespace | L264-268 | 动态访问判定内的局部空白跳过器，返回首个非空白字符下标，只用于定位不改动传入文本 |  |
| plugins/dsh-extra-plan/lib/run-code-scanner.js | bracketEndOf | L269-279 | 动态访问判定内自左方括号配平到配对右括号，未闭合时返回负一表示失配，由调用方判为动态 |  |
| plugins/dsh-extra-plan/lib/run-code-scanner.js | collectRunCodeSites | L299-359 | 收集全部工具取用调用点，输出调用起止、括号内参数原文与可静态解析的工具名，顺序按出现先后 |  |
| plugins/dsh-extra-plan/lib/run-code-scanner.js | isIdentifierStart | L303 | 调用点收集内的标识符首字符判定，用于点号后工具名的起始位置校验，不接受数字或符号开头 |  |
| plugins/dsh-extra-plan/lib/run-code-scanner.js | isIdentifierPart | L304 | 调用点收集内的标识符续字符判定，用于切出完整工具名并跳过其后的空白，遇到非标识符即止 |  |
| plugins/dsh-extra-plan/lib/run-code-scanner.js | skipWhitespace | L305-309 | 调用点收集内的空白跳过器，用于定位点号、括号等语法符号的相对位置，不跳过字符串内容 |  |
| plugins/dsh-extra-plan/lib/run-code-scanner.js | bracketEndOf | L310-320 | 调用点收集内自左方括号配平，供静态键识别与括号后是否紧跟调用的形态判断，未闭合返回负一 |  |
| plugins/dsh-extra-plan/lib/run-code-static.js | runCodeTextOf | L22-26 | 从执行参数里取 run_code 的 code 文本，非字符串一律返回空串而不抛错 |  |
| plugins/dsh-extra-plan/lib/run-code-static.js | codeMutationHints | L29-37 | 静态扫描 code 是否命中写模式黑名单，返回去重的 hint id 列表并保持黑名单顺序 |  |
| plugins/dsh-extra-plan/lib/run-code-static.js | parseStaticLiteral | L41-175 | 解析安全的静态字面量子集：先走 JSON 快路径再走无执行解析器，不合法返回失败标记 |  |
| plugins/dsh-extra-plan/lib/run-code-static.js | fail | L52 | 字面量解析失败时抛出固定的 not a static literal 错误，由外层统一收敛为解析失败结果 |  |
| plugins/dsh-extra-plan/lib/run-code-static.js | skipWhitespace | L53-55 | 解析器内的辅助闭包：把游标下标前移跳过空白字符，到源串末尾即停，不返回新下标也不报错 |  |
| plugins/dsh-extra-plan/lib/run-code-static.js | isIdentifierStart | L56 | 判断字符是否可作标识符首字符，仅字母、下划线或美元符为真，未定义字符一律判假，供解析用 |  |
| plugins/dsh-extra-plan/lib/run-code-static.js | isIdentifierChar | L57 | 判断字符是否可作标识符后续字符，字母数字下划线与美元符为真，未定义字符判假，用于边界判定 |  |
| plugins/dsh-extra-plan/lib/run-code-static.js | parseString | L59-99 | 解析单双引号字符串字面量并还原常见转义，遇换行、未闭合或非法转义立即抛出失败，不返回半成品 |  |
| plugins/dsh-extra-plan/lib/run-code-static.js | parseValue | L101-165 | 递归解析字面量值：对象、数组、字符串、布尔、空值与数字，并拦截原型污染键和重复键 |  |
| plugins/dsh-extra-plan/lib/run-code-static.js | createRunCodeStatic | L177-571 | 装配 run_code 静态预审闭包：拆解、容错闸门、问询返回闸门与上限判定共用一套纯函数 |  |
| plugins/dsh-extra-plan/lib/run-code-static.js | decomposeRunCode | L190-228 | 把 code 拆成去重的工具调用组成员并标记动态访问，动态或不可解析的调用不计入组 |  |
| plugins/dsh-extra-plan/lib/run-code-static.js | addMember | L197-206 | 按调用名称与参数序列化拼成去重键后追加成员，同名同参合并去重，同名不同参分别保留为两条 |  |
| plugins/dsh-extra-plan/lib/run-code-static.js | markRange | L207-209 | 在占用位图上把已识别调用点覆盖的字符区间逐位标记为已占用，供后续裸写扫描跳过这些文本 |  |
| plugins/dsh-extra-plan/lib/run-code-static.js | runCodeCatchGateReason | L234-305 | 多调用容错闸门：调用点达两个且未逐个独立 try/catch 时返回拒绝文案，单调用豁免 |  |
| plugins/dsh-extra-plan/lib/run-code-static.js | within | L261 | 判断调用点起始位置是否落在给定起止区间内，供 try 块内调用点归属与保护计数使用，含两端 |  |
| plugins/dsh-extra-plan/lib/run-code-static.js | askUserQuestionReturnGateReason | L309-504 | 问询结果返回闸门：静态无法证明结果返回到用户层时返回拒绝文案，能证明顶层返回则放行 |  |
| plugins/dsh-extra-plan/lib/run-code-static.js | isIdChar | L314 | 判断字符是否为标识符字符，字母数字下划线与美元符为真，用于词边界判定且不抛错，只读纯函数 |  |
| plugins/dsh-extra-plan/lib/run-code-static.js | skipWs | L315-319 | 从给定下标起跳过空白字符并返回新的下标，到串尾即停，供前缀匹配与表达式定位使用，不修改入参 |  |
| plugins/dsh-extra-plan/lib/run-code-static.js | isTopLevel | L404 | 判断该位置是否处于花括号、圆括号、方括号三种深度都为 0 的顶层语句位置，用于语句切分 |  |
| plugins/dsh-extra-plan/lib/run-code-static.js | candidateStarts | L405-412 | 收集调用点之前所有顶层语句的起始下标，供匹配 return 或赋值前缀时逐段尝试 |  |
| plugins/dsh-extra-plan/lib/run-code-static.js | tokenAt | L413-414 | 判断位置处是否为独立关键字，要求前后都属于标识符边界，避免命中更长标识符或属性名的一部分 |  |
| plugins/dsh-extra-plan/lib/run-code-static.js | expressionEnd | L415-424 | 取顶层表达式的结束下标：遇顶层分号或后接语句的换行即止，否则一直取到源串末尾，不解析语义 |  |
| plugins/dsh-extra-plan/lib/run-code-static.js | references | L425-440 | 判断表达式是否按标识符边界实际引用了该变量，属性名与对象键名不算引用，不抛错也不建语法树 |  |
| plugins/dsh-extra-plan/lib/run-code-static.js | hasReassignment | L441-458 | 判断表达式内是否对该变量重新赋值或自增自减，含前后置自增与复合赋值形态，不解析语义 |  |
| plugins/dsh-extra-plan/lib/run-code-static.js | afterCall | L459-469 | 取调用点之后的非空白下标与是否带分号的标记，供判定该调用是否独立成句，不修改原文本 |  |
| plugins/dsh-extra-plan/lib/run-code-static.js | runCodeSiteCount | L508-525 | 统计 code 内的工具调用点数：run_code 自身不计，参数可解析时递归展开其 code |  |
| plugins/dsh-extra-plan/lib/run-code-static.js | isRunCodeSubCall | L529-534 | 判定执行是否为子调用：带 sub 标记或有 parent 即为真，直呼与根调用为假 |  |
| plugins/dsh-extra-plan/lib/run-code-static.js | runCodeDispatchCapText | L537-539 | 生成子调用超上限的固定告警文案，含实例 ID、实际计数与额度上限三项，供运行时与纯函数共用 |  |
| plugins/dsh-extra-plan/lib/run-code-static.js | runCodeDispatchGateReason | L544-558 | 运行时单实例上限判定：统计同 rootCallId 的分发开始事件，超限才返回告警文案 |  |
| plugins/dsh-extra-plan/lib/runtime-lifecycle.js | createRuntimeLifecycle | L4-158 | 按 apply 建立运行时生命周期，集中工具注册、prober 认领与 run_code 拒绝记录，状态不跨实例共享。 |  |
| plugins/dsh-extra-plan/lib/runtime-lifecycle.js | registerTool | L12-41 | 按 agent 幂等注册工具，服务缺失或 schema 永久失败只记日志不抛错，重复注册保留既有工具。 |  |
| plugins/dsh-extra-plan/lib/runtime-lifecycle.js | saveBootstrapWhen | L54-62 | （待补充） |  |
| plugins/dsh-extra-plan/lib/runtime-lifecycle.js | registerSavePlan | L64 | 以 save_plan 名注册落盘工具，复用注册去重，失败只记日志不中断 apply。 |  |
| plugins/dsh-extra-plan/lib/runtime-lifecycle.js | registerSaveProbe | L65 | 以 save_probe 名注册探查工具，与落盘工具同走注册去重，重复调用直接跳过。 |  |
| plugins/dsh-extra-plan/lib/runtime-lifecycle.js | isProberRole | L71-84 | 按会话头的预设标识判定 prober 身份，字段缺失或读取异常一律返回 false 不抛错。 |  |
| plugins/dsh-extra-plan/lib/runtime-lifecycle.js | probeClaimFor | L86-103 | prober 认领判定：先看预设身份，再回退父会话配额与无写工具校验，命中即扣减一次。 |  |
| plugins/dsh-extra-plan/lib/runtime-lifecycle.js | recordProbeClaim | L105-107 | 为父会话累加待认领探查配额，配额留在 per-apply 映射，父实例写入子实例读不到。 |  |
| plugins/dsh-extra-plan/lib/runtime-lifecycle.js | noteRunCodeSubCall | L109-116 | 按 rootCallId 累计 run_code 子调用并返回 null，超上限或 id 为空直接返回超限文案。 |  |
| plugins/dsh-extra-plan/lib/runtime-lifecycle.js | recordRunCodeDeny | L118-129 | 记录 run_code 子调用的拒绝原因，非子调用、原因为空或缺会话 id 时静默跳过。 |  |
| plugins/dsh-extra-plan/lib/runtime-lifecycle.js | takeRunCodeDenyRecords | L131-139 | 取出并移除某 root 的拒绝原因集合，会话或 root 无记录时返回 undefined 不抛错。 |  |
| plugins/dsh-extra-plan/lib/runtime-lifecycle.js | disposeSession | L141-149 | 会话结束时清掉该会话的全部计数与记录映射，只清内存表，不触碰持久化数据与其它会话。 |  |
| plugins/dsh-extra-plan/lib/runtime-lifecycle.js | pendingProbeCount | L156 | 读取会话剩余待认领探查配额数，无记录时返回 0 而不是 undefined，也不抛错。 |  |
| plugins/dsh-extra-plan/lib/runtime-static.js | causeChainOf | L3-15 | 沿 cause 链最多取指定层数错误的 name、message 与 code，超长 message 截断，不抛错。 |  |
| plugins/dsh-extra-plan/lib/save-contract.js | sanitizeTaskName | L4-12 | 任务短名净化：仅保留字母、数字、下划线、连字符与中日韩文字，非字符串或空结果返回空串。 |  |
| plugins/dsh-extra-plan/lib/save-contract.js | timestampOf | L15-18 | 把 Date 格式化为本地秒级时间戳文本，仅供内部拼接，不做时区换算与同秒唯一承诺。 |  |
| plugins/dsh-extra-plan/lib/save-contract.js | pad | L16 | 时间戳拼接用的两位补零本地闭包，不导出、不校验入参，超出两位时按原值输出不做截断。 |  |
| plugins/dsh-extra-plan/lib/save-contract.js | timestamp | L20-22 | 返回当前本地时间戳文本（秒粒度），不承诺同秒唯一，唯一性交由工件 base 负责。 |  |
| plugins/dsh-extra-plan/lib/save-contract.js | sessionTagOf | L26-28 | 取会话 id 去掉分隔符后的前 8 位字母数字作标识段，id 非字符串时返回空串。 |  |
| plugins/dsh-extra-plan/lib/save-contract.js | saveArtifactBase | L34-49 | 工件 base 唯一真源：任务短名、会话段、毫秒时间、进程号与进程内序号拼接，同毫秒也不碰撞。 |  |
| plugins/dsh-extra-plan/lib/save-contract.js | summaryList | L56-58 | 把数组字段拼成顿号分隔文本，非数组或空数组返回空串，元素统一字符串化且不做转义。 |  |
| plugins/dsh-extra-plan/lib/save-contract.js | summaryBool | L60-62 | 只有严格等于 true 才输出「是」，其余含真值型字符串与数字一律输出「否」，不抛错。 |  |
| plugins/dsh-extra-plan/lib/save-contract.js | formatSavePlanSummary | L65-120 | 把保存摘要渲染成确定性派遣正文，逐任务、逐检查分行输出，不写本次生成的落盘路径。 |  |
| plugins/dsh-extra-plan/lib/save-contract.js | renderSavePlan | L127-130 | 把落盘路径列表包成 ContentBlock 文本块，缺失或非数组按空列表处理，绝不返回裸字符串。 |  |
| plugins/dsh-extra-plan/lib/save-contract.js | renderProbeMarkdown | L165-206 | 渲染探查线索或证据报告 Markdown，标题与卷首随 evidence 有无切换，第五节仅证据模式追加。 |  |
| plugins/dsh-extra-plan/lib/save-contract.js | trimProbeEvidenceDecor | L232-243 | 由外向内反复剥除成对的外层装饰符号，单侧装饰一律保留，避免误删路径文件名的首尾字符。 |  |
| plugins/dsh-extra-plan/lib/save-contract.js | extractProbeEvidenceRefs | L244-257 | 从【探查者已核实】标记里提取证据路径并按出现顺序去重，入参非字符串或为空返回空数组。 |  |
| plugins/dsh-extra-plan/lib/save-contract.js | renderSaveProbe | L261-263 | 把探查落盘路径包成 ContentBlock 文本块，标题按 hasEvidence 二参切换线索或证据语义。 |  |
| plugins/dsh-extra-plan/lib/save-persistence.js | fsOpsOf | L9-12 | 合并注入的 fs 操作与默认实现；入参非对象时直接返回冻结的默认操作集，供测试注入隔离。 |  |
| plugins/dsh-extra-plan/lib/save-persistence.js | errorText | L14-16 | 把任意异常转成可读文本：Error 取 message，其余走 String 转换，永不抛错。 |  |
| plugins/dsh-extra-plan/lib/save-persistence.js | errorCodeOf | L18-20 | 取对象错误码字符串，非对象或 code 非字符串返回空串，供诊断与分支判定使用。 |  |
| plugins/dsh-extra-plan/lib/save-persistence.js | policyOf | L22-24 | 把可选策略参数规整为对象，非对象入参返回空对象，避免调用方到处判空与取属性报错。 |  |
| plugins/dsh-extra-plan/lib/save-persistence.js | authorizeDirectory | L26-30 | 无路径上下文时返回 null；有则解析工作区目录并以任意类型准备写目标，越界即抛错。 |  |
| plugins/dsh-extra-plan/lib/save-persistence.js | authorizeFile | L32-36 | 无路径上下文时返回 null；有则准备文件写目标，允许目标不存在，越界或非法路径抛错。 |  |
| plugins/dsh-extra-plan/lib/save-persistence.js | cleanupCreated | L38-49 | 逐个授权并删除本次创建的文件，逐项收集失败为路径加原因文本，不中断整次清理流程。 |  |
| plugins/dsh-extra-plan/lib/save-persistence.js | commitError | L51-57 | 把失败阶段、原始错误与清理失败明细合成一个带 cause 的错误，用于上报提交失败。 |  |
| plugins/dsh-extra-plan/lib/save-persistence.js | atomicCommit | L62-112 | 单次提交：建目录、逐个写临时文件、逐个检查并顺序发布；失败只清理本次临时与已发布件。 |  |
| plugins/dsh-extra-plan/lib/save-plan-validation.js | newFileRecord | L53-55 | 解析期新建文件记录，保存路径、角色与操作和修改点容器，当前修改点初始为空以约束字段顺序。 |  |
| plugins/dsh-extra-plan/lib/save-plan-validation.js | newTask | L57-69 | 按任务编号与标题创建任务结构，一次性预置全部字段数组与空文件集合，供解析器逐行填充。 |  |
| plugins/dsh-extra-plan/lib/save-plan-validation.js | newClosure | L71-82 | 创建收尾块结构，携带收尾文件、收尾依赖与动作容器及空文件集合，并记录块首行行号。 |  |
| plugins/dsh-extra-plan/lib/save-plan-validation.js | newCheck | L85-91 | 创建检查块结构，预置验收组、取证方式、工作目录与覆盖标记，供验收侧校验与汇总复用。 |  |
| plugins/dsh-extra-plan/lib/save-plan-validation.js | newGlobal | L93-95 | 创建全局验收块结构，只含期望、禁止与正式验收引用容器，不带任务级文件与修改点字段。 |  |
| plugins/dsh-extra-plan/lib/save-plan-validation.js | makeDiagnostic | L97-106 | 组装一条诊断对象，空值统一转为空串，未指定修复模板时按字段名回退到默认模板文案。 |  |
| plugins/dsh-extra-plan/lib/save-plan-validation.js | defaultTemplate | L108-142 | 按字段名返回最小修复模板示例文本，遇到未知字段回退为通用填写提示，保证诊断可直接照抄。 |  |
| plugins/dsh-extra-plan/lib/save-plan-validation.js | normalizeText | L144-146 | 把输入文本统一成 LF 换行，非字符串一律归一为空串，避免跨平台换行符导致切分错行。 |  |
| plugins/dsh-extra-plan/lib/save-plan-validation.js | fieldOf | L148-153 | 按字段前缀表匹配行首标签，命中时返回键名、中文标签与去空白后的值，未命中返回 null。 |  |
| plugins/dsh-extra-plan/lib/save-plan-validation.js | isPlaceholderAnchor | L162-164 | 判断锚点是否只是整个文件、待定、占位等空泛占位词，命中即视为不可用伪锚点，不做原文比对。 |  |
| plugins/dsh-extra-plan/lib/save-plan-validation.js | isAcceptancePlaceholder | L166-169 | 先剥掉尾部标点，再判断验收定位是否只是同方案、同上或纯 M 编号这类占位写法，命中即视为占位。 |  |
| plugins/dsh-extra-plan/lib/save-plan-validation.js | parseLocation | L171-179 | 解析修改位置的行号区间写法，单点或起止区间都认，端点非安全正整数或倒序时返回 null 不抛错。 |  |
| plugins/dsh-extra-plan/lib/save-plan-validation.js | pointIdentity | L181-183 | 取修改点编号的文本值，修改点缺失或编号为空时返回空串，避免集合比较与正则校验抛错。 |  |
| plugins/dsh-extra-plan/lib/save-plan-validation.js | headingCandidate | L186-198 | 按正则识别任务、检查、收尾与全局验收标题，格式写错的候选标题单独归类，全不匹配返回 null。 |  |
| plugins/dsh-extra-plan/lib/save-plan-validation.js | pushEmptyFieldDiagnostic | L200-204 | 仅在字段值为空时生成结构字段不能为空的诊断，非空则返回 undefined 由调用方自行跳过。 |  |
| plugins/dsh-extra-plan/lib/save-plan-validation.js | parseTaskDocument | L206-450 | 逐行解析方案或验收正文：跳过围栏代码块，按阶段收敛结构块并收集字段与标题类诊断。 |  |
| plugins/dsh-extra-plan/lib/save-plan-validation.js | flush | L219-226 | 把当前结构块按类型归入任务、检查、收尾或全局列表并清空游标，遇到新标题前必先调用。 |  |
| plugins/dsh-extra-plan/lib/save-plan-validation.js | wrongHeading | L228-230 | 以空任务编号记录标题错位诊断，只携带文档名与原始行文本，不中断后续逐行解析流程。 |  |
| plugins/dsh-extra-plan/lib/save-plan-validation.js | pushField | L232-236 | 把字段值追加到所属结构块的同名数组，值为空时顺带压入一条空字段诊断后继续解析剩余行。 |  |
| plugins/dsh-extra-plan/lib/save-plan-validation.js | requireFile | L238-242 | 要求文件级字段紧跟主文件、关联文件或收尾文件之后，否则记诊断并返回 null 表示缺失。 |  |
| plugins/dsh-extra-plan/lib/save-plan-validation.js | requirePoint | L244-250 | 要求定位字段之前已声明对应修改点，缺失时报错并返回 null，避免字段挂到错误的层级。 |  |
| plugins/dsh-extra-plan/lib/save-plan-validation.js | validateIds | L452-463 | 校验任务或检查编号不重复、从 1 连续且按升序出现，每种违反情形各记一条编号诊断。 |  |
| plugins/dsh-extra-plan/lib/save-plan-validation.js | isMarkdownWrapped | L465-476 | 判断路径是否被反引号、括号、引号或加粗标记包裹，用于拒绝 Markdown 化的路径写法。 |  |
| plugins/dsh-extra-plan/lib/save-plan-validation.js | pathIssue | L478-491 | 校验工作区相对路径：空值、行号、盘符、绝对路径、反斜杠、点段与包裹写法各返回错误文案。 |  |
| plugins/dsh-extra-plan/lib/save-plan-validation.js | workdirIssue | L493-498 | 校验工作目录写法，单独放行点号表示当前目录，其余规则复用路径校验并返回问题文案。 |  |
| plugins/dsh-extra-plan/lib/save-plan-validation.js | platformIsCaseInsensitive | L500-504 | 判定路径比较是否忽略大小写，优先取调用方平台或显式开关，缺省时回退到当前进程平台。 |  |
| plugins/dsh-extra-plan/lib/save-plan-validation.js | pathKey | L506-509 | 把路径统一为正斜杠，大小写不敏感平台再转小写，作为文件集合去重与跨文档比对的键。 |  |
| plugins/dsh-extra-plan/lib/save-plan-validation.js | parseDependencies | L511-520 | 解析依赖字段，写无时得到空依赖列表，其余必须是 [任务N] 列表且不得重复引用同一任务。 |  |
| plugins/dsh-extra-plan/lib/save-plan-validation.js | parseResources | L522-530 | 解析独占资源为逗号分隔的稳定标识，允许写无，出现空项或重复项时返回问题文案而不抛错。 |  |
| plugins/dsh-extra-plan/lib/save-plan-validation.js | parseCheckRefs | L532-540 | 解析正式验收引用为 [检查N] 列表，空值、非法写法与重复检查编号均返回对应问题文案。 |  |
| plugins/dsh-extra-plan/lib/save-plan-validation.js | addPathDiagnostics | L542-547 | 逐条校验路径或工作目录并按需选用目录规则，把每个违反项压成带字段名的一条诊断后继续处理。 |  |
| plugins/dsh-extra-plan/lib/save-plan-validation.js | validatePathSet | L549-563 | 校验主文件与关联文件写法并检测同任务内重复，同时把原始集合与归一化键集写回任务对象。 |  |
| plugins/dsh-extra-plan/lib/save-plan-validation.js | validateResourceField | L565-573 | 限制独占资源为可选单值字段，重复声明或解析失败时记诊断，并回填解析出的资源标识列表。 |  |
| plugins/dsh-extra-plan/lib/save-plan-validation.js | validatePointIds | L575-583 | 校验同一文件内修改点编号形如 M 加非零正整数且互不重复，每种违规各记一条对应诊断。 |  |
| plugins/dsh-extra-plan/lib/save-plan-validation.js | validatePlanFileRecord | L585-630 | 校验单个方案文件记录：路径、文件操作唯一性、修改点数量及按操作类型分派的字段要求。 |  |
| plugins/dsh-extra-plan/lib/save-plan-validation.js | validatePlanFileRecords | L632-637 | 校验任务或收尾的文件记录数量与主文件、关联文件、收尾文件逐一对应，再逐个下钻校验。 |  |
| plugins/dsh-extra-plan/lib/save-plan-validation.js | validateAcceptanceFileRecord | L639-655 | 校验验收侧文件记录：操作唯一、对应修改点齐全，验收定位须是条件描述而非旧行号占位。 |  |
| plugins/dsh-extra-plan/lib/save-plan-validation.js | validateAcceptanceFileRecords | L656-661 | 校验验收文件记录数量与文件清单一一对应，缺记录或数量不符即记一条文件记录诊断，再逐项校验。 |  |
| plugins/dsh-extra-plan/lib/save-plan-validation.js | validateTaskShape | L663-700 | 校验任务外形：标题、主文件唯一、执行组与依赖理由成对，并按方案或验收分支追加各自要求。 |  |
| plugins/dsh-extra-plan/lib/save-plan-validation.js | graphCycles | L702-723 | 用三色标记做深度优先遍历求有向图环，按首次出现去重后返回成环节点序列，无环时得空数组。 |  |
| plugins/dsh-extra-plan/lib/save-plan-validation.js | visit | L707-720 | 图遍历的递归访问器，发现指向栈内节点的边即截取成环，回溯时把节点标记为已完成状态。 |  |
| plugins/dsh-extra-plan/lib/save-plan-validation.js | groupSort | L725-729 | 按执行组名去掉前缀后数值升序排序，数值相同时退化为字符串比较以保证输出顺序稳定。 |  |
| plugins/dsh-extra-plan/lib/save-plan-validation.js | firstTaskForGroup | L731-734 | 返回指定执行组内首个任务的编号，组内没有成员时返回 null 而不是抛出异常中断流程。 |  |
| plugins/dsh-extra-plan/lib/save-plan-validation.js | validatePlanRelations | L736-808 | 校验任务依赖存在性、自依赖与依赖环，并核对执行组环、文件独占、分组理由与资源归组。 |  |
| plugins/dsh-extra-plan/lib/save-plan-validation.js | fileRecordKey | L810-812 | 生成文件记录比对键：角色加归一化路径，使方案与验收能按同一键配对到同一个文件记录上。 |  |
| plugins/dsh-extra-plan/lib/save-plan-validation.js | pointIdSet | L814-816 | 收集某个文件下全部修改点编号组成集合，供方案与验收的修改点集合精确比对，缺失记为内置空串。 |  |
| plugins/dsh-extra-plan/lib/save-plan-validation.js | equalStringSets | L818-822 | 比较两个字符串集合是否完全相等，元素数量不同直接返回 false，不会抛出错误。 |  |
| plugins/dsh-extra-plan/lib/save-plan-validation.js | validateFileRecordMapping | L824-846 | 按记录键配对方案与验收的同名文件，比对文件操作与修改点编号集合并报出缺失的一侧。 |  |
| plugins/dsh-extra-plan/lib/save-plan-validation.js | validateCrossDocument | L848-872 | 跨文档校验任务编号、主文件、文件集合与收尾是否成对一致，并逐任务下钻文件记录映射。 |  |
| plugins/dsh-extra-plan/lib/save-plan-validation.js | validateClosure | L874-924 | 校验收尾块：收尾文件不重复、依赖恰好覆盖全部任务且不与任务文件重叠，验收侧另查期望禁止。 |  |
| plugins/dsh-extra-plan/lib/save-plan-validation.js | validateGlobal | L926-936 | 校验全局验收的期望与禁止非空、正式验收引用唯一，并把解析结果回填到检查引用列表。 |  |
| plugins/dsh-extra-plan/lib/save-plan-validation.js | validateChecks | L938-995 | 校验检查定义的编号、验收组、取证方式、工作目录与证据，并统计覆盖后清出孤儿检查。 |  |
| plugins/dsh-extra-plan/lib/save-plan-validation.js | attachRefs | L973-986 | 把任务、收尾或全局的正式验收引用回挂到检查的覆盖统计，引用不存在时报诊断并跳过该条。 |  |
| plugins/dsh-extra-plan/lib/save-plan-validation.js | sortIds | L997-999 | 对编号数组先去重再按数值升序排序，返回新数组且不改动入参的原始顺序与长度，空数组原样返回。 |  |
| plugins/dsh-extra-plan/lib/save-plan-validation.js | buildInternalOrder | L1001-1025 | 按任务依赖在组内做拓扑排序，成环导致排序不完整时回退为编号升序输出以保持稳定顺序。 |  |
| plugins/dsh-extra-plan/lib/save-plan-validation.js | reviewGroupSort | L1027-1031 | 按验收组名去掉前缀后数值升序排序，数值相同时退化为字符串比较以保持分组输出结果稳定。 |  |
| plugins/dsh-extra-plan/lib/save-plan-validation.js | summarizeFileRecord | L1033-1054 | 把文件记录压成摘要：操作、修改点、锚点、动作与生成验收字段，缺项统一用空串占位。 |  |
| plugins/dsh-extra-plan/lib/save-plan-validation.js | buildSummary | L1056-1178 | 汇总方案与验收为交付摘要：任务、执行组、检查、覆盖关系与文件计数，供保存结果回显。 |  |
| plugins/dsh-extra-plan/lib/save-plan-validation.js | formatDiagnostic | L1180-1185 | 把单条诊断格式化为含文档名、任务号、字段值、原因与最小修复模板的一行可读文本，超长值截断。 |  |
| plugins/dsh-extra-plan/lib/save-plan-validation.js | finalizeFailure | L1187-1193 | 把诊断整理成失败结果，只保留前 20 条并统计省略条数，同时给出含总数与省略提示的错误文本。 |  |
| plugins/dsh-extra-plan/lib/save-plan-validation.js | validateSavePlanContract | L1195-1228 | 对外校验入口，兼容单参数调用形态，解析方案与验收后串行执行全部结构与跨文档校验。 |  |
| plugins/dsh-extra-plan/lib/save-probe-validation.js | errorCodeOf | L6-8 | 取对象错误码字符串，非对象或 code 非字符串返回空串，用于区分目标缺失与不可读。 |  |
| plugins/dsh-extra-plan/lib/save-probe-validation.js | contextOf | L10-14 | 优先用传入的路径上下文，否则以当前目录建工作区上下文；两者都缺时返回 null 不抛错。 |  |
| plugins/dsh-extra-plan/lib/save-probe-validation.js | resolveAbsoluteProbeTarget | L16-41 | 绝对探查路径先试工作区根，再试宿主根与已注册能力，全部失败才抛错，不试探其它根。 |  |
| plugins/dsh-extra-plan/lib/save-probe-validation.js | resolveProbeTarget | L43-49 | 解析探查目标：缺上下文或非字符串即抛错，相对路径按工作区解析，绝对路径走多根匹配。 |  |
| plugins/dsh-extra-plan/lib/save-probe-validation.js | pathViolation | L51-65 | 把探查路径解析与读校验的失败归为未授权、不存在或不可读三类文本，成功返回 null。 |  |
| plugins/dsh-extra-plan/lib/save-probe-validation.js | validateProbe | L67-168 | 先校验四字段结构、条目、长度、总量与 range，再校验各路径可读；超限一律拒绝、不静默截断。 |  |
| plugins/dsh-extra-plan/lib/save-probe-validation.js | probePathOf | L171-175 | 兼容旧调用：无上下文只做词法拼接返回路径，有上下文则走受控解析并校验授权与归属。 |  |
| plugins/dsh-extra-plan/lib/save-tool-factories.js | probeRefDecorationHint | L15-17 | 证据引用疑似含 Markdown 装饰时的附加提示，裸路径引用返回空串不阻断校验 |  |
| plugins/dsh-extra-plan/lib/save-tool-factories.js | cwdOf | L20-24 | 只读会话头部的 cwd 字符串，缺失或非字符串一律返回空串，不计算目录、短名与工件基准 |  |
| plugins/dsh-extra-plan/lib/save-tool-factories.js | errorCodeOf | L26-28 | 提取错误对象上的字符串 code，非对象或无 code 一律返回空串，供调用方做分支判断 |  |
| plugins/dsh-extra-plan/lib/save-tool-factories.js | pathContextOf | L30-36 | 优先使用外部注入的路径上下文工厂，未提供或返回空时按会话 cwd 新建工作区上下文 |  |
| plugins/dsh-extra-plan/lib/save-tool-factories.js | resolveSaveContext | L39-51 | 为两个保存工具统一构造会话标识、产出目录与工件基准名，任一步失败只影响本次调用不重试 |  |
| plugins/dsh-extra-plan/lib/save-tool-factories.js | sourceCacheKey | L55-58 | 源文件缓存键归一：反斜杠转正斜杠，Windows 下再转小写，避免同一文件大小写重复读取 |  |
| plugins/dsh-extra-plan/lib/save-tool-factories.js | resolveMissingWorkspaceIdentity | L60-75 | 目标缺失时逐级上溯已存在的父目录，拼出规范化的身份路径供存在性判定，不创建任何文件 |  |
| plugins/dsh-extra-plan/lib/save-tool-factories.js | resolveWorkspaceEntry | L77-101 | 解析并缓存工作区文件条目，目标缺失时仍返回存在标记为假的身份条目，由调用方决定是否抛错 |  |
| plugins/dsh-extra-plan/lib/save-tool-factories.js | strictTextEntry | L103-115 | 把缓存字节严格解码为文本：拒非法 UTF-8 与 NUL，去 BOM 并归一换行后切行 |  |
| plugins/dsh-extra-plan/lib/save-tool-factories.js | literalCount | L117-126 | 统计单行内锚点原文出现次数，匹配后按针长度推进游标，空串按长度一下限推进以防死循环 |  |
| plugins/dsh-extra-plan/lib/save-tool-factories.js | verifyModificationPoint | L128-145 | 校验修改点行号区间与定位锚点：锚点须在区间内恰好命中一次，越界或多次命中均抛出错误 |  |
| plugins/dsh-extra-plan/lib/save-tool-factories.js | verifyPlanSources | L147-181 | 逐个文件记录校验存在性与操作合法性，并拦下多个记录指向同一真实目标，返回共享读缓存 |  |
| plugins/dsh-extra-plan/lib/save-tool-factories.js | verifyFile | L150-177 | 单文件记录校验分支：新建要求目标不存在，修改则严格解码文本并逐点校验锚点，删除只查存在 |  |
| plugins/dsh-extra-plan/lib/save-tool-factories.js | verifyProbeEvidenceRef | L183-202 | 校验探查证据引用真实可读且自带证据报告标题，缺失或非探查者落盘时抛出带装饰提示的错误 |  |
| plugins/dsh-extra-plan/lib/save-tool-factories.js | createSaveToolFactories | L205-389 | 按显式目录与持久化依赖构造两个保存工具定义，不持有宿主会话状态，失败只抛错不落盘 |  |
| plugins/dsh-extra-plan/lib/save-tool-factories.js | defineSavePlan | L206-272 | 组装保存方案工具定义：参数合同、路径数组输出渲染与严格落盘执行体，成功只回传文件路径 |  |
| plugins/dsh-extra-plan/lib/save-tool-factories.js | render | L227-229 | 方案工具结果渲染：把落盘路径数组交给方案渲染器输出可读文本，不改动结果值与调用参数 |  |
| plugins/dsh-extra-plan/lib/save-tool-factories.js | execute | L232-270 | 方案工具执行体：校验参数与合同、核实源文件与证据后原子双写，成功只回传两个落盘路径 |  |
| plugins/dsh-extra-plan/lib/save-tool-factories.js | defineSaveProbe | L274-386 | 组装保存探查工具定义：线索与证据数组参数、路径输出渲染与落盘执行体，不执行用户命令 |  |
| plugins/dsh-extra-plan/lib/save-tool-factories.js | render | L362-364 | 探查工具结果渲染：按是否带证据选择证据报告或线索形态，只影响正文不影响文件名前缀 |  |
| plugins/dsh-extra-plan/lib/save-tool-factories.js | execute | L367-384 | 探查工具执行体：先校验参数与路径再落盘线索文件，避免非法调用消耗工件基准序号与目录 |  |
| plugins/dsh-extra-plan/lib/sdk-text-cache.js | isWeakKey | L7-9 | 判定值能否作为 WeakMap 键：非空对象或函数为真，原始值与 null 一律为假。 |  |
| plugins/dsh-extra-plan/lib/sdk-text-cache.js | numberTag | L11-17 | 为数值生成稳定标签，区分 NaN、正负无穷与负零，避免指纹把不同数值混成同一份。 |  |
| plugins/dsh-extra-plan/lib/sdk-text-cache.js | isArrayIndexKey | L19-23 | 判定字符串是否为合法数组下标键：非负整数、小于 4294967295 且字符串形式与原值一致。 |  |
| plugins/dsh-extra-plan/lib/sdk-text-cache.js | encode | L27-89 | 把渲染输入编码成保序签名片段；遇 getter、symbol、循环引用或非普通对象一律放弃签名。 |  |
| plugins/dsh-extra-plan/lib/sdk-text-cache.js | sdkSchemasFingerprint | L91-99 | 对 schema 生成保守指纹字符串，编码失败或抛错时返回 undefined，调用方据此走无缓存路径。 |  |
| plugins/dsh-extra-plan/lib/sdk-text-cache.js | sdkTextCacheEntryMatches | L101-107 | 判断缓存条目是否命中：指纹、language 与 renderer 三者全等才算命中，条目缺失即未命中。 |  |
| plugins/dsh-extra-plan/lib/sdk-text-cache.js | renderUncached | L109-119 | 渲染但不写缓存：渲染函数不是函数或返回非字符串时抛类型错误，供无法缓存时直接回退。 |  |
| plugins/dsh-extra-plan/lib/sdk-text-cache.js | createSdkTextCache | L121-161 | 创建 apply 级按 agent 分键的内存缓存，只暴露读取与释放方法，不持有会话标识或装配对象。 |  |
| plugins/dsh-extra-plan/lib/sdk-text-cache.js | dispose | L124-126 | 释放指定 agent 的缓存条目：仅在键可入 WeakMap 时删除，非法键静默忽略不报错。 |  |
| plugins/dsh-extra-plan/lib/sdk-text-cache.js | getOrCreate | L128-158 | 同指纹、同语言、同渲染函数的条目返回缓存 Promise，否则合并并发渲染，失败即删除条目不回写。 |  |
| plugins/dsh-extra-plan/lib/settings-contract.js | isString | L5 | 设置标量校验：仅原始字符串判真，其余类型含 String 包装对象一律返回 false。 |  |
| plugins/dsh-extra-plan/lib/settings-contract.js | isPositiveInteger | L6 | 设置标量校验：仅大于零的整数判真，小数、NaN、字符串与布尔值一律判否，不抛错。 |  |
| plugins/dsh-extra-plan/lib/settings-contract.js | isBoolean | L7 | 设置标量校验：仅布尔原始值判真，字符串 true 与 0/1 之类的近似值一律判否。 |  |
| plugins/dsh-extra-plan/lib/settings-contract.js | isMode | L11 | 呈现模式校验：仅 native 与 ptc 两个冻结选项判真，其余字符串含大小写变体一律判否。 |  |
| plugins/dsh-extra-plan/lib/settings-contract.js | setting | L43-73 | 冻结单条设置 descriptor：补齐 type 并复制各定位器，别名与 UI 选项一并深冻结。 |  |
| plugins/dsh-extra-plan/lib/settings-contract.js | settingsRowLocator | L79-83 | 权威值落点定位：settings 行 id 加规范行名双条件，缺省路径为 config 下的键名。 |  |
| plugins/dsh-extra-plan/lib/settings-contract.js | sourceLocator | L84 | 旧源模板行定位器：extra-plan 行 config 下按键取值，仅供旧值读取兼容。 |  |
| plugins/dsh-extra-plan/lib/settings-contract.js | hostRowProjectionLocator | L86-89 | 旧公开投影行的读取落点：预设同步行的 config 下按键取值，新结构不再写该行。 |  |
| plugins/dsh-extra-plan/lib/settings-contract.js | legacyHostRowProjectionLocator | L91-96 | 旧声明行投影定位器，仅 webFetch 可用；误传呈现模式键会得到 undefined 路径而永不命中。 |  |
| plugins/dsh-extra-plan/lib/settings-contract.js | createDefaultSettings | L181-183 | 按 descriptor 键集合从生成常量取默认值，键序与定义表一致，不读运行期配置。 |  |
| plugins/dsh-extra-plan/lib/settings-contract.js | getSettingDefinition | L199-201 | 按键查设置 descriptor，未注册的键返回 undefined，不做默认值兜底。 |  |
| plugins/dsh-extra-plan/lib/settings-contract.js | validateSettingValue | L203-205 | 用 descriptor 校验器判定设置入参，descriptor 缺失或校验器非函数时返回 false，不抛错。 |  |
| plugins/dsh-extra-plan/lib/settings-contract.js | normalizeSettingValue | L207-209 | 有 normalize 就调用它归一，否则原值返回，不做类型转换、校验与默认值兜底。 |  |
| plugins/dsh-extra-plan/lib/settings.js | safeContextGet | L32-34 | 安全读取上下文服务，取值抛错或 ctx 未提供 get 方法时返回 undefined，不向外抛异常。 |  |
| plugins/dsh-extra-plan/lib/settings.js | absoluteRoot | L40-47 | 把配置里的根目录规范成绝对根路径，非字符串或空值返回 null，创建上下文失败也返回 null。 |  |
| plugins/dsh-extra-plan/lib/settings.js | rootFact | L49-53 | 把根目录值归类为缺失、非法或有效三种事实，未标记为存在时直接判缺失而不再看原值。 |  |
| plugins/dsh-extra-plan/lib/settings.js | sameRoot | L55-60 | 比较两个绝对根是否指向同一目录，任一为空返回 false，Windows 下按小写路径忽略大小写。 |  |
| plugins/dsh-extra-plan/lib/settings.js | documentFact | L62-66 | 把配置文档路径归类为缺失、非法或有效三种事实，空值与未标记存在一律按缺失处理，不做路径解析。 |  |
| plugins/dsh-extra-plan/lib/settings.js | profileIdentityOf | L68-85 | 按 profile 名与已启动 bundle 判定 web 或 qqbot 身份，读取异常返回 unknown 不抛错。 |  |
| plugins/dsh-extra-plan/lib/settings.js | profileFactsOf | L87-89 | 从上下文取 profileContext 委托身份识别，上下文缺失时降级为空 profile 的 unknown 事实。 |  |
| plugins/dsh-extra-plan/lib/settings.js | configEditorServiceOf | L91-94 | 取配置编辑器服务并核验具备 configuration 与 edit 方法，形状不符时返回 null 由调用方降级。 |  |
| plugins/dsh-extra-plan/lib/settings.js | settingsPathContext | L96-151 | 汇总 profile 根、配置文档与 DSH_HOME 事实构造路径上下文，无可信根或创建失败时返回 null。 |  |
| plugins/dsh-extra-plan/lib/settings.js | has | L98 | 判断 profile 对象是否自有指定键，profile 缺失或键来自原型链时一律返回 false。 |  |
| plugins/dsh-extra-plan/lib/settings.js | exactDocumentCapabilities | L153-163 | 筛出与配置文档同根且用途为 config-editor 的文件能力，按 profilePatch 优先排序返回。 |  |
| plugins/dsh-extra-plan/lib/settings.js | rank | L160 | 为文件能力排序赋秩：profilePatch 最优先、editorDocument 次之，其余能力统一排在最后。 |  |
| plugins/dsh-extra-plan/lib/settings.js | authorizedDocumentRead | L165-181 | 授权后解析配置文档的只读目标，事实非法、矛盾或路径不符时抛错，缺参返回 null。 |  |
| plugins/dsh-extra-plan/lib/settings.js | mountClientCarrier | L189-219 | 按 loader 共享挂载客户端载体并按引用计数复用，返回释放函数且重复释放只生效一次。 |  |
| plugins/dsh-extra-plan/lib/settings.js | schemaField | L222-228 | 把设置描述符转成 schemastery 字段，区分布尔、整数与字符串三类并带上默认值与 volatile。 |  |
| plugins/dsh-extra-plan/lib/settings.js | isLoopback | L237-240 | 判断请求来源是否本机回环地址，仅认 IPv4、IPv6 回环与 IPv4 映射这三种写法。 |  |
| plugins/dsh-extra-plan/lib/settings.js | json | L242-245 | 以 JSON 内容类型与禁止缓存头写回响应体和状态码，响应体由调用方给定不做加工。 |  |
| plugins/dsh-extra-plan/lib/settings.js | readJsonBody | L247-265 | 读取请求体并解析 JSON，超过一兆即中断，解析失败按非法 JSON 报错拒绝。 |  |
| plugins/dsh-extra-plan/lib/settings.js | plainJsonObject | L267-269 | 判断值是否为非数组的普通 JSON 对象，数组、null 与其它标量一律返回 false。 |  |
| plugins/dsh-extra-plan/lib/settings.js | activeSettingsRows | L275-280 | 取编辑器配置行并只保留启用且 id 命中设置行 ID 的记录，取不到配置时返回空数组。 |  |
| plugins/dsh-extra-plan/lib/settings.js | rowConfigOf | L282-288 | 按继承、自身与覆盖这三层合并出一行配置，任一层非对象按空层跳过，缺省返回空对象。 |  |
| plugins/dsh-extra-plan/lib/settings.js | completeConfig | L290-300 | 把候选配置校验并归一为十一项取值加闸门词，缺键、类型不符或词表非法返回 undefined。 |  |
| plugins/dsh-extra-plan/lib/settings.js | rowSummary | L302-314 | 把配置行压成路径、id、名称与完整配置的摘要，完整度按校验结果给出布尔值不抛错。 |  |
| plugins/dsh-extra-plan/lib/settings.js | rawPatchInfo | L316-325 | 读取配置文档原文并给出诊断，路径缺失或读取失败时文本为 undefined 而不是抛错。 |  |
| plugins/dsh-extra-plan/lib/settings.js | inspectSettingsAuthority | L328-369 | 机械核对生效行与文档原始行的唯一性，产出状态、计数、诊断与选中的配置供上层判定。 |  |
| plugins/dsh-extra-plan/lib/settings.js | findSettingsRow | L371-374 | 返回唯一一条生效的设置行，行数为零或不止一条时返回 undefined 表示无权威行。 |  |
| plugins/dsh-extra-plan/lib/settings.js | readRawPatch | L376-378 | 取配置文档原文文本，读不到时返回 undefined 而不抛错，诊断交由调用方另行获取。 |  |
| plugins/dsh-extra-plan/lib/settings.js | stableSnapshot | L381-398 | 把快照校验归一为固定十一项取值与闸门词并算出稳定哈希，结构或取值非法时直接抛错。 |  |
| plugins/dsh-extra-plan/lib/settings.js | readUnifiedState | L403-439 | 输出只读统一状态：冲突时只给诊断不回落旧行，正常时按行值与补丁解析出生效值与来源。 |  |
| plugins/dsh-extra-plan/lib/settings.js | publicField | L441-455 | 把设置定义与取值投影为前端字段，带控件、语言与覆盖来源，缺省来源记为 default。 |  |
| plugins/dsh-extra-plan/lib/settings.js | profileSyncPath | L457-467 | 推导同步结果的目标路径，优先条目自身路径再退回 profile 根，都缺失时给占位串。 |  |
| plugins/dsh-extra-plan/lib/settings.js | reportProfileSync | L469-481 | 把同步失败、不可用或冲突状态打成一条告警日志，其余状态直接返回而不输出任何日志。 |  |
| plugins/dsh-extra-plan/lib/settings.js | cacheProfileSync | L483-486 | 把同步结果包装成终端缓存视图，结果缺失时给出待定占位，并标出缓存来源与匹配标记。 |  |
| plugins/dsh-extra-plan/lib/settings.js | cacheProfileSyncWithStale | L489-508 | 缓存视图之外再比对磁盘补丁哈希值，不一致时标记过期并告警，读取异常静默回退缓存。 |  |
| plugins/dsh-extra-plan/lib/settings.js | requestProfileSync | L510-514 | 用请求里的运行号、修订号与快照哈希等字段组装请求结果视图，三者全等才标记终端匹配。 |  |
| plugins/dsh-extra-plan/lib/settings.js | proPayload | L516-534 | 组装设置页返回体：冲突时字段表为空，正常时把投影字段、默认值与同步视图一并输出。 |  |
| plugins/dsh-extra-plan/lib/settings.js | conflictProfileSync | L536-546 | 构造设置行冲突的同步视图，带上冲突原因与行事实，状态固定标为 conflict。 |  |
| plugins/dsh-extra-plan/lib/settings.js | createApiHandler | L548-629 | 生成设置接口处理器：仅本机回环可访问，GET 取状态、PUT 校验收敛后改行并触发同步。 |  |
| plugins/dsh-extra-plan/lib/settings.js | responseForProfile | L549-562 | 按同步状态推导响应状态码与总体结论，未匹配的请求一律判为冲突并以 409 返回。 |  |
| plugins/dsh-extra-plan/lib/settings.js | startupArchiveForApply | L631-643 | 启动时尝试归档用量记录，缺少宿主根目录则跳过，归档整体异常只告警而不阻断插件启动。 |  |
| plugins/dsh-extra-plan/lib/settings.js | apply | L645-756 | 插件入口：启动归档、挂载客户端载体、设置接口与预设同步，并注入设置策略与生命周期。 |  |
| plugins/dsh-extra-plan/lib/settings.js | onResult | L652 | 同步器结果回调，先把结果置为非待定状态再写入终态缓存，并输出一条同步状态日志留痕。 |  |
| plugins/dsh-extra-plan/lib/settings.js | editorOf | L654-661 | 取配置编辑器服务并做空值兜底，服务缺失或取值抛错时回退为调用方传入的备用编辑器。 |  |
| plugins/dsh-extra-plan/lib/settings.js | documentPathOf | L662-670 | 取编辑器同步文档路径再退回文档路径，取值异常或非字符串时返回 undefined 不抛错。 |  |
| plugins/dsh-extra-plan/lib/settings.js | environmentSnapshot | L671 | 采集 DSH_HOME 与 DSH_PROFILE 两个环境变量作为同步环境快照，缺项记为 undefined。 |  |
| plugins/dsh-extra-plan/lib/settings.js | conflictResult | L672-686 | 生成设置行冲突的同步结果并写入终态缓存，同时把请求字段与冲突原因一并原样带回结果。 |  |
| plugins/dsh-extra-plan/lib/settings.js | syncEditor | L687-729 | 在给定编辑器上校验权威行、生成稳定快照并入队同步，任一步异常即转失败结果不抛出。 |  |
| plugins/dsh-extra-plan/lib/settings.js | settledSettings | L730-734 | 设置落定回调，按首次或后续落定选择触发标签交给同步，并累计落定次数以便区分来源。 |  |
| plugins/dsh-extra-plan/lib/settings.js | settledError | L735-747 | 设置落定回调发生异常时构造失败结果并写入终态缓存，只输出告警而不向调用方抛出错误。 |  |
| plugins/dsh-extra-plan/lib/shell-mutation.js | commandTextOf | L39-51 | 从执行参数里取命令文本：兼容 JSON 字符串与对象两种形态，缺失或非法返回空串 |  |
| plugins/dsh-extra-plan/lib/shell-mutation.js | pwshCommandOf | L53 | PowerShell 侧的命令取文本入口，直接复用通用取文本逻辑，不额外解析也不做参数校验 |  |
| plugins/dsh-extra-plan/lib/shell-mutation.js | bashCommandOf | L54 | bash 侧的命令取文本入口，与 PowerShell 侧共用同一取文本实现不另设规则 |  |
| plugins/dsh-extra-plan/lib/shell-mutation.js | shellWords | L59-86 | 把单段命令切成词元，记录是否被引号包裹并处理反引号转义，供命令位状态机判定裸写动词 |  |
| plugins/dsh-extra-plan/lib/shell-mutation.js | splitShellSegments | L88-114 | 按分号、换行与与或管道把命令切段，引号内分隔符不切段，仅做切分不改变每段的原词序 |  |
| plugins/dsh-extra-plan/lib/shell-mutation.js | shellParenEnd | L116-135 | 自左圆括号配平到配对右括号，跳过引号与转义，未闭合时返回文本末尾交由调用方自行兜底 |  |
| plugins/dsh-extra-plan/lib/shell-mutation.js | executableShellSubexpressions | L137-162 | 提取可执行的美元括号与数组子表达式内层文本，双引号内与反引号转义按可执行内容处理 |  |
| plugins/dsh-extra-plan/lib/shell-mutation.js | shellSyntaxText | L164-179 | 生成只留语法符号的镜像文本，引号内容与转义一律抹为空格，供语法级写形态正则做匹配 |  |
| plugins/dsh-extra-plan/lib/shell-mutation.js | isInnerShellWord | L183-186 | 判断词元是否为内层 shell 命令名，含 cmd.exe 路径形态，比较前统一转小写 |  |
| plugins/dsh-extra-plan/lib/shell-mutation.js | isEnvAssignment | L187-189 | 判断词元是否为环境变量赋值前缀，形如标识符紧跟等号的裸赋值开头，参数位不参与判定 |  |
| plugins/dsh-extra-plan/lib/shell-mutation.js | redirectEvidence | L197-214 | 裸写重定向判定：引号内、箭头左邻与右侧流合并豁免，其余判 PWSH_MUTATION。 |  |
| plugins/dsh-extra-plan/lib/shell-mutation.js | syntaxRuleOf | L221-225 | 把语法级写形态正则映射回规则标识，非已知正则返回空而不臆造规则名，供拒绝文案取用 |  |
| plugins/dsh-extra-plan/lib/shell-mutation.js | bareRuleOf | L227-231 | 把裸写动词正则映射回规则标识，未知正则返回空值，以免产出无主证据与错误的拒绝文案 |  |
| plugins/dsh-extra-plan/lib/shell-mutation.js | mutationTextEvidence | L233-414 | 命令位状态机：切段后逐词判定裸写动词，递归子表达式与内层 shell，只产出命中证据 |  |
| plugins/dsh-extra-plan/lib/shell-mutation.js | nestedEvidenceOf | L244-256 | 对子表达式内层依次跑当前平台、PowerShell 与 bash 三套规则，返回首个命中证据 |  |
| plugins/dsh-extra-plan/lib/shell-mutation.js | mutationTextMatches | L416-418 | 把文本判定收敛为布尔结果，只关心是否命中写形态，丢弃具体规则与命中词元不做留证处理 |  |
| plugins/dsh-extra-plan/lib/shell-mutation.js | mutationEvidence | L420-423 | 按传入的取文本函数取命令后再判定，空命令直接返回空值，不进入命令位状态机也不报错 |  |
| plugins/dsh-extra-plan/lib/shell-mutation.js | pwshMutationEvidence | L425 | PowerShell 入参的写判定，命中产出规则与词元组成的拒绝证据，本身不执行任何命令 |  |
| plugins/dsh-extra-plan/lib/shell-mutation.js | bashMutationEvidence | L426 | bash 入参的写判定，命中产出拒绝证据对象，仅用于拦截与留证而不落实任何执行动作 |  |
| plugins/dsh-extra-plan/lib/shell-mutation.js | pwshMutationMatches | L427 | PowerShell 侧的布尔写判定包装，等价于证据非空判定，不给调用方额外产出拒绝文案 |  |
| plugins/dsh-extra-plan/lib/shell-mutation.js | bashMutationMatches | L428 | bash 侧的布尔写判定包装，供只关心是否拦截的调用方使用，不改变底层证据判定语义 |  |
| plugins/dsh-extra-plan/lib/usage-ledger.js | isSchemaDocRow | L101-103 | 说明行判定：kind=「账本说明」且说明/键均为字符串，三字段全形才算，避免把垃圾行当说明行吞掉。 |  |
| plugins/dsh-extra-plan/lib/usage-ledger.js | errorCodeOf | L114-116 | 提取文件操作错误码供锁诊断与回滚分支使用。 |  |
| plugins/dsh-extra-plan/lib/usage-ledger.js | errorMessageOf | L118-120 | 将未知错误安全转换为诊断文本。 |  |
| plugins/dsh-extra-plan/lib/usage-ledger.js | archiveError | L122-126 | 构造带 code 字段的 Error（new Error(message) 后挂 code），归档/统计失败统一经它抛错 |  |
| plugins/dsh-extra-plan/lib/usage-ledger.js | isPlainObject | L128-130 | 判入参是非 null 对象且非数组 |  |
| plugins/dsh-extra-plan/lib/usage-ledger.js | bytesOf | L132-136 | 入参归一为 Buffer：Buffer 复制、Uint8Array 转换、其余按 UTF-8 编码字符串（null/undefined 当空串） |  |
| plugins/dsh-extra-plan/lib/usage-ledger.js | textOfBytes | L138-140 | 先经 bytesOf 归一，再按 UTF-8 解码为字符串 |  |
| plugins/dsh-extra-plan/lib/usage-ledger.js | isSessionDirectoryName | L143-147 | 判目录名去掉 session- 前缀后是否匹配 UUID 模式，用于筛出会话目录 |  |
| plugins/dsh-extra-plan/lib/usage-ledger.js | listEntries | L149-155 | readdirSync withFileTypes 列举目录项，异常一律返回空数组 |  |
| plugins/dsh-extra-plan/lib/usage-ledger.js | enumerateSessionLogs | L158-189 | 枚举 %DSH_HOME%/sessions 下的 v4 会话日志（会话目录名只认 session-<uuid> 与裸 <uuid>，其余跳过）。 |  |
| plugins/dsh-extra-plan/lib/usage-ledger.js | frameEndAt | L193-221 | zstd 帧切分：从帧起点解析 descriptor、字典与内容长度、逐个 block header，返回帧结束偏移；非法块类型或截断返回 null |  |
| plugins/dsh-extra-plan/lib/usage-ledger.js | decodedLinesOf | L228-266 | 生成器函数：按帧边界循环 zstdDecompressSync 解压，跳过 skippable frame，流式 UTF-8 解码并按换行切行；魔数非法或帧截断抛错 |  |
| plugins/dsh-extra-plan/lib/usage-ledger.js | finiteNumberOrZero | L269-271 | 非负有限数原样返回，其余归零 |  |
| plugins/dsh-extra-plan/lib/usage-ledger.js | stringOrEmpty | L273-275 | 字符串原样返回，其余归空串 |  |
| plugins/dsh-extra-plan/lib/usage-ledger.js | intOrNull | L277-279 | 非负整数原样返回，其余返回 null |  |
| plugins/dsh-extra-plan/lib/usage-ledger.js | isoOf | L281-284 | 毫秒时间戳转 ISO 字符串，非法值用 Date.now() 兜底 |  |
| plugins/dsh-extra-plan/lib/usage-ledger.js | sessionMetaOf | L287-302 | 从 session 事件取会话元信息（id 缺失用目录名，含 cwd/agentPreset/parentSession/delegationDepth/origin），delegationDepth 缺失记 0 且 hasExplicitDepth=false |  |
| plugins/dsh-extra-plan/lib/usage-ledger.js | usageOf | L305-323 | 从 assistant/message 事件取 usage 四桶，缺失/非法字段归零，非目标事件返回空。 |  |
| plugins/dsh-extra-plan/lib/usage-ledger.js | presetOfSelectedEvent | L326-333 | 依次在事件顶层与 data 的 agentPreset/preset/id 里取首个非空字符串，取不到返回空串 |  |
| plugins/dsh-extra-plan/lib/usage-ledger.js | lineageOfRequestHeader | L336-344 | 从 request/header 的 parentSession 与 delegationDepth 取血缘兜底值，两者都缺返回 null |  |
| plugins/dsh-extra-plan/lib/usage-ledger.js | scanLogText | L347-390 | 对单个会话日志文本做前缀粗筛后逐行解析，累加 usage 到身份分组。 |  |
| plugins/dsh-extra-plan/lib/usage-ledger.js | hasOwn | L393-395 | Object.prototype.hasOwnProperty 的调用封装 |  |
| plugins/dsh-extra-plan/lib/usage-ledger.js | identityValueOf | L397-401 | 身份键归一：delegationDepth 只收非负整数、schemaVersion 原样、其余只收字符串 |  |
| plugins/dsh-extra-plan/lib/usage-ledger.js | identityKeyOf | L403-407 | 按 IDENTITY_KEYS 顺序取归一值，JSON.stringify 成九字段身份键 |  |
| plugins/dsh-extra-plan/lib/usage-ledger.js | rootSessionOf | L411-427 | 沿 parentById 链上溯求血缘根：depth 1 直接取 parent，更深逐级上溯，链路缺失或成环返回空串 |  |
| plugins/dsh-extra-plan/lib/usage-ledger.js | isChildSession | L429-431 | delegationDepth>0 或 parentSessionId 非空或 origin=subagent 即判为子会话 |  |
| plugins/dsh-extra-plan/lib/usage-ledger.js | roleOf | L434-437 | 非子会话固定 main；子会话按 USAGE_ROLE_BY_PRESET 映射四角色，未命中记 child |  |
| plugins/dsh-extra-plan/lib/usage-ledger.js | emptyGroup | L439-458 | 按身份建零值聚合组：四桶与 calls 归零、seq 为 null、ts 空串 |  |
| plugins/dsh-extra-plan/lib/usage-ledger.js | compareValues | L460-464 | 两值转字符串后比较（null/undefined 视作空串），返回 -1/0/1 |  |
| plugins/dsh-extra-plan/lib/usage-ledger.js | rowSort | L466-472 | 行排序比较器：先按 IDENTITY_KEYS 逐键比较，再按 seq（null 视空）比较 |  |
| plugins/dsh-extra-plan/lib/usage-ledger.js | addUsageToGroups | L474-496 | 按身份键累加进 groups：四桶与 calls 累加，seq/ts 只在本次 seq 不小于既有水位时更新 |  |
| plugins/dsh-extra-plan/lib/usage-ledger.js | allowedOf | L498-502 | 白名单归一：未传用 ALLOWED_PRESETS，Set 转数组，数组原样，其余回落 ALLOWED_PRESETS |  |
| plugins/dsh-extra-plan/lib/usage-ledger.js | scanUsageRows | L505-591 | 启动扫描主体：逐日志多帧解压取 assistant/message 的 usage，白名单过滤后按九字段身份聚合，返回 groups 与单调性告警。 |  |
| plugins/dsh-extra-plan/lib/usage-ledger.js | mergedFsOps | L594-596 | 把注入的 fs 与默认实现合并，供夹具替换单点文件操作。 |  |
| plugins/dsh-extra-plan/lib/usage-ledger.js | nowOf | L598-608 | 取当前毫秒时间：clock 可传函数或带 now() 的对象，非法值回落 Date.now() |  |
| plugins/dsh-extra-plan/lib/usage-ledger.js | hostRootOf | L610-616 | 从 pathContext 取 host 数据根；空根即跳过本次启动扫描。 |  |
| plugins/dsh-extra-plan/lib/usage-ledger.js | tokenNumber | L617-619 | 读组内 token 字段的非负有限数，非法归零 |  |
| plugins/dsh-extra-plan/lib/usage-ledger.js | identityValue | L621-625 | 账本行身份键取值：delegationDepth 只收非负整数、schemaVersion 原样、其余只收字符串 |  |
| plugins/dsh-extra-plan/lib/usage-ledger.js | groupSort | L627-633 | 合并组排序比较器：先按 IDENTITY_KEYS 逐键比较，再按 maxSeq（null 视空）比较 |  |
| plugins/dsh-extra-plan/lib/usage-ledger.js | validDedupeKey | L635-641 | 判行能否提供去重水位：是对象且 sessionId 非空、seq 为非负整数 |  |
| plugins/dsh-extra-plan/lib/usage-ledger.js | validationIssue | L642-661 | 单行 15 键与身份字段合法性检查，返回问题文本供严格解析组错误码。 |  |
| plugins/dsh-extra-plan/lib/usage-ledger.js | parseStrictLedgerText | L664-698 | 严格解析既有 archive：坏 JSON、说明行位置、non-v2 与 15 键合法性逐行校验，不合法即拒绝发布。 |  |
| plugins/dsh-extra-plan/lib/usage-ledger.js | identityOf | L700-704 | 按 IDENTITY_KEYS 从行抽出九字段身份对象 |  |
| plugins/dsh-extra-plan/lib/usage-ledger.js | identityKeyOfRow | L706-709 | 把行身份的九字段序列化成 JSON 键，作为合并分组键 |  |
| plugins/dsh-extra-plan/lib/usage-ledger.js | emptyGroupOf | L711-723 | 按行身份建零值合并组：四桶与 calls 归零、maxSeq/_latestSeq 为 null、latestTs 空串 |  |
| plugins/dsh-extra-plan/lib/usage-ledger.js | groupFromArchiveRow | L725-735 | 账本行转合并组：四桶取行内值，seq 有效时记 maxSeq 并落到 latestTs |  |
| plugins/dsh-extra-plan/lib/usage-ledger.js | groupFromScanRow | L738-749 | 扫描行转合并组：四桶与 calls 取扫描值，seq 有效时记水位与最新事件时间 |  |
| plugins/dsh-extra-plan/lib/usage-ledger.js | tokenTotalOf | L751-755 | 合并组四桶求和，用于单调性比较 |  |
| plugins/dsh-extra-plan/lib/usage-ledger.js | mergedArchiveGroups | L760-797 | archive 现有行与本次扫描行按身份合并：覆盖式更新 + 单调性保护（小于现状保留旧值并记告警）。 |  |
| plugins/dsh-extra-plan/lib/usage-ledger.js | finalizedGroups | L799-805 | 合并组按 groupSort 排序并逐组复制，剔除内部字段 _latestSeq |  |
| plugins/dsh-extra-plan/lib/usage-ledger.js | assertUniqueArchiveRows | L807-815 | 同一完整身份出现多条累计行即报 duplicate-archive，发布前拒绝。 |  |
| plugins/dsh-extra-plan/lib/usage-ledger.js | archiveRowOf | L817-835 | 把聚合身份投影为固定 15 键数据行（ts 取最后写入时刻、seq 取会话内事件序号，不作主键）。 |  |
| plugins/dsh-extra-plan/lib/usage-ledger.js | archiveTextOf | L837-846 | 说明行（首行唯一）+ 数据行的序列化，归档文本唯一来源。 |  |
| plugins/dsh-extra-plan/lib/usage-ledger.js | ensureLedgerDirectory | L848-855 | 上下文缺失直接返回；否则先授权再递归建账本目录，随后按目录类型回读校验，失败即抛错。 |  |
| plugins/dsh-extra-plan/lib/usage-ledger.js | authorizeWriteTarget | L857-859 | 写目标 H/W 双根授权（prepareWriteTarget，含用途与期望类型）。 |  |
| plugins/dsh-extra-plan/lib/usage-ledger.js | authorizeReadIfPresent | L861-867 | 读目标存在时做只读授权复核，缺失不报错。 |  |
| plugins/dsh-extra-plan/lib/usage-ledger.js | optionalRead | L869-877 | 容错读：ENOENT 视为不存在，其它错误转 read-failed。 |  |
| plugins/dsh-extra-plan/lib/usage-ledger.js | recordDiagnostic | L879-891 | 向 usage-ledger/archive-failed.log 追加一行时间+原因；写失败静默忽略，不阻断启动。 |  |
| plugins/dsh-extra-plan/lib/usage-ledger.js | reportFailure | L893-903 | 失败统一出口：warn + 写诊断行 + 返回 { status:'failed', reason, error }。 |  |
| plugins/dsh-extra-plan/lib/usage-ledger.js | publishArchive | L907-922 | 单目标原子发布：写同目录临时文件 → 预算检查 → rename 覆盖 archive；失败清理临时文件、既有账本原样保留。 |  |
| plugins/dsh-extra-plan/lib/usage-ledger.js | acquireArchiveLock | L927-944 | 一次 O_EXCL 创建 <archive>.lock 的简易互斥；拿不到即返回未获取，不等待、不接管死锁、不删他人锁。 |  |
| plugins/dsh-extra-plan/lib/usage-ledger.js | releaseArchiveLock | L947-949 | 仅 unlink 本次 O_EXCL 创建的锁文件，失败只在 try/finally 内忽略，不抛给启动路径。 |  |
| plugins/dsh-extra-plan/lib/usage-ledger.js | archiveLedger | L957-1032 | 直调入口：给定 archive 路径的「聚合 + 覆盖式更新 + 原子发布」，不承担进程互斥。 |  |
| plugins/dsh-extra-plan/lib/usage-ledger.js | checkBudget | L978-985 | 预算与 onCheck 阶段探针：超时抛 budget-timeout，阶段名供 step-00 M6 断言。 |  |
| plugins/dsh-extra-plan/lib/usage-ledger.js | skipWithDiagnostic | L1035-1043 | 可预期跳过（无 host 根/锁忙/扫描失败）时返回 skipped 并写一行诊断。 |  |
| plugins/dsh-extra-plan/lib/usage-ledger.js | startupArchiveUnsafe | L1048-1097 | 启动路径主体：host 根判定 → 路径解析与双根授权 → 简易锁 → 调 archiveLedger，失败转结构化结果。 |  |
| plugins/dsh-extra-plan/lib/usage-ledger.js | startupArchive | L1101-1116 | 账本启动唯一入口：全程同步，任何异常内部消化（留痕 archive-failed.log），绝不阻断 DSH 启动。 |  |
| plugins/dsh-extra-plan/scripts/generate-runtime-defaults.mjs | repositoryRootFromKnownLayout | L17-25 | 从脚本位置向上三级推导仓库根，pe-test、plugins 与包清单缺任一即返回 null 不抛错。 |  |
| plugins/dsh-extra-plan/scripts/generate-runtime-defaults.mjs | roleDefinitionFile | L51-53 | 按角色 id 拼出角色 definition 产出文件名，只做路径拼接不校验目录是否存在。 |  |
| plugins/dsh-extra-plan/scripts/generate-runtime-defaults.mjs | runtimeDefaultsFromTemplate | L55-60 | 按设置合同逐键从模板文本解析默认值并组成键值对象，不校验模板是否缺键，也不校验形状。 |  |
| plugins/dsh-extra-plan/scripts/generate-runtime-defaults.mjs | renderRuntimeDefaults | L62-72 | 渲染 preset-defaults 产物文本，冻结默认设置并导出探索预算与规划者后缀两个别名。 |  |
| plugins/dsh-extra-plan/scripts/generate-runtime-defaults.mjs | clientFieldMetadata | L78-91 | 抽取设置项的客户端字段元数据，缺 ui 元数据即抛错，只搬运白名单内的可选键与控件类型。 |  |
| plugins/dsh-extra-plan/scripts/generate-runtime-defaults.mjs | clientFieldLines | L93-99 | 把一组设置项渲染成冻结数组的源码行，逐项 JSON 序列化后按固定缩进拼接为一行声明。 |  |
| plugins/dsh-extra-plan/scripts/generate-runtime-defaults.mjs | renderClientFieldBlock | L101-112 | 渲染客户端字段生成块，分组必须恰为 9 项 extra-plan 加 2 项 host-rows 否则抛错。 |  |
| plugins/dsh-extra-plan/scripts/generate-runtime-defaults.mjs | markerMatches | L114-117 | 找出整行只含指定注释标记的行，标记先做正则元字符转义再逐行匹配，不做任何模糊匹配。 |  |
| plugins/dsh-extra-plan/scripts/generate-runtime-defaults.mjs | clientFieldMarkerRange | L119-127 | 定位客户端源里两处字段生成标记的区间，标记缺失、重复或逆序均抛错并识别换行风格。 |  |
| plugins/dsh-extra-plan/scripts/generate-runtime-defaults.mjs | renderClientFields | L129-134 | 用生成的字段块替换客户端源中两标记之间的内容，非字符串入参抛错，保留原文件换行风格。 |  |
| plugins/dsh-extra-plan/scripts/generate-runtime-defaults.mjs | separatorIndexOf | L139-141 | 返回首个顶格 YAML 文档分隔行的下标，找不到时返回 -1 而不抛错，也不改动入参。 |  |
| plugins/dsh-extra-plan/scripts/generate-runtime-defaults.mjs | topLevelRowsOf | L144-154 | 抽取模板第一文档的顶层条目区间，缺根级条目即抛错，保留注释与 group 原文。 |  |
| plugins/dsh-extra-plan/scripts/generate-runtime-defaults.mjs | secondDocumentOf | L157-162 | 抽取模板第二文档分隔行之后的全部原文行，缺分隔行即抛错，不做任何解析、也不做形状校验。 |  |
| plugins/dsh-extra-plan/scripts/generate-runtime-defaults.mjs | indentBlock | L164-167 | 给整块文本的每一行统一增加缩进量，默认两空格，空行保持为空不加空格，返回新数组。 |  |
| plugins/dsh-extra-plan/scripts/generate-runtime-defaults.mjs | indentOf | L169-173 | 数出行首连续空格的数量作为缩进量，只认空格字符，制表符与其它空白字符一律不计入。 |  |
| plugins/dsh-extra-plan/scripts/generate-runtime-defaults.mjs | shiftBlock | L175-183 | 把整块文本按指定缩进量整体平移，返回新数组而不改动原块，平移后缩进为负即抛错终止。 |  |
| plugins/dsh-extra-plan/scripts/generate-runtime-defaults.mjs | rawBlockFrom | L189-200 | 从起始行起取其下更深缩进的连续行组成整块，遇同级行即结束，尾部空行一律剔除干净。 |  |
| plugins/dsh-extra-plan/scripts/generate-runtime-defaults.mjs | quoteYamlSingle | L202-204 | 用单引号包裹 YAML 标量并转义内部单引号，不做双引号或其它引号形态的判断与回退。 |  |
| plugins/dsh-extra-plan/scripts/generate-runtime-defaults.mjs | assertDefinition | L206-222 | 校验主 definition 结构：id、名称、插件恰 17 条且 delegation 组 5 子行，不符即抛错。 |  |
| plugins/dsh-extra-plan/scripts/generate-runtime-defaults.mjs | renderPresetDefinition | L224-243 | 渲染纯 preset definition 文本并回读自校验，元数据缺名称或描述即抛错。 |  |
| plugins/dsh-extra-plan/scripts/generate-runtime-defaults.mjs | mainExtraPlanRowBlock | L246-257 | 从主 definition 取出 extra-plan 子行的原文块与 config 块，缺行或缺 config 抛错。 |  |
| plugins/dsh-extra-plan/scripts/generate-runtime-defaults.mjs | personaPrefixBlock | L260-286 | 在角色源里找解析值逐字相等的 personaPrefix 折叠块，多个候选逐个试，找不到抛错。 |  |
| plugins/dsh-extra-plan/scripts/generate-runtime-defaults.mjs | roleToolsBlock | L289-300 | 按角色序号取出对应 tools 列表的原文行，tools 行数与角色数不符即抛错。 |  |
| plugins/dsh-extra-plan/scripts/generate-runtime-defaults.mjs | findRowById | L303-314 | 深度优先递归查行 id，含 group 行的子行数组，未命中返回 null 而不抛错。 |  |
| plugins/dsh-extra-plan/scripts/generate-runtime-defaults.mjs | mainToolPresentationMode | L321-332 | 由主 definition 的 executor 行判定 native 或 ptc，缺行、多行或解析异常回落合同默认。 |  |
| plugins/dsh-extra-plan/scripts/generate-runtime-defaults.mjs | assertRoleSource | L334-358 | 校验角色源的行数与顺序、必填字段，手写 gateWords 或 executor 行一律抛错。 |  |
| plugins/dsh-extra-plan/scripts/generate-runtime-defaults.mjs | assertRoleDefinition | L360-380 | 校验生成的角色 definition：首两行固定，末行恰一行 executor 且不带 config，不符即抛错。 |  |
| plugins/dsh-extra-plan/scripts/generate-runtime-defaults.mjs | renderRoleDefinitions | L387-432 | 渲染全部角色 definition，逐字复制主预设 extra-plan 行 config 并回读逐条比对。 |  |
| plugins/dsh-extra-plan/scripts/generate-runtime-defaults.mjs | assertParses | L434-442 | 解析 YAML 并带上对象标签，失败时把原始错误包装成解析失败错误再抛出，不改入参。 |  |
| plugins/dsh-extra-plan/scripts/generate-runtime-defaults.mjs | checkOutput | L444-448 | 只读比对产物与渲染结果，缺失或字节不一致即抛错，全程不写文件，也不创建任何目录。 |  |
| plugins/dsh-extra-plan/scripts/generate-runtime-defaults.mjs | publishFsOpsOf | L453-456 | 用调用方传入的覆盖项逐键覆盖默认文件操作集合，覆盖项非对象时整体退回默认集合，不抛错。 |  |
| plugins/dsh-extra-plan/scripts/generate-runtime-defaults.mjs | errorText | L458-460 | 取错误的 message 文本，非错误值直接转字符串，不做错误码归类，也不做任何截断。 |  |
| plugins/dsh-extra-plan/scripts/generate-runtime-defaults.mjs | uniquePaths | L462-464 | 按出现顺序对路径列表去重，既不解析也不校验路径合法性，且不改变元素的原始字符串。 |  |
| plugins/dsh-extra-plan/scripts/generate-runtime-defaults.mjs | cleanupPublishFiles | L466-476 | 逐个删除发布残留的临时与备份文件，单条删除失败只记录而不中断，最终返回失败描述清单。 |  |
| plugins/dsh-extra-plan/scripts/generate-runtime-defaults.mjs | restorePublishedEntry | L478-491 | 按备份还原单条已发布产物，原本无文件则删除目标文件，失败只返回描述字符串而不抛错。 |  |
| plugins/dsh-extra-plan/scripts/generate-runtime-defaults.mjs | publishFailure | L493-505 | 构造含阶段、回滚与清理明细的发布失败错误，把原始错误挂为 cause 属性以便追溯。 |  |
| plugins/dsh-extra-plan/scripts/generate-runtime-defaults.mjs | normalizedOutputEntries | L507-516 | 把各产出条目的路径解析为绝对路径并查重，重复目标即抛错，并报出冲突的两个来源标签。 |  |
| plugins/dsh-extra-plan/scripts/generate-runtime-defaults.mjs | publishGeneratedOutputs | L518-580 | 先暂存全部产物再逐个改名发布，任一步失败按逆序回滚并清理残留，抛出带阶段的聚合错误。 |  |
| plugins/dsh-extra-plan/scripts/generate-runtime-defaults.mjs | generatorPathContext | L583-590 | 复用调用方传入的路径上下文，缺省按仓库根与宿主根新建，不额外校验根的合法性与形状。 |  |
| plugins/dsh-extra-plan/scripts/generate-runtime-defaults.mjs | inputPathSpec | L592-599 | 归一化输入类别与权限选项，类别非 workspace 或 host 即抛错，缺省按 workspace。 |  |
| plugins/dsh-extra-plan/scripts/generate-runtime-defaults.mjs | readGeneratorInput | L601-607 | 按输入类别解析路径并做只读文件校验，返回校验后的规范路径，不读取也不返回文件内容。 |  |
| plugins/dsh-extra-plan/scripts/generate-runtime-defaults.mjs | pathEntryExists | L609-617 | 判断路径是否存在，ENOENT 与 ENOTDIR 视为不存在，其余错误照原样抛错。 |  |
| plugins/dsh-extra-plan/scripts/generate-runtime-defaults.mjs | ensureWorkspaceOutputParent | L619-633 | 逐级补建缺失的输出父目录，每级补建后都复验为目录，路径不可解析即抛错且不留残留。 |  |
| plugins/dsh-extra-plan/scripts/generate-runtime-defaults.mjs | generatorOutputTarget | L635-643 | 解析生成输出目标，非 check 模式强制工作区类，缺省用途为 generator-output。 |  |
| plugins/dsh-extra-plan/scripts/generate-runtime-defaults.mjs | outputEntryTarget | L645-655 | 按条目类别与用途解析单条产出目标路径，补齐缺省值后再走宿主或工作区的路径解析分支。 |  |
| plugins/dsh-extra-plan/scripts/generate-runtime-defaults.mjs | authorizeOutputEntries | L657-670 | 逐条授权产出目标：check 只做只读校验，否则强制工作区并预建父目录后再次复验。 |  |
| plugins/dsh-extra-plan/scripts/generate-runtime-defaults.mjs | outputMetadata | L672-680 | 汇总产出目标的类别、能力与用途三项元数据，空目标返回空对象而不抛错，也不补默认值。 |  |
| plugins/dsh-extra-plan/scripts/generate-runtime-defaults.mjs | generateRuntimeDefaults | L691-773 | 读模板渲染全部产物：check 只比对不写，否则原子发布；坏模板或缺失输入不触碰产物。 |  |
| plugins/dsh-extra-plan/scripts/generate-runtime-defaults.mjs | invokedAsMain | L775-778 | 判断本脚本是否被直接执行，进程参数缺失时返回假，只做路径比较，不去改变进程状态。 |  |

---

*本文件由脚本增量维护；直接编辑功能描述/备注列是安全的。*
