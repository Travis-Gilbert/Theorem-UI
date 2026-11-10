import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import { KitDriver } from './driver'
import { FEET, changeStage, resetKitStage, useKitStage } from './stage'

/** A perch the shell would mark, measured where the test puts it. */
function perch(
  name: string,
  rect: { left: number; top: number; width: number; height: number },
) {
  const element = document.createElement('div')
  element.dataset.kitPerch = name
  element.getBoundingClientRect = () => ({
    ...rect,
    x: rect.left,
    y: rect.top,
    right: rect.left + rect.width,
    bottom: rect.top + rect.height,
    toJSON: () => ({}),
  })
  document.body.append(element)
  return element
}

let driver: KitDriver | undefined
let kit: HTMLElement

beforeEach(() => {
  resetKitStage()
  changeStage({ perch: 'floor', at: 0.5, mounted: true })
  kit = document.createElement('div')
  document.body.append(kit)
  driver = new KitDriver(kit, () => {})
})
afterEach(() => {
  driver?.destroy()
  document.body.replaceChildren()
})

describe('a jump cut short during its crouch', () => {
  test('stopping Kit there ends the jump; it never leaves', async () => {
    perch('composer', { left: 100, top: 300, width: 400, height: 80 })
    const jump = driver!.moveTo('composer', 0.5, 'jump')
    // What the person's grab does: stop whatever Kit is doing.
    driver!.destroy()
    driver = undefined
    expect(await jump).toBe(false)
    await Bun.sleep(300)
    expect(useKitStage.getState().perch).toBe('floor')
    expect(useKitStage.getState().motion).not.toBe('air')
  })

  test('its perch going away leaves Kit standing, not crouched', async () => {
    const composer = perch('composer', {
      left: 100,
      top: 300,
      width: 400,
      height: 80,
    })
    const jump = driver!.moveTo('composer', 0.5, 'jump')
    composer.remove()
    expect(await jump).toBe(false)
    await Bun.sleep(2500)
    expect(useKitStage.getState().motion).toBe('still')
    expect(useKitStage.getState().perch).toBe('floor')
  })
})

describe('Kit in its world', () => {
  test('jumps from the floor onto the composer and stands there', async () => {
    perch('composer', { left: 300, top: 400, width: 400, height: 80 })
    driver!.track()
    expect(await driver!.jumpTo('composer', 0.5, 'arc')).toBe(true)
    const state = useKitStage.getState()
    expect(state.perch).toBe('composer')
    expect(state.at).toBeCloseTo(0.5, 1)
    await Bun.sleep(200)
    expect(useKitStage.getState().motion).toBe('still')
    expect(driver!.position()[1]).toBe(400 + 1 - FEET)
  })

  test('walks along the floor, facing the way it goes', async () => {
    driver!.track()
    const walk = driver!.moveTo('floor', 0.6, 'run')
    await Bun.sleep(60)
    expect(useKitStage.getState().motion).toBe('run')
    expect(useKitStage.getState().facing).toBe(1)
    expect(await walk).toBe(true)
    expect(useKitStage.getState()).toMatchObject({ at: 0.6, motion: 'still' })
  })

  test('a fling comes to rest somewhere on screen', async () => {
    perch('composer', { left: 300, top: 400, width: 400, height: 80 })
    driver!.track()
    const onto = await driver!.fling('up_right', 1)
    expect(['composer', 'floor']).toContain(onto!)
    const [x, y] = driver!.position()
    expect(x).toBeGreaterThanOrEqual(-12)
    expect(x).toBeLessThanOrEqual(window.innerWidth)
    expect(y).toBeLessThan(window.innerHeight)
  })

  test('a move finishes at once while the page is hidden', async () => {
    perch('composer', { left: 300, top: 400, width: 400, height: 80 })
    driver!.track()
    Object.defineProperty(document, 'visibilityState', {
      configurable: true,
      get: () => 'hidden',
    })
    try {
      const started = performance.now()
      expect(await driver!.jumpTo('composer', 0.2, 'leap')).toBe(true)
      expect(performance.now() - started).toBeLessThan(600)
    } finally {
      delete (document as { visibilityState?: unknown }).visibilityState
    }
  })

  test('follows the pointer to the surface under it until another move', async () => {
    perch('composer', { left: 300, top: 400, width: 400, height: 80 })
    driver!.track()
    window.dispatchEvent(
      new PointerEvent('pointermove', { clientX: 650, clientY: 380 }),
    )
    driver!.follow('cursor', 10)
    const until = Date.now() + 4000
    while (useKitStage.getState().perch !== 'composer' && Date.now() < until)
      await Bun.sleep(50)
    expect(useKitStage.getState().perch).toBe('composer')
    // Another move ends the follow.
    await driver!.moveTo('composer', 0.7, 'run')
    window.dispatchEvent(
      new PointerEvent('pointermove', { clientX: 900, clientY: 700 }),
    )
    await Bun.sleep(900)
    expect(useKitStage.getState().perch).toBe('composer')
  }, 10_000)

  test("a throw lands somewhere and is the person's last touch", async () => {
    driver!.track()
    // What the draggable's release does with a fast flick up and to the left.
    const release = (
      driver as unknown as {
        release: (v: { x: number; y: number }, kind: string) => Promise<void>
      }
    ).release.bind(driver)
    await release({ x: -18, y: -14 }, 'thrown')
    expect(useKitStage.getState().touched).toMatchObject({
      kind: 'thrown',
      onto: 'floor',
    })
    expect(useKitStage.getState().motion).not.toBe('fall')
  })
})

