// SOURCING: @theoremharness/sdk's TheoremContextReference for what an ask
// sends; the names Obsidian-style notes give their blocks.
//
// Asking about a passage sends two references: the passage, and the whole
// note as the agent's copy to quote from. Viewing a note sends nothing. The
// passage says it is markable: this screen shows the agent's marks, so Theorem
// offers mark_up_document for it and not for surfaces that have nowhere to show them.
import type { TheoremContextReference } from '@theoremharness/sdk'
import type { Theorem } from '@/lib/theorem/client'
import { THEOREM_WORKSPACE_PREFIX } from '@/lib/workspace/theorem-client'

/** The part of a note the person picked, with the text it covers. */
export type Excerpt = {
  /** How it is named, such as "selected paragraph". */
  part: string
  text: string
  /** Where it starts in the note's text, which may repeat these words. */
  at: number
}

const BLOCK_NAMES: Record<string, string> = {
  paragraph: 'paragraph',
  heading: 'heading',
  code_block: 'code',
  blockquote: 'quote',
  bullet_list: 'list',
  ordered_list: 'list',
  table: 'table',
}

/**
 * Names a selection by the document's top-level blocks it touches, each
 * marked whole when the selection covers all of it.
 */
export function blocksPart(
  blocks: ReadonlyArray<{ type: string; whole: boolean }>,
) {
  const [block, ...more] = blocks
  if (!block || more.length) return 'selected passage'
  const name = BLOCK_NAMES[block.type]
  return block.whole && name ? `selected ${name}` : 'selected text'
}

/** Theorem knows Home by its vault id; a folder on this device by its own. */
const resourceWorkspace = (workspaceId: string) =>
  workspaceId.startsWith(THEOREM_WORKSPACE_PREFIX)
    ? workspaceId.slice(THEOREM_WORKSPACE_PREFIX.length)
    : workspaceId

/** A reference the document screen can show the agent's marks on. */
type AskReference = TheoremContextReference & { markable?: boolean }

// Theorem refuses a whole ask over one reference larger than its limit, as JSON:
// 8 KiB, or 256 KiB for a note on this device. Each keeps room for its name.
const PASSAGE_BYTES = 7 * 1024
const NOTE_BYTES = 250 * 1024

const jsonBytes = (text: string) =>
  new TextEncoder().encode(JSON.stringify(text)).length

/** The longest start of the text within that many JSON bytes, in whole characters. */
function fit(text: string, bytes: number) {
  const quotes = jsonBytes('')
  let used = quotes
  let end = 0
  for (const character of text) {
    used += jsonBytes(character) - quotes
    if (used > bytes) break
    end += character.length
  }
  return text.slice(0, end)
}

/** A long note's stretch around `at`, starting ahead of it by a margin. */
function around(text: string, at: number) {
  if (jsonBytes(text) <= NOTE_BYTES) return text
  const from = Math.max(0, at - NOTE_BYTES / 4)
  // The second half of a character on its own is not text Theorem can parse.
  const whole = (text.codePointAt(from - 1) ?? 0) > 0xffff ? from + 1 : from
  return fit(text.slice(whole), NOTE_BYTES)
}

/** The references an ask about `excerpt` of the note at `path` carries. */
export function askReferences(
  note: { workspaceId: string; path: string; title: string; text: string },
  excerpt: Excerpt,
  document?: Pick<
    Theorem.DocumentSummary,
    'documentId' | 'documentKind' | 'revision'
  >,
): AskReference[] {
  const passage = fit(excerpt.text, PASSAGE_BYTES)
  if (document)
    return [
      {
        location: {
          resource: {
            kind: 'graph-object',
            objectId: document.documentId,
            objectType: document.documentKind,
          },
          revision: String(document.revision.position),
        },
        excerpt: passage,
        label: `${note.title} · ${excerpt.part}`,
        markable: true,
      },
    ]
  const resource = {
    kind: 'file' as const,
    workspaceId: resourceWorkspace(note.workspaceId),
    path: note.path,
  }
  return [
    {
      location: { resource },
      excerpt: passage,
      label: `${note.title} · ${excerpt.part}`,
      markable: true,
    },
    {
      location: { resource },
      excerpt: around(note.text, excerpt.at),
      label: note.title,
    },
  ]
}
