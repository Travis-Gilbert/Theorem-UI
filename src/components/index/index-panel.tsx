// SOURCING: the thread list's search field (ThreadListSearch), ui/dialog over Base UI Dialog (new collection), Base UI Popover + Switch (what Theorem may change by itself), @tanstack/react-query hooks in ./queries for collections, views, search and policy
import { Popover } from '@base-ui/react/popover'
import { Switch } from '@base-ui/react/switch'
import { useEffect, useState } from 'react'
import type { FormEvent, ReactNode } from 'react'
import { ThreadListSearch } from '@/components/assistant-ui/elements/thread-list.aui'
import { TooltipIconButton } from '@/components/assistant-ui/elements/tooltip-icon-button'
import { Icon } from '@/components/icons'
import { menuPopup } from '@/components/shell/sidebar'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { describeError } from '@/lib/theorem/client'
import { cn } from '@/lib/utils'
import type { IndexPolicy, IndexView, Scope } from './contract'
import { sameScope } from './contract'
import { useIndexNavigate, useIndexSearch } from './navigation'
import { observer } from './observe'
import { ATLAS_VIEW_ID } from './programs'
import {
  useBinding,
  useCollections,
  useCreateCollection,
  usePolicy,
  useViews,
  useWritePolicy,
} from './queries'

const row =
  'group relative flex h-7 w-full items-center gap-2 rounded-md px-2 text-start text-sm transition-colors duration-100 outline-none hover:bg-hover focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-focus data-active:bg-pill data-active:shadow-pill'

function Row({
  active,
  onClick,
  children,
  trailing,
}: {
  active?: boolean
  onClick: () => void
  children: ReactNode
  trailing?: ReactNode
}) {
  return (
    <button
      type="button"
      className={row}
      data-active={active || undefined}
      aria-current={active || undefined}
      onClick={onClick}
    >
      <span className="min-w-0 flex-1 truncate">{children}</span>
      {trailing && (
        <span className="shrink-0 text-[11px] text-ink-faint-sheet tabular-nums">
          {trailing}
        </span>
      )}
    </button>
  )
}

function Heading({
  children,
  action,
}: {
  children: ReactNode
  action?: ReactNode
}) {
  return (
    <div className="flex h-7 items-center px-2 pt-3 pb-1">
      <h2 className="min-w-0 flex-1 text-xs text-ink-faint-sheet">
        {children}
      </h2>
      {action}
    </div>
  )
}

/** Exact search over everything filed; it works before any embedding exists. */
function QuickSearch({ scope }: { scope: Scope }) {
  const [text, setText] = useState('')
  const [q, setQ] = useState('')
  useEffect(() => {
    const timer = setTimeout(() => setQ(text.trim()), 250)
    return () => clearTimeout(timer)
  }, [text])
  const found = useBinding(
    q ? { kind: 'items', query: { q, limit: 6 } } : undefined,
  )
  const navigate = useIndexNavigate()
  const items = found.data?.kind === 'items' ? found.data.items : []

  return (
    <div className="flex flex-col gap-px">
      <ThreadListSearch
        value={text}
        onValueChange={setText}
        aria-label="Search the Index"
        placeholder="Search the Index"
      />
      {q && (
        <div className="flex flex-col pt-1">
          {items.map((item) => (
            <Row
              key={item.documentId}
              onClick={() => {
                observer().record({
                  kind: 'item_opened',
                  scope,
                  subjects: [item.documentId],
                  detail: { from: 'panel_search' },
                })
                navigate.openItem(item.documentId)
              }}
              trailing={item.documentKind}
            >
              {item.title}
            </Row>
          ))}
          {!found.isPending && !items.length && (
            <p className="px-2 py-1.5 text-sm text-ink-faint-sheet">
              No matches.
            </p>
          )}
        </div>
      )}
    </div>
  )
}

