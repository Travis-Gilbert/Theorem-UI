import { describe, expect, test } from 'bun:test'
import type {
  DataModel,
  FieldSpec,
  ObjectType,
  ObjectTypeInput,
} from '@/components/records/contract'
import { newObjectType, toInput } from '@/components/records/schema-edit'
import { incompatibilities, optionalField, refuses } from './evolution'
import { EXPORT_FORMAT, exportClasses, planImport } from './portability'

const field = (key: string, extra: Partial<FieldSpec> = {}): FieldSpec => ({
  key,
  label: key,
  field_type: { kind: 'text' },
  required: false,
  system: false,
  ...extra,
})

const recipe = (records: number, fields: FieldSpec[] = []): ObjectType => {
  const base = newObjectType({
    labelSingular: 'Recipe',
    labelPlural: 'Recipes',
  })
  return {
    ...base,
    fields: [...base.fields, ...fields],
    object_type_id: 'schema:object-type:t:recipe',
    tenant_id: 't',
    content_anchor: 'sha256:a',
    retired: false,
    record_count: records,
  }
}

const change = (
  type: ObjectType,
  edit: (input: ObjectTypeInput) => ObjectTypeInput,
) => incompatibilities(type, edit(toInput(type)))

describe('schema evolution', () => {
  test('a class with no instances takes any change', () => {
    const type = recipe(0, [field('serves')])
    expect(change(type, (i) => ({ ...i, fields: [] }))).toEqual([])
  })

  test('renaming the class or a label keeps every key, so nothing breaks', () => {
    const type = recipe(3, [field('serves')])
    const found = change(type, (i) => ({
      ...i,
      label_singular: 'Dish',
      label_plural: 'Dishes',
      fields: i.fields.map((f) => ({ ...f, label: `${f.label}!` })),
    }))
    expect(found).toEqual([])
  })

  test('an optional field may be added; a required one is refused', () => {
    const type = recipe(3)
    const optional = change(type, (i) => ({
      ...i,
      fields: [
        ...i.fields,
        optionalField(field('cuisine', { required: true })),
      ],
    }))
    expect(optional).toEqual([])
    const required = change(type, (i) => ({
      ...i,
      fields: [...i.fields, field('cuisine', { required: true })],
    }))
    expect(required.map((f) => f.reason)).toEqual(['required-added'])
    expect(refuses(required)).toBe(true)
  })

  test('widening a type is allowed, narrowing it is refused', () => {
    const type = recipe(3, [
      field('notes'),
      field('course', {
        field_type: { kind: 'enum', variants: ['main', 'side'] },
      }),
    ])
    const widened = change(type, (i) => ({
      ...i,
      fields: i.fields.map((f) =>
        f.key === 'notes'
          ? { ...f, field_type: { kind: 'long_text' } }
          : f.key === 'course'
            ? {
                ...f,
                field_type: {
                  kind: 'enum_many',
                  variants: ['main', 'side', 'dessert'],
                },
              }
            : f,
      ),
    }))
    expect(widened).toEqual([])
    const narrowed = change(type, (i) => ({
      ...i,
      fields: i.fields.map((f) =>
        f.key === 'notes'
          ? { ...f, field_type: { kind: 'number' } }
          : f.key === 'course'
            ? { ...f, field_type: { kind: 'enum', variants: ['main'] } }
            : f,
      ),
    }))
    expect(narrowed.map((f) => f.reason).sort()).toEqual([
      'type-changed',
      'variant-removed',
    ])
  })

  test('removing a field asks to be confirmed but is not refused', () => {
    const type = recipe(3, [field('serves')])
    const found = change(type, (i) => ({
      ...i,
      fields: i.fields.filter((f) => f.key !== 'serves'),
    }))
    expect(found.map((f) => f.reason)).toEqual(['removed'])
    expect(refuses(found)).toBe(false)
  })
})

describe('class export and import', () => {
  const model = (types: ObjectType[]): DataModel => ({
    objectTypes: types,
    observedShapes: [],
    divergences: [],
    relations: [],
  })

  test('an export round-trips: known classes are replaced at their anchor, new ones created', () => {
    const known = recipe(2)
    const file = exportClasses([known])
    const fresh = newObjectType({ labelSingular: 'Book', labelPlural: 'Books' })
    const text = JSON.stringify({
      ...file,
      classes: [...file.classes, fresh, { nope: true }],
    })
    const plan = planImport(text, model([known]))
    expect(plan.replace.map((r) => r.current.content_anchor)).toEqual([
      'sha256:a',
    ])
    expect(plan.create.map((c) => c.name_singular)).toEqual(['book'])
    expect(plan.rejected).toEqual([
      { index: 2, reason: 'not a class definition' },
    ])
  })

  test('a file that is not a class export is refused whole', () => {
    expect(() => planImport('not json', model([]))).toThrow('not JSON')
    expect(() =>
      planImport(JSON.stringify({ format: 'other', classes: [] }), model([])),
    ).toThrow(EXPORT_FORMAT)
  })
})
