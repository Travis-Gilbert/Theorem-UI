// SOURCING: bun:test over @milkdown/crepe, the editor notes are written in
//
// Notes are stored as the Markdown Crepe serializes. Loading a note and saving
// it untouched must not drift: after Crepe's first normalization, a second
// pass returns the same text, and each block kind keeps its meaning.
import { describe, expect, test } from 'bun:test'
import { Crepe } from '@milkdown/crepe'
import { embedFence, parseEmbed } from './embeds'

async function roundTrip(markdown: string): Promise<string> {
  const root = document.createElement('div')
  document.body.append(root)
  const crepe = new Crepe({ root, defaultValue: markdown })
  await crepe.create()
  const out = crepe.getMarkdown()
  await crepe.destroy()
  root.remove()
  return out
}

const embed = {
  kind: 'document',
  id: 'note:0f9e8d7c',
  title: 'A note with "quotes" and a backtick `',
}

const fixtures: Record<string, { markdown: string; keeps: string[] }> = {
  headings: {
    markdown: '# Title\n\n## Section\n\n### Sub\n\nBody text.\n',
    keeps: ['# Title', '## Section', '### Sub', 'Body text.'],
  },
  inline: {
    markdown:
      'Some **bold**, *italic*, `code`, ~~struck~~ and [a link](https://example.com).\n',
    keeps: [
      '**bold**',
      '*italic*',
      '`code`',
      '~~struck~~',
      '[a link](https://example.com)',
    ],
  },
  lists: {
    markdown: '- one\n- two\n  - nested\n\n1. first\n2. second\n',
    keeps: ['one', 'nested', '1. first', '2. second'],
  },
  tasks: {
    markdown: '- [ ] open\n- [x] done\n',
    keeps: ['[ ] open', '[x] done'],
  },
  table: {
    markdown: '| Name | Value |\n| --- | --- |\n| a | 1 |\n| b | 2 |\n',
    keeps: ['Name', 'Value', '| a', '| b'],
  },
  code: {
    markdown: '```ts\nconst x: number = 1\n```\n',
    keeps: ['```ts', 'const x: number = 1'],
  },
  quote: {
    markdown: '> Quoted line\n',
    keeps: ['> Quoted line'],
  },
  math: {
    markdown: 'Inline $e^{i\\pi} + 1 = 0$ math.\n\n$$\n\\int_0^1 x\\,dx\n$$\n',
    keeps: ['$e^{i\\pi} + 1 = 0$', '\\int_0^1 x\\,dx'],
  },
  embed: {
    markdown: `Before\n\n${embedFence(embed)}\nAfter\n`,
    keeps: ['Before', 'After'],
  },
}

describe('Crepe Markdown round trip', () => {
  for (const [name, { markdown, keeps }] of Object.entries(fixtures)) {
    test(name, async () => {
      const once = await roundTrip(markdown)
      const twice = await roundTrip(once)
      expect(twice).toBe(once)
      for (const fragment of keeps) expect(once).toContain(fragment)
    })
  }

  test('an embed fence keeps its exact reference', async () => {
    const out = await roundTrip(embedFence(embed))
    const body = /```theorem-embed\n([\s\S]*?)\n```/.exec(out)?.[1]
    expect(body).toBeDefined()
    expect(parseEmbed(body!)).toEqual(embed)
  })
})
