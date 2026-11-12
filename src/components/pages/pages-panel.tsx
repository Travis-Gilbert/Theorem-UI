// SOURCING: @tanstack/react-router (a page is /pages/$pageId, by its vault
// entry id, which a rename keeps; a mode's page is /pages/mode:<mode>), the
// Index panel's row and heading grammar, ui/dialog over Base UI Dialog (new
// page from a template, new module), the module store (pages, templates and
// modules are vault files) and the grants store, and openWorkspaceFile for a
// module's own files.
import { useNavigate, useParams } from '@tanstack/react-router'
import { useState } from 'react'
import type { FormEvent, ReactNode } from 'react'
import { TooltipIconButton } from '@/components/assistant-ui/elements/tooltip-icon-button'
import { Icon } from '@/components/icons'
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
import { useWorkTracker } from '@/components/work/settings'
import { grantKey, useModuleGrants } from '@/lib/modules/grants'
import { useModuleCatalog } from '@/lib/modules/registry'
import type { ModuleDefinition } from '@/lib/modules/registry'
import {
  newModuleId,
  useCreateModule,
  useCreatePage,
  useInstalledModules,
  usePages,
  useVaultClient,
  useVaultTemplates,
} from '@/lib/modules/store'
import type { PageListing } from '@/lib/modules/store'
import {
  BUILTIN_TEMPLATES,
  MODE_PAGES,
  modePagePath,
} from '@/lib/modules/templates'
import type { PageMode, PageTemplate } from '@/lib/modules/templates'
import { templateOffered } from '@/lib/modules/work-templates'
import { cn } from '@/lib/utils'
import { openWorkspaceFile } from '@/lib/workspace/open'
import type { WorkspaceClient } from '@/lib/workspace/types'
import { useWorkspaceTree } from '@/lib/workspace/workspaces'
// For its effect: the built-in modules join the catalog.
import './builtins'

const row =
  'group relative flex h-7 w-full items-center gap-2 rounded-md px-2 text-start text-sm transition-colors duration-100 outline-none hover:bg-hover focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-focus data-active:bg-pill data-active:shadow-pill'

const primary = 'bg-redwood text-on-redwood hover:bg-redwood-hover'

/** The code editor, so a module's page opens to be written, not run. */
const SOURCE_HANDLER = 'code'

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

const Note = ({ children }: { children: ReactNode }) => (
  <p className="px-2 py-1 text-sm text-ink-faint-sheet">{children}</p>
)

/** Pinned first, then by title; a page that did not parse sorts by its path. */
const pageOrder = (a: PageListing, b: PageListing) =>
  Number(!!b.page?.pinned) - Number(!!a.page?.pinned) ||
  (a.page?.title ?? a.entry.path).localeCompare(b.page?.title ?? b.entry.path)

/** The navigator in Pages mode: the vault's pages, then its modules. */
export function PagesPanel() {
  const { client, isPending, missing } = useVaultClient()
  return (
    <div className="flex h-full flex-col">
      <div className="flex h-12 shrink-0 items-center px-3">
        <p className="font-heading text-[15px] font-medium">Pages</p>
      </div>
      <nav
        aria-label="Pages"
        className="min-h-0 flex-1 overflow-y-auto px-2 pb-3"
      >
        {client ? (
          <VaultLists client={client} />
        ) : (
          <Note>
            {isPending
              ? 'Opening the vault…'
              : `Pages and modules are files in the Theorem vault. ${missing}`}
          </Note>
        )}
      </nav>
    </div>
  )
}

function VaultLists({ client }: { client: WorkspaceClient }) {
  const navigate = useNavigate()
  const { pageId } = useParams({ strict: false })
  const { pages, isPending } = usePages(client)
  const [creating, setCreating] = useState<'page' | 'module' | null>(null)
  const sorted = [...pages].sort(pageOrder)
  return (
    <>
      <Heading
        action={
          <TooltipIconButton
            tooltip="New page"
            className="size-6 p-1"
            onClick={() => setCreating('page')}
          >
            <Icon.Add className="size-3.5" />
          </TooltipIconButton>
        }
      >
        Pages
      </Heading>
      {isPending ? (
        <Note>Reading the vault…</Note>
      ) : sorted.length === 0 ? (
        <Note>No pages yet. A page holds modules you arrange and connect.</Note>
      ) : (
        sorted.map(({ entry, page, error }) => {
          const active = entry.id === pageId
          return (
            <button
              key={entry.id}
              type="button"
              className={row}
              data-active={active || undefined}
              aria-current={active ? 'page' : undefined}
              title={error ? `${entry.path}: ${error}` : entry.path}
              onClick={() =>
                void navigate({
                  to: '/pages/$pageId',
                  params: { pageId: entry.id },
                })
              }
            >
              <span className="min-w-0 flex-1 truncate">
                {page?.title ?? entry.path.split('/').pop()}
              </span>
              {page?.pinned && (
                <span className="shrink-0 text-[11px] text-ink-faint-sheet">
                  Pinned
                </span>
              )}
              {error && (
                <span className="shrink-0 text-[11px] text-error-ink">
                  Unreadable
                </span>
              )}
            </button>
          )
        })
      )}
      <ModeList client={client} pageId={pageId} />
      <ModuleLibrary client={client} onNew={() => setCreating('module')} />
      <NewPageDialog
        client={client}
        open={creating === 'page'}
        onOpenChange={(open) => setCreating(open ? 'page' : null)}
        onCreated={(entryId) =>
          void navigate({ to: '/pages/$pageId', params: { pageId: entryId } })
        }
      />
      <NewModuleDialog
        client={client}
        open={creating === 'module'}
        onOpenChange={(open) => setCreating(open ? 'module' : null)}
      />
    </>
  )
}

