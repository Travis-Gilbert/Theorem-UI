// SOURCING: bun:test over the CRM's data layer: decoding, the refusals a record verb can answer with, the model helpers, and the write hooks rendered with React into happy-dom. window.fetch is the in-memory fixture (./fixture), as no Theorem is running
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  expect,
  test,
} from 'bun:test'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act } from 'react'
import { cleanup, render, waitFor } from '../../../test/blocks/render'
import { fieldByKey } from '@/components/records/model'
import { GraphQLRequestError } from '@/lib/theorem/graphql'
import * as api from './api'
import {
  RecordAccessError,
  RecordMissingError,
  RevisionConflictError,
  SelfBindingError,
  decodeCrmRecord,
  decodeLifeContext,
  decodeRecordChange,
  decodeRecordEnvelope,
  decodeRecordPage,
  mapRecordError,
  mapSelfBindingError,
} from './api'
import {
  FIXTURE_TYPE,
  createFixtureServer,
  fixtureFetch,
  fixtureTypes,
} from './fixture'
import type { FixtureServer } from './fixture'
import {
  accessFor,
  changeLines,
  contextPolicy,
  crmTypes,
  describeCrmError,
  isPrivate,
  relatedGroups,
  revisionStep,
  shownFields,
  typeByName,
} from './model'
import {
  editKey,
  resetCrmWrites,
  useCrmEdits,
  useCrmRecords,
  useCrmWrites,
} from './queries'
import type { CrmWrites } from './queries'

const browserPage = (
  window as unknown as { happyDOM: { setURL: (url: string) => void } }
).happyDOM
beforeAll(() => browserPage.setURL('http://localhost:3000/'))
afterAll(() => browserPage.setURL('about:blank'))

let server: FixtureServer
const realFetch = window.fetch
const serve = (options?: Parameters<typeof createFixtureServer>[0]) => {
  server = createFixtureServer(options)
  window.fetch = fixtureFetch(server)
}
beforeEach(() => {
  resetCrmWrites()
  serve()
})
afterEach(async () => {
  await cleanup()
  window.fetch = realFetch
})

const types = fixtureTypes()
const model = {
  objectTypes: types,
  observedShapes: [],
  divergences: [],
  relations: [],
}
const typeOf = (id: string) => types.find((t) => t.object_type_id === id)!
const commitment = typeOf(FIXTURE_TYPE.commitment)
const person = typeOf(FIXTURE_TYPE.person)
const refusal = (message: string) => new GraphQLRequestError([{ message }])

// Decoding

test('a record is its id, properties and saved revision; anything else is not a record', () => {
  expect(
    decodeCrmRecord({
      id: 'p1',
      labels: ['Person'],
      properties: { name: 'Noor' },
      version: 4,
    }),
  ).toEqual({
    id: 'p1',
    values: { name: 'Noor' },
    relations: {},
    version: 4,
    labels: ['Person'],
  })
  expect(decodeCrmRecord({ id: 'p1', properties: {} })).toBeUndefined()
  expect(decodeCrmRecord({ properties: {}, version: 1 })).toBeUndefined()
  expect(decodeCrmRecord(null)).toBeUndefined()
})

test('find_one is read as { record } or as the record on its own', () => {
  const raw = { id: 'p1', labels: [], properties: {}, version: 2 }
  expect(decodeRecordEnvelope({ record: raw })?.version).toBe(2)
  expect(decodeRecordEnvelope(raw)?.version).toBe(2)
  expect(decodeRecordEnvelope({ record: null })).toBeUndefined()
})

test('a page keeps the total the server counted, and drops what is not a record', () => {
  const page = decodeRecordPage({
    records: [{ id: 'a', properties: {}, version: 1 }, { nope: true }],
    count: 240,
  })
  expect(page.records.map((r) => r.id)).toEqual(['a'])
  expect(page.count).toBe(240)
  expect(decodeRecordPage(undefined)).toEqual({ records: [], count: 0 })
})

