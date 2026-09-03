// @local/dsh-extra-plan postinstall —— 安装时一次性分发预设资产（与 dsh-qqbot-user-questions 的
// apply-patch.mjs 同构：下载安装完成即执行一次，之后永不运行）。
//
// 行为：
// - 目标 <DSH_HOME>/.agent-presets/extra-plan/：不存在 → 全量写入（written）；
// - 目标 manifest 记录 == 当前发行 hash（同版本重装）→ 幂等无操作（idle，用户改动保留）；
// - 其余（跨版本下发 / 记录缺失）→ 覆盖为当前发行物（upgraded，手改过的旧版同样覆盖）；
// - 写入 manifest {format, distHash}（记录当前发行 hash）；
// - 发布新版本：用户重新 dsh plugin add → postinstall 再跑一次 → 新预设就位（覆盖）。
// - 失败降级：任何异常只打印一行说明（exit 0，不阻断安装）。
//
// 定位：脚本位于安装现场 <profile>/node_modules/@local/dsh-extra-plan/scripts/，
// 资产在其 ../assets/presets/extra-plan/；DSH_HOME 取 $DSH_HOME（环境变量）否则 ~/.dsh。
import { createHash } from 'node:crypto'
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const PRESET_ID = 'extra-plan'
const MANIFEST_NAME = 'dist-manifest.json'
const TMP_PREFIX = '.tmp-'
const CORE_FILES = ['preset.yml', 'agent.cordis.yml']

const HERE = dirname(fileURLToPath(import.meta.url))
const PACKAGE_ROOT = join(HERE, '..')
const ASSET_DIR = join(PACKAGE_ROOT, 'assets', 'presets', PRESET_ID)

/** sha256(preset.yml || agent.cordis.yml)，固定顺序，作为发行物内容 hash（仅记录）。 */
function contentHash(dir) {
  const h = createHash('sha256')
  for (const file of CORE_FILES) {
    const p = join(dir, file)
    if (!existsSync(p)) return null
    h.update(readFileSync(p))
  }
  return h.digest('hex')
}

/** 全量写目标目录：先写 .tmp- 临时目录，再「删旧 + 改名」两步原子完成。 */
function writeTarget(targetDir, distHash) {
  const parent = dirname(targetDir)
  const tmp = join(parent, `${TMP_PREFIX}${PRESET_ID}-${process.pid}-${Date.now()}`)
  mkdirSync(tmp, { recursive: true })
  try {
    for (const file of readdirSync(ASSET_DIR)) copyFileSync(join(ASSET_DIR, file), join(tmp, file))
    writeFileSync(join(tmp, MANIFEST_NAME), JSON.stringify({ format: 1, distHash }, null, 2) + '\n')
    try {
      if (existsSync(targetDir)) rmSync(targetDir, { recursive: true, force: true })
      renameSync(tmp, targetDir)
    } catch {
      mkdirSync(targetDir, { recursive: true })
      for (const file of readdirSync(tmp)) copyFileSync(join(tmp, file), join(targetDir, file))
      rmSync(tmp, { recursive: true, force: true })
    }
  } catch (err) {
    rmSync(tmp, { recursive: true, force: true })
    throw err
  }
}

/** 读目标目录 manifest 的 distHash；缺失/损坏返回 null。 */
function readManifest(targetDir) {
  const p = join(targetDir, MANIFEST_NAME)
  if (!existsSync(p)) return null
  try {
    const m = JSON.parse(readFileSync(p, 'utf8'))
    return m !== null && typeof m === 'object' && typeof m.distHash === 'string' ? m.distHash : null
  } catch {
    return null
  }
}

/** 安装时一次性分发（导出便于冒烟测试）。同版本重装不覆盖（用户改动保留）；跨版本/首次/无记录覆盖。 */
export function distribute(dshHome) {
  const targetDir = join(dshHome, '.agent-presets', PRESET_ID)
  const distHash = contentHash(ASSET_DIR)
  if (distHash === null) throw new Error(`预设资产缺失：${ASSET_DIR}`)
  if (existsSync(targetDir)) {
    const recorded = readManifest(targetDir)
    if (recorded === distHash) {
      process.stdout.write(`[dsh-extra-plan] 预设已是当前发行，用户改动保留（同版本重装）→ ${targetDir}\n`)
      return 'idle'
    }
    writeTarget(targetDir, distHash)
    process.stdout.write(`[dsh-extra-plan] 预设已升级为新版本 → ${targetDir}\n`)
    return 'upgraded'
  }
  writeTarget(targetDir, distHash)
  process.stdout.write(`[dsh-extra-plan] 预设「按需规划模式」已分发（安装时一次性）→ ${targetDir}\n`)
  return 'written'
}

// CLI 入口：postinstall 直接运行本脚本。
// pnpm 以「相对路径」调用（`node scripts/distribute-preset.mjs`，cwd=包目录），
// 故用 resolve 归一化后再与 import.meta.url 比较（Windows 下忽略大小写）。
const invokedAsMain = (() => {
  if (!process.argv[1]) return false
  const called = resolve(process.argv[1])
  const self = fileURLToPath(import.meta.url)
  return process.platform === 'win32'
    ? called.toLowerCase() === self.toLowerCase()
    : called === self
})()
if (invokedAsMain) {
  const dshHome = process.env.DSH_HOME === undefined || process.env.DSH_HOME === ''
    ? join(homedir(), '.dsh')
    : process.env.DSH_HOME
  try {
    distribute(dshHome)
  } catch (err) {
    process.stderr.write(`[dsh-extra-plan] 预设分发失败（不阻断安装）：${err instanceof Error ? err.message : String(err)}\n`)
    process.exit(0)
  }
}
