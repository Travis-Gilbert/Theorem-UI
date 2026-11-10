// SOURCING: bun:test, a MessageChannel standing in for the frame's port (as
// src/lib/blocks/bridge.test.ts does), the block protocol's call and serve.
import { describe, expect, test } from 'bun:test'
import { call, rpcOver, serve } from '@/lib/blocks/sandbox/protocol'
import type {
  ModuleValues,
  PageMethods,
  SandboxMethods,
} from '@/lib/blocks/sandbox/protocol'
import type { PortSpec } from './contract'
import { grantFor, granted, moduleDigest } from './grants'
import {
  allowedFrom,
  bridgeCapabilities,
  describeRequest,
  requestsOf,
  sendAction,
  sendValues,
  serveModule,
} from './sandbox'

const outputs: PortSpec[] = [{ name: 'count', label: 'Count', type: 'number' }]
const events: PortSpec[] = [{ name: 'picked', label: 'Picked', type: 'text' }]

function connected() {
  const channel = new MessageChannel()
  const host = rpcOver(channel.port1)
  const frame = rpcOver(channel.port2)
  const published: Array<[string, unknown]> = []
  const sent: Array<[string, unknown]> = []
  const uses: number[] = []
  serveModule(host, {
    outputs,
    events,
    output: (name, value) => published.push([name, value]),
    emit: (name, payload) => sent.push([name, payload]),
    used: () => uses.push(1),
  })
  const close = () => {
    channel.port1.close()
    channel.port2.close()
  }
  return { host, frame, published, sent, uses, close }
}

const refused = (promise: Promise<unknown>) =>
  promise.then(
    () => false,
    () => true,
  )

describe('a sandboxed module', () => {
  test('publishes only the outputs and events its manifest declares', async () => {
    const { frame, published, sent, close } = connected()
    try {
      await call<PageMethods, 'module.output'>(frame, 'module.output', {
        name: 'count',
        value: 3,
      })
      await call<PageMethods, 'module.emit'>(frame, 'module.emit', {
        name: 'picked',
        payload: 'b',
      })
      expect(published).toEqual([['count', 3]])
      expect(sent).toEqual([['picked', 'b']])

      // Undeclared, the wrong type, and not a name at all: each is refused.
      expect(
        await refused(
          call<PageMethods, 'module.output'>(frame, 'module.output', {
            name: 'secret',
            value: 1,
          }),
        ),
      ).toBe(true)
      expect(
        await refused(
          call<PageMethods, 'module.output'>(frame, 'module.output', {
            name: 'count',
            value: 'three',
          }),
        ),
      ).toBe(true)
      expect(
        await refused(
          call<PageMethods, 'module.emit'>(frame, 'module.emit', {
            name: '../picked',
            payload: 'b',
          }),
        ),
      ).toBe(true)
      expect(
        await refused(
          call<PageMethods, 'module.emit'>(frame, 'module.emit', {
            name: 'count',
            payload: 1,
          }),
        ),
      ).toBe(true)
      expect(published).toHaveLength(1)
      expect(sent).toHaveLength(1)
    } finally {
      close()
    }
  })

  test('is handed its settings and inputs', async () => {
    const { host, frame, close } = connected()
    const received: ModuleValues[] = []
    serve<SandboxMethods, 'module.inputs'>(frame, 'module.inputs', (values) => {
      received.push(values)
      return null
    })
    try {
      await sendValues(host, {
        settings: { label: 'x' },
        inputs: { item: undefined },
      })
      expect(received).toEqual([{ settings: { label: 'x' }, inputs: {} }])
    } finally {
      close()
    }
  })

  test('says when a person used it', async () => {
    const { frame, uses, close } = connected()
    try {
      await call<PageMethods, 'module.used'>(frame, 'module.used', {})
      expect(uses).toHaveLength(1)
    } finally {
      close()
    }
  })

  test('is handed the actions routes reach', async () => {
    const { host, frame, close } = connected()
    const received: Array<{ name: string; payload: unknown }> = []
    serve<SandboxMethods, 'module.action'>(frame, 'module.action', (action) => {
      received.push(action)
      return null
    })
    try {
      await sendAction(host, 'show', { id: 'd1' })
      expect(received).toEqual([{ name: 'show', payload: { id: 'd1' } }])
    } finally {
      close()
    }
  })

  test('reads its own folder, what was granted, and never starts agents', () => {
    expect(
      bridgeCapabilities(
        {
          read: ['Notes/**'],
          write: ['Notes/out.md'],
          state: ['rows'],
          net: ['api.example.com'],
        },
        'Modules/acme',
      ),
    ).toEqual({
      read: ['Notes/**', 'Modules/acme/**'],
      write: ['Notes/out.md'],
      state: ['rows'],
      net: ['api.example.com'],
      run: [],
      db: [],
    })
  })

  test('asks for each item on its own line, and is allowed only what is ticked', () => {
    const requested = {
      read: ['Notes/**'],
      write: [],
      state: ['rows'],
      net: ['api.example.com'],
    }
    const requests = requestsOf(requested)
    expect(requests.map(describeRequest)).toEqual([
      'Read Notes/**',
      'Keep state in “rows”',
      'Reach api.example.com over the network',
    ])
    const allowed = allowedFrom(requests.filter((r) => r.kind !== 'net'))
    expect(granted(requested, allowed)).toEqual({
      read: ['Notes/**'],
      write: [],
      state: ['rows'],
      net: [],
    })
    // Allowing something that was not asked for grants nothing.
    expect(
      granted(requested, { ...allowed, write: ['Notes/other.md'] }).write,
    ).toEqual([])
  })

  test('a grant holds for the exact files it was given for', async () => {
    const manifest = '{"id":"vault.acme"}'
    const digest = await moduleDigest(manifest, '<p>one</p>')
    expect(await moduleDigest(manifest, '<p>one</p>')).toBe(digest)
    const changed = await moduleDigest(manifest, '<p>two</p>')
    expect(changed).not.toBe(digest)
    // The separator keeps text from moving between the two files unnoticed.
    expect(await moduleDigest(`${manifest}<p>`, 'one</p>')).not.toBe(digest)

    const grants = {
      'ws|vault.acme': {
        digest,
        capabilities: { read: [], write: [], state: [], net: [] },
        grantedAt: 1,
      },
    }
    expect(grantFor(grants, 'ws|vault.acme', digest)).toBeDefined()
    expect(grantFor(grants, 'ws|vault.acme', changed)).toBeUndefined()
    expect(grantFor(grants, 'ws|vault.acme', undefined)).toBeUndefined()
    expect(grantFor(grants, 'other|vault.acme', digest)).toBeUndefined()
  })
})
