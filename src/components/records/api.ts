// SOURCING: lib/theorem/graphql (Theorem's /graphql through the SDK's fetch passthrough) and the shared CSRF/idempotency helper from lib/theorem/client
import { mutate } from '@/lib/theorem/client'
import { graphql as post } from '@/lib/theorem/graphql'
import type {
  DataModel,
  ObjectType,
  ObjectTypeInput,
  PinRequest,
  RecordPage,
  RecordRow,
  RecordVerb,
} from './contract'

export { GraphQLRequestError } from '@/lib/theorem/graphql'

/** The write mutation this UI expects at the register's owner. */
export const RECORD_WRITE_FIELD = 'invokeRecordVerb'

const query = <T>(document: string, variables: Record<string, unknown> = {}) =>
  post<T>(document, variables)

/** Writes carry CSRF and an idempotency key, retried once on a stale session. */
const write = <T>(document: string, variables: Record<string, unknown>) =>
  mutate((headers) => post<T>(document, variables, headers))

// Schema

const DATA_MODEL = `query DataModel($includeObserved: Boolean!) {
  dataModel(includeObserved: $includeObserved) {
    objectTypes
    observedShapes
    divergences { objectTypeId nodeLabel field kind count }
    relations { fromLabel edgeLabel toLabel declared }
  }
}`

const WITH_RETIRED = `query DataModelWithRetired {
  dataModel(includeObserved: false, includeRetired: true) {
    objectTypes
    observedShapes
    divergences { objectTypeId nodeLabel field kind count }
    relations { fromLabel edgeLabel toLabel declared }
  }
}`

export async function readDataModel(includeObserved = true) {
  const data = await query<{ dataModel: DataModel }>(DATA_MODEL, {
    includeObserved,
  })
  return data.dataModel
}

/**
 * Every declared class, retired ones included and marked `retired`: a retired
 * class still holds its name and label, so whatever names a new class reads
 * this.
 */
export async function readEveryClass() {
  const data = await query<{ dataModel: DataModel }>(WITH_RETIRED, {})
  return data.dataModel.objectTypes
}

export type DeclareResult = {
  status: 'declared' | 'conflict'
  idempotent_replay: boolean
  object_type: ObjectType
  conflict?: { conflict_id: string; object_type_id: string }
  graph_version_after: number
}

/** The register refused a replace: someone changed the type since it was read. */
export class SchemaConflictError extends Error {
  readonly result: DeclareResult
  constructor(result: DeclareResult) {
    super(
      `${result.object_type.label_singular} changed while you were editing it. Reload and try again.`,
    )
    this.name = 'SchemaConflictError'
    this.result = result
  }
}

/**
 * Declare a new type, or replace one: a replace names the anchor it read, so
 * two people editing the same type cannot overwrite each other.
 */
export async function declareObjectType(
  input: ObjectTypeInput,
  expectedContentAnchor?: string,
) {
  const data = await write<{ declareSchema: DeclareResult }>(
    `mutation Declare($input: JSON!) { declareSchema(input: $input) }`,
    {
      input: expectedContentAnchor
        ? { ...input, expected_content_anchor: expectedContentAnchor }
        : input,
    },
  )
  if (data.declareSchema.status === 'conflict')
    throw new SchemaConflictError(data.declareSchema)
  return data.declareSchema
}

export async function pinObserved(request: PinRequest) {
  const data = await write<{ pinObserved: unknown }>(
    `mutation Pin($input: JSON!) { pinObserved(input: $input) }`,
    { input: request },
  )
  return data.pinObserved
}

/** Retire a declared type; its records stay in the graph, observed again. */
export async function retireObjectType(objectTypeId: string) {
  const data = await write<{ unpinDeclared: unknown }>(
    `mutation Retire($targetId: String!) { unpinDeclared(targetId: $targetId) }`,
    { targetId: objectTypeId },
  )
  return data.unpinDeclared
}

// Records

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

/**
 * One Data API record: values under `fields`, links under `edges` in both
 * directions. A relation field names what this record points at, so only
 * outgoing edges fill it, keyed by edge type.
 */
