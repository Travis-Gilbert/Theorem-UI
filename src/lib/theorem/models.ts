// SOURCING: zustand + zustand/middleware persist (the person's starred and picked models, as lib/palette keeps the palette), @tanstack/react-query (the model list Theorem serves at /api/chat/v1/models, OpenRouter's fields passed through)
import { queryOptions, useQuery, useQueryClient } from '@tanstack/react-query'
import type { QueryClient } from '@tanstack/react-query'
import { useEffect, useRef } from 'react'
import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { describeError, mutate } from './client'
import type { Theorem } from './client'
import { isNotServed, theoremJson } from './passthrough'

/**
 * One model the person can pick. `ref` is Theorem's catalog reference,
 * `<provider>/<model>`, e.g. `openrouter/anthropic/claude-sonnet-4.5`; the
 * provider is everything before the first slash.
 */
export type ModelOption = {
  ref: string
  name: string
  /** The model's maker, from the model id's first segment (`anthropic`). */
  vendor: string
  description?: string
  contextLength?: number
  /** US dollars per million tokens. */
  promptPrice?: number
  completionPrice?: number
  /** A row of Theorem's own catalog, or a model from OpenRouter's live list. */
  source: 'catalog' | 'openrouter'
  /** What a turn can send it: text, image, file, audio. */
  inputs: readonly string[]
  /** Provider-native tool calling; Theorem can also execute program-based tools. */
  tools: boolean
  /** It can think before answering. */
  reasoning: boolean
  /**
   * The reasoning effort levels a turn can ask this model for, as Theorem
   * lists them: only the levels its provider route sends. Empty when it takes
   * none.
   */
  effortLevels: readonly string[]
  /** The level Theorem's catalog names as the model's own default. */
  effortDefault?: string
  /** The most tokens one reply can hold. */
  maxOutput?: number
  /** When OpenRouter added it. */
  addedAtMs?: number
  /** The date OpenRouter retires it, when one is set. */
  expiresOn?: string
}

const PER_MILLION = 1_000_000

/** A price per token as OpenRouter writes it ("0.000003"), in dollars per million tokens. */
function perMillion(value: unknown): number | undefined {
  const n = typeof value === 'string' || typeof value === 'number' ? Number(value) : NaN
  return Number.isFinite(n) && n >= 0 ? Math.round(n * PER_MILLION * 1e6) / 1e6 : undefined
}

const record = (value: unknown): Record<string, unknown> | undefined =>
  value && typeof value === 'object' ? (value as Record<string, unknown>) : undefined

const strings = (value: unknown): string[] =>
  Array.isArray(value) ? value.filter((v): v is string => typeof v === 'string') : []

/**
 * One catalog entry as Theorem serves it, which passes OpenRouter's model
 * fields through (`id`, `name`, `context_length`, `pricing`). An entry that
 * already carries Theorem's `ref` keeps it; a bare OpenRouter id is an
 * OpenRouter model. Anything without an id is dropped.
 */
export function parseModelEntry(raw: unknown): ModelOption | undefined {
  const entry = record(raw)
  const ref =
    typeof entry?.ref === 'string'
      ? entry.ref
      : typeof entry?.id === 'string'
        ? `openrouter/${entry.id}`
        : undefined
  if (!entry || !ref) return undefined
  const model = resolvedModel(ref).model
  const pricing = record(entry.pricing)
  const architecture = record(entry.architecture)
  const topProvider = record(entry.top_provider)
  const parameters = strings(entry.supported_parameters)
  const name = typeof entry.name === 'string' ? entry.name : model
  const option: ModelOption = {
    ref,
    // OpenRouter prefixes names with the maker ("Anthropic: Claude"); the vendor mark says that already.
    name: name.replace(/^[^:]+:\s*/, ''),
    vendor: model.split('/')[0] ?? '',
    source: entry.source === 'catalog' ? 'catalog' : 'openrouter',
    inputs: strings(architecture?.input_modalities),
    tools: parameters.includes('tools'),
    reasoning: parameters.includes('reasoning'),
    effortLevels: strings(entry.effort_levels),
  }
  if (typeof entry.effort_default === 'string') option.effortDefault = entry.effort_default
  const maxOutput = topProvider?.max_completion_tokens
  if (typeof maxOutput === 'number') option.maxOutput = maxOutput
  if (typeof entry.created === 'number') option.addedAtMs = entry.created * 1000
  if (typeof entry.expiration_date === 'string') option.expiresOn = entry.expiration_date
  if (typeof entry.description === 'string') option.description = entry.description
  if (typeof entry.context_length === 'number') option.contextLength = entry.context_length
  const prompt = perMillion(pricing?.prompt)
  const completion = perMillion(pricing?.completion)
  if (prompt !== undefined) option.promptPrice = prompt
  if (completion !== undefined) option.completionPrice = completion
  return option
}

