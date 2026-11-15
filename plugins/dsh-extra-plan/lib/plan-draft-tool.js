import { readFileSync, unlinkSync } from 'node:fs'
import { basename, dirname, join } from 'node:path'
import { createPathContext, resolveWorkspacePath, assertAllowedPath, prepareWriteTarget, validateReadTarget } from './path-policy.js'
import { validateSavePlanContract } from './save-plan-validation.js'
import { extractProbeEvidenceRefs } from './save-contract.js'
import { unexploredMarkerOf, verifyPlanSources, verifyProbeEvidenceRef } from './save-tool-factories.js'
import { errorCodeOf, errorText } from './runtime-static.js'

// 草稿白名单：save_plan 失败草稿只落在 <savePlanDir>/draft 下的 方案-/验收- 前缀 .md_mid。
// 判定只看 resolveWorkspacePath 归一化后的绝对 target.path：父目录必须等于由 savePlanDir 推导出的
// 期望草稿目录（配置改成别的落盘目录时白名单随之改变，不硬编码任何目录字面量）、文件名后缀恰为
// .md_mid；链接与真实路径逃逸仍由 prepareWriteTarget/validateReadTarget 兜底。
// 配对草稿路径由 base 经 resolveWorkspacePath 重建，禁止用字符串拼接出落盘路径。
const DRAFT_SUFFIX = '.md_mid'
const PLAN_PREFIX = '方案-'
const CHECK_PREFIX = '验收-'
const PURPOSE = 'save-artifacts'
const STATUS_PROMOTED = 'promoted'
const STATUS_SAVED_WITH_ERRORS = 'saved-with-errors'

// 仅用于白名单比较的平台归一化 key；落盘路径一律取 resolveWorkspacePath 的 target.path。
function pathKey(value) {
  const normalized = String(value).replace(/\\/g, '/')
  return process.platform === 'win32' ? normalized.toLowerCase() : normalized
}

// 归一化绝对路径 → 草稿 base；父目录不是期望草稿目录、后缀不符或缺 方案-/验收- 前缀时返回 null（调用方一律拒绝）。
function draftBaseOf(targetPath, expectedDraftDir) {
  if (typeof expectedDraftDir !== 'string' || expectedDraftDir === '') return null
  const name = basename(targetPath)
  if (!pathKey(name).endsWith(DRAFT_SUFFIX)) return null
  if (pathKey(dirname(targetPath)) !== pathKey(expectedDraftDir)) return null
  const stem = name.slice(0, name.length - DRAFT_SUFFIX.length)
  if (stem.startsWith(PLAN_PREFIX)) return stem.length === PLAN_PREFIX.length ? null : stem.slice(PLAN_PREFIX.length)
  if (stem.startsWith(CHECK_PREFIX)) return stem.length === CHECK_PREFIX.length ? null : stem.slice(CHECK_PREFIX.length)
  return null
}

function cwdOf(exec) {
  const session = exec !== undefined && exec !== null && exec.agent !== undefined && exec.agent !== null ? exec.agent.session : undefined
  const header = session !== undefined && session !== null && session.header !== undefined && session.header !== null ? session.header : undefined
  return header !== undefined && typeof header.cwd === 'string' ? header.cwd : ''
}

function pathContextOf(cwd, getPathContext) {
  if (typeof getPathContext === 'function') {
    const supplied = getPathContext(cwd)
    if (supplied !== undefined && supplied !== null) return supplied
  }
  return createPathContext({ workspaceRoot: cwd })
}

function readText(path) {
  try {
    return readFileSync(path, 'utf8')
  } catch (error) {
    throw new Error('edit_plan_draft: 文件读取失败：' + errorText(error))
  }
}

// 行级语义：只剥掉一个结尾换行参与编号，写回时原样补回，保证行号与编辑器/grep 汇报一致。
function splitLines(text) {
  const hasFinalNewline = text.endsWith('\n')
  const body = hasFinalNewline ? text.slice(0, -1) : text
  const lines = body === '' ? (text === '' ? [] : ['']) : body.split('\n')
  return { lines, hasFinalNewline }
}

