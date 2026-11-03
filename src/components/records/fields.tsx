// SOURCING: none for the registry itself — Twenty's per-type cell display and input behaviour (twenty-front record-field meta-types: Enter saves and moves down, Tab across, Escape saves, invalid JSON is not saved, booleans and ratings toggle in the cell) mapped onto the schema register's field kinds; coss ui Command for searchable option and record pickers; the app's Icon set and Stone tokens
import { useMemo, useState } from 'react'
import type { KeyboardEvent, ReactNode } from 'react'
import {
  Command,
  CommandEmpty,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/coss/command'
import type { MyColumnMeta } from '@/components/data-table/features'
import { Icon } from '@/components/icons'
import { cn } from '@/lib/utils'
import type {
  DataModel,
  FieldKind,
  FieldSpec,
  RecordRow,
  SchemaFieldType,
} from './contract'
import { isEmptyValue, recordTitle, resolveObjectType } from './model'
import type { DisplayHint } from './model'
import { flattenRows, useRecords } from './queries'

// Kinds

type KindInfo = {
  label: string
  /** Twenty's new-field picker groups. */
  category: 'basic' | 'relation' | 'advanced'
  glyph: ReactNode
  width: number
  /** How a cell edits: in place, in a popover, toggled, or not at all. */
  edit: 'inline' | 'popover' | 'toggle' | 'none'
}

const glyph = (text: string) => (
  <span className="font-mono text-[10px] leading-none font-semibold tracking-tight">
    {text}
  </span>
)

export const KIND: Record<FieldKind, KindInfo> = {
  text: {
    label: 'Text',
    category: 'basic',
    glyph: glyph('Aa'),
    width: 180,
    edit: 'inline',
  },
  long_text: {
    label: 'Long text',
    category: 'basic',
    glyph: <Icon.Article className="size-3.5" />,
    width: 240,
    edit: 'popover',
  },
  integer: {
    label: 'Integer',
    category: 'basic',
    glyph: glyph('12'),
    width: 120,
    edit: 'inline',
  },
  number: {
    label: 'Number',
    category: 'basic',
    glyph: glyph('#'),
    width: 120,
    edit: 'inline',
  },
  boolean: {
    label: 'True/False',
    category: 'basic',
    glyph: <Icon.Check className="size-3.5" />,
    width: 110,
    edit: 'toggle',
  },
  date: {
    label: 'Date',
    category: 'basic',
    glyph: <Icon.Calendar className="size-3.5" />,
    width: 140,
    edit: 'popover',
  },
  timestamp: {
    label: 'Date and time',
    category: 'basic',
    glyph: <Icon.Calendar className="size-3.5" />,
    width: 180,
    edit: 'popover',
  },
  enum: {
    label: 'Select',
    category: 'basic',
    glyph: <Icon.ChevronDown className="size-3.5" />,
    width: 150,
    edit: 'popover',
  },
  enum_many: {
    label: 'Multi-select',
    category: 'basic',
    glyph: <Icon.SortList className="size-3.5" />,
    width: 200,
    edit: 'popover',
  },
  relation: {
    label: 'Relation',
    category: 'relation',
    glyph: <Icon.Link className="size-3.5" />,
    width: 180,
    edit: 'popover',
  },
  json: {
    label: 'JSON',
    category: 'advanced',
    glyph: glyph('{}'),
    width: 200,
    edit: 'popover',
  },
  uuid: {
    label: 'ID',
    category: 'advanced',
    glyph: <Icon.Key className="size-3.5" />,
    width: 200,
    edit: 'none',
  },
  vector: {
    label: 'Vector',
    category: 'advanced',
    glyph: <Icon.Graph className="size-3.5" />,
    width: 140,
    edit: 'none',
  },
  geometry: {
    label: 'Geometry',
    category: 'advanced',
    glyph: <Icon.Diagram className="size-3.5" />,
    width: 140,
    edit: 'none',
  },
}

export const CATEGORY_TEXT: Record<
  KindInfo['category'],
  { title: string; detail: string }
> = {
  basic: {
    title: 'Basic',
    detail: 'All the basic field types you need to start',
  },
  relation: {
    title: 'Relation',
    detail: 'Create a relation with other objects',
  },
  advanced: {
    title: 'Advanced',
    detail: 'More advanced fields for advanced projects',
  },
}

export function FieldTypeIcon({
  kind,
  className,
}: {
  kind: FieldKind
  className?: string
}) {
  return (
    <span
      aria-hidden
      className={cn(
        'inline-flex size-4 shrink-0 items-center justify-center text-ink-faint',
        className,
      )}
    >
      {KIND[kind].glyph}
    </span>
  )
}

/** A starting type for a kind; enums start with no options, relations with no target. */
export function defaultFieldType(kind: FieldKind): SchemaFieldType {
  switch (kind) {
    case 'enum':
    case 'enum_many':
      return { kind, variants: [] }
    case 'vector':
      return { kind, dim: 384 }
    case 'relation':
      return { kind, target_object_type_id: '', cardinality: 'one' }
    default:
      return { kind }
  }
}

export const isEditable = (field: FieldSpec) =>
  !field.system && KIND[field.field_type.kind].edit !== 'none'

// Values

/** Related ids from the property, else from the record's hydrated links. */
export function relationIds(row: RecordRow, field: FieldSpec): string[] {
  const value = row.values[field.key]
  if (typeof value === 'string' && value) return [value]
  if (Array.isArray(value))
    return value.filter((v): v is string => typeof v === 'string')
  return row.relations[field.key] ?? []
}

const asString = (value: unknown) =>
  value === null || value === undefined
    ? ''
    : typeof value === 'object'
      ? JSON.stringify(value)
      : String(value)

const DATE = new Intl.DateTimeFormat('en-US', {
  month: 'short',
  day: 'numeric',
  year: 'numeric',
})
const DATE_TIME = new Intl.DateTimeFormat('en-US', {
  month: 'short',
  day: 'numeric',
  year: 'numeric',
  hour: 'numeric',
  minute: '2-digit',
})
const NUMBER = new Intl.NumberFormat('en-US', { maximumFractionDigits: 6 })

function formatDate(value: unknown, withTime: boolean) {
  if (typeof value !== 'string' && typeof value !== 'number') return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return asString(value)
  return (withTime ? DATE_TIME : DATE).format(date)
}

function formatNumber(value: unknown, hint?: DisplayHint) {
  const n = typeof value === 'number' ? value : Number(value)
  if (!Number.isFinite(n)) return asString(value)
  if (hint?.display === 'currency')
    try {
      return new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: hint.currency,
      }).format(n)
    } catch {
      return `${NUMBER.format(n)} ${hint.currency}`
    }
  if (hint?.display === 'percent') return `${NUMBER.format(n)}%`
  return NUMBER.format(n)
}

