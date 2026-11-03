import { describe, expect, test } from 'bun:test'
import {
  computeAggregate,
  aggregateOptions,
  formatAggregate,
} from './aggregate'
import { decodeRecord } from './api'
import type { ObjectType } from './contract'
import { layoutModel, NODE_WIDTH } from './layout'
import {
  displayHint,
  inboundRelations,
  parseRecordItemId,
  recordItemId,
  recordTitle,
  withDisplayHint,
} from './model'
import {
  fieldKeyFor,
  newObjectType,
  toInput,
  withField,
  withFieldChanged,
  withFieldOrder,
  withoutField,
} from './schema-edit'

const company: ObjectType = {
  object_type_id: 'schema:object-type:t:company',
  tenant_id: 't',
  name_singular: 'company',
  name_plural: 'companies',
  label_singular: 'Company',
  label_plural: 'Companies',
  node_label: 'Company',
  label_identifier_field: 'name',
  fields: [
    {
      key: 'name',
      label: 'Name',
      field_type: { kind: 'text' },
      required: true,
      system: false,
    },
    {
      key: 'createdAt',
      label: 'Created',
      field_type: { kind: 'timestamp' },
      required: false,
      system: true,
    },
    {
      key: 'employees',
      label: 'Employees',
      field_type: { kind: 'integer' },
      required: false,
      system: false,
    },
  ],
  enforcement: 'warn',
  system: false,
  content_anchor: 'anchor-1',
  record_count: 3,
}

const person: ObjectType = {
  ...company,
  object_type_id: 'schema:object-type:t:person',
  name_singular: 'person',
  name_plural: 'people',
  label_singular: 'Person',
  label_plural: 'People',
  node_label: 'Person',
  fields: [
    company.fields[0]!,
    {
      key: 'company',
      label: 'Company',
      field_type: {
        kind: 'relation',
        target_object_type_id: company.object_type_id,
        cardinality: 'one',
      },
      required: false,
      system: false,
    },
  ],
}

describe('record item ids', () => {
  test('round-trip a record id that contains slashes and colons', () => {
    const item = recordItemId(company, 'node:a/b')
    expect(item).toBe('record:company/node:a/b')
    expect(parseRecordItemId(item)).toEqual({
      nameSingular: 'company',
      recordId: 'node:a/b',
    })
  })

  test('a document id is not a record', () => {
    expect(parseRecordItemId('doc-123')).toBeUndefined()
    expect(parseRecordItemId('record:company/')).toBeUndefined()
  })
})

describe('model lookups', () => {
  test('a record is titled by its identifier, then the usual keys', () => {
    expect(
      recordTitle(company, {
        id: '1',
        values: { name: 'Acme' },
        relations: {},
      }),
    ).toBe('Acme')
    expect(
      recordTitle(company, { id: '1', values: { title: 'T' }, relations: {} }),
    ).toBe('T')
    expect(recordTitle(company, { id: '1', values: {}, relations: {} })).toBe(
      'Untitled',
    )
  })

  test('inbound relations find the fields that point at a type', () => {
    const model = {
      objectTypes: [company, person],
      observedShapes: [],
      divergences: [],
      relations: [],
    }
    expect(
      inboundRelations(model, company).map(
        (r) => `${r.from.name_singular}.${r.field.key}`,
      ),
    ).toEqual(['person.company'])
    expect(inboundRelations(model, person)).toEqual([])
  })

  test('display hints set and clear without disturbing other extensions', () => {
    const typed = { extensions: { other: 1 } }
    const set = withDisplayHint(typed, 'site', { display: 'url' })
    expect(displayHint({ extensions: set }, 'site')).toEqual({ display: 'url' })
    expect(set.other).toBe(1)
    const cleared = withDisplayHint({ extensions: set }, 'site', undefined)
    expect(cleared).toEqual({ other: 1 })
  })
})

