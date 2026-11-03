// SOURCING: @xyflow/react's Node and Edge (what React Flow draws) from JSON
// Canvas 1.0 nodes and edges (obsidian/canvas types). The mapping is the JSON
// Canvas spec's: sides, ends with their defaults, the six preset colours.
import { MarkerType } from '@xyflow/react'
import type { Edge, Node, Position } from '@xyflow/react'
import type { CanvasData, CanvasEdge, CanvasNode } from '@/lib/canvas/json-canvas'

export type CanvasFlowNode = Node<{ node: CanvasNode }, CanvasNode['type']>
export type CanvasFlowEdge = Edge<{ edge: CanvasEdge }>

export const SIDES = ['top', 'right', 'bottom', 'left'] as const
export type Side = (typeof SIDES)[number]

/** Obsidian's colours for the spec's presets "1" to "6". */
const PRESETS: Record<string, string> = {
  '1': '#fb464c',
  '2': '#e9973f',
  '3': '#e0de71',
  '4': '#44cf6e',
  '5': '#53dfdd',
  '6': '#a882ff',
}

/** A canvas colour as CSS: a preset number or a hex colour. */
export const canvasColor = (color: string | undefined) =>
  color ? (PRESETS[color] ?? color) : undefined

/** The side of `from` that faces `to`, for an edge that names none. */
export function facingSide(from: CanvasNode, to: CanvasNode): Side {
  const dx = to.x + to.width / 2 - (from.x + from.width / 2)
  const dy = to.y + to.height / 2 - (from.y + from.height / 2)
  if (Math.abs(dx) * from.height > Math.abs(dy) * from.width)
    return dx > 0 ? 'right' : 'left'
  return dy > 0 ? 'bottom' : 'top'
}

const isSide = (side: unknown): side is Side =>
  typeof side === 'string' && (SIDES as ReadonlyArray<string>).includes(side)

/**
 * Edges meet a node at the middle of a side, as JSON Canvas draws them.
 * Giving React Flow the four points (its `handles`, meant for rendering
 * without measuring) lets edges draw on the first paint, and keeps them
 * there whatever the node's content measures.
 */
export function withSideHandles(node: CanvasFlowNode): CanvasFlowNode {
  const width = node.width ?? node.measured?.width ?? 0
  const height = node.height ?? node.measured?.height ?? 0
  const at = (side: Side, x: number, y: number) => ({
    id: side,
    type: 'source' as const,
    position: side as Position,
    x,
    y,
    width: 0,
    height: 0,
  })
  return {
    ...node,
    handles: [
      at('top', width / 2, 0),
      at('right', width, height / 2),
      at('bottom', width / 2, height),
      at('left', 0, height / 2),
    ],
  }
}

export function toFlowNode(node: CanvasNode): CanvasFlowNode {
  return withSideHandles({
    id: node.id,
    type: node.type,
    position: { x: node.x, y: node.y },
    width: node.width,
    height: node.height,
    data: { node },
    // Groups sit under the nodes inside them, as in Obsidian.
    zIndex: node.type === 'group' ? -1 : 0,
  })
}

export function toFlowEdges(canvas: CanvasData): Array<CanvasFlowEdge> {
  const byId = new Map(canvas.nodes.map((n) => [n.id, n]))
  return canvas.edges.flatMap((edge): Array<CanvasFlowEdge> => {
    const from = byId.get(edge.fromNode)
    const to = byId.get(edge.toNode)
    if (!from || !to) return []
    const color = canvasColor(edge.color)
    const marker = (end: string | undefined, fallback: 'none' | 'arrow') =>
      (end ?? fallback) === 'arrow'
        ? { type: MarkerType.ArrowClosed, color }
        : undefined
    return [
      {
        id: edge.id,
        source: edge.fromNode,
        target: edge.toNode,
        sourceHandle: isSide(edge.fromSide) ? edge.fromSide : facingSide(from, to),
        targetHandle: isSide(edge.toSide) ? edge.toSide : facingSide(to, from),
        markerStart: marker(edge.fromEnd, 'none'),
        markerEnd: marker(edge.toEnd, 'arrow'),
        label: edge.label,
        style: color ? { stroke: color } : undefined,
        data: { edge },
      },
    ]
  })
}

/** A fresh id in the form Obsidian writes: 16 hex digits. */
export const canvasId = () =>
  crypto.randomUUID().replaceAll('-', '').slice(0, 16)

/** The nodes that lie wholly inside `group`, which move with it. */
export function nodesInside(
  canvas: CanvasData,
  group: CanvasNode,
): Array<CanvasNode> {
  return canvas.nodes.filter(
    (n) =>
      n.id !== group.id &&
      n.x >= group.x &&
      n.y >= group.y &&
      n.x + n.width <= group.x + group.width &&
      n.y + n.height <= group.y + group.height,
  )
}
