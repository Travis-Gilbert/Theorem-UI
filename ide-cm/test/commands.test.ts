// FIXTURE (evidence grade: fixture). The command table over a fake product server and workspace
// host (test/fixtures/host.ts): file, settings and application commands, the unavailable table,
// and the batching of `file.changed` into `fsChanged`. Each refusal is paired with the accepted
// case in the same fixture, so a command that refuses everything cannot pass.

import { afterEach, describe, expect, test } from 'bun:test'
import type { DocumentSession } from '@theoremharness/sdk'
import { TOO_LARGE, WorkspaceFiles } from '../src/host/commands/fs'
import { closeHarnesses, harness } from './fixtures/commands'
import { fakeServer, until } from './fixtures/host'

afterEach(closeHarnesses)

const names = (entries: { name: string }[]) => entries.map((e) => e.name).sort()
const lists = (server: ReturnType<typeof fakeServer>) => server.operations.filter((o) => o.name === 'workspace.files.list').length

describe('file commands', () => {
  test('fs_read_dir lists one directory at a time, with absolute paths, kinds and hidden flags', async () => {
    const h = await harness({ 'a.txt': 'a', '.env': 'k', 'src/main.rs': 'fn main() {}', 'src/lib/x.rs': 'x' })
    const root = (await h.call('fs_read_dir', { path: '/demo' })) as any[]
    expect(names(root)).toEqual(['.env', 'a.txt', 'src'])
    expect(root.find((e) => e.name === 'src')).toMatchObject({ kind: 'dir', path: '/demo/src', hidden: false })
    expect(root.find((e) => e.name === '.env')).toMatchObject({ kind: 'file', hidden: true, ignored: false, excluded: false })
    const src = (await h.call('fs_read_dir', { path: '/demo/src' })) as any[]
    expect(names(src)).toEqual(['lib', 'main.rs'])
    expect(src.find((e) => e.name === 'main.rs').path).toBe('/demo/src/main.rs')
  })

  test('fs_read_dir answers an empty directory, and refuses a missing one, a file and a path outside the root', async () => {
    const h = await harness({ 'a.txt': 'a', empty: null })
    expect(await h.call('fs_read_dir', { path: '/demo/empty' })).toEqual([])
    await expect(h.call('fs_read_dir', { path: '/demo/nope' })).rejects.toMatchObject({ kind: 'notFound' })
    await expect(h.call('fs_read_dir', { path: '/demo/a.txt' })).rejects.toMatchObject({ kind: 'invalidInput' })
    await expect(h.call('fs_read_dir', { path: '/elsewhere' })).rejects.toMatchObject({ kind: 'permissionDenied' })
    await expect(h.call('fs_read_dir', { path: '/demo2' })).rejects.toMatchObject({ kind: 'permissionDenied' })
  })

  test('a malformed call is an invalid-input failure, not a crash', async () => {
    const h = await harness()
    await expect(h.call('fs_read_dir', {})).rejects.toMatchObject({ kind: 'invalidInput' })
    await expect(h.call('fs_read_range', { path: '/demo/a', offset: 'zero', len: 1 })).rejects.toMatchObject({ kind: 'invalidInput' })
  })

  test('fs_probe reports the byte size (not the UTF-16 length), and whether the file is binary', async () => {
    const h = await harness({ 'text.txt': 'é😀', 'blob.bin': new Uint8Array([0, 1, 2, 255]), dir: null })
    expect(await h.call('fs_probe', { path: '/demo/text.txt' })).toEqual({ size: 6, binary: false, tooLarge: false })
    expect(await h.call('fs_probe', { path: '/demo/blob.bin' })).toMatchObject({ size: 4, binary: true })
    await expect(h.call('fs_probe', { path: '/demo/dir' })).rejects.toMatchObject({ kind: 'invalidInput' })
    await expect(h.call('fs_probe', { path: '/demo/missing' })).rejects.toMatchObject({ kind: 'notFound' })
  })

  test('fs_probe calls a file too large only past the limit the editor opens read-only', async () => {
    const h = await harness({ 'at.txt': 'a'.repeat(TOO_LARGE), 'over.txt': 'a'.repeat(TOO_LARGE + 1) })
    expect(await h.call('fs_probe', { path: '/demo/at.txt' })).toMatchObject({ size: TOO_LARGE, tooLarge: false })
    expect(await h.call('fs_probe', { path: '/demo/over.txt' })).toMatchObject({ size: TOO_LARGE + 1, tooLarge: true })
  })

  test('fs_read_range cuts the range from the whole read and reports the total', async () => {
    const h = await harness({ 'a.txt': 'abcdef' })
    const range = (await h.call('fs_read_range', { path: '/demo/a.txt', offset: 2, len: 3 })) as { offset: number; data: string; total: number }
    expect(range).toEqual({ offset: 2, data: btoa('cde'), total: 6 })
    expect(await h.call('fs_read_range', { path: '/demo/a.txt', offset: 4, len: 100 })).toEqual({ offset: 4, data: btoa('ef'), total: 6 })
  })

  test('fs_read_text returns the file, refuses binary, and an open document answers with its own text', async () => {
    const h = await harness({ 'a.txt': 'on disk', 'blob.bin': new Uint8Array([0, 1]) })
    expect(await h.call('fs_read_text', { path: '/demo/a.txt' })).toBe('on disk')
    await expect(h.call('fs_read_text', { path: '/demo/blob.bin' })).rejects.toMatchObject({ kind: 'invalidInput' })

    const reads = () => h.server.operations.filter((o) => o.name === 'workspace.files.read').length
    const before = reads()
    const withOpen = new WorkspaceFiles(h.context, (path) => (path === '/demo/a.txt' ? ({ text: 'unsaved' } as DocumentSession) : undefined))
    expect(await withOpen.readText('/demo/a.txt')).toBe('unsaved')
    expect(reads()).toBe(before)
    h.server.tree.set('b.txt', 'b on disk')
    expect(await withOpen.readText('/demo/b.txt')).toBe('b on disk')
    expect(reads()).toBe(before + 1)
  })

  test('fs_read_image makes a data URL for an image type and refuses anything else', async () => {
    const h = await harness({ 'p.png': new Uint8Array([137, 80, 78, 71]), 'a.txt': 'x' })
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

  test('fs_create_file_bytes accepts UTF-8 text and says plainly that binary is unavailable', async () => {
    const h = await harness()
    await h.call('fs_create_file_bytes', { path: '/demo/t.txt', data: [...new TextEncoder().encode('é😀')] })
    expect(h.server.tree.get('t.txt')).toBe('é😀')
    await expect(h.call('fs_create_file_bytes', { path: '/demo/b1', data: [0xff, 0xfe] })).rejects.toMatchObject({ kind: 'unavailable' })
    await expect(h.call('fs_create_file_bytes', { path: '/demo/b2', data: [65, 0, 66] })).rejects.toMatchObject({ kind: 'unavailable' })
    expect(h.server.tree.has('b1')).toBe(false)
    expect(h.server.tree.has('b2')).toBe(false)
  })

  test('rename moves a directory with its contents; a taken target, a missing source and the root are refused', async () => {
    const h = await harness({ 'src/a.rs': 'a', 'src/lib/b.rs': 'b', 'taken.txt': 't' })
    await h.call('fs_rename', { from: '/demo/src', to: '/demo/code' })
    expect([...h.server.tree.keys()].sort()).toEqual(['code/a.rs', 'code/lib/b.rs', 'taken.txt'])
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

  test('copy duplicates a file or a whole directory; binary content and a taken target are refused', async () => {
    const h = await harness({ 'a.txt': 'a', 'd/x.txt': 'x', 'd/sub/y.txt': 'y', 'b.bin': new Uint8Array([0, 1]), 'e/f': 'f' })
    await h.call('fs_copy', { from: '/demo/a.txt', to: '/demo/a2.txt' })
    expect(h.server.tree.get('a2.txt')).toBe('a')
    await h.call('fs_copy', { from: '/demo/d', to: '/demo/d2' })
    expect(h.server.tree.get('d2/x.txt')).toBe('x')
    expect(h.server.tree.get('d2/sub/y.txt')).toBe('y')
    expect(h.server.tree.get('d/x.txt')).toBe('x')
    await expect(h.call('fs_copy', { from: '/demo/b.bin', to: '/demo/b2.bin' })).rejects.toMatchObject({ kind: 'unavailable' })
    await expect(h.call('fs_copy', { from: '/demo/a.txt', to: '/demo/e' })).rejects.toMatchObject({ kind: 'alreadyExists' })
    await expect(h.call('fs_copy', { from: '/demo/none', to: '/demo/n' })).rejects.toMatchObject({ kind: 'notFound' })
  })

  test('file modes and the clipboard file list are the unavailable states they are', async () => {
    const h = await harness()
    await expect(h.call('fs_set_writable', { path: '/demo/a', writable: true })).rejects.toMatchObject({ kind: 'unavailable' })
    expect(await h.call('clipboard_has_files')).toBe(false)
    expect(await h.call('clipboard_file_list')).toEqual([])
  })

  test('the listing is cached between reads and dropped when the live stream reports a change', async () => {
    const h = await harness({ 'a.txt': 'a' })
    await h.call('fs_read_dir', { path: '/demo' })
    await h.call('fs_read_dir', { path: '/demo' })
    expect(lists(h.server)).toBe(1)
    h.server.tree.set('b.txt', 'b')
    h.server.lives[0]!.push({ kind: 'file.changed', cursor: 'ep1:1', data: { path: 'b.txt', change: 'created', directory: false } })
    await until(() => h.events.length > 0, 'the fsChanged event')
    expect(names((await h.call('fs_read_dir', { path: '/demo' })) as any[])).toEqual(['a.txt', 'b.txt'])
    expect(lists(h.server)).toBe(2)
  })

  test('a write made through these commands drops the listing without waiting for the stream', async () => {
    const h = await harness({ 'a.txt': 'a' })
    expect(names((await h.call('fs_read_dir', { path: '/demo' })) as any[])).toEqual(['a.txt'])
    await h.call('fs_create_file', { path: '/demo/b.txt' })
    expect(names((await h.call('fs_read_dir', { path: '/demo' })) as any[])).toEqual(['a.txt', 'b.txt'])
    await h.call('fs_delete', { path: '/demo/a.txt' })
    expect(names((await h.call('fs_read_dir', { path: '/demo' })) as any[])).toEqual(['b.txt'])
    expect(h.events).toEqual([])
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
