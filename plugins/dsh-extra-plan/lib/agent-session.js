// @local/dsh-extra-plan lib/agent-session.js (v0.2.1)
// sessionEvents / isSubagentChild 的唯一来源（自 index.js 拆出，函数体逐字保留原实现）。
//   零依赖纯函数模块：只读入参、不持有任何状态，不 import index.js（避免循环依赖）。
//   使用方：index.js（import 后供留存区各调用点使用，并继续经 decisions re-export
//   isSubagentChild，名字数不变）、lib/model-routing.js（resolveAgentRouteSources 依赖
//   isSubagentChild）。拆分前 lib/model-routing.js 内的逐字镜像副本已在本轮删除。
//   改动本模块即同时影响两侧 —— 不再有镜像副本需要同步。

// 会话事件快照统一读取（v0.1.2-rc.1 单版本口径）：
// `events` 已移除，替代 API 为 `snapshotEvents()`（无参=全量冻结数组，
// 有快照缓存，语义与旧 events getter 等价；另有 snapshotEvents(from, to) 区间读取与
// eventAt(seq) 供单点读取）；
// 均无返回 []（各调用点已有 Array.isArray/长度防御，空数组语义安全；
// 时序上不抛错、不崩网关）。
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
