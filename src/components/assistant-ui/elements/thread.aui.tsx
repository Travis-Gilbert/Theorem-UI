'use client'

import { ProjectContextChip } from '@/components/organize/thread-header'
import { ThreadReviewCards } from '@/components/review/review-card'
import { UserMessageAttachments } from '@/components/assistant-ui/elements/attachment.aui'
import { File, getFileHref } from '@/components/assistant-ui/elements/file'
import { Image } from '@/components/assistant-ui/elements/image'
import { MarkdownText } from '@/components/assistant-ui/elements/markdown-text'
import {
  Reasoning,
  ReasoningContent,
  ReasoningRoot,
  ReasoningText,
  ReasoningTrigger,
} from '@/components/assistant-ui/elements/reasoning.aui'
import { TooltipIconButton } from '@/components/assistant-ui/elements/tooltip-icon-button'
import {
  Activity,
  isStandaloneToolCall,
  TheoremToolCall,
} from '@/components/chat/theorem-parts'
import { ComposerEditor } from '@/components/chat/composer-editor'
import { Composer, composerSurface } from '@/components/chat/composer'
import type { ComposerLayout, ComposerSlots } from '@/components/chat/composer'
import { ReadAloud } from '@/components/chat/read-aloud'
import { FaceSlot } from '@/components/face/face-mark'
import { Icon } from '@/components/icons'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { useLiquidGlass } from '@/components/glass/liquid-glass/use-liquid-glass'
import { useComposerSurface } from '@/lib/surfaces'
import { useSurfaceMaterial } from '@/lib/appearance'
import { appearancePair } from '@/lib/appearance-policy'
import { cn } from '@/lib/utils'
import { useComposedRefs } from '@/lib/composition'
import {
  ActionBarMorePrimitive,
  ActionBarPrimitive,
  AuiIf,
  BranchPickerPrimitive,
  ComposerPrimitive,
  ErrorPrimitive,
  groupPartByType,
  MessagePrimitive,
  ThreadPrimitive,
  useAuiState,
} from '@assistant-ui/react'
import type {
  AssistantState,
  FileMessagePartComponent,
  ImageMessagePartComponent,
  TextMessagePartComponent,
  ToolCallMessagePartComponent,
} from '@assistant-ui/react'
import {
  createContext,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
} from 'react'
import type { ComponentType, FC, PropsWithChildren, ReactNode } from 'react'

import { useArrivedLive } from '@/components/motion'
import { flyFrom, takeLaunch } from '@/lib/motion'

import { answerBody } from '@/lib/theorem/reviews'
import { useStartThreadFrom } from '@/lib/theorem/thread-tree'

import { hasTheoremError } from '@/lib/theorem/message-history'

import { ComposerToolTrigger } from '@/components/chat/composer-tools'
import { UserMarkdown } from '@/components/chat/user-markdown'
import { ChatCollapsibleMessage } from '@/components/coss/chat/chat-collapsible-message'
import {
  UnseenDivider,
  UnseenFromProvider,
  useUnseenFrom,
} from './unseen-divider.aui'
import { messageLabel, messageSurface } from '@/lib/kit/stage'
import { thingProps } from '@/lib/face/things'

export { Composer } from '@/components/chat/composer'

export type ThreadGroupPart = MessagePrimitive.GroupedParts.GroupPart

const reasoningDuration = (timing: ThreadGroupPart['timing']) =>
  timing?.completedAt === undefined
    ? undefined
    : Math.round((timing.completedAt - timing.startedAt) / 1000)

/**
 * Optional component overrides for the thread. `AssistantMessage` replaces
 * the whole message; the remaining slots override how the
 * assistant message renders tool calls and part groups. Tool UIs registered
 * by name (toolkit `render`, `useAssistantDataUI`) take precedence over
 * `ToolFallback`. Reasoning and grouped tool calls draw on the sheet the
 * activity line opens (`Activity`), not in the reply.
 * When `TaskGroup` is set, tool calls that carry a nested
 * conversation and have no registered UI render through it instead of the
 * tool group; without it they render like any other tool call.
 */
export type ThreadComponents = {
  AssistantMessage?: ComponentType | undefined
  ToolFallback?: ToolCallMessagePartComponent | undefined
  ToolGroup?:
    ComponentType<PropsWithChildren<{ group: ThreadGroupPart }>> | undefined
  ReasoningGroup?:
    ComponentType<PropsWithChildren<{ group: ThreadGroupPart }>> | undefined
  TaskGroup?: ComponentType<{ group: ThreadGroupPart }> | undefined
  MessageMetadata?: ComponentType<{ speaker?: string | undefined; work?: ReactNode }>
  MessageActions?: ComponentType
}

const defaultGroupBy = groupPartByType({
  reasoning: ['group-chainOfThought', 'group-reasoning'],
  'tool-call': ['group-chainOfThought', 'group-tool'],
  'standalone-tool-call': [],
})

