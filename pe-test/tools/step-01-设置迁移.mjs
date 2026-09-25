// 设置描述表（descriptor）/ 行定位 / 保格式改写的共享层回归。
// dsh 0.1.7-rc.1 载体订正后：本文件只覆盖「描述表契约 + 源模板（资产/旧分发副本同形）解析与
// 定点改写 + 新载体 settings 行捕获」，不再覆盖旧分发目录的状态机迁移矩阵
// （那部分由 step-01-安装同步.mjs 用新载体夹具覆盖）。
// 所有夹具都在内存或系统临时目录，不触碰生产 DSH_HOME。

import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  EXTRA_PLAN_SETTING_DEFINITIONS,
  HOST_ROW_LEAF_KEYS,
  HOST_ROW_SETTING_DEFINITIONS,
  PRESET_ROW_ID,
  PROJECTION_SETTING_DEFINITIONS,
  SETTING_DEFINITIONS,
  SETTING_GROUPS,
  SETTINGS_ROW_ID,
  TOOL_PRESENTATION_MODES,
  captureRowSettings,
  captureSettings,
  findPluginsRow,
  getSettingDefinition,
  parsePresetYaml,
  patchYamlScalar,
  readProjectedValue,
  resolveSetting,
  restatePluginsRow,
  serializeScalar,
} from '../../plugins/dsh-extra-plan/lib/preset-settings.js'
import { DEFAULT_EXPLORE_BUDGET } from '../../plugins/dsh-extra-plan/lib/preset-defaults.generated.js'
import { GATE_WORD_MIGRATION_DEFINITIONS, GATE_WORDS_GROUP_DEFINITION, createGateRuntime } from '../../plugins/dsh-extra-plan/lib/gate-words.js'
import { createLiveConfig } from '../../plugins/dsh-extra-plan/lib/live-config.js'

const HERE = fileURLToPath(new URL('.', import.meta.url))
const ASSET_DIR = join(HERE, '..', '..', 'plugins', 'dsh-extra-plan', 'assets', 'presets', 'extra-plan')
const assetAgent = readFileSync(join(ASSET_DIR, 'agent.cordis.yml'), 'utf8')
const definition = (key) => getSettingDefinition(key)
const keys = SETTING_DEFINITIONS.map((item) => item.key)
const expectedKeys = ['anchoredBootstrap', 'creativeMode', 'webFetch', 'toolPresentationMode', 'runcodeCatchGate', 'crossProviderPlannerModel', 'plannerModel', 'plannerPromptSuffix', 'exploreBudget', 'otherAgentModel']

let pass = 0
let fail = 0
function check(label, condition) {
  if (condition) { pass += 1; console.log('PASS  ' + label) }
  else { fail += 1; console.log('FAIL  ' + label) }
}

check('exploreBudget 默认来自生成模块且为资产 YAML 叶值', DEFAULT_EXPLORE_BUDGET === resolveSetting(parsePresetYaml(assetAgent), definition('exploreBudget'), { aliases: false }).value && DEFAULT_EXPLORE_BUDGET === 18)

function patchAgent(values) {
  let text = assetAgent
  for (const [key, value] of Object.entries(values)) {
    const patched = patchYamlScalar(text, definition(key), value)
    if (!patched.ok) throw new Error('fixture patch failed: ' + key)
    text = patched.text
  }
  return text
}

