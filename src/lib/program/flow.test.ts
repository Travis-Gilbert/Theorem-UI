import { describe, expect, it } from 'bun:test'
import type { ProgramDefinition } from './contracts'
import {
  inputHandle,
  layoutProgram,
  nodeIdFor,
  outputHandle,
  portClass,
  portOfHandle,
  toFlowEdges,
  toFlowNodes,
} from './flow'

const port = (id: string) => ({ id, shape_id: 'theorem.monitor.snapshot.v1' })
const program = {
  name: 'Price watch',
  nodes: [
    {
      id: 'fetch',
      inputs: [],
      outputs: [port('snapshot')],
      kind: 'source',
      selector: { plane: 'scenario' },
    },
    { id: 'notify', inputs: [port('noticed')], outputs: [], kind: 'sink' },
  ],
  edges: [
    {
      id: 'e1',
      from_node: 'fetch',
      from_port: 'snapshot',
      to_node: 'notify',
      to_port: 'noticed',
    },
  ],
} as unknown as ProgramDefinition

describe('program flow', () => {
  it('keeps edges on the exact ports they connect', () => {
    const edge = toFlowEdges(program, {})[0]!
    expect(edge.sourceHandle).toBe(outputHandle('snapshot'))
    expect(edge.targetHandle).toBe(inputHandle('noticed'))
    expect(portOfHandle(edge.sourceHandle)).toBe('snapshot')
  })

  it('shows liveness Theorem reported and otherwise dormant', () => {
    const nodes = toFlowNodes(program, {}, { fetch: 'running' })
    expect(nodes[0]!.data.liveness).toBe('running')
    expect(nodes[1]!.data.liveness).toBe('dormant')
    expect(toFlowEdges(program, { fetch: 'running' })[0]!.animated).toBe(true)
  })

  it('keeps saved positions and places the rest', async () => {
    const placed = await layoutProgram(program, {
      nodes: { fetch: { x: 7, y: 9 } },
    })
    expect(placed.fetch).toEqual({ x: 7, y: 9 })
    expect(placed.notify).toBeDefined()
  })

  it('classifies ports into at most five classes', () => {
    const classes = new Set(
      [
        'tabular_any',
        'graph_nodes',
        'theorem.graph-lisp.value.v1',
        'theorem.monitor.snapshot.v1',
        'anything',
      ].map((shape) => portClass(shape)),
    )
    expect(classes.size).toBeLessThanOrEqual(5)
  })

  it('never reuses a node id', () => {
    expect(nodeIdFor(program, 'Fetch')).toBe('fetch-2')
    expect(nodeIdFor(program, 'Verify')).toBe('verify')
  })
})

describe('muted branches', () => {
  it('marks everything downstream of a muted node undetermined, and nothing upstream', async () => {
    const { mutedDownstream } = await import('./flow')
    const node = (id: string, muted = false) =>
      ({ id, muted, bypassed: false, inputs: [], outputs: [] }) as never
    const edge = (id: string, from: string, to: string) =>
      ({
        id,
        from_node: from,
        from_port: 'o',
        to_node: to,
        to_port: 'i',
      }) as never
    const found = mutedDownstream({
      nodes: [node('a'), node('b', true), node('c'), node('d')],
      edges: [edge('ab', 'a', 'b'), edge('bc', 'b', 'c'), edge('cd', 'c', 'd')],
    } as never)
    expect([...found.nodes].sort()).toEqual(['c', 'd'])
    expect([...found.edges].sort()).toEqual(['bc', 'cd'])
  })
})

describe('waypoints', () => {
  it('go on the leg of the route they lengthen least', async () => {
    const { insertWaypoint } = await import('./flow')
    const route = insertWaypoint(
      [{ x: 100, y: 0 }],
      { x: 0, y: 0 },
      { x: 200, y: 0 },
      { x: 150, y: 10 },
    )
    expect(route).toEqual([
      { x: 100, y: 0 },
      { x: 150, y: 10 },
    ])
  })
})
