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
import { existsSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { contentHash, readManifest, writeFull } from '../lib/preset-sync.js'

const PRESET_ID = 'extra-plan'

const HERE = dirname(fileURLToPath(import.meta.url))
const PACKAGE_ROOT = join(HERE, '..')
const ASSET_DIR = join(PACKAGE_ROOT, 'assets', 'presets', PRESET_ID)

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
    writeFull(targetDir, distHash)
    process.stdout.write(`[dsh-extra-plan] 预设已升级为新版本 → ${targetDir}\n`)
    return 'upgraded'
  }
  writeFull(targetDir, distHash)
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
