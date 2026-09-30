// 仅接受显式参数的纯 helper；不依赖 ctx，也不保存 per-apply 状态。

export function causeChainOf(error, depth) {
  const chain = []
  let current = error
  for (let i = 0; i < depth && current !== undefined && current !== null; i += 1) {
    chain.push({
      name: typeof current.name === 'string' ? current.name : '',
      message: typeof current.message === 'string' ? current.message.slice(0, 400) : '',
      ...(current.code !== undefined ? { code: String(current.code) } : {}),
    })
    current = current.cause
  }
  return chain
}
