// SOURCING: textmode.js (WebGL2 glyph grid, the frame loop and deltaTime, frameRate for the governor, projectClientToGrid for the pointer); the Life rule comes in through conway.ts from @life/life
import { textmode } from 'textmode.js'
import type { Textmodifier } from 'textmode.js'
import { createConway } from './conway'
import { PACE, VISIBLE, cellLook, ease, fieldPalette, gild, settle } from './levels'
import type { Rgb } from './levels'
import type { Sim } from './sim'

/** A cell's size in CSS pixels. */
const CELL_SIZE = 8
const MAX_TICKS_PER_FRAME = 2
/**
 * The pointer is part of the Life. Over empty paper it brings cells to life along
 * its stroke, gappy and a little wide, because a solid line dies of overcrowding
 * where a sparse one grows. From then on they are ordinary cells: they go on by
 * the rule and die in gold like any other.
 */
const BRUSH_CENTRE = 0.7
const BRUSH_SIDE = 0.22
/** How strongly a painted cell shows at once: a stroke keeps up with the hand, and easing is for the fade. */
const PAINT_LEVEL = 0.8
/** Colonies a pulse of full strength starts. */
const PULSE_COLONIES = 6
/** The share of a frame the field may spend, measured, and the frame rates it steps down through when it runs over. */
const BUDGET_MS = 4
const FRAME_RATES = [60, 30, 20] as const
const GOVERNOR_FRAMES = 40
/** What the pointer's over when it must not touch the field: anything to operate, anything to read, and the app. */
const QUIET_TARGETS =
  'a, button, input, textarea, select, label, summary, iframe, video, media-controller, [role=tab], [role=dialog], [data-surface], [data-field-quiet]'

const probe =
  typeof document === 'undefined' ? undefined : document.createElement('canvas')

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

export interface FieldMetrics {
  cols: number
  rows: number
  frames: number
  /** Share of lit cells that are not lit 400 ms later, averaged over the sample. */
  moved: number
  /** The largest change in any one cell's level between consecutive frames, in full scales. */
  maxStep: number
  /** Share of cells above level 0.5: the mean, with the lowest and highest seen. */
  density: number
  densityMin: number
  densityMax: number
  /** Of the cells fading after death, the share that have turned to gold. */
  gilded: number
  /** Median milliseconds spent in a frame's update and drawing calls. */
  frameMs: number
  /** The frame rate the governor has settled on. */
  frameRate: number
}

export interface FieldHandle {
  pulse: (strength: number) => void
  /** Runs or holds the field. Held, it spends nothing and keeps its last frame. */
  setRunning: (running: boolean) => void
  measure: (ms: number) => Promise<FieldMetrics>
  /** The living cells within `radius` of a point on the page, as sorted indices: what a check reads. */
  aliveNear: (clientX: number, clientY: number, radius: number) => number[]
  /** Cells the pointer has brought to life so far. */
  painted: () => number
  destroy: () => void
}

const live = new Set<FieldHandle>()

/** Wakes every mounted field. */
export const pulseAll = (strength: number) =>
  live.forEach((field) => field.pulse(strength))

const latest = () => [...live].pop()

/** Measures the most recently mounted field, from its live level buffer. */
export function measureField(ms: number): Promise<FieldMetrics> {
  const field = latest()
  return field
    ? field.measure(ms)
    : Promise.reject(new Error('no field is mounted'))
}

/** The most recently mounted field's living cells near a point on the page. */
export const aliveNear = (clientX: number, clientY: number, radius = 3) =>
  latest()?.aliveNear(clientX, clientY, radius) ?? []

/** How many cells the pointer has brought to life on the most recently mounted field. */
export const painted = () => latest()?.painted() ?? 0

/**
 * Draws the field into `host` on a canvas of its own. textmode.js loses the
 * WebGL context when destroyed, so a canvas is never reused across mounts.
 */
