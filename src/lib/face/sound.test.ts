// SOURCING: bun:test; lib/face's own parts (signals, the follow step, forms, rings and bars), checked on a clock the test turns. The sound here is numbers the test feeds, as the page's meter would (lib/sound/meter has its own tests).
import { describe, expect, test } from 'bun:test'
import { BUILT_IN } from './book'
import { Channels } from './channels'
import { Face, SLEEP_AFTER_MS, plainGaze } from './engine'
import { restShape, seatPoint } from './feature'
import { THEO } from './identity'
import { LAYERS } from './layers'
import { compile } from './program'
import { SIGNALS, SIGNAL_NAMES, Signals, isSignal } from './signals'

/** A face on a clock the test turns. */
const theo = (seed = 7) => {
  let now = 1_700_000_000_000
  const face = new Face({ seed, clock: () => now })
  face.attach({ gazeAt: plainGaze, go: () => {}, burst: () => {} })
  const run = (ms: number) => {
    for (let t = 0; t < ms; t += 8) {
      now += 8
      face.advance(0.008)
    }
  }
  return { face, run, skip: (ms: number) => void (now += ms) }
}

const context = () => ({ channels: new Channels(THEO.features), seed: 3 })
const plain = (name: string | undefined) => name?.split('@')[0] ?? 'nothing'
const features = (face: Face) =>
  face.rig.channels.features().map((feature) => feature.id)
/** A channel nothing of the face's own moves, so what it reads is what followed. */
const TIED = 'emit.left'
const OTHER = 'emit.right'
const QUIET = Object.fromEntries(
  SIGNAL_NAMES.filter((name) => name.startsWith('sound.')).map((name) => [
    name,
    0,
  ]),
)

describe('signals', () => {
  test('a signal is kept inside its bounds, and what is no signal is passed over', () => {
    const signals = new Signals()
    signals.feed({ 'sound.level': 4, 'sound.low': -2, 'sound.mid': NaN })
    signals.feed({ 'not.a.signal': 1 })
    expect(signals.read('sound.level')).toBe(SIGNALS['sound.level'].max)
    expect(signals.read('sound.low')).toBe(0)
    expect(signals.read('sound.mid')).toBe(0)
    expect(signals.read('not.a.signal')).toBe(0)
    expect(isSignal('sound.beat')).toBe(true)
    expect(isSignal('toString')).toBe(false)
  })

  test('only what is away from nothing is reported', () => {
    const signals = new Signals()
    signals.feed({ 'sound.level': 0.504, 'sound.high': 0.004 })
    expect(signals.away()).toEqual({ 'sound.level': 0.5 })
  })
})

