// host-deps.mjs —— pe-test 自检侧的「宿主真包解析钩子」（仅测试侧，不属插件源码）
// 只接受命令显式提供的 DSH_INSTALL_ROOT；宿主包解析与生成的 ESM 回放均 fail-closed。
import { lstatSync, readFileSync, realpathSync, statSync } from 'node:fs'
import { dirname, isAbsolute, join, relative, sep } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import * as module from 'node:module'
import { createPathContext } from '../../plugins/dsh-extra-plan/lib/path-policy.js'

const TARGET = '@deepseek-ai/dsh-llm'
const SCOPE = '@deepseek-ai'
const PKG_NAME = 'dsh-llm'
const DSH_PKG_NAME = 'dsh'
const nativeRealpath = typeof realpathSync.native === 'function' ? realpathSync.native : realpathSync

function samePath(left, right) {
  return relative(left, right) === ''
}

function isWithinRoot(root, candidate) {
  if (typeof root !== 'string' || typeof candidate !== 'string' || !isAbsolute(root) || !isAbsolute(candidate)) return false
  const child = relative(root, candidate)
  return child === '' || (child !== '..' && !child.startsWith('..' + sep) && !isAbsolute(child))
}

function explicitPath(value, label) {
  try {
    return createPathContext({ hostDataRoot: value }).hostDataRoot
  } catch (error) {
    throw new Error('[host-deps] 无效显式安装根 ' + label + ': ' + String(error && error.message || error))
  }
}

function assertWithinRoot(root, candidate, label) {
  if (root === null || root === undefined) throw new Error('[host-deps] 缺少显式安装根: ' + label)
  if (isWithinRoot(root, candidate)) return candidate
  throw new Error('[host-deps] 显式安装根拒绝根外解析: ' + label + ' -> ' + candidate)
}

function physicalRoot(root, label) {
  const lexicalRoot = explicitPath(root, label)
  let realRoot
  try { realRoot = nativeRealpath(lexicalRoot) } catch (error) {
    throw new Error('[host-deps] 显式安装根无法证明真实路径: ' + label + ' -> ' + String(error && error.code || error))
  }
  let rootStat
  try { rootStat = statSync(realRoot) } catch (error) {
    throw new Error('[host-deps] 显式安装根无法读取: ' + label + ' -> ' + String(error && error.code || error))
  }
  if (!rootStat.isDirectory()) throw new Error('[host-deps] 显式安装根不是目录: ' + label)
  return realRoot
}

function proveCandidate(root, candidate, label, options = {}) {
  assertWithinRoot(root, candidate, label)
  const rootRealPath = options.rootRealPath || physicalRoot(root, label + ' root')
  let cursor = candidate
  let candidateStat = null
  let candidateRealPath = null
  let actualStat = null
  while (true) {
    let stat
    try {
      stat = lstatSync(cursor)
    } catch (error) {
      if (error && (error.code === 'ENOENT' || error.code === 'ENOTDIR')) {
        const parent = dirname(cursor)
        if (samePath(parent, cursor)) throw new Error('[host-deps] 找不到授权根父链: ' + label)
        cursor = parent
        continue
      }
      throw new Error('[host-deps] 路径探查失败: ' + label + ' -> ' + String(error && error.code || error))
    }
    let realPath
    try { realPath = nativeRealpath(cursor) } catch (error) {
      throw new Error('[host-deps] 无法验证真实路径: ' + label + ' -> ' + String(error && error.code || error))
    }
    if (!isWithinRoot(rootRealPath, realPath)) throw new Error('[host-deps] 真实路径越过显式安装根: ' + label + ' -> ' + realPath)
    if (samePath(cursor, candidate)) {
      candidateStat = stat
      candidateRealPath = realPath
      try { actualStat = statSync(cursor) } catch (error) {
        throw new Error('[host-deps] 候选不可读取: ' + label + ' -> ' + String(error && error.code || error))
      }
    }
    if (samePath(cursor, root)) break
    const parent = dirname(cursor)
    if (samePath(parent, cursor)) throw new Error('[host-deps] 未到达显式安装根: ' + label)
    cursor = parent
  }
  if (options.requireExists === true && candidateStat === null) throw new Error('[host-deps] 候选不存在: ' + label + ' -> ' + candidate)
  return { rootRealPath, candidateStat, candidateRealPath, actualStat, exists: candidateStat !== null }
}

