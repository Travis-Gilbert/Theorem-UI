// SOURCING: Zustand persist, Zod and Culori, already used by the app's settings and palette generator.
import { wcagContrast } from 'culori'
import { z } from 'zod'
import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import {
  COLOR_PAIRS,
  COLOR_ROLES,
  MATERIALS,
  PALETTES,
  SURFACE_ROLES,
  TEXT_RECIPES,
} from './appearance-policy'
import type { Material, SurfaceRole } from './appearance-policy'

export const APPEARANCE_STORAGE_KEY = 'theorem-ui:appearance'
export const APPEARANCE_VERSION = 1

const paletteSchema = z.enum(PALETTES.map(({ value }) => value))
const presetSchema = z.enum(['calm', 'expressive'])
const modeSchema = z.enum(['system', 'light', 'dark'])
const material = z.enum(MATERIALS)
const density = z.enum(['compact', 'comfortable', 'touch'])
const reading = z.enum(['comfortable', 'wide'])
const layout = z.enum(['conversation', 'sidecar'])
const motion = z.enum(['system', 'reduced'])
const scale = z.number().min(0.75).max(2)
const fontFamily = z
  .string()
  .min(1)
  .max(80)
  .regex(/^[\p{L}\p{N}][\p{L}\p{N} _-]*$/u)
