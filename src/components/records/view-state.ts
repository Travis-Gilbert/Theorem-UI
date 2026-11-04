// SOURCING: none — a record view's arrangement (sorts, filters, column order, sizes, visibility, footer calculations) kept in localStorage per view until Theorem holds record view state; every read and write tolerates storage being unavailable
import { useEffect, useState } from 'react'
import type {
  ColumnFiltersState,
  ColumnOrderState,
  ColumnSizingState,
  SortingState,
  ColumnVisibilityState,
} from '@tanstack/react-table'
import type { AggregateOp } from './aggregate'

export type RecordViewState = {
  sorting: SortingState
  columnFilters: ColumnFiltersState
  columnOrder: ColumnOrderState
  columnSizing: ColumnSizingState
  columnVisibility: ColumnVisibilityState
  aggregates: Record<string, AggregateOp>
}

const STORAGE_PREFIX = 'theorem.records.view:'

function read(key: string): Partial<RecordViewState> | undefined {
  try {
    const raw = window.localStorage.getItem(STORAGE_PREFIX + key)
    return raw ? (JSON.parse(raw) as Partial<RecordViewState>) : undefined
  } catch {
    return undefined
  }
}

/** The arrangement for `key`, starting from `initial` for anything not saved. */
export function useRecordViewState(
  key: string,
  initial: () => RecordViewState,
) {
  const [state, setState] = useState<RecordViewState>(() => ({
    ...initial(),
    ...read(key),
  }))
  const [heldKey, setHeldKey] = useState(key)
  if (heldKey !== key) {
    setHeldKey(key)
    setState({ ...initial(), ...read(key) })
  }
  useEffect(() => {
    try {
      window.localStorage.setItem(STORAGE_PREFIX + key, JSON.stringify(state))
    } catch {
      // A private window or full storage keeps the arrangement for this visit only.
    }
  }, [key, state])
  const reset = () => {
    try {
      window.localStorage.removeItem(STORAGE_PREFIX + key)
    } catch {
      // Nothing saved to remove.
    }
    setState(initial())
  }
  return [state, setState, reset] as const
}
