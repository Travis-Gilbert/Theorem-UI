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
  return selected?.source === snapshot.html &&
    (selected.selection.text ||
      selected.selection.rowId ||
      selected.selection.field)
    ? selected
    : undefined
}

export function appContextReference(
  snapshot: AppSnapshot,
  selected?: AppSelectionContext,
): TheoremContextReference {
  if (snapshot.pendingState) throw new Error(APP_PENDING_CONTEXT_MESSAGE)
  const context = selectionForSource(snapshot, selected)
  const text = context?.selection.text
  return {
    label: text ? `${snapshot.title}: ${text.slice(0, 60)}` : snapshot.title,
    location: {
      resource: {
        kind: 'graph-object',
        objectId: snapshot.documentId,
        objectType: 'theorem.app',
      },
      revision: String((context?.revision ?? snapshot.revision).position),
    },
    excerpt: context
      ? JSON.stringify({ selection: context.selection })
      : undefined,
  }
}
