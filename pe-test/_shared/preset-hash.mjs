// _shared/preset-hash.mjs — 只保留资产完整性 hash 的 re-export。
// 运行期台账链（manifest 读写夹具）已于 2026-09-25 死代码清理删除，
// 本文件不再提供任何台账夹具（隐藏/合成记录 hash 的用例一并退役）。

export { contentHash } from '../../plugins/dsh-extra-plan/lib/preset-sync.js'
