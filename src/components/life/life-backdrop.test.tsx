import { act } from 'react'
import { createPortal } from 'react-dom'
import { afterEach, expect, mock, spyOn, test } from 'bun:test'
import { AssistantRuntimeProvider, useExternalStoreRuntime } from '@assistant-ui/react'
import type { ThreadMessageLike } from '@assistant-ui/react'
import { cleanup, render } from '../../../test/blocks/render'
import { useLifeControls } from '@/lib/life/store'
import * as life from './mount-life'
import * as life2d from './mount-life-2d'
import { LifeBackdrop } from './life-backdrop'

const press = mock(() => {})
const portalContextMenu = mock(() => {})
const game: life.LifeGame = {
  press, drag() {}, release() {}, hover() {}, leave() {}, step() {}, clear() {},
  randomize() {}, pulse() {}, sustain() {}, resize() {}, repaint() {}, destroy() {},
}
let restore = () => {}
afterEach(async () => {
  await cleanup()
  restore()
  press.mockClear()
  portalContextMenu.mockClear()
})

function Harness() {
  const runtime = useExternalStoreRuntime({
    messages: [] as ThreadMessageLike[],
    convertMessage: (message: ThreadMessageLike) => message,
    isRunning: false,
    onNew: async () => {},
  })
  return <AssistantRuntimeProvider runtime={runtime}><LifeBackdrop>
    <div data-testid="field">Empty conversation space</div>
    <textarea aria-label="Message" />
    {createPortal(<div role="listbox" onContextMenu={portalContextMenu}>
      <div role="option"><span data-testid="model">DeepSeek</span></div>
    </div>, document.body)}
  </LifeBackdrop></AssistantRuntimeProvider>
}

async function mount() {
  const canvas = spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({} as WebGL2RenderingContext)
  const mountGame = spyOn(life, 'mountLife').mockReturnValue(game)
  restore = () => { canvas.mockRestore(); mountGame.mockRestore() }
  useLifeControls.setState({ shown: true })
  await render(<Harness />)
  const root = document.querySelector<HTMLElement>('[data-life-backdrop]')!
  const capture = mock(() => {})
  root.setPointerCapture = capture
  return capture
}

async function pointerDown(target: Element) {
  const event = new PointerEvent('pointerdown', { bubbles: true, cancelable: true, button: 0, pointerType: 'mouse', pointerId: 1 })
  await act(async () => { target.dispatchEvent(event) })
  return event
}

test('portaled model options keep pointer and context-menu events', async () => {
  const capture = await mount()
  const model = document.querySelector('[data-testid="model"]')!
  const event = await pointerDown(model)
  expect(event.defaultPrevented).toBe(false)
  expect(capture).not.toHaveBeenCalled()
  expect(press).not.toHaveBeenCalled()
  const context = new MouseEvent('contextmenu', { bubbles: true, cancelable: true })
  await act(async () => { model.dispatchEvent(context) })
  expect(portalContextMenu).toHaveBeenCalledTimes(1)
  expect(context.defaultPrevented).toBe(false)
  expect(document.querySelector('[data-life-backdrop][data-popup-open]')).toBeNull()
})

test('empty field space still draws while the composer keeps its input events', async () => {
  const capture = await mount()
  expect((await pointerDown(document.querySelector('textarea')!)).defaultPrevented).toBe(false)
  expect(capture).not.toHaveBeenCalled()
  expect((await pointerDown(document.querySelector('[data-testid="field"]')!)).defaultPrevented).toBe(true)
  expect(capture).toHaveBeenCalledWith(1)
  expect(press).toHaveBeenCalledTimes(1)
  const context = new MouseEvent('contextmenu', { bubbles: true, cancelable: true })
  await act(async () => { document.querySelector('[data-testid="field"]')!.dispatchEvent(context) })
  expect(context.defaultPrevented).toBe(true)
  expect(document.querySelector('[data-life-backdrop][data-popup-open]')).not.toBeNull()
})


test('a phone uses transparent Canvas 2D instead of WebGL', async () => {
  const media = Object.getOwnPropertyDescriptor(window, 'matchMedia')
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    value: () => ({ matches: true }),
  })
  const context = spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({} as CanvasRenderingContext2D)
  const mobile = spyOn(life2d, 'mountLife2d').mockReturnValue(game)
  const webgl = spyOn(life, 'mountLife').mockReturnValue(game)
  useLifeControls.setState({ shown: true })
  try {
    await render(<Harness />)
    expect(mobile).toHaveBeenCalledTimes(1)
    expect(webgl).not.toHaveBeenCalled()
    expect(document.querySelector('[data-life-backdrop]')).not.toBeNull()
  } finally {
    if (media) Object.defineProperty(window, 'matchMedia', media)
    else Reflect.deleteProperty(window, 'matchMedia')
    context.mockRestore()
    mobile.mockRestore()
    webgl.mockRestore()
  }
})
