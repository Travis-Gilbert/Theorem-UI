// Supplemental COL-01 rendered state coverage, distinct from the token matrix.
export const engines = ['chromium', 'firefox', 'webkit']
export const modes = ['light', 'dark']
export const stateChecks = {
  'send/default': 'icon',
  'send/hover': 'icon',
  'send/pressed': 'icon',
  'send/focused': 'icon',
  'send/inactive': 'inactive-control',
  'stop/default': 'icon',
  'stop/hover': 'icon',
  'stop/pressed': 'icon',
  'navigation/selected': 'text',
  'model-option/highlighted': 'text',
  'message/error': 'text',
  'activity/loading': 'text',
}
const caseKey = (engine, mode) => [engine, mode].join('/')
const requiredCases = engines.flatMap((engine) =>
  modes.map((mode) => caseKey(engine, mode)),
)

export function validateColorStateEvidence(evidence) {
  const cases = Array.isArray(evidence?.cases) ? evidence.cases : []
  const missing = []
  const failed = []
  const seen = new Set()
  for (const item of cases) {
    const key = caseKey(item.engine, item.mode)
    if (!requiredCases.includes(key) || seen.has(key)) {
      missing.push({ key, reason: 'duplicate or unexpected engine and mode' })
      continue
    }
    seen.add(key)
    if (item.errors?.length) failed.push({ key, errors: item.errors })
    if (item.error) missing.push({ key, reason: item.error })
    for (const [name, kind] of Object.entries(stateChecks)) {
      const rows = item.rows?.filter((row) => row.name === name) ?? []
      const row = rows[0]
      if (
        rows.length !== 1 ||
        row.kind !== kind ||
        row.stateObserved !== true
      ) {
        missing.push({ key, name, reason: 'unique verified state absent' })
      } else if (row.status === 'fail') {
        failed.push({ key, name, ratio: row.ratio })
      } else if (
        kind === 'inactive-control'
          ? row.status !== 'not-applicable' || !row.reason
          : row.status !== 'pass' || !(row.ratio >= (kind === 'text' ? 4.5 : 3))
      ) {
        missing.push({
          key,
          name,
          reason: row.reason ?? 'readable paint not measured',
        })
      }
    }
  }
  for (const key of requiredCases)
    if (!seen.has(key)) missing.push({ key, reason: 'engine and mode absent' })
  return {
    status: failed.length ? 'fail' : missing.length ? 'not-measurable' : 'pass',
    missing,
    failed,
    cases,
  }
}
