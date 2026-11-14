// SOURCING: next-themes owns the light/dark axis; appearance owns the semantic palette.
import { useAppearance } from './appearance'
import { PALETTES } from './appearance-policy'
import type { Palette } from './appearance-policy'

export { PALETTES, type Palette }

export const setPalette = (palette: Palette) =>
  useAppearance.getState().setOverrides({ palette })
export const usePalette = () =>
  useAppearance((state) => state.appearance.palette)

/** The light and dark Shiki themes of the current palette, for code blocks and diffs. */
export const useCodeThemes = () =>
  useAppearance(
    ({ appearance }) =>
      (
        PALETTES.find(({ value }) => value === appearance.palette) ??
        PALETTES[0]
      ).code,
  )
