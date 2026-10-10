// preset-sync 新载体回归：纯 definition + 两公开行投影 + 旧声明行非破坏迁移。
// 所有夹具只在内存/临时目录中运行，不读取或写入生产 profile。
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  ASSET_DIR,
  activeLegacyRow,
  PRESET_SYNC_CONFIG_KEYS,
  assetDefinition,
  definitionWithProjection,
  declarationBodyMatchesAsset,
  carryUserWritable,
  readDeclaredPluginsFromPatch,
  readLegacyPresetState,
  restatePresetSyncConfig,
  syncPreset,
} from '../../plugins/dsh-extra-plan/lib/preset-sync.js'
import { GATE_WORD_FIELDS } from '../../plugins/dsh-extra-plan/lib/gate-words.js'

const HERE = fileURLToPath(new URL('.', import.meta.url))
const definitionFile = join(ASSET_DIR, 'preset-definition.generated.yml')
const definitionText = readFileSync(definitionFile, 'utf8')
const definition = assetDefinition()
const pluginText = definitionText.slice(definitionText.indexOf('plugins:\n') + 'plugins:\n'.length)
const legacyPatch = [
  '- id: preset-extra-plan',
  "  name: '@deepseek-ai/dsh-agent-preset'",
  '  config:',
  '    id: extra-plan',
  "    name: '按需规划模式'",
  "    description: '实现权限控制+子代理角色分配'",
  '    order: 100',
  '    plugins:',
  ...pluginText.split('\n').filter((line, index, lines) => index < lines.length - 1).map((line) => '  ' + line),
  '',
].join('\n')
const legacyPlugins = readDeclaredPluginsFromPatch(legacyPatch)
const GATE_CUSTOM = {
  routeDirect: '甲直行', routePlan: '乙规划', routeDisagree: '丙否决',
  approvalApprove: '丁批准', approvalReplan: '戊转规划', purposeRefine: '己完整', purposeRedo: '庚重做',
}
let pass = 0
let fail = 0
function check(label, condition) {
  if (condition) { pass += 1; console.log('PASS  ' + label) }
  else { fail += 1; console.log('FAIL  ' + label) }
}
function row(rows, id) {
  for (const item of rows || []) {
    if (item !== null && typeof item === 'object' && item.id === id) return item
    if (item !== null && typeof item === 'object' && Array.isArray(item.config)) {
      const nested = row(item.config, id)
      if (nested !== undefined) return nested
    }
  }
  return undefined
}

check('D1 生成 definition 纯对象：id/name/description/order + 17 plugins', definition.id === 'extra-plan' && definition.name === '按需规划模式' && definition.description === '实现权限控制+子代理角色分配' && definition.order === 100 && definition.plugins.length === 17)
check('D2 definition 无 Loader insert wrapper 且保留 raw !!js marker', !definitionText.includes('insert:') && definitionText.includes('!!js') && definitionText.includes("createRequire(baseUrl).resolve('@deepseek-ai/dsh-agent-preset/package.json')"))
check('D3 definition 与作者源顶层行逐项一致', JSON.stringify(definition.plugins) === JSON.stringify(assetDefinition().plugins))
check('D4 旧声明行可读取且不删除', Array.isArray(legacyPlugins) && legacyPlugins.length === 17 && legacyPatch.includes('preset-extra-plan'))
check('D5 legacy state 只抽取支持投影/gateWords', (() => { const state = readLegacyPresetState(legacyPatch); return state.projection.webFetch === false && state.projection.toolPresentationMode === 'native' && Object.keys(state.projection.gateWords).length === 7 })())
check('D6 旧 body 仅用户字段变化时本体仍相等', (() => { const changed = structuredClone(legacyPlugins); row(changed, 'tool-web').config.fetch = true; row(changed, 'extra-plan').config.gateWords = GATE_CUSTOM; return declarationBodyMatchesAsset(changed, definition.plugins) })())
check('D7 carryUserWritable 保留旧两项投影和七词', (() => { const changed = structuredClone(legacyPlugins); row(changed, 'tool-presentation').config.mode = 'ptc'; row(changed, 'extra-plan').config.gateWords = GATE_CUSTOM; const carried = carryUserWritable(changed); return carried.hostRowConfig['tool-presentation'].mode === 'ptc' && carried.gateWords.routePlan === GATE_CUSTOM.routePlan })())

