// _shared/session-finder.mjs — 取证工具会话定位（step-04/05/06/08 共用）
// 无参（auto）：全量扫描 DSH_HOME/sessions 下所有工作区会话目录（目录名 <uuid> 或 session-<uuid> 均按目录名处理），
//   顶层候选 = 首行 session 事件无 parentSession 字段的会话，按 session.jsonl.zstd mtime 倒序（mtime 相同时按目录名升序稳定化），
//   对候选依次全文解码做 includes(MARKER)，首个命中即主会话（免全库全文解码）；
//   子会话 = 全部会话中首行 parentSession 精确等于主会话目录名的目录，按 zstd mtime 升序。
// 显式传参（explicit）：会话目录名全库精确匹配（实测目录名全库唯一）；
//   含分隔符路径校验该目录下 session.jsonl.zstd 存在；
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

function readMeta(dir) {
  // 解码第一帧读首行 JSON（首行必然在第一个 zstd 帧内），取 parentSession。
  const buf = fs.readFileSync(path.join(dir, 'session.jsonl.zstd'))
  const frames = framesOf(buf)
  const text = frames.length > 0 ? decodeText(buf, frames[0]) : ''
  const first = text.split('\n').map((l) => l.trim()).find((l) => l !== '')
  if (!first) return {}
  try { return JSON.parse(first) } catch { return {} }
}

function scanAll() {
  // 遍历 SESSIONS 下所有工作区目录，收集所有含 session.jsonl.zstd 的会话目录。
  const out = []
  if (!fs.existsSync(SESSIONS)) return out
  for (const ws of fs.readdirSync(SESSIONS)) {
    const wsPath = path.join(SESSIONS, ws)
    let st
    try { st = fs.statSync(wsPath) } catch { continue }
    if (!st.isDirectory()) continue
    for (const name of fs.readdirSync(wsPath)) {
      const dir = path.join(wsPath, name)
      if (!fs.existsSync(path.join(dir, 'session.jsonl.zstd'))) continue
      let mtimeMs = 0
      try { mtimeMs = fs.statSync(path.join(dir, 'session.jsonl.zstd')).mtimeMs } catch {}
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
    if (fs.existsSync(path.join(abs, 'session.jsonl.zstd'))) {
      return { kind: 'explicit', base: path.dirname(abs), dirs: [path.basename(abs)] }
    }
    let st
    try { st = fs.statSync(abs) } catch {}
    if (st && st.isDirectory()) {
      const dirs = fs.readdirSync(abs).filter((d) => fs.existsSync(path.join(abs, d, 'session.jsonl.zstd')))
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
    const buf = fs.readFileSync(path.join(cand.dir, 'session.jsonl.zstd'))
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
