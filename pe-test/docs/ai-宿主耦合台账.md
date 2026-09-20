# 宿主耦合台账（DSH 与 QQBOT 升级比对用）

> 本台账回答一个问题：**升级 DSH 或 qqbot 后，本仓库哪些地方需要重新核对，按什么符号核对。**
> 维护方式：宿主侧一律以「宿主包名 + 包内相对路径 + 符号名」定位；本仓库侧给出文件与行号。

## 数据源

本台账条目来自历史探查者证据报告（三份报告已归档、不再逐文件引用；行号、数值、文案引用历史核对结论）。

- 台账基线修订（2026-09-12）：① 基线块的「DSH 宿主版本 0.1.2-rc.1 → 0.1.5-rc.2」与「仓库文件基线 55 → 52」两处为本次复核订正；② 覆盖口径剔除 gitignored 的 `pe-test/reports/`（原 5 行报告行移出，结论原就为「无」），故②表行数由 55 降为 52。被移出的 5 行若日后重新生成同类报告，不需回填。

口径校准：台帐条目按 80 + 79 + 50 = 209 条 evidence 原始统计逐条勾销，比规划方案预估的 208 条多 1 条（只多不少，不构成遗漏）。
口径对齐说明（2026-09-11 验收勘误）：验收标准清单 [任务6] 写的「报告 C 49 条 / 合计 208 条」是规划阶段的预估口径；执行阶段实测报告 C 顶层证据为 50 条，故本台账以 80 + 79 + 50 = 209 条为准，并已在下文 ③-E 勾销表中逐段给出归属条目编号（无悬空引用）。

证据去向：③四层表的每一条都在「本仓库位置」列给出条目编号（宿主服务层 HS1-HS25、宿主组合与文件契约层 HK1-HK24（含 HK6a/HK6b）、宿主数据与布局形状层 SD1-SD38（含 SD19b）、安装配置面 CF1-CF12），②覆盖总表的每一行给出该文件命中的条目编号或「无」。

## ① 基线块

| 项 | 值 | 来源 |
|:--|:--|:--|
| DSH 宿主版本 | 0.1.2-rc.1 | 宿主 dsh 包内 package.json 的 version 字段实测（2026-09-20 复核订正；原记 0.1.5-rc.2 为 2026-09-12 复核值） |
| 宿主安装路径 | C:\Users\Administrator\AppData\Roaming\npm\node_modules\@deepseek-ai\dsh | 本机实测；宿主依赖包位于其 node_modules\@deepseek-ai\ 下 |
| QQBOT 目标版本 | 0.5.0 | README.md L9 口径；本机无该包，属【未核实】目标版本 |
| 本插件版本 | 0.2.1（@local/dsh-extra-plan） | plugins/dsh-extra-plan/package.json 的 version 字段实测 |
| qqbot 精简插件版本 | 2.0.0（@local/dsh-qqbot-user-questions） | plugins/dsh-qqbot-user-questions/package.json 的 version 字段实测 |
| DSH_HOME | C:\Users\Administrator\.dsh | 本机实测（profiles/web 存在，本轮无 profiles/qqbot） |
| 记录日期 | 2026-09-11 | 本次产出日期 |
| 仓库文件基线 | 62 个（覆盖口径：排除 .extra-plan 与 gitignored 产物目录 pe-test/reports 后的实测文件数；该产物目录由一键体检每次运行重写、随跑随变，不参与口径；2026-09-18 复核） | 本机实测 |

**声明句：本台账不写宿主行号：宿主侧一律以 包名+包内相对路径+符号名 定位，升级时按符号名在升级后的宿主包内重新核对。**（本仓库自身的文件与行号可以写，用于定位改动点。）
## ② 仓库文件覆盖总表（62 个文件，逐行结论）

覆盖口径：本仓库文件全集 = 工作区内全部文件（不含 .extra-plan）减去 gitignored 产物目录 pe-test/reports（由一键体检每次运行重写、随跑随变，不参与口径）；2026-09-18 复核实测 62 个，含 pe-test/ 下各目录。复现：pwsh 统计 dsh-extra-plan 下排除 .extra-plan 与 pe-test/reports 后的文件数。逐行给结论：有挂钩写条目编号（见③四层表与④QQBOT 专章），无挂钩写「无」。
**口径订正（2026-09-12）**：原口径为「git ls-files 的 50 个 tracked 文件 + `pe-test/reports/` 下 5 个 ignored 报告文件 = 55 个」。`pe-test/reports/` 系一键体检每次运行都会重写的 gitignored 产物目录（随跑随变），已从口径中剔除；顺带消掉原表内那 5 行的悬空引用（该目录为 gitignored 产物目录（一键体检每次运行都会重建），当前含 84 个历史报告文件，不属仓库正式文件，且那 5 行结论本就都是「无」）。目录本身仍会被 `一键step测试.mjs` 重建，但不再计入本台账基线。

