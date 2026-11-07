import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import type { ThreadMessage } from '@assistant-ui/react'
import type { Theorem } from '@theoremharness/sdk'
import { toAssistantMessages } from '@theoremharness/sdk/assistant-ui'
import { KitRefusal, setKitDriver } from './driver'
import type { KitDriver } from './driver'
import {
  GAITS,
  GESTURES,
  KIT_OPERATIONS,
  MAX_SAYING,
  applyKitRequest,
  kitRequestsOf,
  kitTurnOptions,
  resetKitRequests,
  serveKitRequests,
} from './operations'
import type { KitRequest, Receipt } from './operations'
import { PERCHES, changeStage, resetKitStage, useKitStage } from './stage'
import { resetKit } from './store'

/** A client operation part on a live run's message, as the installed SDK maps it onto assistant-ui. */
const liveMessage = (
  parts: Array<Record<string, unknown>>,
  runId: string | null = 'run_1',
): ThreadMessage => {
  const [mapped] = toAssistantMessages([
    {
      messageId: 'live',
      role: 'assistant',
      createdAtMs: 0,
      parts: parts.map((fields, index) => {
        const partId = `chatpart_${index}`
        return {
          partId,
          type: 'client_operation',
          payload: {
            type: 'client_operation',
            partId,
            expectedRevision: 0,
            state: 'pending',
            ...fields,
          },
        }
      }),
    } as unknown as Theorem.Message,
  ])
  return {
    ...mapped,
    metadata: { custom: runId ? { theoremRunId: runId } : {} },
  } as unknown as ThreadMessage
}

/** A driver that answers moves as told, so operations run without layout or animation. */
const fakeDriver = (answer: () => Promise<boolean>) => {
  const moves: unknown[][] = []
  const driver = {
    moveTo: (...args: unknown[]) => {
      moves.push(args)
      return answer()
    },
  } as unknown as KitDriver
  setKitDriver(driver)
  return moves
}

beforeEach(() => {
  resetKitStage()
  resetKit()
  resetKitRequests()
  changeStage({ mounted: true })
})
afterEach(() => setKitDriver(undefined))

describe('what a send declares', () => {
  test('nothing while Kit is off screen', () => {
    changeStage({ mounted: false })
    expect(kitTurnOptions()).toEqual({})
  })

  test('the operations and the revision while it is on screen', () => {
    const options = kitTurnOptions()
    expect(options.clientOperations.map((operation) => operation.name)).toEqual(
      ['kit.move', 'kit.gesture', 'kit.say', 'kit.look'],
    )
    expect(options.clientSurface).toEqual({
      revision: useKitStage.getState().revision,
    })
  })

  test('each declaration fits Theorem and tells the model what Kit is', () => {
    for (const operation of KIT_OPERATIONS) {
      expect(operation.name).toMatch(/^[a-z][a-z0-9_.]{2,63}$/)
      expect(operation.description).toContain('pixel fox')
      expect(['read', 'presentation']).toContain(operation.effect)
    }
  })

  test("what the page accepts is what Theorem's contract declares", () => {
    const schema = (name: string) =>
      KIT_OPERATIONS.find((operation) => operation.name === name)!
        .inputSchema as {
        properties: Record<string, { enum?: string[]; maxLength?: number }>
      }
    const move = schema('kit.move').properties
    expect(move.to!.enum).toEqual([...PERCHES])
    expect(move.gait!.enum).toEqual([...GAITS])
    expect(schema('kit.gesture').properties.gesture!.enum).toEqual([
      ...GESTURES,
    ])
    expect(schema('kit.say').properties.text!.maxLength).toBe(MAX_SAYING)
  })
})

describe("reading Kit's requests off the live turn", () => {
  test('pending kit requests, with the run that made them', () => {
    const message = liveMessage([
      { requestRef: 'req_1', operation: 'kit.move', args: { to: 'rail' } },
      { requestRef: 'req_2', operation: 'kit.say', args: { text: 'hi' } },
    ])
    expect(kitRequestsOf([message], true)).toEqual([
      {
        runId: 'run_1',
        requestRef: 'req_1',
        operation: 'kit.move',
        args: { to: 'rail' },
      },
      {
        runId: 'run_1',
        requestRef: 'req_2',
        operation: 'kit.say',
        args: { text: 'hi' },
      },
    ])
  })

  test("leaves answered requests and other pages' operations alone", () => {
    const message = liveMessage([
      { requestRef: 'req_1', operation: 'kit.move', state: 'answered' },
      { requestRef: 'req_2', operation: 'canvas.focus' },
    ])
    expect(kitRequestsOf([message], true)).toEqual([])
  })

  test('nothing once the turn stops, or without a run to answer', () => {
    const parts = [{ requestRef: 'req_1', operation: 'kit.look' }]
    expect(kitRequestsOf([liveMessage(parts)], false)).toEqual([])
    expect(kitRequestsOf([liveMessage(parts, null)], true)).toEqual([])
  })
})

