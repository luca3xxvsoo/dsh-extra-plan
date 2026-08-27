// scripts/apply-patch.mjs（postinstall 一次性）与 lib/patch-sync.js（host 启动自愈兜底）
// 共享的补丁逻辑：两处路径推导不同（安装现场反推 / DSH_HOME/profiles/qqbot），
// 故只共享无路径依赖的常量与纯函数。
import { existsSync, readFileSync } from 'node:fs'

/** 官方包改点目标（相对 @tencent-connect/dsh-qqbot/dist 与 patches/.../dist 的路径）。 */
export const TARGETS = [
  ['gateway/bootstrap.js'],
  ['transport/outbound.js'],
]

// im-qqbot 模板条目骨架（preset 为目的；凭据由用户填写）
export const IM_QQBOT_BLOCK = `- id: im-qqbot
  config:
    preset: extra-plan
`

export function sameContent(a, b) {
  if (!existsSync(a) || !existsSync(b)) return false
  try { return readFileSync(a).equals(readFileSync(b)) } catch { return false }
}

/**
 * 字段级合并：确保 im-qqbot 条目含 config.preset: extra-plan。
 * - 无条目 → 追加骨架；
 * - 有条目无 preset → 仅插入 preset 键（appId/appSecret 等现有行零改动）；
 * - 有条目已有任意 preset → 原样返回。
 */
export function ensureImQqbotEntry(content) {
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
