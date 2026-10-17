import { SAVE_PLAN_LIMITS, formatSavePlanSummary } from './save-contract.js'

const CONTRACT_ERROR_PREFIX = 'save_plan: 文件级任务合同校验不通过'
const MAX_DIAGNOSTICS = 20
const TASK_HEADING_RE = /^\[任务([1-9]\d*)\][ \t]+(.+?)\s*$/
const TASK_CANDIDATE_RE = /^\[任务([^\]]*)\]/
const CHECK_HEADING_RE = /^\[检查([1-9]\d*)\][ \t]+(.+?)\s*$/
const CHECK_CANDIDATE_RE = /^\[检查([^\]]*)\]/
const CLOSURE_HEADING_RE = /^\[收尾\][ \t]*$/
const GLOBAL_HEADING_RE = /^\[全局验收\][ \t]*$/
const CLOSURE_CANDIDATE_RE = /^\[收尾/
const GLOBAL_CANDIDATE_RE = /^\[全局验收/
const GROUP_RE = /^G[1-9]\d*$/
const REVIEW_GROUP_RE = /^R[1-9]\d*$/
const DEPENDENCY_RE = /^\[任务([1-9]\d*)\]$/
const CHECK_REF_RE = /^\[检查([1-9]\d*)\]$/

const MODE_PREFIX = '- 执行模式：'
const DISPATCH_PREFIX = '- 派遣说明：'
const REVIEW_PREFIX = '- 验收说明：'

const FIELD_DEFINITIONS = Object.freeze([
  ['mainFiles', '主文件', '- 主文件：'],
  ['relatedFiles', '关联文件', '- 关联文件：'],
  ['groups', '执行组', '- 执行组：'],
  ['dependencyFields', '依赖', '- 依赖：'],
  ['dependencyReasons', '依赖理由', '- 依赖理由：'],
  ['groupReasons', '分组理由', '- 分组理由：'],
  ['modifications', '修改', '- 修改：'],
  ['selfChecks', '自检', '- 自检：'],
  ['resources', '独占资源', '- 独占资源：'],
  ['expectations', '期望', '- 期望：'],
  ['prohibitions', '禁止', '- 禁止：'],
  ['formalAcceptance', '正式验收', '- 正式验收：'],
  ['closureFiles', '收尾文件', '- 收尾文件：'],
  ['closureDependencies', '收尾依赖', '- 收尾依赖：'],
  ['closureActions', '收尾动作', '- 收尾动作：'],
  ['reviewGroups', '验收组', '- 验收组：'],
  ['evidenceModes', '取证方式', '- 取证方式：'],
  ['workdirs', '工作目录', '- 工作目录：'],
  ['checks', '检查', '- 检查：'],
  ['evidence', '验收证据', '- 验收证据：']
])

function newTask(id, title, line) {
  return {
    kind: 'task', id, title, line,
    mainFiles: [], relatedFiles: [], groups: [], dependencyFields: [], dependencyReasons: [],
    groupReasons: [], modifications: [], selfChecks: [], resources: [], expectations: [],
    prohibitions: [], formalAcceptance: [], checkRefs: [], dependencies: [], resourceIds: [],
    fileSet: new Set(), fileKeys: new Set()
  }
}

function newClosure(line) {
  return {
    kind: 'closure', line, closureFiles: [], closureDependencies: [], closureActions: [],
    selfChecks: [], resources: [], expectations: [], prohibitions: [], formalAcceptance: [],
    checkRefs: [], dependencies: [], resourceIds: [], fileSet: new Set(), fileKeys: new Set()
  }
}

function newCheck(id, title, line) {
  return {
    kind: 'check', id, title, line, reviewGroups: [], evidenceModes: [], workdirs: [],
    checks: [], evidence: [], resources: [], resourceIds: [], checkRefs: [],
    coverageTasks: [], coverageClosure: false, coverageGlobal: false
  }
}

function newGlobal(line) {
  return { kind: 'global', line, expectations: [], prohibitions: [], formalAcceptance: [], checkRefs: [] }
}

function makeDiagnostic(document, taskId, field, value, message, template) {
  return {
    document,
    taskId,
    field,
    value: value === undefined || value === null ? '' : String(value),
    message,
    template: template || defaultTemplate(field, taskId)
  }
}

function defaultTemplate(field, taskId) {
  const id = Number.isInteger(taskId) ? taskId : 1
  if (field === '模式') return '- 执行模式：single 或 batch'
  if (field === '派遣说明') return '- 派遣说明：先读方案和验收文件；完成后冻结再验收'
  if (field === '验收说明') return '- 验收说明：按检查ID分组复核，漏项不得通过'
  if (field === '任务块' || field === '任务ID') return '[任务' + id + '] 标题 / - 主文件：plugins/example/file.js / - 执行组：G1 / - 依赖：无'
  if (field === '检查块' || field === '检查ID') return '[检查1] 标题 / - 验收组：R1 / - 取证方式：只读复核 / - 工作目录：.'
  if (field === '收尾块') return '[收尾] / - 收尾依赖：[任务1] / - 收尾动作：完成收尾 / - 自检：已核对'
  if (field === '全局验收块') return '[全局验收] / - 期望：全部覆盖 / - 禁止：漏项 / - 正式验收：[检查1]'
  if (field === '主文件' || field === '收尾文件') return '- ' + field + '：plugins/example/file.js'
  if (field === '关联文件') return '- 关联文件：plugins/example/helper.js'
  if (field === '执行组') return '- 执行组：G1'
  if (field === '依赖' || field === '收尾依赖') return '- ' + field + '：无'
  if (field === '依赖理由') return '- 依赖理由：无'
  if (field === '分组理由') return '- 分组理由：无'
  if (field === '修改') return '- 修改：完成一个具体动作'
  if (field === '自检') return '- 自检：运行有限纯函数检查'
  if (field === '期望') return '- 期望：可验证的结果'
  if (field === '禁止') return '- 禁止：明确的边界'
  if (field === '正式验收') return '- 正式验收：[检查1]'
  if (field === '验收组') return '- 验收组：R1'
  if (field === '取证方式') return '- 取证方式：只读复核'
  if (field === '工作目录') return '- 工作目录：.'
  if (field === '检查') return '- 检查：明确的只读核对动作'
  if (field === '验收证据') return '- 验收证据：命令退出0且原始结果可读'
  if (field === '独占资源') return '- 独占资源：无'
  return '- ' + field + '：填写非空内容'
}

function normalizeText(text) {
  return typeof text === 'string' ? text.replace(/\r\n?/g, '\n') : ''
}

function fieldOf(line) {
  for (const [key, label, prefix] of FIELD_DEFINITIONS) {
    if (line.startsWith(prefix)) return { key, label, value: line.slice(prefix.length).trim() }
  }
  return null
}

function headingCandidate(line) {
  const task = line.match(TASK_HEADING_RE)
  if (task !== null) return { kind: 'task', id: Number(task[1]), title: task[2].trim() }
  const check = line.match(CHECK_HEADING_RE)
  if (check !== null) return { kind: 'check', id: Number(check[1]), title: check[2].trim() }
  if (CLOSURE_HEADING_RE.test(line)) return { kind: 'closure' }
  if (GLOBAL_HEADING_RE.test(line)) return { kind: 'global' }
  if (TASK_CANDIDATE_RE.test(line)) return { kind: 'bad-task', value: line }
  if (CHECK_CANDIDATE_RE.test(line)) return { kind: 'bad-check', value: line }
  if (CLOSURE_CANDIDATE_RE.test(line)) return { kind: 'bad-closure', value: line }
  if (GLOBAL_CANDIDATE_RE.test(line)) return { kind: 'bad-global', value: line }
  return null
}

function pushEmptyFieldDiagnostic(document, current, field) {
  if (field.value !== '') return
  const taskId = current.kind === 'task' ? current.id : null
  return makeDiagnostic(document, taskId, field.label, field.value, '结构字段不能为空')
}

function parseTaskDocument(text, document) {
  const isPlan = document === 'plan'
  const lines = normalizeText(text).split('\n')
  const tasks = []
  const checks = []
  const diagnostics = []
  const modeEntries = []
  const instructionEntries = []
  let closure = null
  let global = null
  let current = null
  let stage = 0
  let fence = ''

  const flush = () => {
    if (current === null) return
    if (current.kind === 'task') tasks.push(current)
    else if (current.kind === 'check') checks.push(current)
    else if (current.kind === 'closure') closure = current
    else if (current.kind === 'global') global = current
    current = null
  }

  const wrongHeading = (kind, line, message) => {
    diagnostics.push(makeDiagnostic(document, null, kind, line, message))
  }

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index]
    if (fence !== '') {
      if (line.startsWith(fence + fence + fence)) fence = ''
      continue
    }
    if (line.startsWith(String.fromCharCode(96).repeat(3))) { fence = String.fromCharCode(96); continue }
    if (line.startsWith('~~~')) { fence = '~'; continue }
    if (line !== line.trimStart()) continue

    if (line.startsWith(MODE_PREFIX)) {
      const value = line.slice(MODE_PREFIX.length).trim()
      if (stage !== 0) diagnostics.push(makeDiagnostic(document, null, '执行模式', value, '执行模式必须位于首个任务前'))
      modeEntries.push({ value, line: index + 1 })
      if (value === '') diagnostics.push(makeDiagnostic(document, null, '执行模式', value, '执行模式不能为空'))
      continue
    }
    const instructionPrefix = isPlan ? DISPATCH_PREFIX : REVIEW_PREFIX
    if (line.startsWith(instructionPrefix)) {
      const value = line.slice(instructionPrefix.length).trim()
      const label = isPlan ? '派遣说明' : '验收说明'
      if (stage !== 0) diagnostics.push(makeDiagnostic(document, null, label, value, label + '必须位于首个任务前'))
      instructionEntries.push({ value, line: index + 1 })
      if (value === '') diagnostics.push(makeDiagnostic(document, null, label, value, label + '不能为空'))
      continue
    }
    const wrongInstructionPrefix = isPlan ? REVIEW_PREFIX : DISPATCH_PREFIX
    if (line.startsWith(wrongInstructionPrefix)) {
      const value = line.slice(wrongInstructionPrefix.length).trim()
      const label = isPlan ? '验收说明' : '派遣说明'
      const message = isPlan ? '方案只能声明派遣说明，验收说明属于验收清单' : '验收清单只能声明验收说明，派遣说明属于方案'
      diagnostics.push(makeDiagnostic(document, null, label, value, message))
      continue
    }

    const heading = headingCandidate(line)
    if (heading !== null) {
      flush()
      if (heading.kind === 'task') {
        if (stage > 1) {
          wrongHeading('任务块', line, '数字任务必须位于收尾、检查和全局验收之前')
          continue
        }
        stage = 1
        current = newTask(heading.id, heading.title, index + 1)
        continue
      }
      if (heading.kind === 'check') {
        if (isPlan) {
          wrongHeading('检查块', line, '方案不得包含检查定义')
          continue
        }
        if (stage < 1 || stage > 3) {
          wrongHeading('检查块', line, '检查定义必须位于数字任务和收尾之后、全局验收之前')
          continue
        }
        stage = 3
        current = newCheck(heading.id, heading.title, index + 1)
        continue
      }
      if (heading.kind === 'closure') {
        if (stage !== 1 || closure !== null) {
          wrongHeading('收尾块', line, '收尾必须至多一个且位于全部数字任务之后')
          continue
        }
        stage = 2
        current = newClosure(index + 1)
        continue
      }
      if (heading.kind === 'global') {
        if (isPlan) {
          wrongHeading('全局验收块', line, '方案不得包含全局验收')
          continue
        }
        if (stage !== 3 || global !== null) {
          wrongHeading('全局验收块', line, '全局验收必须至多一个且位于全部检查定义之后')
          continue
        }
        stage = 4
        current = newGlobal(index + 1)
        continue
      }
      if (heading.kind === 'bad-task') {
        wrongHeading('任务块', line, '任务块必须是列首“[任务正整数] 标题”，标题不能为空')
        continue
      }
      if (heading.kind === 'bad-check') {
        wrongHeading('检查块', line, '检查块必须是列首“[检查正整数] 标题”，标题不能为空')
        continue
      }
      if (heading.kind === 'bad-closure') {
        wrongHeading('收尾块', line, '收尾块必须严格写作“[收尾]”')
        continue
      }
      if (heading.kind === 'bad-global') {
        wrongHeading('全局验收块', line, '全局验收块必须严格写作“[全局验收]”')
        continue
      }
    }

    const field = fieldOf(line)
    if (field === null) continue
    if (current === null) {
      diagnostics.push(makeDiagnostic(document, null, field.label, field.value, '结构字段必须位于所属结构块内'))
      continue
    }
    const allowed = isPlan
      ? (current.kind === 'task'
        ? new Set(['mainFiles', 'relatedFiles', 'groups', 'dependencyFields', 'dependencyReasons', 'groupReasons', 'modifications', 'selfChecks', 'resources'])
        : current.kind === 'closure'
          ? new Set(['closureFiles', 'closureDependencies', 'closureActions', 'selfChecks', 'resources'])
          : new Set())
      : (current.kind === 'task'
        ? new Set(['mainFiles', 'relatedFiles', 'expectations', 'prohibitions', 'formalAcceptance'])
        : current.kind === 'closure'
          ? new Set(['closureFiles', 'expectations', 'prohibitions', 'formalAcceptance'])
          : current.kind === 'check'
            ? new Set(['reviewGroups', 'evidenceModes', 'workdirs', 'checks', 'evidence', 'resources'])
            : current.kind === 'global'
              ? new Set(['expectations', 'prohibitions', 'formalAcceptance'])
              : new Set())
    if (!allowed.has(field.key)) {
      const taskId = current.kind === 'task' ? current.id : null
      diagnostics.push(makeDiagnostic(document, taskId, field.label, field.value, '字段出现在错误结构块或职责位置'))
      continue
    }
    current[field.key].push(field.value)
    const emptyDiagnostic = pushEmptyFieldDiagnostic(document, current, field)
    if (emptyDiagnostic !== undefined) diagnostics.push(emptyDiagnostic)
  }
  flush()

  const mode = modeEntries.length === 1 ? modeEntries[0].value : null
  const instruction = instructionEntries.length === 1 ? instructionEntries[0].value : null
  if (modeEntries.length === 0) diagnostics.push(makeDiagnostic(document, null, '执行模式', '', '必须在首个任务前声明且只声明一次执行模式'))
  if (modeEntries.length > 1) diagnostics.push(makeDiagnostic(document, null, '执行模式', modeEntries.map((item) => item.value).join('、'), '执行模式不得重复'))
  if (mode !== null && mode !== 'single' && mode !== 'batch') diagnostics.push(makeDiagnostic(document, null, '执行模式', mode, '执行模式只能是 single 或 batch'))
  const instructionLabel = isPlan ? '派遣说明' : '验收说明'
  if (instructionEntries.length === 0) diagnostics.push(makeDiagnostic(document, null, instructionLabel, '', '卷首必须声明且只声明一次说明'))
  if (instructionEntries.length > 1) diagnostics.push(makeDiagnostic(document, null, instructionLabel, instructionEntries.map((item) => item.value).join('、'), instructionLabel + '不得重复'))

  return { document, isPlan, mode, instruction, tasks, closure, checks, global, diagnostics }
}

