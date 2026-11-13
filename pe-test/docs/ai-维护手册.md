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

- **双根维护与命令/参数前缀**：维护 W 取可信源树布局，不能以 `process.cwd`、插件安装目录或普通文件 `dirname` 授根；部署/会话 W 取 `session.header.cwd`。维护数据 H 仅由本次显式 `--host-root` 加精确 `--profile`/`--file`/会话目标授权；`DSH_HOME`、`DSH_PROFILE`、`SESSION_ID` 的存在不授根，非法原始根在任何扫描前拒绝，H/W 重叠按用途分类且 Host 资源只读。会话选择只能是 `--session-dir`，或 `--session`+`--sessions-dir`；默认不读兄弟，`--discover-children` 必须显式绑定会话，最多 512 候选、每个日志头最多 262144 字节，坏头/超限为 `INCOMPLETE`；必填 suffix 必须显式提供，空串合法。纯 W 工具直接 `node`；需要 Host 代码的测试才用 `DSH_INSTALL_ROOT=<本次真实代码根> node --import ./pe-test/_shared/host-preload.mjs`，该代码根不授权数据 H。fixtures、temp、capture、home、cache、report、测试输出、生成暂存与 W 快照均在 W；Host archive/清理 `--apply` 提前拒绝且零写，W 功能/备份/回滚保留。

- **installRoot 只读代码根与引导收窄回归**：运行时 `pathContextFor` 在可信 `installAnchor` 非空时注册 `installRoot`（directory/read/probe-reference，与 W 或 H 重叠时跳过），供 `save_probe` 引用宿主源码；回归入口为 `step-00` 的 PR36 至 PR39 与 `step-04` 的 R15 至 R18。引导期工具面收窄（`ctx.tools.restrict`）只在真实宿主 Session（具备 `session.append`）上 arm，角色工具面夹具不 arm（路线 A）——不得因此改写 `step-05` 的角色工具面期望。

## MJS 测试输出合同与 HUMAN 取证分层

- 统一实现位为 `pe-test/_shared/test-output.mjs`：默认 `compact`，`--verbose` 只增加成功断言名称，`--full` 优先于 `--verbose` 并恢复成功 `expected/actual` 与查看器原始事件；三种模式不得改变断言集合、状态分类、计数、退出码或执行顺序。
- compact 成功断言不逐条输出，只保留最终统计和必要结构化索引；失败、validator 原文、deny reason、首错/阶段/cause、清理残留永不压缩。设置矩阵成功行只保留 case/status/计数/索引/差异摘要；失败或 `--full` 才展示完整配置/trace。
- `step-07-子代理模型与引导取证.mjs` 默认输出 A42/A43 索引：SESSION_ID、父 `subagent_plan` 关联、父子行号、attempted route、actual provenance、首个 planner 文本块摘要、suffix 等级与 exact match；`--full` 才输出 prompt/event/text 原文。`step-04-工具清单查看.mjs` 默认保留精确工具名、消息 ID/角色/source/行号和 `REQUEST_EXACT`，INBOX_ONLY 只引用已输出 MESSAGE；`step-05-会话解码.mjs` 默认保留 plan/mode 行号与计数摘要。
- `一键step测试.mjs` 主报告只做索引；人眼工具按能力传参：step-04/05/07 追加 `--full`，`step-06-08-v4取证回归` 保持原参数合同（`pe-test/tools` 下已无独立 step-08 脚本，该脚本已列入 AUTO、不再属人眼项；人眼项脚本自身非零退出码会判为失败并反映到摘要状态栏与第五节索引行）。完整 stdout/stderr 写入独立 raw 文件，摘要登记相对路径、bytes、lines、SHA-256 与有限结构化行；step-07 完整前置为显式 `--session`+`--sessions-dir`（会话在宿主数据根加 `--host-root`，取直接 child 加 `--discover-children`）与显式存在的 `PLANNER_PROMPT_SUFFIX`（空串也算）；无会话选择记 `NOT-RUN`（exit 0），选择非法/不完整或选择后缺 suffix 记输入错误（exit 1），均保留 raw 原因；`SESSION_ID` 只作报告/输出字段。`pe-test/reports/` 的 raw/Markdown 是临时证据，不纳入源改动；报告中的 HUMAN、SKIP、NOT-RUN、INCOMPLETE 均不计 AUTO PASS。
- 回看 raw 时按摘要中的相对路径逐字读取，并用 SHA-256、字节数、行数三项核对；摘要或 hash 不能替代原文，也不能把真实宿主、GUI、QQBot、生产 profile 或会话结论改写为 PASS。

### G3 夹具边界的真实 provider 待办

以下三项不在合成夹具可机械化范围，只能由真实 provider / 真实宿主产生；不写成 AUTO 断言，也不得改写为 PASS：

- **S05-2 宿主 sandbox/mode**：需在直接 child 会话逐帧只读取证。取证前提是当前 `step-06-真实会话查看.mjs` 不打印 sandbox/mode 的 data 与 seq，须先扩查看器，或按 [ai-实机闸门测试流程](ai-实机闸门测试流程.md) 的 C14 四栏口径逐帧解码；判据是纠正事件 mode 等于角色目标（planner/prober→read-only、reviewer/executor→workspace-write）且其 seq 小于首个 tool/call 的 seq。`step-05-会话解码.mjs` 默认只统计事件类型，不能用其计数代替 mode 值与 seq。
- **S06-6 usage**：需真实 assistant/message 且 data.usage 四桶有限非负、不全零，source.kind=model。过滤与四桶取值以宿主 usage-ledger 的 assistant/message 段为真源（按包名+包内相对路径+符号名定位，不记固定行号），source.kind=model 判定同 S07-4 的 actual provenance。
- **S07-5 模型路由**：需真实 provider/model 快照比对，pro规划 child 的 provenance.model 等于 plannerModel 快照、非 pro规划 child 等于 otherAgentModel 快照（空串时等于主会话 provenance model）。

