// step-06-08-v4取证回归.mjs — 隔离 v4 取证脚本回归
// 只在工作区内隔离fixture生成 session.v4.jsonl.zstd，不读取生产会话或运行实机人眼项。
import { spawnSync } from 'node:child_process'
import { closeSync, copyFileSync, existsSync, mkdirSync, openSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { makeFixtureDir, resolveEvidencePath } from '../_shared/workspace-paths.mjs'
import { basename, dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { zstdCompressSync, zstdDecompressSync } from 'node:zlib'
import { decodeText, decodedJsonlLines, framesOf } from '../_shared/zstd-frames.mjs'
import { createOutput, sha256Text, writeRawEvidence } from '../_shared/test-output.mjs'
import { badIdentityResult, call, descriptor, g5MultiFrame, inboxResult, replayJsonl, result, session, skippable, syntheticFrame, writeSession } from '../_shared/session-fixture.mjs'
import { shellMutationReason, childReadonlyGateReason } from '../../plugins/dsh-extra-plan/lib/gate-decisions.js'

const HERE = dirname(fileURLToPath(import.meta.url))
const ROOT = join(HERE, '..', '..')
const STEP04 = join(HERE, 'step-04-工具清单查看.mjs')
const STEP05 = join(HERE, 'step-05-会话解码.mjs')
const STEP06 = join(HERE, 'step-06-真实会话查看.mjs')
const STEP07 = join(HERE, 'step-07-子代理模型与引导取证.mjs')
const HOST_PRELOAD = join(ROOT, 'pe-test', '_shared', 'host-preload.mjs')
// v4 会话日志文件名唯一常量：夹具写盘与回放读取共用，避免同一文件名在文件内重复硬编码。
const SESSION_LOG_NAME = 'session.v4.jsonl.zstd'
const previousDshHome = process.env.DSH_HOME
let pass = 0
let fail = 0
let fidelity = 0
let lastAssertionLabel = ''
let incompleteAssertions = 0
const output = createOutput({ argv: process.argv.slice(2) })

function check(label, condition, detail = '') {
  lastAssertionLabel = label
  const actual = typeof detail === 'string' && detail !== '' ? detail : condition
  if (condition) {
    pass += 1
    output.assertion(true, label, true, true)
  } else {
    fail += 1
    output.assertion(false, label, true, actual)
  }
}

// 保真断言：只验证取证工具对畸形或异常输入能如实呈现且不崩，不构成插件规则通过，
// 因此成功不计入通过数（只计入 fidelity 独立赛道），但失败仍计 fail，
// 以便查看器崩掉或不再如实呈现时本脚本照样变红。
function checkFidelity(label, condition, detail = '') {
  lastAssertionLabel = label
  const actual = typeof detail === 'string' && detail !== '' ? detail : condition
  if (condition) {
    fidelity += 1
    output.assertion(true, label, true, true)
  } else {
    fail += 1
    output.assertion(false, label, true, actual)
  }
}

// 异常中断时用于估计「未执行断言」规模：按本文件源码里 check/checkFidelity 的调用点数计
// （循环展开与辅助函数内展开不计），只作未执行区间的上界估计，不参与任何规则判定。
function declaredAssertionSites() {
  const source = readFileSync(fileURLToPath(import.meta.url), 'utf8')
  return (source.match(/^\s*(?:check|checkFidelity)\(/gm) || []).length
}

function checkSyntheticFrame(label, buf, expected) {
  const frames = framesOf(buf)
  check(label + ' 边界恰一帧', frames.length === 1)
  if (frames.length !== 1) return
  const nativeText = zstdDecompressSync(buf.subarray(frames[0].start, frames[0].end)).toString('utf8')
  check(label + ' Node原生解压一致', nativeText === expected)
  check(label + ' decodeText一致', decodeText(buf, frames[0]) === expected)
}

// G5：内存 RLE、raw、compressed、混合块、多帧与截断 RLE 对照；不触碰真实日志。
const rleFrame = syntheticFrame([{ type: 1, size: 16, payload: Buffer.from([0x61]), last: true }], 16)
const rawPayload = Buffer.from('raw-block', 'utf8')
const rawFrame = syntheticFrame([{ type: 0, size: rawPayload.length, payload: rawPayload, last: true }], rawPayload.length)
const compressedExpected = 'compressed-block fixture'
const compressedFrame = zstdCompressSync(Buffer.from(compressedExpected, 'utf8'))
const mixedFrame = syntheticFrame([
  { type: 1, size: 3, payload: Buffer.from([0x61]), last: false },
  { type: 0, size: 2, payload: Buffer.from('bc', 'utf8'), last: true },
], 5)
checkSyntheticFrame('RLE块', rleFrame, 'a'.repeat(16))
checkSyntheticFrame('raw块', rawFrame, 'raw-block')
checkSyntheticFrame('compressed块', compressedFrame, compressedExpected)
checkSyntheticFrame('RLE+raw混合块', mixedFrame, 'aaabc')
const multiFrame = Buffer.concat([rleFrame, compressedFrame])
const multiFrames = framesOf(multiFrame)
check('多帧边界恰两帧', multiFrames.length === 2)
check('多帧逐帧解压一致', multiFrames.length === 2 && decodeText(multiFrame, multiFrames[0]) === 'a'.repeat(16) && decodeText(multiFrame, multiFrames[1]) === compressedExpected)
const truncatedRle = rleFrame.subarray(0, rleFrame.length - 1)
check('截断RLE不伪造完整帧', framesOf(truncatedRle).length === 0)

// G5 任务11：直接调用修复后的 decodedJsonlLines，并把同一批真实 fixture 交给三只查看器。
function expectDecodedThrow(label, bytes) {
  let threw = false
  try { Array.from(decodedJsonlLines(bytes)) } catch { threw = true }
  check('G5 ' + label + '记为不完整', threw)
}
const g5Session = { type: 'session', data: { id: 'g5-cross', message: '中文跨帧' } }
const g5Header = { type: 'request/header', data: { header: { config: { model: 'g5-model' }, tools: [] } } }
const g5Call = { type: 'tool/call', data: { name: 'save_plan', callId: 'g5-call', arguments: JSON.stringify({ plan: 'ok' }) } }
const g5Result = result('g5-call', undefined, 'g5 save ok')
const g5RawRows = [JSON.stringify(g5Session), '', JSON.stringify(g5Header), JSON.stringify(g5Call), JSON.stringify(g5Result)]
const g5Raw = Buffer.from(g5RawRows.join('\r\n'), 'utf8')
const g5Utf8Cut = g5Raw.indexOf(Buffer.from('中', 'utf8')) + 1
const g5ValidCompressed = g5MultiFrame(g5Raw, [g5Utf8Cut, Math.max(g5Utf8Cut + 1, Math.floor(g5Raw.length / 2)), g5Raw.length])
const g5SkippableCompressed = Buffer.concat([skippable(Buffer.from('legal-skippable', 'utf8')), g5ValidCompressed])
const g5BadRaw = Buffer.from([JSON.stringify(g5Session), 'bad-json', JSON.stringify(g5Header), JSON.stringify(g5Call), JSON.stringify(g5Result)].join('\r\n'), 'utf8')
const g5BadCompressed = g5MultiFrame(g5BadRaw, [g5BadRaw.length])
const g5InvalidUtf8Raw = Buffer.concat([Buffer.from(JSON.stringify(g5Session) + '\r\n', 'utf8'), Buffer.from([0xe4]), Buffer.from('\r\n' + JSON.stringify(g5Header), 'utf8')])
const g5InvalidUtf8Compressed = g5MultiFrame(g5InvalidUtf8Raw, [Buffer.byteLength(JSON.stringify(g5Session) + '\r\n', 'utf8') + 1, g5InvalidUtf8Raw.length])
const g5TruncatedCompressed = g5ValidCompressed.subarray(0, g5ValidCompressed.length - 1)
const g5NoFrame = Buffer.from([0x28, 0xb5, 0x2f])
const g5EmptyCompressed = zstdCompressSync(Buffer.from('\r\n', 'utf8'))
const g5NoSaveCompressed = zstdCompressSync(Buffer.from(JSON.stringify(g5Session), 'utf8'))
// 只计真实解码期间的帧头读取；旧的全后缀重扫会产生二次方计数。
const linearFrameCount = 256
const linearFrame = zstdCompressSync(Buffer.from('{}\n', 'utf8'))
const linearInput = Buffer.concat(Array(linearFrameCount).fill(linearFrame))
const originalReadUInt32LE = Buffer.prototype.readUInt32LE
let frameHeaderReads = 0
let linearLines
try {
  Buffer.prototype.readUInt32LE = function (...args) {
    frameHeaderReads += 1
    return originalReadUInt32LE.apply(this, args)
  }
  linearLines = Array.from(decodedJsonlLines(linearInput))
} finally {
  Buffer.prototype.readUInt32LE = originalReadUInt32LE
}
check('主会话复核：多帧边界扫描随帧数线性增长', linearLines.length === linearFrameCount && frameHeaderReads <= 4 * linearFrameCount, 'frames=' + linearFrameCount + ', headerReads=' + frameHeaderReads)
const embeddedFrameInput = Buffer.concat([
  zstdCompressSync(Buffer.from(JSON.stringify(g5Session) + '\n', 'utf8')),
  skippable(zstdCompressSync(Buffer.from('not-an-event\n', 'utf8'))),
  zstdCompressSync(Buffer.from(JSON.stringify(g5Header) + '\n', 'utf8')),
])
const embeddedFrameLines = Array.from(decodedJsonlLines(embeddedFrameInput))
check('主会话复核：skippable载荷内嵌zstd帧仍整段跳过', embeddedFrameLines.length === 2 && JSON.parse(embeddedFrameLines[0].line).type === 'session' && JSON.parse(embeddedFrameLines[1].line).type === 'request/header')

const g5Decoded = Array.from(decodedJsonlLines(g5ValidCompressed))
check('G5 跨帧JSONL逐逻辑行数量', g5Decoded.length === 5)
check('G5 跨帧UTF8中文完整', JSON.parse(g5Decoded[0].line).data.message === '中文跨帧')
check('G5 CRLF空行保留且不虚增', g5Decoded[1].line.trim() === '')
check('G5 末行无换行仍输出', g5Decoded[4].line.trim().startsWith('{'))
check('G5 行号按完整解压JSONL递增', g5Decoded.map((row) => row.lineNo).join(',') === '1,2,3,4,5')
const g5SkippedDecoded = Array.from(decodedJsonlLines(g5SkippableCompressed))
check('G5 合法skippable片段兼容且不污染首事件', g5SkippedDecoded.length === 5 && JSON.parse(g5SkippedDecoded[0].line).data.id === 'g5-cross')
expectDecodedThrow('截断普通帧', g5TruncatedCompressed)
expectDecodedThrow('无完整帧', g5NoFrame)
expectDecodedThrow('非法UTF8', g5InvalidUtf8Compressed)

function runScript(script, args, extraEnv = {}) {
  const captureSequenceValue = ++captureSequence
  const captureDir = join(v4Fixture.capture, 'capture-' + String(captureSequenceValue))
  const childTemp = join(v4Fixture.temp, 'child-' + String(captureSequenceValue))
  mkdirSync(captureDir, { recursive: true })
  mkdirSync(childTemp, { recursive: true })
  const stdoutPath = join(captureDir, 'stdout.log')
  const stderrPath = join(captureDir, 'stderr.log')
  const stdoutFd = openSync(stdoutPath, 'w')
  const stderrFd = openSync(stderrPath, 'w')
  const env = { ...process.env, ...extraEnv, TEMP: childTemp, TMP: childTemp, TMPDIR: childTemp }
  delete env.DSH_HOME
  delete env.DSH_PROFILE
  delete env.DSH_EXTRA_PLAN_CONFIG_PATH
  delete env.SESSION_ID
  if (!Object.prototype.hasOwnProperty.call(extraEnv, 'PLANNER_PROMPT_SUFFIX')) delete env.PLANNER_PROMPT_SUFFIX
  const preload = pathToFileURL(HOST_PRELOAD).href
  const scriptArgv = [script, ...args]
  const argv = [process.execPath, '--import', preload, ...scriptArgv]
  let child
  try {
    child = spawnSync(process.execPath, argv.slice(1), {
      cwd: ROOT,
      env,
      timeout: 120000,
      stdio: ['ignore', stdoutFd, stderrFd],
    })
  } finally {
    closeSync(stdoutFd)
    closeSync(stderrFd)
  }
  const stdout = readFileSync(stdoutPath, 'utf8')
  const stderr = readFileSync(stderrPath, 'utf8')
  const output = stdout + stderr
  const raw = writeRawEvidence({ directory: v4EvidenceRoot, baseName: 'child-' + String(captureSequenceValue), stdout, stderr })
  const error = child.error === undefined || child.error === null
    ? null
    : {
        name: child.error.name ?? null,
        code: child.error.code ?? null,
        message: child.error.message ?? String(child.error),
        stack: child.error.stack ?? null,
      }
  const evidence = {
    node: process.execPath,
    preload,
    preloadPath: HOST_PRELOAD,
    script,
    args,
    scriptArgv,
    argv,
    cwd: ROOT,
    DSH_INSTALL_ROOT: env.DSH_INSTALL_ROOT ?? null,
    status: child.status,
    signal: child.signal,
    error,
    raw: { ...raw, combined: { bytes: raw.bytes, lines: raw.lines, sha256: raw.sha256 } },
  }
  v4EvidenceRecords.push(evidence)
  writeFileSync(v4EvidenceIndexPath, JSON.stringify(v4EvidenceRecords, null, 2) + '\n')
  console.log('V4_CHILD_EVIDENCE ' + JSON.stringify(evidence))
  if ((child.status !== 0 || child.error !== undefined) && !firstChildFailureLogged) {
    firstChildFailureLogged = true
    console.error('CHILD_FIRST_FAIL status=' + String(child.status) + ' error=' + String(child.error || '') + ' argv=' + JSON.stringify(scriptArgv) + ' output=' + output.slice(0, 2400))
  }
  if (script === STEP07 && (child.status !== 0 || child.error !== undefined)) console.error('STEP07_CHILD_FAIL status=' + String(child.status) + ' argv=' + JSON.stringify(scriptArgv) + ' output=' + output.slice(0, 3200))
  rmSync(captureDir, { recursive: true, force: true })
  return { status: child.status, signal: child.signal, stdout, stderr, output, error: child.error, argv, scriptArgv, raw }
}

function countOf(text, value) {
  return String(text).split(value).length - 1
}

function rawLineCount(text) {
  return text === '' ? 0 : text.split(/\r?\n/).length - (text.endsWith('\n') ? 1 : 0)
}

function checkRawEvidence(label, raw, stdout, stderr) {
  for (const [channel, expected] of [['stdout', stdout], ['stderr', stderr]]) {
    const file = Array.isArray(raw?.files) ? raw.files.find((entry) => entry.channel === channel) : undefined
    const actual = typeof file?.path === 'string' && existsSync(file.path) ? readFileSync(file.path, 'utf8') : null
    check(label + ' ' + channel + '原文/bytes/lines/SHA', file !== undefined && actual === expected && file.bytes === Buffer.byteLength(expected, 'utf8') && file.lines === rawLineCount(expected) && file.sha256 === sha256Text(expected))
  }
  const combined = String(stdout) + String(stderr)
  check(label + ' combined=stdout+stderr bytes/lines/SHA', raw?.bytes === Buffer.byteLength(combined, 'utf8') && raw?.lines === rawLineCount(combined) && raw?.sha256 === sha256Text(combined))
}

const v4Fixture = makeFixtureDir({ label: 'v4-forensics' })
const fixtureHome = v4Fixture.home
const v4EvidenceRoot = resolveEvidencePath(join('v4', basename(v4Fixture.root)))
const v4EvidenceIndexPath = join(v4EvidenceRoot, 'index.json')
const v4EvidenceRecords = []
mkdirSync(v4EvidenceRoot, { recursive: true })
console.log('V4_EVIDENCE_ROOT=' + v4EvidenceRoot)
let captureSequence = 0
let firstChildFailureLogged = false
let cleaned = false
try {
  const sessionsRoot = join(fixtureHome, 'sessions')
  const exactSessionArgs = (sessionDir, ...domainArgs) => ['--host-root', fixtureHome, '--session-dir', sessionDir, ...domainArgs]
  const idSessionArgs = (sessionId, sessionsDir = sessionsRoot, ...domainArgs) => ['--host-root', fixtureHome, '--session', sessionId, '--sessions-dir', sessionsDir, ...domainArgs]
  function writeG5Workspace(label, bytes) {
    const workspace = join(sessionsRoot, 'g5-' + label + '-workspace')
    const sessionDir = join(workspace, 'g5-' + label + '-main')
    mkdirSync(sessionDir, { recursive: true })
    writeFileSync(join(sessionDir, SESSION_LOG_NAME), bytes)
    return sessionDir
  }
  const g5ValidWorkspace = writeG5Workspace('valid-skippable', g5SkippableCompressed)
  const g5BadWorkspace = writeG5Workspace('bad-json', g5BadCompressed)
  const g5InvalidUtf8Workspace = writeG5Workspace('invalid-utf8', g5InvalidUtf8Compressed)
  const g5TruncatedWorkspace = writeG5Workspace('truncated', g5TruncatedCompressed)
  const g5EmptyWorkspace = writeG5Workspace('empty-jsonl', g5EmptyCompressed)
  const g5NoFrameWorkspace = writeG5Workspace('no-frame', g5NoFrame)
  const g5NoSaveWorkspace = writeG5Workspace('no-save-plan', g5NoSaveCompressed)
  const g5Step05Valid = runScript(STEP05, exactSessionArgs(g5ValidWorkspace, '--compact'))
  check('G5 step05跨帧/skippable成功且物理行号准确', g5Step05Valid.status === 0 && g5Step05Valid.output.includes('L3 model=g5-model tools=0'), true)
  const g5Step06Valid = runScript(STEP06, exactSessionArgs(g5ValidWorkspace))
  check('G5 step06跨帧/skippable成功且物理行号准确', g5Step06Valid.status === 0 && g5Step06Valid.output.includes('L3 HEADER model=g5-model'), true)
  for (const [label, script] of [['step05', STEP05], ['step06', STEP06]]) {
    const bad = runScript(script, exactSessionArgs(g5BadWorkspace))
    check('G5 ' + label + '非空坏JSON退出非零且INCOMPLETE', bad.status !== 0 && bad.output.includes('INCOMPLETE'), true)
    const invalid = runScript(script, exactSessionArgs(g5InvalidUtf8Workspace))
    check('G5 ' + label + '非法UTF8退出非零且INCOMPLETE', invalid.status !== 0 && invalid.output.includes('INCOMPLETE'), true)
    const truncated = runScript(script, exactSessionArgs(g5TruncatedWorkspace))
    check('G5 ' + label + '截断普通帧退出非零且INCOMPLETE', truncated.status !== 0 && truncated.output.includes('INCOMPLETE'), true)
  }
  for (const [label, script] of [['step05', STEP05], ['step06', STEP06]]) {
    const empty = runScript(script, exactSessionArgs(g5EmptyWorkspace))
    check('G5 ' + label + '无JSON记录不成功', empty.status !== 0 && empty.output.includes('INCOMPLETE'), true)
    const noSave = runScript(script, exactSessionArgs(g5NoSaveWorkspace))
    check('G5 ' + label + '有效无save_plan日志不失败', noSave.status === 0, true)
  }
  const noFrame = runScript(STEP06, exactSessionArgs(g5NoFrameWorkspace))
  check('G5 step06无完整帧不成功', noFrame.status !== 0 && noFrame.output.includes('INCOMPLETE'), true)

  const v4Workspace = join(sessionsRoot, 'v4-workspace')
  const mainDir = join(v4Workspace, 'main-v4')
  const childDir = join(v4Workspace, 'child-v4')
  const mainEvents = [
    session('main-v4'),
    { type: 'request/header', data: { header: { config: { provider: 'fixture-provider', model: 'fixture-model' }, tools: ['read'], system: 'fixture system' } } },
    { type: 'agent-preset', data: { name: 'fixture-preset', status: 'loaded' } },
    { type: 'plan/mode', data: { mode: 'continuable', plan: 'fixture-plan-data' } },
    call('subagent_plan', 'parent-plan-1', { prompt: 'delegate child-v4' }),
    result('parent-plan-1', false, 'child-v4'),
    call('save_plan', 'save-ok-1', { plan: 'ok', checklist: 'ok' }),
    result('save-ok-1', false, 'fixture save ok'),
    call('save_plan', 'save-error-1', { plan: 'error', checklist: 'error' }),
    result('save-error-1', true, 'fixture-error-text'),
    call('save_plan', 'save-dangling-1', { plan: 'pending' }),
  ]
  const childEvents = [
    session('child-v4', { parentSession: 'main-v4', origin: 'subagent', delegationDepth: 1 }),
    { type: 'plan/mode', data: { mode: 'continuable', plan: 'child-plan-data' } },
    descriptor(),
    { type: 'request/header', data: { header: { config: { provider: 'attempted-provider', model: 'attempted-model' } } } },
    { type: 'assistant/message', data: { message: { source: { kind: 'model', provider: 'openai-codex', model: 'gpt-5.6-sol' }, content: [{ type: 'text', text: 'fixture model output' }] } } },
    { type: 'user/message', data: { message: { source: { kind: 'user' }, content: [{ type: 'text', text: 'child prompt fixture-suffix' }] } } },
  ]
  writeSession(mainDir, SESSION_LOG_NAME, mainEvents)
  writeSession(childDir, SESSION_LOG_NAME, childEvents)

  for (const file of [join(mainDir, SESSION_LOG_NAME), join(childDir, SESSION_LOG_NAME)]) {
    const replay = replayJsonl(file)
    check('fixture 解压后 JSONL 全部可解析：' + file.split(/[\\/]/).slice(-2).join('/'), replay.frameCount > 0 && replay.rowCount > 0 && replay.invalid === 0)
  }
  check('fixture W路径不继承调用者DSH_HOME授权', previousDshHome === undefined || fixtureHome !== previousDshHome)
  check('fixture W路径不在调用者DSH_HOME下', previousDshHome === undefined || !fixtureHome.startsWith(previousDshHome))

  const step04Args = exactSessionArgs(mainDir)
  const step04FullArgs = exactSessionArgs(mainDir, '--full')
  const step04 = runScript(STEP04, step04Args)
  const step04Full = runScript(STEP04, step04FullArgs)
  check('step-04 compact/full均成功且full保留header原文', step04.status === 0 && step04Full.status === 0 && step04.output.includes('tools.names=') && step04Full.output.includes('header.tools=') && step04Full.output.length > step04.output.length)
  // S04 断言块（合成夹具）：并非整块都在 --messages 严格模式下跑——s04-main 用 --messages 验会话打印
  // （SESSION_META/HEADER/MESSAGE/INBOX_ONLY）与 seq 断档 INCOMPLETE，s04-catalog 走默认参数验 skill-catalog 归类，
  // writeS04HeaderCase 各案用 --messages 验工具面 S04-1/S04-2/S04-3/S04-4 与 request trace S04-5；其中 S04-1/2/3 的反例为保真断言。
  const s04Workspace = join(sessionsRoot, 's04-workspace')
  const s04StrictDir = join(s04Workspace, 's04-main')
  writeSession(s04StrictDir, SESSION_LOG_NAME, [
    { type: 'session', data: { id: 's04-main', version: 3, cwd: 'C:/fixture-cwd' }, seq: 1 },
    { type: 'request/header', data: { header: { config: { model: 's04-model' }, tools: ['read', 'pwsh'], system: 'fixture system' } }, seq: 2 },
    { type: 'system/message', data: { message: { id: 's04-sys', role: 'system', source: { kind: 'system-prompt' }, content: [{ type: 'text', text: 'Writing code for run_code fixture system prompt' }] } }, seq: 3 },
    { type: 'user/message', data: { message: { id: 's04-user', role: 'user', source: { kind: 'user' }, content: [{ type: 'text', text: 's04 user request' }] } }, seq: 4 },
    { type: ['user/message', 'agent/inbox/spliced'], data: { message: { id: 's04-inbox', role: 'tool', source: { kind: 'tool', callId: 's04-call' }, toolCallId: 's04-call', content: [{ type: 'text', text: 'inbox text' }] } }, seq: 5 },
  ])
  const s04Strict = runScript(STEP04, exactSessionArgs(s04StrictDir, '--messages'))
  check('S04 严格模式合规会话 exit0 且 SESSION_META/HEADER 字段齐全', s04Strict.status === 0 && s04Strict.output.includes('SESSION_META {"id":"s04-main","version":3,"cwd":"C:/fixture-cwd"}') && s04Strict.output.includes('HEADER line=2 seq=2 sessionId=s04-main version=3 cwd=C:/fixture-cwd toolNames=["read","pwsh"] toolCount=2'))
  check('S04 严格模式 MESSAGE 与 INBOX_ONLY 行齐全', s04Strict.output.includes('MESSAGE {') && s04Strict.output.includes('INBOX_ONLY {') && s04Strict.output.includes('"role":"system"') && s04Strict.output.includes('"inboxOnly":true'))
  const s04CatalogDir = join(s04Workspace, 's04-catalog')
  // DSH_COMPAT_RC1：旧三名仅作为兼容来源；仅在未来另行授权、协调移除旧技能分类专用数据/期望并完成共享安全回归后，才可撤销。
  // DSH_CURRENT_RC2：dsh-doc为最新路径当前来源（rc.2 与 rc.3 共用）；当前dsh-doc与共享安全不在rc.1撤销边界。
  // 共享v4/序号/坏帧/普通项数据和期望不得随rc.1撤销整块删除。
  writeSession(s04CatalogDir, SESSION_LOG_NAME, [
    { type: 'session', data: { id: 's04-catalog', version: 1, cwd: 'C:/fixture-cwd' }, seq: 1 },
    { type: 'request/header', data: { header: { config: { model: 's04-model' }, tools: ['read'] } }, seq: 2 },
    { type: 'user/message', data: { message: { id: 's04-cat', role: 'user', source: { kind: 'user' }, content: [{ type: 'text', text: 'catalog carrier', skillCatalog: { kind: 'skill-catalog', entries: [{ name: 'cordis-plugin-development' }, { name: 'editing-cordis-compositions' }, { name: 'cordis-composition-reference' }, { name: 'dsh-doc' }, { name: 'agent-experience' }, { name: 'office' }] } }] } }, seq: 3 },
  ])
  const s04Catalog = runScript(STEP04, exactSessionArgs(s04CatalogDir))
  const s04CatalogOutput = s04Catalog.output
  check('S04 skill-catalog 实际子命令保留六项原entries顺序', s04Catalog.status === 0 && s04CatalogOutput.includes('source.kind=skill-catalog entries=["cordis-plugin-development","editing-cordis-compositions","cordis-composition-reference","dsh-doc","agent-experience","office"]'))
  check('S04 creative 分类独立包含旧三名与dsh-doc且计数为4', s04Catalog.status === 0 && s04CatalogOutput.includes('creativeSkills=["cordis-plugin-development","editing-cordis-compositions","cordis-composition-reference","dsh-doc"]') && s04CatalogOutput.includes('creativeCount=4'))
  check('S04 ordinary 分类独立保留agent-experience与office两项', s04Catalog.status === 0 && s04CatalogOutput.includes('ordinary=["agent-experience","office"]'))
  const s04SeqBadDir = join(s04Workspace, 's04-seq-bad')
  writeSession(s04SeqBadDir, SESSION_LOG_NAME, [
    { type: 'session', data: { id: 's04-seq-bad', version: 1, cwd: 'C:/fixture-cwd' }, seq: 1 },
    { type: 'request/header', data: { header: { config: { model: 's04-model' }, tools: ['read'] } }, seq: 3 },
  ])
  const s04SeqBad = runScript(STEP04, exactSessionArgs(s04SeqBadDir, '--messages'))
  check('S04 seq 断档被查获为 INCOMPLETE 且退出非零', s04SeqBad.status !== 0 && s04SeqBad.output.includes('INCOMPLETE') && s04SeqBad.output.includes('seq不连续'))
  const writeS04HeaderCase = (label, tools) => {
    const dir = join(s04Workspace, label)
    writeSession(dir, SESSION_LOG_NAME, [
      { type: 'session', data: { id: label, version: 1, cwd: 'C:/fixture-cwd' }, seq: 1 },
      { type: 'agent-preset/selected', data: { agentPreset: 'extra-plan-planner' }, seq: 2 },
      { type: 'request/header', data: { header: { config: { model: 's04-model' }, tools } }, seq: 3 },
    ])
    return runScript(STEP04, exactSessionArgs(dir, '--messages'))
  }
  const s04NoDup = writeS04HeaderCase('s04-nodup', ['read', 'pwsh'])
  const s04NoDupNamesMatch = s04NoDup.output.match(/toolNames=\[([^\]]*)\]/)
  const s04NoDupNames = s04NoDupNamesMatch === null ? [] : s04NoDupNamesMatch[1].split(',').map((s) => s.replace(/"/g, ''))
  check('S04-1 正例工具面非空且无重名', s04NoDup.status === 0 && s04NoDup.output.includes('toolNames=["read","pwsh"] toolCount=2') && new Set(s04NoDupNames).size === s04NoDupNames.length && s04NoDupNames.length === 2, String(s04NoDup.output).slice(0, 200))
  const s04Dup = writeS04HeaderCase('s04-dup', ['read', 'read'])
  checkFidelity('S04-1 反例重复工具名被如实呈现（保真断言，违规被如实打印，不构成规则通过）', s04Dup.status === 0 && s04Dup.output.includes('toolNames=["read","read"]') && s04Dup.output.includes('toolCount=2'), String(s04Dup.output).slice(0, 200))
  const s04PtcOk = writeS04HeaderCase('s04-ptc-ok', ['run_code'])
  check('S04-2 正例 PTC 载体面恰为 run_code', s04PtcOk.status === 0 && s04PtcOk.output.includes('toolNames=["run_code"] toolCount=1'))
  const s04PtcLeak = writeS04HeaderCase('s04-ptc-leak', ['run_code', 'pwsh'])
  checkFidelity('S04-2 反例 PTC 面泄漏 pwsh 被如实呈现（保真断言，违规被如实打印，不构成规则通过）', s04PtcLeak.status === 0 && s04PtcLeak.output.includes('toolNames=["run_code","pwsh"]'))
  const s04ReadonlyOk = writeS04HeaderCase('s04-readonly-ok', ['read'])
  check('S04-3 正例 planner 只读面不含写/控制工具', s04ReadonlyOk.status === 0 && s04ReadonlyOk.output.includes('toolNames=["read"]') && !s04ReadonlyOk.output.includes('"write"') && !s04ReadonlyOk.output.includes('"edit"') && !s04ReadonlyOk.output.includes('"send_message"') && !s04ReadonlyOk.output.includes('"subagent_plan"'))
  const s04ReadonlyWrite = writeS04HeaderCase('s04-readonly-write', ['read', 'write'])
  checkFidelity('S04-3 反例 planner 面含 write 被如实呈现（保真断言，违规被如实打印，不构成规则通过）', s04ReadonlyWrite.status === 0 && s04ReadonlyWrite.output.includes('toolNames=["read","write"]'))
  check('S04-4 正例 strict 会话工具面如实呈现且不越界', s04Strict.output.includes('toolNames=["read","pwsh"]') && !s04Strict.output.includes('"write"') && !s04Strict.output.includes('"glob"') && !s04Strict.output.includes('"web_search"'))
  mkdirSync(join(fixtureHome, 'traces'), { recursive: true })
  const s04TracePath = join(fixtureHome, 'traces', 's04-trace.json')
  writeFileSync(s04TracePath, JSON.stringify({ sessionId: 's04-main', requests: [{ sessionId: 's04-main', requestIndex: 0, tool: 'read', status: 'ok' }] }))
  const s04Trace = runScript(STEP04, exactSessionArgs(s04StrictDir, '--messages', '--request-trace', s04TracePath))
  check('S04-5 正例 request trace 全量归属 REQUEST_EXACT=true', s04Trace.status === 0 && s04Trace.output.includes('REQUEST_EXACT=true') && s04Trace.output.includes('"sessionId":"s04-main"') && s04Trace.output.includes('"requestIndex":0'))
  const s04TraceBadPath = join(fixtureHome, 'traces', 's04-trace-bad.json')
  writeFileSync(s04TraceBadPath, JSON.stringify({ sessionId: 's04-main', requests: [{ sessionId: 's04-main', requestIndex: 0 }, { sessionId: 'other-session', requestIndex: 1 }] }))
  const s04TraceBad = runScript(STEP04, exactSessionArgs(s04StrictDir, '--messages', '--request-trace', s04TraceBadPath))
  check('S04-5 反例 trace 错 SessionId 被拒为 INCOMPLETE 且退出非零', s04TraceBad.status !== 0 && s04TraceBad.output.includes('INCOMPLETE') && s04TraceBad.output.includes('trace存在错SessionId request'))

  const step05Args = exactSessionArgs(mainDir, '--compact')
  const step05FullArgs = exactSessionArgs(mainDir, '--output-mode', 'full')
  const step05 = runScript(STEP05, step05Args)
  const step05Full = runScript(STEP05, step05FullArgs)
  check('step-05 compact/full统计一致且full保留data', step05.status === 0 && step05Full.status === 0 && step05.output.includes('事件类型计数：') && step05.output.includes('summary=') && step05Full.output.includes('--- agent-preset 相关事件 ---') && step05Full.output.includes('fixture-plan-data'))
  // S05 断言块（合成夹具）：S05-1/3/4/5。
  const s05Workspace = join(sessionsRoot, 's05-workspace')
  const s05MainDir = join(s05Workspace, 's05-main')
  writeSession(s05MainDir, SESSION_LOG_NAME, [
    session('s05-main'),
    { type: 'request/header', data: { header: { config: { model: 'fixture-model' }, tools: ['read', 'pwsh'] } } },
    { type: 'agent-preset/selected', data: { agentPreset: 'extra-plan-planner' } },
    { type: 'plan/mode', data: { mode: 'continuable', plan: 's05-plan-data' } },
  ])
  const s05 = runScript(STEP05, exactSessionArgs(s05MainDir, '--compact'))
  const s05Full = runScript(STEP05, exactSessionArgs(s05MainDir, '--output-mode', 'full'))
  check('S05-1/S05-5 合规会话 exit0 无 INCOMPLETE 且事件计数齐全', s05.status === 0 && !s05.output.includes('INCOMPLETE') && s05.output.includes('"request/header":1') && s05.output.includes('"agent-preset/selected":1') && s05.output.includes('"plan/mode":1'))
  check('S05-3 正例 header model 非空且工具数大于 0', s05.output.includes('L2 model=fixture-model tools=2'))
  check('S05-4 正例 preset 值合法且主会话恰一条 selected', s05.output.includes('--- agent-preset 相关事件 count=1 ---') && s05Full.output.includes('"agentPreset":"extra-plan-planner"'))
  check('S05 补充 plan/mode 计数与 summary 可见', s05.output.includes('--- plan/mode 事件 count=1 ---') && s05.output.includes('summary='))
  const s05BadDir = join(s05Workspace, 's05-bad')
  writeSession(s05BadDir, SESSION_LOG_NAME, [
    session('s05-bad'),
    { type: 'request/header', data: { header: { tools: ['read'] } } },
    { type: 'agent-preset/selected', data: { agentPreset: 'extra-plan-planner-evil' } },
  ])
  const s05Bad = runScript(STEP05, exactSessionArgs(s05BadDir, '--compact'))
  const s05BadFull = runScript(STEP05, exactSessionArgs(s05BadDir, '--output-mode', 'full'))
  checkFidelity('S05-3 反例 model 缺失如实呈现 model=undefined（保真断言，如实呈现，不构成规则通过）', s05Bad.status === 0 && s05Bad.output.includes('L2 model=undefined tools=1'))
  checkFidelity('S05-4 反例未知 preset id 被如实呈现（保真断言，违规被如实打印，不构成规则通过）', s05BadFull.status === 0 && s05BadFull.output.includes('"agentPreset":"extra-plan-planner-evil"'))

  const step07SelectionArgs = idSessionArgs('main-v4', v4Workspace, '--discover-children')
  const step07MissingSession = runScript(STEP07, ['--full'], { PLANNER_PROMPT_SUFFIX: 'fixture-suffix' })
  const step07MissingSuffix = runScript(STEP07, [...step07SelectionArgs, '--full'])
  check('step-07 无显式会话选择按新合同NOT-RUN且exit0', step07MissingSession.status === 0 && step07MissingSession.output.includes('NOT-RUN'))
  check('step-07 显式会话但缺PLANNER_PROMPT_SUFFIX为输入错误', step07MissingSuffix.status !== 0 && step07MissingSuffix.output.includes('必须显式设置 PLANNER_PROMPT_SUFFIX'))

  const step07 = runScript(STEP07, step07SelectionArgs, { PLANNER_PROMPT_SUFFIX: 'fixture-suffix' })
  check('step-07 v4 fixture 退出码为 0', step07.status === 0, String(step07.status))
  check('step-07 输出父工具关联 subagent_plan complete=yes', step07.output.includes('父工具关联：subagent_plan') && step07.output.includes('complete=yes'))
  check('step-07 输出 role=pro规划', step07.output.includes('role=pro规划') && !step07.output.includes('role-evidence-insufficient'))
  check('step-07 输出 suffix verified-injection', step07.output.includes('suffix判定=verified-injection') && !step07.output.includes('suffix判定=content-only'))
  check('step-07 保留 actual provenance 分栏', step07.output.includes('actual provenance source.kind=model provider=openai-codex model=gpt-5.6-sol'))
  const step07Verbose = runScript(STEP07, [...step07SelectionArgs, '--verbose'], { PLANNER_PROMPT_SUFFIX: 'fixture-suffix' })
  const step07Full = runScript(STEP07, [...step07SelectionArgs, '--full'], { PLANNER_PROMPT_SUFFIX: 'fixture-suffix' })
  check('step-07 compact/verbose/full 退出码与核心字段一致', step07.status === 0 && step07Verbose.status === 0 && step07Full.status === 0 && step07Verbose.output.includes('suffix判定=verified-injection') && step07Full.output.includes('suffix判定=verified-injection') && step07Full.output.includes('assistant/message event（完整）='))
  check('step-07 compact 不嵌完整事件且显著小于full', !step07.output.includes('assistant/message event（完整）=') && !step07.output.includes('arguments（完整）=') && step07.output.length < step07Full.output.length)
  const step07Raw = writeRawEvidence({ directory: v4EvidenceRoot, baseName: 'step07', stdout: step07.stdout, stderr: step07.stderr })
  checkRawEvidence('step-07 摘要raw', step07Raw, step07.stdout, step07.stderr)
  check('step-07 raw保留status/error/argv关联', step07.status === 0 && step07.signal === null && step07.error === undefined && Array.isArray(step07.argv) && step07.argv.includes(STEP07))

  const step06 = runScript(STEP06, exactSessionArgs(mainDir))
  check('step-06 v4 fixture 退出码为 0', step06.status === 0, String(step06.status))
  check('step-06 错误文本恰展示一次', countOf(step06.output, 'TOOL-ERROR') === 1 && countOf(step06.output, 'fixture-error-text') === 1)
  check('step-06 成功 result 不产生 TOOL-ERROR', !step06.output.includes('TOOL-ERROR fixture save ok'))
  // S06 断言块（合成夹具）：S06-1/2/3 + pwsh 与 retry/error/failed 分支覆盖。
  const s06Workspace = join(sessionsRoot, 's06-workspace')
  // 夹具拒因改为手写常量：S06-2/S06-3 的期望值来源与被测实现（lib/gate-decisions.js）互相独立，
  // 生产侧改词不会再带着期望值一起漂移。实况与手写常量的差异由下方规约锁断言暴露为失败。
  const pwshRejectText = '规划子代理只读：pwsh 仅限只读探查命令，禁止创建/修改/删除文件；触发依据：pwsh PWSH_MUTATION'
  const reviewerRejectText = '验收复核者只读：验收复核不修改任何文件，write/edit 一律禁止（工具目录判定）'
  const pwshRejectActual = shellMutationReason('planner', { name: 'pwsh', arguments: { command: 'git add fixture.txt' } })
  const reviewerRejectActual = childReadonlyGateReason({ name: 'write', arguments: { file: 'a.txt', text: 'x' } }, false)
  check('S06 规约锁：手写拒因常量与 gate-decisions 实际输出逐字一致（期望值不由被测实现生成）', pwshRejectActual === pwshRejectText && reviewerRejectActual === reviewerRejectText, JSON.stringify({ pwshActual: pwshRejectActual, pwshExpected: pwshRejectText, reviewerActual: reviewerRejectActual, reviewerExpected: reviewerRejectText }))
  const s06PlannerDir = join(s06Workspace, 's06-planner')
  writeSession(s06PlannerDir, SESSION_LOG_NAME, [
    session('s06-planner'),
    call('pwsh', 's06-pwsh-1', { command: 'git add fixture.txt' }),
    result('s06-pwsh-1', true, pwshRejectText),
    call('save_plan', 's06-save-1', { plan: 'ok' }),
    result('s06-save-1', true, 'fixture-ordinary-error'),
    { type: 'agent/retry', data: { note: 'fixture retry event' } },
  ])
  const s06Planner = runScript(STEP06, exactSessionArgs(s06PlannerDir))
  check('S06 pwsh 分支 PWSH-CALL 打印命令原文', s06Planner.status === 0 && s06Planner.output.includes('PWSH-CALL git add fixture.txt'))
  check('S06 retry/error/failed 分支 EVENT 行打印', s06Planner.output.includes('EVENT[agent/retry]'))
  check('S06-1 门禁族与普通工具错各一条 TOOL-ERROR 且文本可见', countOf(s06Planner.output, 'TOOL-ERROR') === 2 && s06Planner.output.includes(pwshRejectText) && s06Planner.output.includes('fixture-ordinary-error'), String(s06Planner.output).slice(0, 200))
  check('S06-2 正例只读角色 shell 写命令必被拒', s06Planner.output.includes(pwshRejectText) && s06Planner.output.includes('PWSH-CALL git add fixture.txt'), String(s06Planner.output).slice(0, 200))
  const s06LeakDir = join(s06Workspace, 's06-leak')
  writeSession(s06LeakDir, SESSION_LOG_NAME, [
    session('s06-leak'),
    { type: 'agent-preset/selected', data: { agentPreset: 'extra-plan-planner' } },
    call('pwsh', 's06-leak-1', { command: 'git commit -m leak' }),
    result('s06-leak-1', false, 'command ok'),
  ])
  const s06Leak = runScript(STEP06, exactSessionArgs(s06LeakDir))
  checkFidelity('S06-2 反例越权写成功如实呈现且不产生拒句（保真断言，违规被如实打印，不构成规则通过）', s06Leak.status === 0 && s06Leak.output.includes('PWSH-CALL git commit -m leak') && countOf(s06Leak.output, 'TOOL-ERROR') === 0)
  const s06ReviewerDir = join(s06Workspace, 's06-reviewer')
  writeSession(s06ReviewerDir, SESSION_LOG_NAME, [
    session('s06-reviewer'),
    { type: 'agent-preset/selected', data: { agentPreset: 'extra-plan-reviewer' } },
    call('write', 's06-write-1', { file: 'a.txt', text: 'x' }),
    result('s06-write-1', true, reviewerRejectText),
  ])
  const s06Reviewer = runScript(STEP06, exactSessionArgs(s06ReviewerDir))
  check('S06-3 正例 reviewer write 必被拒', s06Reviewer.output.includes(reviewerRejectText) && countOf(s06Reviewer.output, 'TOOL-ERROR') === 1, String(s06Reviewer.output).slice(0, 200))
  const s06WriteOkDir = join(s06Workspace, 's06-write-ok')
  writeSession(s06WriteOkDir, SESSION_LOG_NAME, [
    session('s06-write-ok'),
    { type: 'agent-preset/selected', data: { agentPreset: 'extra-plan-reviewer' } },
    call('write', 's06-write-ok-1', { file: 'a.txt', text: 'x' }),
    result('s06-write-ok-1', false, 'file written'),
  ])
  const s06WriteOk = runScript(STEP06, exactSessionArgs(s06WriteOkDir))
  const s06WriteOkBody = s06WriteOk.output.split('\n').filter((line) => !/^===== 会话 .+ =====$/.test(line.trim()) && !line.trim().startsWith('[host-deps]')).join('\n')
  checkFidelity('S06-3 反例 reviewer write 成功在本查看器不可观测（保真断言，剔查看器会话标题行与 host-deps 横幅后输出 trim 为空）', s06WriteOk.status === 0 && s06WriteOkBody.trim() === '', String(s06WriteOk.output).slice(0, 200))
  // S06-5：PTC 会话直呼非 run_code 工具；宿主 pre-execute 早退文案由夹具逐字提供。
  // 该文案取自 pe-test/docs/ai-实机闸门测试流程.md 的 C10 陷阱条目完整模板
  // （unknown tool "<name>": only run_code is callable directly — call <name> from inside a run_code program instead）
  // 并按 name=web_search 实例化；文档同时明令该文案不算闸门证据，故本段只作查看器回显保真断言（checkFidelity），不计入规则通过。
  const s06PtcDir = join(s06Workspace, 's06-ptc-unknown')
  const s06PtcUnknownText = 'unknown tool "web_search": only run_code is callable directly — call web_search from inside a run_code program instead'
  writeSession(s06PtcDir, SESSION_LOG_NAME, [
    session('s06-ptc-unknown'),
    { type: 'agent-preset/selected', data: { agentPreset: 'extra-plan-planner' } },
    call('web_search', 's06-ptc-1', { query: 's06 fixture ptc direct call' }),
    result('s06-ptc-1', true, s06PtcUnknownText),
  ])
  const s06Ptc = runScript(STEP06, exactSessionArgs(s06PtcDir))
  const s06PtcToolErrorLines = s06Ptc.output.split('\n').map((line) => line.trim()).filter((line) => line.includes('TOOL-ERROR'))
  const s06PtcReason = s06PtcToolErrorLines.length === 1 ? s06PtcToolErrorLines[0].slice(s06PtcToolErrorLines[0].indexOf('TOOL-ERROR') + 'TOOL-ERROR'.length).trim() : ''
  checkFidelity('S06-5 PTC 直呼非 run_code 工具的回显保真（保真断言：仅验证查看器逐字回显 C10 早退文案，按文档 C10 该文案不计入闸门证据）', s06Ptc.status === 0 && s06PtcToolErrorLines.length === 1 && s06PtcReason === s06PtcUnknownText, JSON.stringify({ lines: s06PtcToolErrorLines.length, reason: s06PtcReason }))


  // S06-4：三类 gate 取值（route→purpose→clarify）的 ask 标签各一条 ask 调用与结果；查看器按日志顺序逐行打印
  // CALL ask_user_question，故用三个标签在输出行上的下标做严格递增比较（不做宽松 includes）。
  const s06AskOrderDir = join(s06Workspace, 's06-ask-order')
  const s06AskAnchors = ['route', 'purpose', 'clarify']
  writeSession(s06AskOrderDir, SESSION_LOG_NAME, [
    session('s06-ask-order'),
    { type: 'agent-preset/selected', data: { agentPreset: 'extra-plan-planner' } },
    ...s06AskAnchors.flatMap((anchor, index) => [
      call('ask_user_question', 's06-ask-' + index, { question: 's06-ask-anchor-' + anchor }),
      result('s06-ask-' + index, false, 's06-ask-answer-' + anchor),
    ]),
  ])
  const s06AskOrder = runScript(STEP06, exactSessionArgs(s06AskOrderDir))
  const s06AskOrderLines = s06AskOrder.output.split('\n')
  const s06AskOrderIndexes = s06AskAnchors.map((askAnchor) => s06AskOrderLines.findIndex((line) => line.includes('CALL ask_user_question') && line.includes('s06-ask-anchor-' + askAnchor)))
  check('S06-4 三类 gate 取值的 ask 回显顺序在查看器输出中保持', s06AskOrder.status === 0 && s06AskOrderIndexes.every((index) => index >= 0) && s06AskOrderIndexes.every((index, position) => position === 0 || index > s06AskOrderIndexes[position - 1]), JSON.stringify(s06AskOrderIndexes))

  const pairWorkspace = join(sessionsRoot, 'pair-workspace')
  const pairDir = join(pairWorkspace, 'pair-main-v4')
  const pairChildDir = join(pairWorkspace, 'pair-child-v4')
  const pairBudgetOnlyDir = join(pairWorkspace, 'pair-budget-only-v4')
  writeSession(pairDir, SESSION_LOG_NAME, [
    session('pair-main-v4'),
    call('save_plan', 'pair-ordinary-1', { plan: 'pair-child-v4' }),
    result('pair-ordinary-1', undefined, 'ordinary pair-child-v4'),
    call('subagent_plan', 'pair-native-1', { prompt: 'pair-child-v4' }),
    result('pair-native-1', false, 'pair-child-v4'),
    { type: 'tool/ptc-dispatch-start', data: { subCallId: 'pair-ptc-1', name: 'subagent_plan', arguments: { prompt: 'pair-child-v4' } } },
    { type: 'tool/ptc-dispatch', data: { subCallId: 'pair-ptc-1', name: 'subagent_plan', arguments: {}, isError: false, content: [{ type: 'text', text: 'pair-child-v4' }] } },
    { type: 'tool/ptc-dispatch-start', data: { subCallId: 'pair-collision-1', name: 'subagent_plan', arguments: { prompt: 'pair-child-v4-extra' } } },
    { type: 'tool/ptc-dispatch', data: { subCallId: 'pair-collision-1', name: 'subagent_plan', arguments: {}, isError: false, content: [{ type: 'text', text: 'pair-child-v4-extra' }] } },
    result('pair-error-1', true, 'pair-error'),
    inboxResult('pair-inbox-1', 'pair-inbox-error'),
    badIdentityResult('pair-bad-1', 'pair-bad-identity'),
    result('pair-orphan-1', false, 'pair-child-v4'),
  ])
  writeSession(pairChildDir, SESSION_LOG_NAME, [
    session('pair-child-v4', { parentSession: 'pair-main-v4', origin: 'subagent', delegationDepth: 1 }),
    { type: 'plan/mode', data: { mode: 'continuable', plan: 'pair-child-plan' } },
    descriptor(),
    { type: 'assistant/message', data: { message: { id: 'pair-assistant', role: 'assistant', source: { kind: 'model', provider: 'pair-provider', model: 'pair-model' }, content: [{ type: 'text', text: 'pair child output' }] } } },
    { type: 'user/message', data: { message: { id: 'pair-user', role: 'user', source: { kind: 'user' }, content: [{ type: 'text', text: 'pair child content' }] } } },
    { type: 'user/message', data: { message: { id: 'pair-budget', role: 'user', source: { kind: 'plugin:dsh-extra-plan' }, content: [{ type: 'text', text: '本轮探查预算还剩 2 次，未查项记入待确认假设清单' }] } } },
  ])
  writeSession(pairBudgetOnlyDir, SESSION_LOG_NAME, [
    session('pair-budget-only-v4', { parentSession: 'pair-main-v4', origin: 'subagent', delegationDepth: 1 }),
    descriptor(),
    { type: 'user/message', data: { message: { id: 'pair-budget-only', role: 'user', source: { kind: 'plugin:dsh-extra-plan' }, content: [{ type: 'text', text: '本轮探查预算还剩 1 次，未查项记入待确认假设清单' }] } } },
  ])
  const pairReplay = replayJsonl(join(pairDir, SESSION_LOG_NAME))
  check('pair-only fixture 解压 JSONL 可解析', pairReplay.frameCount > 0 && pairReplay.invalid === 0)
  const pairStep06 = runScript(STEP06, exactSessionArgs(pairDir))
  check('pair-only canonical结果仅true产生错误诊断', pairStep06.status === 0 && countOf(pairStep06.output, 'TOOL-ERROR') === 1 && pairStep06.output.includes('pair-error') && !pairStep06.output.includes('pair-inbox-error') && !pairStep06.output.includes('pair-bad-identity'))
  const pairStep07Args = idSessionArgs('pair-main-v4', pairWorkspace, '--discover-children')
  const pairStep07 = runScript(STEP07, pairStep07Args, { PLANNER_PROMPT_SUFFIX: 'pair-suffix' })
  const pairStep07Full = runScript(STEP07, [...pairStep07Args, '--full'], { PLANNER_PROMPT_SUFFIX: 'pair-suffix' })
  check('pair-only step-07仅唯一native/PTC真配对complete且普通/碰撞/孤立无link', pairStep07.status === 0 && pairStep07Full.status === 0 && countOf(pairStep07.output, '父工具关联：subagent_plan') === 2 && !pairStep07.output.includes('父工具关联：save_plan') && pairStep07.output.includes('complete=yes'))
  check('pair-only预算独立索引全文且不提升suffix等级', pairStep07.output.includes('A43 budgetNotice index count=1') && pairStep07Full.output.includes('BUDGET-NOTICE kind=plugin:dsh-extra-plan') && pairStep07Full.output.includes('budgetNotice fragment（完整；not suffix）') && pairStep07.output.includes('suffix判定=absent') && pairStep07.output.includes('suffix判定=no-log') && pairStep07Full.output.includes('suffix判定=absent') && pairStep07Full.output.includes('suffix判定=no-log'))
  const wWorkspace = join(sessionsRoot, 'w-workspace')
  const wMainDir = join(wWorkspace, 'w-main-v4')
  const wChildNames = [
    'session-w-shared',
    'w-shared',
    'w-native-multi-a',
    'w-native-multi-b',
    'w-ptc-multi-a',
    'w-ptc-multi-b',
    'w-call-only-multi-a',
    'w-call-only-multi-b',
    'w-native-ok',
    'w-ptc-ok',
    'w-call-only-ok',
  ]
  const writeWChild = (directoryName, id, text = '') => {
    const events = [
      session(id, { parentSession: 'w-main-v4', origin: 'subagent', delegationDepth: 1 }),
      { type: 'plan/mode', data: { mode: 'continuable', plan: id + '-plan' } },
      descriptor(),
    ]
    if (text !== '') events.push({ type: 'user/message', data: { message: { id: id + '-user', role: 'user', source: { kind: 'user' }, content: [{ type: 'text', text }] } } })
    writeSession(join(wWorkspace, directoryName), SESSION_LOG_NAME, events)
  }
  writeWChild('session-w-shared', 'session-w-shared')
  writeWChild('w-shared', 'w-shared', 'w shared child w-suffix')
  writeWChild('w-native-multi-a', 'w-native-multi-a')
  writeWChild('w-native-multi-b', 'w-native-multi-b')
  writeWChild('w-ptc-multi-a', 'w-ptc-multi-a')
  writeWChild('w-ptc-multi-b', 'w-ptc-multi-b')
  writeWChild('w-call-only-multi-a', 'w-call-only-multi-a')
  writeWChild('w-call-only-multi-b', 'w-call-only-multi-b')
  writeWChild('w-native-ok', 'w-native-ok')
  writeWChild('w-ptc-ok', 'w-ptc-ok')
  writeWChild('w-call-only-ok', 'w-call-only-ok')
  writeSession(wMainDir, SESSION_LOG_NAME, [
    session('w-main-v4'),
    call('subagent_plan', 'w-shared-1', { prompt: 'session-w-shared' }),
    result('w-shared-1', false, 'session-w-shared'),
    call('subagent_plan', 'w-native-multi-1', { prompt: 'w-native-multi-a w-native-multi-b' }),
    result('w-native-multi-1', false, 'w-native-multi-a w-native-multi-b'),
    { type: 'tool/ptc-dispatch-start', data: { subCallId: 'w-ptc-multi-1', name: 'subagent_plan', arguments: { prompt: 'w-ptc-multi-a w-ptc-multi-b' } } },
    { type: 'tool/ptc-dispatch', data: { subCallId: 'w-ptc-multi-1', name: 'subagent_plan', arguments: {}, isError: false, content: [{ type: 'text', text: 'w-ptc-multi-a w-ptc-multi-b' }] } },
    call('subagent_plan', 'w-call-only-multi-1', { prompt: 'w-call-only-multi-a w-call-only-multi-b' }),
    call('subagent_plan', 'w-native-ok-1', { prompt: 'w-native-ok' }),
    result('w-native-ok-1', false, 'w-native-ok'),
    { type: 'tool/ptc-dispatch-start', data: { subCallId: 'w-ptc-ok-1', name: 'subagent_plan', arguments: { prompt: 'w-ptc-ok' } } },
    { type: 'tool/ptc-dispatch', data: { subCallId: 'w-ptc-ok-1', name: 'subagent_plan', arguments: {}, isError: false, content: [{ type: 'text', text: 'w-ptc-ok' }] } },
    call('subagent_plan', 'w-call-only-ok-1', { prompt: 'w-call-only-ok' }),
  ])
  const writeWAmbiguityCase = ({ label, carrier, kind, children, mention }) => {
    const workspace = join(sessionsRoot, 'w-ambiguity-' + label)
    const parentId = 'w-ambiguity-' + label + '-main'
    const parentDir = join(workspace, parentId)
    const callId = 'w-ambiguity-' + label + '-call'
    for (const child of children) {
      writeSession(join(workspace, child.directory), SESSION_LOG_NAME, [
        session(child.id, { parentSession: parentId, origin: 'subagent', delegationDepth: 1 }),
        { type: 'plan/mode', data: { mode: 'continuable', plan: child.id + '-plan' } },
        descriptor(),
      ])
    }
    const parentEvents = [session(parentId)]
    if (carrier === 'native') {
      parentEvents.push(call('subagent_plan', callId, { prompt: mention }), result(callId, false, mention))
    } else if (carrier === 'ptc') {
      parentEvents.push(
        { type: 'tool/ptc-dispatch-start', data: { subCallId: callId, name: 'subagent_plan', arguments: { prompt: mention } } },
        { type: 'tool/ptc-dispatch', data: { subCallId: callId, name: 'subagent_plan', arguments: {}, isError: false, content: [{ type: 'text', text: mention }] } },
      )
    } else if (carrier === 'call-only') {
      parentEvents.push(call('subagent_plan', callId, { prompt: mention }))
    } else {
      throw new Error('unknown ambiguity carrier: ' + carrier)
    }
    writeSession(parentDir, SESSION_LOG_NAME, parentEvents)
    const replay = replayJsonl(join(parentDir, SESSION_LOG_NAME))
    check('W独立歧义fixture ' + label + ' 解压JSONL可解析', replay.frameCount > 0 && replay.rowCount > 0 && replay.invalid === 0)
    const outcome = runScript(STEP07, idSessionArgs(parentId, workspace, '--discover-children'), { PLANNER_PROMPT_SUFFIX: 'w-suffix' })
    const fullOutcome = runScript(STEP07, [...idSessionArgs(parentId, workspace, '--discover-children'), '--full'], { PLANNER_PROMPT_SUFFIX: 'w-suffix' })
    const expectedReason = kind === 'unique' ? 'multiple-child-targets' : 'alias-multiple-candidates'
    const expectedAliases = kind === 'shared' ? ['same-alias'] : kind === 'unique' ? ['unique-target-a', 'unique-target-b'] : ['mixed-unique', 'same-alias']
    const expectedCandidates = children.map((child) => child.directory).sort()
    const diagnosticNeedles = [
      'reason=' + expectedReason,
      'callId=' + callId,
      'parentLine=L2',
      'aliases=' + JSON.stringify(expectedAliases),
      'candidates=' + JSON.stringify(expectedCandidates),
    ]
    for (const [mode, current] of [['compact', outcome], ['full', fullOutcome]]) {
      check('W独立歧义' + label + ' ' + mode + '退出0且诊断字段齐全', current.status === 0 && diagnosticNeedles.every((needle) => current.output.includes(needle)) && current.output.includes('role-evidence-insufficient') && !current.output.includes('role=pro规划') && !current.output.includes('suffix判定=verified-injection'))
      check('W独立歧义' + label + ' ' + mode + '不产生任何child link', children.every((child) => !current.output.includes('child ID=' + child.directory + ' complete=')) && (mode === 'compact' || current.output.includes('A44 parent association ambiguity full=')))
    }
  }
  const wAmbiguityCases = [
    { label: 'native-shared-alias', carrier: 'native', kind: 'shared', mention: 'same-alias', children: [{ directory: 'same-alias', id: 'same-alias-header-a' }, { directory: 'session-same-alias', id: 'same-alias-header-b' }] },
    { label: 'native-two-unique', carrier: 'native', kind: 'unique', mention: 'unique-target-a unique-target-b', children: [{ directory: 'unique-target-a', id: 'unique-target-a-header' }, { directory: 'unique-target-b', id: 'unique-target-b-header' }] },
    { label: 'native-mixed-alias', carrier: 'native', kind: 'mixed', mention: 'mixed-unique same-alias', children: [{ directory: 'mixed-unique', id: 'mixed-unique-header' }, { directory: 'same-alias', id: 'same-alias-header-a' }, { directory: 'session-same-alias', id: 'same-alias-header-b' }] },
    { label: 'ptc-shared-alias', carrier: 'ptc', kind: 'shared', mention: 'same-alias', children: [{ directory: 'same-alias', id: 'same-alias-header-a' }, { directory: 'session-same-alias', id: 'same-alias-header-b' }] },
    { label: 'ptc-two-unique', carrier: 'ptc', kind: 'unique', mention: 'unique-target-a unique-target-b', children: [{ directory: 'unique-target-a', id: 'unique-target-a-header' }, { directory: 'unique-target-b', id: 'unique-target-b-header' }] },
    { label: 'ptc-mixed-alias', carrier: 'ptc', kind: 'mixed', mention: 'mixed-unique same-alias', children: [{ directory: 'mixed-unique', id: 'mixed-unique-header' }, { directory: 'same-alias', id: 'same-alias-header-a' }, { directory: 'session-same-alias', id: 'same-alias-header-b' }] },
    { label: 'call-only-shared-alias', carrier: 'call-only', kind: 'shared', mention: 'same-alias', children: [{ directory: 'same-alias', id: 'same-alias-header-a' }, { directory: 'session-same-alias', id: 'same-alias-header-b' }] },
    { label: 'call-only-two-unique', carrier: 'call-only', kind: 'unique', mention: 'unique-target-a unique-target-b', children: [{ directory: 'unique-target-a', id: 'unique-target-a-header' }, { directory: 'unique-target-b', id: 'unique-target-b-header' }] },
    { label: 'call-only-mixed-alias', carrier: 'call-only', kind: 'mixed', mention: 'mixed-unique same-alias', children: [{ directory: 'mixed-unique', id: 'mixed-unique-header' }, { directory: 'same-alias', id: 'same-alias-header-a' }, { directory: 'session-same-alias', id: 'same-alias-header-b' }] },
  ]
  for (const ambiguityCase of wAmbiguityCases) writeWAmbiguityCase(ambiguityCase)
  const wSessionFiles = [wMainDir, ...wChildNames.map((name) => join(wWorkspace, name))].map((directory) => join(directory, SESSION_LOG_NAME))
  const wReplays = wSessionFiles.map((file) => replayJsonl(file))
  check('W独立fixture解压 JSONL全部可解析', wReplays.every((replay) => replay.frameCount > 0 && replay.rowCount > 0 && replay.invalid === 0))
  const wStep07Args = idSessionArgs('w-main-v4', wWorkspace, '--discover-children')
  const wStep07 = runScript(STEP07, wStep07Args, { PLANNER_PROMPT_SUFFIX: 'w-suffix' })
  const wStep07Full = runScript(STEP07, [...wStep07Args, '--full'], { PLANNER_PROMPT_SUFFIX: 'w-suffix' })
  const wAmbiguityNeedles = [
    'callId=w-shared-1',
    'reason=alias-multiple-candidates',
    'callId=w-native-multi-1',
    'callId=w-ptc-multi-1',
    'callId=w-call-only-multi-1',
    'reason=multiple-child-targets',
  ]
  check('W step-07 compact/full歧义诊断均退出0且含原因、callId、父行号、候选child', wStep07.status === 0 && wStep07Full.status === 0 && wAmbiguityNeedles.every((needle) => wStep07.output.includes(needle) && wStep07Full.output.includes(needle)) && wStep07.output.includes('parentLine=L2') && wStep07.output.includes('candidates=["session-w-shared","w-shared"]') && wStep07Full.output.includes('A44 parent association ambiguity full='))
  const wAmbiguousChildren = ['session-w-shared', 'w-shared', 'w-native-multi-a', 'w-native-multi-b', 'w-ptc-multi-a', 'w-ptc-multi-b', 'w-call-only-multi-a', 'w-call-only-multi-b']
  check('W多候选/多unique目标/多child call-only均不建link', wAmbiguousChildren.every((child) => !wStep07.output.includes('child ID=' + child + ' complete=')) && wStep07.output.includes('role-evidence-insufficient') && !wStep07.output.includes('suffix判定=verified-injection'))
  check('W唯一native/PTC/call-only正例保留', wStep07.output.includes('child ID=w-native-ok complete=yes') && wStep07.output.includes('child ID=w-ptc-ok complete=yes') && wStep07.output.includes('child ID=w-call-only-ok complete=no'))
  const wStep07Raw = writeRawEvidence({ directory: v4EvidenceRoot, baseName: 'w-step07', stdout: wStep07.stdout, stderr: wStep07.stderr })
  checkRawEvidence('W step-07 raw', wStep07Raw, wStep07.stdout, wStep07.stderr)
  check('W step-07 raw保留status/error/argv关联', wStep07.status === 0 && wStep07.signal === null && wStep07.error === undefined && Array.isArray(wStep07.argv) && wStep07.argv.includes(STEP07))
  // S07 断言块（合成夹具）：S07-1/2/6 + request/context、model/selection、attempted-only/content-only/no-log、one-shot 覆盖缺口。
  const s07Workspace = join(sessionsRoot, 's07-workspace')
  const s07MainDir = join(s07Workspace, 's07-main')
  writeSession(s07MainDir, SESSION_LOG_NAME, [
    session('s07-main'),
    call('subagent_plan', 's07-plan-ok-1', { prompt: 's07-child-ok' }),
    result('s07-plan-ok-1', false, 's07-child-ok'),
    call('subagent_plan', 's07-plan-content-1', { prompt: '父 prompt 含 s07-suffix' }),
    result('s07-plan-content-1', false, 's07-child-content'),
    call('subagent_review', 's07-review-1', { prompt: 's07-child-oneshot' }),
    result('s07-review-1', false, 's07-child-oneshot'),
    call('subagent_plan', 's07-dangling-1', { prompt: 's07-child-dangling' }),
  ])
  const writeS07Child = (name, events) => writeSession(join(s07Workspace, name), SESSION_LOG_NAME, events)
  writeS07Child('s07-child-ok', [
    session('s07-child-ok', { parentSession: 's07-main', origin: 'subagent', delegationDepth: 1 }),
    { type: 'plan/mode', data: { mode: 'continuable', plan: 's07-child-ok-plan' } },
    descriptor(),
    { type: 'request/header', data: { header: { config: { provider: 's07-provider', model: 's07-model' } } } },
    { type: 'request/context', data: { context: { provider: 's07-provider', model: 's07-model', contextWindow: 64000 } } },
    { type: 'model/selection', data: { provider: 's07-provider', model: 's07-model', reason: 'fixture' } },
    { type: 'assistant/message', data: { message: { id: 's07-a1', role: 'assistant', source: { kind: 'model', provider: 's07-provider', model: 's07-model' }, content: [{ type: 'text', text: 's07 model output' }] } } },
    { type: 'user/message', data: { message: { id: 's07-u1', role: 'user', source: { kind: 'user' }, content: [{ type: 'text', text: 'child prompt with s07-suffix' }] } } },
  ])
  writeS07Child('s07-child-content', [
    session('s07-child-content', { parentSession: 's07-main', origin: 'subagent', delegationDepth: 1 }),
    { type: 'plan/mode', data: { mode: 'continuable', plan: 's07-child-content-plan' } },
    descriptor(),
    { type: 'user/message', data: { message: { id: 's07-c1', role: 'user', source: { kind: 'user' }, content: [{ type: 'text', text: 'has s07-suffix content' }] } } },
  ])
  writeS07Child('s07-child-attempted', [
    session('s07-child-attempted', { parentSession: 's07-main', origin: 'subagent', delegationDepth: 1 }),
    { type: 'plan/mode', data: { mode: 'continuable', plan: 's07-child-attempted-plan' } },
    descriptor(),
    { type: 'request/header', data: { header: { config: { provider: 's07-provider', model: 's07-model' } } } },
  ])
  writeS07Child('s07-child-nolog', [
    session('s07-child-nolog', { parentSession: 's07-main', origin: 'subagent', delegationDepth: 1 }),
    { type: 'plan/mode', data: { mode: 'continuable', plan: 's07-child-nolog-plan' } },
    descriptor(),
  ])
  writeS07Child('s07-child-oneshot', [
    session('s07-child-oneshot', { parentSession: 's07-main', origin: 'subagent', delegationDepth: 1 }),
    { type: 'subagent/descriptor', data: { mode: 'one-shot' } },
  ])
  writeS07Child('s07-child-orphan', [
    session('s07-child-orphan', { parentSession: 's07-main', origin: 'subagent', delegationDepth: 1 }),
    { type: 'plan/mode', data: { mode: 'continuable', plan: 's07-child-orphan-plan' } },
    descriptor(),
  ])
  writeS07Child('s07-child-dangling', [
    session('s07-child-dangling', { parentSession: 's07-main', origin: 'subagent', delegationDepth: 1 }),
    { type: 'plan/mode', data: { mode: 'continuable', plan: 's07-child-dangling-plan' } },
    descriptor(),
  ])
  writeS07Child('s07-child-misparent', [
    session('s07-child-misparent', { parentSession: 'other-main', origin: 'subagent', delegationDepth: 1 }),
    { type: 'plan/mode', data: { mode: 'continuable', plan: 's07-child-misparent-plan' } },
    descriptor(),
  ])
  const s07Args = idSessionArgs('s07-main', s07Workspace, '--discover-children')
  const s07 = runScript(STEP07, s07Args, { PLANNER_PROMPT_SUFFIX: 's07-suffix' })
  check('S07 新夹具 attempted route 三栏与 REQUEST/CONTEXT、MODEL/SELECTION 行齐全', s07.status === 0 && s07.output.includes('A42 attempted route index headers=1 contexts=1 selections=1') && s07.output.includes('REQUEST/CONTEXT attempted route provider=s07-provider model=s07-model contextWindow=64000') && s07.output.includes('MODEL/SELECTION attempted route fields=["model","provider","reason"]'))
  check('S07 新夹具 child-ok verified-injection 且 actual provenance 分栏保留（覆盖原待办 S07-4；attempted-only 半条由下一行断言覆盖）', s07.output.includes('suffix判定=verified-injection') && s07.output.includes('ASSISTANT/MESSAGE actual provenance source.kind=model provider=s07-provider model=s07-model') && s07.output.includes('模型证据等级=actual-provenance'))
  // 实测分级分布（7 child compact）：attempted-only=2（child-attempted + child-dangling，后者无 complete link 也仅记 attempted）、no-log=2（child-nolog + child-orphan）、content-only=1（child-content）；无 link 降级句=3（attempted/nolog/orphan）。
  check('S07 缺口 attempted-only 等级如实呈现', countOf(s07.output, 'suffix判定=attempted-only') === 2 && s07.output.includes('模型证据等级=attempted-only'))
  check('S07 缺口 no-log 等级如实呈现', countOf(s07.output, 'suffix判定=no-log') === 2 && s07.output.includes('模型证据等级=no-log'))
  check('S07 缺口 content-only（父 prompt 含 suffix）不升级', countOf(s07.output, 'suffix判定=content-only') === 1)
  check('S07 缺口 one-shot role=非pro规划 且 suffix判定=not-applicable', s07.output.includes('descriptor.mode=one-shot role=非pro规划') && s07.output.includes('父工具关联：subagent_review') && s07.output.includes('complete=yes') && s07.output.includes('suffix判定=not-applicable'))
  check('S07-1 正例 child 父归属自述一致', s07.output.includes('child谱系：parentSession=s07-main origin=subagent delegationDepth=1 descriptor.mode=continuable role=pro规划'))
  check('S07-1 反例错 parentSession 的 child 不被发现', !s07.output.includes('s07-child-misparent') && s07.output.includes('直接 child=7'))
  check('S07-2 正例 orphan 无 link 降级 role-evidence-insufficient', countOf(s07.output, '父工具关联：role-evidence-insufficient（无可关联 parent call/result child ID）') === 3 && s07.output.includes('role-evidence-insufficient'))
  check('S07-2 反例 dangling 无 complete link 不越级 + S07-6 无歧义 count=0', s07.output.includes('child ID=s07-child-dangling complete=no') && s07.output.includes('A44 parent association ambiguity count=0'))
  const step07BadJson = runScript(STEP07, idSessionArgs('g5-bad-json-main', join(sessionsRoot, 'g5-bad-json-workspace')), { PLANNER_PROMPT_SUFFIX: 'fixture-suffix' })
  const step07BadJsonRaw = writeRawEvidence({ directory: v4EvidenceRoot, baseName: 'step07-bad-json', stdout: step07BadJson.stdout, stderr: step07BadJson.stderr })
  checkRawEvidence('step-07坏JSON raw', step07BadJsonRaw, step07BadJson.stdout, step07BadJson.stderr)
  check('step-07坏JSON退出1且保存非空stderr诊断', step07BadJson.status === 1 && step07BadJson.stderr !== '' && step07BadJson.output.includes('L2') && step07BadJson.output.includes('INCOMPLETE'))
  const step07BadFrame = runScript(STEP07, idSessionArgs('g5-truncated-main', join(sessionsRoot, 'g5-truncated-workspace')), { PLANNER_PROMPT_SUFFIX: 'fixture-suffix' })
  const step07BadFrameRaw = writeRawEvidence({ directory: v4EvidenceRoot, baseName: 'step07-bad-frame', stdout: step07BadFrame.stdout, stderr: step07BadFrame.stderr })
  checkRawEvidence('step-07坏帧 raw', step07BadFrameRaw, step07BadFrame.stdout, step07BadFrame.stderr)
  check('step-07坏帧退出1且保存非空stderr诊断', step07BadFrame.status === 1 && step07BadFrame.stderr !== '' && step07BadFrame.output.includes('byte ') && step07BadFrame.output.includes('INCOMPLETE'))
  const stdioProbe = runScript('--eval', ["process.stdout.write('v4-out' + String.fromCharCode(10)); process.stderr.write('v4-err' + String.fromCharCode(10)); process.exitCode = 7"], { DSH_HOST_DEPS_QUIET: '1' })
  checkRawEvidence('纯stdio exit7探针 raw', stdioProbe.raw, stdioProbe.stdout, stdioProbe.stderr)
  const probeStdout = 'v4-out' + String.fromCharCode(10)
  const probeStderr = 'v4-err' + String.fromCharCode(10)
  const probeCombined = probeStdout + probeStderr
  const probeStdoutRaw = stdioProbe.raw?.files?.find((file) => file.channel === 'stdout')
  const probeStderrRaw = stdioProbe.raw?.files?.find((file) => file.channel === 'stderr')
  check('纯stdio exit7探针两流各7bytes/1行且combined14bytes/2行', stdioProbe.status === 7 && stdioProbe.signal === null && stdioProbe.error === undefined && stdioProbe.stdout === probeStdout && stdioProbe.stderr === probeStderr && probeStdoutRaw?.bytes === 7 && probeStdoutRaw?.lines === 1 && probeStdoutRaw?.sha256 === sha256Text(probeStdout) && probeStderrRaw?.bytes === 7 && probeStderrRaw?.lines === 1 && probeStderrRaw?.sha256 === sha256Text(probeStderr) && stdioProbe.raw?.bytes === 14 && stdioProbe.raw?.lines === 2 && stdioProbe.raw?.sha256 === sha256Text(probeCombined))

  const partialRunnerRoot = join(fixtureHome, 'partial-runner')
  const partialPeTest = join(partialRunnerRoot, 'pe-test')
  const partialTools = join(partialPeTest, 'tools')
  const partialShared = join(partialPeTest, '_shared')
  mkdirSync(partialTools, { recursive: true })
  mkdirSync(partialShared, { recursive: true })
  copyFileSync(join(HERE, '一键step测试.mjs'), join(partialTools, '一键step测试.mjs'))
  copyFileSync(join(HERE, '..', '_shared', 'session-finder.mjs'), join(partialShared, 'session-finder.mjs'))
  copyFileSync(join(HERE, '..', '_shared', 'test-output.mjs'), join(partialShared, 'test-output.mjs'))
  copyFileSync(join(HERE, '..', '_shared', 'zstd-frames.mjs'), join(partialShared, 'zstd-frames.mjs'))
  const partialTemp = join(partialRunnerRoot, 'temp')
  const partialTmp = join(partialRunnerRoot, 'tmp')
  const partialTmpDir = join(partialRunnerRoot, 'tmpdir')
  const partialCapture = join(partialRunnerRoot, 'capture')
  mkdirSync(partialTemp, { recursive: true })
  mkdirSync(partialTmp, { recursive: true })
  mkdirSync(partialTmpDir, { recursive: true })
  mkdirSync(partialCapture, { recursive: true })
  const partialStdoutPath = join(partialCapture, 'stdout.log')
  const partialStderrPath = join(partialCapture, 'stderr.log')
  const partialStdoutFd = openSync(partialStdoutPath, 'w')
  const partialStderrFd = openSync(partialStderrPath, 'w')
  let partialChild
  const partialEnv = { ...process.env, TEMP: partialTemp, TMP: partialTmp, TMPDIR: partialTmpDir }
  delete partialEnv.DSH_HOME
  delete partialEnv.DSH_PROFILE
  delete partialEnv.SESSION_ID
  try {
    partialChild = spawnSync(process.execPath, ['--import', pathToFileURL(HOST_PRELOAD).href, join(partialTools, '一键step测试.mjs')], {
      cwd: partialRunnerRoot,
      env: partialEnv,
      stdio: ['ignore', partialStdoutFd, partialStderrFd],
    })
  } finally {
    closeSync(partialStdoutFd)
    closeSync(partialStderrFd)
  }
  const partialStdout = readFileSync(partialStdoutPath, 'utf8')
  const partialStderr = readFileSync(partialStderrPath, 'utf8')
  const partialOutput = partialStdout + partialStderr
  const partialScript = join(partialTools, '一键step测试.mjs')
  const partialPreload = pathToFileURL(HOST_PRELOAD).href
  const partialArgv = [process.execPath, '--import', partialPreload, partialScript]
  const partialError = partialChild?.error === undefined || partialChild?.error === null
    ? null
    : {
        name: partialChild.error.name ?? null,
        code: partialChild.error.code ?? null,
        message: partialChild.error.message ?? String(partialChild.error),
        stack: partialChild.error.stack ?? null,
      }
  const partialRaw = writeRawEvidence({ directory: v4EvidenceRoot, baseName: 'partial-runner', stdout: partialStdout, stderr: partialStderr })
  checkRawEvidence('G5 partial-runner raw', partialRaw, partialStdout, partialStderr)
  const partialEvidence = {
    node: process.execPath,
    preload: partialPreload,
    preloadPath: HOST_PRELOAD,
    script: partialScript,
    args: [],
    scriptArgv: [partialScript],
    argv: partialArgv,
    cwd: partialRunnerRoot,
    DSH_INSTALL_ROOT: partialEnv.DSH_INSTALL_ROOT ?? null,
    status: partialChild?.status ?? null,
    signal: partialChild?.signal ?? null,
    error: partialError,
    raw: { ...partialRaw, combined: { bytes: partialRaw.bytes, lines: partialRaw.lines, sha256: partialRaw.sha256 } },
  }
  v4EvidenceRecords.push(partialEvidence)
  writeFileSync(v4EvidenceIndexPath, JSON.stringify(v4EvidenceRecords, null, 2) + '\n')
  console.log('V4_CHILD_EVIDENCE ' + JSON.stringify(partialEvidence))
  const partialReportsDir = join(partialPeTest, 'reports')
  const partialReports = existsSync(partialReportsDir) ? readdirSync(partialReportsDir).filter((name) => name.endsWith('.md')).sort() : []
  const partialMainReport = partialReports.find((name) => readFileSync(join(partialReportsDir, name), 'utf8').includes('## 一、自动判定项'))
  const partialReportText = partialMainReport === undefined ? partialOutput : readFileSync(join(partialReportsDir, partialMainReport), 'utf8')
  const partialAutoStart = partialReportText.indexOf('## 一、自动判定项')
  const partialAutoEnd = partialReportText.indexOf('## 二、人眼项', partialAutoStart)
  const partialAutoSection = partialAutoStart >= 0 && partialAutoEnd > partialAutoStart ? partialReportText.slice(partialAutoStart, partialAutoEnd) : ''
  const partialAutoRows = partialAutoSection.split(/\r?\n/).filter((line) => /^\| [^|]+\.mjs \|/.test(line))
  const partialAutoFiles = partialAutoRows.map((line) => line.split('|')[1].trim())
  const partialThree = ['step-06-08-v4取证回归.mjs', 'step-01-预设完整性.mjs', 'step-01-设置页配置.mjs']
  check('G5 partial-runner 子进程退出0', partialChild?.status === 0, 'status=' + String(partialChild?.status) + '; output=' + partialOutput.slice(0, 1200))
  check('G5 partial-runner 无plugins', !existsSync(join(partialRunnerRoot, 'plugins')), 'plugins=' + String(existsSync(join(partialRunnerRoot, 'plugins'))))
  check('G5 partial-runner AUTO报告表非空、无重复且每行标记未执行', partialAutoFiles.length > 0 && new Set(partialAutoFiles).size === partialAutoFiles.length && partialAutoRows.every((line) => line.includes('| 未执行 |')), 'rows=' + String(partialAutoRows.length) + '；files=' + partialAutoFiles.join(',') + '；reports=' + partialReports.join(',') + '；output=' + partialOutput.slice(0, 1200) + '；' + partialAutoRows.join(' || '))
  check('G5 partial-runner 三项仓库依赖未进入spawn', partialThree.every((file) => partialAutoRows.some((line) => line.includes('| ' + file + ' | 未执行 |') && line.includes('需完整目录'))), partialAutoRows.join(' || '))

  const oldCases = [
    ['v3', 'v3-workspace', 'v3-main', 'session.v3.jsonl.zstd'],
    ['旧命名', 'legacy-workspace', 'legacy-main', 'session.jsonl.zstd'],
  ]
  for (const [label, workspaceName, dirName, fileName] of oldCases) {
    const oldDir = join(sessionsRoot, workspaceName, dirName)
    writeSession(oldDir, fileName, [session(dirName)])
    const oldSelectionArgs = idSessionArgs(dirName, join(sessionsRoot, workspaceName))
    const old06 = runScript(STEP06, oldSelectionArgs)
    const old07 = runScript(STEP07, oldSelectionArgs, { PLANNER_PROMPT_SUFFIX: 'fixture-suffix' })
    for (const [toolName, outcome] of [['step-06', old06], ['step-07', old07]]) {
      check(toolName + ' 拒绝' + label + '日志并返回非零', outcome.status !== 0 && outcome.output.includes('仅支持 v4 会话日志'))
    }
  }
} catch (error) {
  const executedBeforeAbort = pass + fail + fidelity
  fail += 1
  incompleteAssertions = Math.max(0, declaredAssertionSites() - executedBeforeAbort)
  output.error('FAIL  fixture harness exception：' + (error instanceof Error ? error.message : String(error)))
  output.error('INCOMPLETE  夹具异常中断，S04-S07 断言区间未执行完毕：最后执行到「' + lastAssertionLabel + '」，已执行断言 ' + String(executedBeforeAbort) + ' 条（含保真），源码调用点 ' + String(declaredAssertionSites()) + ' 条，未执行上界 ' + String(incompleteAssertions) + ' 条')
} finally {
  try {
    writeFileSync(v4EvidenceIndexPath, JSON.stringify(v4EvidenceRecords, null, 2) + '\n')
  } finally {
    v4Fixture.cleanup()
    cleaned = !existsSync(v4Fixture.root) && !existsSync(v4Fixture.capture) && !existsSync(v4Fixture.temp) && !existsSync(fixtureHome)
  }
}
check('fixture finally 清理整个fixture根及capture/temp兄弟目录', cleaned)
// 保真断言口径与 checkFidelity 实现一致：成功只计入 fidelity 独立赛道、不计入通过数 pass；失败已计入 fail。
output.emit('保真断言（独立赛道 fidelity：如实呈现即计入此数，不计入通过 pass；失败另计 fail）：' + String(fidelity))
output.summary(pass, fail, incompleteAssertions > 0 ? { incomplete: incompleteAssertions } : {})
process.exitCode = fail === 0 ? 0 : 1
