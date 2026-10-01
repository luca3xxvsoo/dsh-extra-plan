# 代码地图（dsh-extra-plan）

> **维护分工**：行号区间/增删行由脚本 node pe-test/tools/代码地图生成.mjs 增量同步；**功能描述、备注、以及「意图速查」整节由 AI/人维护**（脚本刷新不会覆盖）。
> **用法**：先看「意图速查」按意图词找函数名 → 再到「函数索引」按函数名取行号区间 → read 该区间。
> 上次同步：2026-10-01 14:44:58（脚本自动更新时间戳行）

## 意图速查（人工维护：意图词 → 函数名；行号请到下方「函数索引」按函数名取）

> 用法：拿用户/AI 口里的词在「想找什么」列 grep → 得函数名 → 到「函数索引」grep 该函数名 → 取行号区间 → read 该区间。
> 本节引用的函数名若不存在于索引，生成脚本会报 `[导航失效]`（防止入口过期）。

| 想找什么（含同义词/英文标识） | 文件 | 函数名 |
|:--|:--|:--|
| 四级闸门／路由确认／目的确认／批准／流程状态（route/purpose/clarified/approved；路由 ask 标准流程两问、机械层至少两问——第一问固定三选一、第 2 问起纯文本「补充要求」不得带非空 options；目的 ask 仍单问） | index.js | deriveFlowState、mainGateReason、routeDenyReason、gateAskDenyReason、validateGateAskStructure、matchPurposeLabel |
| 探查预算／额度／剩余次数／耗尽（exploreBudget/budget；剩余 ≤3 注入的提醒消息 source 用生产者自有 kind `plugin:@local/dsh-extra-plan`——v4 行准入禁旧包裹 `plugin`） | plugins/dsh-extra-plan/lib/planner-budget.js、index.js | toolCallCount、toolCallsSinceUser、withPlannerPromptSuffix、budgetNoticeText、budgetReminderText、budgetReminderMessage、budgetReminderSent、budgetExhaustedReason、budgetExceeded |
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
| 方案/询问工具在未确认路由下的拒绝文案（plan route） | index.js | planDenyReason |
| 批准前禁委派（approval deny） | index.js | approvalDenyReason |
| 规划子代理分支闸门（planner 写禁+预算） | index.js | plannerGateReason、shellMutationReason |
| 会话事件快照/子代理角色识别／单次快照复用（execEvents）／planner descriptor 缓存／events 可选入参 | lib/agent-session.js、lib/agent-runtime.js、index.js | sessionEvents、isSubagentChild、isLiveDelegation、childPolicyNeedsFloor、createAgentRuntime、isChild、isPlannerChild、toolSchemasOf、usageRoleOf、childBaseline |
| 会话状态生命周期／disposed 收尾／末轮 usage 结算／usage 账本续载／可信用量字段（provider/cw/rs）（session 分桶、final flush、cursor 降级、session.seq 水位 + snapshotEvents(from,to) 区间增量、水位未变直接返回、截断回退全量） | index.js、lib/agent-runtime.js | foldUsage、readUsageCursorTable、warnUsageCursorDegraded、usageCursorEntryOf、usageRoleOf、noteRunCodeSubCall、childBaseline |
| 方案与验收落盘／save_plan 双写（plan/checklist；主会话侧任意路由态放行的受限规划工件，仅写 cwd/.extra-plan） | lib/save-tool-factories.js、lib/save-contract.js、index.js | defineSavePlan、registerSavePlan、saveArtifactBase、savePlanBase |
| 落盘原子提交／journal 崩溃自愈（atomic/commit） | lib/save-persistence.js、index.js | atomicCommit、recoverJournals |
| 线索落盘／save_probe／证据报告（probe/evidence；限制值唯一来自 `save-contract.js#PROBE_LIMITS`；step-00 PR23/PR34/PR35 回归；主会话侧放行条件保持现状——route=plan + 目的已定 + 澄清完成；extractProbeEvidenceRefs 顺序固定：整体成对剥除（循环）→ 按顿号/分号/竖线拆分 → 逐段成对剥除 + trim → 过滤空串 → 去重；拆分符与剥除集均不含空格、半角逗号、`.`、`/`，单侧一律不剥） | lib/save-contract.js、lib/save-probe-validation.js、lib/save-tool-factories.js、index.js | validateProbe、renderProbeMarkdown、extractProbeEvidenceRefs |
| save 合同／限制值／ContentBlock 渲染（统一 artifact base：sessionTag/毫秒/pid/序号；PROBE_LIMITS、LINE_FORMAT_HINT、RANGE_FORMAT_HINT 与渲染合同） | lib/save-contract.js | sanitizeTaskName、timestamp、sessionTagOf、saveArtifactBase、savePlanBase、renderSavePlan、renderProbeMarkdown、renderSaveProbe、extractProbeEvidenceRefs |
| save_probe 校验／路径存在性与聚合拒绝 | lib/save-probe-validation.js | validateProbe、probePathOf |
| save 工具显式依赖工厂 | lib/save-tool-factories.js | createSaveToolFactories、defineSavePlan、defineSaveProbe |
| PTC F→L／native-both HN-HB 实机取证 | pe-test/docs/ai-实机闸门测试流程.md |  |
| 实机子代理模型／提供方／planner 引导取证（A42/A43、C11/C12、HUMAN；显式 SESSION_ID + PLANNER_PROMPT_SUFFIX；request/header attempted route（尝试路由） 与 assistant/message actual provenance（实际来源） 分栏；suffix 等级与完整文本；两阶段头扫描 `headerOfDir` 只解析命中直接 child、事件不保留 raw，默认堆可跑通） | pe-test/tools/step-07-子代理模型与引导取证.mjs |  |
| 120格 A/C/M/F-L 路由与目录断言／显式 header catalog 取证 | pe-test/tools/step-04-路由与写闸门.mjs、pe-test/tools/step-04-工具清单查看.mjs |  |
| 探查者委派／禁止 planner 派探查（subagent_probe） | index.js、plugins/dsh-extra-plan/lib/model-routing.js | subagentProbeGateReason、resolveOtherAgentEntry |
| 只读子代理／验收者只读（reviewer/readonly） | index.js | childReadonlyGateReason、shellMutationReason、isReadOnlyChildByCatalog |
| 子代理沙箱下限／权限抬升（floor/sandbox） | lib/agent-runtime.js、index.js | childPolicyNeedsFloor、createAgentRuntime |
| 工具目录折叠／PTC 单入口（catalog/ptc） | index.js | catalogIsCollapsed |
| 设置后端半段／权威值上移 settings 行 + 声明行投影／configEditor.edit 写链（settings 行 10 项 volatile Config = 权威值唯一落点 · PUT 仅投影声明行子行） | lib/settings.js、lib/preset-settings.js、lib/preset-sync.js | apply、createApiHandler、proPayload、readHostRowState、findSettingsRow、effectivePluginsOf、effectiveRowConfig、restatePresetPlugins、restatePluginsRow、findPluginsRow、applyPlan |
| 设置值行定位与捕获（sourceLocator/rowLocator/projectionLocator；group 8+2；PUT 仅投影，HTTP 200 + applied 领域回执） | lib/preset-settings.js、lib/settings.js | captureSettings、captureRowSettings、effectivePluginsOf、hostRowDefaultsFromTemplate、readProjectedValue、resolveSetting、findTextLocatorMatches、patchYamlScalar、serializeScalar、publicField |
| 配置热读／生效标志／后端权威行更新无需重启（live-config/hot-read；增强 stamp dev/ino/size/mtimeNs/ctimeNs，兼容回退 ino/size/mtimeMs/ctimeMs） | plugins/dsh-extra-plan/lib/live-config.js、plugins/dsh-extra-plan/index.js | createLiveConfig、refresh、read、currentPath、readDiskValues、statStamp、pick、modeOr |
| 预设声明行载体／启动自愈／三维判定（声明行覆盖 + 本体剥离比对 + 投影一致性；无 manifest（清单）/旧迁移链） | lib/preset-sync.js、lib/preset-settings.js | syncPreset、readAuthoritySettings、hostRowDefaultsFromTemplate、planHostRowProjection、effectivePluginsOf、effectiveRowConfig、restatePresetPlugins、declarationCoversAsset、declarationBodyMatchesAsset、stripUserWritable、carryUserWritable、assetPlugins、pluginRowIds、readDeclaredPluginsFromPatch、defaultDshHome、applyPlan |
| 共享客户端表单／0.2 独立 tab 移除／legacy keyed row 条件接线（宿主 slot 缺失走后备路径；settings 后端仍活动） | lib/client.js | apply、SettingsCard、ExtraPlanForm、Legacy017SettingsCard、registerLegacy017RowConfig |
> client.js 设置入口定位：`LEGACY_017_ROW_CONFIG_KEY` L412；`Legacy017SettingsCard` L414-L416；`registerLegacy017RowConfig` L418-L427；唯一 `configForms.whileServed` legacy effect L429。0.2 独立 `settings.plugins.tab` 不注册，legacy keyed row 是否呈现取决于宿主 slot，缺失时走后备路径。
| 执行者工具裁剪／deny（executor-spawn；注册引用计数幂等 = 稳定键幂等——槽键 = 服务实现本体（读全局注册符号 Symbol.for('cordis.original')，取不到时降级回代理本身），跨预设世代/行重建共享同一注册与 disposer） | lib/executor-spawn.js | apply、slotKey |
| qqbot 兼容自愈／建链 | dsh-qqbot-user-questions/lib/heal.js（选装包，本机未安装） | healQqbotCompatibility、ensureDshExtraPlanLink |
| YAML 默认值真源／生成／last-known-good（上次已知良好版本）（exploreBudget/plannerPromptSuffix）＋预设声明行产物生成（preset-patch.generated.yml 的 insert 行 · 顶层条目按 PLUGINS_INDENT 平移 · --check 比对） | lib/preset-settings.js、scripts/generate-runtime-defaults.mjs、lib/preset-defaults.generated.js | resolveTemplateSettingDefault、renderRuntimeDefaults、renderPresetPatch、topLevelRowsOf、generateRuntimeDefaults、indentBlock、quoteYamlSingle、assertParses、writeOrCheck |
| 闸门关键词单一来源／7 词唯一手工编辑位／prompt variable 注册／旧词拒绝／严格校验（gateWords/extra_plan_*） | plugins/dsh-extra-plan/assets/presets/extra-plan/agent.cordis.yml、plugins/dsh-extra-plan/lib/gate-words.js、index.js | validateGateWords、createGateRuntime、normalizeGateLabel、matchExactKind、deriveFlowState、mainGateReason |
| gateWords 启动自愈兜底／厂商模板整组校验／声明行现值 carry（无跨版本迁移） | plugins/dsh-extra-plan/lib/preset-sync.js | syncPreset、restatePresetPlugins、captureGateWords、assertTemplateGateWords |
| runtime-static 纯 helper（cause-chain） | lib/runtime-static.js | causeChainOf |
| PTC 拒绝中文呈现／post-execute 失败结果改写／denied 判别（闸门拒绝不重置路由、取消仍清四字段；HOST_ASK_CANCEL_TEXTS 宿主取消句） | index.js | parseAskResultData、parseDispatchAskResult、askResultTextIsDenied、firstTextOfBlocks、deriveFlowState、recordRunCodeDeny |
| 代码地图自身维护／口径／严格模式 | pe-test/tools/代码地图生成.mjs（不在索引范围，读文件头注释） |  |
| 新载体选型与 isolate 审计（预设声明行／必要+保险隔离名单／LocalRealm vs GlobalRealm／三组 isolate 名单：extra-plan-group.extraPlan · compaction.compaction+toolResultPruner · delegation.workflowEngine+subagentModelSelection） | plugins/dsh-extra-plan/assets/presets/extra-plan/agent.cordis.yml、plugins/dsh-extra-plan/assets/presets/extra-plan/preset-patch.generated.yml、README.md（READAI.md「新载体」节） |  |
| 创造 skill 静态注册／customSkillDirs／C=0 与 C=1 的 catalog 语义（skill-filesystem 行的 config.customSkillDirs 指向 agent-preset 包内 skills/；「不注册」已改为 catalog 隐藏） | plugins/dsh-extra-plan/assets/presets/extra-plan/agent.cordis.yml、plugins/dsh-extra-plan/lib/assembly-presentation.js、plugins/dsh-extra-plan/index.js | shouldHideCreativeCatalog、projectSkillCatalogDecision、skillCatalogEntriesOf、renderSkillCatalogText |
| 0.1.7 服务名换代／ptcRuntime／SDK renderer 语言取值 | plugins/dsh-extra-plan/index.js、plugins/dsh-extra-plan/lib/assembly-presentation.js | apply、resolveToolsSdkRenderer、renderFilteredToolsSdk、sdkSchemasForRendering |
| tool-jobs 完成通知解锁（source.kind=tool-jobs 且 form=notice → 正文 /background job (\S+)/ 解析 jobId → 双动作：①只清该 jobId 的 job_output 计数（若被跟踪，删除幂等）②job_list/list_agents 轮询守卫 pollGuardCounters 清整表；consumed 标记与 job_output 跟踪命中解耦——通知首次被消费即标记，防重复动作；HK9：旧 plugin kind 已废） | plugins/dsh-extra-plan/index.js | apply、recordJobOutputCall、jobOutputGateReason、pollGuardGateReason |
| agent/created 钩子（serial；agent/session-start 已删除）／会话启动基线＋save_plan/save_probe 注册，整块吞错不阻断会话创建 | plugins/dsh-extra-plan/index.js（agent/created 调用点）、plugins/dsh-extra-plan/lib/agent-runtime.js（childBaseline/isPlannerChild 定义）、plugins/dsh-extra-plan/lib/agent-session.js（isSubagentChild 定义） | apply、childBaseline、isPlannerChild、isSubagentChild、registerSavePlan、registerSaveProbe、probeClaimFor |
| MALFORMED_RESPONSE 限次自愈／请求失败兜底 retry／注入模型可读提示（source.kind 用生产者自有 `plugin:@local/dsh-extra-plan`；developer/message 须自带 ≥1 的 turn/step，宿主 append 不补坐标；坐标缺失/非正整数 → 不注入但仍返回 retry） | index.js | malformedRecovery、recordRequestError |
| 会话日志格式 v4 代际／session.v4.jsonl.zstd／三代候选名并存（v4/v3/旧名，未知形状归 v0） | pe-test/_shared/session-finder.mjs、pe-test/tools/step-07-子代理模型与引导取证.mjs |  |

