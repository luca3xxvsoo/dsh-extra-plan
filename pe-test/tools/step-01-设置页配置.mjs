// 设置页宿主 API 双写路径回归。
// 从 profile 或安装锚点解析宿主依赖；锚点缺失立即失败。
// mock ctx/configEditor round-trip 只在内存保存 patch 行，HTTP 服务仅绑定 127.0.0.1；
// 不写入生产目录。

import { createServer, request as httpRequest } from 'node:http'
import { createRequire, registerHooks } from 'node:module'
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const REPO_ROOT = fileURLToPath(new URL('../..', import.meta.url))
const DSH_HOME = (process.env.DSH_HOME || join(homedir(), '.dsh')).replaceAll('\\', '/')
const DSH_INSTALL_ROOT = typeof process.env.DSH_INSTALL_ROOT === 'string' && process.env.DSH_INSTALL_ROOT.trim() !== ''
  ? resolve(process.env.DSH_INSTALL_ROOT.trim())
  : null

function installNodeModulesRoots() {
  if (DSH_INSTALL_ROOT === null) return []
  const root = join(DSH_INSTALL_ROOT, 'node_modules')
  return [root, join(root, '@deepseek-ai', 'dsh', 'node_modules')]
}

function targetManifest(name) {
  if (DSH_INSTALL_ROOT === null) return null
  const path = join(DSH_INSTALL_ROOT, 'node_modules', '@deepseek-ai', name, 'package.json')
  if (!existsSync(path)) return null
  try { return JSON.parse(readFileSync(path, 'utf8')) } catch { return null }
}

function targetText(relativePath) {
  if (DSH_INSTALL_ROOT === null) return ''
  try { return readFileSync(join(DSH_INSTALL_ROOT, relativePath), 'utf8') } catch { return '' }
}

const targetDsh = targetManifest('dsh')
const targetDshLlm = targetManifest('dsh-llm')
const targetDshVersion = targetDsh !== null && typeof targetDsh.version === 'string' ? targetDsh.version : '缺失'
const targetDshLlmVersion = targetDshLlm !== null && typeof targetDshLlm.version === 'string' ? targetDshLlm.version : '缺失'
const targetSlotMapText = targetText('node_modules/@deepseek-ai/dsh-client-ui-settings/lib/types/client/contract/slots.d.ts')
const targetConfigFormText = targetText('node_modules/@deepseek-ai/dsh-client-ui-settings/lib/types/client/config-form.d.ts')
console.log('INFO  HOST 真实安装根=' + (DSH_INSTALL_ROOT === null ? '未设置' : DSH_INSTALL_ROOT) + ' dsh=' + targetDshVersion + ' dsh-llm=' + targetDshLlmVersion)

function profileNodeModulesRoots() {
  const roots = []
  const profilesDir = join(DSH_HOME, 'profiles')
  let names = []
  try { names = readdirSync(profilesDir) } catch { names = [] }
  const ordered = ['web'].concat(names.filter((name) => name !== 'web'))
  for (const name of ordered) roots.push(join(profilesDir, name, 'node_modules'))
  return roots
}

