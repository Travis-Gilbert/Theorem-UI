// FIXTURE (evidence grade: fixture). The command table over a fake product server and workspace
// host (test/fixtures/host.ts): file, state-root, Find in Files, settings and application
// commands, the unavailable table, and the batching of `file.changed` into `fsChanged`. Each
// refusal is paired with the accepted case in the same fixture, so a command that refuses
// everything cannot pass. The I04 tests assert what reached the host (`root`, `probe`, `offset`,
// `encoding`, the copy and setMode operations, the search flags), so the client before I04, which
// cut ranges from whole reads and refused binary, copy, modes and search, fails them.

import { afterEach, describe, expect, test } from 'bun:test'
import type { FileEntry, SearchQuery } from '@/bindings'
import { ChangeSet } from '@codemirror/state'
import { TOO_LARGE, WorkspaceFiles } from '../src/host/commands/fs'
import { FILES_PER_CALL, WorkspaceSearch } from '../src/host/commands/search'
import { closeHarnesses, harness } from './fixtures/commands'
import { type fakeServer, MAX_RANGE, until } from './fixtures/host'

afterEach(closeHarnesses)

const names = (entries: { name: string }[]) => entries.map((e) => e.name)
type Server = ReturnType<typeof fakeServer>
const sent = (server: Server, name: string) => server.operations.filter((o) => o.name === name)
const lists = (server: Server) => sent(server, 'workspace.files.list').length
const bytes = (...values: number[]) => new Uint8Array(values)

