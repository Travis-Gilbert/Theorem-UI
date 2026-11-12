// Canvas 2D projection of the existing Life model for narrow/mobile browsers.
// It draws transparent glyphs over the same CSS sheet, without the WebGL
// compositing layer that can produce horizontal bands on iOS Safari.
import {
  ageAt,
  alive,
  clear,
  createField,
  ghostAt,
  paint,
  paintLine,
  population,
  resize,
  stamp,
  step,
} from '@/lib/life/life'
import type { Field } from '@/lib/life/life'
import { emit, fill } from '@/lib/life/emitter'
import {
  RESTING,
  beat,
  decay,
  glow,
  pace,
  pulse,
  restSeconds,
  sustain,
} from '@/lib/life/energy'
import type { Energy } from '@/lib/life/energy'
import { cellLook } from '@/lib/life/look'
import { PATTERNS } from '@/lib/life/patterns'
import { advance, companion, createPresence, figure } from '@/lib/life/presence'
import { useLifeControls, useLifeCounts } from '@/lib/life/store'
import { publishLifeFrame } from './frames'
import type { LifeGame } from './mount-life'

const CELL_W = 10
const CELL_H = 16
const FRAME_MS = 1000 / 30

/** A transparent, lower-cost projection of the same simulation and controls. */
export function mountLife2d(
  host: HTMLElement,
  { reducedMotion }: { reducedMotion: boolean },
): LifeGame {
  const canvas = document.createElement('canvas')
  canvas.className = 'absolute inset-0'
  canvas.setAttribute('aria-hidden', 'true')
  canvas.style.pointerEvents = 'none'
  host.append(canvas)
  const ctx = canvas.getContext('2d', { alpha: true })
  if (!ctx) {
    canvas.remove()
    return {
      press() {},
      drag() {},
      release() {},
      hover() {},
      leave() {},
      step() {},
      clear() {},
      randomize() {},
      pulse() {},
      sustain() {},
      resize() {},
      repaint() {},
      destroy() {},
    }
  }

  let width = 0
  let height = 0
  let field: Field = createField(0, 0)
  let presence = createPresence({ x: 0, y: 0 })
  let energy: Energy = RESTING
  let phase = 0
  let seconds = 0
  let last = 0
  let painted = 0
  let stopped = false
  let handle = 0
  let ink = '#a2a5a8'
  let muted = '#85888b'
  let accent = '#a2a5a8'
  let stroke: { on: boolean; x: number; y: number } | undefined
  let hovered: { x: number; y: number } | undefined

  const repaint = () => {
    const style = getComputedStyle(host)
    ink = style.getPropertyValue('--ink').trim() || ink
    muted = style.getPropertyValue('--ink-muted').trim() || muted
    accent = style.getPropertyValue('--redwood').trim() || accent
  }

  const publish = () => {
    const next = {
      generation: field.generation,
      population: population(field),
      pace: Math.round(pace(energy.level) * 10) / 10,
    }
    const current = useLifeCounts.getState()
    if (
      Object.keys(next).some(
        (key) =>
          next[key as keyof typeof next] !== current[key as keyof typeof next],
      )
    )
      useLifeCounts.setState(next)
  }

  const fit = (w: number, h: number) => {
    if (w <= 0 || h <= 0) return
    width = w
    height = h
    // Capping backing pixels controls both power use and GPU uploads on iOS.
    const scale = Math.min(window.devicePixelRatio || 1, 2)
    canvas.width = Math.round(w * scale)
    canvas.height = Math.round(h * scale)
    canvas.style.width = `${w}px`
    canvas.style.height = `${h}px`
    ctx.setTransform(scale, 0, 0, scale, 0, 0)
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.font = '12px "JetBrains Mono", monospace'
    const cols = Math.max(1, Math.floor(w / CELL_W))
    const rows = Math.max(1, Math.floor(h / CELL_H))
    if (field.cols === cols && field.rows === rows) return
    const first = field.cols === 0
    field = resize(field, cols, rows)
    if (first) {
      field = fill(field, Math.random)
      presence = createPresence({
        x: Math.floor(cols / 2),
        y: Math.floor((rows * 5) / 6),
      })
    }
    publish()
  }

  const draw = () => {
    ctx.clearRect(0, 0, width, height)
    const level = 0.34 * glow(energy.level)
    for (let i = 0; i < field.age.length; i++) {
      const look = cellLook(ageAt(field, i), ghostAt(field, i))
      if (!look) continue
      ctx.fillStyle =
        look.tone === 'accent' ? accent : look.tone === 'ink' ? ink : muted
      ctx.globalAlpha = Math.min(1, look.weight * level)
      ctx.fillText(
        look.glyph,
        ((i % field.cols) + 0.5) * CELL_W,
        (Math.floor(i / field.cols) + 0.5) * CELL_H,
      )
    }
    if (useLifeControls.getState().companion) {
      ctx.fillStyle = accent
      for (const spark of presence.sparks) {
        ctx.globalAlpha = Math.min(1, spark.life * 0.45)
        ctx.fillText('+', (spark.x + 0.5) * CELL_W, (spark.y + 0.5) * CELL_H)
      }
      for (const glyph of figure(presence, seconds, CELL_H / CELL_W)) {
        ctx.globalAlpha = Math.min(1, glyph.weight * 0.75)
        ctx.fillText(
          glyph.glyph,
          (presence.at.x + glyph.dx + 0.5) * CELL_W,
          (presence.at.y + glyph.dy + 0.5) * CELL_H,
        )
      }
    }
    // The selected brush follows the pointer without changing the field.
    // Match the WebGL renderer's preview placement and glyph.
    const brush = useLifeControls.getState().brush
    if (hovered && brush !== 'cell') {
      const pattern = PATTERNS[brush]
      const left = hovered.x - Math.floor(pattern.width / 2)
      const top = hovered.y - Math.floor(pattern.height / 2)
      ctx.fillStyle = accent
      ctx.globalAlpha = 0.5
      for (const [x, y] of pattern.cells) {
        const row = top + y
        // stamp() wraps horizontally but clips outside the top/bottom.
        if (row < 0 || row >= field.rows) continue
        const col = (((left + x) % field.cols) + field.cols) % field.cols
        ctx.fillText('o', (col + 0.5) * CELL_W, (row + 0.5) * CELL_H)
      }
    }
    ctx.globalAlpha = 1
    publishLifeFrame(canvas)
  }

  const tick = (now: number) => {
    if (stopped) return
    handle = requestAnimationFrame(tick)
    if (now - painted < FRAME_MS) return
    const dt = last ? Math.min((now - last) / 1000, 0.1) : 0
    painted = now
    last = now
    seconds += dt
    energy = decay(energy, dt)
    const next = beat(
      phase,
      dt,
      energy.level,
      useLifeControls.getState().playing,
    )
    phase = next.steps >= 4 ? 0 : next.phase
    for (let i = 0; i < Math.min(next.steps, 4); i++)
      field = step(emit(field, energy.level, Math.random))
    presence = advance(presence, dt, {
      still: reducedMotion,
      quiet: stroke !== undefined,
    })
    if (useLifeControls.getState().companion && !reducedMotion) {
      const nextPresence = companion(presence, field, {
        random: Math.random,
        personActive: stroke !== undefined,
        rest: restSeconds(energy.level),
      })
      presence = nextPresence.presence
      if (nextPresence.seed)
        field = stamp(
          field,
          PATTERNS[nextPresence.seed.pattern].cells,
          nextPresence.seed.x,
          nextPresence.seed.y,
        )
    }
    draw()
    publish()
  }

  const at = (clientX: number, clientY: number) => {
    const box = canvas.getBoundingClientRect()
    return {
      x: Math.floor((clientX - box.left) / CELL_W),
      y: Math.floor((clientY - box.top) / CELL_H),
    }
  }

  repaint()
  fit(host.clientWidth, host.clientHeight)
  draw()
  handle = requestAnimationFrame(tick)

  return {
    press(x, y) {
      const cell = at(x, y)
      hovered = cell
      if (useLifeControls.getState().brush !== 'cell') {
        field = stamp(
          field,
          PATTERNS[useLifeControls.getState().brush as keyof typeof PATTERNS]
            .cells,
          cell.x,
          cell.y,
        )
      } else {
        const on = !alive(field, cell.x, cell.y)
        stroke = { ...cell, on }
        field = paint(field, cell.x, cell.y, on)
      }
      draw()
    },
    drag(x, y) {
      hovered = at(x, y)
      if (stroke) {
        field = paintLine(field, stroke, hovered, stroke.on)
        stroke = { ...hovered, on: stroke.on }
        draw()
      }
    },
    release() {
      stroke = undefined
    },
    hover(x, y) {
      hovered = at(x, y)
      draw()
    },
    leave() {
      stroke = undefined
      hovered = undefined
      draw()
    },
    step() {
      field = step(emit(field, energy.level, Math.random))
      draw()
      publish()
    },
    clear() {
      field = clear(field)
      draw()
      publish()
    },
    randomize() {
      field = fill(clear(field), Math.random)
      draw()
      publish()
    },
    pulse(kind) {
      energy = pulse(energy, kind)
    },
    sustain(running) {
      energy = sustain(energy, running)
    },
    resize(w, h) {
      fit(w, h)
      draw()
    },
    repaint() {
      repaint()
      draw()
    },
    destroy() {
      stopped = true
      cancelAnimationFrame(handle)
      canvas.remove()
    },
  }
}
