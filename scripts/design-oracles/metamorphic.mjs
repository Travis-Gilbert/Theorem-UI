export function geometryResidualResult(residual, tolerance = 0.5) {
  if (!Number.isFinite(residual) || !Number.isFinite(tolerance) || tolerance < 0) return 'not-measurable'
  return residual <= tolerance ? 'pass' : 'fail'
}

export function invariantCheckResult(checks, { requireAny = true, geometryTolerance = 0.5 } = {}) {
  if (!Array.isArray(checks) || (!checks.length && requireAny)) return 'not-measurable'
  for (const check of checks) {
    if (check.pass === false) return 'fail'
    const match = check.name?.match(/geometry isolation/i)
    if (match && geometryResidualResult(check.observed?.residual, geometryTolerance) !== 'pass') return geometryResidualResult(check.observed?.residual, geometryTolerance)
  }
  return checks.length ? 'pass' : 'not-measurable'
}
