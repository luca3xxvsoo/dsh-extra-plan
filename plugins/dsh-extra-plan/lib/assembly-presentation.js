// @local/dsh-extra-plan lib/assembly-presentation.js (v0.2.1)
// A/C/M 展示投影与 skill catalog 投影（自 index.js 拆分，逐字保留原实现）。
//   纯静态导出：只读入参、不改 live registry/result，不持有 per-apply 状态。
//   唯一模块级可变状态 = sdkRendererModulePromise（SDK renderer 动态 import 缓存 promise，
//   拆分前本就位于 index.js 模块顶层，语义不变；不得改成 per-instance）。
// 二阶段 live 取数（toolPresentationModeOf / toolRegistryOf / toolSdkSchemasOf）已迁入本模块（v0.2.2 拆分清理）。
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { homedir } from 'node:os'
import { pathToFileURL } from 'node:url'

// creativeMode=false 只改变模型可见的装配投影；registry binding 与运行时执行边界保持不变。
export const CORDIS_PRESENTATION_TOOLS = Object.freeze([
  'cordis_inspect_list',
  'cordis_inspect_query',
  'cordis_inspect_self',
  'cordis_define',
  'cordis_run',
  'cordis_stop',
  'cordis_undefine',
])
export const CORDIS_PRESENTATION_TOOL_SET = new Set(CORDIS_PRESENTATION_TOOLS)
export const CORDIS_SECTION_NAME = 'tool:cordis'
export const PTC_SECTION_NAME = 'tools:ptc-only'
export const SDK_SECTION_NAME = 'tools:sdk'
export const READ_SECTION_NAME = 'tool:read'
export const CREATIVE_SKILL_NAMES = new Set(['cordis-plugin-development', 'editing-cordis-compositions'])

export function sectionOf(sections, name) {
  if (!Array.isArray(sections)) return undefined
  return sections.find((section) => section !== null && typeof section === 'object' && section.name === name)
}

// HP 首轮的 tool:read 文本改由 index.js 手写（cfg.bootstrapReadHint），本模块不再渲染最小 read，
// 三个只服务该旧渲染路径的辅助（取 section 文本 / 只选 read schema / 拼接最小 read 文本）已整组删除；
// 删除时全仓 grep 确认其中「取 section 文本」无调用点，随组一并删除。

export function skillCatalogEntriesOf(source) {
  if (source === null || typeof source !== 'object' || !Array.isArray(source.entries)) return undefined
  const entries = []
  for (const entry of source.entries) {
    if (entry === null || typeof entry !== 'object' || typeof entry.name !== 'string' || typeof entry.description !== 'string') return undefined
    entries.push({ name: entry.name, description: entry.description })
  }
  return entries
}

export function renderSkillCatalogText(source, entries) {
  const lines = ['<system-reminder>']
  if (source.update === true) {
    lines.push('The available skill catalog changed. This complete catalog replaces every earlier available-skills list in this session:', '', '<available_skills>')
    for (const entry of entries) lines.push('- \`' + entry.name + '\`: ' + entry.description)
    lines.push('</available_skills>', '')
    if (entries.length === 0) {
      lines.push('No skills are currently available through the \`skill\` tool. Do not use names from earlier skill catalogs.')
      lines.push('A user may still invoke a skill directly; its <skill_content> block then appears in this conversation. Follow it, and do not call the \`skill\` tool for it.')
    } else {
      lines.push('Use only names in this replacement catalog. If the user names a listed skill, or the task clearly matches its description, call the \`skill\` tool with the exact name before acting.')
      lines.push('A user may also invoke a skill directly; its <skill_content> block then appears in this conversation. Follow it, and do not call the \`skill\` tool again for that skill.')
    }
  } else {
    lines.push('A skill is a reusable set of task-specific instructions. The following skills are available in this session:', '', '<available_skills>')
    for (const entry of entries) lines.push('- \`' + entry.name + '\`: ' + entry.description)
    lines.push('</available_skills>', '')
    lines.push('If the user names a skill, or the task clearly matches its description, call the \`skill\` tool with the exact skill name before taking task actions. This catalog contains summaries only; do not infer or follow the skill instructions until it has been loaded.')
    lines.push('A user may also invoke a skill directly; its <skill_content> block then appears in this conversation. Follow it, and do not call the \`skill\` tool again for that skill.')
  }
  lines.push('</system-reminder>')
  return lines.join('\n')
}

