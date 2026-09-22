// Host-side preset distribution and startup self-healing.
// Both postinstall and the startup hook call syncPreset; only the two vendor
// core files are staged, with the registered settings intersection restored.

import { createHash } from 'node:crypto'
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  renameSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  SETTING_DEFINITIONS,
  captureSettings,
  parsePresetYaml,
  patchYamlScalar,
  resolveSetting,
  resolveTemplateSettingDefault,
} from './preset-settings.js'
import {
  GATE_WORD_FIELD_NAMES,
  GATE_WORD_MIGRATION_DEFINITIONS,
  GATE_WORDS_GROUP_DEFINITION,
  validateGateWords,
} from './gate-words.js'

const PRESET_ID = 'extra-plan'
const MANIFEST_NAME = 'dist-manifest.json'
export const CORE_FILES = ['preset.yml', 'agent.cordis.yml']

const HERE = dirname(fileURLToPath(import.meta.url))
export const ASSET_DIR = join(HERE, '..', 'assets', 'presets', PRESET_ID)

/** sha256(preset.yml || agent.cordis.yml)，固定顺序；任一缺失返回 null。 */
export function contentHash(dir) {
  const h = createHash('sha256')
  for (const file of CORE_FILES) {
    const filePath = join(dir, file)
    if (!existsSync(filePath)) return null
    h.update(readFileSync(filePath))
  }
  return h.digest('hex')
}

function readManifestRecord(targetDir) {
  const file = join(targetDir, MANIFEST_NAME)
  if (!existsSync(file)) return null
  try {
    const manifest = JSON.parse(readFileSync(file, 'utf8'))
    if (manifest === null || typeof manifest !== 'object') return null
    if (manifest.format !== 1 && manifest.format !== 2) return null
    return typeof manifest.distHash === 'string' ? manifest : null
  } catch {
    return null
  }
}

/** 读目标目录 manifest 的 distHash；兼容 format 1/2，缺失/损坏返回 null。 */
export function readManifest(targetDir) {
  const manifest = readManifestRecord(targetDir)
  return manifest === null ? null : manifest.distHash
}

function emptyMigration(source, sourceDistHash) {
  const results = {}
  const status = source === 'absent' ? 'skipped-source-absent' : 'skipped-source-unreadable'
  for (const definition of SETTING_DEFINITIONS) results[definition.key] = status
  return {
    format: 1,
    sourceDistHash: sourceDistHash === undefined ? null : sourceDistHash,
    source,
    results,
  }
}

/** gateWords 专用空审计：只记状态，不记用户词值。 */
function emptyGateWordsMigration(source, sourceDistHash) {
  const results = {}
  const status = source === 'absent' ? 'skipped-source-absent' : 'skipped-source-unreadable'
  for (const field of GATE_WORD_FIELD_NAMES) results[field] = status
  return {
    format: 1,
    sourceDistHash: sourceDistHash === undefined ? null : sourceDistHash,
    source,
    results,
  }
}

/** 旧组状态 → 审计状态字符串（整组同一状态，禁止部分迁移）。 */
function gateReasonForState(state) {
  if (state === 'missing') return 'skipped-old-missing'
  if (state === 'ambiguous') return 'skipped-old-ambiguous'
  return 'skipped-invalid'
}

/**
 * 整组判定：稳定 locator（id=extra-plan + config.gateWords）定位 + 共享 validator 全组校验。
 * 返回 { state: 'captured'|'missing'|'ambiguous'|'invalid', values? }；不做部分接受。
 */
function captureGateWords(document) {
  const result = resolveSetting(document, GATE_WORDS_GROUP_DEFINITION, { aliases: false })
  if (result.kind === 'missing') return { state: 'missing' }
  if (result.kind === 'ambiguous') return { state: 'ambiguous' }
  try {
    return { state: 'captured', values: validateGateWords(result.value) }
  } catch {
    return { state: 'invalid' }
  }
}

/** 厂商模板整组校验：缺失/非法一律抛错（坏模板不得进入 hash/idle 或发布流程）。 */
function assertTemplateGateWords(text) {
  const captured = captureGateWords(parsePresetYaml(text))
  if (captured.state !== 'captured') {
    throw new Error('extra-plan: 厂商模板 gateWords ' + captured.state + '（config.gateWords 必须整组合法）')
  }
  return captured.values
}

