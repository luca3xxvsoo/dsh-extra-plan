import { existsSync, lstatSync, mkdirSync, realpathSync, symlinkSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'

/**
 * 确保 qqbot profile 的 dsh-extra-plan 指向 web profile 的同名包。
 * web 缺失时跳过；已有正确链接保持不动；实体目录或非目标链接保留并提示迁移。
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

    try {
      const stat = lstatSync(qqPkg)
      if (stat.isSymbolicLink()) {
        try {
          if (realpathSync(qqPkg) === realpathSync(webPkg)) return
        } catch {}
        console.warn('[dsh-qqbot-user-questions] qqbot 目标已存在非目标链接，保留原状；请通过 pnpm 完成迁移后重试')
        return
      }
      console.warn('[dsh-qqbot-user-questions] qqbot 目标已存在实体对象，保留原状；请通过 pnpm 完成迁移后重试')
      return
    } catch (err) {
      if (err && err.code !== 'ENOENT') throw err
    }

    mkdirSync(join(home, 'profiles', 'qqbot', 'node_modules', '@local'), { recursive: true })
    symlinkSync(webPkg, qqPkg, process.platform === 'win32' ? 'junction' : 'dir')
    console.log('[dsh-qqbot-user-questions] 已建立映射: qqbot → web')
  } catch (err) {
    console.error('[dsh-qqbot-user-questions] 映射建立失败:', err.message)
  }
}
