// SOURCING: NoteEditor (Milkdown Crepe), ui/button, @tanstack/react-query via useNote and the Space cache
import { useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { useComposer, quoteRange } from '@/components/canvas/composer-state'
import { Icon } from '@/components/icons'
import { Button } from '@/components/ui/button'
import type { CanvasSource } from '@/lib/theorem/canvas-agent'
import type { Theorem } from '@/lib/theorem/client'
import { reloadNote, useNote, useNoteStatus } from '@/lib/theorem/notes'
import type { Note } from '@/lib/theorem/notes'
import { cn } from '@/lib/utils'
import { NoteEditor } from './note-editor'

const STATUS_LABEL = {
  saved: 'Saved',
  pending: 'Edited',
  saving: 'Saving…',
  conflict: 'Changed elsewhere',
  error: 'Not saved',
} as const

export function NoteStatus({ documentId }: { documentId: string }) {
  const status = useNoteStatus((s) => s.status[documentId] ?? 'saved')
  return (
    <span
      className={cn(
        'shrink-0 text-xs',
        status === 'conflict' || status === 'error'
          ? 'text-error-ink'
          : 'text-ink-faint',
      )}
    >
      {STATUS_LABEL[status]}
    </span>
  )
}

/** The placement of a note on any cached Space, for the composer's spaceContext. */
function placementOf(
  queryClient: ReturnType<typeof useQueryClient>,
  documentId: string,
) {
  for (const [, record] of queryClient.getQueriesData<Theorem.SpaceRecord>({
    queryKey: ['theorem', 'space'],
  })) {
    const placement = record?.space.placements?.find(
      (p) => p.target === 'object' && p.object.id === documentId,
    )
    if (placement) return placement.id
  }
  return undefined
}

/** A note source for the composer, narrowed to the selected text when there is one. */
export function noteSource(
  note: Note,
  placementId: string | undefined,
  quote: string | undefined,
): CanvasSource {
  const range = quote ? quoteRange(note.markdown, quote) : undefined
  return {
    documentId: note.documentId,
    title: note.title,
    markdown: note.markdown,
    placementId,
    selection:
      quote && range
        ? { quote, ...range, revision: String(note.revision.position) }
        : undefined,
  }
}

/** The caret's viewport point, where a slash-menu request opens the composer. */
export function caretPoint() {
  const selection = window.getSelection()
  const rect = selection?.rangeCount
    ? selection.getRangeAt(0).getBoundingClientRect()
    : undefined
  return { x: rect?.left ?? 0, y: rect?.bottom ?? 0 }
}

/** The text selected inside `container`, if any. */
export function selectedTextIn(container: Element): string | undefined {
  const selection = window.getSelection()
  if (!selection || selection.isCollapsed || !selection.rangeCount)
    return undefined
  const range = selection.getRangeAt(0)
  if (!container.contains(range.commonAncestorContainer)) return undefined
  return selection.toString().trim() || undefined
}

function Banner({ note }: { note: Note }) {
  const queryClient = useQueryClient()
  const status = useNoteStatus((s) => s.status[note.documentId])
  const [reloading, setReloading] = useState(false)
  if (status === 'conflict')
    return (
      <div className="flex items-center gap-2 border-b border-separator bg-error-container px-4 py-2 text-xs text-error-ink">
        <span className="me-auto">
          This note changed elsewhere and the edits could not be merged.
        </span>
        <Button
          variant="outline"
          size="xs"
          disabled={reloading}
          onClick={async () => {
            setReloading(true)
            await reloadNote(queryClient, note.documentId).finally(() =>
              setReloading(false),
            )
          }}
        >
          Load the latest
        </Button>
      </div>
    )
  if (!note.editable)
    return (
      <div className="border-b border-separator bg-frame px-4 py-2 text-xs text-ink-muted">
        Read only. This document has a block structure the Markdown editor would
        flatten, or Theorem marks it read-only.
      </div>
    )
  return null
}

/** A note at full size, for the dock panel and the phone overlay. */
export function NotePanel({
  documentId,
  onClose,
  className,
}: {
  documentId: string
  onClose?: () => void
  className?: string
}) {
  const queryClient = useQueryClient()
  const note = useNote(documentId)
  const openComposer = useComposer((s) => s.open)

  const ask = (anchor: { x: number; y: number }, quote?: string) => {
    if (!note.data) return
    openComposer({
      anchor,
      sources: [
        noteSource(note.data, placementOf(queryClient, documentId), quote),
      ],
    })
  }

  return (
    <div className={cn('flex h-full flex-col bg-artifact', className)}>
      <header className="flex h-10 shrink-0 items-center gap-2 border-b border-separator px-4">
        <Icon.Article className="size-4 shrink-0 text-ink-faint" />
        <h2 className="min-w-0 flex-1 truncate text-sm font-medium">
          {note.data?.title ?? 'Note'}
        </h2>
        <NoteStatus documentId={documentId} />
        {onClose && (
          <Button
            variant="ghost"
            size="icon-xs"
            aria-label="Close"
            onClick={onClose}
          >
            <Icon.Close />
          </Button>
        )}
      </header>
      {note.isPending ? (
        <p className="p-6 text-sm text-ink-muted">Loading note…</p>
      ) : note.isError ? (
        <p className="p-6 text-sm text-ink-muted">This note is unavailable.</p>
      ) : (
        <>
          <Banner note={note.data} />
          <div
            className="min-h-0 flex-1 overflow-y-auto"
            onContextMenu={(event) => {
              const quote = selectedTextIn(event.currentTarget)
              // Without a selection the browser's own menu stays.
              if (!quote) return
              event.preventDefault()
              ask({ x: event.clientX, y: event.clientY }, quote)
            }}
          >
            <NoteEditor
              note={note.data}
              onAsk={() => ask(caretPoint())}
              className="mx-auto max-w-3xl px-2 py-4"
            />
          </div>
        </>
      )}
    </div>
  )
}
