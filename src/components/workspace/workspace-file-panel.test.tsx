// SOURCING: bun:test over the workspace file panel's dispatch to handlers,
// rendered with React into happy-dom against the in-memory workspace. The
// folder lookup is spied on, as the desktop server is not running.
import {
  afterAll,
  afterEach,
  beforeAll,
  describe,
  expect,
  mock,
  spyOn,
  test,
} from 'bun:test'
import type { DockviewApi } from 'dockview-react'
import { act } from 'react'
import { registerBuiltinHandlers } from '@/lib/handlers/builtins'
import { registerHandler, useHandlerRegistry } from '@/lib/handlers/registry'
import type { FileHandler, FileViewProps } from '@/lib/handlers/types'
import { useWorkspaceFileView } from '@/lib/workspace/open'
import type { WorkspaceFileRef } from '@/lib/workspace/open'
import type { WorkspaceClient } from '@/lib/workspace/types'
import * as workspaces from '@/lib/workspace/workspaces'
import { mockLayout } from '../../../test/layout'
import {
  cleanup,
  fakeWorkspace,
  render,
  settle,
  waitFor,
} from '../../../test/workspace'
import type { FakeWorkspace } from '../../../test/workspace'

void mock.module('@/components/icons', () => ({
  Icon: new Proxy({}, { get: () => () => null }),
}))
const { WorkspaceFilePanel, openWorkspaceFilePanel } =
  await import('./workspace-file-panel')

const FILES = {
  'Boards/Launch.md': '---\nkind: board\n---\n# Launch\n',
  'Notes/Today.md': '# Today\n',
  'data/runs.csv': 'name,loss\nbeta,0.31\n',
  'data.bin': new Uint8Array(16),
}

/** A handler whose Panel names itself and the file it shows. */
const standIn = (
  id: string,
  priority: number,
  match: FileHandler['match'],
): FileHandler => {
  const View = ({ path }: FileViewProps) => (
    <p data-view={id}>
      {id}: {path}
    </p>
  )
  return { id, label: `View ${id}`, priority, match, Panel: View, Card: View }
}

const STAND_INS = [
  standIn('note', 80, (input) => input.mime === 'text/markdown'),
  standIn('board', 90, (input) => input.properties?.kind === 'board'),
  standIn('table', 70, (input) => input.extension === 'csv'),
  standIn('info', 0, (input) => input.entry.kind === 'file'),
]

let client: WorkspaceClient | undefined
let undoSetup: Array<() => void> = []
beforeAll(() => {
  const spies = [
    spyOn(workspaces, 'useWorkspaceClient').mockImplementation(() => client),
    spyOn(workspaces, 'useWorkspaces').mockImplementation(
      () =>
        ({
          isPending: false,
          available: true,
          workspaces: [],
        }) as unknown as ReturnType<typeof workspaces.useWorkspaces>,
    ),
  ]
  undoSetup = [mockLayout(), ...spies.map((spy) => () => spy.mockRestore())]
})
afterAll(() => {
  for (const fn of undoSetup) fn()
})
afterEach(() => {
  cleanup()
  client = undefined
  useWorkspaceFileView.setState({ file: undefined })
})

async function openFile(
  file: Omit<WorkspaceFileRef, 'workspaceId'>,
  ws: FakeWorkspace = fakeWorkspace(FILES),
) {
  client = ws.client
  const moves: Array<string> = []
  const { container } = await render(
    <WorkspaceFilePanel
      file={{ workspaceId: 'ws_test', ...file }}
      onMoved={(path) => moves.push(path)}
    />,
  )
  await settle()
  return { ws, container, moves }
}

const shown = (container: HTMLElement) =>
  container.querySelector('[data-view]')?.textContent ?? null

