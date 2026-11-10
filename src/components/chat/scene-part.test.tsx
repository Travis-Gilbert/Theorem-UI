// SOURCING: bun:test over the scene card, rendered with React into happy-dom.
// happy-dom loads no frame pages, so each frame is given a stand-in window
// that records what is posted to it, and the scene page's messages are
// dispatched with that window as their source. happy-dom reports each frame
// page it skips; that report is kept out of the output, as the block tests do.
import {
  afterAll,
  afterEach,
  expect,
  jest,
  mock,
  spyOn,
  test,
} from 'bun:test'
import { QueryClientProvider } from '@tanstack/react-query'
import { act } from 'react'
import { cleanup, render } from '../../../test/workspace'
import type { ModuleError, Scene, SceneEntity, SceneTheme } from './scene-model'

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

const theme: SceneTheme = {
  colorScheme: 'light',
  background: 'rgb(255, 255, 255)',
  accent: 'rgb(181, 70, 47)',
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
  const asked: SceneEntity[] = []
  const repairs: ModuleError[] = []
  const props = {
    onAsk: (entity: SceneEntity) => void asked.push(entity),
    onRepair: (error: ModuleError) => void repairs.push(error),
  }
  const rendered = await render(
    <SceneCard scene={shown} theme={theme} {...props} />,
  )
  const dialog = rendered.container.querySelector('dialog')
  const frame = rendered.container.querySelector('iframe')
  if (!dialog || !frame?.contentWindow) throw new Error('no scene frame')
  const page = frame.contentWindow as unknown as PageWindow
  const sent = page.sent
  // The page of whichever frame the card shows now: a new scene makes a new one.
  const current = () =>
    rendered.container.querySelector('iframe')?.contentWindow ?? page
  const fromPage = (data: unknown, source: unknown = current()) =>
    act(() => {
      window.dispatchEvent(
        new MessageEvent('message', { data, source: source as Window }),
      )
    })
  const button = (name: string) =>
    [...rendered.container.querySelectorAll('button')].find(
      (b) => b.textContent === name,
    )
  const rerender = (next: { scene?: Scene; theme?: SceneTheme }) =>
    act(() =>
      rendered.root.render(
        <QueryClientProvider client={rendered.queryClient}>
          <SceneCard
            scene={next.scene ?? shown}
            theme={next.theme ?? theme}
            {...props}
          />
        </QueryClientProvider>,
      ),
    )
  return {
    ...rendered,
    dialog,
    frame,
    sent,
    fromPage,
    button,
    rerender,
    asked,
    repairs,
  }
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
    { type: 'sceneos:mount', package: scene.scenePackage, theme },
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
    { type: 'sceneos:mount', package: scene.scenePackage, theme },
    { type: 'sceneos:layout', layout: 'full' },
  ])
})

test('a reply that keeps streaming does not reload the scene', async () => {
  const { frame, container, rerender } = await card()
  rerender({ scene: { ...scene, scenePackage: { ...scene.scenePackage } } })
  expect(container.querySelector('iframe')).toBe(frame)
})

test('a palette change draws the scene again in the new colours', async () => {
  const { frame, sent, fromPage, rerender, container } = await card()
  rerender({ theme: { ...theme } })
  expect(sent).toEqual([])

  fromPage({ type: 'sceneos:host-ready' })
  fromPage({ type: 'sceneos:mounted', ok: true })
  sent.length = 0
  rerender({ theme: { ...theme } })
  expect(sent).toEqual([])

  const dark: SceneTheme = { colorScheme: 'dark', background: 'rgb(30, 28, 27)' }
  rerender({ theme: dark })
  expect(sent).toEqual([
    { type: 'sceneos:mount', package: scene.scenePackage, theme: dark },
  ])
  expect(container.querySelector('iframe')).toBe(frame)
})

test('a scene that fails to draw says where, and Fix asks for its code to be mended', async () => {
  const { dialog, fromPage, button, repairs } = await card()
  fromPage({ type: 'sceneos:host-ready' })
  const error: ModuleError = {
    stage: 'mount',
    message: 'ctx.canvas is null',
    line: 12,
    column: 4,
  }
  fromPage({ type: 'sceneos:mounted', ok: false, error })
  expect(dialog.dataset.phase).toBe('failed')
  expect(dialog.textContent).toContain(
    'mount at line 12, column 4: ctx.canvas is null',
  )
  expect(dialog.textContent).toContain(scene.fallbackText)

  act(() => button('Fix')?.click())
  expect(repairs).toEqual([error])
  // One request per failure: a second press does not send it again.
  expect(button('Fix')?.disabled).toBe(true)
})

test('code that throws while running keeps the scene up and offers Fix', async () => {
  const { dialog, frame, fromPage, button, repairs } = await card()
  fromPage({ type: 'sceneos:host-ready' })
  fromPage({ type: 'sceneos:mounted', ok: true })
  const error: ModuleError = {
    stage: 'runtime',
    message: 'x is not defined',
    line: 3,
  }
  fromPage({ type: 'sceneos:error', error })
  expect(dialog.dataset.phase).toBe('ready')
  expect(frame.isConnected).toBe(true)
  expect(dialog.textContent).toContain('runtime at line 3: x is not defined')
  act(() => button('Fix')?.click())
  expect(repairs).toEqual([error])
})

/**
 * `render` settles on a real timer, so the clock is faked after it, and a new
 * scene gives the card a new frame whose wait runs on the fake clock.
 */
async function cardOnFakeClock() {
  const shown = await card()
  jest.useFakeTimers()
  shown.rerender({ scene: { ...scene, packageHash: 'b'.repeat(64) } })
  return shown
}

test('a page that takes a mount and never answers offers Fix after the wait', async () => {
  try {
    const { dialog, fromPage, button, repairs } = await cardOnFakeClock()
    fromPage({ type: 'sceneos:host-ready' })
    act(() => jest.advanceTimersByTime(20_000))
    expect(dialog.dataset.phase).toBe('failed')
    act(() => button('Fix')?.click())
    expect(repairs).toEqual([
      { stage: 'mount', message: 'mount did not return within 20 seconds' },
    ])
  } finally {
    jest.useRealTimers()
  }
})

test('a page that never loads has nothing for the model to fix', async () => {
  try {
    const { dialog, button } = await cardOnFakeClock()
    act(() => jest.advanceTimersByTime(20_000))
    expect(dialog.dataset.phase).toBe('failed')
    expect(dialog.textContent).toContain(scene.fallbackText)
    expect(button('Fix')).toBeUndefined()
  } finally {
    jest.useRealTimers()
  }
})

test('a pick offers to ask about it, and clearing the pick takes the offer away', async () => {
  const { fromPage, button, asked } = await card()
  fromPage({ type: 'sceneos:host-ready' })
  fromPage({ type: 'sceneos:mounted', ok: true })
  const alu = { id: 'alu', label: 'ALU', kind: 'unit' }
  fromPage({ type: 'sceneos:select', entity: alu })
  act(() => button('Ask about ALU')?.click())
  expect(asked).toEqual([alu])

  fromPage({ type: 'sceneos:select', entity: { id: 'pc' } })
  expect(button('Ask about ALU')).toBeUndefined()
  expect(button('Ask about pc')).toBeDefined()
  fromPage({ type: 'sceneos:select', entity: null })
  expect(button('Ask about pc')).toBeUndefined()
})
