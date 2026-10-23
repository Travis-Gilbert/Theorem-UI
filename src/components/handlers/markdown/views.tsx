// SOURCING: @prosemirror-adapter/react (wikilinks, embeds and callouts as
// React node views, registered through Milkdown's $view), @tanstack/react-query
// (each link's resolved path, cached until files appear, go or move),
// lucide-react (Obsidian draws callouts with Lucide's icons), pathe, and the
// handler registry's Cards for embeds.
import { $view } from '@milkdown/kit/utils'
import { useNodeViewContext } from '@prosemirror-adapter/react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import {
  Bug,
  Check,
  ChevronDown,
  CircleCheck,
  CircleHelp,
  ClipboardList,
  Flame,
  Info,
  List,
  Pencil,
  Quote,
  TriangleAlert,
  X,
  Zap,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { extname } from 'pathe'
import { createContext, use, useEffect } from 'react'
import { parseWikiTarget } from '#/server/desktop/workspace/markdown'
import { openFileAt } from '@/lib/handlers/actions'
import type { FileViewProps } from '@/lib/handlers/types'
import { WorkspaceConflictError } from '@/lib/workspace/types'
import type { WorkspaceClient } from '@/lib/workspace/types'
import { FileCard } from '../file-card'
import {
  calloutNode,
  defaultCalloutTitle,
  nodeViewFactoryCtx,
  wikiEmbedNode,
  wikiLinkNode,
} from './syntax'
import type { CalloutAttrs, WikiAttrs } from './syntax'

/** The file an editor shows, for its node views. */
export const MarkdownFileContext = createContext<FileViewProps | null>(null)

function useMarkdownFile(): FileViewProps {
  const file = use(MarkdownFileContext)
  if (!file) throw new Error('A Markdown node view needs MarkdownFileContext.')
  return file
}

const resolveKey = (workspaceId: string) =>
  ['desktop', 'workspace', workspaceId, 'resolve'] as const

/** Where `target`, written in `file`, leads; '' is the file itself. */
function useResolvedPath(file: FileViewProps, target: string) {
  return useQuery({
    queryKey: [...resolveKey(file.client.workspace.id), file.path, target],
    queryFn: () =>
      target
        ? file.client.resolve(target, file.path)
        : Promise.resolve(file.path),
    staleTime: Infinity,
  })
}

/** Links resolve again when files appear, go or move. */
export function useResolvedPathsInvalidation(client: WorkspaceClient) {
  const queryClient = useQueryClient()
  useEffect(
    () =>
      client.subscribe((event) => {
        if (
          event.type === 'created' ||
          event.type === 'deleted' ||
          event.type === 'renamed' ||
          event.type === 'resync'
        )
          void queryClient.invalidateQueries({
            queryKey: resolveKey(client.workspace.id),
          })
      }),
    [client, queryClient],
  )
}

/**
 * Opens a wikilink's target at its heading or block. A link to a note that
 * does not exist yet creates it, at the target's path, as Obsidian does.
 */
export async function followWikiLink(file: FileViewProps, value: string) {
  const { target, heading, block } = parseWikiTarget(value)
  const subpath = block ? `#^${block}` : heading ? `#${heading}` : undefined
  const { client } = file
  const path = target ? await client.resolve(target, file.path) : file.path
  if (path) {
    openFileAt({ client, path }, subpath)
    return
  }
  const created = extname(target) ? target : `${target}.md`
  try {
    await client.write(created, '', { expectedHash: null })
  } catch (error) {
    // It appeared in the meantime; open it.
    if (!(error instanceof WorkspaceConflictError)) throw error
  }
  openFileAt({ client, path: created })
}

function WikiLinkView() {
  const { node, selected } = useNodeViewContext()
  const file = useMarkdownFile()
  const { value, alias } = node.attrs as WikiAttrs
  const resolved = useResolvedPath(file, parseWikiTarget(value).target)
  return (
    <span
      className="theorem-wikilink"
      data-unresolved={resolved.data === null || undefined}
      data-selected={selected || undefined}
      title={value}
      onClick={(event) => {
        event.preventDefault()
        void followWikiLink(file, value)
      }}
    >
      {alias ?? value}
    </span>
  )
}

/**
 * Below the canvas's edit zoom, so an embedded note shows its excerpt rather
 * than a second editor, and an embed of an embed stops there.
 */
const EMBED_ZOOM = 0.5

