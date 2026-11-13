// SOURCING: zustand and its persist middleware (the controls the popover writes, with the field's on/off kept across visits as lib/palette keeps a preference, and the counts the frame loop publishes)
import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { useAppearance } from '@/lib/appearance'
import type { PatternName } from './patterns'

/** What a press on the field does: toggle one cell, or stamp a pattern. */
export type Brush = 'cell' | PatternName

/** Written by the person, through the field's popover. */
interface Controls {
  /** The field is drawn behind the chat at all. */
  shown: boolean | undefined
  playing: boolean
  brush: Brush
  /** The agent plays along, seeding where the field is alive. */
  companion: boolean
}

export const useLifeControls = create<Controls>()(
  persist(
    (): Controls => ({
      shown: undefined,
      playing: true,
      brush: 'cell',
      companion: true,
    }),
    {
      name: 'theorem-ui:life',
      partialize: ({ shown, companion }) => ({ shown, companion }),
    },
  ),
)

/** Written only by the frame loop. */
interface Counts {
  generation: number
  population: number
  /** Generations per second right now, which rises with the model's activity. */
  pace: number
}

export const useLifeCounts = create<Counts>(() => ({ generation: 0, population: 0, pace: 0 }))

/** An explicit Life choice stays with the existing Life controls across preset changes. */
export function useLifeShown() {
  const shown = useLifeControls((state) => state.shown)
  const defaultShown = useAppearance((state) => state.appearance.life)
  return shown ?? defaultShown
}
