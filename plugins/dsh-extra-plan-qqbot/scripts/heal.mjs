// QQBot 安装/启动兼容 CLI：--install 是严格安装入口；无参仅帮助，维护测试需显式根与profile。
// 严格安装只接受显式绝对 DSH_HOME，并在唯一目标、Web 源和最终链接核验通过后报告完成。
// 无参不因继承 DSH_HOME自愈；显式维护测试固定dryRun零写；模块导入不触发自愈。
import { lstatSync, readFileSync, realpathSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createPathContext, resolveHostPath, validateReadTarget } from '../lib/path-policy.js'
import { findOwnQqbotProfiles, healQqbotCompatibility, sameRealPath } from '../lib/heal.js'

const nativeRealpathSync = typeof realpathSync.native === 'function' ? realpathSync.native : realpathSync

function isLinkEntity(path, stat) {
  if (stat.isSymbolicLink()) return true
  if (process.platform !== 'win32' || !stat.isDirectory()) return false
  try { return !sameRealPath(nativeRealpathSync(path), path) } catch { return false }
}

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

function patchAllowsInstall(patch) {
  return patch && (patch.status === 'idempotent' || patch.status === 'preserved' || (patch.status === 'skipped' && patch.reason === 'no-file'))
}

function errorText(error) {
  return error instanceof Error ? error.message : String(error)
}

function isMissingError(error) {
  return error !== null && typeof error === 'object' && (error.code === 'ENOENT' || error.code === 'ENOTDIR' || error.code === 'TARGET_MISSING')
}

function createInstallAccess(dshHome) {
  const context = createPathContext({ hostDataRoot: dshHome })
  const root = validateReadTarget(context, resolveHostPath(context, '.', { purpose: 'qqbot-install-root' }), { expectedType: 'directory' })
  return { context, root }
}

function readInstallJson(access, value, purpose) {
  const checked = validateReadTarget(access.context, resolveHostPath(access.context, value, { purpose }), { expectedType: 'file' })
  return { target: checked, value: JSON.parse(readFileSync(checked.path, 'utf8')) }
}

