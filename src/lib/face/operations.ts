// SOURCING: Theorem's client operations, as lib/blocks/app-operations.ts and lib/kit/operations.ts use them (a page declares operations on its send, each becomes a tool of the turn, a call streams a `client_operation` part in state `pending`, the page answers with a `client-operation-receipt` command through @theoremharness/sdk's chat.runs.command); the server's limits on a declaration (theorem rustyred-thg-server theorem_agent_stream/client_operations.rs: 16 operations a send, a description of at most 1024 bytes, a schema of at most 8 KB). Kit and the App check use ten of the sixteen, so the face is three operations and its vocabulary is data, not tools: one to read the manual, one to perform, one to teach.
import type { ThreadMessage } from '@assistant-ui/react'
import { MutationObserver, QueryClient } from '@tanstack/react-query'
import { useEffect } from 'react'
import { hasStatus, mutate, theorem } from '@/lib/theorem/client'
import type { Face } from './engine'
import { theFace, useFaceStage } from './store'

export const FACE_READ = 'face.read'
export const FACE_PERFORM = 'face.perform'
export const FACE_DEFINE = 'face.define'

/** The longest a `wait: true` performance holds its receipt, under the server's own wait. */
const MAX_WAIT_MS = 15_000

/**
 * What a turn declares so the agent can drive Theo. The same three serve a
 * tool call and a code cell alike: a program in a cell reaches them as
 * `tool("face__perform", {...})`.
 */
export const FACE_OPERATIONS = [
  {
    name: FACE_READ,
    description:
      'Reads Theo, the face that stands for you on the person’s screen: a small dark visor with two glowing eyes made of particles. Returns its manual as data: every channel you can set with its bounds and rest value, the steps a performance is written in, the named performances in its book, its reaction rules, and what it is doing now (mood, recent events, how your last performances ended). Read it once before your first face.perform; pass `part` to read less later. Nothing changes.',
    effect: 'read',
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      properties: {
        part: {
          type: 'string',
          enum: ['all', 'channels', 'book', 'state'],
          description: 'Which part to return. Default all.',
        },
      },
    },
  },
  {
    name: FACE_PERFORM,
    description:
      'Makes Theo perform, visibly, now. Pass `use` to play a named performance from the book ("blink", "glare", "think", ...), or `program` to play one you write: {steps:[...]} where each step is {op:"to", set:{"eyes.lid":0.4,"face.tilt":8}, over:200, hold:600}, a wave, seq, par, stagger, repeat, vary, look, go, feature (adds a new facial feature made of the same matter, e.g. brows or a mouth), burst, use or release. You are not limited to named expressions: any point in the channels is a face, and any program is a performance. A wrong program is refused with the path and the reason and nothing plays. The receipt comes when it starts, with its id and length in ms; pass `wait: true` to get how it ended instead. `stop: true` ends your current performance. Call face.read first for the channels and steps.',
    effect: 'presentation',
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      properties: {
        use: {
          type: 'string',
          minLength: 1,
          maxLength: 48,
          description: 'A performance in the book, by name or name@version.',
        },
        program: {
          description:
            'A performance written here: {steps:[...], keep?:boolean}, a list of steps, or one step.',
        },
        args: {
          type: 'object',
          additionalProperties: { type: 'number' },
          description:
            'Numbers for the {arg:"name"} values the performance reads.',
        },
        intensity: {
          type: 'number',
          minimum: 0,
          maximum: 2,
          description: 'How far from rest it goes: 1 as written.',
        },
        seed: {
          type: 'integer',
          minimum: 0,
          maximum: 4294967295,
          description:
            'Fixes the draws of {rand} and vary, to repeat a performance exactly.',
        },
        wait: {
          type: 'boolean',
          description:
            'Answer when it ends (up to 15 s) with how it ended, not when it starts.',
        },
        stop: { type: 'boolean', description: 'End the current performance.' },
      },
    },
  },
  {
    name: FACE_DEFINE,
    description:
      'Teaches Theo something that lasts on this device. Pass `name` and `program` (and a `note` saying what it is for) to save a performance to the book: saving a name again adds a version, and earlier versions keep meaning what they meant. Pass `rule` to add or replace a reaction: {id, on:"person.poke" or a list of event kinds in order, when?:{streak:[4,99], arousal:[0.5,1]}, do:"name" or a program, weight?, cooldown?, intensity?}; Theo then does it by itself when that happens, drawn against the other rules that fit. Pass `remove` as {performance:"name"} or {rule:"id"} to take one you added away. The program or rule is checked first; a wrong one is refused with the path and the reason.',
    effect: 'presentation',
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      properties: {
        name: {
          type: 'string',
          pattern: '^[a-z][a-z0-9-]{1,31}$',
          description: 'The performance’s name in the book.',
        },
        program: {
          description:
            'The performance: {steps:[...]}, a list of steps, or one step.',
        },
        note: {
          type: 'string',
          maxLength: 240,
          description: 'What the performance is for.',
        },
        rule: {
          type: 'object',
          description: 'A reaction rule to add or replace.',
        },
        remove: {
          type: 'object',
          additionalProperties: false,
          properties: {
            performance: { type: 'string', maxLength: 48 },
            rule: { type: 'string', maxLength: 48 },
          },
        },
      },
    },
  },
] as const

