# extra-plan 模式涉及文件路径清单

> 生成时间：2026-08-15。按类别列出 extra-plan（按需规划模式）涉及的全部文件/目录路径，每个文件一行。主机用户名：<用户名>；DSH_HOME = `%USERPROFILE%\.dsh`（复制粘贴到资源管理器地址栏/CMD 回车即可访问；若自定义了 DSH_HOME 环境变量，用 `%DSH_HOME%` 替换路径前缀即可）。

## 一、预设配置（用户已知，`%USERPROFILE%\.dsh\.agent-presets\extra-plan` 下）

%USERPROFILE%\.dsh\.agent-presets\extra-plan\preset.yml —— 预设元信息：name「按需规划模式」+ description（vibe coding 定位），GUI 预设列表与新建会话选择时显示
%USERPROFILE%\.dsh\.agent-presets\extra-plan\agent.cordis.yml —— 预设主配置（AGENT-PLANE 组合）：主会话 persona（路由/规划/批准/验收工作方式 + 语言约定）、工具行（shell/fs/jobs/skills/ask/todo/web）、extra-plan 插件行（config：anchoredBootstrap、bootstrapPersona、bootstrapShellTools/CommonTools、plannerModel、planTool、exploreBudget:18、savePlanDir、plannerPromptSuffix、usageLedger）、delegation 组（tool-subagent 执行者 / tool-subagent-plan 规划子代理 / tool-subagent-review 验收复核者 / executor-spawn / workflow-worker-thread / tool-workflow / tool-ralph）、compaction 组

## 二、本地插件（`profiles\web\node_modules\@local` 下，共 3 包 6 文件；其中 dsh-flash-guide 为可选模块，另 2 包为 extra-plan 专属）

%USERPROFILE%\.dsh\profiles\web\node_modules\@local\dsh-extra-plan\index.js —— 模式核心插件（v0.1.5，44.8KB）：三级机械闸门（路由/澄清/批准 + 选项验词 + 通道逃生）、规划子代理探查硬上限（exploreBudget）与只读防线（write/edit + pwsh 写动词）、save_plan 专用工具（原子双写落盘 .extra-plan）、save_probe 探查线索落盘（仅主会话层注册）、plannerPromptSuffix 机械拼接、anchored 引导（主会话 + 规划子代理）、力度继承（reasoningEffort）、子代理沙箱下限、usage 账本折叠、请求失败诊断
%USERPROFILE%\.dsh\profiles\web\node_modules\@local\dsh-extra-plan\package.json —— 插件包元信息：name/version 0.1.5/type:module/main/exports 指向 index.js
%USERPROFILE%\.dsh\profiles\web\node_modules\@local\dsh-executor-spawn\index.js —— executor-spawn 薄委托层（v1.2，4.4KB）：包装宿主 spawn provider，给 workflow/ralph worker 注入执行者 deny 清单（防递归/防再规划）与默认模型 deepseek-v4-flash（防 pro 泄漏）；注册 provider 名 extra-executor-spawn（agent.cordis.yml 中 workflow/ralph 行引用）
%USERPROFILE%\.dsh\profiles\web\node_modules\@local\dsh-executor-spawn\package.json —— 插件包元信息：name/version 0.1.0/type:module/main/exports 指向 index.js
%USERPROFILE%\.dsh\profiles\web\node_modules\@local\dsh-flash-guide\index.js —— 可选模块：flash 模型近场引导插件（v0.1.0，285 行）：对 flash 主会话与 flash 执行者子代理，在每条真实用户消息后经 agent/pre-step 通道注入固定引导文本（简单任务=快速收敛版 / 复杂任务=深度决策版，带 flash 回顾/反跑题锚）；pro 规划子代理（非 flash 模型）自动排除、reviewer 跳过；零工具注册、不写会话事件；不在 export 打包范围，需要时手动安装
%USERPROFILE%\.dsh\profiles\web\node_modules\@local\dsh-flash-guide\package.json —— 插件包元信息：name/version 0.1.0/type:module/main/exports 指向 index.js，license MIT
