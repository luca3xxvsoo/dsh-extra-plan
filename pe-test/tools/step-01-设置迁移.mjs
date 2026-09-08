// 设置选择性迁移共享层与生产状态机回归矩阵。
// 所有 DSH_HOME、旧版 YAML 与发布目录都在系统临时目录。

import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, rmSync, renameSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { syncPreset, contentHash, publishStage } from '../../plugins/dsh-extra-plan/lib/preset-sync.js'
import { contentHash as sharedHash, readManifest, writeManifest } from '../_shared/preset-hash.mjs'
import {
  SETTING_DEFINITIONS,
  TOOL_PRESENTATION_MODES,
  captureSettings,
  getSettingDefinition,
  parsePresetYaml,
  patchYamlScalar,
  publicSettingMetadata,
  resolveSetting,
  serializeScalar,
} from '../../plugins/dsh-extra-plan/lib/preset-settings.js'

const HERE = fileURLToPath(new URL('.', import.meta.url))
const ASSET_DIR = join(HERE, '..', '..', 'plugins', 'dsh-extra-plan', 'assets', 'presets', 'extra-plan')
const assetAgent = readFileSync(join(ASSET_DIR, 'agent.cordis.yml'), 'utf8')
const assetPreset = readFileSync(join(ASSET_DIR, 'preset.yml'), 'utf8')
const definition = (key) => getSettingDefinition(key)
const keys = SETTING_DEFINITIONS.map((item) => item.key)
const expectedKeys = ['plannerModel', 'plannerPromptSuffix', 'exploreBudget', 'anchoredBootstrap', 'runcodeCatchGate', 'flashGuideEnabled', 'webFetch', 'toolPresentationMode']

let pass = 0
let fail = 0
function check(label, condition) {
  if (condition) { pass += 1; console.log('PASS  ' + label) }
  else { fail += 1; console.log('FAIL  ' + label) }
}

function patchAgent(values) {
  let text = assetAgent
  for (const [key, value] of Object.entries(values)) {
    const patched = patchYamlScalar(text, definition(key), value)
    if (!patched.ok) throw new Error('fixture patch failed: ' + key)
    text = patched.text
  }
  return text
}

function minimalYaml(overrides = {}, nested = false) {
  const value = (key, fallback) => Object.prototype.hasOwnProperty.call(overrides, key) ? overrides[key] : fallback
  const extra = [
    '          config:',
    '            plannerModel: ' + value('plannerModel', 'old-model'),
    '            plannerPromptSuffix: ' + value('plannerPromptSuffix', 'old-suffix'),
    '            exploreBudget: ' + value('exploreBudget', '8'),
    '            anchoredBootstrap: ' + value('anchoredBootstrap', 'true'),
    '            runcodeCatchGate: ' + value('runcodeCatchGate', 'false'),
    '            flashGuideEnabled: ' + value('flashGuideEnabled', 'true'),
  ]
  if (nested) {
    return [
      '- id: wrapper-web',
      '  config:',
      '    - id: tool-web',
      '      config:',
      '        fetch: ' + value('webFetch', 'true'),
      '- id: wrapper-extra',
      '  config:',
      '    - id: deep-extra',
      '      config:',
      '        - id: extra-plan',
      ...extra,
      '- id: tool-presentation',
      '  config:',
      '    mode: ' + value('toolPresentationMode', 'ptc'),
    ].join('\n') + '\n'
  }
  return [
    '- id: extra-plan-group',
    '  config:',
    '    - id: extra-plan',
    '      config:',
    '        plannerModel: ' + value('plannerModel', 'old-model'),
    '        plannerPromptSuffix: ' + value('plannerPromptSuffix', 'old-suffix'),
    '        exploreBudget: ' + value('exploreBudget', '8'),
    '        anchoredBootstrap: ' + value('anchoredBootstrap', 'true'),
    '        runcodeCatchGate: ' + value('runcodeCatchGate', 'false'),
    '        flashGuideEnabled: ' + value('flashGuideEnabled', 'true'),
    '- id: tool-web',
    '  config:',
    '    fetch: ' + value('webFetch', 'true'),
    '- id: tool-presentation',
    '  config:',
    '    mode: ' + value('toolPresentationMode', 'ptc'),
  ].join('\n') + '\n'
}

function manifestAt(dist) {
  return JSON.parse(readFileSync(join(dist, 'dist-manifest.json'), 'utf8'))
}

