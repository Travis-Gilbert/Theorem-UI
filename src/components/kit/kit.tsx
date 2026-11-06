// SOURCING: lib/kit (the store's act and liveness, the sheet's frames); a CSS background stepped by timers at each frame's boundary rather than every animation frame, image-rendering: pixelated for the 32-pixel sheet; prefersReducedMotion from lib/motion; the status node of Theorem's ADDENDUM-2 §5 (named, described in words, polite, busy only while working)
import { useEffect, useRef } from 'react'
import sheetUrl from '@/assets/kit/kit.png'
import type { Liveness, Pose } from '@/lib/kit/liveness'
import { KIT_SHEET, frameAt, frameOrigin } from '@/lib/kit/sheet'
import { useKit } from '@/lib/kit/store'
import { prefersReducedMotion } from '@/lib/motion'
import { cn } from '@/lib/utils'

const LIVENESS_WORDS: Record<Liveness, string> = {
  idle: 'idle',
  attend: 'listening',
  work: 'working',
  ask: 'waiting on you',
  done: 'done',
}

const POSE_WORDS: Record<Pose, string> = {
  rest: 'resting',
  lean_in: 'leaning in',
  think: 'thinking',
  nod: 'nodding',
  tilt: 'head tilted',
  shrug: 'shrugging',
  wave: 'waving',
  point: 'pointing',
  stretch: 'stretching',
  celebrate: 'celebrating',
  sit: 'sitting',
  sway: 'swaying',
  pounce: 'pouncing',
}

/** Kit's state in words: its liveness, then the pose it holds. */
export const describeKit = (liveness: Liveness, pose: Pose) =>
  `${LIVENESS_WORDS[liveness]} · ${POSE_WORDS[pose]}`

/**
 * Kit, the agent's figure: one fox for the one agent, whichever conversation
 * it is busy in. It shows the act the store chose; each frame is held for its
 * own duration and the next is painted on a timer, so between frames nothing
 * repaints. Under reduced motion the act's first frame stands still. It is
 * read, not operated: a status that names Kit and says what it is doing.
 */
export function Kit({ className }: { className?: string }) {
  const act = useKit((state) => state.act)
  const liveness = useKit((state) => state.liveness)
  const pose = useKit((state) => state.pose)
  const sprite = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const node = sprite.current
    if (!node) return
    const paint = (index: number) => {
      const [x, y] = frameOrigin(KIT_SHEET, index)
      node.style.backgroundPosition = `-${x}px -${y}px`
    }
    if (prefersReducedMotion()) {
      paint(KIT_SHEET.tags[act.tag][0])
      return
    }
    let timer: ReturnType<typeof setTimeout> | undefined
    const show = () => {
      const { index, next } = frameAt(
        KIT_SHEET,
        act.tag,
        Date.now() - act.since,
        act.once,
      )
      paint(index)
      if (Number.isFinite(next)) timer = setTimeout(show, next)
    }
    show()
    return () => clearTimeout(timer)
  }, [act])

  const description = describeKit(liveness, pose)
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
        }}
      />
      <span className="sr-only">Kit, {description}</span>
    </div>
  )
}
