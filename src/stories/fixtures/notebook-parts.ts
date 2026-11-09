// SOURCING: none — fixtures: notebook parts as Theorem's delivery stores them,
// and what its artifact host routes answer, per theorem-surface-contracts'
// artifact publication contract (sections 2, 4 and 5). Stories and tests read
// the same ones.
import type { NotebookForm, RetainedOutputs } from '@/lib/notebooks/forms'
import type {
  ArtifactHostDescription,
  ExecuteEnvironment,
  InteractionOffer,
} from '@/lib/theorem/artifact-host'
import { cpuGpuModel } from './cpu-gpu-model'
import { cpuGpuTimingsAwaitingGpu, cpuGpuTimingsCpuOnly } from './cpu-gpu-timings'
import { cpuGpuTradeoff } from './cpu-gpu-tradeoff'

const offer = (
  interaction: InteractionOffer['interaction'],
  label: string,
  live = false,
): InteractionOffer => ({
  interaction,
  label,
  session: live ? 'live' : 'none',
  cost: live ? 'live_slot' : 'cache',
  persistent: interaction === 'persist',
})

/**
 * The host description of a Theorem whose marimo notebooks execute at
 * `execute`: in the browser alone, or also on a registered native host.
 */
export function artifactHost(
  execute: ExecuteEnvironment = 'browser',
): ArtifactHostDescription {
  const shown = (libraries: Array<string> = []) => ({
    render: true,
    execute: 'browser' as const,
    libraries,
  })
  const native = execute === 'native' || execute === 'native-gpu'
  return {
    contract: 'theorem-artifact-host/1',
    availability: {
      'html-app': shown(),
      openui: { ...shown(), render: false },
      observable: shown(['d3', 'Plot', 'Inputs', 'htl', 'md']),
      marimo: { render: true, execute, libraries: [] },
    },
    interactions: {
      'html-app': [offer('local', 'Use controls'), offer('persist', 'Saves changes')],
      observable: [offer('local', 'Use controls')],
      marimo: [
        offer('view', 'View result'),
        offer('kernel', 'Run notebook', true),
        ...(native ? [offer('live-session', 'Run on host', true)] : []),
      ],
    },
  }
}

/**
 * The stored part Theorem delivers for a notebook publication: the #978
 * payload fields, the publication's own beside them, and `formVersion`. A
 * marimo part names where its outputs are instead of carrying them.
 */
export function notebookPart(
  documentId: string,
  notebook: NotebookForm,
  { position = 1, sourceRevision }: { position?: number; sourceRevision?: string } = {},
) {
  // The publication's own fields; a stored marimo part carries no outputs.
  const publication: Record<string, unknown> = { ...notebook }
  delete publication.outputs
  const marimo = notebook.form === 'marimo'
  return {
    artifactId: `artifact:${documentId}`,
    artifactRevision: String(position),
    artifactKind: notebook.form,
    rendererId: `theorem-${notebook.form}`,
    contractVersion: 'theorem-artifact-v1',
    lifecycle: 'ready',
    patchSequence: position,
    fallbackText: notebook.title,
    sourceTool: 'complete_work',
    payload: {
      documentId,
      revision: { position, contentDigest: `story-${documentId}-${position}` },
      title: notebook.title,
      content:
        notebook.form === 'marimo' ? notebook.source : JSON.stringify(publication),
      language: marimo ? 'python' : 'json',
      ...publication,
      formVersion: 1,
      ...(marimo &&
        sourceRevision && {
          retainedOutputs: {
            sourceRevision,
            href: `/api/artifacts/v1/documents/${documentId}/outputs?revision=${sourceRevision}`,
          },
        }),
    },
  }
}

/**
 * What `GET .../documents/{id}/outputs` answers for a document whose current
 * source is `current` and whose recorded runs are `runs`, oldest first: the
 * run of the asked revision, or without one, the latest run.
 */
export function outputsAnswer(
  current: string,
  runs: ReadonlyArray<RetainedOutputs>,
  request: Request,
) {
  const revision = new URL(request.url).searchParams.get('revision')
  const outputs =
    (revision ? runs.find((run) => run.revision === revision) : runs.at(-1)) ??
    null
  return {
    sourceRevision: current,
    state: outputs && (outputs.revision === current ? 'snapshot' : 'stale'),
    outputs,
  }
}

const cpuRun = cpuGpuTimingsCpuOnly.outputs!
const modelRun = cpuGpuModel.outputs!

/**
 * The notebook stories' App documents: each one's publication, its source
 * revision, and the runs Theorem has recorded for it. The two timings
 * documents publish the same source; only one has a run.
 */
export const NOTEBOOK_DOCUMENTS: Readonly<
  Record<
    string,
    { notebook: NotebookForm; sourceRevision?: string; runs: Array<RetainedOutputs> }
  >
> = {
  'cpu-gpu-tradeoff': { notebook: cpuGpuTradeoff, runs: [] },
  'cpu-gpu-measured': {
    notebook: cpuGpuTimingsCpuOnly,
    sourceRevision: cpuRun.revision,
    runs: [cpuRun],
  },
  'cpu-gpu-awaiting-gpu': {
    notebook: cpuGpuTimingsAwaitingGpu,
    sourceRevision: cpuRun.revision,
    runs: [],
  },
  'cpu-gpu-model': {
    notebook: cpuGpuModel,
    sourceRevision: modelRun.revision,
    runs: [modelRun],
  },
}
