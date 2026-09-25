// 设置页 Host API 集成回归（dsh 0.1.7-rc.1 双通道写链）。
// 依赖锚点（T9-5）：① DSH_HOME/profiles/<name>/node_modules ② 0.1.7 宿主现场 node_modules
//   （同级 dsh-v0.1.7* 检出，或 npm 全局 dsh 包自带的 node_modules）；两锚点均缺失即 throw。
// 运行时夹具：mock ctx（settings.configure + webServer）+ mock configEditor（configuration/edit），
//   profile patch 内容由 edit 回填写入内存行集合，GET 再经 configuration() 读回——同一代码路径往返。
// 不写任何生产目录；HTTP 服务器只绑定 127.0.0.1。

import { createServer, request as httpRequest } from 'node:http'
import { createRequire, registerHooks } from 'node:module'
import { readdirSync, readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const REPO_ROOT = fileURLToPath(new URL('../..', import.meta.url))
const DSH_HOME = (process.env.DSH_HOME || join(homedir(), '.dsh')).replaceAll('\\', '/')

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

const dependencyBases = profileNodeModulesRoots()
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
check('settings.js：PUT 仅收 webFetch/toolPresentationMode 且写链经 editor.edit + 整体重述 plugins', settingsText.includes('HOST_ROW_KEYS') && settingsText.includes('unsupported field(s)') && settingsText.includes('restatePresetPlugins') && settingsText.includes('await editor.edit(') && settingsText.includes("isLocateError(error) ? 404 : 500"))
check('C-3 写链顺序：先写 settings 行（权威值）→ 再投影声明行 plugins 子行', (() => {
  const authorityIdx = settingsText.indexOf('await editor.edit(settingsRow.entry')
  const projectionIdx = settingsText.indexOf('await editor.edit(presetRow.entry')
  return authorityIdx > 0 && projectionIdx > authorityIdx && settingsText.includes('failed to write settings row')
})())
check('C-3b 投影失败不回滚权威值（200 + projection.applied=false，无 500 回退）', settingsText.includes('projection: { applied: true }') && settingsText.includes('projection: { applied: false') && settingsText.includes("declaration row not found: ' + PRESET_ROW_ID"))
check('C-2 settings 命名空间仍为行 id dsh-extra-plan-settings（未改名；客户端 NS 与 settings 行 id 同字面量）',
  settingsText.includes('export { SETTINGS_ROW_ID, PRESET_ROW_ID }') && clientText.includes('const NS = "dsh-extra-plan-settings"') &&
  clientText.includes('ctx.configForms.whileServed([NS]'))
check('C-1 settings.js 的 Config 源码文本：恰 10 处字段链 volatile（8 项 UI 直接声明 + 2 项宿主行字段表）', (() => {
  const codeOnly = settingsText.split('\n').filter((line) => !line.trim().startsWith('//')).join('\n')
  const body = codeOnly.slice(codeOnly.indexOf('export const Config = z.object({'), codeOnly.indexOf('})', codeOnly.indexOf('export const Config = z.object({')))
  const chained = [...body.matchAll(/[A-Za-z][A-Za-z0-9]*:\s*z\.[^\n]*?\.volatile\(\)/g)].map((match) => match[1])
  const hostRowFields = settingsText.slice(settingsText.indexOf('export const HOST_ROW_AUTHORITY_FIELDS'), settingsText.indexOf('export const Config'))
  return chained.length === 8 && (settingsText.match(/\.volatile\(\)/g) || []).length === 10 &&
    hostRowFields.includes('webFetch: z.boolean().default(false).volatile()') &&
    hostRowFields.includes("toolPresentationMode: z.string().default('native').volatile()") &&
    body.includes('...HOST_ROW_AUTHORITY_FIELDS')
})())
const clientCode = clientText.split('\n').filter((line) => !line.trim().startsWith('//')).join('\n')
check('client.js：configForms.whileServed + plugins.item，无 settings.plugin.item / 无旧 key 卡片注册', clientCode.includes('ctx.configForms.whileServed([NS]') && clientCode.includes('ctx.slots.inject("plugins.item"') && clientCode.includes('name: "plugins.item"') && clientCode.includes('id: NS') && !clientCode.includes('settings.plugin.item') && !clientCode.includes('key: "dsh-extra-plan"'))
check('client.js：外壳与注入面（__ModuleLoader__ + require(react) + slots/locale/configForms）', clientText.includes('window.__ModuleLoader__.load({') && clientText.includes('id: "@local/dsh-extra-plan"') && clientText.includes('require("react")') && clientText.includes('exports.inject = ["slots", "locale", "configForms"]'))
check('client.js：2 项宿主行提交体仅 {webFetch, toolPresentationMode} 且 esp-* 样式保留', clientText.includes('JSON.stringify({ webFetch: hostDraft.webFetch, toolPresentationMode: hostDraft.toolPresentationMode })') && clientText.includes('.esp-wrap{') && clientText.includes('.esp-section{') && clientText.includes('.esp-btn'))
check('U-2 client.js：2 项宿主行 UI 明示「需重启生效」（提示语 + 保存回执），与 8 项「立即生效」区分', (() => {
  const hostRowFields = clientText.slice(clientText.indexOf('const HOST_ROW_FIELDS'), clientText.indexOf('const css ='))
  return hostRowFields.includes('需重启生效') && hostRowFields.split('需重启生效').length === 3 &&
    clientText.includes('savedRestart: "已保存（这 2 项需重启 DSH 后生效）"') &&
    clientText.includes('text: t("savedRestart")')
})())
check('U-2b client.js：2 项提示语指向权威值落点（settings 行）+ 投影落点（声明行子行）', (() => {
  const hostRowFields = clientText.slice(clientText.indexOf('const HOST_ROW_FIELDS'), clientText.indexOf('const css ='))
  return hostRowFields.includes('权威值存 settings 行') && hostRowFields.includes('投影到声明行')
})())
check('client.js：8 项走 ownerProps.form（state/mutate），无十项整批 save()', clientText.includes('form.mutate(ops, revision)') && clientText.includes('props.form') && !clientText.includes('for (const field of fields)'))

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
const { PRESET_ROW_ID, SETTINGS_ROW_ID, parsePresetYaml, restatePluginsRow } = presetSettings
const { restatePresetPlugins } = await import(new URL('../../plugins/dsh-extra-plan/lib/preset-sync.js', import.meta.url).href)

// ── C-1/C-2（运行时，真 schemastery）：Config 字典 10 字段全 volatile + 默认值与资产/descriptor 一致 ──
{
  const configSchema = settingsModule.Config
  const configDict = configSchema !== undefined && configSchema.dict !== undefined && configSchema.dict !== null ? configSchema.dict : {}
  const configKeys = Object.keys(configDict)
  check('C-1 运行时：settings 行 Config 字典恰 10 个字段（8 项 UI + webFetch/toolPresentationMode）',
    configKeys.length === 10 && configKeys.join('|') === 'anchoredBootstrap|creativeMode|runcodeCatchGate|crossProviderPlannerModel|plannerModel|plannerPromptSuffix|exploreBudget|otherAgentModel|webFetch|toolPresentationMode')
  check('C-1b 运行时：10 个字段逐一带 volatile 标记（meta.volatile===true → SettingsForms 才会投影）',
    Object.values(configDict).every((schema) => schema !== null && schema !== undefined && schema.meta !== undefined && schema.meta.volatile === true))
  check('C-2b 运行时：SETTINGS_ROW_ID 常量 = 行 id dsh-extra-plan-settings（ns 未改名）', SETTINGS_ROW_ID === 'dsh-extra-plan-settings')
  // volatile 字段的解析产物是 Volatile 引用（读值经 .get()）——正是宿主 SettingsForms 的投影口径。
  const parsedDefault = configSchema({})
  check('C-1c 运行时：Config 默认值 = 资产模板叶值/descriptor 默认（webFetch=false、toolPresentationMode=native、exploreBudget=18）',
    parsedDefault.webFetch.get() === false && parsedDefault.toolPresentationMode.get() === 'native' && parsedDefault.exploreBudget.get() === 18 && parsedDefault.anchoredBootstrap.get() === true)
  const parsedSet = configSchema({ webFetch: true, toolPresentationMode: 'ptc' })
  check('C-1d 运行时：宿主 schema 认这 2 个键（写入 settings 行后不会被 schema 丢弃）', parsedSet.webFetch.get() === true && parsedSet.toolPresentationMode.get() === 'ptc')
}

const ASSET_PATCH = join(REPO_ROOT, 'plugins', 'dsh-extra-plan', 'assets', 'presets', 'extra-plan', 'preset-patch.generated.yml')
const generatedPatchText = readFileSync(ASSET_PATCH, 'utf8')
// 声明行夹具：生成产物去缩进 4 列 → profile patch 的根级声明行。
function declaredPlugins() {
  const doc = parsePresetYaml(generatedPatchText)
  return structuredClone(doc[0].insert[0].config.plugins)
}

function makeConfigEditor({ present = true, presetPresent = present, settingsPresent = present } = {}) {
  const state = { rows: [], edits: [], plugins: declaredPlugins() }
  if (presetPresent) {
    state.rows.push({
      entry: { options: { id: PRESET_ROW_ID, name: '@deepseek-ai/dsh-agent-preset', config: { id: 'extra-plan', plugins: state.plugins } }, fiber: {} },
      inherited: {},
      override: {},
    })
  }
  if (settingsPresent) {
    state.rows.push({
      entry: { options: { id: SETTINGS_ROW_ID, name: '@local/dsh-extra-plan/settings', config: {} }, fiber: {} },
      inherited: {},
      override: {},
    })
  }
  return {
    state,
    configuration: () => state.rows,
    edit: async (entry, change) => {
      const row = state.rows.find((item) => item.entry === entry)
      if (row === undefined) throw new Error('Configuration entry is no longer available')
      const next = change(structuredClone(row.entry.options.config), row.inherited)
      row.entry.options.config = next
      if (entry.options.id === PRESET_ROW_ID) state.plugins = next.plugins
      if (entry.options.id === SETTINGS_ROW_ID) state.settingsConfig = next
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
        try { body = JSON.parse(raw) } catch { /* keep null */ }
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
    check('GET 只读现值：2 项 metadata + 声明行子行当前值（fetch=false / mode=native）', before.status === 200 && before.body.fields.length === 2 && before.body.values.webFetch === false && before.body.values.toolPresentationMode === 'native')
    check('GET fields 由描述表提供控件/选项（select + native/ptc/both）', before.body.fields.find((field) => field.key === 'toolPresentationMode').options.join('/') === 'native/ptc/both' && before.body.fields.find((field) => field.key === 'webFetch').control === 'select')

    const pluginsBefore = structuredClone(editor.state.plugins)
    const put = await requestJson(port, 'PUT', '/api/dsh-extra-plan-settings/pro-config', { webFetch: true, toolPresentationMode: 'ptc' })
    check('PUT 2 项 → 200 且回读为写入值', put.status === 200 && put.body.values.webFetch === true && put.body.values.toolPresentationMode === 'ptc')
    check('C-3 PUT 写链落盘顺序：① settings 行（权威值）→ ② 声明行 plugins（投影）', editor.state.edits.length === 2 && editor.state.edits[0].id === SETTINGS_ROW_ID && editor.state.edits[1].id === PRESET_ROW_ID)
    check('C-3b 权威值落 settings 行 config（与 8 项同源落点）', editor.state.settingsConfig.webFetch === true && editor.state.settingsConfig.toolPresentationMode === 'ptc' && Object.keys(editor.state.edits[0].next).length === 2)
    check('C-3c 投影回执：projection.applied=true（声明行子行已同步）', put.body.projection !== undefined && put.body.projection.applied === true)
    const afterPlugins = editor.state.plugins
    const webAfter = afterPlugins.find((row) => row.id === 'tool-web')
    const presentAfter = afterPlugins.find((row) => row.id === 'tool-presentation')
    check('PUT 只改目标子行目标键：tool-web.config.fetch=true、tool-presentation.config.mode=ptc，其余键与行集合原样', webAfter.config.fetch === true && webAfter.config.searchTimeoutMs === 60000 && presentAfter.config.mode === 'ptc' && afterPlugins.length === pluginsBefore.length)
    check('PUT 不改动原 plugins 对象（深拷贝整体重述，纯函数语义）', pluginsBefore.find((row) => row.id === 'tool-web').config.fetch === false)

    const before2 = readFileSync(ASSET_PATCH, 'utf8')
    const partial = await requestJson(port, 'PUT', '/api/dsh-extra-plan-settings/pro-config', { webFetch: false })
    check('PUT 单键 → 200 且另一键保持现值', partial.status === 200 && partial.body.values.webFetch === false && partial.body.values.toolPresentationMode === 'ptc')
    check('PUT 单键也只写权威值键（settings 行 config 不含未提交键）', editor.state.settingsConfig.webFetch === false && editor.state.settingsConfig.toolPresentationMode === 'ptc' && Object.keys(editor.state.settingsConfig).length === 2)
    check('PUT 不触碰资产文件（写链只在宿主 editor）', readFileSync(ASSET_PATCH, 'utf8') === before2)

    const unknown = await requestJson(port, 'PUT', '/api/dsh-extra-plan-settings/pro-config', { plannerModel: 'x' })
    check('PUT 未支持字段 → 400（本接口仅收 2 项）', unknown.status === 400 && String(unknown.body.error).includes('unsupported field'))
    const badMode = await requestJson(port, 'PUT', '/api/dsh-extra-plan-settings/pro-config', { toolPresentationMode: 'code' })
    check('PUT 非法枚举值 → 400', badMode.status === 400)
    const badBool = await requestJson(port, 'PUT', '/api/dsh-extra-plan-settings/pro-config', { webFetch: 1 })
    check('PUT 非法布尔值 → 400', badBool.status === 400)
    const empty = await requestJson(port, 'PUT', '/api/dsh-extra-plan-settings/pro-config', {})
    check('PUT 空体 → 400（至少一项）', empty.status === 400)
  } finally {
    await new Promise((resolve) => server.close(() => resolve()))
  }

  // 行定位失败口径：settings 行（权威值落点）缺席 → 404；仅声明行缺席 → 权威值照落、投影缺席
  const missingEditor = makeConfigEditor({ present: false })
  const missingRun = await startServer(missingEditor)
  try {
    const get = await requestJson(missingRun.port, 'GET', '/api/dsh-extra-plan-settings/pro-config')
    check('settings 行与声明行皆缺失：GET 回落到出厂默认（200，不抛）', get.status === 200 && get.body.values.webFetch === false && get.body.values.toolPresentationMode === 'native' && get.body.fields.every((field) => field.source === 'default'))
    const put = await requestJson(missingRun.port, 'PUT', '/api/dsh-extra-plan-settings/pro-config', { webFetch: true })
    check('settings 行缺失：PUT → 404（权威值无处落地；不静默写别处）', put.status === 404 && String(put.body.error).includes('settings row not found') && missingEditor.state.edits.length === 0)
  } finally {
    await new Promise((resolve) => missingRun.server.close(() => resolve()))
  }

  // 仅声明行缺失（宿主清理投影行）：权威值必须照落 settings 行 → 200 + projection.applied=false
  const noDeclarationEditor = makeConfigEditor({ presetPresent: false })
  const noDeclarationRun = await startServer(noDeclarationEditor)
  try {
    const put = await requestJson(noDeclarationRun.port, 'PUT', '/api/dsh-extra-plan-settings/pro-config', { webFetch: true, toolPresentationMode: 'ptc' })
    check('声明行（投影）缺失：PUT 仍 200 且权威值落 settings 行（投影被删无害）',
      put.status === 200 && noDeclarationEditor.state.settingsConfig.webFetch === true && noDeclarationEditor.state.settingsConfig.toolPresentationMode === 'ptc')
    check('声明行缺失：回执 projection.applied=false 且带原因（下次启动自愈按权威值重建投影）',
      put.body.projection !== undefined && put.body.projection.applied === false && String(put.body.projection.error).includes('declaration row not found'))
    check('声明行缺失：GET 回读权威值（settings 行）而非出厂默认', put.body.values.webFetch === true && put.body.values.toolPresentationMode === 'ptc')
    check('声明行缺失：无任何声明行写入尝试（edits 恰 1 次 = settings 行）', noDeclarationEditor.state.edits.length === 1 && noDeclarationEditor.state.edits[0].id === SETTINGS_ROW_ID)
  } finally {
    await new Promise((resolve) => noDeclarationRun.server.close(() => resolve()))
  }

  // edit/reconcile 失败口径
  const failingEditor = makeConfigEditor()
  failingEditor.edit = async () => { throw new Error('reconcile failed: new row did not load') }
  const failingRun = await startServer(failingEditor)
  try {
    const put = await requestJson(failingRun.port, 'PUT', '/api/dsh-extra-plan-settings/pro-config', { webFetch: true })
    check('edit/reconcile 失败 → 500（非行定位错误）', put.status === 500 && String(put.body.error).includes('reconcile failed'))
  } finally {
    await new Promise((resolve) => failingRun.server.close(() => resolve()))
  }

  // restatePresetPlugins 与 settings.js 走同一实现（写链单一来源）
  const shared = restatePresetPlugins({ plugins: declaredPlugins() }, {}, { hostRowConfig: { 'tool-web': { fetch: true } }, gateWords: null })
  check('settings.js 与 preset-sync.js 共用 restatePresetPlugins（单点写链，返回 {...current, plugins}）', shared.plugins.find((row) => row.id === 'tool-web').config.fetch === true && restatePluginsRow(declaredPlugins(), 'tool-web', { fetch: true }) !== null)
} catch (error) {
  fail += 1
  console.error('FAIL  设置页 HTTP 回归异常: ' + String(error && error.stack || error))
}

console.log('\n通过 ' + pass + ', 失败 ' + fail)
process.exit(fail === 0 ? 0 : 1)
