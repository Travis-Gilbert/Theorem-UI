import {
  afterAll,
  afterEach,
  beforeAll,
  expect,
  jest,
  spyOn,
  test,
} from 'bun:test'
import { memoryWorkspace } from '../../../test/blocks/memory-workspace'
import { acquireBlockSession, blockSessionFor, sessionsOf } from './sessions'
import { setFolderTrust } from './trust'

// The sessions bind the page's state replica, which talks to the local
// server: here it finds an empty state and a stream that never speaks.
class SilentEventSource {
  onopen: (() => void) | null = null
  onmessage: (() => void) | null = null
  close() {}
}
const realEventSource = globalThis.EventSource
const fetchSpy = spyOn(globalThis, 'fetch')
beforeAll(() => {
  globalThis.EventSource = SilentEventSource as unknown as typeof EventSource
  fetchSpy.mockImplementation(
    (async () => new Response(new Uint8Array())) as unknown as typeof fetch,
  )
})
afterAll(() => {
  globalThis.EventSource = realEventSource
  fetchSpy.mockRestore()
})
afterEach(() => {
  jest.useRealTimers()
})

test('views of one file share a session, closed a while after the last goes', () => {
  jest.useFakeTimers()
  const client = memoryWorkspace({ 'Note.md': '# Note\n' })
  const first = acquireBlockSession(client, 'Note.md', 'document')
  const second = acquireBlockSession(client, 'Note.md', 'document')
  expect(second.session).toBe(first.session)
  const tool = acquireBlockSession(client, 'Note.md', 'tool')
  expect(tool.session).not.toBe(first.session)
  tool.release()

  first.release()
  first.release()
  jest.advanceTimersByTime(60_000)
  expect(sessionsOf(client)).toContain(first.session)

  second.release()
  // A remount inside the grace period finds the same graph.
  const again = acquireBlockSession(client, 'Note.md', 'document')
  jest.advanceTimersByTime(60_000)
  expect(again.session).toBe(first.session)
  again.release()
  jest.advanceTimersByTime(60_000)
  expect(sessionsOf(client)).not.toContain(first.session)
  expect(blockSessionFor(client, 'Note.md', 'document')).not.toBe(first.session)
})

test('trusting a folder reaches its open sessions', async () => {
  const client = memoryWorkspace({ 'Note.md': '# Note\n' }, { trusted: false })
  const { session, release } = acquireBlockSession(
    client,
    'Note.md',
    'document',
  )
  let refreshed = 0
  const refreshTrust = session.refreshTrust.bind(session)
  session.refreshTrust = () => {
    refreshed++
    refreshTrust()
  }
  await setFolderTrust(client, true)
  expect(client.workspace.trusted).toBe(true)
  expect(refreshed).toBe(1)
  release()
})
