// FIXTURE (evidence grade: fixture). WorkspaceConnection over a fake product server and host: the
// bootstrap, the workspace open, and an SSE live stream the test controls. Nothing here reaches a
// real host; the live-local run is in the browser evidence.

import { describe, expect, test } from 'bun:test'
import { TerminalChannel } from '@theoremharness/sdk'
import { WorkspaceConnection, type ConnectionOptions } from '../src/host/connection'
import { fakeServer, hello, memoryStorage as memory, until } from './fixtures/host'

/** A connection whose live stream the test drives: opened, hello'd, and in the `open` state. */
const connect = async (server: ReturnType<typeof fakeServer>, extra: Partial<ConnectionOptions> = {}) => {
  const connection = new WorkspaceConnection({ baseUrl: 'http://page.test', workspaceId: 'demo', name: 'demo', fetch: server.fetchImpl, ...extra })
  await connection.ready
  await until(() => server.lives.length === 1)
  server.lives[0]!.push(hello('ep1:0'))
  await until(() => connection.live.state === 'open')
  return connection
}

describe('WorkspaceConnection', () => {
  test('opens the workspace with the bootstrap token and hands the same token to every operation', async () => {
    const server = fakeServer()
    const connection = new WorkspaceConnection({ baseUrl: 'http://page.test', workspaceId: 'demo', name: 'demo', fetch: server.fetchImpl })
    await connection.ready
    expect(server.opens[0]!.get('x-csrf-token')).toBe('csrf-9')
    const a = await connection.headers()
    const b = await connection.headers()
    expect(a).toMatchObject({ workspaceId: 'demo', 'X-CSRF-Token': 'csrf-9' })
    expect(a['Idempotency-Key']).not.toBe(b['Idempotency-Key'])
    connection.live.close()
  })

  test('paths translate between the frontend root and workspace-relative names', () => {
    const server = fakeServer()
    const connection = new WorkspaceConnection({ baseUrl: 'http://page.test', workspaceId: 'demo', name: 'My Project', fetch: server.fetchImpl })
    expect(connection.root).toBe('/My Project')
    expect(connection.toRelative('/My Project')).toBe('')
    expect(connection.toRelative('/My Project/src/a.rs')).toBe('src/a.rs')
    expect(connection.toRelative('/My Project2/a')).toBeUndefined()
    expect(connection.toRelative('/elsewhere/a')).toBeUndefined()
    expect(connection.toAbsolute('src/a.rs')).toBe('/My Project/src/a.rs')
    expect(connection.toAbsolute('')).toBe('/My Project')
    connection.live.close()
  })

  test('the live cursor survives a reload: saved, then sent as Last-Event-ID by the next page', async () => {
    const storage = memory()
    const server = fakeServer()
    const first = new WorkspaceConnection({ baseUrl: 'http://page.test', workspaceId: 'demo', name: 'demo', fetch: server.fetchImpl, storage })
    await first.ready
    await until(() => server.lives.length === 1)
    expect(server.lives[0]!.headers.get('last-event-id')).toBeNull()
    server.lives[0]!.push(hello('ep1:0'))
    server.lives[0]!.push({ kind: 'file.changed', cursor: 'ep1:4', data: { path: 'a.txt', change: 'changed', directory: false } })
    await until(() => first.live.cursor === 'ep1:4')
    first.saveCursor()
    expect(storage.held.get('theorem-ide-cm.live-cursor.demo')).toBe('ep1:4')
    first.live.close()

    const second = new WorkspaceConnection({ baseUrl: 'http://page.test', workspaceId: 'demo', name: 'demo', fetch: server.fetchImpl, storage })
    expect(second.live.cursor).toBe('ep1:4')
    await second.ready
    await until(() => server.lives.length === 2)
    expect(server.lives[1]!.headers.get('last-event-id')).toBe('ep1:4')
    second.live.close()
  })

  test('a different workspace does not inherit the cursor', async () => {
    const storage = memory()
    storage.setItem('theorem-ide-cm.live-cursor.demo', 'ep1:4')
    const server = fakeServer()
    const other = new WorkspaceConnection({ baseUrl: 'http://page.test', workspaceId: 'other', name: 'other', fetch: server.fetchImpl, storage })
    expect(other.live.cursor).toBeUndefined()
    other.live.close()
  })

  test('failing storage never breaks the connection', async () => {
    const broken = {
      getItem: () => {
        throw new Error('blocked')
      },
      setItem: () => {
        throw new Error('blocked')
      },
    }
    const server = fakeServer()
    const connection = new WorkspaceConnection({ baseUrl: 'http://page.test', workspaceId: 'demo', name: 'demo', fetch: server.fetchImpl, storage: broken })
    await connection.ready
    expect(connection.live.cursor).toBeUndefined()
    expect(() => connection.saveCursor()).not.toThrow()
    connection.live.close()
  })

  test('a resync tells the listener why and moves the cursor to the host epoch', async () => {
    const server = fakeServer()
    const connection = new WorkspaceConnection({ baseUrl: 'http://page.test', workspaceId: 'demo', name: 'demo', fetch: server.fetchImpl })
    await connection.ready
    await until(() => server.lives.length === 1)
    const reasons: string[] = []
    connection.live.onResync((r) => void reasons.push(r.reason))
    server.lives[0]!.push(hello('ep1:0'))
    server.lives[0]!.push({ kind: 'resync', cursor: 'ep2:0', data: { reason: 'epoch_changed', epoch: 'ep2', cursor: 'ep2:0' } })
    await until(() => reasons.length === 1)
    expect(reasons).toEqual(['epoch_changed'])
    expect(connection.live.cursor).toBe('ep2:0')
    connection.live.close()
  })
  describe('a host that restarted', () => {
    // The host keeps the workspace on disk but has none open until it is asked, and answers
    // `workspace_not_open` (404) to everything meanwhile. The SDK takes a 404 on the live stream as final.
    const list = async (connection: WorkspaceConnection) =>
      connection.client.ide.workspace.filesList({ ...(await connection.headers()), body: {} })

    test('the live stream reopens the workspace and resumes from its cursor', async () => {
      const server = fakeServer({ 'a.txt': 'a' })
      const connection = await connect(server)
      server.lives[0]!.push({ kind: 'file.changed', cursor: 'ep1:4', data: { path: 'a.txt', change: 'changed', directory: false } })
      await until(() => connection.live.cursor === 'ep1:4')

      server.restartHost()
      await until(() => server.lives.length === 2, 'a second live stream')
      expect(server.opens).toHaveLength(2)
      expect(server.lives[1]!.headers.get('last-event-id')).toBe('ep1:4')
      expect(connection.live.state).not.toBe('closed')
      connection.live.close()
    })

    test('an operation the host refused as not open is repeated once the workspace is reopened', async () => {
      const server = fakeServer({ 'a.txt': 'a' })
      const connection = await connect(server)
      server.restartHost()
      const listing = (await list(connection)) as { files: { path: string }[] }
      expect(listing.files.map((f) => f.path)).toEqual(['a.txt'])
      expect(server.opens).toHaveLength(2)
      connection.live.close()
    })

    test('requests that find it closed together reopen it once', async () => {
      const server = fakeServer({ 'a.txt': 'a' })
      const connection = await connect(server)
      server.restartHost()
      await Promise.all([list(connection), list(connection), list(connection)])
      expect(server.opens).toHaveLength(2)
      connection.live.close()
    })

    test('the repeated request carries the CSRF token the reopen was given', async () => {
      const server = fakeServer({ 'a.txt': 'a' })
      const connection = await connect(server)
      const stale = await connection.headers()
      expect(stale['X-CSRF-Token']).toBe('csrf-9')
      server.restartHost('csrf-10')
      await connection.client.ide.workspace.filesList({ ...stale, body: {} })
      expect(server.operations.at(-1)!.csrf).toBe('csrf-10')
      expect((await connection.headers())['X-CSRF-Token']).toBe('csrf-10')
      connection.live.close()
    })

    test('any other 404 is the caller\'s answer and reopens nothing', async () => {
      const server = fakeServer()
      const connection = await connect(server)
      const read = async () => connection.client.ide.workspace.filesRead({ ...(await connection.headers()), body: { path: 'missing.txt' } })
      await expect(read()).rejects.toMatchObject({ statusCode: 404 })
      expect(server.opens).toHaveLength(1)
      connection.live.close()
    })
  })

  describe('documents after the host lost its sessions', () => {
    // Found live: after a restart the authority keeps its revision (r5) but the new process has no
    // session for the document, judges an edit against revision 0 and refuses `stale_revision` with
    // `current_revision: 0`. The SDK reads the history after its own revision (empty) and sends the
    // same edit again at once: thousands of requests, no end. The connection seats the documents it
    // holds when it reopens the workspace, and bounds the rest.
    const edits = (server: ReturnType<typeof fakeServer>) => server.operations.filter((o) => o.name === 'documents.edit')
    const opened = (server: ReturnType<typeof fakeServer>) => server.operations.filter((o) => o.name === 'documents.open')
    const insertAt = (at: number, insert: string) => [{ start: at, end: at, insert }]

    test('a restart reopens the workspace and seats the open document, so the next edit is accepted', async () => {
      const server = fakeServer({ 'a.txt': 'hello' })
      const connection = await connect(server)
      const { session } = await connection.acquire('a.txt')
      session.edit(insertAt(5, ' world'))
      await until(() => !session.pending, 'the first edit accepted')
      expect(session.revision).toBe(1)

      server.restartHost()
      session.edit(insertAt(11, '!'))
      await until(() => !session.pending, 'the edit made after the restart accepted')

      expect(session.revision).toBe(2)
      expect(server.documents.get('a.txt')).toMatchObject({ revision: 2, text: 'hello world!' })
      expect(opened(server)).toHaveLength(2)
      // One edit before the restart and one after: seated on reopen, so nothing was refused and repeated.
      expect(edits(server)).toHaveLength(2)
      connection.live.close()
    })

    test('a document the process forgot is seated again and the edit repeated once', async () => {
      const server = fakeServer({ 'a.txt': 'hello' })
      const connection = await connect(server)
      const { session } = await connection.acquire('a.txt')
      session.edit(insertAt(5, ' world'))
      await until(() => !session.pending, 'the first edit accepted')

      server.unseat('a.txt')
      session.edit(insertAt(11, '!'))
      await until(() => !session.pending, 'the edit accepted after seating')

      expect(session.revision).toBe(2)
      expect(server.documents.get('a.txt')!.text).toBe('hello world!')
      expect(edits(server)).toHaveLength(3)
      expect(opened(server)).toHaveLength(2)
      connection.live.close()
    })

    test('an authority that is still behind gets one repeat, then the session shows its text instead of sending again', async () => {
      const server = fakeServer({ 'a.txt': 'hello' })
      const connection = await connect(server)
      const { session } = await connection.acquire('a.txt')
      session.edit(insertAt(5, ' world'))
      await until(() => !session.pending, 'the first edit accepted')
      const refused: unknown[] = []
      session.onError((error) => refused.push(error))

      server.rollBack('a.txt')
      session.edit(insertAt(11, '!'))
      await until(() => refused.length === 1, 'the refusal reported')

      expect(edits(server)).toHaveLength(3)
      expect(refused[0]).toMatchObject({ body: { code: 'authority_behind' } })
      expect(session.pending).toBe(false)
      expect(session.revision).toBe(0)
      expect(session.text).toBe('hello')
      connection.live.close()
    })

    test('a stale revision the session can catch up from is left to the SDK', async () => {
      const server = fakeServer({ 'a.txt': 'hello' })
      const connection = await connect(server)
      const { session } = await connection.acquire('a.txt')
      server.foreignEdit('a.txt', 5, ' there')
      session.edit(insertAt(5, ' world'))
      await until(() => !session.pending && session.revision === 2, 'the edit accepted after catching up')

      expect(opened(server)).toHaveLength(1)
      expect(edits(server)).toHaveLength(2)
      expect(server.documents.get('a.txt')!.revision).toBe(2)
      connection.live.close()
    })
  })

  describe('a consumer that cannot re-read after a resync', () => {
    // Found live (I02, 2026-11-01): a shell dies with the host, so after a restart the SDK's terminal
    // channel re-reads on the resync and the host answers 409 `host_operation_failed` ("pty session
    // not found"). WorkspaceLive awaits every resync listener inside the loop that reads the stream
    // and takes a rejection as the stream failing: it reconnects at the SAME cursor, whose epoch the
    // host no longer knows, gets the same resync, and the same rejection. Every hello resets its
    // back-off, so that is about four rounds a second, for ever, with no live event delivered.
    const resync = (cursor: string) => {
      const [epoch] = cursor.split(':')
      return { kind: 'resync', cursor, data: { reason: 'epoch_changed', epoch, cursor } }
    }
    const changed = (cursor: string, path: string) => ({ kind: 'file.changed', cursor, data: { path, change: 'changed', directory: false } })

    test('a listener that rejects does not stop the cursor, the other listeners or the events after it', async () => {
      const server = fakeServer()
      const failures: unknown[] = []
      const connection = await connect(server, { onResyncError: (error) => void failures.push(error) })
      const seen: string[] = []
      connection.live.onResync(() => {
        throw new Error('cannot re-read')
      })
      connection.live.onResync((r) => void seen.push(r.reason))
      connection.live.on('file.changed', ({ data }) => void seen.push(data.path))

      server.lives[0]!.push(resync('ep2:1'))
      server.lives[0]!.push(changed('ep2:2', 'a.txt'))
      await until(() => connection.live.cursor === 'ep2:2', 'the cursor in the new epoch, past the failing listener')

      expect(seen).toEqual(['epoch_changed', 'a.txt'])
      expect(failures).toHaveLength(1)
      expect(failures[0]).toMatchObject({ message: 'cannot re-read' })
      expect(server.lives).toHaveLength(1)
      connection.live.close()
    })

    test('a shell that died with the host: the stream resumes in the new epoch once and stays', async () => {
      const server = fakeServer()
      const failures: unknown[] = []
      const connection = await connect(server, { onResyncError: (error) => void failures.push(error) })
      const terminal = await TerminalChannel.open({ ...(await connection.channelOptions()), cols: 80, rows: 24 })
      await terminal.attach()

      server.restartHost()
      await until(() => server.lives.length === 2, 'the stream reconnecting')
      server.lives[1]!.push(hello('ep2:1'))
      server.lives[1]!.push(resync('ep2:1'))
      await until(() => connection.live.cursor === 'ep2:1' && connection.live.state === 'open', 'the stream open in the new epoch')

      // Two back-off periods later: still the one connection, not a reconnect for every round.
      await new Promise((done) => setTimeout(done, 600))
      expect(server.lives).toHaveLength(2)
      expect(failures).toHaveLength(1)
      expect(failures[0]).toMatchObject({ statusCode: 409 })
      expect(server.operations.filter((o) => o.name === 'terminal.attach')).toHaveLength(2)
      connection.live.close()
    })
  })
})
