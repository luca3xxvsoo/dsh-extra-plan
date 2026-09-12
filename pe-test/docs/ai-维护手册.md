# 维护手册（AI 动手纪律 + 自检 + 地图同步）

## 动手前
- 备份：修改目标文件前复制到 .extra-plan/backup-<目标>-<yyyyMMdd>/（项目惯例）
- 改预设（agent.cordis.yml）：复制现有预设为副本再改；官方安装的预设/技能只读引用（不复制不改写）
- 先读：ai-概览.md（改哪里）、ai-机制设计.md（改核心前）、ai-代码地图.md（定位函数）
- **验收与部署次序**：先仓库内验收 → 用户部署生产 → 生产测试。AI 在验收通过前不得执行生产环境同步/部署动作（dsh plugin 更新、distribute-preset.mjs、复制 DSH_HOME 安装目录、.agent-presets 下发等均属用户侧部署）
- 复杂嵌套/拼接的修改遵循转义纪律：最终目标语言视角写出正确代码 → 逐层向外转义 → 解析回放验证（全局纪律）

## Web 核心与 QQBot 分发所有权
| profile | 唯一职责 | 迁移边界 |
|:--|:--|:--|
| web | 直接安装 `@local/dsh-extra-plan`；持有核心 bundle/依赖、allow-build、`distribute-preset` 与启动 `preset-sync` | 不从 web 删除核心包或预设 |
| qqbot | 直接安装 `@local/dsh-qqbot-user-questions`（精简版）；apply/postinstall 自愈：补 `cordis.patch.yml` 的 code-runtime/agent-presets 行 + 建 `@local/dsh-extra-plan` → web 同名包链接 | 不声明核心直接依赖，不分发预设，不执行 `preset-sync`；不含问答/审批/补丁分发 |

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
1. 静态校验：node --check <改动的 js/mjs>
2. 同步代码地图：node pe-test/tools/代码地图生成.mjs
   - 读 stdout：[新增] → 补写描述；[删除] → 核对是真删除还是改名（旧描述在报告里，沾回新行）；[行号] → 正常（无动作）
   - 补写 pe-test/docs/ai-代码地图.md 中（待补充）描述；脚本只更新结构，不覆盖已有描述
   - 一键体检已内置一致性检查（`代码地图生成.mjs --check`，**不写盘**）：地图与代码不一致（[新增]/[行号]/[删除]）或存在漏检/导航失效 → 该项判**失败**，提示先跑同步
   - 地图头部「意图速查」整节由人工维护（脚本原样保留）；其引用的函数改名/删除后会报 [导航失效]
3. 跑对应自检（见下表）
4. 交付汇报：改动点 / 校验结果 / 备份路径 / 风险点；用户实测确认后才算完成

## 自检工具速查（pe-test/tools/）
| 改动域 | 自检 |
|:--|:--|
| 闸门/路由/写拦截 | step-04-路由与写闸门.mjs |
| planner 探查委派禁令（T5）+ save_plan 主会话路由（T3）+ plannerModel 降级判定（T2） | step-04-路由与写闸门.mjs（T3/T5 监听器级）、step-00-全流程回归.mjs（PM 系列纯函数直测）、step-06-线索落盘.mjs（save_plan 注册与路由矩阵） |
| save_probe/save_plan 落盘 | step-06-线索落盘.mjs |
| 预设安装/完整性/设置页 | step-01-预设完整性.mjs、step-01-安装分发.mjs、step-01-设置页配置.mjs |
| 全量回归 | step-00-全流程回归.mjs（需真实 session_id；一键step测试.mjs 同） |
| usage 账本 | step-99-用量统计.mjs |
| 跨平台写拦截 | step-00-跨平台写拦截.mjs |
| 代码地图（口径/覆盖/导航） | 一键step测试.mjs 内置「代码地图生成.mjs --check」（不写盘，比对结构+漏检+导航失效）；同步仍用 node pe-test/tools/代码地图生成.mjs |
| 会话解码/取证 | step-05-会话解码.mjs、step-06-真实会话查看.mjs、step-08-方案配对查看.mjs |
| 机械闸门实机逐条实测（非 mock/静态自检，both 单形态 × catchGate 两轮） | pe-test/docs/ai-实机闸门测试流程.md（AI 给脚本、用户照做、当场取证判定） |

## 代码地图（函数级索引）维护规则
- 定位功能：grep pe-test/docs/ai-代码地图.md 关键词（函数名/功能词）→ 得文件+行号 → read 区间；地图未覆盖再 glob/grep/read 探查
- 行号/增删行由脚本维护；功能描述与备注由 AI/人维护
- 函数改名 = 删旧增新，旧描述出现在脚本删除报告里（沾回新行即可）
- 「意图速查」（文件头部）：意图词 → 文件 → 函数名，人工维护、脚本保留；行号一律到「函数索引」按函数名取（人工段不写行号，防漂移）
- 覆盖口径 = 任意缩进的命名函数定义（`function NAME` / `const|let|var NAME = (…) =>` / `= function`）；反向计数器与抽取器同口径，只用于抓实现层漏检

---

*本文件对应 READAI.md 导航层「维护纪律」一行的展开。*