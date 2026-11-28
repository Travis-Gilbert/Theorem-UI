// SOURCING: none — class definitions, and objects only when chosen, as a portable JSON file over the register's own declaration shape (components/records/schema-edit toInput) and record verbs (records/api declareObjectType, createRecord, updateRecord); importing declares each class through declareSchema like any class and creates each object through create_one, so nothing here is a second format or a second validator. Hand-rolled because the register has no package verb: an import is declarations, then one create per object, then one update per object whose links point inside the file.
import {
  createRecord,
  declareObjectType,
  updateRecord,
} from '@/components/records/api'
import type {
  DataModel,
  FieldSpec,
  ObjectType,
  ObjectTypeInput,
  RecordRow,
} from '@/components/records/contract'
import { relationIds } from '@/components/records/fields'
import { recordTitle } from '@/components/records/model'
import { declaredTypeId, toInput } from '@/components/records/schema-edit'

export const EXPORT_FORMAT = 'theorem.object-classes/1'

/** One object, carried only when the person chose to include it. */
export type ExportedObject = {
  /** Its class, by `name_singular`. */
  class: string
  /** Its id where it was exported; the import gives it a new one. */
  id: string
  title: string
  /** Its values, relation properties left out. */
  values: Record<string, unknown>
  /** What each relation property pointed at, by exported id. */
  links: Record<string, string[]>
}

export type ClassExport = {
  format: typeof EXPORT_FORMAT
  exportedAt: string
  /** The workspace it came from, so its relation targets can be read. */
  source?: { tenant: string }
  classes: ObjectTypeInput[]
  objects?: ExportedObject[]
}

const isRelation = (f: FieldSpec) => f.field_type.kind === 'relation'

/**
 * The definitions of `types`, ready to save as a file. Objects travel only
 * as `objects` names them: each class's rows the person chose.
 */
export function exportClasses(
  types: ObjectType[],
  objects: { type: ObjectType; rows: RecordRow[] }[] = [],
): ClassExport {
  const carried = objects.flatMap(({ type, rows }) =>
    rows.map((row): ExportedObject => {
      const relations = type.fields.filter(isRelation)
      const keys = new Set(relations.map((f) => f.key))
      return {
        class: type.name_singular,
        id: row.id,
        title: recordTitle(type, row),
        values: Object.fromEntries(
          Object.entries(row.values).filter(([key]) => !keys.has(key)),
        ),
        links: Object.fromEntries(
          relations
            .map((f) => [f.key, relationIds(row, f)] as const)
            .filter(([, ids]) => ids.length),
        ),
      }
    }),
  )
  return {
    format: EXPORT_FORMAT,
    exportedAt: new Date().toISOString(),
    ...(types[0] ? { source: { tenant: types[0].tenant_id } } : {}),
    classes: types.map(toInput),
    ...(carried.length ? { objects: carried } : {}),
  }
}

export type ImportPlan = {
  /** Classes the register does not have: declared new. */
  create: ObjectTypeInput[]
  /** Classes it has under the same name: replaced at the anchor read, or imported beside it as a copy. */
  replace: { input: ObjectTypeInput; current: ObjectType }[]
  /** Entries that are not class definitions, or objects of no class in the file. */
  rejected: { index: number; reason: string }[]
  /** Objects the file carries, of classes it defines. */
  objects: ExportedObject[]
  source?: { tenant: string }
}

const isInput = (value: unknown): value is ObjectTypeInput => {
  const v = value as Partial<ObjectTypeInput> | null
  return (
    !!v &&
    typeof v.name_singular === 'string' &&
    typeof v.label_singular === 'string' &&
    typeof v.node_label === 'string' &&
    Array.isArray(v.fields)
  )
}

type Carried = Omit<ExportedObject, 'links'> &
  Partial<Pick<ExportedObject, 'links'>>

const isObject = (value: unknown): value is Carried => {
  const v = value as { [K in keyof ExportedObject]?: unknown } | null
  return (
    !!v &&
    typeof v.class === 'string' &&
    typeof v.id === 'string' &&
    typeof v.values === 'object' &&
    v.values !== null
  )
}

