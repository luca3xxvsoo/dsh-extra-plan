// per-apply usage 账本：cursor 表、增量 fold 与一次性告警。
import { mkdirSync, readFileSync, appendFileSync, writeFileSync, openSync, closeSync, writeSync, renameSync, unlinkSync } from 'node:fs'
import { randomUUID } from 'node:crypto'
import { dirname, isAbsolute, join } from 'node:path'
import { resolveWorkspacePath, resolveHostPath, prepareWriteTarget, validateReadTarget } from './path-policy.js'

export const WRITER_LOCK_WAIT_MS = 1000
const LOCK_POLL_MS = 25
const LOCK_WAIT_BUFFER = new Int32Array(new SharedArrayBuffer(4))

function lockPathOf(activePath) {
  return typeof activePath === 'string' && activePath !== '' ? activePath + '.lock' : ''
}

function staleLockPathOf(lockPath) {
  return lockPath + '.stale-' + process.pid + '-' + randomUUID()
}

function errorCodeOf(error) {
  return error !== null && typeof error === 'object' && typeof error.code === 'string' ? error.code : ''
}

function errorMessageOf(error) {
  return error instanceof Error ? error.message : String(error)
}

function pathContextOf(source) {
  if (source !== null && typeof source === 'object') {
    if (source.pathContext !== undefined && source.pathContext !== null) return source.pathContext
    if (typeof source.getPathContext === 'function') {
      const supplied = source.getPathContext()
      if (supplied !== undefined && supplied !== null) return supplied
    }
  }
  return null
}

function resolveLedgerTarget(context, value, purpose) {
  let hostError
  try { return resolveHostPath(context, value, { purpose }) } catch (error) { hostError = error }
  let workspaceError
  try { return resolveWorkspacePath(context, value, { purpose }) } catch (error) { workspaceError = error }
  throw workspaceError || hostError || new Error('账本路径不在授权H/W根内')
}

function resolveAbsoluteLedgerPath(context, value) {
  return resolveLedgerTarget(context, value, 'usage-ledger').path
}

function resolveLedgerPath(raw, context) {
  if (context === null) throw new Error('账本缺少明确H/W根')
  if (raw === '') return resolveHostPath(context, join('usage-ledger', 'ledger-v2.jsonl'), { purpose: 'usage-ledger' }).path
  if (isAbsolute(raw)) return resolveAbsoluteLedgerPath(context, raw)
  return resolveHostPath(context, raw, { purpose: 'usage-ledger' }).path
}

function ledgerTargetOf(context, path, purpose) {
  if (isAbsolute(path)) return resolveLedgerTarget(context, path, purpose)
  return resolveHostPath(context, path, { purpose })
}

function authorizeLedgerWrite(context, path, purpose) {
  if (context === null) return null
  return prepareWriteTarget(context, ledgerTargetOf(context, path, purpose), { expectedType: 'file', purpose })
}

function ensureLedgerDirectory(context, path, purpose) {
  if (context === null) return
  const target = ledgerTargetOf(context, path, purpose)
  prepareWriteTarget(context, target, { expectedType: 'any', purpose })
  mkdirSync(target.path, { recursive: true })
  validateReadTarget(context, target, { expectedType: 'directory', purpose })
}

function validLockOwner(owner) {
  return owner !== null && typeof owner === 'object' && !Array.isArray(owner)
    && Number.isInteger(owner.pid) && owner.pid > 0
    && typeof owner.token === 'string' && owner.token !== ''
    && owner.createdAt !== undefined
}

function readLockOwner(lockPath) {
  try {
    const owner = JSON.parse(readFileSync(lockPath, 'utf8'))
    return validLockOwner(owner) ? owner : undefined
  } catch (error) {
    return undefined
  }
}

function pidIsAlive(pid) {
  if (!Number.isInteger(pid) || pid <= 0) return undefined
  if (pid === process.pid) return true
  try {
    process.kill(pid, 0)
    return true
  } catch (error) {
    const code = errorCodeOf(error)
    if (code === 'ESRCH' || code === 'EINVAL' || code === 'ENOENT') return false
    return true
  }
}