function checkHostResolvedResult(root, result, label) {
  if (root === null || root === undefined) throw new Error('[host-deps] 缺少显式安装根: ' + label)
  if (result === null || typeof result !== 'object' || typeof result.url !== 'string' || !result.url.startsWith('file:')) {
    const url = result !== null && typeof result === 'object' ? result.url : undefined
    throw new Error('[host-deps] Host请求必须解析为file URL: ' + label + ' -> ' + String(url))
  }
  let filePath
  try { filePath = fileURLToPath(result.url) } catch { throw new Error('[host-deps] Host请求返回无效file URL: ' + label) }
  const proof = proveCandidate(root, filePath, label, { requireExists: true })
  if (proof.actualStat === null || !proof.actualStat.isFile()) throw new Error('[host-deps] Host请求必须指向真实文件: ' + label)
  return result
}

function isHostSpecifier(specifier) {
  return specifier === 'js-yaml' || specifier.startsWith(SCOPE + '/')
}

function explicitInstallRoot() {
  const configuredRoot = typeof process.env.DSH_INSTALL_ROOT === 'string' ? process.env.DSH_INSTALL_ROOT.trim() : ''
  if (configuredRoot === '') throw new Error('[host-deps] 缺少显式 DSH_INSTALL_ROOT；不会探测profile、全局前缀或家目录')
  return explicitPath(configuredRoot, 'DSH_INSTALL_ROOT')
}

function anchorCandidates(strictRoot) {
  const rootNodeModules = join(strictRoot, 'node_modules')
  return [
    {
      scope: 'installation',
      nodeModules: rootNodeModules,
      pkg: join(rootNodeModules, SCOPE, PKG_NAME, 'package.json'),
    },
    {
      scope: 'installation',
      nodeModules: join(rootNodeModules, SCOPE, DSH_PKG_NAME, 'node_modules'),
      pkg: join(rootNodeModules, SCOPE, DSH_PKG_NAME, 'node_modules', SCOPE, PKG_NAME, 'package.json'),
    },
  ]
}

function exportTarget(pkg, subpath) {
  const exportsField = pkg.exports
  if (typeof exportsField === 'string') return subpath === '.' ? exportsField : undefined
  if (exportsField !== null && typeof exportsField === 'object' && !Array.isArray(exportsField)) {
    const direct = Object.prototype.hasOwnProperty.call(exportsField, subpath)
      ? exportsField[subpath]
      : subpath === '.' && !Object.keys(exportsField).some((key) => key.startsWith('.')) ? exportsField : undefined
    if (typeof direct === 'string') return direct
    if (direct !== null && typeof direct === 'object') {
      if (typeof direct.default === 'string') return direct.default
      if (typeof direct.import === 'string') return direct.import
      if (typeof direct.require === 'string') return direct.require
      if (typeof direct.node === 'string') return direct.node
    }
    return undefined
  }
  return subpath === '.' ? pkg.main : undefined
}

