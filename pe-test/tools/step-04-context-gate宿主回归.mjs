// step-04-context-gate宿主回归.mjs
// 本脚本只使用当前安装宿主包、公共 ctx.agents.create/resume、受控 adapter 与工作区 JSONL。
// 受控 adapter 属于测试夹具，不代表真实 provider；真实 provider/生产/GUI/HUMAN 明确 NOT-RUN。
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, writeFileSync, statSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { createIsolatedEnv, makeFixtureDir } from '../_shared/workspace-paths.mjs'
import { createPathContext } from '../../plugins/dsh-extra-plan/lib/path-policy.js'
import { registerHostDeps } from '../_shared/host-deps.mjs'



const HERE = dirname(fileURLToPath(import.meta.url))
const ROOT = resolve(HERE, '..', '..')
const PLUGIN_PATH = join(ROOT, 'plugins', 'dsh-extra-plan', 'index.js')
const GATE_PATH = join(ROOT, 'plugins', 'dsh-extra-plan', 'lib', 'gate-decisions.js')
const ASSEMBLY_PATH = join(ROOT, 'plugins', 'dsh-extra-plan', 'lib', 'assembly-presentation.js')
const AUTHOR_SOURCE_PATH = join(ROOT, 'plugins', 'dsh-extra-plan', 'assets', 'presets', 'extra-plan', 'agent.cordis.yml')
const INSTALL_ROOT_RAW = typeof process.env.DSH_INSTALL_ROOT === 'string' && process.env.DSH_INSTALL_ROOT.trim() !== '' ? process.env.DSH_INSTALL_ROOT.trim() : null
const contextFixture = makeFixtureDir({ label: 'context-gate' })
const BATCH_DIR = contextFixture.root
const HOME_DIR = join(BATCH_DIR, 'home')
const SESSION_ROOT = join(BATCH_DIR, 'sessions')
const WORKSPACE = join(BATCH_DIR, 'workspace')
const SKILLS_ROOT = join(BATCH_DIR, 'skills')
const TRACE_PATH = join(BATCH_DIR, 'request-trace.json')
const DURABLE_PATH = join(BATCH_DIR, 'durable-events.json')
const PUBLICATION_INDEX_PATH = join(BATCH_DIR, 'context-publication-index.json')
const CONTEXT_GATE_FIXTURE_TEXT = Object.freeze({
  agents: '# context-gate fixture\nfixture baseline instructions\n',
  // DSH_COMPAT_RC1：旧三名兼容技能；仅在明确撤销rc.1兼容并保留共享context安全回归后删除。
  compatCordisPluginDevelopment: '---\nname: cordis-plugin-development\ndescription: rc1 compatibility creative fixture skill\n---\nrc1 compatibility creative skill body\n',
  compatEditingCordisCompositions: '---\nname: editing-cordis-compositions\ndescription: rc1 compatibility creative fixture skill\n---\nrc1 compatibility creative skill body\n',
  compatCordisCompositionReference: '---\nname: cordis-composition-reference\ndescription: rc1 compatibility creative fixture skill\n---\nrc1 compatibility creative skill body\n',
  // DSH_CURRENT_RC2：最新路径当前来源（rc.2 与 rc.3 共用）；ordinary项仍是普通技能，不归历史可删。
  currentDshDoc: '---\nname: dsh-doc\ndescription: rc2 current creative fixture skill\n---\nrc2 current creative skill body\n',
  currentAgentExperience: '---\nname: agent-experience\ndescription: rc2 current ordinary fixture skill\n---\nrc2 current ordinary skill body\n',
  currentOrdinarySkill: '---\nname: ordinary-skill\ndescription: rc2 current ordinary fixture skill\n---\nrc2 current ordinary skill body\n'
})
mkdirSync(HOME_DIR, { recursive: true })
mkdirSync(SESSION_ROOT, { recursive: true })
mkdirSync(join(WORKSPACE, '.git'), { recursive: true })
mkdirSync(join(SKILLS_ROOT, 'cordis-plugin-development'), { recursive: true })
mkdirSync(join(SKILLS_ROOT, 'editing-cordis-compositions'), { recursive: true })
mkdirSync(join(SKILLS_ROOT, 'cordis-composition-reference'), { recursive: true })
mkdirSync(join(SKILLS_ROOT, 'dsh-doc'), { recursive: true })
mkdirSync(join(SKILLS_ROOT, 'agent-experience'), { recursive: true })
mkdirSync(join(SKILLS_ROOT, 'ordinary-skill'), { recursive: true })
writeFileSync(join(WORKSPACE, 'AGENTS.md'), CONTEXT_GATE_FIXTURE_TEXT.agents, 'utf8')
writeFileSync(join(SKILLS_ROOT, 'cordis-plugin-development', 'SKILL.md'), CONTEXT_GATE_FIXTURE_TEXT.compatCordisPluginDevelopment, 'utf8')
writeFileSync(join(SKILLS_ROOT, 'editing-cordis-compositions', 'SKILL.md'), CONTEXT_GATE_FIXTURE_TEXT.compatEditingCordisCompositions, 'utf8')
writeFileSync(join(SKILLS_ROOT, 'cordis-composition-reference', 'SKILL.md'), CONTEXT_GATE_FIXTURE_TEXT.compatCordisCompositionReference, 'utf8')
writeFileSync(join(SKILLS_ROOT, 'dsh-doc', 'SKILL.md'), CONTEXT_GATE_FIXTURE_TEXT.currentDshDoc, 'utf8')
writeFileSync(join(SKILLS_ROOT, 'agent-experience', 'SKILL.md'), CONTEXT_GATE_FIXTURE_TEXT.currentAgentExperience, 'utf8')
writeFileSync(join(SKILLS_ROOT, 'ordinary-skill', 'SKILL.md'), CONTEXT_GATE_FIXTURE_TEXT.currentOrdinarySkill, 'utf8')

const CONTEXT_ENV_KEYS = Object.freeze(['DSH_HOME', 'HOME', 'USERPROFILE', 'APPDATA', 'LOCALAPPDATA', 'XDG_CACHE_HOME', 'DSH_EXTRA_PLAN_CAPTURE_DIR', 'DSH_EXTRA_PLAN_REPORT_DIR', 'TEMP', 'TMP', 'TMPDIR', 'DSH_PROFILE', 'DSH_EXTRA_PLAN_CONFIG_PATH'])
const previousEnv = Object.fromEntries(CONTEXT_ENV_KEYS.map((key) => [key, process.env[key]]))
const contextIsolatedEnv = createIsolatedEnv({ fixture: contextFixture, extra: { DSH_PROFILE: 'context-gate', DSH_EXTRA_PLAN_CONFIG_PATH: undefined } })
for (const key of CONTEXT_ENV_KEYS) {
  const value = contextIsolatedEnv[key]
  if (value === undefined) delete process.env[key]
  else process.env[key] = value
}
const INSTALL_ROOT = INSTALL_ROOT_RAW === null ? null : createPathContext({ hostDataRoot: INSTALL_ROOT_RAW }).hostDataRoot
await registerHostDeps()
const { Context } = await import('@deepseek-ai/cordis')
const { default: Loader } = await import('@deepseek-ai/cordis-plugin-loader')
const { LlmAdapter } = await import('@deepseek-ai/dsh-llm')
const { parsePresetYaml } = await import('../../plugins/dsh-extra-plan/lib/preset-settings.js')

