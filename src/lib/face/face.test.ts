import { describe, expect, test } from 'bun:test'
import { BOOK_LIMITS, BUILT_IN, Book } from './book'
import { Channels, FEATURE_PARAMS, MAX_FEATURES } from './channels'
import { Face, SLEEP_AFTER_MS, plainGaze } from './engine'
import { readShape, restShape, seatPoint } from './feature'
import { THEO } from './identity'
import { Rig } from './layers'
import { Field, GRAIN_STRIDE } from './particles'
import { LIMITS, compile } from './program'
import { seeded } from './random'
import type { Shelf } from './book'

const shelf = (): Shelf & { readonly kept: Map<string, string> } => {
  const kept = new Map<string, string>()
  return {
    kept,
    getItem: (key) => kept.get(key) ?? null,
    setItem: (key, value) => void kept.set(key, value),
  }
}

/** A face on a clock the test turns, so nothing waits on real time. */
const theo = (seed = 7, kept?: Shelf) => {
  let now = 1_700_000_000_000
  const face = new Face({
    seed,
    clock: () => now,
    ...(kept ? { shelf: kept } : {}),
  })
  face.attach({ gazeAt: plainGaze, go: () => {}, burst: () => {} })
  const run = (ms: number) => {
    for (let t = 0; t < ms; t += 8) {
      now += 8
      face.advance(0.008)
    }
  }
  return { face, run, skip: (ms: number) => void (now += ms) }
}

const channels = () => new Channels(THEO.features)
/** A performance's name without its version. */
const plain = (name: string | undefined) => name?.split('@')[0] ?? 'nothing'

describe('channels', () => {
  test('every feature has every param, and the eyes alias means both', () => {
    const made = channels()
    for (const param of Object.keys(FEATURE_PARAMS))
      expect(made.spec(`eye.left.${param}`)).toBeDefined()
    expect(made.expand('eyes.lid')).toEqual(['eye.left.lid', 'eye.right.lid'])
    expect(made.expand('face.tilt')).toEqual(['face.tilt'])
    expect(made.expand('eye.left.nose')).toEqual([])
  })

  test('a feature nobody planned for gets channels of its own, up to a limit', () => {
    const made = channels()
    expect(made.addFeature({ id: 'mouth', side: 'centre' })).toBeUndefined()
    expect(made.spec('mouth.lowBow')).toBeDefined()
    expect(made.addFeature({ id: 'mouth', side: 'centre' })).toBeUndefined()
    expect(typeof made.addFeature({ id: 'Not An Id', side: 'centre' })).toBe(
      'string',
    )
    for (let index = 0; made.features().length < MAX_FEATURES; index++)
      made.addFeature({ id: `spot${index}`, side: 'centre' })
    expect(typeof made.addFeature({ id: 'one.more', side: 'centre' })).toBe(
      'string',
    )
    made.removeFeature('mouth')
    expect(made.spec('mouth.lowBow')).toBeUndefined()
  })

  test('a near miss is named', () => {
    expect(channels().nearest('eye.left.lidd')).toBe('eye.left.lid')
  })
})

describe('feature', () => {
  const point = (shape = restShape(-1), theta = 0, u = 1) => {
    const out = new Float32Array(2)
    seatPoint(shape, theta, u, out, 0)
    return [out[0] as number, out[1] as number] as const
  }

  test('a rest eye sits on its own side of the face', () => {
    const left = point(restShape(-1), 0, 0)
    const right = point(restShape(1), 0, 0)
    expect(left[0]).toBeLessThan(0)
    expect(right[0]).toBeCloseTo(-left[0], 5)
    expect(right[1]).toBeCloseTo(left[1], 5)
  })

  test('a closing lid brings the top of the eye down to a line', () => {
    const open = restShape(-1)
    const shut = { ...open, lid: 1 }
    const top = -Math.PI / 2
    expect(point(shut, top + Math.PI * 2)[1]).toBeGreaterThan(
      point(open, top + Math.PI * 2)[1],
    )
    let lowest = Infinity
    let highest = -Infinity
    for (let step = 0; step < 64; step++) {
      const [, y] = point(shut, (step / 64) * Math.PI * 2)
      lowest = Math.min(lowest, y)
      highest = Math.max(highest, y)
    }
    expect(highest - lowest).toBeLessThan(open.h * 0.5)
  })

  test('a radial gain pulls one part of the rim out and leaves the opposite side', () => {
    const box = restShape(0)
    const pulled = { ...box, gains: Float32Array.of(2, 1, 1, 1, 1, 1, 1, 1) }
    expect(point(pulled, 0)[0] - point(box, 0)[0]).toBeCloseTo(box.w, 3)
    expect(point(pulled, Math.PI)[0]).toBeCloseTo(point(box, Math.PI)[0], 4)
  })

  test('a shape is read from channels by feature id', () => {
    const rig = new Rig(THEO.features)
    rig.hold('performance', 'eye.left.h', 20, { over: 0 })
    rig.settle()
    const shape = readShape(restShape(-1), 'eye.left', (name) => rig.read(name))
    expect(shape.h).toBeCloseTo(20, 3)
  })
})

