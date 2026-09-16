# 按需规划模式（AI 入口导航）

> 本文件是导航层：先读这里，按「想查什么」打开二级文档；本文档不存细节（防漂移与信息过载）。
> 运行时行为以 persona（agent.cordis.yml 注入内容）与机械闸门为准。

## 项目一句话
dsh 插件「按需规划模式」预设：AI 未经用户同意只能只读探查，经路由/目的/澄清/批准四级机械闸门后按规划执行；Pure PTC 顶层始终只保留 run_code。
五角色：主会话（入口协调）→ 探查者（只读批量+证据落盘，**仅主会话可委派**）→ 规划子代理（方案+验收双文件，不得委派探查者）→ 执行者（按方案改）→ 验收者（逐条核对）。save_probe 的 `PROBE_LIMITS` 当前为 evidence 150 条、单条 evidence.text 1000 字；step-00 PR23=151、PR34/PR35=1000/1001；exploreBudget=18 与台账历史 80/209 是不同口径。
兼容：dsh >= v0.1.2-rc.1 & <= v0.1.5-rc.2；qqbot 0.5.0 版 + 精简版 dsh-qqbot-user-questions（仅自愈+mklink，选装）。A=anchoredBootstrap、C=creativeMode、M=toolPresentationMode（native/ptc/both），F=尚无 tool/call、L=首个 tool/call 后。
A=1/F/main-planner：M=native/both 为 HN/HB（bootstrap shell(s)+read，sections 仅 extra-plan-bootstrap，无 tool:read）；M=ptc 为 HP（顶层仅 run_code，sections 精确为 extra-plan-bootstrap、tools:ptc-only、tool:read，其中 read 是 guidance+最小契约，不含完整 tools:sdk/Cordis）。A=1 的 L 与 A=0 从 N/P/B 基线开始；C=0 全角色隐藏 7 个 Cordis 展示项且两个创造 skill 不出现在 catalog，C=1 非 HP1 保留完整 SDK/Cordis/两个创造 skill，HP1 仅 F/main-planner 暂隐 catalog。以上是模型可见投影，不是 runtime binding 安全隔离（详见 ai-流程备查.md / ai-机制设计.md）。

## 文档索引（想查什么 → 打开哪个）
| 想查什么 | 打开 | 建议时机 |
|:--|:--|:--|
| 项目全貌/文件职责（改哪里） | pe-test/docs/ai-概览.md | 每次动手前 |
| 核心机制为什么这么设计、历史教训 | pe-test/docs/ai-机制设计.md | 改闸门/预算/落盘/裁剪等核心前 |
| 维护纪律+自检+地图同步 | pe-test/docs/ai-维护手册.md | 动手前、改完后 |
| 函数在几行/干什么 | pe-test/docs/ai-代码地图.md | 定位功能时：**先看文件头部「意图速查」**（意图词 → 函数名），再按函数名到索引区取行号区间 |
| 完整流程（实际机制校订版） | pe-test/docs/ai-流程备查.md | 流程细节拿不准时 |
| 宿主耦合点全表（DSH/qqbot 升级比对） | pe-test/docs/ai-宿主耦合台账.md | 升级 DSH/qqbot 前必读 |
| PTC 首轮 F→L 与 native/both HN/HB 回归实机取证 | pe-test/docs/ai-实机闸门测试流程.md | PTC 的 C=0/C=1 各用干净新顶层会话；both 回归独立 |
| 子代理模型/提供方与 pro规划引导实机取证（A42/A43、C11/C12） | pe-test/tools/step-07-子代理模型与引导取证.mjs | HUMAN：显式 SESSION_ID + PLANNER_PROMPT_SUFFIX；request/header attempted route、assistant/message actual provenance、suffix 等级分栏 |

## 必守纪律（一句）
改前逐文件备份到 `.extra-plan/backup-ptc-phase-resume-<timestamp>/`；改完按固定顺序执行 `node --check plugins/dsh-extra-plan/index.js`、两个 step-04 脚本的 `node --check`，再运行 `node pe-test/tools/step-04-路由与写闸门.mjs`、`node pe-test/tools/代码地图生成.mjs`，维护人类段后执行 `node pe-test/tools/代码地图生成.mjs --check`。**改完不同步地图 = 一键体检「代码地图一致性」判红**。根 `dsh-extra-plan/README.md`、pe-test README、宿主耦合台账及官方文件本轮不编辑。

## 真相源
- 角色 persona/deny 清单 → assets/presets/extra-plan/agent.cordis.yml
- 函数行号/描述 → pe-test/docs/ai-代码地图.md
- 机制「为什么」详版注释 → 各源码文件注释（指向见 ai-机制设计.md 教训索引表）

---

**AI禁止修改README.MD**