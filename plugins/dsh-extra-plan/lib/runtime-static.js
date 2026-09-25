// @local/dsh-extra-plan runtime-static helpers.
// Explicit-argument pure helpers only; no ctx or per-apply state.

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