type ThreadGroupKey =
  | 'group-chainOfThought'
  | 'group-reasoning'
  | 'group-tool'
  | 'group-task'
  | 'group-reply'

const WORK_PATH: readonly ThreadGroupKey[] = ['group-chainOfThought']

// Theorem: artifact tools and pending approvals render outside the tool group,
// and a reasoning summary is work like the reasoning it stands in for.
const messageGroupBy = (
  part: Parameters<typeof defaultGroupBy>[0],
  context?: Parameters<typeof defaultGroupBy>[1],
): readonly ThreadGroupKey[] =>
  isStandaloneToolCall(part)
    ? []
    : part.type === 'data' && part.name === 'theorem-reasoning_summary'
      ? WORK_PATH
      : defaultGroupBy(part, context)

const TASK_GROUP_PATH: readonly ThreadGroupKey[] = [
  'group-chainOfThought',
  'group-task',
]

const taskAwareGroupBy = (
  part: Parameters<typeof messageGroupBy>[0],
  context?: Parameters<typeof messageGroupBy>[1],
): readonly ThreadGroupKey[] => {
  const path = messageGroupBy(part, context)
  return part.type === 'tool-call' &&
    part.messages !== undefined &&
    path.length > 0 &&
    !context?.toolUIs?.[part.toolName]?.length
    ? TASK_GROUP_PATH
    : path
}

type GroupBy = typeof taskAwareGroupBy

const REPLY_PATH: readonly ThreadGroupKey[] = ['group-reply']

/** The same grouping with everything that is not work gathered into groups the work pass leaves out. */
const workOnly =
  (groupBy: GroupBy): GroupBy =>
  (part, context) => {
    const path = groupBy(part, context)
    return path.length > 0 ? path : REPLY_PATH
  }

const messageWorkGroupBy = workOnly(messageGroupBy)
const taskAwareWorkGroupBy = workOnly(taskAwareGroupBy)

export type ThreadProps = {
  components?: ThreadComponents | undefined
  autoFocus?: boolean | undefined
  composerSlots?: ComposerSlots
  /** The composer sits at the bottom before the first message too, as it does beside the IDE. */
  composerDocked?: boolean | undefined
  /** Another view lies over the thread while it stays laid out, as Theia and the Vault do on the desktop. */
  covered?: boolean | undefined
  /** Context tools move above the shared editor when space is dedicated to another view. */
  composerLayout?: ComposerLayout
}

const EMPTY_COMPONENTS: ThreadComponents = {}

const ThreadComponentsContext =
  createContext<ThreadComponents>(EMPTY_COMPONENTS)

// Startup exposes a loading placeholder thread; treat it as a new chat so
// the composer mounts centered. Loads after startup keep the docked layout.
const isNewChatView = (s: AssistantState) =>
  s.thread.messages.length === 0 && (!s.thread.isLoading || s.threads.isLoading)

// A switched thread that is still fetching its history: skeleton, not welcome.
const isHistoryLoadingView = (s: AssistantState) =>
  s.thread.messages.length === 0 &&
  s.thread.isLoading &&
  !s.thread.isDisabled &&
  !s.threads.isLoading

const ThreadHistorySkeleton: FC = () => (
  <div
    data-slot="aui_thread-history-skeleton"
    role="status"
    className="animate-in fade-in fill-mode-both flex flex-col gap-y-6 [animation-delay:150ms] [animation-duration:200ms]"
  >
    <span className="sr-only">Loading conversation</span>
    <Skeleton className="h-9 w-2/5 rounded-xl motion-reduce:animate-none" />
    <div className="flex flex-col gap-y-2">
      <Skeleton className="h-4 w-11/12 motion-reduce:animate-none" />
      <Skeleton className="h-4 w-4/5 motion-reduce:animate-none" />
      <Skeleton className="h-4 w-3/5 motion-reduce:animate-none" />
    </div>
    <Skeleton className="h-9 w-1/3 rounded-xl motion-reduce:animate-none" />
    <div className="flex flex-col gap-y-2">
      <Skeleton className="h-4 w-10/12 motion-reduce:animate-none" />
      <Skeleton className="h-4 w-2/3 motion-reduce:animate-none" />
    </div>
  </div>
)

export const Thread: FC<ThreadProps> = ({
  components = EMPTY_COMPONENTS,
  autoFocus = true,
  composerDocked = false,
  composerSlots,
  covered = false,
  composerLayout = composerDocked ? 'sidecar' : undefined,
}) => {
  const isEmpty = useAuiState(isNewChatView)

  return (
    <ThreadComponentsContext.Provider value={components}>
      <ThreadRoot
        isEmpty={isEmpty && !composerDocked}
        autoFocus={autoFocus}
        covered={covered}
        composerLayout={composerLayout}
        composerSlots={composerSlots}
      />
    </ThreadComponentsContext.Provider>
  )
}

