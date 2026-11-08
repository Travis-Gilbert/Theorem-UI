// SOURCING: bun:test over the scene card, rendered with React into happy-dom.
// happy-dom loads no frame pages, so each frame is given a stand-in window
// that records what is posted to it, and the scene page's messages are
// dispatched with that window as their source. happy-dom reports each frame
// page it skips; that report is kept out of the output, as the block tests do.
import { afterAll, afterEach, expect, mock, spyOn, test } from 'bun:test'
import { QueryClientProvider } from '@tanstack/react-query'
import { act } from 'react'
import { cleanup, render } from '../../../test/workspace'
import type { Scene } from './scene-model'

void mock.module('@/components/icons', () => ({
  Icon: new Proxy({}, { get: () => () => null }),
}))
const { SceneCard } = await import('./scene-part')

const scene: Scene = {
  sceneId: 'scene:cpu',
  title: 'How does a CPU work?',
  fallbackText: 'A simplified RISC-V processor running a short program.',
  packageHash: 'a'.repeat(64),
  scenePackage: { id: 'scene:cpu', atoms: [] },
}

type PageWindow = { sent: unknown[]; postMessage: (message: unknown) => void }

const pages = new WeakMap<HTMLIFrameElement, PageWindow>()
const contentWindow = Object.getOwnPropertyDescriptor(
  HTMLIFrameElement.prototype,
  'contentWindow',
)
Object.defineProperty(HTMLIFrameElement.prototype, 'contentWindow', {
  configurable: true,
  get(this: HTMLIFrameElement) {
    let page = pages.get(this)
    if (!page) {
      const sent: unknown[] = []
      page = { sent, postMessage: (message) => void sent.push(message) }
      pages.set(this, page)
    }
    return page
  },
})
const report = console.error.bind(console)
const quiet = spyOn(console, 'error').mockImplementation((...args) => {
  const [first] = args
  const message =
    typeof first === 'object' && first !== null && 'message' in first
      ? String(first.message)
      : String(first)
  if (!message.includes('Iframe page loading is disabled')) report(...args)
})
afterAll(() => {
  quiet.mockRestore()
  if (contentWindow)
    Object.defineProperty(
      HTMLIFrameElement.prototype,
      'contentWindow',
      contentWindow,
    )
  else Reflect.deleteProperty(HTMLIFrameElement.prototype, 'contentWindow')
})

afterEach(cleanup)

async function card(shown: Scene = scene) {
  const rendered = await render(<SceneCard scene={shown} />)
  const dialog = rendered.container.querySelector('dialog')
  const frame = rendered.container.querySelector('iframe')
  if (!dialog || !frame?.contentWindow) throw new Error('no scene frame')
  const page = frame.contentWindow as unknown as PageWindow
  const sent = page.sent
  const fromPage = (data: unknown, source: unknown = page) =>
    act(() => {
      window.dispatchEvent(
        new MessageEvent('message', { data, source: source as Window }),
      )
    })
  const button = (name: string) =>
    [...rendered.container.querySelectorAll('button')].find(
      (b) => b.textContent === name,
    )
  return { ...rendered, dialog, frame, sent, fromPage, button }
}

test('the frame is sandboxed to scripts and loads the scene page', async () => {
  const { dialog, frame } = await card()
  expect(frame.getAttribute('sandbox')).toBe('allow-scripts')
  expect(frame.getAttribute('src')).toBe('/api/scene/v1/host')
  expect(frame.referrerPolicy).toBe('no-referrer')
  expect(frame.title).toBe('How does a CPU work?')
  expect(dialog.open).toBe(true)
  expect(dialog.dataset.layout).toBe('inline')
  expect(dialog.dataset.phase).toBe('loading')
})

test('a scene arriving in a reply leaves focus where it was', async () => {
  const composer = document.createElement('textarea')
  document.body.append(composer)
  composer.focus()
  const { dialog } = await card()
  expect(dialog.open).toBe(true)
  expect(document.activeElement).toBe(composer)
  composer.remove()
})

test('the page is sent the package when it is ready, and nothing else is read', async () => {
  const { dialog, sent, fromPage } = await card()
  fromPage({ type: 'sceneos:host-ready' }, window)
  fromPage({ type: 'sceneos:mounted', ok: true }, window)
  expect(sent).toEqual([])
  expect(dialog.dataset.phase).toBe('loading')

  fromPage({ type: 'sceneos:host-ready' })
  expect(sent).toEqual([
    { type: 'sceneos:mount', package: scene.scenePackage },
    { type: 'sceneos:layout', layout: 'inline' },
  ])
  fromPage({ type: 'sceneos:mounted', ok: true })
  expect(dialog.dataset.phase).toBe('ready')
  expect(dialog.querySelector('[role=status]')).toBeNull()
})

test('a scene the page cannot draw shows its fallback text', async () => {
  const { dialog, fromPage, button } = await card()
  fromPage({ type: 'sceneos:host-ready' })
  fromPage({ type: 'sceneos:mounted', ok: false })
  expect(dialog.dataset.phase).toBe('failed')
  expect(dialog.textContent).toContain(scene.fallbackText)
  expect(button('Expand')).toBeUndefined()
})

test('expanding keeps the same frame, and Escape or the page collapses it', async () => {
  const { dialog, frame, sent, fromPage, button, container } = await card()
  fromPage({ type: 'sceneos:host-ready' })
  fromPage({ type: 'sceneos:mounted', ok: true })
  sent.length = 0

  act(() => button('Expand')?.click())
  expect(dialog.dataset.layout).toBe('full')
  expect(dialog.open).toBe(true)
  expect(sent).toEqual([{ type: 'sceneos:layout', layout: 'full' }])
  expect(container.querySelector('iframe')).toBe(frame)
  expect(button('Collapse')?.getAttribute('aria-expanded')).toBe('true')

  // Escape on the host's document: the dialog's cancel is refused.
  const cancel = new Event('cancel', { cancelable: true })
  act(() => {
    dialog.dispatchEvent(cancel)
  })
  expect(cancel.defaultPrevented).toBe(true)
  expect(dialog.dataset.layout).toBe('inline')
  expect(dialog.open).toBe(true)

  // Escape inside the frame, passed on by the page.
  act(() => button('Expand')?.click())
  fromPage({ type: 'sceneos:dismiss' })
  expect(dialog.dataset.layout).toBe('inline')
  expect(sent.at(-1)).toEqual({ type: 'sceneos:layout', layout: 'inline' })
  expect(container.querySelector('iframe')).toBe(frame)

  // A page that reloads is told the layout it is in.
  act(() => button('Expand')?.click())
  sent.length = 0
  fromPage({ type: 'sceneos:host-ready' })
  expect(sent).toEqual([
    { type: 'sceneos:mount', package: scene.scenePackage },
    { type: 'sceneos:layout', layout: 'full' },
  ])
})

test('a reply that keeps streaming does not reload the scene', async () => {
  const { frame, root, container, queryClient } = await card()
  act(() =>
    root.render(
      <QueryClientProvider client={queryClient}>
        <SceneCard
          scene={{ ...scene, scenePackage: { ...scene.scenePackage } }}
        />
      </QueryClientProvider>,
    ),
  )
  expect(container.querySelector('iframe')).toBe(frame)
})
