# 代码地图（dsh-extra-plan）

> **维护分工**：行号区间/增删行由脚本 node pe-test/tools/代码地图生成.mjs 增量同步；**功能描述、备注、以及「意图速查」整节由 AI/人维护**（脚本刷新不会覆盖）。
> **用法**：先看「意图速查」按意图词找函数名 → 再到「函数索引」按函数名取行号区间 → read 该区间。
> 上次同步：2026-09-18 16:05:01（脚本自动更新时间戳行）

## 意图速查（人工维护：意图词 → 函数名；行号请到下方「函数索引」按函数名取）

> 用法：拿用户/AI 口里的词在「想找什么」列 grep → 得函数名 → 到「函数索引」grep 该函数名 → 取行号区间 → read 该区间。
> 本节引用的函数名若不存在于索引，生成脚本会报 `[导航失效]`（防止入口过期）。

| 想找什么（含同义词/英文标识） | 文件 | 函数名 |
|:--|:--|:--|
| 四级闸门／路由确认／目的确认／批准／流程状态（route/purpose/clarified/approved） | index.js | deriveFlowState、mainGateReason、routeDenyReason、gateAskDenyReason、validateGateAskStructure、matchPurposeLabel |
| 探查预算／额度／剩余次数／耗尽（exploreBudget/budget） | index.js | toolCallsSinceUser、budgetNoticeText、budgetReminderText、budgetExhaustedReason |
| run_code 组判定／绕道拆解／调用点扫描（decompose） | plugins/dsh-extra-plan/lib/run-code-static.js、plugins/dsh-extra-plan/index.js | decomposeRunCode、collectRunCodeSites、runCodeGroupDenyReason |
| run_code 多调用容错／教学文案（容错检查开关） | plugins/dsh-extra-plan/lib/run-code-static.js | runCodeCatchGateReason |
| ask 必须 return／返回值白名单 | plugins/dsh-extra-plan/lib/run-code-static.js | askUserQuestionReturnGateReason |
| 单实例调用点上限／循环放大 | plugins/dsh-extra-plan/lib/run-code-static.js | runCodeSiteCount、runCodeDispatchGateReason、runCodeDispatchCapText |
| job_output 禁 wait:true／同 job 查重 | index.js | jobOutputGateReason |
| 命令文本提取／写操作判定／runner 写暗示（write/拦截） | index.js、plugins/dsh-extra-plan/lib/run-code-static.js | commandTextOf、pwshCommandOf、bashCommandOf、mutationTextMatches、pwshMutationMatches、bashMutationMatches、runCodeTextOf、codeMutationHints |
| 锚定引导／F-L 首轮极简／bootstrap／HN-HB-HP | index.js、plugins/dsh-extra-plan/lib/assembly-presentation.js | isBootstrapPhase、projectAssemblyForPresentation |
| A/C/M 展示投影／C7 过滤／Pure PTC 最小 read／SDK 重建 | index.js、plugins/dsh-extra-plan/lib/assembly-presentation.js | projectAssemblyForPresentation、renderFilteredToolsSdk、filteredCordisSchemas、toolSdkSchemasOf、readSchemasForRendering、renderMinimalReadText |
| skill catalog 暂隐／普通 skill 保留／HP1 | index.js、plugins/dsh-extra-plan/lib/assembly-presentation.js | skillCatalogEntriesOf、renderSkillCatalogText、projectSkillCatalogDecision、shouldHideCreativeCatalog |
| 方案/询问工具在未确认路由下的拒绝文案（plan route） | index.js | planDenyReason |
| 批准前禁委派（approval deny） | index.js | approvalDenyReason |
| 规划子代理分支闸门（planner 写禁+预算） | index.js | plannerGateReason |
| 会话事件快照/子代理角色识别 | lib/agent-session.js | sessionEvents、isSubagentChild |
| 方案与验收落盘／save_plan 双写（plan/checklist） | lib/save-tool-factories.js、lib/save-contract.js、index.js | defineSavePlan、registerSavePlan、savePlanBase |
| 落盘原子提交／journal 崩溃自愈（atomic/commit） | lib/save-persistence.js、index.js | atomicCommit、recoverJournals |
| 线索落盘／save_probe／证据报告（probe/evidence；PROBE_LIMITS evidence=150/text=1000；step-00 PR23=151、PR34/PR35） | lib/save-contract.js、lib/save-probe-validation.js、lib/save-tool-factories.js、index.js | validateProbe、renderProbeMarkdown、extractProbeEvidenceRefs |
| save 合同／限制值／ContentBlock 渲染（11 个导出 = 8 个函数 + 3 个常量 PROBE_LIMITS、LINE_FORMAT_HINT、RANGE_FORMAT_HINT） | lib/save-contract.js | sanitizeTaskName、timestamp、sessionTagOf、savePlanBase、renderSavePlan、renderProbeMarkdown、renderSaveProbe、extractProbeEvidenceRefs |
| save_probe 校验／路径存在性与聚合拒绝 | lib/save-probe-validation.js | validateProbe、probePathOf |
| save 工具显式依赖工厂 | lib/save-tool-factories.js | createSaveToolFactories、defineSavePlan、defineSaveProbe |
| PTC F→L／native-both HN-HB 实机取证 | pe-test/docs/ai-实机闸门测试流程.md |  |
| 实机子代理模型／提供方／planner 引导取证（A42/A43、C11/C12、HUMAN；显式 SESSION_ID + PLANNER_PROMPT_SUFFIX；request/header attempted route 与 assistant/message actual provenance 分栏；suffix 等级与完整文本） | pe-test/tools/step-07-子代理模型与引导取证.mjs |  |
| 120格 A/C/M/F-L 路由与目录断言／显式 header catalog 取证 | pe-test/tools/step-04-路由与写闸门.mjs、pe-test/tools/step-04-工具清单查看.mjs |  |
| 探查者委派／禁止 planner 派探查（subagent_probe） | index.js、plugins/dsh-extra-plan/lib/model-routing.js | subagentProbeGateReason、resolveOtherAgentEntry |
| 只读子代理／验收者只读（reviewer/readonly） | index.js | childReadonlyGateReason、isReadOnlyChildByCatalog |
| 子代理沙箱下限／权限抬升（floor/sandbox） | index.js | childPolicyNeedsFloor、floorChildPolicy |
| 工具目录折叠／PTC 单入口（catalog/ptc） | index.js | catalogIsCollapsed |
| planner/其他子代理模型与跨 Provider 真实探针／plannerModel/otherAgentModel（T2/T4） | plugins/dsh-extra-plan/lib/model-routing.js | resolvePlannerEntry、resolvePlannerEntryLegacy、resolvePlannerEntryStrict、resolveOtherAgentEntry、resolveOtherAgentEntryLegacy、resolveOtherAgentEntryStrict、resolveAgentRouteSources、probePlannerRoute、withPlannerProbeDeadline、sortPlannerCandidates、decidePlannerModelUse |
| 设置页读写／配置项真源（settings/descriptor） | lib/settings.js、lib/preset-settings.js | createApiHandler、publicSettingMetadata、patchYamlScalar |
| 预设下发／自愈／hash 比对（preset-sync） | lib/preset-sync.js | syncPreset、stagePreset、switchStage |
| 预设分发脚本（distribute） | scripts/distribute-preset.mjs | distribute |
| 设置页前端 UI／卡片（React） | lib/client.js | ProConfigTab、ExtraPlanCard |
| 执行者工具裁剪／deny（executor-spawn） | lib/executor-spawn.js | apply |
| qqbot 兼容自愈／建链 | dsh-qqbot-user-questions/lib/heal.js（选装包，本机未安装） | healQqbotCompatibility、ensureDshExtraPlanLink |
| 代码地图自身维护／口径／严格模式 | pe-test/tools/代码地图生成.mjs（不在索引范围，读文件头注释） |  |

