# extra-plan 模式涉及文件路径清单

> 按类别列出 extra-plan涉及的全部文件/目录路径，每个文件一行。主机用户名：<用户名>；DSH_HOME = `~/.dsh`；DSH_HOME = `%USERPROFILE%\.dsh`

## 一、预设配置

~/.dsh\.agent-presets\extra-plan\preset.yml —— 预设元信息：name「按需规划模式」+ description（vibe coding 定位），GUI 预设列表与新建会话选择时显示

~/.dsh\.agent-presets\extra-plan\agent.cordis.yml —— 预设主配置（AGENT-PLANE 组合）：主会话 persona（路由/规划/批准/验收工作方式 + 语言约定）、工具行（shell/fs/jobs/skills/ask/todo/web）、extra-plan 插件行（config：anchoredBootstrap、bootstrapPersona、bootstrapShellTools/CommonTools、plannerModel、planTool、exploreBudget:18、savePlanDir、plannerPromptSuffix、usageLedger）、delegation 组（tool-subagent 执行者 / tool-subagent-plan 规划子代理 / tool-subagent-review 验收复核者 / executor-spawn / workflow-worker-thread / tool-workflow / tool-ralph）、compaction 组

## 二、本地插件

### 必选

~/.dsh\profiles\web\node_modules\@local\dsh-extra-plan\index.js —— 模式核心插件：三级机械闸门（路由/澄清/批准 + 选项验词 + 通道逃生）、规划子代理探查硬上限（exploreBudget）与只读防线（write/edit + pwsh 写动词）、save_plan 专用工具（原子双写落盘 .extra-plan）、save_probe 探查线索落盘（仅主会话层注册）、plannerPromptSuffix 机械拼接、anchored 引导（主会话 + 规划子代理）、力度继承（reasoningEffort）、子代理沙箱下限、usage 账本折叠、请求失败诊断

~/.dsh\profiles\web\node_modules\@local\dsh-extra-plan\package.json —— 插件包元信息：name/version 0.1.5/type:module/main/exports 指向 index.js

~/.dsh\profiles\web\node_modules\@local\dsh-executor-spawn\index.js —— executor-spawn 薄委托层：包装宿主 spawn provider，给 workflow/ralph worker 注入执行者 deny 清单（防递归/防再规划）与默认模型 deepseek-v4-flash（防 pro 泄漏）；注册 provider 名 extra-executor-spawn（agent.cordis.yml 中 workflow/ralph 行引用）

~/.dsh\profiles\web\node_modules\@local\dsh-executor-spawn\package.json —— 插件包元信息：name/version 0.1.0/type:module/main/exports 指向 index.js

### 可选

~/.dsh\profiles\web\node_modules\@local\dsh-flash-guide\index.js —— 可选模块：flash 模型近场引导插件：对 flash 主会话与 flash 执行者子代理，在每条真实用户消息后经 agent/pre-step 通道注入固定引导文本（简单任务=快速收敛版 / 复杂任务=深度决策版，带 flash 回顾/反跑题锚）；pro 规划子代理（非 flash 模型）自动排除、reviewer 跳过；零工具注册、不写会话事件

~/.dsh\profiles\web\node_modules\@local\dsh-flash-guide\package.json —— 插件包元信息：name/version 0.1.0/type:module/main/exports 指向 index.js，license MIT

~/.dsh\profiles\web\node_modules\@local\dsh-qqbot-user-questions\index.js —— 可选模块：dsh-qqbot兼容插件：dsh-qqbot（腾讯官方 QQ Bot IM 插件）在默认配置下不挂任何 agent 预设；而 extra-plan 的核心交互（路由确认 / 澄清 / 批准三阶段问话）依赖 `ask_user_question` 的 UI 应答者，QQbot 无此 UI，直接挂载会导致问答无法完成。本可选插件为 qqbot 提供 `userQuestions` provider，把 `ask_user_question` 的问题以**文字列表**发到 QQ、等待用户回复，让 extra-plan 在 QQbot 上保持完整的三阶段问答与闸门语义

~/.dsh\profiles\web\node_modules\@local\dsh-qqbot-user-questions\package.json —— 插件包元信息：name/version 0.1.0/type:module/main/exports 指向 index.js，license MIT

