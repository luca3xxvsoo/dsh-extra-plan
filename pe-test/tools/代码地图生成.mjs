#!/usr/bin/env node
// 代码地图生成.mjs — dsh-extra-plan 代码地图增量同步脚本
// 用法：node pe-test/tools/代码地图生成.mjs [--roots <dir1,dir2>] [--map <path>]
// 原则：地图文件的「功能描述」由 AI/人维护；本脚本只增量同步结构（行号/增删行），
//       绝不覆盖已有描述。匹配键 = 文件路径 + 函数名。
import { readFileSync, writeFileSync, existsSync, readdirSync, statSync, mkdirSync } from 'node:fs'
import { join, resolve, relative, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

// ---------- 常量与参数 ----------
const NL = String.fromCharCode(10)
const CR = String.fromCharCode(13)
const BS = String.fromCharCode(92)
const args = process.argv.slice(2)
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
    i += 1
  }
  return chars.join('')
}
function findEndLine(lines, masked, startIdx) {
  const n = lines.length
  let braceStart = -1
  for (let li = startIdx; li < n; li += 1) {
    const pos = masked[li].indexOf('{')
    if (pos !== -1) { braceStart = li; break }
  }
  if (braceStart === -1) return startIdx + 1
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

// ---------- 函数提取（正则零反斜杠：空白用 [ \t]，词字符用 [A-Za-z0-9_$]） ----------
const KEYWORDS = new Set(['if', 'for', 'while', 'switch', 'catch', 'return', 'function', 'do', 'else', 'try', 'export', 'await'])
const WS = ' \t'
const RE_SETS = [
  { kind: 'function', re: new RegExp('^(?:export[' + WS + ']+)?(?:async[' + WS + ']+)?function[' + WS + ']+([A-Za-z_$][A-Za-z0-9_$]*)[' + WS + ']*\\(', 'gm') },
  { kind: 'function(indent2)', re: new RegExp('^  (?:async[' + WS + ']+)?function[' + WS + ']+([A-Za-z_$][A-Za-z0-9_$]*)[' + WS + ']*\\(', 'gm') },
  { kind: 'const', re: new RegExp('^(?:export[' + WS + ']+)?(?:  )?const[' + WS + ']+([A-Za-z_$][A-Za-z0-9_$]*)[' + WS + ']*=[' + WS + ']*(?:async[' + WS + ']+)?(?:\\(|function|[A-Za-z_$][A-Za-z0-9_$]*[' + WS + ']*=>)', 'gm') },
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
  for (const h of uniq) h.endLine = findEndLine(lines, maskedLines, h.line - 1)
  return uniq
}

// ---------- 读取/解析已有地图 ----------
function parseOldMap(text) {
  const byKey = new Map()
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
        byKey.set(cells[1] + '|' + cells[2], { desc: cells[4] || '', note: cells[5] || '', oldRange: cells[3] })
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

// ---------- 渲染 ----------
const now = new Date().toISOString().slice(0, 19).replace('T', ' ')
function renderMd({ funcs, fileRows }) {
  const L = []
  L.push('# 代码地图（dsh-extra-plan）')
  L.push('')
  L.push('> **维护分工**：行号区间/增删行由脚本 node pe-test/tools/代码地图生成.mjs 增量同步；**功能描述与备注由 AI/人维护**（脚本刷新不会覆盖）。')
  L.push('> **用法**：AI 定位功能时先在此表按关键词检索函数名/描述，再 read 目标行号区间；函数描述为空（待补充）时请补写。')
  L.push('> 上次同步：' + now + '（脚本自动更新时间戳行）')
  L.push('')
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
const old = parseOldMap(existsSync(MAP_PATH) ? readFileSync(MAP_PATH, 'utf8') : '')
const report = []
const funcs = []
for (const file of srcFiles) {
  const rel = relative(PROJECT_ROOT, file).split(BS).join('/')
  const text = readFileSync(file, 'utf8')
  const extracted = extractFunctions(text)
  for (const e of extracted) {
    const key = rel + '|' + e.name
    const prev = old.byKey.get(key)
    const rangeR = e.line === e.endLine ? 'L' + e.line : 'L' + e.line + '-' + e.endLine
    funcs.push({
      path: rel, name: e.name, startLine: e.line, endLine: e.endLine,
      desc: prev !== undefined ? prev.desc : '',
      note: prev !== undefined ? prev.note : '',
    })
    if (prev === undefined) report.push('[新增] ' + rel + ' ' + e.name + ' L' + e.line + ' 描述待补充')
    else if (prev.oldRange !== rangeR) report.push('[行号] ' + rel + ' ' + e.name + ' ' + prev.oldRange + ' -> ' + rangeR)
  }
}
for (const [key, v] of old.byKey) {
  const sp = key.indexOf('|')
  const path = key.slice(0, sp)
  const name = key.slice(sp + 1)
  if (!funcs.some((f) => f.path === path && f.name === name)) {
    report.push('[删除] ' + path + ' ' + name + '（旧 ' + v.oldRange + (v.desc ? '，旧描述：' + v.desc.slice(0, 60) : '') + '）')
  }
}
const fileRows = []
for (const file of srcFiles) {
  const rel = relative(PROJECT_ROOT, file).split(BS).join('/')
  const lines = readFileSync(file, 'utf8').split(NL).length
  fileRows.push({ path: rel, lines, desc: old.fileDesc.get(rel) || '' })
}
funcs.sort((a, b) => a.path === b.path ? a.startLine - b.startLine : (a.path < b.path ? -1 : 1))
fileRows.sort((a, b) => a.path < b.path ? -1 : 1)

const out = renderMd({ funcs, fileRows })
mkdirSync(dirname(MAP_PATH), { recursive: true })
writeFileSync(MAP_PATH, out, 'utf8')
console.log('[OK] ' + MAP_PATH)
console.log('文件 ' + srcFiles.length + ' 个；函数条目 ' + funcs.length + ' 个')
if (report.length === 0) console.log('[无结构变化]')
for (const r of report) console.log(r)