describe('follow', () => {
  test('a channel tied to a signal moves as the signal does, and not for anything else', () => {
    const { face, run } = theo()
    const performed = face.perform(
      {
        steps: [
          { op: 'follow', channel: TIED, signal: 'sound.level', amp: 0.8 },
          { op: 'wait', ms: 4_000 },
        ],
      },
      { owner: 'test' },
    )
    expect(performed.ok).toBe(true)
    run(400)
    expect(face.rig.read(TIED)).toBe(0)
    face.feed({ 'sound.level': 1 })
    run(400)
    expect(face.rig.read(TIED)).toBeCloseTo(0.8, 3)
    face.feed({ 'sound.level': 0.5 })
    run(16)
    expect(face.rig.read(TIED)).toBeCloseTo(0.4, 3)
    face.feed({ 'sound.level': 0 })
    run(16)
    expect(face.rig.read(TIED)).toBe(0)
  })

  test('with `for` the tie lasts that long; the performance ending ends it too', () => {
    const { face, run } = theo()
    face.feed({ 'sound.level': 1 })
    face.perform(
      {
        steps: [
          {
            op: 'follow',
            channel: TIED,
            signal: 'sound.level',
            amp: 0.8,
            for: 600,
          },
          { op: 'wait', ms: 2_000 },
        ],
      },
      { owner: 'test' },
    )
    run(300)
    expect(face.rig.read(TIED)).toBeGreaterThan(0.6)
    run(500)
    expect(face.rig.read(TIED)).toBe(0)

    face.perform(
      {
        steps: [
          { op: 'follow', channel: TIED, signal: 'sound.level', amp: 0.8 },
          { op: 'wait', ms: 500 },
        ],
      },
      { owner: 'test' },
    )
    run(300)
    expect(face.rig.read(TIED)).toBeGreaterThan(0.6)
    run(600)
    expect(face.rig.read(TIED)).toBe(0)
  })

  test('a performance that keeps its hold keeps its ties', () => {
    const { face, run } = theo()
    face.feed({ 'sound.level': 1 })
    face.perform(
      {
        keep: true,
        steps: [
          { op: 'follow', channel: TIED, signal: 'sound.level', amp: 0.8 },
          { op: 'to', set: { 'face.tilt': 4 }, over: 100 },
        ],
      },
      { owner: 'test' },
    )
    run(2_000)
    expect(face.player.active('performance')).toBeUndefined()
    expect(face.player.holding('performance')).toBeDefined()
    expect(face.rig.read(TIED)).toBeCloseTo(0.8, 3)
    face.player.stop('performance')
    run(100)
    expect(face.rig.read(TIED)).toBe(0)
  })

  test('a signal nobody measures, or a channel nobody has, is refused by name', () => {
    const wrong = (step: object) => {
      const checked = compile({ steps: [step] }, context())
      if (checked.ok) throw new Error('compiled')
      return checked
    }
    const signal = wrong({
      op: 'follow',
      channel: 'face.dy',
      signal: 'sound.loudness',
      amp: 1,
    })
    expect(signal.path).toContain('signal')
    expect(signal.reason).toContain('sound.level')
    expect(
      wrong({
        op: 'follow',
        channel: 'face.dz',
        signal: 'sound.level',
        amp: 1,
      }).path,
    ).toContain('channel')
    expect(
      wrong({ op: 'follow', channel: 'face.dy', signal: 'sound.level' }).path,
    ).toContain('amp')
  })

  test('with motion reduced, nothing follows', () => {
    const { face, run } = theo()
    face.still = true
    face.feed({ 'sound.level': 1 })
    face.perform(
      {
        steps: [
          { op: 'follow', channel: TIED, signal: 'sound.level', amp: 0.8 },
          { op: 'wait', ms: 1_000 },
        ],
      },
      { owner: 'test' },
    )
    run(400)
    expect(face.rig.read(TIED)).toBe(0)
  })

  test('with motion reduced a tie with `for` still ends when it is due to', () => {
    const { face, run } = theo()
    face.still = true
    face.perform(
      {
        steps: [
          {
            op: 'follow',
            channel: TIED,
            signal: 'sound.level',
            amp: 0.8,
            for: 600,
          },
          { op: 'wait', ms: 2_000 },
        ],
      },
      { owner: 'test' },
    )
    run(300)
    expect(face.player.tied(TIED)).toEqual(['sound.level'])
    run(500)
    expect(face.player.tied(TIED)).toEqual([])
  })

  test('letting go of a channel ends what it followed, and leaves the other ties be', () => {
    const { face, run } = theo()
    face.feed({ 'sound.level': 1 })
    face.perform(
      {
        steps: [
          { op: 'follow', channel: TIED, signal: 'sound.level', amp: 0.8 },
          { op: 'follow', channel: OTHER, signal: 'sound.level', amp: 0.8 },
          { op: 'wait', ms: 400 },
          { op: 'release', channels: [TIED] },
          { op: 'wait', ms: 1_000 },
        ],
      },
      { owner: 'test' },
    )
    run(300)
    expect(face.rig.read(TIED)).toBeGreaterThan(0.6)
    run(500)
    expect(face.rig.read(TIED)).toBe(0)
    expect(face.player.tied(TIED)).toEqual([])
    expect(face.rig.read(OTHER)).toBeGreaterThan(0.6)
    expect(face.player.tied(OTHER)).toEqual(['sound.level'])
  })

  test('letting go of everything ends every tie, kept or not', () => {
    const { face, run } = theo()
    face.feed({ 'sound.level': 1 })
    face.perform(
      {
        keep: true,
        steps: [
          { op: 'follow', channel: TIED, signal: 'sound.level', amp: 0.8 },
          { op: 'follow', channel: OTHER, signal: 'sound.level', amp: 0.8 },
          { op: 'wait', ms: 400 },
          { op: 'release' },
          { op: 'wait', ms: 300 },
        ],
      },
      { owner: 'test' },
    )
    run(300)
    expect(face.rig.read(OTHER)).toBeGreaterThan(0.6)
    run(1_000)
    expect(face.rig.read(TIED)).toBe(0)
    expect(face.rig.read(OTHER)).toBe(0)
    expect(face.player.tied(TIED)).toEqual([])
    expect(face.player.tied(OTHER)).toEqual([])
  })
})

