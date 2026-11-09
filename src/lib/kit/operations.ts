// SOURCING: Theorem's Kit contract (theorem-surface-contracts kit: the declarations in contract/operations.json and the ts-rs types beside it, copied from rustyredcore_THG/bindings/theorem-surface-contracts/kit), each declaration's input schema turned into a validator by zod's fromJSONSchema, so the page admits exactly what Theorem declares; Theorem's client operations (theorem-surface-contracts client_operation: a page declares operations in `clientOperations` beside `clientSurface` on its send, each becomes a tool of the turn, a call streams a `client_operation` part in state `pending`, and the page answers with a `client-operation-receipt` command through @theoremharness/sdk's chat.runs.command); assistant-ui ThreadMessage content as the SDK adapter maps that part (`theorem-client_operation` data); @tanstack/react-query's MutationObserver retries a receipt that failed to post, with backoff, pausing while offline
import type { ThreadMessage } from '@assistant-ui/react'
import type { Theorem } from '@theoremharness/sdk'
import { MutationObserver, QueryClient } from '@tanstack/react-query'
import { useEffect } from 'react'
import { z } from 'zod'
import { hasStatus, mutate, theorem } from '@/lib/theorem/client'
import type { KitChoreographArgs } from './contract/KitChoreographArgs'
import type { KitFlingArgs } from './contract/KitFlingArgs'
import type { KitFollowArgs } from './contract/KitFollowArgs'
import type { KitGesture } from './contract/KitGesture'
import type { KitGestureArgs } from './contract/KitGestureArgs'
import type { KitJumpArgs } from './contract/KitJumpArgs'
import type { KitMoveArgs } from './contract/KitMoveArgs'
import type { KitPointAtArgs } from './contract/KitPointAtArgs'
import type { KitSayArgs } from './contract/KitSayArgs'
import type { KitStep } from './contract/KitStep'
import type { KitStepOutcome } from './contract/KitStepOutcome'
import operations from './contract/operations.json'
import { KitRefusal, kitDriver } from './driver'
import type { KitDriver } from './driver'
import { KIT_SHEET, tagLength } from './sheet'
import type { KitTag } from './sheet'
import { changeStage, perchLine, sceneOf, shownTag, useKitStage } from './stage'
import type { Gait, Scene } from './stage'
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
 * How long a choreography may play before its remaining steps are cut: a
 * visitor's run waits 20 seconds for a receipt, and the receipt must make it.
 */
export const CHOREOGRAPHY_MS = 15_000

/**
 * The operations a turn declares, as Theorem's `kit_operations()` writes them:
 * what Kit is, what each does, and the schema of its arguments.
 */
export const KIT_OPERATIONS =
  operations as readonly Theorem.ClientOperationDeclaration[]

/** Each operation's arguments as its declaration admits them. */
const VALIDATORS = new Map(
  KIT_OPERATIONS.map((operation) => [
    operation.name,
    z.fromJSONSchema(
      operation.inputSchema as Parameters<typeof z.fromJSONSchema>[0],
    ),
  ]),
)

/** Reads a request's arguments by its declaration, or says what is wrong with them. */
function parse<T>(
  operation: string,
  args: unknown,
): { ok: true; args: T } | { ok: false; reason: string } {
  const validator = VALIDATORS.get(operation)
  if (!validator)
    return { ok: false, reason: `Kit has no operation ${operation}` }
  const parsed = validator.safeParse(args)
  if (parsed.success) return { ok: true, args: parsed.data as T }
  const [issue] = parsed.error.issues
  const where = issue?.path.length ? `${issue.path.join('.')}: ` : ''
  return {
    ok: false,
    reason: `${where}${issue?.message ?? 'invalid arguments'}`,
  }
}

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
  /** A choreography's steps, each as it ended. */
  readonly steps?: readonly KitStepOutcome[]
}

/** What Kit is doing, in the words its status uses. */
export function kitScene(
  now = Date.now(),
  steps?: readonly KitStepOutcome[],
): Scene {
  const stage = useKitStage.getState()
  const { act, liveness } = useKit.getState()
  return sceneOf(
    stage,
    describeKit(liveness, shownTag(stage, act, now).tag),
    now,
    steps,
  )
}

