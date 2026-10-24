// SOURCING: dockview-react SplitviewReact (resizable working pane beside the view, as the shell's sheet split does), Base UI useMediaQuery (phone overlay), TooltipIconButton, ./view-renderer (OpenUI) for the open view, ./proposals, ./view-editor and ./inspector, @tanstack/react-query hooks in ./queries
import { useMediaQuery } from '@base-ui/react/unstable-use-media-query'
import { LayoutPriority, Orientation, SplitviewReact } from 'dockview-react'
import type { SplitviewApi, SplitviewReadyEvent } from 'dockview-react'
import { createContext, useContext, useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import { TooltipIconButton } from '@/components/assistant-ui/elements/tooltip-icon-button'
import { Icon } from '@/components/icons'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { TheoremError } from '@theoremharness/sdk'
import { describeError, isSignedOut } from '@/lib/theorem/client'
import { cn } from '@/lib/utils'
import { scopeKey } from './contract'
import type { IndexView, ViewOrigin, ViewRevision } from './contract'
import { Inspector } from './inspector'
import type { IndexHost } from './library'
import { useAskTheorem, useIndexNavigate, useIndexSearch } from './navigation'
import { observer } from './observe'
import { defaultViewFor, isDefaultView, resolveDefaultView } from './programs'
import { ProposalNotices } from './proposals'
import {
  useArchiveView,
  useCollections,
  useLibraryPublication,
  usePinView,
  useSetPreference,
  useStoredView,
  useViews,
} from './queries'
import { ViewEditor, ViewHistory } from './view-editor'
import { ViewRenderer } from './view-renderer'
import type { ViewActions } from './view-renderer'

const ORIGIN_TEXT: Record<ViewOrigin, string> = {
  default: 'Built in',
  user: 'Yours',
  agent: 'Made by an agent',
  improver: 'Prepared by Theorem',
}

/**
 * Which view is open: the one the URL names, else the scope's first pinned
 * view, else its built-in view. Built-in views live in this build; every
 * other view is read from Theorem.
 */
function useOpenView() {
  const { view: viewParam, scope } = useIndexSearch()
  const collections = useCollections()
  const views = useViews(scope)
  const collectionName = (collectionId: string) =>
    collections.data?.find((c) => c.collectionId === collectionId)?.name

  const pinned = views.data?.find((v) => v.pinned)
  const fallback =
    pinned?.viewId ??
    defaultViewFor(
      scope,
      scope.kind === 'collection'
        ? collectionName(scope.collectionId)
        : undefined,
    ).viewId
  // The first choice holds until the person navigates: a view pinned
  // elsewhere and picked up by a poll never replaces the open one, or an
  // unsaved edit in it.
  const [held, setHeld] = useState<{ scope: string; viewId: string }>()
  const heldHere = held?.scope === scopeKey(scope) ? held.viewId : undefined
  if (viewParam && held) setHeld(undefined)
  if (!viewParam && views.isSuccess && !heldHere)
    setHeld({ scope: scopeKey(scope), viewId: fallback })
  const viewId = viewParam ?? heldHere ?? fallback
  const builtIn = isDefaultView(viewId)
    ? resolveDefaultView(viewId, collectionName)
    : undefined
  const stored = useStoredView(builtIn ? undefined : viewId)
  // Until the scope's views arrive the pinned one is unknown; opening the
  // built-in view first would swap the arrangement a moment later.
  const choosing = !viewParam && views.isPending
  return {
    scope,
    viewId,
    view: choosing ? undefined : (builtIn ?? stored.data?.view),
    revisions: stored.data?.revisions ?? [],
    error: views.error ?? stored.error,
    pending: choosing || (!builtIn && stored.isPending),
    collectionName,
  }
}

/** The workspace routes answer 404 until the Theorem behind this UI has the Index. */
const missingIndex = (error: unknown) =>
  error instanceof TheoremError && error.statusCode === 404

function Status({ title, detail }: { title: string; detail?: string }) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-2 px-6 text-center">
      <p className="font-heading text-[20px] tracking-tight">{title}</p>
      {detail && <p className="max-w-md text-sm text-ink-muted">{detail}</p>}
    </div>
  )
}

/**
 * The revision on screen. It is the one the view opened with, or the one
 * this tab saved; a revision made elsewhere (the improver, another tab, an
 * agent) waits behind a notice, so an arrangement never changes under the
 * person while they are using it.
 */
function useHeldRevision(view: IndexView | undefined) {
  const [held, setHeld] = useState<{ viewId: string; revision: ViewRevision }>()
  if (view && held?.viewId !== view.viewId)
    setHeld({ viewId: view.viewId, revision: view.current })
  const revision =
    held?.viewId === view?.viewId ? held?.revision : view?.current
  return {
    revision,
    newer:
      view && revision && view.current.revision > revision.revision
        ? view.current
        : undefined,
    hold: (next: IndexView) =>
      setHeld({ viewId: next.viewId, revision: next.current }),
  }
}