function validateIds(items, document, diagnostics, kind) {
  const seen = new Map()
  for (const item of items) {
    if (seen.has(item.id)) diagnostics.push(makeDiagnostic(document, item.id, kind + 'ID', item.id, kind + ' ID 不得重复'))
    else seen.set(item.id, item)
  }
  const ids = Array.from(seen.keys()).sort((a, b) => a - b)
  const continuous = ids.length > 0 && ids.every((id, index) => id === index + 1)
  const ordered = items.every((item, index) => item.id === index + 1)
  if (ids.length > 0 && !continuous) diagnostics.push(makeDiagnostic(document, ids[0], kind + 'ID', ids.join('、'), kind + ' ID 必须从 1 连续递增且不重复'))
  if (ids.length > 0 && continuous && !ordered) diagnostics.push(makeDiagnostic(document, items[0].id, kind + 'ID', items.map((item) => item.id).join('、'), kind + '块必须按 ID 从 1 递增出现'))
}

function isMarkdownWrapped(path) {
  if (path.includes(String.fromCharCode(96))) return true
  const pairs = [
    ['<', '>'], ['[', ']'], ['(', ')'], ['{', '}'], ['「', '」'], ['『', '』'], ['【', '】'], ['《', '》'],
    ['（', '）'], ['“', '”'], ['"', '"'], ["'", "'"]
  ]
  for (const [open, close] of pairs) if (path.startsWith(open) && path.endsWith(close)) return true
  if (/^\*{1,2}.+\*{1,2}$/.test(path)) return true
  if (/^_{1,2}.+_{1,2}$/.test(path)) return true
  if (/^!?\[[^\]]+\]\([^)]*\)$/.test(path)) return true
  return false
}