function joinLines(lines, hasFinalNewline) {
  if (lines.length === 0) return ''
  return lines.join('\n') + (hasFinalNewline ? '\n' : '')
}

function diagnosticText(diagnostic) {
  const document = diagnostic.document || 'plan/checklist'
  const task = diagnostic.taskId === null || diagnostic.taskId === undefined ? '任务全局' : '任务' + diagnostic.taskId
  const position = Number.isInteger(diagnostic.line) && diagnostic.line > 0 ? '；位置：第 ' + diagnostic.line + ' 行' : ''
  return document + ' ' + task + ' 字段「' + String(diagnostic.field || '') + '」：' + String(diagnostic.message || '') + position
}

function savedWithErrors(paths, lineCount, diagnostics, error) {
  return { status: STATUS_SAVED_WITH_ERRORS, paths, lineCount, diagnostics, error }
}

// 三种操作：{ line, text } 替换、{ line, drop: true } 真删、{ line, insert } 行前插入。
// 同一批按行号倒序排序后应用；任一编辑非法或越界即整批不生效（调用方不会写入任何内容）。
function applyEdits(lines, edits) {
  const planned = edits.map((edit, index) => {
    const refuse = '（整批不生效，未写入任何修改）'
    if (edit === null || typeof edit !== 'object' || Array.isArray(edit)) throw new Error('edit_plan_draft: edits[' + index + '] 必须是对象' + refuse)
    const line = edit.line
    if (!Number.isInteger(line) || line < 1) throw new Error('edit_plan_draft: edits[' + index + '].line 必须是从 1 开始的行号' + refuse)
    if (line > lines.length) throw new Error('edit_plan_draft: edits[' + index + '].line=' + line + ' 越界：草稿当前共 ' + lines.length + ' 行' + refuse)
    if (edit.drop !== undefined) {
      if (edit.drop !== true) throw new Error('edit_plan_draft: edits[' + index + '].drop 只能为 true' + refuse)
      if (edit.text !== undefined || edit.insert !== undefined) throw new Error('edit_plan_draft: edits[' + index + '] 的 drop 不能与 text/insert 同时出现' + refuse)
      return { line, kind: 'drop' }
    }
    if (edit.insert !== undefined) {
      if (typeof edit.insert !== 'string') throw new Error('edit_plan_draft: edits[' + index + '].insert 必须是字符串' + refuse)
      if (edit.text !== undefined) throw new Error('edit_plan_draft: edits[' + index + '] 的 insert 不能与 text 同时出现' + refuse)
      return { line, kind: 'insert', text: edit.insert }
    }
    if (typeof edit.text === 'string') return { line, kind: 'replace', text: edit.text }
    throw new Error('edit_plan_draft: edits[' + index + '] 缺少操作：需 text 替换、drop: true 真删或 insert 行前插入' + refuse)
  })
  const ordered = planned.slice().sort((left, right) => right.line - left.line)
  const next = lines.slice()
  for (const edit of ordered) {
    const index = edit.line - 1
    if (edit.kind === 'drop') next.splice(index, 1)
    else if (edit.kind === 'insert') next.splice(index, 0, edit.text)
    else next[index] = edit.text
  }
  return next
}

// 删除草稿前的授权：与 save-persistence 内部 authorizeFile 同形（resolveWorkspacePath + prepareWriteTarget）。
function authorizeDraftFile(pathContext, draftPath) {
  const target = resolveWorkspacePath(pathContext, draftPath, { purpose: PURPOSE })
  return prepareWriteTarget(pathContext, target, { expectedType: 'file', purpose: PURPOSE })
}

