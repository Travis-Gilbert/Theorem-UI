// SOURCING: what a face does when nothing asks it to, as character animation and social robots keep one alive (blinks at irregular intervals with the odd double, small gaze flicks, breath; Kismet and the Disney principles the handoff cites, docs/plans/theo-face.md). Laid over the rig as one-frame modifiers so it never holds a channel. The timings are this app's.
import type { Rig } from './layers'
import { between } from './random'
import type { Random } from './random'

const TAU = Math.PI * 2

/**
 * Blinks, gaze flicks and breath. Each scales with its `auto.*` channel, so
 * a performance or a mood turns them up, down or off like anything else.
 */
export class Autonomy {
  private blinkIn: number
  /** Seconds into the current blink, or -1 when not blinking. */
  private blinkAt = -1
  private again = false
  private flickIn: number
  private flickX = 0
  private flickY = 0
  private nowX = 0
  private nowY = 0
  private breath = 0

  constructor(private readonly random: Random) {
    this.blinkIn = between(random, 1.2, 3.4)
    this.flickIn = between(random, 0.8, 2.4)
  }

  /** Starts a blink now, whatever the timer says. */
  blink() {
    if (this.blinkAt < 0) this.blinkAt = 0
  }

  /** Moves on by `dt` seconds and lays this frame's modifiers over the rig. */
  tick(rig: Rig, dt: number) {
    if (rig.still) return
    const blinkRate = rig.read('auto.blink')
    if (this.blinkAt < 0 && blinkRate > 0) {
      this.blinkIn -= dt * blinkRate
      if (this.blinkIn <= 0) {
        this.blinkAt = 0
        this.again = this.random() < 0.16
        this.blinkIn = between(this.random, 2.4, 6.2)
      }
    }
    if (this.blinkAt >= 0) {
      this.blinkAt += dt
      // Shut in 70 ms, held 40, open in 130.
      const t = this.blinkAt
      const amount =
        t < 0.07 ? t / 0.07 : t < 0.11 ? 1 : Math.max(0, 1 - (t - 0.11) / 0.13)
      for (const feature of rig.channels.features())
        if (feature.id.startsWith('eye'))
          rig.toward(`${feature.id}.lid`, 1, amount * amount * (3 - 2 * amount))
      if (t >= 0.24) {
        this.blinkAt = this.again ? 0 : -1
        this.again = false
      }
    }

    const flick = rig.read('auto.saccade')
    if (flick > 0) {
      this.flickIn -= dt * Math.max(0.4, flick)
      if (this.flickIn <= 0) {
        this.flickIn = between(this.random, 0.7, 3.2)
        const reach = 0.16 * Math.min(2, flick)
        this.flickX = between(this.random, -reach, reach)
        this.flickY = between(this.random, -reach * 0.6, reach * 0.6)
      }
    } else {
      this.flickX = 0
      this.flickY = 0
    }
    // A flick is quick but not instant.
    const quick = 1 - Math.exp(-dt * 26)
    this.nowX += (this.flickX - this.nowX) * quick
    this.nowY += (this.flickY - this.nowY) * quick
    rig.offset('gaze.x', this.nowX)
    rig.offset('gaze.y', this.nowY)

    const depth = rig.read('auto.breath')
    if (depth > 0) {
      // Deeper breath is slower breath: sleep breathes long.
      this.breath += (dt * TAU) / (3.4 + depth * 1.1)
      const level = Math.sin(this.breath)
      rig.offset('face.dy', level * 0.5 * depth)
      rig.offset('face.scale', level * 0.012 * depth)
      for (const feature of rig.channels.features())
        if (feature.id.startsWith('eye'))
          rig.offset(`${feature.id}.h`, level * 0.28 * depth)
    }
  }
}
