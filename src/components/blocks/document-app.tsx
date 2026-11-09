// Reuse the HTML App sandbox, CodeMirror source editor, and native document owner.
import { useEffect, useMemo, useState, useSyncExternalStore } from 'react'
import { askAbout } from '@/components/chat/composer-references'
import { Button } from '@/components/ui/button'
import { documentAppHost, documentAppState } from '@/lib/blocks/document-app'
import { followTheme, hostedAppDocument } from '@/lib/blocks/hosted-app'
import type { AppSelection } from '@/lib/blocks/sandbox/protocol'
import { describeError } from '@/lib/theorem/client'
import { appDocumentFor } from '@/lib/theorem/apps'
import {
  APP_PENDING_CONTEXT_MESSAGE,
  appContextReference,
  captureAppSelection,
  selectionForSource,
} from '@/lib/theorem/app-references'
import type { AppSelectionContext } from '@/lib/theorem/app-references'
import type { AppDocument, AppSnapshot } from '@/lib/theorem/apps'
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

function usePreviewUrl(html: string, ready: Promise<void> | undefined) {
  const [preview, setPreview] = useState<{ src?: string; error?: string }>({})
  useEffect(() => {
    if (!ready) return
    let active = true
    let url: string | undefined
    void Promise.all([hostedAppDocument(html), ready])
      .then(([page]) => {
        if (!active) return
        url = URL.createObjectURL(new Blob([page], { type: 'text/html' }))
        setPreview({ src: url })
      })
      .catch((failure) => {
        if (active) setPreview({ error: errorText(failure) })
      })
    return () => {
      active = false
      if (url) URL.revokeObjectURL(url)
    }
  }, [html, ready])
  return preview
}

function AppPreview({
  app,
  snapshot,
  onSelection,
}: {
  app: AppDocument
  snapshot: AppSnapshot
  onSelection: (value: AppSelectionContext | undefined) => void
}) {
  const source = snapshot.html
  const { state, error: stateError } = useDocumentReplica(app)
  const { src, error } = usePreviewUrl(snapshot.html, state?.ready)
  const declarations = useMemo(
    () => appDeclarations(snapshot.html),
    [snapshot.html],
  )
  // State-only saves update the existing frame rather than restarting its controls.
  const host = useMemo(
    () =>
      state && {
        ...documentAppHost(
          app,
          app.getSnapshot()!,
          declarations.capabilities,
          state.state,
        ),
        onSelection: (selection: AppSelection) => {
          const context = captureAppSelection(
            source,
            app.getSnapshot(),
            selection,
          )
          onSelection(context)
        },
      },
    [app, source, declarations, state, onSelection],
  )
  if (error || stateError)
    return <BlockMessage tone="error">{error || stateError}</BlockMessage>
  return src && host ? (
    <BlockFrame
      src={src}
      host={host}
      title={snapshot.title}
      onConnection={followTheme}
    />
  ) : (
    <p role="status">Loading App…</p>
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
      className="flex flex-wrap items-center gap-1 text-xs text-ink-muted"
    >
      {pinnedPosition !== undefined &&
        String(pinnedPosition) !== String(snapshot.revision.position) && (
          <span>Changed since this result</span>
        )}
      <Button size="xs" variant="ghost" onClick={toggle}>
        {running ? 'Stop App' : 'Run App'}
      </Button>
      <Button size="xs" variant="ghost" onClick={edit}>
        Edit source
      </Button>
      <Button
        size="xs"
        variant="ghost"
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
      {edit && (
        <AppSourceEditor
          app={app}
          edit={edit}
          setEdit={setEdit}
          attempt={attempt}
        />
      )}
      {running ? (
        <AppPreview
          key={snapshot.html}
          app={app}
          snapshot={snapshot}
          onSelection={setSelection}
        />
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
