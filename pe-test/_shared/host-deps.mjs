// host-deps.mjs —— pe-test 自检侧的「宿主真包解析钩子」（仅测试侧，不属插件源码）
// 背景：仓库根与 plugins/dsh-extra-plan 下都没有 node_modules，而插件 index.js 顶层有
//   静态 import { createUserMessage } from '@deepseek-ai/dsh-llm'，纯 Node 环境直接加载会
//   ERR_MODULE_NOT_FOUND。自检要跑真实插件模块，就必须把该 specifier 解析到宿主真包。
// 做法：只为 specifier '@deepseek-ai/dsh-llm' 注册解析钩子，按锚点顺序探测宿主真包，
//   入口取 package.json 的 exports['.'].default（缺省回退 main）；其余 specifier 一律透传。
// 纪律（反作弊）：两锚点均缺失即 throw（文案含候选路径清单）——绝不返回伪造模块，
//   否则自检会「假绿」。本文件只在测试侧解析路径，不写盘、不改宿主。
import { existsSync, readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'
import { pathToFileURL } from 'node:url'
import * as module from 'node:module'

const TARGET = '@deepseek-ai/dsh-llm'
const SCOPE = '@deepseek-ai'
const PKG_NAME = 'dsh-llm'
const DSH_PKG_NAME = 'dsh'

// 锚点候选（按序探测）：
//   ① DSH_HOME（默认 ~/.dsh）下 web profile 的 node_modules/<scope>/dsh-llm/package.json
//   ② npm 全局 node_modules 下 dsh 包自带的依赖 node_modules/<scope>/dsh-llm/package.json
function candidatePackageJsonPaths() {
  const list = []
  const home = process.env.DSH_HOME || join(homedir(), '.dsh')
  list.push(join(home, 'profiles', 'web', 'node_modules', SCOPE, PKG_NAME, 'package.json'))
  const prefixes = []
  if (process.platform === 'win32') {
    if (process.env.APPDATA) prefixes.push(join(process.env.APPDATA, 'npm', 'node_modules'))
    prefixes.push(join(homedir(), 'AppData', 'Roaming', 'npm', 'node_modules'))
  } else {
    prefixes.push(join('/usr', 'local', 'lib', 'node_modules'))
    prefixes.push(join(homedir(), '.npm-global', 'lib', 'node_modules'))
    prefixes.push(join(homedir(), 'node_modules'))
  }
  for (const prefix of prefixes) list.push(join(prefix, SCOPE, DSH_PKG_NAME, 'node_modules', SCOPE, PKG_NAME, 'package.json'))
  return list
}

function findHostEntry() {
  const candidates = candidatePackageJsonPaths()
  for (const pkgPath of candidates) {
    if (!existsSync(pkgPath)) continue
    let pkg = null
    try { pkg = JSON.parse(readFileSync(pkgPath, 'utf8')) } catch (error) { continue }
    if (pkg === null || typeof pkg !== 'object') continue
    let rel = undefined
    const dot = pkg.exports !== null && typeof pkg.exports === 'object' ? pkg.exports['.'] : undefined
    if (typeof dot === 'string') rel = dot
    else if (dot !== null && typeof dot === 'object') rel = dot.default !== undefined ? dot.default : dot.import
    if (typeof rel !== 'string' || rel === '') rel = pkg.main
    if (typeof rel !== 'string' || rel === '') rel = 'index.js'
    const entry = join(dirname(pkgPath), rel.replace(/^\.\//, ''))
    if (existsSync(entry)) return entry
  }
  throw new Error(
    '[host-deps] 未找到宿主真包 ' + TARGET + '，自检无法解析该依赖。已按序探测以下候选路径：' +
    '\n  - ' + candidates.join('\n  - ') +
    '\n请检查 DSH_HOME 或 npm 全局安装前缀；本钩子不提供伪造模块（缺失即报错，避免自检假绿）。'
  )
}

let registered = false

export async function registerHostDeps() {
  if (registered) return
  registered = true
  const entryUrl = pathToFileURL(findHostEntry()).href
  // 优先同步钩子（Node >= 22.15 的 registerHooks）；否则退到异步钩子（Node >= 20.6 的 module.register）。
  if (typeof module.registerHooks === 'function') {
    module.registerHooks({
      resolve(specifier, context, nextResolve) {
        if (specifier !== TARGET) return nextResolve(specifier, context)
        return { url: entryUrl, shortCircuit: true }
      },
    })
    return
  }
  if (typeof module.register === 'function') {
    const hookSource = [
      'export async function resolve(specifier, context, nextResolve) {',
      '  if (specifier !== ' + JSON.stringify(TARGET) + ') return nextResolve(specifier, context)',
      '  return { url: ' + JSON.stringify(entryUrl) + ', shortCircuit: true }',
      '}',
    ].join('\n')
    module.register('data:text/javascript;base64,' + Buffer.from(hookSource, 'utf8').toString('base64'), import.meta.url)
    return
  }
  throw new Error('[host-deps] 当前 Node 既无 module.registerHooks 也无 module.register（需 Node >= 20.6），无法注册宿主解析钩子')
}

