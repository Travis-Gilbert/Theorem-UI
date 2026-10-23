// SOURCING: bun:test over the JSON handler's panel and card, rendered with
// React into happy-dom against the in-memory workspace.
import { afterEach, describe, expect, test } from 'bun:test'
import { act } from 'react'
import type { WorkspaceEntry } from '@/lib/workspace/types'
import {
  cleanup,
  fakeWorkspace,
  render,
  waitFor,
} from '../../../../test/workspace'
import { JsonCard, JsonPanel, parseJson } from './json-handler'

const MANIFEST = JSON.stringify({
  name: 'vault',
  tags: ['field', 'notes'],
  nested: { deep: { leaf: 'hidden' } },
})

const TSCONFIG = `{
  // Comments and trailing commas, as tsconfig.json has them.
  "compilerOptions": { "strict": true, },
}
`

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
    <JsonPanel client={ws.client} path={path} entry={entry(path)} />,
  )
  await waitFor(() => !container.textContent.includes('Loading'))
  return { ws, container }
}

describe('parseJson', () => {
  test('reads JSON with comments and trailing commas', () => {
    expect(parseJson(TSCONFIG)).toEqual({
      value: { compilerOptions: { strict: true } },
    })
  })

  test('names the first error and its line', () => {
    expect(parseJson('{\n  "a": \n}')).toEqual({
      error: 'ValueExpected on line 3',
    })
  })
})

describe('JsonPanel', () => {
  test('shows the top two levels of the tree', async () => {
    const { container } = await openPanel('package.json', MANIFEST)
    const tree = container.querySelector('[role="tree"]')
    expect(tree).not.toBeNull()
    const text = tree?.textContent ?? ''
    for (const shown of [
      'name',
      '"vault"',
      'tags',
      '"field"',
      'nested',
      'deep',
    ])
      expect(text).toContain(shown)
    // The third level waits for its node to open.
    expect(text).not.toContain('leaf')
  })

  test('opens a folded node', async () => {
    const { container } = await openPanel('package.json', MANIFEST)
    const deep = [...container.querySelectorAll('[role="treeitem"]')].find(
      (item) => item.textContent.startsWith('deep'),
    )
    const toggle = deep?.querySelector<HTMLElement>('[role="button"]')
    if (!toggle) throw new Error('expected the node to have a toggle')
    act(() => toggle.click())
    await waitFor(() => container.textContent.includes('"hidden"'))
  })

  test('reads config files with comments', async () => {
    const { container } = await openPanel('tsconfig.jsonc', TSCONFIG)
    expect(container.textContent).toContain('compilerOptions')
    expect(container.textContent).toContain('strict')
  })

  test('shows a value that is not an object as it is', async () => {
    const { container } = await openPanel('count.json', '42')
    expect(container.querySelector('pre')?.textContent).toBe('42')
  })

  test('says why a file is not valid JSON', async () => {
    const { container } = await openPanel('broken.json', '{\n  "a": \n}')
    expect(container.textContent).toContain(
      'This file is not valid JSON: ValueExpected on line 3.',
    )
  })

  test('follows the file when it changes on disk', async () => {
    const { ws, container } = await openPanel('package.json', MANIFEST)
    await ws.external('package.json', '{"renamed": true}')
    await waitFor(() => container.textContent.includes('renamed'))
  })
})

describe('JsonCard', () => {
  test('shows the top level, its children folded', async () => {
    const ws = fakeWorkspace({ 'package.json': MANIFEST })
    const { container } = await render(
      <JsonCard
        client={ws.client}
        path="package.json"
        entry={entry('package.json')}
        zoom={1}
        selected={false}
      />,
    )
    await waitFor(() => container.querySelector('[role="tree"]'))
    const text = container.textContent
    expect(text).toContain('name')
    expect(text).toContain('"vault"')
    expect(text).toContain('nested')
    expect(text).not.toContain('deep')
  })

  test('says so when the file is not valid JSON', async () => {
    const ws = fakeWorkspace({ 'broken.json': '{' })
    const { container } = await render(
      <JsonCard
        client={ws.client}
        path="broken.json"
        entry={entry('broken.json')}
        zoom={1}
        selected={false}
      />,
    )
    await waitFor(() => container.textContent.includes('Not valid JSON.'))
  })
})