describe('forms', () => {
  test('the form layer sits over the mood and under everything the face does about a moment', () => {
    expect(LAYERS).toEqual(['mood', 'form', 'reaction', 'performance', 'hand'])
  })

  test('sound starting gives the face a form, held until the sound stops', () => {
    const { face, run } = theo()
    const formed = face.notice('sound.start')
    expect(['boombox', 'speak']).toContain(plain(formed?.name))
    expect(formed?.layer).toBe('form')
    // Long after the performance itself has run out, the form is still held.
    run(5_000)
    expect(face.player.holding('form')?.id).toBe(formed?.id)
    expect(face.state().form).toEqual({
      name: formed?.name ?? '',
      until: 'sound.stop',
    })
    face.notice('sound.stop')
    expect(face.player.holding('form')).toBeUndefined()
    expect(face.state().form).toBeUndefined()
    run(3_000)
    expect(features(face)).toEqual(['eye.left', 'eye.right'])
  })

  test('a form is never left out by chance, and both forms turn up', () => {
    const seen = new Set<string>()
    for (let seed = 1; seed <= 24; seed++) {
      const { face } = theo(seed)
      for (let round = 0; round < 3; round++) {
        const formed = face.notice('sound.start')
        expect(formed).toBeDefined()
        seen.add(plain(formed?.name))
        face.notice('sound.stop')
      }
    }
    expect([...seen].sort()).toEqual(['boombox', 'speak'])
  })

  test('as a loudspeaker it has a deck and a dial, and sends out as much as is playing', () => {
    const { face, run } = theo()
    // Draw until the loudspeaker is the form: which one is the face's to choose.
    for (let tries = 0; tries < 20; tries++) {
      if (plain(face.notice('sound.start')?.name) === 'boombox') break
      face.notice('sound.stop')
    }
    expect(plain(face.player.holding('form')?.name)).toBe('boombox')
    run(1_500)
    expect(features(face)).toEqual(
      expect.arrayContaining(['deck', 'reel.left', 'reel.right', 'dial']),
    )
    expect(face.emitting()).toEqual({ left: 0, right: 0 })
    face.feed({ 'sound.level': 0.8 })
    run(300)
    expect(face.emitting().left).toBeCloseTo(0.8, 1)
    expect(face.emitting().right).toBeCloseTo(0.8, 1)
    const quiet = face.rig.read('eye.left.scale')
    face.feed({ 'sound.level': 0.8, 'sound.low': 1 })
    run(16)
    expect(face.rig.read('eye.left.scale')).toBeGreaterThan(quiet)
    face.feed(QUIET)
    run(16)
    expect(face.emitting()).toEqual({ left: 0, right: 0 })
  })

  test('with motion reduced the loudspeaker does not pump, and still shows that something is sounding', () => {
    const { face, run } = theo()
    face.still = true
    for (let tries = 0; tries < 20; tries++) {
      if (plain(face.notice('sound.start')?.name) === 'boombox') break
      face.notice('sound.stop')
    }
    run(1_500)
    const scale = face.rig.read('eye.left.scale')
    expect(face.emitting()).toEqual({ left: 0, right: 0 })
    face.feed({ 'sound.level': 0.3, 'sound.low': 1 })
    run(16)
    const quiet = face.emitting()
    expect(quiet.left).toBeGreaterThan(0.3)
    expect(quiet.right).toBe(quiet.left)
    expect(face.rig.read('eye.left.scale')).toBeCloseTo(scale, 5)
    // Louder is not more: it is there or it is not.
    face.feed({ 'sound.level': 1, 'sound.low': 1 })
    run(16)
    expect(face.emitting()).toEqual(quiet)
    face.feed(QUIET)
    run(16)
    expect(face.emitting()).toEqual({ left: 0, right: 0 })
  })

  test('as a mouth it opens by how loud the sound is, and shuts when there is none', () => {
    const { face, run } = theo()
    for (let tries = 0; tries < 40; tries++) {
      if (plain(face.notice('sound.start')?.name) === 'speak') break
      face.notice('sound.stop')
    }
    expect(plain(face.player.holding('form')?.name)).toBe('speak')
    run(1_500)
    const shut = face.rig.read('mouth.h')
    face.feed({ 'sound.level': 1 })
    run(16)
    expect(face.rig.read('mouth.h')).toBeGreaterThan(shut + 4)
    face.feed(QUIET)
    run(16)
    expect(face.rig.read('mouth.h')).toBeCloseTo(shut, 2)
  })

  test('the face still reacts over a form, and the form is there after', () => {
    const { face, run } = theo()
    const formed = face.notice('sound.start')
    run(1_000)
    let reacted = 0
    for (let poke = 0; poke < 6; poke++) {
      if (face.poke()?.layer === 'reaction') reacted++
      run(900)
    }
    expect(reacted).toBeGreaterThan(0)
    expect(face.player.holding('form')?.id).toBe(formed?.id)
  })

  test('a form keeps the face from falling asleep; without one it sleeps', () => {
    const { face, run, skip } = theo()
    face.notice('sound.start')
    skip(SLEEP_AFTER_MS + 1_000)
    run(2_000)
    expect(face.asleep).toBe(false)
    face.unform()
    skip(SLEEP_AFTER_MS + 1_000)
    run(2_000)
    expect(face.asleep).toBe(true)
  })

  test('a sound getting loud is a moment, not a form', () => {
    const { face, run } = theo()
    face.notice('sound.start')
    run(1_000)
    const names = new Set<string>()
    for (let index = 0; index < 8; index++) {
      const reaction = face.notice('sound.loud')
      if (reaction) {
        expect(reaction.layer).toBe('reaction')
        names.add(plain(reaction.name))
      }
      run(4_000)
    }
    expect([...names]).toEqual(['thump'])
  })

  test('the manual says what can be followed and which rules give a form', () => {
    const { face } = theo()
    const manual = JSON.stringify(face.manual('all'))
    for (const name of [...SIGNAL_NAMES, 'follow', 'boombox@1', 'sound.stop'])
      expect(manual).toContain(name)
  })

  test('the sound performances compile as they stand', () => {
    for (const name of ['boombox', 'speak', 'thump']) {
      const entry = BUILT_IN.find((item) => item.name === name)
      if (!entry) throw new Error(`No ${name}.`)
      const checked = compile(entry.program, context())
      if (!checked.ok) throw new Error(`${name}: ${checked.reason}`)
      expect(checked.score.notes).toEqual([])
    }
  })
})