function minimalYaml(overrides = {}, nested = false) {
  const value = (key, fallback) => Object.prototype.hasOwnProperty.call(overrides, key) ? overrides[key] : fallback
  const extra = [
    '          config:',
    '            plannerModel: ' + value('plannerModel', 'old-model'),
    '            crossProviderPlannerModel: ' + value('crossProviderPlannerModel', 'false'),
    '            plannerPromptSuffix: ' + value('plannerPromptSuffix', 'old-suffix'),
    '            exploreBudget: ' + value('exploreBudget', '8'),
    '            otherAgentModel: ' + value('otherAgentModel', "''"),
    '            anchoredBootstrap: ' + value('anchoredBootstrap', 'true'),
    '            creativeMode: ' + value('creativeMode', 'false'),
    '            runcodeCatchGate: ' + value('runcodeCatchGate', 'false'),
  ]
  if (nested) {
    return [
      '- id: wrapper-web',
      '  config:',
      '    - id: tool-web',
      '      config:',
      '        fetch: ' + value('webFetch', 'true'),
      '- id: wrapper-extra',
      '  config:',
      '    - id: deep-extra',
      '      config:',
      '        - id: extra-plan',
      ...extra,
      '- id: tool-presentation',
      '  config:',
      '    mode: ' + value('toolPresentationMode', 'ptc'),
    ].join('\n') + '\n'
  }
  return [
    '- id: extra-plan-group',
    '  config:',
    '    - id: extra-plan',
    '      config:',
    '        plannerModel: ' + value('plannerModel', 'old-model'),
    '        crossProviderPlannerModel: ' + value('crossProviderPlannerModel', 'false'),
    '        plannerPromptSuffix: ' + value('plannerPromptSuffix', 'old-suffix'),
    '        exploreBudget: ' + value('exploreBudget', '8'),
    '        otherAgentModel: ' + value('otherAgentModel', "''"),
    '        anchoredBootstrap: ' + value('anchoredBootstrap', 'true'),
    '        creativeMode: ' + value('creativeMode', 'false'),
    '        runcodeCatchGate: ' + value('runcodeCatchGate', 'false'),
    '- id: tool-web',
    '  config:',
    '    fetch: ' + value('webFetch', 'true'),
    '- id: tool-presentation',
    '  config:',
    '    mode: ' + value('toolPresentationMode', 'ptc'),
  ].join('\n') + '\n'
}

// 新载体 settings 行夹具（profile patch 真值形状）：10 项（8 项 UI + 2 项宿主行设置）。
function settingsRowYaml(values = {}) {
  const pick = (key, fallback) => Object.prototype.hasOwnProperty.call(values, key) ? values[key] : fallback
  return [
    '- id: dsh-extra-plan-settings',
    '  config:',
    '    anchoredBootstrap: ' + pick('anchoredBootstrap', 'true'),
    '    creativeMode: ' + pick('creativeMode', 'false'),
    '    runcodeCatchGate: ' + pick('runcodeCatchGate', 'false'),
    '    crossProviderPlannerModel: ' + pick('crossProviderPlannerModel', 'false'),
    "    plannerModel: '" + pick('plannerModel', 'deepseek-v4-pro') + "'",
    "    plannerPromptSuffix: '" + pick('plannerPromptSuffix', '') + "'",
    '    exploreBudget: ' + pick('exploreBudget', '18'),
    "    otherAgentModel: '" + pick('otherAgentModel', '') + "'",
    '    webFetch: ' + pick('webFetch', 'false'),
    "    toolPresentationMode: '" + pick('toolPresentationMode', 'native') + "'",
    '- id: other-row',
    '  config:',
    '    keep: true',
  ].join('\n') + '\n'
}

check('白名单恰有 10 个稳定键且顺序不变', keys.length === 10 && keys.join('|') === expectedKeys.join('|'))
check('descriptor 分组：extra-plan 8 项（本插件热读）+ host-rows 2 项（另投影到声明行 plugins 子行）',
  EXTRA_PLAN_SETTING_DEFINITIONS.length === 8 && HOST_ROW_SETTING_DEFINITIONS.length === 2 &&
  EXTRA_PLAN_SETTING_DEFINITIONS.every((item) => item.group === SETTING_GROUPS.EXTRA_PLAN) &&
  HOST_ROW_SETTING_DEFINITIONS.every((item) => item.group === SETTING_GROUPS.HOST_ROWS))
check('descriptor 已无 pluginId/path 顶层字段（改 rowLocator/sourceLocator 双定位元数据）',
  SETTING_DEFINITIONS.every((item) => !Object.prototype.hasOwnProperty.call(item, 'pluginId') && !Object.prototype.hasOwnProperty.call(item, 'path') && !Object.prototype.hasOwnProperty.call(item, 'locator')))
check('sourceLocator 仍为源模板行 id + config 路径（资产/旧分发副本同形）',
  SETTING_DEFINITIONS.every((item) => item.sourceLocator.path === 'config.' + (item.key === 'webFetch' ? 'fetch' : item.key === 'toolPresentationMode' ? 'mode' : item.key)) &&
  definition('plannerModel').sourceLocator.rowId === 'extra-plan' && definition('webFetch').sourceLocator.rowId === 'tool-web')