/** What a send carries so the turn can drive the face: nothing while the face is not on the page. */
export function faceTurnOptions() {
  return {
    clientOperations: useFaceStage.getState().mounted ? FACE_OPERATIONS : [],
  }
}

/** One request a run made of the face, read off a message. */
export interface FaceRequest {
  readonly runId: string
  readonly requestRef: string
  readonly operation: string
  readonly args: Record<string, unknown>
  readonly expectedRevision: number
}

const record = (value: unknown): Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {}

/**
 * The face requests pending in the conversation's live turn: the last
 * assistant message, while it runs. A saved conversation reopened has no
 * running turn, so nothing in history is ever performed again.
 */
export function faceRequestsOf(
  messages: readonly ThreadMessage[],
  running: boolean,
): Array<FaceRequest> {
  const last = messages.at(-1)
  if (!running || last?.role !== 'assistant') return []
  const runId = record(last.metadata.custom).theoremRunId
  if (typeof runId !== 'string') return []
  return last.content.flatMap((part) => {
    if (part.type !== 'data' || part.name !== 'theorem-client_operation')
      return []
    const data = record(part.data)
    const { requestRef, operation, expectedRevision } = data
    if (
      (data.state ?? 'pending') !== 'pending' ||
      typeof requestRef !== 'string' ||
      typeof operation !== 'string' ||
      !operation.startsWith('face.')
    )
      return []
    return [
      {
        runId,
        requestRef,
        operation,
        args: record(data.args),
        expectedRevision:
          typeof expectedRevision === 'number' ? expectedRevision : 0,
      },
    ]
  })
}

export interface FaceAnswer {
  readonly outcome: 'applied' | 'rejected' | 'failed'
  readonly reason?: string
  readonly result?: unknown
}

const refused = (path: string, reason: string): FaceAnswer => ({
  outcome: 'rejected',
  reason: path ? `${path}: ${reason}` : reason,
  result: {
    path,
    reason,
    hint: 'face.read returns the channels, steps and book.',
  },
})

const numbers = (value: unknown) =>
  Object.fromEntries(
    Object.entries(record(value)).filter(
      (entry): entry is [string, number] => typeof entry[1] === 'number',
    ),
  )