let pass = 0
let fail = 0
let incomplete = 0
function check(label, condition, detail = '') {
  if (condition) { pass += 1; console.log('PASS  ' + label) }
  else { fail += 1; console.log('FAIL  ' + label + (detail === '' ? '' : '：' + detail)) }
}
function incompleteCheck(label, detail) {
  incomplete += 1
  console.log('INCOMPLETE  ' + label + '：' + detail)
}
function sourceKind(message) {
  return message !== null && typeof message === 'object' && message.source !== null && typeof message.source === 'object' ? message.source.kind : undefined
}
function messageKinds(messages) {
  return Array.isArray(messages) ? messages.map(sourceKind).filter((kind) => typeof kind === 'string') : []
}
function countKinds(messages, kinds) {
  return messageKinds(messages).filter((kind) => kinds.includes(kind)).length
}
function safeCopy(value) {
  try { return JSON.parse(JSON.stringify(value)) } catch { return null }
}
const CONTEXT_PUBLICATION_KINDS = Object.freeze(['agent-instructions', 'skill-catalog'])
const CONTEXT_GATE_PROMPTS = Object.freeze({
  first: 'first fixture prompt',
  second: 'second fixture prompt',
  toolBoundary: 'tool boundary fixture prompt',
  stableL1: 'stable L fixture prompt 1',
  stableL2: 'stable L fixture prompt 2'
})
function userMessagePublicationRecords(events) {
  if (!Array.isArray(events)) return []
  return events.flatMap((event) => {
    if (event === null || typeof event !== 'object' || event.type !== 'user/message') return []
    const message = event.data !== null && typeof event.data === 'object' ? event.data : null
    return [{
      seq: Number.isInteger(event.seq) && event.seq >= 0 ? event.seq : null,
      id: typeof message?.id === 'string' && message.id !== '' ? message.id : null,
      kind: typeof message?.source?.kind === 'string' && message.source.kind !== '' ? message.source.kind : null,
      surfaceOp: event.surfaceOp === undefined ? 'append' : safeCopy(event.surfaceOp),
      source: safeCopy(message?.source ?? null),
      content: safeCopy(message?.content ?? null)
    }]
  })
}
function rawContextMessageMetadata(messages) {
  if (!Array.isArray(messages)) return []
  return messages.filter((message) => CONTEXT_PUBLICATION_KINDS.includes(sourceKind(message))).map((message) => ({
    id: typeof message?.id === 'string' && message.id !== '' ? message.id : null,
    kind: sourceKind(message),
    source: safeCopy(message?.source ?? null),
    content: safeCopy(message?.content ?? null)
  }))
}
function publicationMetadata(record) {
  return { seq: record.seq, id: record.id, kind: record.kind, surfaceOp: safeCopy(record.surfaceOp), source: safeCopy(record.source ?? null), content: safeCopy(record.content ?? null) }
}
function contextRecordSignature(record) {
  return JSON.stringify({ kind: record?.kind ?? null, source: record?.source ?? null, content: record?.content ?? null })
}
function isPublicationRecordValid(record) {
  return record !== null && typeof record === 'object' && Number.isInteger(record.seq) && record.seq >= 0 && typeof record.id === 'string' && record.id !== '' && typeof record.kind === 'string' && record.kind !== ''
}
function publicationSignature(record) {
  return contextRecordSignature(record)
}
function publicationAnomalies(records) {
  const reasons = new Set()
  const ids = new Set()
  const seqs = new Set()
  const contentIds = new Map()
  for (const record of Array.isArray(records) ? records : []) {
    if (!isPublicationRecordValid(record)) { reasons.add('missing-id-or-seq'); continue }
    if (ids.has(record.id)) reasons.add('duplicate-id')
    if (seqs.has(record.seq)) reasons.add('duplicate-seq')
    const contentKey = publicationSignature(record)
    const previousId = contentIds.get(contentKey)
    if (previousId !== undefined && previousId !== record.id) { reasons.add('same-content-new-id'); reasons.add('duplicate-signature') }
    if (previousId === undefined) contentIds.set(contentKey, record.id)
    ids.add(record.id)
    seqs.add(record.seq)
  }
  return [...reasons]
}
function createPublicationState() {
  return { seenSeqs: new Set(), seenIds: new Set(), seenSignatures: new Set(), recordsBySeq: new Map(), recordsById: new Map() }
}
function observationStatus(missing, anomalies) {
  const consistency = (Array.isArray(anomalies) ? anomalies : []).filter((reason) => !['missing-id-or-seq', 'missing-publication-snapshot'].includes(reason))
  if (consistency.length > 0) return 'FAIL'
  if (Array.isArray(missing) && missing.length > 0) return 'INCOMPLETE'
  return 'PASS'
}
function markObservationIncomplete(observation, reason) {
  if (!Array.isArray(observation.missing)) observation.missing = []
  if (!observation.missing.includes(reason)) observation.missing.push(reason)
  observation.complete = false
  observation.status = observationStatus(observation.missing, observation.anomalies)
  return observation
}
function observePublicationRecords(records, state) {
  const missing = []
  if (!Array.isArray(records)) missing.push('missing-publication-snapshot')
  const candidates = (Array.isArray(records) ? records : []).filter((record) => CONTEXT_PUBLICATION_KINDS.includes(record?.kind))
  const invalid = candidates.filter((record) => !isPublicationRecordValid(record))
  if (invalid.length > 0) missing.push('missing-id-or-seq')
  const target = candidates.filter((record) => isPublicationRecordValid(record))
  const replayed = target.filter((record) => state.seenSeqs.has(record.seq))
  const newDurable = target.filter((record) => !state.seenSeqs.has(record.seq))
  const newIds = newDurable.filter((record) => !state.seenIds.has(record.id))
  const batchAnomalies = publicationAnomalies(target)
  const historicalAnomalies = []
  for (const record of target) {
    const signature = publicationSignature(record)
    const previousSeq = state.recordsBySeq.get(record.seq)
    if (previousSeq !== undefined && (previousSeq.id !== record.id || publicationSignature(previousSeq) !== signature)) historicalAnomalies.push('same-seq-rewritten')
    const previousId = state.recordsById.get(record.id)
    if (previousId !== undefined) {
      if (previousId.seq !== record.seq) historicalAnomalies.push('same-id-new-seq')
      if (publicationSignature(previousId) !== signature) historicalAnomalies.push('historical-id-changed')
    }
    if (newDurable.includes(record) && state.seenSignatures.has(signature)) historicalAnomalies.push('duplicate-signature')
  }
  for (const record of target) {
    if (!state.recordsBySeq.has(record.seq)) state.recordsBySeq.set(record.seq, safeCopy(record))
    if (!state.recordsById.has(record.id)) state.recordsById.set(record.id, safeCopy(record))
    state.seenSeqs.add(record.seq)
    state.seenIds.add(record.id)
    state.seenSignatures.add(publicationSignature(record))
  }
  const invalidAnomalies = publicationAnomalies(invalid)
  const anomalies = [...new Set([...invalidAnomalies, ...batchAnomalies, ...historicalAnomalies])]
  return {
    candidates,
    target,
    replayed,
    newDurable,
    newIds,
    anomalies,
    missing: [...new Set(missing)],
    complete: missing.length === 0,
    status: observationStatus(missing, anomalies),
    diagnostics: { invalid: invalidAnomalies, batch: batchAnomalies, historical: [...new Set(historicalAnomalies)], all: anomalies }
  }
}
function createModelState() {
  return { seenIds: new Set(), recordsById: new Map(), recordsBySignature: new Map() }
}
function isModelRecordValid(record) {
  return record !== null && typeof record === 'object' && typeof record.id === 'string' && record.id !== '' && typeof record.kind === 'string' && record.kind !== ''
}
function observeRawContextMessages(records, state) {
  const missing = []
  if (!Array.isArray(records)) missing.push('missing-model-snapshot')
  const candidates = Array.isArray(records) ? records.filter((record) => CONTEXT_PUBLICATION_KINDS.includes(record?.kind)) : []
  const invalid = candidates.filter((record) => !isModelRecordValid(record))
  if (invalid.length > 0) missing.push('missing-id')
  const target = candidates.filter((record) => isModelRecordValid(record))
  const currentIds = new Set()
  const replayed = []
  const newIds = []
  const anomalies = []
  for (const record of target) {
    if (currentIds.has(record.id)) anomalies.push('duplicate-id')
    const signature = contextRecordSignature(record)
    const previousId = state.recordsById.get(record.id)
    if (previousId !== undefined && previousId.signature !== signature) anomalies.push('historical-id-changed')
    const previousSignature = state.recordsBySignature.get(signature)
    if (previousSignature !== undefined && previousSignature.id !== record.id) anomalies.push('same-content-new-id')
    if (state.seenIds.has(record.id)) replayed.push(record)
    else newIds.push(record)
    currentIds.add(record.id)
  }
  for (const record of target) {
    const signature = contextRecordSignature(record)
    if (!state.recordsById.has(record.id)) state.recordsById.set(record.id, { signature, record: safeCopy(record) })
    if (!state.recordsBySignature.has(signature)) state.recordsBySignature.set(signature, { id: record.id, record: safeCopy(record) })
    state.seenIds.add(record.id)
  }
  const uniqueAnomalies = [...new Set(anomalies)]
  return {
    all: target,
    replayed,
    newIds,
    anomalies: uniqueAnomalies,
    missing: [...new Set(missing)],
    complete: missing.length === 0,
    status: observationStatus(missing, uniqueAnomalies),
    diagnostics: { invalid: invalid.map(() => 'missing-id'), historical: uniqueAnomalies.filter((reason) => reason === 'historical-id-changed'), all: uniqueAnomalies }
  }
}
function compareModelAndDurable(modelRecords, durableRecords) {
  if (!Array.isArray(modelRecords) || !Array.isArray(durableRecords)) return { ok: false, status: 'INCOMPLETE', missing: ['model-or-durable-new-records'], missingModelIds: [], missingDurableIds: [], mismatched: [] }
  const modelById = new Map(modelRecords.map((record) => [record.id, record]))
  const durableById = new Map(durableRecords.map((record) => [record.id, record]))
  const missingDurableIds = [...modelById.keys()].filter((id) => !durableById.has(id))
  const missingModelIds = [...durableById.keys()].filter((id) => !modelById.has(id))
  const mismatched = [...modelById.keys()].filter((id) => durableById.has(id) && contextRecordSignature(modelById.get(id)) !== contextRecordSignature(durableById.get(id)))
  const ok = missingDurableIds.length === 0 && missingModelIds.length === 0 && mismatched.length === 0 && modelRecords.length === durableRecords.length
  return { ok, status: ok ? 'PASS' : 'FAIL', missing: [], missingModelIds, missingDurableIds, mismatched }
}
function compareFinalContextEvidence(requestIndexes, lastModelRaw, finalSurfaceRecords, finalDurableRecords) {
  const missing = []
  const anomalies = []
  const differences = []
  const addDifference = (kind, path, expected, actual) => {
    differences.push({ kind, path, expected: safeCopy(expected), actual: safeCopy(actual) })
  }
  const requiredArrays = [
    ['request-indexes', requestIndexes],
    ['last-model-raw', lastModelRaw],
    ['final-surface-records', finalSurfaceRecords],
    ['final-durable-records', finalDurableRecords]
  ]
  for (const [name, value] of requiredArrays) {
    if (!Array.isArray(value)) missing.push(name)
  }
  if (missing.length > 0) return { ok: false, status: 'INCOMPLETE', missing: [...new Set(missing)], anomalies: [], differences }
  if (requestIndexes.length !== 6) {
    anomalies.push('request-count')
    addDifference('request-count', 'request-indexes.length', 6, requestIndexes.length)
  }
  const expectedModel = []
  const expectedDurable = []
  for (const [requestOffset, requestIndex] of requestIndexes.entries()) {
    const label = 'request-' + String(requestOffset + 1)
    if (requestIndex === null || typeof requestIndex !== 'object') {
      missing.push(label + '-index')
      continue
    }
    if (!requestIndex.model || typeof requestIndex.model !== 'object' || !Array.isArray(requestIndex.model.newIds)) missing.push(label + '-model-newIds')
    else expectedModel.push(...requestIndex.model.newIds)
    if (!requestIndex.durable || typeof requestIndex.durable !== 'object' || !Array.isArray(requestIndex.durable.newDurable)) missing.push(label + '-durable-newDurable')
    else expectedDurable.push(...requestIndex.durable.newDurable)
  }
  const validRecords = (records, label, requireSeq) => {
    let valid = true
    for (const [recordOffset, record] of records.entries()) {
      const validId = record !== null && typeof record === 'object' && typeof record.id === 'string' && record.id !== ''
      const validKind = CONTEXT_PUBLICATION_KINDS.includes(record?.kind) && record?.source !== null && typeof record?.source === 'object' && record?.source?.kind === record?.kind
      const validFingerprint = record?.source !== null && typeof record?.source === 'object' && record?.source?.kind !== undefined && record?.content !== null && record?.content !== undefined
      const validSeq = !requireSeq || Number.isInteger(record?.seq) && record.seq >= 0
      if (!validId || !validKind || !validFingerprint || !validSeq) {
        missing.push(label + '[' + String(recordOffset) + ']')
        valid = false
      }
    }
    return valid
  }
  const complete = validRecords(expectedModel, 'cumulative-model', false)
    && validRecords(expectedDurable, 'cumulative-durable', true)
    && validRecords(lastModelRaw, 'last-model-raw', false)
    && validRecords(finalSurfaceRecords, 'final-surface', false)
    && validRecords(finalDurableRecords, 'final-durable', true)
  if (!complete || missing.length > 0) return { ok: false, status: 'INCOMPLETE', missing: [...new Set(missing)], anomalies: [...new Set(anomalies)], differences }
  const duplicateValues = (values) => {
    const seen = new Set()
    const duplicates = new Set()
    for (const value of values) {
      if (seen.has(value)) duplicates.add(value)
      else seen.add(value)
    }
    return [...duplicates]
  }
  const recordLists = [
    { name: 'cumulative-model', records: expectedModel, hasSeq: false },
    { name: 'last-model-raw', records: lastModelRaw, hasSeq: false },
    { name: 'final-surface', records: finalSurfaceRecords, hasSeq: false },
    { name: 'cumulative-durable', records: expectedDurable, hasSeq: true },
    { name: 'final-durable', records: finalDurableRecords, hasSeq: true }
  ]
  for (const list of recordLists) {
    const duplicateIds = duplicateValues(list.records.map((record) => record.id))
    if (duplicateIds.length > 0) {
      anomalies.push(list.name + '-duplicate-id')
      addDifference('duplicate-id', list.name + '.id', [], duplicateIds)
    }
    if (list.hasSeq) {
      const duplicateSeqs = duplicateValues(list.records.map((record) => record.seq))
      if (duplicateSeqs.length > 0) {
        anomalies.push(list.name + '-duplicate-seq')
        addDifference('duplicate-seq', list.name + '.seq', [], duplicateSeqs)
      }
    }
  }
  const compareSet = (kind, leftName, leftValues, rightName, rightValues) => {
    const leftSet = new Set(leftValues)
    const rightSet = new Set(rightValues)
    const missingRight = [...leftSet].filter((value) => !rightSet.has(value))
    const extraRight = [...rightSet].filter((value) => !leftSet.has(value))
    if (missingRight.length > 0 || extraRight.length > 0) {
      anomalies.push(kind)
      addDifference(kind, leftName + '<->' + rightName, [...leftSet], [...rightSet])
    }
  }
  const idCollections = [
    ['cumulative-model', expectedModel],
    ['last-model-raw', lastModelRaw],
    ['final-surface', finalSurfaceRecords],
    ['final-durable', finalDurableRecords]
  ]
  for (let leftOffset = 0; leftOffset < idCollections.length; leftOffset += 1) {
    for (let rightOffset = leftOffset + 1; rightOffset < idCollections.length; rightOffset += 1) {
      compareSet('context-id-set-mismatch', idCollections[leftOffset][0], idCollections[leftOffset][1].map((record) => record.id), idCollections[rightOffset][0], idCollections[rightOffset][1].map((record) => record.id))
    }
  }
  const byId = (records) => new Map(records.map((record) => [record.id, record]))
  const bySeq = (records) => new Map(records.map((record) => [record.seq, record]))
  const maps = {
    cumulativeModel: byId(expectedModel),
    lastModel: byId(lastModelRaw),
    finalSurface: byId(finalSurfaceRecords),
    cumulativeDurable: byId(expectedDurable),
    finalDurable: byId(finalDurableRecords),
    cumulativeDurableBySeq: bySeq(expectedDurable),
    finalDurableBySeq: bySeq(finalDurableRecords)
  }
  const compareSignatures = (leftName, leftMap, rightName, rightMap) => {
    for (const id of leftMap.keys()) {
      if (!rightMap.has(id)) continue
      const leftRecord = leftMap.get(id)
      const rightRecord = rightMap.get(id)
      if (contextRecordSignature(leftRecord) !== contextRecordSignature(rightRecord)) {
        anomalies.push('context-signature-mismatch')
        addDifference('context-signature-mismatch', leftName + '<->' + rightName + '.id=' + id, leftRecord, rightRecord)
      }
    }
  }
  const signatureMaps = [
    ['cumulative-model', maps.cumulativeModel],
    ['last-model-raw', maps.lastModel],
    ['final-surface', maps.finalSurface],
    ['cumulative-durable', maps.cumulativeDurable],
    ['final-durable', maps.finalDurable]
  ]
  for (let leftOffset = 0; leftOffset < signatureMaps.length; leftOffset += 1) {
    for (let rightOffset = leftOffset + 1; rightOffset < signatureMaps.length; rightOffset += 1) {
      compareSignatures(signatureMaps[leftOffset][0], signatureMaps[leftOffset][1], signatureMaps[rightOffset][0], signatureMaps[rightOffset][1])
    }
  }
  compareSet('publication-id-set-mismatch', 'cumulative-durable', expectedDurable.map((record) => record.id), 'final-durable', finalDurableRecords.map((record) => record.id))
  compareSet('publication-seq-set-mismatch', 'cumulative-durable', expectedDurable.map((record) => record.seq), 'final-durable', finalDurableRecords.map((record) => record.seq))
  for (const record of expectedDurable) {
    const finalById = maps.finalDurable.get(record.id)
    if (finalById !== undefined && finalById.seq !== record.seq) {
      anomalies.push('publication-id-seq-mismatch')
      addDifference('publication-id-seq-mismatch', 'id=' + record.id, record.seq, finalById.seq)
    }
    const finalBySeq = maps.finalDurableBySeq.get(record.seq)
    if (finalBySeq !== undefined && finalBySeq.id !== record.id) {
      anomalies.push('publication-seq-id-mismatch')
      addDifference('publication-seq-id-mismatch', 'seq=' + String(record.seq), record.id, finalBySeq.id)
    }
    if (finalBySeq !== undefined && contextRecordSignature(finalBySeq) !== contextRecordSignature(record)) {
      anomalies.push('publication-seq-signature-mismatch')
      addDifference('publication-seq-signature-mismatch', 'seq=' + String(record.seq), record, finalBySeq)
    }
  }
  const status = anomalies.length > 0 ? 'FAIL' : 'PASS'
  return { ok: status === 'PASS', status, missing: [], anomalies: [...new Set(anomalies)], differences }
}
function publicationKindCounts(records) {
  if (!Array.isArray(records)) return null
  return CONTEXT_PUBLICATION_KINDS.map((kind) => records.filter((record) => record.kind === kind).length)
}
function countTotal(values) {
  return Array.isArray(values) ? values.reduce((total, value) => total + (Number.isInteger(value) ? value : 0), 0) : null
}
function requestCountStatus(requests, expected = 6) {
  return Array.isArray(requests) && requests.length === expected ? 'PASS' : 'FAIL'
}
function sourceHash(file) {
  return createHash('sha256').update(readFileSync(file)).digest('hex')
}
function persistenceMethodsAvailable(service) {
  return service !== null && (typeof service === 'object' || typeof service === 'function') && ['flush', 'stat', 'list', 'open'].every((name) => typeof service[name] === 'function')
}
function sessionHeaderMatches(actual, expected) {
  return actual !== null && typeof actual === 'object' && expected !== null && typeof expected === 'object' && actual.id === expected.id && actual.version === expected.version && actual.cwd === expected.cwd
}
function eventFieldsMatch(left, right) {
  return left?.seq === right?.seq && JSON.stringify(left?.type) === JSON.stringify(right?.type) && JSON.stringify(left?.data) === JSON.stringify(right?.data)
}
function durablePrefixMatches(expected, actual) {
  if (!Array.isArray(expected) || expected.length === 0 || !Array.isArray(actual) || actual.length < expected.length) return false
  return expected.every((event, index) => eventFieldsMatch(event, actual[index]))
}
function hasToolCall(events) {
  return Array.isArray(events) && events.some((event) => event?.type === 'tool/call' || Array.isArray(event?.type) && event.type.includes('tool/call'))
}
function persistenceEvidenceValid({ service, statSnapshot, listSnapshots, readHandle, readResult, expectedHeader, expectedEvents }) {
  const listed = Array.isArray(listSnapshots) && listSnapshots.some((snapshot) => sessionHeaderMatches(snapshot?.header, expectedHeader))
  return persistenceMethodsAvailable(service) && sessionHeaderMatches(statSnapshot?.header, expectedHeader) && listed && readHandle !== null && typeof readHandle === 'object' && typeof readHandle.read === 'function' && typeof readHandle.close === 'function' && sessionHeaderMatches(readHandle.header, expectedHeader) && durablePrefixMatches(expectedEvents, readResult?.events) && hasToolCall(expectedEvents)
}
async function inspectPersistence(service, expectedHeader, expectedEvents) {
  let statSnapshot
  let listSnapshots
  let readHandle
  let readResult
  let failure = ''
  try {
    if (!persistenceMethodsAvailable(service)) failure = 'sessionPersistence缺少flush/stat/list/open'
    else {
      await service.flush()
      statSnapshot = await service.stat(expectedHeader.id)
      listSnapshots = await service.list()
      readHandle = await service.open(expectedHeader.id, 'read')
      if (readHandle === null || typeof readHandle.read !== 'function') failure = 'open(read)未返回可读handle'
      else readResult = await readHandle.read(0, Array.isArray(expectedEvents) ? expectedEvents.length : 0)
    }
  } catch (error) {
    failure = error instanceof Error ? error.message : String(error)
  } finally {
    if (readHandle !== undefined) {
      if (readHandle === null || typeof readHandle.close !== 'function') {
        if (failure === '') failure = 'read handle缺少close'
      } else {
        try { await readHandle.close() } catch (error) { failure = (failure === '' ? '' : failure + '; ') + 'close失败: ' + (error instanceof Error ? error.message : String(error)) }
      }
    }
  }
  const ok = failure === '' && persistenceEvidenceValid({ service, statSnapshot, listSnapshots, readHandle, readResult, expectedHeader, expectedEvents })
  return { ok, detail: ok ? 'flush/stat/list/open/read/close及非空durable prefix均核对通过' : failure || '持久化快照、header或durable prefix不匹配' }
}

