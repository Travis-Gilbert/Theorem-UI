// SOURCING: after Capacities' Object Types settings (the sidebar list of types with pin, hide and order) and Craft web's Hide and Order Fields list (Mobbin ebf78810-7a01-4f15-a3af-3051010ed5cd); coss AlertDialog for the one irreversible step (delete); prefs.ts for pin/hide/order, the register's unpinDeclared (useRetireObjectType) for retire, deleteRecord plus retire for delete, portability.ts for the export file and the import plan, declareSchema (useDeclareObjectType) for every imported class
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useRef, useState } from 'react'
import type { ReactNode } from 'react'
import {
  AlertDialog,
  AlertDialogClose,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogPopup,
  AlertDialogTitle,
} from '@/components/coss/alert-dialog'
import { Icon } from '@/components/icons'
import {
  declareObjectType,
  deleteRecord,
  readRecords,
  retireObjectType,
} from '@/components/records/api'
import type { ObjectType } from '@/components/records/contract'
import { useRetireObjectType } from '@/components/records/queries'
import { Button } from '@/components/ui/button'
import { describeError } from '@/lib/theorem/client'
import type { ObjectClass } from '@/lib/objects/classes'
import { exportClasses, planImport } from '@/lib/objects/portability'
import type { ImportPlan } from '@/lib/objects/portability'
import {
  nudged,
  orderedClasses,
  pinnedClasses,
  useClassPrefs,
} from '@/lib/objects/prefs'
import { useClassRegistry } from '@/lib/objects/register'
import { cn } from '@/lib/utils'
import { ClassIcon } from './class-icon'
import { openPane } from './object-actions'

const download = (name: string, text: string) => {
  const url = URL.createObjectURL(
    new Blob([text], { type: 'application/json' }),
  )
  const link = document.createElement('a')
  link.href = url
  link.download = name
  link.click()
  URL.revokeObjectURL(url)
}