export function createPlanDraftToolFactories({ savePlanDir, atomicCommit, atomicReplace, getPathContext }) {
  // 期望草稿目录：与 save_plan 落草稿的 <dir>/draft 同源，由可配置的 savePlanDir 推导成归一化绝对路径。
  // 推导失败（例如 savePlanDir 越出工作区）返回 null，调用方按非白名单一律拒绝，绝不回退硬编码目录。
  function expectedDraftDirOf(pathContext) {
    try {
      return resolveWorkspacePath(pathContext, join(savePlanDir, 'draft'), { purpose: PURPOSE }).path
    } catch (error) {
      return null
    }
  }

  // 报文里的草稿目录：与 save_plan 报错里给出的相对路径同形，只用于提示文案，不参与白名单判定。
  const draftDirLabel = join(savePlanDir, 'draft').replace(/\\/g, '/')

  // 写回草稿用覆盖语义 atomicReplace(dir, files, …)；转正用 atomicCommit(dir, base, files, …)。
  // 两者签名不同、不得互替；转正的 dir 必须是 savePlanDir 根，绝不能是 draft 子目录。
  function writeDraft(dir, name, content, pathContext) {
    if (typeof atomicReplace !== 'function') throw new Error('edit_plan_draft: 缺少 atomicReplace 依赖，无法写回草稿（未写入任何修改）')
    atomicReplace(dir, [{ name, content }], undefined, { pathContext, purpose: PURPOSE })
  }

  function defineEditPlanDraft() {
    return {
      name: 'edit_plan_draft',
      description: '修复 save_plan 报错后生成的 .md_mid 中间文档（仅少量错误时使用）：行级增删改后自动重跑 save_plan 全套校验，通过即转正为正式工件并返回路径，不通过返回带行号的诊断，修改已保存可继续改；派遣摘要超限时 save_plan 不生成草稿，应改写更短的方案重新调用 save_plan。',
      parameters: {
        type: 'object',
        properties: {
          path: {
            type: 'string',
            description: '必须是 save_plan 报错里给出的 ' + draftDirLabel + '/*.md_mid（方案-<base>.md_mid 或 验收-<base>.md_mid）；其它路径（' + savePlanDir + ' 根、draft 以外的目录、非 .md_mid 后缀）一律拒绝，且不会创建草稿',
          },
          edits: {
            type: 'array',
            description: '行级编辑列表：行号以文件当前内容为准（1 至当前行数），同批按行号倒序自动应用；三种操作为 { line, text } 替换该行、{ line, drop: true } 真删该行、{ line, insert } 在该行之前插入一行（insert 为新行整行文本）；任一越界或基准不合法则整批不生效；传空数组 [] 也是合法输入，语义是不做任何修改、直接重跑全套检测，可用于上次因落盘等非内容问题失败后重试转正',
            items: {
              type: 'object',
              properties: {
                line: { type: 'integer', description: '从 1 开始的行号，以草稿当前内容为准；越界即整批不生效' },
                text: { type: 'string', description: '替换后的整行文本（与 drop/insert 互斥）' },
                drop: { type: 'boolean', description: '为 true 时真删该行（与 text/insert 互斥）' },
                insert: { type: 'string', description: '在该行之前插入的整行文本（与 text/drop 互斥）' },
              },
              required: ['line'],
              additionalProperties: false,
            },
          },
        },
        required: ['path', 'edits'],
        additionalProperties: false,
      },
      output: {
        schema: {
          type: 'object',
          properties: {
            status: { type: 'string', enum: [STATUS_PROMOTED, STATUS_SAVED_WITH_ERRORS], description: 'promoted=全套校验通过并已转正为正式 .md；saved-with-errors=修改已保存但未通过校验，草稿保留可继续改' },
            paths: { type: 'array', items: { type: 'string' }, description: 'promoted 时为转正后的 方案-/验收- 正式工件绝对路径；saved-with-errors 时为当前草稿路径' },
            lineCount: { type: 'integer', description: '写回后草稿的行数（以文件当前内容为准）' },
            diagnostics: { type: 'array', items: { type: 'string' }, description: '逐条诊断，能定位时带「位置：第 N 行」' },
            error: { type: 'string', description: '未通过校验或转正异常时的说明；promoted 且无异常时为空串，删草稿失败时说明残留' },
          },
          required: ['status', 'paths', 'lineCount', 'diagnostics', 'error'],
          additionalProperties: false,
        },
        // 结果 content 必须恰为一个 text ContentBlock、正文是返回值整体 JSON（裸字符串会崩宿主）。
        render(_args, value) {
          return [{ type: 'text', text: JSON.stringify(value) }]
        },
      },
      timeoutMs: 60000,
      async execute(args, exec) {
        if (args === null || typeof args !== 'object' || Array.isArray(args)) throw new Error('edit_plan_draft: 参数必须是对象（未写入任何修改）')
        if (typeof args.path !== 'string' || args.path.trim() === '') throw new Error('edit_plan_draft: 缺少 path 参数；path 必须是 save_plan 报错里给出的 ' + draftDirLabel + '/*.md_mid（未写入任何修改）')
        if (!Array.isArray(args.edits)) throw new Error('edit_plan_draft: edits 必须是数组（未写入任何修改）')
        const cwd = cwdOf(exec)
        if (cwd === '') throw new Error('edit_plan_draft: 会话缺少工作区路径，无法定位草稿（未写入任何修改）')
        const pathContext = pathContextOf(cwd, getPathContext)
        // 白名单判定基于归一化后的 target.path；其它路径一律拒绝且不会创建草稿。
        const requested = resolveWorkspacePath(pathContext, args.path.trim(), { purpose: PURPOSE })
        const expectedDraftDir = expectedDraftDirOf(pathContext)
        const base = draftBaseOf(requested.path, expectedDraftDir)
        if (base === null) throw new Error('edit_plan_draft: path 必须是 save_plan 报错里给出的 ' + draftDirLabel + '/ 下的 方案-<base>.md_mid 或 验收-<base>.md_mid（收到 ' + requested.path + '）；其它路径一律拒绝且不会创建草稿')
        let currentTarget
        try {
          currentTarget = validateReadTarget(pathContext, requested, { expectedType: 'file', purpose: PURPOSE })
        } catch (error) {
          if (errorCodeOf(error) === 'TARGET_MISSING') return savedWithErrors([requested.path], 0, [], 'edit_plan_draft: 草稿不存在：' + requested.path + '（可能已转正为正式工件，或已被清理；如需重建请重新调用 save_plan）')
          throw new Error('edit_plan_draft: 草稿无法读取：' + errorText(error))
        }
        const draftName = basename(currentTarget.path)
        const isPlanDraft = draftName.startsWith(PLAN_PREFIX)
        const original = splitLines(readText(currentTarget.realPath))
        const editedLines = applyEdits(original.lines, args.edits)
        const editedText = joinLines(editedLines, original.hasFinalNewline)
        const lineCount = splitLines(editedText).lines.length
        const pairedName = isPlanDraft ? CHECK_PREFIX + base + DRAFT_SUFFIX : PLAN_PREFIX + base + DRAFT_SUFFIX
        // 配对草稿路径按 base 经 resolveWorkspacePath 重建并重新授权，不做字符串拼接。
        const pairedDeclared = resolveWorkspacePath(pathContext, join(savePlanDir, 'draft', pairedName), { purpose: PURPOSE })
        if (draftBaseOf(pairedDeclared.path, expectedDraftDir) === null) throw new Error('edit_plan_draft: 无法重建配对草稿路径：' + pairedDeclared.path + '（应为 ' + draftDirLabel + '/ 下的 .md_mid）')
        let pairedTarget = null
        try {
          pairedTarget = validateReadTarget(pathContext, pairedDeclared, { expectedType: 'file', purpose: PURPOSE })
        } catch (error) {
          pairedTarget = null
        }
        const pairedText = pairedTarget === null ? '' : readText(pairedTarget.realPath)
        const planText = isPlanDraft ? editedText : pairedText
        const checklistText = isPlanDraft ? pairedText : editedText
        // 检测顺序与 save_plan 完全一致：未探查标记 → 合同校验 → 源核实 → 证据核实。
        // 命中标记即整批拒绝且不写回草稿：否则可用编辑草稿旁路 save_plan 的未探查拒绝。
        const unexploredMarker = unexploredMarkerOf(planText)
        if (unexploredMarker !== null) {
          const markerLine = planText.slice(0, planText.indexOf(unexploredMarker)).split('\n').length
          return savedWithErrors([currentTarget.path], original.lines.length, ['位置：第 ' + markerLine + ' 行 方案中含未探查/待确认标记「' + unexploredMarker + '」'], 'edit_plan_draft: 方案中包含方括号包裹的未探查/待确认标记。请先申请追加预算继续探查，确认所有项均已探查核实后再调用 save_plan（本次修改未写回草稿）')
        }
        // 先写回再校验：合同等校验不通过时修改也已经落盘，可以继续改（未探查标记是唯一整批不写回的入口）。
        try {
          writeDraft(dirname(currentTarget.path), draftName, editedText, pathContext)
        } catch (error) {
          throw new Error('edit_plan_draft: 草稿写回失败：' + errorText(error))
        }
        if (pairedTarget === null) {
          return savedWithErrors([currentTarget.path], lineCount, [], 'edit_plan_draft: 修改已保存，但配对草稿不存在：' + pairedDeclared.path + '（可能已转正或已清理；请重新调用 save_plan 生成成对草稿）')
        }
        // 全套检测与 save_plan 同源：合同校验（含派遣摘要上限）→ 源核实 → 证据核实。
        const contract = validateSavePlanContract(planText, checklistText)
        if (!contract.ok) {
          const limitNote = contract.limitExceeded === true ? '\n（派遣摘要超限：save_plan 不会为此生成草稿，应改写更短的方案后重新调用 save_plan）' : ''
          return savedWithErrors([currentTarget.path], lineCount, contract.diagnostics.map(diagnosticText), contract.error + limitNote)
        }
        let sourceState
        try {
          sourceState = verifyPlanSources(contract.summary, pathContext)
        } catch (error) {
          return savedWithErrors([currentTarget.path], lineCount, [errorText(error)], 'edit_plan_draft: 修改已保存，但源核实失败：' + errorText(error))
        }
        try {
          for (const ref of extractProbeEvidenceRefs(planText)) verifyProbeEvidenceRef(cwd, ref, sourceState, pathContext, '')
        } catch (error) {
          return savedWithErrors([currentTarget.path], lineCount, [errorText(error)], 'edit_plan_draft: 修改已保存，但证据核实失败：' + errorText(error))
        }
        const rootTarget = assertAllowedPath(pathContext, resolveWorkspacePath(pathContext, savePlanDir, { purpose: PURPOSE }))
        const planFile = join(rootTarget.path, PLAN_PREFIX + base + '.md')
        const checkFile = join(rootTarget.path, CHECK_PREFIX + base + '.md')
        // 转正：dir 是 savePlanDir 根，文件名 方案-<base>.md 与 验收-<base>.md。
        if (typeof atomicCommit !== 'function') return savedWithErrors([currentTarget.path], lineCount, [], 'edit_plan_draft: 缺少 atomicCommit 依赖，无法转正（草稿保留）')
        try {
          atomicCommit(rootTarget.path, base, [
            { name: PLAN_PREFIX + base + '.md', content: planText },
            { name: CHECK_PREFIX + base + '.md', content: checklistText },
          ], undefined, { pathContext, purpose: PURPOSE })
        } catch (error) {
          return savedWithErrors([currentTarget.path], lineCount, [errorText(error)], 'edit_plan_draft: 校验已通过但转正落盘失败：' + errorText(error) + '（草稿保留；转正只创建不覆盖，若同 base 的正式工件已存在则重试必然失败——请先确认 方案-<base>.md / 验收-<base>.md 是否已存在，已存在说明本次草稿属残留、可手动删除，不要盲目重试）')
        }
        // 删除草稿：先 authorizeFile 授权再 unlink；删失败不回滚已转正工件，只在返回值说明残留。
        const residues = []
        for (const draftPath of [currentTarget.path, pairedTarget.path]) {
          try {
            authorizeDraftFile(pathContext, draftPath)
            unlinkSync(draftPath)
          } catch (error) {
            const code = errorCodeOf(error)
            if (code !== 'TARGET_MISSING' && code !== 'ENOENT') residues.push(draftPath + '（' + errorText(error) + '）')
          }
        }
        return {
          status: STATUS_PROMOTED,
          paths: [planFile, checkFile],
          lineCount,
          diagnostics: [],
          error: residues.length === 0 ? '' : 'edit_plan_draft: 已转正，但草稿删除失败（残留：' + residues.join('；') + '；可手动删除残留 .md_mid）',
        }
      },
    }
  }

  return { defineEditPlanDraft }
}