> QQBot 环境验证：`pe-test/tools/step-01-qqbot-环境验证.mjs` 的 `buildPreflight`（五条件/缺失码）、`probeJunctionCapability` 与 `runJunctionFixture`（能力探针/临时 fixture（夹具））、`runLiveReadonly` 与 `inspectMapping`（真实 profile patch/映射只读对拍）；该测试工具不在插件源码生成根，函数行号不手填。

## 文件总览

| 文件 | 行数 | 说明 |
|:--|--:|:--|
| plugins/dsh-extra-plan/index.js | 2225 | 核心入口：四级闸门、预算、save 工具注册与生命周期；接线 planner/非 planner 路由、A/C/M 投影、P2-2 cache、session 分桶 usage final fold、v4 MALFORMED 自愈。gateWords 只来自 YAML，apply 先校验再副作用。 |
| plugins/dsh-extra-plan/lib/agent-runtime.js | 109 | 每次 apply 的角色识别、descriptor/工具 schema 缓存、usage role baseline 与 sandbox floor 工厂；不 import index.js |
| plugins/dsh-extra-plan/lib/agent-session.js | 32 | 会话事件与子代理识别的唯一来源：sessionEvents/isSubagentChild 零依赖纯函数，被 index.js 与 lib/model-routing.js 共用（无镜像副本；不 import index.js） |
| plugins/dsh-extra-plan/lib/assembly-presentation.js | 241 | A/C/M 与 skill catalog 模型可见投影；从 scoped tools 读 schema/模式，SDK renderer 按 language 整体重建；F/PTC 的 tool:read 由 index.js 手写，L 段回宿主原文。 |
| plugins/dsh-extra-plan/lib/client-bridge.js | 7 | 客户端桥接壳：仅承载 dsh.client 加载路径指向 lib/client.js（apply 空实现） |
| plugins/dsh-extra-plan/lib/client.js | 437 | 客户端模块加载共享样式/词条与共享 SettingsCard/ExtraPlanForm；0.2 独立 `settings.plugins.tab` 不注册，唯一 legacy keyed row 仅在宿主提供对应 slot 时呈现，slot 缺失时走宿主后备路径；后端 settings API/Config/投影链独立活动。 |
| plugins/dsh-extra-plan/lib/executor-spawn.js | 132 | 执行者子代理 provider：委托宿主 spawn，注入工具 deny（防委派递归/追问）；registerProvider 走引用计数幂等（**稳定键幂等**：模块级 WeakMap 槽表的槽键 = subagents 服务实现本体——读全局注册符号 Symbol.for('cordis.original')，由 traceable 代理 get 拦截器返回 target，root 单例跨预设世代恒同一对象；取不到符号值时降级回代理本身；跨预设世代/行重建复用同一注册，归零才反注册） |
| plugins/dsh-extra-plan/lib/gate-words.js | 114 | 闸门关键词共享契约（唯一值源是 YAML 的 config.gateWords）：字段规格 GATE_WORD_FIELDS/GATE_WORDS_GROUP_DEFINITION + 整组严格校验 validateGateWords（错误一律以 extra-plan: config.gateWords 开头）+ 运行时词表 createGateRuntime（无参默认值）；纯模块：不含任何出厂词值、不读文件与环境变量，被 index.js（运行时）与 lib/preset-sync.js（启动自愈）共享（迁移叶 locator 已随跨版本搬迁链删除） |
| plugins/dsh-extra-plan/lib/live-config.js | 255 | 配置热读：8 项热读 + 2 项宿主行权威读口；构造期读盘一次，后续按增强 stamp（dev/ino/size/mtimeNs/ctimeNs，兼容 ino/size/mtimeMs/ctimeMs）重读；失败整组回退并告警，不读 DSH_HOME 旧目录 |
| plugins/dsh-extra-plan/lib/model-routing.js | 542 | planner/非 planner 子代理模型路由：顶层纯判定函数 + createModelRouting per-apply 工厂（per-instance WeakMap、惰性 llm/agents getter；不 import index.js） |
| plugins/dsh-extra-plan/lib/planner-budget.js | 137 | planner 工具计数、消息后缀/预算提示/耗尽文案；**预算提醒消息经宿主 createUserMessage 构造，source 用生产者自有 kind `plugin:@local/dsh-extra-plan`（v4 行准入禁旧包裹 `plugin`，违者会话当场终止）**；默认预算由生成模块提供，FREE_TOOLS 仍在根入口 |
| plugins/dsh-extra-plan/lib/preset-defaults.generated.js | 4 | 由 YAML 模板生成的 runtime fallback（回退） 常量；generated（生成）/do not edit（勿手改） |
| plugins/dsh-extra-plan/lib/preset-settings.js | 582 | 10 项设置描述与 YAML 定位；settings 行是权威值，声明行只投影 2 项宿主行；capture/投影读取、plugins 行整体重述与保格式标量改写。 |
| plugins/dsh-extra-plan/lib/preset-sync.js | 538 | profile patch 启动自愈：声明覆盖、剥离后的本体一致、宿主行投影一致三条件才 idle；否则以资产重建并 carry 用户值，写盘只经 `configEditor.edit`，无运行期台账。 |
| plugins/dsh-extra-plan/lib/run-code-static.js | 803 | run_code 纯静态解析/理由模块：安全 JSON/JS literal 解析、动态 argsText 瀑布兜底、写模式 hint、工具组拆解、ask 返回值白名单、调用点计数与双兼容 dispatch cap；仅显式注入普通依赖，不持有宿主状态。 |
| plugins/dsh-extra-plan/lib/runtime-static.js | 15 | 显式参数纯 helper：SKILL frontmatter 与 cause 链解析；不持有宿主状态 |
| plugins/dsh-extra-plan/lib/save-contract.js | 196 | save 合同唯一真源：任务名/sessionTag/base、PROBE_LIMITS、ContentBlock/Markdown 渲染与证据引用清洗；无宿主状态，限制值只在本文件维护。 |
| plugins/dsh-extra-plan/lib/save-persistence.js | 85 | 阶段感知公共原子落盘与 journal 自愈：tmp→journal→rename→逐项确认目标就位→清 journal；pre-journal 条件清理（先删 journal 并确认不存在才清 tmp）、post-journal 一律保留 journal 与现场、全目标确认后才删 journal；恢复逐项确认目标存在、全项就位才清 journal，形状非法/目标缺失保留 journal 并告警；按 sessionTag 过滤；末位可选 fs 依赖默认同义映射 node:fs（冻结只读、未提供项回退默认） |
| plugins/dsh-extra-plan/lib/save-probe-validation.js | 113 | save_probe 参数校验：数组/条目/长度/总量/path 存在性/range/evidence 聚合拒绝 |
| plugins/dsh-extra-plan/lib/save-tool-factories.js | 203 | 显式依赖工厂：定义 save_plan/save_probe schema/output/render/execute；证据引用报错以 JSON.stringify(ref) 呈现（首字符属装饰集时附「疑似含 Markdown 装饰」提示）；不缓存 ctx/agent/会话状态 |
| plugins/dsh-extra-plan/lib/sdk-text-cache.js | 161 | apply 级 agent-keyed WeakMap SDK 文本缓存：完整 renderer 输入保守指纹、language/renderer 身份比较、并发 Promise 合并、reject/过期 Promise 不回写、dispose 回收；不持有 sessionId 或 PromptAssembly |
| plugins/dsh-extra-plan/lib/settings.js | 270 | 10 字段 volatile Config、页面策略与 loopback GET/PUT；权威值在 settings 行，PUT 仅投影声明行，no-op 不写盘，GET 按权威值→投影→默认回退。 |
| plugins/dsh-extra-plan/lib/shell-mutation.js | 82 | 跨平台命令文本解码与 pwsh/bash 写形态判定；纯函数、不持有 apply 状态 |
| plugins/dsh-extra-plan/scripts/generate-runtime-defaults.mjs | 155 | 从 agent.cordis.yml 校验并生成 runtime 默认常量 + preset-patch.generated.yml 预设声明行（顶层条目逐字平移）；支持 --check 且坏源不覆盖 last-known-good（上次已知良好版本） |
| plugins/dsh-qqbot-user-questions/index.js | 20 | qqbot 精简版自愈插件：apply 启动时调 healQqbotCompatibility（迁移旧错误块+建链），不阻断启动 |
| plugins/dsh-qqbot-user-questions/lib/heal.js | 371 | 自愈纯函数模块（定位 profile/旧块迁移/建链；供 index.js/CLI/测试复用） |
| plugins/dsh-qqbot-user-questions/scripts/heal.mjs | 26 | CLI 兜底入口（postinstall/手动触发；invokedAsMain 判定） |

## 函数索引

