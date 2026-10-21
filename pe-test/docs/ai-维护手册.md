# 维护手册（备份、修改、回归与交付）

> 本文回答“怎么安全改、改完跑什么”。机制理由读 [ai-机制设计](ai-机制设计.md)，流程交接读 [ai-流程备查](ai-流程备查.md)。

## 动手前

1. **先读与登记**：先读方案和验收文件，再读所有目标文件；按原章节建立迁移矩阵。没有矩阵证据的段落默认保留。维护 dsh-extra-plan 项目时，每次派遣执行者或验收者都要让 prompt、方案和验收工件显式携带项目专属当前态/历史归档约束及适用范围。
2. **唯一备份**：修改前把实际改动文件按原目录镜像到唯一 `.extra-plan/backup-dsh-extra-plan-<任务名>-<YYYYMMDDHHMMSS>/`；同一任务续跑沿用对应目录，不覆盖原始镜像。文件镜像和子块独立回退是人工纪律，不声称已有自动闸门。
3. **范围**：仅修改用户真实需求对应且已批准方案列明的工作区文件；根 `README.md`、官方 dsh/官方预设、生产环境、profile、`$DSH_HOME`、真实会话、reports、backup 与 context fixture 不作源改动。`agent.cordis.yml` 的非引导词说明/工具行仅在用户明确授权且批准方案列明时有限修改；persona、四角色 personaPrefix、bootstrapPersona/bootstrapReadHint/plannerPromptSuffix、gateWords 与其它引导词原文冻结，单次授权不延续，其他文件按任务批准范围执行。不得执行 `git reset`、`git checkout`、`git clean`。
4. **备份后再改**：改预设时只改作者源并由生成器重建，生成物不得手改；作者源非引导词只按当前明确授权和批准方案有限修改，全部引导词逐字对拍冻结。生产部署由用户执行，仓库验收不是部署许可。
5. **嵌套命令纪律**：涉及 `run_code`/PowerShell/字符串拼接时，先按最终语言写正确文本，再逐层转义，写后解析回放；Markdown 不伪造代码语法结果。

## save_plan 并行交接、冻结与复验

- 续跑先沿用对应任务的既有增量备份目录；原始镜像及 manifest 不覆盖。失败修复另建独立 checkpoint，不能把失败版本写回原镜像，也不能用回滚删除此前已存在的 validator 或保留的未提交实现。
- `SAVE_PLAN_LIMITS` 的唯一限制真源是 [save-contract.js](../../plugins/dsh-extra-plan/lib/save-contract.js)；本文只引用真源，不复制运行时限值。方案/验收工件自身携带模式、任务/组、检查与交接约定，某次任务的任务、检查、文件数量不作为未来模板。
- 正文格式和字段关系以 [save-plan-validation.js](../../plugins/dsh-extra-plan/lib/save-plan-validation.js) 为真源，保存时真实源文件核实以 [save-tool-factories.js](../../plugins/dsh-extra-plan/lib/save-tool-factories.js) 为准；这里不复制另一张硬限制数值表。
- **新 save_plan 合同**：主文件、关联文件和带文件收尾都必须逐项声明文件操作与 `M` 修改点；既有文本修改的每个点写修改前范围、唯一原文锚点和具体动作，新建、删除、生成按受控例外填写。新调用强制新合同，旧工件只作历史，不自动补行。
- 验收按同文件、同操作、对应 `M` 点、修改后新定位和客观期望核对，不要求改后行号等于改前；取证写当前真实行号，原方案不回写追坐标。
- **字段示意（仅示意，不是当前仓库可直接保存的完整输入）**：真实使用须先读当前文件并替换路径、范围、锚点，同时保留卷首、组、依赖、自检、检查定义、200 字符等完整合同；行号仅作为字段值，不拼入路径或新顶层 JSON 参数。
  - 方案段：`主文件：src/example.js` → `文件操作：修改` → `修改点：M1` → `修改位置：L12-20` → `定位锚点：function buildConfig` → `修改：删改……`
  - 验收段：`同文件/操作：src/example.js / 修改` → `对应修改点：M1` → `验收定位：buildConfig 及行为用例` → `客观期望：……` → `禁止/正式验收：……`
