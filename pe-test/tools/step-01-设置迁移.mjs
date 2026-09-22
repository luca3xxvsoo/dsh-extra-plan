// 设置选择性迁移共享层与生产状态机回归矩阵。
// 所有 DSH_HOME、旧版 YAML 与发布目录都在系统临时目录。

import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, rmSync, renameSync, cpSync, readdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
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
import { DEFAULT_EXPLORE_BUDGET } from '../../plugins/dsh-extra-plan/lib/preset-defaults.generated.js'
import { GATE_WORD_MIGRATION_DEFINITIONS, GATE_WORDS_GROUP_DEFINITION, createGateRuntime } from '../../plugins/dsh-extra-plan/lib/gate-words.js'

const HERE = fileURLToPath(new URL('.', import.meta.url))
const ASSET_DIR = join(HERE, '..', '..', 'plugins', 'dsh-extra-plan', 'assets', 'presets', 'extra-plan')
const assetAgent = readFileSync(join(ASSET_DIR, 'agent.cordis.yml'), 'utf8')
const assetPreset = readFileSync(join(ASSET_DIR, 'preset.yml'), 'utf8')
const definition = (key) => getSettingDefinition(key)
const keys = SETTING_DEFINITIONS.map((item) => item.key)
const expectedKeys = ['anchoredBootstrap', 'creativeMode', 'webFetch', 'toolPresentationMode', 'runcodeCatchGate', 'crossProviderPlannerModel', 'plannerModel', 'plannerPromptSuffix', 'exploreBudget', 'otherAgentModel']

let pass = 0
let fail = 0
function check(label, condition) {
  if (condition) { pass += 1; console.log('PASS  ' + label) }
  else { fail += 1; console.log('FAIL  ' + label) }
}
check('exploreBudget 默认来自生成模块且为 YAML 叶值', DEFAULT_EXPLORE_BUDGET === resolveSetting(parsePresetYaml(assetAgent), definition('exploreBudget'), { aliases: false }).value && DEFAULT_EXPLORE_BUDGET === 18)

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
    '            crossProviderPlannerModel: ' + value('crossProviderPlannerModel', 'false'),
    '            plannerPromptSuffix: ' + value('plannerPromptSuffix', 'old-suffix'),
    '            exploreBudget: ' + value('exploreBudget', '8'),
    '            otherAgentModel: ' + value('otherAgentModel', "''"),
    '            anchoredBootstrap: ' + value('anchoredBootstrap', 'true'),
    '            creativeMode: ' + value('creativeMode', 'false'),
    '            runcodeCatchGate: ' + value('runcodeCatchGate', 'false'),
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
    '        crossProviderPlannerModel: ' + value('crossProviderPlannerModel', 'false'),
    '        plannerPromptSuffix: ' + value('plannerPromptSuffix', 'old-suffix'),
    '        exploreBudget: ' + value('exploreBudget', '8'),
    '        otherAgentModel: ' + value('otherAgentModel', "''"),
    '        anchoredBootstrap: ' + value('anchoredBootstrap', 'true'),
    '        creativeMode: ' + value('creativeMode', 'false'),
    '        runcodeCatchGate: ' + value('runcodeCatchGate', 'false'),
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

