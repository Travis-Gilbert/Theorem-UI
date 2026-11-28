// SOURCING: after the owner's Capacities sidebar (Pinned, Object Types with coloured icon tiles and counts, + New) and Craft web's All Docs navigation (Mobbin f707841e-dcd8-4c1d-82cb-e69a6d232e48); the Notes panel's own row and section heading grammar (notes-panel.tsx), with the fold kept per device in zustand persist like the panel's other choices; classes from the schema register (register.ts), pin/hide/order from prefs.ts, collections from collections.ts, the pane opened through the workspace store
import { ChevronRight } from 'lucide-react'
import { useState } from 'react'
import type { ReactNode } from 'react'
import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { Icon } from '@/components/icons'
import {
  paneId,
  useNotesWorkspace,
} from '@/components/notes/notes-workspace-state'
import type { PaneSpec } from '@/components/notes/notes-workspace-state'
import { describeError } from '@/lib/theorem/client'
import type { ObjectClass } from '@/lib/objects/classes'
import { useCollections } from '@/lib/objects/collections'
import { useDocumentObjects } from '@/lib/objects/library'
import {
  orderedClasses,
  pinnedClasses,
  useClassPrefs,
} from '@/lib/objects/prefs'
import { useClassRegistry } from '@/lib/objects/register'
import { cn } from '@/lib/utils'
import { ClassIcon } from './class-icon'
import { openPane } from './object-actions'

const row =
  'group relative flex h-7 w-full items-center gap-2 rounded-md px-2 text-start text-sm transition-colors duration-100 outline-none hover:bg-hover focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-focus data-active:bg-pill data-active:shadow-pill'
const headingText = 'text-[14.5px] font-semibold'

const useFolds = create<{ folded: string[]; toggle: (id: string) => void }>()(
  persist(
    (set) => ({
      folded: [],
      toggle: (id) =>
        set((s) => ({
          folded: s.folded.includes(id)
            ? s.folded.filter((x) => x !== id)
            : [...s.folded, id],
        })),
    }),
    { name: 'theorem-ui:notes-object-nav' },
  ),
)

function Section({
  id,
  name,
  action,
  children,
}: {
  id: string
  name: string
  action?: ReactNode
  children: ReactNode
}) {
  const { folded, toggle } = useFolds()
  const open = !folded.includes(id)
  return (
    <section aria-label={name} className="pt-3 first:pt-0">
      <h3 className="group/heading flex h-7 items-center px-2">
        <button
          type="button"
          aria-expanded={open}
          onClick={() => toggle(id)}
          className={`group/section flex min-w-0 flex-1 items-center gap-1 rounded-sm text-start ${headingText} outline-none focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-focus`}
        >
          <span className="min-w-0 truncate">{name}</span>
          <ChevronRight
            aria-hidden="true"
            className={cn(
              'size-3.5 shrink-0 text-ink-faint transition-[rotate,opacity] duration-150',
              open
                ? 'rotate-90 opacity-0 group-hover/section:opacity-100 group-focus-visible/section:opacity-100'
                : 'opacity-100',
            )}
          />
        </button>
        {action}
      </h3>
      {open && <div className="flex flex-col">{children}</div>}
    </section>
  )
}

const HeadingAdd = ({
  label,
  onClick,
}: {
  label: string
  onClick: () => void
}) => (
  <button
    type="button"
    aria-label={label}
    onClick={onClick}
    className="flex size-6 items-center justify-center rounded-md text-ink-faint opacity-0 outline-none group-hover/heading:opacity-100 hover:bg-hover hover:text-ink focus-visible:opacity-100 focus-visible:outline-2 focus-visible:outline-focus"
  >
    <Icon.Add className="size-3.5" />
  </button>
)

function PaneRow({
  spec,
  icon,
  label,
  count,
  active,
}: {
  spec: PaneSpec
  icon: ReactNode
  label: string
  count?: number
  active: string | undefined
}) {
  return (
    <button
      type="button"
      className={row}
      data-active={active === paneId(spec) || undefined}
      aria-current={active === paneId(spec) ? 'page' : undefined}
      onClick={(event) => openPane(spec, event.metaKey || event.ctrlKey)}
    >
      {icon}
      <span className="min-w-0 flex-1 truncate">{label}</span>
      {count !== undefined && (
        <span className="text-xs text-ink-faint tabular-nums">{count}</span>
      )}
    </button>
  )
}

/**
 * The object model in the Notes navigator: everything, the graph, what the
 * person pinned, every class the register declares, and their collections.
 * Folders and notes follow it, as they were.
 */
