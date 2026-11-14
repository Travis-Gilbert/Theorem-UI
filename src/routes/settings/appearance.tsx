// SOURCING: next-themes (light/dark), lib/palette (colours), lib/surfaces (what the composer is made of), lib/life/store (the field behind the chat), lib/figures (Kit and Theo), components/face/face-feel (how Theo moves), coss ui SegmentedControl, the settings frame
import { createFileRoute } from '@tanstack/react-router'
import { useTheme } from 'next-themes'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { useCopyToClipboard } from '@/hooks/use-copy-to-clipboard'
import {
  SegmentedControl,
  SegmentedControlItem,
} from '@/components/coss/segmented-control'
import { Icon } from '@/components/icons'
import {
  SettingsBox,
  SettingsPage,
  SettingsRow,
  SettingsSection,
} from '@/components/settings/settings-frame'
import { FaceFeel } from '@/components/face/face-feel'
import { FaceMark } from '@/components/face/face-mark'
import { VISORS, useFigures } from '@/lib/figures'
import { useLifeControls, useLifeShown } from '@/lib/life/store'
import {
  PALETTES,
  SURFACE_ROLES,
  CALM_COLORS,
  COLOR_ROLES,
} from '@/lib/appearance-policy'
import {
  APPEARANCE_VERSION,
  appearanceDocumentSchema,
  appearanceOverridesSchema,
  customFontInputSchema,
  useAppearance,
} from '@/lib/appearance'
import type {
  AppearanceMode,
  AppearanceSelection,
  AppearanceOverrides,
  AppearanceInput,
} from '@/lib/appearance'
import { LATIN_PROSE_V1_PARAGRAPHS } from '@/lib/appearance-corpus.mjs'
import { COMPOSER_SURFACES } from '@/lib/surfaces'

export const Route = createFileRoute('/settings/appearance')({
  component: AppearanceSettings,
})

const THEMES = [
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' },
  { value: 'system', label: 'System' },
]

/** One choice of a segmented control; the control slides its indicator to the pressed item. */
function Choice({
  pressed,
  onPress,
  label,
}: {
  pressed: boolean
  onPress: () => void
  label: string
}) {
  return (
    <SegmentedControlItem
      size="sm"
      aria-pressed={pressed}
      data-pressed={pressed ? '' : undefined}
      onClick={onPress}
    >
      {label}
    </SegmentedControlItem>
  )
}

