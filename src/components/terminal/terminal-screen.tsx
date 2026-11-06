// SOURCING: Ratzilla (ratatui in the browser, built from terminal/ into src/terminal-wasm) draws the terminal, its tab bar (ratatui Tabs) and prompt; assistant-ui useLocalRuntime runs each session's turns through the same Theorem SDK adapter, history and resume as the chat (lib/theorem/runtime); zustand carries each session's snapshot and outbox between its runtime and the WASM; what the person sends while a run works goes to the run's inbox through the SDK's runs.command (command input); a selection added from the IDE rides the next turn as a typed context reference (the chat's composer-references keys), and a file a tool worked on opens in the IDE through Follow's reveal; the close button is the shared TooltipIconButton with Streamline's X; closing on a double-click outside is a document listener, since Base UI's drawer only dismisses on an outside press
import { useLocalRuntime } from '@assistant-ui/react'
import type {
  AssistantRuntime,
  ChatModelAdapter,
  ThreadMessage,
} from '@assistant-ui/react'
import type { TheoremContextReference } from '@theoremharness/sdk'
import { useEffect, useLayoutEffect, useMemo, useRef } from 'react'
import { create } from 'zustand'
import { TooltipIconButton } from '@/components/assistant-ui/elements/tooltip-icon-button'
import { referenceKey } from '@/components/chat/composer-references'
import { Icon } from '@/components/icons'
import { useRevealFile, workingRuns } from '@/components/ide/follow'
import { useShell } from '@/components/shell/shell-state'
import { describeError, mutate, theorem } from '@/lib/theorem/client'
import type { Theorem } from '@/lib/theorem/client'
import {
  createHistoryAdapter,
  runTurn,
  useLiveRuns,
} from '@/lib/theorem/runtime'
import type { TurnOptions } from '@/lib/theorem/runtime'
import type { TerminalHandle } from '@/terminal-wasm/theorem_terminal'
import { leftoversOf, snapshotOf } from './terminal-transcript'
import type { Approval, Outgoing } from './terminal-transcript'
import type * as TerminalWasm from '@/terminal-wasm/theorem_terminal'

/** The terminal runs agent work: coding execution, not the front conversation. */
const TURN_OPTIONS: TurnOptions = { executionMode: 'coding' }

type Session = {
  snapshot: string
  /** Bumped by /new so the session starts over on a fresh thread. */
  generation: number
  runtime?: AssistantRuntime
  approval?: Approval
  /** The session's durable thread, once it has one. */
  thread?: () => string | undefined
  outbox: Outgoing[]
  /** What the next turn carries, added from the IDE. */
  references: readonly TheoremContextReference[]
  /** The working turn's runs, as Follow's workingRuns joins them. */
  runs: string
}

/**
 * Each terminal session by key: the bottom drawer's one session, and a tab id
 * for each of the right drawer's.
 */
const useTerminalSessions = create<Partial<Record<string, Session>>>(() => ({}))

function patchSession(key: string, change: Partial<Session>) {
  useTerminalSessions.setState((s) => ({
    [key]: {
      snapshot: '{}',
      generation: 0,
      outbox: [],
      references: [],
      runs: '',
      ...s[key],
      ...change,
    },
  }))
}

/** A story's fixed state, drawn by a terminal no runtime drives. */
export function showStory(key: string, snapshot: string) {
  patchSession(key, { snapshot })
}

function updateOutgoing(key: string, id: string, change: Partial<Outgoing>) {
  const session = useTerminalSessions.getState()[key]
  if (!session) return
  patchSession(key, {
    outbox: session.outbox.map((o) => (o.id === id ? { ...o, ...change } : o)),
  })
}

/** Outgoing input with a request in flight, so a flush sends each once. */
const inFlight = new Set<string>()

/** The refusal code a Theorem problem answer carries, if any. */
function refusalCode(failure: unknown) {
  const body =
    failure && typeof failure === 'object' && 'body' in failure
      ? failure.body
      : undefined
  return body && typeof body === 'object' && 'code' in body
    ? body.code
    : undefined
}

/**
 * Sends a session's waiting input to its live run's inbox. Input that waits
 * for the run's id stays `sending` until the run's first event names it.
 */
