// QQBot 兼容 CLI fallback，供手动或安装器触发执行。
// invokedAsMain 使用 DSH_HOME（默认 ~/.dsh）；成功输出摘要，失败写入 stderr，
// 仍以 exit 0 结束，确保安装/启动不被阻断。
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