三项均计入 HUMAN，SKIP/INCOMPLETE/HUMAN/NOT-RUN 单列且不计 PASS。HUMAN 总数以 [ai-宿主耦合台账](ai-宿主耦合台账.md) 的清单为唯一计数来源，本文新增项已计入该清单，不在本文另写数字。

## G3 行为回归与夹具边界

- 设置页回归复用实际 factory/React/slot/ConfigForms 执行；完整性回归从完整正确基底逐字段变异，覆盖 source locator、默认链、客户端标记和七产物事务；全流程/路由回归观察真实状态、通知、生命周期、缓存和写闸门结果。
- 正夹具验证等价格式/注释/私有命名仍通过，反夹具验证缺少呈现选项、漏保存键、错误 YAML、逐项发布/恢复故障被识别；expected 必须独立，不得由被测实现同时生成。
- 这些是隔离内存/受控宿主边界的行为证据，不等于真实 GUI、QQBot 消息、provider、重启、生产 profile 或部署通过；适用项缺失、超时、SKIP、INCOMPLETE、HUMAN、NOT-RUN 均单列。

## Web/QQBot 所有权与部署边界

| profile | 当前职责 | 本仓库 AI 边界 |
|:--|:--|:--|
| web | 直接安装核心包；由 `dsh-extra-plan-settings` 唯一全局 owner 启动内部同步、承载 11 项配置与官方 adapter | 不删除核心包/预设，不写生产 profile |
| qqbot | 标准包 `dsh-extra-plan-qqbot` 的严格 `--install`：以双锚点包根 realpath 唯一匹配目标，预检 Web 核心后校验 patch、建链及最终 realpath；兼容 bundle 以 canonical 行 `id: dsh-extra-plan-settings` / `name: dsh-extra-plan/settings` 激活，宿主启动由 `index.js#apply` 兜底；CLI 无参仅显示帮助并 exit 0，不触发自愈且不能替代 apply；自愈只处理当前明确 profile，必要的一层候选发现最多 128 个，超限只出诊断，不跨 profile 启动 | 核心包独立安装；不分发核心预设；真实消息、`/preset`、question/approval（提问/批准）、allow-build/postinstall（安装后脚本）与用户部署/重启后的效果为 HUMAN；严格失败非零，无参启动告警/exit 0 |

### Web→QQBot 配置同步契约

- Web 保存后的首要路径真源是 `configEditor.documentPath`：仅当可信 Web profile 的路径是绝对的 `profiles/web/cordis.patch.yml` 形状时，才推导同级 `profiles`，并只做必要的一层候选发现；不把扩展名、普通父目录或当前进程 cwd 当授权。
- 维护/测试数据不从 `DSH_HOME`、`DSH_PROFILE`、`SESSION_ID`、homedir、USERPROFILE/HOME 或 `home/.dsh` 猜测或授权；真实运行时只接受可信 `profileContext.name`/`startedBundles` 与精确能力，维护取证另需显式 `--host-root` 和精确目标。`DSH_INSTALL_ROOT`+host-preload 仅是只读代码根许可，不是数据 H。
- 结果必须区分 `synced`、`not-applicable`、`not-installed`、`unavailable`、`failed` 与 `partial`：只有标准 Web owner 对当前明确且满足双锚点的 QQ profile 做 Web→QQ 镜像时才是 `synced`；QQ owner 本身返回 `not-applicable`，不跨 profile 启动。Web owner 已成功落盘而镜像失败时保留 `web.applied=true`、`overall=partial`，不伪造双端成功。
- 镜像只持久化完整 11 项和完整 `gateWords`；其中 9 项沿既有热读语义，`webFetch` 与 `toolPresentationMode` 仍是 2 项宿主重启生效值，不发送 reload、不改变生效机制；toolPresentationMode 切换后必须新开会话，原会话不可继续（见台账 ⑭）。
- **UI 双步保存合同**：设置页保存第一步 `form.mutate(ops, revision)`（宿主 ConfigForms 规范写盘，accepted 才算 Web 侧成功）；第二步在 accepted 分支内同源 `PUT /api/dsh-extra-plan-settings/pro-config`（绝对路径，body 为 11 项字段对象，值与 ops 同源）静默执行——独立 try/catch 吞异常，PUT 响应与结果不驱动 UI 消息。UI 提示不变：accepted→原「已保存」、非 accepted 或异常→原「保存失败」；同步状态不进提示，经 GET `/api/dsh-extra-plan-settings/pro-config` 查询（含 stale 检测）。volatile-only UI 保存不产生 `internal/update`，第二步 PUT 是 QQBot 同步的主触发。
- **PUT 同值修复漂移**：PUT 请求值与当前 patch 深等时跳过 `editor.edit` 但无条件 `syncEditor`（全量 11+7 关联同步），同值重试保存即可把漂移的 QQBot patch 修复为最新值（回归锁定：`SYNC 同值保存仍检查并修复 QQBot 漂移`）。
- **GET 无参 stale 语义**：GET 无 `saveRunId` 返回 last-terminal-cache 前，若缓存 terminal 含 `rawWebPatchFingerprint` 且其 `patchSha256` 与 `editor.documentPath` 磁盘现算 sha256 不一致，`profileSync` 附加 `stale:true`、`source:'stale-terminal-cache'` 并 console.warn 一行漂移提示；GET 保持无副作用（不自动触发同步）；documentPath 不可读/异常按现状返回不报错；指纹一致时响应结构与改动前一致（无 stale 键）。
- **settled 链仅作 Web 宿主重启兜底**：volatile 快路径 + fiber 定向 waterfall 使真实 UI 保存的 `internal/update` 不到达 preset-sync 监听器（宿主契约事实，见台账⑬）；`settled-initial` 仅在 Web 宿主重启/插件装载时补同步 QQBot，不作为保存链同步依据。

