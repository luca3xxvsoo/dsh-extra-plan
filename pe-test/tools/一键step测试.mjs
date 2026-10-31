// 一键step测试.mjs — 运行工作区回归矩阵，并分类 AUTO/SKIP/HUMAN 结果。
// 用法: node 一键step测试.mjs；报告在 W，子进程 capture/home/temp/cache 均在 W fixture；依赖缺失不伪装为通过。
import { spawnSync } from 'node:child_process'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { join, dirname, relative } from 'node:path'
import { closeSync, existsSync, mkdirSync, mkdtempSync, openSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
let findSession
let createMaintenanceContext
let parseMaintenanceArgs
let createIsolatedEnv
let makeFixtureDir
let writeRawEvidence
let maintenanceArgs
let maintenanceContext
let commonForwardArgs = []

const HERE = dirname(fileURLToPath(import.meta.url))
const REPO_PLUGIN = join(HERE, '..', '..', 'plugins', 'dsh-extra-plan', 'index.js')
const FULL_DIR = existsSync(REPO_PLUGIN)
const REPORTS_DIR = join(dirname(HERE), 'reports')
const HOST_PRELOAD = join(HERE, '..', '_shared', 'host-preload.mjs')
let output
let runnerFixture
let runnerEnv

async function loadRuntimeHelpers() {
  const [pathHelpers, outputHelpers] = await Promise.all([
    import('../_shared/workspace-paths.mjs'),
    import('../_shared/test-output.mjs'),
  ])
  parseMaintenanceArgs = pathHelpers.parseMaintenanceArgs
  createMaintenanceContext = pathHelpers.createMaintenanceContext
  maintenanceArgs = parseMaintenanceArgs(process.argv.slice(2))
  maintenanceContext = createMaintenanceContext(maintenanceArgs)
  commonForwardArgs = maintenanceForwardArgsOf(process.argv.slice(2))
  createIsolatedEnv = pathHelpers.createIsolatedEnv
  makeFixtureDir = pathHelpers.makeFixtureDir
  output = outputHelpers.createOutput({ argv: maintenanceArgs.domainArgv })
  writeRawEvidence = outputHelpers.writeRawEvidence
  const sessionArg = selectedSessionValueOf()
  if (selectedSessionOf(sessionArg) !== undefined) {
    const finderHelpers = await import('../_shared/session-finder.mjs')
    findSession = finderHelpers.findSession
  }
}

// 自动判定项: [文件, 依赖仓库, 已知预存问题说明]
const AUTO = [
  ['step-00-路径边界.mjs', true, ''],
  ['step-00-全流程回归.mjs', true, ''],
  ['step-06-08-v4取证回归.mjs', true, ''],
  ['step-00-跨平台写拦截.mjs', true, ''],
  ['step-01-设置迁移.mjs', true, ''],
  ['step-01-安装同步.mjs', true, ''],
  ['step-01-预设完整性.mjs', true, ''],
  ['step-01-设置页配置.mjs', true, ''],
  ['step-01-qqbot-安装映射.mjs', true, ''],
  ['step-01-qqbot-环境验证.mjs', true, ''],
  ['step-04-路由与写闸门.mjs', true, ''],
  ['step-04-context-gate宿主回归.mjs', true, '受控adapter/工作区JSONL集成；真实provider与HUMAN另列NOT-RUN'],
  ['step-06-线索落盘.mjs', true, ''],
  // 代码地图一致性（--check：不写盘；地图过期/漏检/导航失效 → 退出码 1）
  ['代码地图生成.mjs', true, '', ['--check']],
]

// 人眼项: [文件, 参数说明] — 无断言，需人工判读输出
const HUMAN = [
  ['step-04-工具清单查看.mjs', '完整模式必须显式传入单会话目录，并可附 --messages 与 --request-trace <工作区trace>；旧摘要模式仍可选'],
  ['step-05-会话解码.mjs', '必须显式传入 <会话目录名> 或公共 --session + --sessions-dir；不自动查找最新会话，看事件统计/plan模式（澄清问题问到没）'],
  ['step-06-真实会话查看.mjs', '仅支持 v4 会话日志（session.v4.jsonl.zstd）；参数可选: <sessions-dir>，查看拒绝记录（TOOL-ERROR）'],
  ['step-07-子代理模型与引导取证.mjs', '仅支持 v4 会话日志（session.v4.jsonl.zstd）；必须通过一键参数 --session <顶层主会话ID> + --sessions-dir 精确选择，并继承调用者显式提供的 PLANNER_PROMPT_SUFFIX，查看 pro规划/非pro规划 child 的 route/provenance/suffix 分栏'],
  ['step-08-方案配对查看.mjs', '仅支持 v4 会话日志（session.v4.jsonl.zstd）；参数可选: <sessions-dir>/<会话目录名>，查看 save_plan 调用/结果是否成对（方案+验收双写）'],
]

const MODE_FORENSIC_FILES = new Set([
  'step-04-工具清单查看.mjs',
  'step-05-会话解码.mjs',
  'step-07-子代理模型与引导取证.mjs',
])
const STEP07_FILE = 'step-07-子代理模型与引导取证.mjs'
const STEP04_FILE = 'step-04-工具清单查看.mjs'
const COMMON_VALUE_OPTIONS = new Set(['--host-root', '--profile', '--session-dir', '--session', '--sessions-dir', '--request-trace'])

function maintenanceForwardArgsOf(args = []) {
  const forwarded = []
  for (let index = 0; index < args.length; index += 1) {
    const arg = String(args[index])
    if (arg === '--discover-children') { forwarded.push(arg); continue }
    if (!COMMON_VALUE_OPTIONS.has(arg)) continue
    const value = args[index + 1]
    if (value === undefined) continue
    forwarded.push(arg, String(value))
    index += 1
  }
  return forwarded
}
function selectedSessionValueOf() {
  const session = maintenanceContext === undefined || maintenanceContext === null ? null : maintenanceContext.session
  if (session !== null && typeof session === 'object') {
    if (session.mode === 'id' && typeof session.id === 'string') return session.id
    if (session.mode === 'dir' && typeof (session.dir || session.sessionDir) === 'string') return session.dir || session.sessionDir
  }
  const domainArgv = maintenanceArgs === undefined || maintenanceArgs === null ? [] : maintenanceArgs.domainArgv
  return domainArgv.find((value) => !String(value).startsWith('--'))
}
function commonArgsFor(file) {
  const args = []
  for (let index = 0; index < commonForwardArgs.length; index += 1) {
    const arg = commonForwardArgs[index]
    if (arg === '--request-trace' && file !== STEP04_FILE) { index += 1; continue }
    args.push(arg)
    if (COMMON_VALUE_OPTIONS.has(arg)) { args.push(commonForwardArgs[index + 1]); index += 1 }
  }
  return args
}
export function forensicArgs(file, sessionArg, extraCommonArgs = []) {
  const args = []
  const commonArgs = extraCommonArgs.length > 0 ? extraCommonArgs : commonArgsFor(file)
  args.push(...commonArgs)
  const hasPublicSelection = commonArgs.includes('--session') || commonArgs.includes('--session-dir')
  if (sessionArg !== undefined && !hasPublicSelection) {
    if (file === STEP07_FILE) args.push('--session', String(sessionArg))
    else args.push(String(sessionArg))
  }
  if (MODE_FORENSIC_FILES.has(file)) args.push('--full')
  return args
}

function selectedSessionOf(sessionArg) {
  if (sessionArg !== undefined && String(sessionArg).trim() !== '') return String(sessionArg)
  return undefined
}

export function forensicNotRunReason(file, sessionArg, env = process.env) {
  const reasons = []
  if (selectedSessionOf(sessionArg) === undefined) reasons.push('缺少显式会话选择（--session/--session-dir或明确位置参数）')
  if (file === STEP07_FILE && !Object.prototype.hasOwnProperty.call(env, 'PLANNER_PROMPT_SUFFIX')) reasons.push('调用环境未显式提供 PLANNER_PROMPT_SUFFIX')
  return reasons.length === 0 ? null : 'NOT-RUN: ' + file + ' ' + reasons.join('；')
}

export function forensicCommand(file, args = []) {
  return ['node', file, ...args].map((value) => /[\s"']/u.test(String(value)) ? JSON.stringify(String(value)) : String(value)).join(' ')
}

// 需参数项
const NEED_ARG = [
  ['step-99-用量统计.mjs', '参数: <ledger-v2.jsonl>；普通相对输入固定为W目标，只读合并同目录 ledger-v2.archive.jsonl+ledger-v2.jsonl，在线短锁约1秒统计；显式H绝对路径仅为Host只读稳定观察（最多两次观察，不取锁、不写Host资源/锁/备份/temp）；W归档走显式 --archive <active> 约30秒锁预算，失败回滚；writer约1秒超时静默返回delayed、不推进cursor，后续fold补记；仅stale-lock需核实owner后显式维护，不自动接管或删锁；V1/坏JSON不迁移'],
]

function reportIncompleteDirectory() {
  const lines = [
    `# pe-test 体检报告 ${ts()}`,
    '- 完整目录检测（plugins 同级）: 非完整',
    '- 依赖前置保护: 未加载业务/插件helper；未定位会话、未读取Host、未spawn子进程；不创建报告',
    '',
    '## 一、自动判定项',
    '| 自动项 | 状态 | 退出码 | 统计 | 诊断/备注 |',
    '|:--|:--|--:|:--|:--|',
  ]
  for (const [file, , known] of AUTO) {
    lines.push('| ' + escapeCell(file) + ' | 未执行 | — | — | 需完整目录；未加载业务/插件依赖' + (known ? '；' + escapeCell(known) : '') + ' |')
  }
  lines.push('')
  lines.push('## 二、人眼项（无自动判定，请人工运行判读输出）')
  lines.push('- 会话选择: NOT-RUN（不完整目录保护；未读取会话参数）')
  for (const [file] of HUMAN) lines.push('- ' + escapeCell(file) + ' — NOT-RUN：不完整目录保护；未加载业务/插件依赖')
  lines.push('')
  lines.push('## 三、需参数项')
  for (const [file, note] of NEED_ARG) lines.push('- ' + escapeCell(file) + ' — ' + escapeCell(note))
  lines.push('')
  lines.push('## 四、结论')
  lines.push('- AUTO: 全部未执行（' + AUTO.length + '/' + AUTO.length + '）；HUMAN: 全部 NOT-RUN（' + HUMAN.length + '/' + HUMAN.length + '）')
  lines.push('- 未加载任何业务/插件helper；未定位会话、未读取Host、未spawn自动suite；退出码: 0')
  console.log(lines.join('\n'))
}

// R解析合同：仅接受完整已知统计行（行首尾锚定），说明句前后缀或内嵌示例不算统计；主统计取末条。
const RUNNER_STAT_PATTERNS = [
  /^RESULT\s*:\s*(\d+)\s*(?:PASS|通过)\s*[,，]\s*(\d+)\s*(?:FAIL|失败)$/i,
  /^通过\s*(\d+)(?:\s*\/\s*\d+)?\s*[,，]\s*失败\s*(\d+)(?:\s*[,，]\s*(?:跳过\s*(\d+)|(\d+)\s*跳过))?(?:\s*[,，]\s*HUMAN\s+(\d+))?(?:\s*[,，]\s*(?:未完成|INCOMPLETE)\s+(\d+))?$/i,
  /^结果：\s*(\d+)\s*通过\s*[,，]\s*(\d+)\s*失败$/,
]
const RUNNER_SUMMARY_PATTERNS = [
  [/^NOT-RUN\s+(\d+)$/i, 'notRun'],
  [/^HUMAN\s+(\d+)$/i, 'human'],
  [/^INCOMPLETE\s+(\d+)$/i, 'incomplete'],
  [/^未完成\s+(\d+)$/, 'incomplete'],
]
const RUNNER_MARKER_PREFIXES = [
  ['SKIP  ', 'skip'],
  ['HUMAN  ', 'human'],
  ['NOT-RUN  ', 'notRun'],
  ['INCOMPLETE  ', 'incomplete'],
]

function runnerStatLineOf(line) {
  for (const pattern of RUNNER_STAT_PATTERNS) {
    const m = line.match(pattern)
    if (m === null) continue
    const skip = m[3] === undefined ? (m[4] === undefined ? 0 : m[4]) : m[3]
    return { pass: Number(m[1]), fail: Number(m[2]), skip: Number(skip), incomplete: m[6] === undefined ? 0 : Number(m[6]), humanSummary: m[5] === undefined ? 0 : Number(m[5]) }
  }
  return null
}

// 纯解析：不读写文件、不 spawn。汇总（合法非负整数）与既有双空格结构化 marker 分开保存，有效计数取 max 不相加。
export function parseAutoOutput(out) {
  const text = String(out)
  let stats = null
  let statHumanSummary = 0
  let summaryNotRun = 0
  let summaryHuman = 0
  let summaryIncomplete = 0
  const skipLines = []
  const humanLines = []
  const notRunLines = []
  const incompleteLines = []
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim()
    if (line === '') continue
    const marker = RUNNER_MARKER_PREFIXES.find(([prefix]) => line.startsWith(prefix))
    if (marker !== undefined) {
      const kind = marker[1]
      const payload = line.slice(marker[0].length)
      if (payload === '') continue
      if (kind === 'skip') {
        try { skipLines.push(JSON.parse(payload)) } catch { /* 非结构化 SKIP 不计入统计 */ }
        continue
      }
      let value
      try { value = JSON.parse(payload) } catch { value = undefined }
      if (typeof value === 'number' && Number.isInteger(value) && value >= 0) {
        // 合法非负整数汇总声明：只保存数值；数字 0 不算一条未执行，负数/非数值不作正计数。
        if (kind === 'notRun') summaryNotRun = Math.max(summaryNotRun, value)
        else if (kind === 'human') summaryHuman = Math.max(summaryHuman, value)
        else summaryIncomplete = Math.max(summaryIncomplete, value)
        continue
      }
      // HUMAN 原非空说明 marker 兼容：非 JSON 文本原样保留为一条 marker。
      if (kind === 'human') humanLines.push(value === undefined ? payload : value)
      else if (kind === 'notRun') notRunLines.push(value === undefined ? payload : value)
      else incompleteLines.push(value === undefined ? payload : value)
      continue
    }
    const statLine = runnerStatLineOf(line)
    if (statLine !== null) {
      stats = { pass: statLine.pass, fail: statLine.fail, skip: statLine.skip, incomplete: statLine.incomplete }
      statHumanSummary = statLine.humanSummary
      continue
    }
    const summary = RUNNER_SUMMARY_PATTERNS.find(([pattern]) => pattern.test(line))
    if (summary !== undefined) {
      const value = Number(line.match(summary[0])[1])
      if (summary[1] === 'notRun') summaryNotRun = value
      else if (summary[1] === 'human') summaryHuman = value
      else summaryIncomplete = value
    }
  }
  if (stats !== null && stats.incomplete === 0) stats.incomplete = summaryIncomplete
  return {
    stats,
    skipLines,
    humanLines,
    notRunLines,
    incompleteLines,
    notRunCount: Math.max(summaryNotRun, notRunLines.length),
    humanSummaryCount: Math.max(statHumanSummary, summaryHuman, humanLines.length),
    incompleteCount: Math.max(stats === null ? 0 : stats.incomplete, summaryIncomplete, incompleteLines.length),
  }
}

export function parseResult(out) {
  return parseAutoOutput(out).stats
}

function captureDirOf(prefix) {
  if (runnerFixture === undefined || runnerFixture === null) throw new Error('runner fixture 未初始化')
  return mkdtempSync(join(runnerFixture.capture, prefix))
}

function childEnv(extra = {}, clearSession = false) {
  const env = { ...(runnerEnv === undefined || runnerEnv === null ? process.env : runnerEnv), ...extra }
  env.DSH_EXTRA_PLAN_REPORT_DIR = REPORTS_DIR
  delete env.DSH_HOME
  delete env.DSH_PROFILE
  delete env.SESSION_ID
  if (clearSession) {
    delete env.SESSION_ID
    delete env.PLANNER_PROMPT_SUFFIX
  }
  return env
}

function nodeArgsForChild(scriptPath, args, env) {
  const codeRoot = env !== null && typeof env === 'object' && typeof env.DSH_INSTALL_ROOT === 'string' ? env.DSH_INSTALL_ROOT.trim() : ''
  const preloadArgs = codeRoot === '' ? [] : ['--import', pathToFileURL(HOST_PRELOAD).href]
  return preloadArgs.concat([scriptPath], Array.isArray(args) ? args : [])
}

function runOne(file, extraArgs) {
  // Windows 沙箱禁止子进程 stdout/stderr 管道；用 W fixture 文件保留原有取证语义。
  const captureDir = captureDirOf('auto-')
  const stdoutPath = join(captureDir, 'stdout.log')
  const stderrPath = join(captureDir, 'stderr.log')
  const stdoutFd = openSync(stdoutPath, 'w')
  const stderrFd = openSync(stderrPath, 'w')
  let r
  try {
    const env = childEnv({}, true)
    const argv = nodeArgsForChild(join(HERE, file), extraArgs, env)
    r = spawnSync(process.execPath, argv, {
      timeout: 120000,
      stdio: ['ignore', stdoutFd, stderrFd],
      env,
    })
  } finally {
    closeSync(stdoutFd)
    closeSync(stderrFd)
  }
  const out = readFileSync(stdoutPath, 'utf8') + readFileSync(stderrPath, 'utf8')
  rmSync(captureDir, { recursive: true, force: true })
  const parsed = parseAutoOutput(out)
  const timedOut = r.error !== undefined && String(r.error.code || '') === 'ETIMEDOUT'
  const failLines = String(out).split('\n').filter((l) => l.includes('FAIL') || l.includes('Error:') || l.includes('地图与代码不一致') || l.includes('疑似漏检') || l.includes('导航失效')).slice(0, 8)
  return {
    status: r.status,
    stats: parsed.stats,
    failLines,
    skipLines: parsed.skipLines,
    humanLines: parsed.humanLines,
    notRunLines: parsed.notRunLines,
    incompleteLines: parsed.incompleteLines,
    notRunCount: parsed.notRunCount,
    humanSummaryCount: parsed.humanSummaryCount,
    incompleteCount: parsed.incompleteCount,
    error: r.error,
    timedOut,
    out,
  }
}
function escapeCell(value) {
  return String(value === undefined || value === null ? '' : value).replace(/\r?\n/g, '<br>').replace(/\|/g, '\\|')
}

function positiveCount(value) {
  const number = Number(value)
  return Number.isFinite(number) && number > 0 ? number : 0
}

function effectiveSkipCount(result) {
  const statsSkip = result.stats === null || result.stats === undefined ? 0 : positiveCount(result.stats.skip)
  const markerSkip = Array.isArray(result.skipLines) ? result.skipLines.length : 0
  return Math.max(statsSkip, markerSkip)
}

function humanCount(result) {
  const declared = positiveCount(result.humanSummaryCount)
  const marker = Array.isArray(result.humanLines) ? result.humanLines.length : 0
  return Math.max(declared, marker)
}

function effectiveNotRunCount(result) {
  const declared = positiveCount(result.notRunCount)
  const marker = Array.isArray(result.notRunLines) ? result.notRunLines.length : 0
  return Math.max(declared, marker)
}

function effectiveIncompleteCount(result) {
  const statsIncomplete = result.stats === null || result.stats === undefined ? 0 : positiveCount(result.stats.incomplete)
  const declared = positiveCount(result.incompleteCount)
  const marker = Array.isArray(result.incompleteLines) ? result.incompleteLines.length : 0
  return Math.max(statsIncomplete, declared, marker)
}

export function classifyAuto(result) {
  const stats = result.stats
  if (result.timedOut === true) return '失败'
  if (result.error !== undefined) return '未执行'
  if (stats !== null && stats !== undefined && positiveCount(stats.fail) > 0) return '失败'
  if (effectiveIncompleteCount(result) > 0) return '部分执行'
  if (result.status !== 0) return '失败'
  if (effectiveSkipCount(result) > 0 || humanCount(result) > 0 || effectiveNotRunCount(result) > 0) {
    return stats !== null && stats !== undefined && positiveCount(stats.pass) > 0 ? '部分执行' : '未执行'
  }
  return '通过'
}

function markerCountSuffix(result) {
  const parts = []
  const skip = effectiveSkipCount(result)
  const human = humanCount(result)
  const notRun = effectiveNotRunCount(result)
  if (skip > 0) parts.push('跳过 ' + skip)
  if (human > 0) parts.push('HUMAN ' + human)
  if (notRun > 0) parts.push('NOT-RUN ' + notRun)
  return parts.length === 0 ? '' : ', ' + parts.join(', ')
}

export function statsSummary(result) {
  const suffix = markerCountSuffix(result)
  if (result.stats !== null && result.stats !== undefined) {
    return '通过 ' + positiveCount(result.stats.pass) + ', 失败 ' + positiveCount(result.stats.fail) + suffix + (positiveCount(result.stats.incomplete) > 0 ? ', 未完成 ' + positiveCount(result.stats.incomplete) : '')
  }
  if (suffix !== '') return (result.status === 0 ? '无统计行' : '失败') + suffix
  return result.status === 0 ? '通过（无统计行）' : '失败'
}

function markerValue(value) {
  if (typeof value === 'string') return value
  const encoded = JSON.stringify(value)
  return encoded === undefined ? String(value) : encoded
}

export function structuredMarkerSummary(result) {
  const parts = []
  if (Array.isArray(result.skipLines) && result.skipLines.length > 0) {
    parts.push('跳过：' + result.skipLines.map(markerValue).join('；'))
  }
  if (Array.isArray(result.humanLines) && result.humanLines.length > 0) {
    parts.push('HUMAN：' + result.humanLines.map(markerValue).join('；'))
  }
  if (Array.isArray(result.notRunLines) && result.notRunLines.length > 0) {
    parts.push('NOT-RUN：' + result.notRunLines.map(markerValue).join('；'))
  }
  if (Array.isArray(result.incompleteLines) && result.incompleteLines.length > 0) {
    parts.push('INCOMPLETE：' + result.incompleteLines.map(markerValue).join('；'))
  }
  return parts.join('；')
}

// 人眼项取证: 运行取证工具，stdout+stderr 全量拼接（无任何截断/过滤/摘要）
function runForensic(file, sessionArg) {
  const argv = forensicArgs(file, sessionArg, commonArgsFor(file))
  const notRunReason = forensicNotRunReason(file, sessionArg)
  if (notRunReason !== null) {
    return { status: null, out: notRunReason + '\n', stdout: '', stderr: notRunReason + '\n', error: undefined, argv, notRunReason }
  }
  const env = childEnv({}, false)
  // 与自动项相同，使用 W fixture 文件描述符避免受限 Windows 环境下 stdout/stderr 管道 EPERM；
  // 读取两个临时文件后再原样拼接，保留完整 stdout/stderr。
  const captureDir = captureDirOf('human-')
  const stdoutPath = join(captureDir, 'stdout.log')
  const stderrPath = join(captureDir, 'stderr.log')
  const stdoutFd = openSync(stdoutPath, 'w')
  const stderrFd = openSync(stderrPath, 'w')
  let r
  try {
    // 仅支持输出模式的查看器以 --full 取证；step-06/08 保持原参数合同。
    const nodeArgs = nodeArgsForChild(join(HERE, file), argv, env)
    r = spawnSync(process.execPath, nodeArgs, {
      timeout: 120000, stdio: ['ignore', stdoutFd, stderrFd], env,
    })
  } finally {
    closeSync(stdoutFd)
    closeSync(stderrFd)
  }
  const stdout = readFileSync(stdoutPath, 'utf8')
  const stderr = readFileSync(stderrPath, 'utf8')
  const out = stdout + stderr
  rmSync(captureDir, { recursive: true, force: true })
  return { status: r.status, out, stdout, stderr, error: r.error, argv, notRunReason: null }
}

function ts() {
  const d = new Date()
  const p = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`
}

function modeArg(mode) {
  return mode === 'full' ? '--full' : mode === 'verbose' ? '--verbose' : '--compact'
}

export function forensicKeyLines(text) {
  const lines = String(text).split(/\r?\n/)
  const include = /^(SESSION_ID|PLANNER_PROMPT_SUFFIX|定位结果|A42|A43|child谱系|父工具关联：|suffix判定=|模型证据等级=|事件类型计数：|INCOMPLETE|NOT-RUN|输入错误|未找到|未发现|仅支持 v4|L\d+ (REQUEST|CONTEXT|MODEL|ASSISTANT|first planner|PLANNER-MESSAGE)|REQUEST_EXACT=|HEADER line=)/
  return lines.filter((line) => {
    if (!include.test(line)) return false
    if (line.includes('（完整') || line.includes('event（完整）') || line.includes('arguments.prompt') || line.includes('arguments（完整）')) return false
    return line.trim() !== ''
  }).slice(0, 120).map((line) => line.length > 500 ? line.slice(0, 500) + '…' : line)
}

export function classifyForensic(result) {
  if (result.notRunReason !== null && result.notRunReason !== undefined) return 'NOT-RUN'
  if (result.error !== undefined) return 'NOT-RUN'
  return 'HUMAN'
}

function evidenceRelative(filePath) {
  return relative(HERE, filePath).replaceAll('\\', '/')
}

function runMain() {
  const stamp = ts()
  const sessionArg = selectedSessionValueOf()
  const sessionSelection = selectedSessionOf(sessionArg)
  // 未选 session 时不调用定位器、不探测 Host sessions，也不启动任何 HUMAN 子进程。
  const sessionLoc = sessionSelection === undefined
    ? { kind: 'none', selected: false, reason: '未显式选择会话；未执行会话磁盘探测' }
    : findSession(maintenanceContext.session.mode === 'none' ? sessionArg : undefined, { maintenanceContext })
  const lines = []
  lines.push(`# pe-test 体检报告 ${stamp}`)
  lines.push(`- 输出模式: ${output.mode}（--full 优先于 --verbose；失败与raw证据不压缩）`)
  lines.push('')
  lines.push(`- 运行目录: ${HERE}`)
  lines.push(`- 完整目录检测（plugins 同级）: ${FULL_DIR ? '完整' : '非完整'}`)
  if (!FULL_DIR) lines.push('- 提示: 当前目录缺少 plugins/，仓库依赖项未执行；请到仓库根（pe-test 与 plugins 同级）运行以获得完整结果')
  lines.push('')
  const sessionLocLines = []
  if (sessionLoc.kind === 'notfound') {
    sessionLocLines.push(`- 指定会话未找到: ${sessionLoc.arg}（检查公共会话参数或明确位置参数）`)
  } else if (sessionLoc.kind === 'incomplete') {
    sessionLocLines.push(`- 会话定位: INCOMPLETE — ${sessionLoc.reason}`)
  } else if (sessionLoc.kind === 'unavailable') {
    sessionLocLines.push(`- 会话定位: NOT-RUN — ${sessionLoc.reason}`)
  } else if (sessionLoc.kind === 'none') {
    sessionLocLines.push('- 会话定位: NOT-RUN — 未显式选择会话；未定位、未读取会话')
  } else {
    const byId = `按指定会话定位（${sessionSelection}）`
    const mainNote = sessionLoc.dirs.length > 1 ? '（第 1 个为主会话）' : ''
    sessionLocLines.push(`- 会话定位: ${byId} — 共 ${sessionLoc.dirs.length} 个会话${mainNote}`)
    for (const d of sessionLoc.dirs) sessionLocLines.push(`  - ${d}`)
  }
  lines.push('## 会话定位')
  lines.push(...sessionLocLines)
  lines.push('')

  let autoPass = 0
  let autoPartial = 0
  let autoSkip = 0
  let autoFail = 0
  lines.push('## 一、自动判定项')
  lines.push('| 自动项 | 状态 | 退出码 | 统计 | 诊断/备注 |')
  lines.push('|:--|:--|--:|:--|:--|')
  for (const [file, needRepo, known, extraArgs] of AUTO) {
    if (needRepo && !FULL_DIR) {
      autoSkip += 1
      lines.push('| ' + escapeCell(file) + ' | 未执行 | — | — | 需完整目录' + (known ? '；' + escapeCell(known) : '') + ' |')
      continue
    }
    const r = runOne(file, (Array.isArray(extraArgs) ? extraArgs : []).concat(modeArg(output.mode)))
    let state
    let diagnostic = structuredMarkerSummary(r)
    if (r.timedOut === true) {
      state = '失败'
      autoFail += 1
      diagnostic = '执行超时（ETIMEDOUT）' + (known ? '；' + known : '')
    } else if (r.error !== undefined) {
      state = '未执行'
      autoSkip += 1
      diagnostic = '运行环境受限（spawn 失败: ' + String(r.error.code || r.error.message).slice(0, 80) + ')' + (known ? '；' + known : '')
    } else {
      state = classifyAuto(r)
      if (state === '通过') autoPass += 1
      else if (state === '部分执行') autoPartial += 1
      else if (state === '未执行') autoSkip += 1
      else autoFail += 1
      if (diagnostic === '' && known) diagnostic = known
      if (diagnostic === '' && state === '失败' && r.failLines.length > 0) diagnostic = r.failLines[0].trim()
    }
    lines.push('| ' + escapeCell(file) + ' | ' + state + ' | ' + (r.status === null ? 'null' : String(r.status)) + ' | ' + escapeCell(statsSummary(r)) + ' | ' + escapeCell(diagnostic || '—') + ' |')
    if (state === '失败' && r.failLines.length > 0) {
      for (const l of r.failLines) lines.push('  - ' + escapeCell(file) + ': ' + escapeCell(l.trim().slice(0, 160)))
    }
  }
  lines.push('')
  lines.push('## 二、人眼项（无自动判定，请人工运行判读）')
  lines.push('提示：未显式选择会话时所有人眼项均 NOT-RUN 且不定位；step-07 还必须用 --session <顶层主会话ID> + --sessions-dir，并显式提供 PLANNER_PROMPT_SUFFIX；已选会话才运行取证工具。')
  for (const [file, note] of HUMAN) {
    const tool = file.replace(/\.mjs$/, '')
    lines.push(`- ${file} — ${note}（详见 测试报告-${tool}-${stamp}.md）`)
  }
  lines.push('')
  lines.push('## 三、需参数项')
  for (const [file, note] of NEED_ARG) lines.push(`- ${file} — ${note}`)
  lines.push('')
  lines.push('## 四、结论')
  lines.push('- 自动判定项结论：通过 ' + autoPass + ' / 部分执行 ' + autoPartial + ' / 未执行 ' + autoSkip + ' / 失败 ' + autoFail + '，共 ' + AUTO.length + ' 项')
  lines.push('- 说明：部分执行/未执行不计失败；INCOMPLETE 单列为部分执行，不计 AUTO PASS；结构化 SKIP/HUMAN 会分别保留在统计与诊断，真实 QQBot 消息与交互仍属 HUMAN')
  if (autoFail > 0) lines.push('- 说明：失败项含「已知预存问题」（见自动判定项表格备注列），其余失败需排查')

  mkdirSync(REPORTS_DIR, { recursive: true })
  const reportFile = join(REPORTS_DIR, `测试报告-${stamp}.md`)
  const humanRecords = []
  // 人眼项独立摘要 + 双通道raw；主报告只建立索引，不嵌入r.out。
  for (const [file, note] of HUMAN) {
    const tool = file.replace(/\.mjs$/, '')
    const r = runForensic(file, sessionArg)
    const raw = writeRawEvidence({
      directory: REPORTS_DIR,
      baseName: `测试报告-${tool}-${stamp}`,
      stdout: r.stdout || '',
      stderr: r.stderr || '',
    })
    const state = classifyForensic(r)
    const keyLines = forensicKeyLines(r.out)
    const body = []
    body.push(`# pe-test 人眼项取证摘要 · ${tool} · ${stamp}`)
    body.push('')
    body.push(`- 工具用途: ${note}`)
    body.push(...sessionLocLines)
    body.push(`- 运行命令: ${forensicCommand(file, r.argv)}`)
    if (file === STEP07_FILE) {
      body.push(`- 调用环境: 会话选择=${sessionSelection === undefined ? '缺失' : '显式'}；PLANNER_PROMPT_SUFFIX=${Object.prototype.hasOwnProperty.call(process.env, 'PLANNER_PROMPT_SUFFIX') ? '显式' : '缺失'}`)
    }
    body.push(`- 状态: ${state}`)
    body.push(`- 退出码: ${r.status === null ? 'null' : r.status}`)
    if (r.error !== undefined) body.push(`- 运行环境受限（spawn 失败: ${String(r.error.code || r.error.message)}）`)
    if (r.notRunReason !== null && r.notRunReason !== undefined) body.push(`- 原因: ${r.notRunReason}`)
    if (r.out === '') body.push('- 备注: （无输出）')
    body.push('')
    body.push('## 关键结构化行（有限摘要）')
    if (keyLines.length === 0) body.push('- （无可摘要结构化行；完整内容见raw）')
    else for (const line of keyLines) body.push('- ' + line.replaceAll('\n', ' '))
    body.push('')
    body.push('## raw证据')
    for (const item of raw.files) body.push(`- ${item.channel}: ${evidenceRelative(item.path)}；bytes=${item.bytes}；lines=${item.lines}；sha256=${item.sha256}`)
    body.push(`- combined: bytes=${raw.bytes}；lines=${raw.lines}；sha256=${raw.sha256}`)
    body.push('')
    const summaryPath = join(REPORTS_DIR, `测试报告-${tool}-${stamp}.md`)
    writeFileSync(summaryPath, body.join('\n') + '\n')
    humanRecords.push({ tool, file, state, exitCode: r.status, summaryPath, raw, keyLines })
  }
  lines.push('')
  lines.push('## 五、人眼取证raw索引（不计AUTO PASS）')
  for (const record of humanRecords) {
    lines.push(`- ${record.file}: ${record.state}；摘要=${evidenceRelative(record.summaryPath)}；raw=${record.raw.files.map((item) => evidenceRelative(item.path)).join(', ')}`)
  }
  writeFileSync(reportFile, lines.join('\n') + '\n')
  console.log(lines.join('\n'))
  console.log(`\n报告已保存: ${relative(HERE, reportFile).replaceAll('\\', '/')}（即 ${REPORTS_DIR} 下）`)
  process.exitCode = autoFail === 0 ? 0 : 1
}

async function main() {
  if (!FULL_DIR) {
    reportIncompleteDirectory()
    process.exitCode = 0
    return
  }
  await loadRuntimeHelpers()
  const fixture = makeFixtureDir({ label: 'one-key-step' })
  runnerFixture = fixture
  runnerEnv = createIsolatedEnv({ fixture })
  try {
    runMain()
  } finally {
    try { fixture.cleanup() } finally { runnerFixture = undefined; runnerEnv = undefined }
  }
}

if (process.argv[1] !== undefined && pathToFileURL(process.argv[1]).href === import.meta.url) {
  main().catch((error) => {
    console.error(error)
    process.exitCode = 1
  })
}
