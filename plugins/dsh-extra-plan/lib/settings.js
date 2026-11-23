// dsh-extra-plan-settings 的唯一全局管理入口。
// settings 行 config 是全部 11 个权威值的载体；gateWords 由 preset-sync 的写回路径严格校验并保留。
// 本入口统一拥有 settings/carrier、当前值补齐；AgentPreset 仅由 preset-sync 初始/结构路径管理。
// 1 项宿主设置（toolPresentationMode）只从权威值派生到内存 definition，不再写独立公开投影行。

import { resolve as pathResolve } from 'node:path'
import z from '@deepseek-ai/schemastery'
import {
  SETTING_DEFINITIONS,
  SETTINGS_ROW_ID,
} from './preset-settings.js'
import { mountPresetSync } from './preset-sync.js'
import { createPathContext } from './path-policy.js'
import { startUsageLedgerBackground } from './usage-ledger-background.js'
import { pruneDiagnosticLogs } from './log-retention.js'

const DIAGNOSTIC_PRUNE_STATE = Symbol.for('dsh-extra-plan.diagnostic-prune-state')

function safeContextGet(ctx, key) {
  try { return ctx !== undefined && ctx !== null && typeof ctx.get === 'function' ? ctx.get(key) : undefined } catch (error) { return undefined }
}

function absoluteRoot(value) {
  if (typeof value !== 'string' || value.trim() === '') return null
  try {
    return createPathContext({ workspaceRoot: value }).workspaceRoot
  } catch {
    return null
  }
}

function rootFact(value, present) {
  if (present !== true) return { state: 'missing', path: null }
  const normalized = absoluteRoot(value)
  return normalized === null ? { state: 'invalid', path: null } : { state: 'valid', path: normalized }
}

function sameRoot(left, right) {
  if (left === null || right === null) return false
  const a = pathResolve(left)
  const b = pathResolve(right)
  return process.platform === 'win32' ? a.toLowerCase() === b.toLowerCase() : a === b
}

function documentFact(value, present) {
  if (present !== true || value === undefined || value === null || value === '') return { state: 'missing', path: null }
  const normalized = absoluteRoot(value)
  return normalized === null ? { state: 'invalid', path: null } : { state: 'valid', path: normalized }
}

function configEditorServiceOf(ctx) {
  const service = safeContextGet(ctx, 'configEditor')
  return service !== undefined && service !== null && typeof service.configuration === 'function' && typeof service.edit === 'function' ? service : null
}