export function mountField(
  host: HTMLElement,
  {
    seed,
    running: startRunning,
    density = window.devicePixelRatio,
    locate = (event) => event,
  }: {
    seed: number
    running: boolean
    /** Device pixels per CSS pixel of the canvas. A field drawn on a texture picks what it can afford to upload. */
    density?: number
    /** Where a pointer lands on this field, for a field that is not drawn where the pointer is. Undefined means it is off the field. */
    locate?: (event: PointerEvent) => { clientX: number; clientY: number } | undefined
  },
): FieldHandle {
  const canvas = document.createElement('canvas')
  canvas.className = 'absolute inset-0'
  canvas.width = host.clientWidth
  canvas.height = host.clientHeight
  host.append(canvas)
  const t: Textmodifier = textmode.create({
    canvas,
    width: host.clientWidth,
    height: host.clientHeight,
    fontSize: CELL_SIZE * density,
    frameRate: 60,
  })

  const style = getComputedStyle(canvas)
  const token = (name: string) => rgb(style.getPropertyValue(name).trim())
  const palette = fieldPalette(token('--paper'), token('--slate'), token('--brass'))

  let sim: Sim | undefined
  let level = new Float32Array(0)
  /** Per cell, how far it has turned from slate to brass: toward 1 while it fades. */
  let gilt = new Float32Array(0)
  let pending = 0
  let drawn = 0
  let frameCost = 0
  const frameHooks = new Set<() => void>()

  const cols = () => t.grid?.cols ?? 0
  const rows = () => t.grid?.rows ?? 0
  const left = () => Math.floor(cols() / 2)
  const top = () => Math.floor(rows() / 2)

  /** Brings the simulation and the level buffers to the grid's size, keeping what fits, centred. */
  const fit = () => {
    const width = cols()
    const height = rows()
    if (width === 0 || height === 0) return false
    if (!sim) {
      sim = createConway(width, height, seed)
      level = Float32Array.from(sim.target)
      gilt = new Float32Array(width * height)
      settle(sim, level, gilt)
      return true
    }
    if (sim.cols === width && sim.rows === height) return true
    const before = { level, cols: sim.cols, rows: sim.rows }
    sim.resize(width, height)
    level = new Float32Array(width * height)
    gilt = new Float32Array(width * height)
    const dx = Math.floor((width - before.cols) / 2)
    const dy = Math.floor((height - before.rows) / 2)
    for (let y = 0; y < before.rows; y++)
      for (let x = 0; x < before.cols; x++) {
        const nx = x + dx
        const ny = y + dy
        if (nx >= 0 && ny >= 0 && nx < width && ny < height)
          level[ny * width + nx] = before.level[y * before.cols + x] ?? 0
      }
    return true
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

  const render = () => {
    t.clear()
    const width = sim?.cols ?? 0
    for (let i = 0; i < level.length; i++) {
      const v = level[i] ?? 0
      if (v < VISIBLE) continue
      const { glyph, color } = cellLook(v, (sim?.target[i] ?? 0) > 0, gilt[i] ?? 0, palette)
      const y = Math.floor(i / width)
      drawGlyph(i - y * width, y, glyph, color)
    }
  }

  const advance = (seconds: number) => {
    if (!sim) return
    pending += seconds
    let ticks = 0
    while (pending >= 1 / PACE && ticks < MAX_TICKS_PER_FRAME) {
      sim.tick()
      pending -= 1 / PACE
      ticks++
    }
    if (ticks === MAX_TICKS_PER_FRAME) pending = 0
    gild(gilt, level, sim.target, seconds)
    ease(level, sim.target, seconds)
  }

  /** Steps the frame rate down when the field keeps running over budget. It does not step back up. */
  let overBudget = 0
  let rate = 0
  const govern = (cost: number) => {
    overBudget = cost > BUDGET_MS ? overBudget + 1 : 0
    const next = FRAME_RATES[rate + 1]
    if (overBudget < GOVERNOR_FRAMES || next === undefined) return
    rate++
    overBudget = 0
    t.frameRate(next)
  }

  let running = startRunning

  // textmode.js draws a loading screen until its font is in, and resizing
  // under it throws, so a resize that lands early is applied on the first frame.
  let ready = false
  const sized = { width: host.clientWidth, height: host.clientHeight }
  const resize = () => {
    const { clientWidth: width, clientHeight: height } = host
    if (!ready || width === 0 || height === 0) return
    if (width === sized.width && height === sized.height) return
    sized.width = width
    sized.height = height
    t.resizeCanvas(width, height)
  }

  t.draw(() => {
    const started = performance.now()
    if (!ready) {
      // textmode.js measures cells in device pixels, so the font scales with the
      // density to keep cells CELL_SIZE CSS pixels wide on any display. Set on
      // the first frame: during setup the loading screen is still drawing, and
      // a resize under it throws.
      t.pixelDensity(density)
      ready = true
      resize()
    }
    if (!fit()) return
    // A resumed tab comes back with a long delta; a generation or two is all it gets.
    if (running) advance(Math.min(t.deltaTime() / 1000, 2 / PACE))
    render()
    frameCost = performance.now() - started
    if (running) govern(frameCost)
    frameHooks.forEach((hook) => hook())
    // Two frames, because the first can land before the canvas has its size.
    if (!running && ++drawn >= 2) t.noLoop()
  })

  // The pointer. It is only heard over the page itself: an embedded frame keeps its own pointer.
  let pointer: { x: number; y: number } | undefined
  let paintedCells = 0

  /** Client coordinates to a cell, or undefined off the grid. */
  const cellAt = (clientX: number, clientY: number) => {
    if (!sim) return undefined
    const position = t.projectClientToGrid(clientX, clientY, t.grid)
    if (!Number.isFinite(position.x) || !Number.isFinite(position.y))
      return undefined
    const x = Math.round(position.x) + left()
    const y = Math.round(position.y) + top()
    return x < 0 || y < 0 || x >= sim.cols || y >= sim.rows
      ? undefined
      : { x, y }
  }

  const letGo = () => {
    pointer = undefined
  }

  const onPointerMove = (event: PointerEvent) => {
    if (!sim || !running) return
    // Not over anything to operate or read, and never during a drag or a selection.
    const over = event.target
    const quiet =
      event.buttons > 0 ||
      (over instanceof Element && over.closest(QUIET_TARGETS)) ||
      !getSelection()?.isCollapsed
    const at = quiet ? undefined : locate(event)
    const here = at && cellAt(at.clientX, at.clientY)
    if (!here) return letGo()
    const from = pointer ?? here
    const steps = Math.max(Math.abs(here.x - from.x), Math.abs(here.y - from.y))
    const stroke: Array<readonly [number, number]> = []
    const lay = (x: number, y: number, chance: number) => {
      if (x < 0 || y < 0 || x >= (sim?.cols ?? 0) || y >= (sim?.rows ?? 0)) return
      if (Math.random() < chance) stroke.push([x, y])
    }
    for (let n = 1; n <= steps; n++) {
      const x = Math.round(from.x + ((here.x - from.x) * n) / steps)
      const y = Math.round(from.y + ((here.y - from.y) * n) / steps)
      lay(x, y, BRUSH_CENTRE)
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const)
        lay(x + dx, y + dy, BRUSH_SIDE)
    }
    sim.paint(stroke)
    paintedCells += stroke.length
    for (const [x, y] of stroke) {
      const i = y * sim.cols + x
      level[i] = Math.max(level[i] ?? 0, PAINT_LEVEL)
      gilt[i] = 0
    }
    pointer = here
  }
  // Over an embedded frame the page hears nothing more, so the stroke ends as the pointer crosses in.
  const onPointerOver = (event: PointerEvent) => {
    if (event.target instanceof HTMLIFrameElement) letGo()
  }
  const onPointerGone = letGo
  window.addEventListener('pointermove', onPointerMove, { passive: true })
  window.addEventListener('pointerover', onPointerOver, { passive: true })
  document.documentElement.addEventListener('pointerleave', onPointerGone)
  window.addEventListener('blur', onPointerGone)

  const onVisibility = () => {
    if (!running) return
    if (document.hidden) t.noLoop()
    else t.loop()
  }
  document.addEventListener('visibilitychange', onVisibility)

  const resizer = new ResizeObserver(() => {
    resize()
    if (!running && ready) {
      drawn = 0
      t.loop()
    }
  })
  resizer.observe(host)

  const handle: FieldHandle = {
    pulse(strength) {
      if (running) sim?.plant(Math.ceil(strength * PULSE_COLONIES))
    },
    setRunning(next) {
      if (next === running) return
      running = next
      if (running) t.loop()
      else {
        letGo()
        drawn = 0
      }
    },
    measure(ms) {
      return new Promise((resolve) => {
        const samples = {
          cost: [] as number[],
          density: [] as number[],
          moved: [] as number[],
          gilded: [] as number[],
        }
        let maxStep = 0
        let frames = 0
        let before = Float32Array.from(level)
        let snapshot: Uint8Array | undefined
        let snapshotAt = 0
        const began = performance.now()
        const finish = () => {
          frameHooks.delete(hook)
          clearTimeout(timer)
          const sorted = [...samples.cost].sort((a, b) => a - b)
          const mean = (values: number[]) =>
            values.length
              ? values.reduce((a, b) => a + b, 0) / values.length
              : 0
          resolve({
            cols: sim?.cols ?? 0,
            rows: sim?.rows ?? 0,
            frames,
            moved: mean(samples.moved),
            maxStep,
            density: mean(samples.density),
            densityMin: Math.min(...samples.density),
            densityMax: Math.max(...samples.density),
            gilded: mean(samples.gilded),
            frameMs: sorted[Math.floor(sorted.length / 2)] ?? 0,
            frameRate: FRAME_RATES[rate] ?? 0,
          })
        }
        const hook = () => {
          const now = performance.now()
          frames++
          samples.cost.push(frameCost)
          if (before.length !== level.length) before = Float32Array.from(level)
          let litNow = 0
          let fading = 0
          let gold = 0
          const lights = new Uint8Array(level.length)
          for (let i = 0; i < level.length; i++) {
            const v = level[i] ?? 0
            maxStep = Math.max(maxStep, Math.abs(v - (before[i] ?? 0)))
            if (v > 0.5) {
              litNow++
              lights[i] = 1
            }
            if (v >= VISIBLE && !sim?.target[i]) {
              fading++
              if ((gilt[i] ?? 0) > 0.5) gold++
            }
          }
          before.set(level)
          samples.density.push(litNow / Math.max(1, level.length))
          if (fading > 0) samples.gilded.push(gold / fading)
          if (
            snapshot &&
            snapshot.length === lights.length &&
            now - snapshotAt >= 400
          ) {
            let gone = 0
            let was = 0
            for (let i = 0; i < lights.length; i++)
              if (snapshot[i]) {
                was++
                if (!lights[i]) gone++
              }
            if (was > 0) samples.moved.push(gone / was)
            snapshot = undefined
          }
          if (!snapshot) {
            snapshot = lights
            snapshotAt = now
          }
          if (now - began >= ms) finish()
        }
        const timer = setTimeout(finish, ms + 3000)
        frameHooks.add(hook)
      })
    },
    aliveNear(clientX, clientY, radius) {
      const at = cellAt(clientX, clientY)
      if (!at || !sim) return []
      const found: number[] = []
      for (let y = at.y - radius; y <= at.y + radius; y++)
        for (let x = at.x - radius; x <= at.x + radius; x++) {
          if (x < 0 || y < 0 || x >= sim.cols || y >= sim.rows) continue
          const i = y * sim.cols + x
          if (sim.target[i]) found.push(i)
        }
      return found
    },
    painted: () => paintedCells,
    destroy() {
      live.delete(handle)
      window.removeEventListener('pointermove', onPointerMove)
      window.removeEventListener('pointerover', onPointerOver)
      document.documentElement.removeEventListener(
        'pointerleave',
        onPointerGone,
      )
      window.removeEventListener('blur', onPointerGone)
      document.removeEventListener('visibilitychange', onVisibility)
      resizer.disconnect()
      t.destroy()
      canvas.remove()
    },
  }
  live.add(handle)
  return handle
}
