// SOURCING: none — the Index's working pane for an open work item: the same header and close the record inspector wears, around ./item-detail behind the tracker's gate
import { Icon } from '@/components/icons'
import { cn } from '@/lib/utils'
import { WorkGate } from './gate'
import { WorkDetail } from './item-detail'

/** One work item in the Index working pane, opened by `item=work:<id>`. */
export function WorkInspector({
  itemId,
  onOpen,
  onClose,
  className,
}: {
  itemId: string
  onOpen: (itemId: string) => void
  onClose: () => void
  className?: string
}) {
  return (
    <div className={cn('flex h-full min-h-0 flex-col bg-background', className)}>
      <header className="flex items-center gap-2 border-b border-separator px-4 py-2.5">
        <span className="text-xs text-ink-faint">Work item</span>
        <button
          type="button"
          data-index-close
          aria-label="Close"
          onClick={onClose}
          className="ms-auto rounded p-1 text-ink-faint hover:bg-hover hover:text-ink"
        >
          <Icon.Close className="size-4" />
        </button>
      </header>
      <WorkGate>
        <WorkDetail key={itemId} itemId={itemId} onOpen={onOpen} />
      </WorkGate>
    </div>
  )
}