`$DSH_HOME/profiles`、`.agent-presets` 和其它生产目录只允许用户侧部署流程触碰；AI 不代替用户做同步、清锁、重启或现场修复。

### settings-only 保存与 AgentPreset 生命周期（硬合同）

- **首次启动**：官方 AgentPreset 的主预设 register=1 仅表示主 definition 一次注册；同轮仍由同一 owner 尝试挂载主预设 1 份与 4 个角色 definition，共 5 份。当前资产 definition 决定非用户内容，当前规范 settings 行决定用户值；同 ID 可能装载失败，真实相遇效果留 HUMAN，不宣称已避免 duplicate 或已保证只保留单一 owner。
- **settings-only** 保存是 **no-remount**：只读取最终完整 11 项与 `gateWords`，立即进入 settled/profileSync 并同步 QQBot；绝不调用、等待、dispose 或重建 AgentPreset。唯一允许 adapter register/dispose 的增量为 0/0。
- 非 settings 声明结构变化才进入 `structuralHandoff`；settled-only 与 adapter/structural 队列独立，adapter failure、reject 或 hang 不得阻断 profileSync。
- `profileSync` 初始为 `status=pending,pending=true`；任何同步终态（`synced`、`not-applicable`、`not-installed`、`unavailable`、`failed`、`partial`）后才 `pending=false`，禁止把 QQ 的 `not-applicable` 或其它未适用状态伪造为 `synced`。
- 9 项（`anchoredBootstrap`、`creativeMode`、`runcodeCatchGate`、`crossProviderPlannerModel`、`plannerModel`、`plannerPromptSuffix`、`exploreBudget`、`otherAgentModel`、`reviewerUsesPlannerModel`）保持同进程热读；`webFetch` 与 `toolPresentationMode` 是 2 项需重启的装载期投影；toolPresentationMode 切换后必须新开会话，原会话不可继续（见台账 ⑭）。完整 7 键 `gateWords` 立即持久化，但当前 apply 词表不原地替换，需重启后由 HUMAN 验证新词/旧词拒绝/非法词无 fallback。配置本身同进程热读，但模型/路由类开关对已存在的子代理不重算，故 UI 标注「新会话/新子代理生效」。生成器按 L121 的 `DSH_INSTALL_ROOT`+`host-preload` 前缀运行（缺 js-yaml 即表示未带代码根前置）；仅在无法使用 host-preload 前缀时，才用 `NODE_PATH` 指向 profile 的 `node_modules` 兜底。
- **同源检查项**：改动 `anchoredBootstrap` 或 `creativeMode` 任一路的可见面裁剪逻辑，必须同步核对另一路，并跑 step-04 的同源结构断言（`restrict(` 仅 1 处且位于 `armToolRestriction` 内、两个开关的 arm 均调用它）。
- 自动结果必须分别记录 PASS/FAIL/SKIP/INCOMPLETE/HUMAN/NOT-RUN；SKIP、HUMAN 不销账，真实 Harness/QQBot 重启、消息链、生产 profile 与 adapter 完整工具图保持 HUMAN。

### 生产注入与证据范围

- `settings.js` 的 settled callback 只通过 `editorOf(undefined)` / `ctx.get('configEditor')` 解析 editor；`mountPresetSync` 的 adapter 仍由 `ctx.inject(['configEditor'])` child 挂载，不能把 get-only 当作挂载成功。
- 设置页脚本使用受控 host-proxy 四态：正常态必须记录外层 without-inject 门槛、ctx.get、child 身份、effect/cleanup、adapter 与 terminal 顺序；get-only/no-op-inject 输出 `HUMAN scope=HOST-PROXY-GET-ONLY`；inject-throws、child-missing-configEditor 必须保留结构化失败。
- 每个单字段 PUT/internal-update 都对拍完整 11 项 values 与完整 7 键 gateWords；Web patch、QQBot patch 和 terminal 输入不得只含 changed key。既有 throw/reject/hang/no-remount 合同继续执行。
- 证据生成器每次新建 runId，SOURCE-MANIFEST 按取证脚本实际声明的源文件记录备份 bytes/SHA-256；不得把某次任务的固定文件数当通用规模。旧证据只读对拍。缺少真实宿主、生产 profile、QQBot、GUI、消息链和重启一律是 HUMAN，不能改写为 PASS。

## 唯一 settings 行与保存终态维护规则

- 只允许 canonical `id=dsh-extra-plan-settings/name=dsh-extra-plan/settings` 作为新写入目标；两个历史配置 ID 不读取、不一次性迁移、不回退、不判旧 owner、不承诺旧值，也不编辑/删除真实旧行；`rawCount/effectiveCount/canonicalNameCount` 任一不满足唯一条件时，GET/PUT 必须停在 409 conflict，不能用旧 projection 或旧 terminal 绿灯。
- `profileSync` 的 cache 与 requestResult 分离：无参数 GET 只能显示最后 terminal 的 cache 元数据；只有带相同 `saveRunId` 查询或当前 PUT 的 request/terminal 三元组全等，才可将 `terminalMatch` 置为 true。
- canonical 重复行规划器只在临时 fixture 执行，不用于两个历史配置 ID 迁移；必须保留无关注释、`!!js` 和用户字段，并给出 before/after bytes/SHA 与唯一 rollback bytes；生产 duplicate 行清理、部署和重启由 HUMAN 执行。
- 每次单字段仍构造完整 11 项 values + 7 键 gateWords；`creativeMode` 的自动通过只证明 patch 已立即持久化，不证明重启前运行时行为。

