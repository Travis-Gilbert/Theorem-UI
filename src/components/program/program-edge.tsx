// SOURCING: React Flow UI button-edge carrying getSmoothStepPath, the routed edge the
// reference's orthogonal connectors need. Its button says what fits on the wire.
// Waypoints: hand-rolled pointer drag over useReactFlow's screenToFlowPosition, since
// xyflow's Pro edge-routing example is not a package and d3-drag adds nothing here.
import { useQuery } from '@tanstack/react-query'
import { Position, getSmoothStepPath, useReactFlow } from '@xyflow/react'
import { useMemo } from 'react'
import type { Edge, EdgeProps } from '@xyflow/react'
import { ButtonEdge } from '@/components/button-edge'
import { Icon, PortClassMark } from '@/components/icons'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import type { Waypoint } from '@/lib/program/api'
import { PORT_COLOR } from '@/lib/program/flow'
import type { PortClass, ProgramEdgeData } from '@/lib/program/flow'
import { useProgramDoc, wireEnds } from '@/lib/program/store'
import { placementsKey, placementsOn, usePalette } from './palette'

const NO_ROUTE: Array<Waypoint> = []

function WaypointHandle({
  edgeId,
  index,
  point,
  route,
}: {
  edgeId: string
  index: number
  point: Waypoint
  route: Array<Waypoint>
}) {
  const flow = useReactFlow()
  const setRoute = useProgramDoc((doc) => doc.setRoute)
  return (
    <button
      type="button"
      aria-label="Waypoint: drag to move, double-click to remove"
      className="nodrag nopan pointer-events-auto absolute size-3 cursor-move rounded-full border-2 border-raised bg-ink-muted"
      style={{
        transform: `translate(-50%, -50%) translate(${point.x}px, ${point.y}px)`,
      }}
      onPointerDown={(event) => {
        event.currentTarget.setPointerCapture(event.pointerId)
      }}
      onPointerMove={(event) => {
        if (!event.currentTarget.hasPointerCapture(event.pointerId)) return
        const next = flow.screenToFlowPosition({
          x: event.clientX,
          y: event.clientY,
        })
        setRoute(
          edgeId,
          route.map((stop, stopIndex) => (stopIndex === index ? next : stop)),
        )
      }}
      onDoubleClick={(event) => {
        // React bubbles through the label portal to the edge, which would add one back.
        event.stopPropagation()
        setRoute(
          edgeId,
          route.filter((_, stopIndex) => stopIndex !== index),
        )
      }}
    />
  )
}

/**
 * What can go on this wire, right on the wire: what runs along it and how many blocks
 * Theorem says fit between its two ends. Opening it places one of them.
 */
function PlacementButton({
  edgeId,
  shape,
  at,
  undetermined,
}: {
  edgeId: string
  shape: PortClass
  at: { x: number; y: number }
  undetermined: boolean
}) {
  const program = useProgramDoc((doc) => doc.program)
  const openOnEdge = usePalette((palette) => palette.openOnEdge)
  const ends = useMemo(() => {
    const edge = program?.edges.find((candidate) => candidate.id === edgeId)
    return program && edge ? wireEnds(program, edge) : {}
  }, [program, edgeId])
  const fits = useQuery({
    enabled: Boolean(ends.from && ends.to),
    queryKey: placementsKey(ends),
    queryFn: () => placementsOn(ends),
    retry: false,
  })
  const Glyph = PortClassMark[shape]
  const count = fits.data?.length
  return (
    <Button
      variant="outline"
      size="xs"
      aria-label={
        count === undefined
          ? 'Place a block on this wire'
          : `Place a block on this wire: ${count} fit`
      }
      title={`${ends.from?.node ?? ''} to ${ends.to?.node ?? ''}`}
      className="h-5 gap-1 rounded-full bg-raised px-1.5 text-[10px] font-normal text-ink-muted shadow-sm"
      onClick={() => openOnEdge(edgeId, at)}
    >
      <Glyph className="size-3" style={{ color: PORT_COLOR[shape] }} />
      {count ?? <Icon.Add className="size-2.5" />}
      {undetermined && <span>undetermined</span>}
    </Button>
  )
}

export function ProgramEdgeView({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  markerEnd,
  animated,
  data,
}: EdgeProps<Edge<ProgramEdgeData>>) {
  const route = useProgramDoc((doc) => doc.layout.reroutes?.[id] ?? NO_ROUTE)
  // Each leg between waypoints is its own smooth step; the middle one holds the button.
  const stops = [
    { x: sourceX, y: sourceY },
    ...route,
    { x: targetX, y: targetY },
  ]
  const legs = stops.slice(1).map((stop, leg) =>
    getSmoothStepPath({
      sourceX: stops[leg]!.x,
      sourceY: stops[leg]!.y,
      targetX: stop.x,
      targetY: stop.y,
      sourcePosition: leg === 0 ? sourcePosition : Position.Right,
      targetPosition: leg === route.length ? targetPosition : Position.Left,
      borderRadius: 8,
    }),
  )
  const path = legs.map(([leg]) => leg).join(' ')
  const [, labelX, labelY] = legs[Math.floor(legs.length / 2)]!
  const verdict = useProgramDoc((doc) => doc.verdicts[id]?.status)
  const shape = data?.shape ?? 'other'
  const dashed = verdict === 'undetermined' || Boolean(data?.undetermined)
  return (
    <ButtonEdge
      id={id}
      sourceX={sourceX}
      sourceY={sourceY}
      targetX={targetX}
      targetY={targetY}
      sourcePosition={sourcePosition}
      targetPosition={targetPosition}
      path={path}
      labelX={labelX}
      labelY={labelY}
      markerEnd={markerEnd}
      style={{ stroke: PORT_COLOR[shape] }}
      className={cn(
        (dashed || data?.ghost) && '[stroke-dasharray:4_4]',
        data?.ghost && 'opacity-50',
        verdict === 'mismatch' && '!stroke-destructive',
        animated && 'animate-pulse',
      )}
      interactionWidth={24}
      along={route.map((point, index) => (
        <WaypointHandle
          key={index}
          edgeId={id}
          index={index}
          point={point}
          route={route}
        />
      ))}
    >
      {!data?.ghost && (
        <PlacementButton
          edgeId={id}
          shape={shape}
          at={{ x: labelX, y: labelY }}
          undetermined={dashed}
        />
      )}
    </ButtonEdge>
  )
}