/** Every declared class: pin, hide and order it, edit, retire or delete it, export and import definitions. */
export function ClassManager() {
  const { registry, model } = useClassRegistry()
  const prefs = useClassPrefs()
  const retire = useRetireObjectType()
  const [deleting, setDeleting] = useState<ObjectClass>()
  const [plan, setPlan] = useState<{ plan: ImportPlan; name: string }>()
  const [importError, setImportError] = useState<unknown>()
  const file = useRef<HTMLInputElement>(null)

  const classes = orderedClasses(registry, prefs.order)
  const pinned = pinnedClasses(registry, prefs.pinned)
  const pinnedIds = new Set(pinned.map((cls) => cls.id))
  const retired = registry.all.filter((cls) => cls.retired)
  const togglePin = (id: string) =>
    prefs.setPinned(
      pinnedIds.has(id)
        ? pinned.map((c) => c.id).filter((x) => x !== id)
        : [...pinned.map((c) => c.id), id],
    )

  const exportAll = () =>
    download(
      `theorem-classes-${new Date().toISOString().slice(0, 10)}.json`,
      JSON.stringify(
        exportClasses(
          registry.all
            .filter((cls) => !cls.retired && !cls.standard && !cls.system)
            .map((cls) => cls.type),
        ),
        null,
        2,
      ),
    )

  return (
    <div className="flex h-full min-h-0 overflow-y-auto">
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-8 px-10 pt-14 pb-24">
        <header className="flex flex-wrap items-center gap-2">
          <h1 className="min-w-0 flex-1 font-heading text-3xl font-semibold tracking-tight">
            Object classes
          </h1>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => file.current?.click()}
          >
            <Icon.Attachment aria-hidden className="size-4" />
            Import
          </Button>
          <Button size="sm" variant="ghost" onClick={exportAll}>
            <Icon.Download aria-hidden className="size-4" />
            Export
          </Button>
          <Button
            size="sm"
            onClick={() => openPane({ kind: 'class', key: 'new' })}
          >
            <Icon.Add aria-hidden className="size-4" />
            New object class
          </Button>
          <input
            ref={file}
            type="file"
            accept="application/json,.json"
            className="hidden"
            aria-label="Class definitions file"
            onChange={async (event) => {
              const chosen = event.target.files?.[0]
              event.target.value = ''
              if (!chosen || !model.data) return
              setImportError(undefined)
              try {
                setPlan({
                  plan: planImport(await chosen.text(), model.data),
                  name: chosen.name,
                })
              } catch (error) {
                setImportError(error)
              }
            }}
          />
        </header>

        {importError != null && (
          <p role="alert" className="text-sm wrap-anywhere text-error-ink">
            {describeError(importError)}
          </p>
        )}
        {plan && (
          <ImportReview
            plan={plan.plan}
            name={plan.name}
            onDone={() => setPlan(undefined)}
          />
        )}
        {retire.error && (
          <p role="alert" className="text-sm wrap-anywhere text-error-ink">
            {describeError(retire.error)}
          </p>
        )}

        <ol aria-label="Classes" className="flex flex-col">
          {classes.map((cls, index) => {
            const hidden = prefs.hidden.includes(cls.id)
            return (
              <li
                key={cls.id}
                className={cn(
                  'group flex h-11 items-center gap-3 rounded-lg px-2 hover:bg-hover',
                  hidden && 'text-ink-muted',
                )}
              >
                <ClassIcon cls={cls} />
                <button
                  type="button"
                  onClick={() => openPane({ kind: 'class', key: cls.id })}
                  className="flex min-w-0 flex-1 items-baseline gap-2 text-start outline-none focus-visible:underline"
                >
                  <span className="truncate text-sm font-medium">
                    {cls.plural}
                  </span>
                  <span className="text-xs text-ink-faint">
                    {cls.type.record_count ?? 0}
                    {cls.standard ? ' · Standard' : ''}
                    {hidden ? ' · Hidden' : ''}
                  </span>
                </button>
                <Row>
                  <Tool
                    label={`Move ${cls.plural} up`}
                    disabled={index === 0}
                    onClick={() => prefs.setOrder(nudged(classes, cls.id, -1))}
                  >
                    <Icon.ArrowUp className="size-3.5" />
                  </Tool>
                  <Tool
                    label={`Move ${cls.plural} down`}
                    disabled={index === classes.length - 1}
                    onClick={() => prefs.setOrder(nudged(classes, cls.id, 1))}
                  >
                    <Icon.ArrowDown className="size-3.5" />
                  </Tool>
                  <Tool
                    label={
                      pinnedIds.has(cls.id)
                        ? `Unpin ${cls.plural}`
                        : `Pin ${cls.plural}`
                    }
                    pressed={pinnedIds.has(cls.id)}
                    onClick={() => togglePin(cls.id)}
                  >
                    {pinnedIds.has(cls.id) ? (
                      <Icon.Unpin className="size-3.5" />
                    ) : (
                      <Icon.Pin className="size-3.5" />
                    )}
                  </Tool>
                  <Tool
                    label={hidden ? `Show ${cls.plural}` : `Hide ${cls.plural}`}
                    pressed={hidden}
                    onClick={() => prefs.toggleHidden(cls.id)}
                  >
                    {hidden ? (
                      <Icon.Eye className="size-3.5" />
                    ) : (
                      <Icon.Hide className="size-3.5" />
                    )}
                  </Tool>
                  {!cls.system && (
                    <Tool
                      label={`Retire ${cls.plural}`}
                      disabled={retire.isPending}
                      onClick={() => retire.mutate(cls.id)}
                    >
                      <Icon.Archive className="size-3.5" />
                    </Tool>
                  )}
                  {!cls.standard && !cls.system && (
                    <Tool
                      label={`Delete ${cls.plural}`}
                      onClick={() => setDeleting(cls)}
                    >
                      <Icon.Delete className="size-3.5" />
                    </Tool>
                  )}
                </Row>
              </li>
            )
          })}
        </ol>

        {registry.substrate.length > 0 && (
          <section aria-label="System types" className="flex flex-col gap-2">
            <h2 className="text-sm font-medium text-ink-muted">System</h2>
            <ul className="flex flex-col">
              {registry.substrate.map((cls) => (
                <li key={cls.id}>
                  <button
                    type="button"
                    onClick={() => openPane({ kind: 'class', key: cls.id })}
                    className="flex h-9 w-full items-center gap-3 rounded-lg px-2 text-start text-sm text-ink-muted outline-none hover:bg-hover focus-visible:underline"
                  >
                    <ClassIcon cls={cls} className="opacity-60" />
                    <span className="min-w-0 flex-1 truncate">
                      {cls.plural}
                    </span>
                    <span className="text-xs text-ink-faint">
                      {cls.type.record_count ?? 0}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </section>
        )}

        {retired.length > 0 && (
          <section className="flex flex-col gap-2">
            <h2 className="text-sm font-medium text-ink-muted">Retired</h2>
            <ul className="flex flex-col">
              {retired.map((cls) => (
                <li
                  key={cls.id}
                  className="flex h-9 items-center gap-3 px-2 text-sm text-ink-muted"
                >
                  <ClassIcon cls={cls} className="opacity-60" />
                  <span className="min-w-0 flex-1 truncate">{cls.plural}</span>
                  <span className="text-xs text-ink-faint">
                    {cls.type.record_count ?? 0} kept, observed
                  </span>
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>
      {deleting && (
        <DeleteClass cls={deleting} onClose={() => setDeleting(undefined)} />
      )}
    </div>
  )
}

const Row = ({ children }: { children: ReactNode }) => (
  <div className="flex items-center gap-0.5 opacity-0 group-focus-within:opacity-100 group-hover:opacity-100">
    {children}
  </div>
)

const Tool = ({
  label,
  onClick,
  disabled,
  pressed,
  children,
}: {
  label: string
  onClick: () => void
  disabled?: boolean
  pressed?: boolean
  children: ReactNode
}) => (
  <button
    type="button"
    aria-label={label}
    aria-pressed={pressed}
    disabled={disabled}
    onClick={onClick}
    className="flex size-7 items-center justify-center rounded-md text-ink-faint outline-none hover:bg-pill hover:text-ink focus-visible:outline-2 focus-visible:outline-focus disabled:opacity-30 aria-pressed:text-ink"
  >
    {children}
  </button>
)

/** Removes every instance, then retires the class: the one step that cannot be undone. */
function DeleteClass({
  cls,
  onClose,
}: {
  cls: ObjectClass
  onClose: () => void
}) {
  const client = useQueryClient()
  const remove = useMutation({
    mutationFn: async (type: ObjectType) => {
      let cursor: string | undefined
      do {
        const page = await readRecords(type.node_label, cursor)
        for (const row of page.rows)
          await deleteRecord(type.object_type_id, row.id)
        cursor = page.cursor && page.rows.length ? page.cursor : undefined
      } while (cursor)
      await retireObjectType(type.object_type_id)
    },
    onSettled: () =>
      void client.invalidateQueries({ queryKey: ['theorem', 'records'] }),
    onSuccess: onClose,
  })
  const count = cls.type.record_count ?? 0
  return (
    <AlertDialog
      open
      onOpenChange={(open) => !open && !remove.isPending && onClose()}
    >
      <AlertDialogPopup>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete {cls.plural}?</AlertDialogTitle>
          <AlertDialogDescription>
            {count === 1
              ? `The 1 ${cls.label.toLowerCase()}`
              : `All ${count} ${cls.plural.toLowerCase()}`}{' '}
            will be deleted and the class retired. This cannot be undone.
          </AlertDialogDescription>
          {remove.error && (
            <p role="alert" className="text-sm wrap-anywhere text-error-ink">
              {describeError(remove.error)}
            </p>
          )}
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogClose render={<Button variant="ghost" />}>
            Cancel
          </AlertDialogClose>
          <Button
            variant="destructive"
            disabled={remove.isPending}
            onClick={() => remove.mutate(cls.type)}
          >
            {remove.isPending ? 'Deleting…' : `Delete ${cls.plural}`}
          </Button>
        </AlertDialogFooter>
      </AlertDialogPopup>
    </AlertDialog>
  )
}

/** What an import file would declare, applied only when the person says so. */
function ImportReview({
  plan,
  name,
  onDone,
}: {
  plan: ImportPlan
  name: string
  onDone: () => void
}) {
  const client = useQueryClient()
  const apply = useMutation({
    mutationFn: async () => {
      for (const input of plan.create) await declareObjectType(input)
      for (const { input, current } of plan.replace)
        await declareObjectType(input, current.content_anchor)
    },
    onSettled: () =>
      void client.invalidateQueries({
        queryKey: ['theorem', 'records', 'model'],
      }),
    onSuccess: onDone,
  })
  return (
    <section
      aria-label={`Import ${name}`}
      className="flex flex-col gap-3 rounded-xl border border-separator p-4"
    >
      <h2 className="text-sm font-medium">{name}</h2>
      <ul className="flex flex-col gap-1 text-sm">
        {plan.create.map((input) => (
          <li key={input.name_singular}>
            <span className="text-teal-ink">New</span> {input.label_plural}
          </li>
        ))}
        {plan.replace.map(({ input }) => (
          <li key={input.name_singular}>
            <span className="text-ochre-ink">Replaces</span>{' '}
            {input.label_plural}
          </li>
        ))}
        {plan.rejected.map((entry) => (
          <li key={entry.index} className="text-ink-muted">
            Entry {entry.index + 1}: {entry.reason}
          </li>
        ))}
      </ul>
      {apply.error && (
        <p role="alert" className="text-sm wrap-anywhere text-error-ink">
          {describeError(apply.error)}
        </p>
      )}
      <div className="flex gap-2">
        <Button
          size="sm"
          disabled={
            apply.isPending || plan.create.length + plan.replace.length === 0
          }
          onClick={() => apply.mutate()}
        >
          {apply.isPending ? 'Importing…' : 'Import'}
        </Button>
        <Button
          size="sm"
          variant="ghost"
          disabled={apply.isPending}
          onClick={onDone}
        >
          Cancel
        </Button>
      </div>
    </section>
  )
}