describe('file commands', () => {
  test('fs_read_dir lists one directory in the host\'s order: directories first, then natural order', async () => {
    const h = await harness({ 'file10.txt': 'x', 'file2.txt': 'x', 'B.txt': 'x', 'a.txt': 'a', 'src/main.rs': 'fn main() {}', 'lib/x': 'x', '.env': 'k' })
    const root = (await h.call('fs_read_dir', { path: '/demo' })) as FileEntry[]
    expect(names(root)).toEqual(['lib', 'src', '.env', 'a.txt', 'B.txt', 'file2.txt', 'file10.txt'])
    expect(sent(h.server, 'workspace.files.list').at(-1)!.body).toEqual({ path: '', root: 'workspace' })
    const src = (await h.call('fs_read_dir', { path: '/demo/src' })) as FileEntry[]
    expect(src).toEqual([
      { name: 'main.rs', path: '/demo/src/main.rs', kind: 'file', size: 12, mtimeMs: 1000, ignored: false, excluded: false, hidden: false, targetKind: null },
    ])
  })

  test('each entry carries the host\'s size, ignored, excluded and hidden flags, and a link\'s target', async () => {
    const h = await harness({ 'a.txt': 'é😀', 'build/out.o': 'o', 'node_modules/m/i.js': 'i', '.env': 'k', 'ok.txt': '' })
    h.server.files.ignored.add('build')
    h.server.files.links.set('docs', 'directory')
    h.server.files.links.set('dangling', null)
    const root = (await h.call('fs_read_dir', { path: '/demo' })) as FileEntry[]
    const byName = new Map(root.map((e) => [e.name, e]))
    // UTF-8 bytes, not UTF-16 units: the host's size.
    expect(byName.get('a.txt')).toMatchObject({ kind: 'file', size: 6, ignored: false, excluded: false, hidden: false })
    expect(byName.get('build')).toMatchObject({ kind: 'dir', size: 0, ignored: true, excluded: false })
    expect(byName.get('node_modules')).toMatchObject({ kind: 'dir', ignored: true, excluded: true })
    expect(byName.get('.env')).toMatchObject({ hidden: true, ignored: false })
    expect(byName.get('docs')).toMatchObject({ kind: 'symlink', targetKind: 'dir' })
    expect(byName.get('dangling')).toMatchObject({ kind: 'symlink', targetKind: null })
    expect(byName.get('ok.txt')).toMatchObject({ ignored: false, excluded: false })
    const inside = (await h.call('fs_read_dir', { path: '/demo/build' })) as FileEntry[]
    expect(inside).toMatchObject([{ name: 'out.o', ignored: true }])
  })

  test('fs_read_dir answers an empty directory, and refuses a missing one, a file and a path outside the root', async () => {
    const h = await harness({ 'a.txt': 'a', empty: null })
    expect(await h.call('fs_read_dir', { path: '/demo/empty' })).toEqual([])
    await expect(h.call('fs_read_dir', { path: '/demo/nope' })).rejects.toMatchObject({ kind: 'notFound', message: 'nope does not exist' })
    await expect(h.call('fs_read_dir', { path: '/demo/a.txt' })).rejects.toMatchObject({ kind: 'invalidInput', message: 'a.txt is not a directory' })
    await expect(h.call('fs_read_dir', { path: '/elsewhere' })).rejects.toMatchObject({ kind: 'permissionDenied' })
    await expect(h.call('fs_read_dir', { path: '/demo2' })).rejects.toMatchObject({ kind: 'permissionDenied' })
  })

  test('a malformed call is an invalid-input failure, not a crash', async () => {
    const h = await harness()
    await expect(h.call('fs_read_dir', {})).rejects.toMatchObject({ kind: 'invalidInput' })
    await expect(h.call('fs_read_range', { path: '/demo/a', offset: 'zero', len: 1 })).rejects.toMatchObject({ kind: 'invalidInput' })
  })

  test('every listing is the host\'s: a change shows on the next read without waiting for the stream', async () => {
    const h = await harness({ 'a.txt': 'a' })
    expect(names((await h.call('fs_read_dir', { path: '/demo' })) as FileEntry[])).toEqual(['a.txt'])
    h.server.tree.set('b.txt', 'b')
    expect(names((await h.call('fs_read_dir', { path: '/demo' })) as FileEntry[])).toEqual(['a.txt', 'b.txt'])
    await h.call('fs_create_file', { path: '/demo/c.txt' })
    await h.call('fs_delete', { path: '/demo/a.txt' })
    expect(names((await h.call('fs_read_dir', { path: '/demo' })) as FileEntry[])).toEqual(['b.txt', 'c.txt'])
    expect(lists(h.server)).toBe(3)
    expect(h.events).toEqual([])
  })

  test('fs_probe asks the host to look at the file\'s head and reads none of it', async () => {
    const h = await harness({ 'text.txt': 'é😀', 'blob.bin': bytes(0, 1, 2, 255), 'nul.txt': 'a\0b', 'le16.txt': bytes(0xff, 0xfe, 104, 0), dir: null })
    expect(await h.call('fs_probe', { path: '/demo/text.txt' })).toEqual({ size: 6, binary: false, tooLarge: false })
    expect(await h.call('fs_probe', { path: '/demo/blob.bin' })).toMatchObject({ size: 4, binary: true })
    expect(await h.call('fs_probe', { path: '/demo/nul.txt' })).toMatchObject({ binary: true })
    // A UTF-16 byte order mark is the one thing that makes a NUL text.
    expect(await h.call('fs_probe', { path: '/demo/le16.txt' })).toMatchObject({ binary: false })
    expect(sent(h.server, 'workspace.files.stat').map((o) => o.body)).toEqual([
      { path: 'text.txt', root: 'workspace', probe: true },
      { path: 'blob.bin', root: 'workspace', probe: true },
      { path: 'nul.txt', root: 'workspace', probe: true },
      { path: 'le16.txt', root: 'workspace', probe: true },
    ])
    expect(sent(h.server, 'workspace.files.read')).toEqual([])
    await expect(h.call('fs_probe', { path: '/demo/dir' })).rejects.toMatchObject({ kind: 'invalidInput' })
    await expect(h.call('fs_probe', { path: '/demo/missing' })).rejects.toMatchObject({ kind: 'notFound' })
  })

  test('fs_probe reports a file whose head could not be read as an IO failure, not as text', async () => {
    const h = await harness({ 'locked.txt': 'x', 'open.txt': 'x' })
    h.server.files.unreadable.add('locked.txt')
    await expect(h.call('fs_probe', { path: '/demo/locked.txt' })).rejects.toMatchObject({ kind: 'io' })
    expect(await h.call('fs_probe', { path: '/demo/open.txt' })).toMatchObject({ binary: false })
  })

  test('fs_probe calls a file too large only past the limit the editor opens read-only', async () => {
    const h = await harness({ 'at.txt': 'a'.repeat(TOO_LARGE), 'over.txt': 'a'.repeat(TOO_LARGE + 1) })
    expect(await h.call('fs_probe', { path: '/demo/at.txt' })).toMatchObject({ size: TOO_LARGE, tooLarge: false })
    expect(await h.call('fs_probe', { path: '/demo/over.txt' })).toMatchObject({ size: TOO_LARGE + 1, tooLarge: true })
  })

  test('fs_read_range asks the host for the range, not the file, and reports the total', async () => {
    const h = await harness({ 'a.txt': 'abcdef', 'b.bin': bytes(0, 1, 2, 3) })
    expect(await h.call('fs_read_range', { path: '/demo/a.txt', offset: 2, len: 3 })).toEqual({ offset: 2, data: btoa('cde'), total: 6 })
    expect(await h.call('fs_read_range', { path: '/demo/a.txt', offset: 4, len: 100 })).toEqual({ offset: 4, data: btoa('ef'), total: 6 })
    expect(await h.call('fs_read_range', { path: '/demo/b.bin', offset: 1, len: 2 })).toEqual({ offset: 1, data: btoa('\x01\x02'), total: 4 })
    expect(sent(h.server, 'workspace.files.read').map((o) => o.body)).toEqual([
      { path: 'a.txt', root: 'workspace', offset: 2, length: 3 },
      { path: 'a.txt', root: 'workspace', offset: 4, length: 100 },
      { path: 'b.bin', root: 'workspace', offset: 1, length: 2 },
    ])
  })

  test('fs_read_range answers what the host gave when it caps the length, and the caller reads on', async () => {
    const big = new Uint8Array(MAX_RANGE + 10).fill(7)
    const h = await harness({ 'big.bin': big })
    const first = (await h.call('fs_read_range', { path: '/demo/big.bin', offset: 0, len: MAX_RANGE + 10 })) as { offset: number; data: string; total: number }
    expect(first.total).toBe(MAX_RANGE + 10)
    expect(atob(first.data).length).toBe(MAX_RANGE)
    const rest = (await h.call('fs_read_range', { path: '/demo/big.bin', offset: MAX_RANGE, len: MAX_RANGE })) as { data: string }
    expect(atob(rest.data).length).toBe(10)
    await expect(h.call('fs_read_range', { path: '/demo/big.bin', offset: -1, len: 1 })).rejects.toMatchObject({ kind: 'invalidInput' })
  })

  test('fs_read_text returns the file, refuses binary, and an open document answers with its own text', async () => {
    const h = await harness({ 'a.txt': 'on disk', 'blob.bin': bytes(0, 1), dir: null })
    expect(await h.call('fs_read_text', { path: '/demo/a.txt' })).toBe('on disk')
    await expect(h.call('fs_read_text', { path: '/demo/blob.bin' })).rejects.toMatchObject({ kind: 'invalidInput' })
    await expect(h.call('fs_read_text', { path: '/demo/missing.txt' })).rejects.toMatchObject({ kind: 'notFound', message: 'missing.txt does not exist' })
    await expect(h.call('fs_read_text', { path: '/demo/dir' })).rejects.toMatchObject({ kind: 'invalidInput', message: 'dir is not a file' })

    const reads = () => sent(h.server, 'workspace.files.read').length
    const before = reads()
    const withOpen = new WorkspaceFiles(h.context, (path) => (path === '/demo/a.txt' ? 'unsaved' : undefined))
    expect(await withOpen.readText('/demo/a.txt')).toBe('unsaved')
    expect(reads()).toBe(before)
    h.server.tree.set('b.txt', 'b on disk')
    expect(await withOpen.readText('/demo/b.txt')).toBe('b on disk')
    expect(reads()).toBe(before + 1)
  })

  test('fs_read_image makes a data URL for an image type and refuses anything else', async () => {
    const h = await harness({ 'p.png': bytes(137, 80, 78, 71), 'a.txt': 'x' })
    expect(await h.call('fs_read_image', { path: '/demo/p.png' })).toBe(`data:image/png;base64,${btoa(String.fromCharCode(137, 80, 78, 71))}`)
    await expect(h.call('fs_read_image', { path: '/demo/a.txt' })).rejects.toMatchObject({ kind: 'invalidInput' })
  })

  test('create: files and directories are made, an existing name or the root is refused', async () => {
    const h = await harness({ 'a.txt': 'a' })
    await h.call('fs_create_file', { path: '/demo/new.txt' })
    expect(h.server.tree.get('new.txt')).toBe('')
    await h.call('fs_create_dir', { path: '/demo/d' })
    expect(h.server.tree.get('d')).toBeNull()
    await expect(h.call('fs_create_file', { path: '/demo/a.txt' })).rejects.toMatchObject({ kind: 'alreadyExists' })
    await expect(h.call('fs_create_dir', { path: '/demo/d' })).rejects.toMatchObject({ kind: 'alreadyExists' })
    await expect(h.call('fs_create_file', { path: '/demo' })).rejects.toMatchObject({ kind: 'invalidInput' })
    expect(h.server.tree.get('a.txt')).toBe('a')
  })

  test('fs_create_file_bytes writes any bytes, text or not, as base64', async () => {
    const h = await harness({ taken: 't' })
    await h.call('fs_create_file_bytes', { path: '/demo/t.txt', data: [...new TextEncoder().encode('é😀')] })
    await h.call('fs_create_file_bytes', { path: '/demo/b1', data: [0xff, 0xfe] })
    await h.call('fs_create_file_bytes', { path: '/demo/b2', data: [65, 0, 66] })
    expect(h.server.tree.get('t.txt')).toEqual(new TextEncoder().encode('é😀'))
    expect(h.server.tree.get('b1')).toEqual(bytes(0xff, 0xfe))
    expect(h.server.tree.get('b2')).toEqual(bytes(65, 0, 66))
    expect(sent(h.server, 'workspace.files.create').at(-1)!.body).toEqual({ path: 'b2', root: 'workspace', contents: btoa('A\0B'), encoding: 'base64' })
    await expect(h.call('fs_create_file_bytes', { path: '/demo/taken', data: [1] })).rejects.toMatchObject({ kind: 'alreadyExists' })
    expect(h.server.tree.get('taken')).toBe('t')
  })

  test('rename moves a directory with its contents; a taken target, a missing source and the root are refused', async () => {
    const h = await harness({ 'src/a.rs': 'a', 'src/lib/b.rs': 'b', 'taken.txt': 't' })
    await h.call('fs_rename', { from: '/demo/src', to: '/demo/code' })
    expect([...h.server.tree.keys()].sort()).toEqual(['code/a.rs', 'code/lib/b.rs', 'taken.txt'])
    expect(sent(h.server, 'workspace.files.rename')[0]!.body).toEqual({ from: 'src', to: 'code', root: 'workspace' })
    await expect(h.call('fs_rename', { from: '/demo/code', to: '/demo/taken.txt' })).rejects.toMatchObject({ kind: 'alreadyExists' })
    await expect(h.call('fs_rename', { from: '/demo/ghost', to: '/demo/x' })).rejects.toMatchObject({ kind: 'notFound' })
    await expect(h.call('fs_rename', { from: '/demo', to: '/demo/x' })).rejects.toMatchObject({ kind: 'invalidInput' })
  })

  test('delete removes a file or a directory tree, and never the root', async () => {
    const h = await harness({ 'a.txt': 'a', 'd/x': 'x', 'd/y/z': 'z', keep: 'k' })
    await h.call('fs_delete', { path: '/demo/d' })
    await h.call('fs_delete', { path: '/demo/a.txt' })
    expect([...h.server.tree.keys()]).toEqual(['keep'])
    await expect(h.call('fs_delete', { path: '/demo' })).rejects.toMatchObject({ kind: 'invalidInput' })
  })

  test('copy is the host\'s: a file, bytes and all, or a whole tree, in one operation', async () => {
    const h = await harness({ 'a.txt': 'a', 'd/x.txt': 'x', 'd/sub/y.bin': bytes(0, 1), 'b.bin': bytes(0, 255), 'e/f': 'f' })
    await h.call('fs_copy', { from: '/demo/b.bin', to: '/demo/b2.bin' })
    expect(h.server.tree.get('b2.bin')).toEqual(bytes(0, 255))
    await h.call('fs_copy', { from: '/demo/d', to: '/demo/d2' })
    expect(h.server.tree.get('d2/x.txt')).toBe('x')
    expect(h.server.tree.get('d2/sub/y.bin')).toEqual(bytes(0, 1))
    expect(h.server.tree.get('d/x.txt')).toBe('x')
    expect(sent(h.server, 'workspace.files.copy').map((o) => o.body)).toEqual([
      { from: 'b.bin', to: 'b2.bin', root: 'workspace' },
      { from: 'd', to: 'd2', root: 'workspace' },
    ])
    // Nothing was read and written back by the page.
    expect(sent(h.server, 'workspace.files.read')).toEqual([])
    expect(sent(h.server, 'workspace.files.create')).toEqual([])
    expect(sent(h.server, 'workspace.files.copy').every((o) => o.csrf === 'csrf-9')).toBe(true)
  })

  test('copy refuses a taken target, a missing source and a directory into itself, and copies nothing', async () => {
    const h = await harness({ 'a.txt': 'a', 'd/x.txt': 'x', 'e/f': 'f' })
    await expect(h.call('fs_copy', { from: '/demo/a.txt', to: '/demo/e' })).rejects.toMatchObject({ kind: 'alreadyExists', message: 'e already exists' })
    await expect(h.call('fs_copy', { from: '/demo/none', to: '/demo/n' })).rejects.toMatchObject({ kind: 'notFound' })
    await expect(h.call('fs_copy', { from: '/demo/d', to: '/demo/d/inner' })).rejects.toMatchObject({ kind: 'invalidInput', message: 'd/inner is inside d' })
    await expect(h.call('fs_copy', { from: '/demo', to: '/demo/x' })).rejects.toMatchObject({ kind: 'invalidInput' })
    expect([...h.server.tree.keys()].sort()).toEqual(['a.txt', 'd/x.txt', 'e/f'])
  })

  test('fs_set_writable toggles the read-only attribute through setMode and answers the host\'s state', async () => {
    const h = await harness({ 'a.txt': 'a' })
    expect(await h.call('fs_set_writable', { path: '/demo/a.txt', writable: false })).toBe(true)
    expect(h.server.files.modes.get('workspace:a.txt')).toBe(0o444)
    expect(await h.call('fs_set_writable', { path: '/demo/a.txt', writable: true })).toBe(false)
    expect(h.server.files.modes.get('workspace:a.txt')).toBe(0o644)
    expect(sent(h.server, 'workspace.files.setMode').map((o) => o.body)).toEqual([
      { path: 'a.txt', root: 'workspace', writable: false },
      { path: 'a.txt', root: 'workspace', writable: true },
    ])
    await expect(h.call('fs_set_writable', { path: '/demo/missing', writable: true })).rejects.toMatchObject({ kind: 'notFound' })
    await expect(h.call('fs_set_writable', { path: '/demo', writable: true })).rejects.toMatchObject({ kind: 'invalidInput' })
  })

  test('the clipboard file list is the unavailable state it is in a tab', async () => {
    const h = await harness()
    expect(await h.call('clipboard_has_files')).toBe(false)
    expect(await h.call('clipboard_file_list')).toEqual([])
  })
})