## 文件总览

| 文件 | 行数 | 说明 |
|:--|--:|:--|
| plugins/dsh-extra-plan/index.js | 2120 | 模式核心：四级闸门（路由/目的/澄清/批准）+ 探查预算 + apply 创建/注册 save 工具工厂并接生命周期/闸门 + planner/非 planner child 双 resolver 与跨 Provider 真实 probe/严格 fallback + A/C/M 展示投影、HP 最小 read、HP0/HP1 首轮投影与 HN/HB 基线与 catalog 时序（修改最频繁） |
| plugins/dsh-extra-plan/lib/agent-session.js | 36 | 会话事件与子代理识别的唯一来源：sessionEvents/isSubagentChild 零依赖纯函数，被 index.js 与 lib/model-routing.js 共用（无镜像副本；不 import index.js） |
| plugins/dsh-extra-plan/lib/assembly-presentation.js | 251 | A/C/M 展示投影与 skill catalog 投影：读取 live tools registry（toolRegistryOf/toolSdkSchemasOf/toolPresentationModeOf 读 scoped tools 服务）；SDK renderer 惰性加载缓存（sdkRendererModulePromise）；模块头自述 live 取数已迁入 |
| plugins/dsh-extra-plan/lib/client-bridge.js | 19 | 客户端桥接壳：仅承载 dsh.client 加载路径指向 lib/client.js（apply 空实现） |
| plugins/dsh-extra-plan/lib/client.js | 359 | dsh web 设置界面 UI（React；同一外层 esp-card 内有通用设置/pro规划模块两个 esp-section 内嵌卡片；十项字段为名称→metadata 控件→静态 hint→相邻分隔栏；保存 footer 只在外层共享） |
| plugins/dsh-extra-plan/lib/executor-spawn.js | 90 | 执行者子代理 provider：委托宿主 spawn，注入工具 deny（防委派递归/追问） |
| plugins/dsh-extra-plan/lib/model-routing.js | 498 | planner/非 planner 子代理模型路由：顶层纯判定函数 + createModelRouting per-apply 工厂（per-instance WeakMap、惰性 llm/agents getter；不 import index.js） |
| plugins/dsh-extra-plan/lib/preset-settings.js | 430 | 十项设置描述表（唯一真源，含 creativeMode 默认 false）+ 预设 YAML 解析 + 保格式定点标量改写；plannerModel/otherAgentModel validator 放开空串并 trim |
| plugins/dsh-extra-plan/lib/preset-sync.js | 278 | 预设资产自动下发同步（distHash 比对，幂等） |
| plugins/dsh-extra-plan/lib/run-code-static.js | 678 | run_code 纯静态解析/理由模块：写模式 hint、工具组拆解、ask 返回值白名单、调用点计数与双兼容 dispatch cap；仅显式注入普通依赖，不持有宿主状态；导出常量 RUNCODE_MUTATION_HINTS（9 条禁用 API 黑名单）与 runCodeCatchGateReason 内部闭包 scanLayer（单层 try/catch 保护扫描）属常量与跨行 const 箭头，生成器不入函数索引，故仅在此登记 |
| plugins/dsh-extra-plan/lib/save-contract.js | 138 | 合同唯一真源：任务名/时间戳/sessionTag/base、PROBE_LIMITS 与 save_plan/save_probe ContentBlock/Markdown 渲染；无宿主状态；PROBE_LIMITS 共 20 个字段（含四类条目数/路径长度/各维度上限/正则/证据维度上限/任务名长度；字段名与上限以本文件 PROBE_LIMITS 为唯一口径）；LINE_FORMAT_HINT / RANGE_FORMAT_HINT 为格式提示常量 |
| plugins/dsh-extra-plan/lib/save-persistence.js | 58 | 公共原子落盘：tmp→journal→rename→清 journal；新旧 journal 自愈与 sessionTag 过滤 |
| plugins/dsh-extra-plan/lib/save-probe-validation.js | 115 | save_probe 参数校验：数组/条目/长度/总量/path 存在性/range/evidence 聚合拒绝 |
| plugins/dsh-extra-plan/lib/save-tool-factories.js | 192 | 显式依赖工厂：定义 save_plan/save_probe schema/output/render/execute；不缓存 ctx/agent/会话状态 |
| plugins/dsh-extra-plan/lib/settings.js | 162 | 设置页后端 HTTP API（pro-config；qqbot 相关已随精简版插件移除） |
| plugins/dsh-extra-plan/scripts/distribute-preset.mjs | 40 | 预设分发脚本（安装/更新时写 DSH_HOME/.agent-presets/extra-plan） |
| plugins/dsh-qqbot-user-questions/index.js | 24 | qqbot 精简版自愈插件：apply 启动时调 healQqbotCompatibility（迁移旧错误块+建链），不阻断启动 |
| plugins/dsh-qqbot-user-questions/lib/heal.js | 369 | 自愈纯函数模块（定位 profile/旧块迁移/建链；供 index.js/CLI/测试复用） |
| plugins/dsh-qqbot-user-questions/scripts/heal.mjs | 26 | CLI 兜底入口（postinstall/手动触发；invokedAsMain 判定） |

