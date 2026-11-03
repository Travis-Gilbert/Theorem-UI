// SOURCING: TanStack Table kitchen-sink-shadcn-base example (vendored from github.com/TanStack/table examples/react/kitchen-sink-shadcn-base/src/hooks/table.ts; imports point at this app)
// Adapted: only the example's generic cells are registered (a table defines
// its own cells with useCellContext), the selection and grouping cells are
// dropped with those features, and each table passes its own getRowId.
import { createTableHook } from '@tanstack/react-table'
import { features } from '@/components/data-table/features'
import { dynamicFilterFn } from '@/lib/data-table'

import { DataTablePagination } from '@/components/data-table/data-table-pagination'
import { DataTableFilterList } from '@/components/data-table/data-table-filter-list'
import { DataTableSortList } from '@/components/data-table/data-table-sort-list'
import { DataTableViewOptions } from '@/components/data-table/data-table-view-options'

import { DateCell, TextCell } from '@/components/data-table/cell-components'

import { ColumnHeader } from '@/components/data-table/data-table-column-header'
import { ResizeHandle } from '@/components/data-table/header-components'

export const {
  createAppColumnHelper,
  useAppTable,
  useTableContext,
  useCellContext,
  useHeaderContext,
} = createTableHook({
  features,
  defaultColumn: {
    size: 120,
    minSize: 60,
    maxSize: 800,
    filterFn: dynamicFilterFn,
  },
  globalFilterFn: 'fuzzy',
  columnResizeMode: 'onChange' as const,

  tableComponents: {
    Pagination: DataTablePagination,
    FilterList: DataTableFilterList,
    SortList: DataTableSortList,
    ViewOptions: DataTableViewOptions,
  },

  cellComponents: {
    TextCell,
    DateCell,
  },

  headerComponents: {
    ColumnHeader,
    ResizeHandle,
  },
})
