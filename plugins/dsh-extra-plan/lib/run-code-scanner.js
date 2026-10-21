// run_code 无宿主状态词法扫描器：字符串/注释遮蔽、括号配平、调用点收集。

export function maskCodeLiteralsAndComments(code) {
  const text = typeof code === 'string' ? code : ''
  const chars = text.split('')
  const n = chars.length
  const templateQuote = String.fromCharCode(96)
  const regexAfterWord = new Set(['return', 'throw', 'case', 'delete', 'void', 'typeof', 'instanceof', 'in', 'of', 'yield', 'await', 'else', 'do', 'new'])
  const controlParenWords = new Set(['if', 'for', 'while', 'with', 'switch', 'catch'])
  const blockWords = new Set(['else', 'try', 'catch', 'finally', 'do'])
  const functionDeclarationBefore = new Set([';', '{', '}', ')', 'export', 'default'])
  const isIdentifierStart = (ch) => typeof ch === 'string' && /[A-Za-z_$]/.test(ch)
  const isIdentifierPart = (ch) => typeof ch === 'string' && /[A-Za-z0-9_$]/.test(ch)
  const blank = (start, end) => {
    for (let k = start; k < end; k += 1) {
      if (chars[k] !== '\n' && chars[k] !== '\r') chars[k] = ' '
    }
  }
  function scanString(start, quote) {
    let i = start
    blank(i, i + 1)
    i += 1
    while (i < n) {
      if (text[i] === '\\') { blank(i, Math.min(i + 2, n)); i += 2; continue }
      blank(i, i + 1)
      if (text[i] === quote) return i + 1
      i += 1
    }
    return n
  }
  function scanRegex(start) {
    let i = start
    let inClass = false
    blank(i, i + 1)
    i += 1
    while (i < n) {
      if (text[i] === '\\') { blank(i, Math.min(i + 2, n)); i += 2; continue }
      if (text[i] === '\n' || text[i] === '\r') return i
      if (text[i] === '[') inClass = true
      else if (text[i] === ']') inClass = false
      else if (text[i] === '/' && !inClass) {
        blank(i, i + 1)
        i += 1
        while (i < n && isIdentifierPart(text[i])) { blank(i, i + 1); i += 1 }
        return i
      }
      blank(i, i + 1)
      i += 1
    }
    return n
  }
  function scanTemplate(start) {
    blank(start, start + 1)
    let i = start + 1
    while (i < n) {
      if (text[i] === '\\') { blank(i, Math.min(i + 2, n)); i += 2; continue }
      if (text[i] === templateQuote) { blank(i, i + 1); return i + 1 }
      if (text[i] === '$' && text[i + 1] === '{') {
        blank(i, i + 1)
        i = scanCode(i + 2, true)
        if (i < n && text[i] === '}') i += 1
        continue
      }
      blank(i, i + 1)
      i += 1
    }
    return n
  }
  function scanCode(start, stopAtBrace) {
    let i = start
    const braceKinds = []
    const parens = []
    let canStartRegex = true
    let lastWord = ''
    let lastSignificant = ''
    let lastWordWasProperty = false
    let pendingFunction = null
    let functionBodyExpression
    let asyncFunctionExpression = false
    let asyncWordEnd = 0
    while (i < n) {
      const ch = text[i]
      if (stopAtBrace && ch === '}' && braceKinds.length === 0) return i
      if (/\s/.test(ch)) { i += 1; continue }
      if (ch === "'" || ch === '"') { i = scanString(i, ch); canStartRegex = false; lastWord = ''; lastSignificant = 'value'; continue }
      if (ch === templateQuote) { i = scanTemplate(i); canStartRegex = false; lastWord = ''; lastSignificant = 'value'; continue }
      if (ch === '/' && i + 1 < n && text[i + 1] === '/') {
        blank(i, i + 2)
        i += 2
        while (i < n && text[i] !== '\n') { blank(i, i + 1); i += 1 }
        continue
      }
      if (ch === '/' && i + 1 < n && text[i + 1] === '*') {
        const end = text.indexOf('*/', i + 2)
        const stop = end === -1 ? n : end + 2
        blank(i, stop)
        i = stop
        continue
      }
      if (ch === '/' && canStartRegex) { i = scanRegex(i); canStartRegex = false; lastWord = ''; lastSignificant = 'value'; continue }
      if (isIdentifierStart(ch)) {
        let j = i + 1
        while (j < n && isIdentifierPart(text[j])) j += 1
        const word = text.slice(i, j)
        const property = lastSignificant === '.'
        if (!property && word === 'async') {
          asyncFunctionExpression = lastSignificant === '' ? stopAtBrace : !functionDeclarationBefore.has(lastSignificant)
          asyncWordEnd = j
        }
        if (!property && word === 'function') {
          pendingFunction = lastWord === 'async'
            ? (!/[\r\n]/.test(text.slice(asyncWordEnd, i)) && asyncFunctionExpression)
            : (lastSignificant === '' ? stopAtBrace : !functionDeclarationBefore.has(lastSignificant))
        }
        lastWord = word
        lastWordWasProperty = property
        lastSignificant = lastWord
        canStartRegex = !property && regexAfterWord.has(lastWord)
        i = j
        continue
      }
      if (/[0-9]/.test(ch)) {
        let j = i + 1
        while (j < n && /[A-Za-z0-9._]/.test(text[j])) j += 1
        i = j
        canStartRegex = false
        lastWord = ''
        lastSignificant = 'value'
        continue
      }
      if (ch === '(') {
        parens.push({ control: !lastWordWasProperty && controlParenWords.has(lastWord), functionExpression: pendingFunction })
        pendingFunction = null
        functionBodyExpression = undefined
        i += 1
        canStartRegex = true
        lastWord = ''
        lastSignificant = '('
        continue
      }
      if (ch === ')') {
        const paren = parens.pop()
        functionBodyExpression = paren?.functionExpression ?? undefined
        i += 1
        canStartRegex = paren?.control === true
        lastWord = ''
        lastSignificant = ')'
        continue
      }
      if (ch === '[') { i += 1; canStartRegex = true; lastWord = ''; lastSignificant = '['; continue }
      if (ch === ']') { i += 1; canStartRegex = false; lastWord = ''; lastSignificant = ']'; continue }
      if (ch === '{') {
        const isBlock = typeof functionBodyExpression === 'boolean'
          ? !functionBodyExpression
          : (!stopAtBrace && lastSignificant === '') || lastSignificant === ')' || lastSignificant === ';' || lastSignificant === '=>' || blockWords.has(lastWord)
        functionBodyExpression = undefined
        braceKinds.push(isBlock)
        i += 1
        canStartRegex = true
        lastWord = ''
        lastSignificant = '{'
        continue
      }
      if (ch === '}') {
        const isBlock = braceKinds.length > 0 ? braceKinds.pop() : true
        i += 1
        canStartRegex = isBlock === true
        lastWord = ''
        lastSignificant = '}'
        continue
      }
      if (ch === '.') { i += 1; canStartRegex = false; lastWord = ''; lastSignificant = '.'; continue }
      if (ch === '=' && text[i + 1] === '>') {
        i += 2
        canStartRegex = true
        lastWord = ''
        lastSignificant = '=>'
        continue
      }
      if ((ch === '+' || ch === '-') && text[i + 1] === ch) {
        i += 2
        canStartRegex = false
        lastWord = ''
        lastSignificant = ch + ch
        continue
      }
      canStartRegex = true
      lastWord = ''
      lastSignificant = ch
      i += 1
    }
    return n
  }
  scanCode(0, false)
  return chars.join('')
}

