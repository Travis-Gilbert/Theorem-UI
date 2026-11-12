// SOURCING: none. What the prototype screen shows for each thing the native module reports (modules/theo-capture). No React Native imports, so it is tested without a phone.
//
// A screen-sharing session as the phone knows it. Everything here is a report
// from the system or a count of what it delivered. A frame is a still with a
// sequence number and a time; anything said about a frame names that frame.

export type Phase = 'idle' | 'picking' | 'capturing' | 'stopped' | 'failed'

export type Frame = { sequence: number; uri: string; width: number; height: number; capturedAtMs: number }

export type Session = {
  phase: Phase
  /** Why it stopped or failed, in the system's or the module's words. */
  reason: string
  /** The person turned the microphone on in the system picker. */
  microphone: boolean
  startedAtMs?: number
  frame?: Frame
  frames: number
  microphoneBuffers: number
  /** Frames delivered while the app was not in front: the evidence that sharing survived switching apps. */
  framesWhileAway: number
}

export const initial: Session = {
  phase: 'idle',
  reason: '',
  microphone: false,
  frames: 0,
  microphoneBuffers: 0,
  framesWhileAway: 0,
}

export type Event =
  | { type: 'state'; state: Phase; reason: string; microphone: boolean; atMs: number }
  | { type: 'frame'; frame: Frame; appActive: boolean }
  | { type: 'stats'; frames: number; microphoneBuffers: number }

export function reduce(session: Session, event: Event): Session {
  switch (event.type) {
    case 'state':
      if (event.state === 'picking') return { ...initial, phase: 'picking' }
      if (event.state === 'capturing')
        return {
          ...session,
          phase: 'capturing',
          reason: '',
          microphone: event.microphone,
          startedAtMs: event.atMs,
        }
      // The last still stays on screen after sharing ends, marked as old by `staleness`.
      return { ...session, phase: event.state, reason: event.reason, microphone: false }
    case 'frame':
      // Frames can arrive out of order across the bridge; an older one never replaces a newer one.
      if (session.frame && event.frame.sequence <= session.frame.sequence) return session
      return {
        ...session,
        frame: event.frame,
        frames: Math.max(session.frames, event.frame.sequence),
        framesWhileAway: session.framesWhileAway + (event.appActive ? 0 : 1),
      }
    case 'stats':
      return {
        ...session,
        frames: Math.max(session.frames, event.frames),
        microphoneBuffers: Math.max(session.microphoneBuffers, event.microphoneBuffers),
      }
  }
}

/** A still older than this is not what the screen looks like now. */
export const LIVE_WITHIN_MS = 3_000

export type Staleness = 'live' | 'old' | 'ended' | 'none'

/** Whether the still is current. Only a live still may be talked about as "what you are looking at". */
export function staleness(session: Session, nowMs: number): Staleness {
  if (!session.frame) return 'none'
  if (session.phase !== 'capturing') return 'ended'
  return nowMs - session.frame.capturedAtMs <= LIVE_WITHIN_MS ? 'live' : 'old'
}

export function statusLine(session: Session): {
  label: string
  detail: string
  tone: 'neutral' | 'live' | 'attention' | 'error'
} {
  switch (session.phase) {
    case 'idle':
      return { label: 'Not sharing', detail: 'Nothing on this phone is being captured.', tone: 'neutral' }
    case 'picking':
      return {
        label: 'Waiting for you',
        detail:
          'Choose in the system’s sheet whether to share the screen, and whether to include the microphone.',
        tone: 'attention',
      }
    case 'capturing':
      return {
        label: 'Sharing the screen',
        detail: session.microphone
          ? 'The whole screen and the microphone are being captured, including in other apps.'
          : 'The whole screen is being captured, including in other apps. The microphone is off.',
        tone: 'live',
      }
    case 'stopped':
      return { label: 'Stopped', detail: session.reason || 'Sharing ended.', tone: 'neutral' }
    case 'failed':
      return {
        label: 'Could not share',
        detail: session.reason || 'The system did not say why.',
        tone: 'error',
      }
  }
}

/**
 * What only a person holding the phone can establish. `seen` is filled from
 * counts where a count can show it; the rest stay for the person to answer.
 */
export function deviceChecks(session: Session): { check: string; seen: boolean | undefined; how: string }[] {
  return [
    {
      check: 'Sharing starts from the system picker',
      seen: session.frames > 0 ? true : undefined,
      how: 'Start sharing and choose the whole screen. Frames delivered rises above zero.',
    },
    {
      check: 'Frames keep arriving in other apps',
      seen: session.framesWhileAway > 0 ? true : undefined,
      how: 'While sharing, switch to another app for ten seconds and come back. Frames while away rises above zero.',
    },
    {
      check: 'The microphone keeps delivering in other apps',
      seen: undefined,
      how: 'Turn the microphone on in the picker, note Microphone buffers, spend ten seconds in another app, and compare.',
    },
    {
      check: 'Speech plays while sharing with the microphone on',
      seen: undefined,
      how: 'While sharing, press Speak a test line. You should hear it, and sharing should continue.',
    },
    {
      check: 'A call or Siri interrupts and sharing recovers or says it stopped',
      seen: undefined,
      how: 'While sharing, take a phone call or invoke Siri. Note whether the state changes and what reason is shown.',
    },
    {
      check: 'Stopping from the system control is reported here',
      seen: undefined,
      how: 'Stop sharing from the system’s recording control, not this screen. The state should become Stopped with a reason.',
    },
    {
      check: 'Sharing starts again after a stop',
      seen: undefined,
      how: 'After any stop, start sharing again. Frames delivered should restart from one.',
    },
  ]
}