describe('the state root', () => {
  test('the application data and config directories are the state root, beside the project and outside it', async () => {
    const h = await harness()
    expect(await h.call('host_state_root')).toBe('/demo.ide-state')
    expect(await h.call('host_workspace_root')).toBe('/demo')
    expect(await h.call('app_info')).toMatchObject({ configDir: '/demo.ide-state' })
  })

  test('scratches are made, listed and read in the caller\'s store, and the checkout never sees them', async () => {
    const h = await harness({ 'a.txt': 'a' })
    await h.call('fs_create_dir', { path: '/demo.ide-state/scratches' })
    // The frontend makes the directory each launch and takes "already exists" as there.
    await expect(h.call('fs_create_dir', { path: '/demo.ide-state/scratches' })).rejects.toMatchObject({ kind: 'alreadyExists' })
    await h.call('fs_create_file', { path: '/demo.ide-state/scratches/scratch.txt' })
    expect([...h.server.state.keys()].sort()).toEqual(['scratches', 'scratches/scratch.txt'])
    expect([...h.server.tree.keys()]).toEqual(['a.txt'])
    const listed = (await h.call('fs_read_dir', { path: '/demo.ide-state/scratches' })) as FileEntry[]
    expect(listed).toMatchObject([{ name: 'scratch.txt', path: '/demo.ide-state/scratches/scratch.txt', kind: 'file', ignored: false, excluded: false }])
    expect(names((await h.call('fs_read_dir', { path: '/demo.ide-state' })) as FileEntry[])).toEqual(['scratches'])
    expect(await h.call('fs_read_text', { path: '/demo.ide-state/scratches/scratch.txt' })).toBe('')
    expect(names((await h.call('fs_read_dir', { path: '/demo' })) as FileEntry[])).toEqual(['a.txt'])
    for (const name of ['workspace.files.create', 'workspace.files.stat', 'workspace.files.read']) {
      expect(sent(h.server, name).every((o) => o.body.root === 'state')).toBe(true)
    }
  })

  test('rename, copy, delete and modes work inside the store; nothing moves between the store and the checkout', async () => {
    const h = await harness({ 'a.txt': 'a' })
    h.server.state.set('s/one.txt', 'one')
    await h.call('fs_rename', { from: '/demo.ide-state/s/one.txt', to: '/demo.ide-state/s/two.txt' })
    await h.call('fs_copy', { from: '/demo.ide-state/s/two.txt', to: '/demo.ide-state/s/three.txt' })
    expect(await h.call('fs_set_writable', { path: '/demo.ide-state/s/three.txt', writable: false })).toBe(true)
    expect([...h.server.state.keys()].sort()).toEqual(['s/three.txt', 's/two.txt'])
    await expect(h.call('fs_copy', { from: '/demo.ide-state/s/two.txt', to: '/demo/two.txt' })).rejects.toMatchObject({ kind: 'unavailable' })
    await expect(h.call('fs_rename', { from: '/demo/a.txt', to: '/demo.ide-state/a.txt' })).rejects.toMatchObject({ kind: 'unavailable' })
    await h.call('fs_delete', { path: '/demo.ide-state/s/two.txt' })
    expect([...h.server.state.keys()]).toEqual(['s/three.txt'])
    expect([...h.server.tree.keys()]).toEqual(['a.txt'])
    await expect(h.call('fs_delete', { path: '/demo.ide-state' })).rejects.toMatchObject({ kind: 'invalidInput' })
  })

  test('a host with no state store bound answers the store as unavailable, and the checkout still works', async () => {
    const h = await harness({ 'a.txt': 'a' })
    h.server.files.stateBound = false
    await expect(h.call('fs_create_dir', { path: '/demo.ide-state/scratches' })).rejects.toMatchObject({ kind: 'unavailable' })
    await expect(h.call('fs_read_dir', { path: '/demo.ide-state' })).rejects.toMatchObject({ kind: 'unavailable' })
    expect(names((await h.call('fs_read_dir', { path: '/demo' })) as FileEntry[])).toEqual(['a.txt'])
  })

  test('a scratch opens as a document without a session, edits through OpenIDEA\'s DocSync, and saves to the store', async () => {
    const h = await harness()
    h.server.state.set('scratches/s.txt', 'hello')
    const info = (await h.call('doc_open', { path: '/demo.ide-state/scratches/s.txt' })) as { id: number; text: string; version: number; dirty: boolean }
    expect(info).toMatchObject({ text: 'hello', version: 0, dirty: false })
    expect(sent(h.server, 'documents.open')).toEqual([])
    // Undo and redo are CodeMirror's own: there is no session history to route to.
    expect(h.commands.registry.history(info.id)).toBeUndefined()

    const sync = h.commands.registry.createSync(info as never, { applyRemote: () => {} }) as unknown as {
      local(changes: ChangeSet): void
      whenIdle(): Promise<void>
    }
    sync.local(ChangeSet.of([{ from: 5, insert: ' world' }], 5))
    await sync.whenIdle()
    expect(h.commands.registry.text('/demo.ide-state/scratches/s.txt')).toBe('hello world')
    expect(h.events).toContainEqual({ type: 'docDirty', doc: info.id, dirty: true })
    // A base the registry has moved past is refused, and the text is unchanged.
    await expect(h.call('doc_edit', { doc: info.id, baseVersion: 0, changes: { changes: [{ from: 0, to: 0, insert: 'x' }] } })).rejects.toMatchObject({ kind: 'outOfSync' })
    expect(await h.call('doc_edit', { doc: info.id, baseVersion: 1, changes: { changes: [{ from: 0, to: 5, insert: 'HELLO' }] } })).toBe(2)
    // An edit from anywhere but the editor reaches the editor as a patch; the editor's own does not come back.
    expect(h.events.filter((e) => e.type === 'docPatched')).toEqual([
      { type: 'docPatched', doc: info.id, baseVersion: 1, version: 2, changes: [{ from: 0, to: 5, insert: 'HELLO' }] },
    ])

    await h.call('doc_save', { doc: info.id })
    expect(h.server.state.get('scratches/s.txt')).toBe('HELLO world')
    expect(sent(h.server, 'workspace.files.create').at(-1)!.body).toEqual({ path: 'scratches/s.txt', root: 'state', contents: 'HELLO world' })
    expect(h.events.at(-1)).toEqual({ type: 'docDirty', doc: info.id, dirty: false })
    expect(sent(h.server, 'documents.edit')).toEqual([])
  })
})