/** Answers one request against a face. */
export async function answerFaceRequest(
  request: FaceRequest,
  face: Face = theFace(),
  sleep: (ms: number) => Promise<void> = (ms) =>
    new Promise((resolve) => setTimeout(resolve, ms)),
): Promise<FaceAnswer> {
  const { args } = request
  try {
    if (request.operation === FACE_READ) {
      const part = args.part
      return {
        outcome: 'applied',
        result: face.manual(
          part === 'channels' || part === 'book' || part === 'state'
            ? part
            : 'all',
        ),
      }
    }
    if (request.operation === FACE_PERFORM) {
      if (args.stop === true) {
        const active = face.player.holding('performance')
        face.player.stop('performance')
        return { outcome: 'applied', result: { stopped: active?.id ?? null } }
      }
      const named = typeof args.use === 'string' && args.use !== ''
      if (named === (args.program !== undefined))
        return refused(
          '',
          'Pass `use` to play a named performance or `program` to play one written here, not both and not neither.',
        )
      const performed = face.perform(named ? args.use : args.program, {
        layer: 'performance',
        owner: `run:${request.runId}`,
        args: numbers(args.args),
        ...(typeof args.intensity === 'number'
          ? { intensity: args.intensity }
          : {}),
        ...(typeof args.seed === 'number' ? { seed: args.seed } : {}),
      })
      if (!performed.ok) return refused(performed.path, performed.reason)
      const { invocation, notes } = performed
      const started = {
        id: invocation.id,
        ...(invocation.name ? { name: invocation.name } : {}),
        ms: Math.round(invocation.ms),
        seed: invocation.seed,
        ...(notes.length > 0 ? { notes } : {}),
      }
      if (args.wait !== true)
        return { outcome: 'applied', result: { ...started, ending: 'running' } }
      const ending = await Promise.race([
        face.ended(invocation.id),
        sleep(Math.min(MAX_WAIT_MS, invocation.ms + 1_500)).then(
          () => 'running' as const,
        ),
      ])
      return { outcome: 'applied', result: { ...started, ending } }
    }
    if (request.operation === FACE_DEFINE) {
      const remove = record(args.remove)
      if (typeof remove.performance === 'string') {
        const gone = face.book.remove(remove.performance)
        return gone.ok
          ? { outcome: 'applied', result: { removed: remove.performance } }
          : refused('remove.performance', gone.reason)
      }
      if (typeof remove.rule === 'string') {
        const gone = face.reactions.remove(remove.rule)
        return gone
          ? { outcome: 'applied', result: { removed: remove.rule } }
          : refused('remove.rule', `No added rule has the id "${remove.rule}".`)
      }
      if (args.rule !== undefined) {
        const defined = face.reactions.define(
          args.rule,
          'agent',
          face.rig.channels,
        )
        return defined.ok
          ? { outcome: 'applied', result: { rule: defined.rule.id } }
          : refused(defined.path, defined.reason)
      }
      if (typeof args.name === 'string' && args.program !== undefined) {
        const defined = face.book.define(
          args.name,
          args.program,
          typeof args.note === 'string' ? args.note : '',
          'agent',
          face.rig.channels,
        )
        return defined.ok
          ? {
              outcome: 'applied',
              result: {
                saved: `${defined.entry.name}@${defined.entry.version}`,
              },
            }
          : refused(defined.path, defined.reason)
      }
      return refused(
        '',
        'Pass `name` and `program` to save a performance, `rule` to add a reaction, or `remove`.',
      )
    }
  } catch (error) {
    return {
      outcome: 'failed',
      reason: error instanceof Error ? error.message : String(error),
    }
  }
  return {
    outcome: 'rejected',
    reason: `This page has no operation ${request.operation}.`,
  }
}

export interface FaceReceipt extends FaceAnswer {
  readonly revision: number
}

function postReceipt(request: FaceRequest, receipt: FaceReceipt) {
  return mutate((headers) =>
    theorem().chat.runs.command({
      runId: request.runId,
      command: 'client-operation-receipt',
      requestRef: request.requestRef,
      receipt: { ...receipt },
      ...headers,
    }),
  )
}

const RECEIPT_RETRIES = 6
const receiptDelay = (failures: number) => Math.min(500 * 2 ** failures, 8_000)
const receipts = new QueryClient()
// Mounted for the page's life: only a mounted client resumes what it paused offline.
receipts.mount()
const served = new Set<string>()

