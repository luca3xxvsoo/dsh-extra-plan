# 按需规划模式 — 项目概览

> AI 每次动手前速读：项目是什么、五角色、文件职责（改哪里）。函数级定位用 ai-代码地图.md。
> **改完必做**：node pe-test/tools/代码地图生成.mjs（同步地图+补描述，流程见 ai-维护手册.md）。一键体检已内置 `--check` 一致性检查（不写盘）：地图过期/漏检/导航失效 → 该项判红。

## 项目一句话
dsh 插件「按需规划模式」预设：AI 未经用户同意只能只读探查，经路由/目的/澄清/批准四级机械闸门后按规划执行。五角色分工保证「用户确认 → 规划 → 执行 → 验收」闭环。工具呈现按 A=anchoredBootstrap、C=creativeMode、M=native/ptc/both 三个独立维度，F=无 tool/call、L=首个 tool/call 后判定。

兼容：dsh >= v0.1.2-rc.1 & <= v0.1.5-rc.2（0.1.1 不支持；上界与 READAI.md/README.md 口径一致）；qqbot 0.5.0 版（自愈/建链由精简版 dsh-qqbot-user-questions 承担）；Linux/macOS 逻辑层已验证（pe-test 写拦截 68 用例），运行时仅 Windows 实测。

## 五角色
1. 主会话：用户交互入口、需求接收、复杂度评估、路由确认、任务分派、计划展示、验收汇总
2. 探查者：后台批量只读探查、save_probe 落盘【含证据报告】、回主会话只给路径+2-3 行摘要
3. 规划子代理：只读探查（**不得委派探查者**，缺信息走「申请继续探查」交主会话）+ save_plan 落盘「方案+验收标准」双文件；探查预算硬上限；continuable 可续轮
4. 执行者：按方案+验收文件机械执行、逐项自验证；one-shot 后台
5. 验收者：只读验收文件逐条机械核对；one-shot 后台

## 文件职责地图（改什么动哪里）
| 功能域 | 位置 | 备注 |
|:--|:--|:--|
| 四级闸门状态机+主闸门 | plugins/dsh-extra-plan/index.js | 修改最频繁（route/purpose/clarified/approved/channelBroken） |
| 探查预算 | index.js budget* 族（budgetNoticeText/budgetReminderText/budgetExhaustedReason 等） | 开局告知/剩3提醒/耗尽往返 |
| save_probe/save_plan 工具 | index.js 落盘族（validateProbe/renderProbeMarkdown/atomicCommit/recoverJournals/defineSavePlan 等） | 双写+journal 自愈；save_plan 注册于规划子代理层+主会话层（主会话仅 direct 路由放行，T3） |
| save_probe PROBE_LIMITS | index.js validateProbe/defineSaveProbe；step-00 PR23=151、PR34/PR35 | evidence 最多 150 条、单条 evidence.text 最多 1000 字；1000 通过、1001 拒绝；描述/schema 动态读取常量 |
| run_code 静态拆解组判定 | index.js decomposeRunCode/runCodeGroupDenyReason | 防绕道闸门 |
| run_code 容错检查 | index.js runCodeCatchGateReason/runCodeDispatchGateReason（开关 cfg.runcodeCatchGate 默认 false） | 多调用独立容错硬闸门（只认逐点 try/catch；教学式拒绝）+ 单实例子调用上限=exploreBudget |
| anchored 首轮引导 | index.js system-prompt/assemble 钩子（isBootstrapPhase/keep 构造；行号见代码地图函数索引） | A=1/F/main-planner：native/both 为 HN/HB（bootstrap shell(s)+read，sections 仅 extra-plan-bootstrap）；PTC 为 HP（顶层仅 run_code，sections 精确为 extra-plan-bootstrap、tools:ptc-only、tool:read，read 为 guidance+最小契约）；L 恢复 N/P/B |
| creativeMode 持续装配投影 | index.js projectAssemblyForPresentation/renderFilteredToolsSdk 与 skill 注册源 | C=0 覆盖五角色每轮模型可见面：隐藏 7 个 Cordis 工具、tool:cordis、SDK 中对应 schema/说明，两个创造 skill 不进入 catalog；C=1 保留完整 SDK/Cordis/两个创造 skill，但 HP1 的 F/main-planner 仅暂隐 catalog；普通 skill/skill 工具保留。官方 renderer 从明确 schema 整体重建；不改变 registry binding，非运行时安全隔离 |
| 探查者模型注入 | index.js resolveProbeRequestInjection | 上溯父会话配置 |
| 实机子代理模型/提供方与引导取证 | pe-test/tools/step-07-子代理模型与引导取证.mjs | HUMAN：显式 SESSION_ID + PLANNER_PROMPT_SUFFIX；两代日志、pro规划/非pro规划、attempted route 与 actual provenance、suffix 等级 |
| 设置页后端 API | lib/settings.js（createApiHandler 等） | 仅本机环回 |
| 设置页前端 UI | lib/client.js | 打包器（__ModuleLoader__）格式；**已按函数级索引**（apply/ProConfigTab/ExtraPlanCard 等，2026-09-10 起） |
| 预设自愈核对 | lib/preset-sync.js | 启动时 hash 比对下发 |
| 执行者工具裁剪 | lib/executor-spawn.js | E8：覆盖 workflow/ralph worker |
| 预设本体（persona/deny/descriptor/设置默认） | assets/presets/extra-plan/agent.cordis.yml | 改预设=改这里（复制副本再改）；anchoredBootstrap 与 creativeMode 两个开关独立，creativeMode 默认 false |
| qqbot 自愈 | plugins/dsh-qqbot-user-questions/lib/heal.js + scripts/heal.mjs（精简版插件根 index.js 调 heal.js） | 启动/安装时迁移旧版根级 code-runtime/agent-presets 错误块 + @local 建链（两行补入由包内静态 cordis.patch.yml 承担）；不含问答/审批 |
| PTC三维装配矩阵 | pe-test/tools/step-04-路由与写闸门.mjs | 实际执行 2×2×3×2×5=120 格，逐格断言 A/C/M/F-L/五角色、C7 0/7、catalog 0/2、普通 skill、HP 与 HN/HB 基线 |
| 工具清单/时序取证 | pe-test/tools/step-04-工具清单查看.mjs | 显式会话、逻辑 JSONL 行号、前置 tool/call 数、first/later、精确 header.tools、header.system 文本命中、skill-catalog；文本命中不冒充 section 名 |
| 代码地图 | pe-test/docs/ai-代码地图.md + pe-test/tools/代码地图生成.mjs | 头部「意图速查」= 人工段（脚本原样保留、校验引用函数名）；函数索引 = 机器段（行号/增删）；`--check` 一致性门槛；覆盖口径 = 任意缩进的命名函数定义 |

