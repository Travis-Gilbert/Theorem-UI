// SOURCING: @prosemirror-adapter/react through Milkdown's $view, the same way handlers/markdown/views mounts wiki embeds, so each block keeps React's context inside the editor.
import { $view } from '@milkdown/kit/utils'
import { useNodeViewContext } from '@prosemirror-adapter/react'
import { nodeViewFactoryCtx } from '@/components/handlers/markdown/syntax'
import { parseEmbed } from '@/lib/theorem/embeds'
import type { EmbedRef } from '@/lib/theorem/embeds'
import { useNote } from '@/lib/theorem/notes'
import { EmbedCard } from '../note-excerpt'
import { theoremBlockNode } from './block-syntax'
import { BLOCK_CONTROLS, EmbedBlock } from './embed-block'

function NoteBlock({ embed }: { embed: EmbedRef }) {
  const note = useNote(embed.id)
  return (
    <div className="theorem-embed">
      <EmbedCard
        documentId={embed.id}
        title={note.data?.title ?? embed.title ?? 'Note'}
        markdown={note.data?.markdown}
      />
    </div>
  )
}

function BlockView() {
  const { node, selected } = useNodeViewContext()
  const embed = parseEmbed(String(node.attrs.ref))
  if (!embed) return null
  return (
    <div
      contentEditable={false}
      data-selected={selected}
      // A note can open with a block selected, so the ring waits for focus.
      className="theorem-block my-2 rounded-lg [.ProseMirror-focused_&]:data-[selected=true]:outline-2 [.ProseMirror-focused_&]:data-[selected=true]:outline-focus"
    >
      {embed.kind === 'document' ? (
        <NoteBlock embed={embed} />
      ) : (
        <EmbedBlock embed={embed} />
      )}
    </div>
  )
}

const inControls = (event: Event) =>
  event.target instanceof Element &&
  event.target.closest(`[${BLOCK_CONTROLS}], .theorem-embed`) !== null

export const theoremBlockView = $view(theoremBlockNode, (ctx) => {
  const create = ctx.get(nodeViewFactoryCtx.key)
  if (!create) throw new Error('The note editor sets nodeViewFactoryCtx.')
  return create({
    component: BlockView,
    stopEvent: inControls,
    ignoreMutation: () => true,
  })
})
