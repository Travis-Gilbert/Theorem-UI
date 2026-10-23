import { afterEach, beforeEach, describe, expect, mock, test } from 'bun:test'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import type { Root } from 'react-dom/client'
import type {
  WorkspaceClient,
  WorkspaceEntry,
  WorkspaceEvent,
} from '@/lib/workspace/types'
import { useWorkspaceFileView } from '@/lib/workspace/open'
import { fakeWorkspace, waitFor } from '../../../test/workspace'

// The icon set imports SVGs through a Vite plugin bun does not run.
void mock.module('@/components/icons', () => ({
  Icon: new Proxy({}, { get: () => () => null }),
}))
const { WorkspaceTree } = await import('./workspace-tree')

;(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true

const entry = (
  id: string,
  path: string,
  kind: WorkspaceEntry['kind'] = 'file',
): WorkspaceEntry => ({ id, path, kind, size: 1, mtimeMs: 1 })

function fakeClient(entries: Array<WorkspaceEntry>) {
  const listeners = new Set<(event: WorkspaceEvent) => void>()
  const client = {
    workspace: {
      id: 'ws_test',
      name: 'Notes',
      path: '/tmp/notes',
      trusted: false,
      policy: 'LocalOnly',
    },
    tree: () => Promise.resolve(entries),
    subscribe: (listener: (event: WorkspaceEvent) => void) => {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
  } as unknown as WorkspaceClient
  const emit = async (event: WorkspaceEvent) => {
    act(() => {
      for (const listener of listeners) listener(event)
    })
    await settle()
  }
  return { client, emit }
}

/**
 * React Query notifies on a timer and the tree rebuilds after the render that
 * follows, so give both a few turns inside act.
 */
async function settle() {
  for (let turn = 0; turn < 3; turn++) await act(() => Bun.sleep(5))
}

let root: Root | undefined
afterEach(() => {
  act(() => root?.unmount())
  document.body.innerHTML = ''
})

async function render(client: WorkspaceClient) {
  const container = document.createElement('div')
  document.body.append(container)
  root = createRoot(container)
  act(() =>
    root!.render(
      <QueryClientProvider client={new QueryClient()}>
        <WorkspaceTree client={client} />
      </QueryClientProvider>,
    ),
  )
  await settle()
  return container
}

const rows = (container: HTMLElement) =>
  [...container.querySelectorAll('[role="treeitem"]')].map(
    (row) =>
      `${'  '.repeat(Number(row.getAttribute('aria-level')) - 1)}${row.textContent}`,
  )

const row = (container: HTMLElement, name: string) =>
  [...container.querySelectorAll<HTMLElement>('[role="treeitem"]')].find(
    (r) => r.textContent === name,
  )!

describe('WorkspaceTree', () => {
  test('lists folders first, opens files and follows events', async () => {
    const { client, emit } = fakeClient([
      entry('vf_z', 'z.md'),
      entry('vf_d', 'docs', 'directory'),
      entry('vf_n10', 'docs/note 10.md'),
      entry('vf_n2', 'docs/note 2.md'),
      entry('vf_a', 'a.md'),
    ])
    const container = await render(client)
    expect(rows(container)).toEqual(['docs', 'a.md', 'z.md'])

    await act(async () => row(container, 'docs').click())
    expect(rows(container)).toEqual([
      'docs',
      '  note 2.md',
      '  note 10.md',
      'a.md',
      'z.md',
    ])

    await act(async () => row(container, 'note 2.md').click())
    expect(useWorkspaceFileView.getState().file).toEqual({
      workspaceId: 'ws_test',
      path: 'docs/note 2.md',
    })

    await emit({
      type: 'created',
      entry: entry('vf_new', 'docs/new.md'),
      origin: 'external',
    })
    await emit({
      type: 'deleted',
      id: 'vf_z',
      path: 'z.md',
      origin: 'external',
    })
    // A renamed folder keeps its id, so it stays open.
    await emit({
      type: 'renamed',
      id: 'vf_d',
      from: 'docs',
      to: 'archive',
      origin: 'app',
    })
    expect(rows(container)).toEqual([
      'archive',
      '  new.md',
      '  note 2.md',
      '  note 10.md',
      'a.md',
    ])
  })
})

/** Presses a key where the focus is, as the tree's hotkeys read it. */
function press(target: Element, key: string) {
  act(() => {
    target.dispatchEvent(
      new KeyboardEvent('keydown', { key, code: key, bubbles: true }),
    )
    target.dispatchEvent(
      new KeyboardEvent('keyup', { key, code: key, bubbles: true }),
    )
  })
}

function type(input: HTMLInputElement, value: string) {
  act(() => {
    Object.getOwnPropertyDescriptor(
      HTMLInputElement.prototype,
      'value',
    )!.set!.call(input, value)
    input.dispatchEvent(new Event('input', { bubbles: true }))
  })
}

/** Right-clicks `element` and chooses `label` from the menu that opens. */
async function choose(element: Element, label: string) {
  act(() => {
    element.dispatchEvent(
      new MouseEvent('contextmenu', { bubbles: true, clientX: 8, clientY: 8 }),
    )
  })
  const item = await waitFor(() =>
    [...document.querySelectorAll<HTMLElement>('[role="menuitem"]')].find(
      (el) => el.textContent === label,
    ),
  )
  await act(async () => item.click())
  await waitFor(() => !document.querySelector('[role="menu"]'))
}

/** A drag event; files from Finder come in `dataTransfer`. */
function drag(element: Element, name: string, dataTransfer?: object) {
  const event = new Event(name, { bubbles: true, cancelable: true })
  Object.defineProperty(event, 'dataTransfer', { value: dataTransfer })
  act(() => {
    element.dispatchEvent(event)
  })
}

const renaming = (container: HTMLElement) =>
  waitFor(() =>
    container.querySelector<HTMLInputElement>('[role="treeitem"] input'),
  )

describe('WorkspaceTree changes', () => {
  beforeEach(() => useWorkspaceFileView.setState({ file: undefined }))

  test('F2 renames a note from its name without .md, and keeps the .md', async () => {
    const vault = fakeWorkspace({ 'a.md': 'A', 'b.md': 'B', 'pic.png': 'P' })
    const container = await render(vault.client)

    await act(async () => row(container, 'a.md').click())
    press(row(container, 'a.md'), 'F2')
    const input = await renaming(container)
    expect(input.value).toBe('a')
    type(input, 'Plan')
    press(input, 'Enter')
    await waitFor(() => rows(container).includes('Plan.md'))
    expect(vault.text('Plan.md')).toBe('A')

    // Another file keeps the name as typed, and a name in use is refused.
    await act(async () => row(container, 'pic.png').click())
    press(row(container, 'pic.png'), 'F2')
    const other = await renaming(container)
    expect(other.value).toBe('pic.png')
    type(other, 'b.md')
    press(other, 'Enter')
    const alert = await waitFor(() => container.querySelector('[role="alert"]'))
    expect(alert.textContent).toBe('There is already a “b.md” here.')
    expect(rows(container)).toEqual(['b.md', 'pic.png', 'Plan.md'])
  })

  test('a name is kept when the field loses focus, and Escape leaves it', async () => {
    const vault = fakeWorkspace({ 'a.md': '' })
    const container = await render(vault.client)

    await act(async () => row(container, 'a.md').click())
    press(row(container, 'a.md'), 'F2')
    const input = await renaming(container)
    type(input, 'kept')
    act(() => input.blur())
    await waitFor(() => rows(container).includes('kept.md'))

    await act(async () => row(container, 'kept.md').click())
    press(row(container, 'kept.md'), 'F2')
    const again = await renaming(container)
    type(again, 'dropped')
    press(again, 'Escape')
    await settle()
    expect(rows(container)).toEqual(['kept.md'])
    expect(container.querySelector('input')).toBeNull()
  })

  test('New note in a folder is named in place, then opens', async () => {
    const vault = fakeWorkspace({ 'docs/b.md': '' })
    const container = await render(vault.client)

    await choose(row(container, 'docs'), 'New note')
    const input = await renaming(container)
    expect(input.value).toBe('Untitled')
    expect(vault.text('docs/Untitled.md')).toBe('')
    // Nothing opens until the note has its name.
    expect(useWorkspaceFileView.getState().file).toBeUndefined()
    type(input, 'Plan')
    press(input, 'Enter')
    await waitFor(
      () => useWorkspaceFileView.getState().file?.path === 'docs/Plan.md',
    )
    expect(rows(container)).toEqual(['docs', '  b.md', '  Plan.md'])
  })

  test('New folder from an empty spot is made at the top and named', async () => {
    const vault = fakeWorkspace({ 'a.md': '' })
    const container = await render(vault.client)
    const tree = container.querySelector('[role="tree"]')!

    await choose(tree, 'New folder')
    const input = await renaming(container)
    type(input, 'Projects')
    press(input, 'Enter')
    await waitFor(() => rows(container).includes('Projects'))
    expect(useWorkspaceFileView.getState().file).toBeUndefined()

    // A second new folder takes the next free name.
    await choose(tree, 'New folder')
    const next = await renaming(container)
    expect(next.value).toBe('Untitled')
    press(next, 'Escape')
    await choose(tree, 'New folder')
    expect((await renaming(container)).value).toBe('Untitled 1')
  })

  test('Move to Trash removes the entry', async () => {
    const vault = fakeWorkspace({ 'a.md': '', 'b.md': '' })
    const container = await render(vault.client)

    await choose(row(container, 'a.md'), 'Move to Trash')
    await waitFor(() => !rows(container).includes('a.md'))
    expect(vault.text('a.md')).toBeUndefined()
    expect(rows(container)).toEqual(['b.md'])
  })

  test('dragging a file onto a folder moves it there', async () => {
    const vault = fakeWorkspace({ 'a.md': 'A', 'docs/b.md': '' })
    const container = await render(vault.client)

    drag(row(container, 'a.md'), 'dragstart')
    drag(row(container, 'docs'), 'dragover')
    drag(row(container, 'docs'), 'drop')
    await waitFor(() => vault.text('docs/a.md') === 'A')
    await settle()
    expect(rows(container)).toEqual(['docs'])
  })

  test("Finder's files dropped on a file are copied into its folder", async () => {
    const vault = fakeWorkspace({ 'docs/b.md': '' })
    const container = await render(vault.client)
    await act(async () => row(container, 'docs').click())
    const files = [new File(['png'], 'pic.png')]
    const dataTransfer = { types: ['Files'], files }

    drag(row(container, 'b.md'), 'dragover', dataTransfer)
    drag(row(container, 'b.md'), 'drop', dataTransfer)
    await waitFor(() => vault.text('docs/pic.png') === 'png')
    await settle()
    expect(rows(container)).toEqual(['docs', '  b.md', '  pic.png'])
  })
})
