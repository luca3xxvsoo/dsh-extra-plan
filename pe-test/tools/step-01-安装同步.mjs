// syncPreset 启动自愈回归（dsh 0.1.7-rc.1 新载体）。
// 夹具（全部位于系统临时 DSH_HOME，绝不使用真实生产目录）：
//   状态目录 $DSH_HOME/.agent-presets/extra-plan/（dist-manifest.json 台账 + 旧分发副本 agent.cordis.yml）
//   目标物 $DSH_HOME/profiles/web/cordis.patch.yml（声明行 preset-extra-plan 的 config.plugins
//   + settings 行 dsh-extra-plan-settings 的 config = 10 项权威值落点）
// 断言语义保留（原「首次/升级/幂等 + settings captured/10 项 + gateWordsMigration 7 项」）：
//   首次 → written（源缺席）；有旧副本 → upgraded（**10 项一律落 settings 行**、7 词整组迁移）；
//   收敛 → idle。写盘经注入的 apply 回调（宿主侧即 configEditor.edit）。
// 本轮新增 ⑥-6：2 项宿主行设置的「权威值（settings 行）→ 投影（声明行 plugins 子行）」链：
//   T-1 投影被删 + 权威非出厂值 → 按权威值重建；T-2 权威改值 → 投影跟进；T-3 权威==出厂 + 投影缺失 → idle；
//   T-4 settings 行缺项 + 声明行非出厂值 → 一次性回填（M-1/M-2）。

import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  ASSET_DIR,
  ASSET_PATCH_FILE,
  contentHash,
  initStateDir,
  readManifest,
  readManifestRecordOf,
  syncPreset,
  stateDirOf,
  DECLARATION_ROW_IDS,
  declarationCoversAsset,
  declarationBodyMatchesAsset,
  effectiveRowConfig,
  restatePresetPlugins,
  carryUserWritable,
  assetPlugins,
  readDeclaredPluginsFromPatch,
} from '../../plugins/dsh-extra-plan/lib/preset-sync.js'
import { SETTING_DEFINITIONS, patchYamlScalar } from '../../plugins/dsh-extra-plan/lib/preset-settings.js'
import { GATE_WORD_FIELDS, GATE_WORD_MIGRATION_DEFINITIONS } from '../../plugins/dsh-extra-plan/lib/gate-words.js'

const HERE = fileURLToPath(new URL('.', import.meta.url))
const assetAgent = readFileSync(join(ASSET_DIR, 'agent.cordis.yml'), 'utf8')
const generatedPatchText = readFileSync(ASSET_PATCH_FILE, 'utf8')
const definition = (key) => SETTING_DEFINITIONS.find((item) => item.key === key)

// 声明行夹具：把生成产物的 insert 行去缩进 4 列 → 直接作为 profile patch 的根级声明行。
function declarationPatchText() {
  const lines = generatedPatchText.split('\n').slice(4)
  const out = []
  for (const line of lines) {
    if (line === '') { out.push(''); continue }
    if (!line.startsWith('    ')) throw new Error('生成产物缩进异常：' + JSON.stringify(line))
    out.push(line.slice(4))
  }
  while (out.length > 0 && out[out.length - 1].trim() === '') out.pop()
  return out.join('\n') + '\n'
}

let pass = 0
let fail = 0
function check(label, condition) {
  if (condition) { pass += 1; console.log('PASS  ' + label) }
  else { fail += 1; console.log('FAIL  ' + label) }
}

function patchAgent(values) {
  let text = assetAgent
  for (const [key, value] of Object.entries(values)) {
    const patched = patchYamlScalar(text, definition(key), value)
    if (!patched.ok) throw new Error('fixture patch failed: ' + key)
    text = patched.text
  }
  return text
}
function customGateAgent(text, custom) {
  let out = text
  for (const item of GATE_WORD_MIGRATION_DEFINITIONS) {
    const patched = patchYamlScalar(out, item, custom[item.key])
    if (!patched.ok) throw new Error('fixture patch failed: ' + item.key)
    out = patched.text
  }
  return out
}

