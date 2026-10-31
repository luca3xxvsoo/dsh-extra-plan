# 代码地图（dsh-extra-plan）

> **维护分工**：行号区间/增删行由脚本 node pe-test/tools/代码地图生成.mjs 增量同步；**功能描述、备注、以及「意图速查」整节由 AI/人维护**（脚本刷新不会覆盖）。
> **用法**：先看「意图速查」按意图词找函数名 → 再到「函数索引」按函数名取行号区间 → read 该区间。
> 上次同步：2026-10-31 21:17:06（脚本自动更新时间戳行）

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
| 会话事件快照／角色常量与身份识别（ROLE_IDS/ROLE_ORDERS 只描述身份与顺序，不承载权限）／单次快照复用（execEvents）／planner descriptor 缓存／usage 血缘上下文 | lib/agent-session.js、lib/agent-runtime.js、lib/runtime-lifecycle.js、lib/role-contract.js、index.js | sessionEvents、isSubagentChild、isLiveDelegation、childPolicyNeedsFloor、createAgentRuntime、isChild、isPlannerChild、toolSchemasOf、usageContextOf、usageRootOf、childBaseline |
| 在线 usage 共享锁／owner 诊断／stale-lock 每实例一次可见告警与显式维护／release 失败状态／默认快照与在线归档（active+archive+lock、writer 短等、释放后补记、无调用计数列；账本路径按 H/W 用途和 pathContext 判定） | plugins/dsh-extra-plan/lib/usage-ledger.js、pe-test/tools/step-99-用量统计.mjs | pathContextOf、resolveLedgerPath、ledgerTargetOf、authorizeLedgerWrite、ensureLedgerDirectory、usageLedgerLockPath、acquireUsageLedgerLock、releaseUsageLedgerLock、warnStaleLock、foldUsage |
| 会话状态生命周期／disposed 收尾／末轮 V2 usage 结算／root 与自身 session 血缘（断链/循环仍以空 root 合法落账；rootSessionId/agentPreset 可空，非法 context 拒绝）／四桶字段（provider、input/cacheRead/cacheWrite/output）／账本续载（session 分桶、final fold、cursor 降级、session.seq 水位 + snapshotEvents(from,to) 区间增量、水位未变直接返回、截断回退全量） | index.js、lib/agent-runtime.js、lib/usage-ledger.js | usageContextOf、usageRootOf、foldUsage、readUsageCursorTable、warnUsageCursorDegraded、usageCursorEntryOf、noteRunCodeSubCall、childBaseline |

- step-99 文件说明：V2 active/archive 统计与在线归档 CLI；默认模式锁内快照后宽松读取合并，显式 `--archive` 持锁 strict 校验、按完整身份 source-aware 水位聚合、原子发布并清空 active，cursor 不读写；writer timeout 静默返回 `delayed`、后续 fold 补记，stale-lock 由维护者核实 owner 后显式维护，release 失败显式诊断，已提交写入不伪装回滚。
- step-99 关键符号索引（真实源码行号；以下含导出与内部符号，默认生成根不扫描该测试工具）：
  - 导出/内部常量与错误类型：`ARCHIVE_BUDGET_MS` L16、`ARCHIVE_FILE_NAME` L17、`V2_KEYS` L18-34、内部 `IDENTITY_KEYS` L35-45、导出 `LedgerError` L54-60。
  - 内部锁与释放：`lockFailure` L118-132、`acquireLock` L134-144、`releaseLock` L146-158（释放失败抛出/报告 `code=release-failed`）。
  - strict/宽松解析（内部/导出）：内部 `validationIssue` L178-197（固定15键；`rootSessionId`/`agentPreset` 可为空字符串）、导出 `parseLedgerText` L199-238（`strict=true` 归档拒绝非法行，默认统计宽松读取）。
  - 身份与聚合（导出/内部）：内部 `identityOf` L264-268、`identityKeyOf` L270-273，导出 `summarizeRows` L327-358，内部 `summarizeSourceRows` L369-426（archive `seq` 累计水位、active 低水位重放跳过并计 `covered`）与 `assertUniqueArchiveRows` L428-436（完整身份唯一）。
  - 导出输出与默认统计：`summarizeSnapshotTexts` L438-457、`renderStats` L463-482、`statLedger` L504-524（释放失败抛出/报告 `code=release-failed`）。
  - 归档发布（内部/导出）：内部 `archiveRowOf` L526-544、`archiveTextOf` L546-555、`publishTransaction` L634-691；导出 `archiveLedger` L693-743（已提交写入不伪装回滚，失败状态保留诊断）。
  - CLI：`parseCliArgs` L745-750、`main` L752-767。
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
| 实机子代理模型／提供方／planner 引导取证（A42/A43、C11/C12、HUMAN；显式 `--session`+`--sessions-dir`（宿主数据根加 `--host-root`、直接 child 加 `--discover-children`）+ 显式 `PLANNER_PROMPT_SUFFIX`；默认索引与 `--full` 原文/raw 分层；request/header attempted route（尝试路由） 与 assistant/message actual provenance（实际来源） 分栏；suffix 等级与 exact match；共享定位器显式有界选择只解析命中直接 child（上限 128 候选/单日志头 262144 字节）） | pe-test/tools/step-07-子代理模型与引导取证.mjs |  |
| 80格 A/C/M/F-L 路由与目录断言／显式 header catalog 取证 | pe-test/tools/step-04-路由与写闸门.mjs、pe-test/tools/step-04-工具清单查看.mjs |
| MJS 三模式输出合同／有限摘要／稳定 JSON／HUMAN 双通道 raw hash | pe-test/_shared/test-output.mjs、pe-test/tools/一键step测试.mjs |  |
| 探查者委派／禁止 planner 派探查（subagent_probe） | index.js、plugins/dsh-extra-plan/lib/model-routing.js | subagentProbeGateReason、resolveOtherAgentEntry |
| 只读子代理／验收者只读（reviewer/readonly） | index.js | childReadonlyGateReason、shellMutationReason、isReadOnlyChildByCatalog |
| 四角色 definition 工具面／main control 保留／Cordis 只读绑定 | assets/presets/extra-plan/agent.cordis.yml、assets/presets/extra-plan/preset-definition-<role>.generated.yml、index.js | roleDefinitionsWithPresentation、toolSchemasOf |
| child 控制矩阵与宿主角色工具面测试入口 | pe-test/tools/step-00-全流程回归.mjs、pe-test/tools/step-04-路由与写闸门.mjs、pe-test/tools/step-05-角色预设宿主回归.mjs |  |
| 子代理沙箱下限／权限抬升（floor/sandbox） | lib/agent-runtime.js、index.js | childPolicyNeedsFloor、createAgentRuntime |
| 工具目录折叠／PTC 单入口（catalog/ptc） | index.js | catalogIsCollapsed |
| 设置后端／唯一全局 owner／settings-only no-remount（10 项 volatile Config + profileSync settled 镜像；adapter failure 独立；8 热读/2 需重启/gateWords restart；默认对象与 UI metadata 分源） | lib/settings.js、lib/settings-contract.js、lib/preset-settings.js、lib/preset-sync.js | apply、createApiHandler、proPayload、createDefaultSettings、readUnifiedState、findSettingsRow、effectiveRowConfig、resolveUnifiedConfig、restateSettingsConfig、findPluginsRow、applyPlan、mountPresetSync、initialMount、settledSettingsUpdate、structuralHandoff、syncEditor、settledSettings、profileSyncPath、reportProfileSync |
| Web→QQBot profile 同步／documentPath 首选／显式备用／双锚点／局部 YAML 安全写与恢复 | plugins/dsh-extra-plan/lib/qqbot-settings-sync.js；pe-test/tools/step-01-设置页配置.mjs、step-01-qqbot-安装映射.mjs（分别覆盖路径/API、YAML 正负例） | resolveProfilesRoot、findOwnQqbotProfiles、validateSettingsSnapshot、planQqbotSettingsPatch、writeQqbotSettingsPatch、createQqbotSettingsSynchronizer |
| 设置值定位与捕获（source/row/legacy projection locator；10 项全局行 + 旧行安全读取；PUT 兼容入口合并全局值） | lib/preset-settings.js、lib/settings.js、lib/preset-sync.js | captureSettings、captureRowSettings、hostRowDefaultsFromTemplate、readProjectedValue、resolveSetting、findTextLocatorMatches、patchYamlScalar、serializeScalar、publicField、readLegacyState |
| 配置热读／生效标志／后端权威行更新无需重启（live-config/hot-read；增强 stamp dev/ino/size/mtimeNs/ctimeNs，兼容回退 ino/size/mtimeMs/ctimeMs；当前目标与 pathContext 分层） | plugins/dsh-extra-plan/lib/live-config.js、plugins/dsh-extra-plan/index.js | createLiveConfig、refresh、read、currentResolved、currentContext、readDiskValues、statStamp、pick |
| 预设核对／纯 definition／首次 adapter／旧行非破坏迁移／settled-only 与 structuralHandoff 分离 | lib/preset-sync.js、lib/preset-settings.js | syncPreset、assetDefinition、definitionWithProjection、readUnifiedState、readLegacyState、resolveUnifiedConfig、restateSettingsConfig、declarationBodyMatchesAsset、stripUserWritable、carryUserWritable、assetPlugins、pluginRowIds、readDeclaredPluginsFromPatch、applyPlan、structuralFingerprint、mountPresetSync、initialMount、settledSettingsUpdate、structuralHandoff、reportSettledError |
| 同页共享客户端表单／仅经 detail.section 渲染于 bundle 详情页行列表之后（自绘标题；字段常量只来自生成器标记区块；不注册 bundle.config/row/item/tab，本包 bundle.config 槽被任何一方注册条目时 detail.section 让位） | lib/client.js、scripts/generate-runtime-defaults.mjs | apply、SettingsCard、ExtraPlanForm、DetailSettingsSection、registerClientSurfaces |
> client.js 设置入口定位：`DetailSettingsSection` 与 `registerClientSurfaces`；设置表单仅经 plugins.detail.section 渲染于 bundle 页行列表之后，若本包 bundle.config 槽被任何一方注册条目则让位保持唯一表单；ConfigForms.get(NS) 订阅快照并一次 mutate 十项，不注册 bundle.config/row.config/settings.plugins.tab/plugins.item。
| qqbot 严格安装／shared sameRealPath 路径比较／可选目标 profile 筛选／兼容自愈建链 | dsh-extra-plan-qqbot（仓库目录 plugins/dsh-extra-plan-qqbot）/lib/heal.js、scripts/heal.mjs | sameRealPath、strictInstall、findOwnQqbotProfiles、healQqbotCompatibility、ensureDshExtraPlanLink |
| 十项默认值 sourceLocator → DEFAULT_SETTINGS／兼容别名／消费者；纯 definition、四角色 definition 与 client 标记区块生成／last-known-good／事务发布（默认仓库七输出；自定义 client 默认关闭；--check 零写） | lib/preset-settings.js、lib/settings-contract.js、scripts/generate-runtime-defaults.mjs、lib/preset-defaults.generated.js、lib/client.js、assets/presets/extra-plan/preset-definition.generated.yml | resolveTemplateSettingDefault、runtimeDefaultsFromTemplate、renderRuntimeDefaults、renderClientFieldBlock、renderClientFields、renderPresetDefinition、topLevelRowsOf、generateRuntimeDefaults、normalizedOutputEntries、publishGeneratedOutputs、checkOutput |
| 闸门关键词单一来源／7 词唯一手工编辑位／prompt variable 注册／旧词拒绝／严格校验（gateWords/extra_plan_*） | plugins/dsh-extra-plan/assets/presets/extra-plan/agent.cordis.yml、plugins/dsh-extra-plan/lib/gate-words.js、index.js | validateGateWords、createGateRuntime、normalizeGateLabel、matchExactKind、deriveFlowState、mainGateReason |
| gateWords 启动核对／厂商模板整组校验／旧声明行 carry（无破坏性迁移） | plugins/dsh-extra-plan/lib/preset-sync.js | syncPreset、readDefinitionGateWords、assertTemplateGateWords、readLegacyState |
| runtime-static 纯 helper（cause-chain） | lib/runtime-static.js | causeChainOf |
| 普通/PTC ask 解码／拒绝中文呈现／状态推进（闸门拒绝不重置路由、取消仍清四字段；HOST_ASK_CANCEL_TEXTS 宿主取消句） | plugins/dsh-extra-plan/lib/gate-decisions.js、index.js | parseAskResultData、parseDispatchAskResult、askResultTextIsDenied、firstTextOfBlocks、applyAskOutcome、deriveFlowState |
| 代码地图自身维护／口径／严格模式 | pe-test/tools/代码地图生成.mjs（不在索引范围，读文件头注释） |  |
| 新载体选型与 isolate 审计（纯 definition／官方 adapter／三组 isolate 名单：extra-plan-group.extraPlan · compaction.compaction+toolResultPruner · delegation.subagentModelSelection） | plugins/dsh-extra-plan/assets/presets/extra-plan/agent.cordis.yml、plugins/dsh-extra-plan/assets/presets/extra-plan/preset-definition.generated.yml、README.md（READAI.md「新载体」节） |  |
| 创造 skill 静态注册／bundledSkillDir／C=0 与 C=1 的 catalog 语义（skill-filesystem 行的 config.bundledSkillDir 指向 agent-preset 包内 skills/ 且 watch: false——0.2.0-rc.2 换通道修法，旧 customSkillDirs 经 ctx.fs 扫 asar 抛非 absent 错；「不注册」已改为 catalog 隐藏） | plugins/dsh-extra-plan/assets/presets/extra-plan/agent.cordis.yml、plugins/dsh-extra-plan/lib/assembly-presentation.js、plugins/dsh-extra-plan/index.js | shouldHideCreativeCatalog、projectSkillCatalogDecision、skillCatalogEntriesOf、renderSkillCatalogText |
| 0.1.7 服务名换代／ptcRuntime／SDK renderer 语言取值 | plugins/dsh-extra-plan/index.js、plugins/dsh-extra-plan/lib/assembly-presentation.js | apply、resolveToolsSdkRenderer、renderFilteredToolsSdk、sdkSchemasForRendering |
| tool-jobs 完成通知解锁（`agent/inbox/claimed` 同步主入口 + `tools/pre-execute` durable snapshot fallback；两入口共用 `consumeToolJobsNotice`；严格校验非空 `message.id`、source.kind=tool-jobs/form=notice 与正文 /background job (\S+)/；session 内以 notice `message.id` 判重，同 id 跨 claimed/durable 幂等，不同 id 即使复用 jobId 也代表新通知实例；双动作：①jobId 只清当前 session 对应的 job_output 计数 ②job_list/list_agents 轮询守卫 pollGuardCounters 清整表；consumed 在双解锁后写入，用户/agent-message 锚点不删 notice-id Set，disposeSession 才回收，重复/坏输入零副作用；HK9：旧 plugin kind 已废） | plugins/dsh-extra-plan/index.js | consumeToolJobsNotice、apply、recordJobOutputCall、jobOutputGateReason、pollGuardGateReason |
| agent/created 钩子（serial；agent/session-start 已删除）／会话启动基线＋save_plan/save_probe 注册，整块吞错不阻断会话创建 | plugins/dsh-extra-plan/index.js（agent/created 调用点）、plugins/dsh-extra-plan/lib/agent-runtime.js（childBaseline/isPlannerChild 定义）、plugins/dsh-extra-plan/lib/agent-session.js（isSubagentChild 定义） | apply、childBaseline、isPlannerChild、isSubagentChild、registerSavePlan、registerSaveProbe、probeClaimFor |
| MALFORMED_RESPONSE 限次自愈／请求失败兜底 retry／注入模型可读提示（source.kind 用生产者自有 `plugin:dsh-extra-plan`；developer/message 须自带 ≥1 的 turn/step，宿主 append 不补坐标；坐标缺失/非正整数 → 不注入但仍返回 retry） | index.js | malformedRecovery、recordRequestError |
| 会话日志格式 v4 代际／session.v4.jsonl.zstd／共享 session-finder/logPath 三代候选名并存（v4/v3/旧名，未知形状归 v0）；step-06/07 与 step-06-08-v4取证回归 只接受 session.v4.jsonl.zstd | pe-test/_shared/session-finder.mjs、pe-test/tools/step-07-子代理模型与引导取证.mjs |  |

> QQBot 环境验证：`pe-test/tools/step-01-qqbot-环境验证.mjs` 的 `buildPreflight`（五条件/缺失码）、`probeJunctionCapability` 与 `runJunctionFixture`（能力探针/临时 fixture（夹具））、`runLiveReadonly` 与 `inspectMapping`（真实 profile patch/映射只读对拍）；该测试工具不在插件源码生成根，函数行号不手填。

## 文件总览

