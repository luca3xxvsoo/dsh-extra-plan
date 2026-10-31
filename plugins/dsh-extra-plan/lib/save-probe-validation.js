import { isAbsolute, join, resolve } from 'node:path'
import { createPathContext, resolveWorkspacePath, resolveHostPath, validateReadTarget } from './path-policy.js'
import { PROBE_LIMITS, LINE_FORMAT_HINT, RANGE_FORMAT_HINT } from './save-contract.js'

// save_probe 校验合同：先完成结构、条目、长度、总量与 range 校验，再按已授权根做路径读校验。
function errorCodeOf(error) {
  return error !== null && typeof error === 'object' && typeof error.code === 'string' ? error.code : ''
}

function contextOf(cwd, supplied) {
  if (supplied !== undefined && supplied !== null) return supplied
  if (typeof cwd !== 'string' || cwd === '') return null
  return createPathContext({ workspaceRoot: cwd })
}

function resolveAbsoluteProbeTarget(context, value) {
  let workspaceError
  let hostError
  try {
    // 明确落在W内的绝对引用归W；即使HdataRoot是W子目录，也不把合法W引用误判为H/W冲突。
    return resolveWorkspacePath(context, value, { purpose: 'probe-reference' })
  } catch (error) {
    workspaceError = error
  }
  try {
    return resolveHostPath(context, value, { purpose: 'probe-reference' })
  } catch (error) {
    hostError = error
  }
  const capabilities = context.hostCapabilities !== null && typeof context.hostCapabilities === 'object' ? context.hostCapabilities : {}
  for (const [name, descriptor] of Object.entries(capabilities)) {
    if (descriptor === null || typeof descriptor !== 'object') continue
    const purpose = typeof descriptor.purpose === 'string' && descriptor.purpose !== '' ? descriptor.purpose : 'probe-reference'
    try {
      return resolveHostPath(context, value, { capability: name, purpose })
    } catch (error) {
      // 仅按已注册能力继续词法匹配；不以exists/stat试探其它根。
    }
  }
  throw workspaceError || hostError || new Error('探查路径不在授权W/H或已知Host capability内')
}

export function resolveProbeTarget(cwd, value, pathContext) {
  const context = contextOf(cwd, pathContext)
  if (context === null) throw new Error('探查路径缺少明确工作区根')
  if (typeof value !== 'string') throw new Error('探查路径必须是字符串')
  if (!isAbsolute(value)) return resolveWorkspacePath(context, value, { purpose: 'probe-reference' })
  return resolveAbsoluteProbeTarget(context, value)
}

function pathViolation(cwd, value, pathContext) {
  let target
  try {
    target = resolveProbeTarget(cwd, value, pathContext)
  } catch (error) {
    return '路径未授权：' + value + '（' + (error instanceof Error ? error.message : String(error)) + '）'
  }
  try {
    validateReadTarget(pathContext || contextOf(cwd, undefined), target, { expectedType: 'any', purpose: 'probe-reference' })
    return null
  } catch (error) {
    if (errorCodeOf(error) === 'TARGET_MISSING') return '路径不存在：' + value
    return '路径不可读取：' + value + '（' + (error instanceof Error ? error.message : String(error)) + '）'
  }
}

