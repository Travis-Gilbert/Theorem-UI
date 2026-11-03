import { describe, expect, test } from 'bun:test'
import type { WorkspaceGraph } from '@/lib/workspace/types'
import { buildGraph } from './graph-model'
import type { GraphFilters, GraphModel } from './graph-model'

const graph: WorkspaceGraph = {
  notes: [
    { path: 'Hub.md', title: 'Hub', tags: ['map'] },
    { path: 'Ideas.md', title: 'Ideas', tags: ['Map', 'later'] },
    { path: 'Far.md', title: 'Far', tags: [] },
    { path: 'Lonely.md', title: 'Lonely', tags: [] },
  ],
  links: [
    { from: 'Hub.md', to: 'Ideas.md', target: 'Ideas' },
    { from: 'Ideas.md', to: 'Hub.md', target: 'Hub' },
    { from: 'Ideas.md', to: 'Far.md', target: 'Far' },
    { from: 'Hub.md', to: null, target: 'Missing' },
    { from: 'Hub.md', to: 'img/diagram.png', target: 'img/diagram.png' },
  ],
}
const files = [
  'Hub.md',
  'Ideas.md',
  'Far.md',
  'Lonely.md',
  'img/diagram.png',
  'paper.pdf',
]
const all: GraphFilters = {
  tags: true,
  attachments: true,
  orphans: true,
  unresolved: true,
}

/** Each edge as its two ids, sorted, so a test reads as the graph does. */
const edges = ({ nodes, links }: GraphModel) =>
  links.map(([a, b]) => [nodes[a]!.id, nodes[b]!.id].toSorted().join(' - '))

describe('buildGraph', () => {
  test('holds notes, tags, attachments and unresolved links, each edge once', () => {
    const model = buildGraph(graph, files, all)
    expect(
      model.nodes.map(({ id, kind, degree }) => [id, kind, degree]),
    ).toEqual([
      ['Hub.md', 'note', 4],
      ['Ideas.md', 'note', 4],
      ['Far.md', 'note', 1],
      ['Lonely.md', 'note', 0],
      ['img/diagram.png', 'attachment', 1],
      ['paper.pdf', 'attachment', 0],
      ['?missing', 'unresolved', 1],
      ['#map', 'tag', 2],
      ['#later', 'tag', 1],
    ])
    expect(edges(model).toSorted()).toEqual(
      [
        'Hub.md - Ideas.md',
        'Far.md - Ideas.md',
        '?missing - Hub.md',
        'Hub.md - img/diagram.png',
        '#map - Hub.md',
        '#map - Ideas.md',
        '#later - Ideas.md',
      ].toSorted(),
    )
  })

  test('leaves out what its filters turn off', () => {
    const model = buildGraph(graph, files, {
      tags: false,
      attachments: false,
      orphans: false,
      unresolved: false,
    })
    expect(model.nodes.map((node) => node.id)).toEqual([
      'Hub.md',
      'Ideas.md',
      'Far.md',
    ])
    expect(edges(model)).toEqual(['Hub.md - Ideas.md', 'Far.md - Ideas.md'])
  })

  test('a local graph keeps what lies within its depth', () => {
    const local = (depth: number) =>
      buildGraph(graph, files, {
        ...all,
        tags: false,
        local: { path: 'Hub.md', depth },
      }).nodes.map((node) => node.id)
    expect(local(1)).toEqual([
      'Hub.md',
      'Ideas.md',
      'img/diagram.png',
      '?missing',
    ])
    expect(local(2)).toContain('Far.md')
    expect(local(2)).not.toContain('Lonely.md')
  })

  test("marks Theorem's plans and agents' documents, and joins them as notes", () => {
    const model = buildGraph(
      {
        notes: [
          ...graph.notes,
          {
            path: 'Plans/Launch.md',
            title: 'Launch',
            tags: [],
            theorem: { backing: 'plan', agent: false },
          },
          {
            path: 'Notes/Brief.md',
            title: 'Brief',
            tags: [],
            theorem: { backing: 'document', documentKind: 'note', agent: true },
          },
        ],
        links: [
          ...graph.links,
          { from: 'Plans/Launch.md', to: 'Notes/Brief.md', target: 'Brief' },
          {
            from: 'Notes/Brief.md',
            to: 'Hub.md',
            target: 'Hub',
            kind: 'related',
          },
        ],
      },
      files,
      { ...all, tags: false, attachments: false, unresolved: false },
    )
    const kinds = Object.fromEntries(
      model.nodes.map(({ id, kind }) => [id, kind]),
    )
    expect(kinds['Plans/Launch.md']).toBe('plan')
    expect(kinds['Notes/Brief.md']).toBe('agent')
    expect(kinds['Hub.md']).toBe('note')
    expect(edges(model)).toContain('Notes/Brief.md - Plans/Launch.md')
    expect(edges(model)).toContain('Hub.md - Notes/Brief.md')
  })

  test('a local graph keeps its note when nothing links to it', () => {
    const model = buildGraph(graph, files, {
      ...all,
      orphans: false,
      local: { path: 'Lonely.md', depth: 2 },
    })
    expect(model.nodes.map((node) => node.id)).toEqual(['Lonely.md'])
  })
})
