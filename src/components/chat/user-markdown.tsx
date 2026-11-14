import { defaultDirectiveFormatter } from '@assistant-ui/react'
import type { Root, Text } from 'mdast'
import { decodeString } from 'micromark-util-decode-string'
import ReactMarkdown from 'react-markdown'
import type { Components } from 'react-markdown'
import remarkGfm from 'remark-gfm'
import type { Plugin } from 'unified'
import { SKIP, visit } from 'unist-util-visit'
import { createDirectiveText } from '@/components/assistant-ui/elements/directive-text'
import { appearancePair } from '@/lib/appearance-policy'

const ToolText = createDirectiveText(defaultDirectiveFormatter)

/** Parse Markdown first: directive-looking code and link labels stay their own text. */
const remarkUserTools: Plugin<[], Root> = () => (tree, file) => {
  const source = String(file)
  visit(tree, (node, index, parent) => {
    if (node.type === 'link' || node.type === 'linkReference') return SKIP
    if (node.type !== 'text' || index === undefined || !parent) return
    const { start, end } = node.position ?? {}
    if (start?.offset === undefined || end?.offset === undefined) return
    const raw = source.slice(start.offset, end.offset)
    // Source escapes distinguish a literal directive from an actual tool chip.
    // If block indentation changed the text, leave it readable rather than guess.
    if (decodeString(raw) !== node.value) return
    const parts: Text[] = []
    let cursor = 0
    for (const match of raw.matchAll(
      /:tool\[([\p{L}\p{N}_.:/-]{1,1024})\]/gu,
    )) {
      const before = raw.slice(0, match.index)
      if ((before.match(/\\+$/)?.[0].length ?? 0) % 2) continue
      // A literal Markdown link example is not an instruction to use a tool.
      if (/^\\?\(/.test(raw.slice(match.index + match[0].length))) continue
      const offset = decodeString(before).length
      if (offset > cursor)
        parts.push({ type: 'text', value: node.value.slice(cursor, offset) })
      parts.push({
        type: 'text',
        value: match[1]!,
        data: { hName: 'span', hProperties: { 'data-user-tool': match[1]! } },
      })
      cursor = offset + match[0].length
    }
    if (!parts.length) return
    if (cursor < node.value.length)
      parts.push({ type: 'text', value: node.value.slice(cursor) })
    parent.children.splice(index, 1, ...parts)
    return index + parts.length
  })
}

const components: Components = {
  p: ({ node: _node, ...props }) => <p data-appearance-recipe="prose" {...appearancePair('primary', 'user-message')} {...props} />,
  a: ({ node: _node, ...props }) => <a {...appearancePair('link', 'user-message')} {...props} />,
  code: ({ node: _node, ...props }) => <code data-appearance-recipe="code" {...appearancePair('code', 'popover')} {...props} />,

  span: ({ node, children, ...props }) => {
    const tool = node?.properties['data-user-tool']
    return typeof tool === 'string' ? (
      <ToolText text={`:tool[${tool}]`} />
    ) : (
      <span {...props}>{children}</span>
    )
  },
  // Attachments have their own preview. Markdown images remain links so opening
  // a sent message cannot silently make third-party image requests.
  img: ({ src, alt, title }) => (
    <a href={typeof src === 'string' ? src : undefined} title={title}>
      {alt || 'Image'}
    </a>
  ),
}

export function UserMarkdown({ text }: { text: string }) {
  return (
    <div className="aui-user-markdown whitespace-normal [&_p]:my-2 [&_ul]:my-2 [&_ul]:list-disc [&_ul]:ps-5 [&_ol]:my-2 [&_ol]:list-decimal [&_ol]:ps-5 [&_li]:my-1 [&_blockquote]:my-2 [&_blockquote]:border-s-2 [&_blockquote]:border-separator [&_blockquote]:ps-3 [&_pre]:my-2 [&_pre]:overflow-x-auto [&_pre]:rounded-lg [&_pre]:bg-popover [&_pre]:p-3 [&_pre]:text-[0.9em] [&_code]:bg-popover [&_code]:text-ink [&_code]:font-mono [&_pre_code]:whitespace-pre [&_a]:text-link [&_a]:underline [&_a]:underline-offset-2 [&_:is(h1,h2,h3,h4,h5,h6)]:my-2 [&_:is(h1,h2,h3,h4,h5,h6)]:font-semibold [&>:first-child]:mt-0 [&>:last-child]:mb-0">
      <ReactMarkdown
        remarkPlugins={[remarkGfm, remarkUserTools]}
        components={components}
      >
        {text}
      </ReactMarkdown>
    </div>
  )
}
