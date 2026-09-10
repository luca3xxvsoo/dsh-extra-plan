# 代码地图（dsh-extra-plan）

> **维护分工**：行号区间/增删行由脚本 node pe-test/tools/代码地图生成.mjs 增量同步；**功能描述、备注、以及「意图速查」整节由 AI/人维护**（脚本刷新不会覆盖）。
> **用法**：先看「意图速查」按意图词找函数名 → 再到「函数索引」按函数名取行号区间 → read 该区间。
> 上次同步：2026-09-10 21:14:01（脚本自动更新时间戳行）

## 意图速查（人工维护：意图词 → 函数名；行号请到下方「函数索引」按函数名取）

> 用法：拿用户/AI 口里的词在「想找什么」列 grep → 得函数名 → 到「函数索引」grep 该函数名 → 取行号区间 → read 该区间。
> 本节引用的函数名若不存在于索引，生成脚本会报 `[导航失效]`（防止入口过期）。

| 想找什么（含同义词/英文标识） | 文件 | 函数名 |
|:--|:--|:--|
| 三级闸门／路由确认／批准／流程状态（route/clarified/approved） | index.js | deriveFlowState、mainGateReason、routeDenyReason、gateAskDenyReason、validateGateAskStructure |
| 探查预算／额度／剩余次数／耗尽（exploreBudget/budget） | index.js | toolCallsSinceUser、budgetNoticeText、budgetReminderText、budgetExhaustedReason |
| run_code 组判定／绕道拆解／调用点扫描（decompose） | index.js | decomposeRunCode、collectRunCodeSites、runCodeGroupDenyReason |
| run_code 多调用容错／教学文案（容错检查开关） | index.js | runCodeCatchGateReason |
| ask 必须 return／返回值白名单 | index.js | askUserQuestionReturnGateReason |
| 单实例调用点上限／循环放大 | index.js | runCodeSiteCount、runCodeDispatchGateReason |
| job_output 禁 wait:true／同 job 查重 | index.js | jobOutputGateReason |
| 锚定引导／首轮极简／bootstrap | index.js | isBootstrapPhase |
| 方案与验收落盘／save_plan 双写（plan/checklist） | index.js | defineSavePlan、registerSavePlan、savePlanBase |
| 落盘原子提交／journal 崩溃自愈（atomic/commit） | index.js | atomicCommit、recoverJournals |
| 线索落盘／save_probe／证据报告（probe/evidence） | index.js | validateProbe、renderProbeMarkdown、extractProbeEvidenceRefs |
| 探查者委派／禁止 planner 派探查（subagent_probe） | index.js | subagentProbeGateReason、resolveProbeRequestInjection |
| 只读子代理／验收者只读（reviewer/readonly） | index.js | childReadonlyGateReason、isReadOnlyChildByCatalog |
| 子代理沙箱下限／权限抬升（floor/sandbox） | index.js | childPolicyNeedsFloor、floorChildPolicy |
| 工具目录折叠／PTC 单入口（catalog/ptc） | index.js | catalogIsCollapsed |
| 规划模型与降级／plannerModel（T2/T4） | index.js | resolvePlannerEntry、decidePlannerModelUse |
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
| plugins/dsh-extra-plan/index.js | 3469 | 模式核心：三级闸门（路由/澄清/批准）+ 探查预算 + save_plan/save_probe 工具 + 锚点钩子（修改最频繁） |
| plugins/dsh-extra-plan/lib/client-bridge.js | 20 | 客户端桥接壳：仅承载 dsh.client 加载路径指向 lib/client.js（apply 空实现） |
| plugins/dsh-extra-plan/lib/client.js | 317 | dsh web 设置界面 UI（__ModuleLoader__ 打包格式，React；中/英文案） |
| plugins/dsh-extra-plan/lib/executor-spawn.js | 90 | 执行者子代理 provider：委托宿主 spawn，注入工具 deny（防委派递归/追问） |
| plugins/dsh-extra-plan/lib/preset-settings.js | 440 | 设置描述表（唯一真源）+ 预设 YAML 解析 + 保格式定点标量改写；plannerModel validator T4 放开空串（isString） |
| plugins/dsh-extra-plan/lib/preset-sync.js | 290 | 预设资产自动下发同步（distHash 比对，幂等） |
| plugins/dsh-extra-plan/lib/settings.js | 166 | 设置页后端 HTTP API（pro-config；qqbot 相关已随精简版插件移除） |
| plugins/dsh-extra-plan/scripts/distribute-preset.mjs | 41 | 预设分发脚本（安装/更新时写 DSH_HOME/.agent-presets/extra-plan） |
| plugins/dsh-qqbot-user-questions/index.js | 23 | qqbot 精简版自愈插件：apply 启动时自愈（补行+建链），不阻断启动 |
| plugins/dsh-qqbot-user-questions/lib/heal.js | 370 | 自愈纯函数模块（定位 profile/幂等补行/建链；供 index.js/CLI/测试复用） |
| plugins/dsh-qqbot-user-questions/scripts/heal.mjs | 27 | CLI 兜底入口（postinstall/手动触发；invokedAsMain 判定） |