const run = async (options) => {
  const applied = []
  const result = await syncPreset({ ...options, apply: async (plan) => { applied.push(plan) } })
  return { result, applied }
}
const first = await run({ presetSyncConfig: {}, settingsValues: { webFetch: true, toolPresentationMode: 'both' } })
check('E1 settings authority 非默认值 → written 且只计划公开行 config 投影', first.result.action === 'written' && first.applied.length === 1 && first.applied[0].preset.config.webFetch === true && first.applied[0].preset.config.toolPresentationMode === 'both' && first.applied[0].settings === null)
const stableGateWords = structuredClone(row(definition.plugins, 'extra-plan').config.gateWords)
const stable = await syncPreset({ presetSyncConfig: { webFetch: true, toolPresentationMode: 'both', gateWords: stableGateWords }, settingsValues: { webFetch: true, toolPresentationMode: 'both' } })
check('E2 公开投影与权威值相等且 gateWords 合法时收敛 idle', stable.action === 'idle')
const migrated = await run({ declaredPlugins: (() => { const changed = structuredClone(legacyPlugins); row(changed, 'tool-web').config.fetch = true; row(changed, 'tool-presentation').config.mode = 'ptc'; row(changed, 'extra-plan').config.gateWords = GATE_CUSTOM; return changed })(), presetSyncConfig: {}, settingsValues: {} })
check('E3 旧声明行迁移：written 只写新公开行并回填 settings，不写旧 row', migrated.result.action === 'written' && migrated.applied.length === 1 && migrated.applied[0].preset !== null && migrated.applied[0].preset.config.webFetch === true && migrated.applied[0].preset.config.toolPresentationMode === 'ptc' && migrated.applied[0].settings !== null && migrated.applied[0].settings.values.webFetch === true && migrated.applied[0].settings.values.toolPresentationMode === 'ptc')
check('E4 新写入键集合仅为受支持投影/gateWords', Object.keys(migrated.applied[0].preset.config).every((key) => PRESET_SYNC_CONFIG_KEYS.includes(key)))
const invalid = await run({ presetSyncConfig: { webFetch: 'bad', toolPresentationMode: 'code', gateWords: { routeDirect: 'x' } }, settingsValues: { webFetch: false, toolPresentationMode: 'native' } })
check('E5 非法公开投影/词表回落并修复为权威值/资产默认', invalid.result.action === 'written' && invalid.applied[0].preset.config.webFetch === false && invalid.applied[0].preset.config.toolPresentationMode === 'native' && GATE_WORD_FIELDS.every((item) => invalid.applied[0].preset.config.gateWords[item.field] !== undefined))
const stale = structuredClone(definition.plugins)
row(stale, 'agent-instructions').config.maxBytes = 123
const noBodyWrite = await syncPreset({ declaredPlugins: stale, presetSyncConfig: { webFetch: false, toolPresentationMode: 'native' }, settingsValues: { webFetch: false, toolPresentationMode: 'native' } })
check('E6 本体升级以 definition 重建，不回写旧 preset-extra-plan body', noBodyWrite.action === 'written' && noBodyWrite.plan.preset !== null && noBodyWrite.plan.preset.config.plugins === undefined)
const projected = definitionWithProjection({ webFetch: true, toolPresentationMode: 'ptc', gateWords: GATE_CUSTOM })
check('E7 新 revision 两项宿主投影与 gateWords 与设置投影一致', row(projected.plugins, 'tool-web').config.fetch === true && row(projected.plugins, 'tool-presentation').config.mode === 'ptc' && row(projected.plugins, 'extra-plan').config.gateWords.routeDirect === GATE_CUSTOM.routeDirect)
check('D06 definition raw !!js marker 在 adapter 前保持未求值且 baseUrl/skills 表达式保真', (() => { const value = row(projected.plugins, 'skill-filesystem').config.bundledSkillDir; return value !== null && typeof value === 'object' && typeof value.__jsExpr === 'string' && value.__jsExpr.includes('baseUrl') && value.__jsExpr.includes("'skills'") })())
check('E8 restatePresetSyncConfig 丢弃完整 preset body，仅保留 3 类支持字段', (() => { const next = restatePresetSyncConfig({ plugins: legacyPlugins, webFetch: false, toolPresentationMode: 'native', gateWords: GATE_CUSTOM }, {}, { webFetch: true }); return next.webFetch === true && next.plugins === undefined && Object.keys(next).every((key) => PRESET_SYNC_CONFIG_KEYS.includes(key)) })())
const source = readFileSync(join(HERE, '..', '..', 'plugins', 'dsh-extra-plan', 'lib', 'preset-sync.js'), 'utf8')
check('D9 preset-sync 直接 ctx.plugin 官方 adapter，未自建 registry', source.includes('@deepseek-ai/dsh-agent-preset') && source.includes('child.plugin(OfficialAgentPreset') && !source.includes('agentPresets.register('))

