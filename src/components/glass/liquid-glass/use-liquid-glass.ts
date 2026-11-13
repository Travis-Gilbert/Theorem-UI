// SOURCING: one requestAnimationFrame loop shared by every pane, which redraws a pane when its box moves or resizes, when the theme changes (MutationObserver on <html>) and, at most thirty times a second, when the Life field draws (life/frames.ts). Materials are CSS custom properties (styles.css --lg-*), read with getComputedStyle; colours resolve to sRGB through a 1px canvas, as mount-life.ts resolves its palette. Where WebGL is missing, the context is lost, or the person asks for less transparency, the element keeps its CSS frost.
import { useEffect } from 'react'
import type { RefObject } from 'react'
import { onLifeFrame } from '@/components/life/frames'
import { GlassRenderer } from './renderer'
import type { Material, Rgb, Scene } from './renderer'

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

/** A side left out runs on past the element, so nothing bends there. */
const RUN_ON = 4096
/** The field moves continuously; thirty redraws a second keep up with it. */
const FIELD_INTERVAL = 1000 / 30

interface Entry {
  canvas: HTMLCanvasElement
  edges: LiquidEdges
  material: Material
  radius: number
  /** The sheet's gradient ends, --sheet-from and --sheet-shade. */
  from: Rgb
  shade: Rgb
  key: string
  drawn: number
}

const probe =
  typeof document === 'undefined' ? undefined : document.createElement('canvas')

function rgb(value: string): Rgb {
  const context = probe?.getContext('2d', { willReadFrequently: true })
  if (!context || !value) return [128, 128, 128]
  context.clearRect(0, 0, 1, 1)
  context.fillStyle = value
  context.fillRect(0, 0, 1, 1)
  const [r = 0, g = 0, b = 0] = context.getImageData(0, 0, 1, 1).data
  return [r, g, b]
}

function readMaterial(element: Element) {
  const style = getComputedStyle(element)
  const value = (name: string) => style.getPropertyValue(name).trim()
  const number = (name: string, fallback: number) => {
    const parsed = Number.parseFloat(value(name))
    return Number.isFinite(parsed) ? parsed : fallback
  }
  return {
    radius: Number.parseFloat(style.borderTopLeftRadius) || 0,
    from: rgb(value('--sheet-from')),
    shade: rgb(value('--sheet-shade')),
    material: {
      blur: number('--lg-blur', 12),
      bevel: number('--lg-bevel', 14),
      refract: number('--lg-refract', 8),
      clarity: number('--lg-clarity', 0.8),
      tone: rgb(value('--lg-tone')),
      body: number('--lg-body', 0.7),
      rimBody: number('--lg-rim-body', 0.4),
      lift: number('--lg-lift', 0),
      saturate: number('--lg-saturate', 1.2),
      light: number('--lg-light', 0.3),
      sheen: number('--lg-sheen', 0),
      stroke: number('--lg-stroke', 0.1),
      shade: number('--lg-shade', 0.2),
      show: number('--lg-show', 0),
    },
  }
}

/** WebGL, and a person who has not asked for less transparency. */
function available() {
  if (typeof window === 'undefined') return false
  if (window.matchMedia('(prefers-reduced-transparency: reduce)').matches)
    return false
  return true
}

class Glass {
  private renderer: GlassRenderer | null = null
  private readonly entries = new Map<HTMLElement, Entry>()
  private field: HTMLCanvasElement | null = null
  private fieldFresh = false
  private frame = 0
  private stopField: (() => void) | null = null
  private themeObserver: MutationObserver | null = null
  private theme = 0

  /** False where the element should keep its CSS frost. */
  add(element: HTMLElement, edges: LiquidEdges): boolean {
    if (!this.renderer) {
      try {
        this.renderer = new GlassRenderer((lost) => this.onLost(lost))
      } catch {
        return false
      }
    }
    const canvas = document.createElement('canvas')
    canvas.dataset.liquidCanvas = ''
    canvas.setAttribute('aria-hidden', 'true')
    // Over the border box, under the content.
    const border = getComputedStyle(element).borderTopWidth
    Object.assign(canvas.style, {
      position: 'absolute',
      inset: `calc(-1 * ${border})`,
      width: `calc(100% + 2 * ${border})`,
      height: `calc(100% + 2 * ${border})`,
      zIndex: '-1',
      pointerEvents: 'none',
    })
    element.append(canvas)
    this.entries.set(element, {
      canvas,
      edges,
      ...readMaterial(element),
      key: '',
      drawn: 0,
    })
    this.start()
    return true
  }

