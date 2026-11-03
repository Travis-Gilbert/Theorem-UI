// SOURCING: bun:test over the control channel, driven by a fake host on
// in-memory streams (test/desktop.ts).
import { describe, expect, test } from 'bun:test'
import { JSONRPCErrorException } from 'json-rpc-2.0'
import type { HostEvent } from '#/lib/desktop/bindings/HostEvent'
import { settle, startFakeHost } from '../../../test/desktop'
import { callHost, onHostEvent, sendToHost } from './control'
import { currentGrants } from './grants'

const notes = { path: '/Users/me/Notes', name: 'Notes' }

describe('control channel', () => {
  test('hello and grants replace the grants', async () => {
    const host = startFakeHost()
    host.send({ ctl: 'hello', secret: 'one-time', grants: [notes] })
    await settle()
    expect(currentGrants()).toEqual([notes])
    host.send({ ctl: 'grants', grants: [] })
    await settle()
    expect(currentGrants()).toEqual([])
  })

  test('sendToHost writes one control line and nothing else', async () => {
    const host = startFakeHost()
    sendToHost({ ctl: 'ready', port: 4317, blockPort: 4318 })
    await settle()
    expect(host.received).toEqual([
      { ctl: 'ready', port: 4317, blockPort: 4318 },
    ])
    expect(host.stray).toEqual([])
  })

  test('a relayed call settles with the matching rpc-result', async () => {
    const host = startFakeHost()
    host.answer = (call) =>
      call.method === 'pickFolder'
        ? { result: notes }
        : { error: { code: -32001, message: 'not granted' } }
    expect(await callHost({ method: 'pickFolder', params: {} })).toEqual(notes)
    const error = await callHost({
      method: 'revealInFinder',
      params: { path: '/etc' },
    }).catch((reason: unknown) => reason)
    expect(error).toBeInstanceOf(JSONRPCErrorException)
    expect(error).toMatchObject({ code: -32001, message: 'not granted' })
    expect(host.received.map((message) => message.ctl)).toEqual(['rpc', 'rpc'])
  })

  test('calls get distinct ids and answers may come in any order', async () => {
    const host = startFakeHost()
    host.answer = () => undefined
    const first = callHost({
      method: 'openExternal',
      params: { url: 'https://a.example' },
    })
    const second = callHost({
      method: 'openExternal',
      params: { url: 'https://b.example' },
    })
    await settle()
    const [a, b] = host.received
    if (a?.ctl !== 'rpc' || b?.ctl !== 'rpc')
      throw new Error('expected two calls')
    expect(a.id).not.toBe(b.id)
    host.send({ ctl: 'rpc-result', id: b.id, result: 'b', error: null })
    host.send({ ctl: 'rpc-result', id: a.id, result: 'a', error: null })
    expect(await Promise.all([first, second])).toEqual(['a', 'b'])
  })

  test('an unanswered call fails with RpcError::FAILED after its timeout', async () => {
    const host = startFakeHost()
    host.answer = () => undefined
    const error = await callHost(
      { method: 'setDocumentEdited', params: { edited: true } },
      20,
    ).catch((reason: unknown) => reason)
    expect(error).toBeInstanceOf(JSONRPCErrorException)
    expect(error).toMatchObject({ code: -32002 })
  })

  test('events reach listeners; grantsChanged updates the grants instead', async () => {
    const host = startFakeHost()
    const seen: Array<HostEvent> = []
    const unsubscribe = onHostEvent((event) => seen.push(event))
    host.send({
      ctl: 'event',
      event: { type: 'fileSaved', path: '/Users/me/Notes/a.md' },
    })
    host.send({
      ctl: 'event',
      event: { type: 'grantsChanged', grants: [notes] },
    })
    await settle()
    unsubscribe()
    host.send({
      ctl: 'event',
      event: { type: 'fileSaved', path: '/Users/me/Notes/b.md' },
    })
    await settle()
    expect(seen).toEqual([{ type: 'fileSaved', path: '/Users/me/Notes/a.md' }])
    expect(currentGrants()).toEqual([notes])
  })

  test('ignores lines that are not control messages', async () => {
    const host = startFakeHost()
    host.write('not json\n{"ctl":"hello"}\n\n')
    host.send({ ctl: 'grants', grants: [notes] })
    await settle()
    expect(currentGrants()).toEqual([notes])
  })

  test('reports the end of stdin', async () => {
    const host = startFakeHost()
    host.end()
    await settle()
    expect(host.closed).toBe(true)
  })
})
