// SOURCING: Ratzilla (ratatui in the browser, built from terminal/ into src/terminal-wasm) draws the terminal, its tab bar (ratatui Tabs) and prompt; assistant-ui useLocalRuntime runs each session's turns through the same Theorem SDK adapter, history and resume as the chat (lib/theorem/runtime); zustand carries each session's snapshot between its runtime and the WASM; the close button is the shared TooltipIconButton with Streamline's X; closing on a double-click outside is a document listener, since Base UI's drawer only dismisses on an outside press
import { useLocalRuntime } from '@assistant-ui/react'
import type {
  AssistantRuntime,
  ChatModelAdapter,
  ThreadMessage,
} from '@assistant-ui/react'
import { useEffect, useLayoutEffect, useMemo, useRef } from 'react'
import { create } from 'zustand'
import { TooltipIconButton } from '@/components/assistant-ui/elements/tooltip-icon-button'
import { readApproval } from '@/components/chat/theorem-parts'
import { Icon } from '@/components/icons'
import { useShell } from '@/components/shell/shell-state'
import { describeError, mutate, theorem } from '@/lib/theorem/client'
import { createHistoryAdapter, runTurn } from '@/lib/theorem/runtime'
import type { TurnOptions } from '@/lib/theorem/runtime'
import type { TerminalHandle } from '@/terminal-wasm/theorem_terminal'
import type * as TerminalWasm from '@/terminal-wasm/theorem_terminal'

/** The terminal runs agent work: coding execution, not the front conversation. */
const TURN_OPTIONS: TurnOptions = { executionMode: 'coding' }

type Approval = {
  runId: string
  approvalId: string
  toolCallId: string
  allow?: string
  deny?: string
}

type Session = {
  snapshot: string
  /** Bumped by /new so the session starts over on a fresh thread. */
  generation: number
  runtime?: AssistantRuntime
  approval?: Approval
}

/**
 * Each terminal session by key: the bottom drawer's one session, and a tab id
 * for each of the right drawer's.
 */
const useTerminalSessions = create<Partial<Record<string, Session>>>(() => ({}))

function patchSession(key: string, change: Partial<Session>) {
  useTerminalSessions.setState((s) => ({
    [key]: { snapshot: '{}', generation: 0, ...s[key], ...change },
  }))
}

export type TerminalAction =
  | { type: 'submit'; tab: string; text: string }
  | { type: 'approve'; tab: string; allow: boolean }
  | {
      type: 'cancel' | 'close' | 'new' | 'newTab' | 'closeTab' | 'selectTab'
      tab: string
    }

/**
 * Runs what a session's own prompt asked for: a turn, a stop or an approval.
 * Returns false for the actions the drawer answers itself.
 */
export function runSessionAction(action: TerminalAction): boolean {
  const session = useTerminalSessions.getState()[action.tab]
  switch (action.type) {
    case 'submit':
      session?.runtime?.thread.append(action.text)
      return true
    case 'cancel':
      session?.runtime?.thread.cancelRun()
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

type TerminalPart =
  | { type: 'text' | 'reasoning'; text: string }
  | { type: 'tool'; name: string; summary: string; status: string }

/** A tool call's one-line summary: its first string argument, else the raw args. */
function toolSummary(args: Record<string, unknown>, argsText: string) {
  const first = Object.values(args).find((v) => typeof v === 'string')
  return (typeof first === 'string' ? first : argsText).replace(/\s+/g, ' ')
}

/** The thread as the terminal draws it, plus the run's pending approval. */
function snapshotOf(
  messages: readonly ThreadMessage[],
  running: boolean,
  project: string,
) {
  let approval: Approval | undefined
  let pending: { tool: string; summary: string } | undefined
  const last = messages.at(-1)
  const status = last?.role === 'assistant' ? last.status : undefined
  const error =
    status?.type === 'incomplete' && status.reason === 'error'
      ? describeError(status.error)
      : undefined

  const rows = messages.map((message) => {
    const runId = (
      message.metadata.custom as { theoremRunId?: string } | undefined
    )?.theoremRunId
    const content: readonly ThreadMessage['content'][number][] = message.content
    const parts = content.flatMap((part): TerminalPart[] => {
      if (part.type === 'text' || part.type === 'reasoning')
        return [{ type: part.type, text: part.text }]
      if (part.type !== 'tool-call') return []
      const asked = readApproval(part.interrupt)
      const waiting =
        asked !== undefined &&
        asked.approved === undefined &&
        part.result === undefined
      if (waiting && runId && !approval) {
        const kind = (k: string) =>
          asked.options.find((o) => o.kind === k)?.optionId
        approval = {
          runId,
          approvalId: asked.approvalId,
          toolCallId: asked.toolCallId,
          allow: kind('allow_once'),
          deny: kind('reject_once') ?? kind('reject_always'),
        }
        pending = { tool: asked.toolName, summary: asked.summary }
      }
      return [
        {
          type: 'tool',
          name: part.toolName,
          summary: toolSummary(part.args, part.argsText),
          status: waiting
            ? 'approval'
            : part.result !== undefined
              ? part.isError
                ? 'error'
                : 'complete'
              : message === last && running
                ? 'running'
                : 'complete',
        },
      ]
    })
    return { role: message.role, parts }
  })

  return {
    approval,
    json: JSON.stringify({
      running,
      project,
      error,
      approval: pending,
      messages: rows,
    }),
  }
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
        yield* runTurn(threadId, options, TURN_OPTIONS)
      },
    }),
    [projectId, tabId],
  )
  const history = useMemo(
    () => createHistoryAdapter(() => threadOf(projectId, tabId)),
    [projectId, tabId],
  )
  const runtime = useLocalRuntime(adapter, { adapters: { history } })

  useEffect(() => {
    const publish = () => {
      const { messages, isRunning } = runtime.thread.getState()
      const { json, approval } = snapshotOf(messages, isRunning, project)
      patchSession(sessionKey, { snapshot: json, approval })
    }
    patchSession(sessionKey, { runtime })
    publish()
    const unsubscribe = runtime.thread.subscribe(publish)
    return () => {
      unsubscribe()
      patchSession(sessionKey, { runtime: undefined, approval: undefined })
    }
  }, [runtime, sessionKey, project])

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
 * terminal's live closures.
 */
let wasmModule: Promise<typeof TerminalWasm> | undefined
const loadWasm = () =>
  (wasmModule ??= import('@/terminal-wasm/theorem_terminal').then(
    async (wasm) => {
      await wasm.default()
      return wasm
    },
  ))

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
 * shows the one session's header.
 */
export function TerminalScreen({
  hostId,
  tabbed,
  tabs,
  active,
  onAction,
}: {
  hostId: string
  tabbed: boolean
  tabs: readonly { id: string; title: string }[]
  active: string
  onAction: (action: TerminalAction) => void
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
      <TooltipIconButton
        tooltip="Close"
        side="left"
        onClick={() => latest.current({ type: 'close', tab: active })}
        className="absolute top-[calc(0.5lh-12px)] right-1 size-6 p-1.5 text-term-muted hover:bg-term-line/60 hover:text-term-ink"
      >
        <Icon.Exit className="size-3" />
      </TooltipIconButton>
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