  remove(element: HTMLElement) {
    const entry = this.entries.get(element)
    if (!entry) return
    entry.canvas.remove()
    delete element.dataset.liquid
    this.entries.delete(element)
    if (!this.entries.size) this.stop()
  }

  private start() {
    if (this.frame) return
    this.stopField = onLifeFrame((canvas) => {
      this.field = canvas
      this.fieldFresh = true
    })
    this.themeObserver = new MutationObserver(() => {
      // Styles land after the attribute changes; read them next frame.
      requestAnimationFrame(() => {
        this.theme++
        for (const [element, entry] of this.entries)
          Object.assign(entry, readMaterial(element), { key: '' })
      })
    })
    this.themeObserver.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['class', 'style', 'data-palette', 'data-glass-study'],
    })
    const tick = (now: number) => {
      this.frame = requestAnimationFrame(tick)
      this.draw(now)
    }
    this.frame = requestAnimationFrame(tick)
  }

  private stop() {
    cancelAnimationFrame(this.frame)
    this.frame = 0
    this.stopField?.()
    this.stopField = null
    this.themeObserver?.disconnect()
    this.themeObserver = null
  }

  private onLost(lost: boolean) {
    for (const [element, entry] of this.entries) {
      if (lost) delete element.dataset.liquid
      entry.key = ''
    }
  }

  private draw(now: number) {
    const renderer = this.renderer
    if (!renderer || renderer.lost) return
    const field =
      this.field?.isConnected && this.field.style.visibility !== 'hidden'
        ? this.field
        : null
    const fieldRect = field?.getBoundingClientRect() ?? null
    const fresh = this.fieldFresh
    this.fieldFresh = false
    const dpr = window.devicePixelRatio || 1
    for (const [element, entry] of this.entries) {
      const rect = element.getBoundingClientRect()
      if (rect.width < 1 || rect.height < 1) continue
      const key = [
        rect.left,
        rect.top,
        rect.width,
        rect.height,
        dpr,
        this.theme,
        fieldRect?.left,
        fieldRect?.top,
        fieldRect?.width,
        fieldRect?.height,
      ].join()
      const moved = key !== entry.key
      if (!moved && !(fresh && field && now - entry.drawn >= FIELD_INTERVAL))
        continue
      entry.key = key
      entry.drawn = now
      const sheet =
        element.closest('.sheet')?.getBoundingClientRect() ??
        fieldRect ??
        new DOMRect(0, 0, window.innerWidth, window.innerHeight)
      const scene: Scene = {
        field,
        fieldRect,
        sheetTop: sheet.top,
        sheetHeight: sheet.height,
        from: entry.from,
        shade: entry.shade,
      }
      const { edges } = entry
      renderer.render(
        {
          rect,
          radius: entry.radius,
          extend: [
            edges.left ? 0 : RUN_ON,
            edges.top ? 0 : RUN_ON,
            edges.right ? 0 : RUN_ON,
            edges.bottom ? 0 : RUN_ON,
          ],
          dpr,
          material: entry.material,
          target: entry.canvas,
        },
        scene,
      )
      // The frost stays until the pane has drawn, so it never shows empty.
      element.dataset.liquid = 'live'
    }
  }
}

let glass: Glass | undefined

/**
 * Makes `ref`'s element liquid glass: the Life field and the sheet behind
 * it, blurred and settled toward the pane's tone in the body, bent and
 * clearer at a curved rim, lit from the top left. The element is marked
 * data-liquid="live" once it draws; until then, and wherever it cannot
 * (no WebGL, reduced transparency), its own CSS frost shows.
 */
export function useLiquidGlass(
  ref: RefObject<HTMLElement | null>,
  enabled: boolean,
  edges: LiquidEdges = ALL_EDGES,
) {
  const { top, right, bottom, left } = edges
  useEffect(() => {
    const element = ref.current
    if (!enabled || !element || !available()) return
    glass ??= new Glass()
    const active = glass
    if (!active.add(element, { top, right, bottom, left })) return
    return () => active.remove(element)
  }, [ref, enabled, top, right, bottom, left])
}
