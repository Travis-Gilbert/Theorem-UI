// SOURCING: none — pure checks over a declared ObjectType and the declaration replacing it (components/records/contract); the register keeps ids, anchors and history, so the stale-write refusal itself is declareSchema's expected_content_anchor (records/api SchemaConflictError)
import type {
  FieldSpec,
  ObjectType,
  ObjectTypeInput,
  SchemaFieldType,
} from '@/components/records/contract'

/** A change existing instances cannot take as they are. */
export type Incompatibility = {
  field: string
  reason:
    | 'required-added'
    | 'made-required'
    | 'type-changed'
    | 'removed'
    | 'variant-removed'
  message: string
}

const sameType = (a: SchemaFieldType, b: SchemaFieldType) =>
  JSON.stringify(a) === JSON.stringify(b)

/**
 * Widening a type's values is safe: a single choice may become a multiple
 * choice, text may become long text, an integer a number, and new choices
 * may be added. Anything else changes what existing values mean.
 */
function widens(from: SchemaFieldType, to: SchemaFieldType): boolean {
  if (sameType(from, to)) return true
  if (from.kind === 'text' && to.kind === 'long_text') return true
  if (from.kind === 'integer' && to.kind === 'number') return true
  if (
    (from.kind === 'enum' || from.kind === 'enum_many') &&
    (to.kind === 'enum' || to.kind === 'enum_many') &&
    !(from.kind === 'enum_many' && to.kind === 'enum')
  )
    return from.variants.every((v) => to.variants.includes(v))
  if (from.kind === 'relation' && to.kind === 'relation')
    return (
      from.target_object_type_id === to.target_object_type_id &&
      (from.cardinality === to.cardinality || to.cardinality === 'many')
    )
  return false
}

/**
 * What the new declaration would break for the instances the class already
 * has. Renaming a class or a field's label never appears here: keys and the
 * class's name stay, so every reference survives. With no instances nothing
 * is incompatible.
 */
export function incompatibilities(
  before: ObjectType,
  after: ObjectTypeInput,
): Incompatibility[] {
  if (!before.record_count) return []
  const was = new Map(before.fields.map((f) => [f.key, f]))
  const found: Incompatibility[] = []
  for (const field of after.fields) {
    const old = was.get(field.key)
    if (!old) {
      if (field.required)
        found.push({
          field: field.key,
          reason: 'required-added',
          message: `${field.label} is required, and the existing ${before.label_plural.toLowerCase()} have no value for it. A migration can fill it, or add it as optional and require it once every one has a value.`,
        })
      continue
    }
    if (field.required && !old.required)
      found.push({
        field: field.key,
        reason: 'made-required',
        message: `${field.label} would become required; existing ${before.label_plural.toLowerCase()} without it would no longer satisfy the class.`,
      })
    if (!widens(old.field_type, field.field_type))
      found.push({
        field: field.key,
        reason:
          old.field_type.kind === field.field_type.kind
            ? 'variant-removed'
            : 'type-changed',
        message:
          old.field_type.kind === field.field_type.kind
            ? `${field.label} would drop choices existing values may use.`
            : `${field.label} would change from ${old.field_type.kind} to ${field.field_type.kind}; existing values are converted by a migration.`,
      })
  }
  const kept = new Set(after.fields.map((f) => f.key))
  for (const old of before.fields)
    if (!kept.has(old.key))
      found.push({
        field: old.key,
        reason: 'removed',
        message: `${old.label} would be removed. Its values stay on the existing ${before.label_plural.toLowerCase()}, observed but no longer declared.`,
      })
  return found
}

/** Removal keeps data, so it asks to be confirmed; everything else is refused until reworked. */
export const refuses = (found: Incompatibility[]) =>
  found.some((f) => f.reason !== 'removed')

/** A field to add with a safe default: optional, so existing instances stay valid. */
export const optionalField = (field: FieldSpec): FieldSpec => ({
  ...field,
  required: false,
})