/** `isEmpty`: a new chat whose composer waits in the middle of the page. */
const ThreadRoot: FC<{
  isEmpty: boolean
  autoFocus: boolean
  covered: boolean
  composerLayout?: ComposerLayout | undefined
  composerSlots?: ComposerSlots | undefined
}> = ({ isEmpty, autoFocus, covered, composerLayout, composerSlots }) => {
  const footerRef = useRef<HTMLDivElement>(null)
  const unseen = useUnseenFrom(covered)
  const viewportRef = useRef<HTMLDivElement>(null)
  const viewport = useComposedRefs(viewportRef, unseen.ref)
  useAppearanceScrollAnchor(viewportRef)
  const surface = useComposerSurface()
  // The first send hands the composer from the middle of the page down to
  // the bottom, on a spring rather than a jump. It lands against the bottom
  // edge, so it glides rather than overshooting past it.
  useLayoutEffect(() => {
    const origin = takeLaunch('composer-dock')
    if (!isEmpty && origin && footerRef.current)
      flyFrom(footerRef.current, origin, { fade: false, ease: 'glide' })
  }, [isEmpty])

  return (
    <ThreadPrimitive.Root
      className="aui-root aui-thread-root @container flex h-full min-w-0 flex-col"
    >
      <ThreadPrimitive.Viewport
        ref={viewport}
        turnAnchor="top"
        data-slot="aui_thread-viewport"
        data-kit-clip
        className="appearance-thread-viewport relative flex flex-1 flex-col overflow-x-hidden overflow-y-auto"
      >
        <div
          data-appearance-part="conversation-track"
          className={cn(
            'appearance-conversation-track mx-auto flex w-full flex-1 flex-col pt-4',
            isEmpty && 'justify-center',
          )}
        >
          <AuiIf condition={isHistoryLoadingView}>
            <ThreadHistorySkeleton />
          </AuiIf>

          <ProjectContextChip />

          <ThreadLoadEarlier />

          <div
            data-slot="aui_message-group"
            className="mb-14 flex flex-col gap-y-6 empty:hidden"
          >
            <UnseenFromProvider value={unseen.anchor}>
              <ThreadPrimitive.Messages>
                {() => <ThreadMessage />}
              </ThreadPrimitive.Messages>
            </UnseenFromProvider>
          </div>

          <ThreadReviewCards />

          <ThreadPrimitive.ViewportFooter
            ref={footerRef}
            className={cn(
              'appearance-composer-track aui-thread-viewport-footer flex flex-col overflow-visible pb-4 md:pb-6',
              !isEmpty && 'sticky bottom-0 mt-auto',
              // Pinned to the sheet's bottom edge, it covers the messages
              // scrolling under it with the stretch of gradient it sits on;
              // under a glass composer it is clear, so the glass frosts them.
              !isEmpty &&
                {
                  flat: 'appearance-flat-footer',
                  paper: 'bg-sheet rounded-t-(--composer-radius) bg-bottom',
                  glass: 'glass-footer',
                  liquid: 'liquid-footer',
                }[surface],
            )}
          >
            <ThreadScrollToBottom />
            <Composer autoFocus={autoFocus} layout={composerLayout} slots={composerSlots} />
          </ThreadPrimitive.ViewportFooter>
        </div>
      </ThreadPrimitive.Viewport>
    </ThreadPrimitive.Root>
  )
}

function useAppearanceScrollAnchor(ref: { current: HTMLDivElement | null }) {
  useEffect(() => {
    let frame = 0
    let revision = 0
    const preserve = () => {
      const viewport = ref.current
      if (!viewport || !viewport.clientHeight) return
      const edge = viewport.getBoundingClientRect().top
      const message = Array.from(viewport.querySelectorAll<HTMLElement>('[data-role="assistant"], [data-role="user"]'))
        .find((item) => item.getBoundingClientRect().bottom > edge)
      if (!message) return
      const anchor = Array.from(message.querySelectorAll<HTMLElement>('p, h1, h2, h3, h4, h5, h6'))
        .find((block) => block.getClientRects().length > 0 && block.getBoundingClientRect().bottom > edge) ?? message
      const offset = anchor.getBoundingClientRect().top - edge
      const current = ++revision
      const correct = () => {
        if (current !== revision || !anchor.isConnected) return
        const delta = anchor.getBoundingClientRect().top - viewport.getBoundingClientRect().top - offset
        if (Math.abs(delta) > 0.5) viewport.scrollBy({ top: delta, behavior: 'instant' })
      }
      cancelAnimationFrame(frame)
      frame = requestAnimationFrame(() => {
        frame = requestAnimationFrame(() => {
          correct()
          // The first frame commits layout; correcting it also resolves any
          // new font faces before checking their load status.
          if (document.fonts?.status !== 'loading') return
          void document.fonts.ready.then(() => {
            if (current !== revision) return
            frame = requestAnimationFrame(() => {
              frame = requestAnimationFrame(correct)
            })
          })
        })
      })
    }
    document.addEventListener('theorem-appearance-reflow', preserve)
    return () => {
      document.removeEventListener('theorem-appearance-reflow', preserve)
      revision++
      cancelAnimationFrame(frame)
    }
  }, [ref])
}

