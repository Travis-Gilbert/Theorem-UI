// SOURCING: zustand + zustand/middleware persist (the person's response defaults and per-conversation overrides, kept as lib/theorem/models keeps the picked models), zod (the generation object a server may return)
import { z } from 'zod'
import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export const RESPONSE_DETAILS = ['concise', 'balanced', 'thorough'] as const
export type ResponseDetail = (typeof RESPONSE_DETAILS)[number]

const EFFORT_NAMES: Readonly<Record<string, string>> = {
  low: 'Low',
  medium: 'Medium',
  high: 'High',
  xhigh: 'Extra high',
  max: 'Max',
}

/** Every level Theorem takes, lowest first, for a choice that is not tied to one model. */
export const EFFORT_LEVELS = Object.keys(EFFORT_NAMES)

export const effortLabel = (level: string) =>
  EFFORT_NAMES[level] ?? level.charAt(0).toUpperCase() + level.slice(1)

const positive = z.number().int().positive().optional()

const generationSchema = z.object({
  responseDetail: z.enum(RESPONSE_DETAILS).optional(),
  effort: z.string().min(1).optional(),
  maxOutputTokens: positive,
  runBudget: z.object({ maxOutputTokens: positive, maxSteps: positive }).optional(),
})

/**
 * How long and how deep a response may be. Every field is optional and an
 * unset one is left to Theorem. The same shape is the account default
 * (`generation` in the account's preferences) and a conversation's override.
 */
export type Generation = z.infer<typeof generationSchema>

/** Generation read from a server that may not know the field, or may send something else. */
export const readGeneration = (value: unknown): Generation | undefined =>
  generationSchema.safeParse(value).data

const defined = <T extends object>(value: T): T =>
  Object.fromEntries(Object.entries(value).filter(([, field]) => (field as unknown) !== undefined)) as T

/** `generation` without the fields that say nothing: unset values, and an empty run budget. */
export function pruned(generation: Generation): Generation {
  const { runBudget, ...rest } = generation
  const budget = defined(runBudget ?? {})
  return { ...defined(rest), ...(Object.keys(budget).length ? { runBudget: budget } : {}) }
}

/** A conversation's override over the account's defaults, field by field, the run budget included. */
export const composed = (defaults: Generation, override: Generation = {}): Generation =>
  pruned({
    ...pruned(defaults),
    ...pruned(override),
    runBudget: { ...defaults.runBudget, ...pruned(override).runBudget },
  })

/** A change to a generation: a field set to `undefined` is cleared. */
export type GenerationChange = {
  [K in keyof Generation]?: Generation[K] | undefined
}

const changed = (generation: Generation, change: GenerationChange) => pruned({ ...generation, ...change })

type DefaultsState = {
  defaults: Generation
  /**
   * Whether the account's preferences hold the defaults: true once Theorem
   * has taken or returned them, false when it refused the field and they are
   * kept on this browser only. Unknown until a save settles.
   */
  onServer: boolean | undefined
  /**
   * The exact defaults Theorem was confirmed to hold. A change made since
   * that confirmation keeps riding along with the turns until a save
   * confirms the new value, so a turn never runs on limits the account no
   * longer has.
   */
  saved: Generation | undefined
  change: (change: GenerationChange) => void
}

/** The account defaults. Kept in step with Theorem's preferences by `usePreferencesSync`. */
export const useGenerationDefaults = create<DefaultsState>()(
  persist(
    (set) => ({
      defaults: {},
      onServer: undefined,
      saved: undefined,
      change: (change) => set(({ defaults }) => ({ defaults: changed(defaults, change) })),
    }),
    { name: 'theorem-ui:generation-defaults', partialize: ({ defaults }) => ({ defaults }) },
  ),
)

/** The key of a conversation that is not a thread yet; its first send moves the override onto the new thread. */
export const DRAFT = ''

type OverridesState = {
  byThread: Readonly<Record<string, Generation>>
  /**
   * The threads whose override changed here since Theorem last held it. Until
   * a thread's override is saved onto it, its turns carry the override
   * themselves, and Theorem's copy does not replace the one here.
   */
  unsaved: Readonly<Record<string, true>>
  change: (thread: string, change: GenerationChange) => void
  reset: (thread: string) => void
  /** A new conversation's draft override becomes its thread's, once the thread exists. */
  adopt: (thread: string) => void
  /** Theorem's copy of a thread's override, taken unless a change here is waiting to be saved. */
  take: (thread: string, generation: Generation | undefined) => void
  /** Theorem holds `saved` for the thread; a change made since stays waiting. */
  markSaved: (thread: string, saved: Generation) => void
}

