# 按需规划模式 — 项目概览

> AI 每次动手前速读：项目是什么、五角色、文件职责（改哪里）。函数级定位用 ai-代码地图.md。
> **改完必做**：node pe-test/tools/代码地图生成.mjs（同步地图+人工补描述（脚本只同步结构，绝不覆盖已有描述），流程见 ai-维护手册.md）。一键体检已内置 `--check` 一致性检查（不写盘）：地图过期/漏检/导航失效 → 该项判红。

## 项目一句话
dsh 插件「按需规划模式」预设：AI 未经用户同意不得修改源码/配置/执行态（只读探查为主），经路由/目的/澄清/批准四级机械闸门后按规划执行；唯一写例外是受限规划工件 save_plan——任意路由态可落盘 cwd/.extra-plan 的固定形状方案/验收双文件（内容闸门、目录与文件名形态不变），save_probe 放行条件保持现状（route=plan + 目的已定 + 澄清完成）。五角色分工保证「用户确认 → 规划 → 执行 → 验收」闭环。工具呈现按 A=anchoredBootstrap、C=creativeMode、M=native/ptc/both 三个独立维度，F=无 tool/call、L=首个 tool/call 后判定。

兼容：**仅 dsh 0.1.7-rc.1 / 0.1.7-rc.2**（peerDependencies 精确钉 `'0.1.7-rc.1 || 0.1.7-rc.2'`；不再支持 0.1.2-rc.1~0.1.5-rc.2 同码兼容）。**依赖口径（2026-09-25 起）**：`dependencies` 不含任何 `@deepseek-ai/*` 宿主包——`@deepseek-ai/dsh-llm`（`createUserMessage`/`createDeveloperMessage`）与 `@deepseek-ai/schemastery` 只作 `peerDependencies` 声明，profile 侧 `autoInstallPeers=false` 不安装，运行时由 0.1.7 运行时解析表回落到宿主自带副本（自动跟随宿主版本、无需维护钉版）；原因是 profile `node_modules` 内的同名本地副本在解析时**优先于安装域**，会把宿主 llm 运行时行顶替掉（旧依赖曾把缺 tool-update 投影的 0.1.7-rc.1 `dsh-llm` 装进 profile → 会话内工具变更产生的 developer `tool-removal` 被原样发出 → DeepSeek Messages API 只收 `tool_addition` → 422，且该消息落盘后整会话每轮必失败）。qqbot 0.5.0 版（自愈/建链由精简版 dsh-qqbot-user-questions 承担；两行已按 0.1.7 新包族静态重写，**待有 QQBOT 环境再测试**）；Linux/macOS 逻辑层已验证（pe-test 写拦截 68 用例），运行时仅 Windows 实测。

## 五角色
1. 主会话：用户交互入口、需求接收、复杂度评估、路由确认、任务分派、计划展示、验收汇总
2. 探查者：后台批量只读探查、save_probe 落盘【含证据报告】、回主会话只给路径+2-3 行摘要
3. 规划子代理：只读探查（**不得委派探查者**，缺信息走「申请继续探查」交主会话）+ save_plan 落盘「方案+验收标准」双文件；探查预算硬上限；continuable 可续轮
4. 执行者：按方案+验收文件机械执行、逐项自验证；one-shot 后台
5. 验收者：只读验收文件逐条机械核对；one-shot 后台

