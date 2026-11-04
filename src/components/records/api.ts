// SOURCING: theoremJson (the SDK's fetch passthrough) against Theorem's /graphql (rustyred-thg-mcp's async-graphql schema; a handful of fixed operations need no GraphQL client) and the shared CSRF/idempotency helper from lib/theorem/client
import { mutate } from '@/lib/theorem/client'
import type { MutationHeaders } from '@/lib/theorem/client'
import { theoremJson } from '@/lib/theorem/passthrough'
import type {
  DataModel,
  ObjectType,
  ObjectTypeInput,
  PinRequest,
  RecordPage,
  RecordRow,
  RecordVerb,
} from './contract'

const ENDPOINT = '/graphql'

type GraphQLError = { message: string; path?: (string | number)[] }

/** A response that came back with GraphQL errors and no usable data. */
export class GraphQLRequestError extends Error {
  readonly errors: GraphQLError[]
  constructor(errors: GraphQLError[]) {
    super(errors.map((error) => error.message).join('; '))
    this.name = 'GraphQLRequestError'
    this.errors = errors
  }
}

/** The write mutation this UI expects at the register's owner. */
export const RECORD_WRITE_FIELD = 'invokeRecordVerb'

async function post<T>(
  query: string,
  variables: Record<string, unknown>,
  headers?: MutationHeaders,
): Promise<T> {
  const body = await theoremJson<unknown>(ENDPOINT, {
    method: 'POST',
    headers,
    body: { query, variables },
  })
  const { data, errors } = (body ?? {}) as {
    data?: T | null
    errors?: GraphQLError[]
  }
  if (errors?.length || data == null)
    throw new GraphQLRequestError(errors ?? [{ message: 'Empty response' }])
  return data
}

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

export async function readDataModel(includeObserved = true) {
  const data = await query<{ dataModel: DataModel }>(DATA_MODEL, {
    includeObserved,
  })
  return data.dataModel
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
  return {
    id: raw.id,
    values: isObject(raw.fields) ? raw.fields : {},
    relations,
  }
}

export async function readRecords(
  nodeLabel: string,
  cursor?: string,
  limit = 500,
): Promise<RecordPage> {
  const data = await query<{ dataRecords: unknown }>(
    `query Records($label: String!, $limit: Int, $cursor: String) {
      dataRecords(label: $label, limit: $limit, cursor: $cursor, hydrateLinks: true)
    }`,
    { label: nodeLabel, limit, cursor },
  )
  const envelope = isObject(data.dataRecords) ? data.dataRecords : {}
  const rows = (Array.isArray(envelope.records) ? envelope.records : [])
    .map(decodeRecord)
    .filter((row): row is RecordRow => row !== undefined)
  const next = envelope.next_cursor ?? envelope.cursor
  return {
    rows,
    cursor: typeof next === 'string' && next !== cursor ? next : undefined,
  }
}

export async function readRecord(id: string) {
  const data = await query<{ dataRecord: unknown }>(
    `query Record($id: String!) { dataRecord(id: $id, hydrateLinks: true) }`,
    { id },
  )
  const records = isObject(data.dataRecord) ? data.dataRecord.records : undefined
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
