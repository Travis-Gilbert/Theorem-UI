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
  /**
   * The block that made the selection, when the selection alone can't say:
   * rows of two tables can share an id. It stays here; the host never sees it.
   */
  owner: string | undefined
  select: (selection: AppSelection | undefined, owner?: string) => void
}

export const SelectionContext = createContext<SelectionState>({
  selected: undefined,
  owner: undefined,
  select: () => undefined,
})

export const useSelection = () => useContext(SelectionContext)
