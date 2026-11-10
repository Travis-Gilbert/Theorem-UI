// Reuse the HTML App sandbox, CodeMirror source editor, and native document owner.
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from 'react'
import { askAbout } from '@/components/chat/composer-references'
import { Button } from '@/components/ui/button'
import { documentAppDatabases } from '@/lib/blocks/app-db'
import * as checker from '@/lib/blocks/app-checker'
import { writeAppSource } from '@/lib/blocks/app-edit'
import {
  AppBuildError,
  SOURCE_TYPE,
  appSourcesOf,
} from '@/lib/blocks/app-source'
import type { AppProblem } from '@/lib/blocks/app-source'
import { traceFrameError } from '@/lib/blocks/app-trace'
import { documentAppHost, documentAppState } from '@/lib/blocks/document-app'
import * as hosted from '@/lib/blocks/hosted-app'
import type { AppSelection, FrameError } from '@/lib/blocks/sandbox/protocol'
import { describeError } from '@/lib/theorem/client'
import { appDocumentFor } from '@/lib/theorem/apps'
import {
  APP_PENDING_CONTEXT_MESSAGE,
  appContextReference,
  appRepairReference,
  captureAppSelection,
  selectionForSource,
} from '@/lib/theorem/app-references'
import type { AppSelectionContext } from '@/lib/theorem/app-references'
import type { AppDocument, AppSnapshot } from '@/lib/theorem/apps'
import { AppElement } from './app-element'
import { AppProblems } from './app-problems'
import { BlockFrame } from './block-frame'
import { BlockMessage } from './block-status'
import { appDeclarations } from './html-app-handler'
import { SourceEditor } from './source-editor'

function useDocumentReplica(app: AppDocument) {
  const [state, setState] = useState<ReturnType<typeof documentAppState>>()
  const [error, setError] = useState<string>()
  useEffect(() => {
    let active = true
    const replica = documentAppState(app)
    void replica.ready.then(
      () => {
        if (active) setState(replica)
      },
      (failure) => {
        if (active) setError(errorText(failure))
      },
    )
    return () => {
      active = false
      replica.dispose()
    }
  }, [app])
  return { state, error }
}

function errorText(error: unknown): string {
  return describeError(error, 'document')
}

/** A revision's page as its frame loads it, and what it was built from. */
interface Shown {
  html: string
  src: string
  /** The hosted page itself: a built App's page says how it was built. */
  page: string
}

/** Whether an App's HTML carries TypeScript source, which is built before it runs. */
const carriesSource = (html: string) => html.includes(SOURCE_TYPE)

/**
 * The page to show for `html`. A plain HTML App's old page goes the moment
 * its source changes. An App built from source keeps showing the last
 * revision that built while the next is built, and after it fails to: then
 * `problems` says why and `shown` is still the earlier revision.
 */
function useHostedPreview(html: string, ready: Promise<void> | undefined) {
  const [state, setState] = useState<{
    shown?: Shown
    failed?: { html: string; problems: Array<AppProblem>; error?: string }
  }>({})
  const urls = useRef(new Set<string>())
  useEffect(() => {
    if (!ready) return
    let active = true
    void Promise.all([hosted.hostedAppDocument(html), ready]).then(
      ([page]) => {
        if (!active) return
        const src = URL.createObjectURL(new Blob([page], { type: 'text/html' }))
        for (const url of urls.current) URL.revokeObjectURL(url)
        urls.current = new Set([src])
        setState({ shown: { html, src, page } })
      },
      (failure: unknown) => {
        if (!active) return
        setState((previous) => ({
          shown: previous.shown,
          failed:
            failure instanceof AppBuildError
              ? { html, problems: failure.problems }
              : { html, problems: [], error: errorText(failure) },
        }))
      },
    )
    return () => {
      active = false
    }
  }, [html, ready])
  useEffect(() => {
    const made = urls.current
    return () => {
      for (const url of made) URL.revokeObjectURL(url)
    }
  }, [])
  const failed = state.failed?.html === html ? state.failed : undefined
  // An earlier revision stays only for an App that is built from source.
  const shown =
    state.shown && (state.shown.html === html || carriesSource(html))
      ? state.shown
      : undefined
  return {
    shown,
    current: shown?.html === html,
    problems: failed?.problems ?? [],
    error: failed?.error,
  }
}

/** The type check of the revision on screen: its problems, once they are known. */
function useTypeCheck(html: string, built: boolean) {
  const [state, setState] = useState<{
    html: string
    problems: Array<AppProblem>
    error?: string
  }>()
  const checks = built && carriesSource(html)
  useEffect(() => {
    if (!checks) return
    let active = true
    void Promise.resolve()
      .then(() => {
        const sources = appSourcesOf(html)
        return sources ? checker.checkInWorker(sources) : undefined
      })
      .then(
        (result) => {
          if (active) setState({ html, problems: result?.problems ?? [] })
        },
        (failure: unknown) => {
          if (active)
            setState({
              html,
              problems: [],
              error:
                failure instanceof Error ? failure.message : String(failure),
            })
        },
      )
    return () => {
      active = false
    }
  }, [html, checks])
  // A result for another revision says nothing about this one.
  const result = checks && state?.html === html ? state : undefined
  return {
    problems: result?.problems ?? [],
    error: result?.error,
    checking: checks && !result,
  }
}