const query = (pattern: string, extra: Partial<SearchQuery> = {}): SearchQuery => ({
  pattern,
  isRegex: false,
  caseSensitive: true,
  wholeWord: false,
  include: [],
  exclude: [],
  scope: { kind: 'project' },
  maxMatches: 0,
  ...extra,
})

/** A channel the search writes to, as the frontend's `Channel` is. */
const channel = <T>(onSend: (event: T) => void = () => {}) => {
  const events: T[] = []
  return { events, send: (event: T) => void (events.push(event), onSend(event)) }
}

type SearchEvent = { type: 'file'; file: { path: string; relPath: string; matches: { line: number; text: string; ranges: [number, number][]; textOffset: number }[] } } | { type: 'done'; summary: Record<string, unknown> }
const isFile = (e: SearchEvent): e is Extract<SearchEvent, { type: 'file' }> => e.type === 'file'

describe('Find in Files', () => {
  test('matches stream file by file with UTF-16 ranges the editor can use, then the summary', async () => {
    const h = await harness({ 'a.txt': '😀 needle and needle\nnothing\nnéedle needle', 'b/c.txt': 'needle', 'blob.bin': bytes(0, 110, 101) })
    const events = channel<SearchEvent>()
    expect(await h.call('search_start', { request: 1, query: query('needle'), onEvent: events })).toBeNull()
    const files = events.events.filter(isFile).map((e) => e.file)
    expect(files).toEqual([
      {
        path: '/demo/a.txt',
        relPath: 'a.txt',
        matches: [
          // The host counts the emoji as one scalar; the editor counts two UTF-16 units.
          { line: 0, text: '😀 needle and needle', ranges: [[3, 9], [14, 20]], textOffset: 0 },
          { line: 2, text: 'néedle needle', ranges: [[7, 13]], textOffset: 0 },
        ],
      },
      { path: '/demo/b/c.txt', relPath: 'b/c.txt', matches: [{ line: 0, text: 'needle', ranges: [[0, 6]], textOffset: 0 }] },
    ])
    expect(events.events.at(-1)).toMatchObject({ type: 'done', summary: { files: 2, matches: 4, limitHit: false, cancelled: false } })
    expect(sent(h.server, 'search.query')[0]!.body).toEqual({ query: 'needle', view: 'text', regex: false, case_sensitive: true, whole_word: false, include: [], exclude: [], limit: FILES_PER_CALL })
  })

  test('regex, case and whole word reach the host as its own flags', async () => {
    const h = await harness({ 'a.txt': 'Needle needles NEEDLE n33dle' })
    const ranges = async (q: SearchQuery) => {
      const events = channel<SearchEvent>()
      await h.call('search_start', { request: 2, query: q, onEvent: events })
      return events.events.flatMap((e) => (e.type === 'file' ? e.file.matches.flatMap((m) => m.ranges) : []))
    }
    expect(await ranges(query('needle'))).toEqual([[7, 13]])
    expect(await ranges(query('needle', { caseSensitive: false }))).toEqual([[0, 6], [7, 13], [15, 21]])
    expect(await ranges(query('needle', { caseSensitive: false, wholeWord: true }))).toEqual([[0, 6], [15, 21]])
    expect(await ranges(query('n\\d+dle', { isRegex: true }))).toEqual([[22, 28]])
    expect(await ranges(query('n\\d+dle'))).toEqual([])
    expect(sent(h.server, 'search.query').at(-2)!.body).toMatchObject({ regex: true, case_sensitive: true, whole_word: false })
  })

  test('a long line\'s window keeps its columns: the host\'s text offset is added back', async () => {
    const h = await harness({ 'long.txt': `${'x'.repeat(700)}needle` })
    const events = channel<SearchEvent>()
    await h.call('search_start', { request: 3, query: query('needle'), onEvent: events })
    const [match] = (events.events[0] as Extract<SearchEvent, { type: 'file' }>).file.matches
    expect(match!.textOffset).toBe(600)
    expect(match!.ranges[0]![0] + match!.textOffset).toBe(700)
    expect(match!.text.slice(match!.ranges[0]![0], match!.ranges[0]![1])).toBe('needle')
  })

  test('a directory or Open Files scope keeps only the files inside it', async () => {
    const h = await harness({ 'a.txt': 'needle', 'src/b.txt': 'needle', 'src/deep/c.txt': 'needle', 'srcx/d.txt': 'needle' })
    const paths = async (scope: SearchQuery['scope']) => {
      const events = channel<SearchEvent>()
      await h.call('search_start', { request: 4, query: query('needle', { scope }), onEvent: events })
      return events.events.flatMap((e) => (e.type === 'file' ? [e.file.relPath] : []))
    }
    expect(await paths({ kind: 'directory', path: '/demo/src' })).toEqual(['src/b.txt', 'src/deep/c.txt'])
    expect(await paths({ kind: 'files', paths: ['/demo/a.txt', '/demo/srcx/d.txt', '/demo.ide-state/scratches/s.txt'] })).toEqual(['a.txt', 'srcx/d.txt'])
    expect(await paths({ kind: 'project' })).toEqual(['a.txt', 'src/b.txt', 'src/deep/c.txt', 'srcx/d.txt'])
    await expect(h.call('search_start', { request: 5, query: query('needle', { scope: { kind: 'directory', path: '/demo.ide-state' } }), onEvent: channel() })).rejects.toMatchObject({ kind: 'unavailable' })
  })

  test('a project larger than one call is read call by call with the job\'s id', async () => {
    const tree = Object.fromEntries(Array.from({ length: 450 }, (_, i) => [`f${String(i).padStart(3, '0')}.txt`, 'needle']))
    const h = await harness(tree)
    const events = channel<SearchEvent>()
    await h.call('search_start', { request: 6, query: query('needle'), onEvent: events })
    expect(events.events.at(-1)).toMatchObject({ type: 'done', summary: { files: 450, matches: 450, limitHit: false } })
    const calls = sent(h.server, 'search.query').map((o) => o.body)
    expect(calls).toHaveLength(3)
    expect(calls[1]).toEqual({ id: 'search:1', limit: FILES_PER_CALL })
    expect(calls[2]).toEqual({ id: 'search:1', limit: FILES_PER_CALL })
    // A finished job needs no cancel: the host has dropped it already.
    expect(sent(h.server, 'search.cancel')).toEqual([])
    expect(h.server.searches.size).toBe(0)
  })

  test('the match limit stops the search, says so, and drops the host\'s job', async () => {
    const tree = Object.fromEntries(Array.from({ length: 300 }, (_, i) => [`f${String(i).padStart(3, '0')}.txt`, 'needle needle']))
    const h = await harness(tree)
    const events = channel<SearchEvent>()
    await h.call('search_start', { request: 7, query: query('needle', { maxMatches: 5 }), onEvent: events })
    const files = events.events.filter(isFile)
    expect(files.map((f) => f.file.matches.flatMap((m) => m.ranges).length)).toEqual([2, 2, 1])
    expect(events.events.at(-1)).toMatchObject({ type: 'done', summary: { files: 3, matches: 5, limitHit: true, cancelled: false } })
    expect(sent(h.server, 'search.query')).toHaveLength(1)
    await until(() => sent(h.server, 'search.cancel').length === 1, 'the job cancel')
    expect(sent(h.server, 'search.cancel')[0]!.body).toEqual({ id: 'search:1' })
    expect(h.server.searches.has('search:1')).toBe(false)
  })

  test('cancel_request stops a search in flight before its next call, and its summary says cancelled', async () => {
    const tree = Object.fromEntries(Array.from({ length: 450 }, (_, i) => [`f${String(i).padStart(3, '0')}.txt`, 'needle']))
    const h = await harness(tree)
    let cancelled = false
    const events = channel<SearchEvent>((event) => {
      if (event.type === 'file' && !cancelled) {
        cancelled = true
        // Seen while the first answer's files are still being sent: the loop stops before its next call.
        h.commands.search.cancel(8)
      }
    })
    await h.call('search_start', { request: 8, query: query('needle'), onEvent: events })
    expect(events.events.at(-1)).toMatchObject({ type: 'done', summary: { cancelled: true, files: FILES_PER_CALL } })
    expect(sent(h.server, 'search.query')).toHaveLength(1)
    await until(() => sent(h.server, 'search.cancel').length === 1, 'the job cancel')
    // A request that is not a search has nothing to cancel.
    expect(await h.call('cancel_request', { id: 99 })).toBeNull()
  })

  test('file masks reach the host as its include and exclude globs, which narrow the files it reads', async () => {
    const h = await harness({ 'a.rs': 'needle', 'b.md': 'needle', 'gen/c.rs': 'needle', 'src/d.kt': 'needle' })
    const paths = async (include: string[], exclude: string[] = []) => {
      const events = channel<SearchEvent>()
      await h.call('search_start', { request: 10, query: query('needle', { include, exclude }), onEvent: events })
      return events.events.flatMap((e) => (e.type === 'file' ? [e.file.relPath] : []))
    }
    expect(await paths([])).toEqual(['a.rs', 'b.md', 'gen/c.rs', 'src/d.kt'])
    expect(await paths(['*.rs'])).toEqual(['a.rs', 'gen/c.rs'])
    expect(sent(h.server, 'search.query').at(-1)!.body).toEqual({
      query: 'needle',
      view: 'text',
      regex: false,
      case_sensitive: true,
      whole_word: false,
      include: ['*.rs'],
      exclude: [],
      limit: FILES_PER_CALL,
    })
    expect(await paths(['*.rs'], ['gen'])).toEqual(['a.rs'])
    // OpenIDEA's own mask syntax: one entry may list several, and `!` moves a mask to the other list.
    expect(await paths(['*.md, *.kt'])).toEqual(['b.md', 'src/d.kt'])
    expect(await paths(['!*.md'])).toEqual(['a.rs', 'gen/c.rs', 'src/d.kt'])
    await expect(h.call('search_start', { request: 10, query: query('needle', { include: ['src/[a'] }), onEvent: channel() })).rejects.toMatchObject({ kind: 'invalidInput' })
  })

  test('what the host cannot search by is refused, never searched without', async () => {
    const h = await harness({ 'a.txt': 'needle' })
    const refused = [
      query('needle', { context: 'inComments' }),
      query('needle', { scope: { kind: 'fileSet', set: 'changed' } as unknown as SearchQuery['scope'] }),
      query('needle', { scope: { kind: 'pattern', pattern: 'file:*.rs' } as unknown as SearchQuery['scope'] }),
    ]
    for (const q of refused) await expect(h.call('search_start', { request: 9, query: q, onEvent: channel() })).rejects.toMatchObject({ kind: 'unavailable' })
    expect(sent(h.server, 'search.query')).toEqual([])
    const events = channel<SearchEvent>()
    await h.call('search_start', { request: 9, query: query('needle', { context: 'any' }), onEvent: events })
    expect(events.events.at(-1)).toMatchObject({ summary: { files: 1, matches: 1 } })
  })

  test('search_validate shows the host\'s reason for a bad regular expression, and costs nothing for a literal', async () => {
    const h = await harness({ 'a.txt': 'needle' })
    const refusal = await h.call('search_validate', { query: query('foo(', { isRegex: true }) }).catch((e: unknown) => e)
    expect(refusal).toMatchObject({ kind: 'invalidInput' })
    // The host's sentence, shown once: not the SDK's status line, and not prefixed twice.
    expect((refusal as { message: string }).message).toMatch(/^Invalid regular expression: (?!Invalid)\S/)
    expect(await h.call('search_validate', { query: query('fo+', { isRegex: true }) })).toBeNull()
    expect(sent(h.server, 'search.query').map((o) => o.body.limit)).toEqual([0, 0])
    await until(() => sent(h.server, 'search.cancel').length === 1, 'the validation job dropped')
    expect(await h.call('search_validate', { query: query('foo(') })).toBeNull()
    expect(sent(h.server, 'search.query')).toHaveLength(2)
    // A file mask is the host's to judge, whatever the pattern.
    await expect(h.call('search_validate', { query: query('x', { include: ['src/[a'] }) })).rejects.toMatchObject({ kind: 'invalidInput' })
    expect(await h.call('search_validate', { query: query('', { exclude: ['*.md'] }) })).toBeNull()
    expect(sent(h.server, 'search.query').slice(2).map((o) => o.body)).toEqual([
      { query: 'x', view: 'text', regex: false, case_sensitive: true, whole_word: false, include: ['src/[a'], exclude: [], limit: 0 },
      { query: '', view: 'text', regex: false, case_sensitive: true, whole_word: false, include: [], exclude: ['*.md'], limit: 0 },
    ])
  })

  test('replace_preview answers the whole text before and after, and each edit as UTF-16 positions', async () => {
    const h = await harness({ 'x.txt': '😀 a=1 b=2\nc=3\n', 'y.txt': 'z=9' })
    const preview = await h.call('replace_preview', {
      query: query('(\\w+)=(\\d+)', { isRegex: true }),
      replacement: '$2=$1',
      preserveCase: false,
      path: '/demo/x.txt',
      only: null,
    })
    expect(preview).toEqual({
      before: '😀 a=1 b=2\nc=3\n',
      after: '😀 1=a 2=b\n3=c\n',
      edits: [
        { range: { start: { line: 0, col: 3 }, end: { line: 0, col: 6 } }, new_text: '1=a' },
        { range: { start: { line: 0, col: 7 }, end: { line: 0, col: 10 } }, new_text: '2=b' },
        { range: { start: { line: 1, col: 0 }, end: { line: 1, col: 3 } }, new_text: '3=c' },
      ],
    })
    // The host is asked about the file being previewed, and reads no other.
    expect(sent(h.server, 'search.replacePreview')[0]!.body).toEqual({ query: '(\\w+)=(\\d+)', replace: '$2=$1', regex: true, case_sensitive: true, whole_word: false, path: 'x.txt' })
    expect(h.server.previewReads).toEqual(['x.txt'])
    // Nothing is written by a preview.
    expect(h.server.tree.get('x.txt')).toBe('😀 a=1 b=2\nc=3\n')
  })

  test('replace_preview keeps only the replacements the frontend chose', async () => {
    const h = await harness({ 'x.txt': 'one two\none' })
    const preview = (await h.call('replace_preview', {
      query: query('one'),
      replacement: '1',
      preserveCase: false,
      path: '/demo/x.txt',
      only: [{ line: 1, col: 0 }],
    })) as { after: string; edits: unknown[] }
    expect(preview.after).toBe('one two\n1')
    expect(preview.edits).toEqual([{ range: { start: { line: 1, col: 0 }, end: { line: 1, col: 3 } }, new_text: '1' }])
  })

  test('replace_preview refuses a text that is not the one the host replaced in, preserve case, and applying', async () => {
    const h = await harness({ 'x.txt': 'one two' })
    const stale = new WorkspaceSearch(h.context, () => 'zero one two')
    await expect(stale.replacePreview(query('one'), '1', false, '/demo/x.txt', null)).rejects.toMatchObject({ kind: 'outOfSync' })
    const current = new WorkspaceSearch(h.context, () => 'one two')
    expect((await current.replacePreview(query('one'), '1', false, '/demo/x.txt', null)).after).toBe('1 two')
    await expect(h.call('replace_preview', { query: query('one'), replacement: 'One', preserveCase: true, path: '/demo/x.txt', only: null })).rejects.toMatchObject({ kind: 'unavailable' })
    await expect(h.call('replace_in_files', {})).rejects.toMatchObject({ kind: 'unavailable' })
  })
})

