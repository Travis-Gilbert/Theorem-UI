// SOURCING: Intl.NumberFormat (significant digits, compact notation); the time
// rescaling is a table of four units, which no installed library offers for a
// value that arrives with its unit as a string.

const plain = new Intl.NumberFormat('en', { maximumSignificantDigits: 3 })
const compact = new Intl.NumberFormat('en', {
  notation: 'compact',
  maximumSignificantDigits: 3,
})

/** A number as people read it: three significant digits, compact past ten thousand. */
export const formatNumber = (value: number) =>
  Math.abs(value) >= 1e4 ? compact.format(value) : plain.format(value)

/** Seconds per unit, for the time units an artifact may state its values in. */
const SECONDS: Record<string, number> = {
  ns: 1e-9,
  µs: 1e-6,
  us: 1e-6,
  ms: 1e-3,
  s: 1,
}
const TIME_SCALE = [
  ['s', 1],
  ['ms', 1e-3],
  ['µs', 1e-6],
  ['ns', 1e-9],
] as const

/** A time in the unit that keeps its digits readable: 0.5 ms reads 500 µs. */
function rescaleTime(value: number, unit: string): [number, string] {
  const base = SECONDS[unit]
  if (base === undefined || value === 0) return [value, unit]
  const seconds = value * base
  const [to, size] =
    TIME_SCALE.find(([, s]) => Math.abs(seconds) >= s) ?? TIME_SCALE[3]
  return [seconds / size, to]
}

/** Units written against the number. */
const TIGHT = new Set(['%', 'x', '×'])

/**
 * A value with its unit, as the artifact shows it. Text values (a verdict,
 * "Never") pass through; numbers keep three significant digits.
 */
export function formatValue(
  value: number | string | null | undefined,
  unit?: string | null,
): string {
  if (value === null || value === undefined) return '–'
  if (typeof value === 'string') return value
  if (!Number.isFinite(value)) return '–'
  if (!unit) return formatNumber(value)
  const [scaled, shown] = rescaleTime(value, unit)
  const digits = formatNumber(scaled)
  if (TIGHT.has(shown)) return `${digits}${shown === 'x' ? '×' : shown}`
  return `${digits} ${shown}`
}