- 执行者回报任务/文件范围、自检和阻塞；自检不等于正式验收。需要写临时产物的执行取证由获批执行者或直行主会话运行并保存原始 stdout/stderr/退出码，reviewer 保持只读并独立读取；同一公共检查只由一个领取者运行，其他任务/收尾/全局复用同一冻结轮证据。
- 各组产出稳定后可先记录组级快照并开始对应组验收；所有数字任务与收尾完成后再记录最终冻结状态并做全局收口。源文件、检查条件、授权范围或源版本发生变化，受影响共享证据（同轮证据亦然）不可跨相关源变化复用并立即失效；重跑受影响任务、依赖消费者及共享检查，影响不能证明时按固定顺序从头复验。正式失败最多两轮，分类原样保留。
- 只读复核、执行取证、静态检查和用户实机分别记录 PASS/FAIL/INCOMPLETE/NOT-RUN/SKIP/HUMAN；命令退出 0 不替代期望/禁止核对。字符测量使用 `String.length`，token 只有真实同口径数据才记录，否则 `NOT-RUN`。
- 固定回归顺序仍按本手册“QQBot CLI 与维护所有权”部分逐项执行；一键 runner 内部重跑既有收口命令必须如实注明，不能声称共享检查从不复跑。简单未来方案可按实际改动域取对应检查，不因任务规模强制完整矩阵。

## MJS 测试输出合同与 HUMAN 取证分层

- 统一实现位为 `pe-test/_shared/test-output.mjs`：默认 `compact`，`--verbose` 只增加成功断言名称，`--full` 优先于 `--verbose` 并恢复成功 `expected/actual` 与查看器原始事件；三种模式不得改变断言集合、状态分类、计数、退出码或执行顺序。
- compact 成功断言不逐条输出，只保留最终统计和必要结构化索引；失败、validator 原文、deny reason、首错/阶段/cause、清理残留永不压缩。设置矩阵成功行只保留 case/status/计数/索引/差异摘要；失败或 `--full` 才展示完整配置/trace。
- `step-07-子代理模型与引导取证.mjs` 默认输出 A42/A43 索引：SESSION_ID、父 `subagent_plan` 关联、父子行号、attempted route、actual provenance、首个 planner 文本块摘要、suffix 等级与 exact match；`--full` 才输出 prompt/event/text 原文。`step-04-工具清单查看.mjs` 默认保留精确工具名、消息 ID/角色/source/行号和 `REQUEST_EXACT`，INBOX_ONLY 只引用已输出 MESSAGE；`step-05-会话解码.mjs` 默认保留 plan/mode 行号与计数摘要。
- `一键step测试.mjs` 主报告只做索引；人眼工具按能力传参：step-04/05/07 追加 `--full`，step-06/08 保持原参数合同。完整 stdout/stderr 写入独立 raw 文件，摘要登记相对路径、bytes、lines、SHA-256 与有限结构化行；step-07 缺显式 `--session` 或 `PLANNER_PROMPT_SUFFIX` 未显式存在时记 `NOT-RUN` 并保留 raw 原因。`pe-test/reports/` 的 raw/Markdown 是临时证据，不纳入源改动；报告中的 HUMAN、SKIP、NOT-RUN、INCOMPLETE 均不计 AUTO PASS。
- 回看 raw 时按摘要中的相对路径逐字读取，并用 SHA-256、字节数、行数三项核对；摘要或 hash 不能替代原文，也不能把真实宿主、GUI、QQBot、生产 profile 或会话结论改写为 PASS。

## G3 行为回归与夹具边界

- 设置页回归复用实际 factory/React/slot/ConfigForms 执行；完整性回归从完整正确基底逐字段变异，覆盖 source locator、默认链、客户端标记和七产物事务；全流程/路由回归观察真实状态、通知、生命周期、缓存和写闸门结果。
- 正夹具验证等价格式/注释/私有命名仍通过，反夹具验证缺少呈现选项、漏保存键、错误 YAML、逐项发布/恢复故障被识别；expected 必须独立，不得由被测实现同时生成。
- 这些是隔离内存/受控宿主边界的行为证据，不等于真实 GUI、QQBot 消息、provider、重启、生产 profile 或部署通过；适用项缺失、超时、SKIP、INCOMPLETE、HUMAN、NOT-RUN 均单列。

