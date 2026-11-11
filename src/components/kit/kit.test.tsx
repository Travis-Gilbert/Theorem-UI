import { afterEach, beforeEach, expect, test } from 'bun:test'
import { act } from 'react'
import { kitDriver } from '@/lib/kit/driver'
import { changeStage, resetKitStage } from '@/lib/kit/stage'
import { resetKit, useKit } from '@/lib/kit/store'
import { installPress } from '@/lib/motion'
import { cleanup, render } from '../../../test/blocks/render'
import { Kit, describeKit } from './kit'
import { KitStage } from './kit-stage'

beforeEach(() => {
  resetKit()
  resetKitStage()
})
afterEach(cleanup)

test("Kit's words follow what the sprite plays, not the pose under it", async () => {
  // Three idle minutes in: the pose is still rest, but the figure sleeps.
  useKit.setState({
    liveness: 'idle',
    pose: 'rest',
    act: {
      tag: 'sleep',
      liveness: 'idle',
      pose: 'rest',
      chosen: false,
      since: 1,
      until: Infinity,
      once: false,
      unprompted: true,
    },
  })
  const { container } = await render(<Kit />)
  const status = container.querySelector('[role="status"]')
  expect(status?.getAttribute('title')).toBe('Kit · idle · asleep')
  expect(status?.textContent).toBe('Kit, idle · asleep')
  expect(describeKit('done', 'pounce')).toBe('done · pouncing')
})

test("a tap on Kit leaves it standing where it was, through the shell's press squeeze", async () => {
  // A composer for Kit to stand on, measured where the test puts it.
  const composer = document.createElement('div')
  composer.dataset.kitPerch = 'composer'
  composer.getBoundingClientRect = () =>
    ({
      left: 100,
      top: 300,
      right: 500,
      bottom: 380,
      width: 400,
      height: 80,
    }) as DOMRect
  document.body.append(composer)
  changeStage({ perch: 'composer', at: 0.5 })
  const offPress = installPress(document)
  try {
    await render(<KitStage />)
    const holder = document.querySelector<HTMLElement>(
      '[aria-label^="Kit, the agent\'s figure"]',
    )!
    // The holder's translate is the only thing that places Kit.
    const placed = holder.style.transform
    expect(placed).toContain('translate')
    const [x, y] = kitDriver()!.position()
    const at = {
      bubbles: true,
      button: 0,
      pointerId: 1,
      clientX: x + 16,
      clientY: y + 16,
    }
    const sprite = holder.firstElementChild!
    await act(async () => {
      sprite.dispatchEvent(new PointerEvent('pointerdown', at))
      sprite.dispatchEvent(new PointerEvent('pointerup', at))
    })
    // Past the press's release spring, which clears the transform of what it squeezed.
    await act(() => Bun.sleep(600))
    expect(holder.style.transform).toBe(placed)
  } finally {
    offPress()
    composer.remove()
  }
})