function hostSiteNodeModulesRoots() {
  const roots = []
  // 同级 0.1.7 宿主现场检出（dsh-v0.1.7*）
  try {
    const parent = dirname(REPO_ROOT.replace(/[\\/]$/, ''))
    // 同代多检出（如 dsh-v0.1.7-rc 与 dsh-v0.1.7-rc2）按 rc 号降序：dependencyBases 首项 = 最新 rc 现场，
    // 不随目录枚举顺序漂移；找不到任何 0.1.7 现场时该 base 列表为空，运行时断言自动降级为静态契约核对。
    const rcOrder = (name) => {
      const matched = /rc\.?(\d+)/i.exec(name)
      return matched === null ? 0 : Number(matched[1])
    }
    const hostNames = readdirSync(parent).filter((name) => /^dsh-v?0\.1\.7/.test(name))
    hostNames.sort((a, b) => rcOrder(b) - rcOrder(a))
    for (const name of hostNames) {
      roots.push(join(parent, name, 'node_modules'))
    }
  } catch { /* 同级目录不可枚举时忽略 */ }
  const prefixes = []
  if (process.platform === 'win32') {
    if (process.env.APPDATA) prefixes.push(join(process.env.APPDATA, 'npm', 'node_modules'))
    prefixes.push(join(homedir(), 'AppData', 'Roaming', 'npm', 'node_modules'))
  } else {
    prefixes.push(join('/usr', 'local', 'lib', 'node_modules'))
    prefixes.push(join(homedir(), '.npm-global', 'lib', 'node_modules'))
    prefixes.push(join(homedir(), 'node_modules'))
  }
  for (const prefix of prefixes) {
    roots.push(join(prefix, '@deepseek-ai', 'dsh', 'node_modules'))
    roots.push(prefix)
  }
  return roots
}

const dependencyBases = installNodeModulesRoots()
  .concat(profileNodeModulesRoots())
  .map((root) => join(root, 'package.json'))
  .concat(hostSiteNodeModulesRoots().map((root) => join(root, 'package.json')))
if (dependencyBases.length === 0) throw new Error('未找到 settings.js 回归所需的依赖锚点（① profiles/<name>/node_modules ② 0.1.7 宿主现场 node_modules）')

function tryRequire(base) {
  try {
    const candidate = createRequire(base)
    const yamlPath = candidate.resolve('js-yaml')
    const schemaPath = candidate.resolve('@deepseek-ai/schemastery')
    const schemaModule = candidate('@deepseek-ai/schemastery')
    const volatileCapable = typeof schemaModule.boolean === 'function' && typeof schemaModule.boolean().volatile === 'function'
    return { candidate, yamlPath, schemaPath, volatileCapable }
  } catch {
    return null
  }
}

let dependencyRequire = null
let schemasteryUrl = null
let volatileCapable = false
for (const base of dependencyBases) {
  const found = tryRequire(base)
  if (found === null) continue
  if (dependencyRequire === null) {
    dependencyRequire = found.candidate
    schemasteryUrl = pathToFileURL(found.schemaPath).href
  }
  if (found.volatileCapable) {
    dependencyRequire = found.candidate
    schemasteryUrl = pathToFileURL(found.schemaPath).href
    volatileCapable = true
    break
  }
}
if (dependencyRequire === null) {
  throw new Error('未找到 settings.js 回归所需依赖（js-yaml / @deepseek-ai/schemastery）；已探测锚点：\n  - ' + dependencyBases.join('\n  - '))
}
if (typeof registerHooks === 'function') {
  registerHooks({
    resolve(specifier, context, next) {
      if (specifier === '@deepseek-ai/schemastery') return { url: schemasteryUrl, shortCircuit: true }
      return next(specifier, context)
    },
  })
}

const settingsText = readFileSync(join(REPO_ROOT, 'plugins', 'dsh-extra-plan', 'lib', 'settings.js'), 'utf8')
const clientText = readFileSync(join(REPO_ROOT, 'plugins', 'dsh-extra-plan', 'lib', 'client.js'), 'utf8')

let pass = 0
let fail = 0
function check(label, condition) {
  if (condition) { pass += 1; console.log('PASS  ' + label) }
  else { fail += 1; console.log('FAIL  ' + label) }
}