/** view_opened when a view appears, view_left with how long it was open. */
function useDwell(host: Pick<IndexHost, 'scope' | 'viewId'>) {
  const { scope, viewId } = host
  const key = scopeKey(scope)
  useEffect(() => {
    const opened = Date.now()
    observer().record({ kind: 'view_opened', scope, viewId })
    return () =>
      observer().record({
        kind: 'view_left',
        scope,
        viewId,
        detail: { dwellMs: Date.now() - opened },
      })
    // The scope arrives as a new object each render; its key is its identity.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewId, key])
}

type Dialog = 'edit' | 'history' | undefined

function ViewHeader({
  view,
  revision,
  revisions,
  onSaved,
}: {
  view: IndexView
  revision: ViewRevision
  revisions: ViewRevision[]
  onSaved: (view: IndexView) => void
}) {
  const [dialog, setDialog] = useState<Dialog>()
  const pin = usePinView()
  const archive = useArchiveView()
  const navigate = useIndexNavigate()
  const builtIn = view.origin === 'default'
  const error = pin.error ?? archive.error

  return (
    <header className="flex flex-col gap-1 pb-5">
      <div className="flex items-center gap-2">
        <h1 className="min-w-0 flex-1 truncate font-heading text-[22px] tracking-tight">
          {revision.title}
        </h1>
        <span className="flex shrink-0 items-center">
          {!builtIn && (
            <TooltipIconButton
              tooltip={view.pinned ? 'Unpin' : 'Pin this view'}
              aria-pressed={view.pinned}
              className={cn('size-8 p-2', !view.pinned && 'text-ink-faint')}
              disabled={pin.isPending}
              onClick={() =>
                pin.mutate({ viewId: view.viewId, pinned: !view.pinned })
              }
            >
              <Icon.Pin className="size-4" />
            </TooltipIconButton>
          )}
          {!builtIn && (
            <TooltipIconButton
              tooltip="History"
              className="size-8 p-2"
              onClick={() => setDialog('history')}
            >
              <Icon.History className="size-4" />
            </TooltipIconButton>
          )}
          <TooltipIconButton
            tooltip={builtIn ? 'Customize' : 'Edit'}
            className="size-8 p-2"
            onClick={() => setDialog('edit')}
          >
            <Icon.Edit className="size-4" />
          </TooltipIconButton>
          {!builtIn && (
            <TooltipIconButton
              tooltip={view.archived ? 'Unarchive' : 'Archive'}
              className="size-8 p-2"
              disabled={archive.isPending}
              onClick={() =>
                archive.mutate(
                  { viewId: view.viewId, archived: !view.archived },
                  {
                    onSuccess: (next) => {
                      if (!next.archived) return
                      if (view.scope.kind === 'collection')
                        navigate.openCollection(view.scope.collectionId)
                      else navigate.openHome()
                    },
                  },
                )
              }
            >
              <Icon.Archive className="size-4" />
            </TooltipIconButton>
          )}
        </span>
      </div>
      <p className="text-sm text-ink-muted">{revision.purpose}</p>
      <p className="text-xs text-ink-faint">
        {ORIGIN_TEXT[view.origin]}
        {!builtIn && ` · revision ${revision.revision}`}
        {view.pinned && ' · pinned'}
        {view.archived && ' · archived'}
      </p>
      {error && (
        <p role="alert" className="text-xs text-error-ink">
          {describeError(error)}
        </p>
      )}
      {dialog === 'edit' && (
        <ViewEditor
          view={view}
          revision={revision}
          onClose={() => setDialog(undefined)}
          onSaved={(saved) => {
            setDialog(undefined)
            onSaved(saved)
          }}
        />
      )}
      {dialog === 'history' && (
        <ViewHistory
          view={view}
          revisions={revisions}
          onClose={() => setDialog(undefined)}
          onRestored={(restored) => {
            setDialog(undefined)
            onSaved(restored)
          }}
        />
      )}
    </header>
  )
}

/** The central column: the open view, what Theorem prepared for it, and the view itself. */
function ViewColumn() {
  const open = useOpenView()
  const { item } = useIndexSearch()
  const navigate = useIndexNavigate()
  const ask = useAskTheorem()
  const prefer = useSetPreference()
  const pin = usePinView()
  const { revision, newer, hold } = useHeldRevision(open.view)

  const host: IndexHost = {
    scope: open.scope,
    viewId: open.viewId,
    selectedId: item,
    openItem: (documentId) => {
      observer().record({
        kind: 'item_opened',
        scope: open.scope,
        viewId: open.viewId,
        subjects: [documentId],
      })
      navigate.openItem(documentId)
    },
    openCollection: navigate.openCollection,
    collectionName: open.collectionName,
    record: (event) =>
      observer().record({ ...event, scope: open.scope, viewId: open.viewId }),
  }
  useDwell(host)

  const actions: ViewActions = {
    ask: (prompt, documentIds) =>
      ask(
        prompt,
        documentIds.map((documentId) => ({ documentId })),
      ),
    pin: () => {
      if (open.view && !isDefaultView(open.view.viewId))
        pin.mutate({ viewId: open.view.viewId, pinned: true })
    },
    prefer: (statement, documentIds, value) =>
      prefer.mutate({
        scope: open.scope,
        statement,
        viewId: open.viewId,
        subjects: documentIds.length ? documentIds : undefined,
        value,
      }),
  }

  if (missingIndex(open.error))
    return (
      <Status
        title="The Index is not on this Theorem yet"
        detail="The Theorem this UI talks to does not serve the Index workspace. Chat and documents work as before."
      />
    )
  if (isSignedOut(open.error))
    return <Status title="Sign in to see the Index" />
  if (!open.view || !revision)
    return open.pending ? (
      <div className="flex flex-col gap-3 p-6">
        <Skeleton className="h-7 w-48" />
        <Skeleton className="h-40 w-full" />
      </div>
    ) : (
      <Status
        title="This view is not available"
        detail={open.error ? describeError(open.error) : undefined}
      />
    )

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto flex w-full max-w-4xl flex-col px-6 py-6">
        <ViewHeader
          view={open.view}
          revision={revision}
          revisions={open.revisions}
          onSaved={(saved) => {
            hold(saved)
            if (saved.viewId !== open.viewId)
              navigate.openView(saved.viewId, saved.scope)
          }}
        />
        <ProposalNotices
          scope={open.scope}
          viewId={open.viewId}
          onOpenView={(viewId) => navigate.openView(viewId, open.scope)}
        />
        {newer && (
          <div className="mb-5 flex items-center gap-3 rounded-lg border border-separator bg-raised px-3 py-2 text-sm">
            <p className="min-w-0 flex-1">
              This view has a newer revision.{' '}
              <span className="text-ink-muted">{newer.note}</span>
            </p>
            <Button variant="ghost" size="sm" onClick={() => hold(open.view!)}>
              Show it
            </Button>
          </div>
        )}
        <ViewRenderer definition={revision} host={host} actions={actions} />
        {prefer.error && (
          <p role="alert" className="mt-3 text-xs text-error-ink">
            {describeError(prefer.error)}
          </p>
        )}
      </div>
    </div>
  )
}

function InspectorColumn({ className }: { className?: string }) {
  const { item, scope } = useIndexSearch()
  const navigate = useIndexNavigate()
  if (!item) return null
  return (
    <Inspector
      documentId={item}
      scope={scope}
      onOpen={(documentId) => {
        observer().record({
          kind: 'item_opened',
          scope,
          subjects: [documentId],
        })
        navigate.openItem(documentId)
      }}
      onClose={navigate.closeItem}
      className={className}
    />
  )
}

// Splitview panels render through portals; their content arrives by context.
const PaneContext = createContext<{
  view: ReactNode
  inspector: ReactNode
} | null>(null)
const usePane = () => {
  const panes = useContext(PaneContext)
  if (!panes) throw new Error('Index panes render inside IndexSurface')
  return panes
}

function ViewPane() {
  return <div className="h-full">{usePane().view}</div>
}

function InspectorPane() {
  return (
    <div className="h-full border-s border-separator">
      {usePane().inspector}
    </div>
  )
}

const INSPECTOR = 'inspector'
const paneComponents = { view: ViewPane, [INSPECTOR]: InspectorPane }

/** Desktop: the view and the working pane side by side, the pane resizable and shown when something is selected. */
function DesktopSplit() {
  const { item } = useIndexSearch()
  const [split, setSplit] = useState<SplitviewApi>()

  const onReady = ({ api }: SplitviewReadyEvent) => {
    api.addPanel({
      id: 'view',
      component: 'view',
      minimumSize: 420,
      priority: LayoutPriority.High,
    })
    api.addPanel({
      id: INSPECTOR,
      component: INSPECTOR,
      size: 400,
      minimumSize: 320,
      maximumSize: 720,
      priority: LayoutPriority.Low,
    })
    setSplit(api)
  }

  useEffect(() => {
    split?.getPanel(INSPECTOR)?.api.setVisible(!!item)
  }, [split, item])

  return (
    <SplitviewReact
      className="sheet-split dockview-theme-stone h-full w-full"
      orientation={Orientation.HORIZONTAL}
      proportionalLayout={false}
      components={paneComponents}
      onReady={onReady}
    />
  )
}

/**
 * Index mode: a view of the person's material, composed in OpenUI Lang and
 * run against Theorem with no model in the loop, and a working pane for the
 * selected document. The navigation lives in the context panel.
 */
export function IndexSurface() {
  // The improver composes against the library this build renders.
  useLibraryPublication()
  const desktop = useMediaQuery('(min-width: 1024px)', { noSsr: true })
  const { item } = useIndexSearch()

  if (!desktop)
    return (
      <div className="relative h-full">
        <ViewColumn />
        {item && <InspectorColumn className="absolute inset-0 z-10" />}
      </div>
    )

  return (
    <PaneContext.Provider
      value={{ view: <ViewColumn />, inspector: <InspectorColumn /> }}
    >
      <DesktopSplit />
    </PaneContext.Provider>
  )
}
