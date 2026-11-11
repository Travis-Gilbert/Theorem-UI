// SOURCING: zustand + zustand/middleware persist (a per-browser preference, as lib/palette.ts keeps the palette). Which figures the shell has is this app's: Kit, the fox that is simply there, and Theo, the agent's face.
import { create } from 'zustand'
import { persist } from 'zustand/middleware'

const STORAGE_KEY = 'theorem-ui:figures'

interface FiguresState {
  /** Kit, the fox loose in the window. */
  kit: boolean
  /** Theo, the face that shows what the agent is doing. */
  theo: boolean
  setKit: (on: boolean) => void
  setTheo: (on: boolean) => void
}

/** Whether each figure is shown. Each is its own switch; both default to on. */
export const useFigures = create<FiguresState>()(
  persist(
    (set) => ({
      kit: true,
      theo: true,
      setKit: (kit) => set({ kit }),
      setTheo: (theo) => set({ theo }),
    }),
    { name: STORAGE_KEY, version: 1 },
  ),
)