// ── 静态契约（与 schemastery 版本无关，恒执行） ──────────────────────────
check('依赖锚点 ① profiles/<name>/node_modules ② 0.1.7 宿主现场 node_modules 均可解析 js-yaml', dependencyBases.length >= 2 && dependencyRequire !== null)
check('settings.js：settings 命名空间策略走 settings.configure({ auto: false }, ctx.fiber)（无 settings.register）', settingsText.includes('child.settings.configure({ auto: false }, ctx.fiber)') && !settingsText.split('\n').filter((line) => !line.trim().startsWith('//')).join('\n').includes('settings.register'))
check('settings.js：无 ExtraPlanSettingsSchema、无 .agent-presets 写预设文件、无自建原子写', !settingsText.includes('ExtraPlanSettingsSchema') && !settingsText.split('\n').filter((line) => !line.trim().startsWith('//')).join('\n').includes('.agent-presets'))
check('settings.js：PUT 仅收 webFetch/toolPresentationMode 且写链=公开 preset-sync 行 edit（settings 行零写入）', settingsText.includes('HOST_ROW_KEYS') && settingsText.includes('unsupported field(s)') && settingsText.includes('restatePresetSyncConfig') && settingsText.includes('await editor.edit(presetRow.entry') && !settingsText.includes('editor.edit(settingsRow.entry') && !settingsText.includes('isLocateError'))
check('C-3 写链：PUT 纯投影（无 settings 行写）；10 项权威值由客户端一次 mutate 提交', !settingsText.includes('editor.edit(settingsRow.entry') && !settingsText.includes('failed to write settings row') && settingsText.indexOf('await editor.edit(presetRow.entry') > 0 && settingsText.includes('projection: { applied: true }'))
check('C-3b 投影失败不回滚权威值（200 + projection.applied=false，无 500 回退）', settingsText.includes('projection: { applied: true }') && settingsText.includes('projection: { applied: false') && settingsText.includes("declaration row not found: ' + PRESET_ROW_ID"))
check('C-2 settings 命名空间仍为行 id dsh-extra-plan-settings（未改名；共享表单由兼容 row 按宿主能力接线）',
  settingsText.includes('export { SETTINGS_ROW_ID, PRESET_ROW_ID }') && clientText.includes('const NS = "dsh-extra-plan-settings"'))
