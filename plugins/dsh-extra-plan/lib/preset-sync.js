// Host-side preset state: asset hash chain, migration audit ledger, and startup self-healing
// over the dsh 0.1.7-rc.1 preset carrier.
//
// 载体订正（方案 T2）：预设不再是「分发到 $DSH_HOME/.agent-presets/extra-plan 的目录」，
// 而是 profile patch 根级 insert 一行 preset-extra-plan 声明行
// （name '@deepseek-ai/dsh-agent-preset'，config.plugins = agent.cordis.yml 顶层条目逐字）。
// 于是：
//  - 分发目标退役；postinstall（scripts/distribute-preset.mjs）只初始化插件自有状态目录
//    $DSH_HOME/.agent-presets/extra-plan/（dist-manifest.json 审计台账）。
//  - 目标物判定 = 资产 hash（contentHash(ASSET_DIR)） + 声明行 plugins 仍覆盖资产行 id 集合。
//    为什么不是「declaredPlugins 与资产逐字 hash 相等」：设置页写值会把整段 plugins
//    重述进 profile patch（configEditor.edit，config 不深合并），行集合不变而部分行 config
//    已按用户值改写——逐字 hash 永不相等会退化成「每次启动都重跑迁移」。故按行 id 集合判定。
//  - 写盘只经 configEditor.edit（事务 + reconcile + 回滚），本模块绝不直写 cordis.patch.yml。
//  - 旧值来源 = 旧分发副本 $DSH_HOME/.agent-presets/extra-plan/agent.cordis.yml（若在）：
//    8 项 → settings 行 config；2 项宿主行 → 声明行 config.plugins 内 tool-web/tool-presentation
//    子行；7 项 gateWords → 声明行 config.plugins 内 extra-plan 行 config.gateWords（整体重述后
//    整组校验，失败即抛不落盘）。
//
// 本模块同时导出纯计算（planPresetSync / capturePrevious / 审计构造）与宿主入口（apply），
// 使 postinstall、启动自愈与回归夹具共用同一份状态机。

import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  HOST_ROW_IDS,
  HOST_ROW_SETTING_DEFINITIONS,
  PRESET_ROW_ID,
  SETTINGS_ROW_ID,
  SETTING_DEFINITIONS,
  SETTING_GROUPS,
  captureSettings,
  findPluginsRow,
  restatePluginsRow,
} from './preset-settings.js'
import {
  GATE_WORD_FIELD_NAMES,
  GATE_WORDS_GROUP_DEFINITION,
  validateGateWords,
} from './gate-words.js'
import { parsePresetYaml, resolveSetting, resolveTemplateSettingDefault } from './preset-settings.js'

const PRESET_ID = 'extra-plan'
const MANIFEST_NAME = 'dist-manifest.json'
export const CORE_FILES = ['preset.yml', 'agent.cordis.yml']
export const STATE_DIR_NAME = '.agent-presets'
/** 声明行 plugins 必须承载的行 id（缺任一 → 声明行不再覆盖本预设组合）。 */
export const DECLARATION_ROW_IDS = Object.freeze([
  'extra-plan',
  HOST_ROW_IDS.webFetch,
  HOST_ROW_IDS.toolPresentationMode,
])

const HERE = dirname(fileURLToPath(import.meta.url))
export const ASSET_DIR = join(HERE, '..', 'assets', 'presets', PRESET_ID)
export const ASSET_PATCH_FILE = join(ASSET_DIR, 'preset-patch.generated.yml')

export function stateDirOf(dshHome) {
  return join(dshHome, STATE_DIR_NAME, PRESET_ID)
}

export function defaultDshHome() {
  return process.env.DSH_HOME === undefined || process.env.DSH_HOME === ''
    ? join(homedir(), '.dsh')
    : process.env.DSH_HOME
}