/**
 * A plain value for sorting, filtering, the footer and CSV: text for text,
 * numbers for numbers, ISO strings for dates, related titles for relations.
 */
export function sortValue(
  row: RecordRow,
  field: FieldSpec,
  titleOf: (field: FieldSpec, id: string) => string,
): unknown {
  const value = row.values[field.key]
  switch (field.field_type.kind) {
    case 'relation': {
      const titles = relationIds(row, field).map((id) => titleOf(field, id))
      return titles.length ? titles.join(', ') : null
    }
    case 'integer':
    case 'number': {
      if (value === null || value === undefined || value === '') return null
      const n = Number(value)
      return Number.isFinite(n) ? n : null
    }
    case 'boolean':
      return value === true || value === 'true'
    case 'enum_many':
      return Array.isArray(value) ? value : value ? [value] : []
    case 'json':
    case 'vector':
    case 'geometry':
      return isEmptyValue(value) ? null : asString(value)
    default:
      return isEmptyValue(value) ? null : value
  }
}

/** The kit filter list's variant and options for a field's column. */
export function columnMeta(field: FieldSpec): MyColumnMeta {
  const type = field.field_type
  const options =
    type.kind === 'enum' || type.kind === 'enum_many'
      ? type.variants.map((v) => ({ label: v, value: v }))
      : undefined
  switch (type.kind) {
    case 'integer':
    case 'number':
      return { label: field.label, variant: 'number' }
    case 'date':
    case 'timestamp':
      return { label: field.label, variant: 'date' }
    case 'boolean':
      return { label: field.label, variant: 'boolean' }
    case 'enum':
      return { label: field.label, variant: 'select', options }
    case 'enum_many':
      return { label: field.label, variant: 'multi-select', options }
    default:
      return { label: field.label, variant: 'text' }
  }
}