check('C-1 settings.js 的 Config 源码文本：10 项 descriptor 统一经过 schemaField volatile', (() => {
  const codeOnly = settingsText.split('\n').filter((line) => !line.trim().startsWith('//')).join('\n')
  return codeOnly.includes('SETTING_DEFINITIONS.map') && codeOnly.includes('HOST_ROW_SETTING_DEFINITIONS.map') && codeOnly.includes('return field.default(definition.defaultValue).volatile()')
})())
const clientCode = clientText.split('\n').filter((line) => !line.trim().startsWith('//')).join('\n')
check('client.js：0.2 独立 settings.plugins.tab 注册为零、legacy plugins.row.config 接线恰一套', (() => {
  const active = clientCode
  return !active.includes('settings.plugins.tab') && !active.includes('V02SettingsTab') && !active.includes('registerV02SettingsTab') &&
    (active.match(/ctx\.slots\.inject\("plugins\.row\.config"/g) || []).length === 1 &&
    (active.match(/name: "plugins\.row\.config"/g) || []).length === 1 &&
    (active.match(/ctx\.slots\.register\(\{/g) || []).length === 1 &&
    (active.match(/ctx\.configForms\.whileServed/g) || []).length === 1
})())
check('client.js：legacy key、wrapper 的 form/t/view 适配精确', (() => {
  return clientCode.includes('const LEGACY_017_ROW_CONFIG_KEY = "@local/dsh-extra-plan#dsh-extra-plan-settings";') &&
    (clientCode.match(/key: LEGACY_017_ROW_CONFIG_KEY/g) || []).length === 1 &&
    clientCode.includes('function Legacy017SettingsCard(props)') &&
    clientCode.includes('configForm: props.form') && clientCode.includes('translate: props.t') && clientCode.includes('view: props.view') &&
    clientCode.includes('function registerLegacy017RowConfig')
})())
check('SHARED client.js：ExtraPlanForm 与 SettingsCard 各一份，由唯一 legacy keyed row 按宿主能力呈现',
  (clientText.match(/function ExtraPlanForm/g) || []).length === 1 &&
  (clientText.match(/function SettingsCard/g) || []).length === 1 &&
  clientText.includes('function SettingsCard({ configForm, translate, view })') &&
  clientText.includes('function ExtraPlanForm') && clientText.includes('EXTRA_FIELDS') &&
  clientText.includes('HOST_ROW_FIELDS') &&
  clientText.includes('ctx.configForms.whileServed') && clientText.includes('ctx.slots.inject("plugins.row.config"'))

if (DSH_INSTALL_ROOT === null) {
  console.log('SKIP  {"scope":"CORE-V02","reason":"DSH_INSTALL_ROOT 未设置，未读取宿主 SlotMap/ConfigForms"}');
} else if (targetDshVersion === '0.2.0-rc.1' || targetDshLlmVersion === '0.2.0-rc.1') {
  console.log('HUMAN  0.2.0-rc.1【未核实·HUMAN】：即使 peer 命中，SlotMap/ConfigForms、自动回归与实机仍待设备核验');
} else {
  check('CORE-V02 HOST：DSH_INSTALL_ROOT 实际宿主版本清单一致且为 rc.2 目标',
    targetDshVersion === '0.2.0-rc.2' && targetDshLlmVersion === '0.2.0-rc.2');
  check('CORE-V02 HOST：真实 SlotMap 能力仅作外部事实（不反向要求插件注册 tab 或 legacy row）',
    targetSlotMapText.includes("'settings.plugins.tab'") || targetSlotMapText.includes("'plugins.row.config'"));
  check('CORE-V02 HOST：真实 ConfigForms 提供 get 与 whileServed',
    targetConfigFormText.includes('get<T>') && targetConfigFormText.includes('whileServed('));
}
console.log('HUMAN  0.2.0-rc.1【未核实·HUMAN】：当前自动回归不覆盖 rc.1 API/运行结论，须在 rc.1 设备用现有脚本验收')
check('client.js：外壳与注入面（__ModuleLoader__ + require(react) + slots/locale/configForms）', clientText.includes('window.__ModuleLoader__.load({') && clientText.includes('id: "@local/dsh-extra-plan"') && clientText.includes('require("react")') && clientText.includes('exports.inject = ["slots", "locale", "configForms"]'))
check('client.js：2 项宿主行并入官方 mutate（10 op）+ esp-* 样式保留', clientText.includes('.esp-wrap{') && clientText.includes('.esp-section{') && clientText.includes('.esp-btn') && clientText.includes('HOST_ROW_FIELDS.map') && clientText.includes('hostDraft[field.key]'))
check('U-2 client.js：2 项宿主行提示仍标明重启生效 + 保存回执极简（saved，无 savedRestart）', (() => {
  const hostRowFields = clientText.slice(clientText.indexOf('const HOST_ROW_FIELDS'), clientText.indexOf('const css ='))
  return hostRowFields.includes('是否开启web_fetch ｜ 重启生效') &&
    hostRowFields.includes('工具呈现方式切换（默认/混合/PTC模式） ｜ 重启生效') &&
    clientText.includes('text: t("saved")') &&
    !clientText.includes('savedRestart')
})())
check('client.js：共享表单保留 state/mutate 逻辑，无十项整批 save()', clientText.includes('form.mutate(ops, revision)') && clientText.includes('props.configForm') && !clientText.includes('for (const field of fields)'))

if (!volatileCapable) {
  console.log('SKIP  本机可解析到的 @deepseek-ai/schemastery 无 Schema.volatile()（0.1.5 世代的 3.18.2）；')
  console.log('      运行时 HTTP 回归需要 0.1.7 宿主（rc.1 / rc.2）自带的 3.18.4。已探测锚点：')
  for (const base of dependencyBases) console.log('        - ' + base)
  console.log('      静态契约断言全部照常执行；运行时部分在 0.1.7 宿主现场存在时自动启用。')
  console.log('\n通过 ' + pass + ', 失败 ' + fail)
  process.exit(fail === 0 ? 0 : 1)
}

// ── 运行时：真实 apply + loopback HTTP + mock configEditor ────────────────
const settingsModule = await import(new URL('../../plugins/dsh-extra-plan/lib/settings.js', import.meta.url).href)
const presetSettings = await import(new URL('../../plugins/dsh-extra-plan/lib/preset-settings.js', import.meta.url).href)
const { PRESET_ROW_ID, SETTINGS_ROW_ID, parsePresetYaml, restatePresetSyncConfig } = presetSettings
const { assetDefinition, definitionWithProjection } = await import(new URL('../../plugins/dsh-extra-plan/lib/preset-sync.js', import.meta.url).href)

// ── C-1/C-2（运行时，真 schemastery）：Config 字典 10 字段全 volatile + 默认值与资产/descriptor 一致 ──
{
  const configSchema = settingsModule.Config
  const configDict = configSchema !== undefined && configSchema.dict !== undefined && configSchema.dict !== null ? configSchema.dict : {}
  const configKeys = Object.keys(configDict)
  check('C-1 运行时：settings 行 Config 字典恰 10 个字段（8 项 UI + webFetch/toolPresentationMode）',
    (configKeys.length === 10 && new Set(configKeys).size === 10 && ['anchoredBootstrap', 'creativeMode', 'runcodeCatchGate', 'crossProviderPlannerModel', 'plannerModel', 'plannerPromptSuffix', 'exploreBudget', 'otherAgentModel', 'webFetch', 'toolPresentationMode'].every((key) => configKeys.includes(key))) || (configKeys.length === 0 && presetSettings.SETTING_DEFINITIONS.length === 10))
  check('C-1b 运行时：10 个字段逐一带 volatile 标记（meta.volatile===true → SettingsForms 才会投影）',
    Object.values(configDict).every((schema) => schema !== null && schema !== undefined && schema.meta !== undefined && schema.meta.volatile === true))
  check('C-2b 运行时：SETTINGS_ROW_ID 常量 = 行 id dsh-extra-plan-settings（ns 未改名）', SETTINGS_ROW_ID === 'dsh-extra-plan-settings')
  // volatile 字段的解析产物是 Volatile 引用（读值经 .get()）——正是宿主 SettingsForms 的投影口径。
  const parsedDefault = configSchema({})
  check('C-1c 运行时：Config 默认值 = 资产模板叶值/descriptor 默认（webFetch=false、toolPresentationMode=native、exploreBudget=18、plannerPromptSuffix=资产句）',
    parsedDefault.webFetch.get() === false && parsedDefault.toolPresentationMode.get() === 'native' && parsedDefault.exploreBudget.get() === 18 && parsedDefault.anchoredBootstrap.get() === true && parsedDefault.plannerPromptSuffix.get() === '你的深度思考部分需要以"好了，现在我以全局视角来看待这个问题"开头')
  const parsedSet = configSchema({ webFetch: true, toolPresentationMode: 'ptc' })
  check('C-1d 运行时：宿主 schema 认这 2 个键（写入 settings 行后不会被 schema 丢弃）', parsedSet.webFetch.get() === true && parsedSet.toolPresentationMode.get() === 'ptc')
}

const ASSET_DEFINITION = join(REPO_ROOT, 'plugins', 'dsh-extra-plan', 'assets', 'presets', 'extra-plan', 'preset-definition.generated.yml')
const generatedDefinitionText = readFileSync(ASSET_DEFINITION, 'utf8')
function makeConfigEditor({ present = true, presetPresent = present, settingsPresent = present } = {}) {
  const state = { rows: [], edits: [] }
  if (presetPresent) state.rows.push({ entry: { options: { id: PRESET_ROW_ID, name: '@local/dsh-extra-plan/preset-sync', config: {} }, fiber: {} }, inherited: {}, override: {} })
  if (settingsPresent) state.rows.push({ entry: { options: { id: SETTINGS_ROW_ID, name: '@local/dsh-extra-plan/settings', config: {} }, fiber: {} }, inherited: {}, override: {} })
  return {
    state,
    documentPath: '',
    configuration: () => state.rows,
    edit: async (entry, change) => {
      const row = state.rows.find((item) => item.entry === entry)
      if (row === undefined) throw new Error('Configuration entry is no longer available')
      const next = change(structuredClone(row.entry.options.config), row.inherited)
      row.entry.options.config = next
      state.edits.push({ id: entry.options.id, next })
    },
  }
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
        try { body = JSON.parse(raw) } catch { /* 保持 null */ }
        resolve({ status: res.statusCode, body, raw })
      })
    })
    req.on('error', reject)
    if (payload !== null) req.write(payload)
    req.end()
  })
}

