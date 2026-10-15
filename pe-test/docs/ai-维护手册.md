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

### Web→QQBot 配置同步契约

- Web 保存后的首要路径真源是 `configEditor.documentPath`：仅当它是绝对的 `profiles/web/cordis.patch.yml` 形状时，才推导同级 `profiles` 并扫描直接子 profile。
- 只有 `configEditor.documentPath` 缺失时，才接受显式绝对 `DSH_HOME` 加 `DSH_PROFILE=web`，状态中的来源记为 `explicit-DSH_HOME`；不存在 homedir、USERPROFILE/HOME 或 `home/.dsh` 猜测。
- 结果必须区分 `synced`、`not-installed`、`unavailable`、`failed` 与 `partial`。Web owner 已成功落盘而镜像失败时保留 `web.applied=true`、`overall=partial`，不伪造双端成功。
- 镜像只持久化完整 10 项和完整 `gateWords`；其中 8 项沿既有热读语义，`webFetch` 与 `toolPresentationMode` 仍是 2 项宿主重启生效值，不发送 reload、不改变生效机制。

`$DSH_HOME/profiles`、`.agent-presets` 和其它生产目录只允许用户侧部署流程触碰；AI 不代替用户做同步、清锁、重启或现场修复。

### settings-only 保存与 AgentPreset 生命周期（硬合同）

- **首次启动**保留官方 AgentPreset register=1；若检测到活动旧 owner，只保留旧 owner，不抢占、不编辑、不删除旧声明。
- **settings-only** 保存是 **no-remount**：只读取最终完整 10 项与 `gateWords`，立即进入 settled/profileSync 并同步 QQBot；绝不调用、等待、dispose 或重建 AgentPreset。唯一允许 adapter register/dispose 的增量为 0/0。
- 非 settings 声明结构变化，或旧 owner ↔ 官方 owner transition，才进入 `structuralHandoff`；settled-only 与 adapter/structural 队列独立，adapter failure、reject 或 hang 不得阻断 profileSync。
- `profileSync` 初始为 `status=pending,pending=true`；任何同步终态（`synced`、`not-installed`、`unavailable`、`failed`、`partial`）后才 `pending=false`，禁止伪造双端成功。
- 8 项（`anchoredBootstrap`、`creativeMode`、`runcodeCatchGate`、`crossProviderPlannerModel`、`plannerModel`、`plannerPromptSuffix`、`exploreBudget`、`otherAgentModel`）保持同进程热读；`webFetch` 与 `toolPresentationMode` 是 2 项需重启的装载期投影。完整 7 键 `gateWords` 立即持久化，但当前 apply 词表不原地替换，需重启后由 HUMAN 验证新词/旧词拒绝/非法词无 fallback。
- 自动结果必须分别记录 PASS/FAIL/SKIP/INCOMPLETE/HUMAN/NOT-RUN；SKIP、HUMAN 不销账，真实 Harness/QQBot 重启、消息链、生产 profile 与 adapter 完整工具图保持 HUMAN。

### 本轮生产注入修复工作区口径

- `settings.js` 的 settled callback 只通过 `editorOf(undefined)` / `ctx.get('configEditor')` 解析 editor；`mountPresetSync` 的 adapter 仍由 `ctx.inject(['configEditor'])` child 挂载，不能把 get-only 当作挂载成功。
- 设置页脚本使用受控 host-proxy 四态：正常态必须记录外层 without-inject 门槛、ctx.get、child 身份、effect/cleanup、adapter 与 terminal 顺序；get-only/no-op-inject 输出 `HUMAN scope=HOST-PROXY-GET-ONLY`；inject-throws、child-missing-configEditor 必须保留结构化失败。
- 每个单字段 PUT/internal-update 都对拍完整 10 项 values 与完整 7 键 gateWords；Web patch、QQBot patch 和 terminal 输入不得只含 changed key。既有 throw/reject/hang/no-remount 合同继续执行。
- 证据生成器每次新建 runId，SOURCE-MANIFEST 记录本轮八个工作区文件的备份 bytes/SHA-256；旧证据只读对拍。缺少真实宿主、生产 profile、QQBot、GUI、消息链和重启一律是 HUMAN，不能改写为 PASS。

## 本轮唯一 settings 行与保存终态维护规则

- 只允许 canonical `id=dsh-extra-plan-settings/name=dsh-extra-plan/settings` 作为新写入目标；`rawCount/effectiveCount/canonicalNameCount` 任一不满足唯一条件时，GET/PUT 必须停在 409 conflict，不能用旧 projection 或旧 terminal 绿灯。
- `profileSync` 的 cache 与 requestResult 分离：无参数 GET 只能显示最后 terminal 的 cache 元数据；只有带相同 `saveRunId` 查询或当前 PUT 的 request/terminal 三元组全等，才可将 `terminalMatch` 置为 true。
- 迁移 planner 只在临时 fixture 执行，必须保留无关注释、`!!js` 和用户字段，并给出 before/after bytes/SHA 与唯一 rollback bytes；生产 duplicate 行清理、部署和重启由 HUMAN 执行。
- 每次单字段仍构造完整 10 项 values + 7 键 gateWords；`creativeMode` 的自动通过只证明 patch 已立即持久化，不证明重启前运行时行为。

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
