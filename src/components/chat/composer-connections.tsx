// SOURCING: Base UI Popover (placement, collision, dismissal) as components/program/palette uses it, with ui/tooltip for the chip's hint like the Web and Plan chips beside it; coss ui Switch and Checkbox for the toggles, fuzzysort through connections/search for the filter, the assistant-ui thread item for the conversation's id; the roster is GET /api/connections/v1/tools (lib/theorem/connections) and the per-conversation choice is lib/theorem/tool-selection. A real switch per row, not cmdk: a switch inside a cmdk option is a control inside an option, which screen readers cannot reach.
import { useAuiState } from '@assistant-ui/react'
import { Popover } from '@base-ui/react/popover'
import { Link } from '@tanstack/react-router'
import { useEffect, useMemo, useState } from 'react'
import { EffectBadge } from '@/components/connections/parts'
import { matching } from '@/components/connections/search'
import { Checkbox } from '@/components/coss/checkbox'
import { Input } from '@/components/coss/input'
import { Switch } from '@/components/coss/switch'
import { Icon } from '@/components/icons'
import { Button } from '@/components/ui/button'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { describeError } from '@/lib/theorem/client'
import { useConnectionTools } from '@/lib/theorem/connections'
import type { ToolGroup } from '@/lib/theorem/connections'
import { isNotServed } from '@/lib/theorem/passthrough'
import {
  changeSelection,
  connectionsOn,
  reconcile,
  toolId,
  toolsOn,
  useToolSelections,
} from '@/lib/theorem/tool-selection'
import { cn } from '@/lib/utils'
import { COMPOSER_TOOLTIP_DELAY } from './composer-tools'

const CHIP =
  'text-ink-muted hover:bg-hover hover:text-ink data-popup-open:bg-hover data-popup-open:text-ink flex h-8 items-center gap-1.5 rounded-md px-2 text-sm transition-colors duration-100 outline-none focus-visible:outline-2 focus-visible:outline-focus'
/** The chip once the choice differs from the default, like Web and Plan when they are on. */
const CHIP_CUSTOM =
  'bg-redwood/15 text-redwood hover:bg-redwood/25 hover:text-redwood data-popup-open:bg-redwood/25 data-popup-open:text-redwood'

/**
 * Which connections' tools this conversation may use. It starts on every
 * connection that is switched on in Settings and sends nothing; once the
 * person narrows it, each turn carries the choice. It stays out of the row
 * when this Theorem has no connections to list.
 */
export function ComposerConnections() {
  // A new conversation has only its local id until its first send gives it the durable one.
  const threadKey = useAuiState(
    (state) => state.threadListItem.remoteId ?? state.threadListItem.id,
  )
  const tools = useConnectionTools()
  if (tools.isPending || (tools.error && isNotServed(tools.error))) return null
  return (
    <Control
      key={threadKey}
      threadKey={threadKey}
      roster={tools.data}
      error={tools.error}
      retry={() => void tools.refetch()}
    />
  )
}

function Control({
  threadKey,
  roster,
  error,
  retry,
}: {
  threadKey: string
  roster: ToolGroup[] | undefined
  error: unknown
  retry: () => void
}) {
  const [open, setOpen] = useState(false)
  const stored = useToolSelections((state) => state.byThread[threadKey])
  const save = useToolSelections((state) => state.set)
  const selection = useMemo(
    () => (roster ? reconcile(roster, stored) : stored),
    [roster, stored],
  )

  // A connection removed since the choice was made drops out of it, so a send never names one that is gone.
  useEffect(() => {
    if (roster && JSON.stringify(selection) !== JSON.stringify(stored))
      save(threadKey, selection)
  }, [roster, selection, stored, save, threadKey])

  const custom = selection !== undefined
  const count = connectionsOn(roster ?? [], selection).size
  const label = custom ? `Connections, ${count} on` : 'Connections'

  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger
            delay={COMPOSER_TOOLTIP_DELAY}
            render={
              <Popover.Trigger
                aria-label={label}
                className={cn(CHIP, custom && CHIP_CUSTOM)}
              />
            }
          >
            <Icon.Plugin className="size-4" />
            <span className="pe-0.5">Connections</span>
            {custom && (
              <span className="bg-redwood/20 -ms-0.5 me-0.5 rounded-full px-1.5 text-xs tabular-nums">
                {count}
              </span>
            )}
          </TooltipTrigger>
          <TooltipContent side="bottom">
            {custom
              ? `${count} ${count === 1 ? 'connection is' : 'connections are'} on in this conversation`
              : 'Choose the connections this conversation can use'}
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
      <Popover.Portal>
        <Popover.Positioner
          className="z-50"
          side="top"
          align="start"
          sideOffset={6}
          collisionPadding={8}
        >
          <Popover.Popup className="w-80 max-w-[calc(100vw-1rem)] overflow-hidden rounded-lg border border-separator bg-raised text-ink shadow-lg outline-none">
            <Roster
              roster={roster}
              error={error}
              retry={retry}
              selection={selection}
              onChange={(change) =>
                save(threadKey, changeSelection(roster ?? [], selection, change))
              }
              onLeave={() => setOpen(false)}
            />
          </Popover.Popup>
        </Popover.Positioner>
      </Popover.Portal>
    </Popover.Root>
  )
}

type Visible = { group: ToolGroup; tools: ToolGroup['tools']; forceOpen: boolean }

