// QQBot 兼容 apply：逐 profile 只清理完整的根级旧块，然后确保 web 包链接。
// DSH_HOME 环境变量优先于 ~/.dsh；操作幂等且失败不阻断启动。
// 静态 insert 行来自包 patch；question/approval 行为由原生 QQBot 负责。
import { homedir } from 'node:os'
import { join } from 'node:path'
import { healQqbotCompatibility } from './lib/heal.js'

export const name = 'dsh-qqbot-user-questions'
export const inject = []

export function apply() {
  try {
    // DSH_HOME 环境变量优先；默认值为 ~/.dsh。
    const home = process.env.DSH_HOME || join(homedir(), '.dsh')
    healQqbotCompatibility(home)
  } catch (err) {
    // 自愈不阻断启动
    console.warn('[dsh-qqbot-user-questions] 自愈失败（不阻断启动）: ' + (err instanceof Error ? err.message : String(err)))
  }
}
