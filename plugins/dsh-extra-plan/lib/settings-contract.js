// 服务端设置的单一 descriptor 合同；默认值与生成常量同源。
import { DEFAULT_EXPLORE_BUDGET, DEFAULT_PLANNER_PROMPT_SUFFIX } from './preset-defaults.generated.js'

const isString = (value) => typeof value === 'string'
const isPositiveInteger = (value) => typeof value === 'number' && Number.isInteger(value) && value > 0
const isBoolean = (value) => typeof value === 'boolean'
const modeOptions = Object.freeze(['native', 'ptc', 'both'])
const isMode = (value) => typeof value === 'string' && modeOptions.includes(value)

/** 新载体行 id（settings 命名空间 = profile 行 id）。 */
export const SETTINGS_ROW_ID = 'dsh-extra-plan-settings'
/** 预设声明行 id（config.plugins = agent.cordis.yml 顶层条目）。 */
export const PRESET_ROW_ID = 'preset-extra-plan'
/** 声明行 plugins 内承载 2 项宿主行设置的子行 id（投影落点的行 id）。 */
export const HOST_ROW_IDS = Object.freeze({ webFetch: 'tool-web', toolPresentationMode: 'tool-presentation' })
/** 投影落点的叶键（宿主行 config 内键名）：源模板与投影共用同一份 leaf 名，不新增第二份键名清单。 */
export const HOST_ROW_LEAF_KEYS = Object.freeze({ webFetch: 'fetch', toolPresentationMode: 'mode' })
/** descriptor 分组（消费方）：8 项落 settings 行 / 2 项另投影到声明行 plugins 子行。 */
export const SETTING_GROUPS = Object.freeze({ EXTRA_PLAN: 'extra-plan', HOST_ROWS: 'host-rows' })

const setting = (definition) => Object.freeze({
  ...definition,
  type: definition.scalarType,
  sourceLocator: Object.freeze({ ...definition.sourceLocator }),
  rowLocator: Object.freeze({ ...definition.rowLocator }),
  ...(definition.projectionLocator === undefined
    ? {}
    : { projectionLocator: Object.freeze({ ...definition.projectionLocator }) }),
  locatorAliases: Object.freeze((definition.locatorAliases || []).map((alias) => Object.freeze({
    rowId: alias.rowId,
    path: alias.path,
  }))),
  ui: Object.freeze({
    ...definition.ui,
    options: definition.ui.options === undefined ? undefined : Object.freeze([...definition.ui.options]),
    optionLocale: definition.ui.optionLocale === undefined
      ? undefined
      : Object.freeze({ ...definition.ui.optionLocale }),
  }),
})

/** 权威值落点：settings 行（10 项统一）config.<key>。 */
const settingsRowLocator = (key, path) => ({ rowId: SETTINGS_ROW_ID, path: path === undefined ? 'config.' + key : path })
const sourceLocator = (key, path) => ({ rowId: 'extra-plan', path: path === undefined ? 'config.' + key : path })
/** 投影落点：声明行 plugins 内 host-rows 子行 config.<leaf>（leaf 名与源模板同名）。 */
const hostRowProjectionLocator = (key) => ({
  rowId: PRESET_ROW_ID,
  pluginsRowId: HOST_ROW_IDS[key],
  path: 'config.' + HOST_ROW_LEAF_KEYS[key],
})

