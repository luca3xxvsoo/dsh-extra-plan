import { mkdirSync, readFileSync, writeFileSync, renameSync, readdirSync, existsSync, unlinkSync } from 'node:fs'
import { join } from 'node:path'

// atomicCommit/recoverJournals 使用冻结的默认 fs 操作；测试只可注入指定操作，
// 合并覆盖时总是创建新对象，避免夹具修改共享默认值。
const DEFAULT_FS_OPS = Object.freeze({ mkdirSync, readFileSync, writeFileSync, renameSync, readdirSync, existsSync, unlinkSync })

function fsOpsOf(overrides) {
  if (overrides === null || overrides === undefined || typeof overrides !== 'object') return DEFAULT_FS_OPS
  return { ...DEFAULT_FS_OPS, ...overrides }
}

// 原子提交顺序：mkdir → tmp → journal（entries: [{ tmp, file }]) → rename →
// 确认每个目标 → 清 journal。journal 写入成功前按确认结果条件清理；
// journal 写入成功后任何失败都保留 journal 与现场，清理失败不遮盖原始错误。
// 提供 sessionTag 时恢复按其过滤；fsOps 仅用于测试注入。
export function atomicCommit(dir, base, files, sessionTag, fsOps) {
  const ops = fsOpsOf(fsOps)
  ops.mkdirSync(dir, { recursive: true })
  const suffix = `.tmp-${process.pid}-${Date.now()}`
  const journal = join(dir, `.journal-${base}.json`)
  const entries = files.map((f) => ({ tmp: join(dir, f.name + suffix), file: join(dir, f.name) }))
  const record = { session: typeof sessionTag === 'string' && sessionTag !== '' ? sessionTag : 'unknown', entries }
  let journalWritten = false
  try {
    for (let i = 0; i < files.length; i += 1) ops.writeFileSync(entries[i].tmp, files[i].content, 'utf8')
    ops.writeFileSync(journal, JSON.stringify(record), 'utf8')
    journalWritten = true
    for (const e of entries) ops.renameSync(e.tmp, e.file)
    for (const e of entries) {
      if (!ops.existsSync(e.file)) throw new Error(`atomicCommit: 目标文件未就位（保留 journal 与现场待恢复）：${e.file}`)
    }
    ops.unlinkSync(journal)
  } catch (error) {
    if (journalWritten) throw error // post-journal：保留 journal/目标/tmp，绝不删恢复入口
    // pre-journal：条件清理。journal 写入抛错前可能已实际落盘，故先尝试删除再以 existsSync 确认。
    let journalGone = false
    try {
      try { ops.unlinkSync(journal) } catch (cleanupError) { /* 可能本就不存在，交由存在性确认 */ }
      journalGone = ops.existsSync(journal) !== true
    } catch (verifyError) { journalGone = false }
    if (journalGone) {
      for (const e of entries) { try { ops.unlinkSync(e.tmp) } catch (cleanupError) { /* tmp 清理尽力而为 */ } }
    }
    throw error // 原始错误优先，清理错误不覆盖
  }
}

// journal 只接受当前形状：非空 entries 列表，每项为 {tmp,file}。
// 旧形状或任何非法记录均告警并原样保留，不再提供历史恢复分支。
function recoveryTargetsOf(record) {
  if (record === null || typeof record !== 'object') throw new Error('journal 记录不是对象')
  if (!Array.isArray(record.entries) || record.entries.length === 0) throw new Error('journal 不是当前 entries 形状，保留现场')
  return record.entries.map((item) => {
    if (item === null || typeof item !== 'object' || typeof item.tmp !== 'string' || item.tmp === '' || typeof item.file !== 'string' || item.file === '') {
      throw new Error('journal entries 条目形状非法（每项须为 {tmp,file} 非空字符串）')
    }
    return { tmp: item.tmp, file: item.file }
  })
}

// 恢复只接受当前非空 entries 形状；每项先将存在的 tmp rename 到目标，再确认目标存在。
// 任一项缺失或失败就保留对应 journal，其它 journal 继续处理；sessionTag 过滤归属，fsOps 仅供测试注入。
export function recoverJournals(dir, sessionTag, fsOps) {
  const ops = fsOpsOf(fsOps)
  let names = []
  try { names = ops.readdirSync(dir) } catch (error) { return }
  if (!names.some((name) => name.startsWith('.journal-'))) return
  for (const entry of names) {
    if (!entry.startsWith('.journal-') || !entry.endsWith('.json')) continue
    const file = join(dir, entry)
    try {
      const record = JSON.parse(ops.readFileSync(file, 'utf8'))
      if (typeof sessionTag === 'string' && sessionTag !== ''
          && (record === null || typeof record !== 'object' || record.session !== sessionTag)) continue
      for (const item of recoveryTargetsOf(record)) {
        if (ops.existsSync(item.tmp)) ops.renameSync(item.tmp, item.file)
        if (!ops.existsSync(item.file)) throw new Error(`目标文件未就位（保留 journal 待后续恢复）：${item.file}`)
      }
      ops.unlinkSync(file)
    } catch (error) {
      console.warn(`extra-plan: save_plan journal recovery failed for ${file}: ${error instanceof Error ? error.message : String(error)}`)
    }
  }
}
