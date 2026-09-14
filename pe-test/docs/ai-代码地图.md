# 代码地图（dsh-extra-plan）

> **维护分工**：行号区间/增删行由脚本 node pe-test/tools/代码地图生成.mjs 增量同步；**功能描述、备注、以及「意图速查」整节由 AI/人维护**（脚本刷新不会覆盖）。
> **用法**：先看「意图速查」按意图词找函数名 → 再到「函数索引」按函数名取行号区间 → read 该区间。
> 上次同步：2026-09-14 16:36:41（脚本自动更新时间戳行）

## 意图速查（人工维护：意图词 → 函数名；行号请到下方「函数索引」按函数名取）

> 用法：拿用户/AI 口里的词在「想找什么」列 grep → 得函数名 → 到「函数索引」grep 该函数名 → 取行号区间 → read 该区间。
> 本节引用的函数名若不存在于索引，生成脚本会报 `[导航失效]`（防止入口过期）。

| 想找什么（含同义词/英文标识） | 文件 | 函数名 |
|:--|:--|:--|
| 四级闸门／路由确认／目的确认／批准／流程状态（route/purpose/clarified/approved） | index.js | deriveFlowState、mainGateReason、routeDenyReason、gateAskDenyReason、validateGateAskStructure、matchPurposeLabel |
| 探查预算／额度／剩余次数／耗尽（exploreBudget/budget） | index.js | toolCallsSinceUser、budgetNoticeText、budgetReminderText、budgetExhaustedReason |
| run_code 组判定／绕道拆解／调用点扫描（decompose） | index.js | decomposeRunCode、collectRunCodeSites、runCodeGroupDenyReason |
| run_code 多调用容错／教学文案（容错检查开关） | index.js | runCodeCatchGateReason |
| ask 必须 return／返回值白名单 | index.js | askUserQuestionReturnGateReason |
| 单实例调用点上限／循环放大 | index.js | runCodeSiteCount、runCodeDispatchGateReason |
| job_output 禁 wait:true／同 job 查重 | index.js | jobOutputGateReason |
| 命令文本提取／写操作判定／runner 写暗示（write/拦截） | index.js | commandTextOf、pwshCommandOf、bashCommandOf、mutationTextMatches、pwshMutationMatches、bashMutationMatches、runCodeTextOf、codeMutationHints |
| 锚定引导／首轮极简／bootstrap | index.js | isBootstrapPhase |
| 方案/询问工具在未确认路由下的拒绝文案（plan route） | index.js | planDenyReason |
| 批准前禁委派（approval deny） | index.js | approvalDenyReason |
| 规划子代理分支闸门（planner 写禁+预算） | index.js | plannerGateReason |
| 方案与验收落盘／save_plan 双写（plan/checklist） | index.js | defineSavePlan、registerSavePlan、savePlanBase |
| 落盘原子提交／journal 崩溃自愈（atomic/commit） | index.js | atomicCommit、recoverJournals |
| 线索落盘／save_probe／证据报告（probe/evidence） | index.js | validateProbe、renderProbeMarkdown、extractProbeEvidenceRefs |
| 探查者委派／禁止 planner 派探查（subagent_probe） | index.js | subagentProbeGateReason、resolveProbeRequestInjection |
| 只读子代理／验收者只读（reviewer/readonly） | index.js | childReadonlyGateReason、isReadOnlyChildByCatalog |
| 子代理沙箱下限／权限抬升（floor/sandbox） | index.js | childPolicyNeedsFloor、floorChildPolicy |
| 工具目录折叠／PTC 单入口（catalog/ptc） | index.js | catalogIsCollapsed |
| 规划模型与跨 Provider 真实探针／plannerModel（T2/T4） | index.js | resolvePlannerEntry、resolvePlannerEntryLegacy、resolvePlannerEntryStrict、probePlannerRoute、withPlannerProbeDeadline、sortPlannerCandidates、decidePlannerModelUse |
| 设置页读写／配置项真源（settings/descriptor） | lib/settings.js、lib/preset-settings.js | createApiHandler、publicSettingMetadata、patchYamlScalar |
| 预设下发／自愈／hash 比对（preset-sync） | lib/preset-sync.js | syncPreset、stagePreset、switchStage |
| 预设分发脚本（distribute） | scripts/distribute-preset.mjs | distribute |
| 设置页前端 UI／卡片（React） | lib/client.js | ProConfigTab、ExtraPlanCard |
| 执行者工具裁剪／deny（executor-spawn） | lib/executor-spawn.js | apply |
| qqbot 兼容自愈／建链 | ../dsh-qqbot-user-questions/lib/heal.js | healQqbotCompatibility、ensureDshExtraPlanLink |
| 代码地图自身维护／口径／严格模式 | pe-test/tools/代码地图生成.mjs（不在索引范围，读文件头注释） |  |

## 文件总览

