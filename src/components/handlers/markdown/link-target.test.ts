// SOURCING: bun:test over the shortest link to a file and the ranking of
// files for the `[[` list.
import { describe, expect, test } from 'bun:test'
import { linkTarget, rankFiles } from './link-target'

describe('linkTarget', () => {
  const paths = ['Plan.md', 'Notes/Plan.md', 'Notes/Ideas.md', 'img/a.png']

  test('is the base name when no other file shares it', () => {
    expect(linkTarget('Notes/Ideas.md', paths)).toBe('Ideas')
    expect(linkTarget('img/a.png', paths)).toBe('a.png')
  })

  test('is the path when another file shares the name', () => {
    expect(linkTarget('Notes/Plan.md', paths)).toBe('Notes/Plan')
    expect(linkTarget('Plan.md', paths)).toBe('Plan')
    expect(linkTarget('Notes/plan.md', [...paths, 'Notes/plan.md'])).toBe(
      'Notes/plan',
    )
  })
})

describe('rankFiles', () => {
  const paths = [
    'Archive/Old plan.md',
    'Plan.md',
    'Projects/Planning.md',
    'Projects/Roadmap.md',
    'plans/Budget.md',
  ]

  test('puts the best match first, and files matched by path last', () => {
    expect(rankFiles(paths, 'plan')).toEqual([
      'Plan.md',
      'Archive/Old plan.md',
      'Projects/Planning.md',
      'plans/Budget.md',
    ])
  })

  test('matches fuzzily, as the quick switcher does', () => {
    expect(rankFiles(paths, 'pln')[0]).toBe('Plan.md')
    expect(rankFiles(paths, 'rdmp')).toEqual(['Projects/Roadmap.md'])
  })

  test('lists every file for an empty query, shallow ones first', () => {
    expect(rankFiles(paths, '')[0]).toBe('Plan.md')
    expect(rankFiles(paths, ' ', 2)).toHaveLength(2)
  })

  test('leaves out files that do not match', () => {
    expect(rankFiles(paths, 'zebra')).toEqual([])
  })
})
