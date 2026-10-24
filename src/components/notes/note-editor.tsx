// SOURCING: @milkdown/crepe (block handles, slash menu, toolbar, tables, CodeMirror code blocks, LaTeX) via @milkdown/react, Crepe code-block renderPreview for theorem-embed cards (react-dom/server static markup)
//
// The editor reads and writes the note's shared cache entry. Its own edits go
// out through editNote; a change that arrives from elsewhere (the other view
// of this note, a merge after a stale save) replaces the document. The last
// Markdown this editor serialized tells the two apart, since Milkdown's
// markdownUpdated listener is debounced.
import { Crepe } from '@milkdown/crepe'
import '@milkdown/crepe/theme/common/style.css'
import { commandsCtx, editorViewCtx, serializerCtx } from '@milkdown/kit/core'
import { clearTextInCurrentBlockCommand } from '@milkdown/kit/preset/commonmark'
import type { Serializer } from '@milkdown/kit/transformer'
import { getMarkdown, insert, replaceAll } from '@milkdown/kit/utils'
import { Milkdown, MilkdownProvider, useEditor } from '@milkdown/react'
import { useQueryClient } from '@tanstack/react-query'
import type { QueryClient } from '@tanstack/react-query'
import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import askIcon from '@/assets/icons/rail/noun-chat-52762.svg?raw'
import embedIcon from '@/assets/icons/records/noun-article-8259879.svg?raw'
import { EMBED_LANGUAGE, embedFence, parseEmbed } from '@/lib/theorem/embeds'
import { editNote, fetchNote, noteKey, onLeavePage } from '@/lib/theorem/notes'
import type { Note } from '@/lib/theorem/notes'
import { cn } from '@/lib/utils'
import { EMBED_ATTR, EmbedCard } from './note-excerpt'
import { NotePicker } from './note-picker'
import { useNoteView } from './note-view'

type Callbacks = {
  /** "Ask Theorem" from the slash menu. */
  onAsk?: () => void
  /** "Embed note" from the slash menu. */
  onEmbed: () => void
}

/**
 * theorem-embed fences render as cards. Crepe sanitizes a preview into
 * static HTML, so the card is rendered to markup once the note is loaded.
 */
function embedPreview(queryClient: QueryClient) {
  return (
    language: string,
    content: string,
    applyPreview: (value: string) => void,
  ) => {
    if (language !== EMBED_LANGUAGE) return null
    const ref = parseEmbed(content)
    if (!ref || ref.kind !== 'document') return null
    const card = (note: Note | undefined) =>
      `<div class="theorem-embed">${renderToStaticMarkup(
        <EmbedCard
          documentId={ref.id}
          title={note?.title ?? ref.title ?? 'Note'}
          markdown={note?.markdown}
        />,
      )}</div>`
    queryClient
      .ensureQueryData({
        queryKey: noteKey(ref.id),
        queryFn: () => fetchNote(ref.id),
      })
      .then(card, () => card(undefined))
      .then(applyPreview)
    // Undefined marks the preview as asynchronous.
    return undefined
  }
}

