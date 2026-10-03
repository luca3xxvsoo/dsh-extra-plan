// run_code 静态解析与理由函数：只接收普通参数，不持有宿主/会话运行时状态。
import { maskCodeLiteralsAndComments, sliceBalancedArgs, collectRunCodeSites, hasDynamicRunCodeAccess } from './run-code-scanner.js'


// run_code 静态写模式扫描黑名单（F7'，自写正则无依赖）：防偶然写；防刻意绕过有限
// （动态 require/Function 构造/编码拼串不覆盖，见风险 R1）。白名单例外=不在黑名单：
// node:fs 只读方法族（readFileSync/readdirSync/statSync/existsSync/accessSync/readFile/
// readdir/stat/access/realpath/lstat 等）天然不命中。
export const RUNCODE_MUTATION_HINTS = [
  { id: 'fs-write', re: /\b(?:writeFileSync|appendFileSync|unlinkSync|rmSync|rmdirSync|mkdirSync|renameSync|copyFileSync|truncateSync|chmodSync|chownSync|symlinkSync|linkSync|mkdtempSync|createWriteStream|watch)\s*\(/ },
  { id: 'fs-promise-write', re: /\b(?:writeFile|appendFile|unlink|rm|rmdir|mkdir|rename|copyFile|truncate|chmod|chown|symlink|link|mkdtemp)\s*\(/ },
  { id: 'child-process-import', re: /(?:require\s*\(\s*['"](?:child_process|node:child_process)['"]\s*\))|(?:from\s+['"](?:child_process|node:child_process)['"])/ },
  { id: 'child-process-call', re: /\b(?:execSync|execFileSync|spawnSync|spawn|execFile|fork)\s*\(/ },
  { id: 'net-http-server', re: /(?:require\s*\(\s*['"](?:net|node:net|http|node:http)['"]\s*\))|(?:from\s+['"](?:net|node:net|http|node:http)['"])|\b(?:createServer|listen)\s*\(/ },
  { id: 'eval-function', re: /\b(?:eval|Function)\s*\(/ },
  { id: 'process-binding', re: /\bprocess\s*\.\s*binding\s*\(/ },
  { id: 'dlopen', re: /\bprocess\s*\.\s*dlopen\s*\(/ },
  { id: 'node-vm', re: /(?:require\s*\(\s*['"]node:vm['"]\s*\))|(?:from\s+['"]node:vm['"])|\b(?:runInThisContext|runInNewContext|runInContext|compileFunction)\s*\(/ },
]

// run_code 的 code 文本提取（exec.arguments.code 字符串；防御非字符串返回 ''）。
export function runCodeTextOf(exec) {
  const args = exec !== null && exec !== undefined ? exec.arguments : undefined
  const code = args !== null && typeof args === 'object' ? args.code : undefined
  return typeof code === 'string' ? code : ''
}

// 静态扫描 code 返回命中的 hint id 列表（去重、按 RUNCODE_MUTATION_HINTS 顺序）。
export function codeMutationHints(code) {
  const text = typeof code === 'string' ? code : ''
  if (text === '') return []
  const hits = []
  for (const hint of RUNCODE_MUTATION_HINTS) {
    if (hint.re.test(text)) hits.push(hint.id)
  }
  return hits
}

// 安全的静态参数字面量子集：先保留 JSON.parse 快路径，再用同一无执行解析器
// 校验重复键、污染键与宽松 JS 对象/数组字面量；失败时由调用方保留原 argsText 走运行时瀑布。
export function parseStaticLiteral(input) {
  const source = typeof input === 'string' ? input.trim() : ''
  if (source === '') return { ok: false, value: undefined }
  let jsonValue
  let jsonParsed = false
  try {
    jsonValue = JSON.parse(source)
    jsonParsed = true
  } catch (error) { /* 继续解析安全 JS literal 子集 */ }

  let index = 0
  const fail = () => { throw new Error('not a static literal') }
  const skipWhitespace = () => {
    while (index < source.length && /\s/.test(source[index])) index += 1
  }
  const isIdentifierStart = (ch) => ch !== undefined && /[A-Za-z_$]/.test(ch)
  const isIdentifierChar = (ch) => ch !== undefined && /[A-Za-z0-9_$]/.test(ch)

  const parseString = () => {
    const quote = source[index]
    if (quote !== "'" && quote !== '"') fail()
    index += 1
    let value = ''
    while (index < source.length) {
      const ch = source[index]
      index += 1
      if (ch === quote) return value
      if (ch === '\n' || ch === '\r') fail()
      if (ch !== '\\') {
        value += ch
        continue
      }
      if (index >= source.length) fail()
      const escaped = source[index]
      index += 1
      if (escaped === 'n') value += '\n'
      else if (escaped === 'r') value += '\r'
      else if (escaped === 't') value += '\t'
      else if (escaped === 'b') value += '\b'
      else if (escaped === 'f') value += '\f'
      else if (escaped === 'v') value += '\v'
      else if (escaped === '0') {
        if (/[0-9]/.test(source[index] || '')) fail()
        value += '\0'
      } else if (escaped === 'u') {
        const hex = source.slice(index, index + 4)
        if (!/^[0-9A-Fa-f]{4}$/.test(hex)) fail()
        value += String.fromCharCode(Number.parseInt(hex, 16))
        index += 4
      } else if (escaped === 'x') {
        const hex = source.slice(index, index + 2)
        if (!/^[0-9A-Fa-f]{2}$/.test(hex)) fail()
        value += String.fromCharCode(Number.parseInt(hex, 16))
        index += 2
      } else if (escaped === '\\' || escaped === '/' || escaped === "'" || escaped === '"') value += escaped
      else fail()
    }
    fail()
  }

  const parseValue = () => {
    skipWhitespace()
    const ch = source[index]
    if (ch === "'" || ch === '"') return parseString()
    if (ch === '{') {
      index += 1
      const value = {}
      const keys = new Set()
      skipWhitespace()
      if (source[index] === '}') { index += 1; return value }
      while (true) {
        skipWhitespace()
        let key
        if (source[index] === "'" || source[index] === '"') key = parseString()
        else {
          const match = /^[A-Za-z_$][A-Za-z0-9_$]*/.exec(source.slice(index))
          if (match === null) fail()
          key = match[0]
          index += key.length
        }
        if (key === '__proto__' || key === 'constructor' || key === 'prototype' || keys.has(key)) fail()
        keys.add(key)
        skipWhitespace()
        if (source[index] !== ':') fail()
        index += 1
        value[key] = parseValue()
        skipWhitespace()
        if (source[index] === '}') { index += 1; return value }
        if (source[index] !== ',') fail()
        index += 1
        skipWhitespace()
        if (source[index] === '}') { index += 1; return value }
      }
    }
    if (ch === '[') {
      index += 1
      const value = []
      skipWhitespace()
      if (source[index] === ']') { index += 1; return value }
      while (true) {
        value.push(parseValue())
        skipWhitespace()
        if (source[index] === ']') { index += 1; return value }
        if (source[index] !== ',') fail()
        index += 1
        skipWhitespace()
        if (source[index] === ']') { index += 1; return value }
      }
    }
    for (const [word, value] of [['true', true], ['false', false], ['null', null]]) {
      if (source.startsWith(word, index) && !isIdentifierChar(source[index + word.length])) {
        index += word.length
        return value
      }
    }
    const number = /^-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?/.exec(source.slice(index))
    if (number !== null) {
      const value = Number(number[0])
      if (!Number.isFinite(value)) fail()
      index += number[0].length
      return value
    }
    if (isIdentifierStart(ch)) fail()
    fail()
  }

  try {
    const parsed = parseValue()
    skipWhitespace()
    if (index !== source.length) fail()
    return { ok: true, value: jsonParsed ? jsonValue : parsed }
  } catch (error) {
    return { ok: false, value: undefined }
  }
}

export function createRunCodeStatic({ askTool, isDispatchStart }) {
  // run_code 拆解、组判定与聚合共用单一纯函数实现；直呼与组成员路径不复制规则，
  // 闭包依赖显式传入，分支顺序与 listener 合同保持一致。
  
  // 拆解 run_code 的 code 文本为工具组（静态预审用）。返回 { members, dynamic }：
  // members = 去重后的组员数组（按出现顺序；裸写伪成员固定排末尾）；
  // dynamic = 是否出现静态不可解析的动态工具访问（tools[var] 等）——不计入组，运行时瀑布兜底。
  // 组员形状：
  //   { kind:'tool', name, argsParsed:boolean, args:object|null, argsText:string }（参数不可解析时 argsParsed:false）
  //   { kind:'bare-write', name:'write', hints:string[] }（裸写伪工具）
  // 边界与兜底（写入注释，运行时瀑布兜底）：动态访问 tools[var]/运行时拼名、参数不可解析、
  // 嵌套 run_code 深度超限、eval/Function 动态代码——静态不可解析时不产生成员 → 组判定放行
  // → 运行时嵌套调用自身进入 tools/pre-execute 瀑布按直呼闸门拦截（文案同源），安全方向。
  function decomposeRunCode(code) {
    const text = typeof code === 'string' ? code : ''
    const members = []
    if (text === '') return { members, dynamic: false }
    const masked = maskCodeLiteralsAndComments(text)
    const occupied = new Array(text.length).fill(false)
    const seen = new Set()
    const addMember = (member) => {
      // 去重键 = name + '\u0001' + (argsParsed ? JSON.stringify(args) : '#raw:' + argsText)。
      // 同名同参重复调用判定恒同，合并去重；同名不同参分别保留。
      const key = member.kind === 'bare-write'
        ? 'bare-write\u0001' + member.hints.join('\u0001')
        : member.name + '\u0001' + (member.argsParsed ? JSON.stringify(member.args) : '#raw:' + member.argsText)
      if (seen.has(key)) return
      seen.add(key)
      members.push(member)
    }
    const markRange = (start, end) => {
      for (let k = start; k <= end && k < occupied.length; k += 1) occupied[k] = true
    }
    // 调用点唯一由共享扫描器提取；动态 tools[...] 访问不生成静态成员。
    const sites = collectRunCodeSites(text, masked)
    const dynamic = hasDynamicRunCodeAccess(text, masked, sites)
    for (const site of sites) {
      if (site.name === undefined) continue
      const argsText = site.innerText
      const parsed = parseStaticLiteral(argsText)
      const argsParsed = parsed.ok
      const args = argsParsed ? parsed.value : null
      addMember({ kind: 'tool', name: site.name, argsParsed, args, argsText })
      markRange(site.start, site.end)
    }
    // 裸写扫描只看已识别调用点占用区间之外的 masked 文本。
    const restChars = masked.split('')
    for (let k = 0; k < occupied.length; k += 1) { if (occupied[k]) restChars[k] = ' ' }
    const hints = codeMutationHints(restChars.join(''))
    if (hints.length > 0) addMember({ kind: 'bare-write', name: 'write', hints })
    return { members, dynamic }
  }
  
  // 多调用容错闸门：tools.* 调用点（未去重、含多行与动态访问；裸写不计）≥2 时，
  // 每点必须有独立 try/catch（try 内恰 1 点、块后紧跟 catch）；allSettled/.catch/包装函数不算。
  // 单调用豁免；depth 0 且参数可解析的嵌套 run_code 展平，静态识别失败按未保护拒绝；
  // decomposeRunCode 与 native/both 直呼路径保持同一合同。
  function runCodeCatchGateReason(code) {
    const text = typeof code === 'string' ? code : ''
    if (text === '') return null
    const n = text.length
    // 调用点收集：模块顶层 collectRunCodeSites（逻辑自本函数局部 collectSites 逐字提升，见函数定义处）。
    let total = 0
    let protectedCount = 0
    // 单层扫描（嵌套层递归；protection 按层内区间判定，跨层不继承）
    const scanLayer =
      (txt) => {
      const msk = maskCodeLiteralsAndComments(txt)
      const sites = collectRunCodeSites(txt, msk)
      const tlen = txt.length
      // 嵌套展平：depth 0 的 tools.run_code 且参数 JSON.parse 可解析 → 递归扫 args.code、
      // 该调用点不计入本层；参数不可解析的 run_code 调用点按普通调用点计数。
      const layerSites = []
      for (const site of sites) {
        if (site.name === 'run_code' && site.innerText !== '') {
          const parsed = parseStaticLiteral(site.innerText)
          if (parsed.ok && parsed.value !== null && typeof parsed.value === 'object' && typeof parsed.value.code === 'string') {
            scanLayer(parsed.value.code)
            continue
          }
        }
        layerSites.push(site)
      }
      total += layerSites.length
      const protectedIdx = new Set()
      const within = (site, a, b) => site.start >= a && site.start <= b
      // ① try/catch 保护：masked 上扫 try（前后非 idChar）→ 跳过 ws 须 '{' → 配平取块区间；
      //    块后跳过 ws 须 catch（catch 后一字符非 idChar，兼容 catch(e)/catch{}）；
      //    该 try 块内恰 1 个调用点 → 该点计入保护；≥2 个 → 均不保护。
      let ti = 0
      while (ti < tlen) {
        const tIdx = msk.indexOf('try', ti)
        if (tIdx === -1) break
        if ((tIdx === 0 || (msk[tIdx - 1] === undefined || !/[A-Za-z0-9_$]/.test(msk[tIdx - 1]))) && (tIdx + 3 >= tlen || (msk[tIdx + 3] === undefined || !/[A-Za-z0-9_$]/.test(msk[tIdx + 3])))) {
          let k = tIdx + 3
          while (k < tlen && /\s/.test(msk[k])) k += 1
          if (msk[k] === '{') {
            // 花括号专用配平（'{' 开头、'}' 归零即断；不用 sliceBalancedArgs——它在 ')' 归零才断，
            // 会把 try 块区间错误延伸到 catch 的 '(e)'）
            let depthB = 0
            let braceClose = -1
            for (let x = k; x < tlen; x += 1) {
              if (msk[x] === '{') depthB += 1
              else if (msk[x] === '}') { depthB -= 1; if (depthB === 0) { braceClose = x; break } }
            }
            if (braceClose !== -1) {
              let c = braceClose + 1
              while (c < tlen && /\s/.test(msk[c])) c += 1
              if (msk.slice(c, c + 5) === 'catch' && (c + 5 >= tlen || (msk[c + 5] === undefined || !/[A-Za-z0-9_$]/.test(msk[c + 5])))) {
                const hits = []
                for (let s = 0; s < layerSites.length; s += 1) {
                  if (within(layerSites[s], k, braceClose)) hits.push(s)
                }
                if (hits.length === 1) protectedIdx.add(hits[0])
              }
              ti = braceClose + 1
              continue
            }
          }
        }
        ti = tIdx + 3
      }
  
      protectedCount += protectedIdx.size
    }
    scanLayer(text)
    if (total < 2) return null
    if (protectedCount === total) return null
    return 'run_code 内 ' + total + ' 个工具调用未全部独立容错：请给每个调用点各写一个独立 try/catch——一次只包 1 个调用、块后紧跟 catch。已保护 ' + protectedCount + ' 个。写法示例：try { await tools.read({ file_path: "x" }) } catch (e) {}'
  }
  
  // ask_user_question 返回链闸门（第一版）：只在主会话 run_code 预执行前做保守静态证明。
  // 允许直接 return await，或单一标识符接收后紧随顶层 return 且按标识符边界实际引用；其余无法证明结果返回用户层的形态拒绝。
  function askUserQuestionReturnGateReason(code) {
    const text = typeof code === 'string' ? code : ''
    if (text === '') return null
    const masked = maskCodeLiteralsAndComments(text)
    const reason = 'run_code 内 ask_user_question 结果未正确返回用户层：请直接 return await tools.ask_user_question(...)，或先用变量接收后在紧随的顶层 return 中返回该结果；不得只调用、只赋值、通过别名/动态访问，或用 .then/函数包装结果'
    const isIdChar = (ch) => ch !== undefined && /[A-Za-z0-9_$]/.test(ch)
    const skipWs = (value, start) => {
      let i = start
      while (i < value.length && /\s/.test(value[i])) i += 1
      return i
    }
    const sites = collectRunCodeSites(text, masked)
    const askSites = sites.filter((site) => site.name === askTool)
    const askStarts = new Set(askSites.map((site) => site.start))
    let invalidReference = sites.some((site) => site.name === undefined)
  
    // 任何静态属性引用但非调用、字面量方括号访问、动态方括号访问都不能证明是白名单形态。
    let scan = 0
    while (scan < masked.length) {
      const idx = masked.indexOf('tools', scan)
      if (idx === -1) break
      if ((idx === 0 || !isIdChar(masked[idx - 1]))) {
        let k = skipWs(masked, idx + 5)
        if (masked[k] === '.') {
          k = skipWs(masked, k + 1)
          const m = /^[A-Za-z_$][A-Za-z0-9_$]*/.exec(masked.slice(k))
          if (m !== null && m[0] === askTool && !isIdChar(masked[k + m[0].length])) {
            if (!askStarts.has(idx)) invalidReference = true
          }
        } else if (masked[k] === '[') {
          let q = skipWs(text, k + 1)
          if (text[q] === "'" || text[q] === '"') {
            const quote = text[q]
            let end = q + 1
            while (end < text.length) {
              if (text[end] === '\\') { end += 2; continue }
              if (text[end] === quote) break
              end += 1
            }
            if (text.slice(q + 1, end) === askTool) invalidReference = true
          } else {
            invalidReference = true
          }
        }
      }
      scan = idx + 5
    }
  
    // bare ask 或非 tools 对象的属性调用同样属于别名/未知访问，不能放行。
    scan = 0
    while (scan < masked.length) {
      const idx = masked.indexOf(askTool, scan)
      if (idx === -1) break
      if ((idx === 0 || !isIdChar(masked[idx - 1])) && !isIdChar(masked[idx + askTool.length])) {
        let p = idx - 1
        while (p >= 0 && /\s/.test(masked[p])) p -= 1
        let direct = false
        if (masked[p] === '.') {
          p -= 1
          while (p >= 0 && /\s/.test(masked[p])) p -= 1
          const end = p
          while (p >= 0 && isIdChar(masked[p])) p -= 1
          direct = masked.slice(p + 1, end + 1) === 'tools'
        }
        if (!direct) invalidReference = true
      }
      scan = idx + askTool.length
    }
    if (invalidReference) return reason
    if (askSites.length === 0) return null
  
    // 仅在三种括号深度都为 0 时才把调用视为顶层语句中的调用。
    const braceDepth = new Array(text.length + 1)
    const parenDepth = new Array(text.length + 1)
    const bracketDepth = new Array(text.length + 1)
    let brace = 0
    let paren = 0
    let bracket = 0
    for (let i = 0; i < masked.length; i += 1) {
      braceDepth[i] = brace
      parenDepth[i] = paren
      bracketDepth[i] = bracket
      if (masked[i] === '{') brace += 1
      else if (masked[i] === '}') brace -= 1
      else if (masked[i] === '(') paren += 1
      else if (masked[i] === ')') paren -= 1
      else if (masked[i] === '[') bracket += 1
      else if (masked[i] === ']') bracket -= 1
    }
    braceDepth[text.length] = brace
    parenDepth[text.length] = paren
    bracketDepth[text.length] = bracket
    const isTopLevel = (pos) => braceDepth[pos] === 0 && parenDepth[pos] === 0 && bracketDepth[pos] === 0
    const candidateStarts = (pos) => {
      const starts = [0]
      for (let i = 0; i < pos; i += 1) {
        if (masked[i] === ';' && isTopLevel(i)) starts.push(i + 1)
        else if (masked[i] === '}' && isTopLevel(i + 1)) starts.push(i + 1)
      }
      return starts
    }
    const tokenAt = (value, pos, token) => value.slice(pos, pos + token.length) === token &&
      (pos === 0 || !isIdChar(value[pos - 1])) && !isIdChar(value[pos + token.length])
    const expressionEnd = (start) => {
      for (let i = start; i < masked.length; i += 1) {
        if (masked[i] === ';' && isTopLevel(i)) return i
        if (masked[i] === '\n' && isTopLevel(i)) {
          let k = skipWs(masked, i + 1)
          if (/^(?:const|let|var|return|console|await|if|for|while|try|throw)\b/.test(masked.slice(k))) return i
        }
      }
      return masked.length
    }
    const references = (expression, name) => {
      let i = 0
      while (i < expression.length) {
        const idx = expression.indexOf(name, i)
        if (idx === -1) return false
        if ((idx === 0 || !isIdChar(expression[idx - 1])) && !isIdChar(expression[idx + name.length])) {
          let p = idx - 1
          while (p >= 0 && /\s/.test(expression[p])) p -= 1
          let n = idx + name.length
          while (n < expression.length && /\s/.test(expression[n])) n += 1
          if (expression[p] !== '.' && expression[n] !== ':') return true
        }
        i = idx + name.length
      }
      return false
    }
    const hasReassignment = (expression, name) => {
      let i = 0
      while (i < expression.length) {
        const idx = expression.indexOf(name, i)
        if (idx === -1) return false
        if ((idx === 0 || !isIdChar(expression[idx - 1])) && !isIdChar(expression[idx + name.length])) {
          let n = idx + name.length
          while (n < expression.length && /\s/.test(expression[n])) n += 1
          if (expression[n] === '=' && expression[n + 1] !== '=' && expression[n + 1] !== '>') return true
          if ((expression[n] === '+' || expression[n] === '-') && expression[n + 1] === '+') return true
          let p = idx - 1
          while (p >= 0 && /\s/.test(expression[p])) p -= 1
          if ((expression[p] === '+' || expression[p] === '-') && expression[p - 1] === expression[p]) return true
        }
        i = idx + name.length
      }
      return false
    }
    const afterCall = (site) => {
      let k = site.end + 1
      while (k < masked.length && /\s/.test(masked[k])) k += 1
      let semicolon = false
      if (masked[k] === ';') {
        semicolon = true
        k += 1
        while (k < masked.length && /\s/.test(masked[k])) k += 1
      }
      return { pos: k, semicolon, gap: text.slice(site.end + 1, k) }
    }
  
    for (const site of askSites) {
      const callHead = masked.slice(site.start, site.end + 1)
      if (!isTopLevel(site.start) || !/^tools\s*\.\s*ask_user_question\s*\(/.test(callHead)) return reason
      if (callHead.includes('=>') || /\bfunction\b/.test(callHead)) return reason
      let accepted = false
      for (const start of candidateStarts(site.start)) {
        const prefix = masked.slice(start, site.start).trim()
        const direct = /^return[ \t]+await$/.test(prefix)
        const assigned = /^(?:(?:const|let|var)[ \t]+)?([A-Za-z_$][A-Za-z0-9_$]*)[ \t]*=[ \t]*await$/.exec(prefix)
        if (!direct && assigned === null) continue
        const tail = afterCall(site)
        if (direct) {
          const continuation = ['.', '(', '[', '+', '-', '*', '/', '%', '&', '|', '?', ':', ',', '`'].includes(masked[tail.pos])
          if (tail.pos === masked.length || tail.semicolon || ((tail.gap.includes('\n') || tail.gap.includes('\r')) && !continuation)) accepted = true
          continue
        }
        if (!tail.semicolon && !tail.gap.includes('\n') && !tail.gap.includes('\r')) continue
        if (!isTopLevel(tail.pos) || !tokenAt(masked, tail.pos, 'return')) continue
        let exprStart = tail.pos + 6
        const returnGapStart = exprStart
        exprStart = skipWs(masked, exprStart)
        const returnGap = text.slice(returnGapStart, exprStart)
        if (exprStart >= masked.length || returnGap === '' || /[\r\n]/.test(returnGap)) continue
        const end = expressionEnd(exprStart)
        const expression = masked.slice(exprStart, end).trim()
        const name = assigned[1]
        if (expression === '' || !references(expression, name) || hasReassignment(expression, name)) continue
        if (/\bconsole\s*\./.test(expression) || /\.\s*then\b/.test(expression) || expression.includes('=>') || /\bfunction\b/.test(expression)) continue
        accepted = true
      }
      if (!accepted) return reason
    }
    return null
  }
  
  // run_code code 静态调用点计数（单实例子调用上限快路径，planner 专属）：run_code 调用点本身不计、
  // 参数 JSON 可解析时递归展开 args.code（镜像 runCodeCatchGateReason 展平口径）；其余调用点各计 1。
  function runCodeSiteCount(code) {
    const text = typeof code === 'string' ? code : ''
    if (text === '') return 0
    const masked = maskCodeLiteralsAndComments(text)
    const sites = collectRunCodeSites(text, masked)
    let total = 0
    for (const site of sites) {
      if (site.name === 'run_code' && site.innerText !== '') {
        const parsed = parseStaticLiteral(site.innerText)
        if (parsed.ok && parsed.value !== null && typeof parsed.value === 'object' && typeof parsed.value.code === 'string') {
          total += runCodeSiteCount(parsed.value.code)
          continue
        }
      }
      total += 1
    }
    return total
  }
  
  // 子调用语义判定：exec.sub===true（组判定合成成员）或 exec.parent!==undefined（运行时嵌套判定，
  // 与官方 dsh-tools nested 判定同口径）→ true；其余 false（直呼/根 run_code 不算子调用）。
  function isRunCodeSubCall(exec) {
    if (exec === null || typeof exec !== 'object') return false
    if (exec.sub === true) return true
    if (exec.parent !== undefined) return true
    return false
  }
  
  // 单实例子调用超限文案（T3 逐字；listener 运行时检查与纯函数共用）。
  function runCodeDispatchCapText(rid, count, cap) {
    return `run_code 实例（rootCallId ${rid}）子调用数 ${count} 超过上限 ${cap}（exploreBudget）：请拆分 run_code 或提高 exploreBudget；循环/动态放大同样受限`
  }
  
  // 运行时单实例上限判定（planner 专属）：统计 events 中 type 命中双兼容 dispatch-start 事件（新名 tool/ptc-dispatch-start / 旧名 tool/code-dispatch-start）且
  // data.rootCallId===rid 的条数 count；count>cap → 返回 T3 文案；否则 null。
  // exec.rootCallId 非 string / events 非数组 / cap 非正整数 → null。
  function runCodeDispatchGateReason(events, exec, cap) {
    const rid = exec !== null && exec !== undefined ? exec.rootCallId : undefined
    if (typeof rid !== 'string' || !Array.isArray(events)) return null
    if (!Number.isInteger(cap) || cap <= 0) return null
    let count = 0
    for (const e of events) {
      if (e === null || typeof e !== 'object') continue
      if (!isDispatchStart(e.type)) continue
      const d = e.data
      if (d === null || typeof d !== 'object') continue
      if (d.rootCallId === rid) count += 1
    }
    if (count > cap) return runCodeDispatchCapText(rid, count, cap)
    return null
  }
  return {
    maskCodeLiteralsAndComments,
    sliceBalancedArgs,
    decomposeRunCode,
    runCodeCatchGateReason,
    collectRunCodeSites,
    askUserQuestionReturnGateReason,
    runCodeSiteCount,
    isRunCodeSubCall,
    runCodeDispatchCapText,
    runCodeDispatchGateReason,
  }
}
