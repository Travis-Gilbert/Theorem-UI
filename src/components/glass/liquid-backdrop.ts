// SOURCING: CSS backdrop-filter: url() pointing at an SVG filter (feGaussianBlur, feImage, feDisplacementMap, feColorMatrix, feComposite), which Chromium applies to what is behind the element; the displacement map is a rounded rectangle's bevel drawn per pixel into a 2D canvas. The bevel's shape, refraction toward the thick middle and the colour split at the rim follow ybouane/liquidglass (MIT); the --liquid-* numbers come from styles.css. Other engines keep the CSS frost (surface-liquid, glass-panel).
import { useEffect } from 'react'
import type { RefObject } from 'react'

export interface LiquidEdges {
  top: boolean
  right: boolean
  bottom: boolean
  left: boolean
}

const ALL_EDGES: LiquidEdges = {
  top: true,
  right: true,
  bottom: true,
  left: true,
}

interface Tuning {
  blur: number
  bevel: number
  refract: number
  chroma: number
  saturate: number
  radius: number
}

const SVG = 'http://www.w3.org/2000/svg'
let count = 0

/**
 * Only Chromium draws an SVG filter as a backdrop-filter. Safari and Firefox
 * accept the declaration and draw nothing, which would lose the frost too.
 */
function supported() {
  if (typeof navigator === 'undefined') return false
  const brands = (
    navigator as Navigator & {
      userAgentData?: { brands: ReadonlyArray<{ brand: string }> }
    }
  ).userAgentData?.brands
  return brands?.some(({ brand }) => brand === 'Chromium') ?? false
}

function readTuning(element: Element): Tuning {
  const style = getComputedStyle(element)
  const number = (name: string, fallback: number) => {
    const value = Number.parseFloat(style.getPropertyValue(name))
    return Number.isFinite(value) ? value : fallback
  }
  return {
    blur: number('--liquid-blur', 4),
    bevel: number('--liquid-bevel', 18),
    refract: number('--liquid-refract', 14),
    chroma: number('--liquid-chroma', 0.12),
    saturate: number('--liquid-saturate', 1.4),
    radius: Number.parseFloat(style.borderTopLeftRadius) || 0,
  }
}

/**
 * The bevel as a displacement map: within `bevel` of a beveled edge each
 * pixel looks inward, furthest at the very edge, so the rim gathers and
 * bends what lies just inside it. Red carries x and green y, 128 is still.
 * Edges left out run on past the element, so nothing bends there.
 */
export function bevelMap(
  width: number,
  height: number,
  { radius, bevel }: { radius: number; bevel: number },
  edges: LiquidEdges,
): ImageData {
  const data = new ImageData(width, height)
  const far = Math.max(width, height) + bevel * 4
  const left = edges.left ? 0 : -far
  const right = edges.right ? width : width + far
  const top = edges.top ? 0 : -far
  const bottom = edges.bottom ? height : height + far
  const cx = (left + right) / 2
  const cy = (top + bottom) / 2
  const bx = (right - left) / 2
  const by = (bottom - top) / 2
  const r = Math.min(radius, width / 2, height / 2)
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++) {
      const px = x + 0.5 - cx
      const py = y + 0.5 - cy
      const qx = Math.abs(px) - bx + r
      const qy = Math.abs(py) - by + r
      let nx = 0
      let ny = 0
      let inside: number
      if (qx > 0 && qy > 0) {
        const length = Math.hypot(qx, qy)
        inside = r - length
        nx = (qx / length) * Math.sign(px)
        ny = (qy / length) * Math.sign(py)
      } else if (qx > qy) {
        inside = r - qx
        nx = Math.sign(px)
      } else {
        inside = r - qy
        ny = Math.sign(py)
      }
      const t = Math.min(1, Math.max(0, inside / bevel))
      // A rounded bevel is steepest at its foot, so the bend falls off fast.
      const strength = (1 - t) * (1 - t)
      const i = (y * width + x) * 4
      data.data[i] = Math.round(128 - nx * strength * 127)
      data.data[i + 1] = Math.round(128 - ny * strength * 127)
      data.data[i + 2] = 128
      data.data[i + 3] = 255
    }
  return data
}

/** One channel of what is behind, through the bevel at `scale`. */
function channel(filter: SVGFilterElement, index: number, scale: number) {
  const displace = document.createElementNS(SVG, 'feDisplacementMap')
  displace.setAttribute('in', 'frost')
  displace.setAttribute('in2', 'map')
  displace.setAttribute('xChannelSelector', 'R')
  displace.setAttribute('yChannelSelector', 'G')
  displace.setAttribute('scale', String(scale))
  displace.setAttribute('result', `bent${index}`)
  const pick = document.createElementNS(SVG, 'feColorMatrix')
  pick.setAttribute('in', `bent${index}`)
  pick.setAttribute('type', 'matrix')
  const rows = ['0 0 0 0 0', '0 0 0 0 0', '0 0 0 0 0']
  rows[index] = ['1 0 0 0 0', '0 1 0 0 0', '0 0 1 0 0'][index] ?? ''
  pick.setAttribute('values', `${rows.join(' ')} 0 0 0 1 0`)
  pick.setAttribute('result', `tone${index}`)
  filter.append(displace, pick)
  return displace
}

