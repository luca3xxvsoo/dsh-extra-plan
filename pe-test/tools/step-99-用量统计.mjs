// step-99-用量统计.mjs（原 ledger-summary.mjs）— usage 账本聚合工具（P3 A/B 读数）。
// 用法：node step-99-用量统计.mjs <ledger.jsonl>
// 口径：纯 token 统计 —— 按 sessionId | role | model 分组，统计 行数(调用次数)/hit(输入命中)/miss(输入未命中)/
//       out(输出)/cw(缓存写入 cacheWriteTokens)/rs(推理 reasoningTokens) 合计，并展示该组 provider
//       （同组取首个非空值，空显示 -）；旧行缺 provider/cw/rs 时按 空串/0/0 处理。
//       只累计 token 字段，不做任何折算，也不做任何按 provider 或按 model 的汇总。
// v11.8.1：按 (sessionId, seq) 去重（崩溃窗口可能产生的重复行；无 seq 的旧行不去重）。
import { readFileSync } from 'node:fs'

const path = process.argv[2]
if (path === undefined) {
  console.error('usage: node step-99-用量统计.mjs <ledger.jsonl>')
  process.exit(1)
}
const lines = readFileSync(path, 'utf8').split('\n').filter((line) => line.trim() !== '')
const rows = []
const seen = new Set()
let lineNo = 0
for (const line of lines) {
  lineNo += 1
  try {
    const row = JSON.parse(line)
    if (row !== null && typeof row === 'object' && typeof row.sessionId === 'string') {
      const key = typeof row.seq === 'number' ? `${row.sessionId}|${row.seq}` : `${row.sessionId}|n${lineNo}`
      if (seen.has(key)) continue
      seen.add(key)
      rows.push(row)
    }
  } catch (error) { /* 跳过坏行 */ }
}
const groups = new Map()
for (const r of rows) {
  const key = `${r.sessionId}|${r.role}|${r.model}`
  const g = groups.get(key) ?? { sessionId: r.sessionId, role: r.role, model: r.model, provider: '', calls: 0, hit: 0, miss: 0, out: 0, cw: 0, rs: 0 }
  if (g.provider === '' && typeof r.provider === 'string' && r.provider !== '') g.provider = r.provider
  g.calls += 1
  g.hit += Number(r.hit) || 0
  g.miss += Number(r.miss) || 0
  g.out += Number(r.out) || 0
  g.cw += Number(r.cacheWriteTokens) || 0
  g.rs += Number(r.reasoningTokens) || 0
  groups.set(key, g)
}
const list = [...groups.values()].sort((a, b) => a.sessionId.localeCompare(b.sessionId) || a.role.localeCompare(b.role) || a.model.localeCompare(b.model))
console.log('=== 分组明细（sessionId | role | model | provider | calls | hit | miss | out | cw | rs） ===')
for (const g of list) {
  const provider = g.provider === '' ? '-' : g.provider
  console.log(`${g.sessionId} | ${g.role} | ${g.model} | ${provider} | ${g.calls} | ${g.hit} | ${g.miss} | ${g.out} | ${g.cw} | ${g.rs}`)
}
console.log(`总行数（去重后调用次数合计）: ${rows.length}`)