| 文件 | 函数 | 行号 | 功能描述 | 备注 |
|:--|:--|:--|:--|:--|
| plugins/dsh-extra-plan/index.js | purposeRouteDenyReason | L24-26 | 精确目的 ask 在非 plan 路由下的固定路由确认拒绝文案（文案由本次 apply 的 gateRuntime.confirm.route / options.purpose 插值） |  |
| plugins/dsh-extra-plan/index.js | routeDenyReason | L29-34 | 路由未确认时 write/edit/写shell 的拒绝文案（提示先做路由确认）；文案由本次 apply 的 gateRuntime.confirm.route 插值（helper 显式收 gateRuntime，无默认词表） |  |
| plugins/dsh-extra-plan/index.js | planDenyReason | L35-46 | plan 路由下 save_probe/subagent_plan 前置条件未满足的拒绝文案（直行态提示与确认句均由 gateRuntime 词值/文案插值） |  |
| plugins/dsh-extra-plan/index.js | approvalDenyReason | L47-49 | 批准前禁止执行委派类工具（subagent/workflow/ralph）拒绝文案 |  |
| plugins/dsh-extra-plan/index.js | isDispatchStart | L57 | 当前 PTC dispatch-start 事件判定 |  |
| plugins/dsh-extra-plan/index.js | isDispatch | L58 | 当前 PTC dispatch 事件判定 |  |
| plugins/dsh-extra-plan/index.js | isBootstrapPhase | L78-88 | anchored 引导阶段判定（首个工具调用前） |  |
| plugins/dsh-extra-plan/index.js | labelsOfCallData | L95-111 | 从 ask 调用数据提取选项 label 集合 |  |
| plugins/dsh-extra-plan/index.js | normalizeLabel | L122-124 | label 规范化（空白清理） |  |
| plugins/dsh-extra-plan/index.js | isExactGateSet | L127-134 | label 集合与本次 gateRuntime 的 route/approval/purpose 集合完全一致判定（归一后精确比较，集合为运行时词表） |  |
| plugins/dsh-extra-plan/index.js | isPartialGateSet | L137-145 | label 与闸门词部分包含判定（indexOf 子串）：只用于 malformed ask 教学文案，绝不用于推进 route/purpose/approved |  |
| plugins/dsh-extra-plan/index.js | categorizeGateAsk | L148-152 | ask 分类（standard/malformed/ordinary）；三套词集来自入参 gateRuntime；partial 子串判断只服务当前词的 malformed 教学拒绝，不推进状态 |  |
| plugins/dsh-extra-plan/index.js | gateAskDenyReason | L155-191 | 生成标准闸门 ask 选项/结构错误的拒绝理由；模板与缺项均按当前 gateRuntime 词值插值（出厂值下与历史逐字相同） |  |
| plugins/dsh-extra-plan/index.js | validateGateAskStructure | L197-224 | 校验路由/目的/批准 ask 结构（选项文案由入参 gateRuntime 插值）（问题数、固定选项）：路由与批准均须 ≥2 问、第 2 问起不得带非空 options（路由第二问「补充要求」、批准第二问「修改意见」，均须纯文本）；目的 ask 仍须恰好 1 问 |  |
| plugins/dsh-extra-plan/index.js | askKindOf | L231-248 | 从 label 判定 ask 类型（route/approve/purpose）；词值来自入参 gateRuntime（测试契约 API，仅经 decisions 导出） |  |
| plugins/dsh-extra-plan/index.js | askKindOfRelaxed | L255-271 | 宽松判定 ask 类型（特异性词优先：路由→批准→仅共享否决词→目的→澄清）；词值来自入参 gateRuntime（本函数只做分类，不推进状态） |  |
| plugins/dsh-extra-plan/index.js | matchExactKind | L276-284 | 三类 match 的唯一判定内核：标签先按白名单推荐后缀归一（normalizeLabel）再与当前 gateRuntime 词值精确相等才返回内部枚举；禁止 indexOf 子串推进 route/purpose/approved |  |
| plugins/dsh-extra-plan/index.js | matchRouteLabel | L286-293 | 用户选择标签→direct/plan/disagree；仅「推荐后缀归一后精确等于当前 gateRuntime 词值」才返回枚举（matchExactKind 内核，禁止 indexOf） |  |
| plugins/dsh-extra-plan/index.js | matchApprovalLabel | L295-302 | 用户选择标签→approve/replan/disagree；同 matchRouteLabel 的精确匹配口径（归一后等于当前词值才返回枚举） |  |
| plugins/dsh-extra-plan/index.js | matchPurposeLabel | L304-309 | 用户选择标签→refine/redo（第四锚点目的二选一；括号内为出厂示例，实际取值来自当前 config.gateWords） |  |
| plugins/dsh-extra-plan/index.js | firstTextOfBlocks | L312-318 | 取 ContentBlock 数组首条 text 块的文本（无 text 块返回空串）；供 parseAskResultData/parseDispatchAskResult 的拒绝-取消判别读取信封文案 | 纯 helper，无副作用 |
| plugins/dsh-extra-plan/index.js | askResultTextIsDenied | L323-325 | 闸门拒绝判别：以 'Error: ' 开头且不等于 HOST_ASK_CANCEL_TEXTS 任一条 → true（插件中文拒绝文案）；宿主取消句与其它失败 → false | 判别只按文案：嵌套（PTC）路径拒绝与取消同构，唯一差异是文案；常量与注释见 index.js 同区 |
| plugins/dsh-extra-plan/index.js | parseAskResultData | L332-369 | tool/result 解析用户选择（answers.selected）；信封 isError:true 且无 data.error 时按文案二分：中文拒绝文案 → kind:'denied'，取消句/其它 → kind:'error'（code 空）；data.error.code 路径与正常 answers 解析逐字不变 | denied 由 deriveFlowState 判为「不重置」；native 取消码 ASK_CANCELLED 与通道码仍走 error 分支 |
| plugins/dsh-extra-plan/index.js | parseDispatchAskResult | L378-406 | PTC dispatch ask 结果解析；isError:true 时按文案二分：中文拒绝文案 → kind:'denied'，宿主取消句/其它 → kind:'error' | 取消句逐字常量 HOST_ASK_CANCEL_TEXTS 与判别函数 askResultTextIsDenied |
| plugins/dsh-extra-plan/index.js | deriveFlowState | L416-528 | 事件流推导 flow state（route/clarified/approved/purpose/channelBroken）；词表由入参 gateRuntime 提供——改词后旧 label 精确匹配失败，状态保持未确认（历史事件安全）。失败分支：kind:'denied'（闸门拒绝）continue 不改任何字段；kind:'error' 里通道码置 channelBroken、其余 resetRouteState 清四字段 | dispatch 与 tool/result 两个分支各有一处 denied 短路，顺序在 error 判定之前；台账 HK25 记录配套的呈现层兜底 |
| plugins/dsh-extra-plan/index.js | resetStageState | L418-422 | 回放正常路由/有效目的前重置 purpose、clarified、approved | deriveFlowState 内部辅助 |
| plugins/dsh-extra-plan/index.js | resetRouteState | L423-426 | 回放非通道 ask 错误时设置 route=none 并清理阶段状态 | deriveFlowState 内部辅助 |
| plugins/dsh-extra-plan/index.js | catalogHasWriteTools | L540-545 | 工具目录是否含写工具判定 |  |
| plugins/dsh-extra-plan/index.js | isReadOnlyChildByCatalog | L548-550 | 按工具目录判定只读子代理 |  |
| plugins/dsh-extra-plan/index.js | schemasHasWriteTools | L555-560 | schemas 数组是否含写工具 |  |
| plugins/dsh-extra-plan/index.js | schemasHasTool | L564-569 | schemas 是否含指定工具 |  |
| plugins/dsh-extra-plan/index.js | catalogIsCollapsed | L576-581 | 工具目录折叠为单工具判定（run_code/仅shell） |  |
| plugins/dsh-extra-plan/index.js | subagentProbeGateReason | L591-600 | 探查者分支闸门（T5 唯一功能点）：planner 禁止委派（文案指向「申请继续探查」）+ 主会话 run_in_background 必 true；两调用点（组判定/直呼）共用 |  |
| plugins/dsh-extra-plan/index.js | shellMutationReason | L606-620 | 只读角色 shell 写命令拒绝文案的唯一实现：planner/探查者/验收复核者 × pwsh/bash 六格逐字（role 仅 planner/probe/reviewer；未命中 mutation、非 shell、未知角色一律 null） | B3 收敛：plannerGateReason 与 childReadonlyGateReason 共用，不再各自拼接文案 |
| plugins/dsh-extra-plan/index.js | plannerGateReason | L624-638 | 规划子代理分支闸门（write/edit + shell 写命令 + job_output 首判 + 预算；不含 run_code） | shell 文案取自 shellMutationReason（B3 单源） |
| plugins/dsh-extra-plan/index.js | childReadonlyGateReason | L642-650 | 子代理只读分支闸门（write/edit + shell 写命令 + job_output 首判；不含 run_code） | shell 文案取自 shellMutationReason（probe 布尔选角色） |
| plugins/dsh-extra-plan/index.js | jobOutputGateReason | L655-677 | job_output 闸门：禁 wait:true + 同 job 重复调用查重（内存计数器；只读查重不写入） | 写入侧唯一位点是 recordJobOutputCall（B3 单源） |
| plugins/dsh-extra-plan/index.js | recordJobOutputCall | L683-695 | job_output 放行后的计数器记录唯一实现：job_output + 字符串 job_id + 有效 sessionId + counters 可用时惰性建 session Map 并写 jobId→1，非法输入返回 false 且零副作用 | B3 收敛：planner/只读 child/主会话三处共用；执行者仍完全豁免 |
| plugins/dsh-extra-plan/index.js | pollGuardGateReason | L701-714 | job_list/list_agents 主会话防轮询闸门：同锚点周期内同工具第二次调用拒绝（首次放行，文案「禁止轮询子代理状态，停止操作并等待子代理通知」）；无参数键按调用行为计数（查 sessionId 分桶的已调用工具名集合）；只读查重不写入 | 写入侧唯一位点是 recordPollGuardCall（B3 单源）；vExec 无 agent（组判定成员）时跳过查重（运行时瀑布重入兜底，与 jobOutputGateReason 同口径） |
| plugins/dsh-extra-plan/index.js | recordPollGuardCall | L716-727 | job_list/list_agents 放行后的计数器记录唯一实现：合法工具名 + 字符串 sessionId + counters 可用时惰性建 session Set 并写入工具名，非法输入返回 false 且零副作用 | 仅主会话路径调用（B3 收敛）；防轮询重置双通道＝新用户消息锚点重置清整表 + tool-jobs 完成通知清整表（consumed 标记与 job_output 跟踪命中解耦） |
| plugins/dsh-extra-plan/index.js | probeDisposalWarning | L735-738 | 探查者级联中止告警纯函数：剩余未认领探查者委派数为正整数时返回告警文案（T5 文案中性化「委派方会话销毁时」+ owner disposed + 引擎限制指向官方包）；非正整数返回 null |  |
| plugins/dsh-extra-plan/index.js | mainGateReason | L748-885 | 主会话闸门主分支（ask/write/edit/plan/save_probe/subagent/run_code/job_output/job_kill/send_message/job_list/list_agents…）；gateCtx.gateRuntime 必填（缺失即抛错，helper 不得自建默认词表）；job_kill 仅直行路线放行（route≠direct 拒，escape 逃生同放行）、send_message 主会话向 running（运行中）目标拒绝（gateCtx.getAgents 查询；idle（空闲）/未驻留/服务不可用 fail-open（失败开放）放行）、job_list/list_agents 经 pollGuardGateReason 同锚点防轮询；save_plan 任意路由态放行（受限规划工件：仅写 cwd/.extra-plan 固定形状 Markdown，无显式分支、走兜底 return null）；save_probe/subagent_plan 还需目的已定（purpose∈refine/redo，第四锚点）+ 澄清完成 |  |
| plugins/dsh-extra-plan/index.js | runCodeGroupDenyReason | L897-981 | run_code 组判定：拆解→成员逐判定→聚合拒绝；成员判定复用主会话闸门时经 gateCtx.gateRuntime 传同一词表实例；预算耗尽白名单把关 |  |
| plugins/dsh-extra-plan/index.js | visit | L915-958 | 递归展平嵌套 run_code（runCodeGroupDenyReason 内闭包） |  |
| plugins/dsh-extra-plan/index.js | aggregateRunCodeDenyReason | L987-999 | 聚合多成员拒绝消息 |  |
| plugins/dsh-extra-plan/index.js | malformedRecovery | L1194-1228 | MALFORMED_RESPONSE 限次自愈：llm-retry 已给 {kind:'retry'} 原样透传（不叠加）；否则按 sessionId→Set('turn:step') 同回合只兜底 1 次（防死循环），注入 developer/message 中文提示（append 带 surfaceOp:'append'、纯文本禁带 headerSeq、source.kind 用生产者自有 plugin:@local/dsh-extra-plan）并返回 {kind:'retry'}；**payload 须自带 ≥1 的 turn/step（宿主 append 不补坐标），坐标缺失/非正整数 → 跳过注入但仍返回 {kind:'retry'}**；aborted/无 agent/超次 → null 回退原 action 透传 |  |
| plugins/dsh-extra-plan/index.js | recordAgentError | L1242-1260 | agent/error 回合错误取证：把宿主回合/步骤级错误（payload {agent,turn,step,error}）逐字落盘到插件目录 extra-plan-agent-errors.jsonl，行 = {ts, sessionId, turn, step, chain}；整体吞错 + 一次性 warn 防刷屏；模块级函数经命名导出供回归冒烟直呼 | 与 recordRequestError 同诊断模式 |
| plugins/dsh-extra-plan/index.js | apply | L1264-2225 | 插件主入口：第一步 createGateRuntime(cfg.gateWords)（缺失/非法同步抛错，早于任何工具/监听器/服务副作用）→ ctx.effect 在当前 agent scope 注册恰好 7 个 extra_plan_* prompt variable（provider 返回本次 apply 捕获值）→ 配置解析（含变量② bootstrapReadHint）/服务注册/工具注册/creativeMode 模型可见投影/锚点钩子（HP 首轮 tool:read text 用变量②覆盖）；planner 与非 planner child 双模型路由；会话状态按 sessionId 分桶与 agent/disposed 同步 final flush + 单会话回收 |  |
| plugins/dsh-extra-plan/index.js | plannerModel | L1317 | 热读箭头 getter：pro 规划默认模型（liveConfig.plannerModel；消费点=model-routing 的 getPlannerModel） |  |
| plugins/dsh-extra-plan/index.js | otherAgentModel | L1318 | 热读箭头 getter：其他子代理默认模型（消费点=model-routing 的 getOtherAgentModel） |  |
| plugins/dsh-extra-plan/index.js | exploreBudget | L1319 | 热读箭头 getter：pro 规划探查额度/单实例子调用上限（消费点=预算文案、noteRunCodeSubCall、plannerGateReason 与组判定） |  |
| plugins/dsh-extra-plan/index.js | plannerPromptSuffix | L1320 | 热读箭头 getter：pre-step 拼接的额外引导后缀 |  |
| plugins/dsh-extra-plan/index.js | bootstrapOn | L1321 | 热读箭头 getter：anchored 首轮引导开关（消费点=shouldHideCreativeCatalog 与 anchoredFirst 装配；creativeModeOn 仍为快照） |  |
| plugins/dsh-extra-plan/index.js | runcodeCatchGateOn | L1322 | 热读箭头 getter：PTC try/catch 闸门开关（消费点=planner/只读 child/主会话三处组判定传参） |  |
| plugins/dsh-extra-plan/index.js | crossProviderPlannerModelOn | L1323 | 热读箭头 getter：跨提供方模型选择开关（消费点=model-routing 双 resolver 入口，新 agent 重决议） |  |
| plugins/dsh-extra-plan/index.js | creativeModeOn | L1326 | 热读箭头 getter：创造模式开关（liveConfig.creativeMode；消费点=shouldHideCreativeCatalog 与装配投影 hideCordis） |  |
| plugins/dsh-extra-plan/index.js | readUsageCursorTable | L1367-1388 | usage cursor JSON 读取（续载/写回前盘点共用）：返回 { ok, table }；ENOENT 静默按空表，其它读取错误、JSON 解析失败、根值非对象（含数组）→ 降级空表并告警 |  |
| plugins/dsh-extra-plan/index.js | warnUsageCursorDegraded | L1391-1395 | cursor 降级告警：每插件实例首次降级时一次（同 ledgerWarned 口径），声明其它 session 去重基准可能丢失 |  |
| plugins/dsh-extra-plan/index.js | usageCursorEntryOf | L1399-1406 | cursor 单项归一：兼容旧数字形状（按水位 0 处理）与 { seq, index }；不再保留内存态 ref 字段——增量由 session.seq 水位 + snapshotEvents(from,to) 区间读取实现，水位未变直接返回、截断回退全量 |  |
| plugins/dsh-extra-plan/index.js | foldUsage | L1414-1514 | 同步 usage 折叠；append 成功后才推进内存 cursor；可解析 cursor 读改写保留其它 session，损坏/非对象只降级内存态并保留原始字节；session.seq + snapshotEvents(from,to) 增量水位语义 |  |
| plugins/dsh-extra-plan/index.js | registerTool | L1551-1585 | 工具注册分发：注册成功、A 重名、B 永久性三类都写「已注册」标记（A/B 记终态不重试）；仅 tools 服务未就绪与 C 类可重试不写标记，留给下一次入口重试 |  |
| plugins/dsh-extra-plan/index.js | registerSavePlan | L1588 | save_plan 注册（规划子代理层 + 主会话层；主会话侧任意路由态放行——受限规划工件，mainGateReason 兜底放行）；注册失败按 A/B/C 三分类：A/B 写标记记终态不重试，服务未就绪与 C 类不写标记、由 pre-step 每步兜底重试 |  |
| plugins/dsh-extra-plan/index.js | registerSaveProbe | L1592 | save_probe 注册（主会话层 + 已认领的探查子代理层；规划子代理/执行者/reviewer 不是持有者）；已认领者靠 probeClaimed 粘性在下一步重试注册、不重复消费待认领计数 |  |
| plugins/dsh-extra-plan/index.js | probeClaimFor | L1602-1618 | 放行-认领关联查核（pendingProbeClaims）：非子代理/含写子代理/规划子代理（T5 守卫）不认领，命中则消费计数并登记 save_probe |  |
| plugins/dsh-extra-plan/index.js | shouldHideCreativeCatalog | L1648-1655 | HP1 判定：C=1、A=1、F、main/planner、M=ptc 时暂隐两个创造 skill |  |
| plugins/dsh-extra-plan/index.js | warnPreStepFailure | L1661-1665 | pre-step 初始化/后处理异常的一次性告警 helper，保留原 decision 且保证 next 只调用一次 |  |
| plugins/dsh-extra-plan/index.js | recordRequestError | L1723-1745 | 记录 agent/request-error 失败诊断到插件目录 extra-plan-request-errors.jsonl（diagPath 可经 cfg.diagFile 覆盖；行含 turn/step/provider/message/code/causeChain） |  |
| plugins/dsh-extra-plan/index.js | noteRunCodeSubCall | L1999-2006 | 单实例子调用上限（planner）：按 sessionId→rootCallId 桶读计数、未超限则 +1；返回拒绝文案或 null；空 rootCallId 与 exploreBudget 文案保持 |  |
| plugins/dsh-extra-plan/index.js | recordRunCodeDeny | L2015-2026 | pre-execute 八处 deny 出口在 return 前记录本次中文 reason（sessionId→rootCallId→Set）；仅 isRunCodeSubCall（exec.sub 或 exec.parent）且 reason 为非空字符串时写入 | 记录由 tools/post-execute 按精确子串消费（消费即清），agent/disposed 按 session 清桶；不做跨 session 共享 |
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
| plugins/dsh-extra-plan/lib/assembly-presentation.js | sectionOf | L29-32 | 按名称取 PromptAssembly section |  |
| plugins/dsh-extra-plan/lib/assembly-presentation.js | skillCatalogEntriesOf | L38-46 | 校验并提取 skill catalog 的最小 name/description 条目 |  |
| plugins/dsh-extra-plan/lib/assembly-presentation.js | renderSkillCatalogText | L48-70 | 按条目重建系统 skill catalog 文本 |  |
| plugins/dsh-extra-plan/lib/assembly-presentation.js | projectSkillCatalogDecision | L72-98 | 在当前消息副本中暂隐创造 skill，不注销 binding |  |
| plugins/dsh-extra-plan/lib/assembly-presentation.js | isCordisPresentationTool | L100-102 | 判断名称是否属于固定 2 项 Cordis 模型可见工具集合 | 模型可见投影；不改变 registry binding |
| plugins/dsh-extra-plan/lib/assembly-presentation.js | filteredCordisSchemas | L104-107 | 从 schema 数组排除固定 2 项 Cordis 工具，供 SDK 整体重建 |  |
| plugins/dsh-extra-plan/lib/assembly-presentation.js | hasSection | L109-111 | 判断 PromptAssembly 是否含指定命名 section |  |
| plugins/dsh-extra-plan/lib/assembly-presentation.js | hasNonEmptySection | L113-115 | 判断 tools:ptc-only 是否为有效非空 section，识别 Pure PTC |  |
| plugins/dsh-extra-plan/lib/assembly-presentation.js | projectAssemblyForPresentation | L118-142 | 创建不原地修改的模型可见 assembly：按当前 schema 交集过滤工具，替换 SDK 文本并隐藏 tool:cordis，另支持 Pure PTC 顶层单入口 | 不改变 registry/restrict/pre-execute |
| plugins/dsh-extra-plan/lib/assembly-presentation.js | sdkSchemasForRendering | L144-151 | 从 schema 输入排除 run_code 与 Cordis，并确保 renderer 获得输出 schema | 不读取原始 tools:sdk 文本 |
| plugins/dsh-extra-plan/lib/assembly-presentation.js | dshToolsEntryCandidates | L153-169 | 生成 DSH_HOME/profile 与平台官方 dsh-tools SDK renderer 候选路径 | 只读加载官方包，不修改安装目录 |
| plugins/dsh-extra-plan/lib/assembly-presentation.js | loadSdkRendererModule | L172-186 | 惰性加载官方 SDK renderer 模块；失败 promise 清空，候选补齐后可重试 |  |
| plugins/dsh-extra-plan/lib/assembly-presentation.js | pending | L174-183 | loadSdkRendererModule 的 in-flight（进行中）module promise（模块 Promise）；reject 后 identity-check 清空供下次重试 |  |
| plugins/dsh-extra-plan/lib/assembly-presentation.js | resolveToolsSdkRenderer | L189-194 | 按 language 选择当前官方 TypeScript/Python SDK renderer，返回函数身份供 cache key 使用；复用模块级动态 import promise |  |
| plugins/dsh-extra-plan/lib/assembly-presentation.js | renderFilteredToolsSdk | L197-200 | 仅以过滤后的 schema 整体调用官方 renderer 生成 tools:sdk，按 ptcRuntime language 选择 TS/Python | 不做原始文本正则删块 |
| plugins/dsh-extra-plan/lib/assembly-presentation.js | toolRegistryOf | L202-210 | 防御式读取 agent scoped tools service，服务缺失或异常返回 undefined |  |
| plugins/dsh-extra-plan/lib/assembly-presentation.js | toolSdkSchemasOf | L212-230 | 优先读取 tools.sdkSchemas；兼容旧服务时从 schemas 补 owned（自有） output schema，供 SDK renderer 使用 |  |
| plugins/dsh-extra-plan/lib/assembly-presentation.js | toolPresentationModeOf | L232-241 | 从 scoped tools registry 读取 native/ptc/both 模式 |  |
| plugins/dsh-extra-plan/lib/client-bridge.js | apply | L5-7 | 空实现（仅承载 dsh.client 加载路径指向 lib/client.js） |  |
| plugins/dsh-extra-plan/lib/client.js | apply | L133-431 | 客户端插件入口：注入 esp-* 样式表与中英词条；共享 SettingsCard/ExtraPlanForm 由唯一 legacy keyed row 按宿主 slot 条件呈现，0.2 独立 tab 不注册，slot 缺失走 configEditor/SettingsForms 或 profile 权威行后备路径；settings/preset-sync 后端组件独立活动。 |  |
| plugins/dsh-extra-plan/lib/client.js | optionLabel | L144-149 | 选项显示名：优先 optionLocale 词条，其次布尔 trueValue/falseValue，最后原值字符串 | apply 内部闭包（设置页控件共用） |
| plugins/dsh-extra-plan/lib/client.js | optionValue | L151-157 | 把后端返回的字符串值映射回 field.options 里的原始类型（不在选项中则原样返回） | apply 内部闭包（设置页控件共用） |
| plugins/dsh-extra-plan/lib/client.js | renderControl | L159-197 | 按 field.control 渲染受控控件：textarea／number（透传 min、step）／select（选项文案走 optionLabel、回值走 optionValue）／其余回落 text input；统一 disabled 与 onChange 回传 |  |
| plugins/dsh-extra-plan/lib/client.js | ExtraPlanForm | L204-398 | 共享 8 项 UI 设置表单：从规范化 ConfigForm.state 播种 draft（value/writable/revision/status），按 general/pro 两组 esp-section 渲染字段，footer 一次性提交 mutate(set ops + revision fence) 后提示已保存/保存失败；由唯一 legacy keyed row 按宿主 slot 条件呈现。 |  |
| plugins/dsh-extra-plan/lib/client.js | fieldValue | L263-270 | 取字段草稿值：number 控件把草稿转 Number（非有限数值原样返回），其余控件原样返回 | ExtraPlanForm 内部闭包 |
| plugins/dsh-extra-plan/lib/client.js | reconcileHostRows | L273-291 | mutate 失败/不确定时 GET 最新 authority，再 PUT 投影并验证 projection.applied=true；失败显示结论级错误 |  |
| plugins/dsh-extra-plan/lib/client.js | saveAll | L293-336 | 初次 PUT 严格验证 projection.applied=true；成功后一次 mutate 10 op，不确定结果收敛到最新 authority |  |
| plugins/dsh-extra-plan/lib/client.js | renderField | L344-355 | 按 field 渲染 8 项 UI 设置中的一个字段：esp-field 内「locale 名称→renderControl（随 snapshot.writable 禁用）→静态 hint」，编辑写回 draft 并清提示 | ExtraPlanForm 内部闭包；本地稳定字段样式 |
| plugins/dsh-extra-plan/lib/client.js | SettingsCard | L401-407 | SHARED 卡片根组件：接收规范化 configForm/translate，view=summary 返回一行描述，其余渲染 esp-wrap 与唯一 ExtraPlanForm；不直接读取旧宿主 props。 |  |
| plugins/dsh-extra-plan/lib/client.js | Legacy017SettingsCard | L414-416 | 0.1.7 row wrapper：逐项把旧 props.form/props.t/props.view 映射为共享 SettingsCard 的 configForm/translate/view；仅随 legacy slot 呈现。 |  |
| plugins/dsh-extra-plan/lib/client.js | registerLegacy017RowConfig | L418-427 | 以 `LEGACY_017_ROW_CONFIG_KEY` 注册唯一 `plugins.row.config` keyed row；注入 locale 与共享卡片 wrapper，不注册 0.2 独立 tab。 |  |
| plugins/dsh-extra-plan/lib/executor-spawn.js | resolveDeny | L27-29 | deny 解析纯函数：config.deny 合法（非 null 对象且为数组）时原样返回，否则回退 DEFAULT_DENY | 由 apply 调用；DEFAULT_DENY 已与预设 config.deny 收敛为同集 12 项 |
| plugins/dsh-extra-plan/lib/executor-spawn.js | slotKey | L48-54 | 稳定槽键纯函数：读全局注册符号 Symbol.for('cordis.original') 取 subagents 服务实现本体（traceable 代理 get 拦截器返回 target；root 单例跨 ctx/跨预设世代恒同一对象），非 traceable/取不到符号值时降级回代理本身 | registrationSlots 查表的键来源，槽键语义 = 幂等跨世代命中的前提 |
| plugins/dsh-extra-plan/lib/executor-spawn.js | apply | L56-132 | 插件入口：注册执行者 provider（委托宿主 spawn，注入 deny 工具裁剪）；注册走引用计数幂等——槽键取 slotKey(ctx.subagents)（服务实现本体，不再以 ctx.subagents 代理为键），槽 count>0 时只加持有并 console.warn 后返回，count==0 且已存在同名 provider 时抛真实冲突错，全新注册时保存 host disposer（含 delegator 校验与 defaultedAgentOptions） |  |
| plugins/dsh-extra-plan/lib/executor-spawn.js | releaseSlot | L82-90 | 释放一份注册持有：count 递减，归零且已有宿主 disposer 时调用它反注册并置空（以 ctx.effect 清理回调形式挂载，标签 'executor-spawn: shared provider slot'） |  |
| plugins/dsh-extra-plan/lib/executor-spawn.js | defaultedAgentOptions | L110-114 | 执行者 agentOptions 透传（请求自带优先，否则空对象继承父会话） |  |
| plugins/dsh-extra-plan/lib/gate-words.js | fail | L31-33 | 统一抛出 'extra-plan: config.gateWords ' 前缀的校验错误（错误前缀的唯一出口） |  |
| plugins/dsh-extra-plan/lib/gate-words.js | normalizeGateLabel | L36-38 | 推荐后缀归一（(Recommended)/（Recommended）/(推荐)/（推荐），四级后缀、英文大小写不敏感、前后空白），与 index.js normalizeLabel 同规则；仅供校验保留后缀用 |  |
| plugins/dsh-extra-plan/lib/gate-words.js | validateGateWords | L44-71 | 整组严格校验：非数组对象、键集合恰为 7 键、每值为非空字符串、首尾无空白、无 CR/LF、7 值两两不同、不以保留推荐后缀结尾；合法返回冻结副本，任何一条不合法即抛错（禁止部分接受） |  |
| plugins/dsh-extra-plan/lib/gate-words.js | bracketed | L73-75 | 选项集合文本拼接（「词」「词」…），与历史静态 OPTIONS_TEXT 逐字同构 |  |
| plugins/dsh-extra-plan/lib/gate-words.js | createGateRuntime | L85-114 | 运行时词表工厂：仅从入参派生 words/route/approval/purpose 冻结数组 + 三套 Set + options/confirm 插值片段 + variables（变量名→本次 apply 值）；无默认词表，缺失/非法即抛错 |  |
| plugins/dsh-extra-plan/lib/live-config.js | textOf | L51-53 | 非空字符串 trim 取值（空串/非串 → ''），用于路径与环境变量决议 |  |
| plugins/dsh-extra-plan/lib/live-config.js | envConfigPath | L55-57 | 环境变量 DSH_EXTRA_PLAN_CONFIG_PATH 取值（空/缺省 → ''，体检用它隔离生产现场配置） |  |
| plugins/dsh-extra-plan/lib/live-config.js | statStamp | L60-78 | fs.statSync 优先取 dev/ino/size/mtimeNs/ctimeNs，兼容回退 ino/size/mtimeMs/ctimeMs 拼变更 stamp；失败返回 { ok:false, reason } 不抛出 |  |
| plugins/dsh-extra-plan/lib/live-config.js | booleanOr | L80-82 | 布尔取值：仅 true/false 采信，其他一律回落 fallback（回退） |  |
| plugins/dsh-extra-plan/lib/live-config.js | stringOr | L84-86 | 字符串取值：非 string 回落 fallback（回退）（plannerPromptSuffix） |  |
| plugins/dsh-extra-plan/lib/live-config.js | positiveIntegerOr | L88-90 | 正整数取值：非 >0 整数回落 fallback（回退）（exploreBudget） |  |
| plugins/dsh-extra-plan/lib/live-config.js | modeOr | L92-94 | 工具呈现模式取值：仅接受 TOOL_PRESENTATION_MODES（native/ptc/both），其他回落 fallback（回退）（toolPresentationMode） |  |
| plugins/dsh-extra-plan/lib/live-config.js | pick | L96-106 | 按 key 的标量类型收口（布尔含 webFetch／trim 字符串／正整数／工具呈现模式枚举），非法值一律回落 fallback（回退） |  |
| plugins/dsh-extra-plan/lib/live-config.js | normalizedFallback | L108-115 | 归一 fallback（回退）Defaults：取 10 个读取键（8 项 UI + 2 项宿主行设置），缺失键用内置兜底（与 index.js apply 期 cfg 快照同口径） |  |
| plugins/dsh-extra-plan/lib/live-config.js | createLiveConfig | L123-255 | 热读工厂：决议路径 + 构造期**无条件读盘一次**（文件真值作首拍基准，成功即记 stamp；失败回退 fallback（回退）Defaults + warnOnce）；返回 10 个 getter（8 项热读 + 2 项宿主行设置权威值读口；取值先 refresh 再做 stamp 比对）；creativeMode getter 保留但当前无热读消费点（该项为 apply 快照）；不做监听/轮询/订阅 |  |
| plugins/dsh-extra-plan/lib/live-config.js | warnOnce | L134-138 | 同实例只告警一次（防抖）：不可用原因 + 生效路径 + 「回退到 apply 期快照兜底」 |  |
| plugins/dsh-extra-plan/lib/live-config.js | currentPath | L141-151 | 路径决议（构造期与每次取值现场调用）：显式 configPath → 环境变量 DSH_EXTRA_PLAN_CONFIG_PATH → resolver()（宿主 configEditor.documentPath）；resolver 缺失或抛出返回空串 |  |
| plugins/dsh-extra-plan/lib/live-config.js | readDiskValues | L154-176 | 读盘→解析→取值单一实现（构造期与 stamp 变化后的刷新共用）：readFileSync + **captureRowSettings(SETTING_DEFINITIONS)（settings 行 = 10 项权威值同源落点）**，按 states[key]==='captured' 覆盖、其余键回落 fallback（回退）；未捕获到任何键视为取值失败；失败返回 { ok:false, reason } 不抛出 |  |
| plugins/dsh-extra-plan/lib/live-config.js | refresh | L196-225 | 变更检测主体：stamp 未变直接返回（零 IO 零解析）；变了才 readFileSync + captureRowSettings 全量解析，按 states[key]==='captured' 覆盖 fallback（回退）；stat/解析失败回落 fallback（回退） 并 warnOnce |  |
| plugins/dsh-extra-plan/lib/live-config.js | read | L227-230 | getter 取值通道：refresh() 后读当前 values[key] |  |
| plugins/dsh-extra-plan/lib/model-routing.js | isExplicitRoute | L11-17 | 按直接父 provider/model 比较 child resolved route，判断 agentOptions 显式路由并短路模型解析 |  |
| plugins/dsh-extra-plan/lib/model-routing.js | isExplicitEffort | L21-23 | 显式指定 reasoningEffort 判断 |  |
| plugins/dsh-extra-plan/lib/model-routing.js | requestConfigSnapshot | L33-46 | 从 Agent 的 requestHeader 只提取 provider/model/maxTokens/reasoningEffort owned（自有） 路由快照，异常或缺 config 返回 null | 不序列化/持有 Cordis 对象 |
| plugins/dsh-extra-plan/lib/model-routing.js | agentFromRegistry | L48-51 | 防御式按 session id 从 agents registry 取父 Agent，服务缺失或 get 异常返回 undefined |  |
| plugins/dsh-extra-plan/lib/model-routing.js | resolveAgentRouteSources | L54-79 | 沿 parentSession 链解析直接父与完整顶层主会话来源；断链标记 incomplete，不把中间 child 当主会话 fallback（回退） | 非 planner 与 probe 共用 |
| plugins/dsh-extra-plan/lib/model-routing.js | decidePlannerModelUse | L101-114 | T2 静默降级判定：目录命中→用 plannerModel；清单非空未命中→不覆盖（inherit-parent）；空/异常→沿用 |  |
| plugins/dsh-extra-plan/lib/model-routing.js | comparePlannerText | L125-129 | 规划 provider name/id 的确定性字典序比较 |  |
| plugins/dsh-extra-plan/lib/model-routing.js | plannerProviderRank | L131-135 | 候选排序层级：普通 provider、父会话 provider、deepseek-official |  |
| plugins/dsh-extra-plan/lib/model-routing.js | sortPlannerCandidates | L137-148 | 真实探针成功候选排序：普通 name/id 正序，父 provider 倒数第二，官方最后 |  |
| plugins/dsh-extra-plan/lib/model-routing.js | createModelRouting | L153-542 | 创建 per-apply 模型路由工厂：内部新建 plannerModelCache/otherAgentModelCache WeakMap，承载 planner 与非 planner 的 legacy/strict 双路径解析，返回 { resolvePlannerEntry, resolveOtherAgentEntry } | 每次 apply 各一份（绝不提升为模块全局）；llm/agents/诊断路径走惰性 getter |
| plugins/dsh-extra-plan/lib/model-routing.js | plannerAbortError | L161-164 | 保留外部 turn abort 原因，避免改写为严格路由阻断 |  |
| plugins/dsh-extra-plan/lib/model-routing.js | withPlannerProbeDeadline | L168-201 | planner 与非 planner route 共用本地 30000ms AbortController/race 覆盖目录、准备与流消费并清理计时器 | 不遵守 signal 的第三方 adapter 可能遗留 I/O |
| plugins/dsh-extra-plan/lib/model-routing.js | probePlannerRoute | L205-247 | planner 与非 planner 候选或顶层 fallback（回退） 共用 prepareCall + 完整 prepared stream 的 OK probe，隔离失败终止块/无终止块/超时 | 仅 True 路径调用，不把目录或 resolveCallConfig 当成功 |
| plugins/dsh-extra-plan/lib/model-routing.js | probePlannerCandidates | L254-270 | 有界并发探针池（上限 PLANNER_PROBE_CONCURRENCY=5）：候选按入参顺序启动、超出排队；返回值与入参一一对应且按发起顺序排列（完成顺序不影响结果），调用方在全部结束后回填 probeOutcomes/successes 再排序 |  |
| plugins/dsh-extra-plan/lib/model-routing.js | worker | L257-264 | probePlannerCandidates 的并发池内层 worker：用共享游标 next 领取下一个候选索引直到取尽；每个候选各自走 probePlannerRoute（独立 AbortController + 30s deadline，不共享） |  |
| plugins/dsh-extra-plan/lib/model-routing.js | extractParentEntry | L274-284 | 从父会话 requestHeader().config 提取 provider/model/maxTokens（非法或缺失取 undefined），parent 为 null/undefined 时返回 null | 旧流程与严格路径共用；不读取 agent.session 字段 |
| plugins/dsh-extra-plan/lib/model-routing.js | resolvePlannerEntryLegacy | L288-344 | False/缺失/非法开关的旧单 provider listModels advisory 解析与原降级诊断 | 不枚举 provider、不做真实 probe |
| plugins/dsh-extra-plan/lib/model-routing.js | resolvePlannerEntryStrict | L347-422 | True 路径枚举全 provider、等待全部匹配候选排序，并验证父 provider/model fallback（回退）；无验证路由固定 reject | plannerModel 为空仅验证父 fallback（回退） |
| plugins/dsh-extra-plan/lib/model-routing.js | routeKey | L380 | 以 provider 与 model 组成 probe outcome 复用键，避免 fallback（回退） 同路由二次请求 | 仅 resolver 内部使用 |
| plugins/dsh-extra-plan/lib/model-routing.js | resolvePlannerEntry | L426-435 | 单点分流并立即缓存 in-flight promise：False 走旧 advisory，True 走全 provider 真实 probe 与严格 fallback（回退） | 成功 entry 与 rejection 均固定到 Agent |
| plugins/dsh-extra-plan/lib/model-routing.js | nonPlannerRouteSources | L439-443 | 读取非 planner resolver 所需的 agents registry，并把服务异常转换为不可用来源 |  |
| plugins/dsh-extra-plan/lib/model-routing.js | nonPlannerFallbackEntry | L445-453 | 组装顶层主会话 provider/model fallback（回退）；普通 child 继承直接父 maxTokens，probe 保留顶层 maxTokens |  |
| plugins/dsh-extra-plan/lib/model-routing.js | resolveOtherAgentEntryLegacy | L456-473 | cross=false/缺失/非法时只查顶层主会话 provider 的 advisory listModels，命中 otherAgentModel 才覆盖，否则回退 | 不枚举 provider、不做真实 probe |
| plugins/dsh-extra-plan/lib/model-routing.js | resolveOtherAgentEntryStrict | L477-528 | cross=true 时枚举全 provider，串行 probe otherAgentModel，候选全失败后验证主会话 fallback（回退），失败固定阻断 | 复用 probePlannerRoute/withPlannerProbeDeadline |
| plugins/dsh-extra-plan/lib/model-routing.js | routeKey | L491 | 非 planner strict resolver 内以 provider/model 组成本次 Agent 的 probe outcome 复用键 | 仅 resolver 内部使用；与 planner routeKey 同名但 cache 隔离 |
| plugins/dsh-extra-plan/lib/model-routing.js | resolveOtherAgentEntry | L531-540 | 非 planner 单一入口，按 cross 开关选择 legacy/strict，并立即缓存单 Agent 的 in-flight（进行中）/成功/rejection promise | 不读写 plannerModelCache |
| plugins/dsh-extra-plan/lib/planner-budget.js | toolCallCount | L11-40 | 按成功 tool/result 配对统计工具调用并跳过白名单工具 |  |
| plugins/dsh-extra-plan/lib/planner-budget.js | toolCallsSinceUser | L43-55 | 统计最近 user/agent-message 锚点后的预算调用数 |  |
| plugins/dsh-extra-plan/lib/planner-budget.js | appendSuffixBlock | L57-74 | 给 user/agent-message 的首个文本块幂等追加后缀 |  |
| plugins/dsh-extra-plan/lib/planner-budget.js | withPlannerPromptSuffix | L76-83 | 拼接 planner 任务后缀并保持多块换行语义 |  |
| plugins/dsh-extra-plan/lib/planner-budget.js | budgetNoticeText | L88-90 | 构造本轮探查预算告知文案 |  |
| plugins/dsh-extra-plan/lib/planner-budget.js | withBudgetNotice | L92 | 将预算告知幂等拼入任务消息 |  |
| plugins/dsh-extra-plan/lib/planner-budget.js | budgetReminderText | L94-98 | 按阈值构造剩余预算提醒文案 |  |
| plugins/dsh-extra-plan/lib/planner-budget.js | budgetReminderMessage | L105-107 | 用宿主消息构造器生成预算提醒 user/message，source 为生产者自有 kind plugin:@local/dsh-extra-plan（v4 行准入禁旧包裹 plugin） |  |
| plugins/dsh-extra-plan/lib/planner-budget.js | budgetReminderSent | L109-129 | 判断当前 user/agent-message 锚点后是否已提醒 |  |
| plugins/dsh-extra-plan/lib/planner-budget.js | budgetExhaustedReason | L131-133 | 构造预算耗尽拒绝与继续探查指令 |  |
| plugins/dsh-extra-plan/lib/planner-budget.js | budgetExceeded | L135-137 | 判定 used 是否超过预算上限 |  |
| plugins/dsh-extra-plan/lib/preset-settings.js | loadYaml | L12-25 | 模块加载期解析 js-yaml：本模块 require 失败则回退全局 dsh 的 node_modules，仍失败抛首个错误 |  |
| plugins/dsh-extra-plan/lib/preset-settings.js | isString | L37 | 字符串判定（plannerModel 与 otherAgentModel 的 validator：空串合法=继承主会话模型） |  |
| plugins/dsh-extra-plan/lib/preset-settings.js | isPositiveInteger | L38 | 正整数校验器（exploreBudget 的 validator）：仅接受 >0 整数，拒绝小数/0/负数/非 number |  |
| plugins/dsh-extra-plan/lib/preset-settings.js | isBoolean | L39 | 布尔校验器（anchoredBootstrap／runcodeCatchGate／webFetch 三个 descriptor 的 validator） |  |
| plugins/dsh-extra-plan/lib/preset-settings.js | isMode | L41-46 | 工具展示模式校验器：仅接受 modeOptions（native/ptc/both）三值之一 |  |
| plugins/dsh-extra-plan/lib/preset-settings.js | setting | L55-74 | descriptor 工厂：冻结定义并补齐 type/locator/aliases/ui（SETTING_DEFINITIONS 内 10 处调用）；projectionLocator 仅在提供时冻结（8 项 UI 设置无投影面） |  |
| plugins/dsh-extra-plan/lib/preset-settings.js | settingsRowLocator | L77 | **权威值落点工厂**：rowId=SETTINGS_ROW_ID、path 缺省 'config.'+key —— 10 项（8 项 UI + 2 项宿主行）的 rowLocator 全走它 | 原 extraPlanLocator 更名（权威值上移后语义 = settings 行） |
| plugins/dsh-extra-plan/lib/preset-settings.js | sourceLocator | L78 | 源模板/旧分发副本行定位工厂：rowId='extra-plan'、path 缺省 'config.'+key（captureSettings 与 gateWords 迁移共用） |  |
| plugins/dsh-extra-plan/lib/preset-settings.js | hostRowProjectionLocator | L80-84 | **投影落点工厂**：声明行 PRESET_ROW_ID 的 plugins 内 HOST_ROW_IDS[key] 子行 + HOST_ROW_LEAF_KEYS[key] 叶键（tool-web.fetch / tool-presentation.mode）——叶键与源模板同源，不新增第二份键名清单 | 仅 2 项宿主行设置使用 |
| plugins/dsh-extra-plan/lib/preset-settings.js | getSettingDefinition | L174-176 | 按 key 取设置描述符（descriptorByKey），未命中返回 undefined |  |
| plugins/dsh-extra-plan/lib/preset-settings.js | parsePresetYaml | L178-180 | 预设 YAML 文本 → JS 对象（含自定义 js 标签的 YAML_SCHEMA）；非法 YAML 直接抛错 |  |
| plugins/dsh-extra-plan/lib/preset-settings.js | hasOwn | L182-184 | null 安全的自有属性判定（readPath／rowsById 调用） |  |
| plugins/dsh-extra-plan/lib/preset-settings.js | pathParts | L186-188 | 点分路径（如 config.fetch）切成去空段数组 |  |
| plugins/dsh-extra-plan/lib/preset-settings.js | readPath | L190-197 | 按点分路径读嵌套值 → {exists,value}（任一段缺失即 exists:false） |  |
| plugins/dsh-extra-plan/lib/preset-settings.js | rowsById | L199-214 | DFS 收集文档中所有 id===pluginId 的行（Set 防环）→ 数组 |  |
| plugins/dsh-extra-plan/lib/preset-settings.js | visit | L202-211 | 递归遍历（数组按元素、对象按 Object.values），把 id 命中的行推入 rows | rowsById 内部闭包 |
| plugins/dsh-extra-plan/lib/preset-settings.js | resolveLocator | L216-223 | 按 pluginId+path 定位单个设置行 → kind=missing/ambiguous/ok（ok 带 row 与 value） |  |
| plugins/dsh-extra-plan/lib/preset-settings.js | locatorFor | L225-230 | 参数归一化：传 descriptor 取 .locator，传 locator 则原样返回 |  |
| plugins/dsh-extra-plan/lib/preset-settings.js | aliasesFor | L232-237 | 别名归一化：传 descriptor 取 locatorAliases，传裸 locator 得空数组（resolveSetting 默认并入候选定位） |  |
| plugins/dsh-extra-plan/lib/preset-settings.js | resolveSetting | L243-256 | 按主 locator＋（默认启用的）别名解析设置；多命中或任一路径歧义 → {kind:'ambiguous'} |  |
| plugins/dsh-extra-plan/lib/preset-settings.js | validateSettingValue | L258-260 | 用 descriptor.validator 校验值；definition 缺失或无 validator 一律返回 false |  |
| plugins/dsh-extra-plan/lib/preset-settings.js | normalizeSettingValue | L262-264 | 有 normalize 时按其归一化（如 plannerModel 的 trim），否则原值返回 |  |
| plugins/dsh-extra-plan/lib/preset-settings.js | resolveTemplateSettingDefault | L266-281 | 按唯一 locator 解析并严格校验模板叶值 |  |
| plugins/dsh-extra-plan/lib/preset-settings.js | captureSettings | L287-303 | 解析预设并逐项解析 → {document,values,states}；states 四态，仅 captured 进 values |  |
| plugins/dsh-extra-plan/lib/preset-settings.js | effectivePluginsOf | L306-315 | 统一解析 profile override → Loader config → inherited 的生效 plugins |  |
| plugins/dsh-extra-plan/lib/preset-settings.js | hostRowDefaultsFromTemplate | L318-332 | 统一从模板 sourceLocator 捕获 webFetch/toolPresentationMode 默认，失败回退内置值 |  |
| plugins/dsh-extra-plan/lib/preset-settings.js | captureRowSettings | L339-355 | **权威值捕获（settings 行，10 项）**：逐项按 rowLocator 解析且不并别名，states 四态（missing/ambiguous/invalid/captured），仅 captured 归一后进 values；额外返回 rowPresent（行在不在）以区分「不可判定」与「行在但缺项（可一次性回填）」 |  |
| plugins/dsh-extra-plan/lib/preset-settings.js | findPluginsRow | L358-369 | 声明行 config.plugins 内按 id 深度优先定位子行（含 group 行的 config 子行数组），未命中返回 null |  |
| plugins/dsh-extra-plan/lib/preset-settings.js | readProjectedValue | L376-384 | **投影现值读取**：按 descriptor.projectionLocator 定位声明行子行 + 叶键，值经 validator 校验后归一返回；子行缺失/叶缺失/非法一律 undefined（判定侧按出厂默认参与比较 → 投影被删是无害状态） | 只服务 2 项宿主行设置；权威值不走这里 |
| plugins/dsh-extra-plan/lib/preset-settings.js | restatePluginsRow | L387-394 | 声明行 plugins 深拷贝后整体重述：只把目标子行的 config 键浅合并（config 不深合并语义），子行缺失返回 null |  |
| plugins/dsh-extra-plan/lib/preset-settings.js | inlineCommentIndex | L396-414 | 找行内注释起始下标（跟踪单/双引号与 '' 转义，仅 # 前有空白或行首才算），无则 -1 |  |
| plugins/dsh-extra-plan/lib/preset-settings.js | lineIndent | L416-419 | 行首空格数（缩进量）；与 qqbot heal.js 同名函数无关 |  |
| plugins/dsh-extra-plan/lib/preset-settings.js | withoutCr | L421-423 | 去掉行尾 CR，兼容 CRLF 文本 |  |
| plugins/dsh-extra-plan/lib/preset-settings.js | parseRowId | L425-437 | 解析 '- id: xxx' 行的 id（先去行内注释、再解单/双引号写法），非 id 行返回 null |  |
| plugins/dsh-extra-plan/lib/preset-settings.js | parseMapKey | L439-443 | 映射行 → {key,indent}（'-' 开头的数组项返回 null） |  |
| plugins/dsh-extra-plan/lib/preset-settings.js | rowEnd | L445-453 | 求所在块结束行：跳过空行/注释，遇缩进 ≤ 本行缩进即返回其行号，否则返回总行数 |  |
| plugins/dsh-extra-plan/lib/preset-settings.js | findDirectKey | L455-473 | 在 [start,end) 内按首个子键缩进寻找父块直属子键 key 的行号；找不到返回 null |  |
| plugins/dsh-extra-plan/lib/preset-settings.js | textPathLine | L475-487 | 沿点分 path 逐层下钻定位，返回路径末段所在行号；任一段缺失返回 null |  |
| plugins/dsh-extra-plan/lib/preset-settings.js | findTextLocatorMatches | L489-501 | 在 YAML 原文中定位 pluginId 行并下钻路径 → [{rowStart,rowEnd,line}] |  |
| plugins/dsh-extra-plan/lib/preset-settings.js | yamlString | L503-507 | 字符串 → YAML 标量：含换行用 JSON 双引号形式，否则单引号包裹并把 ' 转成 '' |  |
| plugins/dsh-extra-plan/lib/preset-settings.js | serializeScalar | L509-513 | 按 scalarType 把值序列化成 YAML 标量文本（boolean/integer/其余走 yamlString） |  |
| plugins/dsh-extra-plan/lib/preset-settings.js | escapeRegex | L515-517 | 逐字符转义正则元字符，把键名安全拼进正则 |  |
| plugins/dsh-extra-plan/lib/preset-settings.js | replaceLineScalar | L519-531 | 保格式替换某键的标量值（保留缩进、值前后空白、行内注释与 CR）；键行不匹配返回 null |  |
| plugins/dsh-extra-plan/lib/preset-settings.js | isBlockScalarLine | L533-543 | 判断该键的值是否块标量（以竖线或 > 开头，忽略行内注释） |  |
| plugins/dsh-extra-plan/lib/preset-settings.js | scalarTypeFor | L545-550 | 参数归一化：传 descriptor 取 .scalarType，否则缺省 'string' |  |
| plugins/dsh-extra-plan/lib/preset-settings.js | patchYamlScalar | L556-582 | 保格式定点改写 YAML 标量 → {ok,text,line}，或 {ok:false,reason:'missing'／'ambiguous'}；纯字符串处理不写文件 |  |
| plugins/dsh-extra-plan/lib/preset-sync.js | defaultDshHome | L54-58 | DSH_HOME 决议：环境变量非空取环境变量，缺失/空串回退 ~/.dsh |  |
| plugins/dsh-extra-plan/lib/preset-sync.js | contentHash | L61-69 | 预设资产内容哈希 |  |
| plugins/dsh-extra-plan/lib/preset-sync.js | pluginRowIds | L72-84 | 声明行 plugins 的行 id 集合（含 group 行 config 子行数组，扁平化；空串与非对象行跳过） |  |
| plugins/dsh-extra-plan/lib/preset-sync.js | visit | L74-81 | 递归遍历 plugins 行数组：字符串 id 推入 ids，遇 config 数组继续下钻（非数组直接返回） | pluginRowIds 内部闭包 |
| plugins/dsh-extra-plan/lib/preset-sync.js | declarationCoversAsset | L87-91 | 声明行是否仍承载本预设组合：行 id 集合覆盖 DECLARATION_ROW_IDS（extra-plan + 2 项宿主行 id），非数组一律 false |  |
| plugins/dsh-extra-plan/lib/preset-sync.js | userWritableByRow | L102-119 | 用户可写位置表（行 id → 该行「用户可改」的 config 键集合）：唯一来源 = HOST_ROW_SETTING_DEFINITIONS.**projectionLocator**（声明行子行 tool-web.fetch / tool-presentation.mode —— 权威值已上移 settings 行，本体剥离只看声明行）与 GATE_WORDS_GROUP_DEFINITION（extra-plan.gateWords）；**与搬运写回清单严格同源，剥离表与写回清单必须恒等** |  |
| plugins/dsh-extra-plan/lib/preset-sync.js | push | L104-112 | 归一化 `config.` 前缀后的单键写入表（含点号的多级路径与空键一律忽略） | userWritableByRow 内部闭包 |
| plugins/dsh-extra-plan/lib/preset-sync.js | stripUserWritable | L122-143 | 剥离用户可写键（置 `__user__` 占位、保持键序与结构）得到「本体」视图；递归处理 group 行的 config 数组 |  |
| plugins/dsh-extra-plan/lib/preset-sync.js | stripRow | L125-141 | 单行剥离：group 行递归下钻、命中行按可写键集合置占位（仅替换已存在的键） | stripUserWritable 内部闭包 |
| plugins/dsh-extra-plan/lib/preset-sync.js | declarationBodyMatchesAsset | L149-152 | 声明行「本体」是否与资产一致（剥离用户可写键后逐字比 JSON）；任一输入非数组 → 保守 true（不触发重建，信息不全时绝不改写现场） |  |
| plugins/dsh-extra-plan/lib/preset-sync.js | carryUserWritable | L159-193 | 从现有声明行抽出用户可写项（与剥离表同源）：显式迁移值缺省时的用户值来源；**旧副本缺席（source: absent）时靠它保住现场定制**（2 项宿主行 + 7 词） |  |
| plugins/dsh-extra-plan/lib/preset-sync.js | visit | L168-190 | 递归遍历 plugins（含 group 子行），按剥离表抽出用户可写键值 → hostRowConfig / gateWords | carryUserWritable 内部闭包 |
| plugins/dsh-extra-plan/lib/preset-sync.js | effectiveRowConfig | L202-215 | **权威值读取原语**：宿主 configuration() 行 → 生效 config（inherited 层 → Loader 行 declared config → profile override 浅合并，高优先层胜）；宿主 override 就是该行 config 本身，另兼容 override.config 行节点形状；无层 → null（不可判定） | settings.js 与 preset-sync.js 共用（同一实现，单点） |
| plugins/dsh-extra-plan/lib/preset-sync.js | isPlain | L204 | 纯对象判定（非 null、非数组）——层合并前的过滤条件 | effectiveRowConfig 内部闭包 |
| plugins/dsh-extra-plan/lib/preset-sync.js | readAuthoritySettings | L225-247 | **权威值上移读取**：settings 行 = 10 项设置的唯一权威落点 —— 宿主侧取 options.settingsValues（present=true），夹具侧由 options.readPatch() 文本经 captureRowSettings 捕获（rowPresent 区分「行缺席」与「行在但缺项」）；两者皆无 → { present:false, values:{} }，信息不全时不改写现场 |  |
| plugins/dsh-extra-plan/lib/preset-sync.js | projectionLeafExists | L256-261 | 投影叶「键在不在」判定（值是否合法另判）：把「键缺失」（无害删除，可稳态 idle）与「键在但值非法」（手改 YAML 等，必须按权威值/出厂值修复）区分开 | planHostRowProjection 内部前置 |
| plugins/dsh-extra-plan/lib/preset-sync.js | planHostRowProjection | L274-312 | **投影一致性判定 + 投影 plan**（纯计算）：期望投影值 = 权威值（settings 行现值 ∪ 迁移值）→ 缺项时取声明行非出厂现值并记 backfill（一次性回填）→ 否则出厂默认；**投影缺失按出厂默认参与比较，故「权威==出厂 且 投影缺失」判一致 = 稳态 idle（不反复重建/不空转写盘）**；键在但值非法一律按期望值修复；hostRowConfig 只含需改写的投影键 |  |
| plugins/dsh-extra-plan/lib/preset-sync.js | captureGateWords | L318-327 | 旧组整组判定：稳定 locator（id=extra-plan + config.gateWords）定位 + 共享 validator 全组校验，返回 captured/missing/ambiguous/invalid 与冻结词值 |  |
| plugins/dsh-extra-plan/lib/preset-sync.js | assertTemplateGateWords | L330-336 | 厂商模板整组前置校验：缺失/非法一律抛错（在 hash/idle 判定与任何目标目录动作之前，坏模板不得进入发布流程） |  |
| plugins/dsh-extra-plan/lib/preset-sync.js | restatePresetPlugins | L339-379 | 声明行 plugins 整体重述：**base 优先取 basePlugins（厂商模板）**，缺省才回落 current.plugins → inherited.plugins；再写回用户可写项 —— 宿主行 config 取「显式迁移值优先、carry（当前声明行）兜底」，gateWords 显式路径整组 validateGateWords（失败即抛）、carry 路径容错（非法则保留基底词表，不阻断本体刷新） |  |
| plugins/dsh-extra-plan/lib/preset-sync.js | syncPreset | L392-438 | 三条件（声明覆盖资产、本体剥离一致、投影一致）成立才 idle（空闲稳态）；否则按资产重建、回填/投影用户值并经 configEditor 落地，无运行期台账。 | action 恒 `written`；无旧迁移链 |
| plugins/dsh-extra-plan/lib/preset-sync.js | readDeclaredPluginsFromPatch | L441-463 | 从 profile patch 文本旁路读声明行 config.plugins（DFS 找 id=PRESET_ROW_ID 的行）；空文本、YAML 非法或未命中返回 undefined |  |
| plugins/dsh-extra-plan/lib/preset-sync.js | visit | L450-460 | 递归遍历解析结果（数组逐项、对象逐值），把 id=PRESET_ROW_ID 且 config.plugins 为数组的行 plugins 推入 found | readDeclaredPluginsFromPatch 内部闭包 |
| plugins/dsh-extra-plan/lib/preset-sync.js | assetPlugins | L469-476 | 厂商模板（资产 patch）里的声明行 plugins —— 本体同步的基底来源；资产缺失或解析失败一律 undefined（调用方回落既有行为，绝不破坏现场） |  |
| plugins/dsh-extra-plan/lib/preset-sync.js | apply | L485-514 | 插件入口：ctx.inject([configEditor]) 取编辑器后调 syncPreset（**同时取 settings 行生效 config 作权威值 settingsValues**，写盘只经 configEditor.edit） |  |
| plugins/dsh-extra-plan/lib/preset-sync.js | applyPlan | L516-538 | 落地回调：按 plan 用 configEditor.edit 改 settings 行（浅合并 values —— 迁移值 + 一次性回填值，**权威值落点**）；**声明行写入条件 = 有旧副本可迁移（plan.preset≠null）或 本体过期（plan.bodyStale===true）**，经 restatePresetPlugins(current, inherited, presetPlan, assetPlugins()) 以厂商模板为基底重建 + 按权威值投影宿主行 + 写回用户值；目标行缺失即抛 |  |
| plugins/dsh-extra-plan/lib/preset-sync.js | findEntry | L517-520 | 按 id 在 configuration() 行里找 entry（entry.options.id 命中），未命中返回 undefined | applyPlan 内部闭包 |
| plugins/dsh-extra-plan/lib/run-code-static.js | runCodeTextOf | L20-24 | 提取 run_code 的 code 参数文本 |  |
| plugins/dsh-extra-plan/lib/run-code-static.js | codeMutationHints | L27-35 | 对文本扫描 RUNCODE_MUTATION_HINTS 返回命中写暗示 id 列表 |  |
| plugins/dsh-extra-plan/lib/run-code-static.js | parseStaticLiteral | L39-173 | 安全静态 literal 入口：JSON.parse 快路径 + 无执行 JS literal 子集；重复/污染键与动态语法拒绝并返回 argsText |  |
| plugins/dsh-extra-plan/lib/run-code-static.js | fail | L50 | 静态 literal 解析失败控制流抛错，不执行输入文本 |  |
| plugins/dsh-extra-plan/lib/run-code-static.js | skipWhitespace | L51-53 | 跳过安全 literal 中允许的空白字符 |  |
| plugins/dsh-extra-plan/lib/run-code-static.js | isIdentifierStart | L54 | 判断对象标识符键起始字符 |  |
| plugins/dsh-extra-plan/lib/run-code-static.js | isIdentifierChar | L55 | 判断标识符键/布尔 null 边界字符 |  |
| plugins/dsh-extra-plan/lib/run-code-static.js | parseString | L57-97 | 解析单/双引号字符串与有限转义，不接受模板插值 |  |
| plugins/dsh-extra-plan/lib/run-code-static.js | parseValue | L99-163 | 递归解析对象/数组、字符串、布尔/null 与有限数字，拒绝调用/成员/污染键 |  |
| plugins/dsh-extra-plan/lib/run-code-static.js | createRunCodeStatic | L175-803 | 创建 run_code 静态 helper 闭包，仅注入 askTool 与双兼容 isDispatchStart |  |
| plugins/dsh-extra-plan/lib/run-code-static.js | maskCodeLiteralsAndComments | L182-220 | 遮蔽字符串/注释为空格（括号配平用） |  |
| plugins/dsh-extra-plan/lib/run-code-static.js | sliceBalancedArgs | L225-241 | 从括号起配平切片参数原文 |  |
| plugins/dsh-extra-plan/lib/run-code-static.js | decomposeRunCode | L252-374 | 静态拆解 run_code 的 code 为工具成员组（含裸写伪工具） |  |
| plugins/dsh-extra-plan/lib/run-code-static.js | addMember | L261-275 | 成员去重添加（decomposeRunCode 内部闭包） |  |
| plugins/dsh-extra-plan/lib/run-code-static.js | markRange | L276-278 | 标记已占用区间（decomposeRunCode 内部闭包） |  |
| plugins/dsh-extra-plan/lib/run-code-static.js | isIdChar | L279 | 标识符字符判定（decomposeRunCode 内部闭包） |  |
| plugins/dsh-extra-plan/lib/run-code-static.js | runCodeCatchGateReason | L380-452 | run_code 多调用容错闸门：tools.* 调用点≥2 时要求每点独立容错，不足即教学式拒绝（单调用豁免；嵌套展平） |  |
| plugins/dsh-extra-plan/lib/run-code-static.js | within | L408 | 调用点区间包含判定（site.start 是否落在 a、b 之间）：把调用点归入 try 块或数组实参区间 |  |
| plugins/dsh-extra-plan/lib/run-code-static.js | collectRunCodeSites | L457-540 | run_code 调用点收集：跳过字符串/注释，识别 tools.x、tools['lit']、tools[var] |  |
| plugins/dsh-extra-plan/lib/run-code-static.js | askUserQuestionReturnGateReason | L544-736 | 主会话 run_code 的 ask 返回链闸门：允许直接 return-await 或变量接收后紧随顶层 return 引用结果，拒绝无法证明返回链的形态 |  |
| plugins/dsh-extra-plan/lib/run-code-static.js | isIdChar | L549 | 标识符字符判定（askUserQuestionReturnGateReason 内部闭包） |  |
| plugins/dsh-extra-plan/lib/run-code-static.js | skipWs | L550-554 | 自 start 起跳过空白字符，返回首个非空白字符下标（词法扫描的跳白工具） |  |
| plugins/dsh-extra-plan/lib/run-code-static.js | isTopLevel | L636 | 位置是否处于花括号/圆括号/方括号深度全为 0 的顶层语句中 |  |
| plugins/dsh-extra-plan/lib/run-code-static.js | candidateStarts | L637-644 | 收集 pos 之前的顶层语句起点，用于把调用归入所属顶层语句 |  |
| plugins/dsh-extra-plan/lib/run-code-static.js | tokenAt | L645-646 | pos 处是否恰为指定关键字且两侧均为标识符边界 |  |
| plugins/dsh-extra-plan/lib/run-code-static.js | expressionEnd | L647-656 | 求顶层语句的结束下标：顶层分号或语句起始换行 |  |
| plugins/dsh-extra-plan/lib/run-code-static.js | references | L657-672 | 按标识符边界在表达式内查找变量真实引用，排除成员访问与对象键 |  |
| plugins/dsh-extra-plan/lib/run-code-static.js | hasReassignment | L673-690 | 判定变量在表达式内是否被重新赋值，用于否掉被改写的伪白名单形态 |  |
| plugins/dsh-extra-plan/lib/run-code-static.js | afterCall | L691-701 | 取调用点之后的首个有效 token 位置并回传原始 gap，用于校验顶层 return |  |
| plugins/dsh-extra-plan/lib/run-code-static.js | runCodeSiteCount | L740-757 | run_code 静态调用点计数（planner 单实例上限快路径；run_code 调用点自身不计） |  |
| plugins/dsh-extra-plan/lib/run-code-static.js | isRunCodeSubCall | L761-766 | 子调用判定：exec.sub 或 exec.parent!==undefined |  |
| plugins/dsh-extra-plan/lib/run-code-static.js | runCodeDispatchCapText | L769-771 | 单实例子调用超限文案（T3 逐字）：rootCallId 实例子调用数超过 exploreBudget 上限 |  |
| plugins/dsh-extra-plan/lib/run-code-static.js | runCodeDispatchGateReason | L776-790 | 运行时单实例上限（planner）：按 rootCallId 计数，超 cap 返回 T3 文案 |  |
| plugins/dsh-extra-plan/lib/runtime-static.js | causeChainOf | L3-15 | 按显式 depth 提取错误 cause 链 |  |
| plugins/dsh-extra-plan/lib/save-contract.js | sanitizeTaskName | L4-12 | 任务名净化（截断/去非法字符） |  |
| plugins/dsh-extra-plan/lib/save-contract.js | timestampOf | L15-18 | 生成本地 yyyyMMddHHmmss 部分，供公共 timestamp 与 artifact base 使用 |  |
| plugins/dsh-extra-plan/lib/save-contract.js | pad | L16 | timestamp 内部数字补零 |  |
| plugins/dsh-extra-plan/lib/save-contract.js | timestamp | L20-22 | 本地时间戳 yyyyMMddHHmmss（文件名可读且具唯一性） |  |
| plugins/dsh-extra-plan/lib/save-contract.js | sessionTagOf | L26-28 | 会话标识段（去分隔符后取前 8 位字母数字） |  |
| plugins/dsh-extra-plan/lib/save-contract.js | saveArtifactBase | L34-49 | 统一生成任务名+sessionTag+毫秒+process.pid+进程序号的碰撞安全 base |  |
| plugins/dsh-extra-plan/lib/save-contract.js | savePlanBase | L52-54 | save_plan 文件名 base（任务短名 + 会话标识段 + 时间戳） |  |
| plugins/dsh-extra-plan/lib/save-contract.js | renderSavePlan | L61-63 | save_plan 结果渲染为单元素 ContentBlock[] |  |
| plugins/dsh-extra-plan/lib/save-contract.js | renderProbeMarkdown | L98-139 | save_probe 线索/证据报告 Markdown 渲染（固定标题与五节模板） |  |
| plugins/dsh-extra-plan/lib/save-contract.js | trimProbeEvidenceDecor | L165-176 | 成对剥除装饰并循环；单侧装饰不剥，`.` 与 `/` 保留，避免误伤合法路径。 | extractProbeEvidenceRefs 整体/逐段调用；step-00 E10-E12 |
| plugins/dsh-extra-plan/lib/save-contract.js | extractProbeEvidenceRefs | L177-190 | 按“整体成对剥除→顿号/分号/竖线拆分→逐段成对剥除→trim→过滤→按序去重”提取证据路径；拆分不含空格/半角逗号。 | step-00 E1-E12 覆盖路径与清洗边界 |
| plugins/dsh-extra-plan/lib/save-contract.js | renderSaveProbe | L194-196 | save_probe 结果渲染为单元素 ContentBlock[] |  |
| plugins/dsh-extra-plan/lib/save-persistence.js | fsOpsOf | L8-11 | 合并末位可选文件系统操作依赖：未提供的操作项回退冻结只读的默认 node:fs 同义实现（另建新对象，不就地改写共享默认集） |  |
| plugins/dsh-extra-plan/lib/save-persistence.js | atomicCommit | L17-47 | 阶段感知提交：mkdir→tmp→journal→逐项 rename→确认目标→清 journal；pre-journal 条件清理，post-journal 失败保留 journal/现场，抛原始错误。 | 末位 fs 依赖可注入；step-06 故障恢复覆盖 |
| plugins/dsh-extra-plan/lib/save-persistence.js | recoveryTargetsOf | L51-60 | journal 只接受非空当前 entries 列表；旧形状/非法形状只告警并保留 journal 与 tmp |  |
| plugins/dsh-extra-plan/lib/save-persistence.js | recoverJournals | L64-85 | journal 崩溃自愈：逐项「tmp 存在则 rename、随后确认目标存在」，已完成项凭目标存在幂等续做，任一项失败保留 journal，全项就位才删；形状非法/目标缺失告警后保留并继续扫其它 journal；兼容新旧形状并按 sessionTag 过滤；末位可选 fs 依赖注入 |  |
| plugins/dsh-extra-plan/lib/save-probe-validation.js | validateProbe | L8-107 | save_probe 参数校验：上限、路径存在性、range/evidence 规则与聚合拒绝 |  |
| plugins/dsh-extra-plan/lib/save-probe-validation.js | probePathOf | L110-113 | 相对路径按 cwd 解析、绝对路径原样返回 |  |
| plugins/dsh-extra-plan/lib/save-tool-factories.js | probeRefDecorationHint | L10-12 | ref 首字符属装饰集（反引号/引号/半全角括号/中文标点等）时返回「疑似含 Markdown 装饰；引用证据请使用裸路径，每条单独一行」提示，否则返回空串 | 工具侧诊断文本（非界面文案）；报错中 ref 一律 JSON.stringify 呈现 |
| plugins/dsh-extra-plan/lib/save-tool-factories.js | createSaveToolFactories | L15-203 | 创建只捕获目录与原子持久化依赖的 save 工具定义工厂；注入依赖：savePlanDir、atomicCommit、recoverJournals |  |
| plugins/dsh-extra-plan/lib/save-tool-factories.js | defineSavePlan | L16-83 | save_plan schema/output/render/execute（双写与证据引用校验） |  |
| plugins/dsh-extra-plan/lib/save-tool-factories.js | defineSaveProbe | L85-200 | save_probe schema/output/render/execute（限制校验与线索/证据落盘） |  |
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
| plugins/dsh-extra-plan/lib/settings.js | isLoopback | L68-71 | 环回地址判定（API 仅本机） |  |
| plugins/dsh-extra-plan/lib/settings.js | json | L73-76 | HTTP JSON 响应 |  |
| plugins/dsh-extra-plan/lib/settings.js | readJsonBody | L78-96 | 读取请求体（限 1MB） |  |
| plugins/dsh-extra-plan/lib/settings.js | findPresetRow | L98-101 | 从 configEditor.configuration() 中按 entry.options.id=PRESET_ROW_ID 找声明行，未命中返回 undefined |  |
| plugins/dsh-extra-plan/lib/settings.js | findSettingsRow | L104-107 | 从 configEditor.configuration() 中按 entry.options.id=SETTINGS_ROW_ID 找 settings 行（**权威值载体**，GET 三层回退的首选读取层），未命中返回 undefined |  |
| plugins/dsh-extra-plan/lib/settings.js | readHostRowState | L114-143 | GET 只读语义（三层回退）：**权威值 = settings 行 config.<key>** → 权威缺失/非法时回落「声明行投影现值」→ 再缺失取出厂默认；返回 { located, values, defaults, overridden, sources }（sources 记 settings-row/projection/default 供取证） |  |
| plugins/dsh-extra-plan/lib/settings.js | publicField | L145-159 | 把 descriptor 构造成设置页字段描述：key/type/control/locale + 可选 options、optionLocale + value/default/overridden + source（取值层来源） |  |
| plugins/dsh-extra-plan/lib/settings.js | proPayload | L161-174 | 设置页 API 响应体：fields（2 项宿主行的控件元数据 + 当期值/默认/覆盖标记/来源层）+ values + defaults；读取失败一律回落出厂默认（不抛） |  |
| plugins/dsh-extra-plan/lib/settings.js | createApiHandler | L176-252 | GET/PUT loopback API：GET 按 settings 权威值→声明行投影→默认回退；PUT 校验后只投影，深等 no-op 不写盘，回执用 `projection.applied` 表达领域结果。 | 不含 qqbot；失败不伪装为写入成功 |
| plugins/dsh-extra-plan/lib/settings.js | apply | L254-268 | 插件入口（HTTP 服务注册） |  |
| plugins/dsh-extra-plan/lib/shell-mutation.js | commandTextOf | L28-40 | 解码对象/JSON 字符串两形状的 command 参数 |  |
| plugins/dsh-extra-plan/lib/shell-mutation.js | pwshCommandOf | L42 | 提取 pwsh command 文本 |  |
| plugins/dsh-extra-plan/lib/shell-mutation.js | bashCommandOf | L43 | 提取 bash command 文本 |  |
| plugins/dsh-extra-plan/lib/shell-mutation.js | mutationTextMatches | L48-74 | 按正则、段首词与内嵌 shell 深度判定写操作 |  |
| plugins/dsh-extra-plan/lib/shell-mutation.js | mutationMatches | L76-79 | 组合 command 提取与写模式判定 |  |
| plugins/dsh-extra-plan/lib/shell-mutation.js | pwshMutationMatches | L81 | 判定 pwsh 命令是否包含写操作 |  |
| plugins/dsh-extra-plan/lib/shell-mutation.js | bashMutationMatches | L82 | 判定 bash 命令是否包含写操作 |  |
| plugins/dsh-extra-plan/scripts/generate-runtime-defaults.mjs | renderRuntimeDefaults | L22-32 | 校验模板并渲染 DEFAULT_EXPLORE_BUDGET 与 DEFAULT_PLANNER_PROMPT_SUFFIX 两个默认常量生成文本 |  |
| plugins/dsh-extra-plan/scripts/generate-runtime-defaults.mjs | topLevelRowsOf | L39-48 | 抽取 agent.cordis.yml 顶层条目区间（首个根级「- id:/insert:」行到末个非空行）；缺失/空即抛，注释、锚点、!!js 与 isolate 键逐字保留 |  |
| plugins/dsh-extra-plan/scripts/generate-runtime-defaults.mjs | indentBlock | L50-53 | 整段平移 PLUGINS_INDENT 列缩进（空行保持空行），供声明行 config.plugins 嵌套 |  |
| plugins/dsh-extra-plan/scripts/generate-runtime-defaults.mjs | quoteYamlSingle | L55-57 | YAML 单引号标量：整体加单引号并把内部单引号双写 |  |
| plugins/dsh-extra-plan/scripts/generate-runtime-defaults.mjs | renderPresetPatch | L59-80 | 生成 preset-patch.generated.yml 文本：校验 preset.yml 的 name/description 后拼声明行头（insert + preset-extra-plan 行 + order/plugins）并接整段平移后的顶层条目 |  |
| plugins/dsh-extra-plan/scripts/generate-runtime-defaults.mjs | assertParses | L82-88 | 用 parsePresetYaml 预解析校验文本，失败抛出带标签的 YAML parse failed 错误 |  |
| plugins/dsh-extra-plan/scripts/generate-runtime-defaults.mjs | writeOrCheck | L90-99 | --check 模式只比对产物（缺失或文本不一致即抛），否则 mkdir -p 后写盘 |  |
| plugins/dsh-extra-plan/scripts/generate-runtime-defaults.mjs | generateRuntimeDefaults | L106-138 | 先校验再生成或 --check 比对，失败保留旧生成物 |  |
| plugins/dsh-extra-plan/scripts/generate-runtime-defaults.mjs | invokedAsMain | L140-143 | 跨平台判断脚本是否作为 CLI 主入口运行 |  |
| plugins/dsh-qqbot-user-questions/index.js | apply | L11-20 | 插件入口：apply 启动时调 healQqbotCompatibility 自愈（迁移旧错误块+建链；try/catch 不阻断启动） |  |
| plugins/dsh-qqbot-user-questions/lib/heal.js | loadYamlModule | L14-24 | js-yaml 双 fallback（回退） 加载（本地 createRequire 失败回退官方 APPDATA DSH 包）；惰性缓存，导入零副作用 |  |
| plugins/dsh-qqbot-user-questions/lib/heal.js | timestamp | L26-30 | 时间戳 yyyyMMddHHmmssSSS（备份文件名唯一性，含毫秒） |  |
| plugins/dsh-qqbot-user-questions/lib/heal.js | pad | L28 | 数字补零（timestamp 内部闭包） |  |
| plugins/dsh-qqbot-user-questions/lib/heal.js | isObject | L56-58 | 非空普通对象判定（排除 null/数组） |  |
| plugins/dsh-qqbot-user-questions/lib/heal.js | stripBom | L60-62 | 去除行首 BOM（迁移扫描用） |  |
| plugins/dsh-qqbot-user-questions/lib/heal.js | lineIndent | L64-66 | 行首缩进宽度 |  |
| plugins/dsh-qqbot-user-questions/lib/heal.js | isIgnorableLine | L68-71 | 空行/注释行判定（块扫描跳过） |  |
| plugins/dsh-qqbot-user-questions/lib/heal.js | parseScalar | L73-81 | YAML 标量去引号（单/双引号成对时剥离） |  |
| plugins/dsh-qqbot-user-questions/lib/heal.js | parseEntryBlock | L83-91 | 条目块文本解析为单个对象（js-yaml；失败/非单元素 → null） |  |
| plugins/dsh-qqbot-user-questions/lib/heal.js | legacyEntryKind | L93-103 | 旧版根级完整块匹配（id+name[+config.default=standard]）→ 返回 id 或 null |  |
| plugins/dsh-qqbot-user-questions/lib/heal.js | fallbackLegacyEntryKind | L105-140 | js-yaml 不可用时按行匹配旧版根级块（id/name/config.default 逐行核对） | 行号区间由生成器按单行箭头函数链展开维护 |
| plugins/dsh-qqbot-user-questions/lib/heal.js | rootSequenceIndent | L142-152 | 根级序列缩进探测（首条 - 行的缩进宽度） |  |
| plugins/dsh-qqbot-user-questions/lib/heal.js | isRootSequenceLine | L154-158 | 指定缩进处的根级序列行判定 |  |
| plugins/dsh-qqbot-user-questions/lib/heal.js | scanRootBlocks | L160-186 | 按根级缩进切分顶层条目块（返回 lines/rootIndent/blocks） |  |
| plugins/dsh-qqbot-user-questions/lib/heal.js | findLegacyRootBlocks | L188-198 | 扫描并返回旧版根级块清单（解析判定优先、行级兜底） |  |
| plugins/dsh-qqbot-user-questions/lib/heal.js | removeLegacyRootBlocks | L200-211 | 移除旧版根级块（移除后无实质内容时写顶层 []） |  |
| plugins/dsh-qqbot-user-questions/lib/heal.js | verifyMigratedPatch | L213-238 | 迁移后校验：顶层为数组且无旧块残留（js-yaml 优先、行级兜底） |  |
| plugins/dsh-qqbot-user-questions/lib/heal.js | emptyArrayLine | L226 | 顶层空数组行（[]）判定（行级兜底用） |  |
| plugins/dsh-qqbot-user-questions/lib/heal.js | healPatchRows | L248-286 | 幂等**迁移**旧版根级 code-runtime/agent-presets 错误块（语义是移除旧块，两行补入由包内静态 cordis.patch.yml 的 insert 唯一提供）；写前 .bak-* 备份、写后校验失败恢复；文件不存在跳过 | 函数名带 Patch/补行语义易误读，实为「清旧块」；旧描述「补两行」已失效（2026-09-12 订正） |
| plugins/dsh-qqbot-user-questions/lib/heal.js | findOwnQqbotProfiles | L294-314 | 扫描 $DSH_HOME/profiles/* 找出锚定本插件的 qqbot profile（bundles + node_modules 双条件） |  |
| plugins/dsh-qqbot-user-questions/lib/heal.js | ensureDshExtraPlanLink | L322-352 | 建 @local/dsh-extra-plan → web 包链接：web 缺失跳过/已正确不动/实体或非目标链接提示 pnpm 迁移/仅 ENOENT 建 junction |  |
| plugins/dsh-qqbot-user-questions/lib/heal.js | healQqbotCompatibility | L358-371 | 对每个自有 profile 依次执行 healPatchRows（清旧错误块）与 ensureDshExtraPlanLink（建链）；整体 try/catch 只记录日志不阻断 |  |
| plugins/dsh-qqbot-user-questions/scripts/heal.mjs | invokedAsMain | L9-14 | 主脚本判定（node 直跑时执行自愈；本仓插件 CLI 通用写法） |  |

---

*本文件由脚本增量维护；直接编辑功能描述/备注列是安全的。*
