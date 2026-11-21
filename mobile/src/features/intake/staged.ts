// SOURCING: none
//
// Items another screen of the app hands to intake (a still from screen
// sharing). They are taken once, when intake opens.
import type { IntakeItem } from './model'

let staged: IntakeItem[] = []

export const stage = (items: IntakeItem[]) => {
  staged = [...staged, ...items]
}

/** Removes a batch that was staged but never taken (a failed hand-off), so a retry stages it once, not twice. */
export const unstage = (items: IntakeItem[]) => {
  const ids = new Set(items.map((item) => item.id))
  staged = staged.filter((item) => !ids.has(item.id))
}

export function takeStaged(): IntakeItem[] {
  const items = staged
  staged = []
  return items
}
