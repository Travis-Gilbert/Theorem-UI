// SOURCING: TanStack Table kitchen-sink-shadcn-base example (vendored from github.com/TanStack/table examples/react/kitchen-sink-shadcn-base/src/hooks/features.ts; imports point at this app)
// Adapted: grouping, expanding and aggregation are dropped (no table here uses
// them), row selection is kept for the record table, and sortFn_basic is
// registered for boolean columns.
import {
  columnFacetingFeature,
  columnFilteringFeature,
  columnOrderingFeature,
  columnPinningFeature,
  columnResizingFeature,
  columnSizingFeature,
  columnVisibilityFeature,
  createFacetedRowModel,
  createFacetedUniqueValues,
  createFilteredRowModel,
  createPaginatedRowModel,
  createSortedRowModel,
  globalFilteringFeature,
  metaHelper,
  rowPaginationFeature,
  rowSelectionFeature,
  rowSortingFeature,
  sortFn_alphanumeric,
  sortFn_basic,
  sortFn_datetime,
  sortFn_text,
  tableFeatures,
} from '@tanstack/react-table'
import { rankItem } from '@tanstack/match-sorter-utils'

export interface MyColumnMeta {
  label?: string
  variant?: 'text' | 'number' | 'date' | 'boolean' | 'select' | 'multi-select'
  options?: Array<{ label: string; value: string; count?: number }>
}

const fuzzyFilterFn = (
  row: { getValue: (id: string) => unknown },
  columnId: string,
  value: unknown,
  addMeta?: (meta: object) => void,
) => {
  const itemRank = rankItem(row.getValue(columnId), value as string)
  addMeta?.({ itemRank })
  return itemRank.passed
}

export const features = tableFeatures({
  rowSortingFeature,
  rowPaginationFeature,
  rowSelectionFeature,
  columnFilteringFeature,
  columnFacetingFeature,
  columnOrderingFeature,
  columnVisibilityFeature,
  columnSizingFeature,
  columnResizingFeature,
  columnPinningFeature,
  globalFilteringFeature,
  columnMeta: metaHelper<MyColumnMeta>(),
  filteredRowModel: createFilteredRowModel(),
  facetedRowModel: createFacetedRowModel(),
  facetedUniqueValues: createFacetedUniqueValues(),
  paginatedRowModel: createPaginatedRowModel(),
  sortedRowModel: createSortedRowModel(),
  filterFns: { fuzzy: fuzzyFilterFn },
  sortFns: {
    alphanumeric: sortFn_alphanumeric,
    basic: sortFn_basic,
    datetime: sortFn_datetime,
    text: sortFn_text,
  },
})
