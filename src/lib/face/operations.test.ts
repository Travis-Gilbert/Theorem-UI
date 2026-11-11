import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import type { ThreadMessage } from '@assistant-ui/react'
import type { Theorem } from '@theoremharness/sdk'
import { toAssistantMessages } from '@theoremharness/sdk/assistant-ui'
import { APP_OPERATIONS } from '@/lib/blocks/app-operations'
import { KIT_OPERATIONS } from '@/lib/kit/operations'
import { clientSurfaceTurnOptions } from '@/lib/theorem/client-surface'
import { Face, plainGaze } from './engine'
import {
  FACE_DEFINE,
  FACE_OPERATIONS,
  FACE_PERFORM,
  FACE_READ,
  answerFaceRequest,
  faceRequestsOf,
  faceTurnOptions,
  resetFaceRequests,
  runErrorOf,
  serveFaceRequests,
  toolFactsOf,
} from './operations'
import type { FaceReceipt, FaceRequest } from './operations'
import { useFaceStage } from './store'

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

const theo = () => {
  let now = 1_700_000_000_000
  const face = new Face({ seed: 7, clock: () => now })
  face.attach({ gazeAt: plainGaze, go: () => {}, burst: () => {} })
  const run = (ms: number) => {
    for (let t = 0; t < ms; t += 8) {
      now += 8
      face.advance(0.008)
    }
  }
  return { face, run }
}

const request = (
  operation: string,
  args: Record<string, unknown> = {},
  ref = 'ref_1',
): FaceRequest => ({
  runId: 'run_1',
  requestRef: ref,
  operation,
  args,
  expectedRevision: 3,
})

const result = (answer: { result?: unknown }) =>
  answer.result as Record<string, unknown>

beforeEach(() => {
  resetFaceRequests()
  useFaceStage.setState({ mounted: false })
})
afterEach(() => useFaceStage.setState({ mounted: false }))

describe('what a turn declares', () => {
  test('each declaration is inside the limits Theorem holds a page to', () => {
    const bytes = (value: unknown) =>
      new TextEncoder().encode(
        typeof value === 'string' ? value : JSON.stringify(value),
      ).length
    for (const operation of FACE_OPERATIONS) {
      expect(operation.name).toMatch(/^[a-z][a-z0-9_.]{2,63}$/)
      expect(bytes(operation.description)).toBeLessThanOrEqual(1024)
      expect(bytes(operation.inputSchema)).toBeLessThanOrEqual(8 * 1024)
      expect(operation.inputSchema.type).toBe('object')
    }
    expect(FACE_OPERATIONS.map((operation) => operation.name)).toEqual([
      FACE_READ,
      FACE_PERFORM,
      FACE_DEFINE,
    ])
  })

  test('with Kit, the App check and the face together a send stays under sixteen', () => {
    expect(
      KIT_OPERATIONS.length + APP_OPERATIONS.length + FACE_OPERATIONS.length,
    ).toBeLessThanOrEqual(16)
    const names = [
      ...KIT_OPERATIONS,
      ...APP_OPERATIONS,
      ...FACE_OPERATIONS,
    ].map((operation) => operation.name)
    expect(new Set(names).size).toBe(names.length)
  })

  test('the face is declared only while it is on the page', () => {
    expect(faceTurnOptions().clientOperations).toEqual([])
    const without = clientSurfaceTurnOptions().clientOperations.map(
      (operation) => operation.name,
    )
    expect(without.some((name) => name.startsWith('face.'))).toBe(false)
    useFaceStage.setState({ mounted: true })
    const names = clientSurfaceTurnOptions().clientOperations.map(
      (operation) => operation.name,
    )
    expect(names).toEqual(
      expect.arrayContaining([FACE_READ, FACE_PERFORM, FACE_DEFINE]),
    )
  })
})