/** The id a mode's page has in the Pages route. */
export const modePageId = (mode: PageMode) => `mode:${mode}`

/**
 * The modes that are pages. Each opens here to be arranged; the mode itself
 * shows it in use, from the vault's Modes folder or else its template.
 */
function ModeList({
  client,
  pageId,
}: {
  client: WorkspaceClient
  pageId: string | undefined
}) {
  const navigate = useNavigate()
  const tree = useWorkspaceTree(client)
  const kept = new Set((tree.data ?? []).map((e) => e.path))
  return (
    <>
      <Heading>Modes</Heading>
      {(Object.keys(MODE_PAGES) as PageMode[]).map((mode) => {
        const id = modePageId(mode)
        const active = id === pageId
        return (
          <button
            key={mode}
            type="button"
            className={row}
            data-active={active || undefined}
            aria-current={active ? 'page' : undefined}
            title={modePagePath(mode)}
            onClick={() =>
              void navigate({ to: '/pages/$pageId', params: { pageId: id } })
            }
          >
            <span className="min-w-0 flex-1 truncate">
              {MODE_PAGES[mode].title}
            </span>
            <span className="shrink-0 text-[11px] text-ink-faint-sheet">
              {kept.has(modePagePath(mode)) ? 'Arranged' : 'Built in'}
            </span>
          </button>
        )
      })}
    </>
  )
}

/**
 * What can be placed on a page: the built-ins, the vault's own modules and
 * the composites saved from pages, with the files that did not read and
 * what each sandboxed module has been allowed.
 */
function ModuleLibrary({
  client,
  onNew,
}: {
  client: WorkspaceClient
  onNew: () => void
}) {
  const installed = useInstalledModules(client)
  const catalog = useModuleCatalog()
  const vault = catalog.installed
  return (
    <>
      <Heading
        action={
          <TooltipIconButton
            tooltip="New module"
            className="size-6 p-1"
            onClick={onNew}
          >
            <Icon.Add className="size-3.5" />
          </TooltipIconButton>
        }
      >
        Modules
      </Heading>
      <p className="px-2 pb-1 text-xs text-ink-faint-sheet">
        {catalog.builtins.length} built in
        {vault.length > 0 && `, ${vault.length} in the vault`}
      </p>
      {installed.isPending && <Note>Reading the Modules folder…</Note>}
      {vault.map((definition) => (
        <ModuleRow
          key={definition.id}
          client={client}
          definition={definition}
        />
      ))}
      {catalog.problems.map((problem) => (
        <button
          key={problem.path}
          type="button"
          className={row}
          title={problem.message}
          onClick={() =>
            openWorkspaceFile({
              workspaceId: client.workspace.id,
              path: problem.path,
            })
          }
        >
          <span className="min-w-0 flex-1 truncate">{problem.path}</span>
          <span className="shrink-0 text-[11px] text-error-ink">
            Not loaded
          </span>
        </button>
      ))}
    </>
  )
}

function ModuleRow({
  client,
  definition,
}: {
  client: WorkspaceClient
  definition: ModuleDefinition
}) {
  const key = grantKey(client.workspace.id, definition.id)
  const grant = useModuleGrants((s) => s.grants[key])
  const revoke = useModuleGrants((s) => s.revoke)
  const { implementation } = definition
  // A sandboxed module opens at its page, as source to edit, rather than in
  // the viewer that would run it; a composite opens at its manifest.
  const sandboxed = implementation.kind === 'sandboxed-html'
  const file = sandboxed
    ? `${implementation.folder}/${implementation.entry}`
    : definition.path
  return (
    <div className="group flex items-center gap-1">
      <button
        type="button"
        className={row}
        title={definition.description ?? definition.id}
        disabled={!file}
        onClick={() =>
          file &&
          openWorkspaceFile({
            workspaceId: client.workspace.id,
            path: file,
            ...(sandboxed && { handler: SOURCE_HANDLER }),
          })
        }
      >
        <span className="min-w-0 flex-1 truncate">{definition.label}</span>
        <span className="shrink-0 text-[11px] text-ink-faint-sheet">
          {implementation.kind === 'composite'
            ? 'Made from modules'
            : 'Sandboxed'}
        </span>
      </button>
      {grant && (
        <Button
          variant="ghost"
          size="xs"
          className="shrink-0"
          title="It asks again before it next runs"
          onClick={() => revoke(key)}
        >
          Revoke
        </Button>
      )}
    </div>
  )
}

const BLANK = 'blank'