## 函数索引

| 文件 | 函数 | 行号 | 功能描述 | 备注 |
|:--|:--|:--|:--|:--|
| plugins/dsh-extra-plan/index.js | routeDenyReason | L100-105 | 路由未确认时 write/edit/写shell 的拒绝文案（提示先做路由确认） |  |
| plugins/dsh-extra-plan/index.js | planDenyReason | L106-114 | plan 路由下 save_probe/subagent_plan 前置条件未满足的拒绝文案 |  |
| plugins/dsh-extra-plan/index.js | approvalDenyReason | L115-117 | 批准前禁止执行委派类工具（subagent/workflow/ralph）拒绝文案 |  |
| plugins/dsh-extra-plan/index.js | sessionEvents | L171-175 | 取 agent.session 事件快照（缺失兜底空数组） |  |
| plugins/dsh-extra-plan/index.js | isExplicitRoute | L179-185 | 设置页显式指定规划模型（与主会话不同）判断 |  |
| plugins/dsh-extra-plan/index.js | isExplicitEffort | L189-191 | 显式指定 reasoningEffort 判断 |  |
| plugins/dsh-extra-plan/index.js | isSubagentChild | L194-209 | 判定会话属于子代理（header.origin/delegationDepth/descriptor 三路探测） |  |
| plugins/dsh-extra-plan/index.js | isLiveDelegation | L213-224 | 子代理是否仍有存活父会话（live delegation）判定 |  |
| plugins/dsh-extra-plan/index.js | childPolicyNeedsFloor | L227-232 | 子代理沙箱策略需抬升为 workspace-write 的判定 |  |
| plugins/dsh-extra-plan/index.js | isBootstrapPhase | L235-242 | anchored 引导阶段判定（首个工具调用前） |  |
| plugins/dsh-extra-plan/index.js | commandTextOf | L247-259 | 从 exec.arguments 提取 shell 命令原文（字符串/parsed 兼容） |  |
| plugins/dsh-extra-plan/index.js | pwshCommandOf | L260 | 提取 pwsh 命令文本 |  |
| plugins/dsh-extra-plan/index.js | bashCommandOf | L261 | 提取 bash 命令文本 |  |
| plugins/dsh-extra-plan/index.js | mutationMatches | L262-265 | 命令命中写操作拒绝正则判定 |  |
| plugins/dsh-extra-plan/index.js | pwshMutationMatches | L266 | pwsh 写操作判定（调 mutationMatches） |  |
| plugins/dsh-extra-plan/index.js | bashMutationMatches | L267 | bash 写操作判定（调 mutationMatches） |  |
| plugins/dsh-extra-plan/index.js | runCodeTextOf | L270-274 | 提取 run_code 的 code 参数文本 |  |
| plugins/dsh-extra-plan/index.js | codeMutationHints | L277-285 | 对文本扫描 RUNCODE_MUTATION_HINTS 返回命中写暗示 id 列表 |  |
| plugins/dsh-extra-plan/index.js | labelsOfCallData | L289-305 | 从 ask 调用数据提取选项 label 集合 |  |
| plugins/dsh-extra-plan/index.js | normalizeLabel | L317-319 | label 规范化（空白清理） |  |
| plugins/dsh-extra-plan/index.js | isExactGateSet | L322-329 | label 集合与闸门常量集完全一致判定 |  |
| plugins/dsh-extra-plan/index.js | isPartialGateSet | L332-340 | label 与闸门词部分包含判定 |  |
| plugins/dsh-extra-plan/index.js | categorizeGateAsk | L343-347 | ask 分类（standard/malformed/ordinary） |  |
| plugins/dsh-extra-plan/index.js | gateAskDenyReason | L350-377 | 生成标准闸门 ask 选项/结构错误的拒绝理由 |  |
| plugins/dsh-extra-plan/index.js | validateGateAskStructure | L383-400 | 校验路由/批准 ask 结构（问题数、固定选项、修改意见） |  |
| plugins/dsh-extra-plan/index.js | askKindOf | L407-419 | 从 label 判定 ask 类型（route/approve） |  |
| plugins/dsh-extra-plan/index.js | askKindOfRelaxed | L425-438 | 宽松判定 ask 类型（特异性词优先） |  |
| plugins/dsh-extra-plan/index.js | matchRouteLabel | L440-449 | 用户选择标签→direct/plan/disagree |  |
| plugins/dsh-extra-plan/index.js | matchApprovalLabel | L451-460 | 用户选择标签→approve/replan/disagree |  |
| plugins/dsh-extra-plan/index.js | parseAskResultData | L466-501 | tool/result 解析用户选择（answers.selected） |  |
| plugins/dsh-extra-plan/index.js | parseDispatchAskResult | L509-535 | code-dispatch 的 ask 结果解析（含 error 分支） |  |
| plugins/dsh-extra-plan/index.js | deriveFlowState | L542-622 | 事件流推导 flow state（route/clarified/approved/channelBroken） |  |
| plugins/dsh-extra-plan/index.js | plannerChildIdsOf | L627-677 | 事件流收集规划子代理会话 id |  |
| plugins/dsh-extra-plan/index.js | toolCallCount | L685-712 | 统计成功工具调用次数（可跳过指定工具） |  |
| plugins/dsh-extra-plan/index.js | toolCallsSinceUser | L719-734 | 最近一次用户/协调者消息之后的工具调用数 |  |
| plugins/dsh-extra-plan/index.js | jobOutputCallsForJob | L739-766 | 锚点后对指定 job 的 job_output 调用计数 |  |
| plugins/dsh-extra-plan/index.js | appendSuffixBlock | L773-790 | 给 user 消息追加文本块（拼入第一个 text 块尾部） |  |
| plugins/dsh-extra-plan/index.js | withPlannerPromptSuffix | L791-800 | 拼接规划子代理附加引导 |  |
| plugins/dsh-extra-plan/index.js | budgetNoticeText | L807-809 | 开局预算提示文案（本轮探查预算上限 N 次） |  |
| plugins/dsh-extra-plan/index.js | withBudgetNotice | L813 | 预算提示拼接进消息 |  |
| plugins/dsh-extra-plan/index.js | budgetReminderText | L816-820 | 剩余≤3次提醒文案 |  |
| plugins/dsh-extra-plan/index.js | budgetReminderMessage | L823-825 | 剩余提醒消息构造 |  |
| plugins/dsh-extra-plan/index.js | budgetReminderSent | L829-852 | 本锚点是否已注入剩余提醒（防重复注入） |  |
| plugins/dsh-extra-plan/index.js | budgetExhaustedReason | L856-858 | 预算耗尽文案（已用 x/y） |  |
| plugins/dsh-extra-plan/index.js | budgetExceeded | L861-863 | used+1 超预算判定 |  |
| plugins/dsh-extra-plan/index.js | sanitizeTaskName | L868-876 | 任务名净化（截断/去非法字符） |  |
| plugins/dsh-extra-plan/index.js | timestamp | L879-883 | 时间戳 yyyyMMddHHmmss |  |
| plugins/dsh-extra-plan/index.js | pad | L881 | 数字补零（timestamp 内部闭包） |  |
| plugins/dsh-extra-plan/index.js | sessionTagOf | L887-889 | 会话标识段（T3）：session header id 去分隔符后前 8 位字母数字；取不到 id → 空串 |  |
| plugins/dsh-extra-plan/index.js | savePlanBase | L895-898 | save_plan 文件名 base（T3）：任务短名 + 会话标识段 + 本地时间戳（主会话/规划子代理同秒落盘不再撞名） |  |
| plugins/dsh-extra-plan/index.js | renderSavePlan | L905-907 | save_plan 结果渲染（路径数组→文本） |  |
| plugins/dsh-extra-plan/index.js | validateProbe | L940-1039 | save_probe 参数校验（四字段上限/path 存在/evidence 规则） |  |
| plugins/dsh-extra-plan/index.js | probePathOf | L1042-1045 | 相对路径按 cwd 解析绝对路径 |  |
| plugins/dsh-extra-plan/index.js | renderProbeMarkdown | L1049-1090 | save_probe Markdown 渲染（线索/证据报告） |  |
| plugins/dsh-extra-plan/index.js | extractProbeEvidenceRefs | L1095-1103 | 方案文本提取【探查者已核实】证据引用路径 |  |
| plugins/dsh-extra-plan/index.js | renderSaveProbe | L1107-1109 | save_probe 输出渲染 |  |
| plugins/dsh-extra-plan/index.js | catalogHasWriteTools | L1113-1118 | 工具目录是否含写工具判定 |  |
| plugins/dsh-extra-plan/index.js | isReadOnlyChildByCatalog | L1121-1123 | 按工具目录判定只读子代理 |  |
| plugins/dsh-extra-plan/index.js | schemasHasWriteTools | L1128-1133 | schemas 数组是否含写工具 |  |
| plugins/dsh-extra-plan/index.js | schemasHasTool | L1137-1142 | schemas 是否含指定工具 |  |
| plugins/dsh-extra-plan/index.js | catalogIsCollapsed | L1149-1154 | 工具目录折叠为单工具判定（run_code/仅shell） |  |
| plugins/dsh-extra-plan/index.js | resolveProbeRequestInjection | L1164-1248 | 探查者请求注入解析（上溯父会话配置） |  |
| plugins/dsh-extra-plan/index.js | maskCodeLiteralsAndComments | L1259-1297 | 遮蔽字符串/注释为空格（括号配平用） |  |
| plugins/dsh-extra-plan/index.js | sliceBalancedArgs | L1302-1318 | 从括号起配平切片参数原文 |  |
| plugins/dsh-extra-plan/index.js | decomposeRunCode | L1329-1458 | 静态拆解 run_code 的 code 为工具成员组（含裸写伪工具） |  |
| plugins/dsh-extra-plan/index.js | addMember | L1338-1352 | 成员去重添加（decomposeRunCode 内部闭包） |  |
| plugins/dsh-extra-plan/index.js | markRange | L1353-1355 | 标记已占用区间（decomposeRunCode 内部闭包） |  |
| plugins/dsh-extra-plan/index.js | isIdChar | L1356 | 标识符字符判定（decomposeRunCode 内部闭包） |  |
| plugins/dsh-extra-plan/index.js | runCodeCatchGateReason | L1465-1678 | run_code 多调用容错闸门：tools.* 调用点≥2 时要求每点独立容错，不足即教学式拒绝（单调用豁免；嵌套展平） |  |
| plugins/dsh-extra-plan/index.js | within | L1494 | 调用点区间包含判定（site.start 是否落在 a、b 之间）：把调用点归入 try 块或数组实参区间 | runCodeCatchGateReason 内部闭包 |
| plugins/dsh-extra-plan/index.js | collectRunCodeSites | L1683-1766 | run_code 调用点收集：跳过字符串/注释，认 tools.x、tools['lit']、tools[var]，返回 {start,end,innerText,name} |  |
| plugins/dsh-extra-plan/index.js | askUserQuestionReturnGateReason | L1770-1963 | 主会话 run_code 的 ask_user_question 返回值白名单：仅放行直接 return-await 或单变量后顶层 return 的标识符引用；嵌套重入兜底，未知形态默认拒绝 |  |
| plugins/dsh-extra-plan/index.js | isIdChar | L1775 | 标识符字符判定（本处属 askUserQuestionReturnGateReason；同名闭包另见 decomposeRunCode 的 L1356 那处） | askUserQuestionReturnGateReason 内部闭包 |
| plugins/dsh-extra-plan/index.js | skipWs | L1776-1780 | 自 start 起跳过空白字符，返回首个非空白字符下标（词法扫描的跳白工具） | askUserQuestionReturnGateReason 内部闭包 |
| plugins/dsh-extra-plan/index.js | isTopLevel | L1863 | 位置是否处于花括号/圆括号/方括号深度全为 0 的顶层语句中——只有顶层出现的 ask 调用才可被白名单静态证明 | askUserQuestionReturnGateReason 内部闭包（同名闭包另见 decomposeRunCode L1356） |
| plugins/dsh-extra-plan/index.js | candidateStarts | L1864-1871 | 收集 pos 之前的顶层语句起点（0 及顶层 ';' / '}' 之后的位置），用于把调用归入所属顶层语句 | askUserQuestionReturnGateReason 内部闭包 |
| plugins/dsh-extra-plan/index.js | tokenAt | L1872-1873 | pos 处是否恰为指定关键字且两侧均为标识符边界（return/await 词法判定） | 内部闭包；区间为脚本所给，实际函数体仅 L1872-1873 |
| plugins/dsh-extra-plan/index.js | expressionEnd | L1874-1883 | 求顶层语句的结束下标：顶层 ';'，或换行后紧跟 const/let/var/return/console/await/if/for/while/try/throw 关键字处；未命中则返回遮蔽文本末尾 | askUserQuestionReturnGateReason 内部闭包 |
| plugins/dsh-extra-plan/index.js | references | L1884-1899 | 按标识符边界在表达式内查找变量的真实引用，排除成员访问（前有 '.'）与对象键（后有 ':'） | askUserQuestionReturnGateReason 内部闭包 |
| plugins/dsh-extra-plan/index.js | hasReassignment | L1900-1917 | 判定变量在表达式内是否被重新赋值（=、+=/-=、++/--），用于否掉「单变量接收后被改写」的伪白名单形态 | askUserQuestionReturnGateReason 内部闭包 |
| plugins/dsh-extra-plan/index.js | afterCall | L1918-1928 | 取调用点之后的首个有效 token 位置（顺带跳过可选分号），并回传原始 gap 文本，用于校验「调用后紧接顶层 return」 | askUserQuestionReturnGateReason 内部闭包 |
| plugins/dsh-extra-plan/index.js | runCodeSiteCount | L1967-1985 | run_code 静态调用点计数（planner 单实例上限快路径；run_code 调用点自身不计） |  |
| plugins/dsh-extra-plan/index.js | isRunCodeSubCall | L1989-1994 | 子调用判定：exec.sub 或 exec.parent!==undefined（与官方 dsh-tools nested 同口径） |  |
| plugins/dsh-extra-plan/index.js | runCodeDispatchCapText | L1997-1999 | 单实例子调用超限文案（T3 逐字）：rootCallId 实例子调用数超过 exploreBudget 上限的拒绝文案，listener 运行时检查与纯函数共用 |  |
| plugins/dsh-extra-plan/index.js | runCodeDispatchGateReason | L2004-2018 | 运行时单实例上限（planner）：按 rootCallId 计数，超 cap 返回 T3 文案 |  |
| plugins/dsh-extra-plan/index.js | subagentProbeGateReason | L2028-2037 | 探查者分支闸门（T5 唯一功能点）：planner 禁止委派（文案指向「申请继续探查」）+ 主会话 run_in_background 必 true；两调用点（组判定/直呼）共用 |  |
| plugins/dsh-extra-plan/index.js | plannerGateReason | L2040-2058 | 规划子代理分支闸门（write/edit/pwsh/bash 写禁 + 预算） |  |
| plugins/dsh-extra-plan/index.js | childReadonlyGateReason | L2061-2073 | 子代理只读分支闸门（探查者/验收者差异化文案；不含 run_code） |  |
| plugins/dsh-extra-plan/index.js | jobOutputGateReason | L2078-2100 | job_output 闸门：禁 wait:true + 同 job 重复调用查重（内存计数器） |  |
| plugins/dsh-extra-plan/index.js | probeDisposalWarning | L2108-2111 | 探查者级联中止告警纯函数：剩余未认领探查者委派数为正整数时返回告警文案（T5 文案中性化「委派方会话销毁时」+ owner disposed + 引擎限制指向官方包）；非正整数返回 null |  |
| plugins/dsh-extra-plan/index.js | mainGateReason | L2119-2240 | 主会话闸门主分支（ask/write/edit/plan/save_plan/subagent/run_code/job_output…）；save_plan 仅 direct 放行（T3） |  |
| plugins/dsh-extra-plan/index.js | runCodeGroupDenyReason | L2250-2333 | run_code 组判定：拆解→成员逐判定→聚合拒绝；预算耗尽白名单把关 |  |
| plugins/dsh-extra-plan/index.js | visit | L2267-2310 | 递归展平嵌套 run_code（runCodeGroupDenyReason 内闭包） |  |
| plugins/dsh-extra-plan/index.js | aggregateRunCodeDenyReason | L2339-2351 | 聚合多成员拒绝消息 |  |
| plugins/dsh-extra-plan/index.js | decidePlannerModelUse | L2373-2386 | T2 静默降级判定：目录命中→用 plannerModel；清单非空未命中→不覆盖（inherit-parent）；空/异常→沿用 |  |
| plugins/dsh-extra-plan/index.js | apply | L2484-3468 | 插件主入口：配置解析/服务注册/工具注册/锚点钩子 |  |
| plugins/dsh-extra-plan/index.js | foldUsage | L2512-2586 | usage 账本折叠写入（cursor 去重，按 sessionId+seq） |  |
| plugins/dsh-extra-plan/index.js | isChild | L2591-2599 | 子代理判定（live 校验+误分类警示） |  |
| plugins/dsh-extra-plan/index.js | isPlannerChild | L2603-2617 | 规划子代理判定（descriptor.mode=continuable） |  |
| plugins/dsh-extra-plan/index.js | toolSchemasOf | L2622-2640 | 防御式获取 agent 工具 schemas |  |
| plugins/dsh-extra-plan/index.js | resolvePlannerEntry | L2661-2728 | 规划子模型单点解析（plannerModel 优先 + 父会话配置 + 缓存）；经 listModels 目录做 T2 降级判定 |  |
| plugins/dsh-extra-plan/index.js | parseSkillFrontmatter | L2772-2781 | SKILL.md frontmatter 的 name/description 解析 |  |
| plugins/dsh-extra-plan/index.js | floorChildPolicy | L2783-2787 | 子代理沙箱策略抬升（workspace-write） |  |
| plugins/dsh-extra-plan/index.js | childBaseline | L2789-2795 | 子代理基线（判定/usage/floor 汇总） |  |
| plugins/dsh-extra-plan/index.js | atomicCommit | L2807-2822 | 原子落盘（tmp→journal→rename→清 journal；save_plan 双写/save_probe 单写共用）；可选 sessionTag 写入 journal 供按会话恢复（T3） |  |
| plugins/dsh-extra-plan/index.js | recoverJournals | L2829-2856 | journal 崩溃自愈（新旧形状兼容）；可选 sessionTag 过滤：跳过内嵌其它会话标识的残留（T3 跨角色互恢复防护） |  |
| plugins/dsh-extra-plan/index.js | defineSavePlan | L2858-2924 | save_plan 工具定义（双写必填/证据引用校验） |  |
| plugins/dsh-extra-plan/index.js | registerTool | L2928-2941 | 工具注册分发 |  |
| plugins/dsh-extra-plan/index.js | registerSavePlan | L2944 | save_plan 注册（规划子代理层 + 主会话层；主会话侧放行由 mainGateReason 限 direct，T3） |  |
| plugins/dsh-extra-plan/index.js | defineSaveProbe | L2949-3062 | save_probe 工具定义 |  |
| plugins/dsh-extra-plan/index.js | registerSaveProbe | L3065 | save_probe 注册（主会话层 + 已认领的探查子代理层；规划子代理/执行者/reviewer 不是持有者） |  |
| plugins/dsh-extra-plan/index.js | probeClaimFor | L3075-3091 | 放行-认领关联查核（pendingProbeClaims）：非子代理/含写子代理/规划子代理（T5 守卫）不认领，命中则消费计数并登记 save_probe |  |
| plugins/dsh-extra-plan/index.js | causeChainOf | L3142-3154 | 拒绝原因链解析（子代理继承根因） |  |
| plugins/dsh-extra-plan/index.js | recordRequestError | L3155-3177 | 记录请求错误诊断到临时目录 |  |
| plugins/dsh-extra-plan/lib/client-bridge.js | apply | L17-19 | 空实现（仅承载 dsh.client 加载路径指向 lib/client.js） |  |
| plugins/dsh-extra-plan/lib/client.js | apply | L81-311 | 客户端插件入口：注入样式表与中英词条，定义设置页组件并注册到 settings.plugin.item 插槽（用 inject 等待插槽就绪，register 会被丢弃） |  |
| plugins/dsh-extra-plan/lib/client.js | ProConfigTab | L92-255 | 设置页「pro规划模块」组件：GET /pro-config 载入 fields/values → 本地草稿 → save() PUT 回写；含 loading/error/ready 三态渲染 |  |
| plugins/dsh-extra-plan/lib/client.js | setField | L131-134 | 更新草稿中某字段并清空提示信息 | ProConfigTab 内部闭包 |
| plugins/dsh-extra-plan/lib/client.js | save | L136-160 | 把草稿按字段类型（integer 转 Number）PUT 到 /pro-config，按结果给出「已保存/保存失败」提示 | ProConfigTab 内部闭包 |
| plugins/dsh-extra-plan/lib/client.js | optionLabel | L181-186 | 选项显示名：优先 optionLocale 词条，其次布尔 trueValue/falseValue，最后原值字符串 | ProConfigTab 内部闭包 |
| plugins/dsh-extra-plan/lib/client.js | optionValue | L188-194 | 把后端返回的字符串值映射回 field.options 里的原始类型（不在选项中则原样返回） | ProConfigTab 内部闭包 |
| plugins/dsh-extra-plan/lib/client.js | renderField | L196-240 | 按 field.control（textarea/number/select 等）渲染单个设置项控件并绑定 setField | ProConfigTab 内部闭包 |
| plugins/dsh-extra-plan/lib/client.js | ExtraPlanCard | L257-286 | 设置→插件页的可折叠卡片：标题/描述 + 展开后渲染 ExtraPlanSettingsTab（本地 open 状态） |  |
| plugins/dsh-extra-plan/lib/client.js | ExtraPlanSettingsTab | L288-292 | 卡片内容容器：包一层 esp-wrap 后渲染 ProConfigTab |  |
| plugins/dsh-extra-plan/lib/executor-spawn.js | apply | L49-89 | 插件入口：注册执行者 provider（委托宿主 spawn，注入 deny 工具裁剪） |  |
| plugins/dsh-extra-plan/lib/executor-spawn.js | defaultedAgentOptions | L69-73 | 执行者 agentOptions 透传（请求自带优先，否则空对象继承父会话） |  |
| plugins/dsh-extra-plan/lib/preset-settings.js | loadYaml | L9-22 | 模块加载期解析 js-yaml：本模块 require 失败则回退全局 dsh 的 node_modules，仍失败抛首个错误 |  |
| plugins/dsh-extra-plan/lib/preset-settings.js | isString | L34 | 字符串判定（T4 起为 plannerModel 的 validator：空串合法=继承主会话模型） | 区间已由生成器修正为实际定义行（原 L34-55 为掩码失效导致的开区间） |
| plugins/dsh-extra-plan/lib/preset-settings.js | isPositiveInteger | L35 | 正整数校验器（exploreBudget 的 validator）：仅接受 >0 整数，拒绝小数/0/负数/非 number |  |
| plugins/dsh-extra-plan/lib/preset-settings.js | isBoolean | L36 | 布尔校验器（anchoredBootstrap／runcodeCatchGate／webFetch 三个 descriptor 的 validator） |  |
| plugins/dsh-extra-plan/lib/preset-settings.js | isMode | L38 | 工具展示模式校验器：仅接受 modeOptions（native/ptc/both）三值之一 |  |
| plugins/dsh-extra-plan/lib/preset-settings.js | setting | L40-55 | descriptor 工厂：冻结定义并补齐 type/locator/aliases/ui（SETTING_DEFINITIONS 内 7 处调用） |  |
| plugins/dsh-extra-plan/lib/preset-settings.js | getSettingDefinition | L104-106 | 按 key 取设置描述符（descriptorByKey），未命中返回 undefined |  |
| plugins/dsh-extra-plan/lib/preset-settings.js | parsePresetYaml | L108-110 | 预设 YAML 文本 → JS 对象（含自定义 js 标签的 YAML_SCHEMA）；非法 YAML 直接抛错 |  |
| plugins/dsh-extra-plan/lib/preset-settings.js | hasOwn | L112-114 | null 安全的自有属性判定（readPath／rowsById 调用） |  |
| plugins/dsh-extra-plan/lib/preset-settings.js | pathParts | L116-118 | 点分路径（如 config.fetch）切成去空段数组 |  |
| plugins/dsh-extra-plan/lib/preset-settings.js | readPath | L120-127 | 按点分路径读嵌套值 → {exists,value}（任一段缺失即 exists:false） |  |
| plugins/dsh-extra-plan/lib/preset-settings.js | rowsById | L129-144 | DFS 收集文档中所有 id===pluginId 的行（Set 防环）→ 数组 |  |
| plugins/dsh-extra-plan/lib/preset-settings.js | visit | L132-141 | 递归遍历（数组按元素、对象按 Object.values），把 id 命中的行推入 rows | rowsById 内部闭包 |
| plugins/dsh-extra-plan/lib/preset-settings.js | resolveLocator | L146-153 | 按 pluginId+path 定位单个设置行 → kind=missing/ambiguous/ok（ok 带 row 与 value） |  |
| plugins/dsh-extra-plan/lib/preset-settings.js | resolveSetting | L155 | 按主 locator＋（默认启用的）别名解析设置；多命中或任一路径歧义 → {kind:'ambiguous'} |  |
| plugins/dsh-extra-plan/lib/preset-settings.js | validateSettingValue | L170-172 | 用 descriptor.validator 校验值；definition 缺失或无 validator 一律返回 false |  |
| plugins/dsh-extra-plan/lib/preset-settings.js | normalizeSettingValue | L174-176 | 有 normalize 时按其归一化（如 plannerModel 的 trim），否则原值返回 |  |
| plugins/dsh-extra-plan/lib/preset-settings.js | captureSettings | L178-193 | 解析预设并逐项解析 → {document,values,states}；states 四态，仅 captured 进 values（L195 别名 readManagedSettings） |  |
| plugins/dsh-extra-plan/lib/preset-settings.js | inlineCommentIndex | L197-215 | 找行内注释起始下标（跟踪单/双引号与 '' 转义，仅 # 前有空白或行首才算），无则 -1 |  |
| plugins/dsh-extra-plan/lib/preset-settings.js | lineIndent | L217-220 | 行首空格数（缩进量）；与 qqbot heal.js 同名函数无关 |  |
| plugins/dsh-extra-plan/lib/preset-settings.js | withoutCr | L222-224 | 去掉行尾 CR，兼容 CRLF 文本 |  |
| plugins/dsh-extra-plan/lib/preset-settings.js | parseRowId | L226-238 | 解析 '- id: xxx' 行的 id（先去行内注释、再解单/双引号写法），非 id 行返回 null |  |
| plugins/dsh-extra-plan/lib/preset-settings.js | parseMapKey | L240-244 | 映射行 → {key,indent}（'-' 开头的数组项返回 null） |  |
| plugins/dsh-extra-plan/lib/preset-settings.js | rowEnd | L246-254 | 求所在块结束行：跳过空行/注释，遇缩进 ≤ 本行缩进即返回其行号，否则返回总行数 |  |
| plugins/dsh-extra-plan/lib/preset-settings.js | findDirectKey | L256-274 | 在 [start,end) 内按首个子键缩进寻找父块直属子键 key 的行号；找不到返回 null |  |
| plugins/dsh-extra-plan/lib/preset-settings.js | textPathLine | L276-288 | 沿点分 path 逐层下钻定位，返回路径末段所在行号；任一段缺失返回 null |  |
| plugins/dsh-extra-plan/lib/preset-settings.js | findTextLocatorMatches | L290-301 | 在 YAML 原文中定位 pluginId 行并下钻路径 → [{rowStart,rowEnd,line}] |  |
| plugins/dsh-extra-plan/lib/preset-settings.js | yamlString | L303-307 | 字符串 → YAML 标量：含换行用 JSON 双引号形式，否则单引号包裹并把 ' 转成 '' |  |
| plugins/dsh-extra-plan/lib/preset-settings.js | serializeScalar | L309-313 | 按 scalarType 把值序列化成 YAML 标量文本（boolean/integer/其余走 yamlString） |  |
| plugins/dsh-extra-plan/lib/preset-settings.js | escapeRegex | L315-317 | 逐字符转义正则元字符，把键名安全拼进正则 |  |
| plugins/dsh-extra-plan/lib/preset-settings.js | replaceLineScalar | L319-331 | 保格式替换某键的标量值（保留缩进、值前后空白、行内注释与 CR）；键行不匹配返回 null |  |
| plugins/dsh-extra-plan/lib/preset-settings.js | isBlockScalarLine | L333-343 | 判断该键的值是否块标量（以竖线或 > 开头，忽略行内注释） |  |
| plugins/dsh-extra-plan/lib/preset-settings.js | locatorFor | L345-348 | 参数归一化：传 descriptor 取 .locator，传 locator 则原样返回 |  |
| plugins/dsh-extra-plan/lib/preset-settings.js | scalarTypeFor | L350-353 | 参数归一化：传 descriptor 取 .scalarType，否则缺省 'string' |  |
| plugins/dsh-extra-plan/lib/preset-settings.js | patchYamlScalar | L355 | 保格式定点改写 YAML 标量 → {ok,text,line}，或 {ok:false,reason:'missing'／'ambiguous'}；纯字符串处理不写文件 |  |
| plugins/dsh-extra-plan/lib/preset-settings.js | patchFirstYamlScalar | L383 | patchYamlScalar 的 first 变体：重复命中时改第一处而不报 ambiguous（工作区内未见调用点） |  |
| plugins/dsh-extra-plan/lib/preset-settings.js | publicSettingMetadata | L385-419 | 生成设置页字段元数据 {fields,values,defaults}；默认/实际各解析一次且禁用别名，actual 无效时回退默认值 |  |
| plugins/dsh-extra-plan/lib/preset-settings.js | settingsFileValues | L421-431 | 只返回解析成功且校验通过、已归一化的 {key:value} 值表（不含 document/states） |  |
| plugins/dsh-extra-plan/lib/preset-settings.js | yamlFileExists | L433-435 | fs.existsSync 薄封装：判断文件是否存在（工作区内未见调用点） |  |
| plugins/dsh-extra-plan/lib/preset-settings.js | readYamlFile | L437-439 | 以 utf8 同步读取文件内容，文件不存在会抛错（工作区内未见调用点） |  |
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
| plugins/dsh-qqbot-user-questions/index.js | apply | L13-22 | 插件入口：apply 启动时调 healQqbotCompatibility 自愈（补行+建链；try/catch 不阻断启动） |  |
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
| plugins/dsh-qqbot-user-questions/lib/heal.js | healPatchRows | L246-284 | 幂等补 cordis.patch.yml 两行（code-runtime/agent-presets）；写前 .bak-* 备份、写后校验失败恢复；文件不存在跳过 |  |
| plugins/dsh-qqbot-user-questions/lib/heal.js | findOwnQqbotProfiles | L292-312 | 扫描 $DSH_HOME/profiles/* 找出锚定本插件的 qqbot profile（bundles + node_modules 双条件） |  |
| plugins/dsh-qqbot-user-questions/lib/heal.js | ensureDshExtraPlanLink | L320-350 | 建 @local/dsh-extra-plan → web 包链接：web 缺失跳过/已正确不动/实体或非目标链接提示 pnpm 迁移/仅 ENOENT 建 junction |  |
| plugins/dsh-qqbot-user-questions/lib/heal.js | healQqbotCompatibility | L356-369 | 对每个自有 profile 先补行再建链；整体 try/catch 只记录日志不阻断 |  |
| plugins/dsh-qqbot-user-questions/scripts/heal.mjs | invokedAsMain | L9-14 | 主脚本判定（node 直跑时执行自愈；镜像 distribute-preset.mjs L23-30） |  |

---

*本文件由脚本增量维护；直接编辑功能描述/备注列是安全的。*
