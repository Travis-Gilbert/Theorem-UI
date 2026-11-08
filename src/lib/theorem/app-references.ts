import type { TheoremContextReference } from '@theoremharness/sdk'
import type { AppSelection } from '../blocks/sandbox/protocol'
import type { AppSnapshot } from './apps'

export const APP_PENDING_CONTEXT_MESSAGE =
  'Save the App changes before asking about them. If saving failed, choose Retry save, then select the content again.'

export type AppSelectionContext = {
  selection: AppSelection
  source: string
  revision: AppSnapshot['revision']
}

export function captureAppSelection(
  source: string,
  snapshot: AppSnapshot | null,
  selection: AppSelection,
): AppSelectionContext | undefined {
  if (!snapshot || snapshot.pendingState || snapshot.html !== source)
    return undefined
  return { source, revision: snapshot.revision, selection }
}

export function selectionForSource(
  snapshot: AppSnapshot,
  selected?: AppSelectionContext,
) {
  return selected?.source === snapshot.html && says(selected.selection)
    ? selected
    : undefined
}

/** Whether a selection names anything: text, a row, a field, or an entity. */
const says = (selection: AppSelection) =>
  Boolean(
    selection.text || selection.rowId || selection.field || selection.entityId,
  )

/** The reference to one App revision, with the selection made in it. */
function revisionReference(
  app: { documentId: string; title: string },
  position: number | string | bigint,
  selection: AppSelection | undefined,
  label: string,
): TheoremContextReference {
  const named = selection?.entityLabel || selection?.text.slice(0, 60)
  return {
    label: named ? `${label}: ${named}` : label,
    location: {
      resource: {
        kind: 'graph-object',
        objectId: app.documentId,
        objectType: 'theorem.app',
      },
      revision: String(position),
    },
    excerpt: selection ? JSON.stringify({ selection }) : undefined,
  }
}

/**
 * A reference to a revision a message pinned, as shown outside its live
 * document. It names that revision, so the next turn reads what the person
 * saw rather than whatever the App holds now.
 */
export function pinnedAppReference(
  app: {
    documentId: string
    title: string
    position: number | string | bigint
  },
  selection?: AppSelection,
): TheoremContextReference {
  return revisionReference(
    app,
    app.position,
    selection && says(selection) ? selection : undefined,
    `${app.title} (revision ${String(app.position)})`,
  )
}

export function appContextReference(
  snapshot: AppSnapshot,
  selected?: AppSelectionContext,
): TheoremContextReference {
  if (snapshot.pendingState) throw new Error(APP_PENDING_CONTEXT_MESSAGE)
  const context = selectionForSource(snapshot, selected)
  return revisionReference(
    snapshot,
    (context?.revision ?? snapshot.revision).position,
    context?.selection,
    snapshot.title,
  )
}
