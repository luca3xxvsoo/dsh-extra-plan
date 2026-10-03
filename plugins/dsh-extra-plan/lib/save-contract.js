// 任务短名净化：仅保留安全字符（字母/数字/下划线/连字符/中日韩文字），
// 其余字符折为连字符；≤PROBE_LIMITS.maxTaskNameLen 字；去首尾连字符。
// 净化失败或空串返回 ''（只用时间戳）。
export function sanitizeTaskName(name) {
  if (typeof name !== 'string') return ''
  let out = ''
  for (const ch of name) {
    if (out.length >= PROBE_LIMITS.maxTaskNameLen) break
    out += /[A-Za-z0-9_\-\u4e00-\u9fff]/.test(ch) ? ch : '-'
  }
  return out.replace(/^-+|-+$/g, '')
}

// 本地时间戳 yyyyMMddHHmmss（保留既有公共格式合同）。
function timestampOf(date) {
  const pad = (n) => String(n).padStart(2, '0')
  return `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}`
}

export function timestamp() {
  return timestampOf(new Date())
}

// 会话标识段（T3）：session header id 去除分隔符后前 8 位字母数字。单段、无连字符，
// 便于按「时间戳前一段」识别；取不到 id（测试夹具/异常会话）→ ''。
export function sessionTagOf(sessionId) {
  return typeof sessionId === 'string' ? sessionId.replace(/[^A-Za-z0-9]/g, '').slice(0, 8) : ''
}

// 工件 base 唯一真源：任务短名 + sessionTag + 本地毫秒时间 + process.pid + 进程内递增序号。
// 同一 task/session 在同一毫秒内连续调用也不会碰撞；save_plan/save_probe 共用此合同。
let artifactLastMillis = -1
let artifactSequence = 0
export function saveArtifactBase(nameSeg, sessionId) {
  const now = new Date()
  const millis = now.getTime()
  if (millis === artifactLastMillis) artifactSequence += 1
  else {
    artifactLastMillis = millis
    artifactSequence = 0
  }
  const tag = sessionTagOf(sessionId)
  const stamp = timestampOf(now) + String(now.getMilliseconds()).padStart(3, '0')
  const parts = []
  if (nameSeg !== '') parts.push(nameSeg)
  if (tag !== '') parts.push(tag)
  parts.push(stamp, String(process.pid), String(artifactSequence))
  return parts.join('-')
}

// save_plan 结果的模型可见内容（v0.1.3 修复）：output.render 契约必须返回
// ContentBlock[]（宿主第一方工具均如此，见 dsh-tool-pwsh L355），不能返回裸
// 字符串——否则 DeepSeek 适配器 serializeMessages 的 flattenText 会对字符串调
// .filter 抛 TypeError，被外层包装成 TRANSPORT、重试 3 连败（毫秒级），表现为
// "save_plan 后子代理必死"。此函数导出供场景测试锁死契约。
export function renderSavePlan(value) {
  return [{ type: 'text', text: '方案已落盘（原子双写）：\n- ' + value.paths.join('\n- ') }]
}

// save_probe 数值限制的唯一现行来源；测试通过导出对象断言，文档只链接此符号，不复制运行时限制表。
// 条目数、单条长度与总量等限制均由 PROBE_LIMITS 统一提供，改动时保持实现、测试和文档同源。
export const PROBE_LIMITS = {
  maxEntries: { // 各类集合/数组的最大条目数配置
    fileMap: 50, // 文件映射表，例如 路径 -> 文件信息
    focusAreas: 50, // 重点关注区域/重点模块
    exclusions: 20, // 排除项，例如排除文件、目录、规则
    background: 20, // 背景信息/上下文条目
  },
  maxPathLen: 1024, // 文件路径或目录路径最大长度
  maxRangeLen: 20, // 范围字符串最大长度，例如 "L10-L20"、"123-456"
  maxRelationLen: 400, // 关系描述最大长度，例如依赖、调用、关联关系
  maxNoteLen: 400, // 备注/注释最大长度
  maxTopicLen: 120, // 主题/标题最大长度
  maxDetailLen: 1000, // 详细说明最大长度
  maxTotalChars: 20000, // 整个探测内容总字符数上限
  rangePattern: '^L?\\d+(?:-\\d+)?$', // 范围格式正则：匹配 123、L123、123-456、L123-456；L 可能表示 Line
  maxEvidenceEntries: 150, // 证据条目最大数量
  maxEvidenceLineLen: 20, // 证据行号字符串最大长度，例如 "L123"
  maxEvidenceValueLen: 240, // 证据 value 字段最大长度
  maxEvidenceTextLen: 1000, // 证据正文/文本内容最大长度
  maxEvidenceNoteLen: 400, // 证据备注最大长度
  maxEvidenceTotalChars: 32000, // 所有证据内容总字符数上限
  evidenceLinePattern: '^L?\\d+$', // 证据行号格式正则：匹配 123 或 L123，不支持范围
  maxTaskNameLen: 32, // 任务名称最大长度
}

// line/range 格式提示统一文案（描述与报错共用；格式正则本体不变）。
export const LINE_FORMAT_HINT = '仅接受单个行号（12 或 L12），禁止区间（如 L158-162），区间信息请写入 evidence.text 并取代表性行号'
export const RANGE_FORMAT_HINT = '仅 focusAreas.range 允许区间（12 或 L12-34）'

