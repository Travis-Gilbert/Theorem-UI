// SOURCING: TanStack Table kitchen-sink-shadcn-base example (vendored from github.com/TanStack/table examples/react/kitchen-sink-shadcn-base/src/components/data-table/data-table-column-header.tsx; imports point at this app)
// Adapted: grouping goes with the grouping feature; marks come from the app's Icon set.
'use client'

import { Subscribe } from '@tanstack/react-table'
import {
  useHeaderContext,
  useTableContext,
} from '@/components/data-table/table-hook'

import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/data-table/ui/dropdown-menu'
import { Icon } from '@/components/icons'
import { cn } from '@/lib/utils'

export function ColumnHeader({
  title,
  className,
}: {
  title?: string
  className?: string
}): React.ReactNode {
  const header = useHeaderContext()
  const table = useTableContext()
  const column = header.column

  const displayTitle = column.columnDef.meta?.label ?? title ?? column.id

  const canSort = column.getCanSort()
  const canHide = column.getCanHide()
  const canPin = column.getCanPin()

  if (!canSort && !canHide && !canPin) {
    return <div className={cn(className)}>{displayTitle}</div>
  }

  return (
    <div className={cn('flex items-center gap-2', className)}>
      <Subscribe
        source={table.store}
        selector={(s) => ({
          sorting: s.sorting,
          columnPinning: s.columnPinning,
        })}
      >
        {() => {
          const sorted = canSort ? column.getIsSorted() : false
          const pinned = canPin ? column.getIsPinned() : false

          return (
            <DropdownMenu>
              <DropdownMenuTrigger
                render={
                  <Button
                    variant="ghost"
                    size="sm"
                    className="group -ml-2 h-7 px-2 text-xs font-medium text-ink-muted hover:text-ink data-[popup-open]:bg-hover"
                  />
                }
              >
                <span>{displayTitle}</span>
                {sorted === 'desc' ? (
                  <Icon.ArrowDown className="ml-1 size-3.5" />
                ) : sorted === 'asc' ? (
                  <Icon.ArrowUp className="ml-1 size-3.5" />
                ) : canSort ? (
                  <Icon.UpDown className="ml-1 size-3.5 opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100 group-data-[state=open]:opacity-100" />
                ) : null}
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start">
                {canSort && (
                  <>
                    <DropdownMenuItem
                      onClick={() => column.toggleSorting(false)}
                    >
                      <Icon.ArrowUp className="mr-2 size-3.5 text-ink-faint" />
                      Asc
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      onClick={() => column.toggleSorting(true)}
                    >
                      <Icon.ArrowDown className="mr-2 size-3.5 text-ink-faint" />
                      Desc
                    </DropdownMenuItem>
                  </>
                )}
                {canPin && (
                  <>
                    {canSort ? <DropdownMenuSeparator /> : null}
                    <DropdownMenuItem
                      onClick={() => column.pin('start')}
                      disabled={pinned === 'start'}
                    >
                      <Icon.Pin className="mr-2 size-3.5 text-ink-faint" />
                      Pin left
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      onClick={() => column.pin('end')}
                      disabled={pinned === 'end'}
                    >
                      <Icon.Pin className="mr-2 size-3.5 rotate-180 text-ink-faint" />
                      Pin right
                    </DropdownMenuItem>
                    {pinned ? (
                      <DropdownMenuItem onClick={() => column.pin(false)}>
                        <Icon.Unpin className="mr-2 size-3.5 text-ink-faint" />
                        Unpin
                      </DropdownMenuItem>
                    ) : null}
                  </>
                )}
                {canHide && (
                  <>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                      onClick={() => column.toggleVisibility(false)}
                    >
                      <Icon.Hide className="mr-2 size-3.5 text-ink-faint" />
                      Hide
                    </DropdownMenuItem>
                  </>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          )
        }}
      </Subscribe>
    </div>
  )
}
