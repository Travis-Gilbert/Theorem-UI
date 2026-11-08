// SOURCING: hand-rolled data. Apart from experience.tsx so the room's shader and the Remotion film can read the tube's size without the page's machinery.

/** `tube` is the study's monitor in the scene: the app on the computer's own glass. */
export type AppLayout = 'desktop' | 'phone' | 'tube'

/** The app's fixed logical size per layout. The film's last frame is recorded at these sizes, so the still and the app always agree. The tube's is its raster's proportions. */
export const LOGICAL: Record<AppLayout, { width: number; height: number }> = {
  desktop: { width: 1280, height: 720 },
  phone: { width: 390, height: 720 },
  tube: { width: 1014, height: 732 },
}
