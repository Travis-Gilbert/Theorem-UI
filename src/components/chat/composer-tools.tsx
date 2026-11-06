// SOURCING: assistant-ui ComposerPrimitive.TriggerPopover through the vendored registry element ComposerTriggerPopover, with its TriggerAdapter and TriggerMatcher seams; the default directive formatter writes the pick into the message; the native tool catalog from lib/theorem/tools; zustand (the Web and Plan toggle state the composer and the runtime share), Base UI Toggle (the Web and Plan chips), ui/tooltip over Base UI Tooltip, the shared useSpin over anime.js; the SDK's capabilityScope turn option carries Web to the server, which restricts the turn's tools to the named native operations, and its planning turn option makes the turn a planning turn that writes a Theorem plan through draft_plan
import type {
  TriggerAdapter,
  TriggerItem,
  TriggerMatcher,
} from '@assistant-ui/react'
import { Toggle } from '@base-ui/react/toggle'
import { useMemo, useRef } from 'react'
import type { ComponentProps } from 'react'
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

/**
 * The native operations RustyRed web answers through: `web_search` finds
 * pages and `web_read` reads one.
 */
export const WEB_SCOPE: readonly string[] = ['web_search', 'web_read']

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
 * The turn option Web adds, read at send time. A turn it is on for is scoped
 * to the RustyRed web operations, so the model answers from the web rather
 * than being asked to in the message; the server keeps only the named tools
 * (and the person's workspace tool), so such a turn has no other tools.
 */
export const webTurnOptions = (): { capabilityScope?: string[] } =>
  useWebSearch.getState().on ? { capabilityScope: [...WEB_SCOPE] } : {}

type PlanningState = { on: boolean; set: (on: boolean) => void }

/**
 * Whether the next turn plans. It stays on until a plan is drafted, so a
 * turn where the model first asks a question is followed by another planning
 * turn, and then turns itself off: the conversation after a plan is about it.
 */
export const usePlanning = create<PlanningState>()((set) => ({
  on: false,
  set: (on) => set({ on }),
}))

/**
 * The turn option Plan adds, read at send time. Theorem gives a planning turn
 * its `draft_plan` operation and tells the model to write the request as one
 * durable plan.
 */
export const planningTurnOptions = (): { planning?: true } =>
  usePlanning.getState().on ? { planning: true } : {}

const CHIP =
  'text-ink-muted hover:bg-hover hover:text-ink data-pressed:bg-redwood/15 data-pressed:text-redwood data-pressed:hover:bg-redwood/25 flex h-8 items-center gap-1.5 rounded-md px-2 text-sm transition-colors duration-100 outline-none focus-visible:outline-2 focus-visible:outline-focus'

/** The web mark turns while the pointer rests on its toggle, faster on a press. */
function WebMark(props: ComponentProps<'svg'>) {
  const ref = useRef<SVGSVGElement>(null)
  useSpin(ref)
  return <Icon.Web ref={ref} {...props} />
}

/** The Web chip beside the attachment button: pressed, it scopes each turn to RustyRed web. */
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
            ? 'Answering from the web with RustyRed, without other tools. Click to turn off.'
            : 'Answer from the web with RustyRed'}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  )
}

/** The Plan chip beside Web: pressed, the next turn writes a Theorem plan the person sees as a graph. */
export function ComposerPlanToggle() {
  const on = usePlanning((state) => state.on)
  const set = usePlanning((state) => state.set)
  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger
          delay={COMPOSER_TOOLTIP_DELAY}
          render={
            <Toggle
              pressed={on}
              onPressedChange={set}
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