describe('reading requests off a conversation', () => {
  const part = {
    requestRef: 'ref_1',
    operation: FACE_PERFORM,
    args: { use: 'blink' },
    expectedRevision: 2,
  }

  test('a pending face request in the live turn is read with its run', () => {
    expect(faceRequestsOf([liveMessage([part])], true)).toEqual([
      {
        runId: 'run_1',
        requestRef: 'ref_1',
        operation: FACE_PERFORM,
        args: { use: 'blink' },
        expectedRevision: 2,
      },
    ])
  })

  test('nothing in history is performed again', () => {
    const message = liveMessage([part])
    // The same conversation reopened: no turn is running.
    expect(faceRequestsOf([message], false)).toEqual([])
    // An older message of a conversation that is running a later turn.
    expect(faceRequestsOf([message, liveMessage([])], true)).toEqual([])
    // A request that was already answered.
    expect(
      faceRequestsOf([liveMessage([{ ...part, state: 'applied' }])], true),
    ).toEqual([])
  })

  test('other surfaces’ requests and messages without a run are left alone', () => {
    expect(
      faceRequestsOf(
        [liveMessage([{ ...part, operation: 'kit.move_to' }])],
        true,
      ),
    ).toEqual([])
    expect(faceRequestsOf([liveMessage([part], null)], true)).toEqual([])
  })

  test('a turn’s finished tools are counted, failures apart', () => {
    const message = {
      id: 'm1',
      role: 'assistant',
      content: [
        { type: 'tool-call', toolName: 'a', result: 'ok' },
        { type: 'tool-call', toolName: 'b', result: 'no', isError: true },
        { type: 'tool-call', toolName: 'c' },
        { type: 'text', text: 'hello' },
      ],
    } as unknown as ThreadMessage
    expect(toolFactsOf([message], true)).toEqual({
      id: 'm1',
      done: 2,
      failed: 1,
    })
    expect(toolFactsOf([message], false)).toBeUndefined()
  })

  test('a reply that ended in an error is told apart from one that did not', () => {
    const reply = (status: unknown) =>
      ({
        id: 'm1',
        role: 'assistant',
        content: [],
        status,
      }) as unknown as ThreadMessage
    expect(runErrorOf([reply({ type: 'incomplete', reason: 'error' })])).toBe(
      'm1',
    )
    expect(
      runErrorOf([reply({ type: 'incomplete', reason: 'cancelled' })]),
    ).toBeUndefined()
    expect(
      runErrorOf([reply({ type: 'complete', reason: 'stop' })]),
    ).toBeUndefined()
    expect(runErrorOf([])).toBeUndefined()
  })
})