function strictInstall(dshHome) {
  let access
  try {
    access = createInstallAccess(dshHome)
  } catch (error) {
    return installFailure('dsh-home-unavailable', { code: error?.code, detail: errorText(error) })
  }
  const packageRoot = nativeRealpathSync(resolve(dirname(fileURLToPath(import.meta.url)), '..'))
  const webTarget = resolveHostPath(access.context, join('profiles', 'web', 'node_modules', 'dsh-extra-plan'), { purpose: 'qqbot-install-source' })
  let webChecked
  try {
    webChecked = validateReadTarget(access.context, webTarget, { expectedType: 'directory' })
  } catch (error) {
    return installFailure(isMissingError(error) ? 'web-source-missing' : 'web-source-unavailable', isMissingError(error) ? webTarget.path : errorText(error))
  }
  let webManifest
  try {
    webManifest = readInstallJson(access, join(webChecked.path, 'package.json'), 'qqbot-install-web-manifest').value
  } catch (error) {
    return installFailure('web-manifest-unreadable', errorText(error))
  }
  if (webManifest?.name !== 'dsh-extra-plan') return installFailure('web-manifest-name', webManifest?.name)
  const webRealPath = webChecked.realPath

  const candidates = findOwnQqbotProfiles(dshHome, { context: access.context })
  if (candidates.status === 'unavailable') {
    return installFailure('candidate-discovery-failed', {
      reason: candidates.reason,
      diagnostics: candidates.diagnostics,
      candidateCount: candidates.candidateCount,
      candidateLimit: candidates.candidateLimit,
    })
  }
  const matches = []
  const unresolved = []
  for (const profileName of candidates) {
    const candidateTarget = resolveHostPath(access.context, join('profiles', profileName, 'node_modules', 'dsh-extra-plan-qqbot'), { purpose: 'qqbot-install-entry' })
    try {
      const candidateRoot = nativeRealpathSync(candidateTarget.path)
      if (sameRealPath(candidateRoot, packageRoot)) matches.push(profileName)
    } catch (error) {
      unresolved.push({ profile: profileName, reason: errorText(error) })
    }
  }
  if (unresolved.length > 0) return installFailure('candidate-root-unresolved', unresolved)
  if (matches.length !== 1) return installFailure('target-count', { count: matches.length, candidates, matches })
  const profileName = matches[0]
  const target = resolveHostPath(access.context, join('profiles', profileName, 'node_modules', 'dsh-extra-plan'), { purpose: 'qqbot-install-link' })
  let targetStat = null
  try {
    targetStat = lstatSync(target.path)
  } catch (error) {
    if (error?.code !== 'ENOENT' && error?.code !== 'ENOTDIR') return installFailure('target-unreadable', errorText(error))
  }
  if (targetStat !== null) {
    if (!isLinkEntity(target.path, targetStat)) return installFailure('target-entity', target.path)
    let targetRealPath
    try {
      targetRealPath = nativeRealpathSync(target.path)
    } catch (error) {
      return installFailure('target-link-unresolved', errorText(error))
    }
    if (!sameRealPath(targetRealPath, webRealPath)) return installFailure('target-other-link', targetRealPath)
  }

  const installOptions = { profileNames: [profileName], context: access.context, strict: true }
  const isSelected = (result) => result.profiles.length === 1 && result.count === 1 && result.results.length === 1 && result.profiles[0] === profileName
  const preflight = healQqbotCompatibility(dshHome, { ...installOptions, dryRun: true })
  if (preflight.error) return installFailure('preflight-error', preflight.error)
  if (!isSelected(preflight)) return installFailure('preflight-target-mismatch', { profiles: preflight.profiles, count: preflight.count })
  const preflightSummary = preflight.results[0]
  if (!patchAllowsInstall(preflightSummary.patch)) return installFailure('patch-preflight-failed', preflightSummary.patch)
  const preflightLink = preflightSummary.link
  if (!preflightLink || (preflightLink.status !== 'planned' && preflightLink.status !== 'up-to-date')) return installFailure('link-preflight-failed', preflightLink)

  const result = healQqbotCompatibility(dshHome, installOptions)
  const summary = result.results.find((item) => item.profile === profileName)
  const link = summary?.link
  const fail = (reason, detail) => {
    // patch 仅只读诊断；唯一可恢复的副作用是本轮成功创建的映射。
    if (typeof link?.rollback !== 'function') return installFailure(reason, detail)
    return installFailure(reason, { failure: detail, rollback: link.rollback() })
  }
  if (result.error) return fail('heal-error', result.error)
  if (!isSelected(result)) return fail('heal-target-mismatch', { profiles: result.profiles, count: result.count })
  const patch = summary.patch
  if (!patchAllowsInstall(patch)) return fail('patch-failed', patch)
  if (!link || (link.status !== 'linked' && link.status !== 'up-to-date')) return fail('link-failed', link)

  let finalStat
  let finalSource
  let finalTarget
  try {
    finalStat = lstatSync(target.path)
    finalSource = validateReadTarget(access.context, webTarget, { expectedType: 'directory' }).realPath
    finalTarget = nativeRealpathSync(target.path)
  } catch (error) {
    return fail('final-link-check-failed', errorText(error))
  }
  if (!isLinkEntity(target.path, finalStat)) return fail('final-target-not-link', target.path)
  if (!sameRealPath(finalSource, webRealPath) || !sameRealPath(finalSource, finalTarget)) return fail('final-realpath-mismatch', { source: finalSource, target: finalTarget })
  return { profile: profileName, patch: patch.status, link: link.status }
}

function reportInstallFailure(failure) {
  process.stderr.write('[dsh-extra-plan-qqbot] 严格安装失败: ' + JSON.stringify(failure) + '\n')
  process.exitCode = 1
}

function printHelp() {
  process.stdout.write([
    '用法:',
    '  node scripts/heal.mjs',
    '  node scripts/heal.mjs --host-root <绝对路径> --profile <profile> [--dry-run]',
    '  DSH_HOME=<绝对路径> node scripts/heal.mjs --install',
    '规则: 无参仅提示，不因继承 DSH_HOME 执行自愈。',
    '维护测试必须同时显式 --host-root 与 --profile，且固定 dryRun、零Host写。',
    '--install 是明确部署入口；预检失败零写，发布后失败仅恢复可确认的本轮链接；来源不明的 patch 条目原样保留。',
  ].join('\n') + '\n')
}

