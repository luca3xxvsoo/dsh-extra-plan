# 代码地图（dsh-extra-plan）

> **维护分工**：行号区间/增删行由脚本 node pe-test/tools/代码地图生成.mjs 增量同步；**功能描述、备注、以及「意图速查」整节由 AI/人维护**（脚本刷新不会覆盖）。
> **用法**：先看「意图速查」按意图词找函数名 → 再到「函数索引」按函数名取行号区间 → read 该区间。
> 上次同步：2026-10-23 16:56:02（脚本自动更新时间戳行）

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
| job_kill 仅直行放行／main send_message 方向限制／job_list·list_agents 同锚点防轮询／child 控制工具硬拒 | index.js、lib/gate-decisions.js | mainGateReason、childControlGateReason、pollGuardGateReason、recordPollGuardCall |
| 原始 child 预审／直呼与 run_code 成员控制拒绝（unknown/断链也覆盖） | index.js、plugins/dsh-extra-plan/lib/agent-session.js、plugins/dsh-extra-plan/lib/gate-decisions.js | apply、isSubagentChild、childControlGateReason、runCodeGroupDenyReason |
| 命令文本提取／写操作判定／只读角色 shell 拒绝文案／runner 写暗示（write/拦截） | plugins/dsh-extra-plan/lib/shell-mutation.js、index.js、plugins/dsh-extra-plan/lib/run-code-static.js | commandTextOf、pwshCommandOf、bashCommandOf、mutationTextMatches、pwshMutationMatches、bashMutationMatches、shellMutationReason、runCodeTextOf、codeMutationHints |
| 锚定引导／F-L 首轮极简／bootstrap／HN-HB-HP／F 段 tool:read 手写文案（bootstrapReadHint） | index.js、plugins/dsh-extra-plan/lib/assembly-presentation.js | isBootstrapPhase、projectAssemblyForPresentation |
| A/C/M 展示投影／C7 过滤／Pure PTC 手写 read（变量② bootstrapReadHint）／SDK 重建 | index.js、plugins/dsh-extra-plan/lib/assembly-presentation.js | projectAssemblyForPresentation、renderFilteredToolsSdk、resolveToolsSdkRenderer、filteredCordisSchemas、sdkSchemasForRendering、toolSdkSchemasOf |
| P2-2 SDK 文本复用／agent-only（仅 Agent）cache／F-L 分离／三元组失效／dispose-restart／失败不缓存／并发合并／计数硬门槛 | index.js、plugins/dsh-extra-plan/lib/assembly-presentation.js、plugins/dsh-extra-plan/lib/sdk-text-cache.js | createSdkTextCache、sdkSchemasFingerprint、sdkTextCacheEntryMatches |
| skill catalog 暂隐／普通 skill 保留／HP1 | index.js、plugins/dsh-extra-plan/lib/assembly-presentation.js | skillCatalogEntriesOf、renderSkillCatalogText、projectSkillCatalogDecision、shouldHideCreativeCatalog |
| durable context gate／F-L source 过滤／agent-instructions／skill-catalog／按 kind context 去重／Session surface | index.js、plugins/dsh-extra-plan/lib/gate-decisions.js | filterBootstrapContextDecision、dedupeProjectedContextDecision、isBootstrapPhase、isAnchoredContextGate |
| 方案/询问工具在未确认路由下的拒绝文案（plan route） | index.js | planDenyReason |
| 批准前禁委派（approval deny） | index.js | approvalDenyReason |
| 规划子代理分支闸门（planner 写禁+预算） | index.js | plannerGateReason、shellMutationReason |
| 会话事件快照／角色常量与身份识别（ROLE_IDS/ROLE_ORDERS 只描述身份与顺序，不承载权限）／单次快照复用（execEvents）／planner descriptor 缓存／usage 血缘上下文 | lib/agent-session.js、lib/agent-runtime.js、lib/runtime-lifecycle.js、lib/role-contract.js、index.js | sessionEvents、isSubagentChild、isLiveDelegation、childPolicyNeedsFloor、createAgentRuntime、isChild、isPlannerChild、toolSchemasOf、usageContextOf、usageRootOf、childBaseline |
| 在线 usage 共享锁／owner 诊断／stale-lock 每实例一次可见告警与显式维护／release 失败状态／默认快照与在线归档（active+archive+lock、writer 短等、释放后补记、无调用计数列） | plugins/dsh-extra-plan/lib/usage-ledger.js、pe-test/tools/step-99-用量统计.mjs | usageLedgerLockPath、acquireUsageLedgerLock、releaseUsageLedgerLock、warnStaleLock、foldUsage |
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
| 四角色 definition 工具面／main control 保留／Cordis 只读绑定 | assets/presets/extra-plan/agent.cordis.yml、assets/presets/extra-plan/preset-definition-<role>.generated.yml、index.js | roleDefinitionsWithPresentation、toolSchemasOf |
| child 控制矩阵与宿主角色工具面测试入口 | pe-test/tools/step-00-全流程回归.mjs、pe-test/tools/step-04-路由与写闸门.mjs、pe-test/tools/step-05-角色预设宿主回归.mjs |  |
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
| plugins/dsh-extra-plan/index.js | 989 | 核心入口：四级闸门、预算、save 工具注册与生命周期；接线 planner/非 planner 路由、A/C/M 投影、P2-2 cache、V2 session 分桶 usage final fold、v4 MALFORMED 自愈。gateWords 只来自 YAML，apply 先校验再副作用；tools/pre-execute 先用原始 `isSubagentChild` 预审 child 控制工具，再进入角色/root 闸门，main 控制与自动最终结果保持。 |
| plugins/dsh-extra-plan/lib/agent-runtime.js | 153 | 每次 apply 的角色识别、descriptor/工具 schema 缓存、usage 血缘上下文与 role baseline、sandbox floor 工厂；不 import index.js |
| plugins/dsh-extra-plan/lib/agent-session.js | 32 | 会话事件与子代理识别的唯一来源：sessionEvents/isSubagentChild 零依赖纯函数，被 index.js 与 lib/model-routing.js 共用（无镜像副本；不 import index.js） |
| plugins/dsh-extra-plan/lib/assembly-presentation.js | 242 | A/C/M 与 skill catalog 模型可见投影；从 scoped tools 读 schema/模式，SDK renderer 按 language 整体重建；F/PTC 的 tool:read 由 index.js 手写，L 段回宿主原文。 |
| plugins/dsh-extra-plan/lib/client-carrier.js | 7 | settings 内部 Loader Group 的无副作用 Client carrier；不对应 bundle row/公开 export。 |
| plugins/dsh-extra-plan/lib/client.js | 321 | 客户端模块加载共享样式/词条与 SettingsCard/ExtraPlanForm；设置表单仅经 detail.section 渲染于当前包详情行列表之后（自绘标题，不注册 bundle.config；若本包 bundle.config 槽出现条目则让位）；后端全局 settings API/Config/旧值迁移与 definition/adapter 由同一 owner 活动。 |
| plugins/dsh-extra-plan/lib/executor-spawn.js | 132 | 执行者子代理 provider：委托宿主 spawn，注入工具 deny（防委派递归/追问）；registerProvider 走引用计数幂等（**稳定键幂等**：模块级 WeakMap 槽表的槽键 = subagents 服务实现本体——读全局注册符号 Symbol.for('cordis.original')，由 traceable 代理 get 拦截器返回 target，root 单例跨预设世代恒同一对象；取不到符号值时降级回代理本身；跨预设世代/行重建复用同一注册，归零才反注册） |
| plugins/dsh-extra-plan/lib/gate-decisions.js | 1070 | 四级闸门与角色分流判定纯函数集 |
| plugins/dsh-extra-plan/lib/gate-words.js | 114 | 闸门关键词共享契约（唯一值源是 YAML 的 config.gateWords）：字段规格 GATE_WORD_FIELDS/GATE_WORDS_GROUP_DEFINITION + 整组严格校验 validateGateWords（错误一律以 extra-plan: config.gateWords 开头）+ 运行时词表 createGateRuntime（显式入参严格校验，无默认词表）；纯模块：不含任何出厂词值、不读文件与环境变量，被 index.js（运行时）与 lib/preset-sync.js（启动自愈）共享（迁移叶 locator 已随跨版本搬迁链删除） |
| plugins/dsh-extra-plan/lib/live-config.js | 239 | 配置热读：仅 8 项运行时 getter；2 项宿主行权威设置只读并派生到内存 definition，不暴露为 getter；构造期读盘一次，后续按增强 stamp（dev/ino/size/mtimeNs/ctimeNs，兼容 ino/size/mtimeMs/ctimeMs）重读；失败整组回退并告警，不读 DSH_HOME 旧目录 |
| plugins/dsh-extra-plan/lib/model-routing.js | 509 | planner/非 planner 子代理模型路由：顶层纯判定函数 + createModelRouting per-apply 工厂（per-instance WeakMap、惰性 llm/agents getter；不 import index.js） |
| plugins/dsh-extra-plan/lib/planner-budget.js | 137 | planner 工具计数、消息后缀/预算提示/耗尽文案；**预算提醒消息经宿主 createUserMessage 构造，source 用生产者自有 kind `plugin:dsh-extra-plan`（v4 行准入禁旧包裹 `plugin`，违者会话当场终止）**；默认预算由生成模块提供，FREE_TOOLS 仍在根入口 |
| plugins/dsh-extra-plan/lib/preset-defaults.generated.js | 16 | 由 YAML 模板生成的十键 `DEFAULT_SETTINGS` 与兼容别名 runtime fallback（回退）常量；generated（生成）/do not edit（勿手改） |
| plugins/dsh-extra-plan/lib/preset-settings.js | 3 | 10 项设置描述与 YAML 定位；settings 行是权威值，声明行只投影 2 项宿主行；capture/投影读取、plugins 行整体重述与保格式标量改写。 |
| plugins/dsh-extra-plan/lib/preset-sync.js | 966 | 读取并严格校验纯 definition；旧 preset-extra-plan/extra-plan-preset-sync 仅安全读取迁移，统一全局行补齐后派生 definition 并由同一 owner 挂载官方 AgentPreset；新写入仅经唯一全局行 configEditor.edit；mountPresetSync 以通用 settled 回调交付最终十项/gateWords。 |
| plugins/dsh-extra-plan/lib/preset-yaml.js | 589 | 预设 YAML 纯职责模块：解析、行与叶定位及歧义分类、权威与投影值捕获、保格式标量改写。 |
| plugins/dsh-extra-plan/lib/qqbot-settings-sync.js | 893 | Web documentPath 首选、显式 DSH_HOME 备用、双锚点 profile 扫描、完整 10 项/gateWords 安全快照、局部 YAML 保格式写入、排他临时/备份/恢复与串行同步队列；不读用户目录、不触碰未知根。 |
| plugins/dsh-extra-plan/lib/role-contract.js | 9 | 冻结角色 ID/order 数组并由同一数组派生 planner/prober preset ID；只提供身份与装配顺序，不承载权限、沙箱或生命周期策略。 |
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
| plugins/dsh-extra-plan/lib/usage-ledger.js | 455 | per-apply V2 usage writer 与跨进程排他锁：固定15键（rootSessionId/agentPreset 可空）、owner PID/token、bounded acquire/release、锁内同步 fold、身份血缘与四桶 JSONL、cursor 续载；timeout 静默返回 `delayed`、后续 fold 补记，stale 每实例一次告警并由维护者显式处理，release 失败显式返回状态。 |
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
| plugins/dsh-extra-plan/index.js | malformedRecovery | L206-240 | MALFORMED_RESPONSE 限次自愈：llm-retry 已给 {kind:'retry'} 原样透传（不叠加）；否则按 sessionId→Set('turn:step') 同回合只兜底 1 次（防死循环），注入 developer/message 中文提示（append 带 surfaceOp:'append'、纯文本禁带 headerSeq、source.kind 用生产者自有 plugin:dsh-extra-plan）并返回 {kind:'retry'}；**payload 须自带 ≥1 的 turn/step（宿主 append 不补坐标），坐标缺失/非正整数 → 跳过注入但仍返回 {kind:'retry'}**；aborted/无 agent/超次 → null 回退原 action 透传 |  |
| plugins/dsh-extra-plan/index.js | recordAgentError | L254-272 | agent/error 回合错误取证：把宿主回合/步骤级错误（payload {agent,turn,step,error}）逐字落盘到插件目录 extra-plan-agent-errors.jsonl，行 = {ts, sessionId, turn, step, chain}；整体吞错 + 一次性 warn 防刷屏；模块级函数经命名导出供回归冒烟直呼 | 与 recordRequestError 同诊断模式 |
| plugins/dsh-extra-plan/index.js | apply | L276-989 | 插件主入口：第一步 createGateRuntime(cfg.gateWords)（缺失/非法同步抛错，早于任何工具/监听器/服务副作用）→ ctx.effect 在当前 agent scope 注册恰好 7 个 extra_plan_* prompt variable（provider 返回本次 apply 捕获值）→ 配置解析（含变量② bootstrapReadHint）/服务注册/工具注册/creativeMode 模型可见投影/锚点钩子（HP 首轮 tool:read text 用变量②覆盖）；planner 与非 planner child 双模型路由；会话状态按 sessionId 分桶与 agent/disposed 同步 final flush + 单会话回收；tool-jobs 通知由 `agent/inbox/claimed` 同步主入口与 `tools/pre-execute` durable snapshot fallback 共用 `consumeToolJobsNotice`，以 notice `message.id` 建立跨锚点基线，复用 jobId 的新 incarnation 仍可解锁 |  |
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
| plugins/dsh-extra-plan/lib/assembly-presentation.js | dshToolsEntryCandidates | L154-170 | （待补充） |  |
| plugins/dsh-extra-plan/lib/assembly-presentation.js | loadSdkRendererModule | L173-187 | （待补充） |  |
| plugins/dsh-extra-plan/lib/assembly-presentation.js | pending | L175-184 | （待补充） |  |
| plugins/dsh-extra-plan/lib/assembly-presentation.js | resolveToolsSdkRenderer | L190-195 | （待补充） |  |
| plugins/dsh-extra-plan/lib/assembly-presentation.js | renderFilteredToolsSdk | L198-201 | （待补充） |  |
| plugins/dsh-extra-plan/lib/assembly-presentation.js | toolRegistryOf | L203-211 | （待补充） |  |
| plugins/dsh-extra-plan/lib/assembly-presentation.js | toolSdkSchemasOf | L213-231 | （待补充） |  |
| plugins/dsh-extra-plan/lib/assembly-presentation.js | toolPresentationModeOf | L233-242 | （待补充） |  |
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
| plugins/dsh-extra-plan/lib/executor-spawn.js | resolveDeny | L27-29 | （待补充） |  |
| plugins/dsh-extra-plan/lib/executor-spawn.js | slotKey | L48-54 | （待补充） |  |
| plugins/dsh-extra-plan/lib/executor-spawn.js | apply | L56-132 | （待补充） |  |
| plugins/dsh-extra-plan/lib/executor-spawn.js | releaseSlot | L82-90 | （待补充） |  |
| plugins/dsh-extra-plan/lib/executor-spawn.js | defaultedAgentOptions | L110-114 | （待补充） |  |
| plugins/dsh-extra-plan/lib/executor-spawn.js | start | L119-125 | （待补充） |  |
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
| plugins/dsh-extra-plan/lib/gate-decisions.js | shellMutationReason | L645-659 | （待补充） |  |
| plugins/dsh-extra-plan/lib/gate-decisions.js | childControlGateReason | L662-666 | 仅允许 main 使用 `send_message`/`interrupt_agent`；child 直呼统一返回硬拒文案，供 planner/只读 child/执行者/unknown child 与 run_code 组判定复用。 | 纯函数；mainGateReason 不经此拒绝。 |
| plugins/dsh-extra-plan/lib/gate-decisions.js | plannerGateReason | L670-686 | （待补充） |  |
| plugins/dsh-extra-plan/lib/gate-decisions.js | childReadonlyGateReason | L690-700 | （待补充） |  |
| plugins/dsh-extra-plan/lib/gate-decisions.js | jobOutputGateReason | L705-727 | （待补充） |  |
| plugins/dsh-extra-plan/lib/gate-decisions.js | recordJobOutputCall | L733-745 | （待补充） |  |
| plugins/dsh-extra-plan/lib/gate-decisions.js | pollGuardGateReason | L751-764 | （待补充） |  |
| plugins/dsh-extra-plan/lib/gate-decisions.js | recordPollGuardCall | L766-777 | （待补充） |  |
| plugins/dsh-extra-plan/lib/gate-decisions.js | probeDisposalWarning | L785-788 | （待补充） |  |
| plugins/dsh-extra-plan/lib/gate-decisions.js | mainGateReason | L798-928 | （待补充） |  |
| plugins/dsh-extra-plan/lib/gate-decisions.js | runCodeGroupDenyReason | L940-1024 | （待补充） |  |
| plugins/dsh-extra-plan/lib/gate-decisions.js | visit | L958-1001 | （待补充） |  |
| plugins/dsh-extra-plan/lib/gate-decisions.js | aggregateRunCodeDenyReason | L1030-1042 | （待补充） |  |
| plugins/dsh-extra-plan/lib/gate-words.js | fail | L31-33 | （待补充） |  |
| plugins/dsh-extra-plan/lib/gate-words.js | normalizeGateLabel | L36-38 | （待补充） |  |
| plugins/dsh-extra-plan/lib/gate-words.js | validateGateWords | L44-71 | （待补充） |  |
| plugins/dsh-extra-plan/lib/gate-words.js | bracketed | L73-75 | （待补充） |  |
| plugins/dsh-extra-plan/lib/gate-words.js | createGateRuntime | L85-114 | （待补充） |  |
| plugins/dsh-extra-plan/lib/live-config.js | textOf | L37-39 | （待补充） |  |
| plugins/dsh-extra-plan/lib/live-config.js | envConfigPath | L41-43 | （待补充） |  |
| plugins/dsh-extra-plan/lib/live-config.js | statStamp | L46-64 | （待补充） |  |
| plugins/dsh-extra-plan/lib/live-config.js | pick | L66-70 | （待补充） |  |
| plugins/dsh-extra-plan/lib/live-config.js | describeProblems | L73-75 | （待补充） |  |
| plugins/dsh-extra-plan/lib/live-config.js | normalizedFallback | L77-84 | （待补充） |  |
| plugins/dsh-extra-plan/lib/live-config.js | createLiveConfig | L92-239 | （待补充） |  |
| plugins/dsh-extra-plan/lib/live-config.js | warnOnce | L103-107 | （待补充） |  |
| plugins/dsh-extra-plan/lib/live-config.js | currentPath | L110-120 | （待补充） |  |
| plugins/dsh-extra-plan/lib/live-config.js | readDiskValues | L125-152 | （待补充） |  |
| plugins/dsh-extra-plan/lib/live-config.js | refresh | L178-213 | （待补充） |  |
| plugins/dsh-extra-plan/lib/live-config.js | read | L215-218 | （待补充） |  |
| plugins/dsh-extra-plan/lib/live-config.js | anchoredBootstrap | L222 | （待补充） |  |
| plugins/dsh-extra-plan/lib/live-config.js | creativeMode | L224 | （待补充） |  |
| plugins/dsh-extra-plan/lib/live-config.js | runcodeCatchGate | L226 | （待补充） |  |
| plugins/dsh-extra-plan/lib/live-config.js | crossProviderPlannerModel | L228 | （待补充） |  |
| plugins/dsh-extra-plan/lib/live-config.js | plannerModel | L230 | （待补充） |  |
| plugins/dsh-extra-plan/lib/live-config.js | plannerPromptSuffix | L232 | （待补充） |  |
| plugins/dsh-extra-plan/lib/live-config.js | exploreBudget | L234 | （待补充） |  |
| plugins/dsh-extra-plan/lib/live-config.js | otherAgentModel | L236 | （待补充） |  |
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
| plugins/dsh-extra-plan/lib/model-routing.js | createModelRouting | L157-509 | （待补充） |  |
| plugins/dsh-extra-plan/lib/model-routing.js | plannerAbortError | L165-168 | （待补充） |  |
| plugins/dsh-extra-plan/lib/model-routing.js | withPlannerProbeDeadline | L172-205 | （待补充） |  |
| plugins/dsh-extra-plan/lib/model-routing.js | probePlannerRoute | L209-251 | （待补充） |  |
| plugins/dsh-extra-plan/lib/model-routing.js | probePlannerCandidates | L258-274 | （待补充） |  |
| plugins/dsh-extra-plan/lib/model-routing.js | worker | L261-268 | （待补充） |  |
| plugins/dsh-extra-plan/lib/model-routing.js | uniqueProviderCandidates | L276-285 | （待补充） |  |
| plugins/dsh-extra-plan/lib/model-routing.js | collectStrictProbeCandidates | L288-308 | （待补充） |  |
| plugins/dsh-extra-plan/lib/model-routing.js | resolvePlannerEntryLegacy | L311-367 | （待补充） |  |
| plugins/dsh-extra-plan/lib/model-routing.js | resolvePlannerEntryStrict | L370-415 | （待补充） |  |
| plugins/dsh-extra-plan/lib/model-routing.js | resolvePlannerEntry | L419-428 | （待补充） |  |
| plugins/dsh-extra-plan/lib/model-routing.js | nonPlannerRouteSources | L432-436 | （待补充） |  |
| plugins/dsh-extra-plan/lib/model-routing.js | nonPlannerFallbackEntry | L438-446 | （待补充） |  |
| plugins/dsh-extra-plan/lib/model-routing.js | resolveOtherAgentEntryLegacy | L449-466 | （待补充） |  |
| plugins/dsh-extra-plan/lib/model-routing.js | resolveOtherAgentEntryStrict | L470-495 | （待补充） |  |
| plugins/dsh-extra-plan/lib/model-routing.js | resolveOtherAgentEntry | L498-507 | （待补充） |  |
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
| plugins/dsh-extra-plan/lib/preset-sync.js | loadOfficialAgentPreset | L37-51 | （待补充） |  |
| plugins/dsh-extra-plan/lib/preset-sync.js | contentHash | L68-76 | （待补充） |  |
| plugins/dsh-extra-plan/lib/preset-sync.js | pluginRows | L79-91 | （待补充） |  |
| plugins/dsh-extra-plan/lib/preset-sync.js | visit | L81-88 | （待补充） |  |
| plugins/dsh-extra-plan/lib/preset-sync.js | pluginRowIds | L93-95 | （待补充） |  |
| plugins/dsh-extra-plan/lib/preset-sync.js | declarationCoversAsset | L97-101 | （待补充） |  |
| plugins/dsh-extra-plan/lib/preset-sync.js | plainObject | L103-105 | （待补充） |  |
| plugins/dsh-extra-plan/lib/preset-sync.js | userWritableByRow | L107-123 | （待补充） |  |
| plugins/dsh-extra-plan/lib/preset-sync.js | push | L109-116 | （待补充） |  |
| plugins/dsh-extra-plan/lib/preset-sync.js | stripUserWritable | L125-136 | （待补充） |  |
| plugins/dsh-extra-plan/lib/preset-sync.js | declarationBodyMatchesAsset | L138-141 | （待补充） |  |
| plugins/dsh-extra-plan/lib/preset-sync.js | carryUserWritable | L143-167 | （待补充） |  |
| plugins/dsh-extra-plan/lib/preset-sync.js | effectiveRowConfig | L169-180 | （待补充） |  |
| plugins/dsh-extra-plan/lib/preset-sync.js | readAuthoritySettings | L182-205 | （待补充） |  |
| plugins/dsh-extra-plan/lib/preset-sync.js | findRowsById | L208-223 | （待补充） |  |
| plugins/dsh-extra-plan/lib/preset-sync.js | visit | L211-220 | （待补充） |  |
| plugins/dsh-extra-plan/lib/preset-sync.js | validDefinitionValue | L225-227 | （待补充） |  |
| plugins/dsh-extra-plan/lib/preset-sync.js | captureLegacyValues | L229-252 | （待补充） |  |
| plugins/dsh-extra-plan/lib/preset-sync.js | validGateWordsOrUndefined | L254-256 | （待补充） |  |
| plugins/dsh-extra-plan/lib/preset-sync.js | legacyStateFromPlugins | L258-272 | （待补充） |  |
| plugins/dsh-extra-plan/lib/preset-sync.js | readLegacyState | L275-329 | （待补充） |  |
| plugins/dsh-extra-plan/lib/preset-sync.js | resolveUnifiedConfig | L332-400 | （待补充） |  |
| plugins/dsh-extra-plan/lib/preset-sync.js | restateSettingsConfig | L402-427 | （待补充） |  |
| plugins/dsh-extra-plan/lib/preset-sync.js | assertPresetDefinition | L431-445 | （待补充） |  |
| plugins/dsh-extra-plan/lib/preset-sync.js | parsePresetDefinition | L447-449 | （待补充） |  |
| plugins/dsh-extra-plan/lib/preset-sync.js | assetDefinition | L451-454 | （待补充） |  |
| plugins/dsh-extra-plan/lib/preset-sync.js | assertRoleDefinition | L457-469 | （待补充） |  |
| plugins/dsh-extra-plan/lib/preset-sync.js | roleDefinitionOf | L471-477 | （待补充） |  |
| plugins/dsh-extra-plan/lib/preset-sync.js | assetDefinitions | L480-482 | （待补充） |  |
| plugins/dsh-extra-plan/lib/preset-sync.js | roleDefinitionsWithPresentation | L490-512 | （待补充） |  |
| plugins/dsh-extra-plan/lib/preset-sync.js | assetPlugins | L514-516 | （待补充） |  |
| plugins/dsh-extra-plan/lib/preset-sync.js | readDefinitionGateWords | L518-522 | （待补充） |  |
| plugins/dsh-extra-plan/lib/preset-sync.js | projectHostRow | L530-537 | （待补充） |  |
| plugins/dsh-extra-plan/lib/preset-sync.js | cloneDefinitionWithProjection | L539-551 | （待补充） |  |
| plugins/dsh-extra-plan/lib/preset-sync.js | definitionWithProjection | L553-555 | （待补充） |  |
| plugins/dsh-extra-plan/lib/preset-sync.js | publicConfigOf | L557-560 | （待补充） |  |
| plugins/dsh-extra-plan/lib/preset-sync.js | directProjectionFromLegacy | L562-573 | （待补充） |  |
| plugins/dsh-extra-plan/lib/preset-sync.js | assertTemplateGateWords | L575-579 | （待补充） |  |
| plugins/dsh-extra-plan/lib/preset-sync.js | readDeclaredPluginsFromPatch | L581-594 | （待补充） |  |
| plugins/dsh-extra-plan/lib/preset-sync.js | visit | L586-591 | （待补充） |  |
| plugins/dsh-extra-plan/lib/preset-sync.js | readLegacyPresetState | L596-599 | （待补充） |  |
| plugins/dsh-extra-plan/lib/preset-sync.js | syncPreset | L605-658 | （待补充） |  |
| plugins/dsh-extra-plan/lib/preset-sync.js | findEntry | L660-663 | （待补充） |  |
| plugins/dsh-extra-plan/lib/preset-sync.js | applyPlan | L665-673 | （待补充） |  |
| plugins/dsh-extra-plan/lib/preset-sync.js | readRawPatch | L675-679 | （待补充） |  |
| plugins/dsh-extra-plan/lib/preset-sync.js | settingsValuesFromRows | L681-684 | （待补充） |  |
| plugins/dsh-extra-plan/lib/preset-sync.js | activeLegacyRow | L686-693 | （待补充） |  |
| plugins/dsh-extra-plan/lib/preset-sync.js | projectedAssetDefinition | L696-706 | （待补充） |  |
| plugins/dsh-extra-plan/lib/preset-sync.js | readPatch | L699 | （待补充） |  |
| plugins/dsh-extra-plan/lib/preset-sync.js | structuralValue | L708-719 | （待补充） |  |
| plugins/dsh-extra-plan/lib/preset-sync.js | rowStructureRecord | L721-740 | （待补充） |  |
| plugins/dsh-extra-plan/lib/preset-sync.js | structuralFingerprint | L743-761 | （待补充） |  |
| plugins/dsh-extra-plan/lib/preset-sync.js | visit | L745-758 | （待补充） |  |
| plugins/dsh-extra-plan/lib/preset-sync.js | mountPresetSync | L763-963 | （待补充） |  |
| plugins/dsh-extra-plan/lib/preset-sync.js | disposeFiber | L776-779 | （待补充） |  |
| plugins/dsh-extra-plan/lib/preset-sync.js | reportSettledError | L780-787 | （待补充） |  |
| plugins/dsh-extra-plan/lib/preset-sync.js | reportAdapterError | L788-796 | （待补充） |  |
| plugins/dsh-extra-plan/lib/preset-sync.js | readState | L797-810 | （待补充） |  |
| plugins/dsh-extra-plan/lib/preset-sync.js | snapshotOf | L811-821 | （待补充） |  |
| plugins/dsh-extra-plan/lib/preset-sync.js | readPatch | L814 | （待补充） |  |
| plugins/dsh-extra-plan/lib/preset-sync.js | enqueueSettled | L822-833 | （待补充） |  |
| plugins/dsh-extra-plan/lib/preset-sync.js | settledSettingsUpdate | L834-842 | （待补充） |  |
| plugins/dsh-extra-plan/lib/preset-sync.js | enqueueStructural | L843-851 | （待补充） |  |
| plugins/dsh-extra-plan/lib/preset-sync.js | mountOfficialAdapter | L856-881 | （待补充） |  |
| plugins/dsh-extra-plan/lib/preset-sync.js | disposeCurrentAdapter | L882-886 | （待补充） |  |
| plugins/dsh-extra-plan/lib/preset-sync.js | structuralHandoff | L887-907 | （待补充） |  |
| plugins/dsh-extra-plan/lib/preset-sync.js | readPatch | L896 | （待补充） |  |
| plugins/dsh-extra-plan/lib/preset-sync.js | apply | L898 | （待补充） |  |
| plugins/dsh-extra-plan/lib/preset-sync.js | initialMount | L908-935 | （待补充） |  |
| plugins/dsh-extra-plan/lib/preset-sync.js | readPatch | L917 | （待补充） |  |
| plugins/dsh-extra-plan/lib/preset-sync.js | apply | L919 | （待补充） |  |
| plugins/dsh-extra-plan/lib/preset-sync.js | settledOnlyUpdate | L936 | （待补充） |  |
| plugins/dsh-extra-plan/lib/preset-sync.js | dispose | L952-960 | （待补充） |  |
| plugins/dsh-extra-plan/lib/preset-yaml.js | loadYaml | L7-20 | （待补充） |  |
| plugins/dsh-extra-plan/lib/preset-yaml.js | resolve | L25 | （待补充） |  |
| plugins/dsh-extra-plan/lib/preset-yaml.js | construct | L26 | （待补充） |  |
| plugins/dsh-extra-plan/lib/preset-yaml.js | predicate | L27 | （待补充） |  |
| plugins/dsh-extra-plan/lib/preset-yaml.js | represent | L28 | （待补充） |  |
| plugins/dsh-extra-plan/lib/preset-yaml.js | parsePresetYaml | L45-48 | （待补充） |  |
| plugins/dsh-extra-plan/lib/preset-yaml.js | hasOwn | L50-52 | （待补充） |  |
| plugins/dsh-extra-plan/lib/preset-yaml.js | pathParts | L54-56 | （待补充） |  |
| plugins/dsh-extra-plan/lib/preset-yaml.js | readPath | L58-65 | （待补充） |  |
| plugins/dsh-extra-plan/lib/preset-yaml.js | collectRowsById | L67-82 | （待补充） |  |
| plugins/dsh-extra-plan/lib/preset-yaml.js | visit | L70-79 | （待补充） |  |
| plugins/dsh-extra-plan/lib/preset-yaml.js | rowsById | L85-87 | （待补充） |  |
| plugins/dsh-extra-plan/lib/preset-yaml.js | rowsByIdWithPath | L90-97 | （待补充） |  |
| plugins/dsh-extra-plan/lib/preset-yaml.js | resolveLocator | L99-112 | （待补充） |  |
| plugins/dsh-extra-plan/lib/preset-yaml.js | locatorFor | L114-119 | （待补充） |  |
| plugins/dsh-extra-plan/lib/preset-yaml.js | aliasesFor | L121-126 | （待补充） |  |
| plugins/dsh-extra-plan/lib/preset-yaml.js | resolveSetting | L133-146 | （待补充） |  |
| plugins/dsh-extra-plan/lib/preset-yaml.js | resolveTemplateSettingDefault | L148-163 | （待补充） |  |
| plugins/dsh-extra-plan/lib/preset-yaml.js | captureSettings | L169-185 | （待补充） |  |
| plugins/dsh-extra-plan/lib/preset-yaml.js | hostRowDefaultsFromTemplate | L188-202 | （待补充） |  |
| plugins/dsh-extra-plan/lib/preset-yaml.js | captureRowSettings | L212-228 | （待补充） |  |
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
| plugins/dsh-extra-plan/lib/preset-yaml.js | findPluginsRow | L354-365 | （待补充） |  |
| plugins/dsh-extra-plan/lib/preset-yaml.js | readProjectedValue | L372-391 | （待补充） |  |
| plugins/dsh-extra-plan/lib/preset-yaml.js | restatePluginsRow | L394-401 | （待补充） |  |
| plugins/dsh-extra-plan/lib/preset-yaml.js | inlineCommentIndex | L403-421 | （待补充） |  |
| plugins/dsh-extra-plan/lib/preset-yaml.js | lineIndent | L423-426 | （待补充） |  |
| plugins/dsh-extra-plan/lib/preset-yaml.js | withoutCr | L428-430 | （待补充） |  |
| plugins/dsh-extra-plan/lib/preset-yaml.js | parseRowId | L432-444 | （待补充） |  |
| plugins/dsh-extra-plan/lib/preset-yaml.js | parseMapKey | L446-450 | （待补充） |  |
| plugins/dsh-extra-plan/lib/preset-yaml.js | rowEnd | L452-460 | （待补充） |  |
| plugins/dsh-extra-plan/lib/preset-yaml.js | findDirectKey | L462-480 | （待补充） |  |
| plugins/dsh-extra-plan/lib/preset-yaml.js | textPathLine | L482-494 | （待补充） |  |
| plugins/dsh-extra-plan/lib/preset-yaml.js | findTextLocatorMatches | L496-508 | （待补充） |  |
| plugins/dsh-extra-plan/lib/preset-yaml.js | yamlString | L510-514 | （待补充） |  |
| plugins/dsh-extra-plan/lib/preset-yaml.js | serializeScalar | L516-520 | （待补充） |  |
| plugins/dsh-extra-plan/lib/preset-yaml.js | escapeRegex | L522-524 | （待补充） |  |
| plugins/dsh-extra-plan/lib/preset-yaml.js | replaceLineScalar | L526-538 | （待补充） |  |
| plugins/dsh-extra-plan/lib/preset-yaml.js | isBlockScalarLine | L540-550 | （待补充） |  |
| plugins/dsh-extra-plan/lib/preset-yaml.js | scalarTypeFor | L552-557 | （待补充） |  |
| plugins/dsh-extra-plan/lib/preset-yaml.js | patchYamlScalar | L563-589 | （待补充） |  |
| plugins/dsh-extra-plan/lib/qqbot-settings-sync.js | plainObject | L38-40 | （待补充） |  |
| plugins/dsh-extra-plan/lib/qqbot-settings-sync.js | errorText | L42-44 | （待补充） |  |
| plugins/dsh-extra-plan/lib/qqbot-settings-sync.js | loadYaml | L46-64 | （待补充） |  |
| plugins/dsh-extra-plan/lib/qqbot-settings-sync.js | resolve | L53 | （待补充） |  |
| plugins/dsh-extra-plan/lib/qqbot-settings-sync.js | construct | L54 | （待补充） |  |
| plugins/dsh-extra-plan/lib/qqbot-settings-sync.js | predicate | L55 | （待补充） |  |
| plugins/dsh-extra-plan/lib/qqbot-settings-sync.js | represent | L56 | （待补充） |  |
| plugins/dsh-extra-plan/lib/qqbot-settings-sync.js | parseYaml | L66-69 | （待补充） |  |
| plugins/dsh-extra-plan/lib/qqbot-settings-sync.js | readableDirectory | L71-80 | （待补充） |  |
| plugins/dsh-extra-plan/lib/qqbot-settings-sync.js | unavailable | L82-84 | （待补充） |  |
| plugins/dsh-extra-plan/lib/qqbot-settings-sync.js | documentPathValue | L86-88 | （待补充） |  |
| plugins/dsh-extra-plan/lib/qqbot-settings-sync.js | rootFromDocumentPath | L90-101 | （待补充） |  |
| plugins/dsh-extra-plan/lib/qqbot-settings-sync.js | environmentValue | L103-105 | （待补充） |  |
| plugins/dsh-extra-plan/lib/qqbot-settings-sync.js | resolveProfilesRoot | L108-128 | （待补充） |  |
| plugins/dsh-extra-plan/lib/qqbot-settings-sync.js | sortedNames | L130-132 | （待补充） |  |
| plugins/dsh-extra-plan/lib/qqbot-settings-sync.js | scanOwnQqbotProfiles | L134-173 | （待补充） |  |
| plugins/dsh-extra-plan/lib/qqbot-settings-sync.js | findOwnQqbotProfiles | L176-183 | （待补充） |  |
| plugins/dsh-extra-plan/lib/qqbot-settings-sync.js | snapshotValues | L185-191 | （待补充） |  |
| plugins/dsh-extra-plan/lib/qqbot-settings-sync.js | snapshotGateWords | L193-197 | （待补充） |  |
| plugins/dsh-extra-plan/lib/qqbot-settings-sync.js | validateSettingsSnapshot | L200-215 | （待补充） |  |
| plugins/dsh-extra-plan/lib/qqbot-settings-sync.js | expectedManaged | L217-220 | （待补充） |  |
| plugins/dsh-extra-plan/lib/qqbot-settings-sync.js | canonicalSnapshot | L222-227 | （待补充） |  |
| plugins/dsh-extra-plan/lib/qqbot-settings-sync.js | stableSnapshotHash | L230-233 | （待补充） |  |
| plugins/dsh-extra-plan/lib/qqbot-settings-sync.js | managedSnapshotHashFromConfig | L235-241 | （待补充） |  |
| plugins/dsh-extra-plan/lib/qqbot-settings-sync.js | patchDiagnostic | L243-271 | （待补充） |  |
| plugins/dsh-extra-plan/lib/qqbot-settings-sync.js | strictAssociation | L273-275 | （待补充） |  |
| plugins/dsh-extra-plan/lib/qqbot-settings-sync.js | splitText | L277-283 | （待补充） |  |
| plugins/dsh-extra-plan/lib/qqbot-settings-sync.js | joinText | L285-288 | （待补充） |  |
| plugins/dsh-extra-plan/lib/qqbot-settings-sync.js | indentOf | L290-292 | （待补充） |  |
| plugins/dsh-extra-plan/lib/qqbot-settings-sync.js | ignorable | L294-297 | （待补充） |  |
| plugins/dsh-extra-plan/lib/qqbot-settings-sync.js | rootSequenceInfo | L299-317 | （待补充） |  |
| plugins/dsh-extra-plan/lib/qqbot-settings-sync.js | keyMatch | L319-322 | （待补充） |  |
| plugins/dsh-extra-plan/lib/qqbot-settings-sync.js | targetKind | L324-331 | （待补充） |  |
| plugins/dsh-extra-plan/lib/qqbot-settings-sync.js | configHolder | L333-335 | （待补充） |  |
| plugins/dsh-extra-plan/lib/qqbot-settings-sync.js | locateConfigLine | L337-350 | （待补充） |  |
| plugins/dsh-extra-plan/lib/qqbot-settings-sync.js | blockEndForChild | L352-358 | （待补充） |  |
| plugins/dsh-extra-plan/lib/qqbot-settings-sync.js | directKeyLines | L360-367 | （待补充） |  |
| plugins/dsh-extra-plan/lib/qqbot-settings-sync.js | configChildIndent | L369-379 | （待补充） |  |
| plugins/dsh-extra-plan/lib/qqbot-settings-sync.js | scalar | L381-385 | （待补充） |  |
| plugins/dsh-extra-plan/lib/qqbot-settings-sync.js | renderedConfig | L387-399 | （待补充） |  |
| plugins/dsh-extra-plan/lib/qqbot-settings-sync.js | renderedRow | L402-411 | （待补充） |  |
| plugins/dsh-extra-plan/lib/qqbot-settings-sync.js | spaces | L403 | （待补充） |  |
| plugins/dsh-extra-plan/lib/qqbot-settings-sync.js | parsedTarget | L413-422 | （待补充） |  |
| plugins/dsh-extra-plan/lib/qqbot-settings-sync.js | configState | L424-441 | （待补充） |  |
| plugins/dsh-extra-plan/lib/qqbot-settings-sync.js | managedProjection | L443-447 | （待补充） |  |
| plugins/dsh-extra-plan/lib/qqbot-settings-sync.js | equalManaged | L449-458 | （待补充） |  |
| plugins/dsh-extra-plan/lib/qqbot-settings-sync.js | reparseAndCheck | L460-469 | （待补充） |  |
| plugins/dsh-extra-plan/lib/qqbot-settings-sync.js | existingNameState | L471-488 | （待补充） |  |
| plugins/dsh-extra-plan/lib/qqbot-settings-sync.js | applyExistingTarget | L490-552 | （待补充） |  |
| plugins/dsh-extra-plan/lib/qqbot-settings-sync.js | appendTarget | L554-566 | （待补充） |  |
| plugins/dsh-extra-plan/lib/qqbot-settings-sync.js | scalarTokenEquals | L568-571 | （待补充） |  |
| plugins/dsh-extra-plan/lib/qqbot-settings-sync.js | duplicateTargetNameText | L573-601 | （待补充） |  |
| plugins/dsh-extra-plan/lib/qqbot-settings-sync.js | planQqbotSettingsPatch | L604-629 | （待补充） |  |
| plugins/dsh-extra-plan/lib/qqbot-settings-sync.js | writeExclusive | L631-639 | （待补充） |  |
| plugins/dsh-extra-plan/lib/qqbot-settings-sync.js | nextFilePath | L641-647 | （待补充） |  |
| plugins/dsh-extra-plan/lib/qqbot-settings-sync.js | hook | L649-651 | （待补充） |  |
| plugins/dsh-extra-plan/lib/qqbot-settings-sync.js | writeQqbotSettingsPatch | L654-737 | （待补充） |  |
| plugins/dsh-extra-plan/lib/qqbot-settings-sync.js | fingerprint | L739-741 | （待补充） |  |
| plugins/dsh-extra-plan/lib/qqbot-settings-sync.js | resultForPath | L743-752 | （待补充） |  |
| plugins/dsh-extra-plan/lib/qqbot-settings-sync.js | webDocumentPath | L755-760 | （待补充） |  |
| plugins/dsh-extra-plan/lib/qqbot-settings-sync.js | createQqbotSettingsSynchronizer | L762-891 | （待补充） |  |
| plugins/dsh-extra-plan/lib/qqbot-settings-sync.js | emit | L768-773 | （待补充） |  |
| plugins/dsh-extra-plan/lib/qqbot-settings-sync.js | execute | L774-857 | （待补充） |  |
| plugins/dsh-extra-plan/lib/qqbot-settings-sync.js | finish | L783-795 | （待补充） |  |
| plugins/dsh-extra-plan/lib/qqbot-settings-sync.js | enqueue | L858-885 | （待补充） |  |
| plugins/dsh-extra-plan/lib/qqbot-settings-sync.js | getState | L889 | （待补充） |  |
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
| plugins/dsh-extra-plan/lib/save-contract.js | renderSavePlan | L127-144 | （待补充） |  |
| plugins/dsh-extra-plan/lib/save-contract.js | renderProbeMarkdown | L179-220 | （待补充） |  |
| plugins/dsh-extra-plan/lib/save-contract.js | trimProbeEvidenceDecor | L246-257 | （待补充） |  |
| plugins/dsh-extra-plan/lib/save-contract.js | extractProbeEvidenceRefs | L258-271 | （待补充） |  |
| plugins/dsh-extra-plan/lib/save-contract.js | renderSaveProbe | L275-277 | （待补充） |  |
| plugins/dsh-extra-plan/lib/save-persistence.js | fsOpsOf | L8-11 | （待补充） |  |
| plugins/dsh-extra-plan/lib/save-persistence.js | errorText | L13-15 | （待补充） |  |
| plugins/dsh-extra-plan/lib/save-persistence.js | cleanupCreated | L17-27 | （待补充） |  |
| plugins/dsh-extra-plan/lib/save-persistence.js | commitError | L29-35 | （待补充） |  |
| plugins/dsh-extra-plan/lib/save-persistence.js | atomicCommit | L40-76 | （待补充） |  |
| plugins/dsh-extra-plan/lib/save-plan-validation.js | newFileRecord | L54-56 | （待补充） |  |
| plugins/dsh-extra-plan/lib/save-plan-validation.js | newTask | L58-70 | （待补充） |  |
| plugins/dsh-extra-plan/lib/save-plan-validation.js | newClosure | L72-83 | （待补充） |  |
| plugins/dsh-extra-plan/lib/save-plan-validation.js | newCheck | L86-92 | （待补充） |  |
| plugins/dsh-extra-plan/lib/save-plan-validation.js | newGlobal | L94-96 | （待补充） |  |
| plugins/dsh-extra-plan/lib/save-plan-validation.js | makeDiagnostic | L98-107 | （待补充） |  |
| plugins/dsh-extra-plan/lib/save-plan-validation.js | defaultTemplate | L109-144 | （待补充） |  |
| plugins/dsh-extra-plan/lib/save-plan-validation.js | normalizeText | L146-148 | （待补充） |  |
| plugins/dsh-extra-plan/lib/save-plan-validation.js | fieldOf | L150-155 | （待补充） |  |
| plugins/dsh-extra-plan/lib/save-plan-validation.js | isPlaceholderAnchor | L164-166 | （待补充） |  |
| plugins/dsh-extra-plan/lib/save-plan-validation.js | isAcceptancePlaceholder | L168-171 | （待补充） |  |
| plugins/dsh-extra-plan/lib/save-plan-validation.js | parseLocation | L173-181 | （待补充） |  |
| plugins/dsh-extra-plan/lib/save-plan-validation.js | pointIdentity | L183-185 | （待补充） |  |
| plugins/dsh-extra-plan/lib/save-plan-validation.js | headingCandidate | L188-200 | （待补充） |  |
| plugins/dsh-extra-plan/lib/save-plan-validation.js | pushEmptyFieldDiagnostic | L202-206 | （待补充） |  |
| plugins/dsh-extra-plan/lib/save-plan-validation.js | parseTaskDocument | L208-464 | （待补充） |  |
| plugins/dsh-extra-plan/lib/save-plan-validation.js | flush | L222-229 | （待补充） |  |
| plugins/dsh-extra-plan/lib/save-plan-validation.js | wrongHeading | L231-233 | （待补充） |  |
| plugins/dsh-extra-plan/lib/save-plan-validation.js | pushField | L235-239 | （待补充） |  |
| plugins/dsh-extra-plan/lib/save-plan-validation.js | requireFile | L241-245 | （待补充） |  |
| plugins/dsh-extra-plan/lib/save-plan-validation.js | requirePoint | L247-253 | （待补充） |  |
| plugins/dsh-extra-plan/lib/save-plan-validation.js | validateIds | L466-477 | （待补充） |  |
| plugins/dsh-extra-plan/lib/save-plan-validation.js | isMarkdownWrapped | L479-490 | （待补充） |  |
| plugins/dsh-extra-plan/lib/save-plan-validation.js | pathIssue | L492-505 | （待补充） |  |
| plugins/dsh-extra-plan/lib/save-plan-validation.js | workdirIssue | L507-512 | （待补充） |  |
| plugins/dsh-extra-plan/lib/save-plan-validation.js | platformIsCaseInsensitive | L514-518 | （待补充） |  |
| plugins/dsh-extra-plan/lib/save-plan-validation.js | pathKey | L520-523 | （待补充） |  |
| plugins/dsh-extra-plan/lib/save-plan-validation.js | parseDependencies | L525-534 | （待补充） |  |
| plugins/dsh-extra-plan/lib/save-plan-validation.js | parseResources | L536-544 | （待补充） |  |
| plugins/dsh-extra-plan/lib/save-plan-validation.js | parseCheckRefs | L546-554 | （待补充） |  |
| plugins/dsh-extra-plan/lib/save-plan-validation.js | addPathDiagnostics | L556-561 | （待补充） |  |
| plugins/dsh-extra-plan/lib/save-plan-validation.js | validatePathSet | L563-577 | （待补充） |  |
| plugins/dsh-extra-plan/lib/save-plan-validation.js | validateResourceField | L579-587 | （待补充） |  |
| plugins/dsh-extra-plan/lib/save-plan-validation.js | validatePointIds | L589-597 | （待补充） |  |
| plugins/dsh-extra-plan/lib/save-plan-validation.js | validatePlanFileRecord | L599-644 | （待补充） |  |
| plugins/dsh-extra-plan/lib/save-plan-validation.js | validatePlanFileRecords | L646-651 | （待补充） |  |
| plugins/dsh-extra-plan/lib/save-plan-validation.js | validateAcceptanceFileRecord | L653-669 | （待补充） |  |
| plugins/dsh-extra-plan/lib/save-plan-validation.js | validateAcceptanceFileRecords | L670-675 | （待补充） |  |
| plugins/dsh-extra-plan/lib/save-plan-validation.js | validateTaskShape | L677-714 | （待补充） |  |
| plugins/dsh-extra-plan/lib/save-plan-validation.js | graphCycles | L716-737 | （待补充） |  |
| plugins/dsh-extra-plan/lib/save-plan-validation.js | visit | L721-734 | （待补充） |  |
| plugins/dsh-extra-plan/lib/save-plan-validation.js | groupSort | L739-743 | （待补充） |  |
| plugins/dsh-extra-plan/lib/save-plan-validation.js | firstTaskForGroup | L745-748 | （待补充） |  |
| plugins/dsh-extra-plan/lib/save-plan-validation.js | validatePlanRelations | L750-822 | （待补充） |  |
| plugins/dsh-extra-plan/lib/save-plan-validation.js | fileRecordKey | L824-826 | （待补充） |  |
| plugins/dsh-extra-plan/lib/save-plan-validation.js | pointIdSet | L828-830 | （待补充） |  |
| plugins/dsh-extra-plan/lib/save-plan-validation.js | equalStringSets | L832-836 | （待补充） |  |
| plugins/dsh-extra-plan/lib/save-plan-validation.js | validateFileRecordMapping | L838-860 | （待补充） |  |
| plugins/dsh-extra-plan/lib/save-plan-validation.js | validateCrossDocument | L862-887 | （待补充） |  |
| plugins/dsh-extra-plan/lib/save-plan-validation.js | validateClosure | L889-939 | （待补充） |  |
| plugins/dsh-extra-plan/lib/save-plan-validation.js | validateGlobal | L941-951 | （待补充） |  |
| plugins/dsh-extra-plan/lib/save-plan-validation.js | validateChecks | L953-1010 | （待补充） |  |
| plugins/dsh-extra-plan/lib/save-plan-validation.js | attachRefs | L988-1001 | （待补充） |  |
| plugins/dsh-extra-plan/lib/save-plan-validation.js | sortIds | L1012-1014 | （待补充） |  |
| plugins/dsh-extra-plan/lib/save-plan-validation.js | buildInternalOrder | L1016-1040 | （待补充） |  |
| plugins/dsh-extra-plan/lib/save-plan-validation.js | reviewGroupSort | L1042-1046 | （待补充） |  |
| plugins/dsh-extra-plan/lib/save-plan-validation.js | summarizeFileRecord | L1048-1069 | （待补充） |  |
| plugins/dsh-extra-plan/lib/save-plan-validation.js | buildSummary | L1071-1194 | （待补充） |  |
| plugins/dsh-extra-plan/lib/save-plan-validation.js | formatDiagnostic | L1196-1201 | （待补充） |  |
| plugins/dsh-extra-plan/lib/save-plan-validation.js | finalizeFailure | L1203-1209 | （待补充） |  |
| plugins/dsh-extra-plan/lib/save-plan-validation.js | validateSavePlanContract | L1211-1246 | （待补充） |  |
| plugins/dsh-extra-plan/lib/save-probe-validation.js | validateProbe | L8-107 | （待补充） |  |
| plugins/dsh-extra-plan/lib/save-probe-validation.js | probePathOf | L110-113 | （待补充） |  |
| plugins/dsh-extra-plan/lib/save-tool-factories.js | probeRefDecorationHint | L12-14 | （待补充） |  |
| plugins/dsh-extra-plan/lib/save-tool-factories.js | cwdOf | L17-21 | （待补充） |  |
| plugins/dsh-extra-plan/lib/save-tool-factories.js | resolveSaveContext | L24-34 | （待补充） |  |
| plugins/dsh-extra-plan/lib/save-tool-factories.js | canonicalRealpath | L38-43 | （待补充） |  |
| plugins/dsh-extra-plan/lib/save-tool-factories.js | sourceCacheKey | L47-50 | （待补充） |  |
| plugins/dsh-extra-plan/lib/save-tool-factories.js | pathInside | L52-55 | （待补充） |  |
| plugins/dsh-extra-plan/lib/save-tool-factories.js | lexicalExists | L57-62 | （待补充） |  |
| plugins/dsh-extra-plan/lib/save-tool-factories.js | nearestExistingParent | L64-74 | （待补充） |  |
| plugins/dsh-extra-plan/lib/save-tool-factories.js | resolveWorkspaceEntry | L76-101 | （待补充） |  |
| plugins/dsh-extra-plan/lib/save-tool-factories.js | strictTextEntry | L103-115 | （待补充） |  |
| plugins/dsh-extra-plan/lib/save-tool-factories.js | literalCount | L117-126 | （待补充） |  |
| plugins/dsh-extra-plan/lib/save-tool-factories.js | verifyModificationPoint | L128-145 | （待补充） |  |
| plugins/dsh-extra-plan/lib/save-tool-factories.js | verifyPlanSources | L147-183 | （待补充） |  |
| plugins/dsh-extra-plan/lib/save-tool-factories.js | verifyFile | L152-179 | （待补充） |  |
| plugins/dsh-extra-plan/lib/save-tool-factories.js | verifyProbeEvidenceRef | L185-198 | （待补充） |  |
| plugins/dsh-extra-plan/lib/save-tool-factories.js | createSaveToolFactories | L201-388 | （待补充） |  |
| plugins/dsh-extra-plan/lib/save-tool-factories.js | defineSavePlan | L202-272 | （待补充） |  |
| plugins/dsh-extra-plan/lib/save-tool-factories.js | render | L223-230 | （待补充） |  |
| plugins/dsh-extra-plan/lib/save-tool-factories.js | execute | L233-270 | （待补充） |  |
| plugins/dsh-extra-plan/lib/save-tool-factories.js | defineSaveProbe | L274-385 | （待补充） |  |
| plugins/dsh-extra-plan/lib/save-tool-factories.js | render | L362-364 | （待补充） |  |
| plugins/dsh-extra-plan/lib/save-tool-factories.js | execute | L367-383 | （待补充） |  |
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
| plugins/dsh-extra-plan/lib/settings.js | mountClientCarrier | L34-64 | （待补充） |  |
| plugins/dsh-extra-plan/lib/settings.js | schemaField | L67-73 | （待补充） |  |
| plugins/dsh-extra-plan/lib/settings.js | isLoopback | L82-85 | （待补充） |  |
| plugins/dsh-extra-plan/lib/settings.js | json | L87-90 | （待补充） |  |
| plugins/dsh-extra-plan/lib/settings.js | readJsonBody | L92-110 | （待补充） |  |
| plugins/dsh-extra-plan/lib/settings.js | plainJsonObject | L112-114 | （待补充） |  |
| plugins/dsh-extra-plan/lib/settings.js | activeSettingsRows | L120-125 | （待补充） |  |
| plugins/dsh-extra-plan/lib/settings.js | rowConfigOf | L127-133 | （待补充） |  |
| plugins/dsh-extra-plan/lib/settings.js | completeConfig | L135-145 | （待补充） |  |
| plugins/dsh-extra-plan/lib/settings.js | rowSummary | L147-159 | （待补充） |  |
| plugins/dsh-extra-plan/lib/settings.js | rawPatchInfo | L161-166 | （待补充） |  |
| plugins/dsh-extra-plan/lib/settings.js | inspectSettingsAuthority | L169-209 | （待补充） |  |
| plugins/dsh-extra-plan/lib/settings.js | findSettingsRow | L211-214 | （待补充） |  |
| plugins/dsh-extra-plan/lib/settings.js | readRawPatch | L216-218 | （待补充） |  |
| plugins/dsh-extra-plan/lib/settings.js | stableSnapshot | L221-238 | （待补充） |  |
| plugins/dsh-extra-plan/lib/settings.js | readUnifiedState | L243-279 | （待补充） |  |
| plugins/dsh-extra-plan/lib/settings.js | publicField | L281-295 | （待补充） |  |
| plugins/dsh-extra-plan/lib/settings.js | profileSyncPath | L297-307 | （待补充） |  |
| plugins/dsh-extra-plan/lib/settings.js | reportProfileSync | L309-321 | （待补充） |  |
| plugins/dsh-extra-plan/lib/settings.js | cacheProfileSync | L323-326 | （待补充） |  |
| plugins/dsh-extra-plan/lib/settings.js | cacheProfileSyncWithStale | L329-348 | （待补充） |  |
| plugins/dsh-extra-plan/lib/settings.js | requestProfileSync | L350-354 | （待补充） |  |
| plugins/dsh-extra-plan/lib/settings.js | proPayload | L356-374 | （待补充） |  |
| plugins/dsh-extra-plan/lib/settings.js | conflictProfileSync | L376-386 | （待补充） |  |
| plugins/dsh-extra-plan/lib/settings.js | createApiHandler | L388-464 | （待补充） |  |
| plugins/dsh-extra-plan/lib/settings.js | responseForProfile | L389-398 | （待补充） |  |
| plugins/dsh-extra-plan/lib/settings.js | apply | L466-572 | （待补充） |  |
| plugins/dsh-extra-plan/lib/settings.js | onResult | L472 | （待补充） |  |
| plugins/dsh-extra-plan/lib/settings.js | editorOf | L474-481 | （待补充） |  |
| plugins/dsh-extra-plan/lib/settings.js | documentPathOf | L482-490 | （待补充） |  |
| plugins/dsh-extra-plan/lib/settings.js | environmentSnapshot | L491 | （待补充） |  |
| plugins/dsh-extra-plan/lib/settings.js | conflictResult | L492-506 | （待补充） |  |
| plugins/dsh-extra-plan/lib/settings.js | syncEditor | L507-545 | （待补充） |  |
| plugins/dsh-extra-plan/lib/settings.js | settledSettings | L546-550 | （待补充） |  |
| plugins/dsh-extra-plan/lib/settings.js | settledError | L551-563 | （待补充） |  |
| plugins/dsh-extra-plan/lib/shell-mutation.js | commandTextOf | L36-48 | （待补充） |  |
| plugins/dsh-extra-plan/lib/shell-mutation.js | pwshCommandOf | L50 | （待补充） |  |
| plugins/dsh-extra-plan/lib/shell-mutation.js | bashCommandOf | L51 | （待补充） |  |
| plugins/dsh-extra-plan/lib/shell-mutation.js | shellWords | L56-80 | （待补充） |  |
| plugins/dsh-extra-plan/lib/shell-mutation.js | isInnerShellWord | L84-87 | （待补充） |  |
| plugins/dsh-extra-plan/lib/shell-mutation.js | isEnvAssignment | L88-90 | （待补充） |  |
| plugins/dsh-extra-plan/lib/shell-mutation.js | mutationTextMatches | L97-174 | （待补充） |  |
| plugins/dsh-extra-plan/lib/shell-mutation.js | mutationMatches | L176-179 | （待补充） |  |
| plugins/dsh-extra-plan/lib/shell-mutation.js | pwshMutationMatches | L181 | （待补充） |  |
| plugins/dsh-extra-plan/lib/shell-mutation.js | bashMutationMatches | L182 | （待补充） |  |
| plugins/dsh-extra-plan/lib/usage-ledger.js | lockPathOf | L10-12 | 从 active 路径派生固定的 .lock 路径。 | 锁名为 active + .lock。 |
| plugins/dsh-extra-plan/lib/usage-ledger.js | staleLockPathOf | L14-16 | 为释放流程生成同目录唯一临时路径，避免直接删除当前 owner 的 canonical lock。 | 仅供持 token 的 release 使用。 |
| plugins/dsh-extra-plan/lib/usage-ledger.js | errorCodeOf | L18-20 | 提取文件操作错误码供锁诊断与回滚分支使用。 |  |
| plugins/dsh-extra-plan/lib/usage-ledger.js | errorMessageOf | L22-24 | 将未知错误安全转换为诊断文本。 |  |
| plugins/dsh-extra-plan/lib/usage-ledger.js | validLockOwner | L26-31 | 校验锁 owner 的 PID、非空 token 与创建时间字段。 | owner JSON 合法性边界。 |
| plugins/dsh-extra-plan/lib/usage-ledger.js | readLockOwner | L33-40 | 读取并校验 lock JSON；失败只返回未知 owner，不改 canonical 文件。 |  |
| plugins/dsh-extra-plan/lib/usage-ledger.js | pidIsAlive | L42-53 | 只读诊断 owner PID 是否存活，供 stale-lock 结果判断。 | 不负责接管或删除锁。 |
| plugins/dsh-extra-plan/lib/usage-ledger.js | tryCreateLock | L55-126 | 以 wx 原子独占创建含 PID/token/createdAt 的锁；仅清理本次创建失败留下的自身文件。 | 已存在返回未取得，不触碰他者 lock。 |
| plugins/dsh-extra-plan/lib/usage-ledger.js | cleanupCreatedLock | L63-73 | 清理本次 tryCreateLock 自己成功创建但写入/关闭失败的 lock。 | 不用于 stale-lock 维护。 |
| plugins/dsh-extra-plan/lib/usage-ledger.js | decorateFailure | L74-90 | 把 close/清理失败和残留路径补入锁创建错误诊断。 |  |
| plugins/dsh-extra-plan/lib/usage-ledger.js | sleepSync | L128-130 | 以有界 Atomics.wait 实现跨进程短等，不形成无界等待。 |  |
| plugins/dsh-extra-plan/lib/usage-ledger.js | usageLedgerLockPath | L132-134 | 导出 active 对应的 lock 路径，供统计/归档诊断。 | public lock API。 |
| plugins/dsh-extra-plan/lib/usage-ledger.js | acquireUsageLedgerLock | L136-160 | 导出有界原子加锁：返回 owner/token，超时返回 timeout；检测到死 PID 返回 stale-lock，canonical lock 原样保留。 | 活 PID 不强删；stale 需确认 owner 后显式维护。 |
| plugins/dsh-extra-plan/lib/usage-ledger.js | releaseUsageLedgerLock | L162-188 | 核对 token 后把自己的 lock 原子移到唯一临时路径再删除，避免误释他者 lock；失败返回明确 released:false/reason。 | public release API；调用方不得静默成功。 |
| plugins/dsh-extra-plan/lib/usage-ledger.js | createUsageLedger | L190-455 | 按 enabled/path 建立同步 V2 fold、共享锁、cursor 与单 session 回收，返回 foldUsage 与 disposeSession。 | cursor 路径为 ledgerPath + .cursor.json；被 index.js 的 usageLedger 配置调用。 |
| plugins/dsh-extra-plan/lib/usage-ledger.js | readUsageCursorTable | L221-251 | 读取 cursor JSON 并返回 {ok, table}：ENOENT 按空表，其余读取/解析/形状错误降级并一次告警。 | createUsageLedger 内部闭包；降级保留原始 cursor 字节。 |
| plugins/dsh-extra-plan/lib/usage-ledger.js | warnUsageCursorDegraded | L254-258 | 对 cursor 读取/形状降级发出每实例一次告警。 | createUsageLedger 内部闭包。 |
| plugins/dsh-extra-plan/lib/usage-ledger.js | warnStaleLock | L260-268 | 对每个 writer 实例的 stale-lock 首次阻塞发出一次可见 owner(PID/token)告警；不接管、不删除 canonical lock，要求核实 owner 后显式维护。 | createUsageLedger 内部闭包。 |
| plugins/dsh-extra-plan/lib/usage-ledger.js | usageCursorEntryOf | L272-280 | 只接受单会话 V2 cursor 的 {seq,index} 非负整数形状；数字旧项及其它形状一律无效并回退。 | createUsageLedger 内部闭包。 |
| plugins/dsh-extra-plan/lib/usage-ledger.js | isUsageContext | L282-290 | 校验 session/parent/root/preset/depth/role 类型与必填边界；rootSessionId、agentPreset 可为空字符串，只有非法 context 被拒绝。 | foldUsage 内部闭包；非法 context 不落账。 |
| plugins/dsh-extra-plan/lib/usage-ledger.js | foldUsage | L298-452 | 在共享锁临界区按 session.seq/snapshotEvents 增量或回退全量扫描 assistant/message；只写固定15键的 schemaVersion=2 行、身份血缘、provider/model 与四桶，append 成功后推进 cursor。 | createUsageLedger 内部闭包；合法空 root/preset 落账，锁忙/timeout 静默返回 delayed 且零推进、后续 fold 补记；stale 每实例一次告警并由维护者核实 owner 后显式维护；release 失败返回 failed/release-failed 且不伪装回滚已提交写入。 |
| plugins/dsh-extra-plan/scripts/generate-runtime-defaults.mjs | roleDefinitionFile | L37-39 | （待补充） |  |
| plugins/dsh-extra-plan/scripts/generate-runtime-defaults.mjs | runtimeDefaultsFromTemplate | L41-46 | （待补充） |  |
| plugins/dsh-extra-plan/scripts/generate-runtime-defaults.mjs | renderRuntimeDefaults | L48-58 | （待补充） |  |
| plugins/dsh-extra-plan/scripts/generate-runtime-defaults.mjs | clientFieldMetadata | L64-77 | （待补充） |  |
| plugins/dsh-extra-plan/scripts/generate-runtime-defaults.mjs | clientFieldLines | L79-85 | （待补充） |  |
| plugins/dsh-extra-plan/scripts/generate-runtime-defaults.mjs | renderClientFieldBlock | L87-98 | （待补充） |  |
| plugins/dsh-extra-plan/scripts/generate-runtime-defaults.mjs | markerMatches | L100-103 | （待补充） |  |
| plugins/dsh-extra-plan/scripts/generate-runtime-defaults.mjs | clientFieldMarkerRange | L105-113 | （待补充） |  |
| plugins/dsh-extra-plan/scripts/generate-runtime-defaults.mjs | renderClientFields | L115-120 | （待补充） |  |
| plugins/dsh-extra-plan/scripts/generate-runtime-defaults.mjs | separatorIndexOf | L125-127 | （待补充） |  |
| plugins/dsh-extra-plan/scripts/generate-runtime-defaults.mjs | topLevelRowsOf | L130-140 | （待补充） |  |
| plugins/dsh-extra-plan/scripts/generate-runtime-defaults.mjs | secondDocumentOf | L143-148 | （待补充） |  |
| plugins/dsh-extra-plan/scripts/generate-runtime-defaults.mjs | indentBlock | L150-153 | （待补充） |  |
| plugins/dsh-extra-plan/scripts/generate-runtime-defaults.mjs | indentOf | L155-159 | （待补充） |  |
| plugins/dsh-extra-plan/scripts/generate-runtime-defaults.mjs | shiftBlock | L161-169 | （待补充） |  |
| plugins/dsh-extra-plan/scripts/generate-runtime-defaults.mjs | rawBlockFrom | L175-186 | （待补充） |  |
| plugins/dsh-extra-plan/scripts/generate-runtime-defaults.mjs | quoteYamlSingle | L188-190 | （待补充） |  |
| plugins/dsh-extra-plan/scripts/generate-runtime-defaults.mjs | assertDefinition | L192-200 | （待补充） |  |
| plugins/dsh-extra-plan/scripts/generate-runtime-defaults.mjs | renderPresetDefinition | L202-221 | （待补充） |  |
| plugins/dsh-extra-plan/scripts/generate-runtime-defaults.mjs | mainExtraPlanRowBlock | L224-235 | （待补充） |  |
| plugins/dsh-extra-plan/scripts/generate-runtime-defaults.mjs | personaPrefixBlock | L238-264 | （待补充） |  |
| plugins/dsh-extra-plan/scripts/generate-runtime-defaults.mjs | roleToolsBlock | L267-278 | （待补充） |  |
| plugins/dsh-extra-plan/scripts/generate-runtime-defaults.mjs | findRowById | L281-292 | （待补充） |  |
| plugins/dsh-extra-plan/scripts/generate-runtime-defaults.mjs | mainToolPresentationMode | L298-310 | （待补充） |  |
| plugins/dsh-extra-plan/scripts/generate-runtime-defaults.mjs | assertRoleSource | L312-332 | （待补充） |  |
| plugins/dsh-extra-plan/scripts/generate-runtime-defaults.mjs | assertRoleDefinition | L334-353 | （待补充） |  |
| plugins/dsh-extra-plan/scripts/generate-runtime-defaults.mjs | renderRoleDefinitions | L360-406 | （待补充） |  |
| plugins/dsh-extra-plan/scripts/generate-runtime-defaults.mjs | assertParses | L408-416 | （待补充） |  |
| plugins/dsh-extra-plan/scripts/generate-runtime-defaults.mjs | checkOutput | L418-422 | （待补充） |  |
| plugins/dsh-extra-plan/scripts/generate-runtime-defaults.mjs | publishFsOpsOf | L427-430 | （待补充） |  |
| plugins/dsh-extra-plan/scripts/generate-runtime-defaults.mjs | errorText | L432-434 | （待补充） |  |
| plugins/dsh-extra-plan/scripts/generate-runtime-defaults.mjs | uniquePaths | L436-438 | （待补充） |  |
| plugins/dsh-extra-plan/scripts/generate-runtime-defaults.mjs | cleanupPublishFiles | L440-450 | （待补充） |  |
| plugins/dsh-extra-plan/scripts/generate-runtime-defaults.mjs | restorePublishedEntry | L452-465 | （待补充） |  |
| plugins/dsh-extra-plan/scripts/generate-runtime-defaults.mjs | publishFailure | L467-479 | （待补充） |  |
| plugins/dsh-extra-plan/scripts/generate-runtime-defaults.mjs | normalizedOutputEntries | L481-490 | （待补充） |  |
| plugins/dsh-extra-plan/scripts/generate-runtime-defaults.mjs | publishGeneratedOutputs | L492-554 | （待补充） |  |
| plugins/dsh-extra-plan/scripts/generate-runtime-defaults.mjs | generateRuntimeDefaults | L562-628 | （待补充） |  |
| plugins/dsh-extra-plan/scripts/generate-runtime-defaults.mjs | invokedAsMain | L630-633 | （待补充） |  |

---

*本文件由脚本增量维护；直接编辑功能描述/备注列是安全的。*
