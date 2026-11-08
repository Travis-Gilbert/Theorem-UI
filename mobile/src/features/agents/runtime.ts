// SOURCING: @assistant-ui/react-native useExternalStoreRuntime (messages, isRunning, isSendDisabled, onNew, onCancel); react-native AppState; expo-crypto randomUUID
//
// A Claude Code or Codex conversation on a computer, as assistant-ui sees it.
// The agent's own log is the conversation: Theorem reads it over SSH and
// never keeps a second copy. Sending types into the tmux pane running the
// agent, only while the agent still holds that pane's terminal; Stop presses
// Escape there. Leaving the screen stops reading, never the agent.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { AppState } from 'react-native'
import * as Crypto from 'expo-crypto'
import {
  useExternalStoreRuntime,
  type AppendMessage,
  type AssistantRuntime,
  type ThreadMessageLike,
} from '@assistant-ui/react-native'
import { onDraftChanged, readDraft, setCurrentThread, writeDraft } from '@/lib/drafts'
import { livenessOf, parseDiscovery, type Liveness } from './discovery'
import { LogFollower } from './log-reader'
import { HostKeyError, runnerFor } from './remote'
import { afterMark, agentName, interruptScript, liveScript, sendScript, type Agent } from './shell'
import { toMessages, type Transcript } from './transcript'

export type AgentTarget = { computerId: string; agent: Agent; path: string }

/** Polling while the agent works, and while it waits. */
const BUSY_MS = 2_000
const IDLE_MS = 6_000
/** A step this old with no result is probably a permission prompt in the terminal. */
const PROMPT_HINT_MS = 30_000

export class SendUncertainError extends Error {
  constructor(agent: Agent, cause: unknown) {
    super(
      `Theorem could not confirm the message reached ${agentName[agent]}. It is back in the composer: check the conversation before you send it again.`,
      { cause },
    )
    this.name = 'SendUncertainError'
  }
}

/** Nothing was typed: the agent no longer holds its terminal. */
export class AgentGoneError extends Error {
  constructor(agent: Agent) {
    super(`${agentName[agent]} is no longer running in its terminal, so nothing was sent. Your message is back in the composer.`)
    this.name = 'AgentGoneError'
  }
}

export type AgentView = {
  runtime: AssistantRuntime
  transcript: Transcript
  /** Undefined until the first check of the computer. */
  liveness: Liveness | undefined
  tmux: boolean
  reading: 'loading' | 'ready' | 'missing'
  /** Why the last read or check failed. A HostKeyError pauses reading until retry. */
  error: unknown
  sendError: unknown
  /** Only the end of a long log is shown. */
  startedMidway: boolean
  /** A step has waited long enough that the agent is probably asking something in the terminal. */
  waitingOnTerminal: boolean
  retry: () => void
}

const textOf = (message: AppendMessage) =>
  message.content
    .flatMap((part) => (part.type === 'text' ? [part.text] : []))
    .join('\n\n')
    .trim()

const userTurns = (transcript: Transcript) => transcript.turns.filter((turn) => turn.role === 'user').length

/** The newest step still waiting for its result, while the agent is working. */
function openStep(transcript: Transcript): string | undefined {
  if (!transcript.open) return undefined
  const last = transcript.turns.at(-1)
  if (last?.role !== 'assistant') return undefined
  for (let i = last.blocks.length - 1; i >= 0; i--) {
    const block = last.blocks[i]!
    if (block.type === 'step') return block.step.done ? undefined : block.step.id
  }
  return undefined
}