function pathIssue(value) {
  if (typeof value !== 'string' || value.trim() === '') return '路径不能为空'
  const path = value.trim()
  if (/^[A-Za-z]:/.test(path)) return '拒绝盘符路径，必须使用工作区相对路径'
  if (/^[\\/]/.test(path)) return '拒绝绝对路径，必须使用工作区相对路径'
  if (path.includes('\\')) return '拒绝反斜杠路径，只使用正斜杠'
  if (path.endsWith('/')) return '拒绝尾斜杠，文件路径必须是文件路径'
  const segments = path.split('/')
  if (segments.some((segment) => segment === '')) return '拒绝空路径段'
  if (segments.some((segment) => segment === '.' || segment === '..')) return '拒绝点段路径'
  if (isMarkdownWrapped(path)) return '拒绝 Markdown 包裹，路径必须是裸相对路径'
  return null
}

function workdirIssue(value) {
  if (typeof value !== 'string' || value.trim() === '') return '工作目录不能为空'
  const path = value.trim()
  if (path === '.') return null
  return pathIssue(path)
}

function platformIsCaseInsensitive(options) {
  if (options !== undefined && options !== null && typeof options.platform === 'string') return options.platform === 'win32'
  if (options !== undefined && options !== null && typeof options.caseInsensitive === 'boolean') return options.caseInsensitive
  return process.platform === 'win32'
}

function pathKey(path, options) {
  const normalized = String(path).replace(/\\/g, '/')
  return platformIsCaseInsensitive(options) ? normalized.toLowerCase() : normalized
}

function parseDependencies(value) {
  const raw = typeof value === 'string' ? value.trim() : ''
  if (raw === '无') return { ids: [], issue: null }
  if (raw === '') return { ids: [], issue: '依赖必须是“无”或以[任务N]组成的列表' }
  const parts = raw.split(/[、,，;；]+/).map((part) => part.trim()).filter((part) => part !== '')
  if (parts.length === 0 || parts.some((part) => !/^\[任务[1-9]\d*\]$/.test(part))) return { ids: [], issue: '依赖必须是“无”或以[任务N]组成的列表' }
  const ids = parts.map((part) => Number(part.match(/^\[任务([1-9]\d*)\]$/)[1]))
  if (new Set(ids).size !== ids.length) return { ids, issue: '依赖列表不得重复任务 ID' }
  return { ids, issue: null }
}

function parseResources(value) {
  const raw = typeof value === 'string' ? value.trim() : ''
  if (raw === '无') return { ids: [], issue: null }
  if (raw === '') return { ids: [], issue: '独占资源字段不能为空或写“无”' }
  const parts = raw.split(/[,，]/).map((part) => part.trim())
  if (parts.some((part) => part === '' || part === '无')) return { ids: [], issue: '独占资源必须是“无”或逗号分隔的非空稳定标识' }
  if (new Set(parts).size !== parts.length) return { ids: parts, issue: '独占资源标识不得重复' }
  return { ids: parts, issue: null }
}

function parseCheckRefs(value) {
  const raw = typeof value === 'string' ? value.trim() : ''
  if (raw === '') return { ids: [], issue: '正式验收必须引用一个或多个[检查N]' }
  const parts = raw.split(/[、,，;；\s]+/).map((part) => part.trim()).filter((part) => part !== '')
  if (parts.length === 0 || parts.some((part) => !/^\[检查[1-9]\d*\]$/.test(part))) return { ids: [], issue: '正式验收必须是一个或多个[检查N]引用列表' }
  const ids = parts.map((part) => Number(part.match(/^\[检查([1-9]\d*)\]$/)[1]))
  if (new Set(ids).size !== ids.length) return { ids, issue: '正式验收引用列表不得重复检查 ID' }
  return { ids, issue: null }
}