function flushOutbox(key: string) {
  const session = useTerminalSessions.getState()[key]
  const threadId = session?.thread?.()
  const runId = threadId ? useLiveRuns.getState()[threadId] : undefined
  if (!session || !runId) return
  for (const outgoing of session.outbox) {
    if (outgoing.state !== 'sending' || inFlight.has(outgoing.id)) continue
    inFlight.add(outgoing.id)
    void mutate((headers) =>
      theorem().chat.runs.command(
        { runId, command: 'input', ...headers },
        { additionalBodyParameters: { text: outgoing.text } },
      ),
    )
      .then((event) => {
        const part = event.payload.part as { inputId?: unknown } | undefined
        updateOutgoing(key, outgoing.id, {
          state: 'sent',
          inputId: typeof part?.inputId === 'string' ? part.inputId : undefined,
        })
      })
      .catch((failure: unknown) => {
        updateOutgoing(
          key,
          outgoing.id,
          refusalCode(failure) === 'run_input_closed'
            ? { state: 'next' }
            : { state: 'failed', error: describeError(failure) },
        )
      })
      .finally(() => inFlight.delete(outgoing.id))
  }
}

/** Sending while a run works: the words join the run; they never stop it. */
function sendInput(key: string, text: string) {
  const outbox = useTerminalSessions.getState()[key]?.outbox ?? []
  patchSession(key, {
    outbox: [...outbox, { id: crypto.randomUUID(), text, state: 'sending' }],
  })
  flushOutbox(key)
}

/** A selection from the IDE for the session's next turn; the same place twice is kept once. */
export function addReference(key: string, reference: TheoremContextReference) {
  const references = useTerminalSessions.getState()[key]?.references ?? []
  const added = referenceKey(reference)
  patchSession(key, {
    references: [
      ...references.filter((r) => referenceKey(r) !== added),
      reference,
    ],
  })
}

const referenceLabel = ({ label, location }: TheoremContextReference) =>
  label ??
  (location.resource.kind === 'file' ? location.resource.path : 'reference')

/** A session's working runs, for Follow the Agent. */
export const useTerminalRuns = (key: string | undefined) =>
  useTerminalSessions((s) => (key ? (s[key]?.runs ?? '') : ''))

export type TerminalAction =
  | { type: 'submit' | 'input'; tab: string; text: string }
  | { type: 'approve'; tab: string; allow: boolean }
  | { type: 'open'; tab: string; path: string; start?: number; end?: number }
  | {
      type:
        | 'cancel'
        | 'close'
        | 'new'
        | 'newTab'
        | 'closeTab'
        | 'selectTab'
        | 'unreference'
      tab: string
    }

/**
 * Runs what a session's own prompt asked for: a turn, a stop, an approval,
 * dropping a reference or opening a file in the IDE. The handler returns
 * false for the actions the terminal's host answers itself.
 */
export function useSessionAction() {
  const reveal = useRevealFile()
  return (action: TerminalAction) => {
    if (action.type === 'open') {
      reveal(action.path, action.start, action.end)
      return true
    }
    return runSessionAction(action)
  }
}

function runSessionAction(action: TerminalAction): boolean {
  const session = useTerminalSessions.getState()[action.tab]
  switch (action.type) {
    case 'submit':
      session?.runtime?.thread.append(action.text)
      return true
    case 'input':
      sendInput(action.tab, action.text)
      return true
    case 'cancel':
      session?.runtime?.thread.cancelRun()
      return true
    case 'unreference':
      patchSession(action.tab, {
        references: session?.references.slice(0, -1) ?? [],
      })
      return true
    case 'approve': {
      const approval = session?.approval
      if (!approval) return true
      const optionId = action.allow ? approval.allow : approval.deny
      void mutate((headers) =>
        theorem().chat.runs.command({
          runId: approval.runId,
          command: 'approval',
          approvalId: approval.approvalId,
          toolCallId: approval.toolCallId,
          ...(optionId
            ? { optionId }
            : { decision: action.allow ? 'allow' : 'deny' }),
          ...headers,
        }),
      ).catch((failure: unknown) => {
        // The run settles the approval itself; only a refused command shows.
        console.error('[terminal] approval failed:', describeError(failure))
      })
      return true
    }
    default:
      return false
  }
}