function settingsPathContext(ctx, editor) {
  const profile = safeContextGet(ctx, 'profileContext')
  const has = (key) => profile !== undefined && profile !== null && Object.prototype.hasOwnProperty.call(profile, key)
  const profileHomeFact = rootFact(profile?.home, has('home'))
  const profilePatchFact = rootFact(profile?.patchPath, has('patchPath'))
  const installAnchorFact = rootFact(profile?.installAnchor, has('installAnchor'))
  const service = configEditorServiceOf(ctx)
  const actualEditor = service !== null && service === editor
  let editorDocumentFact = { state: 'missing', path: null }
  if (actualEditor) {
    try { editorDocumentFact = documentFact(editor.documentPath, editor.documentPath !== undefined) } catch (error) { editorDocumentFact = { state: 'invalid', path: null } }
  }
  let documentState = 'missing'
  let documentPath = null
  let documentCapability = null
  if (profilePatchFact.state === 'invalid' || editorDocumentFact.state === 'invalid') documentState = 'invalid'
  else if (profilePatchFact.state === 'valid' && editorDocumentFact.state === 'valid' && !sameRoot(profilePatchFact.path, editorDocumentFact.path)) documentState = 'conflict'
  else if (editorDocumentFact.state === 'valid') {
    documentState = 'valid'
    documentPath = editorDocumentFact.path
    documentCapability = profilePatchFact.state === 'valid' ? 'profilePatch' : 'editorDocument'
  } else if (profilePatchFact.state === 'valid') {
    documentState = 'valid'
    documentPath = profilePatchFact.path
    documentCapability = 'profilePatch'
  }
  const homeProvider = safeContextGet(ctx, 'dshHomePath')
  let dshHomeFact = { state: 'missing', path: null }
  if (typeof homeProvider === 'function') {
    try { dshHomeFact = rootFact(homeProvider(), true) } catch (error) { dshHomeFact = { state: 'invalid', path: null } }
  }
  const envPresent = Object.prototype.hasOwnProperty.call(process.env, 'DSH_HOME')
  const envHomeFact = rootFact(process.env.DSH_HOME, envPresent)
  const trustedSources = [profileHomeFact, dshHomeFact]
  const invalidTrustedSource = trustedSources.some((item) => item.state === 'invalid')
  const validSources = trustedSources.filter((item) => item.state === 'valid')
  const trustedConflict = validSources.some((item) => !sameRoot(item.path, validSources[0]?.path))
  const envConflict = validSources.length > 0 && envHomeFact.state === 'valid' && !sameRoot(envHomeFact.path, validSources[0]?.path)
  const envInvalidWithTrustedRoot = validSources.length > 0 && envHomeFact.state === 'invalid'
  const hostConflict = trustedConflict || envConflict
  const hostState = invalidTrustedSource || envInvalidWithTrustedRoot ? 'invalid' : hostConflict ? 'conflict' : validSources.length === 0 ? 'missing' : 'valid'
  const hostDataRoot = hostState === 'valid' ? validSources[0].path : null
  const capabilities = {}
  if (profilePatchFact.state === 'valid') capabilities.profilePatch = { path: profilePatchFact.path, type: 'file', access: 'write', purpose: 'config-editor' }
  if (documentCapability === 'editorDocument' && documentPath !== null) capabilities.editorDocument = { path: documentPath, type: 'file', access: 'read', purpose: 'config-editor' }
  if (installAnchorFact.state === 'valid') capabilities.installAnchor = { path: installAnchorFact.path, type: 'file', access: 'read', purpose: 'install-anchor' }
  const options = { hostCapabilities: capabilities }
  if (hostState === 'valid' && hostDataRoot !== null) options.hostDataRoot = hostDataRoot
  if (options.hostDataRoot === undefined && Object.keys(capabilities).length === 0) return null
  let pathContext
  try { pathContext = createPathContext(options) } catch (error) { return null }
  return pathContext
}

export const name = 'dsh-extra-plan-settings'
export const inject = []

const CLIENT_CARRIER_ENTRY_ID = 'dsh-extra-plan-client-carrier'
const carrierByLoader = new WeakMap()
function mountClientCarrier(child) {
  const loader = typeof child.get === 'function' ? child.get('loader') : child.loader
  const Group = loader !== undefined && loader !== null && loader.builtins !== undefined ? loader.builtins.group : undefined
  if (loader === undefined || loader === null || typeof Group !== 'function') {
    console.warn('[dsh-extra-plan] 宿主未提供 Loader Group，Client carrier 未挂载')
    return undefined
  }
  let shared = carrierByLoader.get(loader)
  if (shared === undefined) {
    const fiber = child.plugin(Group, [{
      id: CLIENT_CARRIER_ENTRY_ID,
      name: new URL('./client-carrier.js', import.meta.url).href,
    }])
    shared = { fiber, refs: 0 }
    carrierByLoader.set(loader, shared)
  }
  shared.refs += 1
  let released = false
  return () => {
    if (released) return undefined
    released = true
    shared.refs -= 1
    if (shared.refs === 0) {
      carrierByLoader.delete(loader)
      const fiber = shared.fiber
      shared.fiber = undefined
      return fiber.dispose()
    }
    return undefined
  }
}

/** descriptor scalarType → schemastery 字段；合同负责类型/默认值，settings 只负责宿主 schema 链。 */
function schemaField(definition) {
  let field
  if (definition.scalarType === 'boolean') field = z.boolean()
  else if (definition.scalarType === 'integer') field = z.number().step(1).min(1)
  else field = z.string()
  return field.default(definition.defaultValue).volatile()
}

/** 11 项 settings 全局行 Config；volatile 字段由官方 ConfigForms 投影。 */
export const Config = z.object(Object.fromEntries(
  SETTING_DEFINITIONS.map((definition) => [definition.key, schemaField(definition)]),
))

