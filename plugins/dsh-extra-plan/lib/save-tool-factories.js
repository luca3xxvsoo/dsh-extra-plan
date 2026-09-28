import { existsSync, readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { PROBE_LIMITS, RANGE_FORMAT_HINT, LINE_FORMAT_HINT, sanitizeTaskName, sessionTagOf, saveArtifactBase, renderSavePlan, renderProbeMarkdown, renderSaveProbe, extractProbeEvidenceRefs } from './save-contract.js'
import { validateProbe, probePathOf } from './save-probe-validation.js'

// 证据引用报错呈现：装饰字符（反引号/引号/括号/中文标点）在裸插值下不可见，故 ref
// 一律以 JSON.stringify 呈现；首字符属装饰集时再追加提示（工具侧诊断文本，非界面文案）。
// 该提示**可达**、会真实触发：在「证据文件不存在」报错路径上，抛出前调用
// probeRefDecorationHint（本文件唯一的调用点；「非探查者落盘」路径不拼接该提示，与实机
// 判据 A36 的「第一条追加」口径一致）。判定条件 = ref 首字符落在下方 PROBE_REF_DECOR_RE
// 的装饰集内——该集合**含 `_` 与半/全角括号**。剥除实现只对**成对包裹**生效、单侧一律
// 不剥，故 `_private.md`、`(abc).md` 这类**合法文件名**会被原样保留，其首字符仍落在
// 集合内：这类名字在文件不存在时会收到提示，属**可接受的轻微误报**（提示仅为诊断文本、
// 不影响判定；A36 亦以「首字符属装饰集」为期望口径）。
const PROBE_REF_DECOR_RE = /^[`*_"'<>[\]()（）「」【】『』，。；：！？、|]/
function probeRefDecorationHint(ref) {
  return PROBE_REF_DECOR_RE.test(ref) ? '（疑似含 Markdown 装饰；引用证据请使用裸路径，每条单独一行）' : ''
}

// save_plan/save_probe 工具定义只捕获显式目录与持久化依赖，不持有宿主会话状态。
export function createSaveToolFactories({ savePlanDir, atomicCommit, recoverJournals }) {
  function defineSavePlan() {
    return {
      name: 'save_plan',
      description: '写入规划方案和验收清单（plan、checklist 必填）。plan 不得含「【未探查·待确认】」或「待确认假设清单」；【探查者已核实】步骤须写「证据：<路径>」，该路径必须指向标题含「探查证据报告」的现有文件。返回两个文件路径。',
      parameters: {
        type: 'object',
        properties: {
          plan: { type: 'string', description: '规划方案全文（Markdown，至少 200 字；所有假设必须已确认）' },
          checklist: { type: 'string', description: '验收清单全文（Markdown，至少 200 字；每条须有任务编号并可机械核对）' },
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
          return renderSavePlan(value)
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
        const session = exec.agent !== undefined && exec.agent !== null ? exec.agent.session : undefined
        const cwd = session !== undefined && session !== null && session.header !== undefined && typeof session.header.cwd === 'string' ? session.header.cwd : ''
        if (cwd === '') throw new Error('save_plan: 会话缺少工作区路径，无法落盘')
        // 【探查者已核实】证据校验：方案中标注引用的证据文件必须真实存在、且为探查者
        // save_probe 落盘的证据报告（标题含「探查证据报告」），杜绝编造证据引用。
        for (const ref of extractProbeEvidenceRefs(plan)) {
          const resolved = probePathOf(cwd, ref)
          if (!existsSync(resolved)) throw new Error(`save_plan: 【探查者已核实】证据文件不存在：${JSON.stringify(ref)}${probeRefDecorationHint(ref)}`)
          const head = readFileSync(resolved, 'utf8').slice(0, 200)
          if (!head.includes('探查证据报告')) throw new Error(`save_plan: 【探查者已核实】证据文件非探查者落盘（缺「探查证据报告」标题）：${JSON.stringify(ref)}`)
        }
        const dir = resolve(join(cwd, savePlanDir))
        const nameSeg = sanitizeTaskName(args.taskName)
        // T3：base 内嵌调用方会话标识段（主会话与规划子代理同秒落盘不再撞名）；
        // journal 恢复按同一标识过滤（跨角色互恢复防护）。
        const sessionId = session.header.id
        const sessionTag = sessionTagOf(sessionId)
        if (sessionTag === '') throw new Error('save_plan: 会话缺少有效标识，无法隔离落盘事务')
        const base = saveArtifactBase(nameSeg, sessionId)
        const planFile = join(dir, `方案-${base}.md`)
        const checkFile = join(dir, `验收-${base}.md`)
        recoverJournals(dir, sessionTag)
        try {
          atomicCommit(dir, base, [
            { name: `方案-${base}.md`, content: args.plan },
            { name: `验收-${base}.md`, content: args.checklist },
          ], sessionTag)
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
        const session = exec.agent !== undefined && exec.agent !== null ? exec.agent.session : undefined
        const cwd = session !== undefined && session !== null && session.header !== undefined && typeof session.header.cwd === 'string' ? session.header.cwd : ''
        const invalid = validateProbe(args, cwd)
        if (invalid !== null) throw new Error(invalid)
        if (cwd === '') throw new Error('save_probe: 会话缺少工作区路径，无法落盘')
        const sessionId = session !== undefined && session.header !== undefined ? session.header.id : undefined
        const sessionTag = sessionTagOf(sessionId)
        if (sessionTag === '') throw new Error('save_probe: 会话缺少有效标识，无法隔离落盘事务')
        const dir = resolve(join(cwd, savePlanDir))
        const nameSeg = sanitizeTaskName(args.taskName)
        const base = saveArtifactBase(nameSeg, sessionId)
        recoverJournals(dir, sessionTag)
        const fileName = `线索-${base}.md`
        try {
          atomicCommit(dir, base, [{ name: fileName, content: renderProbeMarkdown(args) }], sessionTag)
        } catch (error) {
          throw new Error(`save_probe: 落盘失败：${error instanceof Error ? error.message : String(error)}`)
        }
        return { path: join(dir, fileName) }
      },
    }
  }

  return { defineSavePlan, defineSaveProbe }
}