/** The connections and tools that match what was typed; a connection's own name keeps all its tools. */
function visible(roster: readonly ToolGroup[], query: string): Visible[] {
  if (!query.trim())
    return roster.map((group) => ({ group, tools: group.tools, forceOpen: false }))
  return roster.flatMap((group) => {
    const named = matching([group], query, (entry) => entry.label).length > 0
    const hits = matching(
      group.tools,
      query,
      (tool) => tool.title ?? tool.name,
      (tool) => tool.name,
    )
    if (!named && hits.length === 0) return []
    return [{ group, tools: named ? group.tools : hits, forceOpen: !named }]
  })
}

function Roster({
  roster,
  error,
  retry,
  selection,
  onChange,
  onLeave,
}: {
  roster: ToolGroup[] | undefined
  error: unknown
  retry: () => void
  selection: Parameters<typeof connectionsOn>[1]
  onChange: (change: Parameters<typeof changeSelection>[2]) => void
  onLeave: () => void
}) {
  const [query, setQuery] = useState('')
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(new Set())
  const groups = useMemo(() => visible(roster ?? [], query), [roster, query])
  const connections = connectionsOn(roster ?? [], selection)
  const tools = toolsOn(roster ?? [], selection)

  const toggleExpanded = (id: string) =>
    setExpanded((current) => {
      const next = new Set(current)
      if (!next.delete(id)) next.add(id)
      return next
    })

  return (
    <div className="flex flex-col">
      {roster && roster.length > 0 && (
        <div className="border-b border-separator p-2">
          <Input
            type="search"
            aria-label="Search connections and tools"
            placeholder="Search connections and tools"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
        </div>
      )}

      <div className="max-h-80 overflow-y-auto p-1">
        {error && !roster ? (
          <div className="flex flex-col items-start gap-2 px-2 py-3">
            <p role="alert" className="text-sm text-error-ink">
              {describeError(error)}
            </p>
            <Button variant="outline" size="sm" onClick={retry}>
              Try again
            </Button>
          </div>
        ) : roster && roster.length === 0 ? (
          <div className="flex flex-col gap-1 px-2 py-3">
            <p className="text-sm">Nothing is connected yet.</p>
            <p className="text-xs text-ink-muted">
              Connect GitHub or add an MCP server in Settings, and its tools
              show up here.
            </p>
          </div>
        ) : groups.length === 0 ? (
          <p className="px-2 py-3 text-sm text-ink-muted">
            Nothing matches that.
          </p>
        ) : (
          <ul className="flex flex-col">
            {groups.map(({ group, tools: shown, forceOpen }) => {
              const id = group.connectionId
              const isOpen = forceOpen || expanded.has(id)
              const on = connections.has(id)
              const available = group.tools.filter((tool) =>
                tools.has(toolId(id, tool.name)),
              ).length
              return (
                <li key={id} className="flex flex-col">
                  <div className="flex items-center gap-1.5 pe-2">
                    <button
                      type="button"
                      aria-expanded={isOpen}
                      aria-label={`${isOpen ? 'Hide' : 'Show'} the tools of ${group.label}`}
                      onClick={() => toggleExpanded(id)}
                      className="flex min-w-0 flex-1 items-center gap-1.5 rounded-md px-1.5 py-1.5 text-start text-sm outline-none hover:bg-hover focus-visible:outline-2 focus-visible:outline-focus"
                    >
                      <Icon.ChevronRight
                        className={cn(
                          'size-3.5 shrink-0 transition-transform',
                          isOpen && 'rotate-90',
                        )}
                      />
                      <span className="min-w-0 flex-1 truncate">{group.label}</span>
                      <span className="shrink-0 text-xs text-ink-faint">
                        {!group.enabled
                          ? 'Off in Settings'
                          : on && available < group.tools.length
                            ? `${available} of ${group.tools.length} tools`
                            : `${group.tools.length} ${group.tools.length === 1 ? 'tool' : 'tools'}`}
                      </span>
                    </button>
                    <Switch
                      aria-label={`${group.label} available in this conversation`}
                      checked={on}
                      disabled={!group.enabled}
                      onCheckedChange={(next) =>
                        onChange({ connection: id, on: next })
                      }
                    />
                  </div>
                  {isOpen && (
                    <ul className="flex flex-col pb-1 ps-7">
                      {shown.map((tool) => (
                        <li key={tool.name}>
                          <label className="flex cursor-pointer items-center gap-2 rounded-md px-1.5 py-1 text-sm hover:bg-hover">
                            <Checkbox
                              checked={tools.has(toolId(id, tool.name))}
                              disabled={!on}
                              onCheckedChange={(next) =>
                                onChange({ tool: toolId(id, tool.name), on: next })
                              }
                            />
                            <span
                              className="min-w-0 flex-1 truncate"
                              title={tool.description}
                            >
                              {tool.title ?? tool.name}
                            </span>
                            <EffectBadge effect={tool.effect} />
                          </label>
                        </li>
                      ))}
                      {shown.length === 0 && (
                        <li className="px-1.5 py-1 text-xs text-ink-muted">
                          This connection lists no tools.
                        </li>
                      )}
                    </ul>
                  )}
                </li>
              )
            })}
          </ul>
        )}
      </div>

      <div className="border-t border-separator p-1">
        <Link
          to="/settings/connections"
          onClick={onLeave}
          className="flex h-8 items-center gap-2 rounded-md px-2 text-sm text-ink-muted outline-none hover:bg-hover hover:text-ink focus-visible:bg-hover"
        >
          <Icon.Plugin className="size-3.5" />
          {roster && roster.length === 0
            ? 'Set up connections'
            : 'Manage connections'}
        </Link>
      </div>
    </div>
  )
}