## QQBot CLI 与维护所有权

`dsh-extra-plan-qqbot@2.0.1` 的标准包安装只在授权命令 `dsh plugin --profile qqbot add dsh-extra-plan-qqbot --allow-build=dsh-extra-plan-qqbot` 中启用；参数是 `--allow-build`（不是 `--allow-scripts`），它只表示允许构建/生命周期脚本，不保证命中缓存时强制重跑。`postinstall` 进入 `scripts/heal.mjs --install` 严格模式：双锚点包根 realpath 必须唯一匹配，Web 核心名称/源、目标实体或异链及最终 lstat/realpath 必须通过；成功只接受 patch `idempotent`/`migrated` 或 `skipped/no-file` 与 link `linked`/`up-to-date`，否则 exit 1。`index.js#apply` 宿主启动兜底与 CLI 帮助/--install 分离；无参 CLI 仅显示帮助并 exit 0，不作为 apply 自愈证据；模块导入无副作用。

隔离验证入口仅为 `pe-test/tools/step-01-qqbot-单命令安装.mjs --dsh-root <真实 DSH 根> --case=install|compose|cache`：`install`、`compose`、`cache` 分别独立判定；缺条件为 `INCOMPLETE`，不把受控 compose 当作真实 QQBot。共用 store 的缓存复用若跳过钩子并缺链，整体只能记为 `PARTIAL/BLOCKED`；`--allow-build` 不授权追加 rebuild、清缓存或关闭安全策略。

源码合同版本为 `2.0.1`，本仓库尚未据此断言已发布/已部署；标准包消费者无需本地 tgz，公共 registry 名称、可达性与版本可用性须发布前由用户确认，私有 registry 打包仅用于测试。当前已有证据可支撑源码静态检查和受控 Loader compose；真实生命周期安装与 cache case 尚无完整通过证据，受限环境的 child-spawn `EPERM` 不等同已证实 `CACHE-BLOCKED`，仍须授权环境复测。HUMAN 待办项（包括用户部署/重启后的真实消息、`/preset`、question/approval 等，清单见 [ai-宿主耦合台账](ai-宿主耦合台账.md)）继续单列，不以静态或受控结果销账。

1. 逐文件对实际修改的全部 JS/MJS 执行 `node --check`；`package.json` 执行 `JSON.parse`。嵌套生成的 host-deps hookSource 必须展开成 data URL 后做 ESM 解析回放，不能只检查外层；涉及宿主样本时，rc.1 兼容轮、rc.2 兼容轮与 rc.3 当前轮分别从对应 dsh 命令或安装 `package.json` 只读取得依赖前缀，分别设置 `DSH_INSTALL_ROOT=<本次真实代码依赖前缀>`，并使用 `node --import ./pe-test/_shared/host-preload.mjs`，只读核对各自声明根内的 manifest/adapter，禁止借用 profile/全局宿主或串用另一版本前缀。
2. 严格按验收顺序运行（纯 W 工具直接 `node`，需要 Host 代码的测试才显式设置代码根与 host-preload）：
   - `DSH_INSTALL_ROOT=<本次真实代码根> node --import ./pe-test/_shared/host-preload.mjs pe-test/tools/step-01-设置迁移.mjs`
   - `DSH_INSTALL_ROOT=<本次真实代码根> node --import ./pe-test/_shared/host-preload.mjs pe-test/tools/step-01-设置页配置.mjs`
   - `DSH_INSTALL_ROOT=<本次真实代码根> node --import ./pe-test/_shared/host-preload.mjs pe-test/tools/step-01-qqbot-安装映射.mjs`
   - `DSH_INSTALL_ROOT=<本次真实代码根> node --import ./pe-test/_shared/host-preload.mjs pe-test/tools/step-01-预设完整性.mjs`
   - `DSH_INSTALL_ROOT=<本次真实代码根> node --import ./pe-test/_shared/host-preload.mjs pe-test/tools/step-00-全流程回归.mjs`
   - `DSH_INSTALL_ROOT=<本次真实代码根> node --import ./pe-test/_shared/host-preload.mjs pe-test/tools/step-00-跨平台写拦截.mjs`
   - `DSH_INSTALL_ROOT=<本次真实代码根> node --import ./pe-test/_shared/host-preload.mjs pe-test/tools/step-04-路由与写闸门.mjs`
   - `DSH_INSTALL_ROOT=<本次真实代码根> node --import ./pe-test/_shared/host-preload.mjs pe-test/tools/step-04-context-gate宿主回归.mjs`
   - `DSH_INSTALL_ROOT=<本次真实代码根> node --import ./pe-test/_shared/host-preload.mjs pe-test/tools/step-05-角色预设宿主回归.mjs`（角色预设机械契约：roster/assertProvider/header.agentPreset/工具面/persona 渲染/旧值回落）
   - `DSH_INSTALL_ROOT=<本次真实代码根> node --import ./pe-test/_shared/host-preload.mjs pe-test/tools/step-06-08-v4取证回归.mjs`（顶层 import 插件模块经 gate-decisions 连带 @deepseek-ai/dsh-llm 等 peer 依赖，必须带代码根与 host-preload；缺 js-yaml 或 dsh-llm 即表示未带代码根前置）
   - `DSH_INSTALL_ROOT=<本次真实代码根> node --import ./pe-test/_shared/host-preload.mjs pe-test/tools/step-06-线索落盘.mjs --full`（完整 P 取证仅由批准窗口执行；需保留完整 stdout/stderr 时使用 `--full` 或分别捕获到文件；compact 模式下脚本末尾 `process.exit` 可能截断管道 stdout，退出码0不等于完整结果；输出模式不补依赖、不改变断言）
   - `DSH_INSTALL_ROOT=<本次真实代码根> node --import ./pe-test/_shared/host-preload.mjs plugins/dsh-extra-plan/scripts/generate-runtime-defaults.mjs --check`（生成器经 preset-settings 静态 import preset-yaml 顶层加载 js-yaml，本仓及祖先目录无 node_modules，裸 node 必 MODULE_NOT_FOUND；缺 js-yaml 即表示未带代码根前置；实测带前缀后 7 个生成物逐个 [check] 通过）
   - 扫描根内代码改动时冻结前完成代码地图生成与人工描述复核；纯文档改动不生成正式地图，正式阶段只运行 `node pe-test/tools/代码地图生成.mjs --check`，避免普通生成改时间戳，再执行最后一键 step。
