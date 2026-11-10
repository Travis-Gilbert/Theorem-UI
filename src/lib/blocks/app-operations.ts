// SOURCING: Theorem's client operations (theorem-surface-contracts
// client_operation: a page declares operations in `clientOperations` on its
// send, each becomes a tool of the turn, a call streams a `client_operation`
// part in state `pending`, and the page answers with a
// `client-operation-receipt` command through @theoremharness/sdk's
// chat.runs.command), as Kit's operations use them (lib/kit/operations.ts);
// @tanstack/react-query's MutationObserver retries a receipt that failed to
// post. What the operations are is this app's: the agent asks the page to
// check an App, because the compiler and the sandbox are in the page.
import type { ThreadMessage } from '@assistant-ui/react'
import { MutationObserver, QueryClient } from '@tanstack/react-query'
import { useEffect } from 'react'
import { appDocumentFor } from '@/lib/theorem/apps'
import { hasStatus, mutate, theorem } from '@/lib/theorem/client'
import { MAX_RUN_MS, inspectApp } from './app-inspect'
import type { AppInspection } from './app-inspect'

/** The operation that checks an App, as the turn's tool `app__check`. */
export const APP_CHECK = 'app.check'

/** The largest App a check is given, as the server allows one to be. */
const MAX_HTML = 1024 * 1024

/**
 * The operations every turn declares so the agent can reach the page's
 * compiler: what each does, and the schema of its arguments.
 */
export const APP_OPERATIONS = [
  {
    name: APP_CHECK,
    description:
      "Builds and checks an App in the person's browser and returns what is wrong with it. Pass `html`, a complete App document exactly as it would be published, to check a draft before publishing it; or pass `documentId` to check a published App as it is saved now. The result says whether it built, lists its build, type and runtime problems with file, line and column, and gives what the App showed: its text, and `outline`, each thing on the page by role, name and state as assistive technology reads it, with the source place that made it. Nothing is changed and nothing is shown to the person: the App runs hidden for a moment with no network, empty state and an empty in-memory database, so records it reads are not the person's.",
    effect: 'read',
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      properties: {
        html: {
          type: 'string',
          minLength: 1,
          maxLength: MAX_HTML,
          description: 'A complete App document to check as a draft.',
        },
        documentId: {
          type: 'string',
          minLength: 1,
          maxLength: 200,
          description: 'A published App, checked as it is saved now.',
        },
        runMs: {
          type: 'integer',
          minimum: 0,
          maximum: MAX_RUN_MS,
          description:
            'How long to run the App and listen for errors. 0 builds and checks types without running it. Default 1500.',
        },
      },
    },
  },
] as const

/** What a send carries so the turn can check Apps. */
export const appTurnOptions = () => ({ clientOperations: APP_OPERATIONS })

/** One request the run made of the page's App operations, read off a message. */
export interface AppRequest {
  readonly runId: string
  readonly requestRef: string
  readonly operation: string
  readonly args: Record<string, unknown>
  /** The page revision the run expects; a check changes nothing, so it is the receipt's too. */
  readonly expectedRevision: number
}

const record = (value: unknown): Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {}

/**
 * The App requests pending in the conversation's live turn: the last
 * assistant message, while it runs.
 */
export function appRequestsOf(
  messages: readonly ThreadMessage[],
  running: boolean,
): Array<AppRequest> {
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
      !operation.startsWith('app.')
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

type Outcome = 'applied' | 'rejected' | 'failed'

/** What the page says back: the check's findings, or why there are none. */
export interface AppAnswer {
  readonly outcome: Outcome
  readonly reason?: string
  readonly result?: AppInspection & {
    /** The saved revision that was checked, when a published App was. */
    revision?: string
  }
}

/** What answering needs of the page: the check, and an App's saved source. */
export interface AppOperationHost {
  inspect: typeof inspectApp
  load: (
    documentId: string,
  ) => Promise<{ html: string; revision: { position: unknown } }>
}

const pageHost: AppOperationHost = {
  inspect: inspectApp,
  load: (documentId) => appDocumentFor(documentId).load(),
}

const failure = (error: unknown) =>
  error instanceof Error ? error.message : String(error)

/**
 * Answers one request. A check that finds problems is `applied`: the check
 * was made, and its result says what it found. `failed` is a check that could
 * not be made.
 */
export async function answerAppRequest(
  request: AppRequest,
  host: AppOperationHost = pageHost,
): Promise<AppAnswer> {
  if (request.operation !== APP_CHECK)
    return {
      outcome: 'rejected',
      reason: `This page has no operation ${request.operation}.`,
    }
  const { html, documentId, runMs } = request.args
  const options = typeof runMs === 'number' ? { runMs } : {}
  try {
    if (typeof html === 'string' && html)
      return { outcome: 'applied', result: await host.inspect(html, options) }
    if (typeof documentId === 'string' && documentId) {
      const saved = await host.load(documentId)
      return {
        outcome: 'applied',
        result: {
          ...(await host.inspect(saved.html, options)),
          revision: String(saved.revision.position),
        },
      }
    }
  } catch (error) {
    return { outcome: 'failed', reason: failure(error) }
  }
  return {
    outcome: 'rejected',
    reason: 'Pass html to check a draft, or documentId to check a saved App.',
  }
}

export interface AppReceipt extends AppAnswer {
  readonly revision: number
}

function postReceipt(request: AppRequest, receipt: AppReceipt) {
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
let queue: Promise<void> = Promise.resolve()

/**
 * Answers each request once, whichever conversation reports it, one at a
 * time: the checker is one worker and a run is one frame. A receipt that
 * fails to post is sent again; the check is not made again.
 */
export function serveAppRequests(
  requests: ReadonlyArray<AppRequest>,
  post: (
    request: AppRequest,
    receipt: AppReceipt,
  ) => Promise<unknown> = postReceipt,
  host: AppOperationHost = pageHost,
  retryDelay: (failures: number) => number = receiptDelay,
): Promise<void> {
  for (const request of requests) {
    if (served.has(request.requestRef)) continue
    served.add(request.requestRef)
    queue = queue.then(async () => {
      const answer = await answerAppRequest(request, host)
      await new MutationObserver(receipts, {
        mutationFn: (receipt: AppReceipt) => post(request, receipt),
        retry: (failures, error) =>
          failures < RECEIPT_RETRIES && !hasStatus(error, 400, 404, 409, 422),
        retryDelay,
      })
        .mutate({ ...answer, revision: request.expectedRevision })
        .catch((error: unknown) => {
          console.warn('The App check could not answer its run', error)
        })
    })
  }
  return queue
}

/** The part of an assistant-ui thread runtime requests are read from. */
interface ThreadSource {
  readonly thread: {
    getState: () => {
      readonly messages: readonly ThreadMessage[]
      readonly isRunning: boolean
    }
    subscribe: (callback: () => void) => () => void
  }
}

/** Serves App requests from one conversation for as long as it is mounted. */
export function useAppRequests(runtime: ThreadSource) {
  useEffect(() => {
    const serve = () => {
      const { messages, isRunning } = runtime.thread.getState()
      void serveAppRequests(appRequestsOf(messages, isRunning))
    }
    serve()
    return runtime.thread.subscribe(serve)
  }, [runtime])
}
