import type { TheoremContextReference } from '@theoremharness/sdk'
import type { AppSelection } from '../blocks/sandbox/protocol'
import type { AppSnapshot } from './apps'

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
  if (!snapshot || snapshot.html !== source) return undefined
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