export function ObjectNav() {
  const { registry, model } = useClassRegistry()
  const prefs = useClassPrefs()
  const documents = useDocumentObjects(registry)
  const collections = useCollections(registry)
  const active = useNotesWorkspace((s) => s.active)
  const [naming, setNaming] = useState(false)

  const documentCount = new Map<string, number>()
  for (const entry of documents.entries)
    documentCount.set(entry.cls.id, (documentCount.get(entry.cls.id) ?? 0) + 1)
  const countOf = (cls: ObjectClass) =>
    (cls.native ? documentCount.get(cls.id) : cls.type.record_count) ?? 0
  const classes = orderedClasses(registry, prefs.order).filter(
    (cls) => !prefs.hidden.includes(cls.id),
  )
  const pinned = pinnedClasses(registry, prefs.pinned)
  const classRow = (cls: ObjectClass) => (
    <PaneRow
      key={cls.id}
      spec={{ kind: 'library', key: `class:${cls.id}` }}
      icon={<ClassIcon cls={cls} />}
      label={cls.plural}
      count={countOf(cls)}
      active={active}
    />
  )

  return (
    <div className="flex flex-col pb-3">
      <PaneRow
        spec={{ kind: 'library', key: 'all' }}
        icon={<ClassIcon cls={{ icon: 'shapes', tone: 'neutral' }} />}
        label="All objects"
        active={active}
      />
      <PaneRow
        spec={{ kind: 'graph', key: 'global' }}
        icon={
          <span className="flex size-[18px] items-center justify-center">
            <Icon.Graph aria-hidden className="size-4 text-ink-faint" />
          </span>
        }
        label="Graph"
        active={active}
      />
      {model.error != null && (
        <p role="alert" className="truncate px-2 py-1 text-xs text-error-ink">
          {describeError(model.error)}
        </p>
      )}

      {(pinned.length > 0 || collections.favorites) && (
        <Section id="pinned" name="Pinned">
          {collections.favorites && (
            <PaneRow
              spec={{
                kind: 'library',
                key: `collection:${collections.favorites.id}`,
              }}
              icon={
                <span className="flex size-[18px] items-center justify-center">
                  <Icon.Star aria-hidden className="size-4 text-ochre-ink" />
                </span>
              }
              label="Favorites"
              count={collections.favorites.members.length}
              active={active}
            />
          )}
          {pinned.map(classRow)}
        </Section>
      )}

      <Section
        id="classes"
        name="Object types"
        action={
          <HeadingAdd
            label="New object class"
            onClick={() => openPane({ kind: 'class', key: 'new' })}
          />
        }
      >
        {classes.map(classRow)}
        <PaneRow
          spec={{ kind: 'classes', key: 'all' }}
          icon={
            <span className="flex size-[18px] items-center justify-center">
              <Icon.Settings aria-hidden className="size-4 text-ink-faint" />
            </span>
          }
          label="Manage classes"
          active={active}
        />
      </Section>

      {collections.available && (
        <Section
          id="collections"
          name="Collections"
          action={
            <HeadingAdd
              label="New collection"
              onClick={() => setNaming(true)}
            />
          }
        >
          {collections.curated.map((c) => (
            <PaneRow
              key={c.id}
              spec={{ kind: 'library', key: `collection:${c.id}` }}
              icon={
                registry.collection ? (
                  <ClassIcon cls={registry.collection} />
                ) : null
              }
              label={c.name}
              count={c.members.length}
              active={active}
            />
          ))}
          {naming && (
            <input
              // The person asked for a new collection a moment ago.
              autoFocus
              aria-label="Collection name"
              className="mx-2 h-7 rounded-md bg-transparent px-2 text-sm outline-2 outline-focus"
              onBlur={(event) => {
                const name = event.currentTarget.value.trim()
                setNaming(false)
                if (name)
                  void collections.create(name).then((made) =>
                    openPane({
                      kind: 'library',
                      key: `collection:${made.id}`,
                    }),
                  )
              }}
              onKeyDown={(event) => {
                if (event.nativeEvent.isComposing) return
                if (event.key === 'Enter') event.currentTarget.blur()
                if (event.key === 'Escape') {
                  event.currentTarget.value = ''
                  event.currentTarget.blur()
                }
              }}
            />
          )}
          {collections.error && (
            <p
              role="alert"
              className="px-2 py-1 text-xs wrap-anywhere text-error-ink"
            >
              {describeError(collections.error)}
            </p>
          )}
        </Section>
      )}
    </div>
  )
}
