// sessionEvents/isSubagentChild 的唯一来源：零依赖纯函数只读入参、不保存模块或会话状态；
// index.js 与 model-routing.js 共用同一实现，避免两侧漂移。
// 当前宿主 API 以 snapshotEvents() 为主：无参返回冻结事件数组，snapshotEvents(from,to)/eventAt(seq)
// 提供范围或单点读取；来源缺失或无效时返回 []，调用方的 Array.isArray/length 防御保持可用。
// 子代理识别先看 session.header，再扫描 subagent/descriptor 事件；主会话不缓存 false。
// events（可选第二参，T8）：调用方已用 observeSession 预取到不可变快照时直接传入复用（同一次钩子内
// 多处消费共用同一份数组，免掉重复物化）；不传/传 undefined 仍走 snapshotEvents 兜底。
// 改造8（账本与弃用迁移）后，@deprecated 同步兜底仍被两类调用方使用：tools/pre-execute（同步钩子
// 无法 await observeSession），以及未显式传 events 的调用方（isSubagentChild 多处判定、isBootstrapPhase
// 的既有夹具/同步调用方）——不再按「只剩两处」计数。
// usage 账本已改为插件启动时扫描本地会话日志维护，不再经本函数读事件。
// events 非法（非数组）时按「未传」处理、落回兜底路径，不让脏入参穿透成非数组返回值。
export function sessionEvents(session, events) {
  if (events !== undefined && Array.isArray(events)) return events
  if (session === undefined || session === null) return []
  // 0.2.2 已 @deprecated（宿主 @deepseek-ai/dsh-session/lib/types/index.d.ts 的 Session 类型同签名保留），同步入口兜底：
  // 同步钩子无法 await observeSession，只有 async 钩子才走 events 通道。改造8 后本兜底只剩 tools/pre-execute
  // 这一处同步钩子使用（isBootstrapPhase 已改走 sessionEvents(session, events)，不再经本兜底）；
  // usage 账本不再经此函数（改为启动扫描会话日志）。
  if (typeof session.snapshotEvents === 'function') return session.snapshotEvents()
  return []
}

// Session 读取迁移（T8，0.2.2）：经 ctx 能力探测取 sessionQuery 服务，为 async 钩子预取一份不可变
// SessionObservation（extends Disposable）。拿不到服务 / 方法缺失 / 调用抛错一律返回 undefined，
// 调用方据此落回上面 sessionEvents 的 @deprecated 同步兜底。宿主 SessionObservation 继承 Disposable、
// 只提供 [Symbol.dispose]() 而无独立释放方法，故返回的 lease 由调用方在 finally 里先判 lease 与
// [Symbol.dispose] 可用、再调用 lease[Symbol.dispose]() 释放。
export async function observeSessionLeaseOf(agent) {
  if (agent === undefined || agent === null) return undefined
  let service
  try {
    const ctx = agent.ctx
    service = ctx !== undefined && ctx !== null && typeof ctx.get === 'function' ? ctx.get('sessionQuery') : undefined
  } catch (error) {
    return undefined
  }
  if (service === undefined || service === null || typeof service.observeSession !== 'function') return undefined
  try {
    return await service.observeSession(agent.session.header.id)
  } catch (error) {
    return undefined
  }
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
  const scanEvents = sessionEvents(session, events)
  for (const event of scanEvents) {
    if (event !== null && typeof event === 'object' && event.type === 'subagent/descriptor') return true
  }
  return false
}
