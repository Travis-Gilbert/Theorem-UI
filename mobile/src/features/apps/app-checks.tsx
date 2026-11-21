// SOURCING: ./app-host-view (a hidden web App host runs the web's own check, Theorem-UI src/lib/blocks/app-operations.ts answerAppRequest); @theoremharness/sdk chat.runs.command with `client-operation-receipt`, as phone-actions/event-card.tsx answers its requests
//
// The agent asks the page it is talking to to build and check an App
// (`app.check`). On the phone that page is a web App host kept out of sight
// while a conversation is open. Each request is answered once, one at a time.
// The host has a startup deadline and a load-failure path, so a check never
// waits forever for a `ready` that never comes, and leaving the screen settles
// local work without stopping the run on Theorem.
import { createContext, useCallback, useContext, useEffect, useRef, type ReactNode } from 'react'
import { StyleSheet, View } from 'react-native'
import { mutate, theorem } from '@/lib/theorem'
import { StatusLabel } from '@/ui/status'
import { Text } from '@/ui/text'
import { AppHostView, type AppHostHandle } from './app-host-view'
import { appCheckProblems, appCheckWords } from './operations'
import type { AppAnswer } from './protocol'

/** How long a check may take, host startup included, before it is reported as not made. */
const CHECK_TIMEOUT_MS = 60_000

export type AppRequest = {
  requestRef: string
  operation: string
  state: string
  args: Record<string, unknown>
  expectedRevision: number
}

/** Answers a pending request once per session; a reopened screen answers again. */
type Answer = (runId: string, request: AppRequest) => Promise<void>

const AnswerContext = createContext<Answer | undefined>(undefined)

/** A readiness deferred that can resolve (host ready) or reject (host failed). */
function makeReady() {
  let resolve = () => {}
  let reject = (_error: Error) => {}
  const promise = new Promise<void>((res, rej) => {
    resolve = res
    reject = rej
  })
  // No check may be awaiting when the host fails; do not leave an unhandled rejection.
  promise.catch(() => {})
  return { promise, resolve, reject }
}