| 文件 | 行数 | 说明 |
|:--|--:|:--|
| pe-test/_shared/host-deps.mjs | 412 | 解析宿主依赖候选并注册隔离加载钩子 |
| pe-test/_shared/host-preload.mjs | 52 | （待补充） |
| pe-test/_shared/session-finder.mjs | 280 | 按会话ID或目录扫描定位日志并兼容三代命名 |
| pe-test/_shared/test-output.mjs | 176 | 统一compact、verbose、full输出合同与raw证据哈希 |
| pe-test/_shared/v4-tool-result.mjs | 28 | 识别v4会话日志并提取tool result |
| pe-test/_shared/workspace-paths.mjs | 655 | （待补充） |
| pe-test/_shared/zstd-frames.mjs | 107 | 解析zstd帧并解码会话文本 |
| plugins/dsh-extra-plan-qqbot/index.js | 33 | qqbot 精简版自愈插件：apply 启动时调 healQqbotCompatibility 自愈（迁移旧错误块+建链），不阻断启动 |
| plugins/dsh-extra-plan-qqbot/lib/heal.js | 654 | 自愈纯函数模块（共享 sameRealPath 路径比较；profileNames 可缩小 profile 候选；定位/旧块迁移/建链；供 index.js/CLI/测试复用） |
| plugins/dsh-extra-plan-qqbot/lib/path-policy.js | 461 | （待补充） |
| plugins/dsh-extra-plan-qqbot/scripts/heal.mjs | 273 | CLI 入口：--install 严格安装模式（失败非零）；无参启动/手动触发走告警但 exit 0 的兜底；invokedAsMain 判定 |
| plugins/dsh-extra-plan/index.js | 1189 | 核心入口：四级闸门、预算、save 工具注册与生命周期；接线 planner/非 planner 路由、A/C/M 投影、P2-2 cache、V2 session 分桶 usage final fold、v4 MALFORMED 自愈。gateWords 只来自 YAML，apply 先校验再副作用；tools/pre-execute 先用原始 `isSubagentChild` 预审 child 控制工具，再进入角色/root 闸门，main 控制与自动最终结果保持。 |
| plugins/dsh-extra-plan/lib/agent-runtime.js | 153 | 每次 apply 的角色识别、descriptor/工具 schema 缓存、usage 血缘上下文与 role baseline、sandbox floor 工厂；不 import index.js |
| plugins/dsh-extra-plan/lib/agent-session.js | 32 | 会话事件与子代理识别的唯一来源：sessionEvents/isSubagentChild 零依赖纯函数，被 index.js 与 lib/model-routing.js 共用（无镜像副本；不 import index.js） |
| plugins/dsh-extra-plan/lib/assembly-presentation.js | 262 | A/C/M 与 skill catalog 模型可见投影；从 scoped tools 读 schema/模式，SDK renderer 按 language 整体重建；F/PTC 的 tool:read 由 index.js 手写，L 段回宿主原文。 |
| plugins/dsh-extra-plan/lib/client-carrier.js | 7 | settings 内部 Loader Group 的无副作用 Client carrier；不对应 bundle row/公开 export。 |
| plugins/dsh-extra-plan/lib/client.js | 321 | 客户端模块加载共享样式/词条与 SettingsCard/ExtraPlanForm；设置表单仅经 detail.section 渲染于当前包详情行列表之后（自绘标题，不注册 bundle.config；若本包 bundle.config 槽出现条目则让位）；后端全局 settings API/Config/旧值迁移与 definition/adapter 由同一 owner 活动。 |
| plugins/dsh-extra-plan/lib/gate-decisions.js | 1077 | 四级闸门与角色分流判定纯函数集 |
| plugins/dsh-extra-plan/lib/gate-words.js | 114 | 闸门关键词共享契约（唯一值源是 YAML 的 config.gateWords）：字段规格 GATE_WORD_FIELDS/GATE_WORDS_GROUP_DEFINITION + 整组严格校验 validateGateWords（错误一律以 extra-plan: config.gateWords 开头）+ 运行时词表 createGateRuntime（显式入参严格校验，无默认词表）；纯模块：不含任何出厂词值、不读文件与环境变量，被 index.js（运行时）与 lib/preset-sync.js（启动自愈）共享（迁移叶 locator 已随跨版本搬迁链删除） |
| plugins/dsh-extra-plan/lib/live-config.js | 288 | 配置热读：仅 8 项运行时 getter；2 项宿主行权威设置只读并派生到内存 definition，不暴露为 getter；构造期读盘一次，后续按增强 stamp（dev/ino/size/mtimeNs/ctimeNs，兼容 ino/size/mtimeMs/ctimeMs）重读；失败整组回退并告警，不读 DSH_HOME 旧目录 |
| plugins/dsh-extra-plan/lib/model-routing.js | 511 | planner/非 planner 子代理模型路由：顶层纯判定函数 + createModelRouting per-apply 工厂（per-instance WeakMap、惰性 llm/agents getter；不 import index.js） |
| plugins/dsh-extra-plan/lib/path-policy.js | 461 | （待补充） |
| plugins/dsh-extra-plan/lib/planner-budget.js | 137 | planner 工具计数、消息后缀/预算提示/耗尽文案；**预算提醒消息经宿主 createUserMessage 构造，source 用生产者自有 kind `plugin:dsh-extra-plan`（v4 行准入禁旧包裹 `plugin`，违者会话当场终止）**；默认预算由生成模块提供，FREE_TOOLS 仍在根入口 |
| plugins/dsh-extra-plan/lib/preset-defaults.generated.js | 16 | 由 YAML 模板生成的十键 `DEFAULT_SETTINGS` 与兼容别名 runtime fallback（回退）常量；generated（生成）/do not edit（勿手改） |
| plugins/dsh-extra-plan/lib/preset-settings.js | 3 | 10 项设置描述与 YAML 定位；settings 行是权威值，声明行只投影 2 项宿主行；capture/投影读取、plugins 行整体重述与保格式标量改写。 |
| plugins/dsh-extra-plan/lib/preset-sync.js | 1094 | 读取并严格校验纯 definition；旧 preset-extra-plan/extra-plan-preset-sync 仅安全读取迁移，统一全局行补齐后派生 definition 并由同一 owner 挂载官方 AgentPreset；新写入仅经唯一全局行 configEditor.edit；mountPresetSync 以通用 settled 回调交付最终十项/gateWords。 |
| plugins/dsh-extra-plan/lib/preset-yaml.js | 577 | 预设 YAML 纯职责模块：解析、行与叶定位及歧义分类、权威与投影值捕获、保格式标量改写。 |
| plugins/dsh-extra-plan/lib/qqbot-settings-sync.js | 1038 | Web documentPath 首选、显式 DSH_HOME 备用、双锚点 profile 扫描、完整 10 项/gateWords 安全快照、局部 YAML 保格式写入、排他临时/备份/恢复与串行同步队列；不读用户目录、不触碰未知根。 |
| plugins/dsh-extra-plan/lib/role-contract.js | 9 | 冻结角色 ID/order 数组并由同一数组派生 planner/prober preset ID；只提供身份与装配顺序，不承载权限、沙箱或生命周期策略。 |
| plugins/dsh-extra-plan/lib/run-code-scanner.js | 342 | run_code 无宿主状态词法扫描器：字符串/注释遮蔽、括号配平、tools 调用点收集与动态访问判定。 |
| plugins/dsh-extra-plan/lib/run-code-static.js | 571 | run_code 纯静态解析/理由模块：安全 JSON/JS literal 解析、动态 argsText 瀑布兜底、写模式 hint、工具组拆解、ask 返回值白名单、调用点计数与当前 PTC dispatch cap；仅显式注入普通依赖，不持有宿主状态。 |
| plugins/dsh-extra-plan/lib/runtime-lifecycle.js | 147 | per-apply 运行时生命周期：save 工具注册、probe 名额认领与 run_code 子调用计数/拒绝记录，状态在闭包内并按会话清理 |
| plugins/dsh-extra-plan/lib/runtime-static.js | 15 | 显式参数纯 helper：SKILL frontmatter 与 cause 链解析；不持有宿主状态 |
| plugins/dsh-extra-plan/lib/save-contract.js | 263 | save 合同唯一真源：任务名/sessionTag/base、SAVE_PLAN_LIMITS 与内部确定性 summary、paths-only ContentBlock 投影、PROBE_LIMITS、Markdown 渲染与证据引用清洗；无宿主状态，运行时限制只在本文件维护。 |
| plugins/dsh-extra-plan/lib/save-persistence.js | 112 | 单次调用阶段感知提交：mkdir→临时文件逐项写入→逐项检查并顺序发布；失败保留首错/阶段，仅清理本次临时与已发布半套工件，清理失败附残留路径与原因，预存目标不覆盖；不创建/扫描/恢复跨调用 journal；末位 fs 依赖可注入。 |
| plugins/dsh-extra-plan/lib/save-plan-validation.js | 1231 | save_plan 文本合同校验：模式/任务/路径所有权/依赖与执行组 DAG/资源/检查引用与验收组/收尾全局/摘要早拒；不启动代理或执行命令。 |
| plugins/dsh-extra-plan/lib/save-probe-validation.js | 175 | save_probe 参数校验：数组/条目/长度/总量/path 存在性/range/evidence 聚合拒绝 |
| plugins/dsh-extra-plan/lib/save-tool-factories.js | 389 | 显式依赖工厂：save_plan 按类型/长度→合同/摘要→context/base→证据 IO→单次 atomicCommit 严格接线；合法正文逐字保存、structured output 仅 paths、render 仅将两个 paths 投影为唯一 text ContentBlock；save_probe 保留既有证据诊断与落盘；不缓存 ctx/agent/会话状态。 |
| plugins/dsh-extra-plan/lib/sdk-text-cache.js | 161 | apply 级 agent-keyed WeakMap SDK 文本缓存：完整 renderer 输入保守指纹、language/renderer 身份比较、并发 Promise 合并、reject/过期 Promise 不回写、dispose 回收；不持有 sessionId 或 PromptAssembly |
| plugins/dsh-extra-plan/lib/settings-contract.js | 176 | 服务端设置 descriptor 单一合同：10 项的类型/生成默认引用/校验/UI metadata 与权威-投影双定位器，并导出 `createDefaultSettings`、分组与投影遍历源 |
| plugins/dsh-extra-plan/lib/settings.js | 742 | 10 字段 volatile Config、页面策略与 loopback GET/PUT；权威值在唯一 settings 行，PUT 先拒绝空/null/数组/原始/未知/非法混合载荷并严校验当前 gateWords，再只 edit 全局行，no-op 也重读最终快照并等待 profileSync，结构化区分 synced/not-installed/unavailable/failed/partial。 |
| plugins/dsh-extra-plan/lib/shell-mutation.js | 213 | 跨平台命令文本解码与 pwsh/bash 写形态判定；纯函数、不持有 apply 状态 |
| plugins/dsh-extra-plan/lib/usage-ledger.js | 530 | per-apply V2 usage writer 与跨进程排他锁：固定15键（rootSessionId/agentPreset 可空）、owner PID/token、bounded acquire/release、锁内同步 fold、身份血缘与四桶 JSONL、cursor 续载；timeout 静默返回 `delayed`、后续 fold 补记，stale 每实例一次告警并由维护者显式处理，release 失败显式返回状态。 |
| plugins/dsh-extra-plan/scripts/generate-runtime-defaults.mjs | 777 | 从 agent.cordis.yml 校验并生成 runtime 默认常量、纯主/角色 definition 与 client 标记区块（顶层结构逐字平移并保留 group/isolate/!!js）；默认仓库七输出，自定义 client 默认关闭；支持 --check 且坏源不覆盖 last-known-good（上次已知良好版本） |

## 函数索引

