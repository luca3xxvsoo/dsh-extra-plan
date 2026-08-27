// @local/dsh-extra-plan/preset-sync
// 预设自动分发组件（host 平面，由 cordis.patch.yml insert 挂载，两态语义）：
// 把随包携带的 extra-plan 预设资产（preset.yml / agent.cordis.yml）原子写入
// DSH_HOME/.agent-presets/extra-plan/（agent-presets 的 user root），使「按需规划模式」
// 预设随安装自动出现，无需手工复制、无需重启。
//
// 两态判定（完全覆盖语义）：
// - 目标目录不存在 → 全量写入（首次安装）
// - 目标内容 hash == 当前发行物 hash → 跳过（幂等，0 写入）
// - 任何不一致（含用户手工改动）→ 整目录覆盖为发行物（先删旧再原子改名）
//
// 注入语义（踩坑记录）：这版 cordis 的 ctx.inject 是「回调式注入装载器」
// （inject(服务数组, 回调) → plugin()），不是同步取值 API；同步取值应读
// ctx.<service> 属性或使用回调式注入（本组件使用后者，与 dsh-agent-presets
// L855-857 同款，且等待服务就绪）。
//
// 实现依据（官方 @deepseek-ai/dsh-agent-presets 已核实语义）：
// - user root 恒在 roots 尾（lib/index.js L851-854，USER_PRESET_DIR='.agent-presets'）；
// - 分发目标只能是 user root（无插件注册 shipped root 的口子，discovery.js L28-32）；
// - copy 的源必须在 roots 内（index.js L1046），官方 copy 无法以随包资产目录为源，
//   故本组件直接用 node:fs 写入 user root（与 authoring.js L58-64 writableRoot 同一定位）；
// - discovery 每次调用重读 roots（discovery.js L5-6），新建会话即刻可见，无需重启；
// - 先写 .tmp- 临时目录再改名，保证半个目录对 discovery 不可见（discovery.js L148-150
//   仅识别匹配 PRESET_ID 的目录名；临时目录名前缀 .tmp- 自动被跳过）。
// - 失败降级：服务未就绪（回调不触发）/ 不可写 / 任何异常 → warn 跳过，不阻断 profile 启动。
import { createHash } from 'node:crypto'
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

export const name = 'preset-sync'

const PRESET_ID = 'extra-plan'
const MANIFEST_NAME = 'dist-manifest.json'
const TMP_PREFIX = '.tmp-'
const CORE_FILES = ['preset.yml', 'agent.cordis.yml']
const KNOWN_FILES = new Set([...CORE_FILES, MANIFEST_NAME])

// 资产目录：本模块位于包内 lib/，资产在其 ../assets/presets/extra-plan/
const ASSET_DIR = join(fileURLToPath(new URL('..', import.meta.url)), 'assets', 'presets', PRESET_ID)

/** sha256(preset.yml || agent.cordis.yml)，固定顺序，作为发行物内容 hash。 */
function contentHash(dir) {
  const h = createHash('sha256')
  for (const file of CORE_FILES) {
    const p = join(dir, file)
    if (!existsSync(p)) return null
    h.update(readFileSync(p))
  }
  return h.digest('hex')
}

/** 全量写目标目录：先写 .tmp- 临时目录，再「删旧 + 改名」两步原子完成。 */
function writeTarget(targetDir, distHash) {
  const parent = dirname(targetDir)
  const tmp = join(parent, `${TMP_PREFIX}${PRESET_ID}-${process.pid}-${Date.now()}`)
  mkdirSync(tmp, { recursive: true })
  try {
    for (const file of readdirSync(ASSET_DIR)) copyFileSync(join(ASSET_DIR, file), join(tmp, file))
    writeFileSync(join(tmp, MANIFEST_NAME), JSON.stringify({ format: 1, distHash }, null, 2) + '\n')
    if (existsSync(targetDir)) rmSync(targetDir, { recursive: true, force: true })
    renameSync(tmp, targetDir)
  } catch (err) {
    // 清理半成品后上抛，由调用方降级为 warn
    rmSync(tmp, { recursive: true, force: true })
    throw err
  }
}

function syncPreset(ctx, presets) {
  // 与 authoring.js L58-64 writableRoot 同一定位：第一个 trust === 'user' 的 root
  const userRoot = (presets.roots ?? []).find((root) => root?.trust === 'user' && typeof root.path === 'string')
  if (userRoot === undefined) {
    ctx.logger.warn(`[preset-sync] 未找到 trust==='user' 的 root，跳过预设分发`)
    return
  }

  const targetDir = join(userRoot.path, PRESET_ID)
  const distHash = contentHash(ASSET_DIR)

  if (!existsSync(targetDir)) {
    writeTarget(targetDir, distHash)
    ctx.logger.info(`[preset-sync] 已分发预设「按需规划模式」→ ${targetDir}`)
    return
  }
  // 目录纯净且内容一致才幂等跳过；发行物之外的任何文件/任何内容差异 → 完全覆盖
  const strangers = readdirSync(targetDir).filter((f) => !f.startsWith(TMP_PREFIX) && !KNOWN_FILES.has(f))
  if (strangers.length === 0 && contentHash(targetDir) === distHash) return
  // 任何不一致（含用户改动、多余文件）→ 完全覆盖为当前发行物
  writeTarget(targetDir, distHash)
  ctx.logger.info(`[preset-sync] 预设「按需规划模式」已覆盖为当前发行物 → ${targetDir}`)
}

export function apply(ctx) {
  // 回调式注入（见文件头踩坑记录）：服务就绪后执行分发；未就绪则不触发（等效静默）
  ctx.inject(['agentPresets'], (injectedCtx) => {
    try {
      const presets = injectedCtx.agentPresets
      if (presets.authorable !== true) {
        injectedCtx.logger.warn(`[preset-sync] agentPresets 不可写（authorable=false），跳过预设分发`)
        return
      }
      syncPreset(injectedCtx, presets)
    } catch (err) {
      injectedCtx.logger.warn(`[preset-sync] 预设分发失败（已跳过，不影响其他组件）：${err instanceof Error ? err.message : String(err)}`)
    }
  })
}