/** Stops a session's run, if one is going. */
export function stopSession(key: string) {
  const runtime = useTerminalSessions.getState()[key]?.runtime
  if (runtime?.thread.getState().isRunning) runtime.thread.cancelRun()
}

/**
 * A session's thread lives on its right-drawer tab, or without a tab id is
 * the bottom drawer's one per project.
 */
function threadOf(projectId: string, tabId: string | undefined) {
  const shell = useShell.getState()
  return tabId
    ? shell.terminalTabs[projectId]?.tabs.find((tab) => tab.id === tabId)
        ?.threadId
    : shell.terminalThreads[projectId]
}

function recordThread(
  projectId: string,
  tabId: string | undefined,
  threadId: string | undefined,
  title?: string,
) {
  const shell = useShell.getState()
  if (tabId) shell.updateTerminalTab(projectId, tabId, { threadId, title })
  else shell.setTerminalThread(projectId, threadId)
}

/** /new: the session forgets its thread and its runtime starts over. */
export function restartSession(
  key: string,
  projectId: string,
  tabId: string | undefined,
) {
  recordThread(projectId, tabId, undefined)
  patchSession(key, {
    generation: (useTerminalSessions.getState()[key]?.generation ?? 0) + 1,
    outbox: [],
  })
}

/** A tab's name from the prompt that started it: its first line, cut short. */
function titleOf(messages: readonly ThreadMessage[]) {
  const first = messages.find((message) => message.role === 'user')
  const content: readonly ThreadMessage['content'][number][] =
    first?.content ?? []
  const text =
    content
      .flatMap((part) => (part.type === 'text' ? [part.text] : []))
      .join(' ')
      .trim()
      .split('\n')[0] ?? ''
  return text.length > 24 ? `${text.slice(0, 23)}…` : text || 'agent'
}

type AgentProps = {
  sessionKey: string
  /** The right drawer's tab this session is; the bottom drawer's has none. */
  tabId?: string
  projectId: string
  project: string
}

function Agent({ sessionKey, tabId, projectId, project }: AgentProps) {
  const adapter = useMemo<ChatModelAdapter>(
    () => ({
      async *run(options) {
        let threadId = threadOf(projectId, tabId)
        if (!threadId) {
          const title = tabId ? titleOf(options.messages) : 'Agent terminal'
          const created = await mutate((headers) =>
            theorem().chat.threads.create({ projectId, title, ...headers }),
          )
          threadId = created.record.threadId
          recordThread(projectId, tabId, threadId, title)
        }
        const references =
          useTerminalSessions.getState()[sessionKey]?.references ?? []
        const turnOptions = references.length
          ? {
              ...TURN_OPTIONS,
              contextReferences: references as Theorem.ChatContextReference[],
            }
          : TURN_OPTIONS
        yield* runTurn(threadId, options, turnOptions, () => {
          // Only an accepted send consumes them; recovery replays its own request.
          const now = useTerminalSessions.getState()[sessionKey]?.references
          patchSession(sessionKey, {
            references: now?.filter((r) => !references.includes(r)) ?? [],
          })
        })
      },
    }),
    [projectId, tabId, sessionKey],
  )
  const history = useMemo(
    () => createHistoryAdapter(() => threadOf(projectId, tabId)),
    [projectId, tabId],
  )
  const runtime = useLocalRuntime(adapter, { adapters: { history } })

  useEffect(() => {
    /**
     * Once the run is over, what it never took goes as the next turn: input
     * it refused, input it left undelivered, and input sent before its id
     * was known.
     */
    const resendLeftovers = (
      messages: readonly ThreadMessage[],
      outbox: readonly Outgoing[],
    ) => {
      const leftovers = leftoversOf(messages, outbox, inFlight)
      if (leftovers.length === 0) return
      const resent = new Set(leftovers.map((o) => o.id))
      patchSession(sessionKey, {
        outbox: outbox.map((o) =>
          resent.has(o.id) ? { ...o, state: 'resent' } : o,
        ),
      })
      const text = leftovers.map((o) => o.text).join('\n\n')
      queueMicrotask(() => runtime.thread.append(text))
    }
    const publish = () => {
      const { messages, isRunning } = runtime.thread.getState()
      const session = useTerminalSessions.getState()[sessionKey]
      const outbox = session?.outbox ?? []
      const { json, approval } = snapshotOf(
        messages,
        isRunning,
        project,
        outbox,
        (session?.references ?? []).map(referenceLabel),
      )
      patchSession(sessionKey, {
        snapshot: json,
        approval,
        runs: workingRuns(messages),
      })
      if (!isRunning) resendLeftovers(messages, outbox)
    }
    patchSession(sessionKey, {
      runtime,
      thread: () => threadOf(projectId, tabId),
    })
    publish()
    const unsubscribe = runtime.thread.subscribe(publish)
    const unsubscribeOutbox = useTerminalSessions.subscribe((s, prev) => {
      if (
        s[sessionKey]?.outbox !== prev[sessionKey]?.outbox ||
        s[sessionKey]?.references !== prev[sessionKey]?.references
      )
        publish()
    })
    // Input waiting for the run's id goes once the run's stream names it.
    const unsubscribeRuns = useLiveRuns.subscribe(() => flushOutbox(sessionKey))
    return () => {
      unsubscribe()
      unsubscribeOutbox()
      unsubscribeRuns()
      patchSession(sessionKey, {
        runtime: undefined,
        approval: undefined,
        thread: undefined,
      })
    }
  }, [runtime, sessionKey, project, projectId, tabId])

  return null
}

