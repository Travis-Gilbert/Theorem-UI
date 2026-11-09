import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import type { ThreadMessage } from '@assistant-ui/react'
import { onlineManager } from '@tanstack/react-query'
import type { Theorem } from '@theoremharness/sdk'
import { toAssistantMessages } from '@theoremharness/sdk/assistant-ui'
import { KitRefusal, setKitDriver } from './driver'
import type { KitDriver } from './driver'
import {
  CHOREOGRAPHY_MS,
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
import {
  changeStage,
  messageLabel,
  messageSurface,
  resetKitStage,
  useKitStage,
} from './stage'
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

/** A driver that records every call by name and answers each as given. */
const recordingDriver = (answers: Record<string, () => unknown> = {}) => {
  const calls: Array<[string, ...unknown[]]> = []
  const driver = new Proxy(
    {},
    {
      get:
        (_, name: string) =>
        (...args: unknown[]) => {
          calls.push([name, ...args])
          const answer = answers[name]
          return answer
            ? answer()
            : name === 'follow' || name === 'interrupt'
              ? undefined
              : Promise.resolve(name === 'fling' ? 'floor' : true)
        },
    },
  ) as KitDriver
  setKitDriver(driver)
  return calls
}

/** A surface the shell would mark, measured where the test puts it. */
function surface(
  name: string,
  rect: { left: number; top: number; width: number; height: number },
  label?: string,
) {
  const element = document.createElement('div')
  element.dataset.kitPerch = name
  if (label) element.dataset.kitLabel = label
  element.getBoundingClientRect = () => ({
    ...rect,
    x: rect.left,
    y: rect.top,
    right: rect.left + rect.width,
    bottom: rect.top + rect.height,
    toJSON: () => ({}),
  })
  document.body.append(element)
  return element
}

beforeEach(() => {
  resetKitStage()
  resetKit()
  resetKitRequests()
  changeStage({ mounted: true })
})
afterEach(() => {
  setKitDriver(undefined)
  document.body.replaceChildren()
})

describe('what a send declares', () => {
  test('nothing while Kit is off screen', () => {
    changeStage({ mounted: false })
    expect(kitTurnOptions()).toEqual({})
  })

  test('the operations and the revision while it is on screen', () => {
    const options = kitTurnOptions()
    expect(options.clientOperations.map((operation) => operation.name)).toEqual(
      [
        'kit.move',
        'kit.jump',
        'kit.fling',
        'kit.point_at',
        'kit.follow',
        'kit.choreograph',
        'kit.gesture',
        'kit.say',
        'kit.look',
      ],
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
        properties: Record<
          string,
          { enum?: string[]; maxLength?: number; pattern?: string }
        >
      }
    const move = schema('kit.move').properties
    const to = new RegExp(move.to!.pattern!)
    for (const id of ['composer', 'rail', 'floor', messageSurface('msg_1')])
      expect(id).toMatch(to)
    expect(messageSurface('a b/c"d')).toMatch(to)
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
      await applyKitRequest({ operation: 'kit.move', args: { to: 'floor' } }),
    ).toEqual({ outcome: 'applied' })
    expect(moves).toEqual([['floor', 0.5, 'walk']])
  })

  test("arguments are read by the operation's own declaration", async () => {
    recordingDriver()
    const answer = (operation: string, args: Record<string, unknown>) =>
      applyKitRequest({ operation, args })
    expect(await answer('kit.move', { to: 'floor', at: 4 })).toMatchObject({
      outcome: 'rejected',
      reason: expect.stringContaining('at'),
    })
    expect(
      (await answer('kit.follow', { target: 'cursor', seconds: 3.5 })).outcome,
    ).toBe('rejected')
    expect(
      (await answer('kit.move', { to: 'rail', gait: 'walk', extra: 1 }))
        .outcome,
    ).toBe('rejected')
    expect(
      (await answer('kit.choreograph', { steps: [{ op: 'dance' }] })).outcome,
    ).toBe('rejected')
    expect((await answer('kit.choreograph', { steps: [] })).outcome).toBe(
      'rejected',
    )
  })

  test('jumps, flings and pointing go to the body with their defaults', async () => {
    surface('composer', { left: 100, top: 300, width: 400, height: 80 })
    const calls = recordingDriver()
    for (const [operation, args] of [
      ['kit.jump', { to: 'composer' }],
      ['kit.fling', { direction: 'up_left' }],
      ['kit.point_at', { target: 'composer' }],
    ] as const)
      expect(await applyKitRequest({ operation, args })).toEqual({
        outcome: 'applied',
      })
    expect(calls).toEqual([
      ['jumpTo', 'composer', 0.5, 'arc'],
      ['fling', 'up_left', 0.6],
      ['pointAt', 'composer'],
    ])
    expect(useKitStage.getState().gesture?.tag).toBe('point')
  })

  test('a jump that comes down elsewhere says where', async () => {
    recordingDriver({ jumpTo: async () => false })
    changeStage({ perch: 'floor' })
    expect(
      await applyKitRequest({ operation: 'kit.jump', args: { to: 'rail' } }),
    ).toEqual({
      outcome: 'interrupted',
      reason: 'Kit came down on floor instead: rail moved, or Kit was stopped',
    })
  })

  test('a follow answers as it starts, and only a surface on screen', async () => {
    const calls = recordingDriver()
    expect(
      await applyKitRequest({
        operation: 'kit.follow',
        args: { target: 'cursor' },
      }),
    ).toEqual({ outcome: 'applied' })
    expect(calls).toEqual([['follow', 'cursor', 8]])
    expect(
      (
        await applyKitRequest({
          operation: 'kit.follow',
          args: { target: 'message:gone' },
        })
      ).outcome,
    ).toBe('rejected')
  })
})

