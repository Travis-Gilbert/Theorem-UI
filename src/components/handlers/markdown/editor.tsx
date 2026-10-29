// SOURCING: @milkdown/crepe via @milkdown/react, configured as note-editor.tsx
// configures it, with @prosemirror-adapter/react for the React node views of
// views.tsx, Crepe's ImageBlock hooks for images kept in the folder, the `[[`
// suggestions of wiki-suggest.tsx, the attachments of attachments.ts, and the
// registry's MarkdownExtensions. Milkdown's replaceAll takes changes from disk.
//
// The editor shows a note's body; the frontmatter stays with the panel. It
// writes only what the person changed: Milkdown normalizes Markdown when it
// loads it, so the form it serialized on load (and after each change from
// disk) is what an edit is told apart from.
import { Crepe } from '@milkdown/crepe'
import '@milkdown/crepe/theme/common/style.css'
import { commandsCtx, editorViewCtx } from '@milkdown/kit/core'
import type { Editor } from '@milkdown/kit/core'
import {
  clearTextInCurrentBlockCommand,
  wrapInBlockTypeCommand,
} from '@milkdown/kit/preset/commonmark'
import type { Node as ProseNode } from '@milkdown/kit/prose/model'
import { TextSelection } from '@milkdown/kit/prose/state'
import { replaceAll } from '@milkdown/kit/utils'
import { Milkdown, MilkdownProvider, useEditor } from '@milkdown/react'
import {
  ProsemirrorAdapterProvider,
  useNodeViewFactory,
} from '@prosemirror-adapter/react'
import { Info } from 'lucide-react'
import { dirname, join } from 'pathe'
import { useEffect, useRef, useState } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { revealDone, useRevealRequest } from '@/lib/handlers/actions'
import { markdownExtensions, mimeOf } from '@/lib/handlers/registry'
import type { FileViewProps } from '@/lib/handlers/types'
import { cn } from '@/lib/utils'
import {
  attachmentUploads,
  relativeUrl,
  saveAttachment,
  useAttachmentTarget,
} from './attachments'
import type { AttachmentTarget } from './attachments'
import {
  calloutNode,
  markdownSyntax,
  nodeViewFactoryCtx,
  obsidianMarkdownStyle,
} from './syntax'
import {
  MarkdownFileContext,
  markdownViews,
  useResolvedPathsInvalidation,
} from './views'
import {
  WikiSuggest,
  createWikiSuggestStore,
  wikiSuggest,
} from './wiki-suggest'

const calloutIcon = renderToStaticMarkup(<Info />)

/** A URL Crepe should load itself rather than from the folder. */
const isRemote = (url: string) => /^(?:[a-z][a-z\d+.-]*:|\/\/)/i.test(url)

function decode(url: string) {
  try {
    return decodeURI(url)
  } catch {
    return url
  }
}

/**
 * Images the note links by a relative path, loaded from the folder. The URLs
 * live as long as the editor.
 */
