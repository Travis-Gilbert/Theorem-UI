// SOURCING: @theoremharness/sdk TheoremContextReference (a graph-object
// resource pinned to its revision) and the sandbox protocol's AppSelection, so a
// selection here reaches the next turn in the shape the HTML App path sends
// (lib/theorem/app-references).
import type { OpenUIError } from '@openuidev/react-lang'
import type { TheoremContextReference } from '@theoremharness/sdk'
import type { AppSelection } from '@/lib/blocks/sandbox/protocol'

/**
 * The stored document revision a reference names: the part's
 * payload.documentId and payload.revision.position, not its chat artifact id.
 */
export type ArtifactRef = {
  documentId: string
  position: number | string
  title: string
}

/**
 * The host reads the selection itself as the locator: entityId (with
 * entityLabel) as an entity, otherwise rowId (with field) as table rows.
 */
const location = ({ documentId, position }: ArtifactRef) => ({
  resource: {
    kind: 'graph-object' as const,
    objectId: documentId,
    objectType: 'theorem.app',
  },
  revision: String(position),
})

/** "Ask about selection": the revision the person saw, and what they picked in it. */
export function selectionReference(
  artifact: ArtifactRef,
  selection: AppSelection,
): TheoremContextReference {
  const named = selection.entityLabel || selection.text.slice(0, 60)
  return {
    label: named ? `${artifact.title}: ${named}` : artifact.title,
    location: location(artifact),
    excerpt: JSON.stringify({ selection }),
  }
}

/** A problem with the program, in the form the next turn can act on. */
export type RepairProblem = Pick<
  OpenUIError,
  'message' | 'statementId' | 'hint'
> & {
  code:
    | OpenUIError['code']
    | 'library-id'
    | 'library-version'
    | 'incomplete'
    | 'unresolved'
}

export type RepairHint = {
  library: { id: string; version: string }
  problems: RepairProblem[]
}

/** "Ask to fix": the revision whose program failed, with what failed and how to fix it. */
export function repairReference(
  artifact: ArtifactRef,
  hint: RepairHint,
): TheoremContextReference {
  return {
    label: `${artifact.title}: fix the program`,
    location: location(artifact),
    excerpt: JSON.stringify({ repair: hint }),
  }
}
