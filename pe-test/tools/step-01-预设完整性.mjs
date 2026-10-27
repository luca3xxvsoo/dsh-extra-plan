// extra-plan 预设静态校验：只读工作区模板，不访问生产 DSH_HOME。
import { createHash } from 'node:crypto'
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { tmpdir } from 'node:os'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { createRequire } from 'node:module'
import { isDeepStrictEqual } from 'node:util'
import { Script } from 'node:vm'
import {
  SETTING_DEFINITIONS,
  parsePresetYaml,
  resolveSetting,
  findTextLocatorMatches,
  resolveTemplateSettingDefault,
} from '../../plugins/dsh-extra-plan/lib/preset-settings.js'
import { DEFAULT_SETTINGS, DEFAULT_EXPLORE_BUDGET, DEFAULT_PLANNER_PROMPT_SUFFIX } from '../../plugins/dsh-extra-plan/lib/preset-defaults.generated.js'
import { generateRuntimeDefaults, renderRuntimeDefaults, renderPresetDefinition, renderRoleDefinitions, secondDocumentOf, ROLE_IDS, roleDefinitionFile } from '../../plugins/dsh-extra-plan/scripts/generate-runtime-defaults.mjs'
import { HOST_CORDIS_TOOLS } from '../../plugins/dsh-extra-plan/lib/assembly-presentation.js'

const REPO_ROOT = fileURLToPath(new URL('../..', import.meta.url))
const DSH_INSTALL_ROOT = typeof process.env.DSH_INSTALL_ROOT === 'string' && process.env.DSH_INSTALL_ROOT.trim() !== ''
  ? process.env.DSH_INSTALL_ROOT.trim()
  : null
// 0.2.1-rc.2 起只兼容单一宿主版本（旧版兼容已迁出本分支）：版本门读这一份声明。
const TARGET_PEER_RANGE = '0.2.1-rc.2'
const LEGACY_HOST_VERSIONS = ['0.1.7-rc.1', '0.1.7-rc.2', '0.2.0-rc.1', '0.2.0-rc.2']
const PRESET_DIR = join(REPO_ROOT, 'plugins', 'dsh-extra-plan', 'assets', 'presets', 'extra-plan')
const file = join(PRESET_DIR, 'agent.cordis.yml')
const presetFile = join(PRESET_DIR, 'preset.yml')
const generatedFile = join(REPO_ROOT, 'plugins', 'dsh-extra-plan', 'lib', 'preset-defaults.generated.js')
const definitionGeneratedFile = join(PRESET_DIR, 'preset-definition.generated.yml')
const coreManifestFile = join(REPO_ROOT, 'plugins', 'dsh-extra-plan', 'package.json')
const qqbotManifestFile = join(REPO_ROOT, 'plugins', 'dsh-extra-plan-qqbot', 'package.json')
const generatorFile = join(REPO_ROOT, 'plugins', 'dsh-extra-plan', 'scripts', 'generate-runtime-defaults.mjs')
const assemblySource = readFileSync(join(REPO_ROOT, 'plugins', 'dsh-extra-plan', 'lib', 'assembly-presentation.js'), 'utf8')

function targetManifestPath(name) {
  if (DSH_INSTALL_ROOT === null) return null
  const candidates = [
    join(DSH_INSTALL_ROOT, 'node_modules', '@deepseek-ai', name, 'package.json'),
    join(DSH_INSTALL_ROOT, 'node_modules', '@deepseek-ai', 'dsh', 'node_modules', '@deepseek-ai', name, 'package.json'),
  ]
  return candidates.find((path) => existsSync(path)) || null
}
function targetManifest(name) {
  const path = targetManifestPath(name)
  if (path === null) return null
  try { return JSON.parse(readFileSync(path, 'utf8')) } catch { return null }
}
const targetDshManifestPath = targetManifestPath('dsh')
const targetDshLlmManifestPath = targetManifestPath('dsh-llm')
const targetDsh = targetManifest('dsh')
const targetDshLlm = targetManifest('dsh-llm')
const targetDshVersion = targetDsh !== null && typeof targetDsh.version === 'string' ? targetDsh.version : '缺失'
const targetDshLlmVersion = targetDshLlm !== null && typeof targetDshLlm.version === 'string' ? targetDshLlm.version : '缺失'
console.log('INFO  HOST 真实安装根=' + (DSH_INSTALL_ROOT === null ? '未设置' : DSH_INSTALL_ROOT) + ' dsh=' + targetDshVersion + ' path=' + String(targetDshManifestPath) + ' dsh-llm=' + targetDshLlmVersion + ' path=' + String(targetDshLlmManifestPath))
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

// 从 dsh-tool-cordis 读取 Cordis 呈现面的宿主真值，并与 lib/assembly-presentation.js 的
// HOST_CORDIS_TOOLS 比对；未知 deny 名会使 tools.restrict() 抛错。
const cordisTools = HOST_CORDIS_TOOLS

let pass = 0
let fail = 0
function check(label, condition) {
  if (condition) { pass += 1; console.log('PASS  ' + label) }
  else { fail += 1; console.log('FAIL  ' + label) }
}

