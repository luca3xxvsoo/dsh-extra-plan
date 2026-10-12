// 安装/启动同步回归：单一全局 owner、真实 deferred 生命周期与官方 Loader carrier 夹具。
// 所有非 Loader 夹具均在内存中；真实 Loader 缺依赖只记录 SKIP，不以 mock 冒充通过。
import { readFileSync } from 'node:fs'
import { createRequire, registerHooks } from 'node:module'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { isDeepStrictEqual } from 'node:util'
import { parsePresetYaml } from '../../plugins/dsh-extra-plan/lib/preset-settings.js'
import {
  SETTINGS_ROW_ID,
  PRESET_ROW_ID,
  activeLegacyRow,
  assetDefinition,
  definitionWithProjection,
  mountPresetSync,
  readLegacyState,
  syncPreset,
} from '../../plugins/dsh-extra-plan/lib/preset-sync.js'
import { GATE_WORD_FIELDS } from '../../plugins/dsh-extra-plan/lib/gate-words.js'

const ROOT = fileURLToPath(new URL('../..', import.meta.url))
const OFFICIAL_ROOT = process.env.DSH_INSTALL_ROOT || 'C:\\Users\\Administrator\\AppData\\Roaming\npm\node_modules\\@deepseek-ai\\dsh'
try {
  const anchor = createRequire(join(OFFICIAL_ROOT, 'package.json'))
  const schemaUrl = new URL('file:///' + anchor.resolve('@deepseek-ai/schemastery').replaceAll('\\\\', '/')).href
  if (typeof registerHooks === 'function') registerHooks({ resolve(specifier, context, next) { return specifier === '@deepseek-ai/schemastery' ? { url: schemaUrl, shortCircuit: true } : next(specifier, context) } })
} catch { /* 静态/生命周期夹具仍可执行 */ }

const patchText = readFileSync(join(ROOT, 'plugins/dsh-extra-plan/cordis.patch.yml'), 'utf8')
const definition = assetDefinition()
const gate = Object.fromEntries(GATE_WORD_FIELDS.map((item, index) => [item.field, '词' + index]))
const completeSettings = { anchoredBootstrap: true, creativeMode: false, webFetch: true, toolPresentationMode: 'ptc', runcodeCatchGate: false, crossProviderPlannerModel: false, plannerModel: 'm', plannerPromptSuffix: 's', exploreBudget: 18, otherAgentModel: '', gateWords: gate }
let pass = 0
let fail = 0
function check(label, condition) { if (condition) { pass += 1; console.log('PASS  ' + label) } else { fail += 1; console.log('FAIL  ' + label) } }
function deferred() { let resolve; const promise = new Promise((done) => { resolve = done }); return { promise, resolve } }
async function flush() { await Promise.resolve(); await new Promise((resolve) => setImmediate(resolve)) }
function findRow(rows, id) { for (const item of rows || []) { if (item !== null && typeof item === 'object' && item.id === id) return item; if (item !== null && typeof item === 'object' && Array.isArray(item.config)) { const nested = findRow(item.config, id); if (nested !== undefined) return nested } } return undefined }
function makeEditor(config, editGate) {
  const row = { entry: { options: { id: SETTINGS_ROW_ID, config: structuredClone(config) }, fiber: {} }, inherited: {}, override: {} }
  const state = { rows: [row], edits: 0 }
  return {
    state,
    configuration: () => state.rows,
    documentPath: '',
    edit: async (entry, change) => { state.edits += 1; if (editGate !== undefined) await editGate.promise; const current = state.rows.find((item) => item.entry === entry); if (current === undefined) throw new Error('entry disappeared'); current.entry.options.config = change(structuredClone(current.entry.options.config), current.inherited) },
  }
}
function makeContext(editor, pluginImpl) {
  let updateListener
  let updateOff = 0
  let pluginCalls = 0
  let pluginDisposals = 0
  const ctx = {
    configEditor: editor,
    on: (event, callback) => { if (event === 'internal/update') updateListener = callback; return () => { updateOff += 1 } },
    plugin: async () => { pluginCalls += 1; const fiber = await pluginImpl(); return { dispose: async () => { pluginDisposals += 1; if (fiber !== undefined && typeof fiber.dispose === 'function') return fiber.dispose() } } },
  }
  return { ctx, get updateListener() { return updateListener }, get updateOff() { return updateOff }, get pluginCalls() { return pluginCalls }, get pluginDisposals() { return pluginDisposals } }
}

