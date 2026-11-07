// SOURCING: coss ui Popover (anchored field editors, through FieldEditorPopover) and the app's Dialog; Twenty's record side panel for its anatomy (an editable title over inline label and value rows, relations as boxed sections, a danger zone), with records of other types that point here standing in for its Tasks and Notes widgets; the register's undeclared properties shown with Add as field
import { useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { Icon } from '@/components/icons'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { describeError } from '@/lib/theorem/client'
import { cn } from '@/lib/utils'
import type { DataModel, FieldSpec, ObjectType, RecordRow } from './contract'
import { FieldDialog } from './field-form'
import type { FieldDraft } from './field-form'
import {
  FieldDisplay,
  FieldEditor,
  FieldEditorPopover,
  FieldTypeIcon,
  KIND,
  isEditable,
  relationIds,
} from './fields'
import {
  displayHint,
  identifierField,
  inboundRelations,
  objectTypeByName,
  observeProperty,
  recordTitle,
  undeclaredKeys,
} from './model'
import {
  flattenRows,
  useDataModel,
  useDeleteRecords,
  useRecordWrites,
  useRecord,
  useRecords,
  useUpdateRecord,
} from './queries'
import { proposeFieldType } from './schema-edit'

function FieldRow({
  type,
  row,
  field,
  model,
  writable,
  onWrite,
  onOpenRelated,
}: {
  type: ObjectType
  row: RecordRow
  field: FieldSpec
  model: DataModel
  writable: boolean
  onWrite: (field: FieldSpec, value: unknown) => void
  onOpenRelated: (nameSingular: string, id: string) => void
}) {
  const [anchor, setAnchor] = useState<HTMLElement | null>(null)
  const [editing, setEditing] = useState(false)
  const editable = writable && isEditable(field)
  const hint = displayHint(type, field.key)
  const edit = KIND[field.field_type.kind].edit
  const opensEditor =
    editable &&
    (edit === 'inline' || edit === 'popover') &&
    hint?.display !== 'rating'
  return (
    <div className="grid grid-cols-[minmax(7rem,38%)_1fr] items-start gap-2 py-0.5">
      <span className="flex min-h-7 items-center gap-1.5 text-xs text-ink-muted">
        <FieldTypeIcon kind={field.field_type.kind} />
        <span className="truncate">{field.label}</span>
      </span>
      <div
        ref={setAnchor}
        role={opensEditor ? 'button' : undefined}
        tabIndex={opensEditor ? 0 : undefined}
        aria-label={opensEditor ? `Edit ${field.label}` : undefined}
        onClick={() => opensEditor && setEditing(true)}
        onKeyDown={(event) => {
          if (opensEditor && event.key === 'Enter') {
            event.preventDefault()
            setEditing(true)
          }
        }}
        className={cn(
          'flex min-h-7 min-w-0 items-center gap-1 rounded-md px-1.5 text-sm',
          opensEditor &&
            'cursor-pointer hover:bg-hover focus-visible:outline focus-visible:outline-1 focus-visible:outline-focus',
        )}
      >
        {editing && edit === 'inline' ? (
          <FieldEditor
            field={field}
            hint={hint}
            value={row.values[field.key]}
            row={row}
            model={model}
            onCommit={(value) => {
              setEditing(false)
              onWrite(field, value)
            }}
            onDiscard={() => setEditing(false)}
          />
        ) : (
          <>
            <FieldDisplay
              row={row}
              field={field}
              hint={hint}
              model={model}
              onOpenRelated={onOpenRelated}
              onToggle={editable ? (value) => onWrite(field, value) : undefined}
            />
            {opensEditor &&
              (field.field_type.kind === 'relation'
                ? relationIds(row, field).length === 0
                : row.values[field.key] === undefined ||
                  row.values[field.key] === null ||
                  row.values[field.key] === '') && (
                <span className="text-ink-faint">{field.label}</span>
              )}
          </>
        )}
      </div>
      {editing && edit === 'popover' && (
        <FieldEditorPopover
          anchor={anchor}
          field={field}
          hint={hint}
          value={row.values[field.key]}
          row={row}
          model={model}
          onCommit={(value) => {
            setEditing(false)
            onWrite(field, value)
          }}
          onDiscard={() => setEditing(false)}
        />
      )}
    </div>
  )
}

/** Records of another type whose relation field points at this record. */
function Inbound({
  from,
  field,
  recordId,
  onOpen,
}: {
  from: ObjectType
  field: FieldSpec
  recordId: string
  onOpen: (nameSingular: string, id: string) => void
}) {
  const records = useRecords(from)
  const linked = useMemo(
    () =>
      flattenRows(records.data).filter((row) =>
        relationIds(row, field).includes(recordId),
      ),
    [records.data, field, recordId],
  )
  return (
    <section className="rounded-lg border border-separator">
      <header className="flex items-center gap-2 border-b border-separator px-3 py-2">
        <h4 className="text-sm font-medium text-ink">{from.label_plural}</h4>
        <span className="text-xs text-ink-faint">
          {field.label} · {records.isPending ? '…' : linked.length}
        </span>
      </header>
      {linked.length ? (
        <ul className="py-1">
          {linked.slice(0, 20).map((row) => (
            <li key={row.id}>
              <button
                type="button"
                onClick={() => onOpen(from.name_singular, row.id)}
                className="flex w-full items-center gap-2 px-3 py-1 text-start text-sm text-ink hover:bg-hover"
              >
                <span className="truncate">{recordTitle(from, row)}</span>
                <Icon.ChevronRight className="ms-auto size-3.5 text-ink-faint" />
              </button>
            </li>
          ))}
          {linked.length > 20 && (
            <li className="px-3 py-1 text-xs text-ink-faint">
              and {linked.length - 20} more
            </li>
          )}
        </ul>
      ) : (
        <p className="px-3 py-2 text-sm text-ink-faint">None yet.</p>
      )}
    </section>
  )
}

/**
 * One record in the Index working pane: what Twenty opens beside the table.
 */
export function RecordInspector({
  nameSingular,
  recordId,
  onOpenRecord,
  onEditFields,
  onClose,
  className,
}: {
  nameSingular: string
  recordId: string
  onOpenRecord: (nameSingular: string, recordId: string) => void
  onEditFields?: (nameSingular: string) => void
  onClose: () => void
  className?: string
}) {
  const model = useDataModel()
  const type = objectTypeByName(model.data, nameSingular)
  const record = useRecord(type, recordId)
  const siblings = useRecords(type)

  const header = (
    <header className="flex items-center gap-2 border-b border-separator px-4 py-2.5">
      <span className="text-xs text-ink-faint">
        {type?.label_singular ?? 'Record'}
      </span>
      <button
        type="button"
        data-index-close
        aria-label="Close"
        onClick={onClose}
        className="ms-auto rounded p-1 text-ink-faint hover:bg-hover hover:text-ink"
      >
        <Icon.Close className="size-4" />
      </button>
    </header>
  )

  if (model.isPending || record.isPending)
    return (
      <div className={cn('flex h-full flex-col bg-background', className)}>
        {header}
        <div className="flex flex-col gap-3 p-4">
          <Skeleton className="h-7 w-48" />
          <Skeleton className="h-32 w-full" />
        </div>
      </div>
    )
  const row = record.data
  if (!type || !row)
    return (
      <div className={cn('flex h-full flex-col bg-background', className)}>
        {header}
        <p className="p-4 text-sm text-ink-muted">
          {model.error || record.error
            ? describeError(model.error ?? record.error)
            : 'This record is not in Theorem any more.'}
        </p>
      </div>
    )
  return (
    <LoadedInspector
      key={row.id}
      model={model.data!}
      type={type}
      row={row}
      rows={flattenRows(siblings.data)}
      header={header}
      className={className}
      onOpenRecord={onOpenRecord}
      onEditFields={onEditFields}
      onClose={onClose}
    />
  )
}

function LoadedInspector({
  model,
  type,
  row,
  rows,
  header,
  className,
  onOpenRecord,
  onEditFields,
  onClose,
}: {
  model: DataModel
  type: ObjectType
  row: RecordRow
  rows: RecordRow[]
  header: ReactNode
  className?: string
  onOpenRecord: (nameSingular: string, recordId: string) => void
  onEditFields?: (nameSingular: string) => void
  onClose: () => void
}) {
  const update = useUpdateRecord(type)
  const remove = useDeleteRecords(type)
  const writable = useRecordWrites() === true
  const [writeError, setWriteError] = useState<unknown>(null)
  const [deleting, setDeleting] = useState(false)
  const [adding, setAdding] = useState<FieldDraft | null>(null)
  const [titleText, setTitleText] = useState<string | null>(null)
  const identifier = identifierField(type)
  const write = (field: FieldSpec, value: unknown) => {
    if (
      JSON.stringify(row.values[field.key] ?? null) ===
      JSON.stringify(value ?? null)
    )
      return
    setWriteError(null)
    update.mutate(
      { id: row.id, patch: { [field.key]: value } },
      { onError: setWriteError },
    )
  }
  const inbound = inboundRelations(model, type)
  const unknown = undeclaredKeys(type, [row])
  const fields = type.fields.filter((f) => f.key !== identifier?.key)
  const commitTitle = () => {
    if (identifier && titleText !== null)
      write(identifier, titleText.trim() || null)
    setTitleText(null)
  }

  return (
    <div className={cn('flex h-full flex-col bg-background', className)}>
      {header}
      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="flex flex-col gap-5 px-4 py-4">
          {writable &&
          identifier &&
          isEditable(identifier) &&
          titleText !== null ? (
            <input
              autoFocus
              value={titleText}
              aria-label={identifier.label}
              onChange={(event) => setTitleText(event.target.value)}
              onBlur={commitTitle}
              onKeyDown={(event) => {
                if (event.key === 'Enter' || event.key === 'Escape') {
                  event.preventDefault()
                  commitTitle()
                }
              }}
              className="font-heading w-full rounded-md bg-background px-1.5 text-[22px] font-medium text-ink outline-none ring-1 ring-focus"
            />
          ) : (
            <button
              type="button"
              disabled={!writable || !identifier || !isEditable(identifier)}
              onClick={() =>
                identifier &&
                setTitleText(String(row.values[identifier.key] ?? ''))
              }
              className="font-heading -mx-1.5 rounded-md px-1.5 text-start text-[22px] font-medium text-ink hover:bg-hover disabled:hover:bg-transparent"
            >
              {recordTitle(type, row)}
            </button>
          )}

          {writeError != null && (
            <p
              role="alert"
              className="rounded-lg border border-ochre/40 bg-ochre/8 px-3 py-2 text-sm"
            >
              Theorem did not save that change. {describeError(writeError)}
            </p>
          )}

          <section className="flex flex-col">
            {fields.map((field) => (
              <FieldRow
                key={field.key}
                type={type}
                row={row}
                field={field}
                model={model}
                writable={writable}
                onWrite={write}
                onOpenRelated={onOpenRecord}
              />
            ))}
            {onEditFields && (
              <button
                type="button"
                onClick={() => onEditFields(type.name_singular)}
                className="mt-1 self-start rounded px-1.5 py-1 text-xs text-ink-faint hover:bg-hover hover:text-ink"
              >
                Edit fields
              </button>
            )}
          </section>

          {inbound.map(({ from, field }) => (
            <Inbound
              key={`${from.object_type_id}:${field.key}`}
              from={from}
              field={field}
              recordId={row.id}
              onOpen={onOpenRecord}
            />
          ))}

          {unknown.length > 0 && (
            <section className="flex flex-col gap-1.5">
              <header>
                <h4 className="text-sm font-medium text-ink">
                  Not in the schema
                </h4>
                <p className="text-xs text-ink-muted">
                  This {type.label_singular.toLowerCase()} carries more than its
                  type declares. It is kept as it is.
                </p>
              </header>
              {unknown.map((key) => (
                <div
                  key={key}
                  className="grid grid-cols-[minmax(7rem,38%)_1fr_auto] items-center gap-2"
                >
                  <span className="truncate font-mono text-xs text-ink-muted">
                    {key}
                  </span>
                  <span className="truncate font-mono text-xs text-ink">
                    {JSON.stringify(row.values[key])}
                  </span>
                  <Button
                    variant="ghost"
                    size="xs"
                    onClick={() =>
                      setAdding({
                        label: key,
                        type: proposeFieldType(
                          observeProperty(rows.length ? rows : [row], key),
                        ),
                      })
                    }
                  >
                    Add as field
                  </Button>
                </div>
              ))}
            </section>
          )}

          {writable && (
            <section className="flex items-center justify-between gap-3 rounded-lg border border-error-ink/30 px-3 py-2">
              <p className="text-sm text-ink-muted">
                Delete this {type.label_singular.toLowerCase()} from Theorem.
              </p>
              {deleting ? (
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={() =>
                    remove.mutate([row.id], {
                      onSuccess: onClose,
                      onError: (error) => {
                        setDeleting(false)
                        setWriteError(error)
                      },
                    })
                  }
                >
                  Delete {recordTitle(type, row)}
                </Button>
              ) : (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setDeleting(true)}
                >
                  Delete
                </Button>
              )}
            </section>
          )}
        </div>
      </div>
      {adding && (
        <FieldDialog
          key={adding.label}
          objectType={type}
          model={model}
          initial={adding}
          open
          onOpenChange={(open) => !open && setAdding(null)}
        />
      )}
    </div>
  )
}
