// _shared/preset-hash.mjs — only fixture manifest writing remains here.
// Hashing and manifest reading are re-exported from the production state machine.

import { writeFileSync } from 'node:fs'
import { contentHash, readManifest } from '../../plugins/dsh-extra-plan/lib/preset-sync.js'

export { contentHash, readManifest }

// Fixture-only helper: create an old format-1 or synthetic recorded hash.
export function writeManifest(dir, hash) {
  writeFileSync(dir + '/dist-manifest.json', JSON.stringify({ format: 1, distHash: hash }, null, 2) + '\n')
}
