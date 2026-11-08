// SOURCING: zustand + zustand/middleware persist (the person's starred and picked models, as lib/palette keeps the palette), @tanstack/react-query (the model list Theorem serves at /api/chat/v1/models, OpenRouter's fields passed through)
import { queryOptions, useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useRef } from 'react'
import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { mutate } from './client'
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
  /** The connection Theorem reaches it through (`openrouter`, `anthropic`, `custom:...`). */
  connection: string
  /** A language model writes text; a decision model answers typed questions with probabilities. */
  kind: 'language' | 'decision'
  /** What a turn can send it: text, image, file, audio. */
  inputs: readonly string[]
  /** It can call tools, which Theorem's turns lean on. */
  tools: boolean
  /** It can think before answering. */
  reasoning: boolean
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
  const { provider, model } = resolvedModel(ref)
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
    connection: typeof entry.connection === 'string' ? entry.connection : provider,
    // OpenRouter marks decision models by their output modality.
    kind:
      entry.kind === 'decision' || strings(architecture?.output_modalities).includes('decisions')
        ? 'decision'
        : 'language',
    inputs: strings(architecture?.input_modalities),
    tools: parameters.includes('tools'),
    reasoning: parameters.includes('reasoning'),
  }
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
  const { provider, model } = ref ? resolvedModel(ref) : { provider: '', model: '' }
  return {
    ref,
    name: name ?? (model.split('/').at(-1) || ref),
    vendor: model.split('/')[0] ?? '',
    source: 'catalog',
    connection: provider,
    kind: 'language',
    inputs: [],
    tools: false,
    reasoning: false,
  }
}

export type ModelList = {
  /** What an unpinned turn runs on (the chat role's model); absent when Theorem does not say. */
  defaultRef?: string
  /** Language models: the ones a turn, the picker and the agent can run on. */
  models: ModelOption[]
  /** Decision models, which only the decision role binds. */
  decisionModels: ModelOption[]
  /** Whether OpenRouter's list is fresh, served from Theorem's cache, or missing. */
  openrouter: 'live' | 'cached' | 'unavailable'
}

/** The body of `GET /api/chat/v1/models`, parsed once where it enters. */
export function parseModelList(raw: unknown): ModelList {
  const body = record(raw)
  const status = record(body?.openrouter)?.status
  const all = (Array.isArray(body?.models) ? body.models : []).flatMap((entry) => {
    const option = parseModelEntry(entry)
    return option ? [option] : []
  })
  const list: ModelList = {
    models: all.filter((m) => m.kind === 'language'),
    decisionModels: all.filter((m) => m.kind === 'decision'),
    openrouter: status === 'live' || status === 'cached' ? status : 'unavailable',
  }
  if (typeof body?.defaultRef === 'string') list.defaultRef = body.defaultRef
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

/** The person's decision-model pick: a ref, `none` to turn the role off, or undefined for Theorem's default. */
export type DecisionPick = string | undefined

type PickedModelsState = {
  /** Models shown in the composer's picker, in the order they were starred. */
  starred: readonly string[]
  /** The model the next turn runs on; undefined leaves it to Theorem's default. */
  selected: string | undefined
  /** The decision model the person picked; see {@link DecisionPick}. */
  decision: DecisionPick
  setStarred: (refs: readonly string[]) => void
  toggleStar: (ref: string) => void
  select: (ref: string | undefined) => void
  pickDecision: (pick: DecisionPick) => void
}

export const usePickedModels = create<PickedModelsState>()(
  persist(
    (set) => ({
      starred: [],
      selected: undefined,
      decision: undefined,
      setStarred: (starred) => set({ starred }),
      toggleStar: (ref) =>
        set(({ starred }) => ({
          starred: starred.includes(ref)
            ? starred.filter((r) => r !== ref)
            : [...starred, ref],
        })),
      select: (selected) => set({ selected }),
      pickDecision: (decision) => set({ decision }),
    }),
    {
      name: 'theorem-ui:models',
      partialize: ({ starred, selected, decision }) => ({ starred, selected, decision }),
    },
  ),
)

/**
 * Turn options that carry the picked model. The SDK's chat adapter spreads
 * its turn options into every send, retry and edit, so the getter reads the
 * pick at send time and a thread's adapter never needs rebuilding.
 */
export const pickedModelTurnOptions = {
  get model(): Theorem.ResolvedModel | undefined {
    const ref = usePickedModels.getState().selected
    return ref ? resolvedModel(ref) : undefined
  },
}

type Preferences = {
  starredModels: string[]
  defaultModel: string | null
  /** A decision-model ref, `none`, or null for Theorem's default. Absent from a Theorem that predates the role. */
  decisionModel?: string | null
  revision: number
}

const preferencesKey = ['theorem', 'preferences'] as const

/**
 * Keeps the starred, picked and decision models in step with the person's
 * Theorem preferences, so they follow the person across browsers. Theorem's
 * copy wins when it loads; after that each local change is written back with
 * If-Match. Where Theorem does not serve preferences, the local store stands alone.
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
      decision: data.decisionModel ?? undefined,
    })
  }, [data])

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined
    const unsubscribe = usePickedModels.subscribe((state, previous) => {
      if (revision.current === undefined) return
      if (
        state.starred === previous.starred &&
        state.selected === previous.selected &&
        state.decision === previous.decision
      )
        return
      clearTimeout(timer)
      timer = setTimeout(() => {
        const { starred, selected, decision } = usePickedModels.getState()
        void mutate((headers) =>
          theoremJson<Preferences>('/api/chat/v1/preferences', {
            method: 'PUT',
            headers: { ...headers, 'If-Match': String(revision.current) },
            body: {
              starredModels: starred,
              defaultModel: selected ?? null,
              decisionModel: decision ?? null,
            },
          }),
        ).then(
          (saved) => {
            revision.current = saved.revision
            // The chat and decision roles follow these preferences.
            void queryClient.invalidateQueries({ queryKey: ['theorem', 'roles'] })
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
