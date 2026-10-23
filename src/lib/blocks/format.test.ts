// SOURCING: bun:test over @milkdown/crepe, the editor the Markdown handler
// uses, with the live-block plugins added the way liveBlocksExtension adds them.
import { describe, expect, test } from 'bun:test'
import { Crepe } from '@milkdown/crepe'
import { editorViewCtx } from '@milkdown/kit/core'
import {
  closedFence,
  fenceCode,
  fenceInfo,
  liveBlocksIn,
  pinnedBody,
  pinnedOutput,
  serializeLiveBlock,
  withFenceCode,
  withFenceId,
} from './format'
import { LIVE_BLOCK_NODE, liveBlockPlugins } from './milkdown'

async function withCrepe<T>(
  markdown: string,
  fn: (crepe: Crepe) => T,
): Promise<T> {
  const root = document.createElement('div')
  document.body.append(root)
  const crepe = new Crepe({ root, defaultValue: markdown })
  crepe.editor.use(liveBlockPlugins)
  await crepe.create()
  try {
    return fn(crepe)
  } finally {
    await crepe.destroy()
    root.remove()
  }
}

const nodeTypes = (crepe: Crepe) => {
  const types: Array<string> = []
  crepe.editor.action((ctx) =>
    ctx.get(editorViewCtx).state.doc.descendants((node) => {
      types.push(node.type.name)
    }),
  )
  return types
}

const fences: Record<string, string> = {
  tsx: '```tsx {.live #streak}\nconst days = 3\ndisplay(days)\n```',
  'query with odd spacing': [
    '```query   { .live   #habits  view=table }',
    'from: Data/habits.csv',
    'view:   table',
    '```',
  ].join('\n'),
  'agent with tildes, attributes first and a padded close': [
    '~~~~agent {#nightly .live trigger="manual"}',
    'prompt: Summarize the day',
    'inputs: [streak, Data/habits.csv]',
    '~~~~   ',
  ].join('\n'),
  'indented fence':
    '  ```tsx{.live #indented}\n  const x = 2\n      deeper\n  ```',
  'blank lines and trailing spaces': [
    '```ts {.live #spaces}',
    'const a = 1   ',
    '',
    '',
    '\tconst b = 2',
    '```',
  ].join('\n'),
  'live on a language nothing runs': '```python {.live #py}\nprint(1)\n```',
  'longer fence holding a fence': [
    '````tsx {.live #nested}',
    'const md = `',
    '```',
    '`',
    '````',
  ].join('\n'),
}

describe('live fences round-trip byte for byte through Crepe', () => {
  for (const [name, fence] of Object.entries(fences)) {
    test(name, async () => {
      const markdown = `# Today\n\n${fence}\n\nAfter the block.\n`
      const out = await withCrepe(markdown, (crepe) => {
        expect(nodeTypes(crepe)).toContain(LIVE_BLOCK_NODE)
        return crepe.getMarkdown()
      })
      expect(out).toContain(`\n\n${fence}\n\n`)
      expect(out).toContain('After the block.')
    })
  }

  test('a pinned output stays attached and unchanged', async () => {
    const block = [
      '```tsx {.live #total}',
      '1 + 2',
      '```',
      '',
      '<!-- theorem:output #total -->',
      '',
      '| day | done |',
      '| --- | ---- |',
      '| Mon | yes  |',
      '',
      '<!-- /theorem:output -->',
    ].join('\n')
    const out = await withCrepe(`${block}\n\nNext.\n`, (crepe) => {
      expect(nodeTypes(crepe).filter((t) => t === 'table')).toHaveLength(0)
      return crepe.getMarkdown()
    })
    expect(out).toContain(block)
  })

  test('an output for another block is left as Markdown', () => {
    const [block] = liveBlocksIn(
      '```tsx {.live #a}\n1\n```\n\n<!-- theorem:output #b -->\n\nx\n\n<!-- /theorem:output -->\n',
    )
    expect(block?.output).toBeNull()
  })

  test('a fence without .live stays an ordinary code block', async () => {
    const fence = '```tsx\nconst a = 1\n```'
    const out = await withCrepe(`${fence}\n`, (crepe) => {
      expect(nodeTypes(crepe)).not.toContain(LIVE_BLOCK_NODE)
      expect(nodeTypes(crepe)).toContain('code_block')
      return crepe.getMarkdown()
    })
    expect(out).toContain(fence)
  })

  test('a live fence inside a list keeps its lines', async () => {
    const markdown =
      '- first\n\n  ```tsx {.live #inlist}\n  const x = 1\n\n    x\n  ```\n'
    const out = await withCrepe(markdown, (crepe) => {
      expect(nodeTypes(crepe)).toContain(LIVE_BLOCK_NODE)
      return crepe.getMarkdown()
    })
    expect(out).toContain(
      '```tsx {.live #inlist}\n  const x = 1\n\n    x\n  ```',
    )
  })

  test('a second pass is stable', async () => {
    const markdown = `${Object.values(fences).join('\n\n')}\n`
    const once = await withCrepe(markdown, (crepe) => crepe.getMarkdown())
    const twice = await withCrepe(once, (crepe) => crepe.getMarkdown())
    expect(twice).toBe(once)
  })
})

describe('fence helpers', () => {
  test('info strings parse with md-attr-parser', () => {
    expect(fenceInfo(fences['query with odd spacing']!)).toEqual({
      lang: 'query',
      kind: 'query',
      id: 'habits',
      classes: ['live'],
      attributes: { view: 'table' },
    })
    expect(fenceInfo('```tsx {.wide}\n```')).toBeNull()
    expect(fenceInfo('```tsx\n```')).toBeNull()
    expect(
      fenceInfo(fences['live on a language nothing runs']!)?.kind,
    ).toBeNull()
  })

  test('code is read without the fence indentation and written back with it', () => {
    const fence = fences['indented fence']!
    expect(fenceCode(fence)).toBe('const x = 2\n    deeper')
    expect(withFenceCode(fence, fenceCode(fence))).toBe(fence)
    expect(withFenceCode(fence, 'const y = 3')).toBe(
      '  ```tsx{.live #indented}\n  const y = 3\n  ```',
    )
  })

  test('code holding a closing fence lengthens the fence', () => {
    const fence = '```tsx {.live #a}\n1\n```'
    const next = withFenceCode(fence, 'const s = `\n```\n`')
    expect(next).toBe('````tsx {.live #a}\nconst s = `\n```\n`\n````')
    expect(fenceCode(next)).toBe('const s = `\n```\n`')
  })

  test('an id goes inside the attribute block', () => {
    expect(withFenceId('```tsx {.live}\n1\n```', 'b1')).toBe(
      '```tsx {.live #b1}\n1\n```',
    )
  })

  test('an unclosed fence is closed when written', () => {
    expect(closedFence('```tsx {.live}\nconst a = 1')).toBe(
      '```tsx {.live}\nconst a = 1\n```',
    )
    expect(liveBlocksIn('```tsx {.live #open}\nconst a = 1\n')[0]?.code).toBe(
      'const a = 1\n',
    )
  })

  test('pinned outputs are built and read back', () => {
    const output = pinnedOutput('total', '**3**\n')
    expect(output).toBe(
      '<!-- theorem:output #total -->\n\n**3**\n\n<!-- /theorem:output -->',
    )
    expect(pinnedBody(output)).toBe('**3**')
    expect(
      serializeLiveBlock({
        fence: '```tsx {.live #total}\n1\n```',
        gap: '\n\n',
        output,
      }),
    ).toBe(`\`\`\`tsx {.live #total}\n1\n\`\`\`\n\n${output}`)
  })
})
