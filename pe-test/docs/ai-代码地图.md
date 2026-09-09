# 代码地图（dsh-extra-plan）

> **维护分工**：行号区间/增删行由脚本 node pe-test/tools/代码地图生成.mjs 增量同步；**功能描述与备注由 AI/人维护**（脚本刷新不会覆盖）。
> **用法**：AI 定位功能时先在此表按关键词检索函数名/描述，再 read 目标行号区间；函数描述为空（待补充）时请补写。
> 上次同步：2026-09-09 15:16:27（脚本自动更新时间戳行）

## 文件总览

| 文件 | 行数 | 说明 |
|:--|--:|:--|
| plugins/dsh-extra-plan/index.js | 3132 | 模式核心：三级闸门（路由/澄清/批准）+ 探查预算 + save_plan/save_probe 工具 + 锚点钩子（修改最频繁） |
| plugins/dsh-extra-plan/lib/client-bridge.js | 20 | 客户端桥接壳：仅承载 dsh.client 加载路径指向 lib/client.js（apply 空实现） |
| plugins/dsh-extra-plan/lib/client.js | 312 | dsh web 设置界面 UI（__ModuleLoader__ 打包格式，函数级索引不可用；中/英文案，React） |
| plugins/dsh-extra-plan/lib/executor-spawn.js | 90 | 执行者子代理 provider：委托宿主 spawn，注入工具 deny（防委派递归/追问） |
| plugins/dsh-extra-plan/lib/preset-settings.js | 439 | （待补充） |
| plugins/dsh-extra-plan/lib/preset-sync.js | 290 | 预设资产自动下发同步（distHash 比对，幂等） |
| plugins/dsh-extra-plan/lib/settings.js | 166 | 设置页后端 HTTP API（pro-config；qqbot 相关已随精简版插件移除） |
| plugins/dsh-extra-plan/scripts/distribute-preset.mjs | 41 | 预设分发脚本（安装/更新时写 DSH_HOME/.agent-presets/extra-plan） |
| plugins/dsh-qqbot-user-questions/index.js | 23 | qqbot 精简版自愈插件：apply 启动时自愈（补行+建链），不阻断启动 |
| plugins/dsh-qqbot-user-questions/lib/heal.js | 273 | 自愈纯函数模块（定位 profile/幂等补行/建链；供 index.js/CLI/测试复用） |
| plugins/dsh-qqbot-user-questions/scripts/heal.mjs | 27 | CLI 兜底入口（postinstall/手动触发；invokedAsMain 判定） |

## 函数索引

