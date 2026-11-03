// SOURCING: bun:test over the JSON Canvas to React Flow mapping.
import { describe, expect, test } from 'bun:test'
import { MarkerType } from '@xyflow/react'
import type { CanvasData, CanvasNode } from '@/lib/canvas/json-canvas'
import {
  canvasColor,
  canvasId,
  facingSide,
  nodesInside,
  toFlowEdges,
  toFlowNode,
  withSideHandles,
} from './canvas-flow'

const box = (id: string, x: number, y: number, w = 100, h = 50): CanvasNode => ({
  id,
  type: 'text',
  text: id,
  x,
  y,
  width: w,
  height: h,
})

describe('canvas-flow', () => {
  test('preset colours are Obsidian’s, other colours pass through', () => {
    expect(canvasColor('4')).toBe('#44cf6e')
    expect(canvasColor('#3b82f6')).toBe('#3b82f6')
    expect(canvasColor(undefined)).toBeUndefined()
  })

  test('an edge with no sides leaves by the facing ones', () => {
    const a = box('a', 0, 0)
    expect(facingSide(a, box('b', 300, 0))).toBe('right')
    expect(facingSide(a, box('b', -300, 10))).toBe('left')
    expect(facingSide(a, box('b', 0, 200))).toBe('bottom')
    expect(facingSide(a, box('b', 20, -200))).toBe('top')
  })

  test('edges keep sides, take the spec’s default ends, and drop dangling ones', () => {
    const canvas: CanvasData = {
      nodes: [box('a', 0, 0), box('b', 300, 0)],
      edges: [
        { id: 'plain', fromNode: 'a', toNode: 'b' },
        {
          id: 'styled',
          fromNode: 'b',
          fromSide: 'top',
          fromEnd: 'arrow',
          toNode: 'a',
          toSide: 'bottom',
          toEnd: 'none',
          color: '1',
          label: 'why',
        },
        { id: 'dangling', fromNode: 'a', toNode: 'gone' },
      ],
    }
    const [plain, styled, ...rest] = toFlowEdges(canvas)
    expect(rest).toEqual([])
    expect(plain).toMatchObject({
      sourceHandle: 'right',
      targetHandle: 'left',
      markerStart: undefined,
      markerEnd: { type: MarkerType.ArrowClosed },
    })
    expect(styled).toMatchObject({
      sourceHandle: 'top',
      targetHandle: 'bottom',
      markerStart: { type: MarkerType.ArrowClosed, color: '#fb464c' },
      markerEnd: undefined,
      label: 'why',
      style: { stroke: '#fb464c' },
    })
  })

  test('nodes meet edges at the middle of each side', () => {
    const node = toFlowNode(box('a', 10, 20, 200, 80))
    expect(node).toMatchObject({ position: { x: 10, y: 20 }, width: 200, height: 80 })
    expect(node.handles?.map(({ id, x, y }) => [id, x, y])).toEqual([
      ['top', 100, 0],
      ['right', 200, 40],
      ['bottom', 100, 80],
      ['left', 0, 40],
    ])
    const resized = withSideHandles({ ...node, width: 300, height: 100 })
    expect(resized.handles?.[1]).toMatchObject({ x: 300, y: 50 })
  })

  test('groups sit underneath', () => {
    expect(toFlowNode({ ...box('g', 0, 0), type: 'group' }).zIndex).toBe(-1)
    expect(toFlowNode(box('a', 0, 0)).zIndex).toBe(0)
  })

  test('a group carries the nodes wholly inside it', () => {
    const group: CanvasNode = { ...box('g', 0, 0, 500, 500), type: 'group' }
    const canvas: CanvasData = {
      nodes: [group, box('in', 10, 10), box('edge', 450, 10), box('out', 600, 0)],
      edges: [],
    }
    expect(nodesInside(canvas, group).map((n) => n.id)).toEqual(['in'])
  })

  test('new ids look like Obsidian’s', () => {
    expect(canvasId()).toMatch(/^[0-9a-f]{16}$/)
    expect(canvasId()).not.toBe(canvasId())
  })
})
