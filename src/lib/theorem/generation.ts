// SOURCING: zustand + zustand/middleware persist (the person's response defaults and per-conversation overrides, kept as lib/theorem/models keeps the picked models), zod (the generation object a server may return)
import { z } from 'zod'
import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export const RESPONSE_DETAILS = ['concise', 'balanced', 'thorough'] as const
export type ResponseDetail = (typeof RESPONSE_DETAILS)[number]

const EFFORT_NAMES: Readonly<Record<string, string>> = {
  minimal: 'Minimal',
  low: 'Low',
  medium: 'Medium',
  high: 'High',
  xhigh: 'Extra high',
  max: 'Max',
}

/** Every level a model may list, lowest first, for a choice that is not tied to one model. */
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
  change: (change: GenerationChange) => void
}

/** The account defaults. Kept in step with Theorem's preferences by `usePreferencesSync`. */
export const useGenerationDefaults = create<DefaultsState>()(
  persist(
    (set) => ({
      defaults: {},
      onServer: undefined,
      change: (change) => set(({ defaults }) => ({ defaults: changed(defaults, change) })),
    }),
    { name: 'theorem-ui:generation-defaults', partialize: ({ defaults }) => ({ defaults }) },
  ),
)

/** The key of a conversation that is not a thread yet; its first send moves the override onto the new thread. */
export const DRAFT = ''

type OverridesState = {
  byThread: Readonly<Record<string, Generation>>
  change: (thread: string, change: GenerationChange) => void
  reset: (thread: string) => void
  /** A new conversation's draft override becomes its thread's, once the thread exists. */
  adopt: (thread: string) => void
}

/**
 * The per-conversation overrides, keyed by the thread's id, or `DRAFT` before
 * there is one. This is the only place an override lives, so a server-stored
 * override replaces `byThread` and nothing else.
 */
export const useGenerationOverrides = create<OverridesState>()(
  persist(
    (set) => ({
      byThread: {},
      change: (thread, change) =>
        set(({ byThread }) => {
          const next = changed(byThread[thread] ?? {}, change)
          const { [thread]: _previous, ...rest } = byThread
          return { byThread: Object.keys(next).length ? { ...rest, [thread]: next } : rest }
        }),
      reset: (thread) =>
        set(({ byThread }) => {
          const { [thread]: _previous, ...rest } = byThread
          return { byThread: rest }
        }),
      adopt: (thread) =>
        set(({ byThread }) => {
          const { [DRAFT]: draft, ...rest } = byThread
          return draft ? { byThread: { ...rest, [thread]: draft } } : {}
        }),
    }),
    { name: 'theorem-ui:generation', partialize: ({ byThread }) => ({ byThread }) },
  ),
)

/**
 * Turn options for a send, retry or edit in `thread`: the account defaults
 * under the conversation's override, with only the fields that are set. Read
 * at send time, as the model pick is.
 */
export const generationTurnOptions = (thread: string = DRAFT): Generation =>
  composed(useGenerationDefaults.getState().defaults, useGenerationOverrides.getState().byThread[thread])