describe('answering', () => {
  test('face.read returns the manual, or the part asked for', async () => {
    const { face } = theo()
    const all = await answerFaceRequest(request(FACE_READ), face)
    expect(all.outcome).toBe('applied')
    expect(Object.keys(result(all))).toEqual(
      expect.arrayContaining(['channels', 'state']),
    )
    const state = await answerFaceRequest(
      request(FACE_READ, { part: 'state' }),
      face,
    )
    expect(result(state).doing).toBe('at rest')
    // The whole manual is one tool result: it has to stay readable in a turn.
    expect(JSON.stringify(all.result).length).toBeLessThan(24_000)
  })

  test('face.read lists what on the page the face can be sent to', async () => {
    const { face } = theo()
    const bare = await answerFaceRequest(
      request(FACE_READ, { part: 'page' }),
      face,
    )
    expect(result(bare).page).toMatchObject({ things: [] })
    face.attach({
      gazeAt: plainGaze,
      go: () => {},
      burst: () => {},
      things: () => [
        {
          name: 'tool:call_1',
          label: 'Run tests',
          state: 'failed',
          where: 'closed',
        },
        { name: 'message:m2', label: 'the reply', where: 'in view' },
      ],
      pointing: () => ({ thing: 'tool:call_1', where: 'closed' }),
    })
    const read = await answerFaceRequest(
      request(FACE_READ, { part: 'page' }),
      face,
    )
    const page = result(read).page as {
      how: string
      things: Array<{ name: string }>
    }
    expect(page.things.map((thing) => thing.name)).toEqual([
      'tool:call_1',
      'message:m2',
    ])
    expect(page.how).toContain('{thing:')
    expect(result(read).state).toMatchObject({
      pointing: { thing: 'tool:call_1', where: 'closed' },
    })
    const all = await answerFaceRequest(request(FACE_READ), face)
    expect(Object.keys(result(all))).toContain('page')
  })

  test('sent to a thing, the face goes; to one the page does not have, the agent is told and nothing plays', async () => {
    const { face, run } = theo()
    const went: Array<unknown> = []
    face.attach({
      gazeAt: plainGaze,
      go: (to) => void went.push(to),
      burst: () => {},
      thing: (thing) =>
        thing.thing === 'tool:failed'
          ? ['tool:call_1 is folded away; the face points at what holds it.']
          : undefined,
    })
    const program = (thing: string) => ({
      program: { steps: [{ op: 'go', to: { thing } }] },
    })
    const missing = await answerFaceRequest(
      request(FACE_PERFORM, program('tool:nope')),
      face,
    )
    expect(missing.outcome).toBe('rejected')
    expect(missing.reason).toContain('steps[0].to.thing')
    expect(missing.reason).toContain('tool:nope')
    expect(face.player.active('performance')).toBeUndefined()
    const sent = await answerFaceRequest(
      request(FACE_PERFORM, program('tool:failed'), 'ref_2'),
      face,
    )
    expect(sent.outcome).toBe('applied')
    expect(result(sent).notes).toEqual([
      'steps[0].to: tool:call_1 is folded away; the face points at what holds it.',
    ])
    run(100)
    expect(went).toEqual([{ thing: 'tool:failed' }])
  })

  test('face.perform starts a named performance and says so at once', async () => {
    const { face } = theo()
    const answer = await answerFaceRequest(
      request(FACE_PERFORM, { use: 'glare' }),
      face,
    )
    expect(answer.outcome).toBe('applied')
    expect(result(answer)).toMatchObject({ name: 'glare@1', ending: 'running' })
    expect(face.player.active('performance')?.owner).toBe('run:run_1')
  })

  test('face.perform plays a program nobody named, with a feature nobody planned', async () => {
    const { face, run } = theo()
    const answer = await answerFaceRequest(
      request(FACE_PERFORM, {
        program: {
          steps: [
            {
              op: 'feature',
              id: 'mouth',
              set: { x: 0, y: 20, w: 8, h: 2, share: 0.25 },
            },
            {
              op: 'to',
              set: { 'mouth.lowBow': -0.9, 'eyes.lowBow': 0.7 },
              over: 200,
              hold: 400,
            },
          ],
        },
      }),
      face,
    )
    expect(answer.outcome).toBe('applied')
    run(300)
    expect(face.rig.channels.feature('mouth')).toBeDefined()
  })

  test('with wait, the receipt carries how the performance ended', async () => {
    const { face, run } = theo()
    const waiting = answerFaceRequest(
      request(FACE_PERFORM, { use: 'blink', wait: true }),
      face,
      () => new Promise(() => {}),
    )
    run(3_000)
    expect(result(await waiting).ending).toBe('completed')
  })

  test('a wait that outlasts its bound answers that it is still running', async () => {
    const { face } = theo()
    const answer = await answerFaceRequest(
      request(FACE_PERFORM, { use: 'dizzy', wait: true }),
      face,
      () => Promise.resolve(),
    )
    expect(result(answer).ending).toBe('running')
  })

  test('a refusal says where and why, and the face does not move', async () => {
    const { face } = theo()
    const wrong = await answerFaceRequest(
      request(FACE_PERFORM, {
        program: { steps: [{ op: 'to', set: { 'eye.left.lidd': 1 } }] },
      }),
      face,
    )
    expect(wrong.outcome).toBe('rejected')
    expect(wrong.reason).toContain('steps[0]')
    expect(wrong.reason).toContain('eye.left.lid')
    expect(face.player.active('performance')).toBeUndefined()
    for (const args of [{}, { use: 'blink', program: { steps: [] } }])
      expect(
        (await answerFaceRequest(request(FACE_PERFORM, args), face)).outcome,
      ).toBe('rejected')
    expect(
      (await answerFaceRequest(request(FACE_PERFORM, { use: 'no-such' }), face))
        .outcome,
    ).toBe('rejected')
  })

  test('stop ends what the agent started', async () => {
    const { face } = theo()
    const started = await answerFaceRequest(
      request(FACE_PERFORM, { use: 'dizzy' }),
      face,
    )
    const stopped = await answerFaceRequest(
      request(FACE_PERFORM, { stop: true }, 'ref_2'),
      face,
    )
    expect(result(stopped).stopped).toBe(result(started).id)
    expect(face.player.active('performance')).toBeUndefined()
  })

  test('face.define saves a performance the agent can then play by name', async () => {
    const { face } = theo()
    const program = {
      steps: [
        {
          op: 'to',
          set: { 'face.tilt': 9, 'eye.left.lid': 0.7 },
          over: 200,
          hold: 300,
        },
      ],
    }
    const saved = await answerFaceRequest(
      request(FACE_DEFINE, { name: 'smirk', program, note: 'A smirk.' }),
      face,
    )
    expect(result(saved).saved).toBe('smirk@1')
    const played = await answerFaceRequest(
      request(FACE_PERFORM, { use: 'smirk' }, 'ref_2'),
      face,
    )
    expect(result(played).name).toBe('smirk@1')
    const again = await answerFaceRequest(
      request(FACE_DEFINE, { name: 'smirk', program }, 'ref_3'),
      face,
    )
    expect(result(again).saved).toBe('smirk@2')
    expect(
      (
        await answerFaceRequest(
          request(FACE_DEFINE, { remove: { performance: 'smirk' } }, 'ref_4'),
          face,
        )
      ).outcome,
    ).toBe('applied')
    expect(
      (
        await answerFaceRequest(
          request(FACE_PERFORM, { use: 'smirk' }, 'ref_5'),
          face,
        )
      ).outcome,
    ).toBe('rejected')
  })

  test('face.define adds a reaction rule, and the face then reacts by it', async () => {
    const { face, run } = theo()
    const added = await answerFaceRequest(
      request(FACE_DEFINE, {
        rule: { id: 'paste-wink', on: 'person.paste', do: 'wink' },
      }),
      face,
    )
    expect(added).toMatchObject({
      outcome: 'applied',
      result: { rule: 'paste-wink' },
    })
    run(100)
    expect(face.notice('person.paste')?.name).toBe('wink@1')
    const bad = await answerFaceRequest(
      request(
        FACE_DEFINE,
        { rule: { id: 'x', on: 'person.paste', do: 'no-such' } },
        'ref_2',
      ),
      face,
    )
    expect(bad.outcome).toBe('rejected')
    expect(
      (
        await answerFaceRequest(
          request(FACE_DEFINE, { remove: { rule: 'paste-wink' } }, 'ref_3'),
          face,
        )
      ).outcome,
    ).toBe('applied')
    expect(
      (await answerFaceRequest(request(FACE_DEFINE, {}, 'ref_4'), face))
        .outcome,
    ).toBe('rejected')
  })

  test('an operation the page does not have is rejected', async () => {
    expect(
      (await answerFaceRequest(request('face.sing'), theo().face)).outcome,
    ).toBe('rejected')
  })
})

