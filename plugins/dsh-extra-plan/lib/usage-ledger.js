// per-apply usage 账本：cursor 表、增量 fold 与一次性告警。
import { mkdirSync, readFileSync, appendFileSync, writeFileSync } from 'node:fs'

export function createUsageLedger(options = {}) {
  // usage 账本（写入带 (sessionId,seq) 去重，跨插件实例安全）
  const source = options !== null && typeof options === 'object' ? options : {}
  const ledgerOn = source.enabled === true
  const ledgerPath = typeof source.path === 'string' ? source.path : ''
  const ledgerCursorPath = ledgerPath === '' ? '' : ledgerPath + '.cursor.json'
  let ledgerWarned = false
  // cursor 降级告警口径：每插件实例（= 每个会话各一份）首次进入空表降级时告警一次
  // （与 ledgerWarned 同一次式风格）；同一实例内多次降级读不重复告警。
  let cursorDegradedWarned = false
  // usageCursors 只保存活跃 session：sessionId → { seq, index }（index = 上次折叠时读到的
  // session.seq 水位＝会话日志长度）。disposed final fold 后删除本 session 项；同 session 再次
  // 激活且内存无项时按 sessionId 从 cursor JSON 单项续载（水位可续做增量：只读 [index, seq)
  // 区间；水位不可读/日志截断/首次折叠才回退全量扫描，靠 seq 跳过旧消息）。
  const usageCursors = new Map()
  // cursor JSON 读取（续载与写回前的现状盘点共用）：返回 { ok, table }。
  // - ENOENT（首次运行尚无 cursor 文件）→ ok:true + 空表，静默不告警（本就没有可保留内容）；
  // - 其它读取错误 / JSON 解析失败 / 根值非对象（null、数组、标量）→ 本实例首次降级告警一次，
  //   ok:false + 空表降级：写回只能覆盖写「空表 + 当前 session」，其它 session 的去重基准会
  //   丢失、其后续恢复可能重复追加 ledger 行（机制说明与风险已写入 ai-机制设计.md）。
  function readUsageCursorTable() {
    let raw
    try {
      raw = readFileSync(ledgerCursorPath, 'utf8')
    } catch (error) {
      if (error !== null && typeof error === 'object' && error.code === 'ENOENT') return { ok: true, table: {} }
      warnUsageCursorDegraded(error)
      return { ok: false, table: {} }
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

  // cursor 单项归一：兼容旧数字形状（sessionId: seq，按水位 0 处理）与现有 { seq, index } 形状。
  // 不再保留内存 ref 字段——增量改由 session.seq 水位 + snapshotEvents(from, to) 区间读取实现。
  function usageCursorEntryOf(table, sessionId) {
    const value = table[sessionId]
    if (typeof value === 'number') return { seq: value, index: 0 }
    if (value !== null && typeof value === 'object' && typeof value.seq === 'number') {
      return { seq: value.seq, index: typeof value.index === 'number' ? value.index : 0 }
    }
    return undefined
  }

  // usage 折叠：同步函数（禁止改成 async——agent/disposed 是 emit/void，宿主不等待 Promise，
  // 异步文件 I/O 会重新打开末轮漏记窗口）。既有语义保持：事件扫描、token/model/role 与 JSONL
  // 字段、只有新增行才追加并持久化 cursor、cursor JSON 整文件改写。
  // 增量口径（P1-4）：以宿主 session.seq（＝会话日志长度，O(1)、不物化数组）为水位，配合
  // session.snapshotEvents(from, to) 区间读取只物化新增区间；水位不可读 / prevIndex > 水位
  // （日志截断）/ 首次折叠（无 prev）才回退全量快照。绝不在同一趟里同时跑全量与增量再对拍。
  function foldUsage(agent, role) {
    if (!ledgerOn || ledgerPath === '') return
    const session = agent.session
    if (session === undefined || session === null) return
    if (typeof session.snapshotEvents !== 'function') return
    try {
      const sid = session.header.id
      // ① 水位读取（O(1)，不物化数组）：宿主 session.seq ≡ 日志长度（seq === 索引的宿主契约）。
      const logLen = session.seq
      const hasWatermark = typeof logLen === 'number' && Number.isFinite(logLen) && logLen >= 0
      // 内存无项（首次 fold / disposed 回收后同 session 再次激活）→ 只按 sessionId 从 cursor JSON
      // 续载本项；不再把 JSON 里其它历史 session 一次性灌进内存 Map。
      let prev = usageCursors.get(sid)
      if (prev === undefined) prev = usageCursorEntryOf(readUsageCursorTable().table, sid)
      let cursor = 0
      let prevIndex = -1
      if (prev !== undefined && prev !== null) {
        cursor = typeof prev === 'number' ? prev : (typeof prev.seq === 'number' ? prev.seq : 0)
        if (typeof prev.index === 'number' && Number.isFinite(prev.index) && prev.index >= 0) prevIndex = prev.index
      }
      let start = 0
      let events
      if (hasWatermark && prevIndex === logLen) return // ② 无新增 → 直接返回（不物化数组、不写文件）
      if (hasWatermark && prevIndex >= 0 && prevIndex <= logLen) {
        // ③ 增量路径：只物化 [prevIndex, logLen) 区间
        start = prevIndex
        events = session.snapshotEvents(prevIndex, logLen)
      } else {
        // ④ 回退全量：首次折叠（无 prev）/ 会话无水位（非宿主会话对象）/ prevIndex > logLen（日志截断）
        events = session.snapshotEvents()
      }
      if (!Array.isArray(events)) return
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
        const hit = typeof usage.cacheReadTokens === 'number' ? usage.cacheReadTokens : 0
        const miss = typeof usage.inputTokens === 'number' ? usage.inputTokens : 0
        const out = typeof usage.outputTokens === 'number' ? usage.outputTokens : 0
        const cacheWriteTokens = typeof usage.cacheWriteTokens === 'number' ? usage.cacheWriteTokens : 0
        const reasoningTokens = typeof usage.reasoningTokens === 'number' ? usage.reasoningTokens : 0
        if (hit === 0 && miss === 0 && out === 0 && cacheWriteTokens === 0 && reasoningTokens === 0) continue
        const msg = data.message
        const model = msg !== null && typeof msg === 'object' && msg.source !== null && typeof msg.source === 'object' && typeof msg.source.model === 'string' ? msg.source.model : ''
        const provider = msg !== null && typeof msg === 'object' && msg.source !== null && typeof msg.source === 'object' && typeof msg.source.provider === 'string' ? msg.source.provider : ''
        rows.push(JSON.stringify({
          ts: new Date().toISOString(),
          sessionId: sid,
          role,
          model,
          provider,
          hit,
          miss,
          out,
          cacheWriteTokens,
          reasoningTokens,
          seq,
        }))
      }
      // 游标写回：index 为本次读到的水位（增量下一次从该水位续做）；无水位会话退化为本次快照长度。
      const nextIndex = hasWatermark ? logLen : events.length
      const nextCursor = { seq: cursor, index: nextIndex }
      // 无 usage 行时只推进当前进程内存水位，避免重复扫描；不触碰账本或 cursor 文件。
      if (rows.length === 0) {
        usageCursors.set(sid, nextCursor)
        return
      }
      const sepA = ledgerPath.lastIndexOf('\\')
      const sepB = ledgerPath.lastIndexOf('/')
      const dir = ledgerPath.slice(0, Math.max(sepA, sepB))
      if (dir !== '') mkdirSync(dir, { recursive: true })
      appendFileSync(ledgerPath, rows.join('\n') + '\n', 'utf8')
      // append 成功后才推进内存游标；append 失败时下一次 fold 必须再次输出同一批 seq。
      usageCursors.set(sid, nextCursor)
      // cursor 持久化：写前重读现状——可解析时更新本 session 项并逐项保留其它合法 session。
      // 重读降级（读不到/解析失败/根值非对象）时原样保留 cursor 文件，不覆盖其它 session 基准。
      const current = readUsageCursorTable()
      if (!current.ok) return
      const persisted = {}
      for (const key of Object.keys(current.table)) {
        if (key === sid) continue
        const entry = usageCursorEntryOf(current.table, key)
        if (entry === undefined) continue
        persisted[key] = { seq: entry.seq, index: entry.index }
      }
      persisted[sid] = nextCursor
      try { writeFileSync(ledgerCursorPath, JSON.stringify(persisted), 'utf8') } catch (error) { /* cursor 持久化尽力而为 */ }
    } catch (error) {
      if (!ledgerWarned) {
        ledgerWarned = true
        console.warn(`extra-plan: usage ledger fold failed: ${error instanceof Error ? error.message : String(error)}`)
      }
    }
  }

  return { foldUsage, disposeSession: (sessionId) => usageCursors.delete(sessionId) }
}
