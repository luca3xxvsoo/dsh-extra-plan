// 设置页 Host API 集成回归：真实 apply + loopback HTTP。
// agent/preset、profile 与所有写入均来自工作区模板或系统临时 DSH_HOME。

import { createServer, request as httpRequest } from 'node:http'
import { createRequire, registerHooks } from 'node:module'
import { existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { homedir, tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const dependencyBases = [
  import.meta.url,
  join(process.env.APPDATA || join(homedir(), 'AppData', 'Roaming'), 'npm', 'node_modules', '@deepseek-ai', 'dsh', 'package.json'),
]
let dependencyRequire = null
for (const base of dependencyBases) {
  try {
    const candidate = createRequire(base)
    candidate.resolve('js-yaml')
    candidate.resolve('@deepseek-ai/schemastery')
    dependencyRequire = candidate
    break
  } catch { /* try the next read-only dependency location */ }
}
if (dependencyRequire === null) throw new Error('未找到 settings.js 回归所需依赖')
const packageModuleUrls = new Map([
  ['@deepseek-ai/schemastery', pathToFileURL(dependencyRequire.resolve('@deepseek-ai/schemastery')).href],
])
if (typeof registerHooks === 'function') {
  registerHooks({
    resolve(specifier, context, next) {
      const mapped = packageModuleUrls.get(specifier)
      if (mapped !== undefined) return { url: mapped, shortCircuit: true }
      return next(specifier, context)
    },
  })
}

const settingsModule = await import(new URL('../../plugins/dsh-extra-plan/lib/settings.js', import.meta.url).href)
const presetSettings = await import(new URL('../../plugins/dsh-extra-plan/lib/preset-settings.js', import.meta.url).href)
const {
  SETTING_DEFINITIONS,
  getSettingDefinition,
  parsePresetYaml,
  patchYamlScalar,
  publicSettingMetadata,
  resolveSetting,
} = presetSettings
const { DEFAULT_EXPLORE_BUDGET } = await import(new URL('../../plugins/dsh-extra-plan/lib/preset-defaults.generated.js', import.meta.url).href)

const HERE = fileURLToPath(new URL('.', import.meta.url))
const ASSET_DIR = join(HERE, '..', '..', 'plugins', 'dsh-extra-plan', 'assets', 'presets', 'extra-plan')
const TEMPLATE_AGENT = readFileSync(join(ASSET_DIR, 'agent.cordis.yml'), 'utf8')
const TEMPLATE_PRESET = readFileSync(join(ASSET_DIR, 'preset.yml'), 'utf8')
const definition = (key) => getSettingDefinition(key)
const managedDefinitions = SETTING_DEFINITIONS.filter((item) => item.ui.separate === undefined)

let pass = 0
let fail = 0
function check(label, condition) {
  if (condition) { pass += 1; console.log('PASS  ' + label) }
  else { fail += 1; console.log('FAIL  ' + label) }
}

function requestJson(port, method, route, value) {
  const payload = value === undefined ? null : JSON.stringify(value)
  return new Promise((resolve, reject) => {
    const headers = { accept: 'application/json' }
    if (payload !== null) {
      headers['content-type'] = 'application/json'
      headers['content-length'] = Buffer.byteLength(payload)
    }
    const req = httpRequest({ hostname: '127.0.0.1', port, path: route, method, headers }, (res) => {
      const chunks = []
      res.setEncoding('utf8')
      res.on('data', (chunk) => chunks.push(chunk))
      res.on('end', () => {
        const raw = chunks.join('')
        let body = null
        try { body = JSON.parse(raw) } catch { /* keep null for assertions */ }
        resolve({ status: res.statusCode, body, raw })
      })
    })
    req.on('error', reject)
    if (payload !== null) req.write(payload)
    req.end()
  })
}

function diffLines(before, after) {
  const a = before.split('\n')
  const b = after.split('\n')
  const out = []
  for (let i = 0; i < Math.max(a.length, b.length); i += 1) {
    if (a[i] !== b[i]) out.push({ line: i + 1, before: a[i], after: b[i] })
  }
  return out
}

function patchAgent(values) {
  let text = TEMPLATE_AGENT
  for (const [key, value] of Object.entries(values)) {
    const patched = patchYamlScalar(text, definition(key), value)
    if (!patched.ok) throw new Error('fixture patch failed: ' + key)
    text = patched.text
  }
  return text
}

function valuesFrom(payload) {
  return payload && payload.values && typeof payload.values === 'object' ? payload.values : {}
}

const previousDshHome = process.env.DSH_HOME
const fixtureHome = mkdtempSync(join(tmpdir(), 'dsh-extra-plan-settings-'))
const presetDir = join(fixtureHome, '.agent-presets', 'extra-plan')
const webPlugin = join(fixtureHome, 'profiles', 'web', 'node_modules', '@local', 'dsh-extra-plan')
let server = null
let serverStarted = false

const oldValues = {
  plannerModel: 'api-old-model',
  crossProviderPlannerModel: true,
  plannerPromptSuffix: 'api old suffix',
  exploreBudget: 12,
  otherAgentModel: 'api-old-other-model',
  anchoredBootstrap: false,
  creativeMode: false,
  runcodeCatchGate: true,
  webFetch: true,
  toolPresentationMode: 'ptc',
}
const newValues = {
  plannerModel: 'api-new-model',
  crossProviderPlannerModel: false,
  plannerPromptSuffix: 'new: suffix',
  exploreBudget: 31,
  otherAgentModel: 'api-new-other-model',
  anchoredBootstrap: true,
  creativeMode: true,
  runcodeCatchGate: false,
  webFetch: false,
  toolPresentationMode: 'both',
}

try {
  process.env.DSH_HOME = fixtureHome
  mkdirSync(presetDir, { recursive: true })
  mkdirSync(webPlugin, { recursive: true })
  writeFileSync(join(presetDir, 'preset.yml'), TEMPLATE_PRESET, 'utf8')
  writeFileSync(join(presetDir, 'agent.cordis.yml'), patchAgent(oldValues), 'utf8')

  const metadata = publicSettingMetadata(TEMPLATE_AGENT, patchAgent(oldValues))
  check('共享 metadata 恰有 10 项且默认来自新版模板', metadata.fields.length === 10 && metadata.fields.find((field) => field.key === 'exploreBudget').default === DEFAULT_EXPLORE_BUDGET && metadata.fields.find((field) => field.key === 'crossProviderPlannerModel').default === false && metadata.fields.find((field) => field.key === 'otherAgentModel').default === '')

  const routeDefinitions = []
  const settingsRegistrations = []
  const mockContext = {
    inject(deps, callback) {
      if (deps[0] === 'settings') {
        callback({ settings: { register: (name) => settingsRegistrations.push(name) } })
        return
      }
      if (deps[0] === 'webServer') {
        callback({
          effect: (effectFn) => effectFn(),
          webServer: {
            register: (definition) => { routeDefinitions.push(definition); return () => {} },
          },
        })
        return
      }
      throw new Error('unexpected dependency: ' + deps.join(','))
    },
  }
  settingsModule.apply(mockContext)
  const route = routeDefinitions.find((item) => item.path === '/api/dsh-extra-plan-settings')
  check('真实 apply 注册设置路由与命名空间', route !== undefined && typeof route.handler === 'function' && settingsRegistrations.includes('dsh-extra-plan'))
  if (route === undefined || typeof route.handler !== 'function') throw new Error('真实设置 handler 未注册')

  const handler = route.handler
  server = createServer((req, res) => {
    Promise.resolve(handler(req, res)).catch((error) => {
      if (!res.headersSent) {
        res.writeHead(500, { 'content-type': 'application/json; charset=utf-8' })
        res.end(JSON.stringify({ error: String(error && error.message || error) }))
      }
    })
  })
  const port = await new Promise((resolve, reject) => {
    server.once('error', reject)
    server.listen(0, '127.0.0.1', () => resolve(server.address().port))
  })
  serverStarted = true

  const proBefore = await requestJson(port, 'GET', '/api/dsh-extra-plan-settings/pro-config')
  check('pro-config GET 返回 10 项 metadata 与旧值', proBefore.status === 200 && proBefore.body.fields.length === 10 && valuesFrom(proBefore.body).plannerModel === oldValues.plannerModel && valuesFrom(proBefore.body).creativeMode === oldValues.creativeMode && valuesFrom(proBefore.body).crossProviderPlannerModel === true && valuesFrom(proBefore.body).otherAgentModel === oldValues.otherAgentModel && valuesFrom(proBefore.body).toolPresentationMode === oldValues.toolPresentationMode)
  const fieldMap = new Map(proBefore.body.fields.map((field) => [field.key, field]))
  const fieldKeys = proBefore.body.fields.map((field) => field.key)
  check('pro metadata 控件/min/mode 由描述表提供', fieldMap.get('exploreBudget').control === 'number' && fieldMap.get('exploreBudget').min === 1 && fieldMap.get('toolPresentationMode').options.join('/') === 'native/ptc/both' && fieldMap.get('crossProviderPlannerModel').control === 'select' && fieldMap.get('crossProviderPlannerModel').options.join('/') === 'true/false' && fieldMap.get('otherAgentModel').control === 'text')
  const generalKeys = ['anchoredBootstrap', 'creativeMode', 'webFetch', 'toolPresentationMode', 'runcodeCatchGate']
  const proKeys = ['crossProviderPlannerModel', 'plannerModel', 'plannerPromptSuffix', 'exploreBudget', 'otherAgentModel']
  check('metadata 通用设置区块顺序与 section', generalKeys.every((key, index) => fieldKeys[index] === key && fieldMap.get(key).section === 'general'))
  check('metadata pro 规划区块顺序与 section', proKeys.every((key, index) => fieldKeys[index + generalKeys.length] === key && fieldMap.get(key).section === 'pro') && proBefore.body.fields.every((field) => field.section !== undefined))
  check('pro 区块内跨提供方紧跟使用模型', fieldKeys.indexOf('crossProviderPlannerModel') + 1 === fieldKeys.indexOf('plannerModel'))

  const beforePut = readFileSync(join(presetDir, 'agent.cordis.yml'), 'utf8')
  const putBody = { ...newValues }
  const proPut = await requestJson(port, 'PUT', '/api/dsh-extra-plan-settings/pro-config', putBody)
  check('pro-config PUT 返回更新后的实际 values', proPut.status === 200 && valuesFrom(proPut.body).plannerModel === newValues.plannerModel && valuesFrom(proPut.body).creativeMode === newValues.creativeMode && valuesFrom(proPut.body).crossProviderPlannerModel === false && valuesFrom(proPut.body).exploreBudget === newValues.exploreBudget && valuesFrom(proPut.body).otherAgentModel === newValues.otherAgentModel && valuesFrom(proPut.body).toolPresentationMode === newValues.toolPresentationMode)
  const afterPut = readFileSync(join(presetDir, 'agent.cordis.yml'), 'utf8')
  const changed = diffLines(beforePut, afterPut)
  const managedLeaves = managedDefinitions.map((item) => item.path.split('.').at(-1))
  check('pro PUT 只改描述表登记的标量行', changed.length === managedDefinitions.length && changed.every((item) => managedLeaves.some((leaf) => item.after.includes(leaf + ':'))))
  const parsedAfterPut = parsePresetYaml(afterPut)
  check('pro PUT 目标文件 10 项由稳定 locator 读取', managedDefinitions.every((item) => {
    const value = resolveSetting(parsedAfterPut, item, { aliases: false })
    return value.kind === 'ok' && value.value === (item.key === 'plannerModel' ? newValues.plannerModel : newValues[item.key])
  }))

  const truePut = await requestJson(port, 'PUT', '/api/dsh-extra-plan-settings/pro-config', { ...newValues, crossProviderPlannerModel: true })
  check('pro PUT crossProviderPlannerModel:true → 200 且写入 true', truePut.status === 200 && valuesFrom(truePut.body).crossProviderPlannerModel === true && readFileSync(join(presetDir, 'agent.cordis.yml'), 'utf8').includes('crossProviderPlannerModel: true'))
  const falsePut = await requestJson(port, 'PUT', '/api/dsh-extra-plan-settings/pro-config', { ...newValues, crossProviderPlannerModel: false })
  check('pro PUT crossProviderPlannerModel:false → 200 且写入 false', falsePut.status === 200 && valuesFrom(falsePut.body).crossProviderPlannerModel === false && readFileSync(join(presetDir, 'agent.cordis.yml'), 'utf8').includes('crossProviderPlannerModel: false'))

  // T4：plannerModel 空白/空串已合法（显式清空=继承主会话模型），移出非法值表；
  // 其正例在同段末尾单独断言（PUT 200 + GET 回显空串 + 文件写回空串标量）。
  const invalidBodies = [
    ['crossProviderPlannerModel 字符串', { crossProviderPlannerModel: 'true' }],
    ['crossProviderPlannerModel 数字', { crossProviderPlannerModel: 1 }],
    ['crossProviderPlannerModel null', { crossProviderPlannerModel: null }],
    ['exploreBudget 0', { exploreBudget: 0 }],
    ['plannerPromptSuffix 非 string', { plannerPromptSuffix: 1 }],
    ['otherAgentModel 数字', { otherAgentModel: 1 }],
    ['otherAgentModel null', { otherAgentModel: null }],
    ['creativeMode 字符串', { creativeMode: 'true' }],
    ['creativeMode 数字', { creativeMode: 1 }],
    ['creativeMode null', { creativeMode: null }],
    ['anchoredBootstrap string', { anchoredBootstrap: 'true' }],
    ['webFetch number', { webFetch: 1 }],
    ['toolPresentationMode code', { toolPresentationMode: 'code' }],
  ]
  for (const [label, invalid] of invalidBodies) {
    const result = await requestJson(port, 'PUT', '/api/dsh-extra-plan-settings/pro-config', { ...newValues, ...invalid })
    check('pro 严格拒绝 ' + label, result.status === 400)
  }

  // T4 正例：plannerModel 空串（显式清空 → 继承主会话模型）可保存且原样回显
  const emptyPut = await requestJson(port, 'PUT', '/api/dsh-extra-plan-settings/pro-config', { ...newValues, plannerModel: '' })
  check('pro PUT plannerModel:"" → 200 且 values.plannerModel 为空串', emptyPut.status === 200 && valuesFrom(emptyPut.body).plannerModel === '')
  const emptyGet = await requestJson(port, 'GET', '/api/dsh-extra-plan-settings/pro-config')
  check('pro GET 回显 plannerModel 为空串（未被回填资产默认）', emptyGet.status === 200 && valuesFrom(emptyGet.body).plannerModel === '')
  const emptyText = readFileSync(join(presetDir, 'agent.cordis.yml'), 'utf8')
  check('空串写回 plannerModel: \'\' 标量行（键保留、不删行、不回填默认值）', emptyText.includes("plannerModel: ''") && !emptyText.includes('plannerModel: deepseek-v4-pro'))

  const otherEmptyPut = await requestJson(port, 'PUT', '/api/dsh-extra-plan-settings/pro-config', { ...newValues, plannerModel: '', otherAgentModel: '' })
  check('pro PUT otherAgentModel:"" → 200 且 values.otherAgentModel 为空串', otherEmptyPut.status === 200 && valuesFrom(otherEmptyPut.body).otherAgentModel === '')
  const otherEmptyGet = await requestJson(port, 'GET', '/api/dsh-extra-plan-settings/pro-config')
  check('pro GET 回显 otherAgentModel 为空串（未被默认覆盖）', otherEmptyGet.status === 200 && valuesFrom(otherEmptyGet.body).otherAgentModel === '')
  const otherEmptyText = readFileSync(join(presetDir, 'agent.cordis.yml'), 'utf8')
  check("空串写回 otherAgentModel: '' 标量行", otherEmptyText.includes("otherAgentModel: ''"))

  const clientText = readFileSync(new URL('../../plugins/dsh-extra-plan/lib/client.js', import.meta.url), 'utf8')
  const expectedHints = {
    anchoredBootstrap: '首轮极简工具 + 提示词',
    creativeMode: '是否开启dsh官方创造模式',
    webFetch: '是否开启web_fetch',
    toolPresentationMode: '工具呈现方式切换（默认/混合/PTC模式）',
    runcodeCatchGate: 'PTC模式下，增加每个工具调用需要try catch的闸门。通过限制+建议的模式保障仅单个调用报错',
    crossProviderPlannerModel: '允许跨提供方选择模型。开启时将以 其他提供方 - 主会话提供方 - deepseek官方 的顺序，获取可用模型。关闭时仅从主会话提供方获取。默认关闭',
    plannerModel: 'pro规划默认使用模型。未匹配/置空时：使用主会话模型',
    plannerPromptSuffix: '在主会话发送给pro规划的任务结尾，拼接上的内容。可能能增加pro规划的智商（未验证）。可置空',
    exploreBudget: '允许pro规划调用工具的次数，避免后台无限制调用。同时限制一次runcode内可调用的工具上限数',
    otherAgentModel: '其他子代理默认使用模型。未匹配/置空时：使用主会话模型',
  }
  check('client 按 metadata 渲染控件且无硬编码模板路径/默认/枚举值', clientText.includes('setFields(fields)') && clientText.includes('field.options') && clientText.includes('field.min') && clientText.includes('field.step') && clientText.includes('field.type === "integer" ? Number(value)') && !clientText.includes('agent.cordis.yml') && !clientText.includes('value: "native"') && !clientText.includes('value: "ptc"') && !clientText.includes(': 18'))
  check('client 标签与三项 zh 文案已对齐', clientText.includes('cardDescription: "配置按需规划模式的参数"') && clientText.includes('plannerModel: "pro规划 | 使用模型"') && clientText.includes('creativeMode: "创造模式开关"') && clientText.includes('plannerPromptSuffix: "pro规划 | 额外引导"') && clientText.includes('exploreBudget: "pro规划 | 探查额度"') && clientText.includes('otherAgentModel: "其他子代理 | 使用模型"') && clientText.includes('crossProviderPlannerModel: "跨提供方"') && clientText.includes('toolPresentationModePtc: "PTC模式"') && !clientText.includes('plannerModel: "使用模型"') && !clientText.includes('plannerPromptSuffix: "额外引导"') && !clientText.includes('exploreBudget: "探查额度"'))
  for (const [key, hint] of Object.entries(expectedHints)) {
    check('client 静态 hint ' + key, clientText.includes(key + ': "' + hint + '"'))
  }
  const fieldRenderStart = clientText.indexOf('return el("label", { className: "esp-field"')
  const fieldRenderText = fieldRenderStart < 0 ? '' : clientText.slice(fieldRenderStart, fieldRenderStart + 700)
  check('client 10 个字段统一按 head→control→hint 渲染', Object.keys(expectedHints).every((key) => clientText.includes(key)) && clientText.includes('FIELD_HINTS[key]') && fieldRenderText.indexOf('className: "esp-fieldHead"') >= 0 && fieldRenderText.indexOf('control,') > fieldRenderText.indexOf('className: "esp-fieldHead"') && fieldRenderText.indexOf('className: "esp-hint"') > fieldRenderText.indexOf('control,'))
  check('client 保留通用设置与 pro规划模块双区块', clientText.includes('t("generalSection")') && clientText.includes('t("proSection")') && clientText.includes('generalFields.map(renderField)') && clientText.includes('proFields.map(renderField)'))
  check('client 使用本地稳定卡片/字段样式与相邻分隔线', clientText.includes('.esp-card{') && clientText.includes('.esp-cardOpen') && clientText.includes('.esp-cardHeader{') && clientText.includes('.esp-cardBody{') && clientText.includes('.esp-cardFooter{') && clientText.includes('.esp-field{display:flex;flex-direction:column;gap:6px;padding:12px 0}') && clientText.includes('.esp-field + .esp-field{border-top:.5px solid var(--dsw-alias-border-l2)}') && clientText.includes('border-radius:16px') && clientText.includes('padding:14px 16px') && clientText.includes('margin:0 16px;padding-bottom:8px') && clientText.includes('padding:12px 0 4px'))
  const readyBlockStart = clientText.indexOf('return el(React.Fragment, null,')
  const readyBlockText = readyBlockStart < 0 ? '' : clientText.slice(readyBlockStart, readyBlockStart + 1200)
  const espCardFooterCount = (clientText.match(/className: "esp-cardFooter"/g) || []).length
  check('client 双内嵌卡片官方稳定外观与共享保存区', clientText.includes('.esp-wrap{display:flex;flex-direction:column;gap:20px;') && clientText.includes('.esp-section{border:.5px solid var(--dsw-alias-border-l4);background:var(--dsw-alias-bg-layer-3);border-radius:16px;padding:14px 16px;display:flex;flex-direction:column;gap:0}') && clientText.includes('.esp-section + .esp-section{margin-top:0}') && !clientText.includes('.esp-section{display:flex;flex-direction:column;gap:0;padding:10px 0 0}') && !clientText.includes('.esp-section + .esp-section{margin-top:8px}') && readyBlockText.includes('t("generalSection")') && readyBlockText.includes('generalFields.map(renderField)') && readyBlockText.includes('t("proSection")') && readyBlockText.includes('proFields.map(renderField)') && clientText.includes('className: "esp-cardBody"') && readyBlockText.includes('className: "esp-cardFooter"') && espCardFooterCount === 1)
  check('client 控件尺寸/焦点与 textarea 视觉契约', clientText.includes('font-size:13px;font-weight:500;line-height:1.5') && clientText.includes('height:34px') && clientText.includes('border-radius:8px;padding:0 12px') && clientText.includes(':focus-visible') && clientText.includes('resize:vertical;min-height:80px'))
  check('client 无官方哈希类、未公开组件或 README 运行时依赖', !clientText.includes('YyYd_a_') && !clientText.includes('At1oFq_') && !clientText.includes('ValueField') && !clientText.includes('PluginCard') && !clientText.includes('CardForm') && !clientText.includes('README.md'))
  check('hint/option 工具呈现模式统一为 PTC模式', clientText.includes('toolPresentationMode: "工具呈现模式"') && clientText.includes('toolPresentationModePtc: "PTC模式"') && clientText.includes('toolPresentationMode: "工具呈现方式切换（默认/混合/PTC模式）"'))
  check('client 保留 GET/PUT、slot key 与 slots/locale 注入', clientText.includes('const PRO_CONFIG_URL = "/api/dsh-extra-plan-settings/pro-config"') && clientText.includes('method: "PUT"') && clientText.includes('key: "dsh-extra-plan"') && clientText.includes('exports.inject = ["slots", "locale"]') && clientText.includes('inject: () => ({})'))
} catch (error) {
  fail += 1
  console.error('FAIL  设置页 HTTP 回归异常: ' + String(error && error.stack || error))
} finally {
  if (server !== null && serverStarted) await new Promise((resolve) => server.close(() => resolve()))
  if (previousDshHome === undefined) delete process.env.DSH_HOME
  else process.env.DSH_HOME = previousDshHome
  rmSync(fixtureHome, { recursive: true, force: true })
}

console.log('\n通过 ' + pass + ', 失败 ' + fail)
process.exit(fail === 0 ? 0 : 1)
