import type { TheoremContextReference } from '@theoremharness/sdk'
import type { AppProblem } from '../blocks/app-source'
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

/** Whether a selection names anything: text, a row, a field, an entity or a notebook cell. */
const says = (selection: AppSelection) =>
  Boolean(
    selection.text ||
    selection.rowId ||
    selection.field ||
    selection.entityId ||
    selection.cellId,
  )

/**
 * A precise position in a notebook revision, as theorem-surface-contracts'
 * ArtifactLocator names one. The backend resolves an explicit locator
 * strictly and refuses the turn when it names nothing in the revision.
 */
type NotebookCellLocator = { kind: 'notebook_cell'; cellId: string }

/** The reference to one App revision, with the selection made in it. */
function revisionReference(
  app: { documentId: string; title: string },
  position: number | string | bigint,
  selection: (AppSelection & { locator?: NotebookCellLocator }) | undefined,
  label: string,
): TheoremContextReference {
  const named =
    selection?.entityLabel ||
    selection?.text.slice(0, 60) ||
    (selection?.cellId && `cell ${selection.cellId}`)
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

/**
 * A reference to one revision of a notebook artifact, with the cell, plotted
 * point or entity selected in it, so the next turn reads what the person
 * pointed at in the revision they saw. A notebook is an App document, so the
 * reference is the App's. The backend derives an entity or row locator from
 * the selection itself; a bare cell gets an explicit `notebook_cell` locator,
 * but only for a cell this revision is known to have (`cellIds`), since the
 * backend refuses the turn over one it does not.
 */
export function notebookReference(
  notebook: {
    documentId: string
    position: number | string | bigint
    title: string
    cellIds: ReadonlyArray<string>
  },
  selection?: AppSelection,
): TheoremContextReference {
  const selected = selection && says(selection) ? selection : undefined
  const cell =
    selected?.cellId &&
    !selected.entityId &&
    !selected.rowId &&
    notebook.cellIds.includes(selected.cellId)
      ? selected.cellId
      : undefined
  return revisionReference(
    notebook,
    notebook.position,
    cell
      ? { ...selected!, locator: { kind: 'notebook_cell', cellId: cell } }
      : selected,
    notebook.title,
  )
}

/** The room a repair's problems may take: a reference is refused past 8192 bytes. */
const MAX_REPAIR_BYTES = 6000
const MAX_PROBLEM_MESSAGE = 400

/**
 * "Ask to fix": the App revision that has problems, with what they are and
 * where, so the next turn repairs that revision's source. As many problems as
 * fit are sent, and the number left out.
 */
export function appRepairReference(
  snapshot: AppSnapshot,
  problems: ReadonlyArray<AppProblem>,
): TheoremContextReference {
  if (snapshot.pendingState) throw new Error(APP_PENDING_CONTEXT_MESSAGE)
  const sent: Array<AppProblem> = []
  let bytes = 0
  for (const problem of problems) {
    const clipped = {
      ...problem,
      message: problem.message.slice(0, MAX_PROBLEM_MESSAGE),
    }
    bytes += new TextEncoder().encode(JSON.stringify(clipped)).length + 1
    if (bytes > MAX_REPAIR_BYTES) break
    sent.push(clipped)
  }
  const omitted = problems.length - sent.length
  return {
    label: `${snapshot.title}: fix ${problems.length === 1 ? '1 problem' : `${problems.length} problems`}`,
    location: {
      resource: {
        kind: 'graph-object',
        objectId: snapshot.documentId,
        objectType: 'theorem.app',
      },
      revision: String(snapshot.revision.position),
    },
    excerpt: JSON.stringify({
      repair: { problems: sent, ...(omitted > 0 && { omitted }) },
    }),
  }
}
