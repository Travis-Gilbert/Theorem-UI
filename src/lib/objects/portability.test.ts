import { describe, expect, test } from 'bun:test'
import type {
  DataModel,
  FieldSpec,
  ObjectType,
  ObjectTypeInput,
  RecordRow,
} from '@/components/records/contract'
import { newObjectType } from '@/components/records/schema-edit'
import { applyImport, exportClasses, planImport } from './portability'
import type { ImportCalls } from './portability'

const declared = (
  tenant: string,
  label: string,
  fields: FieldSpec[] = [],
): ObjectType => {
  const base = newObjectType({ labelSingular: label, labelPlural: `${label}s` })
  return {
    ...base,
    fields: [...base.fields, ...fields],
    object_type_id: `schema:object-type:${tenant}:${base.name_singular}`,
    tenant_id: tenant,
    content_anchor: `sha256:${tenant}:${label}`,
    retired: false,
    record_count: 0,
  }
}

const relation = (key: string, target: string, many = false): FieldSpec => ({
  key,
  label: key,
  field_type: {
    kind: 'relation',
    target_object_type_id: target,
    cardinality: many ? 'many' : 'one',
  },
  required: false,
  system: false,
})

const model = (types: ObjectType[]): DataModel => ({
  objectTypes: types,
  observedShapes: [],
  divergences: [],
  relations: [],
})

/** A workspace held in memory: what was declared, created and linked. */
function workspace(tenant: string) {
  const state = {
    declared: [] as { input: ObjectTypeInput; anchor?: string }[],
    rows: new Map<string, { type: string; values: Record<string, unknown> }>(),
  }
  let next = 0
  const calls: ImportCalls = {
    declare: async (input, anchor) => {
      state.declared.push({ input, anchor })
      return {
        status: 'declared',
        object_type: {
          ...input,
          object_type_id: `schema:object-type:${tenant}:${input.name_singular}`,
          tenant_id: tenant,
          content_anchor: 'sha256:new',
          retired: false,
          record_count: 0,
        },
      } as Awaited<ReturnType<ImportCalls['declare']>>
    },
    create: async (type, values) => {
      const id = `${tenant}:${(next += 1)}`
      state.rows.set(id, { type, values: { ...values } })
      return { id, values, relations: {} }
    },
    update: async (_type, id, patch) => {
      const row = state.rows.get(id)!
      row.values = { ...row.values, ...patch }
    },
  }
  return { state, calls }
}

const row = (id: string, values: Record<string, unknown>): RecordRow => ({
  id,
  values,
  relations: {},
})