/** sha256(preset.yml || agent.cordis.yml)，固定顺序；任一缺失返回 null。 */
export function contentHash(dir) {
  const h = createHash('sha256')
  for (const file of CORE_FILES) {
    const filePath = join(dir, file)
    if (!existsSync(filePath)) return null
    h.update(readFileSync(filePath))
  }
  return h.digest('hex')
}

/** 声明行 plugins 的行 id 集合（含 group 子行，扁平化）。 */
export function pluginRowIds(plugins) {
  const ids = []
  const visit = (rows) => {
    if (!Array.isArray(rows)) return
    for (const row of rows) {
      if (row === null || typeof row !== 'object') continue
      if (typeof row.id === 'string' && row.id !== '') ids.push(row.id)
      if (Array.isArray(row.config)) visit(row.config)
    }
  }
  visit(plugins)
  return ids
}

/** 声明行是否仍在承载本预设组合：行 id 集合覆盖 DECLARATION_ROW_IDS。 */
export function declarationCoversAsset(plugins) {
  if (!Array.isArray(plugins)) return false
  const ids = new Set(pluginRowIds(plugins))
  return DECLARATION_ROW_IDS.every((id) => ids.has(id))
}

/**
 * 用户可写位置表：行 id → 该行内「用户可改」的 config 键集合。
 * **与写回清单严格同源** —— 唯一来源是 HOST_ROW_SETTING_DEFINITIONS.rowLocator
 * （2 项宿主行：tool-web.fetch / tool-presentation.mode）与 GATE_WORDS_GROUP_DEFINITION
 * （extra-plan.gateWords 整组）。任何未列于此的位置都属「资产本体」，必须随资产变化刷新。
 * 比对剥离表与搬运写回清单必须恒等，否则会出现「比对了却没写回 → 用户值被新模板吃掉」。
 */
function userWritableByRow() {
  const table = new Map()
  const push = (rowId, path) => {
    if (typeof rowId !== 'string' || rowId === '' || typeof path !== 'string') return
    const prefix = 'config.'
    const key = path.startsWith(prefix) ? path.slice(prefix.length) : path
    if (key === '' || key.includes('.')) return
    const set = table.get(rowId)
    if (set === undefined) table.set(rowId, new Set([key]))
    else set.add(key)
  }
  for (const definition of HOST_ROW_SETTING_DEFINITIONS) {
    const locator = definition.rowLocator
    if (locator !== null && typeof locator === 'object') push(locator.pluginsRowId, locator.path)
  }
  push(GATE_WORDS_GROUP_DEFINITION.rowId, GATE_WORDS_GROUP_DEFINITION.path)
  return table
}

/** 剥离用户可写键（置为固定占位，保持键序与结构不变），得到「本体」视图。 */
export function stripUserWritable(plugins) {
  if (!Array.isArray(plugins)) return plugins
  const table = userWritableByRow()
  const stripRow = (row) => {
    if (row === null || typeof row !== 'object' || Array.isArray(row)) return row
    const next = { ...row }
    if (Array.isArray(next.config)) {
      next.config = next.config.map(stripRow)
      return next
    }
    const writable = typeof next.id === 'string' ? table.get(next.id) : undefined
    if (writable !== undefined && next.config !== null && typeof next.config === 'object') {
      const config = { ...next.config }
      for (const key of writable) {
        if (Object.prototype.hasOwnProperty.call(config, key)) config[key] = '__user__'
      }
      next.config = config
    }
    return next
  }
  return plugins.map(stripRow)
}

/**
 * 声明行「本体」是否与资产一致（剥离用户可写键后逐字比较）。
 * 任一输入不可用（undefined / 非数组）→ 保守返回 true（不触发重建，绝不在信息不全时改写现场）。
 */
export function declarationBodyMatchesAsset(declaredPlugins, assetBody) {
  if (!Array.isArray(declaredPlugins) || !Array.isArray(assetBody)) return true
  return JSON.stringify(stripUserWritable(declaredPlugins)) === JSON.stringify(stripUserWritable(assetBody))
}

