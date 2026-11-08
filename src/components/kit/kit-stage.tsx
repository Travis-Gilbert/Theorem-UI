// SOURCING: @floating-ui/react-dom (the speech bubble kept beside Kit and inside the window); lib/kit (the stage's place and motion, the driver that moves Kit with anime.js, the store's act and liveness); Kit for the sprite; a fixed layer over the whole shell that only Kit itself takes pointer events in, below popups (z-50)
import {
  autoUpdate,
  flip,
  offset,
  shift,
  useFloating,
} from '@floating-ui/react-dom'
import { useCallback, useEffect, useRef, useState } from 'react'
import { KitDriver, kitDriver, setKitDriver } from '@/lib/kit/driver'
import { playGesture } from '@/lib/kit/operations'
import { KIT_SIZE, changeStage, shownTag, useKitStage } from '@/lib/kit/stage'
import type { PerchName } from '@/lib/kit/stage'
import type { KitTag } from '@/lib/kit/sheet'
import { useKit } from '@/lib/kit/store'
import { prefersReducedMotion } from '@/lib/motion'
import { Kit } from './kit'

/** What Kit does when the person taps it, chosen at random. */
const TAPS: readonly KitTag[] = ['wave', 'pounce', 'celebrate', 'tilt', 'nod']
/** How long Kit waits between strolls of its own, in milliseconds. */
const WANDER_MS = [22_000, 36_000] as const
/** Surfaces Kit strolls along on its own; it stays put in the rail. */
const STROLLS: readonly PerchName[] = ['composer', 'floor']

const pick = <T,>(items: readonly T[]) =>
  items[Math.floor(Math.random() * items.length)] as T

/**
 * Kit loose in the shell: it stands on the composer, sits in its rail slot,
 * or walks the floor of the window. The person can tap it or pick it up and
 * drop it anywhere; the agent moves it through the operations its turns
 * declare. While idle it strolls now and then, and goes back to the composer
 * when it has fallen to the floor.
 */
export function KitStage() {
  const holder = useRef<HTMLDivElement | null>(null)
  const stage = useKitStage()
  const act = useKit((state) => state.act)
  const liveness = useKit((state) => state.liveness)
  const [now, setNow] = useState(() => Date.now())

  useEffect(() => {
    const element = holder.current
    if (!element) return
    const driver = new KitDriver(element, () => {
      const { act: current } = useKit.getState()
      playGesture(current.tag === 'sleep' ? 'peek' : pick(TAPS))
    })
    setKitDriver(driver)
    changeStage({ mounted: true })
    return () => {
      setKitDriver(undefined)
      driver.destroy()
      changeStage({ mounted: false, motion: 'still' })
    }
  }, [])

  // Repaint when a gesture or a line runs out.
  const expires = Math.min(
    ...[stage.gesture?.until, stage.speech?.until].filter(
      (until): until is number => until !== undefined && until > now,
    ),
  )
  useEffect(() => {
    if (!Number.isFinite(expires)) return
    const timer = setTimeout(
      () => setNow(Date.now()),
      expires - Date.now() + 16,
    )
    return () => clearTimeout(timer)
  }, [expires])

  // A turn going out: Kit hops where it stands.
  const previous = useRef(liveness)
  useEffect(() => {
    if (liveness === 'work' && previous.current !== 'work')
      void kitDriver()?.hop()
    previous.current = liveness
  }, [liveness])

  // Strolls of its own while nothing is happening.
  useEffect(() => {
    if (prefersReducedMotion()) return
    let timer: ReturnType<typeof setTimeout>
    // A stroll under way when the stage goes must not schedule another.
    let stopped = false
    const schedule = () => {
      if (stopped) return
      const [least, most] = WANDER_MS
      timer = setTimeout(stroll, least + Math.random() * (most - least))
    }
    const stroll = async () => {
      const state = useKitStage.getState()
      const kit = useKit.getState()
      const driver = kitDriver()
      const quiet =
        driver &&
        document.visibilityState === 'visible' &&
        kit.liveness === 'idle' &&
        kit.act.tag !== 'sleep' &&
        state.motion === 'still' &&
        !(state.gesture && state.gesture.until > Date.now())
      if (
        quiet &&
        state.perch === 'floor' &&
        document.querySelector('[data-kit-perch="composer"]')
      )
        await driver
          .moveTo('composer', 0.15 + Math.random() * 0.7, 'jump')
          .catch(() => false)
      else if (quiet && STROLLS.includes(state.perch) && Math.random() < 0.6) {
        let at = 0.1 + Math.random() * 0.8
        if (Math.abs(at - state.at) < 0.15)
          at = state.at > 0.5 ? at - 0.3 : at + 0.3
        await driver.moveTo(state.perch, at, 'walk').catch(() => false)
      }
      schedule()
    }
    schedule()
    return () => {
      stopped = true
      clearTimeout(timer)
    }
  }, [])

  const shown = shownTag(stage, act, now)
  const saying =
    stage.speech && stage.speech.until > now ? stage.speech.text : undefined

  // The bubble follows Kit every frame while it shows and stays inside the window.
  const { refs, floatingStyles } = useFloating({
    strategy: 'fixed',
    placement: 'top',
    open: saying !== undefined,
    whileElementsMounted: (reference, floating, update) =>
      autoUpdate(reference, floating, update, { animationFrame: true }),
    middleware: [offset(4), flip({ padding: 8 }), shift({ padding: 8 })],
  })
  const hold = useCallback(
    (element: HTMLDivElement | null) => {
      holder.current = element
      refs.setReference(element)
    },
    [refs],
  )
  const float = useCallback(
    (bubble: HTMLDivElement | null) => refs.setFloating(bubble),
    [refs],
  )

  return (
    <div
      aria-label="Kit"
      className="pointer-events-none fixed inset-0 z-[45] overflow-hidden"
    >
      <div
        ref={hold}
        tabIndex={0}
        role="button"
        aria-label="Kit, the agent's figure. Press to pet it, or drag it somewhere."
        onKeyDown={(event) => {
          if (event.key !== 'Enter' && event.key !== ' ') return
          event.preventDefault()
          playGesture(pick(TAPS))
        }}
        className="pointer-events-auto absolute top-0 left-0 touch-none rounded-sm outline-none select-none focus-visible:outline-2 focus-visible:outline-focus"
        style={{ width: KIT_SIZE, height: KIT_SIZE }}
      >
        <Kit shown={shown} facing={stage.facing} />
      </div>
      {saying && (
        <div
          ref={float}
          role="status"
          aria-live="polite"
          style={floatingStyles}
          className="w-max max-w-56 rounded-md border border-separator bg-(--composer-bg) px-2 py-1 text-xs leading-snug text-ink shadow-sheet"
        >
          {saying}
        </div>
      )}
    </div>
  )
}

/**
 * Kit's home in the rail: an empty slot the stage stands it in, whose bottom
 * is the line its feet rest on.
 */
export function KitPerch({
  name,
  className,
}: {
  name: PerchName
  className?: string
}) {
  return (
    <div
      aria-hidden="true"
      data-kit-perch={name}
      data-kit-edge="bottom"
      className={className}
      style={{ width: KIT_SIZE, height: KIT_SIZE }}
    />
  )
}
