// SOURCING: maps a Theorem Space (the SDK's types) onto JSON Canvas 1.0
// (obsidian/canvas types); filenamify makes the project title a file name.
// Spaces were modelled on JSON Canvas, so the mapping is field by field:
// rects, groups, sides, ends, labels, colours.
//
// Plan D15: "Export to folder" writes a Project Space as a `.canvas` file.
// Notes become text nodes holding their Markdown; the Theorem object or Space
// each card stood for is kept under a `theorem:` key, which JSON Canvas lets
// other apps carry along. Ink has no JSON Canvas form and is left out.
import filenamify from 'filenamify/browser'
import { writeNewFile } from '@/lib/handlers/file-sync'
import type { Theorem } from '@/lib/theorem/client'
import type { WorkspaceClient } from '@/lib/workspace/types'
import type { CanvasEdge, CanvasNode } from './json-canvas'

type SpaceLayout = Pick<
  Theorem.SpaceProject,
  'placements' | 'groups' | 'connections'
>

export type SpaceCanvas = {
  /** The file's text, written the way Obsidian writes canvases. */
  text: string
  /** Placements with no JSON Canvas form (ink), left out. */
  skipped: number
}

/** JSON Canvas positions and sizes are integers. */
const rect = ({ x, y, w, h }: Theorem.SpaceRect) => ({
  x: Math.round(x),
  y: Math.round(y),
  width: Math.round(w),
  height: Math.round(h),
})

function toNode(
  placement: Theorem.SpacePlacement,
  markdownOf: (documentId: string) => string,
): CanvasNode | null {
  const base = {
    id: placement.id,
    ...rect(placement.rect),
    ...(placement.color && { color: placement.color }),
  }
  switch (placement.target) {
    case 'object': {
      const { object } = placement
      const text =
        object.kind === 'document'
          ? markdownOf(object.id)
          : (placement.label ?? `${object.kind} ${object.id}`)
      return { ...base, type: 'text', text, 'theorem:object': object }
    }
    case 'note':
      return { ...base, type: 'text', text: placement.text }
    case 'space':
      return {
        ...base,
        type: 'text',
        text: placement.label ?? placement.space,
        'theorem:space': placement.space,
      }
    case 'ink':
      return null
  }
}

export function spaceToCanvas(
  space: SpaceLayout,
  markdownOf: (documentId: string) => string,
): SpaceCanvas {
  const placements = space.placements ?? []
  const cards = placements.flatMap((p) => toNode(p, markdownOf) ?? [])
  // Groups first: a canvas draws its nodes in order, groups underneath.
  const groups = (space.groups ?? []).map(
    (g): CanvasNode => ({
      id: g.id,
      type: 'group',
      ...rect(g.rect),
      ...(g.label && { label: g.label }),
      ...(g.color && { color: g.color }),
    }),
  )
  const nodes = [...groups, ...cards]
  const ids = new Set(nodes.map((n) => n.id))
  const edges = (space.connections ?? []).flatMap((c): Array<CanvasEdge> =>
    ids.has(c.from) && ids.has(c.to)
      ? [
          {
            id: c.id,
            fromNode: c.from,
            ...(c.from_side && { fromSide: c.from_side }),
            // JSON Canvas ends default to none at the start and an arrow at
            // the end; a Space's default to none at both.
            ...(c.from_end === 'arrow' && { fromEnd: 'arrow' as const }),
            toNode: c.to,
            ...(c.to_side && { toSide: c.to_side }),
            ...(c.to_end !== 'arrow' && { toEnd: 'none' as const }),
            ...(c.label && { label: c.label }),
            ...(c.color && { color: c.color }),
          },
        ]
      : [],
  )
  return {
    text: JSON.stringify({ nodes, edges }, null, '\t'),
    skipped: placements.length - cards.length,
  }
}

/**
 * Writes `space` at the top of the folder as `<title>.canvas`, or under the
 * next free name, and returns where it went.
 */
export async function exportSpace(
  client: WorkspaceClient,
  title: string,
  space: SpaceLayout,
  markdownOf: (documentId: string) => Promise<string>,
): Promise<{ path: string; skipped: number }> {
  const documents = new Set(
    (space.placements ?? []).flatMap((p) =>
      p.target === 'object' && p.object.kind === 'document' ? [p.object.id] : [],
    ),
  )
  const markdown = new Map(
    await Promise.all(
      [...documents].map(async (id) => [id, await markdownOf(id)] as const),
    ),
  )
  const canvas = spaceToCanvas(space, (id) => markdown.get(id) ?? '')
  const name = filenamify(title.trim() || 'Space', { replacement: '-' })
  const path = await writeNewFile(client, '', `${name}.canvas`, canvas.text)
  return { path, skipped: canvas.skipped }
}
