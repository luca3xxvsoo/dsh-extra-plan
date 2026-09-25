// Host-side preset self-healing over the dsh 0.1.7 preset carrier.
//
// 载体订正（方案 T2）：预设不再是「分发到 $DSH_HOME/.agent-presets/extra-plan 的目录」，
// 而是 profile patch 根级 insert 一行 preset-extra-plan 声明行
// （name '@deepseek-ai/dsh-agent-preset'，config.plugins = agent.cordis.yml 顶层条目逐字）。
// 于是：
//  - 分发目标退役；**本插件无项目自有状态目录**——运行期状态目录与台账链
//    （状态目录初始化 / 台账 manifest 读写 / postinstall 脚本）已于 2026-09-25 死代码清理整链删除。
//  - 启动自愈判定 = 三维：① 声明行 plugins 覆盖资产行 id 集合；② 本体剥离用户可写键后与资产
//    逐字一致；③ 2 项宿主行投影与权威值一致。
//    为什么不是「declaredPlugins 与资产逐字 hash 相等」：设置页写值会把整段 plugins
//    重述进 profile patch（configEditor.edit，config 不深合并），行集合不变而部分行 config
//    已按用户值改写——逐字 hash 永不相等会退化成「每次启动都重跑迁移」。故按行 id 集合判定。
//    资产本体变化由维度②的剥离比对覆盖，故运行期台账不是 idle 判据的必要条件。
//  - 写盘只经 configEditor.edit（事务 + reconcile + 回滚），本模块绝不直写 cordis.patch.yml。
//  - **权威值 vs 投影（2026-09-25 二轮）**：2 项宿主行设置（webFetch / toolPresentationMode）
//    的权威值在 settings 行；声明行 plugins 内 tool-web / tool-presentation 子行只是**投影**
//    （消费方是宿主行装载期快照，只有声明行子行能被宿主读到）。
//    投影被宿主删除 = 无害状态：投影值 == 出厂值时判稳态 idle（不反复重建），
//    权威值非出厂值则重建投影；settings 行缺项而声明行有非出厂值 → 一次性回填 settings 行。
//  - 0.1.6 及更早的搬迁链（旧分发副本捕获 / 迁移计划 / 审计状态机）已于 2026-09-25 整链删除
//    （用户 2026-09-25 拍板放弃）；现场 gateWords 由
//    restatePresetPlugins 的 carry 分支从声明行现值兜底。
//
// 本模块同时导出纯计算（declarationCoversAsset / declarationBodyMatchesAsset /
// planHostRowProjection / restatePresetPlugins 等）与宿主入口（apply），使启动自愈与回归夹具
// 共用同一份状态机。

import { createHash } from 'node:crypto'
import { existsSync, readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  HOST_ROW_IDS,
  HOST_ROW_LEAF_KEYS,
  HOST_ROW_SETTING_DEFINITIONS,
  PRESET_ROW_ID,
  PROJECTION_SETTING_DEFINITIONS,
  SETTINGS_ROW_ID,
  SETTING_DEFINITIONS,
  captureRowSettings,
  captureSettings,
  findPluginsRow,
  normalizeSettingValue,
  readPath,
  readProjectedValue,
  restatePluginsRow,
  validateSettingValue,
} from './preset-settings.js'
import {
  GATE_WORDS_GROUP_DEFINITION,
  validateGateWords,
} from './gate-words.js'
import { parsePresetYaml, resolveSetting, resolveTemplateSettingDefault } from './preset-settings.js'

const PRESET_ID = 'extra-plan'
export const CORE_FILES = ['preset.yml', 'agent.cordis.yml']
/** 声明行 plugins 必须承载的行 id（缺任一 → 声明行不再覆盖本预设组合）。 */
export const DECLARATION_ROW_IDS = Object.freeze([
  'extra-plan',
  HOST_ROW_IDS.webFetch,
  HOST_ROW_IDS.toolPresentationMode,
])

const HERE = dirname(fileURLToPath(import.meta.url))
export const ASSET_DIR = join(HERE, '..', 'assets', 'presets', PRESET_ID)
export const ASSET_PATCH_FILE = join(ASSET_DIR, 'preset-patch.generated.yml')

