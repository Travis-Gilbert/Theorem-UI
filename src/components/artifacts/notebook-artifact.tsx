// SOURCING: the hosted App frame (BlockFrame over FrameConnection: sandbox
// "allow-scripts", a CSP that loads nothing unless a run names its hosts),
// the bridge's theme.changed call and the platform MutationObserver (the
// page's theme followed into the frame, as live-terminal-theme follows it),
// the installed react-shiki SyntaxHighlighter (the marimo source), ui/button,
// composer-references' askAbout with app-references' notebookReference (the
// path an HTML App's selection takes to the next turn), and artifact-host's
// react-query reads of the host description and the recorded outputs. No
// library hosts an Observable or marimo notebook in Theorem's sandbox.
//
// A notebook artifact shows what it computed. Observable cells run in the
// frame with the vendored modules and nothing from the network. A marimo
// notebook shows its recorded outputs with code hidden; it runs in the browser
// only when the person starts it, and never claims a run it did not make.
import { useCallback, useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { SyntaxHighlighter } from '@/components/assistant-ui/elements/shiki-highlighter'
import { BlockFrame } from '@/components/blocks/block-frame'
import { BlockMessage } from '@/components/blocks/block-status'
import { askAbout } from '@/components/chat/composer-references'
import { Button } from '@/components/ui/button'
import { BridgeDenied } from '@/lib/blocks/bridge'
import type { BridgeHost } from '@/lib/blocks/bridge'
import { noCapabilities } from '@/lib/blocks/declarations'
import type { FrameConnection } from '@/lib/blocks/executor'
import { call } from '@/lib/blocks/sandbox/protocol'
import type {
  AppSelection,
  SandboxMethods,
} from '@/lib/blocks/sandbox/protocol'
import { resolvedTheme } from '@/lib/blocks/sandbox/theme'
import type { ThemeState } from '@/lib/blocks/sandbox/theme'
import { NOTEBOOK_FORM_VERSION, needsNativeHost } from '@/lib/notebooks/forms'
import type {
  MarimoNotebook,
  ObservableNotebook,
} from '@/lib/notebooks/forms'
import {
  BROWSER_RUN_HOSTS,
  islandsDocument,
  retainedOutputsDocument,
} from '@/lib/notebooks/marimo'
import { observableDocument } from '@/lib/notebooks/observable-document'
import { notebookReference } from '@/lib/theorem/app-references'
import {
  useArtifactHost,
  useRetainedOutputs,
} from '@/lib/theorem/artifact-host'
import type { ArtifactInteraction } from '@/lib/theorem/artifact-host'
import { describeError } from '@/lib/theorem/client'
import { cn } from '@/lib/utils'
import type { TheoremArtifact } from './artifact-model'

const denied = (what: string) => async () => {
  throw new BridgeDenied(`A notebook ${what}.`)
}

/**
 * What the page lends a notebook frame: nothing but its selections. It reads
 * and writes no files, keeps no shared state and starts no agents.
 */
export function notebookHost(
  onSelection?: (selection: AppSelection) => void,
): BridgeHost {
  return {
    capabilities: noCapabilities(),
    state: {
      snapshot: () => ({}),
      set: denied('keeps no shared state'),
      delete: denied('keeps no shared state'),
      subscribe: () => () => {},
    },
    client: {
      read: denied('reads no workspace files'),
      tree: denied('reads no workspace files'),
      write: denied('writes no workspace files'),
    },
    run: denied('starts no agents'),
    onSelection,
  }
}

/** Pushes the page's theme into a connected frame now and whenever it changes. */
function followTheme(connection: FrameConnection): () => void {
  // A frame that closed or never connected has no theme to follow.
  const push = () =>
    void connection.connected
      .then((rpc) =>
        call<SandboxMethods, 'theme.changed'>(rpc, 'theme.changed', resolvedTheme()),
      )
      .catch(() => {})
  push()
  const observer = new MutationObserver(push)
  observer.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ['class', 'data-palette', 'style'],
  })
  return () => observer.disconnect()
}