function entryOf(pkgPath, subpath = '.', strictRoot) {
  const manifestProof = proveCandidate(strictRoot, pkgPath, 'package manifest ' + pkgPath)
  if (!manifestProof.exists || manifestProof.actualStat === null || !manifestProof.actualStat.isFile()) return null
  let pkg = null
  try { pkg = JSON.parse(readFileSync(pkgPath, 'utf8')) } catch { return null }
  if (pkg === null || typeof pkg !== 'object') return null
  let rel = exportTarget(pkg, subpath)
  if (typeof rel !== 'string' || rel === '') {
    if (subpath !== '.') return null
    rel = 'index.js'
  }
  const relativeEntry = rel.startsWith('./') ? rel.slice(2) : rel
  let entry = join(dirname(pkgPath), relativeEntry)
  assertWithinRoot(strictRoot, entry, 'package entry ' + subpath)
  let entryProof = proveCandidate(strictRoot, entry, 'package entry ' + subpath)
  if (entryProof.exists && entryProof.actualStat !== null && entryProof.actualStat.isFile()) return entry
  if (subpath === '.' && relativeEntry !== 'index.js') {
    entry = join(dirname(pkgPath), 'index.js')
    assertWithinRoot(strictRoot, entry, 'package fallback entry')
    entryProof = proveCandidate(strictRoot, entry, 'package fallback entry')
    if (entryProof.exists && entryProof.actualStat !== null && entryProof.actualStat.isFile()) return entry
  }
  return null
}

function findHostAnchor(strictRoot) {
  const rootRealPath = physicalRoot(strictRoot, 'DSH_INSTALL_ROOT')
  const candidates = anchorCandidates(strictRoot)
  for (const candidate of candidates) {
    const manifestProof = proveCandidate(strictRoot, candidate.pkg, TARGET + ' manifest', { rootRealPath })
    if (!manifestProof.exists || manifestProof.actualStat === null || !manifestProof.actualStat.isFile()) continue
    const entry = entryOf(candidate.pkg, '.', strictRoot)
    if (entry === null) continue
    let version = '未知'
    try {
      const manifest = JSON.parse(readFileSync(candidate.pkg, 'utf8'))
      if (manifest !== null && typeof manifest === 'object' && typeof manifest.version === 'string') version = manifest.version
    } catch { /* entryOf 已确认入口，版本读取失败只保留未知 */ }
    assertWithinRoot(strictRoot, candidate.pkg, TARGET + ' manifest')
    assertWithinRoot(strictRoot, entry, TARGET)
    return { nodeModules: candidate.nodeModules, entry, version, manifest: candidate.pkg }
  }
  throw new Error(
    '[host-deps] 显式安装根内未找到宿主真包 ' + TARGET + '，自检无法解析该依赖。已探测：' +
    '\n  - ' + candidates.map((candidate) => candidate.pkg).join('\n  - ')
  )
}

function scopedEntryOf(nodeModules, specifier, strictRoot) {
  if (!specifier.startsWith(SCOPE + '/')) return null
  const rest = specifier.slice(SCOPE.length + 1)
  const slash = rest.indexOf('/')
  const packageName = slash === -1 ? rest : rest.slice(0, slash)
  if (packageName === '') return null
  const subpath = slash === -1 ? '.' : './' + rest.slice(slash + 1)
  const pkgPath = join(nodeModules, SCOPE, packageName, 'package.json')
  assertWithinRoot(strictRoot, pkgPath, specifier + ' manifest')
  return entryOf(pkgPath, subpath, strictRoot)
}

