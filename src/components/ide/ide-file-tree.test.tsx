import { afterEach, expect, test } from 'bun:test'
import { act, createRef } from 'react'
import { cleanup, click, render, waitFor } from '../../../test/blocks/render'
import { useFollow } from './follow'
import { IdeFileTree } from './ide-file-tree'
import type { IdeFileTreeHandle } from './ide-file-tree'
import { useIdePage } from './ide-page'

type Ide = NonNullable<ReturnType<typeof useFollow.getState>['ide']>

afterEach(async () => {
  await cleanup()
  useFollow.setState({ ide: undefined, ideWorkspace: undefined })
  useIdePage.setState({ changedFolders: [], changedEverywhere: false })
})

test('after missed changes, an open folder reads again and shows what changed in it', async () => {
  // The workspace as the frame lists it: a top folder with one file in it.
  const listing: Record<string, Array<{ name: string; path: string; folder: boolean }>> = {
    '': [{ name: 'src', path: 'src', folder: true }],
    src: [{ name: 'a.ts', path: 'src/a.ts', folder: false }],
  }
  useFollow.setState({
    ideWorkspace: 'w',
    ide: { listFiles: async (path: string) => listing[path] ?? [] } as unknown as Ide,
  })
  const { container } = await render(<IdeFileTree workspaceId="w" />)
  const row = (name: string) =>
    [...container.querySelectorAll('[role="treeitem"]')].find(
      (item) => item.textContent.trim() === name,
    )
  await click(await waitFor(() => row('src')))
  await waitFor(() => row('a.ts'))
  // While the stream was down, a file came into src; the frame reports the root itself.
  listing.src = [...listing.src!, { name: 'b.ts', path: 'src/b.ts', folder: false }]
  await act(async () =>
    useIdePage.setState({ changedFolders: [''], changedEverywhere: true }),
  )
  expect(await waitFor(() => row('b.ts'))).toBeDefined()
})

test('a folder read before its parent was collapsed shows what changed in it once reopened', async () => {
  const listing: Record<string, Array<{ name: string; path: string; folder: boolean }>> = {
    '': [{ name: 'src', path: 'src', folder: true }],
    src: [{ name: 'components', path: 'src/components', folder: true }],
    'src/components': [
      { name: 'a.tsx', path: 'src/components/a.tsx', folder: false },
    ],
  }
  useFollow.setState({
    ideWorkspace: 'w',
    ide: { listFiles: async (path: string) => listing[path] ?? [] } as unknown as Ide,
  })
  const { container } = await render(<IdeFileTree workspaceId="w" />)
  const row = (name: string) =>
    [...container.querySelectorAll('[role="treeitem"]')].find(
      (item) => item.textContent.trim() === name,
    )
  await click(await waitFor(() => row('src')))
  await click(await waitFor(() => row('components')))
  await waitFor(() => row('a.tsx'))
  // Collapse src, so components is read but not on screen.
  await click(row('src')!)
  await waitFor(() => (row('components') ? undefined : true))
  // The agent adds a file inside it, and the frame reports that folder.
  listing['src/components'] = [
    ...listing['src/components']!,
    { name: 'b.tsx', path: 'src/components/b.tsx', folder: false },
  ]
  await act(async () =>
    useIdePage.setState({ changedFolders: ['src/components'] }),
  )
  await click(row('src')!)
  expect(await waitFor(() => row('b.tsx'))).toBeDefined()
})

test('a folder that could not be read says so, and Try again reads it once the frame answers', async () => {
  const listing: Record<string, Array<{ name: string; path: string; folder: boolean }>> = {
    '': [{ name: 'src', path: 'src', folder: true }],
    src: [{ name: 'a.ts', path: 'src/a.ts', folder: false }],
  }
  let refuse = true
  useFollow.setState({
    ideWorkspace: 'w',
    ide: {
      listFiles: async (path: string) => {
        if (path === 'src' && refuse) throw new Error('The workspace is busy.')
        return listing[path] ?? []
      },
    } as unknown as Ide,
  })
  const { container } = await render(<IdeFileTree workspaceId="w" />)
  const row = (name: string) =>
    [...container.querySelectorAll('[role="treeitem"]')].find(
      (item) => item.textContent.trim() === name,
    )
  await click(await waitFor(() => row('src')))
  const alert = await waitFor(() => container.querySelector('[role="alert"]'))
  expect(alert.textContent).toContain('“src” could not be read: The workspace is busy.')
  // The frame answers again; reopening alone would show the empty list the tree kept.
  refuse = false
  const retry = [...alert.querySelectorAll('button')].find(
    (button) => button.textContent.trim() === 'Try again',
  )
  await click(retry!)
  expect(await waitFor(() => row('a.ts'))).toBeDefined()
  await waitFor(() => (container.querySelector('[role="alert"]') ? undefined : true))
})

