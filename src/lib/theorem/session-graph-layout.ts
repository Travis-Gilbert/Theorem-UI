// SOURCING: elkjs (elk.bundled, as lib/theorem/plans and lib/program/flow load it): layered for lineage and membership, mrtree for a team's one-way tree, stress for related sessions, each keeping the projection's node order so a refresh does not reshuffle the graph. ELK is the one layout engine here; the node renderer does not depend on it.
import ELK from 'elkjs/lib/elk.bundled.js'
import type { ElkNode } from 'elkjs/lib/elk-api'
import type { LensLayout } from './session-graph'

type Point = { x: number; y: number }
type Size = { width: number; height: number }

export type GraphLayout = {
  positions: Record<string, Point>
  /** Each edge as the router drew it, source to target. */
  routes: Record<string, Point[]>
  width: number
  height: number
}

const elk = new ELK()

function options({ algorithm, direction }: LensLayout): Record<string, string> {
  const common = {
    'elk.algorithm': algorithm,
    'elk.padding': '[top=16,left=16,bottom=16,right=16]',
    'elk.spacing.nodeNode': '20',
  }
  if (algorithm === 'stress')
    return { ...common, 'elk.stress.desiredEdgeLength': '160' }
  if (algorithm === 'mrtree')
    return { ...common, 'elk.direction': direction ?? 'DOWN' }
  return {
    ...common,
    'elk.direction': direction ?? 'RIGHT',
    'elk.edgeRouting': 'ORTHOGONAL',
    'elk.layered.spacing.nodeNodeBetweenLayers': '56',
    'elk.layered.spacing.edgeNodeBetweenLayers': '16',
    'elk.spacing.edgeEdge': '12',
    'elk.layered.considerModelOrder.strategy': 'NODES_AND_EDGES',
  }
}

/** Places the nodes at the sizes they measured and routes the edges between them. */
export async function layoutGraph(
  nodes: readonly { id: string }[],
  edges: readonly { id: string; source: string; target: string }[],
  sizes: Readonly<Record<string, Size>>,
  layout: LensLayout,
): Promise<GraphLayout> {
  const ids = new Set(nodes.map((node) => node.id))
  const input: ElkNode = {
    id: 'sessions',
    layoutOptions: options(layout),
    children: nodes.map((node) => ({
      id: node.id,
      ...(sizes[node.id] ?? { width: 220, height: 44 }),
    })),
    edges: edges
      .filter((e) => ids.has(e.source) && ids.has(e.target))
      .map((e) => ({ id: e.id, sources: [e.source], targets: [e.target] })),
  }
  const graph = await elk.layout(input)
  const positions: Record<string, Point> = {}
  for (const child of graph.children ?? [])
    positions[child.id] = { x: child.x ?? 0, y: child.y ?? 0 }
  const routes: Record<string, Point[]> = {}
  for (const edge of graph.edges ?? []) {
    const section = edge.sections?.[0]
    if (section)
      routes[edge.id] = [
        section.startPoint,
        ...(section.bendPoints ?? []),
        section.endPoint,
      ]
  }
  return {
    positions,
    routes,
    width: graph.width ?? 0,
    height: graph.height ?? 0,
  }
}
