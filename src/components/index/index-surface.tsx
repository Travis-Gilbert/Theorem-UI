// SOURCING: TooltipIconButton, ./view-renderer (OpenUI) for the open view, ./proposals, ./view-editor and ./inspector, @tanstack/react-query hooks in ./queries. On the desktop Index mode is a page (src/components/pages/mode-page.tsx) built from these columns as modules; the phone keeps them here, the inspector over the view.
import { useEffect, useRef, useState } from 'react'
import { TooltipIconButton } from '@/components/assistant-ui/elements/tooltip-icon-button'
import { Icon } from '@/components/icons'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { TheoremError } from '@theoremharness/sdk'
import { describeError, isSignedOut } from '@/lib/theorem/client'
import { cn } from '@/lib/utils'
import { scopeKey } from './contract'
import type { IndexView, ViewOrigin, ViewRevision } from './contract'
import { RecordInspector } from '@/components/records/record-inspector'
import { objectTypeByName, parseRecordItemId } from '@/components/records/model'
import { useDataModel } from '@/components/records/queries'
import { Inspector } from './inspector'
import type { IndexHost } from './library'
import { useAskTheorem, useIndexPlace } from './navigation'
import { observer } from './observe'
import {
  dataModelViewId,
  defaultViewFor,
  isDefaultView,
  isWideProgram,
  resolveDefaultView,
  revisionOnScreen,
} from './programs'
import { ProposalNotices } from './proposals'
import {
  useArchiveView,
  useCollections,
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
  const { view: viewParam, scope } = useIndexPlace().search
  const collections = useCollections()
  const views = useViews(scope)
  const dataModel = useDataModel()
  const collectionName = (collectionId: string) =>
    collections.data?.find((c) => c.collectionId === collectionId)?.name
  const objectLabel = (nameSingular: string) =>
    objectTypeByName(dataModel.data, nameSingular)?.label_plural

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
    ? resolveDefaultView(viewId, collectionName, objectLabel)
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
    // A 404 on the list means this Theorem has no Index. A 404 on one view
    // is that view missing, and must not take over this message.
    indexMissing: missingIndex(views.error),
    signedOut: isSignedOut(views.error) || isSignedOut(stored.error),
    error: views.error && !views.data ? views.error : stored.error,
    pending: choosing || (!builtIn && stored.isPending),
    collectionName,
    // Choose again, after this page archived the view it held.
    release: () => setHeld(undefined),
  }
}

/** The workspace routes answer 404 until the Theorem behind this UI has the Index. */
const missingIndex = (error: unknown) =>
  error instanceof TheoremError && error.statusCode === 404

function Status({ title, detail }: { title: string; detail?: string }) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-2 px-6 text-center">
      <p className="font-heading text-[20px] font-medium">{title}</p>
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
  const kept =
    held && view && held.viewId === view.viewId ? held.revision : undefined
  const revision = view ? revisionOnScreen(view, kept) : undefined
  return {
    revision,
    newer:
      view &&
      view.origin !== 'default' &&
      revision &&
      view.current.revision > revision.revision
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
  onArchived,
}: {
  view: IndexView
  revision: ViewRevision
  revisions: ViewRevision[]
  onSaved: (view: IndexView) => void
  onArchived: () => void
}) {
  const [dialog, setDialog] = useState<Dialog>()
  const pin = usePinView()
  const archive = useArchiveView()
  const { navigate } = useIndexPlace()
  const builtIn = view.origin === 'default'
  const error = pin.error ?? archive.error

  return (
    <header className="flex flex-col gap-1 pb-5">
      <div className="flex items-center gap-2">
        <h1 className="min-w-0 flex-1 truncate font-heading text-[22px] font-medium">
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
                      onArchived()
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

/**
 * The central column: the open view, what Theorem prepared for it, and the
 * view itself, at the place provided (IndexPlaceContext).
 */
export function ViewColumn() {
  const open = useOpenView()
  const {
    search: { item },
    navigate,
  } = useIndexPlace()
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
    openView: (viewId) => navigate.openView(viewId, open.scope),
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

  if (open.indexMissing)
    return (
      <Status
        title="The Index is not on this Theorem yet"
        detail="The Theorem this UI talks to does not serve the Index workspace. Chat and documents work as before."
      />
    )
  if (open.signedOut) return <Status title="Sign in to see the Index" />
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
      <div
        className={cn(
          'mx-auto flex w-full flex-col px-6 py-6',
          isWideProgram(revision.program) ? 'max-w-none' : 'max-w-4xl',
        )}
      >
        {/* Keyed so an editor's draft never carries over to another view. */}
        <ViewHeader
          key={open.view.viewId}
          view={open.view}
          revision={revision}
          revisions={open.revisions}
          onSaved={(saved) => {
            hold(saved)
            if (saved.viewId !== open.viewId)
              navigate.openView(saved.viewId, saved.scope)
          }}
          onArchived={open.release}
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

/** The working pane for the place's open item, document or record. */
export function InspectorColumn({ className }: { className?: string }) {
  const {
    search: { item, scope },
    navigate,
  } = useIndexPlace()
  if (!item) return null
  const record = parseRecordItemId(item)
  if (record)
    return (
      <RecordInspector
        key={item}
        nameSingular={record.nameSingular}
        recordId={record.recordId}
        onOpenRecord={(nameSingular, recordId) => {
          const opened = `record:${nameSingular}/${recordId}`
          observer().record({ kind: 'item_opened', scope, subjects: [opened] })
          navigate.openItem(opened)
        }}
        onEditFields={(nameSingular) =>
          navigate.openView(dataModelViewId(nameSingular), scope)
        }
        onClose={navigate.closeItem}
        className={className}
      />
    )
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
/**
 * Below the desktop width the inspector covers the view. The view stays
 * mounted, so it has to leave the tab order and the keyboard, the way Theia
 * and the Vault do when they cover the sheet.
 */
export function PhoneIndex() {
  const { item } = useIndexPlace().search
  const opener = useRef<HTMLElement | null>(null)
  useEffect(() => {
    if (!item) {
      const back = opener.current
      opener.current = null
      if (back?.isConnected) back.focus()
      return
    }
    if (opener.current) return
    const active = document.activeElement
    if (active instanceof HTMLElement) opener.current = active
    document.querySelector<HTMLElement>('[data-index-close]')?.focus()
  }, [item])

  return (
    <div className="relative h-full">
      <div inert={!!item} className="h-full">
        <ViewColumn />
      </div>
      {item && <InspectorColumn className="absolute inset-0 z-10" />}
    </div>
  )
}
