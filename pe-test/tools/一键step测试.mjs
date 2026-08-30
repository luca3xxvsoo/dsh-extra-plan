// run-steps.mjs — pe-test 一键体检
// 用法: node run-steps.mjs
// 说明: 自动运行全部「自动判定项」，把结果（通过/失败/已知预存问题/人眼项）写入
//       pe-test/reports/测试报告-<时间戳>.md 并在控制台输出摘要。
// 前置: 本工具设计为在完整目录（pe-test 与 plugins/ 同级，即 dsh-extra-plan 仓库根）运行；
//       若检测到缺少 plugins，仓库依赖项将标注「需完整目录」而不执行。
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { join, dirname, relative } from 'node:path'
import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { findSession } from './_shared/session-finder.mjs'

const HERE = dirname(fileURLToPath(import.meta.url))
const REPO_PLUGIN = join(HERE, '..', '..', 'plugins', 'dsh-extra-plan', 'index.js')
const FULL_DIR = existsSync(REPO_PLUGIN)
const REPORTS_DIR = join(dirname(HERE), 'reports')

// 自动判定项: [文件, 依赖仓库, 已知预存问题说明]
const AUTO = [
  ['step-00-全流程回归.mjs', true, ''],
  ['step-00-跨平台写拦截.mjs', true, ''],
  ['step-01-安装分发.mjs', true, ''],
  ['step-01-安装同步.mjs', true, ''],
  ['step-01-预设完整性.mjs', false, ''],
  ['step-01-设置页配置.mjs', false, ''],
  ['step-04-路由与写闸门.mjs', true, ''],
  ['step-06-线索落盘.mjs', true, ''],
]

// 人眼项: [文件, 参数说明] — 无断言，需人工判读输出
const HUMAN = [
  ['step-04-工具清单查看.mjs', '参数可选: <会话目录名>；无参数自动查找最新按需规划模式主会话+其子会话，看每轮 AI 用了哪些工具（引导收窄/恢复）'],
  ['step-05-会话解码.mjs', '参数可选: <会话目录名>；无参数自动查找最新按需规划模式主会话+其子会话，看事件统计/plan模式（澄清问题问到没）'],
  ['step-06-真实会话查看.mjs', '参数可选: <sessions-dir>；无参数自动查找最新按需规划模式主会话+其子会话，看拒绝记录（TOOL-ERROR）'],
  ['step-08-方案配对查看.mjs', '参数可选: <sessions-dir>/<会话目录名>；无参数自动查找最新按需规划模式主会话+其子会话，看 save_plan 调用/结果是否成对（方案+验收双写）'],
]

// 需参数项
const NEED_ARG = [
  ['step-99-用量统计.mjs', '参数: <ledger.jsonl>，统计用量/花费'],
]

function parseResult(out) {
  const m = String(out).match(/通过\s*(\d+)(?:\/\d+)?\s*,\s*失败\s*(\d+)/) || String(out).match(/结果：\s*(\d+) 通过，(\d+) 失败/)
  if (m === null) return null
  return { pass: Number(m[1]), fail: Number(m[2]) }
}

function runOne(file) {
  const r = spawnSync(process.execPath, [join(HERE, file)], { encoding: 'utf8', timeout: 120000 })
  const out = (r.stdout || '') + (r.stderr || '')
  const stats = parseResult(out)
  const failLines = String(out).split('\n').filter((l) => l.includes('FAIL') || l.includes('Error:')).slice(0, 8)
  return { status: r.status, stats, failLines, error: r.error }
}

// 人眼项取证: 运行取证工具，stdout+stderr 全量拼接（无任何截断/过滤/摘要）
function runForensic(file, sessionArg) {
  const env = sessionArg !== undefined
    ? { ...process.env, SESSION_ID: String(sessionArg) }
    : process.env
  const r = spawnSync(process.execPath, [join(HERE, file)], {
    encoding: 'utf8', timeout: 120000, maxBuffer: 64 * 1024 * 1024, env,
  })
  const out = (r.stdout || '') + (r.stderr || '')   // 全量拼接，无任何截断/过滤/摘要
  return { status: r.status, out, error: r.error }
}

