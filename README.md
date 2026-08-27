# 按需规划模式介绍

> 本文档介绍「按需规划模式」（预设 extra-plan）的机制与用法

## 0. 一句话概述

**作者从reasonix得到的灵感，vibe coding出实现主动可控进行pro规划的agent模板**（适合控制欲强的用户）

**按需规划模式（extra-plan）**：会话未经用户同意时，模型仅可调用只读工具探查。且可调用pro规划子代理，使用高质量模型生成规划验收方案。

## 1. 安装及卸载方式（面向 DSH 环境用户）

> 前置条件：已安装 DeepSeek Harness（DSH）。默认 DSH_HOME = `~/.dsh`（可被环境变量 `DSH_HOME` 覆盖）。Win环境默认 DSH_HOME = `%USERPROFILE%\.dsh`

### 安装步骤

0. 安装 git/minigit (已安装可忽略)
```powershell 7+
winget install --id Git.MinGit --exact --source winget
```
1. 核心安装(必装)
```powershell 7+
dsh plugin --profile web add 'luca3xxvsoo/dsh-extra-plan#path:/plugins/dsh-extra-plan' --allow-build='@local/dsh-extra-plan@git+https://github.com/luca3xxvsoo/dsh-extra-plan.git'
```
2. qqbot兼容插件安装 (选装)
```powershell 7+
dsh plugin --profile qqbot add 'luca3xxvsoo/dsh-extra-plan#path:/plugins/dsh-extra-plan' 'luca3xxvsoo/dsh-extra-plan#path:/plugins/dsh-qqbot-user-questions' --allow-build='@local/dsh-extra-plan@git+https://github.com/luca3xxvsoo/dsh-extra-plan.git,@local/dsh-qqbot-user-questions@git+https://github.com/luca3xxvsoo/dsh-extra-plan.git'
```
3. **重启 DSH 进程**使插件生效
4. 新建会话，在预设列表中选择「按需规划模式」即可使用

### 可选模块：dsh-qqbot-user-questions

**模块背景**：dsh-qqbot（腾讯官方 QQ Bot IM 插件）在默认配置下不挂任何 agent 预设；而 extra-plan 的核心交互（路由确认 / 澄清 / 批准三阶段问话）依赖 `ask_user_question` 的 UI 应答者，QQbot 无此 UI，直接挂载会导致问答无法完成。本可选插件为 qqbot 提供**文字列表**发到 QQ、等待用户回复，让 extra-plan 在 QQbot 上保持完整的三阶段问答与闸门语义。并且可以用命令 /优先对话 ，在AI连续调用工具的长任务的场景对指定对话进行边界插入

**优先对话触发模式**：
  - /优先对话：将队列中第一个对话进行边界插入
  - /优先对话 对话内容：将对话内容进行边界插入

**前提说明**：本模块涉及对 dsh-qqbot 源码的最小改动，需使用者自行评估

### 卸载步骤

1. 核心卸载
```powershell 7+
dsh plugin --profile web remove @local/dsh-extra-plan @local/dsh-extra-plan-settings @local/dsh-executor-spawn @local/dsh-flash-guide
```
2. 手动删除DSH_HOME/.agent-presets/extra-plan/
3. qqbot兼容插件卸载 (如装)
```powershell 7+
dsh plugin --profile qqbot remove @local/dsh-extra-plan @local/dsh-extra-plan-settings @local/dsh-executor-spawn @local/dsh-flash-guide @local/dsh-qqbot-user-questions
```
4. qqbot兼容插件替换文件还原 (如装)
```
DSH_HOME/profiles/qqbot/node_modules/@tencent-connect/dsh-qqbot/dist/gateway/bootstrap.js.orig -> bootstrap.js
DSH_HOME/profiles/qqbot/node_modules/@tencent-connect/dsh-qqbot/dist/transport/outbound.js.orig -> outbound.js
```
5. **重启 DSH 进程**

### 平台实测说明