describe('rig', () => {
  const settle = (rig: Rig, seconds = 3) => {
    for (let t = 0; t < seconds; t += 1 / 120) {
      rig.beginFrame()
      rig.step(1 / 120)
    }
  }

  test('a higher layer wins while it holds, and the lower one shows again after', () => {
    const rig = new Rig(THEO.features)
    rig.hold('mood', 'face.tilt', 4, { over: 200 })
    rig.hold('performance', 'face.tilt', -10, { over: 200 })
    settle(rig)
    expect(rig.read('face.tilt')).toBeCloseTo(-10, 1)
    rig.release('performance')
    settle(rig)
    expect(rig.read('face.tilt')).toBeCloseTo(4, 1)
    rig.release('mood')
    settle(rig)
    expect(rig.read('face.tilt')).toBeCloseTo(0, 1)
  })

  test('a held value is kept inside the channel’s bounds', () => {
    const rig = new Rig(THEO.features)
    rig.hold('performance', 'eye.left.lid', 9, { over: 0 })
    settle(rig, 0.5)
    expect(rig.read('eye.left.lid')).toBeLessThanOrEqual(1.0001)
  })

  test('no move, however abrupt, sends a spring off to infinity', () => {
    const rig = new Rig(THEO.features)
    for (const over of [0, 1, 20, 39, 41, 80]) {
      rig.hold('performance', 'eye.left.x', over % 2 ? 46 : -46, {
        over,
        bounce: 1,
      })
      settle(rig, 0.4)
      expect(Math.abs(rig.read('eye.left.x'))).toBeLessThan(120)
    }
  })

  test('a bouncy move overshoots; a still rig does not', () => {
    const furthest = (still: boolean) => {
      const rig = new Rig(THEO.features)
      rig.still = still
      rig.hold('performance', 'face.dy', 10, { over: 300, bounce: 0.8 })
      let far = 0
      for (let t = 0; t < 2; t += 1 / 120) {
        rig.beginFrame()
        rig.step(1 / 120)
        far = Math.max(far, rig.read('face.dy'))
      }
      return far
    }
    expect(furthest(false)).toBeGreaterThan(10.2)
    expect(furthest(true)).toBeLessThan(10.05)
  })

  test('an unknown channel is not held', () => {
    expect(
      new Rig(THEO.features).hold('performance', 'eye.left.nope', 1),
    ).toBeUndefined()
  })
})

describe('field', () => {
  const shapes = [restShape(-1), restShape(1)]
  const matter = { cohesion: 1, jitter: 0, drift: 0, size: 1, glow: 1, hue: 0 }

  test('the matter settles inside its features and inside the visor', () => {
    const field = new Field(THEO, 7)
    for (let t = 0; t < 2; t += 1 / 120) field.step(shapes, matter, 1 / 120, t)
    const { minX, maxX, minY, maxY } = field.extent()
    expect(minX).toBeGreaterThanOrEqual(-THEO.width / 2)
    expect(maxX).toBeLessThanOrEqual(THEO.width / 2)
    expect(minY).toBeGreaterThan(-THEO.height / 2)
    expect(maxY).toBeLessThan(THEO.height / 2)
    // Two eyes: nothing sits in the gap between them.
    const out = field.write(
      new Float32Array(field.count * GRAIN_STRIDE),
      matter,
      THEO.grain,
      [1, 1, 1],
    )
    let between = 0
    for (let index = 0; index < field.count; index++)
      if (Math.abs(out[index * GRAIN_STRIDE] as number) < 4) between++
    expect(between).toBe(0)
  })

  test('a feature given a share draws matter out of the others', () => {
    const field = new Field(THEO, 7)
    const mouth = { ...restShape(0), x: 0, y: 22, w: 10, h: 2, share: 0 }
    const count = (lit: Float32Array) => {
      let low = 0
      for (let index = 0; index < field.count; index++)
        if ((lit[index * GRAIN_STRIDE + 1] as number) > 16) low++
      return low
    }
    const out = new Float32Array(field.count * GRAIN_STRIDE)
    for (let t = 0; t < 1; t += 1 / 120)
      field.step([...shapes, mouth], matter, 1 / 120, t)
    expect(count(field.write(out, matter, THEO.grain, [1, 1, 1]))).toBe(0)
    mouth.share = 0.5
    for (let t = 1; t < 3; t += 1 / 120)
      field.step([...shapes, mouth], matter, 1 / 120, t)
    const moved = count(field.write(out, matter, THEO.grain, [1, 1, 1]))
    expect(moved).toBeGreaterThan(field.count * 0.12)
    expect(moved).toBeLessThan(field.count * 0.3)
  })

  test('a poke scatters the matter and it comes back', () => {
    const field = new Field(THEO, 7)
    for (let t = 0; t < 1; t += 1 / 120) field.step(shapes, matter, 1 / 120, t)
    const before = field.extent()
    field.burst(-20, 0, 400)
    for (let t = 0; t < 0.08; t += 1 / 120)
      field.step(shapes, matter, 1 / 120, 1 + t)
    const scattered = field.extent()
    expect(scattered.maxY - scattered.minY).toBeGreaterThan(
      before.maxY - before.minY + 2,
    )
    for (let t = 0; t < 3; t += 1 / 120)
      field.step(shapes, matter, 1 / 120, 2 + t)
    const after = field.extent()
    expect(after.maxY - after.minY).toBeCloseTo(before.maxY - before.minY, 0)
  })

  test('the same seed lays the same face', () => {
    const one = new Field(THEO, 11)
    const two = new Field(THEO, 11)
    for (let t = 0; t < 0.5; t += 1 / 120) {
      one.step(shapes, matter, 1 / 120, t)
      two.step(shapes, matter, 1 / 120, t)
    }
    expect(one.extent()).toEqual(two.extent())
  })
})

