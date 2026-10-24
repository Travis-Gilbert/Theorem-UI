// SOURCING: hand-roll — a list of the Space's note cards wired to the canvas handle; the rows reuse the thread list's row styling, @tanstack/react-query via useSpace and useNote
import { useMemo } from 'react'
import { Icon } from '@/components/icons'
import { useNoteView } from '@/components/notes/note-view'
import { useNote } from '@/lib/theorem/notes'
import { isNotePlacement, useSpace } from '@/lib/theorem/spaces'
import type { NotePlacement } from '@/lib/theorem/spaces'
import { useCanvasView } from './canvas-view'

const open = (documentId: string) => useNoteView.getState().open(documentId)

function NoteRow({ placement }: { placement: NotePlacement }) {
  const documentId = placement.object.id
  const note = useNote(documentId)
  const title =
    note.data?.title ?? (note.isError ? 'Unavailable note' : 'Loading…')

  return (
    <li className="group relative flex h-7 items-center gap-1 rounded-md ps-2 pe-1 text-sm transition-colors duration-100 has-focus-visible:bg-hover hover:bg-hover">
      <button
        type="button"
        // Focus the card; with no canvas mounted, open the note instead.
        onClick={() =>
          useCanvasView.getState().focus(placement.id) || open(documentId)
        }
        onDoubleClick={() => open(documentId)}
        className="min-w-0 flex-1 truncate text-start outline-none before:absolute before:inset-0 before:rounded-md focus-visible:before:outline-2 focus-visible:before:-outline-offset-2 focus-visible:before:outline-focus"
      >
        {title}
      </button>
      <button
        type="button"
        aria-label={`Open ${title}`}
        onClick={() => open(documentId)}
        // Touch screens have no hover, so the button stays visible there.
        className="relative flex size-5 shrink-0 items-center justify-center rounded-sm text-ink-faint opacity-0 outline-none group-hover:opacity-100 hover:bg-selected hover:text-ink focus-visible:opacity-100 focus-visible:outline-2 focus-visible:outline-focus pointer-coarse:opacity-100"
      >
        <Icon.Expand className="size-3.5" />
      </button>
    </li>
  )
}

/** The notes on a project's canvas, in reading order: top to bottom, then left to right. */
export function SpaceNotes({
  projectId,
  title,
}: {
  projectId: string
  title: string
}) {
  const space = useSpace(projectId, title)
  const placements = useMemo(
    () =>
      (space.data?.space.placements ?? [])
        .filter(isNotePlacement)
        .sort((a, b) => a.rect.y - b.rect.y || a.rect.x - b.rect.x),
    [space.data],
  )

  if (space.isPending)
    return <p className="px-2 py-4 text-sm text-ink-faint-sheet">Loading…</p>
  if (space.isError)
    return (
      <p className="px-2 py-4 text-sm text-ink-faint-sheet">
        The notes could not load.
      </p>
    )
  if (!placements.length)
    return (
      <p className="px-2 py-4 text-sm text-ink-faint-sheet">
        No notes on the canvas yet.
      </p>
    )
  return (
    <ul className="flex flex-col">
      {placements.map((placement) => (
        <NoteRow key={placement.id} placement={placement} />
      ))}
    </ul>
  )
}