/** An option for a ref the list does not carry (yet): starred earlier, or Theorem's default. */
export function modelStub(ref: string, name?: string): ModelOption {
  const model = ref ? resolvedModel(ref).model : ''
  return {
    ref,
    name: name ?? (model.split('/').at(-1) || ref),
    vendor: model.split('/')[0] ?? '',
    source: 'catalog',
    inputs: [],
    tools: false,
    reasoning: false,
    effortLevels: [],
  }
}

export type ModelList = {
  /** What an unpinned turn runs on; absent when Theorem does not say. */
  defaultRef?: string
  defaultError?: { code: string; message: string }
  models: ModelOption[]
  /** Whether OpenRouter's list is fresh, served from Theorem's cache, or missing. */
  openrouter: 'live' | 'cached' | 'unavailable'
}

function parseDefaultError(raw: unknown): ModelList['defaultError'] {
  const error = record(raw)
  if (typeof error?.code !== 'string' || typeof error.message !== 'string') return undefined
  return { code: error.code, message: error.message }
}

/** Shared feedback for the settings, picker and command palette. */
export function modelCatalogIssue(list: ModelList | undefined, error: unknown): string | undefined {
  if (error) return `Could not load models. ${describeError(error)} Check AI settings and retry the model list.`
  const failure = list?.defaultError
  if (failure) return `${failure.message} Choose an available model or correct the default in Theorem's configuration.`
  return undefined
}

export function defaultModelDescription(catalog: readonly ModelOption[], ref?: string): string {
  if (!ref) return 'Theorem has not reported its configured default model.'
  const name = catalog.find((model) => model.ref === ref)?.name
  return name ? `${name} (${ref})` : ref
}

function parseModelOptions(raw: unknown): ModelOption[] {
  return (Array.isArray(raw) ? raw : []).flatMap((entry) => {
    const option = parseModelEntry(entry)
    return option ? [option] : []
  })
}

/** The body of `GET /api/chat/v1/models`, parsed once where it enters. */
export function parseModelList(raw: unknown): ModelList {
  const body = record(raw) ?? {}
  const status = record(body.openrouter)?.status
  const list: ModelList = {
    models: parseModelOptions(body.models),
    openrouter: status === 'live' || status === 'cached' ? status : 'unavailable',
  }
  if (typeof body.defaultRef === 'string') list.defaultRef = body.defaultRef
  const defaultError = parseDefaultError(body.defaultError)
  if (defaultError) list.defaultError = defaultError
  return list
}

export const modelListQuery = queryOptions({
  queryKey: ['theorem', 'models'],
  queryFn: async () => parseModelList(await theoremJson('/api/chat/v1/models')),
  // Theorem caches OpenRouter's list for an hour; a few minutes here is plenty.
  staleTime: 5 * 60_000,
  retry: (count, error) => !isNotServed(error) && count < 2,
})

/** Every model Theorem can run, with its default. */
export function useModelCatalog() {
  const query = useQuery(modelListQuery)
  return { ...query, data: query.data?.models, list: query.data }
}

/** A context window as the picker shows it: 200K, 1M. */
export function formatContext(tokens: number): string {
  return tokens >= PER_MILLION
    ? `${Math.round(tokens / PER_MILLION)}M`
    : `${Math.round(tokens / 1000)}K`
}

const dollars = (n: number) =>
  `$${n >= 1 ? (Number.isInteger(n) ? n : n.toFixed(2)) : n.toPrecision(2)}`

/** Input and output price per million tokens, or Free, or undefined when unknown. */
export function formatPrice({
  promptPrice,
  completionPrice,
}: Pick<ModelOption, 'promptPrice' | 'completionPrice'>): string | undefined {
  if (promptPrice === undefined || completionPrice === undefined) return undefined
  if (promptPrice === 0 && completionPrice === 0) return 'Free'
  return `${dollars(promptPrice)} / ${dollars(completionPrice)} per M`
}

/** Theorem's catalog reference split into the shape a send carries. */
export function resolvedModel(ref: string): Theorem.ResolvedModel {
  const slash = ref.indexOf('/')
  return { provider: ref.slice(0, slash), model: ref.slice(slash + 1) }
}

type PickedModelsState = {
  /** Models shown in the composer's picker, in the order they were starred. */
  starred: readonly string[]
  /** The model the next turn runs on; undefined leaves it to Theorem's default. */
  selected: string | undefined
  setStarred: (refs: readonly string[]) => void
  toggleStar: (ref: string) => void
  select: (ref: string | undefined) => void
}

