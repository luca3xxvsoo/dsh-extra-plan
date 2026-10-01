# 宿主耦合历史归档

> **历史追溯层，非当前宿主真源，非默认加载。** 当前 HS/HK/SD/CF/QB、HUMAN 欠账和升级顺序以 [ai-宿主耦合台账](ai-宿主耦合台账.md) 为准；本文件只保留旧版本、已删除耦合、历史覆盖快照与 evidence 勾销，避免历史数字污染当前状态。

## 历史统计快照（原值保留）

- 早期仓库文件基线曾记录 55、52、62、63、70、71 等数字；后续一轮把覆盖口径收敛为 **77 个**，排除 `.extra-plan/` 与 gitignored `pe-test/reports/`。这些都是生成/复核时点快照，不是当前文件数。
- 历史报告曾记录 `pe-test/reports/` **217 个**文件；reports 是一键体检重写的 gitignored 产物，历史 217 不作当前统计。
- 宿主台账 evidence 原始勾销口径为 **80 + 79 + 50 = 209**；规划阶段曾写 208，后来按报告 C 的 50 条订正为 209。209 不是当前 `PROBE_LIMITS`、planner 预算或当前报告数。
- 台账记录日期曾从 2026-09-11 起多次补修到 2026-09-26；日期只表示历史复核批次。

## 已删除的历史耦合

### extra-plan 核心包

1. `CF1`：旧 `plugins/dsh-extra-plan/package.json` 的 `scripts.postinstall` 与 `distribute-preset.mjs`，曾在安装后解析 DSH_HOME、分发 `.agent-presets/extra-plan`；2026-09-25 死代码清理后核心包无 postinstall。
2. `CF2`：旧 `plugins/dsh-extra-plan/scripts/distribute-preset.mjs` 的 DSH_HOME 解析与 `syncPreset` 委派；当前启动自愈独立由 `lib/preset-sync.js` 处理。
3. `HS7`：旧 `cleanupLegacyFlashGuidePatches`/flash-guide 清理链；恒空转并直写 patch，因违反 configEditor 写链纪律删除。
4. `SD34`：本插件曾被拿来对照 `sessionProjections.stateOf`，最终全仓 0 次调用；当前沙箱走 `sandboxPolicy.overrideOf`。这是反向历史记录，不是活动耦合。

### QQBot 旧四处越权耦合

1. 旧 `inject = ['qqbot.bot', 'qqbot.sessionManager', 'userQuestions']`，直接依赖 qqbot 内部服务并 monkey-patch manager；当前精简包 `inject=[]`。
2. 旧 `apply-patch.mjs` 直接覆盖 qqbot 包 `dist/gateway/bootstrap.js` 与 `transport/outbound.js`；当前改为 profile patch 与自愈。
3. 旧做法向 `im-qqbot` 行写入 `config.preset: extra-plan`；当前由 agent-preset-registry 行的 `config.default=extra-plan` 间接承载。
4. 旧 patch 行带 `approvalEnabled:false` 越权开关；当前该 config 段已删除。

## 旧版本/旧 API 面

- 0.1.2-rc.1～0.1.5-rc.2 的 `settings.register`、`settings.plugin.item`、旧独立设置卡片、旧 `agentPresets.resolve/skills.register`、`codeRuntime`、`tool:cordis`、7 项旧 Cordis 工具、旧 workflow worker、旧 profile `.agent-presets` 目录均是历史迁移面。
- 0.1.5-rc.2 历史失败面包括 `tools.restrict()` 无 scoped context/空 filter 抛错、toolFilter 配置缺少 allow/deny 抛错；当前预设已保持 deny 形状，历史错误不作 0.1.7 运行结论。
- 旧双版本 schema 对照曾检查 persona `text`/`prefix`、agent-instructions、tool-fs-search、tool-subagent、tool-todo、agent-tool-presentation 等必填键；该历史批次当时只钉 0.1.7 系列（rc.1/rc.2）；当前 peer 版本见[ai-宿主耦合台账](ai-宿主耦合台账.md)，历史 PASS 不能代替当前宿主 schema 复核。
- `session.jsonl.zstd` 是旧代日志名，`session.v3.jsonl.zstd` 对应中间代，`session.v4.jsonl.zstd` 是当前世代；取证工具保留三代候选是兼容回放，不表示旧宿主仍受支持。

## 0.1.7 迁移背景（保留历史，当前风险见台账）

