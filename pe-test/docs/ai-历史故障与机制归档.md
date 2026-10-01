# 历史故障与机制归档

> **历史追溯层，非当前运行真源，非默认加载。** 当前状态、真相源和可执行合同以 [READAI](../../READAI.md)、[ai-机制设计](ai-机制设计.md)、源码与回归脚本为准。本文保留旧实现、故障过程、日期、批次标签和来源，避免把历史数字误当当前值。

## 归档边界

- 本文承接机制设计中的事故经过、旧实现、候选方案、日期化修订和批次叙事；当前安全结论仍回到 [ai-机制设计](ai-机制设计.md#当前安全结论索引)。
- `exploreBudget`、`PROBE_LIMITS`、gateWords、模型路由和 A/C/M 的当前值不以本文为源；本文出现的数字只表示历史报告口径。
- 本文不授权任何生产部署、DSH_HOME 写入或源码修改。

## 旧实现与已退役路径

1. **旧预设载体**：早期文档把预设描述为分发到 `$DSH_HOME/.agent-presets/extra-plan/` 的目录，并配套 `postinstall`/`distribute-preset.mjs`、manifest 和状态目录迁移。0.1.7 后改为 profile patch 根级 `preset-extra-plan` 声明行；extra-plan 核心包无 postinstall，启动自愈由 `lib/preset-sync.js` 负责。
2. **旧宿主 API/插槽**：`settings.register`、`settings.plugin.item` 与旧的独立设置卡片属于已退役路径；当前 0.2 独立 `settings.plugins.tab` 不再注册，但 0.1.7 原始 `plugins.row.config` keyed row 兼容接线由 0.1.7/0.2 支持构建保留，宿主提供对应 slot 时显示插件详情配置，slot 缺失时走 configEditor/SettingsForms 或 profile 权威行后备路径。后端 `.volatile()` Config、settings API、权威行/投影/热读仍活动。
3. **旧运行面**：`tool:cordis` 段、7 项 Cordis 工具、`codeRuntime`、`agentPresets.resolve/skills.register`、旧 workflow worker 包和旧工具结果信封不属于当前合同；当前只保留两项 Cordis 展示工具、`ptcRuntime`、静态 `customSkillDirs` 与当前 PTC dispatch。
4. **旧兼容面**：0.1.2-rc.1～0.1.5-rc.2 的同码兼容、旧 `session.jsonl.zstd` 主世代、旧 profile 副本和旧预设迁移链只作历史回放背景；当前 peer 范围为 0.1.7-rc.1/rc.2 与 0.2.0-rc.1/rc.2，0.2.0-rc.2 仅有用户提供的范围受限 HUMAN 基线，不能外推本轮 post-fix 通过。
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
- 实机流程补入 A49/A50、B0-B4、C13 和 deny 强/弱证据分级；这些是历史补全来源，不得据此改写当前 A/U/C/D/S/B 原始矛盾。

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

## 当前结论回链

当前必须继续遵守的结论只有：拒绝不清状态、取消清阶段；组拒无副作用；方案/验收成对原子落盘；strict 模型路由必须真实 probe 或可靠 fallback；A/C/M 仅是模型可见投影；P2-2 cache 不跨 Agent；usage final fold 同步且按 session 隔离。任何历史描述与当前合同冲突时，以 [ai-机制设计](ai-机制设计.md) 和源码/回归真源为准。