describe('serving', () => {
  // A face is served while it is on the page.
  beforeEach(() => useFaceStage.setState({ mounted: true }))

  test('a face switched off mid-run refuses, and the run still gets its receipt', async () => {
    useFaceStage.setState({ mounted: false })
    const { face } = theo()
    const posted: Array<FaceReceipt> = []
    const post = (_: FaceRequest, receipt: FaceReceipt) => {
      posted.push(receipt)
      return Promise.resolve()
    }
    await serveFaceRequests(
      [
        request(FACE_PERFORM, { use: 'blink' }, 'ref_off_1'),
        request(
          FACE_DEFINE,
          { name: 'unseen', program: { op: 'use', name: 'blink' } },
          'ref_off_2',
        ),
      ],
      post,
      face,
    )
    expect(posted.map((receipt) => receipt.outcome)).toEqual([
      'rejected',
      'rejected',
    ])
    expect(posted[0]?.revision).toBe(3)
    expect(face.player.history).toHaveLength(0)
    expect(face.book.get('unseen')).toBeUndefined()
  })

  test('a request is answered once, with the revision the run expected', async () => {
    const { face } = theo()
    const posted: Array<[FaceRequest, FaceReceipt]> = []
    const post = (asked: FaceRequest, receipt: FaceReceipt) => {
      posted.push([asked, receipt])
      return Promise.resolve()
    }
    const asked = request(FACE_PERFORM, { use: 'blink' })
    await serveFaceRequests([asked], post, face)
    // The conversation reports the same pending part again before the receipt lands.
    await serveFaceRequests([asked], post, face)
    expect(posted).toHaveLength(1)
    expect(posted[0]?.[1]).toMatchObject({ outcome: 'applied', revision: 3 })
    expect(
      face.player.history.filter(
        (invocation) => invocation.owner === 'run:run_1',
      ),
    ).toHaveLength(1)
  })

  test('a receipt that fails to post is sent again; the performance is not played again', async () => {
    const { face } = theo()
    let attempts = 0
    const post = () =>
      ++attempts < 3 ? Promise.reject(new Error('offline')) : Promise.resolve()
    await serveFaceRequests(
      [request(FACE_PERFORM, { use: 'blink' })],
      post,
      face,
      () => 0,
    )
    expect(attempts).toBe(3)
    expect(
      face.player.history.filter(
        (invocation) => invocation.owner === 'run:run_1',
      ),
    ).toHaveLength(1)
  })
})
