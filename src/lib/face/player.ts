// SOURCING: a cue list played against a clock, as a timeline player does; one performance per layer with the newer one interrupting, and a record of how each ended, after the handoff's split of a definition from its invocations (docs/plans/theo-face.md). What a cue does to the rig is this app's.
import type { Layer, Rig } from './layers'
import type { Cue, Place, Score } from './program'

/** What the player asks of wherever the face is shown. */
export interface Stage {
  /** Where a place is, as a gaze in -1..1 per axis; `undefined` when it cannot be found. */
  gazeAt: (place: Place) => { x: number; y: number } | undefined
  /** Moves the face on the page. */
  go: (place: Place, size: number | undefined, over: number) => void
  /** Kicks the matter. */
  burst: (x: number, y: number, strength: number) => void
}

export type Ending = 'completed' | 'interrupted' | 'stopped'

/** One time a performance was played: who asked, with what draw, and how it ended. */
export interface Invocation {
  readonly id: string
  /** The book name and version it came from, or `undefined` for one written on the spot. */
  readonly name?: string
  readonly owner: string
  readonly layer: Layer
  readonly seed: number
  readonly ms: number
  readonly startedAt: number
  endedAt?: number
  ending?: Ending
}

interface Playing {
  readonly invocation: Invocation
  readonly score: Score
  elapsed: number
  next: number
  readonly waves: Array<Extract<Cue, { kind: 'wave' }>>
  readonly held: Set<string>
  /** Features it put on the face, to be taken away when it lets go. */
  readonly added: Set<string>
  readonly settled: Array<(ending: Ending) => void>
}

const TAU = Math.PI * 2
const HISTORY = 12

/** Runs scores on the rig, one per layer, and remembers how each ended. */
export class Player {
  private readonly playing = new Map<Layer, Playing>()
  /** Performances that ended and kept what they held: a mood, a sleep. They hold until the layer is stopped or played on again. */
  private readonly kept = new Map<Layer, Playing>()
  readonly history: Array<Invocation> = []
  private count = 0
  /** The features the face came with: no performance adds them and none takes them away. */
  private readonly own: ReadonlySet<string>
  /** Who put each added feature there. It leaves when the last of them lets go. */
  private readonly users = new Map<string, Set<Playing>>()

  constructor(
    private readonly rig: Rig,
    private readonly stage: Stage,
    private readonly clock: () => number = () => Date.now(),
  ) {
    this.own = new Set(rig.channels.features().map((feature) => feature.id))
  }

  /** Starts a score on a layer, ending whatever played there. */
  play(
    score: Score,
    how: { layer: Layer; owner: string; name?: string },
  ): Invocation {
    this.stop(how.layer, 'interrupted')
    const invocation: Invocation = {
      id: `p${++this.count}`,
      ...(how.name ? { name: how.name } : {}),
      owner: how.owner,
      layer: how.layer,
      seed: score.seed,
      ms: score.ms,
      startedAt: this.clock(),
    }
    this.playing.set(how.layer, {
      invocation,
      score,
      elapsed: 0,
      next: 0,
      waves: [],
      held: new Set(),
      added: new Set(),
      settled: [],
    })
    this.history.push(invocation)
    if (this.history.length > HISTORY) this.history.shift()
    // Cues at 0 take effect before the first frame, so a start is never a blank.
    this.advance(how.layer, 0)
    return invocation
  }

  /** Resolves when the invocation ends, with how; at once if it already has. */
  ended(id: string): Promise<Ending> {
    for (const playing of this.playing.values())
      if (playing.invocation.id === id)
        return new Promise((resolve) => playing.settled.push(resolve))
    const past = this.history.find((invocation) => invocation.id === id)
    return Promise.resolve(past?.ending ?? 'completed')
  }

  /** What is playing on a layer now. */
  active(layer: Layer) {
    return this.playing.get(layer)?.invocation
  }

  /** What holds a layer: what plays there, or what ended there and kept its hold. */
  holding(layer: Layer) {
    return (this.playing.get(layer) ?? this.kept.get(layer))?.invocation
  }

  /** Ends what plays on a layer and lets go of everything held there, kept or not. */
  stop(layer: Layer, ending: Ending = 'stopped') {
    const kept = this.kept.get(layer)
    if (kept) {
      this.kept.delete(layer)
      this.letGo(layer, kept)
    }
    const playing = this.playing.get(layer)
    if (!playing) return
    this.finish(layer, playing, ending, false)
  }

