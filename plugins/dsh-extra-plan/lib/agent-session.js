// sessionEvents/isSubagentChild 的唯一来源：零依赖纯函数只读入参、不保存模块或会话状态；
// index.js 与 model-routing.js 共用同一实现，避免两侧漂移。
// 当前宿主 API 以 snapshotEvents() 为主：无参返回冻结事件数组，snapshotEvents(from,to)/eventAt(seq)
// 提供范围或单点读取；来源缺失或无效时返回 []，调用方的 Array.isArray/length 防御保持可用。
// 子代理识别先看 session.header，再扫描 subagent/descriptor 事件；主会话不缓存 false。
export function sessionEvents(session) {
  if (session === undefined || session === null) return []
  if (typeof session.snapshotEvents === 'function') return session.snapshotEvents()
  return []
}

// 可靠子代理识别（持久标记）：优先 session.header，日志 descriptor 扫描兜底。
// events（可选入参，P1-4）：调用方已持有同一份任务内快照时直接传入复用（同一次 tools/pre-execute
// 内多处判定共用一份快照）；不传/传 undefined 时内部自取 snapshotEvents()（其它调用点行为不变）。
// 语义不变：header 命中即 true；header 未标记时仍按事件流里的 subagent/descriptor 兜底扫描，
// 主会话（无 origin/delegationDepth 且无 descriptor）每趟仍全量扫、不缓存 false。
export function isSubagentChild(agent, events) {
  if (agent === undefined || agent === null) return false
  const session = agent.session
  if (session === undefined || session === null) return false
  const header = session.header
  if (header !== undefined && header !== null) {
    if (header.origin === 'subagent') return true
    if (typeof header.delegationDepth === 'number' && header.delegationDepth > 0) return true
  }
  const scanEvents = events === undefined ? sessionEvents(session) : events
  if (!Array.isArray(scanEvents)) return false
  for (const event of scanEvents) {
    if (event !== null && typeof event === 'object' && event.type === 'subagent/descriptor') return true
  }
  return false
}