function capturePrevious(targetDir, sourceDistHash) {
  const sourceFile = join(targetDir, 'agent.cordis.yml')
  if (!existsSync(sourceFile)) {
    return {
      audit: emptyMigration('absent', sourceDistHash),
      values: {},
      states: {},
      gateAudit: emptyGateWordsMigration('absent', sourceDistHash),
      gateValues: null,
      gateState: 'missing',
    }
  }
  let text
  try {
    text = readFileSync(sourceFile, 'utf8')
  } catch {
    return {
      audit: emptyMigration('unreadable', sourceDistHash),
      values: {},
      states: {},
      gateAudit: emptyGateWordsMigration('unreadable', sourceDistHash),
      gateValues: null,
      gateState: 'unreadable',
    }
  }
  try {
    const captured = captureSettings(text)
    // 复用同一份解析文档：settings 与 gateWords 各自独立判定，互不影响。
    const gate = captureGateWords(captured.document)
    const source = {
      format: 1,
      sourceDistHash: sourceDistHash === undefined ? null : sourceDistHash,
      source: 'captured',
      results: {},
    }
    return {
      audit: source,
      values: captured.values,
      states: captured.states,
      gateAudit: {
        format: 1,
        sourceDistHash: sourceDistHash === undefined ? null : sourceDistHash,
        source: 'captured',
        results: {},
      },
      gateValues: gate.state === 'captured' ? gate.values : null,
      gateState: gate.state,
    }
  } catch {
    return {
      audit: emptyMigration('unreadable', sourceDistHash),
      values: {},
      states: {},
      gateAudit: emptyGateWordsMigration('unreadable', sourceDistHash),
      gateValues: null,
      gateState: 'unreadable',
    }
  }
}

function reasonForOldState(state) {
  if (state === 'missing') return 'skipped-old-missing'
  if (state === 'ambiguous') return 'skipped-old-ambiguous'
  if (state === 'invalid') return 'skipped-invalid'
  return 'skipped-old-missing'
}

function reasonForNewState(kind) {
  return kind === 'ambiguous' ? 'skipped-new-ambiguous' : 'skipped-new-missing'
}