/** Holds the hidden App host for the conversation screen and checks Apps in it, one at a time. */
export function AppChecks({ children }: { children: ReactNode }) {
  const host = useRef<AppHostHandle>(null)
  const ready = useRef<ReturnType<typeof makeReady>>(undefined)
  if (!ready.current) ready.current = makeReady()
  const waiting = useRef(new Map<string, (answer: AppAnswer) => void>())
  const queue = useRef<Promise<unknown>>(Promise.resolve())
  const answered = useRef(new Map<string, Promise<void>>())
  const disposed = useRef(false)
  // Bumped on each lifecycle so completions from a previous one send no receipt.
  const lifecycle = useRef(0)

  const check = useCallback((operation: string, args: Record<string, unknown>): Promise<AppAnswer> => {
    const gen = lifecycle.current
    const run = queue.current.then(() => {
      // A queued check whose screen has gone (or refreshed) settles at once,
      // without leaving a timer or waiter behind for a host that will not answer.
      if (disposed.current || gen !== lifecycle.current)
        return { outcome: 'failed', reason: 'The App host closed before the check finished.' }
      const id = `${Date.now()}-${Math.random().toString(36).slice(2)}`
      return new Promise<AppAnswer>((resolve) => {
        // The deadline starts here, before the wait for readiness, so a host that
        // never sends `ready` is covered by it rather than blocking the queue.
        const timer = setTimeout(() => {
          waiting.current.delete(id)
          resolve({ outcome: 'failed', reason: 'The App check on the phone did not finish in time.' })
        }, CHECK_TIMEOUT_MS)
        waiting.current.set(id, (answer) => {
          clearTimeout(timer)
          waiting.current.delete(id)
          resolve(answer)
        })
        ready.current!.promise.then(
          () => {
            if (!disposed.current && gen === lifecycle.current)
              host.current?.send({ type: 'check', id, operation, args })
          },
          (error: Error) => waiting.current.get(id)?.({ outcome: 'failed', reason: error.message }),
        )
      })
    })
    queue.current = run.catch(() => undefined)
    return run
  }, [])

  /** A terminal host failure settles readiness and every check waiting on an answer. */
  const failHost = useCallback((reason: string) => {
    ready.current?.reject(new Error(reason))
    for (const settle of waiting.current.values()) settle({ outcome: 'failed', reason })
    waiting.current.clear()
  }, [])

  const answer = useCallback<Answer>(
    (runId, request) => {
      const key = `${runId}:${request.requestRef}`
      const gen = lifecycle.current
      let sent = answered.current.get(key)
      if (!sent) {
        sent = check(request.operation, request.args).then((result) => {
          // Abandoned or previous-lifecycle work sends no receipt: a reopened or
          // refreshed screen retries under the same idempotency key instead.
          if (disposed.current || gen !== lifecycle.current) return
          return mutate(`receipt:${key}`, (headers) =>
            theorem().chat.runs.command({
              runId,
              command: 'client-operation-receipt',
              requestRef: request.requestRef,
              // A check changes nothing, so its revision is the one the run expects.
              receipt: { ...result, revision: request.expectedRevision },
              ...headers,
            }),
          ).then(() => undefined)
        })
        answered.current.set(key, sent)
        sent.catch(() => answered.current.delete(key))
      }
      return sent
    },
    [check],
  )

  // Leaving the screen settles local work and forgets it, so a reopened
  // conversation creates a fresh readiness wait and can answer again. The run
  // on Theorem is not stopped.
  useEffect(() => {
    // A restart (Fast Refresh) keeps refs but reruns this effect: the retained
    // readiness was rejected by cleanup, so make a fresh one that later `ready`
    // messages can resolve, and mark a new lifecycle for the receipt guard.
    if (disposed.current) {
      lifecycle.current += 1
      ready.current = makeReady()
    }
    disposed.current = false
    return () => {
      disposed.current = true
      for (const settle of waiting.current.values())
        settle({ outcome: 'failed', reason: 'The App host closed before the check finished.' })
      waiting.current.clear()
      answered.current.clear()
      ready.current?.reject(new Error('The App host closed.'))
    }
  }, [])

  return (
    <AnswerContext.Provider value={answer}>
      {children}
      <View
        style={styles.hidden}
        pointerEvents="none"
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
      >
        <AppHostView
          ref={host}
          style={styles.fill}
          onHostError={failHost}
          onHostMessage={(message) => {
            if (message.type === 'ready') ready.current!.resolve()
            else if (message.type === 'checked') waiting.current.get(message.id)?.(message.answer)
          }}
        />
      </View>
    </AnswerContext.Provider>
  )
}

/** An App check in a reply: answered from here while the run waits, then what it found. */
export function AppCheckRow({
  request,
  data,
  runId,
  running,
}: {
  request: AppRequest
  data: unknown
  runId: string | undefined
  running: boolean
}) {
  const answer = useContext(AnswerContext)
  useEffect(() => {
    if (answer && runId && request.state === 'pending') void answer(runId, request)
  }, [answer, runId, request])
  const { words, pending, wrong } = appCheckWords(data, running)
  const problems = appCheckProblems(data)
  return (
    <View style={styles.row}>
      <StatusLabel tone={pending ? 'live' : wrong ? 'attention' : 'success'} label={words} />
      {problems.map((line, index) => (
        <Text key={index} variant="code" tone="muted" selectable numberOfLines={3}>
          {line}
        </Text>
      ))}
    </View>
  )
}

const styles = StyleSheet.create({
  // Laid out at a phone's width so the App draws as it would, but not seen.
  hidden: { position: 'absolute', left: -10000, top: 0, width: 390, height: 768, opacity: 0 },
  fill: { flex: 1 },
  row: { gap: 4 },
})