function parseArguments(args) {
  const parsed = { help: false, install: false, dryRun: false, hostRoot: null, profile: null }
  const seen = new Set()
  const setOnce = (key, value) => {
    if (seen.has(key)) throw new Error('duplicate-' + key)
    seen.add(key)
    parsed[key] = value
  }
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index]
    if (arg === '--help' || arg === '-h') {
      setOnce('help', true)
      continue
    }
    if (arg === '--install') {
      setOnce('install', true)
      continue
    }
    if (arg === '--dry-run') {
      setOnce('dryRun', true)
      continue
    }
    if (arg === '--host-root' || arg.startsWith('--host-root=')) {
      const value = arg === '--host-root' ? args[++index] : arg.slice('--host-root='.length)
      if (typeof value !== 'string' || value === '' || value.startsWith('--')) throw new Error('host-root-value-required')
      setOnce('hostRoot', value)
      continue
    }
    if (arg === '--profile' || arg.startsWith('--profile=')) {
      const value = arg === '--profile' ? args[++index] : arg.slice('--profile='.length)
      if (typeof value !== 'string' || value === '' || value.startsWith('--')) throw new Error('profile-value-required')
      setOnce('profile', value)
      continue
    }
    throw new Error('unknown-argument:' + arg)
  }
  if (parsed.help && args.length !== 1) throw new Error('help-conflict')
  if (parsed.install && (parsed.hostRoot !== null || parsed.profile !== null || parsed.dryRun)) throw new Error('install-conflict')
  if ((parsed.hostRoot === null) !== (parsed.profile === null)) throw new Error('host-root-and-profile-required')
  if (!parsed.help && !parsed.install && parsed.hostRoot === null) throw new Error('mode-required')
  return parsed
}

function reportCliFailure(reason, detail) {
  const output = { reason }
  if (detail !== undefined) output.detail = detail
  process.stderr.write('[dsh-extra-plan-qqbot] 参数/测试失败: ' + JSON.stringify(output) + '\n')
  process.exitCode = 1
}

function runDryRun(hostRoot, profile) {
  try {
    const context = createPathContext({ hostDataRoot: hostRoot })
    const result = healQqbotCompatibility(hostRoot, { profileNames: [profile], context, dryRun: true })
    if (result.error || (result.failed && result.failed.length > 0)) {
      reportCliFailure(result.error || 'dry-run-failed', { result })
      return
    }
    process.stdout.write('[dsh-extra-plan-qqbot] dryRun完成: ' + JSON.stringify(result) + '\n')
  } catch (error) {
    reportCliFailure('dry-run-exception', errorText(error))
  }
}

if (invokedAsMain) {
  const args = process.argv.slice(2)
  if (args.length === 0) {
    printHelp()
  } else {
    let parsed
    try {
      parsed = parseArguments(args)
    } catch (error) {
      reportCliFailure('invalid-arguments', errorText(error))
    }
    if (parsed !== undefined) {
      if (parsed.help) {
        printHelp()
      } else if (parsed.install) {
        const configuredHome = process.env.DSH_HOME
        let rootError = null
        if (configuredHome !== undefined) {
          try { createPathContext({ hostDataRoot: configuredHome }) } catch (error) { rootError = error }
        }
        if (configuredHome === undefined) {
          reportInstallFailure({ reason: 'dsh-home-required' })
        } else if (rootError !== null) {
          reportInstallFailure({ reason: 'dsh-home-invalid', detail: errorText(rootError) })
        } else {
          try {
            const result = strictInstall(configuredHome)
            if (result.error) reportInstallFailure(result.error)
            else process.stdout.write('[dsh-extra-plan-qqbot] 严格安装完成: ' + JSON.stringify(result) + '\n')
          } catch (error) {
            reportInstallFailure({ reason: 'install-exception', detail: errorText(error) })
          }
        }
      } else {
        runDryRun(parsed.hostRoot, parsed.profile)
      }
    }
  }
}
