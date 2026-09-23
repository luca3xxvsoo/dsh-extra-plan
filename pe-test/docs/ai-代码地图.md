# 代码地图（dsh-extra-plan）

> **维护分工**：行号区间/增删行由脚本 node pe-test/tools/代码地图生成.mjs 增量同步；**功能描述、备注、以及「意图速查」整节由 AI/人维护**（脚本刷新不会覆盖）。
> **用法**：先看「意图速查」按意图词找函数名 → 再到「函数索引」按函数名取行号区间 → read 该区间。
> 上次同步：2026-09-23 18:10:06（脚本自动更新时间戳行）

## 意图速查（人工维护：意图词 → 函数名；行号请到下方「函数索引」按函数名取）

> 用法：拿用户/AI 口里的词在「想找什么」列 grep → 得函数名 → 到「函数索引」grep 该函数名 → 取行号区间 → read 该区间。
> 本节引用的函数名若不存在于索引，生成脚本会报 `[导航失效]`（防止入口过期）。

| 想找什么（含同义词/英文标识） | 文件 | 函数名 |
|:--|:--|:--|
| 四级闸门／路由确认／目的确认／批准／流程状态（route/purpose/clarified/approved；路由 ask 标准流程两问、机械层至少两问——第一问固定三选一、第 2 问起纯文本「补充要求」不得带非空 options；目的 ask 仍单问） | index.js | deriveFlowState、mainGateReason、routeDenyReason、gateAskDenyReason、validateGateAskStructure、matchPurposeLabel |
| 探查预算／额度／剩余次数／耗尽（exploreBudget/budget） | plugins/dsh-extra-plan/lib/planner-budget.js、index.js | toolCallCount、toolCallsSinceUser、withPlannerPromptSuffix、budgetNoticeText、budgetReminderText、budgetExhaustedReason、budgetExceeded |
| run_code 组判定／绕道拆解／调用点扫描（decompose） | plugins/dsh-extra-plan/lib/run-code-static.js、plugins/dsh-extra-plan/index.js | decomposeRunCode、collectRunCodeSites、runCodeGroupDenyReason |
| run_code 多调用容错／教学文案（容错检查开关） | plugins/dsh-extra-plan/lib/run-code-static.js | runCodeCatchGateReason |
| ask 结果返回用户层／返回链闸门 | plugins/dsh-extra-plan/lib/run-code-static.js | askUserQuestionReturnGateReason |
| 单实例调用点上限／循环放大 | plugins/dsh-extra-plan/lib/run-code-static.js | runCodeSiteCount、runCodeDispatchGateReason、runCodeDispatchCapText |
| job_output 禁 wait:true／同 job 查重／放行后记录计数器 | index.js | jobOutputGateReason、recordJobOutputCall |
| 命令文本提取／写操作判定／只读角色 shell 拒绝文案／runner 写暗示（write/拦截） | plugins/dsh-extra-plan/lib/shell-mutation.js、index.js、plugins/dsh-extra-plan/lib/run-code-static.js | commandTextOf、pwshCommandOf、bashCommandOf、mutationTextMatches、pwshMutationMatches、bashMutationMatches、shellMutationReason、runCodeTextOf、codeMutationHints |
| 锚定引导／F-L 首轮极简／bootstrap／HN-HB-HP／F 段 tool:read 手写文案（bootstrapReadHint） | index.js、plugins/dsh-extra-plan/lib/assembly-presentation.js | isBootstrapPhase、projectAssemblyForPresentation |
| A/C/M 展示投影／C7 过滤／Pure PTC 手写 read（变量② bootstrapReadHint）／SDK 重建 | index.js、plugins/dsh-extra-plan/lib/assembly-presentation.js | projectAssemblyForPresentation、renderFilteredToolsSdk、resolveToolsSdkRenderer、filteredCordisSchemas、sdkSchemasForRendering、toolSdkSchemasOf |
| P2-2 SDK 文本复用／agent-only cache／F-L 分离／三元组失效／dispose-restart／失败不缓存／并发合并／计数硬门槛 | index.js、plugins/dsh-extra-plan/lib/assembly-presentation.js、plugins/dsh-extra-plan/lib/sdk-text-cache.js | createSdkTextCache、sdkSchemasFingerprint、sdkTextCacheEntryMatches |
| skill catalog 暂隐／普通 skill 保留／HP1 | index.js、plugins/dsh-extra-plan/lib/assembly-presentation.js | skillCatalogEntriesOf、renderSkillCatalogText、projectSkillCatalogDecision、shouldHideCreativeCatalog |
| 方案/询问工具在未确认路由下的拒绝文案（plan route） | index.js | planDenyReason |
| 批准前禁委派（approval deny） | index.js | approvalDenyReason |
| 规划子代理分支闸门（planner 写禁+预算） | index.js | plannerGateReason、shellMutationReason |
| 会话事件快照/子代理角色识别／单次快照复用（execEvents）／planner descriptor 缓存／events 可选入参 | lib/agent-session.js、lib/agent-runtime.js、index.js | sessionEvents、isSubagentChild、isLiveDelegation、childPolicyNeedsFloor、createAgentRuntime、isChild、isPlannerChild、toolSchemasOf、usageRoleOf、childBaseline |
| 会话状态生命周期／disposed 收尾／末轮 usage 结算／usage 账本续载／可信用量字段（provider/cw/rs）（session 分桶、final flush、cursor 降级、session.seq 水位 + snapshotEvents(from,to) 区间增量、水位未变直接返回、截断回退全量） | index.js、lib/agent-runtime.js | foldUsage、readUsageCursorTable、warnUsageCursorDegraded、usageCursorEntryOf、usageRoleOf、noteRunCodeSubCall、childBaseline |
| 方案与验收落盘／save_plan 双写（plan/checklist；主会话侧任意路由态放行的受限规划工件，仅写 cwd/.extra-plan） | lib/save-tool-factories.js、lib/save-contract.js、index.js | defineSavePlan、registerSavePlan、savePlanBase |
| 落盘原子提交／journal 崩溃自愈（atomic/commit） | lib/save-persistence.js、index.js | atomicCommit、recoverJournals |
| 线索落盘／save_probe／证据报告（probe/evidence；PROBE_LIMITS evidence=150/text=1000；step-00 PR23=151、PR34/PR35；主会话侧放行条件保持现状——route=plan + 目的已定 + 澄清完成） | lib/save-contract.js、lib/save-probe-validation.js、lib/save-tool-factories.js、index.js | validateProbe、renderProbeMarkdown、extractProbeEvidenceRefs |
| save 合同／限制值／ContentBlock 渲染（11 个导出 = 8 个函数 + 3 个常量 PROBE_LIMITS、LINE_FORMAT_HINT、RANGE_FORMAT_HINT） | lib/save-contract.js | sanitizeTaskName、timestamp、sessionTagOf、savePlanBase、renderSavePlan、renderProbeMarkdown、renderSaveProbe、extractProbeEvidenceRefs |
| save_probe 校验／路径存在性与聚合拒绝 | lib/save-probe-validation.js | validateProbe、probePathOf |
| save 工具显式依赖工厂 | lib/save-tool-factories.js | createSaveToolFactories、defineSavePlan、defineSaveProbe |
| PTC F→L／native-both HN-HB 实机取证 | pe-test/docs/ai-实机闸门测试流程.md |  |
| 实机子代理模型／提供方／planner 引导取证（A42/A43、C11/C12、HUMAN；显式 SESSION_ID + PLANNER_PROMPT_SUFFIX；request/header attempted route 与 assistant/message actual provenance 分栏；suffix 等级与完整文本；两阶段头扫描 `headerOfDir` 只解析命中直接 child、事件不保留 raw，默认堆可跑通） | pe-test/tools/step-07-子代理模型与引导取证.mjs |  |
| 120格 A/C/M/F-L 路由与目录断言／显式 header catalog 取证 | pe-test/tools/step-04-路由与写闸门.mjs、pe-test/tools/step-04-工具清单查看.mjs |  |
| 探查者委派／禁止 planner 派探查（subagent_probe） | index.js、plugins/dsh-extra-plan/lib/model-routing.js | subagentProbeGateReason、resolveOtherAgentEntry |
| 只读子代理／验收者只读（reviewer/readonly） | index.js | childReadonlyGateReason、shellMutationReason、isReadOnlyChildByCatalog |
| 子代理沙箱下限／权限抬升（floor/sandbox） | lib/agent-runtime.js、index.js | childPolicyNeedsFloor、createAgentRuntime |
| 工具目录折叠／PTC 单入口（catalog/ptc） | index.js | catalogIsCollapsed |
| planner/其他子代理模型与跨 Provider 真实探针／plannerModel/otherAgentModel（T2/T4；候选探针有界并发池 PLANNER_PROBE_CONCURRENCY=5，按发起顺序收集后排序） | plugins/dsh-extra-plan/lib/model-routing.js | probePlannerCandidates、resolvePlannerEntry、resolvePlannerEntryLegacy、resolvePlannerEntryStrict、resolveOtherAgentEntry、resolveOtherAgentEntryLegacy、resolveOtherAgentEntryStrict、resolveAgentRouteSources、probePlannerRoute、withPlannerProbeDeadline、sortPlannerCandidates、decidePlannerModelUse |
| 设置页读写／配置项真源（settings/descriptor） | lib/settings.js、lib/preset-settings.js | createApiHandler、publicSettingMetadata、patchYamlScalar |
| 配置热读／生效标志／改 YAML 不重启（live-config/hot-read/DSH_EXTRA_PLAN_CONFIG_PATH/mtime+size） | plugins/dsh-extra-plan/lib/live-config.js、plugins/dsh-extra-plan/index.js | createLiveConfig、refresh、statStamp |
| 预设下发／自愈／hash 比对（preset-sync） | lib/preset-sync.js | syncPreset、stagePreset、switchStage、resolveTemplateSettingDefault |
| 预设分发脚本（distribute） | scripts/distribute-preset.mjs | distribute |
| 设置页前端 UI／卡片（React） | lib/client.js | ProConfigTab、ExtraPlanCard |
| 执行者工具裁剪／deny（executor-spawn） | lib/executor-spawn.js | apply |
| qqbot 兼容自愈／建链 | dsh-qqbot-user-questions/lib/heal.js（选装包，本机未安装） | healQqbotCompatibility、ensureDshExtraPlanLink |
| YAML 默认值真源／生成／last-known-good（exploreBudget） | lib/preset-settings.js、scripts/generate-runtime-defaults.mjs、lib/preset-defaults.generated.js | resolveTemplateSettingDefault、renderRuntimeDefaults、generateRuntimeDefaults |
| 闸门关键词单一来源／7 词唯一手工编辑位／prompt variable 注册／旧词拒绝／严格校验（gateWords/extra_plan_*） | plugins/dsh-extra-plan/assets/presets/extra-plan/agent.cordis.yml、plugins/dsh-extra-plan/lib/gate-words.js、index.js | validateGateWords、createGateRuntime、normalizeGateLabel、matchExactKind、deriveFlowState、mainGateReason |
| gateWords 升级迁移／同 hash idle／hash 变化整组迁移／迁移审计（gateWordsMigration） | plugins/dsh-extra-plan/lib/preset-sync.js | syncPreset、stagePreset、captureGateWords、assertTemplateGateWords、gateReasonForState、emptyGateWordsMigration |
| runtime-static 纯 helper（frontmatter/cause-chain） | lib/runtime-static.js | parseSkillFrontmatter、causeChainOf |
| PTC 拒绝中文呈现／post-execute 失败结果改写／denied 判别（闸门拒绝不重置路由、取消仍清四字段；HOST_ASK_CANCEL_TEXTS 宿主取消句） | index.js | parseAskResultData、parseDispatchAskResult、askResultTextIsDenied、firstTextOfBlocks、deriveFlowState、recordRunCodeDeny |
| 代码地图自身维护／口径／严格模式 | pe-test/tools/代码地图生成.mjs（不在索引范围，读文件头注释） |  |

