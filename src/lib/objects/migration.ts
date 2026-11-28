// SOURCING: none — the conversion of existing values when a class's property changes type, over the register's own verbs (records/api findRecords, the find_many verb that owns a class's records, declareObjectType with its expected_content_anchor, updateRecord); evolution.ts names what a change breaks, this converts what it can and refuses the rest by record. Hand-rolled because the register has no migration verb: it validates each write, so a migration is a declaration and one write per object, undone the same way when one fails.
import {
  declareObjectType,
  findRecords,
  updateRecord,
} from '@/components/records/api'
import type {
  FieldSpec,
  ObjectType,
  ObjectTypeInput,
  RecordRow,
  SchemaFieldType,
} from '@/components/records/contract'
import { recordTitle } from '@/components/records/model'
import { toInput } from '@/components/records/schema-edit'
import { incompatibilities } from './evolution'

type Converted = { ok: true; value: unknown } | { ok: false; reason: string }

const empty = (value: unknown) =>
  value === undefined ||
  value === null ||
  value === '' ||
  (Array.isArray(value) && value.length === 0)

const isText = (t: SchemaFieldType) =>
  t.kind === 'text' || t.kind === 'long_text'
const isNumber = (t: SchemaFieldType) =>
  t.kind === 'number' || t.kind === 'integer'

const asNumber = (value: unknown, integer: boolean): Converted => {
  const n =
    typeof value === 'number'
      ? value
      : typeof value === 'string' && value.trim() !== ''
        ? Number(value.trim())
        : Number.NaN
  if (!Number.isFinite(n))
    return { ok: false, reason: `"${String(value)}" is not a number` }
  if (integer && !Number.isInteger(n))
    return { ok: false, reason: `${n} is not a whole number` }
  return { ok: true, value: n }
}

const choice = (value: unknown, variants: string[]): Converted => {
  const text = String(value)
  const found =
    variants.find((v) => v === text) ??
    variants.find((v) => v.toLowerCase() === text.trim().toLowerCase())
  return found
    ? { ok: true, value: found }
    : { ok: false, reason: `"${text}" is not one of its choices` }
}

/** One existing value under a property's new type, or why it cannot be. */
export function convertValue(
  value: unknown,
  from: SchemaFieldType,
  to: SchemaFieldType,
): Converted {
  if (empty(value)) return { ok: true, value }
  if (JSON.stringify(from) === JSON.stringify(to)) return { ok: true, value }
  if (isText(to)) {
    if (Array.isArray(value)) return { ok: true, value: value.join(', ') }
    if (typeof value === 'object')
      return { ok: true, value: JSON.stringify(value) }
    return { ok: true, value: String(value) }
  }
  if (isNumber(to)) {
    if (Array.isArray(value))
      return value.length === 1
        ? asNumber(value[0], to.kind === 'integer')
        : { ok: false, reason: `holds ${value.length} values` }
    if (typeof value === 'boolean') return { ok: true, value: value ? 1 : 0 }
    return asNumber(value, to.kind === 'integer')
  }
  if (to.kind === 'boolean') {
    if (typeof value === 'boolean') return { ok: true, value }
    if (typeof value === 'number') return { ok: true, value: value !== 0 }
    const text = String(value).trim().toLowerCase()
    if (['true', 'yes', '1'].includes(text)) return { ok: true, value: true }
    if (['false', 'no', '0'].includes(text)) return { ok: true, value: false }
    return { ok: false, reason: `"${String(value)}" is not yes or no` }
  }
  if (to.kind === 'date' || to.kind === 'timestamp') {
    const time = Date.parse(String(value))
    if (Number.isNaN(time))
      return { ok: false, reason: `"${String(value)}" is not a date` }
    const iso = new Date(time).toISOString()
    return { ok: true, value: to.kind === 'date' ? iso.slice(0, 10) : iso }
  }
  if (to.kind === 'enum') {
    if (Array.isArray(value))
      return value.length === 1
        ? choice(value[0], to.variants)
        : { ok: false, reason: `holds ${value.length} choices` }
    return choice(value, to.variants)
  }
  if (to.kind === 'enum_many') {
    const values = Array.isArray(value) ? value : [value]
    const out: string[] = []
    for (const v of values) {
      const one = choice(v, to.variants)
      if (!one.ok) return one
      out.push(one.value as string)
    }
    return { ok: true, value: out }
  }
  if (to.kind === 'relation' && from.kind === 'relation') {
    if (from.target_object_type_id !== to.target_object_type_id)
      return { ok: false, reason: 'points at another class' }
    if (to.cardinality === 'many')
      return { ok: true, value: Array.isArray(value) ? value : [value] }
    if (Array.isArray(value))
      return value.length === 1
        ? { ok: true, value: value[0] }
        : { ok: false, reason: `links ${value.length} objects` }
    return { ok: true, value }
  }
  if (to.kind === 'json') return { ok: true, value }
  return {
    ok: false,
    reason: `${from.kind} values cannot become ${to.kind}`,
  }
}

export type MigrationRow = {
  id: string
  title: string
  patch: Record<string, unknown>
  /** What it had before, for the fields the patch changes. */
  previous: Record<string, unknown>
  failures: { field: string; label: string; reason: string }[]
}

export type MigrationPlan = {
  before: ObjectType
  after: ObjectTypeInput
  /** The properties whose existing values are converted or filled. */
  fields: FieldSpec[]
  rows: MigrationRow[]
  /** Each object's values as previewed, compared again before applying. */
  snapshot: Map<string, string>
}

