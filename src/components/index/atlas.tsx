// SOURCING: honeycomb-grid (axial hex geometry: corners and centres from the Atlas's q,r cells) drawn as SVG; the AtlasSnapshot v2 wire shape from Theorem's theorem_index_atlas
import { Orientation, defineHex } from 'honeycomb-grid'
import { useMemo, useState } from 'react'
import { cn } from '@/lib/utils'
import type { AtlasCell, AtlasOverlay, AtlasSnapshot } from './contract'

const AtlasHex = defineHex({ dimensions: 14, orientation: Orientation.POINTY })

const STATE_TEXT: Record<AtlasSnapshot['state'], string | undefined> = {
  ready: undefined,
  partial: 'Some material has no embedding yet, so it is not on the map.',
  empty: 'The map has no material on it yet.',
  unavailable: 'The map is not available right now.',
  legacy_unverified:
    'This map was made before the current embedding space and has not been checked against it.',
  migration_needed:
    'The map needs to be rebuilt for the current embedding space.',
}

function overlayValue(cell: AtlasCell, overlay: AtlasOverlay, now: number) {
  switch (overlay) {
    case 'density':
      return cell.density
    case 'boundary':
      return cell.boundary
    case 'quantization_error':
      return cell.mean_quantization_error ?? 0
    case 'activity':
      // Activity fades over a fortnight.
      return cell.latest_activity_ms === null
        ? 0
        : Math.max(0, 1 - (now - cell.latest_activity_ms) / 1_209_600_000)
  }
}

/**
 * The Atlas: the active map generation's cells, shaded by one overlay. A cell
 * opens the documents assigned to it. The map shows where material sits by
 * meaning; it never decides where anything is filed.
 */
export function AtlasMap({
  snapshot,
  overlay,
  onOpen,
}: {
  snapshot: AtlasSnapshot | null
  overlay: AtlasOverlay
  onOpen: (objectId: string) => void
}) {
  const [cellId, setCellId] = useState<number>()
  // A frozen generation is drawn once; the clock only feeds the activity fade.
  const [now] = useState(() => Date.now())

  const drawn = useMemo(() => {
    if (!snapshot?.cells.length) return undefined
    const values = snapshot.cells.map((cell) =>
      overlayValue(cell, overlay, now),
    )
    const max = Math.max(...values, Number.EPSILON)
    const hexes = snapshot.cells.map((cell, index) => {
      const hex = new AtlasHex({ q: cell.q, r: cell.r })
      return {
        cell,
        points: hex.corners.map(({ x, y }) => `${x},${y}`).join(' '),
        x: hex.x,
        y: hex.y,
        strength: (values[index] ?? 0) / max,
      }
    })
    const xs = hexes.flatMap((h) => [h.x - 14, h.x + 14])
    const ys = hexes.flatMap((h) => [h.y - 14, h.y + 14])
    const minX = Math.min(...xs)
    const minY = Math.min(...ys)
    return {
      hexes,
      viewBox: `${minX} ${minY} ${Math.max(...xs) - minX} ${Math.max(...ys) - minY}`,
    }
  }, [snapshot, overlay, now])

  if (!snapshot)
    return (
      <p className="rounded-lg border border-dashed border-separator px-3 py-6 text-center text-sm text-ink-muted">
        The Atlas is not on this server yet. Search and collections work without
        it.
      </p>
    )

  const notice = STATE_TEXT[snapshot.state]
  const members = snapshot.objects.filter(
    (object) =>
      object.assignment.status === 'assigned' &&
      object.assignment.cell === cellId,
  )
  const unplaced = snapshot.total_objects - snapshot.assigned_objects

  return (
    <div className="flex flex-col gap-3">
      {notice && (
        <p className="rounded-lg border border-ochre/40 bg-ochre/8 px-3 py-2 text-sm">
          {notice}
        </p>
      )}
      {drawn && (
        <svg
          role="img"
          aria-label={`Atlas, ${snapshot.cells.length} cells, ${overlay.replaceAll('_', ' ')}`}
          viewBox={drawn.viewBox}
          className="max-h-[420px] w-full"
        >
          {drawn.hexes.map(({ cell, points, strength, x, y }) => (
            <g key={cell.cell}>
              <polygon
                points={points}
                onClick={() => setCellId(cell.cell)}
                className={cn(
                  'cursor-pointer stroke-sheet transition-[fill-opacity]',
                  cell.cell === cellId ? 'fill-redwood' : 'fill-teal',
                )}
                style={{
                  fillOpacity:
                    cell.cell === cellId ? 0.9 : 0.08 + strength * 0.8,
                  strokeWidth: 1.5,
                }}
              >
                <title>
                  {cell.label ?? `Cell ${cell.cell}`} · {cell.density} documents
                </title>
              </polygon>
              {cell.label && strength > 0.6 && (
                <text
                  x={x}
                  y={y}
                  textAnchor="middle"
                  dominantBaseline="middle"
                  className="pointer-events-none fill-ink text-[6px]"
                >
                  {cell.label.slice(0, 10)}
                </text>
              )}
            </g>
          ))}
        </svg>
      )}
      <p className="text-xs text-ink-faint tabular-nums">
        {snapshot.assigned_objects} of {snapshot.total_objects} on the map
        {unplaced > 0 && ` · ${unplaced} not placed`}
        {snapshot.map_generation && ` · generation ${snapshot.map_generation}`}
      </p>
      {cellId !== undefined && (
        <ul className="flex flex-col rounded-lg border border-separator">
          {members.length === 0 && (
            <li className="px-3 py-2 text-sm text-ink-muted">
              No documents in this cell.
            </li>
          )}
          {members.map((object) => (
            <li key={object.object_id}>
              <button
                type="button"
                onClick={() => onOpen(object.object_id)}
                className="flex w-full items-baseline gap-2 px-3 py-2 text-start text-sm outline-none hover:bg-hover/60 focus-visible:bg-hover"
              >
                <span className="min-w-0 flex-1 truncate">{object.title}</span>
                <span className="text-[11px] text-ink-faint">
                  {object.kind}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
