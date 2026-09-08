// extra-plan 预设静态校验：只读工作区模板，不访问生产 DSH_HOME。
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  SETTING_DEFINITIONS,
  parsePresetYaml,
  resolveSetting,
  findTextLocatorMatches,
} from '../../plugins/dsh-extra-plan/lib/preset-settings.js'

const REPO_ROOT = fileURLToPath(new URL('../..', import.meta.url))
const PRESET_DIR = join(REPO_ROOT, 'plugins', 'dsh-extra-plan', 'assets', 'presets', 'extra-plan')
const file = join(PRESET_DIR, 'agent.cordis.yml')
const presetFile = join(PRESET_DIR, 'preset.yml')
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

const registered = new Set([
  'subagent', 'subagent_review', 'subagent_probe', 'subagent_plan', 'workflow', 'ralph',
  'send_message', 'interrupt_agent', 'list_agents', 'ask_user_question',
  'todo_write', 'write', 'edit', 'read', 'glob', 'grep', 'pwsh', 'web_search', 'cordis_run',
])

let pass = 0
let fail = 0
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

const names = all.map((row) => typeof row.name === 'string' ? row.name : '')
const required = [
  '@deepseek-ai/dsh-persona', '@local/dsh-extra-plan', '@deepseek-ai/dsh-tool-ask-user',
  '@deepseek-ai/dsh-tool-subagent', '@deepseek-ai/dsh-tool-subagent-control',
  '@deepseek-ai/dsh-tool-subagent-control/list-agents', '@local/dsh-extra-plan/executor-spawn',
  '@deepseek-ai/dsh-workflow-worker-thread', '@deepseek-ai/dsh-tool-workflow',
  '@deepseek-ai/dsh-tool-ralph', '@deepseek-ai/dsh-compaction-basic', '@deepseek-ai/dsh-tool-cordis',
]
for (const req of required) {
  if (names.includes(req)) { pass += 1 } else { fail += 1; console.log('FAIL  缺少行: ' + req) }
}

const agentText = readFileSync(file, 'utf8')
const locatorChecks = SETTING_DEFINITIONS.map((definition) => {
  const parsed = resolveSetting(rows, definition, { aliases: false })
  const textMatches = findTextLocatorMatches(agentText, definition.locator)
  return { definition, parsed, textMatches }
})
if (locatorChecks.every((item) => item.parsed.kind === 'ok' && item.textMatches.length === 1)) {
  pass += 1
  console.log('PASS  设置白名单恰有 7 个唯一 locator（工作区模板）')
} else {
  fail += 1
  console.log('FAIL  设置白名单 locator 不完整或有歧义')
}
const defaults = Object.fromEntries(locatorChecks.map((item) => [item.definition.key, item.parsed.kind === 'ok' ? item.parsed.value : undefined]))
if (defaults.plannerModel === 'deepseek-v4-pro' && defaults.exploreBudget === 18 && defaults.anchoredBootstrap === true && defaults.runcodeCatchGate === false && defaults.webFetch === false && defaults.toolPresentationMode === 'native' && typeof defaults.plannerPromptSuffix === 'string') {
  pass += 1
  console.log('PASS  新版模板 7 项默认值来自实际叶值')
} else {
  fail += 1
  console.log('FAIL  新版模板默认值不符合验收锚点')
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
const plannerModel = pluginRow !== undefined && pluginRow.config && typeof pluginRow.config.plannerModel === 'string' ? pluginRow.config.plannerModel : ''
if (planRow !== undefined && plannerModel !== '') {
  pass += 1
  console.log('PASS  subagent_plan 行存在、plannerModel 已配置（=' + plannerModel + '）')
} else {
  fail += 1
  console.log('FAIL  subagent_plan 行或 plannerModel 配置缺失')
}
if (pluginRow !== undefined && pluginRow.config && pluginRow.config.usageLedger && pluginRow.config.usageLedger.enabled === true && pluginRow.config.anchoredBootstrap === true && typeof pluginRow.config.plannerPromptSuffix === 'string') {
  pass += 1
  console.log('PASS  extra-plan 插件行 config 完整（anchoredBootstrap/usageLedger 开启、plannerPromptSuffix 存在）')
} else {
  fail += 1
  console.log('FAIL  extra-plan 插件行 config 缺失')
}

console.log('\n通过 ' + pass + ', 失败 ' + fail)
process.exit(fail === 0 ? 0 : 1)