const plugin = await import(pathToFileURL(PLUGIN_PATH).href)
const gate = plugin.decisions
const assetRows = parsePresetYaml(readFileSync(join(ROOT, 'plugins', 'dsh-extra-plan', 'assets', 'presets', 'extra-plan', 'agent.cordis.yml'), 'utf8'))
function flatten(rows, out = []) {
  for (const row of rows) {
    if (row === null || typeof row !== 'object') continue
    out.push(row)
    if (row.group === true && Array.isArray(row.config)) flatten(row.config, out)
  }
  return out
}
const assetExtraConfig = flatten(assetRows).find((row) => row.id === 'extra-plan')?.config
const sourceHashes = { index: sourceHash(PLUGIN_PATH), gateDecisions: sourceHash(GATE_PATH), assembly: sourceHash(ASSEMBLY_PATH), author: sourceHash(AUTHOR_SOURCE_PATH), observer: sourceHash(fileURLToPath(import.meta.url)) }
console.log('BASELINE_HEAD=' + String(process.env.CONTEXT_GATE_BASELINE_HEAD || '00de0e4b05a23bb0092361805ceba481181ba371'))
console.log('HOST_INSTALL_ROOT=' + String(INSTALL_ROOT))
console.log('SOURCE_HASH=' + JSON.stringify(sourceHashes))
check('持久化helper拒绝缺失服务纯负例', persistenceMethodsAvailable(undefined) === false)
check('持久化helper拒绝假header纯负例', sessionHeaderMatches({ id: 'wrong', version: 1, cwd: 'wrong' }, { id: 'expected', version: 1, cwd: 'expected' }) === false)
check('持久化helper拒绝空durable前缀纯负例', durablePrefixMatches([{ seq: 0, type: 'tool/call', data: {} }], []) === false)
console.log('BATCH_DIR=' + BATCH_DIR)
console.log('PUBLICATION_INDEX_PATH=' + PUBLICATION_INDEX_PATH)
const purePublication = { seq: 10, id: 'publication-pure-a', kind: 'agent-instructions', surfaceOp: 'append', source: { kind: 'agent-instructions', revision: 'pure' }, content: [{ type: 'text', text: 'same publication body' }] }
const replayState = createPublicationState()
const firstReplay = observePublicationRecords([purePublication], replayState)
const secondReplay = observePublicationRecords([purePublication], replayState)
check('publication helper允许同ID跨请求历史重放', firstReplay.newIds.length === 1 && firstReplay.newDurable.length === 1 && secondReplay.newIds.length === 0 && secondReplay.newDurable.length === 0 && secondReplay.replayed.length === 1 && secondReplay.anomalies.length === 0)
const sameSignatureState = createPublicationState()
observePublicationRecords([purePublication], sameSignatureState)
const sameSignature = observePublicationRecords([{ ...purePublication, seq: 11, id: 'publication-pure-b' }], sameSignatureState)
check('publication helper拒绝新增ID同签名重复', sameSignature.anomalies.includes('duplicate-signature') && sameSignature.diagnostics.historical.includes('duplicate-signature'))
const sameRequestId = observePublicationRecords([{ ...purePublication, seq: 20, id: 'same-request-id' }, { ...purePublication, seq: 21, id: 'same-request-id', content: [{ type: 'text', text: 'different body' }] }], createPublicationState())
check('publication helper拒绝同请求重复ID', sameRequestId.anomalies.includes('duplicate-id') && sameRequestId.diagnostics.batch.includes('duplicate-id'))
const sameRequestSeq = observePublicationRecords([{ ...purePublication, seq: 22, id: 'same-request-seq-a' }, { ...purePublication, seq: 22, id: 'same-request-seq-b', content: [{ type: 'text', text: 'different seq body' }] }], createPublicationState())
check('publication helper拒绝同请求重复seq', sameRequestSeq.anomalies.includes('duplicate-seq') && sameRequestSeq.diagnostics.batch.includes('duplicate-seq'))
const sameSeqRewriteState = createPublicationState()
observePublicationRecords([purePublication], sameSeqRewriteState)
const sameSeqRewrite = observePublicationRecords([{ ...purePublication, content: [{ type: 'text', text: 'rewritten same seq' }] }], sameSeqRewriteState)
check('publication helper拒绝同seq改写', sameSeqRewrite.anomalies.includes('same-seq-rewritten') && sameSeqRewrite.diagnostics.historical.includes('same-seq-rewritten'))
const republishState = createPublicationState()
observePublicationRecords([purePublication], republishState)
const republish = observePublicationRecords([{ ...purePublication, seq: 12 }], republishState)
check('publication helper拒绝同ID新seq重新发布', republish.anomalies.includes('same-id-new-seq') && republish.diagnostics.historical.includes('same-id-new-seq'))
const missingPublication = observePublicationRecords([{ ...purePublication, id: null }, { ...purePublication, seq: null }], createPublicationState())
check('publication helper缺失ID或seq只归INCOMPLETE', missingPublication.status === 'INCOMPLETE' && missingPublication.missing.includes('missing-id-or-seq') && missingPublication.newDurable.length === 0)
const missingSnapshot = observePublicationRecords(null, createPublicationState())
check('publication helper缺失snapshot只归INCOMPLETE', missingSnapshot.status === 'INCOMPLETE' && missingSnapshot.missing.includes('missing-publication-snapshot') && missingSnapshot.newDurable.length === 0)
const rawModelMessage = (id, text = 'same raw body', revision = 'pure') => ({ id, role: 'system', source: { kind: 'agent-instructions', revision }, content: [{ type: 'text', text }] })
const rawReplayState = createModelState()
const rawFirstReplay = observeRawContextMessages(rawContextMessageMetadata([rawModelMessage('raw-pure-a')]), rawReplayState)
const rawSecondReplay = observeRawContextMessages(rawContextMessageMetadata([rawModelMessage('raw-pure-a')]), rawReplayState)
check('model helper允许同ID历史重放', rawFirstReplay.newIds.length === 1 && rawSecondReplay.newIds.length === 0 && rawSecondReplay.replayed.length === 1 && rawSecondReplay.anomalies.length === 0)
const rawSignatureState = createModelState()
observeRawContextMessages(rawContextMessageMetadata([rawModelMessage('raw-pure-a')]), rawSignatureState)
const rawSignature = observeRawContextMessages(rawContextMessageMetadata([rawModelMessage('raw-pure-b')]), rawSignatureState)
check('model helper拒绝同签名新ID', rawSignature.status === 'FAIL' && rawSignature.anomalies.includes('same-content-new-id'))
const rawDuplicate = observeRawContextMessages(rawContextMessageMetadata([rawModelMessage('raw-duplicate'), rawModelMessage('raw-duplicate', 'changed')]), createModelState())
check('model helper拒绝同请求重复raw ID', rawDuplicate.status === 'FAIL' && rawDuplicate.anomalies.includes('duplicate-id'))
const rawChangedState = createModelState()
observeRawContextMessages(rawContextMessageMetadata([rawModelMessage('raw-change')]), rawChangedState)
const rawChanged = observeRawContextMessages(rawContextMessageMetadata([rawModelMessage('raw-change', 'changed', 'changed')]), rawChangedState)
check('model helper拒绝历史ID改content/source', rawChanged.status === 'FAIL' && rawChanged.anomalies.includes('historical-id-changed'))
const rawMissing = observeRawContextMessages(rawContextMessageMetadata([{ id: null, source: { kind: 'agent-instructions' }, content: [{ type: 'text', text: 'missing id' }] }]), createModelState())
check('model helper缺失raw ID只归INCOMPLETE', rawMissing.status === 'INCOMPLETE' && rawMissing.missing.includes('missing-id') && rawMissing.newIds.length === 0)
const crossRecord = { id: 'cross-a', kind: 'agent-instructions', source: { kind: 'agent-instructions', revision: 'cross' }, content: [{ type: 'text', text: 'cross body' }] }
const modelOnly = compareModelAndDurable([crossRecord], [])
const durableOnly = compareModelAndDurable([], [{ ...crossRecord, seq: 99 }])
const crossMismatch = compareModelAndDurable([crossRecord], [{ ...crossRecord, seq: 100, source: { kind: 'agent-instructions', revision: 'changed' } }])
check('双来源helper拒绝模型有而发布无', modelOnly.status === 'FAIL' && modelOnly.missingDurableIds.includes('cross-a'))
check('双来源helper拒绝发布有而模型无', durableOnly.status === 'FAIL' && durableOnly.missingModelIds.includes('cross-a'))
check('双来源helper拒绝同ID指纹错配', crossMismatch.status === 'FAIL' && crossMismatch.mismatched.includes('cross-a'))
const finalFixtureRecords = [
  { id: 'final-agent-instructions', kind: 'agent-instructions', source: { kind: 'agent-instructions', revision: 'fixture-agent' }, content: [{ type: 'text', text: 'fixture agent body' }] },
  { id: 'final-skill-catalog', kind: 'skill-catalog', source: { kind: 'skill-catalog', revision: 'fixture-skill' }, content: [{ type: 'text', text: 'fixture skill body' }] }
]
const finalFixtureDurable = finalFixtureRecords.map((record, index) => ({ ...safeCopy(record), seq: 401 + index, surfaceOp: 'append' }))
const makeFinalFixtureIndex = (hasHistory, hasNew) => ({
  model: { raw: hasHistory ? safeCopy(finalFixtureRecords) : [], newIds: hasNew ? safeCopy(finalFixtureRecords) : [] },
  durable: { all: hasHistory ? safeCopy(finalFixtureDurable) : [], newDurable: hasNew ? safeCopy(finalFixtureDurable) : [] }
})
const finalFixtureRequestIndexes = [
  makeFinalFixtureIndex(false, false),
  makeFinalFixtureIndex(false, false),
  makeFinalFixtureIndex(false, false),
  makeFinalFixtureIndex(true, true),
  makeFinalFixtureIndex(true, false),
  makeFinalFixtureIndex(true, false)
]
const finalFixturePass = compareFinalContextEvidence(finalFixtureRequestIndexes, finalFixtureRecords, finalFixtureRecords, finalFixtureDurable)
check('最终一致性纯例合法夹具PASS', finalFixturePass.status === 'PASS' && finalFixturePass.ok === true && finalFixturePass.missing.length === 0 && finalFixturePass.anomalies.length === 0)
const finalDurableMissing = compareFinalContextEvidence(finalFixtureRequestIndexes, finalFixtureRecords, finalFixtureRecords, finalFixtureDurable.slice(0, 1))
check('最终一致性反例-最终durable缺一行FAIL', finalDurableMissing.status === 'FAIL' && finalDurableMissing.ok === false)
const finalDurableExtra = compareFinalContextEvidence(finalFixtureRequestIndexes, finalFixtureRecords, finalFixtureRecords, [...finalFixtureDurable, { seq: 403, id: 'final-extra-publication', kind: 'agent-instructions', source: { kind: 'agent-instructions', revision: 'fixture-extra' }, content: [{ type: 'text', text: 'extra body' }] }])
check('最终一致性反例-最终durable多一行FAIL', finalDurableExtra.status === 'FAIL' && finalDurableExtra.ok === false)
const finalDurableDuplicateId = compareFinalContextEvidence(finalFixtureRequestIndexes, finalFixtureRecords, finalFixtureRecords, [finalFixtureDurable[0], { ...finalFixtureDurable[1], id: finalFixtureDurable[0].id }])
check('最终一致性反例-最终durable重复IDFAIL', finalDurableDuplicateId.status === 'FAIL' && finalDurableDuplicateId.ok === false)
const finalDurableDuplicateSeq = compareFinalContextEvidence(finalFixtureRequestIndexes, finalFixtureRecords, finalFixtureRecords, [finalFixtureDurable[0], { ...finalFixtureDurable[1], seq: finalFixtureDurable[0].seq }])
check('最终一致性反例-最终durable重复seqFAIL', finalDurableDuplicateSeq.status === 'FAIL' && finalDurableDuplicateSeq.ok === false)
const finalDurableIdNewSeq = compareFinalContextEvidence(finalFixtureRequestIndexes, finalFixtureRecords, finalFixtureRecords, [{ ...finalFixtureDurable[0], seq: 499 }, finalFixtureDurable[1]])
check('最终一致性反例-原ID换seqFAIL', finalDurableIdNewSeq.status === 'FAIL' && finalDurableIdNewSeq.ok === false)
const finalDurableContentRewrite = compareFinalContextEvidence(finalFixtureRequestIndexes, finalFixtureRecords, finalFixtureRecords, [{ ...finalFixtureDurable[0], content: [{ type: 'text', text: 'rewritten durable content' }] }, finalFixtureDurable[1]])
check('最终一致性反例-最终durable content改写FAIL', finalDurableContentRewrite.status === 'FAIL' && finalDurableContentRewrite.ok === false)
const finalDurableSourceRewrite = compareFinalContextEvidence(finalFixtureRequestIndexes, finalFixtureRecords, finalFixtureRecords, [{ ...finalFixtureDurable[0], source: { kind: 'agent-instructions', revision: 'rewritten-source' } }, finalFixtureDurable[1]])
check('最终一致性反例-最终durable source改写FAIL', finalDurableSourceRewrite.status === 'FAIL' && finalDurableSourceRewrite.ok === false)
const finalSurfaceMissingId = compareFinalContextEvidence(finalFixtureRequestIndexes, finalFixtureRecords, finalFixtureRecords.slice(0, 1), finalFixtureDurable)
check('最终一致性反例-最终surface缺IDFAIL', finalSurfaceMissingId.status === 'FAIL' && finalSurfaceMissingId.ok === false)
const lastModelFingerprintRewrite = compareFinalContextEvidence(finalFixtureRequestIndexes, [{ ...finalFixtureRecords[0], content: [{ type: 'text', text: 'rewritten model content' }] }, finalFixtureRecords[1]], finalFixtureRecords, finalFixtureDurable)
check('最终一致性反例-最后模型指纹改写FAIL', lastModelFingerprintRewrite.status === 'FAIL' && lastModelFingerprintRewrite.ok === false)
const nullRequestIndexes = compareFinalContextEvidence(null, finalFixtureRecords, finalFixtureRecords, finalFixtureDurable)
const nullLastModelRaw = compareFinalContextEvidence(finalFixtureRequestIndexes, null, finalFixtureRecords, finalFixtureDurable)
const nullFinalSurface = compareFinalContextEvidence(finalFixtureRequestIndexes, finalFixtureRecords, null, finalFixtureDurable)
const nullFinalDurable = compareFinalContextEvidence(finalFixtureRequestIndexes, finalFixtureRecords, finalFixtureRecords, null)
check('最终一致性缺request索引只归INCOMPLETE', nullRequestIndexes.status === 'INCOMPLETE' && nullRequestIndexes.ok === false && nullRequestIndexes.missing.length > 0)
check('最终一致性缺最后model.raw只归INCOMPLETE', nullLastModelRaw.status === 'INCOMPLETE' && nullLastModelRaw.ok === false && nullLastModelRaw.missing.length > 0)
check('最终一致性缺最终surface只归INCOMPLETE', nullFinalSurface.status === 'INCOMPLETE' && nullFinalSurface.ok === false && nullFinalSurface.missing.length > 0)
check('最终一致性缺最终durable只归INCOMPLETE', nullFinalDurable.status === 'INCOMPLETE' && nullFinalDurable.ok === false && nullFinalDurable.missing.length > 0)
check('请求序列helper拒绝额外第七请求', requestCountStatus([0, 1, 2, 3, 4, 5, 6]) === 'FAIL')
check('publication helper不把agent/inbox/spliced当user/message发布', userMessagePublicationRecords([{ seq: 13, type: 'agent/inbox/spliced', data: { target: 'next-turn', inserted: [{ id: 'inbox-only', source: { kind: 'agent-instructions' } }] } }]).length === 0)

