# 代码地图（dsh-extra-plan）

> **维护分工**：行号区间/增删行由脚本 node pe-test/tools/代码地图生成.mjs 增量同步；**功能描述与备注由 AI/人维护**（脚本刷新不会覆盖）。
> **用法**：AI 定位功能时先在此表按关键词检索函数名/描述，再 read 目标行号区间；函数描述为空（待补充）时请补写。
> 上次同步：2026-09-06 11:19:05（脚本自动更新时间戳行）

## 文件总览

| 文件 | 行数 | 说明 |
|:--|--:|:--|
| plugins/dsh-extra-plan/index.js | 3267 | 模式核心：三级闸门（路由/澄清/批准）+ 探查预算 + save_plan/save_probe/show_file 工具 + 锚点钩子（修改最频繁） |
| plugins/dsh-extra-plan/lib/client-bridge.js | 20 | 客户端桥接壳：仅承载 dsh.client 加载路径指向 lib/client.js（apply 空实现） |
| plugins/dsh-extra-plan/lib/client.js | 484 | dsh web 设置界面 UI（__ModuleLoader__ 打包格式，函数级索引不可用；中/英文案，React） |
| plugins/dsh-extra-plan/lib/executor-spawn.js | 90 | 执行者子代理 provider：委托宿主 spawn，注入工具 deny（防委派递归/追问） |
| plugins/dsh-extra-plan/lib/flash-guide.js | 160 | flash 模型近场引导（用户消息→引导词注入 enter 决策） |
| plugins/dsh-extra-plan/lib/preset-sync.js | 125 | 预设资产自动下发同步（distHash 比对，幂等） |
| plugins/dsh-extra-plan/lib/settings.js | 483 | 设置页后端 HTTP API：pro-config/qqbot 状态与配置/flash-guide 读写 |
| plugins/dsh-extra-plan/scripts/distribute-preset.mjs | 68 | 预设分发脚本（安装/更新时写 DSH_HOME/.agent-presets/extra-plan） |
| plugins/dsh-qqbot-user-questions/index.js | 423 | QQbot 兼容插件：文字列表 ask 问答 + /优先对话 边界插入 + 审批流 |
| plugins/dsh-qqbot-user-questions/patches/@tencent-connect-dsh-qqbot/dist/gateway/bootstrap.js | 75 | qqbot gateway 补丁（最小 ctx.provide 注入；与 .orig 备份配套） |
| plugins/dsh-qqbot-user-questions/patches/@tencent-connect-dsh-qqbot/dist/transport/outbound.js | 143 | qqbot transport 补丁（show_file 出站放行；与 .orig 备份配套） |
| plugins/dsh-qqbot-user-questions/scripts/apply-patch.mjs | 108 | 补丁分发脚本：备份 .orig → 覆写补丁 → cordis.patch 合并（幂等） |

## 函数索引

