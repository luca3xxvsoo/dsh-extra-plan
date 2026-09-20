# 维护手册（AI 动手纪律 + 自检 + 地图同步）

## 动手前
- 备份：修改前把本轮实际改动的每个文件按原目录结构逐路径镜像到 `.extra-plan/backup-<本轮任务名>-<timestamp>/`；不得覆盖旧备份目录；根 README 禁改、不备份。
- 改预设（agent.cordis.yml）：复制现有预设为副本再改；官方安装的预设/技能只读引用（不复制不改写）
- 先读：ai-概览.md（改哪里）、ai-机制设计.md（改核心前）、ai-代码地图.md（定位函数）
- **验收与部署次序**：先仓库内验收 → 用户部署生产 → 生产测试。AI 在验收通过前不得执行生产环境同步/部署动作（dsh plugin 更新、distribute-preset.mjs、复制 DSH_HOME 安装目录、.agent-presets 下发等均属用户侧部署）
- **README 边界**：根 `dsh-extra-plan/README.md` 不编辑、不备份；pe-test/README.md 等其它层级 README 可改；其中 otherAgentModel 文档缺口只记录在本维护范围，由用户自行同步。
- 复杂嵌套/拼接的修改遵循转义纪律：最终目标语言视角写出正确代码 → 逐层向外转义 → 解析回放验证（全局纪律）
- 工作区外写入（如 ~/.dsh/memory/ 记忆库）：沙箱拒绝时唯一放行通道 = shell 命令 + sandbox_permissions 提权（一次性重试，需用户批准；AGENTS.md 协议已有规定，本项目遵守）。严禁通过改用工具名称绕过沙箱限制。
- 闸门拒绝消息已含修复指令（如「已保护 M 个」「参数不可解析」「须先 ask_user_question 路由确认」「选项固定为…」）——照改写法即可通过，严禁换工具/改调用方式绕过；绕过尝试会被后续闸门拦截。

## Web 核心与 QQBot 分发所有权
| profile | 唯一职责 | 迁移边界 |
|:--|:--|:--|
| web | 直接安装 `@local/dsh-extra-plan`；持有核心 bundle/依赖、allow-build、`distribute-preset` 与启动 `preset-sync` | 不从 web 删除核心包或预设 |
| qqbot | 直接安装 `@local/dsh-qqbot-user-questions`（精简版）；两行补入由包内静态 `cordis.patch.yml` 的 insert 承担，apply/postinstall 自愈只做两件事：迁移旧版根级 code-runtime/agent-presets 错误块 + 建 `@local/dsh-extra-plan` → web 同名包链接 | 不声明核心直接依赖，不分发预设，不执行 `preset-sync`；不含问答/审批/补丁分发 |

### 已有残留迁移（用户侧）
- 前提：先由用户完成 web 核心安装和预设分发，再通过 profile 的 pnpm/DSH 包管理流程移除 qqbot/package.json 的直接 `@local/dsh-extra-plan`；由 pnpm 同步 lock、`.modules.yaml`、`virtualStoreDir`、`storeDir` 与 hoisted 解析状态，最后重新安装/刷新 QQBot 兼容包。
- lock、`.modules.yaml`、`.pnpm`、store 等均由 pnpm 管理，禁止手工编辑或删除；Junction 由精简版插件自愈（apply/postinstall）在目标缺失时创建。
- helper 仅在目标缺失时建链；已有实体目录或非目标链接保留并提示用户走 pnpm 迁移。

### 禁止递归删除
| 对象 | 规则 |
|:--|:--|
| `qqbot/node_modules/@local/dsh-extra-plan`、`@local` 父目录 | helper 不递归删除、不替换既有实体或非目标链接；由用户通过 pnpm 迁移 |
| `qqbot/node_modules`、`node_modules/.pnpm`、pnpm store | 禁止递归删除或手工清理 |
| `profiles/web`、`profiles/qqbot`、`.agent-presets` | 禁止递归删除；生产状态由用户的 pnpm/DSH 流程维护 |
- 仓库改动和回归通过后，生产 profile 迁移由用户执行；仓库验收不是生产部署许可，AI 不接触 `C:\Users\Administrator\.dsh\profiles`。

## 改完后
1. 先同步本轮语义文档：`READAI.md` 与 `pe-test/docs` 下 6 份指定文档（共 7 个目标文档）。唯一禁改文档：根 `dsh-extra-plan/README.md`（与 READAI.md 同层级）；其余文档（含各级 README.md、pe-test/docs/ai-宿主耦合台账.md）均可改；官方安装的预设与技能只读引用、不复制不改写。
2. 本轮按固定顺序逐文件执行 9 个语法门（本轮实际改动过的每个 .js / .mjs 都要逐一 node --check，不只限下列 9 个；下列 9 个为当前基线清单；工作目录固定为 dsh-extra-plan）：
   - node --check plugins/dsh-extra-plan/index.js
   - node --check plugins/dsh-extra-plan/lib/run-code-static.js
   - node --check plugins/dsh-extra-plan/lib/save-contract.js
   - node --check plugins/dsh-extra-plan/lib/save-probe-validation.js
   - node --check plugins/dsh-extra-plan/lib/save-persistence.js
   - node --check plugins/dsh-extra-plan/lib/save-tool-factories.js
   - node --check plugins/dsh-extra-plan/lib/agent-session.js
   - node --check plugins/dsh-extra-plan/lib/model-routing.js
   - node --check plugins/dsh-extra-plan/lib/assembly-presentation.js