const ThreadMessage: FC = () => {
  const { AssistantMessage: AssistantMessageComponent = AssistantMessage } =
    useContext(ThreadComponentsContext)
  const role = useAuiState((s) => s.message.role)
  const isEditing = useAuiState((s) => s.message.composer.isEditing)
  const isSpoken = useAuiState((s) => s.message.metadata.modality === 'voice')

  if (isEditing) return <EditComposer />
  if (isSpoken) return <SpokenMessage />
  if (role === 'user') return <UserMessage />
  return (
    <>
      <UnseenDivider />
      <AssistantMessageComponent />
    </>
  )
}

type VoiceRunPosition = 'single' | 'start' | 'middle' | 'end'

const useVoiceRunPosition = (): VoiceRunPosition =>
  useAuiState((s) => {
    const before =
      s.thread.messages[s.message.index - 1]?.metadata.modality === 'voice'
    const after =
      s.thread.messages[s.message.index + 1]?.metadata.modality === 'voice'
    if (before) return after ? 'middle' : 'end'
    return after ? 'start' : 'single'
  })

const SpokenText: TextMessagePartComponent = ({ text }) => (
  <p className="aui-spoken-message-text m-0">{text}</p>
)

const SpokenMessage: FC = () => {
  const role = useAuiState((s) => s.message.role)
  const position = useVoiceRunPosition()
  const isSpeaking = useAuiState(
    (s) =>
      s.message.role === 'assistant' && s.message.status?.type === 'running',
  )
  const opensExchange = position === 'start' || position === 'single'

  return (
    <MessagePrimitive.Root
      data-slot="aui_spoken-message-root"
      data-role={role}
      data-voice-run={position}
      className={cn(
        'aui-spoken-message bg-muted/40 mx-2 px-3 py-1.5 [contain-intrinsic-size:auto_48px] [content-visibility:auto]',
        position === 'single' && 'rounded-xl py-2',
        position === 'start' && 'rounded-t-xl pt-2',
        position === 'middle' && '-mt-6',
        position === 'end' && '-mt-6 rounded-b-xl pb-2',
      )}
    >
      {opensExchange && (
        <div
          data-slot="aui_spoken-exchange-header"
          className="text-muted-foreground mb-1.5 flex items-center gap-1.5 text-xs"
        >
          <Icon.Microphone className="size-3" />
          <span>Voice conversation</span>
        </div>
      )}
      <div
        data-slot="aui_spoken-message-content"
        className="text-foreground flex items-start gap-2 text-sm leading-relaxed"
      >
        <span className="text-muted-foreground mt-1 shrink-0" aria-hidden>
          {role === 'user' ? (
            <Icon.Microphone className="size-3.5" />
          ) : (
            <Icon.Chat className="size-3.5" />
          )}
        </span>
        <span className="sr-only">
          {role === 'user' ? 'You said' : 'Assistant said'}
        </span>
        <div className="min-w-0 flex-1 wrap-break-word">
          <MessagePrimitive.Parts components={{ Text: SpokenText }} />
          {isSpeaking && (
            <span
              data-slot="aui_spoken-message-indicator"
              role="status"
              className="text-muted-foreground ms-1 animate-pulse font-sans"
              aria-label="Assistant is speaking"
            >
              ●
            </span>
          )}
        </div>
        <SpokenActionBar />
      </div>
    </MessagePrimitive.Root>
  )
}

const SpokenActionBar: FC = () => {
  return (
    <ActionBarPrimitive.Root
      hideWhenRunning
      autohide="always"
      className="aui-spoken-action-bar text-muted-foreground flex shrink-0 gap-1"
    >
      <ActionBarPrimitive.Copy
        render={<TooltipIconButton tooltip="Copy" className="size-6" />}
      >
        <AuiIf condition={(s) => s.message.isCopied}>
          <Icon.Copied className="animate-in fade-in zoom-in-30 -spin-in-20 ease-lift duration-(--duration-lift)" />
        </AuiIf>
        <AuiIf condition={(s) => !s.message.isCopied}>
          <Icon.Copy className="animate-in fade-in zoom-in-75" />
        </AuiIf>
      </ActionBarPrimitive.Copy>
    </ActionBarPrimitive.Root>
  )
}

const FOCUSABLE_SELECTOR =
  "a[href], button:not([disabled]), input:not([disabled]), textarea:not([disabled]), [contenteditable='true'], [tabindex]:not([tabindex='-1']):not([disabled])"

const nextFocusable = (start: Element) => {
  for (
    let element = start.nextElementSibling;
    element;
    element = element.nextElementSibling
  ) {
    const target = element.matches(FOCUSABLE_SELECTOR)
      ? element
      : element.querySelector(FOCUSABLE_SELECTOR)
    if (target instanceof HTMLElement) return target
  }
  return null
}