export function buildAsyncHookSource({ target, anchor, yaml, roots, scope = SCOPE, strictRoot = null }) {
  const strictRootValue = strictRoot === null || strictRoot === undefined || strictRoot === '' ? null : explicitPath(strictRoot, 'async hook strictRoot')
  const rootValues = Array.isArray(roots) ? roots.map((root, index) => assertWithinRoot(strictRootValue, root, 'async hook root ' + String(index))) : []
  const lines = [
    'const TARGET = ' + JSON.stringify(target) + ';',
    'const ANCHOR = ' + JSON.stringify(anchor) + ';',
    'const YAML = ' + JSON.stringify(yaml) + ';',
    'const ROOTS = ' + JSON.stringify(rootValues) + ';',
    'const SCOPE = ' + JSON.stringify(scope) + ';',
    'const STRICT_ROOT = ' + JSON.stringify(strictRootValue) + ';',
    'const fs = await import("node:fs");',
    'const path = await import("node:path");',
    'const url = await import("node:url");',
    'const nativeRealpath = typeof fs.realpathSync.native === "function" ? fs.realpathSync.native : fs.realpathSync;',
    'function samePath(left, right) { return path.relative(left, right) === ""; }',
    'function isWithinRoot(root, candidate) {',
    '  if (typeof root !== "string" || typeof candidate !== "string" || !path.isAbsolute(root) || !path.isAbsolute(candidate)) return false;',
    '  const child = path.relative(root, candidate);',
    '  return child === "" || (child !== ".." && !child.startsWith(".." + path.sep) && !path.isAbsolute(child));',
    '}',
    'function assertWithinRoot(root, candidate, label) {',
    '  if (root === null || root === undefined) throw new Error("[host-deps] 缺少显式安装根: " + label);',
    '  if (!isWithinRoot(root, candidate)) throw new Error("[host-deps] 显式安装根拒绝根外解析: " + label + " -> " + candidate);',
    '  return candidate;',
    '}',
    'function proveCandidate(root, candidate, label, options = {}) {',
    '  assertWithinRoot(root, candidate, label);',
    '  let rootRealPath;',
    '  try { rootRealPath = options.rootRealPath || nativeRealpath(root); } catch (error) { throw new Error("[host-deps] 显式安装根无法证明真实路径: " + label + " -> " + String(error && error.code || error)); }',
    '  let cursor = candidate;',
    '  let candidateStat = null;',
    '  let candidateRealPath = null;',
    '  let actualStat = null;',
    '  while (true) {',
    '    let stat;',
    '    try { stat = fs.lstatSync(cursor); } catch (error) {',
    '      if (error && (error.code === "ENOENT" || error.code === "ENOTDIR")) {',
    '        const parent = path.dirname(cursor);',
    '        if (samePath(parent, cursor)) throw new Error("[host-deps] 找不到授权根父链: " + label);',
    '        cursor = parent;',
    '        continue;',
    '      }',
    '      throw new Error("[host-deps] 路径探查失败: " + label + " -> " + String(error && error.code || error));',
    '    }',
    '    let realPath;',
    '    try { realPath = nativeRealpath(cursor); } catch (error) { throw new Error("[host-deps] 无法验证真实路径: " + label + " -> " + String(error && error.code || error)); }',
    '    if (!isWithinRoot(rootRealPath, realPath)) throw new Error("[host-deps] 真实路径越过显式安装根: " + label + " -> " + realPath);',
    '    if (samePath(cursor, candidate)) {',
    '      candidateStat = stat;',
    '      candidateRealPath = realPath;',
    '      try { actualStat = fs.statSync(cursor); } catch (error) { throw new Error("[host-deps] 候选不可读取: " + label + " -> " + String(error && error.code || error)); }',
    '    }',
    '    if (samePath(cursor, root)) break;',
    '    const parent = path.dirname(cursor);',
    '    if (samePath(parent, cursor)) throw new Error("[host-deps] 未到达显式安装根: " + label);',
    '    cursor = parent;',
    '  }',
    '  if (options.requireExists === true && candidateStat === null) throw new Error("[host-deps] 候选不存在: " + label + " -> " + candidate);',
    '  return { rootRealPath, candidateStat, candidateRealPath, actualStat, exists: candidateStat !== null };',
    '}',
    'function checkHostResolvedResult(root, result, label) {',
    '  if (root === null || root === undefined) throw new Error("[host-deps] 缺少显式安装根: " + label);',
    '  if (result === null || typeof result !== "object" || typeof result.url !== "string" || !result.url.startsWith("file:")) {',
    '    const value = result !== null && typeof result === "object" ? result.url : undefined;',
    '    throw new Error("[host-deps] Host请求必须解析为file URL: " + label + " -> " + String(value));',
    '  }',
    '  let filePath;',
    '  try { filePath = url.fileURLToPath(result.url); } catch { throw new Error("[host-deps] Host请求返回无效file URL: " + label); }',
    '  const proof = proveCandidate(root, filePath, label, { requireExists: true });',
    '  if (proof.actualStat === null || !proof.actualStat.isFile()) throw new Error("[host-deps] Host请求必须指向真实文件: " + label);',
    '  return result;',
    '}',
    'function isHostSpecifier(specifier) {',
    '  return specifier === "js-yaml" || specifier.startsWith(SCOPE + "/");',
    '}',
    'function exportTarget(pkg, subpath) {',
    '  const exportsField = pkg.exports;',
    '  if (typeof exportsField === "string") return subpath === "." ? exportsField : undefined;',
    '  if (exportsField !== null && typeof exportsField === "object" && !Array.isArray(exportsField)) {',
    '    const direct = Object.prototype.hasOwnProperty.call(exportsField, subpath) ? exportsField[subpath] : (subpath === "." && !Object.keys(exportsField).some((key) => key.startsWith(".")) ? exportsField : undefined);',
    '    if (typeof direct === "string") return direct;',
    '    if (direct !== null && typeof direct === "object") {',
    '      if (typeof direct.default === "string") return direct.default;',
    '      if (typeof direct.import === "string") return direct.import;',
    '      if (typeof direct.require === "string") return direct.require;',
    '      if (typeof direct.node === "string") return direct.node;',
    '    }',
    '    return undefined;',
    '  }',
    '  return subpath === "." ? pkg.main : undefined;',
    '}',
    'function scopedEntry(specifier) {',
    '  if (!specifier.startsWith(SCOPE + "/")) return null;',
    '  const rest = specifier.slice(SCOPE.length + 1);',
    '  const slash = rest.indexOf("/");',
    '  const packageName = slash === -1 ? rest : rest.slice(0, slash);',
    '  if (packageName === "") return null;',
    '  const subpath = slash === -1 ? "." : "./" + rest.slice(slash + 1);',
    '  for (const root of ROOTS) {',
    '    const pkgPath = path.join(root, SCOPE, packageName, "package.json");',
    '    const manifestProof = proveCandidate(STRICT_ROOT, pkgPath, specifier + " manifest");',
    '    if (!manifestProof.exists || manifestProof.actualStat === null || !manifestProof.actualStat.isFile()) continue;',
    '    const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf8"));',
    '    let rel = exportTarget(pkg, subpath);',
    '    if (typeof rel !== "string" || rel === "") {',
    '      if (subpath !== ".") continue;',
    '      rel = "index.js";',
    '    }',
    '    const relativeEntry = rel.startsWith("./") ? rel.slice(2) : rel;',
    '    let entry = path.join(path.dirname(pkgPath), relativeEntry);',
    '    const entryProof = proveCandidate(STRICT_ROOT, entry, specifier + " entry");',
    '    if (entryProof.exists && entryProof.actualStat !== null && entryProof.actualStat.isFile()) return url.pathToFileURL(entry).href;',
    '    if (subpath === "." && relativeEntry !== "index.js") {',
    '      entry = path.join(path.dirname(pkgPath), "index.js");',
    '      const fallbackProof = proveCandidate(STRICT_ROOT, entry, specifier + " fallback entry");',
    '      if (fallbackProof.exists && fallbackProof.actualStat !== null && fallbackProof.actualStat.isFile()) return url.pathToFileURL(entry).href;',
    '    }',
    '  }',
    '  return null;',
    '}',
    'async function resolveHost(specifier, context, nextResolve) {',
    '  if (specifier === TARGET) return checkHostResolvedResult(STRICT_ROOT, { url: ANCHOR, shortCircuit: true }, specifier);',
    '  if (specifier === "js-yaml" && YAML !== null) return checkHostResolvedResult(STRICT_ROOT, { url: YAML, shortCircuit: true }, specifier);',
    '  const scoped = specifier.startsWith(SCOPE + "/") ? scopedEntry(specifier) : null;',
    '  if (scoped !== null) return checkHostResolvedResult(STRICT_ROOT, { url: scoped, shortCircuit: true }, specifier);',
    '  return checkHostResolvedResult(STRICT_ROOT, await nextResolve(specifier, context), specifier);',
    '}',
    'export async function resolve(specifier, context, nextResolve) {',
    '  if (isHostSpecifier(specifier)) return resolveHost(specifier, context, nextResolve);',
    '  return nextResolve(specifier, context);',
    '}',
  ]
  return lines.join(String.fromCharCode(10))
}