check('白名单恰有 8 个稳定键', keys.length === 8 && keys.join('|') === expectedKeys.join('|'))
check('locator 恰为稳定插件 id + config 路径', SETTING_DEFINITIONS.every((item) => item.path === 'config.' + (item.key === 'webFetch' ? 'fetch' : item.key === 'toolPresentationMode' ? 'mode' : item.key)))
check('禁止项不在白名单且描述不可变', !keys.some((key) => ['approvalEnabled', 'bootstrapPersona', 'bootstrapShellTools', 'bootstrapCommonTools', 'planTool', 'savePlanDir', 'usageLedger', 'searchTimeoutMs'].includes(key)) && Object.isFrozen(SETTING_DEFINITIONS) && SETTING_DEFINITIONS.every((item) => Object.isFrozen(item)))
check('validator 类型严格且 mode 三项来自描述表', definition('plannerModel').validator('  x  ') && !definition('plannerModel').validator('') && definition('exploreBudget').validator(1) && !definition('exploreBudget').validator('1') && TOOL_PRESENTATION_MODES.join('/') === definition('toolPresentationMode').ui.options.join('/'))
check('公开 metadata 含 8 项、额度 min=1、控件与 locale', (() => {
  const metadata = publicSettingMetadata(assetAgent, assetAgent)
  const budget = metadata.fields.find((field) => field.key === 'exploreBudget')
  const mode = metadata.fields.find((field) => field.key === 'toolPresentationMode')
  return metadata.fields.length === 8 && budget.min === 1 && budget.control === 'number' && mode.options.join('/') === 'native/ptc/both' && typeof mode.locale === 'string'
})())

const allOldValues = {
  plannerModel: 'legacy-model',
  plannerPromptSuffix: 'legacy: suffix',
  exploreBudget: 23,
  anchoredBootstrap: false,
  runcodeCatchGate: true,
  flashGuideEnabled: true,
  webFetch: true,
  toolPresentationMode: 'ptc',
}
const oldAll = patchAgent(allOldValues)
const captured = captureSettings(oldAll)
check('8 个有效旧值全部捕获', Object.keys(captured.values).length === 8 && Object.values(captured.states).every((state) => state === 'captured'))

const stringSafety = ['true', '123', 'line one\nline two']
check('字符串 true/数字样字符串/换行保持 string 类型', stringSafety.every((value) => {
  const patched = patchYamlScalar(assetAgent, definition('plannerModel'), value)
  if (!patched.ok) return false
  const result = resolveSetting(parsePresetYaml(patched.text), definition('plannerModel'), { aliases: false })
  return result.kind === 'ok' && result.value === value
}))
check('!!js 两行原文与无关字节保持', (() => {
  const patched = patchYamlScalar(assetAgent, definition('plannerModel'), 'format-safe')
  return patched.ok && patched.text.includes("disabled: !!js process.platform === 'win32'") && patched.text.includes("path: !!js dshHomePath('usage-ledger', 'ledger.jsonl')")
})())
check('目标行尾注释保留且未知字段不越 sibling', (() => {
  const source = '- id: tool-web # row comment\n  config:\n    fetch: false # keep comment\n    keep: unchanged\n- id: other\n  config:\n    fetch: true\n'
  const patched = patchYamlScalar(source, definition('webFetch'), true)
  return patched.ok && patched.text.includes('- id: tool-web # row comment') && patched.text.includes('fetch: true # keep comment') && patched.text.includes('keep: unchanged') && patched.text.includes('fetch: true\n')
})())

const nested = minimalYaml({}, true)
const nestedParsed = parsePresetYaml(nested)
check('重排/更深嵌套 row 可递归定位', SETTING_DEFINITIONS.every((item) => resolveSetting(nestedParsed, item, { aliases: false }).kind === 'ok'))
const nestedMode = patchYamlScalar(nested, definition('toolPresentationMode'), 'both')
check('更深嵌套 scalar 定点替换', nestedMode.ok && resolveSetting(parsePresetYaml(nestedMode.text), definition('toolPresentationMode'), { aliases: false }).value === 'both')

const aliasBase = definition('plannerModel')
const aliasDefinition = {
  ...aliasBase,
  locator: { pluginId: 'renamed-extra', path: 'config.plannerModel' },
  locatorAliases: [{ pluginId: 'legacy-extra', path: 'settings.model' }],
}
const aliasDoc = parsePresetYaml('- id: legacy-extra\n  settings:\n    model: legacy-alias\n')
check('显式 locator alias 才能恢复移动字段', resolveSetting(aliasDoc, aliasDefinition).kind === 'ok' && resolveSetting(aliasDoc, aliasDefinition).value === 'legacy-alias')
const duplicate = minimalYaml({ plannerModel: 'one' }) + minimalYaml({ plannerModel: 'two' })
const duplicateState = captureSettings(duplicate)
const duplicatePatch = patchYamlScalar(duplicate, definition('plannerModel'), 'never-guess')
check('重复 locator 标记歧义且禁止替换', duplicateState.states.plannerModel === 'ambiguous' && duplicatePatch.ok === false && duplicatePatch.reason === 'ambiguous')