## 模块关系（数据流）
用户需求 → 主会话（只读探查理解）→ 探查方式二选一 ask（主会话探查 / 探查者探查）→ 路由确认 → pro 规划（目的确认 → 澄清 → save_probe 线索 → 规划子代理 save_plan 双文件；planner 申请继续探查 → 主会话再探查/委派探查者 → 转达线索路径 → 预算重置继续）→ 用户批准 → 执行者（按方案改）→ 验收者（逐条核对）→ 主会话汇总 → **用户部署生产环境 → 用户实测闭环**（部署动作由用户执行；AI 在验收通过前不得执行生产环境同步/部署动作）；「直接执行」路径跳过规划环节。

实机证据补充：A42/A43（C11/C12）由 step-07 HUMAN 独立取证，不能用 step-00 fake/mock、候选 probe 或工作区配置替代实际 provider/model 与 suffix 结论；request/header 是 attempted route，assistant/message source 是 actual provenance；exploreBudget=18 仍只代表 planner 工具预算。

## 运行时相关
- web 直接核心包安装经 dsh plugin add + cordis.patch.yml（host 平面行：extra-plan-settings 设置页 API、extra-plan-preset-sync 预设自愈）
- web 直接核心包唯一负责预设分发：scripts/distribute-preset.mjs（安装/更新写 DSH_HOME/.agent-presets/extra-plan/）
- web 直接核心包唯一负责启动 preset-sync：lib/preset-sync.js（版本 hash 比对；同版本手改不覆盖）；QQBot 侧由精简版插件自愈，dsh-extra-plan 核心对 qqbot 零感知

## 相关文档
- 导航入口：READAI.md（先读它）
- 机制设计意图/教训：pe-test/docs/ai-机制设计.md
- 维护纪律/自检/地图同步：pe-test/docs/ai-维护手册.md
- 函数级索引：pe-test/docs/ai-代码地图.md（含 step-07 HUMAN 取证入口）
- 流程备查：pe-test/docs/ai-流程备查.md
- 宿主耦合台账（升级 DSH/qqbot 前必读）：pe-test/docs/ai-宿主耦合台账.md

---

*本文件为 AI 维护文档，内容变化时请同步更新导航层与相关文档。*