/** Read an export file against the register, deciding what each entry becomes. */
export function planImport(text: string, model: DataModel): ImportPlan {
  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch (error) {
    throw new Error(`The file is not JSON: ${(error as Error).message}`)
  }
  const file = parsed as Partial<ClassExport>
  if (file.format !== EXPORT_FORMAT || !Array.isArray(file.classes))
    throw new Error(`The file is not a ${EXPORT_FORMAT} class export.`)
  const byName = new Map(
    model.objectTypes.map((type) => [idName(type.name_singular), type]),
  )
  const plan: ImportPlan = {
    create: [],
    replace: [],
    rejected: [],
    objects: [],
    ...(file.source && typeof file.source.tenant === 'string'
      ? { source: { tenant: file.source.tenant } }
      : {}),
  }
  const defined = new Set<string>()
  file.classes.forEach((entry, index) => {
    if (!isInput(entry)) {
      plan.rejected.push({ index, reason: 'not a class definition' })
      return
    }
    defined.add(entry.name_singular)
    const current = byName.get(idName(entry.name_singular))
    if (current) plan.replace.push({ input: entry, current })
    else plan.create.push(entry)
  })
  const objects: unknown[] = Array.isArray(file.objects) ? file.objects : []
  objects.forEach((entry, at) => {
    const index = file.classes!.length + at
    if (!isObject(entry)) plan.rejected.push({ index, reason: 'not an object' })
    else if (!defined.has(entry.class))
      plan.rejected.push({
        index,
        reason: `an object of ${entry.class}, which the file does not define`,
      })
    else plan.objects.push({ ...entry, links: entry.links ?? {} })
  })
  return plan
}

/** For a class the register already has: replace its definition, or import beside it. */
export type Collision = 'replace' | 'copy'

/** A relation whose target class is in neither the file nor this workspace. */
export type MissingTarget = { class: string; field: string; target: string }

export type ImportReport = {
  declared: string[]
  objects: number
  links: number
  /** Relations kept as text, their target class being unavailable here. */
  missing: MissingTarget[]
  /** Links to objects the file did not carry, left out. */
  unresolved: { object: string; field: string; target: string }[]
}

export type ImportCalls = {
  declare: typeof declareObjectType
  create: typeof createRecord
  update: typeof updateRecord
}

const REAL: ImportCalls = {
  declare: declareObjectType,
  create: createRecord,
  update: updateRecord,
}

/** The class name a type id names, under whichever tenant it was declared. */
const nameOf = (typeId: string) => typeId.slice(typeId.lastIndexOf(':') + 1)

/**
 * A class name as its type id spells it. Names are kept as written
 * (`readingNote`) while ids snake-case them (`reading_note`), so classes and
 * relation targets are matched in this form.
 */
const idName = (name: string) => nameOf(declaredTypeId('', name))

const free = (taken: Set<string>, wanted: string, joiner: string) => {
  if (!taken.has(wanted)) return wanted
  let n = 2
  while (taken.has(`${wanted}${joiner}${n}`)) n += 1
  return `${wanted}${joiner}${n}`
}

/**
 * The declarations an import makes in `tenant`: each class under its own
 * name, or a fresh one where the person chose a copy, with every relation
 * pointed at the class it names in this workspace. A relation to a class in
 * neither the file nor here becomes text, and is reported.
 */