const ThreadLoadEarlier: FC = () => {
  const visible = useAuiState(
    (s) => s.thread.hasEarlier || s.thread.isLoadingEarlier,
  )
  const loading = useAuiState((s) => s.thread.isLoadingEarlier)
  const slotRef = useRef<HTMLDivElement>(null)
  const focusedRef = useRef<Element | null>(null)

  // The last page removes the button; a keyboard user on it continues from the
  // next control in tab order rather than from the document body.
  useLayoutEffect(() => {
    const focused = focusedRef.current
    const slot = slotRef.current
    if (visible || !focused || focused.isConnected || !slot) return
    focusedRef.current = null
    const active = document.activeElement
    if (active && active !== document.body) return
    nextFocusable(slot)?.focus()
  }, [visible])

  return (
    <div
      ref={slotRef}
      className="contents"
      onFocus={(event) => {
        focusedRef.current = event.target
      }}
    >
      <span role="status" className="sr-only">
        {loading ? 'Loading earlier messages' : ''}
      </span>
      {visible && (
        <ThreadPrimitive.LoadEarlier
          render={
            <Button
              variant="ghost"
              size="sm"
              data-slot="aui_thread-load-earlier"
              className="aui-thread-load-earlier text-muted-foreground mb-6 self-center rounded-full"
            />
          }
        >
          <span className={cn(loading && 'shimmer motion-reduce:animate-none')}>
            {loading ? 'Loading earlier messages' : 'Load earlier messages'}
          </span>
        </ThreadPrimitive.LoadEarlier>
      )}
    </div>
  )
}

const ThreadScrollToBottom: FC = () => {
  return (
    <ThreadPrimitive.ScrollToBottom
      render={
        <TooltipIconButton
          tooltip="Scroll to bottom"
          variant="outline"
          className="aui-thread-scroll-to-bottom border-separator bg-raised absolute -top-12 z-10 size-9 self-center rounded-full p-2 shadow-composer disabled:invisible"
        />
      }
    >
      <Icon.Next className="size-4 rotate-90" />
    </ThreadPrimitive.ScrollToBottom>
  )
}

const MessageError: FC = () => {
  const hasErrorPart = useAuiState((s) => {
    const status = s.message.status
    const error = status?.type === 'incomplete' ? status.error : undefined
    return (
      typeof error === 'string' && hasTheoremError(s.message.content, error)
    )
  })
  if (hasErrorPart) return null
  return (
    <MessagePrimitive.Error>
      <ErrorPrimitive.Root data-surface-role="status" {...appearancePair('error', 'status')} className="aui-message-error-root bg-error-container text-error-ink mt-2 rounded-lg px-4 py-3 text-sm">
        <ErrorPrimitive.Message className="aui-message-error-message break-words" />
      </ErrorPrimitive.Root>
    </MessagePrimitive.Error>
  )
}

/**
 * An assistant message's parts. The reply pass draws what the agent said and
 * leaves its reasoning and tool calls out; the work pass draws only those, for
 * the sheet the activity line opens.
 */
const MessageParts: FC<{ work?: boolean }> = ({ work = false }) => {
  const {
    ToolFallback: ToolFallbackComponent = TheoremToolCall,
    ToolGroup,
    ReasoningGroup,
    TaskGroup: TaskGroupComponent,
  } = useContext(ThreadComponentsContext)
  const groupBy = TaskGroupComponent
    ? work
      ? taskAwareWorkGroupBy
      : taskAwareGroupBy
    : work
      ? messageWorkGroupBy
      : messageGroupBy

  return (
    <MessagePrimitive.GroupedParts groupBy={groupBy}>
      {({ part, children }) => {
        switch (part.type) {
          // A group that returns null draws none of its parts.
          case 'group-reply':
            return null
          case 'group-chainOfThought':
            return work ? children : null
          case 'group-task':
            return TaskGroupComponent ? (
              <TaskGroupComponent group={part} />
            ) : null
          case 'group-tool':
            return ToolGroup ? (
              <ToolGroup group={part}>{children}</ToolGroup>
            ) : (
              children
            )
          case 'group-reasoning': {
            if (ReasoningGroup) {
              return <ReasoningGroup group={part}>{children}</ReasoningGroup>
            }
            const running = part.status.type === 'running'
            // Reasoning is drawn on the activity sheet only, which is its frame.
            return (
              <ReasoningRoot
                streaming={running}
                variant="ghost"
                className="mb-1"
              >
                <ReasoningTrigger
                  active={running}
                  duration={reasoningDuration(part.timing)}
                />
                <ReasoningContent aria-busy={running}>
                  <ReasoningText>{children}</ReasoningText>
                </ReasoningContent>
              </ReasoningRoot>
            )
          }
          case 'text':
            return <MarkdownText />
          case 'reasoning':
            return <Reasoning {...part} />
          case 'tool-call':
            return part.toolUI ?? <ToolFallbackComponent {...part} />
          case 'data':
            return part.dataRendererUI
          case 'file':
            return (
              <div data-slot="aui_assistant-message-file" className="py-1">
                <MessageFile {...part} />
              </div>
            )
          case 'image':
            return (
              <div data-slot="aui_assistant-message-image" className="py-1">
                <Image {...part} />
              </div>
            )
          case 'indicator':
            return null
          default:
            return null
        }
      }}
    </MessagePrimitive.GroupedParts>
  )
}

