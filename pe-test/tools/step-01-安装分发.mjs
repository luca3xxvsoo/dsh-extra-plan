// distribute（postinstall）回归：dsh 0.1.7-rc.1 起 postinstall 只初始化插件自有状态目录
// （$DSH_HOME/.agent-presets/extra-plan/dist-manifest.json，format=2 + 空审计）。
// 预设本体由 profile patch 声明行携带（见 step-01-安装同步.mjs / step-01-预设完整性.mjs）。
// 夹具全部位于系统临时 DSH_HOME，不读取或写入生产目录。

import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { distribute } from '../../plugins/dsh-extra-plan/scripts/distribute-preset.mjs'
import { contentHash, stateDirOf, ASSET_DIR } from '../../plugins/dsh-extra-plan/lib/preset-sync.js'

const HERE = fileURLToPath(new URL('.', import.meta.url))

let pass = 0
let fail = 0
function check(label, condition) {
  if (condition) { pass += 1; console.log('PASS  ' + label) }
  else { fail += 1; console.log('FAIL  ' + label) }
}

function manifestAt(dir) {
  return JSON.parse(readFileSync(join(dir, 'dist-manifest.json'), 'utf8'))
}

const work = mkdtempSync(join(tmpdir(), 'dsh-distribute-state-'))
const home = join(work, 'home')
const stateDir = stateDirOf(home)
mkdirSync(home, { recursive: true })

try {
  // ① 首次安装：状态目录就位 + 空 manifest（distHash=null、双审计缺席）
  check('首次安装 → written', distribute(home) === 'written')
  const first = manifestAt(stateDir)
  check('首次 manifest format=2 且 distHash=null（空台账，等待启动自愈写入资产 hash）', first.format === 2 && first.distHash === null)
  check('首次 settingsMigration source=absent 且恰有 10 项', first.settingsMigration !== undefined && first.settingsMigration.source === 'absent' && Object.keys(first.settingsMigration.results).length === 10)
  check('首次设置审计 10 项全 skipped-source-absent', Object.values(first.settingsMigration.results).every((result) => result === 'skipped-source-absent'))
  check('首次 gateWordsMigration 恰 7 项全 skipped-source-absent', first.gateWordsMigration !== undefined && first.gateWordsMigration.format === 1 && first.gateWordsMigration.source === 'absent' && Object.keys(first.gateWordsMigration.results).length === 7 && Object.values(first.gateWordsMigration.results).every((result) => result === 'skipped-source-absent'))

  // ② 同版本重装 → idle：manifest 字节完全不变（用户改动/台账不被触碰）
  const beforeIdle = readFileSync(join(stateDir, 'dist-manifest.json'))
  check('同版本重装 → idle', distribute(home) === 'idle')
  check('idle manifest 字节完全不变', readFileSync(join(stateDir, 'dist-manifest.json')).equals(beforeIdle))

  // ③ postinstall 不再写预设本体：状态目录内不得出现 agent.cordis.yml / preset.yml
  check('postinstall 不再分发预设本体（状态目录无 agent.cordis.yml/preset.yml）',
    !readFileSync(join(stateDir, 'dist-manifest.json'), 'utf8').includes('agent.cordis.yml') &&
    (() => { try { readFileSync(join(stateDir, 'agent.cordis.yml')); return false } catch { return true } })() &&
    (() => { try { readFileSync(join(stateDir, 'preset.yml')); return false } catch { return true } })())

  // ④ 状态目录已存在旧台账（distHash 非空）时不被 postinstall 覆盖
  writeFileSync(join(stateDir, 'dist-manifest.json'), JSON.stringify({
    format: 2,
    distHash: contentHash(ASSET_DIR),
    settingsMigration: { format: 1, sourceDistHash: null, source: 'captured', results: { plannerModel: 'restored' } },
    gateWordsMigration: { format: 1, sourceDistHash: null, source: 'captured', results: { routeDirect: 'restored' } },
  }, null, 2) + '\n', 'utf8')
  const beforeKeep = readFileSync(join(stateDir, 'dist-manifest.json'))
  check('已有非空台账 → idle 且台账字节不变', distribute(home) === 'idle' && readFileSync(join(stateDir, 'dist-manifest.json')).equals(beforeKeep))
  check('台账内容保留（captured 审计未被 postinstall 抹平）', manifestAt(stateDir).settingsMigration.source === 'captured')
} finally {
  rmSync(work, { recursive: true, force: true })
}

console.log('\n通过 ' + pass + ', 失败 ' + fail)
process.exit(fail === 0 ? 0 : 1)