3. 自动测试不得执行真实 PowerShell 重定向写；测试前后 `pe-test/reports/_s4b_pwsh.txt` 必须不存在。常规回归命令退出码必须为 0，输出不得有 FAIL、SyntaxError、UnhandledPromiseRejection；runner 的 ETIMEDOUT 明确归失败而非环境未执行，普通说明含 FAIL/Error/导航失效不单独判失败，必须以退出码/结构化统计为准；context-gate 独立脚本若有 INCOMPLETE 必须非零，一键结果结构化标为部分执行而不计 PASS。缺少 js-yaml、dsh-llm 或其它模块导致 `MODULE_NOT_FOUND` 只记 `INCOMPLETE`；真实断言失败、`TypeError`、超时仍按 `FAIL`，不因 `--full`、文件捕获或 exit 0 改写。SKIP/INCOMPLETE/HUMAN/NOT-RUN 单列且不计 AUTO PASS。
   - **usage 后台专项门（AUTO/W）**：在隔离 fixture 与模拟安装布局中，Worker 正在忙算时主线程仍须完成 HTTP 响应；settings 行 apply 的 root `ctx.effect` 只调度真实 Worker，Worker 完成当轮模式/血缘首帧识别、mtime→ts 增量筛选、扫描/解压/聚合、严格解析与单 archive temp→rename 发布，失败只 `failed`/warn 且不回退同步主线程；owner 单飞、同根串行及 `scanUsageRows`/`archiveLedger`/`startupArchive` 同步 API 保持。模式/血缘识别仅保留当轮内存，现有首帧路径仍整文件读盘仅解首帧；相同 ISO 毫秒 mtime/ts 跳过完整用量重扫，变化/回退/未入账才解析，成功 ts 记文件 mtime，失败不推进；无持久 `session-presets` 读写、无说明行检查点或全量重扫替代。共享 `logs/dsh-extra-plan/` 只管理本人 `extra-plan-usage-ledger.jsonl`、按需 `extra-plan-usage-errors.jsonl` 与本人 temp/lock；错误 JSONL 每行可解析且仅含字符串 `ts`、`reason`、`message`，目录可同时含其他 owner 日志/文件，专项门不得按“仅两文件”误判、改名、合并或清理他人日志。协作取消只在首次 archive rename 前安全退出，要求清理本人 temp/lock 且既有 archive 字节与 mtime 零变化；rename 后视为已提交并返回真实 `archived`。不对真实并发日志 mtime 绝对不变作承诺；三秒预算仅为 archive 检查点，不是全部扫描期限。
   - **权限与部署分层（HUMAN/NOT-RUN）**：Host 权限、真实安装/启动/HMR、生产会话和大日志内存仍待用户复测；缺少这些条件不得销 AUTO，静态/隔离结果不写成实机通过。
