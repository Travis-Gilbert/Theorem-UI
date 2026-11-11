import { afterEach, expect, test } from 'bun:test'
import { UserMarkdown } from './user-markdown'
import { cleanup, render } from '../../../test/blocks/render'

afterEach(cleanup)

test('sent user documents render headings, lists, marks, code and hard breaks', async () => {
  const { container } = await render(
    <UserMarkdown
      text={
        '# Plan\n\nUse **bold**, *emphasis*, ~~old~~ and `code`.\n\n- First\n- Second\n\nFirst line\\\nSecond line\n\n```ts\nconst value = "literal"\n```'
      }
    />,
  )
  expect(container.querySelector('h1')?.textContent).toBe('Plan')
  expect(container.querySelector('strong')?.textContent).toBe('bold')
  expect(container.querySelector('em')?.textContent).toBe('emphasis')
  expect(container.querySelector('del')?.textContent).toBe('old')
  expect(
    [...container.querySelectorAll('li')].map((li) => li.textContent),
  ).toEqual(['First', 'Second'])
  expect(container.querySelector('p br')).not.toBeNull()
  expect(container.querySelector('pre code')?.textContent).toBe(
    'const value = "literal"\n',
  )
})

test('safe Markdown escapes display as literal text, not as raw backslashes or formatting', async () => {
  const { container } = await render(
    <UserMarkdown
      text={
        'Use \\*literal\\* and \\[brackets]\\(https://example.com), a\\_b, https\\://example.com.'
      }
    />,
  )
  expect(container.textContent).toBe(
    'Use *literal* and [brackets](https://example.com), a_b, https://example.com.',
  )
  expect(container.querySelector('em, strong')).toBeNull()
  expect(container.querySelector('a')?.textContent).not.toBe('brackets')
})

test('tool chips stay inside prose formatting and stay literal in code and links', async () => {
  const { container } = await render(
    <UserMarkdown
      text={
        '**Use :tool[recall]** and :tool[rustyweb_search].\n\n`:tool[inline]`\n\n```text\n:tool[fenced]\n```\n\n[:tool[linked]](https://example.com)'
      }
    />,
  )
  expect(
    [...container.querySelectorAll('[data-slot="directive-text-chip"]')].map(
      (chip) => chip.textContent,
    ),
  ).toEqual(['recall', 'rustyweb_search'])
  expect(
    container.querySelector('strong [data-directive-id="recall"]'),
  ).not.toBeNull()
  expect(container.querySelector('code')?.textContent).toBe(':tool[inline]')
  expect(container.querySelector('pre code')?.textContent).toBe(
    ':tool[fenced]\n',
  )
  expect(container.querySelector('a')?.textContent).toBe(':tool[linked]')
})

test('escaped directives and literal link syntax do not become chips', async () => {
  const { container } = await render(
    <UserMarkdown
      text={
        'Use :tool\\[literal], \\:tool[escaped], &#58;tool[entity], :tool[example]\\(https://example.com), then :tool[real].'
      }
    />,
  )
  expect(
    [...container.querySelectorAll('[data-slot="directive-text-chip"]')].map(
      (chip) => chip.textContent,
    ),
  ).toEqual(['real'])
  expect(container.textContent).toBe(
    'Use :tool[literal], :tool[escaped], :tool[entity], :tool[example](https://example.com), then real.',
  )
})

test('user Markdown does not execute HTML or automatically fetch embedded images', async () => {
  const { container } = await render(
    <UserMarkdown
      text={
        '<script>alert(1)</script>\n\n![diagram](https://example.com/image.png)\n\n[unsafe](javascript:alert(1))'
      }
    />,
  )
  expect(container.querySelector('script, img, iframe')).toBeNull()
  expect(container.textContent).toContain('<script>alert(1)</script>')
  expect(
    container.querySelector('a[href="https://example.com/image.png"]')
      ?.textContent,
  ).toBe('diagram')
  expect(container.querySelector('a[href^="javascript:"]')).toBeNull()
})
