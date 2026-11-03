// SOURCING: TanStack Table kitchen-sink-shadcn-base example (vendored from github.com/TanStack/table examples/react/kitchen-sink-shadcn-base/src/types/index.ts; imports point at this app)
import type {
  BuiltInFilterFn,
  ColumnFilter,
  TableFeatures,
} from '@tanstack/react-table'

export type TableFilterFeatures<TFeatures extends TableFeatures> = Pick<
  TFeatures,
  'columnFilteringFeature' | 'columnFacetingFeature'
>

export type FilterOperator =
  | BuiltInFilterFn
  | 'notIncludesString'
  | 'notEqualsString'
  | 'notEquals'
  | 'greaterThan'
  | 'notGreaterThan'
  | 'greaterThanOrEqualTo'
  | 'notGreaterThanOrEqualTo'
  | 'lessThan'
  | 'notLessThan'
  | 'lessThanOrEqualTo'
  | 'notLessThanOrEqualTo'
  | 'isRelativeToToday'
  | 'inRange'
  | 'startsWith'
  | 'endsWith'
  | 'isEmpty'
  | 'isNotEmpty'

export type JoinOperator = 'and' | 'or'

export interface ExtendedColumnFilter extends ColumnFilter {
  filterId?: string
  operator?: FilterOperator
  joinOperator?: JoinOperator
}
