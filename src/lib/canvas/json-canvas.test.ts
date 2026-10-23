import { describe, expect, test } from 'bun:test'
import { applyCanvasEdits, parseCanvas, removeNodes } from './json-canvas'
import type { CanvasEdit, CanvasNode } from './json-canvas'

// Canvases Obsidian wrote, used under each repository's MIT licence:
// - jsoncanvas-sample.canvas: obsidianmd/jsoncanvas, sample.canvas
// - stakeholder-map.canvas: TfTHacker/obsidian-canvas-candy, Samples/
// - fleeting-notes.canvas: groepl/Obsidian-Zettelkasten-Starter-Kit
// theorem-graph.canvas is ours: two-space indentation, a trailing newline,
// theorem: keys, an object-valued plugin key and keys out of Obsidian's order.
const fixture = (name: string) =>
  Bun.file(new URL(`../../../test/fixtures/handlers/${name}`, import.meta.url))
    .text()

const FIXTURES = [
  'jsoncanvas-sample.canvas',
  'stakeholder-map.canvas',
  'fleeting-notes.canvas',
  'theorem-graph.canvas',
]

describe('an unedited canvas', () => {
  for (const name of FIXTURES)
    test(`${name} keeps every byte`, async () => {
      const text = await fixture(name)
      expect(applyCanvasEdits(text, [])).toBe(text)
      const canvas = parseCanvas(text)
      expect(canvas.nodes.length).toBeGreaterThan(0)
      expect(canvas.edges.length).toBeGreaterThan(0)
    })

  test('an empty file is an empty canvas', () => {
    expect(parseCanvas('')).toEqual({ nodes: [], edges: [] })
  })
})

