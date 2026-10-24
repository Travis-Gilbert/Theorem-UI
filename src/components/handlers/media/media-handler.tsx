// SOURCING: the platform's <img>, <audio> and <video>, fed a blob: URL of the
// file's bytes (useFileBytes, useObjectUrl). Which formats play is the
// platform's call: an element that cannot show its file says so, and the
// desktop host can open it in the system's app instead.
import { basename } from 'pathe'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { hostActions } from '@/lib/handlers/actions'
import { useFileBytes, useObjectUrl } from '@/lib/handlers/file-sync'
import type { FileRef } from '@/lib/handlers/file-sync'
import { mimeOf } from '@/lib/handlers/registry'
import type { FileCardProps, FileViewProps } from '@/lib/handlers/types'
import { FileMessage } from '../file-status'
import { mediaKind } from './kind'

/** The file as a blob: URL of its own type, or the message to show instead. */
function useMediaUrl(file: FileRef) {
  const type = mimeOf(file.path)
  const bytes = useFileBytes(file)
  const url = useObjectUrl(bytes.data?.bytes, type)
  if (bytes.isError) return { message: 'This file could not be read.' }
  if (!url) return { message: 'Loading…' }
  return { url, kind: mediaKind(type) }
}

/** What to show when the platform cannot play or decode the file. */
function Unplayable(file: FileRef) {
  const host = hostActions(file)
  return (
    <FileMessage className="flex-col gap-3">
      <span>This file cannot be shown here.</span>
      {host && (
        <Button
          variant="outline"
          size="sm"
          onClick={() => void host.openWithDefault()}
        >
          Open in its default app
        </Button>
      )}
    </FileMessage>
  )
}

export function MediaPanel(file: FileViewProps) {
  const media = useMediaUrl(file)
  const [failed, setFailed] = useState<string>()
  if (!media.url) return <FileMessage>{media.message}</FileMessage>
  // `kind` is null when "Open with" chose this view for another type.
  if (failed === media.url || !media.kind) return <Unplayable {...file} />
  const onError = () => setFailed(media.url)
  const name = basename(file.path)
  return (
    <div className="flex h-full min-h-0 items-center justify-center overflow-auto bg-frame p-4">
      {media.kind === 'image' && (
        <img
          src={media.url}
          alt={name}
          onError={onError}
          className="max-h-full max-w-full object-contain"
        />
      )}
      {media.kind === 'audio' && (
        <audio
          src={media.url}
          controls
          onError={onError}
          aria-label={name}
          className="w-full max-w-xl"
        />
      )}
      {media.kind === 'video' && (
        <video
          src={media.url}
          controls
          playsInline
          onError={onError}
          aria-label={name}
          className="max-h-full max-w-full"
        />
      )}
    </div>
  )
}

/**
 * A thumbnail: the image, the video's first frame, or for sound its name and
 * a player.
 */
export function MediaCard({ client, path }: FileCardProps) {
  const media = useMediaUrl({ client, path })
  const [failed, setFailed] = useState<string>()
  const name = basename(path)
  if (!media.url)
    return <FileMessage className="text-xs">{media.message}</FileMessage>
  if (failed === media.url || !media.kind)
    return <FileMessage className="text-xs">{name}</FileMessage>
  const onError = () => setFailed(media.url)
  const fill = 'size-full object-cover'
  return (
    <div className="h-full overflow-hidden bg-raised">
      {media.kind === 'image' && (
        <img
          src={media.url}
          alt={name}
          onError={onError}
          draggable={false}
          className={fill}
        />
      )}
      {media.kind === 'video' && (
        // A video without controls shows a still frame. WebKit draws none
        // for preload="metadata" until a time is set; the media fragment
        // `#t=0.1` sets one.
        <video
          src={`${media.url}#t=0.1`}
          preload="metadata"
          muted
          playsInline
          onError={onError}
          aria-label={name}
          className={fill}
        />
      )}
      {media.kind === 'audio' && (
        <div className="flex h-full flex-col justify-center gap-2 p-3">
          <span className="truncate text-sm font-medium text-ink">{name}</span>
          <audio
            src={media.url}
            controls
            preload="metadata"
            onError={onError}
            aria-label={name}
            className="nodrag w-full"
          />
        </div>
      )}
    </div>
  )
}