describe('compile', () => {
  const context = () => ({ channels: channels(), seed: 3 })
  const refusal = (input: unknown) => {
    const checked = compile(input, context())
    if (checked.ok) throw new Error('compiled')
    return checked
  }

  test('steps become timed cues, in order', () => {
    const checked = compile(
      {
        steps: [
          { op: 'to', set: { 'eyes.lid': 1 }, over: 100, hold: 50 },
          { op: 'wait', ms: 200 },
          { op: 'to', set: { 'face.tilt': 8 }, over: 300 },
        ],
      },
      context(),
    )
    if (!checked.ok) throw new Error(checked.reason)
    expect(checked.score.ms).toBe(650)
    const times = checked.score.cues.map((cue) => cue.at)
    expect([...times].sort((a, b) => a - b)).toEqual(times)
    expect(times.at(-1)).toBe(350)
  })

  test('par runs its steps together; stagger offsets them', () => {
    const steps = [
      { op: 'to', set: { 'eye.left.lid': 1 }, over: 100 },
      { op: 'to', set: { 'eye.right.lid': 1 }, over: 100 },
    ]
    const together = compile({ op: 'par', steps }, context())
    const apart = compile({ op: 'stagger', steps, gap: 80 }, context())
    if (!together.ok || !apart.ok) throw new Error('refused')
    expect(together.score.ms).toBe(100)
    expect(apart.score.ms).toBe(180)
  })

  test('a refusal says where and why, and offers the nearest name', () => {
    const wrong = refusal({
      steps: [
        { op: 'wait', ms: 10 },
        { op: 'to', set: { 'eye.left.lidd': 1 } },
      ],
    })
    expect(wrong.path).toContain('steps[1]')
    expect(wrong.reason).toContain('eye.left.lid')
    expect(refusal({ steps: [{ op: 'fly' }] }).reason).toContain('fly')
    expect(refusal('no-such-performance').reason.length).toBeGreaterThan(0)
    expect(refusal(42).reason.length).toBeGreaterThan(0)
  })

  test('a program cannot run for ever or grow without bound', () => {
    const long = { op: 'wait', ms: LIMITS.ms }
    expect(refusal({ steps: [long, long] }).reason).toContain(String(LIMITS.ms))
    expect(
      refusal({
        op: 'repeat',
        times: LIMITS.repeat + 1,
        steps: [{ op: 'wait', ms: 1 }],
      }).reason.length,
    ).toBeGreaterThan(0)
    let deep: unknown = { op: 'wait', ms: 1 }
    for (let depth = 0; depth <= LIMITS.depth + 1; depth++)
      deep = { op: 'seq', steps: [deep] }
    expect(refusal(deep).reason.length).toBeGreaterThan(0)
    const many = {
      steps: Array.from({ length: LIMITS.cues + 5 }, () => ({
        op: 'to',
        set: { 'face.tilt': 1 },
        over: 1,
      })),
    }
    expect(refusal(many).reason.length).toBeGreaterThan(0)
  })

  test('a value may be drawn from a range; the seed decides it', () => {
    const program = {
      op: 'to',
      set: { 'face.tilt': { rand: [-10, 10] } },
      over: 100,
    }
    const tilt = (seed: number) => {
      const checked = compile(program, { channels: channels(), seed })
      if (!checked.ok) throw new Error(checked.reason)
      return JSON.stringify(checked.score.cues)
    }
    expect(tilt(1)).toBe(tilt(1))
    expect(new Set([1, 2, 3, 4, 5].map(tilt)).size).toBeGreaterThan(1)
  })

  test('a program may add a feature and then move it', () => {
    const checked = compile(
      {
        steps: [
          {
            op: 'feature',
            id: 'mouth',
            set: { x: 0, y: 20, w: 8, h: 2, share: 0.2 },
          },
          { op: 'to', set: { 'mouth.lowBow': -0.8 }, over: 200 },
        ],
      },
      context(),
    )
    if (!checked.ok) throw new Error(`${checked.path}: ${checked.reason}`)
    expect(checked.score.adds).toEqual(['mouth'])
  })

  test('every performance Theo comes with compiles', () => {
    const book = new Book()
    for (const entry of BUILT_IN) {
      const checked = compile(entry.program, {
        channels: channels(),
        lookup: (name) => book.lookup(name),
        seed: 1,
      })
      if (!checked.ok)
        throw new Error(`${entry.name} at ${checked.path}: ${checked.reason}`)
      expect(checked.score.cues.length).toBeGreaterThan(0)
    }
  })
})