## Web/QQBot 所有权与部署边界

| profile | 当前职责 | 本仓库 AI 边界 |
|:--|:--|:--|
| web | 直接安装核心包；由 `dsh-extra-plan-settings` 唯一全局 owner 启动内部同步、承载 10 项配置与官方 adapter | 不删除核心包/预设，不写生产 profile |
| qqbot | 安装精简兼容包；静态 patch（0.2.1 起写 `- id: dsh-extra-plan-settings` + 全量 config，不再写 override 包装键）、旧块迁移与 web 包建链 | 不分发核心预设；真实消息、`/preset`、question/approval（提问/批准）、allow-build/postinstall（安装后脚本）为用户部署后 HUMAN。**profile 的 `pnpm-workspace.yaml` 必须把 `dsh-extra-plan-qqbot` 放行到 `allowBuilds`（或等价 onlyBuiltDependencies），否则 postinstall 不执行、patch 不落盘** |

### Web→QQBot 配置同步契约

- Web 保存后的首要路径真源是 `configEditor.documentPath`：仅当它是绝对的 `profiles/web/cordis.patch.yml` 形状时，才推导同级 `profiles` 并扫描直接子 profile。
- 只有 `configEditor.documentPath` 缺失时，才接受显式绝对 `DSH_HOME` 加 `DSH_PROFILE=web`，状态中的来源记为 `explicit-DSH_HOME`；不存在 homedir、USERPROFILE/HOME 或 `home/.dsh` 猜测。
- 结果必须区分 `synced`、`not-installed`、`unavailable`、`failed` 与 `partial`。Web owner 已成功落盘而镜像失败时保留 `web.applied=true`、`overall=partial`，不伪造双端成功。
- 镜像只持久化完整 10 项和完整 `gateWords`；其中 8 项沿既有热读语义，`webFetch` 与 `toolPresentationMode` 仍是 2 项宿主重启生效值，不发送 reload、不改变生效机制；toolPresentationMode 切换后必须新开会话，原会话不可继续（见台账 ⑭）。
- **UI 双步保存合同**：设置页保存第一步 `form.mutate(ops, revision)`（宿主 ConfigForms 规范写盘，accepted 才算 Web 侧成功）；第二步在 accepted 分支内同源 `PUT /api/dsh-extra-plan-settings/pro-config`（绝对路径，body 为 10 项字段对象，值与 ops 同源）静默执行——独立 try/catch 吞异常，PUT 响应与结果不驱动 UI 消息。UI 提示不变：accepted→原「已保存」、非 accepted 或异常→原「保存失败」；同步状态不进提示，经 GET `/api/dsh-extra-plan-settings/pro-config` 查询（含 stale 检测）。volatile-only UI 保存不产生 `internal/update`，第二步 PUT 是 QQBot 同步的主触发。
- **PUT 同值修复漂移**：PUT 请求值与当前 patch 深等时跳过 `editor.edit` 但无条件 `syncEditor`（全量 10+7 关联同步），同值重试保存即可把漂移的 QQBot patch 修复为最新值（回归锁定：`SYNC 同值保存仍检查并修复 QQBot 漂移`）。
- **GET 无参 stale 语义**：GET 无 `saveRunId` 返回 last-terminal-cache 前，若缓存 terminal 含 `rawWebPatchFingerprint` 且其 `patchSha256` 与 `editor.documentPath` 磁盘现算 sha256 不一致，`profileSync` 附加 `stale:true`、`source:'stale-terminal-cache'` 并 console.warn 一行漂移提示；GET 保持无副作用（不自动触发同步）；documentPath 不可读/异常按现状返回不报错；指纹一致时响应结构与改动前一致（无 stale 键）。
- **settled 链仅作 Web 宿主重启兜底**：volatile 快路径 + fiber 定向 waterfall 使真实 UI 保存的 `internal/update` 不到达 preset-sync 监听器（宿主契约事实，见台账⑬）；`settled-initial` 仅在 Web 宿主重启/插件装载时补同步 QQBot，不作为保存链同步依据。

