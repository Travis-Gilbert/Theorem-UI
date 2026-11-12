// SOURCING: zustand + zustand/middleware persist (a per-browser preference, as lib/palette.ts keeps the palette and lib/figures.ts the figures). The composer materials are this app's: Paper (styles.css surface-paper, Paper Design's PaperTexture baked by lib/paper-texture.ts), frosted glass (styles.css surface-glass, after liquidGL's frost, tint, bevel and specular, drawn on the live backdrop) and liquid glass (styles.css surface-liquid, a WebGL pane over the Life field drawn by components/glass/liquid-glass, its renderer and shader adapted from ybouane/liquidglass).
import { create } from 'zustand'
import { persist } from 'zustand/middleware'

const STORAGE_KEY = 'theorem-ui:surfaces'

/** What the composer is made of. */
export type ComposerSurface = 'paper' | 'glass' | 'liquid'

export const COMPOSER_SURFACES: ReadonlyArray<{
  value: ComposerSurface
  label: string
}> = [
  { value: 'paper', label: 'Paper' },
  { value: 'glass', label: 'Frosted glass' },
  { value: 'liquid', label: 'Liquid glass' },
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

/** What the composer is made of, for the composer and the glass that follows it. */
export const useComposerSurface = () => useSurfaces((state) => state.composer)
