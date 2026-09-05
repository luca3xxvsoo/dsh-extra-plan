# 按需规划模式 — 项目概览

> AI 每次动手前速读：项目是什么、五角色、文件职责（改哪里）。函数级定位用 ai-代码地图.md。
> **改完必做**：node pe-test/tools/代码地图生成.mjs（同步地图+补描述，流程见 ai-维护手册.md）。

## 项目一句话
dsh 插件「按需规划模式」预设：AI 未经用户同意只能只读探查，经路由/澄清/批准三级机械闸门后按规划执行。五角色分工保证「用户确认 → 规划 → 执行 → 验收」闭环。

兼容：dsh v0.1.2-rc.1（0.1.1 不支持）；qqbot v0.1.0/v0.4.0 86804a8 版（56db053 版不支持）；Linux/macOS 逻辑层已验证（pe-test 写拦截 68 用例），运行时仅 Windows 实测。

## 五角色
1. 主会话：用户交互入口、需求接收、复杂度评估、路由确认、任务分派、计划展示、验收汇总
2. 探查者：后台批量只读探查、save_probe 落盘【含证据报告】、回主会话只给路径+2-3 行摘要
3. 规划子代理：只读探查 + save_plan 落盘「方案+验收标准」双文件；探查预算硬上限；continuable 可续轮
4. 执行者：按方案+验收文件机械执行、逐项自验证；one-shot 后台
5. 验收者：只读验收文件逐条机械核对；one-shot 后台

## 文件职责地图（改什么动哪里）
| 功能域 | 位置 | 备注 |
|:--|:--|:--|
| 三级闸门状态机+主闸门 | plugins/dsh-extra-plan/index.js | 修改最频繁（route/clarified/approved/channelBroken） |
| 探查预算 | index.js budget* 族（budgetNoticeText/budgetReminderText/budgetExhaustedReason 等） | 开局告知/剩3提醒/耗尽往返 |
| save_probe/save_plan/show_file 工具 | index.js 落盘族（validateProbe/renderProbeMarkdown/atomicCommit/recoverJournals/defineSavePlan 等） | 双写+journal 自愈 |
| run_code 静态拆解组判定 | index.js decomposeRunCode/runCodeGroupDenyReason | 防绕道闸门 |
| 探查者模型注入 | index.js resolveProbeRequestInjection | 上溯父会话配置 |
| 设置页后端 API | lib/settings.js（createApiHandler 等） | 仅本机环回 |
| 设置页前端 UI | lib/client.js | 打包器（__ModuleLoader__）格式，无函数级索引 |
| flash 引导 | lib/flash-guide.js | flash 模型近场引导 |
| 预设自愈核对 | lib/preset-sync.js | 启动时 hash 比对下发 |
| 执行者工具裁剪 | lib/executor-spawn.js | E8：覆盖 workflow/ralph worker |
| 预设本体（persona/deny/descriptor） | assets/presets/extra-plan/agent.cordis.yml | 改预设=改这里（复制副本再改） |
| qqbot 兼容 | plugins/dsh-qqbot-user-questions/（index.js + patches/* + scripts/apply-patch.mjs） | 文字问答/优先对话/审批流 |
| 代码地图 | pe-test/docs/ai-代码地图.md + pe-test/tools/代码地图生成.mjs | 函数级索引+增量同步 |

## 模块关系（数据流）
用户需求 → 主会话（只读探查理解）→ 判据（主会话直查 or 委派探查者 save_probe 线索）→ 路由确认 → pro 规划（澄清 → save_probe 线索 → 规划子代理 save_plan 双文件）→ 用户批准 → 执行者（按方案改）→ 验收者（逐条核对）→ 主会话汇总 → **用户部署生产环境 → 用户实测闭环**（部署动作由用户执行；AI 在验收通过前不得执行生产环境同步/部署动作）；「直接执行」路径跳过规划环节。

## 运行时相关
- 插件安装经 dsh plugin add + cordis.patch.yml（host 平面行：extra-plan-settings 设置页 API、extra-plan-preset-sync 预设自愈）
- 预设自动分发：scripts/distribute-preset.mjs（安装/更新写 DSH_HOME/.agent-presets/extra-plan/）
- 预设自愈：lib/preset-sync.js（版本 hash 比对；同版本手改不覆盖）

## 相关文档
- 导航入口：READMEAI.md（先读它）
- 机制设计意图/教训：pe-test/docs/ai-机制设计.md
- 维护纪律/自检/地图同步：pe-test/docs/ai-维护手册.md
- 函数级索引：pe-test/docs/ai-代码地图.md
- 流程备查：pe-test/docs/ai-流程备查.md

---

*本文件为 AI 维护文档，内容变化时请同步更新导航层与相关文档。*