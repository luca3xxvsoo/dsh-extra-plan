// 可由宿主加载且无副作用的 bridge；relative loader 解析本包的 ./client export。
// 保持 inject 为空：package metadata 驱动加载，apply 不产生 runtime 副作用。
export const name = 'dsh-extra-plan-client-bridge'
export const inject = []
export function apply() {
  // 特意留空——只有 package.json 的 dsh.client 生效。
}
