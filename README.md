# 按需规划模式介绍

## 1. 一句话概述

**作者从reasonix得到的灵感，实现权限控制+子代理角色分配的agent模板**

**兼容性**：DSH = v0.2.1-rc.1 ~ v0.2.1-rc.4、dsh-qqbot 0.5.2。旧版本兼容详见Releases

## 2. 核心优势

通过设定 主会话、探查者、pro规划、执行者、验收者 五个角色，让DSH工作时按照明确的流程进行分工
  - 主会话：作为与用户直接交互的入口，负责日常沟通、需求接收与任务分派。它是整个工作流的发起者和协调者，确保用户意图被准确传达
  - 探查者：承担后台批量数据探查与线索回传工作。主动运行，将原始信息预处理后再转交主会话，有效避免主会话上下文过载，保持对话轻量与高效
  - pro规划：调用高级模型对用户需求进行深度分析与结构化规划，输出包含实施方案和验收标准的正式文档。为后续执行与验收提供权威依据
  - 执行者：严格按照规划方案进行机械式执行，并在每一步操作中持续对照验收文档，确保过程与预期一致，最大限度降低人为偏差
  - 验收者：严格按照验收方案进行机械式执行，确保最终交付物完全符合既定质量要求

并合并了DSH Agent预设模式中的 PTC模式、创造模式 包含的功能，可以直接在本模式同时体验
  - PTC模式：将多个工具调用合并为一次执行，大幅减少与模型的交互轮次，显著降低了重复传输的冗余开销。手动切换开关
  - 创造模式：创建自定义Agent preset时自动遵守DSH规范。手动切换开关

## 3. 安装及卸载方式（面向 DSH 环境用户）

### 核心安装

1. dsh web - 插件 - 添加插件 - https://github.com/luca3xxvsoo/dsh-extra-plan#path:/plugins/dsh-extra-plan 或 [解压路径]/dsh-extra-plan-main/plugins/dsh-extra-plan - 允许脚本并重试 - 立即启用
2. **重启 DSH 进程**使插件生效
3. 新建会话，在预设列表中选择「按需规划模式」

### qqbot兼容插件安装

1. 安装
```powershell 7+ 在线
dsh plugin --profile qqbot add 'luca3xxvsoo/dsh-extra-plan#path:/plugins/dsh-extra-plan-qqbot' --allow-build='dsh-extra-plan-qqbot@git+https://github.com/luca3xxvsoo/dsh-extra-plan.git'

if ($LASTEXITCODE -eq 0) {
    dsh plugin --profile qqbot rebuild dsh-extra-plan-qqbot
}
```
```powershell 7+ 离线
$pkg = (Resolve-Path '[解压路径]\dsh-extra-plan-main\plugins\dsh-extra-plan-qqbot').Path -replace '\\', '/'

dsh plugin --profile qqbot add "file:///$pkg" --preserve-absolute-paths --allow-build="dsh-extra-plan-qqbot@file:$pkg"

if ($LASTEXITCODE -eq 0) {
    dsh plugin --profile qqbot rebuild dsh-extra-plan-qqbot
}
```
2. **重启 DSH 进程**使插件生效
3. qqbot下使用 /preset 切换预设

### 卸载步骤

1. 核心卸载
```powershell 7+
dsh plugin --profile web remove dsh-extra-plan
```
2. qqbot兼容插件卸载 (如装)
```powershell 7+
dsh plugin --profile qqbot remove dsh-extra-plan-qqbot
```

    手动删除qqbot环境下的文件夹：dsh-extra-plan

4. **重启 DSH 进程**

### 平台实测说明

仅在 **Windows 环境实测正常**，**Linux/macOS 尚未在真实环境验证**

## 4. 可配置项

DSH web界面 -> 插件 -> 按需规划模式配置

**通用设置**：
  - 首轮引导开关：首轮极简工具 + 提示词
  - 创造模式开关：是否开启dsh官方创造模式
  - web_fetch开关：是否开启web_fetch
  - 工具呈现模式：工具呈现方式切换（默认/PTC模式），无法进行会话内切换
  - run_code 容错检查：PTC模式下，增加每个工具调用需要try catch的闸门。通过限制+建议的模式保障仅单个调用报错

