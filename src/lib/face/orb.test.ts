// SOURCING: bun:test; lib/face's own parts (the work meter, the globe a feature's matter can be set as, the orb form and what it follows), checked on a clock the test turns. The run here is events and numbers the test feeds, as the thread's runtime and the driver would.
import { describe, expect, test } from 'bun:test'
import { BUILT_IN } from './book'
import { Channels } from './channels'
import { Face, plainGaze } from './engine'
import { restShape, seatPoint } from './feature'
import { THEO } from './identity'
import { compile } from './program'
import { SIGNALS } from './signals'
import { Work, effortShare } from './work'

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
  return { face, run }
}

const plain = (name: string | undefined) => name?.split('@')[0] ?? 'nothing'
const features = (face: Face) =>
  face.rig.channels.features().map((feature) => feature.id)
const orbOf = (face: Face) => {
  const index = features(face).indexOf('orb')
  const shape = face.shapesNow()[index]
  if (!shape) throw new Error('the face has no orb')
  return shape
}

describe('the work meter', () => {
  /** Every push lands with the same strength. */
  const steady = () => new Work(() => 0.5)

  test('each tool call that starts or ends pushes the pace up, and it dies away', () => {
    const work = steady()
    expect(work.measure(0, true)['run.pace']).toBe(0)
    work.tool(0)
    const one = work.measure(0, true)['run.pace']
    expect(one).toBeCloseTo(0.3, 5)
    work.tool(0)
    expect(work.measure(0, true)['run.pace']).toBeCloseTo(0.6, 5)
    // Half of it is gone after 2.4 seconds, and nearly all after twenty.
    expect(work.measure(2_400, true)['run.pace']).toBeCloseTo(0.3, 5)
    expect(work.measure(22_400, true)['run.pace']).toBeLessThan(0.01)
  })

  test('the pace never passes 1, however many calls there are', () => {
    const work = steady()
    for (let call = 0; call < 40; call++) work.tool(0)
    expect(work.measure(0, true)['run.pace']).toBe(1)
    expect(SIGNALS['run.pace'].max).toBe(1)
  })

  test('a call that failed pushes harder than one that did not', () => {
    const passed = steady()
    const failed = steady()
    passed.tool(0)
    failed.tool(0, true)
    expect(failed.measure(0, true)['run.pace']).toBeGreaterThan(
      passed.measure(0, true)['run.pace'],
    )
  })

  test('no two pushes need land alike', () => {
    const draws = [0, 0.999]
    const work = new Work(() => draws.shift() ?? 0)
    work.tool(0)
    const first = work.measure(0, true)['run.pace']
    work.tool(0)
    const second = work.measure(0, true)['run.pace'] - first
    expect(second).toBeGreaterThan(first * 1.5)
  })

  test('while nothing runs both numbers are 0, and the next run starts from nothing', () => {
    const work = steady()
    work.effort = effortShare('max')
    work.tool(0)
    expect(work.measure(0, false)).toEqual({ 'run.pace': 0, 'run.effort': 0 })
    expect(work.measure(8, true)).toEqual({ 'run.pace': 0, 'run.effort': 1 })
  })

  test('an effort level is where it lies from least to most; one not listed, or none, is the middle', () => {
    expect(effortShare('low')).toBe(0)
    expect(effortShare('medium')).toBe(0.25)
    expect(effortShare('high')).toBe(0.5)
    expect(effortShare('xhigh')).toBe(0.75)
    expect(effortShare('max')).toBe(1)
    expect(effortShare(undefined)).toBe(0.5)
    expect(effortShare('strenuous')).toBe(0.5)
  })
})

