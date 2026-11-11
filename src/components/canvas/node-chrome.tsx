// SOURCING: @xyflow/react NodeResizer and Handle, anime.js popIn for a card arriving. The title sits above the node, as Obsidian Canvas and JSON Canvas viewers draw it, so a file's own frame stays the whole body.
import { Handle, NodeResizer, Position } from '@xyflow/react'
import { useLayoutEffect, useRef } from 'react'
import type { ReactNode } from 'react'
import { popIn } from '@/lib/motion'
import { cn } from '@/lib/utils'
import { useCanvasView } from './canvas-view'

const SIDES = [Position.Top, Position.Right, Position.Bottom, Position.Left]

/** The smallest node worth resizing to; a link card is about this size. */
const MIN = { width: 140, height: 48 }

/** What every placed card has: a title above it, resize handles and four ports. */
export function NodeChrome({
  id,
  selected,
  title,
  actions,
  children,
}: {
  id: string
  selected: boolean
  title?: string
  actions?: ReactNode
  children: ReactNode
}) {
  const body = useRef<HTMLDivElement>(null)
  useLayoutEffect(() => {
    if (useCanvasView.getState().arriving !== id || !body.current) return
    useCanvasView.setState({ arriving: undefined })
    popIn(body.current, { from: 0.86, ease: 'settle' })
  }, [id])
  return (
    <div className="group/node relative size-full" data-selected={selected}>
      <NodeResizer
        isVisible={selected}
        minWidth={MIN.width}
        minHeight={MIN.height}
        lineClassName="!border-focus"
        handleClassName="!size-2 !rounded-sm !border-focus !bg-raised"
      />
      {SIDES.map((side) => (
        <Handle
          key={side}
          id={side}
          type="source"
          position={side}
          // No box of its own, so a line ends on the card's edge; the dot takes the pointer.
          className="!z-10 !size-0 !min-h-0 !min-w-0 !border-0 !bg-transparent opacity-0 transition-opacity group-hover/node:opacity-100 after:absolute after:size-2.5 after:-translate-1/2 after:rounded-full after:border after:border-separator after:bg-raised"
        />
      ))}
      {(title || actions) && (
        <div className="absolute inset-x-0 -top-6 flex h-5 items-center gap-1.5 px-0.5">
          <span className="min-w-0 flex-1 truncate text-xs text-ink-muted">
            {title}
          </span>
          <div
            className={cn(
              'flex items-center gap-1 opacity-0 transition-opacity group-hover/node:opacity-100',
              selected && 'opacity-100',
            )}
          >
            {actions}
          </div>
        </div>
      )}
      <div ref={body} className="size-full">
        {children}
      </div>
    </div>
  )
}

/** The bordered box most bodies sit in. */
export const NODE_BOX =
  'size-full overflow-hidden rounded-xl border border-separator bg-raised shadow-xs group-data-[selected=true]/node:border-focus'
