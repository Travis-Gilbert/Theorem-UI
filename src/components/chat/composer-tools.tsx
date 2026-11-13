// SOURCING: assistant-ui ComposerPrimitive.TriggerPopover through the vendored registry element ComposerTriggerPopover, with its TriggerAdapter and TriggerMatcher seams; the default directive formatter writes the pick into the message; the native tool catalog from lib/theorem/tools; zustand (the Web toggle and the per-conversation Plan toggle state the composer and the runtime share, Plan keyed by the thread as useAuiState names it), Base UI Toggle (the Web and Plan chips), ui/tooltip over Base UI Tooltip, the shared useSpin over anime.js; the SDK's webResearch option requests research without narrowing the turn's tools; planning independently requests a durable plan through draft_plan
import { useAuiState } from '@assistant-ui/react'
import type {
  TriggerAdapter,
  TriggerItem,
  TriggerMatcher,
} from '@assistant-ui/react'
import { Toggle } from '@base-ui/react/toggle'
import { useMemo, useRef } from 'react'
import { create } from 'zustand'
import { ComposerTriggerPopover } from '@/components/assistant-ui/elements/composer-trigger-popover.aui'
import { Icon } from '@/components/icons'
import { useSpin } from '@/components/motion'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { searchTools, useToolCatalog } from '@/lib/theorem/tools'
import type { NativeTool, ToolCatalogState } from '@/lib/theorem/tools'

/** The composer's buttons are passed on the way to typing, so their tooltips wait for a resting pointer. */
export const COMPOSER_TOOLTIP_DELAY = 700

type WebSearchState = { on: boolean; toggle: () => void }

/**
 * Whether the next turn searches the web. It stays on across sends until the
 * person turns it off, as a mode of the conversation rather than of one
 * message.
 */
export const useWebSearch = create<WebSearchState>()((set) => ({
  on: false,
  toggle: () => set((state) => ({ on: !state.on })),
}))

/**
 * Request research at send time while retaining the turn's other admitted
 * tools. Explicit capability scopes remain an independent server restriction.
 */
export const webTurnOptions = (): { webResearch?: true } =>
  useWebSearch.getState().on ? { webResearch: true } : {}

type PlanningState = {
  /** The conversations with Plan on, by the composer's thread key. */
  byThread: Readonly<Record<string, true>>
  set: (thread: string, on: boolean) => void
  /** A new conversation's Plan moves to its durable id once it has one. */
  adopt: (from: string, to: string) => void
}

const without = (map: Readonly<Record<string, true>>, key: string) => {
  const { [key]: _dropped, ...rest } = map
  return rest
}

/**
 * Whether a conversation's next turn plans, keyed like its connection choice:
 * the thread's durable id, or its local id before the first send. Each
 * conversation starts with it off. It stays on until a plan is drafted, so a
 * turn where the model first asks a question is followed by another planning
 * turn, and then turns itself off: the conversation after a plan is about it.
 */
export const usePlanning = create<PlanningState>()((set) => ({
  byThread: {},
  set: (thread, on) =>
    set(({ byThread }) => ({
      byThread: on
        ? { ...byThread, [thread]: true }
        : without(byThread, thread),
    })),
  adopt: (from, to) =>
    set(({ byThread }) =>
      byThread[from]
        ? { byThread: { ...without(byThread, from), [to]: true } }
        : {},
    ),
}))

/**
 * The turn option Plan adds for the conversation sending, read at send time.
 * A conversation that was new when Plan was pressed has its durable id by the
 * time it sends, so Plan moves there first. Theorem gives a planning turn its
 * `draft_plan` operation and tells the model to write the request as one
 * durable plan.
 */
export function planningTurnOptions(
  localId: string,
  remoteId: string | undefined,
): { planning?: true } {
  const { adopt } = usePlanning.getState()
  if (remoteId && remoteId !== localId) adopt(localId, remoteId)
  return usePlanning.getState().byThread[remoteId ?? localId]
    ? { planning: true }
    : {}
}

const CHIP =
  'text-ink-muted hover:bg-hover hover:text-ink data-pressed:bg-redwood/15 data-pressed:text-redwood data-pressed:hover:bg-redwood/25 flex h-8 items-center gap-1.5 rounded-md px-2 text-sm transition-colors duration-100 outline-none focus-visible:outline-2 focus-visible:outline-focus'

/** The web mark turns while the pointer rests on its toggle, faster on a press. */
function WebMark({ className }: { className?: string }) {
  const ref = useRef<HTMLSpanElement>(null)
  useSpin(ref)
  return (
    <span ref={ref} className="flex">
      <Icon.WebSearch className={className} />
    </span>
  )
}

