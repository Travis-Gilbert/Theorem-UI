// SOURCING: bun:test over the built-in handlers' matching, through the
// registry as the views ask it.
import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import type { WorkspaceEntry } from '@/lib/workspace/types'
import { registerBuiltinHandlers } from './builtins'
import {
  handlerFor,
  handlersFor,
  matchInput,
  useHandlerRegistry,
} from './registry'

const entry = (
  path: string,
  { size = 1, kind = 'file' }: Partial<WorkspaceEntry> = {},
): WorkspaceEntry => ({ id: `vf_${path}`, path, kind, size, mtimeMs: 1 })

const opens = (path: string, options?: Partial<WorkspaceEntry>) =>
  handlerFor(matchInput(entry(path, options)))?.id

let unregister: () => void
beforeAll(() => {
  unregister = registerBuiltinHandlers()
})
afterAll(() => unregister())

describe('the built-in handlers', () => {
  test.each([
    ['Notes/Today.md', 'markdown'],
    ['README.markdown', 'markdown'],
    ['Boards/Plan.canvas', 'canvas'],
    ['papers/field-notes.pdf', 'pdf'],
    ['data/runs.csv', 'csv'],
    ['data/runs.tsv', 'csv'],
    ['package.json', 'json'],
    ['tsconfig.jsonc', 'json'],
    ['map.geojson', 'json'],
    ['media/page.png', 'media'],
    ['media/photo.JPG', 'media'],
    ['media/voice.wav', 'media'],
    ['media/clip.mp4', 'media'],
    ['scripts/fit.py', 'code'],
    ['src/run.ts', 'code'],
    ['src/App.tsx', 'code'],
    ['src/index.js', 'code'],
    ['Dockerfile', 'code'],
    ['notes.txt', 'code'],
    ['styles.css', 'code'],
    ['data.bin', 'unknown'],
    ['archive.zip', 'unknown'],
    ['LICENSE', 'unknown'],
  ])('%s opens in %s', (path, id) => {
    expect(opens(path)).toBe(id)
  })

  test('text too large to edit opens as file info', () => {
    const big = { size: 5 * 1024 * 1024 }
    expect(opens('Notes/huge.md', big)).toBe('unknown')
    expect(opens('logs/huge.json', big)).toBe('unknown')
    expect(opens('src/huge.ts', big)).toBe('unknown')
    // The table draws only the rows in view, so it takes larger files.
    expect(opens('data/huge.csv', big)).toBe('csv')
    expect(opens('data/huge.csv', { size: 40 * 1024 * 1024 })).toBe('unknown')
  })

  test('folders open in no built-in handler', () => {
    expect(opens('Notes', { kind: 'directory' })).toBeUndefined()
    expect(opens('Notes.md', { kind: 'directory' })).toBeUndefined()
  })

  test('every match is offered, the one that opens the file first', () => {
    const ids = (path: string) =>
      handlersFor(matchInput(entry(path))).map((h) => h.id)
    expect(ids('Notes/Today.md')).toEqual(['markdown', 'code', 'unknown'])
    expect(ids('data/runs.csv')).toEqual(['csv', 'code', 'unknown'])
    expect(ids('media/page.png')).toEqual(['media', 'unknown'])
  })

  test('every handler has a Panel and a Card; Markdown and Canvas create files', () => {
    const { handlers } = useHandlerRegistry.getState()
    for (const handler of handlers) {
      expect(handler.Panel).toBeFunction()
      expect(handler.Card).toBeFunction()
    }
    expect(
      handlers.flatMap((h) => (h.create ? [h.create.extension] : [])),
    ).toEqual(['md', 'canvas'])
  })

  test('registering again replaces the handlers in place', () => {
    const before = useHandlerRegistry.getState().handlers.map((h) => h.id)
    const undo = registerBuiltinHandlers()
    expect(useHandlerRegistry.getState().handlers.map((h) => h.id)).toEqual(
      before,
    )
    undo()
    registerBuiltinHandlers()
  })
})
