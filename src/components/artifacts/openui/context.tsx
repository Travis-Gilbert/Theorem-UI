// SOURCING: React context. What one rendered program shares across its
// components: the order subjects take tones in, and the current selection.
import { createContext, useContext } from 'react'
import type { AppSelection } from '@/lib/blocks/sandbox/protocol'
import { toneOf } from './palette'

export const SubjectsContext = createContext<readonly string[]>([])

/** The tone a subject takes in this artifact. */
export function useTone(subject?: string | null) {
  return toneOf(useContext(SubjectsContext), subject)
}

export type SelectionState = {
  selected: AppSelection | undefined
  select: (selection: AppSelection | undefined) => void
}

export const SelectionContext = createContext<SelectionState>({
  selected: undefined,
  select: () => undefined,
})

export const useSelection = () => useContext(SelectionContext)