function readManifestRecord(stateDir) {
  const file = join(stateDir, MANIFEST_NAME)
  if (!existsSync(file)) return null
  try {
    const manifest = JSON.parse(readFileSync(file, 'utf8'))
    if (manifest === null || typeof manifest !== 'object') return null
    if (manifest.format !== 1 && manifest.format !== 2) return null
    return typeof manifest.distHash === 'string' ? manifest : { ...manifest, distHash: null }
  } catch {
    return null
  }
}

/** 读状态目录 manifest 记录（format 1/2 兼容）；缺失/损坏返回 null。 */
export function readManifestRecordOf(stateDir) {
  return readManifestRecord(stateDir)
}

/** 读状态目录 manifest 的 distHash；兼容 format 1/2，缺失/损坏返回 null。 */
export function readManifest(stateDir) {
  const manifest = readManifestRecord(stateDir)
  return manifest === null ? null : manifest.distHash
}

export function writeManifest(stateDir, record) {
  mkdirSync(stateDir, { recursive: true })
  writeFileSync(join(stateDir, MANIFEST_NAME), JSON.stringify(record, null, 2) + '\n', 'utf8')
}

function emptyMigration(source, sourceDistHash) {
  const results = {}
  const status = source === 'absent' ? 'skipped-source-absent' : 'skipped-source-unreadable'
  for (const definition of SETTING_DEFINITIONS) results[definition.key] = status
  return {
    format: 1,
    sourceDistHash: sourceDistHash === undefined ? null : sourceDistHash,
    source,
    results,
  }
}

/** gateWords 专用空审计：只记状态，不记用户词值。 */
function emptyGateWordsMigration(source, sourceDistHash) {
  const results = {}
  const status = source === 'absent' ? 'skipped-source-absent' : 'skipped-source-unreadable'
  for (const field of GATE_WORD_FIELD_NAMES) results[field] = status
  return {
    format: 1,
    sourceDistHash: sourceDistHash === undefined ? null : sourceDistHash,
    source,
    results,
  }
}

/** 旧组状态 → 审计状态字符串（整组同一状态，禁止部分迁移）。 */
function gateReasonForState(state) {
  if (state === 'missing') return 'skipped-old-missing'
  if (state === 'ambiguous') return 'skipped-old-ambiguous'
  return 'skipped-invalid'
}

function reasonForOldState(state) {
  if (state === 'missing') return 'skipped-old-missing'
  if (state === 'ambiguous') return 'skipped-old-ambiguous'
  if (state === 'invalid') return 'skipped-invalid'
  return 'skipped-old-missing'
}

/**
 * 整组判定：稳定 locator（源行 id=extra-plan + config.gateWords）+ 共享 validator 全组校验。
 * 返回 { state: 'captured'|'missing'|'ambiguous'|'invalid', values? }；不做部分接受。
 */
function captureGateWords(document) {
  const result = resolveSetting(document, GATE_WORDS_GROUP_DEFINITION, { aliases: false })
  if (result.kind === 'missing') return { state: 'missing' }
  if (result.kind === 'ambiguous') return { state: 'ambiguous' }
  try {
    return { state: 'captured', values: validateGateWords(result.value) }
  } catch {
    return { state: 'invalid' }
  }
}

/** 厂商模板整组校验：缺失/非法一律抛错（坏模板不得进入 hash/idle 或发布流程）。 */
function assertTemplateGateWords(text) {
  const captured = captureGateWords(parsePresetYaml(text))
  if (captured.state !== 'captured') {
    throw new Error('extra-plan: 厂商模板 gateWords ' + captured.state + '（config.gateWords 必须整组合法）')
  }
  return captured.values
}

/** 无旧值副本时的捕获结果（源缺席）。 */
export function noSourcePrevious(sourceDistHash = null) {
  return {
    audit: emptyMigration('absent', sourceDistHash),
    values: {},
    states: {},
    gateAudit: emptyGateWordsMigration('absent', sourceDistHash),
    gateValues: null,
    gateState: 'missing',
  }
}