4. 当前声明范围为 dsh 精确并集 `0.2.2-rc.1 || 0.2.2-rc.2 || 0.2.2-rc.3`：rc.3 是当前目标，rc.1 与 rc.2 是仍在活动支持的兼容目标；两插件各自 manifest 为版本真源：核心插件以[核心插件 package.json](<../../plugins/dsh-extra-plan/package.json>)中的 `engines.dsh` 与三项 @deepseek-ai peer 为准，QQBot插件以[QQBot插件 package.json](<../../plugins/dsh-extra-plan-qqbot/package.json>)中的 `engines.dsh` 为准，`schemastery` peer 为 `~3.19.0`。三版本必须分别用各自只读依赖前缀设置 `DSH_INSTALL_ROOT` 取证，不把本机盘符写进通用文档；0.2.1 系列仅存于远端分支 dsh-v0.2.1rc-qqbot-v0.5.2-only，当前 main 不承载。根 `README.md` 仍保留旧 rc.1 单版本声明且冻结，本组文档披露上述差异但不修改它。生产部署及真实 provider、GUI、QQBot 消息、重启和台账所列 HUMAN 待办项由用户另行复测；静态/隔离 PASS 不替代 HUMAN，未执行项保持 `NOT-RUN`。
5. **部署前预检与版本迁移测试要求**（不等于部署许可）：
   - **版本路径标记与将来撤销**：`DSH_COMPAT_RC1`（rc1 兼容路径）只紧邻 rc.1 专用块（旧 `agent_id`、旧三名、五字段旧范围：核心 `engines.dsh`、`dsh`/`dsh-llm`/`dsh-agent-preset` 三项 peer、QQBot `engines.dsh`，以及 rc.1 专用正例/矩阵），`DSH_CURRENT_RC2`（最新路径，rc.2 与 rc.3 共用该路径）只紧邻 rc.2 与 rc.3 共用块（新 `agent`/`resolveName`、`dsh-doc`、rc.2 与 rc.3 共用正例/矩阵），并在相邻文字写用途与删除边界；共享安全核心、通用日志解析、普通项与必要历史取证不得归入旧兼容。JSON 保持合法 JSON，不加注释。未来撤销 rc.1 必须另获授权：先检索两标记、精确版本声明/正例和旧参数/技能，再协调删除五字段旧范围、旧参数/旧三名/专用测试与旧矩阵，最后完整复验 rc.2 与共享安全；禁止按标签或字符串批量删除所有 rc.1 行。生产边界与根 README 冻结差异继续保留。
   - **何时必做**：任何插件代码改动的交付前，以及宿主版本升级（含 `engines.dsh` 与三项 @deepseek-ai peer 收口到新版本）时，必须完整重跑本节 1 至 3 步，不得以「仓库验收已完成」代替。
   - **版本不一致时用新版本环境测**：当新版本代码环境与实际生产环境版本不一致（典型：仓库已收口到新版本、生产仍跑旧版本）时，必须先在**新版本代码环境**显式设置 `DSH_INSTALL_ROOT=<新版本真实安装根>`（从该 `dsh` 命令或其安装 `package.json` 只读取得）跑通全套；不得改在旧版本生产环境里跑，否则版本门控直接拒绝，且无法暴露新版本的 API 漂移。该场景下旧版本生产环境的结果不能作为新版本代码的验收依据。
   - **升级后重跑**：生产升级完成后，必须用**升级后的真实安装根**再跑一次同一套预检；两次均退出 0 且无 FAIL 才具备部署条件。
   - **失败即停止**：任一项失败、或 `engines.dsh` 与目标宿主版本不匹配，一律停止部署，不得降级记为 HUMAN/NOT-RUN 后继续。
   - **边界不变**：`DSH_INSTALL_ROOT` 只是只读**依赖前缀**（须能从该前缀解析 `node_modules/@deepseek-ai/*`），不是 `node_modules/@deepseek-ai/dsh` 应用包根，也不是数据根 `DSH_HOME`；数据侧验证另需显式 `--host-root` 加精确 `--profile`/会话目标。三个版本的前缀分别取证，不把本机盘符写进通用文档。既有安装专用说明中的 `--dsh-root` 若表示应用包根，不得与 `DSH_INSTALL_ROOT` 混用，本轮不执行该安装。该预检不写生产目录、不代替用户部署；若把应用包根误作依赖前缀，`installAnchor` 会解析失败。
   - **预检范围**：本条预检只覆盖 rc.1 兼容轮、rc.2 兼容轮与 rc.3 当前轮各自代码前缀上的自动回归（本节第 1 至 3 步，全部命令仅需对应 `DSH_INSTALL_ROOT`）；`--host-root` 数据侧项、`step-99` 实账统计与 HUMAN 人眼项不属本预检范围，按本节第 4 条与[实机闸门测试流程](ai-实机闸门测试流程.md)单列执行，不得因未执行而判为预检失败。

## 改动域 → 唯一检查入口

| 改动域 | 主要检查 |
|:--|:--|
| 闸门（含 job_kill/send_message/job_list/list_agents 四工具闸门）、route/purpose、A/C/M、PTC 呈现 | `step-00-全流程回归.mjs`、`step-04-路由与写闸门.mjs` |
| save_plan/save_probe、单次失败清理、证据合同 | `step-00-全流程回归.mjs`、`step-06-线索落盘.mjs`；save_plan 按逐文件操作/M点和真实源核实合同执行，验收按新定位取证；限制以 `lib/save-contract.js` 为准；失败保留首错/阶段并由 AI 主动重试，不扫描旧 journal |
| 预设默认、settings、profile patch 自愈 | 对应 step-01 脚本；生成器与产物 `--check` 只读验证 |
| 模型路由、usage、会话形状 | step-00、step-04 P4、step-07 HUMAN 取证；静态结果不替代实机 |
| 代码地图 | W 内运行 `node pe-test/tools/代码地图生成.mjs` → 人工描述复核 → `node pe-test/tools/代码地图生成.mjs --check`；纯文档改动不生成正式地图，一键测试也内置 `--check` |
| 宿主升级/QQBot | [ai-宿主耦合台账](ai-宿主耦合台账.md) 的当前 checklist（核对清单）；`scripts/heal.mjs` 只作用户侧 CLI；SKIP 不销账，HUMAN 不伪造通过 |
| 实机闸门 | [ai-实机闸门测试流程](ai-实机闸门测试流程.md)；保持单文件顺序，不拆表/改编号 |

**诊断落盘契约**：`agent/error` 与 `agent/request-error` 各自向诊断目录追加一份 jsonl 诊断（裸文件名时写 host 侧 logs/dsh-extra-plan/，H 缺失时改用工作区 .extra-plan/logs/），写入整体吞错；usage 账本默认写 Host `logs/dsh-extra-plan/extra-plan-usage-ledger.jsonl`，按需诊断写 `logs/dsh-extra-plan/extra-plan-usage-errors.jsonl`，每行恰为字符串 `ts`、`reason`、`message`，无 Host 根不落 W 回退且不取代既有 agent/request/anchored 三类日志；记录存在不等于宿主重试已通过——诊断只用于定位根因，不是 retry 或恢复的证据。
- `agent/error` 侧写 `extra-plan-agent-errors.jsonl`，行字段为 `ts`、`sessionId`、`turn`、`step`、`chain`（无 `role`）；写入失败由模块级标志保证每进程只告警一次。
- `agent/request-error` 侧写 `extra-plan-request-errors.jsonl`（路径可经 `cfg.diagFile` 覆盖），行字段为 `ts`、`sessionId`、`role`、`turn`、`step`、`provider`、`message`、`code`（仅 `failure.code` 存在时带）、`causeChain`；写入失败由实例内标志保证每实例只告警一次。

## 代码地图维护规则