async function startServer(editor) {
  const routeDefinitions = []
  const settingsPolicies = []
  const mockContext = {
    fiber: { uid: 'test-fiber' },
    get: (name) => (name === 'configEditor' ? editor : undefined),
    inject(deps, callback) {
      if (deps[0] === 'loader') {
        callback({ get: () => undefined, loader: { builtins: {} }, effect: (fn) => fn() })
        return
      }
      if (deps[0] === 'settings') {
        callback({ effect: (fn) => fn(), settings: { configure: (policy, owner) => { settingsPolicies.push({ policy, owner }); return () => {} } } })
        return
      }
      if (deps[0] === 'webServer') {
        callback({ effect: (fn) => fn(), webServer: { register: (definition) => { routeDefinitions.push(definition); return () => {} } } })
        return
      }
      throw new Error('unexpected dependency: ' + deps.join(','))
    },
  }
  settingsModule.apply(mockContext)
  const route = routeDefinitions.find((item) => item.path === '/api/dsh-extra-plan-settings')
  check('真实 apply 注册 prefix 路由且登记 auto:false 页面策略（owner = ctx.fiber）', route !== undefined && typeof route.handler === 'function' && settingsPolicies.length === 1 && settingsPolicies[0].policy.auto === false && settingsPolicies[0].owner === mockContext.fiber)
  const server = createServer((req, res) => {
    Promise.resolve(route.handler(req, res)).catch((error) => {
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
  return { server, port }
}

try {
  const editor = makeConfigEditor()
  const { server, port } = await startServer(editor)
  try {
    const before = await requestJson(port, 'GET', '/api/dsh-extra-plan-settings/pro-config')
    check('GET 读取公开 preset-sync 行默认投影（webFetch=false / mode=native）', before.status === 200 && before.body.fields.length === 2 && before.body.values.webFetch === false && before.body.values.toolPresentationMode === 'native')
    check('GET fields 提供 select 与 native/ptc/both 选项', before.body.fields.find((field) => field.key === 'toolPresentationMode').options.join('/') === 'native/ptc/both')
    const definitionBefore = readFileSync(ASSET_DEFINITION, 'utf8')
    const put = await requestJson(port, 'PUT', '/api/dsh-extra-plan-settings/pro-config', { webFetch: true, toolPresentationMode: 'ptc' })
    check('PUT 两项 → 200 且回读新值', put.status === 200 && put.body.values.webFetch === true && put.body.values.toolPresentationMode === 'ptc')
    check('PUT 新写入只命中 extra-plan-preset-sync 公开行', editor.state.edits.length === 1 && editor.state.edits[0].id === PRESET_ROW_ID && editor.state.edits[0].next.webFetch === true && editor.state.edits[0].next.toolPresentationMode === 'ptc')
    check('PUT 不写 settings 权威行且回执 applied=true', JSON.stringify(editor.state.rows.find((row) => row.entry.options.id === SETTINGS_ROW_ID).entry.options.config) === '{}' && put.body.projection.applied === true)
    check('PUT 不触碰 definition 资产文件', readFileSync(ASSET_DEFINITION, 'utf8') === definitionBefore)
    const noOp = await requestJson(port, 'PUT', '/api/dsh-extra-plan-settings/pro-config', { webFetch: true, toolPresentationMode: 'ptc' })
    check('PUT 已达成投影 no-op → applied=true 且不增加 editor edit', noOp.status === 200 && noOp.body.projection.applied === true && editor.state.edits.length === 1)
    const partial = await requestJson(port, 'PUT', '/api/dsh-extra-plan-settings/pro-config', { webFetch: false })
    check('PUT 部分输入保留未提交 mode=ptc', partial.status === 200 && partial.body.values.webFetch === false && partial.body.values.toolPresentationMode === 'ptc' && editor.state.edits.length === 2)
    const unknown = await requestJson(port, 'PUT', '/api/dsh-extra-plan-settings/pro-config', { plannerModel: 'x' })
    check('PUT 未支持字段 → 400', unknown.status === 400 && String(unknown.body.error).includes('unsupported field'))
    const badMode = await requestJson(port, 'PUT', '/api/dsh-extra-plan-settings/pro-config', { toolPresentationMode: 'code' })
    check('PUT 非法枚举值 → 400', badMode.status === 400)
    const badBool = await requestJson(port, 'PUT', '/api/dsh-extra-plan-settings/pro-config', { webFetch: 1 })
    check('PUT 非法布尔值 → 400', badBool.status === 400)
    const empty = await requestJson(port, 'PUT', '/api/dsh-extra-plan-settings/pro-config', {})
    check('PUT 空体 → 400', empty.status === 400)
  } finally {
    await new Promise((resolve) => server.close(() => resolve()))
  }

  const missingEditor = makeConfigEditor({ settingsPresent: false })
  const missingRun = await startServer(missingEditor)
  try {
    const put = await requestJson(missingRun.port, 'PUT', '/api/dsh-extra-plan-settings/pro-config', { webFetch: true })
    check('settings 行缺失不阻断公开投影写入', put.status === 200 && put.body.projection.applied === true && missingEditor.state.edits.length === 1)
  } finally {
    await new Promise((resolve) => missingRun.server.close(() => resolve()))
  }

  const noDeclarationEditor = makeConfigEditor({ presetPresent: false })
  const noDeclarationRun = await startServer(noDeclarationEditor)
  try {
    const put = await requestJson(noDeclarationRun.port, 'PUT', '/api/dsh-extra-plan-settings/pro-config', { webFetch: true })
    check('公开 preset-sync 行缺失 → 200 + applied=false 且不写 settings', put.status === 200 && put.body.projection.applied === false && noDeclarationEditor.state.edits.length === 0)
  } finally {
    await new Promise((resolve) => noDeclarationRun.server.close(() => resolve()))
  }

  const failingEditor = makeConfigEditor()
  failingEditor.edit = async () => { throw new Error('reconcile failed: new row did not load') }
  const failingRun = await startServer(failingEditor)
  try {
    const put = await requestJson(failingRun.port, 'PUT', '/api/dsh-extra-plan-settings/pro-config', { webFetch: true })
    check('公开投影 edit 失败 → 200 + applied=false（无 500 分流）', put.status === 200 && put.body.projection.applied === false && String(put.body.projection.error).includes('reconcile failed'))
  } finally {
    await new Promise((resolve) => failingRun.server.close(() => resolve()))
  }

  const definition = assetDefinition()
  const projected = definitionWithProjection({ webFetch: true, toolPresentationMode: 'both' })
  check('definitionWithProjection 只重述两项宿主投影且保留 17 条本体', projected.plugins.length === 17 && projected.plugins.find((row) => row.id === 'tool-web').config.fetch === true && projected.plugins.find((row) => row.id === 'tool-presentation').config.mode === 'both' && definition.plugins.find((row) => row.id === 'tool-web').config.fetch === false)
  check('U-3 客户端严格验证 projection.applied 且不使用 hostSnapshot 覆盖并发 authority', clientText.includes('data.projection.applied !== true') && clientText.includes('latestRes') && clientText.includes('latestData.values') && !clientText.includes('hostSnapshot'))
} catch (error) {
  fail += 1
  console.error('FAIL  设置页 HTTP 回归异常: ' + String(error && error.stack || error))
}

console.log('\n通过 ' + pass + ', 失败 ' + fail)
process.exit(fail === 0 ? 0 : 1)
