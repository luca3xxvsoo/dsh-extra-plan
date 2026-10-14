# 维护手册（备份、修改、回归与交付）

> 本文回答“怎么安全改、改完跑什么”。机制理由读 [ai-机制设计](ai-机制设计.md)，流程交接读 [ai-流程备查](ai-流程备查.md)。

## 动手前

1. **先读与登记**：先读方案和验收文件，再读所有目标文件；按原章节建立迁移矩阵。没有矩阵证据的段落默认保留。
2. **唯一备份**：修改前把实际改动文件按原目录镜像到唯一 `.extra-plan/backup-dsh-extra-plan-<任务名>-<YYYYMMDDHHMMSS>/`；同一任务续跑沿用对应目录，不覆盖原始镜像。文件镜像和子块独立回退是人工纪律，不声称已有自动闸门。
3. **范围**：仅修改用户真实需求对应且已批准方案列明的工作区文件；根 `README.md`、`plugins/dsh-extra-plan/assets/presets/extra-plan/agent.cordis.yml` 及其中全部引导词硬性禁改。官方 dsh/官方预设、生产环境、profile、`$DSH_HOME`、真实会话、reports、backup 与 context fixture 不作源改动，其他文件按任务批准范围执行。不得执行 `git reset`、`git checkout`、`git clean`。
4. **备份后再改**：改预设时只改作者源并由生成器重建，生成物不得手改；文档任务不把预设或引导词当作可改目标。生产部署由用户执行，仓库验收不是部署许可。
5. **嵌套命令纪律**：涉及 `run_code`/PowerShell/字符串拼接时，先按最终语言写正确文本，再逐层转义，写后解析回放；Markdown 不伪造代码语法结果。

## Web/QQBot 所有权与部署边界

| profile | 当前职责 | 本仓库 AI 边界 |
|:--|:--|:--|
| web | 直接安装核心包；由 `dsh-extra-plan-settings` 唯一全局 owner 启动内部同步、承载 10 项配置与官方 adapter | 不删除核心包/预设，不写生产 profile |
| qqbot | 安装精简兼容包；静态 patch、旧块迁移与 web 包建链 | 不分发核心预设；真实消息、`/preset`、question/approval（提问/批准）、allow-build/postinstall（安装后脚本）为用户部署后 HUMAN |

`$DSH_HOME/profiles`、`.agent-presets` 和其它生产目录只允许用户侧部署流程触碰；AI 不代替用户做同步、清锁、重启或现场修复。

## QQBot CLI 与维护所有权

`plugins/dsh-extra-plan-qqbot/scripts/heal.mjs` 仅是用户侧安装/手动触发的 CLI 兜底；静态映射、临时 DSH_HOME 夹具和纯函数可由 `step-01-qqbot-安装映射.mjs` 回归。真实消息、`/preset`、question/approval（提问/批准）、allow-build/postinstall（安装后脚本）与 profile 建链结果必须标为 HUMAN，不能以静态 PASS 销账。

1. 逐文件对实际修改的全部 JS/MJS 执行 `node --check`；`package.json` 执行 `JSON.parse`。嵌套生成的 host-deps hookSource 必须展开成 data URL 后做 ESM 解析回放，不能只检查外层。
2. 严格按验收顺序运行：
   - `node pe-test/tools/step-01-设置页配置.mjs`
   - `node pe-test/tools/step-01-安装同步.mjs`
   - `node pe-test/tools/step-01-qqbot-安装映射.mjs`
   - `node pe-test/tools/step-01-预设完整性.mjs`
   - `node pe-test/tools/step-00-全流程回归.mjs`
   - `node pe-test/tools/step-00-跨平台写拦截.mjs`
   - `node pe-test/tools/step-04-路由与写闸门.mjs`
   - `node pe-test/tools/step-04-context-gate宿主回归.mjs`
   - `node pe-test/tools/step-06-08-v4取证回归.mjs`
   - `node pe-test/tools/step-06-线索落盘.mjs`
   - `node plugins/dsh-extra-plan/scripts/generate-runtime-defaults.mjs --check`
   - 代码地图生成、人工描述复核、代码地图 `--check`、最后一键 step。