describe('book', () => {
  const blink = { op: 'to', set: { 'eyes.lid': 1 }, over: 80, hold: 60 }

  test('a new performance is saved with a version, and a change makes the next one', () => {
    const kept = shelf()
    const book = new Book(kept)
    const first = book.define(
      'slow-blink',
      blink,
      'A slow blink.',
      'agent',
      channels(),
    )
    const second = book.define(
      'slow-blink',
      { ...blink, over: 400 },
      '',
      'agent',
      channels(),
    )
    if (!first.ok || !second.ok) throw new Error('refused')
    expect([first.entry.version, second.entry.version]).toEqual([1, 2])
    expect(book.get('slow-blink')?.version).toBe(2)
    expect(book.get('slow-blink@1')?.program).toEqual(first.entry.program)
    // It is still there for the next page.
    expect(new Book(kept).get('slow-blink')?.version).toBe(2)
  })

  test('what Theo came with can be revised but never lost', () => {
    const book = new Book()
    const own = book.get('blink')
    expect(book.remove('blink').ok).toBe(false)
    const revised = book.define(
      'blink',
      { ...blink, over: 300 },
      '',
      'agent',
      channels(),
    )
    if (!revised.ok) throw new Error(revised.reason)
    expect(revised.entry.version).toBe(2)
    expect(book.get('blink')?.by).toBe('agent')
    expect(book.get('blink@1')).toEqual(own)
    expect(book.remove('blink').ok).toBe(true)
    expect(book.get('blink')).toEqual(own)
  })

  test('a saved version keeps meaning what it meant when what it uses is revised', () => {
    const book = new Book()
    const hello = book.define(
      'hello',
      {
        steps: [
          { op: 'use', name: 'blink' },
          {
            op: 'par',
            steps: [
              { op: 'repeat', times: 2, step: { op: 'use', name: 'nod' } },
            ],
          },
          { op: 'vary', of: [{ op: 'use', name: 'blink@1' }] },
        ],
      },
      '',
      'agent',
      channels(),
    )
    if (!hello.ok) throw new Error(hello.reason)
    const before = compile(hello.entry.program, {
      channels: channels(),
      lookup: book.lookup,
      seed: 3,
    })
    const revised = book.define(
      'blink',
      { op: 'to', set: { 'eyes.lid': 1 }, over: 900, hold: 900 },
      '',
      'agent',
      channels(),
    )
    if (!revised.ok) throw new Error(revised.reason)
    expect(JSON.stringify(hello.entry.program)).toContain('"blink@1"')
    expect(JSON.stringify(hello.entry.program)).toContain('"nod@1"')
    const after = compile(book.get('hello@1')?.program, {
      channels: channels(),
      lookup: book.lookup,
      seed: 3,
    })
    expect(after).toEqual(before)
    // A new version of hello, written the same way, takes the new blink.
    const again = book.define(
      'hello',
      { op: 'use', name: 'blink' },
      '',
      'agent',
      channels(),
    )
    if (!again.ok) throw new Error(again.reason)
    expect(JSON.stringify(again.entry.program)).toContain('"blink@2"')
  })

  test('a performance another one uses cannot be removed from under it', () => {
    const book = new Book()
    const part = book.define('part', blink, '', 'agent', channels())
    const whole = book.define(
      'whole',
      { op: 'use', name: 'part' },
      '',
      'agent',
      channels(),
    )
    if (!part.ok || !whole.ok) throw new Error('refused')
    const refused = book.remove('part')
    expect(refused.ok).toBe(false)
    if (refused.ok) throw new Error('removed')
    expect(refused.reason).toContain('whole@1')
    expect(book.get('part')).toBeDefined()
    expect(book.remove('whole').ok).toBe(true)
    expect(book.remove('part').ok).toBe(true)
    expect(book.get('part')).toBeUndefined()
  })

  test('performances that use each other’s versions can still be taken away', () => {
    const book = new Book()
    const save = (name: string, program: unknown) => {
      const saved = book.define(name, program, '', 'agent', channels())
      if (!saved.ok) throw new Error(saved.reason)
    }
    save('alpha', blink)
    save('beta', { op: 'use', name: 'alpha' })
    save('alpha', { op: 'use', name: 'beta' })
    // Neither name can go whole: each has a version the other uses.
    const alpha = book.remove('alpha')
    const beta = book.remove('beta')
    if (alpha.ok || beta.ok) throw new Error('removed')
    expect(alpha.reason).toContain('beta@1')
    expect(beta.reason).toContain('alpha@2')
    // A version nothing uses goes by itself, and the rest follow.
    const used = book.remove('alpha@1')
    expect(used.ok).toBe(false)
    expect(book.remove('alpha@2').ok).toBe(true)
    expect(book.get('alpha')?.version).toBe(1)
    expect(book.remove('beta').ok).toBe(true)
    expect(book.remove('alpha').ok).toBe(true)
    expect(book.get('alpha')).toBeUndefined()
    expect(book.remove('alpha@1').ok).toBe(false)
  })

  test('versions count toward what the book may hold', () => {
    const book = new Book()
    for (let index = 0; index < BOOK_LIMITS.entries; index++) {
      const saved = book.define('again', blink, '', 'agent', channels())
      if (!saved.ok) throw new Error(saved.reason)
    }
    const over = book.define('again', blink, '', 'agent', channels())
    expect(over.ok).toBe(false)
    expect(book.get('again')?.version).toBe(BOOK_LIMITS.entries)
    expect(book.remove('again').ok).toBe(true)
    expect(book.define('again', blink, '', 'agent', channels()).ok).toBe(true)
  })

  test('a program that does not compile is not saved', () => {
    const book = new Book()
    const refused = book.define(
      'odd',
      { op: 'to', set: { 'eye.left.nope': 1 } },
      '',
      'agent',
      channels(),
    )
    expect(refused.ok).toBe(false)
    expect(book.get('odd')).toBeUndefined()
    expect(book.define('Bad Name', blink, '', 'agent', channels()).ok).toBe(
      false,
    )
  })
})