test('life context reads camelCase or snake_case, and a missing flag is false', () => {
  const life = decodeLifeContext({
    installed: true,
    types: [
      { name_singular: 'Person', declared: true },
      { nameSingular: 'Goal' },
    ],
    self: {
      state: 'bound',
      personRecordId: 'person:avery',
      updatedAt: '2026-11-02T08:00:00Z',
    },
    access: [
      {
        objectTypeId: 't1',
        read: true,
        write: false,
        writeScope: 'record:people:write',
      },
      { object_type_id: 't2', read: true },
    ],
  })
  expect(life.installed).toBe(true)
  expect(life.types).toEqual([
    { nameSingular: 'Person', declared: true, missingFields: [] },
    { nameSingular: 'Goal', declared: false, missingFields: [] },
  ])
  expect(life.self).toEqual({
    state: 'bound',
    personRecordId: 'person:avery',
    updatedAt: '2026-11-02T08:00:00Z',
  })
  expect(life.access[1]).toEqual({
    objectTypeId: 't2',
    read: true,
    write: false,
    writeScope: '',
  })
  expect(decodeLifeContext({}).installed).toBe(false)
  expect(decodeLifeContext({ self: { state: 'bound' } }).self).toEqual({
    state: 'unbound',
  })
  expect(
    decodeLifeContext({
      self: { state: 'unavailable', reason: 'no_verified_user' },
    }).self,
  ).toEqual({ state: 'unavailable', reason: 'no_verified_user' })
})

test('a change keeps what moved, who moved it and the revision it was made against', () => {
  expect(
    decodeRecordChange({
      id: 'c1',
      record_id: 'commitment:materials',
      object_type_id: FIXTURE_TYPE.commitment,
      kind: 'updated',
      previous_revision: 8,
      revision: 31,
      changed: { due: { from: 'Wednesday', to: 'Friday' } },
      actor: 'user:avery',
      at_ms: 12,
    }),
  ).toEqual({
    id: 'c1',
    recordId: 'commitment:materials',
    objectTypeId: FIXTURE_TYPE.commitment,
    kind: 'updated',
    previousRevision: 8,
    revision: 31,
    changed: { due: { from: 'Wednesday', to: 'Friday' } },
    actor: 'user:avery',
    atMs: 12,
  })
  expect(
    decodeRecordChange({ id: 'c1', record_id: 'r', kind: 'renamed' }),
  ).toBeUndefined()
})

test('a change made from a proposal or a conversation keeps where it came from; an unknown origin is dropped', () => {
  const base = { id: 'c2', record_id: 'r', kind: 'updated' }
  const origin = {
    kind: 'proposal',
    proposal_id: 'proposal:1',
    thread_id: 'thread:9',
    run_id: 'run:2',
    proposed_by: 'theorem',
    reason: 'Noor moved the date',
    evidence: ['record:Interaction/interaction:planning@12'],
  }
  expect(decodeRecordChange({ ...base, origin })?.origin).toEqual({
    kind: 'proposal',
    proposalId: 'proposal:1',
    threadId: 'thread:9',
    runId: 'run:2',
    proposedBy: 'theorem',
    reason: 'Noor moved the date',
    evidence: ['record:Interaction/interaction:planning@12'],
  })
  expect(decodeRecordChange(base)).not.toHaveProperty('origin')
  // A write Theorem made in the person's own conversation.
  expect(
    decodeRecordChange({
      ...base,
      origin: {
        kind: 'conversation',
        run_id: 'run:3',
        thread_id: 'thread:9',
        proposed_by: 'theorem',
      },
    })?.origin,
  ).toEqual({
    kind: 'conversation',
    threadId: 'thread:9',
    runId: 'run:3',
    proposedBy: 'theorem',
  })
  expect(
    decodeRecordChange({ ...base, origin: { kind: 'conversation' } }),
  ).not.toHaveProperty('origin')
  expect(
    decodeRecordChange({ ...base, origin: { kind: 'something_new' } }),
  ).not.toHaveProperty('origin')
  expect(decodeRecordChange({ ...base, origin: 'x' })?.kind).toBe('updated')
})

// Refusals

