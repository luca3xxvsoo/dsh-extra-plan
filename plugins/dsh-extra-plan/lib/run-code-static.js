// run_code 静态解析与理由函数：只接收普通参数，不持有宿主/会话运行时状态。

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

export function createRunCodeStatic({ askTool, isDispatchStart }) {
  // ── F7' v4：run_code 拆解器 + 闸门纯函数抽取 + 组判定/聚合（单一真源） ──
  // 说明（重构原则）：listener 各分段的纯粹判定部分抽取为模块顶层纯函数；普通工具
  // 路径（native/both 直呼）与组判定成员路径调用「同一函数」，文案字面量唯一出处，
  // 杜绝复制漂移。所有闭包依赖（exploreBudget、planToolName、jobOutputCallCounters、
  // probe）改为显式参数传入。抽函数内分支顺序与改前 listener 逐字同序。
  
  // 遮蔽代码中的字符串字面量（'...'/"..."/`...`）与注释（//、/* */）为等长空格
  // （保留换行/回车），消除字符串/注释内 tools.xxx 或裸写词的误提取；遮蔽后无引号，
  // 后续括号配平不受字符串内括号干扰（未闭合字符串/注释保守遮蔽至末尾）。
  function maskCodeLiteralsAndComments(code) {
    const text = typeof code === 'string' ? code : ''
    const chars = text.split('')
    const n = chars.length
    let i = 0
    while (i < n) {
      const ch = chars[i]
      if (ch === "'" || ch === '"' || ch === '`') {
        const quote = ch
        let j = i + 1
        while (j < n) {
          if (chars[j] === '\\') { j += 2; continue }
          if (chars[j] === quote) break
          j += 1
        }
        const end = j < n ? j : n - 1
        for (let k = i; k <= end; k += 1) { if (chars[k] !== '\n' && chars[k] !== '\r') chars[k] = ' ' }
        i = j < n ? j + 1 : n
        continue
      }
      if (ch === '/' && i + 1 < n && chars[i + 1] === '/') {
        let j = i
        while (j < n && chars[j] !== '\n') j += 1
        for (let k = i; k < j; k += 1) { if (chars[k] !== '\n' && chars[k] !== '\r') chars[k] = ' ' }
        i = j
        continue
      }
      if (ch === '/' && i + 1 < n && chars[i + 1] === '*') {
        let j = i + 2
        while (j + 1 < n && !(chars[j] === '*' && chars[j + 1] === '/')) j += 1
        const end = j + 1 < n ? j + 1 : n - 1
        for (let k = i; k <= end; k += 1) { if (chars[k] !== '\n' && chars[k] !== '\r') chars[k] = ' ' }
        i = j + 2
        continue
      }
      i += 1
    }
    return chars.join('')
  }
  
  // 从 '（' 起括号配平（计数 ( ) [ ] { }，遮蔽后无字符串干扰）取参数切片：
  // 在遮蔽文本上配平，innerText 取原文本（JSON.parse 需要原始字面量）。
  // 返回 { closeIdx（配平闭括号索引，未闭合取文本末尾）, innerText }。
  function sliceBalancedArgs(maskedText, text, parenIdx) {
    let depth = 0
    let i = parenIdx
    while (i < maskedText.length) {
      const ch = maskedText[i]
      if (ch === '(') depth += 1
      else if (ch === ')') { depth -= 1; if (depth === 0) break }
      else if (ch === '[') depth += 1
      else if (ch === ']') depth -= 1
      else if (ch === '{') depth += 1
      else if (ch === '}') depth -= 1
      i += 1
    }
    const closeIdx = i < maskedText.length ? i : text.length - 1
    const innerText = text.slice(parenIdx + 1, i < maskedText.length ? i : text.length)
    return { closeIdx, innerText }
  }
  
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
    let dynamic = false
    if (text === '') return { members, dynamic }
    const masked = maskCodeLiteralsAndComments(text)
    const n = text.length
    const occupied = new Array(n).fill(false)
    const seen = new Set()
    const addMember = (member) => {
      // 去重键 = name + '\u0001' + (argsParsed ? JSON.stringify(args) : '#raw:' + argsText)。
      // 设计理由：闸门判定结果完全由 name+arguments 决定（参数依赖检查：run_in_background/
      // wait/sandbox_permissions/agent_id/command/questions）；同名同参重复调用判定恒同 →
      // 合并去重，避免重复报错行；同名不同参必须各自判定（如 subagent_probe 带/不带
      // run_in_background）；不可解析参数同名合并（参数依赖检查被跳过，判定结果与具体
      // 参数无关）。已注明边界：JSON.stringify 依赖键序，键序不同但语义相同的字面量
      // 视为不同成员（各自判定，安全方向）。
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
    const isIdChar = (ch) => ch !== undefined && /[A-Za-z0-9_$]/.test(ch)
    let i = 0
    while (i < n) {
      const ch = text[i]
      // ① 跳过字符串字面量与注释（遮蔽版 masked 已把对应位置留空格；扫描须在原序列
      //    上跳过起始符，避免把字符串/注释内的 tools.xxx 当调用提取）
      if (ch === "'" || ch === '"' || ch === '`') {
        const quote = ch
        let j = i + 1
        while (j < n) {
          if (text[j] === '\\') { j += 2; continue }
          if (text[j] === quote) break
          j += 1
        }
        i = j < n ? j + 1 : n
        continue
      }
      if (ch === '/' && i + 1 < n && text[i + 1] === '/') {
        while (i < n && text[i] !== '\n') i += 1
        continue
      }
      if (ch === '/' && i + 1 < n && text[i + 1] === '*') {
        const end = text.indexOf('*/', i + 2)
        i = end === -1 ? n : end + 2
        continue
      }
      // ② 提取工具调用（含 await 前缀无关；支持 tools.xxx(...) 与 tools['xxx'](...)/
      //    tools["xxx"](...) 字面量方括号）；③ tools[ 的非字面量方括号访问
      //    （如 tools[var]、tools[`x`]）→ dynamic = true，不产生成员。
      if (text.startsWith('tools', i) && !(i > 0 && isIdChar(text[i - 1]))) {
        let j = i + 5
        while (j < n && /\s/.test(text[j])) j += 1
        let name
        let parenIdx = -1
        if (text[j] === '.') {
          j += 1
          while (j < n && /\s/.test(text[j])) j += 1
          const m = /^[A-Za-z_$][A-Za-z0-9_$]*/.exec(text.slice(j))
          if (m !== null) {
            name = m[0]
            let k = j + name.length
            while (k < n && /\s/.test(text[k])) k += 1
            if (text[k] === '(') parenIdx = k
          }
        } else if (text[j] === '[') {
          j += 1
          while (j < n && /\s/.test(text[j])) j += 1
          const q = text[j]
          if (q === "'" || q === '"') {
            let k = j + 1
            while (k < n && text[k] !== q) { if (text[k] === '\\') k += 1; k += 1 }
            const lit = text.slice(j + 1, k)
            if (/^[A-Za-z_$][A-Za-z0-9_$]*$/.test(lit) && k < n) {
              k += 1
              while (k < n && /\s/.test(text[k])) k += 1
              if (text[k] === ']') {
                k += 1
                while (k < n && /\s/.test(text[k])) k += 1
                if (text[k] === '(') { name = lit; parenIdx = k }
              }
            }
            // 字面量名非法或形态不符 → 静态不可解析
            if (name === undefined) dynamic = true
          } else {
            // tools[var] / tools[`x`] / tools[expr] → 动态访问
            dynamic = true
          }
        }
        if (name !== undefined && parenIdx !== -1) {
          // 自 '(' 起括号配平（遮蔽后无字符串干扰），取参数原文 innerText
          const bal = sliceBalancedArgs(masked, text, parenIdx)
          const innerText = bal.innerText.trim()
          // ④ 参数解析：JSON.parse(innerText) 成功且为对象 → argsParsed=true；
          //    否则 argsParsed=false、argsText=innerText（标记「参数不可解析」）。
          let argsParsed = false
          let args = null
          if (innerText !== '') {
            try {
              const parsed = JSON.parse(innerText)
              if (parsed !== null && typeof parsed === 'object') { args = parsed; argsParsed = true }
            } catch (error) { /* 非 JSON：参数不可解析 */ }
          }
          addMember({ kind: 'tool', name, argsParsed, args: argsParsed ? args : null, argsText: innerText })
          markRange(i, bal.closeIdx)
          i = bal.closeIdx + 1
          continue
        }
      }
      i += 1
    }
    // ⑥ 裸写扫描：对遮蔽后文本中已提取工具调用区间之外的剩余片段跑 codeMutationHints
    //    （复用 RUNCODE_MUTATION_HINTS）→ hits 非空 → 追加一个 { kind:'bare-write',
    //    name:'write', hints:hits } 成员（排末尾；多个裸写命中合并为一个）。
    //    与 v2 差异说明：v2 对全文本扫描（含嵌套工具调用参数字符串内的裸写词）；v4 屏蔽
    //    工具调用区间后再扫，杜绝「tools.write({ content: "writeFileSync(...)" }) 的参
    //    数字符串被误判为裸写」，属精确化改进；不影响 R35/R36/R40（它们用裸 writeFileSync
    //    直写，仍命中）。
    const restChars = masked.split('')
    for (let k = 0; k < occupied.length; k += 1) { if (occupied[k]) restChars[k] = ' ' }
    const hints = codeMutationHints(restChars.join(''))
    if (hints.length > 0) addMember({ kind: 'bare-write', name: 'write', hints })
    return { members, dynamic }
  }
  
  // run_code 多调用容错硬闸门（v0.1.10）：code 内 tools.* 调用点（未去重、含多行、含动态访问；
  // 裸写 hint 不计）≥2 时，要求每个调用点独立容错——只认独立 try/catch 组：try 块内恰 1 个调用点、
  // 块后紧跟 catch；allSettled 数组 / .catch 链 / 包装函数一律不认；不足 → 教学式拒绝（组判定整体拒绝）。
  // 单调用豁免；嵌套 run_code 展平（depth 0 且参数可解析时递归扫 args.code，depth≥1 跳过）纳入；
  // 静态识别失败方向=保守（按未保护拒绝）。decomposeRunCode 契约与 native/both 直呼路径均不变。
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
          let parsed = null
          try { parsed = JSON.parse(site.innerText) } catch (error) { /* 参数不可解析 */ }
          if (parsed !== null && typeof parsed === 'object' && typeof parsed.code === 'string') {
            scanLayer(parsed.code)
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
  
  // run_code 调用点收集（镜像 decomposeRunCode 提取语义；不去重、只记 {start,end,innerText,name}）。
  // 自 runCodeCatchGateReason 局部 collectSites 提升为模块顶层（任务1）：字符串/注释跳过、
  // tools./tools['lit']/tools[var] 三类调用点、sliceBalancedArgs 配平；逻辑逐字未动。
  function collectRunCodeSites(txt, msk) {
      const sites = []
      const tlen = txt.length
      let i = 0
      while (i < tlen) {
        const ch = txt[i]
        // 跳过字符串字面量与注释（原序列上跳过起始符，避免字符串/注释内 tools.x 当调用提取）
        if (ch === "'" || ch === '"' || ch === '`') {
          const quote = ch
          let j = i + 1
          while (j < tlen) {
            if (txt[j] === '\\') { j += 2; continue }
            if (txt[j] === quote) break
            j += 1
          }
          i = j < tlen ? j + 1 : tlen
          continue
        }
        if (ch === '/' && i + 1 < tlen && txt[i + 1] === '/') {
          while (i < tlen && txt[i] !== '\n') i += 1
          continue
        }
        if (ch === '/' && i + 1 < tlen && txt[i + 1] === '*') {
          const end = txt.indexOf('*/', i + 2)
          i = end === -1 ? tlen : end + 2
          continue
        }
        if (txt.startsWith('tools', i) && !(i > 0 && txt[i - 1] !== undefined && /[A-Za-z0-9_$]/.test(txt[i - 1]))) {
          let j = i + 5
          while (j < tlen && /\s/.test(txt[j])) j += 1
          let name = undefined
          let parenIdx = -1
          if (txt[j] === '.') {
            j += 1
            while (j < tlen && /\s/.test(txt[j])) j += 1
            const m = /^[A-Za-z_$][A-Za-z0-9_$]*/.exec(txt.slice(j))
            if (m !== null) {
              const mName = m[0]
              let k = j + mName.length
              while (k < tlen && /\s/.test(txt[k])) k += 1
              if (txt[k] === '(') { name = mName; parenIdx = k }
            }
          } else if (txt[j] === '[') {
            j += 1
            while (j < tlen && /\s/.test(txt[j])) j += 1
            const q = txt[j]
            if (q === "'" || q === '"') {
              let k = j + 1
              while (k < tlen && txt[k] !== q) { if (txt[k] === '\\') k += 1; k += 1 }
              const lit = txt.slice(j + 1, k)
              if (/^[A-Za-z_$][A-Za-z0-9_$]*$/.test(lit) && k < tlen) {
                k += 1
                while (k < tlen && /\s/.test(txt[k])) k += 1
                if (txt[k] === ']') {
                  k += 1
                  while (k < tlen && /\s/.test(txt[k])) k += 1
                  if (txt[k] === '(') { name = lit; parenIdx = k }
                }
              }
            } else {
              // tools[var]/tools[expr] 动态访问：跳到 ']' 后 ws 再找 '('（找不到 '(' 不计，
              // 如 const t = tools[fn] 非调用）
              let k = j
              let depth = 1
              while (k < tlen && depth > 0) {
                if (txt[k] === '[') depth += 1
                else if (txt[k] === ']') depth -= 1
                k += 1
              }
              while (k < tlen && /\s/.test(txt[k])) k += 1
              if (txt[k] === '(') parenIdx = k
            }
          }
          if (parenIdx !== -1) {
            const bal = sliceBalancedArgs(msk, txt, parenIdx)
            sites.push({ start: i, end: bal.closeIdx, innerText: bal.innerText.trim(), name })
            i = bal.closeIdx + 1
            continue
          }
        }
        i += 1
      }
    return sites
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
        let parsed = null
        try { parsed = JSON.parse(site.innerText) } catch (error) { /* 参数不可解析 */ }
        if (parsed !== null && typeof parsed === 'object' && typeof parsed.code === 'string') {
          total += runCodeSiteCount(parsed.code)
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