function tryCreateLock(lockPath) {
  const owner = { pid: process.pid, token: randomUUID(), createdAt: Date.now() }
  let fd
  let created = false
  let closeAttempted = false
  let cleanupAttempted = false
  let cleanupResult
  let failureDecorated = false
  const cleanupCreatedLock = () => {
    if (cleanupAttempted) return cleanupResult
    cleanupAttempted = true
    try {
      unlinkSync(lockPath)
      cleanupResult = { ok: true, path: lockPath }
    } catch (error) {
      cleanupResult = { ok: false, path: lockPath, error }
    }
    return cleanupResult
  }
  const decorateFailure = (error, closeError, includeCleanup) => {
    const details = []
    if (closeError !== undefined) details.push('closeSync failed: ' + errorMessageOf(closeError))
    if (includeCleanup || (cleanupResult !== undefined && cleanupResult.ok !== true)) {
      if (cleanupResult === undefined) {
        details.push('cleanup not attempted: ' + lockPath)
      } else if (cleanupResult.ok) {
        details.push('cleanup succeeded: ' + cleanupResult.path)
      } else {
        details.push('cleanup failed: ' + errorMessageOf(cleanupResult.error) + '; residual lock path: ' + cleanupResult.path)
      }
    }
    if (details.length > 0 && error !== null && (typeof error === 'object' || typeof error === 'function')) {
      error.message = errorMessageOf(error) + '; ' + details.join('; ')
    }
    return error
  }
  try {
    fd = openSync(lockPath, 'wx')
    created = true
    writeSync(fd, JSON.stringify(owner), 0, 'utf8')
    try {
      closeSync(fd)
      fd = undefined
      closeAttempted = true
    } catch (closeError) {
      closeAttempted = true
      fd = undefined
      cleanupCreatedLock()
      const failure = new Error('usage lock creation failed after successful write')
      failure.cause = closeError
      decorateFailure(failure, closeError, true)
      failureDecorated = true
      throw failure
    }
    return { acquired: true, lockPath, token: owner.token, owner }
  } catch (error) {
    let closeError
    if (fd !== undefined && !closeAttempted) {
      closeAttempted = true
      try {
        closeSync(fd)
      } catch (errorOnClose) {
        closeError = errorOnClose
      }
      fd = undefined
    }
    if (created) cleanupCreatedLock()
    if (!created && errorCodeOf(error) === 'EEXIST') return undefined
    if (!failureDecorated) decorateFailure(error, closeError, closeError !== undefined)
    throw error
  }
}

function sleepSync(ms) {
  if (ms > 0) Atomics.wait(LOCK_WAIT_BUFFER, 0, 0, ms)
}

export function usageLedgerLockPath(activePath) {
  return lockPathOf(activePath)
}

export function acquireUsageLedgerLock(activePath, options = WRITER_LOCK_WAIT_MS) {
  const lockPath = lockPathOf(activePath)
  if (lockPath === '') return { acquired: false, reason: 'invalid-path', lockPath, owner: undefined }
  const pathOptions = options !== null && typeof options === 'object' ? options : {}
  const pathContext = pathOptions.pathContext !== undefined && pathOptions.pathContext !== null ? pathOptions.pathContext : null
  const purpose = typeof pathOptions.purpose === 'string' && pathOptions.purpose !== '' ? pathOptions.purpose : 'usage-ledger'
  if (pathContext === null) return { acquired: false, reason: 'path-context-required', lockPath, owner: undefined }
  authorizeLedgerWrite(pathContext, activePath, purpose)
  authorizeLedgerWrite(pathContext, lockPath, purpose)
  const requestedWait = typeof options === 'number' && Number.isFinite(options)
    ? options
    : options !== null && typeof options === 'object' && Number.isFinite(options.waitMs)
      ? options.waitMs
      : options !== null && typeof options === 'object' && Number.isFinite(options.timeoutMs)
        ? options.timeoutMs
        : WRITER_LOCK_WAIT_MS
  const waitMs = Math.max(0, requestedWait)
  const deadline = Date.now() + waitMs
  let owner
  while (true) {
    const acquired = tryCreateLock(lockPath)
    if (acquired !== undefined) return { ...acquired, pathContext, purpose }
    owner = readLockOwner(lockPath)
    if (owner !== undefined && pidIsAlive(owner.pid) === false) {
      return { acquired: false, reason: 'stale-lock', lockPath, owner }
    }
    const remaining = deadline - Date.now()
    if (remaining <= 0) return { acquired: false, reason: 'timeout', lockPath, owner }
    sleepSync(Math.min(LOCK_POLL_MS, remaining))
  }
}