test('a revision conflict names the revision the record is at now', () => {
  const error = mapRecordError(
    refusal(
      'revision_conflict: record `commitment:materials` is at revision 10 and the write expected 9',
    ),
    {
      objectTypeId: 't',
      verb: 'update_one',
      recordId: 'commitment:materials',
      expectedRevision: 9,
    },
  )
  expect(error).toBeInstanceOf(RevisionConflictError)
  expect(error).toMatchObject({
    recordId: 'commitment:materials',
    expectedRevision: 9,
    currentRevision: 10,
  })
})

test('a missing permission is a write refusal for a write and a read refusal for a read', () => {
  const message =
    'principal_scope_missing: missing required principal scopes: record:commitments:write'
  const write = mapRecordError(refusal(message), {
    objectTypeId: 't',
    verb: 'update_one',
  })
  expect(write).toBeInstanceOf(RecordAccessError)
  expect((write as RecordAccessError).action).toBe('write')
  const read = mapRecordError(refusal(message), {
    objectTypeId: 't',
    verb: 'find_many',
  })
  expect((read as RecordAccessError).action).toBe('read')
})

test('a record that is gone is named; anything unrecognized is passed on unchanged', () => {
  expect(
    mapRecordError(refusal('record_not_found: `x`'), {
      objectTypeId: 't',
      verb: 'find_one',
      recordId: 'x',
    }),
  ).toBeInstanceOf(RecordMissingError)
  const other = refusal('store_unavailable: try again')
  expect(mapRecordError(other, { objectTypeId: 't', verb: 'find_many' })).toBe(
    other,
  )
  const network = new TypeError('fetch failed')
  expect(
    mapRecordError(network, { objectTypeId: 't', verb: 'find_many' }),
  ).toBe(network)
})

test('"This is me" refusals are told apart by their code', () => {
  const error = mapSelfBindingError(
    refusal(
      'self_binding_requires_verified_user: this sign-in names a workspace but no person',
    ),
  )
  expect(error).toBeInstanceOf(SelfBindingError)
  expect((error as SelfBindingError).code).toBe(
    'self_binding_requires_verified_user',
  )
  expect((error as Error).message).not.toMatch(/tenant|scope|verified_user/)
  const other = refusal('boom')
  expect(mapSelfBindingError(other)).toBe(other)
})

// Model

test('built-in types come first in their order, then the rest by label', () => {
  const extra = {
    ...person,
    object_type_id: 'x',
    name_singular: 'Book',
    name_plural: 'Books',
    label_plural: 'Books',
  }
  const system = {
    ...extra,
    object_type_id: 'y',
    name_singular: 'Audit',
    label_plural: 'Audits',
    system: true,
  }
  const retired = {
    ...extra,
    object_type_id: 'z',
    name_singular: 'Old',
    label_plural: 'Olds',
    retired: true,
  }
  const listed = crmTypes({
    ...model,
    objectTypes: [extra, system, retired, ...types],
  })
  expect(listed.map((t) => t.label_plural)).toEqual([
    'People',
    'Organizations',
    'Relationships',
    'Activities',
    'Commitments',
    'Interactions',
    'Goals',
    'Constraints',
    'Books',
  ])
})

test('a type is found by the singular name its Index view carries', () => {
  expect(typeByName(types, 'person')).toBe(person)
  expect(typeByName(types, 'Commitment')).toBe(commitment)
  expect(typeByName(types, 'nothing')).toBeUndefined()
})

test('access comes from what the server reported; an unreported type is tried', () => {
  serve({ readOnly: ['commitments'] })
  const life = decodeLifeContext(server.life())
  expect(accessFor(life, commitment)).toMatchObject({
    read: true,
    write: false,
  })
  expect(accessFor(life, person)).toMatchObject({ read: true, write: true })
  expect(accessFor(undefined, person)).toMatchObject({
    read: true,
    write: true,
  })
})

