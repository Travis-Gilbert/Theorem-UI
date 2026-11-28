// SOURCING: zustand + its persist middleware (already the shell's store for per-device choices) for which classes the sidebar pins, hides and in what order; the classes themselves stay in the schema register (classes.ts)
import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { ClassRegistry, ObjectClass } from './classes'

type ClassPrefs = {
  /** Class ids in the order the sidebar lists them; a class not here sorts after, by name. */
  order: string[]
  /** Classes kept out of the sidebar's Object types; they stay declared and reachable from Manage classes. */
  hidden: string[]
  /** Classes in the sidebar's Pinned group. Undefined until the person pins or unpins one. */
  pinned?: string[]
  setOrder: (order: string[]) => void
  toggleHidden: (id: string) => void
  setPinned: (pinned: string[]) => void
}

export const useClassPrefs = create<ClassPrefs>()(
  persist(
    (set) => ({
      order: [],
      hidden: [],
      pinned: undefined,
      setOrder: (order) => set({ order }),
      toggleHidden: (id) =>
        set((state) => ({
          hidden: state.hidden.includes(id)
            ? state.hidden.filter((x) => x !== id)
            : [...state.hidden, id],
        })),
      setPinned: (pinned) => set({ pinned }),
    }),
    { name: 'theorem-ui:notes-classes' },
  ),
)

/** The person's order over the registry's browsable classes. */
export function orderedClasses(
  registry: ClassRegistry,
  order: readonly string[],
): ObjectClass[] {
  const rank = new Map(order.map((id, index) => [id, index]))
  return [...registry.workspace].sort((a, b) => {
    const ra = rank.get(a.id) ?? Number.POSITIVE_INFINITY
    const rb = rank.get(b.id) ?? Number.POSITIVE_INFINITY
    return ra === rb ? a.plural.localeCompare(b.plural) : ra - rb
  })
}

/** Pinned classes: the person's, or the standard library's document classes until they choose. */
export function pinnedClasses(
  registry: ClassRegistry,
  pinned: readonly string[] | undefined,
): ObjectClass[] {
  if (pinned)
    return pinned
      .map((id) => registry.byId.get(id))
      .filter((cls): cls is ObjectClass => !!cls && !cls.retired)
  return (['page', 'app', 'notebook'] as const)
    .map((key) => registry.native[key])
    .filter((cls): cls is ObjectClass => !!cls)
}

/** Move `id` one place up or down in the visible order. */
export function nudged(
  classes: ObjectClass[],
  id: string,
  by: -1 | 1,
): string[] {
  const ids = classes.map((cls) => cls.id)
  const at = ids.indexOf(id)
  const to = at + by
  if (at < 0 || to < 0 || to >= ids.length) return ids
  ;[ids[at], ids[to]] = [ids[to]!, ids[at]!]
  return ids
}
