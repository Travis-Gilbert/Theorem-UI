// SOURCING: cmdk (the command list the composer's model palette already uses) over
// Theorem's valid_next, in a Base UI Popover (placement, collision, dismissal). The
// one satisfaction function is the server's: this list shows what it answers, in its
// order, and nothing is filtered here beyond the search.
import { Popover } from '@base-ui/react/popover'
import { useQuery } from '@tanstack/react-query'
import { Command } from 'cmdk'
import { useReactFlow } from '@xyflow/react'
import { Fragment, useState } from 'react'
import { create } from 'zustand'
import { Icon } from '@/components/icons'
import { Button } from '@/components/ui/button'
import type { CatalogEntry } from '@/lib/program/contracts'
import { loadCatalog, programKeys, validNext } from '@/lib/program/api'
import { insertNode, useProgramDoc, wireEnds } from '@/lib/program/store'
import type { Placement } from '@/lib/program/store'
import { describeError } from '@/lib/theorem/client'
import { describeMismatch, refuseAt } from './connection-toast'

type Anchor = { x: number; y: number }

/** Theorem's answer for a place on the canvas; the wire's button and this list share it. */
export const placementsKey = (at: Placement) =>
  [
    ...programKeys.catalog(),
    at.from?.port.shape_id,
    at.to?.port.shape_id,
  ] as const

export const placementsOn = (at: Placement): Promise<Array<CatalogEntry>> =>
  validNext({
    inputs: at.to ? [at.to.port] : [],
    outputs: at.from ? [at.from.port] : [],
  })

const bySection = (entries: Array<CatalogEntry>) => {
  const sections = new Map<string, Array<CatalogEntry>>()
  for (const entry of entries) {
    sections.set(entry.group, [...(sections.get(entry.group) ?? []), entry])
  }
  return [...sections]
}

export const usePalette = create<{
  anchor: Anchor | undefined
  screen: Anchor | undefined
  boundary: Placement
  openAt: (anchor: Anchor, screen: Anchor, boundary?: Placement) => void
  openOnEdge: (edgeId: string, anchor: Anchor) => void
  close: () => void
}>((set) => ({
  anchor: undefined,
  screen: undefined,
  boundary: {},
  openAt: (anchor, screen, boundary = {}) => set({ anchor, screen, boundary }),
  openOnEdge: (edgeId, anchor) => {
    const { program } = useProgramDoc.getState()
    const edge = program?.edges.find((candidate) => candidate.id === edgeId)
    if (!program || !edge) return
    set({
      anchor,
      screen: undefined,
      boundary: { ...wireEnds(program, edge), replacing: edgeId },
    })
  },
  close: () => set({ anchor: undefined, screen: undefined, boundary: {} }),
}))

export function Palette() {
  const { anchor, screen, boundary, close } = usePalette()
  const flow = useReactFlow()
  const scoped = Boolean(boundary.from || boundary.to)
  const entries = useQuery({
    enabled: Boolean(anchor),
    queryKey: placementsKey(boundary),
    queryFn: (): Promise<Array<CatalogEntry>> =>
      scoped ? placementsOn(boundary) : loadCatalog(),
  })
  const [search, setSearch] = useState('')
  if (!anchor) {
    if (search) setSearch('')
    return null
  }
  const at = screen ?? flow.flowToScreenPosition(anchor)
  const jumpTo = (nodeId: string) => {
    useProgramDoc.getState().select(nodeId)
    close()
    void flow.fitView({ nodes: [{ id: nodeId }], duration: 300, maxZoom: 1 })
  }
  const item = (entry: CatalogEntry) => (
    <Command.Item
      key={entry.id}
      value={`${entry.class_name ?? entry.id} ${entry.group}`}
      className="flex cursor-default items-center gap-2 rounded-md px-2 py-1.5 text-sm data-[selected=true]:bg-hover"
      onSelect={() => {
        close()
        const placed = { ...boundary }
        void insertNode(entry, anchor, placed)
          .then(({ refused }) => {
            if (!refused) return
            const end = placed.from ?? placed.to
            refuseAt(
              end
                ? document.querySelector(
                    `.react-flow__node[data-id="${CSS.escape(end.node)}"]`,
                  )
                : null,
              describeMismatch(refused),
            )
          })
          .catch((error: unknown) => refuseAt(null, describeError(error)))
      }}
    >
      <span className="min-w-0 flex-1 truncate">
        {entry.class_name ?? entry.id}
      </span>
      <span className="shrink-0 text-xs text-ink-muted">{entry.group}</span>
    </Command.Item>
  )
  return (
    <Popover.Root
      open
      onOpenChange={(open) => {
        if (!open) close()
      }}
    >
      <Popover.Portal>
        <Popover.Positioner
          className="z-50"
          anchor={{
            getBoundingClientRect: () =>
              DOMRect.fromRect({ ...at, width: 0, height: 0 }),
          }}
          side="bottom"
          align="start"
          collisionPadding={8}
        >
          <Popover.Popup className="w-80 overflow-hidden rounded-lg border border-separator bg-raised text-ink shadow-lg">
            {boundary.replacing && boundary.from && boundary.to && (
              <div className="flex items-center gap-1 border-b border-separator px-2 py-1 text-xs text-ink-muted">
                {[boundary.from.node, boundary.to.node].map((nodeId, index) => (
                  <Fragment key={nodeId}>
                    {index === 1 && (
                      <Icon.ChevronRight className="size-3 shrink-0" />
                    )}
                    <Button
                      size="xs"
                      variant="ghost"
                      className="min-w-0 shrink truncate font-normal"
                      title={`Go to ${nodeId}`}
                      onClick={() => jumpTo(nodeId)}
                    >
                      {nodeId}
                    </Button>
                  </Fragment>
                ))}
              </div>
            )}
            <Command label="Add a block" loop>
              <Command.Input
                autoFocus
                placeholder="Add a block"
                value={search}
                onValueChange={setSearch}
                className="h-9 w-full border-b border-separator bg-transparent px-3 text-sm outline-none"
              />
              <Command.List className="max-h-72 overflow-y-auto p-1">
                {entries.isPending && (
                  <Command.Loading className="px-2 py-1.5 text-xs text-ink-muted">
                    Asking Theorem
                  </Command.Loading>
                )}
                {entries.isError && (
                  <p
                    role="alert"
                    className="px-2 py-1.5 text-xs text-destructive"
                  >
                    {describeError(entries.error)}
                  </p>
                )}
                {!entries.isPending && (
                  <Command.Empty className="px-2 py-1.5 text-xs text-ink-muted">
                    No block fits here
                  </Command.Empty>
                )}
                {/* Searching ranks across sections, so the best match comes first. */}
                {scoped || search
                  ? entries.data?.map(item)
                  : bySection(entries.data ?? []).map(([group, members]) => (
                      <Command.Group
                        key={group}
                        heading={group}
                        className="[&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-1 [&_[cmdk-group-heading]]:text-xs [&_[cmdk-group-heading]]:text-ink-faint"
                      >
                        {members.map(item)}
                      </Command.Group>
                    ))}
              </Command.List>
            </Command>
          </Popover.Popup>
        </Popover.Positioner>
      </Popover.Portal>
    </Popover.Root>
  )
}
