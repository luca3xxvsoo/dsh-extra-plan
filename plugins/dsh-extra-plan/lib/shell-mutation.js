// dsh-extra-plan shell mutation 辅助函数。
// 纯命令解码与跨平台写入形态匹配；不持有 host 或 apply 状态。

// PWSH 写动词判定（P2 位置判定）：语法级写形态全文本匹配（git 写子命令/.NET 静态/COM FSO/
// Export-Csv/Export-Clixml/Tee-Object/Start-Transcript）；裸写动词按命令位判定——段首、块关键字
// 之后、块体左花括号之后均为命令位，参数位整词一律放行（不再只看段首单点）。
export const PWSH_MUTATION = /\bgit\s+(add|commit|checkout|switch|restore|clean|rm|mv|reset)\b|\b(Export-Csv|Export-Clixml|Tee-Object|Start-Transcript)\b|\[System\.IO\.File\]::(WriteAllText|WriteAllBytes|AppendAllText|Delete|Move|Copy|Replace|Encrypt|Decrypt)|\[IO\.File\]::(WriteAllText|WriteAllBytes|AppendAllText|Delete|Move|Copy|Replace|Encrypt|Decrypt)|\[System\.IO\.(FileStream|StreamWriter|BinaryWriter)\]::new|\[System\.IO\.Compression\.ZipFile\]::(CreateFromDirectory|ExtractToDirectory)|\[System\.IO\.Directory\]::(Delete|Move|CreateDirectory)|New-Object\s+-ComObject\s+Scripting\.FileSystemObject|(?:(?:[1-6]|\*)?)>>?(?!&(?:[1-6]|\*))/i
export const PWSH_BARE_WORDS = /\b(New-Item|Remove-Item|Rename-Item|Move-Item|Copy-Item|Set-Content|Add-Content|Clear-Content|Out-File|Set-Item|New-ItemProperty|Set-ItemProperty|Remove-ItemProperty|mkdir|rmdir|rd|del|erase|copy|move|ren|rename|xcopy|robocopy)\b/i

// bash 写命令（与 PWSH_MUTATION 严格对等，识别创建/修改/删除文件的操作；P2 起为位置判定）：
//   - 裸命令词：rm/mv/cp/mkdir/rmdir/touch/tee/chmod/chown/ln/install/rsync/truncate/
//     fallocate/shred/zip 按命令位判定——按 ; 换行 && || | & 切段后每段跑命令位状态机：
//     段首、块关键字（try/if/for/while/else 等）之后、块体左花括号之后、块体右花括号
//     收尾后（衔接 catch/finally/else/elseif/while 续块）均为命令位，
//     参数位整词一律放行（如 grep -rn rm src/、echo "del done"、echo if then rm、
//     参数位的花括号 echo { rm } 放行）；
//     段首为 sudo/env/nohup/command 时跳过包装词与选项，其后的命令词仍按命令位判定。
//   - 已知边界（与 PWSH_MUTATION 对等）：语法级写形态出现在参数位置仍全文本命中；命令位判定下
//     包管理器命令首词非写动词不拦（此前 install 裸词全文本匹配曾使 npm install -g 误拦，
//     本改动修复）；首词即 install/rsync/truncate/fallocate/shred/zip 仍拦。
//   - 已知边界（新增①）：块内嵌套 shell（如 bash -c '…'、pwsh -Command '…'）的递归判定受
//     depth 上限约束（depth >= 4 直接返回 false），超深嵌套中的写形态可能漏拦。
//   - 已知边界（新增②）：引号内出现「分号 + 块关键字」组合时分段不识别引号（既有边界），
//     可能在引号内部切段并按命令位判定，属已知误判面。
//   - git 写子命令：add/commit/checkout/switch/restore/clean/rm/mv/reset
//   - sed 原地修改：sed -i / sed -i.bak / sed --in-place（sed\s+(?:--in-place\b|(?:-[A-Za-z]*\s+)*-i\b)：
//     覆盖 -i 前带其他短选项（如 sed -n -i），且不误拦 sed 脚本内容里的 -i 字符串
//     （如 sed 's/-i/x/' file 只读输出）；残余边界（极罕见）：-e 带脚本参数后再 -i
//     的复合写法会漏拦，PWSH 无对等物，按严格对等不扩大）
//   - 重定向写：> >> 2> 2>> &> >&（fd→fd 重定向属只读管道不拦截：2>&1/1>&2 由
//     [0-9]?>>? 后负向前瞻排除 &N；>&2 由 >& 后负向前瞻排除数字）

