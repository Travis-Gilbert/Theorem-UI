import { createHash } from 'node:crypto'
import { LATIN_PROSE_V1_PARAGRAPHS } from '../../src/lib/appearance-corpus.mjs'

// The six paragraphs live in the actual-component fixture; the independent
// runner verifies their exact normalized bytes against the policy digest.
export { LATIN_PROSE_V1_PARAGRAPHS }
export const LATIN_PROSE_V1 = LATIN_PROSE_V1_PARAGRAPHS.join('\n\n')
export const LATIN_PROSE_V1_SHA256 = 'dbfeea1c559f50254d2a3f66388fe0c732fa7df09ab74fe0de7921d5860904f7'
export const LATIN_PROSE_V1_ACTUAL_SHA256 = createHash('sha256').update(LATIN_PROSE_V1, 'utf8').digest('hex')
export const LATIN_PROSE_V1_VALID = LATIN_PROSE_V1_ACTUAL_SHA256 === LATIN_PROSE_V1_SHA256

export const FONT_ASSET_EVIDENCE = Object.freeze([
  { family: 'IBM Plex Sans Variable', package: '@fontsource-variable/ibm-plex-sans', asset: 'files/ibm-plex-sans-latin-wght-normal.woff2', sha256: 'e2291e842cf5af167122a22881a740c7f2dda7716f1e8cd76680264f4a859470', scope: 'Latin variable upright, reference environment only' },
  { family: 'JetBrains Mono Variable', package: '@fontsource-variable/jetbrains-mono', asset: 'files/jetbrains-mono-latin-wght-normal.woff2', sha256: '18be452724bfdc236c074ca94a249a7f41a86752c7d04ab258ce9ed5651f6a7e', scope: 'Latin variable upright, reference environment only' },
])
