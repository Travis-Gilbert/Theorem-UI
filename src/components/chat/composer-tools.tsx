// SOURCING: assistant-ui ComposerPrimitive.TriggerPopover through the vendored registry element ComposerTriggerPopover, with its TriggerAdapter and TriggerMatcher seams; the default directive formatter writes the pick into the message; the native tool catalog from lib/theorem/tools
import type {
  TriggerAdapter,
  TriggerItem,
  TriggerMatcher,
} from '@assistant-ui/react'
import { useMemo } from 'react'
import { ComposerTriggerPopover } from '@/components/assistant-ui/elements/composer-trigger-popover.aui'
import { searchTools, useToolCatalog } from '@/lib/theorem/tools'
import type { NativeTool, ToolCatalogState } from '@/lib/theorem/tools'

/** The composer's buttons are passed on the way to typing, so their tooltips wait for a resting pointer. */
export const COMPOSER_TOOLTIP_DELAY = 700

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
