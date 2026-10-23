// SOURCING: animejs (spring physics, animate, WAAPI ease conversion for the CSS tokens)
import { animate, spring, waapi } from 'animejs'
import type { FunctionValue, JSAnimation } from 'animejs'

/**
 * Theorem's motion vocabulary. Whatever arrives springs in with visible
 * overshoot; whatever leaves gets out of the way fast and never bounces.
 * Spring durations are perceived: the motion keeps settling a little past them.
 */
export const springs = {
  /** Press release, icon swaps, the copy checkmark. */
  snap: spring({ bounce: 0.3, duration: 220 }),
  /** Rows, cards, layout moves. */
  settle: spring({ bounce: 0.35, duration: 420 }),
  /** Signature moments: send, artifact open, the welcome. */
  lift: spring({ bounce: 0.45, duration: 550 }),
  /** Heights and other structure that must not overshoot. */
  glide: spring({ bounce: 0, duration: 320 }),
}

export type SpringName = keyof typeof springs

/** Leaving: quick and flat. */
export const exit = { ease: 'in(3)', duration: 150 } as const

const reduceQuery =
  typeof window === 'undefined'
    ? undefined
    : window.matchMedia('(prefers-reduced-motion: reduce)')

/** Reduced motion keeps crossfades and drops movement, scale and bounce. */
export const prefersReducedMotion = () => reduceQuery?.matches ?? true

/**
 * Publishes each spring as `--ease-<name>` (a CSS linear() curve) and
 * `--duration-<name>`, so CSS transitions and Base UI popups spring on the
 * same curves as anime.js. Base UI only waits for animations the browser can
 * see, which a CSS transition is and an anime.js JS-engine tween is not.
 */
export function installMotionTokens(root: HTMLElement) {
  for (const [name, curve] of Object.entries(springs)) {
    root.style.setProperty(`--ease-${name}`, waapi.convertEase(curve.ease))
    root.style.setProperty(
      `--duration-${name}`,
      `${Math.round(curve.settlingDuration)}ms`,
    )
  }
}

/**
 * Clears the opacity and transform an entrance left inline once it lands, so
 * the stylesheet rules again. anime's cleanInlineStyles restores the inline
 * style from when the animation began instead, which is a hidden starting
 * frame when the animation replaced an earlier one.
 */
const clean = (animation: JSAnimation) => {
  for (const target of animation.targets)
    if (target instanceof HTMLElement || target instanceof SVGElement) {
      target.style.removeProperty('opacity')
      target.style.removeProperty('transform')
    }
}

/*
 * The entrance helpers below land on explicit resting values. A `from`-only
 * tween animates to whatever the element shows now, which is the previous
 * call's starting frame when an effect runs twice.
 */

/**
 * Something new appears: a small scale-and-turn into place on the given
 * spring. Under reduced motion it only fades.
 */
export function popIn(
  target: Element,
  {
    from = 0.5,
    rotate = 0,
    ease = 'snap',
    delay = 0,
  }: { from?: number; rotate?: number; ease?: SpringName; delay?: number } = {},
) {
  if (prefersReducedMotion())
    return animate(target, {
      opacity: [0, 1],
      duration: 120,
      delay,
      onComplete: clean,
    })
  return animate(target, {
    opacity: { from: 0, to: 1, duration: 120, ease: 'out(2)' },
    scale: { from, to: 1 },
    rotate: { from: rotate, to: 0 },
    ease: springs[ease],
    delay,
    onComplete: clean,
  })
}

/** Something arrives from below and settles. */
export function riseIn(
  target: Element | Array<Element>,
  {
    y = 12,
    ease = 'settle',
    delay = 0,
  }: {
    y?: number
    ease?: SpringName
    delay?: number | FunctionValue
  } = {},
) {
  if (prefersReducedMotion())
    return animate(target, {
      opacity: [0, 1],
      duration: 160,
      delay,
      onComplete: clean,
    })
  return animate(target, {
    opacity: { from: 0, to: 1, duration: 160, ease: 'out(2)' },
    y: { from: y, to: 0 },
    ease: springs[ease],
    delay,
    onComplete: clean,
  })
}

/**
 * Moves an element from where something else was to where it now is,
 * translating only, so text never stretches on the way. `fade` brings it up
 * from faint, for something that is new rather than moved.
 */
export function flyFrom(
  target: HTMLElement,
  origin: DOMRect,
  { fade = true, ease = 'lift' }: { fade?: boolean; ease?: SpringName } = {},
) {
  const rect = target.getBoundingClientRect()
  if (prefersReducedMotion())
    return fade ? riseIn(target, { y: 0 }) : undefined
  return animate(target, {
    x: { from: origin.left - rect.left, to: 0 },
    y: { from: origin.top - rect.top, to: 0 },
    ...(fade && {
      opacity: { from: 0.3, to: 1, duration: 200, ease: 'out(2)' },
    }),
    ease: springs[ease],
    onComplete: clean,
  })
}

