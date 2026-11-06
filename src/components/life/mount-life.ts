// SOURCING: textmode.js (WebGL2 glyph grid, a layer for the agent's presence, the frame loop and deltaTime, noise for how far apart neighbouring cells move, projectClientToGrid for pointer input); anime.js utils.mapRange and clamp to scale that noise; the Life field, each cell's eased light, the presence and how the model's activity lifts them come from src/lib/life
import { utils } from 'animejs'
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
import { RESTING, beat, decay, glow, pace, pulse, restSeconds, sustain } from '@/lib/life/energy'
import type { Energy, PulseKind } from '@/lib/life/energy'
import { createLight, settle, shine } from '@/lib/life/light'
import type { Light } from '@/lib/life/light'
import { TONES } from '@/lib/life/look'
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
const ATTENTION_RADIUS = 10
/** Pointer activity this recent counts as the person drawing. */
const ACTIVE_SECONDS = 1.2
const MAX_STEPS_PER_FRAME = 4
/** A cell's size in CSS pixels. */
const CELL_SIZE = 10
/** The field sits behind the conversation, so its glyphs stay faint; the presence keeps full weight. */
const FIELD_WEIGHT = 0.34
/**
 * How far apart cells that changed on the same step move: each cell's bloom
 * and fade take between these shares of their usual time, by a noise field
 * that drifts slowly across the grid, so the field moves in currents.
 */
