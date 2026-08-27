// @local/dsh-qqbot-user-questions postinstall —— 安装完成时自动完成两件事：
//   1) 应用对 @tencent-connect/dsh-qqbot 的两处改点（官方包缺失则跳过，由用户自行负责）；
//   2) 确保用户层 <profile>/cordis.patch.yml 的 im-qqbot 条目含 preset: extra-plan：
//      - 无 im-qqbot 条目 → 追加完整骨架（id + config.preset + 提示填凭据）；
//      - 已存在条目但缺 preset 键 → 仅插入 `preset: extra-plan`（appId/appSecret 行零改动）；
//      - 已存在任意 preset 值 → 不动（用户显式配置优先）。
// 由 package.json scripts.postinstall 触发（pnpm add 下载安装完成时执行，先于任何启动）。
//
// 定位：本脚本位于安装现场 <profile>/node_modules/@local/dsh-qqbot-user-questions/scripts/，
// 反推可得 <profile>/node_modules（两层）与 <profile>（三层，profile 的 cordis.patch.yml）。
//
// 行为（幂等、静默）：仅在实际变更时打印对应说明，其余静默；用户层文件不存在则跳过。
import { existsSync, copyFileSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { ensureImQqbotEntry, sameContent, TARGETS } from '../lib/patch-shared.js'

const HERE = dirname(fileURLToPath(import.meta.url))
// scripts/ -> 包根；包根 -> @local；-> node_modules；-> profile 目录
const PACKAGE_ROOT = join(HERE, '..')
const DIST_TARGET = join(PACKAGE_ROOT, '..', '..', '@tencent-connect', 'dsh-qqbot', 'dist')
const PATCHES = join(PACKAGE_ROOT, 'patches', '@tencent-connect-dsh-qqbot', 'dist')
const PROFILE_DIR = join(PACKAGE_ROOT, '..', '..', '..')

// ── 第一步：官方包改点（官方包未装则跳过） ──────────────────────────────────────
const missing = TARGETS.filter(([rel]) => !existsSync(join(DIST_TARGET, rel)))
if (missing.length === 0) {
  let changedAny = false
  for (const [rel] of TARGETS) {
    const target = join(DIST_TARGET, rel)
    const patch = join(PATCHES, rel)
    const orig = `${target}.orig`
    if (existsSync(orig) || sameContent(target, patch)) continue
    copyFileSync(target, orig)
    copyFileSync(patch, target)
    changedAny = true
  }
  if (changedAny) {
    process.stdout.write(`[dsh-qqbot-user-questions] 已应用改点（备份见 .orig）：${DIST_TARGET}\n`)
  }
}

// ── 第二步：用户层 cordis.patch.yml 的 im-qqbot 条目（不依赖官方包） ───────────────
const userPatchPath = join(PROFILE_DIR, 'cordis.patch.yml')
if (existsSync(userPatchPath)) {
  const content = readFileSync(userPatchPath, 'utf8')
  const merged = ensureImQqbotEntry(content)
  if (merged !== content) {
    writeFileSync(userPatchPath, merged)
    process.stdout.write(`[dsh-qqbot-user-questions] 已确保 ${userPatchPath} 的 im-qqbot 条目含 preset: extra-plan（凭据行未改动，请按需填写 appId/appSecret 后重启 DSH）\n`)
  }
}