const work = mkdtempSync(join(tmpdir(), 'dsh-sync-carrier-'))
const home = join(work, 'home')
const stateDir = stateDirOf(home)
const profileDir = join(home, 'profiles', 'web')
const patchFile = join(profileDir, 'cordis.patch.yml')
mkdirSync(stateDir, { recursive: true })
mkdirSync(profileDir, { recursive: true })
writeFileSync(patchFile, declarationPatchText(), 'utf8')
const currentHash = contentHash(ASSET_DIR)
const readPatch = () => readFileSync(patchFile, 'utf8')
const declaredFromPatch = () => {
  const parsed = readPatch()
  return parsed
}
const CUSTOM = {
  plannerModel: 'old-sync-model',
  crossProviderPlannerModel: true,
  plannerPromptSuffix: 'old: sync suffix',
  exploreBudget: 9,
  otherAgentModel: 'old-sync-other-model',
  anchoredBootstrap: false,
  creativeMode: false,
  runcodeCatchGate: true,
  webFetch: true,
  toolPresentationMode: 'both',
}
const GATE_CUSTOM = { routeDirect: '甲直行', routePlan: '乙规划', routeDisagree: '丙否决', approvalApprove: '丁批准', approvalReplan: '戊转规划', purposeRefine: '己完整', purposeRedo: '庚重做' }

