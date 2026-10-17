// dsh-extra-plan shell mutation 辅助函数。
// 纯命令解码与跨平台写入形态匹配；不持有 host 或 apply 状态。

// PWSH 写动词判定（P2 位置判定）：语法级写形态全文本匹配（git 写子命令/.NET 静态/COM FSO/
// Export-Csv/Export-Clixml/Tee-Object/Start-Transcript）；裸写动词按段首词判定（参数位置裸词不再拦）。
export const PWSH_MUTATION = /\bgit\s+(add|commit|checkout|switch|restore|clean|rm|mv|reset)\b|\b(Export-Csv|Export-Clixml|Tee-Object|Start-Transcript)\b|\[System\.IO\.File\]::(WriteAllText|WriteAllBytes|AppendAllText|Delete|Move|Copy|Replace|Encrypt|Decrypt)|\[IO\.File\]::(WriteAllText|WriteAllBytes|AppendAllText|Delete|Move|Copy|Replace|Encrypt|Decrypt)|\[System\.IO\.(FileStream|StreamWriter|BinaryWriter)\]::new|\[System\.IO\.Compression\.ZipFile\]::(CreateFromDirectory|ExtractToDirectory)|\[System\.IO\.Directory\]::(Delete|Move|CreateDirectory)|New-Object\s+-ComObject\s+Scripting\.FileSystemObject|(?:(?:[1-6]|\*)?)>>?(?!&(?:[1-6]|\*))/i
export const PWSH_BARE_WORDS = /\b(New-Item|Remove-Item|Rename-Item|Move-Item|Copy-Item|Set-Content|Add-Content|Clear-Content|Out-File|Set-Item|New-ItemProperty|Set-ItemProperty|Remove-ItemProperty|mkdir|rmdir|rd|del|erase|copy|move|ren|rename|xcopy|robocopy)\b/i

// bash 写命令（与 PWSH_MUTATION 严格对等，识别创建/修改/删除文件的操作；P2 起为位置判定）：
//   - 裸命令词：rm/mv/cp/mkdir/rmdir/touch/tee/chmod/chown/ln/install/rsync/truncate/
//     fallocate/shred/zip 按段首词判定——按 ; 换行 && || | & 切段后只判每段首个命令词，
//     段首为 sudo/env/nohup/command 时取下一词；参数位置裸词不再拦（如 grep -rn rm src/、
//     echo "del done" 放行）。
//   - 已知边界（与 PWSH_MUTATION 对等）：语法级写形态出现在参数位置仍全文本命中；位置判定下
//     包管理器命令首词非写动词不拦（此前 install 裸词全文本匹配曾使 npm install -g 误拦，
//     本改动修复）；首词即 install/rsync/truncate/fallocate/shred/zip 仍拦。
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

export function mutationTextMatches(text, syntaxRe, bareRe, depth) {
  if (text === '' || depth >= 4) return false
  if (syntaxRe.test(text)) return true
  const segs = text.split(/[;\r\n]|\s*&&\s*|\s*\|\|\s*|\s*\|\s*|\s*&\s*/)
  for (const seg of segs) {
    const words = shellWords(seg)
    let index = 0
    let steps = 0
    while (index < words.length && steps < 32) {
      steps += 1
      const word = words[index]
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
          if (mutationTextMatches(inner, syntaxRe, bareRe, depth + 1) || mutationTextMatches(inner, PWSH_MUTATION, PWSH_BARE_WORDS, depth + 1) || mutationTextMatches(inner, BASH_MUTATION, BASH_BARE_WORDS, depth + 1)) return true
        }
        break
      }
      if (bareRe.test(word)) return true
      break
    }
  }
  return false
}

function mutationMatches(commandOf, exec, syntaxRe, bareRe) {
  const cmd = commandOf(exec)
  return cmd !== '' && mutationTextMatches(cmd, syntaxRe, bareRe, 0)
}

export function pwshMutationMatches(exec) { return mutationMatches(pwshCommandOf, exec, PWSH_MUTATION, PWSH_BARE_WORDS) }
export function bashMutationMatches(exec) { return mutationMatches(bashCommandOf, exec, BASH_MUTATION, BASH_BARE_WORDS) }