// 从 '(' 起括号配平（计数 ( ) [ ] { }，遮蔽后无字符串干扰）取参数切片：
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
// 静态调用参数仍继续扫描，避免漏掉其中的动态 tools[...] 访问。
export function hasDynamicRunCodeAccess(txt, msk, sites = []) {
  const text = typeof txt === 'string' ? txt : ''
  const masked = typeof msk === 'string' && msk.length === text.length ? msk : maskCodeLiteralsAndComments(text)
  const isIdentifierPart = (ch) => typeof ch === 'string' && /[A-Za-z0-9_$]/.test(ch)
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
  let i = 0
  while (i < text.length) {
    if (!masked.startsWith('tools', i) || (i > 0 && isIdentifierPart(masked[i - 1]))) { i += 1; continue }
    const accessStart = skipWhitespace(masked, i + 5)
    if (masked[accessStart] !== '[') { i += 1; continue }
    const close = bracketEndOf(accessStart)
    if (close === -1) return true
    const q = skipWhitespace(text, accessStart + 1)
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
      if (/^[A-Za-z_$][A-Za-z0-9_$-]*$/.test(literal) && endQuote < text.length) {
        const afterQuote = skipWhitespace(text, endQuote + 1)
        if (afterQuote === close) {
          const afterBracket = skipWhitespace(masked, close + 1)
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
  const text = typeof txt === 'string' ? txt : ''
  const masked = typeof msk === 'string' && msk.length === text.length ? msk : maskCodeLiteralsAndComments(text)
  const sites = []
  const isIdentifierStart = (ch) => typeof ch === 'string' && /[A-Za-z_$]/.test(ch)
  const isIdentifierPart = (ch) => typeof ch === 'string' && /[A-Za-z0-9_$]/.test(ch)
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
  let i = 0
  while (i < text.length) {
    if (!masked.startsWith('tools', i) || (i > 0 && isIdentifierPart(masked[i - 1]))) { i += 1; continue }
    let j = skipWhitespace(masked, i + 5)
    let name
    let parenIdx = -1
    if (masked[j] === '.') {
      j = skipWhitespace(masked, j + 1)
      if (isIdentifierStart(masked[j])) {
        let k = j + 1
        while (k < text.length && isIdentifierPart(masked[k])) k += 1
        const candidate = masked.slice(j, k)
        k = skipWhitespace(masked, k)
        if (masked[k] === '(') { name = candidate; parenIdx = k }
      }
    } else if (masked[j] === '[') {
      const close = bracketEndOf(j)
      if (close !== -1) {
        const k = skipWhitespace(masked, close + 1)
        if (masked[k] === '(') {
          const q = skipWhitespace(text, j + 1)
          if (text[q] === "'" || text[q] === '"') {
            const quote = text[q]
            let endQuote = q + 1
            while (endQuote < text.length) {
              if (text[endQuote] === '\\') { endQuote += 2; continue }
              if (text[endQuote] === quote) break
              endQuote += 1
            }
            const literal = text.slice(q + 1, endQuote)
            if (/^[A-Za-z_$][A-Za-z0-9_$-]*$/.test(literal) && endQuote < text.length && skipWhitespace(text, endQuote + 1) === close) name = literal
          }
          parenIdx = k
        }
      }
    }
    if (parenIdx !== -1) {
      const balanced = sliceBalancedArgs(masked, text, parenIdx)
      sites.push({ start: i, end: balanced.closeIdx, innerText: balanced.innerText.trim(), name })
      i += 5
      continue
    }
    i += 1
  }
  return sites
}

