// desktop profile 旧 settings 行清理脚本（任务2 / G2）。
// 作用：删除 desktop profile patch 中旧的顶层 preset-extra-plan 块与 @local settings 行，
// 只保留唯一规范 settings 行（id: dsh-extra-plan-settings / name: dsh-extra-plan/settings）。
// 纪律：先备份（打印路径/SHA-256/行数）→ 删除 → 三项复核 + gateWords 与十项取值比对；
// 任一不满足立即用备份回滚并以非 0 退出。幂等：已无旧内容时输出「已是唯一规范行，无需清理」并退出 0。
// 用法：node pe-test/tools/清理desktop旧settings行.mjs [--file <profile>] [--backup-root <dir>] [--dry-run]
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = fileURLToPath(new URL('../..', import.meta.url))
const LEGACY_SERVICE_NAME = '@local/dsh-extra-plan/settings'
const CANONICAL_SERVICE_NAME = 'dsh-extra-plan/settings'
const SETTINGS_ROW_ID = 'dsh-extra-plan-settings'
const LEGACY_PRESET_ID = 'preset-extra-plan'
const IDEMPOTENT_LINE = '已是唯一规范行，无需清理'
const BACKUP_PREFIX = 'backup-dsh-extra-plan-desktop-旧settings行-'

function sha256(buffer) {
  return createHash('sha256').update(buffer).digest('hex')
}

function stamp(date = new Date()) {
  const pad = (value) => String(value).padStart(2, '0')
  return String(date.getFullYear()) + pad(date.getMonth() + 1) + pad(date.getDate()) + pad(date.getHours()) + pad(date.getMinutes()) + pad(date.getSeconds())
}

function parseArgs(argv) {
  const options = { file: undefined, backupRoot: undefined, dryRun: false }
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]
    if (arg === '--dry-run') options.dryRun = true
    else if (arg === '--file') { options.file = argv[index + 1]; index += 1 }
    else if (arg.startsWith('--file=')) options.file = arg.slice('--file='.length)
    else if (arg === '--backup-root') { options.backupRoot = argv[index + 1]; index += 1 }
    else if (arg.startsWith('--backup-root=')) options.backupRoot = arg.slice('--backup-root='.length)
    else if (arg === '--help' || arg === '-h') {
      console.log('用法：node pe-test/tools/清理desktop旧settings行.mjs [--file <profile>] [--backup-root <dir>] [--dry-run]')
      process.exit(0)
    } else throw new Error('未知参数：' + arg)
  }
  if (options.file !== undefined && typeof options.file !== 'string') throw new Error('--file 需要路径')
  if (options.file === 'undefined') throw new Error('--file 需要路径')
  return options
}

// 逐行扫描并记录每行起始偏移，删除时用偏移切片，完整保留换行风格与字节。
function scan(text) {
  const lines = []
  const starts = []
  let start = 0
  let index = 0
  while (index < text.length) {
    if (text[index] === '\n') {
      let end = index
      if (end > start && text[end - 1] === '\r') end -= 1
      lines.push(text.slice(start, end))
      starts.push(start)
      start = index + 1
    }
    index += 1
  }
  if (start < text.length) {
    lines.push(text.slice(start))
    starts.push(start)
  }
  return { lines, starts }
}

const TOP_ID_PATTERN = /^-\s+id\s*:\s*(?:"([^"]*)"|'([^']*)'|([^\s#]+))/

function parseTopId(line) {
  const match = TOP_ID_PATTERN.exec(line)
  if (!match) return null
  if (match[1] !== undefined) return match[1]
  if (match[2] !== undefined) return match[2]
  return match[3]
}

function indentOf(line) {
  const match = /^\s*/.exec(line)
  return match === null ? 0 : match[0].length
}

function unquote(value) {
  const trimmed = String(value).trim()
  if (trimmed.length >= 2) {
    const first = trimmed[0]
    const last = trimmed[trimmed.length - 1]
    if ((first === '"' && last === '"') || (first === "'" && last === "'")) return trimmed.slice(1, -1)
  }
  return trimmed
}

// 顶层条目 = 行首无缩进的 - id: 行；块范围为 [start, 下一个顶层条目 start)。
function topLevelBlocks(lines) {
  const blocks = []
  let current = null
  for (let index = 0; index < lines.length; index += 1) {
    const id = parseTopId(lines[index])
    if (id === null) continue
    if (current !== null) {
      current.end = index
      blocks.push(current)
    }
    current = { id, start: index, end: lines.length }
  }
  if (current !== null) {
    current.end = lines.length
    blocks.push(current)
  }
  return blocks
}

