// syncPreset 启动自愈入口的选择性迁移回归。
// 全部写入均在系统临时 DSH_HOME，绝不使用真实生产目录。

import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync, appendFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { syncPreset } from '../../plugins/dsh-extra-plan/lib/preset-sync.js'
import { contentHash, readManifest, writeManifest } from '../_shared/preset-hash.mjs'
import { SETTING_DEFINITIONS, parsePresetYaml, patchYamlScalar, resolveSetting } from '../../plugins/dsh-extra-plan/lib/preset-settings.js'
import { GATE_WORD_FIELDS, GATE_WORD_MIGRATION_DEFINITIONS, GATE_WORDS_GROUP_DEFINITION, createGateRuntime } from '../../plugins/dsh-extra-plan/lib/gate-words.js'

const HERE = fileURLToPath(new URL('.', import.meta.url))
const ASSET_DIR = join(HERE, '..', '..', 'plugins', 'dsh-extra-plan', 'assets', 'presets', 'extra-plan')
const assetAgent = readFileSync(join(ASSET_DIR, 'agent.cordis.yml'), 'utf8')
const definition = (key) => SETTING_DEFINITIONS.find((item) => item.key === key)

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

function manifestAt(dist) {
  return JSON.parse(readFileSync(join(dist, 'dist-manifest.json'), 'utf8'))
}

const work = mkdtempSync(join(tmpdir(), 'dsh-sync-migration-'))
const home = join(work, 'home')
const dist = join(home, '.agent-presets', 'extra-plan')
mkdirSync(home, { recursive: true })
const currentHash = contentHash(ASSET_DIR)
const oldValues = {
  plannerModel: 'old-sync-model',
  crossProviderPlannerModel: true,
  plannerPromptSuffix: 'old: sync suffix',
  exploreBudget: 9,
  otherAgentModel: 'old-sync-other-model',
  anchoredBootstrap: false,
  creativeMode: false,
  runcodeCatchGate: true,
  webFetch: true,
  toolPresentationMode: 'both',
}
const expectedOldAgent = patchAgent(oldValues)