/**
 * DSH_HOME 解析（env 优先、默认 ~/.dsh）。
 * 保留导出：状态目录链删除后本模块已无内部调用方，仅为公共 API 与回归夹具保留。
 */
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
 * **与写回清单严格同源** —— 唯一来源是 HOST_ROW_SETTING_DEFINITIONS.projectionLocator
 * （2 项宿主行投影落点：tool-web.fetch / tool-presentation.mode）与 GATE_WORDS_GROUP_DEFINITION
 * （extra-plan.gateWords 整组）。任何未列于此的位置都属「资产本体」，必须随资产变化刷新。
 * 比对剥离表与搬运写回清单必须恒等，否则会出现「比对了却没写回 → 用户值被新模板吃掉」。
 * 注意这里用 projectionLocator（声明行 plugins 子行）而非 rowLocator（settings 行权威落点）：
 * settings 行不在声明行 plugins 里，与「本体剥离/比对」无关。
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
    const locator = definition.projectionLocator
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

/**
 * 从现有声明行抽出用户可写项（与剥离表 userWritableByRow 同源）——本体重建时的「保留」来源。
 * 以资产为基底重建本体时必须靠这里保住现场用户定制，
 * 否则会把用户的 2 项宿主行设置与 7 个闸门词一并覆盖掉。
 */
export function carryUserWritable(plugins) {
  const hostRowConfig = {}
  let gateWords = null
  if (!Array.isArray(plugins)) return { hostRowConfig, gateWords }
  const table = userWritableByRow()
  const gateRowId = GATE_WORDS_GROUP_DEFINITION.rowId
  const prefix = 'config.'
  const gatePath = GATE_WORDS_GROUP_DEFINITION.path
  const gateKey = gatePath.startsWith(prefix) ? gatePath.slice(prefix.length) : gatePath
  const visit = (rows) => {
    for (const row of rows) {
      if (row === null || typeof row !== 'object') continue
      if (Array.isArray(row.config)) {
        visit(row.config)
        continue
      }
      if (typeof row.id !== 'string' || row.config === null || typeof row.config !== 'object') continue
      const writable = table.get(row.id)
      if (writable === undefined) continue
      const pick = {}
      for (const key of writable) {
        if (Object.prototype.hasOwnProperty.call(row.config, key)) pick[key] = row.config[key]
      }
      if (Object.keys(pick).length === 0) continue
      if (row.id === gateRowId) {
        if (Object.prototype.hasOwnProperty.call(pick, gateKey)) gateWords = pick[gateKey]
        continue
      }
      const merged = hostRowConfig[row.id] === undefined ? {} : hostRowConfig[row.id]
      hostRowConfig[row.id] = { ...merged, ...pick }
    }
  }
  visit(plugins)
  return { hostRowConfig, gateWords }
}

/**
 * 生效行 config（宿主 configuration() 行 → config 对象）：
 * inherited 层 → Loader 行 declared config → profile override，逐层浅合并、高优先层胜。
 * 宿主 configuration() 的 override 就是该行的 config 对象本身
 * （dsh-config-editor configuration()：patches.findLast(row => row.id === id && row.config !== undefined)?.config ?? {}），
 * 另兼容 override.config 的行节点形状以防宿主换代。无任何层 → null（不可判定）。
 */
export function effectiveRowConfig(row) {
  if (row === null || typeof row !== 'object') return null
  const isPlain = (value) => value !== null && typeof value === 'object' && !Array.isArray(value)
  const layers = []
  if (isPlain(row.inherited)) layers.push(row.inherited)
  const own = row.entry !== undefined && row.entry.options !== undefined ? row.entry.options.config : undefined
  if (isPlain(own)) layers.push(own)
  const override = row.override
  if (isPlain(override)) {
    if (isPlain(override.config)) layers.push(override.config)
    else layers.push(override)
  }
  return layers.length === 0 ? null : Object.assign({}, ...layers)
}

/**
 * 权威值读取（settings 行 = 10 项设置的唯一权威落点）：
 *  - 宿主侧：options.settingsValues（configuration() 内 SETTINGS_ROW_ID 行的生效 config）
 *    → present=true（行在，缺键即「缺项」→ 可一次性回填）。
 *  - 夹具/旁路侧：options.readPatch() 文本经 captureRowSettings（同一 rowLocator）捕获，
 *    rowPresent 区分「行缺席（不可判定）」与「行在但缺项（可回填）」。
 * 两者皆无 → { present:false, values:{} }：信息不全时不改写现场（与 declarationBodyMatchesAsset 同口径）。
 */