- `## 意图速查`、`## 文件总览`、`## 函数索引` 和原表头必须保留。先 grep 意图词得到函数名，再按函数名读机器行号。
- 运行地图生成器负责路径、函数名、行号区间、增删和漏检；人工只改意图、文件说明、功能描述与备注。机器生成的行数/行号不能手填冻结。
- 稳定匹配键是“相对路径 + 函数名 + 同名出现顺序”。维护时必须保持 `routeKey` 1 条、`isIdChar` 1 条的约束，并按当前源码实际同名条目及其顺序对拍 `visit`，不另写死历史次数；`--check` 不覆盖人工描述/固定尾部的全文比较，所以需另做结构键对拍。
- 描述必须保留当前行为关键词：证据引用成对剥除与单侧不剥、`atomicCommit` 阶段语义、`syncPreset` 以当前 settings 补齐 patch 为空为 idle（空闲稳态），但不因 idle 跳过资产校验与新资产挂载、`createApiHandler` PUT 仅投影、P2-2 agent-only（仅 Agent）cache、usage 启动扫描与覆盖式更新（幂等）、单调性保护、模式白名单预筛与文件 mtime 水位、同步 API 与 Worker 调度边界、失败批次持续重试、提交前后协作取消 等。
- 地图生成器是源码/测试索引，不是历史归档；无函数文件或纯描述变化不能只靠 `--check` 判定。
- 扫描根 = `代码地图生成.mjs` 的 `--roots` 默认 `plugins,pe-test/_shared`（不含 pe-test/tools）。仅扫描根内 .js/.mjs 增删或行号漂移、或地图人工描述需维护时运行普通生成；纯文档、pe-test/docs、pe-test/tools、pe-test/reports 改动不触发地图更新，收尾与验收只运行 `--check`。

## 交付格式与回滚

交付汇报不超过 15 行：

1. **完成清单**：逐项写文件/动作与关键结果值；
2. **自验证结论**：逐项写通过/不通过，并给一行证据；
3. **越界需求**：列出命令、目标路径、用途、预期内容；没有则写“无”。

回滚只能从唯一备份按文件/子块恢复，删除该维护任务新增归档，再运行地图 `--check`、step-00、step-04、step-06；不使用 Git 破坏性命令。`pe-test/reports/` 是临时产物，不纳入源改动。

## P2-4 生成链

作者值在 `plugins/dsh-extra-plan/assets/presets/extra-plan/agent.cordis.yml`；`runtimeDefaultsFromTemplate` 按十一项 sourceLocator 完整解析并由 `renderRuntimeDefaults` 生成 `DEFAULT_SETTINGS` 与兼容别名，运行时不解析作者 YAML。迁移顺序固定为：先改/校验生成器并生成新导出，再切换 settings-contract、Config/fallback、快照、同步和 client 消费者；未确认新导出前不得切消费者。

`client.js` 的 `EXTRA_FIELDS`/`HOST_ROW_FIELDS`/`ALL_FIELDS` 只允许生成器替换成对标记区块，标记内只派生 UI metadata，不带默认值、validator 或宿主对象，禁止手工编辑。默认仓库路径一并发布七个输出（运行时常量、主 definition、四角色 definition、client）；自定义 source/output 默认关闭仓库 client，显式 client source/output 才启用。

生成器先 parse/validate/编译 client，再进入同目录暂存、备份、顺序发布与逆序有限回滚；任一失败不得留下新版本，恢复失败保留首错、阶段、备份和残留。`--check` 只读比较并零写；该生成链不等同于 `save-persistence.js` 的方案工件落盘责任，生成物不得手改。

## 单一来源提醒

`gateWords` 只改 YAML；`SAVE_PLAN_LIMITS` 与 save_plan 限制数值只读 [lib/save-contract.js](../../plugins/dsh-extra-plan/lib/save-contract.js)，正文格式与字段关系以 [lib/save-plan-validation.js](../../plugins/dsh-extra-plan/lib/save-plan-validation.js) 为真源，真实源核实以 [lib/save-tool-factories.js](../../plugins/dsh-extra-plan/lib/save-tool-factories.js) 为准；`PROBE_LIMITS` 同样只读 save-contract 源码，文档不维护第二份运行时限值表。模型/usage/投影细节分别以对应 lib 与 step 脚本为准；历史故障、旧宿主面、77/217/209 等历史统计读[归档](ai-宿主耦合历史归档.md)，不作为当前值。

## 已知限制与遗留项

本清单分四组登记「已修的无效断言 / 有意保留的未修项 / 方案级缺口 / 审计工具已知口径」，每条都写清**是什么**、**为什么不修**、**如何判断它不是新 bug**；本章只登记当前状态与判定口径，不改变任何既有结论与数值。

### 一、已知无效断言（本批已修，防重复发现）

