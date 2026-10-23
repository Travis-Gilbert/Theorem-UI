import { describe, expect, test } from 'bun:test'
import { parseNote } from './markdown'

const NOTE = `---
title: Plan
tags: [project, "#urgent"]
status: draft
---
# Plan #weekly

See [[Ideas]], [[Ideas#Later|later ideas]], [[Ideas#^b1]] and ![[diagram.png]].
Also [the spec](../specs/My%20Spec.md#Scope) and ![chart](img/chart.png).
External [site](https://example.com) and [[]] stay out.

- [ ] write the draft
- [x] gather notes #todo/done

Paragraph with a block id ^para-1

Code spans stay out: \`#not-a-tag\` and \`[[Code]]\`

[ref]: <Other Note.md>
`

describe('parseNote', () => {
  const note = parseNote(NOTE)

  test('reads frontmatter properties and tags', () => {
    expect(note.properties).toEqual({
      title: 'Plan',
      tags: ['project', '#urgent'],
      status: 'draft',
    })
    expect(note.tags.filter((t) => t.source === 'frontmatter')).toEqual([
      { tag: 'project', source: 'frontmatter', line: 1 },
      { tag: 'urgent', source: 'frontmatter', line: 1 },
    ])
  })

  test('finds wikilinks, embeds and Markdown links with their parts', () => {
    expect(
      note.links.map(({ kind, syntax, target, heading, block, line }) => ({
        kind,
        syntax,
        target,
        heading,
        block,
        line,
      })),
    ).toEqual([
      {
        kind: 'wikilink',
        syntax: 'wiki',
        target: 'Ideas',
        heading: undefined,
        block: undefined,
        line: 8,
      },
      {
        kind: 'wikilink',
        syntax: 'wiki',
        target: 'Ideas',
        heading: 'Later',
        block: undefined,
        line: 8,
      },
      {
        kind: 'wikilink',
        syntax: 'wiki',
        target: 'Ideas',
        heading: undefined,
        block: 'b1',
        line: 8,
      },
      {
        kind: 'embed',
        syntax: 'wiki',
        target: 'diagram.png',
        heading: undefined,
        block: undefined,
        line: 8,
      },
      {
        kind: 'markdown',
        syntax: 'markdown',
        target: '../specs/My Spec.md',
        heading: 'Scope',
        block: undefined,
        line: 9,
      },
      {
        kind: 'embed',
        syntax: 'markdown',
        target: 'img/chart.png',
        heading: undefined,
        block: undefined,
        line: 9,
      },
      {
        kind: 'markdown',
        syntax: 'markdown',
        target: 'Other Note.md',
        heading: undefined,
        block: undefined,
        line: 19,
      },
    ])
  })

  test('collects headings, inline tags, tasks and block ids', () => {
    expect(note.headings).toEqual([
      { depth: 1, text: 'Plan #weekly', line: 6 },
    ])
    expect(note.tags.filter((t) => t.source === 'inline')).toEqual([
      { tag: 'weekly', source: 'inline', line: 6 },
      { tag: 'todo/done', source: 'inline', line: 13 },
    ])
    expect(note.tasks).toEqual([
      { text: 'write the draft', checked: false, line: 12 },
      { text: 'gather notes #todo/done', checked: true, line: 13 },
    ])
    expect(note.blocks).toEqual([{ id: 'para-1', line: 15 }])
  })

  test('keeps the body after the frontmatter for search', () => {
    expect(note.body.startsWith('\n# Plan')).toBe(true)
  })

  test('accepts Unicode tags and ignores numbers and mid-word hashes', () => {
    const tags = parseNote('#über and #2024 and a#b and (#ok)').tags
    expect(tags.map((t) => t.tag)).toEqual(['über', 'ok'])
  })

  test('survives invalid frontmatter', () => {
    const broken = parseNote('---\n: [unclosed\n---\nText')
    expect(broken.properties).toEqual({})
  })
})