// Display

const TAG_TONES = [
  'bg-teal-container text-teal-ink',
  'bg-ochre-container text-ochre-ink',
  'bg-redwood-container text-redwood-ink',
  'bg-selected text-ink',
  'bg-error-container text-error-ink',
  'bg-pill text-ink-muted',
]

/** A select option keeps its colour as long as it keeps its place. */
export function Tag({ field, value }: { field: FieldSpec; value: string }) {
  const type = field.field_type
  const index =
    type.kind === 'enum' || type.kind === 'enum_many'
      ? type.variants.indexOf(value)
      : -1
  return (
    <span
      className={cn(
        'inline-flex h-5 max-w-full shrink-0 items-center truncate rounded px-1.5 text-xs font-medium',
        TAG_TONES[
          (index < 0 ? TAG_TONES.length - 1 : index) % TAG_TONES.length
        ],
      )}
    >
      {value}
    </span>
  )
}

export function Chip({
  children,
  onClick,
  title,
}: {
  children: ReactNode
  onClick?: () => void
  title?: string
}) {
  const className =
    'inline-flex h-5 max-w-full shrink-0 items-center gap-1 truncate rounded border border-separator bg-raised px-1.5 text-xs text-ink'
  return onClick ? (
    <button
      type="button"
      title={title}
      onClick={(event) => {
        event.stopPropagation()
        onClick()
      }}
      className={cn(className, 'hover:bg-hover')}
    >
      {children}
    </button>
  ) : (
    <span title={title} className={className}>
      {children}
    </span>
  )
}

function LinkValue({ href, children }: { href: string; children: ReactNode }) {
  return (
    <a
      href={href}
      target={href.startsWith('http') ? '_blank' : undefined}
      rel="noopener noreferrer"
      onClick={(event) => event.stopPropagation()}
      className="inline-flex h-5 max-w-full items-center truncate rounded border border-separator bg-raised px-1.5 text-xs text-ink hover:bg-hover"
    >
      {children}
    </a>
  )
}

const hrefFor = (hint: DisplayHint | undefined, text: string) => {
  if (hint?.display === 'email') return `mailto:${text}`
  if (hint?.display === 'phone') return `tel:${text.replace(/[^\d+]/g, '')}`
  if (hint?.display === 'url')
    return /^https?:\/\//i.test(text) ? text : `https://${text}`
  return undefined
}

