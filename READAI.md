# 按需规划模式（AI 入口导航）

> 本文件是导航层：先读这里，按「想查什么」打开二级文档；本文档不存机制细节，只保留导航与易漂移的数值/投影口径锚点（防漂移与信息过载）。
> 运行时行为以 persona（agent.cordis.yml 注入内容）与机械闸门为准。

## 项目一句话
dsh 插件「按需规划模式」预设：AI 未经用户同意只能只读探查，经路由/目的/澄清/批准四级机械闸门后按规划执行；Pure PTC 顶层始终只保留 run_code。
五角色：主会话（入口协调）→ 探查者（只读批量+证据落盘，**仅主会话可委派**）→ 规划子代理（方案+验收双文件，不得委派探查者）→ 执行者（按方案改）→ 验收者（逐条核对）。save_probe 的 `PROBE_LIMITS` 当前为 evidence 150 条、单条 evidence.text 1000 字；step-00 PR23=151、PR34/PR35=1000/1001；exploreBudget=18 与台账历史 80/209 是不同口径。
兼容：dsh >= v0.1.2-rc.1 & <= v0.1.5-rc.2；qqbot 0.5.0 版 + 精简版 dsh-qqbot-user-questions（仅自愈+mklink，选装）。A=anchoredBootstrap、C=creativeMode、M=toolPresentationMode（native/ptc/both），F=尚无 tool/call、L=首个 tool/call 后。
A=1/F/main-planner：M=native/both 为 HN/HB（bootstrap shell(s)+read，sections 仅 extra-plan-bootstrap，无 tool:read）；M=ptc 为 HP（顶层仅 run_code，sections 精确为 extra-plan-bootstrap、tools:ptc-only、tool:read，其中 read 是 guidance+最小契约，不含完整 tools:sdk/Cordis）。A=1 的 L 与 A=0 从 N/P/B 基线（N=native/P=ptc/B=both）开始；C=0 全角色隐藏 7 个 Cordis 展示项且两个创造 skill 不出现在 catalog，C=1 不因 C 隐藏——非 HP1 且非 anchored 时保留完整 SDK/Cordis/两个创造 skill，HP1 仅 F/main-planner 暂隐 catalog。以上是模型可见投影，不是 runtime binding 安全隔离（详见 ai-流程备查.md / ai-机制设计.md）。

## 文档索引（想查什么 → 打开哪个）
| 想查什么 | 打开 | 建议时机 |
|:--|:--|:--|
| 项目全貌/文件职责（改哪里） | pe-test/docs/ai-概览.md | 每次动手前 |
| 体检工具包怎么跑（普通用户版） | pe-test/README.md | 装完插件第一次体检时 |
| 核心机制为什么这么设计、历史教训 | pe-test/docs/ai-机制设计.md | 改闸门/预算/落盘/裁剪等核心前 |
| 维护纪律+自检+地图同步 | pe-test/docs/ai-维护手册.md | 动手前、改完后 |
| 函数在几行/干什么 | pe-test/docs/ai-代码地图.md | 定位功能时：**先看文件头部「意图速查」**（意图词 → 函数名），再按函数名到索引区取行号区间 |
| 完整流程（实际机制校订版） | pe-test/docs/ai-流程备查.md | 流程细节拿不准时 |
| 宿主耦合点全表（DSH/qqbot 升级比对） | pe-test/docs/ai-宿主耦合台账.md | 升级 DSH/qqbot 前必读 |
| PTC 首轮 F→L 与 native/both HN/HB 回归实机取证 | pe-test/docs/ai-实机闸门测试流程.md | PTC 的 C=0/C=1 各用干净新顶层会话；both 回归独立 |
| 子代理模型/提供方与 pro规划引导实机取证（A42/A43、C11/C12） | pe-test/tools/step-07-子代理模型与引导取证.mjs | 首次实机取证前 |

> 脚注（step-07 行用法）：HUMAN：显式 SESSION_ID + PLANNER_PROMPT_SUFFIX；request/header attempted route、assistant/message actual provenance、suffix 等级分栏。

## 必守纪律（一句）
改前逐文件备份到 `.extra-plan/backup-<任务名>-<timestamp>/`（与维护手册备份条款口径一致）；工作目录固定为 dsh-extra-plan（仓库根）；改完按固定顺序执行根入口与 8 个新增 lib 的 `node --check`（`plugins/dsh-extra-plan/index.js`、`lib/run-code-static.js`、`lib/save-contract.js`、`lib/save-probe-validation.js`、`lib/save-persistence.js`、`lib/save-tool-factories.js`、`lib/agent-session.js`、`lib/model-routing.js`、`lib/assembly-presentation.js`），再运行 `node pe-test/tools/step-00-全流程回归.mjs`、`node pe-test/tools/step-04-路由与写闸门.mjs`、`node pe-test/tools/step-06-线索落盘.mjs`、`node pe-test/tools/代码地图生成.mjs`，人工段维护后执行 `node pe-test/tools/代码地图生成.mjs --check`，最后执行 `node pe-test/tools/一键step测试.mjs`。**改完不同步地图 = 一键体检「代码地图一致性」判红**。**唯一禁改文档：根 `dsh-extra-plan/README.md`（与 READAI.md 同层级）；其余文档（含各级 README.md、pe-test/docs/ai-宿主耦合台账.md）均可改；官方安装的预设与技能只读引用、不复制不改写。**

## 真相源
（以下路径相对 plugins/dsh-extra-plan/）
- 角色 persona/deny 清单 → assets/presets/extra-plan/agent.cordis.yml
- 函数行号/描述 → pe-test/docs/ai-代码地图.md（唯一来源模块登记：lib/agent-session.js 会话快照/子代理识别）
- 机制「为什么」详版注释 → 各源码文件注释（指向见 ai-机制设计.md 教训索引表）

---

**AI 禁改文档仅一处：根 `dsh-extra-plan/README.md`（与本文同层级）；其余文档（含各级 README.md、台账）均可改。**