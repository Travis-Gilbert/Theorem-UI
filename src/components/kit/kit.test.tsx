import { afterEach, beforeEach, expect, test } from 'bun:test'
import { resetKit, useKit } from '@/lib/kit/store'
import { cleanup, render } from '../../../test/blocks/render'
import { Kit, describeKit } from './kit'

beforeEach(() => resetKit())
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
