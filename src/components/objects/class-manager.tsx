// SOURCING: after Capacities' Object Types settings (the sidebar list of types with pin, hide and order) and Craft web's Hide and Order Fields list (Mobbin ebf78810-7a01-4f15-a3af-3051010ed5cd); coss AlertDialog for the one irreversible step (delete); prefs.ts for pin/hide/order, the register's unpinDeclared (useRetireObjectType) for retire, deleteRecord plus retire for delete, portability.ts for the export file, the import plan and applying it (declareSchema per class, create_one per carried object, then their links); coss segmented control for a collision choice
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
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
  deleteRecord,
  readEveryClass,
  retireObjectType,
} from '@/components/records/api'
import type { DataModel, ObjectType } from '@/components/records/contract'
import { Segmented } from '@/components/records/field-form'
import { useDataModel, useRetireObjectType } from '@/components/records/queries'
import { Button } from '@/components/ui/button'
import { describeError } from '@/lib/theorem/client'
import type { ObjectClass } from '@/lib/objects/classes'
import {
  applyImport,
  exportClasses,
  importDefinitions,
  planImport,
} from '@/lib/objects/portability'
import type { Collision, ImportPlan } from '@/lib/objects/portability'
import { everyRecord } from '@/lib/objects/migration'
import {
  nudged,
  orderedClasses,
  pinnedClasses,
  useClassPrefs,
} from '@/lib/objects/prefs'
import { useClassRegistry } from '@/lib/objects/register'
import { classUsage } from '@/lib/objects/usage'
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
  const [plan, setPlan] = useState<{
    plan: ImportPlan
    name: string
    model: DataModel
  }>()
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

  const exportable = registry.all.filter(
    (cls) => !cls.retired && !cls.standard && !cls.system,
  )
  const [exporting, setExporting] = useState(false)

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
          <Button
            size="sm"
            variant="ghost"
            aria-expanded={exporting}
            onClick={() => setExporting(!exporting)}
          >
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
                // Retired classes come too: their names stay taken.
                const every = {
                  ...model.data,
                  objectTypes: await readEveryClass(),
                }
                setPlan({
                  plan: planImport(await chosen.text(), every),
                  name: chosen.name,
                  model: every,
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
        {exporting && (
          <ExportChooser
            classes={exportable}
            onDone={() => setExporting(false)}
          />
        )}
        {plan && (
          <ImportReview
            plan={plan.plan}
            name={plan.name}
            model={plan.model}
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
  const model = useDataModel()
  // Deleting a class something else points at would leave it pointing at
  // nothing; such a class can be retired instead.
  const usage = useQuery({
    queryKey: [
      'theorem',
      'objects',
      'class-usage',
      cls.id,
      cls.type.content_anchor,
    ],
    queryFn: () => classUsage(model.data, cls.type),
    enabled: !!model.data,
    staleTime: 0,
  })
  const inUse = (usage.data?.length ?? 0) > 0
  const remove = useMutation({
    mutationFn: async (type: ObjectType) => {
      // Checked again as it starts: something may have linked in meanwhile.
      if ((await classUsage(model.data, type)).length)
        throw new Error(`${cls.plural} are in use, so they were not deleted.`)
      for (const row of await everyRecord(type.object_type_id))
        await deleteRecord(type.object_type_id, row.id)
      await retireObjectType(type.object_type_id)
    },
    onSettled: () =>
      void client.invalidateQueries({ queryKey: ['theorem', 'records'] }),
    onSuccess: onClose,
  })
  const retire = useMutation({
    mutationFn: () => retireObjectType(cls.id),
    onSettled: () =>
      void client.invalidateQueries({ queryKey: ['theorem', 'records'] }),
    onSuccess: onClose,
  })
  const count = cls.type.record_count ?? 0
  const busy = remove.isPending || retire.isPending
  return (
    <AlertDialog open onOpenChange={(open) => !open && !busy && onClose()}>
      <AlertDialogPopup>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete {cls.plural}?</AlertDialogTitle>
          {usage.isPending ? (
            <AlertDialogDescription>
              Checking what uses them…
            </AlertDialogDescription>
          ) : inUse ? (
            <div
              role="alert"
              className="flex flex-col gap-1 text-sm text-ink-muted"
            >
              <p>
                {cls.plural} are in use, so they cannot be deleted. Retiring
                keeps them and their objects, and hides the class.
              </p>
              <ul className="flex flex-col gap-0.5">
                {usage.data!.map((use) => (
                  <li
                    key={
                      use.kind === 'relation'
                        ? `${use.from.object_type_id}:${use.field.key}`
                        : 'links'
                    }
                  >
                    {use.kind === 'relation'
                      ? `${use.from.label_plural} · ${use.field.label}`
                      : use.count === 1
                        ? '1 link from another class'
                        : `${use.count} links from other classes`}
                  </li>
                ))}
              </ul>
            </div>
          ) : (
            <AlertDialogDescription>
              {count === 1
                ? `The 1 ${cls.label.toLowerCase()}`
                : `All ${count} ${cls.plural.toLowerCase()}`}{' '}
              will be deleted and the class retired. This cannot be undone.
            </AlertDialogDescription>
          )}
          {(remove.error ?? retire.error ?? usage.error) && (
            <p role="alert" className="text-sm wrap-anywhere text-error-ink">
              {describeError(remove.error ?? retire.error ?? usage.error)}
            </p>
          )}
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogClose render={<Button variant="ghost" />}>
            Cancel
          </AlertDialogClose>
          {inUse ? (
            <Button disabled={busy} onClick={() => retire.mutate()}>
              {retire.isPending ? 'Retiring…' : `Retire ${cls.plural}`}
            </Button>
          ) : (
            <Button
              variant="destructive"
              disabled={busy || usage.isPending || !!usage.error}
              onClick={() => remove.mutate(cls.type)}
            >
              {remove.isPending ? 'Deleting…' : `Delete ${cls.plural}`}
            </Button>
          )}
        </AlertDialogFooter>
      </AlertDialogPopup>
    </AlertDialog>
  )
}

/** Which classes go in the file, and which of them carry their objects. */
function ExportChooser({
  classes,
  onDone,
}: {
  classes: ObjectClass[]
  onDone: () => void
}) {
  const [chosen, setChosen] = useState(() => new Set(classes.map((c) => c.id)))
  const [withObjects, setWithObjects] = useState(() => new Set<string>())
  const toggle = (set: Set<string>, id: string, on: boolean) => {
    const next = new Set(set)
    if (on) next.add(id)
    else next.delete(id)
    return next
  }
  const run = useMutation({
    mutationFn: async () => {
      const picked = classes.filter((c) => chosen.has(c.id))
      const objects = []
      for (const cls of picked)
        if (withObjects.has(cls.id))
          objects.push({
            type: cls.type,
            rows: await everyRecord(cls.type.object_type_id),
          })
      download(
        `theorem-classes-${new Date().toISOString().slice(0, 10)}.json`,
        JSON.stringify(
          exportClasses(
            picked.map((c) => c.type),
            objects,
          ),
          null,
          2,
        ),
      )
    },
    onSuccess: onDone,
  })
  return (
    <section
      aria-label="Export"
      className="flex flex-col gap-3 rounded-xl border border-separator p-4"
    >
      <ul className="flex flex-col gap-1 text-sm">
        {classes.map((cls) => (
          <li key={cls.id} className="flex flex-wrap items-center gap-3">
            <label className="flex min-w-0 flex-1 items-center gap-2">
              <input
                type="checkbox"
                checked={chosen.has(cls.id)}
                onChange={(event) =>
                  setChosen(toggle(chosen, cls.id, event.target.checked))
                }
              />
              <ClassIcon cls={cls} />
              <span className="truncate">{cls.plural}</span>
            </label>
            <label className="flex items-center gap-1.5 text-xs text-ink-muted">
              <input
                type="checkbox"
                disabled={!chosen.has(cls.id)}
                checked={chosen.has(cls.id) && withObjects.has(cls.id)}
                onChange={(event) =>
                  setWithObjects(
                    toggle(withObjects, cls.id, event.target.checked),
                  )
                }
              />
              With its {cls.type.record_count}{' '}
              {cls.type.record_count === 1 ? 'object' : 'objects'}
            </label>
          </li>
        ))}
      </ul>
      {run.error && (
        <p role="alert" className="text-sm wrap-anywhere text-error-ink">
          {describeError(run.error)}
        </p>
      )}
      <div className="flex gap-2">
        <Button
          size="sm"
          disabled={run.isPending || !chosen.size}
          onClick={() => run.mutate()}
        >
          {run.isPending ? 'Reading…' : 'Download'}
        </Button>
        <Button size="sm" variant="ghost" onClick={onDone}>
          Cancel
        </Button>
      </div>
    </section>
  )
}

/** What an import file would declare and create, applied only when the person says so. */
function ImportReview({
  plan,
  name,
  model,
  onDone,
}: {
  plan: ImportPlan
  name: string
  model: DataModel
  onDone: () => void
}) {
  const client = useQueryClient()
  const tenant = model.objectTypes[0]?.tenant_id ?? ''
  const [collisions, setCollisions] = useState<Record<string, Collision>>({})
  const { missing } = importDefinitions(plan, model, tenant, collisions)
  const apply = useMutation({
    mutationFn: () => applyImport(plan, model, tenant, collisions),
    onSettled: () =>
      void client.invalidateQueries({ queryKey: ['theorem', 'records'] }),
  })
  const counts = new Map<string, number>()
  for (const object of plan.objects)
    counts.set(object.class, (counts.get(object.class) ?? 0) + 1)
  const carried = (input: { name_singular: string }) => {
    const n = counts.get(input.name_singular)
    return n ? ` with ${n} ${n === 1 ? 'object' : 'objects'}` : ''
  }
  const report = apply.data
  return (
    <section
      aria-label={`Import ${name}`}
      className="flex flex-col gap-3 rounded-xl border border-separator p-4"
    >
      <h2 className="text-sm font-medium wrap-anywhere">{name}</h2>
      <ul className="flex flex-col gap-1.5 text-sm">
        {plan.create.map((input) => (
          <li key={input.name_singular}>
            <span className="text-teal-ink">New</span> {input.label_plural}
            {carried(input)}
          </li>
        ))}
        {plan.replace.map(({ input }) => (
          <li
            key={input.name_singular}
            className="flex flex-wrap items-center gap-2"
          >
            <span className="min-w-0 flex-1">
              {input.label_plural} is already here{carried(input)}
            </span>
            <Segmented
              label={`${input.label_plural} is already here`}
              value={collisions[input.name_singular] ?? 'replace'}
              onChange={(choice) =>
                setCollisions((now) => ({
                  ...now,
                  [input.name_singular]: choice,
                }))
              }
              options={[
                { value: 'replace', label: 'Replace it' },
                { value: 'copy', label: 'Import a copy' },
              ]}
            />
          </li>
        ))}
        {missing.map((m) => (
          <li key={`${m.class}:${m.field}`} className="text-ochre-ink">
            {m.class}: {m.field} points at {m.target}, which is not here; it
            comes in as text.
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
      {report && (
        <div role="status" className="flex flex-col gap-1 text-sm">
          <p>
            Imported {report.declared.join(', ')}
            {report.objects
              ? `, ${report.objects} ${report.objects === 1 ? 'object' : 'objects'} and ${report.links} ${report.links === 1 ? 'link' : 'links'}`
              : ''}
            .
          </p>
          {report.unresolved.length > 0 && (
            <ul className="flex max-h-40 flex-col gap-0.5 overflow-y-auto text-ink-muted">
              {report.unresolved.map((u, at) => (
                <li key={at} className="wrap-anywhere">
                  {u.object}: {u.field} named {u.target}, which the file does
                  not carry
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
      <div className="flex gap-2">
        {report ? (
          <Button size="sm" onClick={onDone}>
            Done
          </Button>
        ) : (
          <>
            <Button
              size="sm"
              disabled={
                apply.isPending ||
                plan.create.length + plan.replace.length === 0
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
          </>
        )}
      </div>
    </section>
  )
}