check('rowLocator 指向权威值落点：10 项一律 settings 行（含原声明行子行的 2 项宿主行设置）',
  SETTING_DEFINITIONS.every((item) => item.rowLocator.rowId === SETTINGS_ROW_ID && item.rowLocator.path === 'config.' + item.key &&
    item.rowLocator.pluginsRowId === undefined) &&
  definition('webFetch').rowLocator.path === 'config.webFetch' && definition('toolPresentationMode').rowLocator.path === 'config.toolPresentationMode')
check('projectionLocator 只给 2 项宿主行设置：声明行 plugins 内 tool-web.fetch / tool-presentation.mode（8 项 UI 设置无投影面）',
  PROJECTION_SETTING_DEFINITIONS.length === 2 && PROJECTION_SETTING_DEFINITIONS.every((item) => item.group === SETTING_GROUPS.HOST_ROWS) &&
  EXTRA_PLAN_SETTING_DEFINITIONS.every((item) => item.projectionLocator === undefined) &&
  definition('webFetch').projectionLocator.rowId === PRESET_ROW_ID && definition('webFetch').projectionLocator.pluginsRowId === 'tool-web' && definition('webFetch').projectionLocator.path === 'config.fetch' &&
  definition('toolPresentationMode').projectionLocator.pluginsRowId === 'tool-presentation' && definition('toolPresentationMode').projectionLocator.path === 'config.mode')
check('HOST_ROW_LEAF_KEYS 与投影 locator 叶键同源（未新增第二份键名清单）',
  HOST_ROW_LEAF_KEYS.webFetch === 'fetch' && HOST_ROW_LEAF_KEYS.toolPresentationMode === 'mode' &&
  HOST_ROW_SETTING_DEFINITIONS.every((item) => item.projectionLocator.path === 'config.' + HOST_ROW_LEAF_KEYS[item.key]))
check('禁止项不在白名单且描述不可变', !keys.some((key) => ['approvalEnabled', 'bootstrapPersona', 'bootstrapShellTools', 'bootstrapCommonTools', 'bootstrapReadHint', 'planTool', 'savePlanDir', 'usageLedger', 'searchTimeoutMs'].includes(key)) && Object.isFrozen(SETTING_DEFINITIONS) && SETTING_DEFINITIONS.every((item) => Object.isFrozen(item)))
// T4：plannerModel 放开为空串（空串=显式清空=继承主会话模型），空白串 normalize 后归一为 ''；
// 非 string（数字等）仍非法——validator 的类型严格性由 !validator(123) 锁定。
check('validator 类型严格且字符串设置支持空串归一', definition('plannerModel').validator('  x  ') && definition('plannerModel').validator('') && definition('plannerModel').normalize('   ') === '' && !definition('plannerModel').validator(123) && definition('otherAgentModel').validator('') && definition('otherAgentModel').normalize('   ') === '' && !definition('otherAgentModel').validator(123) && definition('crossProviderPlannerModel').validator(true) && definition('crossProviderPlannerModel').validator(false) && !definition('crossProviderPlannerModel').validator('true') && !definition('crossProviderPlannerModel').validator(1) && definition('exploreBudget').validator(1) && !definition('exploreBudget').validator('1') && TOOL_PRESENTATION_MODES.join('/') === definition('toolPresentationMode').ui.options.join('/'))
check('serializeScalar 三态：boolean/integer/字符串单引号', serializeScalar(true, 'boolean') === 'true' && serializeScalar(false, 'boolean') === 'false' && serializeScalar(18, 'integer') === '18' && serializeScalar("a'b", 'string') === "'a''b'" && serializeScalar('a\nb', 'string') === JSON.stringify('a\nb'))

// ── 源模板（旧分发副本同形）定位与保格式改写 ──────────────────────────────
const allOldValues = {
  plannerModel: 'legacy-model',
  crossProviderPlannerModel: true,
  plannerPromptSuffix: 'legacy: suffix',
  exploreBudget: 23,
  otherAgentModel: 'legacy-other-model',
  anchoredBootstrap: false,
  creativeMode: true,
  runcodeCatchGate: true,
  webFetch: true,
  toolPresentationMode: 'ptc',
}
const oldText = patchAgent(allOldValues)
const captured = captureSettings(oldText)
check('captureSettings 10 项全 captured 且值等于旧值', Object.values(captured.states).every((state) => state === 'captured') && keys.every((key) => captured.values[key] === allOldValues[key]))

