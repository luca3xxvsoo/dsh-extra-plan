// @local/dsh-extra-plan postinstall entry.
//
// dsh 0.1.7-rc.1 载体订正：postinstall 不再分发预设内容（profile patch 声明行才是载体，
// 且 .agent-presets/extra-plan 已无任何读取方）。此处只做插件自有状态目录的轻量初始化：
// $DSH_HOME/.agent-presets/extra-plan/dist-manifest.json（迁移审计台账，format=2、空）。
// 预设内容迁移与启动自愈收敛到 lib/preset-sync.js 的 apply（经 configEditor.edit）。
// 失败仍不阻断安装。

import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { initStateDir, stateDirOf } from '../lib/preset-sync.js'
import { defaultDshHome } from '../lib/preset-sync.js'

function messageFor(action, targetDir) {
  if (action === 'idle') return '[dsh-extra-plan] 预设状态目录已就位（同版本重装，用户改动保留）→ ' + targetDir + '\n'
  return '[dsh-extra-plan] 预设状态目录已初始化（预设本体由 profile patch 声明行承载，随 bundle patch 装载）→ ' + targetDir + '\n'
}

/** 安装时初始化插件自有状态目录；返回 'written' | 'idle'。 */
export function distribute(dshHome) {
  const result = initStateDir(dshHome)
  process.stdout.write(messageFor(result.action, stateDirOf(dshHome)))
  return result.action
}

const invokedAsMain = (() => {
  if (!process.argv[1]) return false
  const called = resolve(process.argv[1])
  const self = fileURLToPath(import.meta.url)
  return process.platform === 'win32' ? called.toLowerCase() === self.toLowerCase() : called === self
})()

if (invokedAsMain) {
  try {
    distribute(defaultDshHome())
  } catch (error) {
    process.stderr.write('[dsh-extra-plan] 预设状态目录初始化失败（不阻断安装）：' + (error instanceof Error ? error.message : String(error)) + '\n')
    process.exit(0)
  }
}
