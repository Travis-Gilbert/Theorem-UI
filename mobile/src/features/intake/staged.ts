// SOURCING: none
//
// Items another screen of the app hands to intake (a still from screen
// sharing). They are taken once, when intake opens.
import type { IntakeItem } from './model'

let staged: IntakeItem[] = []

export const stage = (items: IntakeItem[]) => {
  staged = [...staged, ...items]
}

export function takeStaged(): IntakeItem[] {
  const items = staged
  staged = []
  return items
}
