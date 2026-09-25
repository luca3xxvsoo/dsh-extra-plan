// syncPreset 启动自愈回归（dsh 0.1.7 新载体）。
// 夹具（全部位于系统临时 DSH_HOME，绝不使用真实生产目录）：
//   目标物 $DSH_HOME/profiles/web/cordis.patch.yml（声明行 preset-extra-plan 的 config.plugins
//   + settings 行 dsh-extra-plan-settings 的 config = 10 项权威值落点）
// 断言语义（2026-09-25 台账链整链删除后）：**无 manifest 台账、无旧副本迁移**；
//   启动自愈 = 三维判定（声明行覆盖资产行 id 集合 + 本体剥离比对 + 投影一致性）：
//   三维全成立 → idle（不写盘、apply 不被调用）；任一不成立 → written（action 恒 'written'，
//   无 firstRun/upgraded 之分），内容经注入的 apply 回调落地（宿主侧即 configEditor.edit）。
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
  syncPreset,
  DECLARATION_ROW_IDS,
  declarationCoversAsset,
  declarationBodyMatchesAsset,
  effectiveRowConfig,
  restatePresetPlugins,
  carryUserWritable,
  assetPlugins,
  readDeclaredPluginsFromPatch,
} from '../../plugins/dsh-extra-plan/lib/preset-sync.js'
import { GATE_WORD_FIELDS } from '../../plugins/dsh-extra-plan/lib/gate-words.js'

const HERE = fileURLToPath(new URL('.', import.meta.url))
const assetAgent = readFileSync(join(ASSET_DIR, 'agent.cordis.yml'), 'utf8')
const generatedPatchText = readFileSync(ASSET_PATCH_FILE, 'utf8')

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

const work = mkdtempSync(join(tmpdir(), 'dsh-sync-carrier-'))
const home = join(work, 'home')
const profileDir = join(home, 'profiles', 'web')
const patchFile = join(profileDir, 'cordis.patch.yml')
mkdirSync(profileDir, { recursive: true })
writeFileSync(patchFile, declarationPatchText(), 'utf8')
const readPatch = () => readFileSync(patchFile, 'utf8')
const GATE_CUSTOM = { routeDirect: '甲直行', routePlan: '乙规划', routeDisagree: '丙否决', approvalApprove: '丁批准', approvalReplan: '戊转规划', purposeRefine: '己完整', purposeRedo: '庚重做' }