const STRETCH = [0.55, 1.6] as const
/** Noise per cell across and down (cells are about twice as tall as wide), and per second. */
const DRIFT = { x: 0.06, y: 0.11, t: 0.18 } as const

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
  // Layers default to a 16px font; the overlay takes the field's cell so its
  // glyphs land on the field's grid. It holds the agent's presence and the
  // brush preview, above the field.
  const overlay = t.layers.add({ fontSize: CELL_SIZE * density })

  let palette = readPalette(canvas)
  let field: Field = createField(0, 0)
  /** What each cell shows, eased toward its look in `field` frame by frame. */
  let light: Light = createLight(0)
  /** How far the field is toward its next generation. */
  let phase = 0
  let presence: Presence = createPresence({ x: 0, y: 0 })
  let stroke: { on: boolean; last: Point } | undefined
  let hovered: Point | undefined
  let lastActivity = -Infinity
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

  const settleAll = () => {
    for (let i = 0; i < field.age.length; i++) settle(light, i, ageAt(field, i), ghostAt(field, i))
  }

  /** A new field blooms in from nothing; a resized one shows as it stands. */
  const fitField = () => {
    if (field.cols === cols() && field.rows === rows()) return
    const first = field.cols === 0
    field = resize(field, cols(), rows())
    light = createLight(field.age.length)
    if (first) {
      field = fill(field, Math.random)
      // The presence starts in the bottom third, where the field lives.
      presence = createPresence({ x: left(), y: Math.floor((rows() * 5) / 6) })
    } else settleAll()
  }

  /**
   * The person's own edits show at once, so what they draw is at full weight
   * under the pointer instead of blooming in behind it.
   */
  const edit = (change: (from: Field) => Field) => {
    const before = field
    field = change(field)
    for (let i = 0; i < field.age.length; i++)
      if (ageAt(before, i) !== ageAt(field, i) || ghostAt(before, i) !== ghostAt(field, i))
        settle(light, i, ageAt(field, i), ghostAt(field, i))
  }

  const advanceField = (steps: number) => {
    for (let i = 0; i < steps; i++) field = step(emit(field, energy.level, Math.random))
  }

  /** How long cell `i` takes to move, as a share of the usual time. */
  const stretch = (i: number) => {
    const x = i % field.cols
    const y = Math.floor(i / field.cols)
    const drift = t.noise(x * DRIFT.x, y * DRIFT.y, t.secs * DRIFT.t)
    return utils.clamp(utils.mapRange(drift, 0.25, 0.75, ...STRETCH), ...STRETCH)
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
    edit((cells) => {
      let next = cells
      for (let i = 0; i <= steps; i++) {
        const x = Math.round(from.x + ((to.x - from.x) * i) / steps)
        const y = Math.round(from.y + ((to.y - from.y) * i) / steps)
        next = paint(next, x, y, on)
      }
      return next
    })
  }

  /** Cells stay clear, so the sheet behind the canvas shows between glyphs. */
  const drawGlyph = (x: number, y: number, glyph: string, color: Rgb) => {
    t.push()
    t.translate(x - left(), y - top())
    t.char(glyph)
    t.charColor(color[0], color[1], color[2])
    t.cellColor(...palette.background, 0)
    t.point()
    t.pop()
  }

  /** Cell `i`'s light at `scale` of its level, its tones mixed, faded toward what is behind the canvas. */
  const shade = (i: number, scale: number): Rgb => {
    const weight = Math.min(1, (light.level[i] ?? 0) * scale)
    const { background } = palette
    const color: [number, number, number] = [...background]
    TONES.forEach((name, k) => {
      const share = weight * (light.tone[i * TONES.length + k] ?? 0)
      const tone = palette[name]
      color[0] += (tone[0] - background[0]) * share
      color[1] += (tone[1] - background[1]) * share
      color[2] += (tone[2] - background[2]) * share
    })
    return color
  }

  t.setup(() => {
    // textmode.js finishes loading after destroy and still calls this. Resizing
    // then throws, and publishing would write a dead field's counts.
    if (t.isDisposed) return
    // textmode.js measures cells in device pixels, so the font scales with the
    // density to keep cells CELL_SIZE CSS pixels wide on any display.
    t.pixelDensity(density)
    // Two octaves of equal weight: smooth enough for currents, cheap per cell,
    // and spread evenly about a half (textmode sums octaves without normalising).
    t.noiseDetail(2, 1)
    fitField()
    publish()
  })

  t.draw(() => {
    fitField()
    const { playing, companion: playsAlong } = useLifeControls.getState()
    const seconds = t.deltaTime() / 1000
    energy = decay(energy, seconds)
    const tick = beat(phase, seconds, energy.level, playing)
    phase = tick.steps >= MAX_STEPS_PER_FRAME ? 0 : tick.phase
    advanceField(Math.min(tick.steps, MAX_STEPS_PER_FRAME))

    const personActive = stroke !== undefined || t.secs - lastActivity < ACTIVE_SECONDS
    presence = advance(presence, seconds, { still: reducedMotion, quiet: personActive })
    if (playsAlong) {
      const next = companion(presence, field, {
        random: Math.random,
        personActive,
        rest: restSeconds(energy.level),
      })
      presence = next.presence
      // The agent's seeds are not the person's edits, so they bloom in.
      if (next.seed) field = stamp(field, PATTERNS[next.seed.pattern].cells, next.seed.x, next.seed.y)
    }
    publish()

    // Clear to the sheet's colour at no opacity. It stays invisible, but the
    // overlay blends against it: textmode's compositor mixes a layer into the
    // colour beneath even where that is transparent, and transparent black
    // would darken every faint glyph above.
    t.background(...palette.background, 0)
    const { at } = presence
    const faint = FIELD_WEIGHT * glow(energy.level)
    const ms = seconds * 1000
    for (let y = 0; y < field.rows; y++)
      for (let x = 0; x < field.cols; x++) {
        const i = y * field.cols + x
        if (reducedMotion) settle(light, i, ageAt(field, i), ghostAt(field, i))
        else shine(light, i, ageAt(field, i), ghostAt(field, i), ms, stretch)
        const glyph = light.glyph[i]
        if (!glyph) continue
        const near = playsAlong
          ? Math.max(0, 1 - Math.hypot((x - at.x) / 2, y - at.y) / ATTENTION_RADIUS)
          : 0
        drawGlyph(x, y, glyph, shade(i, faint * (0.75 + 0.5 * near)))
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
        edit((cells) => stamp(cells, PATTERNS[brush].cells, cell.x, cell.y))
        return
      }
      const on = !alive(field, cell.x, cell.y)
      stroke = { on, last: cell }
      edit((cells) => paint(cells, cell.x, cell.y, on))
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
      advanceField(1)
      phase = 0
    },
    // Like a pointer edit, a clear or a new random field shows at once.
    clear() {
      edit(clear)
    },
    randomize() {
      edit((cells) => fill(clear(cells), Math.random))
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