const flatDoc = parsePresetYaml(minimalYaml())
check('扁平 group 内 extra-plan 行 10 项可解析', SETTING_DEFINITIONS.every((item) => resolveSetting(flatDoc, item, { aliases: false }).kind === 'ok'))
const nestedDoc = parsePresetYaml(minimalYaml({}, true))
check('重排/更深嵌套 row 可递归定位', SETTING_DEFINITIONS.every((item) => resolveSetting(nestedDoc, item, { aliases: false }).kind === 'ok'))

const nestedText = minimalYaml({}, true)
const nestedMode = patchYamlScalar(nestedText, definition('toolPresentationMode'), 'both')
check('更深嵌套 scalar 定点替换（toolPresentationMode → both）', nestedMode.ok && resolveSetting(parsePresetYaml(nestedMode.text), definition('toolPresentationMode'), { aliases: false }).value === 'both')
const patchedPlanner = patchYamlScalar(assetAgent, definition('plannerModel'), 'format-safe')
check('保格式改写：仅目标叶行变化', patchedPlanner.ok && patchedPlanner.text.split('\n').filter((line, index) => line !== assetAgent.split('\n')[index]).length === 1)

const dupText = '- id: extra-plan\n  config:\n    plannerModel: a\n- id: extra-plan\n  config:\n    plannerModel: b\n'
check('同名行重复 → ambiguous（不定点猜改）', captureSettings(dupText).states.plannerModel === 'ambiguous' && patchYamlScalar(dupText, definition('plannerModel'), 'never-guess').reason === 'ambiguous')

const aliasDefinition = { ...definition('plannerModel'), locatorAliases: [{ rowId: 'legacy-planner', path: 'config.plannerModel' }] }
const aliasDoc = parsePresetYaml('- id: legacy-planner\n  config:\n    plannerModel: legacy-alias\n')
check('显式 locator alias 才能恢复移动字段', resolveSetting(aliasDoc, aliasDefinition).kind === 'ok' && resolveSetting(aliasDoc, aliasDefinition).value === 'legacy-alias' && resolveSetting(aliasDoc, definition('plannerModel')).kind === 'missing')

const emptyState = captureSettings(minimalYaml({ plannerModel: "''" }))
check("空串标量 captured（不被判 invalid）", emptyState.states.plannerModel === 'captured' && emptyState.values.plannerModel === '')
const blankState = captureSettings(minimalYaml({ plannerModel: '"   "' }))
check('空白串 captured 且 normalize 归一并留待消费端 trim', blankState.states.plannerModel === 'captured' && blankState.values.plannerModel === '')
const invalidState = captureSettings(minimalYaml({ exploreBudget: '0' }))
check('非法值 → invalid（不进 values）', invalidState.states.exploreBudget === 'invalid' && !Object.prototype.hasOwnProperty.call(invalidState.values, 'exploreBudget'))

// ── gateWords：源模板整组定位 + 迁移叶 locator ────────────────────────────
check('gateWords 组定义与新命名 locator（rowId + sourceLocator）', GATE_WORDS_GROUP_DEFINITION.sourceLocator.rowId === 'extra-plan' && GATE_WORDS_GROUP_DEFINITION.sourceLocator.path === 'config.gateWords')
check('7 个迁移叶 locator：rowId=extra-plan + config.gateWords.<field> + string', GATE_WORD_MIGRATION_DEFINITIONS.length === 7 && GATE_WORD_MIGRATION_DEFINITIONS.every((item) => item.sourceLocator.rowId === 'extra-plan' && item.sourceLocator.path === 'config.gateWords.' + item.key && item.scalarType === 'string'))
const assetWords = resolveSetting(parsePresetYaml(assetAgent), GATE_WORDS_GROUP_DEFINITION, { aliases: false }).value
check('资产模板 7 词整组合法且 createGateRuntime 可派生', (() => { try { return Object.keys(createGateRuntime(assetWords).words).length === 7 } catch { return false } })())
const GATE_CUSTOM = { routeDirect: '甲直行', routePlan: '乙规划', routeDisagree: '丙否决', approvalApprove: '丁批准', approvalReplan: '戊转规划', purposeRefine: '己完整', purposeRedo: '庚重做' }
const customGateText = (() => { let out = assetAgent; for (const item of GATE_WORD_MIGRATION_DEFINITIONS) { const patched = patchYamlScalar(out, item, GATE_CUSTOM[item.key]); if (!patched.ok) throw new Error('fixture patch failed: ' + item.key); out = patched.text } return out })()
check('7 词逐叶定点改写后整组等于定制值', (() => { const runtime = createGateRuntime(resolveSetting(parsePresetYaml(customGateText), GATE_WORDS_GROUP_DEFINITION, { aliases: false }).value); return GATE_WORD_MIGRATION_DEFINITIONS.every((item) => runtime.words[item.key] === GATE_CUSTOM[item.key]) })())

