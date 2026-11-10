import { afterEach, expect, test } from 'bun:test'
import { act } from 'react'
import { cleanup, click, render, waitFor } from '../../../test/blocks/render'
import { useFollow } from './follow'
import { IdeFileTree } from './ide-file-tree'
import { useIdePage } from './ide-page'

type Ide = NonNullable<ReturnType<typeof useFollow.getState>['ide']>

afterEach(async () => {
  await cleanup()
  useFollow.setState({ ide: undefined })
  useIdePage.setState({ changedFolders: [], changedEverywhere: false })
})

test('after missed changes, an open folder reads again and shows what changed in it', async () => {
  // The workspace as the frame lists it: a top folder with one file in it.
  const listing: Record<string, Array<{ name: string; path: string; folder: boolean }>> = {
    '': [{ name: 'src', path: 'src', folder: true }],
    src: [{ name: 'a.ts', path: 'src/a.ts', folder: false }],
  }
  useFollow.setState({
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
