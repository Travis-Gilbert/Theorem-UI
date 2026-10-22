// SOURCING: none — a one-shot IntersectionObserver latch; no library fits a flag this small
import { useEffect, useState } from 'react'
import type { RefObject } from 'react'

/**
 * True once the element has come within `margin` of the viewport, and true
 * from then on. Clipping by scrolling ancestors counts, so a row deep in a
 * scrolled list or a collapsed panel stays unseen until it is scrolled to.
 */
export function useSeen(ref: RefObject<Element | null>, margin = '200px') {
  const [seen, setSeen] = useState(false)
  useEffect(() => {
    const element = ref.current
    if (seen || !element) return
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) setSeen(true)
      },
      { rootMargin: margin },
    )
    observer.observe(element)
    return () => observer.disconnect()
  }, [ref, margin, seen])
  return seen
}
