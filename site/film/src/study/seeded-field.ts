// SOURCING: the site's own Life (createConway, ease, gild, settle and cellLook from src/field, so the rule, the tuning and the look are one) drawn with a 2D canvas, because textmode.js runs on its own clock and a film's picture must follow from its frame number alone. three's CanvasTexture carries it to the wall.
import { useMemo, useRef } from 'react'
import * as THREE from 'three'
import { createConway } from '../../../src/field/conway'
import { PACE, VISIBLE, cellLook, ease, fieldPalette, gild, settle } from '../../../src/field/levels'
import type { Rgb } from '../../../src/field/levels'
import type { Sim } from '../../../src/field/sim'
import { FIELD, FIELD_PX_PER_M } from '../../../src/study/room'
import { BRASS, PAPER, SANS, SLATE } from '../theme'

const CELL = 8
const DENSITY = 1.5
const WIDTH = Math.round((FIELD.x1 - FIELD.x0) * FIELD_PX_PER_M)
const HEIGHT = Math.round((FIELD.y1 - FIELD.y0) * FIELD_PX_PER_M)

const hex = (colour: string): Rgb => [
  parseInt(colour.slice(1, 3), 16),
  parseInt(colour.slice(3, 5), 16),
  parseInt(colour.slice(5, 7), 16),
]
const palette = fieldPalette(hex(PAPER), hex(SLATE), hex(BRASS))

function start(seed: number) {
  const cols = Math.floor(WIDTH / CELL)
  const rows = Math.floor(HEIGHT / CELL)
  const sim: Sim = createConway(cols, rows, seed)
  const level = Float32Array.from(sim.target)
  const gilt = new Float32Array(cols * rows)
  settle(sim, level, gilt)
  return { sim, level, gilt, pending: 0, frame: 0 }
}

/**
 * The Life at a given frame of the film. It only runs forward, so a seek back
 * starts again from the seed: a render's tabs land on frames in any order and
 * must all see the same field.
 */
export function useSeededField(seed: number, frame: number, fps: number) {
  const run = useRef<ReturnType<typeof start> | null>(null)
  const { canvas, texture } = useMemo(() => {
    const made = document.createElement('canvas')
    made.width = Math.round(WIDTH * DENSITY)
    made.height = Math.round(HEIGHT * DENSITY)
    const map = new THREE.CanvasTexture(made)
    map.colorSpace = THREE.SRGBColorSpace
    map.generateMipmaps = false
    map.minFilter = THREE.LinearFilter
    map.magFilter = THREE.LinearFilter
    return { canvas: made, texture: map }
  }, [])

  const draw = (target: number) => {
    if (!run.current || target < run.current.frame) run.current = start(seed)
    const now = run.current
    const dt = 1 / fps
    for (; now.frame < target; now.frame++) {
      now.pending += dt
      while (now.pending >= 1 / PACE) {
        now.sim.tick()
        now.pending -= 1 / PACE
      }
      gild(now.gilt, now.level, now.sim.target, dt)
      ease(now.level, now.sim.target, dt)
    }
    const context = canvas.getContext('2d')
    if (!context) return
    context.setTransform(DENSITY, 0, 0, DENSITY, 0, 0)
    context.clearRect(0, 0, WIDTH, HEIGHT)
    context.font = `600 ${CELL * 0.95}px ${SANS}`
    context.textAlign = 'center'
    context.textBaseline = 'middle'
    const { cols } = now.sim
    for (let i = 0; i < now.level.length; i++) {
      const v = now.level[i] ?? 0
      if (v < VISIBLE) continue
      const { glyph, color } = cellLook(v, (now.sim.target[i] ?? 0) > 0, now.gilt[i] ?? 0, palette)
      const y = Math.floor(i / cols)
      context.fillStyle = `rgb(${color[0]},${color[1]},${color[2]})`
      context.fillText(glyph, (i - y * cols + 0.5) * CELL, (y + 0.5) * CELL)
    }
    texture.needsUpdate = true
  }

  return { texture, draw: () => draw(frame) }
}
