import { beforeEach, describe, expect, it } from 'bun:test'
import type { ProgramDefinition } from './contracts'
import { sameDocument, useProgramDoc } from './store'

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
  useProgramDoc
    .getState()
    .open(
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
    useProgramDoc
      .getState()
      .addEdge(
        {
          id: 'b-free',
          from_node: 'b',
          from_port: 'out',
          to_node: 'b',
          to_port: 'x',
        },
        compatible,
      )
    useProgramDoc
      .getState()
      .reconnectEdge(
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
})