check('白名单恰有 10 个稳定键', keys.length === 10 && keys.join('|') === expectedKeys.join('|'))
check('locator 恰为稳定插件 id + config 路径', SETTING_DEFINITIONS.every((item) => item.path === 'config.' + (item.key === 'webFetch' ? 'fetch' : item.key === 'toolPresentationMode' ? 'mode' : item.key)))
check('禁止项不在白名单且描述不可变', !keys.some((key) => ['approvalEnabled', 'bootstrapPersona', 'bootstrapShellTools', 'bootstrapCommonTools', 'bootstrapReadHint', 'planTool', 'savePlanDir', 'usageLedger', 'searchTimeoutMs'].includes(key)) && Object.isFrozen(SETTING_DEFINITIONS) && SETTING_DEFINITIONS.every((item) => Object.isFrozen(item)))
// T4：plannerModel 放开为空串（空串=显式清空=继承主会话模型），空白串 normalize 后归一为 ''；
// 非 string（数字等）仍非法——validator 的类型严格性由 !validator(123) 锁定。
check('validator 类型严格且字符串设置支持空串归一', definition('plannerModel').validator('  x  ') && definition('plannerModel').validator('') && definition('plannerModel').normalize('   ') === '' && !definition('plannerModel').validator(123) && definition('otherAgentModel').validator('') && definition('otherAgentModel').normalize('   ') === '' && !definition('otherAgentModel').validator(123) && definition('crossProviderPlannerModel').validator(true) && definition('crossProviderPlannerModel').validator(false) && !definition('crossProviderPlannerModel').validator('true') && !definition('crossProviderPlannerModel').validator(1) && definition('exploreBudget').validator(1) && !definition('exploreBudget').validator('1') && TOOL_PRESENTATION_MODES.join('/') === definition('toolPresentationMode').ui.options.join('/'))
check('公开 metadata 含 10 项、额度 min=1、控件与 locale', (() => {
  const metadata = publicSettingMetadata(assetAgent, assetAgent)
  const budget = metadata.fields.find((field) => field.key === 'exploreBudget')
  const mode = metadata.fields.find((field) => field.key === 'toolPresentationMode')
  const cross = metadata.fields.find((field) => field.key === 'crossProviderPlannerModel')
  const other = metadata.fields.find((field) => field.key === 'otherAgentModel')
  return metadata.fields.length === 10 && cross.control === 'select' && cross.options.join('/') === 'true/false' && cross.default === false && other.control === 'text' && other.default === '' && budget.min === 1 && budget.control === 'number' && mode.options.join('/') === 'native/ptc/both' && typeof mode.locale === 'string'
})())

const allOldValues = {
  plannerModel: 'legacy-model',
  crossProviderPlannerModel: true,
  plannerPromptSuffix: 'legacy: suffix',
  exploreBudget: 23,
  otherAgentModel: 'legacy-other-model',
  anchoredBootstrap: false,
  creativeMode: true,
  runcodeCatchGate: true,
  webFetch: true,
  toolPresentationMode: 'ptc',
}
const oldAll = patchAgent(allOldValues)
const captured = captureSettings(oldAll)
check('10 个有效旧值全部捕获', Object.keys(captured.values).length === 10 && Object.values(captured.states).every((state) => state === 'captured') && captured.values.crossProviderPlannerModel === true && captured.values.otherAgentModel === 'legacy-other-model')

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

// T4 正例：空串与空白串均为合法旧值（captured + normalize 为 ''），移出非法值表。
check('plannerModel 空串旧值 → captured 且值为空串', (() => {
  const state = captureSettings(minimalYaml({ plannerModel: "''" }))
  return state.states.plannerModel === 'captured' && state.values.plannerModel === ''
})())
check('plannerModel 空白串旧值 → captured 且 normalize 为空串', (() => {
  const state = captureSettings(minimalYaml({ plannerModel: '"   "' }))
  return state.states.plannerModel === 'captured' && state.values.plannerModel === ''
})())

