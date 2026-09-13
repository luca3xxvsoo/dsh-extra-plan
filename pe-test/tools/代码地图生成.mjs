#!/usr/bin/env node
// 代码地图生成.mjs — dsh-extra-plan 代码地图增量同步脚本
// 用法：node pe-test/tools/代码地图生成.mjs [--roots <dir1,dir2>] [--map <path>] [--strict]
// --strict：存在「未接受的疑似漏检」时以非 0 退出（供自检/CI 调用）
// --check ：不写盘；地图与代码不一致（[新增]/[行号]/[删除]）或存在漏检/导航失效 → 非 0 退出（一键体检用）
// 原则：地图文件的「功能描述」由 AI/人维护；本脚本只增量同步结构（行号/增删行），
//       绝不覆盖已有描述。匹配键 = 文件路径 + 函数名 + 出现顺序（同名函数各占一行，按文件内出现顺序配对；
//       旧地图若同名行数不一致，多出的报 [新增]、未消费的报 [删除]，并输出 [同名] 提示要求复核）。
import { readFileSync, writeFileSync, existsSync, readdirSync, statSync, mkdirSync } from 'node:fs'
import { join, resolve, relative, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

// ---------- 常量与参数 ----------
const NL = String.fromCharCode(10)
const CR = String.fromCharCode(13)
const BS = String.fromCharCode(92)
// 正则字面量识别：/ 之前的「有效前字符」∈ 该集合，或前一个词 ∈ 关键字集合 → 视作正则起始
const REGEX_BEFORE_CHARS = new Set(['(', ',', '=', ':', '[', '!', '&', '|', '?', '{', '}', ';', '+', '-', '*', '%', '<', '>', '^', '~'])
const REGEX_BEFORE_WORDS = new Set(['return', 'typeof', 'case', 'in', 'of', 'do', 'else', 'yield', 'await', 'void', 'delete', 'new', 'instanceof', 'default'])
// 定义区间收尾判据：无花括号表达式的后续行若「以语句关键字开头或为 } 」→ 属于下一条语句，不算本定义
const STATEMENT_START_RE = /^(?:const|let|var|return|console|await|if|for|while|try|throw|export|import|function|class|switch|do|break|continue)\b/
const CONTINUATION_CHARS = '&|+-*/%.,=?:<>('
const args = process.argv.slice(2)
const STRICT = args.indexOf('--strict') !== -1
const CHECK = args.indexOf('--check') !== -1
const parseArg = (name, fallback) => {
  const i = args.indexOf(name)
  return i !== -1 && i + 1 < args.length ? args[i + 1] : fallback
}
const ROOTS = (parseArg('--roots', 'plugins') || 'plugins').split(',').map((s) => s.trim()).filter(Boolean)
const PROJECT_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..')
const MAP_PATH = resolve(PROJECT_ROOT, parseArg('--map', 'pe-test/docs/ai-代码地图.md') || 'pe-test/docs/ai-代码地图.md')

// ---------- 源码文件收集 ----------
const SKIP_DIRS = new Set(['node_modules', '.git', '.extra-plan'])
function collectJsFiles(dir, out) {
  let names = []
  try { names = readdirSync(dir) } catch { return out }
  for (const name of names) {
    const p = join(dir, name)
    let st
    try { st = statSync(p) } catch { continue }
    if (st.isDirectory()) {
      if (!SKIP_DIRS.has(name) && !name.startsWith('backup-')) collectJsFiles(p, out)
    } else if (name.endsWith('.js') || name.endsWith('.mjs')) {
      out.push(p)
    }
  }
  return out
}
const srcFiles = []
for (const r of ROOTS) collectJsFiles(resolve(PROJECT_ROOT, r), srcFiles)
srcFiles.sort()

// ---------- 括号配对（遮罩字符串与注释后） ----------
function maskCode(text) {
  const chars = text.split('')
  const n = chars.length
  let i = 0
  const blank = (a, b) => { for (let k = a; k <= b && k < n; k += 1) if (chars[k] !== NL && chars[k] !== CR) chars[k] = ' ' }
  while (i < n) {
    const ch = chars[i]
    if (ch === '"' || ch === "'" || ch === String.fromCharCode(96)) {
      const q = ch; let j = i + 1
      while (j < n) { if (chars[j] === BS) { j += 2; continue } if (chars[j] === q) break; j += 1 }
      blank(i, j < n ? j : n - 1)
      i = j < n ? j + 1 : n
      continue
    }
    if (ch === '/' && i + 1 < n && chars[i + 1] === '/') {
      let j = i; while (j < n && chars[j] !== NL) j += 1
      blank(i, j - 1); i = j; continue
    }
    if (ch === '/' && i + 1 < n && chars[i + 1] === '*') {
      let j = i + 2
      while (j + 1 < n && !(chars[j] === '*' && chars[j + 1] === '/')) j += 1
      blank(i, j + 1 < n ? j + 1 : n - 1); i = j + 2; continue
    }
    // 正则字面量：不识别时，正则里的引号（如 /'/g）会被当成字符串起始，一路吞到文件末尾，
    // 把其后所有 { } 遮蔽掉 → 区间判定整体失效（实测 preset-settings.js 自 L307 起、heal.js 自某行起全被误遮蔽）。
    if (ch === '/') {
      let k = i - 1
      while (k >= 0 && (chars[k] === ' ' || chars[k] === '\t' || chars[k] === NL || chars[k] === CR)) k -= 1
      let regexOk = k < 0
      if (!regexOk) {
        const prev = chars[k]
        if (REGEX_BEFORE_CHARS.has(prev)) regexOk = true
        else if (/[A-Za-z0-9_$]/.test(prev)) {
          const e = k
          while (k >= 0 && /[A-Za-z0-9_$]/.test(chars[k])) k -= 1
          regexOk = REGEX_BEFORE_WORDS.has(chars.slice(k + 1, e + 1).join(''))
        }
      }
      if (regexOk) {
        let j = i + 1
        let inClass = false
        while (j < n) {
          const c = text[j]
          if (c === BS) { j += 2; continue }
          if (c === NL || c === CR) break
          if (inClass) { if (c === ']') inClass = false }
          else if (c === '[') inClass = true
          else if (c === '/') break
          j += 1
        }
        if (j < n && text[j] === '/') { blank(i, j); i = j + 1; continue }
      }
    }
    i += 1
  }
  return chars.join('')
}
function braceEndLine(lines, masked, braceStart) {
  const n = lines.length
  let depth = 0
  for (let li = braceStart; li < n; li += 1) {
    const line = masked[li]
    for (let ci = 0; ci < line.length; ci += 1) {
      const ch = line[ci]
      if (ch === '{') depth += 1
      else if (ch === '}') { depth -= 1; if (depth === 0) return li + 1 }
    }
  }
  return n
}
// 定义区间收尾：优先「定义语句自身的语句终结符」（顶层 ; ——括号/方括号深度 0），
// 其次「定义语句自身的顶层 {」→ 走括号配平（父函数内嵌子函数时不会被下一函数的行号截断），
// 两者在下一函数起始行之前都没出现（如无分号的多行箭头）→ 收尾到「下一函数行 − 1」。
// limitIdx：下一个函数定义的起始行索引（0-based）；无下一函数时传 lines.length。
function isStatementStart(line) {
  const t = line.replace(/^[ \t]+/, '')
  if (t === '') return false
  if (t[0] === '}') return true
  return STATEMENT_START_RE.test(t)
}
function findEndLine(lines, masked, startIdx, limitIdx) {
  const n = lines.length
  const rawLimit = typeof limitIdx === 'number' ? limitIdx : n
  const limit = Math.max(startIdx + 1, Math.min(rawLimit, n))
  let braceStart = -1
  let semiLine = -1
  let lastOpen = -1 // 最后一个「属于本表达式」的行：无花括号表达式的收尾依据
  let paren = 0
  let bracket = 0
  let prevCont = false
  for (let li = startIdx; li < limit; li += 1) {
    const line = masked[li]
    if (li > startIdx && paren === 0 && bracket === 0 && !prevCont && isStatementStart(line)) break
    let touched = false
    for (let ci = 0; ci < line.length; ci += 1) {
      const ch = line[ci]
      if (paren === 0 && bracket === 0 && ch === '{') { braceStart = li; break }
      if (paren === 0 && bracket === 0 && ch === ';') { semiLine = li; break }
      if (ch === '(') { paren += 1; touched = true }
      else if (ch === ')') { paren -= 1; touched = true }
      else if (ch === '[') { bracket += 1; touched = true }
      else if (ch === ']') { bracket -= 1; touched = true }
    }
    if (touched || prevCont) lastOpen = li
    // 续行判定必须用「原始行」：遮罩会把字符串字面量变成尾部空格，=== 'x' 会被误看成以 = 结尾
    const orig = typeof lines[li] === 'string' ? lines[li].replace(/[ \t]+$/, '') : ''
    prevCont = orig !== '' && CONTINUATION_CHARS.indexOf(orig[orig.length - 1]) !== -1
    if (braceStart !== -1 || semiLine !== -1) break
  }
  if (braceStart !== -1 && (semiLine === -1 || braceStart < semiLine)) return braceEndLine(lines, masked, braceStart)
  if (semiLine !== -1) return semiLine + 1
  if (lastOpen !== -1) return lastOpen + 1
  return startIdx + 1
}

// ---------- 函数提取（正则零反斜杠：空白用 [ \t]，词字符用 [A-Za-z0-9_$]） ----------
const KEYWORDS = new Set(['if', 'for', 'while', 'switch', 'catch', 'return', 'function', 'do', 'else', 'try', 'export', 'await'])
const WS = ' \t'
const RE_SETS = [
  // 口径 = 「一切名字绑定到函数体的定义」，任意缩进（与反向计数器同口径，不再需要任何例外清单）。
  { kind: 'function', re: new RegExp('^[' + WS + ']*(?:export[' + WS + ']+)?(?:async[' + WS + ']+)?function[' + WS + ']+([A-Za-z_$][A-Za-z0-9_$]*)[' + WS + ']*\\(', 'gm') },
  // 形态收紧：RHS 必须是 function / (…) => / name =>（原先只看 '=' 后是不是 '('，会把 const base = (a?b:c)+d 误当函数）
  { kind: 'const', re: new RegExp('^[' + WS + ']*(?:export[' + WS + ']+)?(?:const|let|var)[' + WS + ']+([A-Za-z_$][A-Za-z0-9_$]*)[' + WS + ']*=[' + WS + ']*(?:async[' + WS + ']+)?(?:function[' + WS + '(]|\\(.*\\)[' + WS + ']*=>|[A-Za-z_$][A-Za-z0-9_$]*[' + WS + ']*=>)', 'gm') },
  { kind: 'class', re: new RegExp('^(?:export[' + WS + ']+)?(?:  )?class[' + WS + ']+([A-Za-z_$][A-Za-z0-9_$]*)', 'gm') },
  { kind: 'method', re: new RegExp('^([A-Za-z_$][A-Za-z0-9_$]*)[' + WS + ']*\\([^)]*\\)[' + WS + ']*\\{', 'gm') },
]
function extractFunctions(text) {
  const lines = text.split(NL)
  const maskedLines = maskCode(text).split(NL)
  const hits = []
  const addHit = (name, lineIdx, kind) => {
    if (name === undefined || name === '') return
    if (kind === 'method' && KEYWORDS.has(name)) return
    hits.push({ name, line: lineIdx + 1, kind })
  }
  for (const { kind, re } of RE_SETS) {
    re.lastIndex = 0
    let m
    while ((m = re.exec(text)) !== null) {
      const lineNo = text.slice(0, m.index).split(NL).length
      addHit(m[1], lineNo - 1, kind)
    }
  }
  const seen = new Set()
  hits.sort((a, b) => a.line - b.line)
  const uniq = []
  for (const h of hits) {
    const key = h.line + '|' + h.name
    if (seen.has(key)) continue
    seen.add(key)
    uniq.push(h)
  }
  for (let i = 0; i < uniq.length; i += 1) {
    const h = uniq[i]
    const next = uniq[i + 1]
    h.endLine = findEndLine(lines, maskedLines, h.line - 1, next !== undefined ? next.line - 1 : lines.length)
  }
  return uniq
}

// ---------- 反向计数校验（宽特征独立数一遍，抓「静默漏检」） ----------
// 与抽取器不同：任意缩进都算、只认「名字绑定」形态（function NAME / const|let|var NAME = (…)=> | = function），
// 因此调用回调（.map((x) => …)）与括号表达式（const x = (a ? b : c) + d）不会误报。
const DEF_FN_LINE = /^[ \t]*(?:export[ \t]+)?(?:async[ \t]+)?function[ \t]+([A-Za-z_$][A-Za-z0-9_$]*)[ \t]*\(/
const DEF_CONST_LINE = /^[ \t]*(?:export[ \t]+)?(?:const|let|var)[ \t]+([A-Za-z_$][A-Za-z0-9_$]*)[ \t]*=[ \t]*(?:async[ \t]+)?(?:(?:\(.*\)|[A-Za-z_$][A-Za-z0-9_$]*)[ \t]*=>|function[ \t(])/
function collectDefCandidates(text) {
  const found = []
  const lines = maskCode(text).split(NL)
  for (let i = 0; i < lines.length; i += 1) {
    const m = DEF_FN_LINE.exec(lines[i]) || DEF_CONST_LINE.exec(lines[i])
    if (m !== null) found.push({ name: m[1], line: i + 1 })
  }
  return found
}

// ---------- 读取/解析已有地图 ----------
function parseOldMap(text) {
  const byKey = new Map() // key = 文件路径|函数名 → 行数组（同名函数按地图内出现顺序存，逐个配对）
  const fileDesc = new Map()
  if (!text.includes('| 文件 | 函数 | 行号 | 功能描述 | 备注 |')) return { byKey, fileDesc, hasTable: false }
  let inFuncTable = false
  let inFileTable = false
  for (const line of text.split(NL)) {
    if (line === '| 文件 | 函数 | 行号 | 功能描述 | 备注 |') { inFuncTable = true; inFileTable = false; continue }
    if (line === '| 文件 | 行数 | 说明 |') { inFileTable = true; inFuncTable = false; continue }
    if (!line.startsWith('|')) { inFuncTable = false; inFileTable = false; continue }
    if (inFuncTable) {
      const cells = line.split('|').map((s) => s.trim())
      if (cells.length >= 6 && cells[1] && cells[2] && !cells[1].startsWith(':')) {
        const key = cells[1] + '|' + cells[2]
        const row = { desc: cells[4] || '', note: cells[5] || '', oldRange: cells[3] }
        const list = byKey.get(key)
        if (list === undefined) byKey.set(key, [row])
        else list.push(row)
      }
      continue
    }
    if (inFileTable) {
      const cells = line.split('|').map((s) => s.trim())
      if (cells.length >= 4 && cells[1] && !cells[1].startsWith(':')) fileDesc.set(cells[1], cells[3] || '')
    }
  }
  return { byKey, fileDesc, hasTable: true }
}

// ---------- 人工保留段（意图速查） ----------
// 脚本只生成 文件总览 / 函数索引；「## 意图速查」整节由人工维护，生成时原样带过（否则每次生成都会被抹掉）。
const KEEP_SECTION = '## 意图速查'
function extractKeepSection(text) {
  const lines = String(text === undefined || text === null ? '' : text).split(NL)
  const out = []
  let inKeep = false
  for (const line of lines) {
    if (line.startsWith(KEEP_SECTION)) { inKeep = true; out.push(line); continue }
    if (inKeep) {
      if (line.startsWith('## ')) break
      out.push(line)
    }
  }
  while (out.length > 0 && out[out.length - 1].trim() === '') out.pop()
  return out
}
// 从人工段的表格里取「函数名」列（允许顿号/逗号/斜杠分隔的多个名字），用于存在性校验。
function extractNavRefs(sectionLines) {
  const refs = []
  for (const line of sectionLines) {
    if (!line.startsWith('|')) continue
    const cells = line.split('|').map((s) => s.trim())
    if (cells.length < 5) continue
    const names = cells[3]
    if (names === '' || names === '函数名' || names.startsWith(':')) continue
    for (const part of names.split(/[、,，/]/)) {
      const name = part.trim()
      if (name !== '') refs.push(name)
    }
  }
  return refs
}

// ---------- 渲染 ----------
// 本地时间（原用 toISOString() 取的是 UTC，表内时间会比文件 mtime 早 8 小时）
const pad2 = (v) => String(v).padStart(2, '0')
const nowDate = new Date()
const now = nowDate.getFullYear() + '-' + pad2(nowDate.getMonth() + 1) + '-' + pad2(nowDate.getDate()) + ' ' +
  pad2(nowDate.getHours()) + ':' + pad2(nowDate.getMinutes()) + ':' + pad2(nowDate.getSeconds())
function renderMd({ funcs, fileRows, keepLines }) {
  const L = []
  L.push('# 代码地图（dsh-extra-plan）')
  L.push('')
  L.push('> **维护分工**：行号区间/增删行由脚本 node pe-test/tools/代码地图生成.mjs 增量同步；**功能描述、备注、以及「意图速查」整节由 AI/人维护**（脚本刷新不会覆盖）。')
  L.push('> **用法**：先看「意图速查」按意图词找函数名 → 再到「函数索引」按函数名取行号区间 → read 该区间。')
  L.push('> 上次同步：' + now + '（脚本自动更新时间戳行）')
  L.push('')
  if (keepLines !== undefined && keepLines.length > 0) {
    for (const k of keepLines) L.push(k)
    L.push('')
  }
  L.push('## 文件总览')
  L.push('')
  L.push('| 文件 | 行数 | 说明 |')
  L.push('|:--|--:|:--|')
  for (const r of fileRows) L.push('| ' + r.path + ' | ' + r.lines + ' | ' + (r.desc || '（待补充）') + ' |')
  L.push('')
  L.push('## 函数索引')
  L.push('')
  L.push('| 文件 | 函数 | 行号 | 功能描述 | 备注 |')
  L.push('|:--|:--|:--|:--|:--|')
  for (const f of funcs) {
    const range = f.startLine === f.endLine ? 'L' + f.startLine : 'L' + f.startLine + '-' + f.endLine
    L.push('| ' + f.path + ' | ' + f.name + ' | ' + range + ' | ' + (f.desc || '（待补充）') + ' | ' + (f.note || '') + ' |')
  }
  L.push('')
  L.push('---')
  L.push('')
  L.push('*本文件由脚本增量维护；直接编辑功能描述/备注列是安全的。*')
  return L.join(NL) + NL
}

// ---------- 主流程 ----------
const oldText = existsSync(MAP_PATH) ? readFileSync(MAP_PATH, 'utf8') : ''
const old = parseOldMap(oldText)
const keepLines = extractKeepSection(oldText)
const report = [] // 结构变化 + 未接受漏检（影响 --strict、影响 [无结构变化] 判定）
const notices = [] // 每次可见的常驻提示（同名配对、已接受漏检）：不影响 --strict
const missed = [] // 未接受的疑似漏检（--strict 下导致退出码 1）
const funcs = []
const consumed = new Map() // key -> 已与旧行配对的次数（同名函数按出现顺序逐个配对）
const sameNameReported = new Set()
for (const file of srcFiles) {
  const rel = relative(PROJECT_ROOT, file).split(BS).join('/')
  const text = readFileSync(file, 'utf8')
  const extracted = extractFunctions(text)
  // 反向计数校验：命中定义特征却没进索引的，报 [疑似漏检]（静默漏检 → 显式报告）
  const extractedNames = new Set()
  for (const e of extracted) extractedNames.add(e.name)
  for (const c of collectDefCandidates(text)) {
    if (extractedNames.has(c.name)) continue
    missed.push({ rel, name: c.name, line: c.line })
    report.push('[疑似漏检] ' + rel + ' ' + c.name + ' L' + c.line + '（与抽取器同口径仍漏 → 抽取器实现层问题：查遮罩/配平/去重）')
  }
  const nameCount = new Map()
  for (const e of extracted) nameCount.set(e.name, (nameCount.get(e.name) || 0) + 1)
  for (const e of extracted) {
    const key = rel + '|' + e.name
    const list = old.byKey.get(key) || []
    const idx = consumed.get(key) || 0
    consumed.set(key, idx + 1)
    const prev = list[idx]
    const rangeR = e.line === e.endLine ? 'L' + e.line : 'L' + e.line + '-' + e.endLine
    funcs.push({
      path: rel, name: e.name, startLine: e.line, endLine: e.endLine,
      desc: prev !== undefined ? prev.desc : '',
      note: prev !== undefined ? prev.note : '',
    })
    if (prev === undefined) report.push('[新增] ' + rel + ' ' + e.name + ' L' + e.line + ' 描述待补充')
    else if (prev.oldRange !== rangeR) report.push('[行号] ' + rel + ' ' + e.name + ' ' + prev.oldRange + ' -> ' + rangeR)
    if (Math.max(list.length, nameCount.get(e.name) || 0) > 1 && list.length !== (nameCount.get(e.name) || 0) && !sameNameReported.has(key)) {
      sameNameReported.add(key)
      notices.push('[同名] ' + rel + ' ' + e.name + ' ×' + Math.max(list.length, nameCount.get(e.name) || 0) + '（旧 ' + (list.map((r) => r.oldRange).join(' / ') || '无') + '；描述按出现顺序配对，请复核）')
    }
  }
}
for (const [key, list] of old.byKey) {
  const sp = key.indexOf('|')
  const path = key.slice(0, sp)
  const name = key.slice(sp + 1)
  const usedCount = consumed.get(key) || 0
  for (let i = 0; i < list.length; i += 1) {
    if (i < usedCount) continue
    const v = list[i]
    report.push('[删除] ' + path + ' ' + name + '（旧 ' + v.oldRange + (v.desc ? '，旧描述：' + v.desc.slice(0, 60) : '') + '）')
  }
}
const fileRows = []
for (const file of srcFiles) {
  const rel = relative(PROJECT_ROOT, file).split(BS).join('/')
  // 行数 = 真实行数：以换行结尾的文件 split(NL) 会多出一个空尾项，需去掉；不以换行结尾的按 split 计数即为真实行数。
  const raw = readFileSync(file, 'utf8')
  const lines = raw.endsWith(NL) ? raw.split(NL).length - 1 : raw.split(NL).length
  fileRows.push({ path: rel, lines, desc: old.fileDesc.get(rel) || '' })
}
funcs.sort((a, b) => a.path === b.path ? a.startLine - b.startLine : (a.path < b.path ? -1 : 1))
fileRows.sort((a, b) => a.path < b.path ? -1 : 1)

// 导航校验：「意图速查」节引用的函数名必须真实存在于索引（函数改名/删除后必须同步该节，否则报 [导航失效]）
const knownNames = new Set(funcs.map((f) => f.name))
for (const name of extractNavRefs(keepLines)) {
  if (!knownNames.has(name)) report.push('[导航失效] 意图速查节引用的函数不在索引里：' + name + '（函数改名/删除后请同步该节）')
}

const out = renderMd({ funcs, fileRows, keepLines })
if (CHECK) {
  console.log('[检查模式] 不写盘（--check）：仅比对地图与代码')
} else {
  mkdirSync(dirname(MAP_PATH), { recursive: true })
  writeFileSync(MAP_PATH, out, 'utf8')
  console.log('[OK] ' + MAP_PATH)
}
console.log('文件 ' + srcFiles.length + ' 个；函数条目 ' + funcs.length + ' 个')
if (report.length === 0) console.log('[无结构变化]')
for (const r of report) console.log(r)
for (const n of notices) console.log(n)
if (missed.length > 0) {
  console.log('[疑似漏检合计] ' + missed.length + ' 条：' + missed.map((m) => m.rel + ' ' + m.name + ' L' + m.line).join('；'))
}
if (CHECK) {
  if (report.length > 0 || missed.length > 0) {
    console.log('[检查模式] 地图与代码不一致或存在问题（见上）→ 退出码 1；请运行 node pe-test/tools/代码地图生成.mjs 同步，并按提示处理漏检/导航失效')
    process.exitCode = 1
  } else {
    console.log('[检查模式] 地图与代码一致，无漏检、无导航失效')
  }
} else if (missed.length > 0 && STRICT) {
  console.log('[严格模式] 未接受的疑似漏检 ' + missed.length + ' 条 → 退出码 1')
  process.exitCode = 1
} else if (missed.length > 0) {
  console.log('[提示] 未接受的疑似漏检 ' + missed.length + ' 条在 --strict 下会导致退出码 1')
}