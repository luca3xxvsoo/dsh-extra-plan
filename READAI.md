# 按需规划模式（AI 入口导航）

> 先读本文件，再按场景打开一个入口；普通任务不默认加载历史归档。本文只放导航、当前兼容、安全边界和真相源，不复制机制长文。

## 按场景加载

| 场景 | 入口 | 时机 |
|:--|:--|:--|
| 项目全貌、五角色、模块 owner | [ai-概览](pe-test/docs/ai-概览.md) | 普通改动前 |
| 机制不变量与设计理由 | [ai-机制设计](pe-test/docs/ai-机制设计.md) | 改闸门、预算、落盘、裁剪前 |
| 备份、禁改、回归、交付 | [ai-维护手册](pe-test/docs/ai-维护手册.md) | 修改前后 |
| 主会话到验收的交接顺序 | [ai-流程备查](pe-test/docs/ai-流程备查.md) | 流程拿不准时 |
| 函数定位、行号与机器索引 | [ai-代码地图](pe-test/docs/ai-代码地图.md) | grep 后局部 read |
| DSH/QQBot 当前宿主契约 | [ai-宿主耦合台账](pe-test/docs/ai-宿主耦合台账.md) | 升级或宿主异常时 |
| 唯一实机顺序 runbook | [ai-实机闸门测试流程](pe-test/docs/ai-实机闸门测试流程.md) | 部署后由用户验收 |
| 旧机制、故障与批次追溯（非默认） | [ai-历史故障与机制归档](pe-test/docs/ai-历史故障与机制归档.md) | 需要历史根因时 |
| 旧宿主耦合、历史快照与证据勾销（非默认） | [ai-宿主耦合历史归档](pe-test/docs/ai-宿主耦合历史归档.md) | 需要升级历史时 |

上述 9 个既有入口路径继续保留；两个归档直接位于 `pe-test/docs/`，不创建归档子目录或其它项目文档。

## 当前兼容与安全边界

- 当前支持范围为 dsh `0.1.7-rc.1 || 0.1.7-rc.2 || 0.2.0-rc.1 || 0.2.0-rc.2`；插件 peerDependencies 是版本真源。`0.2.0-rc.2` 已通过用户提供的 HUMAN 实机兼容测试（范围受限，2026-10-01 rc2 兼容反馈批次），但本轮修复后的 A09/A10/A11 与双版本设置入口纠偏仍待复测；OS、profile/mode、SESSION_ID、部署 commit、原始报告路径未提供。QQBot、生产、真实消息、`/preset`、question/approval、postinstall/allow-build 与完整 A01-A56 仍是 HUMAN，不外推为通过。
- 五角色顺序：主会话 → 探查者 → 规划子代理 → 执行者 → 验收者。路由/目的/澄清/批准是机械锚点；唯一受限写例外是 `save_plan` 双文件工件，其余工作区写入按批准后的执行者流程进行。主会话干预工具（job_kill/send_message/job_list/list_agents）受主会话层闸门限制。
- A/C/M 是模型可见投影维度：A=anchoredBootstrap，C=creativeMode，M=`native|ptc|both`；F/L 以首个 `tool/call` 为界。展示隐藏不等于运行时 binding 安全隔离，真实取证见实机流程。
- AI 不执行生产部署；仓库验收通过后由用户操作部署与实测。工作区外写入被委派边界拒绝时，不逐条尝试，不设置 `sandbox_permissions`，只在汇报中列越界清单。

## 真相源短表

- gateWords 唯一人工值源：[agent.cordis.yml](plugins/dsh-extra-plan/assets/presets/extra-plan/agent.cordis.yml) 的 `config.gateWords`；`lib/gate-words.js` 只负责字段、校验和运行时派生。
- save_probe 限制与渲染合同：[save-contract.js](plugins/dsh-extra-plan/lib/save-contract.js)；验证：[save-probe-validation.js](plugins/dsh-extra-plan/lib/save-probe-validation.js)。文档不维护第二份限制值表。
- 默认值与预设声明产物：[generate-runtime-defaults.mjs](plugins/dsh-extra-plan/scripts/generate-runtime-defaults.mjs)；生成物只读、不得手改。
- 函数路径/行号/结构：[代码地图生成.mjs](pe-test/tools/代码地图生成.mjs) 与 [ai-代码地图](pe-test/docs/ai-代码地图.md)；人工描述与机器索引分工不同。
- 当前宿主状态：[ai-宿主耦合台账](pe-test/docs/ai-宿主耦合台账.md)；历史数字与已删除耦合只在[历史归档](pe-test/docs/ai-宿主耦合历史归档.md)中追溯。

## 文档修改边界

- 本轮按批准清单修改工作区源、测试与 AI 文档；仓库根 `README.md` 仍不改，官方 dsh/官方预设、生产环境、profile 与 `$DSH_HOME` 也不改。bundle 详情公开 insert 恰为 `dsh-extra-plan-settings`、`extra-plan-preset-sync` 两行；Client carrier 由 settings 内部官方 Loader Group 挂载，preset-sync 读取纯 definition 并直接复用官方 AgentPreset adapter。0.2 独立 `settings.plugins.tab` 入口移除；0.1.7 原始 `plugins.row.config` keyed row 由 0.1.7/0.2 支持构建保留。settings/Config/投影/preset-sync/live-config 后端链不变。
- 工作区内 AI 维护文档（含台账）可按批准方案修改；修改前按维护手册创建唯一 `.extra-plan/backup-dsh-extra-plan-JS审查修复-<YYYYMMDDHHMMSS>/`，同一任务续跑沿用，不覆盖镜像。
- `pe-test/reports/` 只接收临时测试产物，不纳入源改动；不调用 `git reset`、`git checkout`、`git clean`。
- 界面文案只给结论级信息；技术细节仅放硬闸门给 AI 的文案、诊断/日志和本组 AI 文档。

## 验收顺序

按[维护手册](pe-test/docs/ai-维护手册.md)执行固定顺序：批准清单中的实际修改 JS/MJS 逐文件 `node --check` → step-01 设置页配置 → step-00 全流程 → step-00 跨平台 → step-04 → step-06-08 → step-06 → 代码地图生成 → 人工描述复核 → 地图 `--check` → 一键 step。Markdown 不伪造语法门结果；环境项的 SKIP/HUMAN 不计作通过。
