// SOURCING: @milkdown/crepe (block handles, slash menu, toolbar, tables, CodeMirror code blocks, LaTeX, image blocks with upload) via @milkdown/react and the shared Markdown round trip in crepe-markdown, @prosemirror-adapter/react for theorem-embed blocks as React node views, Crepe code-block renderPreview for Mermaid (beautiful-mermaid) and data fences (react-dom/server static markup)
import { Crepe } from '@milkdown/crepe'
import '@milkdown/crepe/theme/common/style.css'
import { commandsCtx, editorViewCtx } from '@milkdown/kit/core'
import { clearTextInCurrentBlockCommand } from '@milkdown/kit/preset/commonmark'
import { Selection } from '@milkdown/kit/prose/state'
import { insert } from '@milkdown/kit/utils'
import { Milkdown, MilkdownProvider } from '@milkdown/react'
import {
  ProsemirrorAdapterProvider,
  useNodeViewFactory,
} from '@prosemirror-adapter/react'
import { useQueryClient } from '@tanstack/react-query'
import { useEffect, useLayoutEffect, useRef } from 'react'
import type { ComponentType } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import askIcon from '@/assets/icons/rail/noun-chat-52762.svg?raw'
import { renderMermaidSvg } from '@/components/assistant-ui/elements/mermaid-diagram'
import { nodeViewFactoryCtx } from '@/components/handlers/markdown/syntax'
import { Icon } from '@/components/icons'
import { useActiveProject } from '@/components/shell/projects'
import { blockFor } from '@/lib/theorem/note-kinds'
import type { NoteKind } from '@/lib/theorem/note-kinds'
import { editNote, onLeavePage } from '@/lib/theorem/notes'
import type { Note } from '@/lib/theorem/notes'
import {
  isUploadPath,
  readUpload,
  retainUpload,
  uploadContentPath,
} from '@/lib/theorem/uploads'
import { uploadFile } from '@/lib/theorem/imports'
import { cn } from '@/lib/utils'
import { useCrepeMarkdown } from './crepe-markdown'
import { remarkTheoremBlocks, theoremBlockNode } from './kinds/block-syntax'
import { theoremBlockView } from './kinds/block-view'
import { DataTable } from './kinds/embed-block'
import { useBlockPickers } from './kinds/pickers'
import type { BlockRequest } from './kinds/pickers'
import { EMBED_ATTR } from './note-excerpt'
import { useNoteView } from './note-view'

type Callbacks = {
  /** "Ask Theorem" from the slash menu. */
  onAsk?: () => void
  /** Something the slash menu needs a picker for. */
  onRequest: (request: BlockRequest) => void
  /** A block the slash menu writes as it is. */
  onKind: (kind: NoteKind) => void
  /** Where an image goes, read when a person picks one. */
  projectId?: string
}

/** Mermaid and data fences show as what they draw; their source stays a click away. */
function fencePreview(
  language: string,
  content: string,
  applyPreview: (value: string) => void,
) {
  const fence = language.toLowerCase()
  if (fence === 'csv')
    return renderToStaticMarkup(<DataTable csv={content} />)
  if (fence === 'mermaid') {
    renderMermaidSvg(content).then(applyPreview, () =>
      applyPreview('<p>This diagram has an error in it.</p>'),
    )
    // Undefined marks the preview as asynchronous.
    return undefined
  }
  return null
}

const iconMarkup = (Mark: ComponentType) => renderToStaticMarkup(<Mark />)

