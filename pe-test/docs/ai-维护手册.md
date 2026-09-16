# 维护手册（AI 动手纪律 + 自检 + 地图同步）

## 动手前
- 备份：修改前将本轮 10 个目标逐路径镜像到 `.extra-plan/backup-ptc-phase-resume-<timestamp>/`，不得覆盖旧备份
- 改预设（agent.cordis.yml）：复制现有预设为副本再改；官方安装的预设/技能只读引用（不复制不改写）
- 先读：ai-概览.md（改哪里）、ai-机制设计.md（改核心前）、ai-代码地图.md（定位函数）
- **验收与部署次序**：先仓库内验收 → 用户部署生产 → 生产测试。AI 在验收通过前不得执行生产环境同步/部署动作（dsh plugin 更新、distribute-preset.mjs、复制 DSH_HOME 安装目录、.agent-presets 下发等均属用户侧部署）
- **本轮 README 边界**：根 `dsh-extra-plan/README.md` 不编辑、不备份；其中 otherAgentModel 文档缺口只记录在本维护范围，由用户自行同步。
- 复杂嵌套/拼接的修改遵循转义纪律：最终目标语言视角写出正确代码 → 逐层向外转义 → 解析回放验证（全局纪律）

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
1. 先同步本轮语义文档：`READAI.md` 与 `pe-test/docs` 下 6 份指定文档（共 7 个目标文档）；根 README、pe-test/README.md、ai-宿主耦合台账.md 不编辑。
2. 本轮按固定顺序逐文件执行 3 个语法门（工作目录固定为 dsh-extra-plan）：
   - node --check plugins/dsh-extra-plan/index.js







   - node --check pe-test/tools/step-04-路由与写闸门.mjs
   - node --check pe-test/tools/step-04-工具清单查看.mjs
   每条退出码必须为 0，且无 SyntaxError 或其它解析错误。
3. 运行 5 个 step-01 回归：设置页配置、设置迁移、预设完整性、安装同步、安装分发。
4. 运行 step-04-路由与写闸门.mjs：实际执行 A/C/M/F-L × 五角色的 2×2×3×2×5=120 格，逐格核对 C7 0/7、catalog 0/2、普通 skill、HP 最小 read、HN/HB 无 tool:read 及既有 deny；再以显式会话目录运行 step-04-工具清单查看.mjs 取证。
5. 先运行 `node pe-test/tools/代码地图生成.mjs` 更新机器段；再只补允许的人类意图速查/功能描述/备注，最后运行 `node pe-test/tools/代码地图生成.mjs --check`，退出码必须为 0。机器段文件/函数/行号/增删由脚本维护；模型可见面隐藏不是 PTC runtime binding 安全隔离。
6. 交付汇报：改动点 / 每条校验结果 / 备份路径 / 风险点；用户实测确认后才算完成

## 自检工具速查（pe-test/tools/）
| 改动域 | 自检 |
|:--|:--|
| 闸门/路由/写拦截与A/C/M展示装配 | step-04-路由与写闸门.mjs（监听器级 + 120 格 A/C/M/F-L/五角色案例，含 C7/catalog/HP/HN/HB 断言）+ step-00-跨平台写拦截.mjs（68 用例） |
| planner 探查委派禁令（T5）+ save_plan 主会话路由（T3）+ plannerModel/otherAgentModel 降级与跨 Provider 时序（T2） | step-04-路由与写闸门.mjs（T3/T5 监听器级）、step-00-全流程回归.mjs（planner 与 executor/reviewer/probe/workflow/ralph worker 的 True/False 分流、真实 OK probe、排序、失败隔离、fallback、timeout、per-Agent cache、agent/request 屏障）、step-06-线索落盘.mjs（save_plan 注册与路由矩阵） |
| save_probe 机械上限/动态描述 | step-00-全流程回归.mjs（PROBE_LIMITS：evidence 150、text 1000，PR23=151、PR34/PR35=1000/1001；实际 schema 动态断言） |
| save_probe/save_plan 落盘 | step-06-线索落盘.mjs |
| 预设安装/完整性/设置页/十项迁移 | step-01-预设完整性.mjs、step-01-安装分发.mjs、step-01-安装同步.mjs、step-01-设置迁移.mjs、step-01-设置页配置.mjs（descriptor/metadata/locator/manifest 从 9 到 10，creativeMode 默认 false、true/false PUT、非法值与 skipped-old-missing） |
| 全量回归 | step-00-全流程回归.mjs（本地 mock/in-process，不需真实 session_id；一键step测试.mjs 同）。**一键体检的自动判定项共 11 项**（以 `一键step测试.mjs` 的 AUTO 数组为准）：step-00-全流程回归、step-00-跨平台写拦截、step-01-设置迁移、step-01-安装分发、step-01-安装同步、step-01-预设完整性、step-01-设置页配置、step-01-qqbot-安装映射、step-04-路由与写闸门、step-06-线索落盘、代码地图生成.mjs（--check） |
| usage 账本 | step-99-用量统计.mjs |
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

*本文件对应 READAI.md 导航层「维护纪律」一行的展开。*

补充口径：`PROBE_LIMITS.maxEvidenceEntries=150`、`maxEvidenceTextLen=1000`；`exploreBudget=18` 仅是 planner 探查预算/单实例子调用上限，台账历史 80 条与 80+79+50=209 仍是归档统计。