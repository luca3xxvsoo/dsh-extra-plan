# 核心机制与设计意图（AI 改前必读）

> 改闸门/预算/落盘/工具裁剪等核心逻辑前必读；机制「为什么」的详版注释在各源码内，此处只给结论与指向。
> 教训索引：复踩坑前先看下表；细节读指向注释。

## 一、三级机械锚点（路由/澄清/批准）
- 是什么：不是「问三次」，而是「状态机 + 选项验词」——deriveFlowState 从事件流推导 { route, clarified, approved, channelBroken }，mainGateReason 按状态逐工具判定，非标选项被拒。
- 为什么：用户要求「每一步动手前由用户确认」，机械强制不依赖 AI 自觉。
- 动它：改状态机/判定/拒绝文案。

## 二、run_code 组判定
- 是什么：run_code 能一次做多件事，是绕开「单工具闸门」的后门。静态拆解 code 为工具成员组（decomposeRunCode：扫描 tools.xxx 调用 + 裸写扫描），逐成员走与直呼完全相同的判定，聚合拒绝。
- 边界：动态访问（tools[var]）、参数不可解析、嵌套超深 → 不产生成员，运行时瀑布兜底（安全方向放行）。

## 三、探查预算（规划子代理）
- 是什么：机械上限（默认 18 次工具调用）。开局告知 + 剩 3 次提醒 + 耗尽拒绝并注入数字指令；预算自最近一条主会话消息起计，每条转达消息 = 重置 = 授权继续。
- 为什么：规划子代理只读但可能无限探索（"越探越远/想太久"），机械预算强制收敛。

## 四、save_plan 双写 + journal 自愈
- 是什么：方案+验收两文件程序定死双写（两个 payload 必填），原子提交（tmp→journal→rename→清 journal），崩溃后下次 save_plan 自愈补完（新旧 journal 形状兼容）。
- 为什么：方案/验收必须成对出现；崩溃不产生半成品。

## 五、子代理工具裁剪
- 是什么：agent.cordis.yml 各 tool-subagent-* 行的 toolFilter.deny 清单 + lib/executor-spawn.js 薄代理（覆盖引擎内部调用的 workflow/ralph worker）。
- 为什么：防委派递归（执行者不得再委派）、执行者/验收者只读；save_plan 只注册于规划子代理层（scoped），其余代理不可见、无需 deny。

## 六、模型/力度继承
- 是什么：子代理模型/reasoningEffort 继承父会话；plannerModel（设置页显式配置）优先于父会话当前模型；resolvePlannerEntry 单点解析+缓存。
- 为什么：规划用高质量模型可配置；后台规划时父会话空闲，解析不得依赖「父会话进行中请求头」或模型目录 advisory 命中（2026-09-03 修复）。

## 历史教训索引（细节读指向注释）
| 编号 | 坑 | 指向 |
|:--|:--|:--|
| R2 | deny 只列本预设实际注册的工具名——列了未注册的会 tools.restrict 抛错、子代理无法创建 | agent.cordis.yml 文件头注释 + tool-subagent 行注释 |
| R1 | 静态黑名单不覆盖动态 require/Function 构造/编码拼串（不产生成员→组判定放行→运行时瀑布兜底） | index.js decomposeRunCode 附近注释 |
| E8 | workflow/ralph worker 由引擎内部调用不携带 toolFilter，预设 tool-subagent 行裁剪对其不生效；经 executor-spawn 薄代理注入 deny | lib/executor-spawn.js 文件头注释 |
| v2→v4 | run_code 裸写扫描必须屏蔽已提取工具调用区间后再扫，防「工具参数字符串被误判为裸写」 | index.js decomposeRunCode 尾部注释 |
| 模型目录 | plannerModel 解析不得依赖 llm 模型目录命中（目录是 advisory：未列出 id 仍原样传递）；旧逻辑父会话空闲时 provider 空导致 plannerModel 永不生效 | index.js resolvePlannerEntry 注释 |
| 启动预锁 | 不引入启动预锁（启动即重活拖慢会话启动，快通道教训） | index.js 头部注释（约 L74） |

---

*机制「为什么」的详版以此表指向的源码注释为准；本文件仅索引层。*