try {
  check('首次自愈 → written', syncPreset(home) === 'written')
  check('首次 manifest format=2/10 项审计', (() => { const m = manifestAt(dist); return m.format === 2 && m.distHash === currentHash && Object.keys(m.settingsMigration.results).length === 10 })())
  check('首次安装 gateWordsMigration 恰 7 项且全为 skipped-source-absent（format=1）', (() => { const m = manifestAt(dist); return m.gateWordsMigration !== undefined && m.gateWordsMigration.format === 1 && m.gateWordsMigration.source === 'absent' && Object.keys(m.gateWordsMigration.results).length === 7 && Object.values(m.gateWordsMigration.results).every((result) => result === 'skipped-source-absent') })())
  check('首次第二次 → idle', syncPreset(home) === 'idle')

  writeFileSync(join(dist, 'agent.cordis.yml'), expectedOldAgent, 'utf8')
  writeManifest(dist, 'OLD-SYNC-HASH')
  const profile = join(home, 'profiles', 'sample')
  mkdirSync(profile, { recursive: true })
  const patchFile = join(profile, 'cordis.patch.yml')
  const approval = '    approvalEnabled: true'
  writeFileSync(patchFile, '- id: flash-guide\n  disabled: true\n- id: keep\n  config:\n' + approval + '\n', 'utf8')
  check('旧 format=1 记录 → upgraded', syncPreset(home) === 'upgraded')
  const upgraded = manifestAt(dist)
  check('升级后全部有效旧值恢复', readFileSync(join(dist, 'agent.cordis.yml'), 'utf8') === expectedOldAgent)
  check('升级后 format=2/厂商 hash/audit captured', upgraded.format === 2 && upgraded.distHash === currentHash && upgraded.settingsMigration.source === 'captured')
  check('升级后清理旧 flash 且不碰其他 patch 字段', !readFileSync(patchFile, 'utf8').includes('flash-guide') && readFileSync(patchFile, 'utf8').includes(approval))

  writeFileSync(join(dist, 'agent.cordis.yml'), patchAgent({ plannerModel: 'old-sync-no-manifest' }), 'utf8')
  rmSync(join(dist, 'dist-manifest.json'))
  check('无 manifest 仍 upgraded', syncPreset(home) === 'upgraded')
  const noManifest = manifestAt(dist)
  check('无 manifest sourceDistHash=null/旧值恢复', noManifest.settingsMigration.sourceDistHash === null && readFileSync(join(dist, 'agent.cordis.yml'), 'utf8').includes("plannerModel: 'old-sync-no-manifest'"))

  const beforeIdle = [readFileSync(join(dist, 'preset.yml')), readFileSync(join(dist, 'agent.cordis.yml')), readFileSync(join(dist, 'dist-manifest.json'))]
  check('相同 hash 收敛 → idle', syncPreset(home) === 'idle')
  const afterIdle = [readFileSync(join(dist, 'preset.yml')), readFileSync(join(dist, 'agent.cordis.yml')), readFileSync(join(dist, 'dist-manifest.json'))]
  check('idle 三个核心字节完全不变且 readManifest 正确', beforeIdle.every((value, index) => value.equals(afterIdle[index])) && readManifest(dist) === currentHash)

  // ── gateWords：同 hash 普通重启保留 + hash 变化版本升级整组迁移（[任务5]） ──
  const GATE_CUSTOM = { routeDirect: '甲直行', routePlan: '乙规划', routeDisagree: '丙否决', approvalApprove: '丁批准', approvalReplan: '戊转规划', purposeRefine: '己完整', purposeRedo: '庚重做' }
  function customGateAgent(text) {
    let out = text
    for (const item of GATE_WORD_MIGRATION_DEFINITIONS) {
      const patched = patchYamlScalar(out, item, GATE_CUSTOM[item.key])
      if (!patched.ok) throw new Error('fixture patch failed: ' + item.key)
      out = patched.text
    }
    return out
  }
  function flattenRows(list) {
    const out = []
    for (const row of list) {
      if (row === null || typeof row !== 'object') continue
      out.push(row)
      if (row.group === true && Array.isArray(row.config)) out.push(...flattenRows(row.config))
    }
    return out
  }
  const assetBootstrapPersona = flattenRows(parsePresetYaml(assetAgent)).find((row) => row.id === 'extra-plan').config.bootstrapPersona
  function bootstrapPersonaLine(value) { return "        bootstrapPersona: '" + value + "'" }

  // ① 同 hash 普通重启：现场 7 词改成定制值、manifest 保持 currentHash → idle 且字节逐字保留
  writeFileSync(join(dist, 'agent.cordis.yml'), customGateAgent(assetAgent), 'utf8')
  const beforeCustomIdle = [readFileSync(join(dist, 'preset.yml')), readFileSync(join(dist, 'agent.cordis.yml')), readFileSync(join(dist, 'dist-manifest.json'))]
  check('同 hash 现场定制 7 词 → idle（不读取/不改写现场正文）', syncPreset(home) === 'idle')
  const afterCustomIdle = [readFileSync(join(dist, 'preset.yml')), readFileSync(join(dist, 'agent.cordis.yml')), readFileSync(join(dist, 'dist-manifest.json'))]
  check('idle 三个核心文件 Buffer 完全相等（用户定制词逐字保留）', beforeCustomIdle.every((value, index) => value.equals(afterCustomIdle[index])))

  // ② hash 变化版本升级：非迁移厂商字段改 OLD 标记 + manifest 改旧 hash
  const oldMarkerAgent = readFileSync(join(dist, 'agent.cordis.yml'), 'utf8').replace(bootstrapPersonaLine(assetBootstrapPersona), "        bootstrapPersona: 'OLD-SYNC-MARKER'")
  writeFileSync(join(dist, 'agent.cordis.yml'), oldMarkerAgent, 'utf8')
  writeManifest(dist, 'OLD-SYNC-GATE-HASH')
  check('旧 hash + 非迁移字段 OLD 标记 → upgraded', syncPreset(home) === 'upgraded')
  const upgradedGateManifest = manifestAt(dist)
  const upgradedGateText = readFileSync(join(dist, 'agent.cordis.yml'), 'utf8')
  const upgradedGateGroup = resolveSetting(parsePresetYaml(upgradedGateText), GATE_WORDS_GROUP_DEFINITION, { aliases: false })
  const upgradedGateRuntime = createGateRuntime(upgradedGateGroup.value)
  check('升级后 7 个定制词逐项保留（createGateRuntime.variables 等于用户值）', GATE_WORD_FIELDS.every((item) => upgradedGateRuntime.variables[item.variable] === GATE_CUSTOM[item.field]) && GATE_WORD_MIGRATION_DEFINITIONS.every((item) => upgradedGateRuntime.words[item.key] === GATE_CUSTOM[item.key]))
  check('升级后非迁移厂商字段恢复为当前资产值（新模板其它内容同步）', upgradedGateText.includes('bootstrapPersona: ' + JSON.stringify(assetBootstrapPersona).replace(/^"|"$/g, "'")) && !upgradedGateText.includes('OLD-SYNC-MARKER'))
  check('升级产物 persona prefix === text 且含 7 个变量引用', (() => { const persona = flattenRows(parsePresetYaml(upgradedGateText)).find((row) => row.id === 'persona'); const refs = Array.from(new Set(persona.config.prefix.match(/\{\{extra_plan_[a-z_]+\}\}/g) || [])); return persona.config.prefix === persona.config.text && refs.length === 7 })())
  check('升级后 manifest distHash=currentHash / settingsMigration 10 项 / gateWordsMigration 7 项全 restored', upgradedGateManifest.format === 2 && upgradedGateManifest.distHash === currentHash && Object.keys(upgradedGateManifest.settingsMigration.results).length === 10 && Object.keys(upgradedGateManifest.gateWordsMigration.results).length === 7 && Object.values(upgradedGateManifest.gateWordsMigration.results).every((result) => result === 'restored'))
  check('升级后 manifest 不泄漏用户词值', !JSON.stringify(upgradedGateManifest).includes(GATE_CUSTOM.routeDirect) && !JSON.stringify(upgradedGateManifest).includes(GATE_CUSTOM.approvalReplan))
  check('升级后再次同步 → idle（收敛）', syncPreset(home) === 'idle')

  const oldMissingCross = expectedOldAgent.replace('        crossProviderPlannerModel: true\n', '')
  writeFileSync(join(dist, 'agent.cordis.yml'), oldMissingCross, 'utf8')
  writeManifest(dist, 'OLD-MISSING-CROSS')
  check('旧值缺失 crossProviderPlannerModel → upgraded', syncPreset(home) === 'upgraded')
  const missingCrossManifest = manifestAt(dist)
  const missingCrossText = readFileSync(join(dist, 'agent.cordis.yml'), 'utf8')
  check('缺失开关写回 false 且审计 skipped-old-missing', missingCrossText.includes('crossProviderPlannerModel: false') && missingCrossManifest.settingsMigration.results.crossProviderPlannerModel === 'skipped-old-missing')

  const oldMissingOther = expectedOldAgent.replace("        otherAgentModel: 'old-sync-other-model'\n", '')
  writeFileSync(join(dist, 'agent.cordis.yml'), oldMissingOther, 'utf8')
  writeManifest(dist, 'OLD-MISSING-OTHER')
  check('旧值缺失 otherAgentModel → upgraded', syncPreset(home) === 'upgraded')
  const missingOtherManifest = manifestAt(dist)
  const missingOtherText = readFileSync(join(dist, 'agent.cordis.yml'), 'utf8')
  check('缺失 otherAgentModel 写回空串且审计 skipped-old-missing', missingOtherText.includes("otherAgentModel: ''") && missingOtherManifest.settingsMigration.results.otherAgentModel === 'skipped-old-missing')

  // T4：旧值 plannerModel 为空串（显式清空）→ captured → restored，写回 '' 且不回填资产默认
  writeFileSync(join(dist, 'agent.cordis.yml'), patchAgent({ plannerModel: '' }), 'utf8')
  writeManifest(dist, 'OLD-EMPTY-PLANNER-MODEL')
  check('旧值空串 → upgraded', syncPreset(home) === 'upgraded')
  const emptyManifest = manifestAt(dist)
  const emptyAgentText = readFileSync(join(dist, 'agent.cordis.yml'), 'utf8')
  check('空串旧值 restored 且写回 plannerModel: \'\'（不删行、不回填 deepseek-v4-pro）', emptyManifest.settingsMigration.results.plannerModel === 'restored' && emptyAgentText.includes("plannerModel: ''") && !emptyAgentText.includes('plannerModel: deepseek-v4-pro'))
  check('空串迁移后 manifest 仍为厂商 hash/format=2', emptyManifest.format === 2 && emptyManifest.distHash === currentHash && emptyManifest.settingsMigration.source === 'captured')
} finally {
  rmSync(work, { recursive: true, force: true })
}

console.log('\n通过 ' + pass + ', 失败 ' + fail)
process.exit(fail === 0 ? 0 : 1)
