// SOURCING: zustand + zustand/middleware persist (per-browser preference, as in shell-state); next-themes owns the light/dark axis and ignores a nested provider, so it cannot carry this second one
import { create } from 'zustand'
import { persist } from 'zustand/middleware'

/** Colour palettes (styles.css). Each has a light and a dark side; next-themes picks which. */
export const PALETTES = [
  { value: 'github-sharp', label: 'GitHub Sharp' },
  { value: 'stone', label: 'Stone' },
] as const

export type Palette = (typeof PALETTES)[number]['value']

const STORAGE_KEY = 'theorem-ui:palette'

type PaletteState = {
  palette: Palette
  setPalette: (palette: Palette) => void
}

export const usePalette = create<PaletteState>()(
  persist(
    (set) => ({
      palette: 'github-sharp',
      setPalette: (palette) => set({ palette }),
    }),
    { name: STORAGE_KEY, partialize: ({ palette }) => ({ palette }) },
  ),
)

if (typeof window !== 'undefined') {
  const apply = ({ palette }: PaletteState) =>
    document.documentElement.setAttribute('data-palette', palette)
  apply(usePalette.getState())
  usePalette.subscribe(apply)
}

/**
 * Runs in <head> before first paint, as next-themes' own script does for the
 * mode, so a saved palette never flashes the default. Reads the persisted
 * store's JSON directly.
 */
export const paletteScript = `try{var p=JSON.parse(localStorage.getItem(${JSON.stringify(STORAGE_KEY)})).state.palette;if(p)document.documentElement.setAttribute("data-palette",p)}catch(e){}`
