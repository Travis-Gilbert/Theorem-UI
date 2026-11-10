// SOURCING: DOMPurify (a snapshot is HTML an App produced), the browser's SVG
// `foreignObject` and canvas, and the frame theme's own resolver (theme.ts).
// That an App is pictured from its snapshot, in the page, is this app's.
import DOMPurify from 'dompurify'
import { resolvedTheme } from './sandbox/theme'

/** A picture of what an App showed. `data` is base64, with no `data:` prefix. */
export interface AppPicture {
  mediaType: 'image/png'
  data: string
  width: number
  height: number
}

/** The widest and tallest a picture is drawn, in CSS pixels. */
export const PICTURE_WIDTH = 1024
export const MAX_PICTURE_HEIGHT = 1536
/** How long the browser has to draw the picture. */
const DRAW_MS = 5_000

const XHTML = 'http://www.w3.org/1999/xhtml'

/**
 * A snapshot as an SVG image: the snapshot's own styles and body, laid out
 * `width` wide inside a `foreignObject`. An SVG drawn as an image runs no
 * script and loads nothing, so this is as inert as a picture.
 */
export function pictureSvg(
  snapshot: string,
  width: number,
  height: number,
  purify: Pick<typeof DOMPurify, 'sanitize'> = DOMPurify,
): string {
  const clean = purify.sanitize(snapshot, { FORCE_BODY: true })
  const page = new DOMParser().parseFromString(
    `<!doctype html><html><head></head><body>${clean}</body></html>`,
    'text/html',
  )
  const theme = resolvedTheme()
  const root = page.documentElement
  for (const [token, value] of Object.entries(theme.tokens))
    root.style.setProperty(token, value)
  root.style.setProperty('color-scheme', theme.mode)
  root.classList.toggle('dark', theme.mode === 'dark')
  // Inside an SVG the root is the `svg` element, so what an App styles on its
  // root is styled on the `html` element it is drawn in.
  for (const style of page.querySelectorAll('style'))
    style.textContent = style.textContent.replaceAll(':root', 'html')
  root.style.setProperty('display', 'block')
  root.style.setProperty('width', `${width}px`)
  root.style.setProperty('min-height', `${height}px`)
  // Serialized as XML, which is what a foreignObject holds.
  const body = new XMLSerializer().serializeToString(root)
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"><foreignObject x="0" y="0" width="${width}" height="${height}">${body.includes(XHTML) ? body : body.replace('<html', `<html xmlns="${XHTML}"`)}</foreignObject></svg>`
}

/**
 * Draws a snapshot as the App showed it, `height` tall. Undefined where the
 * browser will not let a page read back what it drew from an SVG.
 */
export async function pictureOf(
  snapshot: string,
  height: number,
): Promise<AppPicture | undefined> {
  const width = PICTURE_WIDTH
  const tall = Math.min(Math.max(Math.ceil(height), 1), MAX_PICTURE_HEIGHT)
  const image = new Image()
  image.decoding = 'sync'
  const loaded = new Promise<boolean>((resolve) => {
    image.onload = () => resolve(true)
    image.onerror = () => resolve(false)
    setTimeout(() => resolve(false), DRAW_MS)
  })
  image.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(pictureSvg(snapshot, width, tall))}`
  if (!(await loaded)) return undefined
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = tall
  const context = canvas.getContext('2d')
  if (!context) return undefined
  // An App with no background of its own is on the page's.
  context.fillStyle =
    getComputedStyle(document.documentElement).backgroundColor || '#fff'
  context.fillRect(0, 0, width, tall)
  context.drawImage(image, 0, 0)
  try {
    const url = canvas.toDataURL('image/png')
    return {
      mediaType: 'image/png',
      data: url.slice(url.indexOf(',') + 1),
      width,
      height: tall,
    }
  } catch {
    return undefined
  }
}