function addPathDiagnostics(values, document, taskId, field, diagnostics, options, allowDirectory) {
  for (const value of values) {
    const issue = allowDirectory ? workdirIssue(value) : pathIssue(value)
    if (issue !== null) diagnostics.push(makeDiagnostic(document, taskId, field, value, issue))
  }
}

function validatePathSet(task, document, diagnostics, options) {
  addPathDiagnostics(task.mainFiles, document, task.id, '主文件', diagnostics, options, false)
  addPathDiagnostics(task.relatedFiles, document, task.id, '关联文件', diagnostics, options, false)
  const rawSet = new Set()
  const keySet = new Set()
  for (const value of task.mainFiles.concat(task.relatedFiles)) {
    if (typeof value !== 'string' || value === '') continue
    const key = pathKey(value, options)
    if (keySet.has(key)) diagnostics.push(makeDiagnostic(document, task.id, '文件集合', value, '同一任务的主文件和关联文件不得重复'))
    keySet.add(key)
    rawSet.add(value)
  }
  task.fileSet = rawSet
  task.fileKeys = keySet
}

function validateResourceField(owner, document, taskId, diagnostics) {
  if (owner.resources.length > 1) diagnostics.push(makeDiagnostic(document, taskId, '独占资源', owner.resources.join('、'), '独占资源为可选单值字段，不得重复'))
  owner.resourceIds = []
  if (owner.resources.length === 1) {
    const parsed = parseResources(owner.resources[0])
    owner.resourceIds = parsed.ids
    if (parsed.issue !== null) diagnostics.push(makeDiagnostic(document, taskId, '独占资源', owner.resources[0], parsed.issue))
  }
}

function validateTaskShape(task, document, isPlan, diagnostics, options) {
  if (task.title === '') diagnostics.push(makeDiagnostic(document, task.id, '标题', '', '任务标题不能为空'))
  if (task.mainFiles.length !== 1) diagnostics.push(makeDiagnostic(document, task.id, '主文件', task.mainFiles.join('、'), '每个任务必须恰好有一个非空主文件'))
  validatePathSet(task, document, diagnostics, options)
  if (isPlan) {
    if (task.groups.length !== 1) diagnostics.push(makeDiagnostic(document, task.id, '执行组', task.groups.join('、'), '每个方案任务必须恰好有一个执行组'))
    for (const group of task.groups) if (!GROUP_RE.test(group)) diagnostics.push(makeDiagnostic(document, task.id, '执行组', group, '执行组必须匹配 G1、G2 等正整数组名'))
    if (task.dependencyFields.length !== 1) {
      diagnostics.push(makeDiagnostic(document, task.id, '依赖', task.dependencyFields.join('、'), '每个方案任务必须恰好有一条依赖字段'))
    } else {
      const parsed = parseDependencies(task.dependencyFields[0])
      task.dependencies = parsed.ids
      if (parsed.issue !== null) diagnostics.push(makeDiagnostic(document, task.id, '依赖', task.dependencyFields[0], parsed.issue))
    }
    if (task.dependencyReasons.length !== 1) diagnostics.push(makeDiagnostic(document, task.id, '依赖理由', task.dependencyReasons.join('、'), '每个方案任务必须恰好有一条依赖理由'))
    if (task.groupReasons.length !== 1) diagnostics.push(makeDiagnostic(document, task.id, '分组理由', task.groupReasons.join('、'), '每个方案任务必须恰好有一条分组理由'))
    if (task.modifications.length === 0) diagnostics.push(makeDiagnostic(document, task.id, '修改', '', '每个方案任务至少需要一条修改'))
    if (task.selfChecks.length === 0) diagnostics.push(makeDiagnostic(document, task.id, '自检', '', '每个方案任务至少需要一条自检'))
    if (task.dependencyReasons.length === 1) {
      const reason = task.dependencyReasons[0].trim()
      if (task.dependencies.length === 0 && reason !== '无') diagnostics.push(makeDiagnostic(document, task.id, '依赖理由', reason, '无依赖时依赖理由必须写“无”'))
      if (task.dependencies.length > 0 && (reason === '' || reason === '无')) diagnostics.push(makeDiagnostic(document, task.id, '依赖理由', reason, '有依赖时依赖理由必须是非“无”的实现先后说明'))
    }
    if (task.groupReasons.length === 1 && task.relatedFiles.length > 0 && task.groupReasons[0].trim() === '无') diagnostics.push(makeDiagnostic(document, task.id, '分组理由', task.groupReasons[0], '存在关联文件时必须说明不能安全拆分的原因'))
    validateResourceField(task, document, task.id, diagnostics)
  } else {
    if (task.expectations.filter((value) => value !== '').length === 0) diagnostics.push(makeDiagnostic(document, task.id, '期望', task.expectations.join('、'), '验收任务至少需要一条非空期望'))
    if (task.prohibitions.filter((value) => value !== '').length === 0) diagnostics.push(makeDiagnostic(document, task.id, '禁止', task.prohibitions.join('、'), '验收任务至少需要一条非空禁止'))
    if (task.formalAcceptance.length !== 1) diagnostics.push(makeDiagnostic(document, task.id, '正式验收', task.formalAcceptance.join('、'), '每个验收任务必须恰好有一条正式验收引用列表'))
    if (task.formalAcceptance.length === 1) {
      const parsed = parseCheckRefs(task.formalAcceptance[0])
      task.checkRefs = parsed.ids
      if (parsed.issue !== null) diagnostics.push(makeDiagnostic(document, task.id, '正式验收', task.formalAcceptance[0], parsed.issue))
    }
  }
}

function graphCycles(nodes, edges) {
  const colors = new Map()
  const stack = []
  const cycles = []
  const cycleKeys = new Set()
  const visit = (node) => {
    colors.set(node, 1)
    stack.push(node)
    for (const next of edges.get(node) || []) {
      if (colors.get(next) === 1) {
        const start = stack.indexOf(next)
        const cycle = stack.slice(start).concat(next)
        const key = cycle.join('>')
        if (!cycleKeys.has(key)) { cycleKeys.add(key); cycles.push(cycle) }
      } else if (colors.get(next) !== 2) visit(next)
    }
    stack.pop()
    colors.set(node, 2)
  }
  for (const node of nodes) if (colors.get(node) === undefined) visit(node)
  return cycles
}

function groupSort(left, right) {
  const a = Number(String(left).slice(1))
  const b = Number(String(right).slice(1))
  return a - b || String(left).localeCompare(String(right))
}

function firstTaskForGroup(tasks, group) {
  const task = tasks.find((item) => item.groups[0] === group)
  return task === undefined ? null : task.id
}