/**
 * 读旧分发副本（$DSH_HOME/.agent-presets/extra-plan/agent.cordis.yml）并捕获 10 项 + 7 词。
 * 副本不存在 → 源缺席；读取失败 → 源不可读；解析失败 → 源不可读（不阻断启动）。
 */
export function capturePrevious(stateDir, sourceDistHash) {
  const sourceFile = join(stateDir, 'agent.cordis.yml')
  if (!existsSync(sourceFile)) return noSourcePrevious(sourceDistHash === undefined ? null : sourceDistHash)
  let text
  try {
    text = readFileSync(sourceFile, 'utf8')
  } catch {
    return {
      audit: emptyMigration('unreadable', sourceDistHash),
      values: {},
      states: {},
      gateAudit: emptyGateWordsMigration('unreadable', sourceDistHash),
      gateValues: null,
      gateState: 'unreadable',
    }
  }
  try {
    const captured = captureSettings(text)
    // 复用同一份解析文档：settings 与 gateWords 各自独立判定，互不影响。
    const gate = captureGateWords(captured.document)
    return {
      audit: {
        format: 1,
        sourceDistHash: sourceDistHash === undefined ? null : sourceDistHash,
        source: 'captured',
        results: {},
      },
      values: captured.values,
      states: captured.states,
      gateAudit: {
        format: 1,
        sourceDistHash: sourceDistHash === undefined ? null : sourceDistHash,
        source: 'captured',
        results: {},
      },
      gateValues: gate.state === 'captured' ? gate.values : null,
      gateState: gate.state,
    }
  } catch {
    return {
      audit: emptyMigration('unreadable', sourceDistHash),
      values: {},
      states: {},
      gateAudit: emptyGateWordsMigration('unreadable', sourceDistHash),
      gateValues: null,
      gateState: 'unreadable',
    }
  }
}

/**
 * 纯计算：把旧值副本的捕获结果翻译成「本次要落地的内容 + 审计」。
 * @param previous capturePrevious 的返回值
 * @returns { settings, preset, audit, gateAudit }
 *   settings.values = 8 项 settings 行新值（无 captured 项则 null）
 *   preset.hostRowConfig = 声明行 plugins 子行要改的 config（无 captured 项则为 {}）
 *   preset.gateWords = 7 词组（无 captured 组则 null）
 */
export function buildMigrationPlan(previous) {
  const audit = previous.audit
  const results = audit.results
  const settingsValues = {}
  let settingsCount = 0
  for (const definition of SETTING_DEFINITIONS) {
    // 源缺席/不可读：results 保持 emptyMigration 预填的状态字符串（缺席≠旧值缺失），
    // 不按 previous.states 覆写——否则会把 skipped-source-absent 误写成 skipped-old-missing。
    if (audit.source !== 'captured') continue
    const oldState = previous.states[definition.key]
    if (oldState !== 'captured') {
      results[definition.key] = reasonForOldState(oldState)
      continue
    }
    // 8 项 UI 设置落 settings 行 config；2 项宿主行落声明行 plugins 子行（见下方 hostRowConfig）。
    if (definition.group === SETTING_GROUPS.EXTRA_PLAN) {
      settingsValues[definition.key] = previous.values[definition.key]
      settingsCount += 1
    }
    results[definition.key] = 'restored'
  }

  const hostRowConfig = {}
  for (const definition of HOST_ROW_SETTING_DEFINITIONS) {
    if (results[definition.key] !== 'restored') continue
    hostRowConfig[HOST_ROW_IDS[definition.key]] = { [definition.key === 'webFetch' ? 'fetch' : 'mode']: previous.values[definition.key] }
  }

  const gateAudit = previous.gateAudit
  const gateResults = gateAudit.results
  let gateWords = null
  if (gateAudit.source === 'captured') {
    if (previous.gateState !== 'captured') {
      for (const field of GATE_WORD_FIELD_NAMES) gateResults[field] = gateReasonForState(previous.gateState)
    } else {
      for (const field of GATE_WORD_FIELD_NAMES) gateResults[field] = 'restored'
      gateWords = { ...previous.gateValues }
    }
  }

  const settings = settingsCount === 0 ? null : { values: settingsValues, audit }
  const preset = gateWords !== null || Object.keys(hostRowConfig).length > 0
    ? { hostRowConfig, gateWords }
    : null
  return { settings, preset, audit, gateAudit }
}

