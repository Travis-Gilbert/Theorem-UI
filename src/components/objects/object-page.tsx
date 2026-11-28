// SOURCING: after Craft web's document page (Mobbin fe902442-73f0-4633-bbd6-84b521fe9b9d, f19df619-ca6e-4757-8866-fabe606c16a3: a centred page card on the canvas, a large title, the body under it) drawn from the record's class: the register's field specs decide every row, so one page serves any class, a person's own included; RecordProperties (object-inspector) for the field rows, useRecord and useUpdateRecord (records/queries) for the record itself
import { useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import type { FieldSpec } from '@/components/records/contract'
import { isEditable } from '@/components/records/fields'
import {
  parseRecordItemId,
  recordTitle,
  objectTypeByName,
  titleKey,
} from '@/components/records/model'
import {
  useDataModel,
  useRecord,
  useUpdateRecord,
} from '@/components/records/queries'
import { Textarea } from '@/components/ui/textarea'
import { describeError } from '@/lib/theorem/client'
import { objectClass, notesExtension } from '@/lib/objects/classes'
import type { ObjectEntry } from '@/lib/objects/library'
import { cn } from '@/lib/utils'
import { ClassIcon } from './class-icon'
import { openPane } from './object-actions'
import {
  ObjectInspector,
  RecordProperties,
  useInspector,
} from './object-inspector'

const isBody = (field: FieldSpec) => field.field_type.kind === 'long_text'
const filled = (value: unknown) =>
  value !== undefined && value !== null && value !== ''

/** A record of any class as a page: its name, its properties, its long text as the body. */
export function ObjectPage({ objectRef }: { objectRef: string }) {
  const model = useDataModel()
  const parsed = parseRecordItemId(objectRef)
  const type = parsed
    ? objectTypeByName(model.data, parsed.nameSingular)
    : undefined
  const record = useRecord(type, parsed?.recordId ?? '')
  const inspector = useInspector((s) => s.open)

  if (!parsed) return <Status text="This object cannot be opened." />
  if (model.isPending || record.isPending) return <Status text="Loading…" />
  if (!type)
    return <Status text={`There is no ${parsed.nameSingular} class.`} />
  if (record.error) return <Status text={describeError(record.error)} alert />
  if (!record.data)
    return (
      <Status text={`This ${type.label_singular.toLowerCase()} is not here.`} />
    )

  const cls = objectClass(type)
  const entry = {
    ref: objectRef,
    cls,
    title: recordTitle(type, record.data),
    record: record.data,
    origin: 'unknown',
  } satisfies ObjectEntry
  // A system class's fields are the register's own; they show when they hold
  // a value and stay read-only.
  const titleFrom = titleKey(type, record.data) ?? type.label_identifier_field
  const titleSpec = type.fields.find((f) => f.key === titleFrom)
  const fields = type.fields.filter(
    (f) =>
      f.key !== titleFrom && (!f.system || filled(entry.record.values[f.key])),
  )
  const wide = notesExtension(type).layout === 'wide'

  return (
    <div className="flex h-full min-h-0">
      <div className="min-w-0 flex-1 overflow-y-auto">
        <article
          className={cn(
            'mx-auto flex flex-col gap-6 px-10 pt-16 pb-24',
            wide ? 'max-w-5xl' : 'max-w-3xl',
          )}
        >
          <button
            type="button"
            onClick={() =>
              openPane({ kind: 'library', key: `class:${cls.id}` })
            }
            className="flex items-center gap-1.5 self-start rounded-full py-0.5 ps-0.5 pe-2.5 text-xs text-ink-muted outline-none hover:bg-hover focus-visible:outline-2 focus-visible:outline-focus"
          >
            <ClassIcon cls={cls} />
            {cls.label}
          </button>
          {titleSpec && !isEditable(titleSpec) ? (
            <h1
              className={cn(
                'font-heading font-semibold tracking-tight',
                entry.title.length > 80 ? 'text-2xl leading-snug' : 'text-4xl',
              )}
            >
              {entry.title}
            </h1>
          ) : (
            <TitleField
              key={String(entry.record.values[titleFrom] ?? '')}
              entry={entry}
              fieldKey={titleFrom}
            />
          )}
          <RecordProperties
            entry={entry}
            model={model.data}
            fields={fields.filter((f) => !isBody(f))}
          />
          {fields.filter(isBody).map((field) => (
            <BodyField
              key={`${field.key}:${String(entry.record.values[field.key] ?? '')}`}
              entry={entry}
              field={field}
            />
          ))}
        </article>
      </div>
      {inspector && <ObjectInspector objectRef={objectRef} />}
    </div>
  )
}

const Status = ({ text, alert = false }: { text: string; alert?: boolean }) => (
  <div
    role={alert ? 'alert' : 'status'}
    className="flex h-full items-center justify-center p-6 text-sm text-ink-muted"
  >
    {text}
  </div>
)

type RecordEntry = ObjectEntry & { record: NonNullable<ObjectEntry['record']> }

/** Saves a field when the person leaves it, through the register's write verb. */
function useFieldSave(entry: RecordEntry) {
  const update = useUpdateRecord(entry.cls.type)
  const client = useQueryClient()
  return {
    save: (key: string, value: unknown) =>
      update.mutate(
        { id: entry.record.id, patch: { [key]: value } },
        {
          onSettled: () =>
            void client.invalidateQueries({
              queryKey: ['theorem', 'records', 'all'],
            }),
        },
      ),
    error: update.error,
  }
}

function TitleField({
  entry,
  fieldKey,
}: {
  entry: RecordEntry
  fieldKey: string
}) {
  const saved = String(entry.record.values[fieldKey] ?? '')
  // A new object is made under this name; it reads as the placeholder, so
  // what the person types names it rather than following it.
  const untitled = `Untitled ${entry.cls.label.toLowerCase()}`
  const [value, setValue] = useState(saved === untitled ? '' : saved)
  const { save, error } = useFieldSave(entry)
  const named = value.trim()
  return (
    <div className="flex flex-col gap-1">
      <input
        aria-label={
          entry.cls.type.fields.find((f) => f.key === fieldKey)?.label ?? 'Name'
        }
        value={value}
        placeholder={untitled}
        autoFocus={saved === untitled}
        onChange={(event) => setValue(event.target.value)}
        onBlur={() => named && named !== saved && save(fieldKey, named)}
        onKeyDown={(event) =>
          event.key === 'Enter' && event.currentTarget.blur()
        }
        className="w-full bg-transparent font-heading text-4xl font-semibold tracking-tight outline-none placeholder:text-ink-faint"
      />
      {error && (
        <p role="alert" className="text-sm wrap-anywhere text-error-ink">
          {describeError(error)}
        </p>
      )}
    </div>
  )
}

function BodyField({ entry, field }: { entry: RecordEntry; field: FieldSpec }) {
  const saved = String(entry.record.values[field.key] ?? '')
  if (!isEditable(field))
    return (
      <section className="flex flex-col gap-1.5">
        <h2 className="text-sm font-medium text-ink-muted">{field.label}</h2>
        <p className="text-[15px] leading-7 whitespace-pre-wrap">{saved}</p>
      </section>
    )
  return <EditableBody entry={entry} field={field} saved={saved} />
}

function EditableBody({
  entry,
  field,
  saved,
}: {
  entry: RecordEntry
  field: FieldSpec
  saved: string
}) {
  const [value, setValue] = useState(saved)
  const { save, error } = useFieldSave(entry)
  return (
    <section className="flex flex-col gap-1.5">
      <h2 className="text-sm font-medium text-ink-muted">{field.label}</h2>
      <Textarea
        aria-label={field.label}
        value={value}
        rows={4}
        onChange={(event) => setValue(event.target.value)}
        onBlur={() => value !== saved && save(field.key, value)}
        className="min-h-24 resize-y border-none bg-transparent px-0 text-[15px] leading-7 shadow-none focus-visible:ring-0"
      />
      {error && (
        <p role="alert" className="text-sm wrap-anywhere text-error-ink">
          {describeError(error)}
        </p>
      )}
    </section>
  )
}