## 文件总览

| 文件 | 行数 | 说明 |
|:--|--:|:--|
| plugins/dsh-extra-plan/index.js | 2115 | 模式核心：四级闸门（路由/目的/澄清/批准，7 个闸门关键词的唯一值源是 YAML 的 config.gateWords——apply 第一步 createGateRuntime 严格校验并在当前 agent scope 注册 7 个 extra_plan_* 变量，词表作为显式参数贯穿全部 helper/状态机/闸门，JS 侧无内置词值）+ 探查预算 + apply 创建/注册 save 工具工厂并接生命周期/闸门 + planner/非 planner child 双 resolver 与跨 Provider 真实 probe/严格 fallback + A/C/M 展示投影、HP 手写 read 文案（变量② cfg.bootstrapReadHint + 内置兜底，L 段回宿主原文）、HP0/HP1 首轮投影与 HN/HB 基线与 catalog 时序 + L/C=0 SDK 文本 agent-keyed WeakMap 缓存（创建于 apply、agent/disposed 回收）+ 会话状态生命周期（按 sessionId 分桶、agent/disposed 同步 final flush 与单会话回收、usage cursor 单项续载、ledger 行含可信用量字段 provider/cacheWriteTokens/reasoningTokens 且五字段全零不写行）（修改最频繁） |
| plugins/dsh-extra-plan/lib/agent-runtime.js | 111 | 每次 apply 的角色识别、descriptor/工具 schema 缓存、usage role baseline 与 sandbox floor 工厂；不 import index.js |
| plugins/dsh-extra-plan/lib/agent-session.js | 41 | 会话事件与子代理识别的唯一来源：sessionEvents/isSubagentChild 零依赖纯函数，被 index.js 与 lib/model-routing.js 共用（无镜像副本；不 import index.js） |
| plugins/dsh-extra-plan/lib/assembly-presentation.js | 237 | A/C/M 展示投影与 skill catalog 投影：读取 live tools registry（toolRegistryOf/toolSdkSchemasOf/toolPresentationModeOf 读 scoped tools 服务）；SDK renderer 惰性加载缓存（sdkRendererModulePromise）与 active renderer resolver；模块头自述 live 取数已迁入；不再渲染最小 read（三个只服务该旧路径的辅助已整组删除——F 段 tool:read 文本改由 index.js 手写 cfg.bootstrapReadHint） |
| plugins/dsh-extra-plan/lib/client-bridge.js | 19 | 客户端桥接壳：仅承载 dsh.client 加载路径指向 lib/client.js（apply 空实现） |
| plugins/dsh-extra-plan/lib/client.js | 359 | dsh web 设置界面 UI（React；同一外层 esp-card 内有通用设置/pro规划模块两个 esp-section 内嵌卡片；十项字段为名称→metadata 控件→静态 hint→相邻分隔栏；保存 footer 只在外层共享） |
| plugins/dsh-extra-plan/lib/executor-spawn.js | 90 | 执行者子代理 provider：委托宿主 spawn，注入工具 deny（防委派递归/追问） |
| plugins/dsh-extra-plan/lib/gate-words.js | 130 | 闸门关键词共享契约（唯一值源是 YAML 的 config.gateWords）：字段规格 GATE_WORD_FIELDS/GATE_WORDS_GROUP_DEFINITION/7 个 GATE_WORD_MIGRATION_DEFINITIONS + 整组严格校验 validateGateWords（错误一律以 extra-plan: config.gateWords 开头）+ 运行时词表 createGateRuntime（words/route/approval/purpose/三套 Set/options/confirm/variables，无参默认值）；纯模块：不含任何出厂词值、不读文件与环境变量，被 index.js（运行时）与 lib/preset-sync.js（升级迁移）共享 |
| plugins/dsh-extra-plan/lib/live-config.js | 205 | 配置热读：设置页改 YAML 后同会话即时生效（7 项热读；creativeMode 仍为 apply 快照）。路径决议 configPath → DSH_EXTRA_PLAN_CONFIG_PATH → 默认路径（与 settings.js agentCordisPath 同公式）；构造期**无条件读盘一次**、以文件真值作首拍基准（方案 A，2026-09-23：堵住「新会话 apply 传入改前快照且文件 mtimeMs+size 未变 → 首拍读旧值」的边界缺口），读盘成功即记 mtimeMs+size 基线；此后 stamp 未变时零读盘零解析，变了才 readFileSync + captureSettings 全量解析并按 captured 覆盖；仅读盘/解析/取值失败才回退 fallbackDefaults（= apply 期 cfg 快照）+ console.warn 一次；不监听/不轮询/无 per-Agent 失效策略 |
| plugins/dsh-extra-plan/lib/model-routing.js | 543 | planner/非 planner 子代理模型路由：顶层纯判定函数 + createModelRouting per-apply 工厂（per-instance WeakMap、惰性 llm/agents getter；不 import index.js） |
| plugins/dsh-extra-plan/lib/planner-budget.js | 127 | planner 工具计数、消息后缀/预算提示/耗尽文案；默认预算由生成模块提供，FREE_TOOLS 仍在根入口 |
| plugins/dsh-extra-plan/lib/preset-defaults.generated.js | 3 | 由 YAML 模板生成的 runtime fallback 常量；generated/do not edit |
| plugins/dsh-extra-plan/lib/preset-settings.js | 447 | 十项设置描述表（唯一真源，含 creativeMode 默认 false）+ 预设 YAML 解析 + 保格式定点标量改写；plannerModel/otherAgentModel validator 放开空串并 trim |
| plugins/dsh-extra-plan/lib/preset-sync.js | 414 | 预设资产自动下发同步（distHash 比对，幂等）：同 hash → idle（不读改写现场正文）；hash 变化 → 先复制新模板、恢复 10 项 settings、再整组迁移合法旧 gateWords（7 叶定点写回 + 共享 validator 复验，非法/缺失整组用新模板值）；厂商模板 gateWords 在 hash/idle 判定前严格校验；manifest format=2 + settingsMigration 10 项 + 并列加法字段 gateWordsMigration 7 项（只记状态不记词值） |
| plugins/dsh-extra-plan/lib/run-code-static.js | 678 | run_code 纯静态解析/理由模块：写模式 hint、工具组拆解、ask 返回值白名单、调用点计数与双兼容 dispatch cap；仅显式注入普通依赖，不持有宿主状态；导出常量 RUNCODE_MUTATION_HINTS（9 条禁用 API 黑名单）与 runCodeCatchGateReason 内部闭包 scanLayer（单层 try/catch 保护扫描）属常量与跨行 const 箭头，生成器不入函数索引，故仅在此登记 |
| plugins/dsh-extra-plan/lib/runtime-static.js | 27 | 显式参数纯 helper：SKILL frontmatter 与 cause 链解析；不持有宿主状态 |
| plugins/dsh-extra-plan/lib/save-contract.js | 138 | 合同唯一真源：任务名/时间戳/sessionTag/base、PROBE_LIMITS 与 save_plan/save_probe ContentBlock/Markdown 渲染；无宿主状态；PROBE_LIMITS 共 20 个字段（含四类条目数/路径长度/各维度上限/正则/证据维度上限/任务名长度；字段名与上限以本文件 PROBE_LIMITS 为唯一口径）；LINE_FORMAT_HINT / RANGE_FORMAT_HINT 为格式提示常量 |
| plugins/dsh-extra-plan/lib/save-persistence.js | 124 | 阶段感知公共原子落盘与 journal 自愈：tmp→journal→rename→逐项确认目标就位→清 journal；pre-journal 条件清理（先删 journal 并确认不存在才清 tmp）、post-journal 一律保留 journal 与现场、全目标确认后才删 journal；恢复逐项确认目标存在、全项就位才清 journal，形状非法/目标缺失保留 journal 并告警；按 sessionTag 过滤；末位可选 fs 依赖默认同义映射 node:fs（冻结只读、未提供项回退默认） |
| plugins/dsh-extra-plan/lib/save-probe-validation.js | 115 | save_probe 参数校验：数组/条目/长度/总量/path 存在性/range/evidence 聚合拒绝 |
| plugins/dsh-extra-plan/lib/save-tool-factories.js | 192 | 显式依赖工厂：定义 save_plan/save_probe schema/output/render/execute；不缓存 ctx/agent/会话状态 |
| plugins/dsh-extra-plan/lib/sdk-text-cache.js | 161 | apply 级 agent-keyed WeakMap SDK 文本缓存：完整 renderer 输入保守指纹、language/renderer 身份比较、并发 Promise 合并、reject/过期 Promise 不回写、dispose 回收；不持有 sessionId 或 PromptAssembly |
| plugins/dsh-extra-plan/lib/settings.js | 162 | 设置页后端 HTTP API（pro-config；qqbot 相关已随精简版插件移除） |
| plugins/dsh-extra-plan/lib/shell-mutation.js | 86 | 跨平台命令文本解码与 pwsh/bash 写形态判定；纯函数、不持有 apply 状态 |
| plugins/dsh-extra-plan/scripts/distribute-preset.mjs | 40 | 预设分发脚本（安装/更新时写 DSH_HOME/.agent-presets/extra-plan） |
| plugins/dsh-extra-plan/scripts/generate-runtime-defaults.mjs | 55 | 从 agent.cordis.yml 校验并生成 runtime 默认常量；支持 --check 且坏源不覆盖 last-known-good |
| plugins/dsh-qqbot-user-questions/index.js | 24 | qqbot 精简版自愈插件：apply 启动时调 healQqbotCompatibility（迁移旧错误块+建链），不阻断启动 |
| plugins/dsh-qqbot-user-questions/lib/heal.js | 369 | 自愈纯函数模块（定位 profile/旧块迁移/建链；供 index.js/CLI/测试复用） |
| plugins/dsh-qqbot-user-questions/scripts/heal.mjs | 26 | CLI 兜底入口（postinstall/手动触发；invokedAsMain 判定） |

## 函数索引

