# 维护手册（备份、修改、回归与交付）

> 本文回答“怎么安全改、改完跑什么”。机制理由读 [ai-机制设计](ai-机制设计.md)，流程交接读 [ai-流程备查](ai-流程备查.md)。

## 动手前

1. **先读与登记**：先读方案和验收文件，再读所有目标文件；按原章节建立迁移矩阵。没有矩阵证据的段落默认保留。
2. **唯一备份**：修改前把本轮实际改动文件按原目录镜像到唯一 `.extra-plan/backup-dsh-extra-plan-JS审查修复-<YYYYMMDDHHMMSS>/`；同任务续跑沿用原目录，不覆盖原始镜像。文件镜像和子块独立回退是人工纪律，不声称已有自动闸门。
3. **范围**：本项目 AI 文档可按批准方案修改，含宿主台账；仓库根 `README.md`、插件源码、测试脚本、官方文件/预设、生成物、生产环境和 `$DSH_HOME` 禁止修改。不得执行 `git reset`、`git checkout`、`git clean`。
4. **备份后再改**：改预设时只改作者源并由生成器重建；本轮文档精简不改预设。生产部署由用户执行，仓库验收不是部署许可。
5. **嵌套命令纪律**：涉及 `run_code`/PowerShell/字符串拼接时，先按最终语言写正确文本，再逐层转义，写后解析回放；Markdown 不伪造代码语法结果。

## Web/QQBot 所有权与部署边界

| profile | 当前职责 | 本仓库 AI 边界 |
|:--|:--|:--|
| web | 直接安装核心包；启动 `preset-sync`；承载 profile patch 预设声明行 | 不删除核心包/预设，不写生产 profile |
| qqbot | 安装精简兼容包；静态 patch、旧块迁移与 web 包建链 | 不分发核心预设；真实消息、`/preset`、question/approval、allow-build/postinstall 为用户部署后 HUMAN |

`$DSH_HOME/profiles`、`.agent-presets` 和其它生产目录只允许用户侧部署流程触碰；本轮不做同步、清锁、重启或现场修复。

## 修改后固定顺序

1. 对**本轮实际修改的 JS/MJS**逐文件执行 `node --check`；本轮实际修改为 `plugins/dsh-extra-plan/index.js` 与 `pe-test/tools/step-04-路由与写闸门.mjs` 两文件（按批准方案），两文件均须通过语法门。
2. 在仓库根依次运行：
   - `node pe-test/tools/step-00-全流程回归.mjs`
   - `node pe-test/tools/step-04-路由与写闸门.mjs`
   - `node pe-test/tools/step-06-线索落盘.mjs`
   - `node pe-test/tools/代码地图生成.mjs`
   - 人工复核地图描述、结构键、同名顺序
   - `node pe-test/tools/代码地图生成.mjs --check`
   - `node pe-test/tools/一键step测试.mjs`
3. 每条命令退出码必须为 0；输出不得有 `FAIL`、`SyntaxError`、`UnhandledPromiseRejection`、漏检或导航失效。AUTO 项数量只认 [一键step测试.mjs](../tools/一键step测试.mjs) 的 `AUTO` 数组；SKIP/HUMAN 不计作通过。
4. 生产部署与实机测试由用户另行执行；实机流程中现场 mode、A/C、gateWords、SESSION_ID、模型、suffix 和残留数量必须现场读取。

## 改动域 → 唯一检查入口

| 改动域 | 主要检查 |
|:--|:--|
| 闸门（含 job_kill/send_message/job_list/list_agents 四工具闸门）、route/purpose、A/C/M、PTC 呈现 | `step-00-全流程回归.mjs`、`step-04-路由与写闸门.mjs` |
| save_plan/save_probe、journal、证据合同 | `step-00-全流程回归.mjs`、`step-06-线索落盘.mjs`；限制以 `lib/save-contract.js` 为准 |
| 预设默认、settings、profile patch 自愈 | 对应 step-01 脚本；生成器与产物 `--check` 只读验证 |
| 模型路由、usage、会话形状 | step-00、step-04 P4、step-07 HUMAN 取证；静态结果不替代实机 |
| 代码地图 | `node pe-test/tools/代码地图生成.mjs` → 人工描述复核 → `--check`；一键测试也内置 `--check` |
| 宿主升级/QQBot | [ai-宿主耦合台账](ai-宿主耦合台账.md) 的当前 checklist；SKIP 不销账，HUMAN 不伪造通过 |
| 实机闸门 | [ai-实机闸门测试流程](ai-实机闸门测试流程.md)；保持单文件顺序，不拆表/改编号 |

## 代码地图维护规则

- `## 意图速查`、`## 文件总览`、`## 函数索引` 和原表头必须保留。先 grep 意图词得到函数名，再按函数名读机器行号。
- 运行地图生成器负责路径、函数名、行号区间、增删和漏检；人工只改意图、文件说明、功能描述与备注。机器生成的行数/行号不能手填冻结。
- 稳定匹配键是“相对路径 + 函数名 + 同名出现顺序”。本轮重点保护 `routeKey` 两条、`visit` 三条、`isIdChar` 两条顺序；`--check` 不覆盖人工描述/固定尾部的全文比较，所以需另做结构键对拍。
- 描述必须保留当前行为关键词：证据引用成对剥除与单侧不剥、`atomicCommit` 阶段语义、`syncPreset` 三条件 idle、`createApiHandler` PUT 仅投影、P2-2 agent-only cache、usage 同步 final fold 等。
- 地图生成器是源码/测试索引，不是历史归档；无函数文件或纯描述变化不能只靠 `--check` 判定。

## 交付格式与回滚

交付汇报不超过 15 行：

1. **完成清单**：逐项写文件/动作与关键结果值；
2. **自验证结论**：逐项写通过/不通过，并给一行证据；
3. **越界需求**：列出命令、目标路径、用途、预期内容；没有则写“无”。

回滚只能从唯一备份按文件/子块恢复，删除本轮新增归档，再运行地图 `--check`、step-00、step-04、step-06；不使用 Git 破坏性命令。`pe-test/reports/` 是临时产物，不纳入源改动。

## P2-4 生成链

作者值在 `plugins/dsh-extra-plan/assets/presets/extra-plan/agent.cordis.yml`；运行 `node plugins/dsh-extra-plan/scripts/generate-runtime-defaults.mjs` 生成派生模块/声明行，`--check` 只读比较。坏模板、生成失败或 prepack 失败必须保留 last-known-good；生成物不得手改。

## 单一来源提醒

`gateWords` 只改 YAML；`PROBE_LIMITS` 只读 `lib/save-contract.js`；模型/usage/投影细节分别以对应 lib 与 step 脚本为准；历史故障、旧宿主面、77/217/209 等历史统计读[归档](ai-宿主耦合历史归档.md)，不作为当前值。
