// SOURCING: @xyflow/react custom nodes, NodeResizer and parentId subflows (the
// grouping xyflow documents), with coss ui controls, and the notes' own Milkdown
// editor and reader, so a note here holds what a note anywhere holds. Notes and
// groups live in the layout, so they never reach validation or a program's content id.
import { NodeResizer, useReactFlow } from '@xyflow/react'
import { memo, useState } from 'react'
import type { NodeProps } from '@xyflow/react'
import { NoteMenuItems } from '@/components/canvas/note-kind-bar'
import type { BarAction } from '@/components/canvas/note-kind-bar'
import { Input } from '@/components/coss/input'
import {
  Menu,
  MenuItem,
  MenuPopup,
  MenuSeparator,
  MenuTrigger,
} from '@/components/coss/menu'
import {
  Tooltip,
  TooltipPopup,
  TooltipTrigger,
} from '@/components/coss/tooltip'
import { Icon } from '@/components/icons'
import { useBlockPickers } from '@/components/notes/kinds/pickers'
import { MarkdownBlocks } from '@/components/notes/note-editor'
import { NoteExcerpt } from '@/components/notes/note-excerpt'
import { Button } from '@/components/ui/button'
import type { GroupFlowNode, NoteFlowNode } from '@/lib/program/flow'
import { useProgramDoc } from '@/lib/program/store'
import { starterFor } from '@/lib/theorem/note-kinds'
import { cn } from '@/lib/utils'

/** Room for a block, which an empty note's small card doesn't give it. */
const HOLDING = { width: 400, height: 320 }

/** Starts a note holding something, at the free spot the header finds. */
export function AddNoteMenu({
  spot,
}: {
  spot: (size: typeof HOLDING) => { x: number; y: number }
}) {
  const addNote = useProgramDoc((doc) => doc.addNote)
  const flow = useReactFlow()
  const place = (text: string) => {
    const at = spot(HOLDING)
    addNote({ ...at, ...HOLDING, text })
    // The free spot can be past the fold, and a note added out of sight looks lost.
    void flow.setCenter(at.x + HOLDING.width / 2, at.y + HOLDING.height / 2, {
      zoom: flow.getZoom(),
      duration: 240,
    })
  }
  const pickers = useBlockPickers({
    onPicked: (picked) => place(picked.markdown),
  })
  const act = (action: BarAction) => {
    if (action.type === 'kind') place(starterFor(action.kind))
    if (action.type === 'request') pickers.request(action.request)
  }
  return (
    <>
      <Menu>
        <Tooltip>
          <TooltipTrigger
            render={
              <MenuTrigger
                render={
                  <Button
                    size="icon-sm"
                    variant="outline"
                    aria-label="Add a note holding…"
                  />
                }
              />
            }
          >
            <Icon.ChevronDown className="size-3.5" />
          </TooltipTrigger>
          <TooltipPopup>Add a note holding…</TooltipPopup>
        </Tooltip>
        <MenuPopup align="end">
          <NoteMenuItems onAction={act} />
          <MenuSeparator />
          <MenuItem onClick={() => pickers.request('media')}>
            <Icon.Image />
            Image, audio, video or PDF…
          </MenuItem>
          <MenuItem onClick={() => pickers.request('link')}>
            <Icon.Web />
            Link…
          </MenuItem>
        </MenuPopup>
      </Menu>
      {pickers.element}
      {pickers.uploading && (
        <span className="ms-2 self-center text-xs text-ink-muted">
          Uploading {pickers.uploading}…
        </span>
      )}
      {pickers.error && (
        <span className="ms-2 self-center text-xs text-error-ink">
          {pickers.error}
        </span>
      )}
    </>
  )
}

export const NoteNodeView = memo(function NoteNodeView({
  data,
  selected,
}: NodeProps<NoteFlowNode>) {
  const patchNote = useProgramDoc((doc) => doc.patchNote)
  const [typing, setTyping] = useState(false)
  if (typing && !selected) setTyping(false)
  // An empty note has nothing to read, so selecting it is enough to write in it.
  const writing = typing || (selected && !data.note.text)
  return (
    <div
      className="size-full overflow-hidden rounded-lg border border-separator bg-artifact"
      onDoubleClick={() => setTyping(true)}
    >
      <NodeResizer isVisible={selected} minWidth={140} minHeight={64} />
      {writing ? (
        // These classes hand pointer, wheel, pan and key gestures to the editor.
        <div
          className="nodrag nowheel nopan nokey size-full cursor-text overflow-y-auto"
          onKeyDown={(event) => {
            if (
              event.key === 'Escape' &&
              !document.querySelector('.milkdown-slash-menu[data-show="true"]')
            )
              setTyping(false)
          }}
        >
          <MarkdownBlocks
            markdown={data.note.text}
            autoFocus
            onChange={(text) => patchNote(data.note.id, { text })}
            className="theorem-note-card"
          />
        </div>
      ) : data.note.text ? (
        <div
          className={cn(
            'size-full',
            selected ? 'nowheel overflow-y-auto' : 'pointer-events-none',
          )}
        >
          <NoteExcerpt live markdown={data.note.text} className="p-3" />
        </div>
      ) : (
        <p className="p-3 text-sm text-ink-faint">Note</p>
      )}
    </div>
  )
})

export const GroupNodeView = memo(function GroupNodeView({
  data,
  selected,
}: NodeProps<GroupFlowNode>) {
  const patchGroup = useProgramDoc((doc) => doc.patchGroup)
  const ungroup = useProgramDoc((doc) => doc.ungroup)
  return (
    <div className="size-full rounded-xl border border-separator bg-ink/5">
      <NodeResizer isVisible={selected} minWidth={200} minHeight={120} />
      <header className="flex h-10 items-center gap-1 px-3">
        <Input
          unstyled
          aria-label="Group label"
          className="nodrag min-w-0 flex-1 [&_input]:text-sm [&_input]:font-medium"
          value={data.group.label}
          onChange={(event) =>
            patchGroup(data.group.id, { label: event.target.value })
          }
        />
        <Button
          size="icon-xs"
          variant="ghost"
          aria-label="Ungroup"
          title="Ungroup"
          className="nodrag"
          onClick={() => ungroup(data.group.id)}
        >
          <Icon.Close className="size-3.5" />
        </Button>
      </header>
    </div>
  )
})
