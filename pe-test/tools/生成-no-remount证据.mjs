import { spawnSync } from 'node:child_process'
import { createHash, randomBytes } from 'node:crypto'
import { closeSync, existsSync, mkdirSync, openSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs'
import { dirname, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const ROOT = resolve(HERE, '../..')
const CWD = ROOT
const EXTRA_PLAN_DIR = join(ROOT, '.extra-plan')
const OLD_EVIDENCE_DIR = '.extra-plan/证据-同步验收补齐-20261015004343'
const REPORT_PROBE = 'pe-test/reports/_s4b_pwsh.txt'
const TIMEOUT_MS = 120000
const OFFICIAL_RUNTIME_BOUNDARY_PATHS = [
  'C:/Users/Administrator/AppData/Roaming/npm/node_modules/@deepseek-ai/dsh/node_modules/@deepseek-ai/cordis/src/reflect.ts',
  'C:/Users/Administrator/AppData/Roaming/npm/node_modules/@deepseek-ai/dsh/node_modules/@deepseek-ai/cordis/src/registry.ts',
  'C:/Users/Administrator/AppData/Roaming/npm/node_modules/@deepseek-ai/dsh/node_modules/@deepseek-ai/cordis/src/fiber.ts',
  'C:/Users/Administrator/AppData/Roaming/npm/node_modules/@deepseek-ai/dsh/node_modules/@deepseek-ai/dsh-config-editor/lib/index.js',
]
const OFFICIAL_RUNTIME_BOUNDARY_POLICY = {
  scope: 'official-runtime-read-only',
  readOnly: true,
  writeProhibited: true,
  workspaceRollbackTarget: false,
  policy: 'READ-ONLY: hash and metadata observation only; no writes permitted',
}

function pad(value) { return String(value).padStart(2, '0') }
function timestamp() {
  const now = new Date()
  return String(now.getFullYear()) + pad(now.getMonth() + 1) + pad(now.getDate()) + pad(now.getHours()) + pad(now.getMinutes()) + pad(now.getSeconds()) + String(now.getMilliseconds()).padStart(3, '0')
}
function relPath(value) { return relative(ROOT, value).replaceAll('\\', '/') }
function absPath(value) { return resolve(ROOT, value) }
function sha256Bytes(bytes) { return createHash('sha256').update(bytes).digest('hex') }
function sha256File(value) {
  try { return sha256Bytes(readFileSync(value)) } catch { return null }
}
function safeStat(value) {
  try { return statSync(value) } catch { return undefined }
}
function fileRecord(value) {
  const abs = absPath(value)
  const stat = safeStat(abs)
  if (stat === undefined || !stat.isFile()) return { path: value, exists: false, bytes: null, sha256: null }
  return { path: value, exists: true, bytes: stat.size, sha256: sha256File(abs) }
}
function officialRuntimeBoundaryPost(before) {
  const files = before.map((item) => {
    const after = fileRecord(item.path)
    return { path: item.path, before: item, after, allMatch: item.exists === true && after.exists === true && sameRecord(item, after) }
  })
  return { ...OFFICIAL_RUNTIME_BOUNDARY_POLICY, files, allMatch: files.length === OFFICIAL_RUNTIME_BOUNDARY_PATHS.length && files.every((item) => item.allMatch) }
}
function writeJson(name, value) { writeFileSync(join(EVIDENCE_DIR, name), JSON.stringify(value, null, 2) + '\n', 'utf8') }
function readJson(value) {
  try { return JSON.parse(readFileSync(absPath(value), 'utf8')) } catch { return undefined }
}
function collectFiles(value) {
  const root = absPath(value)
  if (!existsSync(root)) return []
  const output = []
  const visit = (directory) => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const child = join(directory, entry.name)
      if (entry.isDirectory()) visit(child)
      else if (entry.isFile()) output.push(relPath(child))
    }
  }
  visit(root)
  return output.sort()
}

