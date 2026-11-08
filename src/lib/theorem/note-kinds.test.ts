// SOURCING: bun:test over the pure note shape.
import { describe, expect, test } from 'bun:test'
import { embedFence, parseEmbed } from './embeds'
import {
  fileShape,
  imageBlock,
  noteHolding,
  noteLabel,
  noteShape,
  starterFor,
} from './note-kinds'

const file = {
  kind: 'file',
  id: 'upload-1',
  title: 'report.pdf',
  mime: 'application/pdf',
  size: 2048,
  sha256: 'abc',
}

describe('noteShape', () => {
  test('a note opening with a heading is titled, and the title leaves the body', () => {
    const shape = noteShape('# Plan\n\nFirst line.\n\nSecond line.\n')
    expect(shape.title).toBe('Plan')
    expect(shape.markdown).toBe('First line.\n\nSecond line.\n')
    expect(shape.body).toEqual({ type: 'text' })
  })

  test('a text card has no title', () => {
    const shape = noteShape('Hello World!\n')
    expect(shape.title).toBeUndefined()
    expect(shape.markdown).toBe('Hello World!\n')
    expect(shape.body).toEqual({ type: 'text' })
  })

  test('one embed under a title is that typed thing', () => {
    const shape = noteShape(noteHolding('report.pdf', embedFence(file)))
    expect(shape.title).toBe('report.pdf')
    expect(shape.body).toEqual({ type: 'embed', embed: file })
  })

  test('one image is an image node', () => {
    const shape = noteShape(noteHolding('Logo', imageBlock('/a.png', 'Logo')))
    expect(shape.body).toEqual({ type: 'image', url: '/a.png', alt: 'Logo' })
  })

  test('one Mermaid fence is a diagram node', () => {
    expect(noteShape(starterFor('diagram')).body.type).toBe('diagram')
  })

  test('an embed beside other text stays a text note', () => {
    const shape = noteShape(`# Song\n\nSource\n\n${embedFence(file)}`)
    expect(shape.body).toEqual({ type: 'text' })
    expect(shape.markdown).toContain('theorem-embed')
  })

  test('other code and an empty note are text', () => {
    expect(noteShape('```ts\nconst a = 1\n```\n').body.type).toBe('text')
    expect(noteShape('').body.type).toBe('text')
  })

  test('math, tables and checklists stay text notes', () => {
    for (const kind of ['math', 'table', 'checklist', 'json', 'data'] as const)
      expect(noteShape(starterFor(kind)).body.type).toBe('text')
  })
})

describe('noteLabel', () => {
  test('a heading or the first words', () => {
    expect(noteLabel('# Plan\n\nBody')).toBe('Plan')
    expect(noteLabel('Hello World!\n')).toBe('Hello World!')
  })

  test('a note holding an embed goes by the name of what it holds', () => {
    const link = { kind: 'link', id: 'https://a.example', title: 'Article' }
    expect(noteLabel(embedFence(link))).toBe('Article')
    expect(noteLabel(embedFence({ kind: 'link', id: 'https://a.example' }))).toBe(
      'https://a.example',
    )
  })

  test('code fences are skipped, so text after one names the note', () => {
    expect(noteLabel('```mermaid\ngraph TD\n```\n\nAfter')).toBe('After')
    expect(noteLabel('```js\nconst a = 1\n```\n')).toBeUndefined()
  })

  test('an image goes by its description', () => {
    expect(noteLabel('![App icon](/x.png)\n')).toBe('App icon')
  })

  test('an empty note has no label', () => {
    expect(noteLabel('  \n')).toBeUndefined()
  })
})

describe('fileShape', () => {
  test('picks a viewer from the type', () => {
    expect(fileShape('image/png')).toBe('image')
    expect(fileShape('audio/mpeg')).toBe('audio')
    expect(fileShape('video/mp4')).toBe('video')
    expect(fileShape('application/pdf')).toBe('pdf')
    expect(fileShape('application/zip')).toBe('file')
    expect(fileShape(undefined)).toBe('file')
  })
})

describe('embeds', () => {
  test('a file keeps what picks its viewer through a round trip', () => {
    const body = embedFence(file).split('\n')[1] ?? ''
    expect(parseEmbed(body)).toEqual(file)
  })

  test('an artifact keeps the conversation it opens in', () => {
    const ref = { kind: 'artifact', id: 'a', threadId: 't' }
    expect(parseEmbed(JSON.stringify(ref))).toEqual(ref)
  })

  test('a field of the wrong type is dropped', () => {
    expect(parseEmbed('{"kind":"file","id":"a","size":"big"}')).toEqual({
      kind: 'file',
      id: 'a',
    })
  })
})
