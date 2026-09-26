// @local/dsh-executor-spawn (v1.4)
// 规划者·执行者模式专用子代理 provider：包一层宿主 spawn provider，
// 给经它派出的子代理默认注入执行者工具裁剪（deny 委派/追问/目标/计划类工具）。
// 模型不再注入（v1.3：子会话模型跟随父会话）——worker 请求不带 model 时由宿主
// 继承父会话当前模型；请求显式指定的 model 优先（如 workflow 脚本显式传的模型）。
//
// 背景（E8 修复，2026-08）：workflow worker 与 ralph worker 由
// dsh-workflow-worker-thread 引擎内部调用 ctx.subagents.start()，请求里
// 不携带 toolFilter/persona，预设的 tool-subagent 行裁剪对其不生效
// （测试证据：worker 25 工具、fork 26 工具未裁剪，防递归失效）。
// 预设侧无法直接修：引擎 startChild 硬编码请求形状，Config 无 toolFilter
// 字段；registerContinuableSetup 只覆盖 continuable 子代理；预设层 restrict
// 会连规划者一起裁掉。宿主包按用户要求不动。
//
// 修法：本 provider 挂在 planner-executor 预设里（宿主组合不挂），把
// spawn provider 的 start/prepareContinuable 委托出去，仅当请求未自带
// toolFilter 时注入 deny 清单；workflow 引擎行与 ralph 行把 provider 指向
// 'executor-spawn'，两类 one-shot worker 即与常规执行者一致地被裁剪。
// fork 由预设 tool-subagent-fork 行自带的 toolFilter 覆盖（宿主 fork
// provider 已支持 toolFilter，对话继承不受 deny 影响）。
//
// 生命周期：registerProvider 随进程存活；providerName 来自 config——默认 'executor-spawn'，
// planner-executor 预设传 'extra-executor-spawn'。注册采用**引用计数幂等**：预设组合变更 →
// 根 Include reload → 本行新 fiber 再次 apply 时，与仍存活的旧世代共享同一注册与 disposer
// （同名重复注册会撞宿主 dsh-subagent 的无覆盖分支），仅最后一个持有者释放时才反注册。
// 槽表键 = subagents 服务实现本体（root 单例；读取全局注册符号 cordis.original，取不到符号值时降级回代理本身）。

export const name = 'executor-spawn'
export const inject = ['subagents']

// DEFAULT_DENY 仅作 fallback：预设 agent.cordis.yml 的 executor-spawn 行恒提供
// config.deny（11 项，含 subagent_plan；0.1.7 起宿主已无 cordis 执行口工具 cordis_run，
// 故不列出——deny 未知名会使宿主 tools.restrict() 抛错），预设加载路径下本清单不可达；
// 不一致以 config.deny 为准。本常量已与预设 config.deny 收敛一致（11 项）。
export const DEFAULT_DENY = [
  'subagent',
  'subagent_review',
  'subagent_probe',
  'workflow',
  'ralph',
  'send_message',
  'interrupt_agent',
  'list_agents',
  'ask_user_question',
  'todo_write',
  'subagent_plan',
]

// deny 解析：config.deny 合法时以其为准，否则回退 DEFAULT_DENY（纯函数，供测试断言）。
export function resolveDeny(config) {
  return config !== null && typeof config === 'object' && Array.isArray(config.deny) ? config.deny : DEFAULT_DENY
}

// 注册槽表（模块级，随进程存活）：键 = subagents 服务实现本体（root 单例），值 =
// Map<providerName, { count, dispose }>。键不取 ctx.subagents 代理本身——cordis 的 traceable
// 代理每次属性读取都新建（createTraceable 无缓存），旧「代理身份稳定、可作槽键」的假设已被
// 实测证伪：键永不命中 → 共享分支失效 → 新世代零持有却命中旧注册 → 误抛重名冲突。
// 稳定键取法：读取全局注册符号 cordis.original，由 traceable 代理的 get
// 拦截器返回 target（= 服务实现本体；subagents 为 root 单例，跨预设世代恒同一对象）；
// 取不到符号值时降级回代理本身（保持旧行为，不劣化）。
// 用途：预设组合变更 → 根 Include reload → 本行新 fiber 再次 apply；旧世代 provider 因
// users>0 不被 collect → 宿主进程级 providers 表同名 → dsh-subagent 重名注册无覆盖分支即
// 抛 DUPLICATE_PROVIDER（现场表现为预设「加载失败」）。引用计数让新旧世代共享同一注册：
// 仅在最后一个持有者释放时才调用宿主 disposer 反注册（若改为探测跳过，则旧世代被 collect
// 后零持有 → workflow-ptc/tool-ralph 派发 NO_PROVIDER）。
const registrationSlots = new WeakMap()

