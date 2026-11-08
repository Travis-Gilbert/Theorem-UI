// SOURCING: hand-roll, an SVG of a Space's rects and lines. xyflow's MiniMap is the nearest upstream thing, and it only draws the flow of the provider around it, so showing another Space would mean mounting a whole second React Flow per thumbnail. useSpaceRecord reads the Space.
import { useSpaceRecord } from '@/lib/theorem/spaces'
import { cn } from '@/lib/utils'

const PADDING = 16

/** A small drawing of what a canvas holds. */
export function SpacePreview({
  spaceId,
  title = 'Canvas',
  className,
}: {
  spaceId: string
  title?: string
  className?: string
}) {
  const record = useSpaceRecord({ kind: 'custom', spaceId, title })
  const space = record.data?.space
  const placements = space?.placements ?? []
  const groups = space?.groups ?? []
  const rects = [...placements, ...groups].map((item) => item.rect)
  if (!rects.length)
    return (
      <div
        className={cn(
          'flex items-center justify-center text-xs text-ink-faint',
          className,
        )}
      >
        {record.isPending ? 'Loading…' : 'Nothing here yet'}
      </div>
    )
  const left = Math.min(...rects.map((r) => r.x)) - PADDING
  const top = Math.min(...rects.map((r) => r.y)) - PADDING
  const right = Math.max(...rects.map((r) => r.x + r.w)) + PADDING
  const bottom = Math.max(...rects.map((r) => r.y + r.h)) + PADDING
  const centers = new Map(
    placements.map((p) => [
      p.id,
      { x: p.rect.x + p.rect.w / 2, y: p.rect.y + p.rect.h / 2 },
    ]),
  )
  return (
    <svg
      aria-hidden
      viewBox={`${left} ${top} ${right - left} ${bottom - top}`}
      preserveAspectRatio="xMidYMid meet"
      className={className}
    >
      {groups.map((g) => (
        <rect
          key={g.id}
          x={g.rect.x}
          y={g.rect.y}
          width={g.rect.w}
          height={g.rect.h}
          rx={12}
          vectorEffect="non-scaling-stroke"
          className="fill-ink/4 stroke-separator"
        />
      ))}
      {(space?.connections ?? []).flatMap((c) => {
        const from = centers.get(c.from)
        const to = centers.get(c.to)
        return from && to ? (
          <line
            key={c.id}
            x1={from.x}
            y1={from.y}
            x2={to.x}
            y2={to.y}
            vectorEffect="non-scaling-stroke"
            className="stroke-ink-faint"
          />
        ) : (
          []
        )
      })}
      {placements.map((p) => (
        <rect
          key={p.id}
          x={p.rect.x}
          y={p.rect.y}
          width={p.rect.w}
          height={p.rect.h}
          rx={8}
          vectorEffect="non-scaling-stroke"
          className="fill-raised stroke-ink-faint"
        />
      ))}
    </svg>
  )
}