const invalidCases = [
  ['plannerModel 空白', 'plannerModel', '"   "'],
  ['plannerModel number', 'plannerModel', '123'],
  ['plannerModel null', 'plannerModel', 'null'],
  ['plannerPromptSuffix number', 'plannerPromptSuffix', '123'],
  ['plannerPromptSuffix null', 'plannerPromptSuffix', 'null'],
  ['exploreBudget quoted number', 'exploreBudget', '"18"'],
  ['exploreBudget zero', 'exploreBudget', '0'],
  ['exploreBudget negative', 'exploreBudget', '-1'],
  ['exploreBudget decimal', 'exploreBudget', '1.5'],
  ['exploreBudget null', 'exploreBudget', 'null'],
  ['anchoredBootstrap string', 'anchoredBootstrap', "'true'"],
  ['anchoredBootstrap number', 'anchoredBootstrap', '1'],
  ['anchoredBootstrap null', 'anchoredBootstrap', 'null'],
  ['runcodeCatchGate string', 'runcodeCatchGate', "'false'"],
  ['flashGuideEnabled number', 'flashGuideEnabled', '1'],
  ['webFetch string', 'webFetch', "'true'"],
  ['toolPresentationMode code', 'toolPresentationMode', 'code'],
  ['toolPresentationMode bogus', 'toolPresentationMode', 'bogus'],
  ['toolPresentationMode boolean', 'toolPresentationMode', 'true'],
]
for (const [label, key, raw] of invalidCases) {
  const state = captureSettings(minimalYaml({ [key]: raw })).states[key]
  check('非法值 ' + label + ' → invalid', state === 'invalid')
}