**pro规划**：
  - 跨提供方：允许跨提供方选择模型。开启时将以 其他提供方 - 主会话提供方 - deepseek官方 的顺序，获取可用模型。关闭时仅从主会话提供方获取。默认关闭
  - pro规划 | 使用模型：pro规划默认使用模型。未匹配/置空时：使用主会话模型
  - pro规划 | 额外引导：在主会话发送给pro规划的任务结尾，拼接上的内容。可能能增加pro规划的智商（未验证）。可置空
  - pro规划 | 探查额度：允许pro规划调用工具的次数，避免后台无限制调用。同时限制一次runcode内可调用的工具上限数
  - 其他子代理 | 使用模型：其他子代理默认使用模型。未匹配/置空时：使用主会话模型

## 5. 仓库结构

```
dsh-extra-plan/
├── plugins/              
│   ├── dsh-extra-plan/                                               # 模式核心插件（四级闸门/探查上限/save_plan 等）
│   │   ├── assets/presets/extra-plan/                                 
│   │   │   ├── agent.cordis.yml                                      # 预设主配置（persona/工具/插件行/delegation）
│   │   │   ├── preset-definition.generated.yml                       # 纯预设 definition 生成资产
│   │   │   ├── preset-definition-extra-plan-executor.generated.yml   # 执行者角色预设 definition（生成物）
│   │   │   ├── preset-definition-extra-plan-planner.generated.yml    # 规划者角色预设 definition（生成物）
│   │   │   ├── preset-definition-extra-plan-reviewer.generated.yml   # 验收者角色预设 definition（生成物）
│   │   │   ├── preset-definition-extra-plan-prober.generated.yml     # 探查者角色预设 definition（生成物）
│   │   │   └── preset.yml                                            # 预设元信息（GUI 显示名称与描述）
│   │   ├── lib/                                                      # 模块目录
│   │   │   ├── agent-runtime.js                                      # 角色运行态：createAgentRuntime 的 per-apply 判定与缓存
│   │   │   ├── agent-session.js                                      # 角色判定：sessionEvents/isSubagentChild 唯一来源
│   │   │   ├── assembly-presentation.js                              # 展示投影：A/C/M 投影与 skill catalog
│   │   │   ├── client-carrier.js                                     # 配置组件内部 Client 载体，不形成公开组件
│   │   │   ├── client.js                                             # 设置页前端 UI
│   │   │   ├── gate-decisions.js                                     # 闸门纯决策：路由/目的/澄清/批准与只读判定
│   │   │   ├── gate-words.js                                         # 闸门词契约：字段规格/整组校验/运行时派生
│   │   │   ├── live-config.js                                        # 热修改支持模块
│   │   │   ├── model-routing.js                                      # 子代理模型选择：planner/非 planner 路由解析
│   │   │   ├── path-policy.js                                        # 路径安全策略闸门
│   │   │   ├── planner-budget.js                                     # 探查预算：用量计数与提醒/耗尽文案
│   │   │   ├── preset-defaults.generated.js                          # 构建期生成：exploreBudget 默认值
│   │   │   ├── preset-settings.js                                    # 设置项 descriptor 与 YAML 处理 facade（供迁移复用）
│   │   │   ├── preset-sync.js                                        # settings owner 内部同步/adapter 与 raw 旧值迁移
│   │   │   ├── preset-yaml.js                                        # 预设 YAML 解析、定位与保格式改写纯模块
│   │   │   ├── qqbot-settings-sync.js                                # QQBot 设置同步：Web→QQBot 持久化与回执
│   │   │   ├── role-contract.js                                      # 角色身份常量表
│   │   │   ├── run-code-scanner.js                                   # run_code 无宿主状态词法与调用点扫描
│   │   │   ├── run-code-static.js                                    # run_code：静态解析与理由函数
│   │   │   ├── runtime-lifecycle.js                                  # session 生命周期与计数状态工厂
│   │   │   ├── runtime-static.js                                     # 静态纯函数：显式参数 helper
│   │   │   ├── save-contract.js                                      # save_plan/save_probe：合同常量与 Markdown 渲染
│   │   │   ├── save-persistence.js                                   # save_plan/save_probe：原子落盘内核与 journal 自愈
│   │   │   ├── save-plan-validation.js                               # save_plan：文档解析校验
│   │   │   ├── save-probe-validation.js                              # save_probe：参数与路径/range/evidence 校验
│   │   │   ├── save-tool-factories.js                                # save_plan/save_probe：工具定义
│   │   │   ├── sdk-text-cache.js                                     # tools:sdk缓存复用
│   │   │   ├── settings-contract.js                                  # 设置项单一合同：键、默认值、校验与元数据
│   │   │   ├── settings.js                                           # 设置页宿主端
│   │   │   ├── shell-mutation.js                                     # 写操作判定：跨平台命令解码与写形态
│   │   │   └── usage-ledger.js                                       # usage 账本与 cursor 增量折叠
│   │   ├── locale/                                     
│   │   │   ├── settings/  
│   │   │   │   ├── en.json                     
│   │   │   │   └── zh.json                                  
│   │   │   ├── en.json                      
│   │   │   └── zh.json                        
│   │   ├── scripts/generate-runtime-defaults.mjs                     # 构建期生成器：exploreBudget 叶值 → preset-defaults.generated.js
│   │   ├── cordis.patch.yml                                                    
│   │   ├── index.js                                                  # 四级闸门：路由/目的/澄清/批准 + apply 接线
│   │   └── package.json              
│   └── dsh-extra-plan-qqbot/                                
│       ├── lib                                               
│   │   │   ├── heal.js                                               # 探查预算：用量计数与提醒/耗尽文案
│   │   │   └── path-policy.js                                        # 路径安全策略闸门
│       ├── scripts/heal.mjs                                          # 自愈分发                      
│       ├── cordis.patch.yml                                  
│       ├── index.js                                    
│       └── package.json                      
├── pe-test/                                                          # 自检/取证工具
│   ├── README.md                                                     # 自检/取证工具介绍
│   ├── _shared/                                                      
│   │   ├── host-deps.mjs             
│   │   ├── host-preload.mjs       
│   │   ├── preset-hash.mjs                    
│   │   ├── session-finder.mjs                   
│   │   ├── test-output.mjs                
│   │   ├── v4-tool-result.mjs              
│   │   ├── workspace-paths.mjs              
│   │   └── zstd-frames.mjs                
│   ├── docs/                                                         # AI文档
│   │   ├── ai-概览.md                
│   │   ├── ai-机制设计.md                
│   │   ├── ai-流程备查.md                
│   │   ├── ai-维护手册.md                
│   │   ├── ai-实机闸门测试流程.md               
│   │   ├── ai-宿主耦合台账.md               
│   │   ├── ai-宿主耦合历史归档.md               
│   │   ├── ai-历史故障与机制归档.md               
│   │   └── ai-代码地图.md                       
│   └── tools/                                                        # 测试工具
│       ├── 一键step测试.mjs                                           # 可以通过输入真实session_id进行测试
│       ├── 生成-no-remount证据.mjs
│       ├── step-00-跨平台写拦截.mjs
│       ├── step-00-全流程回归.mjs
│       ├── step-00-路径边界.mjs
│       ├── step-01-安装同步.mjs
│       ├── step-01-设置迁移.mjs
│       ├── step-01-设置页配置.mjs
│       ├── step-01-预设完整性.mjs
│       ├── step-01-qqbot-单命令安装.mjs
│       ├── step-01-qqbot-安装映射.mjs
│       ├── step-01-qqbot-环境验证.mjs
│       ├── step-04-工具清单查看.mjs
│       ├── step-04-context-gate宿主回归.mjs
│       ├── step-04-路由与写闸门.mjs
│       ├── step-05-会话解码.mjs
│       ├── step-05-角色预设宿主回归.mjs                 
│       ├── step-06-08-v4取证回归.mjs
│       ├── step-06-线索落盘.mjs
│       ├── step-06-真实会话查看.mjs
│       ├── step-07-子代理模型与引导取证.mjs
│       ├── step-08-方案配对查看.mjs
│       ├── step-99-用量统计.mjs
│       ├── 代码地图生成.mjs    
│       ├── 清理desktop旧settings行.mjs                       
│       └── readme.md
├── README.md                                                          # 本文档
├── READAI.md                                                          # AI 入口导航（分层）
└── LICENSE                                                            # MIT 许可
```

## 6. 许可

本项目基于 **MIT License** 发布
