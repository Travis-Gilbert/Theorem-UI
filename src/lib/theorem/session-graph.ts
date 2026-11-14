// SOURCING: none: a pure projection over lib/theorem/organization's records. The lenses and the rule that viewing changes nothing are docs/plans/projects-sidebar-and-session-graph.md §9.
//
// A graph of sessions is a view of the organization, P(records, lens, scope):
// it reads threads and projects and returns nodes and edges, and nothing it
// does writes to Theorem, the sidebar's preferences or the shell. Each lens
// draws one kind of relation and says which records it came from:
//
// - Lineage: a fork is drawn from the session it was forked from, and a
//   continuation from the session it continues. Both come from Thread.origin.
// - Membership: the projects a session is filed in, including the placements
//   a person locked against the Librarian (Membership.pinned).
// - Delegation, Team and Related need records Theorem does not serve across
//   sessions yet (a project-wide delegation index; `directs`; `related_to`).
//   Those lenses answer with the reason and draw nothing in their place.
import { lastMoved } from './organization'
import type { ProjectEntry, ThreadEntry } from './organization'

export type GraphLens =
  'lineage' | 'membership' | 'delegation' | 'team' | 'related'

/** How a lens is laid out: by ELK algorithm and direction. */
export type LensLayout = {
  algorithm: 'layered' | 'mrtree' | 'stress'
  direction?: 'RIGHT' | 'DOWN'
}

export type LensInfo = {
  id: GraphLens
  label: string
  /** One sentence on what the lens draws. */
  description: string
  layout: LensLayout
}

export const LENSES: readonly LensInfo[] = [
  {
    id: 'lineage',
    label: 'Lineage',
    description:
      'Forks and continuations: where each session came from. Replies and regenerations stay inside their session.',
    layout: { algorithm: 'layered', direction: 'RIGHT' },
  },
  {
    id: 'membership',
    label: 'Projects',
    description:
      'The projects each session is filed in, and which placements a person kept.',
    layout: { algorithm: 'layered', direction: 'RIGHT' },
  },
  {
    id: 'delegation',
    label: 'Delegation',
    description: 'Work a session handed to another agent, and what came back.',
    layout: { algorithm: 'layered', direction: 'DOWN' },
  },
  {
    id: 'team',
    label: 'Team',
    description:
      'Who directs whom: a lead at the top and authority running one way, or a flat group.',
    layout: { algorithm: 'mrtree', direction: 'DOWN' },
  },
  {
    id: 'related',
    label: 'Related',
    description:
      'Sessions connected because they bear on each other, without nesting either.',
    layout: { algorithm: 'stress' },
  },
]

export const lensInfo = (lens: GraphLens) =>
  LENSES.find((entry) => entry.id === lens)!

export type SessionNode = {
  kind: 'session'
  id: string
  threadId: string
  title: string
  lastMovedMs: number
  running: boolean
  wanting: boolean
  /** Listed outside the scope, drawn only because a session in it came from there. */
  outside: boolean
}

export type ProjectNode = {
  kind: 'project'
  id: string
  projectId: string
  title: string
  /** The project the graph is scoped to. */
  scope: boolean
}

export type GraphNode = SessionNode | ProjectNode

export type Relation = 'forked' | 'continued' | 'member' | 'kept'

export type GraphEdge = {
  id: string
  source: string
  target: string
  relation: Relation
}

export type SessionGraph =
  | {
      lens: GraphLens
      served: true
      nodes: readonly GraphNode[]
      edges: readonly GraphEdge[]
    }
  | { lens: GraphLens; served: false; reason: string }

/** How each relation reads in words, for the legend, the list and screen readers. */
export const RELATION_LABEL: Readonly<Record<Relation, string>> = {
  forked: 'forked from',
  continued: 'continues',
  member: 'filed in',
  kept: 'kept in',
}

const sessionId = (threadId: string) => `session:${threadId}`
const projectId = (id: string) => `project:${id}`

function sessionNode(thread: ThreadEntry, outside: boolean): SessionNode {
  return {
    kind: 'session',
    id: sessionId(thread.threadId),
    threadId: thread.threadId,
    title: thread.title || 'New chat',
    lastMovedMs: lastMoved(thread),
    running: thread.attention.running,
    wanting: thread.attention.reasons.length > 0,
    outside,
  }
}

