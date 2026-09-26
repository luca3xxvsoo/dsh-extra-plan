// executor-spawn 注册幂等（稳定槽键）回归：全部进程内 mock，不访问 DSH_HOME / profile / 宿主安装目录。
// mock 依据（宿主语义，按「包名 + 符号名」核对）：
//  - dsh-subagent registerProvider：重名抛 `a subagent provider named "<name>" is already registered`，
//    成功返回 disposer（调用即 delete）；getProvider 为纯查询；服务内 providers 为 Map。
//  - cordis traceable（getTraceable/createTraceable）：每次属性读取新建 Proxy（无缓存），
//    get 拦截器对 Symbol.for('cordis.original') 返回 target（= 服务实现本体），其余 prop 转发 target。
//  - ctx.effect(fn, label)：立即执行 fn，返回值（函数 = 清理回调）收集为 disposable；
//    fiber 释放时逆序调用全部清理回调（故 `ctx.effect(() => releaseSlot)` 的 releaseSlot 会在释放时被调用）。
// 断言只依赖本文件的 mock 状态与 apply 的返回值/抛错文本，不依赖 console.warn 输出内容。
import { apply } from '../../plugins/dsh-extra-plan/lib/executor-spawn.js'

const SERVICE_ORIGINAL = Symbol.for('cordis.original')
const PROVIDER_NAME = 'extra-executor-spawn'
const CONFLICT_TEXT = 'executor-spawn: provider "extra-executor-spawn" 已被其他注册方占用（重名冲突，本插件不覆盖）'

let pass = 0
let fail = 0
function check(label, condition) {
  if (condition) { pass += 1; console.log('PASS  ' + label) }
  else { fail += 1; console.log('FAIL  ' + label) }
}

// 宿主 subagents 服务本体 mock（providers 为 Map，重名抛英文文案，返回 effect 化 disposer）。
function makeService() {
  const providers = new Map()
  providers.set('spawn', { name: 'spawn', capabilities: ['start'], inheritsParentContext: true, start() {} })
  const service = {
    providers,
    registerCount: 0,
    registerProvider(provider) {
      if (providers.has(provider.name)) {
        throw new Error('a subagent provider named "' + provider.name + '" is already registered')
      }
      providers.set(provider.name, provider)
      service.registerCount += 1
      let disposed = false
      return () => {
        if (disposed) return
        disposed = true
        providers.delete(provider.name)
      }
    },
    getProvider(name) {
      return providers.get(name)
    },
  }
  return service
}

// 每个世代一个 ctx：ctx.subagents 为新建 Proxy（对 cordis.original 返回服务本体，其余转发）。
function makeCtx(service) {
  const effects = []
  let disposed = false
  const subagents = new Proxy(service, {
    get(target, prop) {
      if (prop === SERVICE_ORIGINAL) return target
      const value = Reflect.get(target, prop, target)
      return typeof value === 'function' ? value.bind(target) : value
    },
  })
  return {
    subagents,
    effect(execute) {
      // 对齐宿主 cordis Fiber.effect 语义：立即执行回调，返回值（函数）作为清理回调收集。
      const disposer = execute()
      if (typeof disposer === 'function') effects.push(disposer)
      else if (disposer !== undefined && disposer !== null) throw new TypeError('Invalid effect')
    },
    dispose() {
      if (disposed) return
      disposed = true
      for (let i = effects.length - 1; i >= 0; i -= 1) effects[i]()
    },
  }
}

function applySafely(ctx) {
  try {
    apply(ctx, { providerName: PROVIDER_NAME })
    return null
  } catch (error) {
    return error
  }
}

// ── mock 语义自检（验收 4b：代理身份与符号拦截） ─────────────────────────────
const serviceA = makeService()
const c1 = makeCtx(serviceA)
const c2 = makeCtx(serviceA)
check('② mock 语义：两次 makeCtx 的 subagents 代理为不同对象', c1.subagents !== c2.subagents)
check('② mock 语义：代理对 Symbol.for(\'cordis.original\') 返回同一服务本体',
  c1.subagents[SERVICE_ORIGINAL] === serviceA && c2.subagents[SERVICE_ORIGINAL] === serviceA)

// ── ① 两代 apply：跨世代共享同一注册 ────────────────────────────────────────
const err1 = applySafely(c1)
const err2 = applySafely(c2)
check('① 两代 apply（各自代理、同一服务本体）均不抛错' + (err1 || err2 ? '：' + (err1 || err2).message : ''),
  err1 === null && err2 === null)
check('① 跨世代共享注册：registerCount === 1', serviceA.registerCount === 1)
check('① getProvider(\'' + PROVIDER_NAME + '\') !== undefined', serviceA.getProvider(PROVIDER_NAME) !== undefined)

// ── ② 非最后持有者释放：不反注册 ───────────────────────────────────────────
c1.dispose()
check('② 第一代 dispose 后 provider 仍在（非最后持有者不反注册）', serviceA.getProvider(PROVIDER_NAME) !== undefined)

// ── ③ 最后持有者释放：反注册 ───────────────────────────────────────────────
c2.dispose()
check('③ 第二代 dispose 后 getProvider === undefined（归零才反注册）', serviceA.getProvider(PROVIDER_NAME) === undefined)

// ── ④ 第三世代重新注册 + 释放闭环可重复 ────────────────────────────────────
const c3 = makeCtx(serviceA)
const err3 = applySafely(c3)
check('④ 第三世代 apply 不抛错' + (err3 ? '：' + err3.message : ''), err3 === null)
check('④ 重新注册：registerCount === 2', serviceA.registerCount === 2)
check('④ 第三世代注册后 provider 存在', serviceA.getProvider(PROVIDER_NAME) !== undefined)
c3.dispose()
check('④ 第三世代 dispose 后 provider 再次移除（注册-释放闭环可重复）', serviceA.getProvider(PROVIDER_NAME) === undefined)

// ── ⑤ 外来占用：守卫语义保留（抛错文案逐字） ────────────────────────────────
const foreignService = makeService()
const foreign = { name: PROVIDER_NAME, capabilities: ['start'], inheritsParentContext: true, start() {} }
foreignService.providers.set(PROVIDER_NAME, foreign)
const foreignCtx = makeCtx(foreignService)
const err5 = applySafely(foreignCtx)
check('⑤ 外来占用：apply 抛错', err5 !== null)
check('⑤ 抛错文案逐字 === 重名冲突文案', err5 !== null && err5.message === CONFLICT_TEXT)
check('⑤ 外来 provider 未被覆盖', foreignService.getProvider(PROVIDER_NAME) === foreign)

// ── ⑥ 同 ctx 连续两次 apply：共享同一注册，dispose 后移除 ───────────────────
const serviceB = makeService()
const c6 = makeCtx(serviceB)
const err6a = applySafely(c6)
const err6b = applySafely(c6)
check('⑥ 同 ctx 连续两次 apply 均不抛错' + (err6a || err6b ? '：' + (err6a || err6b).message : ''),
  err6a === null && err6b === null)
check('⑥ 连续两次 apply 后 registerCount === 1', serviceB.registerCount === 1)
c6.dispose()
check('⑥ 该 ctx dispose 后 provider 移除（两次持有全部释放）', serviceB.getProvider(PROVIDER_NAME) === undefined)

console.log('\n通过 ' + pass + ', 失败 ' + fail)
process.exit(fail === 0 ? 0 : 1)