export function decodeRecord(raw: unknown): RecordRow | undefined {
  if (!isObject(raw) || typeof raw.id !== 'string') return undefined
  const relations: Record<string, string[]> = {}
  for (const link of Array.isArray(raw.edges) ? raw.edges : []) {
    if (!isObject(link) || link.direction !== 'out') continue
    const { type, to_id: to } = link
    if (typeof type === 'string' && typeof to === 'string')
      (relations[type] ??= []).push(to)
  }
  // The Data API names a record's values `fields`; a record verb's result
  // (create_one, update_one) returns the graph node, whose values are `properties`.
  const values = isObject(raw.fields)
    ? raw.fields
    : isObject(raw.properties)
      ? raw.properties
      : {}
  return { id: raw.id, values, relations }
}

export async function readRecord(id: string) {
  const data = await query<{ dataRecord: unknown }>(
    `query Record($id: String!) { dataRecord(id: $id, hydrateLinks: true) }`,
    { id },
  )
  const records = isObject(data.dataRecord)
    ? data.dataRecord.records
    : undefined
  return decodeRecord(Array.isArray(records) ? records[0] : undefined)
}

/** Whether this Theorem's schema has the write mutation the table would call. */
export async function readRecordWritesServed() {
  const data = await query<{
    __schema: { mutationType: { fields: { name: string }[] } | null }
  }>(`query RecordWrites { __schema { mutationType { fields { name } } } }`)
  return (
    data.__schema.mutationType?.fields.some(
      (field) => field.name === RECORD_WRITE_FIELD,
    ) ?? false
  )
}

/**
 * Run one of the register's record verbs. Input follows the verb's generated
 * tool schema: field values by key, plus `id` to update or delete.
 */
async function invokeRecordVerb(
  objectTypeId: string,
  verb: RecordVerb,
  input: Record<string, unknown>,
) {
  const data = await write<Record<string, unknown>>(
    `mutation RecordVerb($objectTypeId: String!, $verb: String!, $input: JSON!) {
      ${RECORD_WRITE_FIELD}(objectTypeId: $objectTypeId, verb: $verb, input: $input)
    }`,
    { objectTypeId, verb, input },
  )
  return data[RECORD_WRITE_FIELD]
}

export async function createRecord(
  objectTypeId: string,
  values: Record<string, unknown>,
) {
  const result = await invokeRecordVerb(objectTypeId, 'create_one', values)
  const raw = isObject(result) ? (result.record ?? result) : undefined
  const row = decodeRecord(raw)
  if (!row) throw new Error('Theorem created the record but did not return it.')
  return row
}

export async function updateRecord(
  objectTypeId: string,
  id: string,
  patch: Record<string, unknown>,
) {
  await invokeRecordVerb(objectTypeId, 'update_one', { ...patch, id })
}

export async function deleteRecord(objectTypeId: string, id: string) {
  await invokeRecordVerb(objectTypeId, 'delete_one', { id })
}

/** One server-side condition on a record verb that reads (`find_many`). */
export type RecordFilter = {
  field_key: string
  operator:
    'eq' | 'contains' | 'icontains' | 'starts_with' | 'in' | 'is_not_empty'
  value?: unknown
}
export type RecordSort = { field_key: string; direction: 'asc' | 'desc' }

/**
 * A page of one class's records, filtered and sorted by Theorem, with the
 * number that match. Offset paging, as the verb serves it.
 */
/**
 * One page of a class's records through its find_many verb, which scopes by
 * the record's workspace however it was written; the cursor is the offset
 * of the next page.
 */
export async function readClassPage(
  objectTypeId: string,
  cursor?: string,
  limit = 500,
): Promise<RecordPage> {
  const offset = Number(cursor ?? 0) || 0
  const page = await findRecords(objectTypeId, { offset, limit })
  const next = offset + page.rows.length
  return {
    rows: page.rows,
    ...(page.rows.length && next < page.count ? { cursor: String(next) } : {}),
  }
}

export async function findRecords(
  objectTypeId: string,
  {
    filters = [],
    sorts = [],
    offset = 0,
    limit = 60,
  }: {
    filters?: RecordFilter[]
    sorts?: RecordSort[]
    offset?: number
    limit?: number
  } = {},
) {
  const result = await invokeRecordVerb(objectTypeId, 'find_many', {
    ...(filters.length ? { filters } : {}),
    ...(sorts.length ? { sorts } : {}),
    offset,
    limit,
  })
  const envelope = isObject(result) ? result : {}
  const rows = (Array.isArray(envelope.records) ? envelope.records : [])
    .map(decodeRecord)
    .filter((row): row is RecordRow => row !== undefined)
  const count =
    typeof envelope.count === 'number' ? envelope.count : offset + rows.length
  return { rows, count, offset }
}