const STOPPED =
  'Kit was stopped on the way: the person picked it up, or another move began'

/** Runs one of Kit's body's moves, a refusal answered as rejected. */
async function body(
  move: (driver: KitDriver) => Promise<Answer>,
): Promise<Answer> {
  const driver = kitDriver()
  if (!driver) return { outcome: 'rejected', reason: 'Kit is not on screen' }
  try {
    return await move(driver)
  } catch (error) {
    if (error instanceof KitRefusal)
      return { outcome: 'rejected', reason: error.message }
    throw error
  }
}

const sleep = (ms: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, Math.max(0, ms)))

/** Waits until the gesture playing now has played out. */
const gestureEnds = () => {
  const { gesture } = useKitStage.getState()
  return gesture ? sleep(gesture.until - Date.now()) : Promise.resolve()
}

function moveKit({ to, at = 0.5, gait = 'walk' }: KitMoveArgs) {
  return body(async (driver) =>
    (await driver.moveTo(to, at, gait))
      ? { outcome: 'applied' }
      : { outcome: 'interrupted', reason: STOPPED },
  )
}

function jumpKit({ to, at = 0.5, style = 'arc' }: KitJumpArgs) {
  return body(async (driver) => {
    if (await driver.jumpTo(to, at, style)) return { outcome: 'applied' }
    const { perch } = useKitStage.getState()
    return {
      outcome: 'interrupted',
      reason:
        perch === to
          ? STOPPED
          : `Kit came down on ${perch} instead: ${to} moved, or Kit was stopped`,
    }
  })
}

function flingKit({ direction, strength = 0.6 }: KitFlingArgs) {
  return body(async (driver) =>
    (await driver.fling(direction, strength)) === undefined
      ? { outcome: 'interrupted', reason: STOPPED }
      : { outcome: 'applied' },
  )
}

function pointKit({ target }: KitPointAtArgs, now = Date.now()) {
  return body(async (driver) => {
    if (!(await driver.pointAt(target)))
      return { outcome: 'interrupted', reason: STOPPED }
    playGesture('point', now)
    return { outcome: 'applied' }
  })
}

/** One step of a choreography, carried out as its operation would be. */
async function playStep(step: KitStep): Promise<Answer> {
  switch (step.op) {
    case 'move':
      return moveKit(step)
    case 'jump':
      return jumpKit(step)
    case 'fling':
      return flingKit(step)
    case 'point_at': {
      const answer = await pointKit(step)
      await gestureEnds()
      return answer
    }
    case 'gesture':
      playGesture(step.gesture)
      await gestureEnds()
      return { outcome: 'applied' }
    case 'say': {
      const text = step.text.trim()
      if (!text) return { outcome: 'rejected', reason: 'text is only spaces' }
      say(text)
      return { outcome: 'applied' }
    }
    case 'wait':
      await sleep(step.ms)
      return { outcome: 'applied' }
  }
}

/**
 * Plays steps in order. A step that does not finish ends the piece, and the
 * steps after it are reported as interrupted, as are any the time runs out on.
 */
async function choreograph({ steps }: KitChoreographArgs): Promise<Answer> {
  const started = Date.now()
  const outcomes: KitStepOutcome[] = []
  let ended: string | undefined
  for (const step of steps) {
    if (ended) {
      outcomes.push({ op: step.op, outcome: 'interrupted', reason: ended })
      continue
    }
    const left = CHOREOGRAPHY_MS - (Date.now() - started)
    if (left <= 0) {
      ended = 'the piece ran out of time'
      outcomes.push({ op: step.op, outcome: 'interrupted', reason: ended })
      continue
    }
    let answer: Answer
    let timer: ReturnType<typeof setTimeout> | undefined
    try {
      answer = await Promise.race([
        playStep(step),
        new Promise<Answer>((resolve) => {
          timer = setTimeout(() => {
            kitDriver()?.interrupt()
            resolve({
              outcome: 'interrupted',
              reason: 'the piece ran out of time',
            })
          }, left)
        }),
      ])
    } catch (error) {
      answer = {
        outcome: 'failed',
        reason: error instanceof Error ? error.message : String(error),
      }
    } finally {
      // A step that finished must not stop whatever Kit does next.
      clearTimeout(timer)
    }
    outcomes.push({
      op: step.op,
      outcome: answer.outcome,
      ...(answer.reason && { reason: answer.reason }),
    })
    if (answer.outcome !== 'applied')
      ended = `step ${outcomes.length} (${step.op}) did not finish`
  }
  const applied = outcomes.filter((step) => step.outcome === 'applied').length
  if (applied === outcomes.length)
    return { outcome: 'applied', steps: outcomes }
  const first = outcomes.find((step) => step.outcome !== 'applied')
  return {
    outcome: applied > 0 ? 'interrupted' : (first?.outcome ?? 'interrupted'),
    reason: first?.reason,
    steps: outcomes,
  }
}

