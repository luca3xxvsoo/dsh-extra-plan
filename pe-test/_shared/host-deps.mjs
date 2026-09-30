// host-deps.mjs —— pe-test 自检侧的「宿主真包解析钩子」（仅测试侧，不属插件源码）
// 背景：仓库根与 plugins/dsh-extra-plan 下都没有 node_modules，而插件 index.js 顶层有
//   静态 import { createUserMessage } from '@deepseek-ai/dsh-llm'，lib/settings.js 顶层有
//   静态 import z from '@deepseek-ai/schemastery'；纯 Node 环境直接加载会 ERR_MODULE_NOT_FOUND。
//   自检要跑真实插件模块，就必须把这些 specifier 解析到宿主真包。
// 做法：先按锚点顺序确定宿主 node_modules 根（TARGET = '@deepseek-ai/dsh-llm' 的包目录上溯），
//   再为同一 @deepseek-ai 作用域下的其它 specifier（如 schemastery）在同一根里解析；
//   入口取 package.json 的 exports['.'].default（缺省回退 main）；其余 specifier 一律透传。
// 锚点顺序（T9-6）：
//   ① DSH_HOME（默认 ~/.dsh）下 profiles/<name>/node_modules/@deepseek-ai/dsh-llm/package.json
//   ② 宿主现场 node_modules（npm 全局前缀下 @deepseek-ai/dsh-llm，或 dsh 包自带的
//      node_modules/@deepseek-ai/dsh-llm）
// 现场告警：profile 与安装域同时存在 @deepseek-ai/dsh-llm 时打印一行「注意」（只告警、不改解析语义、
//   不写盘）——profile 副本会被 DSH 优先解析并顶替宿主同名运行时行（0.1.7-rc.1 副本缺 tool-update 投影 →
//   会话内工具集变化产生的线上 tool_removal 被 API 422 拒绝、整会话报废；详见 ai-宿主耦合台账.md CF12）。
// 纪律（反作弊）：锚点全缺失即 throw（文案含候选路径清单）——绝不返回伪造模块，
//   否则自检会「假绿」。同作用域其它包也只在同一 node_modules 根内解析，缺失即抛。
// 本文件只在测试侧解析路径，不写盘、不改宿主。
import { existsSync, readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'
import { pathToFileURL } from 'node:url'
import * as module from 'node:module'

const TARGET = '@deepseek-ai/dsh-llm'
const SCOPE = '@deepseek-ai'
const PKG_NAME = 'dsh-llm'
const DSH_PKG_NAME = 'dsh'

function profileNames() {
  const home = process.env.DSH_HOME || join(homedir(), '.dsh')
  const names = ['web']
  try {
    for (const name of readFileSync0(join(home, 'profiles'))) {
      if (!names.includes(name)) names.push(name)
    }
  } catch { /* 无 profiles 目录：只留 web */ }
  return { home, names }
}

function readFileSync0(dir) {
  // 局部小工具：只列目录名（避免顶层再 import readdirSync 造成语义混淆）
  const fsModule = module.createRequire(import.meta.url)('node:fs')
  return fsModule.readdirSync(dir)
}

// 锚点候选（按序探测）：返回宿主 node_modules 根 + dsh-llm 包目录的候选组合。
// DSH_INSTALL_ROOT 是显式只读安装根，优先于 DSH_HOME/profile，供 rc.2 本机与 rc.1 设备复用同一脚本。
// scope 仅用于「profile 内出现宿主同名副本」告警分组，不参与解析语义。
function anchorCandidates() {
  const list = []
  const configuredRoot = typeof process.env.DSH_INSTALL_ROOT === 'string' ? process.env.DSH_INSTALL_ROOT.trim() : ''
  if (configuredRoot !== '') {
    const rootNodeModules = join(configuredRoot, 'node_modules')
    list.push({
      scope: 'installation',
      nodeModules: rootNodeModules,
      pkg: join(rootNodeModules, SCOPE, PKG_NAME, 'package.json'),
    })
    list.push({
      scope: 'installation',
      nodeModules: join(rootNodeModules, SCOPE, DSH_PKG_NAME, 'node_modules'),
      pkg: join(rootNodeModules, SCOPE, DSH_PKG_NAME, 'node_modules', SCOPE, PKG_NAME, 'package.json'),
    })
  }
  const { home, names } = profileNames()
  for (const name of names) {
    list.push({
      scope: 'profile',
      nodeModules: join(home, 'profiles', name, 'node_modules'),
      pkg: join(home, 'profiles', name, 'node_modules', SCOPE, PKG_NAME, 'package.json'),
    })
  }
  const prefixes = []
  if (process.platform === 'win32') {
    if (process.env.APPDATA) prefixes.push(join(process.env.APPDATA, 'npm', 'node_modules'))
    prefixes.push(join(homedir(), 'AppData', 'Roaming', 'npm', 'node_modules'))
  } else {
    prefixes.push(join('/usr', 'local', 'lib', 'node_modules'))
    prefixes.push(join(homedir(), '.npm-global', 'lib', 'node_modules'))
    prefixes.push(join(homedir(), 'node_modules'))
  }
  for (const prefix of prefixes) {
    list.push({
      scope: 'installation',
      nodeModules: prefix,
      pkg: join(prefix, SCOPE, PKG_NAME, 'package.json'),
    })
    list.push({
      scope: 'installation',
      nodeModules: join(prefix, SCOPE, DSH_PKG_NAME, 'node_modules'),
      pkg: join(prefix, SCOPE, DSH_PKG_NAME, 'node_modules', SCOPE, PKG_NAME, 'package.json'),
    })
  }
  return list
}

function entryOf(pkgPath) {
  let pkg = null
  try { pkg = JSON.parse(readFileSync(pkgPath, 'utf8')) } catch { return null }
  if (pkg === null || typeof pkg !== 'object') return null
  let rel = undefined
  const dot = pkg.exports !== null && typeof pkg.exports === 'object' ? pkg.exports['.'] : undefined
  if (typeof dot === 'string') rel = dot
  else if (dot !== null && typeof dot === 'object' && dot !== undefined) rel = dot.default !== undefined ? dot.default : dot.import
  if (typeof rel !== 'string' || rel === '') rel = pkg.main
  if (typeof rel !== 'string' || rel === '') rel = 'index.js'
  const entry = join(dirname(pkgPath), rel.replace(/^\.\//, ''))
  return existsSync(entry) ? entry : null
}

function findHostAnchor() {
  const candidates = anchorCandidates()
  for (const candidate of candidates) {
    if (!existsSync(candidate.pkg)) continue
    const entry = entryOf(candidate.pkg)
    if (entry === null) continue
    let version = '未知'
    try {
      const manifest = JSON.parse(readFileSync(candidate.pkg, 'utf8'))
      if (manifest !== null && typeof manifest === 'object' && typeof manifest.version === 'string') version = manifest.version
    } catch { /* entryOf 已确认入口，版本读取失败只保留未知 */ }
    return { nodeModules: candidate.nodeModules, entry, version, manifest: candidate.pkg }
  }
  throw new Error(
    '[host-deps] 未找到宿主真包 ' + TARGET + '，自检无法解析该依赖。已按序探测以下候选路径：' +
    '\n  - ' + candidates.map((candidate) => candidate.pkg).join('\n  - ') +
    '\n请检查 DSH_HOME 或 npm 全局安装前缀；本钩子不提供伪造模块（缺失即报错，避免自检假绿）。'
  )
}

// specifier → 宿主 node_modules 根下的真实入口：只处理 @deepseek-ai/<name>（可带子路径）
function scopedEntryOf(nodeModules, specifier) {
  if (!specifier.startsWith(SCOPE + '/')) return null
  const rest = specifier.slice(SCOPE.length + 1)
  const parts = rest.split('/')
  if (parts.length === 0 || parts[0] === '') return null
  return entryOf(join(nodeModules, SCOPE, parts[0], 'package.json'))
}

// profile 中若有 shadowing 的宿主包副本只告警；不改变解析语义或文件状态。
// 告警只给出部署清理建议，不改动 hook。
function warnShadowedHostCopies() {
  const found = new Map()
  const seenPaths = new Set()
  for (const candidate of anchorCandidates()) {
    if (!existsSync(candidate.pkg)) continue
    if (seenPaths.has(candidate.pkg)) continue // 多前缀候选可能指向同一份包（如 APPDATA 与 homedir 两种写法）
    seenPaths.add(candidate.pkg)
    let version = '未知'
    try {
      const manifest = JSON.parse(readFileSync(candidate.pkg, 'utf8'))
      if (manifest !== null && typeof manifest === 'object' && typeof manifest.version === 'string') version = manifest.version
    } catch { /* 清单不可读：按未知版本记录，不影响告警判定 */ }
    if (!found.has(candidate.scope)) found.set(candidate.scope, [])
    found.get(candidate.scope).push(version + ' @ ' + candidate.pkg)
  }
  const profileCopies = found.get('profile')
  const installCopies = found.get('installation')
  if (profileCopies === undefined || installCopies === undefined) return
  console.warn(
    '[host-deps] 注意: profile 内存在宿主同名包副本（' + TARGET + '），DSH 解析本地候选优先 → 会顶替宿主的同名运行时行。'
    + '\n  profile 副本: ' + profileCopies.join(' | ')
    + '\n  安装域副本: ' + installCopies.join(' | ')
    + '\n  若两者版本不同，宿主运行时行为由 profile 那份决定（症状示例：会话内工具集变化 → 线上 tool_removal → API 422，整会话报废）。'
    + '\n  修复: 删除 profile 的 node_modules 与 pnpm-lock.yaml 后重装插件，再重启 dsh。',
  )
}

let registered = false

export async function registerHostDeps() {
  if (registered) return
  registered = true
  warnShadowedHostCopies()
  const anchor = findHostAnchor()
  console.log('[host-deps] 实际宿主版本: ' + anchor.version + '（' + anchor.manifest + '）')
  const scopedNodeModules = []
  // 先试锚点自身的 node_modules 根；再退到各级上溯（profiles/web/node_modules → profiles/web → …）
  let dir = anchor.nodeModules
  for (let i = 0; i < 6 && dir !== dirname(dir); i += 1) {
    scopedNodeModules.push(dir)
    dir = dirname(dir)
  }
  const resolveScoped = (specifier) => {
    for (const root of scopedNodeModules) {
      const entry = scopedEntryOf(root, specifier)
      if (entry !== null) return entry
    }
    return null
  }
  const resolveBare = (specifier) => {
    if (specifier !== 'js-yaml') return null
    for (const root of scopedNodeModules) {
      const entry = entryOf(join(root, 'js-yaml', 'package.json'))
      if (entry !== null) return entry
    }
    return null
  }
  const yamlEntry = resolveBare('js-yaml')
  const resolveOne = (specifier, nextResolve, context) => {
    if (specifier === TARGET) return { url: pathToFileURL(anchor.entry).href, shortCircuit: true }
    if (specifier === 'js-yaml' && yamlEntry !== null) return { url: pathToFileURL(yamlEntry).href, shortCircuit: true }
    if (specifier.startsWith(SCOPE + '/')) {
      const scoped = resolveScoped(specifier)
      // 只接管本钩子锚点根内确实存在的包；其余（如 @deepseek-ai/cordis，由宿主包自身
      // node_modules 就近解析）一律透传给 Node 原生解析器——不透传会把正常依赖打成假故障。
      if (scoped !== null) return { url: pathToFileURL(scoped).href, shortCircuit: true }
    }
    return nextResolve(specifier, context)
  }
  // 优先同步钩子（Node >= 22.15 的 registerHooks）；否则退到异步钩子（Node >= 20.6 的 module.register）。
  if (typeof module.registerHooks === 'function') {
    module.registerHooks({
      resolve(specifier, context, nextResolve) {
        try {
          return resolveOne(specifier, nextResolve, context)
        } catch (error) {
          throw error
        }
      },
    })
    return
  }
  if (typeof module.register === 'function') {
    const hookSource = [
      'const TARGET = ' + JSON.stringify(TARGET) + ';',
      'const ANCHOR = ' + JSON.stringify(pathToFileURL(anchor.entry).href) + ';',
      'const YAML = ' + JSON.stringify(yamlEntry === null ? null : pathToFileURL(yamlEntry).href) + ';',
      'const MAP = ' + JSON.stringify(Object.fromEntries(scopedNodeModules.map((root) => [root, true]))) + ';',
      'const ROOTS = ' + JSON.stringify(scopedNodeModules) + ';',
      'const SCOPE = ' + JSON.stringify(SCOPE) + ';',
      'export async function resolve(specifier, context, nextResolve) {',
      '  if (specifier === TARGET) return { url: ANCHOR, shortCircuit: true }',
      '  if (specifier === "js-yaml" && YAML !== null) return { url: YAML, shortCircuit: true }',
      '  if (specifier.startsWith(SCOPE + "/")) {',
      '    const rest = specifier.slice(SCOPE.length + 1).split("/")[0];',
      '    const fs = await import("node:fs");',
      '    const path = await import("node:path");',
      '    const url = await import("node:url");',
      '    for (const root of ROOTS) {',
      '      const pkgPath = path.join(root, SCOPE, rest, "package.json");',
      '      if (!fs.existsSync(pkgPath)) continue;',
      '      const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf8"));',
      '      const dot = pkg.exports && typeof pkg.exports === "object" ? pkg.exports["."] : undefined;',
      '      let rel = typeof dot === "string" ? dot : dot && typeof dot === "object" ? (dot.default !== undefined ? dot.default : dot.import) : undefined;',
      '      if (typeof rel !== "string" || rel === "") rel = pkg.main;',
      '      if (typeof rel !== "string" || rel === "") rel = "index.js";',
      '      const entry = path.join(path.dirname(pkgPath), String(rel).replace(/^\.\//, ""));',
      '      if (fs.existsSync(entry)) return { url: url.pathToFileURL(entry).href, shortCircuit: true };',
      '    }',
      '  }',
      '  return nextResolve(specifier, context)',
      '}',
    ].join('\n')
    module.register('data:text/javascript;base64,' + Buffer.from(hookSource, 'utf8').toString('base64'), import.meta.url)
    return
  }
  throw new Error('[host-deps] 当前 Node 既无 module.registerHooks 也无 module.register（需 Node >= 20.6），无法注册宿主解析钩子')
}
