// SOURCING: @puckeditor/core 0.24: Render shows a page in use, and Puck with
// its parts (Components, Outline, Preview, Fields) arranges it, the canvas
// in this document rather than an iframe so instances share the page's
// runtime. Pages are files in the vault (store.ts), saved with If-Match.
// DESIGN.md's state grammar: unsaved, saved, conflict, failed and newer
// elsewhere each say so, with the way out beside them.
import { Puck, Render } from '@puckeditor/core'
import type { Data } from '@puckeditor/core'
import '@puckeditor/core/puck.css'
import { Pin, PinOff } from 'lucide-react'
import { useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import type {
  ComponentData,
  LayoutData,
  PageDocument,
} from '@/lib/modules/contract'
import { validateConnections } from '@/lib/modules/connections'
import { prepareLayout, restoreLayout } from '@/lib/modules/layout'
import { moduleById, useModuleCatalog } from '@/lib/modules/registry'
import {
  useInstalledModules,
  usePage,
  useSavePage,
  useVaultClient,
} from '@/lib/modules/store'
import type { LoadedPage } from '@/lib/modules/store'
import { WorkspaceConflictError } from '@/lib/workspace/types'
import type { WorkspaceClient } from '@/lib/workspace/types'
import { cn } from '@/lib/utils'
// For its effect: the built-in modules join the catalog.
import './builtins'
import { ContentRendererContext } from './module-instance'
import { PageRuntimeProvider, PageScopeProvider } from './page-runtime'
import { LAYOUT_TYPES, usePageConfig } from './puck-config'
import type { PageMetadata } from './puck-config'
import { SaveAsModule } from './save-as-module'

export function PageStatus({
  title,
  detail,
}: {
  title: string
  detail?: string
}) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-2 px-6 text-center">
      <p className="font-heading text-[20px] font-medium">{title}</p>
      {detail && <p className="max-w-md text-sm text-ink-muted">{detail}</p>}
    </div>
  )
}

/** The page whose vault entry is `entryId`, in use or being arranged. */
export function PageView({ entryId }: { entryId: string }) {
  const { client, isPending } = useVaultClient()
  if (!client)
    return isPending ? (
      <PageSkeleton />
    ) : (
      <PageStatus
        title="The vault is not open"
        detail="Pages are files in the Theorem vault. Sign in, or open the vault, to see them."
      />
    )
  return <VaultPage client={client} entryId={entryId} />
}

function PageSkeleton() {
  return (
    <div className="flex flex-col gap-3 p-6">
      <Skeleton className="h-7 w-48" />
      <Skeleton className="h-64 w-full" />
    </div>
  )
}

function VaultPage({
  client,
  entryId,
}: {
  client: WorkspaceClient
  entryId: string
}) {
  const modules = useInstalledModules(client)
  const loaded = usePage(client, entryId)
  if (loaded.missing)
    return (
      <PageStatus
        title="This page is not in the vault"
        detail="It may have been deleted, or moved out of the Pages folder."
      />
    )
  if (loaded.error)
    return (
      <PageStatus
        title="This page did not open"
        detail={loaded.error.message}
      />
    )
  if (!loaded.data || modules.isPending) return <PageSkeleton />
  return (
    // One runtime per page: another page, or this one again, starts fresh.
    <PageRuntimeProvider key={entryId}>
      <PageEditor client={client} loaded={loaded.data} reload={loaded.reload} />
    </PageRuntimeProvider>
  )
}

/** The layout as compared for changes: what the file would hold. */
const layoutKey = (layout: LayoutData) =>
  JSON.stringify({
    root: { props: layout.root.props ?? {} },
    content: layout.content,
    ...(layout.zones &&
      Object.keys(layout.zones).length > 0 && { zones: layout.zones }),
  })

const samePage = (a: PageDocument, b: PageDocument) =>
  a.title === b.title &&
  a.pinned === b.pinned &&
  layoutKey(a.layout) === layoutKey(b.layout)

/** A save the vault refused: what was being saved, and what is there now. */
type Conflict = { page: PageDocument; currentHash: string | null }