/** A hosted document as a blob URL, built once per `key` with the theme it opens in. */
function usePage(build: (theme: ThemeState) => Promise<string>, key: unknown) {
  const [page, setPage] = useState<{ key?: unknown; src?: string; error?: string }>({})
  useEffect(() => {
    let active = true
    let url: string | undefined
    void build(resolvedTheme()).then(
      (html) => {
        if (!active) return
        url = URL.createObjectURL(new Blob([html], { type: 'text/html' }))
        setPage({ key, src: url })
      },
      (failure) => {
        if (active) setPage({ key, error: describeError(failure, 'document') })
      },
    )
    return () => {
      active = false
      if (url) URL.revokeObjectURL(url)
    }
    // `build` closes over the notebook `key` names; a new closure alone is not a new page.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key])
  // A page built for an earlier key is not this one's: until this one is built, there is none.
  return page.key === key ? page : {}
}

/** A notebook's frame: its document, the deny-all host, the page's theme followed in. */
function NotebookFrame({
  build,
  buildKey,
  title,
  loading,
  onSelection,
}: {
  build: (theme: ThemeState) => Promise<string>
  buildKey: unknown
  title: string
  loading: string
  onSelection: (selection: AppSelection) => void
}) {
  const page = usePage(build, buildKey)
  const host = useMemo(() => notebookHost(onSelection), [onSelection])
  if (page.error) return <BlockMessage tone="error">{page.error}</BlockMessage>
  if (!page.src)
    return (
      <p role="status" className="py-3 text-sm text-ink-muted">
        {loading}
      </p>
    )
  return (
    <BlockFrame
      src={page.src}
      host={host}
      title={title}
      onConnection={followTheme}
    />
  )
}

/**
 * The person's selection in one page of a notebook's frame. A new revision,
 * or a switch between the recorded and the running notebook, builds a new
 * page, which starts with nothing selected, so a reference never carries one
 * revision's selection to another.
 */
function usePageSelection(page: unknown) {
  const [held, setHeld] = useState<{ page: unknown; selection: AppSelection }>()
  const select = useCallback(
    (selection: AppSelection) => setHeld({ page, selection }),
    [page],
  )
  return [held && held.page === page ? held.selection : undefined, select] as const
}

/** Whether the person pointed at something in the notebook. */
const pointedAt = (selection?: AppSelection) =>
  Boolean(selection?.entityId || selection?.cellId || selection?.text)

/**
 * The notebook surface: a quiet line of status and actions above the frame.
 * `notebook-surface` is the hook the paper material attaches to. Ask is there
 * when the part names its App document, which the reference points at.
 */
function NotebookSurface({
  artifact,
  form,
  cellIds,
  selection,
  status,
  actions,
  children,
}: {
  artifact: TheoremArtifact
  form: 'observable' | 'marimo'
  /** The cells this revision is known to have, which a locator may name. */
  cellIds: ReadonlyArray<string>
  selection?: AppSelection
  status?: ReactNode
  actions?: ReactNode
  children: ReactNode
}) {
  const { documentId, documentPosition } = artifact
  return (
    <section
      aria-label={artifact.title}
      data-slot="notebook"
      data-form={form}
      className="notebook-surface flex flex-col gap-2"
    >
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-ink-muted">
        <span role="status" className="min-w-0 flex-1">
          {status}
        </span>
        {actions}
        {documentId && documentPosition !== undefined && (
          <Button
            size="xs"
            variant="ghost"
            onClick={() =>
              askAbout(
                notebookReference(
                  {
                    documentId,
                    position: documentPosition,
                    title: artifact.title,
                    cellIds,
                  },
                  selection,
                ),
              )
            }
          >
            {pointedAt(selection) ? 'Ask about selection' : 'Ask about this'}
          </Button>
        )}
      </div>
      {children}
    </section>
  )
}

/**
 * A notebook part this build cannot read: one written in a newer form
 * version, or one whose payload is not a notebook form.
 */
export function UnreadableNotebook({ artifact }: { artifact: TheoremArtifact }) {
  return (
    <BlockMessage tone="error">
      {(artifact.formVersion ?? 1) > NOTEBOOK_FORM_VERSION
        ? `This notebook is in form version ${artifact.formVersion}; this version of Theorem reads version ${NOTEBOOK_FORM_VERSION}.`
        : 'This notebook could not be read: its payload is not an Observable or marimo notebook.'}
    </BlockMessage>
  )
}

export function ObservableNotebookView({
  artifact,
  notebook,
}: {
  artifact: TheoremArtifact
  notebook: ObservableNotebook
}) {
  const [selection, setSelection] = usePageSelection(notebook)
  const cellIds = useMemo(() => notebook.cells.map((cell) => cell.id), [notebook])
  return (
    <NotebookSurface
      artifact={artifact}
      form="observable"
      cellIds={cellIds}
      selection={selection}
    >
      <NotebookFrame
        build={(theme) => observableDocument(notebook, theme)}
        buildKey={notebook}
        title={notebook.title}
        loading="Starting the notebook…"
        onSelection={setSelection}
      />
    </NotebookSurface>
  )
}

const recordedAt = (ms: number) =>
  new Date(ms).toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  })

/**
 * Where a marimo notebook's outputs came from, said plainly. Recorded
 * outputs name the host that produced them, and say so when that run was of
 * a different source. A notebook that needs a native host says whether one
 * is connected (`connected`; unknown while the host description loads) and
 * waits rather than pretending to run.
 */
