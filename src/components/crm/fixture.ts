// SOURCING: none — an in-memory stand-in for the part of Theorem's /graphql the CRM talks to (dataModel, lifeContext, installLifeContextTypes, bindSelfPerson, recordChanges, invokeRecordVerb, declareSchema), for unit tests and for mocked screenshots. The built-in types mirror rustyred-thg-schema's life_context declarations; the refusals carry the server's own codes. It is test data, never shipped behaviour: nothing in the app imports it.
import type {
  DataModel,
  FieldSpec,
  ObjectType,
  SchemaFieldType,
} from '@/components/records/contract'

const WORKSPACE = 'demo'
const typeId = (singular: string) =>
  `objtype:${WORKSPACE}:${singular.toLowerCase()}`

const field = (
  key: string,
  label: string,
  field_type: SchemaFieldType,
  extra: Partial<FieldSpec> = {},
): FieldSpec => ({
  key,
  label,
  field_type,
  required: false,
  system: false,
  ...extra,
})

const text = (key: string, label: string, extra?: Partial<FieldSpec>) =>
  field(key, label, { kind: 'text' }, extra)
const long = (key: string, label: string) =>
  field(key, label, { kind: 'long_text' })
const choice = (key: string, label: string, variants: string[]) =>
  field(key, label, { kind: 'enum', variants }, { facet: true })
const one = (key: string, label: string, target: string) =>
  field(key, label, {
    kind: 'relation',
    target_object_type_id: typeId(target),
    cardinality: 'one',
  })
const many = (key: string, label: string, target: string) =>
  field(key, label, {
    kind: 'relation',
    target_object_type_id: typeId(target),
    cardinality: 'many',
  })

const contextUse = () =>
  field(
    'context_use',
    'Assistant use',
    { kind: 'enum', variants: ['available', 'private'] },
    {
      description:
        'Whether Theorem may use this record when it answers. Private keeps the whole record out.',
    },
  )

function builtIn(
  singular: string,
  plural: string,
  identifier: string,
  fields: FieldSpec[],
  policy: Record<string, unknown> = {},
): ObjectType {
  return {
    object_type_id: typeId(singular),
    tenant_id: WORKSPACE,
    name_singular: singular,
    name_plural: plural,
    label_singular: singular,
    label_plural: plural,
    node_label: singular,
    label_identifier_field: identifier,
    fields: [...fields, contextUse()],
    enforcement: 'warn',
    system: false,
    extensions: {
      'theorem.context': { version: 1, assistance: 'available', ...policy },
      'theorem.crm': { version: 1, built_in: true },
    },
    content_anchor: `anchor:${singular.toLowerCase()}:1`,
  }
}

