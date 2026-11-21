// SOURCING: @assistant-ui/react-native useExternalStoreRuntime (an empty thread whose onNew starts the conversation); chat.threads.create and the conversation binding (Theorem); startScript / findStartedLogScript over the saved computer (Claude Code, Codex); expo-crypto randomUUID
//
// The one composer a conversation starts from. The chip names who receives
// the first message; sending creates the conversation there and opens it.
// Nothing is retried on its own: a start that may have happened is reported,
// not repeated.
import { useEffect, useRef, useState } from 'react'
import { router } from 'expo-router'
import * as Crypto from 'expo-crypto'
import {
  useExternalStoreRuntime,
  type AppendMessage,
  type ThreadMessageLike,
} from '@assistant-ui/react-native'
import { readDraft, writeDraft } from '@/lib/drafts'
import type { IntakeItem } from '@/features/intake/model'
import { useShowTerminal } from '@/lib/preferences'
import { describeError } from '@/lib/theorem'
import { useRequest } from '@/lib/use-request'
import { refreshComputers } from '../agents/computers'
import { runnerFor } from '../agents/remote'
import { afterMark, agentName, findStartedLogScript, startScript } from '../agents/shell'
import { AttachButton } from './attach'
import { ConversationSurface, EmptyConversation, type SurfaceNote } from './conversation-surface'
import {
  destinationDetail,
  destinationName,
  lastDestination,
  RecipientPicker,
  rememberDestination,
  type Destination,
} from './recipient-picker'
import { conversations } from './runtime'
import type { Selection } from './selection'
import { createThread, loadProjects } from './threads'

const DRAFT = 'new-conversation'
/** How long each look for the log a new agent session writes lasts. */
const LOG_WAIT_MS = 40_000

export type Opened = Exclude<Selection, { kind: 'new' }>

type Waiting = { destination: Extract<Destination, { kind: 'agent' }>; session: string; since: number; gaveUp?: boolean }

const textOf = (message: AppendMessage) =>
  message.content
    .flatMap((part) => (part.type === 'text' ? [part.text] : []))
    .join('\n\n')
    .trim()

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

/** Waits until the conversation can take a message, or fails. */
function whenReady(threadId: string, lease: ReturnType<ReturnType<typeof conversations>['retain']>) {
  return new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(() => {
      unsubscribe()
      reject(new Error('Theorem did not open the conversation in time. Your message is in its composer.'))
    }, 15_000)
    const unsubscribe = lease.conversation.subscribe((state) => {
      if (['failed', 'authentication-required'].includes(state.phase)) {
        clearTimeout(timeout)
        unsubscribe()
        reject(state.error ?? new Error(`The conversation ${threadId} could not be opened.`))
      } else if (!['detached', 'connecting'].includes(state.phase)) {
        clearTimeout(timeout)
        unsubscribe()
        resolve()
      }
    })
  })
}