// ── 新载体 settings 行捕获（captureRowSettings：8 项 UI 热读键 + 10 项权威值） ────
const rowText = settingsRowYaml({ anchoredBootstrap: 'false', exploreBudget: '7', plannerModel: 'row-model' })
const rowCapture = captureRowSettings(rowText)
check('captureRowSettings 按 settings 行 id 捕获 8 项', Object.keys(rowCapture.values).length === 8 && rowCapture.values.exploreBudget === 7 && rowCapture.values.anchoredBootstrap === false && rowCapture.values.plannerModel === 'row-model')
check('settings 行缺席 → 8 项全 missing（消费端回退 cfg 快照）', (() => { const none = captureRowSettings('- id: other-row\n  config:\n    keep: true\n'); return Object.keys(none.states).length === 8 && Object.values(none.states).every((state) => state === 'missing') })())
check('settings 行同名重复 → ambiguous（不猜值）', (() => { const dup = settingsRowYaml() + settingsRowYaml(); return captureRowSettings(dup).states.exploreBudget === 'ambiguous' })())
check('settings 行非法叶值 → invalid（不进 values）', (() => { const bad = settingsRowYaml().replace('    exploreBudget: 18', '    exploreBudget: 0'); const capturedBad = captureRowSettings(bad); return capturedBad.states.exploreBudget === 'invalid' && !Object.prototype.hasOwnProperty.call(capturedBad.values, 'exploreBudget') })())

// ── 权威值（settings 行 10 项）+ 投影读取（rowPresent / readProjectedValue） ──────
const authorityText = settingsRowYaml({ webFetch: 'true', toolPresentationMode: 'ptc' })
const authority = captureRowSettings(authorityText, SETTING_DEFINITIONS)
check('权威值捕获：10 项（含 webFetch / toolPresentationMode）全 captured 且 rowPresent=true',
  Object.keys(authority.states).length === 10 && Object.values(authority.states).every((state) => state === 'captured') &&
  authority.values.webFetch === true && authority.values.toolPresentationMode === 'ptc' && authority.rowPresent === true)
check('rowPresent 区分「settings 行缺席（不可判定）」与「行在但缺项（可回填）」',
  captureRowSettings('- id: other-row\n  config:\n    keep: true\n', SETTING_DEFINITIONS).rowPresent === false &&
  captureRowSettings('- id: dsh-extra-plan-settings\n  config:\n    creativeMode: true\n', SETTING_DEFINITIONS).rowPresent === true)
check('readProjectedValue：按 projectionLocator 读声明行子行现值（缺失/非法 → undefined，判定侧按出厂值参与比较）', (() => {
  const plugins = [{ id: 'tool-web', config: { fetch: false, searchTimeoutMs: 60000 } }, { id: 'tool-presentation', config: { mode: 'native' } }]
  const before = readProjectedValue(plugins, definition('toolPresentationMode'))
  findPluginsRow(plugins, 'tool-presentation').config.mode = 'ptc'
  const after = readProjectedValue(plugins, definition('toolPresentationMode'))
  findPluginsRow(plugins, 'tool-presentation').config.mode = 'code'
  const illegal = readProjectedValue(plugins, definition('toolPresentationMode'))
  const missing = readProjectedValue(undefined, definition('webFetch'))
  return before === 'native' && after === 'ptc' && illegal === undefined && missing === undefined
})())

