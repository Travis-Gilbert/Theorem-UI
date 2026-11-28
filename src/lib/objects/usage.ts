// SOURCING: none — a pure read over the register's data model (components/records/contract) and Theorem's own links (graph.ts fetchNeighborhood, GraphQL `dataNeighborhood`), reading the class's instances through the record verbs (lib/objects/migration everyRecord). It decides only whether deleting a class would leave something pointing at nothing; retiring is never refused here.
import { everyRecord } from './migration'
import type {
  DataModel,
  FieldSpec,
  ObjectType,
} from '@/components/records/contract'
import { fetchNeighborhood } from './graph'

/** Why a class cannot be deleted: something else depends on it. */
export type ClassUse =
  | { kind: 'relation'; from: ObjectType; field: FieldSpec }
  | { kind: 'links'; count: number }

const names = (type: ObjectType) =>
  new Set([type.object_type_id, type.node_label, type.name_singular])

/** Other classes' relation properties that point at `type`. */
export function relationsTo(
  model: DataModel | undefined,
  type: ObjectType,
): Extract<ClassUse, { kind: 'relation' }>[] {
  const own = names(type)
  return (model?.objectTypes ?? []).flatMap((from) =>
    from.object_type_id === type.object_type_id || from.retired
      ? []
      : from.fields.flatMap((field) =>
          field.field_type.kind === 'relation' &&
          own.has(field.field_type.target_object_type_id)
            ? [{ kind: 'relation' as const, from, field }]
            : [],
        ),
  )
}

/**
 * Everything that would point at nothing if `type` and its objects were
 * deleted: relations other classes declare to it, and links into its objects
 * from objects of other classes. Links among its own objects go with them.
 */
export async function classUsage(
  model: DataModel | undefined,
  type: ObjectType,
): Promise<ClassUse[]> {
  const uses: ClassUse[] = relationsTo(model, type)
  let links = 0
  const rows = await everyRecord(type.object_type_id)
  for (let at = 0; at < rows.length; at += 500) {
    const ids = new Set(rows.slice(at, at + 500).map((row) => row.id))
    const hood = await fetchNeighborhood([...ids], 1, 2000)
    const ownNodes = new Set(
      hood.nodes
        .filter((node) => node.labels.includes(type.node_label))
        .map((node) => node.id),
    )
    for (const link of hood.links)
      if (ids.has(link.to) && !ids.has(link.from) && !ownNodes.has(link.from))
        links += 1
  }
  if (links) uses.push({ kind: 'links', count: links })
  return uses
}