export const BASH_MUTATION = /git\s+(add|commit|checkout|switch|restore|clean|rm|mv|reset)\b|sed\s+(?:--in-place\b|(?:-[A-Za-z]*\s+)*-i\b)|(?:[0-9]?>>?(?!&\d)|&>|>&(?!\d))|\bdd\b[^|]*\sof=|wget\s+.*-O\b|curl\s+.*-o\b|\bvi(m)?\s+\S|\bnano\s+\S|tar\s+-[A-Za-z]*c/i
export const BASH_BARE_WORDS = /\b(rm|mv|cp|mkdir|rmdir|touch|tee|chmod|chown|ln|install|rsync|truncate|fallocate|shred|zip)\b/i

export function commandTextOf(exec) {
  const raw = exec.arguments
  if (raw === undefined || raw === null) return ''
  if (typeof raw === 'string') {
    if (raw.length === 0) return ''
    let parsed = null
    try { parsed = JSON.parse(raw) } catch (error) { /* 非 JSON，原样使用 */ }
    if (parsed !== null && typeof parsed === 'object' && typeof parsed.command === 'string') return parsed.command
    return raw
  }
  if (typeof raw === 'object' && typeof raw.command === 'string') return raw.command
  return ''
}

export function pwshCommandOf(exec) { return commandTextOf(exec) }
export function bashCommandOf(exec) { return commandTextOf(exec) }

const SHELL_PREFIX_WORDS = new Set(['sudo', 'env', 'nohup', 'command'])
const INNER_SHELL_WORDS = new Set(['pwsh', 'powershell', 'cmd', 'cmd.exe', 'bash', 'sh'])

function shellWords(segment) {
  const words = []
  let index = 0
  while (index < segment.length) {
    while (index < segment.length && /\s/.test(segment[index])) index += 1
    if (index >= segment.length) break
    const quote = segment[index] === "'" || segment[index] === '"' ? segment[index] : ''
    if (quote !== '') {
      index += 1
      let value = ''
      while (index < segment.length) {
        if (segment[index] === '\\' && index + 1 < segment.length) { value += segment[index + 1]; index += 2; continue }
        if (segment[index] === quote) { index += 1; break }
        value += segment[index]
        index += 1
      }
      words.push(value)
      continue
    }
    const start = index
    while (index < segment.length && !/\s/.test(segment[index])) index += 1
    words.push(segment.slice(start, index))
  }
  return words
}

const WRAPPER_OPTION_WITH_VALUE = new Set(['-u', '-g', '-h', '-C', '-p', '--user', '--group', '--chdir', '--host', '--unset', '--prompt'])

function isInnerShellWord(word) {
  const normalized = word.toLowerCase()
  return INNER_SHELL_WORDS.has(normalized) || /(?:^|[\\/])cmd\.exe$/.test(normalized)
}
function isEnvAssignment(word) {
  return /^[A-Za-z_][A-Za-z0-9_]*=/.test(word)
}

// 块头关键字按 shell 语法比较：PowerShell 不区分大小写，bash 保留区分大小写；其后应跟块体左花括号。
const SHELL_BLOCK_HEAD_WORDS = new Set(['try', 'catch', 'finally', 'if', 'elseif', 'else', 'foreach', 'for', 'while', 'do', 'switch'])
// 段首块关键字（整词等值比较）：以段首形式出现、其后不跟花括号，其后仍是命令位。
const SHELL_BLOCK_SEGMENT_WORDS = new Set(['then', 'do', 'else', 'elif', 'fi', 'done', 'esac', 'in'])

function syntaxRuleOf(syntaxRe) {
  if (syntaxRe === PWSH_MUTATION) return 'PWSH_MUTATION'
  if (syntaxRe === BASH_MUTATION) return 'BASH_MUTATION'
  return null
}

function bareRuleOf(bareRe) {
  if (bareRe === PWSH_BARE_WORDS) return 'PWSH_BARE_WORDS'
  if (bareRe === BASH_BARE_WORDS) return 'BASH_BARE_WORDS'
  return null
}