跨平台兼容改造的**逻辑层**已由 `test-cross-platform.mjs` 验证（本仓库 Windows 环境实测 68 用例全过，脚本三平台通用）；但**完整运行时**（DSH 实际加载本预设 + 真实 bash/pwsh 行为）目前仅在 **Windows 环境实测正常**，**Linux/macOS 尚未在真实环境验证**。建议部署到 Linux/macOS 前用 GitHub Actions 三平台矩阵或 WSL2 补充实测；如发现兼容问题，欢迎反馈

## 2. 可配置项
DSH web界面 -> 设置 -> 插件 -> EXTRA PLAN

**pro规划**：
  - 使用模型：未匹配/置空时：使用主会话模型
  - 额外引导：在主会话发送给pro规划的任务结尾，拼接上的内容。可能能增加pro规划的智商（未验证）。可置空
  - 探查额度：默认18轮
  - anchored开关：是否开启dsh-anchored-standard同款引导

**qqbot兼容插件**：越权申请开关。仅在qqbot进程运行时显示

## 3. 仓库结构

```
dsh-extra-plan/
├── plugins/              
│   ├── dsh-extra-plan/                                 # 模式核心插件（三级闸门/探查上限/save_plan 等）
│   │   ├── assets/presets/extra-plan/                  # 自动分发 .agent-presets 内容   
│   │   │   ├── agent.cordis.yml                        # 预设主配置（persona/工具/插件行/delegation）
│   │   │   ├── preset.yml                              # 预设元信息（GUI 显示名称与描述）
│   │   │   └── dist-manifest.json                                
│   │   ├── scripts/distribute-preset.mjs               # 自动分发 .agent-presets 脚本
│   │   ├── cordis.patch.yml                                      
│   │   ├── index.js                                    
│   │   └── package.json                            
│   ├── dsh-extra-plan-settings/                        # dsh web界面配置插件
│   │   ├── index.js              
│   │   ├── package.json              
│   │   └── lib/client.js              
│   ├── dsh-executor-spawn/                             # 执行者委托层（workflow/ralph worker 注入）
│   │   ├── index.js              
│   │   └── package.json              
│   ├── dsh-flash-guide/                                # flash 模型近场引导
│   │   ├── index.js
│   │   └── package.json
│   └── dsh-qqbot-user-questions/                       # 可选模块：QQbot 上保留 extra-plan 完整问答
│       ├── patches/@tencent-connect-dsh-qqbot/dist/    # 自动分发 qqbot插件修改 内容
│       │   ├── gateway/bootstrap.js                    # 修改好的文件 最小必须注入：ctx.provide
│       │   └── transport/outbound.js                   # 修改好的文件 放行新增的工具show_file：用该工具调用方案/验收.md节约token
│       ├── scripts/apply-patch.mjs                     # 自动分发 qqbot插件修改 脚本
│       ├── cordis.patch.yml                        
│       ├── index.js                      
│       └── package.json        
├── pe-test/tools/                        # 自检/取证工具
│   ├── validate-extra-plan-preset.mjs    # 预设静态校验（YAML 语法 + deny 清单存在性）
│   ├── validate-save-probe-gate.mjs      # save_probe 注册层 + 硬闸门五态 + planner 预算回归验证
│   ├── validate-reviewer-pwsh-guard.mjs  # reviewer pwsh 写动词拦截验证
│   ├── smoke-forensics-extra-plan.mjs    # extra-plan 冒烟会话取证
│   ├── saveplan-forensics.mjs            # save_plan call/result 配对取证
│   ├── ledger-summary.mjs                # usage 账本聚合（P3 A/B 读数）
│   ├── print-header-tools.mjs            # 打印会话 request/header 的 tools 列表
│   ├── test-extra-plan-gate.mjs          # 闸门机制测试（node 直接运行）
│   ├── test-cross-platform.mjs           # 跨平台只读防线测试（bash/pwsh 写命令拦截，三平台通用）
│   ├── decode-session.mjs                # 解码单个会话日志（事件统计/plan/mode 摘要）
│   └── readme.md
├── 按需规划模式测试方案.md                 # 内部测试方案文档
├── README.md                             # 本文档（模式介绍 + 安装方式）
└── LICENSE                               # MIT 许可
```