test('refusals read in plain words', () => {
  const fallback = () => 'fallback'
  expect(
    describeCrmError(new RecordAccessError('t', 'write'), commitment, fallback),
  ).toBe('This sign-in can read Commitments but not change them.')
  expect(
    describeCrmError(new RecordAccessError('t', 'read'), commitment, fallback),
  ).toBe('Commitments are not available to this sign-in.')
  expect(
    describeCrmError(
      new RevisionConflictError('r', 9, 10),
      commitment,
      fallback,
    ),
  ).toBe('This commitment changed since you opened it.')
  expect(describeCrmError(new Error('x'), commitment, fallback)).toBe(
    'fallback',
  )
})

test('a change reads as a sentence, with the revisions it moved between', () => {
  const change = decodeRecordChange(server.state.changes[0])!
  expect(changeLines(change, commitment, (_field, id) => id)).toEqual([
    { fieldKey: 'due', text: 'Avery changed Due from Wednesday to Friday' },
  ])
  // The reader's own change says so.
  expect(
    changeLines(change, commitment, (_field, id) => id, 'user:avery'),
  ).toEqual([
    { fieldKey: 'due', text: 'You changed Due from Wednesday to Friday' },
  ])
  expect(revisionStep(change)).toBe('revision 8 → 9')
  // The saved revision is the one the server reports, not the last plus one.
  expect(revisionStep({ ...change, revision: 31 })).toBe('revision 8 → 31')
  expect(revisionStep({ ...change, revision: null })).toBe('was revision 8')
  expect(
    revisionStep({ ...change, previousRevision: null, revision: 31 }),
  ).toBe('revision 31')
  expect(
    revisionStep({ ...change, previousRevision: null, revision: null }),
  ).toBeUndefined()
  const hidden = {
    ...change,
    changed: { context_use: { from: null, to: 'private' } },
  }
  expect(changeLines(hidden, commitment, (_f, id) => id)[0]?.text).toBe(
    'Avery made this private',
  )
  const related = {
    ...change,
    changed: { owed_to: { from: null, to: 'person:noor' } },
  }
  expect(changeLines(related, commitment, () => 'Noor')[0]?.text).toBe(
    'Avery set Owed to to Noor',
  )
})

test('the private switch is its own control, not a column', () => {
  expect(shownFields(person).some((f) => f.key === 'context_use')).toBe(false)
  expect(
    isPrivate(
      decodeCrmRecord({
        id: 'a',
        properties: { context_use: 'private' },
        version: 1,
      }),
    ),
  ).toBe(true)
  expect(
    isPrivate(decodeCrmRecord({ id: 'a', properties: {}, version: 1 })),
  ).toBe(false)
})

test('a type is used in answers only when its setting says so, as the server reads it', () => {
  const goal = contextPolicy(typeOf(FIXTURE_TYPE.goal))
  expect(goal.state).toBe('available')
  expect(goal.policy?.standing).toBe(true)
  // No setting at all: the server holds the type back, so it is not shown as used.
  expect(contextPolicy({ extensions: {} }).state).toBe('undeclared')
  expect(contextPolicy({}).state).toBe('undeclared')
  const policy = (value: unknown) =>
    contextPolicy({ extensions: { 'theorem.context': value } })
  expect(policy({ version: 1, assistance: 'excluded' }).state).toBe('excluded')
  expect(policy({ version: 1, assistance: 'available' }).state).toBe(
    'available',
  )
  // A setting this version cannot read is held back and never guessed at.
  expect(policy({ version: 2, assistance: 'available' }).state).toBe(
    'unreadable',
  )
  expect(
    policy({ version: 1, assistance: 'available', extra: true }).state,
  ).toBe('unreadable')
  expect(policy({ version: 1, assistance: 'sometimes' }).state).toBe(
    'unreadable',
  )
  expect(policy('available').state).toBe('unreadable')
  // A retired type is kept out whatever its setting says.
  expect(
    contextPolicy({
      retired: true,
      extensions: {
        'theorem.context': { version: 1, assistance: 'available' },
      },
    }).state,
  ).toBe('excluded')
})

