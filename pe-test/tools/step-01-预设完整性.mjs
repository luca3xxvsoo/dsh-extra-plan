// extra-plan 预设静态校验：只读工作区模板，不访问生产 DSH_HOME。
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { fileURLToPath } from 'node:url'
import {
  SETTING_DEFINITIONS,
  parsePresetYaml,
  resolveSetting,
  findTextLocatorMatches,
  resolveTemplateSettingDefault,
} from '../../plugins/dsh-extra-plan/lib/preset-settings.js'
import { DEFAULT_EXPLORE_BUDGET } from '../../plugins/dsh-extra-plan/lib/preset-defaults.generated.js'
import { generateRuntimeDefaults, renderRuntimeDefaults } from '../../plugins/dsh-extra-plan/scripts/generate-runtime-defaults.mjs'
// S1：DEFAULT_DENY 收敛断言（执行者 deny 清单必须与预设 config.deny 逐字一致）。
import { DEFAULT_DENY, resolveDeny } from '../../plugins/dsh-extra-plan/lib/executor-spawn.js'
import { HOST_CORDIS_TOOLS } from '../../plugins/dsh-extra-plan/lib/assembly-presentation.js'

const REPO_ROOT = fileURLToPath(new URL('../..', import.meta.url))
const PRESET_DIR = join(REPO_ROOT, 'plugins', 'dsh-extra-plan', 'assets', 'presets', 'extra-plan')
const file = join(PRESET_DIR, 'agent.cordis.yml')
const presetFile = join(PRESET_DIR, 'preset.yml')
const generatedFile = join(REPO_ROOT, 'plugins', 'dsh-extra-plan', 'lib', 'preset-defaults.generated.js')
const generatorFile = join(REPO_ROOT, 'plugins', 'dsh-extra-plan', 'scripts', 'generate-runtime-defaults.mjs')
let rows
let preset
try {
  rows = parsePresetYaml(readFileSync(file, 'utf8'))
  preset = parsePresetYaml(readFileSync(presetFile, 'utf8'))
} catch (error) {
  console.error('FAIL  工作区模板 YAML 解析失败: ' + error.message)
  process.exit(1)
}
console.log('PASS  工作区 agent/preset YAML 解析成功（' + (Array.isArray(rows) ? rows.length : '非数组!') + ' 行）')
if (!Array.isArray(preset)) console.log('PASS  preset.yml 为有效 YAML 文档')

// 0.1.7-rc.2 宿主事实（与 lib/assembly-presentation.js HOST_CORDIS_TOOLS 同源）：
// dsh-tool-cordis 只注册 cordis_inspect_list（lib/index.js L40）、cordis_inspect_query（lib/index.js L56）；
// cordis_run/cordis_define/cordis_stop/cordis_undefine/cordis_inspect_self 已不存在
// （deny 列出未知名会使 tools.restrict() 抛错）。真值对拍见下方 S-宿主真值。
const cordisTools = HOST_CORDIS_TOOLS
const registered = new Set([
  'subagent', 'subagent_review', 'subagent_probe', 'subagent_plan', 'workflow', 'ralph',
  'send_message', 'interrupt_agent', 'list_agents', 'ask_user_question',
  'todo_write', 'write', 'edit', 'read', 'glob', 'grep', 'pwsh', 'web_search', ...cordisTools,
])

let pass = 0
let fail = 0
function check(label, condition) {
  if (condition) { pass += 1; console.log('PASS  ' + label) }
  else { fail += 1; console.log('FAIL  ' + label) }
}
function checkDeny(label, denyList) {
  const unknown = denyList.filter((name) => !registered.has(name))
  if (unknown.length > 0) {
    fail += 1
    console.log('FAIL  ' + label + ' 含本预设不存在的工具名: ' + unknown.join(', '))
  } else {
    pass += 1
    console.log('PASS  ' + label + '（' + denyList.length + ' 项，全部存在）')
  }
}

// S-宿主真值：读本机 npm 全局宿主 dsh-tool-cordis 的 lib/index.js，提取 name 注册集，
// 与 HOST_CORDIS_TOOLS 比对——宿主删/增 cordis 工具时此处判红（A1 类缺陷的机械拦截）。
const hostCordisEntry = process.env.APPDATA
  ? join(process.env.APPDATA, 'npm', 'node_modules', '@deepseek-ai', 'dsh', 'node_modules', '@deepseek-ai', 'dsh-tool-cordis', 'lib', 'index.js')
  : null
