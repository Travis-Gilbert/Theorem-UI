// SOURCING: animejs (createAnimatable for the magnetic pull, splitText + stagger for word entrances, createLayout for list reorders, animate on a plain object for the gliding highlight, a looping rotate whose speed is tweened for the spinning mark); MutationObserver to glide when the selected row changes or rows move; ResizeObserver to follow rows that move without a reorder over src/lib/motion; assistant-ui useAui for reading a message's state at mount
import { useAui } from '@assistant-ui/react'
import {
  animate,
  createAnimatable,
  createLayout,
  splitText,
  stagger,
  utils,
} from 'animejs'
import type { AutoLayout, JSAnimation, Timeline } from 'animejs'
import { useCallback, useEffect, useRef, useState } from 'react'
import type { ReactNode, RefObject } from 'react'
import { useIsomorphicLayoutEffect } from '@/components/assistant-ui/utils/useIsomorphicLayoutEffect'
import {
  installBeat,
  installMotionTokens,
  installPress,
  installSpin,
  popIn,
  prefersReducedMotion,
  riseIn,
  springs,
} from '@/lib/motion'
import type { SpringName } from '@/lib/motion'
import { cn } from '@/lib/utils'

/** Installs the app-wide motion: spring tokens, press and release, the shared beat. */
export function MotionRoot() {
  useEffect(() => {
    installMotionTokens(document.documentElement)
    const offPress = installPress(document)
    const offBeat = installBeat(document)
    return () => {
      offPress()
      offBeat()
    }
  }, [])
  return null
}

/** Leans a little toward the pointer and springs back when it leaves. */
export function Magnet({
  children,
  strength,
  max,
  className,
}: {
  children: ReactNode
  strength?: number
  max?: number
  className?: string
}) {
  const ref = useRef<HTMLSpanElement>(null)
  useMagnet(ref, { strength, max })
  return (
    <span ref={ref} className={cn('inline-flex', className)}>
      {children}
    </span>
  )
}

/** The pull behind Magnet, for an element that is already in the layout. */
export function useMagnet(
  ref: RefObject<HTMLElement | null>,
  { strength = 0.25, max = 5 }: { strength?: number; max?: number } = {},
) {
  useEffect(() => {
    const element = ref.current
    if (
      !element ||
      prefersReducedMotion() ||
      !window.matchMedia('(hover: hover)').matches
    )
      return
    const pull = createAnimatable(element, {
      x: 0,
      y: 0,
      ease: springs.settle,
    })
    const move = (event: PointerEvent) => {
      const rect = element.getBoundingClientRect()
      const dx = event.clientX - (rect.left + rect.width / 2)
      const dy = event.clientY - (rect.top + rect.height / 2)
      pull.x?.(utils.clamp(dx * strength, -max, max))
      pull.y?.(utils.clamp(dy * strength, -max, max))
    }
    const leave = () => {
      pull.x?.(0)
      pull.y?.(0)
    }
    element.addEventListener('pointermove', move)
    element.addEventListener('pointerleave', leave)
    return () => {
      element.removeEventListener('pointermove', move)
      element.removeEventListener('pointerleave', leave)
      pull.revert()
    }
  }, [ref, strength, max])
}

/** Turns a mark while the pointer rests on the button around it; see installSpin. */
export function useSpin(ref: RefObject<Element | null>) {
  useEffect(() => {
    const mark = ref.current
    const control = mark?.closest('button')
    if (!mark || !control) return
    return installSpin(mark, control)
  }, [ref])
}

/**
 * Splits the element's text into words that rise in one after another.
 * Only for text that does not change while mounted: React does not own the
 * word spans, so a changed string needs a new element (a new `key`).
 */
export function useWordsIn(
  ref: RefObject<HTMLElement | null>,
  {
    delay = 0,
    gap = 40,
    y = 10,
    ease = 'settle',
  }: { delay?: number; gap?: number; y?: number; ease?: SpringName } = {},
) {
  useIsomorphicLayoutEffect(() => {
    const element = ref.current
    if (!element) return
    if (prefersReducedMotion()) {
      riseIn(element, { y: 0, delay })
      return
    }
    const split = splitText(element, { words: true })
    riseIn(split.words, { y, ease, delay: stagger(gap, { start: delay }) })
    return () => {
      split.revert()
    }
  }, [])
}

/**
 * Whether the current message arrived while the thread was open, as opposed
 * to loading with its history. Read once at mount, so a message animates in
 * only when it is actually new.
 */
export function useArrivedLive() {
  const aui = useAui()
  const [live] = useState(() => {
    const message = aui.message().getState()
    return (
      message.status?.type === 'running' ||
      Date.now() - message.createdAt.getTime() < 4000
    )
  })
  return live
}

/**
 * Lifts the transition mute anime's layout record() leaves on every
 * descendant until the next animate(), which may be far off; the mute only
 * has to cover the measurement, so the rows keep their hover transitions.
 */
function recordLayout(layout: AutoLayout) {
  layout.record()
  for (const [element, transition] of layout.transitionMuteStore) {
    if (transition) element.style.transition = transition
    else element.style.removeProperty('transition')
  }
  layout.transitionMuteStore.clear()
}

/**
 * Springs a list's children from where they were to where they are whenever
 * `order` changes; new children grow in. The layout is recorded after every
 * commit and whenever the list resizes, as when a row's contents load, so the
 * record a reorder animates from is the last layout on screen.
 */
