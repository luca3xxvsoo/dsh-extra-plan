// @local/dsh-qqbot-user-questions 精简版自愈模块（纯函数，无副作用导入）
// 供 index.js（DSH 启动 apply）、scripts/heal.mjs（CLI 兜底）、pe-test 复用：
//   1. findOwnQqbotProfiles(dshHome) 扫描 profiles/* 锚定「装了本插件的 qqbot profile」
//   2. healPatchRows(profileDir)      幂等补 cordis.patch.yml 的 code-runtime/agent-presets 两行
//   3. ensureDshExtraPlanLink(dshHome, profileName) 建 web → profile 的 @local/dsh-extra-plan 链接
//   4. healQqbotCompatibility(dshHome) 对每个自有 profile 依次先补行再建链（整体不阻断）
// 旧能力（问答/审批/官方包补丁/会话目录删除等 monkey-patch）已删，
// 由 dsh-qqbot 0.5.0 原生 question-channel/approval-channel 承担。
import { copyFileSync, existsSync, lstatSync, mkdirSync, readFileSync, readdirSync, realpathSync, symlinkSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { homedir } from 'node:os'
import { join } from 'node:path'

const LOG_PREFIX = '[dsh-qqbot-user-questions]'

// ── 目标条目：照抄官方 dsh-web-app cordis.patch.yml ──
// code-runtime：官方 L49-50（id + name，无 config）；agent-presets：官方 L441-444（id + name + config.default: standard）
const TARGET_ENTRIES = [
  {
    id: 'code-runtime',
    lines: [
      '- id: code-runtime',
      "  name: '@deepseek-ai/dsh-code-runtime-worker-thread'",
    ],
    required: ["  name: '@deepseek-ai/dsh-code-runtime-worker-thread'"],
  },
  {
    id: 'agent-presets',
    lines: [
      '- id: agent-presets',
      "  name: '@deepseek-ai/dsh-agent-presets'",
      '  config:',
      '    default: standard',
    ],
    required: ["  name: '@deepseek-ai/dsh-agent-presets'", '  config:', '    default: standard'],
  },
]

// ── js-yaml 双 fallback（镜像 preset-settings.js loadYaml L9-22；惰性加载，导入零副作用）──
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

// 幂等同 id 行：任意缩进、容错引号（镜像旧版补丁脚本 L53）
function idLinePattern(id) {
  return new RegExp("^\\s*-\\s*id:\\s*['\"]?" + id + "['\"]?\\s*$", 'm')
}

function treeHasId(node, id) {
  if (Array.isArray(node)) return node.some((item) => treeHasId(item, id))
  if (node !== null && typeof node === 'object') {
    if (Object.prototype.hasOwnProperty.call(node, 'id') && node.id === id) return true
    for (const value of Object.values(node)) {
      if (treeHasId(value, id)) return true
    }
  }
  return false
}

// 行级自检（js-yaml 不可得时兜底）：两目标 id 行存在，且各自条目块含必需子行（块闭合）
function lineLevelCheck(content) {
  const lines = content.split('\n')
  for (const entry of TARGET_ENTRIES) {
    const re = new RegExp("^\\s*-\\s*id:\\s*['\"]?" + entry.id + "['\"]?\\s*$")
    let idx = -1
    for (let i = 0; i < lines.length; i += 1) {
      if (re.test(lines[i])) { idx = i; break }
    }
    if (idx === -1) return false
    const idIndent = (lines[idx].match(/^\s*/) || [''])[0].length
    let end = lines.length
    for (let i = idx + 1; i < lines.length; i += 1) {
      const m = /^\s*-\s/.exec(lines[i])
      if (m && m[0].length <= idIndent + 2) { end = i; break }
    }
    const blockLines = lines.slice(idx, end)
    if (!entry.required.every((r) => blockLines.some((line) => line.includes(r)))) return false
  }
  return true
}

function verifyPatchEntries(merged) {
  const yaml = loadYamlModule()
  if (yaml !== null) {
    try {
      const parsed = yaml.load(merged)
      if (parsed !== null && parsed !== undefined) {
        return TARGET_ENTRIES.every((entry) => treeHasId(parsed, entry.id))
      }
    } catch { /* fall through to line-level check */ }
  }
  return lineLevelCheck(merged)
}

function joinedBlock(entries, indent) {
  const lines = []
  for (const entry of entries) {
    for (const line of entry.lines) lines.push(indent + line)
  }
  return lines.join('\n') + '\n'
}

function mergeMissingEntries(content, missingEntries) {
  const lines = content.split('\n')
  // 形态一：空数组行 []（任意缩进，真实 qqbot profile 的 `[]` 形态）→ 以该行缩进为基替换
  let arrIdx = -1
  let arrIndent = ''
  for (let i = 0; i < lines.length; i += 1) {
    const m = /^(\s*)\[\s*\]\s*$/.exec(lines[i])
    if (m) { arrIdx = i; arrIndent = m[1]; break }
  }
  if (arrIdx !== -1) {
    const block = joinedBlock(missingEntries, arrIndent).split('\n')
    if (block[block.length - 1] === '') block.pop()
    return lines.slice(0, arrIdx).concat(block, lines.slice(arrIdx + 1)).join('\n')
  }
  // 形态二：无 [] → 末尾追加缺失行块（保证一个换行分隔，镜像旧脚本 L56）
  const block = joinedBlock(missingEntries, '')
  const sep = content.trim().length === 0 ? '' : (content.endsWith('\n') ? '' : '\n')
  return content + sep + block
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
 * 幂等补 cordis.patch.yml 两行（code-runtime / agent-presets）。
 * - 文件不存在 → 跳过（沿用旧脚本「存在才读」先例）；
 * - 两目标 id 行都在 → 零写入零备份；
 * - 形态：[] 行替换 / 末尾追加；写前 .bak-<ts> 备份；写后 js-yaml（双 fallback）/
 *   行级自检校验，失败恢复备份；仅 merged !== content 时写入；一切异常只 warn 不抛。
 */
export function healPatchRows(profileDir) {
  const patchFile = join(profileDir, 'cordis.patch.yml')
  if (!existsSync(patchFile)) return { status: 'skipped', reason: 'no-file' }
  let content
  try {
    content = readFileSync(patchFile, 'utf8')
  } catch (err) {
    console.warn(LOG_PREFIX + ' 读取 ' + patchFile + ' 失败，跳过补行:', err instanceof Error ? err.message : String(err))
    return { status: 'skipped', reason: 'read-failed' }
  }
  const missing = TARGET_ENTRIES.filter((entry) => !idLinePattern(entry.id).test(content))
  if (missing.length === 0) return { status: 'idempotent' }
  const merged = mergeMissingEntries(content, missing)
  if (merged === content) return { status: 'idempotent' }
  const backupFile = patchFile + '.bak-' + timestamp()
  try {
    copyFileSync(patchFile, backupFile)
  } catch (err) {
    console.warn(LOG_PREFIX + ' 备份失败，跳过补行:', err instanceof Error ? err.message : String(err))
    return { status: 'failed', reason: 'backup-failed' }
  }
  try {
    writeFileSync(patchFile, merged, 'utf8')
  } catch (err) {
    try { copyFileSync(backupFile, patchFile) } catch { /* preserve original error */ }
    console.warn(LOG_PREFIX + ' 补行失败（已恢复备份）:', err instanceof Error ? err.message : String(err))
    return { status: 'failed', reason: 'write-failed' }
  }
  if (!verifyPatchEntries(merged)) {
    try { copyFileSync(backupFile, patchFile) } catch { /* preserve original error */ }
    console.warn(LOG_PREFIX + ' 补行后校验失败，已用备份恢复: ' + patchFile)
    return { status: 'failed', reason: 'verify-failed' }
  }
  console.log(LOG_PREFIX + ' 已补行 ' + missing.map((e) => e.id).join('/') + ' → ' + patchFile)
  return { status: 'healed', backup: backupFile, missing: missing.map((e) => e.id) }
}

/**
 * 建链：整体移植旧版建链脚本 L10-42，仅参数化 profile 名与日志前缀。
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
 * 对 findOwnQqbotProfiles 命中的每个 profile 先 healPatchRows 再 ensureDshExtraPlanLink；
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