3. 自动测试不得执行真实 PowerShell 重定向写；测试前后 `pe-test/reports/_s4b_pwsh.txt` 必须不存在。常规回归命令退出码必须为 0，输出不得有 FAIL、SyntaxError、UnhandledPromiseRejection；context-gate 独立脚本若有 INCOMPLETE 必须非零，一键结果结构化标为部分执行而不计 PASS。SKIP/INCOMPLETE/HUMAN/NOT-RUN 单列且不计 AUTO PASS。
4. 生产部署与双版本 HUMAN 复测由用户另行执行；静态 PASS 不替代真实 provider、GUI、QQBot 消息、生产 profile 或四个 peer 版本实机结论。
## 改动域 → 唯一检查入口

| 改动域 | 主要检查 |
|:--|:--|
| 闸门（含 job_kill/send_message/job_list/list_agents 四工具闸门）、route/purpose、A/C/M、PTC 呈现 | `step-00-全流程回归.mjs`、`step-04-路由与写闸门.mjs` |
| save_plan/save_probe、journal、证据合同 | `step-00-全流程回归.mjs`、`step-06-线索落盘.mjs`；限制以 `lib/save-contract.js` 为准 |
| 预设默认、settings、profile patch 自愈 | 对应 step-01 脚本；生成器与产物 `--check` 只读验证 |
| 模型路由、usage、会话形状 | step-00、step-04 P4、step-07 HUMAN 取证；静态结果不替代实机 |
| 代码地图 | `node pe-test/tools/代码地图生成.mjs` → 人工描述复核 → `--check`；一键测试也内置 `--check` |
| 宿主升级/QQBot | [ai-宿主耦合台账](ai-宿主耦合台账.md) 的当前 checklist（核对清单）；`scripts/heal.mjs` 只作用户侧 CLI；SKIP 不销账，HUMAN 不伪造通过 |
| 实机闸门 | [ai-实机闸门测试流程](ai-实机闸门测试流程.md)；保持单文件顺序，不拆表/改编号 |

## 代码地图维护规则

- `## 意图速查`、`## 文件总览`、`## 函数索引` 和原表头必须保留。先 grep 意图词得到函数名，再按函数名读机器行号。
- 运行地图生成器负责路径、函数名、行号区间、增删和漏检；人工只改意图、文件说明、功能描述与备注。机器生成的行数/行号不能手填冻结。
- 稳定匹配键是“相对路径 + 函数名 + 同名出现顺序”。维护时必须保持 `routeKey` 1 条、`visit` 4 条、`isIdChar` 1 条的顺序；`--check` 不覆盖人工描述/固定尾部的全文比较，所以需另做结构键对拍。
- 描述必须保留当前行为关键词：证据引用成对剥除与单侧不剥、`atomicCommit` 阶段语义、`syncPreset` 三条件 idle（空闲稳态）、`createApiHandler` PUT 仅投影、P2-2 agent-only（仅 Agent）cache、usage 同步 final fold（最终折叠） 等。
- 地图生成器是源码/测试索引，不是历史归档；无函数文件或纯描述变化不能只靠 `--check` 判定。

## 交付格式与回滚

交付汇报不超过 15 行：

1. **完成清单**：逐项写文件/动作与关键结果值；
2. **自验证结论**：逐项写通过/不通过，并给一行证据；
3. **越界需求**：列出命令、目标路径、用途、预期内容；没有则写“无”。

回滚只能从唯一备份按文件/子块恢复，删除该任务新增归档，再运行地图 `--check`、step-00、step-04、step-06；不使用 Git 破坏性命令。`pe-test/reports/` 是临时产物，不纳入源改动。

## P2-4 生成链

作者值在 `plugins/dsh-extra-plan/assets/presets/extra-plan/agent.cordis.yml`；运行 `node plugins/dsh-extra-plan/scripts/generate-runtime-defaults.mjs` 生成 runtime 常量与纯 `preset-definition.generated.yml`，`--check` 只读比较。坏模板、生成失败或 prepack 失败必须保留 last-known-good（上次已知良好版本）；生成物不得手改。

## 单一来源提醒

`gateWords` 只改 YAML；`PROBE_LIMITS` 只读 `lib/save-contract.js`；模型/usage/投影细节分别以对应 lib 与 step 脚本为准；历史故障、旧宿主面、77/217/209 等历史统计读[归档](ai-宿主耦合历史归档.md)，不作为当前值。
