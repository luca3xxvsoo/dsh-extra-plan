# 按需规划模式 — 项目概览

> 动手前速读：项目身份、五角色、改动归属和高层闭环。机制细节读 [ai-机制设计](ai-机制设计.md)，流程细节读 [ai-流程备查](ai-流程备查.md)，函数定位读 [ai-代码地图](ai-代码地图.md)。

## 项目身份与支持范围

`dsh-extra-plan` 是 dsh 的按需规划预设：AI 先只读理解，经路由、目的、澄清、批准四级机械锚点后执行；`save_plan` 是受限的方案/验收双文件写例外。当前声明支持范围为 dsh `0.2.1-rc.1 || 0.2.1-rc.2 || 0.2.1-rc.3 || 0.2.1-rc.4 || 0.2.1-rc.5` 五版本精确并集；旧版兼容见旧版分支。逐版本实测状态、证据等级与待核实项统一见[ai-宿主耦合台账](ai-宿主耦合台账.md)。QQBot、生产及真实交互仍单独标记 HUMAN。

根与角色口径：维护 W 取可信源树布局，不取 `process.cwd`、插件安装根或普通文件 `dirname`；部署/会话 W 取保存方案的 `session.header.cwd`，部署脚本仍把工件、fixture、报告等写在 W，不是只能访问 H。H 仅由真实 Host context/精确能力或测试显式 `--host-root` 与精确目标授权；`DSH_HOME`/`DSH_PROFILE`/`SESSION_ID` 的存在不授根，`DSH_INSTALL_ROOT`+host-preload 只授只读代码根，扩展名也不代表授权。标准 Web/QQ 由可信 `profileContext.name`/`startedBundles` 识别，Web→QQ 镜像保留，QQ 不适用返回 `not-applicable`，不误启动跨 profile；缺根、Other、非法/冲突来源均在 IO 前拒绝，H/W 重叠按用途分类，隔离 fixture 不等于实机。

高层闭环：用户需求 → 主会话只读探查 → 探查方式二选一 → 路由确认 →（需要时）目的确认/澄清 → 线索与方案/验收落盘 → 用户批准 → 执行者 → 验收者 → 用户部署与实测。入口判定：已给出现成方案（含文件、动作、期望）时直接进批准链，不经过探查与路由。路由、批准、生产部署的边界不能用 AI 自觉替代。

## 五角色

| 角色 | 当前职责 | 交付边界 |
|:--|:--|:--|
| 主会话 | 接收需求、入口判定、复杂度评估、路由/批准、分派、汇总 | 只读探查可随时做；主会话写入受路由/批准约束；main 保留 `send_message`/`interrupt_agent`/`list_agents`，job_kill 与轮询仍受主会话层闸门限制 |
| 探查者 | 后台只读批量探查、`save_probe` 证据落盘 | 仅主会话可委派；回传路径与短摘要 |
| 规划子代理 | 读取线索、补充只读核对、`save_plan` 双文件 | 不得委派探查者；预算耗尽走继续探查往返 |
| 执行者 | 按方案与验收文件改工作区 | 不重新规划；逐项自验证；禁止越界写入 |
| 验收者 | 只读验收文件逐条复核（每个执行者返回后按组派遣，主会话汇总） | 输出逐项通过/不通过与证据；不改文件 |

W/H 只决定路径归属，不改变上述五角色职责；隔离夹具、受控自动结果和静态 PASS 仍不等于实机部署或真实会话通过。

main 保留 `send_message`、`interrupt_agent`、`list_agents`；四角色 definition 均不挂 control binding，运行时按 `isSubagentChild` 对 `send_message`/`interrupt_agent` 的直呼与 `run_code` 成员硬拒，覆盖 planner、只读 child、executor 及 unknown/断链 child。自动最终结果不受影响；child 遇阻塞疑问以最终回复返回，main 可向 idle child 续轮。四角色仍按各自 definition 保留只读 `cordis_inspect_list`/`cordis_inspect_query`；main 的 send 仅直属父子、interrupt 仅调用者获任务/用户授权的后代，真实消息/中断仍留部署后 HUMAN。

## save_plan 派遣与验收职责

- 规划子代理写入成对的方案/验收工件；每份工件自行携带模式、任务/文件/依赖/执行组、检查/验收组、证据方式、收尾/全局和交接规则。它只保存合同，不自动创建、启动、监听或重试代理。
- 主会话读取两份工件后按任务 ID、完整执行组和依赖交付派遣，维护领取/回报并汇总全覆盖；各组产出稳定后即可组织对应组级验收，全部任务与收尾完成后再冻结源状态并做最终全局收口。工具 render 不是交接真源；同轮共享证据仅在相关源与条件未变化时复用。
- 执行者只修改获批任务和文件，先读两份工件，完成修改与快速自检；获明确授权时由执行者或直行主会话运行声明的执行取证并保存原始结果。执行者自检不等于正式验收。
- reviewer 按指定任务/检查范围只读复核期望、禁止和原始证据；只读复核由 reviewer 完成，需要写临时证据的执行取证由获批执行者或直行主会话完成，reviewer 读取结果后独立下结论。
- 执行组是逻辑打包/并行边界，不等于人数；一人可领取多个独立执行组，多任务不强制多人。验收组 R 与执行组 G 独立；相同公共检查只有唯一领取者，其他引用复用同一冻结轮证据。

