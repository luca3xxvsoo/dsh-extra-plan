#!/usr/bin/env node
// step-00-跨平台写拦截.mjs —— 跨平台只读防线测试（纯 Node，三平台通用）
// ============================================================================
// 用途：验证 extra-plan 的 bash/pwsh 写命令拦截逻辑（decisions 纯函数）在
//       Windows / Linux / macOS 上行为一致。deny 决策完全由 decisions 导出的
//       纯函数决定（平台无关），因此本脚本通过即锁定「Linux/macOS 上 bash
//       分支会正确拦截/放行」的全部逻辑层。
//
// 用法（三平台一致）：
//   node step-00-跨平台写拦截.mjs
//   全部通过退出码 0；任一失败退出码 1（可接入 CI）。
//
// 在 GitHub Actions 中（.github/workflows）跑三平台矩阵：
//   strategy: { matrix: { os: [ubuntu-latest, macos-latest, windows-latest] } }
//   runs-on: ${{ matrix.os }}
//   steps: checkout → node-version 20 → run: node step-00-跨平台写拦截.mjs
//   （可追加真实 shell 冒烟：bash 平台跑 bash -c "..."、Windows 跑 pwsh -c "..."）
//
// 在 WSL2 中跑（本地真 Linux）：
//   wsl -e bash -lc "cd <工作区>/extra-plan && node step-00-跨平台写拦截.mjs"
//
// 说明：本脚本只依赖 Node 标准库与 decisions 导出，不做任何文件写操作。
// ============================================================================

import { decisions } from '../../plugins/dsh-extra-plan/index.js'

const {
  BASH_MUTATION,
  PWSH_MUTATION,
  bashCommandOf,
  bashMutationMatches,
  pwshCommandOf,
  pwshMutationMatches,
} = decisions

let pass = 0
let fail = 0
const failures = []

function check(label, cond) {
  if (cond) {
    pass += 1
    console.log(`  PASS  ${label}`)
  } else {
    fail += 1
    failures.push(label)
    console.log(`  FAIL  ${label}`)
  }
}

// 模拟 pre-execute 闸门的 shell 写命令判定（与 index.js 三处分支同口径）。
function gateDeny(exec) {
  if (exec.name === 'bash') return bashMutationMatches(exec)
  if (exec.name === 'pwsh') return pwshMutationMatches(exec)
  return false
}

// 构造 bash 工具调用（支持对象 / JSON 字符串两种 arguments 形状）。
function bashExec(cmd, shape = 'object') {
  if (shape === 'object') return { name: 'bash', arguments: { command: cmd } }
  return { name: 'bash', arguments: JSON.stringify({ command: cmd }) }
}
function pwshExec(cmd, shape = 'object') {
  if (shape === 'object') return { name: 'pwsh', arguments: { command: cmd } }
  return { name: 'pwsh', arguments: JSON.stringify({ command: cmd }) }
}

console.log('== [任务1] BASH_MUTATION：应拦截的 bash 写命令（验收任务1.3 + 边界） ==')
const bashShouldDeny = [
  'rm -rf /tmp/test',
  'echo "hello" > file.txt',
  'git add . && git commit -m "msg"',
  "sed -i 's/old/new/' file.txt",
  'mkdir -p newdir && cp a.txt newdir/',
  'chmod +x script.sh',
  'touch newfile.txt',
  'tee output.log',
  // sed 原地修改（收紧后仍拦截）
  "sed -n -i 's/x/y/' file.txt",
  "sed -i.bak 's/x/y/' file.txt",
  "sed --in-place 's/x/y/' file.txt",
  // 附加边界（写操作）
  'rm file.txt',
  'sudo rm -rf /var/tmp/x',
  'git reset HEAD~1',
  'git switch feature',
  'git clean -fd',
  'ls 2> err.txt',
  'cmd &> out.txt',
  'ln -s /etc/hosts link',
  'mv a.txt b.txt',
  'cp -r src/ dst/',
  'chown user:group file.txt',
  'nano notes.txt',       // 文本编辑器写文件：拦截（v0.1.7 起 BASH_MUTATION 覆盖 nano/vim/vi）
]
for (const cmd of bashShouldDeny) check(`应拦截 bash: ${cmd}`, gateDeny(bashExec(cmd)) === true)

