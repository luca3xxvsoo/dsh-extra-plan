# 代码地图（dsh-extra-plan）

> **维护分工**：行号区间/增删行由脚本 node pe-test/tools/代码地图生成.mjs 增量同步；**功能描述与备注由 AI/人维护**（脚本刷新不会覆盖）。
> **用法**：AI 定位功能时先在此表按关键词检索函数名/描述，再 read 目标行号区间；函数描述为空（待补充）时请补写。
> 上次同步：2026-09-08 13:49:26（脚本自动更新时间戳行）

## 文件总览

| 文件 | 行数 | 说明 |
|:--|--:|:--|
| plugins/dsh-extra-plan/index.js | 3200 | 模式核心：三级闸门（路由/澄清/批准）+ 探查预算 + save_plan/save_probe/show_file 工具 + 锚点钩子（修改最频繁） |
| plugins/dsh-extra-plan/lib/client-bridge.js | 20 | 客户端桥接壳：仅承载 dsh.client 加载路径指向 lib/client.js（apply 空实现） |
| plugins/dsh-extra-plan/lib/client.js | 428 | dsh web 设置界面 UI（__ModuleLoader__ 打包格式，函数级索引不可用；中/英文案，React） |
| plugins/dsh-extra-plan/lib/executor-spawn.js | 90 | 执行者子代理 provider：委托宿主 spawn，注入工具 deny（防委派递归/追问） |
| plugins/dsh-extra-plan/lib/preset-settings.js | 439 | （待补充） |
| plugins/dsh-extra-plan/lib/preset-sync.js | 290 | 预设资产自动下发同步（distHash 比对，幂等） |
| plugins/dsh-extra-plan/lib/settings.js | 256 | 设置页后端 HTTP API：pro-config/qqbot 状态与配置 |
| plugins/dsh-extra-plan/scripts/distribute-preset.mjs | 41 | 预设分发脚本（安装/更新时写 DSH_HOME/.agent-presets/extra-plan） |
| plugins/dsh-qqbot-user-questions/index.js | 426 | QQbot 兼容插件：文字列表 ask 问答 + /优先对话 边界插入 + 审批流 |
| plugins/dsh-qqbot-user-questions/patches/@tencent-connect-dsh-qqbot/dist/gateway/bootstrap.js | 75 | qqbot gateway 补丁（最小 ctx.provide 注入；与 .orig 备份配套） |
| plugins/dsh-qqbot-user-questions/patches/@tencent-connect-dsh-qqbot/dist/transport/outbound.js | 143 | qqbot transport 补丁（show_file 出站放行；与 .orig 备份配套） |
| plugins/dsh-qqbot-user-questions/scripts/apply-patch.mjs | 111 | 补丁分发脚本：备份 .orig → 覆写补丁 → cordis.patch 合并（幂等） |
| plugins/dsh-qqbot-user-questions/scripts/ensure-dsh-extra-plan-link.mjs | 44 | qqbot 核心包映射到 web 的共享建链实现（postinstall 与运行时兜底共用） |

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
| plugins/dsh-extra-plan/index.js | withPlannerPromptSuffix | L785 | 拼接规划子代理附加引导 |  |
| plugins/dsh-extra-plan/index.js | budgetNoticeText | L792-794 | 开局预算提示文案（本轮探查预算上限 N 次） |  |
| plugins/dsh-extra-plan/index.js | withBudgetNotice | L798 | 预算提示拼接进消息 |  |
| plugins/dsh-extra-plan/index.js | budgetReminderText | L801-805 | 剩余≤3次提醒文案 |  |
| plugins/dsh-extra-plan/index.js | budgetReminderMessage | L808-810 | 剩余提醒消息构造 |  |
| plugins/dsh-extra-plan/index.js | budgetReminderSent | L814-837 | 本锚点是否已注入剩余提醒（防重复注入） |  |
| plugins/dsh-extra-plan/index.js | budgetExhaustedReason | L841-843 | 预算耗尽文案（已用 x/y） |  |
| plugins/dsh-extra-plan/index.js | budgetExceeded | L846-848 | used+1 超预算判定 |  |
| plugins/dsh-extra-plan/index.js | sanitizeTaskName | L853-861 | 任务名净化（截断/去非法字符） |  |
| plugins/dsh-extra-plan/index.js | timestamp | L864-868 | 时间戳 yyyyMMddHHmmss |  |
| plugins/dsh-extra-plan/index.js | pad | L866-877 | 数字补零（timestamp 内部闭包） |  |
| plugins/dsh-extra-plan/index.js | renderSavePlan | L875-877 | save_plan 结果渲染（路径数组→文本） |  |
| plugins/dsh-extra-plan/index.js | validateProbe | L915-1014 | save_probe 参数校验（四字段上限/path 存在/evidence 规则） |  |
| plugins/dsh-extra-plan/index.js | probePathOf | L1017-1020 | 相对路径按 cwd 解析绝对路径 |  |
| plugins/dsh-extra-plan/index.js | renderProbeMarkdown | L1024-1065 | save_probe Markdown 渲染（线索/证据报告） |  |
| plugins/dsh-extra-plan/index.js | extractProbeEvidenceRefs | L1070-1078 | 方案文本提取【探查者已核实】证据引用路径 |  |
| plugins/dsh-extra-plan/index.js | renderSaveProbe | L1082-1084 | save_probe 输出渲染 |  |
| plugins/dsh-extra-plan/index.js | catalogHasWriteTools | L1088-1093 | 工具目录是否含写工具判定 |  |
| plugins/dsh-extra-plan/index.js | isReadOnlyChildByCatalog | L1096-1098 | 按工具目录判定只读子代理 |  |
| plugins/dsh-extra-plan/index.js | schemasHasWriteTools | L1103-1108 | schemas 数组是否含写工具 |  |
| plugins/dsh-extra-plan/index.js | schemasHasTool | L1112-1117 | schemas 是否含指定工具 |  |
| plugins/dsh-extra-plan/index.js | catalogIsCollapsed | L1124-1129 | 工具目录折叠为单工具判定（run_code/仅shell） |  |
| plugins/dsh-extra-plan/index.js | resolveProbeRequestInjection | L1139-1223 | 探查者请求注入解析（上溯父会话配置） |  |
| plugins/dsh-extra-plan/index.js | maskCodeLiteralsAndComments | L1234-1272 | 遮蔽字符串/注释为空格（括号配平用） |  |
| plugins/dsh-extra-plan/index.js | sliceBalancedArgs | L1277-1293 | 从括号起配平切片参数原文 |  |
| plugins/dsh-extra-plan/index.js | decomposeRunCode | L1304-1433 | 静态拆解 run_code 的 code 为工具成员组（含裸写伪工具） |  |
| plugins/dsh-extra-plan/index.js | addMember | L1313-1327 | 成员去重添加（decomposeRunCode 内部闭包） |  |
| plugins/dsh-extra-plan/index.js | markRange | L1328-1330 | 标记已占用区间（decomposeRunCode 内部闭包） |  |
| plugins/dsh-extra-plan/index.js | isIdChar | L1331-1420 | 标识符字符判定（decomposeRunCode 内部闭包） |  |
| plugins/dsh-extra-plan/index.js | runCodeCatchGateReason | L1440-1653 | 多调用容错硬闸门纯函数：run_code code 内 tools.* 调用点（未去重、含多行/动态访问，裸写不计）≥2 时要求每点独立容错（独立 try/catch / allSettled([...]) / .catch 链），不足返回教学式拒绝文案；单调用豁免、嵌套 run_code 展平、静态失败保守按未保护 |  |
| plugins/dsh-extra-plan/index.js | collectRunCodeSites | L1658-1741 | run_code code 调用点收集（自 runCodeCatchGateReason 局部 collectSites 逐字提升为模块顶层）：字符串/注释跳过、tools./tools['lit']/tools[var] 三类调用点、sliceBalancedArgs 配平，返回 {start,end,innerText,name} 数组 |  |
| plugins/dsh-extra-plan/index.js | runCodeSiteCount | L1745-1763 | run_code code 静态调用点计数（单实例上限快路径，planner 专属）：run_code 调用点本身不计、参数 JSON 可解析时递归展开 args.code（展平口径）；其余调用点各计 1 |  |
| plugins/dsh-extra-plan/index.js | isRunCodeSubCall | L1767-1772 | 子调用语义判定：exec.sub===true（组判定合成成员）或 exec.parent!==undefined（运行时嵌套，与官方 dsh-tools nested 判定同口径）→ true；其余 false |  |
| plugins/dsh-extra-plan/index.js | runCodeDispatchCapText | L1775-1777 | 单实例子调用超限文案（T3 逐字）：rootCallId 实例子调用数超过 exploreBudget 上限的拒绝文案，listener 运行时检查与纯函数共用 |  |
| plugins/dsh-extra-plan/index.js | runCodeDispatchGateReason | L1782-1796 | 运行时单实例上限判定（planner 专属）：统计 events 中 rootCallId===rid 的 code-dispatch-start 条数，count>cap 返回 T3 文案；否则 null（rootCallId 非 string/events 非数组/cap 非正整数 → null） |  |
| plugins/dsh-extra-plan/index.js | subagentProbeGateReason | L1800-1812 | 探查者分支闸门（run_in_background 必 true + planner 预算） |  |
| plugins/dsh-extra-plan/index.js | plannerGateReason | L1815-1833 | 规划子代理分支闸门（write/edit/pwsh/bash 写禁 + 预算） |  |
| plugins/dsh-extra-plan/index.js | childReadonlyGateReason | L1836-1848 | 子代理只读分支闸门（探查者/验收者差异化文案；不含 run_code） |  |
| plugins/dsh-extra-plan/index.js | jobOutputGateReason | L1853-1875 | job_output 全角色闸门纯函数：wait:true 禁令 + 同 job 重复调用查重（内存计数器）；counters 缺省或 vExec 无 agent（组判定成员）时跳过查重、wait 检查照常 |  |
| plugins/dsh-extra-plan/index.js | probeDisposalWarning | L1881-1884 | 探查者级联中止告警纯函数：剩余未认领探查者委派数为正整数时返回告警文案（owner disposed + 引擎限制指向官方包）；非正整数返回 null |  |
| plugins/dsh-extra-plan/index.js | mainGateReason | L1891-2002 | 主会话闸门主分支（ask/write/edit/cordis/plan/probe/subagent/run_code/job_output） |  |
| plugins/dsh-extra-plan/index.js | runCodeGroupDenyReason | L2012-2088 | run_code 组判定：拆解→成员逐判定→聚合拒绝；预算耗尽白名单把关 |  |
| plugins/dsh-extra-plan/index.js | visit | L2029-2065 | 递归展平嵌套 run_code（runCodeGroupDenyReason 内闭包） |  |
| plugins/dsh-extra-plan/index.js | aggregateRunCodeDenyReason | L2094-2106 | 聚合多成员拒绝消息 |  |
| plugins/dsh-extra-plan/index.js | apply | L2202-3199 | 插件主入口：配置解析/服务注册/工具注册/锚点钩子 |  |
| plugins/dsh-extra-plan/index.js | foldUsage | L2231-2305 | usage 账本折叠写入（cursor 去重，按 sessionId+seq） |  |
| plugins/dsh-extra-plan/index.js | isChild | L2310-2318 | 子代理判定（live 校验+误分类警示） |  |
| plugins/dsh-extra-plan/index.js | isPlannerChild | L2322-2336 | 规划子代理判定（descriptor.mode=continuable） |  |
| plugins/dsh-extra-plan/index.js | toolSchemasOf | L2341-2359 | 防御式获取 agent 工具 schemas |  |
| plugins/dsh-extra-plan/index.js | resolvePlannerEntry | L2376-2410 | 规划子代理模型单点解析（plannerModel 优先+父会话配置，带缓存） |  |
| plugins/dsh-extra-plan/index.js | parseSkillFrontmatter | L2454-2463 | SKILL.md frontmatter 的 name/description 解析 |  |
| plugins/dsh-extra-plan/index.js | floorChildPolicy | L2465-2469 | 子代理沙箱策略抬升（workspace-write） |  |
| plugins/dsh-extra-plan/index.js | childBaseline | L2471-2477 | 子代理基线（判定/usage/floor 汇总） |  |
| plugins/dsh-extra-plan/index.js | atomicCommit | L2486-2500 | 原子落盘（tmp→journal→rename→清 journal；save_plan 双写/save_probe 单写共用） |  |
| plugins/dsh-extra-plan/index.js | recoverJournals | L2504-2528 | journal 崩溃自愈（新旧形状兼容） |  |
| plugins/dsh-extra-plan/index.js | defineSavePlan | L2530-2593 | save_plan 工具定义（双写必填/证据引用校验） |  |
| plugins/dsh-extra-plan/index.js | registerTool | L2597-2610 | 工具注册分发 |  |
| plugins/dsh-extra-plan/index.js | registerSavePlan | L2613 | save_plan 注册（仅规划子代理层） |  |
| plugins/dsh-extra-plan/index.js | defineSaveProbe | L2618-2731 | save_probe 工具定义 |  |
| plugins/dsh-extra-plan/index.js | registerSaveProbe | L2734 | save_probe 注册（主会话/探查者/规划子代理按判定） |  |
| plugins/dsh-extra-plan/index.js | matchWildcard | L2738-2741 | showFilePatterns 通配符匹配 |  |
| plugins/dsh-extra-plan/index.js | defineShowFile | L2742-2801 | show_file 工具定义（限方案/验收文件） |  |
| plugins/dsh-extra-plan/index.js | registerShowFile | L2803 | show_file 注册（仅主会话） |  |
| plugins/dsh-extra-plan/index.js | probeClaimFor | L2811-2825 | 探查子代理预算暂记查核（probe claims） |  |
| plugins/dsh-extra-plan/index.js | causeChainOf | L2874-2886 | 拒绝原因链解析（子代理继承根因） |  |
| plugins/dsh-extra-plan/index.js | recordRequestError | L2887-2909 | 记录请求错误诊断到临时目录 |  |
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
| plugins/dsh-extra-plan/lib/settings.js | dshHomeDir | L30-34 | DSH_HOME 解析（环境变量优先） |  |
| plugins/dsh-extra-plan/lib/settings.js | agentCordisPath | L36-38 | agent.cordis.yml 路径 |  |
| plugins/dsh-extra-plan/lib/settings.js | cordisPatchPath | L40-42 | cordis.patch.yml 路径 |  |
| plugins/dsh-extra-plan/lib/settings.js | qqbotDir | L44-46 | qqbot profile 目录 |  |
| plugins/dsh-extra-plan/lib/settings.js | qqbotUserQuestionsDir | L48-50 | qqbot 用户问题插件目录 |  |
| plugins/dsh-extra-plan/lib/settings.js | isLoopback | L52-55 | 环回地址判定（API 仅本机） |  |
| plugins/dsh-extra-plan/lib/settings.js | json | L57-60 | HTTP JSON 响应 |  |
| plugins/dsh-extra-plan/lib/settings.js | readJsonBody | L62-80 | 读取请求体（限 1MB） |  |
| plugins/dsh-extra-plan/lib/settings.js | readAgentMetadata | L82-87 | （待补充） |  |
| plugins/dsh-extra-plan/lib/settings.js | proPayload | L89-92 | （待补充） |  |
| plugins/dsh-extra-plan/lib/settings.js | writeTextAtomic | L94-105 | 原子写文件（tmp+rename） |  |
| plugins/dsh-extra-plan/lib/settings.js | patchManagedFile | L107-115 | （待补充） |  |
| plugins/dsh-extra-plan/lib/settings.js | readQqbotConfig | L117-131 | 读 qqbot-user-questions 配置 |  |
| plugins/dsh-extra-plan/lib/settings.js | checkQqbotStatus | L133-145 | qqbot 环境状态检查（目录/依赖/补丁） |  |
| plugins/dsh-extra-plan/lib/settings.js | qqbotPatchManagedField | L147-157 | （待补充） |  |
| plugins/dsh-extra-plan/lib/settings.js | createApiHandler | L159-242 | 设置页 HTTP API（GET/PUT pro-config、qqbot 状态/配置） |  |
| plugins/dsh-extra-plan/lib/settings.js | apply | L244-255 | 插件入口（HTTP 服务注册） |  |
| plugins/dsh-extra-plan/scripts/distribute-preset.mjs | messageFor | L9-13 | （待补充） |  |
| plugins/dsh-extra-plan/scripts/distribute-preset.mjs | distribute | L16-21 | 预设分发（hash 比对→写 DSH_HOME/.agent-presets/extra-plan） |  |
| plugins/dsh-extra-plan/scripts/distribute-preset.mjs | invokedAsMain | L23-28 | 主脚本判定（node 直跑时执行 distribute） |  |
| plugins/dsh-qqbot-user-questions/index.js | apply | L22-278 | 插件入口：消息中间件/ask 提供者/优先对话/审批流注册 |  |
| plugins/dsh-qqbot-user-questions/index.js | resolveRoot | L29-34 | 会话根目录解析（记忆库/会话目录） |  |
| plugins/dsh-qqbot-user-questions/index.js | providerAsk | L177-224 | ask_user_question 提供者（文字列表发 QQ+等待回复） |  |
| plugins/dsh-qqbot-user-questions/index.js | formatSingleQuestion | L288-307 | 单个问题文字列表格式化 |  |
| plugins/dsh-qqbot-user-questions/index.js | parseSingleAnswer | L317-338 | 用户数字/文字答案解析 |  |
| plugins/dsh-qqbot-user-questions/index.js | formatApprovalMessage | L344-359 | 审批消息格式化 |  |
| plugins/dsh-qqbot-user-questions/index.js | encodeSegment | L369-381 | 路径段编码（~ 转义，session 目录安全） |  |
| plugins/dsh-qqbot-user-questions/index.js | projectKey | L389-408 | 项目路径编码为可读键 |  |
| plugins/dsh-qqbot-user-questions/index.js | deleteSessionDir | L415-425 | 删除陈旧会话目录 |  |
| plugins/dsh-qqbot-user-questions/patches/@tencent-connect-dsh-qqbot/dist/gateway/bootstrap.js | bootstrapGateway | L6-74 | gateway 补丁：最小注入 ctx.provide 使 qqbot-user-questions 插件可挂载 |  |
| plugins/dsh-qqbot-user-questions/patches/@tencent-connect-dsh-qqbot/dist/transport/outbound.js | OutboundRouter | L10-132 | transport 补丁路由：放行 show_file 出站（方案/验收文件预览） |  |
| plugins/dsh-qqbot-user-questions/patches/@tencent-connect-dsh-qqbot/dist/transport/outbound.js | createOutboundHandler | L139-142 | 构造放行处理器（show_file 白名单判定） |  |
| plugins/dsh-qqbot-user-questions/scripts/apply-patch.mjs | sameContent | L38-41 | 两文件内容一致判定（补丁幂等） |  |
| plugins/dsh-qqbot-user-questions/scripts/apply-patch.mjs | ensureImQqbotEntry | L49-111 | 确保 im-qqbot 行存在（cordis.patch 对照写入） |  |
| plugins/dsh-qqbot-user-questions/scripts/apply-patch.mjs | idIndent | L78 | 条目 id 缩进定位 |  |
| plugins/dsh-qqbot-user-questions/scripts/ensure-dsh-extra-plan-link.mjs | ensureDshExtraPlanLink | L10-43 | （待补充） |  |

---

*本文件由脚本增量维护；直接编辑功能描述/备注列是安全的。*