## 模块负责人（owner）与当前不变量

| 功能域 | 负责人（owner）/ 入口 | 当前摘要与唯一详版 |
|:--|:--|:--|
| 四级闸门与状态 | `plugins/dsh-extra-plan/index.js` + `plugins/dsh-extra-plan/lib/gate-decisions.js` | `index.js` 负责宿主接线与公开转出；两种 ask 结果分别由 `parseAskResultData`/`parseDispatchAskResult` 解码，匹配后统一进入 `applyAskOutcome`，由 `deriveFlowState` 推导 `route→purpose→clarified→approved`。拒绝不清状态、取消清阶段状态；job_kill 仅直行放行、send_message 主会话方向限制、job_list/list_agents 同锚点防轮询。详见 [机制设计](ai-机制设计.md#一四级机械锚点与-gatewords)。 |
| 角色标识与顺序 | `plugins/dsh-extra-plan/lib/role-contract.js`、`lib/agent-runtime.js`、`lib/runtime-lifecycle.js`、`lib/preset-sync.js` | `ROLE_IDS`/`ROLE_ORDERS` 是冻结身份与顺序合同，`PLANNER_PRESET_ID`/`PROBER_PRESET_ID` 从同一数组派生；只描述身份与装配顺序，不承载权限策略。 |
| gateWords | `assets/presets/extra-plan/agent.cordis.yml` + `lib/gate-words.js` | YAML 七键是唯一值源，apply 先整组校验，再注册七个变量；旧词不推进状态。详见 [机制设计](ai-机制设计.md#一四级机械锚点与-gatewords)。 |
| run_code 组判定 | `lib/run-code-static.js` + 根入口 | 成员逐点判定、组拒零副作用；安全静态 literal 子集覆盖对象/数组/尾逗号，动态参数保留 argsText 走运行时瀑布；多调用需独立容错，planner 单实例受预算上限。 |
| save_plan/save_probe | `lib/save-contract.js`、`lib/save-probe-validation.js`、`lib/save-persistence.js`、`lib/save-tool-factories.js` | 合同、校验、单次临时写入/顺序发布与有限清理、工具工厂分层；失败明确报错，由 AI 主动重试，不跨调用恢复旧事务。限制值以源码为准，详见机制设计与 step-06。 |
| planner 预算 | `lib/planner-budget.js` | 按锚点计数，提醒/耗尽后申请继续探查；`exploreBudget` 不等于历史 evidence 数。 |
| 模型路由 | `lib/model-routing.js` | planner 与非 planner 分离；legacy（兼容）/strict（严格）由开关分流，strict 必须完成真实 probe 或已验证父 fallback（回退）。唯一流程细节见 [流程备查](ai-流程备查.md#⑩-规划子代理)。 |
| A/C/M 投影 | `lib/assembly-presentation.js` + 根入口 | 只改模型可见 assembly/schema/catalog，不替代 runtime deny；PTC 首轮手写 `tool:read`，L 段回宿主原文。 |
| P2-2 SDK 文本 | `lib/sdk-text-cache.js` | apply 内 agent-keyed WeakMap；完整 schema/language/renderer 变化失效，同 key 并发合并，失败不缓存；调用计数 1 是硬门槛。详见 [机制设计](ai-机制设计.md#五acm-投影p2-2-与配置默认链)。 |
| 设置后端与同页全局管理 | `lib/settings.js`、`lib/settings-contract.js`、`lib/live-config.js`、`lib/preset-settings.js`、`lib/preset-sync.js`、`lib/client.js` | 10 项 volatile Config 统一由 `dsh-extra-plan-settings` 承载；`SETTING_DEFINITIONS` 消费生成的 `DEFAULT_SETTINGS`，校验规则与 UI metadata 仍由合同手工维护，`createDefaultSettings()` 每次返回新对象。live-config 只暴露 8 项热读，2 项宿主值只派生到内存 definition。`client.js` 的字段常量只在生成标记区块内更新，表单仍仅经 detail.section 渲染于 bundle 详情页行列表之后；PUT 只 edit 唯一全局行，旧公开行/旧 body 仅 raw 读取迁移；非法当前 gateWords 严格失败、零写，旧非法 skip。 |
| P2-4 默认/definition/client 生成链 | `agent.cordis.yml` → `generate-runtime-defaults.mjs` → `preset-defaults.generated.js`、纯 definition 与 `client.js` 标记区块 | YAML 叶值按 sourceLocator 校验并生成完整默认对象；运行时只消费生成物，不解析作者 YAML。默认仓库路径发布 7 个输出（运行时常量、主 definition、4 个角色 definition、client），自定义 source/output 默认关闭 client，只有显式 client 路径才生成；坏模板保留 last-known-good。详见 [维护手册](ai-维护手册.md#p2-4-生成链)。 |
| 预设核对与官方装配 | `lib/preset-sync.js`（由 `settings.js` owner 内部相对调用） | 读取纯 definition；raw patch 中旧 `preset-extra-plan` 与 `extra-plan-preset-sync` 仅非破坏迁移来源；全局行补齐后两项宿主值/gateWords 派生到内存 definition，其中 `toolPresentationMode` 的派生范围含主 definition 与四个角色 definition（各恰一行 `tool-presentation`，派生异常保留生成物默认值且不中断挂载），再由同一 owner 直接交官方 AgentPreset adapter，写盘只经唯一全局行 `configEditor.edit`。四角色 definition/文件顺序跟随 `ROLE_IDS`/`ROLE_ORDERS`，常量只描述身份和装配顺序，不替代工具权限判定；旧公开模块入口与 locale exports 已退役。 |
| session/usage | 根入口 + `lib/agent-runtime.js` + `lib/usage-ledger.js` | 成功的 `assistant/message` usage 写入独立 `ledger-v2.jsonl`，记录 root/自身 session 血缘、精确 role、provider 与四桶；深层断链/循环仍落账且 `rootSessionId` 可为空。archive 按完整九字段身份的累计 `seq` 水位防重放并计 `covered`；disposed 内同步 final fold 后再回收，stale/release 异常可见；writer timeout 静默返回 `delayed`、后续 fold 补记，stale-lock 仅在核实 owner 后显式维护。 |
| 宿主升级 | [ai-宿主耦合台账](ai-宿主耦合台账.md) | 当前 HS/HK/SD/CF/QB、六项 HUMAN 与 SKIP 规则是升级入口；历史快照见[宿主历史归档](ai-宿主耦合历史归档.md)。 |
| 实机验收 | [ai-实机闸门测试流程](ai-实机闸门测试流程.md) | 单文件、一次性、顺序完整；A/U/C/D/S/B 行与矛盾原值不可静默修正。 |

## 维护与回归入口

- 地图：先 grep [ai-代码地图](ai-代码地图.md) 的意图速查，再按真实函数名取机器行号；扫描根内代码改动时冻结前运行普通生成，正式检查阶段只运行 `DSH_INSTALL_ROOT=<本次真实代码根> node --import ./pe-test/_shared/host-preload.mjs pe-test/tools/代码地图生成.mjs --check`。
- 自动回归：按 [ai-维护手册](ai-维护手册.md) 的固定顺序执行领域、生成器、地图及一键命令；AUTO 数量以 `pe-test/tools/一键step测试.mjs` 的数组为准，ETIMEDOUT、SKIP、INCOMPLETE、HUMAN、NOT-RUN 不由退出码0改写为 PASS。
- 生成链与证据：先生成新导出再切换消费者；客户端标记区块禁手改，默认仓库产物为七输出，自定义 source/output 默认不写仓库 client。领域测试的正反夹具只证明隔离行为/受控宿主边界；step-07 必须显式 `--session`+`--sessions-dir`（会话在宿主数据根时加 `--host-root`，取直接 child 加 `--discover-children`）与 `PLANNER_PROMPT_SUFFIX`（空串也算显式存在），`SESSION_ID` 只作报告/输出字段，静态/Mock 结果不能冒充生产实机。AI 在仓库验收通过前不触碰生产环境。

## 历史入口

- [历史故障与机制归档](ai-历史故障与机制归档.md)：旧实现、故障、日期化过程、批次叙事与已退役流程；不作当前运行真源。
- [宿主耦合历史归档](ai-宿主耦合历史归档.md)：旧宿主版本、已删除耦合、历史覆盖快照与 evidence 勾销；不作当前升级状态。

## QQBot 兼容插件边界

`dsh-extra-plan-qqbot`（仓库目录为 `plugins/dsh-extra-plan-qqbot`）分两条路径：授权安装由 `postinstall` 调用 `scripts/heal.mjs --install`，严格校验唯一目标、Web 核心源和最终 realpath 建链；普通启动由 `index.js#apply` 调用 `healQqbotCompatibility` 非阻断兜底，`profileNames` 仅可选缩小已发现自有 profile。兼容 bundle 以 `id: dsh-extra-plan-settings` / `name: dsh-extra-plan/settings` 的 canonical 行激活；核心包独立安装且不分发核心预设。严格入口失败非零、无参兜底仍 exit 0；真实消息、`/preset`、question/approval（提问/批准）、postinstall/allow-build 与生产 profile 仍是用户部署/重启后的 HUMAN，静态和受控 compose 证据不等于真实安装或 QQBot 运行通过。
