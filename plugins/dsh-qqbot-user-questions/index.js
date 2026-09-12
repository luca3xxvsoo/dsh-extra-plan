// @local/dsh-qqbot-user-questions（精简版 v2.0.0）
// apply 在启动时做两件幂等、静默、不阻断、零 UI 入口的事：
//   1) 迁移旧版 cordis.patch.yml 根级 code-runtime/agent-presets 错误块（只清理这两个 id；静态 insert 不属迁移对象）
//   2) 建本 profile node_modules/@local/dsh-extra-plan → web profile 同名包的链接
// code-runtime/agent-presets 两行（连同本插件行与 cordis-host-runner 行）由包内静态 cordis.patch.yml 的
// 根级 insert 提供，运行期不补行；CLI 兜底同 lib/heal.js 的 healPatchRows/ensureDshExtraPlanLink。
// 问答/审批能力已删，由 dsh-qqbot 0.5.0 原生 question-channel/approval-channel 承担。
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
