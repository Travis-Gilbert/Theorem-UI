// SOURCING: bun:test over the pure projection in ./session-graph
import { describe, expect, test } from 'bun:test'
import { describeEdges, projectGraph } from './session-graph'
import type { Membership, ProjectEntry, ThreadEntry } from './organization'

const project = (projectId: string, over: Partial<ProjectEntry> = {}) =>
  ({
    projectId,
    title: projectId.toUpperCase(),
    isInbox: false,
    createdBy: 'user',
    threadCount: 0,
    outputCount: 0,
    brief: false,
    ...over,
  }) satisfies ProjectEntry

const member = (projectId: string, pinned = false): Membership => ({
  projectId,
  by: 'librarian',
  pinned,
  why: 'about this',
  atMs: 1,
})

const thread = (
  threadId: string,
  createdAtMs: number,
  over: Partial<ThreadEntry> = {},
): ThreadEntry => ({
  threadId,
  title: threadId,
  homeProjectId: 'inbox',
  revision: 1,
  createdAtMs,
  memberships: [member('p')],
  attention: { reasons: [], running: false },
  ...over,
})

const projects = [
  project('inbox', { isInbox: true }),
  project('p'),
  project('q'),
]

const root = thread('root', 1)
const fork = thread('fork', 2, {
  origin: { kind: 'forked', threadId: 'root', branchId: 'b', messageId: 'm' },
})
const next = thread('next', 3, {
  origin: { kind: 'continued', threadId: 'root' },
})
// Forked from a session filed only in q.
const elsewhere = thread('elsewhere', 0, { memberships: [member('q')] })
const visitor = thread('visitor', 4, {
  origin: {
    kind: 'forked',
    threadId: 'elsewhere',
    branchId: 'b',
    messageId: 'm',
  },
})
// Its source is gone from Theorem.
const orphan = thread('orphan', 5, {
  origin: { kind: 'continued', threadId: 'gone' },
})

const records = [orphan, next, visitor, fork, root, elsewhere]

describe('lineage', () => {
  const graph = projectGraph('lineage', records, projects, 'p')
  if (!graph.served) throw new Error('lineage is served')

  test('forks and continuations are distinct relations from their source', () => {
    const relations = Object.fromEntries(
      graph.edges.map((e) => [e.target, `${e.relation} ${e.source}`]),
    )
    expect(relations['session:fork']).toBe('forked session:root')
    expect(relations['session:next']).toBe('continued session:root')
  })

  test('a source outside the scope is drawn and marked, a missing one is not invented', () => {
    const outside = graph.nodes.filter((n) => n.kind === 'session' && n.outside)
    expect(outside.map((n) => n.id)).toEqual(['session:elsewhere'])
    expect(graph.edges.some((e) => e.target === 'session:orphan')).toBe(false)
    expect(graph.nodes.some((n) => n.id === 'session:orphan')).toBe(true)
  })

  test('nodes keep a stable order: outside sources, then oldest first', () => {
    expect(graph.nodes.map((n) => n.id)).toEqual([
      'session:elsewhere',
      'session:root',
      'session:fork',
      'session:next',
      'session:visitor',
      'session:orphan',
    ])
  })

  test('each edge reads as a sentence', () => {
    expect(describeEdges(graph)).toContain('fork forked from root')
    expect(describeEdges(graph)).toContain('next continues root')
  })
})

describe('membership', () => {
  test('sessions link to every project they are filed in; a kept placement says so', () => {
    const both = thread('both', 1, {
      memberships: [member('p', true), member('q')],
    })
    const graph = projectGraph('membership', [both], projects, 'p')
    if (!graph.served) throw new Error('membership is served')
    expect(graph.nodes[0]).toMatchObject({
      kind: 'project',
      projectId: 'p',
      scope: true,
    })
    expect(graph.edges.map((e) => `${e.relation} ${e.source}`)).toEqual([
      'kept project:p',
      'member project:q',
    ])
  })
})

describe('viewing', () => {
  test('lenses without served records say why and draw nothing', () => {
    for (const lens of ['delegation', 'team', 'related'] as const) {
      const graph = projectGraph(lens, records, projects, 'p')
      expect(graph.served).toBe(false)
      if (!graph.served) expect(graph.reason.length).toBeGreaterThan(0)
    }
  })

  test('projecting changes no record and gives the same graph again', () => {
    const frozen = records.map((r) => Object.freeze(structuredClone(r)))
    const before = JSON.stringify(frozen)
    const first = projectGraph('lineage', frozen, projects, 'p')
    projectGraph('membership', frozen, projects, 'p')
    expect(JSON.stringify(frozen)).toBe(before)
    expect(projectGraph('lineage', frozen, projects, 'p')).toEqual(first)
  })
})
