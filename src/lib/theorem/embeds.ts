// SOURCING: none — the theorem-embed fence format, pure parse and print
//
// An embed is a fenced block whose info string is `theorem-embed` and whose
// body is one JSON object naming a Theorem object. Any Markdown tool keeps it
// as a readable code block; Theorem UI renders it as a live card.

export const EMBED_LANGUAGE = 'theorem-embed'

export type EmbedRef = { kind: string; id: string; title?: string }

export function parseEmbed(content: string): EmbedRef | undefined {
  try {
    const value: unknown = JSON.parse(content)
    if (typeof value !== 'object' || value === null) return undefined
    const { kind, id, title } = value as Record<string, unknown>
    if (typeof kind !== 'string' || typeof id !== 'string' || !kind || !id)
      return undefined
    return typeof title === 'string' ? { kind, id, title } : { kind, id }
  } catch {
    return undefined
  }
}

export function embedFence(ref: EmbedRef): string {
  return `\`\`\`${EMBED_LANGUAGE}\n${JSON.stringify(ref)}\n\`\`\`\n`
}
