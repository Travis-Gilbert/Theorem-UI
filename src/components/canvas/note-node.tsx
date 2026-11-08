// SOURCING: @xyflow/react custom node, NoteEditor (Milkdown Crepe), NoteExcerpt (react-markdown), the kinds' blocks, MermaidDiagram
//
// A card is a note, and what the note holds decides what the card looks like:
// a file, a link or a diagram alone is that thing, and anything else is text.
// One card at a time has an editor, so a canvas of many stays light.
import { useStore } from '@xyflow/react'
import type { Node, NodeProps } from '@xyflow/react'
import { useMemo } from 'react'
import { MermaidDiagram } from '@/components/assistant-ui/elements/mermaid-diagram'
import { Icon } from '@/components/icons'
import { EmbedBlock, NoteImage } from '@/components/notes/kinds/embed-block'
import { NoteEditor } from '@/components/notes/note-editor'
import { NoteExcerpt } from '@/components/notes/note-excerpt'
import {
  NoteStatus,
  caretPoint,
  noteSource,
} from '@/components/notes/note-panel'
import { useNoteView } from '@/components/notes/note-view'
import { noteShape } from '@/lib/theorem/note-kinds'
import { useNote } from '@/lib/theorem/notes'
import { cn } from '@/lib/utils'
import { useCanvasView } from './canvas-view'
import { useComposer } from './composer-state'
import { NODE_BOX, NodeChrome } from './node-chrome'
import { EDIT_ZOOM } from './zoom'

export type NoteNodeData = { documentId: string }
export type NoteNode = Node<NoteNodeData, 'note'>

export function NoteNodeView({ id, data, selected }: NodeProps<NoteNode>) {
  const note = useNote(data.documentId)
  const editing = useCanvasView((s) => s.editing === id)
  const openComposer = useComposer((s) => s.open)
  const zoomedOut = useStore((s) => s.transform[2] < EDIT_ZOOM)
  const markdown = note.data?.markdown
  const shape = useMemo(
    () => (markdown === undefined ? undefined : noteShape(markdown)),
    [markdown],
  )

  const body = () => {
    if (note.isPending) return <Message>Loading…</Message>
    if (note.isError || !shape) return <Message>This note is unavailable.</Message>
    if (editing)
      return (
        // These classes hand pointer, wheel, pan and key gestures to the editor.
        <div
          className={cn(
            NODE_BOX,
            'nodrag nowheel nopan nokey cursor-text overflow-y-auto',
          )}
        >
          <NoteEditor
            note={note.data}
            autoFocus
            onAsk={() =>
              openComposer({
                anchor: caretPoint(),
                sources: [noteSource(note.data, id, undefined)],
              })
            }
            className="theorem-note-card"
          />
        </div>
      )
    const { body: held } = shape
    // Until a card is selected a click selects it and a drag moves it; after
    // that, what it holds takes the pointer, and it moves by its title.
    const live = selected ? 'nodrag nowheel nopan' : 'pointer-events-none'
    if (held.type === 'embed')
      return (
        <div
          className={cn(
            'size-full overflow-hidden rounded-xl shadow-xs',
            live,
            selected && 'outline-2 outline-focus',
          )}
        >
          <EmbedBlock embed={held.embed} fill preview={zoomedOut} />
        </div>
      )
    if (held.type === 'image')
      return (
        <div className={cn(NODE_BOX, 'pointer-events-none')}>
          <NoteImage
            src={held.url}
            alt={held.alt}
            className="size-full object-contain"
          />
        </div>
      )
    if (held.type === 'diagram')
      return (
        <div className={cn(NODE_BOX, 'overflow-auto p-2', live)}>
          <MermaidDiagram code={held.code} className="bg-transparent p-0" />
        </div>
      )
    return (
      <div
        className={cn(
          NODE_BOX,
          selected ? 'nowheel overflow-y-auto' : 'pointer-events-none',
        )}
      >
        <NoteExcerpt live markdown={shape.markdown} className="p-3" />
      </div>
    )
  }

  return (
    <NodeChrome
      id={id}
      selected={selected}
      title={shape?.title}
      actions={
        <>
          <NoteStatus documentId={data.documentId} />
          <button
            type="button"
            aria-label="Open note"
            title="Open note"
            onClick={() => useNoteView.getState().open(data.documentId)}
            className="nodrag rounded-sm p-0.5 text-ink-faint hover:bg-hover hover:text-ink"
          >
            <Icon.Expand className="size-3.5" />
          </button>
        </>
      }
    >
      {body()}
    </NodeChrome>
  )
}

function Message({ children }: { children: string }) {
  return (
    <div className={NODE_BOX}>
      <p className="p-3 text-xs text-ink-muted">{children}</p>
    </div>
  )
}