function NewPageDialog({
  client,
  open,
  onOpenChange,
  onCreated,
}: {
  client: WorkspaceClient
  open: boolean
  onOpenChange: (open: boolean) => void
  onCreated: (entryId: string) => void
}) {
  const create = useCreatePage(client)
  const saved = useVaultTemplates(client)
  const [title, setTitle] = useState('')
  const [chosen, setChosen] = useState(BLANK)
  const tracker = useWorkTracker()
  const offered = {
    work: tracker.state === 'on',
    github: tracker.state === 'on' && tracker.github,
  }
  const templates: PageTemplate[] = [
    ...BUILTIN_TEMPLATES.filter((t) => templateOffered(t, offered)),
    ...saved.templates,
  ]
  const template = templates.find((t) => t.id === chosen)
  const submit = (event: FormEvent) => {
    event.preventDefault()
    const next = title.trim()
    if (!next) return
    create.mutate(
      { title: next, template },
      {
        onSuccess: (entry) => {
          setTitle('')
          setChosen(BLANK)
          onOpenChange(false)
          onCreated(entry.id)
        },
      },
    )
  }
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <form onSubmit={submit} className="flex flex-col gap-4">
          <DialogHeader>
            <DialogTitle className="font-heading text-lg font-semibold">
              New page
            </DialogTitle>
            <DialogDescription>
              A page is a file in the vault's Pages folder. Start it blank or
              from a template, then arrange it to place modules and connect
              them.
            </DialogDescription>
          </DialogHeader>
          <Input
            autoFocus
            aria-label="Page title"
            placeholder="Page title"
            maxLength={120}
            value={title}
            onChange={(event) => setTitle(event.target.value)}
          />
          <fieldset className="flex flex-col gap-1">
            <legend className="pb-1 text-xs text-ink-muted">Start from</legend>
            <TemplateChoice
              value={BLANK}
              chosen={chosen}
              onChoose={setChosen}
              title="Blank"
              description="Nothing placed yet."
            />
            {templates.map((t) => (
              <TemplateChoice
                key={t.id}
                value={t.id}
                chosen={chosen}
                onChoose={setChosen}
                title={t.title}
                description={
                  t.origin === 'vault'
                    ? `Yours, from ${t.id}`
                    : (t.description ?? '')
                }
              />
            ))}
          </fieldset>
          {create.error && (
            <p role="alert" className="text-sm text-error-ink">
              {create.error.message}
            </p>
          )}
          <DialogFooter>
            <Button
              type="submit"
              disabled={!title.trim() || create.isPending}
              className={primary}
            >
              Create
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

function TemplateChoice({
  value,
  chosen,
  onChoose,
  title,
  description,
}: {
  value: string
  chosen: string
  onChoose: (value: string) => void
  title: string
  description: string
}) {
  const selected = value === chosen
  return (
    <label
      className={cn(
        'flex cursor-pointer items-start gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-hover has-focus-visible:outline-2 has-focus-visible:outline-focus',
        selected && 'bg-raised',
      )}
    >
      <input
        type="radio"
        name="template"
        value={value}
        checked={selected}
        onChange={() => onChoose(value)}
        className="mt-1 accent-redwood"
      />
      <span className="flex min-w-0 flex-col">
        <span className="font-medium">{title}</span>
        {description && (
          <span className="text-xs text-ink-muted">{description}</span>
        )}
      </span>
    </label>
  )
}

/**
 * A new sandboxed module from the starter: a manifest and a page in their
 * own folder under Modules, opened so it can be written.
 */
function NewModuleDialog({
  client,
  open,
  onOpenChange,
}: {
  client: WorkspaceClient
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const create = useCreateModule(client)
  const catalog = useModuleCatalog()
  const [label, setLabel] = useState('')
  const submit = (event: FormEvent) => {
    event.preventDefault()
    const name = label.trim()
    if (!name) return
    const taken = new Set(
      [...catalog.builtins, ...catalog.installed].map((m) => m.id),
    )
    create.mutate(
      { label: name, id: newModuleId(name, taken) },
      {
        onSuccess: ({ folder }) => {
          setLabel('')
          onOpenChange(false)
          openWorkspaceFile({
            workspaceId: client.workspace.id,
            path: `${folder}/index.html`,
            handler: SOURCE_HANDLER,
          })
        },
      },
    )
  }
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <form onSubmit={submit} className="flex flex-col gap-4">
          <DialogHeader>
            <DialogTitle className="font-heading text-lg font-semibold">
              New module
            </DialogTitle>
            <DialogDescription>
              A module of your own: an HTML page and a manifest in the vault's
              Modules folder. It runs in a sandbox and reaches only what you
              allow it.
            </DialogDescription>
          </DialogHeader>
          <Input
            autoFocus
            aria-label="Module name"
            placeholder="Module name"
            value={label}
            onChange={(event) => setLabel(event.target.value)}
          />
          {create.error && (
            <p role="alert" className="text-sm text-error-ink">
              {create.error.message}
            </p>
          )}
          <DialogFooter>
            <Button
              type="submit"
              disabled={!label.trim() || create.isPending}
              className={primary}
            >
              Create
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
