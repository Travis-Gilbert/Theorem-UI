// SOURCING: lib/face/particles' grain buffer (x, y, radius, spare, premultiplied r, g, b, a), drawn by luma.gl when the browser has WebGL2 and by Canvas2D when it does not, as the study did (theorem-face-study src/renderer.js). The fallback draws the same grains; it is named as what it is and never called luma. Which grains are ink where the plate has drawn in is ./plate's.
import { GRAIN_STRIDE } from '@/lib/face/particles'
import { offPlate } from './plate'
import type { Plate } from './plate'

/** How the grains are drawn. */
export interface PaintLook {
  /** Matter with nothing dark under it is ink: dark, covering what is under it. With no `plate` that is all of it: a bare face on a light page. */
  ink?: boolean
  /** The plate behind the matter where it is not the whole canvas: matter on it is light, whatever `ink` says. */
  plate?: Plate
}

/** Something that draws the face's grains into a canvas. */
export interface Painter {
  /** `luma` or `canvas2d`: which one is drawing. */
  readonly kind: 'luma' | 'canvas2d'
  /**
   * Draws `count` grains from the buffer. Face units: `width` by `height`,
   * centre 0,0. Grains are light that adds; with `look.ink` those off the
   * plate (all of them, with no plate) are dark and cover what is under
   * them, for matter with nothing dark behind it on a light page.
   */
  draw: (
    grains: Float32Array,
    count: number,
    width: number,
    height: number,
    look?: PaintLook,
  ) => void
  destroy: () => void
}

/** How dark ink is, as a share of the grain's own colour: the hue stays, the light goes. */
export const INK = 0.2

/** Draws grains as discs with the 2D context. The same picture, without the halo. */
export function canvasPainter(canvas: HTMLCanvasElement): Painter | undefined {
  const context = canvas.getContext('2d')
  if (!context) return undefined
  return {
    kind: 'canvas2d',
    draw(grains, count, width, height, look = {}) {
      const { ink = false, plate } = look
      const ratio = Math.min(window.devicePixelRatio || 1, 2)
      const pixelWidth = Math.round(canvas.clientWidth * ratio)
      const pixelHeight = Math.round(canvas.clientHeight * ratio)
      if (canvas.width !== pixelWidth || canvas.height !== pixelHeight) {
        canvas.width = pixelWidth
        canvas.height = pixelHeight
      }
      const scale = pixelWidth / width
      context.setTransform(
        scale,
        0,
        0,
        scale,
        pixelWidth / 2,
        (height * scale) / 2,
      )
      context.globalCompositeOperation = 'source-over'
      context.clearRect(-width / 2, -height / 2, width, height)
      let inked: boolean | undefined
      for (let index = 0; index < count; index++) {
        const at = index * GRAIN_STRIDE
        const alpha = grains[at + 7] as number
        if (alpha <= 0.004) continue
        // Light adds, as in the luma painter; ink covers. A grain is one or the other by where its middle is.
        const dark =
          ink &&
          (!plate ||
            offPlate(plate, grains[at] as number, grains[at + 1] as number) > 0)
        if (dark !== inked) {
          inked = dark
          context.globalCompositeOperation = dark ? 'source-over' : 'lighter'
        }
        const shade = dark ? INK : 1
        const red = Math.round(
          ((grains[at + 4] as number) / alpha) * shade * 255,
        )
        const green = Math.round(
          ((grains[at + 5] as number) / alpha) * shade * 255,
        )
        const blue = Math.round(
          ((grains[at + 6] as number) / alpha) * shade * 255,
        )
        context.fillStyle = `rgba(${red},${green},${blue},${(alpha * 0.55).toFixed(3)})`
        context.beginPath()
        context.arc(
          grains[at] as number,
          grains[at + 1] as number,
          grains[at + 2] as number,
          0,
          Math.PI * 2,
        )
        context.fill()
      }
    },
    destroy() {},
  }
}

/**
 * The best painter this browser has: luma.gl on WebGL2, else Canvas2D. luma
 * is loaded only here, so a page that never shows the face never fetches it.
 * A canvas can hold one kind of context, so the fallback needs a fresh one:
 * `spare` makes it.
 */
export async function createPainter(
  canvas: HTMLCanvasElement,
  spare: () => HTMLCanvasElement,
): Promise<Painter | undefined> {
  try {
    const { lumaPainter } = await import('./luma')
    return await lumaPainter(canvas)
  } catch (error) {
    console.info('Theo is drawn with Canvas2D: WebGL2 is not available.', error)
    return canvasPainter(spare())
  }
}