// ── live-config 构造期读盘（新载体：路径来自 resolveDocumentPath） ─────────
{
  const dir = mkdtempSync(join(tmpdir(), 'dsh-extra-plan-rowconfig-'))
  try {
    const offFile = join(dir, 'cordis-off.patch.yml')
    const onFile = join(dir, 'cordis-on.patch.yml')
    writeFileSync(offFile, settingsRowYaml({ anchoredBootstrap: 'false', runcodeCatchGate: 'true', exploreBudget: '7' }), 'utf8')
    writeFileSync(onFile, settingsRowYaml({ anchoredBootstrap: 'true', exploreBudget: '9' }), 'utf8')
    const lc = createLiveConfig({ resolveDocumentPath: () => offFile, fallbackDefaults: { exploreBudget: 18, runcodeCatchGate: false, anchoredBootstrap: true } })
    check('LC-A 构造期读盘：首次取值即 settings 行真值', lc.exploreBudget === 7 && lc.runcodeCatchGate === true && lc.anchoredBootstrap === false)
    check('LC-B resolveDocumentPath 变化 → 取值跟进（路径参与 stamp 判定）', (() => { let current = offFile; const lc2 = createLiveConfig({ resolveDocumentPath: () => current, fallbackDefaults: { exploreBudget: 18 } }); const first = lc2.exploreBudget; current = onFile; return first === 7 && lc2.exploreBudget === 9 })())
    const missing = createLiveConfig({ resolveDocumentPath: () => join(dir, 'nope.yml'), fallbackDefaults: { exploreBudget: 18 } })
    check('LC-C resolveDocumentPath 指向不存在文件 → 回退 fallbackDefaults（不抛）', missing.exploreBudget === 18)
    const noPath = createLiveConfig({ resolveDocumentPath: () => '', fallbackDefaults: { exploreBudget: 18 } })
    check('LC-D 路径不可得（configEditor 未就绪）→ 回退 fallbackDefaults（不读旧预设目录）', noPath.exploreBudget === 18)
    writeFileSync(offFile, settingsRowYaml({ anchoredBootstrap: 'false', exploreBudget: '421' }), 'utf8')
    check('LC-E 文件改写后 stamp 变化 → 取值跟进', lc.exploreBudget === 421)
    // U-1：2 项宿主行设置的读取路径 = settings 行（与 8 项同一 rowLocator），
    // 权威值非出厂值时按权威值返回；settings 行缺项时回退 fallback/内置默认。
    writeFileSync(offFile, settingsRowYaml({ webFetch: 'true', toolPresentationMode: 'ptc' }), 'utf8')
    const lcHostRows = createLiveConfig({ resolveDocumentPath: () => offFile, fallbackDefaults: { webFetch: false, toolPresentationMode: 'native' } })
    check('LC-F 2 项宿主行设置读取路径 = settings 行（webFetch=true / toolPresentationMode=ptc）', lcHostRows.webFetch === true && lcHostRows.toolPresentationMode === 'ptc')
    check('LC-F2 settings 行缺这 2 项 → 回退 fallbackDefaults（不读声明行、不读旧预设目录）', (() => {
      writeFileSync(offFile, settingsRowYaml({ exploreBudget: '18' }).replace('    webFetch: false\n', '').replace("    toolPresentationMode: 'native'\n", ''), 'utf8')
      const lcFallback = createLiveConfig({ resolveDocumentPath: () => offFile, fallbackDefaults: { webFetch: false, toolPresentationMode: 'native' } })
      const lcBuiltin = createLiveConfig({ resolveDocumentPath: () => offFile })
      return lcFallback.webFetch === false && lcFallback.toolPresentationMode === 'native' && lcBuiltin.webFetch === false && lcBuiltin.toolPresentationMode === 'native'
    })())
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}

// ── 声明行 plugins 行内定位/重述原语（供 T2/T3 写链复用） ────────────────
{
  const plugins = [{ id: 'tool-web', name: 'x', config: { fetch: false, searchTimeoutMs: 60000 } }, { id: 'grp', name: 'cordis:group', group: true, config: [{ id: 'extra-plan', config: { creativeMode: false } }] }]
  check('findPluginsRow 递归覆盖 group 子行；缺失返回 null', findPluginsRow(plugins, 'extra-plan') !== null && findPluginsRow(plugins, 'no-such-row') === null)
  const restated = restatePluginsRow(plugins, 'tool-web', { fetch: true })
  check('restatePluginsRow 深拷贝整体重述：目标键改、其余键与原对象不变', restated[0].config.fetch === true && restated[0].config.searchTimeoutMs === 60000 && plugins[0].config.fetch === false)
  check('restatePluginsRow 目标行缺失 → null（调用方据此判定 404）', restatePluginsRow(plugins, 'no-such-row', { x: 1 }) === null)
}

console.log('\n通过 ' + pass + ', 失败 ' + fail)
process.exit(fail === 0 ? 0 : 1)