/** The built-in types, as `installLifeContextTypes` declares them. */
export function fixtureTypes(): ObjectType[] {
  return [
    builtIn('Organization', 'Organizations', 'name', [
      text('name', 'Name', { required: true }),
      text('domain', 'Domain'),
      long('about', 'About'),
      text('location', 'Location'),
    ]),
    builtIn(
      'Person',
      'People',
      'name',
      [
        text('name', 'Name', { required: true }),
        text('aliases', 'Also called'),
        text('email', 'Email'),
        text('phone', 'Phone'),
        { ...one('organization', 'Organization', 'Organization'), facet: true },
        text('role', 'Role'),
        text('location', 'Location'),
        long('notes', 'Notes'),
      ],
      { mention_fields: ['aliases'] },
    ),
    builtIn('Activity', 'Activities', 'name', [
      text('name', 'Name', { required: true }),
      choice('status', 'Status', ['planned', 'active', 'paused', 'done']),
      long('description', 'Description'),
      many('people', 'People', 'Person'),
      one('organization', 'Organization', 'Organization'),
      text('starts', 'Starts'),
      text('ends', 'Ends'),
    ]),
    builtIn('Commitment', 'Commitments', 'title', [
      text('title', 'Commitment', { required: true }),
      one('owed_by', 'Owed by', 'Person'),
      one('owed_to', 'Owed to', 'Person'),
      one('activity', 'Activity', 'Activity'),
      text('due', 'Due'),
      choice('status', 'Status', ['open', 'done', 'dropped']),
      long('details', 'Details'),
      text('task', 'Task'),
      text('draft', 'Draft'),
    ]),
    builtIn('Interaction', 'Interactions', 'summary', [
      text('summary', 'Summary', { required: true }),
      choice('kind', 'Kind', [
        'meeting',
        'call',
        'message',
        'email',
        'in_person',
        'other',
      ]),
      many('people', 'People', 'Person'),
      one('activity', 'Activity', 'Activity'),
      text('occurred', 'When'),
      long('notes', 'Notes'),
    ]),
    builtIn(
      'Goal',
      'Goals',
      'title',
      [
        text('title', 'Goal', { required: true }),
        one('held_by', 'Held by', 'Person'),
        one('activity', 'Activity', 'Activity'),
        choice('status', 'Status', ['active', 'reached', 'set_aside']),
        long('why', 'Why'),
      ],
      { standing: true },
    ),
    builtIn(
      'Constraint',
      'Constraints',
      'statement',
      [
        text('statement', 'Constraint', { required: true }),
        choice('kind', 'Kind', [
          'availability',
          'budget',
          'preference',
          'rule',
          'other',
        ]),
        one('applies_to', 'Applies to', 'Person'),
        text('from', 'From'),
        text('until', 'Until'),
      ],
      { standing: true },
    ),
    builtIn(
      'Relationship',
      'Relationships',
      'relation',
      [
        text('relation', 'Relation', { required: true }),
        choice('kind', 'Kind', [
          'family',
          'partner',
          'friend',
          'work',
          'business',
          'membership',
          'other',
        ]),
        one('from_person', 'Person', 'Person'),
        one('from_organization', 'Organization', 'Organization'),
        one('to_person', 'To person', 'Person'),
        one('to_organization', 'To organization', 'Organization'),
        choice('status', 'Status', ['current', 'past']),
        text('since', 'Since'),
        text('until', 'Until'),
        long('details', 'Details'),
      ],
      {
        tie: {
          from: ['from_person', 'from_organization'],
          to: ['to_person', 'to_organization'],
          relation: 'relation',
        },
      },
    ),
  ]
}

export const FIXTURE_TYPE = {
  organization: typeId('Organization'),
  person: typeId('Person'),
  activity: typeId('Activity'),
  commitment: typeId('Commitment'),
  interaction: typeId('Interaction'),
  goal: typeId('Goal'),
  constraint: typeId('Constraint'),
  relationship: typeId('Relationship'),
} as const

type Node = {
  id: string
  labels: string[]
  properties: Record<string, unknown>
  version: number
}

type Change = {
  id: string
  record_id: string
  object_type_id: string
  kind: 'created' | 'updated' | 'deleted'
  previous_revision: number | null
  revision: number | null
  changed: Record<string, { from: unknown; to: unknown }>
  actor: string | null
  at_ms: number
}

const node = (
  id: string,
  label: string,
  version: number,
  properties: Record<string, unknown>,
): Node => ({ id, labels: [label], properties, version })

/** Monday 16 November 2026, 09:30 UTC: the morning the fixture is read on. */
export const FIXTURE_NOW = Date.UTC(2026, 10, 16, 9, 30)
const HOUR = 3_600_000

