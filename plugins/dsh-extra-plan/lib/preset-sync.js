// host 平面自愈组件：dsh 启动时核对 .agent-presets/extra-plan，保证「一次安装」后
// 预设必然就位（postinstall 被 pnpm 判定跳过时的兜底）。语义与「发完即退役」兼容：
// - 目标不存在            → 全量写入（自愈）
// - 旧分发记录（manifest.distHash 为历史值且内容与记录一致）→ 覆盖为新发行物（链式升级）
// - 当前发行记录           → 幂等无操作
// - 其他（distHash null/缺失/内容与记录不符 = 用户手动改动）→ 绝不碰
// 任何异常只静默跳过（不阻断 profile 启动）。
import { createHash } from 'node:crypto'
import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const PRESET_ID = 'extra-plan'
const MANIFEST_NAME = 'dist-manifest.json'
const CORE_FILES = ['preset.yml', 'agent.cordis.yml']

const HERE = dirname(fileURLToPath(import.meta.url))
const ASSET_DIR = join(HERE, '..', 'assets', 'presets', PRESET_ID)

/** sha256(preset.yml || agent.cordis.yml)，固定顺序；任一缺失返回 null。 */
function contentHash(dir) {
  const h = createHash('sha256')
  for (const file of CORE_FILES) {
    const p = join(dir, file)
    if (!existsSync(p)) return null
    h.update(readFileSync(p))
  }
  return h.digest('hex')
}

/** 读目标目录 manifest 的 distHash；缺失/损坏返回 null。 */
function readManifest(targetDir) {
  const p = join(targetDir, MANIFEST_NAME)
  if (!existsSync(p)) return null
  try {
    const m = JSON.parse(readFileSync(p, 'utf8'))
    return m !== null && typeof m === 'object' && typeof m.distHash === 'string' ? m.distHash : null
  } catch {
    return null
  }
}

/** 全量写目标目录：tmp 暂存 → 删旧+改名；删除/改名失败兜底为逐文件覆盖。 */
function writeFull(targetDir, distHash) {
  const parent = dirname(targetDir)
  const tmp = join(parent, `.tmp-${PRESET_ID}-${process.pid}-${Date.now()}`)
  mkdirSync(tmp, { recursive: true })
  try {
    for (const file of readdirSync(ASSET_DIR)) copyFileSync(join(ASSET_DIR, file), join(tmp, file))
    writeFileSync(join(tmp, MANIFEST_NAME), JSON.stringify({ format: 1, distHash }, null, 2) + '\n')
    try {
      if (existsSync(targetDir)) rmSync(targetDir, { recursive: true, force: true })
      renameSync(tmp, targetDir)
    } catch {
      mkdirSync(targetDir, { recursive: true })
      for (const file of readdirSync(tmp)) copyFileSync(join(tmp, file), join(targetDir, file))
      rmSync(tmp, { recursive: true, force: true })
    }
  } catch (err) {
    rmSync(tmp, { recursive: true, force: true })
    throw err
  }
}

/**
 * 运行一次自愈核对（导出便于单测）。
 * @returns 'written' | 'upgraded' | 'idle' | 'skipped'
 */
export function syncPreset(dshHome) {
  const targetDir = join(dshHome, '.agent-presets', PRESET_ID)
  const currentHash = contentHash(ASSET_DIR)
  if (currentHash === null) return 'idle'
  if (!existsSync(targetDir)) {
    writeFull(targetDir, currentHash)
    return 'written'
  }
  const recorded = readManifest(targetDir)
  const targetHash = contentHash(targetDir)
  if (recorded === currentHash && targetHash === currentHash) return 'idle' // 已是当前发行
  if (recorded !== null && targetHash !== null && targetHash === recorded) {
    writeFull(targetDir, currentHash)
    return 'upgraded'
  }
  return 'skipped' // 用户改动/手动拷贝 → 不碰
}

export const name = 'extra-plan-preset-sync'
export const inject = []

export function apply() {
  try {
    const home = process.env.DSH_HOME === undefined || process.env.DSH_HOME === ''
      ? join(homedir(), '.dsh')
      : process.env.DSH_HOME
    syncPreset(home)
  } catch {
    /* 静默：自愈失败不阻断启动 */
  }
}
