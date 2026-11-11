// SOURCING: lib/face's own identity and feature outline, drawn once as SVG: the still mark the handoff asks for in the gutter of earlier replies, where the moving face is not (docs/plans/theo-face.md). It replaces the folder mark (Icon.Speaker) the gutter had.
import { useAuiState } from '@assistant-ui/react'
import { Icon } from '@/components/icons'
import { outlinePath, restShape } from '@/lib/face/feature'
import { THEO } from '@/lib/face/identity'
import { useFigures } from '@/lib/figures'

const EYES = [-1, 1].map((side) => outlinePath(restShape(side as -1 | 1), 40))
const HALF_W = THEO.width / 2
const HALF_H = THEO.height / 2

/** Theo's face, still: the visor and two eyes at rest. */
export function FaceMark({ className }: { className?: string }) {
  return (
    <svg
      viewBox={`${-HALF_W} ${-HALF_H} ${THEO.width} ${THEO.height}`}
      className={className}
      aria-hidden
    >
      <rect
        x={-HALF_W}
        y={-HALF_H}
        width={THEO.width}
        height={THEO.height}
        rx={18}
        className="face-mark-plate"
      />
      {EYES.map((path) => (
        <path key={path} d={path} className="face-mark-eye" />
      ))}
    </svg>
  )
}

/**
 * The mark in an assistant message's gutter. The live reply's slot is where
 * the moving face rests, so it is left empty for it; earlier replies get the
 * still mark. With Theo switched off the gutter is as it was.
 */
export function FaceSlot() {
  const on = useFigures((state) => state.theo)
  const live = useAuiState((s) => s.message.isLast)
  if (!on)
    return (
      <span
        aria-hidden
        className="text-ink-muted flex size-8 items-center justify-center"
      >
        <Icon.Speaker className="size-5" />
      </span>
    )
  return (
    <span
      aria-hidden
      data-face-perch={live ? 'live' : undefined}
      className="flex size-8 items-center justify-center"
    >
      {live ? null : <FaceMark className="w-7 opacity-70" />}
    </span>
  )
}