/**
 * Makes `ref`'s element liquid glass where the engine can: what is behind
 * it frosted a little and bent at its beveled edges, through an SVG filter
 * of its own sized to it. Elsewhere it keeps its CSS frost.
 */
export function useLiquidBackdrop(
  ref: RefObject<HTMLElement | null>,
  enabled: boolean,
  edges: LiquidEdges = ALL_EDGES,
) {
  const { top, right, bottom, left } = edges
  useEffect(() => {
    const element = ref.current
    if (!enabled || !element || !supported()) return
    const id = `liquid-glass-${++count}`
    const svg = document.createElementNS(SVG, 'svg')
    svg.setAttribute('aria-hidden', 'true')
    svg.setAttribute('width', '0')
    svg.setAttribute('height', '0')
    svg.style.position = 'absolute'
    svg.style.pointerEvents = 'none'
    const filter = document.createElementNS(SVG, 'filter')
    filter.id = id
    filter.setAttribute('filterUnits', 'userSpaceOnUse')
    filter.setAttribute('primitiveUnits', 'userSpaceOnUse')
    filter.setAttribute('color-interpolation-filters', 'sRGB')
    const blur = document.createElementNS(SVG, 'feGaussianBlur')
    blur.setAttribute('in', 'SourceGraphic')
    blur.setAttribute('edgeMode', 'duplicate')
    blur.setAttribute('result', 'blurred')
    const saturate = document.createElementNS(SVG, 'feColorMatrix')
    saturate.setAttribute('in', 'blurred')
    saturate.setAttribute('type', 'saturate')
    saturate.setAttribute('result', 'frost')
    const map = document.createElementNS(SVG, 'feImage')
    map.setAttribute('preserveAspectRatio', 'none')
    map.setAttribute('result', 'map')
    filter.append(blur, saturate, map)
    // Red, green and blue bend by slightly different amounts, so the rim
    // splits colour as thick glass does; the middle, which does not bend,
    // stays whole.
    const displacements = [0, 1, 2].map((index) => channel(filter, index, 0))
    const add = (a: string, b: string, result: string) => {
      const sum = document.createElementNS(SVG, 'feComposite')
      sum.setAttribute('in', a)
      sum.setAttribute('in2', b)
      sum.setAttribute('operator', 'arithmetic')
      sum.setAttribute('k2', '1')
      sum.setAttribute('k3', '1')
      sum.setAttribute('result', result)
      filter.append(sum)
    }
    add('tone0', 'tone1', 'rg')
    add('rg', 'tone2', 'glass')
    svg.append(filter)
    document.body.append(svg)

    const canvas = document.createElement('canvas')
    const context = canvas.getContext('2d')
    const sides = { top, right, bottom, left }
    let drawn = ''
    let tuning = readTuning(element)

    const apply = () => {
      const width = Math.round(element.offsetWidth)
      const height = Math.round(element.offsetHeight)
      if (width < 1 || height < 1 || !context) return
      for (const node of [filter, map]) {
        node.setAttribute('x', '0')
        node.setAttribute('y', '0')
        node.setAttribute('width', String(width))
        node.setAttribute('height', String(height))
      }
      blur.setAttribute('stdDeviation', String(tuning.blur))
      saturate.setAttribute('values', String(tuning.saturate))
      const scale = tuning.refract * 2
      displacements.forEach((node, index) => {
        node.setAttribute(
          'scale',
          String(scale * (1 + (index - 1) * tuning.chroma)),
        )
      })
      const key = `${width}x${height}:${tuning.radius}:${tuning.bevel}`
      if (key !== drawn) {
        drawn = key
        canvas.width = width
        canvas.height = height
        context.putImageData(bevelMap(width, height, tuning, sides), 0, 0)
        map.setAttribute('href', canvas.toDataURL())
      }
      element.style.setProperty('backdrop-filter', `url(#${id})`)
      element.style.setProperty('-webkit-backdrop-filter', `url(#${id})`)
    }

    let frame = 0
    const schedule = () => {
      cancelAnimationFrame(frame)
      frame = requestAnimationFrame(apply)
    }
    apply()
    const resize = new ResizeObserver(schedule)
    resize.observe(element)
    // A theme or palette change moves the --liquid-* numbers.
    const retune = new MutationObserver(() => {
      tuning = readTuning(element)
      schedule()
    })
    retune.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['class', 'style', 'data-theme'],
    })

    return () => {
      cancelAnimationFrame(frame)
      resize.disconnect()
      retune.disconnect()
      svg.remove()
      element.style.removeProperty('backdrop-filter')
      element.style.removeProperty('-webkit-backdrop-filter')
    }
  }, [ref, enabled, top, right, bottom, left])
}