- **step-07 的 S07-3 两条**：是什么——两条 `S07-3 …成立=PASS/FAIL` 曾只按三元表达式拼文案，恒 PASS 且不进入退出码。为什么不修——已修复：违例逐条收集进 `s07Failures` 并由 `process.exitCode` 收口；两条结论行仍按原样式打印。如何判断不是新 bug——看 `s07Failures` 是否参与退出码；只看文案 PASS 不足以判定通过。
- **一键step测试 的 `classifyForensic`**：是什么——该分类函数曾恒返回 `HUMAN`，把可判定的结论压成单一状态。为什么不修——已修复并有回归锁。如何判断不是新 bug——`HUMAN` 只应出现在取证不完整处；若某条本可判定却仍为 `HUMAN`，先查 `classifyForensic` 分支，不要当成新故障。
- **step-04 的 `p2RendererTrapSchema`**：是什么——曾是死变量（赋值后无人消费），对应断言实际不检测任何东西。为什么不修——已修复（变量被真实消费或清理）。如何判断不是新 bug——检索到该名字只剩注释或文档引用，属已清理残留，不是回归。
- **step-06-08 的 5 条自证断言**：是什么——5 条断言用被测实现自身产物反证同一实现（自证），条件实际恒真。为什么不修——已修复并有回归锁。如何判断不是新 bug——自证形态会在模式 B（`|| true`、长度 `>= 0` 等恒真形态）复现为命中；命中不等于新 bug，先核对是否已换成独立真值来源。
- **step-01 的「三处同源」**：是什么——该跨处守护曾由生成器字面构造出「同源」结论，无法发现漂移。为什么不修——已修复：现取资产行、`HOST_ROW_IDS` 声明常量、`MODE_BY_ROW_ID` 派生映射三方实际取值比对，并计入 `pass` / `fail`。如何判断不是新 bug——同源类断言必须能指出三个独立取数来源；只剩一处来源时按「自证」复核。
- **step-01-预设完整性 的装饰性输出**：是什么——`preset.yml` 有效性那一行曾只有 `console.log('PASS …')`，没有失败路径、也不进计数。为什么不修——本批已修复：改成「成立则 `pass += 1`、不成立则 `fail += 1` 并打印实际类型（数组 / null / typeof）」的双分支真断言。如何判断不是新 bug——同类形态由模式 A 的条件式打印判据报出；若该分支确实带 `pass` / `fail` 计数，按既有计数排除规则不会报出（真断言不误报）。

### 二、已知未修项（有意保留，不视为缺陷）

- **`toolSdkSchemasOf` 与 `sdkSchemasForRendering` 双重投影**：是什么——同一份 schema 存在两条投影路径。为什么不修——合并会改取数口语义，风险高于收益。如何判断不是新 bug——两条投影的输出结构一致即正常；某一侧字段缺失或结构不同才是新 bug。
- **agent-session 未传 `projectionMode` 选项**：是什么——会话侧未显式传投影模式，走默认路径。为什么不修——需真实宿主验证 events 完整性，静态改可能把性能问题换成功能问题。如何判断不是新 bug——只有真实宿主观察到 events 缺失或重复才算新 bug，静态审计命中不算。
- **`index.js` 个别注释内嵌宿主固定行号**：是什么——注释里写了宿主固定行号。为什么不修——宿主升级后行号会漂移，这些注释只作定位提示、不参与判定。如何判断不是新 bug——行号对不上属已知漂移；若代码用行号驱动行为才是新 bug。
- **step-04 的 `matrixAgent` 保留未使用的 `mode` 形参**：是什么——该形参未被使用。为什么不修——保留签名兼容，删除属无收益改动。如何判断不是新 bug——形参未使用不是缺陷；调用方依赖该形参语义却拿不到值才是新 bug。
- **step-06-08 若干标签覆盖面不足与硬编码数量**：是什么——部分标签只覆盖部分分支，断言数量与夹具硬绑定。为什么不修——补全覆盖需新增独立真值来源，硬编码数量与当前夹具绑定，改动风险高于收益。如何判断不是新 bug——夹具变更导致数量不符属已知耦合；出现假 PASS 才是新 bug。
- **step-05 在 tools 服务缺失时抛错并导致后续组覆盖塌陷**：是什么——缺依赖时直接抛错，后续组覆盖跟着塌。为什么不修——需要有宿主环境才跑得通，改成降级会把「缺依赖」伪装成「通过」。如何判断不是新 bug——无宿主时该组报错或覆盖塌陷是预期；此时反而出现 PASS 才要查。
- **`host-deps` 的 `DSH_HOST_DEPS_QUIET` 未在其他文档登记**：是什么——该静默开关只写在 host-deps 源码里。为什么不修——开关口径唯一写在源码，重复登记会制造第二真源。如何判断不是新 bug——文档未提不是回归；开关行为与源码不一致才是新 bug。
- **ai-流程备查 中 locale 退役口径与新口径不一致**：是什么——历史备查文档仍按旧退役口径描述 locale 通道。为什么不修——属历史文档口径，改动需连带核对退役路径真值，风险高于收益。如何判断不是新 bug——以当前 locale 合同（两组字典只有 `meta`、退役 preset-sync 路径不可解析）为准，历史口径差按已知差异处理。

### 三、方案级已知缺口

- **代码地图生成器只索引函数形态绑定**：是什么——`Object.freeze` 常量对象（如 `MODE_BY_ROW_ID`）不会出现在地图函数索引中。为什么不修——这是生成器的设计选择而非遗漏；若需入图必须独立扩展生成器索引能力，属独立方案级工作。如何判断不是新 bug——地图里找不到某个常量名属已知缺口；某个真实函数缺席才是新 bug。

### 四、审计工具已知口径

- **模式 C 的「赋布尔标志后由 check 消费」误报簇**：是什么——`catch` 内赋布尔标志、随后由 `check` 消费的写法，在静态层面与静默吞错同构，会被归成一个簇（约 17 条）。为什么不修——工具只看 catch 块体，不推断后续消费链。如何判断不是新 bug——报出后若该 `catch` 之后确有 `check` 或失败登记消费，即属已知误报，剔除后再人工裁定。
- **模式 A 的条件式打印覆盖依赖本批新增判据**：是什么——新增的 `A_CONDITIONAL_PRINT` 判据识别「`if` / `else if` 开头、同一行内含 `console.log` / `console.error` 且含独立单词 `PASS` / `FAIL`」的装饰性输出；行首不是 `console` 前缀的旧形态此前会整条漏过。为什么不修——判据刻意只覆盖同行的 `if (条件) console.log('PASS …')` 形态，把 `if` 与打印拆到两行仍属已知盲区，扩展需另行评估。如何判断不是新 bug——同一行内的形态已被覆盖；跨行拆分的漏报属已知盲区，不算回归。
