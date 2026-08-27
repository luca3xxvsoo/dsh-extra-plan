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

const HERE = dirname(fileURLToPath(import.meta.url))
// scripts/ -> 包根；包根 -> @local；-> node_modules；-> profile 目录
const PACKAGE_ROOT = join(HERE, '..')
const DIST_TARGET = join(PACKAGE_ROOT, '..', '..', '@tencent-connect', 'dsh-qqbot', 'dist')
const PATCHES = join(PACKAGE_ROOT, 'patches', '@tencent-connect-dsh-qqbot', 'dist')
const PROFILE_DIR = join(PACKAGE_ROOT, '..', '..', '..')

const TARGETS = [
  ['gateway/bootstrap.js'],
  ['transport/outbound.js'],
]

// im-qqbot 模板条目骨架（preset 为目的；凭据由用户填写）
const IM_QQBOT_BLOCK = `- id: im-qqbot
  config:
    preset: extra-plan
`

function sameContent(a, b) {
  if (!existsSync(a) || !existsSync(b)) return false
  try { return readFileSync(a).equals(readFileSync(b)) } catch { return false }
}

/**
 * 字段级合并：确保 im-qqbot 条目含 config.preset: extra-plan。
 * - 无条目 → 追加骨架；
 * - 有条目无 preset → 仅插入 preset 键（appId/appSecret 等现有行零改动）；
 * - 有条目已有任意 preset → 原样返回。
 */
function ensureImQqbotEntry(content) {
  const lines = content.split('\n')
  let start = -1
  for (let i = 0; i < lines.length; i += 1) {
    if (/^\s*-\s*id:\s*['"]?im-qqbot['"]?\s*$/.test(lines[i])) { start = i; break }
  }
  if (start === -1) {
    const sep = content.trim().length === 0 ? '' : (content.endsWith('\n') ? '' : '\n')
    return content + sep + IM_QQBOT_BLOCK
  }
  // 条目块范围：起始行到下一个顶层条目行（`- ` 顶格）或文件尾
  let end = lines.length
  for (let i = start + 1; i < lines.length; i += 1) {
    if (/^-\s/.test(lines[i])) { end = i; break }
  }
  // 已有任何 preset 键 → 不动
  for (let i = start + 1; i < end; i += 1) {
    if (/^\s+preset:\s/.test(lines[i])) return content
  }
  // 找 config: 容器（行内键，允许任意缩进匹配）
  for (let i = start + 1; i < end; i += 1) {
    const m = /^(\s*)config:\s*$/.exec(lines[i])
    if (m) {
      const keyIndent = `${m[1]}  `
      lines.splice(i + 1, 0, `${keyIndent}preset: extra-plan`)
      return lines.join('\n')
    }
  }
  // 无 config 容器：在 id 行后补 config 块
  const idIndent = (/^(\s*)-/.exec(lines[start]) ?? ['', ''])[1]
  lines.splice(start + 1, 0, `${idIndent}  config:`, `${idIndent}    preset: extra-plan`)
  return lines.join('\n')
}

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