function fixtureNodes(): Node[] {
  return [
    node('person:avery', 'Person', 3, {
      name: 'Avery Quinn',
      email: 'avery@example.com',
      location: 'Portland',
    }),
    node('person:noor', 'Person', 4, {
      name: 'Noor',
      organization: 'org:kiln',
      phone: '555-0100',
      role: 'Runs the glaze workshop with me',
    }),
    node('org:kiln', 'Organization', 2, {
      name: 'Kiln Street Studio',
      location: 'Portland',
    }),
    node('activity:workshop', 'Activity', 5, {
      name: 'Glaze workshop',
      status: 'planned',
      people: ['person:noor', 'person:avery'],
      organization: 'org:kiln',
      starts: 'Saturday the 28th',
    }),
    node('commitment:materials', 'Commitment', 9, {
      title: 'Send Noor the materials list',
      owed_by: 'person:avery',
      owed_to: 'person:noor',
      activity: 'activity:workshop',
      due: 'Friday',
      status: 'open',
    }),
    node('tie:sister', 'Relationship', 1, {
      relation: 'sister',
      kind: 'family',
      from_person: 'person:noor',
      to_person: 'person:avery',
    }),
    node('constraint:mornings', 'Constraint', 1, {
      statement: 'No calls before 10am',
      kind: 'availability',
      applies_to: 'person:avery',
    }),
    node('interaction:planning', 'Interaction', 1, {
      summary: 'Planning call for the workshop',
      kind: 'call',
      people: ['person:noor', 'person:avery'],
      activity: 'activity:workshop',
      occurred: 'Last Thursday',
      notes:
        'Noor asked for the materials list before she orders glaze.\nShe will confirm the kiln booking on Monday.',
    }),
  ]
}

function fixtureChanges(): Change[] {
  return [
    {
      id: 'change:materials:9',
      record_id: 'commitment:materials',
      object_type_id: FIXTURE_TYPE.commitment,
      kind: 'updated',
      previous_revision: 8,
      revision: 9,
      changed: { due: { from: 'Wednesday', to: 'Friday' } },
      actor: 'user:avery',
      at_ms: FIXTURE_NOW - 2 * HOUR,
    },
    {
      id: 'change:materials:1',
      record_id: 'commitment:materials',
      object_type_id: FIXTURE_TYPE.commitment,
      kind: 'created',
      previous_revision: null,
      revision: 8,
      changed: {
        title: { from: null, to: 'Send Noor the materials list' },
        due: { from: null, to: 'Wednesday' },
      },
      actor: 'user:avery',
      at_ms: FIXTURE_NOW - 96 * HOUR,
    },
  ]
}

export type FixtureOptions = {
  /** Whether the built-in types are declared. */
  installed?: boolean
  /** Who "me" is to begin with. */
  self?: 'bound' | 'unbound' | 'unavailable'
  /** Plural names (lowercase) this sign-in may read but not change. */
  readOnly?: string[]
  /** Plural names (lowercase) this sign-in may not read at all. */
  unreadable?: string[]
  /** Singular names of built-in types this workspace was set up without. */
  missing?: string[]
  /** Built-in fields, by type name and key, a type was installed without. */
  missingFields?: Record<string, string[]>
}

type Body = { query?: string; variables?: Record<string, unknown> }
type Answer =
  { data: Record<string, unknown> } | { errors: { message: string }[] }

const refuse = (message: string): Answer => ({ errors: [{ message }] })

