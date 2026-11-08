// SOURCING: hand-rolled numbers. The tube's edge shading, written once: the tube's shader puts it on the film (crt.tsx) and the live app's CSS over the glass reads it as custom properties (styles.css, .room-tube::after), so the handoff from one to the other changes nothing at the edge.

export const TUBE_EDGE = {
  /** A darkening toward the corners: from this share of the way out (CSS radial-gradient, farthest-corner) to this much black. */
  vignetteFrom: 0.58,
  vignette: 0.2,
  /** A soft shadow inside the raster's edge, as a CSS inset box-shadow: spread and blur in the app's CSS pixels, and its strength. */
  spread: 3,
  blur: 14,
  shadow: 0.3,
  /** A hairline at the edge itself. */
  line: 0.5,
}

/** The same numbers as the custom properties the tube's CSS reads. */
export const tubeEdgeStyle = () => ({
  '--tube-vignette-from': `${TUBE_EDGE.vignetteFrom * 100}%`,
  '--tube-vignette': `rgb(0 0 0 / ${TUBE_EDGE.vignette})`,
  '--tube-spread': `${TUBE_EDGE.spread}px`,
  '--tube-blur': `${TUBE_EDGE.blur}px`,
  '--tube-shadow': `rgb(0 0 0 / ${TUBE_EDGE.shadow})`,
  '--tube-line': `rgb(0 0 0 / ${TUBE_EDGE.line})`,
})