describe('a globe', () => {
  const seat = (
    shape: ReturnType<typeof restShape>,
    theta: number,
    u: number,
  ) => {
    const out = new Float32Array(2)
    const light = seatPoint(shape, theta, u, out, 0)
    return { x: out[0] as number, y: out[1] as number, light }
  }
  const ball = {
    ...restShape(0),
    w: 10,
    h: 10,
    round: 2,
    x: 0,
    y: 0,
    globe: 9,
  }
  /** Matter spread as a field spreads it, the rim (u of 1) left out. */
  const inside = (shape: typeof ball, count = 900) => {
    const seats: Array<ReturnType<typeof seat>> = []
    for (let i = 0; i < count; i++)
      seats.push(seat(shape, (i * 2.399963) % (Math.PI * 2), (i + 0.5) / count))
    return seats
  }

  test('the matter is set on a ball: nothing of it lies outside the circle', () => {
    for (const at of inside(ball))
      expect(Math.hypot(at.x, at.y)).toBeLessThanOrEqual(10 + 1e-6)
  })

  test('it is gathered into dots, with dark between them', () => {
    // The cells of a fine grid that matter on the near side falls in, with plenty of matter to fill them: dots leave most of the disc dark, a filled feature does not.
    const lit = (shape: typeof ball) =>
      new Set(
        inside(shape, 6000)
          .filter((at) => at.light > 0.6)
          .map((at) => `${Math.round(at.x / 0.7)},${Math.round(at.y / 0.7)}`),
      ).size
    expect(lit(ball)).toBeLessThan(lit({ ...ball, globe: 0 }) * 0.5)
  })

  test('the far side is dimmer than the near side, and a flat feature is lit all over', () => {
    const lights = inside(ball).map((at) => at.light)
    expect(Math.max(...lights)).toBeCloseTo(1, 2)
    expect(Math.min(...lights)).toBeLessThan(0.2)
    for (const at of inside({ ...ball, globe: 0 })) expect(at.light).toBe(1)
  })

  test('turning it moves its dots, and a whole turn brings them back', () => {
    const still = inside(ball)
    const turned = inside({ ...ball, spun: 0.2 })
    const whole = inside({ ...ball, spun: 1 })
    let moved = 0
    for (const [index, at] of still.entries()) {
      const other = turned[index]
      const back = whole[index]
      if (!other || !back) throw new Error('unequal')
      if (Math.hypot(at.x - other.x, at.y - other.y) > 0.5) moved++
      expect(back.x).toBeCloseTo(at.x, 3)
      expect(back.y).toBeCloseTo(at.y, 3)
    }
    expect(moved).toBeGreaterThan(still.length / 2)
  })

  test('part of the rim goes into orbit outside the ball, never piled up at one end', () => {
    const out: Array<ReturnType<typeof seat>> = []
    for (let i = 0; i < 600; i++) {
      const at = seat(ball, (i * 2.399963) % (Math.PI * 2), 1)
      if (Math.hypot(at.x, at.y) > 10.5) out.push(at)
    }
    expect(out.length).toBeGreaterThan(60)
    for (const at of out) expect(Math.hypot(at.x, at.y)).toBeLessThan(15.01)
    // Seen edge on, an orbit's grains would crowd its two ends.
    const far = out.filter((at) => Math.hypot(at.x, at.y) > 14.6)
    expect(far.length).toBeLessThan(out.length / 2)
  })

  test('with no rows a feature is filled as it always was', () => {
    const flat = { ...ball, globe: 0, spun: 3, stirred: 2 }
    const plainShape = { ...ball, globe: 0 }
    for (const [index, at] of inside(flat).entries()) {
      const other = inside(plainShape)[index]
      expect(other).toEqual(at)
    }
  })
})

