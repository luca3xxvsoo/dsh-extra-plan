// 服务端设置的单一 descriptor 合同；默认值与生成常量同源。
import { DEFAULT_SETTINGS } from './preset-defaults.generated.js'
export { DEFAULT_SETTINGS }

const isString = (value) => typeof value === 'string'
const isPositiveInteger = (value) => typeof value === 'number' && Number.isInteger(value) && value > 0
const isBoolean = (value) => typeof value === 'boolean'
// 0.2.2：executor 行身份模型——呈现模式由宿主行 id 承载（tool-executor-native / tool-executor-ptc）。
const modeOptions = Object.freeze(['native', 'ptc'])
const isMode = (value) => typeof value === 'string' && modeOptions.includes(value)

/** 新载体行 id（settings 命名空间 = profile 行 id）。 */
export const SETTINGS_ROW_ID = 'dsh-extra-plan-settings'
/** settings 行的规范 name：定位落点 = 行 id + 该 name 双条件（旧 @local 别名行不再作候选）。 */
export const SETTINGS_ROW_NAME = 'dsh-extra-plan/settings'
/**
 * 声明行 plugins 内承载宿主行设置的子行 id（投影落点的行 id）。
 * toolPresentationMode 用行身份承载模式（两个 executor 行 id），不再有叶键。
 */
export const HOST_ROW_IDS = Object.freeze({
  webFetch: 'tool-web',
  toolPresentationMode: Object.freeze({ native: 'tool-executor-native', ptc: 'tool-executor-ptc' }),
})
/** 行 id → 呈现模式的唯一映射源：键由 HOST_ROW_IDS.toolPresentationMode 派生，不再另写字面量。 */
export const MODE_BY_ROW_ID = Object.freeze({
  [HOST_ROW_IDS.toolPresentationMode.native]: 'native',
  [HOST_ROW_IDS.toolPresentationMode.ptc]: 'ptc',
})
/** executor 宿主行包名前缀：name = 前缀 + 裸模式名（native/ptc）；运行期行 id 是裸行 id（不带包名前缀），两种形态不得混用。 */
export const EXECUTOR_TOOL_NAME_PREFIX = '@deepseek-ai/dsh-tool-executor-'
/** 投影落点的叶键（宿主行 config 内键名）：源模板与投影共用同一份 leaf 名，不新增第二份键名清单。 */
export const HOST_ROW_LEAF_KEYS = Object.freeze({ webFetch: 'fetch' })
/** descriptor 分组（消费方）：11 项统一落 settings 全局行；2 项另派生到内存 definition。 */
export const SETTING_GROUPS = Object.freeze({ EXTRA_PLAN: 'extra-plan', HOST_ROWS: 'host-rows' })