`$DSH_HOME/profiles`、`.agent-presets` 和其它生产目录只允许用户侧部署流程触碰；AI 不代替用户做同步、清锁、重启或现场修复。

### settings-only 保存与 AgentPreset 生命周期（硬合同）

- **首次启动**：官方 AgentPreset 的主预设 register=1 仅表示主 definition 一次注册；同轮仍由同一 owner 尝试挂载主预设 1 份与 4 个角色 definition，共 5 份。旧 owner/旧行只参与结构指纹与 adapter 诊断，不作为抑制挂载条件；同 ID 可能装载失败，真实相遇效果留 HUMAN，不宣称已抢占、已避免 duplicate 或已保证只保留旧 owner。
- **settings-only** 保存是 **no-remount**：只读取最终完整 10 项与 `gateWords`，立即进入 settled/profileSync 并同步 QQBot；绝不调用、等待、dispose 或重建 AgentPreset。唯一允许 adapter register/dispose 的增量为 0/0。
- 非 settings 声明结构变化，或旧 owner ↔ 官方 owner transition，才进入 `structuralHandoff`；settled-only 与 adapter/structural 队列独立，adapter failure、reject 或 hang 不得阻断 profileSync。
- `profileSync` 初始为 `status=pending,pending=true`；任何同步终态（`synced`、`not-installed`、`unavailable`、`failed`、`partial`）后才 `pending=false`，禁止伪造双端成功。
- 8 项（`anchoredBootstrap`、`creativeMode`、`runcodeCatchGate`、`crossProviderPlannerModel`、`plannerModel`、`plannerPromptSuffix`、`exploreBudget`、`otherAgentModel`）保持同进程热读；`webFetch` 与 `toolPresentationMode` 是 2 项需重启的装载期投影；toolPresentationMode 切换后必须新开会话，原会话不可继续（见台账 ⑭）。完整 7 键 `gateWords` 立即持久化，但当前 apply 词表不原地替换，需重启后由 HUMAN 验证新词/旧词拒绝/非法词无 fallback。
- 自动结果必须分别记录 PASS/FAIL/SKIP/INCOMPLETE/HUMAN/NOT-RUN；SKIP、HUMAN 不销账，真实 Harness/QQBot 重启、消息链、生产 profile 与 adapter 完整工具图保持 HUMAN。

### 生产注入与证据范围

- `settings.js` 的 settled callback 只通过 `editorOf(undefined)` / `ctx.get('configEditor')` 解析 editor；`mountPresetSync` 的 adapter 仍由 `ctx.inject(['configEditor'])` child 挂载，不能把 get-only 当作挂载成功。
- 设置页脚本使用受控 host-proxy 四态：正常态必须记录外层 without-inject 门槛、ctx.get、child 身份、effect/cleanup、adapter 与 terminal 顺序；get-only/no-op-inject 输出 `HUMAN scope=HOST-PROXY-GET-ONLY`；inject-throws、child-missing-configEditor 必须保留结构化失败。
- 每个单字段 PUT/internal-update 都对拍完整 10 项 values 与完整 7 键 gateWords；Web patch、QQBot patch 和 terminal 输入不得只含 changed key。既有 throw/reject/hang/no-remount 合同继续执行。
- 证据生成器每次新建 runId，SOURCE-MANIFEST 按取证脚本实际声明的源文件记录备份 bytes/SHA-256；不得把某次任务的固定文件数当通用规模。旧证据只读对拍。缺少真实宿主、生产 profile、QQBot、GUI、消息链和重启一律是 HUMAN，不能改写为 PASS。

## 唯一 settings 行与保存终态维护规则

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
   - `node pe-test/tools/step-05-角色预设宿主回归.mjs`（角色预设机械契约：roster/assertProvider/header.agentPreset/工具面/persona 渲染/旧值回落）
   - `node pe-test/tools/step-06-08-v4取证回归.mjs`
   - `node pe-test/tools/step-06-线索落盘.mjs`
   - `node plugins/dsh-extra-plan/scripts/generate-runtime-defaults.mjs --check`
   - 冻结前完成代码地图生成与人工描述复核；正式阶段只运行代码地图 `--check`，避免普通生成改时间戳，再执行最后一键 step。
