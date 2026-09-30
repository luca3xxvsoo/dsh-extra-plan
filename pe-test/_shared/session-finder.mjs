// step-04/05/06/08 共用的 session 定位器。auto 模式扫描工作区会话目录，
// 按稳定日志 mtime 选择无 parentSession 的 marker 命中，再按 parentSession 返回直接子会话。
// explicit 模式要求目录/路径精确匹配，否则返回 notfound；首行 malformed 时 fail-open 视为无 parentSession，
// 不使用 agentPreset 预过滤。
import fs from 'node:fs'
import path from 'node:path'
import { homedir } from 'node:os'
import { framesOf, decodeText } from './zstd-frames.mjs'

const DSH_HOME = (process.env.DSH_HOME || homedir() + '/.dsh').replaceAll('\\', '/')
const SESSIONS = DSH_HOME + '/sessions'
const MARKER = '按需规划模式'

// 日志名是显式兼容集合而非生成正则，不会静默消费未知未来名称；定位器负责遍历目录并逐候选探测。
const SESSION_LOG_NAMES = ['session.v4.jsonl.zstd', 'session.v3.jsonl.zstd', 'session.jsonl.zstd']

export function logPath(dir) {
  for (const name of SESSION_LOG_NAMES) {
    const p = path.join(dir, name)
    if (fs.existsSync(p)) return p
  }
  return null
}

function readMeta(dir) {
  // 解码第一帧读首行 JSON（首行必然在第一个 zstd 帧内），取 parentSession。
  // 有界分块读：从 64 KB 起步按 ×4 渐进放大，读到含完整帧 0 的最小范围为止；
  // 渐块读到头仍无完整帧时回退全文件读取——与旧全文件语义等价（framesOf 只返回完整帧）。
  const p = logPath(dir); if (!p) return {}
  const fd = fs.openSync(p, 'r')
  try {
    const total = fs.fstatSync(fd).size
    let size = 65536
    while (true) {
      const buf = Buffer.alloc(Math.min(size, total))
      const n = fs.readSync(fd, buf, 0, buf.length, 0)
      const frames = framesOf(buf.subarray(0, n))
      if (frames.length > 0) {
        const text = decodeText(buf, frames[0])
        const first = text.split('\n').map((l) => l.trim()).find((l) => l !== '')
        if (!first) return {}
        try { return JSON.parse(first) } catch { return {} }
      }
      if (n >= total) return {}
      size = Math.min(size * 4, total)
    }
  } finally { fs.closeSync(fd) }
}

function scanAll() {
  // 遍历 SESSIONS 下所有工作区目录，收集所有含会话日志文件（SESSION_LOG_NAMES 三代候选）的会话目录。
  const out = []
  if (!fs.existsSync(SESSIONS)) return out
  for (const ws of fs.readdirSync(SESSIONS)) {
    const wsPath = path.join(SESSIONS, ws)
    let st
    try { st = fs.statSync(wsPath) } catch { continue }
    if (!st.isDirectory()) continue
    for (const name of fs.readdirSync(wsPath)) {
      const dir = path.join(wsPath, name)
      if (!logPath(dir)) continue
      let mtimeMs = 0
      const lp = logPath(dir); try { mtimeMs = fs.statSync(lp).mtimeMs } catch {}
      const meta = readMeta(dir)
      out.push({ workspace: ws, workspacePath: wsPath, name, dir, mtimeMs, parentSession: meta.parentSession })
    }
  }
  return out
}

const byName = (a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0)

export function findSession(explicit) {
  const all = scanAll()
  if (explicit !== undefined && String(explicit) !== '') {
    const arg = String(explicit)
    const norm = arg.replaceAll('\\', '/')
    if (!norm.includes('/')) {
      const hit = all.find((s) => s.name === norm || s.name.replace(/^session-/, '') === norm.replace(/^session-/, ''))
      if (hit) return { kind: 'explicit', base: hit.workspacePath, dirs: [hit.name] }
    }
    const abs = path.resolve(arg)
    if (logPath(abs)) {
      return { kind: 'explicit', base: path.dirname(abs), dirs: [path.basename(abs)] }
    }
    let st
    try { st = fs.statSync(abs) } catch {}
    if (st && st.isDirectory()) {
      const dirs = fs.readdirSync(abs).filter((d) => logPath(path.join(abs, d)))
      if (dirs.length > 0) return { kind: 'workspace', base: abs, dirs }
    }
    return { kind: 'notfound', arg }
  }
  // SESSION_ID 环境变量（AI 调用通道）：显式指定会话 → 按 ID 精确定位
  // （uuid / session-uuid / 目录名全名三形态兼容；命中主会话则连带其子会话；未命中直接报错不静默回退）。
  const envId = process.env.SESSION_ID
  if (envId !== undefined && String(envId) !== '') {
    const arg = String(envId)
    const norm = arg.replace(/^session-/, '')
    const hit = all.find((s) => s.name === arg || s.name.replace(/^session-/, '') === norm)
    if (hit) {
      const children = all
        .filter((s) => s.parentSession === hit.name)
        .sort((a, b) => a.mtimeMs - b.mtimeMs || byName(a, b))
        .map((s) => s.name)
      return { kind: 'explicit', base: hit.workspacePath, dirs: [hit.name, ...children], bySessionId: true }
    }
    return { kind: 'notfound', arg }
  }
  // auto：顶层候选按 zstd mtime 倒序，首个全文含 MARKER 命中即主会话。
  const top = all
    .filter((s) => s.parentSession === undefined)
    .sort((a, b) => b.mtimeMs - a.mtimeMs || byName(a, b))
  for (const cand of top) {
    const lp = logPath(cand.dir); if (!lp) continue; const buf = fs.readFileSync(lp)
    let text = ''
    for (const f of framesOf(buf)) text += decodeText(buf, f)
    if (text.includes(MARKER)) {
      const children = all
        .filter((s) => s.parentSession === cand.name)
        .sort((a, b) => a.mtimeMs - b.mtimeMs || byName(a, b))
        .map((s) => s.name)
      return { kind: 'auto', workspaceDir: cand.workspace, mainDir: cand.name, dirs: [cand.name, ...children], base: cand.workspacePath }
    }
  }
  return { kind: 'none' }
}
