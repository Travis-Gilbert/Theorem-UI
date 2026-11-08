// SOURCING: useReducer over machine.ts (the reveal gate), bridge.ts (penpal) for the app, a native <video> for the film. Nothing upstream models this gate; this is the wiring that keeps its three conditions honest.
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
} from 'react'
import type { ReactNode, RefObject } from 'react'
import { openBridge } from './bridge'
import type { Bridge } from './bridge'
import { LOGICAL } from './logical'
import type { AppLayout } from './logical'
import { initialReveal, phaseOf, reveal } from './machine'
import type { Phase, RevealState } from './machine'
import { useMediaQuery } from '@/lib/motion'

export type Destination = 'experience' | 'possibilities' | 'join'
/** The camera's named views. `wide` is the first framing of Experience. */
export type View = 'wide' | Destination
export type Mode = 'scene' | 'flow'

export { LOGICAL }
export type { AppLayout }

export interface LayoutAssets {
  film: string
  poster: string
  /** The film's last frame: the app's exact starting state in this layout. */
  still: string
  ambient?: string
}

export interface FilmAssets {
  captions: string
  desktop: LayoutAssets
  phone: LayoutAssets
  tube: LayoutAssets
}

export const filmAssets: FilmAssets = {
  captions: '/film/captions.vtt',
  desktop: {
    film: '/film/theorem-desktop.mp4',
    poster: '/film/poster-desktop.jpg',
    still: '/film/final-desktop.png',
    ambient: '/film/ambient-desktop.mp4',
  },
  phone: {
    film: '/film/theorem-phone.mp4',
    poster: '/film/poster-phone.jpg',
    still: '/film/final-phone.png',
    ambient: '/film/ambient-phone.mp4',
  },
  tube: {
    film: '/film/theorem-tube.mp4',
    poster: '/film/poster-tube.jpg',
    still: '/film/final-tube.png',
    ambient: '/film/ambient-tube.mp4',
  },
}

export type DraftNote = 'set' | 'kept' | null

export interface Experience {
  state: RevealState
  phase: Phase
  mode: Mode
  destination: Destination
  view: View
  /** The camera has reached the current view. Flow has no camera, so there it always has. */
  settled: boolean
  layout: AppLayout
  appUrl: string | undefined
  assets: FilmAssets
  /** The app takes input here, now. */
  active: boolean
  /** Slow to get ready: says so, and offers a retry and a direct link. */
  slow: boolean
  draftNote: DraftNote
  transcriptOpen: boolean
  setTranscriptOpen: (open: boolean) => void
  motion: boolean
  setMotion: (on: boolean) => void
  iframeRef: RefObject<HTMLIFrameElement | null>
  videoRef: RefObject<HTMLVideoElement | null>
  stageRef: RefObject<HTMLDivElement | null>
  play: () => void
  skip: () => void
  tryApp: () => void
  back: () => void
  retry: () => void
  carryDraft: (text: string) => void
  filmEnded: () => void
  filmFailed: () => void
  cameraArrived: (view: View) => void
}

const Context = createContext<Experience | null>(null)

export function useExperience() {
  const value = useContext(Context)
  if (!value) throw new Error('useExperience outside ExperienceProvider')
  return value
}

const SLOW_MS = 9_000

export interface ExperienceProviderProps {
  appUrl: string | undefined
  assets?: FilmAssets
  mode: Mode
  destination: Destination
  children: ReactNode
}