if (hostCordisEntry !== null && existsSync(hostCordisEntry)) {
  const registeredCordis = [...readFileSync(hostCordisEntry, 'utf8').matchAll(/name:\s*["'](cordis_[a-z_]+)["']/g)].map((m) => m[1])
  const truth = [...HOST_CORDIS_TOOLS].sort().join(',')
  const actual = [...new Set(registeredCordis)].sort().join(',')
  check('S-宿主真值：dsh-tool-cordis 注册集 = HOST_CORDIS_TOOLS（' + actual + '）', actual === truth)
} else {
  console.log('PASS  S-宿主真值：本机未安装宿主 dsh-tool-cordis，跳过对拍')
}

function flatten(list) {
  const out = []
  for (const row of list) {
    if (row === null || typeof row !== 'object') continue
    out.push(row)
    if (row.group === true && Array.isArray(row.config)) out.push(...flatten(row.config))
  }
  return out
}

const all = flatten(Array.isArray(rows) ? rows : [])
const subagentRows = all.filter((row) => row.name === '@deepseek-ai/dsh-tool-subagent' && row.disabled !== true)
for (const row of subagentRows) {
  const deny = row.config && row.config.toolFilter && Array.isArray(row.config.toolFilter.deny) ? row.config.toolFilter.deny : []
  checkDeny('toolFilter deny [' + row.config.toolName + ']', deny)
}
for (const inner of all) {
  if (inner.name === '@local/dsh-extra-plan/executor-spawn') {
    const deny = inner.config && Array.isArray(inner.config.deny) ? inner.config.deny : []
    checkDeny('executor-spawn deny', deny)
  }
}

// S1-07 ~ S1-11：DEFAULT_DENY 已收敛为预设 config.deny 同集（11 项），resolveDeny 为纯函数回退。
const executorRow = all.find((row) => row.name === '@local/dsh-extra-plan/executor-spawn')
const ymlDeny = executorRow !== undefined && executorRow.config && Array.isArray(executorRow.config.deny)
  ? executorRow.config.deny : []
if (DEFAULT_DENY.length === 11) {
  pass += 1
  console.log('PASS  S1 DEFAULT_DENY 恰有 11 项')
} else {
  fail += 1
  console.log('FAIL  S1 DEFAULT_DENY 项数不是 11：' + DEFAULT_DENY.length)
}
const defaultDenySet = new Set(DEFAULT_DENY)
const ymlDenySet = new Set(ymlDeny)
if (defaultDenySet.size === DEFAULT_DENY.length && defaultDenySet.size === ymlDenySet.size
  && [...defaultDenySet].every((name) => ymlDenySet.has(name))) {
  pass += 1
  console.log('PASS  S1 DEFAULT_DENY 与 agent.cordis.yml config.deny 集合逐字一致（11 项）')
} else {
  fail += 1
  console.log('FAIL  S1 DEFAULT_DENY 与 agent.cordis.yml config.deny 集合不一致')
}
const removedDenyNames = ['subagent_fork', 'create_goal', 'update_goal', 'get_goal', 'exit_plan_mode']
const stillPresent = removedDenyNames.filter((name) => DEFAULT_DENY.includes(name))
if (stillPresent.length === 0) {
  pass += 1
  console.log('PASS  S1 DEFAULT_DENY 不含已移除 5 名（subagent_fork/create_goal/update_goal/get_goal/exit_plan_mode）')
} else {
  fail += 1
  console.log('FAIL  S1 DEFAULT_DENY 仍含：' + stillPresent.join(', '))
}
if (DEFAULT_DENY.includes('subagent_plan') === true && DEFAULT_DENY.includes('cordis_run') === false) {
  pass += 1
  console.log('PASS  S1 DEFAULT_DENY 含 subagent_plan 且不含 cordis_run（0.1.7 宿主无此工具）')
} else {
  fail += 1
  console.log('FAIL  S1 DEFAULT_DENY 缺少 subagent_plan 或仍含 cordis_run')
}
const denyFallbackCases = [
  resolveDeny(undefined) === DEFAULT_DENY,
  resolveDeny({}) === DEFAULT_DENY,
  Array.isArray(resolveDeny({ deny: ['x', 'y'] }))
    && resolveDeny({ deny: ['x', 'y'] })[0] === 'x' && resolveDeny({ deny: ['x', 'y'] })[1] === 'y'
    && resolveDeny({ deny: ['x', 'y'] }).length === 2,
]
if (denyFallbackCases.every((ok) => ok)) {
  pass += 1
  console.log('PASS  S1 resolveDeny(undefined/{}) 回退 DEFAULT_DENY，resolveDeny({deny:["x","y"]}) 原样返回')
} else {
  fail += 1
  console.log('FAIL  S1 resolveDeny 回退或原样返回行为不符')
}

const names = all.map((row) => typeof row.name === 'string' ? row.name : '')
const required = [
  '@deepseek-ai/dsh-persona', '@local/dsh-extra-plan', '@deepseek-ai/dsh-tool-ask-user',
  '@deepseek-ai/dsh-tool-subagent', '@deepseek-ai/dsh-tool-subagent-control',
  '@deepseek-ai/dsh-tool-subagent-control/list-agents', '@local/dsh-extra-plan/executor-spawn',
  '@deepseek-ai/dsh-workflow-ptc', '@deepseek-ai/dsh-tool-workflow',
  '@deepseek-ai/dsh-tool-ralph', '@deepseek-ai/dsh-compaction-basic', '@deepseek-ai/dsh-tool-cordis',
]
for (const req of required) {
  if (names.includes(req)) { pass += 1 } else { fail += 1; console.log('FAIL  缺少行: ' + req) }
}

const agentText = readFileSync(file, 'utf8')
const locatorChecks = SETTING_DEFINITIONS.map((definition) => {
  const parsed = resolveSetting(rows, definition, { aliases: false })
  const textMatches = findTextLocatorMatches(agentText, definition.sourceLocator)
  return { definition, parsed, textMatches }
})
if (SETTING_DEFINITIONS.length === 10 && locatorChecks.every((item) => item.parsed.kind === 'ok' && item.textMatches.length === 1)) {
  pass += 1
  console.log('PASS  设置白名单恰有 10 个唯一 sourceLocator（源模板/旧分发副本同形）')
} else {
  fail += 1
  console.log('FAIL  设置白名单 locator 不完整或有歧义')
}
const defaults = Object.fromEntries(locatorChecks.map((item) => [item.definition.key, item.parsed.kind === 'ok' ? item.parsed.value : undefined]))
const crossDefinition = SETTING_DEFINITIONS.find((item) => item.key === 'crossProviderPlannerModel')
if (crossDefinition !== undefined && crossDefinition.sourceLocator.rowId === 'extra-plan' && crossDefinition.sourceLocator.path === 'config.crossProviderPlannerModel' && crossDefinition.scalarType === 'boolean' && crossDefinition.validator(true) && !crossDefinition.validator('true') && crossDefinition.ui.control === 'select' && crossDefinition.ui.options.join('/') === 'true/false' && crossDefinition.locatorAliases.length === 0) {
  pass += 1
  console.log('PASS  crossProviderPlannerModel descriptor 严格为 boolean select 且无 alias')
} else {
  fail += 1
  console.log('FAIL  crossProviderPlannerModel descriptor 不符合契约')
}
const creativeDefinition = SETTING_DEFINITIONS.find((item) => item.key === 'creativeMode')
if (creativeDefinition !== undefined && creativeDefinition.sourceLocator.rowId === 'extra-plan' && creativeDefinition.sourceLocator.path === 'config.creativeMode' && creativeDefinition.scalarType === 'boolean' && creativeDefinition.validator(true) && !creativeDefinition.validator('true') && !creativeDefinition.validator(1) && creativeDefinition.validator(false) && creativeDefinition.ui.control === 'select' && creativeDefinition.ui.options.join('/') === 'true/false' && creativeDefinition.ui.locale === 'creativeMode' && creativeDefinition.ui.section === 'general' && creativeDefinition.locatorAliases.length === 0) {
  pass += 1
  console.log('PASS  creativeMode descriptor 严格为 boolean select 且无 alias')
} else {
  fail += 1
  console.log('FAIL  creativeMode descriptor 不符合契约')
}
const otherDefinition = SETTING_DEFINITIONS.find((item) => item.key === 'otherAgentModel')
if (otherDefinition !== undefined && otherDefinition.sourceLocator.rowId === 'extra-plan' && otherDefinition.sourceLocator.path === 'config.otherAgentModel' && otherDefinition.scalarType === 'string' && otherDefinition.validator('') && otherDefinition.validator('  model  ') && !otherDefinition.validator(123) && otherDefinition.ui.control === 'text' && otherDefinition.ui.locale === 'otherAgentModel' && otherDefinition.ui.section === 'pro' && otherDefinition.locatorAliases.length === 0) {
  pass += 1
  console.log('PASS  otherAgentModel descriptor 严格为 string text 且无 alias')
} else {
  fail += 1
  console.log('FAIL  otherAgentModel descriptor 不符合契约')
}
if (defaults.plannerModel === 'deepseek-v4-pro' && defaults.crossProviderPlannerModel === false && defaults.creativeMode === false && defaults.exploreBudget === 18 && defaults.otherAgentModel === '' && defaults.anchoredBootstrap === true && defaults.runcodeCatchGate === false && defaults.webFetch === false && defaults.toolPresentationMode === 'native' && typeof defaults.plannerPromptSuffix === 'string') {
  pass += 1
  console.log('PASS  新版模板 10 项默认值来自实际叶值（creativeMode=false，跨提供商=false，otherAgentModel=空串）')
} else {
  fail += 1
  console.log('FAIL  新版模板默认值不符合验收锚点')
}

// ── T1 声明行新载体（dsh 0.1.7-rc.1）──────────────────────────────────────
// 预设本体 = 生成产物 assets/presets/extra-plan/preset-patch.generated.yml 的根级 insert 声明行
// （name '@deepseek-ai/dsh-agent-preset'），config.plugins 与资产 agent.cordis.yml 顶层条目逐行逐字一致。
const patchFile = join(PRESET_DIR, 'preset-patch.generated.yml')
const patchText = readFileSync(patchFile, 'utf8')
check('T1 声明行存在（- id: preset-extra-plan 且下一行 name 逐字为 @deepseek-ai/dsh-agent-preset）',
  patchText.includes("    - id: preset-extra-plan\n      name: '@deepseek-ai/dsh-agent-preset'\n"))
check('T1 声明行 config 含 id: extra-plan 与逐字 description（取自 preset.yml）',
  patchText.includes('        id: extra-plan\n') && patchText.includes("        description: '" + preset.description + "'\n") && preset.description === '实现权限控制+子代理角色分配')
const patchDoc = parsePresetYaml(patchText)
const patchDeclaration = patchDoc[0].insert[0]
check('T1 声明行 config 顶层条目数 = 17（group 3 + 普通 14），且与资产顶层条目逐字一致',
  patchDeclaration.config.plugins.length === 17 && (Array.isArray(rows) ? rows.length : -1) === 17 &&
  JSON.stringify(patchDeclaration.config.plugins) === JSON.stringify(rows))
const assetTopText = agentText.slice(agentText.indexOf('- id: persona')).replace(/\n+$/, '')
const generatedPluginsBlock = patchText.slice(patchText.indexOf('        plugins:\n') + 17).replace(/\n+$/, '')
const deIndented = generatedPluginsBlock.split('\n').map((line) => (line.startsWith('          ') ? line.slice(10) : line)).join('\n')
check('T1 生成产物 plugins 与资产顶层条目逐行逐字一致（仅整段平移 10 列缩进）', deIndented === assetTopText)
const groupIds = patchDeclaration.config.plugins.filter((row) => row.group === true).map((row) => row.id)
const delegationGroup = patchDeclaration.config.plugins.find((row) => row.id === 'delegation')
const compactionGroup = patchDeclaration.config.plugins.find((row) => row.id === 'compaction')
const extraPlanGroup = patchDeclaration.config.plugins.find((row) => row.id === 'extra-plan-group')
check('T1 三组随组搬迁：group 行 3（extra-plan-group/compaction/delegation）且子行数 1/3/10',
  groupIds.join('|') === 'extra-plan-group|compaction|delegation' &&
  extraPlanGroup.config.length === 1 && compactionGroup.config.length === 3 && delegationGroup.config.length === 10)
check('T1 isolate 名单随组搬迁且值全为布尔 true（含 subagentModelSelection / toolResultPruner / workflowEngine）',
  delegationGroup.isolate.subagentModelSelection === true && delegationGroup.isolate.workflowEngine === true &&
  compactionGroup.isolate.toolResultPruner === true && extraPlanGroup.isolate !== undefined &&
  Object.values(delegationGroup.isolate).concat(Object.values(compactionGroup.isolate), Object.values(extraPlanGroup.isolate)).every((value) => value === true))
check('T1 声明行 plugins 内不存在 @deepseek-ai/dsh-workflow-worker-thread / @deepseek-ai/dsh-agent-presets（复数包名）',
  !patchText.includes('@deepseek-ai/dsh-workflow-worker-thread') && !patchText.includes('@deepseek-ai/dsh-agent-presets'))
check('T1 skill-filesystem 行 config.customSkillDirs 表达式逐字含 createRequire(baseUrl) 与 skills',
  agentText.includes("customSkillDirs:") && agentText.includes("createRequire(baseUrl).resolve('@deepseek-ai/dsh-agent-preset/package.json')") && agentText.includes("'skills')"))
check('T1 头注释已改 dsh-agent-preset-registry（不再写 dsh-agent-presets 会拒绝挂载）',
  !agentText.includes('dsh-agent-presets 会拒绝挂载') && agentText.includes('dsh-agent-preset-registry 会拒绝挂载'))
check('T1 workflow-ptc 行 config.provider 保留 extra-executor-spawn',
  agentText.includes("- id: workflow-ptc\n      name: '@deepseek-ai/dsh-workflow-ptc'\n      config:\n        provider: extra-executor-spawn\n"))
check('T1 官方预设/技能文件未复制进本仓（assets 目录无 skills/ 与 cordis 预设拷贝）',
  !existsSync(join(PRESET_DIR, 'skills')) && !existsSync(join(PRESET_DIR, 'agent.cordis.official.yml')))

// B2：YAML exploreBudget 是作者真源，生成模块只保存派生 fallback；非法 source 不覆盖 sentinel。
const packageJson = JSON.parse(readFileSync(join(REPO_ROOT, 'plugins', 'dsh-extra-plan', 'package.json'), 'utf8'))
const generatedText = readFileSync(generatedFile, 'utf8')
check('B2 YAML 叶值、生成 export 与 resolver 同为 18', resolveTemplateSettingDefault(agentText, 'exploreBudget') === 18 && DEFAULT_EXPLORE_BUDGET === 18 && generatedText.includes('export const DEFAULT_EXPLORE_BUDGET = 18'), true)
check('B2 render 文本与已提交生成模块逐字一致', renderRuntimeDefaults(agentText) === generatedText, true)
const packageFiles = Array.isArray(packageJson.files) ? packageJson.files : []
check('B2 package files/scripts 含生成器、generate 与 prepack', packageFiles.includes('scripts/generate-runtime-defaults.mjs') && packageJson.scripts['generate:runtime-defaults'] === 'node scripts/generate-runtime-defaults.mjs' && packageJson.scripts.prepack === 'node scripts/generate-runtime-defaults.mjs', true)
const generatedBeforeCheck = readFileSync(generatedFile)
let checkPassed = false
try { generateRuntimeDefaults({ sourcePath: file, outputPath: generatedFile, check: true }); checkPassed = true } catch { checkPassed = false }
check('B2 --check 通过且不写生成物', checkPassed && readFileSync(generatedFile).equals(generatedBeforeCheck), true)

const generatorFixture = mkdtempSync(join(tmpdir(), 'dsh-runtime-defaults-'))
try {
  const validMini = '- id: extra-plan\n  config:\n    exploreBudget: 18\n'
  const validSource = join(generatorFixture, 'valid.yml')
  const validOutput = join(generatorFixture, 'valid.generated.js')
  writeFileSync(validSource, validMini, 'utf8')
  const validRendered = renderRuntimeDefaults(validMini)
  generateRuntimeDefaults({ sourcePath: validSource, outputPath: validOutput })
  check('B2 临时 source/output 可生成并逐字等于 render', readFileSync(validOutput, 'utf8') === validRendered, true)
  const mismatchOutput = join(generatorFixture, 'mismatch.generated.js')
  writeFileSync(mismatchOutput, 'SENTINEL-CHECK', 'utf8')
  let mismatchFailed = false
  try { generateRuntimeDefaults({ sourcePath: validSource, outputPath: mismatchOutput, check: true }) } catch { mismatchFailed = true }
  check('B2 --check 不一致时非 0 且不改 sentinel', mismatchFailed && readFileSync(mismatchOutput, 'utf8') === 'SENTINEL-CHECK', true)
  let missingFailed = false
  try { generateRuntimeDefaults({ sourcePath: validSource, outputPath: join(generatorFixture, 'missing.generated.js'), check: true }) } catch { missingFailed = true }
  check('B2 --check 缺失生成物时非 0', missingFailed, true)
  const invalidTemplates = [
    ['missing', '- id: extra-plan\n  config:\n    plannerModel: x\n'],
    ['ambiguous', validMini + validMini],
    ['zero', '- id: extra-plan\n  config:\n    exploreBudget: 0\n'],
    ['negative', '- id: extra-plan\n  config:\n    exploreBudget: -1\n'],
    ['decimal', '- id: extra-plan\n  config:\n    exploreBudget: 1.5\n'],
    ['string', "- id: extra-plan\n  config:\n    exploreBudget: '18'\n"],
    ['null', '- id: extra-plan\n  config:\n    exploreBudget: null\n'],
    ['syntax', '- id: [broken\n'],
  ]
  for (const [label, sourceText] of invalidTemplates) {
    const sourcePath = join(generatorFixture, label + '.yml')
    const outputPath = join(generatorFixture, label + '.generated.js')
    const sentinel = 'SENTINEL-' + label
    writeFileSync(sourcePath, sourceText, 'utf8')
    writeFileSync(outputPath, sentinel, 'utf8')
    let failed = false
    try { generateRuntimeDefaults({ sourcePath, outputPath }) } catch { failed = true }
    check('B2 非法模板 ' + label + ' 失败且不覆盖 sentinel', failed && readFileSync(outputPath, 'utf8') === sentinel, true)
  }
} finally {
  rmSync(generatorFixture, { recursive: true, force: true })
}

const planRow = subagentRows.find((row) => row.config && row.config.toolName === 'subagent_plan')
const probeRow = subagentRows.find((row) => row.config && row.config.toolName === 'subagent_probe')
if (probeRow !== undefined && probeRow.config.backgroundMode === 'one-shot' && probeRow.config.provider === 'spawn' && Array.isArray(probeRow.config.toolFilter.deny) && probeRow.config.toolFilter.deny.includes('subagent_probe')) {
  pass += 1
  console.log('PASS  subagent_probe 行存在（one-shot/spawn/deny 含 subagent_probe）')
} else {
  fail += 1
  console.log('FAIL  subagent_probe 行缺失或配置不完整')
}
const pluginRow = all.find((row) => row.name === '@local/dsh-extra-plan')
// T4：plannerModel 允许置空（空串 = 继承主会话模型）；键存在且为 string 即合法，
// 不再要求非空（禁止项：空串误报为配置缺失回填资产默认）。
const plannerModelRaw = pluginRow !== undefined && pluginRow.config ? pluginRow.config.plannerModel : undefined
const plannerModel = typeof plannerModelRaw === 'string' ? plannerModelRaw : ''
if (planRow !== undefined && typeof plannerModelRaw === 'string') {
  pass += 1
  console.log('PASS  subagent_plan 行存在、plannerModel 键为 string（=' + (plannerModel === '' ? '空串=继承主会话模型' : plannerModel) + '）')
} else {
  fail += 1
  console.log('FAIL  subagent_plan 行或 plannerModel 键缺失（须为 string，可为空串）')
}
if (pluginRow !== undefined && pluginRow.config && pluginRow.config.creativeMode === false && pluginRow.config.crossProviderPlannerModel === false && pluginRow.config.otherAgentModel === '' && pluginRow.config.usageLedger && pluginRow.config.usageLedger.enabled === true && pluginRow.config.anchoredBootstrap === true && typeof pluginRow.config.plannerPromptSuffix === 'string') {
  pass += 1
  console.log('PASS  extra-plan 插件行 config 完整（anchoredBootstrap/creativeMode/usageLedger、plannerPromptSuffix 存在）')
} else {
  fail += 1
  console.log('FAIL  extra-plan 插件行 config 缺失')
}

// T1 禁止项：本修复走宿主 patch（dsh-qqbot-user-questions/cordis.patch.yml 补
// cordis-host-runner 行），资产预设的 tool-cordis 行必须逐字未变（仅 id + name 两行、无 config）。
const toolCordisRow = all.find((row) => row.id === 'tool-cordis')
const toolCordisTextRe = /- id: tool-cordis\n  name: '@deepseek-ai\/dsh-tool-cordis'(?:\n|$)/
if (toolCordisRow !== undefined && toolCordisRow.name === '@deepseek-ai/dsh-tool-cordis' && toolCordisRow.config === undefined
  && toolCordisTextRe.test(agentText)) {
  pass += 1
  console.log('PASS  T1 资产预设 tool-cordis 行逐字未变（仅 id+name 两行、无 config）')
} else {
  fail += 1
  console.log('FAIL  T1 资产预设 tool-cordis 行被改动或形状不符')
}
if (cordisTools.length === 2 && agentText.includes('# 0.1.7-rc.2 起 dsh-tool-cordis 只注册') && toolCordisRow !== undefined) {
  pass += 1
  console.log('PASS  Cordis 静态集合恰有 2 项（rc.2 宿主实际注册集）')
} else {
  fail += 1
  console.log('FAIL  Cordis 静态集合不是 2 项')
}

// S2（2026-09-25）：宿主运行时包依赖政策——`dependencies` 不得含任何 `@deepseek-ai/*`。
// 背景：0.1.7 运行时解析表里「profile node_modules 内的本地候选优先」（dsh-app-boot routeScoped），
//   所以装进 profile 的宿主同名包会顶替宿主的 llm 运行时行；0.1.7-rc.1 副本没有
//   projectToolUpdates/toolUpdate/toolHistory，会话内工具集变化产生的 developer tool-removal
//   会被原样序列化成线上 tool_removal，而 DeepSeek Messages API 只接受 tool_addition → 422，
//   且该 developer 消息落盘后整会话每轮必失败（现场取证见 ai-宿主耦合台账.md CF12 与 ⑦-2）。
// 口径：dsh-llm / schemastery 只作 peerDependencies 声明（profile autoInstallPeers=false 不安装），
//   运行时由宿主安装域供给 → 自动跟随宿主版本，不需要插件自己钉一套。
const pluginPkgFile = join(REPO_ROOT, 'plugins', 'dsh-extra-plan', 'package.json')
let pluginPkg
try { pluginPkg = JSON.parse(readFileSync(pluginPkgFile, 'utf8')) } catch { pluginPkg = undefined }
const asRecord = (value) => value !== null && typeof value === 'object' && !Array.isArray(value) ? value : {}
const pluginDeps = pluginPkg !== undefined ? asRecord(pluginPkg.dependencies) : {}
const pluginPeers = pluginPkg !== undefined ? asRecord(pluginPkg.peerDependencies) : {}
const hostLeaks = Object.keys(pluginDeps).filter((name) => name.startsWith('@deepseek-ai/'))
check('S2 dependencies 不含 @deepseek-ai/* 宿主包（profile 不得出现第二份宿主副本）'
  + (hostLeaks.length > 0 ? '，实际: ' + hostLeaks.join(', ') : ''),
  pluginPkg !== undefined && hostLeaks.length === 0)
check('S2 peerDependencies 的 @deepseek-ai/dsh-llm 与 @deepseek-ai/dsh 同范围（当前 '
  + String(pluginPeers['@deepseek-ai/dsh']) + '）',
  typeof pluginPeers['@deepseek-ai/dsh-llm'] === 'string' && pluginPeers['@deepseek-ai/dsh-llm'] === pluginPeers['@deepseek-ai/dsh'])
check('S2 peerDependencies 已声明 @deepseek-ai/schemastery（由宿主安装域供给）',
  typeof pluginPeers['@deepseek-ai/schemastery'] === 'string' && pluginPeers['@deepseek-ai/schemastery'] !== '')

console.log('\n通过 ' + pass + ', 失败 ' + fail)
process.exit(fail === 0 ? 0 : 1)
