// 配置组件的内部 Client carrier。
// 仅由 settings 通过宿主官方 Loader Group 动态挂载；不提供 bundle row、公开 export 或业务副作用。
export const name = 'dsh-extra-plan-client-carrier'
export const inject = []
export function apply() {
  // dsh.client package manifest 驱动 lib/client.js 加载；此 entry 本身保持空实现。
}