export function marimoStatus(
  notebook: MarimoNotebook,
  {
    running = false,
    stale = false,
    connected,
  }: { running?: boolean; stale?: boolean; connected?: boolean } = {},
): string {
  if (running)
    return 'Running in this page on Pyodide: no CUDA, and no true CPU parallelism.'
  const run = notebook.outputs?.execution
  const host = notebook.needs?.gpu ? 'a GPU host' : 'a native host'
  const missing =
    needsNativeHost(notebook) && connected === false
      ? ` Running it again needs ${host}; none is connected.`
      : ''
  if (run) {
    const on = run.device ? `${run.host}, ${run.device}` : run.host
    const of = stale ? ' of a different version of this notebook' : ''
    return `From a recorded run${of} on ${on}, ${recordedAt(run.finishedAtMs)}.${missing}`
  }
  if (!needsNativeHost(notebook)) return 'This notebook has not run yet.'
  return connected === false
    ? `Awaiting ${host}. This notebook has not run, so it has no outputs yet.`
    : 'This notebook has not run yet, so it has no outputs.'
}

/** Whether the host's execution environment can run a notebook that needs a native host. */
const hostRuns = (notebook: MarimoNotebook, execute?: string) =>
  notebook.needs?.gpu
    ? execute === 'native-gpu'
    : execute === 'native' || execute === 'native-gpu'

export function MarimoNotebookView({
  artifact,
  notebook,
}: {
  artifact: TheoremArtifact
  notebook: MarimoNotebook
}) {
  const [running, setRunning] = useState(false)
  const [source, setSource] = useState(false)
  const host = useArtifactHost()
  const fetched = useRetainedOutputs(
    notebook.outputs ? undefined : notebook.retainedOutputs,
  )
  const run = useMemo(
    () =>
      notebook.outputs
        ? { outputs: notebook.outputs, stale: false }
        : fetched.data,
    [notebook.outputs, fetched.data],
  )
  // The frames read the outputs off the notebook. A stale run's cells may not
  // line up with this source's, so a browser run starts without them.
  const shown = useMemo(
    () => ({ ...notebook, outputs: run?.outputs }),
    [notebook, run],
  )
  const fresh = useMemo(
    () => ({ ...notebook, outputs: run?.stale ? undefined : run?.outputs }),
    [notebook, run],
  )
  const cellIds = useMemo(
    () => (run && !run.stale ? run.outputs.cells.map((cell) => cell.id) : []),
    [run],
  )
  const [selection, setSelection] = usePageSelection(running ? fresh : shown)
  const execute = host.data?.availability.marimo.execute
  const connected = host.isPending
    ? undefined
    : host.isError
      ? undefined
      : hostRuns(notebook, execute)
  // The host labels what it offers; a Theorem without a host description
  // offers what every browser can: the recorded view and a Pyodide run.
  const offers = host.data?.interactions.marimo
  const offer = (interaction: ArtifactInteraction, fallback: string) =>
    offers
      ? offers.find((o) => o.interaction === interaction)?.label
      : fallback
  const viewLabel = offer('view', 'View result') ?? 'View result'
  const runLabel = offer('kernel', 'Run notebook')
  // Pyodide has no CUDA and no native packages, so only a browser notebook can run here.
  const runnable =
    !needsNativeHost(notebook) && execute !== 'none' && runLabel !== undefined
  const recorded = Boolean(
    run?.outputs.cells.some((cell) => cell.outputs.length),
  )
  const status = fetched.isLoading && !running
    ? 'Opening the recorded outputs…'
    : fetched.isError && !running
      ? `The recorded outputs could not be read: ${describeError(fetched.error, 'document')}`
      : marimoStatus(shown, { running, stale: run?.stale, connected })
  return (
    <NotebookSurface
      artifact={artifact}
      form="marimo"
      cellIds={cellIds}
      selection={selection}
      status={status}
      actions={
        <>
          {runnable && (
            <Button
              size="xs"
              variant={running ? 'ghost' : 'outline'}
              title={
                running
                  ? undefined
                  : `Runs on Pyodide in this page, with no CUDA and no true CPU parallelism. Loads marimo and the notebook's packages from ${BROWSER_RUN_HOSTS.join(', ')}.`
              }
              onClick={() => setRunning((value) => !value)}
            >
              {running ? viewLabel : runLabel}
            </Button>
          )}
          <Button
            size="xs"
            variant="ghost"
            aria-expanded={source}
            onClick={() => setSource((value) => !value)}
          >
            {source ? 'Hide source' : 'Source'}
          </Button>
        </>
      }
    >
      {running ? (
        <NotebookFrame
          key="browser-run"
          build={(theme) => islandsDocument(fresh, theme)}
          buildKey={fresh}
          title={notebook.title}
          loading="Preparing the browser run…"
          onSelection={setSelection}
        />
      ) : recorded ? (
        <NotebookFrame
          key="recorded"
          build={(theme) => retainedOutputsDocument(shown, theme)}
          buildKey={shown}
          title={notebook.title}
          loading="Opening the recorded outputs…"
          onSelection={setSelection}
        />
      ) : null}
      {source && (
        <SyntaxHighlighter
          className={cn(
            '[&_pre]:rounded-lg! [&_pre]:border! [&_pre]:border-separator! [&_pre]:text-[13px]',
          )}
          language="python"
          code={notebook.source}
        />
      )}
    </NotebookSurface>
  )
}
