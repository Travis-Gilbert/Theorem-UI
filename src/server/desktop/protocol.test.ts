// SOURCING: bun:test over the control-line schemas and their encoding, with
// expectTypeOf holding each schema to its ts-rs generated type.
import { describe, expect, expectTypeOf, test } from 'bun:test'
import type { z } from 'zod'
import type { HostCall } from '#/lib/desktop/bindings/HostCall'
import type { HostEvent } from '#/lib/desktop/bindings/HostEvent'
import type { ToHost } from '#/lib/desktop/bindings/ToHost'
import type { ToServer } from '#/lib/desktop/bindings/ToServer'
import type { hostEventSchema } from './protocol'
import {
  HOST_CALL_METHODS,
  encodeLine,
  hostCallSchema,
  parseLine,
  toHostSchema,
  toServerSchema,
} from './protocol'

describe('schemas', () => {
  test('parse exactly the generated types', () => {
    expectTypeOf<z.output<typeof hostEventSchema>>().toEqualTypeOf<HostEvent>()
    expectTypeOf<z.output<typeof toServerSchema>>().toEqualTypeOf<ToServer>()
    // ts-rs writes pickFolder's empty params as Record<symbol, never> and zod
    // as Record<string, never>; both mean no fields, so these two are held to
    // assignability both ways instead of identity.
    expectTypeOf<z.output<typeof hostCallSchema>>().toExtend<HostCall>()
    expectTypeOf<HostCall>().toExtend<z.input<typeof hostCallSchema>>()
    expectTypeOf<z.output<typeof toHostSchema>>().toExtend<ToHost>()
    expectTypeOf<ToHost>().toExtend<z.input<typeof toHostSchema>>()
  })

  test('list every bridge method', () => {
    expect(HOST_CALL_METHODS).toEqual([
      'pickFolder',
      'openNativeEditor',
      'revealInFinder',
      'openExternal',
      'setDocumentEdited',
      'notify',
    ])
    expectTypeOf(HOST_CALL_METHODS).toEqualTypeOf<Array<HostCall['method']>>()
  })

  test('drop unknown params and fill an absent notify body', () => {
    expect(
      hostCallSchema.parse({ method: 'pickFolder', params: { extra: 1 } }),
    ).toEqual({ method: 'pickFolder', params: {} })
    expect(
      hostCallSchema.parse({ method: 'notify', params: { title: 'Saved' } }),
    ).toEqual({ method: 'notify', params: { title: 'Saved', body: null } })
  })
})

describe('control lines', () => {
  test('ready is the line the host crate expects', () => {
    // desktop/protocol/src/lib.rs, test `ready_line_is_camel_case`.
    expect(encodeLine({ ctl: 'ready', port: 4000, blockPort: 4001 })).toBe(
      '{"ctl":"ready","port":4000,"blockPort":4001}\n',
    )
  })

  test('a message is one line, whatever its strings hold', () => {
    const line = encodeLine({
      ctl: 'rpc',
      id: 7,
      call: { method: 'notify', params: { title: 'a\nb', body: 'c\r\nd' } },
    })
    expect(line.indexOf('\n')).toBe(line.length - 1)
    expect(parseLine(toHostSchema, line)).toEqual({
      ctl: 'rpc',
      id: 7,
      call: { method: 'notify', params: { title: 'a\nb', body: 'c\r\nd' } },
    })
  })

  test('every ToServer message survives the round trip', () => {
    const grants = [{ path: '/Users/me/Notes', name: 'Notes' }]
    const messages: Array<ToServer> = [
      { ctl: 'hello', secret: 's3cret', grants },
      { ctl: 'grants', grants: [] },
      {
        ctl: 'rpc-result',
        id: 1,
        result: { path: '/x', name: 'x' },
        error: null,
      },
      {
        ctl: 'rpc-result',
        id: 2,
        result: null,
        error: { code: -32001, message: 'no' },
      },
      {
        ctl: 'event',
        event: { type: 'fileSaved', path: '/Users/me/Notes/a.md' },
      },
      { ctl: 'event', event: { type: 'grantsChanged', grants } },
    ]
    for (const message of messages) {
      expect(parseLine(toServerSchema, encodeLine(message))).toEqual(message)
    }
  })

  test('anything else reads as a log line', () => {
    expect(parseLine(toServerSchema, '')).toBeUndefined()
    expect(
      parseLine(toServerSchema, '➜ Listening on: http://127.0.0.1:4000/'),
    ).toBeUndefined()
    expect(parseLine(toServerSchema, '{"ctl":"hello"')).toBeUndefined()
    expect(
      parseLine(toServerSchema, '{"ctl":"shout","grants":[]}'),
    ).toBeUndefined()
    // An empty secret would let `?secret=` open a session.
    expect(
      parseLine(toServerSchema, '{"ctl":"hello","secret":"","grants":[]}'),
    ).toBeUndefined()
    expect(
      parseLine(
        toHostSchema,
        '{"ctl":"rpc","id":1,"call":{"method":"format","params":{}}}',
      ),
    ).toBeUndefined()
  })
})