export function useLayoutSprings(
  ref: RefObject<HTMLElement | null>,
  order: string,
  children: string,
  { ease = 'settle' }: { ease?: SpringName } = {},
) {
  const layout = useRef<AutoLayout | null>(null)
  const reorder = useRef<Timeline | null>(null)
  const committed = useRef(order)

  useIsomorphicLayoutEffect(() => {
    const root = ref.current
    if (!root) return
    // createLayout records the layout it starts from.
    layout.current ??= createLayout(root, { children })
    if (order === committed.current || prefersReducedMotion()) {
      committed.current = order
      // Recording cancels a reorder still springing, which then jumps.
      if (!reorder.current || reorder.current.completed)
        recordLayout(layout.current)
      return
    }
    committed.current = order
    const current = layout.current
    reorder.current = current.animate({
      ease: springs[ease],
      enterFrom: { opacity: 0, scale: 0.9 },
    })
    void reorder.current.then(() => recordLayout(current))
  })

  useEffect(() => {
    const root = ref.current
    if (!root) return
    const resized = new ResizeObserver(() => {
      if (layout.current && (!reorder.current || reorder.current.completed))
        recordLayout(layout.current)
    })
    resized.observe(root)
    return () => {
      resized.disconnect()
      layout.current?.revert()
      layout.current = null
    }
  }, [ref])
}

type Edges = { top: number; bottom: number; left: number; right: number }

/**
 * Where `element` sits inside `container`, a positioned ancestor, cut to any
 * ancestor between them that clips its overflow, such as a collapsing panel. Null when none of it
 * shows. Offsets rather than client rects, so rows mid-spring count where
 * they are headed.
 */
function edgesWithin(element: HTMLElement, container: HTMLElement) {
  const origin = (node: HTMLElement) => {
    let top = 0
    let left = 0
    let at: HTMLElement | null = node
    while (at && at !== container) {
      top += at.offsetTop
      left += at.offsetLeft
      at = at.offsetParent as HTMLElement | null
    }
    return { top, left }
  }
  if (!element.offsetParent) return null
  const { top, left } = origin(element)
  const edges: Edges = {
    top,
    bottom: top + element.offsetHeight,
    left,
    right: left + element.offsetWidth,
  }
  for (
    let parent = element.parentElement;
    parent && parent !== container;
    parent = parent.parentElement
  ) {
    if (getComputedStyle(parent).overflowY === 'visible') continue
    const clip = origin(parent).top
    edges.top = Math.max(edges.top, clip)
    edges.bottom = Math.min(edges.bottom, clip + parent.clientHeight)
  }
  return edges.bottom > edges.top ? edges : null
}

/**
 * Glides one highlight to whichever descendant matches `selector`, stretching
 * its leading edge toward the new place before the trailing edge follows.
 * It glides when `attribute` changes anywhere in the container or children
 * are added, removed or moved, since the selection can land in a later commit
 * than whatever caused it; a resize, as when rows above load or a panel
 * opens, moves the highlight with the element instead.
 */
export function useGlideHighlight(
  containerRef: RefObject<HTMLElement | null>,
  highlightRef: RefObject<HTMLElement | null>,
  selector: string,
  attribute: string,
) {
  const edges = useRef<Edges | null>(null)
  const glide = useRef<JSAnimation | null>(null)

  const place = useCallback((motion: 'glide' | 'follow') => {
    const container = containerRef.current
    const highlight = highlightRef.current
    if (!container || !highlight) return
    const target = container.querySelector<HTMLElement>(selector)
    // Measured in the box the highlight is positioned in.
    const frame = highlight.offsetParent
    const next =
      target && frame instanceof HTMLElement && edgesWithin(target, frame)
    if (!next) {
      glide.current?.cancel()
      highlight.style.opacity = '0'
      edges.current = null
      return
    }
    const paint = () => {
      const { top, bottom, left, right } = edges.current ?? next
      highlight.style.top = `${top}px`
      highlight.style.left = `${left}px`
      highlight.style.height = `${bottom - top}px`
      highlight.style.width = `${right - left}px`
    }
    const from = edges.current
    if (!from || motion === 'follow' || prefersReducedMotion()) {
      glide.current?.cancel()
      edges.current = { ...next }
      paint()
      if (!from) {
        highlight.style.removeProperty('opacity')
        popIn(highlight, { from: 0.96, ease: 'settle' })
      }
      return
    }
    const down = next.top > from.top
    glide.current?.cancel()
    glide.current = animate(from, {
      top: { to: next.top, delay: down ? 70 : 0 },
      bottom: { to: next.bottom, delay: down ? 0 : 70 },
      left: next.left,
      right: next.right,
      ease: springs.settle,
      onRender: paint,
    })
  }, [containerRef, highlightRef, selector])

  useIsomorphicLayoutEffect(() => {
    const container = containerRef.current
    if (!container) return
    place('glide')
    const changed = new MutationObserver(() => place('glide'))
    changed.observe(container, {
      subtree: true,
      childList: true,
      attributeFilter: [attribute],
    })
    const resized = new ResizeObserver(() => place('follow'))
    resized.observe(container)
    return () => {
      changed.disconnect()
      resized.disconnect()
    }
  }, [containerRef, attribute, place])
}
