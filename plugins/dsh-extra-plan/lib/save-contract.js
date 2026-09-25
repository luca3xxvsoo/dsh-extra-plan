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

// 本地时间戳 yyyyMMddHHmmss（文件名唯一性 + 可读性）。
export function timestamp() {
  const d = new Date()
  const pad = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`
}

// 会话标识段（T3）：session header id 去除分隔符后前 8 位字母数字。单段、无连字符，
// 便于按「时间戳前一段」识别；取不到 id（测试夹具/异常会话）→ ''（相关隔离随之关闭）。
export function sessionTagOf(sessionId) {
  return typeof sessionId === 'string' ? sessionId.replace(/[^A-Za-z0-9]/g, '').slice(0, 8) : ''
}

// save_plan 文件名 base（T3）：任务短名（可空）+ 调用方会话标识段 + 本地时间戳。
// T3 后主会话与规划子代理可同秒各落一份 save_plan：base 内嵌会话标识使文件名与
// journal 名天然互不相同（跨角色同秒撞名不再可能）；journal 内容另存该标识供
// recoverJournals 精确过滤（见 atomicCommit/recoverJournals）。
export function savePlanBase(nameSeg, sessionId) {
  const tag = sessionTagOf(sessionId)
  return (nameSeg === '' ? '' : nameSeg + '-') + (tag === '' ? '' : tag + '-') + timestamp()
}

// save_plan 结果的模型可见内容（v0.1.3 修复）：output.render 契约必须返回
// ContentBlock[]（宿主第一方工具均如此，见 dsh-tool-pwsh L355），不能返回裸
// 字符串——否则 DeepSeek 适配器 serializeMessages 的 flattenText 会对字符串调
// .filter 抛 TypeError，被外层包装成 TRANSPORT、重试 3 连败（毫秒级），表现为
// "save_plan 后子代理必死"。此函数导出供场景测试锁死契约。
export function renderSavePlan(value) {
  return [{ type: 'text', text: '方案已落盘（原子双写）：\n- ' + value.paths.join('\n- ') }]
}

// ── save_probe：探查线索落盘的机械上限（导出供测试，防复制漂移） ──
// 条目数/单条长度/总量均为设计值；调整须同步 PROBE_LIMITS、测试、文档三处。
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

// 提取方案中【探查者已核实】标注引用的证据文件路径（纯函数，导出供测试）。
// 契约：标注行须含「证据：<路径>」（如：【探查者已核实】·证据：.extra-plan/证据-xxx.md）。
//
// ⚠ 本条为【清洗误伤修正记录】——若再遇「文件存在却判不存在」，先读本段与
//   下方 trimProbeEvidenceDecor 的注释：上一轮曾把装饰剥除写成「**单侧**循环剥除」
//   （凡首/末字符落在装饰集内就剥，不要求成对），于是把合法路径**自身**的首末字符也
//   剥掉（`_private.md` → `private.md`、`(abc).md` → `abc).md`、`[草稿]说明.md` →
//   `草稿]说明.md`；三例均已拿备份旧实现实测复核）。现改为「成对剥除」，并把拆分符收紧为
//   不含空格与半角逗号（两者性质不同，见下方拆分符注释）。
// 装饰剥离集**不含** `.` 与 `/`——相对路径以 `.` 开头、扩展名以 `.md` 结尾，剥掉即毁路径。
const PROBE_EVIDENCE_RE = /【探查者已核实】[^\n]*?证据[：:]\s*([^\s，。；）】\n]+)/g
// 多路径分隔符：顿号/分号/竖线。**故意不含空格与半角逗号**，但两者性质不同：
// ① 空格项是**冗余**——上方捕获正则本就排除全部空白，含空格路径在**捕获阶段**即被截断
//   （实测 `我的 说明.md` 只捕获到带前导装饰的 `我的），拆分符永远轮不到它；
// ② 半角逗号能通过捕获（排除集里只有全角 `，`），若当拆分符，合法路径 `report,1.md` 会被
//   劈成 `report` 与 `1.md` 两段后判不存在（本项目列举多路径统一用顿号）。
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
// **成对**剥除证据引用段的首尾装饰，可循环处理多层包裹（`` `"path"` `` → `path`）。
// 语义与理由：装饰的作用是「**包裹**」，故只有成对出现才应剥除——首字符须是开装饰、
// 末字符须是其对应闭装饰，且**中间不再出现该闭装饰**（否则说明反引号在中途就已闭合，
// 如 `` `A`、`B` `` 是两条各自包裹的引用连列，整体并不构成一个包裹）。
// 单侧出现的装饰字符更可能是文件名本身的一部分（`_private.md`、`(abc).md` 的首字符），
// 一律**不剥**，只 trim 首尾空白。
// 若再遇「证据文件存在却判不存在」，先核对该函数是否又退化成单侧剥除。
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
