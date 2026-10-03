// run_code 无宿主状态词法扫描器：字符串/注释遮蔽、括号配平、调用点收集。

export function maskCodeLiteralsAndComments(code) {
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

export function sliceBalancedArgs(maskedText, text, parenIdx) {
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

// 判断是否存在无法静态解析的 tools[...] 访问；调用点区间由 collectRunCodeSites 提供。
// sites 中已识别的静态调用区间会遮蔽其参数，保持 decompose 的占用区间语义。
export function hasDynamicRunCodeAccess(txt, msk, sites = []) {
  const text = typeof txt === 'string' ? txt : ''
  const masked = typeof msk === 'string' && msk.length === text.length ? msk : maskCodeLiteralsAndComments(text)
  const staticRanges = Array.isArray(sites)
    ? sites.filter((site) => site !== null && typeof site === 'object' && site.name !== undefined && Number.isInteger(site.start) && Number.isInteger(site.end))
    : []
  const skipWhitespace = (value, start) => {
    let i = start
    while (i < value.length && /\s/.test(value[i])) i += 1
    return i
  }
  const bracketEndOf = (start) => {
    let depth = 0
    for (let i = start; i < masked.length; i += 1) {
      if (masked[i] === '[') depth += 1
      else if (masked[i] === ']') {
        depth -= 1
        if (depth === 0) return i
      }
    }
    return -1
  }
  const inStaticRange = (position) => staticRanges.some((site) => position >= site.start && position <= site.end)
  let i = 0
  while (i < text.length) {
    if (inStaticRange(i)) {
      const site = staticRanges.find((item) => i >= item.start && i <= item.end)
      i = site !== undefined ? site.end + 1 : i + 1
      continue
    }
    if (!masked.startsWith('tools', i) || (i > 0 && /[A-Za-z0-9_$]/.test(masked[i - 1]))) {
      i += 1
      continue
    }
    let accessStart = skipWhitespace(masked, i + 5)
    if (masked[accessStart] !== '[') {
      i += 1
      continue
    }
    const close = bracketEndOf(accessStart)
    if (close === -1) return true
    let q = skipWhitespace(text, accessStart + 1)
    let staticCall = false
    if (text[q] === "'" || text[q] === '"') {
      const quote = text[q]
      let endQuote = q + 1
      while (endQuote < text.length) {
        if (text[endQuote] === '\\') { endQuote += 2; continue }
        if (text[endQuote] === quote) break
        endQuote += 1
      }
      const literal = text.slice(q + 1, endQuote)
      if (/^[A-Za-z_$][A-Za-z0-9_$]*$/.test(literal) && endQuote < text.length) {
        const afterQuote = skipWhitespace(text, endQuote + 1)
        if (afterQuote === close) {
          const afterBracket = skipWhitespace(text, close + 1)
          staticCall = text[afterBracket] === '('
        }
      }
    }
    if (!staticCall) return true
    i = close + 1
  }
  return false
}

export function collectRunCodeSites(txt, msk) {
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
