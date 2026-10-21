import { existsSync, lstatSync, readFileSync, realpathSync, statSync } from 'node:fs'
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path'
import { PROBE_LIMITS, SAVE_PLAN_LIMITS, RANGE_FORMAT_HINT, LINE_FORMAT_HINT, sanitizeTaskName, sessionTagOf, saveArtifactBase, renderSavePlan, renderProbeMarkdown, renderSaveProbe, extractProbeEvidenceRefs } from './save-contract.js'
import { validateProbe, probePathOf } from './save-probe-validation.js'
import { validateSavePlanContract } from './save-plan-validation.js'
import { TextDecoder } from 'node:util'

// 证据错误用 JSON.stringify 展示引用，必要时追加非权威的装饰提示。
// 提示只检查下方诊断字符集的首字符；成对清洗在 save-contract.js，
// 文件名中的单侧装饰保持不变，供存在性校验使用。
const PROBE_REF_DECOR_RE = /^[`*_"'<>[\]()（）「」【】『』，。；：！？、|]/
function probeRefDecorationHint(ref) {
  return PROBE_REF_DECOR_RE.test(ref) ? '（疑似含 Markdown 装饰；引用证据请使用裸路径，每条单独一行）' : ''
}

// 仅读取会话头部工作区，不计算目录、短名或工件 base。
function cwdOf(exec) {
  const session = exec !== undefined && exec !== null && exec.agent !== undefined && exec.agent !== null ? exec.agent.session : undefined
  const header = session !== undefined && session !== null && session.header !== undefined && session.header !== null ? session.header : undefined
  return header !== undefined && typeof header.cwd === 'string' ? header.cwd : ''
}

// 两个工具共享会话/目录/base 构造，但各自保留参数校验与提交形状；失败只由本次调用处理。
function resolveSaveContext(args, exec, savePlanDir, knownCwd) {
  const session = exec !== undefined && exec !== null && exec.agent !== undefined && exec.agent !== null ? exec.agent.session : undefined
  const header = session !== undefined && session !== null && session.header !== undefined && session.header !== null ? session.header : undefined
  const cwd = typeof knownCwd === 'string' ? knownCwd : cwdOf(exec)
  const sessionId = header === undefined ? undefined : header.id
  const sessionTag = sessionTagOf(sessionId)
  const dir = resolve(join(cwd, savePlanDir))
  const nameSeg = sanitizeTaskName(args !== undefined && args !== null && typeof args === 'object' ? args.taskName : undefined)
  const base = saveArtifactBase(nameSeg, sessionId)
  return { cwd, sessionTag, dir, base }
}

const SOURCE_RANGE_RE = /^L([1-9]\d*)(?:-([1-9]\d*))?$/

function canonicalRealpath(value) {
  if (typeof realpathSync.native !== 'function') {
    throw new Error('当前运行时缺少可靠的原生真实路径解析')
  }
  return realpathSync.native(value)
}

const sourceDecoder = new TextDecoder('utf-8', { fatal: true })

function sourceCacheKey(value) {
  const normalized = String(value).replace(/\\/g, '/')
  return process.platform === 'win32' ? normalized.toLowerCase() : normalized
}

function pathInside(root, target) {
  const rest = relative(root, target)
  return rest === '' || (rest !== '..' && !rest.startsWith('..' + sep) && !isAbsolute(rest))
}

function lexicalExists(path) {
  try { lstatSync(path); return true } catch (error) {
    if (error.code === 'ENOENT') return false
    throw error
  }
}

function nearestExistingParent(path) {
  let current = dirname(path)
  for (;;) {
    if (lexicalExists(current)) {
      try { return statSync(current).isDirectory() ? current : null } catch { return null }
    }
    const parent = dirname(current)
    if (parent === current) return null
    current = parent
  }
}

function resolveWorkspaceEntry(root, relativePath, cache) {
  const candidate = resolve(root, relativePath)
  const key = sourceCacheKey(candidate)
  if (cache.has(key)) return cache.get(key)
  if (lexicalExists(candidate)) {
    let stat
    try { stat = statSync(candidate) } catch (error) { throw new Error('无法读取目标路径：' + relativePath + '（' + String(error.message || error) + '）') }
    if (!stat.isFile()) throw new Error('目标路径不是普通文件：' + relativePath)
    let real
    try { real = canonicalRealpath(candidate) } catch (error) { throw new Error('无法解析目标真实路径：' + relativePath + '（' + String(error.message || error) + '）') }
    if (!pathInside(root, real)) throw new Error('目标真实路径越出工作区：' + relativePath)
    let buffer
    try { buffer = readFileSync(real) } catch (error) { throw new Error('无法读取目标文件：' + relativePath + '（' + String(error.message || error) + '）') }
    const entry = { exists: true, path: real, buffer, text: undefined, lines: undefined }
    cache.set(key, entry)
    return entry
  }
  const parent = nearestExistingParent(candidate)
  if (parent === null) throw new Error('目标最近现有父目录不存在：' + relativePath)
  let realParent
  try { realParent = canonicalRealpath(parent) } catch (error) { throw new Error('无法解析目标最近现有父目录：' + relativePath + '（' + String(error.message || error) + '）') }
  if (!pathInside(root, realParent)) throw new Error('目标最近现有父目录越出工作区：' + relativePath)
  const entry = { exists: false, path: resolve(realParent, relative(parent, candidate)), buffer: null, text: undefined, lines: undefined }
  cache.set(key, entry)
  return entry
}

function strictTextEntry(entry, relativePath) {
  if (entry.text !== undefined) return entry
  let text
  try { text = sourceDecoder.decode(entry.buffer) } catch (error) { throw new Error('源文件不是合法 UTF-8：' + relativePath + '（' + String(error.message || error) + '）') }
  if (text.includes('\u0000')) throw new Error('源文件包含 NUL：' + relativePath)
  if (text.startsWith('\uFEFF')) text = text.slice(1)
  text = text.replace(/\r\n?/g, '\n')
  const lines = text === '' ? [] : text.split('\n')
  if (lines.length > 0 && lines[lines.length - 1] === '') lines.pop()
  entry.text = text
  entry.lines = lines
  return entry
}

function literalCount(line, needle) {
  let count = 0
  let from = 0
  for (;;) {
    const index = line.indexOf(needle, from)
    if (index < 0) return count
    count += 1
    from = index + Math.max(needle.length, 1)
  }
}

function verifyModificationPoint(entry, relativePath, point) {
  const location = String(point.modificationLocation || '').trim()
  const anchor = String(point.anchor || '').trim()
  if (location === '空文件' && anchor === '空文件') {
    if (entry.lines.length !== 0) throw new Error('空文件例外要求源文件去 BOM 后为空：' + relativePath)
    return
  }
  const match = location.match(SOURCE_RANGE_RE)
  if (match === null) throw new Error('修改位置格式无效：' + relativePath + '#' + String(point.id || ''))
  const start = Number(match[1])
  const end = match[2] === undefined ? start : Number(match[2])
  if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start < 1 || end < start) throw new Error('修改位置不是安全正整数区间：' + relativePath + '#' + String(point.id || ''))
  if (end > entry.lines.length) throw new Error('修改位置超出源文件实际行数：' + relativePath + '#' + String(point.id || '') + '（上界 ' + end + '，实际 ' + entry.lines.length + '）')
  if (anchor === '' || anchor.includes('\n') || anchor.includes('\r')) throw new Error('定位锚点必须是非空单行原文：' + relativePath + '#' + String(point.id || ''))
  let matches = 0
  for (const line of entry.lines.slice(start - 1, end)) matches += literalCount(line, anchor)
  if (matches !== 1) throw new Error('定位锚点在指定范围内必须恰好匹配一次：' + relativePath + '#' + String(point.id || '') + '（实际 ' + matches + ' 次）')
}

function verifyPlanSources(summary, cwd) {
  let root
  try { root = canonicalRealpath(cwd) } catch (error) { throw new Error('无法解析工作区真实路径（' + String(error.message || error) + '）') }
  const cache = new Map()
  const targetOwners = new Map()
  const verifyFile = (fileRecord) => {
    const operation = String(fileRecord.operation || '')
    const entry = resolveWorkspaceEntry(root, fileRecord.path, cache)
    const targetKey = sourceCacheKey(entry.path)
    const firstPath = targetOwners.get(targetKey)
    if (firstPath !== undefined) throw new Error('多个文件记录指向同一真实目标：' + firstPath + ' 与 ' + fileRecord.path)
    targetOwners.set(targetKey, fileRecord.path)
    if (operation === '新建') {
      if (entry.exists) throw new Error('新建目标已存在：' + fileRecord.path)
      return
    }
    if (operation === '删除' || operation === '修改') {
      if (!entry.exists) throw new Error('目标文件不存在：' + fileRecord.path)
      if (operation === '修改') {
        const textEntry = strictTextEntry(entry, fileRecord.path)
        for (const point of fileRecord.points || []) verifyModificationPoint(textEntry, fileRecord.path, point)
      }
      return
    }
    if (operation === '生成') {
      for (const point of fileRecord.points || []) {
        for (const source of point.generationSources || []) {
          const sourceEntry = resolveWorkspaceEntry(root, source, cache)
          if (!sourceEntry.exists) throw new Error('生成来源文件不存在：' + source)
        }
      }
    }
  }
  for (const task of summary.tasks || []) for (const fileRecord of task.fileRecords || []) verifyFile(fileRecord)
  if (summary.closure !== null && summary.closure !== undefined) for (const fileRecord of summary.closure.fileRecords || []) verifyFile(fileRecord)
  return { root, cache }
}

function verifyProbeEvidenceRef(cwd, reference, sourceState) {
  const resolved = probePathOf(cwd, reference)
  if (!existsSync(resolved)) throw new Error('save_plan: 【探查者已核实】证据文件不存在：' + JSON.stringify(reference) + probeRefDecorationHint(reference))
  const key = sourceCacheKey(resolve(resolved))
  let buffer
  const cached = sourceState.cache.get(key)
  if (cached !== undefined && cached.buffer !== null) buffer = cached.buffer
  else {
    try { buffer = readFileSync(resolved) } catch (error) { throw new Error('save_plan: 【探查者已核实】证据文件无法读取：' + JSON.stringify(reference) + '（' + String(error.message || error) + '）') }
    sourceState.cache.set(key, { exists: true, path: resolved, buffer, text: undefined, lines: undefined })
  }
  const head = buffer.toString('utf8').slice(0, 200)
  if (!head.includes('探查证据报告')) throw new Error('save_plan: 【探查者已核实】证据文件非探查者落盘（缺「探查证据报告」标题）：' + JSON.stringify(reference))
}

// save_plan/save_probe 工具定义只捕获显式目录与持久化依赖，不持有宿主会话状态。
export function createSaveToolFactories({ savePlanDir, atomicCommit }) {
  function defineSavePlan() {
    return {
      name: 'save_plan',
       description: '严格写入方案和验收清单，生成供执行者与验收者使用的自包含、受限工件；只校验并双写工件，不启动代理、不执行检查命令或其他任务，成功 structured output 仅含 paths',
      parameters: {
        type: 'object',
        properties: {
          plan: { type: 'string', description: "严格方案全文（至少 200 字符）。结构字段必须列首书写；下列示例路径、旧位置、锚点和动作必须替换为已读取的真实内容。\n卷首：\n- 执行模式：single\n- 派遣说明：各组领取范围、依赖交付和自检约定\n任务最小格式：\n[任务1] 标题\n- 主文件：src/example.js\n- 文件操作：修改\n- 修改点：M1\n- 修改位置：L12-34\n- 定位锚点：function example()\n- 修改：具体删改动作\n- 执行组：G1\n- 依赖：无\n- 依赖理由：无\n- 分组理由：无\n- 自检：有限检查动作\n同一文件可重复修改点，但M编号唯一；每点都要位置、锚点和动作。关联文件另起 - 关联文件：src/helper.js，紧接该文件的操作/M点/定位/动作，不能借用主文件的点。位置只接受L12或L12-34，锚点是范围内恰好出现一次的单行原文。路径是裸工作区相对文件路径，不拼行号。\nsingle恰一数字任务；batch为2至" + SAVE_PLAN_LIMITS.maxTasks + "个任务。任务ID从1连续递增。依赖可写无或[任务1]、[任务2]；无依赖的依赖理由写无，有依赖须解释真实先后关系。任务及执行组依赖不得成环。不同任务不得重复修改同一文件；关联文件须说明不可安全拆分的分组理由；同组多任务理由相同且非无。可选 - 独占资源：稳定标识，同资源任务必须同组。\n操作例外：新建、删除、生成每文件恰一M点，不填旧位置/锚点，仍须 - 修改：具体动作。新建要求目标不存在并说明内容结构；删除须写整文件删除、理由、引用清理。生成须逐项 - 生成来源：现有工作区文件、恰一 - 生成命令：命令声明，并在修改中说明产物，可另列 - 生成产物：说明；工具不执行命令。真正空文件仍用修改操作，唯一M点的 - 修改位置：空文件 与 - 定位锚点：空文件。\n可选收尾位于全部任务后：[收尾]；带文件时先写 - 收尾文件：docs/summary.md，再写该文件的操作/M点/必要定位字段，用 - 收尾动作：具体动作 代替修改。随后必须 - 收尾依赖：[任务1]、[任务2]（恰好列全所有数字任务）、- 自检：有限检查；无文件收尾只写收尾依赖、收尾动作、自检。收尾文件不得与数字任务文件重叠。\n若引用探查报告，使用【探查者已核实】并写已核实结论及证据来源裸路径；报告只是事实来源，不能代替本方案内完整步骤和验收规则，不得保留待定设计。" },
          checklist: { type: 'string', description: "严格验收全文（至少 200 字符）。结构字段列首书写；任务ID、文件角色/路径、文件操作及M点集合与方案精确对应。卷首：\n- 执行模式：single\n- 验收说明：指定检查分工、取证和判定规则\n任务最小格式：\n[任务1] 标题\n- 主文件：src/example.js\n- 文件操作：修改\n- 对应修改点：M1\n- 验收定位：example修改后的符号、结构或行为条件\n- 期望：该点客观可验证的结果\n- 禁止：明确边界\n- 正式验收：[检查1]\n每个关联文件另起 - 关联文件：路径，随后独立声明操作、对应修改点、验收定位、期望。每个M点恰一验收定位、至少一期望。验收定位不写旧行号或同方案/同上/纯M编号；未来符号保存时不必已经存在。新建/生成可验文件存在及内容结构，删除验文件不存在与引用清理。每个任务恰一条正式验收字段，允许同条引用[检查1]、[检查2]。\n全部数字任务后可写[收尾]：带文件时先 - 收尾文件：路径，再按任务格式写文件操作、对应修改点、验收定位、期望；随后 - 禁止：边界、- 正式验收：[检查1]。无文件收尾仅写期望、禁止、正式验收。\n任务与可选收尾后定义检查，至少一个，ID从1连续递增：\n[检查1] 标题\n- 验收组：R1\n- 取证方式：只读复核\n- 工作目录：.\n- 检查：具体核对动作\n- 验收证据：原始结果及客观通过/失败标准\n取证方式也可写执行取证；工作目录为.或裸工作区相对目录。可选 - 独占资源：稳定标识，同资源检查必须同验收组。所有检查必须被任务/收尾/全局引用；相同取证方式、工作目录、检查动作不得用不同ID重复定义，应复用同一检查。\n最后可写：\n[全局验收]\n- 期望：全局客观结果\n- 禁止：全局边界\n- 正式验收：[检查1]、[检查2]\n两份正文模式相同；路径裸写且不拼行号。所有步骤、期望和判定规则必须在本正文中完整，不要求下游从父会话、摘要或其它方案补全。" },
          taskName: { type: 'string', description: `可选任务短名（最多 ${PROBE_LIMITS.maxTaskNameLen} 字；不要传路径）` },
        },
        required: ['plan', 'checklist'],
        additionalProperties: false,
      },
      output: {
        schema: {
          type: 'object',
          properties: { paths: { type: 'array', items: { type: 'string' } } },
          required: ['paths'],
          additionalProperties: false,
        },
        render(args, value) {
          let summary
          if (args !== null && typeof args === 'object') {
            const checked = validateSavePlanContract(args.plan, args.checklist)
            if (checked.ok) summary = checked.summary
          }
          return renderSavePlan(value, summary)
        },
      },
      timeoutMs: 30000,
      async execute(args, exec) {
        if (args === null || typeof args !== 'object' || typeof args.plan !== 'string' || args.plan.length < 200 || typeof args.checklist !== 'string' || args.checklist.length < 200) {
          throw new Error('save_plan: plan/checklist 参数缺失或内容过短（未收到合法参数；调用参数须为合法 JSON，请检查后重试）')
        }
        const plan = args.plan
        if (/【未探查·待确认】/.test(plan) || /待确认假设清单/.test(plan)) {
          throw new Error('save_plan: 方案中包含【未探查·待确认】步骤或「待确认假设清单」。请先申请追加预算继续探查，确认所有项均已探查核实后再调用 save_plan')
        }
        const contract = validateSavePlanContract(plan, args.checklist)
        if (!contract.ok) throw new Error(contract.error)
        // 合同通过后只读取一次 cwd；真实源核实、证据核实均在 base/目录/atomic 前完成。
        const cwd = cwdOf(exec)
        if (cwd === '') throw new Error('save_plan: 会话缺少工作区路径，无法落盘')
        let sourceState
        try {
          sourceState = verifyPlanSources(contract.summary, cwd)
        } catch (error) {
          throw new Error('save_plan: 源核实失败：' + (error instanceof Error ? error.message : String(error)))
        }
        // 【探查者已核实】证据校验：方案中标注引用的证据文件必须真实存在、且为探查者
        // save_probe 落盘的证据报告（标题含「探查证据报告」），杜绝编造证据引用。
        for (const ref of extractProbeEvidenceRefs(plan)) verifyProbeEvidenceRef(cwd, ref, sourceState)
        // T3：base 内嵌调用方会话标识段（主会话与规划子代理同秒落盘不再撞名）。
        const context = resolveSaveContext(args, exec, savePlanDir, cwd)
        const { sessionTag, dir, base } = context
        if (sessionTag === '') throw new Error('save_plan: 会话缺少有效标识，无法隔离落盘事务')
        const planFile = join(dir, `方案-${base}.md`)
        const checkFile = join(dir, `验收-${base}.md`)
        try {
          atomicCommit(dir, base, [
            { name: `方案-${base}.md`, content: args.plan },
            { name: `验收-${base}.md`, content: args.checklist },
          ])
        } catch (error) {
          throw new Error(`save_plan: 落盘失败：${error instanceof Error ? error.message : String(error)}`)
        }
        return { paths: [planFile, checkFile] }
      },
    }
  }

  function defineSaveProbe() {
    return {
      name: 'save_probe',
       description: '写入只读探查结果。fileMap、focusAreas、exclusions、background 四个数组必填，按 JSON 序列化计总量最多 20000 字；evidence 可选，非空时生成证据报告，否则生成线索文件。字段格式和单项上限见参数说明；返回文件路径。',
      parameters: {
        type: 'object',
        properties: {
          fileMap: {
            type: 'array',
             description: `相关文件列表（最多 ${PROBE_LIMITS.maxEntries.fileMap} 项）`,
            items: {
              type: 'object',
              properties: {
                 path: { type: 'string', description: `现有文件路径（相对路径按工作区解析，最多 ${PROBE_LIMITS.maxPathLen} 字）` },
                 relation: { type: 'string', description: `文件与任务的关系（最多 ${PROBE_LIMITS.maxRelationLen} 字）` },
              },
              required: ['path', 'relation'],
              additionalProperties: false,
            },
          },
          focusAreas: {
            type: 'array',
             description: `重点区域列表（最多 ${PROBE_LIMITS.maxEntries.focusAreas} 项）`,
            items: {
              type: 'object',
              properties: {
                 path: { type: 'string', description: `现有文件路径（相对路径按工作区解析，最多 ${PROBE_LIMITS.maxPathLen} 字）` },
                 range: { type: 'string', description: `可选行号范围（最多 ${PROBE_LIMITS.maxRangeLen} 字）${RANGE_FORMAT_HINT}` },
                 note: { type: 'string', description: `重点和补查方向（最多 ${PROBE_LIMITS.maxNoteLen} 字）` },
              },
              required: ['path', 'note'],
              additionalProperties: false,
            },
          },
          exclusions: {
            type: 'array',
             description: `排除项列表（最多 ${PROBE_LIMITS.maxEntries.exclusions} 项；scope 可为概念边界，无须对应现有路径）`,
            items: {
              type: 'object',
              properties: {
                 scope: { type: 'string', description: '可选排除范围' },
                 note: { type: 'string', description: `排除原因（最多 ${PROBE_LIMITS.maxNoteLen} 字）` },
              },
              required: ['note'],
              additionalProperties: false,
            },
          },
          background: {
            type: 'array',
             description: `背景与意图列表（最多 ${PROBE_LIMITS.maxEntries.background} 项）`,
            items: {
              type: 'object',
              properties: {
                 topic: { type: 'string', description: `背景主题（最多 ${PROBE_LIMITS.maxTopicLen} 字）` },
                 detail: { type: 'string', description: `背景或用户意图（最多 ${PROBE_LIMITS.maxDetailLen} 字）` },
              },
              required: ['topic', 'detail'],
              additionalProperties: false,
            },
          },
          evidence: {
            type: 'array',
             description: `可选证据列表（最多 ${PROBE_LIMITS.maxEvidenceEntries} 项，按 JSON 序列化计总量最多 ${PROBE_LIMITS.maxEvidenceTotalChars} 字）；非空时生成证据报告。每项 path 必须存在，并至少填写 line、value、text 之一。`,
            items: {
              type: 'object',
              properties: {
                 path: { type: 'string', description: `现有被核实文件路径（相对路径按工作区解析，最多 ${PROBE_LIMITS.maxPathLen} 字）` },
                 line: { type: 'string', description: `可选行号（最多 ${PROBE_LIMITS.maxEvidenceLineLen} 字）；${LINE_FORMAT_HINT}` },
                 value: { type: 'string', description: `可选核实值（最多 ${PROBE_LIMITS.maxEvidenceValueLen} 字）` },
                 text: { type: 'string', description: `可选原文摘录（最多 ${PROBE_LIMITS.maxEvidenceTextLen} 字）` },
                 note: { type: 'string', description: `可选备注（最多 ${PROBE_LIMITS.maxEvidenceNoteLen} 字）` },
              },
              required: ['path'],
              additionalProperties: false,
            },
          },
           taskName: { type: 'string', description: `可选任务短名（最多 ${PROBE_LIMITS.maxTaskNameLen} 字；不要传路径）` },
        },
        required: ['fileMap', 'focusAreas', 'exclusions', 'background'],
        additionalProperties: false,
      },
      output: {
        schema: {
          type: 'object',
          properties: { path: { type: 'string' } },
          required: ['path'],
          additionalProperties: false,
        },
        render(args, value) {
          return renderSaveProbe(value, Array.isArray(args.evidence) && args.evidence.length > 0)
        },
      },
      timeoutMs: 30000,
      async execute(args, exec) {
        // 先仅读取 cwd 并完成全部参数/路径校验，避免非法调用消耗工件 base 序号。
        const probeCwd = cwdOf(exec)
        const invalid = validateProbe(args, probeCwd)
        if (invalid !== null) throw new Error(invalid)
        const context = resolveSaveContext(args, exec, savePlanDir)
        const { cwd, sessionTag, dir, base } = context
        if (cwd === '') throw new Error('save_probe: 会话缺少工作区路径，无法落盘')
        if (sessionTag === '') throw new Error('save_probe: 会话缺少有效标识，无法隔离落盘事务')
        const fileName = `线索-${base}.md`
        try {
          atomicCommit(dir, base, [{ name: fileName, content: renderProbeMarkdown(args) }])
        } catch (error) {
          throw new Error(`save_probe: 落盘失败：${error instanceof Error ? error.message : String(error)}`)
        }
        return { path: join(dir, fileName) }
      },
    }
  }

  return { defineSavePlan, defineSaveProbe }
}
