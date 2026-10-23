// SOURCING: jsonc-parser (a JSON Canvas file is edited as text ranges found
// in its syntax tree, so the bytes an edit does not touch, unknown keys and
// key order all survive) and Obsidian's own JSON Canvas 1.0 declarations
// (obsidian/canvas, types only). What stays here is placing an added or
// removed node on its own line the way Obsidian writes the file, which
// jsonc-parser leaves to a formatter that would reflow the neighbours.
import { applyEdits, findNodeAtLocation, modify, parseTree } from 'jsonc-parser'
import type { Edit, Node as JsonNode } from 'jsonc-parser'
import type {
  AllCanvasNodeData,
  CanvasData,
  CanvasEdgeData,
} from 'obsidian/canvas'

export type CanvasNode = AllCanvasNodeData
export type CanvasEdge = CanvasEdgeData
export type { CanvasData }

/** JSON Canvas 1.0 stores positions and sizes as integers. */
const INTEGER_KEYS = new Set(['x', 'y', 'width', 'height'])

/** A canvas from a file's text. An empty file is an empty canvas. */
export function parseCanvas(text: string): CanvasData {
  if (!text.trim()) return { nodes: [], edges: [] }
  const data: unknown = JSON.parse(text)
  if (!data || typeof data !== 'object' || Array.isArray(data))
    throw new Error('A JSON Canvas file holds an object.')
  const canvas = data as Partial<CanvasData>
  return {
    ...canvas,
    nodes: Array.isArray(canvas.nodes) ? canvas.nodes : [],
    edges: Array.isArray(canvas.edges) ? canvas.edges : [],
  }
}

type List = 'nodes' | 'edges'

export type CanvasEdit =
  /** Set keys of one node or edge; `undefined` removes a key. */
  | { type: 'set'; list: List; id: string; values: Record<string, unknown> }
  /** Append a node (on top of the others) or an edge. */
  | { type: 'add'; list: List; item: CanvasNode | CanvasEdge }
  | { type: 'remove'; list: List; id: string }

/** Removes nodes and the edges that touch them. */
export function removeNodes(
  canvas: CanvasData,
  ids: ReadonlySet<string>,
): Array<CanvasEdit> {
  return [
    ...canvas.edges
      .filter((e) => ids.has(e.fromNode) || ids.has(e.toNode))
      .map((e): CanvasEdit => ({ type: 'remove', list: 'edges', id: e.id })),
    ...[...ids].map((id): CanvasEdit => ({ type: 'remove', list: 'nodes', id })),
  ]
}

/**
 * The file's text with `edits` applied in order. Nothing outside the edited
 * values changes: an unedited canvas keeps its bytes.
 */
export function applyCanvasEdits(
  text: string,
  edits: ReadonlyArray<CanvasEdit>,
): string {
  let out = text.trim() ? text : '{}'
  for (const edit of edits) {
    if (edit.type === 'set')
      // One key at a time: each modify needs the text the last one produced.
      for (const [key, value] of Object.entries(edit.values)) {
        const at = itemPath(out, edit.list, edit.id)
        if (!at) break
        out = applyEdits(
          out,
          modify(
            out,
            [...at, key],
            INTEGER_KEYS.has(key) && typeof value === 'number'
              ? Math.round(value)
              : value,
            {},
          ),
        )
      }
    else out = applyEdits(out, editsFor(out, edit))
  }
  return out
}

function rootOf(text: string): JsonNode {
  const root = parseTree(text)
  if (root?.type !== 'object')
    throw new Error('A JSON Canvas file holds an object.')
  return root
}

function itemPath(text: string, list: List, id: string) {
  const items = findNodeAtLocation(rootOf(text), [list])
  const index =
    items?.children?.findIndex(
      (item) => findNodeAtLocation(item, ['id'])?.value === id,
    ) ?? -1
  return index < 0 ? undefined : [list, index]
}

function editsFor(
  text: string,
  edit: Exclude<CanvasEdit, { type: 'set' }>,
): Array<Edit> {
  const root = rootOf(text)
  const items = findNodeAtLocation(root, [edit.list])
  if (edit.type === 'add') {
    const item = roundedItem(edit.item)
    if (items?.type !== 'array') return modify(text, [edit.list], [item], {})
    return addTo(text, items, JSON.stringify(item))
  }
  const children = items?.children ?? []
  const index = children.findIndex(
    (child) => findNodeAtLocation(child, ['id'])?.value === edit.id,
  )
  const item = children[index]
  if (!items || !item) return []
  if (children.length === 1)
    return [{ offset: items.offset, length: items.length, content: '[]' }]
  // Take the item with the separator after it, or before it when it is last.
  const next = children[index + 1]
  if (next)
    return [{ offset: item.offset, length: next.offset - item.offset, content: '' }]
  const prev = children[index - 1]!
  const from = prev.offset + prev.length
  return [{ offset: from, length: item.offset + item.length - from, content: '' }]
}

function roundedItem(item: CanvasNode | CanvasEdge) {
  return Object.fromEntries(
    Object.entries(item).map(([key, value]) => [
      key,
      INTEGER_KEYS.has(key) && typeof value === 'number'
        ? Math.round(value)
        : value,
    ]),
  )
}

/** Obsidian puts each item on its own line; a one-line file stays one line. */
function addTo(text: string, items: JsonNode, json: string): Array<Edit> {
  const eol = text.includes('\r\n') ? '\r\n' : '\n'
  const last = items.children?.at(-1)
  if (last) {
    const indent = lineIndent(text, last.offset)
    return [
      {
        offset: last.offset + last.length,
        length: 0,
        content: indent === undefined ? `,${json}` : `,${eol}${indent}${json}`,
      },
    ]
  }
  const keyIndent = items.parent && lineIndent(text, items.parent.offset)
  return [
    {
      offset: items.offset,
      length: items.length,
      content:
        keyIndent === undefined
          ? `[${json}]`
          : `[${eol}${keyIndent}${indentUnit(text)}${json}${eol}${keyIndent}]`,
    },
  ]
}

/** The whitespace before `offset` when it starts its line, else undefined. */
function lineIndent(text: string, offset: number): string | undefined {
  const start = text.lastIndexOf('\n', offset - 1) + 1
  const before = text.slice(start, offset)
  return /^[ \t]*$/.test(before) ? before : undefined
}

/** The file's indentation step: Obsidian uses a tab. */
function indentUnit(text: string): string {
  return /\n([ \t]+)\S/.exec(text)?.[1] ?? '\t'
}
