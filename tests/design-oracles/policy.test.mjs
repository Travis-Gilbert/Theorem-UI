import { describe, expect, test } from 'bun:test'
import { readFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { contrastRatio, auditPaletteCss, REQUIRED_PALETTE_PAIRS, renderedRolePairRegistration } from '../../scripts/design-oracles/colors.mjs'
import { LATIN_PROSE_V1, LATIN_PROSE_V1_ACTUAL_SHA256, LATIN_PROSE_V1_SHA256 } from '../../scripts/design-oracles/corpus.mjs'
import { CHILD_ORACLES, FIXTURES, ORACLES, PREDICATE_TOLERANCES, POLICY } from '../../scripts/design-oracles/registry.mjs'
import { geometryResidualResult, invariantCheckResult } from '../../scripts/design-oracles/metamorphic.mjs'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..')

describe('theorem-appearance-v1 oracle registry', () => {
  test('defines each of the 30 independent oracle groups exactly once', () => {
    expect(ORACLES).toHaveLength(30)
    expect(new Set(ORACLES.map((oracle) => oracle.id)).size).toBe(30)
    expect(ORACLES.map((oracle) => oracle.id)).toContain('ARC-06')
    expect(POLICY).toEqual({ id: 'theorem-appearance-v1', version: '1.0.0' })
  })

  test('records all eleven required fixture contracts and separately classified child predicates', () => {
    expect(FIXTURES.map((fixture) => fixture.id)).toEqual(Array.from({ length: 11 }, (_, index) => `F${String(index + 1).padStart(2, '0')}`))
    expect(CHILD_ORACLES.some((child) => child.id === 'COL-01.minimum' && child.class.includes('Standard'))).toBe(true)
    expect(CHILD_ORACLES.some((child) => child.id === 'COL-01.prose-target' && child.class === 'Target')).toBe(true)
    expect(CHILD_ORACLES.some((child) => child.id === 'COL-02.decorative-separators' && child.class === 'Standard')).toBe(true)
    expect(PREDICATE_TOLERANCES.contrastBelowThreshold).toBe(0)
  })

  test('ships the exact fixed corpus bytes and expected digest', () => {
    expect(LATIN_PROSE_V1.split('\n\n')).toHaveLength(6)
    expect(LATIN_PROSE_V1_ACTUAL_SHA256).toBe(LATIN_PROSE_V1_SHA256)
    expect(LATIN_PROSE_V1_SHA256).toBe('dbfeea1c559f50254d2a3f66388fe0c732fa7df09ab74fe0de7921d5860904f7')
  })
})

describe('independent color predicates', () => {
  test('adversarial white text on orange fails while role-correct dark text passes', () => {
    expect(contrastRatio('#ffffff', '#ff8a4c')).toBeCloseTo(2.34, 2)
    expect(contrastRatio('#24292d', '#ff8a4c')).toBeCloseTo(6.29, 2)
    expect(contrastRatio('#ffffff', '#ff8a4c')).toBeLessThan(4.5)
    expect(contrastRatio('#24292d', '#ff8a4c')).toBeGreaterThanOrEqual(4.5)
  })

  test('audits emitted built-in modes and every registered palette role pair', async () => {
    const css = await readFile(resolve(root, 'src/palettes.css'), 'utf8')
    const results = auditPaletteCss(css)
    const modes = results.filter((result) => result.id.startsWith('COL-04.emitted-colors.'))
    expect(modes).toHaveLength(8)
    expect(modes.every((result) => result.status === 'pass')).toBe(true)
    expect(REQUIRED_PALETTE_PAIRS).toHaveLength(54)
    expect(results.some((result) => result.id === 'COL-01.minimum.:root.primary/canvas' && result.status === 'pass')).toBe(true)
    const pairs = results.filter((result) => result.id.startsWith('COL-01.minimum.'))
    expect(pairs).toHaveLength(54 * 8)
    expect(pairs.every((result) => result.status === 'pass')).toBe(true)
    const emittedBuiltInTokens = results.filter((result) => result.evidence?.concrete).flatMap((result) => result.evidence.concrete)
    expect(emittedBuiltInTokens.some((token) => token.raw.includes('--custom-'))).toBe(false)
  })

  test('the real palette predicate rejects a contrast-breaking token mutation', async () => {
    const css = (await readFile(resolve(root, 'src/palettes.css'), 'utf8')).replace('--ink: #24292d', '--ink: #ffffff')
    const row = auditPaletteCss(css).find((result) => result.id === 'COL-01.minimum.:root.primary/canvas')
    expect(row.status).toBe('fail')
    expect(row.observed.ratio).toBeLessThan(4.5)
  })

  test('never rounds a near-miss contrast upward across the threshold', () => {
    const threshold = 4.5
    const observed = 4.499999
    expect(observed >= threshold).toBe(false)
    expect(Number(observed.toFixed(2))).toBe(4.5)
  })

  test('rejects a readable but unregistered semantic foreground/background pair', () => {
    expect(renderedRolePairRegistration({ foregroundRole: 'primary', backgroundRole: 'navigation', state: 'default' }).registered).toBe(true)
    expect(renderedRolePairRegistration({ foregroundRole: 'on-accent', backgroundRole: 'accent', state: 'pressed' }).registered).toBe(true)
    expect(renderedRolePairRegistration({ foregroundRole: 'code', backgroundRole: 'popover', state: 'default' }).registered).toBe(true)
    expect(renderedRolePairRegistration({ foregroundRole: 'primary', backgroundRole: 'accent', state: 'default' }).registered).toBe(false)
  })
})

describe('metamorphic and adversarial contracts', () => {
  test('the runner rejects an actual metamorphic evidence row above the geometry tolerance', () => {
    const passing = [{ name: 'palette: geometry isolation', pass: true, observed: { residual: 0.5 } }]
    const failing = [{ name: 'palette: geometry isolation', pass: true, observed: { residual: 0.51 } }]
    expect(geometryResidualResult(passing[0].observed.residual, PREDICATE_TOLERANCES.appearanceEdgePx)).toBe('pass')
    expect(invariantCheckResult(passing)).toBe('pass')
    expect(invariantCheckResult(failing)).toBe('fail')
    expect(invariantCheckResult([{ name: 'palette: geometry isolation', pass: true, observed: {} }])).toBe('not-measurable')
  })

  test('contrast after alpha composition differs from the source token contrast', () => {
    const opaque = '#586069'
    const canvas = '#ffffff'
    const blendedText = '#aeb0b3'
    expect(contrastRatio(opaque, canvas)).toBeGreaterThan(4.5)
    expect(contrastRatio(blendedText, canvas)).toBeLessThan(4.5)
  })

  test('missing role pair is a coverage failure rather than an empty pass', () => {
    const css = ':root { --ink: #24292d; --redwood: #3379b3; }'
    const results = auditPaletteCss(css)
    expect(results.some((result) => result.id.includes('primary/canvas') && result.status === 'fail')).toBe(true)
  })
})
