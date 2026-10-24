// SOURCING: hand-rolled. Turns the workspace index's notes and links into the
// graph view's nodes and edges, filtered as Obsidian's graph view filters them
// (tags, attachments, orphans, unresolved links, the local graph's depth).
// cosmos.gl draws flat index arrays and no graph library models these filters,
// so the result is an indexed list rather than a graphology graph.
import { basename, extname } from 'pathe'
import type { WorkspaceGraph } from '@/lib/workspace/types'

export type GraphNodeKind = 'note' | 'tag' | 'attachment' | 'unresolved'

export interface GraphNode {
  id: string
  kind: GraphNodeKind
  label: string
  /** The file a note or attachment node stands for. */
  path?: string
  /** An unresolved link's target as written, or a tag without its `#`. */
  target?: string
  /** Edges at this node. */
  degree: number
}

export interface GraphModel {
  nodes: Array<GraphNode>
  /** Each edge once, as indices into `nodes`, with the lower index first. */
  links: Array<[number, number]>
}

export interface GraphFilters {
  tags: boolean
  attachments: boolean
  /** Nodes with no edges. */
  orphans: boolean
  unresolved: boolean
  /** Keep only what lies within `depth` edges of the note at `path`. */
  local?: { path: string; depth: number }
}

const isNote = (path: string) => extname(path).toLowerCase() === '.md'

/**
 * The graph to draw. `files` are the workspace's file paths; those that are
 * not notes are its attachments, shown whether or not a note embeds them.
 */
export function buildGraph(
  graph: WorkspaceGraph,
  files: ReadonlyArray<string>,
  filters: GraphFilters,
): GraphModel {
  const nodes = new Map<string, Omit<GraphNode, 'degree'>>()
  const adjacency = new Map<string, Set<string>>()
  const add = (node: Omit<GraphNode, 'degree'>) => {
    if (!nodes.has(node.id)) nodes.set(node.id, node)
    return node.id
  }
  const join = (a: string, b: string) => {
    if (a === b) return
    for (const [from, to] of [
      [a, b],
      [b, a],
    ] as const) {
      let set = adjacency.get(from)
      if (!set) adjacency.set(from, (set = new Set()))
      set.add(to)
    }
  }

  for (const note of graph.notes)
    add({ id: note.path, kind: 'note', label: note.title, path: note.path })
  const attachment = (path: string) =>
    add({ id: path, kind: 'attachment', label: basename(path), path })
  if (filters.attachments)
    for (const path of files) if (!isNote(path)) attachment(path)

  for (const link of graph.links) {
    if (!nodes.has(link.from)) continue
    if (link.to === null) {
      if (!filters.unresolved) continue
      const id = add({
        id: `?${link.target.toLowerCase()}`,
        kind: 'unresolved',
        label: link.target,
        target: link.target,
      })
      join(link.from, id)
    } else if (nodes.get(link.to)?.kind === 'note') join(link.from, link.to)
    else if (!isNote(link.to) && filters.attachments)
      join(link.from, attachment(link.to))
  }

  // Tags are one node however they are capitalised, as in Obsidian.
  if (filters.tags)
    for (const note of graph.notes)
      for (const tag of note.tags) {
        const id = add({
          id: `#${tag.toLowerCase()}`,
          kind: 'tag',
          label: `#${tag}`,
          target: tag,
        })
        join(note.path, id)
      }

  let keep: Set<string>
  if (filters.local) {
    const { path, depth } = filters.local
    keep = new Set(nodes.has(path) ? [path] : [])
    let frontier = [...keep]
    for (let step = 0; step < depth && frontier.length; step++) {
      const next: Array<string> = []
      for (const id of frontier)
        for (const neighbour of adjacency.get(id) ?? [])
          if (!keep.has(neighbour)) {
            keep.add(neighbour)
            next.push(neighbour)
          }
      frontier = next
    }
  } else keep = new Set(nodes.keys())

  const degreeOf = (id: string) =>
    [...(adjacency.get(id) ?? [])].filter((other) => keep.has(other)).length
  const kept: Array<GraphNode> = []
  for (const [id, node] of nodes) {
    if (!keep.has(id)) continue
    const degree = degreeOf(id)
    if (degree === 0 && !filters.orphans && id !== filters.local?.path) continue
    kept.push({ ...node, degree })
  }

  const index = new Map(kept.map((node, i) => [node.id, i]))
  const links: Array<[number, number]> = []
  for (const [i, node] of kept.entries())
    for (const other of adjacency.get(node.id) ?? []) {
      const j = index.get(other)
      if (j !== undefined && i < j) links.push([i, j])
    }
  return { nodes: kept, links }
}