export function readAuthoritySettings(options) {
  const input = options !== null && typeof options === 'object' ? options : {}
  const provided = input.settingsValues
  if (provided !== undefined && provided !== null && typeof provided === 'object' && !Array.isArray(provided)) {
    const values = {}
    for (const definition of SETTING_DEFINITIONS) {
      const raw = provided[definition.key]
      if (validateSettingValue(definition, raw)) values[definition.key] = normalizeSettingValue(definition, raw)
    }
    return { present: true, values }
  }
  if (typeof input.readPatch === 'function') {
    let text = ''
    try { text = input.readPatch() } catch { return { present: false, values: {} } }
    if (typeof text === 'string' && text.trim() !== '') {
      try {
        const captured = captureRowSettings(text, SETTING_DEFINITIONS)
        return { present: captured.rowPresent === true, values: captured.values }
      } catch { /* YAML 非法 → 不可判定，保守不改写现场 */ }
    }
  }
  return { present: false, values: {} }
}

/** 出厂默认（2 项宿主行设置）：读厂商模板叶值（sourceLocator），缺项/解析失败回落内置兜底。 */
export function hostRowDefaultsOf(templateText) {
  const fallback = { webFetch: false, toolPresentationMode: 'native' }
  try {
    const captured = captureSettings(templateText)
    const out = {}
    for (const definition of PROJECTION_SETTING_DEFINITIONS) {
      const key = definition.key
      const hit = captured.states[key] === 'captured' && Object.prototype.hasOwnProperty.call(captured.values, key)
      out[key] = hit ? captured.values[key] : fallback[key]
    }
    return out
  } catch {
    return fallback
  }
}

/**
 * 投影叶是否存在（键在不在；值是否合法另判）——把「键缺失」与「键在但值非法」区分开：
 * 前者是无害删除（按出厂值参与比较，可稳态 idle），后者必须按权威值/出厂值修复。
 */
function projectionLeafExists(plugins, definition) {
  const locator = definition.projectionLocator
  const row = findPluginsRow(plugins, locator.pluginsRowId)
  if (row === null) return false
  return readPath(row, locator.path).exists
}

/**
 * 投影一致性判定 + 投影 plan（2 项宿主行设置）。纯计算，不写盘。
 * 期望投影值 T：① 权威值（settings 行现值）有该键 → T = 权威值；
 *              ② 权威缺项而声明行有非出厂值 → T = 声明行现值，并记入 backfill（一次性回填 settings 行）；
 *              ③ 其余 → T = 出厂默认。
 * 当前投影值 C = 声明行子行现值；投影缺失（宿主删行/删键）按出厂默认参与比较 ——
 * 于是「权威 == 出厂 且 投影缺失」判一致 → 稳态 idle（不反复重建、不空转写盘）；
 * 键在但值非法（手改 YAML 等）不算「缺失」，一律按 T 修复。
 * @returns { needed, backfill, targets, hostRowConfig }：
 *   needed = 需要写盘（投影不一致/非法 或 需回填 settings 行）；hostRowConfig = 只含需改写的投影键。
 */
