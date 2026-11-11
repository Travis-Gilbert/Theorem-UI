// SOURCING: Theorem's runs.command(input) inbox contract and the shipped SDK's
// typed RunCommand.text. A send's identity lives in sessionStorage before HTTP,
// just as an ordinary chat send does in send-recovery.ts.
import { describeError, mutate, theorem } from './client'

const PREFIX = 'theorem.pending-run-input:'

export type RunInputEnvelope = {
  threadId: string
  runId: string
  key: string
  text: string
}

export type RunInputState =
  | {
      kind: 'unresolved'
      envelope: RunInputEnvelope
      pending: boolean
      message: string
    }
  | {
      kind: 'accepted' | 'closed' | 'refused'
      envelope: RunInputEnvelope
      message: string
    }
  | { kind: 'unavailable'; message: string; uncertain: boolean }
  | {
      kind: 'released'
      envelope?: RunInputEnvelope
      message: string
      uncertain: boolean
    }

type StorageLike = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>
type Dispatch = (
  envelope: RunInputEnvelope,
  replay: boolean,
) => Promise<unknown>

function object(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object'
    ? (value as Record<string, unknown>)
    : {}
}

function envelopeOf(value: unknown, threadId: string): RunInputEnvelope {
  const entry = object(value)
  if (
    entry.threadId !== threadId ||
    !['threadId', 'runId', 'key', 'text'].every(
      (key) => typeof entry[key] === 'string' && entry[key].length > 0,
    )
  )
    throw new Error('Invalid saved run input')
  return entry as RunInputEnvelope
}

/** A confirmed receipt must belong to this run and contain this exact input. */
function receiptOf(
  value: unknown,
  envelope: RunInputEnvelope,
  inputId?: string,
) {
  const event = object(value)
  const part = object(object(event.payload).part)
  if (
    event.runId !== envelope.runId ||
    (inputId
      ? part.inputId !== inputId
      : event.idempotencyKey !== `chat-command:${envelope.key}`) ||
    part.type !== 'user_input' ||
    typeof part.inputId !== 'string' ||
    part.inputId.length === 0 ||
    part.text !== envelope.text ||
    !['queued', 'delivered', 'not_delivered'].includes(String(part.status))
  )
    throw new Error('The server did not confirm this message.')
  return part
}

/**
 * One unresolved input per thread. Neither a changed draft nor a new run may
 * replace it: only replaying its original request can resolve uncertain delivery.
 * The transport is injectable so tests use the real SDK with controlled HTTP.
 */
export function createRunInputSender(storage: StorageLike, dispatch: Dispatch) {
  const states = new Map<string, RunInputState | undefined>()
  const listeners = new Set<() => void>()
  const slot = (threadId: string) => `${PREFIX}${threadId}`
  const publish = (threadId: string, state: RunInputState | undefined) => {
    states.set(threadId, state)
    for (const listener of listeners) listener()
  }
  const getState = (threadId: string): RunInputState | undefined => {
    if (!states.has(threadId)) {
      try {
        const saved = storage.getItem(slot(threadId))
        states.set(
          threadId,
          saved
            ? {
                kind: 'unresolved',
                envelope: envelopeOf(JSON.parse(saved), threadId),
                pending: false,
                message:
                  'The previous message is awaiting confirmation. Retry that message before sending another.',
              }
            : undefined,
        )
      } catch {
        states.set(threadId, {
          kind: 'unavailable',
          uncertain: true,
          message:
            'The saved message could not be read. Reset its saved delivery state to keep editing; your draft is unchanged.',
        })
      }
    }
    return states.get(threadId)
  }

  const attempt = async (
    envelope: RunInputEnvelope,
    replay: boolean,
  ): Promise<RunInputState> => {
    const { threadId } = envelope
    publish(threadId, {
      kind: 'unresolved',
      envelope,
      pending: true,
      message: 'Sending to the current response…',
    })
    let settled: RunInputState
    try {
      const answer = await dispatch(envelope, replay)
      const proof = object(answer)
      const accepted = receiptOf(proof.accepted ?? answer, envelope)
      const part = proof.latest
        ? receiptOf(proof.latest, envelope, accepted.inputId as string)
        : accepted
      settled = {
        kind: part.status === 'not_delivered' ? 'closed' : 'accepted',
        envelope,
        message:
          part.status === 'not_delivered'
            ? 'The run did not take this message. Your draft is still here; send it when the response finishes.'
            : part.status === 'delivered'
              ? 'Your message was delivered to the response.'
              : 'Message accepted. Delivery is tracked in the response.',
      }
    } catch (error) {
      const code = object(object(error).body).code
      // These are explicit inbox refusals. Network/proxy errors, unfamiliar
      // errors, and malformed success responses remain uncertain and replayable.
      settled =
        code === 'run_input_closed' && !replay
          ? {
              kind: 'closed',
              envelope,
              message:
                'The run finished before taking this message. Your draft is still here; send it again once the response finishes.',
            }
          : !replay &&
              (code === 'run_input_empty' || code === 'run_input_too_large')
            ? { kind: 'refused', envelope, message: describeError(error) }
            : {
                kind: 'unresolved',
                envelope,
                pending: false,
                message:
                  code === 'run_input_closed'
                    ? 'The run is closed, but earlier delivery is still unconfirmed. Retry checks the saved response; your draft is unchanged.'
                    : 'Delivery could not be confirmed. Retry the previous message to check it safely; your draft is unchanged.',
              }
    }
    if (settled.kind !== 'unresolved') {
      try {
        storage.removeItem(slot(threadId))
      } catch {
        // Do not admit another message if a reload would replay the old one.
        settled = {
          kind: 'unresolved',
          envelope,
          pending: false,
          message:
            'The reply was received, but its saved request could not be cleared. Retry the previous message before sending another.',
        }
      }
    }
    publish(threadId, settled)
    return settled
  }

  return {
    getState,
    clearNotice(threadId: string) {
      const state = getState(threadId)
      if (
        state?.kind === 'accepted' ||
        state?.kind === 'closed' ||
        state?.kind === 'refused' ||
        state?.kind === 'released'
      )
        publish(threadId, undefined)
    },
    /** Explicitly stop recovery; this never sends, cancels, or undoes a message. */
    reset(threadId: string) {
      const state = getState(threadId)
      if (state?.kind === 'unresolved' && state.pending) return false
      if (state?.kind !== 'unresolved' && state?.kind !== 'unavailable')
        return false
      try {
        storage.removeItem(slot(threadId))
        const uncertain = state.kind === 'unresolved' || state.uncertain
        publish(threadId, {
          kind: 'released',
          ...(state.kind === 'unresolved' ? { envelope: state.envelope } : {}),
          uncertain,
          message: uncertain
            ? 'Recovery stopped. Earlier delivery is still unknown; your draft is unchanged.'
            : 'Saved delivery state reset. Your draft is unchanged.',
        })
        return true
      } catch {
        publish(threadId, {
          ...state,
          message:
            'The saved request could not be cleared. Allow this site to use session storage, then reset again. Your draft is unchanged.',
        })
        return false
      }
    },
    subscribe(listener: () => void) {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },
    send(threadId: string, runId: string, text: string) {
      const current = getState(threadId)
      if (
        !text.trim() ||
        current?.kind === 'unresolved' ||
        current?.kind === 'unavailable'
      )
        return undefined
      const envelope = { threadId, runId, text, key: crypto.randomUUID() }
      try {
        storage.setItem(slot(threadId), JSON.stringify(envelope))
      } catch {
        const unavailable: RunInputState = {
          kind: 'unavailable',
          uncertain: false,
          message:
            'This message could not be saved for retry, so it was not sent. Your draft is unchanged.',
        }
        publish(threadId, unavailable)
        return Promise.resolve(unavailable)
      }
      return attempt(envelope, false)
    },
    retry(threadId: string) {
      const state = getState(threadId)
      return state?.kind === 'unresolved' && !state.pending
        ? attempt(state.envelope, true)
        : undefined
    },
  }
}

