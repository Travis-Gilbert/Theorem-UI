// SOURCING: platform fetch against Theorem's /graphql (rustyred-thg-mcp's async-graphql schema; a handful of fixed operations need no GraphQL client), the shared CSRF/idempotency helper from lib/theorem/client, TheoremError so describeError and isSignedOut read failures as they do elsewhere
import { TheoremError } from '@theoremharness/sdk'
import { mutate } from '@/lib/theorem/client'
import type { MutationHeaders } from '@/lib/theorem/client'
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

  /** The schema has no such field: this Theorem does not serve the operation yet. */
  missingField(field: string) {
    return this.errors.some((error) =>
      error.message.includes(`Unknown field "${field}"`),
    )
  }
}

/** The write mutation this UI expects at the register's owner. */
export const RECORD_WRITE_FIELD = 'invokeRecordVerb'

export const recordWritesUnavailable = (error: unknown) =>
  error instanceof GraphQLRequestError && error.missingField(RECORD_WRITE_FIELD)

async function post<T>(
  query: string,
  variables: Record<string, unknown>,
  headers?: MutationHeaders,
): Promise<T> {
  const response = await fetch(ENDPOINT, {
    method: 'POST',
    credentials: 'same-origin',
    headers: { 'content-type': 'application/json', ...headers },
    body: JSON.stringify({ query, variables }),
  })
  const text = await response.text()
  const body = text ? (JSON.parse(text) as unknown) : undefined
  if (!response.ok)
    throw new TheoremError({
      message: `${response.status} ${response.statusText}`,
      statusCode: response.status,
      body,
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

const RECORD_KEYS = new Set([
  'id',
  'node_id',
  'labels',
  'label',
  'properties',
  'links',
  'edges',
  'tombstone',
])

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

/**
 * The Data API returns graph nodes. Accept a node with its values under
 * `properties` or alongside its id, and links as edges in either direction.
 */
export function decodeRecord(raw: unknown): RecordRow | undefined {
  if (!isObject(raw)) return undefined
  const id =
    typeof raw.id === 'string'
      ? raw.id
      : typeof raw.node_id === 'string'
        ? raw.node_id
        : undefined
  if (!id || raw.tombstone === true) return undefined
  const values = isObject(raw.properties)
    ? { ...raw.properties }
    : Object.fromEntries(
        Object.entries(raw).filter(([key]) => !RECORD_KEYS.has(key)),
      )
  const relations: Record<string, string[]> = {}
  const links = Array.isArray(raw.links)
    ? raw.links
    : Array.isArray(raw.edges)
      ? raw.edges
      : []
  for (const link of links) {
    if (!isObject(link)) continue
    const edge = [link.edge_type, link.type, link.label].find(
      (v): v is string => typeof v === 'string',
    )
    const other = [link.to_id, link.target, link.to, link.other_id].find(
      (v): v is string => typeof v === 'string' && v !== id,
    )
    if (edge && other) (relations[edge] ??= []).push(other)
  }
  return { id, values, relations }
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
  const raw = isObject(data.dataRecord)
    ? (data.dataRecord.record ?? data.dataRecord)
    : undefined
  return decodeRecord(raw)
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
