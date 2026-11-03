// SOURCING: TanStack Table kitchen-sink-shadcn-base example (vendored from github.com/TanStack/table examples/react/kitchen-sink-shadcn-base/src/components/data-table/data-table-view-options.tsx; imports point at this app)
// Adapted: lists the columns a person can hide (a column that cannot be
// hidden is not offered), shows at every width, and marks come from the app's
// Icon set.
'use client'

import * as React from 'react'
import { useTableContext } from '@/components/data-table/table-hook'

import { Button } from '@/components/ui/button'
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from '@/components/data-table/ui/command'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/data-table/ui/popover'
import { Icon } from '@/components/icons'
import { cn } from '@/lib/utils'
import {
  Sortable,
  SortableContent,
  SortableItem,
  SortableItemHandle,
  SortableOverlay,
} from '@/components/data-table/ui/sortable'

export function DataTableViewOptions(): React.ReactNode {
  const table = useTableContext()
  const triggerRef = React.useRef<HTMLButtonElement>(null)
  const columnOrder = table.state.columnOrder

  return (
    <Sortable
      value={columnOrder}
      onValueChange={(order) => table.setColumnOrder(order)}
    >
      <Popover>
        <PopoverTrigger
          render={
            <Button
              ref={triggerRef}
              aria-label="Toggle columns"
              variant="outline"
              role="combobox"
              size="sm"
              className="ml-auto gap-1.5 focus:outline-none focus:ring-1 focus:ring-ring"
              onPointerDown={(event) => {
                const target = event.target
                if (!(target instanceof HTMLElement)) return
                if (target.hasPointerCapture(event.pointerId)) {
                  target.releasePointerCapture(event.pointerId)
                }

                if (
                  event.button === 0 &&
                  event.ctrlKey === false &&
                  event.pointerType === 'mouse'
                ) {
                  event.preventDefault()
                }
              }}
            />
          }
        >
          <Icon.Columns />
          View
          <Icon.UpDown className="ml-auto opacity-50" />
        </PopoverTrigger>
        <PopoverContent
          align="end"
          className="w-full max-w-48 p-0"
          onCloseAutoFocus={() => triggerRef.current?.focus()}
        >
          <Command>
            <CommandInput placeholder="Search columns..." />
            <SortableContent asChild>
              <CommandList>
                <CommandEmpty>No columns found.</CommandEmpty>
                <CommandGroup>
                  {table
                    .getAllColumns()
                    .sort((a, b) => {
                      const aIndex = columnOrder.indexOf(a.id)
                      const bIndex = columnOrder.indexOf(b.id)
                      return aIndex - bIndex
                    })
                    .filter(
                      (column) =>
                        typeof column.accessorFn !== 'undefined' &&
                        column.getCanHide(),
                    )
                    .map((column) => (
                      <SortableItem key={column.id} value={column.id} asChild>
                        <CommandItem
                          aria-selected={column.getIsVisible()}
                          data-selected={column.getIsVisible()}
                          onSelect={() =>
                            column.toggleVisibility(!column.getIsVisible())
                          }
                        >
                          <Icon.Check
                            className={cn(
                              'size-4 shrink-0',
                              column.getIsVisible()
                                ? 'opacity-100'
                                : 'opacity-0',
                            )}
                          />
                          <span className="truncate">
                            {column.columnDef.meta?.label ?? column.id}
                          </span>
                          <SortableItemHandle asChild>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="ml-auto size-6"
                            >
                              <Icon.Grip />
                            </Button>
                          </SortableItemHandle>
                        </CommandItem>
                      </SortableItem>
                    ))}
                </CommandGroup>
                <CommandSeparator />
                <CommandGroup>
                  <div className="flex items-center gap-1">
                    <CommandItem
                      onSelect={() => table.toggleAllColumnsVisible(false)}
                      className="w-full justify-center border"
                    >
                      Hide All
                    </CommandItem>
                    <CommandItem
                      onSelect={() => table.toggleAllColumnsVisible(true)}
                      className="w-full justify-center border"
                    >
                      Show All
                    </CommandItem>
                  </div>
                </CommandGroup>
              </CommandList>
            </SortableContent>
          </Command>
        </PopoverContent>
      </Popover>
      <SortableOverlay>
        <div className="bg-primary/10 size-full" />
      </SortableOverlay>
    </Sortable>
  )
}
