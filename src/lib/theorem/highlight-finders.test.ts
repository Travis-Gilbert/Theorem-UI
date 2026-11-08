// SOURCING: bun:test; the cases come from what the source comments in Threadbear's highlights.ts promise.
import { describe, expect, test } from 'bun:test'
import { commitsIn, linkItem, linksIn, neighbour } from './highlight-finders'

describe('linkItem', () => {
  test('strips punctuation and a bare origin slash', () => {
    expect(linkItem('https://x.dev/**').url).toBe('https://x.dev')
    expect(linkItem('http://localhost:5176/').url).toBe('http://localhost:5176')
  })
  test('names a pull request by repo and number', () => {
    expect(linkItem('https://github.com/a/b/pull/19').title).toBe('a/b#19')
  })
})

describe('linksIn', () => {
  test('takes markdown titles and bare URLs and skips code blocks', () => {
    const found = linksIn(
      'See [the docs](https://docs.dev/a) and https://x.dev.\n```\nhttps://skipped.dev\n```',
    )
    expect(found.map((link) => [link.title, link.url])).toEqual([
      ['the docs', 'https://docs.dev/a'],
      ['x.dev', 'https://x.dev'],
    ])
  })
})

test('commitsIn reads git commit output', () => {
  expect(commitsIn('[main 91aba3e] App: hold')).toEqual([
    { branch: 'main', sha: '91aba3e', message: 'App: hold' },
  ])
})

test('neighbour starts at an end and stops at the other', () => {
  expect(neighbour(['a', 'b'], undefined, 1)).toBe('a')
  expect(neighbour(['a', 'b'], undefined, -1)).toBe('b')
  expect(neighbour(['a', 'b'], 'b', 1)).toBeUndefined()
})