describe('a carry let go inside a surface', () => {
  const release = () =>
    (
      driver as unknown as {
        release: (v: { x: number; y: number }, kind: string) => Promise<void>
      }
    ).release.bind(driver)
  const place = () =>
    (driver as unknown as { place: (x: number, y: number) => void }).place.bind(
      driver,
    )

  test('set down in the middle of the composer, Kit climbs onto its top', async () => {
    perch('composer', { left: 100, top: 300, width: 400, height: 120 })
    driver!.track()
    // The person carried Kit into the composer's box and let go there.
    place()(284, 344)
    await release()({ x: 0, y: 0 }, 'moved')
    expect(useKitStage.getState()).toMatchObject({
      perch: 'composer',
      motion: 'still',
      touched: { kind: 'moved', onto: 'composer' },
    })
    expect(driver!.position()[1]).toBe(300 + 1 - FEET)
  })

  test('set down above the composer, Kit falls onto it as before', async () => {
    perch('composer', { left: 100, top: 300, width: 400, height: 120 })
    driver!.track()
    place()(284, 200)
    await release()({ x: 0, y: 0 }, 'moved')
    expect(useKitStage.getState().perch).toBe('composer')
  })

  test('set down over the part of a message the scroller hides, Kit does not climb it', async () => {
    // The conversation shows y 100 to 400; the message's top shows, its bottom runs on below.
    const clip = perch('clip', { left: 0, top: 100, width: 800, height: 300 })
    delete clip.dataset.kitPerch
    clip.dataset.kitClip = ''
    clip.append(
      perch('message:m1', { left: 100, top: 300, width: 400, height: 400 }),
    )
    driver!.track()
    place()(284, 500)
    await release()({ x: 0, y: 0 }, 'moved')
    expect(useKitStage.getState()).toMatchObject({
      perch: 'floor',
      touched: { kind: 'moved', onto: 'floor' },
    })
  })

  test('its surface going away during the crouch, Kit still reports where the carry ended', async () => {
    const composer = perch('composer', {
      left: 100,
      top: 300,
      width: 400,
      height: 120,
    })
    driver!.track()
    place()(284, 344)
    const done = release()({ x: 0, y: 0 }, 'moved')
    composer.remove()
    await done
    await Bun.sleep(2500)
    expect(useKitStage.getState()).toMatchObject({
      perch: 'floor',
      motion: 'still',
      touched: { kind: 'moved', onto: 'floor' },
    })
  })
})

describe('a follow that ends, and moves cut off', () => {
  test('a follow stops at its time even in the middle of a step', async () => {
    changeStage({ perch: 'floor', at: 0.02 })
    driver!.track()
    window.dispatchEvent(
      new PointerEvent('pointermove', {
        clientX: window.innerWidth - 10,
        clientY: window.innerHeight - 5,
      }),
    )
    driver!.follow('cursor', 1)
    await Bun.sleep(1500)
    const [x] = driver!.position()
    expect(x).toBeLessThan(window.innerWidth - 120)
    await Bun.sleep(700)
    expect(driver!.position()[0]).toBe(x)
    expect(useKitStage.getState().motion).toBe('still')
  }, 10_000)

  test('the turn ending ends the follow', async () => {
    perch('composer', { left: 300, top: 400, width: 400, height: 80 })
    driver!.track()
    driver!.follow('composer', 10)
    driver!.endFollow()
    await Bun.sleep(900)
    expect(useKitStage.getState().perch).toBe('floor')
  })

  test('a follow begun while Kit is in the air still follows once it lands', async () => {
    perch('composer', { left: 300, top: 400, width: 400, height: 80 })
    driver!.track()
    const release = (
      driver as unknown as {
        release: (v: { x: number; y: number }, kind: string) => Promise<void>
      }
    ).release.bind(driver)
    void release({ x: 0, y: -14 }, 'thrown')
    await Bun.sleep(80)
    expect(['air', 'fall']).toContain(useKitStage.getState().motion)
    driver!.follow('composer', 8)
    const until = Date.now() + 6000
    while (useKitStage.getState().perch !== 'composer' && Date.now() < until)
      await Bun.sleep(50)
    expect(useKitStage.getState().perch).toBe('composer')
  }, 10_000)

  test('a throw during the landing crouch is not put to sleep by that landing', async () => {
    perch('composer', { left: 300, top: 400, width: 400, height: 80 })
    driver!.track()
    void driver!.jumpTo('composer', 0.5, 'hop')
    const until = Date.now() + 4000
    while (
      !(
        useKitStage.getState().perch === 'composer' &&
        useKitStage.getState().motion === 'crouch'
      ) &&
      Date.now() < until
    )
      await Bun.sleep(5)
    expect(useKitStage.getState().motion).toBe('crouch')
    const release = (
      driver as unknown as {
        release: (v: { x: number; y: number }, kind: string) => Promise<void>
      }
    ).release.bind(driver)
    const started = Date.now()
    await release({ x: 6, y: -16 }, 'thrown')
    // Frozen in mid-air, the flight would run out its eight seconds.
    expect(Date.now() - started).toBeLessThan(4000)
    expect(useKitStage.getState().touched?.kind).toBe('thrown')
  }, 10_000)
})