/**
 * An assistant message as the thread shows it: the activity line, by the
 * speaker's name when it has one, then the reply. A delegation panel shows a
 * specialist's run with it.
 */
export const AssistantMessageContent: FC<{ speaker?: string }> = ({
  speaker,
}) => {
  const { TaskGroup, MessageMetadata = Activity } = useContext(ThreadComponentsContext)
  const messageId = useAuiState((state) => state.message.id)
  const material = useSurfaceMaterial('assistant-reading')
  const groupBy = TaskGroup ? taskAwareGroupBy : messageGroupBy
  const parts = useAuiState((s) => s.message.parts)
  const toolUIs = useAuiState((s) => s.tools.toolUIs)
  const hasWork = useMemo(
    () => parts.some((part) => groupBy(part, { toolUIs }).length > 0),
    [groupBy, parts, toolUIs],
  )

  return (
    <div
      data-surface-role="assistant-reading"
      data-surface-material={material}
      className="appearance-reading-plane"
    >
      <MessageMetadata
        speaker={speaker}
        work={hasWork ? <MessageParts work /> : undefined}
      />
      <div
        data-slot="aui_assistant-message-content"
        data-appearance-part="prose-track"
        data-appearance-id={`${messageId}:prose`}
        data-appearance-recipe="prose"
        {...appearancePair('primary', 'assistant-reading')}
        className="appearance-assistant-prose text-foreground wrap-break-word"
      >
        <MessageParts />
        <MessageError />
      </div>
    </div>
  )
}
/** A mark, then who spoke above what they said, as in docs/plans/evidence/refs/sidebar-compare@2026-11-05.webp. */
/** The agent speaks from the left of the column, under its mark and name. */
const MESSAGE_GRID = 'appearance-message-grid grid'

/** The attributes that make a message a surface Kit can stand on, named and labelled for the agent. */
function useKitSurface() {
  const id = useAuiState((s) => s.message.id)
  const label = useAuiState((s) =>
    messageLabel(
      s.message.role,
      s.message.parts
        .flatMap((part) => (part.type === 'text' ? [part.text] : []))
        .join(' '),
    ),
  )
  return {
    'data-kit-perch': messageSurface(id),
    'data-kit-label': label,
    // The same message, named for Theo to be sent to.
    ...thingProps('message', id, { label }),
  }
}

const AssistantMessage: FC = () => {
  const live = useArrivedLive()
  const { MessageActions = AssistantActionBar } = useContext(ThreadComponentsContext)
  const surface = useKitSurface()
  const ACTION_BAR_PT = 'pt-1.5'
  // Keep the action bar inside the contained root's paint box, then cancel its reserved space in flow.
  const ACTION_BAR_HEIGHT = `min-h-7.5 ${ACTION_BAR_PT}`

  return (
    <MessagePrimitive.Root
      data-slot="aui_assistant-message-root"
      {...surface}
      data-role="assistant"
      data-live={live || undefined}
      className={cn(
        MESSAGE_GRID,
        'data-live:animate-in data-live:fade-in data-live:slide-in-from-bottom-3 data-live:ease-settle data-live:duration-(--duration-settle) relative -mb-7.5 pb-7.5',
      )}
    >
      <div data-appearance-part="avatar-gutter" className="appearance-avatar-gutter"><FaceSlot /></div>
      <div className="appearance-message-prose min-w-0">
        <AssistantMessageContent speaker="Theorem" />

        <div
          data-slot="aui_assistant-message-footer"
          className={cn('appearance-reading-plane flex items-center', ACTION_BAR_HEIGHT)}
        >
          <BranchPicker />
          <MessageActions />
        </div>
      </div>
    </MessagePrimitive.Root>
  )
}