function listExtraPlanDirectories(prefix) {
  if (!existsSync(EXTRA_PLAN_DIR)) return []
  return readdirSync(EXTRA_PLAN_DIR, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && entry.name.startsWith(prefix))
    .map((entry) => '.extra-plan/' + entry.name)
    .sort()
}
function listExternalBatchDirectories(roots) {
  const output = []
  for (const root of unique(roots)) {
    const absolute = absPath(root)
    if (!existsSync(absolute)) continue
    for (const entry of readdirSync(absolute, { withFileTypes: true })) {
      if (entry.isDirectory() && /^(host-regression-|batch-)/.test(entry.name)) output.push(root + '/' + entry.name)
    }
  }
  return output.sort()
}
function normalizeWorkspacePath(value) {
  const raw = String(value || '').trim()
  if (raw === '') return null
  const candidate = relPath(resolve(ROOT, raw))
  if (candidate === '' || candidate === '.' || candidate === '..' || candidate.startsWith('../') || /^[A-Za-z]:/.test(candidate)) return null
  return candidate
}
function isWithinPath(candidate, parent) {
  const child = relative(absPath(parent), absPath(candidate)).replaceAll('\\', '/')
  return child === '' || (child !== '..' && !child.startsWith('../') && !/^[A-Za-z]:/.test(child))
}
function pathsOverlap(left, right) { return isWithinPath(left, right) || isWithinPath(right, left) }
function directoryArtifact(path, classification) {
  return { path, classification, exists: existsSync(absPath(path)), files: collectFiles(path).map(fileRecord) }
}
function parseBatchDirectoriesFromFiles(paths) {
  const output = []
  for (const path of unique(paths)) {
    let text
    try { text = readFileSync(absPath(path), 'utf8') } catch { continue }
    for (const line of text.split(/\r?\n/)) {
      const match = line.match(/^BATCH_DIR=(.+)$/)
      if (!match) continue
      const normalized = normalizeWorkspacePath(match[1])
      if (normalized) output.push(normalized)
    }
  }
  return unique(output)
}
function batchDirectoriesFromTrees(paths) {
  const files = unique(paths.flatMap((path) => collectFiles(path).filter((item) => item.endsWith('.stdout.log'))))
  return parseBatchDirectoriesFromFiles(files)
}
function unique(values) { return [...new Set(values)] }
function emptyLog(name) { writeFileSync(join(EVIDENCE_DIR, name), '', 'utf8') }
function logText(record) {
  const stdout = readFileSync(join(EVIDENCE_DIR, record.stdoutFile), 'utf8')
  const stderr = readFileSync(join(EVIDENCE_DIR, record.stderrFile), 'utf8')
  return stdout + stderr
}
function markerCounts(text, markers) {
  return Object.fromEntries(markers.map((marker) => [marker, text.split(marker).length - 1]))
}
function structuredSkips(text) {
  const values = []
  for (const line of text.split(/\r?\n/)) {
    if (!line.startsWith('SKIP  ')) continue
    try { values.push(JSON.parse(line.slice('SKIP  '.length))) } catch { values.push({ raw: line }) }
  }
  return values
}
function humanFindings(record, text) {
  const findings = []
  for (const line of text.split(/\r?\n/)) {
    if (!line.startsWith('HUMAN  ')) continue
    const raw = line.slice('HUMAN  '.length)
    try { findings.push({ record: record.id, ...JSON.parse(raw) }) } catch { findings.push({ record: record.id, raw }) }
  }
  return findings
}
function blockingLines(text) {
  return text.split(/\r?\n/).filter((line) => {
    const trimmed = line.trim()
    if (trimmed.startsWith('PASS  ') || trimmed.includes('[检查模式] 地图与代码一致，无漏检、无导航失效')) return false
    return /\bFAIL\b|SyntaxError|UnhandledPromiseRejection|Error:|地图与代码不一致|疑似漏检|导航失效/i.test(line)
  }).slice(0, 20)
}
function classify(record, spec) {
  const text = logText(record)
  const missing = []
  const counts = markerCounts(text, spec.requiredMarkers || [])
  for (const marker of spec.requiredMarkers || []) if (counts[marker] !== 1) missing.push(marker)
  record.markerCounts = counts
  record.missingMarkers = missing
  record.structuredSkips = structuredSkips(text)
  record.humanFindings = humanFindings(record, text)
  const hostVersionSkips = record.structuredSkips.filter((item) => item !== null && typeof item === 'object' && item.scope === 'HOST-VERSION')
  if (hostVersionSkips.length > 0) {
    record.humanFindings.push(...hostVersionSkips.map((item) => ({ record: record.id, scope: 'HOST-VERSION', reason: item.reason || '真实宿主版本未执行', state: 'HUMAN' })))
    record.structuredSkips = record.structuredSkips.filter((item) => !(item !== null && typeof item === 'object' && item.scope === 'HOST-VERSION'))
  }
  record.blockingLines = blockingLines(text)
  if (record.notStarted === true || record.spawnError !== null || record.timedOut === true || record.exitCode === null || !existsSync(join(EVIDENCE_DIR, record.stdoutFile)) || !existsSync(join(EVIDENCE_DIR, record.stderrFile))) return 'NOT-RUN'
  if (record.exitCode !== 0 || record.blockingLines.length > 0 || missing.length > 0) return 'FAIL'
  if (record.id === '14-one-key-step' && /部分执行/i.test(text)) {
    record.humanFindings.push({ record: record.id, scope: 'ONE-KEY-SUMMARY', reason: '一键汇总含环境 junction 部分执行；不替代必需原始命令', state: 'HUMAN' })
    return 'HUMAN'
  }
  if (/INCOMPLETE(?!\s*0\b)|部分执行/i.test(text)) return 'INCOMPLETE'
  if (record.structuredSkips.length > 0) return 'SKIP'
  return 'PASS'
}
function commandFiles(id) { return { stdoutFile: id + '.stdout.log', stderrFile: id + '.stderr.log', metaFile: id + '.meta.json' } }
function notStarted(spec, phase, sequence, reason) {
  const files = commandFiles(spec.id)
  emptyLog(files.stdoutFile)
  emptyLog(files.stderrFile)
  const emptyStdoutHash = sha256File(join(EVIDENCE_DIR, files.stdoutFile))
  const emptyStderrHash = sha256File(join(EVIDENCE_DIR, files.stderrFile))
  const record = {
    id: spec.id,
    phase,
    sequence,
    command: spec.command,
    cwd: CWD,
    ...files,
    startTime: null,
    endTime: null,
    exitCode: null,
    timeout: false,
    timedOut: false,
    signal: null,
    spawnError: null,
    notStarted: true,
    notRunReason: reason,
    stdoutSha256: emptyStdoutHash,
    stderrSha256: emptyStderrHash,
    stdoutBytes: 0,
    stderrBytes: 0,
  }
  record.status = 'NOT-RUN'
  writeJson(files.metaFile, record)
  return record
}
function runCommand(spec, phase, sequence) {
  const files = commandFiles(spec.id)
  const stdoutPath = join(EVIDENCE_DIR, files.stdoutFile)
  const stderrPath = join(EVIDENCE_DIR, files.stderrFile)
  const stdoutFd = openSync(stdoutPath, 'w')
  const stderrFd = openSync(stderrPath, 'w')
  const startTime = new Date().toISOString()
  let result
  try {
    result = spawnSync(process.execPath, spec.argv, {
      cwd: CWD,
      timeout: TIMEOUT_MS,
      windowsHide: true,
      stdio: ['ignore', stdoutFd, stderrFd],
    })
  } finally {
    closeSync(stdoutFd)
    closeSync(stderrFd)
  }
  const endTime = new Date().toISOString()
  const errorCode = result && result.error && result.error.code ? String(result.error.code) : null
  const record = {
    id: spec.id,
    phase,
    sequence,
    command: spec.command,
    cwd: CWD,
    ...files,
    startTime,
    endTime,
    exitCode: result && typeof result.status === 'number' ? result.status : null,
    timeout: errorCode === 'ETIMEDOUT',
    timedOut: errorCode === 'ETIMEDOUT',
    signal: result && result.signal ? String(result.signal) : null,
    spawnError: errorCode,
    notStarted: false,
    stdoutSha256: sha256File(stdoutPath),
    stderrSha256: sha256File(stderrPath),
    stdoutBytes: safeStat(stdoutPath)?.size || 0,
    stderrBytes: safeStat(stderrPath)?.size || 0,
  }
  record.status = classify(record, spec)
  writeJson(files.metaFile, record)
  return record
}
function sameRecord(left, right) {
  return left.exists === right.exists && left.bytes === right.bytes && left.sha256 === right.sha256
}
function boundaryPost(baseline, officialRuntimeBoundary) {
  const changed = []
  const missing = []
  const added = []
  const allowedAdded = []
  const baselineExternalPaths = new Set((baseline.externalArtifacts || []).map((item) => item.path))
  const currentContextGateDirectories = listExtraPlanDirectories('context-gate-')
  const currentExternalBatchDirectories = unique([
    ...batchDirectoriesFromTrees(['.extra-plan/' + evidenceName]),
    ...listExternalBatchDirectories(currentContextGateDirectories),
  ])
  const allowedExternalBatchDirectories = currentExternalBatchDirectories.filter((path) => !baselineExternalPaths.has(path))
  const isAllowedGeneratedPath = (path) => allowedExternalBatchDirectories.some((base) => isWithinPath(path, base))
  for (const before of baseline.files) {
    const after = fileRecord(before.path)
    if (!sameRecord(before, after)) {
      if (before.exists && !after.exists) missing.push(before.path)
      else changed.push({ before, after })
    }
  }
  for (const directory of baseline.directories) {
    const before = new Set(directory.files)
    const after = new Set(collectFiles(directory.path))
    for (const path of before) if (!after.has(path)) missing.push(path)
    for (const path of after) {
      if (before.has(path)) continue
      if (directory.kind === 'context-gate-root' && isAllowedGeneratedPath(path)) allowedAdded.push(path)
      else added.push(path)
    }
  }
  const baselineContextGateDirectories = new Set(baseline.contextGateDirectories || [])
  for (const path of currentContextGateDirectories) {
    if (baselineContextGateDirectories.has(path)) continue
    if (!allowedExternalBatchDirectories.some((batch) => pathsOverlap(path, batch))) added.push(path)
    for (const file of collectFiles(path)) {
      if (isAllowedGeneratedPath(file)) allowedAdded.push(file)
      else added.push(file)
    }
  }
  const allowedExternalArtifacts = allowedExternalBatchDirectories.map((path) => ({
    ...directoryArtifact(path, 'allowed-generated-external-batch'),
    state: 'allowed-generated-during-run',
  }))
  const externalArtifactMissing = allowedExternalArtifacts.filter((item) => !item.exists).map((item) => item.path)
  for (const item of allowedExternalArtifacts) for (const file of item.files) allowedAdded.push(file.path)
  const protectedExternalArtifacts = (baseline.externalArtifacts || []).map((item) => ({
    ...item,
    state: 'protected-old-content',
    after: directoryArtifact(item.path, item.classification),
  }))
  const baselineExternalMissing = (baseline.externalArtifacts || []).filter((item) => !item.exists).map((item) => item.path)
  const allMatch = baseline.requiredDirectories.every((path) => existsSync(absPath(path))) && changed.length === 0 && missing.length === 0 && added.length === 0 && externalArtifactMissing.length === 0 && baselineExternalMissing.length === 0 && officialRuntimeBoundary?.allMatch === true
  return {
    runId,
    officialRuntimeBoundary,
    checkedAt: new Date().toISOString(),
    allMatch,
    changed,
    missing: unique(missing),
    added: unique(added),
    unexpectedAdded: unique(added),
    allowedAdded: unique(allowedAdded),
    filesChecked: baseline.files.length,
    directoriesChecked: baseline.directories.map((item) => item.path),
    protectedEvidenceDirectories: baseline.protectedEvidenceDirectories || [],
    contextGateDirectories: currentContextGateDirectories,
    externalArtifacts: [...protectedExternalArtifacts, ...allowedExternalArtifacts],
    allowedGeneratedArtifacts: allowedExternalArtifacts,
    allowedGeneratedScope: evidenceName,
    currentExternalBatchDirectories,
    externalArtifactMissing,
    baselineExternalMissing,
  }
}
function verifyBackupManifest(sourcePaths, backupFiles, backupManifest, backupDirectory) {
  const editableRoles = new Set(['editable-test-source', 'evidence-source', 'editable-runtime-source', 'editable-doc-source'])
  const expected = sourcePaths.filter((item) => editableRoles.has(item.role))
  const entries = Array.isArray(backupManifest?.sources) ? backupManifest.sources : []
  const checks = expected.map((item) => {
    const entry = entries.find((candidate) => candidate.source === item.path || candidate.sourceRelative === item.path || normalizeWorkspacePath(candidate.sourceRelative || candidate.source) === item.path)
    const actual = backupFiles.find((candidate) => candidate.source === item.path)
    const sourceExists = entry?.sourceExistedBeforeBackup ?? entry?.existsBeforeBackup
    const backupExists = entry?.backupExists
    const rollback = entry?.rollback || {}
    const metadataMatch = (entry?.source === item.path || entry?.sourceRelative === item.path || normalizeWorkspacePath(entry?.sourceRelative || entry?.source) === item.path) && sourceExists === true && typeof entry?.bytes === 'number' && typeof entry?.sha256 === 'string' && backupExists === true && typeof entry?.backupBytes === 'number' && typeof entry?.backupSha256 === 'string'
    const pathMatch = metadataMatch && normalizeWorkspacePath(entry.backup) === normalizeWorkspacePath(actual?.path)
    const bytesShaMatch = metadataMatch && actual?.exists === true && actual.bytes === entry.backupBytes && String(actual.sha256 || '').toLowerCase() === String(entry.backupSha256 || '').toLowerCase()
    const rollbackMatch = typeof rollback.action === 'string' && rollback.action.length > 0 && (rollback.restoreTarget === item.path || normalizeWorkspacePath(rollback.restoreTarget) === item.path) && rollback.sourceExistedBeforeBackup === sourceExists
    return {
      source: item.path,
      manifestBackupPath: entry?.backup || null,
      actualBackupPath: actual?.path || null,
      sourceBeforeBackup: { exists: sourceExists ?? null, bytes: entry?.bytes ?? null, sha256: entry?.sha256 ?? null },
      backup: { exists: backupExists ?? null, bytes: entry?.backupBytes ?? null, sha256: entry?.backupSha256 ?? null },
      rollback,
      pathMatch,
      bytesShaMatch,
      rollbackMatch,
      allMatch: metadataMatch && pathMatch && bytesShaMatch && rollbackMatch,
    }
  })
  return {
    allMatch: backupDirectory !== null && entries.length === expected.length && checks.length === expected.length && checks.every((item) => item.allMatch),
    expectedSourceCount: expected.length,
    manifestSourceCount: entries.length,
    sources: checks,
  }
}
function sourcePost(sourceManifest) {
  const workspaceSourceChecks = sourceManifest.files.map((before) => {
    const after = fileRecord(before.path)
    return { path: before.path, before, after, allMatch: sameRecord(before, after) }
  })
  const changed = workspaceSourceChecks.filter((item) => !item.allMatch).map(({ before, after }) => ({ before, after }))
  const backupChanged = []
  for (const before of sourceManifest.backupFiles) {
    const after = fileRecord(before.path)
    if (!sameRecord(before, after)) backupChanged.push({ before, after })
  }
  const backupVerification = sourceManifest.backupVerification || { allMatch: false }
  const officialRuntimeBoundary = sourceManifest.officialRuntimeBoundary || { ...OFFICIAL_RUNTIME_BOUNDARY_POLICY, files: [], allMatch: false }
  return { runId, checkedAt: new Date().toISOString(), allMatch: workspaceSourceChecks.every((item) => item.allMatch) && backupChanged.length === 0 && sourceManifest.backupUnique === true && backupVerification.allMatch === true && officialRuntimeBoundary.allMatch === true, changed, workspaceSourceChecks, backupChanged, backupUnique: sourceManifest.backupUnique, backupVerification, officialRuntimeBoundary }
}
function evidenceHashCheck(records) {
  const checks = []
  for (const record of records) {
    const stdoutPath = join(EVIDENCE_DIR, record.stdoutFile)
    const stderrPath = join(EVIDENCE_DIR, record.stderrFile)
    const stdoutHash = sha256File(stdoutPath)
    const stderrHash = sha256File(stderrPath)
    const stdoutMatch = record.stdoutSha256 === stdoutHash && existsSync(stdoutPath)
    const stderrMatch = record.stderrSha256 === stderrHash && existsSync(stderrPath)
    checks.push({ id: record.id, stdoutFile: record.stdoutFile, stderrFile: record.stderrFile, stdoutMatch, stderrMatch, allMatch: stdoutMatch && stderrMatch })
  }
  return { runId, checkedAt: new Date().toISOString(), allMatch: checks.every((item) => item.allMatch), checks }
}
function statusCounts(records) {
  return Object.fromEntries(['PASS', 'FAIL', 'SKIP', 'INCOMPLETE', 'NOT-RUN', 'HUMAN'].map((status) => [status, records.filter((item) => item.status === status).length]))
}
function commandSummary(record) {
  return { id: record.id, phase: record.phase, sequence: record.sequence, command: record.command, cwd: record.cwd, status: record.status, exitCode: record.exitCode, timeout: record.timedOut, notRunReason: record.notRunReason || null, evidenceFiles: [record.stdoutFile, record.stderrFile, record.metaFile], missingMarkers: record.missingMarkers || [], markerCounts: record.markerCounts || {} }
}