const legacyRow = (entry = {}) => [{ entry: { options: { id: 'preset-extra-plan' }, ...entry } }]
check('D10 activeLegacyRow：PENDING/LOADING/ACTIVE（0/1/2）均占用 adapter', [0, 1, 2].every((state) => activeLegacyRow(legacyRow({ fiber: { state } }))))
check('D10 activeLegacyRow：disabled 旧 row 不占用 adapter', !activeLegacyRow(legacyRow({ disabled: true, fiber: { state: 2 } })))
check('D10 activeLegacyRow：无 fiber 旧 row 不占用 adapter', !activeLegacyRow(legacyRow()))
check('D10 activeLegacyRow：FAILED/DISPOSED/UNLOADING（3/4/5）不占用 adapter', [3, 4, 5].every((state) => !activeLegacyRow(legacyRow({ fiber: { state } }))))

// C02/C03：真实 Loader Group 内存夹具（不写 profile）：settings 激活一个 carrier，卸载后 entry 消失。
try {
  const { registerHostDeps } = await import('../_shared/host-deps.mjs')
  await registerHostDeps()
  const { Context } = await import('@deepseek-ai/cordis')
  const { default: Loader, Group } = await import('@deepseek-ai/cordis-plugin-loader')
  const carrierRoot = new Context()
  await carrierRoot.plugin(Loader, { baseUrl: import.meta.url })
  carrierRoot.loader.builtins.group = Group
  await carrierRoot.loader.create({ id: 'settings', name: new URL('../../plugins/dsh-extra-plan/lib/settings.js', import.meta.url).href })
  await carrierRoot.loader.await()
  const activeEntries = [...carrierRoot.loader.entries()].filter((entry) => entry.options.name.includes('client-carrier.js'))
  check('C02 settings 激活真实内部 Loader entry，carrier 只有一个活动 source', activeEntries.length === 1 && activeEntries[0].options.id === 'dsh-extra-plan-client-carrier')
  await carrierRoot.loader.remove('settings')
  await carrierRoot.loader.await()
  await new Promise((resolve) => setImmediate(resolve))
  const remainingEntries = [...carrierRoot.loader.entries()].filter((entry) => entry.options.name.includes('client-carrier.js'))
  check('C03 settings 卸载移除 carrier entry（无 multiple active source）', remainingEntries.length === 0)
  const { default: OfficialAgentPreset } = await import('@deepseek-ai/dsh-agent-preset')
  const adapterRoot = new Context()
  const adapterStats = { registered: 0, disposed: 0 }
  adapterRoot.provide('agentPresets', { register: async () => { adapterStats.registered += 1; return async () => { adapterStats.disposed += 1 } } })
  const adapterFiber = adapterRoot.plugin(OfficialAgentPreset, definition)
  await adapterFiber
  check('D05 官方 AgentPreset adapter 仅注册一次', adapterStats.registered === 1)
  await adapterFiber.dispose()
  await new Promise((resolve) => setImmediate(resolve))
  check('D05 adapter disposer 生命周期仅执行一次', adapterStats.disposed === 1)
} catch (error) {
  check('C02/C03 Loader Group 内存夹具', false)
  console.error('carrier fixture error: ' + String(error && error.stack || error))
}

console.log('\\n通过 ' + pass + ', 失败 ' + fail)
process.exit(fail === 0 ? 0 : 1)
