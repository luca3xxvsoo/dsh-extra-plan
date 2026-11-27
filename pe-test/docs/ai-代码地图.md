# 代码地图（dsh-extra-plan）

> **维护分工**：行号区间/增删行由脚本 node pe-test/tools/代码地图生成.mjs 增量同步；**功能描述、备注、以及「意图速查」整节由 AI/人维护**（脚本刷新不会覆盖）。
> **用法**：先看「意图速查」按意图词找函数名 → 再到「函数索引」按函数名取行号区间 → read 该区间。
> 上次同步：2026-11-27 21:40:33（脚本自动更新时间戳行）

## 意图速查（人工维护：意图词 → 函数名；行号请到下方「函数索引」按函数名取）

> 用法：拿用户/AI 口里的词在「想找什么」列 grep → 得函数名 → 到「函数索引」grep 该函数名 → 取行号区间 → read 该区间。
> 本节引用的函数名若不存在于索引，生成脚本会报 `[导航失效]`（防止入口过期）。

| 想找什么（含同义词/英文标识） | 文件 | 函数名 |
|:--|:--|:--|
| 双根路径策略／H-W 用途与 Other 拒绝／变量、drive-relative、链接与最近父级边界／只读能力和写入预检 | lib/path-policy.js | createPathContext、resolveWorkspacePath、resolveHostPath、assertAllowedPath、validateReadTarget、prepareWriteTarget |
| W 工作区／fixture、证据与隔离环境（结构锚、W-only、无用户目录探测） | pe-test/_shared/workspace-paths.mjs | getWorkspaceRoot、makeFixtureDir、resolveEvidencePath、createIsolatedEnv |
| 显式 Host 代码验证根／受控预加载／缺根拒绝（不回退 profile） | pe-test/_shared/host-preload.mjs | explicitInstallRoot |
| 闸门路线确认／目的确认／澄清／流程状态（route/purpose/clarified 三字段；route 取 none/main/executor/plan 四值；唯一推进源是 extra_plan_gate 的 tool/result 事件，含 run_code 内嵌套派发形态；outcome 四种） | index.js、lib/gate-decisions.js、lib/extra-plan-gate-tool.js | deriveFlowState、applyGateOutcome、mainGateReason、routeDenyReason、planDenyReason、executorDenyReason |
| 探查预算／额度／剩余次数／耗尽（exploreBudget/budget；剩余 ≤3 注入的提醒消息 source 用生产者自有 kind `plugin:dsh-extra-plan`——v4 行准入禁旧包裹 `plugin`） | lib/planner-budget.js、index.js | toolCallCount、toolCallsSinceUser、withPlannerPromptSuffix、budgetNoticeText、budgetReminderText、budgetReminderMessage、budgetReminderSent、budgetExhaustedReason、budgetExceeded |
| run_code 静态组预审／绕道拆解／调用点扫描（decompose）／动态重入 | lib/run-code-static.js、index.js | decomposeRunCode、collectRunCodeSites、runCodeGroupDenyReason、visit |
| run_code 多调用容错／教学文案（容错检查开关） | lib/run-code-static.js | runCodeCatchGateReason |
| ask 与闸门工具结果返回用户层／返回链闸门 | lib/run-code-static.js | askOrGateReturnGateReason、reasonFor |
| 单实例调用点上限／循环放大 | lib/run-code-static.js、lib/runtime-lifecycle.js | runCodeSiteCount、noteRunCodeSubCall、runCodeDispatchCapText |
| job_output 禁 wait:true／同 job 查重／放行后记录计数器 | index.js | jobOutputGateReason、recordJobOutputCall |
| job_kill 不受插件路线限制／main send_message 目标解析与方向限制／job_list·list_agents 同锚点防轮询／child send_message 硬拒 | index.js、lib/gate-decisions.js | mainGateReason、messageTargetIdOf、finish、childControlGateReason、pollGuardGateReason、recordPollGuardCall |
| 原始 child 预审／直呼与 run_code 成员控制拒绝（unknown/断链也覆盖） | index.js、lib/agent-session.js、lib/gate-decisions.js | apply、isSubagentChild、childControlGateReason、runCodeGroupDenyReason |
| 命令文本提取／写操作判定／只读角色 shell 拒绝文案／触发依据（write/拦截） | lib/shell-mutation.js、lib/gate-decisions.js、index.js、lib/run-code-static.js | commandTextOf、pwshCommandOf、bashCommandOf、mutationTextEvidence、pwshMutationEvidence、bashMutationEvidence、pwshMutationMatches、bashMutationMatches、withShellEvidence、shellMutationReason、runCodeTextOf、codeMutationHints |
| 锚定引导／F-L 首轮极简／bootstrap／HN-HB-HP／F 段 tool:read 手写文案（bootstrapReadHint）／三路工具面裁剪诊断与即时失败 | index.js、lib/assembly-presentation.js | isBootstrapPhase、projectAssemblyForPresentation、anchoredDiagStateOf、toolRestrictionDiag、restrictionsSnapshotOf、armToolRestriction、releaseToolRestriction |
| A/C/M 展示投影／C7 过滤／Pure PTC 手写 read（变量② bootstrapReadHint）／SDK 重建 | index.js、lib/assembly-presentation.js | projectAssemblyForPresentation、renderFilteredToolsSdk、resolveToolsSdkRenderer、filteredCordisSchemas、sdkSchemasForRendering、toolSdkSchemasOf |
| P2-2 SDK 文本复用／agent-only（仅 Agent）cache／F-L 分离／三元组失效／dispose-restart／失败不缓存／并发合并／计数硬门槛 | index.js、lib/assembly-presentation.js、lib/sdk-text-cache.js | createSdkTextCache、sdkSchemasFingerprint、sdkTextCacheEntryMatches |
| skill catalog 暂隐／普通 skill 保留／C 热读与 A/F 优先／展示隐藏不等绑定隔离／HP1 | index.js、lib/assembly-presentation.js | skillCatalogEntriesOf、renderSkillCatalogText、projectSkillCatalogDecision、shouldHideCreativeCatalog |
| durable context gate／F-L source 过滤／agent-instructions／skill-catalog／按 kind context 去重／Session surface | index.js、lib/gate-decisions.js | filterBootstrapContextDecision、dedupeProjectedContextDecision、isBootstrapPhase、isAnchoredContextGate |
| 方案/询问工具在未确认路由下的拒绝文案（plan route） | index.js | planDenyReason |
| 执行类委派只在 route=executor 时放行（未放行的拒绝文案） | lib/gate-decisions.js、index.js | executorDenyReason、mainGateReason |
| 规划子代理分支闸门（planner 写禁+预算） | index.js | plannerGateReason、shellMutationReason |
| 会话事件快照／角色常量与身份识别（ROLE_IDS/ROLE_ORDERS 只描述身份与顺序，不承载权限）／单次快照复用（execEvents）／planner descriptor 缓存／usage 血缘上下文 | lib/agent-session.js、lib/agent-runtime.js、lib/runtime-lifecycle.js、lib/role-contract.js、index.js | sessionEvents、isSubagentChild、isLiveDelegation、createAgentRuntime、applyChildPolicy、isChild、isPlannerChild、toolSchemasOf、usageContextOf、usageRootOf、childBaseline |
| 同步 usage 扫描/聚合/覆盖式更新／路径授权（同步入口 `scanUsageRows`/`archiveLedger`/`startupArchive`；扫描白名单、v4 多帧解压、九字段身份合并、单调性保护与单 archive temp→rename；`startupArchive` 先以日志 `mtime`→账本 `ts` 做增量判定裁定 changed，当轮内存模式/血缘识别由 `scanSessionPresets` 只对 changed 文件按递进窗口读首帧，白名单由 `startupArchiveUnsafe` 过滤后才解析，不读写持久 `session-presets`；默认 Host 账本为 `logs/dsh-extra-plan/extra-plan-usage-ledger.jsonl`，错误诊断按需写 `logs/dsh-extra-plan/extra-plan-usage-errors.jsonl`（`ts`/`reason`/`message` 均为字符串），共享目录中的其他日志由各自功能独立管理，统计只读快照不负责归档事务） | lib/usage-ledger.js | enumerateSessionLogs、scanUsageRows、scanUsageRowsOf、scanSessionPresets、ensureLedgerDirectory、publishArchive |
| 会话状态生命周期／disposed 收尾／同步扫描聚合与单调性保护／root 与自身 session 血缘（断链/循环仍以空 root 合法落账；rootSessionId/agentPreset 可空，非法 context 拒绝）／四桶字段（provider、input/cacheRead/cacheWrite/output）／账本按九字段身份恒等一行、重复扫描结果恒等、本次扫描小于现状保留旧值并告警一次、`archiveRowOf` 的 `ts` 取成功解析 session 文件 ISO 毫秒 mtime／后台 controller owner 单飞与同根串行、取消提交边界 | index.js、lib/agent-runtime.js、lib/usage-ledger.js、lib/usage-ledger-background.js、lib/usage-ledger-worker.js | usageContextOf、usageRootOf、mergedArchiveGroups、archiveRowOf、noteRunCodeSubCall、childBaseline、startUsageLedgerBackground、createWorkerHandle、settleAfterExit、validateAndRebuild |
| 启动归档／插件内置自动归档／H 默认账本唯一严格归档（默认账本为 `logs/dsh-extra-plan/extra-plan-usage-ledger.jsonl`；诊断仅按需写 `logs/dsh-extra-plan/extra-plan-usage-errors.jsonl`，每行仅有字符串 `ts`/`reason`/`message`；共享目录可含其他日志，本模块只管理本人两目标与 temp/lock；settings 行 apply 期只注册调度，存在 appReady 时在单层 root `ctx.effect` 内 `onReady` 之后经 `setImmediate` 发起固定 Worker，缺失或无 `onReady` 时回落 apply 内直接发起；主线程只传 pathContext 快照，Worker 复用 `startupArchive` 完成扫描/解压/聚合/严格解析/序列化/发布，失败只 `failed`/warn 不回退；`archiveLedger`/`startupArchive` 仍可同步直调；先按日志当前 `mtime` 与账本 `ts` 做统一 ISO 毫秒增量比较裁定 changed（相同跳过完整用量重扫，变化/回退/未入账才解析），只对 changed 文件按 512、8192、65536、整份递进窗口读首帧并判白名单、命中才解析；模式/血缘结果仅当轮内存，成功记文件 mtime，失败批次不推进 archive 水位并重试；不读写持久 `session-presets`，健康 up-to-date 零锁零写；首次 archive rename 前可协作取消并清本人 temp/lock，提交后返回真实 archived；单 archive temp→rename，不是双文件事务；预算 STARTUP_ARCHIVE_BUDGET_MS=3000ms 只在 archive 阶段检查点生效，不是扫描期限；可捕获的后台错误只报告失败/跳过并按需诊断留痕，apply 不等待归档、不会回退主线程同步扫描；账本路径由启动归档固定拼接，配置项 usageLedger.path 已退役；首行说明行位置与固定15键校验由本实现负责，options.onCheck 仅测试探针） | lib/usage-ledger.js、lib/usage-ledger-background.js、lib/usage-ledger-worker.js | archiveLedger、startupArchive、startupArchiveUnsafe、parseStrictLedgerText、assertUniqueArchiveRows、archiveTextOf、publishArchive、reportFailure、recordDiagnostic、acquireArchiveLock、startUsageLedgerBackground、createWorkerHandle |
| 方案与验收落盘／save_plan 双写（逐文件操作与 M 点合同；修改前范围/唯一原文锚点→未来验收定位；真实源核实与行漂移取证；主会话侧任意路由态放行的受限规划工件，仅写 cwd/.extra-plan；工具不自动调度） | lib/save-tool-factories.js、lib/save-contract.js、index.js | defineSavePlan、registerSavePlan、saveArtifactBase |
| 落盘单次提交／有限清理（atomic/commit） | lib/save-persistence.js、index.js | atomicCommit |
| 线索落盘／save_probe／证据报告（probe/evidence；限制值唯一来自 `save-contract.js#PROBE_LIMITS`；step-00 PR23/PR34/PR35 回归；主会话侧放行条件保持现状——route=plan + 目的已定 + 澄清完成；extractProbeEvidenceRefs 顺序固定：整体成对剥除（循环）→ 按顿号/分号/竖线拆分 → 逐段成对剥除 + trim → 过滤空串 → 去重；拆分符与剥除集均不含空格、半角逗号、`.`、`/`，单侧一律不剥） | lib/save-contract.js、lib/save-probe-validation.js、lib/save-tool-factories.js、index.js | validateProbe、renderProbeMarkdown、extractProbeEvidenceRefs |
| save_plan 限制值／内部确定性 summary／双路径 ContentBlock 投影（SAVE_PLAN_LIMITS；formatSavePlanSummary 保留内部摘要口径，renderSavePlan 只把 paths 投影为唯一 text ContentBlock；并保留 save_probe 合同） | lib/save-contract.js | sanitizeTaskName、timestamp、sessionTagOf、saveArtifactBase、formatSavePlanSummary、renderSavePlan、renderProbeMarkdown、renderSaveProbe、extractProbeEvidenceRefs |
| save_probe 校验／路径存在性与聚合拒绝 | lib/save-probe-validation.js | validateProbe、probePathOf |
| save 工具工厂／严格校验顺序／paths-only／真实源核实 owner／W pathContext | lib/save-tool-factories.js | pathContextOf、resolveWorkspaceEntry、createSaveToolFactories、defineSavePlan、resolveSaveContext、verifyPlanSources、defineSaveProbe |
| edit_plan_draft／草稿修复／草稿回写重跑／.md_mid 行级编辑／转正（失败草稿就地修复后重跑与 save_plan 同源的合同/源/证据校验，通过即转正为成对正式 .md 并删草稿） | lib/plan-draft-tool.js | createPlanDraftToolFactories、defineEditPlanDraft、applyEdits、draftBaseOf |
| save_plan 模式／任务块／卷首职责与块边界／逐文件与修改点解析 | lib/save-plan-validation.js | parseTaskDocument、validateIds、validateTaskShape |
| save_plan 路径／资源／文件所有权与组 DAG（initialState 仅静态资格）／文件点与定位摘要 | lib/save-plan-validation.js | pathIssue、parseResources、validatePlanRelations、buildInternalOrder、buildSummary |
| save_plan 检查引用／验收组／收尾全局／早拒／双文档文件点映射 | lib/save-plan-validation.js | parseCheckRefs、validateChecks、validateClosure、validateGlobal、validateSavePlanContract |
| step-00／step-06 save_plan 通用合同回归覆盖（模式、任务/组 DAG、资源/检查引用、收尾/全局、摘要/早拒、paths-only 与零副作用） | pe-test/tools/step-00-全流程回归.mjs、pe-test/tools/step-06-线索落盘.mjs |  |
| 五份文档的通用派遣／验收边界（工件自包含；执行组与人数分离；执行者自检与 reviewer 验收分离；冻结、证据复用、失败复验、生产与 HUMAN 边界） | READAI.md、pe-test/docs/ai-概览.md、pe-test/docs/ai-机制设计.md、pe-test/docs/ai-流程备查.md、pe-test/docs/ai-维护手册.md |  |
| PTC F→L／native HN 与 ptc 聚合面实机取证 | pe-test/docs/ai-实机闸门测试流程.md |  |
| 实机子代理模型／提供方／planner 引导取证（A42/A43、C11/C12、HUMAN；显式 `--session`+`--sessions-dir`（宿主数据根加 `--host-root`、直接 child 加 `--discover-children`）+ 显式 `PLANNER_PROMPT_SUFFIX`；默认索引与 `--full` 原文/raw 分层；request/header attempted route（尝试路由） 与 assistant/message actual provenance（实际来源） 分栏；suffix 等级与 exact match；共享定位器显式有界选择只解析命中直接 child（上限 512 候选/单日志头 262144 字节）） | pe-test/tools/step-07-子代理模型与引导取证.mjs |  |
| 80格 A/C/M/F-L 路由与目录断言／显式 header catalog 取证 | pe-test/tools/step-04-路由与写闸门.mjs、pe-test/tools/step-04-工具清单查看.mjs |
| MJS 三模式输出合同／有限摘要／稳定 JSON／HUMAN 双通道 raw hash | pe-test/_shared/test-output.mjs、pe-test/tools/一键step测试.mjs |  |
| 探查者委派／禁止 planner 派探查（subagent_probe） | index.js、lib/model-routing.js | subagentProbeGateReason、resolveOtherAgentEntry |
| 只读子代理／reviewer 模型只读（验收者/readonly）；reviewer 宿主 workspace-write | index.js | childReadonlyGateReason、shellMutationReason、isReadOnlyChildByCatalog |
| 四角色 definition 工具面／main control 保留／Cordis 只读绑定 | assets/presets/extra-plan/agent.cordis.yml、assets/presets/extra-plan/preset-definition-<role>.generated.yml、index.js | roleDefinitionsWithPresentation、toolSchemasOf |
| child 控制矩阵与宿主角色工具面测试入口 | pe-test/tools/step-00-全流程回归.mjs、pe-test/tools/step-04-路由与写闸门.mjs、pe-test/tools/step-05-角色预设宿主回归.mjs |  |
| 子代理宿主 mode／四角色按本 child 绑定与显式 override 幂等 | lib/agent-runtime.js、index.js | createAgentRuntime、applyChildPolicy、childBaseline |
| 工具目录折叠／PTC 单入口（catalog/ptc） | index.js | catalogIsCollapsed |
| 诊断日志保留期裁剪／前缀边界算法（保留期/裁剪/过期清理/prune；除 usage ledger 外的全部诊断 JSONL 统一按固定 UTC+8 北京时间昨日零点保留今天/昨天两个自然日；分界线=首个可解析且 cutoff<=ts<=now 的行；坏行/空行/未来行随前缀删除，分界后原样保留含乱序过期行；零写=文件0行或分界为0，全前缀候选清空为空文件；usage-ledger 归档链独立管理不在此裁剪） | lib/log-retention.js | pruneDiagnosticLogs、findPrefixBoundary、copyFromBoundary、parsedTsOf、beijingYesterdayCutoffMs |
| 设置后端／唯一全局 owner／anchored 诊断清理唯一 owner／settings-only no-remount（11 项 volatile Config；adapter failure 独立；10 热读/1 需重启（toolPresentationMode）/webFetch 免重启/gateWords restart；默认对象与 UI metadata 分源） | lib/settings.js、lib/settings-contract.js、lib/preset-settings.js、lib/preset-sync.js | apply、createDefaultSettings、effectiveRowConfig、resolveUnifiedConfig、restateSettingsConfig、findPluginsRow、applyPlan、mountPresetSync、initialMount、settledSettingsUpdate、structuralHandoff、diagnosticPruneRootOf、diagnosticPruneStateOf、diagnosticPruneKey、startupPruneDiagnosticLogsForApply |
| 设置值定位与捕获（preset-yaml 行定位与 raw 诊断；11 项全局行解析） | lib/preset-yaml.js | captureRowSettings、resolveSetting、findTextLocatorMatches |
| 配置热读／生效标志／后端权威行更新无需重启（live-config/hot-read；增强 stamp dev/ino/size/mtimeNs/ctimeNs，兼容回退 ino/size/mtimeMs/ctimeMs；当前目标与 pathContext 分层） | lib/live-config.js、index.js | createLiveConfig、refresh、read、currentResolved、currentContext、readDiskValues、statStamp、pick |
| 预设核对／纯 definition／settings-only idle 与 settled-only/structuralHandoff 分离 | lib/preset-sync.js | syncPreset、assetDefinition、definitionWithProjection、resolveUnifiedConfig、restateSettingsConfig、pluginRows、pluginRowIds、applyPlan、structuralFingerprint、mountPresetSync、initialMount、settledSettingsUpdate、structuralHandoff、reportSettledError |
| 同页共享客户端表单／仅经 detail.section 渲染于 bundle 详情页行列表之后（自绘标题；字段常量只来自生成器标记区块；不注册 bundle.config/row/item/tab，本包 bundle.config 槽被任何一方注册条目时 detail.section 让位） | lib/client.js、scripts/generate-runtime-defaults.mjs | apply、SettingsCard、ExtraPlanForm、DetailSettingsSection、registerClientSurfaces |
| 十一项默认值 sourceLocator → DEFAULT_SETTINGS／兼容别名／消费者；纯 definition、四角色 definition 与 client 标记区块生成／last-known-good／事务发布（默认仓库七输出；自定义 client 默认关闭；--check 零写） | lib/preset-settings.js、lib/settings-contract.js、scripts/generate-runtime-defaults.mjs、lib/preset-defaults.generated.js、lib/client.js、assets/presets/extra-plan/preset-definition.generated.yml | resolveTemplateSettingDefault、runtimeDefaultsFromTemplate、renderRuntimeDefaults、renderClientFieldBlock、renderClientFields、renderPresetDefinition、topLevelRowsOf、generateRuntimeDefaults、normalizedOutputEntries、publishGeneratedOutputs、checkOutput |
| 闸门关键词单一来源／6 键唯一手工编辑位／prompt variable 注册／旧词拒绝／严格校验（gateWords/extra_plan_*） | assets/presets/extra-plan/agent.cordis.yml、lib/gate-words.js、index.js | validateGateWords、createGateRuntime、normalizeGateLabel、deriveFlowState、mainGateReason |
| gateWords 启动核对／厂商模板整组校验／settings 行补齐 | lib/preset-sync.js | syncPreset、readDefinitionGateWords、assertTemplateGateWords |
| runtime-static 纯 helper（cause-chain） | lib/runtime-static.js | causeChainOf |
| extra_plan_gate 结果解码／gate 与 outcome 分派／状态推进（answered 推进、skipped 与 channel-error 不改字段、cancelled 清 route/purpose/clarified；取消判别含取消类错误码与 cancel/abort 文案） | lib/gate-decisions.js、lib/extra-plan-gate-tool.js | gateOfArgs、resultOfBlocks、firstTextOfBlocks、applyGateOutcome、deriveFlowState、isCancelError |
| 代码地图自身维护／口径／严格模式 | pe-test/tools/代码地图生成.mjs（不在索引范围，读文件头注释） |  |
| 新载体选型与 isolate 审计（纯 definition／官方 adapter／三组 isolate 名单：extra-plan-group.extraPlan · compaction.compaction+toolResultPruner · delegation.subagentModelSelection） | assets/presets/extra-plan/agent.cordis.yml、assets/presets/extra-plan/preset-definition.generated.yml、READAI.md（「当前兼容与安全边界」「真相源短表」） |  |
| 创造 skill 静态注册／bundledSkillDir／rc.1 兼容三名 cordis-plugin-development、editing-cordis-compositions、cordis-composition-reference 与 rc.2/rc.3 共用的 dsh-doc／C=0 与 C=1 的 catalog 语义／C 热读与 A/F 优先／展示隐藏不等绑定隔离（skill-filesystem 行的 config.bundledSkillDir 指向 agent-preset 包内 skills/ 且 watch: false——0.2.0-rc.2 换通道修法，旧 customSkillDirs 经 ctx.fs 扫 asar 抛非 absent 错；「不注册」已改为 catalog 隐藏） | assets/presets/extra-plan/agent.cordis.yml、lib/assembly-presentation.js、index.js | shouldHideCreativeCatalog、projectSkillCatalogDecision、skillCatalogEntriesOf、renderSkillCatalogText |
| 0.1.7 服务名换代／ptcRuntime／SDK renderer 语言取值 | index.js、lib/assembly-presentation.js | apply、resolveToolsSdkRenderer、renderFilteredToolsSdk、sdkSchemasForRendering |
| tool-jobs 完成通知解锁（`agent/inbox/claimed` 同步主入口 + `tools/pre-execute` durable snapshot fallback；两入口共用 `consumeToolJobsNotice`；严格校验非空 `message.id`、source.kind=tool-jobs/form=notice 与正文 /background job (\S+)/；session 内以 notice `message.id` 判重，同 id 跨 claimed/durable 幂等，不同 id 即使复用 jobId 也代表新通知实例；双动作：①jobId 只清当前 session 对应的 job_output 计数 ②job_list/list_agents 轮询守卫 pollGuardCounters 清整表；consumed 在双解锁后写入，用户/agent-message 锚点不删 notice-id Set，disposeSession 才回收，重复/坏输入零副作用；HK9：旧 plugin kind 已废） | index.js | consumeToolJobsNotice、apply、recordJobOutputCall、jobOutputGateReason、pollGuardGateReason |
| agent/created 钩子（serial；agent/session-start 已删除）／会话启动基线＋save_plan/save_probe 注册，整块吞错不阻断会话创建 | index.js（agent/created 调用点）、lib/agent-runtime.js（childBaseline/isPlannerChild 定义）、lib/agent-session.js（isSubagentChild 定义） | apply、childBaseline、isPlannerChild、isSubagentChild、registerSavePlan、registerSaveProbe、probeClaimFor |
| MALFORMED_RESPONSE 限次自愈／请求失败兜底 retry／注入模型可读提示（source.kind 用生产者自有 `plugin:dsh-extra-plan`；developer/message 须自带 ≥1 的 turn/step，宿主 append 不补坐标；坐标缺失/非正整数 → 不注入但仍返回 retry） | index.js | malformedRecovery、recordRequestError |
| 会话日志格式 v4 代际／session.v4.jsonl.zstd／共享 session-finder/logPath 三代候选名并存（v4/v3/旧名，未知形状归 v0）；step-06/07 与 step-06-08-v4取证回归 只接受 session.v4.jsonl.zstd | pe-test/_shared/session-finder.mjs、pe-test/tools/step-07-子代理模型与引导取证.mjs |  |