function validatePlanRelations(tasks, diagnostics, options) {
  const byId = new Map()
  for (const task of tasks) if (!byId.has(task.id)) byId.set(task.id, task)
  const taskEdges = new Map(tasks.map((task) => [task.id, []]))
  for (const task of tasks) {
    for (const dependency of task.dependencies) {
      if (!byId.has(dependency)) {
        diagnostics.push(makeDiagnostic('plan', task.id, '依赖', '[任务' + dependency + ']', '依赖引用的任务 ID 不存在'))
        continue
      }
      if (dependency === task.id) {
        diagnostics.push(makeDiagnostic('plan', task.id, '依赖', '[任务' + dependency + ']', '任务不得依赖自身'))
        continue
      }
      taskEdges.get(task.id).push(dependency)
    }
  }
  for (const cycle of graphCycles(Array.from(taskEdges.keys()).sort((a, b) => a - b), taskEdges)) diagnostics.push(makeDiagnostic('plan', cycle[0], '依赖', cycle.map((id) => '[任务' + id + ']').join('→'), '任务依赖存在环'))

  const groupEdges = new Map()
  for (const task of tasks) {
    const group = task.groups[0]
    if (typeof group === 'string' && GROUP_RE.test(group) && !groupEdges.has(group)) groupEdges.set(group, [])
  }
  for (const task of tasks) {
    const source = task.groups[0]
    if (!groupEdges.has(source)) continue
    for (const dependency of task.dependencies) {
      const targetTask = byId.get(dependency)
      if (targetTask === undefined) continue
      const target = targetTask.groups[0]
      if (!GROUP_RE.test(target) || source === target) continue
      const edges = groupEdges.get(source)
      if (!edges.includes(target)) edges.push(target)
      if (!groupEdges.has(target)) groupEdges.set(target, [])
    }
  }
  for (const cycle of graphCycles(Array.from(groupEdges.keys()).sort(groupSort), groupEdges)) diagnostics.push(makeDiagnostic('plan', firstTaskForGroup(tasks, cycle[0]), '执行组', cycle.join('→'), '执行组依赖存在环'))

  const fileOwners = new Map()
  for (const task of tasks) {
    const group = task.groups[0]
    for (const file of task.fileKeys) {
      if (!fileOwners.has(file)) fileOwners.set(file, [])
      const owners = fileOwners.get(file)
      if (!owners.some((owner) => owner.id === task.id)) owners.push({ id: task.id, group })
    }
  }
  for (const [file, owners] of fileOwners) if (owners.length > 1) diagnostics.push(makeDiagnostic('plan', owners[0].id, '文件集合', file, '不同数字任务不得重复使用主文件或关联文件，即使属于同一执行组也不允许'))

  const groups = new Map()
  for (const task of tasks) {
    const group = task.groups[0]
    if (!GROUP_RE.test(group)) continue
    if (!groups.has(group)) groups.set(group, [])
    groups.get(group).push(task)
  }
  for (const [group, members] of groups) {
    if (members.length <= 1) continue
    const reason = members[0].groupReasons[0] === undefined ? '' : members[0].groupReasons[0].trim()
    if (reason === '' || reason === '无') diagnostics.push(makeDiagnostic('plan', members[0].id, '分组理由', reason, '同一执行组包含多个任务时必须使用相同且非“无”的分组理由'))
    for (const member of members) if (member.groupReasons.length === 1 && member.groupReasons[0].trim() !== reason) diagnostics.push(makeDiagnostic('plan', member.id, '分组理由', member.groupReasons[0], '同一执行组多个任务的分组理由必须完全相同'))
  }

  const resourceOwners = new Map()
  for (const task of tasks) {
    for (const resource of task.resourceIds) {
      const group = task.groups[0]
      if (!resourceOwners.has(resource)) resourceOwners.set(resource, { group, taskId: task.id })
      else if (resourceOwners.get(resource).group !== group) diagnostics.push(makeDiagnostic('plan', task.id, '独占资源', resource, '相同独占资源的数字任务必须归入同一执行组'))
    }
  }
}

function equalRawSets(left, right) {
  if (left.size !== right.size) return false
  for (const value of left) if (!right.has(value)) return false
  return true
}

function validateCrossDocument(plan, checklist, diagnostics) {
  if (plan.mode !== checklist.mode) diagnostics.push(makeDiagnostic('plan/checklist', null, '执行模式', String(plan.mode) + ' <> ' + String(checklist.mode), '方案与验收的执行模式必须一致'))
  const planById = new Map()
  const checklistById = new Map()
  for (const task of plan.tasks) if (!planById.has(task.id)) planById.set(task.id, task)
  for (const task of checklist.tasks) if (!checklistById.has(task.id)) checklistById.set(task.id, task)
  const allIds = Array.from(new Set(Array.from(planById.keys()).concat(Array.from(checklistById.keys())))).sort((a, b) => a - b)
  for (const id of allIds) {
    const planTask = planById.get(id)
    const checklistTask = checklistById.get(id)
    if (planTask === undefined) { diagnostics.push(makeDiagnostic('plan/checklist', id, '任务ID', id, '方案缺少验收中存在的任务 ID')); continue }
    if (checklistTask === undefined) { diagnostics.push(makeDiagnostic('plan/checklist', id, '任务ID', id, '验收缺少方案中存在的任务 ID')); continue }
    if ((planTask.mainFiles[0] || '') !== (checklistTask.mainFiles[0] || '')) diagnostics.push(makeDiagnostic('plan/checklist', id, '主文件', (planTask.mainFiles[0] || '') + ' <> ' + (checklistTask.mainFiles[0] || ''), '方案与验收的主文件必须一致'))
    if (!equalRawSets(new Set(planTask.mainFiles.concat(planTask.relatedFiles)), new Set(checklistTask.mainFiles.concat(checklistTask.relatedFiles)))) diagnostics.push(makeDiagnostic('plan/checklist', id, '文件集合', Array.from(planTask.fileSet).join('、') + ' <> ' + Array.from(checklistTask.fileSet).join('、'), '方案与验收的主文件加关联文件集合必须一致'))
  }
  if ((plan.closure === null) !== (checklist.closure === null)) diagnostics.push(makeDiagnostic('plan/checklist', null, '收尾', '', '方案与验收必须同时存在或同时省略收尾'))
  if (plan.closure !== null && checklist.closure !== null && !equalRawSets(new Set(plan.closure.closureFiles), new Set(checklist.closure.closureFiles))) diagnostics.push(makeDiagnostic('plan/checklist', null, '收尾文件', plan.closure.closureFiles.join('、') + ' <> ' + checklist.closure.closureFiles.join('、'), '方案与验收的收尾文件集合必须一致'))
}