const urlText = (text: string) =>
  text.replace(/^https?:\/\//i, '').replace(/\/$/, '')

export function Rating({
  value,
  max,
  onChange,
}: {
  value: unknown
  max: number
  onChange?: (value: number | null) => void
}) {
  const n = Math.round(Number(value) || 0)
  return (
    <span
      className="inline-flex items-center gap-0.5"
      role={onChange ? 'radiogroup' : undefined}
    >
      {Array.from({ length: max }, (_, i) => {
        const on = i < n
        const star = (
          <Icon.Star
            className={cn('size-3.5', on ? 'text-ochre' : 'text-ink-faint/40')}
          />
        )
        return onChange ? (
          <button
            key={i}
            type="button"
            role="radio"
            aria-checked={i + 1 === n}
            aria-label={`${i + 1} of ${max}`}
            onClick={(event) => {
              event.stopPropagation()
              onChange(i + 1 === n ? null : i + 1)
            }}
            className="rounded-sm hover:scale-110"
          >
            {star}
          </button>
        ) : (
          <span key={i}>{star}</span>
        )
      })}
    </span>
  )
}

/** Titles for a relation field's targets, from the target type's loaded rows. */
export function useRelationTitles(
  model: DataModel | undefined,
  field: FieldSpec,
) {
  const target =
    field.field_type.kind === 'relation'
      ? resolveObjectType(model, field.field_type.target_object_type_id)
      : undefined
  const records = useRecords(target)
  return useMemo(() => {
    const rows = flattenRows(records.data)
    const byId = new Map(rows.map((row) => [row.id, row]))
    return {
      target,
      rows,
      title: (id: string) =>
        target && byId.has(id) ? recordTitle(target, byId.get(id)) : id,
    }
  }, [records.data, target])
}

function RelationValue({
  row,
  field,
  model,
  onOpen,
}: {
  row: RecordRow
  field: FieldSpec
  model?: DataModel
  onOpen?: (nameSingular: string, id: string) => void
}) {
  const { target, title } = useRelationTitles(model, field)
  const ids = relationIds(row, field)
  return (
    <span className="flex min-w-0 items-center gap-1 overflow-hidden">
      {ids.map((id) => (
        <Chip
          key={id}
          title={title(id)}
          onClick={
            target && onOpen
              ? () => onOpen(target.name_singular, id)
              : undefined
          }
        >
          {title(id)}
        </Chip>
      ))}
    </span>
  )
}

/** A field's value as a cell or the record page shows it. */
export function FieldDisplay({
  row,
  field,
  hint,
  model,
  onOpenRelated,
  onToggle,
}: {
  row: RecordRow
  field: FieldSpec
  hint?: DisplayHint
  model?: DataModel
  onOpenRelated?: (nameSingular: string, id: string) => void
  /** Booleans and ratings change in place when given. */
  onToggle?: (value: unknown) => void
}) {
  const value = row.values[field.key]
  const kind = field.field_type.kind
  if (kind === 'relation')
    return (
      <RelationValue
        row={row}
        field={field}
        model={model}
        onOpen={onOpenRelated}
      />
    )
  if (kind === 'boolean') {
    const on = value === true || value === 'true'
    return (
      <button
        type="button"
        disabled={!onToggle}
        aria-pressed={on}
        onClick={(event) => {
          event.stopPropagation()
          onToggle?.(!on)
        }}
        className="inline-flex items-center gap-1.5 text-sm text-ink disabled:cursor-default"
      >
        <span
          className={cn(
            'inline-flex size-3.5 items-center justify-center rounded-[3px] border',
            on ? 'border-focus bg-focus text-white' : 'border-separator',
          )}
        >
          {on && <Icon.Check className="size-3" />}
        </span>
        {on ? 'True' : 'False'}
      </button>
    )
  }
  if (hint?.display === 'rating')
    return <Rating value={value} max={hint.max} onChange={onToggle} />
  if (isEmptyValue(value)) return null
  switch (kind) {
    case 'text': {
      const text = asString(value)
      const href = hrefFor(hint, text)
      return href ? (
        <LinkValue href={href}>
          {hint?.display === 'url' ? urlText(text) : text}
        </LinkValue>
      ) : (
        <span className="truncate">{text}</span>
      )
    }
    case 'long_text':
      return (
        <span className="truncate">
          {asString(value)
            .split('\n')
            .find((line) => line.trim()) ?? ''}
        </span>
      )
    case 'integer':
    case 'number':
      return (
        <span className="truncate tabular-nums">
          {formatNumber(value, hint)}
        </span>
      )
    case 'date':
    case 'timestamp':
      return (
        <span className="truncate tabular-nums">
          {formatDate(value, kind === 'timestamp')}
        </span>
      )
    case 'enum':
      return <Tag field={field} value={asString(value)} />
    case 'enum_many':
      return (
        <span className="flex min-w-0 items-center gap-1 overflow-hidden">
          {(Array.isArray(value) ? value : [value]).map((v) => (
            <Tag key={asString(v)} field={field} value={asString(v)} />
          ))}
        </span>
      )
    case 'uuid':
      return (
        <span className="truncate font-mono text-xs text-ink-muted">
          {asString(value)}
        </span>
      )
    case 'vector':
      return (
        <span className="text-xs text-ink-muted">
          {Array.isArray(value) ? `${value.length} dimensions` : 'Vector'}
        </span>
      )
    default:
      return (
        <span className="truncate font-mono text-xs text-ink-muted">
          {asString(value)}
        </span>
      )
  }
}

// Editing

export type Move = 'down' | 'up' | 'right' | 'left'

export type EditorProps = {
  field: FieldSpec
  hint?: DisplayHint
  value: unknown
  row?: RecordRow
  model?: DataModel
  /** The character that opened the editor, which replaces the value. */
  typed?: string
  /** Save, and say where focus goes next. */
  onCommit: (value: unknown, move?: Move) => void
  /** Leave without saving. */
  onDiscard: () => void
}

/** Twenty's keys: Enter saves and moves down, Tab across, Escape saves too. */
function commitKeys(
  event: KeyboardEvent,
  commit: (move?: Move) => void,
  { multiline = false } = {},
) {
  if (event.key === 'Enter' && !(multiline && event.shiftKey)) {
    event.preventDefault()
    commit('down')
  } else if (event.key === 'Tab') {
    event.preventDefault()
    commit(event.shiftKey ? 'left' : 'right')
  } else if (event.key === 'Escape') {
    event.preventDefault()
    event.stopPropagation()
    commit()
  }
}

function parseNumber(text: string, integer: boolean) {
  const cleaned = text.replace(/[,\s%$€£]/g, '')
  if (!cleaned) return null
  const n = Number(cleaned)
  if (!Number.isFinite(n)) return undefined
  return integer ? Math.round(n) : n
}

function TextEditor({ field, value, typed, onCommit }: EditorProps) {
  const kind = field.field_type.kind
  const numeric = kind === 'integer' || kind === 'number'
  const multiline = kind === 'long_text'
  const [text, setText] = useState(typed ?? asString(value))
  const [invalid, setInvalid] = useState(false)
  const commit = (move?: Move) => {
    if (!numeric) return onCommit(text.trim() ? text.trim() : null, move)
    const n = parseNumber(text, kind === 'integer')
    if (n === undefined) return setInvalid(true)
    onCommit(n, move)
  }
  const shared = {
    autoFocus: true,
    value: text,
    'aria-label': field.label,
    'aria-invalid': invalid || undefined,
    onFocus: (event: {
      currentTarget: HTMLInputElement | HTMLTextAreaElement
    }) => {
      // A typed character replaces the value; place the caret after it.
      const end = event.currentTarget.value.length
      event.currentTarget.setSelectionRange(end, end)
    },
    onBlur: () => commit(),
    className: cn(
      'w-full bg-transparent text-sm text-ink outline-none',
      numeric && 'tabular-nums',
      invalid && 'text-error-ink',
    ),
  }
  return multiline ? (
    <textarea
      {...shared}
      rows={Math.min(10, Math.max(3, text.split('\n').length))}
      onChange={(event) => setText(event.target.value)}
      onKeyDown={(event) => commitKeys(event, commit, { multiline: true })}
      className={cn(shared.className, 'min-w-72 resize-none p-2')}
    />
  ) : (
    <input
      {...shared}
      inputMode={numeric ? 'decimal' : undefined}
      onChange={(event) => {
        setInvalid(false)
        setText(event.target.value)
      }}
      onKeyDown={(event) => commitKeys(event, commit)}
    />
  )
}

/** Dates travel as ISO strings: a date as YYYY-MM-DD, a timestamp in UTC. */
function DateEditor({ field, value, onCommit }: EditorProps) {
  const withTime = field.field_type.kind === 'timestamp'
  const initial = (() => {
    if (typeof value !== 'string' && typeof value !== 'number') return ''
    const d = new Date(value)
    if (Number.isNaN(d.getTime())) return ''
    if (!withTime) return d.toISOString().slice(0, 10)
    const local = new Date(d.getTime() - d.getTimezoneOffset() * 60_000)
    return local.toISOString().slice(0, 16)
  })()
  const [text, setText] = useState(initial)
  const commit = (move?: Move) => {
    if (!text) return onCommit(null, move)
    onCommit(withTime ? new Date(text).toISOString() : text, move)
  }
  return (
    <div className="flex items-center gap-2 p-2">
      <input
        autoFocus
        type={withTime ? 'datetime-local' : 'date'}
        aria-label={field.label}
        value={text}
        onChange={(event) => setText(event.target.value)}
        onKeyDown={(event) => commitKeys(event, commit)}
        className="rounded-md border border-separator bg-background px-2 py-1 text-sm text-ink"
      />
      <button
        type="button"
        onClick={() => onCommit(null)}
        className="text-xs text-ink-muted hover:text-ink"
      >
        Clear
      </button>
    </div>
  )
}

function JsonEditor({ field, value, onCommit, onDiscard }: EditorProps) {
  const [text, setText] = useState(
    value === undefined || value === null ? '' : JSON.stringify(value, null, 2),
  )
  const [error, setError] = useState<string>()
  const commit = (move?: Move) => {
    if (!text.trim()) return onCommit(null, move)
    try {
      onCommit(JSON.parse(text), move)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Not valid JSON')
    }
  }
  return (
    <div className="flex w-96 flex-col gap-1.5 p-2">
      <textarea
        autoFocus
        aria-label={field.label}
        spellCheck={false}
        value={text}
        rows={8}
        onChange={(event) => {
          setError(undefined)
          setText(event.target.value)
        }}
        onKeyDown={(event) => {
          if (event.key === 'Escape') {
            event.preventDefault()
            event.stopPropagation()
            // Invalid JSON is never saved; Escape then leaves it as it was.
            try {
              if (text.trim()) JSON.parse(text)
              commit()
            } catch {
              onDiscard()
            }
          } else if (
            event.key === 'Enter' &&
            (event.metaKey || event.ctrlKey)
          ) {
            event.preventDefault()
            commit('down')
          }
        }}
        className="w-full resize-none rounded-md border border-separator bg-background p-2 font-mono text-xs text-ink outline-none focus:border-focus"
      />
      <p className={cn('text-xs', error ? 'text-error-ink' : 'text-ink-faint')}>
        {error ?? '⌘↩ to save. Invalid JSON is not saved.'}
      </p>
    </div>
  )
}

function OptionList({
  label,
  options,
  selected,
  multiple,
  emptyText,
  onPick,
  onDone,
  render,
}: {
  label: string
  options: { value: string; label: string }[]
  selected: string[]
  multiple: boolean
  emptyText: string
  onPick: (value: string | null) => void
  onDone: (move?: Move) => void
  render?: (value: string) => ReactNode
}) {
  return (
    <Command
      items={options}
      itemToStringValue={(item: unknown) => (item as { label: string }).label}
    >
      <div
        className="w-64"
        onKeyDown={(event) => {
          if (event.key === 'Escape' || event.key === 'Tab') {
            event.preventDefault()
            event.stopPropagation()
            onDone(
              event.key === 'Tab'
                ? event.shiftKey
                  ? 'left'
                  : 'right'
                : undefined,
            )
          }
        }}
      >
        <CommandInput autoFocus placeholder={`Search ${label.toLowerCase()}`} />
        <CommandList className="max-h-64">
          {(option: { value: string; label: string }) => (
            <CommandItem
              key={option.value}
              value={option}
              onClick={() => onPick(option.value)}
              className="flex items-center gap-2"
            >
              {multiple && (
                <span
                  className={cn(
                    'inline-flex size-3.5 items-center justify-center rounded-[3px] border',
                    selected.includes(option.value)
                      ? 'border-focus bg-focus text-white'
                      : 'border-separator',
                  )}
                >
                  {selected.includes(option.value) && (
                    <Icon.Check className="size-3" />
                  )}
                </span>
              )}
              <span className="min-w-0 flex-1 truncate">
                {render ? render(option.value) : option.label}
              </span>
              {!multiple && selected.includes(option.value) && (
                <Icon.Check className="size-3.5 text-ink-muted" />
              )}
            </CommandItem>
          )}
        </CommandList>
        <CommandEmpty>{emptyText}</CommandEmpty>
        {selected.length > 0 && (
          <button
            type="button"
            onClick={() => onPick(null)}
            className="w-full border-t border-separator px-3 py-1.5 text-start text-xs text-ink-muted hover:bg-hover"
          >
            Clear
          </button>
        )}
      </div>
    </Command>
  )
}

function SelectEditor({ field, value, onCommit }: EditorProps) {
  const type = field.field_type
  const multiple = type.kind === 'enum_many'
  const variants =
    type.kind === 'enum' || type.kind === 'enum_many' ? type.variants : []
  const [picked, setPicked] = useState<string[]>(
    Array.isArray(value)
      ? value.map(asString)
      : isEmptyValue(value)
        ? []
        : [asString(value)],
  )
  // Multi-select saves when it closes, with everything picked meanwhile.
  return (
    <OptionList
      label={field.label}
      options={variants.map((v) => ({ value: v, label: v }))}
      selected={picked}
      multiple={multiple}
      emptyText="No options match"
      render={(v) => <Tag field={field} value={v} />}
      onPick={(v) => {
        if (!multiple) return onCommit(v)
        if (v === null) return setPicked([])
        setPicked((held) =>
          held.includes(v) ? held.filter((x) => x !== v) : [...held, v],
        )
      }}
      onDone={(move) => onCommit(multiple ? picked : (picked[0] ?? null), move)}
    />
  )
}

function RelationEditor({ field, row, model, onCommit }: EditorProps) {
  const type = field.field_type
  const multiple = type.kind === 'relation' && type.cardinality === 'many'
  const { target, rows, title } = useRelationTitles(model, field)
  const [picked, setPicked] = useState<string[]>(
    row ? relationIds(row, field) : [],
  )
  if (!target)
    return (
      <p className="w-64 p-3 text-sm text-ink-muted">
        The object this relation points to is not in the schema.
      </p>
    )
  return (
    <OptionList
      label={target.label_plural}
      options={rows.map((r) => ({
        value: r.id,
        label: recordTitle(target, r),
      }))}
      selected={picked}
      multiple={multiple}
      emptyText={`No ${target.label_plural.toLowerCase()} match`}
      render={(id) => title(id)}
      onPick={(id) => {
        if (!multiple) return onCommit(id)
        if (id === null) return setPicked([])
        setPicked((held) =>
          held.includes(id) ? held.filter((x) => x !== id) : [...held, id],
        )
      }}
      onDone={(move) => onCommit(multiple ? picked : (picked[0] ?? null), move)}
    />
  )
}

/** The editor for a field, or null when it does not edit this way. */
export function FieldEditor(props: EditorProps) {
  switch (props.field.field_type.kind) {
    case 'text':
    case 'long_text':
    case 'integer':
    case 'number':
      return <TextEditor {...props} />
    case 'date':
    case 'timestamp':
      return <DateEditor {...props} />
    case 'json':
      return <JsonEditor {...props} />
    case 'enum':
    case 'enum_many':
      return <SelectEditor {...props} />
    case 'relation':
      return <RelationEditor {...props} />
    default:
      return null
  }
}
