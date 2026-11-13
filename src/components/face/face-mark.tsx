// SOURCING: lib/face's own identity and feature outline, drawn once as SVG: the still mark of Theo's face, for the settings rows that name it. Earlier replies' gutters were given it by the handoff (docs/plans/theo-face.md); the owner since asked for Theo beside the latest reply only, so they are left empty. It replaced the folder mark (Icon.Speaker) the gutter had.
import { useAuiState } from '@assistant-ui/react'
import type { CSSProperties } from 'react'
import { Icon } from '@/components/icons'
import { outlinePath, restShape } from '@/lib/face/feature'
import { THEO } from '@/lib/face/identity'
import { useFigures } from '@/lib/figures'
import { eyeColour, useFaceHue, useFaceLook } from './look'

const EYES = [-1, 1].map((side) => outlinePath(restShape(side as -1 | 1), 40))
const HALF_W = THEO.width / 2
const HALF_H = THEO.height / 2

/** Theo's face, still: two eyes at rest, on the visor when it has one. */
export function FaceMark({ className }: { className?: string }) {
  const look = useFaceLook()
  const hue = useFaceHue()
  return (
    <svg
      viewBox={`${-HALF_W} ${-HALF_H} ${THEO.width} ${THEO.height}`}
      className={className ? `face-mark ${className}` : 'face-mark'}
      style={{ '--face-eye': eyeColour(hue) } as CSSProperties}
      aria-hidden
    >
      {look.visor ? (
        <rect
          x={-HALF_W}
          y={-HALF_H}
          width={THEO.width}
          height={THEO.height}
          rx={18}
          className="face-mark-plate"
        />
      ) : null}
      {EYES.map((path) => (
        <path
          key={path}
          d={path}
          className="face-mark-eye"
          data-ink={look.ink ? '' : undefined}
        />
      ))}
    </svg>
  )
}

/**
 * The slot in an assistant message's gutter. The live reply's is where the
 * moving face rests, so it is left empty for it. Theo appears beside the
 * latest reply only, so earlier replies keep the slot, for the column, with
 * nothing in it. With Theo switched off the gutter is as it was.
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
    />
  )
}