- **isolate 审计**：`mountPreset/leakedServices` 曾暴露未隔离 root service；必要服务 `workflowEngine`、`subagentModelSelection`、`toolResultPruner` 与保险项 `compaction`、`extraPlan` 后来统一按 `isolate:true` 处理。
- **settings 换代**：从 `settings.register` 迁到 Config `.volatile()`、`configure({auto:false})`、SettingsForms，再从 `plugins.item` 迁到 `plugins.row.config` + `whileServed`。
- **载体换代**：从用户预设目录/manifest/postinstall 迁到 profile patch `preset-extra-plan` 声明行；生成产物由 `dsh.bundle.patch` 装载。
- **包名/服务名换代**：`dsh-workflow-worker-thread` → `dsh-workflow-ptc`，`codeRuntime` → `ptcRuntime`，tool:cordis 段删除，工具集收敛为两个展示项。
- **rc.2 单侧观察面**：`sanitizeProfile` 可能整体搬移 patch，`configEditor.edit` 在值等于继承层时可能删除行；rc.1 现场已不存在，因此不能把单侧记录说成跨代结论。

## 历史 422 事件与依赖隔离

2026-09-25 的历史取证记录：profile 内错误版本 `@deepseek-ai/dsh-llm` 被优先解析，宿主工具集切换时把 `tool-removal` 送到只接受 addition 的 Messages API，出现 422；失败 developer 消息落盘后会使同一会话后续轮次继续失败。处置是 core package 的 `@deepseek-ai/dsh`、`@deepseek-ai/dsh-llm` 改为精确 peerDependencies，dependencies 不装宿主运行时副本。当前仍待用户完成 profile 清理、污染会话续聊、native↔PTC 切换三项实测，不能在台账中写成已恢复。

## 历史证据勾销索引（209）

原台账的 ③-E 曾按报告段落把 209 条 evidence 分配到 HS/HK/SD/CF/QB 条目：

| 历史证据段 | 原记录条数 | 历史去向 |
|:--|--:|:--|
| 报告 A：index.js 插件契约/钩子 | 12 | HK1-HK10 |
| 报告 A：服务与 ctx.effect | 5 | HS1、HS5、HS17、SD13-SD17 |
| 报告 A：子代理/会话/usage | 14 | SD3-SD6、SD9、SD12、SD20/21/22/27、HK9/HK21/HK22 |
| 报告 A：工具注册/deny/错误码 | 11 | HS17、SD18/19/25/26/32/36 |
| 报告 A：钩子签名与 mode | 8 | HK2-HK8/HK10 |
| 报告 A：事件负载与 Session 类型 | 14 | SD1/3/4/5/7/8/10/11/12/20/21/22/23/28/29/30/31/32 |
| 报告 A：agent 融合/PTC/tool-jobs | 11 | HK1/HK7-HK10/HK21、SD7/17/24/26/31/35 |
| 报告 B：settings/preset/client/executor | 21 | HS1-HS25、HK14/16/22、SD2 |
| 报告 B：发行脚本/包/patch/日志 | 8 | HK11-HK19/HK24、SD1/2、CF1-CF10 |
| 报告 B：宿主服务与图形/设置/预设 | 12 | HS1-HS16、SD13-SD22 |
| 报告 B：模块解析/locale/隔离/默认值 | 17 | HK11/13-16/20-22、HS5-7/17-22、SD33/34/36、CF7/9/11 |
| 报告 B：客户端/路径/子代理/布局 | 21 | HK10/13/19/23/24、HS8-HS16、SD1/2/35、CF2-CF9 |
| 报告 C：QQBot 插件/patch/package | 24 | QB1-QB21 |
| 报告 C：README/维护/回归/反证 | 17 | QB22-QB27 |
| 报告 C：宿主 app-boot/registry/CLI 与删除面 | 9 | QB13-QB18、QB20-QB21、④-B 历史四处 |

这张表是历史证据索引，不是当前活动覆盖率；SD9、SD13 等缺号按当时编号说明保留，不补造定义。

## 历史来源

- `D:\AI项目\dsh-extra-plan\.extra-plan\线索-宿主台账升级留档核对-7a50359c-20260929142001555-8148-0.md`
- `D:\AI项目\dsh-extra-plan\.extra-plan\线索-宿主耦合台账复核-4d2b33fc-20260929142933865-8148-0.md`
- `D:\AI项目\dsh-extra-plan\.extra-plan\线索-台账升级面核对-77303b0b-20260929142411630-8148-0.md`
- `D:\AI项目\dsh-extra-plan\.extra-plan\线索-文档职责核对-9d3fa918-20260929142106718-8148-0.md`
- 原备份台账中的 HS/HK/SD/CF/QB 四层表、③-E evidence 勾销表、④-B 历史耦合与 ⑦-1 历史面。

## 当前入口

需要当前版本升级判断时返回 [ai-宿主耦合台账](ai-宿主耦合台账.md)；需要机制当前结论时返回 [ai-机制设计](ai-机制设计.md)。本归档中的历史版本、历史日期、77/217/209 和已删除实现不得覆盖当前现场读取结果。