const runId = timestamp() + '-' + process.pid + '-' + randomBytes(4).toString('hex')
const evidenceName = '证据-no-remount-' + runId
const EVIDENCE_DIR = join(EXTRA_PLAN_DIR, evidenceName)
if (existsSync(EVIDENCE_DIR)) throw new Error('evidence directory collision: ' + EVIDENCE_DIR)
const officialRuntimeBoundaryBefore = OFFICIAL_RUNTIME_BOUNDARY_PATHS.map(fileRecord)
const protectedEvidenceDirectories = unique([OLD_EVIDENCE_DIR, ...listExtraPlanDirectories('证据-no-remount-')])
const contextGateDirectoriesBefore = listExtraPlanDirectories('context-gate-')
const baselineScanDirectories = unique([...protectedEvidenceDirectories, ...contextGateDirectoriesBefore])
const externalBatchDirectoriesBefore = unique([
  ...batchDirectoriesFromTrees(baselineScanDirectories),
  ...listExternalBatchDirectories(contextGateDirectoriesBefore),
])
mkdirSync(EVIDENCE_DIR, { recursive: true })

const backupNames = existsSync(EXTRA_PLAN_DIR)
  ? readdirSync(EXTRA_PLAN_DIR, { withFileTypes: true }).filter((entry) => entry.isDirectory() && (entry.name.startsWith('backup-no-remount-evidence-') || entry.name.startsWith('BACKUP-唯一settings-'))).map((entry) => entry.name).sort()
  : []
