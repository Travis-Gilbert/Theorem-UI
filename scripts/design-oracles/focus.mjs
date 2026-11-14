// Independent COL-07 keyboard focus paint measurement. Screenshots supply the
// actual pixel colors and clipping. The declared rectangle supplies only the
// candidate outline band and the reference area.
import { PNG } from 'pngjs'
import { converter, wcagContrast } from 'culori'

const toRgb = converter('rgb')
const pixel = (image, x, y) => {
  const index = 4 * (y * image.width + x)
  return {
    mode: 'rgb',
    r: image.data[index] / 255,
    g: image.data[index + 1] / 255,
    b: image.data[index + 2] / 255,
  }
}
const channels = ['r', 'g', 'b']
const changed = (a, b) =>
  channels.some((channel) => Math.abs(a[channel] - b[channel]) > 2 / 255)
const near = (a, b) =>
  channels.every((channel) => Math.abs(a[channel] - b[channel]) <= 3 / 255)
const inside = (x, y, box) =>
  x >= box.left && x < box.right && y >= box.top && y < box.bottom

/** Count rendered indicator pixels whose state change and adjacent contrast qualify. */
export function sampleFocusOutline(focused, unfocused, clip, box, outline) {
  const pigment = toRgb(outline.color)
  if (!pigment || (pigment.alpha !== undefined && pigment.alpha !== 1))
    return null
  const inner = {
    left: box.left - outline.offset,
    right: box.right + outline.offset,
    top: box.top - outline.offset,
    bottom: box.bottom + outline.offset,
  }
  const outer = {
    left: inner.left - outline.width,
    right: inner.right + outline.width,
    top: inner.top - outline.width,
    bottom: inner.bottom + outline.width,
  }
  let visibleAreaCssPx = 0
  let qualifyingAreaCssPx = 0
  let ambiguousQualifyingAreaCssPx = 0
  let changedAreaCssPx = 0
  let candidateAreaCssPx = 0
  let minimumStateContrast = Infinity
  let minimumAdjacentContrast = Infinity
  for (let y = 0; y < focused.height; y++) {
    for (let x = 0; x < focused.width; x++) {
      const sx = clip.x + x + 0.5
      const sy = clip.y + y + 0.5
      if (!inside(sx, sy, outer) || inside(sx, sy, inner)) continue
      candidateAreaCssPx++
      const actual = pixel(focused, x, y)
      const before = pixel(unfocused, x, y)
      if (!changed(actual, before)) continue
      changedAreaCssPx++
      const samePigment = near(actual, pigment)
      if (samePigment) visibleAreaCssPx++
      const distance = [
        [outer.right - sx, 1, 0],
        [sx - outer.left, -1, 0],
        [outer.bottom - sy, 0, 1],
        [sy - outer.top, 0, -1],
      ].sort(([a], [b]) => a - b)[0]
      const [delta, dx, dy] = distance
      const ax = x + dx * (Math.floor(delta) + 1)
      const ay = y + dy * (Math.floor(delta) + 1)
      if (ax < 0 || ay < 0 || ax >= focused.width || ay >= focused.height)
        continue
      const stateContrast = wcagContrast(actual, before)
      const adjacentContrast = wcagContrast(actual, pixel(focused, ax, ay))
      if (samePigment) {
        minimumStateContrast = Math.min(minimumStateContrast, stateContrast)
        minimumAdjacentContrast = Math.min(
          minimumAdjacentContrast,
          adjacentContrast,
        )
      }
      if (stateContrast >= 3 && adjacentContrast >= 3) {
        if (samePigment) qualifyingAreaCssPx++
        else ambiguousQualifyingAreaCssPx++
      }
    }
  }
  return {
    candidateAreaCssPx,
    visibleAreaCssPx,
    changedAreaCssPx,
    qualifyingAreaCssPx,
    ambiguousQualifyingAreaCssPx,
    minimumStateContrast: Number.isFinite(minimumStateContrast)
      ? minimumStateContrast
      : null,
    minimumAdjacentContrast: Number.isFinite(minimumAdjacentContrast)
      ? minimumAdjacentContrast
      : null,
  }
}

const unavailable = (reason, evidence = {}) => ({
  standard: 'not-measurable',
  focusAppearance: 'not-measurable',
  reason,
  ...evidence,
})

