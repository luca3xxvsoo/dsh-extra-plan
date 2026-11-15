// plan/checklist 渲染纯函数：step-00 与 step-06 的逐字同体实现收敛到本模块（G3 测试侧技术债）。
// 只做 lines.push 文本拼装，不引入任何依赖；调用方用 import 别名保持调用点不变。
export function renderPlanFile(lines, label, record, actionLabel = '修改') {
  lines.push('- ' + label + '：' + record.path)
  lines.push('- 文件操作：' + record.operation)
  for (const point of record.points || []) {
    lines.push('- 修改点：' + point.id)
    if (record.operation === '修改') {
      lines.push('- 修改位置：' + point.location)
      lines.push('- 定位锚点：' + point.anchor)
    }
    for (const source of point.sources || []) lines.push('- 生成来源：' + source)
    for (const command of point.commands || []) lines.push('- 生成命令：' + command)
    for (const output of point.outputs || []) lines.push('- 生成产物：' + output)
    lines.push('- ' + actionLabel + '：' + point.action)
  }
}

export function renderChecklistFile(lines, label, record) {
  lines.push('- ' + label + '：' + record.path)
  lines.push('- 文件操作：' + record.operation)
  for (const point of record.points || []) {
    lines.push('- 对应修改点：' + point.id)
    lines.push('- 验收定位：' + point.acceptance)
    for (const expectation of point.expectations || ['结果可验证']) lines.push('- 期望：' + expectation)
  }
}
