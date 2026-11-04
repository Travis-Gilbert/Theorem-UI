// SOURCING: none — a small deterministic layered layout for the data model diagram: the most connected type in the first column, each type one column per relation hop from it, unrelated types in a last column; no layout library is a direct dependency here (elkjs arrives only through beautiful-mermaid)

export type LayoutNode = { id: string; height: number }
export type LayoutEdge = { source: string; target: string }
export type Position = { x: number; y: number }

export const NODE_WIDTH = 260
const COLUMN_GAP = 96
const ROW_GAP = 28

/**
 * Positions for every node. Connected components are laid out one after
 * another, each around its own hub, so two unrelated groups never interleave.
 * Ties break on id, so the same model always draws the same way.
 */
export function layoutModel(
  nodes: LayoutNode[],
  edges: LayoutEdge[],
): Record<string, Position> {
  const ids = new Set(nodes.map((n) => n.id))
  const neighbours = new Map<string, Set<string>>(
    nodes.map((n) => [n.id, new Set()]),
  )
  for (const { source, target } of edges) {
    if (source === target || !ids.has(source) || !ids.has(target)) continue
    neighbours.get(source)!.add(target)
    neighbours.get(target)!.add(source)
  }
  const degree = (id: string) => neighbours.get(id)!.size
  const byHub = [...nodes].sort(
    (a, b) => degree(b.id) - degree(a.id) || a.id.localeCompare(b.id),
  )

  // Hop distance from each component's hub; a component's columns run on
  // from the previous component's.
  const column = new Map<string, number>()
  const loners: string[] = []
  let offset = 0
  for (const hub of byHub) {
    if (column.has(hub.id)) continue
    if (degree(hub.id) === 0) {
      loners.push(hub.id)
      continue
    }
    const depth = new Map([[hub.id, 0]])
    const queue = [hub.id]
    while (queue.length) {
      const id = queue.shift()!
      const next = [...neighbours.get(id)!].sort()
      for (const other of next)
        if (!depth.has(other)) {
          depth.set(other, depth.get(id)! + 1)
          queue.push(other)
        }
    }
    for (const [id, d] of depth) column.set(id, d + offset)
    offset += Math.max(...depth.values()) + 1
  }
  for (const id of loners) column.set(id, offset)

  const height = new Map(nodes.map((n) => [n.id, n.height]))
  const stacks = new Map<number, string[]>()
  for (const node of byHub) {
    const c = column.get(node.id)!
    stacks.set(c, [...(stacks.get(c) ?? []), node.id])
  }
  const positions: Record<string, Position> = {}
  for (const [c, stack] of stacks) {
    let y = 0
    for (const id of stack.sort(
      (a, b) => degree(b) - degree(a) || a.localeCompare(b),
    )) {
      positions[id] = { x: c * (NODE_WIDTH + COLUMN_GAP), y }
      y += height.get(id)! + ROW_GAP
    }
  }
  return positions
}