/** Take an actual Tab focus sample on the live rendered surface. */
export async function measureKeyboardFocus(page) {
  await page.keyboard.press('Tab')
  const element = await page.evaluateHandle(() => document.activeElement)
  try {
    const focusedState = await element.evaluate((node) => {
      if (!(node instanceof HTMLElement) || node === document.body) return null
      const rect = node.getBoundingClientRect()
      const style = getComputedStyle(node)
      const width = innerWidth
      const height = innerHeight
      const hits = []
      for (const xRatio of [0.1, 0.3, 0.5, 0.7, 0.9]) {
        for (const yRatio of [0.1, 0.3, 0.5, 0.7, 0.9]) {
          const x = rect.left + rect.width * xRatio
          const y = rect.top + rect.height * yRatio
          const hit = document.elementFromPoint(x, y)
          hits.push({ x, y, unobscured: Boolean(hit && node.contains(hit)) })
        }
      }
      return {
        label:
          node.getAttribute('aria-label') ||
          node.textContent?.trim().slice(0, 80),
        tag: node.tagName,
        box: rect.toJSON(),
        viewport: { width, height, scrollX, scrollY },
        keyboardFocus: node.matches(':focus-visible'),
        outline: {
          width: parseFloat(style.outlineWidth),
          offset: parseFloat(style.outlineOffset),
          style: style.outlineStyle,
          color: style.outlineColor,
        },
        hits,
      }
    })
    if (!focusedState)
      return unavailable('Tab did not produce a measurable active component')
    const { box, outline, viewport } = focusedState
    if (!focusedState.keyboardFocus)
      return {
        ...unavailable('The focused component did not enter :focus-visible', {
          focusedState,
        }),
        standard: 'fail',
      }
    if (
      box.right <= 0 ||
      box.bottom <= 0 ||
      box.left >= viewport.width ||
      box.top >= viewport.height
    )
      return {
        ...unavailable('Focused component is entirely outside the viewport', {
          focusedState,
        }),
        standard: 'fail',
      }
    if (!focusedState.hits.some(({ unobscured }) => unobscured))
      return {
        ...unavailable(
          'No sampled point on the focused component can be reached through its clipping or covering layers',
          { focusedState },
        ),
        standard: 'fail',
      }
    if (
      outline.style !== 'solid' ||
      outline.width <= 0 ||
      !Number.isFinite(outline.offset)
    )
      return unavailable(
        'The focused component does not use a measurable solid outline',
        { focusedState },
      )

    const bleed = Math.max(0, outline.offset + outline.width) + 3
    const left = Math.max(0, Math.floor(box.left - bleed))
    const top = Math.max(0, Math.floor(box.top - bleed))
    const right = Math.min(viewport.width, Math.ceil(box.right + bleed))
    const bottom = Math.min(viewport.height, Math.ceil(box.bottom + bleed))
    if (right <= left || bottom <= top)
      return unavailable('Focused component lies outside the viewport', {
        focusedState,
      })
    const clip = { x: left, y: top, width: right - left, height: bottom - top }
    const screenshot = () =>
      page.screenshot({ clip, scale: 'css', caret: 'hide' })
    const focused = PNG.sync.read(await screenshot())
    const unfocusedState = await element.evaluate(async (node) => {
      node.blur()
      await new Promise((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(resolve)),
      )
      return {
        box: node.getBoundingClientRect().toJSON(),
        scrollX,
        scrollY,
        inactive: document.activeElement !== node,
      }
    })
    if (
      !unfocusedState.inactive ||
      unfocusedState.scrollX !== viewport.scrollX ||
      unfocusedState.scrollY !== viewport.scrollY ||
      ['left', 'top', 'width', 'height'].some(
        (key) => Math.abs(unfocusedState.box[key] - box[key]) > 0.25,
      )
    )
      return unavailable(
        'Focused and unfocused paint cannot be compared at the same pixels',
        { focusedState, unfocusedState },
      )
    const unfocused = PNG.sync.read(await screenshot())
    if (
      focused.width !== unfocused.width ||
      focused.height !== unfocused.height
    )
      return unavailable(
        'Focused and unfocused screenshots have different dimensions',
        { focusedState, unfocusedState },
      )
    const pixels = sampleFocusOutline(focused, unfocused, clip, box, outline)
    if (!pixels)
      return unavailable(
        'Outline paint is outside the supported opaque sRGB model',
        { focusedState, unfocusedState },
      )
    const referenceAreaCssPx = 4 * box.width + 4 * box.height
    return {
      standard:
        pixels.visibleAreaCssPx > 0
          ? 'pass'
          : pixels.changedAreaCssPx > 0
            ? 'not-measurable'
            : 'fail',
      focusAppearance:
        pixels.qualifyingAreaCssPx >= referenceAreaCssPx
          ? 'pass'
          : pixels.qualifyingAreaCssPx + pixels.ambiguousQualifyingAreaCssPx >=
              referenceAreaCssPx
            ? 'not-measurable'
            : 'fail',
      pixelAttribution:
        'The measured lower bound counts pixels matching the opaque outline color. The upper bound includes other qualifying pixel changes in the outline band, including possible antialiasing.',
      focusedState,
      unfocusedState,
      referenceAreaCssPx,
      ...pixels,
    }
  } finally {
    await element.dispose()
  }
}