const invalidCases = [
  ['plannerModel number', 'plannerModel', '123'],
  ['plannerModel null', 'plannerModel', 'null'],
  ['otherAgentModel number', 'otherAgentModel', '123'],
  ['otherAgentModel null', 'otherAgentModel', 'null'],
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
  ['creativeMode string', 'creativeMode', "'true'"],
  ['creativeMode number', 'creativeMode', '1'],
  ['creativeMode null', 'creativeMode', 'null'],
  ['runcodeCatchGate string', 'runcodeCatchGate', "'false'"],
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
  check('有效迁移 10 项 restored 且 distHash 为厂商 hash', validManifest.format === 2 && validManifest.distHash === contentHash(ASSET_DIR) && validManifest.settingsMigration.source === 'captured' && Object.keys(validManifest.settingsMigration.results).length === 10 && Object.values(validManifest.settingsMigration.results).every((result) => result === 'restored'))
  check('有效迁移后的两份核心结构以新版为底、preset 完整', readFileSync(join(validDist, 'preset.yml'), 'utf8') === assetPreset && readFileSync(join(validDist, 'agent.cordis.yml'), 'utf8') === oldAll)

  const oldMissingText = assetAgent.replace('        creativeMode: false\n', '').replace('        runcodeCatchGate: false\n', '').replace('        crossProviderPlannerModel: false\n', '').replace("        otherAgentModel: ''\n", '') + '\n- id: old-custom\n  config:\n    persona: old-only\n'
  writeFileSync(join(missingDist, 'agent.cordis.yml'), oldMissingText, 'utf8')
  writeManifest(missingDist, 'OLD-MISSING-MATRIX')
  check('旧版缺字段 → upgraded 且新版默认保留', syncPreset(missingHome) === 'upgraded')
  const missingManifest = manifestAt(missingDist)
  check('仅新版字段 creativeMode/runcodeCatchGate/crossProviderPlannerModel/otherAgentModel 保持默认并审计 skipped-old-missing', readFileSync(join(missingDist, 'agent.cordis.yml'), 'utf8').includes('        creativeMode: false') && readFileSync(join(missingDist, 'agent.cordis.yml'), 'utf8').includes('        runcodeCatchGate: false') && readFileSync(join(missingDist, 'agent.cordis.yml'), 'utf8').includes('        crossProviderPlannerModel: false') && readFileSync(join(missingDist, 'agent.cordis.yml'), 'utf8').includes("        otherAgentModel: ''") && missingManifest.settingsMigration.results.creativeMode === 'skipped-old-missing' && missingManifest.settingsMigration.results.runcodeCatchGate === 'skipped-old-missing' && missingManifest.settingsMigration.results.crossProviderPlannerModel === 'skipped-old-missing' && missingManifest.settingsMigration.results.otherAgentModel === 'skipped-old-missing')
  check('旧版独有 row/group/persona 不残留', !readFileSync(join(missingDist, 'agent.cordis.yml'), 'utf8').includes('old-custom') && !readFileSync(join(missingDist, 'agent.cordis.yml'), 'utf8').includes('old-only'))

  const invalidText = assetAgent.replace('        plannerModel: deepseek-v4-pro', '        plannerModel: 123').replace('        creativeMode: false', "        creativeMode: 'true'").replace('        crossProviderPlannerModel: false', "        crossProviderPlannerModel: 'true'").replace('        exploreBudget: ' + DEFAULT_EXPLORE_BUDGET, '        exploreBudget: 0').replace("        otherAgentModel: ''", '        otherAgentModel: 123')
  writeFileSync(join(invalidDist, 'agent.cordis.yml'), invalidText, 'utf8')
  writeManifest(invalidDist, 'OLD-INVALID-MATRIX')
  check('非法旧值 → upgraded 不阻断', syncPreset(invalidHome) === 'upgraded')
  const invalidManifest = manifestAt(invalidDist)
  check('非法旧值使用新版实际默认并写 skipped-invalid', readFileSync(join(invalidDist, 'agent.cordis.yml'), 'utf8').includes('        plannerModel: deepseek-v4-pro') && readFileSync(join(invalidDist, 'agent.cordis.yml'), 'utf8').includes('        creativeMode: false') && readFileSync(join(invalidDist, 'agent.cordis.yml'), 'utf8').includes('        crossProviderPlannerModel: false') && readFileSync(join(invalidDist, 'agent.cordis.yml'), 'utf8').includes('        exploreBudget: ' + DEFAULT_EXPLORE_BUDGET) && readFileSync(join(invalidDist, 'agent.cordis.yml'), 'utf8').includes("        otherAgentModel: ''") && invalidManifest.settingsMigration.results.plannerModel === 'skipped-invalid' && invalidManifest.settingsMigration.results.creativeMode === 'skipped-invalid' && invalidManifest.settingsMigration.results.crossProviderPlannerModel === 'skipped-invalid' && invalidManifest.settingsMigration.results.exploreBudget === 'skipped-invalid' && invalidManifest.settingsMigration.results.otherAgentModel === 'skipped-invalid')

  for (const [label, scalar] of [['number', '1'], ['null', 'null']]) {
    const variantHome = join(work, 'invalid-creative-' + label + '-home')
    const variantDist = join(variantHome, '.agent-presets', 'extra-plan')
    mkdirSync(variantDist, { recursive: true })
    writeFileSync(join(variantDist, 'preset.yml'), assetPreset, 'utf8')
    writeFileSync(join(variantDist, 'agent.cordis.yml'), assetAgent.replace('        creativeMode: false', '        creativeMode: ' + scalar), 'utf8')
    writeManifest(variantDist, 'OLD-INVALID-CREATIVE-' + label.toUpperCase())
    check('creativeMode ' + label + ' 旧值 → upgraded 不阻断', syncPreset(variantHome) === 'upgraded')
    const variantManifest = manifestAt(variantDist)
    check('creativeMode ' + label + ' 迁移落 false/skipped-invalid', readFileSync(join(variantDist, 'agent.cordis.yml'), 'utf8').includes('        creativeMode: false') && variantManifest.settingsMigration.results.creativeMode === 'skipped-invalid')
  }

  writeFileSync(join(unreadableDist, 'agent.cordis.yml'), '- id: [not valid\n', 'utf8')
  writeManifest(unreadableDist, 'OLD-UNREADABLE-MATRIX')
  check('旧 YAML 不可读 → upgraded 默认发布', syncPreset(unreadableHome) === 'upgraded')
  const unreadableManifest = manifestAt(unreadableDist)
  check('不可读 source=unreadable 且不伪称 restored/不泄露旧值', unreadableManifest.settingsMigration.source === 'unreadable' && Object.values(unreadableManifest.settingsMigration.results).every((result) => result === 'skipped-source-unreadable') && !JSON.stringify(unreadableManifest).includes('not valid'))

  const beforeIdle = [readFileSync(join(validDist, 'preset.yml')), readFileSync(join(validDist, 'agent.cordis.yml')), readFileSync(join(validDist, 'dist-manifest.json'))]
  check('同版本第二次 → idle', syncPreset(validHome) === 'idle')
  const afterIdle = [readFileSync(join(validDist, 'preset.yml')), readFileSync(join(validDist, 'agent.cordis.yml')), readFileSync(join(validDist, 'dist-manifest.json'))]
  check('idle 字节完全不变且共享 hash/readManifest 复用生产', beforeIdle.every((value, index) => value.equals(afterIdle[index])) && sharedHash(ASSET_DIR) === contentHash(ASSET_DIR) && readManifest(validDist) === contentHash(ASSET_DIR))

  // ── gateWords 升级迁移矩阵（[任务5] 九类：valid/missing/partial-missing/extra-key/
  //    non-string/duplicate/ambiguous/unreadable/bad-new-template） ──────────────
  const GATE_CUSTOM = { routeDirect: '甲直行', routePlan: '乙规划', routeDisagree: '丙否决', approvalApprove: '丁批准', approvalReplan: '戊转规划', purposeRefine: '己完整', purposeRedo: '庚重做' }
  const gateFieldNames = GATE_WORD_MIGRATION_DEFINITIONS.map((item) => item.key)
  const gateBlockRange = (text) => {
    const rows = text.split('\n')
    const start = rows.findIndex((line) => line.trim() === 'gateWords:')
    if (start < 0) return null
    let end = start
    while (end + 1 < rows.length && rows[end + 1].startsWith('          ')) end += 1
    return { rows, start, end }
  }
  const mutateGateBlock = (text, mutate) => {
    const range = gateBlockRange(text)
    if (range === null) throw new Error('fixture: gateWords block missing')
    const block = range.rows.slice(range.start + 1, range.end + 1)
    range.rows.splice(range.start + 1, range.end - range.start, ...mutate(block))
    return range.rows.join('\n')
  }
  const stripGateGroup = (text) => {
    const range = gateBlockRange(text)
    if (range === null) throw new Error('fixture: gateWords block missing')
    range.rows.splice(range.start, range.end - range.start + 1)
    return range.rows.join('\n')
  }
  const dropGateLeaf = (text, field) => mutateGateBlock(text, (block) => block.filter((line) => !line.startsWith('          ' + field + ':')))
  const setGateLeaf = (text, field, raw) => mutateGateBlock(text, (block) => block.map((line) => line.startsWith('          ' + field + ':') ? '          ' + field + ': ' + raw : line))
  const copyGateLeaf = (text, target, source) => mutateGateBlock(text, (block) => {
    const sourceLine = block.find((line) => line.startsWith('          ' + source + ':'))
    const raw = sourceLine.slice(('          ' + source + ':').length).trim()
    return block.map((line) => line.startsWith('          ' + target + ':') ? '          ' + target + ': ' + raw : line)
  })
  const customGateAgent = (text) => {
    let out = text
    for (const item of GATE_WORD_MIGRATION_DEFINITIONS) {
      const patched = patchYamlScalar(out, item, GATE_CUSTOM[item.key])
      if (!patched.ok) throw new Error('fixture: gate patch failed ' + item.key)
      out = patched.text
    }
    return out
  }
  const gateMatrix = [
    ['valid', customGateAgent(assetAgent), 'restored'],
    ['missing', stripGateGroup(assetAgent), 'skipped-old-missing'],
    ['partial-missing', dropGateLeaf(assetAgent, 'routePlan'), 'skipped-invalid'],
    ['extra-key', mutateGateBlock(assetAgent, (block) => block.concat(["          extraKey: 'x'"])), 'skipped-invalid'],
    ['non-string', setGateLeaf(assetAgent, 'routeDirect', '42'), 'skipped-invalid'],
    ['duplicate', copyGateLeaf(assetAgent, 'approvalApprove', 'routeDirect'), 'skipped-invalid'],
    ['ambiguous', assetAgent + '\n- id: extra-plan\n  config:\n    gateWords:\n      routeDirect: dup-row\n', 'skipped-old-ambiguous'],
    ['unreadable', '- id: [not valid\n', 'skipped-source-unreadable'],
  ]
  for (const [label, variant, expectedStatus] of gateMatrix) {
    const home = join(work, 'gate-' + label + '-home')
    const dist = join(home, '.agent-presets', 'extra-plan')
    mkdirSync(dist, { recursive: true })
    writeFileSync(join(dist, 'preset.yml'), assetPreset, 'utf8')
    writeFileSync(join(dist, 'agent.cordis.yml'), variant, 'utf8')
    writeManifest(dist, 'OLD-GATE-' + label.toUpperCase())
    check('gateWords ' + label + ' → upgraded', syncPreset(home) === 'upgraded')
    const migratedManifest = manifestAt(dist)
    const gateResults = migratedManifest.gateWordsMigration === undefined ? {} : migratedManifest.gateWordsMigration.results
    check('gateWords ' + label + ' 审计恰 7 项且全为 ' + expectedStatus, Object.keys(gateResults).length === 7 && Object.values(gateResults).every((result) => result === expectedStatus))
    check('gateWords ' + label + ' manifest 仍 format=2/厂商 hash/settingsMigration 10 项', migratedManifest.format === 2 && migratedManifest.distHash === contentHash(ASSET_DIR) && Object.keys(migratedManifest.settingsMigration.results).length === 10)
    check('gateWords ' + label + ' manifest 不泄漏用户词值', !JSON.stringify(migratedManifest).includes(GATE_CUSTOM.routeDirect) && !JSON.stringify(migratedManifest).includes(GATE_CUSTOM.purposeRedo))
    const migratedText = readFileSync(join(dist, 'agent.cordis.yml'), 'utf8')
    const migratedGroup = resolveSetting(parsePresetYaml(migratedText), GATE_WORDS_GROUP_DEFINITION, { aliases: false })
    const migratedRuntime = createGateRuntime(migratedGroup.value)
    if (label === 'valid') {
      check('gateWords valid 迁移后逐项等于用户定制值', gateFieldNames.every((field) => migratedRuntime.words[field] === GATE_CUSTOM[field]))
    } else {
      const assetWords = resolveSetting(parsePresetYaml(assetAgent), GATE_WORDS_GROUP_DEFINITION, { aliases: false }).value
      check('gateWords ' + label + ' 整组采用新模板出厂值（禁止部分迁移）', gateFieldNames.every((field) => migratedRuntime.words[field] === assetWords[field]) && migratedRuntime.words.routePlan !== GATE_CUSTOM.routePlan)
    }
  }

  // bad-new-template：把插件包整份复制到临时目录，只改【副本】的资产 gateWords，再从副本
  // import 生产 syncPreset（签名不变、无 test-only 参数）：坏模板必须抛错且目标目录三核心
  // 文件逐字节不变、不留 .tmp 残骸。仓库内资产不被触碰。
  {
    const pluginSource = join(HERE, '..', '..', 'plugins', 'dsh-extra-plan')
    const badVariants = [
      ['整组缺失', (text) => stripGateGroup(text)],
      ['单叶缺失', (text) => dropGateLeaf(text, 'purposeRedo')],
      ['值重复', (text) => copyGateLeaf(text, 'approvalReplan', 'routeDirect')],
    ]
    for (const [label, mutate] of badVariants) {
      const copyRoot = join(work, 'bad-template-' + label)
      cpSync(pluginSource, join(copyRoot, 'dsh-extra-plan'), { recursive: true })
      const copyAsset = join(copyRoot, 'dsh-extra-plan', 'assets', 'presets', 'extra-plan', 'agent.cordis.yml')
      writeFileSync(copyAsset, mutate(readFileSync(copyAsset, 'utf8')), 'utf8')
      const copySync = await import(pathToFileURL(join(copyRoot, 'dsh-extra-plan', 'lib', 'preset-sync.js')).href)
      const home = join(work, 'bad-template-' + label + '-home')
      const dist = join(home, '.agent-presets', 'extra-plan')
      mkdirSync(dist, { recursive: true })
      writeFileSync(join(dist, 'preset.yml'), assetPreset, 'utf8')
      writeFileSync(join(dist, 'agent.cordis.yml'), customGateAgent(assetAgent), 'utf8')
      writeManifest(dist, 'OLD-BAD-TEMPLATE-' + label)
      const before = [readFileSync(join(dist, 'preset.yml')), readFileSync(join(dist, 'agent.cordis.yml')), readFileSync(join(dist, 'dist-manifest.json'))]
      let thrown = null
      try { copySync.syncPreset(home) } catch (error) { thrown = error instanceof Error ? error.message : String(error) }
      const after = [readFileSync(join(dist, 'preset.yml')), readFileSync(join(dist, 'agent.cordis.yml')), readFileSync(join(dist, 'dist-manifest.json'))]
      const leftovers = readdirSync(join(home, '.agent-presets')).filter((name) => name.startsWith('.tmp-'))
      check('bad-new-template ' + label + ' → 抛错且目标三核心文件逐字节不变、无 .tmp 残骸', thrown !== null && before.every((value, index) => value.equals(after[index])) && leftovers.length === 0)
    }
  }

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