const MENU: ReadonlyArray<{
  key: string
  label: string
  icon: () => string
  run: (callbacks: Callbacks) => void
}> = [
  {
    key: 'embed-note',
    label: 'Embed note',
    icon: () => iconMarkup(Icon.Article),
    run: (c) => c.onRequest('note'),
  },
  {
    key: 'media',
    label: 'Audio, video or PDF',
    icon: () => iconMarkup(Icon.Video),
    run: (c) => c.onRequest('media'),
  },
  {
    key: 'link',
    label: 'Link',
    icon: () => iconMarkup(Icon.Web),
    run: (c) => c.onRequest('link'),
  },
  {
    key: 'thread',
    label: 'Conversation',
    icon: () => askIcon,
    run: (c) => c.onRequest('thread'),
  },
  {
    key: 'artifact',
    label: 'App or artifact',
    icon: () => iconMarkup(Icon.Artifact),
    run: (c) => c.onRequest('artifact'),
  },
  {
    key: 'diagram',
    label: 'Diagram',
    icon: () => iconMarkup(Icon.Diagram),
    run: (c) => c.onKind('diagram'),
  },
  {
    key: 'data',
    label: 'Data',
    icon: () => iconMarkup(Icon.Table),
    run: (c) => c.onKind('data'),
  },
  {
    key: 'json',
    label: 'JSON',
    icon: () => iconMarkup(Icon.Json),
    run: (c) => c.onKind('json'),
  },
]

function CrepeEditor({
  markdown,
  editable,
  autoFocus,
  onChange,
  callbacks,
  onInsertReady,
  onFlushReady,
}: {
  markdown: string
  editable: boolean
  autoFocus?: boolean
  onChange: (markdown: string) => void
  callbacks: React.RefObject<Callbacks>
  onInsertReady: (insertMarkdown: (markdown: string) => void) => void
  onFlushReady: (flush: () => void) => void
}) {
  const nodeViewFactory = useNodeViewFactory()
  const crepeRef = useRef<Crepe>(undefined)
  const images = useRef(new Set<string>())

  useEffect(() => {
    const urls = images.current
    return () => {
      for (const url of urls) URL.revokeObjectURL(url)
      urls.clear()
    }
  }, [])

  const { flush } = useCrepeMarkdown({
    markdown,
    onChange,
    build: (root, editor) => {
      const crepe = new Crepe({
        root,
        defaultValue: editor.markdown,
        featureConfigs: {
          [Crepe.Feature.Placeholder]: {
            text: 'Type / for blocks',
            mode: 'block',
          },
          [Crepe.Feature.CodeMirror]: {
            renderPreview: fencePreview,
            previewOnlyByDefault: true,
          },
          [Crepe.Feature.ImageBlock]: {
            onUpload: async (file) => {
              const { projectId } = callbacks.current
              if (!projectId)
                throw new Error('Pick a project before adding images.')
              const { uploadId } = await uploadFile(projectId, file)
              await retainUpload(uploadId)
              return uploadContentPath(uploadId)
            },
            proxyDomURL: async (url) => {
              if (!isUploadPath(url)) return url
              const blob = URL.createObjectURL(await readUpload(url))
              images.current.add(blob)
              return blob
            },
          },
          [Crepe.Feature.BlockEdit]: {
            buildMenu: (builder) => {
              const group = builder.addGroup('theorem', 'Theorem')
              for (const item of MENU)
                group.addItem(item.key, {
                  label: item.label,
                  icon: item.icon(),
                  onRun: (ctx) => {
                    ctx
                      .get(commandsCtx)
                      .call(clearTextInCurrentBlockCommand.key)
                    item.run(callbacks.current)
                  },
                })
              if (callbacks.current.onAsk)
                group.addItem('ask-theorem', {
                  label: 'Ask Theorem',
                  icon: askIcon,
                  onRun: (ctx) => {
                    ctx
                      .get(commandsCtx)
                      .call(clearTextInCurrentBlockCommand.key)
                    // Flush the editor's text before the action captures its source.
                    editor.flush()
                    callbacks.current.onAsk?.()
                  },
                })
            },
          },
        },
      })
      crepe.editor
        .config((ctx) => ctx.set(nodeViewFactoryCtx.key, nodeViewFactory))
        .use(nodeViewFactoryCtx)
        .use(remarkTheoremBlocks)
        .use(theoremBlockNode)
        .use(theoremBlockView)
      crepeRef.current = crepe
      if (autoFocus)
        crepe.on((listener) =>
          listener.mounted((ctx) => {
            // Ready to type where the note ends.
            const view = ctx.get(editorViewCtx)
            view.dispatch(
              view.state.tr.setSelection(Selection.atEnd(view.state.doc)),
            )
            view.focus()
          }),
        )
      onInsertReady((next) => crepe.editor.action(insert(next)))
      onFlushReady(editor.flush)
      return crepe
    },
  })

  useEffect(() => {
    crepeRef.current?.setReadonly(!editable)
  }, [editable])

  // Leaving the page skips the editor's destroy, so it hands over its last
  // text before the saves are flushed.
  useEffect(() => onLeavePage(flush))

  return <Milkdown />
}

