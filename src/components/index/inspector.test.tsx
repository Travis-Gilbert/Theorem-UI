// SOURCING: bun:test over the Inspector's filing section and the panel's quick
// search, rendered with React into happy-dom. fetch is stubbed, as no Theorem
// is running; the search runs inside a memory router.
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  spyOn,
  test,
} from 'bun:test'
import {
  RouterProvider,
  createMemoryHistory,
  createRootRoute,
  createRouter,
} from '@tanstack/react-router'
import { act } from 'react'
import { cleanup, render, waitFor } from '../../../test/workspace'
import { QuickSearch } from './index-panel'
import { Filing } from './inspector'
import { observer } from './observe'

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  })

/** Answers the filing history with `filings`; everything else reads empty. */
const stubFetch = (filings: () => Response) =>
  spyOn(globalThis, 'fetch').mockImplementation((async (
    input: RequestInfo | URL,
  ) => {
    const path = new URL(String(input)).pathname
    if (path.endsWith('/filings')) return filings()
    if (path.endsWith('/collections')) return json({ collections: [] })
    return json({})
  }) as typeof fetch)

const button = (container: HTMLElement, label: string) =>
  [...container.querySelectorAll('button')].find(
    (b) => b.textContent.trim() === label,
  )

// The Index routes resolve against the page's origin, which a bare happy-dom
// page does not have.
const page = (
  window as unknown as { happyDOM: { setURL: (url: string) => void } }
).happyDOM
beforeAll(() => page.setURL('http://localhost:3000/index'))
afterAll(() => page.setURL('about:blank'))

let restore: (() => void) | undefined
afterEach(() => {
  restore?.()
  restore = undefined
  cleanup()
})

describe('Filing', () => {
  const filing = () => (
    <Filing
      documentId="d1"
      revision={{ position: 1, contentDigest: 'sha256:1' }}
      scope={{ kind: 'home' }}
    />
  )

  test('a failed history read is not shown as unfiled', async () => {
    const spy = stubFetch(() =>
      json({ error: { code: 'unavailable', message: 'down' } }, 503),
    )
    restore = () => spy.mockRestore()
    const { container } = await render(filing())
    await waitFor(
      () => container.textContent.includes('Filing history could not be read'),
      { timeout: 4000 },
    )
    expect(container.textContent).not.toContain('Not filed yet')
    expect(button(container, 'File it')).toBeUndefined()
  })

  test('an empty history offers filing', async () => {
    const spy = stubFetch(() => json({ receipts: [] }))
    restore = () => spy.mockRestore()
    const { container } = await render(filing())
    await waitFor(() => container.textContent.includes('Not filed yet'))
    expect(button(container, 'File it')).toBeDefined()
  })
})

describe('QuickSearch', () => {
  let recorded: Parameters<ReturnType<typeof observer>['record']>[0][]
  beforeEach(() => {
    recorded = []
    const record = spyOn(observer(), 'record').mockImplementation((event) => {
      recorded.push(event)
    })
    const fetched = stubFetch(() => json({ receipts: [] }))
    restore = () => {
      record.mockRestore()
      fetched.mockRestore()
    }
  })

  const type = (input: HTMLInputElement, value: string) =>
    act(() => {
      Object.getOwnPropertyDescriptor(
        HTMLInputElement.prototype,
        'value',
      )!.set!.call(input, value)
      input.dispatchEvent(new Event('input', { bubbles: true }))
    })

  test('records a search once it has rested, not per keystroke', async () => {
    const router = createRouter({
      routeTree: createRootRoute({
        component: () => <QuickSearch scope={{ kind: 'home' }} />,
      }),
      history: createMemoryHistory(),
    })
    const { container } = await render(<RouterProvider router={router} />)
    const input = await waitFor(() =>
      container.querySelector<HTMLInputElement>('input'),
    )
    type(input, 't')
    type(input, 'ta')
    type(input, 'tax')
    await waitFor(() => recorded.length > 0, { timeout: 4000 })
    await act(() => Bun.sleep(1500))
    expect(recorded).toEqual([
      {
        kind: 'search_run',
        scope: { kind: 'home' },
        detail: { q: 'tax', from: 'panel_search' },
      },
    ])
  })
})