try {
  // ① 首次自愈（无旧副本）：写入资产 hash + 缺席审计；无内容落地（apply 不被调用）
  check('首次 initStateDir → written', initStateDir(home).action === 'written')
  const applied = []
  const first = await syncPreset({ dshHome: home, readPatch, apply: async (plan, ctx) => { applied.push({ plan, ctx }) } })
  check('首次自愈 → written', first.action === 'written')
  check('首次 manifest format=2 / distHash=厂商 hash / readManifest 一致', first.plan !== undefined && readManifestRecordOf(stateDir).format === 2 && readManifest(stateDir) === currentHash)
  check('首次 settingsMigration source=absent 且 10 项全 skipped-source-absent', (() => { const m = readManifestRecordOf(stateDir); return m.settingsMigration.source === 'absent' && Object.keys(m.settingsMigration.results).length === 10 && Object.values(m.settingsMigration.results).every((r) => r === 'skipped-source-absent') })())
  check('首次 gateWordsMigration 7 项全 skipped-source-absent', (() => { const m = readManifestRecordOf(stateDir); return m.gateWordsMigration.format === 1 && m.gateWordsMigration.source === 'absent' && Object.keys(m.gateWordsMigration.results).length === 7 && Object.values(m.gateWordsMigration.results).every((r) => r === 'skipped-source-absent') })())
  check('首次无旧值 → settings/preset 均无落地内容（apply 不写入）', first.plan.settings === null && first.plan.preset === null)

  // ② 收敛：第二次 → idle，manifest 字节不变
  const beforeIdle = readFileSync(join(stateDir, 'dist-manifest.json'))
  check('第二次 → idle', (await syncPreset({ dshHome: home, readPatch })).action === 'idle')
  check('idle manifest 字节完全不变', readFileSync(join(stateDir, 'dist-manifest.json')).equals(beforeIdle))

  // ③ 有旧分发副本（10 项定制 + 7 词定制）→ upgraded：内容映射到新载体
  writeFileSync(join(stateDir, 'agent.cordis.yml'), customGateAgent(patchAgent(CUSTOM), GATE_CUSTOM), 'utf8')
  writeFileSync(join(stateDir, 'dist-manifest.json'), JSON.stringify({ format: 1, distHash: 'OLD-SYNC-HASH' }, null, 2) + '\n', 'utf8')
  applied.length = 0
  const upgraded = await syncPreset({ dshHome: home, readPatch, apply: async (plan, ctx) => { applied.push({ plan, ctx }) } })
  check('旧 format=1 台账 + 旧副本 → upgraded', upgraded.action === 'upgraded')
  const planSettings = upgraded.plan.settings
  const planPreset = upgraded.plan.preset
  check('升级后 10 项设置值取自旧副本（8 项 UI + 2 项宿主行统一落 settings 行）', planSettings !== null &&
    planSettings.values.plannerModel === 'old-sync-model' && planSettings.values.crossProviderPlannerModel === true &&
    planSettings.values.plannerPromptSuffix === 'old: sync suffix' && planSettings.values.exploreBudget === 9 &&
    planSettings.values.otherAgentModel === 'old-sync-other-model' && planSettings.values.anchoredBootstrap === false &&
    planSettings.values.creativeMode === false && planSettings.values.runcodeCatchGate === true &&
    planSettings.values.webFetch === true && planSettings.values.toolPresentationMode === 'both' &&
    Object.keys(planSettings.values).length === 10)
  check('升级后 2 项宿主行按权威值投影声明行 plugins 子行（tool-web.fetch / tool-presentation.mode）', planPreset !== null &&
    planPreset.hostRowConfig['tool-web'].fetch === true && planPreset.hostRowConfig['tool-presentation'].mode === 'both')
  check('升级后 7 词整组迁移（gateWords 全部为旧值）', planPreset.gateWords !== null && GATE_WORD_FIELDS.every((item) => planPreset.gateWords[item.field] === GATE_CUSTOM[item.field]))
  check('升级后 settingsMigration source=captured 且 10 项全 restored', upgraded.plan.audit.source === 'captured' && Object.keys(upgraded.plan.audit.results).length === 10 && Object.values(upgraded.plan.audit.results).every((r) => r === 'restored'))
  check('升级后 gateWordsMigration 7 项全 restored', Object.keys(upgraded.plan.gateAudit.results).length === 7 && Object.values(upgraded.plan.gateAudit.results).every((r) => r === 'restored'))
  check('apply 回调收到本次 plan 与上下文（宿主侧即 configEditor.edit 的落地面）', applied.length === 1 && applied[0].plan === upgraded.plan && applied[0].ctx.stateDir === stateDir && applied[0].ctx.distHash === currentHash && applied[0].ctx.action === 'upgraded')
  const upgradedManifest = readManifestRecordOf(stateDir)
  check('升级后 manifest format=2 / 厂商 hash / captured', upgradedManifest.format === 2 && upgradedManifest.distHash === currentHash && upgradedManifest.settingsMigration.source === 'captured')
  check('升级后 manifest 不泄漏用户值', !JSON.stringify(upgradedManifest).includes('old-sync-model') && !JSON.stringify(upgradedManifest).includes(GATE_CUSTOM.routeDirect))
  check('升级后再次同步 → idle（收敛）', (await syncPreset({ dshHome: home, readPatch })).action === 'idle')

  // ④ 旧副本缺字段 → skipped-old-missing，且不写该键（无值不写回）
  const missingOther = patchAgent(CUSTOM).replace("        otherAgentModel: 'old-sync-other-model'\n", '')
  writeFileSync(join(stateDir, 'agent.cordis.yml'), missingOther, 'utf8')
  writeFileSync(join(stateDir, 'dist-manifest.json'), JSON.stringify({ format: 1, distHash: 'OLD-MISSING-OTHER' }, null, 2) + '\n', 'utf8')
  const missingRun = await syncPreset({ dshHome: home, readPatch })
  check('旧副本缺 otherAgentModel → upgraded 且审计 skipped-old-missing', missingRun.action === 'upgraded' && missingRun.plan.audit.results.otherAgentModel === 'skipped-old-missing')
  check('缺失键不进入落地值（settings 行只写有值的 9 项：7 项 UI + 2 项宿主行）', missingRun.plan.settings !== null && !Object.prototype.hasOwnProperty.call(missingRun.plan.settings.values, 'otherAgentModel') && Object.keys(missingRun.plan.settings.values).length === 9)

  // ⑤ 旧副本 7 词非法（重复值）→ 整组 skipped-invalid，不写回；宿主行仍迁移（不抛）
  const dupGateText = patchAgent(CUSTOM).replace('        routePlan: \'进行pro规划\'', '        routePlan: \'直接执行\'')
  writeFileSync(join(stateDir, 'agent.cordis.yml'), dupGateText, 'utf8')
  writeFileSync(join(stateDir, 'dist-manifest.json'), JSON.stringify({ format: 1, distHash: 'OLD-BAD-GATE' }, null, 2) + '\n', 'utf8')
  const badGate = await syncPreset({ dshHome: home, readPatch })
  check('旧 7 词非法 → gateWordsMigration 7 项全 skipped-invalid 且不写回（preset.gateWords=null）', badGate.action === 'upgraded' && Object.keys(badGate.plan.gateAudit.results).length === 7 && Object.values(badGate.plan.gateAudit.results).every((r) => r === 'skipped-invalid') && badGate.plan.preset !== null && badGate.plan.preset.gateWords === null)
  check('7 词非法不阻断宿主行迁移（tool-web/tool-presentation 仍落位）', Object.keys(badGate.plan.preset.hostRowConfig).length === 2)

  // ⑥ 目标物判定：声明行 plugins 缺 extra-plan 行 → 非 idle（即便台账 hash 相同）
  const manifestNow = readManifestRecordOf(stateDir)
  const brokenPatch = declarationPatchText().replace('          - id: extra-plan\n', '          - id: extra-plan-renamed\n')
  writeFileSync(patchFile, brokenPatch, 'utf8')
  const notCovered = await syncPreset({ dshHome: home, readPatch })
  check('声明行 plugins 不覆盖资产行 id 集合 → 非 idle', notCovered.action !== 'idle' && manifestNow.distHash === currentHash)
  check('declarationCoversAsset 双态判定敏感', declarationCoversAsset([{ id: 'extra-plan' }, { id: 'tool-web' }, { id: 'tool-presentation' }]) === true && declarationCoversAsset([{ id: 'extra-plan-renamed' }]) === false)
  check('DECLARATION_ROW_IDS 覆盖 extra-plan / tool-web / tool-presentation', DECLARATION_ROW_IDS.join('|') === 'extra-plan|tool-web|tool-presentation')
  writeFileSync(patchFile, declarationPatchText(), 'utf8')

  // ⑥-2 本体内容维度（本次 0.1.7-rc.2 故障根因回归）：3 个行 id 全在、但本体与资产不一致 → 必须非 idle。
  // 修复前 declarationCoversAsset 只查「行 id 在不在」，此类「资产只有 config 值变化」的升级会被判 idle 而永不生效。
  const stalePatch = declarationPatchText().replace('maxBytes: 65536', 'maxBytes: 32768')
  check('夹具：本体过期 patch 与资产本体确实不同', stalePatch !== declarationPatchText())
  writeFileSync(patchFile, stalePatch, 'utf8')
  const staleRun = await syncPreset({ dshHome: home, readPatch })
  check('本体过期（3 个行 id 全在）→ 非 idle', staleRun.action !== 'idle')
  check('本体过期判定不依赖 hash 变化（distHash 仍为厂商值）', readManifestRecordOf(stateDir).distHash === currentHash)
  writeFileSync(patchFile, declarationPatchText(), 'utf8')
  check('本体恢复为资产 → idle（收敛，不反复重搬）', (await syncPreset({ dshHome: home, readPatch })).action === 'idle')

  // ⑥-3 本体比对与重建（纯函数级）：用户可写项剥离恒等 + 本体取资产值 + 用户值写回。
  {
    const findRow = (rows, id) => {
      for (const row of rows) {
        if (row === null || typeof row !== 'object') continue
        if (row.id === id) return row
        if (Array.isArray(row.config)) {
          const hit = findRow(row.config, id)
          if (hit !== undefined) return hit
        }
      }
      return undefined
    }
    const stalePlugins = readDeclaredPluginsFromPatch(stalePatch)
    const freshPlugins = assetPlugins()
    check('assetPlugins() 可解析资产声明行 plugins（顶层 17 行）', Array.isArray(freshPlugins) && freshPlugins.length === 17)
    check('本体比对：过期本体 → false', declarationBodyMatchesAsset(stalePlugins, freshPlugins) === false)
    check('本体比对：仅用户可写项（2 宿主行 + 7 词）不同 → true', (() => {
      const userChanged = JSON.parse(JSON.stringify(freshPlugins))
      findRow(userChanged, 'tool-web').config.fetch = true
      findRow(userChanged, 'tool-presentation').config.mode = 'both'
      findRow(userChanged, 'extra-plan').config.gateWords = GATE_CUSTOM
      return declarationBodyMatchesAsset(userChanged, freshPlugins) === true
    })())
    check('本体比对：嵌套行非用户项（extra-plan.exploreBudget）变化 → false', (() => {
      const nested = JSON.parse(JSON.stringify(freshPlugins))
      findRow(nested, 'extra-plan').config.exploreBudget = 99
      return declarationBodyMatchesAsset(nested, freshPlugins) === false
    })())
    const rebuilt = restatePresetPlugins(
      { plugins: stalePlugins },
      null,
      { hostRowConfig: { 'tool-web': { fetch: true }, 'tool-presentation': { mode: 'both' } }, gateWords: GATE_CUSTOM },
      freshPlugins,
    )
    const rebuiltRows = rebuilt.plugins
    const aiRow = rebuiltRows.find((row) => row.id === 'agent-instructions')
    check('重建后本体取资产值（maxBytes 由过期的 32768 回到 65536）', aiRow !== undefined && aiRow.config.maxBytes === 65536)
    check('重建后用户 2 项宿主行值仍在（fetch=true / mode=both）', findRow(rebuiltRows, 'tool-web').config.fetch === true && findRow(rebuiltRows, 'tool-presentation').config.mode === 'both')
    check('重建后 7 个闸门词整组为用户值', GATE_WORD_FIELDS.every((item) => findRow(rebuiltRows, 'extra-plan').config.gateWords[item.field] === GATE_CUSTOM[item.field]))
    check('重建不污染资产视图（assetPlugins 仍为资产原值）', findRow(assetPlugins(), 'agent-instructions').config.maxBytes === 65536)
  }

  // ⑥-4 自愈闭环（本轮关键钉死项）：旧副本缺席 + 本体过期 + 用户定制并存 →
  //   必须判非 idle 且携带 bodyStale（applyPlan 据此重建）；重建语义 = 资产基底 + carry 保住用户值；重建后收敛 idle。
  {
    const findRow = (rows, id) => {
      for (const row of rows) {
        if (row === null || typeof row !== 'object') continue
        if (row.id === id) return row
        if (Array.isArray(row.config)) {
          const hit = findRow(row.config, id)
          if (hit !== undefined) return hit
        }
      }
      return undefined
    }
    // 关键前提：临时移走旧分发副本，构造 source: absent 场景（本机现场即此态）。
    // 若旧副本存在，显式迁移值会按设计优先于 carry，就测不到「无旧副本时靠 carry 保住用户值」这条链。
    // 先备份、用例末尾原样写回，避免影响后续段落。
    let legacyBackup = null
    try { legacyBackup = readFileSync(join(stateDir, 'agent.cordis.yml'), 'utf8') } catch { legacyBackup = null }
    rmSync(join(stateDir, 'agent.cordis.yml'), { force: true })
    const staleUserPatch = declarationPatchText().replace('maxBytes: 65536', 'maxBytes: 32768').replace('mode: native', 'mode: ptc')
    check('闭环夹具：本体陈旧且保留用户值（mode: ptc）', staleUserPatch !== declarationPatchText() && staleUserPatch.indexOf('mode: ptc') !== -1)
    writeFileSync(patchFile, staleUserPatch, 'utf8')
    const applied = []
    const staleRun = await syncPreset({ dshHome: home, readPatch, apply: async (plan) => { applied.push(plan) } })
    check('闭环①：旧副本缺席 + 本体过期 → 非 idle', staleRun.action !== 'idle')
    check('闭环②：plan 携带 bodyStale（applyPlan 据此重建声明行）', applied.length === 1 && applied[0].bodyStale === true)
    const appliedPlan = applied[0]
    const rebuilt = restatePresetPlugins(
      { plugins: readDeclaredPluginsFromPatch(staleUserPatch) },
      null,
      appliedPlan.preset !== null ? appliedPlan.preset : { hostRowConfig: {}, gateWords: null },
      assetPlugins(),
    )
    const rebuiltFind = (id) => findRow(rebuilt.plugins, id)
    check('闭环③：重建后本体取资产值（maxBytes 由 32768 回到 65536）', rebuiltFind('agent-instructions').config.maxBytes === 65536)
    check('闭环④：重建后用户定制被 carry 保住（mode 仍为 ptc）', rebuiltFind('tool-presentation').config.mode === 'ptc')
    check('闭环⑤：重建后本体比对为 true（剥离用户项后与资产一致）', declarationBodyMatchesAsset(rebuilt.plugins, assetPlugins()) === true)
    writeFileSync(patchFile, declarationPatchText().replace('mode: native', 'mode: ptc'), 'utf8')
    check('闭环⑥：现场恢复为「资产本体 + 用户值」→ idle（收敛）', (await syncPreset({ dshHome: home, readPatch })).action === 'idle')
    writeFileSync(patchFile, declarationPatchText(), 'utf8')
    if (legacyBackup !== null) writeFileSync(join(stateDir, 'agent.cordis.yml'), legacyBackup, 'utf8')
  }

  // ⑥-5 carryUserWritable 三态（与剥离表同源；旧副本缺席时保住现场用户值的唯一来源）
  {
    const findRow = (rows, id) => {
      for (const row of rows) {
        if (row === null || typeof row !== 'object') continue
        if (row.id === id) return row
        if (Array.isArray(row.config)) {
          const hit = findRow(row.config, id)
          if (hit !== undefined) return hit
        }
      }
      return undefined
    }
    check('carry：非数组输入 → 空且不抛错', (() => { const c = carryUserWritable(undefined); return Object.keys(c.hostRowConfig).length === 0 && c.gateWords === null })())
    const fromAsset = carryUserWritable(assetPlugins())
    check('carry：资产本体 → 抽出 2 项宿主行与 7 个闸门词', Object.keys(fromAsset.hostRowConfig).length === 2 && fromAsset.gateWords !== null && Object.keys(fromAsset.gateWords).length === 7)
    const userRows = JSON.parse(JSON.stringify(assetPlugins()))
    findRow(userRows, 'tool-presentation').config.mode = 'ptc'
    findRow(userRows, 'extra-plan').config.gateWords = GATE_CUSTOM
    const carried = carryUserWritable(userRows)
    check('carry：用户改动被抽出（含穿透 group 的 gateWords）', carried.hostRowConfig['tool-presentation'].mode === 'ptc' && carried.gateWords.routeDirect === GATE_CUSTOM.routeDirect)
  }

  // ⑥-6 权威值（settings 行）↔ 投影（声明行 plugins 子行）链：投影被删/权威改值/稳态/一次性回填。
  // 夹具 = patchFile 直接含 settings 行（+ 可选声明行），旧副本临时移走以隔离迁移来源。
  {
    const findRow = (rows, id) => {
      for (const row of rows) {
        if (row === null || typeof row !== 'object') continue
        if (row.id === id) return row
        if (Array.isArray(row.config)) {
          const hit = findRow(row.config, id)
          if (hit !== undefined) return hit
        }
      }
      return undefined
    }
    // settings 行夹具（权威值落点）：行 id + config 叶值。
    const settingsRow = (lines) => '- id: dsh-extra-plan-settings\n  config:\n' + lines.map((line) => '    ' + line + '\n').join('')
    // 台账夹具：distHash 对齐厂商资产 → 唯一的非 idle 触发源只能是「投影/回填」维度。
    const writeManifestWith = (hash) => writeFileSync(join(stateDir, 'dist-manifest.json'), JSON.stringify({
      format: 2,
      distHash: hash,
      settingsMigration: { format: 1, sourceDistHash: null, source: 'absent', results: {} },
      gateWordsMigration: { format: 1, sourceDistHash: null, source: 'absent', results: {} },
    }, null, 2) + '\n', 'utf8')
    let legacyBackup = null
    try { legacyBackup = readFileSync(join(stateDir, 'agent.cordis.yml'), 'utf8') } catch { legacyBackup = null }
    rmSync(join(stateDir, 'agent.cordis.yml'), { force: true })

    // T-1 投影被宿主删除（patchFile 无声明行）+ settings 行含非出厂值 → 非 idle → 重建投影 = 权威值
    writeFileSync(patchFile, settingsRow(["toolPresentationMode: 'ptc'"]), 'utf8')
    writeManifestWith(currentHash)
    const t1 = await syncPreset({ dshHome: home, readPatch })
    check('T-1a 投影被删（无声明行）+ settings 行非出厂值 → 非 idle', t1.action !== 'idle')
    check('T-1b 非 idle 仅由投影维度触发（本体未过期、无迁移源）', t1.plan.bodyStale === false && t1.plan.settings === null &&
      t1.plan.preset !== null && t1.plan.preset.hostRowConfig['tool-presentation'].mode === 'ptc' && Object.keys(t1.plan.preset.hostRowConfig).length === 1)
    const t1rebuilt = restatePresetPlugins({ plugins: undefined }, null, t1.plan.preset, assetPlugins())
    check('T-1c 按 plan 重建声明行后子行值 = settings 行权威值（mode=ptc / fetch 保持出厂 false）',
      findRow(t1rebuilt.plugins, 'tool-presentation').config.mode === 'ptc' && findRow(t1rebuilt.plugins, 'tool-web').config.fetch === false)

    // T-2 settings 行权威值改写 → 下一次 syncPreset 判非 idle 并投影新值；投影跟上后收敛 idle
    writeFileSync(patchFile, settingsRow(["toolPresentationMode: 'both'"]) + declarationPatchText().replace('mode: native', 'mode: ptc'), 'utf8')
    writeManifestWith(currentHash)
    const t2 = await syncPreset({ dshHome: home, readPatch })
    check('T-2a 权威值（both）≠ 当前投影（ptc）→ 非 idle', t2.action !== 'idle')
    check('T-2b 投影 plan 写入权威新值（both），未改动的 webFetch 不写冗余覆盖',
      t2.plan.preset !== null && t2.plan.preset.hostRowConfig['tool-presentation'].mode === 'both' && Object.keys(t2.plan.preset.hostRowConfig).length === 1)
    writeFileSync(patchFile, settingsRow(["toolPresentationMode: 'both'"]) + declarationPatchText().replace('mode: native', 'mode: both'), 'utf8')
    check('T-2c 投影已跟随权威值 → idle（收敛，不反复重写）', (await syncPreset({ dshHome: home, readPatch })).action === 'idle')

    // T-3 权威值 == 出厂值 + 声明行缺失 → idle（稳态，不反复重建、不空转写盘）
    writeFileSync(patchFile, settingsRow(['webFetch: false', "toolPresentationMode: 'native'"]), 'utf8')
    writeManifestWith(currentHash)
    check('T-3 投影值 == 出厂值 且 声明行缺失 → idle（不空转）', (await syncPreset({ dshHome: home, readPatch })).action === 'idle')

    // T-4 一次性回填（M-1/M-2）：settings 行缺这 2 项 + 声明行子行有非出厂值 → 回填 settings 行 = 声明行旧值
    writeFileSync(patchFile, settingsRow(['creativeMode: true']) + declarationPatchText().replace('mode: native', 'mode: ptc'), 'utf8')
    writeManifestWith(currentHash)
    const t4 = await syncPreset({ dshHome: home, readPatch })
    check('T-4a settings 行缺项 + 声明行非出厂值 → 非 idle 且回填值 = 声明行旧值（ptc）',
      t4.action !== 'idle' && t4.plan.settings !== null && t4.plan.settings.values.toolPresentationMode === 'ptc')
    check('T-4b 回填不制造空 override（webFetch 为出厂值 → 不写该键；回填只含 1 键）',
      !Object.prototype.hasOwnProperty.call(t4.plan.settings.values, 'webFetch') && Object.keys(t4.plan.settings.values).length === 1)
    check('T-4c 回填不重写投影（投影已等于权威值 → plan.preset 为空）', t4.plan.preset === null)
    check('T-4d 回填经台账留痕（审计状态 = restored-from-declaration-row，且不记用户值）',
      readManifestRecordOf(stateDir).settingsMigration.results.toolPresentationMode === 'restored-from-declaration-row' &&
      !JSON.stringify(readManifestRecordOf(stateDir)).includes('ptc'))
    writeFileSync(patchFile, settingsRow(['creativeMode: true', "toolPresentationMode: 'ptc'"]) + declarationPatchText().replace('mode: native', 'mode: ptc'), 'utf8')
    check('T-4e 回填完成后（settings 行已有该值）→ idle（一次性，不反复回填）', (await syncPreset({ dshHome: home, readPatch })).action === 'idle')

    // ⑥-6f 宿主入口形状：settingsValues（settings 行生效 config）+ declaredPlugins（声明行生效 plugins）
    check('effectiveRowConfig：profile override（行 config 本身）优先，其余层补齐；兼容 override.config 行节点形状；无层 → null（不可判定）', (() => {
      const merged = effectiveRowConfig({ entry: { options: { config: { creativeMode: false } } }, inherited: { creativeMode: true, exploreBudget: 5 }, override: { creativeMode: true } })
      const scoped = effectiveRowConfig({ entry: { options: { config: {} } }, inherited: {}, override: { config: { webFetch: true } } })
      return merged.creativeMode === true && merged.exploreBudget === 5 && scoped.webFetch === true && effectiveRowConfig({ entry: { options: {} } }) === null
    })())
    const hostDeclared = (() => {
      const clone = structuredClone(assetPlugins())
      findRow(clone, 'tool-presentation').config.mode = 'ptc'
      return clone
    })()
    writeFileSync(patchFile, declarationPatchText().replace('mode: native', 'mode: ptc'), 'utf8')
    writeManifestWith(currentHash)
    const hostShape = await syncPreset({ dshHome: home, declaredPlugins: hostDeclared, settingsValues: { toolPresentationMode: 'both' } })
    check('宿主形状：settingsValues 权威值（both）≠ 投影（ptc）→ 非 idle 且投影 plan 写 both',
      hostShape.action !== 'idle' && hostShape.plan.preset !== null && hostShape.plan.preset.hostRowConfig['tool-presentation'].mode === 'both')
    check('宿主形状：settings 行已有该键 → 不回填（settings.values 不含该键）',
      hostShape.plan.settings === null || !Object.prototype.hasOwnProperty.call(hostShape.plan.settings.values, 'toolPresentationMode'))
    writeManifestWith(currentHash)
    const hostBackfill = await syncPreset({ dshHome: home, declaredPlugins: hostDeclared, settingsValues: {} })
    check('宿主形状：settings 行在但缺项 + 声明行非出厂值 → 一次性回填（present=true 才触发，行缺席不触发）',
      hostBackfill.action !== 'idle' && hostBackfill.plan.settings !== null && hostBackfill.plan.settings.values.toolPresentationMode === 'ptc')

    // 键在但值非法（手改 YAML）不算「缺失」：按权威值/出厂值修复，不留在稳态
    const illegalDeclared = (() => {
      const clone = structuredClone(assetPlugins())
      findRow(clone, 'tool-presentation').config.mode = 'code'
      return clone
    })()
    writeManifestWith(currentHash)
    const illegalRun = await syncPreset({ dshHome: home, declaredPlugins: illegalDeclared, settingsValues: { toolPresentationMode: 'native' } })
    check('投影值非法（mode=code）→ 非 idle 且按权威值修复为 native（键在≠缺失，不留在稳态）',
      illegalRun.action !== 'idle' && illegalRun.plan.preset !== null && illegalRun.plan.preset.hostRowConfig['tool-presentation'].mode === 'native')
    const illegalRebuilt = restatePresetPlugins({ plugins: illegalDeclared }, null, illegalRun.plan.preset, assetPlugins())
    check('投影值非法修复后子行值合法（避免 carry 把非法值写回）', findRow(illegalRebuilt.plugins, 'tool-presentation').config.mode === 'native')

    writeFileSync(patchFile, declarationPatchText(), 'utf8')
    if (legacyBackup !== null) writeFileSync(join(stateDir, 'agent.cordis.yml'), legacyBackup, 'utf8')
  }

  // ⑦ 旧 flash-guide 根级块清理：profiles/*/cordis.patch.yml 契约保持
  const sampleDir = join(home, 'profiles', 'sample')
  mkdirSync(sampleDir, { recursive: true })
  const samplePatch = join(sampleDir, 'cordis.patch.yml')
  const approval = '    approvalEnabled: true'
  writeFileSync(samplePatch, '- id: flash-guide\n  disabled: true\n- id: keep\n  config:\n' + approval + '\n', 'utf8')
  writeFileSync(join(stateDir, 'dist-manifest.json'), JSON.stringify({ format: 1, distHash: 'OLD-FLASH' }, null, 2) + '\n', 'utf8')
  const flashRun = await syncPreset({ dshHome: home, readPatch })
  check('非 idle 运行清理旧 flash-guide 块且不碰其它行', flashRun.action === 'upgraded' && !readFileSync(samplePatch, 'utf8').includes('flash-guide') && readFileSync(samplePatch, 'utf8').includes(approval))

  // ⑧ 空 plannerModel（显式清空）→ captured/restored，写回 '' 而非回填资产默认
  writeFileSync(join(stateDir, 'agent.cordis.yml'), patchAgent({ plannerModel: '' }), 'utf8')
  writeFileSync(join(stateDir, 'dist-manifest.json'), JSON.stringify({ format: 1, distHash: 'OLD-EMPTY-PLANNER' }, null, 2) + '\n', 'utf8')
  const emptyRun = await syncPreset({ dshHome: home, readPatch })
  check('旧值空串 plannerModel → restored 且落地值为 ``（不回填 deepseek-v4-pro）', emptyRun.action === 'upgraded' && emptyRun.plan.audit.results.plannerModel === 'restored' && emptyRun.plan.settings.values.plannerModel === '')

  // ⑨ 无台账但状态目录有旧副本（跨版本残留）→ 按首次 written 处理并迁移
  rmSync(join(stateDir, 'dist-manifest.json'))
  writeFileSync(join(stateDir, 'agent.cordis.yml'), patchAgent({ exploreBudget: 42 }), 'utf8')
  const noManifest = await syncPreset({ dshHome: home, readPatch })
  check('无台账 + 旧副本 → written 且 sourceDistHash=null、exploreBudget=42 恢复', noManifest.action === 'written' && noManifest.plan.audit.sourceDistHash === null && noManifest.plan.settings.values.exploreBudget === 42)
} finally {
  rmSync(work, { recursive: true, force: true })
}

console.log('\n通过 ' + pass + ', 失败 ' + fail)
process.exit(fail === 0 ? 0 : 1)