  private letGo(layer: Layer, playing: Playing) {
    this.rig.release(layer, [...playing.held], { over: 380 })
    for (const id of playing.added) {
      const users = this.users.get(id)
      users?.delete(playing)
      if (users && users.size > 0) continue
      this.users.delete(id)
      this.rig.retireFeature(id)
    }
    playing.added.clear()
  }

  private finish(
    layer: Layer,
    playing: Playing,
    ending: Ending,
    keep: boolean,
  ) {
    this.playing.delete(layer)
    playing.invocation.endedAt = this.clock()
    playing.invocation.ending = ending
    if (keep) this.kept.set(layer, playing)
    else this.letGo(layer, playing)
    for (const settle of playing.settled) settle(ending)
  }

  /** Moves every performance on by `ms` and lays this frame's waves over the rig. */
  tick(ms: number) {
    for (const layer of [...this.playing.keys()]) this.advance(layer, ms)
  }

  private advance(layer: Layer, ms: number) {
    const playing = this.playing.get(layer)
    if (!playing) return
    playing.elapsed += ms
    const { cues } = playing.score
    while (playing.next < cues.length) {
      const cue = cues[playing.next] as Cue
      if (cue.at > playing.elapsed) break
      playing.next++
      this.fire(layer, playing, cue)
    }
    if (!this.rig.still) {
      for (let index = playing.waves.length - 1; index >= 0; index--) {
        const wave = playing.waves[index] as Extract<Cue, { kind: 'wave' }>
        if (playing.elapsed >= wave.until) {
          playing.waves.splice(index, 1)
          continue
        }
        const into = playing.elapsed - wave.at
        const left = wave.until - playing.elapsed
        // Ease in and out over a fifth of the wave, so it never starts or stops with a jump.
        const edge = Math.max(40, (wave.until - wave.at) * 0.2)
        const envelope = Math.min(1, into / edge, left / edge)
        const turn = into / wave.period + wave.phase
        const level =
          wave.shape === 'sine'
            ? Math.sin(turn * TAU)
            : wave.shape === 'square'
              ? Math.sin(turn * TAU) >= 0
                ? 1
                : -1
              : Math.sin(turn * TAU) * 0.6 +
                Math.sin(turn * TAU * 2.71 + 1.3) * 0.4
        this.rig.offset(wave.channel, wave.amp * envelope * level)
      }
    }
    if (playing.elapsed >= playing.score.ms && playing.next >= cues.length)
      this.finish(layer, playing, 'completed', playing.score.keep)
  }

  private fire(layer: Layer, playing: Playing, cue: Cue) {
    switch (cue.kind) {
      case 'hold': {
        const value = cue.relative
          ? this.rig.target(cue.channel) + cue.value
          : cue.value
        if (
          this.rig.hold(layer, cue.channel, value, {
            over: cue.over,
            bounce: cue.bounce,
          }) !== undefined
        )
          playing.held.add(cue.channel)
        return
      }
      case 'wave':
        playing.waves.push(cue)
        return
      case 'look': {
        const gaze = this.stage.gazeAt(cue.place)
        if (!gaze) return
        for (const [channel, value] of [
          ['gaze.x', gaze.x],
          ['gaze.y', gaze.y],
        ] as const) {
          this.rig.hold(layer, channel, value, { over: cue.over })
          playing.held.add(channel)
        }
        return
      }
      case 'feature':
        if (cue.remove) {
          // Said outright, it goes for everyone who had it.
          for (const user of this.users.get(cue.id) ?? [])
            user.added.delete(cue.id)
          this.users.delete(cue.id)
          this.rig.retireFeature(cue.id)
          return
        }
        if (this.rig.addFeature({ id: cue.id, side: cue.side }) !== undefined)
          return
        // Whether the feature was already there or on its way out, this performance now has it too.
        if (this.own.has(cue.id)) return
        playing.added.add(cue.id)
        this.users.set(
          cue.id,
          (this.users.get(cue.id) ?? new Set<Playing>()).add(playing),
        )
        return
      case 'go':
        this.stage.go(cue.place, cue.size, cue.over)
        return
      case 'burst':
        this.stage.burst(cue.x, cue.y, cue.strength)
        return
      case 'release': {
        const names = cue.channels ?? [...playing.held]
        this.rig.release(layer, names, { over: cue.over })
        for (const name of names) playing.held.delete(name)
        return
      }
    }
  }
}