const registeredRoots = new Set()

export async function registerHostDeps() {
  const strictRoot = explicitInstallRoot()
  if (registeredRoots.has(strictRoot)) return
  const anchor = findHostAnchor(strictRoot)
  const scopedNodeModules = []
  let dir = anchor.nodeModules
  for (let i = 0; i < 6 && dir !== dirname(dir); i += 1) {
    assertWithinRoot(strictRoot, dir, 'scoped node_modules')
    const proof = proveCandidate(strictRoot, dir, 'scoped node_modules')
    if (!proof.exists || proof.actualStat === null || !proof.actualStat.isDirectory()) break
    scopedNodeModules.push(dir)
    const parent = dirname(dir)
    if (!isWithinRoot(strictRoot, parent)) break
    dir = parent
  }
  const resolveScoped = (specifier) => {
    for (const root of scopedNodeModules) {
      const entry = scopedEntryOf(root, specifier, strictRoot)
      if (entry !== null) return assertWithinRoot(strictRoot, entry, specifier)
    }
    return null
  }
  const resolveBare = () => {
    for (const root of scopedNodeModules) {
      const entry = entryOf(join(root, 'js-yaml', 'package.json'), '.', strictRoot)
      if (entry !== null) return assertWithinRoot(strictRoot, entry, 'js-yaml')
    }
    return null
  }
  const yamlEntry = resolveBare()
  const resolveOne = (specifier, nextResolve, context) => {
    if (isHostSpecifier(specifier)) {
      if (specifier === TARGET) return checkHostResolvedResult(strictRoot, { url: pathToFileURL(anchor.entry).href, shortCircuit: true }, specifier)
      if (specifier === 'js-yaml') {
        if (yamlEntry !== null) return checkHostResolvedResult(strictRoot, { url: pathToFileURL(yamlEntry).href, shortCircuit: true }, specifier)
        throw new Error('[host-deps] 显式安装根内缺少 Host 依赖: js-yaml')
      }
      const scoped = resolveScoped(specifier)
      if (scoped !== null) return checkHostResolvedResult(strictRoot, { url: pathToFileURL(scoped).href, shortCircuit: true }, specifier)
      return checkHostResolvedResult(strictRoot, nextResolve(specifier, context), specifier)
    }
    return nextResolve(specifier, context)
  }
  try {
    if (typeof module.registerHooks === 'function') {
      module.registerHooks({ resolve(specifier, context, nextResolve) { return resolveOne(specifier, nextResolve, context) } })
    } else if (typeof module.register === 'function') {
      const hookSource = buildAsyncHookSource({
        target: TARGET,
        anchor: pathToFileURL(anchor.entry).href,
        yaml: yamlEntry === null ? null : pathToFileURL(yamlEntry).href,
        roots: scopedNodeModules,
        strictRoot,
      })
      module.register('data:text/javascript;base64,' + Buffer.from(hookSource, 'utf8').toString('base64'), import.meta.url)
    } else {
      throw new Error('[host-deps] 当前 Node 既无 module.registerHooks 也无 module.register（需 Node >= 20.6），无法注册宿主解析钩子')
    }
    registeredRoots.add(strictRoot)
    console.log('[host-deps] 实际宿主版本: ' + anchor.version + '（' + anchor.manifest + '）')
  } catch (error) {
    throw error
  }
}
