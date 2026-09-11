// _shared/session-finder.mjs — 取证工具会话定位（step-04/05/06/08 共用）
// 无参（auto）：全量扫描 DSH_HOME/sessions 下所有工作区会话目录（目录名 <uuid> 或 session-<uuid> 均按目录名处理），
//   顶层候选 = 首行 session 事件无 parentSession 字段的会话，按会话日志文件（SESSION_LOG_NAMES 两代候选：session.v3.jsonl.zstd / session.jsonl.zstd）mtime 倒序（mtime 相同时按目录名升序稳定化），
//   对候选依次全文解码做 includes(MARKER)，首个命中即主会话（免全库全文解码）；
//   子会话 = 全部会话中首行 parentSession 精确等于主会话目录名的目录，按 zstd mtime 升序。
// 显式传参（explicit）：会话目录名全库精确匹配（实测目录名全库唯一）；
//   含分隔符路径校验该目录下会话日志文件（SESSION_LOG_NAMES 两代候选）存在；
//   工作区目录（自身无 zstd、但子目录含 zstd）返回该工作区全部会话目录；
//   均不匹配返回 kind:'notfound'。
// 说明：首行解析失败的会话按「无 parentSession」处理（兜底）；不使用 agentPreset 字段预筛（实测全库同名无法区分模式）。
import fs from 'node:fs'
import path from 'node:path'
import { homedir } from 'node:os'
import { framesOf, decodeText } from './zstd-frames.mjs'

const DSH_HOME = (process.env.DSH_HOME || homedir() + '/.dsh').replaceAll('\\', '/')
const SESSIONS = DSH_HOME + '/sessions'
const MARKER = '按需规划模式'

// 会话日志文件名两代并存（显式候选数组、不用代际正则——避免静默吞掉未来代际编号）：
//   'session.v3.jsonl.zstd' = DSH 0.1.5-rc.2（SESSION_FORMAT_VERSION 3；sessionFormatLogFilename(3)+compressionSuffix(zstd)）
//   'session.jsonl.zstd'   = DSH 0.1.2-rc.1 及更早（旧命名，COMPAT 保留）
// 删除条件：生产整体切到 0.1.5-rc.2 且不再回放旧日志；删除动作：删数组第二项；删除判据：旧名不再被引用。
// 新版宿主 dsh-session-persistence-jsonl 的 listSessionDirs() 对旧平铺布局抛 legacyLayout（0.1.5-rc.2 内 L3273/L3294，
// 方法定义 L3327）；本工具自实现目录遍历、不调用宿主 listSessionDirs，不受该抛错影响——按候选名逐项探测，存在即用。
const SESSION_LOG_NAMES = ['session.v3.jsonl.zstd', 'session.jsonl.zstd']

export function logPath(dir) {
  for (const name of SESSION_LOG_NAMES) {
    const p = path.join(dir, name)
    if (fs.existsSync(p)) return p
  }
  return null
}

function readMeta(dir) {
  // 解码第一帧读首行 JSON（首行必然在第一个 zstd 帧内），取 parentSession。
  const p = logPath(dir); if (!p) return {}; const buf = fs.readFileSync(p)
  const frames = framesOf(buf)
  const text = frames.length > 0 ? decodeText(buf, frames[0]) : ''
  const first = text.split('\n').map((l) => l.trim()).find((l) => l !== '')
  if (!first) return {}
  try { return JSON.parse(first) } catch { return {} }
}

function scanAll() {
  // 遍历 SESSIONS 下所有工作区目录，收集所有含会话日志文件（SESSION_LOG_NAMES 两代候选）的会话目录。
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