describe('an edited canvas', () => {
  test('a move changes only the moved values', async () => {
    const text = await fixture('jsoncanvas-sample.canvas')
    const out = applyCanvasEdits(text, [
      {
        type: 'set',
        list: 'nodes',
        id: '59e896bc8da20699',
        values: { x: 100.4, y: -399.6 },
      },
    ])
    expect(out).toBe(
      text.replace('"x":40,"y":-440,"width":250', '"x":100,"y":-400,"width":250'),
    )
  })

  test('keys stay in their order and unknown keys survive', async () => {
    const text = await fixture('theorem-graph.canvas')
    const before = parseCanvas(text)
    const out = applyCanvasEdits(text, [
      { type: 'set', list: 'nodes', id: 'in', values: { width: 300 } },
      { type: 'set', list: 'nodes', id: 'tool', values: { color: '2' } },
    ])
    const after = parseCanvas(out)
    expect(Object.keys(after.nodes[0]!)).toEqual(Object.keys(before.nodes[0]!))
    expect(after.nodes[0]!.width).toBe(300)
    expect(after.nodes[1]!.styleAttributes).toEqual({ shape: 'pill' })
    expect(after.nodes[1]!.color).toBe('2')
    expect(after['theorem:version']).toBe(1)
    expect(after.metadata).toEqual({ frontmatter: {} })
    expect(after.edges[0]!['theorem:port']).toBe('query')
    expect(out.endsWith('}\n')).toBe(true)
    // Everything but the two edited nodes' lines is untouched.
    const lines = text.split('\n')
    const changed = out.split('\n').filter((line, i) => line !== lines[i])
    expect(changed).toHaveLength(2)
  })

  test('a node written type-first keeps its order when resized', async () => {
    const text = await fixture('stakeholder-map.canvas')
    const out = applyCanvasEdits(text, [
      {
        type: 'set',
        list: 'nodes',
        id: '5919ea1d0289a6a0',
        values: { width: 640 },
      },
    ])
    expect(out).toBe(
      text.replace(
        '"id":"5919ea1d0289a6a0","x":-169,"y":-540,"width":621',
        '"id":"5919ea1d0289a6a0","x":-169,"y":-540,"width":640',
      ),
    )
  })

  test('removing a key leaves the rest of the line', async () => {
    const text = await fixture('fleeting-notes.canvas')
    const out = applyCanvasEdits(text, [
      {
        type: 'set',
        list: 'nodes',
        id: 'be9c1e2004affb7c',
        values: { color: undefined },
      },
    ])
    expect(out).toBe(text.replace(',"color":"#fac141"}', '}'))
  })

  test('an added node goes on its own line, on top', async () => {
    const text = await fixture('stakeholder-map.canvas')
    const node: CanvasNode = {
      id: 'new',
      type: 'text',
      text: 'Investors',
      x: 10.2,
      y: 20,
      width: 240,
      height: 60,
    }
    const out = applyCanvasEdits(text, [
      { type: 'add', list: 'nodes', item: node },
    ])
    const canvas = parseCanvas(out)
    expect(canvas.nodes.at(-1)).toEqual({ ...node, x: 10 })
    const lines = out.split('\n')
    const at = lines.indexOf(
      '\t\t{"id":"new","type":"text","text":"Investors","x":10,"y":20,"width":240,"height":60}',
    )
    expect(at).toBeGreaterThan(0)
    expect(lines[at + 1]).toBe('\t],')
    // Without the new line, the file is the original plus one comma.
    const original = text.split('\n')
    expect(lines.toSpliced(at, 1)).toEqual(
      original.with(at - 1, `${original[at - 1]},`),
    )
  })

  test('an edge added to an empty list opens the list', () => {
    const text = '{\n\t"nodes":[],\n\t"edges":[]\n}'
    const out = applyCanvasEdits(text, [
      {
        type: 'add',
        list: 'edges',
        item: { id: 'e', fromNode: 'a', toNode: 'b' },
      },
    ])
    expect(out).toBe(
      '{\n\t"nodes":[],\n\t"edges":[\n\t\t{"id":"e","fromNode":"a","toNode":"b"}\n\t]\n}',
    )
  })

  test('a one-line file stays one line', () => {
    const text = '{"nodes":[{"id":"a","type":"text","text":"","x":0,"y":0,"width":1,"height":1}],"edges":[]}'
    const out = applyCanvasEdits(text, [
      {
        type: 'add',
        list: 'nodes',
        item: { id: 'b', type: 'text', text: '', x: 0, y: 0, width: 1, height: 1 },
      },
    ])
    expect(out).not.toContain('\n')
    expect(parseCanvas(out).nodes.map((n) => n.id)).toEqual(['a', 'b'])
  })

  test('an empty file takes its first node', () => {
    const out = applyCanvasEdits('', [
      {
        type: 'add',
        list: 'nodes',
        item: { id: 'a', type: 'text', text: 'Hi', x: 0, y: 0, width: 1, height: 1 },
      },
    ])
    expect(parseCanvas(out).nodes.map((n) => n.id)).toEqual(['a'])
  })

  test('removing nodes takes their edges and keeps the layout', async () => {
    const text = await fixture('fleeting-notes.canvas')
    const canvas = parseCanvas(text)
    // The first node (one edge) and the last (several, and the list's end).
    const ids = new Set(['be9c1e2004affb7c', '4fc341ccfe5d2054'])
    const edits: Array<CanvasEdit> = removeNodes(canvas, ids)
    const out = applyCanvasEdits(text, edits)
    const after = parseCanvas(out)
    expect(after.nodes.map((n) => n.id)).toEqual(
      canvas.nodes.map((n) => n.id).filter((id) => !ids.has(id)),
    )
    expect(
      after.edges.some((e) => ids.has(e.fromNode) || ids.has(e.toNode)),
    ).toBe(false)
    expect(after.edges.length).toBeLessThan(canvas.edges.length)
    // Each remaining line is a line of the original, but for a dropped comma.
    const original = new Set(text.split('\n').map((l) => l.replace(/,$/, '')))
    for (const line of out.split('\n'))
      expect(original.has(line.replace(/,$/, ''))).toBe(true)
  })

  test('removing the only edge empties the list', () => {
    const text = '{\n\t"nodes":[],\n\t"edges":[\n\t\t{"id":"e","fromNode":"a","toNode":"b"}\n\t]\n}'
    expect(
      applyCanvasEdits(text, [{ type: 'remove', list: 'edges', id: 'e' }]),
    ).toBe('{\n\t"nodes":[],\n\t"edges":[]\n}')
  })

  test('an edit for a missing id changes nothing', async () => {
    const text = await fixture('jsoncanvas-sample.canvas')
    expect(
      applyCanvasEdits(text, [
        { type: 'set', list: 'nodes', id: 'nope', values: { x: 1 } },
        { type: 'remove', list: 'edges', id: 'nope' },
      ]),
    ).toBe(text)
  })
})
