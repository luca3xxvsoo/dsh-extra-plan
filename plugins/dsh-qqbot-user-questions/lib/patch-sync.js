// host 平面自愈组件：dsh 启动时幂等执行「官方包补丁核对 + im-qqbot 条目保证」，
// 与 scripts/apply-patch.mjs（postinstall 一次性）同构，作为启动兜底（pnpm 跳过构建时重启后自动就位）：
// - 官方包 @tencent-connect/dsh-qqbot 在 profile node_modules 已就位 → 目标文件尚未补丁
//   （无 .orig 备份或内容未改）则应用补丁（保留 .orig）；
// - 官方包缺失 → 静默跳过补丁（下次启动再试），绝不报错；
// - im-qqbot 条目保证照 apply-patch.mjs 三路幂等（无条目追加骨架 / 有条目插 preset / 已有不动），
//   不依赖官方包，始终执行；
// 任何异常只静默跳过（不阻断 profile 启动）。
import { copyFileSync, existsSync, readFileSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { ensureImQqbotEntry, sameContent, TARGETS } from './patch-shared.js'

const HERE = dirname(fileURLToPath(import.meta.url))
const PATCHES = join(HERE, '..', 'patches', '@tencent-connect-dsh-qqbot', 'dist')

/**
 * 运行一次补丁核对（导出便于单测）。官方包缺失时仅跳过补丁部分，条目保证照常执行。
 * @param {string} profileDir qqbot profile 目录（DSH_HOME/profiles/qqbot）
 * @returns 'patched' | 'no-package' | 'idle'
 */
export function syncPatch(profileDir) {
  const dist = join(profileDir, 'node_modules', '@tencent-connect', 'dsh-qqbot', 'dist')
  // ── 第一步：官方包改点（官方包未装则跳过） ──────────────────────────────────
  const missing = TARGETS.filter(([rel]) => !existsSync(join(dist, rel)))
  let changedAny = false
  if (missing.length === 0) {
    for (const [rel] of TARGETS) {
      const target = join(dist, rel)
      const patch = join(PATCHES, rel)
      const orig = `${target}.orig`
      if (existsSync(orig) || sameContent(target, patch)) continue
      copyFileSync(target, orig)
      copyFileSync(patch, target)
      changedAny = true
    }
  }
  // ── 第二步：用户层 cordis.patch.yml 的 im-qqbot 条目（不依赖官方包） ─────────
  const userPatchPath = join(profileDir, 'cordis.patch.yml')
  if (existsSync(userPatchPath)) {
    const content = readFileSync(userPatchPath, 'utf8')
    const merged = ensureImQqbotEntry(content)
    if (merged !== content) writeFileSync(userPatchPath, merged)
  }
  if (changedAny) return 'patched'
  return missing.length > 0 ? 'no-package' : 'idle'
}

export const name = 'qqbot-patch-sync'
export const inject = []

export function apply() {
  try {
    const home = process.env.DSH_HOME === undefined || process.env.DSH_HOME === ''
      ? join(homedir(), '.dsh')
      : process.env.DSH_HOME
    syncPatch(join(home, 'profiles', 'qqbot'))
  } catch {
    /* 静默：自愈失败不阻断启动 */
  }
}