function diagnosticPruneRootOf(ctx) {
  try {
    if (ctx === null || ctx === undefined) return null
    const root = ctx.root !== undefined && ctx.root !== null ? ctx.root : ctx
    return root !== null && (typeof root === 'object' || typeof root === 'function') ? root : null
  } catch (error) {
    return null
  }
}

function diagnosticPruneStateOf(ctx) {
  const root = diagnosticPruneRootOf(ctx)
  if (root === null) return null
  try {
    const existing = root[DIAGNOSTIC_PRUNE_STATE]
    if (existing instanceof Map) return existing
    if (existing !== undefined) return null
    const state = new Map()
    Object.defineProperty(root, DIAGNOSTIC_PRUNE_STATE, {
      value: state,
      enumerable: false,
      configurable: false,
      writable: false,
    })
    return state
  } catch (error) {
    return null
  }
}

function diagnosticPruneKey(hostDataRoot) {
  const normalized = pathResolve(hostDataRoot)
  return process.platform === 'win32' ? normalized.toLowerCase() : normalized
}

function startupPruneDiagnosticLogsForApply(ctx) {
  let startupContext = null
  try { startupContext = settingsPathContext(ctx, undefined) } catch (error) { startupContext = null }
  const hostDataRoot = startupContext !== null && startupContext !== undefined ? startupContext.hostDataRoot : null
  if (typeof hostDataRoot !== 'string' || hostDataRoot === '') {
    console.warn('[dsh-extra-plan] diagnostic log prune skipped: no-host-root')
    return
  }
  if (ctx === null || ctx === undefined || typeof ctx.effect !== 'function') {
    console.warn('[dsh-extra-plan] diagnostic log prune skipped: root ctx.effect unavailable')
    return
  }
  const records = diagnosticPruneStateOf(ctx)
  if (!(records instanceof Map)) {
    console.warn('[dsh-extra-plan] diagnostic log prune skipped: root state unavailable')
    return
  }
  let key
  try {
    key = diagnosticPruneKey(hostDataRoot)
  } catch (error) {
    console.warn('[dsh-extra-plan] diagnostic log prune skipped: invalid-host-root')
    return
  }
  try {
    ctx.effect(() => {
      const owner = { alive: true, released: false }
      let record = records.get(key)
      let created = false
      if (record === undefined) {
        record = { owners: new Set(), status: 'scheduled', timer: null, promise: null, error: null }
        records.set(key, record)
        created = true
      }
      record.owners.add(owner)
      if (created) {
        const run = () => {
          const hasLiveOwner = [...record.owners].some((item) => item.alive === true)
          if (records.get(key) !== record || !hasLiveOwner) return
          record.status = 'running'
          record.timer = null
          record.promise = Promise.resolve().then(() => pruneDiagnosticLogs(startupContext)).then((result) => {
            record.status = 'done'
            if (result !== null && typeof result === 'object' && result.status === 'pruned') {
              try { console.warn('[dsh-extra-plan] diagnostic log prune: ' + JSON.stringify(result)) } catch (error) {}
            }
          }, (error) => {
            record.error = error
            record.status = 'done'
            try { console.warn('[dsh-extra-plan] diagnostic log prune failed（不阻断启动）: ' + (error instanceof Error ? error.message : String(error))) } catch (warnError) {}
          })
        }
        try {
          const timer = setTimeout(run, 0)
          record.timer = timer
          if (timer !== null && typeof timer === 'object' && typeof timer.unref === 'function') timer.unref()
        } catch (error) {
          record.error = error
          record.status = 'done'
          record.owners.delete(owner)
          owner.alive = false
          if (records.get(key) === record) records.delete(key)
          try { console.warn('[dsh-extra-plan] diagnostic log prune scheduling failed（不阻断启动）: ' + (error instanceof Error ? error.message : String(error))) } catch (warnError) {}
        }
      }
      return () => {
        if (owner.released) return record.promise
        owner.released = true
        owner.alive = false
        record.owners.delete(owner)
        if (records.get(key) !== record) return record.promise
        if (record.status === 'scheduled' && record.owners.size === 0) {
          if (record.timer !== null) {
            try { clearTimeout(record.timer) } catch (error) {}
            record.timer = null
          }
          records.delete(key)
          return undefined
        }
        if (record.status === 'running' || record.status === 'done') return record.promise
        return undefined
      }
    }, 'dsh-extra-plan-settings: diagnostic log prune')
  } catch (error) {
    try { console.warn('[dsh-extra-plan] diagnostic log prune effect failed（不阻断启动）: ' + (error instanceof Error ? error.message : String(error))) } catch (warnError) {}
  }
}