/** Whether a change needs existing objects migrated rather than only declared. */
export const needsMigration = (before: ObjectType, after: ObjectTypeInput) =>
  incompatibilities(before, after).some((f) => f.reason !== 'removed')

/** Every record under `nodeLabel`, page by page. */
/** One page of a class's records from `offset`, with how many there are. */
export type ReadPage = (
  objectTypeId: string,
  offset: number,
) => Promise<{ rows: RecordRow[]; count?: number }>

const findPage: ReadPage = (objectTypeId, offset) =>
  findRecords(objectTypeId, { offset, limit: 200 })

/**
 * Every record of a class, through the record verbs that wrote them. The
 * graph's label scan filters on a tenant marker these records do not carry.
 */
export const everyRecord = async (
  objectTypeId: string,
  read: ReadPage = findPage,
): Promise<RecordRow[]> => {
  const rows: RecordRow[] = []
  for (;;) {
    const page = await read(objectTypeId, rows.length)
    rows.push(...page.rows)
    if (!page.rows.length || rows.length >= (page.count ?? rows.length)) break
  }
  return rows
}

/**
 * What applying `after` would do to every existing object: the value each
 * changed property would take, filled from `fills` where one is required and
 * missing, and which objects cannot take it and why. Nothing is written.
 */
export async function planMigration(
  before: ObjectType,
  after: ObjectTypeInput,
  fills: Record<string, unknown> = {},
  read: ReadPage = findPage,
): Promise<MigrationPlan> {
  const was = new Map(before.fields.map((f) => [f.key, f]))
  const touched = new Set(
    incompatibilities(before, after)
      .filter((f) => f.reason !== 'removed')
      .map((f) => f.field),
  )
  const fields = after.fields.filter((f) => touched.has(f.key))
  const records = await everyRecord(before.object_type_id, read)
  const snapshot = new Map(
    records.map((row) => [row.id, JSON.stringify(row.values)] as const),
  )
  const rows = records.map((row): MigrationRow => {
    const patch: Record<string, unknown> = {}
    const previous: Record<string, unknown> = {}
    const failures: MigrationRow['failures'] = []
    for (const field of fields) {
      const old = was.get(field.key)
      const value = row.values[field.key]
      let next: Converted = old
        ? convertValue(value, old.field_type, field.field_type)
        : { ok: true, value: undefined }
      if (next.ok && empty(next.value) && field.required) {
        const fill = fills[field.key]
        next = empty(fill)
          ? { ok: false, reason: 'has no value, and it would be required' }
          : convertValue(fill, { kind: 'text' }, field.field_type)
      }
      if (!next.ok) {
        failures.push({
          field: field.key,
          label: field.label,
          reason: next.reason,
        })
        continue
      }
      if (JSON.stringify(next.value) !== JSON.stringify(value)) {
        patch[field.key] = next.value ?? null
        previous[field.key] = value ?? null
      }
    }
    return {
      id: row.id,
      title: recordTitle(before, row),
      patch,
      previous,
      failures,
    }
  })
  return { before, after, fields, rows, snapshot }
}

export class MigrationError extends Error {
  readonly restored: boolean
  constructor(message: string, restored: boolean) {
    super(message)
    this.name = 'MigrationError'
    this.restored = restored
  }
}

export type MigrationCalls = {
  read: ReadPage
  declare: typeof declareObjectType
  update: typeof updateRecord
}

const REAL: MigrationCalls = {
  read: findPage,
  declare: declareObjectType,
  update: updateRecord,
}

/**
 * Apply a previewed plan: refuse if any object changed since the preview,
 * declare the new definition against the anchor the preview read, then write
 * each converted object. If any write fails, the previous definition is
 * declared again and the objects already written get their old values back.
 */
export async function applyMigration(
  plan: MigrationPlan,
  calls: MigrationCalls = REAL,
): Promise<ObjectType> {
  if (plan.rows.some((row) => row.failures.length))
    throw new MigrationError(
      'Some objects cannot take the change; nothing was written.',
      true,
    )
  const now = await everyRecord(plan.before.object_type_id, calls.read)
  const moved =
    now.length !== plan.snapshot.size ||
    now.some((row) => plan.snapshot.get(row.id) !== JSON.stringify(row.values))
  if (moved)
    throw new MigrationError(
      `${plan.before.label_plural} changed since the preview; nothing was written. Preview it again.`,
      true,
    )
  const declared = await calls.declare(plan.after, plan.before.content_anchor)
  const done: MigrationRow[] = []
  try {
    for (const row of plan.rows) {
      if (!Object.keys(row.patch).length) continue
      await calls.update(plan.before.object_type_id, row.id, row.patch)
      done.push(row)
    }
  } catch (problem) {
    const reason = problem instanceof Error ? problem.message : String(problem)
    let restored = true
    try {
      await calls.declare(
        toInput(plan.before),
        declared.object_type.content_anchor,
      )
      for (const row of done.toReversed())
        await calls.update(plan.before.object_type_id, row.id, row.previous)
    } catch {
      restored = false
    }
    throw new MigrationError(
      restored
        ? `The migration stopped at an object it could not write (${reason}). The previous definition and every value were put back.`
        : `The migration stopped at an object it could not write (${reason}), and putting things back also failed.`,
      restored,
    )
  }
  return declared.object_type
}