describe('file.changed becomes fsChanged', () => {
  test('changes arriving together are one event, sorted into created, modified and removed with absolute paths', async () => {
    const h = await harness()
    const push = (n: number, path: string, change: string) =>
      h.server.lives[0]!.push({ kind: 'file.changed', cursor: `ep1:${n}`, data: { path, change, directory: false } })
    push(1, 'new.txt', 'created')
    push(2, 'src/main.rs', 'changed')
    push(3, 'old.txt', 'deleted')
    push(4, 'src/main.rs', 'changed')
    await until(() => h.events.length > 0, 'the fsChanged event')
    expect(h.events).toEqual([
      { type: 'fsChanged', created: ['/demo/new.txt'], modified: ['/demo/src/main.rs'], removed: ['/demo/old.txt'] },
    ])
  })

  test('a change to "." and a resync both tell the tree to re-read the root', async () => {
    const h = await harness()
    // Whatever the host calls the change, the root is only ever re-read, not created or removed.
    h.server.lives[0]!.push({ kind: 'file.changed', cursor: 'ep1:1', data: { path: '.', change: 'created', directory: true } })
    await until(() => h.events.length === 1, 'the first event')
    expect(h.events[0]).toEqual({ type: 'fsChanged', created: [], modified: ['/demo'], removed: [] })
    h.server.lives[0]!.push({ kind: 'resync', cursor: 'ep2:0', data: { reason: 'epoch_changed', epoch: 'ep2', cursor: 'ep2:0' } })
    await until(() => h.events.length === 2, 'the event after the resync')
    expect(h.events[1]).toEqual({ type: 'fsChanged', created: [], modified: ['/demo'], removed: [] })
  })
})