const patch = parsePresetYaml(patchText)
check('V07 patch 公开 insert 恰一行且无旧同步公开 row', Array.isArray(patch) && patch.length === 1 && patch[0].insert.length === 1 && patch[0].insert[0].id === SETTINGS_ROW_ID && patch[0].insert.filter((row) => row.id === PRESET_ROW_ID).length === 0)
check('V07 纯 definition 顶层 17 行且 raw !!js 保真', definition.plugins.length === 17 && JSON.stringify(definition).includes('__jsExpr'))
const oldSyncPatch = '- id: extra-plan-preset-sync\n  config:\n    webFetch: true\n    toolPresentationMode: ptc\n    gateWords:\n' + Object.entries(gate).map(([key, value]) => '      ' + key + ': ' + value).join('\n') + '\n'
const oldState = readLegacyState(oldSyncPatch)
check('V04 旧同步公开行只读兼容并提取严格 gateWords', oldState.projection.webFetch === true && oldState.projection.toolPresentationMode === 'ptc' && oldState.gateWords !== undefined)
const idle = await syncPreset({ settingsValues: completeSettings, readPatch: () => '' })
check('V04 完整全局值启动同步为 idle，不生成公开 row 计划', idle.action === 'idle')
let plan = null
const migrated = await syncPreset({ settingsValues: { plannerModel: 'm' }, readPatch: () => oldSyncPatch, apply: async (value) => { plan = value } })
check('V04 缺项迁移只计划 settings 全局行 edit', migrated.action === 'written' && plan !== null && plan.settings !== null && plan.preset === null && plan.definition.plugins.length === 17)
const projected = definitionWithProjection({ webFetch: true, toolPresentationMode: 'both', gateWords: gate })
check('V07 两项宿主值仅派生到内存 definition，原资产不变', findRow(projected.plugins, 'tool-web').config.fetch === true && findRow(projected.plugins, 'tool-presentation').config.mode === 'both' && findRow(assetDefinition().plugins, 'tool-web').config.fetch === false)
check('V06 历史 preset-extra-plan 状态 0/1/2 占用 adapter，禁用/无fiber/3+不占用', [0, 1, 2].every((state) => activeLegacyRow([{ entry: { options: { id: 'preset-extra-plan' }, fiber: { state } } }])) && !activeLegacyRow([{ entry: { options: { id: 'preset-extra-plan' }, disabled: true, fiber: { state: 2 } } }]) && !activeLegacyRow([{ entry: { options: { id: 'preset-extra-plan' } } }]) && !activeLegacyRow([{ entry: { options: { id: 'preset-extra-plan' }, fiber: { state: 3 } } }]))

// 排队后关闭：已在途 edit 允许结算，关闭后排队 run 不得再 edit/注册。
const editGate = deferred()
const queuedEditor = makeEditor({ plannerModel: 'm' }, editGate)
const queuedStats = makeContext(queuedEditor, async () => ({ dispose() {} }))
const queuedDispose = mountPresetSync(queuedStats.ctx)
await flush()
if (typeof queuedStats.updateListener === 'function') { queuedStats.updateListener(); queuedStats.updateListener() }
const queuedClosing = queuedDispose()
await flush()
check('V06 editor.edit 在途时关闭不启动新 edit，旧 edit保持原生在途', queuedEditor.state.edits === 1 && queuedStats.pluginCalls === 0)
editGate.resolve()
await queuedClosing
await flush()
if (typeof queuedStats.updateListener === 'function') queuedStats.updateListener()
await flush()
check('V06 关闭后旧 update listener 回调不产生新增写入/adapter', queuedEditor.state.edits === 1 && queuedStats.pluginCalls === 0 && queuedStats.updateOff === 1)
await queuedDispose()
check('V06 重复 dispose 幂等', queuedStats.pluginDisposals === 0)

