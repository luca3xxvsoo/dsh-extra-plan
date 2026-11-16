import { createReadStream, createWriteStream, existsSync, readdirSync, renameSync, statSync, unlinkSync } from 'node:fs'
import { createInterface } from 'node:readline'
import { join } from 'node:path'
import { resolveHostPath, prepareWriteTarget } from './path-policy.js'

// 诊断日志保留期裁剪：只处理 <host 根>/logs/dsh-extra-plan 下的 .jsonl 诊断日志。
// 全部诊断 JSONL（usage ledger 除外）统一按固定 UTC+8 北京时间昨日零点裁剪，保留今天/昨天两个自然日。
// 不处理 usage-ledger：该文件由 lib/usage-ledger.js 的 startupArchive 归档链路自行管理。
// 清理算法为前缀边界裁剪：分界线=首个可解析且 cutoff<=ts<=now 的行；不可解析行（空行/坏JSON/无ts/非法ts）与未来时间行（ts>now，时钟过快写入）不作为分界，作为前缀候选随前缀删除。
// 分界线之后原样保留（含坏行与乱序过期行，随保留窗口自然收敛）；零写条件=文件0行或分界为0；全部为前缀候选时清空为空文件。导出面调整见下，cutoff规则单一。
export const LOG_DIRECTORY = 'logs/dsh-extra-plan'
export const EXCLUDED_LOG_FILES = Object.freeze(['extra-plan-usage-ledger.jsonl'])
const DAY_MS = 86400000
const OFFSET_MS = 28800000
const PURPOSE = 'diagnostics'
const NEWLINE = String.fromCharCode(10)

function beijingYesterdayCutoffMs(now) {
  return (Math.floor((now + OFFSET_MS) / DAY_MS) - 1) * DAY_MS - OFFSET_MS
}

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

async function findPrefixBoundary(filePath, cutoffMs, now) {
  const input = createReadStream(filePath, { encoding: 'utf8' })
  const reader = createInterface({ input, crlfDelay: Infinity })
  let lines = 0
  let boundary = null
  try {
    for await (const line of reader) {
      if (boundary === null) {
        const ts = parsedTsOf(line)
        if (ts !== null && ts >= cutoffMs && ts <= now) boundary = lines
      }
      lines += 1
    }
    return { boundary, lines }
  } finally {
    reader.close()
    input.destroy()
  }
}

async function copyFromBoundary(filePath, tmpPath, skipCount, pathContext) {
  const tmpTarget = resolveHostPath(pathContext, tmpPath, { purpose: PURPOSE })
  prepareWriteTarget(pathContext, tmpTarget, { expectedType: 'file', purpose: PURPOSE })
  const input = createReadStream(filePath, { encoding: 'utf8' })
  const writer = createWriteStream(tmpTarget.path, { encoding: 'utf8' })
  const reader = createInterface({ input, crlfDelay: Infinity })
  let skipped = 0
  try {
    for await (const line of reader) {
      if (skipped < skipCount) {
        skipped += 1
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
  const now = Number.isFinite(settings.now) ? settings.now : Date.now()
  const root = pathContext !== null && typeof pathContext === 'object' ? pathContext.hostDataRoot : null
  if (typeof root !== 'string' || root === '') return { status: 'skipped', reason: 'no-host-root' }
  const dirTarget = resolveHostPath(pathContext, LOG_DIRECTORY, { purpose: PURPOSE })
  if (!existsSync(dirTarget.path)) return { status: 'skipped', reason: 'no-log-directory' }
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
    const cutoffMs = beijingYesterdayCutoffMs(now)
    const found = await findPrefixBoundary(filePath, cutoffMs, now)
    if (found.lines === 0 || found.boundary === 0) continue
    const tmpPath = join(dirTarget.path, name + '.prune-tmp-' + String(process.pid) + '-' + String(Date.now()))
    removedRows += found.boundary === null ? found.lines : found.boundary
    await copyFromBoundary(filePath, tmpPath, found.boundary === null ? found.lines : found.boundary, pathContext)
    pruned += 1
  }
  return { status: pruned > 0 ? 'pruned' : 'up-to-date', scanned: names.length, pruned, removedRows }
}
