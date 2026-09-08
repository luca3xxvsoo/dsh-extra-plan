import { existsSync, lstatSync, mkdirSync, rmSync, symlinkSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'

/**
 * 确保 qqbot profile 的 dsh-extra-plan 指向 web profile 的同名包。
 * web 缺失时跳过；已有链接保持不动；实体目录按既有规则替换。
 * 所有异常仅记录日志，不阻断安装或插件启动。
 */
export function ensureDshExtraPlanLink() {
  try {
    const home = process.env.DSH_HOME || join(homedir(), '.dsh')
    const webPkg = join(home, 'profiles', 'web', 'node_modules', '@local', 'dsh-extra-plan')
    const qqPkg = join(home, 'profiles', 'qqbot', 'node_modules', '@local', 'dsh-extra-plan')

    if (!existsSync(webPkg)) {
      console.warn('[dsh-qqbot-user-questions] 未找到 web 的 dsh-extra-plan，跳过映射')
      return
    }

    let hasQqPkg = false
    try {
      const stat = lstatSync(qqPkg)
      hasQqPkg = true
      if (stat.isSymbolicLink()) return
    } catch (err) {
      if (err && err.code !== 'ENOENT') throw err
    }

    if (!hasQqPkg) {
      mkdirSync(join(home, 'profiles', 'qqbot', 'node_modules', '@local'), { recursive: true })
      symlinkSync(webPkg, qqPkg, process.platform === 'win32' ? 'junction' : 'dir')
      console.log('[dsh-qqbot-user-questions] 已建立映射: qqbot → web')
      return
    }

    rmSync(qqPkg, { recursive: true, force: true })
    symlinkSync(webPkg, qqPkg, process.platform === 'win32' ? 'junction' : 'dir')
    console.log('[dsh-qqbot-user-questions] 旧版目录已替换为映射')
  } catch (err) {
    console.error('[dsh-qqbot-user-questions] 映射建立失败:', err.message)
  }
}
