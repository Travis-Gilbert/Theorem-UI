// SOURCING: lib/face/feel for the settings and their bounds, lib/figures for what the person chose of them; ui/slider with its label and value, laid out as the OpenUI slider view lays one out (components/artifacts/openui/views.tsx); the settings frame for the section. Settings sits outside the chat shell that mounts the figures (lib/theorem/runtime), so the face a person tries a change on is mounted here, with a slot for it to rest in as a reply's gutter has.
import { Slider as SliderPrimitive } from '@base-ui/react/slider'
import { useRef } from 'react'
import {
  SettingsBox,
  SettingsSection,
} from '@/components/settings/settings-frame'
import { Button } from '@/components/ui/button'
import { Slider } from '@/components/ui/slider'
import { FEEL_REST, FEEL_SPECS } from '@/lib/face/feel'
import type { FeelSpec } from '@/lib/face/feel'
import { theFace } from '@/lib/face/store'
import { useFigures } from '@/lib/figures'
import { FaceStage } from './face-stage'

const GROUPS = [...new Set(FEEL_SPECS.map((spec) => spec.group))].map(
  (group) => ({
    group,
    specs: FEEL_SPECS.filter((spec) => spec.group === group),
  }),
)

/** How many decimal places a setting's step asks for. */
const places = (step: number) =>
  step >= 1 ? 0 : (String(step).split('.')[1]?.length ?? 0)

/** A setting's value as the panel writes it. */
export function feelText({ step, unit }: FeelSpec, value: number) {
  const number = value.toFixed(places(step))
  if (!unit) return number
  return unit === '×' ? `${number}×` : `${number} ${unit}`
}

/** One setting: its name, its value, the slider, and what turning it does. */
function FeelSlider({ spec }: { spec: FeelSpec }) {
  const chosen = useFigures((state) => state.feel[spec.key])
  const setFeel = useFigures((state) => state.setFeel)
  const value = chosen ?? FEEL_REST[spec.key]
  return (
    <div className="flex flex-col gap-1.5" data-feel={spec.key}>
      <Slider
        className="flex flex-col gap-2"
        value={[value]}
        min={spec.min}
        max={spec.max}
        step={spec.step}
        onValueChange={(next) => {
          const picked = Array.isArray(next) ? next[0] : next
          // A step of a twentieth lands on 1.1500000000000001: keep what was meant.
          if (typeof picked === 'number')
            setFeel(spec.key, Number(picked.toFixed(places(spec.step))))
        }}
        getAriaValueText={(_, picked) => feelText(spec, picked)}
      >
        <div className="flex items-baseline justify-between gap-3 text-sm">
          <SliderPrimitive.Label>{spec.label}</SliderPrimitive.Label>
          <output
            className={
              chosen === undefined || chosen === spec.rest
                ? 'text-xs tabular-nums text-ink-muted'
                : 'text-xs font-medium tabular-nums text-ink'
            }
          >
            {feelText(spec, value)}
          </output>
        </div>
      </Slider>
      <p className="text-xs text-ink-muted">{spec.hint}</p>
    </div>
  )
}

/**
 * How Theo's movement feels, for the person to set: every number of
 * lib/face/feel as a slider, a way back to how it ships, and Theo itself on
 * the page to throw, poke and send across with each change in force.
 */
export function FaceFeel() {
  const changed = useFigures((state) =>
    FEEL_SPECS.some(
      ({ key, rest }) =>
        state.feel[key] !== undefined && state.feel[key] !== rest,
    ),
  )
  const resetFeel = useFigures((state) => state.resetFeel)
  const spot = useRef<HTMLSpanElement | null>(null)

  /** Sends Theo to the far end of the strip; it comes back by itself. */
  const send = () => {
    const rect = spot.current?.getBoundingClientRect()
    if (!rect) return
    const to = {
      x: (rect.left + rect.width / 2) / window.innerWidth,
      y: (rect.top + rect.height / 2) / window.innerHeight,
    }
    theFace().perform(
      {
        steps: [
          { op: 'go', to, over: 620 },
          { op: 'wait', ms: 900 },
        ],
      },
      { owner: 'settings' },
    )
  }

  return (
    <SettingsSection
      title="Theo’s movement"
      description="How it feels to throw, send and poke. Kept on this device."
      action={
        <Button
          variant="outline"
          size="sm"
          disabled={!changed}
          onClick={resetFeel}
        >
          Reset
        </Button>
      }
    >
      <SettingsBox>
        <div className="flex items-center gap-3 px-3 py-3" data-slot="feel-try">
          <span
            aria-hidden
            data-face-perch="live"
            className="flex size-8 shrink-0"
          />
          <p className="min-w-0 flex-1 text-xs text-ink-muted">
            Try each change on Theo here. Throw it, poke it, or carry it off;
            double-tap sends it back.
          </p>
          <Button variant="outline" size="sm" onClick={send}>
            Send it across
          </Button>
          <span
            ref={spot}
            aria-hidden
            className="size-8 shrink-0 rounded-full border border-dashed border-separator"
          />
        </div>
        {GROUPS.map(({ group, specs }) => (
          <fieldset key={group} className="flex flex-col gap-3 px-3 py-3">
            <legend className="float-left text-xs text-ink-faint">
              {group}
            </legend>
            <div className="grid gap-x-8 gap-y-4 sm:grid-cols-2">
              {specs.map((spec) => (
                <FeelSlider key={spec.key} spec={spec} />
              ))}
            </div>
          </fieldset>
        ))}
      </SettingsBox>
      <FaceStage />
    </SettingsSection>
  )
}
