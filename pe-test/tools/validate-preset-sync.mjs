// preset-sync 自愈三态判定验证：用临时 DSH_HOME 真实调用 syncPreset，
// 覆盖矩阵 A/F（首次/无记录）、B/D/G（当前版/旧版/记录旧内容新）、
// C（同版本内手改 → 保留）、E（跨版本+手改 → 覆盖）。
// 只读仓库资产（ASSET_DIR 由库内定位），临时目录建在系统临时区，跑完清理。
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, rmSync, appendFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createHash } from 'node:crypto'
import { fileURLToPath } from 'node:url'
import { syncPreset } from '../../plugins/dsh-extra-plan/lib/preset-sync.js'

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

const work = mkdtempSync(join(tmpdir(), 'dsh-preset-sync-'))
const home = join(work, 'home')
const dist = join(home, '.agent-presets', 'extra-plan')
mkdirSync(home, { recursive: true })
const cur = contentHash(ASSET_DIR)
const MARK = '# USER-MODIFIED-MARK-7f3a'

try {
  // A 首次安装（目标不存在）
  check('A 首次安装 → written', 'written', syncPreset(home))
  check('A 文件就位（内容==当前版）', true, contentHash(dist) === cur)

  // B 当前版未动
  check('B 二次核对 → idle', 'idle', syncPreset(home))

  // C 同版本内手改 → 保留
  appendFileSync(join(dist, 'agent.cordis.yml'), '\n' + MARK + '\n')
  check('C 同版手改 → idle', 'idle', syncPreset(home))
  check('C 手改被保留', true, readFileSync(join(dist, 'agent.cordis.yml'), 'utf8').includes(MARK))

  // 恢复手改标记
  const restored = readFileSync(join(dist, 'agent.cordis.yml'), 'utf8').replace('\n' + MARK + '\n', '\n')
  writeFileSync(join(dist, 'agent.cordis.yml'), restored)

  // D 旧版未动（记录=旧，内容=当前版可视为"旧版未动"的判据已不读内容）
  writeManifest(dist, 'OLDHASH')
  check('D 旧记录 → upgraded', 'upgraded', syncPreset(home))
  check('D 记录纠正为当前版', true, readManifest(dist) === cur)

  // E 跨版本 + 手改 → 覆盖（手改被重置）
  writeManifest(dist, 'OLDHASH2')
  appendFileSync(join(dist, 'agent.cordis.yml'), '\n' + MARK + '\n')
  check('E 旧版手改 → upgraded', 'upgraded', syncPreset(home))
  check('E 手改被覆盖（标记消失）', false, readFileSync(join(dist, 'agent.cordis.yml'), 'utf8').includes(MARK))
  check('E 记录=当前版', true, readManifest(dist) === cur)

  // F 无记录（删 manifest）→ upgraded
  rmSync(join(dist, 'dist-manifest.json'))
  check('F 无记录 → upgraded', 'upgraded', syncPreset(home))
  check('F manifest 重建=当前版', true, readManifest(dist) === cur)

  // G 记录旧、内容已是当前版 → upgraded（收敛记录）
  writeManifest(dist, 'OLDHASH3')
  check('G 记录旧内容新 → upgraded', 'upgraded', syncPreset(home))
  check('G 记录=当前版', true, readManifest(dist) === cur)

  // 收敛：以上任意覆盖后再次核对 → idle
  check('收敛 → idle', 'idle', syncPreset(home))
} finally {
  rmSync(work, { recursive: true, force: true })
}

console.log(`\n通过 ${pass}, 失败 ${fail}`)
process.exit(fail === 0 ? 0 : 1)
