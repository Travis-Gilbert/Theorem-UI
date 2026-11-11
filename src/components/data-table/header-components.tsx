// SOURCING: TanStack Table kitchen-sink-shadcn-base example (vendored from github.com/TanStack/table examples/react/kitchen-sink-shadcn-base/src/components/data-table/header-components.tsx; imports point at this app)
// Adapted: the select-all header goes with row selection; the resize handle
// takes the focus colour instead of the example's blue.
import { Subscribe } from '@tanstack/react-table'
import {
  useHeaderContext,
  useTableContext,
} from '@/components/data-table/table-hook'
import { cn } from '@/lib/utils'

export function ResizeHandle(): React.ReactNode {
  const header = useHeaderContext()
  const table = useTableContext()

  if (!header.column.getCanResize()) return null

  return (
    <Subscribe source={table.atoms.columnResizing}>
      {() => (
        <div
          onDoubleClick={() => header.column.resetSize()}
          onMouseDown={header.getResizeHandler()}
          onTouchStart={header.getResizeHandler()}
          className={cn(
            'absolute right-[-2px] z-10 top-1/2 h-6 w-[3px] -translate-y-1/2 cursor-e-resize select-none touch-none rounded-md transition-colors hover:bg-focus before:absolute before:left-[-4px] before:right-[-4px] before:top-0 before:h-full before:content-[""]',
            header.column.getIsResizing() && 'bg-focus',
          )}
        />
      )}
    </Subscribe>
  )
}
