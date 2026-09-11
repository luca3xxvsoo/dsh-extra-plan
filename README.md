# 按需规划模式介绍

## 1. 一句话概述

**作者从reasonix得到的灵感，vibe coding出实现主动可控进行pro规划的agent模板**（适合控制欲强的用户）

**按需规划模式（extra-plan）**：会话未经用户同意时，模型仅可调用只读工具探查。且可调用pro规划子代理，使用高质量模型生成规划验收方案。

**兼容性**：DSH v0.1.2-rc.1(0.1.1不支持)、qqbot 0.5.0 版

## 2. 核心优势

通过设定 主会话、探查者、pro规划、执行者、验收者 五个角色，让DSH工作时按照明确的流程进行分工
  - 主会话：作为与用户直接交互的入口，负责日常沟通、需求接收与任务分派。它是整个工作流的发起者和协调者，确保用户意图被准确传达
  - 探查者：承担后台批量数据探查与线索回传工作。主动运行，将原始信息预处理后再转交主会话，有效避免主会话上下文过载，保持对话轻量与高效
  - pro规划：调用高级模型对用户需求进行深度分析与结构化规划，输出包含实施方案和验收标准的正式文档。为后续执行与验收提供权威依据
  - 执行者：严格按照规划方案进行机械式执行，并在每一步操作中持续对照验收文档，确保过程与预期一致，最大限度降低人为偏差
  - 验收者：以机械式、标准化方式执行验收流程，对照规划文档逐项核验执行结果，确保最终交付物完全符合既定质量要求

并合并了DSH Agent预设模式中的 PTC模式、创造模式 包含的功能，可以直接在本模式同时体验
  - PTC模式：将多个工具调用合并为一次执行，大幅减少与模型的交互轮次，显著降低了重复传输的冗余开销。手动切换开关
  - 创造模式：创建自定义Agent preset时自动遵守DSH规范

## 3. 安装及卸载方式（面向 DSH 环境用户）

> 前置条件：已安装 DeepSeek Harness（DSH）。默认 DSH_HOME = `~/.dsh`（可被环境变量 `DSH_HOME` 覆盖）。Win环境默认 DSH_HOME = `%USERPROFILE%\.dsh`

### 安装步骤

0. 安装 git/minigit (已安装可忽略)
```powershell 7+
winget install --id Git.MinGit --exact --source winget
```
1. 核心安装(必装)
```powershell 7+
dsh plugin --profile web add 'luca3xxvsoo/dsh-extra-plan#dsh-v0.1.2rc-qqbot-v0.5.0-only&path:/plugins/dsh-extra-plan' --allow-build='@local/dsh-extra-plan@git+https://github.com/luca3xxvsoo/dsh-extra-plan.git'
```
2. qqbot兼容插件安装 (选装,remove命令报错可忽略)
```powershell 7+ 
dsh plugin --profile qqbot remove @local/dsh-extra-plan
dsh plugin --profile qqbot remove @local/dsh-qqbot-user-questions
dsh plugin --profile qqbot add 'luca3xxvsoo/dsh-extra-plan#dsh-v0.1.2rc-qqbot-v0.5.0-only&path:/plugins/dsh-qqbot-user-questions' --allow-build='@local/dsh-qqbot-user-questions@git+https://github.com/luca3xxvsoo/dsh-extra-plan.git'
```
3. **重启 DSH 进程**使插件生效
4. 新建会话，在预设列表中选择「按需规划模式」即可使用
5. qqbot下使用 /preset 切换预设

### 卸载步骤

1. 核心卸载
```powershell 7+
dsh plugin --profile web remove @local/dsh-extra-plan
```
2. 手动删除DSH_HOME/.agent-presets/extra-plan/
3. qqbot兼容插件卸载 (如装)
```powershell 7+
dsh plugin --profile qqbot remove @local/dsh-qqbot-user-questions
```
4. **重启 DSH 进程**

### 平台实测说明

跨平台兼容改造的**逻辑层**已由 `pe-test/tools/step-00-跨平台写拦截.mjs` 验证（本仓库 Windows 环境实测 68 用例全过，脚本三平台通用）；但**完整运行时**（DSH 实际加载本预设 + 真实 bash/pwsh 行为）目前仅在 **Windows 环境实测正常**，**Linux/macOS 尚未在真实环境验证**。建议部署到 Linux/macOS 前用 GitHub Actions 三平台矩阵或 WSL2 补充实测

