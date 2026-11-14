// SOURCING: the file handlers' MediaPanel and PdfPanel (React.lazy, as builtins.ts loads them) over upload-client, lib/theorem/organization for a conversation's live title, the artifact view and TanStack Router to open things, papaparse through csv-handler's parseDelimited for data fences, canvas/space-preview for a canvas. One block per thing a note can hold; the same views serve the editor, read-only notes and typed canvas nodes.
import { Link, useNavigate } from '@tanstack/react-router'
import { Suspense, lazy, useMemo } from 'react'
import type { ReactNode } from 'react'
import { useArtifactView } from '@/components/artifacts/artifact-view'
import { SpacePreview } from '@/components/canvas/space-preview'
import { useCanvasView } from '@/components/canvas/canvas-view'
import { parseDelimited } from '@/components/handlers/data/delimited'
import { FileMessage } from '@/components/handlers/file-status'
import { Icon } from '@/components/icons'
import { SessionGlyph } from '@/components/organize/glyphs'
import type { EmbedRef } from '@/lib/theorem/embeds'
import { fileShape } from '@/lib/theorem/note-kinds'
import { attentionLabel, useOrganizedViews } from '@/lib/theorem/organization'
import { useImageUrl } from '@/lib/theorem/uploads'
import { cn } from '@/lib/utils'
import { uploadClient } from './upload-client'

const MediaPanel = lazy(async () => ({
  default: (await import('@/components/handlers/media/media-handler')).MediaPanel,
}))
const MediaCard = lazy(async () => ({
  default: (await import('@/components/handlers/media/media-handler')).MediaCard,
}))
const PdfPanel = lazy(async () => ({
  default: (await import('@/components/handlers/pdf/pdf-handler')).PdfPanel,
}))
const PdfCard = lazy(async () => ({
  default: (await import('@/components/handlers/pdf/pdf-handler')).PdfCard,
}))

/** What blocks with their own controls mark, so the editor leaves their events alone. */
export const BLOCK_CONTROLS = 'data-block-controls'
const controls = { [BLOCK_CONTROLS]: '' }

const CARD = 'theorem-block-card flex w-full min-w-0 items-center gap-2.5 text-start text-sm'

function Details({
  title,
  detail,
  link,
}: {
  title: string
  detail?: string
  link?: boolean
}) {
  return (
    <span className="flex min-w-0 flex-1 flex-col">
      <span
        className={cn(
          'truncate font-medium text-ink',
          link && 'text-link underline underline-offset-2',
        )}
      >
        {title}
      </span>
      {detail && <span className="truncate text-xs text-ink-muted">{detail}</span>}
    </span>
  )
}

function FileBlock({
  embed,
  fill,
  preview,
}: {
  embed: EmbedRef
  fill?: boolean
  preview?: boolean
}) {
  const shape = fileShape(embed.mime)
  const file = useMemo(() => uploadClient(embed), [embed])
  if (shape === 'file')
    return (
      <div className={cn(CARD, fill && 'h-full')}>
        <Icon.File className="size-4 shrink-0 text-ink-muted" />
        <Details title={embed.title ?? embed.id} detail={embed.mime} />
      </div>
    )
  const fallback = <FileMessage className="text-xs">Loading…</FileMessage>
  return (
    <div
      {...controls}
      className={cn(
        'theorem-block-media min-h-0 overflow-hidden',
        fill
          ? 'size-full rounded-xl border border-separator bg-raised'
          : cn(
              'w-full rounded-lg border border-separator',
              shape === 'pdf' && 'h-112',
              shape === 'video' && 'aspect-video',
            ),
      )}
    >
      <Suspense fallback={fallback}>
        {preview && shape === 'pdf' && <PdfCard {...file} zoom={1} selected={false} />}
        {preview && shape !== 'pdf' && <MediaCard {...file} zoom={1} selected={false} />}
        {!preview && shape === 'pdf' && <PdfPanel {...file} />}
        {!preview && shape !== 'pdf' && <MediaPanel {...file} fill />}
      </Suspense>
    </div>
  )
}

function hostOf(url: string) {
  try {
    return new URL(url).host
  } catch {
    return url
  }
}

function LinkBlock({ embed, fill }: { embed: EmbedRef; fill?: boolean }) {
  const host = hostOf(embed.id)
  const title = embed.title && embed.title !== host ? embed.title : undefined
  return (
    <a
      {...controls}
      href={embed.id}
      target="_blank"
      rel="noopener noreferrer"
      title={embed.id}
      className={cn(CARD, fill && 'h-full')}
    >
      <Icon.Web className="size-4 shrink-0 text-ink-muted" />
      <Details title={title ?? host} detail={title && host} link />
      <Icon.Detach aria-hidden className="size-3.5 shrink-0 text-ink-muted" />
    </a>
  )
}