function blockName(lines, block) {
  const baseIndent = indentOf(lines[block.start])
  for (let index = block.start + 1; index < block.end; index += 1) {
    const line = lines[index]
    if (indentOf(line) !== baseIndent + 2) continue
    const match = /^\s*name\s*:\s*(.*)$/.exec(line)
    if (match) return unquote(match[1])
  }
  return ''
}

// 只做文本片段解析：取 config 下的标量键值（十项取值）与 gateWords 七键，不做完整 YAML 解析。
function parseBlockConfig(lines, block) {
  let configIndent = null
  let cursor = block.start + 1
  for (; cursor < block.end; cursor += 1) {
    const match = /^(\s*)config\s*:\s*$/.exec(lines[cursor])
    if (match) {
      configIndent = match[1].length
      cursor += 1
      break
    }
  }
  if (configIndent === null) return { scalars: [], gateWords: [], error: '块内无 config 段' }
  const scalars = []
  const gateWords = []
  let inGateWords = false
  for (; cursor < block.end; cursor += 1) {
    const line = lines[cursor]
    if (/^\s*$/.test(line)) continue
    const indent = indentOf(line)
    if (indent <= configIndent) break
    const match = /^\s*([A-Za-z_][\w-]*)\s*:\s*(.*)$/.exec(line)
    if (!match) continue
    const key = match[1]
    const value = match[2].trim()
    if (indent === configIndent + 2) {
      if (key === 'gateWords' && value === '') {
        inGateWords = true
        continue
      }
      inGateWords = false
      scalars.push([key, value])
    } else if (inGateWords && indent === configIndent + 4) {
      gateWords.push([key, value])
    }
  }
  return { scalars, gateWords, error: null }
}

function readCanonicalValues(content) {
  const scanned = scan(content)
  const lines = scanned.lines
  const rows = topLevelBlocks(lines).filter((block) => block.id === SETTINGS_ROW_ID && blockName(lines, block) === CANONICAL_SERVICE_NAME)
  if (rows.length !== 1) return { scalars: [], gateWords: [], error: '规范 settings 块数量 = ' + rows.length }
  return parseBlockConfig(lines, rows[0])
}

function review(content) {
  const scanned = scan(content)
  const lines = scanned.lines
  const blocks = topLevelBlocks(lines)
  const settingsRows = blocks.filter((block) => block.id === SETTINGS_ROW_ID)
  const rowCountOk = settingsRows.length === 1
  const nameValue = settingsRows.length === 1 ? blockName(lines, settingsRows[0]) : ''
  const nameOk = nameValue === CANONICAL_SERVICE_NAME
  const residual = []
  if (content.includes('@local')) residual.push('@local')
  if (content.includes(LEGACY_PRESET_ID)) residual.push(LEGACY_PRESET_ID)
  const residualOk = residual.length === 0
  return {
    rowCount: settingsRows.length,
    rowLine: settingsRows.length === 1 ? settingsRows[0].start + 1 : null,
    nameValue,
    rowCountOk,
    nameOk,
    residual,
    residualOk,
    allOk: rowCountOk && nameOk && residualOk,
  }
}

function printReview(checked) {
  console.log('复核1 剩余顶层 - id: ' + SETTINGS_ROW_ID + ' 行数 = ' + checked.rowCount + '（要求 = 1）：' + (checked.rowCountOk ? '通过' : '不通过') + (checked.rowLine === null ? '' : '（第 ' + checked.rowLine + ' 行）'))
  console.log('复核2 该行 name = ' + checked.nameValue + '（要求 = ' + CANONICAL_SERVICE_NAME + '）：' + (checked.nameOk ? '通过' : '不通过'))
  console.log('复核3 全文不含 @local 与 preset-extra-plan：' + (checked.residualOk ? '通过' : '不通过（残留：' + checked.residual.join(', ') + '）'))
}

function valueBrief(value) {
  if (value.length <= 48) return value
  return value.slice(0, 32) + '…(sha256:' + sha256(Buffer.from(value, 'utf8')).slice(0, 8) + ')'
}

function pairsText(pairs) {
  return pairs.map((pair) => pair[0] + '=' + valueBrief(pair[1])).join(', ')
}

function sameValueSets(before, after) {
  const beforeGate = JSON.stringify(before.gateWords)
  const afterGate = JSON.stringify(after.gateWords)
  const beforeScalars = JSON.stringify(before.scalars)
  const afterScalars = JSON.stringify(after.scalars)
  return {
    gateWordsSame: before.gateWords.length === 7 && after.gateWords.length === 7 && beforeGate === afterGate,
    scalarsSame: before.scalars.length === 10 && after.scalars.length === 10 && beforeScalars === afterScalars,
    beforeGate,
    afterGate,
    beforeScalars,
    afterScalars,
  }
}

