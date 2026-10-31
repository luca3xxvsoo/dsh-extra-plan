// QQBot 兼容 apply：逐 profile 只清理完整的根级旧块，然后确保 web 包链接。
// 仅使用Host明确提供的 profileContext.home 或 dshHomePath()；缺根不猜用户目录。
// 静态 insert 行来自包 patch；question/approval 行为由原生 QQBot 负责。
import { healQqbotCompatibility, resolveQqbotHostRoot } from './lib/heal.js'

export const name = 'dsh-extra-plan-qqbot'
export const inject = []

export function apply(ctx) {
  try {
    const resolved = resolveQqbotHostRoot(ctx)
    if (!resolved.root) {
      console.warn('[dsh-extra-plan-qqbot] 自愈跳过（缺少明确Host根）: ' + JSON.stringify(resolved))
      return
    }
    if (resolved.profileIdentityState !== 'valid' || resolved.profileKind !== 'qqbot' || typeof resolved.profileName !== 'string') {
      console.warn('[dsh-extra-plan-qqbot] 自愈跳过（当前profile非明确QQ目标）: ' + JSON.stringify({
        profileName: resolved.profileName,
        startedBundles: resolved.startedBundles,
        profileKind: resolved.profileKind,
        profileIdentityState: resolved.profileIdentityState,
        profileIdentityReason: resolved.profileIdentityReason,
      }))
      return
    }
    const result = healQqbotCompatibility(resolved.root, { profileNames: [resolved.profileName] })
    for (const item of result.failed || []) console.warn('[dsh-extra-plan-qqbot] 自愈失败摘要: ' + JSON.stringify(item))
    if (result.error) console.warn('[dsh-extra-plan-qqbot] 自愈异常摘要: ' + JSON.stringify({ error: result.error }))
  } catch (error) {
    // 自愈不阻断启动
    console.warn('[dsh-extra-plan-qqbot] 自愈失败（不阻断启动）: ' + (error instanceof Error ? error.message : String(error)))
  }
}
