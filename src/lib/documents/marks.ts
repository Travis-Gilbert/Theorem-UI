// SOURCING: zod (parses the server's mark_up_document result once, where it
// comes in), the W3C Web Annotation TextQuoteSelector for anchors, and
// assistant-ui's message parts as the SDK adapter maps them.
//
// The agent marks up a document by calling mark_up_document (Theorem's
// SPEC-DOCUMENT-MARKUP-1.0). The server checks and numbers the marks and
// returns them as the call's result; the document screen anchors them in the
// open note. Quotes are anchored here, not on the server, which may not have
// the note at all.
import { z } from 'zod'

export const MARKUP_TOOL = 'mark_up_document'

/** A W3C TextQuoteSelector: the text itself, and what surrounds it. */
const quote = z.object({
  exact: z.string().min(1),
  prefix: z.string().optional(),
  suffix: z.string().optional(),
})
export type Quote = z.infer<typeof quote>

const mark = z.discriminatedUnion('kind', [
  z.object({
    markId: z.string(),
    kind: z.literal('comment'),
    quote,
    body: z.string().min(1),
  }),
  z.object({
    markId: z.string(),
    kind: z.literal('highlight'),
    quote,
    body: z.string().optional(),
  }),
  z.object({
    markId: z.string(),
    kind: z.literal('edit'),
    quote,
    replacement: z.string(),
  }),
])
export type Mark = z.infer<typeof mark>

const markupResult = z.object({
  contract: z.literal('theorem-document-markup-v1'),
  marks: z.array(z.unknown()),
})

type Part = { type: string; text?: string; toolName?: string; result?: unknown }

/**
 * The marks an assistant message carries: those of each markup call the
 * server has answered. A mark that does not parse is left out, not the call.
 */
export function marksOf(content: readonly Part[]): Mark[] {
  return content.flatMap((part) => {
    if (part.type !== 'tool-call' || part.toolName !== MARKUP_TOOL) return []
    const result = markupResult.safeParse(part.result)
    if (!result.success) return []
    return result.data.marks.flatMap((item) => {
      const parsed = mark.safeParse(item)
      return parsed.success ? [parsed.data] : []
    })
  })
}

/** The message's text, which the margin shows beside the passage. */
export const replyOf = (content: readonly Part[]) =>
  content
    .filter((part) => part.type === 'text' && part.text)
    .map((part) => part.text)
    .join('\n\n')
