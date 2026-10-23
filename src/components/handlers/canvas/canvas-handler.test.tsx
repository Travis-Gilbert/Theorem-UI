// SOURCING: bun:test over the canvas handler's panel and card, rendered with
// React into happy-dom against the in-memory workspace and Obsidian-made
// canvases.
import { afterAll, afterEach, beforeAll, describe, expect, mock, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import { act } from 'react'
import { applyCanvasEdits, parseCanvas } from '@/lib/canvas/json-canvas'
import { registerHandler, useHandlerRegistry } from '@/lib/handlers/registry'
import type { WorkspaceEntry } from '@/lib/workspace/types'
import { mockReactFlow } from '../../../../test/react-flow'
import {
  cleanup,
  fakeWorkspace,
  render,
  settle,
  waitFor,
} from '../../../../test/workspace'

void mock.module('@/components/icons', () => ({
  Icon: new Proxy({}, { get: () => () => null }),
}))
const { CanvasCard, CanvasPanel } = await import('./canvas-handler')

const fixture = (name: string) =>
  readFileSync(new URL(`../../../../test/fixtures/handlers/${name}`, import.meta.url), 'utf8')

const GRAPH = fixture('theorem-graph.canvas')
const SAMPLE = fixture('jsoncanvas-sample.canvas')

const entry = (path: string): WorkspaceEntry => ({
  id: `vf_${path}`,
  path,
  kind: 'file',
  size: 1,
  mtimeMs: 1,
})

let unmockReactFlow: () => void
beforeAll(() => {
  unmockReactFlow = mockReactFlow()
  // File nodes render through the registry; a stand-in card shows the path.
  registerHandler({
    id: 'stand-in',
    label: 'Stand-in',
    priority: 1,
    match: () => true,
    Panel: () => null,
    Card: ({ path, zoom }) => (
      <div data-card={path} data-zoom={zoom}>
        card for {path}
      </div>
    ),
  })
})
afterAll(() => {
  useHandlerRegistry.setState({ handlers: [] })
  unmockReactFlow()
})
afterEach(cleanup)

async function openPanel(text: string, files: Record<string, string> = {}) {
  const ws = fakeWorkspace({ 'Board.canvas': text, ...files })
  const { container } = await render(
    <CanvasPanel client={ws.client} path="Board.canvas" entry={entry('Board.canvas')} />,
  )
  await waitFor(() => container.querySelector('.react-flow__node'))
  await settle()
  return { ws, container }
}

const nodesOf = (container: Element, type: string) =>
  container.querySelectorAll(`[data-canvas-node="${type}"]`)

describe('CanvasPanel', () => {
  test('draws every node type, with theorem:kind shown', async () => {
    const { container } = await openPanel(GRAPH, {
      'notes/answer.md': '# Answer\n',
    })
    expect(container.querySelectorAll('.react-flow__node')).toHaveLength(4)
    expect(nodesOf(container, 'text')).toHaveLength(2)
    expect(nodesOf(container, 'file')).toHaveLength(1)
    expect(nodesOf(container, 'link')).toHaveLength(1)
    expect(container.textContent).toContain('Search the folder')
    expect(container.textContent).toContain('https://jsoncanvas.org/spec/1.0/')

    // The file node is the registry's card for the file, with its subpath.
    await waitFor(() => container.querySelector('[data-card="notes/answer.md"]'))
    expect(nodesOf(container, 'file')[0]?.textContent).toContain('answer.md#Result')

    const kinds = [...container.querySelectorAll('.react-flow__node')].map(
      (n) => n.querySelector('.uppercase')?.textContent ?? null,
    )
    expect(kinds).toEqual(['input', 'tool', 'output', null])
  })

  test('keeps edge sides, ends, colours and labels', async () => {
    const { container } = await openPanel(GRAPH)
    await waitFor(() => container.querySelectorAll('.react-flow__edge').length === 2)
    const [e1, e2] = [...container.querySelectorAll('.react-flow__edge')]
    expect(e1?.getAttribute('data-id') ?? e1?.getAttribute('aria-label')).toBeTruthy()
    // e1 names no ends: an arrow at the target only.
    expect(e1?.querySelector('path')?.getAttribute('marker-end')).toContain('url(')
    expect(e1?.querySelector('path')?.getAttribute('marker-start')).toBeFalsy()
    // e2 reverses them and has a colour and a label.
    const path = e2?.querySelector('path')
    expect(path?.getAttribute('marker-start')).toContain('url(')
    expect(path?.getAttribute('marker-end')).toBeFalsy()
    expect(path?.getAttribute('style')).toContain('#3b82f6')
    expect(container.textContent).toContain('hits')
  })

  test('draws groups with their label', async () => {
    const { container } = await openPanel(SAMPLE)
    expect(nodesOf(container, 'group')).toHaveLength(1)
    expect(nodesOf(container, 'group')[0]?.textContent).toContain('JSON Canvas')
  })

  test('does not write a canvas it only showed', async () => {
    const { ws } = await openPanel(SAMPLE)
    await act(() => Bun.sleep(600))
    expect(ws.writes).toEqual([])
    expect(ws.text('Board.canvas')).toBe(SAMPLE)
  })

  test('adding a card leaves the rest of the file as it was', async () => {
    const { ws, container } = await openPanel(SAMPLE)
    const add = [...container.querySelectorAll('button')].find(
      (b) => b.textContent.trim() === 'Text',
    )!
    act(() => add.click())
    await waitFor(() => ws.text('Board.canvas') !== SAMPLE)
    const written = ws.text('Board.canvas')!
    const added = parseCanvas(written).nodes.filter(
      (n) => !parseCanvas(SAMPLE).nodes.some((o) => o.id === n.id),
    )
    expect(added).toHaveLength(1)
    expect(added[0]).toMatchObject({ type: 'text', text: '' })
    expect(added[0]?.id).toMatch(/^[0-9a-f]{16}$/)
    // Taking it out again gives back the original bytes.
    expect(
      applyCanvasEdits(written, [{ type: 'remove', list: 'nodes', id: added[0]!.id }]),
    ).toBe(SAMPLE)
    await waitFor(() => nodesOf(container, 'text').length === 2)
  })

  test('takes a change made on disk', async () => {
    const { ws, container } = await openPanel(GRAPH)
    const changed = applyCanvasEdits(GRAPH, [
      { type: 'set', list: 'nodes', id: 'tool', values: { text: 'Ask the web' } },
    ])
    await ws.external('Board.canvas', changed)
    await waitFor(() => container.textContent.includes('Ask the web'))
    expect(ws.writes).toEqual([])
  })

  test('says so when the file is not a canvas', async () => {
    const ws = fakeWorkspace({ 'Bad.canvas': '{"nodes": [' })
    const { container } = await render(
      <CanvasPanel client={ws.client} path="Bad.canvas" entry={entry('Bad.canvas')} />,
    )
    await waitFor(() => container.textContent.includes('not a JSON Canvas'))
  })
})

describe('CanvasCard', () => {
  test('is a picture of the nodes', async () => {
    const ws = fakeWorkspace({ 'Board.canvas': SAMPLE })
    const { container } = await render(
      <CanvasCard
        client={ws.client}
        path="Board.canvas"
        entry={entry('Board.canvas')}
        zoom={0.5}
        selected={false}
      />,
    )
    await waitFor(() => container.querySelector('.react-flow__node'))
    expect(container.querySelectorAll('.react-flow__node')).toHaveLength(
      parseCanvas(SAMPLE).nodes.length,
    )
    expect(container.textContent).toContain('JSON Canvas')
    expect(container.querySelector('.react-flow__minimap')).toBeNull()
  })
})