export function releaseUsageLedgerLock(handle) {
  if (handle === null || typeof handle !== 'object' || handle.acquired !== true
    || typeof handle.lockPath !== 'string' || handle.lockPath === ''
    || typeof handle.token !== 'string' || handle.token === '') {
    return { released: false, reason: 'not-owner' }
  }
  const pathContext = handle.pathContext !== undefined && handle.pathContext !== null ? handle.pathContext : null
  const purpose = typeof handle.purpose === 'string' && handle.purpose !== '' ? handle.purpose : 'usage-ledger'
  if (pathContext === null) return { released: false, reason: 'path-context-required' }
  authorizeLedgerWrite(pathContext, handle.lockPath, purpose)
  const current = readLockOwner(handle.lockPath)
  if (current === undefined) return { released: false, reason: 'missing-or-invalid' }
  if (current.token !== handle.token) return { released: false, reason: 'token-mismatch', owner: current }
  const stalePath = staleLockPathOf(handle.lockPath)
  authorizeLedgerWrite(pathContext, stalePath, purpose)
  try {
    renameSync(handle.lockPath, stalePath)
  } catch (error) {
    return { released: false, reason: errorCodeOf(error) === 'ENOENT' ? 'missing' : 'rename-failed' }
  }
  const moved = readLockOwner(stalePath)
  if (moved === undefined || moved.token !== handle.token) {
    try { renameSync(stalePath, handle.lockPath) } catch (restoreError) { /* do not delete another owner's lock */ }
    return { released: false, reason: 'token-mismatch', owner: moved }
  }
  try {
    unlinkSync(stalePath)
  } catch (error) {
    if (errorCodeOf(error) !== 'ENOENT') return { released: false, reason: 'delete-failed' }
  }
  return { released: true }
}

