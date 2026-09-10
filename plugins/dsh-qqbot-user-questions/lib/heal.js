// @local/dsh-qqbot-user-questions 精简版自愈模块（纯函数，无副作用导入）
// 供 index.js（DSH 启动 apply）、scripts/heal.mjs（CLI 兜底）、pe-test 复用：
//   1. findOwnQqbotProfiles(dshHome) 扫描 profiles/* 锚定「装了本插件的 qqbot profile」
//   2. healPatchRows(profileDir)      迁移旧版 cordis.patch.yml 根级 code-runtime/agent-presets 错误块
//   3. ensureDshExtraPlanLink(dshHome, profileName) 建 web → profile 的 @local/dsh-extra-plan 链接
//   4. healQqbotCompatibility(dshHome) 对每个自有 profile 依次先迁移再建链（整体不阻断）
// 旧能力（问答/审批/官方包补丁/会话目录删除等 monkey-patch）已删，
// 由 dsh-qqbot 0.5.0 原生 question-channel/approval-channel 承担。
import { copyFileSync, existsSync, lstatSync, mkdirSync, readFileSync, readdirSync, realpathSync, symlinkSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { homedir } from 'node:os'
import { join } from 'node:path'

const LOG_PREFIX = '[dsh-qqbot-user-questions]'

// ── js-yaml 双 fallback（惰性加载，导入零副作用）──
let yamlModule = null
let yamlResolved = false
function loadYamlModule() {
  if (yamlResolved) return yamlModule
  yamlResolved = true
  try {
    yamlModule = createRequire(import.meta.url)('js-yaml')
    return yamlModule
  } catch (firstError) {
    const home = process.env.APPDATA || join(homedir(), 'AppData', 'Roaming')
    try {
      yamlModule = createRequire(join(home, 'npm', 'node_modules', '@deepseek-ai', 'dsh', 'package.json'))('js-yaml')
      return yamlModule
    } catch {
      yamlModule = null
      return null
    }
  }
}

function timestamp() {
  const d = new Date()
  const pad = (n) => String(n).padStart(2, '0')
  return String(d.getFullYear()) + pad(d.getMonth() + 1) + pad(d.getDate()) + pad(d.getHours()) + pad(d.getMinutes()) + pad(d.getSeconds()) + pad(d.getMilliseconds())
}

// ── 旧版错误块：只迁移根级完整生成条目，静态 insert 由 cordis.patch.yml 唯一提供 ──
const LEGACY_ROOT_ENTRIES = [
  {
    id: 'code-runtime',
    name: '@deepseek-ai/dsh-code-runtime-worker-thread',
  },
  {
    id: 'agent-presets',
    name: '@deepseek-ai/dsh-agent-presets',
    default: 'standard',
  },
]

function isObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function stripBom(line) {
  return line.startsWith('\uFEFF') ? line.slice(1) : line
}

function lineIndent(line) {
  return (line.match(/^[ \t]*/) || [''])[0].length
}

function isIgnorableLine(line) {
  const trimmed = line.trim()
  return trimmed.length === 0 || trimmed.startsWith('#')
}

function parseScalar(value) {
  const trimmed = value.trim()
  if (trimmed.length >= 2) {
    const first = trimmed[0]
    const last = trimmed[trimmed.length - 1]
    if ((first === "'" && last === "'") || (first === '"' && last === '"')) return trimmed.slice(1, -1)
  }
  return trimmed
}

function parseEntryBlock(blockLines) {
  const yaml = loadYamlModule()
  if (yaml === null) return null
  try {
    const parsed = yaml.load(blockLines.join('\n'))
    if (Array.isArray(parsed) && parsed.length === 1 && isObject(parsed[0])) return parsed[0]
  } catch { /* invalid whole fixture still gets conservative line fallback */ }
  return null
}

function legacyEntryKind(entry) {
  if (!isObject(entry)) return null
  for (const legacy of LEGACY_ROOT_ENTRIES) {
    if (entry.id !== legacy.id || entry.name !== legacy.name) continue
    if (legacy.default !== undefined) {
      if (!isObject(entry.config) || entry.config.default !== legacy.default) continue
    }
    return legacy.id
  }
  return null
}

function fallbackLegacyEntryKind(blockLines) {
  const first = stripBom(blockLines[0] || '')
  const idMatch = /^\s*-\s*id:\s*(['"]?)([^'"\s]+)\1\s*$/.exec(first)
  if (!idMatch) return null
  const id = idMatch[2]
  const rootIndent = lineIndent(first)
  let name = null
  for (let i = 1; i < blockLines.length; i += 1) {
    const match = /^([ \t]*)name:\s*(.*?)\s*$/.exec(blockLines[i])
    if (match && match[1].length > rootIndent) {
      name = parseScalar(match[2])
      break
    }
  }
  const expected = LEGACY_ROOT_ENTRIES.find((entry) => entry.id === id)
  if (!expected || name !== expected.name) return null
  if (expected.default === undefined) return id
  let configIndent = -1
  for (let i = 1; i < blockLines.length; i += 1) {
    const match = /^([ \t]*)config:\s*$/.exec(blockLines[i])
    if (match && match[1].length > rootIndent) {
      configIndent = match[1].length
      break
    }
  }
  if (configIndent < 0) return null
  for (let i = 1; i < blockLines.length; i += 1) {
    if (isIgnorableLine(blockLines[i])) continue
    const indent = lineIndent(blockLines[i])
    if (indent <= configIndent) break
    const match = /^([ \t]*)default:\s*(.*?)\s*$/.exec(blockLines[i])
    if (match && parseScalar(match[2]) === expected.default) return id
  }
  return null
}

function rootSequenceIndent(lines) {
  for (const line of lines) {
    const normalized = stripBom(line)
    if (isIgnorableLine(normalized)) continue
    const trimmed = normalized.trim()
    if (trimmed === '---' || trimmed.startsWith('%')) continue
    const match = /^([ \t]*)-\s+/.exec(normalized)
    return match === null ? null : match[1].length
  }
  return null
}

function isRootSequenceLine(line, rootIndent) {
  const normalized = stripBom(line)
  const match = /^([ \t]*)-\s+/.exec(normalized)
  return match !== null && match[1].length === rootIndent
}

function scanRootBlocks(content) {
  const lines = content.split(/\r?\n/)
  const rootIndent = rootSequenceIndent(lines)
  if (rootIndent === null) return { lines, rootIndent, blocks: [] }
  const starts = []
  for (let i = 0; i < lines.length; i += 1) {
    if (isRootSequenceLine(lines[i], rootIndent)) starts.push(i)
  }
  const blocks = []
  for (let i = 0; i < starts.length; i += 1) {
    const start = starts[i]
    let end = lines.length
    for (let j = start + 1; j < lines.length; j += 1) {
      if (isRootSequenceLine(lines[j], rootIndent)) {
        end = j
        break
      }
      // 未缩进的非注释行不是当前条目的一部分，保留给写后 YAML 校验发现。
      if (!isIgnorableLine(lines[j]) && lineIndent(stripBom(lines[j])) <= rootIndent) {
        end = j
        break
      }
    }
    blocks.push({ start, end, kind: null })
  }
  return { lines, rootIndent, blocks }
}

function findLegacyRootBlocks(content) {
  const scan = scanRootBlocks(content)
  const legacyBlocks = []
  for (const block of scan.blocks) {
    const blockLines = scan.lines.slice(block.start, block.end)
    const parsedKind = legacyEntryKind(parseEntryBlock(blockLines))
    const kind = parsedKind || fallbackLegacyEntryKind(blockLines)
    if (kind !== null) legacyBlocks.push({ ...block, kind })
  }
  return { ...scan, blocks: legacyBlocks }
}

function removeLegacyRootBlocks(content, migration) {
  const removed = new Set()
  for (const block of migration.blocks) {
    for (let i = block.start; i < block.end; i += 1) removed.add(i)
  }
  const kept = migration.lines.filter((_line, index) => !removed.has(index))
  const eol = content.includes('\r\n') ? '\r\n' : '\n'
  const meaningful = kept.filter((line) => !isIgnorableLine(line))
  // 旧块是唯一内容时，遵循官方 loader 要求写成非空的顶层空数组。
  if (meaningful.length === 0) return '[]' + (content.endsWith('\n') ? eol : '')
  return kept.join(eol)
}

function verifyMigratedPatch(content) {
  const yaml = loadYamlModule()
  if (yaml !== null) {
    try {
      const parsed = yaml.load(content)
      if (!Array.isArray(parsed)) return false
      // 只检查解析后的顶层条目；嵌套 insert 中的同名 id 不属于迁移对象。
      return !parsed.some((entry) => legacyEntryKind(entry))
    } catch {
      return false
    }
  }
  const lines = content.split(/\r?\n/)
  const emptyArrayLine = (line) => /^\s*\[\s*\]\s*$/.test(line)
  if (lines.some(emptyArrayLine) && lines.every((line) => isIgnorableLine(line) || emptyArrayLine(line))) return true
  const scan = scanRootBlocks(content)
  if (scan.rootIndent === null || scan.blocks.length === 0) return false
  const malformedRootLine = lines.some((line) => {
    const normalized = stripBom(line)
    if (isIgnorableLine(normalized) || isRootSequenceLine(normalized, scan.rootIndent)) return false
    const trimmedLine = normalized.trim()
    return lineIndent(normalized) <= scan.rootIndent && trimmedLine !== '---' && trimmedLine !== '...'
  })
  if (malformedRootLine) return false
  return !scan.blocks.some((block) => fallbackLegacyEntryKind(scan.lines.slice(block.start, block.end)) !== null)
}

/**
 * 只迁移旧版自愈生成的根级完整块：
 * - code-runtime 的 name 必须是 worker-thread 目标包名；
 * - agent-presets 的 name 必须匹配且 config.default 必须为 standard；
 * - 嵌套 insert、im-qqbot 及其他用户条目原样保留。
 * 实际迁移前备份，写后验证顶层 YAML 数组和旧块消失，失败恢复原文；无旧块零写入零备份。
 */
export function healPatchRows(profileDir) {
  const patchFile = join(profileDir, 'cordis.patch.yml')
  if (!existsSync(patchFile)) return { status: 'skipped', reason: 'no-file' }
  let content
  try {
    content = readFileSync(patchFile, 'utf8')
  } catch (err) {
    console.warn(LOG_PREFIX + ' 读取 ' + patchFile + ' 失败，跳过迁移:', err instanceof Error ? err.message : String(err))
    return { status: 'skipped', reason: 'read-failed' }
  }
  const migration = findLegacyRootBlocks(content)
  if (migration.blocks.length === 0) return { status: 'idempotent' }
  const merged = removeLegacyRootBlocks(content, migration)
  if (merged === content) return { status: 'idempotent' }
  const backupFile = patchFile + '.bak-' + timestamp()
  try {
    copyFileSync(patchFile, backupFile)
  } catch (err) {
    console.warn(LOG_PREFIX + ' 备份失败，跳过迁移:', err instanceof Error ? err.message : String(err))
    return { status: 'failed', reason: 'backup-failed' }
  }
  try {
    writeFileSync(patchFile, merged, 'utf8')
  } catch (err) {
    try { copyFileSync(backupFile, patchFile) } catch { /* preserve original error */ }
    console.warn(LOG_PREFIX + ' 迁移失败（已恢复备份）:', err instanceof Error ? err.message : String(err))
    return { status: 'failed', reason: 'write-failed', backup: backupFile }
  }
  let verified = false
  try { verified = verifyMigratedPatch(merged) } catch { /* treat verifier errors as validation failure */ }
  if (!verified) {
    try { copyFileSync(backupFile, patchFile) } catch { /* preserve original error */ }
    console.warn(LOG_PREFIX + ' 迁移后校验失败，已用备份恢复: ' + patchFile)
    return { status: 'failed', reason: 'verify-failed', backup: backupFile }
  }
  const migrated = migration.blocks.map((block) => block.kind)
  console.log(LOG_PREFIX + ' 已迁移旧版根级块 ' + migrated.join('/') + ' → ' + patchFile)
  return { status: 'migrated', backup: backupFile, migrated }
}

/**
 * 扫描 $DSH_HOME/profiles/*，锚定「安装了本插件的 qqbot profile」：
 * ① package.json 可读且 dsh.profile.bundles 含 '@tencent-connect/dsh-qqbot'；
 * ② node_modules/@local/dsh-qqbot-user-questions 目录存在（本插件已装）。
 * 任一不满足 → 跳过；只处理标准位置，E 盘副本/未装插件的 profile 天然排除。
 */
export function findOwnQqbotProfiles(dshHome) {
  const out = []
  const profilesRoot = join(dshHome, 'profiles')
  if (!existsSync(profilesRoot)) return out
  let names = []
  try { names = readdirSync(profilesRoot) } catch { return out }
  for (const name of names) {
    const profileDir = join(profilesRoot, name)
    try {
      const packageFile = join(profileDir, 'package.json')
      if (!existsSync(packageFile)) continue
      const pkg = JSON.parse(readFileSync(packageFile, 'utf8'))
      const bundles = pkg && pkg.dsh && pkg.dsh.profile && Array.isArray(pkg.dsh.profile.bundles)
        ? pkg.dsh.profile.bundles : []
      if (!bundles.includes('@tencent-connect/dsh-qqbot')) continue
      if (!existsSync(join(profileDir, 'node_modules', '@local', 'dsh-qqbot-user-questions'))) continue
      out.push(name)
    } catch { /* 单个 profile 读取异常不阻断 */ }
  }
  return out
}

/**
 * 建链：整体移植旧版建链脚本 L10-42，仅参数化 profile 名与日志前缀；与旧块迁移职责分离。
 * web 缺失 → warn 跳过；已正确链接 → 不动；非目标链接/实体目录 → 保留并提示 pnpm 迁移；
 * 仅 ENOENT → mkdirSync(@local) + symlinkSync(webPkg, target, win32 ? junction : dir)；
 * 全程 try/catch 只记录日志不阻断；目标用绝对路径 webPkg（Windows junction 支持跨盘符）。
 */
export function ensureDshExtraPlanLink(dshHome, profileName) {
  try {
    const webPkg = join(dshHome, 'profiles', 'web', 'node_modules', '@local', 'dsh-extra-plan')
    const targetPkg = join(dshHome, 'profiles', profileName, 'node_modules', '@local', 'dsh-extra-plan')
    if (!existsSync(webPkg)) {
      console.warn(LOG_PREFIX + ' 未找到 web 的 dsh-extra-plan，跳过映射')
      return { status: 'skipped', reason: 'web-missing' }
    }
    try {
      const stat = lstatSync(targetPkg)
      if (stat.isSymbolicLink()) {
        try {
          if (realpathSync(targetPkg) === realpathSync(webPkg)) return { status: 'up-to-date' }
        } catch { /* fall through to warn */ }
        console.warn(LOG_PREFIX + ' ' + profileName + ' 目标已存在非目标链接，保留原状；请通过 pnpm 完成迁移后重试')
        return { status: 'kept', reason: 'other-link' }
      }
      console.warn(LOG_PREFIX + ' ' + profileName + ' 目标已存在实体对象，保留原状；请通过 pnpm 完成迁移后重试')
      return { status: 'kept', reason: 'entity' }
    } catch (err) {
      if (err && err.code !== 'ENOENT') throw err
    }
    mkdirSync(join(dshHome, 'profiles', profileName, 'node_modules', '@local'), { recursive: true })
    symlinkSync(webPkg, targetPkg, process.platform === 'win32' ? 'junction' : 'dir')
    console.log(LOG_PREFIX + ' 已建立映射: ' + profileName + ' → web')
    return { status: 'linked' }
  } catch (err) {
    console.error(LOG_PREFIX + ' 映射建立失败:', err instanceof Error ? err.message : String(err))
    return { status: 'failed' }
  }
}

/**
 * 对 findOwnQqbotProfiles 命中的每个 profile 先迁移旧块再 ensureDshExtraPlanLink；
 * 整体 try/catch 只记录日志，不阻断插件加载与 DSH 启动。
 */
export function healQqbotCompatibility(dshHome) {
  try {
    const profiles = findOwnQqbotProfiles(dshHome)
    for (const profileName of profiles) {
      const profileDir = join(dshHome, 'profiles', profileName)
      healPatchRows(profileDir)
      ensureDshExtraPlanLink(dshHome, profileName)
    }
    return { profiles, count: profiles.length }
  } catch (err) {
    console.warn(LOG_PREFIX + ' 自愈遍历异常（不阻断）:', err instanceof Error ? err.message : String(err))
    return { profiles: [], count: 0, error: err instanceof Error ? err.message : String(err) }
  }
}