describe('the orb', () => {
  test('a run at work gives the face the orb, held until the run rests', () => {
    const { face, run } = theo()
    face.setLiveness('work')
    expect(face.working).toBe(true)
    expect(face.state().form).toEqual({ name: 'orb@1', until: 'run.rest' })
    // Long after the performance itself has run out, the orb is still held.
    run(6_000)
    expect(plain(face.player.holding('form')?.name)).toBe('orb')
    expect(features(face)).toContain('orb')
    expect(face.rig.read('orb.globe')).toBeCloseTo(9, 1)
    // The eyes have given it their matter.
    expect(face.rig.read('eye.left.share')).toBeCloseTo(0, 2)
    face.setLiveness('done')
    expect(face.working).toBe(false)
    expect(face.state().form).toBeUndefined()
    run(3_000)
    expect(features(face)).toEqual(['eye.left', 'eye.right'])
    expect(face.rig.read('eye.left.share')).toBeCloseTo(1, 1)
  })

  test('it is never left out by chance', () => {
    for (let seed = 1; seed <= 24; seed++) {
      const { face } = theo(seed)
      face.setLiveness('work')
      expect(plain(face.player.holding('form')?.name)).toBe('orb')
    }
  })

  test('a run that stops to ask is not at work; when it goes on, the orb is back', () => {
    const { face, run } = theo()
    face.setLiveness('work')
    run(1_000)
    face.setLiveness('ask')
    expect(face.state().form).toBeUndefined()
    run(1_000)
    face.setLiveness('work')
    expect(plain(face.player.holding('form')?.name)).toBe('orb')
  })

  test('tool calls make it turn faster and stir it; with none it turns slowly all the same', () => {
    const { face, run } = theo()
    face.setLiveness('work')
    face.feed({ 'run.pace': 0, 'run.effort': 0.5 })
    run(1_500)
    const calm = { spin: orbOf(face).spin, stir: orbOf(face).stir }
    expect(calm.spin).toBeGreaterThan(0)
    const before = orbOf(face).spun
    run(1_000)
    const slow = orbOf(face).spun - before
    expect(slow).toBeCloseTo(calm.spin, 2)

    face.feed({ 'run.pace': 1, 'run.effort': 0.5 })
    run(400)
    expect(orbOf(face).spin).toBeGreaterThan(calm.spin * 4)
    expect(orbOf(face).stir).toBeGreaterThan(calm.stir * 4)
    const from = orbOf(face).spun
    run(1_000)
    expect(orbOf(face).spun - from).toBeGreaterThan(slow * 4)
  })

  test('a change of speed never jumps it: what it has turned is kept', () => {
    const { face, run } = theo()
    face.setLiveness('work')
    face.feed({ 'run.pace': 1, 'run.effort': 0.5 })
    run(2_000)
    const turned = orbOf(face).spun
    face.feed({ 'run.pace': 0, 'run.effort': 0.5 })
    run(8)
    expect(orbOf(face).spun - turned).toBeLessThan(0.02)
    expect(orbOf(face).spun).toBeGreaterThanOrEqual(turned)
  })

  test('the harder the run was asked to think, the larger it is', () => {
    const size = (effort: number) => {
      const { face, run } = theo()
      face.setLiveness('work')
      face.feed({ 'run.pace': 0, 'run.effort': effort })
      run(1_500)
      return orbOf(face).scale
    }
    const least = size(0)
    const middle = size(0.5)
    const most = size(1)
    expect(middle).toBeGreaterThan(least * 1.2)
    expect(most).toBeGreaterThan(middle * 1.2)
    // At its largest and leaning, the ball and its orbits stay inside the visor: 100 by 64.
    const orb = (() => {
      const { face, run } = theo()
      face.setLiveness('work')
      face.feed({ 'run.pace': 1, 'run.effort': 1 })
      run(1_500)
      return orbOf(face)
    })()
    expect(orb.h * orb.scale * 1.5).toBeLessThan(32)
  })

  test('with motion reduced it is a ball that does not turn, at the size it has before anything is followed', () => {
    const { face, run } = theo()
    face.still = true
    face.setLiveness('work')
    face.feed({ 'run.pace': 1, 'run.effort': 1 })
    run(2_000)
    const orb = orbOf(face)
    expect(orb.globe).toBeCloseTo(9, 1)
    expect(orb.scale).toBeCloseTo(0.76, 2)
    expect(orb.spin).toBe(0)
    expect(orb.stir).toBe(0)
    expect(orb.spun).toBe(0)
    expect(orb.stirred).toBe(0)
  })

  test('finishing straight after a failed tool is still relief: the run resting does not come between', () => {
    const { face } = theo()
    face.setLiveness('work')
    face.notice('run.tool.fail')
    face.setLiveness('done')
    expect(face.memory.recent.slice(-3).map((event) => event.kind)).toEqual([
      'run.tool.fail',
      'run.done',
      'run.rest',
    ])
  })

  test('the orb compiles as it stands, and the manual says what a run can be followed by', () => {
    const orb = BUILT_IN.find((item) => item.name === 'orb')
    if (!orb) throw new Error('No orb.')
    const checked = compile(orb.program, {
      channels: new Channels(THEO.features),
      seed: 3,
    })
    if (!checked.ok) throw new Error(`orb: ${checked.reason}`)
    expect(checked.score.notes).toEqual([])
    const { face } = theo()
    const manual = JSON.stringify(face.manual('all'))
    expect(manual).toContain('run.pace')
    expect(manual).toContain('run.effort')
  })
})
