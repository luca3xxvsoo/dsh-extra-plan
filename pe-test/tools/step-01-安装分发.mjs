// distribute（postinstall）调用统一生产 syncPreset 的回归。
// 夹具全部位于系统临时 DSH_HOME，不读取或写入生产目录。

import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, rmSync, appendFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { distribute } from '../../plugins/dsh-extra-plan/scripts/distribute-preset.mjs'
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

const work = mkdtempSync(join(tmpdir(), 'dsh-distribute-migration-'))
const home = join(work, 'home')
const dist = join(home, '.agent-presets', 'extra-plan')
mkdirSync(home, { recursive: true })
const currentHash = contentHash(ASSET_DIR)
const oldValues = {
  plannerModel: 'old-distribute-model',
  plannerPromptSuffix: 'old: suffix',
  exploreBudget: 7,
  anchoredBootstrap: false,
  runcodeCatchGate: true,
  webFetch: true,
  toolPresentationMode: 'ptc',
}
const expectedOldAgent = patchAgent(oldValues)
const marker = '# USER-MODIFIED-MARK-D1'

try {
  check('首次安装 → written', distribute(home) === 'written')
  const first = manifestAt(dist)
  check('首次 manifest format=2', first.format === 2)
  check('首次审计 source=absent 且恰有 7 项', first.settingsMigration && first.settingsMigration.source === 'absent' && Object.keys(first.settingsMigration.results).length === 7)
  check('首次厂商 distHash 正确', first.distHash === currentHash && readManifest(dist) === currentHash)
  check('同版本重装 → idle', distribute(home) === 'idle')

  appendFileSync(join(dist, 'agent.cordis.yml'), '\n' + marker + '\n')
  check('同版本手改重装 → idle', distribute(home) === 'idle')
  check('同版本手改保留', readFileSync(join(dist, 'agent.cordis.yml'), 'utf8').includes(marker))

  writeFileSync(join(dist, 'agent.cordis.yml'), expectedOldAgent, 'utf8')
  writeManifest(dist, 'OLD-DISTRIBUTE-HASH')
  check('旧 format=1 记录 → upgraded', distribute(home) === 'upgraded')
  const upgraded = manifestAt(dist)
  check('升级后 7 项有效旧值全部恢复', readFileSync(join(dist, 'agent.cordis.yml'), 'utf8') === expectedOldAgent)
  check('升级后 manifest format=2/厂商 hash', upgraded.format === 2 && upgraded.distHash === currentHash)
  check('升级后 audit captured/7 项且不含原始用户值', upgraded.settingsMigration.source === 'captured' && Object.keys(upgraded.settingsMigration.results).length === 7 && !JSON.stringify(upgraded).includes('old-distribute-model'))

  writeFileSync(join(dist, 'agent.cordis.yml'), patchAgent({ plannerModel: 'old-without-manifest' }), 'utf8')
  rmSync(join(dist, 'dist-manifest.json'))
  check('无 manifest 仍捕获并 upgraded', distribute(home) === 'upgraded')
  const noManifest = manifestAt(dist)
  check('无 manifest sourceDistHash=null 且恢复', noManifest.settingsMigration.sourceDistHash === null && readFileSync(join(dist, 'agent.cordis.yml'), 'utf8').includes("plannerModel: 'old-without-manifest'"))

  const beforeIdle = [readFileSync(join(dist, 'preset.yml')), readFileSync(join(dist, 'agent.cordis.yml')), readFileSync(join(dist, 'dist-manifest.json'))]
  check('第二次相同发行 → idle', distribute(home) === 'idle')
  const afterIdle = [readFileSync(join(dist, 'preset.yml')), readFileSync(join(dist, 'agent.cordis.yml')), readFileSync(join(dist, 'dist-manifest.json'))]
  check('idle 三个核心字节完全不变', beforeIdle.every((value, index) => value.equals(afterIdle[index])))
} finally {
  rmSync(work, { recursive: true, force: true })
}

console.log('\n通过 ' + pass + ', 失败 ' + fail)
process.exit(fail === 0 ? 0 : 1)