## 4. 完整流程

① 用户以按需规划模式进入

② anchored 引导（可选）：极简提示词 + 清空运行时上下文 + 仅 shell/read 工具；模型完成首个工具调用后自动恢复全量 persona 与完整工具目录

③ 用户提出需求

④ **路由确认（每次动手前必问，硬闸门）**：
   - 「直接执行」
   - 「进行pro规划」
   - 「不同意」

⑤ **澄清意图**：ask_user_question 提最关键的 1~3 个问题、给出候选选项

⑥ **探查线索落盘（save_probe）**：
  - 主会话把本轮只读探查留下的「线索地图」经专用工具 save_probe 落盘为 `.extra-plan\` 下**单个文件** `线索-<任务名>-<时间戳>.md`
  - 只含四类**定位线索**：文件地图（fileMap）/ 重点区域（focusAreas）/ 排除项（exclusions）/ 背景与意图（background），**不含证据**（行号/数值/文案摘录）

⑦ 启用 pro 规划子代理（subagent_plan 工具）：
   - **探查硬上限**：规划子代理只读探查有机械预算（默认 18 次工具调用，成功上限 = 预算值）；**每轮开局告知预算**：初始任务/续轮转达消息末尾自动拼接「本轮探查预算上限为 {预算值} 次工具调用」（拼在附加指令之前，附加指令留空也生效）；**剩 3 次提醒收尾**：剩余次数 ≤3 时注入一次「本轮探查预算还剩 {剩余数} 次」提示（每轮只注入一次；预算值 ≤3 时不注入）；**预算耗尽** → 拒绝后续工具调用并注入带数字指令「探查预算已耗尽（本轮已用 {已成功次数}/{预算值}）：…」，硬性止住"越探越远/想太久"。预算自最近一条主会话发往规划子代理的消息起计，**每条主会话转达消息（你的意见/疑问答复）= 一次预算重置 = 授权继续探查**
   - 产出：**规划方案 + 验收标准清单**
   - **方案落盘（save_plan 专用工具）**：规划子代理把产出经专用工具 save_plan 写入工作区固定目录 `.extra-plan\`，**双文件**：`方案-<任务名>-<yyyyMMddHHmmss>.md`（规划方案 + 待确认假设清单）与 `验收-<任务名>-<yyyyMMddHHmmss>.md`（验收标准清单，每条带对应任务编号）。**程序定死双写**（两个 payload 必填 + 原子写入、崩溃自愈），保证两个文件要么都写成、要么都不写。该工具只出现在规划子代理的工具目录——规划子代理 = 只读 + 仅可落盘。落盘成功后在输出中给出两个文件路径
   - **疑问往返通道**：规划中遇到阻塞性关键疑问 → 子代理暂停当轮、把疑问作为当轮输出；主会话**原样**向用户展示问题 → 用户答复 → 主会话**原样** send_message 回同一子代理继续规划（可多轮，直到产出终案）。主会话只转发、不代答、不改写
   - 用户可随时中断：说「取消规划」或改选直行 → 主会话 interrupt_agent 停止子代理当前轮次（interrupt 仅停轮、不销毁会话，子代理仍存续、可随时唤醒），回到 ④ 重新路由确认后再动手

⑧ 计划回传 → 主会话读取方案文件并 ask 确认下一步操作：「同意执行」「转交pro规划」「不同意」
   - 「同意执行」
   - 「转交pro规划」
   - 「不同意」

⑨ 执行（方案批准后）：
   - 创建执行子代理进行执行
   - 读取「方案」+「验收」文件，执行过程中同时验证是否执行正确

⑩ 验收：
   - 创建验收子代理进行验收
   - 只读「验收」文件（按路径读取、以文件内容为准）逐条核对——「通过」采纳并汇总；「不通过」把问题清单修正进执行委派重派（最多 2 轮）；两轮仍不通过 → 收集两轮不通过原因、原样返回

## 5. 许可

本项目基于 **MIT License** 发布