export function ExperienceProvider({
  appUrl,
  assets = filmAssets,
  mode,
  destination,
  children,
}: ExperienceProviderProps) {
  const [state, dispatch] = useReducer(reveal, !!appUrl, initialReveal)
  const wide = useMediaQuery('(min-width: 64rem)')
  const layout: AppLayout = mode === 'scene' ? 'tube' : wide ? 'desktop' : 'phone'

  // The camera's condition: it counts as settled only for the view it reached,
  // so changing the view un-settles it in the same render, with no gap to race.
  const view: View =
    destination === 'experience'
      ? state.engaged
        ? 'experience'
        : 'wide'
      : destination
  const [arrivedAt, setArrivedAt] = useState<View>(view)
  const cameraSettled = mode === 'flow' || arrivedAt === view
  const phase = phaseOf(state, cameraSettled)
  const here = mode === 'flow' || destination === 'experience'
  const active = phase === 'live' && here

  const iframeRef = useRef<HTMLIFrameElement>(null)
  const videoRef = useRef<HTMLVideoElement>(null)
  const stageRef = useRef<HTMLDivElement>(null)
  const bridge = useRef<Bridge | null>(null)
  const origin = useRef<HTMLElement | null>(null)
  const wantFocus = useRef(false)
  const pendingDraft = useRef<string | null>(null)
  const [epoch, setEpoch] = useState(0)
  const [slow, setSlow] = useState(false)
  const [draftNote, setDraftNote] = useState<DraftNote>(null)
  const [transcriptOpen, setTranscriptOpen] = useState(false)
  const [motion, setMotion] = useState(
    () => !matchMedia('(prefers-reduced-motion: reduce)').matches,
  )

  const remember = () => {
    if (document.activeElement instanceof HTMLElement)
      origin.current = document.activeElement
  }

  const play = useCallback(() => {
    remember()
    const video = videoRef.current
    dispatch({ type: 'play' })
    if (!video) return
    video.src = assets[layout].film
    video.currentTime = 0
    video.muted = false
    // Called inside the click, so sound is allowed. A refusal is still possible,
    // and it lands on the poster with direct entry and the transcript.
    video.play().catch((error: unknown) => {
      if (!(error instanceof DOMException && error.name === 'AbortError'))
        dispatch({ type: 'film-failed' })
    })
  }, [assets, layout])

  const skip = useCallback(() => dispatch({ type: 'film-skipped' }), [])
  const filmEnded = useCallback(() => dispatch({ type: 'film-ended' }), [])
  const filmFailed = useCallback(() => dispatch({ type: 'film-failed' }), [])

  const tryApp = useCallback(() => {
    remember()
    wantFocus.current = true
    dispatch({ type: 'try' })
    if (location.hash.replace(/^#\/?/, '') !== 'experience')
      location.hash = 'experience'
  }, [])

  const back = useCallback(() => {
    dispatch({ type: 'back' })
    if (location.hash.replace(/^#\/?/, '') !== 'experience')
      location.hash = 'experience'
    // After the render that lifts `inert` from where the visitor came from.
    requestAnimationFrame(() => {
      const preventScroll = document.documentElement.dataset.mode === 'scene'
      origin.current?.focus({ preventScroll })
      // An example they came from may be offstage now, and inert.
      if (document.activeElement !== origin.current)
        document.querySelector<HTMLElement>('h1')?.focus({ preventScroll })
    })
  }, [])

  const retry = useCallback(() => {
    dispatch({ type: 'retry' })
    setEpoch((n) => n + 1)
  }, [])

  const carryDraft = useCallback(
    (text: string) => {
      pendingDraft.current = text
      setDraftNote(null)
      tryApp()
    },
    [tryApp],
  )

  const cameraArrived = useCallback((reached: View) => setArrivedAt(reached), [])

  // In flow nothing moves by itself, so going to the monitor means scrolling to it.
  useEffect(() => {
    if (mode === 'flow' && state.engaged)
      stageRef.current?.scrollIntoView({ block: 'center' })
  }, [mode, state.engaged])

  // Any film that is not meant to be playing is stopped.
  useEffect(() => {
    if (state.film !== 'playing') videoRef.current?.pause()
  }, [state.film])

  // A film does not keep talking while the visitor reads another destination.
  useEffect(() => {
    if (destination !== 'experience') dispatch({ type: 'leave' })
  }, [destination])

  // Listening starts before the frame loads, in this layout effect: the iframe
  // exists from this commit, with no src, and the bridge is what navigates it.
  const wanted = state.app !== 'idle' && state.app !== 'absent'
  useLayoutEffect(() => {
    const iframe = iframeRef.current
    if (!wanted || !appUrl || !iframe) return
    const opened = openBridge(iframe, appUrl, {
      onReady: () => dispatch({ type: 'app-ready' }),
      onFailed: () => dispatch({ type: 'app-failed' }),
      onEscape: () => back(),
      onLost: () => {
        dispatch({ type: 'reload' })
        setEpoch((n) => n + 1)
      },
    })
    bridge.current = opened
    return () => {
      opened.destroy()
      bridge.current = null
    }
  }, [wanted, appUrl, epoch, back])

  // Only the app's own ready message opens it. Input follows the gate.
  useEffect(() => {
    if (state.app !== 'ready' || !bridge.current) return
    if (active) {
      const focus = wantFocus.current
      wantFocus.current = false
      bridge.current.activate(focus)
      if (focus) iframeRef.current?.focus({ preventScroll: true })
      const draft = pendingDraft.current
      if (draft) {
        pendingDraft.current = null
        void bridge.current
          .setDraft(draft)
          .then(({ applied }) => setDraftNote(applied ? 'set' : 'kept'))
          .catch(() => setDraftNote(null))
      }
    } else bridge.current.deactivate()
  }, [active, state.app])

  useEffect(() => {
    if (phase === 'live') dispatch({ type: 'entered' })
  }, [phase])

  useEffect(() => {
    setSlow(false)
    if (phase !== 'preparing' || state.entered) return
    const timer = setTimeout(() => setSlow(true), SLOW_MS)
    return () => clearTimeout(timer)
  }, [phase, state.entered, epoch])

  // At the film's end the focused controls go away. Focus lands on the stage,
  // not in the app: the visitor decides when to go in.
  useEffect(() => {
    if (state.film === 'done' && !wantFocus.current) {
      const stage = stageRef.current
      if (stage && stage.contains(document.activeElement))
        stage.focus({ preventScroll: true })
    }
  }, [state.film])

  useEffect(() => {
    if (!state.engaged) return
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !transcriptOpen) back()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [state.engaged, transcriptOpen, back])

  const value = useMemo<Experience>(
    () => ({
      state,
      phase,
      mode,
      destination,
      view,
      settled: cameraSettled,
      layout,
      appUrl,
      assets,
      active,
      slow,
      draftNote,
      transcriptOpen,
      setTranscriptOpen,
      motion,
      setMotion,
      iframeRef,
      videoRef,
      stageRef,
      play,
      skip,
      tryApp,
      back,
      retry,
      carryDraft,
      filmEnded,
      filmFailed,
      cameraArrived,
    }),
    [
      state,
      phase,
      mode,
      destination,
      view,
      cameraSettled,
      layout,
      appUrl,
      assets,
      active,
      slow,
      draftNote,
      transcriptOpen,
      motion,
      play,
      skip,
      tryApp,
      back,
      retry,
      carryDraft,
      filmEnded,
      filmFailed,
      cameraArrived,
    ],
  )

  return <Context.Provider value={value}>{children}</Context.Provider>
}