function PageEditor({
  client,
  loaded,
  reload,
}: {
  client: WorkspaceClient
  loaded: LoadedPage
  reload: () => Promise<{ data?: LoadedPage }>
}) {
  // The revision on screen: the one opened, or the one this view saved.
  const [held, setHeld] = useState({ hash: loaded.hash, page: loaded.page })
  const [draft, setDraft] = useState<PageDocument | null>(null)
  const [arranging, setArranging] = useState(false)
  // A new arrangement session each time Arrange opens, or the page is replaced.
  const [session, setSession] = useState(0)
  const [conflict, setConflict] = useState<Conflict | null>(null)
  const save = useSavePage(client)
  const catalog = useModuleCatalog()
  const config = usePageConfig()

  const shown = draft ?? held.page
  const dirty = !!draft && !samePage(draft, held.page)
  const newer = loaded.hash !== held.hash && !save.isPending

  const lookup = useMemo(
    () => (type: string) => moduleById(type, catalog),
    [catalog],
  )
  const prepared = useMemo(
    () => prepareLayout(shown.layout, lookup, (type) => LAYOUT_TYPES.has(type)),
    [shown.layout, lookup],
  )
  const problems = useMemo(
    () => (arranging ? validateConnections(shown.layout, lookup) : []),
    [arranging, shown.layout, lookup],
  )
  // Arranging starts from the layout as it was when Arrange opened; Puck
  // keeps the working copy from there.
  const [start, setStart] = useState(prepared)

  const commit = (
    page: PageDocument,
    hash: string | null,
    { keepDraft = false }: { keepDraft?: boolean } = {},
  ) =>
    save.mutate(
      { path: loaded.path, page, hash },
      {
        onSuccess: (stored) => {
          setHeld(stored)
          if (!keepDraft) setDraft(null)
          setConflict(null)
        },
        onError: (error) => {
          if (error instanceof WorkspaceConflictError)
            setConflict({ page, currentHash: error.currentHash })
        },
      },
    )

  const replaceWith = (next: { hash: string; page: PageDocument }) => {
    setHeld(next)
    setDraft(null)
    setConflict(null)
    setStart(
      prepareLayout(next.page.layout, lookup, (type) => LAYOUT_TYPES.has(type)),
    )
    setSession((n) => n + 1)
  }
  const takeTheirs = async () => {
    const { data } = await reload()
    if (data) replaceWith(data)
  }

  const renderContent = useMemo(
    () => (content: ComponentData[]) => (
      <Render
        config={config}
        data={{ root: { props: {} }, content } as Partial<Data>}
        metadata={{ arranging } satisfies PageMetadata}
      />
    ),
    [config, arranging],
  )

  const header = (extra?: ReactNode) => (
    <PageHeader
      page={shown}
      arranging={arranging}
      onTitle={(title) => setDraft({ ...shown, title })}
      onArrange={() => {
        setStart(prepared)
        setSession((n) => n + 1)
        setArranging(true)
      }}
      onDone={() => setArranging(false)}
      onPin={() => {
        const pinned = !shown.pinned
        if (draft) setDraft({ ...draft, pinned })
        commit({ ...held.page, pinned }, held.hash, { keepDraft: true })
      }}
      extra={extra}
      status={
        <SaveStatus
          dirty={dirty}
          saving={save.isPending}
          failed={save.error && !conflict ? save.error.message : undefined}
          conflict={!!conflict}
          newer={newer && !conflict}
          problems={problems.length}
          onSave={() => draft && commit(draft, held.hash)}
          onDiscard={() => {
            setDraft(null)
            setStart(
              prepareLayout(held.page.layout, lookup, (type) =>
                LAYOUT_TYPES.has(type),
              ),
            )
            setSession((n) => n + 1)
          }}
          onKeepMine={() =>
            conflict &&
            commit(conflict.page, conflict.currentHash, {
              keepDraft: conflict.page !== draft,
            })
          }
          onTakeTheirs={() => void takeTheirs()}
          onShowNewer={() =>
            replaceWith({ hash: loaded.hash, page: loaded.page })
          }
        />
      }
    />
  )

  if (arranging)
    return (
      <ContentRendererContext.Provider value={renderContent}>
        <PageScopeProvider layout={shown.layout}>
          <Puck
            key={session}
            config={config}
            data={start}
            iframe={{ enabled: false }}
            metadata={{ arranging: true } satisfies PageMetadata}
            onChange={(data) => {
              const layout = restoreLayout(data)
              setDraft((current) => ({ ...(current ?? held.page), layout }))
            }}
          >
            <div className="flex h-full min-h-0 flex-col">
              {header(<SaveAsModule client={client} />)}
              <div className="flex min-h-0 flex-1">
                <aside className="flex w-56 shrink-0 flex-col gap-3 overflow-y-auto border-e border-separator p-2 text-sm">
                  <section>
                    <h2 className="px-1 pb-1 text-xs font-medium text-ink-muted">
                      Add
                    </h2>
                    <Puck.Components />
                  </section>
                  <section>
                    <h2 className="px-1 pb-1 text-xs font-medium text-ink-muted">
                      On this page
                    </h2>
                    <Puck.Outline />
                  </section>
                </aside>
                <main className="min-w-0 flex-1 overflow-auto bg-sheet">
                  <Puck.Preview />
                </main>
                <aside className="w-72 shrink-0 overflow-y-auto border-s border-separator text-sm">
                  <Puck.Fields />
                </aside>
              </div>
            </div>
          </Puck>
        </PageScopeProvider>
      </ContentRendererContext.Provider>
    )

  return (
    <ContentRendererContext.Provider value={renderContent}>
      <div className="flex h-full min-h-0 flex-col">
        {header()}
        <div className="min-h-0 flex-1 overflow-auto">
          {prepared.content.length ? (
            <PageScopeProvider layout={shown.layout}>
              <Render
                config={config}
                data={prepared}
                metadata={{ arranging: false } satisfies PageMetadata}
              />
            </PageScopeProvider>
          ) : (
            <PageStatus
              title="This page is empty"
              detail="Arrange it to place modules, then connect them to each other."
            />
          )}
        </div>
      </div>
    </ContentRendererContext.Provider>
  )
}