/** The most uncaught errors listed for one frame. */
const MAX_RUNTIME_PROBLEMS = 20

function AppPreview({
  app,
  snapshot,
  onSelection,
}: {
  app: AppDocument
  snapshot: AppSnapshot
  onSelection: (value: AppSelectionContext | undefined) => void
}) {
  const { state, error: stateError } = useDocumentReplica(app)
  const preview = useHostedPreview(snapshot.html, state?.ready)
  const { shown } = preview
  const types = useTypeCheck(snapshot.html, preview.current)
  const [thrown, setThrown] = useState<{
    src: string
    problems: Array<AppProblem>
  }>()
  const shownHtml = shown?.html
  const declarations = useMemo(
    () => (shownHtml === undefined ? undefined : appDeclarations(shownHtml)),
    [shownHtml],
  )
  // Named by the document, so the next revision of this App finds its records.
  const databases = useMemo(
    () => documentAppDatabases(app.documentId),
    [app.documentId],
  )
  useEffect(() => () => databases.dispose(), [databases])
  const onError = useCallback(
    (failure: FrameError) => {
      if (!shown) return
      const problem = traceFrameError(failure, hosted.hostedBuild(shown.page))
      setThrown((previous) => {
        const before = previous?.src === shown.src ? previous.problems : []
        const repeat = before.some(
          (other) =>
            other.message === problem.message &&
            other.file === problem.file &&
            other.line === problem.line,
        )
        return repeat || before.length >= MAX_RUNTIME_PROBLEMS
          ? (previous ?? { src: shown.src, problems: before })
          : { src: shown.src, problems: [...before, problem] }
      })
    },
    [shown],
  )
  // State-only saves update the existing frame rather than restarting its controls.
  const host = useMemo(
    () =>
      state &&
      declarations &&
      shownHtml !== undefined && {
        ...documentAppHost(
          app,
          app.getSnapshot()!,
          declarations.capabilities,
          state.state,
          databases,
        ),
        onError,
        onSelection: (selection: AppSelection) => {
          const context = captureAppSelection(
            shownHtml,
            app.getSnapshot(),
            selection,
          )
          onSelection(context)
        },
      },
    [app, shownHtml, declarations, state, databases, onSelection, onError],
  )
  // What the frame threw belongs to the revision in it; it is listed with the
  // source's own problems only while that revision is the current one.
  const problems = [
    ...preview.problems,
    ...(preview.current
      ? [
          ...types.problems,
          ...(thrown?.src === shown?.src ? (thrown?.problems ?? []) : []),
        ]
      : []),
  ]
  const error = preview.error || stateError
  return (
    <>
      {error && <BlockMessage tone="error">{error}</BlockMessage>}
      <AppProblems
        problems={problems}
        kept={Boolean(shown) && !preview.current}
        checking={types.checking}
        checkError={types.error}
        onFix={() => {
          const current = app.getSnapshot()
          if (current && !current.pendingState)
            askAbout(appRepairReference(current, problems))
        }}
      />
      {shown && host ? (
        <BlockFrame src={shown.src} host={host} title={snapshot.title} />
      ) : (
        !error && !problems.length && <p role="status">Loading App…</p>
      )}
    </>
  )
}

type Attempt = (action: () => Promise<unknown>) => Promise<void>
function useAppSnapshot(app: AppDocument, pinnedPosition?: number | string) {
  const snapshot = useSyncExternalStore(
    app.subscribe,
    app.getSnapshot,
    () => null,
  )
  const [error, setError] = useState<string>()
  const attempt: Attempt = async (action) => {
    setError(undefined)
    try {
      await action()
    } catch (failure) {
      setError(errorText(failure))
    }
  }
  useEffect(() => {
    void app.load().catch((failure) => setError(errorText(failure)))
  }, [app, pinnedPosition])
  useEffect(() => {
    const refresh = () => {
      if (document.visibilityState === 'visible') void attempt(() => app.load())
    }
    const timer = setInterval(refresh, 10_000)
    window.addEventListener('focus', refresh)
    return () => {
      clearInterval(timer)
      window.removeEventListener('focus', refresh)
    }
  }, [app])
  return { snapshot, error, attempt }
}

type Edit = { html: string; base: AppSnapshot }
function AppSourceEditor({
  app,
  edit,
  setEdit,
  attempt,
}: {
  app: AppDocument
  edit: Edit
  setEdit: (edit: Edit | undefined) => void
  attempt: Attempt
}) {
  return (
    <div className="flex flex-col gap-2">
      <SourceEditor
        value={edit.html}
        lang="html"
        label="App source"
        onChange={(html) => setEdit({ ...edit, html })}
      />
      <div className="flex gap-2">
        <Button
          size="xs"
          onClick={() =>
            void attempt(async () => {
              await app.saveSource(edit.html, edit.base.revision)
              setEdit(undefined)
            })
          }
        >
          Save source
        </Button>
        <Button size="xs" variant="ghost" onClick={() => setEdit(undefined)}>
          Cancel edit
        </Button>
      </div>
    </div>
  )
}

