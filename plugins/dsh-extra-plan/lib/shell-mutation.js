// @local/dsh-extra-plan shell mutation helpers.
// Pure command decoding and cross-platform write-shape matching; no host or apply state.

// PWSH 写动词判定（P2 位置判定）：语法级写形态全文本匹配（git 写子命令/.NET 静态/COM FSO/
// Export-Csv/Export-Clixml/Tee-Object/Start-Transcript）；裸写动词按段首词判定（参数位置裸词不再拦）。
export const PWSH_MUTATION = /\bgit\s+(add|commit|checkout|switch|restore|clean|rm|mv|reset)\b|\b(Export-Csv|Export-Clixml|Tee-Object|Start-Transcript)\b|\[System\.IO\.File\]::(WriteAllText|WriteAllBytes|AppendAllText|Delete|Move|Copy|Replace|Encrypt|Decrypt)|\[IO\.File\]::(WriteAllText|WriteAllBytes|AppendAllText|Delete|Move|Copy|Replace|Encrypt|Decrypt)|\[System\.IO\.(FileStream|StreamWriter|BinaryWriter)\]::new|\[System\.IO\.Compression\.ZipFile\]::(CreateFromDirectory|ExtractToDirectory)|\[System\.IO\.Directory\]::(Delete|Move|CreateDirectory)|New-Object\s+-ComObject\s+Scripting\.FileSystemObject/i
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
//   v0.1.7 起：PWSH_MUTATION 已覆盖 .NET 静态方法（System.IO.File/IO.File/FileStream/
//   StreamWriter/BinaryWriter/ZipFile/Directory）、COM Scripting.FileSystemObject、
//   Export-Csv/Export-Clixml/Tee-Object/Start-Transcript；BASH_MUTATION 已覆盖
//   dd of=/install/rsync/truncate/fallocate/shred/wget -O/curl -o/vim/vi/nano/tar -c/zip
//   （Linux 待真机验证）。
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
const INNER_SHELL_WORDS = new Set(['pwsh', 'powershell', 'cmd', 'bash', 'sh'])

export function mutationTextMatches(text, syntaxRe, bareRe, depth) {
  if (text === '' || depth >= 4) return false
  if (syntaxRe.test(text)) return true
  const segs = text.split(/[;\r\n]|\s*&&\s*|\s*\|\|\s*|\s*\|\s*|\s*&\s*/)
  for (let s = 0; s < segs.length; s += 1) {
    const seg = segs[s]
    const first = /^\s*([A-Za-z0-9_.:\/-]+)/.exec(seg)
    if (first === null) continue
    let word = first[1]
    if (SHELL_PREFIX_WORDS.has(word)) {
      const second = /^\s*([A-Za-z0-9_.:\/-]+)/.exec(seg.slice(first[0].length))
      if (second === null) continue
      word = second[1]
    }
    if (INNER_SHELL_WORDS.has(word)) {
      const arg = /-(?:Command|c)\s+(?:"([^"]*)"|'([^']*)')/i.exec(seg)
      if (arg !== null) {
        const inner = arg[1] !== undefined ? arg[1] : arg[2]
        // 内层为另一平台 shell（pwsh 内嵌 bash 或反向）时两侧写形态并判（保守方向=拦）
        if (mutationTextMatches(inner, syntaxRe, bareRe, depth + 1) || mutationTextMatches(inner, PWSH_MUTATION, PWSH_BARE_WORDS, depth + 1) || mutationTextMatches(inner, BASH_MUTATION, BASH_BARE_WORDS, depth + 1)) return true
      }
      continue
    }
    if (bareRe.test(word)) return true
  }
  return false
}

function mutationMatches(commandOf, exec, syntaxRe, bareRe) {
  const cmd = commandOf(exec)
  return cmd !== '' && mutationTextMatches(cmd, syntaxRe, bareRe, 0)
}

export function pwshMutationMatches(exec) { return mutationMatches(pwshCommandOf, exec, PWSH_MUTATION, PWSH_BARE_WORDS) }
export function bashMutationMatches(exec) { return mutationMatches(bashCommandOf, exec, BASH_MUTATION, BASH_BARE_WORDS) }