// S-宿主真值：优先读取显式 DSH_INSTALL_ROOT 的 dsh-tool-cordis，提取 name 注册集；
// 未设置目标根时不伪造 rc.2 宿主结论。
const hostCordisManifestPath = targetManifestPath('dsh-tool-cordis')
const hostCordisEntry = hostCordisManifestPath === null ? null : join(dirname(hostCordisManifestPath), 'lib', 'index.js')
if (hostCordisEntry !== null && existsSync(hostCordisEntry)) {
  const registeredCordis = [...readFileSync(hostCordisEntry, 'utf8').matchAll(/name:\s*["'](cordis_[a-z_]+)["']/g)].map((m) => m[1])
  const truth = [...HOST_CORDIS_TOOLS].sort().join(',')
  const actual = [...new Set(registeredCordis)].sort().join(',')
  check('S-宿主真值：dsh-tool-cordis 注册集 = HOST_CORDIS_TOOLS（' + actual + '）', actual === truth)
} else {
  console.log('SKIP  {"scope":"HOST-CORDIS","reason":"本机未安装宿主 dsh-tool-cordis，未进行注册集对拍"}')
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

const definitionGeneratedText = readFileSync(definitionGeneratedFile, 'utf8')
const definitionDoc = parsePresetYaml(definitionGeneratedText)
const runtimeRows = definitionDoc !== null && typeof definitionDoc === 'object' && Array.isArray(definitionDoc.plugins) ? definitionDoc.plugins : []
const all = flatten(runtimeRows)
const subagentRows = all.filter((row) => row.name === '@deepseek-ai/dsh-tool-subagent' && row.disabled !== true)
// 0.2.1 契约：persona 与 toolFilter 会被宿主抛错、backgroundMode 已无此键，四行只留三键；
// 人设与工具面改由角色预设承载（agentPreset 指向 4 个角色 id）。
const ROLE_PRESET_OF_TOOL = { subagent: 'extra-plan-executor', subagent_plan: 'extra-plan-planner', subagent_review: 'extra-plan-reviewer', subagent_probe: 'extra-plan-prober' }
check('T2 四行 tool-subagent 齐备且按 toolName 对应角色预设', subagentRows.length === 4 && Object.keys(ROLE_PRESET_OF_TOOL).every((toolName) => subagentRows.some((row) => row.config && row.config.toolName === toolName)))
for (const row of subagentRows) {
  const config = row.config !== null && typeof row.config === 'object' ? row.config : {}
  const keys = Object.keys(config).sort().join(',')
  check('T2 tool-subagent[' + config.toolName + '] 恰三键 provider/toolName/agentPreset 且 agentPreset 指向角色 id',
    keys === 'agentPreset,provider,toolName' && config.provider === 'spawn' && ROLE_PRESET_OF_TOOL[config.toolName] === config.agentPreset)
}
const RETIRED_EXECUTOR_SPAWN = ['executor-spawn', 'dsh-extra-plan/executor-spawn', 'extra-executor-spawn']
function hasRetiredExecutorSpawn(value) {
  if (Array.isArray(value)) return value.some(hasRetiredExecutorSpawn)
  if (value === null || typeof value !== 'object') return false
  const fields = [value.id, value.name, value.config?.provider, value.providerName, value.subagentProvider]
  return fields.some((field) => RETIRED_EXECUTOR_SPAWN.includes(field)) || Object.values(value).some(hasRetiredExecutorSpawn)
}
const cleanExecutorSpawnFixture = structuredClone(runtimeRows)
check('T1 退役残留判定器：干净结构克隆通过', !hasRetiredExecutorSpawn(cleanExecutorSpawnFixture))
const executorSpawnPollutions = [
  { field: 'id', row: (value) => ({ id: value }) },
  { field: 'name', row: (value) => ({ name: value }) },
  { field: 'config.provider', row: (value) => ({ config: { provider: value } }) },
  { field: 'providerName', row: (value) => ({ providerName: value }) },
  { field: 'subagentProvider', row: (value) => ({ subagentProvider: value }) },
]
for (const pollution of executorSpawnPollutions) {
  for (const value of RETIRED_EXECUTOR_SPAWN) {
    const polluted = structuredClone(cleanExecutorSpawnFixture)
    polluted.push({ group: true, config: [pollution.row(value)] })
    check('T1 退役残留反例 ' + pollution.field + '=' + value, hasRetiredExecutorSpawn(polluted))
  }
}
check('T1 退役残留判定器不扫描普通文本字段', !hasRetiredExecutorSpawn({ description: RETIRED_EXECUTOR_SPAWN.join(' '), config: { note: 'executor-spawn' } }))

const names = all.map((row) => typeof row.name === 'string' ? row.name : '')
const required = [
  '@deepseek-ai/dsh-persona', 'dsh-extra-plan', '@deepseek-ai/dsh-tool-ask-user',
  '@deepseek-ai/dsh-tool-subagent', '@deepseek-ai/dsh-tool-subagent-control',
  '@deepseek-ai/dsh-tool-subagent-control/list-agents',
  '@deepseek-ai/dsh-compaction-basic', '@deepseek-ai/dsh-tool-cordis',
]
for (const req of required) {
  if (names.includes(req)) { pass += 1 } else { fail += 1; console.log('FAIL  缺少行: ' + req) }
}

const agentText = readFileSync(file, 'utf8')
// 设置白名单 locator 的唯一性只在【第一文档（主预设）】内统计：源模板是多文档（第一文档=主预设，
// 第二文档=4 角色），第二文档的角色 tools 行不是权威声明——回填工具面后 tool-web 在四个角色段
// 各出现一次（fetch: false 同形），全文统计会把 1 次污染成 5 次。断言语义不变：权威文档内每个
// sourceLocator 仍必须恰好命中 1 次，命中 0 次或 ≥2 次照样 FAIL。
const mainPresetText = (() => {
  const lines = agentText.split('\n')
  const separator = lines.findIndex((line) => /^---\s*$/.test(line))
  return (separator === -1 ? lines : lines.slice(0, separator)).join('\n')
})()
const locatorChecks = SETTING_DEFINITIONS.map((definition) => {
  const parsed = resolveSetting(rows, definition, { aliases: false })
  const textMatches = findTextLocatorMatches(mainPresetText, definition.sourceLocator)
  return { definition, parsed, textMatches }
})
if (SETTING_DEFINITIONS.length === 10 && locatorChecks.every((item) => item.parsed.kind === 'ok' && item.textMatches.length === 1)) {
  pass += 1
  console.log('PASS  设置白名单恰有 10 个唯一 sourceLocator（第一文档权威声明内各命中 1 次）')
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
if (defaults.plannerModel === 'deepseek-v4-pro' && defaults.crossProviderPlannerModel === false && defaults.creativeMode === false && defaults.exploreBudget === 18 && defaults.otherAgentModel === '' && defaults.anchoredBootstrap === true && defaults.runcodeCatchGate === false && defaults.webFetch === false && defaults.toolPresentationMode === 'native' && defaults.plannerPromptSuffix === '你的深度思考部分需要以"好了，现在我以全局视角来看待这个问题"开头') {
  pass += 1
  console.log('PASS  新版模板 10 项默认值来自实际叶值（creativeMode=false，跨提供商=false，otherAgentModel=空串）')
} else {
  fail += 1
  console.log('FAIL  新版模板默认值不符合验收锚点')
}

// ── T1 纯 definition 资产（官方 adapter 由 preset-sync 内部挂载） ──────────────
const definitionFile = join(PRESET_DIR, 'preset-definition.generated.yml')
const definitionText = definitionGeneratedText
check('T1 生成资产是纯 definition（无 insert wrapper/官方独立公开行）',
  !definitionText.includes('insert:') && !definitionText.includes('preset-extra-plan') && !definitionText.includes("name: '@deepseek-ai/dsh-agent-preset'"))
check('T1 definition 元数据与 preset.yml 一致、plugins 顶层恰 17 条',
  definitionDoc.id === 'extra-plan' && definitionDoc.name === preset.name && definitionDoc.description === preset.description && definitionDoc.order === 100 && Array.isArray(definitionDoc.plugins) && definitionDoc.plugins.length === 17)
check('T1 作者源保留 17 条顶层结构、引导词与主包 specifier、无退役包装层', Array.isArray(rows) && rows.length === 17 && agentText.includes('收到需求后，理解用户需求') && (agentText.match(/name: 'dsh-extra-plan'/g) || []).length === 1 && !hasRetiredExecutorSpawn(rows))
check('T1 definition 与作者源 parsed plugins 深等、主包 specifier 且无退役包装层/旧运行时 specifier', Array.isArray(definitionDoc.plugins) && definitionDoc.plugins.length === 17 && JSON.stringify(definitionDoc.plugins) === JSON.stringify(rows) && all.filter((row) => row.name === 'dsh-extra-plan').length === 1 && !hasRetiredExecutorSpawn(definitionDoc) && !definitionText.includes('@local/dsh-extra-plan'))
const groupIds = definitionDoc.plugins.filter((row) => row.group === true).map((row) => row.id)
const delegationGroup = definitionDoc.plugins.find((row) => row.id === 'delegation')
const compactionGroup = definitionDoc.plugins.find((row) => row.id === 'compaction')
const extraPlanGroup = definitionDoc.plugins.find((row) => row.id === 'extra-plan-group')
check('T1 三组 group/子行数量保持 1/3/6', groupIds.join('|') === 'extra-plan-group|compaction|delegation' && extraPlanGroup.config.length === 1 && compactionGroup.config.length === 3 && delegationGroup.config.length === 6)
check('T1 isolate 全部为 true、保留模型选择隔离且 workflowEngine 缺席', delegationGroup.isolate.subagentModelSelection === true && !Object.prototype.hasOwnProperty.call(delegationGroup.isolate, 'workflowEngine') && compactionGroup.isolate.toolResultPruner === true && Object.values(delegationGroup.isolate).concat(Object.values(compactionGroup.isolate), Object.values(extraPlanGroup.isolate)).every((value) => value === true))
check('T1 definition 保留 raw !!js marker 文本与官方技能表达式', definitionText.includes('!!js') && definitionText.includes("createRequire(baseUrl).resolve('@deepseek-ai/dsh-agent-preset/package.json')") && definitionText.includes("'skills')"))
check('T1 官方适配器与技能文件未复制进本仓', !existsSync(join(PRESET_DIR, 'skills')) && !existsSync(join(PRESET_DIR, 'agent.cordis.official.yml')))
// skill-filesystem 作者真源仍需保留 watch:false/bundledSkillDir。
const skillFsBlockText = agentText.slice(agentText.indexOf('- id: skill-filesystem'), agentText.indexOf('- id: tool-skill'))
const skillFsConfigText = skillFsBlockText.slice(skillFsBlockText.indexOf('\n  config:') + 1)
const skillFsRow = Array.isArray(rows) ? rows.find((row) => row.id === 'skill-filesystem') : undefined
check('T1 skill-filesystem 行保留 watch:false 与 bundledSkillDir、不含 customSkillDirs', skillFsRow !== undefined && skillFsRow.config !== undefined && skillFsRow.config.watch === false && skillFsConfigText.includes('bundledSkillDir:') && !skillFsConfigText.includes('customSkillDirs:'))
check('T1 作者源保留官方 preset registry 说明且无包装层恢复配方', agentText.includes('dsh-agent-preset-registry 会拒绝挂载') && !agentText.includes("provider: extra-executor-spawn"))
// B2：YAML exploreBudget 是作者真源，生成模块只保存派生 fallback；非法 source 不覆盖 sentinel。
const packageJson = JSON.parse(readFileSync(coreManifestFile, 'utf8'))
const qqbotPackageJson = JSON.parse(readFileSync(qqbotManifestFile, 'utf8'))
const generatedText = readFileSync(generatedFile, 'utf8')
const EXPECTED_DEFAULT_SETTINGS = { anchoredBootstrap: true, creativeMode: false, webFetch: false, toolPresentationMode: 'native', runcodeCatchGate: false, crossProviderPlannerModel: false, plannerModel: 'deepseek-v4-pro', plannerPromptSuffix: '你的深度思考部分需要以"好了，现在我以全局视角来看待这个问题"开头', exploreBudget: 18, otherAgentModel: '' }
check('B2 导入生成物 DEFAULT_SETTINGS 恰十键/值/冻结且旧别名同值', Object.isFrozen(DEFAULT_SETTINGS) && isDeepStrictEqual(DEFAULT_SETTINGS, EXPECTED_DEFAULT_SETTINGS) && DEFAULT_EXPLORE_BUDGET === DEFAULT_SETTINGS.exploreBudget && DEFAULT_PLANNER_PROMPT_SUFFIX === DEFAULT_SETTINGS.plannerPromptSuffix && resolveTemplateSettingDefault(agentText, 'exploreBudget') === DEFAULT_SETTINGS.exploreBudget && resolveTemplateSettingDefault(agentText, 'plannerPromptSuffix') === DEFAULT_SETTINGS.plannerPromptSuffix, true)

check('B2 render 文本与已提交生成模块逐字一致', renderRuntimeDefaults(agentText) === generatedText, true)
check('B2 definition render 与提交资产逐字一致且 package 仅装载 cordis.patch.yml', renderPresetDefinition(agentText, readFileSync(presetFile, 'utf8')) === definitionGeneratedText && JSON.parse(readFileSync(join(REPO_ROOT, 'plugins', 'dsh-extra-plan', 'package.json'), 'utf8')).dsh.bundle.patch === './cordis.patch.yml', true)
const packageFiles = Array.isArray(packageJson.files) ? packageJson.files : []
const qqbotExports = qqbotPackageJson.exports !== null && typeof qqbotPackageJson.exports === 'object' ? qqbotPackageJson.exports : {}
const qqbotFiles = Array.isArray(qqbotPackageJson.files) ? qqbotPackageJson.files : []
check('B2 package files/scripts 含生成器、generate 与 prepack', packageFiles.includes('scripts/generate-runtime-defaults.mjs') && packageJson.scripts['generate:runtime-defaults'] === 'node scripts/generate-runtime-defaults.mjs' && packageJson.scripts.prepack === 'node scripts/generate-runtime-defaults.mjs', true)
check('M1 核心 manifest name/version/repository/client/deps/patch/private 契约', packageJson.name === 'dsh-extra-plan' && packageJson.version === '1.6.0' && packageJson.repository === 'git+https://github.com/luca3xxvsoo/dsh-extra-plan.git' && packageJson.dsh?.bundle?.patch === './cordis.patch.yml' && packageJson.dsh?.client?.platform === 'web' && Array.isArray(packageJson.dsh?.client?.inject) && packageJson.dependencies?.['js-yaml'] === '^4.2.0' && !Object.prototype.hasOwnProperty.call(packageJson, 'private') && !JSON.stringify(packageJson).includes('@local/dsh-extra-plan'))
check('M2 核心 engines.dsh 与三项 @deepseek-ai peer 同为 0.2.1-rc.2', packageJson.engines?.dsh === TARGET_PEER_RANGE && packageJson.peerDependencies?.['@deepseek-ai/dsh'] === TARGET_PEER_RANGE && packageJson.peerDependencies?.['@deepseek-ai/dsh-llm'] === TARGET_PEER_RANGE && packageJson.peerDependencies?.['@deepseek-ai/dsh-agent-preset'] === TARGET_PEER_RANGE)
check('M2 核心 exports/files 保持所需子路径与 peer 范围、包装层 export/实现均缺席', packageJson.exports?.['.'] === './index.js' && packageJson.exports?.['./settings'] === './lib/settings.js' && !Object.prototype.hasOwnProperty.call(packageJson.exports || {}, './executor-spawn') && !existsSync(join(REPO_ROOT, 'plugins', 'dsh-extra-plan', 'lib', 'executor-spawn.js')) && packageFiles.includes('index.js') && packageFiles.includes('lib/') && packageFiles.includes('locale/') && packageFiles.includes('cordis.patch.yml') && packageJson.peerDependencies?.['@deepseek-ai/dsh'] === TARGET_PEER_RANGE && packageJson.peerDependencies?.['@deepseek-ai/dsh-llm'] === TARGET_PEER_RANGE && packageJson.peerDependencies?.['@deepseek-ai/dsh-agent-preset'] === TARGET_PEER_RANGE && packageJson.peerDependencies?.['@deepseek-ai/schemastery'] === '~3.18.4')
check('M3 QQBot manifest name/version/exports/files/dependency/postinstall/patch/private 契约', qqbotPackageJson.name === 'dsh-extra-plan-qqbot' && qqbotPackageJson.version === '2.0.1' && qqbotExports['.'] === './index.js' && qqbotExports['./cordis.patch.yml'] === './cordis.patch.yml' && qqbotExports['./package.json'] === './package.json' && JSON.stringify(qqbotFiles) === JSON.stringify(['index.js', 'cordis.patch.yml', 'lib/', 'scripts/']) && qqbotPackageJson.dependencies?.['js-yaml'] === '^4.2.0' && qqbotPackageJson.scripts?.postinstall === 'node scripts/heal.mjs --install' && qqbotPackageJson.dsh?.bundle?.patch === './cordis.patch.yml' && !Object.prototype.hasOwnProperty.call(qqbotPackageJson, 'private') && !JSON.stringify(qqbotPackageJson).includes('@local/dsh-qqbot-user-questions'))
// ── T3 角色预设链：作者源第二文档 4 角色 + 4 个生成 definition（persona 逐字相等） ─────
const roleSourceText = secondDocumentOf(agentText)
const roleSource = parsePresetYaml(roleSourceText)
const roleRow = Array.isArray(roleSource) ? roleSource : []
const EXPECTED_ROLE_NAMES = {
  'extra-plan-executor': '按需规划模式-执行者',
  'extra-plan-planner': '按需规划模式-规划者',
  'extra-plan-reviewer': '按需规划模式-验收者',
  'extra-plan-prober': '按需规划模式-探查者',
}
const EXPECTED_ROLE_RECORDS = [
  { id: 'extra-plan-executor', order: 101, name: '按需规划模式-执行者' },
  { id: 'extra-plan-planner', order: 102, name: '按需规划模式-规划者' },
  { id: 'extra-plan-reviewer', order: 103, name: '按需规划模式-验收者' },
  { id: 'extra-plan-prober', order: 104, name: '按需规划模式-探查者' },
]
for (const expected of EXPECTED_ROLE_RECORDS) {
  const sourceRole = roleRow.find((role) => role.id === expected.id)
  check('T3 独立字面源期望 ' + expected.id, sourceRole !== undefined && sourceRole.order === expected.order && sourceRole.name === expected.name, true)
}
check('T3 角色作者源四个展示名独立精确字面期望', roleRow.length === 4 && roleRow.every((role) => role.name === EXPECTED_ROLE_NAMES[role.id]), true)
check('T3 角色作者源 4 项且 id/order 唯一（101..104）',
  roleRow.length === 4 && JSON.stringify(roleRow.map((role) => role.id)) === JSON.stringify([...ROLE_IDS])
  && JSON.stringify(roleRow.map((role) => role.order)) === JSON.stringify([101, 102, 103, 104]))
const mainExtraRow = Array.isArray(definitionDoc.plugins) ? (definitionDoc.plugins.find((row) => row.id === 'extra-plan-group')?.config || []).find((row) => row.id === 'extra-plan') : undefined
const mainExtraConfigJson = mainExtraRow === undefined ? 'missing' : JSON.stringify(mainExtraRow.config)
const CONTROL_TOOL_SOURCE = '@deepseek-ai/dsh-tool-subagent-control'
const LIST_AGENTS_TOOL_SOURCE = '@deepseek-ai/dsh-tool-subagent-control/list-agents'
const mainAuthorRows = flatten(Array.isArray(rows) ? rows : [])
const mainDefinitionRows = flatten(definitionDoc !== null && typeof definitionDoc === 'object' && Array.isArray(definitionDoc.plugins) ? definitionDoc.plugins : [])
check('T3 主作者源控制与 list-agents 各恰 1 行', mainAuthorRows.filter((row) => row.name === CONTROL_TOOL_SOURCE).length, 1)
check('T3 主作者源 list-agents 控制子行恰 1 行', mainAuthorRows.filter((row) => row.name === LIST_AGENTS_TOOL_SOURCE).length, 1)
check('T3 主 definition 控制与 list-agents 各恰 1 行', mainDefinitionRows.filter((row) => row.name === CONTROL_TOOL_SOURCE).length, 1)
check('T3 主 definition list-agents 控制子行恰 1 行', mainDefinitionRows.filter((row) => row.name === LIST_AGENTS_TOOL_SOURCE).length, 1)
for (const role of roleRow) {
  const roleFile = roleDefinitionFile(role.id, PRESET_DIR)
  let roleDef = null
  try { roleDef = parsePresetYaml(readFileSync(roleFile, 'utf8')) } catch (error) { roleDef = null }
  check('T3 ' + role.id + ' 作者源/definition 无退役包装层结构残留', roleDef !== null && !hasRetiredExecutorSpawn(role) && !hasRetiredExecutorSpawn(roleDef))
  const leading = roleDef === null ? [] : roleDef.plugins.slice(0, 2).map((row) => row.id)
  check('T3 ' + role.id + ' definition 首两行为 persona/extra-plan、config 与主预设逐字相等、persona 与作者源逐字相等',
    roleDef !== null && roleDef.id === role.id && roleDef.order === role.order && roleDef.name === EXPECTED_ROLE_NAMES[role.id] && roleDef.name === role.name && roleDef.description === role.description
    && JSON.stringify(leading) === JSON.stringify(['persona', 'extra-plan'])
    && roleDef.plugins[0].name === '@deepseek-ai/dsh-persona' && roleDef.plugins[0].config?.prefix === role.personaPrefix
    && roleDef.plugins[1].name === 'dsh-extra-plan' && JSON.stringify(roleDef.plugins[1].config) === mainExtraConfigJson)
  const toolRows = roleDef === null ? [] : roleDef.plugins.slice(2)
  const toolNames = toolRows.map((row) => row.name)
  // 公共禁用（四角色一律不挂）：控制/委派/工作流/交互类工具 + list-agents 子行。
  const forbidden = ['@deepseek-ai/dsh-tool-subagent-control', '@deepseek-ai/dsh-tool-subagent', '@deepseek-ai/dsh-tool-subagent-control/list-agents', '@deepseek-ai/dsh-tool-workflow', '@deepseek-ai/dsh-tool-ralph', '@deepseek-ai/dsh-tool-ask-user', '@deepseek-ai/dsh-tool-todo']
  const controlToolName = '@deepseek-ai/dsh-tool-subagent-control'
  const controlToolCount = toolNames.filter((name) => name === controlToolName).length
  const fsRow = toolRows.find((row) => row.name === '@deepseek-ai/dsh-tool-fs')
  const writable = fsRow !== undefined && fsRow.config !== undefined && fsRow.config.write === true
  const readOnlyOk = role.id === 'extra-plan-executor'
    ? fsRow !== undefined && (fsRow.config === undefined || (fsRow.config.write !== false && fsRow.config.edit !== false))
    : fsRow !== undefined && fsRow.config?.write === false && fsRow.config?.edit === false
  const shellRows = toolNames.filter((name) => name === '@deepseek-ai/dsh-tool-pwsh' || name === '@deepseek-ai/dsh-tool-bash')
  // 工具面回填 5f3cc68 实际可见面：四角色均挂双 shell（pwsh/bash，按平台条件 disabled）、
  // tool-web（fetch:false）与只读 tool-cordis。
  check('T3 ' + role.id + ' 工具面按只读/可写/shell 规则裁剪',
    forbidden.every((name) => !toolNames.includes(name))
    && controlToolCount === 0
    && (role.id !== 'extra-plan-planner' || !String(role.personaPrefix || '').includes('send_message'))
    && readOnlyOk
    && shellRows.length === 2
    && toolNames.includes('@deepseek-ai/dsh-tool-fs-search') && toolNames.includes('@deepseek-ai/dsh-tool-skill')
    && toolNames.includes('@deepseek-ai/dsh-skill-filesystem') && toolNames.includes('@deepseek-ai/dsh-tool-jobs')
    && toolNames.includes('@deepseek-ai/dsh-tool-web') && toolNames.includes('@deepseek-ai/dsh-tool-cordis')
    && (!writable || role.id === 'extra-plan-executor'))
}
const renderedRoles = renderRoleDefinitions(roleSourceText, definitionGeneratedText)
check('T3 角色 definition 渲染与已提交 4 个生成物逐字一致（生成器单源）',
  renderedRoles.length === ROLE_IDS.length && renderedRoles.every((role) => readFileSync(roleDefinitionFile(role.roleId, PRESET_DIR), 'utf8') === role.text))

const generatedBeforeCheck = readFileSync(generatedFile)
const definitionBeforeCheck = readFileSync(definitionGeneratedFile)
let checkPassed = false
try { generateRuntimeDefaults({ sourcePath: file, outputPath: generatedFile, check: true }); checkPassed = true } catch { checkPassed = false }
check('B2 --check 通过且不写生成物', checkPassed && readFileSync(generatedFile).equals(generatedBeforeCheck) && readFileSync(definitionGeneratedFile).equals(definitionBeforeCheck), true)

const generatorFixture = mkdtempSync(join(tmpdir(), 'dsh-runtime-defaults-'))
try {
  const validMini = [
    '- id: extra-plan',
    '  config:',
    '    anchoredBootstrap: true',
    '    creativeMode: false',
    '    runcodeCatchGate: false',
    '    crossProviderPlannerModel: false',
    '    plannerModel: deepseek-v4-pro',
    "    otherAgentModel: ''",
    '    exploreBudget: 18',
    '    plannerPromptSuffix: plain-suffix',
    '- id: tool-web',
    '  config:',
    '    fetch: false',
    '- id: tool-presentation',
    '  config:',
    '    mode: native',
    '',
  ].join('\n')
  const validSource = join(generatorFixture, 'valid.yml')
  const validOutput = join(generatorFixture, 'valid.generated.js')
  writeFileSync(validSource, validMini, 'utf8')
  const validRendered = renderRuntimeDefaults(validMini)
  generateRuntimeDefaults({ sourcePath: validSource, outputPath: validOutput })
  check('B2 完整十项 source/output 可生成并逐字等于 render', readFileSync(validOutput, 'utf8') === validRendered, true)
  const richSuffix = '前缀 "引号"\\路径\n换行'
  const richMini = validMini.replace('    plannerPromptSuffix: plain-suffix\n', '    plannerPromptSuffix: ' + JSON.stringify(richSuffix) + '\n')
  const richSource = join(generatorFixture, 'rich.yml')
  const richOutput = join(generatorFixture, 'rich.generated.js')
  writeFileSync(richSource, richMini, 'utf8')
  generateRuntimeDefaults({ sourcePath: richSource, outputPath: richOutput })
  const richModule = await import(pathToFileURL(richOutput).href + '?rich=' + String(Date.now()))
  check('B2 合法 false/空串/引号反斜线换行后缀以导入值对拍', richModule.DEFAULT_SETTINGS.anchoredBootstrap === true && richModule.DEFAULT_SETTINGS.creativeMode === false && richModule.DEFAULT_SETTINGS.otherAgentModel === '' && richModule.DEFAULT_SETTINGS.plannerPromptSuffix === richSuffix, true)
  const mismatchOutput = join(generatorFixture, 'mismatch.generated.js')
  writeFileSync(mismatchOutput, 'SENTINEL-CHECK', 'utf8')
  let mismatchFailed = false
  try { generateRuntimeDefaults({ sourcePath: validSource, outputPath: mismatchOutput, check: true }) } catch { mismatchFailed = true }
  check('B2 --check 不一致时非 0 且不改 sentinel', mismatchFailed && readFileSync(mismatchOutput, 'utf8') === 'SENTINEL-CHECK', true)
  let missingFailed = false
  try { generateRuntimeDefaults({ sourcePath: validSource, outputPath: join(generatorFixture, 'missing.generated.js'), check: true }) } catch { missingFailed = true }
  check('B2 --check 缺失生成物时非 0', missingFailed, true)
  const replaceLine = (text, from, to) => text.replace(from + '\n', to + '\n')
  const invalidTemplates = [
    ['missing-anchoredBootstrap', validMini.replace('    anchoredBootstrap: true\n', '')],
    ['missing-creativeMode', validMini.replace('    creativeMode: false\n', '')],
    ['missing-runcodeCatchGate', validMini.replace('    runcodeCatchGate: false\n', '')],
    ['missing-crossProviderPlannerModel', validMini.replace('    crossProviderPlannerModel: false\n', '')],
    ['missing-plannerModel', validMini.replace('    plannerModel: deepseek-v4-pro\n', '')],
    ['missing-otherAgentModel', validMini.replace("    otherAgentModel: ''\n", '')],
    ['missing-exploreBudget', validMini.replace('    exploreBudget: 18\n', '')],
    ['missing-plannerPromptSuffix', validMini.replace('    plannerPromptSuffix: plain-suffix\n', '')],
    ['missing-webFetch', validMini.replace('    fetch: false\n', '')],
    ['missing-toolPresentationMode', validMini.replace('    mode: native\n', '')],
    ['wrong-anchoredBootstrap', replaceLine(validMini, '    anchoredBootstrap: true', "    anchoredBootstrap: 'true'")],
    ['wrong-creativeMode', replaceLine(validMini, '    creativeMode: false', '    creativeMode: 0')],
    ['wrong-runcodeCatchGate', replaceLine(validMini, '    runcodeCatchGate: false', '    runcodeCatchGate: no')],
    ['wrong-crossProviderPlannerModel', replaceLine(validMini, '    crossProviderPlannerModel: false', '    crossProviderPlannerModel: 0')],
    ['wrong-plannerModel', replaceLine(validMini, '    plannerModel: deepseek-v4-pro', '    plannerModel: 18')],
    ['wrong-otherAgentModel', replaceLine(validMini, "    otherAgentModel: ''", '    otherAgentModel: 18')],
    ['wrong-exploreBudget', replaceLine(validMini, '    exploreBudget: 18', "    exploreBudget: '18'")],
    ['wrong-plannerPromptSuffix', replaceLine(validMini, '    plannerPromptSuffix: plain-suffix', '    plannerPromptSuffix: 18')],
    ['wrong-webFetch', replaceLine(validMini, '    fetch: false', "    fetch: 'false'")],
    ['wrong-toolPresentationMode', replaceLine(validMini, '    mode: native', '    mode: hybrid')],
    ['duplicate-locator', validMini.replace('    plannerModel: deepseek-v4-pro\n', '    plannerModel: deepseek-v4-pro\n    plannerModel: another-model\n')],
    ['budget-zero', replaceLine(validMini, '    exploreBudget: 18', '    exploreBudget: 0')],
    ['budget-negative', replaceLine(validMini, '    exploreBudget: 18', '    exploreBudget: -1')],
    ['budget-decimal', replaceLine(validMini, '    exploreBudget: 18', '    exploreBudget: 1.5')],
    ['yaml-syntax', replaceLine(validMini, '    plannerModel: deepseek-v4-pro', '    plannerModel: [broken')],
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

// G3 客户端七产物夹具：显式临时 source/output 才启用 client，仓库 client 只读对拍。
const g3ClientFixture = mkdtempSync(join(tmpdir(), 'dsh-runtime-client-g3-'))
try {
  const outputDir = join(g3ClientFixture, 'outputs')
  const sourcePath = join(g3ClientFixture, 'client-source.js')
  const clientOutputPath = join(outputDir, 'client.js')
  const outputPath = join(outputDir, 'preset-defaults.generated.js')
  const definitionOutputPath = join(outputDir, 'preset-definition.generated.yml')
  const roleDefinitionDir = join(outputDir, 'roles')
  const rolePaths = ROLE_IDS.map((roleId) => roleDefinitionFile(roleId, roleDefinitionDir))
  const sevenPaths = [outputPath, definitionOutputPath, ...rolePaths, clientOutputPath]
  const clientSource = readFileSync(join(REPO_ROOT, 'plugins/dsh-extra-plan/lib/client.js'), 'utf8')
  writeFileSync(sourcePath, clientSource, 'utf8')
  const sevenOptions = { sourcePath: file, outputPath, metaSourcePath: presetFile, definitionOutputPath, roleDefinitionDir, clientSourcePath: sourcePath, clientOutputPath }
  const snapshot = (paths, includeMtime = true) => paths.map((path) => {
    const bytes = readFileSync(path)
    return { path, bytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex'), ...(includeMtime ? { mtimeMs: statSync(path).mtimeMs } : {}) }
  })
  const outsideClientBlock = (text) => {
    const begin = text.indexOf('// BEGIN GENERATED SETTINGS FIELDS')
    const end = text.indexOf('// END GENERATED SETTINGS FIELDS')
    if (begin < 0 || end < begin) return null
    const endLine = end + '// END GENERATED SETTINGS FIELDS'.length
    return text.slice(0, begin) + '\u0000' + text.slice(endLine)
  }
  generateRuntimeDefaults(sevenOptions)
  check('G3 七产物临时 client 明确启用并逐路径存在', sevenPaths.length === 7 && sevenPaths.every((path) => existsSync(path)) && readFileSync(clientOutputPath, 'utf8').includes('// BEGIN GENERATED SETTINGS FIELDS'), true)
  const generatedClientText = readFileSync(clientOutputPath, 'utf8')
  const clientBlockStart = generatedClientText.indexOf('// BEGIN GENERATED SETTINGS FIELDS')
  const clientBlockEnd = generatedClientText.indexOf('// END GENERATED SETTINGS FIELDS')
  const clientBlock = clientBlockStart >= 0 && clientBlockEnd > clientBlockStart ? generatedClientText.slice(clientBlockStart, clientBlockEnd) : ''
  check('G3 client 只替换标记区块且区块外字节不变/metadata 无默认值与函数', outsideClientBlock(generatedClientText) === outsideClientBlock(clientSource) && ['anchoredBootstrap','creativeMode','webFetch','toolPresentationMode','runcodeCatchGate','crossProviderPlannerModel','plannerModel','plannerPromptSuffix','exploreBudget','otherAgentModel'].every((key) => clientBlock.includes('\"key\":\"' + key + '\"')) && !clientBlock.includes('defaultValue') && !clientBlock.includes('validator') && !clientBlock.includes('function '), true)
  let clientCompiled = true
  try { new Script(generatedClientText, { filename: clientOutputPath }) } catch { clientCompiled = false }
  check('G3 最终 client JS 可编译', clientCompiled, true)
  const beforeClientCheck = snapshot(sevenPaths)
  let clientCheckError = null
  try { generateRuntimeDefaults({ ...sevenOptions, check: true }) } catch (error) { clientCheckError = error }
  check('G3 七产物 --check 零写且 bytes/mtime 不变', clientCheckError === null && JSON.stringify(beforeClientCheck) === JSON.stringify(snapshot(sevenPaths)), true)
  writeFileSync(clientOutputPath, 'STALE-CLIENT', 'utf8')
  let staleError = null
  try { generateRuntimeDefaults({ ...sevenOptions, check: true }) } catch (error) { staleError = error }
  check('G3 client --check 过期非零且保留 sentinel', staleError !== null && readFileSync(clientOutputPath, 'utf8') === 'STALE-CLIENT', true)
  rmSync(clientOutputPath, { force: true })
  let missingClientError = null
  try { generateRuntimeDefaults({ ...sevenOptions, check: true }) } catch (error) { missingClientError = error }
  check('G3 client --check 缺失非零且不写回', missingClientError !== null && !existsSync(clientOutputPath), true)
  generateRuntimeDefaults(sevenOptions)
  const repoClientPath = join(REPO_ROOT, 'plugins/dsh-extra-plan/lib/client.js')
  const repoClientBefore = snapshot([repoClientPath])
  const customNoClientSource = join(g3ClientFixture, 'custom-source.yml')
  const customNoClientOutput = join(g3ClientFixture, 'custom-output.js')
  const customNoClientText = ['- id: extra-plan', '  config:', '    anchoredBootstrap: true', '    creativeMode: false', '    runcodeCatchGate: false', '    crossProviderPlannerModel: false', '    plannerModel: deepseek-v4-pro', "    otherAgentModel: ''", '    exploreBudget: 18', '    plannerPromptSuffix: plain-suffix', '- id: tool-web', '  config:', '    fetch: false', '- id: tool-presentation', '  config:', '    mode: native', ''].join('\n')
  writeFileSync(customNoClientSource, customNoClientText, 'utf8')
  generateRuntimeDefaults({ sourcePath: customNoClientSource, outputPath: customNoClientOutput, definitionOutputPath: null, roleDefinitionDir: null })
  check('G3 自定义 source/output 未显式 client 时不写仓库 client', JSON.stringify(repoClientBefore) === JSON.stringify(snapshot([repoClientPath])) && existsSync(customNoClientOutput), true)
  const clientVariants = [
    ['missing-begin', clientSource.replace('// BEGIN GENERATED SETTINGS FIELDS\n', '')],
    ['missing-end', clientSource.replace('// END GENERATED SETTINGS FIELDS\n', '')],
    ['missing-both', clientSource.replace('// BEGIN GENERATED SETTINGS FIELDS\n', '').replace('// END GENERATED SETTINGS FIELDS\n', '')],
    ['duplicate-begin', clientSource.replace('// BEGIN GENERATED SETTINGS FIELDS', '// BEGIN GENERATED SETTINGS FIELDS\n    // BEGIN GENERATED SETTINGS FIELDS')],
    ['reverse-markers', clientSource.replace('// BEGIN GENERATED SETTINGS FIELDS', '__BEGIN__').replace('// END GENERATED SETTINGS FIELDS', '// BEGIN GENERATED SETTINGS FIELDS').replace('__BEGIN__', '// END GENERATED SETTINGS FIELDS')],
  ]
  for (const [label, variant] of clientVariants) {
    const variantSource = join(g3ClientFixture, label + '.js')
    const variantOutput = join(g3ClientFixture, label + '.out.js')
    writeFileSync(variantSource, variant, 'utf8')
    writeFileSync(variantOutput, 'SENTINEL-' + label, 'utf8')
    let variantError = null
    try { generateRuntimeDefaults({ ...sevenOptions, clientSourcePath: variantSource, clientOutputPath: variantOutput }) } catch (error) { variantError = error }
    check('G3 client 标记异常 ' + label + ' 失败且不覆盖 sentinel', variantError !== null && readFileSync(variantOutput, 'utf8') === 'SENTINEL-' + label, true)
  }
  const setSentinels = (prefix) => { for (const [index, path] of sevenPaths.entries()) writeFileSync(path, prefix + '-' + String(index), 'utf8') }
  const outputSnapshot = (includeMtime = false) => snapshot(sevenPaths, includeMtime)
  // 七产物逐路径暂存故障：按目标路径注入，不绑定实现 copy 次数。
  for (const target of sevenPaths) {
    setSentinels('SEVEN-STAGE')
    const before = outputSnapshot()
    let stageError = null
    try { generateRuntimeDefaults({ ...sevenOptions, fsOps: { writeFileSync(...args) { if (String(args[0]).startsWith(target + '.tmp-')) throw new Error('stage-' + target); return writeFileSync(...args) } } }) } catch (error) { stageError = error }
    check('G3 七产物逐路径暂存失败恢复 ' + target.split('\\').at(-1), stageError !== null && JSON.stringify(before) === JSON.stringify(outputSnapshot()) && publishAuxiliaryForTest(g3ClientFixture).length === 0, true)
  }
  // 七产物逐路径 rename 故障：目标存在时恢复旧字节。
  for (const target of sevenPaths) {
    setSentinels('SEVEN-RENAME')
    const before = outputSnapshot()
    let renameError = null
    try { generateRuntimeDefaults({ ...sevenOptions, fsOps: { renameSync(...args) { if (resolve(args[1]) === resolve(target)) throw new Error('rename-' + target); return renameSync(...args) } } }) } catch (error) { renameError = error }
    check('G3 七产物逐路径 rename 失败恢复 ' + target.split('\\').at(-1), renameError !== null && JSON.stringify(before) === JSON.stringify(outputSnapshot()) && publishAuxiliaryForTest(g3ClientFixture).length === 0, true)
  }
  rmSync(outputDir, { recursive: true, force: true })
  let absentError = null
  const absentTarget = sevenPaths[3]
  try { generateRuntimeDefaults({ ...sevenOptions, fsOps: { renameSync(...args) { if (resolve(args[1]) === resolve(absentTarget)) throw new Error('rename-absent-' + absentTarget); return renameSync(...args) } } }) } catch (error) { absentError = error }
  check('G3 七产物目标原先缺席时失败保持全缺席', absentError !== null && sevenPaths.every((path) => !existsSync(path)) && publishAuxiliaryForTest(g3ClientFixture).length === 0, true)
  mkdirSync(outputDir, { recursive: true })
  generateRuntimeDefaults(sevenOptions)
  setSentinels('SEVEN-RECOVERY')
  let recoveryError = null
  const recoveryRenameTarget = sevenPaths[2]
  const recoveryCopyTarget = sevenPaths[1]
  try { generateRuntimeDefaults({ ...sevenOptions, fsOps: {
    copyFileSync(...args) { if (resolve(args[1]) === resolve(recoveryCopyTarget)) throw new Error('seven-restore-copy'); return copyFileSync(...args) },
    renameSync(...args) { if (resolve(args[1]) === resolve(recoveryRenameTarget)) throw new Error('seven-rename-recovery'); return renameSync(...args) },
  } }) } catch (error) { recoveryError = error }
  check('G3 七产物恢复失败保留首错/恢复错/备份路径', recoveryError !== null && recoveryError.message.includes('seven-rename-recovery') && recoveryError.message.includes('seven-restore-copy') && recoveryError.message.includes('恢复失败') && recoveryError.message.includes('残留/备份路径') && publishAuxiliaryForTest(g3ClientFixture).some((path) => path.includes('.bak-')), true)
} finally {
  rmSync(g3ClientFixture, { recursive: true, force: true })
}
function publishAuxiliaryForTest(root) {
  if (!existsSync(root)) return []
  const out = []
  const visit = (dir) => { for (const entry of readdirSync(dir, { withFileTypes: true })) { const path = join(dir, entry.name); if (entry.isDirectory()) visit(path); else if (entry.name.includes('.tmp-') || entry.name.includes('.bak-')) out.push(path) } }
  visit(root)
  return out
}

// G5 任务11：六产物真实暂存/发布/有限回滚夹具；所有输出只在临时 fixture，作者源与仓库生成物不写。
const g5PublishFixture = mkdtempSync(join(tmpdir(), 'dsh-runtime-publish-g5-'))
try {
  const outputDir = join(g5PublishFixture, 'outputs')
  const outputPath = join(outputDir, 'preset-defaults.generated.js')
  const definitionOutputPath = join(outputDir, 'preset-definition.generated.yml')
  const roleDefinitionDir = join(outputDir, 'roles')
  const rolePaths = ROLE_IDS.map((roleId) => roleDefinitionFile(roleId, roleDefinitionDir))
  const publishPaths = [outputPath, definitionOutputPath, ...rolePaths]
  const publishOptions = { sourcePath: file, outputPath, metaSourcePath: presetFile, definitionOutputPath, roleDefinitionDir }
  const publishSnapshot = (paths, includeMtime = true) => paths.map((path) => {
    const bytes = readFileSync(path)
    return { path, bytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex'), ...(includeMtime ? { mtimeMs: statSync(path).mtimeMs } : {}) }
  })
  const publishAuxiliary = (root) => {
    if (!existsSync(root)) return []
    const out = []
    const visit = (dir) => {
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const path = join(dir, entry.name)
        if (entry.isDirectory()) visit(path)
        else if (entry.name.includes('.tmp-') || entry.name.includes('.bak-')) out.push(path)
      }
    }
    visit(root)
    return out
  }
  let initialError = null
  try { generateRuntimeDefaults(publishOptions) } catch (error) { initialError = error }
  check('G5 临时 fixture 正常生成完整六产物', initialError === null && publishPaths.every((path) => existsSync(path)), true)
  const initialPublishSnapshot = publishSnapshot(publishPaths)
  let checkError = null
  try { generateRuntimeDefaults({ ...publishOptions, check: true }) } catch (error) { checkError = error }
  check('G5 check=true 六产物字节/mtime不变且无辅助残留', checkError === null && JSON.stringify(initialPublishSnapshot) === JSON.stringify(publishSnapshot(publishPaths)) && publishAuxiliary(g5PublishFixture).length === 0, true)

  // 用不同于新渲染内容的旧字节，避免遗漏恢复时仍因新旧相同而通过。
  for (const [index, path] of publishPaths.entries()) writeFileSync(path, 'ORIGINAL-G5-SENTINEL-' + index + '\n', 'utf8')
  const sentinelSnapshot = publishSnapshot(publishPaths, false)
  check('G5 六份旧哨兵彼此不同且不同于新生成内容', new Set(sentinelSnapshot.map((item) => item.sha256)).size === 6 && sentinelSnapshot.every((item, index) => item.sha256 !== initialPublishSnapshot[index].sha256), true)
  const stageBefore = publishSnapshot(publishPaths, false)
  let stageError = null
  let stageWrites = 0
  try {
    generateRuntimeDefaults({ ...publishOptions, fsOps: {
      writeFileSync(...args) {
        stageWrites += 1
        if (stageWrites === 2) throw new Error('stage-two')
        return writeFileSync(...args)
      },
    } })
  } catch (error) { stageError = error }
  check('G5 第二产物暂存失败保留首错/阶段且恢复全部旧字节', stageError !== null && stageError.message.includes('stage-two') && stageError.message.includes('阶段=暂存第2') && JSON.stringify(stageBefore) === JSON.stringify(publishSnapshot(publishPaths, false)) && publishAuxiliary(g5PublishFixture).length === 0, true)

  const renameBefore = publishSnapshot(publishPaths, false)
  let renameError = null
  let renameCount = 0
  try {
    generateRuntimeDefaults({ ...publishOptions, fsOps: {
      renameSync(...args) {
        renameCount += 1
        if (renameCount === 3) throw new Error('rename-third')
        return renameSync(...args)
      },
    } })
  } catch (error) { renameError = error }
  check('G5 第三产物发布失败保留首错/阶段并恢复全部旧字节', renameError !== null && renameError.message.includes('rename-third') && renameError.message.includes('阶段=发布第3') && JSON.stringify(renameBefore) === JSON.stringify(publishSnapshot(publishPaths, false)) && publishAuxiliary(g5PublishFixture).length === 0, true)

  rmSync(outputDir, { recursive: true, force: true })
  let absentError = null
  let absentRenameCount = 0
  try {
    generateRuntimeDefaults({ ...publishOptions, fsOps: {
      renameSync(...args) {
        absentRenameCount += 1
        if (absentRenameCount === 3) throw new Error('rename-third-absent')
        return renameSync(...args)
      },
    } })
  } catch (error) { absentError = error }
  check('G5 原先缺席目标发布失败保留缺席状态且无辅助残留', absentError !== null && absentError.message.includes('rename-third-absent') && publishPaths.every((path) => !existsSync(path)) && publishAuxiliary(g5PublishFixture).length === 0, true)

  rmSync(outputDir, { recursive: true, force: true })
  generateRuntimeDefaults(publishOptions)
  let recoveryError = null
  const recoveryRenameTarget = rolePaths[2]
  const recoveryCopyTarget = rolePaths[1]
  try {
    generateRuntimeDefaults({ ...publishOptions, fsOps: {
      copyFileSync(...args) {
        if (resolve(args[1]) === resolve(recoveryCopyTarget)) throw new Error('restore-copy')
        return copyFileSync(...args)
      },
      renameSync(...args) {
        if (resolve(args[1]) === resolve(recoveryRenameTarget)) throw new Error('rename-third-recovery')
        return renameSync(...args)
      },
    } })
  } catch (error) { recoveryError = error }
  const recoveryAuxiliary = publishAuxiliary(g5PublishFixture)
  check('G5 恢复再次失败非成功且保留首错/恢复错/备份路径', recoveryError !== null && recoveryError.message.includes('rename-third-recovery') && recoveryError.message.includes('恢复失败') && recoveryError.message.includes('restore-copy') && recoveryError.message.includes('残留/备份路径') && recoveryAuxiliary.some((path) => path.includes('.bak-')), true)
} finally {
  rmSync(g5PublishFixture, { recursive: true, force: true })
}

const planRow = subagentRows.find((row) => row.config && row.config.toolName === 'subagent_plan')
const probeRow = subagentRows.find((row) => row.config && row.config.toolName === 'subagent_probe')
if (probeRow !== undefined && probeRow.config.provider === 'spawn' && probeRow.config.agentPreset === 'extra-plan-prober'
  && JSON.stringify(Object.keys(probeRow.config).sort()) === JSON.stringify(['agentPreset', 'provider', 'toolName'])) {
  pass += 1
  console.log('PASS  subagent_probe 行存在（provider/agentPreset 三键，探查器只读面在角色预设）')
} else {
  fail += 1
  console.log('FAIL  subagent_probe 行缺失或配置不完整')
}
const pluginRow = all.find((row) => row.name === 'dsh-extra-plan')
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
const V2_USAGE_PATH_TEXT = "path: !!js dshHomePath('usage-ledger', 'ledger-v2.jsonl')"
const V1_USAGE_PATH_TEXT = "path: !!js dshHomePath('usage-ledger', 'ledger.jsonl')"
const usagePathSources = [
  ['作者源 agent.cordis.yml', agentText],
  ['主 preset-definition.generated.yml', definitionText],
  ...ROLE_IDS.map((roleId) => [roleId + ' definition', readFileSync(roleDefinitionFile(roleId, PRESET_DIR), 'utf8')]),
]
for (const [label, sourceText] of usagePathSources) {
  check('M13 ' + label + ' usageLedger 唯一路径为 ledger-v2.jsonl（旧默认引用失败）', sourceText.includes(V2_USAGE_PATH_TEXT) && !sourceText.includes(V1_USAGE_PATH_TEXT))
}


// T1 禁止项：本修复走宿主 patch（dsh-extra-plan-qqbot/cordis.patch.yml 补
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
// 结构化核对（不依赖 agent.cordis.yml 的注释原文）：静态集合恰为两个只读工具、
// tool-cordis 行不带 config、且任何 deny 清单都不列已不存在的执行口 cordis_run
// （deny 未知名会让宿主 tools.restrict() 抛错）。
const denyHasCordisRun = all.some((row) => row.config !== null && typeof row.config === 'object'
  && Array.isArray(row.config.deny) && row.config.deny.includes('cordis_run'))
const toolCordisRowStructural = toolCordisRow !== undefined && toolCordisRow.config === undefined
if (cordisTools.length === 2 && cordisTools.includes('cordis_run') === false
  && toolCordisRowStructural && denyHasCordisRun === false) {
  pass += 1
  console.log('PASS  Cordis 静态集合恰有 2 项只读工具、不含执行口，且 deny 清单未列 cordis_run（宿主实际注册集）')
} else {
  fail += 1
  console.log('FAIL  Cordis 静态集合不是 2 项、形状不符或 deny 列了执行口')
}

// S2：宿主 runtime 包不得进入 dependencies；只能由 peerDependencies 声明。
// dsh/dsh-llm 的四版本精确并集是版本门控，不等价于 rc.1 API 或实机兼容结论。
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
check('S2 peerDependencies dsh 与 dsh-llm 逐字同为 0.2.1-rc.2（旧版兼容已迁出）',
  pluginPeers['@deepseek-ai/dsh'] === TARGET_PEER_RANGE && pluginPeers['@deepseek-ai/dsh-llm'] === TARGET_PEER_RANGE
  && !LEGACY_HOST_VERSIONS.some((version) => String(pluginPeers['@deepseek-ai/dsh']).includes(version)))
check('S2 peerDependencies 不使用 caret/compatibility 豁免，且 schemastery 仍由宿主供给',
  typeof pluginPeers['@deepseek-ai/schemastery'] === 'string' && pluginPeers['@deepseek-ai/schemastery'] !== '' &&
  !String(pluginPeers['@deepseek-ai/dsh']).includes('^') && !String(pluginPeers['@deepseek-ai/dsh-llm']).includes('^'))

if (DSH_INSTALL_ROOT === null || targetDsh === null || targetDshLlm === null) {
  console.log('SKIP  {"scope":"HOST-VERSION","reason":"DSH_INSTALL_ROOT 未提供完整 dsh/dsh-llm manifests，未伪造宿主结论"}')
} else {
  let semver = null
  const semverRequireCandidates = [join(DSH_INSTALL_ROOT, 'package.json'), targetDshManifestPath].filter((path) => typeof path === 'string')
  for (const manifestPath of semverRequireCandidates) {
    try { semver = createRequire(manifestPath)('semver'); if (semver !== null) break } catch {}
  }
  // 版本门改为语义门：不再硬编码目标版本号，改由声明范围（peer for dsh/dsh-llm）判定宿主是否被支持。
  const declaredDsh = typeof pluginPeers['@deepseek-ai/dsh'] === 'string' ? pluginPeers['@deepseek-ai/dsh'] : ''
  const declaredLlm = typeof pluginPeers['@deepseek-ai/dsh-llm'] === 'string' ? pluginPeers['@deepseek-ai/dsh-llm'] : ''
  check('S2 语义门：HOST 真实 dsh/dsh-llm manifests 均落在声明范围（' + declaredDsh + ' / ' + declaredLlm + '）',
    semver !== null && declaredDsh !== '' && declaredLlm !== ''
    && semver.satisfies(targetDshVersion, declaredDsh, { includePrerelease: true })
    && semver.satisfies(targetDshLlmVersion, declaredLlm, { includePrerelease: true }))
  check('S2 语义门拒绝四个旧版（0.1.7-rc.1/0.1.7-rc.2/0.2.0-rc.1/0.2.0-rc.2）',
    semver !== null && declaredDsh !== '' && LEGACY_HOST_VERSIONS.every((version) => !semver.satisfies(version, declaredDsh, { includePrerelease: true })))
}
console.log('HUMAN  旧宿主与实机模型行为【未核实·HUMAN】：本脚本只证明单一声明范围的语义门，不证明旧版 API/自动回归/实机通过')

// S3：包级与全局管理行 locale 通过 exports 真实解析；旧 preset-sync 通道必须退役。
const LOCALE_CHANNELS = [
  { label: '包卡片', specifier: 'dsh-extra-plan', dir: 'locale', zh: { title: '按需规划模式', description: '按需规划模式的预设、设置与启动核对' }, en: { title: 'Extra Plan', description: 'Preset, settings, and startup check' } },
  { label: '全局管理行', specifier: 'dsh-extra-plan/settings', dir: join('locale', 'settings'), zh: { title: '按需规划模式全局管理', description: '统一管理配置、预设核对与界面加载' }, en: { title: 'Extra Plan Global Manager', description: 'Manage configuration, preset checks, and UI loading' } },
]
const pluginDir = join(REPO_ROOT, 'plugins', 'dsh-extra-plan')
const exportsMap = pluginPkg !== undefined ? asRecord(pluginPkg.exports) : {}
check('S3 exports 保留根包/settings locale，明确删除 preset-sync 与其 locale 通道', exportsMap['./settings/locale/*'] === './locale/settings/*' && exportsMap['./locale/*.json'] === './locale/*.json' && exportsMap['./preset-sync'] === undefined && exportsMap['./preset-sync/locale/*'] === undefined)
const localeProblems = []
for (const channel of LOCALE_CHANNELS) {
  for (const lang of ['zh', 'en']) {
    const expected = channel[lang]
    let parsed
    try { parsed = JSON.parse(readFileSync(join(pluginDir, channel.dir, lang + ".json"), "utf8")) } catch { localeProblems.push(channel.label + "/" + lang + " 读取或解析失败"); continue }
    const keys = parsed !== null && typeof parsed === "object" && !Array.isArray(parsed) ? Object.keys(parsed) : []
    const meta = asRecord(parsed.meta)
    if (keys.length !== 1 || keys[0] !== 'meta') localeProblems.push(channel.label + '/' + lang + ' 顶层键应只有 meta')
    if (meta.title !== expected.title) localeProblems.push(channel.label + '/' + lang + ' title 不符')
    if (meta.description !== expected.description) localeProblems.push(channel.label + '/' + lang + ' description 不符')
  }
}
check('S3 两组字典真实文件只有 meta 键且文案精确匹配' + (localeProblems.length > 0 ? '，异常: ' + localeProblems.join('; ') : ''), localeProblems.length === 0)
const resolveProblems = []
for (const channel of LOCALE_CHANNELS) {
  for (const lang of ['zh', 'en']) {
    const target = join(pluginDir, channel.dir, lang + ".json")
    let resolved
    try { resolved = createRequire(join(pluginDir, "package.json")).resolve(channel.specifier + "/locale/" + lang + ".json") } catch { resolveProblems.push(channel.label + "/" + lang + " 不可解析"); continue }
    if (resolved !== target) resolveProblems.push(channel.label + "/" + lang + " 解析到 " + resolved)
  }
}
check('S3 四个当前 locale specifier 经 exports 真实解析命中各自文件' + (resolveProblems.length > 0 ? '，异常: ' + resolveProblems.join('; ') : ''), resolveProblems.length === 0)
const retiredResolveProblems = []
for (const specifier of ['dsh-extra-plan/preset-sync', 'dsh-extra-plan/preset-sync/locale/en.json', 'dsh-extra-plan/preset-sync/locale/zh.json']) {
  try { createRequire(join(pluginDir, 'package.json')).resolve(specifier); retiredResolveProblems.push(specifier + ' 仍可解析') } catch { /* 退役路径应失败 */ }
}
check('S3 退役 preset-sync 根/locale 子路径均不可解析', retiredResolveProblems.length === 0)
check('S4 空 schema 为权威空集合且退役 tool:cordis section 不产出', assemblySource.includes('schemaNames === null || schemaNames.has(tool.name)') && !assemblySource.includes('CORDIS_SECTION_NAME') && assemblySource.includes("section.name !== 'tool:cordis'"))
console.log('\n通过 ' + pass + ', 失败 ' + fail)
process.exit(fail === 0 ? 0 : 1)
