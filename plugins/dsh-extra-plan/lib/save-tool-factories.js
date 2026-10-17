import { existsSync, readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { PROBE_LIMITS, SAVE_PLAN_LIMITS, RANGE_FORMAT_HINT, LINE_FORMAT_HINT, sanitizeTaskName, sessionTagOf, saveArtifactBase, renderSavePlan, renderProbeMarkdown, renderSaveProbe, extractProbeEvidenceRefs } from './save-contract.js'
import { validateProbe, probePathOf } from './save-probe-validation.js'
import { validateSavePlanContract } from './save-plan-validation.js'

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
function resolveSaveContext(args, exec, savePlanDir) {
  const session = exec !== undefined && exec !== null && exec.agent !== undefined && exec.agent !== null ? exec.agent.session : undefined
  const header = session !== undefined && session !== null && session.header !== undefined && session.header !== null ? session.header : undefined
  const cwd = cwdOf(exec)
  const sessionId = header === undefined ? undefined : header.id
  const sessionTag = sessionTagOf(sessionId)
  const dir = resolve(join(cwd, savePlanDir))
  const nameSeg = sanitizeTaskName(args !== undefined && args !== null && typeof args === 'object' ? args.taskName : undefined)
  const base = saveArtifactBase(nameSeg, sessionId)
  return { cwd, sessionTag, dir, base }
}

// save_plan/save_probe 工具定义只捕获显式目录与持久化依赖，不持有宿主会话状态。
export function createSaveToolFactories({ savePlanDir, atomicCommit }) {
  function defineSavePlan() {
    return {
      name: 'save_plan',
      description: '严格写入方案和验收清单，形成供执行者与验收者逐项机械执行和核对的自包含工件。方案必须完整写明任务文件、修改动作、依赖顺序和有限自检；验收清单必须完整写明客观期望、禁止项、检查动作和证据标准。正文可依据已落盘线索继续核实，并可引用已核实的探查证据报告；引用时必须写明已核实结论和证据路径。线索与证据仅作为事实来源和追溯依据，不得替代正文中的执行步骤、验收标准或判定规则，也不得要求下游从父会话上下文、工具返回摘要或其他方案/验收文件补全这些内容。不得保留待定设计选择，使下游无需重新规划或自行补全规则。两份正文须声明相同的 single 或 batch 模式，并按任务、可选收尾和 checklist 检查合同组织；具体格式见 plan/checklist 参数说明。工具仅校验并双写工件，不启动代理、不执行检查命令或其他任务；成功 structured output 仅含 paths',
      parameters: {
        type: 'object',
        properties: {
          plan: { type: 'string', description: '严格方案全文（至少 200 字符）。卷首列首写 - 执行模式：single 或 batch、- 派遣说明：非空；single 最小任务块为 [任务1] 标题、- 主文件：plugins/example/file.js、- 执行组：G1、- 依赖：无、- 依赖理由：无、- 分组理由：无、- 修改：具体动作、- 自检：有限检查。可重复 - 关联文件：、- 修改：、- 自检：；最多 ' + SAVE_PLAN_LIMITS.maxTasks + ' 个数字任务，可选 [收尾]。路径必须是裸工作区相对路径。' },
          checklist: { type: 'string', description: '严格验收全文（至少 200 字符）。卷首列首写 - 执行模式：同值、- 验收说明：非空；每个同ID任务含主/关联文件、至少一条 - 期望：与 - 禁止：、恰一条 - 正式验收：[检查1]；随后定义 [检查N] 标题及 - 验收组：R1、- 取证方式：只读复核或执行取证、- 工作目录：.、- 检查：、- 验收证据：。可选 [收尾] 与最后 [全局验收]。' },
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
        const context = resolveSaveContext(args, exec, savePlanDir)
        const { cwd, sessionTag, dir, base } = context
        if (cwd === '') throw new Error('save_plan: 会话缺少工作区路径，无法落盘')
        // 【探查者已核实】证据校验：方案中标注引用的证据文件必须真实存在、且为探查者
        // save_probe 落盘的证据报告（标题含「探查证据报告」），杜绝编造证据引用。
        for (const ref of extractProbeEvidenceRefs(plan)) {
          const resolved = probePathOf(cwd, ref)
          if (!existsSync(resolved)) throw new Error(`save_plan: 【探查者已核实】证据文件不存在：${JSON.stringify(ref)}${probeRefDecorationHint(ref)}`)
          const head = readFileSync(resolved, 'utf8').slice(0, 200)
          if (!head.includes('探查证据报告')) throw new Error(`save_plan: 【探查者已核实】证据文件非探查者落盘（缺「探查证据报告」标题）：${JSON.stringify(ref)}`)
        }
        // T3：base 内嵌调用方会话标识段（主会话与规划子代理同秒落盘不再撞名）。
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
