// SOURCING: hand-rolled. This is the brief's reveal gate as a pure reducer: three independent conditions and a phase derived from them. It is small enough that a statechart library would add a dependency without modelling anything more.

/** What the visitor sees in the monitor. Derived, never stored. */
export type Phase = 'ambient' | 'watching' | 'preparing' | 'live' | 'unavailable'

/** `absent` means no app is configured for this build: there is nothing to retry. */
export type AppStatus = 'absent' | 'idle' | 'loading' | 'ready' | 'failed'
export type FilmStatus = 'idle' | 'playing' | 'done' | 'failed'
/** `film` arrived by watching; `try` asked for the app, and only that may move input focus. */
export type Entry = 'film' | 'try' | null

export interface RevealState {
  /** The visitor is at the monitor: watching, waiting for the app, or using it. */
  engaged: boolean
  film: FilmStatus
  app: AppStatus
  entry: Entry
  /** The app has been shown once. From here its own state is what the visitor left, so the still never covers it again. */
  entered: boolean
}

export type RevealEvent =
  | { type: 'play' }
  | { type: 'try' }
  | { type: 'film-ended' }
  | { type: 'film-skipped' }
  | { type: 'film-failed' }
  | { type: 'app-ready' }
  | { type: 'app-failed' }
  | { type: 'retry' }
  /** The frame lost its document and is being loaded again. */
  | { type: 'reload' }
  /** Navigated to another destination. */
  | { type: 'leave' }
  /** Back to the wide view of the same destination. */
  | { type: 'back' }
  | { type: 'entered' }

export const initialReveal = (hasApp: boolean): RevealState => ({
  engaged: false,
  film: 'idle',
  app: hasApp ? 'idle' : 'absent',
  entry: null,
  entered: false,
})

const wantApp = (app: AppStatus): AppStatus => (app === 'idle' ? 'loading' : app)

export function reveal(state: RevealState, event: RevealEvent): RevealState {
  switch (event.type) {
    case 'play':
      return {
        ...state,
        engaged: true,
        film: 'playing',
        app: wantApp(state.app),
        entry: 'film',
      }
    case 'try':
      // Trying while the film runs is a skip: the film condition is complete.
      return {
        ...state,
        engaged: true,
        film: 'done',
        app: wantApp(state.app),
        entry: 'try',
      }
    case 'film-ended':
    case 'film-skipped':
      return state.film === 'playing' ? { ...state, film: 'done' } : state
    case 'film-failed':
      return state.film === 'playing'
        ? { ...state, film: 'failed', engaged: false, entry: null }
        : state
    case 'app-ready':
      return state.app === 'loading' ? { ...state, app: 'ready' } : state
    case 'app-failed':
      return state.app === 'absent' ? state : { ...state, app: 'failed' }
    case 'retry':
      return state.app === 'failed' || state.app === 'loading'
        ? { ...state, app: 'loading' }
        : state
    case 'reload':
      return state.app === 'absent' || state.app === 'idle' ? state : { ...state, app: 'loading' }
    case 'leave':
      // A film stops at navigation and does not resume by itself. A visitor who
      // reached the app keeps it: coming back returns them to their own state.
      return state.film === 'playing'
        ? { ...state, film: 'idle', engaged: false, entry: null }
        : state
    case 'back':
      return {
        ...state,
        engaged: false,
        entry: null,
        film: state.film === 'playing' ? 'idle' : state.film,
      }
    case 'entered':
      return state.entered ? state : { ...state, entered: true }
  }
}

/**
 * The gate. `cameraSettled` comes from the scene (flow and reduced motion have
 * no camera, so it is always true there). Nothing here reads a clock: a timeout
 * can fail the app, and it can never make it ready.
 */
export function phaseOf(state: RevealState, cameraSettled: boolean): Phase {
  if (!state.engaged) return 'ambient'
  if (state.film === 'playing') return 'watching'
  if (state.app === 'failed' || state.app === 'absent') return 'unavailable'
  if (state.app === 'ready' && cameraSettled) return 'live'
  return 'preparing'
}

/** The final still covers the frame only until the app has been shown once. */
export const coverIsUp = (state: RevealState, phase: Phase) =>
  !state.entered && (phase === 'preparing' || phase === 'unavailable')
