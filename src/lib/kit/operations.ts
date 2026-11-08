// SOURCING: Theorem's Kit contract (theorem-surface-contracts kit: the declarations in contract/operations.json and the ts-rs types beside it, copied from rustyredcore_THG/bindings/theorem-surface-contracts/kit); Theorem's client operations (theorem-surface-contracts client_operation: a page declares operations in `clientOperations` beside `clientSurface` on its send, each becomes a tool of the turn, a call streams a `client_operation` part in state `pending`, and the page answers with a `client-operation-receipt` command through @theoremharness/sdk's chat.runs.command); assistant-ui ThreadMessage content as the SDK adapter maps that part (`theorem-client_operation` data); @tanstack/react-query's MutationObserver retries a receipt that failed to post, with backoff, pausing while offline
import type { ThreadMessage } from '@assistant-ui/react'
import type { Theorem } from '@theoremharness/sdk'
import { MutationObserver, QueryClient } from '@tanstack/react-query'
import { useEffect } from 'react'
import { hasStatus, mutate, theorem } from '@/lib/theorem/client'
import type { KitGesture } from './contract/KitGesture'
import operations from './contract/operations.json'
import { KitRefusal, kitDriver } from './driver'
import { KIT_SHEET, tagLength } from './sheet'
import type { KitTag } from './sheet'
import {
  PERCHES,
  changeStage,
  clamp01,
  sceneOf,
  shownTag,
  useKitStage,
} from './stage'
import type { Gait, PerchName, Scene } from './stage'
import { useKit } from './store'
import { describeKit } from './words'

/** Gestures the agent may ask of Kit; each plays once and Kit goes back to what its run shows. */
export const GESTURES = [
  'wave',
  'nod',
  'celebrate',
  'pounce',
  'stretch',
  'shrug',
  'tilt',
  'think',
  'point',
  'peek',
  'sit',
] as const satisfies readonly (KitGesture & KitTag)[]
export type Gesture = KitGesture

export const GAITS = ['walk', 'run', 'jump'] as const satisfies readonly Gait[]

/** Longest line Kit says, and how long a loop gesture holds. */
export const MAX_SAYING = 120
const LOOP_GESTURE_MS = 2400

/**
 * The operations a turn declares, as Theorem's `kit_operations()` writes them:
 * what Kit is, what each does, and the schema of its arguments.
 */
export const KIT_OPERATIONS =
  operations as readonly Theorem.ClientOperationDeclaration[]

/**
 * What a send carries so the turn can reach Kit: the operations and the
 * stage's revision. Nothing while Kit is not on screen.
 */
export function kitTurnOptions():
  | {
      clientOperations: typeof KIT_OPERATIONS
      clientSurface: { revision: number }
    }
  | Record<string, never> {
  const { mounted, revision } = useKitStage.getState()
  return mounted
    ? { clientOperations: KIT_OPERATIONS, clientSurface: { revision } }
    : {}
}

/** One request the run made of Kit, read off a message. */
export interface KitRequest {
  readonly runId: string
  readonly requestRef: string
  readonly operation: string
  readonly args: Record<string, unknown>
}

const record = (value: unknown): Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {}

/**
 * Kit's pending requests in the conversation's live turn: the last assistant
 * message, while it runs. A request needs its run id, which the message's
 * metadata carries, so a receipt can reach the run.
 */
export function kitRequestsOf(
  messages: readonly ThreadMessage[],
  running: boolean,
): KitRequest[] {
  const last = messages.at(-1)
  if (!running || last?.role !== 'assistant') return []
  const runId = record(last.metadata.custom).theoremRunId
  if (typeof runId !== 'string') return []
  return last.content.flatMap((part) => {
    if (part.type !== 'data' || part.name !== 'theorem-client_operation')
      return []
    const data = record(part.data)
    const { requestRef, operation } = data
    const state = data.state ?? 'pending'
    if (
      state !== 'pending' ||
      typeof requestRef !== 'string' ||
      typeof operation !== 'string' ||
      !operation.startsWith('kit.')
    )
      return []
    return [{ runId, requestRef, operation, args: record(data.args) }]
  })
}

type Outcome = 'applied' | 'rejected' | 'interrupted' | 'failed'

interface Answer {
  readonly outcome: Outcome
  readonly reason?: string
}

/** What Kit is doing, in the words its status uses. */
export function kitScene(now = Date.now()): Scene {
  const stage = useKitStage.getState()
  const { act, liveness } = useKit.getState()
  return sceneOf(
    stage,
    describeKit(liveness, shownTag(stage, act, now).tag),
    now,
  )
}

const isPerch = (value: unknown): value is PerchName =>
  PERCHES.includes(value as PerchName)

