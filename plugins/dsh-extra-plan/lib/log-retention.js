import { createReadStream, createWriteStream, existsSync, readdirSync, renameSync, statSync, unlinkSync } from 'node:fs'
import { createInterface } from 'node:readline'
import { join } from 'node:path'
import { resolveHostPath, prepareWriteTarget } from './path-policy.js'

// 诊断日志保留期裁剪：只处理 <host 根>/logs/dsh-extra-plan 下的 .jsonl 诊断日志，
// 删除 ts 早于保留窗口的行（滚动 48 小时），避免追加型诊断日志（尤其 extra-plan-anchored.jsonl）无限增长。
// 不处理 usage-ledger：该文件由 lib/usage-ledger.js 的 startupArchive 归档链路自行管理。
// 判据保守：空行/解析失败/ts 缺失或非法的行一律保留；无过期行时零写且不留临时文件。
export const LOG_DIRECTORY = 'logs/dsh-extra-plan'
export const LOG_RETENTION_MS = 172800000
export const EXCLUDED_LOG_FILES = Object.freeze(['extra-plan-usage-ledger.jsonl'])
const PURPOSE = 'diagnostics'
const NEWLINE = String.fromCharCode(10)

function parsedTsOf(line) {
  const text = typeof line === 'string' ? line.trim() : ''
  if (text === '') return null
  let row
  try { row = JSON.parse(text) } catch { return null }
  if (row === null || typeof row !== 'object') return null
  const ts = row.ts
  if (typeof ts !== 'string') return null
  const value = Date.parse(ts)
  return Number.isNaN(value) ? null : value
}

// Windows 上 rename 覆盖要求目标文件不再被任何句柄持有，故读流必须显式关闭并等待 close。
function closeInput(input) {
  return new Promise((resolve) => {
    if (input.closed === true) {
      resolve()
      return
    }
    input.once('close', () => resolve())
    input.destroy()
  })
}

async function scanHasExpired(filePath, cutoffMs) {
  const input = createReadStream(filePath, { encoding: 'utf8' })
  const reader = createInterface({ input, crlfDelay: Infinity })
  try {
    for await (const line of reader) {
      const ts = parsedTsOf(line)
      if (ts !== null && ts < cutoffMs) return true
    }
    return false
  } finally {
    reader.close()
    input.destroy()
  }
}

async function rewriteWithoutExpired(filePath, tmpPath, cutoffMs, pathContext) {
  const tmpTarget = resolveHostPath(pathContext, tmpPath, { purpose: PURPOSE })
  prepareWriteTarget(pathContext, tmpTarget, { expectedType: 'file', purpose: PURPOSE })
  const input = createReadStream(filePath, { encoding: 'utf8' })
  const writer = createWriteStream(tmpTarget.path, { encoding: 'utf8' })
  const reader = createInterface({ input, crlfDelay: Infinity })
  let removed = 0
  try {
    for await (const line of reader) {
      const ts = parsedTsOf(line)
      if (ts !== null && ts < cutoffMs) {
        removed += 1
        continue
      }
      writer.write(line + NEWLINE)
    }
    await new Promise((resolve, reject) => {
      writer.once('error', reject)
      writer.once('close', resolve)
      writer.end()
    })
    await closeInput(input)
    renameSync(tmpTarget.path, filePath)
    return removed
  } catch (error) {
    try { reader.close() } catch {}
    try { input.destroy() } catch {}
    try { writer.destroy() } catch {}
    try { unlinkSync(tmpTarget.path) } catch {}
    throw error
  }
}

export async function pruneDiagnosticLogs(pathContext, options = {}) {
  const settings = options !== null && typeof options === 'object' ? options : {}
  const retentionMs = Number.isFinite(settings.retentionMs) ? settings.retentionMs : LOG_RETENTION_MS
  const now = Number.isFinite(settings.now) ? settings.now : Date.now()
  const cutoffMs = now - retentionMs
  const root = pathContext !== null && typeof pathContext === 'object' ? pathContext.hostDataRoot : null
  if (typeof root !== 'string' || root === '') return { status: 'skipped', reason: 'no-host-root', retentionMs }
  const dirTarget = resolveHostPath(pathContext, LOG_DIRECTORY, { purpose: PURPOSE })
  if (!existsSync(dirTarget.path)) return { status: 'skipped', reason: 'no-log-directory', retentionMs }
  prepareWriteTarget(pathContext, dirTarget, { expectedType: 'directory', purpose: PURPOSE })
  const names = readdirSync(dirTarget.path).filter((name) => {
    if (!name.endsWith('.jsonl')) return false
    if (EXCLUDED_LOG_FILES.includes(name)) return false
    try { return statSync(join(dirTarget.path, name)).isFile() } catch { return false }
  }).sort()
  let pruned = 0
  let removedRows = 0
  for (const name of names) {
    const filePath = join(dirTarget.path, name)
    if (!(await scanHasExpired(filePath, cutoffMs))) continue
    const tmpPath = join(dirTarget.path, name + '.prune-tmp-' + String(process.pid) + '-' + String(Date.now()))
    removedRows += await rewriteWithoutExpired(filePath, tmpPath, cutoffMs, pathContext)
    pruned += 1
  }
  return { status: pruned > 0 ? 'pruned' : 'up-to-date', scanned: names.length, pruned, removedRows, retentionMs }
}