| 文件 | 函数 | 行号 | 功能描述 | 备注 |
|:--|:--|:--|:--|:--|
| plugins/dsh-extra-plan/index.js | routeDenyReason | L94-99 | 路由未确认时 write/edit/写shell 的拒绝文案（提示先做路由确认） |  |
| plugins/dsh-extra-plan/index.js | planDenyReason | L100-108 | plan 路由下 save_probe/subagent_plan 前置条件未满足的拒绝文案 |  |
| plugins/dsh-extra-plan/index.js | approvalDenyReason | L109-111 | 批准前禁止执行委派类工具（subagent/workflow/ralph）拒绝文案 |  |
| plugins/dsh-extra-plan/index.js | sessionEvents | L165-169 | 取 agent.session 事件快照（缺失兜底空数组） |  |
| plugins/dsh-extra-plan/index.js | isExplicitRoute | L173-179 | 设置页显式指定规划模型（与主会话不同）判断 |  |
| plugins/dsh-extra-plan/index.js | isExplicitEffort | L183-185 | 显式指定 reasoningEffort 判断 |  |
| plugins/dsh-extra-plan/index.js | isSubagentChild | L188-203 | 判定会话属于子代理（header.origin/delegationDepth/descriptor 三路探测） |  |
| plugins/dsh-extra-plan/index.js | isLiveDelegation | L207-218 | 子代理是否仍有存活父会话（live delegation）判定 |  |
| plugins/dsh-extra-plan/index.js | childPolicyNeedsFloor | L221-226 | 子代理沙箱策略需抬升为 workspace-write 的判定 |  |
| plugins/dsh-extra-plan/index.js | isBootstrapPhase | L229-236 | anchored 引导阶段判定（首个工具调用前） |  |
| plugins/dsh-extra-plan/index.js | commandTextOf | L241-253 | 从 exec.arguments 提取 shell 命令原文（字符串/parsed 兼容） |  |
| plugins/dsh-extra-plan/index.js | pwshCommandOf | L254 | 提取 pwsh 命令文本 |  |
| plugins/dsh-extra-plan/index.js | bashCommandOf | L255 | 提取 bash 命令文本 |  |
| plugins/dsh-extra-plan/index.js | mutationMatches | L256-259 | 命令命中写操作拒绝正则判定 |  |
| plugins/dsh-extra-plan/index.js | pwshMutationMatches | L260 | pwsh 写操作判定（调 mutationMatches） |  |
| plugins/dsh-extra-plan/index.js | bashMutationMatches | L261 | bash 写操作判定（调 mutationMatches） |  |
| plugins/dsh-extra-plan/index.js | runCodeTextOf | L264-268 | 提取 run_code 的 code 参数文本 |  |
| plugins/dsh-extra-plan/index.js | codeMutationHints | L271-279 | 对文本扫描 RUNCODE_MUTATION_HINTS 返回命中写暗示 id 列表 |  |
| plugins/dsh-extra-plan/index.js | labelsOfCallData | L283-299 | 从 ask 调用数据提取选项 label 集合 |  |
| plugins/dsh-extra-plan/index.js | normalizeLabel | L311-313 | label 规范化（空白清理） |  |
| plugins/dsh-extra-plan/index.js | isExactGateSet | L316-323 | label 集合与闸门常量集完全一致判定 |  |
| plugins/dsh-extra-plan/index.js | isPartialGateSet | L326-334 | label 与闸门词部分包含判定 |  |
| plugins/dsh-extra-plan/index.js | categorizeGateAsk | L337-341 | ask 分类（standard/malformed/ordinary） |  |
| plugins/dsh-extra-plan/index.js | gateAskDenyReason | L344-371 | 生成标准闸门 ask 选项/结构错误的拒绝理由 |  |
| plugins/dsh-extra-plan/index.js | validateGateAskStructure | L377-394 | 校验路由/批准 ask 结构（问题数、固定选项、修改意见） |  |
| plugins/dsh-extra-plan/index.js | askKindOf | L401-413 | 从 label 判定 ask 类型（route/approve） |  |
| plugins/dsh-extra-plan/index.js | askKindOfRelaxed | L419-432 | 宽松判定 ask 类型（特异性词优先） |  |
| plugins/dsh-extra-plan/index.js | matchRouteLabel | L434-443 | 用户选择标签→direct/plan/disagree |  |
| plugins/dsh-extra-plan/index.js | matchApprovalLabel | L445-454 | 用户选择标签→approve/replan/disagree |  |
| plugins/dsh-extra-plan/index.js | parseAskResultData | L460-495 | tool/result 解析用户选择（answers.selected） |  |
| plugins/dsh-extra-plan/index.js | parseDispatchAskResult | L503-529 | code-dispatch 的 ask 结果解析（含 error 分支） |  |
| plugins/dsh-extra-plan/index.js | deriveFlowState | L536-616 | 事件流推导 flow state（route/clarified/approved/channelBroken） |  |
| plugins/dsh-extra-plan/index.js | plannerChildIdsOf | L621-671 | 事件流收集规划子代理会话 id |  |
| plugins/dsh-extra-plan/index.js | toolCallCount | L679-706 | 统计成功工具调用次数（可跳过指定工具） |  |
| plugins/dsh-extra-plan/index.js | toolCallsSinceUser | L713-728 | 最近一次用户/协调者消息之后的工具调用数 |  |
| plugins/dsh-extra-plan/index.js | jobOutputCallsForJob | L733-760 | 锚点后对指定 job 的 job_output 调用计数 |  |
| plugins/dsh-extra-plan/index.js | appendSuffixBlock | L767-784 | 给 user 消息追加文本块（拼入第一个 text 块尾部） |  |
| plugins/dsh-extra-plan/index.js | withPlannerPromptSuffix | L785-794 | 拼接规划子代理附加引导 |  |
| plugins/dsh-extra-plan/index.js | budgetNoticeText | L801-803 | 开局预算提示文案（本轮探查预算上限 N 次） |  |
| plugins/dsh-extra-plan/index.js | withBudgetNotice | L807 | 预算提示拼接进消息 |  |
| plugins/dsh-extra-plan/index.js | budgetReminderText | L810-814 | 剩余≤3次提醒文案 |  |
| plugins/dsh-extra-plan/index.js | budgetReminderMessage | L817-819 | 剩余提醒消息构造 |  |
| plugins/dsh-extra-plan/index.js | budgetReminderSent | L823-846 | 本锚点是否已注入剩余提醒（防重复注入） |  |
| plugins/dsh-extra-plan/index.js | budgetExhaustedReason | L850-852 | 预算耗尽文案（已用 x/y） |  |
| plugins/dsh-extra-plan/index.js | budgetExceeded | L855-857 | used+1 超预算判定 |  |
| plugins/dsh-extra-plan/index.js | sanitizeTaskName | L862-870 | 任务名净化（截断/去非法字符） |  |
| plugins/dsh-extra-plan/index.js | timestamp | L873-877 | 时间戳 yyyyMMddHHmmss |  |
| plugins/dsh-extra-plan/index.js | pad | L875-886 | 数字补零（timestamp 内部闭包） |  |
| plugins/dsh-extra-plan/index.js | renderSavePlan | L884-886 | save_plan 结果渲染（路径数组→文本） |  |
| plugins/dsh-extra-plan/index.js | validateProbe | L919-1018 | save_probe 参数校验（四字段上限/path 存在/evidence 规则） |  |
| plugins/dsh-extra-plan/index.js | probePathOf | L1021-1024 | 相对路径按 cwd 解析绝对路径 |  |
| plugins/dsh-extra-plan/index.js | renderProbeMarkdown | L1028-1069 | save_probe Markdown 渲染（线索/证据报告） |  |
| plugins/dsh-extra-plan/index.js | extractProbeEvidenceRefs | L1074-1082 | 方案文本提取【探查者已核实】证据引用路径 |  |
| plugins/dsh-extra-plan/index.js | renderSaveProbe | L1086-1088 | save_probe 输出渲染 |  |
| plugins/dsh-extra-plan/index.js | catalogHasWriteTools | L1092-1097 | 工具目录是否含写工具判定 |  |
| plugins/dsh-extra-plan/index.js | isReadOnlyChildByCatalog | L1100-1102 | 按工具目录判定只读子代理 |  |
| plugins/dsh-extra-plan/index.js | schemasHasWriteTools | L1107-1112 | schemas 数组是否含写工具 |  |
| plugins/dsh-extra-plan/index.js | schemasHasTool | L1116-1121 | schemas 是否含指定工具 |  |
| plugins/dsh-extra-plan/index.js | catalogIsCollapsed | L1128-1133 | 工具目录折叠为单工具判定（run_code/仅shell） |  |
| plugins/dsh-extra-plan/index.js | resolveProbeRequestInjection | L1143-1227 | 探查者请求注入解析（上溯父会话配置） |  |
| plugins/dsh-extra-plan/index.js | maskCodeLiteralsAndComments | L1238-1276 | 遮蔽字符串/注释为空格（括号配平用） |  |
| plugins/dsh-extra-plan/index.js | sliceBalancedArgs | L1281-1297 | 从括号起配平切片参数原文 |  |
| plugins/dsh-extra-plan/index.js | decomposeRunCode | L1308-1437 | 静态拆解 run_code 的 code 为工具成员组（含裸写伪工具） |  |
| plugins/dsh-extra-plan/index.js | addMember | L1317-1331 | 成员去重添加（decomposeRunCode 内部闭包） |  |
| plugins/dsh-extra-plan/index.js | markRange | L1332-1334 | 标记已占用区间（decomposeRunCode 内部闭包） |  |
| plugins/dsh-extra-plan/index.js | isIdChar | L1335-1424 | 标识符字符判定（decomposeRunCode 内部闭包） |  |
| plugins/dsh-extra-plan/index.js | runCodeCatchGateReason | L1444-1657 | 多调用容错硬闸门纯函数：run_code code 内 tools.* 调用点（未去重、含多行/动态访问，裸写不计）≥2 时要求每点独立容错（独立 try/catch / allSettled([...]) / .catch 链），不足返回教学式拒绝文案；单调用豁免、嵌套 run_code 展平、静态失败保守按未保护 |  |
| plugins/dsh-extra-plan/index.js | collectRunCodeSites | L1662-1745 | run_code code 调用点收集（自 runCodeCatchGateReason 局部 collectSites 逐字提升为模块顶层）：字符串/注释跳过、tools./tools['lit']/tools[var] 三类调用点、sliceBalancedArgs 配平，返回 {start,end,innerText,name} 数组 |  |
| plugins/dsh-extra-plan/index.js | runCodeSiteCount | L1749-1767 | run_code code 静态调用点计数（单实例上限快路径，planner 专属）：run_code 调用点本身不计、参数 JSON 可解析时递归展开 args.code（展平口径）；其余调用点各计 1 |  |
| plugins/dsh-extra-plan/index.js | isRunCodeSubCall | L1771-1776 | 子调用语义判定：exec.sub===true（组判定合成成员）或 exec.parent!==undefined（运行时嵌套，与官方 dsh-tools nested 判定同口径）→ true；其余 false |  |
| plugins/dsh-extra-plan/index.js | runCodeDispatchCapText | L1779-1781 | 单实例子调用超限文案（T3 逐字）：rootCallId 实例子调用数超过 exploreBudget 上限的拒绝文案，listener 运行时检查与纯函数共用 |  |
| plugins/dsh-extra-plan/index.js | runCodeDispatchGateReason | L1786-1800 | 运行时单实例上限判定（planner 专属）：统计 events 中 rootCallId===rid 的 code-dispatch-start 条数，count>cap 返回 T3 文案；否则 null（rootCallId 非 string/events 非数组/cap 非正整数 → null） |  |
| plugins/dsh-extra-plan/index.js | subagentProbeGateReason | L1804-1816 | 探查者分支闸门（run_in_background 必 true + planner 预算） |  |
| plugins/dsh-extra-plan/index.js | plannerGateReason | L1819-1837 | 规划子代理分支闸门（write/edit/pwsh/bash 写禁 + 预算） |  |
| plugins/dsh-extra-plan/index.js | childReadonlyGateReason | L1840-1852 | 子代理只读分支闸门（探查者/验收者差异化文案；不含 run_code） |  |
| plugins/dsh-extra-plan/index.js | jobOutputGateReason | L1857-1879 | job_output 全角色闸门纯函数：wait:true 禁令 + 同 job 重复调用查重（内存计数器）；counters 缺省或 vExec 无 agent（组判定成员）时跳过查重、wait 检查照常 |  |
| plugins/dsh-extra-plan/index.js | probeDisposalWarning | L1885-1888 | 探查者级联中止告警纯函数：剩余未认领探查者委派数为正整数时返回告警文案（owner disposed + 引擎限制指向官方包）；非正整数返回 null |  |
| plugins/dsh-extra-plan/index.js | mainGateReason | L1895-2006 | 主会话闸门主分支（ask/write/edit/cordis/plan/probe/subagent/run_code/job_output） |  |
| plugins/dsh-extra-plan/index.js | runCodeGroupDenyReason | L2016-2092 | run_code 组判定：拆解→成员逐判定→聚合拒绝；预算耗尽白名单把关 |  |
| plugins/dsh-extra-plan/index.js | visit | L2033-2069 | 递归展平嵌套 run_code（runCodeGroupDenyReason 内闭包） |  |
| plugins/dsh-extra-plan/index.js | aggregateRunCodeDenyReason | L2098-2110 | 聚合多成员拒绝消息 |  |
| plugins/dsh-extra-plan/index.js | apply | L2206-3131 | 插件主入口：配置解析/服务注册/工具注册/锚点钩子 |  |
| plugins/dsh-extra-plan/index.js | foldUsage | L2234-2308 | usage 账本折叠写入（cursor 去重，按 sessionId+seq） |  |
| plugins/dsh-extra-plan/index.js | isChild | L2313-2321 | 子代理判定（live 校验+误分类警示） |  |
| plugins/dsh-extra-plan/index.js | isPlannerChild | L2325-2339 | 规划子代理判定（descriptor.mode=continuable） |  |
| plugins/dsh-extra-plan/index.js | toolSchemasOf | L2344-2362 | 防御式获取 agent 工具 schemas |  |
| plugins/dsh-extra-plan/index.js | resolvePlannerEntry | L2379-2413 | 规划子代理模型单点解析（plannerModel 优先+父会话配置，带缓存） |  |
| plugins/dsh-extra-plan/index.js | parseSkillFrontmatter | L2457-2466 | SKILL.md frontmatter 的 name/description 解析 |  |
| plugins/dsh-extra-plan/index.js | floorChildPolicy | L2468-2472 | 子代理沙箱策略抬升（workspace-write） |  |
| plugins/dsh-extra-plan/index.js | childBaseline | L2474-2480 | 子代理基线（判定/usage/floor 汇总） |  |
| plugins/dsh-extra-plan/index.js | atomicCommit | L2489-2503 | 原子落盘（tmp→journal→rename→清 journal；save_plan 双写/save_probe 单写共用） |  |
| plugins/dsh-extra-plan/index.js | recoverJournals | L2507-2531 | journal 崩溃自愈（新旧形状兼容） |  |
| plugins/dsh-extra-plan/index.js | defineSavePlan | L2533-2596 | save_plan 工具定义（双写必填/证据引用校验） |  |
| plugins/dsh-extra-plan/index.js | registerTool | L2600-2613 | 工具注册分发 |  |
| plugins/dsh-extra-plan/index.js | registerSavePlan | L2616 | save_plan 注册（仅规划子代理层） |  |
| plugins/dsh-extra-plan/index.js | defineSaveProbe | L2621-2734 | save_probe 工具定义 |  |
| plugins/dsh-extra-plan/index.js | registerSaveProbe | L2737 | save_probe 注册（主会话/探查者/规划子代理按判定） |  |
| plugins/dsh-extra-plan/index.js | probeClaimFor | L2745-2759 | 探查子代理预算暂记查核（probe claims） |  |
| plugins/dsh-extra-plan/index.js | causeChainOf | L2806-2818 | 拒绝原因链解析（子代理继承根因） |  |
| plugins/dsh-extra-plan/index.js | recordRequestError | L2819-2841 | 记录请求错误诊断到临时目录 |  |
| plugins/dsh-extra-plan/lib/client-bridge.js | apply | L17-19 | 空实现（仅承载 dsh.client 加载路径指向 lib/client.js） |  |
| plugins/dsh-extra-plan/lib/executor-spawn.js | apply | L49-89 | 插件入口：注册执行者 provider（委托宿主 spawn，注入 deny 工具裁剪） |  |
| plugins/dsh-extra-plan/lib/executor-spawn.js | defaultedAgentOptions | L69-73 | 执行者 agentOptions 透传（请求自带优先，否则空对象继承父会话） |  |
| plugins/dsh-extra-plan/lib/preset-settings.js | loadYaml | L9-22 | （待补充） |  |
| plugins/dsh-extra-plan/lib/preset-settings.js | isNonEmptyString | L34-56 | （待补充） |  |
| plugins/dsh-extra-plan/lib/preset-settings.js | isString | L35-56 | （待补充） |  |
| plugins/dsh-extra-plan/lib/preset-settings.js | isPositiveInteger | L36-56 | （待补充） |  |
| plugins/dsh-extra-plan/lib/preset-settings.js | isBoolean | L37-56 | （待补充） |  |
| plugins/dsh-extra-plan/lib/preset-settings.js | isMode | L39-56 | （待补充） |  |
| plugins/dsh-extra-plan/lib/preset-settings.js | setting | L41-56 | （待补充） |  |
| plugins/dsh-extra-plan/lib/preset-settings.js | getSettingDefinition | L103-105 | （待补充） |  |
| plugins/dsh-extra-plan/lib/preset-settings.js | parsePresetYaml | L107-109 | （待补充） |  |
| plugins/dsh-extra-plan/lib/preset-settings.js | hasOwn | L111-113 | （待补充） |  |
| plugins/dsh-extra-plan/lib/preset-settings.js | pathParts | L115-117 | （待补充） |  |
| plugins/dsh-extra-plan/lib/preset-settings.js | readPath | L119-126 | （待补充） |  |
| plugins/dsh-extra-plan/lib/preset-settings.js | rowsById | L128-143 | （待补充） |  |
| plugins/dsh-extra-plan/lib/preset-settings.js | visit | L131-140 | （待补充） |  |
| plugins/dsh-extra-plan/lib/preset-settings.js | resolveLocator | L145-152 | （待补充） |  |
| plugins/dsh-extra-plan/lib/preset-settings.js | resolveSetting | L154 | （待补充） |  |
| plugins/dsh-extra-plan/lib/preset-settings.js | validateSettingValue | L169-171 | （待补充） |  |
| plugins/dsh-extra-plan/lib/preset-settings.js | normalizeSettingValue | L173-175 | （待补充） |  |
| plugins/dsh-extra-plan/lib/preset-settings.js | captureSettings | L177-192 | （待补充） |  |
| plugins/dsh-extra-plan/lib/preset-settings.js | inlineCommentIndex | L196-214 | （待补充） |  |
| plugins/dsh-extra-plan/lib/preset-settings.js | lineIndent | L216-219 | （待补充） |  |
| plugins/dsh-extra-plan/lib/preset-settings.js | withoutCr | L221-223 | （待补充） |  |
| plugins/dsh-extra-plan/lib/preset-settings.js | parseRowId | L225-237 | （待补充） |  |
| plugins/dsh-extra-plan/lib/preset-settings.js | token | L231-235 | （待补充） |  |
| plugins/dsh-extra-plan/lib/preset-settings.js | parseMapKey | L239-243 | （待补充） |  |
| plugins/dsh-extra-plan/lib/preset-settings.js | rowEnd | L245-253 | （待补充） |  |
| plugins/dsh-extra-plan/lib/preset-settings.js | findDirectKey | L255-273 | （待补充） |  |
| plugins/dsh-extra-plan/lib/preset-settings.js | textPathLine | L275-287 | （待补充） |  |
| plugins/dsh-extra-plan/lib/preset-settings.js | findTextLocatorMatches | L289-300 | （待补充） |  |
| plugins/dsh-extra-plan/lib/preset-settings.js | yamlString | L302-439 | （待补充） |  |
| plugins/dsh-extra-plan/lib/preset-settings.js | serializeScalar | L308 | （待补充） |  |
| plugins/dsh-extra-plan/lib/preset-settings.js | escapeRegex | L314 | （待补充） |  |
| plugins/dsh-extra-plan/lib/preset-settings.js | replaceLineScalar | L318 | （待补充） |  |
| plugins/dsh-extra-plan/lib/preset-settings.js | leading | L327 | （待补充） |  |
| plugins/dsh-extra-plan/lib/preset-settings.js | trailing | L328 | （待补充） |  |
| plugins/dsh-extra-plan/lib/preset-settings.js | isBlockScalarLine | L332 | （待补充） |  |
| plugins/dsh-extra-plan/lib/preset-settings.js | token | L340 | （待补充） |  |
| plugins/dsh-extra-plan/lib/preset-settings.js | locatorFor | L344 | （待补充） |  |
| plugins/dsh-extra-plan/lib/preset-settings.js | scalarTypeFor | L349 | （待补充） |  |
| plugins/dsh-extra-plan/lib/preset-settings.js | patchYamlScalar | L354 | （待补充） |  |
| plugins/dsh-extra-plan/lib/preset-settings.js | patchFirstYamlScalar | L382 | （待补充） |  |
| plugins/dsh-extra-plan/lib/preset-settings.js | publicSettingMetadata | L384 | （待补充） |  |
| plugins/dsh-extra-plan/lib/preset-settings.js | settingsFileValues | L420 | （待补充） |  |
| plugins/dsh-extra-plan/lib/preset-settings.js | yamlFileExists | L432 | （待补充） |  |
| plugins/dsh-extra-plan/lib/preset-settings.js | readYamlFile | L436 | （待补充） |  |
| plugins/dsh-extra-plan/lib/preset-sync.js | contentHash | L35-43 | 预设资产内容哈希 |  |
| plugins/dsh-extra-plan/lib/preset-sync.js | readManifestRecord | L45-56 | （待补充） |  |
| plugins/dsh-extra-plan/lib/preset-sync.js | readManifest | L59-62 | 读 dist-manifest.json |  |
| plugins/dsh-extra-plan/lib/preset-sync.js | emptyMigration | L64-74 | （待补充） |  |
| plugins/dsh-extra-plan/lib/preset-sync.js | capturePrevious | L76-102 | （待补充） |  |
| plugins/dsh-extra-plan/lib/preset-sync.js | reasonForOldState | L104-109 | （待补充） |  |
| plugins/dsh-extra-plan/lib/preset-sync.js | reasonForNewState | L111-113 | （待补充） |  |
| plugins/dsh-extra-plan/lib/preset-sync.js | stagePreset | L115-168 | （待补充） |  |
| plugins/dsh-extra-plan/lib/preset-sync.js | cleanupPath | L170-172 | （待补充） |  |
| plugins/dsh-extra-plan/lib/preset-sync.js | switchStage | L176-197 | （待补充） |  |
| plugins/dsh-extra-plan/lib/preset-sync.js | publishStage | L199-201 | （待补充） |  |
| plugins/dsh-extra-plan/lib/preset-sync.js | cleanupLegacyFlashGuidePatches | L207-233 | 清理旧 flash-guide 补丁条目 |  |
| plugins/dsh-extra-plan/lib/preset-sync.js | noSourcePrevious | L235-237 | （待补充） |  |
| plugins/dsh-extra-plan/lib/preset-sync.js | writeFull | L240-248 | 全量下发预设目录（tmp+rename） |  |
| plugins/dsh-extra-plan/lib/preset-sync.js | syncPreset | L254-275 | 预设同步判定（hash 比对→下发/跳过） |  |
| plugins/dsh-extra-plan/lib/preset-sync.js | apply | L280-289 | 插件入口（启动时 syncPreset） |  |
| plugins/dsh-extra-plan/lib/settings.js | dshHomeDir | L29-33 | DSH_HOME 解析（环境变量优先） |  |
| plugins/dsh-extra-plan/lib/settings.js | agentCordisPath | L35-37 | agent.cordis.yml 路径 |  |
| plugins/dsh-extra-plan/lib/settings.js | isLoopback | L39-42 | 环回地址判定（API 仅本机） |  |
| plugins/dsh-extra-plan/lib/settings.js | json | L44-47 | HTTP JSON 响应 |  |
| plugins/dsh-extra-plan/lib/settings.js | readJsonBody | L49-67 | 读取请求体（限 1MB） |  |
| plugins/dsh-extra-plan/lib/settings.js | readAgentMetadata | L69-74 | （待补充） |  |
| plugins/dsh-extra-plan/lib/settings.js | proPayload | L76-79 | （待补充） |  |
| plugins/dsh-extra-plan/lib/settings.js | writeTextAtomic | L81-92 | 原子写文件（tmp+rename） |  |
| plugins/dsh-extra-plan/lib/settings.js | patchManagedFile | L94-102 | （待补充） |  |
| plugins/dsh-extra-plan/lib/settings.js | createApiHandler | L104-152 | 设置页 HTTP API（GET/PUT pro-config、qqbot 状态/配置） |  |
| plugins/dsh-extra-plan/lib/settings.js | apply | L154-165 | 插件入口（HTTP 服务注册） |  |
| plugins/dsh-extra-plan/scripts/distribute-preset.mjs | messageFor | L9-13 | （待补充） |  |
| plugins/dsh-extra-plan/scripts/distribute-preset.mjs | distribute | L16-21 | 预设分发（hash 比对→写 DSH_HOME/.agent-presets/extra-plan） |  |
| plugins/dsh-extra-plan/scripts/distribute-preset.mjs | invokedAsMain | L23-28 | 主脚本判定（node 直跑时执行 distribute） |  |
| plugins/dsh-qqbot-user-questions/index.js | apply | L13-22 | 插件入口：apply 启动时调 healQqbotCompatibility 自愈（补行+建链；try/catch 不阻断启动） |  |
| plugins/dsh-qqbot-user-questions/lib/heal.js | loadYamlModule | L42-58 | js-yaml 双 fallback 加载（本地 createRequire 失败回退官方 APPDATA DSH 包）；惰性缓存，导入零副作用 |  |
| plugins/dsh-qqbot-user-questions/lib/heal.js | timestamp | L60-64 | 时间戳 yyyyMMddHHmmssSSS（备份文件名唯一性，含毫秒） |  |
| plugins/dsh-qqbot-user-questions/lib/heal.js | pad | L62-69 | 数字补零（timestamp 内部闭包） |  |
| plugins/dsh-qqbot-user-questions/lib/heal.js | idLinePattern | L67-69 | 幂等同 id 行正则（任意缩进、容错引号，镜像旧版补丁脚本 L53） |  |
| plugins/dsh-qqbot-user-questions/lib/heal.js | treeHasId | L71-80 | 递归遍历 YAML 解析树验证目标 id 是否存在（写后校验） |  |
| plugins/dsh-qqbot-user-questions/lib/heal.js | lineLevelCheck | L83-102 | 行级自检（js-yaml 不可得时兜底）：目标 id 行存在且各自条目块含必需子行（块闭合） |  |
| plugins/dsh-qqbot-user-questions/lib/heal.js | verifyPatchEntries | L104-115 | 写后校验：js-yaml 解析优先（双 fallback），不可得时行级自检兜底 |  |
| plugins/dsh-qqbot-user-questions/lib/heal.js | joinedBlock | L117-123 | 目标条目块序列化（缩进前缀 + 尾部换行） |  |
| plugins/dsh-qqbot-user-questions/lib/heal.js | mergeMissingEntries | L125-143 | 合并缺失条目：[] 空数组行以该行缩进替换 / 无 [] 末尾追加（保证一个换行分隔，镜像旧脚本 L56） |  |
| plugins/dsh-qqbot-user-questions/lib/heal.js | findOwnQqbotProfiles | L151-171 | 扫描 $DSH_HOME/profiles/* 锚定装了本插件的 qqbot profile（① bundles 含 @tencent-connect/dsh-qqbot ② node_modules/@local/dsh-qqbot-user-questions 存在） |  |
| plugins/dsh-qqbot-user-questions/lib/heal.js | healPatchRows | L180-215 | 幂等补 cordis.patch.yml 两行（code-runtime/agent-presets）；写前 .bak-* 备份、写后校验失败恢复；文件不存在跳过 |  |
| plugins/dsh-qqbot-user-questions/lib/heal.js | ensureDshExtraPlanLink | L223-253 | 建 @local/dsh-extra-plan → web 包链接：web 缺失跳过/已正确不动/实体或非目标链接提示 pnpm 迁移/仅 ENOENT 建 junction |  |
| plugins/dsh-qqbot-user-questions/lib/heal.js | healQqbotCompatibility | L259-272 | 对每个自有 profile 先补行再建链；整体 try/catch 只记录日志不阻断 |  |
| plugins/dsh-qqbot-user-questions/scripts/heal.mjs | invokedAsMain | L9-14 | 主脚本判定（node 直跑时执行自愈；镜像 distribute-preset.mjs L23-30） |  |

---

*本文件由脚本增量维护；直接编辑功能描述/备注列是安全的。*