function NewCollectionDialog({
  open,
  onOpenChange,
  onCreated,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  onCreated: (collectionId: string) => void
}) {
  const create = useCreateCollection()
  const [name, setName] = useState('')
  const submit = (event: FormEvent) => {
    event.preventDefault()
    const next = name.trim()
    if (!next) return
    create.mutate(next, {
      onSuccess: ({ collectionId }) => {
        setName('')
        onOpenChange(false)
        onCreated(collectionId)
      },
    })
  }
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <form onSubmit={submit} className="flex flex-col gap-4">
          <DialogHeader>
            <DialogTitle className="font-heading text-lg font-normal tracking-tight">
              New collection
            </DialogTitle>
            <DialogDescription>
              Theorem files into collections and learns from where you move
              things.
            </DialogDescription>
          </DialogHeader>
          <Input
            autoFocus
            aria-label="Collection name"
            placeholder="Collection name"
            value={name}
            onChange={(event) => setName(event.target.value)}
          />
          {create.error && (
            <p role="alert" className="text-sm text-error-ink">
              {describeError(create.error)}
            </p>
          )}
          <DialogFooter>
            <Button
              type="submit"
              disabled={!name.trim() || create.isPending}
              className="bg-redwood text-on-redwood hover:bg-redwood-hover"
            >
              Create
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

function PolicySwitch({
  label,
  detail,
  checked,
  onChange,
  disabled,
}: {
  label: string
  detail: string
  checked: boolean
  onChange: (checked: boolean) => void
  disabled?: boolean
}) {
  return (
    <label className="flex items-start gap-3 py-1.5">
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="text-sm">{label}</span>
        <span className="text-xs text-ink-muted">{detail}</span>
      </span>
      <Switch.Root
        checked={checked}
        onCheckedChange={onChange}
        disabled={disabled}
        className="relative mt-0.5 flex h-5 w-9 shrink-0 rounded-full bg-ink/15 p-0.5 transition-colors duration-150 outline-none focus-visible:outline-2 focus-visible:outline-focus data-checked:bg-teal data-disabled:opacity-50"
      >
        <Switch.Thumb className="size-4 rounded-full bg-white shadow-sm transition-transform duration-150 data-checked:translate-x-4" />
      </Switch.Root>
    </label>
  )
}

/** What Theorem may change on its own. Everything it changes can be reverted. */
function PolicyMenu() {
  const policy = usePolicy()
  const write = useWritePolicy()
  if (!policy.data) return null
  const set = (autoApply: Partial<IndexPolicy['autoApply']>) =>
    write.mutate({
      ...policy.data,
      autoApply: { ...policy.data.autoApply, ...autoApply },
    })
  return (
    <Popover.Root>
      <Popover.Trigger
        render={
          <TooltipIconButton
            tooltip="What Theorem may change"
            className="size-7 p-1.5"
          />
        }
      >
        <Icon.Settings className="size-4" />
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Positioner
          side="bottom"
          align="end"
          sideOffset={4}
          className="z-50"
        >
          <Popover.Popup className={cn('w-72 p-3', menuPopup)}>
            <Popover.Title className="text-sm font-medium">
              What Theorem may change by itself
            </Popover.Title>
            <Popover.Description className="pb-2 text-xs text-ink-muted">
              Theorem watches how you use the Index and prepares views in the
              background. It never touches a pinned view or one you made, and
              anything it adds can be reverted.
            </Popover.Description>
            <PolicySwitch
              label="Add new views"
              detail="Otherwise new views wait for your review."
              checked={policy.data.autoApply.newViews}
              disabled={write.isPending}
              onChange={(newViews) => set({ newViews })}
            />
            <PolicySwitch
              label="Improve its own views"
              detail="Revise views Theorem made that you have not pinned."
              checked={policy.data.autoApply.reviseImproverViews}
              disabled={write.isPending}
              onChange={(reviseImproverViews) => set({ reviseImproverViews })}
            />
            {write.error && (
              <p role="alert" className="pt-1 text-xs text-error-ink">
                {describeError(write.error)}
              </p>
            )}
          </Popover.Popup>
        </Popover.Positioner>
      </Popover.Portal>
    </Popover.Root>
  )
}

/** The scope's saved views, pinned first, then the ones Theorem prepared. */
function ViewList({
  scope,
  activeViewId,
  archived,
}: {
  scope: Scope
  activeViewId: string | undefined
  archived: boolean
}) {
  const views = useViews(scope, archived)
  const navigate = useIndexNavigate()
  const list = [...(views.data ?? [])].sort(
    (a, b) =>
      Number(b.pinned) - Number(a.pinned) || b.updatedAtMs - a.updatedAtMs,
  )
  const mine = list.filter((v) => v.origin !== 'improver')
  const prepared = list.filter((v) => v.origin === 'improver')
  const rows = (group: IndexView[]) =>
    group.map((view) => (
      <Row
        key={view.viewId}
        active={view.viewId === activeViewId}
        onClick={() => navigate.openView(view.viewId, view.scope)}
        trailing={view.pinned ? <Icon.Pin className="size-3" /> : undefined}
      >
        {view.current.title}
      </Row>
    ))
  if (!list.length) return null
  return (
    <>
      {mine.length > 0 && (
        <>
          <Heading>{archived ? 'Archived views' : 'Views'}</Heading>
          {rows(mine)}
        </>
      )}
      {prepared.length > 0 && (
        <>
          <Heading>
            {archived ? 'Archived, prepared by Theorem' : 'Prepared by Theorem'}
          </Heading>
          {rows(prepared)}
        </>
      )}
    </>
  )
}

/** Index mode's panel: search, the scopes (everything, the Atlas, collections) and the views of the open scope. */
export function IndexPanel() {
  const { view, scope } = useIndexSearch()
  const navigate = useIndexNavigate()
  const collections = useCollections()
  const [creating, setCreating] = useState(false)
  const [archived, setArchived] = useState(false)
  const home: Scope = { kind: 'home' }
  const atHome = sameScope(scope, home)

  return (
    <div className="flex h-full flex-col">
      <div className="flex h-12 shrink-0 items-center gap-1 ps-3.5 pe-1.5">
        <span className="min-w-0 flex-1 text-sm font-medium">Index</span>
        <PolicyMenu />
      </div>
      <div className="shrink-0 px-2 pb-1">
        <QuickSearch scope={scope} />
      </div>
      <nav
        aria-label="Index"
        className="flex min-h-0 flex-1 flex-col overflow-y-auto px-2 pb-3"
      >
        <Row active={atHome && !view} onClick={navigate.openHome}>
          Everything
        </Row>
        <Row
          active={view === ATLAS_VIEW_ID}
          onClick={() => navigate.openView(ATLAS_VIEW_ID, home)}
        >
          Atlas
        </Row>
        <Heading
          action={
            <TooltipIconButton
              tooltip="New collection"
              className="size-6 p-1"
              onClick={() => setCreating(true)}
            >
              <Icon.Add className="size-3.5" />
            </TooltipIconButton>
          }
        >
          Collections
        </Heading>
        {collections.error ? (
          <p className="px-2 py-1 text-sm text-ink-faint-sheet">
            {describeError(collections.error)}
          </p>
        ) : (
          collections.data?.map((collection) => (
            <Row
              key={collection.collectionId}
              active={
                scope.kind === 'collection' &&
                scope.collectionId === collection.collectionId &&
                !view
              }
              onClick={() => navigate.openCollection(collection.collectionId)}
              trailing={collection.documentCount}
            >
              {collection.name}
            </Row>
          ))
        )}
        <ViewList scope={scope} activeViewId={view} archived={false} />
        {archived && <ViewList scope={scope} activeViewId={view} archived />}
        <button
          type="button"
          onClick={() => setArchived((shown) => !shown)}
          className="mt-3 flex h-7 items-center rounded-md px-2 text-start text-sm text-ink-faint-sheet transition-colors duration-100 outline-none hover:bg-hover hover:text-ink focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-focus"
        >
          {archived ? 'Hide archived views' : 'Show archived views'}
        </button>
      </nav>
      <NewCollectionDialog
        open={creating}
        onOpenChange={setCreating}
        onCreated={navigate.openCollection}
      />
    </div>
  )
}
