// SOURCING: @theoremharness/sdk TheoremContextReference (an artifact resource
// pinned to its revision) and the sandbox protocol's AppSelection, so a
// selection here reaches the next turn in the shape the HTML App path sends.
import type { OpenUIError } from '@openuidev/react-lang'
import type { TheoremContextReference } from '@theoremharness/sdk'
import type { AppSelection } from '@/lib/blocks/sandbox/protocol'

export type ArtifactRef = { artifactId: string; revision: string; title: string }

/** What a selection points at, in the contribution's locator kinds. */
export type Locator =
  | { kind: 'entity'; entityId: string }
  | { kind: 'table_rows'; rowIds: string[] }

export function locatorOf(selection: AppSelection): Locator | undefined {
  if (selection.rowId) return { kind: 'table_rows', rowIds: [selection.rowId] }
  if (selection.entityId)
    return { kind: 'entity', entityId: selection.entityId }
  return undefined
}

const location = ({ artifactId, revision }: ArtifactRef) => ({
  resource: { kind: 'artifact' as const, artifactId, revision },
  revision,
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
