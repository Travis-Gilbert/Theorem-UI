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