| 文件路径 | 结论（有挂钩→条目编号 / 无→「无」） | 备注 |
|:--|:--|:--|
| .gitattributes | 无 | 纯属性文件，与宿主无交互 |
| .gitignore | 无 | 忽略规则（含 .extra-plan/ 行），与宿主无交互 |
| LICENSE | 无 | 许可证文本，与宿主无交互 |
| pe-test/_shared/host-deps.mjs | 宿主数据与布局形状层 SD33（同形延展：按 DSH_HOME profile node_modules 与 npm 全局宿主安装目录锚点解析 @deepseek-ai/dsh-llm 真包入口） | 仅 pe-test 自检侧解析钩子；宿主包缺失即真抛错（不伪造模块） |
| pe-test/_shared/preset-hash.mjs | 无 | 只 import 本仓 lib/preset-sync.js，无 @deepseek-ai/* 依赖 |
| pe-test/_shared/session-finder.mjs | 宿主数据与布局形状层 SD1 | 取证工具共用的宿主会话存储布局依赖（sessions 目录布局 + 首行 parentSession） |
| pe-test/_shared/zstd-frames.mjs | 宿主数据与布局形状层 SD2 | zstd 帧格式自实现切分，依赖宿主会话日志压缩格式 |
| pe-test/docs/ai-代码地图.md | 无 | 工作区代码地图文档；本身不引用宿主符号，仅据本仓库文件生成 |
| pe-test/docs/ai-概览.md | 无 | AI 文档；仅声明 qqbot 兼容与所有权边界（本期加一行台账入口），无代码级挂钩 |
| pe-test/docs/ai-机制设计.md | 无 | AI 文档，只读产物，不含挂钩代码 |
| pe-test/docs/ai-流程备查.md | 无 | AI 文档，只读产物，不含挂钩代码 |
| pe-test/docs/ai-维护手册.md | 无 | AI 文档；声明所有权边界与宿主目录禁改清单（profiles/web、profiles/qqbot、.agent-presets） |
| pe-test/docs/ai-实机闸门测试流程.md | 无 | 实机闸门与 HUMAN 取证流程文档；本文不写行号，只引用宿主包名与符号名，无代码级挂钩 |
| pe-test/docs/ai-宿主耦合台账.md | 无 | 本台账自身；宿主侧一律以「包名+包内相对路径+符号名」定位，不写宿主行号 |
| pe-test/README.md | 无 | 测试目录说明文档，不含挂钩代码 |
| pe-test/tools/代码地图生成.mjs | 无 | 工作区代码地图生成器（node:fs/path/url），无宿主接触 |
| pe-test/tools/一键step测试.mjs | 宿主数据与布局形状层 SD1（传递） | 编排脚本：spawnSync 跑各 step；本身不 import 宿主包 |
| pe-test/tools/readme.md | 无 | save_probe 路径存在性校验所需的 fixture 文件（3 行自述为非文档；不删不改名） |
| pe-test/tools/step-00-跨平台写拦截.mjs | 无 | 本仓写拦截自检，不接触宿主包 |
| pe-test/tools/step-00-全流程回归.mjs | 无 | import 仅 node:url，其余为代码串断言，无宿主包接触 |
| pe-test/tools/step-01-安装分发.mjs | 安装配置面 CF9（夹具） | 临时 DSH_HOME 夹具回归 distribute()，import 本仓脚本与 preset-settings |
| pe-test/tools/step-01-安装同步.mjs | 安装配置面 CF9（夹具） | 临时 DSH_HOME 夹具回归 syncPreset()，含 profiles/sample 目录构造 |
| pe-test/tools/step-01-设置迁移.mjs | 安装配置面 CF9（夹具） | 临时目录回归设置迁移与发布状态机，import preset-sync + preset-settings |
| pe-test/tools/step-01-设置页配置.mjs | 安装配置面 CF7 | 真实 apply + loopback HTTP 回归 lib/settings.js；从宿主安装目录解析 schemastery/js-yaml |
| pe-test/tools/step-01-预设完整性.mjs | 宿主组合与文件契约层 HK23 | 纯工作区模板静态校验（自述不访问生产 DSH_HOME），断言宿主包名清单与行结构 |
| pe-test/tools/step-01-qqbot-安装映射.mjs | QQBOT 专章 QB24（【未核实】）、QB25（【已核实】） | qqbot 侧回归：静态 patch 四行断言 + 真机同形 fixture + 建链 10 场景；profiles/qqbot 分支本机不可核实 |
| pe-test/tools/step-04-工具清单查看.mjs | 宿主数据与布局形状层 SD1（传递） | 取证工具：解析会话 zstd 日志查看工具清单，经 _shared 依赖宿主会话存储形状 |
| pe-test/tools/step-04-路由与写闸门.mjs | 宿主数据与布局形状层 SD33、安装配置面 CF11 | 按 profile node_modules 锚点取 js-yaml，静态断言本仓 agent.cordis.yml |
| pe-test/tools/step-05-会话解码.mjs | 宿主数据与布局形状层 SD1（传递） | 取证工具：会话日志解码，经 _shared 依赖宿主会话存储形状 |
| pe-test/tools/step-06-线索落盘.mjs | 宿主数据与布局形状层 SD34 | mock ctx 走插件 apply 的注册层与闸门回归，构造宿主事件形状（subagent/descriptor、user/message、tool/call、tool/result） |
| pe-test/tools/step-06-真实会话查看.mjs | 宿主数据与布局形状层 SD1（传递） | 取证工具：真实会话查看，经 _shared 依赖宿主会话存储形状；现同时输出 data.error 与 tool-result.isError 的 TOOL-ERROR |
| pe-test/tools/step-07-子代理模型与引导取证.mjs | 宿主数据与布局形状层 SD1、SD2、SD8、SD11（传递） | HUMAN 取证工具：显式 SESSION_ID 定位直接 child，复用两代日志解码，分列 attempted route 与 actual provenance，并按 C11/C12 输出 suffix 证据 |
| pe-test/tools/step-08-方案配对查看.mjs | 宿主数据与布局形状层 SD1（传递） | 取证工具：方案与验收文档配对查看，经 _shared 依赖宿主会话存储形状 |
| pe-test/tools/step-99-用量统计.mjs | 无 | 用量统计读 jsonl（纯 token 统计，明细含 provider/cw/rs，无任何汇总；import 仅 node:fs），指向 usageLedger 输出，无宿主包接触 |
| plugins/dsh-extra-plan/assets/presets/extra-plan/agent.cordis.yml | 宿主组合与文件契约层 HK15、HK16、HK17、HK18、HK19 + 安装配置面 CF10 | AGENT-PLANE 预设组合模板：宿主包行、cordis:group 与 isolate、四行 tool-subagent + toolFilter.deny、executor-spawn 行、!!js dshHomePath；extra-plan config 含默认 false 的 crossProviderPlannerModel 与空串 otherAgentModel，角色注释覆盖 planner/非 planner child |
| plugins/dsh-extra-plan/assets/presets/extra-plan/dist-manifest.json | 无 | 仓库内分发清单模板（format 1、distHash null）；本项目自造格式，非宿主契约 |
| plugins/dsh-extra-plan/assets/presets/extra-plan/preset.yml | 安装配置面 CF10 | 预设显示元数据（name/description），对应宿主 METADATA_FILE 契约 |
| plugins/dsh-extra-plan/cordis.patch.yml | 宿主组合与文件契约层 HK11 | bundle patch 宿主平面行：insert 三条（client-bridge 相对路径行 + settings/preset-sync 子路径行） |
| plugins/dsh-extra-plan/index.js | 宿主服务层 HS1、HS2、HS3、HS4、HS5、HS6、HS7、HS8、HS9、HS10、HS11、HS12、HS13、HS14、HS15、HS16、HS17、HS18、HS19、HS20、HS21、HS22、HS23、HS24、HS25，宿主组合与文件契约层 HK1、HK2、HK3、HK4、HK5、HK6、HK6a、HK6b、HK7、HK8、HK9、HK11、HK12、HK20、HK21、HK22、HK23，宿主数据与布局形状层 SD3、SD4、SD5、SD6、SD7、SD8、SD9、SD10、SD11、SD12、SD13、SD14、SD15、SD16、SD17、SD18、SD19、SD19b、SD20、SD21、SD22、SD23、SD24、SD25、SD26、SD27、SD28、SD29、SD30、SD31、SD32、SD34、SD35、SD36、SD37、SD38（共 78 处，逐处见③四层表） | 会话平面主体插件（2139 行）：7 钩子、5 服务、会话事件解析与数据形状消费、工具注册面、planner 与非 planner child 双 resolver、True 真实 probe/strict fallback |
| plugins/dsh-extra-plan/lib/agent-session.js | 宿主数据与布局形状层 SD10 + 宿主组合与文件契约层 HK20 | 会话事件快照（sessionEvents）与子代理识别（isSubagentChild）的唯一来源；index.js 经 import 使用并经 decisions re-export；零依赖纯函数 |
| plugins/dsh-extra-plan/lib/assembly-presentation.js | 宿主数据与布局形状层 SD18 | A/C/M 模型可见投影与 tools:sdk 整体重建；从 scoped tools 服务读 schemas/sdkSchemas/模式，官方 dsh-tools SDK renderer 按 DSH_HOME/profile 与宿主安装目录只读加载（同 SD33 布局口径） |
| plugins/dsh-extra-plan/lib/client-bridge.js | 宿主服务层 HS22、HS23 + 宿主组合与文件契约层 HK24 | pathLike 空壳插件行：仅让 clientModules 扫到本包 dsh.client 声明 |
| plugins/dsh-extra-plan/lib/client.js | 宿主服务层 HS17、HS18、HS19、HS20、HS21、HS22 + 宿主组合与文件契约层 HK10、HK14 | 浏览器半：宿主打包格式、locale 注册、settings.plugin.item 卡片；metadata fields 由 descriptor 顺序驱动并按 section 分两组（general/pro），十项字段含 otherAgentModel，通用 True/False select 与宿主哈希类名/主题 token |
| plugins/dsh-extra-plan/lib/executor-spawn.js | 宿主服务层 HS8、HS9、HS10、HS11、HS12 | subagents provider 薄委托层：包装宿主 spawn provider 并注入 toolFilter.deny |
| plugins/dsh-extra-plan/lib/model-routing.js | 宿主组合与文件契约层 HK6a、HK6b + 宿主数据与布局形状层 SD11、SD14、SD15 | planner/非 planner 双 resolver：listProviders/listModels、真实 prepareCall + 完整 prepared stream 探针、agents.get 上溯顶层主会话 route、requestHeader owned 路由快照；createModelRouting per-apply 工厂，不 import index.js |
| plugins/dsh-extra-plan/lib/preset-settings.js | 宿主服务层 HS13、HS14、HS15、HS16 | 十项设置 descriptor 表（含 config.crossProviderPlannerModel:boolean 与 config.otherAgentModel:string）+ !!js 保真 YAML 解析 + 逐行标量改写；js-yaml 本地与宿主安装目录双路回退 |
| plugins/dsh-extra-plan/lib/preset-sync.js | 宿主服务层 HS5、HS6、HS7 + 宿主组合与文件契约层 HK16 | 启动自愈与 postinstall 共用状态机：写 DSH_HOME/.agent-presets/extra-plan，清理 profiles 下 cordis.patch.yml 遗留行，原子发布 |
| plugins/dsh-extra-plan/lib/run-code-static.js | 宿主组合与文件契约层 HK21 | run_code 纯静态解析/理由模块（写模式 hint、工具组拆解、ask 返回值白名单、调用点计数与双兼容 dispatch cap）；仅显式注入普通依赖，不持有宿主状态 |
| plugins/dsh-extra-plan/lib/save-contract.js | 无 | save 合同唯一真源：任务名/时间戳/sessionTag/base、PROBE_LIMITS 与 save_plan/save_probe 渲染；无宿主接触 |
| plugins/dsh-extra-plan/lib/save-persistence.js | 无 | 公共原子落盘（tmp→journal→rename→逐项确认目标就位→清 journal）与新旧 journal 自愈；阶段感知提交（pre-journal 条件清理／post-journal 保留 journal 与现场）与恢复完成判定（逐项确认目标存在，全项就位才删 journal）；仍无宿主依赖，仅 node:fs/path（末位可选 fs 依赖默认同义映射同步 node:fs，仅测试注入用） |
| plugins/dsh-extra-plan/lib/save-probe-validation.js | 无 | save_probe 参数校验（数组/条目/长度/总量/path 存在性/range/evidence 聚合拒绝）；无宿主接触 |
| plugins/dsh-extra-plan/lib/save-tool-factories.js | 宿主数据与布局形状层 SD19、SD20、SD21 | save_plan/save_probe 的工具定义面（parameters/output.schema/render/execute）；execute 取 exec.agent.session.header.cwd 作落盘基准 |
| plugins/dsh-extra-plan/lib/settings.js | 宿主服务层 HS1、HS2、HS3、HS4 | 宿主平面设置插件：settings 命名空间注册 + webServer 前缀路由 + DSH_HOME 与 .agent-presets 解析与受管文件改写 |
| plugins/dsh-extra-plan/package.json | 宿主组合与文件契约层 HK12、HK13、HK14 + 安装配置面 CF1、CF4、CF5、CF6、CF8、CF12 | 安装配置面：dsh.bundle.patch、dsh.client（platform 与 inject）、exports 子路径、postinstall、js-yaml 依赖 |
| plugins/dsh-extra-plan/scripts/distribute-preset.mjs | 安装配置面 CF1、CF2、CF3 | postinstall 入口：解析 DSH_HOME 后委派 syncPreset 分发预设 |
| plugins/dsh-qqbot-user-questions/cordis.patch.yml | QQBOT 专章 QB14-QB18 | 静态 patch：单一根级 insert 注入 4 行（qqbot-user-questions、code-runtime、agent-presets 默认 extra-plan、cordis-host-runner） |
| plugins/dsh-qqbot-user-questions/index.js | QQBOT 专章 QB1-QB4（QB4 为【未核实】） | 本仓库 qqbot 侧唯一插件入口（24 行）：apply() 启动时调 healQqbotCompatibility(home)；inject 为空 |
| plugins/dsh-qqbot-user-questions/lib/heal.js | QQBOT 专章 QB5-QB13 | qqbot 自愈纯函数模块（369 行）：findOwnQqbotProfiles、healPatchRows、ensureDshExtraPlanLink；含 js-yaml 双 fallback、旧版根级块迁移、junction 建链 |
| plugins/dsh-qqbot-user-questions/package.json | QQBOT 专章 QB19、QB20 | 包契约：name 为 @local/dsh-qqbot-user-questions v2.0.0；dsh.bundle.patch 指向 cordis.patch.yml；postinstall 跑 scripts/heal.mjs |
| plugins/dsh-qqbot-user-questions/scripts/heal.mjs | QQBOT 专章 QB2、QB21 | CLI 兜底入口（26 行）：postinstall 与手动触发共用；invokedAsMain 判定；异常也以退出码 0 结束、不阻断 |
| READAI.md | 无 | 导航层文档；声明 qqbot 兼容与版本区间，本期新增台账入口一行；无代码级挂钩 |
| README.md | 无 | 项目说明文档；声明 DSH 与 qqbot 兼容版本及安装命令，本期禁止修改 |
## ③ 四层条目表（固定 6 列；每条 6 列全非空，纯 Markdown 管道表、无合并单元格）

列名（逐字固定）：| 本仓库位置(文件+符号+行号) | 宿主符号(逐字) | 宿主包+包内相对路径 | 用途 | 升级敏感点 | 核实状态 |

四层分组与归层原则：**③-A 宿主服务层**（ctx.get 与 ctx.inject 取用的宿主服务、服务方法签名、本插件向宿主注册的服务面与浏览器平面服务）；**③-B 宿主组合与文件契约层**（ctx.on 钩子注册的 emit 与 waterfall 契约、cordis.patch.yml 的 insert 语义、dsh.bundle.patch 与 exports 解析、.agent-presets 目录与 CORE 文件名契约、!!js dshHomePath、isolate realm、__ModuleLoader__ 打包契约、inject 为空的插件契约）；**③-C 宿主数据与布局形状层**（会话事件负载字段、Session 方法形状、SessionHeader 字段、profile 层 patch 文件、会话日志存储布局与压缩格式、客户端 CSS 哈希类名与主题 token）；**③-D 安装配置面**（package.json 的 dsh.bundle 与 dsh.client 与 exports 与 postinstall 与依赖声明、DSH_HOME 解析、宿主安装路径回退、预设元数据）。

### ③-A 宿主服务层（服务读取与注册面，共 25 条）

归层原则：通过 ctx.get / ctx.inject 取用的宿主服务、服务上的方法签名，以及本插件向宿主注册的服务面与浏览器平面服务。

| 本仓库位置(文件+符号+行号) | 宿主符号(逐字) | 宿主包+包内相对路径 | 用途 | 升级敏感点 | 核实状态 |
|:--|:--|:--|:--|:--|:--|
| HS1 plugins/dsh-extra-plan/lib/settings.js apply 与 ctx.inject(['settings'])（L151-154）+ L153 sctx.settings.register | settings（服务名）+ register(ns, schema, options) | dsh-settings 包内 lib/index.js | 注册设置命名空间 dsh-extra-plan，供设置页与本插件 config 读写 | 服务名、方法签名或 options.base 语义变化即注册失败 | 【已核实】 |
| HS2 plugins/dsh-extra-plan/lib/settings.js L21 EXTRA_PLAN_NS | NAMESPACE_PATTERN（命名空间命名约束） | dsh-settings 包内 lib/index.js | 命名空间字面量 dsh-extra-plan 必须同时命中宿主命名规则与前端卡片 key | 正则放宽或收紧、校验点迁移即注册被拒 | 【已核实】 |
| HS3 plugins/dsh-extra-plan/lib/settings.js ctx.inject(['webServer'])（L155-160）+ L157-158 webServer.register({kind:'prefix'}) | webServer（服务名）+ register(route) + route.kind 值域 exact 与 prefix | dsh-host-webserver 包内 lib/index.js | 注册设置页后端路由前缀 /api/dsh-extra-plan-settings 并随 effect 注销 | kind 改 exact 则 /pro-config 子路径不匹配；前缀最长匹配规则变化即路由错位 | 【已核实】 |
| HS4 plugins/dsh-extra-plan/lib/settings.js L33 与 L26-30（拼 .agent-presets/extra-plan/agent.cordis.yml） | USER_PRESET_DIR + COMPOSITION_FILE + DSH_HOME_ENV + DSH_HOME_DIR_NAME | dsh-agent-presets 包内 lib/index.js；dsh-home-paths 包内 lib/index.js | 定位用户预设目录与组合文件名（读写受管 config 文件） | 目录名、文件名或 DSH_HOME 解析规则变化即读写目标错位 | 【已核实】 |
| HS5 plugins/dsh-extra-plan/lib/preset-sync.js L278-L289（inject 为空的宿主平面自愈插件） | cordis 插件契约 name 与 inject 与 apply | cordis 包内 lib/index.js（宿主依赖 @deepseek-ai/cordis ^4.0.2） | 作为 bundle patch 行加载，DSH 启动即自愈（幂等、异常被吞） | cordis 改插件契约或 patch 行注入方式变化即 apply 不被调用 | 【已核实】 |
| HS6 plugins/dsh-extra-plan/lib/preset-sync.js L29 CORE_FILES 与 L115-201 原子发布 | METADATA_FILE + COMPOSITION_FILE + 用户预设目录 .agent-presets | dsh-agent-presets 包内 lib/index.js | 发布用户预设：两文件名与宿主约定完全绑定，目录缺任一即被判 broken | 宿主改名任一常量或改 broken 判定即发布与发现同时失效 | 【已核实】 |
| HS7 plugins/dsh-extra-plan/lib/preset-sync.js L207-233 cleanupLegacyFlashGuidePatches（含 L219 遗留行正则） | PROFILE_PATCH_FILENAME（profile 用户层 patch 文件名） | dsh-app-boot 包内 lib/index.js | 删宿主 profile 层 profiles 目录下 cordis.patch.yml 里的 flash-guide 遗留行块 | 文件名或 patch 行 YAML 结构变化即正则失效、遗留行残留 | 【已核实】 |
| HS8 plugins/dsh-extra-plan/lib/executor-spawn.js L26 inject 与 apply L57 与 L74-88 | subagents（服务名）+ getProvider(name) + registerProvider(provider) | dsh-subagent 包内 lib/index.js | 包装并委托宿主 spawn provider，注册 extra-executor-spawn 提供者 | 服务名、方法签名、provider 接口五字段或重名校验变化即注册失败 | 【已核实】 |
| HS9 plugins/dsh-extra-plan/lib/executor-spawn.js L57-L60（delegate 默认 spawn） | providerName 默认值 spawn（Config.providerName） | dsh-subagent-spawn-in-process 包内 lib/index.js | 取被委托的宿主 spawn provider 实体 | 宿主默认 provider 名变化即 getProvider 取不到、插件抛错 | 【已核实】 |
| HS10 plugins/dsh-extra-plan/lib/executor-spawn.js L81 toolFilter 注入（含 L63 deny 对象） | SubagentProvider 能力校验 toolFilter + childCtx.tools.restrict(composition.toolFilter) | dsh-subagent 包内 lib/index.js | 给经本 provider 派出的子代理注入执行者工具 deny 清单 | deny 名单必须都是本预设实际注册的工具名，否则 restrict 抛错；能力校验口径变化即行为漂移 | 【已核实】 |
| HS11 plugins/dsh-extra-plan/lib/executor-spawn.js L85-87 prepareContinuable 条件透传 | UNSUPPORTED_CAPABILITY（provider 无 prepareContinuable 时抛错） | dsh-subagent 包内 lib/index.js | 仅当被委托 provider 支持时透传 continuable 能力 | 能力探测方式或错误口径变化即透传条件失真 | 【已核实】 |
| HS12 plugins/dsh-extra-plan/lib/executor-spawn.js L64-68 注释（resolveChildAgentOptions 语义） | resolveChildAgentOptions（对象展开合并 requested） | dsh-subagent 包内 lib/index.js | 说明 agentOptions 空对象与 undefined 等价、父会话 provider/model/maxTokens 全继承 | 合并语义改为显式键判定即空对象可能屏蔽父值（本期注释已同步口径） | 【已核实】 |
| HS13 plugins/dsh-extra-plan/lib/preset-settings.js L9-22 loadYaml 回退（createRequire 锚定宿主安装包） | 宿主安装包路径 @deepseek-ai/dsh 的 package.json 与其依赖 js-yaml | dsh 包内 package.json 与包内 node_modules/js-yaml | 本地 require js-yaml 失败时借宿主安装目录解析 YAML | 宿主移除 js-yaml 依赖或改 npm 全局前缀即回退断裂 | 【已核实】 |
| HS14 plugins/dsh-extra-plan/lib/preset-settings.js L25-32 JsExpr 标签 | !!js 标签 schema（yaml.JSON_SCHEMA.extend） | cordis-plugin-include 包内 lib/index.js；dsh-app-boot 包内 lib/index.js | 以保真方式解析预设里的 !!js dshHomePath 表达式 | 宿主换 YAML 库或改标签实现即解析失败 | 【已核实】 |
| HS15 plugins/dsh-extra-plan/lib/preset-settings.js L59-L102 descriptor 表（pluginId 与 path） | 组合行 id + 行内路径（config 下键路径）定位契约 | dsh-agent-presets 包内 lib/index.js（行结构见本仓 agent.cordis.yml） | 把十项设置写回预设组合行的 config 键（plannerModel、otherAgentModel、crossProviderPlannerModel、toolPresentationMode 等） | 宿主行结构或 config 路径语义变化即改写落点错误 | 【已核实】 |
| HS16 plugins/dsh-extra-plan/lib/preset-settings.js L37 modeOptions 与 L86 | config.mode 枚举（native / ptc / both） | dsh-agent-tool-presentation 包内 lib/index.js | 设置页 mode 取值必须与宿主该插件的 config.mode 枚举一致 | 宿主枚举增删项即设置页写入非法值 | 【已核实】 |
| HS17 plugins/dsh-extra-plan/lib/client.js L1-2（__ModuleLoader__.load 自注册，id 为 @local/dsh-extra-plan） | __ModuleLoader__ 打包契约 + loader 注册（重名抛错、未注册即报错） | dsh-client-modules 包内 lib/index.js | 浏览器半 bundle 自注册，id 必须等于包名与组合图行 id | 打包格式或注册契约变化即前端插件不加载 | 【已核实】 |
| HS18 plugins/dsh-extra-plan/lib/client.js L7 require('react') | 共享模块系统提供的 react | dsh-client-modules 包内 lib/client.js | 客户端 bundle 通过共享 require 取 React（宿主 68 个内置 bundle 同款） | 宿主改共享依赖暴露方式即 require 失败 | 【已核实】 |
| HS19 plugins/dsh-extra-plan/lib/client.js L88-L90（bind 与 register，命名空间 dsh-extra-plan-settings） | locale 服务 bind(ns) + register(ns, localeOrDicts, dict) | dsh-client-locale 包内 lib/client.js | 注册并绑定设置页卡片的中英文案 | 签名或字典形状变化即文案缺失 | 【已核实】 |
| HS20 plugins/dsh-extra-plan/lib/client.js L303-310（slots.inject 设置页插件插槽）与 L306 key | slots 服务 inject(key, callback) + 插槽声明 kind 为 keyed + 卡片 key 与已 serve 命名空间求交 | dsh-client-ui-renderer 包内 lib/client.js；dsh-client-ui-settings-plugins 包内 lib/client.js | 在设置页插件卡片插槽注册本插件卡片（等声明语义） | 插槽名、keyed 语义或交集规则变化即卡片不渲染 | 【已核实】 |
| HS21 plugins/dsh-extra-plan/lib/client.js L261-L282 类名族 YyYd_a_*（card、cardOpen、header、body、chevron、chevronOpen） | CSS Module 哈希类名族 YyYd_a_* | dsh-client-ui-settings-plugins 包内 lib/client.js | 复用宿主设置卡片样式类名（本插件无自有样式表） | 宿主重建后哈希前缀变化即卡片失去样式（本层最脆项） | 【已核实】 |
| HS22 plugins/dsh-extra-plan/lib/client.js L63-79 主题变量引用 | 主题 token --dsw-alias-label-primary 与 border-l2 与 bg-layer-3 与 brand-primary 与 label-secondary 与 label-error 与 label-tertiary | dsh-client-ui-theme 包内 lib/client.js | 卡片配色随宿主主题 token | token 改名或删除即样式与可读性受损 | 【已核实】 |
| HS23 plugins/dsh-extra-plan/lib/client-bridge.js L15-19（name 与 inject 为空与空 apply） | pathLike 行锚定（点开头或 file: 或绝对路径）+ nearestPackage 向上找 package.json + exports 里的 ./client | dsh-client-modules 包内 lib/index.js | 空壳宿主平面行，唯一作用是让 clientModules 扫到本包 package.json 的 dsh.client 声明 | pathLike 判定、nearestPackage 或 exports 解析变化即前端 bundle 不被发现 | 【已核实】 |
| HS24 plugins/dsh-extra-plan/assets/presets/extra-plan/agent.cordis.yml L105-L130（config 含 crossProviderPlannerModel:boolean 与 otherAgentModel:string） | 预设行 config 经宿主 schema 校验后 1:1 传入 apply(ctx, config) | dsh-agent-presets 包内 lib/index.js | 把预设行 config 交给插件（crossProviderPlannerModel 只在 cfg===true 时打开严格路径，otherAgentModel 为空串表示回退主会话） | 宿主改变行 config 传递方式或校验即插件配置读不到 | 【已核实】 |
| HS25 plugins/dsh-extra-plan/index.js L1348-L2253（name 为 extra-plan、inject 为空、apply(ctx, config)；name 与 inject 在 L1348-L1349、apply 函数体 L1366-L2253） | cordis 插件契约 name 与 inject 与 apply | cordis 包内 lib/index.js；行注入方 dsh-agent-presets 包内 lib/index.js | 作为 agent 平面预设组合行加载（每会话一份实例），配置快照含 plannerModel/otherAgentModel/crossProviderPlannerModel | 契约或 config 注入方式变化即 apply 不被调用或配置读不到 | 【已核实】 |
### ③-B 宿主组合与文件契约层（钩子注册与组合文件契约，共 26 条）

归层原则：ctx.on 钩子注册（emit 与 waterfall 契约）、cordis.patch.yml 的 insert 语义、dsh.bundle.patch 与 exports 解析、.agent-presets 目录与 CORE 文件名契约、!!js dshHomePath、isolate realm、__ModuleLoader__ 打包契约、inject 为空的插件契约。

| 本仓库位置(文件+符号+行号) | 宿主符号(逐字) | 宿主包+包内相对路径 | 用途 | 升级敏感点 | 核实状态 |
|:--|:--|:--|:--|:--|:--|
| HK1 plugins/dsh-extra-plan/index.js L1762（注册 agent/session-start） | agent/session-start（mode 为 emit；payload 含 agent 与 source） | dsh-tool-cordis 包内 lib/index.js（钩子签名目录）；派发点 dsh-agent-loop 包内 lib/index.js | 会话启动时初始化本会话账本与状态 | 钩子名、payload 字段或派发时机变化即初始化失效 | 【已核实】 |
| HK2 plugins/dsh-extra-plan/index.js L1791-L1814（agent/pre-step，判定 decision.kind 不为 enter 直接返回在 L1802）；catalog 投影注册点 L1786-L1789 | agent/pre-step（mode 为 waterfall；next() 返回 PreStepDecision） | dsh-tool-cordis 包内 lib/index.js；派发点 dsh-agent-loop 包内 lib/index.js；类型 dsh-agent 包内 lib/types/runtime-types.d.ts | 锚定引导轮次判定与消息收窄（取 next() 返回值后决定是否直接返回） | 决策 kind 取值或瀑布 next 语义变化即引导逻辑失真 | 【已核实】 |
| HK3 plugins/dsh-extra-plan/index.js L1859（agent/request-error，try 与 finally 包 next()） | agent/request-error（mode 为 waterfall；payload 含 turn、step、provider、failure、retryPolicy、signal） | dsh-tool-cordis 包内 lib/index.js；派发点 dsh-agent-loop 包内 lib/index.js | 请求失败时记录错误（finally 记账，不影响重试决策） | payload 字段或 next 调用语义变化即记账丢失或重复 | 【已核实】 |
| HK4 plugins/dsh-extra-plan/index.js L1876（agent/disposed） | agent/disposed（mode 为 emit；读 payload.agent 的 session.header.id；宿主在 driver quiescence 之后、session detachment 之前发出，监听器返回的 Promise 只被挂 catch、不被等待） | dsh-tool-cordis 包内 lib/index.js；payload.agent 融合 dsh-agent 包内 lib/index.js | 会话销毁时同步结算该会话末轮 usage 并按 sessionId 回收该会话状态（foldUsage 必须同步调用；不可依赖异步返回被宿主等待，否则末轮漏记窗口重开） | 钩子名、payload 形状、派发时机（quiescence/detachment 之间）或 emit 不再同步调用监听器时，末轮结算与单会话回收失效 | 【已核实】 |
| HK5 plugins/dsh-extra-plan/index.js L1901-L2001（system-prompt/assemble，三参 assembly 与 context 与 next） | system-prompt/assemble（mode 为 waterfall；三参形式） | dsh-tool-cordis 包内 lib/index.js；派发点 dsh-system-prompt 包内 lib/index.js；类型 dsh-system-prompt 包内 lib/types/index.d.ts | 注入 anchored 引导段（段名 extra-plan-bootstrap），收窄首轮目录 | 参数元数、瀑布语义或 PromptAssembly 形状变化即引导段丢失 | 【已核实】 |
| HK6 plugins/dsh-extra-plan/index.js（agent/request） | agent/request（mode 为 waterfall；next() 返回 LlmCallConfig） | dsh-tool-cordis 包内 lib/index.js；派发点 dsh-agent-loop 包内 lib/index.js；类型 dsh-agent/lib/types/runtime-types.d.ts | planner 与非 planner child 先 await next；非 planner 显式 route 优先，未显式时 otherAgentModel 的 True 路径完成全部真实 probe/排序或已验证顶层主会话 fallback，最后返回 final LlmCallConfig；随后宿主才 prepareCall/stream | 返回值形状、payload.signal 或 waterfall 等待语义变化会让未验证路由越过屏障 | 【已核实】 |
| HK6a plugins/dsh-extra-plan/lib/model-routing.js（probePlannerRoute L206-247 + planner/非 planner strict resolver L312-381、L433-477）；钩子侧 index.js L2018-L2080 | llm.listModels(provider) + llm.listProviders() | dsh-llm 包内 lib/index.js；类型 dsh-llm/lib/types/index.d.ts | True 路径按角色枚举 provider，并仅对 listModels 精确命中的 plannerModel 或 otherAgentModel route 进入真实探针；False 的非 planner 只查询顶层主会话 provider advisory 目录，不触碰 listProviders/真实 probe | listProviders/listModels 返回形状、advisory 语义或注册顺序变化即候选集合与排序输入变化 | 【已核实】 |
| HK6b plugins/dsh-extra-plan/lib/model-routing.js probePlannerRoute L206-247（prepareCall + 完整 prepared stream） | llm.prepareCall(config, signal) + PreparedLlmCall.stream(options) | dsh-llm 包内 lib/index.js；类型 dsh-llm/lib/types/index.d.ts L369-L390、types.d.ts L379-L416 | planner/非 planner True 均以 maxTokens:1、plugin-source OK text、无 system/tools/sessionId/purpose 的同 signal prepared stream 完整消费，finish error/aborted/缺失/超时均失败 | prepare/stream 绑定 registration、call-config 或 StreamChunk 形状变化即探针失真；该契约仅 True 使用 | 【已核实】 |
| HK7 plugins/dsh-extra-plan/index.js L2096-L2253（tools/pre-execute 硬闸门） | tools/pre-execute（mode 为 waterfall；exec 为 ToolExecution，next() 默认 allow） | dsh-tool-cordis 包内 lib/index.js；派发点 dsh-tools 包内 lib/index.js；类型 dsh-tools 包内 lib/types/index.d.ts | 四级机械闸门（route 与 purpose 与 clarified 与 approved）与多调用拆解拦截 | exec 契约或决策类型变化即闸门失效或误拦 | 【已核实】 |
| HK8 plugins/dsh-extra-plan/index.js 七个钩子回调内统一读取 payload.agent | agentEvents fused()：把 agent 融进 payload | dsh-agent 包内 lib/index.js | 所有钩子以 payload.agent 取当前 agent 与 session 上下文 | 融合机制或 payload 形状变化即取不到 agent | 【已核实】 |
| HK9 plugins/dsh-extra-plan/index.js L2128-L2157（按 source 三元组识别通知并按正文正则解析 jobId，source 三元组判定在 L2137、match 在 L2147） | background job 通知的 source 三元组（kind 为 plugin、plugin 为 tool-jobs、form 为 notice）与正文前缀 background job 加 id | dsh-tool-jobs 包内 lib/index.js | 识别 tool-jobs 完成通知并解析 jobId（解析失败保守不放行） | source 三元组或正文格式变化即解析失败、通知渠道降级 | 【已核实】 |
| HK11 plugins/dsh-extra-plan/cordis.patch.yml 三条 insert 行（一条相对路径行与两条 branded 子路径行） | patch 顶层数组语法 insert（无 id 的 insert 追加到根列表）+ anchorInsertedPluginNames 相对路径绝对化 | dsh-app-boot 包内 lib/index.js | 把 client-bridge 与 settings 与 preset-sync 三行注入 profile 组合树 | patch 语义或相对路径基准变化即行不注入或被 warn 跳过 | 【已核实】 |
| HK12 plugins/dsh-extra-plan/package.json dsh.bundle.patch 指向 ./cordis.patch.yml | dsh.bundle.patch（loadProfile 读取点；缺失抛 declares no dsh.bundle） | dsh-app-boot 包内 lib/index.js；profile 侧 profiles/web/package.json | 声明本包为 profile bundle 并给出 patch 入口 | 字段名或基准目录变化即 patch 不加载、启动报错 | 【已核实】 |
| HK13 plugins/dsh-extra-plan/package.json L7-16 exports 子路径（与 cordis.patch.yml 两条 branded 行对应） | exports 解析（resolve 子路径；解析失败有专门报错口径） | dsh-app-boot 包内 lib/index.js | 以 @local/dsh-extra-plan/settings 与 /preset-sync 载入宿主平面行 | exports 解析规则或报错口径变化即行解析失败 | 【已核实】 |
| HK14 plugins/dsh-extra-plan/package.json dsh.client（platform 为 web、inject 四项） | dsh.client.platform 必须逐字 web；dsh.client.inject 决定先装载依赖 graph row；exports 必须含 ./client | dsh-client-modules 包内 lib/index.js 与 lib/client.js | 声明浏览器半 bundle 与模块图依赖顺序 | platform 值域、inject 语义或 exports 要求变化即前端 bundle 被跳过 | 【已核实】 |
| HK15 plugins/dsh-extra-plan/assets/presets/extra-plan/agent.cordis.yml L95-133（extra-plan-group 与 cordis:group 与核心插件行 config 段） | 预设行发布进程级服务即被拒（必须置于 isolate realm 或迁到宿主组合） | dsh-agent-presets 包内 lib/index.js；isolate 为 loader 入口选项（cordis-plugin-loader 包内 lib/index.js） | 解释 settings 与 preset-sync 为何必须放 bundle patch 而非 agent 预设 | 宿主放宽或收紧该强制点即组合划分前提变化 | 【已核实】 |
| HK16 plugins/dsh-extra-plan/assets/presets/extra-plan/agent.cordis.yml L122（path 用 !!js dshHomePath 计算账本路径） | ctx.provide('dshHomePath', dshHomePath) + !!js 标签 schema | dsh-app-boot 包内 lib/index.js；cordis-plugin-include 包内 lib/index.js | 用宿主提供的 dshHomePath 计算账本落盘路径（预设加载期求值） | 宿主撤掉该 provide 或改名即预设加载报错 | 【已核实】 |
| HK17 plugins/dsh-extra-plan/assets/presets/extra-plan/agent.cordis.yml 四行 tool-subagent（provider 与 toolName 与 backgroundMode 与 persona 与 toolFilter.deny 与 maxDepth） | 行配置 schema（provider 必填、toolName 默认 subagent、backgroundMode 值域、toolFilter 的 allow 与 deny、maxDepth 默认 3） | dsh-tool-subagent 包内 lib/index.js | 定义执行者与规划者与 workflow 与 ralph 四类子代理行与 deny 清单 | schema 增删键或值域变化即预设加载报错或裁剪失效 | 【已核实】 |
| HK18 plugins/dsh-extra-plan/assets/presets/extra-plan/agent.cordis.yml L312-316 executor-spawn 行（providerName 与 delegate） | 子代理行 config 经 schema 校验后交给本仓 provider 实现 | dsh-tool-subagent 包内 lib/index.js | 把 workflow 与 ralph 两行的 provider 指向本仓 executor-spawn | config 键名或传递方式变化即委托链断裂 | 【已核实】 |
| HK19 plugins/dsh-extra-plan/assets/presets/extra-plan/agent.cordis.yml L163 与 L168 宿主包子路径行 | 宿主包行名解析（exports 子路径，如 tool-subagent-control 下的 list-agents） | dsh-app-boot 包内 lib/index.js；对应包 dsh-tool-subagent-control 包内 lib/index.js | 在预设组合中直接挂宿主包的行 | 宿主包改名或移除子路径导出即预设加载失败 | 【已核实】 |
| HK20 plugins/dsh-extra-plan/lib/agent-session.js L21-36（isSubagentChild 子代理识别：header.origin/delegationDepth/descriptor 三路探测）+ index.js L217-L222 与 L1657-L1661（childPolicyNeedsFloor/floorChildPolicy 沙箱下限判定） | SessionHeader 的 origin 为 subagent 与 delegationDepth 与 parentSession | dsh-session 包内 lib/types/types.d.ts | 识别子代理会话，决定是否施加工作区写沙箱下限 | 字段改名或缺失即把子代理当主会话处理（沙箱下限失效） | 【已核实】 |
| HK21 plugins/dsh-extra-plan/lib/run-code-static.js isRunCodeSubCall L637-L641（exec.sub 与 exec.parent 判定） | ToolExecution.parent（宿主侧字段；另有 rootCallId 与 arguments 与 agent） | dsh-tools 包内 lib/types/index.d.ts | 判断该调用是否为委派子会话调用（闸门对象判定） | parent 语义变化即判定漂移（注意 sub 非宿主字段，见⑥） | 【已核实】 |
| HK22 plugins/dsh-extra-plan/index.js L240-L252（commandTextOf 取 exec.arguments 的 command 键）与 L288-L289（pwsh/bash 写判定包装定义（被 mainGateReason 调用）） | ToolExecution.arguments（宿主已解析对象，非 JSON 字符串） | dsh-tools 包内 lib/types/index.d.ts | 闸门按已解析参数判定命令类调用（pwsh 与 bash 同形） | 参数解析时机或形状变化即判定失效 | 【已核实】 |
| HK24 plugins/dsh-extra-plan/lib/client-bridge.js 空壳行与 package.json dsh.client | pathLike 行须写点开头的相对路径（否则按精确包名解析、行被跳过） | dsh-app-boot 包内 lib/index.js（anchorInsertedPluginNames）；dsh-client-modules 包内 lib/index.js | 让宿主扫到本包客户端声明 | pathLike 判定或精确包名解析规则变化即行被跳过 | 【已核实】 |
| HK10 pe-test/tools/step-06-线索落盘.mjs（构造宿主事件形状走 apply 的注册层与闸门回归） | subagent/descriptor 与 user/message 与 tool/call 与 tool/result 事件负载形状 | dsh-session 包内 lib/types/types.d.ts；dsh-subagent 包内 lib/types/descriptor.d.ts | mock ctx 回归插件注册层与闸门（夹具必须与真实负载同形） | 事件形状变化即夹具脱离真实负载、回归假绿 | 【已核实】 |
| HK23 pe-test/tools/step-01-预设完整性.mjs（宿主包名清单与行结构静态断言） | 宿主包名与组合行结构（静态字面量，不代表宿主运行时契约） | dsh-agent-presets 包内 lib/index.js；dsh-tool-subagent 包内 lib/index.js | 纯工作区模板校验（不访问生产 DSH_HOME） | 宿主包改名后该断言同时失效，不会先于预设发现漂移 | 【已核实】 |
### ③-C 宿主数据与布局形状层（事件负载与文件布局形状，共 37 条）

归层原则：会话事件负载字段解析、Session 方法形状、SessionHeader 字段、profile 层文件布局、会话日志存储布局与压缩格式、客户端 CSS 哈希类名与主题 token。

| 本仓库位置(文件+符号+行号) | 宿主符号(逐字) | 宿主包+包内相对路径 | 用途 | 升级敏感点 | 核实状态 |
|:--|:--|:--|:--|:--|:--|
| SD1 pe-test/_shared/session-finder.mjs L16-L65（SESSIONS 布局与首行 parentSession；step-07 复用） | 会话存储布局 sessions 目录结构 + 首行 parentSession 字段 | dsh-session-persistence-jsonl 包内 lib/index.js；字段校验 dsh-session 包内 lib/types/types.d.ts | 取证工具按布局定位会话并读首行取父会话 | 布局或首行字段变化即取证工具全部失效 | 【已核实】 |
| SD2 pe-test/_shared/zstd-frames.mjs L6（帧魔术数）与 L40-42（step-07 复用） | 会话日志压缩后缀与 zstd 帧格式（compression 为 zstd 时后缀 .jsonl.zstd；文件名两代并列：0.1.2-rc.1=session.jsonl.zstd、0.1.5-rc.2 起=session.v3.jsonl.zstd） | dsh-session-persistence-jsonl 包内 lib/index.js | 自实现 zstd 帧切分并用 node:zlib 解压读会话日志 | 宿主换压缩格式或文件名规则即解码失败 | 【已核实】 |
| SD3 plugins/dsh-extra-plan/index.js L585-L692（deriveFlowState 事件流回放）与 L735-L749（toolCallsSinceUser 预算锚点） | user/message 事件负载（data.source.kind 为 user） | dsh-session 包内 lib/types/types.d.ts | 扫描会话事件流判定用户轮起点（预算锚点） | 事件键或负载形状变化即锚点判定失效 | 【已核实】 |
| SD4 plugins/dsh-extra-plan/index.js L508-L542（parseAskResultData 解析 answers）与 L585-L692（deriveFlowState 内 tool/call 解析） | tool/call 事件负载（turn 与 step 与 callId 与 name 与 arguments，arguments 是原始 JSON 字符串） | dsh-session 包内 lib/types/types.d.ts | 识别 ask_user_question 调用与澄清选项（含第四锚点目的 ask：仍属 tool/call + options 解析，无实质变更） | arguments 由字符串改对象即 JSON.parse 抛错 | 【已核实】 |
| SD5 plugins/dsh-extra-plan/index.js L701-L728（toolCallCount 按块级 isError 排除被拒调用） | tool/result 事件负载（turn 与 step 与 message 与 error 与 meta）+ ToolResultBlock 的 isError | dsh-session 包内 lib/types/types.d.ts；dsh-llm 包内 lib/types/types.d.ts | 按结果与错误标记计预算（被拒调用不计） | 负载或错误标记口径变化即预算计数偏差 | 【已核实】 |
| SD6 plugins/dsh-extra-plan/index.js L1460-L1541（foldUsage 的 assistant/message 分支，判定在 L1481；token 累加字段在 L1489-L1493；来源模型与 provider 在 L1496-L1497） | assistant/message 事件负载（turn 与 step 与 message 与 usage 与 interrupted）+ TokenUsage + MessageSourceMap 的 model 与 provider | dsh-session 包内 lib/types/types.d.ts；dsh-llm 包内 lib/types/types.d.ts 与 lib/types/message.d.ts | usage 账本累加输入与输出与缓存读与缓存写入与推理 token 及来源模型与 provider | 字段改名或来源映射变化即账本失真 | 【已核实】 |
| SD7 plugins/dsh-extra-plan/index.js L551-L577（parseDispatchAskResult）与 L585-L692（deriveFlowState 双兼容事件名解析） | tool/code-dispatch-start 与 tool/code-dispatch（0.1.2-rc.1）/ tool/ptc-dispatch-start 与 tool/ptc-dispatch（0.1.5-rc.2）负载（rootCallId 与 parentCallId 与 subCallId 与 name 与 arguments 与 isError 与 content） | dsh-tools 包内 lib/types/types.d.ts 与 lib/types/invariant.js | PTC 模式下统计 run_code 子调用与判定拆解组 | 字段或调用链不变量变化即统计与拦截失效 | 【已核实】 |
| SD8 plugins/dsh-extra-plan/index.js L1552-L1566（isPlannerChild 按 subagent/descriptor.mode=continuable 判定） | subagent/descriptor 事件（mode 取值 one-shot 或 continuable） | dsh-subagent 包内 lib/types/descriptor.d.ts | 区分可续轮子代理（规划者）与 one-shot（执行者与验收者） | mode 值域或事件版本变化即角色判定漂移 | 【已核实】 |
| SD11 plugins/dsh-extra-plan/lib/model-routing.js requestConfigSnapshot L39-52 与 resolveAgentRouteSources L60-85（requestHeader 与 header.config） | Session.requestHeader() 返回 EpochHeader（内含 config 为 LlmCallConfig） | dsh-session 包内 lib/types/index.d.ts；dsh-llm 包内 lib/types/call-config.d.ts | 沿 parentSession 上溯顶层主会话 provider/model；planner 与非 planner True fallback 必须验证该 route，非 planner False 只对该 provider 做 advisory listModels | 返回值形状或 config 位置变化即继承/严格 fallback 取不到值 | 【已核实】 |
| SD10 plugins/dsh-extra-plan/lib/agent-session.js L14-18（sessionEvents → session.snapshotEvents(fromSeq, toSeqExclusive)） | Session.snapshotEvents(fromSeq, toSeqExclusive) | dsh-session 包内 lib/types/index.d.ts | 读取会话事件快照（已弃用 events getter） | 方法签名变化即读取失败 | 【已核实】 |

| SD12 plugins/dsh-extra-plan/index.js L1659（agent.session.append 写 sandbox/mode） | Session.append(type, data) 与 sandbox/mode 事件负载（mode 与 source） | dsh-session 包内 lib/types/index.d.ts；dsh-sandbox-policy 包内 lib/types/session-mode.d.ts | 为委派子会话写沙箱下限（本插件唯一一次会话事件写入） | append 签名或事件键与负载变化即写入失败或被忽略 | 【已核实】 |
| SD15 plugins/dsh-extra-plan/lib/model-routing.js probePlannerRoute L206-247 与 planner/非 planner resolver（llm.listModels(provider)） | llm（服务名）+ listModels(provider) 返回 LlmModelInfo 数组 | dsh-llm 包内 lib/index.js（签名目录 dsh-tool-cordis 包内 lib/index.js） | planner False 保留父 provider advisory；非 planner False 只查顶层主会话 provider；True 按角色逐 provider 精确匹配后进入真实 probe | 服务名或返回项形状变化即列表为空/候选集合变化 | 【已核实】 |
| SD14 plugins/dsh-extra-plan/lib/model-routing.js agentFromRegistry L54-57 与 resolveAgentRouteSources L60-85（agents.get(parentSession)） | agents（服务名）+ get(id 为 SessionId) | dsh-agent 包内 lib/index.js | 判断父会话是否仍存活并上溯顶层主会话 route | 服务名或 get 语义变化即存活判定失效或 fallback 取错 | 【已核实】 |

| SD16 plugins/dsh-extra-plan/index.js L1614-L1643（ctx.effect 内 agentPresets.resolve（L1617）与 skills.register（L1627）） | agentPresets（服务名）+ resolve(id) 返回 AgentPreset；skills（服务名）+ register(definition) | dsh-agent-presets 包内 lib/index.js 与 lib/types/preset.d.ts；dsh-skill 包内 lib/index.js 与 lib/types/index.d.ts | 据 AgentPreset.path 的目录名注册官方 skills | 服务名、注册形状或 SkillRegistration 字段变化即 skills 注册失败 | 【已核实】 |
| SD17 plugins/dsh-extra-plan/index.js L1614（ctx.effect 生命周期绑定） | ctx.effect(callback)（cordis 插件生命周期 API） | cordis 包内 lib/index.js | 把 skills 注册等副作用绑定到当前 fiber，随插件销毁回收 | effect 语义变化即副作用泄漏或提前回收 | 【已核实】 |
| SD18 plugins/dsh-extra-plan/index.js L1571-L1589（toolSchemasOf 取 tools.schemas(agent)，调用在 L1584） | tools（服务名，经 agent.ctx.get 取）+ schemas(scope) 返回 ToolSchema 数组 | dsh-tools 包内 lib/index.js（签名目录 dsh-tool-cordis 包内 lib/index.js） | 取当前作用域可见工具清单用于引导收窄 | 返回形状或作用域解析变化即收窄失效 | 【已核实】 |
| SD19 plugins/dsh-extra-plan/lib/save-tool-factories.js L7-192 工具定义面（parameters 与 output.schema 与 render 与 execute）；注册点 index.js L1688-L1722(registerTool)/L1725(registerSavePlan)/L1729(registerSaveProbe) | ToolRuntime.register(definition) 返回 disposer；restrict(filter)；ToolDefinition 与 ToolOutputDefinition 形状 | dsh-tools 包内 lib/index.js 与 lib/types/index.d.ts | 注册 save_probe 与 save_plan 两个工具（未用 restrict、未接 disposer） | 定义形状（render 与 execute 签名）变化即工具不可用 | 【已核实】 |
| SD19b plugins/dsh-extra-plan/index.js L1702-L1721（registerTool catch 的 A/B/C 失败分类与 registered.add 终态标记） | ToolRuntime.register(definition) 的抛错形态：TypeError（output.render 缺失，宿主 register L2777）、TypeError（timeoutMs 非法，L2780）、JsonSchemaError（name=JsonSchemaError、code=UNSUPPORTED_SCHEMA、文案 unsupported JSON schema: ...，assertSupportedJsonSchema L325）、Error（tool name "run_code" is reserved，L2781）、Error（重名：scope 未定义时 tool "X" is already registered ...，有 scope 时为 tool "X" is already registered in this scope，ToolLayer duplicateError L2538 经 NamedEntries.insert dsh-scope L29 同步抛错） | dsh-tools 包内 lib/index.js 与 lib/types/index.d.ts；dsh-scope 包内 lib/index.js | 分类判据：message 含 already registered → A 重名（工具已存在，记终态不重试）；error.name 为 JsonSchemaError/TypeError 或 message 含 is reserved → B 永久性（记终态不重试）；其余（含 tools 服务未就绪与 factory 抛错）→ C 可重试（不写标记，下一步重试） | 宿主抛错文案或错误 name 改名即 A/B/C 判定漂移，失败路径退回静默重试或永久空转 | 【已核实】 |
| SD20 plugins/dsh-extra-plan/lib/save-tool-factories.js L42-43（execute(args, exec) 取 exec.agent.session 与 session.header.cwd） | ToolRunContext 与 SessionHeader.cwd | dsh-tools 包内 lib/types/index.d.ts；dsh-session 包内 lib/types/types.d.ts | 工具执行期取会话工作区路径与 agent 上下文 | cwd 字段改名或缺失即工具拒绝执行 | 【已核实】 |
| SD21 plugins/dsh-extra-plan/lib/save-tool-factories.js L170-L171（save_probe 同形取 cwd） | SessionHeader.cwd（会话工作区路径） | dsh-session 包内 lib/types/types.d.ts | 落盘路径基准（线索与方案文件所在工作区） | 字段缺失即落盘不可用 | 【已核实】 |
| SD22 plugins/dsh-extra-plan/index.js L1901-L2001（assemble 钩子；返回 sections/contexts/tools 在 L1988-L2000） | PromptAssembly（sections 与 contexts 与 tools 与 variables）+ AssembledSection（name 与 text） | dsh-system-prompt 包内 lib/types/index.d.ts | 以 extra-plan-bootstrap 段注入引导内容 | 结构变化即引导段被丢弃或渲染异常 | 【已核实】 |
| SD23 plugins/dsh-extra-plan/index.js L1791-L1814（PreStepDecision；kind !== 'enter' 直接返回在 L1802） | PreStepDecision（kind 为 reject 或 enter，enter 带 messages 与 startsRequestSeries） | dsh-agent 包内 lib/types/runtime-types.d.ts | 决定本轮是否进入请求序列并收窄 messages | 取值域变化即引导逻辑失效 | 【已核实】 |
| SD24 plugins/dsh-extra-plan/index.js L2096-L2253（PreToolDecision 与拒绝文案；deny 在 L2239、放行在 L2251） | PreToolDecision（kind 为 allow 或 deny 或 ask） | dsh-tools 包内 lib/types/index.d.ts | 闸门放行与拒绝与追问三态输出 | 取值域变化即闸门行为异常 | 【已核实】 |
| SD25 plugins/dsh-extra-plan/index.js L2096-L2253（exec 字段使用与瀑布链 next） | tools/pre-execute 的 exec 契约（callId 与 rootCallId 与 name 与 arguments 与 agent 与 parent 与 signal 与 token）与瀑布链 next() | dsh-tool-cordis 包内 lib/index.js（钩子签名目录）；dsh-tools 包内 lib/types/index.d.ts | 闸门读取调用上下文并串联其他插件的 pre-execute 钩子 | 字段增删或 next 语义变化即闸门误判 | 【已核实】 |
| SD26 plugins/dsh-extra-plan/index.js 七个钩子的事件主体解析依赖 | scoped 事件到路由 subject 的解析表（tools/pre-execute 取第一个参数的 agent；system-prompt/assemble 取第二个参数的 scope） | dsh-scope 包内 lib/invariant.js | 决定 payload.agent 与 context.scope 是否注入到本插件的钩子回调 | 映射表变化即 payload.agent 或 scope 变为 undefined | 【已核实】 |
| SD27 plugins/dsh-extra-plan/index.js agent/request listener（返回值改写与力度抑制） | LlmCallConfig（provider 与 model 与 reasoningEffort 与 temperature 与 maxTokens 与 stop） | dsh-llm 包内 lib/types/call-config.d.ts | planner 只注入 plannerModel；非 planner 显式 route 优先，未显式时注入 otherAgentModel 或顶层主会话 fallback，并保留 maxTokens/reasoningEffort 继承 | 字段改名或校验收紧即请求构造失败 | 【已核实】 |
| SD28 plugins/dsh-extra-plan/index.js L1460-L1541（foldUsage 内 usage 字段累加，类型字段读取在 L1489-L1493） | TokenUsage（inputTokens 与 outputTokens 与 totalTokens 与 cacheReadTokens 与 cacheWriteTokens 与 reasoningTokens） | dsh-llm 包内 lib/types/types.d.ts | usage 账本按类型累加（缺失键按 0 计） | 字段改名即账本数值归零 | 【已核实】 |
| SD29 plugins/dsh-extra-plan/index.js L701-L728（toolCallCount）与 L713（tool-result 块级 isError 判定） | ToolResultBlock（type 为 tool-result 与 toolCallId 与 content 与 isError） | dsh-llm 包内 lib/types/types.d.ts | 解析工具结果内容块（排除被拒调用） | 内容块形状变化即解析失败 | 【已核实】 |
| SD30 plugins/dsh-extra-plan/index.js 工具注册与 schemas 消费（ToolSchema） | ToolSchema（name 与 description 与 parameters） | dsh-llm 包内 lib/types/types.d.ts | 工具入参与出参 schema 声明 | 形状变化即 schema 校验失败 | 【已核实】 |
| SD31 plugins/dsh-extra-plan/index.js L1901-L1903 上下文消费（AssembleContext：context.agent 判定会话角色） | AssembleContext（scope 与 signal）+ dsh-agent 对它的 agent 模块增强 | dsh-system-prompt 包内 lib/types/index.d.ts；dsh-agent 包内 lib/types/runtime-types.d.ts | 从 assemble 上下文取 agent 判定会话角色 | 增强字段被移除即 context.agent 为 undefined | 【已核实】 |
| SD32 plugins/dsh-extra-plan/index.js L102（CHANNEL_BROKEN_CODES 白名单）与 L585-L692（deriveFlowState 错误码分支） | ask_user_question 错误码全集（CALLER_NOT_LIVE 与 DELEGATED_CALLER 与 BAD_INTENT 与 NO_PROVIDER 与 ASK_ABORTED 与 EMPTY_QUESTIONS） | dsh-user-questions 包内 lib/types/index.js | 通道逃生白名单依据（据错误码判定是否放行替代通道） | 错误码增删改名即逃生判定漂移 | 【已核实】 |
| SD36 plugins/dsh-extra-plan/index.js L1552-L1566（isPlannerChild 按 subagent/descriptor.mode 判定）与 L1739-L1755（probeClaimFor 认领判定） | backgroundMode 到 descriptor.mode 的映射（continuable/one-shot） | dsh-tool-subagent 包内 lib/index.js | 按 subagent/descriptor.mode 区分可续轮规划者与 one-shot；当前版本不再依赖「started subagent <id>」结果文本（全仓 0 命中） | 文本格式或映射变化即识别失败 | 【已核实】 |
| SD37 plugins/dsh-extra-plan/index.js budgetReminderMessage（createUserMessage 构造，L795-L796）+ L1725 使用点 | createUserMessage（dsh-llm 导出：返回 {source,content,role:'user',id}，id=brandString(randomUUID())） | dsh-llm 包内 lib/types/message.js（经 lib/index.js 导出） | 会话内注入的 user/message 身份字段（id/role）必须由宿主构造器给出，手拼消息缺 id/role 会被会话判损坏，预算提醒经此构造 | createUserMessage 签名/字段变化或 user/message 身份校验收紧即注入失效 | 【已核实】 |
| SD38 pe-test/tools/step-07-子代理模型与引导取证.mjs（显式 SESSION_ID，只读） | SessionHeader.parentSession/origin/delegationDepth；subagent/descriptor.mode；request/header、request/context、model/selection、assistant/message.source | dsh-session-persistence-jsonl、dsh-session、dsh-subagent、dsh-agent-loop、dsh-llm 包内对应类型/事件 | A42/A43 取证：直接 child 谱系只分 pro规划/非pro规划；request/header/config 与 request/context 是 attempted route，assistant/message source.kind=model 是 actual provenance；planner 首个 user/agent-message text 与父 subagent_plan prompt 用于 suffix 等级 | 事件名、字段路径、两代日志文件名或消息 source 形状变化即 step-07 取证失真；不能以配置候选、header.system、候选 probe 或 provider/model 猜角色 | 【已核实】 |
| SD35 plugins/dsh-extra-plan/index.js L1688-L1722（工具注册面：registerTool 成功路径写标记 + 分类 A/B 终态标记）与 L1724（savePlanRegistered WeakSet 声明）与 assets/presets/extra-plan/agent.cordis.yml 四行 toolFilter.deny（deny 名单对齐） | 宿主内置工具名清单（deny 名单取值来源） | dsh-tools 包内 lib/index.js；dsh-tool-subagent 包内 lib/index.js | 预设 toolFilter.deny 必须与宿主实际注册工具名一致 | 宿主工具改名即 restrict 抛错或裁剪失效 | 【已核实】 |
| SD33 pe-test/tools/step-04-路由与写闸门.mjs L44-L54（按 profile node_modules 锚点取 js-yaml）；pe-test/_shared/host-deps.mjs（解析钩子，同锚点取 @deepseek-ai/dsh-llm） | profile 依赖布局 profiles/web/node_modules + 宿主包名 @deepseek-ai/dsh | dsh-app-boot 包内 lib/index.js；dsh-home-paths 包内 lib/index.js | 按 profile 解析目录锚点解析 YAML 库 | profile 布局改名或安装路径变化即解析失败 | 【已核实】 |
| SD34 plugins/dsh-extra-plan/index.js 全文 0 处调用（反向记录：未使用的宿主面） | sessionProjections 的 stateOf(session, sandboxMode)（宿主内部实现，本插件不直接调用） | dsh-sandbox-policy 包内 lib/index.js | 记录：沙箱模式一律走 sandboxPolicy.overrideOf，不直连投影服务 | 若宿主移除 overrideOf 而只留 stateOf，插件需改道（见⑥） | 【已核实】 |
> 本轮新增取证域：A42/A43、C11/C12 由 `pe-test/tools/step-07-子代理模型与引导取证.mjs` 承担，命令必须显式 `SESSION_ID` + `PLANNER_PROMPT_SUFFIX`，不自动猜会话、不发 Provider 请求；模型配置 snapshot 与实际 route/provenance 分栏，完整文本不截断。
> PROBE_LIMITS 当前 evidence 上限为 150 条、单条 evidence.text 上限为 1000 字；step-00 PR23=151、PR34/PR35 固化边界。此处与台账历史 evidence「80 条」「80+79+50=209」分属不同口径，后者保持原文；exploreBudget=18 仅是 planner 预算；根 `dsh-extra-plan/README.md` 不改，otherAgentModel 缺口由用户自行同步。

### ③-D 安装配置面（包元数据与安装期解析，共 12 条）

归层原则：package.json 的 dsh.bundle 与 dsh.client 与 exports 与 postinstall 与依赖声明、DSH_HOME 解析、安装路径回退、预设元数据。

| 本仓库位置(文件+符号+行号) | 宿主符号(逐字) | 宿主包+包内相对路径 | 用途 | 升级敏感点 | 核实状态 |
|:--|:--|:--|:--|:--|:--|
| CF1 plugins/dsh-extra-plan/package.json L25 postinstall（node scripts/distribute-preset.mjs） | 安装期依赖脚本执行（dsh plugin add 转发 pnpm 执行 postinstall） | dsh 包内 package.json 与包内 lib/bin.js（plugin 子命令转发 pnpm） | 安装与更新后一次性把预设分发到 DSH_HOME/.agent-presets/extra-plan | 本包无 allow-build 字段，宿主或 pnpm 默认禁 build scripts 即分发静默跳过 | 【已核实】 |
| CF2 plugins/dsh-extra-plan/scripts/distribute-preset.mjs L18 与 L31-39 | DSH_HOME 环境变量（env 优先，否则用户主目录下 .dsh） | dsh-home-paths 包内 lib/index.js；dsh 包内 package.json | postinstall 入口解析 DSH_HOME 后委派 syncPreset（失败不阻断并以 0 退出） | home 解析规则变化即分发到错误目录 | 【已核实】 |
| CF4 plugins/dsh-extra-plan/package.json L29-32 dsh.bundle.patch | dsh.bundle.patch（缺失抛 declares no dsh.bundle） | dsh 包内 package.json；读取点 dsh-app-boot 包内 lib/index.js | 声明本包为可直接叠层的 profile bundle | 字段改名或路径基准变化即 patch 不加载、启动报错 | 【已核实】 |
| CF5 plugins/dsh-extra-plan/package.json L33-41 dsh.client（platform 与 inject） | dsh.client.platform（值域 web）与 dsh.client.inject（模块图依赖顺序） | dsh-client-modules 包内 lib/index.js 与 lib/client.js | 声明浏览器半 bundle 与依赖先行装载 | platform 非 web 或 inject 形状变化即前端被跳过 | 【已核实】 |
| CF6 plugins/dsh-extra-plan/package.json L7-16 exports（含 settings 与 preset-sync 与 client 与 client-bridge） | exports 子路径解析（branded 行与客户端 bundle 必需的 ./client） | dsh-app-boot 包内 lib/index.js；dsh-client-modules 包内 lib/index.js | 宿主平面行与客户端 bundle 的解析入口 | exports 规则或必需条目口径变化即解析失败 | 【已核实】 |
| CF8 plugins/dsh-extra-plan/package.json L43-46 js-yaml 依赖 | js-yaml 依赖（宿主 dsh 包 dependencies 同款 ^4.2.0） | dsh 包内 package.json 与包内 node_modules/js-yaml | 本地解析 YAML，失败时回退宿主安装目录同名依赖 | 宿主移除该依赖或换 YAML 库即回退断裂 | 【已核实】 |
| CF7 pe-test/tools/step-01-设置页配置.mjs L11-28 与 L29-39 | 宿主安装目录解析（AppData 下 npm 全局 node_modules 的 @deepseek-ai/dsh）+ 依赖 @deepseek-ai/schemastery | dsh 包内 package.json；包内 node_modules/@deepseek-ai/schemastery | 回归脚本从宿主安装包解析 js-yaml 与 schemastery 后跑真实 apply 与 loopback HTTP | 安装前缀或宿主依赖清单变化即脚本不可用 | 【已核实】 |
| CF11 pe-test/tools/step-01-qqbot-安装映射.mjs L104 与 L41-53 与 L75 | 宿主安装目录解析取 js-yaml + DSH_HOME 注入 + profiles 下 node_modules/@local 夹具 | dsh 包内 package.json；dsh-home-paths 包内 lib/index.js | qqbot 侧回归的解析与夹具基础 | 安装前缀或 profile 布局变化即夹具失真 | 【已核实】 |
| CF12 plugins/dsh-extra-plan/package.json L44（dependencies @deepseek-ai/dsh-llm ^0.1.5-rc.2） | 宿主同名依赖解析（与 CF8 的 js-yaml 同款口径） | dsh 包内 node_modules/@deepseek-ai/dsh-llm（本机实测存在） | index.js L1354 顶层静态 import createUserMessage | 宿主移除/改名该依赖或 exports 变化即解析失败、自检报错 | 【已核实】 |
| CF9 pe-test/tools/step-01-安装分发.mjs 与 step-01-安装同步.mjs 与 step-01-设置迁移.mjs | DSH_HOME 布局与 profiles 下 profile 目录形状（临时夹具） | dsh-home-paths 包内 lib/index.js；dsh-app-boot 包内 lib/index.js | 临时 DSH_HOME 下回归分发与自愈与迁移状态机 | profile 布局变化即夹具与真实形状脱节 | 【已核实】 |
| CF10 plugins/dsh-extra-plan/assets/presets/extra-plan/preset.yml L1-L2（name 与 description） | METADATA_FILE 契约（支持 name 与 description 与 order） | dsh-agent-presets 包内 lib/index.js | 预设显示元数据（预设列表展示名与描述） | 元数据契约变化即预设列表缺名或排序异常 | 【已核实】 |
| CF3 plugins/dsh-extra-plan/lib/settings.js L26-30 与 preset-sync.js L282-285 与 distribute-preset.mjs L31-33（三处自实现 DSH_HOME 解析） | DSH_HOME_ENV 与 DSH_HOME_DIR_NAME（.dsh）与 resolveDshHome | dsh-home-paths 包内 lib/index.js | 三处按同口径自实现解析 DSH_HOME（非 API 调用，属约定耦合） | 宿主改环境变量名或默认目录即三处同时错位 | 【已核实】 |

### ③-E 证据勾销表（209 条 evidence 逐条去向）

报告 A、B、C 的每一条 evidence 都落到下面某个条目编号（或落进②覆盖总表对应文件的挂钩条目）。看表的顺序：先读②覆盖总表定位「这条 evidence 属于哪个文件、落到哪个条目编号」，再用本表的段落索引快速跳转；本表按报告内的证据顺序分段，用于确认 209 条证据全部有去向、没有整段遗漏。

| 证据段（按报告内顺序） | 条数 | 归属条目编号 |
|:--|:--|:--|
| 报告 A（index.js 全文）证据 1-12（插件契约与 7 钩子注册） | 12 | HK1-HK10 |
| 报告 A 证据 13-17（服务读取面与 ctx.effect 生命周期） | 5 | HS1、HS5、HS17、SD13-SD17 |
| 报告 A 证据 18-31（子代理/沙箱下限、会话事件读取、用量账本、续轮转达） | 14 | SD3、SD4、SD5、SD6、SD9、SD12、SD20、SD21、SD22、SD27、HK9、HK21、HK22 |
| 报告 A 证据 32-42（工具注册面、deny 与闸门 exec 契约、ask_user_question 错误码、工具名清单） | 11 | HS17、SD18、SD19、SD25、SD26、SD32、SD36 |
| 报告 A 证据 43-50（宿主钩子签名目录与 7 钩子 mode） | 8 | HK2、HK3、HK4、HK5、HK6、HK7、HK8、HK10 |
| 报告 A 证据 51-55（sandboxPolicy、agents、llm、agentPresets、skills 服务方法签名） | 5 | HS1-HS5、SD13、SD14、SD16、SD17 |
| 报告 A 证据 56-69（会话事件负载类型与 Session 方法、SessionHeader、TokenUsage、ToolResultBlock） | 14 | SD1、SD3、SD4、SD5、SD7、SD8、SD10、SD11、SD12、SD20、SD23、SD28、SD29、SD30、SD31、SD32 |
| 报告 A 证据 70-80（agent 融合、事件派发点、tool-jobs 通知、子代理文本、scope 解析表、code-dispatch 不变量） | 11 | HK1、HK7、HK8、HK9、HK10、HK21、SD7、SD17、SD24、SD26、SD31、SD35 |
| 报告 B 证据 1-21（settings、preset-sync、preset-settings、executor-spawn、client 与 client-bridge） | 21 | HS1、HS2、HS3、HS4、HS5、HS6、HS7、HS8、HS9、HS10、HS11、HS12、HS13、HS14、HS15、HS16、HS17、HS18、HS19、HS20、HS21、HS22、HS23、HS24、HS25、HK14、HK16、HK22、SD2 |
| 报告 B 证据 22-29（发行脚本、package.json、cordis.patch.yml、预设模板、preset.yml、dist-manifest、session-finder、zstd-frames） | 8 | HK11、HK12、HK13、HK14、HK15、HK16、HK17、HK18、HK19、HK24、SD1、SD2、CF1、CF2、CF3、CF4、CF5、CF6、CF7、CF10 |
| 报告 B 证据 30-41（宿主图形/设置/渲染/主题/应用启动/预设/首页路径/工具子代理/网页服务器/客户端模块等服务与常量） | 12 | HS1、HS2、HS3、HS4、HS5、HS6、HS7、HS8、HS9、HS10、HS11、HS12、HS13、SD13、SD14、SD15、SD16、SD17、SD18、SD19、SD20、SD21、SD22 |
| 报告 B 证据 42-58（宿主模块解析、locale、设置页卡片、CSS 类名、profile patch 引擎、bundle patch 加载、锚定行名、dshHomePath、隔离域、预设默认值与 schema、注入行名与插件行名等） | 17 | HK11、HK13、HK14、HK15、HK16、HK20、HK21、HK22、HS5、HS6、HS7、HS17、HS18、HS19、HS20、HS21、HS22、SD33、SD34、SD36、CF7、CF9、CF11 |
| 报告 B 证据 59-79（客户端模块声明/路径锚定与平台校验、校验与设置命名空间、子代理提供者与能力、spawn 提供者、会话日志布局与压缩、主题 token、executor-spawn 注释过期项等） | 21 | HK10、HK13、HK19、HK23、HK24、HS8、HS9、HS10、HS11、HS12、HS13、HS14、HS15、HS16、SD1、SD2、SD35、CF2、CF3、CF4、CF5、CF6、CF7、CF8、CF9 |
| 报告 C 证据 1-24（qqbot 插件入口、heal 自愈全链、patch 四行、package.json 契约） | 24 | QB1-QB5、QB9-QB23 |
| 报告 C 证据 25-41（README/READAI 声明面、维护手册边界、概览声明、回归用例断言、本机 profile 反证） | 17 | QB6-QB8、QB12、QB19、QB24-QB27 |
| 报告 C 证据 42-50（宿主 app-boot 与 agent-presets 与 cordis-host-runner 与 CLI 实证，含已删除耦合 4 处） | 9 | QB13-QB18、QB20-QB21、④-B 四处历史耦合 |

说明：本仓 assets/presets/extra-plan/dist-manifest.json 的 format 与 distHash 字段为【本项目自造格式，非宿主契约】（format 1 与 2 均由本仓库定义），宿主升级不比对该文件，故不入四层表。
## ④ QQBOT 专章（qqbot 兼容插件与 qqbot 宿主耦合）


### ④-A 活跃挂钩表（qqbot 简化插件对 DSH 宿主与 qqbot 宿主的现行耦合，共 27 条）

| 本仓库位置(文件+符号+行号) | 宿主符号(逐字) | 宿主包+包内相对路径 | 用途 | 升级敏感点 | 核实状态 |
|:--|:--|:--|:--|:--|:--|
| plugins/dsh-qqbot-user-questions/index.js L13（inject 为空数组） | cordis 插件契约 inject（空依赖即可加载） | cordis 包内 lib/index.js（宿主依赖 @deepseek-ai/cordis ^4.0.2） | 不等待任何服务即可加载（对比旧版注入 qqbot 服务名） | cordis 改 inject 语义或 apply 签名即插件加载失败 | 【已核实】 |
| plugins/dsh-qqbot-user-questions/index.js L18 与 scripts/heal.mjs L17 | 环境变量 DSH_HOME（默认用户主目录下 .dsh） | dsh-home-paths 包内 lib/index.js | 定位 profiles 根目录（两处字面量必须同改） | 宿主改 home 解析规则或新增变量即自愈扫错目录 | 【已核实】 |
| plugins/dsh-qqbot-user-questions/index.js L19-L23（apply 内调用 healQqbotCompatibility） | bundle patch 生成的 profile 行加载时调用 cordis apply() | dsh-app-boot 包内 lib/index.js | DSH 启动即触发幂等自愈（静默、try 与 catch 不阻断） | 宿主改插件加载方式即 apply 不被调用 | 【已核实】 |
| plugins/dsh-qqbot-user-questions/index.js L7（问答/审批能力声明：问答与审批能力已删，由 dsh-qqbot 0.5.0 原生 question-channel/approval-channel 承担） | question-channel 与 approval-channel | qqbot 宿主包 dsh-qqbot 的 package.json（@tencent-connect 作用域，非 DSH 宿主） | 声明问答与审批能力由 qqbot 宿主原生承担，本插件不实现 | qqbot 改名或移除这两个 channel 即能力声明空洞 | 【未核实】 |
| plugins/dsh-qqbot-user-questions/lib/heal.js L28（createRequire 锚定宿主安装包取 js-yaml） | 宿主安装包路径 @deepseek-ai/dsh 的 package.json 与其依赖 js-yaml | dsh 包内 package.json 与包内 node_modules/js-yaml | 本机无 js-yaml 时借 DSH 自带解析 YAML（失败退回行级兜底解析） | 宿主移除 js-yaml 依赖或 npm 全局前缀不是 AppData 下 npm 即回退断裂 | 【已核实】 |
| plugins/dsh-qqbot-user-questions/lib/heal.js L44-L54 LEGACY_ROOT_ENTRIES（code-runtime 块） | 包名 @deepseek-ai/dsh-code-runtime-worker-thread | dsh-code-runtime-worker-thread 包内 package.json（本机安装内该包存在） | 识别旧版错误根级块（按 id 与 name 逐字匹配） | 宿主换代码执行实现包名即迁移匹配失效、旧块残留 | 【已核实】 |
| plugins/dsh-qqbot-user-questions/lib/heal.js L50-L53 LEGACY_ROOT_ENTRIES（agent-presets 块） | 包名 @deepseek-ai/dsh-agent-presets 与 config.default 取值 standard | dsh-agent-presets 包内 lib/index.js | 识别旧版错误根级块（按 id 与 name 与 config.default 三重匹配） | 该包改名或旧默认值不再是 standard 即旧块残留 | 【已核实】 |
| plugins/dsh-qqbot-user-questions/lib/heal.js L288-L306（锚定条件①读 dsh.profile.bundles） | dsh.profile.bundles（profile manifest 字段） | dsh-app-boot 包内 lib/index.js（读 manifest 下 dsh.profile.bundles） | qqbot profile 锚定条件①（判断 bundles 是否含 @tencent-connect/dsh-qqbot） | 宿主改字段位置或命名即锚定恒不命中、自愈全跳过 | 【已核实】 |
| plugins/dsh-qqbot-user-questions/lib/heal.js L307（锚定条件②查 profile 内 node_modules/@local） | profile 内 node_modules/@local 布局（@local 为本仓库约定作用域） | dsh-app-boot 包内 lib/index.js；本机 profiles/web/node_modules/@local/dsh-extra-plan 实测存在 | 锚定条件②（确认本插件装在该 profile，两条件同时满足才自愈） | 宿主或 pnpm 改落盘位置（虚拟 store 或回退目录）即锚定失败 | 【已核实】 |
| plugins/dsh-qqbot-user-questions/lib/heal.js L322（建链源为 web profile 下的核心包目录） | profiles/web/node_modules/@local/dsh-extra-plan（web profile 包落点） | dsh-app-boot 包内 lib/index.js；本机该目录实测存在（实体目录） | 建链源：qqbot 复用 web 核心包而不自己分发 | web profile 名或布局变化、核心包改名即源缺失、跳过建链 | 【已核实】 |
| plugins/dsh-qqbot-user-questions/lib/heal.js L343（symlinkSync 建 junction） | PROFILE_MODULE_FALLBACK_DIR（.dsh-module-fallback）与本机 profiles/web/.dsh-module-fallback 目录 | dsh-app-boot 包内 lib/index.js；本机该目录实测存在 | 目标缺失时建 @local/dsh-extra-plan 到 web 包的链接（win32 用 junction） | 宿主自建回退目录接管该路径即两套机制冲突；非 Windows 用目录符号链接、权限受限会失败（仅日志、不阻断） | 【已核实】 |
| plugins/dsh-qqbot-user-questions/lib/heal.js L247（拼接 profile 下 cordis.patch.yml） | PROFILE_PATCH_FILENAME（profile 用户层 patch 文件名） | dsh-app-boot 包内 lib/index.js | 迁移旧版错误块（写前备份、写后 YAML 校验失败恢复原文） | 宿主改文件名或用户层文件名即迁移失效 | 【已核实】 |
| plugins/dsh-qqbot-user-questions/lib/heal.js L260-L283（重写 profile patch 并校验） | AgentPresetSettingsSchema（default 为 string）与 settings 命名空间 agent-presets 与 base 注入 | dsh-agent-presets 包内 lib/index.js | 自愈只改 setup 相关行、不碰用户自定义行（与宿主默认预设机制对齐） | 宿主 schema 改必填或换类型即相关 patch 行报错或静默忽略 | 【已核实】 |
| plugins/dsh-qqbot-user-questions/cordis.patch.yml（单一根级 insert 下四行） | patch 顶层数组 insert（无 id 即追加到根条目列表） | dsh-app-boot 包内 lib/index.js | 把 4 行注入 qqbot profile 的 cordis 树 | 宿主改 patch 语义（如 insert 必须带 id）即 4 行不注入、被 warn 跳过 | 【已核实】 |
| plugins/dsh-qqbot-user-questions/cordis.patch.yml（本插件行 id 与 name） | 插件行 id 与 name（name 必须与本包 package.json 的 name 逐字一致） | dsh-app-boot 包内 lib/index.js | 让宿主加载本插件 apply() | 任一处字面量漂移即解析不到包 | 【已核实】 |
| plugins/dsh-qqbot-user-questions/cordis.patch.yml（code-runtime 行） | 包名 @deepseek-ai/dsh-code-runtime-worker-thread | dsh-code-runtime-worker-thread 包内 package.json（本机安装内该包存在） | qqbot profile 补齐代码执行运行时（run_code 依赖） | 宿主重命名或替换该包即行解析失败、run_code 不可用 | 【已核实】 |
| plugins/dsh-qqbot-user-questions/cordis.patch.yml（agent-presets 行 config.default 为 extra-plan） | 包名 @deepseek-ai/dsh-agent-presets 与 config.default 与用户预设目录 .agent-presets | dsh-agent-presets 包内 lib/index.js；本机 DSH_HOME 下 .agent-presets/extra-plan 实测存在 | qqbot 会话默认挂 extra-plan 预设 | 宿主改 config 键名或 schema 非 string、用户预设目录改名即预设不生效 | 【已核实】 |
| plugins/dsh-qqbot-user-questions/cordis.patch.yml（cordis-host-runner 行） | 包名 @deepseek-ai/dsh-cordis-host-runner 与服务 cordisInspect 与 dynamicCordisRunner | dsh-cordis-host-runner 包内 lib/index.js（本机安装内该包存在） | 补齐 qqbot 宿主平面两个服务，否则预设 tool-cordis 行恒 pending、预设挂载失败 | 宿主改服务名或并入别处或改包名即预设挂载失败 | 【已核实】 |
| plugins/dsh-qqbot-user-questions/package.json L21-24 dsh.bundle.patch | dsh.bundle.patch（缺失抛 declares no dsh.bundle） | dsh 包内 package.json；读取点 dsh-app-boot 包内 lib/index.js | 宿主据此把本包当 profile bundle 叠层 | 字段名或路径解析基准变化即 patch 不加载、启动报错 | 【已核实】 |
| plugins/dsh-qqbot-user-questions/package.json L19 postinstall（node scripts/heal.mjs） | dsh plugin 子命令转发 pnpm 执行依赖 postinstall（README 用 allow-build 参数放行） | dsh 包内 lib/bin.js | 安装即自愈（早于启动；启动时 apply 为兜底） | pnpm 或宿主默认禁 build scripts 即静默跳过；宿主改参数透传即失效 | 【已核实】 |
| plugins/dsh-qqbot-user-questions/scripts/heal.mjs L24（异常也以退出码 0 结束） | postinstall 退出码语义（非 0 会让 pnpm 安装失败） | dsh 包内 lib/bin.js（plugin 子命令转发 pnpm） | 自愈异常也不阻断安装 | 宿主或 pnpm 把非零退出升级为硬失败即该设计前提变化 | 【已核实】 |
| README.md L38-L43 与 L55-L57（dsh plugin 带 profile 参数的 add 与 remove） | dsh plugin 子命令与 --profile 选项（转发 pnpm、profile 首次使用时初始化） | dsh 包内 lib/bin.js | qqbot 兼容插件安装与卸载入口（先 remove 核心包再 add） | 子命令改名或不再转发 pnpm 或 profile 语义变即 README 命令全部失效 | 【已核实】 |
| README.md L46（qqbot 下用 /preset 切换预设） | qqbot 侧 /preset 预设法（由 dsh-agent-presets 提供，config.default 决定默认） | dsh-agent-presets 包内 lib/index.js | 告知用户在 qqbot 内切换预设 | 宿主改命令名或 qqbot 宿主平面未挂 agent-presets 即用法失效 | 【未核实】 |
| pe-test/tools/step-01-qqbot-安装映射.mjs L124-L161（静态 patch 断言与真机同形 fixture） | 真实 qqbot profile 的 cordis.patch.yml 中 qqbot 本体行（id 为 im-qqbot、name 为 @tencent-connect/dsh-qqbot） | qqbot 宿主包 dsh-qqbot 的 package.json（@tencent-connect 作用域，非 DSH 宿主） | 回归 fixture 确保 heal 只删旧错误块、保留 im-qqbot 行与用户自定义行 | qqbot 改 id 或包名即 fixture 与真实环境脱节 | 【未核实】 |
| pe-test/tools/step-01-qqbot-安装映射.mjs L143-L144 与 L159（patch 第四行理由与 config.default 断言） | 服务 cordisInspect 与 dynamicCordisRunner；config.default 严格为 extra-plan | dsh-cordis-host-runner 包内 lib/index.js；dsh-agent-presets 包内 lib/index.js | 把宿主侧服务名与 config.default 取值固化成回归门槛 | 宿主服务改名即断言失效；该断言只测字面量，宿主 schema 改名后仍会通过（需人工比对宿主 schema） | 【已核实】 |
| plugins/dsh-extra-plan/assets/presets/extra-plan/agent.cordis.yml（qqbot 间接消费路径） | agent-presets 的 config.default 与用户预设目录 .agent-presets | dsh-agent-presets 包内 lib/index.js | qqbot 只通过 agent-presets 的默认预设间接消费本仓预设（不自带预设） | 宿主改默认预设机制或目录名即 qqbot 侧无预设可用 | 【已核实】 |
| pe-test/tools/一键step测试.mjs（已把 qqbot 用例纳入一键体检、required 为 true） | 无宿主符号（本仓库编排契约） | 无（不指向宿主包） | 升级后跑一键体检即可暴露 patch 行与建链漂移 | 与宿主无关，仅作为升级比对入口 | 【已核实】 |
### ④-B 已删除的历史耦合（4 处，当前版本均无）


1. **旧版服务名依赖（已删除，当前版本无）**——旧版 plugins/dsh-qqbot-user-questions/index.js 第 19 行为 `export const inject = ['qqbot.bot', 'qqbot.sessionManager', 'userQuestions']`，直接依赖 qqbot 包内部服务名与宿主 @deepseek-ai/dsh-user-questions。旧版还对 manager.remove 做 monkey-patch 并删除会话目录。当前 index.js 为 inject 为空数组，只做幂等自愈；对应 qqbot 包内服务名一旦随版本变化即断，正是被裁剪的原因。
2. **旧版覆盖 qqbot 包 dist 文件（已删除，当前版本无）**——旧版 postinstall 入口 scripts/apply-patch.mjs 以 `const DIST_TARGET = join(PACKAGE_ROOT, '..', '..', '@tencent-connect', 'dsh-qqbot', 'dist')` 为根，直接覆盖 qqbot 包内 gateway/bootstrap.js 与 transport/outbound.js 两个文件。当前版本已无 patches 目录与 apply-patch.mjs，改为 profile 层 patch 行与自愈。
3. **旧版改 profile 的 im-qqbot 行（已删除，当前版本无）**——旧版给 profile 的 im-qqbot 行插入 `preset: extra-plan`（config.preset 键）。当前 cordis.patch.yml 只对 agent-presets 行设 config.default 为 extra-plan，不再触碰 qqbot 本体行；旧做法在 qqbot 改 config 键名时即失效。
4. **旧版自带越权开关（已删除，当前版本无）**——旧版 cordis.patch.yml 给 qqbot-user-questions 行带 `approvalEnabled: false`（config.approvalEnabled）。当前该行已无 config 段。

### ④-C 待补核清单（恰 6 项，均【未核实】，须在装了 qqbot 的机器上执行）

> **欠账状态（2026-09-12 复核）**：本清单 6 项 + ④-A 活跃挂钩表 3 条 + 基线块 qqbot 目标版本 1 项，共 10 条仍标【未核实】，**尚未销账**；本机无 `profiles/qqbot`、无 qqbot 0.5.0 包，本机无法补核（判据：台账①基线块「DSH_HOME」行的实测备注与 `plugins/dsh-qqbot-user-questions` 未装）。

| 序号 | 待核实事项 | 补核动作（读哪个文件 / 跑哪条命令） | 核实状态 |
|:--|:--|:--|:--|
| 1 | question-channel 与 approval-channel 是否真存在于 qqbot 0.5.0（本插件的能力声明依据） | 在 qqbot 机器上读 qqbot profile 下 node_modules/@tencent-connect/dsh-qqbot 的 package.json 与包内 dist 源码，确认这两个 channel 的真实实现名 | 【未核实】 |
| 2 | qqbot profile 的 dsh.profile.bundles 是否真含 qqbot 包名（自愈锚定条件①的真实性） | 读 DSH_HOME 下 profiles/qqbot 的 package.json；并跑 dsh plugin --profile qqbot why @tencent-connect/dsh-qqbot | 【未核实】 |
| 3 | im-qqbot 行的真实形状（id 与 name 与 config 键） | 读 DSH_HOME 下 profiles/qqbot 的 cordis.patch.yml，并与 pe-test/tools/step-01-qqbot-安装映射.mjs 的 fixture（L127 构造的 im-qqbot 行）逐字比对 | 【未核实】 |
| 4 | 建链实际结果（junction 是否指向 profiles/web 下同名核心包） | 在 qqbot 机器上对 profiles/qqbot 下 node_modules/@local/dsh-extra-plan 跑 dir 或 fsutil reparsepoint query，确认 realpath 指向 profiles/web/node_modules/@local/dsh-extra-plan | 【未核实】 |
| 5 | qqbot 下 /preset 是否读到 DSH_HOME 下 .agent-presets/extra-plan | 跑 dsh --profile qqbot --dump-config 查看默认预设；或在 qqbot 会话内发 /preset 观察列表 | 【未核实】 |
| 6 | postinstall 是否真被放行（allow-build） | 执行 dsh plugin --profile qqbot add @local/dsh-qqbot-user-questions（带 allow-build 参数）后查安装日志，确认 heal.mjs 被执行 | 【未核实】 |
## ⑤ 升级比对 checklist（按序执行）

1. 先跑 `node pe-test/tools/step-01-qqbot-安装映射.mjs`——证据报告结论：升级后先跑这条，可发现 patch 行与包名漂移（含四行 patch 的包名与 config.default 断言）。
2. 跑 `node pe-test/tools/step-01-设置页配置.mjs` 与 `node pe-test/tools/step-04-路由与写闸门.mjs`——两者依赖宿主安装目录解析与 profile 布局锚点。
3. 跑 `node pe-test/tools/一键step测试.mjs`——内置代码地图一致性检查（`代码地图生成.mjs --check`，不写盘）。
4. 按③四层表逐层比对升级后的宿主包：先比 dsh-tool-cordis 包内 lib/index.js 的钩子签名目录（逐个核对本台账记下的钩子名与 mode），再比服务方法签名（settings register、webServer register、subagents getProvider 与 registerProvider、sandboxPolicy overrideOf 与 defaultMode、agentPresets resolve、skills register、llm listModels、agents get、tools register 与 schemas），再比事件负载类型（见③-C），最后比文件契约（cordis.patch.yml insert 语义、dsh.bundle.patch、exports 解析、.agent-presets 与两处 CORE 文件名、!!js dshHomePath、isolate realm 强制点）。
5. 跑 `node pe-test/tools/代码地图生成.mjs --check`，仍须退出码为 0（本仓库结构调整后由主会话执行同步写盘）。
6. 逐条复核本台账标注【未核实】的条目（④-A 活跃挂钩表 3 条 + ④-C 待补核清单 6 项，共 9 条；基线块的 qqbot 目标版本 1 项亦标【未核实】），在具备 qqbot 环境的机器上按④-C 的补核动作更新核实状态。

## ⑥ 已知漂移与口径纠正（3 处）

1. **exec.sub 不是宿主字段**——本仓库 plugins/dsh-extra-plan/lib/run-code-static.js L637-L641（isRunCodeSubCall）判断 `exec.sub === true`，但本版宿主 dsh-tools 包内 lib/types/index.d.ts 的 ToolExecution 与 ToolExecutionInput 均无 sub 字段（宿主侧只有 exec.parent，同段 L640 的判断）。sub 是本插件在 index.js L1146 与 L1147 给合成成员自打的标记，不是宿主契约；升级比对时不要在宿主类型里找 sub，只需核对 exec.parent 与 rootCallId。
2. **sessionProjections 的 stateOf 本插件全文 0 次调用**——本插件没有任何一处直接调用 sessionProjections 的 stateOf(session, sandboxMode)；沙箱模式一律改走 sandboxPolicy 的 overrideOf（宿主 dsh-sandbox-policy 包内 lib/index.js 内部才调用 stateOf）。升级若移除或改名 overrideOf，本插件需改道直连投影服务，因此本项按「反向记录」保留在③-C 末行。
3. **lib/executor-spawn.js L66 注释（HEAD 复核：注释仍在 L66）的宿主行号已过期并已修正**——该注释原文把 dsh-subagent 包内 resolveChildAgentOptions 的实现位置写成一段固定的宿主行号区间，本机 0.1.2-rc.1 实测该符号实际落在包内另一区间（本台账按硬约束不写宿主行号）。本期已把该注释改为按包名与符号名核对：注释内容改为「宿主 resolveChildAgentOptions（@deepseek-ai/dsh-subagent 包内，按符号名核对）用对象展开合并」；文件中该注释的相邻两行未动，文件仍为 89 行。

## ⑦ 0.1.5-rc.2 起的新失败面（本台账原未覆盖）

- dsh-tools tools.restrict() 新增两处抛错守卫：无 scoped context（"tools.restrict() requires a scoped context (agent.ctx): ..."）与空过滤器 {}（"tools.restrict({}) is a no-op: ..."）；另有保留工具 run_code 命名守卫（0.1.5-rc.2 内 dsh-tools 包 lib/index.js，按符号名核对）。
- dsh-tool-subagent：配了 toolFilter 却无 allow/deny 即抛错（"tool-subagent: `toolFilter` is configured but names neither `allow` nor `deny` — remove the key or fill the filter"；0.1.5-rc.2 内 dsh-tool-subagent 包 lib/index.js，按符号名核对）。
- 本仓库预设四行均含 toolFilter.deny（agent.cordis.yml L193-194/L242-243/L267-268/L299-300；executor-spawn 行 L326 另注入 deny），按现文安全，无需改动 assets/presets/**。

## ⑧ 预设各行 config 属宿主契约（0.1.2-rc.1 ↔ 0.1.5-rc.2 双向对照）

本节补记一处此前**未覆盖**的宿主契约面：③ 四层表记的是本仓库代码与宿主的挂钩点，而 `assets/presets/extra-plan/agent.cordis.yml` 里**每一行（row）的 config 键也是宿主契约**——由该行 `name` 所指宿主包的 Config schema 校验。2026-09-12 实测确认的动机：persona 行的键在 0.1.3-alpha.2 起由 `text` 改名为 `prefix`（且必填），旧键在 0.1.5-rc.2 启动时报 `$.prefix missing required value`，此前升级比对未预警。

**对照方法与规模**：预设 31 行条目（17 个顶层条目 + 嵌套子行）× 22 个宿主包；新版侧读本机 0.1.5-rc.2 安装包，旧版侧取 unpkg 发布的 `@0.1.2-rc.1`（22/22 均取到发布物）；每行把**真实 config** 喂进对应包的 Config 实跑校验（schemastery）。

**结论**：新版侧 21 行有 schema 的条目全部 PASS、0 FAIL；旧版侧 26 个宿主行 21 PASS、0 FAIL（5 行因旧包不导出 Config 无法校验）。**除 persona 外无第二个同类型断点**，本预设装回 0.1.2-rc.1 可用。

**persona 行现状（双写）**：`prefix: &personaText`（新宿主必填键，0.1.3-alpha.2 起）+ `text: *personaText`（旧宿主必填键，锚点引用同一段文本，长度 1499 字符两边一致）。两代 schema 实跑校验均通过。删除条件：确定不再支持 0.1.2-rc.1 时删掉 `text` 别名行即可（`prefix` 不受影响）。

**未知键为何安全（机制）**：schemastery 的 `~standard.validate` 以默认 `strict=false` 调用 `Schema.resolve`（发布物 `@deepseek-ai/schemastery@3.18.2` 的 object 处理器为 `if (!strict) merge(result, data)`）；且**即使 `strict=true`，未知键也只是被丢弃，不会抛 ValidationError**。两代 dsh 均依赖 `@deepseek-ai/schemastery: ^3.18.2`，而该包 latest 即 3.18.2，语义一致——所以双写产生的未知键在两代都不会报错。

**反向风险清单（旧版必填、当前行内已显式给；将来若被当成冗余删掉，旧版即断）**：`persona.text`、`agent-instructions.maxBytes`、`tool-fs-search.sampleOverCapGlobResults`、`tool-subagent.provider`、`tool-todo.allowParallelInProgress`、`agent-tool-presentation.mode`。

**本轮同时扫清的高危面**：`toolFilter.deny` 四张表共 14 个工具名在 0.1.5-rc.2 全部存在（且未列保留名 `run_code`、未列不可限制的 `save_plan`）；`isolate` 三个 realm 键均等于真实服务名；两处 `!!js` 求值链路完好；仓库解析器（`parsePresetYaml`）与宿主 `entryListSchema` 对 31 行的解析结果 0 差异。

**对升级流程的建议**：升级 DSH 前，除 ⑤ 的比对清单外，应把「预设每行 config 键对两版 schema 实跑校验」一并执行——本次 persona 断点正是靠启动报错才发现的，属事后补救。

---

**编号说明（P0-2 遗留清理，2026-09-20）**：编号空间中 `SD9`、`SD13` 为历史编号，③四层表当前**无定义行**（SD 段为逐行编号：SD8、SD10、SD11、SD12、SD14…，连续但缺 SD9 与 SD13）。为避免编造定义内容、并防止插入表格行导致台账行号再次整体位移，本次**保留这两个编号不做增删**，其全部引用位置登记如下，供后续补齐定义行时回溯：
- ②覆盖总表 `plugins/dsh-extra-plan/index.js` 行（L76，SD 列表内含 SD9、SD13）
- ③-E 证据归属表：报告 A 证据 13-17 行（`SD13-SD17` 组）、报告 A 证据 18-31 行（含 `SD9`）、报告 A 证据 51-55 行（含 `SD13`）、报告 B 证据 30-41 行（含 `SD13`）

后续若补齐 SD9/SD13 定义行：请同步修正②覆盖总表的「共 N 处」计数，并复核③-E 四处引用。

