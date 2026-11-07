// SOURCING: hand-rolled words for Kit's state, as Theorem's ADDENDUM-2 §5 asks the status node to say it ("working · thinking")
import type { Liveness } from './liveness'
import type { KitTag } from './sheet'

export const LIVENESS_WORDS: Record<Liveness, string> = {
  idle: 'idle',
  attend: 'listening',
  work: 'working',
  ask: 'waiting on you',
  done: 'done',
}

export const TAG_WORDS: Record<KitTag, string> = {
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
  walk: 'walking',
  run: 'running',
  crouch: 'crouching',
  air: 'leaping',
  fall: 'falling',
  held: 'held',
  peek: 'peeking',
  sleep: 'asleep',
}

/**
 * Kit's state in words: its liveness, then what the sprite plays, which is
 * the pose or a flourish of the figure's own (sleep, an idle shift).
 */
export const describeKit = (liveness: Liveness, tag: KitTag) =>
  `${LIVENESS_WORDS[liveness]} · ${TAG_WORDS[tag]}`
