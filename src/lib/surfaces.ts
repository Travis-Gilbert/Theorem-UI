// SOURCING: semantic surface materials from the versioned appearance store.
import { useAppearance, useSurfaceMaterial } from './appearance'
import type { Material } from './appearance-policy'

export type ComposerSurface = Material

export const COMPOSER_SURFACES: ReadonlyArray<{
  value: Material
  label: string
}> = [
  { value: 'flat', label: 'Flat' },
  { value: 'paper', label: 'Paper' },
  { value: 'glass', label: 'Frosted glass' },
  { value: 'liquid', label: 'Liquid glass' },
]

export const useComposerSurface = () => useSurfaceMaterial('composer')

/** Compatibility for the existing material comparison story. */
export const useSurfaces = {
  getState: () => ({
    composer: useAppearance.getState().appearance.materials.composer,
    setComposer: (composer: Material) =>
      useAppearance.getState().setOverrides({ materials: { composer } }),
  }),
}