const lineHeight = z.number().min(1.2).max(2.5)
const measure = z.number().min(20).max(100)
const opaqueHex = z
  .string()
  .regex(/^#[0-9a-f]{6}$/i, 'Use an opaque, six-digit sRGB hex color.')
const customColorRoles = z.enum([...new Set(Object.values(COLOR_ROLES))])
const customColors = z.record(customColorRoles, opaqueHex)

export const customPaletteSchema = z
  .strictObject({
    name: z.string().trim().min(1).max(60),
    light: customColors,
    dark: customColors,
  })
  .superRefine((colors, context) => {
    for (const mode of ['light', 'dark'] as const) {
      for (const { foreground, background, minimum } of COLOR_PAIRS) {
        const ink = colors[mode][COLOR_ROLES[foreground]]
        const fill = colors[mode][COLOR_ROLES[background]]
        if (ink && fill && wcagContrast(ink, fill) < minimum) {
          context.addIssue({
            code: 'custom',
            path: [mode, foreground],
            message: `${foreground} on ${background} needs ${minimum}:1 contrast.`,
          })
        }
      }
    }
  })

export const customFontInputSchema = z.strictObject({
  textFamily: fontFamily,
  codeFamily: fontFamily.optional(),
  contentLineHeight: lineHeight.optional(),
  uiLineHeight: lineHeight.optional(),
  codeLineHeight: lineHeight.optional(),
  comfortableMeasure: measure.optional(),
  wideMeasure: measure.optional(),
})

const calibratedFontSchema = customFontInputSchema
  .extend({
    comfortableMeasure: measure,
    wideMeasure: measure,
  })
  .refine(
    ({ comfortableMeasure, wideMeasure }) => comfortableMeasure <= wideMeasure,
    {
      path: ['wideMeasure'],
      message:
        'The wide measure must be at least as large as the comfortable measure.',
    },
  )

const appearanceOptionsSchema = z
  .strictObject({
    palette: z.union([paletteSchema, z.literal('custom')]),
    customPalette: customPaletteSchema,
    density,
    reading,
    layout,
    motion,
    scales: z
      .strictObject({ content: scale, ui: scale, code: scale })
      .partial(),
    // Accept v1 reply overrides without resetting the rest of a saved theme.
    // Replies now share the canvas, so this obsolete override is not exported.
    materials: z
      .partialRecord(z.enum(SURFACE_ROLES), material)
      .transform((materials) => {
        delete materials['assistant-reading']
        return materials
      }),
  })
  .partial()

function checkCustomPalette({
  palette,
  customPalette,
}: z.infer<typeof appearanceOptionsSchema>) {
  return palette !== 'custom' || customPalette !== undefined
}

export const appearanceOverridesSchema = appearanceOptionsSchema
  .extend({ font: calibratedFontSchema.optional() })
  .refine(checkCustomPalette, {
    path: ['customPalette'],
    message: 'Select a validated custom palette.',
  })

export const appearanceSelectionSchema = z.strictObject({
  preset: presetSchema,
  overrides: appearanceOverridesSchema,
})

export const appearanceDocumentSchema = appearanceSelectionSchema.extend({
  version: z.literal(APPEARANCE_VERSION),
  mode: modeSchema.optional(),
  life: z.boolean().optional(),
  overrides: appearanceOptionsSchema
    .extend({ font: customFontInputSchema.optional() })
    .refine(checkCustomPalette, {
      path: ['customPalette'],
      message: 'Select a validated custom palette.',
    }),
})

export type AppearancePreset = z.infer<typeof presetSchema>
export type AppearanceMode = z.infer<typeof modeSchema>
export type AppearanceInput = z.infer<
  typeof appearanceDocumentSchema
>['overrides']
export type AppearanceOverrides = z.infer<typeof appearanceOverridesSchema>
export type AppearanceSelection = z.infer<typeof appearanceSelectionSchema>

const flatMaterials = Object.fromEntries(
  SURFACE_ROLES.map((role) => [role, 'flat']),
) as Record<SurfaceRole, Material>
const presetDefaults = {
  calm: { materials: flatMaterials, life: false },
  expressive: {
    materials: {
      ...flatMaterials,
      canvas: 'paper',
      navigation: 'glass',
      composer: 'paper',
      'user-message': 'paper',
    },
    life: true,
  },
} as const

export const DEFAULT_APPEARANCE: AppearanceSelection = {
  preset: 'calm',
  overrides: {},
}

export function resolveAppearance({ preset, overrides }: AppearanceSelection) {
  const defaults = presetDefaults[preset]
  return {
    preset,
    palette: overrides.palette ?? 'github-sharp',
    customPalette: overrides.customPalette,
    font: overrides.font,
    density: overrides.density ?? 'comfortable',
    reading: overrides.reading ?? 'comfortable',
    layout: overrides.layout ?? 'conversation',
    motion: overrides.motion ?? 'system',
    scales: { content: 1, ui: 1, code: 1, ...overrides.scales },
    materials: {
      ...defaults.materials,
      ...overrides.materials,
      'assistant-reading': 'flat' as const,
    },
    life: defaults.life,
  }
}

export type ResolvedAppearance = ReturnType<typeof resolveAppearance>

function storedState(storage: Pick<Storage, 'getItem'>, key: string): unknown {
  try {
    return JSON.parse(storage.getItem(key) ?? 'null')?.state
  } catch {
    return undefined
  }
}

export function migrateLegacyAppearance(
  storage: Pick<Storage, 'getItem'>,
): AppearanceSelection {
  const oldPalette = z
    .object({ palette: paletteSchema })
    .safeParse(storedState(storage, 'theorem-ui:palette'))
  const oldSurface = z
    .object({ composer: material })
    .safeParse(storedState(storage, 'theorem-ui:surfaces'))
  const oldLife = z
    .object({ shown: z.boolean() })
    .safeParse(storedState(storage, 'theorem-ui:life'))
  if (!oldPalette.success && !oldSurface.success && !oldLife.success)
    return DEFAULT_APPEARANCE
  return {
    preset: 'expressive',
    overrides: {
      ...(oldPalette.success && { palette: oldPalette.data.palette }),
      ...(oldSurface.success && {
        materials: {
          composer: oldSurface.data.composer,
          navigation:
            oldSurface.data.composer === 'liquid' ? 'liquid' : 'glass',
        },
      }),
    },
  }
}

interface AppearanceState extends AppearanceSelection {
  appearance: ResolvedAppearance
  selectPreset: (preset: AppearancePreset) => void
  setOverrides: (overrides: AppearanceOverrides) => void
  resetOverrides: () => void
  loadSelection: (selection: AppearanceSelection) => void
}

function initialAppearance() {
  try {
    return typeof window === 'undefined'
      ? DEFAULT_APPEARANCE
      : migrateLegacyAppearance(window.localStorage)
  } catch {
    return DEFAULT_APPEARANCE
  }
}

const initial = initialAppearance()
const withResolved = (selection: AppearanceSelection) => ({
  ...selection,
  appearance: resolveAppearance(selection),
})

export const useAppearance = create<AppearanceState>()(
  persist(
    (set) => ({
      ...withResolved(initial),
      selectPreset: (preset) =>
        set((state) =>
          withResolved(
            appearanceSelectionSchema.parse({
              preset,
              overrides: state.overrides,
            }),
          ),
        ),
      setOverrides: (patch) =>
        set((state) => {
          const overrides = appearanceOverridesSchema.parse({
            ...state.overrides,
            ...patch,
            scales: patch.scales
              ? { ...state.overrides.scales, ...patch.scales }
              : state.overrides.scales,
            materials: patch.materials
              ? { ...state.overrides.materials, ...patch.materials }
              : state.overrides.materials,
          })
          return withResolved({ preset: state.preset, overrides })
        }),
      resetOverrides: () =>
        set(({ preset }) => withResolved({ preset, overrides: {} })),
      loadSelection: (selection) =>
        set(withResolved(appearanceSelectionSchema.parse(selection))),
    }),
    {
      name: APPEARANCE_STORAGE_KEY,
      version: APPEARANCE_VERSION,
      partialize: ({ preset, overrides }) => ({ preset, overrides }),
      merge: (persisted, state) => {
        const parsed = appearanceSelectionSchema.safeParse(persisted)
        if (!parsed.success) {
          if (persisted !== undefined)
            console.warn(
              'Invalid saved appearance preferences:',
              parsed.error.issues,
            )
          return state
        }
        return { ...state, ...withResolved(parsed.data) }
      },
    },
  ),
)

export const useSurfaceMaterial = (role: SurfaceRole) =>
  useAppearance((state) => state.appearance.materials[role])

function applyAppearance(appearance: ResolvedAppearance) {
  const root = document.documentElement
  root.dataset.appearancePreset = appearance.preset
  root.dataset.palette = appearance.palette
  root.dataset.density = appearance.density
  root.dataset.readingWidth = appearance.reading
  root.dataset.appearanceMotion = appearance.motion
  root.dataset.appearanceState = JSON.stringify(appearance)
  for (const role of SURFACE_ROLES)
    root.setAttribute(`data-material-${role}`, appearance.materials[role])
  for (const [name, value] of Object.entries(appearance.scales))
    root.style.setProperty(`--appearance-scale-${name}`, `${value}`)
  const { font, customPalette } = appearance
  const properties = {
    '--appearance-prose-line-height': `calc(${TEXT_RECIPES.prose.size * (font?.contentLineHeight ?? TEXT_RECIPES.prose.lineHeight)}rem * var(--appearance-scale-content))`,
    '--appearance-font-text':
      font && `${JSON.stringify(font.textFamily)}, var(--font-sans)`,
    '--appearance-font-mono':
      font?.codeFamily &&
      `${JSON.stringify(font.codeFamily)}, var(--font-mono)`,
    '--appearance-measure-comfortable': font && `${font.comfortableMeasure}em`,
    '--appearance-measure-wide': font && `${font.wideMeasure}em`,
  }
  for (const [name, value] of Object.entries(properties)) {
    if (value) root.style.setProperty(name, value)
    else root.style.removeProperty(name)
  }
  for (const [name, recipe] of Object.entries(TEXT_RECIPES)) {
    const key = `--recipe-${name.replace('.', '-')}`
    const ratio = font?.[`${recipe.scale}LineHeight`] ?? recipe.lineHeight
    root.style.setProperty(
      key,
      `${recipe.weight} calc(${recipe.size}rem * var(--appearance-scale-${recipe.scale})) / ${ratio} var(--appearance-font-${recipe.family}, var(--font-${recipe.family === 'text' ? 'sans' : 'mono'}))`,
    )
  }
  for (const token of new Set(Object.values(COLOR_ROLES))) {
    for (const mode of ['light', 'dark'] as const) {
      const name = `--custom-${mode}-${token}`
      const value = customPalette?.[mode][token]
      if (value && appearance.palette === 'custom')
        root.style.setProperty(name, value)
      else root.style.removeProperty(name)
    }
  }
}

if (typeof window !== 'undefined') {
  applyAppearance(useAppearance.getState().appearance)
  useAppearance.subscribe(({ appearance }, { appearance: before }) => {
    if (appearance === before) return
    const reflows =
      appearance.density !== before.density ||
      appearance.reading !== before.reading ||
      appearance.layout !== before.layout ||
      appearance.font !== before.font ||
      Object.keys(appearance.scales).some(
        (key) =>
          appearance.scales[key as keyof typeof appearance.scales] !==
          before.scales[key as keyof typeof before.scales],
      )
    if (reflows) document.dispatchEvent(new Event('theorem-appearance-reflow'))
    applyAppearance(appearance)
  })
}

// Keep this early paint script to known enum values. The store validates the
// full envelope, custom data, and persisted overrides before applying them.
export const appearanceScript = `try {
  var read = function(key) { try { return JSON.parse(localStorage.getItem(key)); } catch (e) { return null; } };
  var saved = read(${JSON.stringify(APPEARANCE_STORAGE_KEY)});
  var state = saved?.version === ${APPEARANCE_VERSION} && ['calm', 'expressive'].includes(saved?.state?.preset) ? saved.state : null;
  var palettes = ${JSON.stringify(PALETTES.map(({ value }) => value))};
  var oldPalette = read('theorem-ui:palette')?.state?.palette;
  var oldSurface = read('theorem-ui:surfaces')?.state?.composer;
  var oldLife = read('theorem-ui:life')?.state?.shown;
  var legacy = palettes.includes(oldPalette) || ${JSON.stringify(MATERIALS)}.includes(oldSurface) || typeof oldLife === 'boolean';
  var root = document.documentElement;
  root.dataset.appearancePreset = state?.preset ?? (legacy ? 'expressive' : 'calm');
  var palette = state ? state.overrides?.palette : oldPalette;
  if (palettes.includes(palette)) root.dataset.palette = palette;
  var density = state?.overrides?.density;
  if (['compact', 'comfortable', 'touch'].includes(density)) root.dataset.density = density;
  if (state?.overrides?.reading === 'wide') root.dataset.readingWidth = 'wide';
} catch (e) {}`
