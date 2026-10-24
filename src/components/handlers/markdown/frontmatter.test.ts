// SOURCING: bun:test over the frontmatter helpers (mdast-util-frontmatter and
// yaml's Document API).
import { describe, expect, test } from 'bun:test'
import { readProperties, splitFrontmatter, writeProperty } from './frontmatter'

const note = `---
# Kept as written
title: Plan
tags: [a, b]
---
# Body

Text.
`

describe('splitFrontmatter', () => {
  test('splits at the closing fence, keeping every byte', () => {
    const split = splitFrontmatter(note)
    expect(split.head + split.body).toBe(note)
    expect(split.body).toBe('# Body\n\nText.\n')
    expect(split.yaml).toBe('# Kept as written\ntitle: Plan\ntags: [a, b]')
  })

  test('a note without frontmatter is all body', () => {
    expect(splitFrontmatter('# Hi\n')).toEqual({
      head: '',
      yaml: '',
      body: '# Hi\n',
    })
  })

  test('a rule further down is not frontmatter', () => {
    const text = 'Intro\n\n---\n\nMore\n'
    expect(splitFrontmatter(text).head).toBe('')
  })

  test('keeps CRLF line ends', () => {
    const text = '---\r\ntitle: A\r\n---\r\nBody\r\n'
    const split = splitFrontmatter(text)
    expect(split.head).toBe('---\r\ntitle: A\r\n---\r\n')
    expect(split.body).toBe('Body\r\n')
  })
})

describe('readProperties', () => {
  test('reads a map', () => {
    expect(readProperties(splitFrontmatter(note).yaml)).toEqual({
      title: 'Plan',
      tags: ['a', 'b'],
    })
  })

  test('is null for YAML that is not a map', () => {
    expect(readProperties('- a\n- b')).toBeNull()
    expect(readProperties('a: [unclosed')).toBeNull()
  })
})

describe('writeProperty', () => {
  test('changes one property and keeps the rest as written', () => {
    const split = splitFrontmatter(note)
    expect(writeProperty(split, 'title', 'Launch')).toBe(
      '---\n# Kept as written\ntitle: Launch\ntags: [a, b]\n---\n',
    )
  })

  test('adds frontmatter to a note without it', () => {
    expect(writeProperty({ head: '', yaml: '' }, 'done', false)).toBe(
      '---\ndone: false\n---\n',
    )
  })

  test('removing the last property removes the block', () => {
    const split = splitFrontmatter('---\nonly: 1\n---\nBody\n')
    expect(writeProperty(split, 'only', undefined)).toBe('')
  })

  test('an empty property is written as Obsidian writes it', () => {
    expect(writeProperty({ head: '', yaml: '' }, 'status', null)).toBe(
      '---\nstatus:\n---\n',
    )
  })
})