/** Carries out one request on the stage, its arguments read by the operation's own declaration. */
export async function applyKitRequest(
  request: Pick<KitRequest, 'operation' | 'args'>,
  now = Date.now(),
): Promise<Answer> {
  const { operation } = request
  const parsed = parse<unknown>(operation, request.args)
  if (!parsed.ok) return { outcome: 'rejected', reason: parsed.reason }
  if (operation === 'kit.look') return { outcome: 'applied' }
  if (!useKitStage.getState().mounted)
    return { outcome: 'rejected', reason: 'Kit is not on screen' }
  const args = parsed.args
  switch (operation) {
    case 'kit.move':
      return moveKit(args as KitMoveArgs)
    case 'kit.jump':
      return jumpKit(args as KitJumpArgs)
    case 'kit.fling':
      return flingKit(args as KitFlingArgs)
    case 'kit.point_at':
      return pointKit(args as KitPointAtArgs, now)
    case 'kit.follow': {
      const { target, seconds = 8 } = args as KitFollowArgs
      if (target !== 'cursor' && !perchLine(target))
        return {
          outcome: 'rejected',
          reason: `there is no ${target} on screen now`,
        }
      // It answers as it starts: the run need not wait out the follow.
      return body(async (driver) => {
        driver.follow(target, seconds)
        return { outcome: 'applied' }
      })
    }
    case 'kit.choreograph':
      return choreograph(args as KitChoreographArgs)
    case 'kit.gesture':
      playGesture((args as KitGestureArgs).gesture, now)
      return { outcome: 'applied' }
    case 'kit.say': {
      const text = (args as KitSayArgs).text.trim()
      if (!text) return { outcome: 'rejected', reason: 'text is only spaces' }
      say(text, now)
      return { outcome: 'applied' }
    }
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

/** The run whose `kit.follow` Kit is carrying out; the follow ends with that run's turn. */
let followRun: string | undefined

/** For tests: forget which requests were served. */
export function resetKitRequests() {
  served.clear()
  queue = Promise.resolve()
  followRun = undefined
}

/**
 * Ends a follow once a conversation shows the run that asked for it has
 * stopped: its message is there and the turn is no longer running it. A
 * conversation without that run says nothing about it.
 */
export function endFollowWhenDone(
  messages: readonly ThreadMessage[],
  running: boolean,
) {
  if (!followRun) return
  const asked = messages.findIndex(
    (message) => record(message.metadata.custom).theoremRunId === followRun,
  )
  if (asked === -1) return
  if (running && asked === messages.length - 1) return
  followRun = undefined
  kitDriver()?.endFollow()
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
        if (request.operation === 'kit.follow') followRun = request.runId
        answer = await applyKitRequest(request)
      } catch (error) {
        answer = {
          outcome: 'failed',
          reason: error instanceof Error ? error.message : String(error),
        }
      }
      const scene = kitScene(Date.now(), answer.steps)
      // The run has now read the person's last touch; the next scene starts without it.
      useKitStage.setState({ touched: undefined })
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
      if (
        request.operation === 'kit.gesture' ||
        request.operation === 'kit.point_at'
      )
        await gestureEnds()
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
      endFollowWhenDone(messages, isRunning)
      void serveKitRequests(kitRequestsOf(messages, isRunning))
    }
    serve()
    return runtime.thread.subscribe(serve)
  }, [runtime])
}