const SERVICE_ORIGINAL = Symbol.for('cordis.original')
// 稳定槽键：读取全局注册符号 cordis.original 由 traceable 代理 get 拦截器返回 target
// （服务实现本体，root 单例，跨 ctx/跨预设世代稳定）；非 traceable/取不到时降级回代理本身。
function slotKey(subagents) {
  if (subagents !== null && typeof subagents === 'object') {
    const original = subagents[SERVICE_ORIGINAL]
    if (original !== undefined) return original
  }
  return subagents
}

export function apply(ctx, config) {
  const providerName = config !== null && typeof config === 'object' && typeof config.providerName === 'string'
    ? config.providerName : 'executor-spawn'
  const delegate = config !== null && typeof config === 'object' && typeof config.delegate === 'string'
    ? config.delegate : 'spawn'
  const deny = resolveDeny(config)

  const real = ctx.subagents.getProvider(delegate)
  if (real === undefined) {
    throw new Error(`executor-spawn: 委托的 provider "${delegate}" 未注册（宿主 subagent-spawn-in-process 应已挂载）`)
  }

  // ── 注册幂等（引用计数） ───────────────────────────────────────────────────
  // 槽：本插件族对同一 subagents 服务实现（root 单例）上同一 providerName 的唯一注册记录。
  const key = slotKey(ctx.subagents)
  let slots = registrationSlots.get(key)
  if (slots === undefined) {
    slots = new Map()
    registrationSlots.set(key, slots)
  }
  let slot = slots.get(providerName)
  if (slot === undefined) {
    slot = { count: 0, dispose: null }
    slots.set(providerName, slot)
  }
  // 释放一份持有：归零且已有宿主 disposer 时反注册并置空（供下一次全新注册）。
  const releaseSlot = () => {
    slot.count -= 1
    if (slot.count === 0 && slot.dispose !== null) {
      slot.dispose()
      slot.dispose = null
    }
  }
  if (slot.count > 0) {
    // 本插件族已注册（旧世代存活，或本行 fiber 重建）：只加持有，不再注册。
    slot.count += 1
    ctx.effect(() => releaseSlot, 'executor-spawn: shared provider slot')
    console.warn(`executor-spawn: provider "${providerName}" 已由本插件注册，跳过重复注册（预设组合变更/行重建共享同一注册；deny/delegate 变更需重启 DSH 生效）`)
    return
  }
  if (ctx.subagents.getProvider(providerName) !== undefined) {
    // 零持有却已有同名 provider：真实重名冲突（非本插件注册方），保留宿主重名报错语义。
    throw new Error(`executor-spawn: provider "${providerName}" 已被其他注册方占用（重名冲突，本插件不覆盖）`)
  }

  // 默认过滤器：请求自带 toolFilter 时尊重调用方；否则注入执行者 deny。
  const defaultFilter = { deny }
  // agentOptions 透传：请求自带 agentOptions 时保留其字段（含显式 model，优先）；
  // 否则新建空对象，模型由宿主按父会话继承。
  // 注：宿主 resolveChildAgentOptions（@deepseek-ai/dsh-subagent 包内，按符号名核对）用对象展开合并
  // （...requested），空对象 {} 与 undefined 等价——父会话 provider/model/maxTokens
  // 全部继承，不会被空对象屏蔽；显式键才覆盖父值。
  const defaultedAgentOptions = (request) => {
    const base = request.agentOptions !== undefined && request.agentOptions !== null
      ? { ...request.agentOptions } : {}
    return base
  }
  slot.dispose = ctx.subagents.registerProvider({
    name: providerName,
    capabilities: real.capabilities,
    inheritsParentContext: real.inheritsParentContext,
    start(request) {
      return real.start({
        ...request,
        toolFilter: request.toolFilter ?? defaultFilter,
        agentOptions: defaultedAgentOptions(request),
      })
    },
    ...(typeof real.prepareContinuable === 'function'
      ? { prepareContinuable: (request) => real.prepareContinuable(request) }
      : {}),
  })
  slot.count = 1
  ctx.effect(() => releaseSlot, 'executor-spawn: shared provider slot')
}
