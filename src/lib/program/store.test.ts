import { beforeEach, describe, expect, it, spyOn } from 'bun:test'
import * as api from './api'
import type { CatalogEntry, ProgramDefinition } from './contracts'
import {
  insertNode,
  sameDocument,
  spliceExisting,
  useProgramDoc,
} from './store'

const port = (id: string) => ({ id, shape_id: 'theorem.monitor.snapshot.v1' })
const program = {
  name: 'Price watch',
  nodes: [
    { id: 'a', inputs: [], outputs: [port('out')], kind: 'source' },
    { id: 'b', inputs: [], outputs: [port('out')], kind: 'source' },
    { id: 'sink', inputs: [port('in')], outputs: [], kind: 'sink' },
  ],
  edges: [
    {
      id: 'a-sink',
      from_node: 'a',
      from_port: 'out',
      to_node: 'sink',
      to_port: 'in',
    },
  ],
} as unknown as ProgramDefinition

const open = (nodeId: string) =>
  useProgramDoc.getState().open(
    {
      node_id: nodeId,
      content_id: `${nodeId}-content`,
      program,
      layout: null,
    },
    {},
  )

const compatible = { status: 'compatible' } as never

describe('program document', () => {
  beforeEach(() => useProgramDoc.getState().close())

  it('moves a wire onto an input by replacing the wire already there', () => {
    open('graph-a')
    useProgramDoc.getState().addEdge(
      {
        id: 'b-free',
        from_node: 'b',
        from_port: 'out',
        to_node: 'b',
        to_port: 'x',
      },
      compatible,
    )
    useProgramDoc.getState().reconnectEdge(
      'b-free',
      {
        id: 'b-sink',
        from_node: 'b',
        from_port: 'out',
        to_node: 'sink',
        to_port: 'in',
      },
      compatible,
    )
    const into = useProgramDoc
      .getState()
      .program!.edges.filter(
        (edge) => edge.to_node === 'sink' && edge.to_port === 'in',
      )
    expect(into.map((edge) => edge.id)).toEqual(['b-sink'])
  })

  it('tells work that waited when its document has closed or been replaced', () => {
    open('graph-a')
    const stillA = sameDocument()
    expect(stillA()).toBe(true)
    useProgramDoc.getState().close()
    open('graph-b')
    expect(stillA()).toBe(false)
    expect(sameDocument()()).toBe(true)
  })

  it('gives two blocks inserted at once ids of their own', async () => {
    open('graph-a')
    const entry = {
      id: 'theorem.rule.filter',
      class_name: 'Filter',
      group: 'rules',
      node_kind: 'rule',
      input_ports: [],
      output_ports: [],
    } as unknown as CatalogEntry
    await Promise.all([
      insertNode(entry, { x: 0, y: 0 }),
      insertNode(entry, { x: 40, y: 0 }),
    ])
    const ids = useProgramDoc.getState().program!.nodes.map((node) => node.id)
    expect(new Set(ids).size).toBe(ids.length)
    expect(ids).toContain('filter')
    expect(ids).toContain('filter-2')
  })

  it('splices a node onto a wire once when it is dropped twice at once', async () => {
    const check = spyOn(api, 'validateEdge').mockResolvedValue(compatible)
    try {
      useProgramDoc.getState().open(
        {
          node_id: 'graph-a',
          content_id: 'graph-a-content',
          program: {
            ...program,
            nodes: [
              ...program.nodes,
              {
                id: 'pass',
                inputs: [port('in')],
                outputs: [port('out')],
                kind: 'rule',
              },
            ],
          } as unknown as ProgramDefinition,
          layout: null,
        },
        {},
      )
      const results = await Promise.all([
        spliceExisting('pass', 'a-sink'),
        spliceExisting('pass', 'a-sink'),
      ])
      expect(results.filter((result) => result.spliced)).toHaveLength(1)
      const edges = useProgramDoc.getState().program!.edges
      expect(edges.filter((edge) => edge.to_node === 'pass')).toHaveLength(1)
      expect(edges.filter((edge) => edge.to_node === 'sink')).toHaveLength(1)
    } finally {
      check.mockRestore()
    }
  })
})