## 函数索引

| 文件 | 函数 | 行号 | 功能描述 | 备注 |
|:--|:--|:--|:--|:--|
| plugins/dsh-extra-plan/index.js | purposeRouteDenyReason | L106-108 | 精确目的 ask 在非 plan 路由下的固定路由确认拒绝文案（引用 ROUTE_CONFIRM_TEXT） |  |
| plugins/dsh-extra-plan/index.js | routeDenyReason | L111-116 | 路由未确认时 write/edit/写shell 的拒绝文案（提示先做路由确认） |  |
| plugins/dsh-extra-plan/index.js | planDenyReason | L117-128 | plan 路由下 save_probe/subagent_plan 前置条件未满足的拒绝文案 |  |
| plugins/dsh-extra-plan/index.js | approvalDenyReason | L129-131 | 批准前禁止执行委派类工具（subagent/workflow/ralph）拒绝文案 |  |
| plugins/dsh-extra-plan/index.js | isDispatchStart | L148 | 双兼容事件名判定：命中 DISPATCH_START 集合（新名 tool/ptc-dispatch-start = 0.1.5-rc.2 / 旧名 tool/code-dispatch-start = 0.1.2-rc.1） |  |
| plugins/dsh-extra-plan/index.js | isDispatch | L149-152 | 双兼容事件名判定：命中 DISPATCH 集合（新名 tool/ptc-dispatch = 0.1.5-rc.2 / 旧名 tool/code-dispatch = 0.1.2-rc.1） |  |
| plugins/dsh-extra-plan/index.js | isLiveDelegation | L189-200 | 子代理是否仍有存活父会话（live delegation）判定 |  |
| plugins/dsh-extra-plan/index.js | childPolicyNeedsFloor | L203-208 | 子代理沙箱策略需抬升为 workspace-write 的判定 |  |
| plugins/dsh-extra-plan/index.js | isBootstrapPhase | L211-221 | anchored 引导阶段判定（首个工具调用前） |  |
| plugins/dsh-extra-plan/index.js | commandTextOf | L226-238 | 从 exec.arguments 提取 shell 命令原文（字符串/parsed 兼容） |  |
| plugins/dsh-extra-plan/index.js | pwshCommandOf | L239 | 提取 pwsh 命令文本 |  |
| plugins/dsh-extra-plan/index.js | bashCommandOf | L240 | 提取 bash 命令文本 |  |
| plugins/dsh-extra-plan/index.js | mutationTextMatches | L243-269 | 写操作文本判定主体：先整套正则直命中，再把文本按 `;`/换行/`&&`/双竖线（`｜｜`）/单竖线（`｜`）/`&` 切段后按段首词判定 |  |
| plugins/dsh-extra-plan/index.js | mutationMatches | L270-273 | 命令命中写操作拒绝正则判定 |  |
| plugins/dsh-extra-plan/index.js | pwshMutationMatches | L274 | pwsh 写操作判定（调 mutationMatches） |  |
| plugins/dsh-extra-plan/index.js | bashMutationMatches | L275 | bash 写操作判定（调 mutationMatches） |  |
| plugins/dsh-extra-plan/index.js | labelsOfCallData | L281-297 | 从 ask 调用数据提取选项 label 集合 |  |
| plugins/dsh-extra-plan/index.js | normalizeLabel | L310-312 | label 规范化（空白清理） |  |
| plugins/dsh-extra-plan/index.js | isExactGateSet | L315-322 | label 集合与闸门常量集完全一致判定 |  |
| plugins/dsh-extra-plan/index.js | isPartialGateSet | L325-333 | label 与闸门词部分包含判定 |  |
| plugins/dsh-extra-plan/index.js | categorizeGateAsk | L336-340 | ask 分类（standard/malformed/ordinary）；standard/malformed 判定并入路由/批准/目的三套词集 |  |
| plugins/dsh-extra-plan/index.js | gateAskDenyReason | L343-379 | 生成标准闸门 ask 选项/结构错误的拒绝理由 |  |
| plugins/dsh-extra-plan/index.js | validateGateAskStructure | L385-406 | 校验路由/目的/批准 ask 结构（问题数、固定选项、修改意见） |  |
| plugins/dsh-extra-plan/index.js | askKindOf | L413-430 | 从 label 判定 ask 类型（route/approve/purpose） |  |
| plugins/dsh-extra-plan/index.js | askKindOfRelaxed | L436-452 | 宽松判定 ask 类型（特异性词优先：路由→批准→仅不同意→目的→澄清） |  |
| plugins/dsh-extra-plan/index.js | matchRouteLabel | L454-463 | 用户选择标签→direct/plan/disagree |  |
| plugins/dsh-extra-plan/index.js | matchApprovalLabel | L465-474 | 用户选择标签→approve/replan/disagree |  |
| plugins/dsh-extra-plan/index.js | matchPurposeLabel | L476-482 | 用户选择标签→refine/redo（第四锚点目的二选一：「完善方案」/「重新规划」） |  |
| plugins/dsh-extra-plan/index.js | parseAskResultData | L488-523 | tool/result 解析用户选择（answers.selected） |  |
| plugins/dsh-extra-plan/index.js | parseDispatchAskResult | L531-557 | ptc/code-dispatch 的 ask 结果解析（双兼容，含 error 分支） |  |
| plugins/dsh-extra-plan/index.js | deriveFlowState | L565-672 | 事件流推导 flow state（route/clarified/approved/purpose/channelBroken） |  |
| plugins/dsh-extra-plan/index.js | resetStageState | L567-571 | 回放正常路由/有效目的前重置 purpose、clarified、approved | deriveFlowState 内部辅助 |
| plugins/dsh-extra-plan/index.js | resetRouteState | L572-575 | 回放非通道 ask 错误时设置 route=none 并清理阶段状态 | deriveFlowState 内部辅助 |
| plugins/dsh-extra-plan/index.js | toolCallCount | L681-708 | 统计成功工具调用次数（可跳过指定工具） |  |
| plugins/dsh-extra-plan/index.js | toolCallsSinceUser | L715-730 | 最近一次用户/agent-message 锚点之后的工具调用数 |  |
| plugins/dsh-extra-plan/index.js | appendSuffixBlock | L738-755 | 给 user 消息追加文本块（拼入第一个 text 块尾部） |  |
| plugins/dsh-extra-plan/index.js | withPlannerPromptSuffix | L756-765 | 拼接规划子代理附加引导 |  |
| plugins/dsh-extra-plan/index.js | budgetNoticeText | L772-774 | 开局预算提示文案（本轮探查预算上限 N 次） |  |
| plugins/dsh-extra-plan/index.js | withBudgetNotice | L778 | 预算提示拼接进消息 |  |
| plugins/dsh-extra-plan/index.js | budgetReminderText | L781-785 | 剩余≤3次提醒文案 |  |
| plugins/dsh-extra-plan/index.js | budgetReminderMessage | L789-791 | 剩余提醒消息构造 |  |
| plugins/dsh-extra-plan/index.js | budgetReminderSent | L795-818 | 本锚点是否已注入剩余提醒（防重复注入） |  |
| plugins/dsh-extra-plan/index.js | budgetExhaustedReason | L822-824 | 预算耗尽文案（已用 x/y） |  |
| plugins/dsh-extra-plan/index.js | budgetExceeded | L827-829 | used+1 超预算判定 |  |
| plugins/dsh-extra-plan/index.js | catalogHasWriteTools | L835-840 | 工具目录是否含写工具判定 |  |
| plugins/dsh-extra-plan/index.js | isReadOnlyChildByCatalog | L843-845 | 按工具目录判定只读子代理 |  |
| plugins/dsh-extra-plan/index.js | schemasHasWriteTools | L850-855 | schemas 数组是否含写工具 |  |
| plugins/dsh-extra-plan/index.js | schemasHasTool | L859-864 | schemas 是否含指定工具 |  |
| plugins/dsh-extra-plan/index.js | catalogIsCollapsed | L871-876 | 工具目录折叠为单工具判定（run_code/仅shell） |  |
| plugins/dsh-extra-plan/index.js | subagentProbeGateReason | L886-895 | 探查者分支闸门（T5 唯一功能点）：planner 禁止委派（文案指向「申请继续探查」）+ 主会话 run_in_background 必 true；两调用点（组判定/直呼）共用 |  |
| plugins/dsh-extra-plan/index.js | plannerGateReason | L898-916 | 规划子代理分支闸门（write/edit/pwsh/bash 写禁 + 预算） |  |
| plugins/dsh-extra-plan/index.js | childReadonlyGateReason | L919-931 | 子代理只读分支闸门（探查者/验收者差异化文案；不含 run_code） |  |
| plugins/dsh-extra-plan/index.js | jobOutputGateReason | L936-958 | job_output 闸门：禁 wait:true + 同 job 重复调用查重（内存计数器） |  |
| plugins/dsh-extra-plan/index.js | probeDisposalWarning | L966-969 | 探查者级联中止告警纯函数：剩余未认领探查者委派数为正整数时返回告警文案（T5 文案中性化「委派方会话销毁时」+ owner disposed + 引擎限制指向官方包）；非正整数返回 null |  |
| plugins/dsh-extra-plan/index.js | mainGateReason | L977-1102 | 主会话闸门主分支（ask/write/edit/plan/save_plan/subagent/run_code/job_output…）；save_plan 仅 direct 放行（T3）；save_probe/subagent_plan 还需目的已定（purpose∈refine/redo，第四锚点） |  |
| plugins/dsh-extra-plan/index.js | runCodeGroupDenyReason | L1112-1195 | run_code 组判定：拆解→成员逐判定→聚合拒绝；预算耗尽白名单把关 |  |
| plugins/dsh-extra-plan/index.js | visit | L1129-1172 | 递归展平嵌套 run_code（runCodeGroupDenyReason 内闭包） |  |
| plugins/dsh-extra-plan/index.js | aggregateRunCodeDenyReason | L1201-1213 | 聚合多成员拒绝消息 |  |
| plugins/dsh-extra-plan/index.js | apply | L1354-2120 | 插件主入口：配置解析/服务注册/工具注册/creativeMode 模型可见投影/锚点钩子；planner 与非 planner child 双模型路由 |  |
| plugins/dsh-extra-plan/index.js | foldUsage | L1391-1465 | usage 账本折叠写入（cursor 去重，按 sessionId+seq） |  |
| plugins/dsh-extra-plan/index.js | isChild | L1470-1478 | 子代理判定（live 校验+误分类警示） |  |
| plugins/dsh-extra-plan/index.js | isPlannerChild | L1482-1496 | 规划子代理判定（descriptor.mode=continuable） |  |
| plugins/dsh-extra-plan/index.js | toolSchemasOf | L1501-1519 | 防御式获取 agent 工具 schemas |  |
| plugins/dsh-extra-plan/index.js | parseSkillFrontmatter | L1576-1585 | SKILL.md frontmatter 的 name/description 解析 |  |
| plugins/dsh-extra-plan/index.js | floorChildPolicy | L1587-1591 | 子代理沙箱策略抬升（workspace-write） |  |
| plugins/dsh-extra-plan/index.js | childBaseline | L1593-1599 | 子代理基线（判定/usage/floor 汇总） |  |
| plugins/dsh-extra-plan/index.js | registerTool | L1604-1617 | 工具注册分发 |  |
| plugins/dsh-extra-plan/index.js | registerSavePlan | L1620 | save_plan 注册（规划子代理层 + 主会话层；主会话侧放行由 mainGateReason 限 direct，T3） |  |
| plugins/dsh-extra-plan/index.js | registerSaveProbe | L1624 | save_probe 注册（主会话层 + 已认领的探查子代理层；规划子代理/执行者/reviewer 不是持有者） |  |
| plugins/dsh-extra-plan/index.js | probeClaimFor | L1634-1650 | 放行-认领关联查核（pendingProbeClaims）：非子代理/含写子代理/规划子代理（T5 守卫）不认领，命中则消费计数并登记 save_probe |  |
| plugins/dsh-extra-plan/index.js | shouldHideCreativeCatalog | L1670-1676 | HP1 判定：C=1、A=1、F、main/planner、M=ptc 时暂隐两个创造 skill |  |
| plugins/dsh-extra-plan/index.js | causeChainOf | L1717-1729 | 拒绝原因链解析（子代理继承根因） |  |
| plugins/dsh-extra-plan/index.js | recordRequestError | L1730-1752 | 记录请求错误诊断到插件目录（diagPath 为 apply 内定义的诊断目录路径） |  |
| plugins/dsh-extra-plan/lib/agent-session.js | sessionEvents | L14-18 | 取 agent.session 事件快照（缺失兜底空数组）；唯一来源 |  |
| plugins/dsh-extra-plan/lib/agent-session.js | isSubagentChild | L21-36 | 判定会话属于子代理（header.origin/delegationDepth/descriptor 三路探测）；唯一来源，index.js 经 decisions re-export |  |
| plugins/dsh-extra-plan/lib/assembly-presentation.js | sectionOf | L30-33 | 按名称取 PromptAssembly section |  |
| plugins/dsh-extra-plan/lib/assembly-presentation.js | sectionTextOf | L35-38 | 取指定 section 的文本，缺失返回空串 |  |
| plugins/dsh-extra-plan/lib/assembly-presentation.js | readSchemasForRendering | L40-43 | 从明确 schema 数组只选 read，供 HP 最小契约 renderer |  |
| plugins/dsh-extra-plan/lib/assembly-presentation.js | renderMinimalReadText | L45-56 | 合并既有 read guidance 与官方单-read SDK renderer 文本 |  |
| plugins/dsh-extra-plan/lib/assembly-presentation.js | skillCatalogEntriesOf | L58-66 | 校验并提取 skill catalog 的最小 name/description 条目 |  |
| plugins/dsh-extra-plan/lib/assembly-presentation.js | renderSkillCatalogText | L68-90 | 按条目重建系统 skill catalog 文本 |  |
| plugins/dsh-extra-plan/lib/assembly-presentation.js | projectSkillCatalogDecision | L92-118 | 在当前消息副本中暂隐创造 skill，不注销 binding |  |
| plugins/dsh-extra-plan/lib/assembly-presentation.js | isCordisPresentationTool | L120-122 | 判断名称是否属于固定 7 项 Cordis 模型可见工具集合 | 模型可见投影；不改变 registry binding |
| plugins/dsh-extra-plan/lib/assembly-presentation.js | filteredCordisSchemas | L124-127 | 从 schema 数组排除固定 7 项 Cordis 工具，供 SDK 整体重建 |  |
| plugins/dsh-extra-plan/lib/assembly-presentation.js | hasSection | L129-131 | 判断 PromptAssembly 是否含指定命名 section |  |
| plugins/dsh-extra-plan/lib/assembly-presentation.js | hasNonEmptySection | L133-135 | 判断 tools:ptc-only 是否为有效非空 section，识别 Pure PTC |  |
| plugins/dsh-extra-plan/lib/assembly-presentation.js | projectAssemblyForPresentation | L138-162 | 创建不原地修改的模型可见 assembly：按当前 schema 交集过滤工具，替换 SDK 文本并隐藏 tool:cordis，另支持 Pure PTC 顶层单入口 | 不改变 registry/restrict/pre-execute |
| plugins/dsh-extra-plan/lib/assembly-presentation.js | sdkSchemasForRendering | L164-171 | 从 schema 输入排除 run_code 与 Cordis，并确保 renderer 获得输出 schema | 不读取原始 tools:sdk 文本 |
| plugins/dsh-extra-plan/lib/assembly-presentation.js | dshToolsEntryCandidates | L173-189 | 生成 DSH_HOME/profile 与平台官方 dsh-tools SDK renderer 候选路径 | 只读加载官方包，不修改安装目录 |
| plugins/dsh-extra-plan/lib/assembly-presentation.js | loadSdkRendererModule | L192-202 | 惰性加载并缓存官方 TypeScript/Python SDK renderer 模块 |  |
| plugins/dsh-extra-plan/lib/assembly-presentation.js | renderFilteredToolsSdk | L205-210 | 仅以过滤后的 schema 整体调用官方 renderer 生成 tools:sdk，按 codeRuntime language 选择 TS/Python | 不做原始文本正则删块 |
| plugins/dsh-extra-plan/lib/assembly-presentation.js | toolRegistryOf | L212-220 | 防御式读取 agent scoped tools service，服务缺失或异常返回 undefined |  |
| plugins/dsh-extra-plan/lib/assembly-presentation.js | toolSdkSchemasOf | L222-240 | 优先读取 tools.sdkSchemas；兼容旧服务时从 schemas 补 owned output schema，供 SDK renderer 使用 |  |
| plugins/dsh-extra-plan/lib/assembly-presentation.js | toolPresentationModeOf | L242-251 | 从 scoped tools registry 读取 native/ptc/both 模式 |  |
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
| plugins/dsh-extra-plan/lib/model-routing.js | isExplicitRoute | L17-23 | 按直接父 provider/model 比较 child resolved route，判断 agentOptions 显式路由并短路模型解析 |  |
| plugins/dsh-extra-plan/lib/model-routing.js | isExplicitEffort | L27-29 | 显式指定 reasoningEffort 判断 |  |
| plugins/dsh-extra-plan/lib/model-routing.js | requestConfigSnapshot | L39-52 | 从 Agent 的 requestHeader 只提取 provider/model/maxTokens/reasoningEffort owned 路由快照，异常或缺 config 返回 null | 不序列化/持有 Cordis 对象 |
| plugins/dsh-extra-plan/lib/model-routing.js | agentFromRegistry | L54-57 | 防御式按 session id 从 agents registry 取父 Agent，服务缺失或 get 异常返回 undefined |  |
| plugins/dsh-extra-plan/lib/model-routing.js | resolveAgentRouteSources | L60-85 | 沿 parentSession 链解析直接父与完整顶层主会话来源；断链标记 incomplete，不把中间 child 当主会话 fallback | 非 planner 与 probe 共用 |
| plugins/dsh-extra-plan/lib/model-routing.js | decidePlannerModelUse | L107-120 | T2 静默降级判定：目录命中→用 plannerModel；清单非空未命中→不覆盖（inherit-parent）；空/异常→沿用 |  |
| plugins/dsh-extra-plan/lib/model-routing.js | comparePlannerText | L127-131 | 规划 provider name/id 的确定性字典序比较 |  |
| plugins/dsh-extra-plan/lib/model-routing.js | plannerProviderRank | L133-137 | 候选排序层级：普通 provider、父会话 provider、deepseek-official |  |
| plugins/dsh-extra-plan/lib/model-routing.js | sortPlannerCandidates | L139-150 | 真实探针成功候选排序：普通 name/id 正序，父 provider 倒数第二，官方最后 |  |
| plugins/dsh-extra-plan/lib/model-routing.js | createModelRouting | L154-498 | 创建 per-apply 模型路由工厂：内部新建 plannerModelCache/otherAgentModelCache WeakMap，承载 planner 与非 planner 的 legacy/strict 双路径解析，返回 { resolvePlannerEntry, resolveOtherAgentEntry } | 每次 apply 各一份（绝不提升为模块全局）；llm/agents/诊断路径走惰性 getter |
| plugins/dsh-extra-plan/lib/model-routing.js | plannerAbortError | L162-165 | 保留外部 turn abort 原因，避免改写为严格路由阻断 |  |
| plugins/dsh-extra-plan/lib/model-routing.js | withPlannerProbeDeadline | L169-202 | planner 与非 planner route 共用本地 30000ms AbortController/race 覆盖目录、准备与流消费并清理计时器 | 不遵守 signal 的第三方 adapter 可能遗留 I/O |
| plugins/dsh-extra-plan/lib/model-routing.js | probePlannerRoute | L206-247 | planner 与非 planner 候选或顶层 fallback 共用 prepareCall + 完整 prepared stream 的 OK probe，隔离失败终止块/无终止块/超时 | 仅 True 路径调用，不把目录或 resolveCallConfig 当成功 |
| plugins/dsh-extra-plan/lib/model-routing.js | extractParentEntry | L251-261 | 从父会话 requestHeader().config 提取 provider/model/maxTokens（非法或缺失取 undefined），parent 为 null/undefined 时返回 null | 旧流程与严格路径共用；不读取 agent.session 字段 |
| plugins/dsh-extra-plan/lib/model-routing.js | resolvePlannerEntryLegacy | L265-320 | False/缺失/非法开关的旧单 provider listModels advisory 解析与原降级诊断 | 不枚举 provider、不做真实 probe |
| plugins/dsh-extra-plan/lib/model-routing.js | resolvePlannerEntryStrict | L323-389 | True 路径枚举全 provider、等待全部匹配候选排序，并验证父 provider/model fallback；无验证路由固定 reject | plannerModel 为空仅验证父 fallback |
| plugins/dsh-extra-plan/lib/model-routing.js | routeKey | L355 | 以 provider 与 model 组成 probe outcome 复用键，避免 fallback 同路由二次请求 | 仅 resolver 内部使用 |
| plugins/dsh-extra-plan/lib/model-routing.js | resolvePlannerEntry | L393-401 | 单点分流并立即缓存 in-flight promise：False 走旧 advisory，True 走全 provider 真实 probe 与严格 fallback | 成功 entry 与 rejection 均固定到 Agent |
| plugins/dsh-extra-plan/lib/model-routing.js | nonPlannerRouteSources | L405-409 | 读取非 planner resolver 所需的 agents registry，并把服务异常转换为不可用来源 |  |
| plugins/dsh-extra-plan/lib/model-routing.js | nonPlannerFallbackEntry | L411-419 | 组装顶层主会话 provider/model fallback；普通 child 继承直接父 maxTokens，probe 保留顶层 maxTokens |  |
| plugins/dsh-extra-plan/lib/model-routing.js | resolveOtherAgentEntryLegacy | L422-438 | cross=false/缺失/非法时只查顶层主会话 provider 的 advisory listModels，命中 otherAgentModel 才覆盖，否则回退 | 不枚举 provider、不做真实 probe |
| plugins/dsh-extra-plan/lib/model-routing.js | resolveOtherAgentEntryStrict | L441-485 | cross=true 时枚举全 provider，串行 probe otherAgentModel，候选全失败后验证主会话 fallback，失败固定阻断 | 复用 probePlannerRoute/withPlannerProbeDeadline |
| plugins/dsh-extra-plan/lib/model-routing.js | routeKey | L454 | 非 planner strict resolver 内以 provider/model 组成本次 Agent 的 probe outcome 复用键 | 仅 resolver 内部使用；与 planner routeKey 同名但 cache 隔离 |
| plugins/dsh-extra-plan/lib/model-routing.js | resolveOtherAgentEntry | L488-496 | 非 planner 单一入口，按 cross 开关选择 legacy/strict，并立即缓存单 Agent 的 in-flight/成功/rejection promise | 不读写 plannerModelCache |
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
| plugins/dsh-extra-plan/lib/preset-settings.js | captureSettings | L190-205 | 解析预设并逐项解析 → {document,values,states}；states 四态，仅 captured 进 values |  |
| plugins/dsh-extra-plan/lib/preset-settings.js | inlineCommentIndex | L208-226 | 找行内注释起始下标（跟踪单/双引号与 '' 转义，仅 # 前有空白或行首才算），无则 -1 |  |
| plugins/dsh-extra-plan/lib/preset-settings.js | lineIndent | L228-231 | 行首空格数（缩进量）；与 qqbot heal.js 同名函数无关 |  |
| plugins/dsh-extra-plan/lib/preset-settings.js | withoutCr | L233-235 | 去掉行尾 CR，兼容 CRLF 文本 |  |
| plugins/dsh-extra-plan/lib/preset-settings.js | parseRowId | L237-249 | 解析 '- id: xxx' 行的 id（先去行内注释、再解单/双引号写法），非 id 行返回 null |  |
| plugins/dsh-extra-plan/lib/preset-settings.js | parseMapKey | L251-255 | 映射行 → {key,indent}（'-' 开头的数组项返回 null） |  |
| plugins/dsh-extra-plan/lib/preset-settings.js | rowEnd | L257-265 | 求所在块结束行：跳过空行/注释，遇缩进 ≤ 本行缩进即返回其行号，否则返回总行数 |  |
| plugins/dsh-extra-plan/lib/preset-settings.js | findDirectKey | L267-285 | 在 [start,end) 内按首个子键缩进寻找父块直属子键 key 的行号；找不到返回 null |  |
| plugins/dsh-extra-plan/lib/preset-settings.js | textPathLine | L287-299 | 沿点分 path 逐层下钻定位，返回路径末段所在行号；任一段缺失返回 null |  |
| plugins/dsh-extra-plan/lib/preset-settings.js | findTextLocatorMatches | L301-312 | 在 YAML 原文中定位 pluginId 行并下钻路径 → [{rowStart,rowEnd,line}] |  |
| plugins/dsh-extra-plan/lib/preset-settings.js | yamlString | L314-318 | 字符串 → YAML 标量：含换行用 JSON 双引号形式，否则单引号包裹并把 ' 转成 '' |  |
| plugins/dsh-extra-plan/lib/preset-settings.js | serializeScalar | L320-324 | 按 scalarType 把值序列化成 YAML 标量文本（boolean/integer/其余走 yamlString） |  |
| plugins/dsh-extra-plan/lib/preset-settings.js | escapeRegex | L326-328 | 逐字符转义正则元字符，把键名安全拼进正则 |  |
| plugins/dsh-extra-plan/lib/preset-settings.js | replaceLineScalar | L330-342 | 保格式替换某键的标量值（保留缩进、值前后空白、行内注释与 CR）；键行不匹配返回 null |  |
| plugins/dsh-extra-plan/lib/preset-settings.js | isBlockScalarLine | L344-354 | 判断该键的值是否块标量（以竖线或 > 开头，忽略行内注释） |  |
| plugins/dsh-extra-plan/lib/preset-settings.js | locatorFor | L356-359 | 参数归一化：传 descriptor 取 .locator，传 locator 则原样返回 |  |
| plugins/dsh-extra-plan/lib/preset-settings.js | scalarTypeFor | L361-364 | 参数归一化：传 descriptor 取 .scalarType，否则缺省 'string' |  |
| plugins/dsh-extra-plan/lib/preset-settings.js | patchYamlScalar | L366-392 | 保格式定点改写 YAML 标量 → {ok,text,line}，或 {ok:false,reason:'missing'／'ambiguous'}；纯字符串处理不写文件 |  |
| plugins/dsh-extra-plan/lib/preset-settings.js | publicSettingMetadata | L395-430 | 生成设置页字段元数据 {fields,values,defaults}；默认/实际各解析一次且禁用别名，actual 无效时回退默认值 |  |
| plugins/dsh-extra-plan/lib/preset-sync.js | contentHash | L35-43 | 预设资产内容哈希 |  |
| plugins/dsh-extra-plan/lib/preset-sync.js | readManifestRecord | L45-56 | 读目标目录 dist-manifest.json：校验 format∈{1,2} 且 distHash 为字符串；文件缺失/JSON 损坏/结构不符一律返回 null |  |
| plugins/dsh-extra-plan/lib/preset-sync.js | readManifest | L59-62 | 读 dist-manifest.json |  |
| plugins/dsh-extra-plan/lib/preset-sync.js | emptyMigration | L64-74 | 构造「未捕获到旧设置」的空迁移审计：format=1 + sourceDistHash + source，并把各设置项状态填为 skipped-source-absent/unreadable |  |
| plugins/dsh-extra-plan/lib/preset-sync.js | capturePrevious | L76-102 | 捕获旧 agent.cordis.yml 设置 → {audit(captured),values,states}；失败给 absent/unreadable 空审计 |  |
| plugins/dsh-extra-plan/lib/preset-sync.js | reasonForOldState | L104-109 | 旧设置捕获状态 → 审计原因码：missing→skipped-old-missing、ambiguous→skipped-old-ambiguous、invalid→skipped-invalid |  |
| plugins/dsh-extra-plan/lib/preset-sync.js | reasonForNewState | L111-113 | 新预设取值/改写结果 → 审计原因码：ambiguous→skipped-new-ambiguous，其余（missing 等）→skipped-new-missing |  |
| plugins/dsh-extra-plan/lib/preset-sync.js | stagePreset | L115-168 | 建临时目录复制两个核心文件、逐项回填旧设置并校验 YAML，写出改后 agent.cordis.yml 与 format=2 manifest；失败删 tmp 并抛错 |  |
| plugins/dsh-extra-plan/lib/preset-sync.js | cleanupPath | L170-172 | 尽力删除路径（rmSync recursive+force）并吞掉所有异常；供回滚/失败清理使用，永不抛出 |  |
| plugins/dsh-extra-plan/lib/preset-sync.js | switchStage | L176-197 | rename 交换发布：旧目录改名备份 → tmp 就位 → 删备份；失败则删新目录+还原备份+清 tmp 后重抛（ops 可注入） |  |
| plugins/dsh-extra-plan/lib/preset-sync.js | publishStage | L199-201 | 导出薄封装：转调 switchStage 完成原子发布，保留 ops 注入点供测试替换文件操作 |  |
| plugins/dsh-extra-plan/lib/preset-sync.js | cleanupLegacyFlashGuidePatches | L207-233 | 清理旧 flash-guide 补丁条目 |  |
| plugins/dsh-extra-plan/lib/preset-sync.js | noSourcePrevious | L235-237 | 目标目录不存在时构造「无来源」previous：audit=emptyMigration('absent',null)，values/states 均为空对象 |  |
| plugins/dsh-extra-plan/lib/preset-sync.js | syncPreset | L243-264 | 预设同步判定（hash 比对→下发/跳过） |  |
| plugins/dsh-extra-plan/lib/preset-sync.js | apply | L269-278 | 插件入口（启动时 syncPreset） |  |
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
| plugins/dsh-extra-plan/lib/run-code-static.js | askUserQuestionReturnGateReason | L418-610 | 主会话 run_code 的 ask_user_question 返回值白名单：仅放行直接 return-await 或变量接收后 JSON.stringify 返回 |  |
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
| plugins/dsh-extra-plan/lib/save-contract.js | sanitizeTaskName | L4-12 | 任务名净化（截断/去非法字符） |  |
| plugins/dsh-extra-plan/lib/save-contract.js | timestamp | L15-19 | 本地时间戳 yyyyMMddHHmmss（文件名可读且具唯一性） |  |
| plugins/dsh-extra-plan/lib/save-contract.js | pad | L17 | timestamp 内部数字补零 |  |
| plugins/dsh-extra-plan/lib/save-contract.js | sessionTagOf | L23-25 | 会话标识段（去分隔符后取前 8 位字母数字） |  |
| plugins/dsh-extra-plan/lib/save-contract.js | savePlanBase | L31-34 | save_plan 文件名 base（任务短名 + 会话标识段 + 时间戳） |  |
| plugins/dsh-extra-plan/lib/save-contract.js | renderSavePlan | L41-43 | save_plan 结果渲染为单元素 ContentBlock[] |  |
| plugins/dsh-extra-plan/lib/save-contract.js | renderProbeMarkdown | L78-119 | save_probe 线索/证据报告 Markdown 渲染（固定标题与五节模板） |  |
| plugins/dsh-extra-plan/lib/save-contract.js | extractProbeEvidenceRefs | L124-132 | 提取方案中【探查者已核实】标注的证据文件路径并去重 |  |
| plugins/dsh-extra-plan/lib/save-contract.js | renderSaveProbe | L136-138 | save_probe 结果渲染为单元素 ContentBlock[] |  |
| plugins/dsh-extra-plan/lib/save-persistence.js | atomicCommit | L9-24 | 原子提交：mkdir→写 tmp→写 journal→rename→清 journal，失败尽力清理后抛错 |  |
| plugins/dsh-extra-plan/lib/save-persistence.js | recoverJournals | L31-58 | journal 崩溃自愈：兼容新旧形状并按 sessionTag 过滤，失败告警后继续 |  |
| plugins/dsh-extra-plan/lib/save-probe-validation.js | validateProbe | L10-109 | save_probe 参数校验：上限、路径存在性、range/evidence 规则与聚合拒绝 |  |
| plugins/dsh-extra-plan/lib/save-probe-validation.js | probePathOf | L112-115 | 相对路径按 cwd 解析、绝对路径原样返回 |  |
| plugins/dsh-extra-plan/lib/save-tool-factories.js | createSaveToolFactories | L7-192 | 创建只捕获目录与原子持久化依赖的 save 工具定义工厂；注入依赖：savePlanDir、atomicCommit、recoverJournals |  |
| plugins/dsh-extra-plan/lib/save-tool-factories.js | defineSavePlan | L8-74 | save_plan schema/output/render/execute（双写与证据引用校验） |  |
| plugins/dsh-extra-plan/lib/save-tool-factories.js | defineSaveProbe | L76-189 | save_probe schema/output/render/execute（限制校验与线索/证据落盘） |  |
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
| plugins/dsh-extra-plan/scripts/distribute-preset.mjs | messageFor | L9-13 | 把 syncPreset 的三态结果（idle/upgraded/其他）翻译成带目标目录的中文控制台提示行，纯字符串拼接无副作用 |  |
| plugins/dsh-extra-plan/scripts/distribute-preset.mjs | distribute | L16-21 | 预设分发（hash 比对→写 DSH_HOME/.agent-presets/extra-plan） |  |
| plugins/dsh-extra-plan/scripts/distribute-preset.mjs | invokedAsMain | L23-28 | 主脚本判定（node 直跑时执行 distribute） |  |
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