test('related records are grouped by the field that relates them, in both directions', () => {
  const records = server.state.nodes.map((n) => decodeCrmRecord(n)!)
  const of = (type: { node_label: string }) =>
    records.filter((r) => r.labels.includes(type.node_label))
  const noor = records.find((r) => r.id === 'person:noor')!
  const groups = relatedGroups(model, person, noor, of)
  expect(
    groups.map(
      (g) =>
        `${g.direction} ${g.type.name_singular}.${g.field.key}: ${g.entries.map((e) => e.id).join(',')}`,
    ),
  ).toEqual([
    'from Organization.organization: org:kiln',
    'to Relationship.from_person: tie:sister',
    'to Activity.people: activity:workshop',
    'to Commitment.owed_to: commitment:materials',
    'to Interaction.people: interaction:planning',
  ])
})

// The verbs, against the fixture

test('every update and delete names the revision it read', async () => {
  const saved = await api.updateCrmRecord(
    FIXTURE_TYPE.commitment,
    'commitment:materials',
    { due: 'Thursday' },
    9,
  )
  expect(saved.version).toBe(10)
  await api.deleteCrmRecord(FIXTURE_TYPE.commitment, 'commitment:materials', 10)
  expect(
    server.state.verbs.map((v) => [v.verb, v.input.expected_revision]),
  ).toEqual([
    ['update_one', 9],
    ['delete_one', 10],
  ])
})

test('a record that moved on is refused, and the refusal says where it is now', async () => {
  server.changeElsewhere('commitment:materials', { status: 'done' })
  const error = await api
    .updateCrmRecord(
      FIXTURE_TYPE.commitment,
      'commitment:materials',
      { due: 'Thursday' },
      9,
    )
    .catch((e: unknown) => e)
  expect(error).toBeInstanceOf(RevisionConflictError)
  expect((error as RevisionConflictError).currentRevision).toBe(10)
  // Nothing was written over.
  expect(
    server.state.nodes.find((n) => n.id === 'commitment:materials')?.properties
      .due,
  ).toBe('Friday')
})

test('a sign-in that may only read is told so on a write, and can still read', async () => {
  serve({ readOnly: ['commitments'] })
  const page = await api.findRecords(FIXTURE_TYPE.commitment)
  expect(page.count).toBe(1)
  const error = await api
    .updateCrmRecord(
      FIXTURE_TYPE.commitment,
      'commitment:materials',
      { due: 'Thursday' },
      9,
    )
    .catch((e: unknown) => e)
  expect(error).toBeInstanceOf(RecordAccessError)
  expect((error as RecordAccessError).action).toBe('write')
})

test('a type with more records than one read serves is read to the end', async () => {
  const kept = server.state.nodes.find((n) => n.id === 'commitment:materials')!
  for (let n = 0; n < 1_204; n++)
    server.state.nodes.push({
      ...kept,
      id: `commitment:extra-${n}`,
      properties: { ...kept.properties, title: `Extra ${n}` },
    })
  const page = await api.findRecords(FIXTURE_TYPE.commitment)
  expect(page.count).toBe(1_205)
  expect(page.records).toHaveLength(1_205)
  expect(page.records.at(-1)!.id).toBe('commitment:extra-1203')
  expect(
    server.state.verbs
      .filter((call) => call.verb === 'find_many')
      .map((call) => call.input.offset),
  ).toEqual([0, 1_000])
})

test('a type this sign-in may not read is a refusal, not an empty page', async () => {
  serve({ unreadable: ['commitments'] })
  const error = await api
    .findRecords(FIXTURE_TYPE.commitment)
    .catch((e: unknown) => e)
  expect(error).toBeInstanceOf(RecordAccessError)
  expect((error as RecordAccessError).action).toBe('read')
})

// The write hooks

async function mountWrites() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  const held: { writes?: CrmWrites; records?: api.CrmRecord[] } = {}
  function Probe() {
    held.writes = useCrmWrites(commitment)
    held.records = useCrmRecords(commitment).data?.records
    return null
  }
  await render(
    <QueryClientProvider client={client}>
      <Probe />
    </QueryClientProvider>,
  )
  await waitFor(() => held.records)
  return {
    writes: () => held.writes!,
    record: () => held.records!.find((r) => r.id === 'commitment:materials')!,
  }
}