test('a folder that could not be read stops being named once it is gone from its parent', async () => {
  const listing: Record<string, Array<{ name: string; path: string; folder: boolean }>> = {
    '': [
      { name: 'docs', path: 'docs', folder: true },
      { name: 'src', path: 'src', folder: true },
    ],
  }
  useFollow.setState({
    ideWorkspace: 'w',
    ide: {
      listFiles: async (path: string) => {
        if (path === 'src') throw new Error('The workspace is busy.')
        return listing[path] ?? []
      },
    } as unknown as Ide,
  })
  const { container } = await render(<IdeFileTree workspaceId="w" />)
  const row = (name: string) =>
    [...container.querySelectorAll('[role="treeitem"]')].find(
      (item) => item.textContent.trim() === name,
    )
  await click(await waitFor(() => row('src')))
  await waitFor(() => container.querySelector('[role="alert"]'))
  // The agent deletes src, and the frame reports the top of the workspace.
  listing[''] = [{ name: 'docs', path: 'docs', folder: true }]
  await act(async () => useIdePage.setState({ changedFolders: [''] }))
  await waitFor(() => (row('src') ? undefined : true))
  await waitFor(() => (container.querySelector('[role="alert"]') ? undefined : true))
})

/** A frame that records the files made through it and lists nothing. */
function frameOf() {
  const created: Array<[string, boolean]> = []
  const ide = {
    listFiles: async () => [],
    createFile: async (path: string, folder: boolean) => {
      created.push([path, folder])
    },
  } as unknown as Ide
  return { ide, created }
}

/** Names a new file in the tree before any frame links, as the Files toolbar lets one. */
async function newFileBeforeLink(container: HTMLElement, handle: IdeFileTreeHandle | null) {
  await act(async () => handle?.create('file'))
  const input = await waitFor(() =>
    container.querySelector<HTMLInputElement>('input[aria-label="New file name"]'),
  )
  input.value = 'notes.md'
  await act(async () => {
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
  })
}

/** Lets a frame that just linked answer whatever was waiting for it. */
const settle = () => act(() => new Promise((resolve) => setTimeout(resolve, 20)))

test('a file named before the frame links reaches its own project’s frame, not another’s', async () => {
  const handle = createRef<IdeFileTreeHandle>()
  const { container } = await render(
    <IdeFileTree key="a" workspaceId="a" handle={handle} />,
  )
  await newFileBeforeLink(container, handle.current)
  const other = frameOf()
  await act(async () => useFollow.setState({ ide: other.ide, ideWorkspace: 'b' }))
  await settle()
  expect(other.created).toEqual([])
  const own = frameOf()
  await act(async () => useFollow.setState({ ide: own.ide, ideWorkspace: 'a' }))
  await waitFor(() => own.created.length > 0)
  expect(own.created).toEqual([['notes.md', false]])
})

test('a file still waiting for its frame when the person opens another project is dropped', async () => {
  const handle = createRef<IdeFileTreeHandle>()
  const { container, rerender } = await render(
    <IdeFileTree key="a" workspaceId="a" handle={handle} />,
  )
  await newFileBeforeLink(container, handle.current)
  // Another project opens, as the sidebar keys its tree by workspace.
  await rerender(<IdeFileTree key="b" workspaceId="b" />)
  const next = frameOf()
  await act(async () => useFollow.setState({ ide: next.ide, ideWorkspace: 'b' }))
  await settle()
  expect(next.created).toEqual([])
  // Nor does it reach the first project's frame should that one link later.
  const first = frameOf()
  await act(async () => useFollow.setState({ ide: first.ide, ideWorkspace: 'a' }))
  await settle()
  expect(first.created).toEqual([])
})