/** 声明行 plugins 整体重述：只改目标子行的指定 config 键（含 gateWords 整组校验，失败即抛）。 */
export function restatePresetPlugins(current, inherited, preset, basePlugins) {
  const fromCurrent = current !== null && typeof current === 'object' && Array.isArray(current.plugins) ? current.plugins : null
  const fromInherited = inherited !== null && typeof inherited === 'object' && Array.isArray(inherited.plugins) ? inherited.plugins : null
  // 本体基底 = 厂商模板（资产声明行）优先：保证 persona / deny / 注释等「本体」随资产刷新，
  // 再在下方把用户可写项（2 项宿主行 + gateWords）写回。未提供新模板时才回落既有顺序
  // （profile 现值 → 继承层），行为与修复前逐字一致。
  const base = Array.isArray(basePlugins) ? basePlugins : fromCurrent !== null ? fromCurrent : fromInherited
  if (base === null) throw new Error('声明行 ' + PRESET_ROW_ID + ' 的 config.plugins 不可定位')
  let plugins = structuredClone(base)
  for (const [rowId, config] of Object.entries(preset.hostRowConfig === undefined ? {} : preset.hostRowConfig)) {
    const next = restatePluginsRow(plugins, rowId, config)
    if (next === null) throw new Error('声明行 plugins 内缺少宿主行 ' + rowId)
    plugins = next
  }
  if (preset.gateWords !== null && preset.gateWords !== undefined) {
    const next = restatePluginsRow(plugins, 'extra-plan', { gateWords: preset.gateWords })
    if (next === null) throw new Error('声明行 plugins 内缺少 extra-plan 行（gateWords 无处落地）')
    const row = findPluginsRow(next, 'extra-plan')
    validateGateWords(row.config.gateWords)
    plugins = next
  }
  return { ...current, plugins }
}

/** 旧 flash-guide patch 清理（profiles 下各 cordis.patch.yml 契约保持，app-boot 兼容期行为）。 */
export function cleanupLegacyFlashGuidePatches(dshHome) {
  try {
    const root = join(dshHome, 'profiles')
    if (!existsSync(root)) return
    for (const name of readdirSync(root)) {
      const file = join(root, name, 'cordis.patch.yml')
      if (!existsSync(file)) continue
      const text = readFileSync(file, 'utf8')
      const lines = text.split('\n')
      const out = []
      let skipping = false
      for (const line of lines) {
        if (!skipping && /^-\s*id:\s*flash-guide\s*$/.test(line)) {
          skipping = true
          continue
        }
        if (skipping) {
          if (/^\S/.test(line)) skipping = false
          else continue
        }
        out.push(line)
      }
      const next = out.join('\n')
      if (next !== text) writeFileSync(file, next, 'utf8')
    }
  } catch { /* cleanup must not block startup */ }
}

/**
 * postinstall：只初始化插件自有状态目录 + 空 manifest（distHash=null + 双缺席审计）。
 * 台账已存在（含空台账本身）时一律 idle——postinstall 不参与迁移，绝不覆盖既有审计。
 */