## 文件职责地图（改什么动哪里）
| 功能域 | 位置 | 备注 |
|:--|:--|:--|
| 四级闸门状态机+主闸门 | plugins/dsh-extra-plan/index.js | 修改最频繁（route/purpose/clarified/approved/channelBroken）；会话启动注册挂在 `agent/created`（0.1.7 起 `agent/session-start` 已删；serial 监听器必须整块吞错，pre-step 兜底保留）；7 个闸门关键词的唯一值源是 YAML 的 config.gateWords，词表作为显式参数贯穿全部 helper/状态机/闸门（apply 第一步 createGateRuntime 严格校验并在当前 agent scope 注册 7 个 extra_plan_* 变量）；失败分支口径（2026-09-23）：闸门拒绝 kind:'denied' 不重置任何字段，取消/中断仍清四字段，通道码只置 channelBroken |
| PTC 拒绝中文呈现兜底（tools/post-execute） | plugins/dsh-extra-plan/index.js（apply 内 runCodeDenyRecords + recordRunCodeDeny + ctx.on('tools/post-execute')；agent/disposed 按 session 清桶） | run_code 子调用被闸门拒绝 → 失败结果 `content` 改写为「Error: 中文 reason」（宿主英文包装与 worker.cjs 堆栈不进模型上下文）；精确子串 `ToolCallError: <reason>` 命中才改，未命中透传不吞错；宿主契约见台账 HK25 |
| 闸门关键词共享契约（单一来源） | lib/gate-words.js（GATE_WORD_FIELDS/GATE_WORDS_GROUP_DEFINITION/validateGateWords/createGateRuntime）；值写在 assets/presets/extra-plan/agent.cordis.yml 的 config.gateWords | 纯模块：不含任何出厂词值、不读文件/环境变量、无无参默认词表；校验失败一律 'extra-plan: config.gateWords' 前缀；被 index.js（运行时）与 lib/preset-sync.js（启动自愈）共享；10 项 UI settings 之外并列 7 项闸门词字段（不进设置页 metadata、不进 preset-defaults.generated.js、不新增构建步骤） |
| 探查预算 | lib/planner-budget.js budget* 族（budgetNoticeText/budgetReminderText/budgetExhaustedReason 等；index.js 仅 import 使用） | 开局告知/剩3提醒/耗尽往返 |
| save_probe/save_plan 工具 | lib/save-contract.js（合同/渲染）、lib/save-probe-validation.js（校验）、lib/save-persistence.js（原子落盘+阶段感知 journal）、lib/save-tool-factories.js（工具定义工厂）；index.js（apply 注册/闸门接线） | 双写+journal 自愈（阶段感知：pre-journal 失败先删 journal 并以 existsSync 确认不存在才清 tmp，post-journal 任何失败保留 journal 与现场，全部目标确认就位后才删 journal；恢复逐项确认目标存在、全项就位才清 journal，目标缺失或形状非法保留 journal 并告警；无 fsync/跨进程强持久化承诺）；save_plan 注册于规划子代理层+主会话层（主会话侧任意路由态放行——受限规划工件，仅写 cwd/.extra-plan 固定形状 Markdown）；save_probe 放行条件保持现状（route=plan + 目的已定 + 澄清完成）；注册幂等由「成功后才写 WeakSet 标记」保证；A 类重名与 B 类永久性定义错误也写标记记终态、不再重试，仅 tools 服务未就绪与 C 类可重试错误不写标记、由 pre-step 每步兜底重试（agent/created 每会话仅一次、recompose 不重发，故只剩 pre-step 一条恢复通道） |
| save_probe PROBE_LIMITS | lib/save-contract.js PROBE_LIMITS；lib/save-probe-validation.js validateProbe；lib/save-tool-factories.js 动态 schema；step-00 PR23=151、PR34/PR35 | evidence 最多 150 条、单条 evidence.text 最多 1000 字；1000 通过、1001 拒绝；描述/schema 动态读取同一合同常量 |
| run_code 静态拆解组判定 | index.js runCodeGroupDenyReason（组聚合/判定）；lib/run-code-static.js decomposeRunCode（静态拆解，index.js 解构调用后 re-export） | 防绕道闸门 |
| run_code 容错检查 | lib/run-code-static.js runCodeCatchGateReason/runCodeDispatchGateReason（index.js 解构调用与 re-export；开关 cfg.runcodeCatchGate 默认 false） | 多调用独立容错硬闸门（只认逐点 try/catch；教学式拒绝）+ 单实例子调用上限=exploreBudget |
| anchored 首轮引导 | lib/assembly-presentation.js projectAssemblyForPresentation/renderFilteredToolsSdk（L 段 tools:sdk 重建）；index.js system-prompt/assemble 钩子（isBootstrapPhase/keep 构造 + HP 的 tool:read 文本覆盖；行号见代码地图函数索引） | A=1/F/main-planner：native/both 为 HN/HB（bootstrap shell(s)+read，sections 仅 extra-plan-bootstrap）；PTC 为 HP（顶层仅 run_code，sections 精确为 extra-plan-bootstrap、tool:read 两项；宿主 tools:ptc-only 段已停用、不再透传，read 文本由插件手写 cfg.bootstrapReadHint、空串/非字符串回退内置中文兜底）；L 恢复 N/P/B（tool:read 回宿主原文） |
| creativeMode 持续装配投影 | lib/assembly-presentation.js projectAssemblyForPresentation/renderFilteredToolsSdk；index.js skill 注册源 | C=0 覆盖五角色每轮模型可见面：隐藏 2 个 Cordis 工具、SDK 中对应 schema/说明（`tool:cordis` 段在 0.1.7 宿主侧已删，CORDIS_SECTION_NAME 标废弃、过滤空转无害）；C=0 全 phase 隐藏三个创造 skill（旧「不注册」语义改为 catalog 投影隐藏），**三个创造 skill**（cordis-plugin-development / editing-cordis-compositions / cordis-composition-reference；由 skill-filesystem 行 config.customSkillDirs 静态注册）不进入 catalog；C=1 不因 C 隐藏——非 HP1 且非 anchored 时保留完整 SDK/Cordis/三个创造 skill，但 HP1 的 F/main-planner 仅暂隐 catalog；普通 skill/skill 工具保留。官方 renderer 从明确 schema 整体重建；不改变 registry binding，非运行时安全隔离 |
| 探查者／非 planner 模型注入 | lib/model-routing.js resolveOtherAgentEntry（createModelRouting 工厂返回，apply 内解构） | 上溯顶层主会话 fallback；resolver 层链断裂（source=null）返回 {}、不注入直接父；「链断裂回退直接父」仅对钩子层 maxTokens 继承成立；跨 provider 严格探针为有界并发池（写死常量 PLANNER_PROBE_CONCURRENCY=5，planner 与非 planner 同形：去重 → 并发池 → 按发起顺序收集 → 全部结束后排序），非配置项 |
| 实机子代理模型/提供方与引导取证 | pe-test/tools/step-07-子代理模型与引导取证.mjs | HUMAN：显式 SESSION_ID + PLANNER_PROMPT_SUFFIX；两代日志、pro规划/非pro规划、attempted route 与 actual provenance、suffix 等级；两阶段头扫描只解析命中 child，默认堆可跑通 |
| 设置页宿主半段 | lib/settings.js（createApiHandler + Config 10 字段 volatile） | 8 项 UI 设置走 settings 行 Config（官方 configForms）；2 项宿主行（webFetch/toolPresentationMode）与 8 项一并经客户端一次 mutate（10 op）写 settings 行；PUT 仅投影声明行子行；仅本机环回，失败口径 400（校验）/200+applied=false（投影失败） |
| 设置页前端 UI | lib/client.js | 打包器（__ModuleLoader__）格式；注册面 = Plugins 页已安装包行详情的 `plugins.row.config`（key = `@local/dsh-extra-plan#dsh-extra-plan-settings`，configForms.whileServed 包裹），inject ['slots','locale','configForms']；单卡双区块（通用设置 3+2 项 / pro规划 5 项，字段顺序与卡片文案逐字对齐根 README「4. 可配置项」），全卡唯一保存按钮：一次官方 configForms mutate 10 项（8 项 UI + 2 项宿主行）+ PUT 纯投影（mutate 失败自动回滚投影），提示语极简（已保存/保存失败，重启生效仅见于字段 hint）；入口 = DSH web 界面 → 左侧边栏「插件」页 → 已安装包 `@local/dsh-extra-plan` → 行 `dsh-extra-plan-settings` →「配置」 |
| 预设自愈核对 | lib/preset-sync.js（apply 经 ctx.inject(['configEditor'])；写盘只走 configEditor.edit） | 启动时按三维判定（声明行覆盖资产行 id 集合 + 本体剥离比对 + 投影一致性）：一致 → idle（不写盘）；不一致 → 按资产本体重建声明行、回填/投影 2 项宿主行、整组校验 gateWords；厂商模板 gateWords 在判定前严格校验；无 manifest 台账、无旧副本迁移（0.1.6 及更早搬迁已放弃） |
| 执行者工具裁剪 | lib/executor-spawn.js | E8：覆盖 workflow/ralph worker |
| 预设本体（persona/deny/descriptor/设置默认） | assets/presets/extra-plan/agent.cordis.yml（**预设载体 = 生成产物 assets/presets/extra-plan/preset-patch.generated.yml 的声明行 preset-extra-plan，config.plugins 与本题层条目逐字一致**） | 改预设=改这里（复制副本再改）再跑生成器；anchoredBootstrap 与 creativeMode 两个开关独立，creativeMode 默认 false；三组 isolate 名单见 READAI.md「新载体」节 |
| qqbot 自愈 | plugins/dsh-qqbot-user-questions/lib/heal.js + scripts/heal.mjs（精简版插件根 index.js 调 heal.js） | 启动/安装时迁移旧版根级 code-runtime/agent-presets 错误块 + @local 建链（两行补入由包内静态 cordis.patch.yml 承担）；不含问答/审批 |
| PTC三维装配矩阵 | pe-test/tools/step-04-路由与写闸门.mjs | 实际执行 2×2×3×2×5=120 格，逐格断言 A/C/M/F-L/五角色、C7 0/2、catalog 0/3（C=0 隐藏 3 个创造 skill / C=1 非 HP1 保留 3 个）、普通 skill、HP 与 HN/HB 基线；同文件另含 P0-4 会话状态生命周期与末轮 usage 监听器级用例（e 段 P4-1~P4-24 期望不变 + 新增 P4-25+ 增量对拍：双 session 同 root 隔离、跨 session 锚点、disposed 清理、临时账本的 final flush/幂等/续载去重/cursor 降级、P4-24 provider/cw/rs 新字段落盘与五字段零行跳过） |
| 工具清单/时序取证 | pe-test/tools/step-04-工具清单查看.mjs | 显式会话、逻辑 JSONL 行号、前置 tool/call 数、first/later、精确 header.tools、header.system 文本命中、skill-catalog；文本命中不冒充 section 名 |
| 代码地图 | pe-test/docs/ai-代码地图.md + pe-test/tools/代码地图生成.mjs | 头部「意图速查」= 人工段（脚本原样保留、校验引用函数名）；函数索引 = 机器段（行号/增删）；`--check` 一致性门槛；覆盖口径 = 任意缩进的命名函数定义 |
| run_code 静态解析/理由函数 | lib/run-code-static.js（createRunCodeStatic 工厂：decomposeRunCode/runCodeCatchGateReason/runCodeDispatchGateReason/runCodeSiteCount/isRunCodeSubCall/askUserQuestionReturnGateReason/runCodeDispatchCapText） | 仅接收显式 { askTool, isDispatchStart } 普通依赖，不持有 ctx/状态；9 条禁用 API 正则与拒绝文案逐字保留自拆分前 |
| 会话事件快照/子代理判定 | lib/agent-session.js（sessionEvents/isSubagentChild） | index.js 经 import 使用并经 decisions re-export；台账 SD10/HK20 宿主接触面现居此文件 |
| 会话状态生命周期 + usage 账本（P0-4） | index.js apply 内（foldUsage/readUsageCursorTable/warnUsageCursorDegraded/usageCursorEntryOf/noteRunCodeSubCall + agent/disposed 监听器）+ lib/agent-runtime.js（usageRoleOf/childBaseline 与 sandbox floor，经 createAgentRuntime 返回、index.js 解构使用） | 运行时状态按 sessionId 分桶：subCallCounters = sessionId→rootCallId→已放行次数，锚点变化只删当前 session 桶（不再全局 clear）；agent/disposed 是 emit/void、宿主只挂 catch 不等待 → 先同步 final fold（role 取 childBaseline 的 usageRoles WeakMap 缓存）再按 sessionId 回收 jobOutput/锚点/notice/rootCall/usage 内存态（重复 disposed 幂等）；usageCursors 只存活跃 session：同 session 续载按 sessionId 从 cursor JSON 单项恢复 seq/index（增量口径 = 宿主 session.seq 水位 + snapshotEvents(from,to) 区间读取：水位未变直接返回、不物化数组；prevIndex > 水位（日志截断）或首次折叠回退全量；seq <= cursor 跳过已落盘行）；ENOENT 静默按空表，其它读取错误/JSON 解析失败/根值非对象 → 每插件实例首次降级告警一次并进入空表降级（写回覆盖为仅当前 session，其它 session 去重基准丢失，性能优化留后续 D3）；账本行字段 = ts/sessionId/role/model/provider/hit/miss/out/cacheWriteTokens/reasoningTokens/seq（provider 缺省空串、cacheWriteTokens/reasoningTokens 缺省 0；hit/miss/out/cw/rs 五字段全零不写行），读侧 step-99 为纯 token 统计（明细含 provider/cw/rs，无任何汇总）；回归入口 = step-04 ⑭e 段（P4-1~P4-24 + 新增 P4-25+ 增量对拍） |
| 预设设置解析与行定位 | lib/preset-settings.js（loadYaml/captureSettings/captureRowSettings/restatePluginsRow/patchYamlScalar/findPluginsRow 等） | 十项设置 descriptor，每项双定位元数据：`sourceLocator`（源模板（资产），id extra-plan/tool-web/tool-presentation + config 路径）与 `rowLocator`（新载体：8 项 settings 行 dsh-extra-plan-settings、2 项声明行 plugins 子行）；`group` 标记 extra-plan(8)/host-rows(2)；已无 pluginId/path 顶层字段；js-yaml 双路回退 |
| 配置热读／生效标志（live-config） | lib/live-config.js（createLiveConfig：8 项热读 getter，含 creativeMode）；index.js 箭头 getter 与消费点 | 设置页改值后同会话即时生效（8 项全热读；2 项宿主行 webFetch/toolPresentationMode 仍重启生效）。路径决议 configPath → DSH_EXTRA_PLAN_CONFIG_PATH → **configEditor.documentPath（profile cordis.patch.yml）**；解析目标 = settings 行 id `dsh-extra-plan-settings` 的 config 8 键（captureRowSettings）；fallback 链 = settings 行 override → cfg 快照 → BUILTIN_DEFAULTS；构造期无条件读盘一次（文件真值作首拍基准），此后路径或 mtimeMs+size 变化才重读；无 per-Agent 缓存失效策略 |
| 客户端桥接 | lib/client-bridge.js（name='dsh-extra-plan-client-bridge'，空 apply L17-19） | 仅承载 dsh.client 加载路径指向 lib/client.js |

