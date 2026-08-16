// ledger-summary.mjs — usage 账本聚合工具（P3 A/B 读数）。
// 用法：node ledger-summary.mjs <ledger.jsonl>
// 输出：按 sessionId/role/model 分组统计 行数(调用次数)/hit(输入命中)/miss(输入未命中)/
//       out(输出) 合计，并按单价估算花费（pro 输入3/输出6，flash 输入1/输出2，
//       命中 0.025/0.02，¥/1M——与 Reasonix 本机价格表一致），最后给出 pro:flash 花费比。
// v11.8.1：按 (sessionId, seq) 去重（崩溃窗口可能产生的重复行；无 seq 的旧行不去重）。
import { readFileSync } from 'node:fs'

const path = process.argv[2]
if (path === undefined) {
  console.error('usage: node ledger-summary.mjs <ledger.jsonl>')
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
  const g = groups.get(key) ?? { sessionId: r.sessionId, role: r.role, model: r.model, calls: 0, hit: 0, miss: 0, out: 0, cost: 0 }
  g.calls += 1
  g.hit += Number(r.hit) || 0
  g.miss += Number(r.miss) || 0
  g.out += Number(r.out) || 0
  groups.set(key, g)
}
const list = [...groups.values()].sort((a, b) => a.sessionId.localeCompare(b.sessionId) || a.role.localeCompare(b.role) || a.model.localeCompare(b.model))
const byModel = { pro: { calls: 0, hit: 0, miss: 0, out: 0, cost: 0 }, flash: { calls: 0, hit: 0, miss: 0, out: 0, cost: 0 } }
for (const g of list) {
  const isPro = String(g.model).includes('pro')
  const bucket = byModel[isPro ? 'pro' : 'flash']
  bucket.calls += g.calls
  bucket.hit += g.hit
  bucket.miss += g.miss
  bucket.out += g.out
  const priceIn = isPro ? 3 : 1
  const priceOut = isPro ? 6 : 2
  g.cost = (g.hit * (isPro ? 0.025 : 0.02) + g.miss * priceIn + g.out * priceOut) / 1e6
  bucket.cost += g.cost
}
console.log('=== 分组明细（sessionId | role | model | calls | hit | miss | out | estCost¥） ===')
for (const g of list) {
  console.log(`${g.sessionId} | ${g.role} | ${g.model} | ${g.calls} | ${g.hit} | ${g.miss} | ${g.out} | ${g.cost.toFixed(4)}`)
}
console.log('=== 按模型汇总 ===')
for (const [name, b] of Object.entries(byModel)) {
  console.log(`${name}: calls=${b.calls} hit=${b.hit} miss=${b.miss} out=${b.out} estCost=¥${b.cost.toFixed(4)}`)
}
const totalCost = byModel.pro.cost + byModel.flash.cost
if (totalCost > 0) {
  console.log(`pro:flash 花费比 = ${(byModel.pro.cost / totalCost * 100).toFixed(1)} : ${(byModel.flash.cost / totalCost * 100).toFixed(1)}`)
}
console.log(`总行数（去重后调用次数合计）: ${rows.length}`)
