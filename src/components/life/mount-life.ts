// SOURCING: textmode.js (WebGL2 glyph grid, a second layer for the agent's presence, the frame loop and deltaTime, projectClientToGrid for pointer input); the Life field, the presence and how the model's activity lifts them come from src/lib/life
import { textmode } from 'textmode.js'
import type { Textmodifier } from 'textmode.js'
import {
  ageAt,
  alive,
  createField,
  ghostAt,
  clear,
  paint,
  population,
  resize,
  stamp,
  step,
} from '@/lib/life/life'
import type { Field } from '@/lib/life/life'
import { emit, fill } from '@/lib/life/emitter'
import { RESTING, decay, glow, pace, pulse, restSeconds, sustain } from '@/lib/life/energy'
import type { Energy, PulseKind } from '@/lib/life/energy'
import { cellLook } from '@/lib/life/look'
import type { Tone } from '@/lib/life/look'
import { PATTERNS } from '@/lib/life/patterns'
import { advance, companion, createPresence, figure } from '@/lib/life/presence'
import type { Point, Presence } from '@/lib/life/presence'
import { useLifeControls, useLifeCounts } from '@/lib/life/store'

type Rgb = readonly [number, number, number]

interface Palette {
  background: Rgb
  accent: Rgb
  ink: Rgb
  muted: Rgb
}

const probe = typeof document === 'undefined' ? undefined : document.createElement('canvas')

/** Resolves any CSS colour (hex, oklch, color-mix) to sRGB through a 1px canvas. */
function rgb(css: string): Rgb {
  const context = probe?.getContext('2d', { willReadFrequently: true })
  if (!context) return [128, 128, 128]
  context.clearRect(0, 0, 1, 1)
  context.fillStyle = css
  context.fillRect(0, 0, 1, 1)
  const [r = 0, g = 0, b = 0] = context.getImageData(0, 0, 1, 1).data
  return [r, g, b]
}

const mix = (from: Rgb, to: Rgb, weight: number): Rgb => [
  from[0] + (to[0] - from[0]) * weight,
  from[1] + (to[1] - from[1]) * weight,
  from[2] + (to[2] - from[2]) * weight,
]

/**
 * Glyphs fade toward what is behind the canvas: the sheet, a vertical
 * gradient, taken at its middle; the page background where there is no sheet.
 */
function readPalette(element: Element): Palette {
  const style = getComputedStyle(element)
  const value = (name: string) => style.getPropertyValue(name).trim()
  const token = (name: string) => rgb(value(name))
  const sheet = value('--sheet-from') && value('--sheet-to')
  return {
    background: sheet ? mix(token('--sheet-from'), token('--sheet-to'), 0.5) : token('--background'),
    accent: token('--primary'),
    ink: token('--foreground'),
    muted: token('--muted-foreground'),
  }
}

/** Cells near the presence catch more light, so the field shows what it attends to. */
const ATTENTION_RADIUS = 7
/** Pointer activity this recent counts as the person drawing. */
const ACTIVE_SECONDS = 1.2
const MAX_STEPS_PER_FRAME = 4
/** A cell's size in CSS pixels. */
const CELL_SIZE = 14
/** The field sits behind the conversation, so its glyphs stay faint; the presence keeps full weight. */
const FIELD_WEIGHT = 0.34

export interface LifeGame {
  /** Starts a stroke, or stamps the brush, at a client point. */
  press: (clientX: number, clientY: number) => void
  drag: (clientX: number, clientY: number) => void
  release: () => void
  hover: (clientX: number, clientY: number) => void
  leave: () => void
  step: () => void
  clear: () => void
  randomize: () => void
  /** The model did something: a stretch of text or reasoning, or a tool call. */
  pulse: (kind: PulseKind) => void
  /** A turn is running, which keeps the field awake between pulses. */
  sustain: (running: boolean) => void
  resize: (width: number, height: number) => void
  repaint: () => void
  destroy: () => void
}

/**
 * Draws the field into `host` on a canvas of its own. textmode.js loses the
 * WebGL context when destroyed, so a canvas is never reused across mounts.
 */