/**
 * Markdown in Crepe, with everything a note can hold. Locked when not
 * `editable`. `onAsk` adds "Ask Theorem" to the slash menu, and `exclude` leaves
 * a note out of what can be embedded.
 */
export function MarkdownBlocks({
  markdown,
  editable = true,
  autoFocus,
  onChange,
  onAsk,
  exclude,
  className,
}: {
  markdown: string
  editable?: boolean
  autoFocus?: boolean
  onChange: (markdown: string) => void
  onAsk?: () => void
  exclude?: string
  className?: string
}) {
  const { project } = useActiveProject()
  const insertRef = useRef<(markdown: string) => void>(undefined)
  const flushRef = useRef<() => void>(() => undefined)
  const pickers = useBlockPickers({
    excludeNote: exclude,
    onPicked: (picked) => insertRef.current?.(picked.markdown),
  })
  const callbacks = useRef<Callbacks>({
    onAsk,
    onRequest: pickers.request,
    onKind: (kind) => insertRef.current?.(blockFor(kind)),
    projectId: project?.projectId,
  })
  // The slash menu is built once; it reads the latest callbacks when it runs.
  useLayoutEffect(() => {
    callbacks.current = {
      onAsk,
      onRequest: pickers.request,
      onKind: (kind) => insertRef.current?.(blockFor(kind)),
      projectId: project?.projectId,
    }
  })

  return (
    <div
      className={cn('theorem-note', className)}
      onContextMenu={() => flushRef.current()}
      onBlurCapture={() => flushRef.current()}
      onClick={(event) => {
        const embed = (event.target as Element).closest(`[${EMBED_ATTR}]`)
        const documentId = embed?.getAttribute(EMBED_ATTR)
        if (documentId) useNoteView.getState().open(documentId)
      }}
    >
      <MilkdownProvider>
        <ProsemirrorAdapterProvider>
          <CrepeEditor
            markdown={markdown}
            editable={editable}
            autoFocus={autoFocus}
            onChange={onChange}
            callbacks={callbacks}
            onInsertReady={(fn) => (insertRef.current = fn)}
            onFlushReady={(fn) => (flushRef.current = fn)}
          />
        </ProsemirrorAdapterProvider>
      </MilkdownProvider>
      {pickers.uploading && (
        <p className="px-3 py-1 text-xs text-ink-muted">
          Uploading {pickers.uploading}…
        </p>
      )}
      {pickers.error && (
        <p className="px-3 py-1 text-xs text-error-ink">{pickers.error}</p>
      )}
      {pickers.element}
    </div>
  )
}

/** A note's Markdown in Crepe. Read-only notes still render; their editor is locked. */
export function NoteEditor({
  note,
  autoFocus,
  onAsk,
  className,
}: {
  note: Note
  autoFocus?: boolean
  onAsk?: () => void
  className?: string
}) {
  const queryClient = useQueryClient()
  return (
    <MarkdownBlocks
      markdown={note.markdown}
      editable={note.editable}
      autoFocus={autoFocus}
      onChange={(markdown) => editNote(queryClient, note.documentId, markdown)}
      onAsk={onAsk}
      exclude={note.documentId}
      className={className}
    />
  )
}
