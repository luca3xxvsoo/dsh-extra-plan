// settings.js 文本级写入（patchRowField）验证：读真实 dist 预设，内存补丁 6 字段，
// 断言：①仅目标行变化（diff 行数=6）②yaml 语义正确（fetch/mode/budget 等）③原文本其余字节不变。
// 只读 + 内存，不写任何文件。
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
const require = createRequire('C:/Users/SheepToken/.dsh/profiles/web/node_modules/package.json')
const yaml = require('js-yaml')

const JsExpr = new yaml.Type('tag:yaml.org,2002:js', {
  kind: 'scalar', resolve: (d) => typeof d === 'string', construct: (d) => ({ __jsExpr: d }),
  predicate: (d) => d != null && typeof d === 'object' && typeof d.__jsExpr === 'string', represent: (d) => d.__jsExpr,
})
const schema = yaml.JSON_SCHEMA.extend(JsExpr)

// —— 与 lib/settings.js 保持一致（防复制漂移：改动须同步）——
export function yamlScalar(v) {
  const s = String(v)
  if (/^(true|false|null|~|-?\d+(?:\.\d+)?)$/.test(s)) return s
  if (/^[A-Za-z0-9_\-./@]+$/.test(s)) return s
  return "'" + s.replace(/'/g, "''") + "'"
}
export function patchRowField(text, rowId, field, value) {
  const lines = text.split('\n')
  const rowRe = new RegExp('^\\s*- id: ' + rowId + '\\s*$')
  const start = lines.findIndex((l) => rowRe.test(l))
  if (start === -1) return null
  const fieldRe = new RegExp('^(\\s*)' + field + ': .*$')
  const v = yamlScalar(value)
  for (let i = start + 1; i < lines.length && i <= start + 40; i += 1) {
    if (fieldRe.test(lines[i])) {
      lines[i] = lines[i].replace(/:\s.*$/, ': ' + v)
      return lines.join('\n')
    }
  }
  return null
}

let pass = 0
let fail = 0
function check(label, expected, actual) {
  if (expected === actual) { pass += 1; console.log(`PASS  ${label}`) }
  else { fail += 1; console.log(`FAIL  ${label}: 期望 ${expected} 实际 ${actual}`) }
}

const file = 'C:/Users/SheepToken/.dsh/.agent-presets/extra-plan/agent.cordis.yml'
const orig = readFileSync(file, 'utf8')
let t = orig
const patches = [
  ['extra-plan', 'plannerModel', 'deepseek-v4.5-pro'],
  ['extra-plan', 'plannerPromptSuffix', 'x: y'],
  ['extra-plan', 'exploreBudget', '25'],
  ['extra-plan', 'anchoredBootstrap', 'false'],
  ['tool-web', 'fetch', 'true'],
  ['tool-presentation', 'mode', 'both'],
]
for (const [rowId, field, value] of patches) {
  const next = patchRowField(t, rowId, field, value)
  check(`patch ${rowId}.${field} 命中`, true, next !== null)
  if (next !== null) t = next
}
// diff 行数（应恰为 6 行，且都是目标行）
const a = orig.split('\n'); const b = t.split('\n')
let diff = 0; const diffLines = []
for (let i = 0; i < Math.max(a.length, b.length); i += 1) {
  if (a[i] !== b[i]) { diff += 1; diffLines.push(`L${i + 1}: [${a[i]}] -> [${b[i]}]`) }
}
check('diff 行数 = 6（仅目标行）', 6, diff)
for (const d of diffLines) console.log('  ' + d)
// yaml 语义
const data = yaml.load(t, { schema })
const rows = Array.isArray(data) ? data : []
const rw = rows.find((r) => r && r.id === 'tool-web')
const rp = rows.find((r) => r && r.id === 'tool-presentation')
const eg = rows.find((r) => r && r.id === 'extra-plan-group')
const en = eg && Array.isArray(eg.config) ? eg.config.find((c) => c && c.id === 'extra-plan') : null
check('fetch === true', true, rw?.config?.fetch === true)
check('mode === both', true, rp?.config?.mode === 'both')
check('exploreBudget === 25', true, en?.config?.exploreBudget === 25)
check('anchoredBootstrap === false', true, en?.config?.anchoredBootstrap === false)
check('plannerPromptSuffix === x: y', true, en?.config?.plannerPromptSuffix === 'x: y')
// 缺失字段/缺失行的行为
check('未知行 → null', true, patchRowField(orig, 'no-such-row', 'x', '1') === null)
check('已知行未知字段 → null', true, patchRowField(orig, 'tool-web', 'no-such-field', '1') === null)

console.log(`\n通过 ${pass}, 失败 ${fail}`)
process.exit(fail === 0 ? 0 : 1)
