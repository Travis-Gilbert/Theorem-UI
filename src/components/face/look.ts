// SOURCING: next-themes (the resolved theme, as handlers/canvas reads it) and lib/figures' visor setting; the look the two give is lib/figures' faceLook. The theme's colours are read off <html> as the browser computes them and turned to sRGB by a 2D canvas, which takes any CSS colour; React's useSyncExternalStore shares the one reading. Which colour gives the hue is lib/face/tint's rule.
import { useSyncExternalStore } from 'react'
import { useTheme } from 'next-themes'
import { THEO } from '@/lib/face/identity'
import { themeHue } from '@/lib/face/tint'
import type { Rgb } from '@/lib/face/tint'
import { faceLook, useFigures } from '@/lib/figures'
import type { FaceLook } from '@/lib/figures'

/** How Theo is drawn here and now: with its visor or bare, as light or as ink. */
export function useFaceLook(): FaceLook {
  const visor = useFigures((state) => state.visor)
  const { resolvedTheme } = useTheme()
  return faceLook(visor, resolvedTheme === 'dark')
}

let probe: CanvasRenderingContext2D | null | undefined

/** A CSS colour as sRGB, or nothing when it is not a colour or is fully clear. */
function rgbOf(value: string): Rgb | undefined {
  if (!value) return undefined
  try {
    if (probe === undefined) {
      const canvas = document.createElement('canvas')
      canvas.width = 1
      canvas.height = 1
      probe = canvas.getContext('2d', { willReadFrequently: true })
    }
    if (!probe) return undefined
    probe.clearRect(0, 0, 1, 1)
    // A value the canvas cannot read leaves the clear colour, which is then nothing.
    probe.fillStyle = 'rgb(0 0 0 / 0)'
    probe.fillStyle = value
    probe.fillRect(0, 0, 1, 1)
    const [red = 0, green = 0, blue = 0, alpha = 0] = probe.getImageData(
      0,
      0,
      1,
      1,
    ).data
    if (alpha === 0) return undefined
    const part = 255 * (alpha / 255)
    return [red / part, green / part, blue / part]
  } catch {
    return undefined
  }
}

/** The hue the theme on <html> gives the face. */
function readHue(): number {
  const style = getComputedStyle(document.documentElement)
  const declared = style.getPropertyValue('--face-hue').trim()
  return themeHue(
    {
      declared: declared === '' ? undefined : Number(declared),
      ground: rgbOf(style.getPropertyValue('--surface-neutral').trim()),
      accent: rgbOf(style.getPropertyValue('--focus').trim()),
    },
    THEO.hue,
  )
}

let hue: number | undefined
const listeners = new Set<() => void>()
let watching: MutationObserver | undefined

/** Whatever changes the theme (mode, palette, a theme someone made) changes <html>'s attributes. */
function subscribe(listener: () => void) {
  listeners.add(listener)
  if (!watching) {
    watching = new MutationObserver(() => {
      const next = readHue()
      if (next === hue) return
      hue = next
      for (const each of listeners) each()
    })
    watching.observe(document.documentElement, { attributes: true })
  }
  return () => {
    listeners.delete(listener)
    if (listeners.size === 0) {
      watching?.disconnect()
      watching = undefined
      // Nobody is watching, so the next reader looks afresh.
      hue = undefined
    }
  }
}

const snapshot = () => (hue ??= readHue())
const serverSnapshot = () => THEO.hue

/** The hue of Theo's matter in the page's theme, in OKLCH degrees. It follows the theme as it changes. */
export function useFaceHue(): number {
  return useSyncExternalStore(subscribe, snapshot, serverSnapshot)
}

/** The eye colour of the still mark, as CSS, for a hue. */
export const eyeColour = (faceHue: number) =>
  `oklch(${THEO.lightness} ${THEO.chroma} ${faceHue.toFixed(1)})`
