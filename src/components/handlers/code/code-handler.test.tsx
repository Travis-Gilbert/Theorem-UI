// SOURCING: bun:test over the code handler's panel and card, rendered with
// React into happy-dom against the in-memory workspace; the CodeMirror view
// found from its DOM as @codemirror/view documents.
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  mock,
  test,
} from 'bun:test'
import { language } from '@codemirror/language'
import { EditorView } from '@codemirror/view'
import { act } from 'react'
import { registerCodeExtension } from '@/lib/handlers/registry'
import type { WorkspaceEntry } from '@/lib/workspace/types'
import { recordHostCalls, useDesktopEnv } from '../../../../test/desktop'
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
const { CodeCard, CodePanel } = await import('./code-handler')

const FIT = Array.from({ length: 20 }, (_, i) => `x${i} = ${i}`).join('\n')

const entry = (path: string): WorkspaceEntry => ({
  id: `vf_${path}`,
  path,
  kind: 'file',
  size: 1,
  mtimeMs: 1,
})

afterEach(cleanup)

async function openPanel(path: string, text: string) {
  const ws = fakeWorkspace({ [path]: text })
  const { container } = await render(
    <CodePanel client={ws.client} path={path} entry={entry(path)} />,
  )
  const editor = await waitFor(() =>
    container.querySelector<HTMLElement>('.cm-editor'),
  )
  const view = EditorView.findFromDOM(editor)
  if (!view) throw new Error('expected a CodeMirror view')
  return { ws, container, view }
}

const buttonNamed = (root: ParentNode, name: string) =>
  [...root.querySelectorAll('button')].find((b) => b.textContent === name)

describe('CodePanel', () => {
  test.each([
    ['scripts/fit.py', 'Python', 'python'],
    ['src/run.ts', 'TypeScript', 'typescript'],
    ['src/App.tsx', 'TSX', 'typescript'],
    ['src/index.js', 'JavaScript', 'javascript'],
  ])('%s opens in CodeMirror as %s', async (path, name, parser) => {
    const { container, view } = await openPanel(path, 'x = 1\n')
    expect(view.state.doc.toString()).toBe('x = 1\n')
    expect(container.textContent).toContain(name)
    // The language loads on demand.
    await waitFor(() => view.state.facet(language)?.name === parser)
  })

  test('a file with no language opens as plain text', async () => {
    const { container, view } = await openPanel('notes.txt', 'plain')
    expect(view.state.doc.toString()).toBe('plain')
    expect(container.textContent).toContain('Plain text')
    expect(view.state.facet(language)).toBeNull()
  })

  test('edits are saved to the file', async () => {
    const { ws, view } = await openPanel('scripts/fit.py', FIT)
    act(() => view.dispatch({ changes: { from: 0, insert: '# fit\n' } }))
    await waitFor(() => ws.text('scripts/fit.py')?.startsWith('# fit\n'), {
      timeout: 3000,
    })
    expect(ws.text('scripts/fit.py')).toBe(`# fit\n${FIT}`)
  })

  test('a change on disk reaches the editor', async () => {
    const { ws, view } = await openPanel('scripts/fit.py', FIT)
    await ws.external('scripts/fit.py', 'y = 2\n')
    await waitFor(() => view.state.doc.toString() === 'y = 2\n')
  })

  test('without the desktop host there is no native editor button', async () => {
    const { container } = await openPanel('scripts/fit.py', FIT)
    expect(buttonNamed(container, 'Open in native editor')).toBeUndefined()
  })

  describe('on the desktop', () => {
    useDesktopEnv()
    let host: ReturnType<typeof recordHostCalls>
    beforeEach(() => {
      host = recordHostCalls()
    })
    afterEach(() => host.restore())

    test('"Open in native editor" asks the host for the file', async () => {
      const { container } = await openPanel('scripts/fit.py', FIT)
      const button = buttonNamed(container, 'Open in native editor')
      if (!button) throw new Error('expected the native editor button')
      act(() => button.click())
      await waitFor(() => host.calls.length === 1)
      expect(host.calls).toEqual([
        {
          method: 'openNativeEditor',
          params: { path: '/tmp/vault/scripts/fit.py' },
        },
      ])
    })
  })
})

describe('code extensions', () => {
  let unregister: () => void
  beforeAll(() => {
    unregister = registerCodeExtension({
      id: 'runner',
      extensions: ({ path }) => [
        EditorView.editorAttributes.of({ 'data-runner': path }),
      ],
      Toolbar: ({ path }) => <button type="button">Run {path}</button>,
    })
  })
  afterAll(() => unregister())

  test("join the editor's extensions and the panel's toolbar", async () => {
    const { container } = await openPanel('scripts/fit.py', FIT)
    expect(
      container.querySelector('.cm-editor')?.getAttribute('data-runner'),
    ).toBe('scripts/fit.py')
    expect(buttonNamed(container, 'Run scripts/fit.py')).toBeDefined()
  })

  test("fill the card's last-run slot", async () => {
    const ws = fakeWorkspace({ 'scripts/fit.py': FIT })
    const { container } = await render(
      <CodeCard
        client={ws.client}
        path="scripts/fit.py"
        entry={entry('scripts/fit.py')}
        zoom={1}
        selected={false}
      />,
    )
    const slot = container.querySelector('[data-slot="last-run"]')
    expect(slot?.querySelector('button')?.textContent).toBe(
      'Run scripts/fit.py',
    )
  })
})

describe('CodeCard', () => {
  test('shows the name, the language and the first lines', async () => {
    const ws = fakeWorkspace({ 'scripts/fit.py': FIT })
    const { container } = await render(
      <CodeCard
        client={ws.client}
        path="scripts/fit.py"
        entry={entry('scripts/fit.py')}
        zoom={1}
        selected={false}
      />,
    )
    await settle()
    expect(container.textContent).toContain('fit.py')
    expect(container.textContent).toContain('Python')
    const lines = container.querySelector('pre')?.textContent.split('\n')
    expect(lines).toEqual(FIT.split('\n').slice(0, 14))
    // Nothing has run yet, so the slot stays empty.
    expect(
      container.querySelector('[data-slot="last-run"]')?.children,
    ).toHaveLength(0)
  })

  test('says so when the file is not text', async () => {
    const ws = fakeWorkspace({ 'blob.py': new Uint8Array([0, 159, 146, 150]) })
    const { container } = await render(
      <CodeCard
        client={ws.client}
        path="blob.py"
        entry={entry('blob.py')}
        zoom={1}
        selected={false}
      />,
    )
    await waitFor(() => container.textContent.includes('not text'))
  })
})
