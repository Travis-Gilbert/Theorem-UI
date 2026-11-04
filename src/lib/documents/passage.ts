// SOURCING: @theoremharness/sdk's TheoremContextReference for what an ask
// sends; the names Obsidian-style notes give their blocks.
//
// Asking about a passage sends two references: the passage, and the whole
// note as the agent's copy to quote from. Viewing a note sends nothing.
import type { TheoremContextReference } from '@theoremharness/sdk'
import { THEOREM_WORKSPACE_PREFIX } from '@/lib/workspace/theorem-client'

/** The part of a note the person picked, with the text it covers. */
export type Excerpt = {
  /** How it is named, such as "selected paragraph". */
  part: string
  text: string
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

/** The references an ask about `excerpt` of the note at `path` carries. */
export function askReferences(
  note: { workspaceId: string; path: string; title: string; text: string },
  excerpt: Excerpt,
): TheoremContextReference[] {
  const resource = {
    kind: 'file' as const,
    workspaceId: resourceWorkspace(note.workspaceId),
    path: note.path,
  }
  return [
    {
      location: { resource },
      excerpt: excerpt.text,
      label: `${note.title} · ${excerpt.part}`,
    },
    { location: { resource }, excerpt: note.text, label: note.title },
  ]
}
