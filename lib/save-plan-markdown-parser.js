import { makeDiagnostic } from './save-plan-validation-diagnostics.js'

const TASK_HEADING_RE = /^\[任务([1-9]\d*)\][ \t]+(.+?)\s*$/
const TASK_CANDIDATE_RE = /^\[任务([^\]]*)\]/
const CHECK_HEADING_RE = /^\[检查([1-9]\d*)\][ \t]+(.+?)\s*$/
const CHECK_CANDIDATE_RE = /^\[检查([^\]]*)\]/
const CLOSURE_HEADING_RE = /^\[收尾\][ \t]*$/
const GLOBAL_HEADING_RE = /^\[全局验收\][ \t]*$/
const CLOSURE_CANDIDATE_RE = /^\[收尾/
const GLOBAL_CANDIDATE_RE = /^\[全局验收/

const DISPATCH_PREFIX = '- 派遣说明：'
const REVIEW_PREFIX = '- 验收说明：'

const PLAN_FIELDS_BY_KIND = new Map([
  ['task', new Set(['mainFiles', 'relatedFiles', 'fileOperations', 'modificationPoints', 'modificationLocations', 'anchors', 'generationSources', 'generationCommands', 'generationOutputs', 'groups', 'dependencyFields', 'dependencyReasons', 'groupReasons', 'modifications', 'selfChecks', 'resources'])],
  ['closure', new Set(['closureFiles', 'fileOperations', 'modificationPoints', 'modificationLocations', 'anchors', 'generationSources', 'generationCommands', 'generationOutputs', 'closureDependencies', 'closureActions', 'selfChecks', 'resources'])],
])
const CHECKLIST_FIELDS_BY_KIND = new Map([
  ['task', new Set(['mainFiles', 'relatedFiles', 'fileOperations', 'acceptancePointRefs', 'acceptanceLocations', 'expectations', 'prohibitions', 'formalAcceptance'])],
  ['closure', new Set(['closureFiles', 'fileOperations', 'acceptancePointRefs', 'acceptanceLocations', 'expectations', 'prohibitions', 'formalAcceptance'])],
  ['check', new Set(['reviewGroups', 'evidenceModes', 'workdirs', 'checks', 'evidence', 'resources'])],
  ['global', new Set(['expectations', 'prohibitions', 'formalAcceptance'])],
])
const EMPTY_STRUCTURAL_FIELDS = new Set()

const FIELD_DEFINITIONS = Object.freeze([
  ['mainFiles', '主文件', '- 主文件：'],
  ['relatedFiles', '关联文件', '- 关联文件：'],
  ['fileOperations', '文件操作', '- 文件操作：'],
  ['modificationPoints', '修改点', '- 修改点：'],
  ['modificationLocations', '修改位置', '- 修改位置：'],
  ['anchors', '定位锚点', '- 定位锚点：'],
  ['generationSources', '生成来源', '- 生成来源：'],
  ['generationCommands', '生成命令', '- 生成命令：'],
  ['generationOutputs', '生成产物', '- 生成产物：'],
  ['acceptancePointRefs', '对应修改点', '- 对应修改点：'],
  ['acceptanceLocations', '验收定位', '- 验收定位：'],
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

function newFileRecord(path, role) {
  return { path, role, operations: [], points: [], currentPoint: null }
}

function newTask(id, title, line) {
  return {
    kind: 'task', id, title, line,
    mainFiles: [], relatedFiles: [], files: [], currentFile: null,
    groups: [], dependencyFields: [], dependencyReasons: [],
    groupReasons: [], modifications: [], selfChecks: [], resources: [], expectations: [],
    prohibitions: [], formalAcceptance: [], checkRefs: [], dependencies: [], resourceIds: [],
    fileOperations: [], modificationPoints: [], modificationLocations: [], anchors: [],
    generationSources: [], generationCommands: [], generationOutputs: [],
    acceptancePointRefs: [], acceptanceLocations: [],
    fileSet: new Set(), fileKeys: new Set()
  }
}

function newClosure(line) {
  return {
    kind: 'closure', line, closureFiles: [], files: [], currentFile: null,
    closureDependencies: [], closureActions: [],
    selfChecks: [], resources: [], expectations: [], prohibitions: [], formalAcceptance: [],
    checkRefs: [], dependencies: [], resourceIds: [],
    fileOperations: [], modificationPoints: [], modificationLocations: [], anchors: [],
    generationSources: [], generationCommands: [], generationOutputs: [],
    acceptancePointRefs: [], acceptanceLocations: [],
    fileSet: new Set(), fileKeys: new Set()
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

function normalizeText(text) {
  return typeof text === 'string' ? text.replace(/\r\n?/g, '\n') : ''
}

function fieldOf(line) {
  for (const [key, label, prefix] of FIELD_DEFINITIONS) {
    if (line.startsWith(prefix)) return { key, label, value: line.slice(prefix.length).trim() }
  }
  return null
}

const FILE_PATH_FIELD_KEYS = new Set(['mainFiles', 'relatedFiles', 'closureFiles'])
const POINT_FIELD_KEYS = new Set(['modificationLocations', 'anchors', 'generationSources', 'generationCommands', 'generationOutputs', 'acceptanceLocations'])

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

  const pushField = (owner, field) => {
    owner[field.key].push(field.value)
    const emptyDiagnostic = pushEmptyFieldDiagnostic(document, owner, field)
    if (emptyDiagnostic !== undefined) diagnostics.push(emptyDiagnostic)
  }

  const requireFile = (field) => {
    if (current.currentFile !== null) return current.currentFile
    diagnostics.push(makeDiagnostic(document, current.kind === 'task' ? current.id : null, field.label, field.value, '文件级字段必须紧跟在主文件、关联文件或收尾文件之后'))
    return null
  }

  const requirePoint = (field) => {
    const file = requireFile(field)
    if (file === null) return null
    if (file.currentPoint !== null) return file.currentPoint
    diagnostics.push(makeDiagnostic(document, current.kind === 'task' ? current.id : null, field.label, field.value, '定位字段必须先声明对应的修改点或验收对应修改点'))
    return null
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
    const allowed = (isPlan ? PLAN_FIELDS_BY_KIND : CHECKLIST_FIELDS_BY_KIND).get(current.kind) ?? EMPTY_STRUCTURAL_FIELDS
    if (!allowed.has(field.key)) {
      const taskId = current.kind === 'task' ? current.id : null
      diagnostics.push(makeDiagnostic(document, taskId, field.label, field.value, '字段出现在错误结构块或职责位置'))
      continue
    }

    if (FILE_PATH_FIELD_KEYS.has(field.key)) {
      pushField(current, field)
      const role = field.key === 'mainFiles' ? 'main' : field.key === 'relatedFiles' ? 'related' : 'closure'
      const file = newFileRecord(field.value, role)
      current.files.push(file)
      current.currentFile = file
      continue
    }
    if (field.key === 'fileOperations') {
      pushField(current, field)
      const file = requireFile(field)
      if (file !== null) file.operations.push(field.value)
      continue
    }
    if (isPlan && field.key === 'modificationPoints') {
      pushField(current, field)
      const file = requireFile(field)
      if (file !== null) {
        const point = { id: field.value, locations: [], anchors: [], actions: [], sources: [], commands: [], outputs: [] }
        file.points.push(point)
        file.currentPoint = point
      }
      continue
    }
    if (!isPlan && field.key === 'acceptancePointRefs') {
      pushField(current, field)
      const file = requireFile(field)
      if (file !== null) {
        const point = { id: field.value, locations: [], expectations: [] }
        file.points.push(point)
        file.currentPoint = point
      }
      continue
    }
    if (POINT_FIELD_KEYS.has(field.key)) {
      pushField(current, field)
      const point = requirePoint(field)
      if (point !== null) {
        if (field.key === 'modificationLocations' || field.key === 'acceptanceLocations') point.locations.push(field.value)
        else if (field.key === 'anchors') point.anchors.push(field.value)
        else if (field.key === 'generationSources') point.sources.push(field.value)
        else if (field.key === 'generationCommands') point.commands.push(field.value)
        else if (field.key === 'generationOutputs') point.outputs.push(field.value)
      }
      continue
    }
    if (field.key === 'modifications') {
      pushField(current, field)
      const point = requirePoint(field)
      if (point !== null) point.actions.push(field.value)
      continue
    }
    if (field.key === 'closureActions') {
      pushField(current, field)
      if (current.kind === 'closure' && current.currentFile !== null) {
        const point = requirePoint(field)
        if (point !== null) point.actions.push(field.value)
      }
      continue
    }
    if (field.key === 'expectations') {
      pushField(current, field)
      if (!isPlan && (current.kind === 'task' || current.kind === 'closure') && current.currentFile !== null) {
        const point = requirePoint(field)
        if (point !== null) point.expectations.push(field.value)
      }
      continue
    }
    pushField(current, field)
  }
  flush()

  const instruction = instructionEntries.length === 1 ? instructionEntries[0].value : null
  const instructionLabel = isPlan ? '派遣说明' : '验收说明'
  if (instructionEntries.length === 0) diagnostics.push(makeDiagnostic(document, null, instructionLabel, '', '卷首必须声明且只声明一次说明'))
  if (instructionEntries.length > 1) diagnostics.push(makeDiagnostic(document, null, instructionLabel, instructionEntries.map((item) => item.value).join('、'), instructionLabel + '不得重复'))

  return { document, isPlan, instruction, tasks, closure, checks, global, diagnostics }
}

export { parseTaskDocument }