export function createUsageLedger(options = {}) {
  // usage 账本（写入带 (sessionId,seq) 去重，跨插件实例安全）
  const source = options !== null && typeof options === 'object' ? options : {}
  const ledgerOn = source.enabled === true
  const pathContext = pathContextOf(source)
  const rawLedgerPath = typeof source.path === 'string' ? source.path.trim() : ''
  let ledgerPath = ''
  let ledgerPathError = ''
  try {
    ledgerPath = resolveLedgerPath(rawLedgerPath, pathContext)
  } catch (error) {
    ledgerPathError = errorMessageOf(error)
  }
  const ledgerCursorPath = ledgerPath === '' ? '' : ledgerPath + '.cursor.json'
  const ledgerPurpose = 'usage-ledger'
  let ledgerWarned = false
  // cursor 降级告警口径：每插件实例（= 每个会话各一份）首次进入空表降级时告警一次
  // （与 ledgerWarned 同一次式风格）；同一实例内多次降级读不重复告警。
  let cursorDegradedWarned = false
  // 0 字节/纯空白 cursor 文件的一次性自愈提示标志（与 cursorDegradedWarned 同口径：每插件实例一次）。
  let cursorEmptyWarned = false
  let staleLockWarned = false
  let releaseFailureWarned = false
  // usageCursors 只保存活跃 session：sessionId → { seq, index }（index = 上次折叠时读到的
  // session.seq 水位＝会话日志长度）。disposed final fold 后删除本 session 项；同 session 再次
  // 激活且内存无项时按 sessionId 从 cursor JSON 单项续载（水位可续做增量：只读 [index, seq)
  // 区间；水位不可读/日志截断/首次折叠才回退全量扫描，靠 seq 跳过旧消息）。
  const usageCursors = new Map()
  const injectedLockApi = source.lockApi !== undefined ? source.lockApi : source.lockOps
  const lockAcquire = injectedLockApi !== null && typeof injectedLockApi === 'object' && typeof injectedLockApi.acquire === 'function'
    ? injectedLockApi.acquire
    : typeof source.acquireLock === 'function' ? source.acquireLock : acquireUsageLedgerLock
  const lockRelease = injectedLockApi !== null && typeof injectedLockApi === 'object' && typeof injectedLockApi.release === 'function'
    ? injectedLockApi.release
    : typeof source.releaseLock === 'function' ? source.releaseLock : releaseUsageLedgerLock
  // cursor JSON 读取（续载与写回前的现状盘点共用）：返回 { ok, table }。
  // - ENOENT（首次运行尚无 cursor 文件）→ ok:true + 空表，静默不告警（本就没有可保留内容）；
  // - 其它读取错误 / JSON 解析失败 / 根值非对象（null、数组、标量）→ 本实例首次降级告警一次，
  //   ok:false + 空表降级：写回只能覆盖写「空表 + 当前 session」，其它 session 的去重基准会
  //   丢失、其后续恢复可能重复追加 ledger 行（机制说明与风险已写入 ai-机制设计.md）。
  function readUsageCursorTable() {
    let raw
    try {
      if (pathContext !== null) authorizeLedgerWrite(pathContext, ledgerCursorPath, ledgerPurpose)
      raw = readFileSync(ledgerCursorPath, 'utf8')
    } catch (error) {
      if (error !== null && typeof error === 'object' && error.code === 'ENOENT') return { ok: true, table: {} }
      warnUsageCursorDegraded(error)
      return { ok: false, table: {} }
    }
    // 0 字节/纯空白文件：不可能存在任何 session 基准，按 ENOENT 同口径空表自愈
    // （一次性提示保留线索；本次 fold rows>0 时即重建 cursor JSON，解除 0B 永不写回死锁）。
    if (raw.trim() === '') {
      if (!cursorEmptyWarned) {
        cursorEmptyWarned = true
        console.warn('extra-plan: usage cursor JSON file is empty — treating as an empty cursor table; other sessions dedupe baselines are already lost and the cursor file will be rebuilt on the next write')
      }
      return { ok: true, table: {} }
    }
    let saved
    try {
      saved = JSON.parse(raw)
    } catch (error) {
      warnUsageCursorDegraded(error)
      return { ok: false, table: {} }
    }
    if (saved === null || typeof saved !== 'object' || Array.isArray(saved)) {
      warnUsageCursorDegraded(new Error('cursor root is not a plain object: ' + (Array.isArray(saved) ? 'array' : typeof saved)))
      return { ok: false, table: {} }
    }
    return { ok: true, table: saved }
  }

  // 降级告警：每插件实例首次降级时一次（同 ledgerWarned 口径），避免多次降级读重复刷屏。
  function warnUsageCursorDegraded(error) {
    if (cursorDegradedWarned) return
    cursorDegradedWarned = true
    console.warn('extra-plan: usage cursor JSON unreadable or corrupt — falling back to an empty cursor table; other sessions dedupe baselines may be lost on the next write: ' + (error instanceof Error ? error.message : String(error)))
  }

  function warnStaleLock(lock) {
    if (staleLockWarned) return
    staleLockWarned = true
    const lockPath = lock !== null && typeof lock === 'object' && typeof lock.lockPath === 'string' ? lock.lockPath : ledgerPath + '.lock'
    const owner = lock !== null && typeof lock === 'object' && lock.owner !== null && typeof lock.owner === 'object' ? lock.owner : {}
    const pid = owner.pid === undefined ? 'unknown' : String(owner.pid)
    const token = owner.token === undefined ? 'unknown' : String(owner.token)
    console.warn('extra-plan: usage ledger stale-lock blocked; lockPath=' + lockPath + '; owner pid=' + pid + ' token=' + token + '；不会自动接管或删除，请核实owner后显式维护')
  }

  // cursor 单项归一：只接受 V2 的 { seq, index } 形状；其它形状均视为无效。
  // 增量改由 session.seq 水位 + snapshotEvents(from, to) 区间读取实现。
  function usageCursorEntryOf(table, sessionId) {
    const value = table[sessionId]
    if (value !== null && typeof value === 'object' && !Array.isArray(value)
      && Number.isInteger(value.seq) && value.seq >= 0
      && Number.isInteger(value.index) && value.index >= 0) {
      return { seq: value.seq, index: value.index }
    }
    return undefined
  }

  function isUsageContext(value) {
    return value !== null && typeof value === 'object' && !Array.isArray(value)
      && typeof value.sessionId === 'string' && value.sessionId.trim() !== ''
      && typeof value.parentSessionId === 'string'
      && typeof value.rootSessionId === 'string'
      && typeof value.agentPreset === 'string'
      && Number.isInteger(value.delegationDepth) && value.delegationDepth >= 0
      && typeof value.role === 'string' && value.role.trim() !== ''
  }

  // usage 折叠：同步函数（禁止改成 async——agent/disposed 是 emit/void，宿主不等待 Promise，
  // 异步文件 I/O 会重新打开末轮漏记窗口）。只扫描 assistant/message，写入 V2 上下文与四桶。
  // 只有新增行才追加并持久化 cursor、cursor JSON 整文件改写。
  // 增量口径（P1-4）：以宿主 session.seq（＝会话日志长度，O(1)、不物化数组）为水位，配合
  // session.snapshotEvents(from, to) 区间读取只物化新增区间；水位不可读 / prevIndex > 水位
  // （日志截断）/ 首次折叠（无 prev）才回退全量快照。绝不在同一趟里同时跑全量与增量再对拍。
  function foldUsage(agent, usageContext) {
    if (!ledgerOn) return { status: 'disabled' }
    if (ledgerPath === '') return { status: 'unavailable', reason: ledgerPathError || 'ledger path unavailable' }
    const session = agent !== undefined && agent !== null ? agent.session : undefined
    if (session === undefined || session === null) return { status: 'ignored' }
    try {
      if (!isUsageContext(usageContext)) throw new Error('usage context is invalid')
      if (typeof session.snapshotEvents !== 'function') return { status: 'ignored' }
      const context = usageContext
      const sid = context.sessionId
      authorizeLedgerWrite(pathContext, ledgerPath, ledgerPurpose)
      const dir = dirname(ledgerPath)
      ensureLedgerDirectory(pathContext, dir, ledgerPurpose)
      const lockOptions = { waitMs: WRITER_LOCK_WAIT_MS, pathContext, purpose: ledgerPurpose }
      const lock = lockAcquire(ledgerPath, lockOptions)
      if (lock.acquired !== true) {
        if (lock.reason === 'stale-lock') warnStaleLock(lock)
        return { status: 'delayed', reason: lock.reason, lockPath: lock.lockPath, owner: lock.owner }
      }
      let operationResult
      let operationError
      let releaseResult
      let releaseError
      try {
        // ① 共享锁覆盖 cursor 读取、事件折叠、ledger append 与 cursor 写回。
        const logLen = session.seq
        const hasWatermark = typeof logLen === 'number' && Number.isFinite(logLen) && logLen >= 0
        let prev = usageCursors.get(sid)
        if (prev === undefined) prev = usageCursorEntryOf(readUsageCursorTable().table, sid)
        let cursor = 0
        let prevIndex = -1
        if (prev !== undefined && prev !== null) {
          cursor = prev.seq
          prevIndex = prev.index
        }
        let start = 0
        let events
        if (hasWatermark && prevIndex === logLen) {
          operationResult = { status: 'unchanged', rows: 0 }
        } else {
          if (hasWatermark && prevIndex >= 0 && prevIndex <= logLen) {
            start = prevIndex
            events = session.snapshotEvents(prevIndex, logLen)
          } else {
            events = session.snapshotEvents()
          }
          if (!Array.isArray(events)) {
            operationResult = { status: 'ignored' }
          } else {
            const rows = []
            for (let idx = 0; idx < events.length; idx += 1) {
              const event = events[idx]
              if (event === null || typeof event !== 'object' || event.type !== 'assistant/message') continue
              const seq = typeof event.seq === 'number' ? event.seq : start + idx
              if (seq <= cursor) continue
              cursor = seq
              const data = event.data
              if (data === null || typeof data !== 'object') continue
              const usage = data.usage
              if (usage === null || typeof usage !== 'object') continue
              const inputTokens = typeof usage.inputTokens === 'number' ? usage.inputTokens : 0
              const cacheReadTokens = typeof usage.cacheReadTokens === 'number' ? usage.cacheReadTokens : 0
              const cacheWriteTokens = typeof usage.cacheWriteTokens === 'number' ? usage.cacheWriteTokens : 0
              const outputTokens = typeof usage.outputTokens === 'number' ? usage.outputTokens : 0
              if (inputTokens === 0 && cacheReadTokens === 0 && cacheWriteTokens === 0 && outputTokens === 0) continue
              const msg = data.message
              const model = msg !== null && typeof msg === 'object' && msg.source !== null && typeof msg.source === 'object' && typeof msg.source.model === 'string' ? msg.source.model : ''
              const provider = msg !== null && typeof msg === 'object' && msg.source !== null && typeof msg.source === 'object' && typeof msg.source.provider === 'string' ? msg.source.provider : ''
              rows.push(JSON.stringify({
                schemaVersion: 2,
                ts: new Date().toISOString(),
                sessionId: sid,
                parentSessionId: context.parentSessionId,
                rootSessionId: context.rootSessionId,
                agentPreset: context.agentPreset,
                delegationDepth: context.delegationDepth,
                role: context.role,
                model,
                provider,
                inputTokens,
                cacheReadTokens,
                cacheWriteTokens,
                outputTokens,
                seq,
              }))
            }
            const nextIndex = hasWatermark ? logLen : events.length
            const nextCursor = { seq: cursor, index: nextIndex }
            if (rows.length === 0) {
              usageCursors.set(sid, nextCursor)
              operationResult = { status: 'advanced', rows: 0, cursor: nextCursor }
            } else {
              if (pathContext !== null) authorizeLedgerWrite(pathContext, ledgerPath, ledgerPurpose)
              appendFileSync(ledgerPath, rows.join('\n') + '\n', 'utf8')
              usageCursors.set(sid, nextCursor)
              const current = readUsageCursorTable()
              if (!current.ok) {
                operationResult = { status: 'written', rows: rows.length, cursorPersisted: false }
              } else {
                const persisted = {}
                for (const key of Object.keys(current.table)) {
                  if (key === sid) continue
                  const entry = usageCursorEntryOf(current.table, key)
                  if (entry === undefined) continue
                  persisted[key] = { seq: entry.seq, index: entry.index }
                }
                persisted[sid] = nextCursor
                let cursorPersisted = true
                try {
                  if (pathContext !== null) authorizeLedgerWrite(pathContext, ledgerCursorPath, ledgerPurpose)
                  writeFileSync(ledgerCursorPath, JSON.stringify(persisted), 'utf8')
                } catch (error) {
                  cursorPersisted = false
                }
                operationResult = { status: 'written', rows: rows.length, cursor: nextCursor, cursorPersisted }
              }
            }
          }
        }
      } catch (error) {
        operationError = error
      } finally {
        try {
          releaseResult = lockRelease(lock)
          if (releaseResult === null || typeof releaseResult !== 'object' || releaseResult.released !== true) {
            const reason = releaseResult !== null && releaseResult !== undefined ? String(releaseResult.reason || 'unknown') : 'unknown'
            releaseError = new Error('usage ledger lock release failed: ' + reason)
          }
        } catch (error) {
          releaseError = error
        }
      }
      if (releaseError !== undefined) {
        const detail = releaseError instanceof Error ? releaseError.message : String(releaseError)
        if (!releaseFailureWarned) {
          releaseFailureWarned = true
          console.warn('extra-plan: usage ledger release failed: ' + detail)
        }
        const failed = {
          status: 'failed',
          reason: 'release-failed',
          releaseFailed: true,
          operationStatus: operationResult === undefined ? undefined : operationResult.status,
          operationResult,
          releaseResult,
          releaseError: detail,
        }
        if (operationError !== undefined) failed.operationError = operationError instanceof Error ? operationError.message : String(operationError)
        return failed
      }
      if (operationError !== undefined) throw operationError
      return operationResult
    } catch (error) {
      if (!ledgerWarned) {
        ledgerWarned = true
        console.warn('extra-plan: usage ledger fold failed: ' + (error instanceof Error ? error.message : String(error)))
      }
      return { status: 'failed' }
    }
  }

  return { foldUsage, disposeSession: (sessionId) => usageCursors.delete(sessionId) }
}