3. 自动测试不得执行真实 PowerShell 重定向写；测试前后 `pe-test/reports/_s4b_pwsh.txt` 必须不存在。常规回归命令退出码必须为 0，输出不得有 FAIL、SyntaxError、UnhandledPromiseRejection；runner 的 ETIMEDOUT 明确归失败而非环境未执行，普通说明含 FAIL/Error/导航失效不单独判失败，必须以退出码/结构化统计为准；context-gate 独立脚本若有 INCOMPLETE 必须非零，一键结果结构化标为部分执行而不计 PASS。SKIP/INCOMPLETE/HUMAN/NOT-RUN 单列且不计 AUTO PASS。
4. 生产部署与当前唯一目标 dsh `0.2.1-rc.2` 的 HUMAN 复测由用户另行执行；三项 `@deepseek-ai` peer 与该版本同值，静态 PASS 不替代真实 provider、GUI、QQBot 消息、生产 profile 或其它 HUMAN 结论。
## 改动域 → 唯一检查入口

| 改动域 | 主要检查 |
|:--|:--|
| 闸门（含 job_kill/send_message/job_list/list_agents 四工具闸门）、route/purpose、A/C/M、PTC 呈现 | `step-00-全流程回归.mjs`、`step-04-路由与写闸门.mjs` |
| save_plan/save_probe、单次失败清理、证据合同 | `step-00-全流程回归.mjs`、`step-06-线索落盘.mjs`；save_plan 按逐文件操作/M点和真实源核实合同执行，验收按新定位取证；限制以 `lib/save-contract.js` 为准；失败保留首错/阶段并由 AI 主动重试，不扫描旧 journal |
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

回滚只能从唯一备份按文件/子块恢复，删除该维护任务新增归档，再运行地图 `--check`、step-00、step-04、step-06；不使用 Git 破坏性命令。`pe-test/reports/` 是临时产物，不纳入源改动。

## P2-4 生成链

作者值在 `plugins/dsh-extra-plan/assets/presets/extra-plan/agent.cordis.yml`；`runtimeDefaultsFromTemplate` 按十项 sourceLocator 完整解析并由 `renderRuntimeDefaults` 生成 `DEFAULT_SETTINGS` 与兼容别名，运行时不解析作者 YAML。迁移顺序固定为：先改/校验生成器并生成新导出，再切换 settings-contract、Config/fallback、快照、同步和 client 消费者；未确认新导出前不得切消费者。

`client.js` 的 `EXTRA_FIELDS`/`HOST_ROW_FIELDS`/`ALL_FIELDS` 只允许生成器替换成对标记区块，标记内只派生 UI metadata，不带默认值、validator 或宿主对象，禁止手工编辑。默认仓库路径一并发布七个输出（运行时常量、主 definition、四角色 definition、client）；自定义 source/output 默认关闭仓库 client，显式 client source/output 才启用。

生成器先 parse/validate/编译 client，再进入同目录暂存、备份、顺序发布与逆序有限回滚；任一失败不得留下新版本，恢复失败保留首错、阶段、备份和残留。`--check` 只读比较并零写；该生成链不等同于 `save-persistence.js` 的方案工件落盘责任，生成物不得手改。

## 单一来源提醒

`gateWords` 只改 YAML；`SAVE_PLAN_LIMITS` 与 save_plan 限制数值只读 [lib/save-contract.js](../../plugins/dsh-extra-plan/lib/save-contract.js)，正文格式与字段关系以 [lib/save-plan-validation.js](../../plugins/dsh-extra-plan/lib/save-plan-validation.js) 为真源，真实源核实以 [lib/save-tool-factories.js](../../plugins/dsh-extra-plan/lib/save-tool-factories.js) 为准；`PROBE_LIMITS` 同样只读 save-contract 源码，文档不维护第二份运行时限值表。模型/usage/投影细节分别以对应 lib 与 step 脚本为准；历史故障、旧宿主面、77/217/209 等历史统计读[归档](ai-宿主耦合历史归档.md)，不作为当前值。
