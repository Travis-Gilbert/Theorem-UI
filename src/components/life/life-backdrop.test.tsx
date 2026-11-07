import { act } from 'react'
import { createPortal } from 'react-dom'
import { afterEach, expect, mock, spyOn, test } from 'bun:test'
import { AssistantRuntimeProvider, useExternalStoreRuntime } from '@assistant-ui/react'
import { cleanup, render } from '../../../test/blocks/render'
import { useLifeControls } from '@/lib/life/store'
import * as life from './mount-life'
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
  const runtime = useExternalStoreRuntime({ messages: [], isRunning: false, onNew: async () => {} })
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
  await act(async () => { model.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true })) })
  expect(portalContextMenu).toHaveBeenCalledTimes(1)
})

test('empty field space still draws while the composer keeps its input events', async () => {
  const capture = await mount()
  expect((await pointerDown(document.querySelector('textarea')!)).defaultPrevented).toBe(false)
  expect(capture).not.toHaveBeenCalled()
  expect((await pointerDown(document.querySelector('[data-testid="field"]')!)).defaultPrevented).toBe(true)
  expect(capture).toHaveBeenCalledWith(1)
  expect(press).toHaveBeenCalledTimes(1)
})