/** Opens a new thread with this conversation's history through this reply. */
const ForkFromMessage: FC = () => {
  const threadId = useAuiState((s) => s.threadListItem.remoteId)
  const messageId = useAuiState((s) => s.message.id)
  const runId = useAuiState((s) => s.message.metadata.custom.theoremRunId)
  const startThread = useStartThreadFrom()
  if (!threadId) return null
  return (
    <ActionBarMorePrimitive.Item
      className="aui-action-bar-more-item hover:bg-hover focus:bg-hover flex cursor-pointer items-center gap-2 rounded-md px-2.5 py-1.5 text-sm outline-none select-none"
      disabled={startThread.isPending}
      onSelect={() =>
        startThread.mutate({
          kind: 'forked',
          threadId,
          at: {
            messageId,
            runId: typeof runId === 'string' ? runId : undefined,
          },
        })
      }
    >
      <Icon.Fork className="size-4" />
      Fork into new thread
    </ActionBarMorePrimitive.Item>
  )
}
const AssistantActionBar: FC = () => {
  return (
    <ActionBarPrimitive.Root
      hideWhenRunning
      autohide="not-last"
      className={cn(
        'aui-assistant-action-bar-root text-muted-foreground col-start-3 row-start-2 -ms-1 flex gap-1',
        // When a live reply finishes, its actions pop in one after another.
        'in-data-live:[&>*]:animate-in in-data-live:[&>*]:fade-in in-data-live:[&>*]:zoom-in-50 in-data-live:[&>*]:fill-mode-both in-data-live:[&>*]:ease-snap in-data-live:[&>*]:duration-(--duration-snap)',
        'in-data-live:[&>*:nth-child(2)]:[animation-delay:50ms] in-data-live:[&>*:nth-child(3)]:[animation-delay:100ms] in-data-live:[&>*:nth-child(4)]:[animation-delay:150ms]',
      )}
    >
      <ActionBarPrimitive.Copy render={<TooltipIconButton tooltip="Copy" />}>
        <AuiIf condition={(s) => s.message.isCopied}>
          <Icon.Copied className="animate-in fade-in zoom-in-30 -spin-in-20 ease-lift duration-(--duration-lift)" />
        </AuiIf>
        <AuiIf condition={(s) => !s.message.isCopied}>
          <Icon.Copy className="animate-in fade-in zoom-in-75" />
        </AuiIf>
      </ActionBarPrimitive.Copy>
      <ReadAloud />
      <ActionBarPrimitive.Reload
        render={<TooltipIconButton tooltip="Regenerate" />}
      >
        <Icon.Reload />
      </ActionBarPrimitive.Reload>
      <ActionBarMorePrimitive.Root>
        <ActionBarMorePrimitive.Trigger
          render={
            <TooltipIconButton
              tooltip="More"
              className="data-[state=open]:bg-selected"
            />
          }
        >
          <Icon.More />
        </ActionBarMorePrimitive.Trigger>
        <ActionBarMorePrimitive.Content
          side="bottom"
          align="start"
          sideOffset={6}
          className="aui-action-bar-more-content bg-popover text-popover-foreground shadow-popover data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95 data-[state=open]:animate-in data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95 data-[state=closed]:animate-out data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2 z-50 min-w-[8rem] overflow-hidden rounded-xl border p-1.5"
        >
          <ForkFromMessage />
          <ActionBarPrimitive.ExportMarkdown
            render={
              <ActionBarMorePrimitive.Item className="aui-action-bar-more-item hover:bg-hover focus:bg-hover flex cursor-pointer items-center gap-2 rounded-md px-2.5 py-1.5 text-sm outline-none select-none" />
            }
          >
            <Icon.Share className="size-4" />
            Export as Markdown
          </ActionBarPrimitive.ExportMarkdown>
        </ActionBarMorePrimitive.Content>
      </ActionBarMorePrimitive.Root>
    </ActionBarPrimitive.Root>
  )
}

const MessageFile: FileMessagePartComponent = (part) => {
  const image = part.mimeType.toLowerCase().startsWith('image/')
    ? getFileHref(part.data, part.mimeType, part.sourceType)
    : null
  if (!image) return <File {...part} />
  return (
    <Image
      type="image"
      image={image}
      status={part.status}
      {...(part.filename !== undefined && { filename: part.filename })}
    />
  )
}

const UserFilePart: FileMessagePartComponent = (part) => (
  <div data-slot="aui_user-message-file" className="py-1">
    <MessageFile {...part} />
  </div>
)

const UserImagePart: ImageMessagePartComponent = (part) => (
  <div data-slot="aui_user-message-image" className="py-1">
    <Image {...part} />
  </div>
)

const UserMessage: FC = () => {
  const material = useSurfaceMaterial('user-message')
  const contentRef = useRef<HTMLDivElement>(null)
  const surface = useKitSurface()
  // A message just sent from the composer flies up from where it was typed.
  useLayoutEffect(() => {
    const origin = takeLaunch()
    const content = contentRef.current
    if (!origin || !content) return
    // The root's content-visibility would clip the flight to its own box.
    const root = content.closest<HTMLElement>(
      '[data-slot="aui_user-message-root"]',
    )
    root?.style.setProperty('content-visibility', 'visible')
    // The message starts where the composer's text does, so it rises straight
    // up rather than swinging across.
    const { width } = content.getBoundingClientRect()
    const start = new DOMRect(origin.left, origin.top, width, origin.height)
    void flyFrom(content, start)?.then(() =>
      root?.style.removeProperty('content-visibility'),
    )
  }, [])

  return (
    // The person speaks from the right of the column, across from the agent,
    // on the composer's paper the message rose from.
    <MessagePrimitive.Root
      data-slot="aui_user-message-root"
      {...surface}
      className="flex flex-col items-end gap-1 ps-[20%] pe-2 [contain-intrinsic-size:auto_200px] [content-visibility:auto]"
      data-role="user"
    >
      <UserMessageAttachments />
      <div className="aui-user-message-content-wrapper flex max-w-full min-w-0 items-start gap-1">
        <div className="aui-user-action-bar-wrapper pt-1">
          <UserActionBar />
        </div>
        <div
          ref={contentRef}
          data-appearance-part="user-message"
          data-appearance-radius-role="user-message"
          data-surface-role="user-message"
          data-material={material}
          {...appearancePair('primary', 'user-message')}
          className={cn('appearance-surface aui-user-message-content text-ink min-w-0 border border-separator px-3 py-2 whitespace-pre-wrap wrap-break-word empty:hidden', composerSurface(material))}
        >
          <MessagePrimitive.Parts
            components={{
              File: UserFilePart,
              Image: UserImagePart,
              Text: UserTextPart,
            }}
          />
        </div>
      </div>
      <BranchPicker data-slot="aui_user-branch-picker" className="px-1" />
    </MessagePrimitive.Root>
  )
}

