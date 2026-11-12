// SOURCING: lib/face/feel for the settings and their bounds, lib/figures for what the person chose of them; the settings frame for the section, its box and its rows, with ui/slider where a row's control sits; ui/button. The box is laid out as Twenty's settings lay out a box that has a preview: the part a change is tried on at the top, small labels naming the groups of rows under it. That part stays at the top of the sheet while the rows scroll (the box is let overflow for it). Settings sits outside the chat shell that mounts the figures (lib/theorem/runtime), so the face a person tries a change on is mounted here, with a slot for it to rest in as a reply's gutter has.
import { useId, useRef } from 'react'
import {
  SettingsBox,
  SettingsRow,
  SettingsSection,
} from '@/components/settings/settings-frame'
import { Button } from '@/components/ui/button'
import { Slider } from '@/components/ui/slider'
import { FEEL_SPECS } from '@/lib/face/feel'
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

/** One setting as a row: what it is on the left; its value, the way back to what Theo ships with, and its slider on the right. */
function FeelRow({ spec }: { spec: FeelSpec }) {
  const chosen = useFigures((state) => state.feel[spec.key])
  const setFeel = useFigures((state) => state.setFeel)
  const resetFeel = useFigures((state) => state.resetFeel)
  const name = useId()
  const value = chosen ?? spec.rest
  const changed = value !== spec.rest
  return (
    <div data-feel={spec.key}>
      <SettingsRow
        title={<span id={name}>{spec.label}</span>}
        description={spec.hint}
      >
        <div className="flex w-52 shrink-0 flex-col gap-1.5">
          <div className="flex h-6 items-center justify-end gap-1.5">
            {changed && (
              <Button
                variant="ghost"
                size="xs"
                className="text-ink-muted"
                onClick={() => resetFeel(spec.key)}
              >
                Reset to {feelText(spec, spec.rest)}
              </Button>
            )}
            <output
              className={
                changed
                  ? 'text-xs font-medium tabular-nums text-ink'
                  : 'text-xs tabular-nums text-ink-muted'
              }
            >
              {feelText(spec, value)}
            </output>
          </div>
          <Slider
            aria-labelledby={name}
            value={[value]}
            min={spec.min}
            max={spec.max}
            step={spec.step}
            onValueChange={(next) => {
              const picked = Array.isArray(next) ? next[0] : next
              if (typeof picked === 'number')
                setFeel(spec.key, Number(picked.toFixed(places(spec.step))))
            }}
            getAriaValueText={(_, picked) => feelText(spec, picked)}
          />
        </div>
      </SettingsRow>
    </div>
  )
}

/** One group of settings: its name, then its rows. */
function FeelGroup({
  group,
  specs,
}: {
  group: string
  specs: ReadonlyArray<FeelSpec>
}) {
  const name = useId()
  return (
    <div role="group" aria-labelledby={name}>
      <p id={name} className="px-3 pt-2.5 text-xs text-ink-faint">
        {group}
      </p>
      <div className="divide-y divide-separator">
        {specs.map((spec) => (
          <FeelRow key={spec.key} spec={spec} />
        ))}
      </div>
    </div>
  )
}

/**
 * How Theo's movement feels, as a section of Settings: a row for each
 * setting, each with its own way back, and Theo on the page to try a change
 * on, in a strip that stays in view while the rows scroll. A change takes
 * hold as the thumb moves, on a throw already in the air too.
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

  /** Sends Theo to the spot at the strip's far end; it comes back by itself. */
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
          onClick={() => resetFeel()}
        >
          Reset all
        </Button>
      }
    >
      <SettingsBox className="divide-y-0 overflow-visible">
        <div
          className="sticky top-0 z-10 flex items-center gap-3 rounded-t-lg border-b border-separator bg-sheet px-3 py-2.5"
          data-slot="feel-try"
        >
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
        <div className="divide-y divide-separator">
          {GROUPS.map(({ group, specs }) => (
            <FeelGroup key={group} group={group} specs={specs} />
          ))}
        </div>
      </SettingsBox>
      <FaceStage />
    </SettingsSection>
  )
}
