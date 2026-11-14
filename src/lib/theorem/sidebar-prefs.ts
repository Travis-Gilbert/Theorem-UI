// SOURCING: zustand + zustand/middleware persist (per-browser preferences, as components/shell/shell-state keeps the rest). The pin and session-type model is docs/plans/projects-sidebar-and-session-graph.md §5.2 and §5.4.
//
// Two sidebar preferences that change nothing in Theorem:
//
// - Pins: references to sessions and projects the person keeps at the top of
//   the sidebar, in their own order. A pin is not `Membership.pinned`, which
//   protects a thread's project placement from the Librarian. Pinning changes
//   no membership, ancestry, task, context or permission.
// - Session types: a stable label and mark per session, chosen by the person.
//   Nothing is guessed from a reply or an artifact; an unset session is a
//   Conversation. A type is appearance only: it grants no capability and
//   starts no run.
//
// Theorem has no per-user preference route for either yet, so both live in
// this browser. When it serves one, this store becomes its cache.
import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export type PinKind = 'thread' | 'project'
export type Pin = { kind: PinKind; id: string }

/** The marks a session type can wear. Each maps to one drawn icon in components/organize/glyphs. */
export const TYPE_MARKS = [
  'document',
  'terminal-file',
  'checklist-file',
  'code-file',
  'cog-file',
  'chat',
  'graph',
  'research',
] as const
export type TypeMark = (typeof TYPE_MARKS)[number]

export type SessionType = {
  id: string
  label: string
  mark: TypeMark
  /** One sentence on what the type is for, shown where it is chosen. */
  description?: string
  builtIn: boolean
}

export const DEFAULT_SESSION_TYPE = 'conversation'

export const BUILT_IN_TYPES: readonly SessionType[] = [
  {
    id: 'conversation',
    label: 'Conversation',
    mark: 'document',
    description: 'A general session.',
    builtIn: true,
  },
  {
    id: 'coding',
    label: 'Coding',
    mark: 'terminal-file',
    description: 'Work on code in a repository.',
    builtIn: true,
  },
  {
    id: 'agent-task',
    label: 'Agent task',
    mark: 'checklist-file',
    description:
      'Work the life agent carries out. Naming it so grants nothing.',
    builtIn: true,
  },
]

/** Pins with this one added at the end, or removed when it is already there. */
export function togglePin(pins: readonly Pin[], pin: Pin): Pin[] {
  return isPinned(pins, pin)
    ? pins.filter((p) => !(p.kind === pin.kind && p.id === pin.id))
    : [...pins, pin]
}

export const isPinned = (pins: readonly Pin[], pin: Pin) =>
  pins.some((p) => p.kind === pin.kind && p.id === pin.id)

/** Pins with the one at `from` moved to `to`; out-of-range moves change nothing. */
export function movePin(pins: readonly Pin[], from: number, to: number): Pin[] {
  if (
    from === to ||
    from < 0 ||
    to < 0 ||
    from >= pins.length ||
    to >= pins.length
  )
    return [...pins]
  const next = [...pins]
  const [moved] = next.splice(from, 1)
  next.splice(to, 0, moved!)
  return next
}

/** Every type the person can pick: the built-ins, then their own in the order made. */
export const allTypes = (custom: readonly SessionType[]) => [
  ...BUILT_IN_TYPES,
  ...custom,
]

/** The type a session wears: its chosen one while that type exists, else Conversation. */
export function typeOf(
  threadId: string,
  chosen: Readonly<Record<string, string>>,
  custom: readonly SessionType[],
): SessionType {
  const id = chosen[threadId]
  return allTypes(custom).find((type) => type.id === id) ?? BUILT_IN_TYPES[0]!
}

/** A new type's id: its label as a slug, made unique among the existing ones. */
export function typeId(label: string, existing: readonly SessionType[]) {
  const base =
    label
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '') || 'type'
  const taken = new Set(existing.map((type) => type.id))
  let id = base
  for (let n = 2; taken.has(id); n++) id = `${base}-${n}`
  return id
}

type SidebarPrefs = {
  pins: readonly Pin[]
  /** Session id → type id, only for sessions whose type the person chose. */
  sessionTypes: Readonly<Record<string, string>>
  customTypes: readonly SessionType[]
  togglePin: (pin: Pin) => void
  movePin: (from: number, to: number) => void
  /** Drops pins whose session or project no longer exists, once the organization says so. */
  prunePins: (exists: (pin: Pin) => boolean) => void
  setSessionType: (threadId: string, typeId: string) => void
  addType: (type: {
    label: string
    mark: TypeMark
    description?: string
  }) => string
  updateType: (id: string, change: { label?: string; mark?: TypeMark }) => void
  removeType: (id: string) => void
}

export const useSidebarPrefs = create<SidebarPrefs>()(
  persist(
    (set, get) => ({
      pins: [],
      sessionTypes: {},
      customTypes: [],
      togglePin: (pin) => set((s) => ({ pins: togglePin(s.pins, pin) })),
      movePin: (from, to) => set((s) => ({ pins: movePin(s.pins, from, to) })),
      prunePins: (exists) =>
        set((s) => {
          const pins = s.pins.filter(exists)
          return pins.length === s.pins.length ? s : { pins }
        }),
      setSessionType: (threadId, id) =>
        set((s) => {
          const { [threadId]: _, ...rest } = s.sessionTypes
          return {
            sessionTypes:
              id === DEFAULT_SESSION_TYPE ? rest : { ...rest, [threadId]: id },
          }
        }),
      addType: ({ label, mark, description }) => {
        const id = typeId(label, allTypes(get().customTypes))
        set((s) => ({
          customTypes: [
            ...s.customTypes,
            { id, label: label.trim(), mark, description, builtIn: false },
          ],
        }))
        return id
      },
      updateType: (id, change) =>
        set((s) => ({
          customTypes: s.customTypes.map((type) =>
            type.id === id ? { ...type, ...change } : type,
          ),
        })),
      removeType: (id) =>
        set((s) => ({
          customTypes: s.customTypes.filter((type) => type.id !== id),
          sessionTypes: Object.fromEntries(
            Object.entries(s.sessionTypes).filter(([, t]) => t !== id),
          ),
        })),
    }),
    {
      name: 'theorem-sidebar-prefs',
      version: 1,
      partialize: ({ pins, sessionTypes, customTypes }) => ({
        pins,
        sessionTypes,
        customTypes,
      }),
    },
  ),
)

/** The type one session wears, kept current as the person changes it. */
export function useSessionType(threadId: string) {
  const chosen = useSidebarPrefs((s) => s.sessionTypes)
  const custom = useSidebarPrefs((s) => s.customTypes)
  return typeOf(threadId, chosen, custom)
}