| 文件 | 行数 | 说明 |
|:--|--:|:--|
| plugins/dsh-extra-plan/index.js | 3673 | 模式核心：四级闸门（路由/目的/澄清/批准）+ 探查预算 + save_plan/save_probe 工具 + planner 跨 Provider 真实 probe/严格 fallback + 锚点钩子（修改最频繁） |
| plugins/dsh-extra-plan/lib/client-bridge.js | 19 | 客户端桥接壳：仅承载 dsh.client 加载路径指向 lib/client.js（apply 空实现） |
| plugins/dsh-extra-plan/lib/client.js | 329 | dsh web 设置界面 UI（__ModuleLoader__ 打包格式，React；中/英文案） |
| plugins/dsh-extra-plan/lib/executor-spawn.js | 89 | 执行者子代理 provider：委托宿主 spawn，注入工具 deny（防委派递归/追问） |
| plugins/dsh-extra-plan/lib/preset-settings.js | 445 | 设置描述表（唯一真源）+ 预设 YAML 解析 + 保格式定点标量改写；plannerModel validator T4 放开空串（isString） |
| plugins/dsh-extra-plan/lib/preset-sync.js | 289 | 预设资产自动下发同步（distHash 比对，幂等） |
| plugins/dsh-extra-plan/lib/settings.js | 165 | 设置页后端 HTTP API（pro-config；qqbot 相关已随精简版插件移除） |
| plugins/dsh-extra-plan/scripts/distribute-preset.mjs | 40 | 预设分发脚本（安装/更新时写 DSH_HOME/.agent-presets/extra-plan） |
| plugins/dsh-qqbot-user-questions/index.js | 24 | qqbot 精简版自愈插件：apply 启动时调 healQqbotCompatibility（迁移旧错误块+建链），不阻断启动 |
| plugins/dsh-qqbot-user-questions/lib/heal.js | 369 | 自愈纯函数模块（定位 profile/旧块迁移/建链；供 index.js/CLI/测试复用） |
| plugins/dsh-qqbot-user-questions/scripts/heal.mjs | 26 | CLI 兜底入口（postinstall/手动触发；invokedAsMain 判定） |

## 函数索引