| 文件 | 函数 | 行号 | 功能描述 | 备注 |
|:--|:--|:--|:--|:--|
| pe-test/_shared/host-deps.mjs | samePath | L15-17 | （待补充） |  |
| pe-test/_shared/host-deps.mjs | isWithinRoot | L19-23 | （待补充） |  |
| pe-test/_shared/host-deps.mjs | explicitPath | L25-31 | （待补充） |  |
| pe-test/_shared/host-deps.mjs | assertWithinRoot | L33-37 | （待补充） |  |
| pe-test/_shared/host-deps.mjs | physicalRoot | L39-51 | （待补充） |  |
| pe-test/_shared/host-deps.mjs | proveCandidate | L53-92 | （待补充） |  |
| pe-test/_shared/host-deps.mjs | checkHostResolvedResult | L94-105 | （待补充） |  |
| pe-test/_shared/host-deps.mjs | isHostSpecifier | L107-109 | （待补充） |  |
| pe-test/_shared/host-deps.mjs | explicitInstallRoot | L111-115 | （待补充） |  |
| pe-test/_shared/host-deps.mjs | anchorCandidates | L117-131 | 生成宿主依赖锚点目录候选并去重 |  |
| pe-test/_shared/host-deps.mjs | exportTarget | L133-150 | 从依赖入口导出目标包的指定绑定 |  |
| pe-test/_shared/host-deps.mjs | entryOf | L152-175 | 解析宿主依赖导出入口并校验路径 |  |
| pe-test/_shared/host-deps.mjs | findHostAnchor | L177-198 | 选择可用宿主包锚点并报告候选来源 |  |
| pe-test/_shared/host-deps.mjs | scopedEntryOf | L200-210 | 解析scoped包的本地入口路径 |  |
| pe-test/_shared/host-deps.mjs | buildAsyncHookSource | L212-345 | 构造异步import钩子源码供隔离宿主依赖 |  |
| pe-test/_shared/host-deps.mjs | registerHostDeps | L349-412 | 注册测试所需宿主依赖并校验实际版本 |  |
| pe-test/_shared/host-deps.mjs | resolveScoped | L364-370 | 解析scoped宿主包候选路径 |  |
| pe-test/_shared/host-deps.mjs | resolveBare | L371-377 | 解析非scoped宿主包候选路径 |  |
| pe-test/_shared/host-deps.mjs | resolveOne | L379-391 | 按包名统一尝试scoped与bare解析 |  |
| pe-test/_shared/host-preload.mjs | preloadError | L8-13 | （待补充） |  |
| pe-test/_shared/host-preload.mjs | isAbsolute | L15-18 | （待补充） |  |
| pe-test/_shared/host-preload.mjs | explicitInstallRoot | L20-47 | （待补充） |  |
| pe-test/_shared/session-finder.mjs | errorCodeOf | L13 | （待补充） |  |
| pe-test/_shared/session-finder.mjs | errorMessageOf | L14 | （待补充） |  |
| pe-test/_shared/session-finder.mjs | isMissingTarget | L15 | （待补充） |  |
| pe-test/_shared/session-finder.mjs | isAbsolute | L16 | （待补充） |  |
| pe-test/_shared/session-finder.mjs | pathKindOf | L17-20 | （待补充） |  |
| pe-test/_shared/session-finder.mjs | contextOf | L22-35 | （待补充） |  |
| pe-test/_shared/session-finder.mjs | hasHostRoot | L37 | （待补充） |  |
| pe-test/_shared/session-finder.mjs | readTarget | L38-41 | （待补充） |  |
| pe-test/_shared/session-finder.mjs | tryReadTarget | L42-44 | （待补充） |  |
| pe-test/_shared/session-finder.mjs | authorizedAnyPath | L45-58 | （待补充） |  |
| pe-test/_shared/session-finder.mjs | authorizedLogPath | L59-71 | （待补充） |  |
| pe-test/_shared/session-finder.mjs | authorizedSessionLogPath | L72-75 | （待补充） |  |
| pe-test/_shared/session-finder.mjs | authorizedSessionReadPath | L76-84 | （待补充） |  |
| pe-test/_shared/session-finder.mjs | logPath | L85-88 | 在目录中按v4、v3、旧名顺序寻找会话日志 |  |
| pe-test/_shared/session-finder.mjs | incompleteError | L92 | （待补充） |  |
| pe-test/_shared/session-finder.mjs | insideRealRoot | L93-96 | （待补充） |  |
| pe-test/_shared/session-finder.mjs | isLinkPath | L97-106 | （待补充） |  |
| pe-test/_shared/session-finder.mjs | normalize | L100 | （待补充） |  |
| pe-test/_shared/session-finder.mjs | validatedView | L107-112 | （待补充） |  |
| pe-test/_shared/session-finder.mjs | readDiscoveryHead | L113-177 | （待补充） |  |
| pe-test/_shared/session-finder.mjs | metaOf | L125-130 | （待补充） |  |
| pe-test/_shared/session-finder.mjs | processText | L131-153 | （待补充） |  |
| pe-test/_shared/session-finder.mjs | idVariants | L178 | （待补充） |  |
| pe-test/_shared/session-finder.mjs | sameId | L179 | （待补充） |  |
| pe-test/_shared/session-finder.mjs | byName | L180 | 按目录名或会话ID匹配候选 |  |
| pe-test/_shared/session-finder.mjs | directChildren | L181-202 | （待补充） |  |
| pe-test/_shared/session-finder.mjs | selectedGroup | L203-208 | （待补充） |  |
| pe-test/_shared/session-finder.mjs | explicitPathResult | L209-215 | （待补充） |  |
| pe-test/_shared/session-finder.mjs | looksLikePath | L216-220 | （待补充） |  |
| pe-test/_shared/session-finder.mjs | sessionRootTarget | L221-224 | （待补充） |  |
| pe-test/_shared/session-finder.mjs | exactIdResult | L225-248 | （待补充） |  |
| pe-test/_shared/session-finder.mjs | contextSelectionResult | L249-260 | （待补充） |  |
| pe-test/_shared/session-finder.mjs | findSession | L261-280 | 返回显式或自动会话定位结果及关联子会话 |  |
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
| pe-test/_shared/test-output.mjs | workspaceTarget | L116-119 | （待补充） |  |
| pe-test/_shared/test-output.mjs | workspacePathOf | L121-123 | （待补充） |  |
| pe-test/_shared/test-output.mjs | prepareOutputDirectory | L125-133 | （待补充） |  |
| pe-test/_shared/test-output.mjs | prepareOutputFile | L135-138 | （待补充） |  |
| pe-test/_shared/test-output.mjs | fileEvidence | L140-150 | 读取文件并计算bytes、lines、SHA-256 |  |
| pe-test/_shared/test-output.mjs | writeRawEvidence | L152-172 | 保存stdout、stderr并返回合并证据统计 |  |
| pe-test/_shared/test-output.mjs | sha256Text | L174-176 | 对文本返回SHA-256用于raw复核 |  |
| pe-test/_shared/v4-tool-result.mjs | isObject | L6 | 判定非空普通对象 |  |
| pe-test/_shared/v4-tool-result.mjs | isToolResultType | L8-10 | 判定事件是否为tool/result类型 |  |
| pe-test/_shared/v4-tool-result.mjs | isV4SessionFile | L12-14 | 判定路径是否为v4会话日志文件 |  |
| pe-test/_shared/v4-tool-result.mjs | v4LogPath | L16-20 | 返回目录中的v4日志路径或空值 |  |
| pe-test/_shared/v4-tool-result.mjs | toolResultOf | L22-28 | 从v4事件提取调用ID、错误标记和文本 |  |
| pe-test/_shared/workspace-paths.mjs | factoryError | L11-16 | （待补充） |  |
| pe-test/_shared/workspace-paths.mjs | isAbsolute | L18-22 | （待补充） |  |
| pe-test/_shared/workspace-paths.mjs | lexical | L24-35 | （待补充） |  |
| pe-test/_shared/workspace-paths.mjs | keyOf | L37-40 | （待补充） |  |
| pe-test/_shared/workspace-paths.mjs | within | L42-48 | （待补充） |  |
| pe-test/_shared/workspace-paths.mjs | requireAbsoluteRoot | L50-56 | （待补充） |  |
| pe-test/_shared/workspace-paths.mjs | assertExistingChain | L58-82 | （待补充） |  |
| pe-test/_shared/workspace-paths.mjs | repoRoot | L84-96 | （待补充） |  |
| pe-test/_shared/workspace-paths.mjs | fixtureLabel | L98-104 | （待补充） |  |
| pe-test/_shared/workspace-paths.mjs | getWorkspaceRoot | L106-108 | （待补充） |  |
| pe-test/_shared/workspace-paths.mjs | makeFixtureDir | L110-149 | （待补充） |  |
| pe-test/_shared/workspace-paths.mjs | cleanup | L138-141 | （待补充） |  |
| pe-test/_shared/workspace-paths.mjs | resolveEvidencePath | L151-162 | （待补充） |  |
| pe-test/_shared/workspace-paths.mjs | fixtureRootOf | L164-171 | （待补充） |  |
| pe-test/_shared/workspace-paths.mjs | createIsolatedEnv | L173-209 | （待补充） |  |
| pe-test/_shared/workspace-paths.mjs | isRecord | L222-224 | （待补充） |  |
| pe-test/_shared/workspace-paths.mjs | strictMaintenancePath | L226-230 | （待补充） |  |
| pe-test/_shared/workspace-paths.mjs | strictAbsoluteMaintenancePath | L232-235 | （待补充） |  |
| pe-test/_shared/workspace-paths.mjs | strictMaintenanceSegment | L237-243 | （待补充） |  |
| pe-test/_shared/workspace-paths.mjs | strictSessionScopePath | L245-249 | （待补充） |  |
| pe-test/_shared/workspace-paths.mjs | nextMaintenanceValue | L251-257 | （待补充） |  |
| pe-test/_shared/workspace-paths.mjs | markMaintenanceOption | L259-262 | （待补充） |  |
| pe-test/_shared/workspace-paths.mjs | sameStringArray | L264-266 | （待补充） |  |
| pe-test/_shared/workspace-paths.mjs | parseMaintenanceArgs | L268-374 | （待补充） |  |
| pe-test/_shared/workspace-paths.mjs | rejectOtherCategory | L376-378 | （待补充） |  |
| pe-test/_shared/workspace-paths.mjs | rejectUnknownKeys | L380-387 | （待补充） |  |
| pe-test/_shared/workspace-paths.mjs | contextOptionsOf | L389-410 | （待补充） |  |
| pe-test/_shared/workspace-paths.mjs | chooseContextValue | L412-417 | （待补充） |  |
| pe-test/_shared/workspace-paths.mjs | normalizeSessionOptions | L419-448 | （待补充） |  |
| pe-test/_shared/workspace-paths.mjs | normalizeLedgerOptions | L450-471 | （待补充） |  |
| pe-test/_shared/workspace-paths.mjs | normalizeRequestTrace | L473-479 | （待补充） |  |
| pe-test/_shared/workspace-paths.mjs | normalizeDomainArgv | L481-492 | （待补充） |  |
| pe-test/_shared/workspace-paths.mjs | policyTargetFor | L494-503 | （待补充） |  |
| pe-test/_shared/workspace-paths.mjs | targetView | L505-522 | （待补充） |  |
| pe-test/_shared/workspace-paths.mjs | targetForInput | L524-543 | （待补充） |  |
| pe-test/_shared/workspace-paths.mjs | createMaintenanceContext | L545-655 | （待补充） |  |
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
| plugins/dsh-extra-plan-qqbot/lib/heal.js | errorText | L61-63 | （待补充） |  |
| plugins/dsh-extra-plan-qqbot/lib/heal.js | isMissingError | L65-67 | （待补充） |  |
| plugins/dsh-extra-plan-qqbot/lib/heal.js | ownPackageRoot | L69-71 | （待补充） |  |
| plugins/dsh-extra-plan-qqbot/lib/heal.js | isLinkEntity | L73-77 | （待补充） |  |
| plugins/dsh-extra-plan-qqbot/lib/heal.js | createHostAccess | L79-88 | （待补充） |  |
| plugins/dsh-extra-plan-qqbot/lib/heal.js | hostPath | L90-92 | （待补充） |  |
| plugins/dsh-extra-plan-qqbot/lib/heal.js | readHostJson | L94-98 | （待补充） |  |
| plugins/dsh-extra-plan-qqbot/lib/heal.js | safeProfileName | L100-105 | （待补充） |  |
| plugins/dsh-extra-plan-qqbot/lib/heal.js | profilePath | L107-110 | （待补充） |  |
| plugins/dsh-extra-plan-qqbot/lib/heal.js | ownPluginEntry | L112-131 | （待补充） |  |
| plugins/dsh-extra-plan-qqbot/lib/heal.js | contextMember | L133-142 | （待补充） |  |
| plugins/dsh-extra-plan-qqbot/lib/heal.js | resolveRootProvider | L144-147 | （待补充） |  |
| plugins/dsh-extra-plan-qqbot/lib/heal.js | profileIdentityOf | L149-164 | （待补充） |  |
| plugins/dsh-extra-plan-qqbot/lib/heal.js | resolveQqbotHostRoot | L166-199 | （待补充） |  |
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
| plugins/dsh-extra-plan-qqbot/lib/heal.js | finish | L457-468 | （待补充） |  |
| plugins/dsh-extra-plan-qqbot/lib/heal.js | ensureDshExtraPlanLink | L533-590 | 建平铺 dsh-extra-plan → Web 包链接：web 缺失跳过/已正确不动/实体或非目标链接提示 pnpm 迁移/仅 ENOENT 建 junction |  |
| plugins/dsh-extra-plan-qqbot/lib/heal.js | healQqbotCompatibility | L596-654 | 按可选 profileNames 将 findOwnQqbotProfiles 结果缩小候选后，逐 profile 执行 healPatchRows（清旧错误块）与 ensureDshExtraPlanLink（建链），汇总 results/failed；整体异常只告警并返回 error，不阻断加载。 |  |
| plugins/dsh-extra-plan-qqbot/lib/path-policy.js | policyError | L13-18 | （待补充） |  |
| plugins/dsh-extra-plan-qqbot/lib/path-policy.js | isObject | L20-22 | （待补充） |  |
| plugins/dsh-extra-plan-qqbot/lib/path-policy.js | isOther | L24-26 | （待补充） |  |
| plugins/dsh-extra-plan-qqbot/lib/path-policy.js | rejectOther | L28-33 | （待补充） |  |
| plugins/dsh-extra-plan-qqbot/lib/path-policy.js | rejectOtherOptions | L35-40 | （待补充） |  |
| plugins/dsh-extra-plan-qqbot/lib/path-policy.js | isFullyQualifiedAbsolute | L42-45 | （待补充） |  |
| plugins/dsh-extra-plan-qqbot/lib/path-policy.js | rejectVariable | L47-57 | （待补充） |  |
| plugins/dsh-extra-plan-qqbot/lib/path-policy.js | lexicalPath | L59-73 | （待补充） |  |
| plugins/dsh-extra-plan-qqbot/lib/path-policy.js | rootPath | L75-82 | （待补充） |  |
| plugins/dsh-extra-plan-qqbot/lib/path-policy.js | keyOf | L84-87 | （待补充） |  |
| plugins/dsh-extra-plan-qqbot/lib/path-policy.js | samePath | L89-91 | （待补充） |  |
| plugins/dsh-extra-plan-qqbot/lib/path-policy.js | isWithin | L93-99 | （待补充） |  |
| plugins/dsh-extra-plan-qqbot/lib/path-policy.js | assertLexicalWithin | L101-105 | （待补充） |  |
| plugins/dsh-extra-plan-qqbot/lib/path-policy.js | readOnlyCapabilityForLogicalPath | L107-114 | （待补充） |  |
| plugins/dsh-extra-plan-qqbot/lib/path-policy.js | readOnlyCapabilityForRealPath | L116-125 | （待补充） |  |
| plugins/dsh-extra-plan-qqbot/lib/path-policy.js | rejectReadOnlyCapability | L127-129 | （待补充） |  |
| plugins/dsh-extra-plan-qqbot/lib/path-policy.js | purposeOf | L131-137 | （待补充） |  |
| plugins/dsh-extra-plan-qqbot/lib/path-policy.js | capabilityName | L139-145 | （待补充） |  |
| plugins/dsh-extra-plan-qqbot/lib/path-policy.js | normalizeCapabilities | L147-170 | （待补充） |  |
| plugins/dsh-extra-plan-qqbot/lib/path-policy.js | createPathContext | L172-190 | （待补充） |  |
| plugins/dsh-extra-plan-qqbot/lib/path-policy.js | ensureContext | L192-201 | （待补充） |  |
| plugins/dsh-extra-plan-qqbot/lib/path-policy.js | capabilityOf | L203-209 | （待补充） |  |
| plugins/dsh-extra-plan-qqbot/lib/path-policy.js | relativeInput | L211-217 | （待补充） |  |
| plugins/dsh-extra-plan-qqbot/lib/path-policy.js | makeTarget | L219-267 | （待补充） |  |
| plugins/dsh-extra-plan-qqbot/lib/path-policy.js | resolveWorkspacePath | L269-273 | （待补充） |  |
| plugins/dsh-extra-plan-qqbot/lib/path-policy.js | resolveHostPath | L275-279 | （待补充） |  |
| plugins/dsh-extra-plan-qqbot/lib/path-policy.js | targetInput | L281-305 | （待补充） |  |
| plugins/dsh-extra-plan-qqbot/lib/path-policy.js | assertAllowedPath | L307-314 | （待补充） |  |
| plugins/dsh-extra-plan-qqbot/lib/path-policy.js | isMissing | L316-318 | （待补充） |  |
| plugins/dsh-extra-plan-qqbot/lib/path-policy.js | sameOrChildReal | L320-322 | （待补充） |  |
| plugins/dsh-extra-plan-qqbot/lib/path-policy.js | physicalRoot | L324-339 | （待补充） |  |
| plugins/dsh-extra-plan-qqbot/lib/path-policy.js | inspectChain | L341-386 | （待补充） |  |
| plugins/dsh-extra-plan-qqbot/lib/path-policy.js | expectedType | L388-392 | （待补充） |  |
| plugins/dsh-extra-plan-qqbot/lib/path-policy.js | checkType | L394-398 | （待补充） |  |
| plugins/dsh-extra-plan-qqbot/lib/path-policy.js | validateReadTarget | L400-426 | （待补充） |  |
| plugins/dsh-extra-plan-qqbot/lib/path-policy.js | prepareWriteTarget | L428-461 | （待补充） |  |
| plugins/dsh-extra-plan-qqbot/scripts/heal.mjs | isLinkEntity | L12-16 | （待补充） |  |
| plugins/dsh-extra-plan-qqbot/scripts/heal.mjs | invokedAsMain | L18-23 | 主脚本判定（node 直跑时执行自愈；本仓插件 CLI 通用写法） |  |
| plugins/dsh-extra-plan-qqbot/scripts/heal.mjs | installFailure | L25-29 | 将严格安装失败原因与可选 detail 组装为 { error } 结构，供各失败分支统一返回。 |  |
| plugins/dsh-extra-plan-qqbot/scripts/heal.mjs | errorText | L31-33 | （待补充） |  |
| plugins/dsh-extra-plan-qqbot/scripts/heal.mjs | isMissingError | L35-37 | （待补充） |  |
| plugins/dsh-extra-plan-qqbot/scripts/heal.mjs | createInstallAccess | L39-43 | （待补充） |  |
| plugins/dsh-extra-plan-qqbot/scripts/heal.mjs | readInstallJson | L45-48 | （待补充） |  |
| plugins/dsh-extra-plan-qqbot/scripts/heal.mjs | strictInstall | L50-152 | --install 严格预检并收口：校验 Web 源、双锚点包根唯一匹配、目标实体与链；以 profileNames 限定自愈，要求 patch/link 成功态并复核最终 lstat/realpath，失败统一返回 error。 |  |
| plugins/dsh-extra-plan-qqbot/scripts/heal.mjs | reportInstallFailure | L154-157 | 将严格安装失败结构化 JSON 写入 stderr，并设置 process.exitCode=1。 |  |
| plugins/dsh-extra-plan-qqbot/scripts/heal.mjs | printHelp | L159-169 | （待补充） |  |
| plugins/dsh-extra-plan-qqbot/scripts/heal.mjs | parseArguments | L171-212 | （待补充） |  |
| plugins/dsh-extra-plan-qqbot/scripts/heal.mjs | setOnce | L174-178 | （待补充） |  |
| plugins/dsh-extra-plan-qqbot/scripts/heal.mjs | reportCliFailure | L214-219 | （待补充） |  |
| plugins/dsh-extra-plan-qqbot/scripts/heal.mjs | runDryRun | L221-233 | （待补充） |  |
| plugins/dsh-extra-plan/index.js | malformedRecovery | L206-240 | MALFORMED_RESPONSE 限次自愈：llm-retry 已给 {kind:'retry'} 原样透传（不叠加）；否则按 sessionId→Set('turn:step') 同回合只兜底 1 次（防死循环），注入 developer/message 中文提示（append 带 surfaceOp:'append'、纯文本禁带 headerSeq、source.kind 用生产者自有 plugin:dsh-extra-plan）并返回 {kind:'retry'}；**payload 须自带 ≥1 的 turn/step（宿主 append 不补坐标），坐标缺失/非正整数 → 跳过注入但仍返回 {kind:'retry'}**；aborted/无 agent/超次 → null 回退原 action 透传 |  |
| plugins/dsh-extra-plan/index.js | safeContextGet | L253-259 | （待补充） |  |
| plugins/dsh-extra-plan/index.js | absoluteRoot | L263-270 | （待补充） |  |
| plugins/dsh-extra-plan/index.js | profileIdentityOf | L272-283 | （待补充） |  |
| plugins/dsh-extra-plan/index.js | rootFact | L285-289 | （待补充） |  |
| plugins/dsh-extra-plan/index.js | sameRoot | L291-296 | （待补充） |  |
| plugins/dsh-extra-plan/index.js | configEditorServiceOf | L298-301 | （待补充） |  |
| plugins/dsh-extra-plan/index.js | documentFact | L303-307 | （待补充） |  |
| plugins/dsh-extra-plan/index.js | profileFactsOf | L309-374 | （待补充） |  |
| plugins/dsh-extra-plan/index.js | has | L311 | （待补充） |  |
| plugins/dsh-extra-plan/index.js | installAnchorOf | L376-378 | （待补充） |  |
| plugins/dsh-extra-plan/index.js | pathContextFor | L380-393 | （待补充） |  |
| plugins/dsh-extra-plan/index.js | resolveDocumentTargetFor | L395-403 | （待补充） |  |
| plugins/dsh-extra-plan/index.js | sessionCwdOf | L405-409 | （待补充） |  |
| plugins/dsh-extra-plan/index.js | resolveAbsoluteLogTarget | L411-417 | （待补充） |  |
| plugins/dsh-extra-plan/index.js | diagnosticTargetOf | L419-434 | （待补充） |  |
| plugins/dsh-extra-plan/index.js | prepareDiagnosticPath | L436-452 | （待补充） |  |
| plugins/dsh-extra-plan/index.js | appendDiagnostic | L454-459 | （待补充） |  |
| plugins/dsh-extra-plan/index.js | recordAgentError | L461-478 | agent/error 回合错误取证：把宿主回合/步骤级错误（payload {agent,turn,step,error}）逐字落盘到插件目录 extra-plan-agent-errors.jsonl，行 = {ts, sessionId, turn, step, chain}；整体吞错 + 一次性 warn 防刷屏；模块级函数经命名导出供回归冒烟直呼 | 与 recordRequestError 同诊断模式 |
| plugins/dsh-extra-plan/index.js | apply | L482-1189 | 插件主入口：第一步 createGateRuntime(cfg.gateWords)（缺失/非法同步抛错，早于任何工具/监听器/服务副作用）→ ctx.effect 在当前 agent scope 注册恰好 7 个 extra_plan_* prompt variable（provider 返回本次 apply 捕获值）→ 配置解析（含变量② bootstrapReadHint）/服务注册/工具注册/creativeMode 模型可见投影/锚点钩子（HP 首轮 tool:read text 用变量②覆盖）；planner 与非 planner child 双模型路由；会话状态按 sessionId 分桶与 agent/disposed 同步 final flush + 单会话回收；tool-jobs 通知由 `agent/inbox/claimed` 同步主入口与 `tools/pre-execute` durable snapshot fallback 共用 `consumeToolJobsNotice`，以 notice `message.id` 建立跨锚点基线，复用 jobId 的新 incarnation 仍可解锁 |  |
| plugins/dsh-extra-plan/index.js | getPathContext | L505 | （待补充） |  |
| plugins/dsh-extra-plan/index.js | resolveDocumentTarget | L515 | （待补充） |  |
| plugins/dsh-extra-plan/index.js | getPathContext | L516 | （待补充） |  |
| plugins/dsh-extra-plan/index.js | plannerModel | L529 | 热读箭头 getter：pro 规划默认模型（liveConfig.plannerModel；消费点=model-routing 的 getPlannerModel） |  |
| plugins/dsh-extra-plan/index.js | otherAgentModel | L530 | 热读箭头 getter：其他子代理默认模型（消费点=model-routing 的 getOtherAgentModel） |  |
| plugins/dsh-extra-plan/index.js | exploreBudget | L531 | 热读箭头 getter：pro 规划探查额度/单实例子调用上限（消费点=预算文案、noteRunCodeSubCall、plannerGateReason 与组判定） |  |
| plugins/dsh-extra-plan/index.js | plannerPromptSuffix | L532 | 热读箭头 getter：pre-step 拼接的额外引导后缀 |  |
| plugins/dsh-extra-plan/index.js | bootstrapOn | L533 | 热读箭头 getter：anchored 首轮引导开关（消费点=shouldHideCreativeCatalog 与 anchoredFirst 装配） |  |
| plugins/dsh-extra-plan/index.js | runcodeCatchGateOn | L534 | 热读箭头 getter：PTC try/catch 闸门开关（消费点=planner/只读 child/主会话三处组判定传参） |  |
| plugins/dsh-extra-plan/index.js | crossProviderPlannerModel | L535 | （待补充） |  |
| plugins/dsh-extra-plan/index.js | creativeModeOn | L538 | 热读箭头 getter：创造模式开关（liveConfig.creativeMode；消费点=shouldHideCreativeCatalog 与装配投影 hideCordis） |  |
| plugins/dsh-extra-plan/index.js | getAgents | L559 | 惰性返回 ctx.get('agents') 服务；注入 createAgentRuntime，供判定子会话是否为其父代理下的活跃派发。 |  |
| plugins/dsh-extra-plan/index.js | warn | L562 | 把告警参数原样转发到 console.warn；注入 createAgentRuntime，作为缺父代理等异常情况的告警出口。 |  |
| plugins/dsh-extra-plan/index.js | getPlannerModel | L570 | 返回热读配置 plannerModel（planner 子代理所用模型名）；注入 createModelRouting 供 planner 模型路由决议。 |  |
| plugins/dsh-extra-plan/index.js | getOtherAgentModel | L571 | 返回热读配置 otherAgentModel（非 planner 子代理所用模型名，空串表示不覆盖）；供非 planner 路由决议。 |  |
| plugins/dsh-extra-plan/index.js | getCrossProviderPlannerModel | L572 | 返回热读布尔开关 crossProviderPlannerModel；决定 planner 路由走跨 provider 严格探针还是旧单 provider 路径。 |  |
| plugins/dsh-extra-plan/index.js | getLlm | L573 | 返回 ctx.get('llm') 服务；供 model-routing 查 provider 模型目录（listModels）与真实探针调用。 |  |
| plugins/dsh-extra-plan/index.js | getAgents | L574 | 返回 ctx.get('agents') 服务（同名第 2 处，消费方为 model-routing）；供经 agents.get 回溯父会话链的 provider/model/maxTokens。 |  |
| plugins/dsh-extra-plan/index.js | getDiagPath | L575 | 返回诊断文件路径 diagPath（取自 cfg.diagFile，缺省为插件目录下 extra-plan-request-errors.jsonl）；供追加 planner 降级诊断行。 |  |
| plugins/dsh-extra-plan/index.js | noteRunCodeSubCall | L602 | 单实例子调用上限（planner）：按 sessionId→rootCallId 桶读计数、未超限则 +1；返回拒绝文案或 null；空 rootCallId 与 exploreBudget 文案保持 |  |
| plugins/dsh-extra-plan/index.js | consumeToolJobsNotice | L603-636 | 统一幂等 tool-jobs notice 消费：校验 session/message/非空 message.id/source/content 与 `/background job (\S+)/`；session 内以 message.id 判重，同 id 跨 claimed/durable 幂等，不同 id 即使复用 jobId 也算新通知；首次有效通知按 session 精确删除 jobId 对应的 job_output 键、清空 pollGuard 整表，双解锁后写 notice-id；坏输入与重复通知返回 false 且零 Map 副作用，锚点不删除 notice-id Set | `agent/inbox/claimed` 同步主入口与 `tools/pre-execute` durable user/message fallback 共用；Set 由 disposeSession 按 session 回收，不查询 job running/terminal 状态 |
| plugins/dsh-extra-plan/index.js | shouldHideCreativeCatalog | L666-673 | HP1 判定：C=1、A=1、F、main/planner、M=ptc 时暂隐两个创造 skill |  |
| plugins/dsh-extra-plan/index.js | isAnchoredContextGate | L677-682 | 判定当前 agent 是否满足 anchored context gate：bootstrap 开启、Session 仍处 F，且角色为 main 或 planner（非 live child） | 只读 payload.agent；角色沿现有 isPlannerChild/isChild 语义，不使用 selfAgent 或父 Session 相位 |
| plugins/dsh-extra-plan/index.js | warnPreStepFailure | L684-688 | pre-step 可降级 C 投影/去重异常的一次性告警 helper；返回路径仍保留已经完成的 source 过滤副本，并保证 next 只调用一次 | 不得在关键 source gate/phase 失败时吞错后发送未过滤 decision |
| plugins/dsh-extra-plan/index.js | recordRequestError | L757-777 | 记录 agent/request-error 失败诊断到插件目录 extra-plan-request-errors.jsonl（diagPath 可经 cfg.diagFile 覆盖；行含 turn/step/provider/message/code/causeChain） |  |
| plugins/dsh-extra-plan/lib/agent-runtime.js | isLiveDelegation | L10-21 | 按父会话 registry 存活状态判定委托是否仍有效 |  |
| plugins/dsh-extra-plan/lib/agent-runtime.js | childPolicyNeedsFloor | L24-29 | 判定 read-only（只读） 子代理是否需要 workspace-write floor |  |
| plugins/dsh-extra-plan/lib/agent-runtime.js | createAgentRuntime | L31-153 | 创建 per-apply 角色/缓存/usage baseline 工厂 |  |
| plugins/dsh-extra-plan/lib/agent-runtime.js | isChild | L38-46 | 按显式 events 判定 live child 并发出恢复为 root 警示 |  |
| plugins/dsh-extra-plan/lib/agent-runtime.js | isPlannerChild | L51-59 | 每次按当前 Agent 的 header.agentPreset 与 isSubagentChild 判定 planner 子会话；不共享跨 Agent 的预设名布尔缓存，缺失必要信息返回 false。 |  |
| plugins/dsh-extra-plan/lib/agent-runtime.js | usageRootOf | L61-92 | 沿最多 8 层 parentSession 回溯 rootSessionId；断链、循环或异常返回空 rootSessionId，由 usageContextOf 保持合法上下文落账，不伪造根会话。 | createAgentRuntime 内部闭包。 |
| plugins/dsh-extra-plan/lib/agent-runtime.js | usageContextOf | L94-114 | 按 Agent 缓存 session/parent/root ID、preset、depth 与精确 usage role；主会话 root 为自身，断链/循环 child 的 rootSessionId 为空但仍是合法 context，rootSessionId/agentPreset 可空。 | createAgentRuntime 内部 WeakMap 闭包。 |
| plugins/dsh-extra-plan/lib/agent-runtime.js | toolSchemasOf | L117-135 | 防御式读取 agent scoped tools.schemas，失败/非数组返回 undefined |  |
| plugins/dsh-extra-plan/lib/agent-runtime.js | floorChildPolicy | L137-141 | 为 read-only（只读） child 同步追加 workspace-write sandbox 事件 |  |
| plugins/dsh-extra-plan/lib/agent-runtime.js | childBaseline | L144-150 | 同步解析 main/四角色/未知 child 的 usage context，fold usage 并应用 child sandbox floor。 | createAgentRuntime 内部闭包。 |
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
| plugins/dsh-extra-plan/lib/assembly-presentation.js | errorWithCause | L154-158 | （待补充） |  |
| plugins/dsh-extra-plan/lib/assembly-presentation.js | assertInstallAnchor | L160-175 | （待补充） |  |
| plugins/dsh-extra-plan/lib/assembly-presentation.js | dshToolsEntryCandidates | L177-184 | （待补充） |  |
| plugins/dsh-extra-plan/lib/assembly-presentation.js | loadSdkRendererModule | L187-207 | （待补充） |  |
| plugins/dsh-extra-plan/lib/assembly-presentation.js | pending | L191-205 | （待补充） |  |
| plugins/dsh-extra-plan/lib/assembly-presentation.js | resolveToolsSdkRenderer | L210-215 | （待补充） |  |
| plugins/dsh-extra-plan/lib/assembly-presentation.js | renderFilteredToolsSdk | L218-221 | （待补充） |  |
| plugins/dsh-extra-plan/lib/assembly-presentation.js | toolRegistryOf | L223-231 | （待补充） |  |
| plugins/dsh-extra-plan/lib/assembly-presentation.js | toolSdkSchemasOf | L233-251 | （待补充） |  |
| plugins/dsh-extra-plan/lib/assembly-presentation.js | toolPresentationModeOf | L253-262 | （待补充） |  |
| plugins/dsh-extra-plan/lib/client-carrier.js | apply | L5-7 | （待补充） |  |
| plugins/dsh-extra-plan/lib/client.js | factory | L3-320 | （待补充） |  |
| plugins/dsh-extra-plan/lib/client.js | apply | L112-315 | （待补充） |  |
| plugins/dsh-extra-plan/lib/client.js | useSharedConfigForm | L125-136 | （待补充） |  |
| plugins/dsh-extra-plan/lib/client.js | update | L128 | （待补充） |  |
| plugins/dsh-extra-plan/lib/client.js | mutate | L134 | （待补充） |  |
| plugins/dsh-extra-plan/lib/client.js | optionLabel | L138-143 | （待补充） |  |
| plugins/dsh-extra-plan/lib/client.js | optionValue | L145-149 | （待补充） |  |
| plugins/dsh-extra-plan/lib/client.js | renderControl | L151-176 | （待补充） |  |
| plugins/dsh-extra-plan/lib/client.js | onChange | L155 | （待补充） |  |
| plugins/dsh-extra-plan/lib/client.js | onChange | L162 | （待补充） |  |
| plugins/dsh-extra-plan/lib/client.js | onChange | L167 | （待补充） |  |
| plugins/dsh-extra-plan/lib/client.js | onChange | L174 | （待补充） |  |
| plugins/dsh-extra-plan/lib/client.js | ExtraPlanForm | L178-271 | （待补充） |  |
| plugins/dsh-extra-plan/lib/client.js | fieldValue | L201-208 | （待补充） |  |
| plugins/dsh-extra-plan/lib/client.js | saveAll | L210-235 | （待补充） |  |
| plugins/dsh-extra-plan/lib/client.js | renderField | L237-246 | （待补充） |  |
| plugins/dsh-extra-plan/lib/client.js | SettingsCard | L273-281 | （待补充） |  |
| plugins/dsh-extra-plan/lib/client.js | hasBundleConfigEntry | L283-290 | （待补充） |  |
| plugins/dsh-extra-plan/lib/client.js | DetailSettingsSection | L292-298 | （待补充） |  |
| plugins/dsh-extra-plan/lib/client.js | safeInject | L300-302 | （待补充） |  |
| plugins/dsh-extra-plan/lib/client.js | registerClientSurfaces | L304-311 | （待补充） |  |
| plugins/dsh-extra-plan/lib/gate-decisions.js | isDispatchStart | L9 | （待补充） |  |
| plugins/dsh-extra-plan/lib/gate-decisions.js | isDispatch | L10 | （待补充） |  |
| plugins/dsh-extra-plan/lib/gate-decisions.js | purposeRouteDenyReason | L12-14 | （待补充） |  |
| plugins/dsh-extra-plan/lib/gate-decisions.js | routeDenyReason | L17-22 | （待补充） |  |
| plugins/dsh-extra-plan/lib/gate-decisions.js | planDenyReason | L23-34 | （待补充） |  |
| plugins/dsh-extra-plan/lib/gate-decisions.js | approvalDenyReason | L35-37 | （待补充） |  |
| plugins/dsh-extra-plan/lib/gate-decisions.js | filterBootstrapContextDecision | L57-64 | （待补充） |  |
| plugins/dsh-extra-plan/lib/gate-decisions.js | projectedSkillCatalogSignature | L66-74 | （待补充） |  |
| plugins/dsh-extra-plan/lib/gate-decisions.js | jsonShapeSignature | L76-108 | （待补充） |  |
| plugins/dsh-extra-plan/lib/gate-decisions.js | projectedAgentInstructionsSignature | L110-114 | （待补充） |  |
| plugins/dsh-extra-plan/lib/gate-decisions.js | projectedContextSignature | L116-123 | （待补充） |  |
| plugins/dsh-extra-plan/lib/gate-decisions.js | dedupeProjectedContextDecision | L125-146 | （待补充） |  |
| plugins/dsh-extra-plan/lib/gate-decisions.js | isBootstrapPhase | L147-157 | （待补充） |  |
| plugins/dsh-extra-plan/lib/gate-decisions.js | labelsOfCallData | L164-180 | （待补充） |  |
| plugins/dsh-extra-plan/lib/gate-decisions.js | isExactGateSet | L192-199 | （待补充） |  |
| plugins/dsh-extra-plan/lib/gate-decisions.js | isPartialGateSet | L202-210 | （待补充） |  |
| plugins/dsh-extra-plan/lib/gate-decisions.js | categorizeGateAsk | L213-217 | （待补充） |  |
| plugins/dsh-extra-plan/lib/gate-decisions.js | gateAskDenyReason | L220-256 | （待补充） |  |
| plugins/dsh-extra-plan/lib/gate-decisions.js | validateGateAskStructure | L262-289 | （待补充） |  |
| plugins/dsh-extra-plan/lib/gate-decisions.js | askKindOf | L296-313 | （待补充） |  |
| plugins/dsh-extra-plan/lib/gate-decisions.js | askKindOfRelaxed | L320-336 | （待补充） |  |
| plugins/dsh-extra-plan/lib/gate-decisions.js | matchExactKind | L341-349 | （待补充） |  |
| plugins/dsh-extra-plan/lib/gate-decisions.js | matchRouteLabel | L351-358 | （待补充） |  |
| plugins/dsh-extra-plan/lib/gate-decisions.js | matchApprovalLabel | L360-367 | （待补充） |  |
| plugins/dsh-extra-plan/lib/gate-decisions.js | matchPurposeLabel | L369-374 | （待补充） |  |
| plugins/dsh-extra-plan/lib/gate-decisions.js | firstTextOfBlocks | L377-383 | （待补充） |  |
| plugins/dsh-extra-plan/lib/gate-decisions.js | askResultTextIsDenied | L388-390 | （待补充） |  |
| plugins/dsh-extra-plan/lib/gate-decisions.js | parseAskResultData | L397-434 | （待补充） |  |
| plugins/dsh-extra-plan/lib/gate-decisions.js | parseDispatchAskResult | L443-471 | （待补充） |  |
| plugins/dsh-extra-plan/lib/gate-decisions.js | resetStageState | L473-477 | （待补充） |  |
| plugins/dsh-extra-plan/lib/gate-decisions.js | resetRouteState | L479-482 | （待补充） |  |
| plugins/dsh-extra-plan/lib/gate-decisions.js | applyAskOutcome | L484-514 | （待补充） |  |
| plugins/dsh-extra-plan/lib/gate-decisions.js | deriveFlowState | L524-568 | （待补充） |  |
| plugins/dsh-extra-plan/lib/gate-decisions.js | catalogHasWriteTools | L580-585 | （待补充） |  |
| plugins/dsh-extra-plan/lib/gate-decisions.js | isReadOnlyChildByCatalog | L588-590 | （待补充） |  |
| plugins/dsh-extra-plan/lib/gate-decisions.js | schemasHasWriteTools | L595-600 | （待补充） |  |
| plugins/dsh-extra-plan/lib/gate-decisions.js | schemasHasTool | L604-609 | （待补充） |  |
| plugins/dsh-extra-plan/lib/gate-decisions.js | catalogIsCollapsed | L616-621 | （待补充） |  |
| plugins/dsh-extra-plan/lib/gate-decisions.js | subagentProbeGateReason | L627-639 | （待补充） |  |
| plugins/dsh-extra-plan/lib/gate-decisions.js | withShellEvidence | L645-649 | （待补充） |  |
| plugins/dsh-extra-plan/lib/gate-decisions.js | shellMutationReason | L651-667 | （待补充） |  |
| plugins/dsh-extra-plan/lib/gate-decisions.js | childControlGateReason | L670-674 | 仅允许 main 使用 `send_message`/`interrupt_agent`；child 直呼统一返回硬拒文案，供 planner/只读 child/执行者/unknown child 与 run_code 组判定复用。 | 纯函数；mainGateReason 不经此拒绝。 |
| plugins/dsh-extra-plan/lib/gate-decisions.js | plannerGateReason | L678-694 | （待补充） |  |
| plugins/dsh-extra-plan/lib/gate-decisions.js | childReadonlyGateReason | L698-708 | （待补充） |  |
| plugins/dsh-extra-plan/lib/gate-decisions.js | jobOutputGateReason | L713-735 | （待补充） |  |
| plugins/dsh-extra-plan/lib/gate-decisions.js | recordJobOutputCall | L741-753 | （待补充） |  |
| plugins/dsh-extra-plan/lib/gate-decisions.js | pollGuardGateReason | L759-772 | （待补充） |  |
| plugins/dsh-extra-plan/lib/gate-decisions.js | recordPollGuardCall | L774-785 | （待补充） |  |
| plugins/dsh-extra-plan/lib/gate-decisions.js | probeDisposalWarning | L793-796 | （待补充） |  |
| plugins/dsh-extra-plan/lib/gate-decisions.js | mainGateReason | L806-935 | （待补充） |  |
| plugins/dsh-extra-plan/lib/gate-decisions.js | runCodeGroupDenyReason | L947-1031 | （待补充） |  |
| plugins/dsh-extra-plan/lib/gate-decisions.js | visit | L965-1008 | （待补充） |  |
| plugins/dsh-extra-plan/lib/gate-decisions.js | aggregateRunCodeDenyReason | L1037-1049 | （待补充） |  |
| plugins/dsh-extra-plan/lib/gate-words.js | fail | L31-33 | （待补充） |  |
| plugins/dsh-extra-plan/lib/gate-words.js | normalizeGateLabel | L36-38 | （待补充） |  |
| plugins/dsh-extra-plan/lib/gate-words.js | validateGateWords | L44-71 | （待补充） |  |
| plugins/dsh-extra-plan/lib/gate-words.js | bracketed | L73-75 | （待补充） |  |
| plugins/dsh-extra-plan/lib/gate-words.js | createGateRuntime | L85-114 | （待补充） |  |
| plugins/dsh-extra-plan/lib/live-config.js | textOf | L33-35 | （待补充） |  |
| plugins/dsh-extra-plan/lib/live-config.js | envConfigPath | L37-39 | （待补充） |  |
| plugins/dsh-extra-plan/lib/live-config.js | errorText | L41-43 | （待补充） |  |
| plugins/dsh-extra-plan/lib/live-config.js | sameAbsolutePath | L45-49 | （待补充） |  |
| plugins/dsh-extra-plan/lib/live-config.js | exactHostCapabilities | L51-61 | （待补充） |  |
| plugins/dsh-extra-plan/lib/live-config.js | rank | L58 | （待补充） |  |
| plugins/dsh-extra-plan/lib/live-config.js | exactHostTarget | L63-67 | （待补充） |  |
| plugins/dsh-extra-plan/lib/live-config.js | resolveAbsoluteTarget | L69-78 | （待补充） |  |
| plugins/dsh-extra-plan/lib/live-config.js | contextFrom | L80-87 | （待补充） |  |
| plugins/dsh-extra-plan/lib/live-config.js | targetFromValue | L89-101 | （待补充） |  |
| plugins/dsh-extra-plan/lib/live-config.js | targetOf | L103-108 | （待补充） |  |
| plugins/dsh-extra-plan/lib/live-config.js | statStamp | L110-125 | （待补充） |  |
| plugins/dsh-extra-plan/lib/live-config.js | pick | L127-131 | （待补充） |  |
| plugins/dsh-extra-plan/lib/live-config.js | describeProblems | L133-135 | （待补充） |  |
| plugins/dsh-extra-plan/lib/live-config.js | normalizedFallback | L137-142 | （待补充） |  |
| plugins/dsh-extra-plan/lib/live-config.js | createLiveConfig | L152-288 | （待补充） |  |
| plugins/dsh-extra-plan/lib/live-config.js | warnOnce | L165-169 | （待补充） |  |
| plugins/dsh-extra-plan/lib/live-config.js | currentResolved | L171-188 | （待补充） |  |
| plugins/dsh-extra-plan/lib/live-config.js | currentContext | L190-192 | （待补充） |  |
| plugins/dsh-extra-plan/lib/live-config.js | readDiskValues | L194-216 | （待补充） |  |
| plugins/dsh-extra-plan/lib/live-config.js | refresh | L235-269 | （待补充） |  |
| plugins/dsh-extra-plan/lib/live-config.js | read | L271-274 | （待补充） |  |
| plugins/dsh-extra-plan/lib/live-config.js | get | L277 | （待补充） |  |
| plugins/dsh-extra-plan/lib/live-config.js | anchoredBootstrap | L278 | （待补充） |  |
| plugins/dsh-extra-plan/lib/live-config.js | creativeMode | L279 | （待补充） |  |
| plugins/dsh-extra-plan/lib/live-config.js | runcodeCatchGate | L280 | （待补充） |  |
| plugins/dsh-extra-plan/lib/live-config.js | crossProviderPlannerModel | L281 | （待补充） |  |
| plugins/dsh-extra-plan/lib/live-config.js | plannerModel | L282 | （待补充） |  |
| plugins/dsh-extra-plan/lib/live-config.js | plannerPromptSuffix | L283 | （待补充） |  |
| plugins/dsh-extra-plan/lib/live-config.js | exploreBudget | L284 | （待补充） |  |
| plugins/dsh-extra-plan/lib/live-config.js | otherAgentModel | L285 | （待补充） |  |
| plugins/dsh-extra-plan/lib/model-routing.js | isExplicitRoute | L11-17 | （待补充） |  |
| plugins/dsh-extra-plan/lib/model-routing.js | isExplicitEffort | L21-23 | （待补充） |  |
| plugins/dsh-extra-plan/lib/model-routing.js | requestConfigSnapshot | L33-46 | （待补充） |  |
| plugins/dsh-extra-plan/lib/model-routing.js | agentFromRegistry | L48-51 | （待补充） |  |
| plugins/dsh-extra-plan/lib/model-routing.js | resolveAgentRouteSources | L54-79 | （待补充） |  |
| plugins/dsh-extra-plan/lib/model-routing.js | decidePlannerModelUse | L101-114 | （待补充） |  |
| plugins/dsh-extra-plan/lib/model-routing.js | routeKey | L125-127 | （待补充） |  |
| plugins/dsh-extra-plan/lib/model-routing.js | comparePlannerText | L129-133 | （待补充） |  |
| plugins/dsh-extra-plan/lib/model-routing.js | plannerProviderRank | L135-139 | （待补充） |  |
| plugins/dsh-extra-plan/lib/model-routing.js | sortPlannerCandidates | L141-152 | （待补充） |  |
| plugins/dsh-extra-plan/lib/model-routing.js | createModelRouting | L157-511 | （待补充） |  |
| plugins/dsh-extra-plan/lib/model-routing.js | plannerAbortError | L165-168 | （待补充） |  |
| plugins/dsh-extra-plan/lib/model-routing.js | withPlannerProbeDeadline | L172-205 | （待补充） |  |
| plugins/dsh-extra-plan/lib/model-routing.js | probePlannerRoute | L209-251 | （待补充） |  |
| plugins/dsh-extra-plan/lib/model-routing.js | probePlannerCandidates | L258-274 | （待补充） |  |
| plugins/dsh-extra-plan/lib/model-routing.js | worker | L261-268 | （待补充） |  |
| plugins/dsh-extra-plan/lib/model-routing.js | uniqueProviderCandidates | L276-285 | （待补充） |  |
| plugins/dsh-extra-plan/lib/model-routing.js | collectStrictProbeCandidates | L288-308 | （待补充） |  |
| plugins/dsh-extra-plan/lib/model-routing.js | resolvePlannerEntryLegacy | L311-369 | （待补充） |  |
| plugins/dsh-extra-plan/lib/model-routing.js | resolvePlannerEntryStrict | L372-417 | （待补充） |  |
| plugins/dsh-extra-plan/lib/model-routing.js | resolvePlannerEntry | L421-430 | （待补充） |  |
| plugins/dsh-extra-plan/lib/model-routing.js | nonPlannerRouteSources | L434-438 | （待补充） |  |
| plugins/dsh-extra-plan/lib/model-routing.js | nonPlannerFallbackEntry | L440-448 | （待补充） |  |
| plugins/dsh-extra-plan/lib/model-routing.js | resolveOtherAgentEntryLegacy | L451-468 | （待补充） |  |
| plugins/dsh-extra-plan/lib/model-routing.js | resolveOtherAgentEntryStrict | L472-497 | （待补充） |  |
| plugins/dsh-extra-plan/lib/model-routing.js | resolveOtherAgentEntry | L500-509 | （待补充） |  |
| plugins/dsh-extra-plan/lib/path-policy.js | policyError | L13-18 | （待补充） |  |
| plugins/dsh-extra-plan/lib/path-policy.js | isObject | L20-22 | （待补充） |  |
| plugins/dsh-extra-plan/lib/path-policy.js | isOther | L24-26 | （待补充） |  |
| plugins/dsh-extra-plan/lib/path-policy.js | rejectOther | L28-33 | （待补充） |  |
| plugins/dsh-extra-plan/lib/path-policy.js | rejectOtherOptions | L35-40 | （待补充） |  |
| plugins/dsh-extra-plan/lib/path-policy.js | isFullyQualifiedAbsolute | L42-45 | （待补充） |  |
| plugins/dsh-extra-plan/lib/path-policy.js | rejectVariable | L47-57 | （待补充） |  |
| plugins/dsh-extra-plan/lib/path-policy.js | lexicalPath | L59-73 | （待补充） |  |
| plugins/dsh-extra-plan/lib/path-policy.js | rootPath | L75-82 | （待补充） |  |
| plugins/dsh-extra-plan/lib/path-policy.js | keyOf | L84-87 | （待补充） |  |
| plugins/dsh-extra-plan/lib/path-policy.js | samePath | L89-91 | （待补充） |  |
| plugins/dsh-extra-plan/lib/path-policy.js | isWithin | L93-99 | （待补充） |  |
| plugins/dsh-extra-plan/lib/path-policy.js | assertLexicalWithin | L101-105 | （待补充） |  |
| plugins/dsh-extra-plan/lib/path-policy.js | readOnlyCapabilityForLogicalPath | L107-114 | （待补充） |  |
| plugins/dsh-extra-plan/lib/path-policy.js | readOnlyCapabilityForRealPath | L116-125 | （待补充） |  |
| plugins/dsh-extra-plan/lib/path-policy.js | rejectReadOnlyCapability | L127-129 | （待补充） |  |
| plugins/dsh-extra-plan/lib/path-policy.js | purposeOf | L131-137 | （待补充） |  |
| plugins/dsh-extra-plan/lib/path-policy.js | capabilityName | L139-145 | （待补充） |  |
| plugins/dsh-extra-plan/lib/path-policy.js | normalizeCapabilities | L147-170 | （待补充） |  |
| plugins/dsh-extra-plan/lib/path-policy.js | createPathContext | L172-190 | （待补充） |  |
| plugins/dsh-extra-plan/lib/path-policy.js | ensureContext | L192-201 | （待补充） |  |
| plugins/dsh-extra-plan/lib/path-policy.js | capabilityOf | L203-209 | （待补充） |  |
| plugins/dsh-extra-plan/lib/path-policy.js | relativeInput | L211-217 | （待补充） |  |
| plugins/dsh-extra-plan/lib/path-policy.js | makeTarget | L219-267 | （待补充） |  |
| plugins/dsh-extra-plan/lib/path-policy.js | resolveWorkspacePath | L269-273 | （待补充） |  |
| plugins/dsh-extra-plan/lib/path-policy.js | resolveHostPath | L275-279 | （待补充） |  |
| plugins/dsh-extra-plan/lib/path-policy.js | targetInput | L281-305 | （待补充） |  |
| plugins/dsh-extra-plan/lib/path-policy.js | assertAllowedPath | L307-314 | （待补充） |  |
| plugins/dsh-extra-plan/lib/path-policy.js | isMissing | L316-318 | （待补充） |  |
| plugins/dsh-extra-plan/lib/path-policy.js | sameOrChildReal | L320-322 | （待补充） |  |
| plugins/dsh-extra-plan/lib/path-policy.js | physicalRoot | L324-339 | （待补充） |  |
| plugins/dsh-extra-plan/lib/path-policy.js | inspectChain | L341-386 | （待补充） |  |
| plugins/dsh-extra-plan/lib/path-policy.js | expectedType | L388-392 | （待补充） |  |
| plugins/dsh-extra-plan/lib/path-policy.js | checkType | L394-398 | （待补充） |  |
| plugins/dsh-extra-plan/lib/path-policy.js | validateReadTarget | L400-426 | （待补充） |  |
| plugins/dsh-extra-plan/lib/path-policy.js | prepareWriteTarget | L428-461 | （待补充） |  |
| plugins/dsh-extra-plan/lib/planner-budget.js | toolCallCount | L11-40 | （待补充） |  |
| plugins/dsh-extra-plan/lib/planner-budget.js | toolCallsSinceUser | L43-55 | （待补充） |  |
| plugins/dsh-extra-plan/lib/planner-budget.js | appendSuffixBlock | L57-74 | （待补充） |  |
| plugins/dsh-extra-plan/lib/planner-budget.js | withPlannerPromptSuffix | L76-83 | （待补充） |  |
| plugins/dsh-extra-plan/lib/planner-budget.js | budgetNoticeText | L88-90 | （待补充） |  |
| plugins/dsh-extra-plan/lib/planner-budget.js | withBudgetNotice | L92 | （待补充） |  |
| plugins/dsh-extra-plan/lib/planner-budget.js | budgetReminderText | L94-98 | （待补充） |  |
| plugins/dsh-extra-plan/lib/planner-budget.js | budgetReminderMessage | L105-107 | （待补充） |  |
| plugins/dsh-extra-plan/lib/planner-budget.js | budgetReminderSent | L109-129 | （待补充） |  |
| plugins/dsh-extra-plan/lib/planner-budget.js | budgetExhaustedReason | L131-133 | （待补充） |  |
| plugins/dsh-extra-plan/lib/planner-budget.js | budgetExceeded | L135-137 | （待补充） |  |
| plugins/dsh-extra-plan/lib/preset-sync.js | errorWithCause | L37-41 | （待补充） |  |
| plugins/dsh-extra-plan/lib/preset-sync.js | assertInstallAnchor | L43-58 | （待补充） |  |
| plugins/dsh-extra-plan/lib/preset-sync.js | loadOfficialAgentPreset | L60-74 | （待补充） |  |
| plugins/dsh-extra-plan/lib/preset-sync.js | assetReadTarget | L101-107 | （待补充） |  |
| plugins/dsh-extra-plan/lib/preset-sync.js | readAssetBytes | L109-118 | （待补充） |  |
| plugins/dsh-extra-plan/lib/preset-sync.js | resourceReadTarget | L120-134 | （待补充） |  |
| plugins/dsh-extra-plan/lib/preset-sync.js | readResourceBytes | L136-143 | （待补充） |  |
| plugins/dsh-extra-plan/lib/preset-sync.js | contentHash | L145-162 | （待补充） |  |
| plugins/dsh-extra-plan/lib/preset-sync.js | pluginRows | L165-177 | （待补充） |  |
| plugins/dsh-extra-plan/lib/preset-sync.js | visit | L167-174 | （待补充） |  |
| plugins/dsh-extra-plan/lib/preset-sync.js | pluginRowIds | L179-181 | （待补充） |  |
| plugins/dsh-extra-plan/lib/preset-sync.js | declarationCoversAsset | L183-187 | （待补充） |  |
| plugins/dsh-extra-plan/lib/preset-sync.js | plainObject | L189-191 | （待补充） |  |
| plugins/dsh-extra-plan/lib/preset-sync.js | userWritableByRow | L193-209 | （待补充） |  |
| plugins/dsh-extra-plan/lib/preset-sync.js | push | L195-202 | （待补充） |  |
| plugins/dsh-extra-plan/lib/preset-sync.js | stripUserWritable | L211-222 | （待补充） |  |
| plugins/dsh-extra-plan/lib/preset-sync.js | declarationBodyMatchesAsset | L224-227 | （待补充） |  |
| plugins/dsh-extra-plan/lib/preset-sync.js | carryUserWritable | L229-253 | （待补充） |  |
| plugins/dsh-extra-plan/lib/preset-sync.js | effectiveRowConfig | L255-266 | （待补充） |  |
| plugins/dsh-extra-plan/lib/preset-sync.js | readAuthoritySettings | L268-291 | （待补充） |  |
| plugins/dsh-extra-plan/lib/preset-sync.js | findRowsById | L294-309 | （待补充） |  |
| plugins/dsh-extra-plan/lib/preset-sync.js | visit | L297-306 | （待补充） |  |
| plugins/dsh-extra-plan/lib/preset-sync.js | validDefinitionValue | L311-313 | （待补充） |  |
| plugins/dsh-extra-plan/lib/preset-sync.js | captureLegacyValues | L315-338 | （待补充） |  |
| plugins/dsh-extra-plan/lib/preset-sync.js | validGateWordsOrUndefined | L340-342 | （待补充） |  |
| plugins/dsh-extra-plan/lib/preset-sync.js | legacyStateFromPlugins | L344-358 | （待补充） |  |
| plugins/dsh-extra-plan/lib/preset-sync.js | readLegacyState | L361-415 | （待补充） |  |
| plugins/dsh-extra-plan/lib/preset-sync.js | resolveUnifiedConfig | L418-486 | （待补充） |  |
| plugins/dsh-extra-plan/lib/preset-sync.js | restateSettingsConfig | L488-513 | （待补充） |  |
| plugins/dsh-extra-plan/lib/preset-sync.js | assertPresetDefinition | L517-531 | （待补充） |  |
| plugins/dsh-extra-plan/lib/preset-sync.js | parsePresetDefinition | L533-535 | （待补充） |  |
| plugins/dsh-extra-plan/lib/preset-sync.js | assetDefinition | L537-539 | （待补充） |  |
| plugins/dsh-extra-plan/lib/preset-sync.js | assertRoleDefinition | L542-554 | （待补充） |  |
| plugins/dsh-extra-plan/lib/preset-sync.js | roleDefinitionOf | L556-561 | （待补充） |  |
| plugins/dsh-extra-plan/lib/preset-sync.js | assetDefinitions | L564-566 | （待补充） |  |
| plugins/dsh-extra-plan/lib/preset-sync.js | roleDefinitionsWithPresentation | L574-596 | （待补充） |  |
| plugins/dsh-extra-plan/lib/preset-sync.js | assetPlugins | L598-600 | （待补充） |  |
| plugins/dsh-extra-plan/lib/preset-sync.js | readDefinitionGateWords | L602-606 | （待补充） |  |
| plugins/dsh-extra-plan/lib/preset-sync.js | projectHostRow | L614-621 | （待补充） |  |
| plugins/dsh-extra-plan/lib/preset-sync.js | cloneDefinitionWithProjection | L623-635 | （待补充） |  |
| plugins/dsh-extra-plan/lib/preset-sync.js | definitionWithProjection | L637-639 | （待补充） |  |
| plugins/dsh-extra-plan/lib/preset-sync.js | publicConfigOf | L641-644 | （待补充） |  |
| plugins/dsh-extra-plan/lib/preset-sync.js | directProjectionFromLegacy | L646-657 | （待补充） |  |
| plugins/dsh-extra-plan/lib/preset-sync.js | assertTemplateGateWords | L659-663 | （待补充） |  |
| plugins/dsh-extra-plan/lib/preset-sync.js | readDeclaredPluginsFromPatch | L665-678 | （待补充） |  |
| plugins/dsh-extra-plan/lib/preset-sync.js | visit | L670-675 | （待补充） |  |
| plugins/dsh-extra-plan/lib/preset-sync.js | readLegacyPresetState | L680-683 | （待补充） |  |
| plugins/dsh-extra-plan/lib/preset-sync.js | syncPreset | L689-741 | （待补充） |  |
| plugins/dsh-extra-plan/lib/preset-sync.js | findEntry | L743-746 | （待补充） |  |
| plugins/dsh-extra-plan/lib/preset-sync.js | applyPlan | L748-756 | （待补充） |  |
| plugins/dsh-extra-plan/lib/preset-sync.js | trustedProfileContextOf | L758-765 | （待补充） |  |
| plugins/dsh-extra-plan/lib/preset-sync.js | withProfilePatchCapability | L767-770 | （待补充） |  |
| plugins/dsh-extra-plan/lib/preset-sync.js | syncPathContext | L772-782 | （待补充） |  |
| plugins/dsh-extra-plan/lib/preset-sync.js | readRawPatch | L784-801 | （待补充） |  |
| plugins/dsh-extra-plan/lib/preset-sync.js | settingsValuesFromRows | L803-806 | （待补充） |  |
| plugins/dsh-extra-plan/lib/preset-sync.js | activeLegacyRow | L808-815 | （待补充） |  |
| plugins/dsh-extra-plan/lib/preset-sync.js | projectedAssetDefinition | L818-828 | （待补充） |  |
| plugins/dsh-extra-plan/lib/preset-sync.js | readPatch | L821 | （待补充） |  |
| plugins/dsh-extra-plan/lib/preset-sync.js | structuralValue | L830-841 | （待补充） |  |
| plugins/dsh-extra-plan/lib/preset-sync.js | rowStructureRecord | L843-862 | （待补充） |  |
| plugins/dsh-extra-plan/lib/preset-sync.js | structuralFingerprint | L865-883 | （待补充） |  |
| plugins/dsh-extra-plan/lib/preset-sync.js | visit | L867-880 | （待补充） |  |
| plugins/dsh-extra-plan/lib/preset-sync.js | installAnchorOf | L885-888 | （待补充） |  |
| plugins/dsh-extra-plan/lib/preset-sync.js | mountPresetSync | L890-1091 | （待补充） |  |
| plugins/dsh-extra-plan/lib/preset-sync.js | disposeFiber | L904-907 | （待补充） |  |
| plugins/dsh-extra-plan/lib/preset-sync.js | reportSettledError | L908-915 | （待补充） |  |
| plugins/dsh-extra-plan/lib/preset-sync.js | reportAdapterError | L916-924 | （待补充） |  |
| plugins/dsh-extra-plan/lib/preset-sync.js | readState | L925-938 | （待补充） |  |
| plugins/dsh-extra-plan/lib/preset-sync.js | snapshotOf | L939-949 | （待补充） |  |
| plugins/dsh-extra-plan/lib/preset-sync.js | readPatch | L942 | （待补充） |  |
| plugins/dsh-extra-plan/lib/preset-sync.js | enqueueSettled | L950-961 | （待补充） |  |
| plugins/dsh-extra-plan/lib/preset-sync.js | settledSettingsUpdate | L962-970 | （待补充） |  |
| plugins/dsh-extra-plan/lib/preset-sync.js | enqueueStructural | L971-979 | （待补充） |  |
| plugins/dsh-extra-plan/lib/preset-sync.js | mountOfficialAdapter | L984-1009 | （待补充） |  |
| plugins/dsh-extra-plan/lib/preset-sync.js | disposeCurrentAdapter | L1010-1014 | （待补充） |  |
| plugins/dsh-extra-plan/lib/preset-sync.js | structuralHandoff | L1015-1035 | （待补充） |  |
| plugins/dsh-extra-plan/lib/preset-sync.js | readPatch | L1024 | （待补充） |  |
| plugins/dsh-extra-plan/lib/preset-sync.js | apply | L1026 | （待补充） |  |
| plugins/dsh-extra-plan/lib/preset-sync.js | initialMount | L1036-1063 | （待补充） |  |
| plugins/dsh-extra-plan/lib/preset-sync.js | readPatch | L1045 | （待补充） |  |
| plugins/dsh-extra-plan/lib/preset-sync.js | apply | L1047 | （待补充） |  |
| plugins/dsh-extra-plan/lib/preset-sync.js | settledOnlyUpdate | L1064 | （待补充） |  |
| plugins/dsh-extra-plan/lib/preset-sync.js | dispose | L1080-1088 | （待补充） |  |
| plugins/dsh-extra-plan/lib/preset-yaml.js | loadYaml | L5-8 | （待补充） |  |
| plugins/dsh-extra-plan/lib/preset-yaml.js | resolve | L13 | （待补充） |  |
| plugins/dsh-extra-plan/lib/preset-yaml.js | construct | L14 | （待补充） |  |
| plugins/dsh-extra-plan/lib/preset-yaml.js | predicate | L15 | （待补充） |  |
| plugins/dsh-extra-plan/lib/preset-yaml.js | represent | L16 | （待补充） |  |
| plugins/dsh-extra-plan/lib/preset-yaml.js | parsePresetYaml | L33-36 | （待补充） |  |
| plugins/dsh-extra-plan/lib/preset-yaml.js | hasOwn | L38-40 | （待补充） |  |
| plugins/dsh-extra-plan/lib/preset-yaml.js | pathParts | L42-44 | （待补充） |  |
| plugins/dsh-extra-plan/lib/preset-yaml.js | readPath | L46-53 | （待补充） |  |
| plugins/dsh-extra-plan/lib/preset-yaml.js | collectRowsById | L55-70 | （待补充） |  |
| plugins/dsh-extra-plan/lib/preset-yaml.js | visit | L58-67 | （待补充） |  |
| plugins/dsh-extra-plan/lib/preset-yaml.js | rowsById | L73-75 | （待补充） |  |
| plugins/dsh-extra-plan/lib/preset-yaml.js | rowsByIdWithPath | L78-85 | （待补充） |  |
| plugins/dsh-extra-plan/lib/preset-yaml.js | resolveLocator | L87-100 | （待补充） |  |
| plugins/dsh-extra-plan/lib/preset-yaml.js | locatorFor | L102-107 | （待补充） |  |
| plugins/dsh-extra-plan/lib/preset-yaml.js | aliasesFor | L109-114 | （待补充） |  |
| plugins/dsh-extra-plan/lib/preset-yaml.js | resolveSetting | L121-134 | （待补充） |  |
| plugins/dsh-extra-plan/lib/preset-yaml.js | resolveTemplateSettingDefault | L136-151 | （待补充） |  |
| plugins/dsh-extra-plan/lib/preset-yaml.js | captureSettings | L157-173 | （待补充） |  |
| plugins/dsh-extra-plan/lib/preset-yaml.js | hostRowDefaultsFromTemplate | L176-190 | （待补充） |  |
| plugins/dsh-extra-plan/lib/preset-yaml.js | captureRowSettings | L200-216 | （待补充） |  |
| plugins/dsh-extra-plan/lib/preset-yaml.js | migrationEntryName | L219-222 | （待补充） |  |
| plugins/dsh-extra-plan/lib/preset-yaml.js | migrationEntryConfig | L224-230 | （待补充） |  |
| plugins/dsh-extra-plan/lib/preset-yaml.js | migrationManagedConfig | L232-242 | （待补充） |  |
| plugins/dsh-extra-plan/lib/preset-yaml.js | migrationComparable | L244-247 | （待补充） |  |
| plugins/dsh-extra-plan/lib/preset-yaml.js | migrationHash | L249 | （待补充） |  |
| plugins/dsh-extra-plan/lib/preset-yaml.js | migrationIgnorable | L250 | （待补充） |  |
| plugins/dsh-extra-plan/lib/preset-yaml.js | migrationIndent | L251 | （待补充） |  |
| plugins/dsh-extra-plan/lib/preset-yaml.js | migrationScalarToken | L253-258 | （待补充） |  |
| plugins/dsh-extra-plan/lib/preset-yaml.js | migrationRowStarts | L260-266 | （待补充） |  |
| plugins/dsh-extra-plan/lib/preset-yaml.js | migrationRowId | L268-274 | （待补充） |  |
| plugins/dsh-extra-plan/lib/preset-yaml.js | planCanonicalSettingsMigration | L277-340 | （待补充） |  |
| plugins/dsh-extra-plan/lib/preset-yaml.js | findPluginsRow | L342-353 | （待补充） |  |
| plugins/dsh-extra-plan/lib/preset-yaml.js | readProjectedValue | L360-379 | （待补充） |  |
| plugins/dsh-extra-plan/lib/preset-yaml.js | restatePluginsRow | L382-389 | （待补充） |  |
| plugins/dsh-extra-plan/lib/preset-yaml.js | inlineCommentIndex | L391-409 | （待补充） |  |
| plugins/dsh-extra-plan/lib/preset-yaml.js | lineIndent | L411-414 | （待补充） |  |
| plugins/dsh-extra-plan/lib/preset-yaml.js | withoutCr | L416-418 | （待补充） |  |
| plugins/dsh-extra-plan/lib/preset-yaml.js | parseRowId | L420-432 | （待补充） |  |
| plugins/dsh-extra-plan/lib/preset-yaml.js | parseMapKey | L434-438 | （待补充） |  |
| plugins/dsh-extra-plan/lib/preset-yaml.js | rowEnd | L440-448 | （待补充） |  |
| plugins/dsh-extra-plan/lib/preset-yaml.js | findDirectKey | L450-468 | （待补充） |  |
| plugins/dsh-extra-plan/lib/preset-yaml.js | textPathLine | L470-482 | （待补充） |  |
| plugins/dsh-extra-plan/lib/preset-yaml.js | findTextLocatorMatches | L484-496 | （待补充） |  |
| plugins/dsh-extra-plan/lib/preset-yaml.js | yamlString | L498-502 | （待补充） |  |
| plugins/dsh-extra-plan/lib/preset-yaml.js | serializeScalar | L504-508 | （待补充） |  |
| plugins/dsh-extra-plan/lib/preset-yaml.js | escapeRegex | L510-512 | （待补充） |  |
| plugins/dsh-extra-plan/lib/preset-yaml.js | replaceLineScalar | L514-526 | （待补充） |  |
| plugins/dsh-extra-plan/lib/preset-yaml.js | isBlockScalarLine | L528-538 | （待补充） |  |
| plugins/dsh-extra-plan/lib/preset-yaml.js | scalarTypeFor | L540-545 | （待补充） |  |
| plugins/dsh-extra-plan/lib/preset-yaml.js | patchYamlScalar | L551-577 | （待补充） |  |
| plugins/dsh-extra-plan/lib/qqbot-settings-sync.js | profileIdentityOf | L34-52 | （待补充） |  |
| plugins/dsh-extra-plan/lib/qqbot-settings-sync.js | profileGate | L54-59 | （待补充） |  |
| plugins/dsh-extra-plan/lib/qqbot-settings-sync.js | absoluteRoot | L61-68 | （待补充） |  |
| plugins/dsh-extra-plan/lib/qqbot-settings-sync.js | hostTarget | L70-78 | （待补充） |  |
| plugins/dsh-extra-plan/lib/qqbot-settings-sync.js | authorizedReadPath | L80-83 | （待补充） |  |
| plugins/dsh-extra-plan/lib/qqbot-settings-sync.js | authorizedWritePath | L85-88 | （待补充） |  |
| plugins/dsh-extra-plan/lib/qqbot-settings-sync.js | plainObject | L95-97 | （待补充） |  |
| plugins/dsh-extra-plan/lib/qqbot-settings-sync.js | errorText | L99-101 | （待补充） |  |
| plugins/dsh-extra-plan/lib/qqbot-settings-sync.js | loadYaml | L103-121 | （待补充） |  |
| plugins/dsh-extra-plan/lib/qqbot-settings-sync.js | resolve | L110 | （待补充） |  |
| plugins/dsh-extra-plan/lib/qqbot-settings-sync.js | construct | L111 | （待补充） |  |
| plugins/dsh-extra-plan/lib/qqbot-settings-sync.js | predicate | L112 | （待补充） |  |
| plugins/dsh-extra-plan/lib/qqbot-settings-sync.js | represent | L113 | （待补充） |  |
| plugins/dsh-extra-plan/lib/qqbot-settings-sync.js | parseYaml | L123-126 | （待补充） |  |
| plugins/dsh-extra-plan/lib/qqbot-settings-sync.js | readableDirectory | L128-136 | （待补充） |  |
| plugins/dsh-extra-plan/lib/qqbot-settings-sync.js | unavailable | L138-140 | （待补充） |  |
| plugins/dsh-extra-plan/lib/qqbot-settings-sync.js | documentPathValue | L142-144 | （待补充） |  |
| plugins/dsh-extra-plan/lib/qqbot-settings-sync.js | rootFromDocumentPath | L146-157 | （待补充） |  |
| plugins/dsh-extra-plan/lib/qqbot-settings-sync.js | environmentValue | L159-161 | （待补充） |  |
| plugins/dsh-extra-plan/lib/qqbot-settings-sync.js | resolveProfilesRoot | L164-197 | （待补充） |  |
| plugins/dsh-extra-plan/lib/qqbot-settings-sync.js | sortedNames | L199-201 | （待补充） |  |
| plugins/dsh-extra-plan/lib/qqbot-settings-sync.js | scanOwnQqbotProfiles | L203-255 | （待补充） |  |
| plugins/dsh-extra-plan/lib/qqbot-settings-sync.js | findOwnQqbotProfiles | L258-270 | （待补充） |  |
| plugins/dsh-extra-plan/lib/qqbot-settings-sync.js | snapshotValues | L272-278 | （待补充） |  |
| plugins/dsh-extra-plan/lib/qqbot-settings-sync.js | snapshotGateWords | L280-284 | （待补充） |  |
| plugins/dsh-extra-plan/lib/qqbot-settings-sync.js | validateSettingsSnapshot | L287-302 | （待补充） |  |
| plugins/dsh-extra-plan/lib/qqbot-settings-sync.js | expectedManaged | L304-307 | （待补充） |  |
| plugins/dsh-extra-plan/lib/qqbot-settings-sync.js | canonicalSnapshot | L309-314 | （待补充） |  |
| plugins/dsh-extra-plan/lib/qqbot-settings-sync.js | stableSnapshotHash | L317-320 | （待补充） |  |
| plugins/dsh-extra-plan/lib/qqbot-settings-sync.js | managedSnapshotHashFromConfig | L322-328 | （待补充） |  |
| plugins/dsh-extra-plan/lib/qqbot-settings-sync.js | patchDiagnostic | L330-362 | （待补充） |  |
| plugins/dsh-extra-plan/lib/qqbot-settings-sync.js | strictAssociation | L364-366 | （待补充） |  |
| plugins/dsh-extra-plan/lib/qqbot-settings-sync.js | splitText | L368-374 | （待补充） |  |
| plugins/dsh-extra-plan/lib/qqbot-settings-sync.js | joinText | L376-379 | （待补充） |  |
| plugins/dsh-extra-plan/lib/qqbot-settings-sync.js | indentOf | L381-383 | （待补充） |  |
| plugins/dsh-extra-plan/lib/qqbot-settings-sync.js | ignorable | L385-388 | （待补充） |  |
| plugins/dsh-extra-plan/lib/qqbot-settings-sync.js | rootSequenceInfo | L390-408 | （待补充） |  |
| plugins/dsh-extra-plan/lib/qqbot-settings-sync.js | keyMatch | L410-413 | （待补充） |  |
| plugins/dsh-extra-plan/lib/qqbot-settings-sync.js | targetKind | L415-422 | （待补充） |  |
| plugins/dsh-extra-plan/lib/qqbot-settings-sync.js | configHolder | L424-426 | （待补充） |  |
| plugins/dsh-extra-plan/lib/qqbot-settings-sync.js | locateConfigLine | L428-441 | （待补充） |  |
| plugins/dsh-extra-plan/lib/qqbot-settings-sync.js | blockEndForChild | L443-449 | （待补充） |  |
| plugins/dsh-extra-plan/lib/qqbot-settings-sync.js | directKeyLines | L451-458 | （待补充） |  |
| plugins/dsh-extra-plan/lib/qqbot-settings-sync.js | configChildIndent | L460-470 | （待补充） |  |
| plugins/dsh-extra-plan/lib/qqbot-settings-sync.js | scalar | L472-476 | （待补充） |  |
| plugins/dsh-extra-plan/lib/qqbot-settings-sync.js | renderedConfig | L478-490 | （待补充） |  |
| plugins/dsh-extra-plan/lib/qqbot-settings-sync.js | renderedRow | L493-502 | （待补充） |  |
| plugins/dsh-extra-plan/lib/qqbot-settings-sync.js | spaces | L494 | （待补充） |  |
| plugins/dsh-extra-plan/lib/qqbot-settings-sync.js | parsedTarget | L504-513 | （待补充） |  |
| plugins/dsh-extra-plan/lib/qqbot-settings-sync.js | configState | L515-532 | （待补充） |  |
| plugins/dsh-extra-plan/lib/qqbot-settings-sync.js | managedProjection | L534-538 | （待补充） |  |
| plugins/dsh-extra-plan/lib/qqbot-settings-sync.js | equalManaged | L540-549 | （待补充） |  |
| plugins/dsh-extra-plan/lib/qqbot-settings-sync.js | reparseAndCheck | L551-560 | （待补充） |  |
| plugins/dsh-extra-plan/lib/qqbot-settings-sync.js | existingNameState | L562-579 | （待补充） |  |
| plugins/dsh-extra-plan/lib/qqbot-settings-sync.js | applyExistingTarget | L581-643 | （待补充） |  |
| plugins/dsh-extra-plan/lib/qqbot-settings-sync.js | appendTarget | L645-657 | （待补充） |  |
| plugins/dsh-extra-plan/lib/qqbot-settings-sync.js | scalarTokenEquals | L659-662 | （待补充） |  |
| plugins/dsh-extra-plan/lib/qqbot-settings-sync.js | duplicateTargetNameText | L664-692 | （待补充） |  |
| plugins/dsh-extra-plan/lib/qqbot-settings-sync.js | planQqbotSettingsPatch | L695-720 | （待补充） |  |
| plugins/dsh-extra-plan/lib/qqbot-settings-sync.js | writeExclusive | L722-730 | （待补充） |  |
| plugins/dsh-extra-plan/lib/qqbot-settings-sync.js | nextFilePath | L732-738 | （待补充） |  |
| plugins/dsh-extra-plan/lib/qqbot-settings-sync.js | hook | L740-742 | （待补充） |  |
| plugins/dsh-extra-plan/lib/qqbot-settings-sync.js | writeQqbotSettingsPatch | L745-840 | （待补充） |  |
| plugins/dsh-extra-plan/lib/qqbot-settings-sync.js | fingerprint | L842-844 | （待补充） |  |
| plugins/dsh-extra-plan/lib/qqbot-settings-sync.js | resultForPath | L846-855 | （待补充） |  |
| plugins/dsh-extra-plan/lib/qqbot-settings-sync.js | webDocumentPath | L858-863 | （待补充） |  |
| plugins/dsh-extra-plan/lib/qqbot-settings-sync.js | createQqbotSettingsSynchronizer | L865-1036 | （待补充） |  |
| plugins/dsh-extra-plan/lib/qqbot-settings-sync.js | emit | L871-876 | （待补充） |  |
| plugins/dsh-extra-plan/lib/qqbot-settings-sync.js | profileTerminal | L877-902 | （待补充） |  |
| plugins/dsh-extra-plan/lib/qqbot-settings-sync.js | execute | L903-998 | （待补充） |  |
| plugins/dsh-extra-plan/lib/qqbot-settings-sync.js | finish | L914-928 | （待补充） |  |
| plugins/dsh-extra-plan/lib/qqbot-settings-sync.js | enqueue | L999-1030 | （待补充） |  |
| plugins/dsh-extra-plan/lib/qqbot-settings-sync.js | getState | L1034 | （待补充） |  |
| plugins/dsh-extra-plan/lib/run-code-scanner.js | maskCodeLiteralsAndComments | L3-196 | （待补充） |  |
| plugins/dsh-extra-plan/lib/run-code-scanner.js | isIdentifierStart | L12 | （待补充） |  |
| plugins/dsh-extra-plan/lib/run-code-scanner.js | isIdentifierPart | L13 | （待补充） |  |
| plugins/dsh-extra-plan/lib/run-code-scanner.js | blank | L14-18 | （待补充） |  |
| plugins/dsh-extra-plan/lib/run-code-scanner.js | scanString | L19-30 | （待补充） |  |
| plugins/dsh-extra-plan/lib/run-code-scanner.js | scanRegex | L31-51 | （待补充） |  |
| plugins/dsh-extra-plan/lib/run-code-scanner.js | scanTemplate | L52-68 | （待补充） |  |
| plugins/dsh-extra-plan/lib/run-code-scanner.js | scanCode | L69-193 | （待补充） |  |
| plugins/dsh-extra-plan/lib/run-code-scanner.js | sliceBalancedArgs | L202-218 | （待补充） |  |
| plugins/dsh-extra-plan/lib/run-code-scanner.js | hasDynamicRunCodeAccess | L222-272 | （待补充） |  |
| plugins/dsh-extra-plan/lib/run-code-scanner.js | isIdentifierPart | L225 | （待补充） |  |
| plugins/dsh-extra-plan/lib/run-code-scanner.js | skipWhitespace | L226-230 | （待补充） |  |
| plugins/dsh-extra-plan/lib/run-code-scanner.js | bracketEndOf | L231-241 | （待补充） |  |
| plugins/dsh-extra-plan/lib/run-code-scanner.js | collectRunCodeSites | L274-341 | （待补充） |  |
| plugins/dsh-extra-plan/lib/run-code-scanner.js | isIdentifierStart | L278 | （待补充） |  |
| plugins/dsh-extra-plan/lib/run-code-scanner.js | isIdentifierPart | L279 | （待补充） |  |
| plugins/dsh-extra-plan/lib/run-code-scanner.js | skipWhitespace | L280-284 | （待补充） |  |
| plugins/dsh-extra-plan/lib/run-code-scanner.js | bracketEndOf | L285-295 | （待补充） |  |
| plugins/dsh-extra-plan/lib/run-code-static.js | runCodeTextOf | L22-26 | （待补充） |  |
| plugins/dsh-extra-plan/lib/run-code-static.js | codeMutationHints | L29-37 | （待补充） |  |
| plugins/dsh-extra-plan/lib/run-code-static.js | parseStaticLiteral | L41-175 | （待补充） |  |
| plugins/dsh-extra-plan/lib/run-code-static.js | fail | L52 | （待补充） |  |
| plugins/dsh-extra-plan/lib/run-code-static.js | skipWhitespace | L53-55 | （待补充） |  |
| plugins/dsh-extra-plan/lib/run-code-static.js | isIdentifierStart | L56 | （待补充） |  |
| plugins/dsh-extra-plan/lib/run-code-static.js | isIdentifierChar | L57 | （待补充） |  |
| plugins/dsh-extra-plan/lib/run-code-static.js | parseString | L59-99 | （待补充） |  |
| plugins/dsh-extra-plan/lib/run-code-static.js | parseValue | L101-165 | （待补充） |  |
| plugins/dsh-extra-plan/lib/run-code-static.js | createRunCodeStatic | L177-571 | （待补充） |  |
| plugins/dsh-extra-plan/lib/run-code-static.js | decomposeRunCode | L190-228 | （待补充） |  |
| plugins/dsh-extra-plan/lib/run-code-static.js | addMember | L197-206 | （待补充） |  |
| plugins/dsh-extra-plan/lib/run-code-static.js | markRange | L207-209 | （待补充） |  |
| plugins/dsh-extra-plan/lib/run-code-static.js | runCodeCatchGateReason | L234-305 | （待补充） |  |
| plugins/dsh-extra-plan/lib/run-code-static.js | within | L261 | （待补充） |  |
| plugins/dsh-extra-plan/lib/run-code-static.js | askUserQuestionReturnGateReason | L309-504 | （待补充） |  |
| plugins/dsh-extra-plan/lib/run-code-static.js | isIdChar | L314 | （待补充） |  |
| plugins/dsh-extra-plan/lib/run-code-static.js | skipWs | L315-319 | （待补充） |  |
| plugins/dsh-extra-plan/lib/run-code-static.js | isTopLevel | L404 | （待补充） |  |
| plugins/dsh-extra-plan/lib/run-code-static.js | candidateStarts | L405-412 | （待补充） |  |
| plugins/dsh-extra-plan/lib/run-code-static.js | tokenAt | L413-414 | （待补充） |  |
| plugins/dsh-extra-plan/lib/run-code-static.js | expressionEnd | L415-424 | （待补充） |  |
| plugins/dsh-extra-plan/lib/run-code-static.js | references | L425-440 | （待补充） |  |
| plugins/dsh-extra-plan/lib/run-code-static.js | hasReassignment | L441-458 | （待补充） |  |
| plugins/dsh-extra-plan/lib/run-code-static.js | afterCall | L459-469 | （待补充） |  |
| plugins/dsh-extra-plan/lib/run-code-static.js | runCodeSiteCount | L508-525 | （待补充） |  |
| plugins/dsh-extra-plan/lib/run-code-static.js | isRunCodeSubCall | L529-534 | （待补充） |  |
| plugins/dsh-extra-plan/lib/run-code-static.js | runCodeDispatchCapText | L537-539 | （待补充） |  |
| plugins/dsh-extra-plan/lib/run-code-static.js | runCodeDispatchGateReason | L544-558 | （待补充） |  |
| plugins/dsh-extra-plan/lib/runtime-lifecycle.js | createRuntimeLifecycle | L4-147 | （待补充） |  |
| plugins/dsh-extra-plan/lib/runtime-lifecycle.js | registerTool | L11-40 | （待补充） |  |
| plugins/dsh-extra-plan/lib/runtime-lifecycle.js | registerSavePlan | L53 | （待补充） |  |
| plugins/dsh-extra-plan/lib/runtime-lifecycle.js | registerSaveProbe | L54 | （待补充） |  |
| plugins/dsh-extra-plan/lib/runtime-lifecycle.js | isProberRole | L60-73 | （待补充） |  |
| plugins/dsh-extra-plan/lib/runtime-lifecycle.js | probeClaimFor | L75-92 | （待补充） |  |
| plugins/dsh-extra-plan/lib/runtime-lifecycle.js | recordProbeClaim | L94-96 | （待补充） |  |
| plugins/dsh-extra-plan/lib/runtime-lifecycle.js | noteRunCodeSubCall | L98-105 | （待补充） |  |
| plugins/dsh-extra-plan/lib/runtime-lifecycle.js | recordRunCodeDeny | L107-118 | （待补充） |  |
| plugins/dsh-extra-plan/lib/runtime-lifecycle.js | takeRunCodeDenyRecords | L120-128 | （待补充） |  |
| plugins/dsh-extra-plan/lib/runtime-lifecycle.js | disposeSession | L130-138 | （待补充） |  |
| plugins/dsh-extra-plan/lib/runtime-lifecycle.js | pendingProbeCount | L145 | （待补充） |  |
| plugins/dsh-extra-plan/lib/runtime-static.js | causeChainOf | L3-15 | （待补充） |  |
| plugins/dsh-extra-plan/lib/save-contract.js | sanitizeTaskName | L4-12 | （待补充） |  |
| plugins/dsh-extra-plan/lib/save-contract.js | timestampOf | L15-18 | （待补充） |  |
| plugins/dsh-extra-plan/lib/save-contract.js | pad | L16 | （待补充） |  |
| plugins/dsh-extra-plan/lib/save-contract.js | timestamp | L20-22 | （待补充） |  |
| plugins/dsh-extra-plan/lib/save-contract.js | sessionTagOf | L26-28 | （待补充） |  |
| plugins/dsh-extra-plan/lib/save-contract.js | saveArtifactBase | L34-49 | （待补充） |  |
| plugins/dsh-extra-plan/lib/save-contract.js | summaryList | L56-58 | （待补充） |  |
| plugins/dsh-extra-plan/lib/save-contract.js | summaryBool | L60-62 | （待补充） |  |
| plugins/dsh-extra-plan/lib/save-contract.js | formatSavePlanSummary | L65-120 | （待补充） |  |
| plugins/dsh-extra-plan/lib/save-contract.js | renderSavePlan | L127-130 | （待补充） |  |
| plugins/dsh-extra-plan/lib/save-contract.js | renderProbeMarkdown | L165-206 | （待补充） |  |
| plugins/dsh-extra-plan/lib/save-contract.js | trimProbeEvidenceDecor | L232-243 | （待补充） |  |
| plugins/dsh-extra-plan/lib/save-contract.js | extractProbeEvidenceRefs | L244-257 | （待补充） |  |
| plugins/dsh-extra-plan/lib/save-contract.js | renderSaveProbe | L261-263 | （待补充） |  |
| plugins/dsh-extra-plan/lib/save-persistence.js | fsOpsOf | L9-12 | （待补充） |  |
| plugins/dsh-extra-plan/lib/save-persistence.js | errorText | L14-16 | （待补充） |  |
| plugins/dsh-extra-plan/lib/save-persistence.js | errorCodeOf | L18-20 | （待补充） |  |
| plugins/dsh-extra-plan/lib/save-persistence.js | policyOf | L22-24 | （待补充） |  |
| plugins/dsh-extra-plan/lib/save-persistence.js | authorizeDirectory | L26-30 | （待补充） |  |
| plugins/dsh-extra-plan/lib/save-persistence.js | authorizeFile | L32-36 | （待补充） |  |
| plugins/dsh-extra-plan/lib/save-persistence.js | cleanupCreated | L38-49 | （待补充） |  |
| plugins/dsh-extra-plan/lib/save-persistence.js | commitError | L51-57 | （待补充） |  |
| plugins/dsh-extra-plan/lib/save-persistence.js | atomicCommit | L62-112 | （待补充） |  |
| plugins/dsh-extra-plan/lib/save-plan-validation.js | newFileRecord | L53-55 | （待补充） |  |
| plugins/dsh-extra-plan/lib/save-plan-validation.js | newTask | L57-69 | （待补充） |  |
| plugins/dsh-extra-plan/lib/save-plan-validation.js | newClosure | L71-82 | （待补充） |  |
| plugins/dsh-extra-plan/lib/save-plan-validation.js | newCheck | L85-91 | （待补充） |  |
| plugins/dsh-extra-plan/lib/save-plan-validation.js | newGlobal | L93-95 | （待补充） |  |
| plugins/dsh-extra-plan/lib/save-plan-validation.js | makeDiagnostic | L97-106 | （待补充） |  |
| plugins/dsh-extra-plan/lib/save-plan-validation.js | defaultTemplate | L108-142 | （待补充） |  |
| plugins/dsh-extra-plan/lib/save-plan-validation.js | normalizeText | L144-146 | （待补充） |  |
| plugins/dsh-extra-plan/lib/save-plan-validation.js | fieldOf | L148-153 | （待补充） |  |
| plugins/dsh-extra-plan/lib/save-plan-validation.js | isPlaceholderAnchor | L162-164 | （待补充） |  |
| plugins/dsh-extra-plan/lib/save-plan-validation.js | isAcceptancePlaceholder | L166-169 | （待补充） |  |
| plugins/dsh-extra-plan/lib/save-plan-validation.js | parseLocation | L171-179 | （待补充） |  |
| plugins/dsh-extra-plan/lib/save-plan-validation.js | pointIdentity | L181-183 | （待补充） |  |
| plugins/dsh-extra-plan/lib/save-plan-validation.js | headingCandidate | L186-198 | （待补充） |  |
| plugins/dsh-extra-plan/lib/save-plan-validation.js | pushEmptyFieldDiagnostic | L200-204 | （待补充） |  |
| plugins/dsh-extra-plan/lib/save-plan-validation.js | parseTaskDocument | L206-450 | （待补充） |  |
| plugins/dsh-extra-plan/lib/save-plan-validation.js | flush | L219-226 | （待补充） |  |
| plugins/dsh-extra-plan/lib/save-plan-validation.js | wrongHeading | L228-230 | （待补充） |  |
| plugins/dsh-extra-plan/lib/save-plan-validation.js | pushField | L232-236 | （待补充） |  |
| plugins/dsh-extra-plan/lib/save-plan-validation.js | requireFile | L238-242 | （待补充） |  |
| plugins/dsh-extra-plan/lib/save-plan-validation.js | requirePoint | L244-250 | （待补充） |  |
| plugins/dsh-extra-plan/lib/save-plan-validation.js | validateIds | L452-463 | （待补充） |  |
| plugins/dsh-extra-plan/lib/save-plan-validation.js | isMarkdownWrapped | L465-476 | （待补充） |  |
| plugins/dsh-extra-plan/lib/save-plan-validation.js | pathIssue | L478-491 | （待补充） |  |
| plugins/dsh-extra-plan/lib/save-plan-validation.js | workdirIssue | L493-498 | （待补充） |  |
| plugins/dsh-extra-plan/lib/save-plan-validation.js | platformIsCaseInsensitive | L500-504 | （待补充） |  |
| plugins/dsh-extra-plan/lib/save-plan-validation.js | pathKey | L506-509 | （待补充） |  |
| plugins/dsh-extra-plan/lib/save-plan-validation.js | parseDependencies | L511-520 | （待补充） |  |
| plugins/dsh-extra-plan/lib/save-plan-validation.js | parseResources | L522-530 | （待补充） |  |
| plugins/dsh-extra-plan/lib/save-plan-validation.js | parseCheckRefs | L532-540 | （待补充） |  |
| plugins/dsh-extra-plan/lib/save-plan-validation.js | addPathDiagnostics | L542-547 | （待补充） |  |
| plugins/dsh-extra-plan/lib/save-plan-validation.js | validatePathSet | L549-563 | （待补充） |  |
| plugins/dsh-extra-plan/lib/save-plan-validation.js | validateResourceField | L565-573 | （待补充） |  |
| plugins/dsh-extra-plan/lib/save-plan-validation.js | validatePointIds | L575-583 | （待补充） |  |
| plugins/dsh-extra-plan/lib/save-plan-validation.js | validatePlanFileRecord | L585-630 | （待补充） |  |
| plugins/dsh-extra-plan/lib/save-plan-validation.js | validatePlanFileRecords | L632-637 | （待补充） |  |
| plugins/dsh-extra-plan/lib/save-plan-validation.js | validateAcceptanceFileRecord | L639-655 | （待补充） |  |
| plugins/dsh-extra-plan/lib/save-plan-validation.js | validateAcceptanceFileRecords | L656-661 | （待补充） |  |
| plugins/dsh-extra-plan/lib/save-plan-validation.js | validateTaskShape | L663-700 | （待补充） |  |
| plugins/dsh-extra-plan/lib/save-plan-validation.js | graphCycles | L702-723 | （待补充） |  |
| plugins/dsh-extra-plan/lib/save-plan-validation.js | visit | L707-720 | （待补充） |  |
| plugins/dsh-extra-plan/lib/save-plan-validation.js | groupSort | L725-729 | （待补充） |  |
| plugins/dsh-extra-plan/lib/save-plan-validation.js | firstTaskForGroup | L731-734 | （待补充） |  |
| plugins/dsh-extra-plan/lib/save-plan-validation.js | validatePlanRelations | L736-808 | （待补充） |  |
| plugins/dsh-extra-plan/lib/save-plan-validation.js | fileRecordKey | L810-812 | （待补充） |  |
| plugins/dsh-extra-plan/lib/save-plan-validation.js | pointIdSet | L814-816 | （待补充） |  |
| plugins/dsh-extra-plan/lib/save-plan-validation.js | equalStringSets | L818-822 | （待补充） |  |
| plugins/dsh-extra-plan/lib/save-plan-validation.js | validateFileRecordMapping | L824-846 | （待补充） |  |
| plugins/dsh-extra-plan/lib/save-plan-validation.js | validateCrossDocument | L848-872 | （待补充） |  |
| plugins/dsh-extra-plan/lib/save-plan-validation.js | validateClosure | L874-924 | （待补充） |  |
| plugins/dsh-extra-plan/lib/save-plan-validation.js | validateGlobal | L926-936 | （待补充） |  |
| plugins/dsh-extra-plan/lib/save-plan-validation.js | validateChecks | L938-995 | （待补充） |  |
| plugins/dsh-extra-plan/lib/save-plan-validation.js | attachRefs | L973-986 | （待补充） |  |
| plugins/dsh-extra-plan/lib/save-plan-validation.js | sortIds | L997-999 | （待补充） |  |
| plugins/dsh-extra-plan/lib/save-plan-validation.js | buildInternalOrder | L1001-1025 | （待补充） |  |
| plugins/dsh-extra-plan/lib/save-plan-validation.js | reviewGroupSort | L1027-1031 | （待补充） |  |
| plugins/dsh-extra-plan/lib/save-plan-validation.js | summarizeFileRecord | L1033-1054 | （待补充） |  |
| plugins/dsh-extra-plan/lib/save-plan-validation.js | buildSummary | L1056-1178 | （待补充） |  |
| plugins/dsh-extra-plan/lib/save-plan-validation.js | formatDiagnostic | L1180-1185 | （待补充） |  |
| plugins/dsh-extra-plan/lib/save-plan-validation.js | finalizeFailure | L1187-1193 | （待补充） |  |
| plugins/dsh-extra-plan/lib/save-plan-validation.js | validateSavePlanContract | L1195-1228 | （待补充） |  |
| plugins/dsh-extra-plan/lib/save-probe-validation.js | errorCodeOf | L6-8 | （待补充） |  |
| plugins/dsh-extra-plan/lib/save-probe-validation.js | contextOf | L10-14 | （待补充） |  |
| plugins/dsh-extra-plan/lib/save-probe-validation.js | resolveAbsoluteProbeTarget | L16-41 | （待补充） |  |
| plugins/dsh-extra-plan/lib/save-probe-validation.js | resolveProbeTarget | L43-49 | （待补充） |  |
| plugins/dsh-extra-plan/lib/save-probe-validation.js | pathViolation | L51-65 | （待补充） |  |
| plugins/dsh-extra-plan/lib/save-probe-validation.js | validateProbe | L67-168 | （待补充） |  |
| plugins/dsh-extra-plan/lib/save-probe-validation.js | probePathOf | L171-175 | （待补充） |  |
| plugins/dsh-extra-plan/lib/save-tool-factories.js | probeRefDecorationHint | L15-17 | （待补充） |  |
| plugins/dsh-extra-plan/lib/save-tool-factories.js | cwdOf | L20-24 | （待补充） |  |
| plugins/dsh-extra-plan/lib/save-tool-factories.js | errorCodeOf | L26-28 | （待补充） |  |
| plugins/dsh-extra-plan/lib/save-tool-factories.js | pathContextOf | L30-36 | （待补充） |  |
| plugins/dsh-extra-plan/lib/save-tool-factories.js | resolveSaveContext | L39-51 | （待补充） |  |
| plugins/dsh-extra-plan/lib/save-tool-factories.js | sourceCacheKey | L55-58 | （待补充） |  |
| plugins/dsh-extra-plan/lib/save-tool-factories.js | resolveMissingWorkspaceIdentity | L60-75 | （待补充） |  |
| plugins/dsh-extra-plan/lib/save-tool-factories.js | resolveWorkspaceEntry | L77-101 | （待补充） |  |
| plugins/dsh-extra-plan/lib/save-tool-factories.js | strictTextEntry | L103-115 | （待补充） |  |
| plugins/dsh-extra-plan/lib/save-tool-factories.js | literalCount | L117-126 | （待补充） |  |
| plugins/dsh-extra-plan/lib/save-tool-factories.js | verifyModificationPoint | L128-145 | （待补充） |  |
| plugins/dsh-extra-plan/lib/save-tool-factories.js | verifyPlanSources | L147-181 | （待补充） |  |
| plugins/dsh-extra-plan/lib/save-tool-factories.js | verifyFile | L150-177 | （待补充） |  |
| plugins/dsh-extra-plan/lib/save-tool-factories.js | verifyProbeEvidenceRef | L183-202 | （待补充） |  |
| plugins/dsh-extra-plan/lib/save-tool-factories.js | createSaveToolFactories | L205-389 | （待补充） |  |
| plugins/dsh-extra-plan/lib/save-tool-factories.js | defineSavePlan | L206-272 | （待补充） |  |
| plugins/dsh-extra-plan/lib/save-tool-factories.js | render | L227-229 | （待补充） |  |
| plugins/dsh-extra-plan/lib/save-tool-factories.js | execute | L232-270 | （待补充） |  |
| plugins/dsh-extra-plan/lib/save-tool-factories.js | defineSaveProbe | L274-386 | （待补充） |  |
| plugins/dsh-extra-plan/lib/save-tool-factories.js | render | L362-364 | （待补充） |  |
| plugins/dsh-extra-plan/lib/save-tool-factories.js | execute | L367-384 | （待补充） |  |
| plugins/dsh-extra-plan/lib/sdk-text-cache.js | isWeakKey | L7-9 | （待补充） |  |
| plugins/dsh-extra-plan/lib/sdk-text-cache.js | numberTag | L11-17 | （待补充） |  |
| plugins/dsh-extra-plan/lib/sdk-text-cache.js | isArrayIndexKey | L19-23 | （待补充） |  |
| plugins/dsh-extra-plan/lib/sdk-text-cache.js | encode | L27-89 | （待补充） |  |
| plugins/dsh-extra-plan/lib/sdk-text-cache.js | sdkSchemasFingerprint | L91-99 | （待补充） |  |
| plugins/dsh-extra-plan/lib/sdk-text-cache.js | sdkTextCacheEntryMatches | L101-107 | （待补充） |  |
| plugins/dsh-extra-plan/lib/sdk-text-cache.js | renderUncached | L109-119 | （待补充） |  |
| plugins/dsh-extra-plan/lib/sdk-text-cache.js | createSdkTextCache | L121-161 | （待补充） |  |
| plugins/dsh-extra-plan/lib/sdk-text-cache.js | dispose | L124-126 | （待补充） |  |
| plugins/dsh-extra-plan/lib/sdk-text-cache.js | getOrCreate | L128-158 | （待补充） |  |
| plugins/dsh-extra-plan/lib/settings-contract.js | isString | L5 | （待补充） |  |
| plugins/dsh-extra-plan/lib/settings-contract.js | isPositiveInteger | L6 | （待补充） |  |
| plugins/dsh-extra-plan/lib/settings-contract.js | isBoolean | L7 | （待补充） |  |
| plugins/dsh-extra-plan/lib/settings-contract.js | isMode | L11 | （待补充） |  |
| plugins/dsh-extra-plan/lib/settings-contract.js | setting | L28-50 | （待补充） |  |
| plugins/dsh-extra-plan/lib/settings-contract.js | settingsRowLocator | L56-60 | （待补充） |  |
| plugins/dsh-extra-plan/lib/settings-contract.js | sourceLocator | L61 | （待补充） |  |
| plugins/dsh-extra-plan/lib/settings-contract.js | hostRowProjectionLocator | L63-66 | （待补充） |  |
| plugins/dsh-extra-plan/lib/settings-contract.js | legacyHostRowProjectionLocator | L68-72 | （待补充） |  |
| plugins/dsh-extra-plan/lib/settings-contract.js | createDefaultSettings | L147-149 | （待补充） |  |
| plugins/dsh-extra-plan/lib/settings-contract.js | getSettingDefinition | L165-167 | （待补充） |  |
| plugins/dsh-extra-plan/lib/settings-contract.js | validateSettingValue | L169-171 | （待补充） |  |
| plugins/dsh-extra-plan/lib/settings-contract.js | normalizeSettingValue | L173-175 | （待补充） |  |
| plugins/dsh-extra-plan/lib/settings.js | safeContextGet | L31-33 | （待补充） |  |
| plugins/dsh-extra-plan/lib/settings.js | absoluteRoot | L39-46 | （待补充） |  |
| plugins/dsh-extra-plan/lib/settings.js | rootFact | L48-52 | （待补充） |  |
| plugins/dsh-extra-plan/lib/settings.js | sameRoot | L54-59 | （待补充） |  |
| plugins/dsh-extra-plan/lib/settings.js | documentFact | L61-65 | （待补充） |  |
| plugins/dsh-extra-plan/lib/settings.js | profileIdentityOf | L67-84 | （待补充） |  |
| plugins/dsh-extra-plan/lib/settings.js | profileFactsOf | L86-88 | （待补充） |  |
| plugins/dsh-extra-plan/lib/settings.js | configEditorServiceOf | L90-93 | （待补充） |  |
| plugins/dsh-extra-plan/lib/settings.js | settingsPathContext | L95-150 | （待补充） |  |
| plugins/dsh-extra-plan/lib/settings.js | has | L97 | （待补充） |  |
| plugins/dsh-extra-plan/lib/settings.js | exactDocumentCapabilities | L152-162 | （待补充） |  |
| plugins/dsh-extra-plan/lib/settings.js | rank | L159 | （待补充） |  |
| plugins/dsh-extra-plan/lib/settings.js | authorizedDocumentRead | L164-180 | （待补充） |  |
| plugins/dsh-extra-plan/lib/settings.js | mountClientCarrier | L188-218 | （待补充） |  |
| plugins/dsh-extra-plan/lib/settings.js | schemaField | L221-227 | （待补充） |  |
| plugins/dsh-extra-plan/lib/settings.js | isLoopback | L236-239 | （待补充） |  |
| plugins/dsh-extra-plan/lib/settings.js | json | L241-244 | （待补充） |  |
| plugins/dsh-extra-plan/lib/settings.js | readJsonBody | L246-264 | （待补充） |  |
| plugins/dsh-extra-plan/lib/settings.js | plainJsonObject | L266-268 | （待补充） |  |
| plugins/dsh-extra-plan/lib/settings.js | activeSettingsRows | L274-279 | （待补充） |  |
| plugins/dsh-extra-plan/lib/settings.js | rowConfigOf | L281-287 | （待补充） |  |
| plugins/dsh-extra-plan/lib/settings.js | completeConfig | L289-299 | （待补充） |  |
| plugins/dsh-extra-plan/lib/settings.js | rowSummary | L301-313 | （待补充） |  |
| plugins/dsh-extra-plan/lib/settings.js | rawPatchInfo | L315-324 | （待补充） |  |
| plugins/dsh-extra-plan/lib/settings.js | inspectSettingsAuthority | L327-368 | （待补充） |  |
| plugins/dsh-extra-plan/lib/settings.js | findSettingsRow | L370-373 | （待补充） |  |
| plugins/dsh-extra-plan/lib/settings.js | readRawPatch | L375-377 | （待补充） |  |
| plugins/dsh-extra-plan/lib/settings.js | stableSnapshot | L380-397 | （待补充） |  |
| plugins/dsh-extra-plan/lib/settings.js | readUnifiedState | L402-438 | （待补充） |  |
| plugins/dsh-extra-plan/lib/settings.js | publicField | L440-454 | （待补充） |  |
| plugins/dsh-extra-plan/lib/settings.js | profileSyncPath | L456-466 | （待补充） |  |
| plugins/dsh-extra-plan/lib/settings.js | reportProfileSync | L468-480 | （待补充） |  |
| plugins/dsh-extra-plan/lib/settings.js | cacheProfileSync | L482-485 | （待补充） |  |
| plugins/dsh-extra-plan/lib/settings.js | cacheProfileSyncWithStale | L488-507 | （待补充） |  |
| plugins/dsh-extra-plan/lib/settings.js | requestProfileSync | L509-513 | （待补充） |  |
| plugins/dsh-extra-plan/lib/settings.js | proPayload | L515-533 | （待补充） |  |
| plugins/dsh-extra-plan/lib/settings.js | conflictProfileSync | L535-545 | （待补充） |  |
| plugins/dsh-extra-plan/lib/settings.js | createApiHandler | L547-628 | （待补充） |  |
| plugins/dsh-extra-plan/lib/settings.js | responseForProfile | L548-561 | （待补充） |  |
| plugins/dsh-extra-plan/lib/settings.js | apply | L630-740 | （待补充） |  |
| plugins/dsh-extra-plan/lib/settings.js | onResult | L636 | （待补充） |  |
| plugins/dsh-extra-plan/lib/settings.js | editorOf | L638-645 | （待补充） |  |
| plugins/dsh-extra-plan/lib/settings.js | documentPathOf | L646-654 | （待补充） |  |
| plugins/dsh-extra-plan/lib/settings.js | environmentSnapshot | L655 | （待补充） |  |
| plugins/dsh-extra-plan/lib/settings.js | conflictResult | L656-670 | （待补充） |  |
| plugins/dsh-extra-plan/lib/settings.js | syncEditor | L671-713 | （待补充） |  |
| plugins/dsh-extra-plan/lib/settings.js | settledSettings | L714-718 | （待补充） |  |
| plugins/dsh-extra-plan/lib/settings.js | settledError | L719-731 | （待补充） |  |
| plugins/dsh-extra-plan/lib/shell-mutation.js | commandTextOf | L36-48 | （待补充） |  |
| plugins/dsh-extra-plan/lib/shell-mutation.js | pwshCommandOf | L50 | （待补充） |  |
| plugins/dsh-extra-plan/lib/shell-mutation.js | bashCommandOf | L51 | （待补充） |  |
| plugins/dsh-extra-plan/lib/shell-mutation.js | shellWords | L56-80 | （待补充） |  |
| plugins/dsh-extra-plan/lib/shell-mutation.js | isInnerShellWord | L84-87 | （待补充） |  |
| plugins/dsh-extra-plan/lib/shell-mutation.js | isEnvAssignment | L88-90 | （待补充） |  |
| plugins/dsh-extra-plan/lib/shell-mutation.js | syntaxRuleOf | L97-101 | （待补充） |  |
| plugins/dsh-extra-plan/lib/shell-mutation.js | bareRuleOf | L103-107 | （待补充） |  |
| plugins/dsh-extra-plan/lib/shell-mutation.js | mutationTextEvidence | L109-199 | （待补充） |  |
| plugins/dsh-extra-plan/lib/shell-mutation.js | mutationTextMatches | L201-203 | （待补充） |  |
| plugins/dsh-extra-plan/lib/shell-mutation.js | mutationEvidence | L205-208 | （待补充） |  |
| plugins/dsh-extra-plan/lib/shell-mutation.js | pwshMutationEvidence | L210 | （待补充） |  |
| plugins/dsh-extra-plan/lib/shell-mutation.js | bashMutationEvidence | L211 | （待补充） |  |
| plugins/dsh-extra-plan/lib/shell-mutation.js | pwshMutationMatches | L212 | （待补充） |  |
| plugins/dsh-extra-plan/lib/shell-mutation.js | bashMutationMatches | L213 | （待补充） |  |
| plugins/dsh-extra-plan/lib/usage-ledger.js | lockPathOf | L11-13 | 从 active 路径派生固定的 .lock 路径。 | 锁名为 active + .lock。 |
| plugins/dsh-extra-plan/lib/usage-ledger.js | staleLockPathOf | L15-17 | 为释放流程生成同目录唯一临时路径，避免直接删除当前 owner 的 canonical lock。 | 仅供持 token 的 release 使用。 |
| plugins/dsh-extra-plan/lib/usage-ledger.js | errorCodeOf | L19-21 | 提取文件操作错误码供锁诊断与回滚分支使用。 |  |
| plugins/dsh-extra-plan/lib/usage-ledger.js | errorMessageOf | L23-25 | 将未知错误安全转换为诊断文本。 |  |
| plugins/dsh-extra-plan/lib/usage-ledger.js | pathContextOf | L27-36 | （待补充） |  |
| plugins/dsh-extra-plan/lib/usage-ledger.js | resolveLedgerTarget | L38-44 | （待补充） |  |
| plugins/dsh-extra-plan/lib/usage-ledger.js | resolveAbsoluteLedgerPath | L46-48 | （待补充） |  |
| plugins/dsh-extra-plan/lib/usage-ledger.js | resolveLedgerPath | L50-55 | （待补充） |  |
| plugins/dsh-extra-plan/lib/usage-ledger.js | ledgerTargetOf | L57-60 | （待补充） |  |
| plugins/dsh-extra-plan/lib/usage-ledger.js | authorizeLedgerWrite | L62-65 | （待补充） |  |
| plugins/dsh-extra-plan/lib/usage-ledger.js | ensureLedgerDirectory | L67-73 | （待补充） |  |
| plugins/dsh-extra-plan/lib/usage-ledger.js | validLockOwner | L75-80 | 校验锁 owner 的 PID、非空 token 与创建时间字段。 | owner JSON 合法性边界。 |
| plugins/dsh-extra-plan/lib/usage-ledger.js | readLockOwner | L82-89 | 读取并校验 lock JSON；失败只返回未知 owner，不改 canonical 文件。 |  |
| plugins/dsh-extra-plan/lib/usage-ledger.js | pidIsAlive | L91-102 | 只读诊断 owner PID 是否存活，供 stale-lock 结果判断。 | 不负责接管或删除锁。 |
| plugins/dsh-extra-plan/lib/usage-ledger.js | tryCreateLock | L104-175 | 以 wx 原子独占创建含 PID/token/createdAt 的锁；仅清理本次创建失败留下的自身文件。 | 已存在返回未取得，不触碰他者 lock。 |
| plugins/dsh-extra-plan/lib/usage-ledger.js | cleanupCreatedLock | L112-122 | 清理本次 tryCreateLock 自己成功创建但写入/关闭失败的 lock。 | 不用于 stale-lock 维护。 |
| plugins/dsh-extra-plan/lib/usage-ledger.js | decorateFailure | L123-139 | 把 close/清理失败和残留路径补入锁创建错误诊断。 |  |
| plugins/dsh-extra-plan/lib/usage-ledger.js | sleepSync | L177-179 | 以有界 Atomics.wait 实现跨进程短等，不形成无界等待。 |  |
| plugins/dsh-extra-plan/lib/usage-ledger.js | usageLedgerLockPath | L181-183 | 导出 active 对应的 lock 路径，供统计/归档诊断。 | public lock API。 |
| plugins/dsh-extra-plan/lib/usage-ledger.js | acquireUsageLedgerLock | L185-215 | 导出有界原子加锁：返回 owner/token，超时返回 timeout；检测到死 PID 返回 stale-lock，canonical lock 原样保留。 | 活 PID 不强删；stale 需确认 owner 后显式维护。 |
| plugins/dsh-extra-plan/lib/usage-ledger.js | releaseUsageLedgerLock | L217-248 | 核对 token 后把自己的 lock 原子移到唯一临时路径再删除，避免误释他者 lock；失败返回明确 released:false/reason。 | public release API；调用方不得静默成功。 |
| plugins/dsh-extra-plan/lib/usage-ledger.js | createUsageLedger | L250-530 | 按 enabled/path 建立同步 V2 fold、共享锁、cursor 与单 session 回收，返回 foldUsage 与 disposeSession。 | cursor 路径为 ledgerPath + .cursor.json；被 index.js 的 usageLedger 配置调用。 |
| plugins/dsh-extra-plan/lib/usage-ledger.js | readUsageCursorTable | L290-321 | 读取 cursor JSON 并返回 {ok, table}：ENOENT 按空表，其余读取/解析/形状错误降级并一次告警。 | createUsageLedger 内部闭包；降级保留原始 cursor 字节。 |
| plugins/dsh-extra-plan/lib/usage-ledger.js | warnUsageCursorDegraded | L324-328 | 对 cursor 读取/形状降级发出每实例一次告警。 | createUsageLedger 内部闭包。 |
| plugins/dsh-extra-plan/lib/usage-ledger.js | warnStaleLock | L330-338 | 对每个 writer 实例的 stale-lock 首次阻塞发出一次可见 owner(PID/token)告警；不接管、不删除 canonical lock，要求核实 owner 后显式维护。 | createUsageLedger 内部闭包。 |
| plugins/dsh-extra-plan/lib/usage-ledger.js | usageCursorEntryOf | L342-350 | 只接受单会话 V2 cursor 的 {seq,index} 非负整数形状；数字旧项及其它形状一律无效并回退。 | createUsageLedger 内部闭包。 |
| plugins/dsh-extra-plan/lib/usage-ledger.js | isUsageContext | L352-360 | 校验 session/parent/root/preset/depth/role 类型与必填边界；rootSessionId、agentPreset 可为空字符串，只有非法 context 被拒绝。 | foldUsage 内部闭包；非法 context 不落账。 |
| plugins/dsh-extra-plan/lib/usage-ledger.js | foldUsage | L368-527 | 在共享锁临界区按 session.seq/snapshotEvents 增量或回退全量扫描 assistant/message；只写固定15键的 schemaVersion=2 行、身份血缘、provider/model 与四桶，append 成功后推进 cursor。 | createUsageLedger 内部闭包；合法空 root/preset 落账，锁忙/timeout 静默返回 delayed 且零推进、后续 fold 补记；stale 每实例一次告警并由维护者核实 owner 后显式维护；release 失败返回 failed/release-failed 且不伪装回滚已提交写入。 |
| plugins/dsh-extra-plan/scripts/generate-runtime-defaults.mjs | repositoryRootFromKnownLayout | L16-24 | （待补充） |  |
| plugins/dsh-extra-plan/scripts/generate-runtime-defaults.mjs | roleDefinitionFile | L48-50 | （待补充） |  |
| plugins/dsh-extra-plan/scripts/generate-runtime-defaults.mjs | runtimeDefaultsFromTemplate | L52-57 | （待补充） |  |
| plugins/dsh-extra-plan/scripts/generate-runtime-defaults.mjs | renderRuntimeDefaults | L59-69 | （待补充） |  |
| plugins/dsh-extra-plan/scripts/generate-runtime-defaults.mjs | clientFieldMetadata | L75-88 | （待补充） |  |
| plugins/dsh-extra-plan/scripts/generate-runtime-defaults.mjs | clientFieldLines | L90-96 | （待补充） |  |
| plugins/dsh-extra-plan/scripts/generate-runtime-defaults.mjs | renderClientFieldBlock | L98-109 | （待补充） |  |
| plugins/dsh-extra-plan/scripts/generate-runtime-defaults.mjs | markerMatches | L111-114 | （待补充） |  |
| plugins/dsh-extra-plan/scripts/generate-runtime-defaults.mjs | clientFieldMarkerRange | L116-124 | （待补充） |  |
| plugins/dsh-extra-plan/scripts/generate-runtime-defaults.mjs | renderClientFields | L126-131 | （待补充） |  |
| plugins/dsh-extra-plan/scripts/generate-runtime-defaults.mjs | separatorIndexOf | L136-138 | （待补充） |  |
| plugins/dsh-extra-plan/scripts/generate-runtime-defaults.mjs | topLevelRowsOf | L141-151 | （待补充） |  |
| plugins/dsh-extra-plan/scripts/generate-runtime-defaults.mjs | secondDocumentOf | L154-159 | （待补充） |  |
| plugins/dsh-extra-plan/scripts/generate-runtime-defaults.mjs | indentBlock | L161-164 | （待补充） |  |
| plugins/dsh-extra-plan/scripts/generate-runtime-defaults.mjs | indentOf | L166-170 | （待补充） |  |
| plugins/dsh-extra-plan/scripts/generate-runtime-defaults.mjs | shiftBlock | L172-180 | （待补充） |  |
| plugins/dsh-extra-plan/scripts/generate-runtime-defaults.mjs | rawBlockFrom | L186-197 | （待补充） |  |
| plugins/dsh-extra-plan/scripts/generate-runtime-defaults.mjs | quoteYamlSingle | L199-201 | （待补充） |  |
| plugins/dsh-extra-plan/scripts/generate-runtime-defaults.mjs | assertDefinition | L203-211 | （待补充） |  |
| plugins/dsh-extra-plan/scripts/generate-runtime-defaults.mjs | renderPresetDefinition | L213-232 | （待补充） |  |
| plugins/dsh-extra-plan/scripts/generate-runtime-defaults.mjs | mainExtraPlanRowBlock | L235-246 | （待补充） |  |
| plugins/dsh-extra-plan/scripts/generate-runtime-defaults.mjs | personaPrefixBlock | L249-275 | （待补充） |  |
| plugins/dsh-extra-plan/scripts/generate-runtime-defaults.mjs | roleToolsBlock | L278-289 | （待补充） |  |
| plugins/dsh-extra-plan/scripts/generate-runtime-defaults.mjs | findRowById | L292-303 | （待补充） |  |
| plugins/dsh-extra-plan/scripts/generate-runtime-defaults.mjs | mainToolPresentationMode | L309-321 | （待补充） |  |
| plugins/dsh-extra-plan/scripts/generate-runtime-defaults.mjs | assertRoleSource | L323-343 | （待补充） |  |
| plugins/dsh-extra-plan/scripts/generate-runtime-defaults.mjs | assertRoleDefinition | L345-364 | （待补充） |  |
| plugins/dsh-extra-plan/scripts/generate-runtime-defaults.mjs | renderRoleDefinitions | L371-417 | （待补充） |  |
| plugins/dsh-extra-plan/scripts/generate-runtime-defaults.mjs | assertParses | L419-427 | （待补充） |  |
| plugins/dsh-extra-plan/scripts/generate-runtime-defaults.mjs | checkOutput | L429-433 | （待补充） |  |
| plugins/dsh-extra-plan/scripts/generate-runtime-defaults.mjs | publishFsOpsOf | L438-441 | （待补充） |  |
| plugins/dsh-extra-plan/scripts/generate-runtime-defaults.mjs | errorText | L443-445 | （待补充） |  |
| plugins/dsh-extra-plan/scripts/generate-runtime-defaults.mjs | uniquePaths | L447-449 | （待补充） |  |
| plugins/dsh-extra-plan/scripts/generate-runtime-defaults.mjs | cleanupPublishFiles | L451-461 | （待补充） |  |
| plugins/dsh-extra-plan/scripts/generate-runtime-defaults.mjs | restorePublishedEntry | L463-476 | （待补充） |  |
| plugins/dsh-extra-plan/scripts/generate-runtime-defaults.mjs | publishFailure | L478-490 | （待补充） |  |
| plugins/dsh-extra-plan/scripts/generate-runtime-defaults.mjs | normalizedOutputEntries | L492-501 | （待补充） |  |
| plugins/dsh-extra-plan/scripts/generate-runtime-defaults.mjs | publishGeneratedOutputs | L503-565 | （待补充） |  |
| plugins/dsh-extra-plan/scripts/generate-runtime-defaults.mjs | generatorPathContext | L568-575 | （待补充） |  |
| plugins/dsh-extra-plan/scripts/generate-runtime-defaults.mjs | inputPathSpec | L577-584 | （待补充） |  |
| plugins/dsh-extra-plan/scripts/generate-runtime-defaults.mjs | readGeneratorInput | L586-592 | （待补充） |  |
| plugins/dsh-extra-plan/scripts/generate-runtime-defaults.mjs | pathEntryExists | L594-602 | （待补充） |  |
| plugins/dsh-extra-plan/scripts/generate-runtime-defaults.mjs | ensureWorkspaceOutputParent | L604-618 | （待补充） |  |
| plugins/dsh-extra-plan/scripts/generate-runtime-defaults.mjs | generatorOutputTarget | L620-628 | （待补充） |  |
| plugins/dsh-extra-plan/scripts/generate-runtime-defaults.mjs | outputEntryTarget | L630-640 | （待补充） |  |
| plugins/dsh-extra-plan/scripts/generate-runtime-defaults.mjs | authorizeOutputEntries | L642-655 | （待补充） |  |
| plugins/dsh-extra-plan/scripts/generate-runtime-defaults.mjs | outputMetadata | L657-665 | （待补充） |  |
| plugins/dsh-extra-plan/scripts/generate-runtime-defaults.mjs | generateRuntimeDefaults | L676-758 | （待补充） |  |
| plugins/dsh-extra-plan/scripts/generate-runtime-defaults.mjs | invokedAsMain | L760-763 | （待补充） |  |

---

*本文件由脚本增量维护；直接编辑功能描述/备注列是安全的。*