/** The CRM's part of /graphql, in memory. Each call answers as the server does. */
export function createFixtureServer(options: FixtureOptions = {}) {
  const types = fixtureTypes()
  const state = {
    installed: options.installed ?? true,
    missing: new Set(options.missing ?? []),
    missingFields: { ...(options.missingFields ?? {}) } as Record<
      string,
      string[]
    >,
    self:
      options.self === 'unbound'
        ? null
        : options.self === 'unavailable'
          ? undefined
          : 'person:avery',
    nodes: fixtureNodes(),
    changes: fixtureChanges(),
    types,
    /** Every `invokeRecordVerb` input, in order, for a test to read. */
    verbs: [] as {
      objectTypeId: string
      verb: string
      input: Record<string, unknown>
    }[],
    created: 0,
    clock: FIXTURE_NOW,
    /** Every declareSchema input, in order. */
    declares: [] as Record<string, unknown>[],
  }
  const readOnly = new Set(options.readOnly ?? [])
  const unreadable = new Set(options.unreadable ?? [])
  const plural = (type: ObjectType) => type.name_plural.toLowerCase()

  const declared = () =>
    state.installed
      ? types.filter((type) => !state.missing.has(type.name_singular))
      : []
  const life = () => ({
    installed: state.installed && state.missing.size === 0,
    types: types.map((type) => ({
      name_singular: type.name_singular,
      declared: declared().includes(type),
      missing_fields: declared().includes(type)
        ? (state.missingFields[type.name_singular] ?? [])
        : [],
    })),
    self:
      state.self === undefined
        ? { state: 'unavailable', reason: 'no_verified_user' }
        : state.self === null
          ? { state: 'unbound' }
          : {
              state: 'bound',
              personRecordId: state.self,
              updatedAt: '2026-11-02T08:00:00Z',
            },
    // Avery is the person signed in, where the sign-in names one.
    actor: state.self === undefined ? null : 'user:avery',
    access: declared().map((type) => ({
      objectTypeId: type.object_type_id,
      read: !unreadable.has(plural(type)),
      write: !unreadable.has(plural(type)) && !readOnly.has(plural(type)),
      writeScope: `record:${plural(type)}:write`,
    })),
  })

  const model = (): DataModel => ({
    objectTypes: declared().map((type) => ({
      ...type,
      // A type installed before a built-in field existed does not have it.
      fields: type.fields.filter(
        (spec) => !state.missingFields[type.name_singular]?.includes(spec.key),
      ),
      record_count: state.nodes.filter((n) =>
        n.labels.includes(type.node_label),
      ).length,
    })),
    observedShapes: [],
    divergences: [],
    relations: [],
  })

  const log = (
    record: Node,
    type: ObjectType,
    kind: Change['kind'],
    previous: number | null,
    changed: Change['changed'],
  ) =>
    // As the server does: a delete saves no revision, any other write saves
    // the one the record is now at.
    state.changes.unshift({
      id: `change:${record.id}:${state.changes.length + 1}`,
      record_id: record.id,
      object_type_id: type.object_type_id,
      kind,
      previous_revision: previous,
      revision: kind === 'deleted' ? null : record.version,
      changed,
      actor: 'user:avery',
      at_ms: (state.clock += 60_000),
    })

  function verb(
    objectTypeId: string,
    name: string,
    input: Record<string, unknown>,
  ): Answer {
    state.verbs.push({ objectTypeId, verb: name, input })
    const type = types.find((t) => t.object_type_id === objectTypeId)
    if (!type || !state.installed)
      return refuse(`schema_object_type_missing: no type \`${objectTypeId}\``)
    const writes = name !== 'find_many' && name !== 'find_one'
    if (unreadable.has(plural(type)) || (writes && readOnly.has(plural(type))))
      return refuse(
        `principal_scope_missing: missing required principal scopes: record:${plural(type)}:${writes ? 'write' : 'read'}`,
      )
    const ofType = () =>
      state.nodes.filter((n) => n.labels.includes(type.node_label))
    const found = () => ofType().find((n) => n.id === input.id)
    const stale = (record: Node): Answer | undefined => {
      if (typeof input.expected_revision !== 'number')
        return refuse('expected_revision_required: name the revision you read')
      return input.expected_revision === record.version
        ? undefined
        : refuse(
            `revision_conflict: record \`${record.id}\` is at revision ${record.version} and the write expected ${input.expected_revision}`,
          )
    }
    const result = (value: unknown): Answer => ({
      data: { invokeRecordVerb: value },
    })
    switch (name) {
      case 'find_many': {
        // As the register does: `contains` is an exact-case substring test
        // on one field.
        const filters = Array.isArray(input.filters)
          ? (input.filters as {
              field_key: string
              operator: string
              value: unknown
            }[])
          : []
        // `icontains` is the same test ignoring case.
        const all = ofType().filter((candidate) =>
          filters.every((filter) => {
            if (
              filter.operator !== 'contains' &&
              filter.operator !== 'icontains'
            )
              return true
            const actual = candidate.properties[filter.field_key]
            if (typeof actual !== 'string' || typeof filter.value !== 'string')
              return false
            return filter.operator === 'contains'
              ? actual.includes(filter.value)
              : actual.toLowerCase().includes(filter.value.toLowerCase())
          }),
        )
        const sorts = Array.isArray(input.sorts)
          ? (input.sorts as { field_key: string; direction: string }[])
          : []
        for (const sort of [...sorts].reverse())
          all.sort(
            (a, b) =>
              String(a.properties[sort.field_key] ?? '').localeCompare(
                String(b.properties[sort.field_key] ?? ''),
              ) * (sort.direction === 'desc' ? -1 : 1),
          )
        const offset = Number(input.offset ?? 0)
        const limit = Number(input.limit ?? 200)
        return result({
          records: all.slice(offset, offset + limit),
          count: all.length,
        })
      }
      case 'find_one': {
        const record = found()
        return record
          ? result({ record })
          : refuse(`record_not_found: \`${String(input.id)}\``)
      }
      case 'create_one': {
        const record = node(
          `${type.name_singular.toLowerCase()}:new-${++state.created}`,
          type.node_label,
          1,
          { ...input },
        )
        state.nodes.push(record)
        log(
          record,
          type,
          'created',
          null,
          Object.fromEntries(
            Object.entries(input).map(([key, to]) => [key, { from: null, to }]),
          ),
        )
        return result({ record })
      }
      case 'update_one': {
        const record = found()
        if (!record) return refuse(`record_not_found: \`${String(input.id)}\``)
        const refused = stale(record)
        if (refused) return refused
        const { id: _id, expected_revision: _revision, ...patch } = input
        const changed: Change['changed'] = {}
        for (const [key, to] of Object.entries(patch))
          changed[key] = { from: record.properties[key] ?? null, to }
        const previous = record.version
        record.properties = { ...record.properties, ...patch }
        record.version += 1
        log(record, type, 'updated', previous, changed)
        return result({ record: { ...record } })
      }
      case 'delete_one': {
        const record = found()
        if (!record) return refuse(`record_not_found: \`${String(input.id)}\``)
        const refused = stale(record)
        if (refused) return refused
        state.nodes = state.nodes.filter((n) => n !== record)
        return result({ deleted: true, record })
      }
      default:
        return refuse(`unknown verb \`${name}\``)
    }
  }

  /**
   * A record's links, as the graph holds them: every property naming another
   * record is an edge of that property's name, read from either end.
   */
  const linksOf = (id: string) =>
    state.nodes.flatMap((from) =>
      Object.entries(from.properties).flatMap(([key, value]) =>
        (Array.isArray(value) ? value : [value])
          .filter(
            (to): to is string =>
              typeof to === 'string' &&
              (from.id === id || to === id) &&
              state.nodes.some((n) => n.id === to),
          )
          .map((to) => ({
            id: `edge:${from.id}:${key}:${to}`,
            from_id: from.id,
            to_id: to,
            type: key,
            direction: from.id === id ? 'out' : 'in',
            confidence: 1,
            provenance: [],
          })),
      ),
    )

  /** Theorem's dataNeighborhood: `depth` hops from `ids`, and the links among them. */
  function neighborhood(ids: string[], depth: number, limit: number) {
    const seen = new Set(
      ids.filter((id) => state.nodes.some((n) => n.id === id)),
    )
    let frontier = [...seen]
    let truncated = false
    for (let hop = 0; hop < depth; hop++) {
      const next: string[] = []
      for (const id of frontier)
        for (const link of linksOf(id)) {
          const other = link.from_id === id ? link.to_id : link.from_id
          if (seen.has(other)) continue
          if (seen.size >= limit) truncated = true
          else {
            seen.add(other)
            next.push(other)
          }
        }
      frontier = next
    }
    const links = new Map<string, ReturnType<typeof linksOf>[number]>()
    for (const id of seen)
      for (const link of linksOf(id))
        if (seen.has(link.from_id) && seen.has(link.to_id))
          links.set(link.id, { ...link, direction: 'out' })
    return {
      records: state.nodes.filter((n) => seen.has(n.id)),
      links: [...links.values()],
      missing: ids.filter((id) => !seen.has(id)),
      truncated,
    }
  }

  function handle(body: Body): Answer {
    const query = body.query ?? ''
    const variables = body.variables ?? {}
    if (query.includes('invokeRecordVerb'))
      return verb(
        String(variables.objectTypeId),
        String(variables.verb),
        (variables.input ?? {}) as Record<string, unknown>,
      )
    if (query.includes('installLifeContextTypes')) {
      state.installed = true
      state.missing.clear()
      state.missingFields = {}
      return { data: { installLifeContextTypes: life() } }
    }
    if (query.includes('bindSelfPerson')) {
      if (state.self === undefined)
        return refuse(
          'self_binding_requires_verified_user: this sign-in names a workspace but no person',
        )
      const id = String(variables.id)
      if (!state.nodes.some((n) => n.id === id && n.labels.includes('Person')))
        return refuse(
          `record_not_found: \`${id}\` is not a Person record of this workspace`,
        )
      state.self = id
      return { data: { bindSelfPerson: life() } }
    }
    if (query.includes('lifeContext')) return { data: { lifeContext: life() } }
    if (query.includes('recordChanges')) {
      const id = String(variables.id)
      return {
        data: {
          recordChanges: {
            recordId: id,
            changes: state.changes.filter((c) => c.record_id === id),
          },
        },
      }
    }
    if (query.includes('declareSchema')) {
      const input = (variables.input ?? {}) as Record<string, unknown>
      state.declares.push(input)
      const type = types.find((t) => t.name_singular === input.name_singular)
      if (!type && input.expected_content_anchor)
        return refuse('schema_object_type_missing')
      if (!type) {
        // A new type takes the id the server gives it:
        // schema:object-type:{tenant}:{snake_case(name_singular)}.
        const snake = String(input.name_singular)
          .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
          .replace(/[\s-]+/g, '_')
          .toLowerCase()
        const created = {
          ...(input as unknown as ObjectType),
          object_type_id: `schema:object-type:${WORKSPACE}:${snake}`,
          tenant_id: WORKSPACE,
          content_anchor: `anchor:${snake}:1`,
          record_count: 0,
        }
        types.push(created)
        return {
          data: {
            declareSchema: {
              status: 'declared',
              idempotent_replay: false,
              object_type: created,
              graph_version_after: 1,
            },
          },
        }
      }
      const stale = input.expected_content_anchor !== type.content_anchor
      if (!stale) {
        type.extensions = input.extensions as Record<string, unknown>
        type.content_anchor = `${type.content_anchor}+`
      }
      return {
        data: {
          declareSchema: {
            status: stale ? 'conflict' : 'declared',
            idempotent_replay: false,
            object_type: type,
            graph_version_after: 1,
          },
        },
      }
    }
    if (query.includes('dataModel')) return { data: { dataModel: model() } }
    // No saved views until a test saves one.
    if (query.includes('dataViews('))
      return { data: { dataViews: { records: [] } } }
    if (query.includes('dataNeighborhood'))
      return {
        data: {
          dataNeighborhood: neighborhood(
            (variables.ids ?? []) as string[],
            Number(variables.depth ?? 1),
            Number(variables.limit ?? 200),
          ),
        },
      }
    if (query.includes('dataRecords(')) {
      const label = String(variables.label)
      return {
        data: {
          dataRecords: {
            records: state.nodes.filter((n) => n.labels.includes(label)),
          },
        },
      }
    }
    if (query.includes('dataRecord(')) {
      const record = state.nodes.find((n) => n.id === variables.id)
      return { data: { dataRecord: { records: record ? [record] : [] } } }
    }
    return refuse(`the fixture does not answer this operation`)
  }

  /** Someone else's write: the record moves on without this page knowing. */
  function changeElsewhere(id: string, patch: Record<string, unknown>) {
    const record = state.nodes.find((n) => n.id === id)
    if (!record) return
    record.properties = { ...record.properties, ...patch }
    record.version += 1
  }

  return { handle, state, life, model, changeElsewhere }
}