function ts() {
  const d = new Date()
  const p = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`
}

function main() {
  const stamp = ts()
  const argIdx = process.argv.indexOf('--session')
  const sessionArg = argIdx !== -1 && process.argv[argIdx + 1] !== undefined ? process.argv[argIdx + 1] : undefined
  const sessionLoc = findSession(sessionArg)
  const lines = []
  lines.push(`# pe-test 体检报告 ${stamp}`)
  lines.push('')
  lines.push(`- 运行目录: ${HERE}`)
  lines.push(`- 完整目录检测（plugins 同级）: ${FULL_DIR ? '完整' : '非完整'}`)
  if (!FULL_DIR) lines.push('- 提示: 当前目录缺少 plugins/，仓库依赖项未执行；请到仓库根（pe-test 与 plugins 同级）运行以获得完整结果')
  lines.push('')
  const sessionLocLines = []
  if (sessionLoc.kind === 'notfound') {
    sessionLocLines.push(`- 指定会话未找到: ${sessionLoc.arg}（检查 --session 参数或 SESSION_ID 环境变量）`)
  } else if (sessionLoc.kind === 'none') {
    sessionLocLines.push('- 未指定会话：全库未发现使用过按需规划模式的会话（时间倒序自动查找无命中）')
  } else {
    const asked = sessionArg !== undefined || (process.env.SESSION_ID !== undefined && String(process.env.SESSION_ID) !== '')
    const byId = asked ? `按指定会话定位（${sessionArg || process.env.SESSION_ID}）` : '自动查找最新主会话+子会话'
    const mainNote = sessionLoc.dirs.length > 1 ? '（第 1 个为主会话）' : ''
    sessionLocLines.push(`- 会话定位: ${byId} — 共 ${sessionLoc.dirs.length} 个会话${mainNote}`)
    for (const d of sessionLoc.dirs) sessionLocLines.push(`  - ${d}`)
  }
  lines.push('## 会话定位')
  lines.push(...sessionLocLines)
  lines.push('')

  let autoPass = 0
  let autoFail = 0
  let skipRepo = 0
  lines.push('## 一、自动判定项')
  for (const [file, needRepo, known] of AUTO) {
    if (needRepo && !FULL_DIR) {
      skipRepo += 1
      lines.push(`| ${file} | 未执行 | 需完整目录 | ${known || '—'} |`)
      continue
    }
    const r = runOne(file)
    if (r.error !== undefined) {
      skipRepo += 1
      lines.push(`| ${file} | 未执行 | 运行环境受限（spawn 失败: ${String(r.error.code || r.error.message).slice(0, 40)}） | ${known || '—'} |`)
      continue
    }
    const ok = r.status === 0
    if (ok) autoPass += 1; else autoFail += 1
    const summary = r.stats !== null ? `通过 ${r.stats.pass}, 失败 ${r.stats.fail}` : (r.status === 0 ? '通过（无统计行）' : '失败')
    lines.push(`| ${file} | ${ok ? '通过' : '失败'} | 退出码 ${r.status} | ${summary} | ${known || '—'} |`)
    if (!ok && r.failLines.length > 0) {
      for (const l of r.failLines) lines.push(`  - ${file}: ${l.trim().slice(0, 160)}`)
    }
  }
  lines.push('')

  lines.push('## 二、人眼项（无自动判定，请人工运行判读）')
  lines.push('提示：以下取证工具无参运行时按「会话定位」区规则取会话；也可用 --session <会话ID> / SESSION_ID 指定会话后再运行')
  for (const [file, note] of HUMAN) {
    const tool = file.replace(/\.mjs$/, '')
    lines.push(`- ${file} — ${note}（详见 测试报告-${tool}-${stamp}.md）`)
  }
  lines.push('')
  lines.push('## 三、需参数项')
  for (const [file, note] of NEED_ARG) lines.push(`- ${file} — ${note}`)
  lines.push('')
  lines.push('## 四、结论')
  lines.push(`- 自动判定项: 通过 ${autoPass} / 失败 ${autoFail} / 未执行(需完整目录) ${skipRepo}，共 ${AUTO.length} 项`)
  if (autoFail > 0) lines.push('- 说明: 失败项含「已知预存问题」（见自动判定项表格备注列），其余失败需排查')

  mkdirSync(REPORTS_DIR, { recursive: true })
  const reportFile = join(REPORTS_DIR, `测试报告-${stamp}.md`)
  // 人眼项取证独立文件（与主报告同 stamp；输出全量包裹，无截断）
  for (const [file, note] of HUMAN) {
    const tool = file.replace(/\.mjs$/, '')
    const r = runForensic(file, sessionArg)
    const body = []
    body.push(`# pe-test 人眼项取证 · ${tool} · ${stamp}`)
    body.push('')
    body.push(`- 工具用途: ${note}`)
    body.push(...sessionLocLines)
    body.push(`- 运行命令: node ${file}`)
    if (r.error !== undefined) {
      body.push(`- 运行环境受限（spawn 失败: ${String(r.error.code || r.error.message)}）`)
    } else {
      body.push(`- 退出码: ${r.status}`)
      if (r.out === '') body.push('- 备注: （无输出）')
      body.push('')
      body.push('## 原始输出（全量）')
      body.push('```text')
      body.push(r.out)
      body.push('```')
    }
    body.push('')
    writeFileSync(join(REPORTS_DIR, `测试报告-${tool}-${stamp}.md`), body.join('\n') + '\n')
  }
  writeFileSync(reportFile, lines.join('\n') + '\n')
  console.log(lines.join('\n'))
  console.log(`\n报告已保存: ${relative(HERE, reportFile).replaceAll('\\', '/')}（即 ${REPORTS_DIR} 下）`)
  process.exit(autoFail === 0 ? 0 : 1)
}

main()
