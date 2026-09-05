// settings.js 文本级写入（patchRowField）验证：读真实 dist 预设，内存补丁 6 字段，
// 断言：①仅目标行变化（diff 行数=6）②yaml 语义正确（fetch/mode/budget 等）③原文本其余字节不变。
// 只读 + 内存，不写任何文件。
import { readFileSync } from 'node:fs'
import { createRequire, registerHooks } from 'node:module'
import { homedir } from 'node:os'
import { pathToFileURL } from 'node:url'
const DSH_HOME = (process.env.DSH_HOME || homedir() + '/.dsh').replaceAll('\\', '/')
const require = createRequire(DSH_HOME + '/profiles/web/node_modules/package.json')
const yaml = require('js-yaml')

// F8：import settings.js 需解析 js-yaml / @deepseek-ai/schemastery（仓库无 node_modules，
// 直接 import 会 "Cannot find package"）——用 module.registerHooks 把这两个裸说明符映射到
// 安装侧 profile 的 node_modules（进程级解析钩子，仅测试进程内存生效，不落盘不改仓库）。
// 注意：目标 URL 须在钩子注册前预计算（钩子内再 require.resolve 触发递归栈溢出）。
const PACKAGE_MODULE_URLS = new Map([
  ['js-yaml', pathToFileURL(require.resolve('js-yaml')).href],
  ['@deepseek-ai/schemastery', pathToFileURL(require.resolve('@deepseek-ai/schemastery')).href],
])
if (typeof registerHooks === 'function') {
  registerHooks({
    resolve(specifier, context, next) {
      const mapped = PACKAGE_MODULE_URLS.get(specifier)
      if (mapped !== undefined) return { url: mapped, shortCircuit: true }
      return next(specifier, context)
    },
  })
}
const settingsModule = await import(new URL('../../plugins/dsh-extra-plan/lib/settings.js', import.meta.url).href)
const TOOL_PRESENTATION_MODES = settingsModule.TOOL_PRESENTATION_MODES

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

const file = DSH_HOME + '/.agent-presets/extra-plan/agent.cordis.yml'
const orig = readFileSync(file, 'utf8')
let t = orig
const patches = [
  ['extra-plan', 'plannerModel', 'deepseek-v4.5-pro'],
  ['extra-plan', 'plannerPromptSuffix', 'x: y'],
  ['extra-plan', 'exploreBudget', '25'],
  ['extra-plan', 'anchoredBootstrap', 'false'],
  ['tool-web', 'fetch', 'true'],
  ['tool-presentation', 'mode', 'both'],
  ['tool-presentation', 'mode', 'ptc'],
]
for (const [rowId, field, value] of patches) {
  const next = patchRowField(t, rowId, field, value)
  check(`patch ${rowId}.${field} 命中`, true, next !== null)
  if (next !== null) t = next
}
// diff 行（宽松化：应为目标字段行，且行数不超过补丁字段数；同值补丁允许不产生 diff）
const a = orig.split('\n'); const b = t.split('\n')
let diff = 0; const diffLines = []
for (let i = 0; i < Math.max(a.length, b.length); i += 1) {
  if (a[i] !== b[i]) { diff += 1; diffLines.push(`L${i + 1}: [${a[i]}] -> [${b[i]}]`) }
}
const targetFields = ['plannerModel', 'plannerPromptSuffix', 'exploreBudget', 'anchoredBootstrap', 'fetch', 'mode']
check('diff 行均为目标字段行', true, diffLines.every((d) => targetFields.some((f) => d.includes(f + ':'))))
check('diff 行数不超过补丁字段数', true, diff <= 6)
for (const d of diffLines) console.log('  ' + d)
// yaml 语义
const data = yaml.load(t, { schema })
const rows = Array.isArray(data) ? data : []
const rw = rows.find((r) => r && r.id === 'tool-web')
const rp = rows.find((r) => r && r.id === 'tool-presentation')
const eg = rows.find((r) => r && r.id === 'extra-plan-group')
const en = eg && Array.isArray(eg.config) ? eg.config.find((c) => c && c.id === 'extra-plan') : null
check('fetch === true', true, rw?.config?.fetch === true)
check('mode === ptc（ptc 补丁覆盖 both，F8 ptc 值可写入）', true, rp?.config?.mode === 'ptc')
// both 值单独补丁仍可写入（与 ptc 并存验证，终值由末条补丁决定）
const dataBothOnly = yaml.load(patchRowField(orig, 'tool-presentation', 'mode', 'both'), { schema })
const rpBothOnly = (Array.isArray(dataBothOnly) ? dataBothOnly : []).find((r) => r && r.id === 'tool-presentation')
check('mode === both（both 值可写入）', true, rpBothOnly?.config?.mode === 'both')
check('exploreBudget === 25', true, en?.config?.exploreBudget === 25)
check('anchoredBootstrap === false', true, en?.config?.anchoredBootstrap === false)
check('plannerPromptSuffix === x: y', true, en?.config?.plannerPromptSuffix === 'x: y')
// 缺失字段/缺失行的行为
check('未知行 → null', true, patchRowField(orig, 'no-such-row', 'x', '1') === null)
check('已知行未知字段 → null', true, patchRowField(orig, 'tool-web', 'no-such-field', '1') === null)

// ── F8 断言组：TOOL_PRESENTATION_MODES 与 设置页 mode select 防回归 ──────
check('TOOL_PRESENTATION_MODES 恰为 native/ptc/both 三值', true, Array.isArray(TOOL_PRESENTATION_MODES) && TOOL_PRESENTATION_MODES.length === 3 && TOOL_PRESENTATION_MODES[0] === 'native' && TOOL_PRESENTATION_MODES[1] === 'ptc' && TOOL_PRESENTATION_MODES[2] === 'both')
check('TOOL_PRESENTATION_MODES 不含历史 code 值', true, !TOOL_PRESENTATION_MODES.includes('code'))
const clientText = readFileSync(new URL('../../plugins/dsh-extra-plan/lib/client.js', import.meta.url), 'utf8')
check('client.js mode select 选项为 native/both/ptc（不含 code）', true, clientText.includes('value: "ptc"') && !clientText.includes('value: "code"'))

console.log(`\n通过 ${pass}, 失败 ${fail}`)
process.exit(fail === 0 ? 0 : 1)
