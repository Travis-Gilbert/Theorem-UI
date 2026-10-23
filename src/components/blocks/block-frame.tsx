// SOURCING: React (a frame's lifetime as a layout effect) over executor.ts's
// FrameConnection, which serves the bridge to the frame's window only;
// @tanstack/react-query reads the block listener's origin. Every frame
// carries BLOCK_SANDBOX and nothing more (plan D9); a snapshot frame carries
// an empty sandbox: no scripts at all.
import { useQuery } from '@tanstack/react-query'
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import type { BridgeHost } from '@/lib/blocks/bridge'
import type { CompiledCell } from '@/lib/blocks/compile'
import { BLOCK_SANDBOX, FrameConnection } from '@/lib/blocks/executor'
import { blockOrigin, cellUrl } from '@/lib/blocks/frames'
import { useBlocksQueryClient } from '@/lib/blocks/query-client'
import type { BlockSession } from '@/lib/blocks/session'
import { saveSnapshot } from '@/lib/blocks/snapshots'
import { cn } from '@/lib/utils'
import { BlockMessage } from './block-status'

/** The block listener's origin, or null while it is asked for. */
export function useBlockOrigin(): {
  origin: string | null
  error: string | null
} {
  const query = useQuery(
    {
      queryKey: ['blocks', 'origin'],
      queryFn: blockOrigin,
      staleTime: Infinity,
    },
    useBlocksQueryClient(),
  )
  return { origin: query.data ?? null, error: query.error?.message ?? null }
}

/**
 * A sandboxed frame and the page's end of its bridge. The frame is made with
 * its address already set and connected before it is added to the page, so
 * its first load is the block's document and nothing earlier can ask for the
 * port. `host` must keep its identity between renders.
 */
export function BlockFrame({
  src,
  host,
  title,
  onConnection,
  snapshotKey,
  className,
  hidden = false,
}: {
  src: string
  host: BridgeHost
  title: string
  /** Called with each new connection; returns what undoes it. */
  onConnection?: (connection: FrameConnection) => () => void
  /** Where the frame's snapshots are kept (snapshots.ts), for a card far out. */
  snapshotKey?: string
  className?: string
  /** Runs without showing: a code editor's Run, whose values show in its margin. */
  hidden?: boolean
}) {
  const container = useRef<HTMLDivElement>(null)
  const [lost, setLost] = useState(false)
  const [generation, setGeneration] = useState(0)
  const connect = useRef(onConnection)
  useEffect(() => {
    connect.current = onConnection
  })

  useLayoutEffect(() => {
    const parent = container.current
    if (!parent) return
    const frame = document.createElement('iframe')
    frame.title = title
    frame.setAttribute('sandbox', BLOCK_SANDBOX)
    frame.referrerPolicy = 'no-referrer'
    frame.className = 'block w-full border-0 bg-transparent'
    let undo: (() => void) | undefined
    const connection = new FrameConnection(
      frame,
      {
        ...host,
        onResize: (height) => {
          frame.style.height = `${height}px`
        },
        ...(snapshotKey !== undefined && {
          onSnapshot: (html: string) => saveSnapshot(snapshotKey, html),
        }),
      },
      () => {
        undo?.()
        undo = undefined
        frame.remove()
        setLost(true)
      },
    )
    frame.src = src
    parent.append(frame)
    undo = connect.current?.(connection)
    return () => {
      undo?.()
      connection.dispose()
      frame.remove()
    }
  }, [src, host, title, snapshotKey, generation])

  return (
    <div
      ref={container}
      hidden={hidden}
      data-slot="block-frame"
      className={cn('w-full', className)}
    >
      {lost && (
        <BlockMessage>
          The block left its page, so Theorem disconnected it.{' '}
          <Button
            variant="outline"
            size="xs"
            onClick={() => {
              setLost(false)
              setGeneration((value) => value + 1)
            }}
          >
            Reload
          </Button>
        </BlockMessage>
      )}
    </div>
  )
}

/**
 * A frame's last snapshot, shown with no scripts and nothing loaded: what a
 * card shows far out instead of a live frame.
 */
export function SnapshotFrame({ html, title }: { html: string; title: string }) {
  return (
    <iframe
      title={title}
      sandbox=""
      srcDoc={html}
      tabIndex={-1}
      className="pointer-events-none block size-full border-0 bg-transparent"
    />
  )
}

/** A compiled code block's frame, attached to its session while shown. */
export function CellFrame({
  session,
  blockKey,
  compiled,
  title,
  snapshotKey,
  hidden,
  className,
}: {
  session: BlockSession
  blockKey: string
  compiled: CompiledCell
  title: string
  snapshotKey?: string
  hidden?: boolean
  className?: string
}) {
  const { origin, error } = useBlockOrigin()
  const host = useMemo(
    () => session.hostFor(blockKey, compiled.capabilities),
    [session, blockKey, compiled],
  )
  if (error) return <BlockMessage tone="error">{error}</BlockMessage>
  if (!origin) return null
  return (
    <BlockFrame
      src={cellUrl(origin, session.client.workspace.id, compiled.key)}
      host={host}
      title={title}
      snapshotKey={snapshotKey}
      hidden={hidden}
      className={className}
      onConnection={(connection) =>
        session.attach(blockKey, compiled.key, connection)
      }
    />
  )
}