export function importDefinitions(
  plan: ImportPlan,
  model: DataModel,
  tenant: string,
  collisions: Record<string, Collision> = {},
) {
  const takenNames = new Set(
    model.objectTypes.map((t) => idName(t.name_singular)),
  )
  const takenLabels = new Set(model.objectTypes.map((t) => t.node_label))
  const renamed = new Map<string, ObjectTypeInput>()
  const entries = [
    ...plan.create.map((input) => ({ input, current: undefined })),
    ...plan.replace,
  ]
  for (const { input, current } of entries) {
    if (current && (collisions[input.name_singular] ?? 'replace') === 'copy') {
      const name = free(
        takenNames,
        `${idName(input.name_singular)}_imported`,
        '_',
      )
      const label = free(takenLabels, `${input.node_label}Imported`, '')
      takenNames.add(name)
      takenLabels.add(label)
      renamed.set(idName(input.name_singular), {
        ...input,
        name_singular: name,
        name_plural: `${input.name_plural}_imported`,
        label_singular: `${input.label_singular} (imported)`,
        label_plural: `${input.label_plural} (imported)`,
        node_label: label,
      })
    } else renamed.set(idName(input.name_singular), input)
  }
  const here = new Map(
    model.objectTypes.map((t) => [idName(t.name_singular), t]),
  )
  const missing: MissingTarget[] = []
  const targetOf = (typeId: string): string | undefined => {
    const name = nameOf(typeId)
    const inFile = renamed.get(name)
    if (inFile) return declaredTypeId(tenant, inFile.name_singular)
    return here.get(name)?.object_type_id
  }
  const declarations = entries.map(({ input, current }) => {
    const next = renamed.get(idName(input.name_singular))!
    const fields = next.fields.map((field): FieldSpec => {
      if (field.field_type.kind !== 'relation') return field
      const target = targetOf(field.field_type.target_object_type_id)
      if (target)
        return {
          ...field,
          field_type: { ...field.field_type, target_object_type_id: target },
        }
      missing.push({
        class: next.label_plural,
        field: field.label,
        target: nameOf(field.field_type.target_object_type_id),
      })
      return { ...field, field_type: { kind: 'text' } }
    })
    return {
      from: input.name_singular,
      input: { ...next, fields },
      anchor: next === input ? current?.content_anchor : undefined,
    }
  })
  return { declarations, missing }
}

/**
 * Apply an import: declare every class, create every carried object under a
 * new id, then point each object's links at the new ids of the objects they
 * named. A link to an object the file did not carry is left out and listed,
 * and an object whose relation became text keeps the ids it named there.
 * Nothing an action binds is run, and no permission comes with a file.
 */
export async function applyImport(
  plan: ImportPlan,
  model: DataModel,
  tenant: string,
  collisions: Record<string, Collision> = {},
  calls: ImportCalls = REAL,
): Promise<ImportReport> {
  const { declarations, missing } = importDefinitions(
    plan,
    model,
    tenant,
    collisions,
  )
  const types = new Map<string, ObjectType>()
  for (const { from, input, anchor } of declarations) {
    const declared = await calls.declare(input, anchor)
    types.set(from, declared.object_type)
  }
  const ids = new Map<string, string>()
  const created: { object: ExportedObject; id: string; type: ObjectType }[] = []
  for (const object of plan.objects) {
    const type = types.get(object.class)
    if (!type) continue
    const asText = Object.fromEntries(
      type.fields
        .filter((f) => !isRelation(f) && object.links[f.key]?.length)
        .map((f) => [f.key, object.links[f.key]!.join(', ')]),
    )
    const row = await calls.create(type.object_type_id, {
      ...object.values,
      ...asText,
    })
    ids.set(object.id, row.id)
    created.push({ object, id: row.id, type })
  }
  const unresolved: ImportReport['unresolved'] = []
  let links = 0
  for (const { object, id, type } of created) {
    const patch: Record<string, unknown> = {}
    for (const field of type.fields) {
      if (field.field_type.kind !== 'relation') continue
      const named = object.links[field.key] ?? []
      const found: string[] = []
      for (const target of named) {
        const to = ids.get(target)
        if (to) found.push(to)
        else
          unresolved.push({ object: object.title, field: field.label, target })
      }
      if (!found.length) continue
      patch[field.key] =
        field.field_type.cardinality === 'many' ? found : found[0]
      links += found.length
    }
    if (Object.keys(patch).length)
      await calls.update(type.object_type_id, id, patch)
  }
  return {
    declared: declarations.map((d) => d.input.label_plural),
    objects: created.length,
    links,
    missing,
    unresolved,
  }
}