3. 语法门全部退出码为 0 后，按本轮固定顺序运行：`node pe-test/tools/step-00-全流程回归.mjs` → `node pe-test/tools/step-04-路由与写闸门.mjs` → `node pe-test/tools/step-06-线索落盘.mjs` → `node pe-test/tools/代码地图生成.mjs`；人工段维护后运行 `node pe-test/tools/代码地图生成.mjs --check`，最后运行 `node pe-test/tools/一键step测试.mjs`。每条退出码必须为 0，且无 SyntaxError 或其它解析错误。
4. 全量维护时仍可运行 6 个 step-01 回归（设置页配置、设置迁移、预设完整性、安装同步、安装分发、qqbot 安装映射）；step-04 工具清单可另以显式会话目录取证。模型可见面隐藏不是 PTC runtime binding 安全隔离。
5. 交付汇报：改动点 / 每条校验结果 / 备份路径 / 风险点；用户实测确认后才算完成

## 自检工具速查（pe-test/tools/）
| 改动域 | 自检 |
|:--|:--|
| 闸门/路由/写拦截与A/C/M展示装配 | step-04-路由与写闸门.mjs（监听器级 + 120 格 A/C/M/F-L/五角色案例，含 C7/catalog/HP/HN/HB 断言）+ step-00-跨平台写拦截.mjs（68 用例） |
| planner 探查委派禁令（T5）+ save_plan 主会话侧受限规划工件（任意路由态放行，save_probe 放行条件保持现状）+ plannerModel/otherAgentModel 降级与跨 Provider 时序（T2） | step-04-路由与写闸门.mjs（save_plan 五态全 allow 与 R107 组判定、T5 监听器级）、step-00-全流程回归.mjs（planner 与 executor/reviewer/probe/workflow/ralph worker 的 True/False 分流、真实 OK probe、排序、失败隔离、fallback、timeout、per-Agent cache、agent/request 屏障）、step-06-线索落盘.mjs（save_plan 注册与路由矩阵：任意路由态 allow） |
| 注册失败路径与重试（P0-2/D1：失败不写标记、下一步重试；重名与永久性错误记终态不重试） | step-06-线索落盘.mjs（S6 服务不可用→次轮成功、S7 可重试错→次轮成功、S8 重名不重试、S9 永久性不重试、S10 pre-step 注册只影响下一步）、step-04-路由与写闸门.mjs（C4 认领时服务不可用→次轮成功、C5 可重试错粘性不重复消费、C6 重名不重试、C7 永久性不重试） |
| save_probe 机械上限/动态描述 | lib/save-contract.js（PROBE_LIMITS/渲染合同）+ lib/save-probe-validation.js（validateProbe）+ lib/save-tool-factories.js（动态 schema/execute）；step-00-全流程回归.mjs（evidence 150、text 1000，PR23=151、PR34/PR35=1000/1001；实际 schema 动态断言） |
| save_probe/save_plan 落盘（含事务阶段语义） | lib/save-persistence.js（atomicCommit 阶段感知提交/recoverJournals 完成判定；两函数末位各带可选 fs 依赖，默认冻结只读、未提供项回退默认实现）+ lib/save-tool-factories.js（工具定义）+ index.js（apply 注册/闸门接线）；step-06-线索落盘.mjs ⑤ 段逐阶段故障注入覆盖：正常双写、tmp 写失败、journal 已落盘后写桩抛错（pre-journal 条件清理成功／journal 删不掉则 journal+全部 tmp 保留且抛原始错误）、第一次与第二次 rename 失败、最终删 journal 失败、全目标确认前不删 journal、恢复 rename 失败可续做、已完成项幂等续做、tmp 与目标均缺失保留 journal 并告警、旧形状双端恢复、形状非法保留、sessionTag 跳过与失败隔离 |
| 预设安装/完整性/设置页/十项迁移 | step-01-预设完整性.mjs、step-01-安装分发.mjs、step-01-安装同步.mjs、step-01-设置迁移.mjs、step-01-设置页配置.mjs（descriptor/metadata/locator/manifest 从 9 到 10，creativeMode 默认 false、true/false PUT、非法值与 skipped-old-missing；归属：descriptor（预设完整性）/ metadata 10 项（设置页配置）/ locator（设置页配置）/ manifest（设置迁移）/ creativeMode PUT（设置页配置）/ skipped-old-missing（安装同步）） |
| 全量回归 | step-00-全流程回归.mjs（本地 mock/in-process，不需真实 session_id；一键step测试.mjs 同）。**一键体检的自动判定项共 11 项**（以 `一键step测试.mjs` 的 AUTO 数组为准）：step-00-全流程回归、step-00-跨平台写拦截、step-01-设置迁移、step-01-安装分发、step-01-安装同步、step-01-预设完整性、step-01-设置页配置、step-01-qqbot-安装映射、step-04-路由与写闸门、step-06-线索落盘、代码地图生成.mjs（--check） |
| usage 账本（含会话状态生命周期） | step-99-用量统计.mjs（真实 ledger 读侧 token 用量统计：明细列 sessionId|role|model|provider|calls|hit|miss|out|cw|rs，纯 token 口径、无任何汇总）+ step-04-路由与写闸门.mjs ⑭e 段（P4-1~P4-24 监听器级：双 session 同 rootCallId 各 1~18 allow/19 deny、session B 锚点变化不清 A 的计数、disposed A 后同 sessionId 从空开始且 B 保持、临时账本的 one-shot 末轮 flush（role=executor、seq/token/model 正确）、重复 disposed 幂等、同 session 续载只写新 seq、可解析 cursor 保留其它 session、ENOENT 静默、损坏/非对象 cursor 告警一次并覆盖写、final fold 写入失败的既有单次 warning 且不阻断清理、P4-24 新字段落盘（provider/cacheWriteTokens/reasoningTokens 取值正确，hit/miss/out 全零而 cw 非零的行不被跳过，旧形状行按 空串/0/0 落盘）） |
| 跨平台写拦截 | step-00-跨平台写拦截.mjs |
| 代码地图（口径/覆盖/导航） | 一键step测试.mjs 内置「代码地图生成.mjs --check」（不写盘，比对结构+漏检+导航失效）；同步仍用 node pe-test/tools/代码地图生成.mjs |
| 会话解码/取证 | step-05-会话解码.mjs、step-06-真实会话查看.mjs、step-07-子代理模型与引导取证.mjs、step-08-方案配对查看.mjs |
| 机械闸门与PTC F/L实机取证（非 mock/静态自检） | pe-test/docs/ai-实机闸门测试流程.md（PTC C=0/C=1 干净会话 F→L；native/both HN/HB 独立回归；both 机械轮另行执行） |
| 子代理模型/提供方与 suffix 实机取证（A42/A43、C11/C12） | step-07-子代理模型与引导取证.mjs（HUMAN；显式 SESSION_ID + PLANNER_PROMPT_SUFFIX；request/header attempted route 与 assistant/message actual provenance 分列，suffix 等级完整保留） |

