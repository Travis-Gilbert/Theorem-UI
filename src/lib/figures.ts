// SOURCING: zustand + zustand/middleware persist (a per-browser preference, as lib/palette.ts keeps the palette). Which figures the shell has is this app's: Kit, the fox that is simply there, and Theo, the agent's face. Whether Theo has its visor is the owner's call (docs/plans/theo-face.md, "The visor"). How Theo's movement feels is lib/face/feel's set of numbers; what the person changed of it is kept here and put in force there.
import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { feelValue, tune } from './face/feel'
import type { Feel, FeelKey } from './face/feel'

const STORAGE_KEY = 'theorem-ui:figures'

/** Whether Theo's eyes sit on the dark visor: by theme, always, or never. */
export type Visor = 'auto' | 'on' | 'off'

export const VISORS: ReadonlyArray<{ value: Visor; label: string }> = [
  { value: 'auto', label: 'Auto' },
  { value: 'on', label: 'On' },
  { value: 'off', label: 'Off' },
]

/** How the face is drawn for a visor setting and a theme. */
export interface FaceLook {
  /** The dark plate is behind the eyes. */
  visor: boolean
  /** The eyes are drawn as dark ink, not as light: bare eyes on a light page. */
  ink: boolean
}

/**
 * The look a setting and a theme give. Light needs something dark behind it,
 * so `auto` keeps the visor on a light page and drops it on a dark one, where
 * the page is the contrast. Bare eyes on a light page cannot be light at all:
 * they are drawn as ink.
 */
export function faceLook(visor: Visor, dark: boolean): FaceLook {
  const shown = visor === 'on' || (visor === 'auto' && !dark)
  return { visor: shown, ink: !shown && !dark }
}

interface FiguresState {
  /** Kit, the fox loose in the window. */
  kit: boolean
  /** Theo, the face that shows what the agent is doing. */
  theo: boolean
  /** Theo's visor. */
  visor: Visor
  setKit: (on: boolean) => void
  setTheo: (on: boolean) => void
  setVisor: (visor: Visor) => void
  /** How Theo moves, where the person changed it. A setting not here is as Theo ships. */
  feel: Partial<Feel>
  /** Changes one setting of the feel; a value outside its bounds is brought inside. */
  setFeel: (key: FeelKey, value: number) => void
  /** Everything about the feel as Theo ships. */
  resetFeel: () => void
}

/**
 * Whether each figure is shown, Theo's visor, and how Theo's movement feels.
 * Each figure is its own switch; both default to on. A device that saved its
 * switches before the visor or the feel were choices gets `auto` and the
 * feel as shipped: persist lays what it saved over these. The feel takes
 * force as it is set and when what was saved is read back.
 */
export const useFigures = create<FiguresState>()(
  persist(
    (set, get) => ({
      kit: true,
      theo: true,
      visor: 'auto',
      setKit: (kit) => set({ kit }),
      setTheo: (theo) => set({ theo }),
      setVisor: (visor) => set({ visor }),
      feel: {},
      setFeel: (key, value) => {
        const next = feelValue(key, value)
        if (next === undefined) return
        const feel = { ...get().feel, [key]: next }
        tune(feel)
        set({ feel })
      },
      resetFeel: () => {
        tune()
        set({ feel: {} })
      },
    }),
    {
      name: STORAGE_KEY,
      version: 1,
      onRehydrateStorage: () => (state) => {
        if (state) tune(state.feel)
      },
    },
  ),
)
