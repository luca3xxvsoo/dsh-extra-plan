// @local/dsh-qqbot-user-questions（精简版 v2.0.0）
// 仅启动自愈两件事（幂等、静默、不阻断、零 UI 入口）：
//   1) 给本插件所在 qqbot profile 的 cordis.patch.yml 补 code-runtime/agent-presets 两行
//   2) 建本 profile node_modules/@local/dsh-extra-plan → web profile 同名包的链接
// 问答/审批等旧能力由 dsh-qqbot 0.5.0 原生 question-channel/approval-channel 承担。
import { homedir } from 'node:os'
import { join } from 'node:path'
import { healQqbotCompatibility } from './lib/heal.js'

export const name = 'dsh-qqbot-user-questions'
export const inject = []

export function apply() {
  try {
    // 镜像旧版建链脚本 L12：DSH_HOME env 优先，默认 ~/.dsh
    const home = process.env.DSH_HOME || join(homedir(), '.dsh')
    healQqbotCompatibility(home)
  } catch (err) {
    // 自愈不阻断启动
    console.warn('[dsh-qqbot-user-questions] 自愈失败（不阻断启动）: ' + (err instanceof Error ? err.message : String(err)))
  }
}