function stagePreset(targetDir, distHash, previous) {
  const parent = dirname(targetDir)
  mkdirSync(parent, { recursive: true })
  const tmp = join(parent, '.tmp-' + PRESET_ID + '-' + process.pid + '-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8))
  mkdirSync(tmp, { recursive: true })
  try {
    for (const file of CORE_FILES) copyFileSync(join(ASSET_DIR, file), join(tmp, file))

    // Parse both staged vendor files before any target switch. YAML is parsed
    // with the same !!js-preserving schema used by settings and migration.
    parsePresetYaml(readFileSync(join(tmp, 'preset.yml'), 'utf8'))
    let agentText = readFileSync(join(tmp, 'agent.cordis.yml'), 'utf8')
    let agentDocument = parsePresetYaml(agentText)
    const results = previous.audit.results

    for (const definition of SETTING_DEFINITIONS) {
      const oldState = previous.states[definition.key]
      if (previous.audit.source !== 'captured') {
        // results 与 previous.audit.results 同引用，原自赋值 results[k] = results[k] 无副作用。
        continue
      }
      if (oldState !== 'captured') {
        results[definition.key] = reasonForOldState(oldState)
        continue
      }
      const staged = resolveSetting(agentDocument, definition, { aliases: false })
      if (staged.kind !== 'ok') {
        results[definition.key] = reasonForNewState(staged.kind)
        continue
      }
      const patched = patchYamlScalar(agentText, definition, previous.values[definition.key])
      if (!patched.ok) {
        results[definition.key] = reasonForNewState(patched.reason)
        continue
      }
      agentText = patched.text
      agentDocument = parsePresetYaml(agentText)
      results[definition.key] = 'restored'
    }

    // gateWords 整组迁移（先复制新版模板 → 再整组写回旧值）：只有旧组整体合法才逐叶
    // 定点写回；缺失/非法/定位歧义一律整组采用新模板出厂值（禁止部分迁移）；新模板
    // locator 缺失/歧义、patch 失败或迁移后整组校验失败一律抛错（沿 catch 清理 temp、
    // 保留旧 target，不发布半成品）。
    const gateAudit = previous.gateAudit
    const gateResults = gateAudit.results
    if (gateAudit.source === 'captured') {
      if (previous.gateState !== 'captured') {
        for (const definition of GATE_WORD_MIGRATION_DEFINITIONS) {
          gateResults[definition.key] = gateReasonForState(previous.gateState)
        }
      } else {
        for (const definition of GATE_WORD_MIGRATION_DEFINITIONS) {
          const stagedGate = resolveSetting(agentDocument, definition, { aliases: false })
          if (stagedGate.kind !== 'ok') {
            throw new Error('extra-plan: 新模板 gateWords 定位 ' + stagedGate.kind + '（' + definition.locator.path + '）')
          }
          const patchedGate = patchYamlScalar(agentText, definition, previous.gateValues[definition.key])
          if (!patchedGate.ok) {
            throw new Error('extra-plan: 新模板 gateWords 写回失败（' + definition.locator.path + '：' + patchedGate.reason + '）')
          }
          agentText = patchedGate.text
          agentDocument = parsePresetYaml(agentText)
        }
        const verified = captureGateWords(agentDocument)
        if (verified.state !== 'captured') {
          throw new Error('extra-plan: gateWords 迁移后整组校验失败（' + verified.state + '）')
        }
        for (const field of GATE_WORD_FIELD_NAMES) {
          if (verified.values[field] !== previous.gateValues[field]) {
            throw new Error('extra-plan: gateWords 迁移后取值与用户值不一致（' + field + '）')
          }
        }
        for (const definition of GATE_WORD_MIGRATION_DEFINITIONS) {
          gateResults[definition.key] = 'restored'
        }
      }
    }

    // Reparse after all scalar patches, then write the audit-only manifest.
    parsePresetYaml(agentText)
    writeFileSync(join(tmp, 'agent.cordis.yml'), agentText, 'utf8')
    writeFileSync(join(tmp, MANIFEST_NAME), JSON.stringify({
      format: 2,
      distHash,
      settingsMigration: previous.audit,
      gateWordsMigration: gateAudit,
    }, null, 2) + '\n', 'utf8')
    return { tmp, migration: previous.audit, gateMigration: gateAudit }
  } catch (error) {
    rmSync(tmp, { recursive: true, force: true })
    throw error
  }
}

function cleanupPath(path) {
  try { rmSync(path, { recursive: true, force: true }) } catch { /* best effort during rollback */ }
}

const FILE_OPS = Object.freeze({ exists: existsSync, rename: renameSync, remove: rmSync })

function switchStage(targetDir, tmp, ops = FILE_OPS) {
  const backup = targetDir + '.backup-' + process.pid + '-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8)
  let oldMoved = false
  let newMoved = false
  try {
    if (ops.exists(targetDir)) {
      ops.rename(targetDir, backup)
      oldMoved = true
    }
    ops.rename(tmp, targetDir)
    newMoved = true
    if (oldMoved) ops.remove(backup, { recursive: true, force: true })
  } catch (error) {
    if (newMoved && ops.exists(targetDir)) cleanupPath(targetDir)
    if (oldMoved && ops.exists(backup) && !ops.exists(targetDir)) {
      try { ops.rename(backup, targetDir) } catch { /* preserve the original error */ }
    }
    if (ops.exists(tmp)) cleanupPath(tmp)
    if (ops.exists(backup) && ops.exists(targetDir)) cleanupPath(backup)
    throw error
  }
}

export function publishStage(targetDir, tmp, ops = FILE_OPS) {
  switchStage(targetDir, tmp, ops)
}

/**
 * Legacy cleanup remains part of the successful upgrade state machine only.
 * It never participates in settings capture and never reads profile patch settings.
 */
function cleanupLegacyFlashGuidePatches(dshHome) {
  try {
    const root = join(dshHome, 'profiles')
    if (!existsSync(root)) return
    for (const name of readdirSync(root)) {
      const file = join(root, name, 'cordis.patch.yml')
      if (!existsSync(file)) continue
      const text = readFileSync(file, 'utf8')
      const lines = text.split('\n')
      const out = []
      let skipping = false
      for (const line of lines) {
        if (!skipping && /^-\s*id:\s*flash-guide\s*$/.test(line)) {
          skipping = true
          continue
        }
        if (skipping) {
          if (/^\S/.test(line)) skipping = false
          else continue
        }
        out.push(line)
      }
      const next = out.join('\n')
      if (next !== text) writeFileSync(file, next, 'utf8')
    }
  } catch { /* cleanup must not block startup */ }
}

function noSourcePrevious() {
  return {
    audit: emptyMigration('absent', null),
    values: {},
    states: {},
    gateAudit: emptyGateWordsMigration('absent', null),
    gateValues: null,
    gateState: 'missing',
  }
}

/**
 * 运行一次捕获 → stage → 校验 → 可回滚切换自愈。
 * @returns 'written' | 'upgraded' | 'idle'
 */
export function syncPreset(dshHome) {
  const targetDir = join(dshHome, '.agent-presets', PRESET_ID)
  const templateFile = join(ASSET_DIR, 'agent.cordis.yml')
  if (!existsSync(templateFile)) throw new Error('预设模板缺失：' + templateFile)
  const templateText = readFileSync(templateFile, 'utf8')
  resolveTemplateSettingDefault(templateText, 'exploreBudget')
  // 厂商模板 gateWords 必须在 hash/idle 判定之前整组严格校验：坏模板立即抛错且不触碰目标目录。
  assertTemplateGateWords(templateText)
  const currentHash = contentHash(ASSET_DIR)
  if (currentHash === null) throw new Error('预设资产缺失：' + ASSET_DIR)

  const targetExists = existsSync(targetDir)
  const previousManifest = targetExists ? readManifestRecord(targetDir) : null
  if (targetExists && previousManifest !== null && previousManifest.distHash === currentHash) return 'idle'

  const previous = targetExists
    ? capturePrevious(targetDir, previousManifest === null ? null : previousManifest.distHash)
    : noSourcePrevious()
  const staged = stagePreset(targetDir, currentHash, previous)
  try {
    publishStage(targetDir, staged.tmp)
  } catch (error) {
    if (existsSync(staged.tmp)) cleanupPath(staged.tmp)
    throw error
  }
  if (targetExists) cleanupLegacyFlashGuidePatches(dshHome)
  return targetExists ? 'upgraded' : 'written'
}

export const name = 'extra-plan-preset-sync'
export const inject = []

export function apply() {
  try {
    const home = process.env.DSH_HOME === undefined || process.env.DSH_HOME === ''
      ? join(homedir(), '.dsh')
      : process.env.DSH_HOME
    syncPreset(home)
  } catch {
    // Startup self-healing is deliberately non-blocking.
  }
}
