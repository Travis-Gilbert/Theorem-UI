// SOURCING: none — composition of the tracker's own bar, list and board over one view state (./view-state); every part is usable alone and this is the arrangement most places want
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from '@/components/coss/empty'
import { Skeleton } from '@/components/ui/skeleton'
import { NewItemButton } from './new-item'
import type { NewItemDefaults } from './new-item'
import { SyncStatus } from './states'
import { useViewState } from './view-state'
import type { ViewState } from './view-state'
import { WorkBoard } from './work-board'
import { WorkList } from './work-list'
import { WorkViewBar } from './view-bar'
import type { WorkFilter } from './contract'

/** The list or the board, whichever the view's layout says. */
export function WorkItems({
  state,
  layout,
  selectedId,
  onOpen,
}: {
  state: ViewState
  /** Shows this layout whatever the view says. */
  layout?: 'list' | 'board'
  selectedId?: string
  onOpen?: (itemId: string) => void
}) {
  return (layout ?? state.view?.layout) === 'board' ? (
    <WorkBoard state={state} selectedId={selectedId} onOpen={onOpen} />
  ) : (
    <WorkList state={state} selectedId={selectedId} onOpen={onOpen} />
  )
}

/**
 * A view of items with its bar: name, filter chips, display options, saving,
 * and New. `extra` narrows what it shows without becoming part of the view,
 * and `defaults` start a new item from what the place implies. Without the
 * bar it is only the items, which a bar placed elsewhere for the same view
 * id edits; `layout` fixes list or board.
 */
export function WorkItemsScreen({
  viewId,
  extra,
  defaults,
  layout,
  bar = true,
  selectedId,
  onOpen,
  onOpenView,
  showSync = true,
}: {
  viewId?: string
  extra?: WorkFilter
  defaults?: NewItemDefaults
  layout?: 'list' | 'board'
  bar?: boolean
  selectedId?: string
  onOpen?: (itemId: string) => void
  onOpenView?: (viewId: string) => void
  showSync?: boolean
}) {
  const state = useViewState(viewId, extra)
  if (state.loading)
    return (
      <div className="flex flex-col gap-2 p-3" aria-busy>
        <Skeleton className="h-6 w-1/3" />
        <Skeleton className="h-64 w-full" />
      </div>
    )
  if (state.missing)
    return (
      <Empty>
        <EmptyHeader>
          <EmptyTitle>This view is gone</EmptyTitle>
          <EmptyDescription>It was deleted or never existed.</EmptyDescription>
        </EmptyHeader>
      </Empty>
    )
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {bar && (
        <WorkViewBar
          state={state}
          onOpenView={onOpenView}
          layoutToggle={!layout}
          actions={<NewItemButton defaults={defaults} />}
        />
      )}
      <WorkItems
        state={state}
        layout={layout}
        selectedId={selectedId}
        onOpen={onOpen}
      />
      {showSync && (
        <SyncStatus className="flex items-center gap-2 border-t border-separator px-3 py-1 text-xs" />
      )}
    </div>
  )
}

/** Only the bar for a view; the list or board for the same view id shows what it changes. */
export function WorkViewBarOf({
  viewId,
  onOpenView,
}: {
  viewId: string
  onOpenView?: (viewId: string) => void
}) {
  const state = useViewState(viewId)
  if (state.loading) return <Skeleton className="m-3 h-7 w-1/2" />
  if (state.missing) return null
  return <WorkViewBar state={state} onOpenView={onOpenView} />
}