const setting = (definition) => Object.freeze({
  ...definition,
  type: definition.scalarType,
  sourceLocator: Object.freeze({
    ...definition.sourceLocator,
    ...(definition.sourceLocator.rowIds === undefined
      ? {}
      : { rowIds: Object.freeze([...definition.sourceLocator.rowIds]) }),
    ...(definition.sourceLocator.modeByRowId === undefined
      ? {}
      : { modeByRowId: Object.freeze({ ...definition.sourceLocator.modeByRowId }) }),
  }),
  rowLocator: Object.freeze({ ...definition.rowLocator }),
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

/**
 * 权威值落点：settings 行（11 项统一）config.<key>，rowName 精确过滤规范名
 * （旧 @local/dsh-extra-plan/settings 别名行不参与候选；descriptor 的 locatorAliases 均为空）。
 */
export const settingsRowLocator = (key, path) => ({
  rowId: SETTINGS_ROW_ID,
  rowName: SETTINGS_ROW_NAME,
  path: path === undefined ? 'config.' + key : path,
})
const sourceLocator = (key, path) => ({ rowId: 'extra-plan', path: path === undefined ? 'config.' + key : path })

export const SETTING_DEFINITIONS = Object.freeze([
  setting({
    key: 'anchoredBootstrap', group: SETTING_GROUPS.EXTRA_PLAN, scalarType: 'boolean', defaultValue: DEFAULT_SETTINGS.anchoredBootstrap,
    sourceLocator: sourceLocator('anchoredBootstrap'), rowLocator: settingsRowLocator('anchoredBootstrap'),
    validator: isBoolean, ui: { control: 'select', options: [true, false], locale: 'anchoredBootstrap', section: 'general', hint: '首轮极简工具 + 提示词 ｜ 新会话/新子代理生效' }, locatorAliases: [],
  }),
  setting({
    key: 'creativeMode', group: SETTING_GROUPS.EXTRA_PLAN, scalarType: 'boolean', defaultValue: DEFAULT_SETTINGS.creativeMode,
    sourceLocator: sourceLocator('creativeMode'), rowLocator: settingsRowLocator('creativeMode'),
    validator: isBoolean, ui: { control: 'select', options: [true, false], locale: 'creativeMode', section: 'general', hint: '是否开启dsh官方创造模式 ｜ 立即生效' }, locatorAliases: [],
  }),
  setting({
    key: 'webFetch', group: SETTING_GROUPS.HOST_ROWS, scalarType: 'boolean', defaultValue: DEFAULT_SETTINGS.webFetch,
    // 源模板行 = 宿主行同叶（tool-web.config.fetch）；权威值落点 = settings 行 config.webFetch。
    sourceLocator: { rowId: HOST_ROW_IDS.webFetch, path: 'config.' + HOST_ROW_LEAF_KEYS.webFetch },
    rowLocator: settingsRowLocator('webFetch'),
    validator: isBoolean, ui: { control: 'select', options: [true, false], locale: 'webFetch', section: 'general', hint: '是否开启web_fetch ｜ 重启生效' }, locatorAliases: [],
  }),
  setting({
    key: 'toolPresentationMode', group: SETTING_GROUPS.HOST_ROWS, scalarType: 'mode', defaultValue: DEFAULT_SETTINGS.toolPresentationMode,
    // 行身份模型：值 = 命中的 executor 行 id 对应的 mode（两个行 id 合计恰 1 命中），无 config 叶键。
    sourceLocator: {
      rowIds: [HOST_ROW_IDS.toolPresentationMode.native, HOST_ROW_IDS.toolPresentationMode.ptc],
      modeByRowId: MODE_BY_ROW_ID,
    },
    rowLocator: settingsRowLocator('toolPresentationMode'),
    validator: isMode,
    ui: {
      control: 'select', options: modeOptions,
      optionLocale: { native: 'toolPresentationModeNative', ptc: 'toolPresentationModePtc' },
      locale: 'toolPresentationMode',
      section: 'general',
      hint: '工具执行器切换（默认/PTC模式），无法进行会话内切换 ｜ 重启生效',
    },
    locatorAliases: [],
  }),
  setting({
    key: 'runcodeCatchGate', group: SETTING_GROUPS.EXTRA_PLAN, scalarType: 'boolean', defaultValue: DEFAULT_SETTINGS.runcodeCatchGate,
    sourceLocator: sourceLocator('runcodeCatchGate'), rowLocator: settingsRowLocator('runcodeCatchGate'),
    validator: isBoolean, ui: { control: 'select', options: [true, false], locale: 'runcodeCatchGate', section: 'general', hint: 'PTC模式下，增加每个工具调用需要try catch的闸门。通过限制+建议的模式保障仅单个调用报错 ｜ 立即生效' }, locatorAliases: [],
  }),
  setting({
    key: 'crossProviderPlannerModel', group: SETTING_GROUPS.EXTRA_PLAN, scalarType: 'boolean', defaultValue: DEFAULT_SETTINGS.crossProviderPlannerModel,
    sourceLocator: sourceLocator('crossProviderPlannerModel'), rowLocator: settingsRowLocator('crossProviderPlannerModel'),
    validator: isBoolean, ui: { control: 'select', options: [true, false], locale: 'crossProviderPlannerModel', section: 'pro', hint: '允许跨提供方选择模型。开启时将以 其他提供方 - 主会话提供方 - deepseek官方 的顺序，获取可用模型。关闭时仅从主会话提供方获取。默认关闭 ｜ 新会话/新子代理生效' }, locatorAliases: [],
  }),
  setting({
    key: 'plannerModel', group: SETTING_GROUPS.EXTRA_PLAN, scalarType: 'string', defaultValue: DEFAULT_SETTINGS.plannerModel,
    sourceLocator: sourceLocator('plannerModel'), rowLocator: settingsRowLocator('plannerModel'),
    // T4：允许空串（= 显式清空 = 继承主会话模型；解析侧只判 !==''，键缺失才用代码缺省值）。
    // 空白串经 normalize trim 归一为 ''，与空串同义；非 string（如 YAML 数字）仍非法。
    validator: isString, normalize: (value) => value.trim(),
    ui: { control: 'text', locale: 'plannerModel', section: 'pro', hint: 'pro规划默认使用模型。未匹配/置空时：使用主会话模型 ｜ 新会话/新子代理生效' }, locatorAliases: [],
  }),
  setting({
    key: 'plannerPromptSuffix', group: SETTING_GROUPS.EXTRA_PLAN, scalarType: 'string', defaultValue: DEFAULT_SETTINGS.plannerPromptSuffix,
    sourceLocator: sourceLocator('plannerPromptSuffix'), rowLocator: settingsRowLocator('plannerPromptSuffix'),
    validator: isString, ui: { control: 'textarea', locale: 'plannerPromptSuffix', section: 'pro', hint: '在主会话发送给pro规划的任务结尾，拼接上的内容。可能能增加pro规划的智商（未验证）。可置空 ｜ 立即生效' }, locatorAliases: [],
  }),
  setting({
    key: 'exploreBudget', group: SETTING_GROUPS.EXTRA_PLAN, scalarType: 'integer', defaultValue: DEFAULT_SETTINGS.exploreBudget,
    sourceLocator: sourceLocator('exploreBudget'), rowLocator: settingsRowLocator('exploreBudget'),
    validator: isPositiveInteger, ui: { control: 'number', min: 1, step: 1, locale: 'exploreBudget', section: 'pro', hint: '允许pro规划调用工具的次数，避免后台无限制调用。同时限制一次runcode内可调用的工具上限数 ｜ 立即生效' }, locatorAliases: [],
  }),
  setting({
    key: 'otherAgentModel', group: SETTING_GROUPS.EXTRA_PLAN, scalarType: 'string', defaultValue: DEFAULT_SETTINGS.otherAgentModel,
    sourceLocator: sourceLocator('otherAgentModel'), rowLocator: settingsRowLocator('otherAgentModel'),
    validator: isString, normalize: (value) => value.trim(),
    ui: { control: 'text', locale: 'otherAgentModel', section: 'pro', hint: '其他子代理默认使用模型。未匹配/置空时：使用主会话模型 ｜ 新会话/新子代理生效' }, locatorAliases: [],
  }),
  setting({
    key: 'reviewerUsesPlannerModel', group: SETTING_GROUPS.EXTRA_PLAN, scalarType: 'boolean', defaultValue: DEFAULT_SETTINGS.reviewerUsesPlannerModel,
    sourceLocator: sourceLocator('reviewerUsesPlannerModel'), rowLocator: settingsRowLocator('reviewerUsesPlannerModel'),
    validator: isBoolean, ui: { control: 'select', options: [true, false], locale: 'reviewerUsesPlannerModel', section: 'pro', hint: '验收者是否改用pro规划的模型。默认关闭 ｜ 新会话/新子代理生效' }, locatorAliases: [],
  }),
])

export function createDefaultSettings() {
  return Object.fromEntries(SETTING_DEFINITIONS.map((definition) => [definition.key, DEFAULT_SETTINGS[definition.key]]))
}
/** 9 项 UI 设置（权威值落 settings 行；= live-config 热读键集合）。 */
export const EXTRA_PLAN_SETTING_DEFINITIONS = Object.freeze(
  SETTING_DEFINITIONS.filter((item) => item.group === SETTING_GROUPS.EXTRA_PLAN),
)
/** 2 项宿主行设置（权威值同样落 settings 行；内存 definition 由当前宿主 descriptor 派生）。 */
export const HOST_ROW_SETTING_DEFINITIONS = Object.freeze(
  SETTING_DEFINITIONS.filter((item) => item.group === SETTING_GROUPS.HOST_ROWS),
)
/** 宿主行投影集合（= 2 项宿主行设置）——由当前宿主 descriptor 派生的唯一遍历源。 */
export const PROJECTION_SETTING_DEFINITIONS = Object.freeze([...HOST_ROW_SETTING_DEFINITIONS])

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

