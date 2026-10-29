// SOURCING: @xyflow/react (custom node, NodeResizer, Handle, viewport store), NoteEditor (Milkdown Crepe), NoteExcerpt (react-markdown)
import { Handle, NodeResizer, Position, useStore } from '@xyflow/react'
import type { Node, NodeProps } from '@xyflow/react'
import { Icon } from '@/components/icons'
import { NoteEditor } from '@/components/notes/note-editor'
import { NoteExcerpt } from '@/components/notes/note-excerpt'
import {
  NoteStatus,
  caretPoint,
  noteSource,
} from '@/components/notes/note-panel'
import { useNoteView } from '@/components/notes/note-view'
import { useNote } from '@/lib/theorem/notes'
import { useComposer } from './composer-state'
import { EDIT_ZOOM } from './zoom'

export type NoteNodeData = { documentId: string }
export type NoteNode = Node<NoteNodeData, 'note'>

const SIDES = [Position.Top, Position.Right, Position.Bottom, Position.Left]

export function NoteNodeView({ id, data, selected }: NodeProps<NoteNode>) {
  const note = useNote(data.documentId)
  const editing = useStore((s) => s.transform[2] >= EDIT_ZOOM)
  const openComposer = useComposer((s) => s.open)

  return (
    <div
      className="flex h-full w-full flex-col overflow-hidden rounded-xl border border-separator bg-raised shadow-xs data-[selected=true]:border-focus"
      data-selected={selected}
    >
      <NodeResizer
        isVisible={selected}
        minWidth={220}
        minHeight={120}
        lineClassName="!border-focus"
        handleClassName="!size-2 !rounded-sm !border-focus !bg-raised"
      />
      {SIDES.map((side) => (
        <Handle
          key={side}
          id={side}
          type="source"
          position={side}
          className="!size-2.5 !border-separator !bg-raised opacity-0 transition-opacity group-hover/node:opacity-100 [.react-flow__node:hover_&]:opacity-100"
        />
      ))}
      <header className="flex h-8 shrink-0 cursor-grab items-center gap-1.5 border-b border-separator ps-3 pe-1 active:cursor-grabbing">
        <span className="min-w-0 flex-1 truncate text-xs font-medium text-ink">
          {note.data?.title ?? 'Note'}
        </span>
        <NoteStatus documentId={data.documentId} />
        <button
          type="button"
          aria-label="Open note"
          onClick={() => useNoteView.getState().open(data.documentId)}
          className="nodrag rounded-md p-1 text-ink-faint hover:bg-hover hover:text-ink"
        >
          <Icon.Expand className="size-3.5" />
        </button>
      </header>
      <div className="min-h-0 flex-1 overflow-y-auto">
        {note.isPending ? (
          <p className="p-3 text-xs text-ink-faint">Loading…</p>
        ) : note.isError ? (
          <p className="p-3 text-xs text-ink-muted">
            This note is unavailable.
          </p>
        ) : editing ? (
          // nodrag/nowheel/nopan hand pointer, wheel and pan gestures to the editor.
          <div className="nodrag nowheel nopan cursor-text">
            <NoteEditor
              note={note.data}
              onAsk={() =>
                openComposer({
                  anchor: caretPoint(),
                  sources: [noteSource(note.data, id, undefined)],
                })
              }
              className="theorem-note-card"
            />
          </div>
        ) : (
          <NoteExcerpt
            markdown={note.data.markdown}
            className="p-3 text-ink-muted"
          />
        )}
      </div>
    </div>
  )
}
