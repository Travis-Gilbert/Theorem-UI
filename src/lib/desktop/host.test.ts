// SOURCING: bun:test over the page side of the bridge. Outside a Start build
// createIsomorphicFn runs its server branch, so getDesktopHost() here reads
// desktop mode from the environment, as server rendering does.
import { afterEach, describe, expect, test } from 'bun:test'
import {
  TEST_ORIGIN,
  startFakeHost,
  useDesktopEnv,
} from '../../../test/desktop'
import rpc from '#/server/desktop/rpc'
import type { HostCall } from './bindings/HostCall'
import {
  DESKTOP_DOCUMENT_ATTRIBUTE,
  getDesktopHost,
  hasDesktopDocumentFlag,
} from './host'

const notes = { path: '/Users/me/Notes', name: 'Notes' }

describe('getDesktopHost', () => {
  useDesktopEnv()
  const browserFetch = globalThis.fetch
  afterEach(() => {
    globalThis.fetch = browserFetch
    document.documentElement.removeAttribute(DESKTOP_DOCUMENT_ATTRIBUTE)
  })

  test('is null outside desktop mode', () => {
    delete process.env.THEOREM_DESKTOP
    expect(getDesktopHost()).toBeNull()
  })

  test('exists in desktop mode, one instance per page', () => {
    const host = getDesktopHost()
    expect(host).not.toBeNull()
    expect(getDesktopHost()).toBe(host)
  })

  test('the browser reads desktop mode from the root document flag', () => {
    expect(hasDesktopDocumentFlag()).toBe(false)
    document.documentElement.setAttribute(DESKTOP_DOCUMENT_ATTRIBUTE, '')
    expect(hasDesktopDocumentFlag()).toBe(true)
  })

  test('calls round-trip through the relay to the host', async () => {
    const fake = startFakeHost()
    fake.answer = (call) =>
      call.method === 'pickFolder'
        ? { result: notes }
        : call.method === 'openNativeEditor'
          ? { error: { code: -32001, message: 'Not inside a granted folder' } }
          : { result: null }
    // A browser resolves the path against the page and names the page's origin.
    globalThis.fetch = (async (input: string, init: RequestInit) =>
      rpc.fetch(
        new Request(new URL(input, TEST_ORIGIN), {
          ...init,
          headers: {
            ...(init.headers as Record<string, string>),
            origin: TEST_ORIGIN,
          },
        }),
      )) as typeof fetch

    const host = getDesktopHost()
    if (!host) throw new Error('expected the desktop host')
    expect(await host.pickFolder()).toEqual(notes)
    expect(await host.notify('Saved')).toBeUndefined()
    expect(await host.setDocumentEdited(true)).toBeUndefined()
    await expect(host.openNativeEditor('/etc/hosts')).rejects.toMatchObject({
      code: -32001,
      message: 'Not inside a granted folder',
    })

    const calls: Array<HostCall> = fake.received.flatMap((message) =>
      message.ctl === 'rpc' ? [message.call] : [],
    )
    expect(calls).toEqual([
      { method: 'pickFolder', params: {} },
      { method: 'notify', params: { title: 'Saved', body: null } },
      { method: 'setDocumentEdited', params: { edited: true } },
      { method: 'openNativeEditor', params: { path: '/etc/hosts' } },
    ])
  })
})