## 界面文案口径（用户确认，2026-09-25）
- **界面文案只保留结论级信息**（成功 / 失败 / 需要做什么操作），一律不写详细技术描述。
- **唯一例外**：硬闸门给 AI 的拒绝/教学文案——那是给 AI 看的，保留技术细节与教学口径。
- **技术细节的合法去处**：① 硬闸门给 AI 的文案（唯一例外）；② 诊断文件与日志（`extra-plan-*-errors.jsonl` 等）与浏览器控制台；③ AI 维护文档（`pe-test/docs/ai-*.md`、`READAI.md`）。实现词（投影/宿主行/已回滚/revision 等）不得出现在界面文案里。
- 本批落点：保存成功/失败提示已按此口径极简化（「已保存」/「保存失败」），重启生效信息由字段 hint 承载；其余界面文案（卡片标题/描述、字段 label/hint、区块标题、下拉选项、loading/readOnly）保持不变。

## P2-2 SDK 文本复用验证口径
- `plugins/dsh-extra-plan/lib/sdk-text-cache.js` 提供 apply 级 agent-keyed WeakMap；只在同一 agent 对象同一 session 的完整 L 复用 SDK 文本，不以 sessionId 跨 agent 共享，也不缓存 PromptAssembly、sections、tools、contexts 或 persona。
- F/PTC 只走 `read` 最小 renderer 输入且不触碰完整 cache；F/native、F/both 不为最终会剥离的完整 SDK 渲染；L/C=0/有 `tools:sdk` 才用完整 effective schemas。
- key 为完整 `sdkSchemasForRendering` 输入保序保字段的保守指纹、原始 language、active renderer 引用；三者任一变化失效，无法无损签名不写 entry。reject/降级空文本不缓存，同 key 并发合并 Promise；dispose、new agent、new apply、部署/重启均清空边界。
- 受控基准以调用计数 1 和 L 文本逐字对拍为阻断门槛，耗时仅报告；step-04 同时对拍 C=0 模型可见目录与既有 runtime deny，P2-3、生产部署和 DSH_HOME 同步不在本批。

