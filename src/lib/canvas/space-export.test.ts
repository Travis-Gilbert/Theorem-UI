// SOURCING: bun:test over the Space to JSON Canvas export, against the
// in-memory workspace.
import { describe, expect, test } from 'bun:test'
import { toFlowEdges } from '@/components/handlers/canvas/canvas-flow'
import type { Theorem } from '@/lib/theorem/client'
import { fakeWorkspace } from '../../../test/workspace'
import { parseCanvas } from './json-canvas'
import { exportSpace, spaceToCanvas } from './space-export'

const authorship = { kind: 'user' } as unknown as Theorem.PlacementAuthorship

const space: Pick<Theorem.SpaceProject, 'placements' | 'groups' | 'connections'> = {
  groups: [{ id: 'g', rect: { x: -20, y: -20, w: 900, h: 400 }, label: 'Ideas', color: '2' }],
  placements: [
    {
      target: 'object',
      id: 'p:1',
      rect: { x: 0, y: 0, w: 360.4, h: 280.6 },
      authorship,
      object: { kind: 'document', id: 'doc-1' },
    },
    {
      target: 'note',
      id: 'p:2',
      rect: { x: 400, y: 0, w: 200, h: 100 },
      authorship,
      text: 'A sticky note',
      color: '#ff0000',
    },
    {
      target: 'space',
      id: 'p:3',
      rect: { x: 0, y: 500, w: 200, h: 100 },
      authorship,
      space: 'space:project:other',
      label: 'Other project',
    },
    {
      target: 'ink',
      id: 'p:4',
      rect: { x: 0, y: 700, w: 50, h: 50 },
      authorship,
      ink: {} as Theorem.SpaceInk,
    },
    {
      target: 'object',
      id: 'p:5',
      rect: { x: 700, y: 500, w: 200, h: 100 },
      authorship,
      object: { kind: 'dataset', id: 'ds-9' },
    },
  ],
  connections: [
    { id: 'c:1', from: 'p:1', to: 'p:2', from_side: 'right', to_side: 'left', to_end: 'arrow' },
    { id: 'c:2', from: 'p:2', to: 'p:3', from_end: 'arrow', label: 'see', color: '5' },
    { id: 'c:3', from: 'p:3', to: 'p:4' },
  ],
}

const markdown = (id: string) => (id === 'doc-1' ? '# First\n\nBody\n' : '')

describe('spaceToCanvas', () => {
  test('writes the Space as JSON Canvas, groups first', () => {
    const { text, skipped } = spaceToCanvas(space, markdown)
    const canvas = parseCanvas(text)
    expect(skipped).toBe(1)
    expect(canvas.nodes.map((n) => [n.id, n.type])).toEqual([
      ['g', 'group'],
      ['p:1', 'text'],
      ['p:2', 'text'],
      ['p:3', 'text'],
      ['p:5', 'text'],
    ])
    expect(canvas.nodes[0]).toMatchObject({ label: 'Ideas', color: '2', x: -20, width: 900 })
    expect(canvas.nodes[1]).toMatchObject({
      text: '# First\n\nBody\n',
      width: 360,
      height: 281,
      'theorem:object': { kind: 'document', id: 'doc-1' },
    })
    expect(canvas.nodes[2]).toMatchObject({ text: 'A sticky note', color: '#ff0000' })
    expect(canvas.nodes[3]).toMatchObject({
      text: 'Other project',
      'theorem:space': 'space:project:other',
    })
    expect(canvas.nodes[4]).toMatchObject({ text: 'dataset ds-9' })
    // Obsidian writes tabs.
    expect(text).toStartWith('{\n\t"nodes": [')
  })

  test('keeps sides, labels, colours and how each end looks', () => {
    const canvas = parseCanvas(spaceToCanvas(space, markdown).text)
    // The edge to the left-out drawing goes with it.
    expect(canvas.edges.map((e) => e.id)).toEqual(['c:1', 'c:2'])
    expect(canvas.edges[0]).toEqual({
      id: 'c:1',
      fromNode: 'p:1',
      fromSide: 'right',
      toNode: 'p:2',
      toSide: 'left',
    })
    expect(canvas.edges[1]).toEqual({
      id: 'c:2',
      fromNode: 'p:2',
      fromEnd: 'arrow',
      toNode: 'p:3',
      toEnd: 'none',
      label: 'see',
      color: '5',
    })
    // Read back, the arrows sit where the Space drew them.
    const [first, second] = toFlowEdges(canvas)
    expect([first?.markerStart, first?.markerEnd !== undefined]).toEqual([undefined, true])
    expect([second?.markerStart !== undefined, second?.markerEnd]).toEqual([true, undefined])
  })
})

describe('exportSpace', () => {
  test('writes <title>.canvas, then the next free name', async () => {
    const ws = fakeWorkspace({})
    const asked: Array<string> = []
    const markdownOf = (id: string) => {
      asked.push(id)
      return Promise.resolve(markdown(id))
    }
    const first = await exportSpace(ws.client, 'Q3: plans/ideas', space, markdownOf)
    expect(first).toEqual({ path: 'Q3- plans-ideas.canvas', skipped: 1 })
    expect(asked).toEqual(['doc-1'])
    expect(parseCanvas(ws.text(first.path)!).nodes).toHaveLength(5)

    const second = await exportSpace(ws.client, 'Q3: plans/ideas', space, markdownOf)
    expect(second.path).toBe('Q3- plans-ideas 1.canvas')
    expect(ws.text(second.path)).toBe(ws.text(first.path))
  })

  test('an empty Space is an empty canvas', async () => {
    const ws = fakeWorkspace({})
    const { path } = await exportSpace(ws.client, '', {}, () => Promise.resolve(''))
    expect(path).toBe('Space.canvas')
    expect(parseCanvas(ws.text(path)!)).toEqual({ nodes: [], edges: [] })
  })
})
