// SOURCING: bun:test over @milkdown/crepe with the Markdown handler's syntax
// plugins, the editor that writes these files.
//
// A note loaded and saved must keep its Obsidian syntax: wikilinks with
// headings, blocks and aliases, embeds with sizes, and callouts with their
// type, fold state and title, or no title when it had none.
import { describe, expect, test } from 'bun:test'
import { Crepe } from '@milkdown/crepe'
import { editorViewCtx } from '@milkdown/kit/core'
import type { Node as ProseNode } from '@milkdown/kit/prose/model'
import { markdownSyntax, obsidianMarkdownStyle } from './syntax'

async function load(markdown: string) {
  const root = document.createElement('div')
  document.body.append(root)
  const crepe = new Crepe({ root, defaultValue: markdown })
  crepe.editor.config(obsidianMarkdownStyle).use(markdownSyntax)
  await crepe.create()
  const doc = crepe.editor.action((ctx) => ctx.get(editorViewCtx).state.doc)
  const out = crepe.getMarkdown()
  await crepe.destroy()
  root.remove()
  return { doc, out }
}

function nodes(doc: ProseNode, name: string) {
  const found: Array<Record<string, unknown>> = []
  doc.descendants((node) => {
    if (node.type.name === name) found.push(node.attrs)
  })
  return found
}

describe('wikilinks', () => {
  test('keep their heading, block and alias', async () => {
    const md =
      'See [[Other note#Heading|the heading]], [[#^abc123]] and [[Plain]].\n'
    const { doc, out } = await load(md)
    expect(nodes(doc, 'wikiLink')).toEqual([
      { value: 'Other note#Heading', alias: 'the heading' },
      { value: '#^abc123', alias: null },
      { value: 'Plain', alias: null },
    ])
    expect(out).toBe(md)
  })

  test('embeds keep their size', async () => {
    const md = '![[diagram.png|300x200]]\n\n![[Note#Section]]\n'
    const { doc, out } = await load(md)
    expect(nodes(doc, 'wikiEmbed')).toEqual([
      { value: 'diagram.png', alias: '300x200' },
      { value: 'Note#Section', alias: null },
    ])
    expect(out).toBe(md)
  })
})

describe('callouts', () => {
  test('keep type, fold state and title', async () => {
    const md = '> [!warning]- Watch out\n> Body text.\n'
    const { doc, out } = await load(md)
    expect(nodes(doc, 'callout')).toEqual([
      { kind: 'warning', title: 'Watch out', folded: true },
    ])
    expect(out).toBe(md)
  })

  test('without a title stay without one', async () => {
    const md = '> [!note]\n> Just a note.\n'
    const { doc, out } = await load(md)
    expect(nodes(doc, 'callout')).toEqual([
      { kind: 'note', title: null, folded: null },
    ])
    expect(out).toBe(md)
  })

  test('hold blocks, and open foldable ones say so', async () => {
    const md = '> [!tip]+ Steps\n> - one\n> - two\n'
    const { out } = await load(md)
    expect(out).toBe(md)
  })

  test('leave plain quotes alone', async () => {
    const { doc, out } = await load('> Just a quote.\n')
    expect(nodes(doc, 'callout')).toEqual([])
    expect(nodes(doc, 'blockquote')).toHaveLength(1)
    expect(out).toBe('> Just a quote.\n')
  })
})

test('bullets are written as Obsidian writes them', async () => {
  const { out } = await load('- one\n- two\n')
  expect(out).toBe('- one\n- two\n')
})
