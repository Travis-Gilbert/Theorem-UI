// SOURCING: wouter's useHashLocation for the destination (real #anchors, native Back); in the scene, the study (src/study/world.tsx: @react-three/fiber and drei) with React's createPortal filling its surfaces, so the destinations stay in this tree. Without the scene these are three sections in reading order. The stage and the film are rendered once and moved between the two (src/lib/movable.tsx), so crossing the breakpoint keeps the app and the film.
import { Volume2 } from 'lucide-react'
import { Suspense, lazy, useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { CSSProperties } from 'react'
import { createPortal } from 'react-dom'
import { useHashLocation } from 'wouter/use-hash-location'
import { Button } from '@/components/ui/button'
import { experience as copy, nav, transcript } from '@/content'
import { Field } from '@/field'
import { Film } from '@/experience/film'
import { Monitor } from '@/experience/monitor'
import { FilmFailedNotice, Stage } from '@/experience/stage'
import { Transcript } from '@/experience/transcript'
import { useExperience } from '@/experience/experience'
import type { Destination, Mode } from '@/experience/experience'
import { Join } from '@/join/join'
import { Place, useMovable } from '@/lib/movable'
import { useMediaQuery } from '@/lib/motion'
import { Possibilities } from '@/possibilities/possibilities'
import type { Areas } from '@/study/director'
import type { SurfaceName } from '@/study/surfaces'
import { expandedTube, TUBE_RADIUS, useGlass } from '@/study/tube'
import { tubeEdgeStyle } from '@/study/tube-edge'
import { Nav } from './nav'

/** The room needs the width and height for the desk, motion, and WebGL. */
export const SCENE_QUERY =
  '(min-width: 64rem) and (min-height: 36rem) and (prefers-reduced-motion: no-preference)'

const World = lazy(() => import('@/study/world').then((m) => ({ default: m.World })))

const hasWebGL = typeof window !== 'undefined' && 'WebGL2RenderingContext' in window

export function useSceneMode(): Mode {
  const mode: Mode = useMediaQuery(SCENE_QUERY) && hasWebGL ? 'scene' : 'flow'
  useLayoutEffect(() => {
    document.documentElement.dataset.mode = mode
    return () => void delete document.documentElement.dataset.mode
  }, [mode])
  return mode
}

export const destinationOf = (hash: string): Destination => {
  const id = hash.replace(/^[#/]+/, '')
  return id === 'possibilities' || id === 'join' ? id : 'experience'
}

export function useDestination(): Destination {
  const [path] = useHashLocation()
  return destinationOf(path)
}

export function Scene() {
  const exp = useExperience()
  const { mode, view, destination, state } = exp
  useLayoutEffect(() => {
    document.documentElement.dataset.view = view
    return () => void delete document.documentElement.dataset.view
  }, [view])

  const scene = mode === 'scene'
  const areas = useAreas()

  // The app shows on the tube once the camera is square to it, and stays there for a visitor who has used it.
  const tubeUp =
    scene &&
    exp.phase !== 'watching' &&
    ((view === 'experience' && exp.settled) || (state.entered && state.app === 'ready'))
  // It can be expanded off the glass while it is in front of the visitor and running.
  const canExpand = tubeUp && view === 'experience' && state.app === 'ready'
  const [expanded, setExpanded] = useState(false)
  useEffect(() => {
    if (!canExpand) setExpanded(false)
  }, [canExpand])
  const tubeSize = expanded && canExpand ? expandedTube(areas.destination) : undefined

  // One stage and one film, whichever layout shows them: the app and the film are never remounted.
  const stage = useMovable()
  const film = useMovable()

  // In the scene a destination is reached by the camera, not by scrolling, so
  // focus goes to its heading. Skipped when the visitor is headed into the monitor.
  const previous = useRef(destination)
  useEffect(() => {
    if (previous.current === destination) return
    previous.current = destination
    if (!scene || state.engaged) return
    const focused = () => {
      const heading =
        destination === 'experience'
          ? document.querySelector('#experience h1')
          : document.querySelector(`[data-heading=${destination}]`)
      if (!(heading instanceof HTMLElement)) return false
      heading.focus({ preventScroll: true })
      return true
    }
    if (focused()) return
    // A visitor can pick a destination while the room is still loading; its sheets mount with it.
    const observer = new MutationObserver(() => focused() && observer.disconnect())
    observer.observe(document.body, { childList: true, subtree: true })
    return () => observer.disconnect()
  }, [destination, scene, state.engaged])

  return (
    <>
      {!scene && <Field running={exp.motion && !state.engaged} />}
      <Nav expand={canExpand ? { expanded, toggle: () => setExpanded(!expanded) } : undefined} />
      <main className="scene">
        {scene ? <RoomIntro offstage={view !== 'wide'} /> : <Intro />}
        {scene ? (
          <Room areas={areas} tubeUp={tubeUp} expanded={expanded && canExpand} stage={stage} film={film} />
        ) : (
          <Sections stage={stage} />
        )}
      </main>
      <Transcript />
      {createPortal(<Stage room={scene} logical={tubeSize} film={film} />, stage)}
      {createPortal(<Film placement={scene ? 'viewport' : 'stage'} />, film)}
    </>
  )
}

function Intro() {
  return (
    <div id="experience" className="intro" data-field-quiet>
      <p className="signature">{copy.signature}</p>
      <h1 tabIndex={-1} className="intro-heading outline-none">
        {copy.heading}
      </h1>
      <p className="intro-line">{copy.line}</p>
      <div className="mt-6 flex flex-wrap items-center gap-2">
        <WatchButton size="xl" />
        <TryButton size="xl" />
      </div>
      <TranscriptLink className="mt-3" />
    </div>
  )
}

/**
 * In the room the desk is the opening, and its objects are the ways in. The words
 * stay for a screen reader and for focus. The same ways in wait for the keyboard
 * under the desk, out of sight until one of them has focus.
 */
function RoomIntro({ offstage }: { offstage: boolean }) {
  return (
    <div id="experience">
      <div className="sr-only">
        <p>{copy.signature}</p>
        <h1 tabIndex={-1}>{copy.heading}</h1>
        <p>{copy.line}</p>
      </div>
      <div className="room-bar" inert={offstage}>
        <WatchButton size="lg" />
        <TryButton size="lg" />
        <TranscriptLink />
      </div>
    </div>
  )
}

function WatchButton({ size }: { size: 'lg' | 'xl' }) {
  const exp = useExperience()
  return (
    <Button size={size} className="brass-action" aria-label={copy.watchLabel} onClick={exp.play}>
      <Volume2 aria-hidden />
      {copy.watch}
    </Button>
  )
}

function TryButton({ size }: { size: 'lg' | 'xl' }) {
  const exp = useExperience()
  return (
    <Button size={size} variant="outline" onClick={exp.tryApp}>
      {copy.try}
    </Button>
  )
}

function TranscriptLink({ className = '' }: { className?: string }) {
  const exp = useExperience()
  return (
    <button
      type="button"
      onClick={() => exp.setTranscriptOpen(true)}
      className={`cursor-pointer text-sm text-muted-ink underline underline-offset-3 hover:text-slate ${className}`}
    >
      {transcript.title}
    </button>
  )
}

/** Flow: the monitor, then the two sheets, in reading order. */
function Sections({ stage }: { stage: HTMLElement }) {
  const { state } = useExperience()
  return (
    <div className="world">
      <div data-surface="monitor">
        <Monitor>
          <Place node={stage} />
        </Monitor>
      </div>
      <section id="possibilities" aria-label={nav.links[1].label} data-surface="folio">
        <div className="surface-paper sheet">
          <Possibilities canTry={state.app !== 'absent'} />
        </div>
      </section>
      <section id="join" aria-label={nav.links[2].label} data-surface="pad">
        <div className="surface-paper sheet">
          <Join />
        </div>
      </section>
    </div>
  )
}

const NAV = { wide: 72, destination: 56 }

/** Where each view is framed: the wide view and a destination, each under the bar. */
function measure(): Areas {
  const width = innerWidth
  const height = innerHeight
  return {
    wide: { left: 24, top: NAV.wide, width: width - 48, height: height - NAV.wide - 16 },
    destination: { left: 28, top: NAV.destination + 20, width: width - 56, height: height - NAV.destination - 44 },
  }
}

function useAreas() {
  const [areas, setAreas] = useState<Areas>(measure)
  useEffect(() => {
    const update = () => setAreas(measure())
    addEventListener('resize', update)
    return () => removeEventListener('resize', update)
  }, [])
  return areas
}

/** The scene: the study, with the monitor's app and the two sheets laid on its surfaces. */
function Room({
  areas,
  tubeUp,
  expanded,
  stage,
  film,
}: {
  areas: Areas
  tubeUp: boolean
  expanded: boolean
  stage: HTMLElement
  film: HTMLElement
}) {
  const exp = useExperience()
  const { view, state, phase } = exp
  const tubeSize = expanded ? expandedTube(areas.destination) : undefined
  const screen = useRef<HTMLDivElement>(null)
  const paper = useRef<HTMLDivElement>(null)
  const [targets, setTargets] = useState<Partial<Record<SurfaceName, HTMLDivElement>>>({})
  const [seed] = useState(() => Math.floor(Math.random() * 2 ** 32))
  const onTarget = useCallback(
    (name: SurfaceName, el: HTMLDivElement | null) =>
      setTargets((was) => (was[name] === (el ?? undefined) ? was : { ...was, [name]: el ?? undefined })),
    [],
  )
  // The computer plays the film, which ends on Theorem. A visitor who has been in
  // goes back to the app as they left it, and a film that cannot play goes straight there.
  const select = useCallback(
    (to: Destination) => {
      if (to !== 'experience') location.hash = to
      else if (state.film === 'playing') return
      else if (state.entered || state.film === 'failed') exp.tryApp()
      else {
        if (location.hash.replace(/^#\/?/, '') !== 'experience') location.hash = 'experience'
        exp.play()
      }
    },
    [exp, state.entered, state.film],
  )

  const watching = phase === 'watching'
  const glass = useGlass(tubeUp, expanded)

  return (
    <div className="room" data-tube={tubeUp} data-glass={glass}>
      <Suspense fallback={null}>
        <World
          view={view}
          areas={areas}
          onArrive={exp.cameraArrived}
          film={exp.videoRef}
          watching={watching}
          showFilm={state.engaged && state.entry === 'film' && state.film !== 'failed'}
          glass={glass}
          ambient={exp.assets.tube.ambient ?? ''}
          explore={exp.motion}
          fieldRunning={exp.motion && !state.engaged && view === 'wide'}
          seed={seed}
          layers={{ screen, paper }}
          onTarget={onTarget}
          onSelect={select}
          tubeSize={tubeSize}
        />
      </Suspense>
      <div ref={paper} className="room-layer room-layer-paper" />
      <div ref={screen} className="room-layer room-layer-screen" />
      {targets.tube &&
        createPortal(
          <div
            className="room-tube"
            data-surface="monitor"
            data-expanded={expanded}
            inert={!tubeUp || view !== 'experience'}
            style={{ '--tube-radius': `${TUBE_RADIUS}px`, ...tubeEdgeStyle() } as CSSProperties}
          >
            <Place node={stage} />
          </div>,
          targets.tube,
        )}
      {targets.possibilities &&
        createPortal(
          <section
            aria-label={nav.links[1].label}
            data-surface="folio"
            className="room-sheet"
            inert={view !== 'possibilities'}
          >
            <Possibilities canTry={state.app !== 'absent'} />
          </section>,
          targets.possibilities,
        )}
      {targets.join &&
        createPortal(
          <section aria-label={nav.links[2].label} data-surface="pad" className="room-sheet" inert={view !== 'join'}>
            <Join />
          </section>,
          targets.join,
        )}
      <Place node={film} />
      {/* Where the film's bar was: the tube that would have said so is out of sight. */}
      {phase === 'ambient' && state.film === 'failed' && view === 'wide' && (
        <div className="film-viewport grid justify-items-center">
          <FilmFailedNotice />
        </div>
      )}
    </div>
  )
}