const backupCandidates = backupNames.filter((name) => {
  const manifest = readJson('.extra-plan/' + name + '/BACKUP-MANIFEST.json')
  const sources = Array.isArray(manifest?.sources) ? manifest.sources : []
  return manifest?.backupUnique === true && sources.length === 8 && sources.every((item) => (typeof item?.source === 'string' || typeof item?.sourceRelative === 'string') && typeof item?.sha256 === 'string' && typeof item?.bytes === 'number')
})
const backupDirectory = backupCandidates.length === 0 ? null : '.extra-plan/' + backupCandidates[backupCandidates.length - 1]
const backupManifest = backupDirectory === null ? undefined : readJson(backupDirectory + '/BACKUP-MANIFEST.json')
const sourcePaths = [
  { path: 'pe-test/tools/step-01-安装同步.mjs', role: 'editable-test-source' },
  { path: 'pe-test/tools/step-01-设置页配置.mjs', role: 'editable-test-source' },
  { path: 'pe-test/tools/生成-no-remount证据.mjs', role: 'evidence-source' },
  { path: 'plugins/dsh-extra-plan/lib/settings.js', role: 'editable-runtime-source' },
  { path: 'plugins/dsh-extra-plan/lib/preset-yaml.js', role: 'editable-runtime-source' },
  { path: 'plugins/dsh-extra-plan/lib/qqbot-settings-sync.js', role: 'editable-runtime-source' },
  { path: 'pe-test/docs/ai-宿主耦合台账.md', role: 'editable-doc-source' },
  { path: 'pe-test/docs/ai-维护手册.md', role: 'editable-doc-source' },
  { path: 'plugins/dsh-extra-plan/lib/preset-sync.js', role: 'runtime-read-only' },
  { path: 'plugins/dsh-extra-plan/index.js', role: 'runtime-read-only' },
  { path: 'plugins/dsh-extra-plan/lib/live-config.js', role: 'runtime-read-only' },
  { path: 'plugins/dsh-extra-plan/package.json', role: 'package-read-only' },
  { path: 'plugins/dsh-extra-plan-qqbot/package.json', role: 'package-read-only' },
  { path: 'plugins/dsh-extra-plan/assets/presets/extra-plan/preset-definition.generated.yml', role: 'generated-read-only' },
  { path: 'plugins/dsh-extra-plan/lib/preset-defaults.generated.js', role: 'generated-read-only' },
  { path: 'pe-test/tools/step-01-qqbot-安装映射.mjs', role: 'test-read-only' },
  { path: 'pe-test/tools/一键step测试.mjs', role: 'runner-read-only' },
]
const sourceFiles = sourcePaths.map((item) => ({ ...item, ...fileRecord(item.path) }))
const backupFiles = []
for (const item of sourceFiles) {
  if (backupDirectory === null) continue
  const backupPath = backupDirectory + '/' + item.path
  const backup = fileRecord(backupPath)
  backupFiles.push({ source: item.path, ...backup })
}
const backupVerification = verifyBackupManifest(sourcePaths, backupFiles, backupManifest, backupDirectory)
const sourceManifest = {
  runId,
  createdAt: new Date().toISOString(),
  cwd: CWD,
  backupDirectory,
  backupDirectories: backupNames,
  backupUnique: backupCandidates.length === 1 && backupManifest !== undefined,
  backupManifestPath: backupDirectory === null ? null : backupDirectory + '/BACKUP-MANIFEST.json',
  backupVerification,
  rollbackPlan: backupManifest?.rollbackPlan || null,
  preExistingGitStatus: backupManifest?.gitStatusObserved || [],
  files: sourceFiles,
  backupFiles,
  officialRuntimeBoundary: { ...OFFICIAL_RUNTIME_BOUNDARY_POLICY, before: officialRuntimeBoundaryBefore },
}
writeJson('SOURCE-MANIFEST.json', sourceManifest)

