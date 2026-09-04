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
// provider 已支持 toolFilter，report 与对话继承不受 deny 影响）。
//
// 生命周期：与宿主 provider 一致，registerProvider 随进程存活；只有
// planner-executor 预设引用 'executor-spawn'，其他预设不受影响。

export const name = 'executor-spawn'
export const inject = ['subagents']

// DEFAULT_DENY 仅作 fallback：预设 agent.cordis.yml 的 executor-spawn 行恒提供
// config.deny（11 项，含 subagent_plan），预设加载路径下本清单不可达；不一致以
// config.deny 为准。本常量不随预设同步（是否收敛为 11 项另议，本批不改代码）。
const DEFAULT_DENY = [
  'subagent',
  'subagent_fork',
  'subagent_review',
  'subagent_probe',
  'workflow',
  'ralph',
  'send_message',
  'interrupt_agent',
  'list_agents',
  'ask_user_question',
  'create_goal',
  'update_goal',
  'get_goal',
  'exit_plan_mode',
  'todo_write',
]

export function apply(ctx, config) {
  const providerName = config !== null && typeof config === 'object' && typeof config.providerName === 'string'
    ? config.providerName : 'executor-spawn'
  const delegate = config !== null && typeof config === 'object' && typeof config.delegate === 'string'
    ? config.delegate : 'spawn'
  const deny = config !== null && typeof config === 'object' && Array.isArray(config.deny)
    ? config.deny : DEFAULT_DENY

  const real = ctx.subagents.getProvider(delegate)
  if (real === undefined) {
    throw new Error(`executor-spawn: 委托的 provider "${delegate}" 未注册（宿主 subagent-spawn-in-process 应已挂载）`)
  }

  // 默认过滤器：请求自带 toolFilter 时尊重调用方；否则注入执行者 deny。
  const defaultFilter = { deny }
  // agentOptions 透传：请求自带 agentOptions 时保留其字段（含显式 model，优先）；
  // 否则新建空对象，模型由宿主按父会话继承。
  // 注：宿主 resolveChildAgentOptions（dsh-subagent L501-512）用对象展开合并
  // （...requested），空对象 {} 与 undefined 等价——父会话 provider/model/maxTokens
  // 全部继承，不会被空对象屏蔽；显式键才覆盖父值。
  const defaultedAgentOptions = (request) => {
    const base = request.agentOptions !== undefined && request.agentOptions !== null
      ? { ...request.agentOptions } : {}
    return base
  }
  ctx.subagents.registerProvider({
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
}