## 模块关系（数据流）
用户需求 → 主会话（只读探查理解）→ 探查方式二选一 ask（主会话探查 / 探查者探查）→ 路由确认（两问：第一问三选一，选项取当前 config.gateWords 的 routeDirect/routePlan/routeDisagree（出厂示例「直接执行」「进行pro规划」「不同意」），第二问纯文本「补充要求」）→ pro 规划（目的确认 → 澄清 → save_probe 线索 → 规划子代理 save_plan 双文件；planner 申请继续探查 → 主会话再探查/委派探查者 → 转达线索路径 → 预算重置继续）→ 用户批准 → 执行者（按方案改）→ 验收者（逐条核对）→ 主会话汇总 → **用户部署生产环境 → 用户实测闭环**（部署动作由用户执行；AI 在验收通过前不得执行生产环境同步/部署动作）；「直接执行」路径跳过规划环节。主会话侧仅受限规划工件 save_plan 可在任意路由态落盘（cwd/.extra-plan 固定形状 Markdown），其余写入仍须路由/批准锚点。

实机证据补充：A42/A43（C11/C12）由 step-07 HUMAN 独立取证，不能用 step-00 fake/mock、候选 probe 或工作区配置替代实际 provider/model 与 suffix 结论；request/header 是 attempted route，assistant/message source 是 actual provenance；exploreBudget=18 仍只代表 planner 工具预算。step-07 取证内存口径：先 `headerOfDir` 只读头信息筛出直接 child、再对命中目录 `parseSession`（事件不再保留 raw 行），`_shared/session-finder.mjs` 首行读改 64 KB 起步分块渐读，277 份会话工作区下默认堆可跑通。