export function projectSkillCatalogDecision(decision) {
  if (decision === null || typeof decision !== 'object' || decision.kind === 'reject' || !Array.isArray(decision.messages)) return decision
  let changed = false
  const messages = decision.messages.map((message) => {
    if (message === null || typeof message !== 'object') return message
    const entries = skillCatalogEntriesOf(message.source)
    if (entries === undefined) return message
    const visible = entries.filter((entry) => !CREATIVE_SKILL_NAMES.has(entry.name))
    if (visible.length === entries.length) return message
    changed = true
    const source = { ...message.source, entries: visible }
    const text = renderSkillCatalogText(source, visible)
    let replaced = false
    const content = Array.isArray(message.content)
      ? message.content.map((part) => {
        if (!replaced && part !== null && typeof part === 'object' && part.type === 'text') {
          replaced = true
          return { ...part, text }
        }
        return part
      })
      : []
    if (!replaced) content.push({ type: 'text', text })
    return { ...message, source, content }
  })
  return changed ? { ...decision, messages } : decision
}

export function isCordisPresentationTool(name) {
  return typeof name === 'string' && CORDIS_PRESENTATION_TOOL_SET.has(name)
}

export function filteredCordisSchemas(schemas) {
  if (!Array.isArray(schemas)) return []
  return schemas.filter((schema) => schema !== null && typeof schema === 'object' && !isCordisPresentationTool(schema.name))
}

export function hasSection(sections, name) {
  return Array.isArray(sections) && sections.some((section) => section !== null && typeof section === 'object' && section.name === name)
}

export function hasNonEmptySection(sections, name) {
  return Array.isArray(sections) && sections.some((section) => section !== null && typeof section === 'object' && section.name === name && typeof section.text === 'string' && section.text !== '')
}

// 只投影 PromptAssembly 的模型可见副本；不修改 registry、result 或其 schema。
export function projectAssemblyForPresentation(assembly, schemas, options = {}) {
  if (assembly === null || typeof assembly !== 'object') return assembly
  const hideCordis = options.hideCordis !== false
  const ptcOnly = options.ptcOnly === true
  const keepSectionNames = options.keepSectionNames instanceof Set ? options.keepSectionNames : null
  const schemaNames = Array.isArray(schemas)
    ? new Set(schemas.filter((schema) => schema !== null && typeof schema === 'object' && typeof schema.name === 'string').map((schema) => schema.name))
    : null
  const tools = Array.isArray(assembly.tools)
    ? assembly.tools.filter((tool) => {
      if (tool === null || typeof tool !== 'object' || typeof tool.name !== 'string') return false
      if (hideCordis && isCordisPresentationTool(tool.name)) return false
      if (ptcOnly && tool.name !== 'run_code') return false
      return schemaNames === null || schemaNames.size === 0 || schemaNames.has(tool.name)
    })
    : assembly.tools
  const sections = Array.isArray(assembly.sections)
    ? assembly.sections
      .filter((section) => section !== null && typeof section === 'object' && (!hideCordis || section.name !== CORDIS_SECTION_NAME) && (keepSectionNames === null || keepSectionNames.has(section.name)))
      .map((section) => section.name === SDK_SECTION_NAME && typeof options.sdkText === 'string'
        ? { ...section, text: options.sdkText }
        : section)
    : assembly.sections
  return { ...assembly, sections, tools }
}

export function sdkSchemasForRendering(schemas) {
  return filteredCordisSchemas(schemas)
    .filter((schema) => schema.name !== 'run_code')
    .map((schema) => ({
      ...schema,
      output: schema.output !== undefined ? schema.output : { type: 'object', additionalProperties: true },
    }))
}