export function initStateDir(dshHome) {
  const stateDir = stateDirOf(dshHome)
  mkdirSync(stateDir, { recursive: true })
  const existing = readManifestRecord(stateDir)
  if (existing !== null) return { action: 'idle', stateDir, manifest: existing }
  const manifest = {
    format: 2,
    distHash: null,
    settingsMigration: emptyMigration('absent', null),
    gateWordsMigration: emptyGateWordsMigration('absent', null),
  }
  writeManifest(stateDir, manifest)
  return { action: 'written', stateDir, manifest }
}

/**
 * 启动自愈主体：资产 hash + 声明行覆盖度判定 → 旧值迁移 → 审计落 manifest。
 * @param options.dshHome DSH_HOME（状态目录与旧值来源根）
 * @param options.declaredPlugins 声明行当前生效的 plugins（宿主侧由 configEditor 提供；
 *   非宿主路径传 undefined = 该维度不参与判定）
 * @param options.readPatch plugins 载体不可得时的旁证读取（可选，测试夹具用）
 * @param options.apply async (plan, context) => void 落地回调（宿主侧 = configEditor.edit；
 *   缺省 = 只算不落，postinstall/夹具路径）
 * @returns { action: 'written'|'upgraded'|'idle', plan? }
 */
export async function syncPreset(options = {}) {
  const dshHome = typeof options.dshHome === 'string' && options.dshHome !== '' ? options.dshHome : defaultDshHome()
  const stateDir = stateDirOf(dshHome)
  const templateFile = join(ASSET_DIR, 'agent.cordis.yml')
  if (!existsSync(templateFile)) throw new Error('预设模板缺失：' + templateFile)
  const templateText = readFileSync(templateFile, 'utf8')
  resolveTemplateSettingDefault(templateText, 'exploreBudget')
  // 厂商模板 gateWords 必须在 hash/idle 判定之前整组严格校验：坏模板立即抛错且不触碰目标物。
  assertTemplateGateWords(templateText)
  const currentHash = contentHash(ASSET_DIR)
  if (currentHash === null) throw new Error('预设资产缺失：' + ASSET_DIR)

  const manifest = readManifestRecord(stateDir)
  let declaredPlugins = options.declaredPlugins
  if (declaredPlugins === undefined && typeof options.readPatch === 'function') {
    declaredPlugins = readDeclaredPluginsFromPatch(options.readPatch())
  }
  const declarationOk = declaredPlugins === undefined ? true : declarationCoversAsset(declaredPlugins)
  // 第三个维度：本体内容。修复前只看「行 id 在不在」，于是「资产只有 config 值变化（如 deny 删项）」
  // 会被判为 idle 而永不更新（本次 0.1.7-rc.2 故障根因）。此处剥离用户可写键后比对本体。
  const assetBody = options.assetPlugins === undefined ? assetPlugins() : options.assetPlugins
  const bodyOk = declarationBodyMatchesAsset(declaredPlugins, assetBody)
  if (manifest !== null && manifest.distHash === currentHash && declarationOk && bodyOk) return { action: 'idle' }

  const previous = capturePrevious(stateDir, manifest === null ? null : manifest.distHash)
  const planned = buildMigrationPlan(previous)
  const firstRun = manifest === null || manifest.distHash === null
  const action = firstRun ? 'written' : 'upgraded'
  if (typeof options.apply === 'function') {
    await options.apply(planned, { stateDir, distHash: currentHash, action })
  }
  cleanupLegacyFlashGuidePatches(dshHome)
  writeManifest(stateDir, {
    format: 2,
    distHash: currentHash,
    settingsMigration: planned.audit,
    gateWordsMigration: planned.gateAudit,
  })
  return { action, plan: planned, stateDir, distHash: currentHash }
}