## 代码地图（函数级索引）维护规则
- 定位功能：grep pe-test/docs/ai-代码地图.md 关键词（函数名/功能词）→ 得文件+行号 → read 区间；地图未覆盖再 glob/grep/read 探查
- 代码变更后先运行 node pe-test/tools/代码地图生成.mjs 更新机器行号/时间戳；行号/增删行由脚本维护，功能描述与备注由 AI/人维护，最后运行 --check
- 函数改名 = 删旧增新，旧描述出现在脚本删除报告里（沾回新行即可）
- 「意图速查」（文件头部）：意图词 → 文件 → 函数名，人工维护、脚本保留；行号一律到「函数索引」按函数名取（人工段不写行号，防漂移）
- 覆盖口径 = 任意缩进的命名函数定义（`function NAME` / `const|let|var NAME = (…) =>` / `= function`）；反向计数器与抽取器同口径，只用于抓实现层漏检

---

*本文件对应 READAI.md 文档索引表「维护纪律+自检+地图同步」一行与「必守纪律（一句）」的展开。*

补充口径：`PROBE_LIMITS.maxEvidenceEntries=150`、`maxEvidenceTextLen=1000`；`exploreBudget=18` 仅是 planner 探查预算/单实例子调用上限，台账历史 80 条与 80+79+50=209 仍是归档统计。

- PROBE_LIMITS 的字段名与上限以 `lib/save-contract.js` L47-70 为唯一口径（共 20 个字段：四类条目数 50/50/20/20、maxPathLen 1024、maxRangeLen 20、maxRelationLen 400、maxNoteLen 400、maxTopicLen 120、maxDetailLen 1000、maxTotalChars 20000、rangePattern、maxEvidenceEntries 150、maxEvidenceLineLen 20、maxEvidenceValueLen 240、maxEvidenceTextLen 1000、maxEvidenceNoteLen 400、maxEvidenceTotalChars 32000、evidenceLinePattern、maxTaskNameLen 32），本文不复制数值以免漂移。LINE_FORMAT_HINT（L73）与 RANGE_FORMAT_HINT（L74）为格式提示常量，同样以源码为口径。
- save_probe 单写路径同样调用 recoverJournals 且不带 sessionTag（save-tool-factories L177；旧 L3632 同）。此前文档只写『下次 save_plan 自愈补完』——这是拆分前既有缺口，本次记录不修代码。
- 本机 Windows 沙箱下 netstat / Get-NetTCPConnection / Get-WmiObject Win32_Process 等查询可能被拒（Program failed to run: 拒绝访问）；排查运行时改用等价间接证据（进程启动时点、会话内闸门生效日志、step-04/06 等取证脚本输出）。