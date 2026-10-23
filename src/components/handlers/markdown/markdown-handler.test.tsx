// SOURCING: bun:test over the Markdown handler's panel and card, rendered
// with React into happy-dom against the in-memory workspace.
import {
  afterAll,
  afterEach,
  beforeAll,
  describe,
  expect,
  mock,
  test,
} from 'bun:test'
import { act } from 'react'
import { useRevealRequest } from '@/lib/handlers/actions'
import { registerHandler, useHandlerRegistry } from '@/lib/handlers/registry'
import type { WorkspaceEntry } from '@/lib/workspace/types'
import { useWorkspaceFileView } from '@/lib/workspace/open'
import {
  cleanup,
  fakeWorkspace,
  render,
  settle,
  waitFor,
} from '../../../../test/workspace'

// The icon set imports SVGs through a Vite plugin bun does not run.
void mock.module('@/components/icons', () => ({
  Icon: new Proxy({}, { get: () => () => null }),
}))
const { MarkdownCard, MarkdownPanel } = await import('./markdown-handler')

const PLAN = `---
title: Plan
done: false
---
# Plan

See [[Other#Details|the details]] and [[Missing]].

![[Other]]

> [!warning] Careful
> Mind the gap.
`

const OTHER = '# Other\n\nOther body text.\n\n## Details\n\nDeep.\n'

const entry = (path: string): WorkspaceEntry => ({
  id: `vf_${path}`,
  path,
  kind: 'file',
  size: 1,
  mtimeMs: 1,
})

beforeAll(() => {
  registerHandler({
    id: 'markdown',
    label: 'Markdown',
    priority: 80,
    match: (input) => input.extension === 'md',
    Panel: MarkdownPanel,
    Card: MarkdownCard,
  })
})

afterEach(() => {
  cleanup()
  useWorkspaceFileView.setState({ file: undefined })
  useRevealRequest.setState({ request: null })
})

async function openPanel(files: Record<string, string> = {}) {
  const ws = fakeWorkspace({ 'Plan.md': PLAN, 'Other.md': OTHER, ...files })
  const { container } = await render(
    <MarkdownPanel client={ws.client} path="Plan.md" entry={entry('Plan.md')} />,
  )
  await waitFor(() => container.querySelector('.ProseMirror'))
  await settle()
  return { ws, container }
}

describe('MarkdownPanel', () => {
  test('shows the body in Crepe with wikilinks, embeds and callouts', async () => {
    const { container } = await openPanel()
    const editor = container.querySelector('.ProseMirror')!
    expect(editor.querySelector('h1')?.textContent).toBe('Plan')

    const links = [...editor.querySelectorAll('.theorem-wikilink')]
    expect(links.map((l) => l.textContent)).toEqual(['the details', 'Missing'])
    await waitFor(() => links[1]?.hasAttribute('data-unresolved'))
    expect(links[0]?.hasAttribute('data-unresolved')).toBe(false)

    // The embed is the target's card, which shows the note's excerpt.
    await waitFor(() =>
      editor
        .querySelector('.theorem-wiki-embed')
        ?.textContent.includes('Other body text.'),
    )

    const callout = editor.querySelector('.theorem-callout')
    expect(callout?.getAttribute('data-callout')).toBe('warning')
    expect(
      callout?.querySelector<HTMLInputElement>('input[aria-label="Callout title"]')
        ?.value,
    ).toBe('Careful')
    expect(callout?.textContent).toContain('Mind the gap.')
  })

  test('does not write a file it only showed', async () => {
    const { ws } = await openPanel()
    await act(() => Bun.sleep(600))
    expect(ws.writes).toEqual([])
    expect(ws.text('Plan.md')).toBe(PLAN)
  })

  test('shows properties and writes a change into the frontmatter only', async () => {
    const { ws, container } = await openPanel()
    const title = container.querySelector<HTMLInputElement>(
      'input[aria-label="title value"]',
    )!
    expect(title.value).toBe('Plan')
    const done = container.querySelector<HTMLInputElement>(
      'input[aria-label="done value"]',
    )!
    expect(done.checked).toBe(false)

    act(() => done.click())
    await waitFor(() => ws.text('Plan.md')?.includes('done: true'))
    expect(ws.text('Plan.md')).toBe(PLAN.replace('done: false', 'done: true'))
  })

  test('takes a change made on disk', async () => {
    const { ws, container } = await openPanel()
    await ws.external('Plan.md', '# Rewritten\n\nBy another app.\n')
    await waitFor(() =>
      container.querySelector('.ProseMirror')?.textContent.includes('By another app.'),
    )
    expect(container.querySelector('input[aria-label="title value"]')).toBeNull()
    expect(ws.writes).toEqual([])
  })

  test('a wikilink opens its target at the heading', async () => {
    const { container } = await openPanel()
    const link = container.querySelector<HTMLElement>('.theorem-wikilink')!
    act(() => link.click())
    await waitFor(() => useWorkspaceFileView.getState().file)
    expect(useWorkspaceFileView.getState().file).toEqual({
      workspaceId: 'ws_test',
      path: 'Other.md',
    })
    expect(useRevealRequest.getState().request).toEqual({
      workspaceId: 'ws_test',
      path: 'Other.md',
      subpath: '#Details',
    })
  })

  test('a link to a missing note creates it', async () => {
    const { ws, container } = await openPanel()
    const missing = container.querySelectorAll<HTMLElement>('.theorem-wikilink')[1]!
    act(() => missing.click())
    await waitFor(() => ws.text('Missing.md') !== undefined)
    expect(ws.text('Missing.md')).toBe('')
    expect(useWorkspaceFileView.getState().file?.path).toBe('Missing.md')
  })

  test('an open note scrolls to a requested heading', async () => {
    const { container } = await openPanel({ 'Plan.md': OTHER })
    act(() =>
      useRevealRequest.setState({
        request: { workspaceId: 'ws_test', path: 'Plan.md', subpath: '#Details' },
      }),
    )
    await waitFor(() => useRevealRequest.getState().request === null)
    const selection = document.getSelection()
    expect(container.querySelector('h2')?.contains(selection?.anchorNode ?? null)).toBe(
      true,
    )
  })

  test('runs registered Markdown extensions before the editor is created', async () => {
    const seen: Array<string> = []
    const { registerMarkdownExtension } = await import('@/lib/handlers/registry')
    const off = registerMarkdownExtension({
      id: 'probe',
      extend: (crepe, file) => {
        seen.push(file.path)
        crepe.on((listener) => listener.mounted(() => seen.push('mounted')))
      },
    })
    await openPanel()
    off()
    expect(seen).toEqual(['Plan.md', 'mounted'])
  })
})