function WikiEmbedView() {
  const { node, selected } = useNodeViewContext()
  const file = useMarkdownFile()
  const { value } = node.attrs as WikiAttrs
  const resolved = useResolvedPath(file, parseWikiTarget(value).target)
  return (
    <span
      className="theorem-wiki-embed"
      data-selected={selected || undefined}
    >
      <button
        type="button"
        className="theorem-wiki-embed-title"
        title={`Open ${value}`}
        onClick={() => void followWikiLink(file, value)}
      >
        {value}
      </button>
      {resolved.data ? (
        <FileCard
          client={file.client}
          path={resolved.data}
          zoom={EMBED_ZOOM}
          selected={selected}
          className="theorem-wiki-embed-body"
        />
      ) : (
        <span className="theorem-wiki-embed-missing">
          {resolved.isPending ? 'Loading…' : 'Not in this folder yet.'}
        </span>
      )}
    </span>
  )
}

/** Obsidian's callout types, by the Lucide icon it draws for each. */
const CALLOUT_ICONS: Record<string, LucideIcon> = {
  note: Pencil,
  abstract: ClipboardList,
  summary: ClipboardList,
  tldr: ClipboardList,
  info: Info,
  todo: CircleCheck,
  tip: Flame,
  hint: Flame,
  important: Flame,
  success: Check,
  check: Check,
  done: Check,
  question: CircleHelp,
  help: CircleHelp,
  faq: CircleHelp,
  warning: TriangleAlert,
  caution: TriangleAlert,
  attention: TriangleAlert,
  failure: X,
  fail: X,
  missing: X,
  danger: Zap,
  error: Zap,
  bug: Bug,
  example: List,
  quote: Quote,
  cite: Quote,
}

/** The kinds offered when changing one; aliases still render. */
const CALLOUT_KINDS = [
  'note',
  'abstract',
  'info',
  'todo',
  'tip',
  'success',
  'question',
  'warning',
  'failure',
  'danger',
  'bug',
  'example',
  'quote',
]

function CalloutView() {
  const { node, contentRef, setAttrs } = useNodeViewContext()
  const { kind, title, folded } = node.attrs as CalloutAttrs
  const type = kind.toLowerCase()
  const Glyph = CALLOUT_ICONS[type] ?? Pencil
  return (
    <div
      className="theorem-callout"
      data-callout={type}
      data-folded={folded === true || undefined}
    >
      <div className="theorem-callout-title" contentEditable={false}>
        <Glyph className="size-4 shrink-0" aria-hidden />
        <select
          aria-label="Callout type"
          value={type}
          onChange={(event) => setAttrs({ kind: event.target.value })}
        >
          {(CALLOUT_KINDS.includes(type)
            ? CALLOUT_KINDS
            : [type, ...CALLOUT_KINDS]
          ).map((k) => (
            <option key={k} value={k}>
              {defaultCalloutTitle(k)}
            </option>
          ))}
        </select>
        <input
          aria-label="Callout title"
          value={title ?? ''}
          placeholder={defaultCalloutTitle(kind)}
          onChange={(event) => setAttrs({ title: event.target.value || null })}
        />
        {folded !== null && (
          <button
            type="button"
            aria-label={folded ? 'Expand' : 'Collapse'}
            aria-expanded={!folded}
            onClick={() => setAttrs({ folded: !folded })}
          >
            <ChevronDown className="size-4" />
          </button>
        )}
      </div>
      <div
        ref={contentRef}
        className="theorem-callout-content"
        hidden={folded === true}
      />
    </div>
  )
}

/** Events inside a view's own controls stay with React. */
const inControls = (selector: string) => (event: Event) =>
  event.target instanceof Element && event.target.closest(selector) !== null

const factory = (ctx: Parameters<Parameters<typeof $view>[1]>[0]) => {
  const create = ctx.get(nodeViewFactoryCtx.key)
  if (!create) throw new Error('The Markdown editor sets nodeViewFactoryCtx.')
  return create
}

export const markdownViews = [
  $view(wikiLinkNode, (ctx) =>
    factory(ctx)({ component: WikiLinkView, as: 'span' }),
  ),
  $view(wikiEmbedNode, (ctx) =>
    factory(ctx)({
      component: WikiEmbedView,
      as: 'span',
      stopEvent: inControls('.theorem-wiki-embed-body, .theorem-wiki-embed-title'),
    }),
  ),
  $view(calloutNode, (ctx) =>
    factory(ctx)({
      component: CalloutView,
      stopEvent: inControls('.theorem-callout-title'),
    }),
  ),
]
