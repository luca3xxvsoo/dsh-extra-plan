import * as fs from 'node:fs'
import * as path from 'node:path'

const nativePath = process.platform === 'win32' ? path.win32 : path.posix
const isWindows = process.platform === 'win32'
const realpathSync = typeof fs.realpathSync.native === 'function' ? fs.realpathSync.native : fs.realpathSync

function preloadError(code, message, details = {}) {
  const error = new Error('[host-preload:' + code + '] ' + message)
  error.code = code
  error.details = Object.freeze({ ...details })
  return error
}

function isAbsolute(value) {
  if (isWindows) return /^[A-Za-z]:[\\/]/.test(value) || /^\\\\/.test(value)
  return value.startsWith('/')
}

function explicitInstallRoot() {
  const raw = process.env.DSH_INSTALL_ROOT
  if (typeof raw !== 'string' || raw.length === 0 || raw.trim() === '' || raw !== raw.trim()) {
    throw preloadError('ROOT_REQUIRED', '必须显式提供 DSH_INSTALL_ROOT；不回退 profile、家目录或临时目录')
  }
  if (raw.includes(String.fromCharCode(0))) throw preloadError('ROOT_INVALID', 'DSH_INSTALL_ROOT 含 NUL')
  if (/(?:%[A-Za-z_][A-Za-z0-9_]*%)/.test(raw) || /(?:^|[\\/])\$(?:\{[A-Za-z_][A-Za-z0-9_]*\}|[A-Za-z_][A-Za-z0-9_]*)/.test(raw) || raw.startsWith('~')) {
    throw preloadError('ROOT_INVALID', 'DSH_INSTALL_ROOT 不接受变量或家目录缩写')
  }
  if (/^[A-Za-z]:[^\\/]/.test(raw)) throw preloadError('ROOT_INVALID', 'DSH_INSTALL_ROOT 拒绝 drive-relative 路径')
  if (/^[A-Za-z][A-Za-z0-9+.-]*:/.test(raw) && !/^[A-Za-z]:[\\/]/.test(raw)) {
    throw preloadError('ROOT_INVALID', 'DSH_INSTALL_ROOT 拒绝URI/协议路径')
  }
  if (!isAbsolute(raw) || (isWindows && !/^[A-Za-z]:[\\/]/.test(raw) && !/^\\\\/.test(raw))) {
    throw preloadError('ROOT_INVALID', 'DSH_INSTALL_ROOT 必须是明确绝对路径')
  }
  const normalized = nativePath.normalize(raw)
  let realRoot
  try {
    realRoot = realpathSync(normalized)
  } catch (error) {
    throw preloadError('ROOT_UNAVAILABLE', 'DSH_INSTALL_ROOT 不存在或不可解析', { root: normalized, cause: error.code || String(error) })
  }
  let stat
  try { stat = fs.statSync(realRoot) } catch (error) { throw preloadError('ROOT_UNAVAILABLE', 'DSH_INSTALL_ROOT 不可读取', { root: realRoot, cause: error.code || String(error) }) }
  if (!stat.isDirectory()) throw preloadError('ROOT_NOT_DIRECTORY', 'DSH_INSTALL_ROOT 必须是目录', { root: realRoot })
  return realRoot
}

export const DSH_INSTALL_ROOT = explicitInstallRoot()
process.env.DSH_INSTALL_ROOT = DSH_INSTALL_ROOT
const { registerHostDeps } = await import('./host-deps.mjs')
await registerHostDeps()
