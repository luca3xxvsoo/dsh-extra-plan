import { parentPort, threadId, workerData } from 'node:worker_threads'
import { createPathContext } from './path-policy.js'
import { startupArchive } from './usage-ledger.js'

const PROTOCOL_VERSION = 1
const port = parentPort
const id = workerData !== null && typeof workerData === 'object' ? workerData.id : ''
let finished = false
let runStarted = false
let cancelView
let pathContext

function errorDetails(error, fallbackCode = 'worker-failed') {
  const code = error !== null && typeof error === 'object' && typeof error.code === 'string' ? error.code : fallbackCode
  const message = error instanceof Error ? error.message : String(error === undefined || error === null ? fallbackCode : error)
  return { code, message }
}

function resultOf(value) {
  const source = value !== null && typeof value === 'object' ? value : {}
  const status = typeof source.status === 'string' ? source.status : 'failed'
  if (status === 'archived' || status === 'up-to-date' || status === 'cancelled' || status === 'skipped') {
    const result = { status }
    for (const key of ['reason', 'archivePath', 'rows', 'groups', 'scannedRows', 'scannedFiles', 'scannedSessions', 'scannedUsageSessions', 'monotonicWarnings', 'archiveBytes', 'cacheRepaired']) {
      if (source[key] !== undefined && (typeof source[key] === 'string' || typeof source[key] === 'number' || typeof source[key] === 'boolean')) result[key] = source[key]
    }
    return result
  }
  const details = source.error !== undefined ? errorDetails(source.error, typeof source.reason === 'string' ? source.reason : 'worker-failed') : { code: typeof source.reason === 'string' ? source.reason : 'worker-failed', message: typeof source.reason === 'string' ? source.reason : 'Worker 归档失败' }
  return { status: 'failed', reason: typeof source.reason === 'string' && source.reason !== '' ? source.reason : details.code, error: details }
}

function post(type, payload = {}) {
  if (port === null) return
  port.postMessage({ type, version: PROTOCOL_VERSION, id, ...payload })
}

function close() {
  if (port !== null) port.close()
}

function finish(value) {
  if (finished) return
  finished = true
  post('result', { result: resultOf(value) })
  close()
}

function cancellationRequested() {
  return cancelView !== undefined && Atomics.load(cancelView, 0) !== 0
}

function capabilitySnapshot(value) {
  if (value === null || typeof value !== 'object') return {}
  const result = {}
  for (const [key, descriptor] of Object.entries(value)) {
    if (descriptor === null || typeof descriptor !== 'object') continue
    if (typeof key !== 'string' || descriptor.name !== key || typeof descriptor.path !== 'string' || typeof descriptor.type !== 'string' || typeof descriptor.access !== 'string') continue
    result[key] = {
      name: descriptor.name,
      path: descriptor.path,
      type: descriptor.type,
      purpose: descriptor.purpose === null || typeof descriptor.purpose === 'string' ? descriptor.purpose : null,
      access: descriptor.access,
    }
  }
  return result
}

function validateAndRebuild() {
  if (port === null) throw new Error('Worker parentPort 不可用')
  if (workerData === null || typeof workerData !== 'object' || workerData.version !== PROTOCOL_VERSION || typeof workerData.id !== 'string' || workerData.id === '') throw new Error('WorkerData version/id 无效')
  if (!(workerData.cancelBuffer instanceof SharedArrayBuffer)) throw new Error('WorkerData cancelBuffer 无效')
  const raw = workerData.pathContext
  if (raw === null || typeof raw !== 'object') throw new Error('WorkerData pathContext 无效')
  cancelView = new Int32Array(workerData.cancelBuffer)
  pathContext = createPathContext({
    workspaceRoot: typeof raw.workspaceRoot === 'string' ? raw.workspaceRoot : null,
    hostDataRoot: typeof raw.hostDataRoot === 'string' ? raw.hostDataRoot : null,
    hostCapabilities: capabilitySnapshot(raw.hostCapabilities),
  })
}

try {
  validateAndRebuild()
  post('ready', { threadId })
} catch (error) {
  finish({ status: 'failed', reason: 'worker-init-failed', error: errorDetails(error, 'worker-init-failed') })
}

if (port !== null && !finished) {
  port.on('message', (message) => {
    if (finished) return
    if (message === null || typeof message !== 'object' || message.version !== PROTOCOL_VERSION || message.id !== id || (message.type !== 'run' && message.type !== 'cancel')) {
      finish({ status: 'failed', reason: 'worker-protocol', error: { code: 'worker-protocol', message: 'Worker 控制消息无效' } })
      return
    }
    if (message.type === 'cancel') {
      Atomics.store(cancelView, 0, 1)
      if (!runStarted) finish({ status: 'cancelled', reason: 'cancel-requested' })
      return
    }
    if (runStarted) return
    runStarted = true
    if (cancellationRequested()) {
      finish({ status: 'cancelled', reason: 'cancel-requested' })
      return
    }
    post('running', { threadId })
    try {
      finish(startupArchive(pathContext, { shouldCancel: cancellationRequested }))
    } catch (error) {
      finish({ status: 'failed', reason: 'worker-run-failed', error: errorDetails(error, 'worker-run-failed') })
    }
  })
}
