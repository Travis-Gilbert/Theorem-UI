// SOURCING: bun:test over what live blocks add to the file handlers and the
// code editor: which entries each handler opens, the files they create, and
// the code editor's Run, rendered with React into happy-dom.
import { afterEach, expect, test } from 'bun:test'
import { appDeclarations } from '@/components/blocks/html-app-handler'
import type { HandlerMatchInput } from '@/lib/handlers/types'
import { parseCodeDeclarations } from './declarations'
import { blockCodeExtension, blockHandlers } from './index'
import { memoryWorkspace } from '../../../test/blocks/memory-workspace'
import {
  buttonNamed,
  cleanup,
  render,
  waitFor,
} from '../../../test/blocks/render'

afterEach(cleanup)

const input = (
  path: string,
  kind: 'file' | 'directory' = 'file',
): HandlerMatchInput => {
  const dot = path.lastIndexOf('.')
  return {
    entry: { id: 'vf_0', path, kind, size: 10, mtimeMs: 0 },
    extension: kind === 'file' && dot > 0 ? path.slice(dot + 1) : '',
    mime: null,
    properties: null,
  }
}

const opens = (path: string, kind?: 'file' | 'directory') =>
  blockHandlers
    .filter((handler) => handler.match(input(path, kind)))
    .sort((a, b) => b.priority - a.priority)
    .map((handler) => handler.id)

test('a .tsx file opens as a tool, an .html file as an app, a folder as a folder app', () => {
  expect(opens('Tools/Habit tracker.tsx')).toEqual(['tool'])
  expect(opens('Apps/page.html')).toEqual(['html-app'])
  expect(opens('Apps/page.htm')).toEqual(['html-app'])
  expect(opens('Apps/Counter', 'directory')).toEqual(['html-folder'])
  expect(opens('Notes/Today.md')).toEqual([])
  expect(opens('Tools/helper.ts')).toEqual([])
  // A folder named like a file is still a folder.
  expect(opens('Apps/site.html', 'directory')).toEqual(['html-folder'])
})

test('a tool or a page wins over the code editor, and a folder app over nothing', () => {
  const priority = (id: string) =>
    blockHandlers.find((handler) => handler.id === id)!.priority
  // The code editor's priority in Phase 3's built-ins.
  expect(priority('tool')).toBeGreaterThan(40)
  expect(priority('html-app')).toBeGreaterThan(40)
  expect(priority('html-folder')).toBeGreaterThan(0)
})

test('a new tool or app declares nothing, and declares it without errors', () => {
  const tool = blockHandlers.find((handler) => handler.id === 'tool')!.create!
  const app = blockHandlers.find(
    (handler) => handler.id === 'html-app',
  )!.create!
  expect(tool.extension).toBe('tsx')
  expect(app.extension).toBe('html')
  expect(parseCodeDeclarations(tool.initial())).toEqual({
    capabilities: { read: [], write: [], state: [], net: [], run: [] },
    errors: [],
  })
  expect(appDeclarations(app.initial())).toEqual({
    capabilities: { read: [], write: [], state: [], net: [], run: [] },
    errors: [],
  })
})

test('the code editor gets last-run values and Run for TypeScript and JavaScript only', async () => {
  const client = memoryWorkspace()
  const file = (path: string) => ({
    client,
    path,
    entry: input(path).entry,
  })
  const { Toolbar } = blockCodeExtension
  expect(blockCodeExtension.extensions(file('Tools/a.ts'))).toHaveLength(1)
  expect(blockCodeExtension.extensions(file('Tools/a.tsx'))).toHaveLength(1)
  expect(blockCodeExtension.extensions(file('Tools/a.py'))).toEqual([])

  const python = await render(Toolbar && <Toolbar {...file('Tools/a.py')} />)
  expect(python.container.innerHTML).toBe('')
  const script = await render(Toolbar && <Toolbar {...file('Tools/a.js')} />)
  await waitFor(() => buttonNamed(script.container, 'Run'))
})
