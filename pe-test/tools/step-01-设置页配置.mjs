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
const qqbotDir = join(fixtureHome, 'profiles', 'qqbot')
const qqbotQuestionsDir = join(qqbotDir, 'node_modules', '@local', 'dsh-qqbot-user-questions')
let server = null
let serverStarted = false

const oldValues = {
  plannerModel: 'api-old-model',
  plannerPromptSuffix: 'api old suffix',
  exploreBudget: 12,
  anchoredBootstrap: false,
  runcodeCatchGate: true,
  flashGuideEnabled: true,
  webFetch: true,
  toolPresentationMode: 'ptc',
}
const newValues = {
  plannerModel: 'api-new-model',
  plannerPromptSuffix: 'new: suffix',
  exploreBudget: 31,
  anchoredBootstrap: true,
  runcodeCatchGate: false,
  webFetch: false,
  toolPresentationMode: 'both',
}

try {
  process.env.DSH_HOME = fixtureHome
  mkdirSync(presetDir, { recursive: true })
  mkdirSync(webPlugin, { recursive: true })
  mkdirSync(qqbotQuestionsDir, { recursive: true })
  writeFileSync(join(presetDir, 'preset.yml'), TEMPLATE_PRESET, 'utf8')
  writeFileSync(join(presetDir, 'agent.cordis.yml'), patchAgent(oldValues), 'utf8')
  writeFileSync(join(qqbotDir, 'package.json'), JSON.stringify({ dsh: { profile: { bundles: ['@tencent-connect/dsh-qqbot'] } } }), 'utf8')
  const patchFile = join(qqbotDir, 'cordis.patch.yml')
  const topIdLine = '- id: qqbot-user-questions              # top-level config'
  writeFileSync(patchFile, [
    topIdLine,
    '  config:',
    '    approvalEnabled: true',
    '- id: unrelated',
    '  config:',
    '    keep: unchanged',
    '- insert:',
    '  - id: qqbot-user-questions',
    '    config:',
    '      approvalEnabled: false',
  ].join('\n') + '\n', 'utf8')

  const metadata = publicSettingMetadata(TEMPLATE_AGENT, patchAgent(oldValues))
  check('共享 metadata 恰有 8 项且默认来自新版模板', metadata.fields.length === 8 && metadata.fields.find((field) => field.key === 'exploreBudget').default === 18 && metadata.fields.find((field) => field.key === 'flashGuideEnabled').default === false)

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
  check('pro-config GET 返回 8 项 metadata 与旧值', proBefore.status === 200 && proBefore.body.fields.length === 8 && valuesFrom(proBefore.body).plannerModel === oldValues.plannerModel && valuesFrom(proBefore.body).toolPresentationMode === oldValues.toolPresentationMode)
  const fieldMap = new Map(proBefore.body.fields.map((field) => [field.key, field]))
  check('pro metadata 控件/min/mode 由描述表提供', fieldMap.get('exploreBudget').control === 'number' && fieldMap.get('exploreBudget').min === 1 && fieldMap.get('toolPresentationMode').options.join('/') === 'native/ptc/both' && fieldMap.get('flashGuideEnabled').separate === 'flash-guide')

  const beforePut = readFileSync(join(presetDir, 'agent.cordis.yml'), 'utf8')
  const putBody = { ...newValues, flashGuideEnabled: oldValues.flashGuideEnabled }
  const proPut = await requestJson(port, 'PUT', '/api/dsh-extra-plan-settings/pro-config', putBody)
  check('pro-config PUT 返回更新后的实际 values', proPut.status === 200 && valuesFrom(proPut.body).plannerModel === newValues.plannerModel && valuesFrom(proPut.body).exploreBudget === newValues.exploreBudget && valuesFrom(proPut.body).toolPresentationMode === newValues.toolPresentationMode && valuesFrom(proPut.body).flashGuideEnabled === oldValues.flashGuideEnabled)
  const afterPut = readFileSync(join(presetDir, 'agent.cordis.yml'), 'utf8')
  const changed = diffLines(beforePut, afterPut)
  const managedLeaves = managedDefinitions.map((item) => item.path.split('.').at(-1))
  check('pro PUT 只改描述表登记的标量行', changed.length === managedDefinitions.length && changed.every((item) => managedLeaves.some((leaf) => item.after.includes(leaf + ':'))))
  const parsedAfterPut = parsePresetYaml(afterPut)
  check('pro PUT 目标文件 7 项由稳定 locator 读取', managedDefinitions.every((item) => {
    const value = resolveSetting(parsedAfterPut, item, { aliases: false })
    return value.kind === 'ok' && value.value === (item.key === 'plannerModel' ? newValues.plannerModel : newValues[item.key])
  }))

  const invalidBodies = [
    ['plannerModel 空白', { plannerModel: '   ' }],
    ['exploreBudget 0', { exploreBudget: 0 }],
    ['plannerPromptSuffix 非 string', { plannerPromptSuffix: 1 }],
    ['anchoredBootstrap string', { anchoredBootstrap: 'true' }],
    ['webFetch number', { webFetch: 1 }],
    ['toolPresentationMode code', { toolPresentationMode: 'code' }],
  ]
  for (const [label, invalid] of invalidBodies) {
    const result = await requestJson(port, 'PUT', '/api/dsh-extra-plan-settings/pro-config', { ...newValues, ...invalid })
    check('pro 严格拒绝 ' + label, result.status === 400)
  }

  const flashBefore = await requestJson(port, 'GET', '/api/dsh-extra-plan-settings/flash-guide-config')
  check('flash-guide GET 返回 metadata 与文件值反向 disabled', flashBefore.status === 200 && flashBefore.body.available === true && flashBefore.body.field.key === 'flashGuideEnabled' && flashBefore.body.disabled === false && flashBefore.body.field.value === true)
  const flashPut = await requestJson(port, 'PUT', '/api/dsh-extra-plan-settings/flash-guide-config', { disabled: true })
  check('flash-guide PUT 反向写入规范键并返回 metadata', flashPut.status === 200 && flashPut.body.disabled === true && flashPut.body.field.value === false)
  check('flash-guide 文件目标由描述表决定', resolveSetting(parsePresetYaml(readFileSync(join(presetDir, 'agent.cordis.yml'), 'utf8')), definition('flashGuideEnabled'), { aliases: false }).value === false)
  const invalidFlash = await requestJson(port, 'PUT', '/api/dsh-extra-plan-settings/flash-guide-config', { disabled: 'true' })
  check('flash-guide 严格拒绝非 boolean', invalidFlash.status === 400)

  const qqStatus = await requestJson(port, 'GET', '/api/dsh-extra-plan-settings/qqbot-status')
  check('qqbot 独立回归 status 可用', qqStatus.status === 200 && qqStatus.body.available === true)
  const qqBefore = await requestJson(port, 'GET', '/api/dsh-extra-plan-settings/qqbot-config')
  check('qqbot approvalEnabled 仍只走独立 patch API', qqBefore.status === 200 && qqBefore.body.approvalEnabled === true)
  const qqPut = await requestJson(port, 'PUT', '/api/dsh-extra-plan-settings/qqbot-config', { approvalEnabled: false })
  check('qqbot patch PUT 保留顶层 id 注释', qqPut.status === 200 && qqPut.body.approvalEnabled === false && readFileSync(patchFile, 'utf8').includes(topIdLine) && readFileSync(patchFile, 'utf8').includes('    approvalEnabled: false'))
  writeFileSync(patchFile, '- insert:\n  - id: qqbot-user-questions\n    config:\n      approvalEnabled: true\n', 'utf8')
  const qqInsert = await requestJson(port, 'GET', '/api/dsh-extra-plan-settings/qqbot-config')
  check('qqbot 旧 insert 形状保持兼容', qqInsert.status === 200 && qqInsert.body.approvalEnabled === true)
  writeFileSync(patchFile, '- id: unrelated\n  config:\n    keep: true\n', 'utf8')
  check('qqbot 缺条目返回 404 且不影响迁移文件', (await requestJson(port, 'GET', '/api/dsh-extra-plan-settings/qqbot-config')).status === 404 && readFileSync(join(presetDir, 'agent.cordis.yml'), 'utf8').includes('flashGuideEnabled: false'))

  const clientText = readFileSync(new URL('../../plugins/dsh-extra-plan/lib/client.js', import.meta.url), 'utf8')
  check('client 按 metadata 渲染控件且无硬编码模板路径/默认/枚举值', clientText.includes('setFields(fields)') && clientText.includes('field.options') && clientText.includes('field.min') && !clientText.includes('agent.cordis.yml') && !clientText.includes('value: "native"') && !clientText.includes('value: "ptc"') && !clientText.includes(': 18'))
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