function validateClosure(closure, document, isPlan, tasks, diagnostics, options) {
  if (closure === null) return
  if (isPlan) {
    addPathDiagnostics(closure.closureFiles, document, null, '收尾文件', diagnostics, options, false)
    const rawSet = new Set()
    const keySet = new Set()
    for (const value of closure.closureFiles) {
      const key = pathKey(value, options)
      if (keySet.has(key)) diagnostics.push(makeDiagnostic(document, null, '收尾文件', value, '收尾文件不得重复'))
      keySet.add(key)
      rawSet.add(value)
    }
    closure.fileSet = rawSet
    closure.fileKeys = keySet
    if (closure.closureDependencies.length !== 1) diagnostics.push(makeDiagnostic(document, null, '收尾依赖', closure.closureDependencies.join('、'), '收尾必须恰好有一条收尾依赖'))
    else {
      const parsed = parseDependencies(closure.closureDependencies[0])
      closure.dependencies = parsed.ids
      if (parsed.issue !== null) diagnostics.push(makeDiagnostic(document, null, '收尾依赖', closure.closureDependencies[0], '收尾依赖必须列出全部数字任务'))
    }
    if (closure.closureActions.length === 0) diagnostics.push(makeDiagnostic(document, null, '收尾动作', '', '收尾至少需要一条收尾动作'))
    if (closure.selfChecks.length === 0) diagnostics.push(makeDiagnostic(document, null, '自检', '', '收尾至少需要一条自检'))
    validateResourceField(closure, document, null, diagnostics)
    const allIds = new Set(tasks.map((task) => task.id))
    if (closure.dependencies.length !== allIds.size || closure.dependencies.some((id) => !allIds.has(id)) || new Set(closure.dependencies).size !== allIds.size) diagnostics.push(makeDiagnostic(document, null, '收尾依赖', closure.dependencies.map((id) => '[任务' + id + ']').join('、'), '收尾依赖必须恰好覆盖全部数字任务且不得重复'))
    for (const file of closure.fileKeys) if (tasks.some((task) => task.fileKeys.has(file))) diagnostics.push(makeDiagnostic(document, null, '收尾文件', file, '收尾文件不得与数字任务修改文件重叠'))
  } else {
    addPathDiagnostics(closure.closureFiles, document, null, '收尾文件', diagnostics, options, false)
    const rawSet = new Set()
    const keySet = new Set()
    for (const value of closure.closureFiles) {
      const key = pathKey(value, options)
      if (keySet.has(key)) diagnostics.push(makeDiagnostic(document, null, '收尾文件', value, '收尾文件不得重复'))
      keySet.add(key)
      rawSet.add(value)
    }
    closure.fileSet = rawSet
    closure.fileKeys = keySet
    if (closure.fileKeys.size > 0 && tasks.some((task) => Array.from(closure.fileKeys).some((file) => task.fileKeys.has(file)))) diagnostics.push(makeDiagnostic(document, null, '收尾文件', Array.from(closure.fileSet).join('、'), '收尾文件不得与数字任务修改文件重叠'))
    if (closure.expectations.filter((value) => value !== '').length === 0) diagnostics.push(makeDiagnostic(document, null, '期望', '', '验收收尾至少需要一条期望'))
    if (closure.prohibitions.filter((value) => value !== '').length === 0) diagnostics.push(makeDiagnostic(document, null, '禁止', '', '验收收尾至少需要一条禁止'))
    if (closure.formalAcceptance.length !== 1) diagnostics.push(makeDiagnostic(document, null, '正式验收', closure.formalAcceptance.join('、'), '验收收尾必须恰好有一条正式验收引用列表'))
    if (closure.formalAcceptance.length === 1) {
      const parsed = parseCheckRefs(closure.formalAcceptance[0])
      closure.checkRefs = parsed.ids
      if (parsed.issue !== null) diagnostics.push(makeDiagnostic(document, null, '正式验收', closure.formalAcceptance[0], parsed.issue))
    }
  }
}

function validateGlobal(global, diagnostics) {
  if (global === null) return
  if (global.expectations.filter((value) => value !== '').length === 0) diagnostics.push(makeDiagnostic('checklist', null, '期望', '', '全局验收至少需要一条期望'))
  if (global.prohibitions.filter((value) => value !== '').length === 0) diagnostics.push(makeDiagnostic('checklist', null, '禁止', '', '全局验收至少需要一条禁止'))
  if (global.formalAcceptance.length !== 1) diagnostics.push(makeDiagnostic('checklist', null, '正式验收', global.formalAcceptance.join('、'), '全局验收必须恰好有一条正式验收引用列表'))
  if (global.formalAcceptance.length === 1) {
    const parsed = parseCheckRefs(global.formalAcceptance[0])
    global.checkRefs = parsed.ids
    if (parsed.issue !== null) diagnostics.push(makeDiagnostic('checklist', null, '正式验收', global.formalAcceptance[0], parsed.issue))
  }
}