describe('application commands', () => {
  test('the tab is the project window: launch is taken once and names the files from the address', async () => {
    const h = await harness({}, ['src/a.rs', 'b.txt'])
    expect(await h.call('window_take_launch')).toMatchObject({ project: '/demo', files: ['/demo/src/a.rs', '/demo/b.txt'], remote: null })
    expect(await h.call('window_take_launch')).toBeNull()
    expect(await h.call('host_workspace_root')).toBe('/demo')
  })

  test('open_project answers the attached workspace, remembers it, and refuses any other root', async () => {
    const h = await harness()
    const info = (await h.call('open_project', { path: '/demo' })) as { root: string; name: string; trusted: boolean; isGit: boolean }
    expect(info).toMatchObject({ root: '/demo', name: 'demo', trusted: true, isGit: false })
    expect(await h.call('recent_projects')).toMatchObject([{ path: '/demo', name: 'demo' }])
    await expect(h.call('open_project', { path: '/other' })).rejects.toMatchObject({ kind: 'unavailable' })
    await h.call('remove_recent_project', { path: '/demo' })
    expect(await h.call('recent_projects')).toEqual([])
  })

  test('everything that would be another native window answers as unavailable, and a new window names why', async () => {
    const h = await harness()
    for (const command of ['window_new', 'window_open_settings', 'window_open_remote', 'light_edit_open', 'workspace_create']) {
      await expect(h.call(command, {})).rejects.toMatchObject({ kind: 'unavailable' })
    }
    await expect(h.call('window_open_project', { path: '/demo', newWindow: true })).rejects.toMatchObject({ kind: 'unavailable' })
    expect(await h.call('window_open_project', { path: '/demo', newWindow: false })).toEqual({ kind: 'current' })
    expect(await h.call('window_close_context')).toEqual({ quitting: false, windows: 1 })
  })

  test('a tab has no native menu bar, so configuring or refreshing one succeeds without doing anything', async () => {
    const h = await harness()
    expect(await h.call('menu_configure', { config: {} })).toBeNull()
    expect(await h.call('menu_refresh')).toBeNull()
  })

  test('changing trust is refused: nothing from the project runs in the browser', async () => {
    const h = await harness()
    expect(await h.call('project_trust_status', { path: '/demo' })).toMatchObject({ trusted: true })
    await expect(h.call('project_trust_set', { trusted: false })).rejects.toMatchObject({ kind: 'unavailable' })
  })

  test('the table is built without one command answered twice, and holds the document and file commands', async () => {
    const h = await harness()
    expect(h.commands.table.size).toBeGreaterThan(40)
    for (const name of ['doc_open', 'doc_save', 'fs_read_dir', 'settings_get', 'open_project']) expect(h.commands.table.has(name)).toBe(true)
    expect(h.commands.table.has('vcs_branches')).toBe(false)
  })
})

