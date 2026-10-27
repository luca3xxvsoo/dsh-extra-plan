// QQBot 安装/启动兼容 CLI：--install 是严格安装入口；无参仍为不阻断的手动/启动兜底。
// 严格安装只接受绝对 DSH_HOME（或默认 ~/.dsh），并在唯一目标、Web 源和最终链接核验通过后报告完成。
// 无参分支保留告警/exit 0；模块导入不触发自愈。
import { existsSync, lstatSync, readFileSync, realpathSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, isAbsolute, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { findOwnQqbotProfiles, healQqbotCompatibility, sameRealPath } from '../lib/heal.js'

const invokedAsMain = (() => {
  if (!process.argv[1]) return false
  const called = resolve(process.argv[1])
  const self = fileURLToPath(import.meta.url)
  return sameRealPath(called, self)
})()

function installFailure(reason, detail) {
  const output = { reason }
  if (detail !== undefined) output.detail = detail
  return { error: output }
}

function strictInstall(dshHome) {
  const packageRoot = realpathSync(resolve(dirname(fileURLToPath(import.meta.url)), '..'))
  const webPkg = join(dshHome, 'profiles', 'web', 'node_modules', 'dsh-extra-plan')
  if (!existsSync(webPkg)) return installFailure('web-source-missing', webPkg)
  let webManifest
  try {
    webManifest = JSON.parse(readFileSync(join(webPkg, 'package.json'), 'utf8'))
  } catch (error) {
    return installFailure('web-manifest-unreadable', error instanceof Error ? error.message : String(error))
  }
  if (webManifest?.name !== 'dsh-extra-plan') return installFailure('web-manifest-name', webManifest?.name)
  let webRealPath
  try {
    webRealPath = realpathSync(webPkg)
  } catch (error) {
    return installFailure('web-source-unresolved', error instanceof Error ? error.message : String(error))
  }

  const candidates = findOwnQqbotProfiles(dshHome)
  const matches = []
  const unresolved = []
  for (const profileName of candidates) {
    const candidatePkg = join(dshHome, 'profiles', profileName, 'node_modules', 'dsh-extra-plan-qqbot')
    try {
      const candidateRoot = realpathSync(candidatePkg)
      if (sameRealPath(candidateRoot, packageRoot)) matches.push(profileName)
    } catch (error) {
      unresolved.push({ profile: profileName, reason: error instanceof Error ? error.message : String(error) })
    }
  }
  if (unresolved.length > 0) return installFailure('candidate-root-unresolved', unresolved)
  if (matches.length !== 1) return installFailure('target-count', { count: matches.length, candidates, matches })
  const profileName = matches[0]
  const targetPkg = join(dshHome, 'profiles', profileName, 'node_modules', 'dsh-extra-plan')
  let targetStat = null
  try {
    targetStat = lstatSync(targetPkg)
  } catch (error) {
    if (error?.code !== 'ENOENT') return installFailure('target-unreadable', error instanceof Error ? error.message : String(error))
  }
  if (targetStat !== null) {
    if (!targetStat.isSymbolicLink()) return installFailure('target-entity', targetPkg)
    let targetRealPath
    try {
      targetRealPath = realpathSync(targetPkg)
    } catch (error) {
      return installFailure('target-link-unresolved', error instanceof Error ? error.message : String(error))
    }
    if (!sameRealPath(targetRealPath, webRealPath)) return installFailure('target-other-link', targetRealPath)
  }

  const result = healQqbotCompatibility(dshHome, { profileNames: [profileName] })
  if (result.error) return installFailure('heal-error', result.error)
  if (result.profiles.length !== 1 || result.count !== 1 || result.results.length !== 1 || result.profiles[0] !== profileName) {
    return installFailure('heal-target-mismatch', { profiles: result.profiles, count: result.count })
  }
  const summary = result.results[0]
  const patch = summary.patch
  const patchValid = patch && (patch.status === 'idempotent' || patch.status === 'migrated' || (patch.status === 'skipped' && patch.reason === 'no-file'))
  if (!patchValid) return installFailure('patch-failed', patch)
  const link = summary.link
  if (!link || (link.status !== 'linked' && link.status !== 'up-to-date')) return installFailure('link-failed', link)

  let finalStat
  let finalSource
  let finalTarget
  try {
    finalStat = lstatSync(targetPkg)
    finalSource = realpathSync(webPkg)
    finalTarget = realpathSync(targetPkg)
  } catch (error) {
    return installFailure('final-link-check-failed', error instanceof Error ? error.message : String(error))
  }
  if (!finalStat.isSymbolicLink()) return installFailure('final-target-not-link', targetPkg)
  if (!sameRealPath(finalSource, finalTarget)) return installFailure('final-realpath-mismatch', { source: finalSource, target: finalTarget })
  return { profile: profileName, patch: patch.status, link: link.status }
}

function reportInstallFailure(failure) {
  process.stderr.write('[dsh-extra-plan-qqbot] 严格安装失败: ' + JSON.stringify(failure) + '\n')
  process.exitCode = 1
}

if (invokedAsMain) {
  const installMode = process.argv.slice(2).includes('--install')
  const configuredHome = process.env.DSH_HOME
  const dshHome = configuredHome || join(homedir(), '.dsh')
  if (installMode) {
    if (configuredHome && !isAbsolute(configuredHome)) {
      reportInstallFailure({ reason: 'dsh-home-not-absolute', detail: configuredHome })
    } else {
      try {
        const result = strictInstall(dshHome)
        if (result.error) reportInstallFailure(result.error)
        else process.stdout.write('[dsh-extra-plan-qqbot] 严格安装完成: ' + JSON.stringify(result) + '\n')
      } catch (error) {
        reportInstallFailure({ reason: 'install-exception', detail: error instanceof Error ? error.message : String(error) })
      }
    }
  } else {
    try {
      const result = healQqbotCompatibility(dshHome)
      const names = result.profiles.length === 0 ? '无' : result.profiles.join(', ')
      for (const item of result.failed || []) process.stderr.write('[dsh-extra-plan-qqbot] 自愈失败摘要: ' + JSON.stringify(item) + '\n')
      if (result.error) process.stderr.write('[dsh-extra-plan-qqbot] 自愈异常摘要: ' + JSON.stringify({ error: result.error }) + '\n')
      process.stdout.write('[dsh-extra-plan-qqbot] 自愈完成（自愈 profile：' + names + '）\n')
    } catch (error) {
      process.stderr.write('[dsh-extra-plan-qqbot] 自愈失败（不阻断安装）：' + (error instanceof Error ? error.message : String(error)) + '\n')
      process.exit(0)
    }
  }
}
