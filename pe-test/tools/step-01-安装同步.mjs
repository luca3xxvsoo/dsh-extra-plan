// syncPreset 启动自愈回归（dsh 0.1.7-rc.1 新载体）。
// 夹具（全部位于系统临时 DSH_HOME，绝不使用真实生产目录）：
//   状态目录 $DSH_HOME/.agent-presets/extra-plan/（dist-manifest.json 台账 + 旧分发副本 agent.cordis.yml）
//   目标物 $DSH_HOME/profiles/web/cordis.patch.yml（声明行 preset-extra-plan 的 config.plugins）
// 断言语义保留（原「首次/升级/幂等 + settings captured/10 项 + gateWordsMigration 7 项」）：
//   首次 → written（源缺席）；有旧副本 → upgraded（8 项落 settings 行、2 项落声明行子行、7 词整组迁移）；
//   收敛 → idle。写盘经注入的 apply 回调（宿主侧即 configEditor.edit）。

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
  restatePresetPlugins,
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
  check('升级后 8 项 UI 设置值取自旧副本（settings 行落点）', planSettings !== null &&
    planSettings.values.plannerModel === 'old-sync-model' && planSettings.values.crossProviderPlannerModel === true &&
    planSettings.values.plannerPromptSuffix === 'old: sync suffix' && planSettings.values.exploreBudget === 9 &&
    planSettings.values.otherAgentModel === 'old-sync-other-model' && planSettings.values.anchoredBootstrap === false &&
    planSettings.values.creativeMode === false && planSettings.values.runcodeCatchGate === true &&
    Object.keys(planSettings.values).length === 8)
  check('升级后 2 项宿主行落声明行 plugins 子行（tool-web.fetch / tool-presentation.mode）', planPreset !== null &&
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
  check('缺失键不进入落地值（settings 行只写有值的 7 项）', missingRun.plan.settings !== null && !Object.prototype.hasOwnProperty.call(missingRun.plan.settings.values, 'otherAgentModel') && Object.keys(missingRun.plan.settings.values).length === 7)

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