function ThreadBlock({ embed, fill }: { embed: EmbedRef; fill?: boolean }) {
  const views = useOrganizedViews()
  const thread = views.byId.get(embed.id)
  const reason = thread?.attention.reasons[0]
  const detail = thread?.attention.running
    ? 'Running'
    : reason
      ? attentionLabel(reason)
      : 'Conversation'
  return (
    <Link
      {...controls}
      to="/c/$threadId"
      params={{ threadId: embed.id }}
      className={cn(CARD, fill && 'h-full')}
    >
      <SessionGlyph
        threadId={embed.id}
        className="size-4 shrink-0 text-ink-muted"
      />
      <Details title={thread?.title ?? embed.title ?? 'Conversation'} detail={detail} />
      <Icon.ChevronRight aria-hidden className="size-3.5 shrink-0 text-ink-muted" />
    </Link>
  )
}

function ArtifactBlock({ embed, fill }: { embed: EmbedRef; fill?: boolean }) {
  const navigate = useNavigate()
  return (
    <button
      {...controls}
      type="button"
      className={cn(CARD, fill && 'h-full')}
      onClick={async () => {
        // An artifact is read from its conversation's messages, so it opens there.
        if (embed.threadId)
          await navigate({
            to: '/c/$threadId',
            params: { threadId: embed.threadId },
          })
        useArtifactView.getState().open(embed.id)
      }}
    >
      <Icon.Artifact className="size-4 shrink-0 text-ink-muted" />
      <Details title={embed.title ?? 'Artifact'} detail="App or artifact" />
      <Icon.ChevronRight aria-hidden className="size-3.5 shrink-0 text-ink-muted" />
    </button>
  )
}

function SpaceBlock({ embed, fill }: { embed: EmbedRef; fill?: boolean }) {
  const navigate = useNavigate()
  const title = embed.title ?? 'Canvas'
  return (
    <button
      {...controls}
      type="button"
      aria-label={`Open ${title}`}
      className={cn(
        'theorem-block-card flex w-full flex-col gap-1.5 text-start text-sm',
        fill ? 'h-full' : 'h-56',
      )}
      onClick={async () => {
        useCanvasView.getState().enter({ spaceId: embed.id, title })
        await navigate({ to: '/spaces' })
      }}
    >
      <span className="flex w-full items-center gap-1.5 text-xs text-ink-muted">
        <Icon.Canvas className="size-3.5 shrink-0" />
        <span className="truncate">{title}</span>
      </span>
      <SpacePreview
        spaceId={embed.id}
        title={title}
        className="min-h-0 w-full flex-1"
      />
    </button>
  )
}

/**
 * One thing a note holds. `fill` lets it take a canvas node's whole body, and
 * `preview` shows a file as a still when it is too small on screen to use.
 */
export function EmbedBlock({
  embed,
  fill,
  preview,
}: {
  embed: EmbedRef
  fill?: boolean
  preview?: boolean
}): ReactNode {
  switch (embed.kind) {
    case 'file':
      return <FileBlock embed={embed} fill={fill} preview={preview} />
    case 'link':
      return <LinkBlock embed={embed} fill={fill} />
    case 'thread':
      return <ThreadBlock embed={embed} fill={fill} />
    case 'artifact':
      return <ArtifactBlock embed={embed} fill={fill} />
    case 'space':
      return <SpaceBlock embed={embed} fill={fill} />
    default:
      return (
        <div className={cn(CARD, fill && 'h-full')}>
          <Icon.Link className="size-4 shrink-0 text-ink-muted" />
          <Details title={embed.title ?? embed.id} detail={embed.kind} />
        </div>
      )
  }
}

/** A data fence's rows. Static, so Crepe's preview can take it as markup too. */
export function DataTable({ csv }: { csv: string }) {
  const { names, rows } = parseDelimited(csv)
  return (
    <div className="theorem-data-table not-prose overflow-x-auto">
      <table>
        <thead>
          <tr>
            {names.map((name, column) => (
              <th key={column}>{name}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, line) => (
            <tr key={line}>
              {names.map((_, column) => (
                <td key={column}>{row[column]}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

/** A note's image, which may be a Theorem upload the platform cannot read by itself. */
export function NoteImage({
  src,
  alt,
  className,
}: {
  src: string | undefined
  alt: string | undefined
  className?: string
}) {
  const { url, error } = useImageUrl(src)
  if (error)
    return <span className="text-xs text-ink-muted">This image is unavailable.</span>
  return url ? (
    <img src={url} alt={alt ?? ''} draggable={false} className={className} />
  ) : null
}
