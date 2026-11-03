// SOURCING: bun:test over the file-info handler's panel and card and its
// "Open with" menu, rendered with React into happy-dom against the in-memory
// workspace, with the built-in handlers registered.
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  mock,
  test,
} from 'bun:test'
import { act } from 'react'
import { registerBuiltinHandlers } from '@/lib/handlers/builtins'
import { useWorkspaceFileView } from '@/lib/workspace/open'
import type { WorkspaceEntry } from '@/lib/workspace/types'
import { recordHostCalls, useDesktopEnv } from '../../../../test/desktop'
import {
  cleanup,
  fakeWorkspace,
  render,
  settle,
  waitFor,
} from '../../../../test/workspace'

void mock.module('@/components/icons', () => ({
  Icon: new Proxy({}, { get: () => () => null }),
}))
const { UnknownCard, UnknownPanel } = await import('./unknown-handler')

const MODIFIED = Date.UTC(2026, 9, 21, 14, 30)
const entry = (path: string, size = 2048): WorkspaceEntry => ({
  id: `vf_${path}`,
  path,
  kind: 'file',
  size,
  mtimeMs: MODIFIED,
})

let unregister: () => void
beforeAll(() => {
  unregister = registerBuiltinHandlers()
})
afterAll(() => unregister())
afterEach(() => {
  cleanup()
  useWorkspaceFileView.setState({ file: undefined })
})

const props = (path: string, size?: number) => ({
  client: fakeWorkspace({ [path]: new Uint8Array(size ?? 2048) }).client,
  path,
  entry: entry(path, size),
})

/** The definition list as [term, description] pairs. */
const details = (container: HTMLElement) =>
  [...container.querySelectorAll('dt')].map((dt) => [
    dt.textContent,
    dt.nextElementSibling?.textContent,
  ])

/** Opens the "Open with" menu from `trigger`; returns its items' labels. */
async function openMenu(trigger: HTMLElement) {
  act(() => {
    trigger.dispatchEvent(
      new MouseEvent('mousedown', { bubbles: true, button: 0 }),
    )
    trigger.click()
  })
  const menu = await waitFor(() => document.querySelector('[role="menu"]'))
  // Floating UI places the popup a few frames later.
  await settle()
  return menu
}

const items = (menu: Element, role: string) =>
  [...menu.querySelectorAll(`[role="${role}"]`)] as Array<HTMLElement>

const labelled = (menu: Element, label: string) =>
  [...menu.querySelectorAll<HTMLElement>('[role^="menuitem"]')].find(
    (item) => item.textContent === label,
  )

describe('UnknownPanel', () => {
  test("shows the file's name, kind, size and date", async () => {
    const { container } = await render(<UnknownPanel {...props('data.bin')} />)
    expect(container.querySelector('h3')?.textContent).toBe('data.bin')
    const date = new Intl.DateTimeFormat(undefined, {
      dateStyle: 'medium',
      timeStyle: 'short',
    }).format(MODIFIED)
    expect(details(container)).toEqual([
      ['Kind', 'application/octet-stream'],
      ['Size', '2.05 kB'],
      ['Modified', date],
    ])
  })

  test('names a kind its type table does not know by its extension', async () => {
    const { container } = await render(
      <UnknownPanel {...props('model.weights')} />,
    )
    expect(details(container)[0]).toEqual(['Kind', '.weights file'])
    const bare = await render(<UnknownPanel {...props('LICENSE')} />)
    expect(details(bare.container)[0]).toEqual(['Kind', 'File'])
  })

  test('"Open with" lists the views that open the file first, then the rest', async () => {
    const { container } = await render(<UnknownPanel {...props('data.bin')} />)
    const trigger = [...container.querySelectorAll('button')].find(
      (b) => b.textContent === 'Open with…',
    )
    if (!trigger) throw new Error('expected the Open with button')
    const menu = await openMenu(trigger)
    expect(
      items(menu, 'menuitemradio').map((item) => item.textContent),
    ).toEqual([
      'File info',
      'Markdown',
      'Canvas',
      'PDF',
      'Table',
      'JSON tree',
      'Image, audio or video',
      'Code editor',
    ])
    expect(labelled(menu, 'File info')?.getAttribute('aria-checked')).toBe(
      'true',
    )
    // Finder and the system's apps are the desktop host's.
    expect(labelled(menu, 'Reveal in Finder')).toBeUndefined()
  })

  test('choosing a view opens the file with it', async () => {
    const { container } = await render(<UnknownPanel {...props('data.bin')} />)
    const trigger = [...container.querySelectorAll('button')].find(
      (b) => b.textContent === 'Open with…',
    )
    if (!trigger) throw new Error('expected the Open with button')
    const menu = await openMenu(trigger)
    act(() => labelled(menu, 'Code editor')?.click())
    expect(useWorkspaceFileView.getState().file).toEqual({
      workspaceId: 'ws_test',
      path: 'data.bin',
      handler: 'code',
    })
  })

  describe('on the desktop', () => {
    useDesktopEnv()
    let host: ReturnType<typeof recordHostCalls>
    beforeEach(() => {
      host = recordHostCalls()
    })
    afterEach(() => host.restore())

    test.each([
      ['Reveal in Finder', 'revealInFinder'],
      ['Open in default app', 'openWithDefault'],
    ] as const)('"%s" asks the host', async (label, method) => {
      const { container } = await render(
        <UnknownPanel {...props('blobs/data.bin')} />,
      )
      const trigger = [...container.querySelectorAll('button')].find(
        (b) => b.textContent === 'Open with…',
      )
      if (!trigger) throw new Error('expected the Open with button')
      const menu = await openMenu(trigger)
      act(() => labelled(menu, label)?.click())
      await waitFor(() => host.calls.length === 1)
      expect(host.calls).toEqual([
        { method, params: { path: '/tmp/vault/blobs/data.bin' } },
      ])
    })
  })
})

describe('UnknownCard', () => {
  test('shows the name, kind and size, with "Open with"', async () => {
    const { container } = await render(
      <UnknownCard {...props('data.bin')} zoom={1} selected={false} />,
    )
    expect(container.textContent).toContain('data.bin')
    expect(container.textContent).toContain('application/octet-stream, 2.05 kB')
    const trigger = container.querySelector<HTMLElement>(
      'button[aria-label="Open with"]',
    )
    if (!trigger) throw new Error('expected the Open with button')
    // The canvas leaves the button's clicks alone.
    expect(trigger.className).toContain('nodrag')
    const menu = await openMenu(trigger)
    expect(labelled(menu, 'File info')).toBeDefined()
  })
})
