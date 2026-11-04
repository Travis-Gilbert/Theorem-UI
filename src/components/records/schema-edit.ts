// SOURCING: none — pure edits over a declared ObjectType (./contract) producing the ObjectTypeInput `declareSchema` replaces it with; the register owns ids, anchors and counts, so every change is a whole re-declaration
import type {
  FieldSpec,
  ObjectType,
  ObjectTypeInput,
  ObservedProperty,
  SchemaFieldType,
} from './contract'

/** The declaration a type was made from, without what the register adds. */
export function toInput(type: ObjectType): ObjectTypeInput {
  return {
    name_singular: type.name_singular,
    name_plural: type.name_plural,
    label_singular: type.label_singular,
    label_plural: type.label_plural,
    description: type.description,
    node_label: type.node_label,
    label_identifier_field: type.label_identifier_field,
    fields: type.fields,
    field_sets: type.field_sets,
    enforcement: type.enforcement,
    system: type.system,
    provider: type.provider,
    extensions: type.extensions,
  }
}

/** Add a field, at `index` or last. */
export function withField(
  type: ObjectType,
  field: FieldSpec,
  index = type.fields.length,
): ObjectTypeInput {
  if (type.fields.some((f) => f.key === field.key))
    throw new Error(
      `${type.label_singular} already has a field "${field.key}".`,
    )
  const fields = [...type.fields]
  fields.splice(Math.max(0, Math.min(index, fields.length)), 0, field)
  return { ...toInput(type), fields }
}

/** Replace one field in place. Its key may change only to one not taken. */
export function withFieldChanged(
  type: ObjectType,
  key: string,
  field: FieldSpec,
): ObjectTypeInput {
  if (field.key !== key && type.fields.some((f) => f.key === field.key))
    throw new Error(
      `${type.label_singular} already has a field "${field.key}".`,
    )
  const input = toInput(type)
  return {
    ...input,
    fields: type.fields.map((f) => (f.key === key ? field : f)),
    label_identifier_field:
      input.label_identifier_field === key
        ? field.key
        : input.label_identifier_field,
  }
}

/** Remove a field. The identifier and system fields stay. */
export function withoutField(type: ObjectType, key: string): ObjectTypeInput {
  const field = type.fields.find((f) => f.key === key)
  if (!field) return toInput(type)
  if (field.system)
    throw new Error(`"${field.label}" is a system field and cannot be removed.`)
  if (type.label_identifier_field === key)
    throw new Error(
      `"${field.label}" names each ${type.label_singular.toLowerCase()}; choose another identifier first.`,
    )
  return { ...toInput(type), fields: type.fields.filter((f) => f.key !== key) }
}

/** Reorder fields to `keys`; fields not named keep their order after them. */
export function withFieldOrder(
  type: ObjectType,
  keys: string[],
): ObjectTypeInput {
  const byKey = new Map(type.fields.map((f) => [f.key, f]))
  const named = keys.flatMap((key) => byKey.get(key) ?? [])
  const rest = type.fields.filter((f) => !keys.includes(f.key))
  return { ...toInput(type), fields: [...named, ...rest] }
}

const words = (label: string) =>
  label
    .normalize('NFKD')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
    .split(/\s+/)
    .filter(Boolean)

export const camelCase = (label: string) =>
  words(label)
    .map((word, i) =>
      i === 0
        ? word.toLowerCase()
        : word[0]!.toUpperCase() + word.slice(1).toLowerCase(),
    )
    .join('')

export const pascalCase = (label: string) => {
  const camel = camelCase(label)
  return camel ? camel[0]!.toUpperCase() + camel.slice(1) : ''
}

/** A key for a new field from its label, numbered past any taken. */
export function fieldKeyFor(label: string, taken: Iterable<string>) {
  const base = camelCase(label) || 'field'
  const used = new Set(taken)
  if (!used.has(base)) return base
  let n = 2
  while (used.has(`${base}${n}`)) n++
  return `${base}${n}`
}

/** A new type with a Name field to identify its records, warning on drift. */
export function newObjectType({
  labelSingular,
  labelPlural,
  description,
}: {
  labelSingular: string
  labelPlural: string
  description?: string
}): ObjectTypeInput {
  const nameSingular = camelCase(labelSingular)
  if (!nameSingular) throw new Error('Give the object a name.')
  return {
    name_singular: nameSingular,
    name_plural: camelCase(labelPlural) || `${nameSingular}s`,
    label_singular: labelSingular.trim(),
    label_plural: labelPlural.trim() || `${labelSingular.trim()}s`,
    description: description?.trim() || undefined,
    node_label: pascalCase(labelSingular),
    label_identifier_field: 'name',
    fields: [
      {
        key: 'name',
        label: 'Name',
        field_type: { kind: 'text' },
        required: true,
        system: false,
      },
    ],
    enforcement: 'warn',
    system: false,
  }
}

/**
 * The type to propose when a property seen on records is added to the
 * schema. The person can change it before it is declared; this only decides
 * what the Add field form starts on.
 */
export function proposeFieldType(property: ObservedProperty): SchemaFieldType {
  // TODO(human): choose a field type from what was observed.
  void property
  return { kind: 'json' }
}