describe('the face', () => {
  test('a performance moves the face and lets go when it ends', async () => {
    const { face, run } = theo()
    run(400)
    const rest = face.rig.read('eye.left.lidTilt')
    const performed = face.perform('glare', { owner: 'test' })
    if (!performed.ok) throw new Error(performed.reason)
    run(400)
    expect(Math.abs(face.rig.read('eye.left.lidTilt') - rest)).toBeGreaterThan(
      0.2,
    )
    run(performed.invocation.ms + 1_500)
    expect(await face.ended(performed.invocation.id)).toBe('completed')
    expect(face.rig.read('eye.left.lidTilt')).toBeCloseTo(rest, 1)
  })

  test('a performance played again before its features have gone still takes them away', () => {
    const { face, run } = theo()
    const brows = () =>
      face.rig.channels
        .features()
        .filter((feature) => feature.id.startsWith('brow.')).length
    // Again while the first is still playing.
    const first = face.perform('skeptic', { owner: 'test' })
    if (!first.ok) throw new Error(first.reason)
    run(200)
    expect(brows()).toBe(2)
    face.perform('skeptic', { owner: 'test' })
    run(first.invocation.ms + 4_000)
    expect(brows()).toBe(0)
    // Again once it has ended, while the brows are still flowing out.
    face.perform('skeptic', { owner: 'test' })
    run(first.invocation.ms + 16)
    expect(face.rig.isRetiring('brow.left')).toBe(true)
    face.perform('skeptic', { owner: 'test' })
    run(first.invocation.ms + 4_000)
    expect(brows()).toBe(0)
  })

  test('a feature two performances use stays until the last of them lets go', () => {
    const { face, run } = theo()
    const mouth = {
      op: 'feature',
      id: 'mouth',
      set: { x: 0, y: 20, w: 8, h: 2, share: 0.25 },
    }
    const kept = face.perform(
      { keep: true, steps: [mouth] },
      { layer: 'mood', owner: 'test' },
    )
    const passing = face.perform(
      { steps: [mouth, { op: 'to', set: { 'mouth.w': 14 }, hold: 200 }] },
      { owner: 'test' },
    )
    if (!kept.ok || !passing.ok) throw new Error('refused')
    run(4_000)
    expect(face.player.active('performance')).toBeUndefined()
    expect(face.rig.channels.feature('mouth')).toBeDefined()
    face.player.stop('mood')
    run(4_000)
    expect(face.rig.channels.feature('mouth')).toBeUndefined()
  })

  test('a program nobody named plays, and what it adds is taken away after', () => {
    const { face, run } = theo()
    const performed = face.perform(
      {
        steps: [
          {
            op: 'feature',
            id: 'mouth',
            set: { x: 0, y: 20, w: 8, h: 2, share: 0.25 },
          },
          {
            op: 'to',
            set: { 'mouth.w': 14, 'mouth.lowBow': -0.9 },
            over: 200,
            hold: 300,
          },
        ],
      },
      { owner: 'test' },
    )
    if (!performed.ok) throw new Error(`${performed.path}: ${performed.reason}`)
    run(300)
    expect(face.rig.channels.feature('mouth')).toBeDefined()
    expect(face.rig.read('mouth.w')).toBeGreaterThan(10)
    run(4_000)
    expect(face.rig.channels.feature('mouth')).toBeUndefined()
    expect(face.rig.channels.features().map((feature) => feature.id)).toEqual([
      'eye.left',
      'eye.right',
    ])
  })

  test('a refused program changes nothing', () => {
    const { face, run } = theo()
    run(200)
    const before = face.rig.away()
    const performed = face.perform(
      { op: 'to', set: { 'eye.left.nope': 1 } },
      { owner: 'test' },
    )
    expect(performed.ok).toBe(false)
    run(200)
    expect(face.rig.away()).toEqual(before)
    expect(face.player.active('performance')).toBeUndefined()
  })

  test('a new performance interrupts the one before it', async () => {
    const { face, run } = theo()
    const first = face.perform('dizzy', { owner: 'test' })
    run(100)
    const second = face.perform('nod', { owner: 'test' })
    if (!first.ok || !second.ok) throw new Error('refused')
    expect(await face.ended(first.invocation.id)).toBe('interrupted')
    expect(face.player.active('performance')?.id).toBe(second.invocation.id)
  })

  test('the hand wins over a performance while it holds the face', () => {
    const { face, run } = theo()
    face.perform(
      { op: 'to', set: { 'face.tilt': 14 }, over: 100, hold: 3_000 },
      { owner: 'test' },
    )
    run(600)
    expect(face.rig.read('face.tilt')).toBeGreaterThan(10)
    face.grab()
    face.carry(-40, 0)
    run(300)
    const held = face.rig.read('face.tilt')
    face.drop()
    expect(held).not.toBeCloseTo(14, 0)
  })

  test('poked again and again, it does not keep doing the same thing', () => {
    const { face, run } = theo(7)
    const seen: Array<string> = []
    for (let poke = 0; poke < 10; poke++) {
      const reaction = face.poke()
      seen.push(plain(reaction?.name))
      run(900)
    }
    const early = new Set(seen.slice(0, 3))
    const late = new Set(seen.slice(6))
    expect(new Set(seen).size).toBeGreaterThanOrEqual(4)
    // What it does once it has had enough is not what it did at first.
    expect([...late].some((name) => !early.has(name))).toBe(true)
    expect(
      seen.some((name) =>
        ['glare', 'dizzy', 'melt', 'sigh', 'shake'].includes(name),
      ),
    ).toBe(true)
    for (let index = 1; index < seen.length; index++)
      if (seen[index] !== 'nothing')
        expect(
          seen[index] === seen[index - 1] && seen[index] === seen[index - 2],
        ).toBe(false)
  })

  test('two faces with different seeds answer the same pokes differently', () => {
    const pokes = (seed: number) => {
      const { face, run } = theo(seed)
      const seen: Array<string> = []
      for (let poke = 0; poke < 8; poke++) {
        seen.push(plain(face.poke()?.name))
        run(900)
      }
      return seen.join(',')
    }
    expect(pokes(7)).toBe(pokes(7))
    expect(new Set([7, 8, 9, 10].map(pokes)).size).toBeGreaterThan(1)
  })

  test('finishing straight after a failure is relief; finishing clean is not', () => {
    const endings = (failed: boolean) => {
      const seen = new Set<string>()
      for (let seed = 1; seed <= 12; seed++) {
        const { face, run, skip } = theo(seed)
        face.setLiveness('work')
        // Three seconds of work in which nothing happens: the clock moves, and the face is run only long enough to settle. What follows the failure is run in full.
        run(200)
        skip(2_800)
        if (failed) face.notice('run.tool.fail')
        run(2_500)
        face.setLiveness('done')
        run(50)
        seen.add(plain(face.player.active('reaction')?.name))
      }
      return seen
    }
    expect(endings(true).has('sigh')).toBe(true)
    expect(endings(false).has('sigh')).toBe(false)
    // Twenty-four faces run for some seconds each: about two seconds of work here, given room on a busy machine.
  }, 20_000)

  test('idle long enough it sleeps, the window does not wake it, and the person does', () => {
    const { face, run, skip } = theo()
    run(500)
    expect(face.asleep).toBe(false)
    skip(SLEEP_AFTER_MS + 1_000)
    run(3_000)
    expect(face.asleep).toBe(true)
    expect(face.words()).toContain('sleep')
    expect(face.rig.read('eye.left.lid')).toBeGreaterThan(0.8)
    face.notice('env.resize')
    run(200)
    expect(face.asleep).toBe(true)
    face.poke()
    expect(face.asleep).toBe(false)
    run(3_000)
    expect(face.rig.read('eye.left.lid')).toBeLessThan(0.3)
  })

  test('a run keeps it awake, and each liveness has its own manner', () => {
    const { face, run, skip } = theo()
    face.setLiveness('work')
    skip(SLEEP_AFTER_MS * 2)
    run(2_000)
    expect(face.asleep).toBe(false)
    expect(face.player.holding('mood')?.name).toBe('focus@1')
    face.setLiveness('ask')
    expect(face.player.holding('mood')?.name).toBe('ask@1')
    face.setLiveness('idle')
    expect(face.player.holding('mood')).toBeUndefined()
  })

  test('with motion reduced the face still changes, without the bounce', () => {
    const { face, run } = theo()
    face.still = true
    face.perform(
      { op: 'to', set: { 'face.dy': 10 }, over: 300, bounce: 0.9, hold: 2_000 },
      { owner: 'test' },
    )
    let far = 0
    for (let step = 0; step < 100; step++) {
      run(16)
      far = Math.max(far, face.rig.read('face.dy'))
    }
    expect(far).toBeGreaterThan(9.5)
    expect(far).toBeLessThan(10.05)
  })

  test('the buffer it hands a renderer is finite and lit', () => {
    const { face, run } = theo()
    run(600)
    let lit = 0
    for (let index = 0; index < face.buffer.length; index++) {
      expect(Number.isFinite(face.buffer[index] as number)).toBe(true)
      if (index % GRAIN_STRIDE === 7 && (face.buffer[index] as number) > 0.2)
        lit++
    }
    expect(lit).toBeGreaterThan(face.field.count * 0.9)
  })

  test('the manual names every channel, step and performance the face has', () => {
    const { face } = theo()
    const manual = JSON.stringify(face.manual('all'))
    for (const name of [
      'eyes.',
      'lidTilt',
      'matter.cohesion',
      'stagger',
      'feature',
      'glare@1',
      'person.poke',
    ])
      expect(manual).toContain(name)
    expect(JSON.stringify(face.manual('state')).length).toBeLessThan(
      manual.length / 4,
    )
  })

  test('what an agent defined is there for the next face', () => {
    const kept = shelf()
    const { face } = theo(7, kept)
    face.book.define(
      'hello',
      { op: 'to', set: { 'face.tilt': 6 }, over: 200 },
      'A hello.',
      'agent',
      face.rig.channels,
    )
    const again = theo(7, kept).face
    expect(again.perform('hello', { owner: 'test' }).ok).toBe(true)
  })
})

