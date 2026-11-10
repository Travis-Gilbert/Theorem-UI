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
