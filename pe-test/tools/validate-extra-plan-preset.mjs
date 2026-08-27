// extra-plan 预设静态校验：YAML 语法 + toolFilter deny 清单存在性（R2 教训）
import { createRequire } from 'node:module'
import { readFileSync } from 'node:fs'
import { homedir } from 'node:os'
const DSH_HOME = (process.env.DSH_HOME || homedir() + '/.dsh').replaceAll('\\', '/')
const require = createRequire(DSH_HOME + '/profiles/web/node_modules/package.json')
const yaml = require('js-yaml')

const JsExpr = new yaml.Type('tag:yaml.org,2002:js', {
  kind: 'scalar',
  resolve: () => true,
  construct: (data) => data,
})
const schema = yaml.JSON_SCHEMA.extend(JsExpr)

const file = DSH_HOME + '/.agent-presets/extra-plan/agent.cordis.yml'
let rows
try {
  rows = yaml.load(readFileSync(file, 'utf8'), { schema })
} catch (error) {
  console.error(`FAIL  YAML 解析失败: ${error.message}`)
  process.exit(1)
}
console.log(`PASS  YAML 解析成功（${Array.isArray(rows) ? rows.length : '非数组!'} 行）`)

// extra-plan 预设实际注册的委派/文件类工具名（deny 只允许列这些名字）
const registered = new Set([
  'subagent', 'subagent_review', 'subagent_plan', 'workflow', 'ralph',
  'send_message', 'interrupt_agent', 'list_agents', 'ask_user_question',
  'todo_write', 'write', 'edit', 'read', 'glob', 'grep', 'pwsh', 'web_search',
])

let pass = 0
let fail = 0
function checkDeny(label, denyList) {
  const unknown = denyList.filter((name) => !registered.has(name))
  if (unknown.length > 0) {
    fail += 1
    console.log(`FAIL  ${label} 含本预设不存在的工具名: ${unknown.join(', ')}`)
  } else {
    pass += 1
    console.log(`PASS  ${label}（${denyList.length} 项，全部存在）`)
  }
}

const subagentRows = []
function flatten(list) {
  const out = []
  for (const r of list) {
    if (r === null || typeof r !== 'object') continue
    out.push(r)
    if (r.group === true && Array.isArray(r.config)) out.push(...flatten(r.config))
  }
  return out
}
const all = flatten(rows)
for (const row of all) {
  if (row.name === '@deepseek-ai/dsh-tool-subagent' && row.disabled !== true) subagentRows.push(row)
}
for (const row of subagentRows) {
  const deny = row.config && row.config.toolFilter && Array.isArray(row.config.toolFilter.deny) ? row.config.toolFilter.deny : []
  checkDeny(`toolFilter deny [${row.config.toolName}]`, deny)
}

for (const inner of all) {
  if (inner.name === '@local/dsh-extra-plan/executor-spawn') {
    const deny = inner.config && Array.isArray(inner.config.deny) ? inner.config.deny : []
    checkDeny('executor-spawn deny', deny)
  }
}

// 关键行存在性
const names = all.map((r) => (typeof r.name === 'string' ? r.name : ''))
const required = [
  '@deepseek-ai/dsh-persona', '@local/dsh-extra-plan', '@deepseek-ai/dsh-tool-ask-user',
  '@deepseek-ai/dsh-tool-subagent', '@deepseek-ai/dsh-tool-subagent-control',
  '@deepseek-ai/dsh-tool-subagent-control/list-agents', '@local/dsh-extra-plan/executor-spawn',
  '@deepseek-ai/dsh-workflow-worker-thread', '@deepseek-ai/dsh-tool-workflow',
  '@deepseek-ai/dsh-tool-ralph', '@deepseek-ai/dsh-compaction-basic',
]
for (const req of required) {
  if (names.includes(req)) { pass += 1 } else { fail += 1; console.log(`FAIL  缺少行: ${req}`) }
}
const planRow = subagentRows.find((r) => r.config && r.config.toolName === 'subagent_plan')
if (planRow !== undefined && planRow.config && planRow.config.agentOptions && planRow.config.agentOptions.model === 'deepseek-v4-pro') {
  pass += 1
  console.log('PASS  subagent_plan 行 model=deepseek-v4-pro、continuable')
} else {
  fail += 1
  console.log('FAIL  subagent_plan 行缺 pro 模型配置')
}
const pluginRow = all.find((r) => r.name === '@local/dsh-extra-plan')
if (pluginRow !== undefined && pluginRow.config && pluginRow.config.usageLedger && pluginRow.config.usageLedger.enabled === true && pluginRow.config.anchoredBootstrap === true && typeof pluginRow.config.plannerPromptSuffix === 'string') {
  pass += 1
  console.log('PASS  extra-plan 插件行 config 完整（anchoredBootstrap/usageLedger 开启、plannerPromptSuffix 存在）')
} else {
  fail += 1
  console.log('FAIL  extra-plan 插件行 config 缺失')
}

console.log(`\n通过 ${pass}, 失败 ${fail}`)
process.exit(fail === 0 ? 0 : 1)