describe('section embeds', () => {
  const SECTIONS = `![[Other#details]]

![[Other#^deep]]

![[Other#Nope]]
`
  const OTHER_WITH_BLOCK = OTHER.replace('Deep.', 'Deep. ^deep')

  test("show only the heading's or block's part of the note", async () => {
    const { container } = await openPanel({
      'Plan.md': SECTIONS,
      'Other.md': OTHER_WITH_BLOCK,
    })
    const embeds = () => [...container.querySelectorAll('.theorem-wiki-embed')]
    await waitFor(() => embeds()[2]?.textContent.includes('No heading'))
    const [heading, block, missing] = embeds()

    expect(heading?.querySelector('button')?.textContent).toBe(
      'Other › details',
    )
    expect(heading?.querySelector('h2')?.textContent).toBe('Details')
    expect(heading?.textContent).not.toContain('Other body text.')

    expect(block?.querySelector('button')?.textContent).toBe('Other › ^deep')
    expect(block?.querySelector('.theorem-wiki-embed-body')?.textContent).toBe(
      'Deep.',
    )

    expect(missing?.textContent).toContain('No heading “Nope” in Other.')
  })

  test('a header opens the note at its heading', async () => {
    const { container } = await openPanel({
      'Plan.md': SECTIONS,
      'Other.md': OTHER_WITH_BLOCK,
    })
    const title = await waitFor(() =>
      container.querySelector<HTMLElement>('.theorem-wiki-embed-title'),
    )
    act(() => title.click())
    await waitFor(() => useRevealRequest.getState().request)
    expect(useWorkspaceFileView.getState().file?.path).toBe('Other.md')
    expect(useRevealRequest.getState().request?.subpath).toBe('#details')
  })
})

describe('MarkdownCard', () => {
  test('below the edit zoom, a title and an excerpt', async () => {
    const ws = fakeWorkspace({ 'Notes/Other.md': OTHER })
    const { container } = await render(
      <MarkdownCard
        client={ws.client}
        path="Notes/Other.md"
        entry={entry('Notes/Other.md')}
        zoom={0.4}
        selected={false}
      />,
    )
    await waitFor(() => container.textContent.includes('Other body text.'))
    expect(container.querySelector('span')?.textContent).toBe('Other')
    expect(container.querySelector('.ProseMirror')).toBeNull()
  })

  test('at the edit zoom, a live editor', async () => {
    const ws = fakeWorkspace({ 'Other.md': OTHER })
    const { container } = await render(
      <MarkdownCard
        client={ws.client}
        path="Other.md"
        entry={entry('Other.md')}
        zoom={1}
        selected
      />,
    )
    await waitFor(() => container.querySelector('.ProseMirror'))
    expect(container.querySelector('.nodrag.nowheel.nopan')).not.toBeNull()
    expect(container.querySelector('.theorem-note-card')).not.toBeNull()
  })
})

// The registry is shared by every test file in the run.
afterAll(() => useHandlerRegistry.setState({ handlers: [] }))
