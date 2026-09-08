// syncPreset 启动自愈入口的选择性迁移回归。
// 全部写入均在系统临时 DSH_HOME，绝不使用真实生产目录。

import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync, appendFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { syncPreset } from '../../plugins/dsh-extra-plan/lib/preset-sync.js'
import { contentHash, readManifest, writeManifest } from '../_shared/preset-hash.mjs'
import { SETTING_DEFINITIONS, patchYamlScalar } from '../../plugins/dsh-extra-plan/lib/preset-settings.js'

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
  plannerPromptSuffix: 'old: sync suffix',
  exploreBudget: 9,
  anchoredBootstrap: false,
  runcodeCatchGate: true,
  flashGuideEnabled: true,
  webFetch: true,
  toolPresentationMode: 'both',
}
const expectedOldAgent = patchAgent(oldValues)

try {
  check('首次自愈 → written', syncPreset(home) === 'written')
  check('首次 manifest format=2/8 项审计', (() => { const m = manifestAt(dist); return m.format === 2 && m.distHash === currentHash && Object.keys(m.settingsMigration.results).length === 8 })())
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
} finally {
  rmSync(work, { recursive: true, force: true })
}

console.log('\n通过 ' + pass + ', 失败 ' + fail)
process.exit(fail === 0 ? 0 : 1)