export function AppearanceSettings() {
  const { theme, setTheme } = useTheme()
  const { appearance, overrides, selectPreset, setOverrides, resetOverrides } =
    useAppearance()
  const lifeShown = useLifeShown()
  const lifeOverride = useLifeControls((state) => state.shown)
  const reset = () => {
    resetOverrides()
    setTheme('system')
    useLifeControls.setState({ shown: undefined })
  }
  const figures = useFigures()
  return (
    <SettingsPage
      title="Appearance"
      description="How Theorem looks on this device."
      action={
        <Button variant="outline" onClick={reset}>
          Reset appearance
        </Button>
      }
    >
      <SettingsSection title="Display">
        <SettingsBox>
          <SettingsRow
            title="Preset"
            description="Switch the overall look while keeping your appearance choices."
          >
            <SegmentedControl size="sm" aria-label="Appearance preset">
              <Choice
                label="Calm"
                pressed={appearance.preset === 'calm'}
                onPress={() => selectPreset('calm')}
              />
              <Choice
                label="Expressive"
                pressed={appearance.preset === 'expressive'}
                onPress={() => selectPreset('expressive')}
              />
            </SegmentedControl>
          </SettingsRow>
          <SettingsRow
            Mark={Icon.Sun}
            title="Theme"
            description="Light, dark, or whatever the system uses."
          >
            <SegmentedControl size="sm" aria-label="Theme">
              {THEMES.map(({ value, label }) => (
                <Choice
                  key={value}
                  label={label}
                  pressed={theme === value}
                  onPress={() => setTheme(value)}
                />
              ))}
            </SegmentedControl>
          </SettingsRow>
          <SettingsRow
            Mark={Icon.Layout}
            title="Colors"
            description="The palette for both display modes."
          >
            <select
              aria-label="Colors"
              className="appearance-select"
              value={appearance.palette}
              onChange={(event) => {
                const value = event.currentTarget.value
                const palette = PALETTES.find((item) => item.value === value)
                if (palette) setOverrides({ palette: palette.value })
                else if (value === 'custom' && appearance.customPalette)
                  setOverrides({ palette: 'custom' })
              }}
            >
              {PALETTES.map(({ value, label }) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
              {appearance.customPalette && (
                <option value="custom">{appearance.customPalette.name}</option>
              )}
            </select>
          </SettingsRow>
          <SettingsRow
            title="Content size"
            description="Conversation, headings, and the message editor."
          >
            <ScaleControl
              label="Content size"
              value={appearance.scales.content}
              onChange={(content) => setOverrides({ scales: { content } })}
            />
          </SettingsRow>
          <SettingsRow title="Density" description="Spacing and control sizes.">
            <select
              aria-label="Density"
              className="appearance-select"
              value={appearance.density}
              onChange={(event) =>
                setOverrides({
                  density: event.currentTarget
                    .value as AppearanceOverrides['density'],
                })
              }
            >
              <option value="compact">Compact</option>
              <option value="comfortable">Comfortable</option>
              <option value="touch">Touch</option>
            </select>
          </SettingsRow>
          <SettingsRow
            title="Reading width"
            description="Preferred conversation width when there is room."
          >
            <SegmentedControl size="sm" aria-label="Reading width">
              <Choice
                label="Comfortable"
                pressed={appearance.reading === 'comfortable'}
                onPress={() => setOverrides({ reading: 'comfortable' })}
              />
              <Choice
                label="Wide"
                pressed={appearance.reading === 'wide'}
                onPress={() => setOverrides({ reading: 'wide' })}
              />
            </SegmentedControl>
          </SettingsRow>
          <SettingsRow
            Mark={Icon.Grip}
            title="Life field"
            description="A Game of Life behind the chat that quickens as the model works. Right-click empty space for its controls."
          >
            <SegmentedControl size="sm" aria-label="Life field">
              <Choice
                label="On"
                pressed={lifeShown}
                onPress={() => useLifeControls.setState({ shown: true })}
              />
              <Choice
                label="Off"
                pressed={!lifeShown}
                onPress={() => useLifeControls.setState({ shown: false })}
              />
            </SegmentedControl>
          </SettingsRow>
        </SettingsBox>
      </SettingsSection>
      <SettingsSection
        title="Materials"
        description="Choose how each surface is painted."
      >
        <SettingsBox>
          {SURFACE_ROLES.map((role) => (
            <SettingsRow key={role} title={SURFACE_LABELS[role]}>
              <select
                aria-label={`${SURFACE_LABELS[role]} material`}
                className="appearance-select"
                value={appearance.materials[role]}
                onChange={(event) => {
                  const value = event.currentTarget.value
                  const material = COMPOSER_SURFACES.find(
                    (item) => item.value === value,
                  )
                  if (material)
                    setOverrides({ materials: { [role]: material.value } })
                }}
              >
                {COMPOSER_SURFACES.map(({ value, label }) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </SettingsRow>
          ))}
        </SettingsBox>
      </SettingsSection>
      <SettingsSection title="Advanced">
        <SettingsBox>
          <SettingsRow title="Interface text size">
            <ScaleControl
              label="Interface text size"
              value={appearance.scales.ui}
              onChange={(ui) => setOverrides({ scales: { ui } })}
            />
          </SettingsRow>
          <SettingsRow title="Code text size">
            <ScaleControl
              label="Code text size"
              value={appearance.scales.code}
              onChange={(code) => setOverrides({ scales: { code } })}
            />
          </SettingsRow>
          <SettingsRow title="Composer layout">
            <SegmentedControl size="sm" aria-label="Composer layout">
              <Choice
                label="Conversation"
                pressed={appearance.layout === 'conversation'}
                onPress={() => setOverrides({ layout: 'conversation' })}
              />
              <Choice
                label="Tools above editor"
                pressed={appearance.layout === 'sidecar'}
                onPress={() => setOverrides({ layout: 'sidecar' })}
              />
            </SegmentedControl>
          </SettingsRow>
          <SettingsRow title="Motion">
            <SegmentedControl size="sm" aria-label="Motion">
              <Choice
                label="System"
                pressed={appearance.motion === 'system'}
                onPress={() => setOverrides({ motion: 'system' })}
              />
              <Choice
                label="Reduced"
                pressed={appearance.motion === 'reduced'}
                onPress={() => setOverrides({ motion: 'reduced' })}
              />
            </SegmentedControl>
          </SettingsRow>
        </SettingsBox>
        <AppearanceImport
          selection={{ preset: appearance.preset, overrides }}
          mode={theme as AppearanceMode | undefined}
          life={lifeOverride}
          onModeChange={setTheme}
        />
      </SettingsSection>
      <SettingsSection title="Figures">
        <SettingsBox>
          <SettingsRow
            Mark={FaceMark}
            title="Theo"
            description="The agent’s face. It shows what Theorem is doing, reacts to you, and sleeps when nothing is happening. Tap it, carry it, or double-tap to send it home."
          >
            <SegmentedControl size="sm" aria-label="Theo">
              <Choice
                label="On"
                pressed={figures.theo}
                onPress={() => figures.setTheo(true)}
              />
              <Choice
                label="Off"
                pressed={!figures.theo}
                onPress={() => figures.setTheo(false)}
              />
            </SegmentedControl>
          </SettingsRow>
          <SettingsRow
            Mark={FaceMark}
            title="Theo’s visor"
            description="The dark screen behind Theo’s eyes. Auto keeps it in the light theme and drops it in the dark one, where the eyes glow against the page. Without it in the light theme, the eyes are drawn dark."
          >
            <SegmentedControl size="sm" aria-label="Theo’s visor">
              {VISORS.map(({ value, label }) => (
                <Choice
                  key={value}
                  label={label}
                  pressed={figures.visor === value}
                  onPress={() => figures.setVisor(value)}
                />
              ))}
            </SegmentedControl>
          </SettingsRow>
          <SettingsRow
            Mark={Icon.Sparkle}
            title="Kit"
            description="The fox that lives in the window. It is just there: it walks, sits and naps on its own."
          >
            <SegmentedControl size="sm" aria-label="Kit">
              <Choice
                label="On"
                pressed={figures.kit}
                onPress={() => figures.setKit(true)}
              />
              <Choice
                label="Off"
                pressed={!figures.kit}
                onPress={() => figures.setKit(false)}
              />
            </SegmentedControl>
          </SettingsRow>
        </SettingsBox>
      </SettingsSection>
      {figures.theo ? <FaceFeel /> : null}
    </SettingsPage>
  )
}

const SURFACE_LABELS = {
  canvas: 'Canvas',
  navigation: 'Navigation',
  composer: 'Composer',
  'user-message': 'Sent messages',
  'assistant-reading': 'Replies',
  popover: 'Menus and tooltips',
  artifact: 'Artifacts',
  status: 'Status feedback',
} as const

function ScaleControl({
  label,
  value,
  onChange,
}: {
  label: string
  value: number
  onChange: (value: number) => void
}) {
  return (
    <input
      className="appearance-select w-24"
      type="number"
      aria-label={label}
      min={75}
      max={200}
      step={5}
      key={value}
      defaultValue={Math.round(value * 100)}
      onBlur={(event) => {
        const input = event.currentTarget
        const next = input.valueAsNumber / 100
        if (Number.isFinite(next) && next >= 0.75 && next <= 2) onChange(next)
        else input.value = String(Math.round(value * 100))
      }}
      onKeyDown={(event) => {
        if (event.key === 'Enter') event.currentTarget.blur()
      }}
      aria-description="Percentage of browser text size"
    />
  )
}

function AppearanceImport({
  selection,
  mode: currentMode,
  life: currentLife,
  onModeChange,
}: {
  selection: AppearanceSelection
  mode: AppearanceMode | undefined
  life: boolean | undefined
  onModeChange: (mode: AppearanceMode) => void
}) {
  const [text, setText] = useState<string>()
  const [message, setMessage] = useState('')
  const [invalid, setInvalid] = useState(false)
  const { isCopied, copyToClipboard } = useCopyToClipboard({
    onError: () => {
      setInvalid(true)
      setMessage(
        'Could not copy current settings. Check clipboard access and try again.',
      )
    },
  })
  const documentValue = {
    version: APPEARANCE_VERSION,
    ...selection,
    mode: currentMode,
    life: currentLife,
  }
  const documentText = JSON.stringify(documentValue, null, 2)
  const apply = async () => {
    let candidate: unknown
    try {
      candidate = JSON.parse(text ?? documentText)
    } catch {
      setInvalid(true)
      setMessage('Enter valid JSON.')
      return
    }
    const parsed = appearanceDocumentSchema.safeParse(candidate)
    if (!parsed.success) {
      setInvalid(true)
      setMessage(
        parsed.error.issues
          .map(
            ({ path, message: issue }) =>
              `${path.join('.') || 'Appearance'} — ${issue}`,
          )
          .join(' '),
      )
      return
    }
    const { preset, overrides, mode, life } = parsed.data
    try {
      const calibrated = await calibrateOverrides(overrides)
      useAppearance.getState().loadSelection({ preset, overrides: calibrated })
      if (mode) onModeChange(mode)
      useLifeControls.setState({ shown: life })
      // Resume the live export, but keep edits made while calibration ran.
      setText((current) => (current === text ? undefined : current))
    } catch (error) {
      setInvalid(true)
      setMessage(error instanceof Error ? error.message : String(error))
      return
    }
    setInvalid(false)
    setMessage('Appearance settings applied.')
  }
  return (
    <details className="appearance-import rounded-lg border border-separator p-3">
      <summary className="cursor-pointer" data-appearance-recipe="ui.label">
        Custom appearance
      </summary>
      <div className="mt-3 flex min-w-0 flex-col gap-3">
        <p data-appearance-recipe="metadata" className="text-ink-muted">
          Edit or paste appearance settings as JSON. Custom colors must be
          opaque sRGB and meet the readability checks. Font profiles reference
          an installed font. The app measures the reading widths when you apply
          a profile. Copy current settings exports the active appearance without
          changing your JSON draft.
        </p>
        <textarea
          className="min-h-32 w-full min-w-0 rounded-lg border border-control p-2"
          data-appearance-recipe="code"
          aria-label="Custom appearance JSON"
          value={text ?? documentText}
          onChange={(event) => setText(event.currentTarget.value)}
        />
        <div className="flex flex-wrap gap-2">
          <Button onClick={() => void apply()}>Apply custom appearance</Button>
          <Button
            variant="outline"
            onClick={() => {
              setInvalid(false)
              setMessage('')
              void copyToClipboard(documentText)
            }}
          >
            {isCopied ? 'Current settings copied' : 'Copy current settings'}
          </Button>
          <Button
            variant="outline"
            onClick={() => {
              setText(
                JSON.stringify(
                  {
                    ...documentValue,
                    overrides: {
                      ...selection.overrides,
                      font: {
                        textFamily: 'IBM Plex Sans Variable',
                      },
                    },
                  },
                  null,
                  2,
                ),
              )
              setMessage('')
            }}
          >
            Load font example
          </Button>
          <Button
            variant="outline"
            onClick={() => {
              const example = Object.fromEntries(
                (['light', 'dark'] as const).map((mode) => [
                  mode,
                  resolvedColors(mode),
                ]),
              )
              setText(
                JSON.stringify(
                  {
                    ...documentValue,
                    overrides: {
                      ...selection.overrides,
                      palette: 'custom',
                      customPalette: { name: 'Custom palette', ...example },
                    },
                  },
                  null,
                  2,
                ),
              )
              setMessage('')
            }}
          >
            Load palette example
          </Button>
        </div>
        {message && (
          <p
            role={invalid ? 'alert' : 'status'}
            data-appearance-recipe="metadata"
          >
            {message}
          </p>
        )}
      </div>
    </details>
  )
}

function resolvedColors(mode: 'light' | 'dark') {
  const root = document.documentElement
  // Read emitted built-in rules directly so the current preset stays active.
  const names = new Set(Object.values(COLOR_ROLES))
  const fixed = CALM_COLORS[mode] as Record<string, string>
  const stylesheetRules = Array.from(document.styleSheets).flatMap((sheet) => {
    try {
      return Array.from(sheet.cssRules)
    } catch {
      return []
    }
  })
  const base = stylesheetRules.find(
    (rule) =>
      rule instanceof CSSStyleRule &&
      rule.selectorText === (mode === 'dark' ? '.dark' : ':root') &&
      rule.style.getPropertyValue('--redwood-hover'),
  ) as CSSStyleRule | undefined
  const fallback = getComputedStyle(root)
  return Object.fromEntries(
    [...names].map((name) => {
      const token = name === 'popover' ? 'surface-raised' : name
      return [
        name,
        fixed[token] ??
          (
            base?.style.getPropertyValue(`--${token}`) ||
            fallback.getPropertyValue(`--${token}`)
          ).trim(),
      ]
    }),
  )
}

async function calibrateOverrides(
  overrides: AppearanceInput,
): Promise<AppearanceOverrides> {
  if (!overrides.font) return appearanceOverridesSchema.parse(overrides)
  const font = customFontInputSchema.parse(overrides.font)
  await verifyFontFamily(font.textFamily)
  if (font.codeFamily) await verifyFontFamily(font.codeFamily)
  const sample = document.createElement('div')
  Object.assign(sample.style, {
    position: 'fixed',
    visibility: 'hidden',
    inset: '0 auto auto 0',
    width: 'max-content',
    whiteSpace: 'normal',
    margin: '0',
    padding: '0',
    font: `400 16px / 1.5 ${JSON.stringify(font.textFamily)}, var(--font-sans)`,
    fontKerning: 'normal',
    fontSynthesis: 'none',
    letterSpacing: 'normal',
    wordSpacing: 'normal',
  })
  const runs = LATIN_PROSE_V1_PARAGRAPHS.map((text) => {
    const run = document.createElement('span')
    run.style.display = 'table'
    run.textContent = text
    sample.append(run)
    return run
  })
  document.body.append(sample)
  try {
    const segmenter = new Intl.Segmenter('en', { granularity: 'grapheme' })
    const advance = runs.reduce(
      (total, run) => total + run.getBoundingClientRect().width,
      0,
    )
    const count = LATIN_PROSE_V1_PARAGRAPHS.reduce(
      (total, text) => total + Array.from(segmenter.segment(text)).length,
      0,
    )
    const measure = (target: number) =>
      Math.round((target * advance) / count / 4) / 4
    return appearanceOverridesSchema.parse({
      ...overrides,
      font: {
        ...font,
        comfortableMeasure: measure(80),
        wideMeasure: measure(100),
      },
    })
  } finally {
    sample.remove()
  }
}

async function verifyFontFamily(family: string) {
  const quoted = JSON.stringify(family)
  const probe = 'WmjQ 0185 Theorem reading profile'
  await document.fonts.load(`400 32px ${quoted}`, probe)
  await document.fonts.ready
  // FontFaceSet.load() can resolve to an empty array for both installed
  // and missing families. A rendered width change from a known fallback
  // confirms that the request has an effect on this browser.
  const canvas = document.createElement('canvas').getContext('2d')
  if (!canvas)
    throw new Error('This browser could not measure the custom font.')
  const width = (font: string) => {
    canvas.font = `400 32px ${font}`
    return canvas.measureText(probe).width
  }
  const found = ['monospace', 'serif'].some(
    (fallback) =>
      Math.abs(width(`${quoted}, ${fallback}`) - width(fallback)) > 0.01,
  )
  if (!found)
    throw new Error(`The font ${quoted} is unavailable on this device.`)
}
