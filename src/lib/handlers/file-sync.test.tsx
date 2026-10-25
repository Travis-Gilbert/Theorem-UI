// SOURCING: bun:test over useTextFile with the in-memory workspace.
import { afterEach, expect, test } from 'bun:test'
import { act } from 'react'
import {
  cleanup,
  fakeWorkspace,
  render,
  settle,
  waitFor,
} from '../../../test/workspace'
import type { FakeWorkspace } from '../../../test/workspace'
import { useTextFile } from './file-sync'
import type { TextFile } from './file-sync'

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