| 文件 | 函数 | 行号 | 功能描述 | 备注 |
|:--|:--|:--|:--|:--|
| plugins/dsh-extra-plan/index.js | purposeRouteDenyReason | L122-124 | 精确目的 ask 在非 plan 路由下的固定路由确认拒绝文案（文案由本次 apply 的 gateRuntime.confirm.route / options.purpose 插值） |  |
| plugins/dsh-extra-plan/index.js | routeDenyReason | L127-132 | 路由未确认时 write/edit/写shell 的拒绝文案（提示先做路由确认）；文案由本次 apply 的 gateRuntime.confirm.route 插值（helper 显式收 gateRuntime，无默认词表） |  |
| plugins/dsh-extra-plan/index.js | planDenyReason | L133-144 | plan 路由下 save_probe/subagent_plan 前置条件未满足的拒绝文案（直行态提示与确认句均由 gateRuntime 词值/文案插值） |  |
| plugins/dsh-extra-plan/index.js | approvalDenyReason | L145-147 | 批准前禁止执行委派类工具（subagent/workflow/ralph）拒绝文案 |  |
| plugins/dsh-extra-plan/index.js | isDispatchStart | L164 | 双兼容事件名判定：命中 DISPATCH_START 集合（新名 tool/ptc-dispatch-start = 0.1.5-rc.2 / 旧名 tool/code-dispatch-start = 0.1.2-rc.1） |  |
| plugins/dsh-extra-plan/index.js | isDispatch | L165-168 | 双兼容事件名判定：命中 DISPATCH 集合（新名 tool/ptc-dispatch = 0.1.5-rc.2 / 旧名 tool/code-dispatch = 0.1.2-rc.1） |  |
| plugins/dsh-extra-plan/index.js | isBootstrapPhase | L185-195 | anchored 引导阶段判定（首个工具调用前） |  |
| plugins/dsh-extra-plan/index.js | labelsOfCallData | L202-218 | 从 ask 调用数据提取选项 label 集合 |  |
| plugins/dsh-extra-plan/index.js | normalizeLabel | L229-231 | label 规范化（空白清理） |  |
| plugins/dsh-extra-plan/index.js | isExactGateSet | L234-241 | label 集合与本次 gateRuntime 的 route/approval/purpose 集合完全一致判定（归一后精确比较，集合为运行时词表） |  |
| plugins/dsh-extra-plan/index.js | isPartialGateSet | L244-252 | label 与闸门词部分包含判定（indexOf 子串）：只用于 malformed ask 教学文案，绝不用于推进 route/purpose/approved |  |
| plugins/dsh-extra-plan/index.js | categorizeGateAsk | L255-259 | ask 分类（standard/malformed/ordinary）；三套词集来自入参 gateRuntime；partial 子串判断只服务当前词的 malformed 教学拒绝，不推进状态 |  |
| plugins/dsh-extra-plan/index.js | gateAskDenyReason | L262-298 | 生成标准闸门 ask 选项/结构错误的拒绝理由；模板与缺项均按当前 gateRuntime 词值插值（出厂值下与历史逐字相同） |  |
| plugins/dsh-extra-plan/index.js | validateGateAskStructure | L304-331 | 校验路由/目的/批准 ask 结构（选项文案由入参 gateRuntime 插值）（问题数、固定选项）：路由与批准均须 ≥2 问、第 2 问起不得带非空 options（路由第二问「补充要求」、批准第二问「修改意见」，均须纯文本）；目的 ask 仍须恰好 1 问 |  |
| plugins/dsh-extra-plan/index.js | askKindOf | L338-355 | 从 label 判定 ask 类型（route/approve/purpose）；词值来自入参 gateRuntime（测试契约 API，仅经 decisions 导出） |  |
| plugins/dsh-extra-plan/index.js | askKindOfRelaxed | L362-378 | 宽松判定 ask 类型（特异性词优先：路由→批准→仅共享否决词→目的→澄清）；词值来自入参 gateRuntime（本函数只做分类，不推进状态） |  |
| plugins/dsh-extra-plan/index.js | matchExactKind | L383-391 | 三类 match 的唯一判定内核：标签先按白名单推荐后缀归一（normalizeLabel）再与当前 gateRuntime 词值精确相等才返回内部枚举；禁止 indexOf 子串推进 route/purpose/approved |  |
| plugins/dsh-extra-plan/index.js | matchRouteLabel | L393-400 | 用户选择标签→direct/plan/disagree；仅「推荐后缀归一后精确等于当前 gateRuntime 词值」才返回枚举（matchExactKind 内核，禁止 indexOf） |  |
| plugins/dsh-extra-plan/index.js | matchApprovalLabel | L402-409 | 用户选择标签→approve/replan/disagree；同 matchRouteLabel 的精确匹配口径（归一后等于当前词值才返回枚举） |  |
| plugins/dsh-extra-plan/index.js | matchPurposeLabel | L411-416 | 用户选择标签→refine/redo（第四锚点目的二选一；括号内为出厂示例，实际取值来自当前 config.gateWords） |  |
| plugins/dsh-extra-plan/index.js | firstTextOfBlocks | L419-425 | 取 ContentBlock 数组首条 text 块的文本（无 text 块返回空串）；供 parseAskResultData/parseDispatchAskResult 的拒绝-取消判别读取信封文案 | 纯 helper，无副作用 |
| plugins/dsh-extra-plan/index.js | askResultTextIsDenied | L430-432 | 闸门拒绝判别：以 'Error: ' 开头且不等于 HOST_ASK_CANCEL_TEXTS 任一条 → true（插件中文拒绝文案）；宿主取消句与其它失败 → false | 判别只按文案：嵌套（PTC）路径拒绝与取消同构，唯一差异是文案；常量与注释见 index.js 同区 |
| plugins/dsh-extra-plan/index.js | parseAskResultData | L439-487 | tool/result 解析用户选择（answers.selected）；信封 isError:true 且无 data.error 时按文案二分：中文拒绝文案 → kind:'denied'，取消句/其它 → kind:'error'（code 空）；data.error.code 路径与正常 answers 解析逐字不变 | denied 由 deriveFlowState 判为「不重置」；native 取消码 ASK_CANCELLED 与通道码仍走 error 分支 |
| plugins/dsh-extra-plan/index.js | parseDispatchAskResult | L496-524 | ptc/code-dispatch 的 ask 结果解析（双兼容）；isError:true 时按文案二分：中文拒绝文案 → kind:'denied'，宿主取消句/其它 → kind:'error'（嵌套层无错误码，code 空）；正常答复路径不变 | 取消句逐字常量 HOST_ASK_CANCEL_TEXTS 与判别函数 askResultTextIsDenied（index.js 同区） |
| plugins/dsh-extra-plan/index.js | deriveFlowState | L534-646 | 事件流推导 flow state（route/clarified/approved/purpose/channelBroken）；词表由入参 gateRuntime 提供——改词后旧 label 精确匹配失败，状态保持未确认（历史事件安全）。失败分支（2026-09-23）：kind:'denied'（闸门拒绝）continue 不改任何字段；kind:'error' 里通道码置 channelBroken、其余 resetRouteState 清四字段 | dispatch 与 tool/result 两个分支各有一处 denied 短路，顺序在 error 判定之前；台账 HK25 记录配套的呈现层兜底 |
| plugins/dsh-extra-plan/index.js | resetStageState | L536-540 | 回放正常路由/有效目的前重置 purpose、clarified、approved | deriveFlowState 内部辅助 |
| plugins/dsh-extra-plan/index.js | resetRouteState | L541-544 | 回放非通道 ask 错误时设置 route=none 并清理阶段状态 | deriveFlowState 内部辅助 |
| plugins/dsh-extra-plan/index.js | catalogHasWriteTools | L658-663 | 工具目录是否含写工具判定 |  |
| plugins/dsh-extra-plan/index.js | isReadOnlyChildByCatalog | L666-668 | 按工具目录判定只读子代理 |  |
| plugins/dsh-extra-plan/index.js | schemasHasWriteTools | L673-678 | schemas 数组是否含写工具 |  |
| plugins/dsh-extra-plan/index.js | schemasHasTool | L682-687 | schemas 是否含指定工具 |  |
| plugins/dsh-extra-plan/index.js | catalogIsCollapsed | L694-699 | 工具目录折叠为单工具判定（run_code/仅shell） |  |
| plugins/dsh-extra-plan/index.js | subagentProbeGateReason | L709-718 | 探查者分支闸门（T5 唯一功能点）：planner 禁止委派（文案指向「申请继续探查」）+ 主会话 run_in_background 必 true；两调用点（组判定/直呼）共用 |  |
| plugins/dsh-extra-plan/index.js | shellMutationReason | L724-738 | 只读角色 shell 写命令拒绝文案的唯一实现：planner/探查者/验收复核者 × pwsh/bash 六格逐字（role 仅 planner/probe/reviewer；未命中 mutation、非 shell、未知角色一律 null） | B3 收敛：plannerGateReason 与 childReadonlyGateReason 共用，不再各自拼接文案 |
| plugins/dsh-extra-plan/index.js | plannerGateReason | L742-756 | 规划子代理分支闸门（write/edit + shell 写命令 + job_output 首判 + 预算；不含 run_code） | shell 文案取自 shellMutationReason（B3 单源） |
| plugins/dsh-extra-plan/index.js | childReadonlyGateReason | L760-768 | 子代理只读分支闸门（write/edit + shell 写命令 + job_output 首判；不含 run_code） | shell 文案取自 shellMutationReason（probe 布尔选角色） |
| plugins/dsh-extra-plan/index.js | jobOutputGateReason | L773-795 | job_output 闸门：禁 wait:true + 同 job 重复调用查重（内存计数器；只读查重不写入） | 写入侧唯一位点是 recordJobOutputCall（B3 单源） |
| plugins/dsh-extra-plan/index.js | recordJobOutputCall | L801-813 | job_output 放行后的计数器记录唯一实现：job_output + 字符串 job_id + 有效 sessionId + counters 可用时惰性建 session Map 并写 jobId→1，非法输入返回 false 且零副作用 | B3 收敛：planner/只读 child/主会话三处共用；执行者仍完全豁免 |
| plugins/dsh-extra-plan/index.js | probeDisposalWarning | L821-824 | 探查者级联中止告警纯函数：剩余未认领探查者委派数为正整数时返回告警文案（T5 文案中性化「委派方会话销毁时」+ owner disposed + 引擎限制指向官方包）；非正整数返回 null |  |
| plugins/dsh-extra-plan/index.js | mainGateReason | L834-953 | 主会话闸门主分支（ask/write/edit/plan/save_probe/subagent/run_code/job_output…）；gateCtx.gateRuntime 必填（缺失即抛错，helper 不得自建默认词表）；save_plan 任意路由态放行（受限规划工件：仅写 cwd/.extra-plan 固定形状 Markdown，无显式分支、走兜底 return null）；save_probe/subagent_plan 还需目的已定（purpose∈refine/redo，第四锚点）+ 澄清完成 |  |
| plugins/dsh-extra-plan/index.js | runCodeGroupDenyReason | L963-1046 | run_code 组判定：拆解→成员逐判定→聚合拒绝；成员判定复用主会话闸门时经 gateCtx.gateRuntime 传同一词表实例；预算耗尽白名单把关 |  |
| plugins/dsh-extra-plan/index.js | visit | L980-1023 | 递归展平嵌套 run_code（runCodeGroupDenyReason 内闭包） |  |
| plugins/dsh-extra-plan/index.js | aggregateRunCodeDenyReason | L1052-1064 | 聚合多成员拒绝消息 |  |
| plugins/dsh-extra-plan/index.js | apply | L1199-2115 | 插件主入口：第一步 createGateRuntime(cfg.gateWords)（缺失/非法同步抛错，早于任何工具/监听器/服务副作用）→ ctx.effect 在当前 agent scope 注册恰好 7 个 extra_plan_* prompt variable（provider 返回本次 apply 捕获值）→ 配置解析（含变量② bootstrapReadHint）/服务注册/工具注册/creativeMode 模型可见投影/锚点钩子（HP 首轮 tool:read text 用变量②覆盖）；planner 与非 planner child 双模型路由；会话状态按 sessionId 分桶与 agent/disposed 同步 final flush + 单会话回收 |  |
| plugins/dsh-extra-plan/index.js | plannerModel | L1242 | 热读箭头 getter：pro 规划默认模型（liveConfig.plannerModel；消费点=model-routing 的 getPlannerModel） |  |
| plugins/dsh-extra-plan/index.js | otherAgentModel | L1243 | 热读箭头 getter：其他子代理默认模型（消费点=model-routing 的 getOtherAgentModel） |  |
| plugins/dsh-extra-plan/index.js | exploreBudget | L1244 | 热读箭头 getter：pro 规划探查额度/单实例子调用上限（消费点=预算文案、noteRunCodeSubCall、plannerGateReason 与组判定） |  |
| plugins/dsh-extra-plan/index.js | plannerPromptSuffix | L1245 | 热读箭头 getter：pre-step 拼接的额外引导后缀 |  |
| plugins/dsh-extra-plan/index.js | bootstrapOn | L1246 | 热读箭头 getter：anchored 首轮引导开关（消费点=shouldHideCreativeCatalog 与 anchoredFirst 装配；creativeModeOn 仍为快照） |  |
| plugins/dsh-extra-plan/index.js | runcodeCatchGateOn | L1247 | 热读箭头 getter：PTC try/catch 闸门开关（消费点=planner/只读 child/主会话三处组判定传参） |  |
| plugins/dsh-extra-plan/index.js | crossProviderPlannerModelOn | L1248 | 热读箭头 getter：跨提供方模型选择开关（消费点=model-routing 双 resolver 入口，新 agent 重决议） |  |
| plugins/dsh-extra-plan/index.js | readUsageCursorTable | L1290-1311 | usage cursor JSON 读取（续载/写回前盘点共用）：返回 { ok, table }；ENOENT 静默按空表，其它读取错误、JSON 解析失败、根值非对象（含数组）→ 降级空表并告警 |  |
| plugins/dsh-extra-plan/index.js | warnUsageCursorDegraded | L1314-1318 | cursor 降级告警：每插件实例首次降级时一次（同 ledgerWarned 口径），声明其它 session 去重基准可能丢失 |  |
| plugins/dsh-extra-plan/index.js | usageCursorEntryOf | L1322-1329 | cursor 单项归一：兼容旧数字形状（按水位 0 处理）与 { seq, index }；不再保留内存态 ref 字段——增量由 session.seq 水位 + snapshotEvents(from,to) 区间读取实现，水位未变直接返回、截断回退全量 |  |
| plugins/dsh-extra-plan/index.js | foldUsage | L1337-1434 | usage 账本折叠写入（同步函数，禁止改 async；cursor 去重按 sessionId+seq）：写出行 = ts/sessionId/role/model/provider/hit/miss/out/cacheWriteTokens/reasoningTokens/seq（provider 取自 msg.source.provider 缺省空串；cw/rs 缺省 0；hit/miss/out/cw/rs 五字段全零不写行）；内存无本 session 项时按 sessionId 从 cursor JSON 单项续载；写前重读、读改写保留其它合法 session，降级态以空表+当前 session 覆盖写；有新增行才整文件写回 |  |
| plugins/dsh-extra-plan/index.js | registerTool | L1506-1540 | 工具注册分发：注册成功、A 重名、B 永久性三类都写「已注册」标记（A/B 记终态不重试）；仅 tools 服务未就绪与 C 类可重试不写标记，留给下一次入口重试 |  |
| plugins/dsh-extra-plan/index.js | registerSavePlan | L1543 | save_plan 注册（规划子代理层 + 主会话层；主会话侧任意路由态放行——受限规划工件，mainGateReason 兜底放行）；注册失败按 A/B/C 三分类：A/B 写标记记终态不重试，服务未就绪与 C 类不写标记、由 pre-step 每步兜底重试 |  |
| plugins/dsh-extra-plan/index.js | registerSaveProbe | L1547 | save_probe 注册（主会话层 + 已认领的探查子代理层；规划子代理/执行者/reviewer 不是持有者）；已认领者靠 probeClaimed 粘性在下一步重试注册、不重复消费待认领计数 |  |
| plugins/dsh-extra-plan/index.js | probeClaimFor | L1557-1573 | 放行-认领关联查核（pendingProbeClaims）：非子代理/含写子代理/规划子代理（T5 守卫）不认领，命中则消费计数并登记 save_probe |  |
| plugins/dsh-extra-plan/index.js | shouldHideCreativeCatalog | L1593-1599 | HP1 判定：C=1、A=1、F、main/planner、M=ptc 时暂隐两个创造 skill |  |
| plugins/dsh-extra-plan/index.js | recordRequestError | L1642-1664 | 记录请求错误诊断到插件目录（diagPath 为 apply 内定义的诊断目录路径） |  |
| plugins/dsh-extra-plan/index.js | noteRunCodeSubCall | L1897-1904 | 单实例子调用上限（planner）：按 sessionId→rootCallId 桶读计数、未超限则 +1；返回拒绝文案或 null；空 rootCallId 与 exploreBudget 文案保持 |  |
| plugins/dsh-extra-plan/index.js | recordRunCodeDeny | L1913-1924 | pre-execute 八处 deny 出口在 return 前记录本次中文 reason（sessionId→rootCallId→Set）；仅 isRunCodeSubCall（exec.sub 或 exec.parent）且 reason 为非空字符串时写入 | 记录由 tools/post-execute 按精确子串消费（消费即清），agent/disposed 按 session 清桶；不做跨 session 共享 |
| plugins/dsh-extra-plan/lib/agent-runtime.js | isLiveDelegation | L8-19 | 按父会话 registry 存活状态判定委托是否仍有效 |  |
| plugins/dsh-extra-plan/lib/agent-runtime.js | childPolicyNeedsFloor | L22-27 | 判定 read-only 子代理是否需要 workspace-write floor |  |
| plugins/dsh-extra-plan/lib/agent-runtime.js | createAgentRuntime | L29-111 | 创建 per-apply 角色/缓存/usage baseline 工厂 |  |
| plugins/dsh-extra-plan/lib/agent-runtime.js | isChild | L36-44 | 按显式 events 判定 live child 并发出恢复为 root 警示 |  |
| plugins/dsh-extra-plan/lib/agent-runtime.js | isPlannerChild | L47-65 | 扫描 continuable descriptor；无 descriptor 不缓存 false |  |
| plugins/dsh-extra-plan/lib/agent-runtime.js | toolSchemasOf | L68-86 | 防御式读取 agent scoped tools.schemas，失败/非数组返回 undefined |  |
| plugins/dsh-extra-plan/lib/agent-runtime.js | floorChildPolicy | L88-92 | 为 read-only child 同步追加 workspace-write sandbox 事件 |  |
| plugins/dsh-extra-plan/lib/agent-runtime.js | usageRoleOf | L94-98 | 优先读取 role WeakMap，保证 disposed 后角色不漂移 |  |
| plugins/dsh-extra-plan/lib/agent-runtime.js | childBaseline | L100-108 | 同步确定 main/planner/executor role、fold usage 并应用 child floor |  |
| plugins/dsh-extra-plan/lib/agent-session.js | sessionEvents | L15-19 | 取 agent.session 事件快照（缺失兜底空数组）；唯一来源 |  |
| plugins/dsh-extra-plan/lib/agent-session.js | isSubagentChild | L26-41 | 判定会话属于子代理（header.origin/delegationDepth/descriptor 三路探测）；唯一来源，index.js 经 decisions re-export |  |
| plugins/dsh-extra-plan/lib/assembly-presentation.js | sectionOf | L29-32 | 按名称取 PromptAssembly section |  |
| plugins/dsh-extra-plan/lib/assembly-presentation.js | skillCatalogEntriesOf | L38-46 | 校验并提取 skill catalog 的最小 name/description 条目 |  |
| plugins/dsh-extra-plan/lib/assembly-presentation.js | renderSkillCatalogText | L48-70 | 按条目重建系统 skill catalog 文本 |  |
| plugins/dsh-extra-plan/lib/assembly-presentation.js | projectSkillCatalogDecision | L72-98 | 在当前消息副本中暂隐创造 skill，不注销 binding |  |
| plugins/dsh-extra-plan/lib/assembly-presentation.js | isCordisPresentationTool | L100-102 | 判断名称是否属于固定 7 项 Cordis 模型可见工具集合 | 模型可见投影；不改变 registry binding |
| plugins/dsh-extra-plan/lib/assembly-presentation.js | filteredCordisSchemas | L104-107 | 从 schema 数组排除固定 7 项 Cordis 工具，供 SDK 整体重建 |  |
| plugins/dsh-extra-plan/lib/assembly-presentation.js | hasSection | L109-111 | 判断 PromptAssembly 是否含指定命名 section |  |
| plugins/dsh-extra-plan/lib/assembly-presentation.js | hasNonEmptySection | L113-115 | 判断 tools:ptc-only 是否为有效非空 section，识别 Pure PTC |  |
| plugins/dsh-extra-plan/lib/assembly-presentation.js | projectAssemblyForPresentation | L118-142 | 创建不原地修改的模型可见 assembly：按当前 schema 交集过滤工具，替换 SDK 文本并隐藏 tool:cordis，另支持 Pure PTC 顶层单入口 | 不改变 registry/restrict/pre-execute |
| plugins/dsh-extra-plan/lib/assembly-presentation.js | sdkSchemasForRendering | L144-151 | 从 schema 输入排除 run_code 与 Cordis，并确保 renderer 获得输出 schema | 不读取原始 tools:sdk 文本 |
| plugins/dsh-extra-plan/lib/assembly-presentation.js | dshToolsEntryCandidates | L153-169 | 生成 DSH_HOME/profile 与平台官方 dsh-tools SDK renderer 候选路径 | 只读加载官方包，不修改安装目录 |
| plugins/dsh-extra-plan/lib/assembly-presentation.js | loadSdkRendererModule | L172-182 | 惰性加载并缓存官方 TypeScript/Python SDK renderer 模块 |  |
| plugins/dsh-extra-plan/lib/assembly-presentation.js | resolveToolsSdkRenderer | L185-190 | 按 language 选择当前官方 TypeScript/Python SDK renderer，返回函数身份供 cache key 使用；复用模块级动态 import promise |  |
| plugins/dsh-extra-plan/lib/assembly-presentation.js | renderFilteredToolsSdk | L193-196 | 仅以过滤后的 schema 整体调用官方 renderer 生成 tools:sdk，按 codeRuntime language 选择 TS/Python | 不做原始文本正则删块 |
| plugins/dsh-extra-plan/lib/assembly-presentation.js | toolRegistryOf | L198-206 | 防御式读取 agent scoped tools service，服务缺失或异常返回 undefined |  |
| plugins/dsh-extra-plan/lib/assembly-presentation.js | toolSdkSchemasOf | L208-226 | 优先读取 tools.sdkSchemas；兼容旧服务时从 schemas 补 owned output schema，供 SDK renderer 使用 |  |
| plugins/dsh-extra-plan/lib/assembly-presentation.js | toolPresentationModeOf | L228-237 | 从 scoped tools registry 读取 native/ptc/both 模式 |  |
| plugins/dsh-extra-plan/lib/client-bridge.js | apply | L17-19 | 空实现（仅承载 dsh.client 加载路径指向 lib/client.js） |  |
| plugins/dsh-extra-plan/lib/client.js | apply | L113-353 | 客户端插件入口：注入样式表与中英词条，定义设置页组件并注册到 settings.plugin.item 插槽（同一外层 esp-card 内有通用设置/pro规划模块两个 esp-section 内嵌卡片；字段为名称→metadata 控件→静态 hint→相邻分隔栏；保存 footer 只在外层共享；用 inject 等待插槽就绪，register 会被丢弃） |  |
| plugins/dsh-extra-plan/lib/client.js | ProConfigTab | L124-297 | 设置页「通用设置+pro规划模块」双区块组件：GET /pro-config 载入 10 项 fields/values → 本地草稿 → save() PUT 回写；同一外层 esp-card 内按 field.section 分组渲染两个 esp-section 内嵌卡片，字段为名称→metadata 控件→静态 hint→相邻分隔栏；含 loading/error/ready 三态，保存 footer 只在外层共享 | 本地稳定内嵌卡片样式 |
| plugins/dsh-extra-plan/lib/client.js | setField | L163-166 | 更新草稿中某字段并清空提示信息 | ProConfigTab 内部闭包 |
| plugins/dsh-extra-plan/lib/client.js | save | L168-192 | 把草稿按字段类型（integer 转 Number）PUT 到 /pro-config，按结果给出「已保存/保存失败」提示 | ProConfigTab 内部闭包 |
| plugins/dsh-extra-plan/lib/client.js | optionLabel | L213-218 | 选项显示名：优先 optionLocale 词条，其次布尔 trueValue/falseValue，最后原值字符串 | ProConfigTab 内部闭包 |
| plugins/dsh-extra-plan/lib/client.js | optionValue | L220-226 | 把后端返回的字符串值映射回 field.options 里的原始类型（不在选项中则原样返回） | ProConfigTab 内部闭包 |
| plugins/dsh-extra-plan/lib/client.js | renderField | L228-272 | 按 field.control 渲染 10 个字段的「名称→metadata 控件→静态 hint→相邻分隔栏」并绑定 setField；字段位于同一外层 esp-card 的两个 esp-section 内嵌卡片中；保存 footer 只在外层共享 | ProConfigTab 内部闭包；本地稳定字段样式 |
| plugins/dsh-extra-plan/lib/client.js | ExtraPlanCard | L299-328 | 设置→插件页的可折叠同一外层 esp-card：标题/描述 + 展开后渲染 ExtraPlanSettingsTab；卡内保留通用设置/pro规划模块两个 esp-section 内嵌卡片，字段为名称→metadata 控件→静态 hint→相邻分隔栏，保存 footer 只在外层共享（本地 open 状态） | 本地稳定外层卡片样式 |
| plugins/dsh-extra-plan/lib/client.js | ExtraPlanSettingsTab | L330-334 | 卡片内容容器：包一层 esp-wrap 后在同一外层 esp-card 内渲染 ProConfigTab；通用设置/pro规划模块是两个 esp-section 内嵌卡片，字段为名称→metadata 控件→静态 hint→相邻分隔栏，保存 footer 只在外层共享 |  |
| plugins/dsh-extra-plan/lib/executor-spawn.js | resolveDeny | L47-49 | deny 解析纯函数：config.deny 合法（非 null 对象且为数组）时原样返回，否则回退 DEFAULT_DENY | 由 apply 调用；DEFAULT_DENY 已与预设 config.deny 收敛为同集 12 项 |
| plugins/dsh-extra-plan/lib/executor-spawn.js | apply | L51-90 | 插件入口：注册执行者 provider（委托宿主 spawn，注入 deny 工具裁剪） |  |
| plugins/dsh-extra-plan/lib/executor-spawn.js | defaultedAgentOptions | L70-74 | 执行者 agentOptions 透传（请求自带优先，否则空对象继承父会话） |  |
| plugins/dsh-extra-plan/lib/gate-words.js | fail | L47-49 | 统一抛出 'extra-plan: config.gateWords ' 前缀的校验错误（错误前缀的唯一出口） |  |
| plugins/dsh-extra-plan/lib/gate-words.js | normalizeGateLabel | L52-54 | 推荐后缀归一（(Recommended)/（Recommended）/(推荐)/（推荐），四级后缀、英文大小写不敏感、前后空白），与 index.js normalizeLabel 同规则；仅供校验保留后缀用 |  |
| plugins/dsh-extra-plan/lib/gate-words.js | validateGateWords | L60-87 | 整组严格校验：非数组对象、键集合恰为 7 键、每值为非空字符串、首尾无空白、无 CR/LF、7 值两两不同、不以保留推荐后缀结尾；合法返回冻结副本，任何一条不合法即抛错（禁止部分接受） |  |
| plugins/dsh-extra-plan/lib/gate-words.js | bracketed | L89-91 | 选项集合文本拼接（「词」「词」…），与历史静态 OPTIONS_TEXT 逐字同构 |  |
| plugins/dsh-extra-plan/lib/gate-words.js | createGateRuntime | L101-130 | 运行时词表工厂：仅从入参派生 words/route/approval/purpose 冻结数组 + 三套 Set + options/confirm 插值片段 + variables（变量名→本次 apply 值）；无默认词表，缺失/非法即抛错 |  |
| plugins/dsh-extra-plan/lib/live-config.js | textOf | L50-52 | 非空字符串 trim 取值（空串/非串 → ''），用于路径与环境变量决议 |  |
| plugins/dsh-extra-plan/lib/live-config.js | defaultAgentCordisPath | L55-59 | 默认预设路径（DSH_HOME 或 ~/.dsh + .agent-presets/extra-plan/agent.cordis.yml），与 settings.js agentCordisPath 同公式；刻意不 import settings.js（其静态依赖 @deepseek-ai/schemastery，不能进 index.js 的 import 图） |  |
| plugins/dsh-extra-plan/lib/live-config.js | envConfigPath | L61-63 | 环境变量 DSH_EXTRA_PLAN_CONFIG_PATH 取值（空/缺省 → ''，体检用它隔离生产现场配置） |  |
| plugins/dsh-extra-plan/lib/live-config.js | statStamp | L66-74 | fs.statSync 取 { mtimeMs, size } 拼变更 stamp；失败返回 { ok:false, reason } 不抛出（缺失/权限问题一律降级为回退，不中断插件） |  |
| plugins/dsh-extra-plan/lib/live-config.js | booleanOr | L76-78 | 布尔取值：仅 true/false 采信，其他一律回落 fallback |  |
| plugins/dsh-extra-plan/lib/live-config.js | stringOr | L80-82 | 字符串取值：非 string 回落 fallback（plannerPromptSuffix） |  |
| plugins/dsh-extra-plan/lib/live-config.js | positiveIntegerOr | L84-86 | 正整数取值：非 >0 整数回落 fallback（exploreBudget） |  |
| plugins/dsh-extra-plan/lib/live-config.js | pick | L88-97 | 按 key 的标量类型收口（布尔/trim 字符串/正整数），非法值一律回落 fallback |  |
| plugins/dsh-extra-plan/lib/live-config.js | normalizedFallback | L99-106 | 归一 fallbackDefaults：只取 8 个热读键，缺失键用内置兜底（与 index.js apply 期 cfg 快照同口径） |  |
| plugins/dsh-extra-plan/lib/live-config.js | createLiveConfig | L108-205 | 热读工厂：决议路径 + 构造期**无条件读盘一次**（文件真值作首拍基准，成功即记 stamp；失败回退 fallbackDefaults + warnOnce）；返回 8 个 getter（取值先 refresh 再做 stamp 比对）；creativeMode getter 保留但当前无热读消费点（该项为 apply 快照）；不做监听/轮询/订阅 |  |
| plugins/dsh-extra-plan/lib/live-config.js | warnOnce | L118-122 | 同实例只告警一次（防抖）：不可用原因 + 生效路径 + 「回退到 apply 期快照兜底」 |  |
| plugins/dsh-extra-plan/lib/live-config.js | readDiskValues | L125-145 | 读盘→解析→取值单一实现（构造期与 stamp 变化后的刷新共用）：readFileSync + captureSettings，按 states[key]==='captured' 覆盖、其余键回落 fallback；未捕获到任何热读键视为取值失败；失败返回 { ok:false, reason } 不抛出 |  |
| plugins/dsh-extra-plan/lib/live-config.js | refresh | L161-179 | 变更检测主体：stamp 未变直接返回（零 IO 零解析）；变了才 readFileSync + captureSettings 全量解析，按 states[key]==='captured' 覆盖 fallback；stat/解析失败回落 fallback 并 warnOnce |  |
| plugins/dsh-extra-plan/lib/live-config.js | read | L181-184 | getter 取值通道：refresh() 后读当前 values[key] |  |
| plugins/dsh-extra-plan/lib/model-routing.js | isExplicitRoute | L19-25 | 按直接父 provider/model 比较 child resolved route，判断 agentOptions 显式路由并短路模型解析 |  |
| plugins/dsh-extra-plan/lib/model-routing.js | isExplicitEffort | L29-31 | 显式指定 reasoningEffort 判断 |  |
| plugins/dsh-extra-plan/lib/model-routing.js | requestConfigSnapshot | L41-54 | 从 Agent 的 requestHeader 只提取 provider/model/maxTokens/reasoningEffort owned 路由快照，异常或缺 config 返回 null | 不序列化/持有 Cordis 对象 |
| plugins/dsh-extra-plan/lib/model-routing.js | agentFromRegistry | L56-59 | 防御式按 session id 从 agents registry 取父 Agent，服务缺失或 get 异常返回 undefined |  |
| plugins/dsh-extra-plan/lib/model-routing.js | resolveAgentRouteSources | L62-87 | 沿 parentSession 链解析直接父与完整顶层主会话来源；断链标记 incomplete，不把中间 child 当主会话 fallback | 非 planner 与 probe 共用 |
| plugins/dsh-extra-plan/lib/model-routing.js | decidePlannerModelUse | L109-122 | T2 静默降级判定：目录命中→用 plannerModel；清单非空未命中→不覆盖（inherit-parent）；空/异常→沿用 |  |
| plugins/dsh-extra-plan/lib/model-routing.js | comparePlannerText | L133-137 | 规划 provider name/id 的确定性字典序比较 |  |
| plugins/dsh-extra-plan/lib/model-routing.js | plannerProviderRank | L139-143 | 候选排序层级：普通 provider、父会话 provider、deepseek-official |  |
| plugins/dsh-extra-plan/lib/model-routing.js | sortPlannerCandidates | L145-156 | 真实探针成功候选排序：普通 name/id 正序，父 provider 倒数第二，官方最后 |  |
| plugins/dsh-extra-plan/lib/model-routing.js | createModelRouting | L161-543 | 创建 per-apply 模型路由工厂：内部新建 plannerModelCache/otherAgentModelCache WeakMap，承载 planner 与非 planner 的 legacy/strict 双路径解析，返回 { resolvePlannerEntry, resolveOtherAgentEntry } | 每次 apply 各一份（绝不提升为模块全局）；llm/agents/诊断路径走惰性 getter |
| plugins/dsh-extra-plan/lib/model-routing.js | plannerAbortError | L169-172 | 保留外部 turn abort 原因，避免改写为严格路由阻断 |  |
| plugins/dsh-extra-plan/lib/model-routing.js | withPlannerProbeDeadline | L176-209 | planner 与非 planner route 共用本地 30000ms AbortController/race 覆盖目录、准备与流消费并清理计时器 | 不遵守 signal 的第三方 adapter 可能遗留 I/O |
| plugins/dsh-extra-plan/lib/model-routing.js | probePlannerRoute | L213-254 | planner 与非 planner 候选或顶层 fallback 共用 prepareCall + 完整 prepared stream 的 OK probe，隔离失败终止块/无终止块/超时 | 仅 True 路径调用，不把目录或 resolveCallConfig 当成功 |
| plugins/dsh-extra-plan/lib/model-routing.js | probePlannerCandidates | L261-277 | 有界并发探针池（上限 PLANNER_PROBE_CONCURRENCY=5）：候选按入参顺序启动、超出排队；返回值与入参一一对应且按发起顺序排列（完成顺序不影响结果），调用方在全部结束后回填 probeOutcomes/successes 再排序 |  |
| plugins/dsh-extra-plan/lib/model-routing.js | worker | L264-271 | probePlannerCandidates 的并发池内层 worker：用共享游标 next 领取下一个候选索引直到取尽；每个候选各自走 probePlannerRoute（独立 AbortController + 30s deadline，不共享） |  |
| plugins/dsh-extra-plan/lib/model-routing.js | extractParentEntry | L281-291 | 从父会话 requestHeader().config 提取 provider/model/maxTokens（非法或缺失取 undefined），parent 为 null/undefined 时返回 null | 旧流程与严格路径共用；不读取 agent.session 字段 |
| plugins/dsh-extra-plan/lib/model-routing.js | resolvePlannerEntryLegacy | L295-350 | False/缺失/非法开关的旧单 provider listModels advisory 解析与原降级诊断 | 不枚举 provider、不做真实 probe |
| plugins/dsh-extra-plan/lib/model-routing.js | resolvePlannerEntryStrict | L353-427 | True 路径枚举全 provider、等待全部匹配候选排序，并验证父 provider/model fallback；无验证路由固定 reject | plannerModel 为空仅验证父 fallback |
| plugins/dsh-extra-plan/lib/model-routing.js | routeKey | L385 | 以 provider 与 model 组成 probe outcome 复用键，避免 fallback 同路由二次请求 | 仅 resolver 内部使用 |
| plugins/dsh-extra-plan/lib/model-routing.js | resolvePlannerEntry | L431-439 | 单点分流并立即缓存 in-flight promise：False 走旧 advisory，True 走全 provider 真实 probe 与严格 fallback | 成功 entry 与 rejection 均固定到 Agent |
| plugins/dsh-extra-plan/lib/model-routing.js | nonPlannerRouteSources | L443-447 | 读取非 planner resolver 所需的 agents registry，并把服务异常转换为不可用来源 |  |
| plugins/dsh-extra-plan/lib/model-routing.js | nonPlannerFallbackEntry | L449-457 | 组装顶层主会话 provider/model fallback；普通 child 继承直接父 maxTokens，probe 保留顶层 maxTokens |  |
| plugins/dsh-extra-plan/lib/model-routing.js | resolveOtherAgentEntryLegacy | L460-476 | cross=false/缺失/非法时只查顶层主会话 provider 的 advisory listModels，命中 otherAgentModel 才覆盖，否则回退 | 不枚举 provider、不做真实 probe |
| plugins/dsh-extra-plan/lib/model-routing.js | resolveOtherAgentEntryStrict | L480-530 | cross=true 时枚举全 provider，串行 probe otherAgentModel，候选全失败后验证主会话 fallback，失败固定阻断 | 复用 probePlannerRoute/withPlannerProbeDeadline |
| plugins/dsh-extra-plan/lib/model-routing.js | routeKey | L493 | 非 planner strict resolver 内以 provider/model 组成本次 Agent 的 probe outcome 复用键 | 仅 resolver 内部使用；与 planner routeKey 同名但 cache 隔离 |
| plugins/dsh-extra-plan/lib/model-routing.js | resolveOtherAgentEntry | L533-541 | 非 planner 单一入口，按 cross 开关选择 legacy/strict，并立即缓存单 Agent 的 in-flight/成功/rejection promise | 不读写 plannerModelCache |
| plugins/dsh-extra-plan/lib/planner-budget.js | toolCallCount | L11-35 | 按成功 tool/result 配对统计工具调用并跳过白名单工具 |  |
| plugins/dsh-extra-plan/lib/planner-budget.js | toolCallsSinceUser | L38-50 | 统计最近 user/agent-message 锚点后的预算调用数 |  |
| plugins/dsh-extra-plan/lib/planner-budget.js | appendSuffixBlock | L52-69 | 给 user/agent-message 的首个文本块幂等追加后缀 |  |
| plugins/dsh-extra-plan/lib/planner-budget.js | withPlannerPromptSuffix | L71-78 | 拼接 planner 任务后缀并保持多块换行语义 |  |
| plugins/dsh-extra-plan/lib/planner-budget.js | budgetNoticeText | L83-85 | 构造本轮探查预算告知文案 |  |
| plugins/dsh-extra-plan/lib/planner-budget.js | withBudgetNotice | L87 | 将预算告知幂等拼入任务消息 |  |
| plugins/dsh-extra-plan/lib/planner-budget.js | budgetReminderText | L89-93 | 按阈值构造剩余预算提醒文案 |  |
| plugins/dsh-extra-plan/lib/planner-budget.js | budgetReminderMessage | L95-97 | 用宿主消息构造器生成 plugin-source 提醒消息 |  |
| plugins/dsh-extra-plan/lib/planner-budget.js | budgetReminderSent | L99-119 | 判断当前 user/agent-message 锚点后是否已提醒 |  |
| plugins/dsh-extra-plan/lib/planner-budget.js | budgetExhaustedReason | L121-123 | 构造预算耗尽拒绝与继续探查指令 |  |
| plugins/dsh-extra-plan/lib/planner-budget.js | budgetExceeded | L125-127 | 判定 used 是否超过预算上限 |  |
| plugins/dsh-extra-plan/lib/preset-settings.js | loadYaml | L9-22 | 模块加载期解析 js-yaml：本模块 require 失败则回退全局 dsh 的 node_modules，仍失败抛首个错误 |  |
| plugins/dsh-extra-plan/lib/preset-settings.js | isString | L34 | 字符串判定（plannerModel 与 otherAgentModel 的 validator：空串合法=继承主会话模型） |  |
| plugins/dsh-extra-plan/lib/preset-settings.js | isPositiveInteger | L35 | 正整数校验器（exploreBudget 的 validator）：仅接受 >0 整数，拒绝小数/0/负数/非 number |  |
| plugins/dsh-extra-plan/lib/preset-settings.js | isBoolean | L36 | 布尔校验器（anchoredBootstrap／runcodeCatchGate／webFetch 三个 descriptor 的 validator） |  |
| plugins/dsh-extra-plan/lib/preset-settings.js | isMode | L38 | 工具展示模式校验器：仅接受 modeOptions（native/ptc/both）三值之一 |  |
| plugins/dsh-extra-plan/lib/preset-settings.js | setting | L40-55 | descriptor 工厂：冻结定义并补齐 type/locator/aliases/ui（SETTING_DEFINITIONS 内 10 处调用） |  |
| plugins/dsh-extra-plan/lib/preset-settings.js | getSettingDefinition | L116-118 | 按 key 取设置描述符（descriptorByKey），未命中返回 undefined |  |
| plugins/dsh-extra-plan/lib/preset-settings.js | parsePresetYaml | L120-122 | 预设 YAML 文本 → JS 对象（含自定义 js 标签的 YAML_SCHEMA）；非法 YAML 直接抛错 |  |
| plugins/dsh-extra-plan/lib/preset-settings.js | hasOwn | L124-126 | null 安全的自有属性判定（readPath／rowsById 调用） |  |
| plugins/dsh-extra-plan/lib/preset-settings.js | pathParts | L128-130 | 点分路径（如 config.fetch）切成去空段数组 |  |
| plugins/dsh-extra-plan/lib/preset-settings.js | readPath | L132-139 | 按点分路径读嵌套值 → {exists,value}（任一段缺失即 exists:false） |  |
| plugins/dsh-extra-plan/lib/preset-settings.js | rowsById | L141-156 | DFS 收集文档中所有 id===pluginId 的行（Set 防环）→ 数组 |  |
| plugins/dsh-extra-plan/lib/preset-settings.js | visit | L144-153 | 递归遍历（数组按元素、对象按 Object.values），把 id 命中的行推入 rows | rowsById 内部闭包 |
| plugins/dsh-extra-plan/lib/preset-settings.js | resolveLocator | L158-165 | 按 pluginId+path 定位单个设置行 → kind=missing/ambiguous/ok（ok 带 row 与 value） |  |
| plugins/dsh-extra-plan/lib/preset-settings.js | resolveSetting | L167-180 | 按主 locator＋（默认启用的）别名解析设置；多命中或任一路径歧义 → {kind:'ambiguous'} |  |
| plugins/dsh-extra-plan/lib/preset-settings.js | validateSettingValue | L182-184 | 用 descriptor.validator 校验值；definition 缺失或无 validator 一律返回 false |  |
| plugins/dsh-extra-plan/lib/preset-settings.js | normalizeSettingValue | L186-188 | 有 normalize 时按其归一化（如 plannerModel 的 trim），否则原值返回 |  |
| plugins/dsh-extra-plan/lib/preset-settings.js | resolveTemplateSettingDefault | L190-205 | 按唯一 locator 解析并严格校验模板叶值 |  |
| plugins/dsh-extra-plan/lib/preset-settings.js | captureSettings | L207-222 | 解析预设并逐项解析 → {document,values,states}；states 四态，仅 captured 进 values |  |
| plugins/dsh-extra-plan/lib/preset-settings.js | inlineCommentIndex | L225-243 | 找行内注释起始下标（跟踪单/双引号与 '' 转义，仅 # 前有空白或行首才算），无则 -1 |  |
| plugins/dsh-extra-plan/lib/preset-settings.js | lineIndent | L245-248 | 行首空格数（缩进量）；与 qqbot heal.js 同名函数无关 |  |
| plugins/dsh-extra-plan/lib/preset-settings.js | withoutCr | L250-252 | 去掉行尾 CR，兼容 CRLF 文本 |  |
| plugins/dsh-extra-plan/lib/preset-settings.js | parseRowId | L254-266 | 解析 '- id: xxx' 行的 id（先去行内注释、再解单/双引号写法），非 id 行返回 null |  |
| plugins/dsh-extra-plan/lib/preset-settings.js | parseMapKey | L268-272 | 映射行 → {key,indent}（'-' 开头的数组项返回 null） |  |
| plugins/dsh-extra-plan/lib/preset-settings.js | rowEnd | L274-282 | 求所在块结束行：跳过空行/注释，遇缩进 ≤ 本行缩进即返回其行号，否则返回总行数 |  |
| plugins/dsh-extra-plan/lib/preset-settings.js | findDirectKey | L284-302 | 在 [start,end) 内按首个子键缩进寻找父块直属子键 key 的行号；找不到返回 null |  |
| plugins/dsh-extra-plan/lib/preset-settings.js | textPathLine | L304-316 | 沿点分 path 逐层下钻定位，返回路径末段所在行号；任一段缺失返回 null |  |
| plugins/dsh-extra-plan/lib/preset-settings.js | findTextLocatorMatches | L318-329 | 在 YAML 原文中定位 pluginId 行并下钻路径 → [{rowStart,rowEnd,line}] |  |
| plugins/dsh-extra-plan/lib/preset-settings.js | yamlString | L331-335 | 字符串 → YAML 标量：含换行用 JSON 双引号形式，否则单引号包裹并把 ' 转成 '' |  |
| plugins/dsh-extra-plan/lib/preset-settings.js | serializeScalar | L337-341 | 按 scalarType 把值序列化成 YAML 标量文本（boolean/integer/其余走 yamlString） |  |
| plugins/dsh-extra-plan/lib/preset-settings.js | escapeRegex | L343-345 | 逐字符转义正则元字符，把键名安全拼进正则 |  |
| plugins/dsh-extra-plan/lib/preset-settings.js | replaceLineScalar | L347-359 | 保格式替换某键的标量值（保留缩进、值前后空白、行内注释与 CR）；键行不匹配返回 null |  |
| plugins/dsh-extra-plan/lib/preset-settings.js | isBlockScalarLine | L361-371 | 判断该键的值是否块标量（以竖线或 > 开头，忽略行内注释） |  |
| plugins/dsh-extra-plan/lib/preset-settings.js | locatorFor | L373-376 | 参数归一化：传 descriptor 取 .locator，传 locator 则原样返回 |  |
| plugins/dsh-extra-plan/lib/preset-settings.js | scalarTypeFor | L378-381 | 参数归一化：传 descriptor 取 .scalarType，否则缺省 'string' |  |
| plugins/dsh-extra-plan/lib/preset-settings.js | patchYamlScalar | L383-409 | 保格式定点改写 YAML 标量 → {ok,text,line}，或 {ok:false,reason:'missing'／'ambiguous'}；纯字符串处理不写文件 |  |
| plugins/dsh-extra-plan/lib/preset-settings.js | publicSettingMetadata | L412-447 | 生成设置页字段元数据 {fields,values,defaults}；默认/实际各解析一次且禁用别名，actual 无效时回退默认值 |  |
| plugins/dsh-extra-plan/lib/preset-sync.js | contentHash | L42-50 | 预设资产内容哈希 |  |
| plugins/dsh-extra-plan/lib/preset-sync.js | readManifestRecord | L52-63 | 读目标目录 dist-manifest.json：校验 format∈{1,2} 且 distHash 为字符串；文件缺失/JSON 损坏/结构不符一律返回 null |  |
| plugins/dsh-extra-plan/lib/preset-sync.js | readManifest | L66-69 | 读 dist-manifest.json |  |
| plugins/dsh-extra-plan/lib/preset-sync.js | emptyMigration | L71-81 | 构造「未捕获到旧设置」的空迁移审计：format=1 + sourceDistHash + source，并把各设置项状态填为 skipped-source-absent/unreadable |  |
| plugins/dsh-extra-plan/lib/preset-sync.js | emptyGateWordsMigration | L84-94 | gateWords 专用空审计（format 1 + source + 7 项状态，无旧目标=skipped-source-absent / 不可读=skipped-source-unreadable）；只记状态不记用户词值 |  |
| plugins/dsh-extra-plan/lib/preset-sync.js | gateReasonForState | L97-101 | 旧组状态 → 审计字符串（missing→skipped-old-missing / ambiguous→skipped-old-ambiguous / 其余→skipped-invalid）：整组同一状态，禁止部分迁移 |  |
| plugins/dsh-extra-plan/lib/preset-sync.js | captureGateWords | L107-116 | 旧组整组判定：稳定 locator（id=extra-plan + config.gateWords）定位 + 共享 validator 全组校验，返回 captured/missing/ambiguous/invalid 与冻结词值 |  |
| plugins/dsh-extra-plan/lib/preset-sync.js | assertTemplateGateWords | L119-125 | 厂商模板整组前置校验：缺失/非法一律抛错（在 hash/idle 判定与任何目标目录动作之前，坏模板不得进入发布流程） |  |
| plugins/dsh-extra-plan/lib/preset-sync.js | capturePrevious | L127-185 | 捕获旧 agent.cordis.yml 设置 → {audit(captured),values,states}；失败给 absent/unreadable 空审计 |  |
| plugins/dsh-extra-plan/lib/preset-sync.js | reasonForOldState | L187-192 | 旧设置捕获状态 → 审计原因码：missing→skipped-old-missing、ambiguous→skipped-old-ambiguous、invalid→skipped-invalid |  |
| plugins/dsh-extra-plan/lib/preset-sync.js | reasonForNewState | L194-196 | 新预设取值/改写结果 → 审计原因码：ambiguous→skipped-new-ambiguous，其余（missing 等）→skipped-new-missing |  |
| plugins/dsh-extra-plan/lib/preset-sync.js | stagePreset | L198-291 | 建临时目录复制两个核心文件、逐项回填旧设置并校验 YAML，写出改后 agent.cordis.yml 与 format=2 manifest；失败删 tmp 并抛错 |  |
| plugins/dsh-extra-plan/lib/preset-sync.js | cleanupPath | L293-295 | 尽力删除路径（rmSync recursive+force）并吞掉所有异常；供回滚/失败清理使用，永不抛出 |  |
| plugins/dsh-extra-plan/lib/preset-sync.js | switchStage | L299-320 | rename 交换发布：旧目录改名备份 → tmp 就位 → 删备份；失败则删新目录+还原备份+清 tmp 后重抛（ops 可注入） |  |
| plugins/dsh-extra-plan/lib/preset-sync.js | publishStage | L322-324 | 导出薄封装：转调 switchStage 完成原子发布，保留 ops 注入点供测试替换文件操作 |  |
| plugins/dsh-extra-plan/lib/preset-sync.js | cleanupLegacyFlashGuidePatches | L330-356 | 清理旧 flash-guide 补丁条目 |  |
| plugins/dsh-extra-plan/lib/preset-sync.js | noSourcePrevious | L358-367 | 目标目录不存在时构造「无来源」previous：audit=emptyMigration('absent',null)，values/states 均为空对象 |  |
| plugins/dsh-extra-plan/lib/preset-sync.js | syncPreset | L373-400 | 预设同步判定（hash 比对→下发/跳过） |  |
| plugins/dsh-extra-plan/lib/preset-sync.js | apply | L405-414 | 插件入口（启动时 syncPreset） |  |
| plugins/dsh-extra-plan/lib/run-code-static.js | runCodeTextOf | L20-24 | 提取 run_code 的 code 参数文本 |  |
| plugins/dsh-extra-plan/lib/run-code-static.js | codeMutationHints | L27-35 | 对文本扫描 RUNCODE_MUTATION_HINTS 返回命中写暗示 id 列表 |  |
| plugins/dsh-extra-plan/lib/run-code-static.js | createRunCodeStatic | L37-678 | 创建 run_code 静态 helper 闭包，仅注入 askTool 与双兼容 isDispatchStart |  |
| plugins/dsh-extra-plan/lib/run-code-static.js | maskCodeLiteralsAndComments | L47-85 | 遮蔽字符串/注释为空格（括号配平用） |  |
| plugins/dsh-extra-plan/lib/run-code-static.js | sliceBalancedArgs | L90-106 | 从括号起配平切片参数原文 |  |
| plugins/dsh-extra-plan/lib/run-code-static.js | decomposeRunCode | L117-246 | 静态拆解 run_code 的 code 为工具成员组（含裸写伪工具） |  |
| plugins/dsh-extra-plan/lib/run-code-static.js | addMember | L126-140 | 成员去重添加（decomposeRunCode 内部闭包） |  |
| plugins/dsh-extra-plan/lib/run-code-static.js | markRange | L141-143 | 标记已占用区间（decomposeRunCode 内部闭包） |  |
| plugins/dsh-extra-plan/lib/run-code-static.js | isIdChar | L144 | 标识符字符判定（decomposeRunCode 内部闭包） |  |
| plugins/dsh-extra-plan/lib/run-code-static.js | runCodeCatchGateReason | L253-326 | run_code 多调用容错闸门：tools.* 调用点≥2 时要求每点独立容错，不足即教学式拒绝（单调用豁免；嵌套展平） |  |
| plugins/dsh-extra-plan/lib/run-code-static.js | within | L282 | 调用点区间包含判定（site.start 是否落在 a、b 之间）：把调用点归入 try 块或数组实参区间 |  |
| plugins/dsh-extra-plan/lib/run-code-static.js | collectRunCodeSites | L331-414 | run_code 调用点收集：跳过字符串/注释，识别 tools.x、tools['lit']、tools[var] |  |
| plugins/dsh-extra-plan/lib/run-code-static.js | askUserQuestionReturnGateReason | L418-610 | 主会话 run_code 的 ask 返回链闸门：允许直接 return-await 或变量接收后紧随顶层 return 引用结果，拒绝无法证明返回链的形态 |  |
| plugins/dsh-extra-plan/lib/run-code-static.js | isIdChar | L423 | 标识符字符判定（askUserQuestionReturnGateReason 内部闭包） |  |
| plugins/dsh-extra-plan/lib/run-code-static.js | skipWs | L424-428 | 自 start 起跳过空白字符，返回首个非空白字符下标（词法扫描的跳白工具） |  |
| plugins/dsh-extra-plan/lib/run-code-static.js | isTopLevel | L510 | 位置是否处于花括号/圆括号/方括号深度全为 0 的顶层语句中 |  |
| plugins/dsh-extra-plan/lib/run-code-static.js | candidateStarts | L511-518 | 收集 pos 之前的顶层语句起点，用于把调用归入所属顶层语句 |  |
| plugins/dsh-extra-plan/lib/run-code-static.js | tokenAt | L519-520 | pos 处是否恰为指定关键字且两侧均为标识符边界 |  |
| plugins/dsh-extra-plan/lib/run-code-static.js | expressionEnd | L521-530 | 求顶层语句的结束下标：顶层分号或语句起始换行 |  |
| plugins/dsh-extra-plan/lib/run-code-static.js | references | L531-546 | 按标识符边界在表达式内查找变量真实引用，排除成员访问与对象键 |  |
| plugins/dsh-extra-plan/lib/run-code-static.js | hasReassignment | L547-564 | 判定变量在表达式内是否被重新赋值，用于否掉被改写的伪白名单形态 |  |
| plugins/dsh-extra-plan/lib/run-code-static.js | afterCall | L565-575 | 取调用点之后的首个有效 token 位置并回传原始 gap，用于校验顶层 return |  |
| plugins/dsh-extra-plan/lib/run-code-static.js | runCodeSiteCount | L614-632 | run_code 静态调用点计数（planner 单实例上限快路径；run_code 调用点自身不计） |  |
| plugins/dsh-extra-plan/lib/run-code-static.js | isRunCodeSubCall | L636-641 | 子调用判定：exec.sub 或 exec.parent!==undefined |  |
| plugins/dsh-extra-plan/lib/run-code-static.js | runCodeDispatchCapText | L644-646 | 单实例子调用超限文案（T3 逐字）：rootCallId 实例子调用数超过 exploreBudget 上限 |  |
| plugins/dsh-extra-plan/lib/run-code-static.js | runCodeDispatchGateReason | L651-665 | 运行时单实例上限（planner）：按 rootCallId 计数，超 cap 返回 T3 文案 |  |
| plugins/dsh-extra-plan/lib/runtime-static.js | parseSkillFrontmatter | L4-13 | 从显式 SKILL 文本提取 name/description |  |
| plugins/dsh-extra-plan/lib/runtime-static.js | causeChainOf | L15-27 | 按显式 depth 提取错误 cause 链 |  |
| plugins/dsh-extra-plan/lib/save-contract.js | sanitizeTaskName | L4-12 | 任务名净化（截断/去非法字符） |  |
| plugins/dsh-extra-plan/lib/save-contract.js | timestamp | L15-19 | 本地时间戳 yyyyMMddHHmmss（文件名可读且具唯一性） |  |
| plugins/dsh-extra-plan/lib/save-contract.js | pad | L17 | timestamp 内部数字补零 |  |
| plugins/dsh-extra-plan/lib/save-contract.js | sessionTagOf | L23-25 | 会话标识段（去分隔符后取前 8 位字母数字） |  |
| plugins/dsh-extra-plan/lib/save-contract.js | savePlanBase | L31-34 | save_plan 文件名 base（任务短名 + 会话标识段 + 时间戳） |  |
| plugins/dsh-extra-plan/lib/save-contract.js | renderSavePlan | L41-43 | save_plan 结果渲染为单元素 ContentBlock[] |  |
| plugins/dsh-extra-plan/lib/save-contract.js | renderProbeMarkdown | L78-119 | save_probe 线索/证据报告 Markdown 渲染（固定标题与五节模板） |  |
| plugins/dsh-extra-plan/lib/save-contract.js | extractProbeEvidenceRefs | L124-132 | 提取方案中【探查者已核实】标注的证据文件路径并去重 |  |
| plugins/dsh-extra-plan/lib/save-contract.js | renderSaveProbe | L136-138 | save_probe 结果渲染为单元素 ContentBlock[] |  |
| plugins/dsh-extra-plan/lib/save-persistence.js | fsOpsOf | L10-13 | 合并末位可选文件系统操作依赖：未提供的操作项回退冻结只读的默认 node:fs 同义实现（另建新对象，不就地改写共享默认集） |  |
| plugins/dsh-extra-plan/lib/save-persistence.js | atomicCommit | L30-60 | 阶段感知原子提交：mkdir→写 tmp→写 journal→逐条 rename→逐项确认目标就位→清 journal；pre-journal 失败先删 journal 并用 existsSync 确认不存在才清 tmp（journal 删不掉则保留全部 tmp），post-journal 任何失败（rename/目标确认/journal 删除）保留 journal 与现场，始终抛原始错误、清理错误不覆盖；末位可选 fs 依赖注入 |  |
| plugins/dsh-extra-plan/lib/save-persistence.js | recoveryTargetsOf | L67-90 | journal 记录归一为非空恢复目标列表（新形状 entries ／ 旧形状 planTmp·checkTmp·planFile·checkFile）；形状非法、字段缺半对或无目标即抛错，走既有告警路径并保留 journal |  |
| plugins/dsh-extra-plan/lib/save-persistence.js | recoverJournals | L102-124 | journal 崩溃自愈：逐项「tmp 存在则 rename、随后确认目标存在」，已完成项凭目标存在幂等续做，任一项失败保留 journal，全项就位才删；形状非法/目标缺失告警后保留并继续扫其它 journal；兼容新旧形状并按 sessionTag 过滤；末位可选 fs 依赖注入 |  |
| plugins/dsh-extra-plan/lib/save-probe-validation.js | validateProbe | L10-109 | save_probe 参数校验：上限、路径存在性、range/evidence 规则与聚合拒绝 |  |
| plugins/dsh-extra-plan/lib/save-probe-validation.js | probePathOf | L112-115 | 相对路径按 cwd 解析、绝对路径原样返回 |  |
| plugins/dsh-extra-plan/lib/save-tool-factories.js | createSaveToolFactories | L7-192 | 创建只捕获目录与原子持久化依赖的 save 工具定义工厂；注入依赖：savePlanDir、atomicCommit、recoverJournals |  |
| plugins/dsh-extra-plan/lib/save-tool-factories.js | defineSavePlan | L8-74 | save_plan schema/output/render/execute（双写与证据引用校验） |  |
| plugins/dsh-extra-plan/lib/save-tool-factories.js | defineSaveProbe | L76-189 | save_probe schema/output/render/execute（限制校验与线索/证据落盘） |  |
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
| plugins/dsh-extra-plan/lib/settings.js | dshHomeDir | L26-30 | DSH_HOME 解析（环境变量优先） |  |
| plugins/dsh-extra-plan/lib/settings.js | agentCordisPath | L32-34 | agent.cordis.yml 路径 |  |
| plugins/dsh-extra-plan/lib/settings.js | isLoopback | L36-39 | 环回地址判定（API 仅本机） |  |
| plugins/dsh-extra-plan/lib/settings.js | json | L41-44 | HTTP JSON 响应 |  |
| plugins/dsh-extra-plan/lib/settings.js | readJsonBody | L46-64 | 读取请求体（限 1MB） |  |
| plugins/dsh-extra-plan/lib/settings.js | readAgentMetadata | L66-71 | 读实际 agent.cordis.yml 与内置模板文本（模板读取失败则回退实际文本）→ publicSettingMetadata 生成设置元数据 |  |
| plugins/dsh-extra-plan/lib/settings.js | proPayload | L73-76 | 在 readAgentMetadata 元数据上展开其 values，得到设置页 API 响应体 {…metadata, …metadata.values} |  |
| plugins/dsh-extra-plan/lib/settings.js | writeTextAtomic | L78-89 | 原子写文件（tmp+rename） |  |
| plugins/dsh-extra-plan/lib/settings.js | patchManagedFile | L91-99 | 按 entries 逐项对受管文件做保格式标量改写，任一项失败即抛「key reason」；全部成功后原子写落盘（写文件副作用） |  |
| plugins/dsh-extra-plan/lib/settings.js | createApiHandler | L101-149 | 设置页 HTTP API（GET/PUT pro-config；不含 qqbot——见独立插件 dsh-qqbot-user-questions） |  |
| plugins/dsh-extra-plan/lib/settings.js | apply | L151-162 | 插件入口（HTTP 服务注册） |  |
| plugins/dsh-extra-plan/lib/shell-mutation.js | commandTextOf | L32-44 | 解码对象/JSON 字符串两形状的 command 参数 |  |
| plugins/dsh-extra-plan/lib/shell-mutation.js | pwshCommandOf | L46 | 提取 pwsh command 文本 |  |
| plugins/dsh-extra-plan/lib/shell-mutation.js | bashCommandOf | L47 | 提取 bash command 文本 |  |
| plugins/dsh-extra-plan/lib/shell-mutation.js | mutationTextMatches | L52-78 | 按正则、段首词与内嵌 shell 深度判定写操作 |  |
| plugins/dsh-extra-plan/lib/shell-mutation.js | mutationMatches | L80-83 | 组合 command 提取与写模式判定 |  |
| plugins/dsh-extra-plan/lib/shell-mutation.js | pwshMutationMatches | L85 | 判定 pwsh 命令是否包含写操作 |  |
| plugins/dsh-extra-plan/lib/shell-mutation.js | bashMutationMatches | L86 | 判定 bash 命令是否包含写操作 |  |
| plugins/dsh-extra-plan/scripts/distribute-preset.mjs | messageFor | L9-13 | 把 syncPreset 的三态结果（idle/upgraded/其他）翻译成带目标目录的中文控制台提示行，纯字符串拼接无副作用 |  |
| plugins/dsh-extra-plan/scripts/distribute-preset.mjs | distribute | L16-21 | 预设分发（hash 比对→写 DSH_HOME/.agent-presets/extra-plan） |  |
| plugins/dsh-extra-plan/scripts/distribute-preset.mjs | invokedAsMain | L23-28 | 主脚本判定（node 直跑时执行 distribute） |  |
| plugins/dsh-extra-plan/scripts/generate-runtime-defaults.mjs | renderRuntimeDefaults | L14-22 | 校验模板并渲染唯一 DEFAULT_EXPLORE_BUDGET 生成文本 |  |
| plugins/dsh-extra-plan/scripts/generate-runtime-defaults.mjs | generateRuntimeDefaults | L24-39 | 先校验再生成或 --check 比对，失败保留旧生成物 |  |
| plugins/dsh-extra-plan/scripts/generate-runtime-defaults.mjs | invokedAsMain | L41-44 | 跨平台判断脚本是否作为 CLI 主入口运行 |  |
| plugins/dsh-qqbot-user-questions/index.js | apply | L15-24 | 插件入口：apply 启动时调 healQqbotCompatibility 自愈（迁移旧错误块+建链；try/catch 不阻断启动） |  |
| plugins/dsh-qqbot-user-questions/lib/heal.js | loadYamlModule | L19-35 | js-yaml 双 fallback 加载（本地 createRequire 失败回退官方 APPDATA DSH 包）；惰性缓存，导入零副作用 |  |
| plugins/dsh-qqbot-user-questions/lib/heal.js | timestamp | L37-41 | 时间戳 yyyyMMddHHmmssSSS（备份文件名唯一性，含毫秒） |  |
| plugins/dsh-qqbot-user-questions/lib/heal.js | pad | L39 | 数字补零（timestamp 内部闭包） |  |
| plugins/dsh-qqbot-user-questions/lib/heal.js | isObject | L56-58 | 非空普通对象判定（排除 null/数组） |  |
| plugins/dsh-qqbot-user-questions/lib/heal.js | stripBom | L60-62 | 去除行首 BOM（迁移扫描用） |  |
| plugins/dsh-qqbot-user-questions/lib/heal.js | lineIndent | L64-66 | 行首缩进宽度 |  |
| plugins/dsh-qqbot-user-questions/lib/heal.js | isIgnorableLine | L68-71 | 空行/注释行判定（块扫描跳过） |  |
| plugins/dsh-qqbot-user-questions/lib/heal.js | parseScalar | L73-81 | YAML 标量去引号（单/双引号成对时剥离） |  |
| plugins/dsh-qqbot-user-questions/lib/heal.js | parseEntryBlock | L83-91 | 条目块文本解析为单个对象（js-yaml；失败/非单元素 → null） |  |
| plugins/dsh-qqbot-user-questions/lib/heal.js | legacyEntryKind | L93-103 | 旧版根级完整块匹配（id+name[+config.default=standard]）→ 返回 id 或 null |  |
| plugins/dsh-qqbot-user-questions/lib/heal.js | fallbackLegacyEntryKind | L105-139 | js-yaml 不可用时按行匹配旧版根级块（id/name/config.default 逐行核对） | 行号区间由生成器按单行箭头函数链展开维护 |
| plugins/dsh-qqbot-user-questions/lib/heal.js | rootSequenceIndent | L141-151 | 根级序列缩进探测（首条 - 行的缩进宽度） |  |
| plugins/dsh-qqbot-user-questions/lib/heal.js | isRootSequenceLine | L153-157 | 指定缩进处的根级序列行判定 |  |
| plugins/dsh-qqbot-user-questions/lib/heal.js | scanRootBlocks | L159-185 | 按根级缩进切分顶层条目块（返回 lines/rootIndent/blocks） |  |
| plugins/dsh-qqbot-user-questions/lib/heal.js | findLegacyRootBlocks | L187-197 | 扫描并返回旧版根级块清单（解析判定优先、行级兜底） |  |
| plugins/dsh-qqbot-user-questions/lib/heal.js | removeLegacyRootBlocks | L199-210 | 移除旧版根级块（移除后无实质内容时写顶层 []） |  |
| plugins/dsh-qqbot-user-questions/lib/heal.js | verifyMigratedPatch | L212-237 | 迁移后校验：顶层为数组且无旧块残留（js-yaml 优先、行级兜底） |  |
| plugins/dsh-qqbot-user-questions/lib/heal.js | emptyArrayLine | L225 | 顶层空数组行（[]）判定（行级兜底用） |  |
| plugins/dsh-qqbot-user-questions/lib/heal.js | healPatchRows | L246-284 | 幂等**迁移**旧版根级 code-runtime/agent-presets 错误块（语义是移除旧块，两行补入由包内静态 cordis.patch.yml 的 insert 唯一提供）；写前 .bak-* 备份、写后校验失败恢复；文件不存在跳过 | 函数名带 Patch/补行语义易误读，实为「清旧块」；旧描述「补两行」已失效（2026-09-12 订正） |
| plugins/dsh-qqbot-user-questions/lib/heal.js | findOwnQqbotProfiles | L292-312 | 扫描 $DSH_HOME/profiles/* 找出锚定本插件的 qqbot profile（bundles + node_modules 双条件） |  |
| plugins/dsh-qqbot-user-questions/lib/heal.js | ensureDshExtraPlanLink | L320-350 | 建 @local/dsh-extra-plan → web 包链接：web 缺失跳过/已正确不动/实体或非目标链接提示 pnpm 迁移/仅 ENOENT 建 junction |  |
| plugins/dsh-qqbot-user-questions/lib/heal.js | healQqbotCompatibility | L356-369 | 对每个自有 profile 依次执行 healPatchRows（清旧错误块）与 ensureDshExtraPlanLink（建链）；整体 try/catch 只记录日志不阻断 |  |
| plugins/dsh-qqbot-user-questions/scripts/heal.mjs | invokedAsMain | L9-14 | 主脚本判定（node 直跑时执行自愈；镜像 distribute-preset.mjs invokedAsMain） |  |

---

*本文件由脚本增量维护；直接编辑功能描述/备注列是安全的。*
