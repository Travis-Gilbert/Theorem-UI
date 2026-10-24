// SOURCING: @xyflow/react custom nodes (Handle, NodeResizer, the viewport
// store), as note-node.tsx builds them, for JSON Canvas's four node types.
// Text nodes reuse the Markdown handler's editor and NoteExcerpt; file nodes
// are the registry's Card for the file; group backgrounds load through
// useFileBytes.
import { Handle, NodeResizer, Position, useStore } from '@xyflow/react'
import type { NodeProps } from '@xyflow/react'
import { createContext, use } from 'react'
import type { CSSProperties, ReactNode } from 'react'
import { EDIT_ZOOM } from '@/components/canvas/zoom'
import { Icon } from '@/components/icons'
import { NoteExcerpt } from '@/components/notes/note-excerpt'
import type { CanvasEdit, CanvasNode } from '@/lib/canvas/json-canvas'
import { openFileAt } from '@/lib/handlers/actions'
import { useFileBytes, useObjectUrl } from '@/lib/handlers/file-sync'
import { mimeOf } from '@/lib/handlers/registry'
import type { FileViewProps } from '@/lib/handlers/types'
import { cn } from '@/lib/utils'
import { FileCard } from '../file-card'
import { MarkdownEditor } from '../markdown/editor'
import { canvasColor } from './canvas-flow'
import type { CanvasFlowNode } from './canvas-flow'

/** The canvas file the nodes belong to, and how they change it. */
export const CanvasFileContext = createContext<{
  file: FileViewProps
  edit: (edits: Array<CanvasEdit>) => void
} | null>(null)

function useCanvasFile() {
  const canvas = use(CanvasFileContext)
  if (!canvas) throw new Error('A canvas node needs CanvasFileContext.')
  return canvas
}

const SIDES = [Position.Top, Position.Right, Position.Bottom, Position.Left]

/**
 * `theorem:kind` marks an executable graph's nodes (plan D14). The kind is
 * shown; running the graph is Phase 5's.
 */
function KindBadge({ node }: { node: CanvasNode }) {
  const kind: unknown = node['theorem:kind']
  if (typeof kind !== 'string') return null
  return (
    <span className="pointer-events-none absolute -top-2.5 right-2 z-10 rounded-full border border-separator bg-raised px-1.5 text-[10px] leading-4 font-medium tracking-wide text-ink-muted uppercase">
      {kind}
    </span>
  )
}

function NodeFrame({
  node,
  selected,
  className,
  style,
  children,
}: {
  node: CanvasNode
  selected: boolean
  className?: string
  style?: CSSProperties
  children: ReactNode
}) {
  const color = canvasColor(node.color)
  return (
    <div
      className={cn(
        'group/node relative flex h-full w-full flex-col rounded-xl border-2 border-separator bg-raised shadow-xs data-[selected=true]:outline-2 data-[selected=true]:outline-focus',
        className,
      )}
      data-selected={selected}
      data-canvas-node={node.type}
      style={{
        ...(color && {
          borderColor: color,
          backgroundColor: `color-mix(in srgb, ${color} 8%, var(--surface-raised))`,
        }),
        ...style,
      }}
    >
      <NodeResizer
        isVisible={selected}
        minWidth={60}
        minHeight={40}
        lineClassName="!border-focus"
        handleClassName="!size-2 !rounded-sm !border-focus !bg-raised"
      />
      {SIDES.map((side) => (
        <Handle
          key={side}
          id={side}
          type="source"
          position={side}
          className="!size-2.5 !border-separator !bg-raised opacity-0 transition-opacity group-hover/node:opacity-100"
        />
      ))}
      <KindBadge node={node} />
      {children}
    </div>
  )
}

const useZoom = () => useStore((s) => s.transform[2])

function TextNodeView({ id, data, selected }: NodeProps<CanvasFlowNode>) {
  const { file, edit } = useCanvasFile()
  const live = useZoom() >= EDIT_ZOOM
  const text = typeof data.node.text === 'string' ? data.node.text : ''
  return (
    <NodeFrame node={data.node} selected={selected} className="overflow-hidden">
      {live ? (
        <MarkdownEditor
          file={file}
          body={text}
          onBody={(next) =>
            edit([{ type: 'set', list: 'nodes', id, values: { text: next } }])
          }
          className="theorem-note-card nodrag nowheel nopan min-h-0 flex-1 overflow-y-auto"
        />
      ) : (
        <NoteExcerpt
          markdown={text}
          className="min-h-0 flex-1 overflow-hidden p-3 text-ink-muted"
        />
      )}
    </NodeFrame>
  )
}

const nameOf = (path: string) => path.slice(path.lastIndexOf('/') + 1)