export function validateProbe(args, cwd, pathContext) {
  if (args === null || typeof args !== 'object') return 'save_probe: 参数必须是对象（四字段 fileMap/focusAreas/exclusions/background 均为数组）'
  const violations = []
  const pathRefs = []
  const fields = ['fileMap', 'focusAreas', 'exclusions', 'background']
  for (const field of fields) {
    if (!Array.isArray(args[field])) { violations.push('save_probe: ' + field + ' 必须是数组'); continue }
    const limit = PROBE_LIMITS.maxEntries[field]
    if (args[field].length > limit) violations.push('save_probe: ' + field + ' 条目数 ' + args[field].length + ' 超过上限 ' + limit)
  }
  if (Array.isArray(args.fileMap)) {
    for (let i = 0; i < args.fileMap.length; i += 1) {
      const item = args.fileMap[i]
      if (item === null || typeof item !== 'object') { violations.push('save_probe: fileMap[' + i + '] 必须是对象'); continue }
      if (typeof item.path !== 'string') violations.push('save_probe: fileMap[' + i + '].path 必须是字符串')
      else if (item.path.length > PROBE_LIMITS.maxPathLen) violations.push('save_probe: fileMap[' + i + '].path 长度 ' + item.path.length + ' 超过上限 ' + PROBE_LIMITS.maxPathLen)
      else pathRefs.push({ field: 'fileMap', index: i, value: item.path })
      if (typeof item.relation !== 'string') violations.push('save_probe: fileMap[' + i + '].relation 必须是字符串')
      else if (item.relation.length > PROBE_LIMITS.maxRelationLen) violations.push('save_probe: fileMap[' + i + '].relation 长度 ' + item.relation.length + ' 超过上限 ' + PROBE_LIMITS.maxRelationLen)
    }
  }
  if (Array.isArray(args.focusAreas)) {
    for (let i = 0; i < args.focusAreas.length; i += 1) {
      const item = args.focusAreas[i]
      if (item === null || typeof item !== 'object') { violations.push('save_probe: focusAreas[' + i + '] 必须是对象'); continue }
      if (typeof item.path !== 'string') violations.push('save_probe: focusAreas[' + i + '].path 必须是字符串')
      else if (item.path.length > PROBE_LIMITS.maxPathLen) violations.push('save_probe: focusAreas[' + i + '].path 长度 ' + item.path.length + ' 超过上限 ' + PROBE_LIMITS.maxPathLen)
      else pathRefs.push({ field: 'focusAreas', index: i, value: item.path })
      if (typeof item.note !== 'string') violations.push('save_probe: focusAreas[' + i + '].note 必须是字符串')
      else if (item.note.length > PROBE_LIMITS.maxNoteLen) violations.push('save_probe: focusAreas[' + i + '].note 长度 ' + item.note.length + ' 超过上限 ' + PROBE_LIMITS.maxNoteLen)
      if (item.range !== undefined && item.range !== null && item.range !== '') {
        if (typeof item.range !== 'string') violations.push('save_probe: focusAreas[' + i + '].range 必须是字符串')
        else if (item.range.length > PROBE_LIMITS.maxRangeLen) violations.push('save_probe: focusAreas[' + i + '].range 长度 ' + item.range.length + ' 超过上限 ' + PROBE_LIMITS.maxRangeLen)
        else if (!new RegExp(PROBE_LIMITS.rangePattern, 'i').test(item.range)) violations.push('save_probe: focusAreas[' + i + '].range 非法：' + item.range + '（' + RANGE_FORMAT_HINT + '；正确格式如 12 或 L12-34）')
      }
    }
  }
  if (Array.isArray(args.exclusions)) {
    for (let i = 0; i < args.exclusions.length; i += 1) {
      const item = args.exclusions[i]
      if (item === null || typeof item !== 'object') { violations.push('save_probe: exclusions[' + i + '] 必须是对象'); continue }
      if (typeof item.note !== 'string') violations.push('save_probe: exclusions[' + i + '].note 必须是字符串')
      else if (item.note.length > PROBE_LIMITS.maxNoteLen) violations.push('save_probe: exclusions[' + i + '].note 长度 ' + item.note.length + ' 超过上限 ' + PROBE_LIMITS.maxNoteLen)
    }
  }
  if (Array.isArray(args.background)) {
    for (let i = 0; i < args.background.length; i += 1) {
      const item = args.background[i]
      if (item === null || typeof item !== 'object') { violations.push('save_probe: background[' + i + '] 必须是对象'); continue }
      if (typeof item.topic !== 'string') violations.push('save_probe: background[' + i + '].topic 必须是字符串')
      else if (item.topic.length > PROBE_LIMITS.maxTopicLen) violations.push('save_probe: background[' + i + '].topic 长度 ' + item.topic.length + ' 超过上限 ' + PROBE_LIMITS.maxTopicLen)
      if (typeof item.detail !== 'string') violations.push('save_probe: background[' + i + '].detail 必须是字符串')
      else if (item.detail.length > PROBE_LIMITS.maxDetailLen) violations.push('save_probe: background[' + i + '].detail 长度 ' + item.detail.length + ' 超过上限 ' + PROBE_LIMITS.maxDetailLen)
    }
  }
  if (args.evidence !== undefined && args.evidence !== null) {
    if (!Array.isArray(args.evidence)) violations.push('save_probe: evidence 必须是数组')
    else {
      if (args.evidence.length > PROBE_LIMITS.maxEvidenceEntries) violations.push('save_probe: evidence 条目数 ' + args.evidence.length + ' 超过上限 ' + PROBE_LIMITS.maxEvidenceEntries)
      for (let i = 0; i < args.evidence.length; i += 1) {
        const item = args.evidence[i]
        if (item === null || typeof item !== 'object') { violations.push('save_probe: evidence[' + i + '] 必须是对象'); continue }
        if (typeof item.path !== 'string') violations.push('save_probe: evidence[' + i + '].path 类型错误（应为字符串）')
        else if (item.path.length > PROBE_LIMITS.maxPathLen) violations.push('save_probe: evidence[' + i + '].path 长度 ' + item.path.length + ' 超过上限 ' + PROBE_LIMITS.maxPathLen)
        else pathRefs.push({ field: 'evidence', index: i, value: item.path })
        if (item.line !== undefined && item.line !== null && item.line !== '') {
          if (typeof item.line !== 'string') violations.push('save_probe: evidence[' + i + '].line 类型错误（应为字符串）')
          else if (item.line.length > PROBE_LIMITS.maxEvidenceLineLen) violations.push('save_probe: evidence[' + i + '].line 长度 ' + item.line.length + ' 超过上限 ' + PROBE_LIMITS.maxEvidenceLineLen + '（' + LINE_FORMAT_HINT + '）')
          else if (!new RegExp(PROBE_LIMITS.evidenceLinePattern, 'i').test(item.line)) violations.push('save_probe: evidence[' + i + '].line 非法：' + item.line + '（' + LINE_FORMAT_HINT + '）')
        }
        if (item.value !== undefined && item.value !== null && item.value !== '') {
          if (typeof item.value !== 'string') violations.push('save_probe: evidence[' + i + '].value 类型错误（应为字符串）')
          else if (item.value.length > PROBE_LIMITS.maxEvidenceValueLen) violations.push('save_probe: evidence[' + i + '].value 长度 ' + item.value.length + ' 超过上限 ' + PROBE_LIMITS.maxEvidenceValueLen)
        }
        if (item.text !== undefined && item.text !== null && item.text !== '') {
          if (typeof item.text !== 'string') violations.push('save_probe: evidence[' + i + '].text 类型错误（应为字符串）')
          else if (item.text.length > PROBE_LIMITS.maxEvidenceTextLen) violations.push('save_probe: evidence[' + i + '].text 长度 ' + item.text.length + ' 超过上限 ' + PROBE_LIMITS.maxEvidenceTextLen)
        }
        if (item.note !== undefined && item.note !== null && item.note !== '') {
          if (typeof item.note !== 'string') violations.push('save_probe: evidence[' + i + '].note 类型错误（应为字符串）')
          else if (item.note.length > PROBE_LIMITS.maxEvidenceNoteLen) violations.push('save_probe: evidence[' + i + '].note 长度 ' + item.note.length + ' 超过上限 ' + PROBE_LIMITS.maxEvidenceNoteLen)
        }
        if ((item.line === undefined || item.line === null || item.line === '') && (item.value === undefined || item.value === null || item.value === '') && (item.text === undefined || item.text === null || item.text === '')) violations.push('save_probe: evidence[' + i + '] 须至少提供 line/value/text 之一')
      }
      const evTotal = JSON.stringify(args.evidence).length
      if (evTotal > PROBE_LIMITS.maxEvidenceTotalChars) violations.push('save_probe: evidence 总量 ' + evTotal + ' 字符超过上限 ' + PROBE_LIMITS.maxEvidenceTotalChars)
    }
  }
  const allFieldsArrays = fields.every((field) => Array.isArray(args[field]))
  if (allFieldsArrays) {
    const total = JSON.stringify({ fileMap: args.fileMap, focusAreas: args.focusAreas, exclusions: args.exclusions, background: args.background }).length
    if (total > PROBE_LIMITS.maxTotalChars) violations.push('save_probe: 四字段总量 ' + total + ' 字符超过上限 ' + PROBE_LIMITS.maxTotalChars)
  }
  if (violations.length === 0 && pathRefs.length > 0 && typeof cwd === 'string' && cwd !== '') {
    for (const ref of pathRefs) {
      const problem = pathViolation(cwd, ref.value, pathContext)
      if (problem !== null) violations.push('save_probe: ' + ref.field + '[' + ref.index + '].path ' + problem)
    }
  }
  if (violations.length === 0) return null
  return 'save_probe: 校验不通过，共发现 ' + violations.length + ' 处违规（超限一律拒绝、不静默截断，请逐条修正后重试）：\n- ' + violations.join('\n- ')
}

// 兼容旧调用：无上下文时只做词法拼接；生产路径校验必须传入pathContext并使用resolveProbeTarget。
export function probePathOf(cwd, p, pathContext) {
  if (pathContext !== undefined && pathContext !== null) return resolveProbeTarget(cwd, p, pathContext).path
  if (isAbsolute(p)) return p
  return resolve(join(cwd, p))
}
