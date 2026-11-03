// SOURCING: none — typed reader for Theorem's schema register as /graphql serves it (rustyred-thg-schema `ObjectType`, `FieldSpec`, `ObservedShape`, `PinRequest`; rustyred-thg-mcp `dataModel`, `dataRecords`, `declareSchema`, `pinObserved`), mirrored from their serde shapes; no library models them

/**
 * The register serializes in snake_case, except the GraphQL wrapper types
 * (`DivergenceSummaryGql`, `RelationEdgeGql`), which async-graphql camelCases.
 */

export type Cardinality = 'one' | 'many'

/** Observe records drift, Warn flags it, Reject refuses the write. */
export type Enforcement = 'observe' | 'warn' | 'reject'

export type SchemaFieldType =
  | { kind: 'text' }
  | { kind: 'long_text' }
  | { kind: 'integer' }
  | { kind: 'number' }
  | { kind: 'boolean' }
  | { kind: 'timestamp' }
  | { kind: 'date' }
  | { kind: 'uuid' }
  | { kind: 'json' }
  | { kind: 'enum'; variants: string[] }
  | { kind: 'enum_many'; variants: string[] }
  | { kind: 'vector'; dim: number }
  | { kind: 'geometry' }
  | {
      kind: 'relation'
      target_object_type_id: string
      cardinality: Cardinality
    }

export type FieldKind = SchemaFieldType['kind']

export type Aggregate =
  | 'sum'
  | 'max'
  | 'min'
  | 'product'
  | 'or'
  | 'and'
  | 'count'
  | 'latest'
  | 'union'

export type FieldSpec = {
  key: string
  label: string
  description?: string
  field_type: SchemaFieldType
  aggregate?: Aggregate
  required: boolean
  system: boolean
  /** Ask the extractor for an evidence span. */
  span?: boolean
  /** Project an enum or relation field onto the Index rail. */
  facet?: boolean
}

export type ProviderFacet =
  | { kind: 'native-view'; relation?: string }
  | { kind: 'declared-record' }
  | { kind: 'derived-program'; program_id: string }
  | { kind: 'connector'; connector_id: string }

export type ObjectType = {
  object_type_id: string
  tenant_id: string
  name_singular: string
  name_plural: string
  label_singular: string
  label_plural: string
  description?: string
  /** The graph label every record of this type carries. */
  node_label: string
  label_identifier_field: string
  fields: FieldSpec[]
  field_sets?: string[]
  field_set_versions?: Record<string, string>
  enforcement: Enforcement
  system: boolean
  provider?: ProviderFacet
  extensions?: Record<string, unknown>
  /** The revision a replace must name; a stale one is refused. */
  content_anchor: string
  retired?: boolean
  /** Added by `dataModel`. */
  record_count?: number
}

/** What `declareSchema` takes: the type without what the register owns. */
export type ObjectTypeInput = Pick<
  ObjectType,
  | 'name_singular'
  | 'name_plural'
  | 'label_singular'
  | 'label_plural'
  | 'description'
  | 'node_label'
  | 'label_identifier_field'
  | 'fields'
  | 'field_sets'
  | 'enforcement'
  | 'system'
  | 'provider'
  | 'extensions'
>

export type JsonTypeTag =
  'null' | 'bool' | 'number' | 'string' | 'array' | 'object'

/** A property seen on records, sampled; not yet a declared field. */
export type ObservedProperty = {
  key: string
  /** Share of sampled records that carry it, 0 to 1. */
  presence_ratio: number
  observed_types: JsonTypeTag[]
  /** Distinct values in the sample. */
  distinct_sample: number
}

export type ObservedRelation = {
  edge_label: string
  target_labels: string[]
  observed_count: number
}

/** A label seen in the graph that no declared type covers. */
export type ObservedShape = {
  node_label: string
  node_count: number
  properties: ObservedProperty[]
  outbound: ObservedRelation[]
  graph_version: number
}

export type DivergenceKind =
  'missing_required_field' | 'type_mismatch' | 'unknown_key'

export type Divergence = {
  objectTypeId: string
  nodeLabel: string
  field: string
  kind: DivergenceKind
  count: number
}

export type RelationEdge = {
  fromLabel: string
  edgeLabel: string
  /** A declared relation names the target type's id; an observed one its label. */
  toLabel: string
  declared: boolean
}

export type DataModel = {
  objectTypes: ObjectType[]
  observedShapes: ObservedShape[]
  divergences: Divergence[]
  relations: RelationEdge[]
}

export type PinKind = 'type' | 'field' | 'edge'

/** Promote something observed into the declared schema. */
export type PinRequest = {
  observed_key: string
  kind: PinKind
  parent_observed_key?: string
  field_key?: string
}

/** One record as the table holds it. */
export type RecordRow = {
  id: string
  values: Record<string, unknown>
  /** Related record ids by relation field key, from hydrated links. */
  relations: Record<string, string[]>
}

export type RecordPage = { rows: RecordRow[]; cursor?: string }

/** The register's record verbs (SR6), as the write mutation names them. */
export type RecordVerb = 'create_one' | 'update_one' | 'delete_one'