function FileNodeView({ data, selected }: NodeProps<CanvasFlowNode>) {
  const { file } = useCanvasFile()
  const zoom = useZoom()
  const path = String(data.node.file ?? '')
  const subpath =
    typeof data.node.subpath === 'string' ? data.node.subpath : undefined
  return (
    <NodeFrame node={data.node} selected={selected}>
      <header className="flex h-7 shrink-0 items-center gap-1.5 border-b border-separator ps-2.5 pe-1">
        <Icon.TreeFile className="size-3.5 shrink-0 text-ink-faint" />
        <span
          className="min-w-0 flex-1 truncate text-xs font-medium text-ink"
          title={path + (subpath ?? '')}
        >
          {nameOf(path)}
          {subpath && <span className="text-ink-faint">{subpath}</span>}
        </span>
        <button
          type="button"
          aria-label={`Open ${nameOf(path)}`}
          onClick={() => openFileAt({ client: file.client, path }, subpath)}
          className="nodrag rounded-md p-1 text-ink-faint hover:bg-hover hover:text-ink"
        >
          <Icon.Expand className="size-3.5" />
        </button>
      </header>
      <FileCard
        client={file.client}
        path={path}
        zoom={zoom}
        selected={selected}
        className="min-h-0 flex-1 rounded-b-xl"
      />
    </NodeFrame>
  )
}

function LinkNodeView({ data, selected }: NodeProps<CanvasFlowNode>) {
  const url = String(data.node.url ?? '')
  let host = url
  try {
    host = new URL(url).host
  } catch {
    // Shown as written.
  }
  return (
    <NodeFrame node={data.node} selected={selected} className="gap-1 p-3">
      <span className="flex items-center gap-1.5 text-xs text-ink-faint">
        <Icon.Web className="size-3.5" />
        {host}
      </span>
      <a
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        className="nodrag line-clamp-3 text-sm break-all text-link underline underline-offset-2"
      >
        {url}
      </a>
    </NodeFrame>
  )
}

function GroupBackground({ path, fit }: { path: string; fit: string }) {
  const { file } = useCanvasFile()
  const bytes = useFileBytes({ client: file.client, path })
  const url = useObjectUrl(bytes.data?.bytes, mimeOf(path))
  if (!url) return null
  return (
    <div
      aria-hidden
      className="absolute inset-0 rounded-[10px] opacity-60"
      style={{
        backgroundImage: `url("${url}")`,
        backgroundSize:
          fit === 'repeat' ? 'auto' : fit === 'ratio' ? 'contain' : 'cover',
        backgroundRepeat: fit === 'repeat' ? 'repeat' : 'no-repeat',
        backgroundPosition: 'center',
      }}
    />
  )
}

function GroupNodeView({ data, selected }: NodeProps<CanvasFlowNode>) {
  const label = typeof data.node.label === 'string' ? data.node.label : ''
  const background =
    typeof data.node.background === 'string' ? data.node.background : null
  return (
    <NodeFrame
      node={data.node}
      selected={selected}
      className="bg-transparent shadow-none"
      style={
        data.node.color
          ? undefined
          : { backgroundColor: 'color-mix(in srgb, var(--surface-raised) 35%, transparent)' }
      }
    >
      {background && (
        <GroupBackground
          path={background}
          fit={String(data.node.backgroundStyle ?? 'cover')}
        />
      )}
      {label && (
        <span className="absolute -top-7 left-0 max-w-full truncate rounded-md bg-raised px-2 py-0.5 text-sm font-medium text-ink">
          {label}
        </span>
      )}
    </NodeFrame>
  )
}

export const canvasNodeTypes = {
  text: TextNodeView,
  file: FileNodeView,
  link: LinkNodeView,
  group: GroupNodeView,
}

/** A node in a canvas thumbnail: its shape and colour and a word of what it is. */
function ThumbNode({ data }: NodeProps<CanvasFlowNode>) {
  const { node } = data
  const color = canvasColor(node.color)
  // The file on disk may lack what the type promises.
  const fields: Record<string, unknown> = node
  const field = (key: string) => {
    const value = fields[key]
    return typeof value === 'string' ? value : ''
  }
  const label =
    node.type === 'group'
      ? field('label')
      : node.type === 'file'
        ? nameOf(field('file'))
        : node.type === 'link'
          ? field('url')
          : field('text')
  return (
    <div
      className={cn(
        'h-full w-full overflow-hidden rounded-lg border-2 p-2 text-[28px] leading-tight text-ink-muted',
        node.type === 'group' ? 'bg-transparent' : 'bg-raised',
      )}
      style={{ borderColor: color ?? 'var(--line-separator)' }}
    >
      <span className="line-clamp-3 break-words">{label}</span>
    </div>
  )
}

export const thumbnailNodeTypes = {
  text: ThumbNode,
  file: ThumbNode,
  link: ThumbNode,
  group: ThumbNode,
}