describe('carrying objects to another workspace', () => {
  const person = declared('a', 'Person')
  const book = declared('a', 'Book', [
    relation('author', person.object_type_id),
    relation('related', 'schema:object-type:a:book', true),
    relation('shelf', 'schema:object-type:a:shelf'),
  ])
  const file = exportClasses(
    [person, book],
    [
      { type: person, rows: [row('p1', { name: 'Ursula' })] },
      {
        type: book,
        rows: [
          row('b1', {
            name: 'The Dispossessed',
            author: 'p1',
            related: ['b2', 'elsewhere'],
            shelf: 's9',
          }),
          row('b2', { name: 'The Lathe of Heaven', author: 'p1' }),
        ],
      },
    ],
  )

  test('objects travel only when chosen', () => {
    expect(exportClasses([person]).objects).toBeUndefined()
    expect(file.objects?.map((o) => o.id)).toEqual(['p1', 'b1', 'b2'])
    expect(file.objects?.[1]?.values).toEqual({ name: 'The Dispossessed' })
    expect(file.objects?.[1]?.links.related).toEqual(['b2', 'elsewhere'])
  })

  test('an import gives each object a new id and points its links at them', async () => {
    const { state, calls } = workspace('b')
    const plan = planImport(JSON.stringify(file), model([]))
    const report = await applyImport(plan, model([]), 'b', {}, calls)
    const created = [...state.rows.entries()]
    expect(created).toHaveLength(3)
    const [personId] = created[0]!
    const [b1, first] = created[1]!
    const [b2] = created[2]!
    expect(first.values.author).toBe(personId)
    expect(first.values.related).toEqual([b2])
    expect(b1).not.toBe('b1')
    expect(report.links).toBe(3)
    expect(report.unresolved).toEqual([
      { object: 'The Dispossessed', field: 'related', target: 'elsewhere' },
    ])
    // Relations name the classes as declared here, not where they came from.
    const bookInput = state.declared.find(
      (d) => d.input.name_singular === 'book',
    )!.input
    const author = bookInput.fields.find((f) => f.key === 'author')!
    expect(author.field_type).toMatchObject({
      target_object_type_id: 'schema:object-type:b:person',
    })
  })

  test('a relation to a class in neither place stays readable as text', async () => {
    const { state, calls } = workspace('b')
    const plan = planImport(JSON.stringify(file), model([]))
    const report = await applyImport(plan, model([]), 'b', {}, calls)
    expect(report.missing).toEqual([
      { class: 'Books', field: 'shelf', target: 'shelf' },
    ])
    const bookInput = state.declared.find(
      (d) => d.input.name_singular === 'book',
    )!.input
    expect(bookInput.fields.find((f) => f.key === 'shelf')!.field_type).toEqual(
      { kind: 'text' },
    )
    expect([...state.rows.values()][1]!.values.shelf).toBe('s9')
  })

  test('a class that exists here is replaced at its anchor, or imported beside it', async () => {
    const theirs = declared('b', 'Book')
    const here = model([theirs])
    const plan = planImport(JSON.stringify(file), here)
    expect(plan.replace.map((r) => r.current.object_type_id)).toEqual([
      theirs.object_type_id,
    ])

    const replaced = workspace('b')
    await applyImport(plan, here, 'b', {}, replaced.calls)
    expect(
      replaced.state.declared.find((d) => d.input.name_singular === 'book')
        ?.anchor,
    ).toBe(theirs.content_anchor)

    const copied = workspace('b')
    await applyImport(plan, here, 'b', { book: 'copy' }, copied.calls)
    const copy = copied.state.declared.find(
      (d) => d.input.name_singular === 'book_imported',
    )!
    expect(copy.anchor).toBeUndefined()
    expect(copy.input.node_label).toBe('BookImported')
    expect(
      copy.input.fields.find((f) => f.key === 'related')!.field_type,
    ).toMatchObject({
      target_object_type_id: 'schema:object-type:b:book_imported',
    })
  })

  test('an object of a class the file does not define is refused', () => {
    const text = JSON.stringify({
      ...exportClasses([person]),
      objects: [{ class: 'ghost', id: 'g', title: 'g', values: {}, links: {} }],
    })
    const plan = planImport(text, model([]))
    expect(plan.objects).toEqual([])
    expect(plan.rejected[0]?.reason).toContain('does not define')
  })

  test('classes named in camel case meet relation targets written in snake case', async () => {
    const note = {
      ...declared('a', 'Reading note'),
      name_singular: 'readingNote',
      object_type_id: 'schema:object-type:a:reading_note',
    }
    const list = {
      ...declared('a', 'Reading list', [
        relation('books', 'schema:object-type:a:reading_note', true),
      ]),
      name_singular: 'readingList',
    }
    const text = JSON.stringify(
      exportClasses(
        [list, note],
        [
          { type: note, rows: [row('n1', { name: 'Chapter 1' })] },
          { type: list, rows: [row('l1', { name: 'Shelf', books: ['n1'] })] },
        ],
      ),
    )
    const here = model([
      {
        ...note,
        tenant_id: 'b',
        object_type_id: 'schema:object-type:b:reading_note',
      },
    ])
    const plan = planImport(text, here)
    expect(plan.replace.map((r) => r.input.name_singular)).toEqual([
      'readingNote',
    ])
    const { state, calls } = workspace('b')
    const report = await applyImport(
      plan,
      here,
      'b',
      { readingNote: 'copy' },
      calls,
    )
    expect(report.missing).toEqual([])
    const listInput = state.declared.find(
      (d) => d.input.name_singular === 'readingList',
    )!.input
    expect(
      listInput.fields.find((f) => f.key === 'books')!.field_type,
    ).toMatchObject({
      target_object_type_id: 'schema:object-type:b:reading_note_imported',
    })
    expect(report.links).toBe(1)
  })
})
