// SOURCING: bun:test over the last-run margin in a real CodeMirror view
// (through SourceEditor, rendered into happy-dom); fetch is spied on as the
// local server's last-run route.
import { afterEach, beforeEach, expect, spyOn, test } from 'bun:test'
import type { Mock } from 'bun:test'
import { EditorView } from '@codemirror/view'
import { act } from 'react'
import { announceLastRun, sha256Hex } from '@/lib/blocks/last-run'
import type { LastRun } from '@/lib/blocks/last-run'
import type { WorkspaceId } from '@/lib/workspace/types'
import { cleanup, render, waitFor } from '../../../test/blocks/render'
import { SourceEditor } from './source-editor'

const WS = 'ws_margin' as WorkspaceId
const SOURCE = 'const a = 1\nconst b = a + 1\nb * 2'

const run = (sourceHash: string, patch: Partial<LastRun> = {}): LastRun => ({
  sourceHash,
  ranAt: '2026-10-23T10:00:00.000Z',
  durationMs: 3,
  status: 'ok',
  value: '4',
  lines: [
    { line: 1, text: 'a = 1' },
    { line: 2, text: 'b = 2' },
  ],
  ...patch,
})

let fetchSpy: Mock<typeof fetch>
let stored: Map<string, LastRun>

beforeEach(() => {
  stored = new Map()
  fetchSpy = spyOn(globalThis, 'fetch').mockImplementation((async (
    input: RequestInfo | URL,
  ) => {
    const url = new URL(String(input), 'http://localhost')
    const found = stored.get(url.searchParams.get('hash') ?? '')
    return found
      ? Response.json(found)
      : new Response('not found', { status: 404 })
  }) as typeof fetch)
})

afterEach(async () => {
  fetchSpy.mockRestore()
  await cleanup()
})

const values = (root: ParentNode) =>
  [...root.querySelectorAll('.cm-line')].map(
    (line) => line.querySelector('.cm-theorem-last-run')?.textContent ?? null,
  )

test('the last run of this exact source shows at the end of its lines', async () => {
  stored.set(await sha256Hex(SOURCE), run(await sha256Hex(SOURCE)))
  const { container } = await render(
    <SourceEditor value={SOURCE} lang="ts" workspaceId={WS} label="Source" />,
  )
  await waitFor(() => container.querySelector('.cm-theorem-last-run'))
  expect(values(container)).toEqual(['a = 1', 'b = 2', '4'])
  expect(fetchSpy.mock.calls[0]?.[0]).toBe(
    `/desktop/workspace/${WS}/last-run?hash=${await sha256Hex(SOURCE)}`,
  )
})

test('an edit clears the values, and a run of the new source brings them back', async () => {
  stored.set(await sha256Hex(SOURCE), run(await sha256Hex(SOURCE)))
  const { container } = await render(
    <SourceEditor value={SOURCE} lang="ts" workspaceId={WS} label="Source" />,
  )
  await waitFor(() => container.querySelector('.cm-theorem-last-run'))
  const view = EditorView.findFromDOM(
    container.querySelector<HTMLElement>('.cm-editor')!,
  )!
  const edited = SOURCE.replace('1\n', '2\n')
  await act(async () => {
    view.dispatch({ changes: { from: 10, to: 11, insert: '2' } })
  })
  expect(view.state.doc.toString()).toBe(edited)
  expect(container.querySelector('.cm-theorem-last-run')).toBeNull()

  // Nothing is stored for the new source until it runs; then the run is announced.
  await waitFor(() => fetchSpy.mock.calls.length === 2)
  await act(async () => {
    announceLastRun(
      run(await sha256Hex(edited), {
        status: 'error',
        error: { name: 'TypeError', message: 'b is not a function' },
        lines: [{ line: 1, text: 'a = 2' }],
      }),
    )
  })
  expect(values(container)).toEqual([
    'a = 2',
    null,
    'TypeError: b is not a function',
  ])
  expect(
    container.querySelector('.cm-theorem-last-run-error')?.textContent,
  ).toBe('TypeError: b is not a function')
})

test('without a workspace there is no margin', async () => {
  const { container } = await render(
    <SourceEditor value="prompt: hi" lang="agent" label="Agent" />,
  )
  await new Promise((resolve) => setTimeout(resolve, 300))
  expect(fetchSpy).not.toHaveBeenCalled()
  expect(container.querySelector('.cm-editor')).not.toBeNull()
})