const externalArtifactPathsBefore = unique([...contextGateDirectoriesBefore, ...externalBatchDirectoriesBefore])
const externalArtifactsBefore = externalArtifactPathsBefore.map((path) => directoryArtifact(path, contextGateDirectoriesBefore.includes(path) ? 'context-gate-root' : 'context-gate-batch'))
const boundaryFiles = unique([
  'plugins/dsh-extra-plan/index.js',
  'plugins/dsh-extra-plan/lib/preset-sync.js',
  'plugins/dsh-extra-plan/lib/settings.js',
  'plugins/dsh-extra-plan/lib/preset-yaml.js',
  'plugins/dsh-extra-plan/lib/qqbot-settings-sync.js',
  'plugins/dsh-extra-plan/lib/live-config.js',
  'plugins/dsh-extra-plan/package.json',
  'plugins/dsh-extra-plan-qqbot/package.json',
  'plugins/dsh-extra-plan-qqbot/cordis.patch.yml',
  'pe-test/tools/一键step测试.mjs',
  'plugins/dsh-extra-plan/assets/presets/extra-plan/preset-definition.generated.yml',
  'plugins/dsh-extra-plan/lib/preset-defaults.generated.js',
  REPORT_PROBE,
  ...collectFiles('plugins/dsh-extra-plan-qqbot'),
  ...collectFiles('pe-test/docs'),
  ...protectedEvidenceDirectories.flatMap((path) => collectFiles(path)),
  ...contextGateDirectoriesBefore.flatMap((path) => collectFiles(path)),
])
const boundaryDirectories = [
  ...protectedEvidenceDirectories.map((path) => ({ path, kind: 'protected-evidence', exists: existsSync(absPath(path)), files: collectFiles(path) })),
  ...contextGateDirectoriesBefore.map((path) => ({ path, kind: 'context-gate-root', exists: existsSync(absPath(path)), files: collectFiles(path) })),
  { path: 'pe-test/docs', kind: 'protected-docs', exists: existsSync(absPath('pe-test/docs')), files: collectFiles('pe-test/docs') },
  { path: 'plugins/dsh-extra-plan-qqbot', kind: 'protected-qqbot-tree', exists: existsSync(absPath('plugins/dsh-extra-plan-qqbot')), files: collectFiles('plugins/dsh-extra-plan-qqbot') },
]
const boundaryBaseline = {
  runId,
  createdAt: new Date().toISOString(),
  cwd: CWD,
  requiredDirectories: unique([...protectedEvidenceDirectories, ...contextGateDirectoriesBefore]),
  protectedEvidenceDirectories,
  contextGateDirectories: contextGateDirectoriesBefore,
  externalArtifacts: externalArtifactsBefore,
  files: boundaryFiles.map(fileRecord),
  directories: boundaryDirectories,
  reportProbe: fileRecord(REPORT_PROBE),
  officialRuntimeBoundary: { ...OFFICIAL_RUNTIME_BOUNDARY_POLICY, before: officialRuntimeBoundaryBefore },
}
writeJson('BOUNDARY-BASELINE.json', boundaryBaseline)
const protectedCodeMapPath = 'pe-test/docs/ai-代码地图.md'
const protectedCodeMapBytes = existsSync(absPath(protectedCodeMapPath)) ? readFileSync(absPath(protectedCodeMapPath)) : undefined