// adapter await 竞态：plugin 返回 deferred，关闭先发生；结算后候选 fiber 恰一次 dispose。
const adapterGate = deferred()
const adapterEditor = makeEditor(completeSettings)
const adapterStats = makeContext(adapterEditor, async () => adapterGate.promise)
const adapterDispose = mountPresetSync(adapterStats.ctx)
await flush()
check('V06 adapter 注册进入在途 await', adapterStats.pluginCalls === 1 && adapterStats.pluginDisposals === 0)
const adapterClosing = adapterDispose()
await flush()
check('V06 adapter await 未结算前 dispose 等待、不重复注册', adapterStats.pluginDisposals === 0 && adapterStats.pluginCalls === 1)
adapterGate.resolve({ dispose: async () => {} })
await adapterClosing
await flush()
check('V06 adapter await 结算后释放恰一次且重复 dispose 幂等', adapterStats.pluginDisposals === 1)
await adapterDispose()
check('V06 关闭后不存在活动 adapter source', adapterStats.pluginDisposals === 1)

// owner 快速关开：上一 owner 释放后新 owner 可重新注册，互不共享活动资源。
let reopenRegistered = 0
let reopenDisposed = 0
const reopenEditor = makeEditor(completeSettings)
const reopenCtx = makeContext(reopenEditor, async () => ({ dispose: async () => { reopenDisposed += 1 } }))
const reopenDispose = mountPresetSync(reopenCtx.ctx)
await flush()
await reopenDispose()
const reopenEditor2 = makeEditor(completeSettings)
const reopenCtx2 = makeContext(reopenEditor2, async () => ({ dispose: async () => { reopenDisposed += 1 } }))
const reopenDispose2 = mountPresetSync(reopenCtx2.ctx)
await flush()
reopenRegistered = reopenCtx.pluginCalls + reopenCtx2.pluginCalls
await reopenDispose2()
check('V06 owner 快速关开各自同生共死，无多活动 adapter', reopenRegistered === 2 && reopenDisposed === 2)

// 真实官方 Loader carrier：依赖缺失只 SKIP；能加载时检查 client-carrier entry 的实际消失。
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
  const activeEntries = [...carrierRoot.loader.entries()].filter((entry) => String(entry.options.name).includes('client-carrier.js'))
  check('V06 真实 Loader carrier 实际注册唯一 source', activeEntries.length === 1 && activeEntries[0].options.id === 'dsh-extra-plan-client-carrier')
  await carrierRoot.loader.remove('settings')
  await carrierRoot.loader.await()
  await flush()
  const remainingEntries = [...carrierRoot.loader.entries()].filter((entry) => String(entry.options.name).includes('client-carrier.js'))
  check('V06 真实 Loader 卸载移除 carrier source', remainingEntries.length === 0)

  const { default: OfficialAgentPreset } = await import('@deepseek-ai/dsh-agent-preset')
  const adapterStats = { registered: 0, disposed: 0, received: undefined }
  const adapterRoot = new Context()
  adapterRoot.provide('agentPresets', {
    register: async (received) => {
      adapterStats.registered += 1
      adapterStats.received = received
      return async () => { adapterStats.disposed += 1 }
    },
  })
  const adapterFiber = adapterRoot.plugin(OfficialAgentPreset, definition)
  await adapterFiber
  check('F04 真实 Cordis Context/官方 AgentPreset 收到正确 definition 且 register 恰一次', adapterStats.registered === 1 && isDeepStrictEqual(adapterStats.received, definition))
  await adapterFiber.dispose()
  await flush()
  check('F04 真实官方 adapter disposer 恰一次', adapterStats.disposed === 1)
} catch (error) {
  const message = String(error && error.message || error)
  if (/Cannot find module|ERR_MODULE_NOT_FOUND|找不到|not found|依赖/.test(message)) console.log('SKIP  {"scope":"REAL-LOADER-OR-ADAPTER","reason":"官方 Loader 依赖不可用: ' + message.replaceAll('\n', ' ') + '"}')
  else { fail += 1; console.error('FAIL  真实 Loader carrier 夹具异常: ' + String(error && error.stack || error)) }
}

console.log('\n通过 ' + pass + ', 失败 ' + fail)
process.exit(fail === 0 ? 0 : 1)