function AppToolbar({
  snapshot,
  pinnedPosition,
  running,
  toggle,
  edit,
  about,
  selected,
  reload,
}: {
  snapshot: AppSnapshot
  pinnedPosition?: number | string
  running: boolean
  toggle: () => void
  edit: () => void
  about: () => void
  selected: boolean
  reload: () => void
}) {
  return (
    <div
      data-revision={String(snapshot.revision.position)}
      className="flex flex-wrap items-center gap-2 text-xs text-ink-muted"
    >
      {pinnedPosition !== undefined &&
        String(pinnedPosition) !== String(snapshot.revision.position) && (
          <span>Changed since this result</span>
        )}
      <Button size="xs" variant="outline" onClick={toggle}>
        {running ? 'Stop App' : 'Run App'}
      </Button>
      <Button size="xs" variant="outline" onClick={edit}>
        Edit source
      </Button>
      <Button
        size="xs"
        variant="outline"
        onClick={about}
        disabled={snapshot.pendingState}
      >
        {selected ? 'Ask about selection' : 'Ask about this App'}
      </Button>
      <Button size="xs" variant="ghost" onClick={reload}>
        Reload
      </Button>
    </div>
  )
}

export function DocumentApp({
  documentId,
  pinnedPosition,
  initiallyRunning = false,
}: {
  documentId: string
  pinnedPosition?: number | string
  initiallyRunning?: boolean
}) {
  const app = useMemo(() => appDocumentFor(documentId), [documentId])
  return (
    <DocumentAppView
      app={app}
      pinnedPosition={pinnedPosition}
      initiallyRunning={initiallyRunning}
    />
  )
}

function useAppSelection(app: AppDocument) {
  const [selection, setSelection] = useState<AppSelectionContext>()
  useEffect(
    () =>
      app.subscribe(() => {
        if (app.hasPendingState()) setSelection(undefined)
      }),
    [app],
  )
  return [selection, setSelection] as const
}

export function DocumentAppView({
  app,
  pinnedPosition,
  initiallyRunning = false,
}: {
  app: AppDocument
  pinnedPosition?: number | string
  initiallyRunning?: boolean
}) {
  const { snapshot, error, attempt } = useAppSnapshot(app, pinnedPosition)
  const [edit, setEdit] = useState<Edit>()
  const [running, setRunning] = useState(initiallyRunning)
  const [selection, setSelection] = useAppSelection(app)
  // What was pointed at, while it is still this revision that is on screen.
  const pointed = snapshot && selectionForSource(snapshot, selection)
  if (!snapshot)
    return (
      <BlockMessage tone={error ? 'error' : undefined}>
        {error ?? 'Loading App…'}
      </BlockMessage>
    )
  return (
    <section aria-label={snapshot.title} className="flex flex-col gap-3">
      <AppToolbar
        snapshot={snapshot}
        pinnedPosition={pinnedPosition}
        running={running}
        toggle={() => {
          setRunning((value) => !value)
          setSelection(undefined)
        }}
        edit={() => setEdit({ html: snapshot.html, base: snapshot })}
        about={() =>
          void attempt(async () => {
            askAbout(appContextReference(app.getSnapshot()!, selection))
          })
        }
        selected={Boolean(selectionForSource(snapshot, selection))}
        reload={() => void attempt(() => app.load())}
      />
      {snapshot.pendingState && (
        <p role="status" className="text-sm text-ink-muted">
          {APP_PENDING_CONTEXT_MESSAGE}
        </p>
      )}
      <AppSaveError
        error={error || snapshot.saveError}
        app={app}
        attempt={attempt}
      />
      {pointed?.selection.source && !edit && (
        <AppElement
          html={snapshot.html}
          stamp={pointed.selection.source}
          onApply={(file, source) =>
            attempt(async () => {
              await app.saveSource(
                writeAppSource(snapshot.html, file, source),
                snapshot.revision,
              )
              setSelection(undefined)
            })
          }
        />
      )}
      {edit && (
        <AppSourceEditor
          app={app}
          edit={edit}
          setEdit={setEdit}
          attempt={attempt}
        />
      )}
      {running ? (
        <AppPreview app={app} snapshot={snapshot} onSelection={setSelection} />
      ) : (
        <p className="text-sm text-ink-muted">
          Run this App to use its controls. Changes to its declared state are
          saved in this document.
        </p>
      )}
    </section>
  )
}

function AppSaveError({
  error,
  app,
  attempt,
}: {
  error?: string
  app: AppDocument
  attempt: Attempt
}) {
  if (!error) return null
  return (
    <BlockMessage tone="error">
      {error}{' '}
      {app.hasPendingState() && (
        <Button size="xs" onClick={() => void attempt(() => app.flush())}>
          Retry save
        </Button>
      )}
    </BlockMessage>
  )
}
