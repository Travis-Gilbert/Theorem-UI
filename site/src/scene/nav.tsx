// SOURCING: plain anchors, so Back and the address bar simply work; coss Button for the two controls; lucide-react for their marks.
import { ArrowLeft, Maximize2, Minimize2, Pause, Play } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { nav, possibilities, study } from '@/content'
import { useExperience } from '@/experience/experience'

const CUE_MS = 7_000

/** Back and Expand sit in the bar as quietly as its links: a hairline, no fill. On a phone Back hangs over the page, so it keeps its paper. */
const QUIET = 'border-rule text-slate hover:bg-slate/6 max-md:bg-paper max-md:shadow-xs'

/** Outside the world and outside the frame: it never moves, and it always works. */
export function Nav({
  expand,
}: {
  /** In the room, the app on the tube can be expanded off the glass and put back. */
  expand?: { expanded: boolean; toggle: () => void }
}) {
  const exp = useExperience()
  const { phase, state, draftNote, destination } = exp

  // "Your turn" follows the film only: someone who chose Try does not need telling.
  const turn = phase === 'live' && state.entry === 'film'
  const cue =
    draftNote === 'set'
      ? possibilities.draftSet
      : draftNote === 'kept'
        ? possibilities.draftKept
        : turn
          ? nav.turn
          : ''
  const [shown, setShown] = useState('')
  useEffect(() => {
    setShown(cue)
    if (!cue) return
    const timer = setTimeout(() => setShown(''), CUE_MS)
    return () => clearTimeout(timer)
  }, [cue])

  return (
    <header className="site-nav">
      <a href="#experience" aria-label={nav.home} className="wordmark text-xl md:text-2xl">
        {nav.wordmark}
      </a>
      <p aria-live="polite" className="nav-cue">
        {shown}
      </p>
      <div className="flex items-center md:gap-2">
        {state.engaged && (
          <Button
            variant="ghost"
            size="sm"
            className={`${QUIET} max-md:absolute max-md:top-14 max-md:right-3 max-md:z-50`}
            onClick={exp.back}
          >
            <ArrowLeft aria-hidden />
            {nav.back}
          </Button>
        )}
        {expand && (
          <Button variant="ghost" size="sm" className={QUIET} onClick={expand.toggle}>
            {expand.expanded ? <Minimize2 aria-hidden /> : <Maximize2 aria-hidden />}
            {expand.expanded ? study.collapse : study.expand}
          </Button>
        )}
        <nav aria-label={nav.label} className="flex items-center">
          {nav.links.map((link) => (
            <a
              key={link.id}
              href={link.href}
              aria-current={exp.mode === 'scene' && destination === link.id ? 'true' : undefined}
              className="nav-link"
            >
              {link.label}
            </a>
          ))}
          <a
            href={nav.docs.href}
            target="_blank"
            rel="noreferrer"
            className="nav-link max-[23rem]:hidden"
          >
            {nav.docs.label}
          </a>
        </nav>
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label={exp.motion ? nav.motionOff : nav.motionOn}
          aria-pressed={!exp.motion}
          onClick={() => exp.setMotion(!exp.motion)}
        >
          {exp.motion ? <Pause aria-hidden /> : <Play aria-hidden />}
        </Button>
      </div>
    </header>
  )
}