/**
 * A terminal session's agent: an assistant-ui runtime on its own durable
 * thread, made on the first turn and kept apart from the chats. It renders
 * nothing; the WASM terminal draws its state. /new remounts it.
 */
export function TerminalAgent(props: AgentProps) {
  const generation = useTerminalSessions(
    (s) => s[props.sessionKey]?.generation ?? 0,
  )
  return <Agent key={generation} {...props} />
}

/**
 * The WASM module, initialised once for every terminal. Two concurrent inits
 * each instantiate it, and the second replaces the first under the first
 * terminal's live closures. Every terminal draws in the colours the page
 * works out from the workspace around it.
 */
let wasmModule: Promise<typeof TerminalWasm> | undefined
const loadWasm = () =>
  (wasmModule ??= Promise.all([
    import('@/terminal-wasm/theorem_terminal'),
    import('./live-terminal-theme'),
  ]).then(async ([wasm, { useTerminalTheme }]) => {
    await wasm.default()
    const paint = ({ theme }: { theme: object }) =>
      wasm.set_palette(JSON.stringify(theme))
    paint(useTerminalTheme.getState())
    useTerminalTheme.subscribe(paint)
    return wasm
  }))

/** One Ratzilla mount per host element; its frames stop when the element leaves the page. */
const mounts = new WeakMap<HTMLElement, Promise<TerminalHandle>>()

function mountTerminal(
  host: HTMLElement,
  tabbed: boolean,
  onAction: (action: TerminalAction) => void,
) {
  let mounted = mounts.get(host)
  if (!mounted) {
    mounted = loadWasm().then((wasm) => {
      return wasm.mount(host.id, tabbed, (json: string) =>
        onAction(JSON.parse(json) as TerminalAction),
      )
    })
    mounts.set(host, mounted)
  }
  return mounted
}

/** Hands every listed session's snapshot to the terminal. */
function pushSnapshots(handle: TerminalHandle, ids: readonly string[]) {
  const sessions = useTerminalSessions.getState()
  for (const id of ids) handle.set_state(id, sessions[id]?.snapshot ?? '{}')
}

/**
 * The Ratzilla terminal, with React forwarding input to it. `tabs` are the
 * sessions it shows; with `tabbed` it draws them as a tab bar, otherwise it
 * shows the one session's header. A docked terminal has no close button.
 */
