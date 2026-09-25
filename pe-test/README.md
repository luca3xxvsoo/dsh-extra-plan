# pe-test 体检工具包（普通用户版说明）

> 这是 extra-plan 插件的**体检工具包**：装完插件后，用它检查「插件是不是真的正常」。
> 不用懂代码，照着下面的步骤做就行。

## 这份工具包分三类（记住这个分类就不乱）

| 分类 | 检查什么 | 什么时候用 |
|---|---|---|
| **逻辑检查**（step-00） | 插件「脑子里的规矩」对不对（写命令该拦的拦不拦、预算算得对不对） | 每次改完插件后 |
| **安装检查**（step-01，含 step-01-qqbot-安装映射；step-01-安装分发已删除） | 装到你电脑上后：文件全不全、设置页能不能改 | 装完插件后第一次 |
| **痕迹检查**（step-04/05/06/07/08/99） | 跑完一次真实流程后，看日志：AI 这轮干了什么、有没有违规 | 每次试完流程后 |

## 设置页入口（dsh 0.1.7）
插件设置卡片在：DSH web界面 -> 左侧边栏「插件」页 -> 官方分组 ->「按需规划模式配置」
（旧版「设置 -> 插件 -> 插件配置」路径在 0.1.7 已不存在。）
改完设置点卡片内唯一「保存」按钮；其中 web_fetch开关 / 工具呈现模式 2 项需重启 DSH 后生效。

## 怎么跑

**一键体检**（推荐）：
```
node pe-test/tools/一键step测试.mjs
```
→ 自动跑全部「自动判定项」（10 个），结果保存到 `pe-test/reports/测试报告-<时间>.md`
→ 跑之前先确认：**在完整目录（pe-test 与 plugins 同级 = 仓库根）下运行**才有完整结果
→ 报告末尾会列出「人眼项/需参数项」——那些需要你自己跑并人工判读，不是自动的；HUMAN 独立报告保留 stdout/stderr 全量原文

**step-07 实机子代理取证（HUMAN，不能无参运行）**：一键体检用 `--session <顶层主会话ID>` 显式传入 `SESSION_ID`；直接运行脚本时按下方命令显式设置环境变量，并在同一部署配置快照下提供 `PLANNER_PROMPT_SUFFIX`（空串也要显式设置）：
```powershell
$env:SESSION_ID='<顶层主会话ID>'
$env:PLANNER_PROMPT_SUFFIX='<同一部署快照的精确 suffix>'
node pe-test/tools/step-07-子代理模型与引导取证.mjs
```
脚本只读 `session.v3.jsonl.zstd` / `session.jsonl.zstd`，分开报告 request/header（attempted route，尝试路由）和 assistant/message.data.message.source（actual provenance，实际产出），只区分 pro规划/非pro规划；完整 planner 文本、budgetNotice、宿主 guidance、header.system 与 suffix 等级照实输出（对应 C11/C12）。

也可以直接跑单个文件（`node pe-test/tools/step-01-预设完整性.mjs`），效果一样。


**看结果的通用规则**：step-00 类回归脚本看退出码（exit=0 且末行含「通过」= 全过），出现 FAIL 或退出码≠0 = 有问题，记下 FAIL 行的内容；代码地图 --check 看退出码（exit=0 且含「地图与代码一致」= 全过，其他输出=有问题）。

## 每步看什么（快速索引）

| 步骤 | 跑什么 | 全过 = 说明 |
|---|---|---|
| 0 全局逻辑回归 | step-00-全流程回归 / step-00-跨平台写拦截 | 插件核心逻辑没被改坏 |
| 1 安装与配置 | step-01-设置迁移 / 安装同步 / 预设完整性 / 设置页配置 / step-01-qqbot-安装映射 | 选择性恢复、格式安全、双入口同步、设置项可改 |
| 2 anchored 引导开关 | 人工对比（无自动工具） | 开=AI 先看再答；关=直接开干；两遍有区别=开关生效 |
| 4 路由确认与写闸门 | step-04-路由与写闸门 (+ 工具清单查看) | 路由没确认时 AI 不能改文件；reviewer 不能写 |
| 5 澄清意图 | 人眼看 step-05-会话解码 | 会话里确认问过澄清问题 |
| 6 线索落盘 | step-06-线索落盘 (+ 真实会话查看) | save_probe 五态闸门、落盘无残留 |
| 7 规划预算 | 人眼看 step-06-真实会话查看 | 预算耗尽时 AI 被拒绝（日志里有 TOOL-ERROR） |
| 7A 子代理模型/引导取证 | step-07-子代理模型与引导取证（HUMAN） | A42/A43：实际 provider/model、route 与 provenance 分栏，suffix 精确等级 |
| 8 方案配对 | 人眼看 step-08-方案配对查看 | 方案+验收两个文件成对出现、时间戳一致 |
| 10 验收只读 | 覆盖在 step-04-路由与写闸门 | reviewer 只读、不碰写操作 |
| 11 代码地图一致性 | 覆盖在一键体检（`代码地图生成.mjs --check`，不写盘） | 地图与代码同步、无漏检/导航失效；**改完代码没同步地图 → 这项红**，跑 `node pe-test/tools/代码地图生成.mjs` 即可修 |

**限制口径**：save_probe 的 `PROBE_LIMITS` 当前为 evidence 最多 150 条、单条 `evidence.text` 最多 1000 字；step-00 的 PR23=151 条拒绝，PR34/PR35 覆盖 1000 通过、1001 拒绝。另有 maxEvidenceValueLen=240、maxEvidenceNoteLen=400、maxTotalChars=20000、maxEvidenceTotalChars=32000 等 20 个字段；完整字段与上限以 lib/save-contract.js PROBE_LIMITS 为唯一口径、本文不复制全量以免漂移。`exploreBudget=18` 是 planner 工具预算/单实例子调用上限，不能与上述限制或台账历史「80 条」「80+79+50=209」混用。根 `dsh-extra-plan/README.md` 不在本轮 AI 修改范围，otherAgentModel 缺口由用户自行同步。

**工具包目录说明**：pe-test/_shared/ 是取证脚本共用的解码/定位模块（session-finder / zstd-frames / host-deps / preset-hash），勿删；HUMAN 项报告沿用 `测试报告-<时间>.md` 命名，独立运行不覆盖一键体检主报告。

## 三个注意事项

1. **`tools/readme.md` 是测试数据（不是文档）**：`step-00-全流程回归` 的检查项依赖它存在，**别删、别改名**。
2. **运行前提**：部分文件要 `import 仓库里的插件代码`（相对路径 `../../plugins/...`）——如果运行时报「找不到模块」，说明当前目录不是完整目录；把 pe-test 挪回仓库根（或你准备挪回工作区时带齐 plugins）再跑。
3. `step-99-用量统计.mjs` 需要参数：`node step-99-用量统计.mjs <账本文件路径>`。口径＝**纯 token 统计**：输出一张按 `sessionId | role | model` 分组的明细表，列为
   `sessionId | role | model | provider | calls | hit | miss | out | cw | rs`（calls=调用次数、hit=输入命中、miss=输入未命中、out=输出、cw=缓存写入 cacheWriteTokens、rs=推理 reasoningTokens），
   provider 取该组首个非空值、空值显示 `-`；不做任何按 provider 或按 model 的汇总，也不输出任何折算后的数字。旧账本行（缺 provider/cw/rs）按 空串/0/0 统计，不会报错也不会被跳过。