describe('rings and bars', () => {
  const seat = (
    shape: ReturnType<typeof restShape>,
    theta: number,
    u: number,
  ) => {
    const out = new Float32Array(2)
    seatPoint(shape, theta, u, out, 0)
    return [out[0] as number, out[1] as number] as const
  }
  const round = { ...restShape(0), w: 10, h: 10, round: 2, x: 0, y: 0 }

  test('rings gather the matter into that many bands, with nothing between', () => {
    const ringed = { ...round, rings: 3 }
    const radii: Array<number> = []
    for (let step = 0; step <= 400; step++)
      radii.push(Math.hypot(...seat(ringed, 0.3, step / 400)) / 10)
    const bands = new Set(radii.map((radius) => Math.ceil(radius * 3 - 1e-9)))
    expect([...bands].sort()).toEqual([1, 2, 3])
    // Each band takes up the outer third or so of its ring: the rest is dark.
    for (const radius of radii) {
      const within = radius * 3 - Math.floor(radius * 3 - 1e-9)
      expect(within).toBeGreaterThan(0.6)
    }
    expect(Math.max(...radii)).toBeCloseTo(1, 3)
  })

  test('bars gather it into that many rows', () => {
    const barred = { ...round, slats: 5 }
    const rows = new Set<number>()
    for (let turn = 0; turn < 64; turn++)
      for (let step = 1; step <= 20; step++) {
        const [, y] = seat(barred, (turn / 64) * Math.PI * 2, step / 20)
        const height = (y / 10 + 1) / 2
        const row = Math.min(4, Math.floor(height * 5))
        rows.add(row)
        // A row's matter stays near its middle.
        expect(Math.abs(height * 5 - row - 0.5)).toBeLessThan(0.2)
      }
    expect(rows.size).toBe(5)
  })

  test('with neither, a feature is filled as it always was', () => {
    const [x, y] = seat(round, 0, 0.25)
    expect(Math.hypot(x, y)).toBeCloseTo(5, 3)
  })
})
