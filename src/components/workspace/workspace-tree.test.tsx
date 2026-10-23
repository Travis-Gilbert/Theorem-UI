import { afterEach, describe, expect, mock, test } from 'bun:test'
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