export function dshToolsEntryCandidates() {
  const dshHome = process.env.DSH_HOME || join(homedir(), '.dsh')
  const candidates = [
    join(dshHome, 'profiles', 'web', 'node_modules', '@deepseek-ai', 'dsh-tools', 'lib', 'index.js'),
  ]
  if (process.platform === 'win32') {
    const appData = process.env.APPDATA || join(homedir(), 'AppData', 'Roaming')
    candidates.push(join(appData, 'npm', 'node_modules', '@deepseek-ai', 'dsh', 'node_modules', '@deepseek-ai', 'dsh-tools', 'lib', 'index.js'))
  } else {
    candidates.push(
      join('/usr', 'local', 'lib', 'node_modules', '@deepseek-ai', 'dsh', 'node_modules', '@deepseek-ai', 'dsh-tools', 'lib', 'index.js'),
      join(homedir(), '.npm-global', 'lib', 'node_modules', '@deepseek-ai', 'dsh', 'node_modules', '@deepseek-ai', 'dsh-tools', 'lib', 'index.js'),
      join(homedir(), 'node_modules', '@deepseek-ai', 'dsh', 'node_modules', '@deepseek-ai', 'dsh-tools', 'lib', 'index.js'),
    )
  }
  return [...new Set(candidates)]
}

let sdkRendererModulePromise
export function loadSdkRendererModule() {
  if (sdkRendererModulePromise === undefined) {
    sdkRendererModulePromise = (async () => {
      for (const entry of dshToolsEntryCandidates()) {
        if (existsSync(entry)) return import(pathToFileURL(entry).href)
      }
      throw new Error('extra-plan: dsh-tools SDK renderer is unavailable')
    })()
  }
  return sdkRendererModulePromise
}

// 返回当前语言对应的官方 renderer 函数引用；模块 promise 仍保持模块级动态 import 缓存。
export async function resolveToolsSdkRenderer(language = 'typescript') {
  const rendererModule = await loadSdkRendererModule()
  const render = language === 'python' ? rendererModule.renderToolsSdkPy : rendererModule.renderToolsSdk
  if (typeof render !== 'function') throw new Error(`extra-plan: unsupported SDK renderer language ${language}`)
  return render
}

// 只接收已过滤 schema，整体调用官方 renderer 重建 tools:sdk，不从原始文本删块。
export async function renderFilteredToolsSdk(schemas, language = 'typescript') {
  const render = await resolveToolsSdkRenderer(language)
  return render(sdkSchemasForRendering(schemas))
}

export function toolRegistryOf(agent) {
  if (agent === undefined || agent === null || agent.ctx === undefined || agent.ctx === null || typeof agent.ctx.get !== 'function') return undefined
  try {
    const tools = agent.ctx.get('tools')
    return tools !== null && typeof tools === 'object' ? tools : undefined
  } catch (error) {
    return undefined
  }
}

export function toolSdkSchemasOf(agent) {
  const tools = toolRegistryOf(agent)
  if (tools === undefined) return undefined
  try {
    if (typeof tools.sdkSchemas === 'function') {
      const schemas = tools.sdkSchemas(agent)
      if (Array.isArray(schemas)) return schemas
    }
    if (typeof tools.schemas !== 'function') return undefined
    const schemas = tools.schemas(agent)
    if (!Array.isArray(schemas)) return undefined
    return schemas.filter((schema) => schema !== null && typeof schema === 'object' && schema.name !== 'run_code').map((schema) => ({
      ...schema,
      output: schema.output !== undefined ? schema.output : { type: 'object', additionalProperties: true },
    }))
  } catch (error) {
    return undefined
  }
}

export function toolPresentationModeOf(agent) {
  const tools = toolRegistryOf(agent)
  if (tools === undefined || typeof tools.modeFor !== 'function') return undefined
  try {
    const mode = tools.modeFor(agent)
    return typeof mode === 'string' ? mode : undefined
  } catch (error) {
    return undefined
  }
}
