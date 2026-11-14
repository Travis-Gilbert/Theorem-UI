// ARC-05 requires each portal kind in both checked states, per engine.
const engines = ['chromium', 'firefox', 'webkit']
const kinds = ['model', 'menu', 'tooltip', 'dialog', 'drawer']
const states = ['baseline', 'dark']
const requiredChecks = [
  'theme',
  'typography',
  'contrast',
  'portal',
  'density',
  'material',
]
const keyOf = (engine, kind, state) => [engine, kind, state].join('/')
const expected = engines.flatMap((engine) =>
  kinds.flatMap((kind) => states.map((state) => keyOf(engine, kind, state))),
)

export function validatePortalEvidence(evidence) {
  const rows = []
  const invalid = []
  const seen = new Set()
  let failed = false
  for (const report of Array.isArray(evidence?.portals)
    ? evidence.portals
    : []) {
    if (!Array.isArray(report?.rows)) continue
    for (const row of report.rows) {
      const key = keyOf(report.engine, row?.kind, row?.state)
      if (!expected.includes(key) || seen.has(key)) {
        invalid.push({ key, reason: 'unexpected or duplicate case' })
        continue
      }
      seen.add(key)
      rows.push({ engine: report.engine, ...row })
      const missingChecks = requiredChecks.filter(
        (check) => typeof row?.checks?.[check] !== 'boolean',
      )
      if (missingChecks.length || typeof row?.portaled !== 'boolean')
        invalid.push({
          key,
          reason: 'required measurement absent',
          missingChecks,
        })
      if (
        row?.portaled === false ||
        requiredChecks.some((check) => row?.checks?.[check] === false)
      )
        failed = true
    }
  }
  const missing = expected.filter((key) => !seen.has(key))
  return {
    status: failed
      ? 'fail'
      : invalid.length || missing.length
        ? 'not-measurable'
        : 'pass',
    rows,
    missing,
    invalid,
  }
}
