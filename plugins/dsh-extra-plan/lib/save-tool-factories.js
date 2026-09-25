import { existsSync, readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { PROBE_LIMITS, RANGE_FORMAT_HINT, LINE_FORMAT_HINT, sanitizeTaskName, timestamp, sessionTagOf, savePlanBase, renderSavePlan, renderProbeMarkdown, renderSaveProbe, extractProbeEvidenceRefs } from './save-contract.js'
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
      description: '落盘规划方案与验收标准清单（原子双写，两个文件必填）。存在未探查项时禁止调用。不得编造内容、数值或行号。【探查者已核实】步骤须注明证据来源文件路径（探查者 save_probe 落盘的证据报告），插件将校验文件存在且为证据报告。返回文件路径',
      parameters: {
        type: 'object',
        properties: {
          plan: { type: 'string', description: '规划方案全文（含假设时须全部已确认，Markdown）' },
          checklist: { type: 'string', description: '验收标准清单全文（逐条机械可核对、每条带对应任务编号，Markdown）' },
          taskName: { type: 'string', description: `可选任务短名（≤${PROBE_LIMITS.maxTaskNameLen} 字；插件会净化，勿传路径）` },
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
        const base = savePlanBase(nameSeg, sessionId)
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
      description: `把只读探查结果经 save_probe 落盘为工作区 .extra-plan 目录下的单个 Markdown 文件：四类定位线索——文件地图（fileMap）/ 重点区域（focusAreas）/ 排除项（exclusions）/ 背景与意图（background），可选证据数组（evidence：探查者把核实过的行号/数值/文案照实写入；主会话线索模式可不传）。主会话线索模式只写定位线索（路径/范围/关系/备注），不含证据（行号/数值/文案摘录）——pro 规划子代理（subagent_plan）不得把线索文件内容当作【已探查核实】证据；探查子代理传 evidence 时落盘为证据报告（行号/数值/文案照实记录，可被规划子代理作为【探查者已核实】证据引用）。落盘成功后返回文件路径；委派 subagent_plan 时请在 prompt 中带上该路径，说明先 read 文件再按需补查。落盘规则：fileMap/focusAreas 各 ≤${PROBE_LIMITS.maxEntries.fileMap} 条、exclusions/background 各 ≤${PROBE_LIMITS.maxEntries.exclusions} 条、evidence ≤${PROBE_LIMITS.maxEvidenceEntries} 条；四字段 JSON 总量 ≤${PROBE_LIMITS.maxTotalChars}、evidence JSON 总量 ≤${PROBE_LIMITS.maxEvidenceTotalChars}（按 JSON 序列化长度计，键名/引号/逗号均计入）；fileMap/focusAreas/evidence 的 path 必须真实存在（相对按工作区解析）；range 提示：${RANGE_FORMAT_HINT}；evidence.line ${LINE_FORMAT_HINT}；evidence 每项 line/value/text 至少其一；超限会拒绝（不静默截断），先压缩概括或分多次落盘。`,
      parameters: {
        type: 'object',
        properties: {
          fileMap: {
            type: 'array',
            description: '文件地图：探查中定位到的相关文件（每项 {path, relation}；path 必须真实存在，相对按工作区解析）',
            items: {
              type: 'object',
              properties: {
                path: { type: 'string', description: '文件路径（相对工作区或绝对路径，必须真实存在）' },
                relation: { type: 'string', description: `该文件与任务的关系（≤${PROBE_LIMITS.maxRelationLen} 字）` },
              },
              required: ['path', 'relation'],
              additionalProperties: false,
            },
          },
          focusAreas: {
            type: 'array',
            description: '重点区域：需要 pro 子代理优先补查的文件与行号范围（每项 {path, range?, note}；path 必须真实存在）',
            items: {
              type: 'object',
              properties: {
                path: { type: 'string', description: '文件路径（必须真实存在）' },
                range: { type: 'string', description: `可选行号范围；${RANGE_FORMAT_HINT}` },
                note: { type: 'string', description: `该区域的重点与补查方向（≤${PROBE_LIMITS.maxNoteLen} 字）` },
              },
              required: ['path', 'note'],
              additionalProperties: false,
            },
          },
          exclusions: {
            type: 'array',
            description: '排除项：探查中判定与任务无关的范围/文件（每项 {scope?, note}；允许概念边界，不校验存在性）',
            items: {
              type: 'object',
              properties: {
                scope: { type: 'string', description: '可选排除范围描述' },
                note: { type: 'string', description: `排除原因（≤${PROBE_LIMITS.maxNoteLen} 字）` },
              },
              required: ['note'],
              additionalProperties: false,
            },
          },
          background: {
            type: 'array',
            description: '背景与意图：任务的背景、目标与用户意图（每项 {topic, detail}）',
            items: {
              type: 'object',
              properties: {
                topic: { type: 'string', description: `背景主题（≤${PROBE_LIMITS.maxTopicLen} 字）` },
                detail: { type: 'string', description: `背景/意图细节（≤${PROBE_LIMITS.maxDetailLen} 字）` },
              },
              required: ['topic', 'detail'],
              additionalProperties: false,
            },
          },
          evidence: {
            type: 'array',
            description: `可选证据数组（探查子代理 save_probe 落盘证据报告用；主会话线索模式可不传）：探查者把核实过的行号/数值/文案照实写入——每项 {path 必填, line?, value?, text?, note?}，path 必须真实存在，line/value/text 至少一个（line ≤${PROBE_LIMITS.maxEvidenceLineLen} 字；${LINE_FORMAT_HINT}，value ≤${PROBE_LIMITS.maxEvidenceValueLen} 字，text ≤${PROBE_LIMITS.maxEvidenceTextLen} 字，note ≤${PROBE_LIMITS.maxEvidenceNoteLen} 字，至多 ${PROBE_LIMITS.maxEvidenceEntries} 条）`,
            items: {
              type: 'object',
              properties: {
                path: { type: 'string', description: '被核实文件路径（相对工作区或绝对路径，必须真实存在）' },
                line: { type: 'string', description: `可选行号；${LINE_FORMAT_HINT}` },
                value: { type: 'string', description: `可选核实值（≤${PROBE_LIMITS.maxEvidenceValueLen} 字）` },
                text: { type: 'string', description: `可选原文摘录（≤${PROBE_LIMITS.maxEvidenceTextLen} 字）` },
                note: { type: 'string', description: `可选备注（≤${PROBE_LIMITS.maxEvidenceNoteLen} 字）` },
              },
              required: ['path'],
              additionalProperties: false,
            },
          },
          taskName: { type: 'string', description: `可选任务短名（≤${PROBE_LIMITS.maxTaskNameLen} 字；插件会净化，勿传路径）` },
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
        if (cwd === '') throw new Error('save_probe: 会话缺少工作区路径，无法落盘')
        const dir = resolve(join(cwd, savePlanDir))
        const nameSeg = sanitizeTaskName(args.taskName)
        const ts = timestamp()
        const base = (nameSeg === '' ? '' : nameSeg + '-') + ts
        recoverJournals(dir)
        const invalid = validateProbe(args, cwd)
        if (invalid !== null) throw new Error(invalid)
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