describe('carrying out a request', () => {
  test('refuses while Kit is off screen, but still looks', async () => {
    changeStage({ mounted: false })
    expect(
      (
        await applyKitRequest({
          operation: 'kit.gesture',
          args: { gesture: 'wave' },
        })
      ).outcome,
    ).toBe('rejected')
    expect(
      (await applyKitRequest({ operation: 'kit.look', args: {} })).outcome,
    ).toBe('applied')
  })

  test('checks arguments itself', async () => {
    fakeDriver(async () => true)
    const reject = async (operation: string, args: Record<string, unknown>) =>
      (await applyKitRequest({ operation, args })).outcome
    expect(await reject('kit.move', { to: 'moon' })).toBe('rejected')
    expect(await reject('kit.gesture', { gesture: 'backflip' })).toBe(
      'rejected',
    )
    expect(await reject('kit.say', { text: '   ' })).toBe('rejected')
    expect(await reject('kit.say', { text: 'x'.repeat(MAX_SAYING + 1) })).toBe(
      'rejected',
    )
    expect(await reject('kit.fly', {})).toBe('rejected')
  })

  test('a gesture and a line show on the stage for a while', async () => {
    await applyKitRequest(
      { operation: 'kit.gesture', args: { gesture: 'celebrate' } },
      1000,
    )
    await applyKitRequest(
      { operation: 'kit.say', args: { text: ' Found it ' } },
      1000,
    )
    const { gesture, speech } = useKitStage.getState()
    expect(gesture).toMatchObject({ tag: 'celebrate', since: 1000, once: true })
    expect(gesture!.until).toBeGreaterThan(1000)
    expect(speech).toMatchObject({ text: 'Found it' })
    expect(speech!.until).toBeGreaterThan(1000 + 2000)
  })

  test('a move goes to the driver with its defaults filled in', async () => {
    const moves = fakeDriver(async () => true)
    expect(
      await applyKitRequest({
        operation: 'kit.move',
        args: { to: 'floor', at: 4 },
      }),
    ).toEqual({ outcome: 'applied' })
    expect(moves).toEqual([['floor', 1, 'walk']])
  })

  test('a move cut short is interrupted; one the driver refuses is rejected', async () => {
    fakeDriver(async () => false)
    expect(
      (await applyKitRequest({ operation: 'kit.move', args: { to: 'rail' } }))
        .outcome,
    ).toBe('interrupted')
    fakeDriver(async () => {
      throw new KitRefusal('the person is holding Kit')
    })
    expect(
      await applyKitRequest({ operation: 'kit.move', args: { to: 'rail' } }),
    ).toEqual({
      outcome: 'rejected',
      reason: 'the person is holding Kit',
    })
  })
})

describe('answering the run', () => {
  const request = (
    requestRef: string,
    operation: string,
    args: Record<string, unknown> = {},
  ): KitRequest => ({
    runId: 'run_1',
    requestRef,
    operation,
    args,
  })

  test('each request once, in order, with the scene it left', async () => {
    const order: string[] = []
    let finish: (landed: boolean) => void = () => {}
    fakeDriver(() => {
      order.push('move started')
      return new Promise((resolve) => (finish = resolve))
    })
    const posted: Array<[string, Receipt]> = []
    const post = async (made: KitRequest, receipt: Receipt) => {
      order.push(`answered ${made.requestRef}`)
      posted.push([made.requestRef, receipt])
    }
    const requests = [
      request('a', 'kit.move', { to: 'rail' }),
      request('b', 'kit.look'),
    ]
    const served = serveKitRequests(requests, post)
    void serveKitRequests(requests, post)
    await Bun.sleep(0)
    expect(order).toEqual(['move started'])
    finish(true)
    await served
    expect(order).toEqual(['move started', 'answered a', 'answered b'])
    const [, receipt] = posted[1]!
    expect(receipt.outcome).toBe('applied')
    expect(receipt.revision).toBe(useKitStage.getState().revision)
    expect(receipt.result).toMatchObject({
      perch: 'composer',
      revision: receipt.revision,
    })
  })

  test('an error on the page is a failed receipt, not a stuck run', async () => {
    fakeDriver(() => Promise.reject(new Error('layout went away')))
    const posted: Receipt[] = []
    await serveKitRequests(
      [request('a', 'kit.move', { to: 'rail' })],
      async (_, receipt) => {
        posted.push(receipt)
      },
    )
    expect(posted).toEqual([
      expect.objectContaining({
        outcome: 'failed',
        reason: 'layout went away',
      }),
    ])
  })
})