/**
 * Answers each request once, whichever conversation reports it. A receipt
 * that fails to post is sent again; the performance is not played again.
 * The face changes nothing the run's revision counts, so the receipt carries
 * the revision the run expected.
 */
export function serveFaceRequests(
  requests: ReadonlyArray<FaceRequest>,
  post: (
    request: FaceRequest,
    receipt: FaceReceipt,
  ) => Promise<unknown> = postReceipt,
  face?: Face,
  retryDelay: (failures: number) => number = receiptDelay,
): Promise<void> {
  const answered: Array<Promise<void>> = []
  for (const request of requests) {
    if (served.has(request.requestRef)) continue
    served.add(request.requestRef)
    answered.push(
      (async () => {
        // A turn offered the face before it was switched off is told so; the run still gets its receipt.
        const answer: FaceAnswer = useFaceStage.getState().mounted
          ? await answerFaceRequest(request, face)
          : { outcome: 'rejected', reason: 'Theo is not on screen.' }
        await new MutationObserver(receipts, {
          mutationFn: (receipt: FaceReceipt) => post(request, receipt),
          retry: (failures, error) =>
            failures < RECEIPT_RETRIES && !hasStatus(error, 400, 404, 409, 422),
          retryDelay,
        })
          .mutate({ ...answer, revision: request.expectedRevision })
          .catch((error: unknown) => {
            console.warn('Theo could not answer its run', error)
          })
      })(),
    )
  }
  return Promise.all(answered).then(() => undefined)
}

/** For tests: forget which requests were served. */
export function resetFaceRequests() {
  served.clear()
}

/** The part of an assistant-ui thread runtime the face reads. */
interface ThreadSource {
  readonly thread: {
    getState: () => {
      readonly messages: readonly ThreadMessage[]
      readonly isRunning: boolean
    }
    subscribe: (callback: () => void) => () => void
  }
}

/** What the live turn's tools have come to so far. */
export function toolFactsOf(
  messages: readonly ThreadMessage[],
  running: boolean,
) {
  const last = messages.at(-1)
  if (!running || last?.role !== 'assistant') return undefined
  let done = 0
  let failed = 0
  for (const part of last.content) {
    if (part.type !== 'tool-call' || part.result === undefined) continue
    done++
    if (part.isError) failed++
  }
  return { id: last.id, done, failed }
}

/** The id of the conversation's last reply if it ended in an error, so the face can take it in once. */
export function runErrorOf(messages: readonly ThreadMessage[]) {
  const last = messages.at(-1)
  if (last?.role !== 'assistant') return undefined
  const { status } = last
  return status.type === 'incomplete' && status.reason === 'error'
    ? last.id
    : undefined
}

/**
 * Serves face requests from one conversation for as long as it is mounted,
 * and tells the face what the run's tools are doing: each one that finishes
 * is an event, and one that fails is a different one.
 */
export function useFaceRequests(runtime: ThreadSource) {
  useEffect(() => {
    let seen: ReturnType<typeof toolFactsOf>
    let errored: string | undefined
    // Tools that finished before this page was looking are not news.
    let first = true
    const serve = () => {
      const { messages, isRunning } = runtime.thread.getState()
      void serveFaceRequests(faceRequestsOf(messages, isRunning))
      const facts = toolFactsOf(messages, isRunning)
      if (facts && !first && useFaceStage.getState().mounted) {
        const before = seen?.id === facts.id ? seen : { done: 0, failed: 0 }
        const face = theFace()
        for (let index = before.failed; index < facts.failed; index++)
          face.notice('run.tool.fail')
        const passed = facts.done - facts.failed - (before.done - before.failed)
        for (let index = 0; index < passed; index++) face.notice('run.tool')
      }
      seen = facts ?? seen
      const error = runErrorOf(messages)
      if (
        error &&
        error !== errored &&
        !first &&
        useFaceStage.getState().mounted
      )
        theFace().notice('run.error')
      errored = error
      first = false
    }
    serve()
    return runtime.thread.subscribe(serve)
  }, [runtime])
}