const work = mkdtempSync(join(tmpdir(), 'dsh-settings-migration-matrix-'))
const validHome = join(work, 'valid-home')
const validDist = join(validHome, '.agent-presets', 'extra-plan')
const missingHome = join(work, 'missing-home')
const missingDist = join(missingHome, '.agent-presets', 'extra-plan')
const invalidHome = join(work, 'invalid-home')
const invalidDist = join(invalidHome, '.agent-presets', 'extra-plan')
const unreadableHome = join(work, 'unreadable-home')
const unreadableDist = join(unreadableHome, '.agent-presets', 'extra-plan')
try {
  for (const dir of [validDist, missingDist, invalidDist, unreadableDist]) mkdirSync(dir, { recursive: true })
  for (const dir of [validDist, missingDist, invalidDist, unreadableDist]) writeFileSync(join(dir, 'preset.yml'), assetPreset, 'utf8')

  writeFileSync(join(validDist, 'agent.cordis.yml'), oldAll, 'utf8')
  writeManifest(validDist, 'OLD-VALID-MATRIX')
  check('生产 syncPreset 有效旧值 → upgraded', syncPreset(validHome) === 'upgraded')
  const validManifest = manifestAt(validDist)
  check('有效迁移 8 项 restored 且 distHash 为厂商 hash', validManifest.format === 2 && validManifest.distHash === contentHash(ASSET_DIR) && validManifest.settingsMigration.source === 'captured' && Object.values(validManifest.settingsMigration.results).every((result) => result === 'restored'))
  check('有效迁移后的两份核心结构以新版为底、preset 完整', readFileSync(join(validDist, 'preset.yml'), 'utf8') === assetPreset && readFileSync(join(validDist, 'agent.cordis.yml'), 'utf8') === oldAll)

  const oldMissingText = assetAgent.replace('        runcodeCatchGate: false\n', '') + '\n- id: old-custom\n  config:\n    persona: old-only\n'
  writeFileSync(join(missingDist, 'agent.cordis.yml'), oldMissingText, 'utf8')
  writeManifest(missingDist, 'OLD-MISSING-MATRIX')
  check('旧版缺字段 → upgraded 且新版默认保留', syncPreset(missingHome) === 'upgraded')
  const missingManifest = manifestAt(missingDist)
  check('仅新版字段 runcodeCatchGate 保持 false 并审计 skipped-old-missing', readFileSync(join(missingDist, 'agent.cordis.yml'), 'utf8').includes('        runcodeCatchGate: false') && missingManifest.settingsMigration.results.runcodeCatchGate === 'skipped-old-missing')
  check('旧版独有 row/group/persona 不残留', !readFileSync(join(missingDist, 'agent.cordis.yml'), 'utf8').includes('old-custom') && !readFileSync(join(missingDist, 'agent.cordis.yml'), 'utf8').includes('old-only'))

  const invalidText = assetAgent.replace('        plannerModel: deepseek-v4-pro', '        plannerModel: 123').replace('        exploreBudget: 18', '        exploreBudget: 0')
  writeFileSync(join(invalidDist, 'agent.cordis.yml'), invalidText, 'utf8')
  writeManifest(invalidDist, 'OLD-INVALID-MATRIX')
  check('非法旧值 → upgraded 不阻断', syncPreset(invalidHome) === 'upgraded')
  const invalidManifest = manifestAt(invalidDist)
  check('非法旧值使用新版实际默认并写 skipped-invalid', readFileSync(join(invalidDist, 'agent.cordis.yml'), 'utf8').includes('        plannerModel: deepseek-v4-pro') && readFileSync(join(invalidDist, 'agent.cordis.yml'), 'utf8').includes('        exploreBudget: 18') && invalidManifest.settingsMigration.results.plannerModel === 'skipped-invalid' && invalidManifest.settingsMigration.results.exploreBudget === 'skipped-invalid')

  writeFileSync(join(unreadableDist, 'agent.cordis.yml'), '- id: [not valid\n', 'utf8')
  writeManifest(unreadableDist, 'OLD-UNREADABLE-MATRIX')
  check('旧 YAML 不可读 → upgraded 默认发布', syncPreset(unreadableHome) === 'upgraded')
  const unreadableManifest = manifestAt(unreadableDist)
  check('不可读 source=unreadable 且不伪称 restored/不泄露旧值', unreadableManifest.settingsMigration.source === 'unreadable' && Object.values(unreadableManifest.settingsMigration.results).every((result) => result === 'skipped-source-unreadable') && !JSON.stringify(unreadableManifest).includes('not valid'))

  const beforeIdle = [readFileSync(join(validDist, 'preset.yml')), readFileSync(join(validDist, 'agent.cordis.yml')), readFileSync(join(validDist, 'dist-manifest.json'))]
  check('同版本第二次 → idle', syncPreset(validHome) === 'idle')
  const afterIdle = [readFileSync(join(validDist, 'preset.yml')), readFileSync(join(validDist, 'agent.cordis.yml')), readFileSync(join(validDist, 'dist-manifest.json'))]
  check('idle 字节完全不变且共享 hash/readManifest 复用生产', beforeIdle.every((value, index) => value.equals(afterIdle[index])) && sharedHash(ASSET_DIR) === contentHash(ASSET_DIR) && readManifest(validDist) === contentHash(ASSET_DIR))

  const rollbackTarget = join(work, 'rollback', 'target')
  const rollbackTmp = join(work, 'rollback', 'tmp')
  mkdirSync(rollbackTarget, { recursive: true })
  mkdirSync(rollbackTmp, { recursive: true })
  const oldManifest = '{"format":2,"distHash":"OLD-ROLLBACK"}\n'
  writeFileSync(join(rollbackTarget, 'dist-manifest.json'), oldManifest, 'utf8')
  writeFileSync(join(rollbackTarget, 'agent.cordis.yml'), 'old-agent', 'utf8')
  writeFileSync(join(rollbackTmp, 'agent.cordis.yml'), 'new-agent', 'utf8')
  let renameCalls = 0
  const failingOps = {
    exists: existsSync,
    remove: rmSync,
    rename(source, target) {
      renameCalls += 1
      if (renameCalls === 2) throw new Error('synthetic switch failure')
      return renameSync(source, target)
    },
  }
  let rollbackFailed = false
  try { publishStage(rollbackTarget, rollbackTmp, failingOps) } catch { rollbackFailed = true }
  check('切换失败抛错并保留旧目录/旧 manifest', rollbackFailed && readFileSync(join(rollbackTarget, 'agent.cordis.yml'), 'utf8') === 'old-agent' && readFileSync(join(rollbackTarget, 'dist-manifest.json'), 'utf8') === oldManifest && !existsSync(rollbackTmp))
} finally {
  rmSync(work, { recursive: true, force: true })
}

console.log('\n通过 ' + pass + ', 失败 ' + fail)
process.exit(fail === 0 ? 0 : 1)