## 运行时相关
- web 直接核心包安装经 dsh plugin add + cordis.patch.yml（host 平面行：dsh-extra-plan-settings 设置页 API、extra-plan-preset-sync 预设自愈）
- postinstall 已删除（2026-09-25 死代码清理）：不再初始化任何状态目录（0.1.7 无读取方）；预设本体随 `dsh.bundle.patch` 数组的 preset-patch.generated.yml 装载
- web 直接核心包唯一负责启动 preset-sync：lib/preset-sync.js（资产 hash + 声明行覆盖判定；写盘只经 configEditor.edit）；QQBot 侧由精简版插件自愈，dsh-extra-plan 核心对 qqbot 零感知

## 相关文档
- 导航入口：READAI.md（先读它）
- 机制设计意图/教训：pe-test/docs/ai-机制设计.md
- 维护纪律/自检/地图同步：pe-test/docs/ai-维护手册.md
- 函数级索引：pe-test/docs/ai-代码地图.md（含 step-07 HUMAN 取证入口；该入口已按两阶段头扫描+按需解析优化内存）
- 流程备查：pe-test/docs/ai-流程备查.md
- 宿主耦合台账（升级 DSH/qqbot 前必读）：pe-test/docs/ai-宿主耦合台账.md
- 实机闸门测试流程：pe-test/docs/ai-实机闸门测试流程.md

