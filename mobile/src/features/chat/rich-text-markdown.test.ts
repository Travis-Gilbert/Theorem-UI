// SOURCING: bun:test; real marked lexer with the tokenizer used by the native renderer.
import { describe, expect, test } from 'bun:test'
import { lexer, type Tokens } from 'marked'
import { markdownCodeLanguage, markdownImageUrl, markdownLinkUrl, markdownWebUrl, NativeTaskListTokenizer } from './rich-text-markdown'

const parse = (source: string) => lexer(source, { gfm: true, tokenizer: new NativeTaskListTokenizer() })

describe('native rich reply parsing', () => {
  test('retains checked state and inline formatting in task lists', () => {
    const list = parse('- [x] **Ready** with [source](https://example.com)\n- [ ] Next step')[0] as Tokens.List
    expect(list.type).toBe('list')
    const complete = list.items[0]!.tokens.find((token) => token.type === 'text') as Tokens.Text
    const pending = list.items[1]!.tokens.find((token) => token.type === 'text') as Tokens.Text
    expect(complete.text).toBe('☑ **Ready** with [source](https://example.com)')
    expect(pending.text).toBe('☐ Next step')
    expect(complete.tokens?.some((token) => token.type === 'strong')).toBe(true)
    expect(complete.tokens?.some((token) => token.type === 'link')).toBe(true)
  })

  test('preserves ordered starts and nested tasks', () => {
    const list = parse('3. Parent\n   - [x] Child\n4. Next')[0] as Tokens.List
    expect(list.ordered).toBe(true)
    expect(list.start).toBe(3)
    const nested = list.items[0]!.tokens.find((token) => token.type === 'list') as Tokens.List
    expect(nested.items[0]!.checked).toBe(true)
    expect(nested.items[0]!.tokens.some((token) => 'text' in token && token.text.startsWith('☑ '))).toBe(true)
  })

  test('resolves reference links across the complete message', () => {
    const tokens = parse('Read the [source][docs].\n\n## Details\n\n[docs]: https://example.com/docs "Docs"')
    const paragraph = tokens[0] as Tokens.Paragraph
    const link = paragraph.tokens.find((token) => token.type === 'link') as Tokens.Link
    expect(link.href).toBe('https://example.com/docs')
    expect(link.text).toBe('source')
  })

  test('accepts streamed prefixes and an unfinished fence without manufacturing a closing token', () => {
    const source = '# Result\n\nRead **this** [source](https://example.com).\n\n| Item | Value |\n| --- | --- |\n| A | 10 |\n\n```ts\nconst answer = 42;'
    for (let end = 1; end <= source.length; end++) expect(() => parse(source.slice(0, end))).not.toThrow()
    const tokens = parse(source)
    expect(tokens.some((token) => token.type === 'table')).toBe(true)
    const code = tokens.find((token) => token.type === 'code') as Tokens.Code
    expect(code.lang).toBe('ts')
    expect(code.text).toBe('const answer = 42;')
    expect(code.raw.endsWith('```')).toBe(false)
  })
})

describe('native Markdown link and image boundary', () => {
  test('keeps normal links contextual and rejects executable or device schemes', () => {
    expect(markdownWebUrl(' https://example.com/path?q=one#section ')).toBe('https://example.com/path?q=one#section')
    expect(markdownWebUrl('http://localhost:3000/')).toBe('http://localhost:3000/')
    for (const value of ['javascript:alert(1)', 'file:///etc/passwd', 'data:text/html,<script>alert(1)</script>', 'tel:1234', 'theorem://run/1', '/relative', 'https://example.com\n/path', undefined]) {
      expect(markdownWebUrl(value)).toBeUndefined()
    }
  })

  test('preserves email links without allowing other app schemes or image destinations', () => {
    expect(markdownLinkUrl(' mailto:team@example.com?subject=Theorem%20reply ')).toBe('mailto:team@example.com?subject=Theorem%20reply')
    expect(markdownLinkUrl('https://example.com/docs')).toBe('https://example.com/docs')
    expect(markdownWebUrl('mailto:team@example.com')).toBeUndefined()
    expect(markdownImageUrl('mailto:team@example.com')).toBeUndefined()
    for (const value of ['javascript:alert(1)', 'file:///private/file', 'data:text/html,test', 'tel:123', 'sms:123', 'theorem://run/1', 'mailto:team@example.com\n?subject=test']) {
      expect(markdownLinkUrl(value)).toBeUndefined()
    }
  })

  test('allows encoded raster images while leaving HTML and SVG data inert', () => {
    expect(markdownImageUrl('data:image/png;base64,aGVsbG8=')).toBe('data:image/png;base64,aGVsbG8=')
    expect(markdownImageUrl('https://example.com/image.png')).toBe('https://example.com/image.png')
    expect(markdownImageUrl('data:image/svg+xml,<svg onload="alert(1)"/>')).toBeUndefined()
    expect(markdownImageUrl('data:text/html;base64,aGVsbG8=')).toBeUndefined()
    expect(markdownImageUrl('javascript:alert(1)')).toBeUndefined()
  })

  test('uses the language name rather than fence metadata in the code header', () => {
    expect(markdownCodeLanguage('typescript title="example"')).toBe('typescript')
    expect(markdownCodeLanguage('')).toBe('text')
    expect(markdownCodeLanguage(undefined)).toBe('text')
  })
})
