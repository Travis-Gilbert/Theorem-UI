// SOURCING: bun:test over the theorem-embed fence format
import { describe, expect, test } from 'bun:test'
import { EMBED_LANGUAGE, embedFence, parseEmbed } from './embeds'

describe('theorem-embed fences', () => {
  test('print and parse are inverse', () => {
    const ref = { kind: 'document', id: 'note:abc', title: 'Title' }
    const fence = embedFence(ref)
    expect(fence.startsWith(`\`\`\`${EMBED_LANGUAGE}\n`)).toBe(true)
    expect(parseEmbed(fence.split('\n')[1]!)).toEqual(ref)
  })

  test('title is optional', () => {
    expect(parseEmbed('{"kind":"document","id":"note:abc"}')).toEqual({
      kind: 'document',
      id: 'note:abc',
    })
  })

  test('anything else is not an embed', () => {
    for (const body of [
      '',
      'not json',
      '[]',
      'null',
      '{"kind":"document"}',
      '{"kind":"","id":"x"}',
      '{"kind":1,"id":"x"}',
    ])
      expect(parseEmbed(body)).toBeUndefined()
  })
})
