// SOURCING: bun:test over the section extraction an embedded `#Heading` or
// `#^block` shows.
import { describe, expect, test } from 'bun:test'
import { blockSection, headingSection, noteSection } from './note-sections'

const NOTE = `---
title: Plan
---
# Plan

Intro.

## Goals

First goal.

### Detail

Deep detail.

## Risks

A risk.
`

describe('headingSection', () => {
  test('is the heading and what follows it, up to the next as high', () => {
    expect(headingSection(NOTE, 'Goals')).toBe(
      '## Goals\n\nFirst goal.\n\n### Detail\n\nDeep detail.',
    )
    expect(headingSection(NOTE, 'Risks')).toBe('## Risks\n\nA risk.')
  })

  test('matches case and spacing aside', () => {
    expect(headingSection(NOTE, '  goals ')).toStartWith('## Goals')
  })

  test('reads `A#B` as the heading B within A', () => {
    expect(headingSection(NOTE, 'Goals#Detail')).toBe(
      '### Detail\n\nDeep detail.',
    )
    expect(headingSection(NOTE, 'Risks#Detail')).toBeNull()
  })

  test('is null for a heading the note lacks', () => {
    expect(headingSection(NOTE, 'Budget')).toBeNull()
    expect(headingSection(NOTE, '')).toBeNull()
  })
})

describe('blockSection', () => {
  test('is the paragraph an id ends, without the id', () => {
    const text = 'Before.\n\nThe key point. ^key-1\n\nAfter.\n'
    expect(blockSection(text, 'key-1')).toBe('The key point.')
  })

  test('is the list item an id ends', () => {
    const text = '- one\n- two ^b2\n- three\n'
    expect(blockSection(text, 'b2')).toBe('- two')
  })

  test('is the block before an id on a line of its own', () => {
    const text = '> Quoted.\n\n^quote\n'
    expect(blockSection(text, 'quote')).toBe('> Quoted.')
  })

  test('is null for an id the note lacks', () => {
    expect(blockSection('Text. ^other\n', 'key')).toBeNull()
    expect(blockSection('Text.\n', 'bad id')).toBeNull()
  })
})

test('noteSection picks the block, then the heading', () => {
  const text = '# A\n\nLine. ^x\n'
  expect(noteSection(text, { block: 'x' })).toBe('Line.')
  expect(noteSection(text, { heading: 'A' })).toBe('# A\n\nLine. ^x')
  expect(noteSection(text, {})).toBeNull()
})