- step-99 文件说明：只读 usage 统计 CLI；调用必须显式提供账本位置，普通相对路径固定为 W 目标，显式 Host 目标配合 `--host-root` 与授权上下文；默认 Host 落点为 `logs/dsh-extra-plan/extra-plan-usage-ledger.jsonl`，默认模式直接读取单一 `extra-plan-usage-ledger.jsonl`（不取锁：写入侧是单 archive temp→rename 原子发布，读者只见完整版本），容错解析与宽松合并计数（坏 JSON、非账本对象、说明行仅计数，零写入）；`--compare` 只读对拍（额外跑现场扫描并按 role→model 对拍，零写盘）；旧 `strict:true` 显式拒绝 `strict-parser-removed`，`--archive` 在 IO 前显式拒绝 `usage-removed`；错误诊断按需写 `logs/dsh-extra-plan/extra-plan-usage-errors.jsonl`，每行仅有字符串 `ts`/`reason`/`message`，不读取其他共享日志；归档路径与 H/W 访问委托公共 pathContext/usage-ledger 能力；模式/血缘识别与 mtime→ts 增量属于插件当轮内存启动路径，CLI 不读写持久 `session-presets`，统计不生产归档事务。
- step-99 统计关键符号（该测试工具不在生成根内，行号不在此维护；按函数名到源码定位；仅作统计说明来源）：`readSnapshots`、`parseLedgerText`、`summarizeSnapshotTexts`、`renderStats`、`statLedger`。
  - 统计读取与输出：`readSnapshots` → `summarizeSnapshotTexts` → `renderStats`；`parseLedgerText` 容错计数 badJson、非账本对象与说明行，不写归档。
  - CLI 路径与拒绝：`parseLedgerText(options.strict=true)` 抛出 `strict-parser-removed`；`main` 在 IO 前拒绝 `--archive`/`usage-removed`；账本目标直接由显式位置参数给定（唯一账本 `extra-plan-usage-ledger.jsonl`，不再经归档入口委托解析）；`--compare` 先由 `hasCompareFlag` 剥离，再走 `readLedgerReadOnly` 只读对拍。
  - 统计只汇总单一 `extra-plan-usage-ledger.jsonl`（不取锁，写入侧 temp→rename 原子发布）；严格解析、首行位置、固定键与唯一性校验、归档序列化与事务发布全部归 lib/usage-ledger.js 的 `archiveLedger`/`startupArchive` 及其内部函数。
  - `lib/usage-ledger.js` 负责扫描聚合、覆盖式更新、单调性保护、白名单与一次 `O_EXCL` 简易互斥；统计读取链路（`parseLedgerText`/`summarizeSnapshotTexts`）是 step-99 自建解析与聚合副本、不 import lib 的聚合实现，仅 `--compare` 才额外调用 lib 的 `scanUsageRows` 取现场扫描，不等于生产归档事务；step-99 不读取或改写 usage 错误 JSONL及其他共享日志。
  - 归档测试/启动路径应调用 `archiveLedger`/`startupArchive`；统计 CLI 不提供归档实现。
  - 本段不维护机器行号；函数名须在默认机器索引中可导航，step-99 仅作人工说明来源。
  - CLI：`main`（统计用法；旧 strict/--archive 模式拒绝），`parseCliArgs`（仅统计用法）。

> client.js 设置入口定位：`DetailSettingsSection` 与 `registerClientSurfaces`；设置表单仅经 plugins.detail.section 渲染于 bundle 页行列表之后，若本包 bundle.config 槽被任何一方注册条目则让位保持唯一表单；ConfigForms.get(NS) 订阅快照并一次 mutate 十一项，不注册 bundle.config/row.config/settings.plugins.tab/plugins.item。

## 文件总览

| 文件 | 行数 | 说明 |
|:--|--:|:--|
| index.js | 1744 | 核心入口：闸门状态与 extra_plan_gate 工具注册、预算、save 工具注册与生命周期；接线 planner/非 planner 路由、A/C/M 投影、P2-2 cache、usage 启动扫描账本（覆盖式幂等更新）、v4 MALFORMED 自愈。gateWords 只来自 YAML，apply 先校验再副作用；tools/pre-execute 先用原始 `isSubagentChild` 预审 child 控制工具，再进入角色/root 闸门，main 控制与自动最终结果保持；不再负责诊断日志启动清理。 |
| lib/agent-runtime.js | 172 | 每次 apply 的角色识别、descriptor/工具 schema 缓存、usage 血缘上下文与 role baseline、四角色宿主 mode 与显式 override 幂等；不 import index.js |
| lib/agent-session.js | 65 | 会话事件与子代理识别的唯一来源：sessionEvents/isSubagentChild 零依赖纯函数，被 index.js 与 lib/model-routing.js 共用（无镜像副本；不 import index.js） |
| lib/assembly-presentation.js | 267 | A/C/M 与 skill catalog 模型可见投影；从 scoped tools 读 schema/模式，SDK renderer 按 language 整体重建；F/PTC 的 tool:read 由 index.js 手写，L 段回宿主原文。 |
| lib/client-carrier.js | 7 | settings 内部 Loader Group 的无副作用 Client carrier；不对应 bundle row/公开 export。 |
| lib/client.js | 314 | 客户端模块加载共享样式/词条与 SettingsCard/ExtraPlanForm；设置表单仅经 detail.section 渲染于当前包详情行列表之后（自绘标题，不注册 bundle.config；若本包 bundle.config 槽出现条目则让位）；后端全局 settings API/Config 与 definition/adapter 由同一 owner 活动。 |
| lib/extra-plan-gate-tool.js | 374 | 闸门专用工具 extra_plan_gate：route/purpose 的选项文案由插件按 gateWords 生成，模型不得构造或改写；clarify 只透传问题；三支都收敛为 outcome 四值（answered/skipped/cancelled/channel-error），execute 从不向外抛错；结果 content 固定为单个 text ContentBlock、正文是返回值整体 JSON |
| lib/gate-decisions.js | 749 | 闸门状态推导（唯一推进源是 extra_plan_gate 事件）与角色分流判定纯函数集 |
| lib/gate-words.js | 108 | 闸门关键词共享契约（唯一值源是 YAML 的 config.gateWords）：字段规格 GATE_WORD_FIELDS/GATE_WORDS_GROUP_DEFINITION（6 键整组）+ 整组严格校验 validateGateWords（错误一律以 extra-plan: config.gateWords 开头）+ 运行时词表 createGateRuntime（显式入参严格校验，无默认词表）；纯模块：不含任何出厂词值、不读文件与环境变量，被 index.js（运行时）与 lib/preset-sync.js（启动自愈）共享（迁移叶 locator 已随跨版本搬迁链删除）；本函数只判定单次入参，持久值缺失/非法的回落补齐在 preset-sync |
| lib/live-config.js | 293 | 配置热读：10 项运行时 getter（含 webFetch）；1 项装载期权威设置（toolPresentationMode）只读并派生到内存 definition，不暴露为 getter；构造期读盘一次，后续按增强 stamp（dev/ino/size/mtimeNs/ctimeNs，兼容 ino/size/mtimeMs/ctimeMs）重读；失败整组回退并告警，不读 DSH_HOME 旧目录 |
| lib/log-retention.js | 123 | 诊断日志保留期裁剪：只处理 <host 根>/logs/dsh-extra-plan 下 .jsonl 普通文件并排除 usage-ledger；全部诊断 JSONL 统一按固定 UTC+8 北京时间昨日零点保留今天/昨天两个自然日；前缀边界算法两遍式（分界扫描+自分界起无解析复制）经临时文件原子替换，分界线=首个可解析且 cutoff<=ts<=now 的行，坏行/空行/未来行随前缀删除，分界后原样保留（含乱序过期行，随保留窗口自然收敛），零写=文件0行或分界为0，全前缀候选清空为空文件；不 import index.js。 |
| lib/model-routing.js | 648 | planner/非 planner 子代理模型路由：顶层纯判定函数 + createModelRouting per-apply 工厂（per-instance WeakMap、惰性 llm/agents getter；不 import index.js） |
| lib/path-policy.js | 464 | 核心包双根路径策略入口：H/W 用途判定、变量与链接边界、只读能力与写入预检，供各工具复用 |
| lib/plan-draft-tool.js | 294 | edit_plan_draft 工具工厂：只接受 save_plan 报错给出的 <savePlanDir>/draft 下 方案-/验收- 前缀 .md_mid（按归一化 target.path 判白名单，其它路径一律拒绝且不创建草稿）；对草稿做行级增删改后先写回再重跑与 save_plan 同源的合同/源/证据校验，通过即转正为成对正式 .md 并删草稿；唯一不写回的入口是命中未探查/待确认标记 |
| lib/planner-budget.js | 136 | planner 工具计数、消息后缀/预算提示/耗尽文案；**预算提醒消息经宿主 createUserMessage 构造，source 用生产者自有 kind `plugin:dsh-extra-plan`（v4 行准入禁旧包裹 `plugin`，违者会话当场终止）**；默认预算由生成模块提供，FREE_TOOLS 定义在 lib/gate-decisions.js |
| lib/preset-defaults.generated.js | 17 | 由 YAML 模板生成的十一键 `DEFAULT_SETTINGS` 与兼容别名 runtime fallback（回退）常量；generated（生成）/do not edit（勿手改） |
| lib/preset-settings.js | 3 | 11 项设置描述与 YAML 定位；settings 行是权威值，声明行只投影 1 项装载期项（toolPresentationMode，靠 executor 行身份）；capture/投影读取、plugins 行整体重述。 |
| lib/preset-sync.js | 789 | 读取并严格校验纯 definition；只按当前 settings 行补齐缺失/非法普通项与词表（非法词表回落资产默认）并派生当前 definition，顺序挂载官方 AgentPreset adapter；新写入仅经唯一全局行 configEditor.edit；mountPresetSync 以 settled 回调交付最终十一项/gateWords。 |
| lib/preset-yaml.js | 438 | 预设 YAML 纯职责模块：解析、当前行定位与歧义分类、权威设置捕获、canonical settings 行规划与规范文本定位。 |
| lib/role-contract.js | 11 | 冻结角色 ID/order 数组，并由同一 ROLE_IDS 数组派生 planner/reviewer/prober preset ID；只提供身份与装配顺序，不承载权限、沙箱或生命周期策略。 |
| lib/run-code-scanner.js | 360 | run_code 无宿主状态词法扫描器：字符串/注释遮蔽、括号配平、tools 调用点收集与动态访问判定。 |
| lib/run-code-static.js | 621 | run_code 纯静态解析/理由模块：安全 JSON/JS literal 解析、动态 argsText 瀑布兜底、写模式 hint、工具组拆解、ask 与闸门工具返回值白名单、调用点计数与当前 PTC dispatch cap；仅显式注入普通依赖，不持有宿主状态。 |
| lib/runtime-lifecycle.js | 162 | per-apply 运行时生命周期：save 工具注册、probe 名额认领与 run_code 子调用计数/拒绝记录，状态在闭包内并按会话清理 |
| lib/runtime-static.js | 23 | 显式参数纯 helper：causeChainOf 解析 cause 链；不持有宿主状态 |
| lib/save-contract.js | 263 | save 合同唯一真源：任务名/sessionTag/base、SAVE_PLAN_LIMITS 与内部确定性 summary、paths-only ContentBlock 投影、PROBE_LIMITS、Markdown 渲染与证据引用清洗；无宿主状态，运行时限制只在本文件维护。 |
| lib/save-persistence.js | 223 | 单次调用阶段感知提交：mkdir→临时文件逐项写入→逐项检查并顺序发布；失败保留首错/阶段，仅清理本次临时与已发布半套工件，清理失败附残留路径与原因，预存目标不覆盖；不创建/扫描/恢复跨调用 journal；末位 fs 依赖可注入。 |
| lib/save-plan-validation.js | 1222 | save_plan 文本合同校验：模式/任务/路径所有权/依赖与执行组 DAG/资源/检查引用与验收组/收尾全局/摘要早拒；不启动代理或执行命令。 |
| lib/save-probe-validation.js | 173 | save_probe 参数校验：数组/条目/长度/总量/path 存在性/range/evidence 聚合拒绝 |
| lib/save-tool-factories.js | 459 | 显式依赖工厂：save_plan 执行顺序固定——参数校验（plan/checklist 均为字符串且各 ≥200 字）→ 取一次 cwd → 容错解析上下文（目录/base/会话标识，解析失败只记原错误继续走、绝不替换合同诊断）→ 未探查标记 → 合同校验 → 源核实 → 证据核实 → 用 context 单次 atomicCommit 落盘；未探查标记、合同校验（派遣摘要超限除外，只能改写更短的方案，不落草稿）、源核实、证据核实四处失败出口统一先落成对 .md_mid 草稿再抛错，草稿提示追加在原报错末尾、上下文不可用或草稿写失败只降级为一句提示；合法正文逐字保存、structured output 仅 paths、render 仅将两个 paths 投影为唯一 text ContentBlock；save_probe 保留既有证据诊断与落盘；不缓存 ctx/agent/会话状态。 |
| lib/sdk-text-cache.js | 161 | apply 级 agent-keyed WeakMap SDK 文本缓存：完整 renderer 输入保守指纹、language/renderer 身份比较、并发 Promise 合并、reject/过期 Promise 不回写、dispose 回收；不持有 sessionId 或 PromptAssembly |
| lib/settings-contract.js | 191 | 服务端设置 descriptor 单一合同：11 项的类型/生成默认引用/校验/UI metadata 与权威-投影双定位器，并导出 `createDefaultSettings`、分组与投影遍历源 |
| lib/settings.js | 361 | 11 字段 volatile Config 与宿主行投影；settings apply 同时作为诊断日志清理与用量归档的唯一 owner，按 root 与 hostDataRoot 去重调度且两者分离；启动即执行 startupPrune 与 startupArchive；设置读写与权威行落盘由宿主 ConfigForms 与 preset-sync 的 mountPresetSync 承担，本入口不自建 HTTP 端点。 |
| lib/shell-mutation.js | 484 | 跨平台命令文本解码与 pwsh/bash 写形态判定；纯函数、不持有 apply 状态 |
| lib/usage-ledger-background.js | 214 | 后台账本调度 controller：只快照可信 pathContext，按 owner 单飞与 hostDataRoot 串行创建固定 Worker，处理协议、协作取消和 exit 后终态；不复制扫描算法。 |
| lib/usage-ledger-worker.js | 116 | 真实 Worker 入口：重建 pathContext 并复用同步 startupArchive 完成扫描、解析与发布，传递小型终态结果，响应共享取消位后关闭 port。 |
| lib/usage-ledger.js | 1378 | 账本唯一实现：默认 Host 目标为 `logs/dsh-extra-plan/extra-plan-usage-ledger.jsonl`，诊断按需写 `logs/dsh-extra-plan/extra-plan-usage-errors.jsonl`；扫描聚合 + 覆盖式更新 + 启动入口（常量与身份键 → 扫描 %DSH_HOME%/sessions 下 v4 会话日志并按九字段身份聚合 → 按日志 mtime 与账本 ts 判定 changed、只对变化文件按递进窗口读首帧并判白名单才解析 → 读现有 archive 后覆盖式更新、单调性保护、说明行、单 archive temp→rename 原子发布 → startupArchive 启动入口）；固定15键（rootSessionId/agentPreset 可空）、四桶口径、严格白名单、一次 `O_EXCL` 简易互斥（拿不到即跳过、不接管不删他人锁），失败按需留痕，可处理异常返回结构化状态，正常由 settings Worker 调用；直调 API 仍同步，真实启动及内存风险需另行验证；共享目录中的其他日志不由本模块接管。 |
| pe-test/_shared/host-deps.mjs | 409 | 解析宿主依赖候选并注册隔离加载钩子 |
| pe-test/_shared/host-preload.mjs | 52 | 测试侧预加载：从显式安装根环境变量解析真实宿主根并导出，缺失或非法即抛错、不回退 profile。 |
| pe-test/_shared/plan-text.mjs | 27 | 测试侧：plan/checklist 渲染文本共享实现，step-00 与 step-06 共用同一份拼装逻辑。 |
| pe-test/_shared/session-finder.mjs | 280 | 按会话ID或目录扫描定位日志并兼容三代命名 |
| pe-test/_shared/session-fixture.mjs | 76 | step-06-08-v4取证回归专用夹具：session/request-header/tool-call/tool-result 事件构造、session.v4.jsonl.zstd 落盘、zstd 帧与多帧/可跳过帧构造；11 项导出（canonicalResultMessage 私有未导出） |
| pe-test/_shared/test-output.mjs | 180 | 统一compact、verbose、full输出合同与raw证据哈希 |
| pe-test/_shared/v4-tool-result.mjs | 36 | 识别v4会话日志并提取tool result |
| pe-test/_shared/workspace-paths.mjs | 667 | 测试侧工作区路径合同：结构锚定维护根、夹具与隔离环境构造、维护参数解析与目标授权视图。 |
| pe-test/_shared/zstd-frames.mjs | 105 | 解析zstd帧并解码会话文本 |
| scripts/generate-runtime-defaults.mjs | 796 | 从 agent.cordis.yml 校验并生成 runtime 默认常量、纯主/角色 definition 与 client 标记区块（顶层结构逐字平移并保留 group/isolate/!!js）；默认仓库七输出，自定义 client 默认关闭；支持 --check 且坏源不覆盖 last-known-good（上次已知良好版本） |

## 函数索引