export function useAgentConversation({ computerId, agent, path }: AgentTarget): AgentView {
  const draftKey = `agent:${computerId}:${path}`
  const run = useMemo(() => runnerFor(computerId), [computerId])
  const follower = useMemo(() => new LogFollower(agent, path), [agent, path])
  const [version, setVersion] = useState(0)
  const [liveness, setLiveness] = useState<Liveness>()
  const [tmux, setTmux] = useState(true)
  const [reading, setReading] = useState<AgentView['reading']>('loading')
  const [error, setError] = useState<unknown>()
  const [sendError, setSendError] = useState<unknown>()
  const [pending, setPending] = useState<{ text: string; turns: number }>()
  const [generation, setGeneration] = useState(0)
  const [stepSince, setStepSince] = useState<{ id: string; since: number }>()
  const [now, setNow] = useState(Date.now())
  const livenessRef = useRef<Liveness>(undefined)
  const wake = useRef<() => void>(undefined)
  const checkLiveness = useRef(true)

  useEffect(() => {
    let stopped = false
    let timer: ReturnType<typeof setTimeout> | undefined
    let active = AppState.currentState === 'active'
    let tick = 0
    let busy = false

    const loop = async () => {
      if (stopped || busy || !active) return
      busy = true
      clearTimeout(timer)
      try {
        const result = await follower.poll(run)
        if (stopped) return
        setReading(result.missing ? 'missing' : 'ready')
        if (result.changed) setVersion((v) => v + 1)
        if (checkLiveness.current || tick % 3 === 0) {
          checkLiveness.current = false
          const discovery = parseDiscovery(await run(liveScript(agent, path, follower.transcript.cwd)))
          if (stopped) return
          if (discovery) {
            const next = livenessOf(discovery, agent, follower.transcript.cwd)
            livenessRef.current = next
            setLiveness(next)
            setTmux(discovery.tmux)
          }
        }
        setError(undefined)
      } catch (caught) {
        if (stopped) return
        setError(caught)
        // A host key needs the person; asking again every few seconds would not change the answer.
        if (caught instanceof HostKeyError) {
          busy = false
          return
        }
      }
      busy = false
      tick++
      const working = follower.transcript.open && livenessRef.current?.kind === 'live'
      timer = setTimeout(loop, working ? BUSY_MS : IDLE_MS)
    }

    wake.current = () => void loop()
    const subscription = AppState.addEventListener('change', (status) => {
      active = status === 'active'
      if (active) {
        checkLiveness.current = true
        void loop()
      } else clearTimeout(timer)
    })
    void loop()
    return () => {
      stopped = true
      clearTimeout(timer)
      subscription.remove()
      wake.current = undefined
    }
  }, [agent, path, follower, run, generation])

  const transcript = follower.transcript
  const turns = userTurns(transcript)
  // The message shows in the log as a new turn of the person's.
  useEffect(() => {
    if (pending && turns > pending.turns) setPending(undefined)
  }, [pending, turns])

  const waitingStep = openStep(transcript)
  useEffect(() => {
    if (!waitingStep) return setStepSince(undefined)
    setStepSince((current) => (current?.id === waitingStep ? current : { id: waitingStep, since: Date.now() }))
    const clock = setInterval(() => setNow(Date.now()), 5_000)
    return () => clearInterval(clock)
  }, [waitingStep])

  const live = liveness?.kind === 'live'
  const working = live && transcript.open
  const messages = useMemo(() => {
    const list = toMessages(transcript, working)
    if (pending)
      list.push({
        id: `pending-${pending.turns}`,
        role: 'user',
        content: [{ type: 'text', text: pending.text }],
        metadata: { custom: { theoremPendingCommandId: 'typed' } },
      })
    return list
    // The transcript changes in place; `version` counts the polls that changed it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [transcript, version, working, pending])

  const runtimeRef = useRef<AssistantRuntime>(undefined)
  const runtime = useExternalStoreRuntime<ThreadMessageLike>({
    messages,
    convertMessage: (message) => message,
    isRunning: working,
    isSendDisabled: !live || working || !!pending,
    onNew: async (message) => {
      const text = textOf(message)
      const current = livenessRef.current
      if (!text || current?.kind !== 'live') return
      const giveBack = () => {
        runtimeRef.current?.thread.composer.setText(text)
        writeDraft(draftKey, text)
        checkLiveness.current = true
      }
      const agentPid = current.pane.agentPid
      if (agentPid === undefined) {
        setSendError(new AgentGoneError(agent))
        return giveBack()
      }
      setSendError(undefined)
      setPending({ text, turns: userTurns(follower.transcript) })
      writeDraft(draftKey, '')
      try {
        const out = afterMark(await run(sendScript(current.pane.id, agentPid, text, Crypto.randomUUID())))
        if (out?.[0] === 'refused') {
          setPending(undefined)
          setSendError(new AgentGoneError(agent))
          giveBack()
          wake.current?.()
          return
        }
        if (out?.[0] !== 'sent') throw new Error('The computer did not confirm the send.')
        wake.current?.()
      } catch (caught) {
        // Never typed again automatically: the agent may already have it.
        setPending(undefined)
        setSendError(new SendUncertainError(agent, caught))
        giveBack()
      }
    },
    // The only path to interrupting the agent: the person pressed Stop.
    onCancel: async () => {
      const current = livenessRef.current
      if (current?.kind !== 'live') return
      try {
        await run(interruptScript(current.pane.id))
        wake.current?.()
      } catch (caught) {
        setSendError(caught)
      }
    },
  })
  runtimeRef.current = runtime

  // Restore and keep the draft; page references from the browser land here while this is open.
  useEffect(() => {
    const composer = runtime.thread.composer
    const saved = readDraft(draftKey)
    if (saved && !composer.getState().text) composer.setText(saved)
    setCurrentThread(draftKey)
    const unsubscribe = composer.subscribe(() => writeDraft(draftKey, composer.getState().text))
    const unlisten = onDraftChanged((key) => {
      if (key === draftKey) composer.setText(readDraft(draftKey))
    })
    return () => {
      unsubscribe()
      unlisten()
    }
  }, [runtime, draftKey])

  const retry = useCallback(() => {
    checkLiveness.current = true
    setError(undefined)
    setGeneration((g) => g + 1)
  }, [])

  return {
    runtime,
    transcript,
    liveness,
    tmux,
    reading,
    error,
    sendError,
    startedMidway: follower.startedMidway,
    waitingOnTerminal: !!stepSince && now - stepSince.since > PROMPT_HINT_MS,
    retry,
  }
}