function PageHeader({
  page,
  arranging,
  onTitle,
  onArrange,
  onDone,
  onPin,
  status,
  extra,
}: {
  page: PageDocument
  arranging: boolean
  onTitle: (title: string) => void
  onArrange: () => void
  onDone: () => void
  onPin: () => void
  status: ReactNode
  extra?: ReactNode
}) {
  return (
    <header className="flex shrink-0 flex-col gap-1 border-b border-separator px-4 py-2">
      <div className="flex items-center gap-2">
        {arranging ? (
          <input
            aria-label="Page title"
            className="min-w-0 flex-1 rounded-md bg-transparent px-1 font-heading text-[18px] font-medium outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
            value={page.title}
            onChange={(event) => onTitle(event.target.value)}
          />
        ) : (
          <h1 className="min-w-0 flex-1 truncate font-heading text-[18px] font-medium">
            {page.title}
          </h1>
        )}
        {extra}
        <Button
          variant="ghost"
          size="icon-sm"
          aria-pressed={page.pinned}
          aria-label={page.pinned ? 'Unpin' : 'Pin'}
          title={page.pinned ? 'Unpin' : 'Pin to the top of Pages'}
          onClick={onPin}
        >
          {page.pinned ? <PinOff /> : <Pin />}
        </Button>
        {arranging ? (
          <Button variant="outline" size="sm" onClick={onDone}>
            Done
          </Button>
        ) : (
          <Button variant="outline" size="sm" onClick={onArrange}>
            Arrange
          </Button>
        )}
      </div>
      {status}
    </header>
  )
}

function SaveStatus({
  dirty,
  saving,
  failed,
  conflict,
  newer,
  problems,
  onSave,
  onDiscard,
  onKeepMine,
  onTakeTheirs,
  onShowNewer,
}: {
  dirty: boolean
  saving: boolean
  failed?: string
  conflict: boolean
  newer: boolean
  problems: number
  onSave: () => void
  onDiscard: () => void
  onKeepMine: () => void
  onTakeTheirs: () => void
  onShowNewer: () => void
}) {
  let message: string | undefined
  let tone: 'quiet' | 'error' = 'quiet'
  let actions: ReactNode = null
  if (conflict) {
    message = 'This page changed in the vault since you opened it.'
    tone = 'error'
    actions = (
      <>
        <Button variant="ghost" size="xs" onClick={onKeepMine}>
          Keep mine
        </Button>
        <Button variant="ghost" size="xs" onClick={onTakeTheirs}>
          Use the vault's
        </Button>
      </>
    )
  } else if (saving) message = 'Saving…'
  else if (failed) {
    message = `It did not save: ${failed}`
    tone = 'error'
    actions = dirty && (
      <Button variant="ghost" size="xs" onClick={onSave}>
        Try again
      </Button>
    )
  } else if (dirty) {
    message = newer
      ? 'Unsaved changes. The page also changed in the vault.'
      : 'Unsaved changes'
    actions = (
      <>
        <Button variant="ghost" size="xs" onClick={onSave}>
          Save
        </Button>
        <Button variant="ghost" size="xs" onClick={onDiscard}>
          Discard
        </Button>
      </>
    )
  } else if (newer) {
    message = 'A newer version of this page is in the vault.'
    actions = (
      <Button variant="ghost" size="xs" onClick={onShowNewer}>
        Show it
      </Button>
    )
  }
  const issues =
    problems > 0
      ? `${problems} ${problems === 1 ? 'connection needs' : 'connections need'} attention`
      : undefined
  if (!message && !issues) return null
  return (
    <div
      role={tone === 'error' ? 'alert' : 'status'}
      className={cn(
        'flex flex-wrap items-center gap-2 text-xs',
        tone === 'error' ? 'text-error-ink' : 'text-ink-muted',
      )}
    >
      {message && <span>{message}</span>}
      {actions}
      {issues && <span className="text-error-ink">{issues}</span>}
    </div>
  )
}