describe('schema edits', () => {
  test('toInput drops what the register owns', () => {
    const input = toInput(company) as Record<string, unknown>
    for (const key of [
      'object_type_id',
      'tenant_id',
      'content_anchor',
      'record_count',
    ])
      expect(key in input).toBe(false)
    expect(input.fields).toBe(company.fields)
  })

  test('add, change, reorder and remove fields', () => {
    const domain = {
      key: 'domain',
      label: 'Domain',
      field_type: { kind: 'text' as const },
      required: false,
      system: false,
    }
    expect(withField(company, domain, 1).fields.map((f) => f.key)).toEqual([
      'name',
      'domain',
      'createdAt',
      'employees',
    ])
    expect(() => withField(company, { ...domain, key: 'name' })).toThrow()
    const renamed = withFieldChanged(company, 'name', {
      ...company.fields[0]!,
      key: 'title',
    })
    expect(renamed.label_identifier_field).toBe('title')
    expect(
      withFieldOrder(company, ['employees']).fields.map((f) => f.key),
    ).toEqual(['employees', 'name', 'createdAt'])
    expect(withoutField(company, 'employees').fields).toHaveLength(2)
    expect(() => withoutField(company, 'createdAt')).toThrow(/system/)
    expect(() => withoutField(company, 'name')).toThrow(/identifier/)
  })

  test('keys come from labels and never collide', () => {
    expect(fieldKeyFor('Annual Revenue ($)', [])).toBe('annualRevenue')
    expect(fieldKeyFor('Name', ['name', 'name2'])).toBe('name3')
    expect(fieldKeyFor('!!!', [])).toBe('field')
  })

  test('a new type starts with a required Name and warns on drift', () => {
    const input = newObjectType({
      labelSingular: 'Research question',
      labelPlural: 'Research questions',
    })
    expect(input.name_singular).toBe('researchQuestion')
    expect(input.node_label).toBe('ResearchQuestion')
    expect(input.fields[0]).toMatchObject({ key: 'name', required: true })
    expect(input.enforcement).toBe('warn')
  })
})

describe('aggregates', () => {
  const values = [3, '', null, 5, '7', 3]
  test('counts and percentages treat blanks as empty', () => {
    expect(computeAggregate('count', values)).toBe(6)
    expect(computeAggregate('empty', values)).toBe(2)
    expect(computeAggregate('unique', values)).toBe(3)
    expect(
      formatAggregate('percentEmpty', computeAggregate('percentEmpty', values)),
    ).toBe('33%')
  })

  test('numbers read numeric strings and skip the rest', () => {
    expect(computeAggregate('sum', values)).toBe(18)
    expect(computeAggregate('max', values)).toBe(7)
    expect(computeAggregate('average', [])).toBeNull()
    expect(formatAggregate('average', null)).toBe('—')
  })

  test('dates and booleans', () => {
    expect(
      computeAggregate('earliest', ['2026-03-01', '2025-01-02', 'nope']),
    ).toBe(new Date('2025-01-02').getTime())
    expect(computeAggregate('checked', [true, false, null, true])).toBe(2)
    expect(aggregateOptions('boolean')).toContain('checked')
    expect(aggregateOptions('text')).not.toContain('sum')
  })
})

describe('layout', () => {
  test('related types sit one column apart and a column never overlaps', () => {
    const nodes = ['a', 'b', 'c', 'd', 'lonely'].map((id) => ({
      id,
      height: 100,
    }))
    const edges = [
      { source: 'a', target: 'b' },
      { source: 'a', target: 'c' },
      { source: 'c', target: 'd' },
    ]
    const p = layoutModel(nodes, edges)
    const col = (id: string) => p[id]!.x / (p.b!.x - p.a!.x)
    expect(p.a!.x).toBe(0)
    expect(col('b')).toBe(1)
    expect(col('d')).toBe(2)
    expect(p.lonely!.x).toBeGreaterThan(p.d!.x)
    expect(Math.abs(p.b!.y - p.c!.y)).toBeGreaterThanOrEqual(100)
    expect(p.b!.x - p.a!.x).toBeGreaterThan(NODE_WIDTH)
  })

  test('the same model always lays out the same way', () => {
    const nodes = [
      { id: 'x', height: 50 },
      { id: 'y', height: 80 },
    ]
    const edges = [{ source: 'y', target: 'x' }]
    expect(layoutModel(nodes, edges)).toEqual(
      layoutModel([...nodes].reverse(), edges),
    )
  })
})

describe('decoding records', () => {
  test('values under properties or beside the id, links as relations', () => {
    expect(
      decodeRecord({
        id: 'n1',
        labels: ['Company'],
        properties: { name: 'Acme' },
        links: [{ edge_type: 'people', to_id: 'p1' }],
      }),
    ).toEqual({
      id: 'n1',
      values: { name: 'Acme' },
      relations: { people: ['p1'] },
    })
    expect(
      decodeRecord({ node_id: 'n2', name: 'Flat', labels: ['X'] }),
    ).toEqual({ id: 'n2', values: { name: 'Flat' }, relations: {} })
    expect(decodeRecord({ id: 'gone', tombstone: true })).toBeUndefined()
    expect(decodeRecord('nope')).toBeUndefined()
  })
})
