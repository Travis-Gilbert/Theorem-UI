// SOURCING: the app's own Life (src/lib/life: B3/S23, patterns) and the site field's glyph ramp (o : .). What is ours is seeding by a fixed seed and precomputing generations, so that any frame of a render shows the same field.
import { useLayoutEffect, useRef } from 'react'
import { AbsoluteFill, useCurrentFrame, useVideoConfig } from 'remotion'
import { createField, GHOST_FRAMES, stamp, step } from '../../../src/lib/life/life'
import type { Field } from '../../../src/lib/life/life'
import { PATTERNS } from '../../../src/lib/life/patterns'
import type { Cells } from '../../../src/lib/life/patterns'
import { SANS } from './theme'

const random = (seed: number) => () => {
  seed = (seed + 0x6d2b79f5) | 0
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296
}

const turn = (cells: Cells): Cells => {
  const height = Math.max(...cells.map(([, y]) => y)) + 1
  return cells.map(([x, y]) => [height - 1 - y, x] as const)
}
const flip = (cells: Cells): Cells => {
  const width = Math.max(...cells.map(([x]) => x)) + 1
  return cells.map(([x, y]) => [width - 1 - x, y] as const)
}

/** One colony per this many cells, and generations run before the first frame, so the field opens mid-growth. */
const AREA_PER_COLONY = 500
const HEAD_START = 40

/** The same seeds as the site's field: small things that grow, on the same rule. */
function seeded(cols: number, rows: number, seed: number) {
  const next = random(seed)
  let field: Field = createField(cols, rows)
  const colonies = Math.max(2, Math.round((cols * rows) / AREA_PER_COLONY))
  for (let n = 0; n < colonies; n++) {
    const roll = next()
    let shape: Cells
    if (roll < 0.6) {
      shape = PATTERNS[roll < 0.4 ? 'rpentomino' : 'acorn'].cells
      if (next() < 0.5) shape = flip(shape)
      for (let i = Math.floor(next() * 4); i > 0; i--) shape = turn(shape)
    } else {
      const soup: Array<readonly [number, number]> = []
      for (let y = 0; y < 5; y++)
        for (let x = 0; x < 5; x++) if (next() < 0.45) soup.push([x, y])
      shape = soup.length > 0 ? soup : PATTERNS.rpentomino.cells
    }
    field = stamp(field, shape, Math.floor(next() * cols), Math.floor(next() * rows))
  }
  return field
}

const runs = new Map<string, Field[]>()
function generation(cols: number, rows: number, seed: number, n: number) {
  const key = `${cols}x${rows}:${seed}`
  const run = runs.get(key) ?? [seeded(cols, rows, seed)]
  runs.set(key, run)
  while (run.length <= n) run.push(step(run[run.length - 1] as Field))
  return run[n] as Field
}

export function Life({
  seed,
  cell,
  color,
  fade,
  rate = 4,
  opacity = 1,
  offset = 0,
  style,
}: {
  seed: number
  /** Cell size in composition pixels. */
  cell: number
  color: string
  /** The colour a cell fades through after it dies. */
  fade?: string
  /** Generations a second. */
  rate?: number
  opacity?: number
  /** Starts this many frames into the run: used to meet a loop's start. */
  offset?: number
  style?: React.CSSProperties
}) {
  const frame = useCurrentFrame()
  const { width, height, fps } = useVideoConfig()
  const canvas = useRef<HTMLCanvasElement>(null)
  const n = HEAD_START + Math.floor(((frame + offset) * rate) / fps)

  useLayoutEffect(() => {
    const context = canvas.current?.getContext('2d')
    if (!context) return
    const cols = Math.ceil(width / cell)
    const rows = Math.ceil(height / cell)
    const field = generation(cols, rows, seed, n)
    context.clearRect(0, 0, width, height)
    context.font = `600 ${cell * 0.95}px ${SANS}`
    context.textAlign = 'center'
    context.textBaseline = 'middle'
    field.age.forEach((age, i) => {
      const ghost = field.ghost[i] ?? 0
      if (!age && !ghost) return
      context.fillStyle = age ? color : (fade ?? color)
      context.globalAlpha = age ? 1 : (ghost / GHOST_FRAMES) * 0.8
      const glyph = age ? 'o' : ghost > GHOST_FRAMES / 2 ? ':' : '.'
      context.fillText(glyph, (i % cols) * cell + cell / 2, Math.floor(i / cols) * cell + cell / 2)
    })
  }, [cell, color, fade, height, n, seed, width])

  return (
    <AbsoluteFill style={{ opacity, ...style }}>
      <canvas ref={canvas} width={width} height={height} />
    </AbsoluteFill>
  )
}
