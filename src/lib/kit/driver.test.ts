import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import { KitDriver } from './driver'
import { changeStage, resetKitStage, useKitStage } from './stage'

/** A perch the shell would mark, measured where the test puts it. */
function perch(
  name: string,
  rect: { left: number; top: number; width: number; height: number },
) {
  const element = document.createElement('div')
  element.dataset.kitPerch = name
  element.getBoundingClientRect = () =>
    ({
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