## 4. 可配置项

DSH web界面 -> 设置 -> 插件 -> 插件配置 -> 按需规划模式配置

**pro规划**：
  - 使用模型：pro规划默认使用模型。未匹配/置空时：使用主会话模型
  - 额外引导：在主会话发送给pro规划的任务结尾，拼接上的内容。可能能增加pro规划的智商（未验证）。可置空
  - 探查额度：允许pro规划调用工具的次数，避免后台无限制调用
  - anchored开关：首轮极简工具 + 提示词
  - web_fetch开关：是否开启web_fetch。
  - 工具呈现模式：工具呈现方式切换（默认/混合/纯PTC模式）
  - run_code 容错检查：PTC模式下，增加每个工具调用需要try catch的闸门。通过限制+建议的模式保障仅单个调用报错

## 5. 仓库结构

```
dsh-extra-plan/
├── plugins/              
│   ├── dsh-extra-plan/                                 # 模式核心插件（三级闸门/探查上限/save_plan 等）
│   │   ├── assets/presets/extra-plan/                  # 自动分发 .agent-presets 内容   
│   │   │   ├── agent.cordis.yml                        # 预设主配置（persona/工具/插件行/delegation）
│   │   │   ├── preset.yml                              # 预设元信息（GUI 显示名称与描述）
│   │   │   └── dist-manifest.json                                
│   │   ├── lib/                                        # 设置界面
│   │   │   ├── client.js                               # dsh web界面配置插件
│   │   │   ├── settings.js                             # dsh web界面配置插件
│   │   │   ├── preset-settings.js                      # 同步旧版本用户设置
│   │   │   ├── preset-sync.js                          # 自愈插件
│   │   │   └── executor-spawn.js                       # 执行者委托层（workflow/ralph worker 注入）
│   │   ├── scripts/distribute-preset.mjs               # 自动分发 .agent-presets 脚本
│   │   ├── cordis.patch.yml                                      
│   │   ├── index.js                                    
│   │   └── package.json
│   └── dsh-qqbot-user-questions/                  
│       ├── lib/heal.js                                 # 自愈函数
│       ├── scripts/heal.mjs                            # 自愈分发                      
│       ├── cordis.patch.yml                    
│       ├── index.js                      
│       └── package.json        
├── pe-test/                                            # 自检/取证工具
│   ├── README.md/                                      # 自检/取证工具介绍
│   ├── _shared/                                        
│   │   ├── zstd-frames.mjs  
│   │   ├── session-finder.mjs  
│   │   └── preset-hash.mjs      
│   │── docs/                                           # AI文档
│   │   ├── ai-概览.md  
│   │   ├── ai-机制设计.md  
│   │   ├── ai-流程备查.md  
│   │   ├── ai-维护手册.md  
│   │   └── ai-代码地图.md         
│   └── tools/                                          # 测试工具
│       ├── 一键step测试.mjs                             # 可以通过输入真实session_id进行测试
│       ├── step-00-跨平台写拦截.mjs
│       ├── step-00-全流程回归.mjs
│       ├── step-01-安装分发.mjs
│       ├── step-01-安装同步.mjs
│       ├── step-01-设置迁移.mjs
│       ├── step-01-设置页配置.mjs
│       ├── step-01-预设完整性.mjs
│       ├── step-01-qqbot-安装映射.mjs
│       ├── step-04-工具清单查看.mjs
│       ├── step-04-路由与写闸门.mjs
│       ├── step-05-会话解码.mjs
│       ├── step-06-线索落盘.mjs
│       ├── step-06-真实会话查看.mjs
│       ├── step-08-方案配对查看.mjs
│       ├── step-99-用量统计.mjs
│       ├── 代码地图生成.mjs                           
│       └── readme.md
├── README.md                                            # 本文档
├── READAI.md                                            # AI 入口导航（分层）
└── LICENSE                                              # MIT 许可
```

## 6. 许可

本项目基于 **MIT License** 发布
