// SOURCING: bun:test over useTextFile with the in-memory workspace.
import { afterEach, expect, test } from 'bun:test'
import { act } from 'react'
import { create } from 'zustand'
import {
  cleanup,
  fakeWorkspace,
  render,
  settle,
  waitFor,
} from '../../../test/workspace'
import type { FakeWorkspace } from '../../../test/workspace'
import type { WorkspaceEntry } from '@/lib/workspace/types'
import { useSaveState, useTextFile } from './file-sync'
import type { SaveState, TextFile } from './file-sync'

afterEach(cleanup)

let file: TextFile
const report = (view: TextFile) => (file = view)

function Probe({ ws, path }: { ws: FakeWorkspace; path: string }) {
  report(useTextFile({ client: ws.client, path }))
  return null
}

async function open(text = 'one') {
  const ws = fakeWorkspace({ 'a.md': text })
  await render(<Probe ws={ws} path="a.md" />)
  await waitFor(() => file.text === text)
  return ws
}

test('loads the text', async () => {
  await open('hello')
  expect(file).toMatchObject({ text: 'hello', dirty: false, conflict: false })
})

test('writes an edit after a pause, against the hash it was made from', async () => {
  const ws = await open('one')
  act(() => file.setText('two'))
  expect(file.dirty).toBe(true)
  await waitFor(() => ws.text('a.md') === 'two')
  await settle()
  expect(file.dirty).toBe(false)
  expect(ws.writes).toHaveLength(1)
  expect(ws.writes[0]?.expectedHash).toBe(
    new Bun.CryptoHasher('sha256').update('one').digest('hex'),
  )
})

test('its own write is not news', async () => {
  const ws = await open('one')
  act(() => file.setText('two'))
  await act(() => file.flush())
  await settle()
  act(() => file.setText('three'))
  await act(() => file.flush())
  await settle()
  expect(ws.text('a.md')).toBe('three')
  expect(file.conflict).toBe(false)
})

test('a clean view takes a change made on disk', async () => {
  const ws = await open('one')
  await ws.external('a.md', 'changed elsewhere')
  await waitFor(() => file.text === 'changed elsewhere')
  expect(ws.writes).toHaveLength(0)
})

test('a view with unsaved edits stops and asks', async () => {
  const ws = await open('one')
  act(() => file.setText('mine'))
  await ws.external('a.md', 'theirs')
  expect(file.conflict).toBe(true)
  expect(file.text).toBe('mine')
  // Nothing is written while the conflict stands.
  await act(() => Bun.sleep(500))
  expect(ws.text('a.md')).toBe('theirs')

  await act(() => file.resolve('mine'))
  await settle()
  expect(ws.text('a.md')).toBe('mine')
  expect(file.conflict).toBe(false)
})

test('taking the disk drops the edits', async () => {
  const ws = await open('one')
  act(() => file.setText('mine'))
  await ws.external('a.md', 'theirs')
  await act(() => file.resolve('disk'))
  await waitFor(() => file.text === 'theirs')
  expect(file.dirty).toBe(false)
  expect(ws.text('a.md')).toBe('theirs')
})

test('a file Theorem keeps read-only takes no edits', async () => {
  const ws = fakeWorkspace({ 'a.md': 'plan' })
  const entry = {
    ...(await ws.client.tree()).find((e) => e.path === 'a.md')!,
    theorem: { backing: 'plan', readOnly: true, placed: false, agent: false },
  } satisfies WorkspaceEntry
  function ReadOnlyProbe() {
    report(useTextFile({ client: ws.client, path: 'a.md', entry }))
    return null
  }
  await render(<ReadOnlyProbe />)
  await waitFor(() => file.text === 'plan')
  act(() => file.setText('edited'))
  await act(() => file.flush())
  expect(file).toMatchObject({ text: 'plan', readOnly: true, dirty: false })
  expect(ws.writes).toHaveLength(0)
})

const entryAt = async (ws: FakeWorkspace, path: string) =>
  (await ws.client.tree()).find((e) => e.path === path)!

test('a renamed file keeps its unsaved edits and writes them at its new path', async () => {
  const ws = fakeWorkspace({ 'a.md': 'one' })
  const first = await entryAt(ws, 'a.md')
  const where = create<{ path: string; entry: WorkspaceEntry }>(() => ({
    path: 'a.md',
    entry: first,
  }))
  function MovingProbe() {
    const { path, entry } = where()
    report(useTextFile({ client: ws.client, path, entry }))
    return null
  }
  await render(<MovingProbe />)
  await waitFor(() => file.text === 'one')
  act(() => file.setText('mine'))
  await ws.client.rename('a.md', 'b.md')
  const moved = await entryAt(ws, 'b.md')
  act(() => where.setState({ path: 'b.md', entry: moved }))
  expect(file).toMatchObject({ text: 'mine', dirty: true })
  await act(() => file.flush())
  await settle()
  expect(ws.text('b.md')).toBe('mine')
  expect(ws.text('a.md')).toBeUndefined()
  expect(file.dirty).toBe(false)
})

/** A view of a.md whose path the test moves, as the tree would. */
async function movingView(ws: FakeWorkspace) {
  const where = create<{ path: string; entry: WorkspaceEntry }>(() => ({
    path: 'a.md',
    entry: undefined as unknown as WorkspaceEntry,
  }))
  where.setState({ entry: await entryAt(ws, 'a.md') })
  function MovingView() {
    const { path, entry } = where()
    report(useTextFile({ client: ws.client, path, entry }))
    return null
  }
  await render(<MovingView />)
  await waitFor(() => file.text === 'one')
  return async (path: string) => {
    const entry = await entryAt(ws, path)
    act(() => where.setState({ path, entry }))
  }
}