| 文件 | 函数 | 行号 | 功能描述 | 备注 |
|:--|:--|:--|:--|:--|
| plugins/dsh-extra-plan/index.js | purposeRouteDenyReason | L104-106 | 精确目的 ask 在非 plan 路由下的固定路由确认拒绝文案（引用 ROUTE_CONFIRM_TEXT） |  |
| plugins/dsh-extra-plan/index.js | routeDenyReason | L109-114 | 路由未确认时 write/edit/写shell 的拒绝文案（提示先做路由确认） |  |
| plugins/dsh-extra-plan/index.js | planDenyReason | L115-126 | plan 路由下 save_probe/subagent_plan 前置条件未满足的拒绝文案 |  |
| plugins/dsh-extra-plan/index.js | approvalDenyReason | L127-129 | 批准前禁止执行委派类工具（subagent/workflow/ralph）拒绝文案 |  |
| plugins/dsh-extra-plan/index.js | isDispatchStart | L143 | 双兼容事件名判定：命中 DISPATCH_START 集合（新名 tool/ptc-dispatch-start = 0.1.5-rc.2 / 旧名 tool/code-dispatch-start = 0.1.2-rc.1） |  |
| plugins/dsh-extra-plan/index.js | isDispatch | L144-147 | 双兼容事件名判定：命中 DISPATCH 集合（新名 tool/ptc-dispatch = 0.1.5-rc.2 / 旧名 tool/code-dispatch = 0.1.2-rc.1） |  |
| plugins/dsh-extra-plan/index.js | sessionEvents | L197-201 | 取 agent.session 事件快照（缺失兜底空数组） |  |
| plugins/dsh-extra-plan/index.js | isExplicitRoute | L205-211 | 设置页显式指定规划模型（与主会话不同）判断 |  |
| plugins/dsh-extra-plan/index.js | isExplicitEffort | L215-217 | 显式指定 reasoningEffort 判断 |  |
| plugins/dsh-extra-plan/index.js | isSubagentChild | L220-235 | 判定会话属于子代理（header.origin/delegationDepth/descriptor 三路探测） |  |
| plugins/dsh-extra-plan/index.js | isLiveDelegation | L239-250 | 子代理是否仍有存活父会话（live delegation）判定 |  |
| plugins/dsh-extra-plan/index.js | childPolicyNeedsFloor | L253-258 | 子代理沙箱策略需抬升为 workspace-write 的判定 |  |
| plugins/dsh-extra-plan/index.js | isBootstrapPhase | L261-268 | anchored 引导阶段判定（首个工具调用前） |  |
| plugins/dsh-extra-plan/index.js | commandTextOf | L273-285 | 从 exec.arguments 提取 shell 命令原文（字符串/parsed 兼容） |  |
| plugins/dsh-extra-plan/index.js | pwshCommandOf | L286 | 提取 pwsh 命令文本 |  |
| plugins/dsh-extra-plan/index.js | bashCommandOf | L287 | 提取 bash 命令文本 |  |
| plugins/dsh-extra-plan/index.js | mutationTextMatches | L290-316 | 写操作文本判定主体：先整套正则直命中，再把文本按 `;`/换行/`&&`/`\ | \ |
| plugins/dsh-extra-plan/index.js | mutationMatches | L317-320 | 命令命中写操作拒绝正则判定 |  |
| plugins/dsh-extra-plan/index.js | pwshMutationMatches | L321 | pwsh 写操作判定（调 mutationMatches） |  |
| plugins/dsh-extra-plan/index.js | bashMutationMatches | L322 | bash 写操作判定（调 mutationMatches） |  |
| plugins/dsh-extra-plan/index.js | runCodeTextOf | L325-329 | 提取 run_code 的 code 参数文本 |  |
| plugins/dsh-extra-plan/index.js | codeMutationHints | L332-340 | 对文本扫描 RUNCODE_MUTATION_HINTS 返回命中写暗示 id 列表 |  |
| plugins/dsh-extra-plan/index.js | labelsOfCallData | L344-360 | 从 ask 调用数据提取选项 label 集合 |  |
| plugins/dsh-extra-plan/index.js | normalizeLabel | L373-375 | label 规范化（空白清理） |  |
| plugins/dsh-extra-plan/index.js | isExactGateSet | L378-385 | label 集合与闸门常量集完全一致判定 |  |
| plugins/dsh-extra-plan/index.js | isPartialGateSet | L388-396 | label 与闸门词部分包含判定 |  |
| plugins/dsh-extra-plan/index.js | categorizeGateAsk | L399-403 | ask 分类（standard/malformed/ordinary）；standard/malformed 判定并入路由/批准/目的三套词集 |  |
| plugins/dsh-extra-plan/index.js | gateAskDenyReason | L406-442 | 生成标准闸门 ask 选项/结构错误的拒绝理由 |  |
| plugins/dsh-extra-plan/index.js | validateGateAskStructure | L448-469 | 校验路由/目的/批准 ask 结构（问题数、固定选项、修改意见） |  |
| plugins/dsh-extra-plan/index.js | askKindOf | L476-493 | 从 label 判定 ask 类型（route/approve/purpose） |  |
| plugins/dsh-extra-plan/index.js | askKindOfRelaxed | L499-515 | 宽松判定 ask 类型（特异性词优先：路由→批准→仅不同意→目的→澄清） |  |
| plugins/dsh-extra-plan/index.js | matchRouteLabel | L517-526 | 用户选择标签→direct/plan/disagree |  |
| plugins/dsh-extra-plan/index.js | matchApprovalLabel | L528-537 | 用户选择标签→approve/replan/disagree |  |
| plugins/dsh-extra-plan/index.js | matchPurposeLabel | L539-545 | 用户选择标签→refine/redo（第四锚点目的二选一：「完善方案」/「重新规划」） |  |
| plugins/dsh-extra-plan/index.js | parseAskResultData | L551-586 | tool/result 解析用户选择（answers.selected） |  |
| plugins/dsh-extra-plan/index.js | parseDispatchAskResult | L594-620 | ptc/code-dispatch 的 ask 结果解析（双兼容，含 error 分支） |  |
| plugins/dsh-extra-plan/index.js | deriveFlowState | L628-735 | 事件流推导 flow state（route/clarified/approved/purpose/channelBroken） |  |
| plugins/dsh-extra-plan/index.js | resetStageState | L630-634 | 回放正常路由/有效目的前重置 purpose、clarified、approved | deriveFlowState 内部辅助 |
| plugins/dsh-extra-plan/index.js | resetRouteState | L635-638 | 回放非通道 ask 错误时设置 route=none 并清理阶段状态 | deriveFlowState 内部辅助 |
| plugins/dsh-extra-plan/index.js | plannerChildIdsOf | L740-790 | 事件流收集规划子代理会话 id |  |
| plugins/dsh-extra-plan/index.js | toolCallCount | L798-825 | 统计成功工具调用次数（可跳过指定工具） |  |
| plugins/dsh-extra-plan/index.js | toolCallsSinceUser | L832-847 | 最近一次用户/agent-message 锚点之后的工具调用数 |  |
| plugins/dsh-extra-plan/index.js | jobOutputCallsForJob | L852-879 | 锚点后对指定 job 的 job_output 调用计数 |  |
| plugins/dsh-extra-plan/index.js | appendSuffixBlock | L886-903 | 给 user 消息追加文本块（拼入第一个 text 块尾部） |  |
| plugins/dsh-extra-plan/index.js | withPlannerPromptSuffix | L904-913 | 拼接规划子代理附加引导 |  |
| plugins/dsh-extra-plan/index.js | budgetNoticeText | L920-922 | 开局预算提示文案（本轮探查预算上限 N 次） |  |
| plugins/dsh-extra-plan/index.js | withBudgetNotice | L926 | 预算提示拼接进消息 |  |
| plugins/dsh-extra-plan/index.js | budgetReminderText | L929-933 | 剩余≤3次提醒文案 |  |
| plugins/dsh-extra-plan/index.js | budgetReminderMessage | L937-939 | 剩余提醒消息构造 |  |
| plugins/dsh-extra-plan/index.js | budgetReminderSent | L943-966 | 本锚点是否已注入剩余提醒（防重复注入） |  |
| plugins/dsh-extra-plan/index.js | budgetExhaustedReason | L970-972 | 预算耗尽文案（已用 x/y） |  |
| plugins/dsh-extra-plan/index.js | budgetExceeded | L975-977 | used+1 超预算判定 |  |
| plugins/dsh-extra-plan/index.js | sanitizeTaskName | L982-990 | 任务名净化（截断/去非法字符） |  |
| plugins/dsh-extra-plan/index.js | timestamp | L993-997 | 时间戳 yyyyMMddHHmmss |  |
| plugins/dsh-extra-plan/index.js | pad | L995 | 数字补零（timestamp 内部闭包） |  |
| plugins/dsh-extra-plan/index.js | sessionTagOf | L1001-1003 | 会话标识段（T3）：session header id 去分隔符后前 8 位字母数字；取不到 id → 空串 |  |
| plugins/dsh-extra-plan/index.js | savePlanBase | L1009-1012 | save_plan 文件名 base（T3）：任务短名 + 会话标识段 + 本地时间戳（主会话/规划子代理同秒落盘不再撞名） |  |
| plugins/dsh-extra-plan/index.js | renderSavePlan | L1019-1021 | save_plan 结果渲染（路径数组→文本） |  |
| plugins/dsh-extra-plan/index.js | validateProbe | L1054-1153 | save_probe 参数校验（四字段上限/path 存在/evidence 规则） |  |
| plugins/dsh-extra-plan/index.js | probePathOf | L1156-1159 | 相对路径按 cwd 解析绝对路径 |  |
| plugins/dsh-extra-plan/index.js | renderProbeMarkdown | L1163-1204 | save_probe Markdown 渲染（线索/证据报告） |  |
| plugins/dsh-extra-plan/index.js | extractProbeEvidenceRefs | L1209-1217 | 方案文本提取【探查者已核实】证据引用路径 |  |
| plugins/dsh-extra-plan/index.js | renderSaveProbe | L1221-1223 | save_probe 输出渲染 |  |
| plugins/dsh-extra-plan/index.js | catalogHasWriteTools | L1227-1232 | 工具目录是否含写工具判定 |  |
| plugins/dsh-extra-plan/index.js | isReadOnlyChildByCatalog | L1235-1237 | 按工具目录判定只读子代理 |  |
| plugins/dsh-extra-plan/index.js | schemasHasWriteTools | L1242-1247 | schemas 数组是否含写工具 |  |
| plugins/dsh-extra-plan/index.js | schemasHasTool | L1251-1256 | schemas 是否含指定工具 |  |
| plugins/dsh-extra-plan/index.js | catalogIsCollapsed | L1263-1268 | 工具目录折叠为单工具判定（run_code/仅shell） |  |
| plugins/dsh-extra-plan/index.js | resolveProbeRequestInjection | L1278-1362 | 探查者请求注入解析（上溯父会话配置） |  |
| plugins/dsh-extra-plan/index.js | maskCodeLiteralsAndComments | L1373-1411 | 遮蔽字符串/注释为空格（括号配平用） |  |
| plugins/dsh-extra-plan/index.js | sliceBalancedArgs | L1416-1432 | 从括号起配平切片参数原文 |  |
| plugins/dsh-extra-plan/index.js | decomposeRunCode | L1443-1572 | 静态拆解 run_code 的 code 为工具成员组（含裸写伪工具） |  |
| plugins/dsh-extra-plan/index.js | addMember | L1452-1466 | 成员去重添加（decomposeRunCode 内部闭包） |  |
| plugins/dsh-extra-plan/index.js | markRange | L1467-1469 | 标记已占用区间（decomposeRunCode 内部闭包） |  |
| plugins/dsh-extra-plan/index.js | isIdChar | L1470 | 标识符字符判定（decomposeRunCode 内部闭包） |  |
| plugins/dsh-extra-plan/index.js | runCodeCatchGateReason | L1579-1652 | run_code 多调用容错闸门：tools.* 调用点≥2 时要求每点独立容错，不足即教学式拒绝（单调用豁免；嵌套展平） |  |
| plugins/dsh-extra-plan/index.js | within | L1608 | 调用点区间包含判定（site.start 是否落在 a、b 之间）：把调用点归入 try 块或数组实参区间 | runCodeCatchGateReason 内部闭包 |
| plugins/dsh-extra-plan/index.js | collectRunCodeSites | L1657-1740 | run_code 调用点收集：跳过字符串/注释，认 tools.x、tools['lit']、tools[var]，返回 {start,end,innerText,name} |  |
| plugins/dsh-extra-plan/index.js | askUserQuestionReturnGateReason | L1744-1937 | 主会话 run_code 的 ask_user_question 返回值白名单：仅放行直接 return-await 或单变量后顶层 return 的标识符引用；嵌套重入兜底，未知形态默认拒绝 |  |
| plugins/dsh-extra-plan/index.js | isIdChar | L1749 | 标识符字符判定（本处属 askUserQuestionReturnGateReason；同名闭包另见 decomposeRunCode 的 L1356 那处） | askUserQuestionReturnGateReason 内部闭包 |
| plugins/dsh-extra-plan/index.js | skipWs | L1750-1754 | 自 start 起跳过空白字符，返回首个非空白字符下标（词法扫描的跳白工具） | askUserQuestionReturnGateReason 内部闭包 |
| plugins/dsh-extra-plan/index.js | isTopLevel | L1837 | 位置是否处于花括号/圆括号/方括号深度全为 0 的顶层语句中——只有顶层出现的 ask 调用才可被白名单静态证明 | askUserQuestionReturnGateReason 内部闭包（同名闭包另见 decomposeRunCode L1356） |
| plugins/dsh-extra-plan/index.js | candidateStarts | L1838-1845 | 收集 pos 之前的顶层语句起点（0 及顶层 ';' / '}' 之后的位置），用于把调用归入所属顶层语句 | askUserQuestionReturnGateReason 内部闭包 |
| plugins/dsh-extra-plan/index.js | tokenAt | L1846-1847 | pos 处是否恰为指定关键字且两侧均为标识符边界（return/await 词法判定） | 内部闭包；区间为脚本所给，实际函数体仅 L1872-1873 |
| plugins/dsh-extra-plan/index.js | expressionEnd | L1848-1857 | 求顶层语句的结束下标：顶层 ';'，或换行后紧跟 const/let/var/return/console/await/if/for/while/try/throw 关键字处；未命中则返回遮蔽文本末尾 | askUserQuestionReturnGateReason 内部闭包 |
| plugins/dsh-extra-plan/index.js | references | L1858-1873 | 按标识符边界在表达式内查找变量的真实引用，排除成员访问（前有 '.'）与对象键（后有 ':'） | askUserQuestionReturnGateReason 内部闭包 |
| plugins/dsh-extra-plan/index.js | hasReassignment | L1874-1891 | 判定变量在表达式内是否被重新赋值（=、+=/-=、++/--），用于否掉「单变量接收后被改写」的伪白名单形态 | askUserQuestionReturnGateReason 内部闭包 |
| plugins/dsh-extra-plan/index.js | afterCall | L1892-1902 | 取调用点之后的首个有效 token 位置（顺带跳过可选分号），并回传原始 gap 文本，用于校验「调用后紧接顶层 return」 | askUserQuestionReturnGateReason 内部闭包 |
| plugins/dsh-extra-plan/index.js | runCodeSiteCount | L1941-1959 | run_code 静态调用点计数（planner 单实例上限快路径；run_code 调用点自身不计） |  |
| plugins/dsh-extra-plan/index.js | isRunCodeSubCall | L1963-1968 | 子调用判定：exec.sub 或 exec.parent!==undefined（与官方 dsh-tools nested 同口径） |  |
| plugins/dsh-extra-plan/index.js | runCodeDispatchCapText | L1971-1973 | 单实例子调用超限文案（T3 逐字）：rootCallId 实例子调用数超过 exploreBudget 上限的拒绝文案，listener 运行时检查与纯函数共用 |  |
| plugins/dsh-extra-plan/index.js | runCodeDispatchGateReason | L1978-1992 | 运行时单实例上限（planner）：按 rootCallId 计数，超 cap 返回 T3 文案 |  |
| plugins/dsh-extra-plan/index.js | subagentProbeGateReason | L2002-2011 | 探查者分支闸门（T5 唯一功能点）：planner 禁止委派（文案指向「申请继续探查」）+ 主会话 run_in_background 必 true；两调用点（组判定/直呼）共用 |  |
| plugins/dsh-extra-plan/index.js | plannerGateReason | L2014-2032 | 规划子代理分支闸门（write/edit/pwsh/bash 写禁 + 预算） |  |
| plugins/dsh-extra-plan/index.js | childReadonlyGateReason | L2035-2047 | 子代理只读分支闸门（探查者/验收者差异化文案；不含 run_code） |  |
| plugins/dsh-extra-plan/index.js | jobOutputGateReason | L2052-2074 | job_output 闸门：禁 wait:true + 同 job 重复调用查重（内存计数器） |  |
| plugins/dsh-extra-plan/index.js | probeDisposalWarning | L2082-2085 | 探查者级联中止告警纯函数：剩余未认领探查者委派数为正整数时返回告警文案（T5 文案中性化「委派方会话销毁时」+ owner disposed + 引擎限制指向官方包）；非正整数返回 null |  |
| plugins/dsh-extra-plan/index.js | mainGateReason | L2093-2218 | 主会话闸门主分支（ask/write/edit/plan/save_plan/subagent/run_code/job_output…）；save_plan 仅 direct 放行（T3）；save_probe/subagent_plan 还需目的已定（purpose∈refine/redo，第四锚点） |  |
| plugins/dsh-extra-plan/index.js | runCodeGroupDenyReason | L2228-2311 | run_code 组判定：拆解→成员逐判定→聚合拒绝；预算耗尽白名单把关 |  |
| plugins/dsh-extra-plan/index.js | visit | L2245-2288 | 递归展平嵌套 run_code（runCodeGroupDenyReason 内闭包） |  |
| plugins/dsh-extra-plan/index.js | aggregateRunCodeDenyReason | L2317-2329 | 聚合多成员拒绝消息 |  |
| plugins/dsh-extra-plan/index.js | decidePlannerModelUse | L2351-2364 | T2 静默降级判定：目录命中→用 plannerModel；清单非空未命中→不覆盖（inherit-parent）；空/异常→沿用 |  |
| plugins/dsh-extra-plan/index.js | comparePlannerText | L2370-2374 | 规划 provider name/id 的确定性字典序比较 |  |
| plugins/dsh-extra-plan/index.js | plannerProviderRank | L2376-2380 | 候选排序层级：普通 provider、父会话 provider、deepseek-official |  |
| plugins/dsh-extra-plan/index.js | sortPlannerCandidates | L2382-2393 | 真实探针成功候选排序：普通 name/id 正序，父 provider 倒数第二，官方最后 |  |
| plugins/dsh-extra-plan/index.js | apply | L2503-3673 | 插件主入口：配置解析/服务注册/工具注册/锚点钩子 |  |
| plugins/dsh-extra-plan/index.js | foldUsage | L2533-2607 | usage 账本折叠写入（cursor 去重，按 sessionId+seq） |  |
| plugins/dsh-extra-plan/index.js | isChild | L2612-2620 | 子代理判定（live 校验+误分类警示） |  |
| plugins/dsh-extra-plan/index.js | isPlannerChild | L2624-2638 | 规划子代理判定（descriptor.mode=continuable） |  |
| plugins/dsh-extra-plan/index.js | toolSchemasOf | L2643-2661 | 防御式获取 agent 工具 schemas |  |
| plugins/dsh-extra-plan/index.js | plannerAbortError | L2668-2671 | 保留外部 turn abort 原因，避免改写为严格路由阻断 |  |
| plugins/dsh-extra-plan/index.js | withPlannerProbeDeadline | L2675-2708 | 以本地 30000ms AbortController/race 覆盖目录、准备与流消费并清理计时器 | 不遵守 signal 的第三方 adapter 可能遗留 I/O |
| plugins/dsh-extra-plan/index.js | probePlannerRoute | L2712-2753 | 对候选或父 fallback 执行 prepareCall + 完整 prepared stream 的 OK probe，隔离失败终止块/无终止块/超时 | 仅 True 路径调用，不把目录或 resolveCallConfig 当成功 |
| plugins/dsh-extra-plan/index.js | resolvePlannerEntryLegacy | L2757-2815 | False/缺失/非法开关的旧单 provider listModels advisory 解析与原降级诊断 | 不枚举 provider、不做真实 probe |
| plugins/dsh-extra-plan/index.js | resolvePlannerEntryStrict | L2818-2887 | True 路径枚举全 provider、等待全部匹配候选排序，并验证父 provider/model fallback；无验证路由固定 reject | plannerModel 为空仅验证父 fallback |
| plugins/dsh-extra-plan/index.js | routeKey | L2853 | 以 provider 与 model 组成 probe outcome 复用键，避免 fallback 同路由二次请求 | 仅 resolver 内部使用 |
| plugins/dsh-extra-plan/index.js | resolvePlannerEntry | L2891-2899 | 单点分流并立即缓存 in-flight promise：False 走旧 advisory，True 走全 provider 真实 probe 与严格 fallback | 成功 entry 与 rejection 均固定到 Agent |
| plugins/dsh-extra-plan/index.js | parseSkillFrontmatter | L2943-2952 | SKILL.md frontmatter 的 name/description 解析 |  |
| plugins/dsh-extra-plan/index.js | floorChildPolicy | L2954-2958 | 子代理沙箱策略抬升（workspace-write） |  |
| plugins/dsh-extra-plan/index.js | childBaseline | L2960-2966 | 子代理基线（判定/usage/floor 汇总） |  |
| plugins/dsh-extra-plan/index.js | atomicCommit | L2978-2993 | 原子落盘（tmp→journal→rename→清 journal；save_plan 双写/save_probe 单写共用）；可选 sessionTag 写入 journal 供按会话恢复（T3） |  |
| plugins/dsh-extra-plan/index.js | recoverJournals | L3000-3027 | journal 崩溃自愈（新旧形状兼容）；可选 sessionTag 过滤：跳过内嵌其它会话标识的残留（T3 跨角色互恢复防护） |  |
| plugins/dsh-extra-plan/index.js | defineSavePlan | L3029-3095 | save_plan 工具定义（双写必填/证据引用校验） |  |
| plugins/dsh-extra-plan/index.js | registerTool | L3099-3112 | 工具注册分发 |  |
| plugins/dsh-extra-plan/index.js | registerSavePlan | L3115 | save_plan 注册（规划子代理层 + 主会话层；主会话侧放行由 mainGateReason 限 direct，T3） |  |
| plugins/dsh-extra-plan/index.js | defineSaveProbe | L3120-3233 | save_probe 工具定义 |  |
| plugins/dsh-extra-plan/index.js | registerSaveProbe | L3236 | save_probe 注册（主会话层 + 已认领的探查子代理层；规划子代理/执行者/reviewer 不是持有者） |  |
| plugins/dsh-extra-plan/index.js | probeClaimFor | L3246-3262 | 放行-认领关联查核（pendingProbeClaims）：非子代理/含写子代理/规划子代理（T5 守卫）不认领，命中则消费计数并登记 save_probe |  |
| plugins/dsh-extra-plan/index.js | causeChainOf | L3313-3325 | 拒绝原因链解析（子代理继承根因） |  |
| plugins/dsh-extra-plan/index.js | recordRequestError | L3326-3348 | 记录请求错误诊断到临时目录 |  |
| plugins/dsh-extra-plan/lib/client-bridge.js | apply | L17-19 | 空实现（仅承载 dsh.client 加载路径指向 lib/client.js） |  |
| plugins/dsh-extra-plan/lib/client.js | apply | L85-323 | 客户端插件入口：注入样式表与中英词条，定义设置页组件并注册到 settings.plugin.item 插槽（用 inject 等待插槽就绪，register 会被丢弃） |  |
| plugins/dsh-extra-plan/lib/client.js | ProConfigTab | L96-267 | 设置页「通用设置+pro规划模块」双区块组件：GET /pro-config 载入 fields/values → 本地草稿 → save() PUT 回写；按 field.section 分组渲染两块 esp-section；含 loading/error/ready 三态渲染 |  |
| plugins/dsh-extra-plan/lib/client.js | setField | L135-138 | 更新草稿中某字段并清空提示信息 | ProConfigTab 内部闭包 |
| plugins/dsh-extra-plan/lib/client.js | save | L140-164 | 把草稿按字段类型（integer 转 Number）PUT 到 /pro-config，按结果给出「已保存/保存失败」提示 | ProConfigTab 内部闭包 |
| plugins/dsh-extra-plan/lib/client.js | optionLabel | L185-190 | 选项显示名：优先 optionLocale 词条，其次布尔 trueValue/falseValue，最后原值字符串 | ProConfigTab 内部闭包 |
| plugins/dsh-extra-plan/lib/client.js | optionValue | L192-198 | 把后端返回的字符串值映射回 field.options 里的原始类型（不在选项中则原样返回） | ProConfigTab 内部闭包 |
| plugins/dsh-extra-plan/lib/client.js | renderField | L200-244 | 按 field.control（textarea/number/select 等）渲染单个设置项控件并绑定 setField | ProConfigTab 内部闭包 |
| plugins/dsh-extra-plan/lib/client.js | ExtraPlanCard | L269-298 | 设置→插件页的可折叠卡片：标题/描述 + 展开后渲染 ExtraPlanSettingsTab（本地 open 状态） |  |
| plugins/dsh-extra-plan/lib/client.js | ExtraPlanSettingsTab | L300-304 | 卡片内容容器：包一层 esp-wrap 后渲染 ProConfigTab |  |
| plugins/dsh-extra-plan/lib/executor-spawn.js | apply | L49-89 | 插件入口：注册执行者 provider（委托宿主 spawn，注入 deny 工具裁剪） |  |
| plugins/dsh-extra-plan/lib/executor-spawn.js | defaultedAgentOptions | L69-73 | 执行者 agentOptions 透传（请求自带优先，否则空对象继承父会话） |  |
| plugins/dsh-extra-plan/lib/preset-settings.js | loadYaml | L9-22 | 模块加载期解析 js-yaml：本模块 require 失败则回退全局 dsh 的 node_modules，仍失败抛首个错误 |  |
| plugins/dsh-extra-plan/lib/preset-settings.js | isString | L34 | 字符串判定（T4 起为 plannerModel 的 validator：空串合法=继承主会话模型） | 区间已由生成器修正为实际定义行（原 L34-55 为掩码失效导致的开区间） |
| plugins/dsh-extra-plan/lib/preset-settings.js | isPositiveInteger | L35 | 正整数校验器（exploreBudget 的 validator）：仅接受 >0 整数，拒绝小数/0/负数/非 number |  |
| plugins/dsh-extra-plan/lib/preset-settings.js | isBoolean | L36 | 布尔校验器（anchoredBootstrap／runcodeCatchGate／webFetch 三个 descriptor 的 validator） |  |
| plugins/dsh-extra-plan/lib/preset-settings.js | isMode | L38 | 工具展示模式校验器：仅接受 modeOptions（native/ptc/both）三值之一 |  |
| plugins/dsh-extra-plan/lib/preset-settings.js | setting | L40-55 | descriptor 工厂：冻结定义并补齐 type/locator/aliases/ui（SETTING_DEFINITIONS 内 7 处调用） |  |
| plugins/dsh-extra-plan/lib/preset-settings.js | getSettingDefinition | L109-111 | 按 key 取设置描述符（descriptorByKey），未命中返回 undefined |  |
| plugins/dsh-extra-plan/lib/preset-settings.js | parsePresetYaml | L113-115 | 预设 YAML 文本 → JS 对象（含自定义 js 标签的 YAML_SCHEMA）；非法 YAML 直接抛错 |  |
| plugins/dsh-extra-plan/lib/preset-settings.js | hasOwn | L117-119 | null 安全的自有属性判定（readPath／rowsById 调用） |  |
| plugins/dsh-extra-plan/lib/preset-settings.js | pathParts | L121-123 | 点分路径（如 config.fetch）切成去空段数组 |  |
| plugins/dsh-extra-plan/lib/preset-settings.js | readPath | L125-132 | 按点分路径读嵌套值 → {exists,value}（任一段缺失即 exists:false） |  |
| plugins/dsh-extra-plan/lib/preset-settings.js | rowsById | L134-149 | DFS 收集文档中所有 id===pluginId 的行（Set 防环）→ 数组 |  |
| plugins/dsh-extra-plan/lib/preset-settings.js | visit | L137-146 | 递归遍历（数组按元素、对象按 Object.values），把 id 命中的行推入 rows | rowsById 内部闭包 |
| plugins/dsh-extra-plan/lib/preset-settings.js | resolveLocator | L151-158 | 按 pluginId+path 定位单个设置行 → kind=missing/ambiguous/ok（ok 带 row 与 value） |  |
| plugins/dsh-extra-plan/lib/preset-settings.js | resolveSetting | L160 | 按主 locator＋（默认启用的）别名解析设置；多命中或任一路径歧义 → {kind:'ambiguous'} |  |
| plugins/dsh-extra-plan/lib/preset-settings.js | validateSettingValue | L175-177 | 用 descriptor.validator 校验值；definition 缺失或无 validator 一律返回 false |  |
| plugins/dsh-extra-plan/lib/preset-settings.js | normalizeSettingValue | L179-181 | 有 normalize 时按其归一化（如 plannerModel 的 trim），否则原值返回 |  |
| plugins/dsh-extra-plan/lib/preset-settings.js | captureSettings | L183-198 | 解析预设并逐项解析 → {document,values,states}；states 四态，仅 captured 进 values（L195 别名 readManagedSettings） |  |
| plugins/dsh-extra-plan/lib/preset-settings.js | inlineCommentIndex | L202-220 | 找行内注释起始下标（跟踪单/双引号与 '' 转义，仅 # 前有空白或行首才算），无则 -1 |  |
| plugins/dsh-extra-plan/lib/preset-settings.js | lineIndent | L222-225 | 行首空格数（缩进量）；与 qqbot heal.js 同名函数无关 |  |
| plugins/dsh-extra-plan/lib/preset-settings.js | withoutCr | L227-229 | 去掉行尾 CR，兼容 CRLF 文本 |  |
| plugins/dsh-extra-plan/lib/preset-settings.js | parseRowId | L231-243 | 解析 '- id: xxx' 行的 id（先去行内注释、再解单/双引号写法），非 id 行返回 null |  |
| plugins/dsh-extra-plan/lib/preset-settings.js | parseMapKey | L245-249 | 映射行 → {key,indent}（'-' 开头的数组项返回 null） |  |
| plugins/dsh-extra-plan/lib/preset-settings.js | rowEnd | L251-259 | 求所在块结束行：跳过空行/注释，遇缩进 ≤ 本行缩进即返回其行号，否则返回总行数 |  |
| plugins/dsh-extra-plan/lib/preset-settings.js | findDirectKey | L261-279 | 在 [start,end) 内按首个子键缩进寻找父块直属子键 key 的行号；找不到返回 null |  |
| plugins/dsh-extra-plan/lib/preset-settings.js | textPathLine | L281-293 | 沿点分 path 逐层下钻定位，返回路径末段所在行号；任一段缺失返回 null |  |
| plugins/dsh-extra-plan/lib/preset-settings.js | findTextLocatorMatches | L295-306 | 在 YAML 原文中定位 pluginId 行并下钻路径 → [{rowStart,rowEnd,line}] |  |
| plugins/dsh-extra-plan/lib/preset-settings.js | yamlString | L308-312 | 字符串 → YAML 标量：含换行用 JSON 双引号形式，否则单引号包裹并把 ' 转成 '' |  |
| plugins/dsh-extra-plan/lib/preset-settings.js | serializeScalar | L314-318 | 按 scalarType 把值序列化成 YAML 标量文本（boolean/integer/其余走 yamlString） |  |
| plugins/dsh-extra-plan/lib/preset-settings.js | escapeRegex | L320-322 | 逐字符转义正则元字符，把键名安全拼进正则 |  |
| plugins/dsh-extra-plan/lib/preset-settings.js | replaceLineScalar | L324-336 | 保格式替换某键的标量值（保留缩进、值前后空白、行内注释与 CR）；键行不匹配返回 null |  |
| plugins/dsh-extra-plan/lib/preset-settings.js | isBlockScalarLine | L338-348 | 判断该键的值是否块标量（以竖线或 > 开头，忽略行内注释） |  |
| plugins/dsh-extra-plan/lib/preset-settings.js | locatorFor | L350-353 | 参数归一化：传 descriptor 取 .locator，传 locator 则原样返回 |  |
| plugins/dsh-extra-plan/lib/preset-settings.js | scalarTypeFor | L355-358 | 参数归一化：传 descriptor 取 .scalarType，否则缺省 'string' |  |
| plugins/dsh-extra-plan/lib/preset-settings.js | patchYamlScalar | L360 | 保格式定点改写 YAML 标量 → {ok,text,line}，或 {ok:false,reason:'missing'／'ambiguous'}；纯字符串处理不写文件 |  |
| plugins/dsh-extra-plan/lib/preset-settings.js | patchFirstYamlScalar | L388 | patchYamlScalar 的 first 变体：重复命中时改第一处而不报 ambiguous（工作区内未见调用点） |  |
| plugins/dsh-extra-plan/lib/preset-settings.js | publicSettingMetadata | L390-425 | 生成设置页字段元数据 {fields,values,defaults}；默认/实际各解析一次且禁用别名，actual 无效时回退默认值 |  |
| plugins/dsh-extra-plan/lib/preset-settings.js | settingsFileValues | L427-437 | 只返回解析成功且校验通过、已归一化的 {key:value} 值表（不含 document/states） |  |
| plugins/dsh-extra-plan/lib/preset-settings.js | yamlFileExists | L439-441 | fs.existsSync 薄封装：判断文件是否存在（工作区内未见调用点） |  |
| plugins/dsh-extra-plan/lib/preset-settings.js | readYamlFile | L443-445 | 以 utf8 同步读取文件内容，文件不存在会抛错（工作区内未见调用点） |  |
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
| plugins/dsh-extra-plan/lib/preset-sync.js | writeFull | L240-248 | 全量下发预设目录（tmp+rename） |  |
| plugins/dsh-extra-plan/lib/preset-sync.js | syncPreset | L254-275 | 预设同步判定（hash 比对→下发/跳过） |  |
| plugins/dsh-extra-plan/lib/preset-sync.js | apply | L280-289 | 插件入口（启动时 syncPreset） |  |
| plugins/dsh-extra-plan/lib/settings.js | dshHomeDir | L29-33 | DSH_HOME 解析（环境变量优先） |  |
| plugins/dsh-extra-plan/lib/settings.js | agentCordisPath | L35-37 | agent.cordis.yml 路径 |  |
| plugins/dsh-extra-plan/lib/settings.js | isLoopback | L39-42 | 环回地址判定（API 仅本机） |  |
| plugins/dsh-extra-plan/lib/settings.js | json | L44-47 | HTTP JSON 响应 |  |
| plugins/dsh-extra-plan/lib/settings.js | readJsonBody | L49-67 | 读取请求体（限 1MB） |  |
| plugins/dsh-extra-plan/lib/settings.js | readAgentMetadata | L69-74 | 读实际 agent.cordis.yml 与内置模板文本（模板读取失败则回退实际文本）→ publicSettingMetadata 生成设置元数据 |  |
| plugins/dsh-extra-plan/lib/settings.js | proPayload | L76-79 | 在 readAgentMetadata 元数据上展开其 values，得到设置页 API 响应体 {…metadata, …metadata.values} |  |
| plugins/dsh-extra-plan/lib/settings.js | writeTextAtomic | L81-92 | 原子写文件（tmp+rename） |  |
| plugins/dsh-extra-plan/lib/settings.js | patchManagedFile | L94-102 | 按 entries 逐项对受管文件做保格式标量改写，任一项失败即抛「key reason」；全部成功后原子写落盘（写文件副作用） |  |
| plugins/dsh-extra-plan/lib/settings.js | createApiHandler | L104-152 | 设置页 HTTP API（GET/PUT pro-config、qqbot 状态/配置） |  |
| plugins/dsh-extra-plan/lib/settings.js | apply | L154-165 | 插件入口（HTTP 服务注册） |  |
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
| plugins/dsh-qqbot-user-questions/lib/heal.js | fallbackLegacyEntryKind | L105-139 | js-yaml 不可用时按行匹配旧版根级块（id/name/config.default 逐行核对） | 行号区间为生成器对单行箭头函数链的展开（实际定义约 L105-139） |
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
| plugins/dsh-qqbot-user-questions/scripts/heal.mjs | invokedAsMain | L9-14 | 主脚本判定（node 直跑时执行自愈；镜像 distribute-preset.mjs L23-30） |  |

---

*本文件由脚本增量维护；直接编辑功能描述/备注列是安全的。*
