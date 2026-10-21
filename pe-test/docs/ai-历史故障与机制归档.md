# 历史故障与机制归档

> **历史追溯层，非当前运行真源，非默认加载。** 当前状态、真相源和可执行合同以 [READAI](../../READAI.md)、[ai-机制设计](ai-机制设计.md)、源码与回归脚本为准。本文保留旧实现、故障过程、日期、批次标签和来源，避免把历史数字误当当前值。

## 归档边界

- 本文承接机制设计中的事故经过、旧实现、候选方案、日期化修订和批次叙事；当前安全结论仍回到 [ai-机制设计](ai-机制设计.md#当前安全结论索引)。
- `exploreBudget`、`PROBE_LIMITS`、gateWords、模型路由和 A/C/M 的当前值不以本文为源；本文出现的数字只表示历史报告口径。
- 本文不授权任何生产部署、DSH_HOME 写入或源码修改。

## 旧实现与已退役路径

1. **旧预设载体**：早期文档把预设描述为分发到 `$DSH_HOME/.agent-presets/extra-plan/` 的目录，并配套 `postinstall`/`distribute-preset.mjs`、manifest 和状态目录迁移。0.1.7 后改为 profile patch 根级 `preset-extra-plan` 声明行；extra-plan 核心包无 postinstall，启动自愈由 `lib/preset-sync.js` 负责。
2. **旧宿主 API/插槽**：`settings.register`、`settings.plugin.item` 与旧的独立设置卡片属于已退役路径；当前 0.2 独立 `settings.plugins.tab` 不再注册，但 0.1.7 原始 `plugins.row.config` keyed row 兼容接线由 0.1.7/0.2 支持构建保留，宿主提供对应 slot 时显示插件详情配置，slot 缺失时走 configEditor/SettingsForms 或 profile 权威行后备路径。后端 `.volatile()` Config、settings API、权威行/投影/热读仍活动。
3. **旧运行面**：`tool:cordis` 段、7 项 Cordis 工具、`codeRuntime`、`agentPresets.resolve/skills.register`、旧 workflow worker 包和旧工具结果信封不属于当前合同；旧 `customSkillDirs` 已被 `bundledSkillDir` 取代；当前只保留两项 Cordis 展示工具、`ptcRuntime` 与当前 PTC dispatch。
4. **旧兼容面**：0.1.2-rc.1～0.1.5-rc.2 的同码兼容、旧 `session.jsonl.zstd` 主世代、旧 profile 副本和旧预设迁移链只作历史回放背景；当前 peer 范围为 0.1.7-rc.1/rc.2 与 0.2.0-rc.1/rc.2，0.2.0-rc.2 仅有用户提供的范围受限 HUMAN 基线（2026-10-01 rc2 兼容反馈批次），不能把该命名批次之外的修复说成已通过。
5. **旧流程**：原 13 步流程已由主会话探查二选一、route→purpose→clarify、批准和执行/验收交接替换；旧步骤编号只用于历史报告配对。

## 故障与修复时间线

### 2026-09-10：run_code 容错开关

多调用容错教学文案曾造成修复循环。`runcodeCatchGate` 后来收敛为只影响多调用独立 try/catch 检查，不改变状态锚点、ask 返回链、预算耗尽白名单、`job_output` 或执行者豁免。当前行为见 [机制设计第二节](ai-机制设计.md#二run_code-组判定与-planner-预算)。

### 2026-09-12：探查者级联与预设载体

规划子代理派出的 one-shot 探查者曾因 planner 轮次结束、owner disposed 而级联取消；结论是禁止 planner 委派探查者，改由 planner 申请继续探查，再由主会话探查/委派并转达线索。同期旧 `.agent-presets` 分发叙事开始退役，旧版本兼容和 persona 双写曾作为跨代补救材料保留。

### 2026-09-23：PTC 拒绝包装与状态清理

PTC 子调用被拒时，宿主曾把中文闸门 reason 包进英文 `code run failed (exception)` 与 worker 栈，模型看不到教学文案；插件增加 `tools/post-execute` 的精确记录消费，只替换失败结果 `content`，未命中则透传。连带修复把拒绝与取消分开：拒绝不重置锚点，取消才清四字段。真实 PTC 端到端改写仍属于部署后实机项。

### 2026-09-25：v4 消息身份、MALFORMED 与子代理“腰斩”

- v4 行准入要求消息 `source.kind` 是生产者自有值，developer/message 还必须带正整数 `turn/step`；旧的 `{ kind:'plugin', plugin: ... }` 包裹形态退役。预算提醒和 MALFORMED 恢复改用 `plugin:@local/dsh-extra-plan`，坐标缺失时跳过注入但仍返回 retry。
- `save_probe` 参数过长可能在宿主流层触发 `MALFORMED_RESPONSE`，工具 execute 尚未运行；兜底转移到 `agent/request-error`，同一 turn/step 限次 retry 并注入短中文提示。
- 子代理回合可能出现无新 request/header、零 token、无结算详情的“腰斩”；`agent/error` 诊断落盘用于记录逐字错误，不能把记录存在写成宿主 retry 已通过。
- profile 内错误版本的 `@deepseek-ai/dsh-llm` 曾让工具集变化产生 `tool_removal`，DeepSeek API 返回 422，并造成后续会话每轮失败。处置是宿主运行时包只作 peerDependencies，清理 profile、污染会话续聊和 native↔PTC 切换仍待用户实测。

### 2026-09-26：展示投影、取证与补全批次

- P2-2 从每次完整渲染改为 apply 内 agent-keyed WeakMap；F/PTC 不读完整 SDK cache，L 才按完整 schema/language/renderer key 复用。renderer reject、降级空文本、迟到 promise、dispose 都加入边界回归。
- step-07 从全工作区 `parseSession` 常驻改为 `headerOfDir` 两阶段头扫描，只解析命中的直接 child，解决默认堆 OOM；输出语义保持 attempted route 与 actual provenance 分栏。
- 2026-09-26 实机流程补入 A49/A50、B0-B4、C13 和 deny 强/弱证据分级；来源为既有实机流程历史表注，这些是历史补全来源，不得据此改写当前 A/U/C/D/S/B 原始矛盾。
- 2026-09-26 取证记录（历史原值）：both ＋ catchGate=true 已覆盖 52 条实机项中的 51 条与 A21 的拦截面。0.2.1 起按 native 轮与 ptc 轮两轮重建：第一轮 native（直呼面）覆盖 A01-A56 的直呼侧；第二轮 ptc 分 2A 段（catchGate=true：A21 拦截面、A29/A31/A33、全部 run_code 聚合面、A38 弱证据）与 2B 段（catchGate=false：A21 放行面、开关局部性佐证、planner 续测）两段补验。用户完成轮间更新后按实机流程补测并把两轮取证结果合并到日期化报告。
- P2-2 历史取证曾以完整 L 首次渲染 2 次为未修复基线；后续边界回归将硬判据收敛为完整 L 首次 1、第二次仍 1，文本逐字相等，耗时只记录不设毫秒阈值。

### 2026-09-29：v0.4.0 四工具闸门与统计演进

- v0.4.0 增补 A51-A56：job_kill 仅直行放行、send_message 对 running 目标拒绝、job_list/list_agents 同锚点防轮询；六项均为实机直测项，A55/A56 要求同轮内第二次调用。来源为既有实机流程表注与 step-04 断言，旧编号及文案不在当前归档外重写。
- 该批次保留实机可测项统计由 44→52、第一轮 43→51 的演进值；统计只属于当时表口径，不替代当前脚本真实计数。

## 历史批次与标签

- P0-2/P0-3：注册失败分类、journal 阶段语义、当前 entries 形状与恢复边界。
- P0-4/P1-2/P1-4：session 分桶、usage final fold、provider/cw/rs 字段、cursor 增量与全量对拍。
- P1-3/P2-2：跨 provider 真实探针并发、SDK 文本复用与 renderer 调用计数。
- P2-4/B1/B2：默认值生成链、profile patch 声明行、settings 权威值上移、无 manifest 迁移与 per-apply 工厂边界。
- 这些标签用于旧报告定位，不构成当前版本的额外配置项、性能承诺或部署步骤。

## 历史清洗与事务坑点

- 证据引用曾采用“单侧装饰剥除”，导致 `_private.md`、`(abc).md` 等合法路径被误删字符；修复为成对剥除、单侧不剥，并保留 `.` 与 `/`。当前行为见 [代码地图](ai-代码地图.md) 的 `trimProbeEvidenceDecor`/`extractProbeEvidenceRefs` 描述。
- 原子提交曾把 journal 删除和 tmp 清理混为一体；阶段感知规则后来明确为 pre-journal 条件清理、post-journal 保留现场、全部目标确认后清 journal。当前合同见 `atomicCommit` 与 step-06。
- usage 曾在 disposed 异步路径中晚于 Map 回收，造成末轮漏记；后来固定同步 final fold → pending claims → session 回收。当前不变量见 [机制设计第六节](ai-机制设计.md#六session-生命周期与-usage-账本)。
- 宿主 settings 写链曾把权威值、声明行投影和回滚混在客户端；当前 settings 行是权威值，PUT 仅投影，`projection.applied` 是领域回执。

## 历史来源索引

- 入口/职责：`线索-ai文档精简规划-session2-20260929135248013-8148-0.md`、`线索-ai文档尾部补查-session2-20260929140123344-8148-0.md`、`线索-AI文档职责核对-b9d4b0d0-20260929142212491-8148-0.md`、`线索-文档职责核对-9d3fa918-20260929142106718-8148-0.md`。
- 机制/地图：`线索-代码地图结构探查-ce1ffe9c-20260929141732861-8148-0.md`、`线索-代码地图后段索引探查-0e48bc6d-20260929142018952-8148-0.md`。
- 宿主/失败面：`线索-宿主台账升级留档核对-7a50359c-20260929142001555-8148-0.md`、`线索-宿主耦合台账复核-4d2b33fc-20260929142933865-8148-0.md`、`线索-台账升级面核对-77303b0b-20260929142411630-8148-0.md`。
- 实机/批次：`线索-闸门流程证据-962d9715-20260929141857735-8148-0.md`、`线索-闸门流程顺序探查-ea77ca39-20260929143056782-8148-0.md`、`线索-实机闸门流程核对-a916aad4-20260929142411974-8148-0.md`。
- 原始当前入口与源码证据：`ai-机制设计.md`（备份版）、`plugins/dsh-extra-plan/index.js`、`lib/save-contract.js`、`lib/save-persistence.js`、`lib/model-routing.js`、`lib/sdk-text-cache.js`、`plugins/dsh-extra-plan/assets/presets/extra-plan/agent.cordis.yml`。

## 0.1.7 / 0.2.0 阶段宿主契约变化依据

> 本节由「单版本口径（仅 dsh 0.2.1-rc.2）」清理迁入：以下 27 条注释原文原先散落在插件源码、预设作者源、QQBot patch 与回归脚本里，说明「为什么当前实现是这个形状」。清理后活代码不再保留版本依据注释，原文逐字存此备查。行号为清理前快照行号（原文件镜像见 `.extra-plan/backup-dsh-extra-plan-清理0-1-7与0-2-0残留-20261018000842/`）。本节只作历史依据，不是当前合同；当前契约以源码、[ai-机制设计](ai-机制设计.md) 与回归脚本为准。
### 插件主入口 `plugins/dsh-extra-plan/index.js`

**1. `plugins/dsh-extra-plan/index.js:186`**（原文 186-194 行）

```text
// 注入形状（已按宿主 0.1.7-rc.2 源码核实；2026-09-25 订正）：developer/message 在已知事件白名单
// （dsh-session lib/types/known-event-types.js L36）；append 必须带 surfaceOp:'append'
// （dsh-session lib/index.js L294-308）；message 需非空 id、role='developer'、source.kind
// 非空字符串、content 数组（同文件 L1151-1176）；纯文本 content 不得带 headerSeq（L246-256）。
// **原记「invariant.js 无该分支（故无需坐标）」已被宿主源码证伪**：v4 行准入要求
// developer/message 自带 turn/step 且均为 ≥1 的整数，宿主 append 只补 seq/time、绝不补坐标，
// 坐标必须由调用方给出（实机报错为 SessionFormatError: developer/message turn must be a
// non-negative safe integer）；关系校验 companion 未挂载于活动 profile，故只需满足行准入。
// source 同须用生产者自有 kind，v4 禁止旧包裹形状（kind 取旧兜底值 plugin + plugin 包名字段）；本插件统一 plugin:dsh-extra-plan。
```

- 解释的当前行为：`malformedRecovery` 注入 developer/message 时必须自带 turn/step 坐标、`surfaceOp:'append'`、`source.kind` 用插件自有值 `plugin:dsh-extra-plan`；纯文本 content 不带 headerSeq。当前代码的注入形状按此实现。

**2. `plugins/dsh-extra-plan/index.js:377`**（原文 377-378 行）

```text
  // 预设目录后 skills.register 两个 SKILL.md。dsh 0.1.7-rc.1 的 resolve() 只返回 {id[,broken]}，
  // 恒无 path → 整块静默失效（预设挂载成功但 skill 永远不注册）。
```

- 解释的当前行为：说明为什么不能在 apply 期经 `agentPresets.resolve('cordis')` + `skills.register` 注册官方 SKILL.md：resolve 只返回 `{id[,broken]}`，恒无 path，整块静默失效。

**3. `plugins/dsh-extra-plan/index.js:381`**（原文 381-382 行）

```text
  // skill-filesystem 行进入本预设组合；0.2.0-rc.2 换通道：旧 customSkillDirs 经 ctx.fs 扫 asar 抛
  // 非 absent 错被 registry 整体跳过，故改 bundledSkillDir（trustedHost → node:fs）+ watch: false；
```

- 解释的当前行为：当前 C=1 创造 skill 面改由预设 `skill-filesystem` 行 `bundledSkillDir`（trustedHost → node:fs、watch:false）静态注册。

**4. `plugins/dsh-extra-plan/index.js:440`**（原文 440-442 行）

```text
  // HK1（0.1.7 换代）：agent/session-start 已删除；agent/created 升为 serial——
  // 监听器被宿主 await，任何抛出都会让会话创建失败。故整块必须吞错：内部异常只
  // console.warn 留痕，绝不放任传播（gateRuntime 已在 apply 期求值，此处不再抛）。
```

- 解释的当前行为：`agent/created` 为 serial：监听器内异常只 `console.warn` 留痕，不得放任传播导致会话创建失败。

**5. `plugins/dsh-extra-plan/index.js:460`**（原文 460-461 行）

```text
  // （0.2.0-rc.2 换通道，旧 customSkillDirs 走 ctx.fs 扫 asar 会抛错；不再靠「不注册」），
  // 一律从模型可见 catalog 隐藏——只影响名字可见性，skill 仍注册、按名调用仍可加载。
```

- 解释的当前行为：C=0 用 catalog 投影隐藏三个官方 cordis skill 名；skill 仍静态注册、按名调用仍可加载，不靠「不注册」实现隐藏。

**6. `plugins/dsh-extra-plan/index.js:681`**（原文 681 行）

```text
          // 0.1.7 服务名换代：codeRuntime → ptcRuntime（dsh-tools 的 PTC 运行服务）。
```

- 解释的当前行为：SDK renderer 语言取 `ctx.get('ptcRuntime').language`；旧服务名 `codeRuntime` 已不存在，缺失时回退 `typescript`。

### 预设作者源 `plugins/dsh-extra-plan/assets/presets/extra-plan/agent.cordis.yml`

**7. `plugins/dsh-extra-plan/assets/presets/extra-plan/agent.cordis.yml:99`**（原文 99-103 行）

```text
  # 【换通道修法】dsh 0.2.0-rc.2 下 customSkillDirs 经 ctx.fs 扫 asar 内路径会抛非 absent 错误
  # （realpath.native 非 asar 感知 + stat bigint 混算），provider 被 registry 整体跳过 → catalog 一条不发
  # （官方 cordis 预设同坏，session-ffcf6cc8 实测）。故改用 bundledSkillDir：trustedHost=true → 走裸
  # node:fs 通道（Electron 对 asar 感知），trustedHost 语义 = 跳过 ctx.fs 沙箱、指向官方只读内容；
  # 并加 watch: false（asar 目录不可 watch，否则 list() complete=false 同样不发 catalog）。
```

- 解释的当前行为：`skill-filesystem` 行改用 `bundledSkillDir` + `watch: false` 的换通道理由（asar 下的 ctx.fs 通道会抛非 absent 错、provider 被 registry 整体跳过、catalog 一条不发）。

**8. `plugins/dsh-extra-plan/assets/presets/extra-plan/agent.cordis.yml:301`**（原文 301-303 行）

```text
    # 0.1.7：旧的 worker-thread 工作流行（worker-thread 替身包）整包消失，替身为 dsh-workflow-ptc
    # （其行实例 PtcWorkflowEngine 继承 dsh-workflow 的 WorkflowEngine，仍注册 workflowEngine，
    # 由本组 isolate.workflowEngine 覆盖）；provider 保留本仓自定义薄委托层名。
```

- 解释的当前行为：预设 workflow 行替身为 `dsh-workflow-ptc`（PtcWorkflowEngine 继承 WorkflowEngine，仍注册 workflowEngine），由本组 `isolate.workflowEngine` 覆盖。

**9. `plugins/dsh-extra-plan/assets/presets/extra-plan/agent.cordis.yml:348`**（原文 348-357 行）

```text
# 0.1.7-rc.2 起 dsh-tool-cordis 只注册两个只读工具：列表工具（cordis_inspect_list，host
# 即时返回）与查询工具（cordis_inspect 系列的 _query 后缀名，对 client 平台无超时、直到页面
# 应答或取消才返回，见 step-01 S-宿主真值）；cordis_run 等 5 名已不存在，故不在任何 deny
# 清单中列出（deny 未知名会使宿主 tools.restrict() 抛错、子代理创建失败）。若某受支持版本
# 仍注册该 5 名工具：主会话由插件硬闸门按 write/edit 同规则管控（路由未确认拒绝、批准/直行
# 放行）；执行者/规划/验收/探查四子代理改由运行时闸门（plannerGateReason /
# childReadonlyGateReason）兜住。查询工具对 client 平台可能永久 pending（等页面应答），
# 0.2.1 起四角色预设（本文件第二文档）不挂 dsh-tool-cordis，查询工具天然不可见
# （探查者为一次性子代理，卡死即整条线索丢失）；主会话仍放行；列表工具 host 即时返回、
# 无卡死风险，不入任何 deny。
```

- 解释的当前行为：`dsh-tool-cordis` 只注册两个只读工具（cordis_inspect_list 与 cordis_inspect 的 _query 名），`cordis_run` 等 5 名不得写进 deny（未知名会让 `tools.restrict()` 抛错）；第二文档四角色不挂该行，故查询工具对子代理天然不可见。

### QQBot 静态 patch `plugins/dsh-extra-plan-qqbot/cordis.patch.yml`

**10. `plugins/dsh-extra-plan-qqbot/cordis.patch.yml:2`**（原文 2-3 行）

```text
# 【待有 QQBOT 环境再测试，本机不做验证】本文件两行按 dsh 0.1.7-rc.1 新包族静态重写，
# 无 qqbot 0.5.0 包可实测（方案 U3/U4 未核实项）。
```

- 解释的当前行为：本文件按 dsh `0.2.1-rc.2` 包族维护两行 insert；本机无 qqbot 0.5.0 包可实测，该环境项仍是 HUMAN。

**11. `plugins/dsh-extra-plan-qqbot/cordis.patch.yml:8`**（原文 8-11 行）

```text
    # 0.1.7-rc.1：旧 code-runtime 行（worker-thread 族的 code-runtime 包）整包消失，
    # 等价行 = ptc-runtime（dsh-base 同形行：id: ptc-runtime / name:
    # '@deepseek-ai/dsh-ptc-runtime-node'，提供 ctx.ptcRuntime）。
    # 若目标 qqbot 宿主的基础组合已带该行，本行须删除以免重复注册。
```

- 解释的当前行为：patch 里 insert 的 `ptc-runtime` 行提供 `ctx.ptcRuntime`；若目标 qqbot 宿主基础组合已带该行，本行必须删除以免重复注册。

**12. `plugins/dsh-extra-plan-qqbot/cordis.patch.yml:14`**（原文 14-16 行）

```text
    # 0.1.7-rc.1：旧 agent-presets 行（复数包）整包消失，替身 = dsh-agent-preset-registry
    # （Config{default, selectedDefault}；modeSelectionEnabled 已在 dsh 0.1.7-rc.2 删除，勿再写；
    # 预设声明行由各 bundle patch 提供）。
```

- 解释的当前行为：patch 里 insert 的 `agent-preset-registry` 行提供 `Config{default, selectedDefault}`；`modeSelectionEnabled` 已不属于该行契约。

**13. `plugins/dsh-extra-plan-qqbot/cordis.patch.yml:15`**（原文 15 行）

```text
    # （Config{default, selectedDefault}；modeSelectionEnabled 已在 dsh 0.1.7-rc.2 删除，勿再写；
```

- 解释的当前行为：同上块续行：`modeSelectionEnabled` 不得再写，预设声明行由各 bundle patch 提供。

### 回归脚本 `pe-test/tools/step-04-路由与写闸门.mjs`

**14. `pe-test/tools/step-04-路由与写闸门.mjs:58`**（原文 58-59 行）

```text
// （本机 npm 全局 dsh 实测 0.1.7-rc.2，profiles/web 另有 profile 内副本）；
// 故 Config 的 volatile/默认值契约改用源码文本静态核对（机械可核对），不依赖本机 schemastery 版本。
```

- 解释的当前行为：该测试不 import `lib/settings.js`（顶层依赖宿主 schemastery），改为源码文本静态核对 Config 的 volatile/默认值契约，避免依赖本机 schemastery 版本。

**15. `pe-test/tools/step-04-路由与写闸门.mjs:268`**（原文 268-270 行）

```text
// 0.1.7 取径订正：C=1 创造 skill 面不再经 agentPresets.resolve('cordis') 运行期注册
// （该 resolve 在 0.1.7 只返回 {id[,broken]}，path 恒 undefined），改为预设 skill-filesystem
// 行 config.customSkillDirs 静态注册——故 agentPresets/skills mock 与其断言整体退役。
```

- 解释的当前行为：创造 skill 面改为预设行静态注册后，`agentPresets`/`skills` mock 及其断言整体退役；mock harness 只保留 ptcRuntime 等现行服务。

**16. `pe-test/tools/step-04-路由与写闸门.mjs:269`**（原文 269 行）

```text
// （该 resolve 在 0.1.7 只返回 {id[,broken]}，path 恒 undefined），改为预设 skill-filesystem
```

- 解释的当前行为：同上块续行：resolve 只返回 `{id[,broken]}`、path 恒 undefined，这是静态注册取径的直接依据。

**17. `pe-test/tools/step-04-路由与写闸门.mjs:279`**（原文 279 行）

```text
      // 0.1.7 服务名换代：codeRuntime → ptcRuntime（SDK renderer 语言来源）。
```

- 解释的当前行为：harness 的 `ctx.get('ptcRuntime')` mock 对应插件 SDK renderer 语言来源，服务名为换代后的 `ptcRuntime`。

**18. `pe-test/tools/step-04-路由与写闸门.mjs:598`**（原文 598-599 行）

```text
// 0.1.7 换代：agent/session-start 已删除，会话启动注册改由 agent/created（serial，payload
// { agent, source }) 承担——监听器被宿主 await，抛错即会话创建失败。
```

- 解释的当前行为：回归夹具统一用 `agent/created`（serial，payload `{ agent, source }`）驱动会话启动注册，不再有 `agent/session-start` 通道。

**19. `pe-test/tools/step-04-路由与写闸门.mjs:1270`**（原文 1270 行）

```text
      // 0.1.7 换代：dsh-tool-jobs 的完成通知源为 { kind:'tool-jobs', form:'notice' }（旧 plugin 兜底 kind 已废）。
```

- 解释的当前行为：tool-jobs 完成通知的源形状是 `{ kind:'tool-jobs', form:'notice' }`；旧 `plugin` 兜底 kind 不再参与 job_output 重复调用放行。

**20. `pe-test/tools/step-04-路由与写闸门.mjs:2211`**（原文 2211-2212 行）

```text
// C=1 创造 skill 面（0.2.0-rc.2 换通道）：预设 skill-filesystem 行的 config.bundledSkillDir
// 指向官方包内 skills/（含 3 个 SKILL.md 目录）并配 watch: false；旧键 customSkillDirs 已删（坏通道）。
```

- 解释的当前行为：装配矩阵对 `skill-filesystem` 行的期望是 `config.bundledSkillDir` 指向官方包内 skills/ 且 `watch: false`；旧键 `customSkillDirs` 已删。

**21. `pe-test/tools/step-04-路由与写闸门.mjs:2666`**（原文 2666-2668 行）

```text
  // 夹具 = profile patch 内的 settings 行（0.1.7 新载体：captureRowSettings 按
  // id='dsh-extra-plan-settings' + config.<key> 定位），exploreBudget 取与内置默认 18
  // 不同的值，确保「读到文件」与「回退 fallback」可区分。
```

- 解释的当前行为：live-config 夹具取 profile patch 内的 `settings` 行（`id='dsh-extra-plan-settings'` + `config.<key>` 定位），exploreBudget 取非默认值以区分「读到文件」与「回退 fallback」。

### 其它回归脚本与共享模块

**22. `pe-test/tools/step-00-全流程回归.mjs:931`**（原文 931 行）

```text
// 0.1.7 换代：agent/session-start 已删除，启动注册改由 agent/created（serial）承担。
```

- 解释的当前行为：schema 段启动注册由 `agent/created` 承担，回归脚本直接调用其监听器。

**23. `pe-test/tools/step-00-跨平台写拦截.mjs:104`**（原文 104 行）

```text
  'nano notes.txt',       // 文本编辑器写文件：拦截（v0.1.7 起 BASH_MUTATION 覆盖 nano/vim/vi）
```

- 解释的当前行为：`nano`/`vim`/`vi` 文本编辑器写文件归入 `BASH_MUTATION` 拦截集合，用例数据保持该行。

**24. `plugins/dsh-extra-plan/lib/executor-spawn.js:9`**（原文 9-10 行）

```text
// config.deny（11 项，含 subagent_plan；0.1.7 起宿主已无 cordis 执行口工具 cordis_run，
// 故不列出——deny 未知名会使宿主 tools.restrict() 抛错），预设加载路径下本清单不可达；
```

- 解释的当前行为：`DEFAULT_DENY` 仅作 fallback（11 项，含 subagent_plan）；不列 `cordis_run` 的原因是 deny 未知名会让 `tools.restrict()` 抛错，预设加载路径恒以 `config.deny` 为准。

**25. `pe-test/_shared/host-deps.mjs:14`**（原文 14-15 行）

```text
//   不写盘）——profile 副本会被 DSH 优先解析并顶替宿主同名运行时行（0.1.7-rc.1 副本缺 tool-update 投影 →
//   会话内工具集变化产生的线上 tool_removal 被 API 422 拒绝、整会话报废；详见 ai-宿主耦合台账.md CF12）。
```

- 解释的当前行为：现场告警语义：profile 副本会被 DSH 优先解析并顶替宿主同名运行时行（缺 tool-update 投影），线上 `tool_removal` 会被 API 422 拒绝、整会话报废；只告警不改解析。

### 插件库 `plugins/dsh-extra-plan/lib`

**26. `plugins/dsh-extra-plan/lib/assembly-presentation.js:20`**（原文 20-21 行）

```text
// C=1 创造模式官方 skill 面（skill-filesystem 行 bundledSkillDir 静态注册，0.2.0-rc.2 换通道：
// 旧 customSkillDirs 经 ctx.fs 扫 asar 抛非 absent 错 → 改 trustedHost/node:fs 通道 + watch: false）：
```

- 解释的当前行为：`CREATIVE_SKILL_NAMES` 对应 `skill-filesystem` 行的 `bundledSkillDir` 静态注册（trustedHost/node:fs 通道 + watch:false），C=0 时只做投影隐藏。

**27. `plugins/dsh-extra-plan/lib/preset-yaml.js:550`**（原文 550 行）

```text
 * 纯字符串处理、不写文件；dsh 0.1.7-rc.1 的宿主写链一律走 configEditor.edit。
```

- 解释的当前行为：`patchYamlScalar` 只做纯字符串、保格式的迁移期文本改写，不写文件；宿主写链一律走 `configEditor.edit`。

## 当前结论回链

当前必须继续遵守的结论只有：拒绝不清状态、取消清阶段；组拒无副作用；方案/验收成对原子落盘；strict 模型路由必须真实 probe 或可靠 fallback；A/C/M 仅是模型可见投影；P2-2 cache 不跨 Agent；usage final fold 同步且按 session 隔离。任何历史描述与当前合同冲突时，以 [ai-机制设计](ai-机制设计.md) 和源码/回归真源为准。 2026-09-29 文档索引补充：旧公开 preset 声明与 client-bridge 已退役；两公开行、内部 carrier、纯 definition 与官方 adapter 的事实以该命名批次方案/验收和源码为准，不改写本段历史事实。
