// _shared/preset-hash.mjs — 预设分发产物哈希与 manifest 读写（step-01 安装/同步共用）
// 原实现曾在安装分发、安装同步两个工具中复制，现抽为单点。
import { createHash } from 'node:crypto'
import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'

export function contentHash(dir) {
  const h = createHash('sha256')
  for (const file of ['preset.yml', 'agent.cordis.yml']) {
    const p = join(dir, file)
    if (!existsSync(p)) return null
    h.update(readFileSync(p))
  }
  return h.digest('hex')
}

export function readManifest(dir) {
  try { const m = JSON.parse(readFileSync(join(dir, 'dist-manifest.json'), 'utf8')); return m.distHash } catch { return null }
}

export function writeManifest(dir, hash) {
  writeFileSync(join(dir, 'dist-manifest.json'), JSON.stringify({ format: 1, distHash: hash }, null, 2) + '\n')
}
