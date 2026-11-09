// SOURCING: @tanstack/react-query over lib/theorem/passthrough (the artifact
// host routes, which the vendored SDK has no client for yet), as
// lib/theorem/reviews reads its routes; zod's RetainedOutputs from
// lib/notebooks/forms checks what the outputs route answers. The types project
// theorem-surface-contracts' generated artifact bindings
// (ArtifactHostDescription, FormAvailability, InteractionOffer), which live in
// the Theorem repository and are not published to this one.
import { useQuery } from '@tanstack/react-query'
import { RetainedOutputs } from '@/lib/notebooks/forms'
import { isNotServed, theoremJson } from './passthrough'

/** Where a form's code runs here; `native-gpu` is a native host with a GPU. */
export type ExecuteEnvironment = 'none' | 'browser' | 'native' | 'native-gpu'

export type ArtifactInteraction =
  | 'view'
  | 'local'
  | 'kernel'
  | 'live-session'
  | 'persist'

/** One interaction a form offers on this host, labelled by the host. */
export type InteractionOffer = {
  interaction: ArtifactInteraction
  label: string
  session: 'none' | 'live'
  cost: 'cache' | 'live_slot'
  persistent: boolean
}

export type FormAvailability = {
  render: boolean
  execute: ExecuteEnvironment
  libraries: Array<string>
}

/**
 * What this Theorem can show and run per form, and the interactions each
 * offers. Its `presentation` (palette, material, width) is read where the
 * frame's presentation is drawn, not here.
 */
export type ArtifactHostDescription = {
  contract: string
  availability: Record<
    'html-app' | 'openui' | 'observable' | 'marimo',
    FormAvailability
  >
  interactions: Record<string, Array<InteractionOffer>>
}

/**
 * The artifact host description, or null from a Theorem that predates it.
 * Such a Theorem registers no execution hosts, so its notebooks run in the
 * browser or not at all.
 */
export function useArtifactHost() {
  return useQuery({
    queryKey: ['artifacts', 'host'],
    queryFn: async () => {
      try {
        return await theoremJson<ArtifactHostDescription>(
          '/api/artifacts/v1/host',
        )
      } catch (error) {
        if (isNotServed(error)) return null
        throw error
      }
    },
    // Hosts register for minutes at a time; a minute old is current enough.
    staleTime: 60_000,
  })
}

/** Where a stored marimo part's recorded outputs are. */
export type RetainedOutputsRef = { sourceRevision: string; href: string }

/** Recorded outputs to show, and whether they ran a different source. */
export type RecordedRun = { outputs: RetainedOutputs; stale: boolean }

/** One read of the outputs route. A Theorem without it, or without the document, has none. */
async function readOutputs(href: string) {
  try {
    const body = await theoremJson<{ outputs?: unknown }>(href)
    return RetainedOutputs.nullable().parse(body.outputs ?? null)
  } catch (error) {
    if (isNotServed(error)) return null
    throw error
  }
}

/** The same route without a revision: the document's latest run, whatever it ran. */
const latestHref = (href: string) => {
  const url = new URL(href, 'http://theorem.invalid')
  url.searchParams.delete('revision')
  return url.pathname + url.search
}

/**
 * The recorded run of the source this part pinned. With none, the latest run
 * of the document, marked stale, since it ran a different source; with no
 * run at all, null.
 */
export function useRetainedOutputs(ref: RetainedOutputsRef | undefined) {
  return useQuery({
    queryKey: ['artifacts', 'outputs', ref?.href],
    enabled: Boolean(ref),
    queryFn: async (): Promise<RecordedRun | null> => {
      const { href, sourceRevision } = ref!
      const exact = await readOutputs(href)
      const outputs = exact ?? (await readOutputs(latestHref(href)))
      return outputs && { outputs, stale: outputs.revision !== sourceRevision }
    },
    // A host may record a run while the notebook is on screen.
    staleTime: 60_000,
  })
}