export function TerminalScreen({
  hostId,
  tabbed,
  tabs,
  active,
  onAction,
  closable = true,
}: {
  hostId: string
  tabbed: boolean
  tabs: readonly { id: string; title: string }[]
  active: string
  onAction: (action: TerminalAction) => void
  closable?: boolean
}) {
  const host = useRef<HTMLDivElement>(null)
  const handle = useRef<TerminalHandle>(undefined)
  const latest = useRef(onAction)
  useLayoutEffect(() => {
    latest.current = onAction
  })
  const list = JSON.stringify({
    tabs: tabs.map(({ id, title }) => ({ id, title })),
    active,
  })
  const ids = useMemo(
    () =>
      (JSON.parse(list) as { tabs: { id: string }[] }).tabs.map((t) => t.id),
    [list],
  )

  useEffect(() => {
    const element = host.current
    if (!element) return
    let disposed = false
    void mountTerminal(element, tabbed, (action) =>
      latest.current(action),
    ).then((mounted) => {
      if (disposed) return
      handle.current = mounted
    })
    const unsubscribe = useTerminalSessions.subscribe((s, prev) => {
      for (const [id, session] of Object.entries(s))
        if (session && session.snapshot !== prev[id]?.snapshot)
          handle.current?.set_state(id, session.snapshot)
    })
    return () => {
      disposed = true
      unsubscribe()
    }
  }, [tabbed])

  // A tab the terminal has not seen starts blank, so every snapshot follows
  // the list.
  useEffect(() => {
    let disposed = false
    const element = host.current
    if (!element) return
    void mountTerminal(element, tabbed, (action) =>
      latest.current(action),
    ).then((mounted) => {
      if (disposed) return
      mounted.set_tabs(list)
      pushSnapshots(mounted, ids)
    })
    return () => {
      disposed = true
    }
  }, [list, ids, tabbed])

  return (
    <div className="relative flex min-h-0 flex-1 flex-col font-mono text-[12.5px]">
      <div
        ref={host}
        id={hostId}
        tabIndex={0}
        aria-label="Agent terminal"
        data-base-ui-swipe-ignore=""
        onKeyDown={(event) => {
          if (event.metaKey) return
          // Copy wins over stop while the person has text selected.
          if (
            event.ctrlKey &&
            event.key === 'c' &&
            !window.getSelection()?.isCollapsed
          )
            return
          if (handle.current?.key(event.nativeEvent)) {
            event.preventDefault()
            event.stopPropagation()
          }
        }}
        onMouseDown={(event) => {
          const rect = event.currentTarget.getBoundingClientRect()
          handle.current?.click(
            event.clientX - rect.left,
            event.clientY - rect.top,
          )
        }}
        onMouseMove={(event) => {
          const rect = event.currentTarget.getBoundingClientRect()
          const cursor = handle.current?.cursor(
            event.clientX - rect.left,
            event.clientY - rect.top,
          )
          if (cursor && event.currentTarget.style.cursor !== cursor)
            event.currentTarget.style.cursor = cursor
        }}
        onPaste={(event) => {
          event.preventDefault()
          handle.current?.paste(event.clipboardData.getData('text'))
        }}
        onWheel={(event) => handle.current?.scroll(event.deltaY > 0 ? 3 : -3)}
        onFocus={() => handle.current?.set_focused(true)}
        onBlur={() => handle.current?.set_focused(false)}
        className="relative min-h-0 flex-1 cursor-default overflow-hidden bg-term font-mono text-[12.5px] whitespace-pre text-term-ink outline-none"
      />
      {/* Over the header bar's last columns, which the terminal leaves
          clear. Outside the host, whose contents Ratzilla replaces. */}
      {closable && (
        <TooltipIconButton
          tooltip="Close"
          side="left"
          onClick={() => latest.current({ type: 'close', tab: active })}
          className="absolute top-[calc(0.5lh-12px)] right-1 size-6 p-1.5 text-term-muted hover:bg-term-line/60 hover:text-term-ink"
        >
          <Icon.Exit className="size-3" />
        </TooltipIconButton>
      )}
    </div>
  )
}

/**
 * Closes a drawer when the person double-clicks anywhere outside every
 * terminal drawer, while it is open.
 */
export function useCloseOnOutsideDoubleClick(open: boolean, close: () => void) {
  const latest = useRef(close)
  useLayoutEffect(() => {
    latest.current = close
  })
  useEffect(() => {
    if (!open) return
    const onDoubleClick = (event: MouseEvent) => {
      if (
        event.target instanceof Element &&
        event.target.closest('[data-terminal-drawer]')
      )
        return
      latest.current()
    }
    document.addEventListener('dblclick', onDoubleClick)
    return () => document.removeEventListener('dblclick', onDoubleClick)
  }, [open])
}