try {
  // ① 首次自愈：声明行本体 = 资产且投影 = 出厂值（无 settings 行）→ 三维全成立 → idle
  const applied = []
  const first = await syncPreset({ readPatch, apply: async (plan, ctx) => { applied.push({ plan, ctx }) } })
  check('首次自愈（声明行 = 资产本体、投影 = 出厂值）→ idle', first.action === 'idle')
  check('idle 运行无落地 plan 且不调用 apply', first.plan === undefined && applied.length === 0)

  // ② 收敛：再次同步仍 idle（三维判定不依赖任何台账，不反复重建）
  check('第二次 → idle（无 manifest 台账参与判定）', (await syncPreset({ readPatch })).action === 'idle')

  // ⑥ 目标物判定：声明行 plugins 缺 extra-plan 行 → 非 idle
  const brokenPatch = declarationPatchText().replace('          - id: extra-plan\n', '          - id: extra-plan-renamed\n')
  writeFileSync(patchFile, brokenPatch, 'utf8')
  const notCovered = await syncPreset({ readPatch })
  check('声明行 plugins 不覆盖资产行 id 集合 → 非 idle', notCovered.action !== 'idle')
  check('declarationCoversAsset 双态判定敏感', declarationCoversAsset([{ id: 'extra-plan' }, { id: 'tool-web' }, { id: 'tool-presentation' }]) === true && declarationCoversAsset([{ id: 'extra-plan-renamed' }]) === false)
  check('DECLARATION_ROW_IDS 覆盖 extra-plan / tool-web / tool-presentation', DECLARATION_ROW_IDS.join('|') === 'extra-plan|tool-web|tool-presentation')
  writeFileSync(patchFile, declarationPatchText(), 'utf8')

  // ⑥-2 本体内容维度（本次 0.1.7-rc.2 故障根因回归）：3 个行 id 全在、但本体与资产不一致 → 必须非 idle。
  // 修复前 declarationCoversAsset 只查「行 id 在不在」，此类「资产只有 config 值变化」的升级会被判 idle 而永不生效。
  const stalePatch = declarationPatchText().replace('maxBytes: 65536', 'maxBytes: 32768')
  check('夹具：本体过期 patch 与资产本体确实不同', stalePatch !== declarationPatchText())
  writeFileSync(patchFile, stalePatch, 'utf8')
  const staleRun = await syncPreset({ readPatch })
  check('本体过期（3 个行 id 全在）→ 非 idle', staleRun.action !== 'idle')
  check('本体过期判定不依赖台账（无 manifest 参与判定，仅本体维度触发 bodyStale）', staleRun.plan.bodyStale === true && staleRun.plan.settings === null && staleRun.plan.preset === null)
  writeFileSync(patchFile, declarationPatchText(), 'utf8')
  check('本体恢复为资产 → idle（收敛，不反复重搬）', (await syncPreset({ readPatch })).action === 'idle')

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

  // ⑥-4 自愈闭环（本轮关键钉死项）：本体过期 + 用户定制并存 →
  //   必须判非 idle 且携带 bodyStale（applyPlan 据此重建）；重建语义 = 资产基底 + carry 保住用户值；重建后收敛 idle。
  // 迁移源已整链删除，用户值的唯一来源 = 声明行现值 carry（故本段不需任何旧副本夹具）。
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
    const staleUserPatch = declarationPatchText().replace('maxBytes: 65536', 'maxBytes: 32768').replace('mode: native', 'mode: ptc')
    check('闭环夹具：本体陈旧且保留用户值（mode: ptc）', staleUserPatch !== declarationPatchText() && staleUserPatch.indexOf('mode: ptc') !== -1)
    writeFileSync(patchFile, staleUserPatch, 'utf8')
    const applied = []
    const staleRun = await syncPreset({ readPatch, apply: async (plan) => { applied.push(plan) } })
    check('闭环①：本体过期 → 非 idle', staleRun.action !== 'idle')
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
    check('闭环⑥：现场恢复为「资产本体 + 用户值」→ idle（收敛）', (await syncPreset({ readPatch })).action === 'idle')
    writeFileSync(patchFile, declarationPatchText(), 'utf8')
  }

  // ⑥-5 carryUserWritable 三态（与剥离表同源；无迁移源时保住现场用户值的唯一来源）
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
  // 夹具 = patchFile 直接含 settings 行（+ 可选声明行）；判定与落地全部由三维维度驱动（无台账夹具）。
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

    // T-1 投影被宿主删除（patchFile 无声明行）+ settings 行含非出厂值 → 非 idle → 重建投影 = 权威值
    writeFileSync(patchFile, settingsRow(["toolPresentationMode: 'ptc'"]), 'utf8')
    const t1 = await syncPreset({ readPatch })
    check('T-1a 投影被删（无声明行）+ settings 行非出厂值 → 非 idle', t1.action !== 'idle')
    check('T-1b 非 idle 仅由投影维度触发（本体未过期、无回填）', t1.plan.bodyStale === false && t1.plan.settings === null &&
      t1.plan.preset !== null && t1.plan.preset.hostRowConfig['tool-presentation'].mode === 'ptc' && Object.keys(t1.plan.preset.hostRowConfig).length === 1)
    const t1rebuilt = restatePresetPlugins({ plugins: undefined }, null, t1.plan.preset, assetPlugins())
    check('T-1c 按 plan 重建声明行后子行值 = settings 行权威值（mode=ptc / fetch 保持出厂 false）',
      findRow(t1rebuilt.plugins, 'tool-presentation').config.mode === 'ptc' && findRow(t1rebuilt.plugins, 'tool-web').config.fetch === false)

    // T-2 settings 行权威值改写 → 下一次 syncPreset 判非 idle 并投影新值；投影跟上后收敛 idle
    writeFileSync(patchFile, settingsRow(["toolPresentationMode: 'both'"]) + declarationPatchText().replace('mode: native', 'mode: ptc'), 'utf8')
    const t2 = await syncPreset({ readPatch })
    check('T-2a 权威值（both）≠ 当前投影（ptc）→ 非 idle', t2.action !== 'idle')
    check('T-2b 投影 plan 写入权威新值（both），未改动的 webFetch 不写冗余覆盖',
      t2.plan.preset !== null && t2.plan.preset.hostRowConfig['tool-presentation'].mode === 'both' && Object.keys(t2.plan.preset.hostRowConfig).length === 1)
    writeFileSync(patchFile, settingsRow(["toolPresentationMode: 'both'"]) + declarationPatchText().replace('mode: native', 'mode: both'), 'utf8')
    check('T-2c 投影已跟随权威值 → idle（收敛，不反复重写）', (await syncPreset({ readPatch })).action === 'idle')

    // T-3 权威值 == 出厂值 + 声明行缺失 → idle（稳态，不反复重建、不空转写盘）
    writeFileSync(patchFile, settingsRow(['webFetch: false', "toolPresentationMode: 'native'"]), 'utf8')
    check('T-3 投影值 == 出厂值 且 声明行缺失 → idle（不空转）', (await syncPreset({ readPatch })).action === 'idle')

    // T-4 一次性回填（M-1/M-2）：settings 行缺这 2 项 + 声明行子行有非出厂值 → 回填 settings 行 = 声明行旧值
    writeFileSync(patchFile, settingsRow(['creativeMode: true']) + declarationPatchText().replace('mode: native', 'mode: ptc'), 'utf8')
    const t4 = await syncPreset({ readPatch })
    check('T-4a settings 行缺项 + 声明行非出厂值 → 非 idle 且回填值 = 声明行旧值（ptc）',
      t4.action !== 'idle' && t4.plan.settings !== null && t4.plan.settings.values.toolPresentationMode === 'ptc')
    check('T-4b 回填不制造空 override（webFetch 为出厂值 → 不写该键；回填只含 1 键）',
      !Object.prototype.hasOwnProperty.call(t4.plan.settings.values, 'webFetch') && Object.keys(t4.plan.settings.values).length === 1)
    check('T-4c 回填不重写投影（投影已等于权威值 → plan.preset 为空）', t4.plan.preset === null)
    check('T-4d 回填值即声明行旧值，且非 idle 仅由回填维度触发（本体未过期、无台账参与）',
      t4.plan.bodyStale === false && t4.plan.settings.values.toolPresentationMode === 'ptc')
    writeFileSync(patchFile, settingsRow(['creativeMode: true', "toolPresentationMode: 'ptc'"]) + declarationPatchText().replace('mode: native', 'mode: ptc'), 'utf8')
    check('T-4e 回填完成后（settings 行已有该值）→ idle（一次性，不反复回填）', (await syncPreset({ readPatch })).action === 'idle')

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
    const hostShape = await syncPreset({ declaredPlugins: hostDeclared, settingsValues: { toolPresentationMode: 'both' } })
    check('宿主形状：settingsValues 权威值（both）≠ 投影（ptc）→ 非 idle 且投影 plan 写 both',
      hostShape.action !== 'idle' && hostShape.plan.preset !== null && hostShape.plan.preset.hostRowConfig['tool-presentation'].mode === 'both')
    check('宿主形状：settings 行已有该键 → 不回填（settings.values 不含该键）',
      hostShape.plan.settings === null || !Object.prototype.hasOwnProperty.call(hostShape.plan.settings.values, 'toolPresentationMode'))
    const hostBackfill = await syncPreset({ declaredPlugins: hostDeclared, settingsValues: {} })
    check('宿主形状：settings 行在但缺项 + 声明行非出厂值 → 一次性回填（present=true 才触发，行缺席不触发）',
      hostBackfill.action !== 'idle' && hostBackfill.plan.settings !== null && hostBackfill.plan.settings.values.toolPresentationMode === 'ptc')

    // 键在但值非法（手改 YAML）不算「缺失」：按权威值/出厂值修复，不留在稳态
    const illegalDeclared = (() => {
      const clone = structuredClone(assetPlugins())
      findRow(clone, 'tool-presentation').config.mode = 'code'
      return clone
    })()
    const illegalRun = await syncPreset({ declaredPlugins: illegalDeclared, settingsValues: { toolPresentationMode: 'native' } })
    check('投影值非法（mode=code）→ 非 idle 且按权威值修复为 native（键在≠缺失，不留在稳态）',
      illegalRun.action !== 'idle' && illegalRun.plan.preset !== null && illegalRun.plan.preset.hostRowConfig['tool-presentation'].mode === 'native')
    const illegalRebuilt = restatePresetPlugins({ plugins: illegalDeclared }, null, illegalRun.plan.preset, assetPlugins())
    check('投影值非法修复后子行值合法（避免 carry 把非法值写回）', findRow(illegalRebuilt.plugins, 'tool-presentation').config.mode === 'native')

    writeFileSync(patchFile, declarationPatchText(), 'utf8')
  }
} finally {
  rmSync(work, { recursive: true, force: true })
}

console.log('\n通过 ' + pass + ', 失败 ' + fail)
process.exit(fail === 0 ? 0 : 1)
