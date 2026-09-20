import { mkdirSync, readFileSync, writeFileSync, renameSync, readdirSync, existsSync, unlinkSync } from 'node:fs'
import { join } from 'node:path'

// 默认文件系统操作集：冻结只读常量，键名与下方实际调用的同步 node:fs 函数逐一同义。
// 仅作 atomicCommit/recoverJournals 末位可选依赖参数（fsOps）的缺省值；测试传入自己的局部
// 桩对象，未提供的操作项回退到这里（测试只需列出要注入故障的那几项）。默认对象不可就地
// 改写，合并时另建新对象，避免共享默认集被误改造成跨用例污染。
const DEFAULT_FS_OPS = Object.freeze({ mkdirSync, readFileSync, writeFileSync, renameSync, readdirSync, existsSync, unlinkSync })

function fsOpsOf(overrides) {
  if (overrides === null || overrides === undefined || typeof overrides !== 'object') return DEFAULT_FS_OPS
  return { ...DEFAULT_FS_OPS, ...overrides }
}

// 公共原子落盘（save_plan 双写 / save_probe 单写共用）：mkdir → 逐条写 tmp →
// journal（新形状 {entries:[{tmp,file}]}）→ 逐条 rename → 逐项确认目标就位 → 清 journal。
// 阶段感知的不变量：
// ① journal 尚未成功写入（pre-journal）时失败：先删本次可能已部分落盘的 journal 并用
//    existsSync 确认其不存在，确认后才清理本次 tmp；journal 删除失败或删除后仍存在则保留
//    全部 tmp（不制造「journal 存在而 tmp/目标均缺失」的不可续做现场）。
// ② journal 成功写入后（post-journal）的任何失败——任一次 rename、目标确认或 journal 删除
//    失败——一律保留 journal 与现有现场，不再在 catch 中删除恢复入口。
// ③ 只有全部目标 existsSync 确认就位后才尝试删除 journal。
// ④ 任何清理错误都不得覆盖原始错误：对外始终抛原始错误。
// tmp 后缀沿用现有 .tmp-${process.pid}-${Date.now()}。
// sessionTag（可选，T3）：写入方会话标识段（sessionTagOf），随 journal 落盘供
// recoverJournals 按会话过滤；'' / 缺省时不写该字段（save_probe 单写保持旧形状）。
// fsOps（可选，末位）：局部文件系统操作依赖（默认 DEFAULT_FS_OPS），仅供测试注入故障；
// 生产调用（index.js → save-tool-factories.js）不传，语义与拆分前完全一致。
export function atomicCommit(dir, base, files, sessionTag, fsOps) {
  const ops = fsOpsOf(fsOps)
  ops.mkdirSync(dir, { recursive: true })
  const suffix = `.tmp-${process.pid}-${Date.now()}`
  const journal = join(dir, `.journal-${base}.json`)
  const entries = files.map((f) => ({ tmp: join(dir, f.name + suffix), file: join(dir, f.name) }))
  const record = { ...(typeof sessionTag === 'string' && sessionTag !== '' ? { session: sessionTag } : {}), entries }
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

// journal 记录归一为非空恢复目标列表：新形状 entries 与旧形状
// planTmp/checkTmp/planFile/checkFile 两种形状统一成 [{tmp,file}]。
// 字段缺失或形状非法（entries 为空/条目非 {tmp,file} 非空字符串、旧形状字段缺半对、既无
// entries 也无任何旧形状目标）一律抛错，由调用方走既有告警路径并保留 journal——不可解析
// 的记录绝不能被当成「已恢复完成」而删掉恢复入口。
function recoveryTargetsOf(record) {
  if (record === null || typeof record !== 'object') throw new Error('journal 记录不是对象')
  if (Array.isArray(record.entries)) {
    if (record.entries.length === 0) throw new Error('journal entries 为空，无恢复目标')
    return record.entries.map((item) => {
      if (item === null || typeof item !== 'object' || typeof item.tmp !== 'string' || item.tmp === '' || typeof item.file !== 'string' || item.file === '') {
        throw new Error('journal entries 条目形状非法（每项须为 {tmp,file} 非空字符串）')
      }
      return { tmp: item.tmp, file: item.file }
    })
  }
  const targets = []
  for (const [tmpKey, fileKey] of [['planTmp', 'planFile'], ['checkTmp', 'checkFile']]) {
    const tmp = record[tmpKey]
    const target = record[fileKey]
    if (tmp === undefined && target === undefined) continue
    if (typeof tmp !== 'string' || tmp === '' || typeof target !== 'string' || target === '') {
      throw new Error(`journal 旧形状字段不完整（${tmpKey}/${fileKey} 须成对非空字符串）`)
    }
    targets.push({ tmp, file: target })
  }
  if (targets.length === 0) throw new Error('journal 记录无可恢复目标（既无 entries 也无旧形状四字段）')
  return targets
}

// journal 崩溃自愈：新形状 entries 与旧形状（planTmp/checkTmp/planFile/checkFile）逐项恢复。
// 完成判定：每一项「tmp 存在则 rename，随后确认目标文件存在」——已在前一次尝试中完成 rename
// 的项凭目标存在继续（幂等续做），tmp 与目标同时缺失的项视为恢复失败；任一项恢复或确认失败
// 即保留 journal，只有全部项都确认就位才删除该 journal。恢复失败 console.warn 且继续扫描
// 目录内其它 journal（一个 journal 失败不阻断其它 journal）。
// sessionTag（可选，T3）：save_plan 传入自己的会话标识段，跳过「内嵌了其它会话标识」
// 的 journal 残留（同秒 base 撞名防护的另一半：不同调用方互不补完对方的半成品）；
// 无标识的历史残留（旧形状、手工夹具）与 save_probe 的单写保持原恢复语义。
// fsOps（可选，末位）：局部文件系统操作依赖（默认 DEFAULT_FS_OPS），仅供测试注入
// readdir/read/exists/rename/unlink 故障；生产调用不传，语义与拆分前一致。
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
      if (record !== null && typeof record === 'object'
          && typeof sessionTag === 'string' && sessionTag !== ''
          && typeof record.session === 'string' && record.session !== '' && record.session !== sessionTag) continue
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
