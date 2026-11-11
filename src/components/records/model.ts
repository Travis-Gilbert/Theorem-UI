// SOURCING: none — pure lookups over the schema register's types (./contract): record ids in the Index URL, type and field resolution, record titles, and per-field display hints kept in a type's `extensions`
import type {
  DataModel,
  FieldSpec,
  JsonTypeTag,
  ObjectType,
  ObservedProperty,
  RecordRow,
} from './contract'

/**
 * A record opens in the Index working pane as `record:<name_singular>/<id>`.
 * Documents keep their bare ids, so the inspector can tell the two apart.
 */
export const RECORD_ITEM_PREFIX = 'record:'

export const recordItemId = (type: ObjectType, id: string) =>
  `${RECORD_ITEM_PREFIX}${type.name_singular}/${id}`

export function parseRecordItemId(item: string) {
  if (!item.startsWith(RECORD_ITEM_PREFIX)) return undefined
  const rest = item.slice(RECORD_ITEM_PREFIX.length)
  const slash = rest.indexOf('/')
  if (slash <= 0 || slash === rest.length - 1) return undefined
  return { nameSingular: rest.slice(0, slash), recordId: rest.slice(slash + 1) }
}

export const objectTypeByName = (
  model: DataModel | undefined,
  nameSingular: string,
) => model?.objectTypes.find((type) => type.name_singular === nameSingular)

/**
 * A relation's target is a type id when declared and a node label when
 * observed; accept either, and a name, so a hand-written target resolves.
 */
export const resolveObjectType = (model: DataModel | undefined, ref: string) =>
  model?.objectTypes.find(
    (type) =>
      type.object_type_id === ref ||
      type.node_label === ref ||
      type.name_singular === ref,
  )

export const fieldByKey = (type: ObjectType, key: string) =>
  type.fields.find((field) => field.key === key)

export function isEmptyValue(value: unknown) {
  if (value === null || value === undefined || value === '') return true
  if (Array.isArray(value)) return value.length === 0
  if (typeof value === 'object') return Object.keys(value).length === 0
  return false
}

/** What a record is called: its label identifier, else the usual suspects. */
export function recordTitle(type: ObjectType, row: RecordRow | undefined) {
  if (!row) return 'Untitled'
  for (const key of [type.label_identifier_field, 'name', 'title', 'label']) {
    const value = row.values[key]
    if (typeof value === 'string' && value.trim()) return value
    if (typeof value === 'number') return String(value)
  }
  return 'Untitled'
}

/** The field the first column shows: the label identifier when it is a field. */
export function identifierField(type: ObjectType): FieldSpec | undefined {
  return (
    fieldByKey(type, type.label_identifier_field) ??
    type.fields.find((field) => field.field_type.kind === 'text')
  )
}

/** Relation fields on other types that point here: a record's tasks, notes and the rest. */
export function inboundRelations(
  model: DataModel | undefined,
  type: ObjectType,
) {
  const refs = new Set([
    type.object_type_id,
    type.node_label,
    type.name_singular,
  ])
  return (model?.objectTypes ?? []).flatMap((from) =>
    from.retired
      ? []
      : from.fields
          .filter(
            (field) =>
              field.field_type.kind === 'relation' &&
              refs.has(field.field_type.target_object_type_id),
          )
          .map((field) => ({ from, field })),
  )
}

const jsonType = (value: unknown): JsonTypeTag =>
  value === null || value === undefined
    ? 'null'
    : Array.isArray(value)
      ? 'array'
      : typeof value === 'boolean'
        ? 'bool'
        : typeof value === 'number'
          ? 'number'
          : typeof value === 'string'
            ? 'string'
            : 'object'

/**
 * A property as the register's observer would summarize it, from the rows
 * this page has loaded: how often it is there, what JSON types it takes and
 * how many distinct values it has.
 */
export function observeProperty(
  rows: RecordRow[],
  key: string,
): ObservedProperty {
  const present = rows.filter(
    (row) => key in row.values && row.values[key] !== undefined,
  )
  const types = [
    ...new Set(present.map((row) => jsonType(row.values[key]))),
  ].sort()
  const distinct = new Set(
    present.map((row) => JSON.stringify(row.values[key])),
  ).size
  return {
    key,
    presence_ratio: rows.length ? present.length / rows.length : 0,
    observed_types: types,
    distinct_sample: distinct,
  }
}

/** Keys records carry that the type does not declare. */
export function undeclaredKeys(type: ObjectType, rows: RecordRow[]) {
  const declared = new Set(type.fields.map((f) => f.key))
  const seen = new Set<string>()
  for (const row of rows)
    for (const key of Object.keys(row.values))
      if (!declared.has(key) && !key.startsWith('_')) seen.add(key)
  return [...seen].sort()
}

// Display hints

/**
 * How a plain field should read, beyond its type. The register's types are
 * deliberately few; an email is text and a price is a number. The hint lives
 * in the type's extensions, so it travels with the declaration and needs no
 * new field type.
 */
export type DisplayHint =
  | { display: 'email' }
  | { display: 'url' }
  | { display: 'phone' }
  | { display: 'currency'; currency: string }
  | { display: 'percent' }
  | { display: 'rating'; max: number }

export type DisplayName = DisplayHint['display']

const UI_EXTENSION = 'theorem.ui'

type UiExtension = { fields?: Record<string, DisplayHint> }

const uiExtension = (type: Pick<ObjectType, 'extensions'>): UiExtension => {
  const value = type.extensions?.[UI_EXTENSION]
  return value && typeof value === 'object' ? value : {}
}

export const displayHint = (
  type: Pick<ObjectType, 'extensions'>,
  key: string,
): DisplayHint | undefined => uiExtension(type).fields?.[key]

/** The extensions with one field's hint set, or cleared when `hint` is undefined. */
export function withDisplayHint(
  type: Pick<ObjectType, 'extensions'>,
  key: string,
  hint: DisplayHint | undefined,
): Record<string, unknown> {
  const ui = uiExtension(type)
  const fields = { ...ui.fields }
  if (hint) fields[key] = hint
  else delete fields[key]
  const next = { ...type.extensions }
  if (Object.keys(fields).length || Object.keys(ui).length > 1)
    next[UI_EXTENSION] = { ...ui, fields }
  else delete next[UI_EXTENSION]
  return next
}
