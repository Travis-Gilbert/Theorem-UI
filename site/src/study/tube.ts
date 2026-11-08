// SOURCING: hand-rolled arithmetic over the tube's logical size, and React's own state and timers for the glass's three steps; kept free of three so the page can size the expanded app without loading the room.
import { useEffect, useState } from 'react'
import { LOGICAL } from '@/experience/experience'
import layout from './layout.json'

/** The tube is shown at most one CSS pixel to one viewport pixel: the app's text stays crisp and a little of the computer shows round it. */
export const TUBE_MAX_SCALE = 1

/** The raster's rounded corners, in the app's CSS pixels: the app on the glass takes the picture's shape. */
export const TUBE_RADIUS = (layout.screen.radius / (2 * layout.screen.halfWidth)) * LOGICAL.tube.width

interface Box {
  width: number
  height: number
}

/** The scale the tube is shown at in an area. */
export const tubeScaleIn = (area: Box) =>
  Math.min(TUBE_MAX_SCALE, area.width / LOGICAL.tube.width, area.height / LOGICAL.tube.height)

/** Expanded, the app lays out at the size that fills the whole area at the tube's scale, so it grows off the glass without its text changing size. */
export const expandedTube = (area: Box): Box => {
  const scale = tubeScaleIn(area)
  return { width: Math.round(area.width / scale), height: Math.round(area.height / scale) }
}

/**
 * The app on the glass. `off`: the tube plays the film or its loop, and the app, if
 * it is up, lies over it as it is. `dark`: the tube under the app shows nothing. `on`:
 * the app is screened over the tube, so the bowed glass's reflections of the room lie
 * on the picture, as light on a real tube adds to what it shows.
 */
export type Glass = 'off' | 'dark' | 'on'

/** The app fades in over the film's last frame in this time (styles.css), so the tube can go dark under it. */
const GLASS_DARK_MS = 300
/** After the tube is dark, and after an expanded app has shrunk back onto the glass. */
const GLASS_ON_MS = 450

/**
 * Screening the app over a tube that still shows the film would double the picture,
 * so the steps go in order: the app is opaque over the film, the tube goes dark under
 * it, and only then is the app screened over the glass. Expanded off the glass, the
 * app lies over the room as it is.
 */
export function useGlass(up: boolean, expanded: boolean): Glass {
  const [glass, setGlass] = useState<Glass>('off')
  useEffect(() => {
    if (!up) return setGlass('off')
    if (expanded) return setGlass('dark')
    const dark = setTimeout(() => setGlass((was) => (was === 'off' ? 'dark' : was)), GLASS_DARK_MS)
    const on = setTimeout(() => setGlass('on'), GLASS_ON_MS)
    return () => {
      clearTimeout(dark)
      clearTimeout(on)
    }
  }, [up, expanded])
  return glass
}