const jsonCheckCode = "const fs=require('node:fs');for(const p of ['plugins/dsh-extra-plan/package.json','plugins/dsh-extra-plan-qqbot/package.json'])JSON.parse(fs.readFileSync(p,'utf8'));console.log('JSON_OK 2')"
const noHomeCode = "const s=require('node:fs').readFileSync('plugins/dsh-extra-plan/lib/qqbot-settings-sync.js','utf8');if(/from\\s+['\"]node:os['\"]|homedir\\s*\\(|['\"]\\.dsh['\"]/.test(s))process.exit(1);console.log('NO_HOME_GUESS_OK')"
const coreCode = "const s=require('node:fs').readFileSync('plugins/dsh-extra-plan/lib/preset-sync.js','utf8');if(/qqbot|code-runtime|healQqbotCompatibility|healPatchRows|profiles[\\\\/]/i.test(s))process.exit(1);console.log('CORE_ZERO_AWARENESS_OK')"
const presetCountCode = "const m=await import('./plugins/dsh-extra-plan/lib/preset-settings.js');const a=m.EXTRA_PLAN_SETTING_DEFINITIONS.map(x=>x.key);const b=m.HOST_ROW_SETTING_DEFINITIONS.map(x=>x.key);if(a.length!==8||b.length!==2)process.exit(1);console.log('HOT=8 RESTART=2')"
const staticChecks = [
  { id: 'STATIC-01-node-check-sync', command: 'node --check plugins/dsh-extra-plan/lib/qqbot-settings-sync.js', argv: ['--check', 'plugins/dsh-extra-plan/lib/qqbot-settings-sync.js'], requiredMarkers: [] },
  { id: 'STATIC-02-node-check-settings', command: 'node --check plugins/dsh-extra-plan/lib/settings.js', argv: ['--check', 'plugins/dsh-extra-plan/lib/settings.js'], requiredMarkers: [] },
  { id: 'STATIC-03-node-check-preset-yaml', command: 'node --check plugins/dsh-extra-plan/lib/preset-yaml.js', argv: ['--check', 'plugins/dsh-extra-plan/lib/preset-yaml.js'], requiredMarkers: [] },
  { id: 'STATIC-04-node-check-settings-test', command: 'node --check pe-test/tools/step-01-设置页配置.mjs', argv: ['--check', 'pe-test/tools/step-01-设置页配置.mjs'], requiredMarkers: [] },
  { id: 'STATIC-05-node-check-install-sync-test', command: 'node --check pe-test/tools/step-01-安装同步.mjs', argv: ['--check', 'pe-test/tools/step-01-安装同步.mjs'], requiredMarkers: [] },
  { id: 'STATIC-06-node-check-evidence-generator', command: 'node --check pe-test/tools/生成-no-remount证据.mjs', argv: ['--check', 'pe-test/tools/生成-no-remount证据.mjs'], requiredMarkers: [] },
  { id: 'STATIC-07-node-check-qqbot-test', command: 'node --check pe-test/tools/step-01-qqbot-安装映射.mjs', argv: ['--check', 'pe-test/tools/step-01-qqbot-安装映射.mjs'], requiredMarkers: [] },
  { id: 'STATIC-08-json-package-check', command: 'node -e "' + jsonCheckCode + '"', argv: ['-e', jsonCheckCode], requiredMarkers: ['JSON_OK 2'] },
  { id: 'STATIC-09-no-home-guess', command: 'node -e "' + noHomeCode + '"', argv: ['-e', noHomeCode], requiredMarkers: ['NO_HOME_GUESS_OK'] },
  { id: 'STATIC-10-core-zero-awareness', command: 'node -e "' + coreCode + '"', argv: ['-e', coreCode], requiredMarkers: ['CORE_ZERO_AWARENESS_OK'] },
  { id: 'STATIC-11-preset-counts', command: 'node --input-type=module -e "' + presetCountCode + '"', argv: ['--input-type=module', '-e', presetCountCode], requiredMarkers: ['HOT=8 RESTART=2'] },
]
const fixedCommands = [
  { id: '01-settings-test', command: 'node pe-test/tools/step-01-设置页配置.mjs', argv: ['pe-test/tools/step-01-设置页配置.mjs'], requiredMarkers: ['API_ADAPTER_THROW_COMPLETE_PATCH_SETTLED_BEFORE_FAILURE_OK', 'API_ADAPTER_REJECT_COMPLETE_PATCH_SETTLED_BEFORE_FAILURE_OK', 'API_ADAPTER_HANG_COMPLETE_PATCH_SETTLED_BEFORE_RESOLVE_OK', 'SETTINGS_ONLY_HTTP_SAVE_ADAPTER_REGISTER_0_DISPOSE_0', 'HOST_PROXY_MATRIX_COMPLETE_OK', 'HOST_PROXY_NORMAL_SETTLED_CTX_GET_OK', 'HOST_PROXY_NEGATIVE_BOUNDARIES_EXPLICIT_OK', 'SETTINGS_ROW_UNIQUE_OR_CONFLICT_EXPLICIT_OK', 'SAVE_RUN_ID_TERMINAL_HASH_MATCH_OK', 'PATCH_MTIME_MANAGED_HASH_COMPARE_OK', 'FULL_SNAPSHOT_10_PLUS_7_EACH_TRIGGER_OK', 'CREATIVE_PERSISTED_BEFORE_RESTART_OK', 'HOT=8 RESTART=2'] },
  { id: '02-install-sync-test', command: 'node pe-test/tools/step-01-安装同步.mjs', argv: ['pe-test/tools/step-01-安装同步.mjs'], requiredMarkers: ['SETTINGS_ONLY_NO_REMOUNT_STATIC_OK', 'SETTINGS_ONLY_ADAPTER_REGISTER_0_DISPOSE_0_OK', 'FIXTURE_ADAPTER_THROW_COMPLETE_PATCH_SETTLED_BEFORE_FAILURE_OK', 'FIXTURE_ADAPTER_REJECT_COMPLETE_PATCH_SETTLED_BEFORE_FAILURE_OK', 'FIXTURE_ADAPTER_HANG_COMPLETE_PATCH_SETTLED_BEFORE_RESOLVE_OK'] },
  { id: '03-qqbot-mapping-test', command: 'node pe-test/tools/step-01-qqbot-安装映射.mjs', argv: ['pe-test/tools/step-01-qqbot-安装映射.mjs'], requiredMarkers: [] },
  { id: '04-preset-completeness', command: 'node pe-test/tools/step-01-预设完整性.mjs', argv: ['pe-test/tools/step-01-预设完整性.mjs'], requiredMarkers: [], required: false },
  { id: '05-full-flow', command: 'node pe-test/tools/step-00-全流程回归.mjs', argv: ['pe-test/tools/step-00-全流程回归.mjs'], requiredMarkers: [] },
  { id: '06-cross-platform-write', command: 'node pe-test/tools/step-00-跨平台写拦截.mjs', argv: ['pe-test/tools/step-00-跨平台写拦截.mjs'], requiredMarkers: [] },
  { id: '07-route-write-gate', command: 'node pe-test/tools/step-04-路由与写闸门.mjs', argv: ['pe-test/tools/step-04-路由与写闸门.mjs'], requiredMarkers: [] },
  { id: '08-context-gate', command: 'node pe-test/tools/step-04-context-gate宿主回归.mjs', argv: ['pe-test/tools/step-04-context-gate宿主回归.mjs'], requiredMarkers: [], required: false },
  { id: '09-step-06-08', command: 'node pe-test/tools/step-06-08-v4取证回归.mjs', argv: ['pe-test/tools/step-06-08-v4取证回归.mjs'], requiredMarkers: [] },
  { id: '10-step-06-clues', command: 'node pe-test/tools/step-06-线索落盘.mjs', argv: ['pe-test/tools/step-06-线索落盘.mjs'], requiredMarkers: [] },
  { id: '11-runtime-defaults-check', command: 'node plugins/dsh-extra-plan/scripts/generate-runtime-defaults.mjs --check', argv: ['plugins/dsh-extra-plan/scripts/generate-runtime-defaults.mjs', '--check'], requiredMarkers: [] },
  { id: '12-code-map-generate', command: 'node pe-test/tools/代码地图生成.mjs', argv: ['pe-test/tools/代码地图生成.mjs'], requiredMarkers: [] },
  { id: '13-code-map-check', command: 'node pe-test/tools/代码地图生成.mjs --check', argv: ['pe-test/tools/代码地图生成.mjs', '--check'], requiredMarkers: [] },
  { id: '14-one-key-step', command: 'node pe-test/tools/一键step测试.mjs', argv: ['pe-test/tools/一键step测试.mjs'], requiredMarkers: [], required: false },
]
const allRecords = []
let preflightBlocked = false
for (let index = 0; index < staticChecks.length; index += 1) {
  const spec = staticChecks[index]
  const record = preflightBlocked ? notStarted(spec, 'precheck', index + 1, 'preflight-short-circuit') : runCommand(spec, 'precheck', index + 1)
  allRecords.push(record)
  if (record.status !== 'PASS') preflightBlocked = true
}
const precheckReport = {
  runId,
  createdAt: new Date().toISOString(),
  cwd: CWD,
  preflightPassed: !preflightBlocked,
  staticChecks: staticChecks.map((spec, index) => commandSummary(allRecords[index])),
  laterCommands: fixedCommands.map((spec, index) => ({ sequence: index + 1, id: spec.id, command: spec.command, status: preflightBlocked ? 'NOT-RUN' : 'PENDING', reason: preflightBlocked ? 'preflight-short-circuit' : null })),
}
writeJson('REPORT-PRECHECK.json', precheckReport)
for (let index = 0; index < fixedCommands.length; index += 1) {
  const spec = fixedCommands[index]
  const record = preflightBlocked ? notStarted(spec, 'regression', index + 1, 'preflight-short-circuit') : runCommand(spec, 'regression', index + 1)
  allRecords.push(record)
}
if (protectedCodeMapBytes !== undefined) writeFileSync(absPath(protectedCodeMapPath), protectedCodeMapBytes)

