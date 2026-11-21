// SOURCING: Expo SDK 58 GlassEffect availability checks; React Native Reduce Transparency.
// Native checks stay behind the platform/accessibility gates, including older iOS runtimes.
export function canUseLiquidGlass({
  platform,
  reduceTransparency,
  designAvailable,
  apiAvailable,
}: {
  platform: string
  reduceTransparency: boolean
  designAvailable: () => boolean
  apiAvailable: () => boolean
}): boolean {
  if (platform !== 'ios' || reduceTransparency) return false
  try {
    return designAvailable() && apiAvailable()
  } catch {
    // A missing or incompatible native effect must not make the composer unusable.
    return false
  }
}
