// SOURCING: none — the theorem-embed fence format, pure parse and print
//
// An embed is a fenced block whose info string is `theorem-embed` and whose
// body is one JSON object naming a Theorem object. Any Markdown tool keeps it
// as a readable code block; Theorem UI renders it as a live card.

export const EMBED_LANGUAGE = 'theorem-embed'

/**
 * `document` is a note, `file` an upload (audio, video, PDF), `link` a URL,
 * `thread` a conversation, `artifact` an app or artifact and `space` a canvas.
 * A kind this client does not know still round-trips and shows as a plain card.
 */
export type EmbedRef = {
  kind: string
  id: string
  title?: string
  /** A file's type, which picks its viewer. */
  mime?: string
  size?: number
  sha256?: string
  /** The conversation an artifact belongs to, which is where it opens. */
  threadId?: string
}

const STRINGS = ['title', 'mime', 'sha256', 'threadId'] as const

export function parseEmbed(content: string): EmbedRef | undefined {
  try {
    const value: unknown = JSON.parse(content)
    if (typeof value !== 'object' || value === null) return undefined
    const fields = value as Record<string, unknown>
    const { kind, id, size } = fields
    if (typeof kind !== 'string' || typeof id !== 'string' || !kind || !id)
      return undefined
    const ref: EmbedRef = { kind, id }
    for (const key of STRINGS) {
      const field = fields[key]
      if (typeof field === 'string') ref[key] = field
    }
    if (typeof size === 'number') ref.size = size
    return ref
  } catch {
    return undefined
  }
}

export function embedFence(ref: EmbedRef): string {
  return `\`\`\`${EMBED_LANGUAGE}\n${JSON.stringify(ref)}\n\`\`\`\n`
}