const officialRuntimeBoundary = officialRuntimeBoundaryPost(officialRuntimeBoundaryBefore)
sourceManifest.officialRuntimeBoundary = officialRuntimeBoundary
writeJson('SOURCE-MANIFEST.json', sourceManifest)
const postSource = sourcePost(sourceManifest)
const postBoundary = boundaryPost(boundaryBaseline, officialRuntimeBoundary)
writeJson('BOUNDARY-POST.json', postBoundary)
const hashCheck = evidenceHashCheck(allRecords)
writeJson('EVIDENCE-HASH-CHECK.json', hashCheck)
const counts = statusCounts(allRecords)
const sourceOrBoundaryFailure = !postSource.allMatch || !postBoundary.allMatch || !hashCheck.allMatch
const autoPass = !preflightBlocked && counts.FAIL === 0 && counts.SKIP === 0 && counts.INCOMPLETE === 0 && counts['NOT-RUN'] === 0 && sourceOrBoundaryFailure === false && fixedCommands.filter((spec) => spec.required !== false).every((spec) => { const index = fixedCommands.indexOf(spec); return allRecords[staticChecks.length + index].status === 'PASS' })
const allHumanFindings = [
  ...allRecords.flatMap((record) => record.humanFindings || []),
  { scope: 'REAL-PROFILE', reason: '真实 profile/DSH_HOME 不在本轮自动范围', state: 'HUMAN' },
  { scope: 'PRODUCTION-QQBOT', reason: '生产 QQBot、真实重启与消息链不在本轮自动范围', state: 'HUMAN' },
  { scope: 'OFFICIAL-ADAPTER-GRAPH', reason: '官方 adapter 完整部署图需部署后复测', state: 'HUMAN' },
  { scope: 'REAL-WEB-GUI-HOST', reason: '真实 Web/GUI/宿主版本需人工复测', state: 'HUMAN' },
]
const notRunFindings = allRecords.filter((record) => record.status === 'NOT-RUN').map((record) => ({ id: record.id, phase: record.phase, reason: record.notRunReason || 'not-run' }))
const categorized = {}
for (const status of ['PASS', 'FAIL', 'SKIP', 'INCOMPLETE', 'NOT-RUN']) categorized[status] = allRecords.filter((record) => record.status === status).map(commandSummary)
const summaryLines = [
  '# no-remount 自动证据摘要',
  '',
  '- runId: ' + runId,
  '- evidenceDirectory: ' + evidenceName,
  '- cwd: ' + CWD,
  '- AUTO_REGRESSION_PASS=' + (autoPass ? 'YES' : 'NO'),
  '- SOURCE_BOUNDARY_HASH_MATCH=' + (sourceOrBoundaryFailure ? 'NO' : 'YES'),
  '- OFFICIAL_RUNTIME_BOUNDARY_HASH_PASS=' + (officialRuntimeBoundary.allMatch ? 'YES' : 'NO'),
  '- OFFICIAL_RUNTIME_BOUNDARY_READ_ONLY=YES (no production behavior claim)',
  '- EVIDENCE_LOG_HASH_MATCH=' + (hashCheck.allMatch ? 'YES' : 'NO'),
  '- BACKUP_SOURCES_MATCH=' + (sourceManifest.backupVerification.allMatch ? 'YES' : 'NO'),
  '- PROTECTED_OLD_BATCHES=' + boundaryBaseline.protectedEvidenceDirectories.length,
  '- EXTERNAL_ARTIFACTS_PROTECTED=' + boundaryBaseline.externalArtifacts.length,
  '- ALLOWED_EXTERNAL_BATCHES=' + postBoundary.allowedGeneratedArtifacts.length,
  '',
]
for (const status of ['PASS', 'FAIL', 'SKIP', 'INCOMPLETE', 'NOT-RUN']) {
  summaryLines.push('## ' + status + ' (' + categorized[status].length + ')')
  if (categorized[status].length === 0) summaryLines.push('- none')
  else for (const item of categorized[status]) summaryLines.push('- ' + item.id + ': ' + item.command + (item.notRunReason ? ' [' + item.notRunReason + ']' : ''))
  summaryLines.push('')
}
summaryLines.push('## HUMAN (' + allHumanFindings.length + ')')
for (const item of allHumanFindings) summaryLines.push('- ' + JSON.stringify(item))
summaryLines.push('')
summaryLines.push('## NOT-RUN reasons')
if (notRunFindings.length === 0) summaryLines.push('- none')
else for (const item of notRunFindings) summaryLines.push('- ' + JSON.stringify(item))
summaryLines.push('')
summaryLines.push('## Boundary')
summaryLines.push('- oldEvidenceUnchanged: ' + (postBoundary.allMatch ? 'YES' : 'NO'))
summaryLines.push('- backupUnique: ' + (sourceManifest.backupUnique ? 'YES' : 'NO'))
summaryLines.push('- preflightPassed: ' + (precheckReport.preflightPassed ? 'YES' : 'NO'))
writeFileSync(join(EVIDENCE_DIR, 'SUMMARY.md'), summaryLines.join('\n') + '\n', 'utf8')

