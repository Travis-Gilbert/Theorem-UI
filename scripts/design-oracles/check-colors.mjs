import { readFile, mkdir, writeFile } from 'node:fs/promises'
import { auditPaletteCss, REQUIRED_PALETTE_PAIRS } from './colors.mjs'
const results = auditPaletteCss(
  await readFile(new URL('../../src/palettes.css', import.meta.url), 'utf8'),
)
const modes = results.filter((result) =>
  result.id.startsWith('COL-04.emitted-colors.'),
)
const minimumPairs=results.filter(result=>result.id.startsWith('COL-01.minimum.'))
const contractPairs=results.filter(result=>result.id.startsWith('COL-01.contract.'))
const failures = results.filter((result) => result.status !== 'pass')
if (modes.length !== 8)
  failures.push({
    id: 'COL-04.coverage',
    status: 'fail',
    observed: modes.length,
    expected: 8,
  })
if(minimumPairs.length!==REQUIRED_PALETTE_PAIRS.length*8||contractPairs.length!==REQUIRED_PALETTE_PAIRS.length*8)
  failures.push({id:'COL-01.coverage',status:'fail',observed:{standardRows:minimumPairs.length,contractRows:contractPairs.length,edgeCount:REQUIRED_PALETTE_PAIRS.length,modeCount:modes.length},expected:{standardRows:REQUIRED_PALETTE_PAIRS.length*8,contractRows:REQUIRED_PALETTE_PAIRS.length*8}})
await mkdir('docs/plans/composable-appearance/evidence', { recursive: true })
await writeFile(
  'docs/plans/composable-appearance/evidence/colors.json',
  JSON.stringify({ modes: modes.length, results, failures }, null, 2),
)
console.log(
  `${REQUIRED_PALETTE_PAIRS.length} required color edges × ${modes.length} built-in palette/mode sets; ${results.length} predicates; ${failures.length} failures`,
)
for (const failure of failures) console.error(failure.id, failure.observed)
if (failures.length) process.exitCode = 1
