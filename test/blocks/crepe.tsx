// Crepe set up as the Markdown handler's editor sets it up (Phase 3's
// markdown/editor.tsx): @milkdown/react's providers with
// @prosemirror-adapter/react's, the adapter's node view factory in the
// `theoremNodeViewFactory` slice, then the Markdown extensions.
import { Crepe } from '@milkdown/crepe'
import type { NodeViewConstructor } from '@milkdown/kit/prose/view'
import { $ctx } from '@milkdown/kit/utils'
import { Milkdown, MilkdownProvider, useEditor } from '@milkdown/react'
import {
  ProsemirrorAdapterProvider,
  useNodeViewFactory,
} from '@prosemirror-adapter/react'
import type { ReactNodeViewUserOptions } from '@prosemirror-adapter/react'
import type { FileViewProps, MarkdownExtension } from '@/lib/handlers/types'

/** Phase 3's slice, by the name live blocks look it up by. */
const nodeViewFactoryCtx = $ctx<
  ((options: ReactNodeViewUserOptions) => NodeViewConstructor) | null,
  'theoremNodeViewFactory'
>(null, 'theoremNodeViewFactory')

function CrepeFile({
  file,
  markdown,
  extensions,
  onCrepe,
}: {
  file: FileViewProps
  markdown: string
  extensions: Array<MarkdownExtension>
  onCrepe: (crepe: Crepe) => void
}) {
  const nodeViewFactory = useNodeViewFactory()
  useEditor((root) => {
    const crepe = new Crepe({ root, defaultValue: markdown })
    crepe.editor
      .config((ctx) => ctx.set(nodeViewFactoryCtx.key, nodeViewFactory))
      .use(nodeViewFactoryCtx)
    for (const extension of extensions) extension.extend(crepe, file)
    onCrepe(crepe)
    return crepe
  }, [])
  return <Milkdown />
}

/** A note's body in Crepe with `extensions`; `onCrepe` gets the editor. */
export function MarkdownEditor(props: {
  file: FileViewProps
  markdown: string
  extensions: Array<MarkdownExtension>
  onCrepe: (crepe: Crepe) => void
}) {
  return (
    <MilkdownProvider>
      <ProsemirrorAdapterProvider>
        <CrepeFile {...props} />
      </ProsemirrorAdapterProvider>
    </MilkdownProvider>
  )
}