export function mutationTextEvidence(text, syntaxRe, bareRe, depth) {
  if (text === '' || depth >= 4) return null
  const isPowerShell = syntaxRe === PWSH_MUTATION || bareRe === PWSH_BARE_WORDS
  if (syntaxRe.test(text)) {
    const rule = syntaxRuleOf(syntaxRe)
    return rule === null ? null : { rule, value: '' }
  }
  const segs = text.split(/[;\r\n]|\s*&&\s*|\s*\|\|\s*|\s*\|\s*|\s*&\s*/)
  for (const seg of segs) {
    const words = shellWords(seg)
    let index = 0
    let steps = 0
    let expectCommand = true
    let blockPending = false
    let blockDepth = 0
    while (index < words.length && steps < 32) {
      steps += 1
      const word = words[index]
      // 步骤A：块头关键字之后等待块体左花括号；非花括号词一律跳过，不参与裸写动词判定
      if (blockPending) {
        if (word === '{') { blockPending = false; blockDepth += 1; expectCommand = true }
        index += 1
        continue
      }
      // 步骤B：块体右花括号只收尾（块深度出栈）；真实块体收尾后回到命令位，
      // 以便识别同一段内紧随其后的 catch/finally/else/elseif/while 等续块关键字
      // （否则 try { … } catch { Remove-Item x } 的 catch 块会漏拦）。
      if (word === '}') {
        if (blockDepth > 0) { blockDepth -= 1; expectCommand = true }
        index += 1
        continue
      }
      // 步骤C：块体左花括号之后恢复命令位（switch/case 内嵌块、无关键字块等）；
      // 只有「块体」左花括号算数——已在块内或正处于命令位时的 { 才开块，
      // 参数位的花括号（如 echo { rm }）按普通参数放行，不恢复命令位。
      if (word === '{') {
        if (blockDepth > 0 || expectCommand) { blockDepth += 1; expectCommand = true }
        index += 1
        continue
      }
      // 步骤D：只有命令位才参与裸写动词判定
      if (expectCommand) {
        if (isEnvAssignment(word)) { index += 1; continue }
        if (SHELL_PREFIX_WORDS.has(word)) {
          index += 1
          while (index < words.length) {
            const option = words[index]
            if (isEnvAssignment(option)) { index += 1; continue }
            if (option === '--') { index += 1; break }
            if (!option.startsWith('-')) break
            if (WRAPPER_OPTION_WITH_VALUE.has(option) && index + 1 < words.length) index += 2
            else index += 1
          }
          continue
        }
        if (isInnerShellWord(word)) {
          let commandIndex = index + 1
          while (commandIndex < words.length && !/^(?:-Command|-c|\/c)$/i.test(words[commandIndex])) commandIndex += 1
          if (commandIndex + 1 < words.length) {
            const inner = words[commandIndex + 1]
            const nestedEvidence = mutationTextEvidence(inner, syntaxRe, bareRe, depth + 1)
            if (nestedEvidence !== null) return nestedEvidence
            const pwshEvidence = mutationTextEvidence(inner, PWSH_MUTATION, PWSH_BARE_WORDS, depth + 1)
            if (pwshEvidence !== null) return pwshEvidence
            const bashEvidence = mutationTextEvidence(inner, BASH_MUTATION, BASH_BARE_WORDS, depth + 1)
            if (bashEvidence !== null) return bashEvidence
          }
          break
        }
        // 段首块关键字先于块头关键字判定：do/else 同属两集合，而它们后面通常直接跟命令
        // （bash 的 while true; do touch f; done、if …; else rm x; fi），按块头处理会把
        // 其后整段命令吞掉漏拦；两者都只把后面的词留在命令位。
        const blockWord = isPowerShell ? word.toLowerCase() : word
        if (SHELL_BLOCK_SEGMENT_WORDS.has(blockWord)) { index += 1; continue }
        if (SHELL_BLOCK_HEAD_WORDS.has(blockWord)) { blockPending = true; index += 1; continue }
        const bareMatch = bareRe.exec(word)
        if (bareMatch !== null) {
          const rule = bareRuleOf(bareRe)
          const value = bareMatch[1]
          if (rule !== null && typeof value === 'string') return { rule, value }
        }
        expectCommand = false
        index += 1
        continue
      }
      // 步骤E：非命令位（参数位）整词一律放行
      index += 1
    }
  }
  return null
}

export function mutationTextMatches(text, syntaxRe, bareRe, depth) {
  return mutationTextEvidence(text, syntaxRe, bareRe, depth) !== null
}

function mutationEvidence(commandOf, exec, syntaxRe, bareRe) {
  const cmd = commandOf(exec)
  return cmd !== '' ? mutationTextEvidence(cmd, syntaxRe, bareRe, 0) : null
}

export function pwshMutationEvidence(exec) { return mutationEvidence(pwshCommandOf, exec, PWSH_MUTATION, PWSH_BARE_WORDS) }
export function bashMutationEvidence(exec) { return mutationEvidence(bashCommandOf, exec, BASH_MUTATION, BASH_BARE_WORDS) }
export function pwshMutationMatches(exec) { return pwshMutationEvidence(exec) !== null }
export function bashMutationMatches(exec) { return bashMutationEvidence(exec) !== null }