export type FixtureServer = ReturnType<typeof createFixtureServer>

/**
 * A reply's "used in this response" part, as the chat stream writes it for
 * "What do I owe Noor before the workshop?".
 */
export function fixtureManifestPart() {
  const included = (
    id: string,
    type: keyof typeof FIXTURE_TYPE,
    revision: number,
    label: string,
    fields: string[],
    why: Record<string, unknown>,
    estimated_tokens: number,
    extra: Record<string, unknown> = {},
  ) => ({
    reference: `record:${type.charAt(0).toUpperCase() + type.slice(1)}/${id}@${revision}`,
    record_id: id,
    object_type: type.charAt(0).toUpperCase() + type.slice(1),
    object_type_id: FIXTURE_TYPE[type],
    revision,
    label,
    fields,
    withheld_fields: [],
    shortened_fields: [],
    superseded_fields: [],
    why,
    estimated_tokens,
    content_digest: `sha256:${id}`,
    ...extra,
  })
  return {
    type: 'context_manifest',
    partId: 'chatpart:fixture',
    manifest: {
      schema: 'theorem.life_context_manifest.v1',
      you: { state: 'bound', record_id: 'person:avery' },
      included: [
        included(
          'person:avery',
          'person',
          3,
          'Avery Quinn',
          ['name', 'location'],
          { kind: 'you' },
          38,
          {
            withheld_fields: ['email'],
          },
        ),
        included(
          'person:noor',
          'person',
          4,
          'Noor',
          ['name', 'organization', 'role'],
          { kind: 'mentioned', phrase: 'Noor' },
          61,
        ),
        included(
          'commitment:materials',
          'commitment',
          9,
          'Send Noor the materials list',
          ['title', 'owed_by', 'owed_to', 'activity', 'due', 'status'],
          { kind: 'related_to', record_id: 'person:noor', through: 'owed_to' },
          92,
          { superseded_fields: ['due'] },
        ),
        included(
          'activity:workshop',
          'activity',
          5,
          'Glaze workshop',
          ['name', 'status', 'people', 'starts'],
          { kind: 'mentioned', phrase: 'the workshop' },
          74,
          { shortened_fields: ['description'] },
        ),
        included(
          'constraint:mornings',
          'constraint',
          1,
          'No calls before 10am',
          ['statement', 'kind', 'applies_to'],
          { kind: 'standing', through: 'applies_to' },
          45,
        ),
      ],
      withheld: [
        {
          record_id: 'interaction:planning',
          object_type: 'Interaction',
          reason: 'record_private',
        },
      ],
      ambiguous: [],
      over_budget: 0,
      degraded: [],
      accounting: {
        method: 'estimate: serialized characters / 4',
        estimated_tokens: 310,
        token_budget: 2000,
        records: 5,
        record_budget: 12,
      },
      digest: 'sha256:fixture',
    },
    delivery: {
      serialization: "one evidence span per record in the turn's context brief",
      estimatedTokens: 310,
      method: 'estimate: serialized characters / 4',
    },
  }
}

/**
 * A `fetch` that answers /graphql from the fixture, and the session token a
 * write asks for first. Anything else is a 404, as an unmocked route would be.
 */
export function fixtureFetch(server: FixtureServer): typeof fetch {
  return (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(
      input instanceof Request ? input.url : String(input),
      'http://localhost:3000',
    )
    if (url.pathname === '/api/chat/v1/bootstrap')
      return Response.json({
        schema: 'theorem.chat.bootstrap.v1',
        csrfToken: 'csrf',
      })
    if (url.pathname === '/graphql') {
      const raw =
        input instanceof Request
          ? await input.text()
          : String(init?.body ?? '{}')
      return Response.json(server.handle(JSON.parse(raw) as Body))
    }
    return Response.json({}, { status: 404 })
  }) as typeof fetch
}
