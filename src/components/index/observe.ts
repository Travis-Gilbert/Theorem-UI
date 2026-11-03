// SOURCING: none — batches the Index's observation events for POST /api/index/v1/observations; flushing on visibilitychange with fetch keepalive is the browser's documented pattern for end-of-session beacons, and no library models this contract
import { recordObservations } from './api'
import type { ObservationEvent } from './contract'
import { isDefaultView } from './programs'

/** The route takes at most this many events per request. */
export const MAX_BATCH = 100

type Send = (
  sessionId: string,
  events: ObservationEvent[],
  keepalive: boolean,
) => Promise<unknown>

/**
 * Collects observations and sends them in batches. A batch leaves after
 * `delayMs` of quiet or when it reaches `MAX_BATCH`; `flush` sends what is
 * queued at once. A failed send is dropped: observations are evidence for
 * the improver, never state the person depends on.
 */
export function createRecorder({
  sessionId,
  send,
  delayMs = 4000,
}: {
  sessionId: string
  send: Send
  delayMs?: number
}) {
  let queue: ObservationEvent[] = []
  let timer: ReturnType<typeof setTimeout> | undefined

  const flush = (keepalive = false) => {
    if (timer !== undefined) clearTimeout(timer)
    timer = undefined
    while (queue.length) {
      const batch = queue.slice(0, MAX_BATCH)
      queue = queue.slice(MAX_BATCH)
      void send(sessionId, batch, keepalive).catch(() => undefined)
    }
  }

  const record = ({
    viewId,
    ...event
  }: Omit<ObservationEvent, 'atMs'> & { atMs?: number }) => {
    // Theorem refuses a batch naming a view it does not store; a built-in
    // view is already identified by the event's scope.
    queue.push({
      ...event,
      ...(viewId && !isDefaultView(viewId) && { viewId }),
      atMs: event.atMs ?? Date.now(),
    })
    if (queue.length >= MAX_BATCH) return flush()
    if (timer !== undefined) clearTimeout(timer)
    timer = setTimeout(() => flush(), delayMs)
  }

  return { record, flush, pending: () => queue.length }
}

export type Recorder = ReturnType<typeof createRecorder>

let recorder: Recorder | undefined

/** One recorder per page load; its session id is what the improver counts as a session. */
export function observer(): Recorder {
  if (recorder) return recorder
  const created = createRecorder({
    sessionId: crypto.randomUUID(),
    send: recordObservations,
  })
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') created.flush(true)
  })
  recorder = created
  return created
}
