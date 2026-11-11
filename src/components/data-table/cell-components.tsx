// SOURCING: TanStack Table kitchen-sink-shadcn-base example (vendored from github.com/TanStack/table examples/react/kitchen-sink-shadcn-base/src/components/data-table/cell-components.tsx; imports point at this app)
// Adapted: only the generic text and date cells are kept; the example's
// Person cells, selection, grouping and actions cells go with its demo data.
import { useCellContext } from '@/components/data-table/table-hook'

function formatDate(
  date: Date | string | number,
  opts: Intl.DateTimeFormatOptions = {},
) {
  return new Intl.DateTimeFormat('en-US', {
    month: opts.month ?? 'long',
    day: opts.day ?? 'numeric',
    year: opts.year ?? 'numeric',
    ...opts,
  }).format(new Date(date))
}

export function TextCell(): React.ReactNode {
  const cell = useCellContext<string | undefined>()
  const value = cell.getValue()
  return value == null ? null : <>{String(value)}</>
}

export function DateCell(): React.ReactNode {
  const cell = useCellContext<Date | string | undefined>()
  const value = cell.getValue()
  return value == null ? null : <>{formatDate(value, { month: 'short' })}</>
}