const without = <T>(map: Readonly<Record<string, T>>, key: string) => {
  const { [key]: _dropped, ...rest } = map
  return rest
}

const withOverride = (
  byThread: Readonly<Record<string, Generation>>,
  thread: string,
  next: Generation,
) => (Object.keys(next).length ? { ...without(byThread, thread), [thread]: next } : without(byThread, thread))

const same = (a: Generation = {}, b: Generation = {}) =>
  JSON.stringify(composed(a)) === JSON.stringify(composed(b))

/**
 * The per-conversation overrides, keyed by the thread's id, or `DRAFT` before
 * there is one. A thread's override is kept on the thread in Theorem (its
 * `generation`), so Theorem names it as the conversation's and it follows the
 * person; this store is the copy the composer edits, written back before the
 * next send.
 */
export const useGenerationOverrides = create<OverridesState>()(
  persist(
    (set) => ({
      byThread: {},
      unsaved: {},
      change: (thread, change) =>
        set(({ byThread, unsaved }) => ({
          byThread: withOverride(byThread, thread, changed(byThread[thread] ?? {}, change)),
          unsaved: { ...unsaved, [thread]: true },
        })),
      reset: (thread) =>
        set(({ byThread, unsaved }) => ({
          byThread: without(byThread, thread),
          unsaved: { ...unsaved, [thread]: true },
        })),
      adopt: (thread) =>
        set(({ byThread, unsaved }) => {
          const draft = byThread[DRAFT]
          if (!draft) return {}
          return {
            byThread: { ...without(byThread, DRAFT), [thread]: draft },
            unsaved: { ...without(unsaved, DRAFT), [thread]: true },
          }
        }),
      take: (thread, generation) =>
        set(({ byThread, unsaved }) =>
          unsaved[thread] || same(byThread[thread], generation)
            ? {}
            : { byThread: withOverride(byThread, thread, pruned(generation ?? {})) },
        ),
      markSaved: (thread, saved) =>
        set(({ byThread, unsaved }) =>
          same(byThread[thread], saved) ? { unsaved: without(unsaved, thread) } : {},
        ),
    }),
    {
      name: 'theorem-ui:generation',
      version: 1,
      partialize: ({ byThread, unsaved }) => ({ byThread, unsaved }),
      // Overrides kept before threads held them have never been saved onto one.
      migrate: (stored) => {
        const byThread = (stored as { byThread?: Record<string, Generation> } | undefined)?.byThread ?? {}
        return {
          byThread,
          unsaved: Object.fromEntries(Object.keys(byThread).map((thread) => [thread, true as const])),
        }
      },
    },
  ),
)

/**
 * The reasoning effort a send from this conversation asks for: its own, else
 * the account's. Undefined leaves the level to the model.
 */
export function requestedEffort(thread: string = DRAFT) {
  return (
    useGenerationOverrides.getState().byThread[thread]?.effort ??
    useGenerationDefaults.getState().defaults.effort
  )
}

/**
 * Turn options for a send, retry or edit in `thread`: whatever Theorem does
 * not already hold. The account defaults go along until the account's
 * preferences are confirmed to hold exactly them — a change made since the
 * last confirmation rides with the turns while its save is on its way — and
 * the conversation's override only until its thread does, so that Theorem
 * can say where each limit came from. What a turn carries replaces what the
 * thread holds, so a turn that carries the defaults carries the override
 * along with them, composed over them, even one its thread already holds:
 * unsaved account limits must not replace the conversation's own caps. Read
 * at send time, as the model pick is.
 */
export function generationTurnOptions(thread: string = DRAFT): Generation {
  const { defaults, onServer, saved } = useGenerationDefaults.getState()
  const { byThread, unsaved } = useGenerationOverrides.getState()
  const held = onServer === true && same(defaults, saved)
  const riding = !held && Object.keys(pruned(defaults)).length > 0
  return composed(
    held ? {} : defaults,
    unsaved[thread] || riding ? byThread[thread] : undefined,
  )
}
