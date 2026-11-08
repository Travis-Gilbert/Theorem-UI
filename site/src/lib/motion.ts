// SOURCING: animejs 4 (the press spring); useSyncExternalStore over matchMedia for the page's two media questions. This file only names them.
import { animate, spring } from 'animejs'
import { useSyncExternalStore } from 'react'

export const reducedMotion = () =>
  typeof matchMedia === 'function' &&
  matchMedia('(prefers-reduced-motion: reduce)').matches

/** A button giving under the finger and springing back. */
export function press(el: HTMLElement | null, down: boolean) {
  if (!el || reducedMotion()) return
  animate(
    el,
    down
      ? { scale: 0.97, ease: 'outQuad', duration: 90 }
      : { scale: 1, ease: spring({ bounce: 0.5, duration: 400 }) },
  )
}

export function useMediaQuery(query: string) {
  return useSyncExternalStore(
    (changed) => {
      const list = matchMedia(query)
      list.addEventListener('change', changed)
      return () => list.removeEventListener('change', changed)
    },
    () => matchMedia(query).matches,
  )
}