/**
 * A review's answer has a card naming the review, so the line telling the
 * agent which one stays out of view. A long paste folds after its opening,
 * so the replies around it stay in reach.
 */
const UserTextPart: TextMessagePartComponent = (part) => {
  const answered = useAuiState((s) =>
    s.message.parts.some(
      (part) => part.type === 'data' && part.name === 'theorem-review_answer',
    ),
  )
  const text = answered ? answerBody(part.text) : part.text
  if (!text) return null
  return (
    <ChatCollapsibleMessage
      text={text}
      side="outgoing"
      showMoreLabel="Show more"
      showLessLabel="Show less"
      renderText={(shown) => <UserMarkdown text={shown} />}
    />
  )
}

const UserActionBar: FC = () => {
  return (
    <ActionBarPrimitive.Root
      hideWhenRunning
      autohide="not-last"
      className="aui-user-action-bar-root flex flex-col items-end"
    >
      <ActionBarPrimitive.Edit
        render={
          <TooltipIconButton tooltip="Edit" className="aui-user-action-edit" />
        }
      >
        <Icon.Edit />
      </ActionBarPrimitive.Edit>
    </ActionBarPrimitive.Root>
  )
}

const EditComposer: FC = () => {
  const surface = useComposerSurface()
  const rootRef = useRef<HTMLFormElement>(null)
  useLiquidGlass(rootRef, surface === 'liquid')
  return (
    // No content-visibility here, unlike the message rows: its paint
    // containment would clip the composer's shadow and glow, and only the
    // message being edited renders this.
    <MessagePrimitive.Root
      data-slot="aui_edit-composer-wrapper"
      className="flex flex-col px-2"
    >
      <div className="relative ms-auto w-full max-w-[70%]">
        {surface === 'paper' && (
          <div
            aria-hidden="true"
            className="lift-glow [--glow-radius:var(--composer-radius)]"
          />
        )}
        <ComposerPrimitive.TriggerPopoverRoot>
          <ComposerPrimitive.Root
            ref={rootRef}
            data-surface-role="composer"
            data-material={surface}
            className={cn(
              'appearance-surface aui-edit-composer-root flex w-full cursor-text flex-col rounded-(--composer-radius) border transition-[border-color] duration-100',
              composerSurface(surface),
            )}
          >
            <ComposerToolTrigger />
            <ComposerEditor
              label="Edit message"
              className="appearance-reading-plane aui-edit-composer-input w-full"
              autoFocus
            />
            <div className="appearance-reading-plane aui-edit-composer-footer mx-2.5 mb-2.5 flex items-center gap-1.5 self-end">
              <ComposerPrimitive.Cancel
                render={
                  <Button variant="ghost" size="sm" className="h-8 px-3" />
                }
              >
                Cancel
              </ComposerPrimitive.Cancel>
              <ComposerPrimitive.Send
                render={
                  <Button
                    size="sm"
                    className="bg-redwood text-on-redwood hover:bg-redwood-hover h-8 px-3"
                  />
                }
              >
                Send
              </ComposerPrimitive.Send>
            </div>
          </ComposerPrimitive.Root>
        </ComposerPrimitive.TriggerPopoverRoot>
      </div>
    </MessagePrimitive.Root>
  )
}

const BranchPicker: FC<BranchPickerPrimitive.Root.Props> = ({
  className,
  ...rest
}) => {
  return (
    <BranchPickerPrimitive.Root
      hideWhenSingleBranch
      className={cn(
        'aui-branch-picker-root text-muted-foreground -ms-2 me-2 inline-flex items-center text-xs',
        className,
      )}
      {...rest}
    >
      <BranchPickerPrimitive.Previous
        render={<TooltipIconButton tooltip="Previous" />}
      >
        <Icon.Previous />
      </BranchPickerPrimitive.Previous>
      <span className="aui-branch-picker-state font-medium">
        <BranchPickerPrimitive.Number /> / <BranchPickerPrimitive.Count />
      </span>
      <BranchPickerPrimitive.Next render={<TooltipIconButton tooltip="Next" />}>
        <Icon.Next />
      </BranchPickerPrimitive.Next>
    </BranchPickerPrimitive.Root>
  )
}