function validateChecks(parsed, diagnostics, options) {
  if (parsed.checks.length === 0) diagnostics.push(makeDiagnostic('checklist', null, '检查块', '', '验收至少需要一个检查定义'))
  validateIds(parsed.checks, 'checklist', diagnostics, '检查')
  const signatureOwners = new Map()
  const resourceOwners = new Map()
  const checkById = new Map()
  for (const check of parsed.checks) {
    checkById.set(check.id, check)
    if (check.title === '') diagnostics.push(makeDiagnostic('checklist', null, '标题', '', '检查标题不能为空'))
    if (check.reviewGroups.length !== 1) diagnostics.push(makeDiagnostic('checklist', null, '验收组', check.reviewGroups.join('、'), '每个检查必须恰好有一个验收组'))
    if (check.reviewGroups.length === 1 && !REVIEW_GROUP_RE.test(check.reviewGroups[0])) diagnostics.push(makeDiagnostic('checklist', null, '验收组', check.reviewGroups[0], '验收组必须匹配 R1、R2 等正整数组名'))
    if (check.evidenceModes.length !== 1) diagnostics.push(makeDiagnostic('checklist', null, '取证方式', check.evidenceModes.join('、'), '每个检查必须恰好有一个取证方式'))
    if (check.evidenceModes.length === 1 && check.evidenceModes[0] !== '只读复核' && check.evidenceModes[0] !== '执行取证') diagnostics.push(makeDiagnostic('checklist', null, '取证方式', check.evidenceModes[0], '取证方式只能是“只读复核”或“执行取证”'))
    if (check.workdirs.length !== 1) diagnostics.push(makeDiagnostic('checklist', null, '工作目录', check.workdirs.join('、'), '每个检查必须恰好有一个工作目录'))
    if (check.workdirs.length === 1) {
      const issue = workdirIssue(check.workdirs[0])
      if (issue !== null) diagnostics.push(makeDiagnostic('checklist', null, '工作目录', check.workdirs[0], issue))
    }
    if (check.checks.filter((value) => value !== '').length === 0) diagnostics.push(makeDiagnostic('checklist', null, '检查', '', '每个检查至少需要一条检查动作'))
    if (check.evidence.filter((value) => value !== '').length === 0) diagnostics.push(makeDiagnostic('checklist', null, '验收证据', '', '每个检查至少需要一条验收证据'))
    validateResourceField(check, 'checklist', null, diagnostics)
    if (check.reviewGroups.length === 1 && check.evidenceModes.length === 1 && check.workdirs.length === 1) {
      const signature = JSON.stringify([check.evidenceModes[0], pathKey(check.workdirs[0], options), check.checks])
      if (signatureOwners.has(signature)) diagnostics.push(makeDiagnostic('checklist', null, '检查', check.title, '不同检查 ID 不得重复定义相同的取证方式、工作目录和检查行；请合并并复用同一检查 ID'))
      else signatureOwners.set(signature, check.id)
    }
    if (check.reviewGroups.length === 1 && REVIEW_GROUP_RE.test(check.reviewGroups[0])) {
      const group = check.reviewGroups[0]
      for (const resource of check.resourceIds) {
        if (!resourceOwners.has(resource)) resourceOwners.set(resource, group)
        else if (resourceOwners.get(resource) !== group) diagnostics.push(makeDiagnostic('checklist', null, '独占资源', resource, '相同独占资源的检查必须归入同一验收组'))
      }
    }
  }
  const allCheckIds = new Set(parsed.checks.map((check) => check.id))
  const attachRefs = (owner, taskId) => {
    if (owner === null || owner === undefined || owner.formalAcceptance.length !== 1) return
    const parsedRefs = parseCheckRefs(owner.formalAcceptance[0])
    owner.checkRefs = parsedRefs.ids
    if (parsedRefs.issue !== null) return
    for (const id of owner.checkRefs) {
      if (!allCheckIds.has(id)) diagnostics.push(makeDiagnostic('checklist', taskId, '正式验收', '[检查' + id + ']', '正式验收引用的检查 ID 不存在'))
      const check = checkById.get(id)
      if (check === undefined) continue
      if (owner.kind === 'task') check.coverageTasks.push(owner.id)
      else if (owner.kind === 'closure') check.coverageClosure = true
      else if (owner.kind === 'global') check.coverageGlobal = true
    }
  }
  for (const task of parsed.tasks) attachRefs(task, task.id)
  attachRefs(parsed.closure, null)
  attachRefs(parsed.global, null)
  for (const check of parsed.checks) {
    check.coverageTasks = Array.from(new Set(check.coverageTasks)).sort((a, b) => a - b)
    if (!check.coverageTasks.length && !check.coverageClosure && !check.coverageGlobal) diagnostics.push(makeDiagnostic('checklist', null, '检查' + check.id, check.title, '检查定义不得成为孤儿，至少被任务、收尾或全局验收引用一次'))
  }
  return { checkById }
}

function sortIds(ids) {
  return Array.from(new Set(ids)).sort((a, b) => a - b)
}

function buildInternalOrder(members, byId) {
  const memberIds = members.map((task) => task.id).sort((a, b) => a - b)
  const indegree = new Map(memberIds.map((id) => [id, 0]))
  const next = new Map(memberIds.map((id) => [id, []]))
  for (const id of memberIds) {
    const task = byId.get(id)
    for (const dependency of task.dependencies) {
      if (!indegree.has(dependency)) continue
      indegree.set(id, indegree.get(id) + 1)
      next.get(dependency).push(id)
    }
  }
  const queue = memberIds.filter((id) => indegree.get(id) === 0)
  const order = []
  while (queue.length > 0) {
    queue.sort((a, b) => a - b)
    const id = queue.shift()
    order.push(id)
    for (const child of next.get(id) || []) {
      indegree.set(child, indegree.get(child) - 1)
      if (indegree.get(child) === 0) queue.push(child)
    }
  }
  return order.length === memberIds.length ? order : memberIds
}

function reviewGroupSort(left, right) {
  const a = Number(String(left).slice(1))
  const b = Number(String(right).slice(1))
  return a - b || String(left).localeCompare(String(right))
}

function buildSummary(plan, checklist) {
  const taskById = new Map(plan.tasks.map((task) => [task.id, task]))
  const files = new Set()
  for (const task of plan.tasks) for (const key of task.fileKeys) files.add(key)
  const closureFiles = new Set(plan.closure === null ? [] : Array.from(plan.closure.fileKeys))
  const taskFileCount = files.size
  const fileCount = taskFileCount + closureFiles.size
  const groupMap = new Map()
  for (const task of plan.tasks) {
    const group = task.groups[0]
    if (!groupMap.has(group)) groupMap.set(group, [])
    groupMap.get(group).push(task)
  }
  const groupIds = Array.from(groupMap.keys()).sort(groupSort)
  const groups = groupIds.map((group) => {
    const members = groupMap.get(group)
    const external = []
    const resources = []
    for (const task of members) {
      for (const dependency of task.dependencies) {
        const dependencyTask = taskById.get(dependency)
        if (dependencyTask !== undefined && dependencyTask.groups[0] !== group) external.push(dependencyTask.groups[0])
      }
      resources.push(...task.resourceIds)
    }
    const groupDependsOn = Array.from(new Set(external)).sort(groupSort)
    return {
      id: group,
      group,
      members: members.map((task) => task.id).sort((a, b) => a - b),
      internalOrder: buildInternalOrder(members, taskById),
      groupDependsOn,
      externalDependencies: groupDependsOn.slice(),
      initialState: groupDependsOn.length === 0 ? 'eligible' : 'waiting',
      staticEligibility: groupDependsOn.length === 0 ? 'initially-eligible' : 'waits-for-prerequisite-delivery',
      resources: Array.from(new Set(resources))
    }
  })
  const tasks = plan.tasks.map((task) => ({
    id: task.id,
    title: task.title,
    mainFiles: task.mainFiles.slice(),
    relatedFiles: task.relatedFiles.slice(),
    files: task.mainFiles.concat(task.relatedFiles),
    executionGroup: task.groups[0],
    group: task.groups[0],
    dependencies: task.dependencies.slice(),
    dependencyReason: task.dependencyReasons[0] || '',
    groupReason: task.groupReasons[0] || '',
    modifications: task.modifications.slice(),
    selfChecks: task.selfChecks.slice(),
    resources: task.resourceIds.slice()
  }))
  const checks = checklist.checks.map((check) => ({
    id: check.id,
    title: check.title,
    reviewGroup: check.reviewGroups[0],
    evidenceMode: check.evidenceModes[0],
    workdir: check.workdirs[0],
    checks: check.checks.slice(),
    evidence: check.evidence.slice(),
    coverage: { tasks: sortIds(check.coverageTasks), closure: check.coverageClosure === true, global: check.coverageGlobal === true },
    coverageKey: ['tasks:' + sortIds(check.coverageTasks).join(','), check.coverageClosure ? 'closure' : '', check.coverageGlobal ? 'global' : ''].filter((value) => value !== '').join('|'),
    resources: check.resourceIds.slice()
  }))
  const reviewGroupMap = new Map()
  for (const check of checklist.checks) {
    const group = check.reviewGroups[0]
    if (!reviewGroupMap.has(group)) reviewGroupMap.set(group, [])
    reviewGroupMap.get(group).push(check)
  }
  const reviewGroups = Array.from(reviewGroupMap.keys()).sort(reviewGroupSort).map((group) => {
    const members = reviewGroupMap.get(group)
    return {
      id: group,
      reviewGroup: group,
      checks: members.map((check) => check.id),
      coverage: { tasks: sortIds(members.flatMap((check) => check.coverageTasks)), closure: members.some((check) => check.coverageClosure), global: members.some((check) => check.coverageGlobal) }
    }
  })
  const closure = plan.closure === null ? null : {
    files: plan.closure.closureFiles.slice(),
    dependencies: plan.closure.dependencies.slice(),
    actions: plan.closure.closureActions.slice(),
    selfChecks: plan.closure.selfChecks.slice(),
    resources: plan.closure.resourceIds.slice(),
    checkRefs: checklist.closure === null ? [] : checklist.closure.checkRefs.slice(),
    coverageKey: 'closure'
  }
  const globalAcceptance = checklist.global === null ? null : {
    expectations: checklist.global.expectations.slice(),
    prohibitions: checklist.global.prohibitions.slice(),
    checkRefs: checklist.global.checkRefs.slice(),
    coverageKey: 'global'
  }
  return {
    mode: plan.mode,
    taskCount: plan.tasks.length,
    taskFileCount,
    fileCount,
    closureFileCount: closureFiles.size,
    totalFileCount: fileCount,
    groupCount: groupIds.length,
    reviewGroupCount: reviewGroups.length,
    checkCount: checks.length,
    hasClosure: plan.closure !== null,
    hasGlobalAcceptance: checklist.global !== null,
    tasks,
    groups,
    checks,
    reviewGroups,
    closure,
    globalAcceptance,
    global: globalAcceptance
  }
}