describe('the body', () => {
  /** Tells the face its figure moved at a steady speed, in face units per second, for a while. */
  const travel = (
    made: ReturnType<typeof theo>,
    vx: number,
    vy: number,
    ms: number,
  ) => {
    // Told once a frame, as the driver tells it.
    for (let t = 0; t < ms; t += 8) {
      made.face.sway((vx * 8) / 1000, (vy * 8) / 1000, 0.008)
      made.run(8)
    }
  }

  test('moving, the head leans into it and the eyes go a little ahead; stopped, both come back', () => {
    const made = theo()
    made.run(300)
    const gaze = made.face.rig.read('gaze.x')
    travel(made, 700, 0, 400)
    expect(made.face.head().tilt).toBeGreaterThan(4)
    expect(made.face.head().tilt).toBeLessThanOrEqual(16)
    expect(made.face.rig.read('gaze.x')).toBeGreaterThan(gaze + 0.1)
    travel(made, -700, 0, 500)
    expect(made.face.head().tilt).toBeLessThan(-4)
    made.run(900)
    expect(Math.abs(made.face.head().tilt)).toBeLessThan(0.5)
  })

  test('setting off, the visor is left a little behind, and it catches up at a steady pace', () => {
    const made = theo()
    made.run(300)
    travel(made, 900, 0, 120)
    const behind = made.face.head().dx
    expect(behind).toBeLessThan(-0.8)
    expect(behind).toBeGreaterThanOrEqual(-5)
    travel(made, 900, 0, 1500)
    expect(Math.abs(made.face.head().dx)).toBeLessThan(0.3)
  })

  test('however fast it is flung, the lean stays inside its bounds', () => {
    const made = theo()
    travel(made, 90_000, -90_000, 300)
    const head = made.face.head()
    expect(Math.abs(head.tilt)).toBeLessThanOrEqual(16)
    expect(Math.abs(head.dx)).toBeLessThanOrEqual(5)
    expect(Math.abs(head.dy)).toBeLessThanOrEqual(5)
    expect(made.face.buffer.every(Number.isFinite)).toBe(true)
  })

  test('the eyes are on where it is going before it goes, and let go when it has arrived', () => {
    const made = theo()
    made.run(300)
    const rest = made.face.rig.read('gaze.x')
    made.face.heading({ x: 1, y: -0.5 })
    made.run(170)
    expect(made.face.rig.read('gaze.x')).toBeGreaterThan(rest + 0.5)
    expect(made.face.rig.read('gaze.y')).toBeLessThan(-0.2)
    made.face.heading(undefined)
    made.run(700)
    expect(made.face.rig.read('gaze.x')).toBeCloseTo(rest, 1)
  })

  test('bound for somewhere, the eyes do not follow the pointer', () => {
    const made = theo()
    made.face.followPointer({ x: -1, y: 0 })
    made.run(600)
    expect(made.face.rig.read('gaze.x')).toBeLessThan(-0.4)
    made.face.heading({ x: 1, y: 0 })
    made.run(600)
    expect(made.face.rig.read('gaze.x')).toBeGreaterThan(0.6)
  })

  test('striking an edge knocks the head back from it, shuts the eye on that side, and it recovers', () => {
    const made = theo()
    made.run(300)
    made.face.bump('left', 0.8)
    made.run(24)
    const { rig } = made.face
    expect(made.face.head().dx).toBeGreaterThan(3)
    expect(made.face.head().squash).toBeLessThan(-0.05)
    expect(rig.read('eye.left.lid')).toBeGreaterThan(
      rig.read('eye.right.lid') + 0.25,
    )
    expect(made.face.state().recentEvents).toContain('body.bump.left')
    made.face.player.stop('reaction')
    made.run(1500)
    expect(Math.abs(made.face.head().dx)).toBeLessThan(0.2)
    expect(rig.read('eye.left.lid')).toBeLessThan(0.05)

    made.face.bump('right', 0.8)
    made.run(24)
    expect(made.face.head().dx).toBeLessThan(-3)
    expect(rig.read('eye.right.lid')).toBeGreaterThan(
      rig.read('eye.left.lid') + 0.25,
    )
    made.face.player.stop('reaction')
    made.run(1500)

    made.face.bump('bottom', 1)
    made.run(24)
    expect(made.face.head().dy).toBeLessThan(-3)
    expect(made.face.head().squash).toBeGreaterThan(0.05)
  })

  test('meeting Kit knocks the head as an edge does, and is remembered as a meeting, not a wall', () => {
    const made = theo()
    made.run(300)
    made.face.bump('right', 0.8, 'kit')
    made.run(24)
    expect(made.face.head().dx).toBeLessThan(-3)
    const events = made.face.state().recentEvents
    expect(events).toContain('body.meet.kit')
    expect(events).not.toContain('body.bump.right')
    // It has something to say about it that a wall does not get.
    expect(['startle', 'wince', 'curious', 'wink']).toContain(
      plain(made.face.player.active('reaction')?.name),
    )
  })

  test('the eyes follow what it is given to watch, over the pointer, and let go', () => {
    const made = theo()
    made.face.followPointer({ x: -1, y: 0 })
    made.run(600)
    const onPointer = made.face.rig.read('gaze.x')
    expect(onPointer).toBeLessThan(-0.4)
    // Kit, up and to the right.
    made.face.watch({ x: 1, y: -0.8 })
    made.run(600)
    expect(made.face.rig.read('gaze.x')).toBeGreaterThan(0.5)
    expect(made.face.rig.read('gaze.y')).toBeLessThan(-0.3)
    made.face.watch(undefined)
    made.run(900)
    expect(made.face.rig.read('gaze.x')).toBeCloseTo(onPointer, 1)
  })

  test('bound for somewhere, where it is going wins over what it is watching', () => {
    const made = theo()
    made.face.watch({ x: -1, y: 0 })
    made.run(600)
    expect(made.face.rig.read('gaze.x')).toBeLessThan(-0.5)
    made.face.heading({ x: 1, y: 0 })
    made.run(600)
    expect(made.face.rig.read('gaze.x')).toBeGreaterThan(0.6)
    made.face.heading(undefined)
    made.run(900)
    expect(made.face.rig.read('gaze.x')).toBeLessThan(-0.5)
  })

  test('a poke to one side closes that eye more than the other', () => {
    const made = theo()
    made.run(300)
    made.face.poke(24, 0)
    made.face.player.stop('reaction')
    made.run(24)
    const { rig } = made.face
    expect(rig.read('eye.right.lid')).toBeGreaterThan(
      rig.read('eye.left.lid') + 0.2,
    )
    made.run(1200)
    expect(rig.read('eye.right.lid')).toBeLessThan(0.05)
  })

  test('what it makes of an edge depends on how wound up it is', () => {
    const calm = new Set<string>()
    const wound = new Set<string>()
    for (let seed = 1; seed <= 40; seed++) {
      const made = theo(seed)
      made.run(200)
      calm.add(plain(made.face.bump('left', 0.6)?.name))
      const other = theo(seed)
      other.run(200)
      for (let poke = 0; poke < 6; poke++) {
        other.face.poke()
        other.skip(300)
      }
      other.face.player.stop('reaction')
      expect(other.face.memory.mood.arousal).toBeGreaterThan(0.7)
      wound.add(plain(other.face.bump('left', 0.6)?.name))
    }
    expect(calm.has('squint')).toBe(true)
    expect(calm.has('dizzy')).toBe(false)
    expect(calm.has('glare')).toBe(false)
    expect(wound.has('dizzy')).toBe(true)
    expect(wound.has('squint')).toBe(false)
  })

  test('thrown, it lets go of what the hand held and remembers being thrown', () => {
    const made = theo()
    made.run(200)
    made.face.grab()
    made.run(200)
    expect(made.face.rig.held('hand').length).toBeGreaterThan(0)
    made.face.toss(0.7)
    expect(made.face.rig.held('hand')).toEqual([])
    expect(made.face.state().recentEvents).toContain('person.throw')
    expect(made.face.memory.mood.arousal).toBeGreaterThan(0.3)
  })

  test('none of it says anything about a run', () => {
    const made = theo()
    made.run(200)
    travel(made, 800, 200, 300)
    made.face.bump('top', 1)
    made.face.toss(1)
    made.face.heading({ x: 1, y: 1 })
    made.run(400)
    expect(made.face.state().liveness).toBe('idle')
    expect(
      made.face.state().recentEvents.filter((kind) => kind.startsWith('run.')),
    ).toEqual([])
  })

  test('asleep, its own body settling does not wake it', () => {
    const made = theo()
    made.skip(SLEEP_AFTER_MS + 1_000)
    made.run(100)
    expect(made.face.asleep).toBe(true)
    expect(made.face.bump('left', 0.4)).toBeUndefined()
    expect(made.face.asleep).toBe(true)
  })

  test('with motion reduced, travel and knocks move nothing', () => {
    const made = theo()
    made.face.still = true
    made.run(300)
    const lid = made.face.rig.read('eye.left.lid')
    travel(made, 900, 0, 300)
    made.face.bump('left', 1)
    made.face.player.stop('reaction')
    made.run(24)
    expect(made.face.head().tilt).toBeCloseTo(0, 5)
    expect(made.face.head().dx).toBeCloseTo(0, 5)
    expect(made.face.rig.read('eye.left.lid')).toBeCloseTo(lid, 5)
  })

  test('the artifact is a place to look at and to go to, and visit goes there', () => {
    const made = theo()
    const went: Array<unknown> = []
    made.face.attach({
      gazeAt: plainGaze,
      go: (place, size) => void went.push([place, size]),
      burst: () => {},
    })
    const checked = compile(
      {
        steps: [
          { op: 'look', at: 'artifact' },
          { op: 'go', to: 'artifact' },
        ],
      },
      { channels: channels(), lookup: () => undefined },
    )
    expect(checked.ok).toBe(true)
    const performed = made.face.perform('visit', { owner: 'test' })
    expect(performed.ok).toBe(true)
    // It looks before it goes.
    made.run(200)
    expect(went).toEqual([])
    expect(made.face.rig.read('gaze.x')).toBeGreaterThan(0.2)
    made.run(400)
    expect(went).toEqual([['artifact', 1.8]])
  })
})

describe('seeded', () => {
  test('the same seed gives the same numbers', () => {
    const one = seeded(5)
    const two = seeded(5)
    expect([one(), one(), one()]).toEqual([two(), two(), two()])
  })
})