function rollback(targetPath, backupBuffer, originalSha) {
  try {
    writeFileSync(targetPath, backupBuffer)
    const restoredSha = sha256(readFileSync(targetPath))
    if (restoredSha === originalSha) {
      console.log('回滚完成：目标已恢复为原始字节（SHA-256 ' + restoredSha + '）')
      return true
    }
    console.error('FAIL  回滚后 SHA-256 不匹配（' + restoredSha + '），需人工按备份恢复')
    return false
  } catch (error) {
    console.error('FAIL  回滚失败：' + (error && error.message ? error.message : String(error)))
    console.error('FAIL  请人工用备份覆盖：' + targetPath)
    return false
  }
}

function run() {
  const options = parseArgs(process.argv.slice(2))
  const dshHome = process.env.DSH_HOME === undefined || process.env.DSH_HOME === '' ? join(homedir(), '.dsh') : process.env.DSH_HOME
  const targetPath = resolve(options.file === undefined ? join(dshHome, 'profiles', 'desktop', 'cordis.patch.yml') : options.file)
  const backupRoot = resolve(options.backupRoot === undefined ? join(ROOT, '.extra-plan') : options.backupRoot)
  console.log('目标 profile：' + targetPath)
  if (!existsSync(targetPath)) {
    console.error('FAIL  目标 profile 不存在：' + targetPath)
    return 1
  }
  const buffer = readFileSync(targetPath)
  const originalSha = sha256(buffer)
  const text = buffer.toString('utf8')
  const scanned = scan(text)
  const lines = scanned.lines
  const starts = scanned.starts
  console.log('原始 SHA-256：' + originalSha)
  console.log('原始行数：' + lines.length)

  const blocks = topLevelBlocks(lines)
  const settingsRows = blocks.filter((block) => block.id === SETTINGS_ROW_ID).map((block) => ({ ...block, name: blockName(lines, block) }))
  const legacyRows = settingsRows.filter((row) => row.name === LEGACY_SERVICE_NAME)
  const legacyPreset = blocks.find((block) => block.id === LEGACY_PRESET_ID)
  const hasLegacyText = text.includes('@local') || text.includes(LEGACY_PRESET_ID)

  if (!hasLegacyText) {
    const current = review(text)
    printReview(current)
    if (!current.allOk) {
      console.error('FAIL  文件已无旧内容，但三项复核不通过，未做任何改动')
      return 1
    }
    console.log(IDEMPOTENT_LINE)
    return 0
  }
  if (legacyRows.length > 1) {
    console.error('FAIL  发现 ' + legacyRows.length + ' 个 name 为 ' + LEGACY_SERVICE_NAME + ' 的 settings 块，需人工确认后再清理')
    return 1
  }
  if (legacyRows.length === 0) {
    console.error('FAIL  存在旧内容，但定位不到 name 为 ' + LEGACY_SERVICE_NAME + ' 的 settings 块')
    return 1
  }
  if (legacyPreset === undefined) {
    console.error('FAIL  存在旧内容，但定位不到顶层 - id: ' + LEGACY_PRESET_ID + ' 行')
    return 1
  }
  const legacyRow = legacyRows[0]
  if (legacyPreset.start > legacyRow.start) {
    console.error('FAIL  顶层 - id: ' + LEGACY_PRESET_ID + ' 行（第 ' + (legacyPreset.start + 1) + ' 行）在 @local settings 块（第 ' + (legacyRow.start + 1) + ' 行）之后，结构异常，需人工确认')
    return 1
  }
  const startIndex = legacyPreset.start
  const endIndex = legacyRow.end
  if (endIndex <= startIndex) {
    console.error('FAIL  删除区间非法：起点 ' + (startIndex + 1) + '，终点（不含）' + (endIndex + 1))
    return 1
  }
  const offsetStart = starts[startIndex]
  const offsetEnd = endIndex < lines.length ? starts[endIndex] : text.length
  const newText = text.slice(0, offsetStart) + text.slice(offsetEnd)
  const removedCount = endIndex - startIndex
  console.log('删除区间：第 ' + (startIndex + 1) + ' 行 ~ 第 ' + endIndex + ' 行（含），共 ' + removedCount + ' 行')
  console.log('  区间首行原文：' + lines[startIndex])
  console.log('  区间末行原文：' + lines[endIndex - 1])
  console.log('  区间后首个保留行：' + (endIndex < lines.length ? '第 ' + (endIndex + 1) + ' 行 → ' + lines[endIndex] : '（到达文件末尾，无保留行）'))
  console.log('删除前行数：' + lines.length + '，删除后行数：' + (lines.length - removedCount))

  const outside = text.slice(0, offsetStart) + text.slice(offsetEnd)
  if (outside.includes('@local')) {
    console.error('FAIL  删除区间之外仍含 @local 字样，复核3 无法满足，已中止（未改动目标文件）')
    return 1
  }
  if (outside.includes(LEGACY_PRESET_ID)) {
    console.error('FAIL  删除区间之外仍含 ' + LEGACY_PRESET_ID + ' 字样，复核3 无法满足，已中止（未改动目标文件）')
    return 1
  }

  const before = readCanonicalValues(text)
  const after = readCanonicalValues(newText)
  if (before.error !== null || after.error !== null) {
    console.error('FAIL  规范 settings 块解析失败：清理前 ' + (before.error === null ? 'ok' : before.error) + '；清理后 ' + (after.error === null ? 'ok' : after.error))
    return 1
  }
  const compare = sameValueSets(before, after)
  console.log('gateWords 七键（清理前）：' + pairsText(before.gateWords))
  console.log('gateWords 七键（清理后）：' + pairsText(after.gateWords))
  console.log('gateWords 七键清理前后完全一致：' + (compare.gateWordsSame ? '通过（7/7）' : '不通过'))
  console.log('十项取值（清理前）：' + pairsText(before.scalars))
  console.log('十项取值（清理后）：' + pairsText(after.scalars))
  console.log('十项取值清理前后完全一致：' + (compare.scalarsSame ? '通过（10/10）' : '不通过'))

  if (!compare.gateWordsSame || !compare.scalarsSame) {
    console.error('FAIL  清理前后取值不一致，已中止（未改动目标文件）')
    return 1
  }

  const preview = review(newText)
  console.log('--- 删除后三项复核（预演）---')
  printReview(preview)
  if (!preview.allOk) {
    console.error('FAIL  预演复核不通过，已中止（未改动目标文件）')
    return 1
  }

  if (options.dryRun) {
    console.log('[dry-run] 未创建备份、未写入目标文件、未改动磁盘')
    return 0
  }

  const backupDir = join(backupRoot, BACKUP_PREFIX + stamp())
  mkdirSync(backupDir, { recursive: true })
  const backupPath = join(backupDir, 'cordis.patch.yml')
  writeFileSync(backupPath, buffer)
  const backupSha = sha256(readFileSync(backupPath))
  console.log('备份路径：' + backupPath)
  console.log('备份 SHA-256：' + backupSha)
  console.log('备份行数：' + lines.length)
  console.log('备份与原始 SHA-256 一致：' + (backupSha === originalSha ? '通过' : '不通过'))
  if (backupSha !== originalSha) {
    console.error('FAIL  备份校验失败，未改动目标文件')
    return 1
  }

  try {
    writeFileSync(targetPath, newText, 'utf8')
  } catch (error) {
    console.error('FAIL  写入目标失败：' + (error && error.message ? error.message : String(error)))
    let currentSha = null
    try { currentSha = sha256(readFileSync(targetPath)) } catch (readError) { currentSha = null }
    if (currentSha === originalSha) {
      console.log('目标文件未被改动（SHA-256 仍为原值），无需回滚')
      return 1
    }
    rollback(targetPath, buffer, originalSha)
    return 1
  }

  const writtenText = readFileSync(targetPath, 'utf8')
  const writtenSha = sha256(readFileSync(targetPath))
  const written = review(writtenText)
  console.log('--- 删除后三项复核（实文件）---')
  printReview(written)
  const writtenAfter = readCanonicalValues(writtenText)
  const writtenCompare = writtenAfter.error === null ? sameValueSets(before, writtenAfter) : { gateWordsSame: false, scalarsSame: false }
  console.log('实文件 gateWords 与十项取值仍与清理前一致：' + (writtenCompare.gateWordsSame && writtenCompare.scalarsSame ? '通过' : '不通过'))
  console.log('写入后 SHA-256：' + writtenSha + '（行数 ' + scan(writtenText).lines.length + '）')

  if (!written.allOk || !writtenCompare.gateWordsSame || !writtenCompare.scalarsSame) {
    console.error('FAIL  实文件复核不通过，开始用备份回滚')
    rollback(targetPath, buffer, originalSha)
    return 1
  }
  console.log('清理完成：只保留唯一规范 settings 行')
  return 0
}

try {
  process.exitCode = run()
} catch (error) {
  console.error('FAIL  脚本异常：' + (error && error.stack ? error.stack : String(error)))
  process.exitCode = 1
}
