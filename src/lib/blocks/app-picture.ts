// SOURCING: DOMPurify (a snapshot is HTML an App produced), the browser's SVG
// `foreignObject` and canvas, and the frame theme's own resolver (theme.ts).
// That an App is pictured from its snapshot, in the page, is this app's.
import DOMPurify from 'dompurify'
import { PAGE_ATTRIBUTE, PAGE_BACKGROUND } from './sandbox/protocol'
import type { PageAttributes } from './sandbox/protocol'
import { resolvedTheme } from './sandbox/theme'

/**
 * A picture of what an App showed, in the shape a turn takes a picture out of
 * a result by: `type: 'image'`, a media type, and `data` as base64 with no
 * `data:` prefix. The model is shown it as an image, not as text.
 */
export interface AppPicture {
  type: 'image'
  mediaType: 'image/png' | 'image/jpeg'
  data: string
  width: number
  height: number
}

/**
 * The most base64 one picture is sent as. The route a check answers on takes
 * 2 MiB in all, and the answer carries the check's findings as well.
 */
export const MAX_PICTURE_BASE64 = 1024 * 1024

/** The widest and tallest a picture is drawn, in CSS pixels. */
export const PICTURE_WIDTH = 1024
export const MAX_PICTURE_HEIGHT = 1536
/** How long the browser has to draw the picture. */
const DRAW_MS = 5_000

const XHTML = 'http://www.w3.org/1999/xhtml'
/** Stands for `:root` in a picture, where the root is the `svg` element. */
const ROOT_CLASS = 'theorem-pictured-root'

/** Puts on `element` what the App's own element carried, by the names allowed. */
function carry(element: Element, attributes: Record<string, string> = {}) {
  for (const [name, value] of Object.entries(attributes))
    if (PAGE_ATTRIBUTE.test(name)) element.setAttribute(name, value)
}

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
  attributes?: PageAttributes,
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
  // A snapshot is the body's contents. A class or a style on the App's body
  // or root is what much of its CSS hangs from, so they are put back. The
  // frame's root already had the theme on it, so what it carried is the theme
  // as the App saw it, and stands in place of the page's.
  carry(root, attributes?.root)
  carry(page.body, attributes?.body)
  // Inside an SVG the root is the `svg` element, so what an App styles on its
  // root is styled on the `html` element it is drawn in. A class stands for
  // `:root`: it weighs the same in the cascade and joins onto what is beside
  // it (`.dark:root`, `html:root`) as the pseudo-class does.
  root.classList.add(ROOT_CLASS)
  for (const style of page.querySelectorAll('style'))
    style.textContent = style.textContent.replace(
      /:root(?![\w-])/g,
      `.${ROOT_CLASS}`,
    )
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
  attributes?: PageAttributes,
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
  image.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(pictureSvg(snapshot, width, tall, DOMPurify, attributes))}`
  if (!(await loaded)) return undefined
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = tall
  const context = canvas.getContext('2d')
  if (!context) return undefined
  // An App with no background of its own is on the page's. One with its own
  // has it across the whole picture, as a browser paints a body's background
  // across the viewport; inside an SVG it would stop at the body's box.
  context.fillStyle =
    getComputedStyle(document.documentElement).backgroundColor || '#fff'
  if (attributes?.background && PAGE_BACKGROUND.test(attributes.background))
    context.fillStyle = attributes.background
  context.fillRect(0, 0, width, tall)
  context.drawImage(image, 0, 0)
  try {
    // PNG keeps text and edges exact. A page too busy to fit as one is sent
    // as JPEG, which is smaller and still legible.
    for (const mediaType of ['image/png', 'image/jpeg'] as const) {
      const url = canvas.toDataURL(mediaType, 0.85)
      const data = url.slice(url.indexOf(',') + 1)
      if (url.startsWith(`data:${mediaType}`) && fitsATurn(data))
        return { type: 'image', mediaType, data, width, height: tall }
    }
    return undefined
  } catch {
    return undefined
  }
}

/** Whether a picture's base64 is small enough to send. */
export const fitsATurn = (data: string) =>
  data.length > 0 && data.length <= MAX_PICTURE_BASE64