/** Oldest first, then by id: the order ELK keeps side-by-side nodes in, so a refresh does not reshuffle them. */
const byAge = (a: ThreadEntry, b: ThreadEntry) =>
  a.createdAtMs - b.createdAtMs || a.threadId.localeCompare(b.threadId)

const inScope = (thread: ThreadEntry, scope: string | undefined) =>
  scope === undefined || thread.memberships.some((m) => m.projectId === scope)

const UNSERVED: Partial<Record<GraphLens, string>> = {
  delegation:
    'Theorem keeps each delegation inside its conversation and has no index of them across sessions yet. Open a session to see its delegations.',
  team: 'Theorem does not record who directs whom yet. Once it serves that relation, this lens draws the lead at the top with authority running one way, or a flat group.',
  related:
    'Theorem does not record related sessions yet. Once it does, sessions can be connected here without nesting either.',
}

/**
 * The graph a lens draws over these records, scoped to one project or, with
 * no scope, to every session. Pure: the same records give the same graph, and
 * nothing is written anywhere.
 */
export function projectGraph(
  lens: GraphLens,
  threads: readonly ThreadEntry[],
  projects: readonly ProjectEntry[],
  scope?: string,
): SessionGraph {
  const reason = UNSERVED[lens]
  if (reason) return { lens, served: false, reason }
  const scoped = threads.filter((t) => inScope(t, scope)).sort(byAge)
  return lens === 'lineage'
    ? { lens, served: true, ...lineage(scoped, threads) }
    : { lens, served: true, ...membership(scoped, projects, scope) }
}

function lineage(
  scoped: readonly ThreadEntry[],
  all: readonly ThreadEntry[],
): { nodes: GraphNode[]; edges: GraphEdge[] } {
  const byId = new Map(all.map((t) => [t.threadId, t]))
  const shown = new Set(scoped.map((t) => t.threadId))
  const outside: ThreadEntry[] = []
  const edges: GraphEdge[] = []
  for (const thread of scoped) {
    const origin = thread.origin
    if (!origin || origin.threadId === thread.threadId) continue
    const source = byId.get(origin.threadId)
    // A source Theorem no longer lists: the session keeps its place, with no edge to nowhere.
    if (!source) continue
    if (!shown.has(source.threadId)) {
      shown.add(source.threadId)
      outside.push(source)
    }
    edges.push({
      id: `${origin.kind}:${source.threadId}->${thread.threadId}`,
      source: sessionId(source.threadId),
      target: sessionId(thread.threadId),
      relation: origin.kind,
    })
  }
  return {
    nodes: [
      ...outside.sort(byAge).map((t) => sessionNode(t, true)),
      ...scoped.map((t) => sessionNode(t, false)),
    ],
    edges,
  }
}

function membership(
  scoped: readonly ThreadEntry[],
  projects: readonly ProjectEntry[],
  scope: string | undefined,
): { nodes: GraphNode[]; edges: GraphEdge[] } {
  const titles = new Map(projects.map((p) => [p.projectId, p]))
  const used = new Set<string>()
  const edges: GraphEdge[] = []
  for (const thread of scoped)
    for (const m of thread.memberships) {
      const project = titles.get(m.projectId)
      if (!project || project.isInbox) continue
      used.add(m.projectId)
      edges.push({
        id: `member:${m.projectId}->${thread.threadId}`,
        source: projectId(m.projectId),
        target: sessionId(thread.threadId),
        relation: m.pinned ? 'kept' : 'member',
      })
    }
  // The scoped project first, then the others in the organization's order.
  const projectNodes: ProjectNode[] = projects
    .filter((p) => used.has(p.projectId) || p.projectId === scope)
    .sort(
      (a, b) => Number(b.projectId === scope) - Number(a.projectId === scope),
    )
    .map((p) => ({
      kind: 'project',
      id: projectId(p.projectId),
      projectId: p.projectId,
      title: p.title,
      scope: p.projectId === scope,
    }))
  return {
    nodes: [...projectNodes, ...scoped.map((t) => sessionNode(t, false))],
    edges,
  }
}

/** Each edge as a sentence, for the list beside the graph and for screen readers. */
export function describeEdges(graph: SessionGraph): string[] {
  if (!graph.served) return []
  const names = new Map(graph.nodes.map((node) => [node.id, node.title]))
  // Every relation reads from the target: "B forked from A", "B filed in P".
  return graph.edges.map(
    (edge) =>
      `${names.get(edge.target)} ${RELATION_LABEL[edge.relation]} ${names.get(edge.source)}`,
  )
}
