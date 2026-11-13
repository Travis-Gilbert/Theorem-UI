import { describe, expect, test } from 'bun:test'
import { wcagContrast } from 'culori'
import { appearanceTokens, modes } from '../../scripts/palettes'
import {
  APPEARANCE_VERSION,
  appearanceDocumentSchema,
  appearanceOverridesSchema,
  DEFAULT_APPEARANCE,
  migrateLegacyAppearance,
  resolveAppearance,
} from './appearance'
import {
  CALM_COLORS,
  COLOR_PAIRS,
  COLOR_ROLES,
  SURFACE_ROLES,
} from './appearance-policy'

const storage = (data: Record<string, unknown>) => ({
  getItem: (key: string) =>
    key in data ? JSON.stringify({ state: data[key] }) : null,
})

const candidate = (dark: boolean) => {
  const tokens = appearanceTokens(modes[dark ? 1 : 0]!, true)
  return Object.fromEntries(
    [...new Set(Object.values(COLOR_ROLES))].map((role) => [
      role,
      tokens[role],
    ]),
  )
}

const customPalette = () => ({
  name: 'Custom',
  light: candidate(false),
  dark: candidate(true),
})

describe('appearance selection', () => {
  test('the Calm manifest keeps all surfaces flat and Life off', () => {
    const appearance = resolveAppearance(DEFAULT_APPEARANCE)
    for (const role of SURFACE_ROLES)
      expect(appearance.materials[role]).toBe('flat')
    expect(appearance.life).toBe(false)
    for (const mode of modes.slice(0, 2)) {
      const tokens = appearanceTokens(mode, true)
      for (const [role, paint] of Object.entries(
        CALM_COLORS[mode.dark ? 'dark' : 'light'],
      ))
        expect(tokens[role]).toBe(paint)
    }
  })

  test('overrides survive preset changes and do not couple materials', () => {
    const overrides = appearanceOverridesSchema.parse({
      materials: { composer: 'liquid' },
      scales: { content: 1.5 },
    })
    const calm = resolveAppearance({ preset: 'calm', overrides })
    const expressive = resolveAppearance({ preset: 'expressive', overrides })
    expect(calm.scales).toEqual({ content: 1.5, ui: 1, code: 1 })
    expect(expressive.scales).toEqual(calm.scales)
    expect(calm.materials.composer).toBe('liquid')
    expect(calm.materials.navigation).toBe('flat')
    expect(expressive.materials.composer).toBe('liquid')
    expect(expressive.materials.navigation).toBe('glass')
  })

  test('migrates old deliberate palette and liquid surface choices', () => {
    const migrated = migrateLegacyAppearance(
      storage({
        'theorem-ui:palette': { palette: 'vitesse' },
        'theorem-ui:surfaces': { composer: 'liquid' },
      }),
    )
    expect(migrated).toEqual({
      preset: 'expressive',
      overrides: {
        palette: 'vitesse',
        materials: { composer: 'liquid', navigation: 'liquid' },
      },
    })
    expect(
      migrateLegacyAppearance(
        storage({ 'theorem-ui:palette': { palette: 'unknown' } }),
      ),
    ).toEqual(DEFAULT_APPEARANCE)
  })

  test('portable documents reject unsupported versions, fields, fonts and role names', () => {
    const portable = {
      version: APPEARANCE_VERSION,
      preset: 'expressive',
      overrides: {},
      mode: 'dark',
      life: false,
    } as const
    expect(
      appearanceDocumentSchema.parse(JSON.parse(JSON.stringify(portable))),
    ).toEqual(portable)
    expect(
      appearanceDocumentSchema.safeParse({ ...portable, version: 2 }).success,
    ).toBe(false)
    expect(
      appearanceOverridesSchema.safeParse({ customField: true }).success,
    ).toBe(false)
    expect(
      appearanceOverridesSchema.safeParse({ materials: { unknown: 'flat' } })
        .success,
    ).toBe(false)
    expect(
      appearanceOverridesSchema.safeParse({
        font: {
          textFamily: 'X; color:red',
          comfortableMeasure: 40,
          wideMeasure: 50,
        },
      }).success,
    ).toBe(false)
  })

  test('a portable input can request a font without assuming its measures', () => {
    const overrides = { font: { textFamily: 'Helvetica' } }
    expect(
      appearanceDocumentSchema.safeParse({
        version: APPEARANCE_VERSION,
        preset: 'calm',
        overrides,
      }).success,
    ).toBe(true)
    expect(appearanceOverridesSchema.safeParse(overrides).success).toBe(false)
  })

  test('rejects a candidate that passes on canvas and fails in selected state', () => {
    const valid = customPalette()
    expect(
      appearanceOverridesSchema.safeParse({
        palette: 'custom',
        customPalette: valid,
      }).success,
    ).toBe(true)
    expect(
      appearanceOverridesSchema.safeParse({ palette: 'custom' }).success,
    ).toBe(false)
    valid.light['surface-selected'] = valid.light.ink
    const invalid = appearanceOverridesSchema.safeParse({
      palette: 'custom',
      customPalette: valid,
    })
    expect(invalid.success).toBe(false)
    if (!invalid.success)
      expect(
        invalid.error.issues.some(({ message }) =>
          message.includes('primary on selected'),
        ),
      ).toBe(true)
  })

  test('every emitted built-in set satisfies all registered role pairs after quantization', () => {
    for (const mode of modes) {
      const sets = [appearanceTokens(mode)]
      if (mode.selector === ':root' || mode.selector === '.dark')
        sets.push(appearanceTokens(mode, true))
      for (const tokens of sets) {
        for (const { foreground, background, minimum } of COLOR_PAIRS) {
          const ink = tokens[COLOR_ROLES[foreground]]!
          const fill = tokens[COLOR_ROLES[background]]!
          expect(ink).toMatch(/^#[0-9a-f]{6}$/)
          expect(fill).toMatch(/^#[0-9a-f]{6}$/)
          expect(wcagContrast(ink, fill)).toBeGreaterThanOrEqual(minimum)
        }
      }
    }
  })
})