/** 从 profile patch 文本里读声明行 config.plugins（旁证；宿主侧以 configEditor 为准）。 */
export function readDeclaredPluginsFromPatch(text) {
  if (typeof text !== 'string' || text.trim() === '') return undefined
  let document
  try {
    document = parsePresetYaml(text)
  } catch {
    return undefined
  }
  const found = []
  const visit = (value) => {
    if (value === null || typeof value !== 'object') return
    if (Array.isArray(value)) {
      for (const item of value) visit(item)
      return
    }
    if (value.id === PRESET_ROW_ID && value.config !== null && typeof value.config === 'object' && Array.isArray(value.config.plugins)) {
      found.push(value.config.plugins)
    }
    for (const child of Object.values(value)) visit(child)
  }
  visit(document)
  return found.length === 0 ? undefined : found[0]
}

/**
 * 厂商模板（资产 patch）里的声明行 plugins —— 本体同步的基底来源。
 * 资产缺失 / 解析失败一律返回 undefined（调用方回落既有行为，绝不破坏现场）。
 */
export function assetPlugins() {
  try {
    if (!existsSync(ASSET_PATCH_FILE)) return undefined
    return readDeclaredPluginsFromPatch(readFileSync(ASSET_PATCH_FILE, 'utf8'))
  } catch {
    return undefined
  }
}

export const name = 'extra-plan-preset-sync'
export const inject = []

/**
 * 宿主入口：启动自愈。写盘只经 configEditor.edit（本模块不直写 cordis.patch.yml）。
 * 失败一律不阻断启动。
 */
export function apply(ctx) {
  ctx.inject(['configEditor'], (child) => {
    child.effect(() => {
      void (async () => {
        try {
          const editor = child.configEditor
          const rows = typeof editor.configuration === 'function' ? editor.configuration() : []
          const presetEntry = rows.find((row) => row !== null && typeof row === 'object' && row.entry !== undefined && row.entry.options !== undefined && row.entry.options.id === PRESET_ROW_ID)
          const declaredPlugins = presetEntry === undefined ? undefined : effectivePlugins(presetEntry)
          await syncPreset({
            dshHome: defaultDshHome(),
            declaredPlugins,
            apply: async (planned) => {
              await applyPlan(editor, rows, planned)
            },
          })
        } catch (error) {
          console.warn('[dsh-extra-plan] 预设启动自愈失败（不阻断启动）：' + (error instanceof Error ? error.message : String(error)))
        }
      })()
      return () => {}
    }, 'extra-plan-preset-sync: startup self-healing')
  })
}

/** 生效 plugins：profile override → Loader 行 config → 继承层。 */
function effectivePlugins(row) {
  const overridePlugins = row.override !== null && typeof row.override === 'object' && Array.isArray(row.override.plugins) ? row.override.plugins : null
  if (overridePlugins !== null) return overridePlugins
  const own = row.entry.options.config
  if (own !== null && typeof own === 'object' && Array.isArray(own.plugins)) return own.plugins
  const inherited = row.inherited
  if (inherited !== null && typeof inherited === 'object' && Array.isArray(inherited.plugins)) return inherited.plugins
  return undefined
}

async function applyPlan(editor, rows, planned) {
  const findEntry = (id) => {
    const row = rows.find((item) => item !== null && typeof item === 'object' && item.entry !== undefined && item.entry.options !== undefined && item.entry.options.id === id)
    return row === undefined ? undefined : row.entry
  }
  if (planned.settings !== null) {
    const entry = findEntry(SETTINGS_ROW_ID)
    if (entry === undefined) throw new Error('settings 行缺失：' + SETTINGS_ROW_ID)
    const values = planned.settings.values
    await editor.edit(entry, (current) => ({ ...current, ...values }))
  }
  if (planned.preset !== null) {
    const entry = findEntry(PRESET_ROW_ID)
    if (entry === undefined) throw new Error('声明行缺失：' + PRESET_ROW_ID)
    // 以厂商模板为基底重建本体，再把用户可写项（2 项宿主行 + gateWords）写回；
    // 修复前此处以 profile 现值为基底，导致本体（persona/deny/注释）永不跟随资产。
    await editor.edit(entry, (current, inherited) => restatePresetPlugins(current, inherited, planned.preset, assetPlugins()))
  }
}