// 第一层：纯决策函数与真实生产绑定。
check('数组tool/call与字符串tool/call均结束F', gate.isBootstrapPhase({ session: { snapshotEvents: () => [{ type: ['assistant', 'tool/call'] }] } }) === false && gate.isBootstrapPhase({ session: { snapshotEvents: () => [{ type: 'tool/call' }] } }) === false)

class ControlledAdapter extends LlmAdapter {
  constructor() { super(); this.calls = 0 }
  providerInfo(provider) { return { id: provider, name: 'context-gate controlled adapter' } }
  providerRetryPolicy() { return undefined }
  listModels(provider) { return Promise.resolve([{ provider, id: 'context-gate-model', name: 'context-gate-model', inputModalities: ['text'] }]) }
  resolveModel(provider, model) { return Promise.resolve({ provider, id: model, name: model, inputModalities: ['text'], context: { contextWindow: 32768 }, defaultMaxTokens: 128, systemPromptUpdate: 'in-history', toolUpdate: 'in-history' }) }
  async prepareCall(provider, model) {
    const info = await this.resolveModel(provider, model)
    return { model: info, stream: (options) => this.stream(options) }
  }
  async *stream(options) {
    this.calls += 1
    if (this.calls === 3) {
      yield { type: 'block-end', index: 0, block: { type: 'tool-call', id: 'context-gate-read-1', name: 'read', arguments: JSON.stringify({ file_path: join(WORKSPACE, 'AGENTS.md') }) } }
      yield { type: 'finish', reason: { kind: 'tool-calls' } }
      return
    }
    yield { type: 'block-end', index: 0, block: { type: 'text', text: 'controlled response ' + String(this.calls) } }
    yield { type: 'finish', reason: { kind: 'stop' } }
  }
}