| 文件 | 函数 | 行号 | 功能描述 | 备注 |
|:--|:--|:--|:--|:--|
| index.js | malformedRecovery | L196-230 | MALFORMED_RESPONSE 同回合限次自愈：注入失败或坐标缺失仍返回 retry，其余回退原 action。 |  |
| index.js | safeContextGet | L243-249 | 通过 ctx.get 取宿主服务，取不到或抛错时返回 undefined，不向上传播异常 |  |
| index.js | absoluteRoot | L251-258 | 把候选根路径归一成绝对工作区根，空串、非字符串或非法输入一律返回 null 而不抛错 |  |
| index.js | rootFact | L260-264 | 把带存在标记的根路径归一为 missing、invalid 或 valid 三态事实对象 |  |
| index.js | sameRoot | L266-271 | 两个根路径都非空时按平台归一后比较是否同一根，Windows 下转小写，任一侧为空即判否 |  |
| index.js | configEditorServiceOf | L273-276 | 取 configEditor 服务并校验具备读取与编辑方法，不合格返回 null |  |
| index.js | documentFact | L278-282 | 把配置文档路径归一为 missing、invalid 或 valid 事实，空值按缺失处理 |  |
| index.js | profileFactsOf | L284-334 | 汇总 profile、宿主根与配置文档的可信事实，并标注 valid、conflict 或 invalid 状态 |  |
| index.js | has | L286 | 判断 profile 对象是否为对象且自身带有某键，用于区分字段缺失与显式空值，不抛错 |  |
| index.js | installAnchorOf | L336-338 | 从 profile 事实里取出安装锚点路径，缺失或非法时返回 null，不抛错，供锚点钩子判空 |  |
| index.js | pathRootsOverlap | L342-350 | 判定两个路径根是否重叠：规范化后互为前缀即视为重叠，供 H/W 重叠分类使用 |  |
| index.js | pathContextFor | L352-373 | 用可信 profile 事实装配路径上下文与写入口径能力，全部为空时返回 null 而不抛错 |  |
| index.js | resolveDocumentTargetFor | L375-383 | 按配置文档事实解析精确宿主目标路径，事实非法或矛盾时抛错拒绝热读，缺路径返回空串 |  |
| index.js | sessionCwdOf | L385-389 | 从 agent 的会话头里取工作目录，缺失或非字符串时返回空串，供路径上下文现算使用 |  |
| index.js | resolveAbsoluteLogTarget | L391-397 | 绝对诊断路径的两级解析：先按宿主根解析再按工作区根解析，两者皆失败时抛出首个错误 |  |
| index.js | diagnosticTargetOf | L399-414 | 决定诊断文件落点：裸文件名按宿主、工作区、缺根三态分派，不可用时返回 null 不抛错 |  |
| index.js | prepareDiagnosticPath | L416-432 | 先建父目录再校验写入目标，成功返回可写诊断路径，任一步失败都一律返回空串且不抛错 |  |
| index.js | appendDiagnostic | L434-439 | 以 UTF-8 追加一行 JSON 诊断记录，路径不可得时返回假而不抛错，供调用方判空 |  |
| index.js | recordAgentError | L441-458 | agent/error 回合错误取证：错误链逐字追加到诊断目录（落点见 getDiagPath），整体吞错不阻断。 | 与 recordRequestError 同诊断模式 |
| index.js | apply | L462-1744 | 插件主入口：闸门词表先校验，再接线投影、路由与 save 工具注册（顺序以机制设计为准）；静态可解析 run_code 组在 next 前预审，动态或未解析成员交由实际 pre-execute 重入重新判定；不再接管诊断日志启动清理。 |  |
| index.js | getPathContext | L486 | 传给保存类工具工厂的取上下文回调：按 cwd 现算路径上下文，属宿主接线且不缓存 |  |
| index.js | getPathContext | L493 | 传给草稿修复工具工厂的取上下文回调：按 cwd 现算路径上下文，属宿主接线且不缓存 |  |
| index.js | resolveDocumentTarget | L503 | 传给配置热读器的文档目标回调：按 agent 现算精确宿主目标，属宿主接线不缓存 |  |
| index.js | getPathContext | L504 | 传给配置热读器的取上下文回调：按 agent 的会话工作目录现算路径上下文，属宿主接线 |  |
| index.js | plannerModel | L519 | 热读箭头 getter：规划者默认模型（liveConfig.plannerModel；消费点=model-routing 的 getPlannerModel） |  |
| index.js | otherAgentModel | L520 | 热读箭头 getter：其他子代理默认模型（消费点=model-routing 的 getOtherAgentModel） |  |
| index.js | reviewerUsesPlannerModel | L521 | 热读箭头 getter：验收者是否复用规划模型，按 agent 现取并回退 apply 快照 |  |
| index.js | exploreBudget | L522 | 热读箭头 getter：规划者探查额度/单实例子调用上限（消费点=预算文案、noteRunCodeSubCall、plannerGateReason 与组判定） |  |
| index.js | plannerPromptSuffix | L523 | 热读箭头 getter：pre-step 拼接的额外引导后缀 |  |
| index.js | bootstrapOn | L524 | 热读箭头 getter：anchored 首轮引导开关；A/F gate 优先由 isAnchoredContextGate 与 pre-step 按当前 agent/events 判定，不把 C catalog 隐藏混入本 getter |  |
| index.js | runcodeCatchGateOn | L525 | 热读箭头 getter：PTC try/catch 闸门开关（消费点=planner/只读 child/主会话三处组判定传参） |  |
| index.js | crossProviderPlannerModel | L526 | 热读箭头 getter：跨 provider 规划模型开关，按 agent 现取配置值 |  |
| index.js | creativeModeOn | L529 | 热读箭头 getter：C creativeMode 开关；C=0 时 shouldHideCreativeCatalog 供投影视图暂隐创造 skill，展示隐藏不改变 registry binding |  |
| index.js | webFetchOn | L531 | 热读箭头 getter：web_fetch 免重启开关，供 web_fetch 裁剪的 arm/release 与 pre-step 判据共用 |  |
| index.js | getAgents | L548 | 惰性返回 ctx.get('agents') 服务；注入 createAgentRuntime，供判定子会话是否为其父代理下的活跃派发。 |  |
| index.js | warn | L550 | 把告警参数原样转发到 console.warn；注入 createAgentRuntime，作为缺父代理等异常情况的告警出口。 |  |
| index.js | getPlannerModel | L558 | 返回热读配置 plannerModel（planner 子代理所用模型名）；注入 createModelRouting 供 planner 模型路由决议。 |  |
| index.js | getOtherAgentModel | L559 | 返回热读配置 otherAgentModel（非 planner 子代理所用模型名，空串表示不覆盖）；供非 planner 路由决议。 |  |
| index.js | getCrossProviderPlannerModel | L560 | 返回热读布尔开关 crossProviderPlannerModel；决定 planner 路由走跨 provider 严格探针还是旧单 provider 路径。 |  |
| index.js | getLlm | L561 | 返回 ctx.get('llm') 服务；供 model-routing 查 provider 模型目录（listModels）与真实探针调用。 |  |
| index.js | getAgents | L562 | 返回 ctx.get('agents') 服务（同名第 2 处，消费方为 model-routing）；供经 agents.get 回溯父会话链的 provider/model/maxTokens。 |  |
| index.js | getDiagPath | L563 | 返回诊断路径：诊断目录 host logs/dsh-extra-plan/ 或 W .extra-plan/logs/；供 planner 降级诊断。 |  |
| index.js | noteRunCodeSubCall | L591 | 单实例子调用上限（planner）：按 sessionId→rootCallId 桶读计数、未超限则 +1；返回拒绝文案或 null；空 rootCallId 与 exploreBudget 文案保持 |  |
| index.js | consumeToolJobsNotice | L592-625 | tool-jobs 通知按 message.id 判重：首次有效通知解锁 job_output 与 pollGuard。 | 消费与双解锁语义见 ai-机制设计.md 六「session 生命周期与 usage 账本」的通知消费合同条。 |
| index.js | userQuestionsServiceOf | L633-650 | 取宿主 userQuestions 的 ask 能力：先按 agent 作用域 ctx 取，失败回落到 apply 级 ctx，取不到返回 undefined。 |  |
| index.js | askGateUser | L653-672 | 闸门提问通道：缺 id 的提问补齐稳定 id 后交 userQuestions.ask；服务缺失抛 NO_PROVIDER，由工具层转 channel-error。 |  |
| index.js | registerGateTool | L679-698 | 按 apply 幂等注册 extra_plan_gate（WeakSet 记录）：tools 服务缺失只 warn，重复注册保留既有工具，不向 agent/created 抛出。 |  |
| index.js | selectChildModelOnCreate | L708-759 | 子代理创建时按角色选模型：验收者按 reviewerUsesPlannerModel 走 planner 路由，其余走 otherAgentModel，失败普通回退 |  |
| index.js | toolsServiceOf | L780-793 | 取 agent 作用域 tools 服务：优先 ctx.tools，其次 ctx.get('tools')，异常一律返回 undefined |  |
| index.js | restrictableNamesOf | L796-806 | 取可收窄名集合：仅取 view(agent).restrictableNames，缺失或异常一律返回 null（schemas 兜底在 anchoredAllowNamesOf 内） |  |
| index.js | restrictableSnapshotOf | L807-810 | 把可收窄名集合转成排序数组供诊断落盘，null 原样透传 |  |
| index.js | toolRestrictionSlotOf | L812-819 | 取/建 per-agent 的 Map<source,{disposer,filter}> 槽位，供多路裁剪共存 |  |
| index.js | anchoredDiagStateOf | L823-839 | 按 agent 惰性建立 anchored 诊断状态，保存 first/later 装配标记与三路 source（anchored-bootstrap／cordis-presentation／web-fetch）最近的 arm/release/skip 快照，供内存摘要与即时失败落盘共用。 |  |
| index.js | toolRestrictionDiag | L841-872 | 三路裁剪共用诊断出口：按 agent/source 更新最近 arm/release/skip 快照；仅 arm-failed/release-failed 立即追加 extra-plan-anchored.jsonl，诊断写失败吞掉且不影响主流程。 |  |
| index.js | restrictionsSnapshotOf | L874-888 | 汇总三路裁剪的当前与最近诊断：active 是当前槽位保存的 filter 对象或 null（不是布尔标志），并带 arm/release/skip 最近快照。 |  |
| index.js | anchoredAllowNamesOf | L894-922 | 算引导期 allow：bootstrapShellTools ∪ bootstrapCommonTools ∩ 可收窄名，空集返回 [] 由调用方跳过 |  |
| index.js | armToolRestriction | L926-978 | 通用裁剪入口：校验 allow/deny filter、跳过/幂等/可收窄名后调用 tools.restrict；非法、空、缺名、非函数 disposer 或异常均落 arm-failed 并即时诊断。 |  |
| index.js | releaseToolRestriction | L981-994 | 通用释放入口：只释放槽位保存的 disposer；成功落 release-ok，disposer 异常落 release-failed 并即时诊断，不调用空 filter restrict。 |  |
| index.js | anchoredBootstrapArmOptionsOf | L997-1036 | 算引导期 arm 选项：判定相位/角色等跳过条件并生成 allow filter 与诊断字段 |  |
| index.js | armAnchoredToolRestriction | L1037-1039 | 引导期 arm 薄适配：算 allow 后转调 armToolRestriction |  |
| index.js | releaseAnchoredToolRestriction | L1040-1042 | 引导期 release 薄适配：转调 releaseToolRestriction |  |
| index.js | armCordisPresentationRestriction | L1046-1049 | C=0 cordis deny 薄适配：算 deny 后转调 armToolRestriction |  |
| index.js | releaseCordisPresentationRestriction | L1051-1053 | C=0 cordis release 薄适配：转调 releaseToolRestriction |  |
| index.js | armWebFetchRestriction | L1059-1069 | web_fetch deny 薄适配：webFetch 关闭时逐会话 arm 只 deny 单名 web_fetch 的 restrict，开启时跳过 |  |
| index.js | releaseWebFetchRestriction | L1071-1073 | web_fetch release 薄适配：webFetch 开启时释放该会话的 web_fetch deny |  |
| index.js | armWaitAgentRestriction | L1076-1079 | 按代理作用域拒绝继承的 `wait_agent`，保留其他控制工具 |  |
| index.js | shouldHideCreativeCatalog | L1115-1117 | C 热读判定：仅 creativeMode=false（C=0）返回 true，供调用方在 A/F 优先的投影视图隐藏创造 skill；本函数不检查 A/F、角色或 M，也不改变 registry binding |  |
| index.js | isAnchoredContextGate | L1121-1126 | 判定当前 agent 是否满足 anchored context gate：bootstrap 开启、Session 仍处 F，且角色为 main 或 planner（非 live child） | 只读 payload.agent；角色沿现有 isPlannerChild/isChild 语义，不使用 selfAgent 或父 Session 相位 |
| index.js | warnPreStepFailure | L1128-1132 | pre-step 可降级 C 投影/去重异常的一次性告警 helper；返回路径仍保留已经完成的 source 过滤副本，并保证 next 只调用一次 | 不得在关键 source gate/phase 失败时吞错后发送未过滤 decision |
| index.js | recordRequestError | L1248-1268 | agent/request-error：按 diagPath 追加 jsonl，含 ts、role 与错误链，整体吞错。 |  |
| index.js | messageTargetIdOf | L1678-1687 | send_message 目标回调：只读本轮名称或路径引用的已解析 Session ID；未命中即登记本轮 Set 供 resolveName 逐个补齐，非字符串 agent 回退旧 agent_id，不跨调用缓存且不调用宿主。 | 最新路径 agent 与 resolveName 适配（rc.2 与 rc.3 共用）；旧 agent_id 仅 rc.1 兼容，删除边界均须另行授权。 |
| index.js | finish | L1690-1702 | 本轮 apply 闸门唯一一次性收尾：拒绝先记 run_code deny；最终放行才记 job_output 与轮询计数并 next 一次；解析名称的匿名异步闭包复用此收尾，解析异常或取消原样传播。 | 同一 apply 内防重复调用，不把 resolveName 异常吞为 allow 或 deny。 |
| lib/agent-runtime.js | isLiveDelegation | L17-28 | 按父会话 registry 存活状态判定委托是否仍有效 |  |
| lib/agent-runtime.js | createAgentRuntime | L30-172 | 创建 per-apply 角色/缓存/usage baseline 工厂 |  |
| lib/agent-runtime.js | isChild | L37-45 | 按显式 events 判定 live child 并发出恢复为 root 警示 |  |
| lib/agent-runtime.js | isPresetChild | L47-55 | 共用角色子代理判定：先检查会话头预设 ID，匹配后才调用 isSubagentChild 并转发 events。 | createAgentRuntime 内部闭包。 |
| lib/agent-runtime.js | isPlannerChild | L60-62 | 每次按当前 Agent 的 header.agentPreset 与 isSubagentChild 判定 planner 子会话；不共享跨 Agent 的预设名布尔缓存，缺失必要信息返回 false。 |  |
| lib/agent-runtime.js | isReviewerChild | L65-67 | 按当前 Agent 会话头的预设名与子会话判定验收者子代理，缺失必要信息或类型不符一律返回假。 |  |
| lib/agent-runtime.js | usageRootOf | L69-100 | 沿最多 8 层 parentSession 回溯 rootSessionId；断链、循环或异常返回空 rootSessionId，由 usageContextOf 保持合法上下文落账，不伪造根会话。 | createAgentRuntime 内部闭包。 |
| lib/agent-runtime.js | usageContextOf | L105-126 | 按 Agent 缓存 usage 血缘 context：断链或循环下 rootSessionId 为空仍合法。 | createAgentRuntime 内部 WeakMap 闭包。 |
| lib/agent-runtime.js | toolSchemasOf | L129-147 | 防御式读取 agent scoped tools.schemas，失败/非数组返回 undefined |  |
| lib/agent-runtime.js | applyChildPolicy | L149-160 | 仅按本 child 四角色 preset 追加 sandbox/mode，override 已是目标 mode 时幂等。 |  |
| lib/agent-runtime.js | childBaseline | L165-169 | 同步解析 main/四角色/未知 child 的 usage context，fold usage，并为本 child 应用四角色宿主 mode 的幂等策略。 | createAgentRuntime 内部闭包。 |
| lib/agent-session.js | sessionEvents | L13-22 | 取 agent.session 事件快照（缺失兜底空数组）；唯一来源 |  |
| lib/agent-session.js | observeSessionLeaseOf | L29-44 | sessionQuery 租约探测：能力缺失或异常返回 undefined，lease 由调用方 finally 释放。 |  |
| lib/agent-session.js | isSubagentChild | L51-65 | 判定会话属于子代理（header.origin/delegationDepth/descriptor 三路探测）；唯一来源，index.js 经 decisions re-export |  |
| lib/assembly-presentation.js | sectionOf | L33-36 | 按名称取 PromptAssembly section |  |
| lib/assembly-presentation.js | skillCatalogEntriesOf | L40-48 | 校验并提取 skill catalog 的最小 name/description 条目，供 C=0 投影隐藏使用；普通 skill 条目保持，静态注册与 runtime binding 不在此注销。 |  |
| lib/assembly-presentation.js | renderSkillCatalogText | L50-72 | 按过滤后的条目重建系统 skill catalog 文本，普通 skill 保留；仅重写模型可见文本，不改静态注册或 runtime binding。 |  |
| lib/assembly-presentation.js | projectSkillCatalogDecision | L74-100 | 在当前消息副本中按 CREATIVE_SKILL_NAMES 暂隐创造 skill，不注销静态 binding；旧三名为 rc.1 兼容，dsh-doc 为最新路径当前（rc.2 与 rc.3 共用），展示隐藏不等绑定隔离。 |  |
| lib/assembly-presentation.js | isCordisPresentationTool | L102-104 | 判断名称是否属于固定 2 项 Cordis 模型可见工具集合 | 模型可见投影；不改变 registry binding |
| lib/assembly-presentation.js | filteredCordisSchemas | L106-109 | 从 schema 数组排除固定 2 项 Cordis 工具，供 SDK 整体重建 |  |
| lib/assembly-presentation.js | hasSection | L111-113 | 判断 PromptAssembly 是否含指定命名 section |  |
| lib/assembly-presentation.js | hasNonEmptySection | L115-117 | 判断 tools:ptc-only 是否为有效非空 section，识别 Pure PTC |  |
| lib/assembly-presentation.js | projectAssemblyForPresentation | L120-144 | 创建不原地修改的模型可见 assembly：按当前 schema 交集过滤工具，替换 SDK 文本并隐藏 tool:cordis，另支持 Pure PTC 顶层单入口 | 不改变 registry/restrict/pre-execute |
| lib/assembly-presentation.js | sdkSchemasForRendering | L146-153 | 从 schema 输入排除 run_code 与 Cordis，并确保 renderer 获得输出 schema | 不读取原始 tools:sdk 文本 |
| lib/assembly-presentation.js | errorWithCause | L155-159 | 构造带 cause 链的 Error，供上层保留底层失败原因，不做额外包装也不吞错。 |  |
| lib/assembly-presentation.js | assertInstallAnchor | L161-176 | 校验锚点是否为存在的绝对 dsh 应用 package.json，且清单 name 匹配，任一条件不满足即抛错。 |  |
| lib/assembly-presentation.js | dshToolsEntryPath | L179-186 | 单候选入口解析：先断言 installAnchor 是 @deepseek-ai/dsh 的 package.json，再用 createRequire(anchor).resolve 解析 dsh-tool-executor-ptc 入口，返回单个路径字符串（不再返回数组），解析失败抛带 cause 的错误 |  |
| lib/assembly-presentation.js | loadSdkRendererModule | L189-207 | 按安装锚点缓存渲染模块的动态导入 Promise，导入失败带 cause 抛出且不留下失败缓存。 |  |
| lib/assembly-presentation.js | pending | L195-205 | 按锚点首次执行的异步导入体：逐个候选入口尝试，全部失败时带 cause 抛出最终错误。 |  |
| lib/assembly-presentation.js | resolveToolsSdkRenderer | L210-215 | 按语言选官方渲染函数（python 走 Python 版），不支持的语言抛错，模块按锚点隔离缓存。 |  |
| lib/assembly-presentation.js | renderFilteredToolsSdk | L218-221 | 只接收已过滤 schema，整体调用官方渲染函数重建 SDK 文本，不从原始文本里删块。 |  |
| lib/assembly-presentation.js | toolRegistryOf | L223-231 | 防御式取 agent 上下文里的工具注册表，缺失或读取抛错时返回 undefined，不向调用方抛错。 |  |
| lib/assembly-presentation.js | toolSdkSchemasOf | L233-267 | 优先从工具定义取 schema，失败再回退 schema 列表；两种来源都过滤两个固定内置呈现工具。 |  |
| lib/client-carrier.js | apply | L5-7 | 空实现的内部客户端入口：由设置组件经官方加载组动态挂载，真正加载交由客户端清单，无业务副作用。 |  |
| lib/client.js | factory | L3-313 | 客户端模块加载器工厂：包装生成物入口，返回 exports 并挂 apply 与 inject 依赖声明 |  |
| lib/client.js | apply | L115-308 | 客户端生效入口：注入样式表、注册中英双语字典并登记详情设置区块，不触碰宿主其它槽位与表单实例 |  |
| lib/client.js | useSharedConfigForm | L128-139 | 订阅共享配置表单快照的 hook，返回只读 state 与转发 mutate 的包装函数 |  |
| lib/client.js | update | L131 | 内部快照刷新函数：重取共享表单快照写入组件状态，仅在初始化与订阅回调时调用，不参与写盘 |  |
| lib/client.js | mutate | L137 | 把一组 set 操作与表单修订号原样转发给共享表单 mutate，不在本地合并或校验 |  |
| lib/client.js | optionLabel | L141-146 | 下拉选项显示文案：先查字段的语言键映射，布尔值取开启或关闭词，其余原样转成字符串返回 |  |
| lib/client.js | optionValue | L148-152 | 把下拉框回传的字符串值还原成字段声明的原始选项值，未命中任何选项时保留原串而不抛错 |  |
| lib/client.js | renderControl | L154-179 | 按字段控件类型分派渲染受控控件：多行文本域、数字框、下拉框与单行文本框，互斥只渲染其一 |  |
| lib/client.js | onChange | L158 | 文本域输入回调：把输入框当前文本直接回传给上游草稿写入函数，不做裁剪与校验，也不触发保存 |  |
| lib/client.js | onChange | L165 | 数字框输入回调：仅回传输入框原始字符串，数值化与有限性判断留给字段取值函数完成，此处不转数字 |  |
| lib/client.js | onChange | L170 | 下拉框输入回调：经选项值还原函数把字符串映射回原始类型后再回传给草稿，保证布尔值不串型 |  |
| lib/client.js | onChange | L177 | 单行文本框输入回调：直接回传输入文本，不在此处做任何校验、裁剪或类型转换，空串照传 |  |
| lib/client.js | ExtraPlanForm | L181-264 | 设置表单主体：维护草稿与保存提示，加载中或命名空间不可用时提前返回空态提示，不渲染字段 |  |
| lib/client.js | fieldValue | L204-211 | 取字段草稿值：数字控件尝试转有限数值，非数字则回退原始值，全程不抛错也不提示用户 |  |
| lib/client.js | saveAll | L213-228 | 汇总全部字段为 set 操作提交表单 mutate；保存结果只由 mutate 回执与表单状态反映，不再发起自建写入请求 |  |
| lib/client.js | renderField | L230-239 | 渲染单个字段：拼装标签、受控控件与说明行，用户改动时清空上一条保存结果提示，不校验取值 |  |
| lib/client.js | SettingsCard | L266-274 | 设置卡片外壳：拼装标题、描述文案与表单组件，只做组装不持有状态也不含业务判断逻辑 |  |
| lib/client.js | hasBundleConfigEntry | L276-283 | 检查 bundle.config 槽是否已有本包条目，查询或读取异常一律按无条目处理，保证表单只渲染一份 |  |
| lib/client.js | DetailSettingsSection | L285-291 | 详情页设置段：仅包主体且槽内无同包条目时渲染设置卡片，其余情况返回空不占位也不报错 |  |
| lib/client.js | safeInject | L293-295 | 槽位注入包装：捕获注入过程异常并退回未定义值，不中断其余客户端界面登记与后续渲染 |  |
| lib/client.js | registerClientSurfaces | L297-304 | 在配置命名空间被服务期间登记详情设置段，返回注销函数供效果清理时调用，避免重复登记 |  |
| lib/extra-plan-gate-tool.js | isCancelError | L37-43 | 取消判别：AbortError 名、取消类错误码或含 cancel/abort 的文案算取消；通道码仍落 channel-error。 |  |
| lib/extra-plan-gate-tool.js | answersOf | L46-50 | 兼容宿主回传 { answers } 与直接回传数组两种 ask 成功形状，其余形状按空答复处理。 |  |
| lib/extra-plan-gate-tool.js | recommendValueOf | L53-57 | 推荐值归一：undefined/null 视为不标记返回空串，字符串 trim 后返回，非字符串原样返回交给校验。 |  |
| lib/extra-plan-gate-tool.js | askLabelOf | L60-62 | 选项展示标签：recommended 非空且与当前选项词全等时追加推荐后缀，其余原样返回，不改顺序也不改描述。 |  |
| lib/extra-plan-gate-tool.js | recommendedOrError | L66-81 | recommended 合法性判定：route 只认四个路线词、purpose 只认两个目的词，空串表示不标记；非法值不抛出也不弹卡，直接返回 INVALID_RECOMMENDED 的 channel-error 对象，gateOptions 取不到时提示里容忍为空串。 |  |
| lib/extra-plan-gate-tool.js | selectedLabelsOf | L84-89 | 取单条答复里字符串型 selected 标签，非数组或非字符串项一律丢弃。 |  |
| lib/extra-plan-gate-tool.js | customTextOf | L92-95 | 取单条答复的自定义文本原文（route 第二问其他说明），缺失返空串。 |  |
| lib/extra-plan-gate-tool.js | routeOptionsOf | L99-106 | 生成 route 四选项（main、executor、plan、none），label 只取词表，description 为固定提示语。 |  |
| lib/extra-plan-gate-tool.js | purposeOptionsOf | L109-114 | 生成 purpose 两选项（refine、redo），顺序即 ask 返回的序号口径。 |  |
| lib/extra-plan-gate-tool.js | pickBySelected | L117-121 | 按选中标签精确回查选项，未选中或标签不匹配返回 null。 |  |
| lib/extra-plan-gate-tool.js | failResult | L125-133 | 把 ask 异常收敛成取消或通道失败两种结果：取消保留已填字段，其余附 error.code，不向外抛错。 |  |
| lib/extra-plan-gate-tool.js | boundGateTool | L137-363 | 校验词表与 ask 通道后绑定三支分支，返回冻结的 defineGateTool；依赖非法在创建期同步报错。 |  |
| lib/extra-plan-gate-tool.js | askRoute | L147-200 | route 分支发两问（四选一加其他说明），选中项落 route 并回填中文 routeLabel；未作答为 skipped 且 route 仍取 none。 |  |
| lib/extra-plan-gate-tool.js | askPurpose | L203-253 | purpose 分支单问两选一，选中项落 refine/redo 并回填 purposeLabel；未作答为 skipped 且 purpose 为 null。 |  |
| lib/extra-plan-gate-tool.js | askClarify | L256-267 | clarify 分支把 questions 原样透传宿主 ask、答复原样回传，插件侧不构造任何选项。 |  |
| lib/extra-plan-gate-tool.js | defineGateTool | L271-360 | 产出 extra_plan_gate 工具定义：gate 参数三值、输出 schema、render 输出返回值整体 JSON 与 execute 兜底。 |  |
| lib/extra-plan-gate-tool.js | render | L331-333 | 工具定义中的 render 回调：返回单个 text ContentBlock、正文为返回值整体 JSON；宿主按数组消费 content、状态机只解析该块，返回裸字符串或人类摘要都会打断闸门。 |  |
| lib/extra-plan-gate-tool.js | execute | L335-358 | 工具执行入口：按 gate 分派三支分支，非法 gate 与未预期异常都收敛成 channel-error 普通对象。 |  |
| lib/extra-plan-gate-tool.js | createGateToolFactories | L367-369 | 工具工厂：把本次 apply 的 gateRuntime 词表与 ask 通道绑定，返回 defineGateTool。 |  |
| lib/extra-plan-gate-tool.js | defineGateTool | L372-374 | 便捷出口：用同一绑定实现直取某个 agent 的闸门工具定义。 |  |
| lib/gate-decisions.js | isDispatchStart | L8 | 判定宿主事件类型是否为嵌套派发起始事件 tool/ptc-dispatch-start，只做字符串等值比较。 |  |
| lib/gate-decisions.js | isDispatch | L9 | 判定事件类型是否为嵌套派发结果事件 tool/ptc-dispatch，供后续结果解析前做分流。 |  |
| lib/gate-decisions.js | routeDenyReason | L13-21 | 生成主会话写入的路线拒绝文案：规划态、执行者态与未确认态三种文案不同，带出工具名与各自的放行路径。 |  |
| lib/gate-decisions.js | planDenyReason | L25-36 | 按主会话执行态（route=main）、目的未确认、澄清未完成等分支生成规划工具拒绝文案，缺省给出统一提示文案。 |  |
| lib/gate-decisions.js | executorDenyReason | L37-39 | 执行类委派未走执行者路线时的拒绝文案，提示先调 extra_plan_gate 的 route 闸门选「执行者执行」。 |  |
| lib/gate-decisions.js | filterBootstrapContextDecision | L53-60 | 锚点引导期从注入决策里剔掉代理指令与技能目录消息，未做裁剪时原样返回同一个对象。 |  |
| lib/gate-decisions.js | projectedSkillCatalogSignature | L62-70 | 把技能目录消息压成名称加描述的可比对签名，结构不符或条目缺字段时返回 undefined。 |  |
| lib/gate-decisions.js | jsonShapeSignature | L72-104 | 递归生成 JSON 形状签名，非普通对象、循环引用或非有限数一律返回 undefined 不抛错。 |  |
| lib/gate-decisions.js | projectedAgentInstructionsSignature | L106-110 | 生成代理指令消息的内容签名，来源不是 agent-instructions 或内容为空时返回 undefined。 |  |
| lib/gate-decisions.js | projectedContextSignature | L112-119 | 按消息来源种类选择指令或技能目录签名，非投影来源返回 undefined 供调用方直接跳过。 |  |
| lib/gate-decisions.js | dedupeProjectedContextDecision | L121-142 | 对进入决策的投影消息按基线签名去重，重复项被剔除，无重复时原样返回同一个决策对象。 |  |
| lib/gate-decisions.js | isBootstrapPhase | L147-156 | 判断会话是否仍处锚点引导期，会话缺失或事件里已出现 tool/call 即判为非引导期。 |  |
| lib/gate-decisions.js | firstTextOfBlocks | L165-171 | 取内容块数组里首个文本块的文本，无文本块、值非法或传入非数组时一律返回空字符串。 |  |
| lib/gate-decisions.js | resetStageState | L173-176 | 把目的与澄清两个状态字段重置为初始值，路由字段保持不动，留给上层单独复位处理。 |  |
| lib/gate-decisions.js | resetRouteState | L178-181 | 把路由复位为未确认并连带重置目的与澄清，用于取消之后的状态回收。 |  |
| lib/gate-decisions.js | applyGateOutcome | L183-212 | 按 outcome 推进闸门状态：answered 按 gate 写入 route 或 purpose 或 clarified，cancelled 复位三字段，skipped 与 channel-error 不动既有字段。 |  |
| lib/gate-decisions.js | deriveFlowState | L223-289 | 自最近一条用户消息起回放 extra_plan_gate 的 tool/result 事件（含嵌套派发形态）推导 route/purpose/clarified 三字段，没有用户消息时返回初始状态。 |  |
| lib/gate-decisions.js | gateOfArgs | L240-249 | 从 tool 调用参数（JSON 字符串或已解析对象）取 gate 值，解析失败或非字符串返回 null。 |  |
| lib/gate-decisions.js | resultOfBlocks | L251-257 | 从结果消息首个 text 块解析 JSON 结果对象，空文本或解析失败返回 null 即跳过。 |  |
| lib/gate-decisions.js | catalogHasWriteTools | L296-301 | 判断工具目录是否含 write 或 edit，兼容字符串与对象两种元素形状，非数组返回 false。 |  |
| lib/gate-decisions.js | isReadOnlyChildByCatalog | L304-306 | 按目录判定只读子代理：目录非空且不含写工具才算只读，空目录与非数组都不算作只读。 |  |
| lib/gate-decisions.js | schemasHasWriteTools | L311 | 判断真实工具集是否含写工具，目录折叠时用它替代目录信号，非数组返回 false。 |  |
| lib/gate-decisions.js | schemasHasTool | L315-320 | 判断真实工具集是否含指定工具名，兼容字符串与对象两种形状，非数组返回 false。 |  |
| lib/gate-decisions.js | catalogIsCollapsed | L329-334 | 判断 ptc 目录是否折叠成仅 run_code，折叠后目录信号不可用需改看真实工具集。 |  |
| lib/gate-decisions.js | subagentProbeGateReason | L340-352 | 限制探查者委派只能由主会话发起，规划子代理与其它只读子角色各自返回专属的拒绝文案。 |  |
| lib/gate-decisions.js | withShellEvidence | L358-362 | 把 shell 命中的规则与取值追加到拒绝文案尾部，证据为 null 时原样返回传入文案。 |  |
| lib/gate-decisions.js | shellMutationReason | L364-380 | 对规划者、探查者与验收复核者的 pwsh/bash 写命令生成拒绝文案，其余角色返回 null。 |  |
| lib/gate-decisions.js | childControlGateReason | L383-387 | 仅允许 main 使用 `send_message`；child 直呼统一返回硬拒文案，供 planner/只读 child/执行者/unknown child 与 run_code 组判定复用。 | 纯函数；mainGateReason 不经此拒绝。 |
| lib/gate-decisions.js | plannerGateReason | L391-407 | 规划子代理的写工具、shell 写命令、job_output 与预算闸门串联判定，全不命中返回 null。 |  |
| lib/gate-decisions.js | childReadonlyGateReason | L411-421 | 只读子代理的写工具、shell 写命令与 job_output 闸门，按探查者或复核者挑选文案。 |  |
| lib/gate-decisions.js | jobOutputGateReason | L426-448 | job_output 禁止前台等待与同 job 重复调用，缺会话上下文时跳过去重只查等待参数。 |  |
| lib/gate-decisions.js | recordJobOutputCall | L454-466 | 放行后把已调用的 job 号记入会话计数，任一条件不满足即返回 false 且不做写入。 |  |
| lib/gate-decisions.js | pollGuardGateReason | L472-485 | 同锚点周期内第二次调用 job_list 或 list_agents 即拒绝，无会话上下文时跳过查重。 |  |
| lib/gate-decisions.js | recordPollGuardCall | L487-498 | 放行后把 job_list 或 list_agents 记入会话集合，参数不全时返回 false 且无副作用。 |  |
| lib/gate-decisions.js | probeDisposalWarning | L506-509 | 仍有未认领的探查者委派时生成级联取消告警文案，计数非正整数时返回 null 不告警。 |  |
| lib/gate-decisions.js | mainGateReason | L519-609 | 主会话工具闸门总入口，按 ask（普通 ask_user_question 直接放行）、写入（route 非 main 即拒）、shell（越界特例）、规划、委派与轮询顺序判定；send_message 通过可选 messageTargetIdOf 回调读取本轮目标 ID，running 目标拒绝，回调未提供时保留 agent_id 兼容路径，最后兜底放行。 | target callback 只读本轮解析结果；最新路径 resolveName（rc.2 与 rc.3 共用）与 rc.1 agent_id 边界不含共享安全核心。 |
| lib/gate-decisions.js | runCodeGroupDenyReason | L621-704 | 静态 run_code 组预审：拆解可解析成员并逐个走对应角色闸门，聚合拒绝并追加预算与防护判定；动态或未解析成员留给实际 pre-execute 重入重新判定，不以动态访问当作放行。 |  |
| lib/gate-decisions.js | visit | L639-681 | 静态组递归访问器：展开可解析嵌套 run_code 并逐成员选取角色闸门；深度或参数不可解析的成员跳过静态展开，交由实际 pre-execute 重入。 |  |
| lib/gate-decisions.js | aggregateRunCodeDenyReason | L710-723 | 把成员与拒绝项拼成统一的组拒文案，首行给组规模与放行语义，后续逐行列出成员与原因。 |  |
| lib/gate-words.js | fail | L30-32 | 以 extra-plan: config.gateWords 前缀同步抛出整组校验错误，供各字段分支统一复用。 |  |
| lib/gate-words.js | normalizeGateLabel | L35-37 | 去掉标签首尾空白与保留的推荐后缀（中英文圆括号），只做归一不做子串匹配，也不改词值。 |  |
| lib/gate-words.js | validateGateWords | L45-72 | 严格校验 6 个闸门词字段的齐全、非空、无空白、无保留后缀与两两不同；合法即返回冻结副本。 |  |
| lib/gate-words.js | bracketed | L74-76 | 把词数组渲染成逐词加中文直角引号并拼接的选项文案，供确认话术插值，空数组返回空串。 |  |
| lib/gate-words.js | createGateRuntime | L86-108 | 由显式入参派生运行时词表：分组数组、集合、确认文案与 prompt variable 映射，无参不给默认词表。 |  |
| lib/live-config.js | textOf | L36-38 | 把配置项原始值收敛为非空字符串并去掉首尾空白，非字符串或空白串返回空字符串且不抛错 |  |
| lib/live-config.js | envConfigPath | L40-42 | 读取环境变量里的显式配置路径文本并去空白，未设置或空白时返回空字符串表示未指定路径 |  |
| lib/live-config.js | sameAbsolutePath | L44-48 | 把两侧路径先解析为绝对路径再判等，Windows 下按小写比较，避免同一路径不同写法误判 |  |
| lib/live-config.js | exactHostCapabilities | L50-60 | 筛出与目标路径精确相等的 config-editor 文件能力，profilePatch 优先排序，其余按名称排 |  |
| lib/live-config.js | rank | L57 | 能力排序权重：profilePatch 最优先、editorDocument 次之、其余能力排最后，供排序时逐对比较 |  |
| lib/live-config.js | exactHostTarget | L62-66 | 在精确命中的宿主能力下解析配置目标，未命中任何可信能力时立即抛错，不做宽松路径回退 |  |
| lib/live-config.js | resolveAbsoluteTarget | L68-77 | 绝对路径配置目标的两级解析：preferHost 直取宿主，否则先工作区再宿主，失败抛最后错误 |  |
| lib/live-config.js | contextFrom | L79-86 | 按 agent 取路径上下文，其次取预设上下文，都不可得时返回空值，不抛错交由调用方判空 |  |
| lib/live-config.js | targetFromValue | L88-100 | 把配置源值归一为可信目标：字符串按绝对或相对分流，带分类对象按 kind 解析，非法即抛错 |  |
| lib/live-config.js | targetOf | L102-107 | 结合路径上下文与两个解析器取出配置目标，并据是否用文档解析器判定按文档或工作区解析 |  |
| lib/live-config.js | statStamp | L109-124 | 生成由 dev、ino、size、mtime、ctime 拼成的读盘戳，stat 失败时只返回不可用原因而不抛错 |  |
| lib/live-config.js | pick | L126-130 | 按设置定义校验单个取值，不合法时回退到传入默认值，合法则归一化后返回，全程不抛错 |  |
| lib/live-config.js | describeProblems | L132-134 | 把缺键、歧义、非法等问题列表拼成「键 = 状态」的一行告警文案，便于日志单行呈现 |  |
| lib/live-config.js | normalizedFallback | L136-141 | 以 apply 期配置快照补齐全部热读键，缺失或非法键回退到内置默认值，保证读取始终有值 |  |
| lib/live-config.js | createLiveConfig | L151-293 | 创建配置热读器：构造期读盘建基线并做装载期严格校验，运行期只按键回退、不向调用方抛错 |  |
| lib/live-config.js | warnOnce | L164-168 | 热读降级只告警一次的提示，带回落原因与配置路径，避免每次取值都重复刷屏污染运行日志 |  |
| lib/live-config.js | currentResolved | L170-183 | 按显式路径、环境变量、文档解析器三段取当前配置目标，失败时返回空路径与原因不抛错 |  |
| lib/live-config.js | currentContext | L185-187 | 取当前调用方的路径上下文并原样透传，供授权校验与目标解析复用，过程中不做任何缓存 |  |
| lib/live-config.js | readDiskValues | L189-211 | 读盘并解析 settings 行，逐键记录 captured 或 missing 状态，整行缺席时静默回退默认值 |  |
| lib/live-config.js | refresh | L234-272 | 目标或读盘戳变化时重读配置，失败按键回退快照，歧义与非法只告警一次而不向调用方抛错 |  |
| lib/live-config.js | read | L274-277 | 取某个热读键的当前值：先按需刷新配置再读缓存，键不存在时返回 undefined 而不抛错 |  |
| lib/live-config.js | get | L280 | 按键热读配置值，接收 agent 以取得按会话隔离的结果，非法值在读取前已回退默认值 |  |
| lib/live-config.js | anchoredBootstrap | L281 | 热读箭头 getter：anchored 首轮引导开关，每次取值先刷新磁盘配置，失败回退快照 |  |
| lib/live-config.js | creativeMode | L282 | 热读箭头 getter：创造模式开关，取值即刷新配置，读盘失败按键回退到 apply 期快照 |  |
| lib/live-config.js | webFetch | L283 | 热读箭头 getter：web_fetch 免重启开关，取值即刷新配置，读盘失败按键回退 apply 快照 |  |
| lib/live-config.js | runcodeCatchGate | L284 | 热读箭头 getter：PTC try/catch 闸门开关，取值即刷新并按键校验，非法值回退快照 |  |
| lib/live-config.js | crossProviderPlannerModel | L285 | 热读箭头 getter：跨 provider 规划模型开关，取值即刷新配置，失败回退 apply 快照 |  |
| lib/live-config.js | plannerModel | L286 | 热读箭头 getter：规划者默认模型，取值即刷新并做键值校验，非法值回退 apply 快照 |  |
| lib/live-config.js | plannerPromptSuffix | L287 | 热读箭头 getter：pre-step 追加的引导后缀，取值即刷新配置，缺失时回退快照值 |  |
| lib/live-config.js | exploreBudget | L288 | 热读箭头 getter：规划者探查额度，取值即刷新配置，非法或缺失回退到内置默认额度 |  |
| lib/live-config.js | otherAgentModel | L289 | 热读箭头 getter：其他子代理默认模型，取值即刷新配置，失败时回退 apply 期快照 |  |
| lib/live-config.js | reviewerUsesPlannerModel | L290 | 热读箭头 getter：验收者是否复用规划模型，取值即刷新配置，失败回退快照布尔值 |  |
| lib/log-retention.js | beijingYesterdayCutoffMs | L18-20 | 把当前时间换算为固定 UTC+8 的北京时间昨日零点毫秒 cutoff，供全部诊断 JSONL（usage ledger 除外）统一保留今天/昨天两个自然日。 |  |
| lib/log-retention.js | parsedTsOf | L22-32 | 行级 ts 解析：空行、解析失败、非对象、ts 非字符串或非法时间一律返回 null，分界扫描据此把不可解析行留作前缀候选（不作分界） |  |
| lib/log-retention.js | closeInput | L35-44 | 显式 destroy 读流并等 close 后 resolve：Windows 上 rename 覆盖要求目标文件不再被任何句柄持有 |  |
| lib/log-retention.js | findPrefixBoundary | L46-64 | 前缀分界扫描：流式逐行返回首个可解析且 cutoff<=ts<=now 的行号（0基），命中即停；不可解析行与 ts>now 的未来行不作分界、继续扫描作为前缀候选；未找到返回 null；lines=总行数（0行文件 lines=0）；finally 关闭 reader/input。 |  |
| lib/log-retention.js | copyFromBoundary | L66-95 | 自分界起无解析复制：授权并 prepare 同目录临时文件后流式逐行跳过前 skipCount 行（不做任何 JSON 解析），其余行原样写出；skipCount>=总行数时产出空临时文件；writer error/close 等待、closeInput 后 renameSync 原子替换，失败清理临时文件并重抛。 |  |
| lib/log-retention.js | pruneDiagnosticLogs | L97-123 | 诊断裁剪入口：枚举并排除 usage-ledger；全部诊断 JSONL 统一用 UTC+8 北京昨日零点 cutoff 保留今天/昨天两个自然日；每文件先 findPrefixBoundary 分界扫描，0行或分界为0 零写零临时跳过，否则 copyFromBoundary 自分界起无解析复制原样保留（含坏行/乱序过期行，随保留窗口自然收敛），removedRows=分界或全行数，经临时文件原子替换，返回 skipped/up-to-date/pruned 与计数。 |  |
| lib/model-routing.js | isExplicitRoute | L11-17 | 显式路由判定：子级 provider 或 model 任一与父值不同即算显式，空串视为无选择 |  |
| lib/model-routing.js | isExplicitEffort | L21-23 | 显式 effort 判定：仅非空字符串且与父值不同才算显式，空串与 undefined 一律不算 |  |
| lib/model-routing.js | requestConfigSnapshot | L31-44 | 请求配置快照：从会话 header 取 provider、model 与 maxTokens，取不到即返回 null |  |
| lib/model-routing.js | agentFromRegistry | L46-49 | 注册表取 Agent：agents 无 get 或抛异常一律回 undefined，绝不上抛中断父链上溯 |  |
| lib/model-routing.js | resolveAgentRouteSources | L52-82 | 路由来源解析：沿 parentSession 链上溯顶层主会话，断链或超 8 层标记不完整且不给 source |  |
| lib/model-routing.js | decidePlannerModelUse | L104-117 | planner 模型取舍：目录命中才覆盖，未命中静默降级，目录空或报错保守沿用配置模型 |  |
| lib/model-routing.js | routeKey | L128-130 | 路由键拼接：provider 与 model 之间插 NUL 分隔，供探针结果与 fallback 复用查表 |  |
| lib/model-routing.js | comparePlannerText | L132-136 | 候选文案比较：两侧非字符串一律当空串，再按字典序给出 -1、0、1，供候选排序使用 |  |
| lib/model-routing.js | plannerProviderRank | L138-142 | 候选优先级打分：官方 provider 记 2、与父同 provider 记 1、其余 0，用于排序 |  |
| lib/model-routing.js | sortPlannerCandidates | L144-155 | 候选排序：先按 provider 优先级降序，再按名称与 id 字典序，保证选择可复现 |  |
| lib/model-routing.js | createModelRouting | L160-648 | per-apply 路由工厂：两份 WeakMap 与惰性 llm、agents getter，返回三个解析入口 |  |
| lib/model-routing.js | plannerAbortError | L168-171 | 中断错误归一：signal 的 reason 为 Error 就原样返回，否则造固定文案的新错误 |  |
| lib/model-routing.js | withPlannerProbeDeadline | L175-208 | 探针截止封装：本地 AbortController 覆盖 30 秒超时与父 signal，超时返回标记不抛错 |  |
| lib/model-routing.js | probePlannerRoute | L212-254 | 真实路由探针：可先查目录命中，再 prepareCall 并收流，只认单个非 error 的 finish |  |
| lib/model-routing.js | probePlannerCandidates | L261-277 | 候选并发探针：按上限建 worker 依序取号，结果按发起顺序回填，完成顺序不影响选择 |  |
| lib/model-routing.js | worker | L264-271 | 并发池工作体：循环领取下一个候选序号，越界即退出，逐个执行真实探针且不共享控制器 |  |
| lib/model-routing.js | uniqueProviderCandidates | L279-288 | 候选去重：跳过缺 id 或重复 id 的 provider，缺名时用 id 顶替名称 |  |
| lib/model-routing.js | collectStrictProbeCandidates | L291-311 | 严格候选收集：列 provider 后去重并发探针，按 routeKey 存 outcomes 并汇总成功候选 |  |
| lib/model-routing.js | resolvePlannerEntrySingleProvider | L314-372 | 单 provider 路径：只查父目录与 advisory 列表，命中才用配置模型，异常静默保留已取值 |  |
| lib/model-routing.js | resolvePlannerEntryStrict | L375-427 | 严格 planner 路径：空串直接继承父路由，否则并发探针排序，全失败才验父 fallback，拒未验证路由 |  |
| lib/model-routing.js | resolvePlannerEntry | L431-440 | planner 入口：首次调用即缓存 promise，成功与拒绝都固定在 Agent 生命周期，不重复探针 |  |
| lib/model-routing.js | nonPlannerRouteSources | L444-448 | 非 planner 来源：取 getAgents 异常兜底后解析父链来源，拿不到注册表也不抛错 |  |
| lib/model-routing.js | nonPlannerFallbackEntry | L450-458 | 非 planner 兜底项：来源缺失返回 null，probe 取顶层 maxTokens、普通 child 取父值 |  |
| lib/model-routing.js | resolveOtherAgentEntrySingleProvider | L461-478 | 单 provider 非 planner：父目录命中配置模型才覆盖，目录异常静默回退父路由 |  |
| lib/model-routing.js | resolveOtherAgentEntryStrict | L482-512 | 严格非 planner：来源缺失即拒，空串继承父路由免探针，否则并发探针排序后验 fallback |  |
| lib/model-routing.js | resolveOtherAgentEntry | L515-524 | 非 planner 入口：每 child 独立缓存首个 promise，成功与拒绝都不重复解析 |  |
| lib/model-routing.js | throwIfReviewerAborted | L533-535 | 验收者中断前置：父 signal 已取消就抛规划者中断错误，未取消则静默返回继续 |  |
| lib/model-routing.js | awaitReviewerPending | L537-569 | 验收者等待：无 signal 直接返回原 promise，取消时清理挂起项并拒绝，避免悬挂 |  |
| lib/model-routing.js | cleanup | L545-547 | 取消监听清理：移除父 signal 上的 abort 监听，重复调用安全，不触碰 pending 本体 |  |
| lib/model-routing.js | onAbort | L548-554 | 中断回调：只生效一次，先清监听再注销挂起项并拒绝，迟到结果被 done 标志拦住 |  |
| lib/model-routing.js | removeReviewerPending | L571-576 | 挂起项注销：仅当桶内仍是同一 promise 才删掉该条目，桶空时连同键一起清除 |  |
| lib/model-routing.js | reviewerPendingEntryCount | L578-582 | 挂起项计数：遍历所有桶逐个累加条目数，供总数超 32 条时整表清空挂起与已结算缓存 |  |
| lib/model-routing.js | resolveReviewerEntry | L584-646 | 验收者入口：空串回退父项，按五段键缓存 settled 与 pending，失败兜底父项且取消原样传播 |  |
| lib/path-policy.js | policyError | L13-18 | 核心包错误工厂：生成携带 code 与冻结 details 的 TypeError，前缀统一便于上层按码分类 |  |
| lib/path-policy.js | isObject | L20-22 | 核心包内类型判定：仅非 null 且非数组的普通对象为真，数组、函数与类实例一律返回假值 |  |
| lib/path-policy.js | isOther | L24-26 | 核心包保留类别判定：字符串转小写后等于 other 才为真，其它类型与非字符串直接返回假 |  |
| lib/path-policy.js | rejectOther | L28-33 | 核心包保留类别拒绝：五个身份字段任一取 Other 即抛 OTHER_REJECTED，非对象跳过 |  |
| lib/path-policy.js | rejectOtherOptions | L35-40 | 核心包选项级 Other 拒绝：在对象检查外追加 capability 字段，命中保留类别即抛错 |  |
| lib/path-policy.js | isFullyQualifiedAbsolute | L42-45 | 核心包绝对路径判定：Windows 认盘符与 UNC 前缀，POSIX 只认斜杠开头，不做归一化 |  |
| lib/path-policy.js | rejectVariable | L47-57 | 核心包变量拒写：%VAR%、$VAR、~ 三种字面量均抛 VARIABLE_PATH，绝不展开变量 |  |
| lib/path-policy.js | lexicalPath | L59-73 | 核心包词法路径校验：拒绝空串、NUL、变量、drive-relative、URI 与歧义绝对路径，原样返回 |  |
| lib/path-policy.js | rootPath | L75-82 | 核心包根解析：必须显式传入明确绝对路径，归一化后返回，缺失或相对即抛 ROOT_REQUIRED |  |
| lib/path-policy.js | keyOf | L84-87 | 核心包路径键：归一化后 Windows 转小写用于比较，不修改调用方持有的原字符串 |  |
| lib/path-policy.js | samePath | L89-91 | 核心包同一路径判定：两侧路径键完全相等即真，只做词法比较且不解析链接与真实大小写 |  |
| lib/path-policy.js | isWithin | L93-99 | 核心包隶属判定：相等或相对路径不以 .. 起始为真，纯词法判断不触碰磁盘与链接解析 |  |
| lib/path-policy.js | assertLexicalWithin | L101-105 | 核心包越界断言：候选超出授权根时抛 ROOT_ESCAPE，附带 root 与 candidate 便于定位 |  |
| lib/path-policy.js | readOnlyCapabilityForLogicalPath | L107-114 | 核心包只读能力词法匹配：文件能力要求相等、目录能力要求包含，未命中返回 null |  |
| lib/path-policy.js | readOnlyCapabilityForRealPath | L116-125 | 核心包只读能力真实匹配：realpath 失败的能力跳过，其余按文件或目录比对真实路径 |  |
| lib/path-policy.js | rejectReadOnlyCapability | L127-129 | 核心包只读拒绝：描述符非空即抛 HOST_RESOURCE_READONLY，为空则静默返回 |  |
| lib/path-policy.js | purposeOf | L131-137 | 核心包用途取值：非空字符串且非 Other、不含 NUL，未指定时回退 fallback |  |
| lib/path-policy.js | capabilityName | L139-145 | 核心包能力名校验：null 与 undefined 归一为 null，非空字符串方合法，拒绝 Other |  |
| lib/path-policy.js | normalizeCapabilities | L147-170 | 核心包能力表归一：数组与对象皆可，逐项校验 name、type、access 并冻结，重名即抛错 |  |
| lib/path-policy.js | createPathContext | L172-190 | 核心包上下文创建：归一化 workspaceRoot、hostDataRoot 与能力表，三者全空即拒绝 |  |
| lib/path-policy.js | ensureContext | L192-201 | 核心包上下文复核：重新校验根与能力表结构，拒绝非 createPathContext 产出的影子对象 |  |
| lib/path-policy.js | capabilityOf | L203-209 | 核心包能力查询：名称为空返回 null，未注册能力抛 CAPABILITY_UNKNOWN 而非 undefined |  |
| lib/path-policy.js | relativeInput | L211-217 | 核心包路径归一：明确绝对路径归一化返回，相对路径拼授权根，歧义绝对路径直接拒绝且不猜 |  |
| lib/path-policy.js | makeTarget | L219-267 | 核心包目标装配：定根、核能力用途与范围、校验精确文件能力，产出冻结目标并缓存用途来源 |  |
| lib/path-policy.js | resolveWorkspacePath | L269-273 | 核心包工作区入口：固定 workspace 类别，携带 capability 参数即判非法 |  |
| lib/path-policy.js | resolveHostPath | L275-279 | 核心包宿主入口：固定 host 类别，能力缺失报 ROOT_REQUIRED，不回退工作区根 |  |
| lib/path-policy.js | targetInput | L281-305 | 核心包入参归一：裸值走指定类别，已解析目标复用其类别、能力与用途，类别缺失即抛错 |  |
| lib/path-policy.js | assertAllowedPath | L307-314 | 核心包放行断言：仅做词法与能力校验不探磁盘，返回附 allowed 标记的冻结目标 |  |
| lib/path-policy.js | isMissing | L316-318 | 核心包缺失判定：仅 ENOENT 与 ENOTDIR 算不存在，其余错误码一律不算缺失 |  |
| lib/path-policy.js | sameOrChildReal | L320-322 | 核心包真实越界断言：真实路径不隶属根即抛 REALPATH_ESCAPE，堵住链接逃逸 |  |
| lib/path-policy.js | physicalRoot | L324-339 | 核心包物理根：realpath 后必须是目录，区分不可解析、不可读取与非目录三类错误码 |  |
| lib/path-policy.js | inspectChain | L341-386 | 核心包父链探查：自目标逐级回溯至授权根，收集候选与最近父级真实路径，写模式拒绝链接 |  |
| lib/path-policy.js | expectedType | L388-392 | 核心包期望类型：file、directory、any 之外取值抛 TYPE_INVALID，缺省用调用方回退值 |  |
| lib/path-policy.js | checkType | L394-398 | 核心包类型核对：any 跳过，file 与 directory 不符时抛 TARGET_TYPE 并附目标路径 |  |
| lib/path-policy.js | validateReadTarget | L400-429 | 核心包读校验：目标缺失即 TARGET_MISSING，读后核对类型，返回含真实路径的只读快照 |  |
| lib/path-policy.js | prepareWriteTarget | L431-464 | 核心包写校验：宿主写须显式用途且能力可写，目标不得是符号链接，目录缺失时不隐式创建 |  |
| lib/plan-draft-tool.js | pathKey | L22-25 | 仅用于白名单比较的平台归一化键：反斜杠转正斜杠，Windows 下再转小写；落盘路径一律取 resolveWorkspacePath 的 target.path，不用此 key。 |  |
| lib/plan-draft-tool.js | draftBaseOf | L28-37 | 归一化绝对路径还原成草稿 base：父目录须等于期望草稿目录、后缀恰为 .md_mid、去掉 方案-/验收- 前缀后非空，任一不符返回 null 由调用方一律拒绝。 |  |
| lib/plan-draft-tool.js | readText | L39-45 | 按 utf8 读取文件，失败统一改抛「edit_plan_draft: 文件读取失败」并附错误文本，供上层转成可读诊断。 |  |
| lib/plan-draft-tool.js | splitLines | L48-53 | 行级编号基线：只剥掉一个结尾换行参与编号并回报 hasFinalNewline，使行号与编辑器/grep 汇报一致。 |  |
| lib/plan-draft-tool.js | joinLines | L55-58 | splitLines 的逆操作：空数组返回空串，否则按换行拼接并按 hasFinalNewline 原样补回结尾换行。 |  |
| lib/plan-draft-tool.js | diagnosticText | L60-65 | 把单条合同诊断渲染成「文档 任务 字段：说明」，行号为正整数时追加「位置：第 N 行」；文档缺省 plan/checklist，无任务号写作任务全局。 |  |
| lib/plan-draft-tool.js | savedWithErrors | L67-69 | 构造 saved-with-errors 返回值五字段（status/paths/lineCount/diagnostics/error），表示修改已保存但未通过校验、草稿保留可继续改。 |  |
| lib/plan-draft-tool.js | applyEdits | L73-102 | 批量行级编辑：{line,text} 替换、{line,drop:true} 真删、{line,insert} 行前插入三种操作互斥校验，按行号倒序应用；任一编辑非法或越界即整批抛错不生效。 |  |
| lib/plan-draft-tool.js | authorizeDraftFile | L105-108 | 删草稿前的授权：与 save-persistence 内部 authorizeFile 同形，先 resolveWorkspacePath 再 prepareWriteTarget，越界即抛错。 |  |
| lib/plan-draft-tool.js | createPlanDraftToolFactories | L110-294 | 按 savePlanDir 与 atomicCommit/atomicReplace 显式依赖构造 edit_plan_draft 工具工厂（内部定义超时 60s），不持有宿主会话状态。 |  |
| lib/plan-draft-tool.js | expectedDraftDirOf | L113-119 | 由可配置的 savePlanDir 推导期望草稿目录 <savePlanDir>/draft 的归一化绝对路径；推导失败返回 null 让调用方按非白名单拒绝，绝不回退硬编码目录。 |  |
| lib/plan-draft-tool.js | writeDraft | L126-129 | 以覆盖语义 atomicReplace(dir,[{name,content}]) 写回草稿；缺 atomicReplace 依赖即抛错（未写入任何修改），转正另走 atomicCommit 不可互替。 |  |
| lib/plan-draft-tool.js | defineEditPlanDraft | L131-291 | 组装 edit_plan_draft 工具定义：path/edits 参数合同、promoted 与 saved-with-errors 两态输出 schema 及行级修复执行体。 |  |
| lib/plan-draft-tool.js | render | L175-177 | 结果渲染：把返回值整体 JSON 串成恰一个 text ContentBlock，裸字符串会崩宿主。 |  |
| lib/plan-draft-tool.js | execute | L180-289 | 草稿修复执行体：参数与 cwd 校验、白名单 base 判定、读草稿应用编辑、未探查标记命中即整批不写回、写回草稿后再走合同/源/证据核实，通过则转正成对工件并授权删除两份草稿，其余失败出口一律返回 saved-with-errors。 |  |
| lib/planner-budget.js | toolCallCount | L11-40 | 统计成功配对的工具调用次数，按调用方传入的 skipNames 跳过豁免名（现为 FREE_TOOLS 两项：save_plan 与 edit_plan_draft），事件非数组直接返回 0。 |  |
| lib/planner-budget.js | lastMainSessionAnchorIndex | L43-53 | 从消息序列尾部反向定位最近一条主会话锚点的索引；供 toolCallsSinceUser 与 budgetReminderSent 复用同一遍历，避免两处各写一遍反向查找逻辑。 |  |
| lib/planner-budget.js | toolCallsSinceUser | L56-61 | 只统计最近一条用户或代理消息锚点之后的成功工具调用，无锚点时退回与全量口径一致。 |  |
| lib/planner-budget.js | appendSuffixBlock | L63-80 | 把文案追加到首个文本块末尾并补换行，空文案、非用户来源或已含该文案时原样返回消息。 |  |
| lib/planner-budget.js | withPlannerPromptSuffix | L82-89 | 追加探查后缀并为非结尾文本块补换行，非文本首块或单块消息时只做追加、不改动结构。 |  |
| lib/planner-budget.js | budgetNoticeText | L94-96 | 生成探查预算说明文案，含本轮上限次数与申请继续探查的固定格式，纯文案不读会话状态。 |  |
| lib/planner-budget.js | withBudgetNotice | L98 | 把预算说明追加进用户消息的首个文本块，纯文案拼接，消息形状不合法时原样返回消息。 |  |
| lib/planner-budget.js | budgetReminderText | L100-104 | 按剩余次数生成提醒文案，预算不高于阈值或剩余次数不在提醒窗口内时一律返回空字符串。 |  |
| lib/planner-budget.js | budgetReminderMessage | L111-113 | 把提醒文案包成带插件自有来源标识的用户消息，规避宿主新格式的来源校验被当场拒收。 |  |
| lib/planner-budget.js | budgetReminderSent | L115-128 | 判定最近用户锚点之后是否已发过含标记的提醒消息，事件非数组或无该标记返回 false。 |  |
| lib/planner-budget.js | budgetExhaustedReason | L130-132 | 生成探查预算耗尽的说明文案，含已用与上限两个计数，纯文案自身不核对是否真的耗尽。 |  |
| lib/planner-budget.js | budgetExceeded | L134-136 | 预算超限判定：已用严格大于上限才为真，相等不算超限，也不负责计数增删与文案生成。 |  |
| lib/preset-sync.js | errorWithCause | L32-36 | 把 message 与底层 cause 组装成新的 Error 对象并返回，只构造错误、从不抛出 |  |
| lib/preset-sync.js | assertInstallAnchor | L38-53 | 校验 installAnchor 必须是存在的绝对 package.json 且属于官方应用，任一不符即抛错 |  |
| lib/preset-sync.js | loadOfficialAgentPreset | L55-69 | 按 installAnchor 加载官方 preset adapter 并按锚点缓存，失败包成带 cause 的错误 |  |
| lib/preset-sync.js | assetReadTarget | L96-102 | 把预设资产相对路径在只读能力上下文里解析并校验为文件，返回绝对路径，越界或缺失即抛错 |  |
| lib/preset-sync.js | readAssetBytes | L104-113 | 读取预设资产文件字节，目标缺失时改抛带 label 的中文错误，其它异常原样上抛 |  |
| lib/preset-sync.js | resourceReadTarget | L115-129 | 按 kind 分流 host 或 workspace 解析资源路径并校验为文件，缺上下文或 kind 非法即抛错 |  |
| lib/preset-sync.js | readResourceBytes | L131-138 | 读取自定义资源字节，目标缺失时返回 null 而不抛错，其它异常照常上抛给调用方 |  |
| lib/preset-sync.js | contentHash | L140-157 | 对预设两个核心文件按顺序累加做 sha256 摘要，任一文件缺失返回 null 而不抛错 |  |
| lib/preset-sync.js | pluginRows | L160-172 | 按当前数组顺序深度优先展开 group 子行，非数组或非对象行跳过且不改变原数组 |  |
| lib/preset-sync.js | visit | L162-169 | 插件行遍历内部函数：跳过非对象项，遇 config 数组继续下钻递归，不做过滤也不复制行 |  |
| lib/preset-sync.js | pluginRowIds | L174-176 | 从展开后的插件行里挑出非空字符串 id 组成列表，无 id 或非字符串的行被丢弃 |  |
| lib/preset-sync.js | plainObject | L180-182 | 预设合并侧判据：确认 config、override、inherited 各层为可叠加普通映射，排除数组与空值。 |  |
| lib/preset-sync.js | effectiveRowConfig | L194-205 | 按继承配置、本轮配置与 override 三层依次合并出行生效配置，全无时返回 null |  |
| lib/preset-sync.js | validDefinitionValue | L210-212 | 直接用设置定义校验传入值是否合法，只返回布尔值，既不抛错也不做任何归一化与改写处理 |  |
| lib/preset-sync.js | resolveUnifiedConfig | L228-260 | 按当前 settings 行值解析 11 项与 gateWords；缺失/非法普通项取新默认，缺失或非法词表都回落当前资产默认并进 patch 补齐（回落原因进 diagnostics），资产自身损坏仍抛错。 |  |
| lib/preset-sync.js | restateSettingsConfig | L262-297 | 合并当前与继承配置后按 patch 重述全局设置行并整组删旧键；11 项非法键/值直接抛错且不落盘，gateWords 缺失/非法回落当前资产默认后补齐。 |  |
| lib/preset-sync.js | assertPresetDefinition | L299-313 | 校验主 definition 的 id、名称、17 条插件行与三个 group 契约，不符即抛错 |  |
| lib/preset-sync.js | parsePresetDefinition | L315-317 | 把 YAML 文本解析成 definition 并套用主预设契约校验，失败时向外抛错 |  |
| lib/preset-sync.js | assetDefinition | L322-327 | 读取生成的主 definition 并缓存，缓存对象视为只读，后续调用直接返回不再校验 |  |
| lib/preset-sync.js | assertRoleDefinition | L330-342 | 校验角色 definition 的 id、名称与固定首两行，不套用主预设 17 条契约 |  |
| lib/preset-sync.js | roleDefinitionOf | L344-349 | 按角色 id 取对应 definition 文件解析并校验，未知角色直接抛错不兜底 |  |
| lib/preset-sync.js | assetDefinitions | L352-354 | 返回主 definition 加四个角色 definition 的有序列表，主定义在前角色在后 |  |
| lib/preset-sync.js | roleDefinitionsWithPresentation | L363-387 | 把主 definition 的呈现模式投影到四个角色 definition，行数不为 1 或异常时原样返回 |  |
| lib/preset-sync.js | readDefinitionGateWords | L389-393 | 从 definition 的词表行取出词表并校验，缺该行或格式非法时直接抛错，不做默认兜底 |  |
| lib/preset-sync.js | projectHostRow | L405-424 | 按定位表把单个设置值改写到宿主行，返回 ok、skipped 或 missing 表示结果 |  |
| lib/preset-sync.js | cloneDefinitionWithProjection | L426-438 | 深克隆 definition 后逐项投影设置值，缺宿主行时抛错，绝不回退到生成物默认值 |  |
| lib/preset-sync.js | definitionWithProjection | L440-442 | 以资产 definition 为底克隆并套用给定投影，返回新的 definition 副本 |  |
| lib/preset-sync.js | publicConfigOf | L444-447 | 取行或配置对象的公开 config，取值非对象或取不到时一律返回空对象而不抛错，不做克隆 |  |
| lib/preset-sync.js | assertTemplateGateWords | L451-455 | 校验厂商模板文本里的 gateWords 能被解析且合法，任何不符情形都立即抛错 |  |
| lib/preset-sync.js | syncPreset | L460-480 | 核对模板 gateWords 与当前资产 definition，按 settings 行补齐 patch 并派生投影；patch 为空返回 idle，否则交给 apply 写唯一全局行。 |  |
| lib/preset-sync.js | findEntry | L482-485 | 在行数组里按 entry 选项中的 id 找唯一一项并返回其 entry，多命中返回 undefined |  |
| lib/preset-sync.js | editSettingsConfig | L487-499 | （待补充） |  |
| lib/preset-sync.js | applyPlan | L501-509 | 只把计划中的设置值经 editor.edit 重述到全局行，设置行缺失即抛错且不写入 |  |
| lib/preset-sync.js | trustedProfileContextOf | L511-518 | 优先取 ctx.profileContext，缺失时退回 ctx.get 读取，两者都不可得返回 undefined |  |
| lib/preset-sync.js | settingsValuesFromRows | L522-525 | 从行数组取全局设置行唯一的生效配置，该行不存在或出现多行时返回 undefined |  |
| lib/preset-sync.js | projectedAssetDefinition | L530-536 | 只按当前 settings 行值解析并投影 definition，不读取 raw patch 或历史声明。 |  |
| lib/preset-sync.js | structuralValue | L538-549 | 把值归一成可比对结构，函数转标记、环转占位并跳过 fiber 与 entry 键 |  |
| lib/preset-sync.js | rowStructureRecord | L551-570 | 把一行归一成 id、name、disabled 与 config 结构记录，设置行返回 undefined |  |
| lib/preset-sync.js | structuralFingerprint | L573-591 | 遍历行生成不含 settings 行配置的通用结构指纹，跳过 fiber/entry，不附旧 owner，用于结构交接判定。 |  |
| lib/preset-sync.js | visit | L575-588 | structuralFingerprint 内部函数：展开嵌套 config 行收集结构记录，跳过非数组与无效行。 |  |
| lib/preset-sync.js | installAnchorOf | L593-596 | 取 profileContext 的 installAnchor，缺失时回退到 options 里传入的取值 |  |
| lib/preset-sync.js | mountPresetSync | L598-786 | 挂载预设同步：首次收敛设置、投影并顺序挂载官方 adapter，返回幂等的释放函数 |  |
| lib/preset-sync.js | disposeFiber | L612-615 | 调用 fiber 的 dispose 释放已挂载项，fiber 无效或无 dispose 方法时返回 undefined |  |
| lib/preset-sync.js | reportSettledError | L616-623 | 上报落定设置回调的错误，上报回调自身再失败时只打印控制台告警，不阻断流程也不重抛 |  |
| lib/preset-sync.js | reportAdapterError | L624-632 | 组装 phase 与消息成诊断对象并转交错误回调，上报器自身抛错时降级为控制台告警 |  |
| lib/preset-sync.js | readState | L633-641 | 读取 configEditor 当前 rows 并计算非 settings 通用结构指纹，不读取 raw patch 或历史行。 |  |
| lib/preset-sync.js | snapshotOf | L642-650 | 从当前 rows 的 settings 行解析十一项与 gateWords，深拷贝快照交给 settled 回调，不做写入。 |  |
| lib/preset-sync.js | enqueueSettled | L651-662 | 把落定回调串进串行队列按序执行，回调异常转给错误上报且队列继续向下推进，不丢后续更新 |  |
| lib/preset-sync.js | settledSettingsUpdate | L663-671 | 先取当前设置快照再入队上报，取快照失败时只上报错误而不阻断后续更新，并返回上报结果 |  |
| lib/preset-sync.js | enqueueStructural | L672-680 | 把结构任务串进结构队列串行执行并吞掉失败，只打印告警不阻断设置同步流程，返回安全 promise |  |
| lib/preset-sync.js | mountOfficialAdapter | L685-710 | 按顺序挂载主与角色 definition，任一失败即回滚已挂载 fiber 并抛错 |  |
| lib/preset-sync.js | disposeCurrentAdapter | L711-715 | 倒序释放当前已挂载的全部 adapter fiber，随后清空本地引用，供重新挂载使用 |  |
| lib/preset-sync.js | structuralHandoff | L716-733 | 结构变化后重算同步计划、按需写设置并重新挂载官方 adapter，已失活时静默返回 |  |
| lib/preset-sync.js | apply | L724 | 结构交接阶段应用设置计划的回调，已失活时由写入层内部自行跳过，不抛错也不重试写入 |  |
| lib/preset-sync.js | initialMount | L734-758 | 首次读取状态、收敛设置并按序挂载 definition，整体失败只上报诊断不阻断后续同步 |  |
| lib/preset-sync.js | apply | L742 | 首次挂载时应用设置计划的回调，绑定初始 editor 与当前活性判定，失活即跳过 |  |
| lib/preset-sync.js | settledOnlyUpdate | L759 | 只处理落定设置更新的轻量入口，不触发结构重挂与 adapter 交接，避免多余挂载 |  |
| lib/preset-sync.js | dispose | L775-783 | 关闭更新订阅、等待两个队列收敛并释放 adapter，重复调用直接返回不再重复执行 |  |
| lib/preset-yaml.js | loadYaml | L5-8 | 按本模块地址创建 require 并加载 js-yaml，只在模块初始化时调用一次。 |  |
| lib/preset-yaml.js | resolve | L13 | 作为 !!js 标量类型的 resolve 回调，只判断解析值是否为字符串，不做其它校验。 |  |
| lib/preset-yaml.js | construct | L14 | 作为 !!js 标量类型的构造回调，把原文包成带 __jsExpr 的对象而不执行。 |  |
| lib/preset-yaml.js | predicate | L15 | 作为 !!js 标量类型的判定回调，只认带字符串 __jsExpr 字段的对象。 |  |
| lib/preset-yaml.js | represent | L16 | 作为 !!js 标量类型的序列化回调，输出 __jsExpr 原文而不额外加引号。 |  |
| lib/preset-yaml.js | parsePresetYaml | L32-35 | 解析多文档 YAML 只取第一文档，空流返回 undefined，不抛错也不做结构校验。 |  |
| lib/preset-yaml.js | hasOwn | L37-39 | 判断对象自身是否含有指定键，用与原型链无关的自有属性检查，非对象或空值入参一律返回假。 |  |
| lib/preset-yaml.js | pathParts | L41-43 | 把点分路径拆成非空段数组，空段与连续的点被忽略，不解析转义符也不做数组下标扩展。 |  |
| lib/preset-yaml.js | readPath | L45-52 | 逐段读取对象路径上的值，任一段缺失即返回 exists 为假，不抛错也不回退默认值。 |  |
| lib/preset-yaml.js | collectRowsById | L54-69 | 深度优先收集同 id 的全部行及其数据路径，按对象身份去重，防止环引用导致无限递归。 |  |
| lib/preset-yaml.js | visit | L57-66 | collectRowsById 的内部递归闭包，逐层遍历数组与对象并累积数据路径。 |  |
| lib/preset-yaml.js | rowsById | L72-74 | 返回同 id 的全部行对象，不附带任何数据路径，直接沿用既有消费者所需的返回形状。 |  |
| lib/preset-yaml.js | rowsByIdWithPath | L77-84 | 返回同 id 行的序号、行对象与点分数据路径，供唯一行诊断及 canonical settings 行规划复核。 |  |
| lib/preset-yaml.js | resolveLocator | L86-113 | 按单个定位器解析行与叶值：零命中为 missing、多命中为 ambiguous、否则 ok。 |  |
| lib/preset-yaml.js | locatorFor | L115-120 | 取描述符的 sourceLocator，无该字段时把入参当作裸定位器原样返回，不校验形状。 |  |
| lib/preset-yaml.js | aliasesFor | L122-127 | 取描述符的别名定位器数组，缺该字段或不是数组时一律返回空数组，不回退到主定位器。 |  |
| lib/preset-yaml.js | resolveSetting | L136-149 | 依次试主定位器与别名定位器，多命中或任一歧义即判 ambiguous，全空判 missing。 |  |
| lib/preset-yaml.js | resolveTemplateSettingDefault | L151-166 | 从模板解析单项默认值并校验归一，描述符缺失、解析失败或值非法一律抛错，不回退默认。 |  |
| lib/preset-yaml.js | captureRowSettings | L177-193 | 按权威 settings 行捕获各设置并附 rowPresent 标志，只认规范 name 的行。 |  |
| lib/preset-yaml.js | migrationEntryName | L196-199 | 从迁移条目取插件名，兼容 entry.options.name 与顶层 name 两种形状。 |  |
| lib/preset-yaml.js | migrationEntryConfig | L201-207 | 按继承、本条目与覆盖三层浅合并迁移条目的 config，非对象层直接忽略，不深合并。 |  |
| lib/preset-yaml.js | migrationManagedConfig | L209-216 | 只取受管键并逐项校验归一，缺键、值非法或 gateWords 非法均返回 undefined。 |  |
| lib/preset-yaml.js | migrationComparable | L218-221 | 把受管 config 归一为可比较快照，非法时返回 undefined 供上层判冲突。 |  |
| lib/preset-yaml.js | migrationHash | L223 | 对文本按 UTF8 计算 sha256 十六进制摘要，不判空也不吞错，供迁移前后比对。 |  |
| lib/preset-yaml.js | migrationIgnorable | L224 | 判断某行是否为空行或整行注释，只做去掉空白后的前缀判断，不看缩进也不看引号状态。 |  |
| lib/preset-yaml.js | migrationScalarToken | L226-231 | 去掉行内注释后再解出引号标量，双引号转义失败时退化为直接删掉首尾字符，并不抛错。 |  |
| lib/preset-yaml.js | migrationRowStarts | L233-239 | 找出各行起始下标，只认行首列表项的 id 或 override 键，跳过缩进不符的行。 |  |
| lib/preset-yaml.js | migrationRowId | L241-247 | 在给定行区间内找首个 id 键并解出值，未找到返回 undefined 不抛错。 |  |
| lib/preset-yaml.js | planCanonicalSettingsMigration | L250-313 | 只规划临时 fixture 的 canonical settings 行去重，回读校验后给出新文本与回滚快照，从不写文件。 |  |
| lib/preset-yaml.js | findPluginsRow | L315-326 | 在插件行中按 id 深度优先查子行，含 group 行子行数组，未命中返回 null。 |  |
| lib/preset-yaml.js | inlineCommentIndex | L329-347 | 在引号态之外找行内注释起点，引号内的井号不算注释，未找到时返回 -1 而不抛错。 |  |
| lib/preset-yaml.js | lineIndent | L349-352 | 量出行首空格的个数作为缩进量，只认空格字符，制表符与其它空白字符一律不计入其中。 |  |
| lib/preset-yaml.js | withoutCr | L354-356 | 只去掉行尾的一个回车符，没有回车时原样返回同一字符串，不处理行中间出现的回车符。 |  |
| lib/preset-yaml.js | parseRowId | L358-370 | 从行里解出行 id 标量，支持单双引号与行内注释，非 id 行返回 null 不抛错。 |  |
| lib/preset-yaml.js | parseMapKey | L372-376 | 解出映射行的键名与缩进，列表项行或非键行返回 null，遇到引号包裹的键也不展开。 |  |
| lib/preset-yaml.js | rowEnd | L378-386 | 找出某个行块的结束下标，跳过空行与注释行，遇到首个同级或更浅缩进的非空行即停止。 |  |
| lib/preset-yaml.js | findDirectKey | L388-406 | 在行块内找指定键的直接子行下标，层级不符或未命中均返回 null，不做模糊匹配。 |  |
| lib/preset-yaml.js | textPathLine | L408-420 | 按点分路径逐层下钻查找文本行下标，任一层缺失即返回 null，不回头猜测近似行。 |  |
| lib/preset-yaml.js | findTextLocatorMatches | L422-438 | 在原文里按定位器查找行匹配，返回每项的行起止与叶行下标，无匹配时返回空数组不抛错。 |  |
| lib/run-code-scanner.js | maskCodeLiteralsAndComments | L3-196 | 把代码里的字符串、模板、正则与注释按原长度抹成空格，保留行号与字符偏移对齐，不改变其它字符 |  |
| lib/run-code-scanner.js | isIdentifierStart | L12 | 判断单字符能否作为标识符首字符，仅接受 ASCII 字母、下划线、美元符，其余一律返回假 |  |
| lib/run-code-scanner.js | isIdentifierPart | L13 | 判断单字符能否作为标识符后续字符，在首字符集基础上额外接受十进制数字，其它字符返回假 |  |
| lib/run-code-scanner.js | blank | L14-18 | 把区间内字符抹为空格但跳过换行与回车，用于遮蔽字面量而不破坏原有行结构与行号对应 |  |
| lib/run-code-scanner.js | scanString | L19-30 | 从起始引号扫到配对收尾引号，正确处理反斜杠转义，未闭合或到文本末尾则返回文本长度 |  |
| lib/run-code-scanner.js | scanRegex | L31-51 | 扫描正则字面量：跳过字符类内的斜杠，遇换行即止，收尾一并吃掉后续修饰符字母与标志 |  |
| lib/run-code-scanner.js | scanTemplate | L52-68 | 扫描模板字符串：遇反引号收尾，遇美元花括号插值则递归扫描内部代码块，返回结束位置 |  |
| lib/run-code-scanner.js | scanCode | L69-193 | 主扫描循环：区分块与对象字面量、推断正则起点，遇字符串模板正则与注释即遮蔽后前进 |  |
| lib/run-code-scanner.js | sliceBalancedArgs | L202-218 | 自调用左括号配平圆括号、方括号与花括号取参数切片，返回闭括号位置与未遮蔽的参数字面原文 |  |
| lib/run-code-scanner.js | staticBracketKeyOf | L220-235 | 识别静态字符串下标中的合法键名，键非法或尾随非闭括号时返回空值，交给调用方按动态访问处理 |  |
| lib/run-code-scanner.js | skipStaticKeyTrivia | L237-256 | 跳过空白与块行注释定位下一个有效字符，注释未闭合时直接退到文本末尾，不抛错也不回退 |  |
| lib/run-code-scanner.js | hasDynamicRunCodeAccess | L260-297 | 判断代码里是否存在无法静态解析的工具下标访问，静态调用内的访问仍继续扫描不提前返回假 |  |
| lib/run-code-scanner.js | isIdentifierPart | L263 | 动态访问判定内的标识符续字符判定，用于排除粘连在工具名前的非空边界，与顶层同名函数职责不同 |  |
| lib/run-code-scanner.js | skipWhitespace | L264-268 | 动态访问判定内的局部空白跳过器，返回首个非空白字符下标，只用于定位不改动传入文本 |  |
| lib/run-code-scanner.js | bracketEndOf | L269-279 | 动态访问判定内自左方括号配平到配对右括号，未闭合时返回负一表示失配，由调用方判为动态 |  |
| lib/run-code-scanner.js | collectRunCodeSites | L299-359 | 收集全部工具取用调用点，输出调用起止、括号内参数原文与可静态解析的工具名，顺序按出现先后 |  |
| lib/run-code-scanner.js | isIdentifierStart | L303 | 调用点收集内的标识符首字符判定，用于点号后工具名的起始位置校验，不接受数字或符号开头 |  |
| lib/run-code-scanner.js | isIdentifierPart | L304 | 调用点收集内的标识符续字符判定，用于切出完整工具名并跳过其后的空白，遇到非标识符即止 |  |
| lib/run-code-scanner.js | skipWhitespace | L305-309 | 调用点收集内的空白跳过器，用于定位点号、括号等语法符号的相对位置，不跳过字符串内容 |  |
| lib/run-code-scanner.js | bracketEndOf | L310-320 | 调用点收集内自左方括号配平，供静态键识别与括号后是否紧跟调用的形态判断，未闭合返回负一 |  |
| lib/run-code-static.js | runCodeTextOf | L22-26 | 从执行参数里取 run_code 的 code 文本，非字符串一律返回空串而不抛错 |  |
| lib/run-code-static.js | codeMutationHints | L29-37 | 静态扫描 code 是否命中写模式黑名单，返回去重的 hint id 列表并保持黑名单顺序 |  |
| lib/run-code-static.js | parseStaticLiteral | L41-173 | 解析安全的静态字面量子集：先走 JSON 快路径再走无执行解析器，不合法返回失败标记 |  |
| lib/run-code-static.js | fail | L52 | 字面量解析失败时抛出固定的 not a static literal 错误，由外层统一收敛为解析失败结果 |  |
| lib/run-code-static.js | skipWhitespace | L53-55 | 解析器内的辅助闭包：把游标下标前移跳过空白字符，到源串末尾即停，不返回新下标也不报错 |  |
| lib/run-code-static.js | isIdentifierChar | L56 | 判断字符是否可作标识符后续字符，字母数字下划线与美元符为真，未定义字符判假，用于边界判定 |  |
| lib/run-code-static.js | parseString | L58-98 | 解析单双引号字符串字面量并还原常见转义，遇换行、未闭合或非法转义立即抛出失败，不返回半成品 |  |
| lib/run-code-static.js | parseValue | L100-163 | 递归解析字面量值：对象、数组、字符串、布尔、空值与数字，并拦截原型污染键和重复键 |  |
| lib/run-code-static.js | createRunCodeStatic | L175-621 | 装配 run_code 静态预审闭包：拆解、容错闸门、问询返回闸门与上限判定共用一套纯函数 |  |
| lib/run-code-static.js | decomposeRunCode | L190-228 | 把 code 拆成去重的工具调用组成员并标记动态访问，动态或不可解析的调用不计入组 |  |
| lib/run-code-static.js | addMember | L197-206 | 按调用名称与参数序列化拼成去重键后追加成员，同名同参合并去重，同名不同参分别保留为两条 |  |
| lib/run-code-static.js | markRange | L207-209 | 在占用位图上把已识别调用点覆盖的字符区间逐位标记为已占用，供后续裸写扫描跳过这些文本 |  |
| lib/run-code-static.js | runCodeCatchGateReason | L234-305 | 多调用容错闸门：调用点达两个且未逐个独立 try/catch 时返回拒绝文案，单调用豁免 |  |
| lib/run-code-static.js | within | L261 | 判断调用点起始位置是否落在给定起止区间内，供 try 块内调用点归属与保护计数使用，含两端 |  |
| lib/run-code-static.js | askOrGateReturnGateReason | L309-573 | ask_user_question 与 extra_plan_gate 共用的返回链闸门：真实调用仍必须证明结果返回用户层；只排除已静态证明的同名数据位置，无法证明的裸名、工具访问或返回链仍拒绝。 |  |
| lib/run-code-static.js | reasonFor | L314 | 按实际命中的工具名（ask_user_question 或 extra_plan_gate）拼出返回链拒绝文案。 |  |
| lib/run-code-static.js | isIdChar | L316 | 判断字符是否为标识符字符，字母数字下划线与美元符为真，用于词边界判定且不抛错，只读纯函数 |  |
| lib/run-code-static.js | skipWs | L317-321 | 从给定下标起跳过空白字符并返回新的下标，到串尾即停，供前缀匹配与表达式定位使用，不修改入参 |  |
| lib/run-code-static.js | dataOffsets | L370-416 | （待补充） |  |
| lib/run-code-static.js | accept | L374-401 | （待补充） |  |
| lib/run-code-static.js | isTopLevel | L468 | 判断该位置是否处于花括号、圆括号、方括号三种深度都为 0 的顶层语句位置，用于语句切分 |  |
| lib/run-code-static.js | candidateStarts | L469-476 | 收集调用点之前所有顶层语句的起始下标，供匹配 return 或赋值前缀时逐段尝试 |  |
| lib/run-code-static.js | tokenAt | L477-478 | 判断位置处是否为独立关键字，要求前后都属于标识符边界，避免命中更长标识符或属性名的一部分 |  |
| lib/run-code-static.js | expressionEnd | L479-488 | 取顶层表达式的结束下标：遇顶层分号或后接语句的换行即止，否则一直取到源串末尾，不解析语义 |  |
| lib/run-code-static.js | references | L489-504 | 判断表达式是否按标识符边界实际引用了该变量，属性名与对象键名不算引用，不抛错也不建语法树 |  |
| lib/run-code-static.js | hasReassignment | L505-522 | 判断表达式内是否对该变量重新赋值或自增自减，含前后置自增与复合赋值形态，不解析语义 |  |
| lib/run-code-static.js | afterCall | L523-533 | 取调用点之后的非空白下标与是否带分号的标记，供判定该调用是否独立成句，不修改原文本 |  |
| lib/run-code-static.js | escapeRegExpText | L537 | 把工具名中的非标识符字符转义后再拼进正则选择式，避免前缀同名工具被误配。 |  |
| lib/run-code-static.js | runCodeSiteCount | L577-594 | 统计 code 内的工具调用点数：run_code 自身不计，参数可解析时递归展开其 code |  |
| lib/run-code-static.js | isRunCodeSubCall | L598-603 | 判定执行是否为子调用：带 sub 标记或有 parent 即为真，直呼与根调用为假 |  |
| lib/run-code-static.js | runCodeDispatchCapText | L606-608 | 生成子调用超上限的固定告警文案，含实例 ID、实际计数与额度上限三项，供运行时与纯函数共用 |  |
| lib/runtime-lifecycle.js | createRuntimeLifecycle | L4-162 | 按 apply 建立运行时生命周期，集中工具注册、prober 认领与 run_code 拒绝记录，状态不跨实例共享。 |  |
| lib/runtime-lifecycle.js | registerTool | L12-41 | 按 agent 幂等注册工具，服务缺失或 schema 永久失败只记日志不抛错，重复注册保留既有工具。 |  |
| lib/runtime-lifecycle.js | saveBootstrapWhen | L54-62 | save 工具注册的 when 判据：引导相位不激活；异常或缺 context 时保守返回 true |  |
| lib/runtime-lifecycle.js | registerSavePlan | L64 | 以 save_plan 名注册落盘工具，复用注册去重，失败只记日志不中断 apply。 |  |
| lib/runtime-lifecycle.js | registerSaveProbe | L65 | 以 save_probe 名注册探查工具，与落盘工具同走注册去重，重复调用直接跳过。 |  |
| lib/runtime-lifecycle.js | registerEditPlanDraft | L69 | 以 edit_plan_draft 名注册草稿修复工具：与 save_plan/save_probe 共用同一个 saveBootstrapWhen 判据但弱集独立，重复注册直接跳过。 |  |
| lib/runtime-lifecycle.js | isProberRole | L75-88 | 按会话头的预设标识判定 prober 身份，字段缺失或读取异常一律返回 false 不抛错。 |  |
| lib/runtime-lifecycle.js | probeClaimFor | L90-107 | prober 认领判定：先看预设身份，再回退父会话配额与无写工具校验，命中即扣减一次。 |  |
| lib/runtime-lifecycle.js | recordProbeClaim | L109-111 | 为父会话累加待认领探查配额，配额留在 per-apply 映射，父实例写入子实例读不到。 |  |
| lib/runtime-lifecycle.js | noteRunCodeSubCall | L113-120 | 按 rootCallId 累计 run_code 子调用并返回 null，超上限或 id 为空直接返回超限文案。 |  |
| lib/runtime-lifecycle.js | recordRunCodeDeny | L122-133 | 记录 run_code 子调用的拒绝原因，非子调用、原因为空或缺会话 id 时静默跳过。 |  |
| lib/runtime-lifecycle.js | takeRunCodeDenyRecords | L135-143 | 取出并移除某 root 的拒绝原因集合，会话或 root 无记录时返回 undefined 不抛错。 |  |
| lib/runtime-lifecycle.js | disposeSession | L145-153 | 会话结束时清掉该会话的全部计数与记录映射，只清内存表，不触碰持久化数据与其它会话。 |  |
| lib/runtime-lifecycle.js | pendingProbeCount | L160 | 读取会话剩余待认领探查配额数，无记录时返回 0 而不是 undefined，也不抛错。 |  |
| lib/runtime-static.js | errorCodeOf | L3-5 | 取错误对象上的字符串 code，非对象或 code 非字符串一律返回空串；原 4 份逐字副本（gate-tool/factories/probe/ledger）已收敛到此，供 channel-error 错误码与 TARGET_MISSING 等分支判断 |  |
| lib/runtime-static.js | errorText | L7-9 | 把任意异常收敛成可读文本：Error 取 message，其它值直接 String 转换，不抛错也不返回空；usage-ledger 以 import { errorText as errorMessageOf } 别名复用 |  |
| lib/runtime-static.js | causeChainOf | L11-23 | 沿 cause 链最多取指定层数错误的 name、message 与 code，超长 message 截断，不抛错。 |  |
| lib/save-contract.js | sanitizeTaskName | L4-12 | 任务短名净化：仅保留字母、数字、下划线、连字符与中日韩文字，非字符串或空结果返回空串。 |  |
| lib/save-contract.js | timestampOf | L15-18 | 把 Date 格式化为本地秒级时间戳文本，仅供内部拼接，不做时区换算与同秒唯一承诺。 |  |
| lib/save-contract.js | pad | L16 | 时间戳拼接用的两位补零本地闭包，不导出、不校验入参，超出两位时按原值输出不做截断。 |  |
| lib/save-contract.js | timestamp | L20-22 | 返回当前本地时间戳文本（秒粒度），不承诺同秒唯一，唯一性交由工件 base 负责。 |  |
| lib/save-contract.js | sessionTagOf | L26-28 | 取会话 id 去掉分隔符后的前 8 位字母数字作标识段，id 非字符串时返回空串。 |  |
| lib/save-contract.js | saveArtifactBase | L34-49 | 工件 base 唯一真源：任务短名、会话段、毫秒时间、进程号与进程内序号拼接，同毫秒也不碰撞。 |  |
| lib/save-contract.js | summaryList | L56-58 | 把数组字段拼成顿号分隔文本，非数组或空数组返回空串，元素统一字符串化且不做转义。 |  |
| lib/save-contract.js | summaryBool | L60-62 | 只有严格等于 true 才输出「是」，其余含真值型字符串与数字一律输出「否」，不抛错。 |  |
| lib/save-contract.js | formatSavePlanSummary | L65-120 | 把保存摘要渲染成确定性派遣正文，逐任务、逐检查分行输出，不写本次生成的落盘路径。 |  |
| lib/save-contract.js | renderSavePlan | L127-130 | 把落盘路径列表包成 ContentBlock 文本块，缺失或非数组按空列表处理，绝不返回裸字符串。 |  |
| lib/save-contract.js | renderProbeMarkdown | L165-206 | 渲染探查线索或证据报告 Markdown，标题与卷首随 evidence 有无切换，第五节仅证据模式追加。 |  |
| lib/save-contract.js | trimProbeEvidenceDecor | L232-243 | 由外向内反复剥除成对的外层装饰符号，单侧装饰一律保留，避免误删路径文件名的首尾字符。 |  |
| lib/save-contract.js | extractProbeEvidenceRefs | L244-257 | 从【探查者已核实】标记里提取证据路径并按出现顺序去重，入参非字符串或为空返回空数组。 |  |
| lib/save-contract.js | renderSaveProbe | L261-263 | 把探查落盘路径包成 ContentBlock 文本块，标题按 hasEvidence 二参切换线索或证据语义。 |  |
| lib/save-persistence.js | fsOpsOf | L10-13 | 合并注入的 fs 操作与默认实现；入参非对象时直接返回冻结的默认操作集，供测试注入隔离。 |  |
| lib/save-persistence.js | policyOf | L15-17 | 把可选策略参数规整为对象，非对象入参返回空对象，避免调用方到处判空与取属性报错。 |  |
| lib/save-persistence.js | authorizeDirectory | L19-23 | 无路径上下文时返回 null；有则解析工作区目录并以任意类型准备写目标，越界即抛错。 |  |
| lib/save-persistence.js | authorizeFile | L25-29 | 无路径上下文时返回 null；有则准备文件写目标，允许目标不存在，越界或非法路径抛错。 |  |
| lib/save-persistence.js | cleanupCreated | L31-42 | 逐个授权并删除本次创建的文件，逐项收集失败为路径加原因文本，不中断整次清理流程。 |  |
| lib/save-persistence.js | commitError | L44-50 | 把失败阶段、原始错误与清理失败明细合成一个带 cause 的错误，用于上报提交失败。 |  |
| lib/save-persistence.js | atomicCommit | L55-105 | 单次提交：建目录、逐个写临时文件、逐个检查并顺序发布；失败只清理本次临时与已发布件。 |  |
| lib/save-persistence.js | replaceError | L107-112 | atomicReplace 专用错误包装：用 cause 保留原始错误，消息标出失败阶段，并分列恢复失败与临时清理失败 |  |
| lib/save-persistence.js | sameFile | L114-117 | （待补充） |  |
| lib/save-persistence.js | stagePairFile | L119-132 | （待补充） |  |
| lib/save-persistence.js | atomicReplace | L135-223 | 覆盖语义落盘：成对覆盖先保留原字节或缺席状态；普通失败时只恢复能确认由本轮发布的目标，并分列恢复和清理失败。单文件覆盖语义不变；不承诺崩溃或跨进程原子性 |  |
| lib/save-plan-validation.js | newFileRecord | L63-65 | 解析期新建文件记录，保存路径、角色与操作和修改点容器，当前修改点初始为空以约束字段顺序。 |  |
| lib/save-plan-validation.js | newTask | L67-79 | 按任务编号与标题创建任务结构，一次性预置全部字段数组与空文件集合，供解析器逐行填充。 |  |
| lib/save-plan-validation.js | newClosure | L81-92 | 创建收尾块结构，携带收尾文件、收尾依赖与动作容器及空文件集合，并记录块首行行号。 |  |
| lib/save-plan-validation.js | newCheck | L95-101 | 创建检查块结构，预置验收组、取证方式、工作目录与覆盖标记，供验收侧校验与汇总复用。 |  |
| lib/save-plan-validation.js | newGlobal | L103-105 | 创建全局验收块结构，只含期望、禁止与正式验收引用容器，不带任务级文件与修改点字段。 |  |
| lib/save-plan-validation.js | makeDiagnostic | L107-117 | 组装一条诊断对象，空值统一转为空串，未指定修复模板时按字段名回退到默认模板文案。 |  |
| lib/save-plan-validation.js | defaultTemplate | L119-153 | 按字段名返回最小修复模板示例文本，遇到未知字段回退为通用填写提示，保证诊断可直接照抄。 |  |
| lib/save-plan-validation.js | normalizeText | L155-157 | 把输入文本统一成 LF 换行，非字符串一律归一为空串，避免跨平台换行符导致切分错行。 |  |
| lib/save-plan-validation.js | fieldOf | L159-164 | 按字段前缀表匹配行首标签，命中时返回键名、中文标签与去空白后的值，未命中返回 null。 |  |
| lib/save-plan-validation.js | isPlaceholderAnchor | L173-175 | 判断锚点是否只是整个文件、待定、占位等空泛占位词，命中即视为不可用伪锚点，不做原文比对。 |  |
| lib/save-plan-validation.js | isAcceptancePlaceholder | L177-180 | 先剥掉尾部标点，再判断验收定位是否只是同方案、同上或纯 M 编号这类占位写法，命中即视为占位。 |  |
| lib/save-plan-validation.js | parseLocation | L182-190 | 解析修改位置的行号区间写法，单点或起止区间都认，端点非安全正整数或倒序时返回 null 不抛错。 |  |
| lib/save-plan-validation.js | pointIdentity | L192-194 | 取修改点编号的文本值，修改点缺失或编号为空时返回空串，避免集合比较与正则校验抛错。 |  |
| lib/save-plan-validation.js | headingCandidate | L197-209 | 按正则识别任务、检查、收尾与全局验收标题，格式写错的候选标题单独归类，全不匹配返回 null。 |  |
| lib/save-plan-validation.js | pushEmptyFieldDiagnostic | L211-215 | 仅在字段值为空时生成结构字段不能为空的诊断，非空则返回 undefined 由调用方自行跳过。 |  |
| lib/save-plan-validation.js | parseTaskDocument | L217-447 | 逐行解析方案或验收正文：跳过围栏代码块，按阶段收敛结构块并收集字段与标题类诊断。 |  |
| lib/save-plan-validation.js | flush | L230-237 | 把当前结构块按类型归入任务、检查、收尾或全局列表并清空游标，遇到新标题前必先调用。 |  |
| lib/save-plan-validation.js | wrongHeading | L239-241 | 以空任务编号记录标题错位诊断，只携带文档名与原始行文本，不中断后续逐行解析流程。 |  |
| lib/save-plan-validation.js | pushField | L243-247 | 把字段值追加到所属结构块的同名数组，值为空时顺带压入一条空字段诊断后继续解析剩余行。 |  |
| lib/save-plan-validation.js | requireFile | L249-253 | 要求文件级字段紧跟主文件、关联文件或收尾文件之后，否则记诊断并返回 null 表示缺失。 |  |
| lib/save-plan-validation.js | requirePoint | L255-261 | 要求定位字段之前已声明对应修改点，缺失时报错并返回 null，避免字段挂到错误的层级。 |  |
| lib/save-plan-validation.js | validateIds | L449-460 | 校验任务或检查编号不重复、从 1 连续且按升序出现，每种违反情形各记一条编号诊断。 |  |
| lib/save-plan-validation.js | isMarkdownWrapped | L462-473 | 判断路径是否被反引号、括号、引号或加粗标记包裹，用于拒绝 Markdown 化的路径写法。 |  |
| lib/save-plan-validation.js | pathIssue | L475-488 | 校验工作区相对路径：空值、行号、盘符、绝对路径、反斜杠、点段与包裹写法各返回错误文案。 |  |
| lib/save-plan-validation.js | workdirIssue | L490-495 | 校验工作目录写法，单独放行点号表示当前目录，其余规则复用路径校验并返回问题文案。 |  |
| lib/save-plan-validation.js | platformIsCaseInsensitive | L497-501 | 判定路径比较是否忽略大小写，优先取调用方平台或显式开关，缺省时回退到当前进程平台。 |  |
| lib/save-plan-validation.js | pathKey | L503-506 | 把路径统一为正斜杠，大小写不敏感平台再转小写，作为文件集合去重与跨文档比对的键。 |  |
| lib/save-plan-validation.js | parseDependencies | L508-517 | 解析依赖字段，写无时得到空依赖列表，其余必须是 [任务N] 列表且不得重复引用同一任务。 |  |
| lib/save-plan-validation.js | parseResources | L519-527 | 解析独占资源为逗号分隔的稳定标识，允许写无，出现空项或重复项时返回问题文案而不抛错。 |  |
| lib/save-plan-validation.js | parseCheckRefs | L529-537 | 解析正式验收引用为 [检查N] 列表，空值、非法写法与重复检查编号均返回对应问题文案。 |  |
| lib/save-plan-validation.js | addPathDiagnostics | L539-544 | 逐条校验路径或工作目录并按需选用目录规则，把每个违反项压成带字段名的一条诊断后继续处理。 |  |
| lib/save-plan-validation.js | validatePathSet | L546-560 | 校验主文件与关联文件写法并检测同任务内重复，同时把原始集合与归一化键集写回任务对象。 |  |
| lib/save-plan-validation.js | validateResourceField | L562-570 | 限制独占资源为可选单值字段，重复声明或解析失败时记诊断，并回填解析出的资源标识列表。 |  |
| lib/save-plan-validation.js | validatePointIds | L572-580 | 校验同一文件内修改点编号形如 M 加非零正整数且互不重复，每种违规各记一条对应诊断。 |  |
| lib/save-plan-validation.js | validatePlanFileRecord | L582-627 | 校验单个方案文件记录：路径、文件操作唯一性、修改点数量及按操作类型分派的字段要求。 |  |
| lib/save-plan-validation.js | validatePlanFileRecords | L629-634 | 校验任务或收尾的文件记录数量与主文件、关联文件、收尾文件逐一对应，再逐个下钻校验。 |  |
| lib/save-plan-validation.js | validateAcceptanceFileRecord | L636-652 | 校验验收侧文件记录：操作唯一、对应修改点齐全，验收定位须是条件描述而非旧行号占位。 |  |
| lib/save-plan-validation.js | validateAcceptanceFileRecords | L653-658 | 校验验收文件记录数量与文件清单一一对应，缺记录或数量不符即记一条文件记录诊断，再逐项校验。 |  |
| lib/save-plan-validation.js | validateTaskShape | L660-697 | 校验任务外形：标题、主文件唯一、执行组与依赖理由成对，并按方案或验收分支追加各自要求。 |  |
| lib/save-plan-validation.js | graphCycles | L699-720 | 用三色标记做深度优先遍历求有向图环，按首次出现去重后返回成环节点序列，无环时得空数组。 |  |
| lib/save-plan-validation.js | visit | L704-717 | 图遍历的递归访问器，发现指向栈内节点的边即截取成环，回溯时把节点标记为已完成状态。 |  |
| lib/save-plan-validation.js | groupSort | L722-726 | 按执行组名去掉前缀后数值升序排序，数值相同时退化为字符串比较以保证输出顺序稳定。 |  |
| lib/save-plan-validation.js | firstTaskForGroup | L728-731 | 返回指定执行组内首个任务的编号，组内没有成员时返回 null 而不是抛出异常中断流程。 |  |
| lib/save-plan-validation.js | validatePlanRelations | L733-805 | 校验任务依赖存在性、自依赖与依赖环，并核对执行组环、文件独占、分组理由与资源归组。 |  |
| lib/save-plan-validation.js | fileRecordKey | L807-809 | 生成文件记录比对键：角色加归一化路径，使方案与验收能按同一键配对到同一个文件记录上。 |  |
| lib/save-plan-validation.js | pointIdSet | L811-813 | 收集某个文件下全部修改点编号组成集合，供方案与验收的修改点集合精确比对，缺失记为内置空串。 |  |
| lib/save-plan-validation.js | equalStringSets | L815-819 | 比较两个字符串集合是否完全相等，元素数量不同直接返回 false，不会抛出错误。 |  |
| lib/save-plan-validation.js | validateFileRecordMapping | L821-843 | 按记录键配对方案与验收的同名文件，比对文件操作与修改点编号集合并报出缺失的一侧。 |  |
| lib/save-plan-validation.js | validateCrossDocument | L845-869 | 跨文档校验任务编号、主文件、文件集合与收尾是否成对一致，并逐任务下钻文件记录映射。 |  |
| lib/save-plan-validation.js | validateClosure | L871-921 | 校验收尾块：收尾文件不重复、依赖恰好覆盖全部任务且不与任务文件重叠，验收侧另查期望禁止。 |  |
| lib/save-plan-validation.js | validateGlobal | L923-933 | 校验全局验收的期望与禁止非空、正式验收引用唯一，并把解析结果回填到检查引用列表。 |  |
| lib/save-plan-validation.js | validateChecks | L935-992 | 校验检查定义的编号、验收组、取证方式、工作目录与证据，并统计覆盖后清出孤儿检查。 |  |
| lib/save-plan-validation.js | attachRefs | L970-983 | 把任务、收尾或全局的正式验收引用回挂到检查的覆盖统计，引用不存在时报诊断并跳过该条。 |  |
| lib/save-plan-validation.js | sortIds | L994-996 | 对编号数组先去重再按数值升序排序，返回新数组且不改动入参的原始顺序与长度，空数组原样返回。 |  |
| lib/save-plan-validation.js | buildInternalOrder | L998-1022 | 按任务依赖在组内做拓扑排序，成环导致排序不完整时回退为编号升序输出以保持稳定顺序。 |  |
| lib/save-plan-validation.js | summarizeFileRecord | L1024-1045 | 把文件记录压成摘要：操作、修改点、锚点、动作与生成验收字段，缺项统一用空串占位。 |  |
| lib/save-plan-validation.js | buildSummary | L1047-1169 | 汇总方案与验收为交付摘要：任务、执行组、检查、覆盖关系与文件计数，供保存结果回显。 |  |
| lib/save-plan-validation.js | formatDiagnostic | L1171-1177 | 把单条诊断格式化为含文档名、任务号、字段值、原因与最小修复模板的一行可读文本，超长值截断。 |  |
| lib/save-plan-validation.js | finalizeFailure | L1179-1185 | 把诊断整理成失败结果，只保留前 20 条并统计省略条数，同时给出含总数与省略提示的错误文本。 |  |
| lib/save-plan-validation.js | validateSavePlanContract | L1187-1220 | 对外校验入口，兼容单参数调用形态，解析方案与验收后串行执行全部结构与跨文档校验。 |  |
| lib/save-probe-validation.js | contextOf | L8-12 | 优先用传入的路径上下文，否则以当前目录建工作区上下文；两者都缺时返回 null 不抛错。 |  |
| lib/save-probe-validation.js | resolveAbsoluteProbeTarget | L14-39 | 绝对探查路径先试工作区根，再试宿主根与已注册能力，全部失败才抛错，不试探其它根。 |  |
| lib/save-probe-validation.js | resolveProbeTarget | L41-47 | 解析探查目标：缺上下文或非字符串即抛错，相对路径按工作区解析，绝对路径走多根匹配。 |  |
| lib/save-probe-validation.js | pathViolation | L49-63 | 把探查路径解析与读校验的失败归为未授权、不存在或不可读三类文本，成功返回 null。 |  |
| lib/save-probe-validation.js | validateProbe | L65-166 | 先校验四字段结构、条目、长度、总量与 range，再校验各路径可读；超限一律拒绝、不静默截断。 |  |
| lib/save-probe-validation.js | probePathOf | L169-173 | 兼容旧调用：无上下文只做词法拼接返回路径，有上下文则走受控解析并校验授权与归属。 |  |
| lib/save-tool-factories.js | probeRefDecorationHint | L16-18 | 证据引用疑似含 Markdown 装饰时的附加提示，裸路径引用返回空串不阻断校验 |  |
| lib/save-tool-factories.js | cwdOf | L21-25 | 只读会话头部的 cwd 字符串，缺失或非字符串一律返回空串，不计算目录、短名与工件基准 |  |
| lib/save-tool-factories.js | pathContextOf | L27-33 | 优先使用外部注入的路径上下文工厂，未提供或返回空时按会话 cwd 新建工作区上下文 |  |
| lib/save-tool-factories.js | resolveSaveContext | L36-48 | 为两个保存工具统一构造会话标识、产出目录与工件基准名，任一步失败只影响本次调用不重试 |  |
| lib/save-tool-factories.js | sourceCacheKey | L52-55 | 源文件缓存键归一：反斜杠转正斜杠，Windows 下再转小写，避免同一文件大小写重复读取 |  |
| lib/save-tool-factories.js | resolveMissingWorkspaceIdentity | L57-72 | 目标缺失时逐级上溯已存在的父目录，拼出规范化的身份路径供存在性判定，不创建任何文件 |  |
| lib/save-tool-factories.js | resolveWorkspaceEntry | L74-98 | 解析并缓存工作区文件条目，目标缺失时仍返回存在标记为假的身份条目，由调用方决定是否抛错 |  |
| lib/save-tool-factories.js | strictTextEntry | L100-112 | 把缓存字节严格解码为文本：拒非法 UTF-8 与 NUL，去 BOM 并归一换行后切行 |  |
| lib/save-tool-factories.js | literalCount | L114-123 | 统计单行内锚点原文出现次数，匹配后按针长度推进游标，空串按长度一下限推进以防死循环 |  |
| lib/save-tool-factories.js | verifyModificationPoint | L125-142 | 校验修改点行号区间与定位锚点：锚点须在区间内恰好命中一次，越界或多次命中均抛出错误 |  |
| lib/save-tool-factories.js | verifyPlanSources | L145-179 | 逐个文件记录校验存在性与操作合法性，并拦下多个记录指向同一真实目标，返回共享读缓存 |  |
| lib/save-tool-factories.js | verifyFile | L148-175 | 单文件记录校验分支：新建要求目标不存在，修改则严格解码文本并逐点校验锚点，删除只查存在 |  |
| lib/save-tool-factories.js | verifyProbeEvidenceRef | L181-202 | 校验探查证据引用真实可读且自带证据报告标题，缺失或非探查者落盘时抛出带装饰提示的错误 |  |
| lib/save-tool-factories.js | unexploredMarkerOf | L208-212 | 方括号包裹的未探查/待确认标记判定：非字符串返回 null，命中返回匹配文本；save_plan 与 edit_plan_draft 共用同一判定与同一时机（合同校验之前），否则草稿工具会旁路未探查拒绝 |  |
| lib/save-tool-factories.js | createSaveToolFactories | L215-459 | 按显式目录与持久化依赖构造两个保存工具定义，不持有宿主会话状态，失败只抛错不落盘 |  |
| lib/save-tool-factories.js | replaceFiles | L218-221 | 草稿写盘的依赖选择：有 atomicReplace 走其覆盖语义，缺省回落 atomicCommit；两者签名不同，按各自形状调用 |  |
| lib/save-tool-factories.js | dumpDrafts | L226-243 | 失败草稿落盘：仅在上下文可用时写 <context.dir>/draft 下 方案-/验收- 两份 .md_mid 供 edit_plan_draft 就地修复，否则只降级为一句提示；写失败也只降级说明，绝不掩盖调用方原本的报错 |  |
| lib/save-tool-factories.js | relativeOf | L238 | 草稿提示用的展示路径：把 <savePlanDir>/draft/<name> 拼成反斜杠转正斜杠的串，只出现在提示文案里，不参与白名单或落盘判定 |  |
| lib/save-tool-factories.js | defineSavePlan | L245-342 | 组装保存方案工具定义：参数合同、路径数组输出渲染与严格落盘执行体，成功只回传文件路径 |  |
| lib/save-tool-factories.js | render | L266-268 | 方案工具结果渲染：把落盘路径数组交给方案渲染器输出可读文本，不改动结果值与调用参数 |  |
| lib/save-tool-factories.js | execute | L271-340 | 方案工具执行体：校验参数与合同、核实源文件与证据后原子双写，成功只回传两个落盘路径 |  |
| lib/save-tool-factories.js | failWithDraft | L296-298 | save_plan 的失败出口包装：先落失败草稿，再把草稿提示后缀追加到原报错文本末尾后抛出，绝不替换原报错 |  |
| lib/save-tool-factories.js | defineSaveProbe | L344-456 | 组装保存探查工具定义：线索与证据数组参数、路径输出渲染与落盘执行体，不执行用户命令 |  |
| lib/save-tool-factories.js | render | L432-434 | 探查工具结果渲染：按是否带证据选择证据报告或线索形态，只影响正文不影响文件名前缀 |  |
| lib/save-tool-factories.js | execute | L437-454 | 探查工具执行体：先校验参数与路径再落盘线索文件，避免非法调用消耗工件基准序号与目录 |  |
| lib/sdk-text-cache.js | isWeakKey | L7-9 | 判定值能否作为 WeakMap 键：非空对象或函数为真，原始值与 null 一律为假。 |  |
| lib/sdk-text-cache.js | numberTag | L11-17 | 为数值生成稳定标签，区分 NaN、正负无穷与负零，避免指纹把不同数值混成同一份。 |  |
| lib/sdk-text-cache.js | isArrayIndexKey | L19-23 | 判定字符串是否为合法数组下标键：非负整数、小于 4294967295 且字符串形式与原值一致。 |  |
| lib/sdk-text-cache.js | encode | L27-89 | 把渲染输入编码成保序签名片段；遇 getter、symbol、循环引用或非普通对象一律放弃签名。 |  |
| lib/sdk-text-cache.js | sdkSchemasFingerprint | L91-99 | 对 schema 生成保守指纹字符串，编码失败或抛错时返回 undefined，调用方据此走无缓存路径。 |  |
| lib/sdk-text-cache.js | sdkTextCacheEntryMatches | L101-107 | 判断缓存条目是否命中：指纹、language 与 renderer 三者全等才算命中，条目缺失即未命中。 |  |
| lib/sdk-text-cache.js | renderUncached | L109-119 | 渲染但不写缓存：渲染函数不是函数或返回非字符串时抛类型错误，供无法缓存时直接回退。 |  |
| lib/sdk-text-cache.js | createSdkTextCache | L121-161 | 创建 apply 级按 agent 分键的内存缓存，只暴露读取与释放方法，不持有会话标识或装配对象。 |  |
| lib/sdk-text-cache.js | dispose | L124-126 | 释放指定 agent 的缓存条目：仅在键可入 WeakMap 时删除，非法键静默忽略不报错。 |  |
| lib/sdk-text-cache.js | getOrCreate | L128-158 | 同指纹、同语言、同渲染函数的条目返回缓存 Promise，否则合并并发渲染，失败即删除条目不回写。 |  |
| lib/settings-contract.js | isString | L5 | 设置标量校验：仅原始字符串判真，其余类型含 String 包装对象一律返回 false。 |  |
| lib/settings-contract.js | isPositiveInteger | L6 | 设置标量校验：仅大于零的整数判真，小数、NaN、字符串与布尔值一律判否，不抛错。 |  |
| lib/settings-contract.js | isBoolean | L7 | 设置标量校验：仅布尔原始值判真，字符串 true 与 0/1 之类的近似值一律判否。 |  |
| lib/settings-contract.js | isMode | L10 | 呈现模式校验：仅 native 与 ptc 两个冻结选项判真，其余字符串含大小写变体一律判否。 |  |
| lib/settings-contract.js | setting | L38-62 | 冻结单条设置 descriptor：补齐 type 并复制各定位器，别名与 UI 选项一并深冻结。 |  |
| lib/settings-contract.js | settingsRowLocator | L68-72 | 权威值落点定位：settings 行 id 加规范行名双条件，缺省路径为 config 下的键名。 |  |
| lib/settings-contract.js | sourceLocator | L73 | 当前模板源定位器：extra-plan 行 config 下按键取值，供默认生成与模板校验使用，不读取历史行值。 |  |
| lib/settings-contract.js | createDefaultSettings | L153-155 | 按 descriptor 键集合从生成常量取默认值，键序与定义表一致，不读运行期配置。 |  |
| lib/settings-contract.js | getSettingDefinition | L169-171 | 按键查设置 descriptor，未注册的键返回 undefined，不做默认值兜底。 |  |
| lib/settings-contract.js | validateSettingValue | L173-175 | 用 descriptor 校验器判定设置入参，descriptor 缺失或校验器非函数时返回 false，不抛错。 |  |
| lib/settings-contract.js | normalizeSettingValue | L177-179 | 有 normalize 就调用它归一，否则原值返回，不做类型转换、校验与默认值兜底。 |  |
| lib/settings-contract.js | checkManagedValues | L182-190 | 逐项 hasOwn + validate + normalize 的 11 项内核：成功返回 { ok, values }，缺键/非法返回 { ok:false, key, reason }；不处理 gateWords、不抛错，由三处消费者各自映射失败通道（undefined / throw）。 |  |
| lib/settings.js | safeContextGet | L19-21 | 安全读取上下文服务，取值抛错或 ctx 未提供 get 方法时返回 undefined，不向外抛异常。 |  |
| lib/settings.js | absoluteRoot | L23-30 | 把配置里的根目录规范成绝对根路径，非字符串或空值返回 null，创建上下文失败也返回 null。 |  |
| lib/settings.js | rootFact | L32-36 | 把根目录值归类为缺失、非法或有效三种事实，未标记为存在时直接判缺失而不再看原值。 |  |
| lib/settings.js | sameRoot | L38-43 | 比较两个绝对根是否指向同一目录，任一为空返回 false，Windows 下按小写路径忽略大小写。 |  |
| lib/settings.js | documentFact | L45-49 | 把配置文档路径归类为缺失、非法或有效三种事实，空值与未标记存在一律按缺失处理，不做路径解析。 |  |
| lib/settings.js | configEditorServiceOf | L51-54 | 取配置编辑器服务并核验具备 configuration 与 edit 方法，形状不符时返回 null 由调用方降级。 |  |
| lib/settings.js | settingsPathContext | L56-108 | 汇总 profile 根、配置文档与 DSH_HOME 事实构造路径上下文，无可信根或创建失败时返回 null。 |  |
| lib/settings.js | has | L58 | 判断 profile 对象是否自有指定键，profile 缺失或键来自原型链时一律返回 false。 |  |
| lib/settings.js | mountClientCarrier | L115-145 | 按 loader 共享挂载客户端载体并按引用计数复用，返回释放函数且重复释放只生效一次。 |  |
| lib/settings.js | schemaField | L148-154 | 把设置描述符转成 schemastery 字段，区分布尔、整数与字符串三类并带上默认值与 volatile。 |  |
| lib/settings.js | diagnosticPruneRootOf | L161-169 | 从上下文取 root 或把上下文自身作为 root，仅接受对象/函数；缺失、非法或取值异常返回 null。 |  |
| lib/settings.js | diagnosticPruneStateOf | L171-189 | 在 root 的 Symbol.for 私有槽位惰性创建/复用诊断清理 Map；已有非 Map 或定义失败返回 null，不向 apply 抛错。 |  |
| lib/settings.js | diagnosticPruneKey | L191-194 | 将 hostDataRoot 规范化为 root 去重键，Windows 转小写，供同一 root 的 settings owner 共享一次清理调度。 |  |
| lib/settings.js | startupPruneDiagnosticLogsForApply | L196-282 | settings 唯一诊断清理 owner：按 root/hostDataRoot 注册单层 effect，owner 共享一次异步裁剪；未配置 host root、effect、状态或 root 无效只告警跳过，定时/裁剪失败不阻断启动，卸载前后按状态复用或取消。 |  |
| lib/settings.js | run | L232-247 | 诊断清理的定时执行闭包：仅在同 root 仍有存活 owner 时把状态置为 running 并复用 promise，完成后记录 done；无存活 owner 或记录已替换则直接返回。 |  |
| lib/settings.js | startupArchiveForApply | L284-351 | 独立的启动用量归档入口：按 appReady 时序调度后台账本 Worker，缺少宿主根或 effect、取消与归档异常只告警并不阻断插件启动；不负责诊断日志裁剪。 |  |
| lib/settings.js | startBackground | L296-318 | 创建账本后台句柄并返回可取消的 dispose，异常只告警不阻断启动。 |  |
| lib/settings.js | dispose | L300-307 | root effect disposer：请求后台账本任务协作取消并等待 done，卸载不强杀或提前释放活 Worker。 |  |
| lib/settings.js | apply | L353-359 | 设置插件入口：先注册诊断日志清理唯一 owner，再启动独立用量归档，随后挂载客户端载体、设置接口与预设同步并注入生命周期。 |  |
| lib/shell-mutation.js | commandTextOf | L39-51 | 从执行参数里取命令文本：兼容 JSON 字符串与对象两种形态，缺失或非法返回空串 |  |
| lib/shell-mutation.js | pwshCommandOf | L53 | PowerShell 侧的命令取文本入口，直接复用通用取文本逻辑，不额外解析也不做参数校验 |  |
| lib/shell-mutation.js | bashCommandOf | L54 | bash 侧的命令取文本入口，与 PowerShell 侧共用同一取文本实现不另设规则 |  |
| lib/shell-mutation.js | shellWords | L59-87 | 把单段命令切成词元，记录是否被引号包裹并处理反引号转义，供命令位状态机判定裸写动词 |  |
| lib/shell-mutation.js | pwshCommandSegmentsText | L93-125 | 为 PowerShell 扫描排除注释并合并显式续行 |  |
| lib/shell-mutation.js | hasPwshDownloadOutput | L127-142 | 检查当前 PowerShell 下载命令的顶层 `OutFile` 参数 |  |
| lib/shell-mutation.js | splitShellSegments | L144-170 | 按分号、换行与与或管道把命令切段，引号内分隔符不切段，仅做切分不改变每段的原词序 |  |
| lib/shell-mutation.js | shellParenEnd | L172-191 | 自左圆括号配平到配对右括号，跳过引号与转义，未闭合时返回文本末尾交由调用方自行兜底 |  |
| lib/shell-mutation.js | executableShellSubexpressions | L193-218 | 提取可执行的美元括号与数组子表达式内层文本，双引号内与反引号转义按可执行内容处理 |  |
| lib/shell-mutation.js | shellSyntaxText | L220-235 | 生成只留语法符号的镜像文本，引号内容与转义一律抹为空格，供语法级写形态正则做匹配 |  |
| lib/shell-mutation.js | isInnerShellWord | L239-242 | 判断词元是否为内层 shell 命令名，含 cmd.exe 路径形态，比较前统一转小写 |  |
| lib/shell-mutation.js | isEnvAssignment | L243-245 | 判断词元是否为环境变量赋值前缀，形如标识符紧跟等号的裸赋值开头，参数位不参与判定 |  |
| lib/shell-mutation.js | redirectEvidence | L253-270 | 裸写重定向判定：引号内、箭头左邻与右侧流合并豁免，其余判 PWSH_MUTATION。 |  |
| lib/shell-mutation.js | syntaxRuleOf | L277-281 | 把语法级写形态正则映射回规则标识，非已知正则返回空而不臆造规则名，供拒绝文案取用 |  |
| lib/shell-mutation.js | bareRuleOf | L283-287 | 把裸写动词正则映射回规则标识，未知正则返回空值，以免产出无主证据与错误的拒绝文案 |  |
| lib/shell-mutation.js | mutationTextEvidence | L289-474 | 命令位状态机：切段后逐词判定裸写动词，递归子表达式与内层 shell，只产出命中证据 |  |
| lib/shell-mutation.js | nestedEvidenceOf | L301-313 | 对子表达式内层依次跑当前平台、PowerShell 与 bash 三套规则，返回首个命中证据 |  |
| lib/shell-mutation.js | mutationEvidence | L476-479 | 按传入的取文本函数取命令后再判定，空命令直接返回空值，不进入命令位状态机也不报错 |  |
| lib/shell-mutation.js | pwshMutationEvidence | L481 | PowerShell 入参的写判定，命中产出规则与词元组成的拒绝证据，本身不执行任何命令 |  |
| lib/shell-mutation.js | bashMutationEvidence | L482 | bash 入参的写判定，命中产出拒绝证据对象，仅用于拦截与留证而不落实任何执行动作 |  |
| lib/shell-mutation.js | pwshMutationMatches | L483 | PowerShell 侧的布尔写判定包装，等价于证据非空判定，不给调用方额外产出拒绝文案 |  |
| lib/shell-mutation.js | bashMutationMatches | L484 | bash 侧的布尔写判定包装，供只关心是否拦截的调用方使用，不改变底层证据判定语义 |  |
| lib/usage-ledger-background.js | isObject | L11-13 | 判定 owner/pathContext 是否可作为对象键，函数也视为对象。 |  |
| lib/usage-ledger-background.js | errorDetails | L15-19 | 将 Worker/controller 异常收敛为 code/message 诊断对象。 |  |
| lib/usage-ledger-background.js | normalizedRootOf | L21-26 | 规范化 hostDataRoot 为跨 owner 串行键，Windows 转小写；缺失归空根键。 |  |
| lib/usage-ledger-background.js | capabilitySnapshot | L28-44 | 仅复制带 name/path/type/access/purpose 的原有能力描述，形成传给 Worker 的小型快照。 |  |
| lib/usage-ledger-background.js | pathContextSnapshot | L46-53 | 从可信 pathContext 提取 workspaceRoot/hostDataRoot/hostCapabilities 快照，不传 ctx、函数或宿主对象。 |  |
| lib/usage-ledger-background.js | normalizedResult | L55-65 | 把 Worker 终态限制为小型结构化结果，成功态去掉 error，其他状态收敛为 failed。 |  |
| lib/usage-ledger-background.js | protocolFailure | L67-69 | 构造协议或退出类 failed 结果。 |  |
| lib/usage-ledger-background.js | createWorkerHandle | L71-177 | 按固定包内 URL 创建 Worker，校验 ready/running/result 协议，监听 error/messageerror/exit，并让 done 在 exit 后结算。 |  |
| lib/usage-ledger-background.js | send | L83-86 | 向未终态 Worker 发送协议消息，发送异常登记为失败。 |  |
| lib/usage-ledger-background.js | markProtocolFailure | L87-91 | 标记协议错误、置共享取消位并请求 Worker 结束。 |  |
| lib/usage-ledger-background.js | settleAfterExit | L92-107 | 仅在 Worker exit 后按错误、退出码或终态结算 done，覆盖无结果退出。 |  |
| lib/usage-ledger-background.js | startUsageLedgerBackground | L179-214 | 按 owner WeakMap 单飞、按 hostDataRoot 尾链串行调度 Worker，返回 done/cancel；等待期取消不创建 Worker。 |  |
| lib/usage-ledger-background.js | cancel | L200-205 | 幂等设置共享取消位并向已启动 Worker 发送 cancel，不 terminate 或 unref 活任务。 |  |
| lib/usage-ledger-worker.js | errorDetails | L13-17 | 将 Worker 异常收敛为可传输的 code/message 诊断对象。 |  |
| lib/usage-ledger-worker.js | resultOf | L19-31 | 将 startupArchive 结果投影为可传输的标量终态，禁止发送会话正文或账本内容。 |  |
| lib/usage-ledger-worker.js | post | L33-36 | 向主线程发送带 version/id 的 ready/running/result 协议消息。 |  |
| lib/usage-ledger-worker.js | close | L38-40 | 关闭 parentPort，使 Worker 在终态退出。 |  |
| lib/usage-ledger-worker.js | finish | L42-47 | 只结算一次结果，发送 result 后关闭 parentPort。 |  |
| lib/usage-ledger-worker.js | cancellationRequested | L49-51 | 读取共享 Int32 取消位，供 startupArchive 的 shouldCancel 检查。 |  |
| lib/usage-ledger-worker.js | capabilitySnapshot | L53-68 | 从 workerData 快照恢复原有 capability 描述，拒绝越权字段。 |  |
| lib/usage-ledger-worker.js | validateAndRebuild | L70-82 | 校验 workerData 的 version/id/cancelBuffer/pathContext，并用 createPathContext 重建授权上下文。 |  |
| lib/usage-ledger.js | isSchemaDocRow | L102-104 | 说明行判定：kind=「账本说明」且说明/键均为字符串，三字段全形才算，避免把垃圾行当说明行吞掉。 |  |
| lib/usage-ledger.js | archiveError | L115-119 | 构造带 code 字段的 Error（new Error(message) 后挂 code），归档/统计失败统一经它抛错 |  |
| lib/usage-ledger.js | checkArchiveCancellation | L121-125 | 在扫描、解析、合并和发布前检查 shouldCancel，统一抛出 archive-cancelled。 |  |
| lib/usage-ledger.js | isPlainObject | L127-129 | 判入参是非 null 对象且非数组 |  |
| lib/usage-ledger.js | bytesOf | L131-135 | 入参归一为 Buffer：Buffer 复制、Uint8Array 转换、其余按 UTF-8 编码字符串（null/undefined 当空串） |  |
| lib/usage-ledger.js | textOfBytes | L137-139 | 先经 bytesOf 归一，再按 UTF-8 解码为字符串 |  |
| lib/usage-ledger.js | isSessionDirectoryName | L142-146 | 判目录名去掉 session- 前缀后是否匹配 UUID 模式，用于筛出会话目录 |  |
| lib/usage-ledger.js | listEntries | L148-154 | readdirSync withFileTypes 列举目录项，异常一律返回空数组 |  |
| lib/usage-ledger.js | enumerateSessionLogs | L157-200 | 枚举 %DSH_HOME%/sessions 下的 v4 会话日志（会话目录名只认 session-<uuid> 与裸 <uuid>，其余跳过）。 |  |
| lib/usage-ledger.js | frameEndAt | L204-232 | zstd 帧切分：从帧起点解析 descriptor、字典与内容长度、逐个 block header，返回帧结束偏移；非法块类型或截断返回 null |  |
| lib/usage-ledger.js | decodedLinesOf | L239-291 | 生成器函数：按帧边界循环 zstdDecompressSync 解压，跳过 skippable frame，流式 UTF-8 解码并按换行切行；魔数非法或帧截断抛错 |  |
| lib/usage-ledger.js | finiteNumberOrZero | L294-296 | 非负有限数原样返回，其余归零 |  |
| lib/usage-ledger.js | stringOrEmpty | L298-300 | 字符串原样返回，其余归空串 |  |
| lib/usage-ledger.js | intOrNull | L302-304 | 非负整数原样返回，其余返回 null |  |
| lib/usage-ledger.js | isoOf | L306-309 | 毫秒时间戳转 ISO 字符串，非法值用 Date.now() 兜底 |  |
| lib/usage-ledger.js | sessionMetaOf | L312-327 | 从 session 事件取会话元信息（id 缺失用目录名，含 cwd/agentPreset/parentSession/delegationDepth/origin），delegationDepth 缺失记 0 且 hasExplicitDepth=false |  |
| lib/usage-ledger.js | usageOf | L330-348 | 从 assistant/message 事件取 usage 四桶，缺失/非法字段归零，非目标事件返回空。 |  |
| lib/usage-ledger.js | presetOfSelectedEvent | L351-358 | 依次在事件顶层与 data 的 agentPreset/preset/id 里取首个非空字符串，取不到返回空串 |  |
| lib/usage-ledger.js | lineageOfRequestHeader | L361-369 | 从 request/header 的 parentSession 与 delegationDepth 取血缘兜底值，两者都缺返回 null |  |
| lib/usage-ledger.js | scanLogText | L372-417 | 对单个会话日志文本做前缀粗筛后逐行解析，累加 usage 到身份分组。 |  |
| lib/usage-ledger.js | hasOwn | L420-422 | Object.prototype.hasOwnProperty 的调用封装 |  |
| lib/usage-ledger.js | identityValueOf | L424-428 | 身份键归一：delegationDepth 只收非负整数、schemaVersion 原样、其余只收字符串 |  |
| lib/usage-ledger.js | identityKeyOf | L430-434 | 按 IDENTITY_KEYS 顺序取归一值，JSON.stringify 成九字段身份键 |  |
| lib/usage-ledger.js | rootSessionOf | L438-454 | 沿 parentById 链上溯求血缘根：depth 1 直接取 parent，更深逐级上溯，链路缺失或成环返回空串 |  |
| lib/usage-ledger.js | isChildSession | L456-458 | delegationDepth>0 或 parentSessionId 非空或 origin=subagent 即判为子会话 |  |
| lib/usage-ledger.js | roleOf | L461-464 | 非子会话固定 main；子会话按 USAGE_ROLE_BY_PRESET 映射四角色，未命中记 child |  |
| lib/usage-ledger.js | emptyGroup | L466-485 | 按身份建零值聚合组：四桶与 calls 归零、seq 为 null、ts 空串 |  |
| lib/usage-ledger.js | compareValues | L487-491 | 两值转字符串后比较（null/undefined 视作空串），返回 -1/0/1 |  |
| lib/usage-ledger.js | rowSort | L493-499 | 行排序比较器：先按 IDENTITY_KEYS 逐键比较，再按 seq（null 视空）比较 |  |
| lib/usage-ledger.js | addUsageToGroups | L501-522 | 按身份键累加进 groups：四桶与 calls 累加，seq/ts 只在本次 seq 不小于既有水位时更新 |  |
| lib/usage-ledger.js | allowedOf | L524-528 | 白名单归一：未传用 ALLOWED_PRESETS，Set 转数组，数组原样，其余回落 ALLOWED_PRESETS |  |
| lib/usage-ledger.js | scanUsageRowsOf | L530-617 | 按白名单解码日志、校验读取指纹、解析 usage 并按九字段聚合；可追踪整批失败以阻止水位推进。 |  |
| lib/usage-ledger.js | markFailed | L537-541 | 把单个日志失败原因登记到 scanOutcome，供整批失败重试判定。 |  |
| lib/usage-ledger.js | fingerprintStable | L542-559 | 读后重新 stat 比对 size/mtime，文件缺失或变化即登记失败。 |  |
| lib/usage-ledger.js | scanUsageRows | L620-631 | 公开同步全量扫描：枚举并 stat 会话日志后调用 scanUsageRowsOf，返回扫描 rows/stats（按选项可附 scanOutcome），不在此执行归档单调性保护。 |  |
| lib/usage-ledger.js | firstFrameSessionOf | L633-673 | 从会话日志首帧解析 session 元数据；保留接收 Buffer 的签名，扫描路径改由 `firstFrameSessionByPath` 按 512、8192、65536、整份递进窗口取首帧。 |  |
| lib/usage-ledger.js | emptyIdentityOf | L679-681 | 首帧结构非法或读取失败时返回空身份（preset 为空）供调用方跳过。 |  |
| lib/usage-ledger.js | firstFrameRangeWithin | L684-696 | 裁定单窗口内首帧边界，区分需扩窗、结构非法与已含完整首帧。 |  |
| lib/usage-ledger.js | readWindowOf | L698-702 | 从文件偏移 0 读取指定长度窗口，返回实际读到的前缀字节。 |  |
| lib/usage-ledger.js | firstFrameSessionByPath | L704-727 | 按 512、8192、65536、整份递进窗口读首帧身份，失败降级为空身份。 |  |
| lib/usage-ledger.js | scanSessionPresets | L730-742 | 只对 changed 文件按 512、8192、65536、整份递进窗口读首帧，未变化文件零字节读取、size 与 mtime 复用枚举结果，在本轮内存收集身份/预设/父链供白名单与血缘使用，白名单由 `startupArchiveUnsafe` 过滤，不读写持久缓存。 |  |
| lib/usage-ledger.js | mergedFsOps | L745-747 | 把注入的 fs 与默认实现合并，供夹具替换单点文件操作。 |  |
| lib/usage-ledger.js | nowOf | L749-759 | 取当前毫秒时间：clock 可传函数或带 now() 的对象，非法值回落 Date.now() |  |
| lib/usage-ledger.js | hostRootOf | L761-767 | 从 pathContext 取 host 数据根；空根即跳过本次启动扫描。 |  |
| lib/usage-ledger.js | tokenNumber | L768-770 | 读组内 token 字段的非负有限数，非法归零 |  |
| lib/usage-ledger.js | identityValue | L772-776 | 账本行身份键取值：delegationDepth 只收非负整数、schemaVersion 原样、其余只收字符串 |  |
| lib/usage-ledger.js | groupSort | L778-784 | 合并组排序比较器：先按 IDENTITY_KEYS 逐键比较，再按 maxSeq（null 视空）比较 |  |
| lib/usage-ledger.js | validDedupeKey | L786-792 | 判行能否提供去重水位：是对象且 sessionId 非空、seq 为非负整数 |  |
| lib/usage-ledger.js | validationIssue | L794-813 | 单行 15 键与身份字段合法性检查，返回问题文本供严格解析组错误码。 |  |
| lib/usage-ledger.js | parseStrictLedgerText | L816-850 | 严格解析既有 archive：坏 JSON、说明行位置、non-v2 与 15 键合法性逐行校验，不合法即拒绝发布。 |  |
| lib/usage-ledger.js | identityOf | L852-856 | 按 IDENTITY_KEYS 从行抽出九字段身份对象 |  |
| lib/usage-ledger.js | identityKeyOfRow | L858-861 | 把行身份的九字段序列化成 JSON 键，作为合并分组键 |  |
| lib/usage-ledger.js | emptyGroupOf | L863-874 | 按九字段身份建立聚合组：四桶归零、maxSeq 为 null、latestTs 为空串。 |  |
| lib/usage-ledger.js | groupFromArchiveRow | L876-885 | 账本行转合并组：四桶取行内值，seq 有效时记 maxSeq 并落到 latestTs |  |
| lib/usage-ledger.js | groupFromScanRow | L888-898 | 扫描行转合并组：四桶与 calls 取扫描行值，seq 有效时保存水位并复制扫描行 ts；日志扫描行的 ts 为成功解析文件的 ISO 毫秒 mtime。 |  |
| lib/usage-ledger.js | tokenTotalOf | L900-904 | 合并组四桶求和，用于单调性比较 |  |
| lib/usage-ledger.js | mergedArchiveGroups | L909-952 | archive 现有行与本次扫描行按身份合并：覆盖式更新 + 单调性保护（小于现状保留旧值并记告警）。 |  |
| lib/usage-ledger.js | finalizedGroups | L954-956 | 合并组按 groupSort 排序，供归档序列化读取。 |  |
| lib/usage-ledger.js | assertUniqueArchiveRows | L958-966 | 同一完整身份出现多条累计行即报 duplicate-archive，发布前拒绝。 |  |
| lib/usage-ledger.js | archiveRowOf | L968-986 | 把聚合身份投影为固定 15 键数据行（`ts` 取成功解析 session 文件的 ISO 毫秒 mtime、`seq` 取会话内事件序号且不作主键）。 |  |
| lib/usage-ledger.js | archiveTextOf | L988-997 | 说明行（首行唯一）+ 数据行的序列化，归档文本唯一来源。 |  |
| lib/usage-ledger.js | ensureLedgerDirectory | L999-1006 | 上下文缺失直接返回；否则先授权再递归建账本目录，随后按目录类型回读校验，失败即抛错。 |  |
| lib/usage-ledger.js | authorizeWriteTarget | L1008-1010 | 写目标 H/W 双根授权（prepareWriteTarget，含用途与期望类型）。 |  |
| lib/usage-ledger.js | authorizeReadIfPresent | L1012-1018 | 读目标存在时做只读授权复核，缺失不报错。 |  |
| lib/usage-ledger.js | optionalRead | L1020-1028 | 容错读：ENOENT 视为不存在，其它错误转 read-failed。 |  |
| lib/usage-ledger.js | recordDiagnostic | L1030-1042 | 仅在原调用需要留痕时向 Host `logs/dsh-extra-plan/extra-plan-usage-errors.jsonl` 按需追加一行 JSONL；字段恰为字符串 `ts`、`reason`、`message`，`ts` 为诊断发生时间；写失败静默忽略，不阻断启动。 |  |
| lib/usage-ledger.js | reportFailure | L1044-1054 | 失败统一出口：warn + 写诊断行 + 返回 { status:'failed', reason, error }。 |  |
| lib/usage-ledger.js | publishArchive | L1058-1075 | 单目标原子发布：写同目录临时文件 → 预算检查 → rename 覆盖 archive；失败清理临时文件、既有账本原样保留。 |  |
| lib/usage-ledger.js | acquireArchiveLock | L1080-1097 | 一次 O_EXCL 创建 <archive>.lock 的简易互斥；拿不到即返回未获取，不等待、不接管死锁、不删他人锁。 |  |
| lib/usage-ledger.js | releaseArchiveLock | L1100-1102 | 仅 unlink 本次 O_EXCL 创建的锁文件，失败只在 try/finally 内忽略，不抛给启动路径。 |  |
| lib/usage-ledger.js | archiveLedger | L1110-1187 | 直调入口：给定 archive 路径的「聚合 + 覆盖式更新 + 原子发布」，不承担进程互斥。 |  |
| lib/usage-ledger.js | checkBudget | L1131-1139 | 预算与 onCheck 阶段探针：超时抛 budget-timeout，阶段名供 step-00 M6 断言。 |  |
| lib/usage-ledger.js | skipWithDiagnostic | L1190-1198 | 可预期跳过（无 host 根/锁忙/扫描失败）时返回 skipped，并仅在原 `recordDiagnostic` 需要留痕时按需写 usage 错误 JSONL；取消不记失败。 |  |
| lib/usage-ledger.js | upToDateArchiveResult | L1203-1217 | 构造日志 mtime 与账本 ts 无变化的健康终态，报告 archive 现有行/字节并标记零完整用量扫描。 |  |
| lib/usage-ledger.js | startupArchiveUnsafe | L1219-1358 | 启动路径主体：host 根判定 → 路径解析与双根授权 → 枚举会话日志只做 statSync → 读旧账本建 sessionId 到 ts 索引并判 changed（目录名命中即跳过，查不到才用首帧 sessionId 兜底）→ 只对 changed 读首帧判白名单 → 命中才解析用量 → 简易锁 → 调 archiveLedger；失败转结构化结果，取消按 archive rename 提交边界处理。 |  |
| lib/usage-ledger.js | identityOf | L1272-1277 | 按日志路径缓存首帧身份，同一轮扫描不重复读同一文件头。 |  |
| lib/usage-ledger.js | ledgerHasTimestamp | L1278-1281 | 账本中该会话是否已有与文件 mtime 相等的 ts，用于跳过未变化文件。 |  |
| lib/usage-ledger.js | startupArchive | L1362-1378 | 同步启动归档入口：捕获可处理异常并返回结构化状态，正常由 settings Worker 调用；不作无条件绝不阻断保证。 |  |
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
| pe-test/_shared/host-deps.mjs | registerHostDeps | L349-409 | 注册测试所需宿主依赖并校验实际版本 |  |
| pe-test/_shared/host-deps.mjs | resolveScoped | L364-370 | 解析scoped宿主包候选路径 |  |
| pe-test/_shared/host-deps.mjs | resolveBare | L371-377 | 解析非scoped宿主包候选路径 |  |
| pe-test/_shared/host-deps.mjs | resolveOne | L379-391 | 按包名统一尝试scoped与bare解析 |  |
| pe-test/_shared/host-preload.mjs | preloadError | L8-13 | 构造带 host-preload 前缀、错误码与冻结明细的错误对象，供预加载各失败分支统一抛出。 |  |
| pe-test/_shared/host-preload.mjs | isAbsolute | L15-18 | 按当前平台判定绝对路径：win32 兼容盘符与 UNC 前缀，其它平台要求前导斜杠，不做存在性检查。 |  |
| pe-test/_shared/host-preload.mjs | explicitInstallRoot | L20-47 | 测试侧：校验安装根环境变量，拒绝空值、变量、家目录缩写、URI 与盘符相对路径，再取真实目录。 |  |
| pe-test/_shared/plan-text.mjs | renderPlanFile | L3-17 | 测试侧：逐点拼装派遣方案正文（修改点、位置/锚点、生成来源命令产物、动作），只做 lines.push 拼接不改文案。 |  |
| pe-test/_shared/plan-text.mjs | renderChecklistFile | L19-27 | 测试侧：逐点拼装验收清单正文（对应修改点、验收定位、期望），只做 lines.push 拼接不改文案。 |  |
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
| pe-test/_shared/test-output.mjs | normalize | L17-37 | 递归稳定化值并处理循环引用与特殊类型 |  |
| pe-test/_shared/test-output.mjs | stableStringify | L39-43 | 按键排序序列化断言值 |  |
| pe-test/_shared/test-output.mjs | parseOutputMode | L45-64 | 解析compact、verbose、full模式及优先级 |  |
| pe-test/_shared/test-output.mjs | summarizeValue | L66-77 | 将成功大对象压缩为类型、键数和预览摘要 |  |
| pe-test/_shared/test-output.mjs | assertionLine | L79-84 | 按模式渲染断言并始终保留失败差异 |  |
| pe-test/_shared/test-output.mjs | createOutput | L86-116 | 创建统一断言、结构化输出与统计接口 |  |
| pe-test/_shared/test-output.mjs | emit | L90-93 | 将普通行或错误行写入对应通道 |  |
| pe-test/_shared/test-output.mjs | assertion | L94-97 | 输出断言行并返回布尔结果 |  |
| pe-test/_shared/test-output.mjs | structured | L98-103 | 按模式输出完整值或稳定摘要 |  |
| pe-test/_shared/test-output.mjs | detail | L104-106 | 仅在full或强制条件下输出细节 |  |
| pe-test/_shared/test-output.mjs | marker | L107 | 输出SKIP、HUMAN等结构化状态标记 |  |
| pe-test/_shared/test-output.mjs | summary | L108-114 | 输出统一通过失败及扩展状态统计 |  |
| pe-test/_shared/test-output.mjs | workspaceTarget | L120-123 | 测试侧：把输出相对路径按工作区策略解析为受控目标，空串或非字符串直接抛错，不做兜底。 |  |
| pe-test/_shared/test-output.mjs | workspacePathOf | L125-127 | 测试侧：返回工作区受控目标的绝对路径字符串，供证据读取与写盘复用，越界时直接抛错。 |  |
| pe-test/_shared/test-output.mjs | prepareOutputDirectory | L129-137 | 测试侧：准备输出目录，目标缺失时按文件语义重试准备，仅吞目标缺失一类错误，其余抛出。 |  |
| pe-test/_shared/test-output.mjs | prepareOutputFile | L139-142 | 测试侧：在工作区策略下准备输出文件目标，路径越界或非法即抛错，不做静默回退或兜底。 |  |
| pe-test/_shared/test-output.mjs | fileEvidence | L144-154 | 读取文件并计算bytes、lines、SHA-256 |  |
| pe-test/_shared/test-output.mjs | writeRawEvidence | L156-176 | 保存stdout、stderr并返回合并证据统计 |  |
| pe-test/_shared/test-output.mjs | sha256Text | L178-180 | 对文本返回SHA-256用于raw复核 |  |
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
| pe-test/_shared/workspace-paths.mjs | repoRoot | L84-108 | 由模块位置推出维护根并校验 pe-test 目录与根包身份锚点（读根 package.json 的 name 为 dsh-extra-plan，且根 index.js 与 cordis.patch.yml 为文件），结构不符即抛错。 |  |
| pe-test/_shared/workspace-paths.mjs | fixtureLabel | L110-116 | 校验夹具标签：缺省值为 fixture，含路径分隔符、上跳点或空白字符一律抛错。 |  |
| pe-test/_shared/workspace-paths.mjs | getWorkspaceRoot | L118-120 | 返回由结构锚定的工作区根，它同时也是维护根的唯一定义来源，也不读取任何环境变量。 |  |
| pe-test/_shared/workspace-paths.mjs | makeFixtureDir | L122-161 | 在 test-tmp 下创建唯一夹具目录树并返回冻结句柄，目录重名时自动重试，最多五次。 |  |
| pe-test/_shared/workspace-paths.mjs | cleanup | L150-153 | 夹具句柄上的清理闭包，先复验父链再递归删除整个夹具根，绝不触碰夹具以外的任何路径。 |  |
| pe-test/_shared/workspace-paths.mjs | resolveEvidencePath | L163-174 | 把相对证据路径解析到证据根内，根越界或最终路径越界都抛错，相对路径还须过词法审查。 |  |
| pe-test/_shared/workspace-paths.mjs | fixtureRootOf | L176-183 | 校验 fixture 句柄并取出工作区根与夹具根，非对象、缺字段或越界一律抛错。 |  |
| pe-test/_shared/workspace-paths.mjs | createIsolatedEnv | L185-221 | 由夹具句柄构造冻结的隔离环境变量，家目录、临时目录与各类缓存目录都指向夹具内部。 |  |
| pe-test/_shared/workspace-paths.mjs | isRecord | L234-236 | 判断入参是否为非空且非数组的普通对象，只用于选项形状校验，不检查具体的键名与值。 |  |
| pe-test/_shared/workspace-paths.mjs | strictMaintenancePath | L238-242 | 维护类路径串校验：必须是非空字符串且没有首尾空白，通过后再交给严苛的词法审查流程。 |  |
| pe-test/_shared/workspace-paths.mjs | strictAbsoluteMaintenancePath | L244-247 | 在严格路径校验之上再要求显式绝对路径，通过时返回归一化后的绝对结果，不满足即抛错。 |  |
| pe-test/_shared/workspace-paths.mjs | strictMaintenanceSegment | L249-255 | 要求单段名称：拒绝点、路径分隔符与空白字符，专门用于 profile 与会话标识。 |  |
| pe-test/_shared/workspace-paths.mjs | strictSessionScopePath | L257-261 | 会话作用域路径校验，会在严格路径校验之上额外拒绝当前目录与父目录这两类相对写法。 |  |
| pe-test/_shared/workspace-paths.mjs | nextMaintenanceValue | L263-269 | 取选项之后的紧邻下一个参数作为该选项的值，值缺失或误以双横线开头都会抛出缺值错误。 |  |
| pe-test/_shared/workspace-paths.mjs | markMaintenanceOption | L271-274 | 登记已经出现过的选项，同一选项重复出现时立即抛错，防止后者静默覆盖前一次给出的值。 |  |
| pe-test/_shared/workspace-paths.mjs | sameStringArray | L276-278 | 逐项比较两个字符串数组是否等长而且顺序一致，任何一侧不是数组的情形都直接返回假。 |  |
| pe-test/_shared/workspace-paths.mjs | parseMaintenanceArgs | L280-386 | 把维护命令行参数解析为冻结结构，校验会话与账本的互斥组合，其余参数留存为域参数。 |  |
| pe-test/_shared/workspace-paths.mjs | rejectOtherCategory | L388-390 | 拒绝保留类别 Other，只做与大小写无关的字符串比较，不做其它类型或语义校验。 |  |
| pe-test/_shared/workspace-paths.mjs | rejectUnknownKeys | L392-399 | 检查记录中是否存在白名单之外的键，先判定该值是否保留类别，再抛出未知选项的错误。 |  |
| pe-test/_shared/workspace-paths.mjs | contextOptionsOf | L401-422 | 校验维护上下文的选项：禁止覆盖工作区根与宿主数据根，出现任何未知键一律予以拒绝。 |  |
| pe-test/_shared/workspace-paths.mjs | chooseContextValue | L424-429 | 在嵌套值与顶层值之间取值，若两者同时出现而且彼此并不相等，就立即抛出冲突错误而不取其一。 |  |
| pe-test/_shared/workspace-paths.mjs | normalizeSessionOptions | L431-460 | 归一化会话选项并校验互斥与必配的搭配关系，模式与实际字段不一致时立即抛出明确错误。 |  |
| pe-test/_shared/workspace-paths.mjs | normalizeLedgerOptions | L462-483 | 把账本选项归一化为活动路径与模式两项，模式非法或与路径不一致时就会立即抛出错误。 |  |
| pe-test/_shared/workspace-paths.mjs | normalizeRequestTrace | L485-491 | 归一化请求追踪路径，接受字符串或带 path 字段的对象，空值返回 null 而不抛错。 |  |
| pe-test/_shared/workspace-paths.mjs | normalizeDomainArgv | L493-504 | 归一化领域参数数组，argv 与 domainArgv 不一致即抛错，每项都须为字符串，通过后返回冻结副本。 |  |
| pe-test/_shared/workspace-paths.mjs | policyTargetFor | L506-515 | 按目标类别走路径策略解析目标，并把策略异常转成夹具错误码、保留原始原因后再抛出。 |  |
| pe-test/_shared/workspace-paths.mjs | targetView | L517-534 | 把策略目标封装为只读视图，标注可写性与物理证明方式，其中写权限只授予工作区目标。 |  |
| pe-test/_shared/workspace-paths.mjs | targetForInput | L536-555 | 按绝对性与根归属选择工作区或宿主目标，越界、缺宿主根或落在双根之外时都抛出错误。 |  |
| pe-test/_shared/workspace-paths.mjs | createMaintenanceContext | L557-667 | 组装维护上下文：归一全部选项、定位会话与账本目标，最后输出授权矩阵与各用途能力表。 |  |
| pe-test/_shared/zstd-frames.mjs | frameEndAt | L5-33 | 在已验证 magic 的帧起点解析 FCS/字典/checksum 与 raw/RLE/compressed 块，只返回当前帧结束位置；不完整或非法块边界返回 null。 | 私有边界算法由 framesOf 与严格逐帧解码复用，不扫描后续帧。 |
| pe-test/_shared/zstd-frames.mjs | framesOf | L35-46 | 解析完整zstd帧及块边界 |  |
| pe-test/_shared/zstd-frames.mjs | decodeText | L48-50 | 解压单帧并转为UTF-8文本 |  |
| pe-test/_shared/zstd-frames.mjs | decompressedFrameBytes | L56-83 | 逐帧计算一次边界并解压，边界解析次数随帧数线性增长；按长度跳过 skippable 载荷，产出每帧 Buffer，截断/非法 magic/无完整帧抛出不完整错误。 | skippable 载荷内的 zstd magic 不作为真实帧。 |
| pe-test/_shared/zstd-frames.mjs | decodedJsonlLines | L85-105 | 以 fatal UTF-8 TextDecoder 跨帧累积并按物理换行 yield { lineNo, line }，保留 CR/空行/末行无换行；帧截断、非法 UTF-8 和无完整帧由调用方归类 INCOMPLETE。 |  |
| scripts/generate-runtime-defaults.mjs | repositoryRootFromKnownLayout | L18-32 | 从脚本位置向上推导仓库根，package.json、index.js 与 cordis.patch.yml 缺任一或包名不符即返回 null 不抛错。 |  |
| scripts/generate-runtime-defaults.mjs | roleDefinitionFile | L58-60 | 按角色 id 拼出角色 definition 产出文件名，只做路径拼接不校验目录是否存在。 |  |
| scripts/generate-runtime-defaults.mjs | runtimeDefaultsFromTemplate | L62-67 | 按设置合同逐键从模板文本解析默认值并组成键值对象，不校验模板是否缺键，也不校验形状。 |  |
| scripts/generate-runtime-defaults.mjs | renderRuntimeDefaults | L69-79 | 渲染 preset-defaults 产物文本，冻结默认设置并导出探索预算与规划者后缀两个别名。 |  |
| scripts/generate-runtime-defaults.mjs | clientFieldMetadata | L85-98 | 抽取设置项的客户端字段元数据，缺 ui 元数据即抛错，只搬运白名单内的可选键与控件类型。 |  |
| scripts/generate-runtime-defaults.mjs | clientFieldLines | L100-106 | 把一组设置项渲染成冻结数组的源码行，逐项 JSON 序列化后按固定缩进拼接为一行声明。 |  |
| scripts/generate-runtime-defaults.mjs | renderClientFieldBlock | L108-119 | 渲染客户端字段生成块，分组必须恰为 10 项 extra-plan 加 1 项 host-rows 否则抛错。 |  |
| scripts/generate-runtime-defaults.mjs | markerMatches | L121-124 | 找出整行只含指定注释标记的行，标记先做正则元字符转义再逐行匹配，不做任何模糊匹配。 |  |
| scripts/generate-runtime-defaults.mjs | clientFieldMarkerRange | L126-134 | 定位客户端源里两处字段生成标记的区间，标记缺失、重复或逆序均抛错并识别换行风格。 |  |
| scripts/generate-runtime-defaults.mjs | renderClientFields | L136-141 | 用生成的字段块替换客户端源中两标记之间的内容，非字符串入参抛错，保留原文件换行风格。 |  |
| scripts/generate-runtime-defaults.mjs | separatorIndexOf | L146-148 | 返回首个顶格 YAML 文档分隔行的下标，找不到时返回 -1 而不抛错，也不改动入参。 |  |
| scripts/generate-runtime-defaults.mjs | topLevelRowsOf | L151-161 | 抽取模板第一文档的顶层条目区间，缺根级条目即抛错，保留注释与 group 原文。 |  |
| scripts/generate-runtime-defaults.mjs | secondDocumentOf | L164-169 | 抽取模板第二文档分隔行之后的全部原文行，缺分隔行即抛错，不做任何解析、也不做形状校验。 |  |
| scripts/generate-runtime-defaults.mjs | indentBlock | L171-174 | 给整块文本的每一行统一增加缩进量，默认两空格，空行保持为空不加空格，返回新数组。 |  |
| scripts/generate-runtime-defaults.mjs | indentOf | L176-180 | 数出行首连续空格的数量作为缩进量，只认空格字符，制表符与其它空白字符一律不计入。 |  |
| scripts/generate-runtime-defaults.mjs | shiftBlock | L182-190 | 把整块文本按指定缩进量整体平移，返回新数组而不改动原块，平移后缩进为负即抛错终止。 |  |
| scripts/generate-runtime-defaults.mjs | rawBlockFrom | L196-207 | 从起始行起取其下更深缩进的连续行组成整块，遇同级行即结束，尾部空行一律剔除干净。 |  |
| scripts/generate-runtime-defaults.mjs | quoteYamlSingle | L209-211 | 用单引号包裹 YAML 标量并转义内部单引号，不做双引号或其它引号形态的判断与回退。 |  |
| scripts/generate-runtime-defaults.mjs | assertDefinition | L213-229 | 校验主 definition 结构：id、名称、插件恰 17 条且 delegation 组 5 子行，不符即抛错。 |  |
| scripts/generate-runtime-defaults.mjs | renderPresetDefinition | L231-250 | 渲染纯 preset definition 文本并回读自校验，元数据缺名称或描述即抛错。 |  |
| scripts/generate-runtime-defaults.mjs | mainExtraPlanRowBlock | L253-264 | 从主 definition 取出 extra-plan 子行的原文块与 config 块，缺行或缺 config 抛错。 |  |
| scripts/generate-runtime-defaults.mjs | personaPrefixBlock | L267-293 | 在角色源里找解析值逐字相等的 personaPrefix 折叠块，多个候选逐个试，找不到抛错。 |  |
| scripts/generate-runtime-defaults.mjs | roleToolsBlock | L296-307 | 按角色序号取出对应 tools 列表的原文行，tools 行数与角色数不符即抛错。 |  |
| scripts/generate-runtime-defaults.mjs | findRowById | L310-321 | 深度优先递归查行 id，含 group 行的子行数组，未命中返回 null 而不抛错。 |  |
| scripts/generate-runtime-defaults.mjs | mainToolPresentationMode | L328-339 | 由主 definition 的 executor 行判定 native 或 ptc，缺行、多行或解析异常回落合同默认。 |  |
| scripts/generate-runtime-defaults.mjs | assertRoleSource | L341-365 | 校验角色源的行数与顺序、必填字段，手写 gateWords 或 executor 行一律抛错。 |  |
| scripts/generate-runtime-defaults.mjs | assertRoleDefinition | L367-387 | 校验生成的角色 definition：首两行固定，末行恰一行 executor 且不带 config，不符即抛错。 |  |
| scripts/generate-runtime-defaults.mjs | renderRoleDefinitions | L394-439 | 渲染全部角色 definition，逐字复制主预设 extra-plan 行 config 并回读逐条比对。 |  |
| scripts/generate-runtime-defaults.mjs | assertParses | L441-449 | 解析 YAML 并带上对象标签，失败时把原始错误包装成解析失败错误再抛出，不改入参。 |  |
| scripts/generate-runtime-defaults.mjs | checkOutput | L451-455 | 只读比对产物与渲染结果，缺失或字节不一致即抛错，全程不写文件，也不创建任何目录。 |  |
| scripts/generate-runtime-defaults.mjs | publishFsOpsOf | L460-463 | 用调用方传入的覆盖项逐键覆盖默认文件操作集合，覆盖项非对象时整体退回默认集合，不抛错。 |  |
| scripts/generate-runtime-defaults.mjs | uniquePaths | L465-467 | 按出现顺序对路径列表去重，既不解析也不校验路径合法性，且不改变元素的原始字符串。 |  |
| scripts/generate-runtime-defaults.mjs | cleanupPublishFiles | L469-479 | 逐个删除发布残留的临时与备份文件，单条删除失败只记录而不中断，最终返回失败描述清单。 |  |
| scripts/generate-runtime-defaults.mjs | restorePublishedEntry | L481-494 | 按备份还原单条已发布产物，原本无文件则删除目标文件，失败只返回描述字符串而不抛错。 |  |
| scripts/generate-runtime-defaults.mjs | publishFailure | L496-508 | 构造含阶段、回滚与清理明细的发布失败错误，把原始错误挂为 cause 属性以便追溯。 |  |
| scripts/generate-runtime-defaults.mjs | normalizedOutputEntries | L510-519 | 把各产出条目的路径解析为绝对路径并查重，重复目标即抛错，并报出冲突的两个来源标签。 |  |
| scripts/generate-runtime-defaults.mjs | publishGeneratedOutputs | L521-583 | 先暂存全部产物再逐个改名发布，任一步失败按逆序回滚并清理残留，抛出带阶段的聚合错误。 |  |
| scripts/generate-runtime-defaults.mjs | generatorPathContext | L586-593 | 复用调用方传入的路径上下文，缺省按仓库根与宿主根新建，不额外校验根的合法性与形状。 |  |
| scripts/generate-runtime-defaults.mjs | inputPathSpec | L595-602 | 归一化输入类别与权限选项，类别非 workspace 或 host 即抛错，缺省按 workspace。 |  |
| scripts/generate-runtime-defaults.mjs | readGeneratorInput | L604-610 | 按输入类别解析路径并做只读文件校验，返回校验后的规范路径，不读取也不返回文件内容。 |  |
| scripts/generate-runtime-defaults.mjs | pathEntryExists | L612-620 | 判断路径是否存在，ENOENT 与 ENOTDIR 视为不存在，其余错误照原样抛错。 |  |
| scripts/generate-runtime-defaults.mjs | ensureWorkspaceOutputParent | L622-636 | 逐级补建缺失的输出父目录，每级补建后都复验为目录，路径不可解析即抛错且不留残留。 |  |
| scripts/generate-runtime-defaults.mjs | generatorOutputTarget | L638-646 | 解析生成输出目标，非 check 模式强制工作区类，缺省用途为 generator-output。 |  |
| scripts/generate-runtime-defaults.mjs | outputEntryTarget | L648-658 | 按条目类别与用途解析单条产出目标路径，补齐缺省值后再走宿主或工作区的路径解析分支。 |  |
| scripts/generate-runtime-defaults.mjs | authorizeOutputEntries | L660-673 | 逐条授权产出目标：check 只做只读校验，否则强制工作区并预建父目录后再次复验。 |  |
| scripts/generate-runtime-defaults.mjs | outputMetadata | L675-683 | 汇总产出目标的类别、能力与用途三项元数据，空目标返回空对象而不抛错，也不补默认值。 |  |
| scripts/generate-runtime-defaults.mjs | generateRuntimeDefaults | L694-777 | 读模板渲染全部产物：check 只比对不写，否则原子发布；坏模板或缺失输入不触碰产物。 |  |
| scripts/generate-runtime-defaults.mjs | invokedAsMain | L779-782 | 判断本脚本是否被直接执行，进程参数缺失时返回假，只做路径比较，不去改变进程状态。 |  |

---

*本文件由脚本增量维护；直接编辑功能描述/备注列是安全的。*