console.log('== [任务1] BASH_MUTATION：不应拦截的 bash 只读命令（验收任务1.4 + 边界） ==')
const bashShouldAllow = [
  'ls -la',
  'cat file.txt',
  'grep "pattern" file.txt',
  'git status',
  'find . -name "*.js"',
  'echo "hello"',
  'git log --oneline',
  'diff file1.txt file2.txt',
  'head -n 10 file.txt',
  'wc -l file.txt',
  // 附加边界（只读 / fd→fd 重定向 / 已知边界命令）
  'node --version',
  'git branch',
  'git diff --stat',
  'git show HEAD',
  'git grep TODO',
  'ls 2>&1',
  'echo x 1>&2',
  'which node',
  'env | grep PATH',
  'pwd',
  'whoami',
  'tar -tf archive.tar', // 已知边界：tar 只读列目录不拦截
  'npm ls --depth=0',    // 已知边界：npm 只读子命令不拦截
  "sed 's/-i/x/' file.txt", // sed 只读输出，参数含 -i 字符串不误拦（收紧后）
]
for (const cmd of bashShouldAllow) check(`放行 bash: ${cmd}`, gateDeny(bashExec(cmd)) === false)

console.log('== [任务2/3] bashCommandOf 双形状（对象 / JSON 字符串） ==')
check('对象形状 arguments.command', bashCommandOf(bashExec('rm x')) === 'rm x')
check('字符串 JSON arguments', bashCommandOf(bashExec('rm x', 'string')) === 'rm x')
check('空 arguments → 空串', bashCommandOf({ name: 'bash', arguments: undefined }) === '')
check('空 command 对象 → 空串', bashCommandOf({ name: 'bash', arguments: { command: '' } }) === '')
check('bashMutationMatches 命中', bashMutationMatches(bashExec('rm x')) === true)
check('bashMutationMatches 放行只读', bashMutationMatches(bashExec('ls -la')) === false)

console.log('== pwsh 对等回归（PWSH_MUTATION 行为不变） ==')
const pwshShouldDeny = [
  'Remove-Item x',
  'Set-Content f.txt "x"',
  'Copy-Item a b',
  'git add .',
  'New-Item -ItemType File f.txt',
  'Out-File f.txt',
]
for (const cmd of pwshShouldDeny) check(`应拦截 pwsh: ${cmd}`, gateDeny(pwshExec(cmd)) === true)
const pwshShouldAllow = [
  'Get-ChildItem',
  'Get-Content f.txt',
  'git status',
  'Select-String "pattern" f.txt',
  'Get-Item x',
]
for (const cmd of pwshShouldAllow) check(`放行 pwsh: ${cmd}`, gateDeny(pwshExec(cmd)) === false)
check('pwshCommandOf 对象形状', pwshCommandOf(pwshExec('Get-ChildItem')) === 'Get-ChildItem')
check('pwshCommandOf 字符串 JSON', pwshCommandOf(pwshExec('Get-ChildItem', 'string')) === 'Get-ChildItem')

console.log('== 正则对象可导出（供测试复用） ==')
check('BASH_MUTATION 是 RegExp', BASH_MUTATION instanceof RegExp)
check('PWSH_MUTATION 是 RegExp', PWSH_MUTATION instanceof RegExp)

console.log('')
console.log(`结果：${pass} 通过，${fail} 失败`)
if (fail > 0) {
  console.log('失败项：')
  for (const f of failures) console.log(`  - ${f}`)
  process.exit(1)
}
process.exit(0)