export const SETTING_DEFINITIONS = Object.freeze([
  setting({
    key: 'anchoredBootstrap', group: SETTING_GROUPS.EXTRA_PLAN, scalarType: 'boolean', defaultValue: true,
    sourceLocator: sourceLocator('anchoredBootstrap'), rowLocator: settingsRowLocator('anchoredBootstrap'),
    validator: isBoolean, ui: { control: 'select', options: [true, false], locale: 'anchoredBootstrap', section: 'general' }, locatorAliases: [],
  }),
  setting({
    key: 'creativeMode', group: SETTING_GROUPS.EXTRA_PLAN, scalarType: 'boolean', defaultValue: false,
    sourceLocator: sourceLocator('creativeMode'), rowLocator: settingsRowLocator('creativeMode'),
    validator: isBoolean, ui: { control: 'select', options: [true, false], locale: 'creativeMode', section: 'general' }, locatorAliases: [],
  }),
  setting({
    key: 'webFetch', group: SETTING_GROUPS.HOST_ROWS, scalarType: 'boolean', defaultValue: false,
    // 源模板行 = 投影落点同行同叶（tool-web.config.fetch）；
    // 权威值落点 = settings 行 config.webFetch；投影落点 = 声明行 tool-web 子行（须与源同形）。
    sourceLocator: { rowId: HOST_ROW_IDS.webFetch, path: 'config.' + HOST_ROW_LEAF_KEYS.webFetch },
    rowLocator: settingsRowLocator('webFetch'),
    projectionLocator: hostRowProjectionLocator('webFetch'),
    validator: isBoolean, ui: { control: 'select', options: [true, false], locale: 'webFetch', section: 'general' }, locatorAliases: [],
  }),
  setting({
    key: 'toolPresentationMode', group: SETTING_GROUPS.HOST_ROWS, scalarType: 'mode', defaultValue: 'native',
    sourceLocator: { rowId: HOST_ROW_IDS.toolPresentationMode, path: 'config.' + HOST_ROW_LEAF_KEYS.toolPresentationMode },
    rowLocator: settingsRowLocator('toolPresentationMode'),
    projectionLocator: hostRowProjectionLocator('toolPresentationMode'),
    validator: isMode,
    ui: {
      control: 'select', options: modeOptions,
      optionLocale: { native: 'toolPresentationModeNative', ptc: 'toolPresentationModePtc', both: 'toolPresentationModeBoth' },
      locale: 'toolPresentationMode',
      section: 'general',
    },
    locatorAliases: [],
  }),
  setting({
    key: 'runcodeCatchGate', group: SETTING_GROUPS.EXTRA_PLAN, scalarType: 'boolean', defaultValue: false,
    sourceLocator: sourceLocator('runcodeCatchGate'), rowLocator: settingsRowLocator('runcodeCatchGate'),
    validator: isBoolean, ui: { control: 'select', options: [true, false], locale: 'runcodeCatchGate', section: 'general' }, locatorAliases: [],
  }),
  setting({
    key: 'crossProviderPlannerModel', group: SETTING_GROUPS.EXTRA_PLAN, scalarType: 'boolean', defaultValue: false,
    sourceLocator: sourceLocator('crossProviderPlannerModel'), rowLocator: settingsRowLocator('crossProviderPlannerModel'),
    validator: isBoolean, ui: { control: 'select', options: [true, false], locale: 'crossProviderPlannerModel', section: 'pro' }, locatorAliases: [],
  }),
  setting({
    key: 'plannerModel', group: SETTING_GROUPS.EXTRA_PLAN, scalarType: 'string', defaultValue: 'deepseek-v4-pro',
    sourceLocator: sourceLocator('plannerModel'), rowLocator: settingsRowLocator('plannerModel'),
    // T4：允许空串（= 显式清空 = 继承主会话模型；解析侧只判 !==''，键缺失才用代码缺省值）。
    // 空白串经 normalize trim 归一为 ''，与空串同义；非 string（如 YAML 数字）仍非法。
    validator: isString, normalize: (value) => value.trim(),
    ui: { control: 'text', locale: 'plannerModel', section: 'pro' }, locatorAliases: [],
  }),
  setting({
    key: 'plannerPromptSuffix', group: SETTING_GROUPS.EXTRA_PLAN, scalarType: 'string', defaultValue: DEFAULT_PLANNER_PROMPT_SUFFIX,
    sourceLocator: sourceLocator('plannerPromptSuffix'), rowLocator: settingsRowLocator('plannerPromptSuffix'),
    validator: isString, ui: { control: 'textarea', locale: 'plannerPromptSuffix', section: 'pro' }, locatorAliases: [],
  }),
  setting({
    key: 'exploreBudget', group: SETTING_GROUPS.EXTRA_PLAN, scalarType: 'integer', defaultValue: DEFAULT_EXPLORE_BUDGET,
    sourceLocator: sourceLocator('exploreBudget'), rowLocator: settingsRowLocator('exploreBudget'),
    validator: isPositiveInteger, ui: { control: 'number', min: 1, step: 1, locale: 'exploreBudget', section: 'pro' }, locatorAliases: [],
  }),
  setting({
    key: 'otherAgentModel', group: SETTING_GROUPS.EXTRA_PLAN, scalarType: 'string', defaultValue: '',
    sourceLocator: sourceLocator('otherAgentModel'), rowLocator: settingsRowLocator('otherAgentModel'),
    validator: isString, normalize: (value) => value.trim(),
    ui: { control: 'text', locale: 'otherAgentModel', section: 'pro' }, locatorAliases: [],
  }),
])

/** 8 项 UI 设置（权威值落 settings 行；= live-config 热读键集合）。 */
export const EXTRA_PLAN_SETTING_DEFINITIONS = Object.freeze(
  SETTING_DEFINITIONS.filter((item) => item.group === SETTING_GROUPS.EXTRA_PLAN),
)
/** 2 项宿主行设置（权威值同样落 settings 行；另经 projectionLocator 投影到声明行 plugins 子行）。 */
export const HOST_ROW_SETTING_DEFINITIONS = Object.freeze(
  SETTING_DEFINITIONS.filter((item) => item.group === SETTING_GROUPS.HOST_ROWS),
)
/** 带投影面的设置（= 2 项宿主行设置）——投影一致性与投影 plan 的唯一遍历源。 */
export const PROJECTION_SETTING_DEFINITIONS = Object.freeze(
  SETTING_DEFINITIONS.filter((item) => item.projectionLocator !== undefined),
)

export const TOOL_PRESENTATION_MODES = Object.freeze([
  ...SETTING_DEFINITIONS.find((item) => item.key === 'toolPresentationMode').ui.options,
])
const descriptorByKey = new Map(SETTING_DEFINITIONS.map((item) => [item.key, item]))

export function getSettingDefinition(key) {
  return descriptorByKey.get(key)
}

export function validateSettingValue(definition, value) {
  return definition !== undefined && typeof definition.validator === 'function' && definition.validator(value)
}

export function normalizeSettingValue(definition, value) {
  return typeof definition.normalize === 'function' ? definition.normalize(value) : value
}

