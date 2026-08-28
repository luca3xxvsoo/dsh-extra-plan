// distribute（postinstall）三态判定验证：用临时 DSH_HOME 真实调用 distribute，
// 覆盖矩阵：首次/同版本（含手改保留）/旧版/无记录/收敛。
// 只读仓库资产（ASSET_DIR 由脚本内定位），临时目录建在系统临时区，跑完清理。
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, rmSync, appendFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createHash } from 'node:crypto'
import { fileURLToPath } from 'node:url'
import { distribute } from '../../plugins/dsh-extra-plan/scripts/distribute-preset.mjs'

const HERE = fileURLToPath(new URL('.', import.meta.url))
const ASSET_DIR = join(HERE, '..', '..', 'plugins', 'dsh-extra-plan', 'assets', 'presets', 'extra-plan')

function contentHash(dir) {
  const h = createHash('sha256')
  for (const file of ['preset.yml', 'agent.cordis.yml']) {
    const p = join(dir, file)
    if (!existsSync(p)) return null
    h.update(readFileSync(p))
  }
  return h.digest('hex')
}
function readManifest(dir) {
  try { const m = JSON.parse(readFileSync(join(dir, 'dist-manifest.json'), 'utf8')); return m.distHash } catch { return null }
}
function writeManifest(dir, hash) {
  writeFileSync(join(dir, 'dist-manifest.json'), JSON.stringify({ format: 1, distHash: hash }, null, 2) + '\n')
}

let pass = 0
let fail = 0
function check(label, expected, actual) {
  const ok = expected === actual
  if (ok) { pass += 1; console.log(`PASS  ${label}`) }
  else { fail += 1; console.log(`FAIL  ${label}: 期望 ${expected} 实际 ${actual}`) }
}

const work = mkdtempSync(join(tmpdir(), 'dsh-distribute-'))
const home = join(work, 'home')
const dist = join(home, '.agent-presets', 'extra-plan')
mkdirSync(home, { recursive: true })
const cur = contentHash(ASSET_DIR)
const MARK = '# USER-MODIFIED-MARK-D1'

try {
  // 首次安装
  check('首次安装 → written', 'written', distribute(home))
  check('文件就位（内容==当前版）', true, contentHash(dist) === cur)

  // 同版本重装
  check('同版本重装 → idle', 'idle', distribute(home))

  // 同版本 + 手改（核心：不覆盖）
  appendFileSync(join(dist, 'agent.cordis.yml'), '\n' + MARK + '\n')
  check('同版本手改重装 → idle', 'idle', distribute(home))
  check('手改被保留（标记仍在）', true, readFileSync(join(dist, 'agent.cordis.yml'), 'utf8').includes(MARK))
  const restored = readFileSync(join(dist, 'agent.cordis.yml'), 'utf8').replace('\n' + MARK + '\n', '\n')
  writeFileSync(join(dist, 'agent.cordis.yml'), restored)

  // 旧记录（跨版本下发）
  writeManifest(dist, 'OLDHASH')
  check('旧记录 → upgraded', 'upgraded', distribute(home))
  check('记录纠正为当前版', true, readManifest(dist) === cur)

  // 无记录 → 覆盖
  rmSync(join(dist, 'dist-manifest.json'))
  check('无记录 → upgraded', 'upgraded', distribute(home))
  check('manifest 重建=当前版', true, readManifest(dist) === cur)

  // 收敛
  check('收敛 → idle', 'idle', distribute(home))
} finally {
  rmSync(work, { recursive: true, force: true })
}

console.log(`\n通过 ${pass}, 失败 ${fail}`)
process.exit(fail === 0 ? 0 : 1)