export function mountLife(
  host: HTMLElement,
  { reducedMotion }: { reducedMotion: boolean },
): LifeGame {
  const canvas = document.createElement('canvas')
  canvas.className = 'absolute inset-0'
  // textmode.js sizes its first grid from the canvas, which starts at 300 by 150.
  canvas.width = host.clientWidth
  canvas.height = host.clientHeight
  host.append(canvas)
  const density = window.devicePixelRatio
  const t: Textmodifier = textmode.create({
    canvas,
    width: host.clientWidth,
    height: host.clientHeight,
    fontSize: CELL_SIZE * density,
    frameRate: 60,
  })
  const overlay = t.layers.add()

  let palette = readPalette(canvas)
  let field: Field = createField(0, 0)
  let presence: Presence = createPresence({ x: 0, y: 0 })
  let stroke: { on: boolean; last: Point } | undefined
  let hovered: Point | undefined
  let lastActivity = -Infinity
  let pending = 0
  let energy: Energy = RESTING

  const cols = () => t.grid?.cols ?? 0
  const rows = () => t.grid?.rows ?? 0
  const left = () => Math.floor(cols() / 2)
  const top = () => Math.floor(rows() / 2)

  const toCell = (clientX: number, clientY: number): Point | undefined => {
    const position = t.projectClientToGrid(clientX, clientY, t.grid)
    if (!Number.isFinite(position.x) || !Number.isFinite(position.y)) return undefined
    return { x: Math.round(position.x) + left(), y: Math.round(position.y) + top() }
  }

  const fitField = () => {
    if (field.cols === cols() && field.rows === rows()) return
    const first = field.cols === 0
    field = resize(field, cols(), rows())
    if (first) {
      field = fill(field, Math.random)
      // The presence starts in the bottom third, where the field lives.
      presence = createPresence({ x: left(), y: Math.floor((rows() * 5) / 6) })
    }
  }

  const publish = () => {
    const counts = {
      generation: field.generation,
      population: population(field),
      pace: Math.round(pace(energy.level) * 10) / 10,
    }
    const current = useLifeCounts.getState()
    if (
      current.generation !== counts.generation ||
      current.population !== counts.population ||
      current.pace !== counts.pace
    )
      useLifeCounts.setState(counts)
  }

  const touch = () => {
    lastActivity = t.secs
  }

  /** Cells along the segment, so a fast stroke leaves no gaps. */
  const paintLine = (from: Point, to: Point, on: boolean) => {
    const steps = Math.max(Math.abs(to.x - from.x), Math.abs(to.y - from.y), 1)
    for (let i = 0; i <= steps; i++)
      field = paint(
        field,
        Math.round(from.x + ((to.x - from.x) * i) / steps),
        Math.round(from.y + ((to.y - from.y) * i) / steps),
        on,
      )
  }

  /** Cells stay clear, so the sheet behind the canvas shows between glyphs. */
  const drawGlyph = (x: number, y: number, glyph: string, color: Rgb) => {
    t.push()
    t.translate(x - left(), y - top())
    t.char(glyph)
    t.charColor(color[0], color[1], color[2])
    t.cellColor(0, 0, 0, 0)
    t.point()
    t.pop()
  }

  const tone = (name: Tone) => palette[name]

  t.setup(() => {
    // textmode.js finishes loading after destroy and still calls this. Resizing
    // then throws, and publishing would write a dead field's counts.
    if (t.isDisposed) return
    // textmode.js measures cells in device pixels, so the font scales with the
    // density to keep cells CELL_SIZE CSS pixels wide on any display.
    t.pixelDensity(density)
    fitField()
    publish()
  })

  t.draw(() => {
    fitField()
    const { playing, companion: playsAlong } = useLifeControls.getState()
    const seconds = t.deltaTime() / 1000
    energy = decay(energy, seconds)
    if (playing) {
      pending += seconds
      const interval = 1 / pace(energy.level)
      let steps = 0
      while (pending >= interval && steps < MAX_STEPS_PER_FRAME) {
        field = step(emit(field, energy.level, Math.random))
        pending -= interval
        steps++
      }
      if (steps === MAX_STEPS_PER_FRAME) pending = 0
    }

    const personActive = stroke !== undefined || t.secs - lastActivity < ACTIVE_SECONDS
    presence = advance(presence, seconds, { still: reducedMotion, quiet: personActive })
    if (playsAlong) {
      const next = companion(presence, field, {
        random: Math.random,
        personActive,
        rest: restSeconds(energy.level),
      })
      presence = next.presence
      if (next.seed) field = stamp(field, PATTERNS[next.seed.pattern].cells, next.seed.x, next.seed.y)
    }
    publish()

    t.clear()
    const { at } = presence
    const faint = FIELD_WEIGHT * glow(energy.level)
    for (let y = 0; y < field.rows; y++)
      for (let x = 0; x < field.cols; x++) {
        const i = y * field.cols + x
        const look = cellLook(ageAt(field, i), ghostAt(field, i))
        if (!look) continue
        const near = playsAlong
          ? Math.max(0, 1 - Math.hypot((x - at.x) / 2, y - at.y) / ATTENTION_RADIUS)
          : 0
        const weight = Math.min(1, look.weight * faint * (0.75 + 0.5 * near))
        drawGlyph(x, y, look.glyph, mix(palette.background, tone(look.tone), weight))
      }
  })

  overlay.draw(() => {
    t.clear()
    const { brush, companion: playsAlong } = useLifeControls.getState()
    if (hovered && brush !== 'cell')
      for (const [cx, cy] of PATTERNS[brush].cells) {
        const { width, height } = PATTERNS[brush]
        drawGlyph(
          hovered.x - Math.floor(width / 2) + cx,
          hovered.y - Math.floor(height / 2) + cy,
          'o',
          mix(palette.background, palette.accent, 0.5),
        )
      }
    if (!playsAlong) return
    for (const spark of presence.sparks)
      drawGlyph(
        Math.round(spark.x),
        Math.round(spark.y),
        spark.life > 0.6 ? '+' : spark.life > 0.3 ? ':' : '.',
        mix(palette.background, palette.accent, spark.life * 0.8),
      )
    if (presence.activity === 'attending') {
      const { target } = presence
      const marker = mix(palette.background, palette.accent, 0.45)
      drawGlyph(target.x - 1, target.y, '[', marker)
      drawGlyph(target.x + 1, target.y, ']', marker)
    }
    const aspect = (t.grid?.cellHeight ?? 2) / (t.grid?.cellWidth ?? 1)
    for (const glyph of figure(presence, t.secs, aspect))
      drawGlyph(
        Math.round(presence.at.x + glyph.dx),
        Math.round(presence.at.y + glyph.dy),
        glyph.glyph,
        mix(palette.background, palette.accent, glyph.weight),
      )
  })

  return {
    press(clientX, clientY) {
      const cell = toCell(clientX, clientY)
      hovered = cell
      if (!cell) return
      touch()
      const { brush } = useLifeControls.getState()
      if (brush !== 'cell') {
        field = stamp(field, PATTERNS[brush].cells, cell.x, cell.y)
        return
      }
      const on = !alive(field, cell.x, cell.y)
      stroke = { on, last: cell }
      field = paint(field, cell.x, cell.y, on)
    },
    drag(clientX, clientY) {
      const cell = toCell(clientX, clientY)
      hovered = cell
      if (!cell || !stroke) return
      touch()
      paintLine(stroke.last, cell, stroke.on)
      stroke = { ...stroke, last: cell }
    },
    release() {
      stroke = undefined
    },
    hover(clientX, clientY) {
      hovered = toCell(clientX, clientY)
    },
    leave() {
      hovered = undefined
      stroke = undefined
    },
    step() {
      field = step(emit(field, energy.level, Math.random))
    },
    clear() {
      field = clear(field)
    },
    randomize() {
      field = fill(clear(field), Math.random)
    },
    pulse(kind) {
      energy = pulse(energy, kind)
    },
    sustain(running) {
      energy = sustain(energy, running)
    },
    resize(width, height) {
      t.resizeCanvas(width, height)
    },
    repaint() {
      palette = readPalette(canvas)
    },
    destroy() {
      t.destroy()
      canvas.remove()
    },
  }
}
