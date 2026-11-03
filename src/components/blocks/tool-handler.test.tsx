// SOURCING: bun:test over the `.tsx` tool's views, rendered with React into
// happy-dom (test/blocks/render.tsx) against a stand-in for the local
// server's block routes (test/blocks/local-server.ts).
import { afterAll, afterEach, beforeAll, expect, test } from 'bun:test'
import { act } from 'react'
import { BLOCK_SANDBOX } from '@/lib/blocks/executor'
import { saveSnapshot, snapshotKey } from '@/lib/blocks/snapshots'
import type { FileViewProps } from '@/lib/handlers/types'
import type { WorkspaceClient } from '@/lib/workspace/types'
import {
  BLOCK_ORIGIN,
  stubLocalServer,
} from '../../../test/blocks/local-server'
import type { LocalServer } from '../../../test/blocks/local-server'
import { memoryWorkspace } from '../../../test/blocks/memory-workspace'
import {
  buttonNamed,
  cleanup,
  click,
  render,
  waitFor,
} from '../../../test/blocks/render'
import { RunToolbar, ToolCard, ToolPanel } from './tool-handler'

let server: LocalServer
beforeAll(() => {
  server = stubLocalServer()
})
afterAll(() => server.restore())
afterEach(cleanup)

const GREETING = `export default function Greeting() {
  return <p>Hello from the tool</p>
}
`

/**
 * A file in a folder of its own: sessions are shared by folder and path, so
 * each test gets a path no other test opened.
 */
async function toolFile(
  path: string,
  { trusted = true }: { trusted?: boolean } = {},
): Promise<{ file: FileViewProps; key: string }> {
  const client: WorkspaceClient = memoryWorkspace(
    { [path]: GREETING },
    { trusted },
  )
  const key = await server.compiled(GREETING)
  const entry = { id: 'vf_0', path, kind: 'file' as const, size: 0, mtimeMs: 0 }
  return { file: { client, path, entry }, key }
}

const frameIn = (root: ParentNode) =>
  root.querySelector<HTMLIFrameElement>('[data-slot="block-frame"] iframe')

test('an untrusted tool shows its source and the way to trust it, then runs once trusted', async () => {
  const { key, file } = await toolFile('Untrusted/Greeting.tsx', {
    trusted: false,
  })
  const { container } = await render(<ToolPanel {...file} />)

  await waitFor(() =>
    container.querySelector('.cm-content')?.textContent.includes('Hello'),
  )
  expect(container.textContent).toContain('Test is not trusted')
  expect(frameIn(container)).toBeNull()
  expect(buttonNamed(container, 'Run')).toBeUndefined()

  await click(buttonNamed(container, 'Trust this folder')!)
  const frame = await waitFor(() => frameIn(container))
  expect(file.client.workspace.trusted).toBe(true)
  expect(frame.getAttribute('sandbox')).toBe(BLOCK_SANDBOX)
  expect(frame.src).toBe(`${BLOCK_ORIGIN}/cell/ws_test/${key}`)
  expect(container.querySelector('[data-slot="trust-gate"]')).toBeNull()
  expect(buttonNamed(container, /Export/)).toBeDefined()
})

test('a card far out shows the last snapshot, and runs the tool up close', async () => {
  const { key, file } = await toolFile('Canvas/Greeting.tsx')
  const card = (zoom: number) => (
    <ToolCard {...file} zoom={zoom} selected={false} />
  )
  const { container, rerender } = await render(card(0.2))

  // Nothing to show yet: its name and status.
  expect(container.textContent).toContain('Greeting.tsx')
  expect(container.querySelector('iframe')).toBeNull()

  await rerender(card(0.5))
  const live = await waitFor(() => frameIn(container))
  expect(live.src).toBe(`${BLOCK_ORIGIN}/cell/ws_test/${key}`)

  await act(async () =>
    saveSnapshot(
      snapshotKey(file.client.workspace.id, file.path),
      '<p>Hello as it was</p>',
    ),
  )
  await rerender(card(0.2))
  const snapshot = container.querySelector('iframe')!
  expect(frameIn(container)).toBeNull()
  expect(snapshot.getAttribute('sandbox')).toBe('')
  expect(snapshot.getAttribute('srcdoc')).toContain('Hello as it was')
})

test("the code editor's Run runs a tool file only once it is pressed", async () => {
  const { key, file } = await toolFile('Editor/Greeting.tsx')
  const { container } = await render(<RunToolbar {...file} />)

  expect(frameIn(container)).toBeNull()
  await click(buttonNamed(container, 'Run')!)
  const frame = await waitFor(() => frameIn(container))
  expect(frame.src).toBe(`${BLOCK_ORIGIN}/cell/ws_test/${key}`)
  expect(
    container
      .querySelector('[data-slot="block-frame"]')!
      .hasAttribute('hidden'),
  ).toBe(true)
  expect(buttonNamed(container, 'Run again')).toBeDefined()
})

test('Run asks for trust in an untrusted folder, and is absent for other files', async () => {
  const untrusted = await toolFile('Locked/Greeting.tsx', { trusted: false })
  const { container } = await render(<RunToolbar {...untrusted.file} />)
  expect(buttonNamed(container, 'Trust this folder to run')).toBeDefined()

  const note = await toolFile('Notes/Today.md')
  const other = await render(<RunToolbar {...note.file} />)
  expect(other.container.innerHTML).toBe('')
})