/**
 * A temporary copy of a surface that springs from one rect to another while
 * the real surface fades in beneath it, then disappears. For moves between
 * places that different owners render, such as a chat card opening as a dock
 * panel.
 */
export function flyGhost(
  from: DOMRect,
  to: HTMLElement,
  { className, ease = 'lift' }: { className: string; ease?: SpringName },
) {
  if (prefersReducedMotion()) {
    animate(to, { opacity: [0, 1], duration: 160, onComplete: clean })
    return
  }
  const target = to.getBoundingClientRect()
  const ghost = document.createElement('div')
  ghost.className = className
  Object.assign(ghost.style, {
    position: 'fixed',
    left: `${target.left}px`,
    top: `${target.top}px`,
    width: `${target.width}px`,
    height: `${target.height}px`,
    transformOrigin: '0 0',
    pointerEvents: 'none',
    zIndex: '60',
  })
  document.body.append(ghost)
  animate(to, {
    opacity: { from: 0, to: 1, duration: 260, delay: 120, ease: 'out(2)' },
    onComplete: clean,
  })
  animate(ghost, {
    x: { from: from.left - target.left, to: 0 },
    y: { from: from.top - target.top, to: 0 },
    scaleX: { from: from.width / target.width, to: 1 },
    scaleY: { from: from.height / target.height, to: 1 },
    ease: springs[ease],
  })
  animate(ghost, {
    opacity: { to: 0, duration: 220, delay: 260, ease: 'in(2)' },
    onComplete: () => ghost.remove(),
  })
}

const PRESSABLE = 'button, [role="button"], [data-press]'
const UNPRESSABLE =
  '[data-press="off"], :disabled, [aria-disabled="true"], .dv-tab, .dv-sash'

/**
 * Press and release for every button: in on the way down, a springy
 * overshoot on the way back. The squeeze is a few pixels whatever the size,
 * so an icon button dips more than a full-width row.
 */
export function installPress(root: Document) {
  let pressed: HTMLElement | null = null

  const release = () => {
    const target = pressed
    if (!target) return
    animate(target, {
      scale: 1,
      ease: springs.snap,
      onComplete: () => target.style.removeProperty('transform'),
    })
    pressed = null
  }

  const onDown = (event: PointerEvent) => {
    if (event.button !== 0 || prefersReducedMotion()) return
    const target = (event.target as Element | null)?.closest(PRESSABLE)
    if (!(target instanceof HTMLElement)) return
    if (target.matches(UNPRESSABLE) || target.closest('[data-press="off"]'))
      return
    const { width, height } = target.getBoundingClientRect()
    const squeeze = Math.min(0.08, 4 / Math.max(width, height, 1))
    pressed = target
    animate(target, { scale: 1 - squeeze, duration: 110, ease: 'out(3)' })
  }

  root.addEventListener('pointerdown', onDown, { passive: true })
  root.addEventListener('pointerup', release, { passive: true })
  root.addEventListener('pointercancel', release, { passive: true })
  return () => {
    root.removeEventListener('pointerdown', onDown)
    root.removeEventListener('pointerup', release)
    root.removeEventListener('pointercancel', release)
  }
}

/**
 * Phase-locks every looping CSS animation to the document timeline's origin,
 * so spinners, pulses and shimmers that share a period move together instead
 * of each starting whenever its element mounted.
 */
export function installBeat(root: Document) {
  const onStart = (event: AnimationEvent) => {
    const target = event.target
    if (!(target instanceof Element)) return
    for (const animation of target.getAnimations()) {
      if (
        animation instanceof CSSAnimation &&
        animation.animationName === event.animationName &&
        animation.effect?.getTiming().iterations === Infinity
      )
        animation.startTime = 0
    }
  }
  root.addEventListener('animationstart', onStart, true)
  return () => root.removeEventListener('animationstart', onStart, true)
}

/**
 * A quick squash and a springy recovery, for a surface that just pushed
 * something out of itself, like the composer on send.
 */
export function kick(target: HTMLElement, squeeze = 0.015) {
  if (prefersReducedMotion()) return
  animate(target, {
    scale: 1 - squeeze,
    duration: 90,
    ease: 'out(3)',
    onComplete: () =>
      animate(target, {
        scale: 1,
        ease: springs.snap,
        onComplete: () => target.style.removeProperty('transform'),
      }),
  })
}

/**
 * Where something was when it set off, for whatever it becomes to fly from:
 * the composer's text for a sent message, a chat card for its artifact panel.
 */
const launches = new Map<string, { rect: DOMRect; at: number }>()

export function recordLaunch(rect: DOMRect, key = 'composer') {
  launches.set(key, { rect, at: performance.now() })
}

/** The launch point, once, if it was recorded a moment ago. */
export function takeLaunch(key = 'composer') {
  const launch = launches.get(key)
  launches.delete(key)
  return launch && performance.now() - launch.at < 1000
    ? launch.rect
    : undefined
}