export function planHostRowProjection(authority, declaredPlugins, defaults, extraAuthority) {
  const authorityValues = {
    ...(authority !== null && typeof authority === 'object' && authority.values !== undefined ? authority.values : {}),
    ...(extraAuthority !== null && typeof extraAuthority === 'object' && !Array.isArray(extraAuthority) ? extraAuthority : {}),
  }
  const settingsRowHas = authority !== null && typeof authority === 'object' && authority.present === true
  const factory = defaults !== null && typeof defaults === 'object' ? defaults : {}
  const backfill = {}
  const targets = {}
  const hostRowConfig = {}
  let needed = false
  for (const definition of PROJECTION_SETTING_DEFINITIONS) {
    const key = definition.key
    const defaultValue = factory[key]
    const current = readProjectedValue(declaredPlugins, definition)
    const captured = Object.prototype.hasOwnProperty.call(authorityValues, key)
    let target
    if (captured) {
      target = authorityValues[key]
    } else if (current !== undefined && current !== defaultValue) {
      // 权威值缺项而现场（声明行投影）有非出厂值：升级前的旧落点 → 一次性回填 settings 行。
      target = current
      if (settingsRowHas) backfill[key] = current
    } else {
      target = defaultValue
    }
    targets[key] = target
    const projected = current === undefined ? defaultValue : current
    const invalidLeaf = current === undefined && projectionLeafExists(declaredPlugins, definition)
    if (projected !== target || invalidLeaf) {
      needed = true
      const locator = definition.projectionLocator
      const merged = hostRowConfig[locator.pluginsRowId] === undefined ? {} : hostRowConfig[locator.pluginsRowId]
      hostRowConfig[locator.pluginsRowId] = { ...merged, [HOST_ROW_LEAF_KEYS[key]]: target }
    }
  }
  if (Object.keys(backfill).length > 0) needed = true
  return { needed, backfill, targets, hostRowConfig }
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

/** 声明行 plugins 整体重述：只改目标子行的指定 config 键（含 gateWords 整组校验，失败即抛）。 */
export function restatePresetPlugins(current, inherited, preset, basePlugins) {
  const fromCurrent = current !== null && typeof current === 'object' && Array.isArray(current.plugins) ? current.plugins : null
  const fromInherited = inherited !== null && typeof inherited === 'object' && Array.isArray(inherited.plugins) ? inherited.plugins : null
  // 本体基底 = 厂商模板（资产声明行）优先：保证 persona / deny / 注释等「本体」随资产刷新，
  // 再在下方把用户可写项（2 项宿主行 + gateWords）写回。未提供新模板时才回落既有顺序
  // （profile 现值 → 继承层），行为与修复前逐字一致。
  const base = Array.isArray(basePlugins) ? basePlugins : fromCurrent !== null ? fromCurrent : fromInherited
  if (base === null) throw new Error('声明行 ' + PRESET_ROW_ID + ' 的 config.plugins 不可定位')
  const presetPlan = preset !== null && typeof preset === 'object' ? preset : {}
  let plugins = structuredClone(base)
  // 用户可写项取值：显式迁移值优先；缺省时从当前声明行保留（无旧副本场景下这是唯一的用户值来源）。
  const carry = carryUserWritable(fromCurrent)
  const explicitHostRows = presetPlan.hostRowConfig !== null && typeof presetPlan.hostRowConfig === 'object' ? presetPlan.hostRowConfig : {}
  const hostRowConfig = { ...carry.hostRowConfig, ...explicitHostRows }
  for (const [rowId, config] of Object.entries(hostRowConfig)) {
    const next = restatePluginsRow(plugins, rowId, config)
    if (next === null) throw new Error('声明行 plugins 内缺少宿主行 ' + rowId)
    plugins = next
  }
  const explicitGateWords = presetPlan.gateWords !== null && presetPlan.gateWords !== undefined ? presetPlan.gateWords : null
  if (explicitGateWords !== null) {
    const next = restatePluginsRow(plugins, 'extra-plan', { gateWords: explicitGateWords })
    if (next === null) throw new Error('声明行 plugins 内缺少 extra-plan 行（gateWords 无处落地）')
    const row = findPluginsRow(next, 'extra-plan')
    validateGateWords(row.config.gateWords)
    plugins = next
  } else if (carry.gateWords !== null && carry.gateWords !== undefined) {
    // 现场词表来自声明行现值：非法时跳过词表写回（保留基底值），不阻断本体刷新。
    try {
      const next = restatePluginsRow(plugins, 'extra-plan', { gateWords: carry.gateWords })
      if (next !== null) {
        const row = findPluginsRow(next, 'extra-plan')
        validateGateWords(row.config.gateWords)
        plugins = next
      }
    } catch {
      // 保留基底词表。
    }
  }
  return { ...current, plugins }
}

/**
 * 启动自愈主体：声明行覆盖度 + 本体内容 + 投影一致性（三维）→ 投影/回填 → 经注入的 apply 落地。
 * @param options.declaredPlugins 声明行当前生效的 plugins（宿主侧由 configEditor 提供；
 *   非宿主路径传 undefined = 该维度不参与判定）
 * @param options.settingsValues settings 行（权威值载体）的生效 config（宿主侧由
 *   configuration() 内 SETTINGS_ROW_ID 行给出；给了即视为「行存在」）
 * @param options.readPatch plugins 载体不可得时的旁证读取（可选，测试夹具用；权威值也从同一文本捕获）
 * @param options.apply async (plan, context) => void 落地回调（宿主侧 = configEditor.edit；
 *   缺省 = 只算不落，夹具路径）
 * @returns { action: 'written'|'idle', plan? }
 */
export async function syncPreset(options = {}) {
  const templateFile = join(ASSET_DIR, 'agent.cordis.yml')
  if (!existsSync(templateFile)) throw new Error('预设模板缺失：' + templateFile)
  const templateText = readFileSync(templateFile, 'utf8')
  resolveTemplateSettingDefault(templateText, 'exploreBudget')
  // 厂商模板 gateWords 必须在 hash/idle 判定之前整组严格校验：坏模板立即抛错且不触碰目标物。
  assertTemplateGateWords(templateText)
  const currentHash = contentHash(ASSET_DIR)
  if (currentHash === null) throw new Error('预设资产缺失：' + ASSET_DIR)

  let declaredPlugins = options.declaredPlugins
  if (declaredPlugins === undefined && typeof options.readPatch === 'function') {
    declaredPlugins = readDeclaredPluginsFromPatch(options.readPatch())
  }
  const declarationOk = declaredPlugins === undefined ? true : declarationCoversAsset(declaredPlugins)
  // 第二个维度：本体内容。修复前只看「行 id 在不在」，于是「资产只有 config 值变化（如 deny 删项）」
  // 会被判为 idle 而永不更新（本次 0.1.7-rc.2 故障根因）。此处剥离用户可写键后比对本体。
  const assetBody = options.assetPlugins === undefined ? assetPlugins() : options.assetPlugins
  const bodyOk = declarationBodyMatchesAsset(declaredPlugins, assetBody)
  // 第三个维度：投影一致性。2 项宿主行设置的权威值在 settings 行，声明行子行只是投影；
  // 「投影值 == 出厂值且声明行缺失」在此判为一致（稳态 idle，不反复重建、不空转写盘）。
  // 三维全成立即 idle：不读也不写任何运行期台账（台账链已整链删除）。
  const hostRowDefaults = hostRowDefaultsOf(templateText)
  const authority = readAuthoritySettings(options)
  const projectionCheck = planHostRowProjection(authority, declaredPlugins, hostRowDefaults)
  if (declarationOk && bodyOk && !projectionCheck.needed) return { action: 'idle' }

  const projection = projectionCheck
  const planned = {}
  // 一次性回填：settings 行缺项 且 声明行子行有非出厂值 → 把旧落点的值补进 settings 行（权威值上移）。
  const backfillKeys = Object.keys(projection.backfill)
  planned.settings = backfillKeys.length > 0
    ? { values: Object.fromEntries(backfillKeys.map((key) => [key, projection.backfill[key]])) }
    : null
  // 投影 plan：只含需改写的投影键；gateWords 由 restatePresetPlugins 的 carry 分支
  // 从声明行现值兜底，故此处恒为 null。
  planned.preset = Object.keys(projection.hostRowConfig).length > 0
    ? { hostRowConfig: projection.hostRowConfig, gateWords: null }
    : null
  // 本体过期标记：本体比对不通过时 planned.preset 可能为 null，若无此标记则「本体刷新」会被
  // applyPlan 的 preset 条件一并跳过（2026-09-25 现场实测：判非 idle 却什么都不写）。
  planned.bodyStale = !bodyOk
  if (typeof options.apply === 'function') {
    await options.apply(planned, { action: 'written' })
  }
  return { action: 'written', plan: planned }
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
          // 权威值载体 = settings 行（本插件自有行，宿主不清理）：投影一致性判定与 2 项宿主行的
          // 一次性回填都按它读；行缺席（宿主未装载 settings 组件）→ settingsValues 为 undefined
          // → 该维度不参与判定（保守，不改写现场）。
          const settingsEntry = rows.find((row) => row !== null && typeof row === 'object' && row.entry !== undefined && row.entry.options !== undefined && row.entry.options.id === SETTINGS_ROW_ID)
          const settingsValues = settingsEntry === undefined ? undefined : effectiveRowConfig(settingsEntry)
          await syncPreset({
            declaredPlugins,
            settingsValues,
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
  // 本体过期的非 idle 运行 planned.preset 可能为 null（只有本体需刷新），若无 bodyStale 标记
  // 会连本体刷新一起跳过，形成「每次启动判非 idle 却什么都不写」的永不自愈循环。
  if (planned.preset !== null || planned.bodyStale === true) {
    const entry = findEntry(PRESET_ROW_ID)
    if (entry === undefined) throw new Error('声明行缺失：' + PRESET_ROW_ID)
    const presetPlan = planned.preset !== null ? planned.preset : { hostRowConfig: {}, gateWords: null }
    // 以厂商模板为基底重建本体，再把用户可写项（2 项宿主行 + gateWords）写回；
    // 修复前此处以 profile 现值为基底，导致本体（persona/deny/注释）永不跟随资产。
    await editor.edit(entry, (current, inherited) => restatePresetPlugins(current, inherited, presetPlan, assetPlugins()))
  }
}
