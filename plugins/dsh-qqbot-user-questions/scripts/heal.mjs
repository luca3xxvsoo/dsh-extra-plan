// @local/dsh-qqbot-user-questions CLI 兜底入口（postinstall 与手动触发共用）。
// invokedAsMain 判定镜像 scripts/distribute-preset.mjs L23-30；DSH_HOME env 优先、默认 ~/.dsh；
// 调 healQqbotCompatibility 自愈；成功打印一行摘要、异常打印 stderr 后 process.exit(0)（不阻断安装）。
import { homedir } from 'node:os'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { healQqbotCompatibility } from '../lib/heal.js'

const invokedAsMain = (() => {
  if (!process.argv[1]) return false
  const called = resolve(process.argv[1])
  const self = fileURLToPath(import.meta.url)
  return process.platform === 'win32' ? called.toLowerCase() === self.toLowerCase() : called === self
})()

if (invokedAsMain) {
  const dshHome = process.env.DSH_HOME || join(homedir(), '.dsh')
  try {
    const result = healQqbotCompatibility(dshHome)
    const names = result.profiles.length === 0 ? '无' : result.profiles.join(', ')
    process.stdout.write('[dsh-qqbot-user-questions] 自愈完成（自愈 profile：' + names + '）\n')
  } catch (error) {
    process.stderr.write('[dsh-qqbot-user-questions] 自愈失败（不阻断安装）：' + (error instanceof Error ? error.message : String(error)) + '\n')
    process.exit(0)
  }
}
