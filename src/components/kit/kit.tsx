// SOURCING: lib/kit (the store's act and liveness, the sheet's frames); a CSS background stepped by timers at each frame's boundary rather than every animation frame, image-rendering: pixelated for the 32-pixel sheet; prefersReducedMotion from lib/motion; the status node of Theorem's ADDENDUM-2 §5 (named, described in words, polite, busy only while working)
import { useEffect, useRef } from 'react'
import sheetUrl from '@/assets/kit/kit.png'
import { KIT_SHEET, frameAt, frameOrigin } from '@/lib/kit/sheet'
import type { Shown } from '@/lib/kit/stage'
import { useKit } from '@/lib/kit/store'
import { describeKit } from '@/lib/kit/words'
import { prefersReducedMotion } from '@/lib/motion'
import { cn } from '@/lib/utils'

export { describeKit }

/**
 * Kit, the agent's figure: one fox for the one agent, whichever conversation
 * it is busy in. It shows what it is given (the stage passes its body's
 * motion or a gesture) or else the act the store chose; each frame is held
 * for its own duration and the next is painted on a timer, so between frames
 * nothing repaints. Under reduced motion the first frame stands still. Its
 * status names Kit and says what it is doing.
 */
export function Kit({
  className,
  shown,
  facing = 1,
}: {
  className?: string
  /** What to play instead of the store's act. */
  shown?: Shown
  /** -1 mirrors the sprite to face left. */
  facing?: 1 | -1
}) {
  const act = useKit((state) => state.act)
  const liveness = useKit((state) => state.liveness)
  const sprite = useRef<HTMLDivElement>(null)
  const { tag, since, once } = shown ?? act

  useEffect(() => {
    const node = sprite.current
    if (!node) return
    const paint = (index: number) => {
      const [x, y] = frameOrigin(KIT_SHEET, index)
      node.style.backgroundPosition = `-${x}px -${y}px`
    }
    if (prefersReducedMotion()) {
      paint(KIT_SHEET.tags[tag][0])
      return
    }
    let timer: ReturnType<typeof setTimeout> | undefined
    const show = () => {
      const { index, next } = frameAt(KIT_SHEET, tag, Date.now() - since, once)
      paint(index)
      if (Number.isFinite(next)) timer = setTimeout(show, next)
    }
    show()
    return () => clearTimeout(timer)
  }, [tag, since, once])

  const description = describeKit(liveness, tag)
  return (
    <div
      role="status"
      aria-busy={liveness === 'work'}
      title={`Kit · ${description}`}
      className={cn('relative shrink-0', className)}
      style={{ width: KIT_SHEET.frame, height: KIT_SHEET.frame }}
    >
      <div
        ref={sprite}
        aria-hidden="true"
        className="size-full [image-rendering:pixelated]"
        style={{
          backgroundImage: `url(${sheetUrl})`,
          backgroundSize: `${KIT_SHEET.width}px ${KIT_SHEET.height}px`,
          backgroundRepeat: 'no-repeat',
          transform: facing === -1 ? 'scaleX(-1)' : undefined,
        }}
      />
      <span className="sr-only">Kit, {description}</span>
    </div>
  )
}