/** Carries out one request on the stage. Validation repeats the schema: the page is the last word on its own scene. */
export async function applyKitRequest(
  request: Pick<KitRequest, 'operation' | 'args'>,
  now = Date.now(),
): Promise<Answer> {
  const { operation, args } = request
  if (operation === 'kit.look') return { outcome: 'applied' }
  if (!useKitStage.getState().mounted)
    return { outcome: 'rejected', reason: 'Kit is not on screen' }
  if (operation === 'kit.move') {
    if (!isPerch(args.to))
      return {
        outcome: 'rejected',
        reason: `to must be one of ${PERCHES.join(', ')}`,
      }
    const at = typeof args.at === 'number' ? clamp01(args.at) : 0.5
    const gait = GAITS.includes(args.gait as Gait)
      ? (args.gait as Gait)
      : 'walk'
    const driver = kitDriver()
    if (!driver) return { outcome: 'rejected', reason: 'Kit is not on screen' }
    try {
      const arrived = await driver.moveTo(args.to, at, gait)
      return arrived
        ? { outcome: 'applied' }
        : {
            outcome: 'interrupted',
            reason:
              'Kit was stopped on the way: the person picked it up, or another move began',
          }
    } catch (error) {
      if (error instanceof KitRefusal)
        return { outcome: 'rejected', reason: error.message }
      throw error
    }
  }
  if (operation === 'kit.gesture') {
    const tag = args.gesture
    if (!GESTURES.includes(tag as Gesture))
      return {
        outcome: 'rejected',
        reason: `gesture must be one of ${GESTURES.join(', ')}`,
      }
    playGesture(tag as Gesture, now)
    return { outcome: 'applied' }
  }
  if (operation === 'kit.say') {
    const text = typeof args.text === 'string' ? args.text.trim() : ''
    if (!text || text.length > MAX_SAYING)
      return {
        outcome: 'rejected',
        reason: `text must be 1 to ${MAX_SAYING} characters`,
      }
    say(text, now)
    return { outcome: 'applied' }
  }
  return { outcome: 'rejected', reason: `Kit has no operation ${operation}` }
}

/** Plays a gesture once: one pass for those that end, a few seconds for loops. */
export function playGesture(tag: KitTag, now = Date.now()) {
  const length = tagLength(KIT_SHEET, tag)
  const once = !['think', 'sit', 'wave', 'shrug', 'tilt', 'point'].includes(tag)
  changeStage({
    gesture: {
      tag,
      since: now,
      until: now + (once ? length : Math.max(LOOP_GESTURE_MS, length)),
      once,
    },
  })
}

/** Shows a line in Kit's bubble, longer for longer lines. */
export function say(text: string, now = Date.now()) {
  changeStage({
    speech: { text, until: now + Math.min(9000, 2600 + text.length * 55) },
  })
}

/** A receipt that fails to post is sent again this many times; a refusal by the server is final. */
const RECEIPT_RETRIES = 6
const receiptDelay = (failures: number) =>
  Math.min(1000 * 2 ** failures, 15_000)
const receipts = new QueryClient()
// Mounted for the page's life: only a mounted client resumes what it paused offline.
receipts.mount()

/** Requests answered, or being answered, by this page. */
const served = new Set<string>()
/** The request being carried out; the next waits for it, so "walk there, then nod" plays in that order. */
let queue: Promise<void> = Promise.resolve()

/** For tests: forget which requests were served. */
export function resetKitRequests() {
  served.clear()
  queue = Promise.resolve()
}

/**
 * Answers each of Kit's requests once, whichever conversation reports it, in
 * the order the run made them: it acts on the stage, then posts the receipt
 * with the scene as it stands. Resolves when these requests are answered.
 */
export function serveKitRequests(
  requests: readonly KitRequest[],
  post: (
    request: KitRequest,
    receipt: Receipt,
  ) => Promise<unknown> = postReceipt,
  retryDelay: (failures: number) => number = receiptDelay,
): Promise<void> {
  for (const request of requests) {
    if (served.has(request.requestRef)) continue
    served.add(request.requestRef)
    queue = queue.then(async () => {
      let answer: Answer
      try {
        answer = await applyKitRequest(request)
      } catch (error) {
        answer = {
          outcome: 'failed',
          reason: error instanceof Error ? error.message : String(error),
        }
      }
      const scene = kitScene()
      // Kit has already acted, so only the receipt is sent again.
      await new MutationObserver(receipts, {
        mutationFn: (receipt: Receipt) => post(request, receipt),
        retry: (failures, error) =>
          failures < RECEIPT_RETRIES && !hasStatus(error, 400, 404, 409, 422),
        retryDelay,
      })
        .mutate({
          outcome: answer.outcome,
          revision: scene.revision,
          ...(answer.reason && { reason: answer.reason }),
          result: scene,
        })
        .catch((error: unknown) => {
          console.warn('Kit could not answer its run', error)
        })
      // A gesture plays out before the next request takes Kit's body.
      const { gesture } = useKitStage.getState()
      if (request.operation === 'kit.gesture' && gesture)
        await new Promise((resolve) =>
          setTimeout(resolve, Math.max(0, gesture.until - Date.now())),
        )
    })
  }
  return queue
}

export interface Receipt {
  readonly outcome: Outcome
  readonly revision: number
  readonly reason?: string
  readonly result: Scene
}

function postReceipt(request: KitRequest, receipt: Receipt) {
  return mutate((headers) =>
    theorem().chat.runs.command({
      runId: request.runId,
      command: 'client-operation-receipt',
      requestRef: request.requestRef,
      receipt: { ...receipt, result: { ...receipt.result } },
      ...headers,
    }),
  )
}

/** The part of an assistant-ui thread runtime Kit's requests are read from. */
interface ThreadSource {
  readonly thread: {
    getState: () => {
      readonly messages: readonly ThreadMessage[]
      readonly isRunning: boolean
    }
    subscribe: (callback: () => void) => () => void
  }
}

/** Serves Kit's requests from one conversation for as long as it is mounted. */
export function useKitRequests(runtime: ThreadSource) {
  useEffect(() => {
    const serve = () => {
      const { messages, isRunning } = runtime.thread.getState()
      void serveKitRequests(kitRequestsOf(messages, isRunning))
    }
    serve()
    return runtime.thread.subscribe(serve)
  }, [runtime])
}