function useFolderImages(
  { client, path }: FileViewProps,
  attachments: () => Promise<AttachmentTarget>,
) {
  const urls = useRef(new Set<string>())
  useEffect(() => {
    const created = urls.current
    return () => {
      for (const url of created) URL.revokeObjectURL(url)
      created.clear()
    }
  }, [])

  const proxyDomURL = async (url: string) => {
    if (!url || isRemote(url)) return url
    const at = join(dirname(path), decode(url.split(/[?#]/)[0] ?? ''))
    try {
      const { bytes } = await client.read(at)
      const blob = URL.createObjectURL(
        new Blob([bytes as Uint8Array<ArrayBuffer>], {
          type: mimeOf(at) ?? '',
        }),
      )
      urls.current.add(blob)
      return blob
    } catch {
      return url
    }
  }

  /** A picked image is saved with the note's attachments, under a free name. */
  const onUpload = async (upload: File) => {
    const target = await attachments()
    return relativeUrl(target.path, await saveAttachment(target, upload))
  }

  return { proxyDomURL, onUpload }
}

/** Obsidian's heading match: the last part of `A#B`, case and spacing aside. */
const normalize = (text: string) =>
  text.trim().replace(/\s+/g, ' ').toLowerCase()

/**
 * Where `#Heading` or `#^block` is in the document, or null. A heading whose
 * own text holds `#` (`C# basics`) matches whole before `A#B` is split.
 */
function findSubpath(doc: ProseNode, subpath: string): number | null {
  if (subpath.startsWith('#^')) return findIn(doc, null, subpath.slice(2))
  return (
    findIn(doc, normalize(subpath.slice(1)), null) ??
    findIn(doc, normalize(subpath.slice(1).split('#').at(-1) ?? ''), null)
  )
}

function findIn(
  doc: ProseNode,
  heading: string | null,
  block: string | null,
): number | null {
  let found: number | null = null
  doc.descendants((node, pos) => {
    if (found !== null) return false
    if (heading !== null && node.type.name === 'heading') {
      if (normalize(node.textContent) === heading) found = pos
      return false
    }
    if (block && node.isTextblock) {
      if (new RegExp(`(?:^|\\s)\\^${block}\\s*$`).test(node.textContent))
        found = pos
      return false
    }
    return true
  })
  return found
}

function useReveal(
  get: () => Editor | undefined,
  loading: boolean,
  { client, path }: FileViewProps,
) {
  const request = useRevealRequest((s) => s.request)
  useEffect(() => {
    const editor = get()
    if (
      loading ||
      !editor ||
      !request ||
      request.workspaceId !== client.workspace.id ||
      request.path !== path
    )
      return
    editor.action((ctx) => {
      const view = ctx.get(editorViewCtx)
      const pos = findSubpath(view.state.doc, request.subpath)
      if (pos !== null) {
        const selection = TextSelection.near(view.state.doc.resolve(pos + 1))
        view.dispatch(view.state.tr.setSelection(selection).scrollIntoView())
        const dom = view.nodeDOM(pos)
        if (dom instanceof Element) dom.scrollIntoView({ block: 'start' })
        view.focus()
      }
    })
    revealDone()
  }, [client, get, loading, path, request])
}

function CrepeFile({
  file,
  body,
  onBody,
  readOnly,
}: {
  file: FileViewProps
  body: string
  onBody: (body: string) => void
  readOnly: boolean
}) {
  const nodeViewFactory = useNodeViewFactory()
  const attachments = useAttachmentTarget(file)
  const images = useFolderImages(file, attachments)
  const [suggest] = useState(() => {
    const store = createWikiSuggestStore()
    return { store, ...wikiSuggest(store) }
  })
  /** The Markdown this editor last showed or serialized. */
  const shown = useRef(body)
  const crepeRef = useRef<Crepe>(undefined)
  const onBodyRef = useRef(onBody)
  useEffect(() => {
    onBodyRef.current = onBody
  })

  const { get, loading } = useEditor((root) => {
    const crepe = new Crepe({
      root,
      defaultValue: body,
      featureConfigs: {
        [Crepe.Feature.Placeholder]: {
          text: 'Type / for blocks',
          mode: 'block',
        },
        [Crepe.Feature.ImageBlock]: images,
        [Crepe.Feature.BlockEdit]: {
          buildMenu: (builder) => {
            builder.getGroup('text').addItem('callout', {
              label: 'Callout',
              icon: calloutIcon,
              onRun: (ctx) => {
                const commands = ctx.get(commandsCtx)
                commands.call(clearTextInCurrentBlockCommand.key)
                commands.call(wrapInBlockTypeCommand.key, {
                  nodeType: calloutNode.type(ctx),
                  attrs: { kind: 'note', title: null, folded: null },
                })
              },
            })
          },
        },
      },
    })
    crepe.editor
      .config(obsidianMarkdownStyle)
      .config((ctx) => ctx.set(nodeViewFactoryCtx.key, nodeViewFactory))
      .config(suggest.config)
      .config(attachmentUploads(attachments))
      .use(markdownSyntax)
      .use(markdownViews)
      .use(suggest.plugins)
    for (const extension of markdownExtensions()) extension.extend(crepe, file)
    crepeRef.current = crepe
    crepe.on((listener) => {
      // Normalization on load is not an edit; remember the editor's own form.
      listener.mounted(() => {
        shown.current = crepe.getMarkdown()
      })
      listener.markdownUpdated((_ctx, markdown) => {
        if (markdown === shown.current) return
        shown.current = markdown
        onBodyRef.current(markdown)
      })
    })
    return crepe
  }, [])

  useEffect(() => {
    if (!loading) crepeRef.current?.setReadonly(readOnly)
  }, [loading, readOnly])

  // A change from disk replaces the document; its normalized form is not an edit.
  useEffect(() => {
    const crepe = crepeRef.current
    if (loading || !crepe || body === shown.current) return
    crepe.editor.action(replaceAll(body))
    shown.current = crepe.getMarkdown()
  }, [body, loading])

  useReveal(get, loading, file)

  return (
    <>
      <Milkdown />
      <WikiSuggest store={suggest.store} file={file} />
    </>
  )
}

/** A Markdown body in Crepe, with wikilinks, embeds and callouts. */
export function MarkdownEditor({
  file,
  body,
  onBody,
  readOnly = false,
  className,
}: {
  file: FileViewProps
  body: string
  onBody: (body: string) => void
  readOnly?: boolean
  className?: string
}) {
  useResolvedPathsInvalidation(file.client)
  return (
    <div className={cn('theorem-note', className)}>
      <MarkdownFileContext value={file}>
        <MilkdownProvider>
          <ProsemirrorAdapterProvider>
            <CrepeFile
              file={file}
              body={body}
              onBody={onBody}
              readOnly={readOnly}
            />
          </ProsemirrorAdapterProvider>
        </MilkdownProvider>
      </MarkdownFileContext>
    </div>
  )
}
