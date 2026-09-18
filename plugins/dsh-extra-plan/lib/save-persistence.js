import { mkdirSync, readFileSync, writeFileSync, renameSync, readdirSync, existsSync, unlinkSync } from 'node:fs'
import { join } from 'node:path'

// 公共原子落盘（save_plan 双写 / save_probe 单写共用）：mkdir → 逐条写 tmp →
// journal（新形状 {entries:[{tmp,file}]}）→ 逐条 rename → 清 journal；任一步
// 失败先清 journal（尽力而为）再抛错。tmp 后缀沿用现有 .tmp-${process.pid}-${Date.now()}。
// sessionTag（可选，T3）：写入方会话标识段（sessionTagOf），随 journal 落盘供
// recoverJournals 按会话过滤；'' / 缺省时不写该字段（save_probe 单写保持旧形状）。
export function atomicCommit(dir, base, files, sessionTag) {
  mkdirSync(dir, { recursive: true })
  const suffix = `.tmp-${process.pid}-${Date.now()}`
  const journal = join(dir, `.journal-${base}.json`)
  const entries = files.map((f) => ({ tmp: join(dir, f.name + suffix), file: join(dir, f.name) }))
  const record = { ...(typeof sessionTag === 'string' && sessionTag !== '' ? { session: sessionTag } : {}), entries }
  try {
    for (let i = 0; i < files.length; i += 1) writeFileSync(entries[i].tmp, files[i].content, 'utf8')
    writeFileSync(journal, JSON.stringify(record), 'utf8')
    for (const e of entries) renameSync(e.tmp, e.file)
    unlinkSync(journal)
  } catch (error) {
    try { unlinkSync(journal) } catch (error2) { /* 清理尽力而为 */ }
    throw error
  }
}

// journal 崩溃自愈：新形状 entries 逐条补完 rename；旧形状（planTmp/checkTmp/
// planFile/checkFile）保持原逻辑；恢复失败 console.warn 且继续。
// sessionTag（可选，T3）：save_plan 传入自己的会话标识段，跳过「内嵌了其它会话标识」
// 的 journal 残留（同秒 base 撞名防护的另一半：不同调用方互不补完对方的半成品）；
// 无标识的历史残留（旧形状、手工夹具）与 save_probe 的单写保持原恢复语义。
export function recoverJournals(dir, sessionTag) {
  let names = []
  try { names = readdirSync(dir) } catch (error) { return }
  if (!names.some((name) => name.startsWith('.journal-'))) return
  for (const entry of names) {
    if (!entry.startsWith('.journal-') || !entry.endsWith('.json')) continue
    const file = join(dir, entry)
    try {
      const record = JSON.parse(readFileSync(file, 'utf8'))
      if (record !== null && typeof record === 'object'
          && typeof sessionTag === 'string' && sessionTag !== ''
          && typeof record.session === 'string' && record.session !== '' && record.session !== sessionTag) continue
      if (record !== null && typeof record === 'object') {
        if (Array.isArray(record.entries)) {
          for (const item of record.entries) {
            if (item !== null && typeof item === 'object' && typeof item.tmp === 'string' && typeof item.file === 'string' && existsSync(item.tmp)) renameSync(item.tmp, item.file)
          }
        } else {
          if (typeof record.planTmp === 'string' && typeof record.planFile === 'string' && existsSync(record.planTmp)) renameSync(record.planTmp, record.planFile)
          if (typeof record.checkTmp === 'string' && typeof record.checkFile === 'string' && existsSync(record.checkTmp)) renameSync(record.checkTmp, record.checkFile)
        }
      }
      unlinkSync(file)
    } catch (error) {
      console.warn(`extra-plan: save_plan journal recovery failed for ${file}: ${error instanceof Error ? error.message : String(error)}`)
    }
  }
}