// 线索/证据报告 Markdown 渲染（模板固定）：标题 + 卷首声明 + 四节；evidence 非空时
// 标题/卷首切换为证据报告语义并追加「## 五、证据」节。导出供测试核对内容契约。
export function renderProbeMarkdown(args) {
  const hasEvidence = Array.isArray(args.evidence) && args.evidence.length > 0
  const lines = []
  lines.push(hasEvidence ? '# 探查证据报告（探查者 save_probe 落盘）' : '# 探查线索（save_probe 落盘，非结论）')
  lines.push('')
  if (hasEvidence) {
    lines.push('> 本文件为探查者已核实的证据报告：行号/数值/文案照实记录，可被规划子代理作为【探查者已核实】证据引用（引用时在方案中注明「证据来源：本文件路径」）')
  } else {
    lines.push('> 本文件只有定位线索、没有证据；不得引用本文件的行号/数值/文案作为【已探查核实】证据——证据须由 pro 规划子代理自行 read/glob/grep 核实')
  }
  lines.push('')
  lines.push('## 一、文件地图')
  for (const item of args.fileMap) lines.push(`- ${item.path}：${item.relation}`)
  lines.push('')
  lines.push('## 二、重点区域')
  for (const item of args.focusAreas) {
    lines.push(item.range !== undefined && item.range !== null && item.range !== '' ? `- ${item.path}（${item.range}）：${item.note}` : `- ${item.path}：${item.note}`)
  }
  lines.push('')
  lines.push('## 三、排除项')
  for (const item of args.exclusions) {
    lines.push(item.scope !== undefined && item.scope !== null && item.scope !== '' ? `- ${item.scope}：${item.note}` : `- （未指明范围）：${item.note}`)
  }
  lines.push('')
  lines.push('## 四、背景与意图')
  for (const item of args.background) lines.push(`- ${item.topic}：${item.detail}`)
  lines.push('')
  if (hasEvidence) {
    lines.push('## 五、证据')
    for (const item of args.evidence) {
      let line = `- ${item.path}`
      if (item.line !== undefined && item.line !== null && item.line !== '') line += `（${item.line}）`
      line += '：'
      if (item.value !== undefined && item.value !== null && item.value !== '') line += item.value
      if (item.text !== undefined && item.text !== null && item.text !== '') line += `｜${item.text}`
      if (item.note !== undefined && item.note !== null && item.note !== '') line += `｜${item.note}`
      lines.push(line)
    }
    lines.push('')
  }
  return lines.join('\n')
}

// 从【探查者已核实】标记提取证据文件路径；调用方与测试共用这个纯 helper。
// 捕获引用必须符合「证据：<path>」；装饰清洗不包含 . 或 /，因此路径语法保持不变。
const PROBE_EVIDENCE_RE = /【探查者已核实】[^\n]*?证据[：:]\s*([^\s，。；）】\n]+)/g
// 多个引用只按 、 ; ； | 拆分；空格已由捕获正则排除，半角逗号仍属于合法路径而不是分隔符。
// 后续 trimProbeEvidenceDecor 只清洗成对外层装饰，单侧装饰保留，避免误改文件名。
const PROBE_EVIDENCE_SPLIT_RE = /[、;；|]+/
// 成对装饰映射：开字符 → 对应闭字符（自配对字符首尾相同）。与上方一致**不含** `.` 与 `/`。
const PROBE_EVIDENCE_DECOR_PAIRS = {
  '`': '`',
  '*': '*',
  _: '_',
  '"': '"',
  "'": "'",
  '(': ')',
  '[': ']',
  '<': '>',
  '（': '）',
  '「': '」',
  '『': '』',
  '【': '】',
  '《': '》',
}
// 反复剥除成对的外层装饰；必须匹配对应闭字符，且内部不能再出现该闭字符。
// 单侧装饰保留，仅 trim 外围空白；这样路径自身的首尾字符不会被误删。
function trimProbeEvidenceDecor(segment) {
  let s = segment.trim()
  for (;;) {
    if (s.length < 2) break
    const close = PROBE_EVIDENCE_DECOR_PAIRS[s[0]]
    if (close === undefined || s[s.length - 1] !== close) break
    const inner = s.slice(1, -1)
    if (inner.includes(close)) break
    s = inner.trim()
  }
  return s
}
export function extractProbeEvidenceRefs(plan) {
  if (typeof plan !== 'string' || plan === '') return []
  const refs = []
  for (const m of plan.matchAll(PROBE_EVIDENCE_RE)) {
    // 处理顺序固定：整体成对剥除（循环）→ 按拆分符拆分 → 每段成对剥除 + trim
    // → 过滤空串 → 按出现顺序去重（step-00 E10-E12 覆盖单侧不剥与成对剥除）。
    const wrapped = trimProbeEvidenceDecor(m[1])
    for (const segment of wrapped.split(PROBE_EVIDENCE_SPLIT_RE)) {
      const p = trimProbeEvidenceDecor(segment)
      if (p !== '' && !refs.includes(p)) refs.push(p)
    }
  }
  return refs
}

// save_probe 结果的模型可见内容（与 renderSavePlan 同契约：ContentBlock[]）。
// hasEvidence 二参由 output.render 传入（args.evidence 非空）；缺省走线索文案。
export function renderSaveProbe(value, hasEvidence) {
  return [{ type: 'text', text: (hasEvidence === true ? '探查证据报告已落盘：\n- ' : '探查线索已落盘：\n- ') + value.path }]
}
