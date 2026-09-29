# 按需规划模式 — 项目概览

> 动手前速读：项目身份、五角色、改动归属和高层闭环。机制细节读 [ai-机制设计](ai-机制设计.md)，流程细节读 [ai-流程备查](ai-流程备查.md)，函数定位读 [ai-代码地图](ai-代码地图.md)。

## 项目身份与支持范围

`@local/dsh-extra-plan` 是 dsh 的按需规划预设：AI 先只读理解，经路由、目的、澄清、批准四级机械锚点后执行；`save_plan` 是受限的方案/验收双文件写例外。当前只支持 dsh `0.1.7-rc.1 || 0.1.7-rc.2`，QQBot 真实交互与生产部署仍由用户完成并单独标记 HUMAN。

高层闭环：用户需求 → 主会话只读探查 → 探查方式二选一 → 路由确认 →（需要时）目的确认/澄清 → 线索与方案/验收落盘 → 用户批准 → 执行者 → 验收者 → 用户部署与实测。路由、批准、生产部署的边界不能用 AI 自觉替代。

## 五角色

| 角色 | 当前职责 | 交付边界 |
|:--|:--|:--|
| 主会话 | 接收需求、复杂度评估、路由/批准、分派、汇总 | 只读探查可随时做；主会话写入受路由/批准约束 |
| 探查者 | 后台只读批量探查、`save_probe` 证据落盘 | 仅主会话可委派；回传路径与短摘要 |
| 规划子代理 | 读取线索、补充只读核对、`save_plan` 双文件 | 不得委派探查者；预算耗尽走继续探查往返 |
| 执行者 | 按方案与验收文件改工作区 | 不重新规划；逐项自验证；禁止越界写入 |
| 验收者 | 只读验收文件逐条复核 | 输出逐项通过/不通过与证据；不改文件 |

## 模块 owner 与当前不变量

| 功能域 | owner / 入口 | 当前摘要与唯一详版 |
|:--|:--|:--|
| 四级闸门与状态 | `plugins/dsh-extra-plan/index.js` | `route→purpose→clarified→approved`；拒绝不清状态、取消清阶段状态。详见 [机制设计](ai-机制设计.md#一四级机械锚点路由目的澄清批准)。 |
| gateWords | `assets/presets/extra-plan/agent.cordis.yml` + `lib/gate-words.js` | YAML 七键是唯一值源，apply 先整组校验，再注册七个变量；旧词不推进状态。详见 [机制设计](ai-机制设计.md#一-1闸门关键词单一来源与运行时词表v030)。 |
| run_code 组判定 | `lib/run-code-static.js` + 根入口 | 成员逐点判定、组拒零副作用；多调用需独立容错，planner 单实例受预算上限。 |
| save_plan/save_probe | `lib/save-contract.js`、`lib/save-probe-validation.js`、`lib/save-persistence.js`、`lib/save-tool-factories.js` | 合同、校验、原子提交/journal、工具工厂分层；限制值以源码为准，详见机制设计与 step-06。 |
| planner 预算 | `lib/planner-budget.js` | 按锚点计数，提醒/耗尽后申请继续探查；`exploreBudget` 不等于历史 evidence 数。 |
| 模型路由 | `lib/model-routing.js` | planner 与非 planner 分离；legacy/strict 由开关分流，strict 必须完成真实 probe 或已验证父 fallback。唯一流程细节见 [流程备查](ai-流程备查.md#⑩-1planner-与非-planner-首请求时序屏障crossproviderplannermodel)。 |
| A/C/M 投影 | `lib/assembly-presentation.js` + 根入口 | 只改模型可见 assembly/schema/catalog，不替代 runtime deny；PTC 首轮手写 `tool:read`，L 段回宿主原文。 |
| P2-2 SDK 文本 | `lib/sdk-text-cache.js` | apply 内 agent-keyed WeakMap；完整 schema/language/renderer 变化失效，同 key 并发合并，失败不缓存；调用计数 1 是硬门槛。详见 [机制设计](ai-机制设计.md#p2-2-sdk-文本复用的安全边界)。 |
| 设置双通道 | `lib/settings.js`、`lib/client.js`、`lib/preset-settings.js` | 8 项 UI + 2 项宿主行设置进入 settings 权威值；PUT 只做声明行投影；当前入口为 Plugins 页已安装包行详情。 |
| P2-4 默认链 | `agent.cordis.yml` → 生成器 → `preset-defaults.generated.js` | YAML 叶值是作者真源，生成物是派生值，运行时不解析 YAML；坏模板保留 last-known-good。详见 [维护手册](ai-维护手册.md#p2-4-生成链)。 |
| 预设自愈 | `lib/preset-sync.js` | profile patch 声明行、主体剥离比对、投影一致三条件成立才 idle；写盘只经 `configEditor.edit`，无旧状态目录。 |
| session/usage | 根入口 + `lib/agent-runtime.js` | 状态按 sessionId 分桶；disposed 内同步 final fold 后再回收；cursor 增量按 `session.seq`/`snapshotEvents`，不跨会话清理。 |
| 宿主升级 | [ai-宿主耦合台账](ai-宿主耦合台账.md) | 当前 HS/HK/SD/CF/QB、六项 HUMAN 与 SKIP 规则是升级入口；历史快照见[宿主历史归档](ai-宿主耦合历史归档.md)。 |
| 实机验收 | [ai-实机闸门测试流程](ai-实机闸门测试流程.md) | 单文件、一次性、顺序完整；A/U/C/D/S/B 行与矛盾原值不可静默修正。 |

## 维护与回归入口

- 地图：先 grep [ai-代码地图](ai-代码地图.md) 的意图速查，再按函数名取机器行号；同步由 `node pe-test/tools/代码地图生成.mjs` 完成。
- 自动回归：按 [ai-维护手册](ai-维护手册.md) 的固定顺序执行 step-00、step-04、step-06、地图生成/`--check` 与一键测试；AUTO 数量以 `pe-test/tools/一键step测试.mjs` 的数组为准。
- 证据与部署：step-07 必须显式 `SESSION_ID` 与 `PLANNER_PROMPT_SUFFIX`；静态/Mock 结果不能冒充生产实机。AI 在仓库验收通过前不触碰生产环境。

## 历史入口

- [历史故障与机制归档](ai-历史故障与机制归档.md)：旧实现、故障、日期化过程、批次叙事与已退役流程；不作当前运行真源。
- [宿主耦合历史归档](ai-宿主耦合历史归档.md)：旧宿主版本、已删除耦合、历史覆盖快照与 evidence 勾销；不作当前升级状态。