/** The Web chip asks Theorem to research while keeping its other tools. */
export function ComposerWebToggle() {
  const on = useWebSearch((state) => state.on)
  const toggle = useWebSearch((state) => state.toggle)
  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger
          delay={COMPOSER_TOOLTIP_DELAY}
          render={
            <Toggle
              pressed={on}
              onPressedChange={toggle}
              aria-label="Web search"
              className={CHIP}
            />
          }
        >
          <WebMark className="size-4" />
          <span className="pe-0.5">Web</span>
        </TooltipTrigger>
        <TooltipContent side="bottom">
          {on
            ? 'Web research is on. Theorem can still plan and build. Click to turn off.'
            : 'Use web research with Theorem'}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  )
}

/** The Plan chip beside Web: pressed, the next turn writes a Theorem plan the person sees as a graph. */
export function ComposerPlanToggle() {
  // A new conversation has only its local id until its first send gives it the durable one.
  const threadKey = useAuiState(
    (state) => state.threadListItem.remoteId ?? state.threadListItem.id,
  )
  const on = usePlanning((state) => state.byThread[threadKey] === true)
  const set = usePlanning((state) => state.set)
  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger
          delay={COMPOSER_TOOLTIP_DELAY}
          render={
            <Toggle
              pressed={on}
              onPressedChange={(pressed) => set(threadKey, pressed)}
              aria-label="Plan"
              className={CHIP}
            />
          }
        >
          <Icon.Plan className="size-4" />
          <span className="pe-0.5">Plan</span>
        </TooltipTrigger>
        <TooltipContent side="bottom">
          {on
            ? 'The next reply writes a plan you can work through as a graph. Click to turn off.'
            : 'Turn this into a plan: a move, a trip, a launch, or code'}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  )
}

const toItem = (tool: NativeTool): TriggerItem => ({
  id: tool.name,
  type: 'tool',
  label: tool.name,
  ...(tool.description ? { description: tool.description } : {}),
  metadata: { effect: tool.effect },
})

const TAGS: Readonly<Record<string, string>> = {
  write: 'writes',
  destructive: 'destructive',
}

const tagOf = (item: TriggerItem) =>
  typeof item.metadata?.effect === 'string'
    ? TAGS[item.metadata.effect]
    : undefined

const EMPTY: Readonly<Record<ToolCatalogState['status'], string>> = {
  loading: 'Loading tools…',
  ready: 'No matching tools',
  'not-served': 'This Theorem does not list its tools yet.',
  failed: 'Tools could not be loaded.',
}

/** The default formatter: a pick reads `:tool[name]` in the message. */
const DIRECTIVE = {}

/** A slash that starts the text or follows a space, up to the caret. */
const SLASH = /(?:^|\s)\/(\S*)$/u

/**
 * Opens on a slash the way the default detection does, and closes again once
 * the typed name matches no tool, so a path such as /usr/bin stays text and
 * Enter sends it.
 */
function slashMatcher(
  status: ToolCatalogState['status'],
  tools: readonly NativeTool[],
): TriggerMatcher {
  return (text, _char, cursor) => {
    const query = SLASH.exec(text.slice(0, cursor))?.[1]
    if (query === undefined) return null
    if (query && status !== 'loading' && !searchTools(tools, query).length)
      return null
    return { query, offset: cursor - query.length - 1, endOffset: cursor }
  }
}

/**
 * The "/" list in a composer: Theorem's native tools, filtered as the person
 * types. A pick writes `:tool[name]` into the message, so the turn and the
 * transcript both say which tool was asked for. It names intent and leaves
 * the turn's capability scope alone, which would otherwise shut out the other
 * tools the turn may need.
 */
export function ComposerToolTrigger() {
  const { status, tools } = useToolCatalog()
  const adapter = useMemo<TriggerAdapter>(
    () => ({
      categories: () => [],
      categoryItems: () => [],
      search: (query) => searchTools(tools, query).map(toItem),
    }),
    [tools],
  )
  const matcher = useMemo(() => slashMatcher(status, tools), [status, tools])
  return (
    <ComposerTriggerPopover
      char="/"
      adapter={adapter}
      matcher={matcher}
      isLoading={status === 'loading'}
      directive={DIRECTIVE}
      heading="Theorem tools"
      itemTag={tagOf}
      emptyItemsLabel={EMPTY[status]}
      loadingLabel={EMPTY.loading}
      className="w-md"
    />
  )
}
