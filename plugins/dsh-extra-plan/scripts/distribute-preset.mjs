// @local/dsh-extra-plan postinstall entry.
// The installation path and startup self-healing intentionally share syncPreset.

import { homedir } from 'node:os'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { syncPreset } from '../lib/preset-sync.js'

function messageFor(action, targetDir) {
  if (action === 'idle') return '[dsh-extra-plan] 预设已是当前发行，用户改动保留（同版本重装）→ ' + targetDir + '\n'
  if (action === 'upgraded') return '[dsh-extra-plan] 预设已升级为新版本 → ' + targetDir + '\n'
  return '[dsh-extra-plan] 预设「按需规划模式」已分发（安装时一次性）→ ' + targetDir + '\n'
}

/** 安装时委派统一生产状态机，并保留三态提示。 */
export function distribute(dshHome) {
  const action = syncPreset(dshHome)
  const targetDir = join(dshHome, '.agent-presets', 'extra-plan')
  process.stdout.write(messageFor(action, targetDir))
  return action
}

const invokedAsMain = (() => {
  if (!process.argv[1]) return false
  const called = resolve(process.argv[1])
  const self = fileURLToPath(import.meta.url)
  return process.platform === 'win32' ? called.toLowerCase() === self.toLowerCase() : called === self
})()

if (invokedAsMain) {
  const dshHome = process.env.DSH_HOME === undefined || process.env.DSH_HOME === ''
    ? join(homedir(), '.dsh')
    : process.env.DSH_HOME
  try {
    distribute(dshHome)
  } catch (error) {
    process.stderr.write('[dsh-extra-plan] 预设分发失败（不阻断安装）：' + (error instanceof Error ? error.message : String(error)) + '\n')
    process.exit(0)
  }
}
