// SOURCING: TanStack Table kitchen-sink-shadcn-base example (vendored from github.com/TanStack/table examples/react/kitchen-sink-shadcn-base/src/components/data-table/data-table-pagination.tsx; imports point at this app)
// Adapted: the count line reports filtered rows of all rows (row selection is
// not used) with the caller's noun, and marks come from the app's Icon set.
'use client'

import * as React from 'react'
import { useTableContext } from '@/components/data-table/table-hook'

import { Icon } from '@/components/icons'
import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/data-table/ui/select'

export function DataTablePagination({
  pageSizeOptions = [10, 20, 30, 40, 50, Infinity],
  noun = 'row',
}: {
  pageSizeOptions?: Array<number>
  /** What a row is, for the count line: "12 of 340 models". */
  noun?: string
}): React.ReactNode {
  const table = useTableContext()

  return (
    <div className="flex w-full flex-col-reverse items-center justify-between gap-4 overflow-auto p-1 sm:flex-row sm:gap-6">
      <div className="flex-1 whitespace-nowrap text-ink-muted text-xs">
        {table.getFilteredRowModel().rows.length.toLocaleString()} of{' '}
        {table.getCoreRowModel().rows.length.toLocaleString()} {noun}s
      </div>
      <div className="flex flex-col-reverse items-center gap-4 sm:flex-row sm:gap-6 lg:gap-8">
        <div className="flex items-center space-x-2">
          <p className="whitespace-nowrap text-ink-muted text-xs">
            Rows per page
          </p>
          <Select
            value={`${table.state.pagination.pageSize}`}
            onValueChange={(value) => {
              table.setPageSize(Number(value))
            }}
          >
            <SelectTrigger className="h-7 w-[4.5rem]">
              <SelectValue placeholder={table.state.pagination.pageSize} />
            </SelectTrigger>
            <SelectContent side="top">
              {pageSizeOptions.map((pageSize) => (
                <SelectItem key={pageSize} value={`${pageSize}`}>
                  {pageSize === Infinity ? 'All' : pageSize}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex items-center justify-center whitespace-nowrap text-ink-muted text-xs">
          Page {(table.state.pagination.pageIndex + 1).toLocaleString()} of{' '}
          {table.getPageCount().toLocaleString()}
        </div>
        <div className="flex items-center space-x-2">
          <Button
            aria-label="Go to first page"
            variant="outline"
            className="size-7 p-0"
            onClick={() => table.setPageIndex(0)}
            disabled={!table.getCanPreviousPage()}
          >
            <Icon.First className="size-4" aria-hidden="true" />
          </Button>
          <Button
            aria-label="Go to previous page"
            variant="outline"
            size="icon"
            className="size-7"
            onClick={() => table.previousPage()}
            disabled={!table.getCanPreviousPage()}
          >
            <Icon.ChevronLeft className="size-4" aria-hidden="true" />
          </Button>
          <Button
            aria-label="Go to next page"
            variant="outline"
            size="icon"
            className="size-7"
            onClick={() => table.nextPage()}
            disabled={!table.getCanNextPage()}
          >
            <Icon.ChevronRight className="size-4" aria-hidden="true" />
          </Button>
          <Button
            aria-label="Go to last page"
            variant="outline"
            size="icon"
            className="size-7"
            onClick={() => table.lastPage()}
            disabled={!table.getCanLastPage()}
          >
            <Icon.Last className="size-4" aria-hidden="true" />
          </Button>
        </div>
      </div>
    </div>
  )
}