describe('a choreography', () => {
  test('plays its steps in order and reports each', async () => {
    const calls = recordingDriver()
    const started = Date.now()
    const answer = await applyKitRequest({
      operation: 'kit.choreograph',
      args: {
        steps: [
          { op: 'move', to: 'rail', gait: 'run' },
          { op: 'wait', ms: 60 },
          { op: 'say', text: 'here' },
          { op: 'fling', direction: 'up', strength: 0.2 },
        ],
      },
    })
    expect(Date.now() - started).toBeGreaterThanOrEqual(55)
    expect(answer).toEqual({
      outcome: 'applied',
      steps: [
        { op: 'move', outcome: 'applied' },
        { op: 'wait', outcome: 'applied' },
        { op: 'say', outcome: 'applied' },
        { op: 'fling', outcome: 'applied' },
      ],
    })
    expect(calls).toEqual([
      ['moveTo', 'rail', 0.5, 'run'],
      ['fling', 'up', 0.2],
    ])
    expect(useKitStage.getState().speech?.text).toBe('here')
  })

  test('a step that does not finish ends the piece; the rest are interrupted', async () => {
    const calls = recordingDriver({ moveTo: async () => false })
    const answer = await applyKitRequest({
      operation: 'kit.choreograph',
      args: {
        steps: [
          { op: 'say', text: 'watch' },
          { op: 'move', to: 'rail' },
          { op: 'jump', to: 'floor', style: 'leap' },
        ],
      },
    })
    expect(answer.outcome).toBe('interrupted')
    expect(answer.steps?.map((step) => step.outcome)).toEqual([
      'applied',
      'interrupted',
      'interrupted',
    ])
    expect(answer.steps?.[2]?.reason).toBe('step 2 (move) did not finish')
    expect(calls.map(([name]) => name)).toEqual(['moveTo'])
  })

  test('it never outlasts what a visitor waits for a receipt', () => {
    expect(CHOREOGRAPHY_MS).toBeLessThan(20_000)
    const choreograph = KIT_OPERATIONS.find(
      (operation) => operation.name === 'kit.choreograph',
    )!.inputSchema as { properties: { steps: { maxItems: number } } }
    expect(choreograph.properties.steps.maxItems).toBe(8)
  })
})

describe('what the scene reports', () => {
  test('the messages showing, with labels, between the rail and the floor', async () => {
    surface('composer', { left: 100, top: 600, width: 400, height: 80 })
    surface(
      messageSurface('m1'),
      { left: 100, top: 120, width: 600, height: 90 },
      messageLabel('assistant', 'Here is the plan for the week'),
    )
    surface(messageSurface('m2'), { left: 100, top: 0, width: 0, height: 0 })
    const posted: Receipt[] = []
    await serveKitRequests(
      [{ runId: 'run_1', requestRef: 'r', operation: 'kit.look', args: {} }],
      async (_, receipt) => {
        posted.push(receipt)
      },
    )
    expect(posted[0]!.result.surfaces).toEqual([
      { id: 'composer', kind: 'composer' },
      {
        id: 'message:m1',
        kind: 'message',
        label: 'your reply: Here is the plan for the week',
      },
      { id: 'floor', kind: 'floor' },
    ])
  })

  test("the person's last touch, once, then not again", async () => {
    changeStage({
      touched: { kind: 'thrown', onto: 'floor', at: Date.now() - 500 },
    })
    const posted: Receipt[] = []
    const post = async (_: KitRequest, receipt: Receipt) => {
      posted.push(receipt)
    }
    await serveKitRequests(
      [{ runId: 'run_1', requestRef: 'r1', operation: 'kit.look', args: {} }],
      post,
    )
    await serveKitRequests(
      [{ runId: 'run_1', requestRef: 'r2', operation: 'kit.look', args: {} }],
      post,
    )
    expect(posted[0]!.result.touched).toMatchObject({
      kind: 'thrown',
      onto: 'floor',
    })
    expect(posted[0]!.result.touched!.agoMs).toBeGreaterThanOrEqual(500)
    expect(posted[1]!.result.touched).toBeUndefined()
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

  test('a receipt that fails to post is sent again; Kit does not move again', async () => {
    const moves = fakeDriver(() => Promise.resolve(true))
    let attempts = 0
    const post = async () => {
      attempts += 1
      if (attempts < 3) throw new Error('connection dropped')
    }
    const requests = [request('a', 'kit.move', { to: 'rail' })]
    await serveKitRequests(requests, post, () => 0)
    await serveKitRequests(requests, post, () => 0)
    expect(attempts).toBe(3)
    expect(moves).toHaveLength(1)
  })

  test('a receipt held while the page is offline goes once it is back', async () => {
    fakeDriver(() => Promise.resolve(true))
    let attempts = 0
    const post = async () => {
      attempts += 1
      if (attempts === 1) {
        onlineManager.setOnline(false)
        throw new Error('network down')
      }
    }
    const served = serveKitRequests(
      [request('a', 'kit.move', { to: 'rail' })],
      post,
      () => 0,
    )
    await Bun.sleep(20)
    expect(attempts).toBe(1)
    onlineManager.setOnline(true)
    await served
    expect(attempts).toBe(2)
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