export const usePickedModels = create<PickedModelsState>()(
  persist(
    (set) => ({
      starred: [],
      selected: undefined,
      setStarred: (starred) => set({ starred }),
      toggleStar: (ref) =>
        set(({ starred }) => ({
          starred: starred.includes(ref)
            ? starred.filter((r) => r !== ref)
            : [...starred, ref],
        })),
      select: (selected) => set({ selected }),
    }),
    {
      name: 'theorem-ui:models',
      partialize: ({ starred, selected }) => ({ starred, selected }),
    },
  ),
)

type ModelEffortState = {
  /**
   * The effort level the person chose, per model ref; the empty ref is
   * Theorem's default model. A model without an entry runs at its own default.
   */
  byModel: Readonly<Record<string, string>>
  choose: (ref: string, level: string | undefined) => void
}

export const useModelEffort = create<ModelEffortState>()(
  persist(
    (set) => ({
      byModel: {},
      choose: (ref, level) =>
        set(({ byModel }) => {
          const { [ref]: _previous, ...rest } = byModel
          return { byModel: level ? { ...rest, [ref]: level } : rest }
        }),
    }),
    {
      name: 'theorem-ui:effort',
      partialize: ({ byModel }) => ({ byModel }),
    },
  ),
)

/** The picked model as a send carries it; undefined leaves it to Theorem's default. */
export function pickedModel(): Theorem.ResolvedModel | undefined {
  const ref = usePickedModels.getState().selected
  return ref ? resolvedModel(ref) : undefined
}

/**
 * The level chosen for the model the next turn runs on, when `catalog` lists
 * it for that model. Theorem refuses a level the model's route does not send,
 * so until the model list has loaded no level goes out.
 */
export function sendableEffort(catalog: ModelList | undefined): string | undefined {
  const selected = usePickedModels.getState().selected
  const level = useModelEffort.getState().byModel[selected ?? '']
  const ref = selected ?? catalog?.defaultRef
  const model = ref ? catalog?.models.find((option) => option.ref === ref) : undefined
  return level && model?.effortLevels.includes(level) ? level : undefined
}

/**
 * Turn options that carry the picked model and its effort level. The SDK's
 * chat adapter spreads its turn options into every send, retry and edit, so
 * the getters read the pick at send time and a thread's adapter never needs
 * rebuilding. The level is checked then against the model list in
 * `queryClient`'s cache; without a client no level goes out.
 */
export const modelTurnOptions = (queryClient: QueryClient | undefined) => ({
  get model(): Theorem.ResolvedModel | undefined {
    return pickedModel()
  },
  get effort(): string | undefined {
    return sendableEffort(queryClient?.getQueryData(modelListQuery.queryKey))
  },
})

type Preferences = {
  starredModels: string[]
  defaultModel: string | null
  revision: number
}

const preferencesKey = ['theorem', 'preferences'] as const

/**
 * Keeps the starred and picked models in step with the person's Theorem
 * preferences, so they follow the person across browsers. Theorem's copy wins
 * when it loads; after that each local change is written back with If-Match.
 * Where Theorem does not serve preferences, the local store stands alone.
 */
export function usePreferencesSync() {
  const { data } = useQuery({
    queryKey: preferencesKey,
    queryFn: () => theoremJson<Preferences>('/api/chat/v1/preferences'),
    staleTime: Infinity,
    retry: false,
  })
  const queryClient = useQueryClient()
  const revision = useRef<number | undefined>(undefined)

  useEffect(() => {
    if (!data) return
    revision.current = data.revision
    usePickedModels.setState({
      starred: data.starredModels,
      selected: data.defaultModel ?? undefined,
    })
  }, [data])

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined
    const unsubscribe = usePickedModels.subscribe((state, previous) => {
      if (revision.current === undefined) return
      if (state.starred === previous.starred && state.selected === previous.selected) return
      clearTimeout(timer)
      timer = setTimeout(() => {
        const { starred, selected } = usePickedModels.getState()
        void mutate((headers) =>
          theoremJson<Preferences>('/api/chat/v1/preferences', {
            method: 'PUT',
            headers: { ...headers, 'If-Match': String(revision.current) },
            body: { starredModels: starred, defaultModel: selected ?? null },
          }),
        ).then(
          (saved) => {
            revision.current = saved.revision
          },
          // A stale revision means another browser wrote first: take its copy.
          () => void queryClient.invalidateQueries({ queryKey: preferencesKey }),
        )
      }, 400)
    })
    return () => {
      clearTimeout(timer)
      unsubscribe()
    }
  }, [queryClient])
}

/** Mount once per layout to run the preferences sync. */
export function PreferencesSync() {
  usePreferencesSync()
  return null
}
