function makeDiagnostic(document, taskId, field, value, message, template, line) {
  return {
    document,
    taskId,
    field,
    value: value === undefined || value === null ? '' : String(value),
    message,
    template: template || defaultTemplate(field, taskId),
    line: Number.isInteger(line) ? line : null
  }
}

function defaultTemplate(field, taskId) {
  const id = Number.isInteger(taskId) ? taskId : 1
  if (field === '派遣说明') return '- 派遣说明：先读方案和验收文件；完成后冻结再验收'
  if (field === '验收说明') return '- 验收说明：按检查ID分组复核，漏项不得通过'
  if (field === '任务块' || field === '任务ID') return '[任务' + id + '] 标题 / - 主文件：plugins/example/file.js / - 执行组：G1 / - 依赖：无'
  if (field === '检查块' || field === '检查ID') return '[检查1] 标题 / - 验收组：R1 / - 取证方式：只读复核 / - 工作目录：.'
  if (field === '收尾块') return '[收尾] / - 收尾依赖：[任务1] / - 收尾动作：完成收尾 / - 自检：已核对'
  if (field === '全局验收块') return '[全局验收] / - 期望：全部覆盖 / - 禁止：漏项 / - 正式验收：[检查1]'
  if (field === '主文件' || field === '收尾文件') return '- ' + field + '：plugins/example/file.js'
  if (field === '关联文件') return '- 关联文件：plugins/example/helper.js'
  if (field === '文件操作') return '- 文件操作：修改'
  if (field === '修改点' || field === '对应修改点') return '- ' + field + '：M1'
  if (field === '修改位置') return '- 修改位置：L12-34'
  if (field === '定位锚点') return '- 定位锚点：function example()'
  if (field === '生成来源') return '- 生成来源：plugins/example/source.js'
  if (field === '生成命令') return '- 生成命令：node generator.mjs'
  if (field === '生成产物') return '- 生成产物：说明目标文件结构'
  if (field === '验收定位') return '- 验收定位：修改后的符号或文件存在条件'
  if (field === '执行组') return '- 执行组：G1'
  if (field === '依赖' || field === '收尾依赖') return '- ' + field + '：无'
  if (field === '依赖理由') return '- 依赖理由：无'
  if (field === '分组理由') return '- 分组理由：无'
  if (field === '修改') return '- 修改：完成一个具体动作'
  if (field === '自检') return '- 自检：运行有限纯函数检查'
  if (field === '期望') return '- 期望：可验证的结果'
  if (field === '禁止') return '- 禁止：明确的边界'
  if (field === '正式验收') return '- 正式验收：[检查1]'
  if (field === '验收组') return '- 验收组：R1'
  if (field === '取证方式') return '- 取证方式：只读复核'
  if (field === '工作目录') return '- 工作目录：.'
  if (field === '检查') return '- 检查：明确的只读核对动作'
  if (field === '验收证据') return '- 验收证据：命令退出0且原始结果可读'
  if (field === '独占资源') return '- 独占资源：无'
  return '- ' + field + '：填写非空内容'
}

export { makeDiagnostic }
