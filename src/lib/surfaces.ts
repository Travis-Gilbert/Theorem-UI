// SOURCING: zustand + zustand/middleware persist (a per-browser preference, as lib/palette.ts keeps the palette and lib/figures.ts the figures). The two composer materials are this app's: Paper (styles.css surface-paper, Paper Design's PaperTexture baked by lib/paper-texture.ts) and frosted glass (styles.css surface-glass, after liquidGL's frost, tint, bevel and specular, drawn on the live backdrop).
import { create } from 'zustand'
import { persist } from 'zustand/middleware'

const STORAGE_KEY = 'theorem-ui:surfaces'

/** What the composer is made of. */
export type ComposerSurface = 'paper' | 'glass'

export const COMPOSER_SURFACES: ReadonlyArray<{
  value: ComposerSurface
  label: string
}> = [
  { value: 'paper', label: 'Paper' },
  { value: 'glass', label: 'Frosted glass' },
]

interface SurfacesState {
  /** The composer's material. Paper is as Theorem shipped. */
  composer: ComposerSurface
  setComposer: (composer: ComposerSurface) => void
}

export const useSurfaces = create<SurfacesState>()(
  persist(
    (set) => ({
      composer: 'paper',
      setComposer: (composer) => set({ composer }),
    }),
    {
      name: STORAGE_KEY,
      version: 1,
      partialize: ({ composer }) => ({ composer }),
    },
  ),
)

/** Whether the composer is glass. */
export const useGlassComposer = () =>
  useSurfaces((state) => state.composer === 'glass')
