// step-06-08-v4取证回归.mjs — 隔离 v4 取证脚本回归
// 只在系统临时目录生成 session.v4.jsonl.zstd，不读取生产会话或运行实机人眼项。
import { spawnSync } from 'node:child_process'
import { closeSync, existsSync, mkdirSync, mkdtempSync, openSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { zstdCompressSync, zstdDecompressSync } from 'node:zlib'
import { decodeText, framesOf } from '../_shared/zstd-frames.mjs'
import { createOutput, sha256Text, writeRawEvidence } from '../_shared/test-output.mjs'

const HERE = dirname(fileURLToPath(import.meta.url))
const ROOT = join(HERE, '..', '..')
const STEP04 = join(HERE, 'step-04-工具清单查看.mjs')
const STEP05 = join(HERE, 'step-05-会话解码.mjs')
const STEP06 = join(HERE, 'step-06-真实会话查看.mjs')
const STEP07 = join(HERE, 'step-07-子代理模型与引导取证.mjs')
const STEP08 = join(HERE, 'step-08-方案配对查看.mjs')
const previousDshHome = process.env.DSH_HOME
let pass = 0
let fail = 0
const output = createOutput({ argv: process.argv.slice(2) })

function check(label, condition, detail = '') {
  if (condition) {
    pass += 1
    output.assertion(true, label, true, true)
  } else {
    fail += 1
    output.assertion(false, label, true, detail === '' ? false : detail)
  }
}

const session = (id, fields = {}) => ({ type: 'session', data: { id, ...fields } })
const descriptor = () => ({ type: 'subagent/descriptor', data: { mode: 'continuable' } })
const call = (name, callId, argumentsValue = {}) => ({ type: 'tool/call', data: { name, callId, arguments: JSON.stringify(argumentsValue) } })
const result = (callId, isError, text) => ({ type: 'tool/result', data: { message: { toolCallId: callId, isError, content: [{ type: 'text', text }] } } })

function writeSession(directory, fileName, events) {
  mkdirSync(directory, { recursive: true })
  const jsonl = events.map((event) => JSON.stringify(event)).join('\n') + '\n'
  writeFileSync(join(directory, fileName), zstdCompressSync(Buffer.from(jsonl, 'utf8')))
}

function replayJsonl(file) {
  const compressed = readFileSync(file)
  const frames = framesOf(compressed)
  let text = ''
  for (const frame of frames) text += decodeText(compressed, frame)
  const rows = text.split(/\r?\n/).filter((row) => row.trim() !== '')
  let invalid = 0
  for (const row of rows) {
    try { JSON.parse(row) } catch { invalid += 1 }
  }
  return { frameCount: frames.length, rowCount: rows.length, invalid }
}

function syntheticFrame(blocks, contentSize) {
  const header = Buffer.from([0x28, 0xb5, 0x2f, 0xfd, 0x20, contentSize])
  const parts = [header]
  for (const block of blocks) {
    const blockHeader = Buffer.alloc(3)
    const value = (block.size << 3) | (block.type << 1) | (block.last ? 1 : 0)
    blockHeader.writeUIntLE(value, 0, 3)
    parts.push(blockHeader, block.payload)
  }
  return Buffer.concat(parts)
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

function runScript(script, args, extraEnv = {}) {
  const captureDir = mkdtempSync(join(tmpdir(), 'dsh-v4-capture-'))
  const stdoutPath = join(captureDir, 'stdout.log')
  const stderrPath = join(captureDir, 'stderr.log')
  const stdoutFd = openSync(stdoutPath, 'w')
  const stderrFd = openSync(stderrPath, 'w')
  const env = { ...process.env, ...extraEnv, DSH_HOME: fixtureHome }
  delete env.DSH_EXTRA_PLAN_CONFIG_PATH
  if (!Object.prototype.hasOwnProperty.call(extraEnv, 'SESSION_ID')) delete env.SESSION_ID
  if (!Object.prototype.hasOwnProperty.call(extraEnv, 'PLANNER_PROMPT_SUFFIX')) delete env.PLANNER_PROMPT_SUFFIX
  let child
  try {
    child = spawnSync(process.execPath, [script, ...args], {
      cwd: ROOT,
      env,
      timeout: 120000,
      stdio: ['ignore', stdoutFd, stderrFd],
    })
  } finally {
    closeSync(stdoutFd)
    closeSync(stderrFd)
  }
  const output = readFileSync(stdoutPath, 'utf8') + readFileSync(stderrPath, 'utf8')
  rmSync(captureDir, { recursive: true, force: true })
  return { status: child.status, output, error: child.error, argv: [script, ...args] }
}

function countOf(text, value) {
  return String(text).split(value).length - 1
}

const fixtureHome = mkdtempSync(join(tmpdir(), 'dsh-v4-forensics-home-'))
let cleaned = false
try {
  const sessionsRoot = join(fixtureHome, 'sessions')
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
  writeSession(mainDir, 'session.v4.jsonl.zstd', mainEvents)
  writeSession(childDir, 'session.v4.jsonl.zstd', childEvents)

  for (const file of [join(mainDir, 'session.v4.jsonl.zstd'), join(childDir, 'session.v4.jsonl.zstd')]) {
    const replay = replayJsonl(file)
    check('fixture 解压后 JSONL 全部可解析：' + file.split(/[\\/]/).slice(-2).join('/'), replay.frameCount > 0 && replay.rowCount > 0 && replay.invalid === 0)
  }
  check('fixture DSH_HOME 为临时目录且不等于调用者 DSH_HOME', previousDshHome === undefined || fixtureHome !== previousDshHome)
  check('fixture 不在生产 DSH_HOME 下', previousDshHome === undefined || !fixtureHome.startsWith(previousDshHome))

  const step04 = runScript(STEP04, [v4Workspace])
  const step04Full = runScript(STEP04, [v4Workspace, '--full'])
  check('step-04 compact/full argv按真实合同', JSON.stringify(step04.argv.slice(-1)) === JSON.stringify([v4Workspace]) && JSON.stringify(step04Full.argv.slice(-2)) === JSON.stringify([v4Workspace, '--full']))
  check('step-04 compact/full均成功且full保留header原文', step04.status === 0 && step04Full.status === 0 && step04.output.includes('tools.names=') && step04Full.output.includes('header.tools=') && step04Full.output.length > step04.output.length)

  const step05 = runScript(STEP05, [v4Workspace, '--compact'])
  const step05Full = runScript(STEP05, [v4Workspace, '--output-mode', 'full'])
  check('step-05 compact/full argv过滤模式参数', JSON.stringify(step05.argv.slice(-2)) === JSON.stringify([v4Workspace, '--compact']) && JSON.stringify(step05Full.argv.slice(-3)) === JSON.stringify([v4Workspace, '--output-mode', 'full']))
  check('step-05 compact/full统计一致且full保留data', step05.status === 0 && step05Full.status === 0 && step05.output.includes('事件类型计数：') && step05.output.includes('summary=') && step05Full.output.includes('--- agent-preset 相关事件 ---') && step05Full.output.includes('fixture-plan-data'))

  const step07MissingSession = runScript(STEP07, ['--full'], { PLANNER_PROMPT_SUFFIX: 'fixture-suffix' })
  const step07MissingSuffix = runScript(STEP07, ['--full'], { SESSION_ID: 'main-v4' })
  check('step-07 缺显式SESSION_ID为NOT-RUN输入错误', step07MissingSession.status !== 0 && step07MissingSession.output.includes('必须显式设置 SESSION_ID'))
  check('step-07 缺显式PLANNER_PROMPT_SUFFIX为NOT-RUN输入错误', step07MissingSuffix.status !== 0 && step07MissingSuffix.output.includes('必须显式设置 PLANNER_PROMPT_SUFFIX'))

  const step07 = runScript(STEP07, [], { SESSION_ID: 'main-v4', PLANNER_PROMPT_SUFFIX: 'fixture-suffix' })
  check('step-07 compact argv保持原合同', step07.argv.length === 1)
  check('step-07 v4 fixture 退出码为 0', step07.status === 0, String(step07.status))
  check('step-07 输出父工具关联 subagent_plan complete=yes', step07.output.includes('父工具关联：subagent_plan') && step07.output.includes('complete=yes'))
  check('step-07 输出 role=pro规划', step07.output.includes('role=pro规划') && !step07.output.includes('role-evidence-insufficient'))
  check('step-07 输出 suffix verified-injection', step07.output.includes('suffix判定=verified-injection') && !step07.output.includes('suffix判定=content-only'))
  check('step-07 保留 actual provenance 分栏', step07.output.includes('actual provenance source.kind=model provider=openai-codex model=gpt-5.6-sol'))
  const step07Verbose = runScript(STEP07, ['--verbose'], { SESSION_ID: 'main-v4', PLANNER_PROMPT_SUFFIX: 'fixture-suffix' })
  const step07Full = runScript(STEP07, ['--full'], { SESSION_ID: 'main-v4', PLANNER_PROMPT_SUFFIX: 'fixture-suffix' })
  check('step-07 full argv保留--full', JSON.stringify(step07Full.argv.slice(-1)) === JSON.stringify(['--full']))
  check('step-07 compact/verbose/full 退出码与核心字段一致', step07.status === 0 && step07Verbose.status === 0 && step07Full.status === 0 && step07Verbose.output.includes('suffix判定=verified-injection') && step07Full.output.includes('suffix判定=verified-injection') && step07Full.output.includes('assistant/message event（完整）='))
  check('step-07 compact 不嵌完整事件且显著小于full', !step07.output.includes('assistant/message event（完整）=') && !step07.output.includes('arguments（完整）=') && step07.output.length < step07Full.output.length)
  const step07Raw = writeRawEvidence({ directory: join(fixtureHome, 'evidence'), baseName: 'step07', stdout: step07.output, stderr: '' })
  check('step-07 摘要raw bytes/lines/hash可回看', step07Raw.bytes === Buffer.byteLength(step07.output, 'utf8') && step07Raw.lines === (step07.output === '' ? 0 : step07.output.split(/\r?\n/).length - (step07.output.endsWith('\n') ? 1 : 0)) && step07Raw.sha256 === sha256Text(step07.output))

  const step06 = runScript(STEP06, [v4Workspace])
  check('step-06 v4 fixture 退出码为 0', step06.status === 0, String(step06.status))
  check('step-06 错误文本恰展示一次', countOf(step06.output, 'TOOL-ERROR') === 1 && countOf(step06.output, 'fixture-error-text') === 1)
  check('step-06 成功 result 不产生 TOOL-ERROR', !step06.output.includes('TOOL-ERROR fixture save ok'))

  const step08 = runScript(STEP08, [v4Workspace])
  check('step-08 悬空 call 退出码精确为 1', step08.status === 1, String(step08.status))
  check('step-08 成功与失败 result 均正确配对', step08.output.includes('结果 OK: fixture save ok') && step08.output.includes('结果 ERROR: fixture-error-text') && !step08.output.includes('未找到配对结果'))
  check('step-08 悬空 call 输出 ANSI 红色和纯文本标记', step08.output.includes('\u001b[31m🔴 未配对') && step08.output.includes('🔴 未配对'))

  const pairWorkspace = join(sessionsRoot, 'pair-workspace')
  const pairDir = join(pairWorkspace, 'pair-main-v4')
  writeSession(pairDir, 'session.v4.jsonl.zstd', [
    session('pair-main-v4'),
    call('save_plan', 'pair-ok-1', { plan: 'ok' }),
    result('pair-ok-1', false, 'pair ok'),
    call('save_plan', 'pair-error-1', { plan: 'error' }),
    result('pair-error-1', true, 'pair error'),
  ])
  const pairReplay = replayJsonl(join(pairDir, 'session.v4.jsonl.zstd'))
  check('pair-only fixture 解压 JSONL 可解析', pairReplay.frameCount > 0 && pairReplay.invalid === 0)
  const pairResult = runScript(STEP08, [pairWorkspace])
  check('step-08 全部已配对退出码精确为 0', pairResult.status === 0, String(pairResult.status))
  check('step-08 全部已配对无红色未配对标记', pairResult.output.includes('结果 OK: pair ok') && pairResult.output.includes('结果 ERROR: pair error') && !pairResult.output.includes('未配对'))

  const oldCases = [
    ['v3', 'v3-workspace', 'v3-main', 'session.v3.jsonl.zstd'],
    ['旧命名', 'legacy-workspace', 'legacy-main', 'session.jsonl.zstd'],
  ]
  for (const [label, workspaceName, dirName, fileName] of oldCases) {
    const oldDir = join(sessionsRoot, workspaceName, dirName)
    writeSession(oldDir, fileName, [session(dirName)])
    const old06 = runScript(STEP06, [oldDir])
    const old07 = runScript(STEP07, [], { SESSION_ID: dirName, PLANNER_PROMPT_SUFFIX: 'fixture-suffix' })
    const old08 = runScript(STEP08, [oldDir])
    for (const [toolName, outcome] of [['step-06', old06], ['step-07', old07], ['step-08', old08]]) {
      check(toolName + ' 拒绝' + label + '日志并返回非零', outcome.status !== 0 && outcome.output.includes('仅支持 v4 会话日志'))
    }
  }
} catch (error) {
  fail += 1
  output.error('FAIL  fixture harness exception：' + (error instanceof Error ? error.message : String(error)))
} finally {
  rmSync(fixtureHome, { recursive: true, force: true })
  cleaned = !existsSync(fixtureHome)
}
check('fixture finally 清理系统临时目录', cleaned)
output.summary(pass, fail)
process.exitCode = fail === 0 ? 0 : 1