/** Runs a write, then lets the cache tell the component what it now holds. */
const settle = (run: () => Promise<unknown>) =>
  act(async () => {
    await run()
    await new Promise((resolve) => setTimeout(resolve, 5))
  })

const due = fieldByKey(commitment, 'due')!
const status = fieldByKey(commitment, 'status')!
const edit = (field = 'due') =>
  useCrmEdits.getState().edits[editKey('commitment:materials', field)]

test('a saved edit comes back at its new revision and leaves nothing pending', async () => {
  const { writes, record } = await mountWrites()
  expect(record().version).toBe(9)
  await settle(() => writes().save(record(), due, 'Thursday'))
  expect(record().values.due).toBe('Thursday')
  expect(record().version).toBe(10)
  expect(edit()).toBeUndefined()
})

test('two edits made from the same reading both save, each naming the revision before it', async () => {
  const { writes, record } = await mountWrites()
  const read = record()
  await settle(() =>
    Promise.all([
      writes().save(read, due, 'Thursday'),
      writes().save(read, status, 'done'),
    ]),
  )
  expect(
    server.state.verbs
      .filter((v) => v.verb === 'update_one')
      .map((v) => v.input.expected_revision),
  ).toEqual([9, 10])
  expect(record()).toMatchObject({
    version: 11,
    values: { due: 'Thursday', status: 'done' },
  })
})

test('a conflict keeps what was typed, leaves the saved value alone, and Reload offers it again', async () => {
  const { writes, record } = await mountWrites()
  server.changeElsewhere('commitment:materials', { status: 'done' })
  await settle(() => writes().save(record(), due, 'Thursday'))
  expect(edit()).toMatchObject({
    status: 'conflict',
    value: 'Thursday',
    readRevision: 9,
  })
  expect(edit()?.error).toBeInstanceOf(RevisionConflictError)
  // The saved record is still what Theorem last returned, not the refused value.
  expect(record().values.due).toBe('Friday')
  expect(
    server.state.nodes.find((n) => n.id === 'commitment:materials')?.properties
      .due,
  ).toBe('Friday')

  await settle(() => writes().reload('commitment:materials'))
  expect(record()).toMatchObject({
    version: 10,
    values: { due: 'Friday', status: 'done' },
  })
  expect(edit()).toMatchObject({
    status: 'held',
    value: 'Thursday',
    readRevision: 10,
  })

  await settle(() => writes().apply(edit()!))
  expect(record()).toMatchObject({
    version: 11,
    values: { due: 'Thursday', status: 'done' },
  })
  expect(edit()).toBeUndefined()
})

test('a write this sign-in may not make stays visible as refused, never as saved', async () => {
  serve({ readOnly: ['commitments'] })
  const { writes, record } = await mountWrites()
  await settle(() => writes().save(record(), due, 'Thursday'))
  expect(edit()).toMatchObject({ status: 'failed', value: 'Thursday' })
  expect(edit()?.error).toBeInstanceOf(RecordAccessError)
  expect(record().values.due).toBe('Friday')
  act(() => writes().discard(edit()!))
  expect(edit()).toBeUndefined()
})

test('a value that did not change is not sent', async () => {
  const { writes, record } = await mountWrites()
  await settle(() => writes().save(record(), due, 'Friday'))
  expect(server.state.verbs.some((v) => v.verb === 'update_one')).toBe(false)
})

test('delete names the revision that was read, and a record that moved on is not deleted', async () => {
  const { writes, record } = await mountWrites()
  server.changeElsewhere('commitment:materials', { status: 'done' })
  const error = await writes()
    .remove(record())
    .catch((e: unknown) => e)
  expect(error).toBeInstanceOf(RevisionConflictError)
  expect(server.state.nodes.some((n) => n.id === 'commitment:materials')).toBe(
    true,
  )
  await settle(() => writes().reload('commitment:materials'))
  await settle(() => writes().remove(record()))
  expect(server.state.nodes.some((n) => n.id === 'commitment:materials')).toBe(
    false,
  )
  expect(
    server.state.verbs
      .filter((v) => v.verb === 'delete_one')
      .map((v) => v.input.expected_revision),
  ).toEqual([9, 10])
})
