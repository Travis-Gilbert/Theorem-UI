// SOURCING: bun:test over the standalone HTML export (export.ts), bundled
// with esbuild-wasm into a temporary folder.
import { afterEach, expect, test } from 'bun:test'
import { createHash } from 'node:crypto'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import * as esbuild from 'esbuild-wasm'
import {
  loadFixtures,
  memoryWorkspace,
} from '../../../test/blocks/memory-workspace'
import { memoryState, until } from '../../../test/blocks/session'
import { exportTool } from './export'

const FIXTURES = path.join(import.meta.dir, '../../../test/fixtures/blocks')

const cleanup: Array<() => Promise<void>> = []
afterEach(async () => {
  for (const step of cleanup.splice(0)) await step()
  document.body.innerHTML = ''
  localStorage.clear()
})

function policyOf(html: string): Record<string, string> {
  const content = /http-equiv="Content-Security-Policy" content="([^"]*)"/.exec(
    html,
  )?.[1]
  if (!content) throw new Error('The export has no policy')
  return Object.fromEntries(
    content.split('; ').map((directive) => {
      const [name, ...value] = directive.split(' ')
      return [name!, value.join(' ')]
    }),
  )
}

test('a tool exports as one page that runs with only what it declared', async () => {
  const client = memoryWorkspace(await loadFixtures(FIXTURES))
  const state = memoryState()
  state.set('habits', 'run', true)
  const exported = await exportTool(client, 'Tools/Habit tracker.tsx', {
    state,
    esbuild: async () => esbuild,
  })
  expect(exported.path).toBe('Exports/Habit tracker.html')
  const html = new TextDecoder().decode(client.files.get(exported.path))
  expect(exported.bytes).toBe(client.files.get(exported.path)!.length)

  // One inline module, allowed by its hash; nothing reaches the network.
  const script = /<script type="module">([\s\S]*)<\/script>/.exec(html)?.[1]
  if (!script) throw new Error('The export has no script')
  expect(html.match(/<\/script/gi)).toHaveLength(1)
  expect(script).not.toContain('<!--')
  const policy = policyOf(html)
  expect(policy['default-src']).toBe("'none'")
  expect(policy['connect-src']).toBe("'none'")
  expect(policy['script-src']).toBe(
    `'sha256-${createHash('sha256').update(script).digest('base64')}'`,
  )
  // It carries the declared CSV, not the folder's other files.
  expect(html).toContain('Data/habits.csv')
  expect(html).not.toContain('Today.md')

  // It runs: the vendored React renders the tool from the embedded rows,
  // and the state it declared came along.
  const folder = await mkdtemp(path.join(tmpdir(), 'theorem-export-'))
  cleanup.push(() => rm(folder, { recursive: true }))
  const file = path.join(folder, 'tool.mjs')
  await writeFile(file, script)
  document.body.innerHTML = '<div id="root"></div>'
  await import(file)
  const root = document.getElementById('root')!
  await until(() => root.textContent.includes('kept'), 'the tool to render')
  expect(root.textContent).toContain('run: kept 2 days')
  expect(root.textContent).toContain('read: kept 2 days')
  const boxes = [...root.querySelectorAll('input')]
  expect(boxes.map((box) => box.checked)).toEqual([true, false])

  // Checking a habit keeps it in this browser, under the tool's name.
  boxes[1]!.click()
  await until(
    () => localStorage.getItem('theorem-export:Habit tracker:habits') !== null,
    'the state to be kept',
  )
  expect(
    JSON.parse(localStorage.getItem('theorem-export:Habit tracker:habits')!),
  ).toEqual({ run: true, read: true })
})

test('a tool with declaration problems does not export', async () => {
  const client = memoryWorkspace({
    'Tools/Bad.tsx': '// uses: files.read()\nexport default () => null\n',
  })
  await expect(
    exportTool(client, 'Tools/Bad.tsx', {
      state: memoryState(),
      esbuild: async () => esbuild,
    }),
  ).rejects.toThrow('declaration problems')
  expect(client.files.has('Exports/Bad.html')).toBe(false)
})