export function NewConversation({
  onOpen,
  project,
}: {
  onOpen: (opened: Opened) => void
  /** The project this composer was opened from, so the first message goes there. */
  project?: { projectId: string; title: string }
}) {
  const projects = useRequest(loadProjects, [])
  const showTerminal = useShowTerminal()
  // Opened from a project's New conversation action, the recipient starts there;
  // otherwise the last choice is remembered. The person can still change it.
  const [destination, setDestination] = useState<Destination | undefined>(() =>
    project ? { kind: 'theorem', projectId: project.projectId, projectTitle: project.title } : lastDestination(),
  )
  const [picking, setPicking] = useState(false)
  const [busy, setBusy] = useState<string>()
  const [error, setError] = useState<unknown>()
  const [waiting, setWaiting] = useState<Waiting>()
  // One key per intended thread, so a press after a lost response repeats the same create.
  const createKey = useRef<string>(undefined)
  // Whether the person explicitly chose a recipient (vs. a default), and whether
  // the opening project has been applied once it resolves.
  const touched = useRef(false)
  const appliedProject = useRef(false)
  const destinationRef = useRef<Destination | undefined>(undefined)

  // Until the person chooses, a new conversation goes to Theorem in the first project.
  const first = projects.data?.[0]
  const chosen: Destination | undefined =
    destination ?? (first ? { kind: 'theorem', projectId: first.projectId, projectTitle: first.title } : undefined)
  destinationRef.current = destination

  // The opening project can resolve after the first render (projects still
  // loading). Apply the first resolved project as the recipient unless the
  // person has explicitly chosen one; a useState initializer alone would keep
  // the lastDestination() fallback forever.
  useEffect(() => {
    if (project && !touched.current && !appliedProject.current) {
      appliedProject.current = true
      setDestination({ kind: 'theorem', projectId: project.projectId, projectTitle: project.title })
    }
  }, [project?.projectId, project?.title])

  /**
   * Looks for the session's log until it turns up or this look's time runs out.
   * `since` is the computer's clock and only filters logs; the deadline is the
   * phone's, so every look, Look again included, gets its full time. The agent
   * has already started, so a failure here never puts the message back.
   */
  const findLog = async (wait: Waiting) => {
    const run = runnerFor(wait.destination.computerId)
    const deadline = Date.now() + LOG_WAIT_MS
    try {
      while (Date.now() < deadline) {
        const lines = afterMark(await run(findStartedLogScript(wait.destination.agent, wait.destination.folder, wait.since)))
        const found = lines?.find((line) => line.startsWith('log\t'))?.slice(4)
        if (found) {
          void refreshComputers()
          return onOpen({ kind: 'agent', computerId: wait.destination.computerId, agent: wait.destination.agent, path: found })
        }
        await sleep(1_500)
      }
    } catch (caught) {
      setError(caught)
    }
    setWaiting({ ...wait, gaveUp: true })
  }

  const lookAgain = (wait: Waiting) => {
    setError(undefined)
    setWaiting({ ...wait, gaveUp: false })
    void findLog(wait)
  }

  const start = async (text: string) => {
    const target = chosen
    if (!target) return
    const startDestination = destinationRef.current
    setError(undefined)
    rememberDestination(target)
    if (target.kind === 'theorem') {
      setBusy('Starting the conversation…')
      createKey.current ??= Crypto.randomUUID()
      const thread = await createThread(target.projectId, createKey.current)
      createKey.current = undefined
      // The recipient may have changed while the thread was being created. Do
      // not write drafts or open a thread for a recipient the person left; the
      // words go back to the composer (onNew's catch) instead.
      if (destinationRef.current !== startDestination)
        throw new Error('The recipient changed while the conversation was being created. Your words are back in the box.')
      // The words survive whatever happens next: they are the new thread's draft until sent.
      writeDraft(thread.threadId, text)
      writeDraft(DRAFT, '')
      const lease = conversations().retain(thread.threadId)
      try {
        await whenReady(thread.threadId, lease)
        await lease.send(text)
        writeDraft(thread.threadId, '')
      } finally {
        lease.release()
        onOpen({ kind: 'theorem', threadId: thread.threadId })
      }
      return
    }
    setBusy(`Starting ${agentName[target.agent]} on ${target.computerName}…`)
    const session = `theorem-${target.agent}-${Crypto.randomUUID().slice(0, 8)}`
    const lines = afterMark(
      await runnerFor(target.computerId)(startScript(target.agent, target.folder, text, session, Crypto.randomUUID())),
    )
    const [kind, what, , epoch] = lines?.[0]?.split('\t') ?? []
    if (kind === 'missing')
      throw new Error(
        what === 'folder'
          ? `${target.folder} is not a folder on ${target.computerName}.`
          : what === 'tmux'
            ? `${target.computerName} has no tmux. Install it there, then try again.`
            : `${agentName[target.agent]} is not installed on ${target.computerName}, or not on its PATH.`,
      )
    if (kind !== 'started') throw new Error(`${target.computerName} did not confirm the start.`)
    // Started: from here on the message has been given to the agent, so it is never sent again.
    writeDraft(DRAFT, '')
    const wait: Waiting = { destination: target, session, since: Number(epoch) || Math.floor(Date.now() / 1000) }
    setWaiting(wait)
    setBusy(`Waiting for ${agentName[target.agent]} to begin…`)
    await findLog(wait)
  }

  const runtimeRef = useRef<ReturnType<typeof useExternalStoreRuntime>>(undefined)

  /**
   * Starts a conversation with a file. Intake only delivers into a thread that
   * exists, so the chosen project's thread is created first (under the same
   * idempotency key a text start uses), the composer words become its draft so
   * they are not lost, and intake opens for it. Agents cannot receive files, so
   * this is offered only for a Theorem project.
   */
  const attachToThread = async (_items: IntakeItem[]) => {
    const target = chosen
    if (!target || target.kind !== 'theorem') return
    const startDestination = destinationRef.current
    setBusy('Starting the conversation…')
    try {
      rememberDestination(target)
      createKey.current ??= Crypto.randomUUID()
      const thread = await createThread(target.projectId, createKey.current)
      createKey.current = undefined
      // The recipient may have changed while the thread was being created; do
      // not read the composer, write drafts, or navigate for a recipient the
      // person left. Throwing lets the attach control unstage the items cleanly.
      if (destinationRef.current !== startDestination)
        throw new Error('The recipient changed while the conversation was being created.')
      const words = runtimeRef.current?.thread.composer.getState().text ?? ''
      if (words) writeDraft(thread.threadId, words)
      writeDraft(DRAFT, '')
      onOpen({ kind: 'theorem', threadId: thread.threadId })
      router.push({ pathname: '/intake', params: { thread: thread.threadId } })
    } finally {
      setBusy(undefined)
    }
  }
  const runtime = useExternalStoreRuntime<ThreadMessageLike>({
    messages: [],
    convertMessage: (message) => message,
    isRunning: false,
    isSendDisabled: !chosen || !!busy || !!waiting,
    onNew: async (message) => {
      const text = textOf(message)
      if (!text) return
      try {
        await start(text)
      } catch (caught) {
        setError(caught)
        if (!waiting) {
          runtimeRef.current?.thread.composer.setText(text)
          writeDraft(DRAFT, text)
        }
      } finally {
        setBusy(undefined)
      }
    },
  })
  runtimeRef.current = runtime

  useEffect(() => {
    const composer = runtime.thread.composer
    const saved = readDraft(DRAFT)
    if (saved && !composer.getState().text) composer.setText(saved)
    return composer.subscribe(() => writeDraft(DRAFT, composer.getState().text))
  }, [runtime])

  const notes: SurfaceNote[] = []
  if (busy) notes.push({ tone: 'muted', text: busy })
  else if (waiting && !waiting.gaveUp)
    notes.push({ tone: 'muted', text: `Waiting for ${agentName[waiting.destination.agent]} to begin…` })
  if (waiting?.gaveUp) {
    const name = agentName[waiting.destination.agent]
    notes.push({
      tone: 'attention',
      text: showTerminal
        ? `${name} started in tmux session ${waiting.session} but has not written its log yet. It may be asking you to trust the folder.`
        : `${name} started in tmux session ${waiting.session} but has not written its log yet. It may be asking you to trust the folder; turn on Show terminal in Settings to answer it.`,
      action: showTerminal
        ? {
            label: 'Open terminal',
            onPress: () =>
              router.push({
                pathname: '/terminal',
                params: { computer: waiting.destination.computerId, session: waiting.session },
              }),
          }
        : { label: 'Look again', onPress: () => lookAgain(waiting) },
    })
  }
  if (error) notes.push({ tone: 'error', text: describeError(error) })
  if (projects.status === 'failed' && !chosen) notes.push({ tone: 'error', text: describeError(projects.error) })

  return (
    <>
      <ConversationSurface
        runtime={runtime}
        recipient={{
          name: chosen ? destinationName(chosen) : 'Theorem',
          detail: chosen ? destinationDetail(chosen) : 'Loading…',
          onPress: waiting || busy ? undefined : () => setPicking(true),
        }}
        placeholder={chosen ? `Message ${destinationName(chosen)}` : 'Message'}
        notes={notes}
        sendBlocked={!chosen || !!busy || !!waiting}
        controls={chosen?.kind === 'theorem' ? <AttachButton onAcquire={attachToThread} /> : null}
        empty={
          <EmptyConversation
            title={chosen ? destinationName(chosen) : 'New conversation'}
            detail={
              chosen?.kind === 'agent'
                ? `Starts ${agentName[chosen.agent]} in ${chosen.folder === '~' ? 'the home folder' : chosen.folder} on ${chosen.computerName}.`
                : chosen
                  ? `A new conversation in ${chosen.projectTitle}.`
                  : undefined
            }
          />
        }
      />
      <RecipientPicker
        visible={picking}
        current={chosen}
        projects={projects.data}
        onChoose={(next) => {
          touched.current = true
          setDestination(next)
          setPicking(false)
        }}
        onClose={() => setPicking(false)}
      />
    </>
  )
}
