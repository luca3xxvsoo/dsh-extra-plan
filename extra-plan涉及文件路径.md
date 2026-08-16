# extra-plan 模式涉及文件路径清单

> 生成时间：2026-08-15。按类别列出 extra-plan（按需规划模式）涉及的全部文件/目录路径，每个文件一行。主机用户名：<用户名>；DSH_HOME = `~/.dsh`。

## 一、预设配置（用户已知，`.dsh\.agent-presets\extra-plan` 下）

~/.dsh\.agent-presets\extra-plan\preset.yml —— 预设元信息：name「按需规划模式」+ description（vibe coding 定位），GUI 预设列表与新建会话选择时显示
~/.dsh\.agent-presets\extra-plan\agent.cordis.yml —— 预设主配置（AGENT-PLANE 组合）：主会话 persona（路由/规划/批准/验收工作方式 + 语言约定）、工具行（shell/fs/jobs/skills/ask/todo/web）、extra-plan 插件行（config：anchoredBootstrap、bootstrapPersona、bootstrapShellTools/CommonTools、plannerModel、planTool、exploreBudget:18、savePlanDir、plannerPromptSuffix、usageLedger）、delegation 组（tool-subagent 执行者 / tool-subagent-plan 规划子代理 / tool-subagent-review 验收复核者 / executor-spawn / workflow-worker-thread / tool-workflow / tool-ralph）、compaction 组

## 二、本地插件（extra-plan 专属，`profiles\web\node_modules\@local` 下，共 2 包 4 文件）

~/.dsh\profiles\web\node_modules\@local\dsh-extra-plan\index.js —— 模式核心插件（v0.1.5，44.8KB）：三级机械闸门（路由/澄清/批准 + 选项验词 + 通道逃生）、规划子代理探查硬上限（exploreBudget）与只读防线（write/edit + pwsh 写动词）、save_plan 专用工具（原子双写落盘 .extra-plan）、save_probe 探查线索落盘（仅主会话层注册）、plannerPromptSuffix 机械拼接、anchored 引导（主会话 + 规划子代理）、力度继承（reasoningEffort）、子代理沙箱下限、usage 账本折叠、请求失败诊断
~/.dsh\profiles\web\node_modules\@local\dsh-extra-plan\package.json —— 插件包元信息：name/version 0.1.5/type:module/main/exports 指向 index.js
~/.dsh\profiles\web\node_modules\@local\dsh-executor-spawn\index.js —— executor-spawn 薄委托层（v1.2，4.4KB）：包装宿主 spawn provider，给 workflow/ralph worker 注入执行者 deny 清单（防递归/防再规划）与默认模型 deepseek-v4-flash（防 pro 泄漏）；注册 provider 名 extra-executor-spawn（agent.cordis.yml 中 workflow/ralph 行引用）
~/.dsh\profiles\web\node_modules\@local\dsh-executor-spawn\package.json —— 插件包元信息：name/version 0.1.0/type:module/main/exports 指向 index.js