---

*本文件为 AI 维护文档，内容变化时请同步更新导航层与相关文档。*

## 闸门关键词单源（v0.3.0；升级迁移已退役）
- **唯一值源**：`config.gateWords`（7 字段集中排列，agent.cordis.yml）；JS 侧 `lib/gate-words.js` 只有字段规格/严格校验/运行时派生，**无任何出厂词值、无默认词表**；persona 的 `prefix`/`text` 双键只引用 7 个 `{{extra_plan_*}}` 变量。
- **运行时**：每次 apply 第一步 `createGateRuntime(cfg.gateWords)`（缺失/非法同步抛错，先于任何工具/监听器/服务副作用）；`inject = ['systemPrompt']`，经 `ctx.effect` 在当前 agent scope 注册恰好 7 个变量（provider 返回本次 apply 捕获值，无跨 apply 缓存）；deny 教学文案与三类 match 全部按当前词表插值/精确匹配，旧词不得推进状态。
- **启动自愈三维判定**：声明行覆盖 + 本体剥离比对 + 投影一致性 → 一致则 `idle`（不写盘）；**无 manifest 台账、无跨版本迁移**（0.1.6 及更早搬迁已放弃）。

## P2-4 B1/B2 边界补充
- exploreBudget 默认链固定为 YAML 模板叶值 → 构建期生成模块 → runtime fallback；`preset-defaults.generated.js` 带 generated/do not edit 头，descriptor 不拥有默认值，`index.js` 不在运行时解析 YAML（2026-09-23 起的例外：`lib/live-config.js` 构造期无条件解析一次、此后仅 YAML 的 mtimeMs+size 变化时再解析，用于 7 项设置热读；apply 期 cfg 快照仅作读盘失败时的兜底）。
- 生成器与 prepack 先校验后替换；坏模板保持 last-known-good，preset-sync 在目标目录写入前失败，startup 仍由既有外壳吞错不阻断。
- 新职责：`lib/shell-mutation.js` 负责跨平台命令判定，`lib/planner-budget.js` 负责预算计数/文案，`lib/runtime-static.js` 负责显式参数纯 helper，`lib/agent-runtime.js` 每次 apply 创建角色/缓存/usage baseline 状态；usage、注册/claim、disposed 同步 final fold、listener 与 pre-execute 仍归根入口。