const runManifest = {
  runId,
  cwd: CWD,
  evidenceDirectory: evidenceName,
  staticChecks: staticChecks.map((spec, index) => commandSummary(allRecords[index])),
  commands: fixedCommands.map((spec, index) => commandSummary(allRecords[staticChecks.length + index])),
  sourceManifest: 'SOURCE-MANIFEST.json',
  workspaceSourceChecks: postSource.workspaceSourceChecks,
  officialRuntimeBoundary,
  boundaryBaseline: 'BOUNDARY-BASELINE.json',
  boundaryPost: 'BOUNDARY-POST.json',
  reportPrecheck: 'REPORT-PRECHECK.json',
  reportPostcheck: 'REPORT-POSTCHECK.json',
  summary: 'SUMMARY.md',
  evidenceHashCheck: 'EVIDENCE-HASH-CHECK.json',
  backupDirectoryCount: backupNames.length,
  backupVerification: sourceManifest.backupVerification,
  rollbackPlan: sourceManifest.rollbackPlan,
  reportExistsAfter: fileRecord(REPORT_PROBE).exists,
  statusCounts: counts,
  human: allHumanFindings,
  notRun: notRunFindings,
}
writeJson('RUN-MANIFEST.json', runManifest)
const postReport = {
  runId,
  createdAt: new Date().toISOString(),
  cwd: CWD,
  preflight: precheckReport,
  records: allRecords.map(commandSummary),
  statusCounts: counts,
  sourcePost: postSource,
  workspaceSourceChecks: postSource.workspaceSourceChecks,
  officialRuntimeBoundary,
  backupVerification: sourceManifest.backupVerification,
  rollbackPlan: sourceManifest.rollbackPlan,
  boundaryPost: postBoundary,
  evidenceHashCheck: hashCheck,
  autoRegressionPass: autoPass,
  human: allHumanFindings,
  notRun: notRunFindings,
}
writeJson('REPORT-POSTCHECK.json', postReport)

console.log('NO_REMOUNT_EVIDENCE_RUN_ID=' + runId)
console.log('NO_REMOUNT_EVIDENCE_DIR=' + evidenceName)
console.log('NO_REMOUNT_STATUS_COUNTS=' + JSON.stringify(counts))
console.log('NO_REMOUNT_SOURCE_BOUNDARY_HASH_MATCH=' + (sourceOrBoundaryFailure ? 'NO' : 'YES'))
console.log('NO_REMOUNT_OFFICIAL_RUNTIME_BOUNDARY_HASH_PASS=' + (officialRuntimeBoundary.allMatch ? 'YES' : 'NO'))
console.log('NO_REMOUNT_EVIDENCE_HASH_MATCH=' + (hashCheck.allMatch ? 'YES' : 'NO'))
console.log('AUTO_REGRESSION_PASS=' + (autoPass ? 'YES' : 'NO'))
if (counts.FAIL > 0 || counts['NOT-RUN'] > 0 || sourceOrBoundaryFailure || preflightBlocked) process.exitCode = 1
