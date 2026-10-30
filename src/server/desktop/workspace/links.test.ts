import { describe, expect, test } from 'bun:test'
import { nameKey, resolveLink } from './resolve'
import type { LinkLookup } from './resolve'
import { applyEdits, findLinkSpans, retarget } from './rewrite'

function lookupOf(files: Array<string>): LinkLookup {
  return { named: (key) => files.filter((file) => nameKey(file) === key) }
}

const files = [
  'Ideas.md',
  'archive/Ideas.md',
  'notes/Plan.md',
  'notes/sub/Deep.md',
  'projects/alpha/Deep.md',
  'specs/My Spec.md',
  'img/diagram.png',
]
const lookup = lookupOf(files)

describe('resolveLink', () => {
  test('a bare name takes the shortest path with that name', () => {
    expect(resolveLink('Ideas', 'notes/Plan.md', 'wiki', lookup)).toBe(
      'Ideas.md',
    )
    expect(resolveLink('Deep', 'Ideas.md', 'wiki', lookup)).toBe(
      'notes/sub/Deep.md',
    )
  })

  test('a path picks among files with the same name', () => {
    expect(resolveLink('archive/Ideas', 'notes/Plan.md', 'wiki', lookup)).toBe(
      'archive/Ideas.md',
    )
    expect(resolveLink('alpha/Deep', 'Ideas.md', 'wiki', lookup)).toBe(
      'projects/alpha/Deep.md',
    )
  })

  test('falls back to a case-insensitive match', () => {
    expect(resolveLink('ideas', 'x.md', 'wiki', lookup)).toBe('Ideas.md')
    expect(resolveLink('NOTES/plan.md', 'x.md', 'wiki', lookup)).toBe(
      'notes/Plan.md',
    )
  })

  test('relative and absolute targets', () => {
    expect(resolveLink('./sub/Deep', 'notes/Plan.md', 'wiki', lookup)).toBe(
      'notes/sub/Deep.md',
    )
    expect(
      resolveLink('../specs/My Spec.md', 'notes/Plan.md', 'markdown', lookup),
    ).toBe('specs/My Spec.md')
    expect(resolveLink('/Ideas', 'archive/x.md', 'wiki', lookup)).toBe(
      'Ideas.md',
    )
    expect(
      resolveLink('../../outside.md', 'notes/Plan.md', 'markdown', lookup),
    ).toBe(null)
  })

  test('attachments and missing targets', () => {
    expect(resolveLink('diagram.png', 'Ideas.md', 'wiki', lookup)).toBe(
      'img/diagram.png',
    )
    expect(resolveLink('Nowhere', 'Ideas.md', 'wiki', lookup)).toBe(null)
  })
})

describe('findLinkSpans', () => {
  const text = `---
related: "[[Ideas]]"
---
[[Ideas]] [[ Ideas#Later|alias]] ![[diagram.png]] [[Ideas#^b1]]
[spec](../specs/My%20Spec.md#Scope) ![img](<../img/diagram.png>)
[out](https://example.com) \`[[Code]]\`

[ref]: ../Ideas.md
`

  test('finds each target with its exact offsets', () => {
    const spans = findLinkSpans(text)
    expect(spans.map((s) => [s.kind, s.raw, s.target, s.angle])).toEqual([
      ['wikilink', 'Ideas', 'Ideas', false],
      ['wikilink', 'Ideas', 'Ideas', false],
      ['embed', 'diagram.png', 'diagram.png', false],
      ['wikilink', 'Ideas', 'Ideas', false],
      ['markdown', '../specs/My%20Spec.md', '../specs/My Spec.md', false],
      ['embed', '../img/diagram.png', '../img/diagram.png', true],
      ['markdown', '../Ideas.md', '../Ideas.md', false],
    ])
    for (const span of spans)
      expect(text.slice(span.start, span.end)).toBe(span.raw)
  })

  test('counts offsets after a byte order mark', () => {
    const spans = findLinkSpans('﻿[[Ideas]]')
    expect(spans[0]).toMatchObject({ start: 3, end: 8 })
  })
})

describe('retarget', () => {
  const span = (text: string) => findLinkSpans(text)[0]!

  test('keeps a bare name as short as stays unambiguous', () => {
    const after = lookupOf([...files, 'Renamed.md'])
    expect(retarget(span('[[Ideas]]'), 'x.md', 'Renamed.md', after)).toBe(
      'Renamed',
    )
    const clash = lookupOf([...files, 'a/Ideas.md'])
    expect(retarget(span('[[Ideas]]'), 'x.md', 'a/Ideas.md', clash)).toBe(
      'a/Ideas',
    )
  })

  test('keeps the extension, path and relative styles', () => {
    expect(
      retarget(span('[[Ideas.md]]'), 'x.md', 'New.md', lookupOf(['New.md'])),
    ).toBe('New.md')
    expect(
      retarget(
        span('[[archive/Ideas]]'),
        'x.md',
        'old/Ideas.md',
        lookupOf(['old/Ideas.md']),
      ),
    ).toBe('old/Ideas')
    expect(
      retarget(
        span('[[./Ideas]]'),
        'notes/x.md',
        'notes/deeper/Ideas.md',
        lookupOf(['notes/deeper/Ideas.md']),
      ),
    ).toBe('./deeper/Ideas')
  })

  test('writes Markdown destinations relative and escaped', () => {
    expect(
      retarget(
        span('[s](../specs/My%20Spec.md)'),
        'notes/Plan.md',
        'docs/The (final) Spec.md',
        lookup,
      ),
    ).toBe('../docs/The%20%28final%29%20Spec.md')
    expect(retarget(span('[s](<a b.md>)'), 'Plan.md', 'c d.md', lookup)).toBe(
      'c d.md',
    )
    expect(retarget(span('[s](/a.md)'), 'x/Plan.md', 'b/a.md', lookup)).toBe(
      '/b/a.md',
    )
  })

  test('edits only the target characters', () => {
    const text = 'See [[Ideas#Later|alias]] and [s](Ideas.md#top).'
    const spans = findLinkSpans(text)
    expect(
      applyEdits(
        text,
        spans.map((s) => ({
          start: s.start,
          end: s.end,
          text: s.syntax === 'wiki' ? 'Next' : 'Next.md',
        })),
      ),
    ).toBe('See [[Next#Later|alias]] and [s](Next.md#top).')
  })
})