describe('settings commands', () => {
  test('a project value overrides the global one and leaves it alone; the change is announced', async () => {
    const h = await harness()
    expect((await h.call('settings_get')) as any).toMatchObject({ editor: { tabSize: 4 } })
    await h.call('settings_set', { scope: 'global', key: 'editor.tabSize', value: '8' })
    expect((await h.call('settings_get_global')) as any).toMatchObject({ editor: { tabSize: 8 } })
    expect((await h.call('settings_get')) as any).toMatchObject({ editor: { tabSize: 8 } })
    await h.call('settings_set', { scope: 'project', key: 'editor.tabSize', value: '2' })
    expect((await h.call('settings_get')) as any).toMatchObject({ editor: { tabSize: 2 } })
    expect((await h.call('settings_get_global')) as any).toMatchObject({ editor: { tabSize: 8 } })
    expect(h.events.filter((e) => e.type === 'settingsChanged').map((e) => (e as any).key)).toEqual(['editor.tabSize', 'editor.tabSize'])
  })

  test('layers survive a reload through storage; another workspace does not see this workspace\'s project layer', async () => {
    const first = await harness()
    await first.call('settings_set', { scope: 'project', key: 'editor.tabSize', value: '2' })
    const reloaded = await harness()
    for (const [key, value] of first.storage.held) reloaded.storage.setItem(key, value)
    expect((await reloaded.call('settings_get')) as any).toMatchObject({ editor: { tabSize: 2 } })
    // The same layer, stored under another workspace's key, is not this workspace's.
    const elsewhere = await harness()
    for (const [key, value] of first.storage.held) elsewhere.storage.setItem(key.replace('.demo', '.other'), value)
    expect((await elsewhere.call('settings_get')) as any).toMatchObject({ editor: { tabSize: 4 } })
  })

  test('an unknown key, an unknown scope and a value that is not JSON are invalid input', async () => {
    const h = await harness()
    await expect(h.call('settings_set', { scope: 'project', key: 'bogus.key', value: '1' })).rejects.toMatchObject({ kind: 'invalidInput' })
    await expect(h.call('settings_set', { scope: 'universe', key: 'editor.tabSize', value: '1' })).rejects.toMatchObject({ kind: 'invalidInput' })
    await expect(h.call('settings_set', { scope: 'project', key: 'editor.tabSize', value: '{nope' })).rejects.toMatchObject({ kind: 'invalidInput' })
    expect((await h.call('settings_get')) as any).toMatchObject({ editor: { tabSize: 4 } })
    expect(h.events).toEqual([])
  })

  test('export and import are unavailable in a tab', async () => {
    const h = await harness()
    await expect(h.call('settings_export', {})).rejects.toMatchObject({ kind: 'unavailable' })
    await expect(h.call('settings_import', {})).rejects.toMatchObject({ kind: 'unavailable' })
  })
})
