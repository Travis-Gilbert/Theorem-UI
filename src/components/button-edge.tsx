// SOURCING: React Flow UI button-edge, copied by the shadcn CLI; extended to take a
// routed path and label point, so it can carry the canvas's stepped, waypointed edges
// and anything drawn along them. It falls back to the scaffold's own bezier.
import { BaseEdge, EdgeLabelRenderer, getBezierPath } from '@xyflow/react'
import type { EdgeProps } from '@xyflow/react'
import type { ReactNode } from 'react'

export function ButtonEdge({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  style = {},
  markerEnd,
  interactionWidth,
  className,
  path,
  labelX,
  labelY,
  along,
  children,
}: Pick<
  EdgeProps,
  | 'id'
  | 'sourceX'
  | 'sourceY'
  | 'targetX'
  | 'targetY'
  | 'sourcePosition'
  | 'targetPosition'
  | 'style'
  | 'markerEnd'
  | 'interactionWidth'
> & {
  className?: string
  path?: string
  labelX?: number
  labelY?: number
  /** Rendered in the label layer, beside the button. */
  along?: ReactNode
  children: ReactNode
}) {
  const [edgePath, bezierX, bezierY] = getBezierPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
  })
  return (
    <>
      <BaseEdge
        id={id}
        path={path ?? edgePath}
        markerEnd={markerEnd}
        style={style}
        className={className}
        interactionWidth={interactionWidth}
      />
      <EdgeLabelRenderer>
        {along}
        <div
          className="nodrag nopan pointer-events-auto absolute"
          style={{
            transform: `translate(-50%, -50%) translate(${labelX ?? bezierX}px,${labelY ?? bezierY}px)`,
          }}
        >
          {children}
        </div>
      </EdgeLabelRenderer>
    </>
  )
}