describe('with stand-in handlers', () => {
  let undo: Array<() => void> = []
  beforeAll(() => {
    undo = STAND_INS.map(registerHandler)
  })
  afterAll(() => {
    for (const fn of undo) fn()
  })

  test('shows the file with the Panel of the handler that opens it', async () => {
    const { container } = await openFile({ path: 'data/runs.csv' })
    expect(shown(container)).toBe('table: data/runs.csv')
    expect(container.querySelector('h2')?.textContent).toBe('runs.csv')
  })

  test("a Markdown file's properties reach the handlers' match", async () => {
    const board = await openFile({ path: 'Boards/Launch.md' })
    await waitFor(() => shown(board.container) === 'board: Boards/Launch.md')
    const note = await openFile({ path: 'Notes/Today.md' })
    expect(shown(note.container)).toBe('note: Notes/Today.md')
  })

  test('a handler chosen in "Open with" shows the file instead', async () => {
    const { container } = await openFile({
      path: 'data/runs.csv',
      handler: 'info',
    })
    expect(shown(container)).toBe('info: data/runs.csv')
  })

  test('a chosen handler that is gone leaves the choice to the registry', async () => {
    const { container } = await openFile({
      path: 'data/runs.csv',
      handler: 'uninstalled',
    })
    expect(shown(container)).toBe('table: data/runs.csv')
  })

  /** Opens the header's "Open with" menu; returns its views. */
  async function openWithMenu(container: HTMLElement) {
    const trigger = container.querySelector<HTMLElement>(
      'button[aria-label="Open with"]',
    )
    if (!trigger) throw new Error('expected the Open with button')
    act(() => {
      trigger.dispatchEvent(
        new MouseEvent('mousedown', { bubbles: true, button: 0 }),
      )
      trigger.click()
    })
    const menu = await waitFor(() => document.querySelector('[role="menu"]'))
    // Floating UI places the popup a few frames later.
    await settle()
    return [...menu.querySelectorAll<HTMLElement>('[role="menuitemradio"]')]
  }

  test('"Open with" marks the view in use and reopens the file with another', async () => {
    const { container } = await openFile({ path: 'data/runs.csv' })
    const radios = await openWithMenu(container)
    // The views that open the file first.
    expect(radios.map((r) => r.textContent)).toEqual([
      'View table',
      'View info',
      'View note',
      'View board',
    ])
    expect(radios[0]?.getAttribute('aria-checked')).toBe('true')
    act(() => radios[1]?.click())
    await settle()
    expect(useWorkspaceFileView.getState().file).toEqual({
      workspaceId: 'ws_test',
      path: 'data/runs.csv',
      handler: 'info',
    })
  })

  test('"Open with" matches on the properties too', async () => {
    const { container } = await openFile({ path: 'Boards/Launch.md' })
    await waitFor(() => shown(container)?.startsWith('board'))
    const radios = await openWithMenu(container)
    expect(radios.map((r) => r.textContent)).toEqual([
      'View board',
      'View note',
      'View info',
      'View table',
    ])
  })

  test('a deleted file says so, and comes back when it is restored', async () => {
    const { ws, container } = await openFile({ path: 'data/runs.csv' })
    ws.emit({
      type: 'deleted',
      id: 'vf_x',
      path: 'data',
      origin: 'external',
    })
    await waitFor(() =>
      container.textContent.includes('This file was deleted.'),
    )
    expect(shown(container)).toBeNull()
    await ws.external('data/runs.csv', 'name\nalpha\n')
    await waitFor(() => shown(container) === 'table: data/runs.csv')
  })

  test('a renamed file moves the panel to its new path', async () => {
    const { ws, moves } = await openFile({ path: 'data/runs.csv' })
    ws.emit({
      type: 'renamed',
      id: 'vf_x',
      from: 'data',
      to: 'archive/data',
      origin: 'external',
    })
    await settle()
    expect(moves).toEqual(['archive/data/runs.csv'])
  })

  test('a path that is not in the folder says so', async () => {
    const { container } = await openFile({ path: 'gone.csv' })
    expect(container.textContent).toContain('This file is not in this folder.')
  })

  test('a folder no handler opens says so', async () => {
    const { container } = await openFile({ path: 'data' })
    expect(container.textContent).toContain('Nothing here can show this file.')
    expect(container.querySelector('button[aria-label="Open with"]')).toBeNull()
  })

  test('a folder that is not open says so', async () => {
    const { container } = await render(
      <WorkspaceFilePanel
        file={{ workspaceId: 'ws_closed', path: 'data/runs.csv' }}
        onMoved={() => undefined}
      />,
    )
    expect(container.textContent).toContain('This folder is not open.')
  })
})

describe('with the built-in handlers', () => {
  let undo: () => void
  beforeAll(() => {
    useHandlerRegistry.setState({ handlers: [] })
    undo = registerBuiltinHandlers()
  })
  afterAll(() => undo())

  test('a CSV file opens as a table, loaded when first shown', async () => {
    const { container } = await openFile({ path: 'data/runs.csv' })
    await waitFor(() => container.querySelector('tbody tr'))
    expect(container.textContent).toContain('1 row, 2 columns')
  })

  test('a file no other handler opens shows its file info', async () => {
    const { container } = await openFile({ path: 'data.bin' })
    await waitFor(() => container.querySelector('dl'))
    expect(container.textContent).toContain('application/octet-stream')
  })
})

describe('openWorkspaceFilePanel', () => {
  const file = { workspaceId: 'ws_test', path: 'data/runs.csv' }

  function fakeDock(existing: boolean) {
    const panel = {
      api: {
        updateParameters: mock(() => undefined),
        setActive: mock(() => undefined),
      },
    }
    const api = {
      getPanel: mock(() => (existing ? panel : undefined)),
      addPanel: mock(() => undefined),
      panels: [],
      width: 1000,
    }
    return { api, panel }
  }

  test('an open file comes forward', () => {
    const { api, panel } = fakeDock(true)
    openWorkspaceFilePanel(api as unknown as DockviewApi, file, 'chat')
    expect(panel.api.setActive).toHaveBeenCalled()
    expect(panel.api.updateParameters).not.toHaveBeenCalled()
    expect(api.addPanel).not.toHaveBeenCalled()
  })

  test('an open file switches to the view chosen in "Open with"', () => {
    const { api, panel } = fakeDock(true)
    const chosen = { ...file, handler: 'code' }
    openWorkspaceFilePanel(api as unknown as DockviewApi, chosen, 'chat')
    expect(panel.api.updateParameters).toHaveBeenCalledWith(chosen)
    expect(panel.api.setActive).toHaveBeenCalled()
  })

  test('a file that is not open gets a panel', () => {
    const { api } = fakeDock(false)
    openWorkspaceFilePanel(api as unknown as DockviewApi, file, 'chat')
    expect(api.addPanel).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'workspace-file:ws_test:data/runs.csv',
        params: file,
        title: 'runs.csv',
      }),
    )
  })
})
