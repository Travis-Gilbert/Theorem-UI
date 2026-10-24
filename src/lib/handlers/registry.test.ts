// SOURCING: bun:test over the handler registry.
import { afterEach, describe, expect, test } from 'bun:test'
import type { WorkspaceEntry } from '@/lib/workspace/types'
import {
  codeExtensions,
  extensionOf,
  handlerFor,
  handlersFor,
  markdownExtensions,
  matchInput,
  registerCodeExtension,
  registerHandler,
  registerMarkdownExtension,
  useHandlerRegistry,
} from './registry'
import type { FileHandler } from './types'

const entry = (path: string): WorkspaceEntry => ({
  id: 'vf_1',
  path,
  kind: 'file',
  size: 1,
  mtimeMs: 1,
})

const handler = (
  id: string,
  priority: number,
  match: FileHandler['match'],
): FileHandler => ({
  id,
  label: id,
  priority,
  match,
  Panel: () => null,
  Card: () => null,
})

afterEach(() =>
  useHandlerRegistry.setState({
    handlers: [],
    markdownExtensions: [],
    codeExtensions: [],
  }),
)

describe('matchInput', () => {
  test('lowercases the extension and finds its MIME type', () => {
    expect(matchInput(entry('Notes/Plan.MD'))).toMatchObject({
      extension: 'md',
      mime: 'text/markdown',
      properties: null,
    })
    expect(matchInput(entry('scan.pdf')).mime).toBe('application/pdf')
    expect(matchInput(entry('photo.jpeg')).mime).toBe('image/jpeg')
  })

  test('script types are scripts, not media', () => {
    expect(matchInput(entry('a.ts')).mime).toBe('text/typescript')
    expect(matchInput(entry('a.tsx')).mime).toBe('text/tsx')
    expect(matchInput(entry('a.py')).mime).toBe('text/x-python')
  })

  test('dotfiles and bare names have no extension', () => {
    expect(extensionOf('.env')).toBe('')
    expect(extensionOf('dir.d/Makefile')).toBe('')
    expect(matchInput(entry('Makefile')).mime).toBeNull()
  })

  test('carries properties', () => {
    expect(matchInput(entry('a.md'), { kind: 'x' }).properties).toEqual({
      kind: 'x',
    })
  })
})

describe('handlers', () => {
  test('the highest priority wins; ties go to the first registered', () => {
    registerHandler(handler('fallback', 0, () => true))
    registerHandler(handler('text', 40, (i) => i.extension === 'md'))
    registerHandler(handler('markdown', 80, (i) => i.extension === 'md'))
    registerHandler(handler('other-markdown', 80, (i) => i.extension === 'md'))
    const input = matchInput(entry('a.md'))
    expect(handlerFor(input)?.id).toBe('markdown')
    expect(handlersFor(input).map((h) => h.id)).toEqual([
      'markdown',
      'other-markdown',
      'text',
      'fallback',
    ])
    expect(handlerFor(matchInput(entry('a.bin')))?.id).toBe('fallback')
  })

  test('a handler can match on frontmatter properties', () => {
    registerHandler(handler('markdown', 80, (i) => i.extension === 'md'))
    registerHandler(
      handler('board', 90, (i) => i.properties?.['theorem:kind'] === 'board'),
    )
    expect(handlerFor(matchInput(entry('a.md')))?.id).toBe('markdown')
    expect(
      handlerFor(matchInput(entry('a.md'), { 'theorem:kind': 'board' }))?.id,
    ).toBe('board')
  })

  test('registering an id again replaces it in place; unregister removes it', () => {
    registerHandler(handler('a', 10, () => true))
    registerHandler(handler('b', 10, () => true))
    const replacement = handler('a', 10, () => true)
    const unregister = registerHandler(replacement)
    expect(useHandlerRegistry.getState().handlers).toEqual([
      replacement,
      expect.objectContaining({ id: 'b' }),
    ])
    unregister()
    expect(useHandlerRegistry.getState().handlers.map((h) => h.id)).toEqual([
      'b',
    ])
  })
})

test('markdown and code extensions register the same way', () => {
  const off = registerMarkdownExtension({ id: 'blocks', extend: () => {} })
  registerCodeExtension({ id: 'run', extensions: () => [] })
  expect(markdownExtensions().map((e) => e.id)).toEqual(['blocks'])
  expect(codeExtensions().map((e) => e.id)).toEqual(['run'])
  off()
  expect(markdownExtensions()).toEqual([])
})