let root
let controlled
let registration
let handle
let trace = []
let durableMessages = []
let durableEvents = []
const publicationState = createPublicationState()
try {
  root = new Context()
  await root.plugin(Loader, { baseUrl: import.meta.url })
  const rows = [
    { id: 'llm', name: '@deepseek-ai/dsh-llm' },
    { id: 'session', name: '@deepseek-ai/dsh-session' },
    { id: 'session-persistence-jsonl', name: '@deepseek-ai/dsh-session-persistence-jsonl', config: { root: SESSION_ROOT, compression: 'zstd' } },
    // 投影前提：dsh-agent-instructions / 两类 source 的输出依赖 workingDirectory 服务（真实宿主
    // 由 dsh-working-directory 提供）。缺该行时 tool-fs/agent-instructions 的 source 恒 0，夹具会假红。
    { id: 'working-directory', name: '@deepseek-ai/dsh-working-directory', config: { defaultDirectory: WORKSPACE } },
    { id: 'session-projection', name: '@deepseek-ai/dsh-session-projection' },
    { id: 'agent', name: '@deepseek-ai/dsh-agent' },
    { id: 'system-prompt', name: '@deepseek-ai/dsh-system-prompt', config: { personaPrefix: '' } },
    { id: 'extra-plan', name: pathToFileURL(PLUGIN_PATH).href, config: { ...assetExtraConfig, anchoredBootstrap: true, creativeMode: false, usageLedger: { enabled: false, path: '' }, diagFile: join(BATCH_DIR, 'extra-plan-errors.jsonl') } },
    { id: 'tools', name: '@deepseek-ai/dsh-tools' },
    { id: 'tool-executor-native', name: '@deepseek-ai/dsh-tool-executor-native' },
    { id: 'sandbox-policy', name: '@deepseek-ai/dsh-sandbox-policy', config: { mode: 'workspace-write', workspaceRoot: WORKSPACE } },
    { id: 'fs-sandbox', name: '@deepseek-ai/dsh-fs-sandbox', config: { cwd: WORKSPACE } },
    { id: 'fs-observation-policy', name: '@deepseek-ai/dsh-fs-observation-policy' },
    { id: 'tool-fs', name: '@deepseek-ai/dsh-tool-fs' },
    { id: 'skill', name: '@deepseek-ai/dsh-skill' },
    { id: 'skill-filesystem', name: '@deepseek-ai/dsh-skill-filesystem', config: { includeDefaultRoots: false, dshHome: HOME_DIR, agentsHome: join(BATCH_DIR, 'agents-home'), customSkillDirs: [SKILLS_ROOT], watch: false } },
    { id: 'tool-skill', name: '@deepseek-ai/dsh-tool-skill' },
    { id: 'agent-instructions', name: '@deepseek-ai/dsh-agent-instructions', config: { maxBytes: 65536 } },
    { id: 'agent-loop', name: '@deepseek-ai/dsh-agent-loop', config: { agents: [] } },
  ]
  for (const row of rows) await root.loader.create(row)
  await root.loader.await()
  // 展示工具夹具 provider：真实 dsh-tool-cordis 不在本夹具行内，注册同名全局工具，
  // 使 C=0 的 agent 作用域 restrict({ deny }) 与 C=1 的保留两面都能在 request.tools 上取到非空证据。
  // 必须经根 ctx 注册：插件 fork ctx 的注册是 scope-local，既不可收窄也不进 agent 视野。
  const CORDIS_FIXTURE_TOOL_NAMES = ['cordis_inspect_list', 'cordis_inspect_query']
  for (const name of CORDIS_FIXTURE_TOOL_NAMES) {
    root.tools.register({
      name,
      description: 'Cordis presentation fixture tool ' + name + '.',
      parameters: { type: 'object', properties: {}, additionalProperties: false },
      output: { schema: { type: 'object', additionalProperties: true }, render: () => [] },
    })
  }
  check('原装宿主核心插件加载完成（Session/agent-instructions/tool-skill）', root.agents !== undefined && root.llm !== undefined && root.skills !== undefined)
  controlled = new ControlledAdapter()
  registration = root.llm.registerAdapter(['context-gate-controlled'], controlled)
  root.on('llm/stream', (options, next) => {
    const agent = handle?.agent
    const session = agent?.session
    const sessionHeader = safeCopy(session?.header ?? null)
    const sessionId = typeof sessionHeader?.id === 'string' && sessionHeader.id !== '' ? sessionHeader.id : null
    const dispatchSeq = Number.isInteger(session?.seq) && session.seq >= 0 ? session.seq : null
    const snapshotEvents = typeof session?.snapshotEvents === 'function' ? session.snapshotEvents() : null
    const events = Array.isArray(snapshotEvents) ? snapshotEvents : null
    const eventRows = Array.isArray(events) ? events : []
    const activeHeader = eventRows.filter((event) => event !== null && typeof event === 'object' && event.type === 'request/header').at(-1)
    const precedingToolCalls = eventRows.filter((event) => event !== null && typeof event === 'object' && (event.type === 'tool/call' || Array.isArray(event.type) && event.type.includes('tool/call'))).length
    const modelState = publicationState.modelState || (publicationState.modelState = createModelState())
    const rawMessages = options !== null && typeof options === 'object' ? options.messages : null
    const rawMetadata = Array.isArray(rawMessages) ? rawContextMessageMetadata(rawMessages) : null
    const modelObservation = observeRawContextMessages(rawMetadata, modelState)
    const publicationRecords = Array.isArray(events) ? userMessagePublicationRecords(events) : null
    const publicationObservation = observePublicationRecords(publicationRecords, publicationState)
    const previousRequest = trace.at(-1)
    const observationGap = previousRequest !== undefined && (sessionId === null || previousRequest.sessionId !== sessionId || dispatchSeq === null || previousRequest.dispatchSeq === null || dispatchSeq <= previousRequest.dispatchSeq)
    if (sessionId === null || sessionHeader?.version === undefined || sessionHeader?.cwd === undefined) {
      markObservationIncomplete(modelObservation, 'missing-session-metadata')
      markObservationIncomplete(publicationObservation, 'missing-session-metadata')
    }
    if (activeHeader === undefined) {
      markObservationIncomplete(modelObservation, 'missing-request-header')
      markObservationIncomplete(publicationObservation, 'missing-request-header')
    }
    if (observationGap) {
      markObservationIncomplete(modelObservation, 'observation-gap')
      markObservationIncomplete(publicationObservation, 'observation-gap')
    }
    let crossCheck = compareModelAndDurable(modelObservation.newIds, publicationObservation.newDurable)
    if (modelObservation.status === 'INCOMPLETE' || publicationObservation.status === 'INCOMPLETE') {
      crossCheck = { ...crossCheck, ok: false, status: 'INCOMPLETE', missing: [...new Set([...(crossCheck.missing || []), 'observation-incomplete'])] }
    }
    const indexStatus = [modelObservation.status, publicationObservation.status, crossCheck.status].includes('FAIL')
      ? 'FAIL'
      : [modelObservation.status, publicationObservation.status, crossCheck.status].includes('INCOMPLETE') ? 'INCOMPLETE' : 'PASS'
    trace.push({
      requestIndex: trace.length + 1,
      sessionId,
      parentSession: sessionHeader?.parentSession || null,
      session: sessionHeader,
      dispatchSeq,
      activeHeaderSeq: activeHeader?.seq ?? null,
      precedingToolCalls,
      phase: agent === undefined ? 'unknown' : gate.isBootstrapPhase(agent) ? 'F' : 'L',
      role: 'main',
      anchoredBootstrap: true,
      creativeMode: false,
      adapter: 'controlled',
      sourceHash: { ...sourceHashes },
      messages: safeCopy(options?.messages),
      tools: safeCopy(options?.tools),
      config: safeCopy(options?.config),
      publicationIndex: {
        format: 2,
        status: indexStatus,
        session: { id: sessionId, header: sessionHeader, dispatchSeq, activeHeaderSeq: activeHeader?.seq ?? null },
        model: {
          raw: modelObservation.all.map(safeCopy),
          replayed: modelObservation.replayed.map(safeCopy),
          newIds: modelObservation.newIds.map(safeCopy),
          newIdCounts: modelObservation.complete ? publicationKindCounts(modelObservation.newIds) : null,
          newIdTotal: modelObservation.complete ? modelObservation.newIds.length : null,
          missing: modelObservation.missing,
          anomalies: modelObservation.anomalies,
          diagnostics: modelObservation.diagnostics,
          status: modelObservation.status
        },
        durable: {
          all: publicationObservation.candidates.map(publicationMetadata),
          replayed: publicationObservation.replayed.map(publicationMetadata),
          newDurable: publicationObservation.newDurable.map(publicationMetadata),
          newDurableCounts: publicationObservation.complete ? publicationKindCounts(publicationObservation.newDurable) : null,
          newDurableTotal: publicationObservation.complete ? publicationObservation.newDurable.length : null,
          missing: publicationObservation.missing,
          anomalies: publicationObservation.anomalies,
          diagnostics: publicationObservation.diagnostics,
          status: publicationObservation.status
        },
        crossCheck
      }
    })
    return next()
  })
  const sessionId = 'context-gate-host-' + String(Date.now())
  handle = await root.agents.create({ sessionId, meta: { cwd: WORKSPACE }, agentOptions: { provider: 'context-gate-controlled', model: 'context-gate-model' } })
  const prompt = (text) => ({ id: 'context-gate-user-' + String(trace.length), role: 'user', content: [{ type: 'text', text }], source: { kind: 'user' } })
  handle.agent.followup(prompt(CONTEXT_GATE_PROMPTS.first))
  await handle.agent.whenIdle()
  check('真AgentLoop首个F请求不含两类来源', trace.length >= 1 && countKinds(trace[0].messages, ['agent-instructions', 'skill-catalog']) === 0)
  handle.agent.followup(prompt(CONTEXT_GATE_PROMPTS.second))
  await handle.agent.whenIdle()
  check('真AgentLoop第二个F请求仍不含两类来源', trace.length >= 2 && countKinds(trace[1].messages, ['agent-instructions', 'skill-catalog']) === 0)
  handle.agent.followup(prompt(CONTEXT_GATE_PROMPTS.toolBoundary))
  await handle.agent.whenIdle()
  const events = handle.agent.session.snapshotEvents()
  const toolCalls = events.filter((event) => event !== null && typeof event === 'object' && (event.type === 'tool/call' || Array.isArray(event.type) && event.type.includes('tool/call')))
  check('首个durable tool/call由受控adapter真实进入Session', toolCalls.length >= 1)
  durableMessages = handle.agent.session.deriveMessages()
  durableEvents = safeCopy(events)
  check('首个tool/call后L请求恢复agent-instructions与skill-catalog', trace.length >= 4 && countKinds(trace[trace.length - 1].messages, ['agent-instructions', 'skill-catalog']) >= 1)
  const visibleAfterFirstL = handle.agent.session.deriveMessages()
  const visibleCatalogs = Array.isArray(visibleAfterFirstL) ? visibleAfterFirstL.filter((message) => sourceKind(message) === 'skill-catalog') : []
  check('真宿主deriveMessages暴露当前可见skill-catalog签名基准', visibleCatalogs.length >= 1 && visibleCatalogs.at(-1)?.source?.entries?.some((entry) => entry.name === 'ordinary-skill'))
  const directDedupeTarget = (Array.isArray(visibleAfterFirstL) ? visibleAfterFirstL : []).filter((message) => CONTEXT_PUBLICATION_KINDS.includes(sourceKind(message))).map((message) => ({ role: message?.role, content: safeCopy(message?.content), source: safeCopy(message?.source) }))
  const directDedupe = gate.dedupeProjectedContextDecision({ kind: 'enter', messages: directDedupeTarget }, visibleAfterFirstL)
  check('真实宿主目录消息可由同一纯函数按当前surface去重', countKinds(directDedupe.messages, ['skill-catalog']) === 0)
  handle.agent.followup(prompt(CONTEXT_GATE_PROMPTS.stableL1))
  await handle.agent.whenIdle()
  handle.agent.followup(prompt(CONTEXT_GATE_PROMPTS.stableL2))
  await handle.agent.whenIdle()
  const projectedAgentCounts = trace.map((request) => countKinds(request.messages, ['agent-instructions']))
  const projectedCatalogCounts = trace.map((request) => countKinds(request.messages, ['skill-catalog']))
  const projectedCounts = trace.map((request) => countKinds(request.messages, ['agent-instructions', 'skill-catalog']))
  console.log('TRACE_STABLE_AGENT_INSTRUCTIONS=' + JSON.stringify(projectedAgentCounts))
  console.log('TRACE_STABLE_SKILL_CATALOG=' + JSON.stringify(projectedCatalogCounts))
  console.log('TRACE_STABLE_SOURCE_COUNTS=' + JSON.stringify(projectedCounts))
  const expectedRawAgentCounts = [0, 0, 0, 1, 1, 1]
  const expectedRawCatalogCounts = [0, 0, 0, 1, 1, 1]
  const expectedRawCounts = [0, 0, 0, 2, 2, 2]
  check('稳定受控流程恰好六请求', requestCountStatus(trace) === 'PASS')
  check('raw agent-instructions保留第4/5/6请求历史', JSON.stringify(projectedAgentCounts) === JSON.stringify(expectedRawAgentCounts))
  check('raw skill-catalog保留第4/5/6请求历史', JSON.stringify(projectedCatalogCounts) === JSON.stringify(expectedRawCatalogCounts))
  check('raw两类source合计保留第4/5/6请求历史', JSON.stringify(projectedCounts) === JSON.stringify(expectedRawCounts))
  check('观察器SHA精确绑定当前运行脚本', sourceHashes.observer === sourceHash(fileURLToPath(import.meta.url)))
  const newIdSeries = CONTEXT_PUBLICATION_KINDS.map((_, kindIndex) => trace.map((request) => request.publicationIndex?.model?.newIdCounts?.[kindIndex]))
  const newDurableSeries = CONTEXT_PUBLICATION_KINDS.map((_, kindIndex) => trace.map((request) => request.publicationIndex?.durable?.newDurableCounts?.[kindIndex]))
  const newIdTotals = trace.map((request) => countTotal(request.publicationIndex?.model?.newIdCounts))
  const newDurableTotals = trace.map((request) => countTotal(request.publicationIndex?.durable?.newDurableCounts))
  console.log('PUBLICATION_NEW_ID_COUNTS=' + JSON.stringify(newIdSeries))
  console.log('PUBLICATION_NEW_DURABLE_COUNTS=' + JSON.stringify(newDurableSeries))
  console.log('PUBLICATION_TOTAL_NEW_ID_COUNTS=' + JSON.stringify(newIdTotals))
  console.log('PUBLICATION_TOTAL_NEW_DURABLE_COUNTS=' + JSON.stringify(newDurableTotals))
  const expectedNewPublicationSeries = [0, 0, 0, 1, 0, 0]
  const expectedNewPublicationTotals = [0, 0, 0, 2, 0, 0]
  check('新增agent-instructions ID计数精确为 [0,0,0,1,0,0]', requestCountStatus(trace) === 'PASS' && JSON.stringify(newIdSeries[0]) === JSON.stringify(expectedNewPublicationSeries))
  check('新增skill-catalog ID计数精确为 [0,0,0,1,0,0]', requestCountStatus(trace) === 'PASS' && JSON.stringify(newIdSeries[1]) === JSON.stringify(expectedNewPublicationSeries))
  check('新增agent-instructions durable发布计数精确为 [0,0,0,1,0,0]', requestCountStatus(trace) === 'PASS' && JSON.stringify(newDurableSeries[0]) === JSON.stringify(expectedNewPublicationSeries))
  check('新增skill-catalog durable发布计数精确为 [0,0,0,1,0,0]', requestCountStatus(trace) === 'PASS' && JSON.stringify(newDurableSeries[1]) === JSON.stringify(expectedNewPublicationSeries))
  check('新增ID合计精确为 [0,0,0,2,0,0]', requestCountStatus(trace) === 'PASS' && JSON.stringify(newIdTotals) === JSON.stringify(expectedNewPublicationTotals))
  check('新增durable发布合计精确为 [0,0,0,2,0,0]', requestCountStatus(trace) === 'PASS' && JSON.stringify(newDurableTotals) === JSON.stringify(expectedNewPublicationTotals))
  const publicationRowsUnique = (rows) => Array.isArray(rows) && rows.every(isPublicationRecordValid) && new Set(rows.map((record) => record.id)).size === rows.length && new Set(rows.map((record) => record.seq)).size === rows.length
  check('六请求publication索引及新增元数据ID/seq均唯一', requestCountStatus(trace) === 'PASS' && trace.every((request) => request.publicationIndex?.status === 'PASS' && publicationRowsUnique(request.publicationIndex?.durable?.all) && publicationRowsUnique(request.publicationIndex?.durable?.newDurable)))
  check('模型新增与durable发布双向按ID/指纹对应', requestCountStatus(trace) === 'PASS' && trace.every((request) => request.publicationIndex?.crossCheck?.ok === true))
  check('新增发布记录seq/id/kind无缺失或重复异常', trace.every((request) => (request.publicationIndex?.model?.anomalies || []).length === 0 && (request.publicationIndex?.durable?.anomalies || []).length === 0))
  check('F阶段durable user/message不含两类source', countKinds(durableMessages.slice(0, Math.min(4, durableMessages.length)), ['agent-instructions', 'skill-catalog']) === 0)
  const currentKinds = messageKinds(durableMessages)
  check('L阶段durable surface含agent-instructions或skill-catalog', currentKinds.includes('agent-instructions') && currentKinds.includes('skill-catalog'))
  const catalogMessage = durableMessages.find((message) => sourceKind(message) === 'skill-catalog')
  const entries = catalogMessage?.source?.entries || []
  const entryNames = new Set(entries.filter((entry) => entry !== null && typeof entry === 'object' && typeof entry.name === 'string').map((entry) => entry.name))
  // DSH_COMPAT_RC1：旧三名隐藏但仍注册；DSH_CURRENT_RC2：dsh-doc隐藏但仍注册；两项ordinary必须保留。
  const c0HiddenCreativeNames = ['cordis-plugin-development', 'editing-cordis-compositions', 'cordis-composition-reference', 'dsh-doc']
  const c0OrdinaryNames = ['agent-experience', 'ordinary-skill']
  check('C=0真实目录投影保留两项ordinary且隐藏四名creative', c0OrdinaryNames.every((name) => entryNames.has(name)) && c0HiddenCreativeNames.every((name) => !entryNames.has(name)))
  // request.tools 集合断言（C=0）：L 请求工具面不含两个 cordis 展示工具，且两名仍在 restrict 前可收窄名内
  // （证明缺席来自 agent 作用域 restrict({ deny })，不是工具未注册的空通过；投影副本不作判据）。
  const requestToolNamesOf = (request) => Array.isArray(request?.tools) ? request.tools.map((tool) => tool?.name).filter((name) => typeof name === 'string') : []
  const c0TraceLength = trace.length
  const c0LastToolNames = requestToolNamesOf(trace[c0TraceLength - 1])
  const c0Restrictable = root.tools.view(handle.agent).restrictableNames
  check('C=0真实request.tools不含两个cordis展示工具且两名仍可收窄（restrict deny 生效）',
    c0LastToolNames.length > 0
      && CORDIS_FIXTURE_TOOL_NAMES.every((name) => !c0LastToolNames.includes(name))
      && CORDIS_FIXTURE_TOOL_NAMES.every((name) => c0Restrictable.has(name)))
  // request.tools 集合断言（C=1）：同夹具把 settings 行热读为 creativeMode=true 后不再 arm deny，
  // 两名展示工具须重新出现在 L 请求工具面（与 C=0 互为反证）；本段请求不进入最终证据序列。
  {
    const c1SettingsPath = join(WORKSPACE, 'cordis.patch.yml')
    writeFileSync(c1SettingsPath, ['- id: dsh-extra-plan-settings', '  name: dsh-extra-plan/settings', '  config:', '    creativeMode: true', ''].join('\n'), 'utf8')
    process.env.DSH_EXTRA_PLAN_CONFIG_PATH = c1SettingsPath
    const c1Adapter = new ControlledAdapter()
    const c1Registration = root.llm.registerAdapter(['context-gate-c1'], c1Adapter)
    try {
      const c1Handle = await root.agents.create({ sessionId: 'context-gate-c1-' + String(Date.now()), meta: { cwd: WORKSPACE }, agentOptions: { provider: 'context-gate-c1', model: 'context-gate-model' } })
      const c1Prompt = (index) => ({ id: 'context-gate-c1-user-' + String(index), role: 'user', content: [{ type: 'text', text: 'C=1 fixture prompt ' + String(index) }], source: { kind: 'user' } })
      for (let index = 0; index < 3; index += 1) {
        c1Handle.agent.followup(c1Prompt(index))
        await c1Handle.agent.whenIdle()
      }
      const c1ToolNames = trace.slice(c0TraceLength).map(requestToolNamesOf)
      const c1LastNames = c1ToolNames.length > 0 ? c1ToolNames[c1ToolNames.length - 1] : []
      check('C=1真实request.tools保留两个cordis展示工具（不 arm restrict deny，与C=0互证）',
        c1ToolNames.length >= 2
          && c1LastNames.length > CORDIS_FIXTURE_TOOL_NAMES.length
          && CORDIS_FIXTURE_TOOL_NAMES.every((name) => c1LastNames.includes(name)))
      const c1DerivedMessages = c1Handle.agent.session.deriveMessages()
      const c1CatalogMessage = (Array.isArray(c1DerivedMessages) ? c1DerivedMessages : []).slice().reverse().find((message) => sourceKind(message) === 'skill-catalog' && Array.isArray(message?.source?.entries))
      const c1CatalogNames = new Set((c1CatalogMessage?.source?.entries || []).filter((entry) => entry !== null && typeof entry === 'object' && typeof entry.name === 'string').map((entry) => entry.name))
      const c1RetainedNames = ['cordis-plugin-development', 'editing-cordis-compositions', 'cordis-composition-reference', 'dsh-doc', 'agent-experience', 'ordinary-skill']
      check('C=1公开session.deriveMessages末个合法catalog保留四名creative及两项ordinary', c1RetainedNames.every((name) => c1CatalogNames.has(name)))
      await c1Handle.dispose()
    } finally {
      c1Registration()
      trace.length = c0TraceLength
      delete process.env.DSH_EXTRA_PLAN_CONFIG_PATH
    }
  }
  const skillSnapshot = await root.skills.snapshot({ cwd: WORKSPACE, scope: handle.agent })
  const hiddenSkillNames = ['cordis-plugin-development', 'editing-cordis-compositions', 'cordis-composition-reference', 'dsh-doc']
  const ordinarySkillNames = ['agent-experience', 'ordinary-skill']
  const snapshotNames = new Set((Array.isArray(skillSnapshot?.skills) ? skillSnapshot.skills : []).map((skill) => skill?.name).filter((name) => typeof name === 'string'))
  const hiddenSkills = await Promise.all(hiddenSkillNames.map((name) => root.skills.get(name, { cwd: WORKSPACE, scope: handle.agent })))
  const ordinarySkills = await Promise.all(ordinarySkillNames.map((name) => root.skills.get(name, { cwd: WORKSPACE, scope: handle.agent })))
  check('skill snapshot保留四名隐藏creative与两项ordinary且get不注销隐藏项', skillSnapshot.complete === true && [...hiddenSkillNames, ...ordinarySkillNames].every((name) => snapshotNames.has(name)) && hiddenSkills.every((skill, index) => skill?.name === hiddenSkillNames[index]) && ordinarySkills.every((skill, index) => skill?.name === ordinarySkillNames[index]))
  const traceKinds = trace.map((request) => countKinds(request.messages, ['agent-instructions', 'skill-catalog']))
  check('宿主request与durable source在F/L边界可对照', traceKinds.slice(0, 2).every((count) => count === 0) && traceKinds.slice(2).some((count) => count > 0))
  durableMessages = handle.agent.session.deriveMessages()
  const finalSnapshotEvents = typeof handle.agent.session.snapshotEvents === 'function' ? handle.agent.session.snapshotEvents() : null
  durableEvents = Array.isArray(finalSnapshotEvents) ? safeCopy(finalSnapshotEvents) : null
  const finalUserRecords = Array.isArray(durableEvents) ? userMessagePublicationRecords(durableEvents) : null
  const finalUserMessageIds = new Set((finalUserRecords || []).filter((record) => record.kind === 'user').map((record) => record.id))
  const incompleteRequests = trace.filter((request) => request.publicationIndex?.status === 'INCOMPLETE').map((request) => request.requestIndex)
  if (!Array.isArray(durableEvents) || incompleteRequests.length > 0) incompleteCheck('context双来源最终证据完整性', !Array.isArray(durableEvents) ? '缺少最终snapshotEvents' : '请求缺少完整模型/发布证据: ' + JSON.stringify(incompleteRequests))
  check('最终durable snapshot覆盖第5/6请求user/message', requestCountStatus(trace) === 'PASS' && Array.isArray(durableEvents) && finalUserMessageIds.has('context-gate-user-4') && finalUserMessageIds.has('context-gate-user-5'))
  const finalModelRaw = Array.isArray(trace.at(-1)?.publicationIndex?.model?.raw) ? trace.at(-1).publicationIndex.model.raw : null
  const finalSurfaceRecords = Array.isArray(durableMessages) ? rawContextMessageMetadata(durableMessages) : null
  const finalContextDurable = Array.isArray(finalUserRecords) ? finalUserRecords.filter((record) => CONTEXT_PUBLICATION_KINDS.includes(record.kind)).map(publicationMetadata) : null
  const finalConsistency = compareFinalContextEvidence(trace.map((request) => request.publicationIndex || null), finalModelRaw, finalSurfaceRecords, finalContextDurable)
  if (finalConsistency.status === 'FAIL') check('context双来源最终一致性', false, JSON.stringify(finalConsistency.differences))
  else if (finalConsistency.status === 'INCOMPLETE') incompleteCheck('context双来源最终一致性', JSON.stringify(finalConsistency.missing))
  else check('context双来源最终一致性', finalConsistency.ok === true)
  const publicationEvidence = {
    format: 2,
    sessionId: handle.agent.session.header.id,
    parentSession: handle.agent.session.header.parentSession || null,
    sourceHashes: { ...sourceHashes },
    observer: sourceHashes.observer,
    sourceKinds: [...CONTEXT_PUBLICATION_KINDS],
    requestCount: trace.length,
    requests: trace.map((request) => ({
      requestIndex: request.requestIndex,
      sessionId: request.sessionId,
      dispatchSeq: request.dispatchSeq,
      phase: request.phase,
      model: request.publicationIndex?.model || null,
      durable: request.publicationIndex?.durable || null,
      crossCheck: request.publicationIndex?.crossCheck || null
    })),
    final: {
      model: trace.at(-1)?.publicationIndex?.model || null,
      consistency: finalConsistency,
      durable: finalContextDurable,
      userMessageIds: [...finalUserMessageIds],
      durableEventCount: Array.isArray(durableEvents) ? durableEvents.length : null
    }
  }
  const persistenceEvidence = await inspectPersistence(root?.sessionPersistence, handle?.agent?.session?.header, durableEvents)
  publicationEvidence.final.persistence = persistenceEvidence
  writeFileSync(TRACE_PATH, JSON.stringify({ format: 1, sessionId: handle.agent.session.header.id, parentSession: handle.agent.session.header.parentSession || null, sourceHash: { ...sourceHashes }, adapter: 'controlled', requests: trace }, null, 2), 'utf8')
  writeFileSync(DURABLE_PATH, JSON.stringify({ sourceHash: { ...sourceHashes }, messages: safeCopy(durableMessages), events: durableEvents, persistence: persistenceEvidence }, null, 2), 'utf8')
  writeFileSync(PUBLICATION_INDEX_PATH, JSON.stringify(publicationEvidence, null, 2), 'utf8')
  check('publication-index v2明确双来源与最终持久化结果', publicationEvidence.format === 2 && publicationEvidence.observer === sourceHashes.observer && Array.isArray(publicationEvidence.requests) && publicationEvidence.requests.length === trace.length && publicationEvidence.final.persistence === persistenceEvidence)
  check('完整宿主request trace、durable与publication-index证据已写入本轮工件', existsSync(TRACE_PATH) && existsSync(DURABLE_PATH) && existsSync(PUBLICATION_INDEX_PATH) && statSync(TRACE_PATH).size > 0 && statSync(DURABLE_PATH).size > 0 && statSync(PUBLICATION_INDEX_PATH).size > 0)
  const persistenceDetail = String(persistenceEvidence.detail || '')
  if (persistenceEvidence.ok) check('真实JSONL持久化flush/stat/list/open/read/close与最终durable prefix核对', true)
  else if (/缺少|missing|not found|not installed|dependency/i.test(persistenceDetail)) incompleteCheck('真实JSONL持久化集成层', persistenceDetail)
  else check('真实JSONL持久化flush/stat/list/open/read/close与最终durable prefix核对', false, persistenceDetail)
} catch (error) {
  const detail = error instanceof Error ? error.stack || error.message : String(error)
  const dependencyMissing = error?.code === 'MODULE_NOT_FOUND' || error?.code === 'ERR_MODULE_NOT_FOUND' || /Cannot find (?:package|module)|missing dependency|not installed/i.test(detail)
  if (dependencyMissing) incompleteCheck('真实宿主/公共AgentLoop集成层', detail)
  else check('真实宿主/公共AgentLoop集成层', false, detail)
}

if (handle !== undefined) {
  try { await handle.dispose() } catch (error) { console.error('宿主handle dispose failed: ' + (error instanceof Error ? error.message : String(error))) }
}
if (registration !== undefined) {
  try { registration() } catch {}
}
if (root !== undefined) {
  try { if (root.fiber !== undefined && typeof root.fiber.dispose === 'function') await root.fiber.dispose() } catch (error) { console.error('Cordis root dispose failed: ' + (error instanceof Error ? error.message : String(error))) }
}
console.log('真实provider/生产/GUI/HUMAN: NOT-RUN')
console.log('通过 ' + pass + ', 失败 ' + fail + ', INCOMPLETE ' + incomplete)
process.exitCode = fail === 0 && incomplete === 0 ? 0 : 1
for (const [key, value] of Object.entries(previousEnv)) {
  if (value === undefined) delete process.env[key]
  else process.env[key] = value
}