function formatDiagnostic(diagnostic) {
  const document = diagnostic.document || 'plan/checklist'
  const task = diagnostic.taskId === null || diagnostic.taskId === undefined ? '任务全局' : '任务' + diagnostic.taskId
  const value = String(diagnostic.value || '').replace(/[\r\n]+/g, ' ').slice(0, 240)
  return '- ' + document + ' ' + task + ' 字段「' + diagnostic.field + '」值「' + value + '」：' + diagnostic.message + '；最小修复模板：' + diagnostic.template
}

function finalizeFailure(diagnostics) {
  const shown = diagnostics.slice(0, MAX_DIAGNOSTICS)
  const remaining = diagnostics.length - shown.length
  let error = CONTRACT_ERROR_PREFIX + '（共 ' + diagnostics.length + ' 条诊断）：\n' + shown.map(formatDiagnostic).join('\n')
  if (remaining > 0) error += '\n- 其余剩余 ' + remaining + ' 条诊断已省略'
  return { ok: false, diagnostics: shown, diagnosticCount: diagnostics.length, remaining, error }
}

export function validateSavePlanContract(plan, checklist, options) {
  if (plan !== null && typeof plan === 'object' && typeof plan.plan === 'string' && (checklist === undefined || typeof checklist !== 'string')) {
    if (options === undefined && checklist !== undefined && checklist !== null && typeof checklist === 'object') options = checklist
    checklist = plan.checklist
    plan = plan.plan
  }
  const diagnostics = []
  const parsedPlan = parseTaskDocument(plan, 'plan')
  const parsedChecklist = parseTaskDocument(checklist, 'checklist')
  diagnostics.push(...parsedPlan.diagnostics, ...parsedChecklist.diagnostics)
  if (parsedPlan.tasks.length === 0) diagnostics.push(makeDiagnostic('plan', null, '任务块', '', '方案至少需要一个任务块'))
  if (parsedChecklist.tasks.length === 0) diagnostics.push(makeDiagnostic('checklist', null, '任务块', '', '验收至少需要一个任务块'))
  validateIds(parsedPlan.tasks, 'plan', diagnostics, '任务')
  validateIds(parsedChecklist.tasks, 'checklist', diagnostics, '任务')
  if (parsedPlan.mode === 'single' && parsedPlan.tasks.length !== 1) diagnostics.push(makeDiagnostic('plan', null, '执行模式', parsedPlan.mode, 'single 模式必须恰有一个数字任务'))
  if (parsedChecklist.mode === 'single' && parsedChecklist.tasks.length !== 1) diagnostics.push(makeDiagnostic('checklist', null, '执行模式', parsedChecklist.mode, 'single 模式必须恰有一个数字任务'))
  if (parsedPlan.mode === 'batch' && (parsedPlan.tasks.length < 2 || parsedPlan.tasks.length > SAVE_PLAN_LIMITS.maxTasks)) diagnostics.push(makeDiagnostic('plan', null, '执行模式', parsedPlan.tasks.length, 'batch 模式必须有 2 至 ' + SAVE_PLAN_LIMITS.maxTasks + ' 个连续数字任务'))
  if (parsedChecklist.mode === 'batch' && (parsedChecklist.tasks.length < 2 || parsedChecklist.tasks.length > SAVE_PLAN_LIMITS.maxTasks)) diagnostics.push(makeDiagnostic('checklist', null, '执行模式', parsedChecklist.tasks.length, 'batch 模式必须有 2 至 ' + SAVE_PLAN_LIMITS.maxTasks + ' 个连续数字任务'))
  for (const task of parsedPlan.tasks) validateTaskShape(task, 'plan', true, diagnostics, options)
  for (const task of parsedChecklist.tasks) validateTaskShape(task, 'checklist', false, diagnostics, options)
  validatePlanRelations(parsedPlan.tasks, diagnostics, options)
  validateClosure(parsedPlan.closure, 'plan', true, parsedPlan.tasks, diagnostics, options)
  validateClosure(parsedChecklist.closure, 'checklist', false, parsedChecklist.tasks, diagnostics, options)
  validateCrossDocument(parsedPlan, parsedChecklist, diagnostics)
  validateGlobal(parsedChecklist.global, diagnostics)
  validateChecks(parsedChecklist, diagnostics, options)
  if (diagnostics.length > 0) return finalizeFailure(diagnostics)
  const summary = buildSummary(parsedPlan, parsedChecklist)
  const summaryText = formatSavePlanSummary(summary)
  summary.summaryCharCount = summaryText.length
  if (summaryText.length > SAVE_PLAN_LIMITS.maxSummaryChars) {
    diagnostics.push(makeDiagnostic('plan/checklist', null, '派遣摘要', summaryText.length, '确定性派遣摘要超过 ' + SAVE_PLAN_LIMITS.maxSummaryChars + ' 字符上限；请减少任务、检查或正文重复'))
    return finalizeFailure(diagnostics)
  }
  return { ok: true, summary, diagnostics: [] }
}

export const validateSavePlan = validateSavePlanContract
export { parseTaskDocument, CONTRACT_ERROR_PREFIX, pathIssue, parseDependencies, parseResources, parseCheckRefs }
