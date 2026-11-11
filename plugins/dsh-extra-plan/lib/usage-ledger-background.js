import { randomUUID } from 'node:crypto'
import { resolve as resolvePath } from 'node:path'
import { Worker } from 'node:worker_threads'

const PROTOCOL_VERSION = 1
const WORKER_URL = new URL('./usage-ledger-worker.js', import.meta.url)
const ownerHandles = new WeakMap()
const rootTails = new Map()
const fallbackOwner = {}

function isObject(value) {
  return value !== null && (typeof value === 'object' || typeof value === 'function')
}

function stringOrEmpty(value) {
  return typeof value === 'string' ? value : ''
}

function errorDetails(error, fallbackCode = 'worker-failed') {
  const code = error !== null && typeof error === 'object' && typeof error.code === 'string' ? error.code : fallbackCode
  const message = error instanceof Error ? error.message : String(error === undefined || error === null ? fallbackCode : error)
  return { code, message }
}

function normalizedRootOf(pathContext) {
  const value = pathContext !== null && typeof pathContext === 'object' ? pathContext.hostDataRoot : null
  if (typeof value !== 'string' || value.trim() === '') return ''
  const normalized = resolvePath(value)
  return process.platform === 'win32' ? normalized.toLowerCase() : normalized
}

function capabilitySnapshot(value) {
  if (value === null || typeof value !== 'object') return {}
  const result = {}
  for (const [key, descriptor] of Object.entries(value)) {
    if (descriptor === null || typeof descriptor !== 'object') continue
    if (typeof key !== 'string' || typeof descriptor.name !== 'string' || descriptor.name !== key) continue
    if (typeof descriptor.path !== 'string' || typeof descriptor.type !== 'string' || typeof descriptor.access !== 'string') continue
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

function pathContextSnapshot(pathContext) {
  const source = pathContext !== null && typeof pathContext === 'object' ? pathContext : {}
  return {
    workspaceRoot: typeof source.workspaceRoot === 'string' ? source.workspaceRoot : null,
    hostDataRoot: typeof source.hostDataRoot === 'string' ? source.hostDataRoot : null,
    hostCapabilities: capabilitySnapshot(source.hostCapabilities),
  }
}

function normalizedResult(value, fallback = {}) {
  const source = value !== null && typeof value === 'object' ? value : {}
  const status = typeof source.status === 'string' ? source.status : 'failed'
  if (status === 'archived' || status === 'up-to-date' || status === 'cancelled' || status === 'skipped') {
    const result = { ...source, status }
    delete result.error
    return result
  }
  const details = source.error !== undefined ? errorDetails(source.error, typeof source.reason === 'string' ? source.reason : 'worker-failed') : errorDetails(fallback.error, typeof fallback.reason === 'string' ? fallback.reason : 'worker-failed')
  return { status: 'failed', reason: typeof source.reason === 'string' && source.reason !== '' ? source.reason : details.code, error: details }
}

function protocolFailure(reason, message) {
  return { status: 'failed', reason, error: { code: reason, message } }
}

function createWorkerHandle(id, pathContext, workerFactory, cancelView) {
  let worker = null
  let terminal = null
  let failure = null
  let readySeen = false
  let runningSeen = false
  let reportedThreadId
  let runSent = false
  let resultSeen = false
  let exitCode = null
  let resolveDone
  const done = new Promise((resolve) => { resolveDone = resolve })
  const send = (message) => {
    if (worker === null || terminal !== null) return
    try { worker.postMessage(message) } catch (error) { failure = failure || errorDetails(error, 'worker-post-failed') }
  }
  const markProtocolFailure = (reason, message) => {
    failure = failure || protocolFailure(reason, message).error
    Atomics.store(cancelView, 0, 1)
    send({ type: 'cancel', version: PROTOCOL_VERSION, id })
  }
  const settleAfterExit = () => {
    if (exitCode === null) return
    if (failure !== null) {
      resolveDone({ id, version: PROTOCOL_VERSION, status: 'failed', reason: failure.code || 'worker-failed', error: failure, threadId: reportedThreadId })
      return
    }
    if (exitCode !== 0) {
      resolveDone({ id, version: PROTOCOL_VERSION, status: 'failed', reason: 'worker-exit', error: { code: 'worker-exit', message: 'Worker exit code ' + exitCode }, threadId: reportedThreadId })
      return
    }
    if (terminal !== null) {
      resolveDone({ ...terminal, id, version: PROTOCOL_VERSION, threadId: reportedThreadId })
      return
    }
    resolveDone({ ...protocolFailure(exitCode === 0 ? 'worker-exit-no-result' : 'worker-exit', 'Worker 未返回终态即退出'), id, version: PROTOCOL_VERSION })
  }
  try {
    const workerOptions = {
      execArgv: [],
      workerData: {
        version: PROTOCOL_VERSION,
        id,
        pathContext: pathContextSnapshot(pathContext),
        cancelBuffer: cancelView.buffer,
      },
    }
    worker = workerFactory === undefined ? new Worker(WORKER_URL, workerOptions) : workerFactory(WORKER_URL, workerOptions)
    if (!worker || typeof worker.on !== 'function' || typeof worker.postMessage !== 'function') throw new Error('workerFactory 必须返回 Worker-like 对象')
    worker.on('message', (message) => {
      if (message === null || typeof message !== 'object' || message.version !== PROTOCOL_VERSION || message.id !== id || typeof message.type !== 'string') {
        markProtocolFailure('worker-protocol', 'Worker 消息缺少匹配的 version/id/type')
        return
      }
      if (message.type === 'ready') {
        if (readySeen || runSent || !Number.isInteger(message.threadId) || message.threadId <= 0) {
          markProtocolFailure('worker-protocol', 'Worker ready 消息无效或重复')
          return
        }
        readySeen = true
        reportedThreadId = message.threadId
        if (Atomics.load(cancelView, 0) !== 0) send({ type: 'cancel', version: PROTOCOL_VERSION, id })
        else {
          runSent = true
          send({ type: 'run', version: PROTOCOL_VERSION, id })
        }
        return
      }
      if (message.type === 'running') {
        if (!readySeen || !runSent || runningSeen || !Number.isInteger(message.threadId) || message.threadId <= 0) {
          markProtocolFailure('worker-protocol', 'Worker running 消息无效')
          return
        }
        runningSeen = true
        reportedThreadId = message.threadId
        return
      }
      if (message.type === 'result') {
        if (resultSeen || !readySeen || (message.result && message.result.status !== 'cancelled' && !runningSeen)) {
          markProtocolFailure('worker-protocol', 'Worker result 消息无效或重复')
          return
        }
        resultSeen = true
        terminal = normalizedResult(message.result)
        return
      }
      markProtocolFailure('worker-protocol', 'Worker 未知消息类型: ' + message.type)
    })
    worker.on('error', (error) => {
      failure = failure || errorDetails(error, 'worker-error')
      Atomics.store(cancelView, 0, 1)
    })
    worker.on('messageerror', (error) => {
      failure = failure || errorDetails(error, 'worker-messageerror')
      Atomics.store(cancelView, 0, 1)
    })
    worker.on('exit', (code) => {
      exitCode = code
      settleAfterExit()
    })
  } catch (error) {
    failure = errorDetails(error, 'worker-create-failed')
    exitCode = 0
    settleAfterExit()
  }
  return { done, cancel: () => { Atomics.store(cancelView, 0, 1); send({ type: 'cancel', version: PROTOCOL_VERSION, id }) } }
}

export function startUsageLedgerBackground(owner, pathContext, options = {}) {
  const ownerKey = isObject(owner) ? owner : fallbackOwner
  const active = ownerHandles.get(ownerKey)
  if (active !== undefined) return active
  const id = randomUUID()
  const cancelBuffer = new SharedArrayBuffer(4)
  const cancelView = new Int32Array(cancelBuffer)
  let cancelRequested = false
  let launched = null
  const rootKey = normalizedRootOf(pathContext)
  const previous = rootTails.get(rootKey) || Promise.resolve()
  const workerFactory = options !== null && typeof options === 'object' && typeof options.workerFactory === 'function' ? options.workerFactory : undefined
  const done = previous.then(() => {
    if (cancelRequested) return { status: 'cancelled', reason: 'cancel-requested', id, version: PROTOCOL_VERSION }
    launched = createWorkerHandle(id, pathContext, workerFactory, cancelView)
    return launched.done
  }).catch((error) => ({ status: 'failed', reason: 'background-schedule-failed', error: errorDetails(error, 'background-schedule-failed'), id, version: PROTOCOL_VERSION }))
  const handle = {
    id,
    version: PROTOCOL_VERSION,
    done,
    cancel: () => {
      if (cancelRequested) return
      cancelRequested = true
      Atomics.store(cancelView, 0, 1)
      if (launched !== null) launched.cancel()
    },
  }
  ownerHandles.set(ownerKey, handle)
  rootTails.set(rootKey, done)
  done.then(() => {
    if (ownerHandles.get(ownerKey) === handle) ownerHandles.delete(ownerKey)
    if (rootTails.get(rootKey) === done) rootTails.delete(rootKey)
  })
  return handle
}