type RunInputPage = {
  runId: string
  events: unknown[]
  hasMore: boolean
  nextAfterSeq: number
}

/**
 * A restarted server loses its live inbox cache. Its durable event retains the
 * exact chat-command key; text equality alone cannot identify a retried input.
 * Later parts with that inputId determine whether it was actually delivered.
 */
export async function findRunInputReceipt(
  envelope: RunInputEnvelope,
  read: (after: number) => Promise<RunInputPage>,
) {
  let after = 0
  let accepted: unknown
  let latest: unknown
  let inputId: string | undefined
  for (let page = 0; page < 20; page++) {
    const snapshot = await read(after)
    if (
      snapshot.runId !== envelope.runId ||
      !Array.isArray(snapshot.events) ||
      typeof snapshot.hasMore !== 'boolean'
    )
      throw new Error('Invalid run history')
    for (const value of snapshot.events) {
      const event = object(value)
      const part = object(object(event.payload).part)
      if (event.idempotencyKey === `chat-command:${envelope.key}`) {
        inputId = receiptOf(event, envelope).inputId as string
        accepted = event
        latest = event
      } else if (inputId && part.inputId === inputId) {
        receiptOf(event, envelope, inputId)
        latest = event
      }
    }
    if (!snapshot.hasMore) return accepted ? { accepted, latest } : undefined
    if (
      !Number.isFinite(snapshot.nextAfterSeq) ||
      snapshot.nextAfterSeq <= after
    )
      throw new Error('Run history did not advance')
    after = snapshot.nextAfterSeq
  }
  throw new Error('Run history is still awaiting confirmation')
}

/** Sending input never calls cancel, append, or the ordinary message endpoint. */
export const dispatchRunInput: Dispatch = async (envelope, replay) => {
  try {
    return await mutate(
      (headers) =>
        theorem().chat.runs.command(
          {
            ...headers,
            runId: envelope.runId,
            command: 'input',
            text: envelope.text,
          },
          { timeoutInSeconds: 30, maxRetries: 0 },
        ),
      envelope.key,
    )
  } catch (error) {
    if (!replay || object(object(error).body).code !== 'run_input_closed')
      throw error
    const abortSignal = AbortSignal.timeout(30_000)
    const receipt = await findRunInputReceipt(envelope, (after_seq) =>
      theorem().chat.runs.get(
        { runId: envelope.runId, after_seq, limit: 100 },
        { abortSignal, maxRetries: 0 },
      ),
    )
    if (receipt) return receipt
    throw error
  }
}

let sender: ReturnType<typeof createRunInputSender> | undefined

/** Lazy browser access keeps server rendering free of storage side effects. */
export function runInputSender() {
  return (sender ??= createRunInputSender(
    {
      getItem: (key) => window.sessionStorage.getItem(key),
      setItem: (key, value) => window.sessionStorage.setItem(key, value),
      removeItem: (key) => window.sessionStorage.removeItem(key),
    },
    dispatchRunInput,
  ))
}