| 文件 | 函数 | 行号 | 功能描述 | 备注 |
|:--|:--|:--|:--|:--|
| plugins/dsh-extra-plan/index.js | routeDenyReason | L94-99 | 路由未确认时 write/edit/写shell 的拒绝文案（提示先做路由确认） |  |
| plugins/dsh-extra-plan/index.js | planDenyReason | L100-108 | plan 路由下 save_probe/subagent_plan 前置条件未满足的拒绝文案 |  |
| plugins/dsh-extra-plan/index.js | approvalDenyReason | L109-120 | 批准前禁止执行委派类工具（subagent/workflow/ralph）拒绝文案 |  |
| plugins/dsh-extra-plan/index.js | sessionEvents | L174-178 | 取 agent.session 事件快照（缺失兜底空数组） |  |
| plugins/dsh-extra-plan/index.js | isExplicitRoute | L182-188 | 设置页显式指定规划模型（与主会话不同）判断 |  |
| plugins/dsh-extra-plan/index.js | isExplicitEffort | L192-194 | 显式指定 reasoningEffort 判断 |  |
| plugins/dsh-extra-plan/index.js | isSubagentChild | L197-212 | 判定会话属于子代理（header.origin/delegationDepth/descriptor 三路探测） |  |
| plugins/dsh-extra-plan/index.js | isLiveDelegation | L216-227 | 子代理是否仍有存活父会话（live delegation）判定 |  |
| plugins/dsh-extra-plan/index.js | childPolicyNeedsFloor | L230-235 | 子代理沙箱策略需抬升为 workspace-write 的判定 |  |
| plugins/dsh-extra-plan/index.js | isBootstrapPhase | L238-245 | anchored 引导阶段判定（首个工具调用前） |  |
| plugins/dsh-extra-plan/index.js | commandTextOf | L250-262 | 从 exec.arguments 提取 shell 命令原文（字符串/parsed 兼容） |  |
| plugins/dsh-extra-plan/index.js | pwshCommandOf | L263 | 提取 pwsh 命令文本 |  |
| plugins/dsh-extra-plan/index.js | bashCommandOf | L264 | 提取 bash 命令文本 |  |
| plugins/dsh-extra-plan/index.js | mutationMatches | L265-268 | 命令命中写操作拒绝正则判定 |  |
| plugins/dsh-extra-plan/index.js | pwshMutationMatches | L269 | pwsh 写操作判定（调 mutationMatches） |  |
| plugins/dsh-extra-plan/index.js | bashMutationMatches | L270 | bash 写操作判定（调 mutationMatches） |  |
| plugins/dsh-extra-plan/index.js | runCodeTextOf | L273-277 | 提取 run_code 的 code 参数文本 |  |
| plugins/dsh-extra-plan/index.js | codeMutationHints | L280-288 | 对文本扫描 RUNCODE_MUTATION_HINTS 返回命中写暗示 id 列表 |  |
| plugins/dsh-extra-plan/index.js | labelsOfCallData | L292-308 | 从 ask 调用数据提取选项 label 集合 |  |
| plugins/dsh-extra-plan/index.js | normalizeLabel | L320-322 | label 规范化（空白清理） |  |
| plugins/dsh-extra-plan/index.js | isExactGateSet | L325-332 | label 集合与闸门常量集完全一致判定 |  |
| plugins/dsh-extra-plan/index.js | isPartialGateSet | L335-343 | label 与闸门词部分包含判定 |  |
| plugins/dsh-extra-plan/index.js | categorizeGateAsk | L346-350 | ask 分类（standard/malformed/ordinary） |  |
| plugins/dsh-extra-plan/index.js | gateAskDenyReason | L353-380 | 生成标准闸门 ask 选项/结构错误的拒绝理由 |  |
| plugins/dsh-extra-plan/index.js | validateGateAskStructure | L386-403 | 校验路由/批准 ask 结构（问题数、固定选项、修改意见） |  |
| plugins/dsh-extra-plan/index.js | askKindOf | L410-422 | 从 label 判定 ask 类型（route/approve） |  |
| plugins/dsh-extra-plan/index.js | askKindOfRelaxed | L428-441 | 宽松判定 ask 类型（特异性词优先） |  |
| plugins/dsh-extra-plan/index.js | matchRouteLabel | L443-452 | 用户选择标签→direct/plan/disagree |  |
| plugins/dsh-extra-plan/index.js | matchApprovalLabel | L454-463 | 用户选择标签→approve/replan/disagree |  |
| plugins/dsh-extra-plan/index.js | parseAskResultData | L469-504 | tool/result 解析用户选择（answers.selected） |  |
| plugins/dsh-extra-plan/index.js | parseDispatchAskResult | L512-538 | code-dispatch 的 ask 结果解析（含 error 分支） |  |
| plugins/dsh-extra-plan/index.js | deriveFlowState | L545-625 | 事件流推导 flow state（route/clarified/approved/channelBroken） |  |
| plugins/dsh-extra-plan/index.js | plannerChildIdsOf | L630-680 | 事件流收集规划子代理会话 id |  |
| plugins/dsh-extra-plan/index.js | toolCallCount | L688-715 | 统计成功工具调用次数（可跳过指定工具） |  |
| plugins/dsh-extra-plan/index.js | toolCallsSinceUser | L722-737 | 最近一次用户/协调者消息之后的工具调用数 |  |
| plugins/dsh-extra-plan/index.js | jobOutputCallsForJob | L742-769 | 锚点后对指定 job 的 job_output 调用计数 |  |
| plugins/dsh-extra-plan/index.js | appendSuffixBlock | L776-786 | 给 user 消息追加文本块（仅单文本块时） |  |
| plugins/dsh-extra-plan/index.js | withPlannerPromptSuffix | L787 | 拼接规划子代理附加引导 |  |
| plugins/dsh-extra-plan/index.js | budgetNoticeText | L794-796 | 开局预算提示文案（本轮探查预算上限 N 次） |  |
| plugins/dsh-extra-plan/index.js | withBudgetNotice | L800 | 预算提示拼接进消息 |  |
| plugins/dsh-extra-plan/index.js | budgetReminderText | L803-807 | 剩余≤3次提醒文案 |  |
| plugins/dsh-extra-plan/index.js | budgetReminderMessage | L810-812 | 剩余提醒消息构造 |  |
| plugins/dsh-extra-plan/index.js | budgetReminderSent | L816-839 | 本锚点是否已注入剩余提醒（防重复注入） |  |
| plugins/dsh-extra-plan/index.js | budgetExhaustedReason | L843-845 | 预算耗尽文案（已用 x/y） |  |
| plugins/dsh-extra-plan/index.js | budgetExceeded | L848-850 | used+1 超预算判定 |  |
| plugins/dsh-extra-plan/index.js | sanitizeTaskName | L855-863 | 任务名净化（截断/去非法字符） |  |
| plugins/dsh-extra-plan/index.js | timestamp | L866-870 | 时间戳 yyyyMMddHHmmss |  |
| plugins/dsh-extra-plan/index.js | pad | L868-879 | 数字补零（timestamp 内部闭包） |  |
| plugins/dsh-extra-plan/index.js | renderSavePlan | L877-879 | save_plan 结果渲染（路径数组→文本） |  |
| plugins/dsh-extra-plan/index.js | validateProbe | L917-1016 | save_probe 参数校验（四字段上限/path 存在/evidence 规则） |  |
| plugins/dsh-extra-plan/index.js | probePathOf | L1019-1022 | 相对路径按 cwd 解析绝对路径 |  |
| plugins/dsh-extra-plan/index.js | renderProbeMarkdown | L1026-1067 | save_probe Markdown 渲染（线索/证据报告） |  |
| plugins/dsh-extra-plan/index.js | extractProbeEvidenceRefs | L1072-1080 | 方案文本提取【探查者已核实】证据引用路径 |  |
| plugins/dsh-extra-plan/index.js | renderSaveProbe | L1084-1086 | save_probe 输出渲染 |  |
| plugins/dsh-extra-plan/index.js | catalogHasWriteTools | L1090-1095 | 工具目录是否含写工具判定 |  |
| plugins/dsh-extra-plan/index.js | isReadOnlyChildByCatalog | L1098-1100 | 按工具目录判定只读子代理 |  |
| plugins/dsh-extra-plan/index.js | schemasHasWriteTools | L1105-1110 | schemas 数组是否含写工具 |  |
| plugins/dsh-extra-plan/index.js | schemasHasTool | L1114-1119 | schemas 是否含指定工具 |  |
| plugins/dsh-extra-plan/index.js | catalogIsCollapsed | L1126-1131 | 工具目录折叠为单工具判定（run_code/仅shell） |  |
| plugins/dsh-extra-plan/index.js | resolveProbeRequestInjection | L1141-1225 | 探查者请求注入解析（上溯父会话配置） |  |
| plugins/dsh-extra-plan/index.js | maskCodeLiteralsAndComments | L1236-1274 | 遮蔽字符串/注释为空格（括号配平用） |  |
| plugins/dsh-extra-plan/index.js | sliceBalancedArgs | L1279-1295 | 从括号起配平切片参数原文 |  |
| plugins/dsh-extra-plan/index.js | decomposeRunCode | L1306-1435 | 静态拆解 run_code 的 code 为工具成员组（含裸写伪工具） |  |
| plugins/dsh-extra-plan/index.js | addMember | L1315-1329 | 成员去重添加（decomposeRunCode 内部闭包） |  |
| plugins/dsh-extra-plan/index.js | markRange | L1330-1332 | 标记已占用区间（decomposeRunCode 内部闭包） |  |
| plugins/dsh-extra-plan/index.js | isIdChar | L1333-1422 | 标识符字符判定（decomposeRunCode 内部闭包） |  |
| plugins/dsh-extra-plan/index.js | runCodeCatchGateReason | L1442-1655 | 多调用容错硬闸门纯函数：run_code code 内 tools.* 调用点（未去重、含多行/动态访问，裸写不计）≥2 时要求每点独立容错（独立 try/catch / allSettled([...]) / .catch 链），不足返回教学式拒绝文案；单调用豁免、嵌套 run_code 展平、静态失败保守按未保护 |  |
| plugins/dsh-extra-plan/index.js | collectRunCodeSites | L1660-1743 | run_code code 调用点收集（自 runCodeCatchGateReason 局部 collectSites 逐字提升为模块顶层）：字符串/注释跳过、tools./tools['lit']/tools[var] 三类调用点、sliceBalancedArgs 配平，返回 {start,end,innerText,name} 数组 |  |
| plugins/dsh-extra-plan/index.js | runCodeSiteCount | L1747-1765 | run_code code 静态调用点计数（单实例上限快路径，planner 专属）：run_code 调用点本身不计、参数 JSON 可解析时递归展开 args.code（展平口径）；其余调用点各计 1 |  |
| plugins/dsh-extra-plan/index.js | isRunCodeSubCall | L1769-1774 | 子调用语义判定：exec.sub===true（组判定合成成员）或 exec.parent!==undefined（运行时嵌套，与官方 dsh-tools nested 判定同口径）→ true；其余 false |  |
| plugins/dsh-extra-plan/index.js | runCodeDispatchCapText | L1777-1779 | 单实例子调用超限文案（T3 逐字）：rootCallId 实例子调用数超过 exploreBudget 上限的拒绝文案，listener 运行时检查与纯函数共用 |  |
| plugins/dsh-extra-plan/index.js | runCodeDispatchGateReason | L1784-1798 | 运行时单实例上限判定（planner 专属）：统计 events 中 rootCallId===rid 的 code-dispatch-start 条数，count>cap 返回 T3 文案；否则 null（rootCallId 非 string/events 非数组/cap 非正整数 → null） |  |
| plugins/dsh-extra-plan/index.js | subagentProbeGateReason | L1802-1814 | 探查者分支闸门（run_in_background 必 true + planner 预算） |  |
| plugins/dsh-extra-plan/index.js | plannerGateReason | L1817-1835 | 规划子代理分支闸门（write/edit/pwsh/bash 写禁 + 预算） |  |
| plugins/dsh-extra-plan/index.js | childReadonlyGateReason | L1838-1850 | 子代理只读分支闸门（探查者/验收者差异化文案；不含 run_code） |  |
| plugins/dsh-extra-plan/index.js | jobOutputGateReason | L1855-1877 | job_output 全角色闸门纯函数：wait:true 禁令 + 同 job 重复调用查重（内存计数器）；counters 缺省或 vExec 无 agent（组判定成员）时跳过查重、wait 检查照常 |  |
| plugins/dsh-extra-plan/index.js | probeDisposalWarning | L1883-1886 | 探查者级联中止告警纯函数：剩余未认领探查者委派数为正整数时返回告警文案（owner disposed + 引擎限制指向官方包）；非正整数返回 null |  |
| plugins/dsh-extra-plan/index.js | mainGateReason | L1893-2004 | 主会话闸门主分支（ask/write/edit/cordis/plan/probe/subagent/run_code/job_output） |  |
| plugins/dsh-extra-plan/index.js | runCodeGroupDenyReason | L2014-2079 | run_code 组判定：拆解→成员逐判定→聚合拒绝 |  |
| plugins/dsh-extra-plan/index.js | visit | L2031-2067 | 递归展平嵌套 run_code（runCodeGroupDenyReason 内闭包） |  |
| plugins/dsh-extra-plan/index.js | aggregateRunCodeDenyReason | L2085-2096 | 聚合多成员拒绝消息 |  |
| plugins/dsh-extra-plan/index.js | apply | L2192-3266 | 插件主入口：配置解析/服务注册/工具注册/锚点钩子 |  |
| plugins/dsh-extra-plan/index.js | foldUsage | L2221-2295 | usage 账本折叠写入（cursor 去重，按 sessionId+seq） |  |
| plugins/dsh-extra-plan/index.js | isChild | L2300-2308 | 子代理判定（live 校验+误分类警示） |  |
| plugins/dsh-extra-plan/index.js | isPlannerChild | L2312-2326 | 规划子代理判定（descriptor.mode=continuable） |  |
| plugins/dsh-extra-plan/index.js | toolSchemasOf | L2331-2349 | 防御式获取 agent 工具 schemas |  |
| plugins/dsh-extra-plan/index.js | resolvePlannerEntry | L2367-2401 | 规划子代理模型单点解析（plannerModel 优先+父会话配置，带缓存） |  |
| plugins/dsh-extra-plan/index.js | effectiveModel | L2408-2440 | 任意 agent 有效模型只读服务（planner/child/main 三态） |  |
| plugins/dsh-extra-plan/index.js | flashGuideEnabled | L2449-2451 | flash 引导开关只读服务 |  |
| plugins/dsh-extra-plan/index.js | parseSkillFrontmatter | L2496-2505 | SKILL.md frontmatter 的 name/description 解析 |  |
| plugins/dsh-extra-plan/index.js | floorChildPolicy | L2507-2511 | 子代理沙箱策略抬升（workspace-write） |  |
| plugins/dsh-extra-plan/index.js | childBaseline | L2513-2519 | 子代理基线（判定/usage/floor 汇总） |  |
| plugins/dsh-extra-plan/index.js | atomicCommit | L2528-2542 | 原子落盘（tmp→journal→rename→清 journal；save_plan 双写/save_probe 单写共用） |  |
| plugins/dsh-extra-plan/index.js | recoverJournals | L2546-2570 | journal 崩溃自愈（新旧形状兼容） |  |
| plugins/dsh-extra-plan/index.js | defineSavePlan | L2572-2635 | save_plan 工具定义（双写必填/证据引用校验） |  |
| plugins/dsh-extra-plan/index.js | registerTool | L2639-2652 | 工具注册分发 |  |
| plugins/dsh-extra-plan/index.js | registerSavePlan | L2655 | save_plan 注册（仅规划子代理层） |  |
| plugins/dsh-extra-plan/index.js | defineSaveProbe | L2660-2773 | save_probe 工具定义 |  |
| plugins/dsh-extra-plan/index.js | registerSaveProbe | L2776 | save_probe 注册（主会话/探查者/规划子代理按判定） |  |
| plugins/dsh-extra-plan/index.js | matchWildcard | L2780-2783 | showFilePatterns 通配符匹配 |  |
| plugins/dsh-extra-plan/index.js | defineShowFile | L2784-2843 | show_file 工具定义（限方案/验收文件） |  |
| plugins/dsh-extra-plan/index.js | registerShowFile | L2845 | show_file 注册（仅主会话） |  |
| plugins/dsh-extra-plan/index.js | probeClaimFor | L2853-2867 | 探查子代理预算暂记查核（probe claims） |  |
| plugins/dsh-extra-plan/index.js | causeChainOf | L2916-2928 | 拒绝原因链解析（子代理继承根因） |  |
| plugins/dsh-extra-plan/index.js | recordRequestError | L2929-2951 | 记录请求错误诊断到临时目录 |  |
| plugins/dsh-extra-plan/lib/client-bridge.js | apply | L17-19 | 空实现（仅承载 dsh.client 加载路径指向 lib/client.js） |  |
| plugins/dsh-extra-plan/lib/executor-spawn.js | apply | L49-89 | 插件入口：注册执行者 provider（委托宿主 spawn，注入 deny 工具裁剪） |  |
| plugins/dsh-extra-plan/lib/executor-spawn.js | defaultedAgentOptions | L69-73 | 执行者 agentOptions 透传（请求自带优先，否则空对象继承父会话） |  |
| plugins/dsh-extra-plan/lib/flash-guide.js | isComplexTask | L44-46 | 用户消息复杂度判定 |  |
| plugins/dsh-extra-plan/lib/flash-guide.js | isFlashModel | L49-51 | flash 模型判定 |  |
| plugins/dsh-extra-plan/lib/flash-guide.js | extractText | L55-60 | 提取消息文本 |  |
| plugins/dsh-extra-plan/lib/flash-guide.js | findUserIndexes | L65-75 | 定位用户消息索引 |  |
| plugins/dsh-extra-plan/lib/flash-guide.js | buildGuideMessage | L80-88 | 构建 flash 引导词 |  |
| plugins/dsh-extra-plan/lib/flash-guide.js | shouldGuide | L91-93 | 引导是否启用（模型+开关判定） |  |
| plugins/dsh-extra-plan/lib/flash-guide.js | apply | L103-159 | 插件入口（enter 决策注入引导） |  |
| plugins/dsh-extra-plan/lib/preset-sync.js | contentHash | L21-29 | 预设资产内容哈希 |  |
| plugins/dsh-extra-plan/lib/preset-sync.js | readManifest | L32-41 | 读 dist-manifest.json |  |
| plugins/dsh-extra-plan/lib/preset-sync.js | writeFull | L44-63 | 全量下发预设目录（tmp+rename） |  |
| plugins/dsh-extra-plan/lib/preset-sync.js | cleanupLegacyFlashGuidePatches | L68-91 | 清理旧 flash-guide 补丁条目 |  |
| plugins/dsh-extra-plan/lib/preset-sync.js | syncPreset | L97-110 | 预设同步判定（hash 比对→下发/跳过） |  |
| plugins/dsh-extra-plan/lib/preset-sync.js | apply | L115-124 | 插件入口（启动时 syncPreset） |  |
| plugins/dsh-extra-plan/lib/settings.js | dshHomeDir | L43-47 | DSH_HOME 解析（环境变量优先） |  |
| plugins/dsh-extra-plan/lib/settings.js | mainPluginProfiles | L50-59 | 列 profile 下含 extra-plan 的插件目录 |  |
| plugins/dsh-extra-plan/lib/settings.js | agentCordisPath | L61-63 | agent.cordis.yml 路径 |  |
| plugins/dsh-extra-plan/lib/settings.js | cordisPatchPath | L65-67 | cordis.patch.yml 路径 |  |
| plugins/dsh-extra-plan/lib/settings.js | qqbotDir | L69-71 | qqbot profile 目录 |  |
| plugins/dsh-extra-plan/lib/settings.js | qqbotUserQuestionsDir | L73-75 | qqbot 用户问题插件目录 |  |
| plugins/dsh-extra-plan/lib/settings.js | isLoopback | L77-80 | 环回地址判定（API 仅本机） |  |
| plugins/dsh-extra-plan/lib/settings.js | json | L82-86 | HTTP JSON 响应 |  |
| plugins/dsh-extra-plan/lib/settings.js | readJsonBody | L88-109 | 读取请求体（限 1MB） |  |
| plugins/dsh-extra-plan/lib/settings.js | readExtraPlanConfig | L112-132 | 读 extra-plan 插件配置 |  |
| plugins/dsh-extra-plan/lib/settings.js | readToolWebConfig | L135-146 | 读 tool-web 插件配置 |  |
| plugins/dsh-extra-plan/lib/settings.js | readToolPresentationConfig | L149-160 | 读 tool-presentation 插件配置 |  |
| plugins/dsh-extra-plan/lib/settings.js | yamlScalar | L179-483 | YAML 标量转义 |  |
| plugins/dsh-extra-plan/lib/settings.js | patchRowField | L188 | 配置条目行字段值替换 |  |
| plugins/dsh-extra-plan/lib/settings.js | writeTextAtomic | L205 | 原子写文件（tmp+rename） |  |
| plugins/dsh-extra-plan/lib/settings.js | patchFileField | L214 | 配置文件字段打补丁 |  |
| plugins/dsh-extra-plan/lib/settings.js | readQqbotConfig | L223 | 读 qqbot-user-questions 配置 |  |
| plugins/dsh-extra-plan/lib/settings.js | checkQqbotStatus | L240 | qqbot 环境状态检查（目录/依赖/补丁） |  |
| plugins/dsh-extra-plan/lib/settings.js | createApiHandler | L263 | 设置页 HTTP API（GET/PUT pro-config、qqbot 状态/配置、flash-guide） |  |
| plugins/dsh-extra-plan/lib/settings.js | apply | L468 | 插件入口（HTTP 服务注册） |  |
| plugins/dsh-extra-plan/scripts/distribute-preset.mjs | distribute | L27-44 | 预设分发（hash 比对→写 DSH_HOME/.agent-presets/extra-plan） |  |
| plugins/dsh-extra-plan/scripts/distribute-preset.mjs | invokedAsMain | L49-56 | 主脚本判定（node 直跑时执行 distribute） |  |
| plugins/dsh-qqbot-user-questions/index.js | apply | L21-276 | 插件入口：消息中间件/ask 提供者/优先对话/审批流注册 |  |
| plugins/dsh-qqbot-user-questions/index.js | resolveRoot | L27-32 | 会话根目录解析（记忆库/会话目录） |  |
| plugins/dsh-qqbot-user-questions/index.js | providerAsk | L175-222 | ask_user_question 提供者（文字列表发 QQ+等待回复） |  |
| plugins/dsh-qqbot-user-questions/index.js | formatSingleQuestion | L285-304 | 单个问题文字列表格式化 |  |
| plugins/dsh-qqbot-user-questions/index.js | parseSingleAnswer | L314-335 | 用户数字/文字答案解析 |  |
| plugins/dsh-qqbot-user-questions/index.js | formatApprovalMessage | L341-356 | 审批消息格式化 |  |
| plugins/dsh-qqbot-user-questions/index.js | encodeSegment | L366-378 | 路径段编码（~ 转义，session 目录安全） |  |
| plugins/dsh-qqbot-user-questions/index.js | projectKey | L386-405 | 项目路径编码为可读键 |  |
| plugins/dsh-qqbot-user-questions/index.js | deleteSessionDir | L412-422 | 删除陈旧会话目录 |  |
| plugins/dsh-qqbot-user-questions/patches/@tencent-connect-dsh-qqbot/dist/gateway/bootstrap.js | bootstrapGateway | L6-74 | gateway 补丁：最小注入 ctx.provide 使 qqbot-user-questions 插件可挂载 |  |
| plugins/dsh-qqbot-user-questions/patches/@tencent-connect-dsh-qqbot/dist/transport/outbound.js | OutboundRouter | L10-132 | transport 补丁路由：放行 show_file 出站（方案/验收文件预览） |  |
| plugins/dsh-qqbot-user-questions/patches/@tencent-connect-dsh-qqbot/dist/transport/outbound.js | createOutboundHandler | L139-142 | 构造放行处理器（show_file 白名单判定） |  |
| plugins/dsh-qqbot-user-questions/scripts/apply-patch.mjs | sameContent | L35-38 | 两文件内容一致判定（补丁幂等） |  |
| plugins/dsh-qqbot-user-questions/scripts/apply-patch.mjs | ensureImQqbotEntry | L46-108 | 确保 im-qqbot 行存在（cordis.patch 对照写入） |  |
| plugins/dsh-qqbot-user-questions/scripts/apply-patch.mjs | idIndent | L75 | 条目 id 缩进定位 |  |

---

*本文件由脚本增量维护；直接编辑功能描述/备注列是安全的。*