function startupArchiveForApply(ctx) {
  try {
    const startupContext = settingsPathContext(ctx, undefined)
    if (startupContext === null) {
      console.warn('[dsh-extra-plan] startup archive skipped: no-host-root')
      return
    }
    if (typeof ctx.effect !== 'function') {
      console.warn('[dsh-extra-plan] startup archive failed（不阻断启动）: root ctx.effect unavailable')
      return
    }
    // 账本工作交由后台 controller/Worker 调度；保留 cancel/done 生命周期控制与非阻断诊断。
    const startBackground = () => {
      try {
        const handle = startUsageLedgerBackground(ctx, startupContext)
        let disposePromise
        const dispose = () => {
          if (disposePromise !== undefined) return disposePromise
          handle.cancel()
          disposePromise = Promise.resolve(handle.done).then(() => undefined, (error) => {
            console.warn('[dsh-extra-plan] startup archive dispose failed（不阻断卸载）: ' + (error instanceof Error ? error.message : String(error)))
          })
          return disposePromise
        }
        Promise.resolve(handle.done).then((result) => {
          if (result.status !== 'archived' && result.status !== 'up-to-date' && result.status !== 'cancelled') console.warn('[dsh-extra-plan] startup archive ' + result.status + ': ' + (result.reason || 'unknown'))
        }, (error) => {
          console.warn('[dsh-extra-plan] startup archive failed（不阻断启动）: ' + (error instanceof Error ? error.message : String(error)))
        })
        return dispose
      } catch (error) {
        console.warn('[dsh-extra-plan] startup archive failed（不阻断启动）: ' + (error instanceof Error ? error.message : String(error)))
        return undefined
      }
    }
    const ready = safeContextGet(ctx, 'appReady')
    // 无有效 appReady：root effect 直接调度后台 controller/Worker，不在主线程同步扫描。
    if (ready === undefined || ready === null || typeof ready.onReady !== 'function') {
      ctx.effect(startBackground, 'dsh-extra-plan-settings: usage ledger background')
      return
    }
    // 有 appReady：把账本扫描推迟到启动完成后的下一个宏任务，启动关键路径不再等扫描。
    ctx.effect(() => {
      let closed = false
      let pending = null
      let dispose
      const cancelReady = ready.onReady(() => {
        pending = setImmediate(() => {
          pending = null
          if (closed) return
          try {
            dispose = startBackground()
          } catch (error) {
            console.warn('[dsh-extra-plan] startup archive failed（不阻断启动）: ' + (error instanceof Error ? error.message : String(error)))
          }
        })
      })
      return () => {
        closed = true
        if (typeof cancelReady === 'function') cancelReady()
        if (pending !== null) { clearImmediate(pending); pending = null }
        return typeof dispose === 'function' ? dispose() : undefined
      }
    }, 'dsh-extra-plan-settings: usage ledger background')
  } catch (error) {
    console.warn('[dsh-extra-plan] startup archive failed（不阻断启动）: ' + (error instanceof Error ? error.message : String(error)))
  }
}

export function apply(ctx) {
  startupPruneDiagnosticLogsForApply(ctx)
  startupArchiveForApply(ctx)
  ctx.inject(['loader'], (child) => child.effect(() => mountClientCarrier(child), 'dsh-extra-plan-settings: internal client carrier'))
  ctx.inject(['settings'], (child) => child.effect(() => child.settings.configure({ auto: false }, ctx.fiber), 'dsh-extra-plan-settings: settings policy'))
  ctx.inject(['configEditor'], (child) => child.effect(() => mountPresetSync(child, { installAnchor: absoluteRoot(safeContextGet(ctx, 'profileContext')?.installAnchor) }), 'dsh-extra-plan-settings: sync and adapter lifecycle'))
}

export { SETTINGS_ROW_ID }