test('a change at the new path that comes before the view sees the move is kept', async () => {
  const ws = fakeWorkspace({ 'a.md': 'one' })
  const moveView = await movingView(ws)
  // The server rewrites the moved note's links: renamed, then changed.
  await ws.client.rename('a.md', 'b.md')
  await ws.external('b.md', 'one, links rewritten')
  await moveView('b.md')
  await waitFor(() => file.text === 'one, links rewritten')
  expect(file).toMatchObject({ dirty: false, conflict: false })
})

test('a file follows its folder when the folder moves', async () => {
  const ws = fakeWorkspace({ 'notes/a.md': 'one' })
  const where = create<{ path: string }>(() => ({ path: 'notes/a.md' }))
  const entry = await entryAt(ws, 'notes/a.md')
  function FolderView() {
    report(useTextFile({ client: ws.client, path: where().path, entry }))
    return null
  }
  await render(<FolderView />)
  await waitFor(() => file.text === 'one')
  act(() => file.setText('mine'))
  await ws.client.rename('notes', 'archive')
  await act(() => file.flush())
  await settle()
  expect(ws.text('archive/a.md')).toBe('mine')
})

test('two views of one file share one set of edits', async () => {
  const ws = fakeWorkspace({ 'a.md': 'one' })
  const entry = await entryAt(ws, 'a.md')
  const views: Array<TextFile> = []
  const see = (slot: number, view: TextFile) => (views[slot] = view)
  function View({ slot }: { slot: number }) {
    see(slot, useTextFile({ client: ws.client, path: 'a.md', entry }))
    return null
  }
  await render(
    <>
      <View slot={0} />
      <View slot={1} />
    </>,
  )
  await waitFor(() => views[1]?.text === 'one')
  act(() => views[0]!.setText('mine'))
  expect(views[1]).toMatchObject({ text: 'mine', dirty: true })
  await act(() => views[1]!.flush())
  await settle()
  expect(ws.text('a.md')).toBe('mine')
  expect(ws.writes).toHaveLength(1)
  expect(views[0]!.dirty).toBe(false)
})

test('another view of the file sees whether its edits are saved', async () => {
  const ws = fakeWorkspace({ 'a.md': 'one' })
  const entry = await entryAt(ws, 'a.md')
  const seen: { state: SaveState | null } = { state: null }
  const see = (state: SaveState | null) => (seen.state = state)
  function Header() {
    see(useSaveState(ws.client, entry))
    return null
  }
  function Editor() {
    report(useTextFile({ client: ws.client, path: 'a.md', entry }))
    return null
  }
  await render(
    <>
      <Header />
      <Editor />
    </>,
  )
  await waitFor(() => file.text === 'one')
  expect(seen.state).toBe('saved')
  act(() => file.setText('two'))
  expect(seen.state).toBe('saving')
  await act(() => file.flush())
  await settle()
  expect(seen.state).toBe('saved')
  await ws.external('a.md', 'theirs')
  act(() => file.setText('mine'))
  await ws.external('a.md', 'theirs again')
  expect(seen.state).toBe('stopped')
})

test('a file no view edits as text has no save state', async () => {
  const ws = fakeWorkspace({ 'a.md': 'one' })
  const entry = await entryAt(ws, 'a.md')
  const seen: { state: SaveState | null } = { state: 'saved' }
  const see = (state: SaveState | null) => (seen.state = state)
  function Header() {
    see(useSaveState(ws.client, entry))
    return null
  }
  await render(<Header />)
  expect(seen.state).toBeNull()
})

/** Makes every write report that the store merged it with another change. */
function merging(ws: FakeWorkspace, also: string) {
  const write = ws.client.write
  Object.assign(ws.client, {
    write: async (...args: Parameters<typeof write>) => {
      await write(...args)
      const { hash } = await write(args[0], `${String(args[1])}\n${also}`)
      return { hash, merged: true }
    },
  })
}

test('a merged write shows what the store holds', async () => {
  const ws = await open('one')
  merging(ws, 'theirs')
  act(() => file.setText('mine'))
  await act(() => file.flush())
  await settle()
  expect(file).toMatchObject({
    text: 'mine\ntheirs',
    dirty: false,
    conflict: false,
    saveFailed: false,
  })
})

test('a merged write keeps the edits when the merged text cannot be read', async () => {
  const ws = await open('one')
  merging(ws, 'theirs')
  Object.assign(ws.client, {
    readText: () => Promise.reject(new Error('offline')),
  })
  act(() => file.setText('mine'))
  await act(() => file.flush())
  await settle()
  expect(file).toMatchObject({
    text: 'mine',
    dirty: true,
    isError: false,
    saveFailed: true,
  })
})

test('a write refused with 412 is a conflict', async () => {
  const ws = await open('one')
  // The disk changes without an event reaching the view.
  await ws.client.write('a.md', 'raced')
  ws.writes.length = 0
  act(() => file.setText('mine'))
  await act(() => file.flush())
  await settle()
  expect(file.conflict).toBe(true)
  expect(ws.text('a.md')).toBe('raced')
})