function CrepeEditor({
  note,
  callbacks,
  onInsertReady,
}: {
  note: Note
  callbacks: React.RefObject<Callbacks>
  onInsertReady: (insertMarkdown: (markdown: string) => void) => void
}) {
  const queryClient = useQueryClient()
  const { documentId } = note
  /** The Markdown this editor last showed or serialized. */
  const shown = useRef(note.markdown)
  const crepeRef = useRef<Crepe>(undefined)
  /** Hands the editor's text to the save queue when it is a new edit. */
  const report = (markdown: string) => {
    if (markdown === shown.current) return
    shown.current = markdown
    editNote(queryClient, documentId, markdown)
  }

  const { get } = useEditor((root) => {
    const crepe = new Crepe({
      root,
      defaultValue: note.markdown,
      featureConfigs: {
        [Crepe.Feature.Placeholder]: {
          text: 'Type / for blocks',
          mode: 'block',
        },
        [Crepe.Feature.CodeMirror]: {
          renderPreview: embedPreview(queryClient),
          previewOnlyByDefault: true,
        },
        [Crepe.Feature.BlockEdit]: {
          buildMenu: (builder) => {
            const group = builder.addGroup('theorem', 'Theorem')
            group.addItem('embed-note', {
              label: 'Embed note',
              icon: embedIcon,
              onRun: (ctx) => {
                ctx.get(commandsCtx).call(clearTextInCurrentBlockCommand.key)
                callbacks.current.onEmbed()
              },
            })
            if (callbacks.current.onAsk)
              group.addItem('ask-theorem', {
                label: 'Ask Theorem',
                icon: askIcon,
                onRun: (ctx) => {
                  ctx.get(commandsCtx).call(clearTextInCurrentBlockCommand.key)
                  callbacks.current.onAsk?.()
                },
              })
          },
        },
      },
    })
    crepeRef.current = crepe
    crepe.on((listener) => {
      // Milkdown removes the serializer before it closes the view, so the
      // destroy handler below keeps its own.
      let serialize: Serializer | undefined
      // Normalization on load is not an edit; remember the editor's own form.
      listener.mounted((ctx) => {
        serialize = ctx.get(serializerCtx)
        shown.current = crepe.getMarkdown()
      })
      listener.markdownUpdated((_ctx, markdown) => report(markdown))
      // markdownUpdated waits 200ms and is dropped when the editor closes, so
      // a closing editor hands over its last text itself.
      listener.destroy((ctx) => {
        if (serialize) report(serialize(ctx.get(editorViewCtx).state.doc))
      })
    })
    onInsertReady((markdown) => crepe.editor.action(insert(markdown)))
    return crepe
  }, [])

  useEffect(() => {
    crepeRef.current?.setReadonly(!note.editable)
  }, [note.editable])

  // Leaving the page skips the destroy above, so the editor hands over its
  // last text before the saves are flushed.
  useEffect(() =>
    onLeavePage(() => {
      const markdown = get()?.action(getMarkdown())
      if (markdown !== undefined) report(markdown)
    }),
  )

  // A change from elsewhere replaces the document.
  useEffect(() => {
    if (note.markdown === shown.current) return
    const editor = get()
    if (!editor) return
    editor.action(replaceAll(note.markdown))
    shown.current = note.markdown
  }, [get, note.markdown])

  return <Milkdown />
}

/**
 * A note's Markdown in Crepe. Read-only notes still render; their editor is
 * locked. `onAsk` adds "Ask Theorem" to the slash menu.
 */
export function NoteEditor({
  note,
  onAsk,
  className,
}: {
  note: Note
  onAsk?: () => void
  className?: string
}) {
  const [picking, setPicking] = useState(false)
  const insertRef = useRef<(markdown: string) => void>(undefined)
  const callbacks = useRef<Callbacks>({
    onAsk,
    onEmbed: () => setPicking(true),
  })
  // The slash menu is built once; it reads the latest callbacks when it runs.
  useLayoutEffect(() => {
    callbacks.current = { onAsk, onEmbed: () => setPicking(true) }
  })

  return (
    <div
      className={cn('theorem-note', className)}
      onClick={(event) => {
        const embed = (event.target as Element).closest(`[${EMBED_ATTR}]`)
        const documentId = embed?.getAttribute(EMBED_ATTR)
        if (documentId) useNoteView.getState().open(documentId)
      }}
    >
      <MilkdownProvider>
        <CrepeEditor
          note={note}
          callbacks={callbacks}
          onInsertReady={(fn) => (insertRef.current = fn)}
        />
      </MilkdownProvider>
      <NotePicker
        open={picking}
        onOpenChange={setPicking}
        title="Embed a note"
        exclude={note.documentId}
        onPick={(doc) =>
          insertRef.current?.(
            embedFence({
              kind: 'document',
              id: doc.documentId,
              title: doc.title,
            }),
          )
        }
      />
    </div>
  )
}
