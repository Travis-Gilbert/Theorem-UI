// SOURCING: the app's glass materials side by side over one scene: the frost it ships (styles.css surface-glass, glass-panel) and liquid glass (glass/liquid-glass, its renderer and shader adapted from ybouane/liquidglass; styles.css surface-liquid, glass-panel-liquid), with the liquid studies (data-glass-study) selectable. The scene is the app's own: the Life field (mountLife), the sidebar (ContextPanel) and the composer (Composer) under the story runtime. A development comparison, not a shipped surface.
import { useEffect, useRef, useState } from 'react'
import { Composer } from '@/components/assistant-ui/elements/thread.aui'
import { useLiquidGlass } from '@/components/glass/liquid-glass/use-liquid-glass'
import { mountLife } from '@/components/life/mount-life'
import { ContextPanel } from '@/components/shell/sidebar'
import { useLifeControls } from '@/lib/life/store'
import { useSurfaces } from '@/lib/surfaces'
import { cn } from '@/lib/utils'

type Material = 'frost' | 'liquid' | 'none'
type Study = 'smoked' | 'curved' | 'satin'

/** The sidebar is attached to the window: only its right edge curves. */
const PANEL_EDGES = { top: false, right: true, bottom: false, left: false }

const params = () => new URLSearchParams(window.location.search)

/** The scene's controls, read once from the URL. */
function readOptions() {
  const search = params()
  const chosen = search.get('material')
  const material: Material =
    chosen === 'liquid' || chosen === 'none' ? chosen : 'frost'
  const picked = search.get('study')
  const study: Study =
    picked === 'curved' || picked === 'satin' ? picked : 'smoked'
  return {
    material,
    study,
    /** One Life frame for every still: seeded, not stepping, no companion. */
    frozen: search.get('frozen') !== '0',
    seed: Number(search.get('seed') ?? 7) || 7,
    /** Words arrive in the last reply, as a response streams. */
    stream: search.get('stream') === '1',
    /** The conversation scrolls under the composer. */
    scroll: search.get('scroll') === '1',
    /** A frame-rate readout, for phones without devtools; hud=0 hides it. */
    hud: search.get('hud') !== '0',
  }
}

/** A small seeded generator, so the field fills the same way on every load. */
function mulberry32(seed: number) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const REPLY = [
  'The connector is a disambiguation layer. Once a binding exists, not found stops meaning maybe: it means the record is absent, and the agent can say so plainly instead of hedging.',
  'Two things follow. The first is that lookups can fail fast, because a miss is an answer. The second is that the binding itself becomes the thing to audit, since every later claim leans on it.',
  'For the gallery, that means project groups read from the binding rather than from folder names, and a compact list can be derived from the same source without a second index.',
]

const STREAMED =
  'Streaming continues here, word by word, the way a response arrives while the composer waits below it and the field keeps moving behind both of them. '.split(
    ' ',
  )

declare global {
  interface Window {
    __glass?: {
      ready: boolean
      material: Material
    }
  }
}

/** The Life field, the sidebar and the composer's footer, as the shell lays them out. */
export function GlassCompareStory() {
  const [options] = useState(readOptions)
  const { material, study, frozen, seed, stream, scroll } = options
  const life = useRef<HTMLDivElement>(null)
  const messages = useRef<HTMLDivElement>(null)
  const sidebar = useRef<HTMLElement>(null)
  const [streamed, setStreamed] = useState(0)
  const [rate, setRate] = useState(0)
  useLiquidGlass(sidebar, material === 'liquid', PANEL_EDGES)

  // Frames the page actually painted each second.
  useEffect(() => {
    if (!options.hud) return
    let frame = 0
    let frames = 0
    let since = performance.now()
    const tick = (now: number) => {
      frame = requestAnimationFrame(tick)
      frames++
      if (now - since < 1000) return
      setRate(Math.round((frames * 1000) / (now - since)))
      frames = 0
      since = now
    }
    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
  }, [options.hud])

  // The composer's material as the app's setting chooses it, and the study.
  useEffect(() => {
    const before = useSurfaces.getState().composer
    useSurfaces
      .getState()
      .setComposer(material === 'liquid' ? 'liquid' : 'glass')
    const root = document.documentElement
    if (study !== 'smoked') root.dataset.glassStudy = study
    return () => {
      useSurfaces.getState().setComposer(before)
      delete root.dataset.glassStudy
    }
  }, [material, study])

  useEffect(() => {
    window.__glass = { ready: false, material }
    const host = life.current
    if (!host) return
    const random = Math.random
    Math.random = mulberry32(seed)
    const controls = useLifeControls.getState()
    useLifeControls.setState({
      playing: !frozen,
      companion: false,
      shown: true,
    })
    const game = mountLife(host, { reducedMotion: frozen })
    return () => {
      game.destroy()
      Math.random = random
      useLifeControls.setState({
        playing: controls.playing,
        companion: controls.companion,
        shown: controls.shown,
      })
    }
  }, [material, frozen, seed])

  useEffect(() => {
    if (!stream) return
    const timer = window.setInterval(
      () => setStreamed((count) => count + 1),
      60,
    )
    return () => window.clearInterval(timer)
  }, [stream])

  useEffect(() => {
    const element = messages.current
    if (!scroll || !element) return
    let frame = 0
    let direction = 1
    const step = () => {
      frame = requestAnimationFrame(step)
      element.scrollTop += direction * 0.6
      const end = element.scrollHeight - element.clientHeight
      if (element.scrollTop >= end - 1) direction = -1
      if (element.scrollTop <= 0) direction = 1
    }
    frame = requestAnimationFrame(step)
    return () => cancelAnimationFrame(frame)
  }, [scroll])

  // Ready for a still once the field has drawn and the panes have followed.
  useEffect(() => {
    const host = life.current
    let timer = 0
    const check = () => {
      const canvas = host?.querySelector('canvas')
      const panes = document.querySelectorAll('[data-liquid=live]').length
      const drawn = canvas && canvas.style.visibility === ''
      if (drawn && (material !== 'liquid' || panes >= 2)) {
        timer = window.setTimeout(() => {
          if (window.__glass) window.__glass.ready = true
        }, 600)
        return
      }
      timer = window.setTimeout(check, 100)
    }
    check()
    return () => window.clearTimeout(timer)
  }, [material])

  return (
    <>
      {options.hud && (
        <output className="fixed top-2 right-2 z-50 rounded-md bg-black/70 px-2 py-1 font-mono text-[11px] text-white">
          {material === 'liquid' ? `liquid · ${study}` : material} · {rate} fps
        </output>
      )}
      <div
        data-material={material}
        className="glass-compare relative h-dvh w-full overflow-hidden"
      >
        <style>{`
          .glass-compare[data-material=none] [data-slot=aui_composer-shell] {
            background: var(--glass-tint-solid) !important;
            -webkit-backdrop-filter: none !important;
            backdrop-filter: none !important;
          }
        `}</style>

        <div className="bg-sheet absolute inset-0" />
        <div ref={life} className="absolute inset-0" />

        {/* The conversation, scrolling under the composer's footer. */}
        <div
          ref={messages}
          className="absolute inset-0 overflow-y-auto pl-[354px]"
        >
          <div className="mx-auto flex max-w-[768px] flex-col gap-6 px-4 pt-10 pb-56 text-[16px] leading-7 text-foreground">
            {Array.from({ length: 4 }, (_, turn) => (
              <div key={turn} className="flex flex-col gap-4">
                <p className="bg-selected ms-auto max-w-[70%] rounded-2xl px-4 py-2">
                  How should the gallery decide what goes in each group?
                </p>
                {REPLY.map((paragraph) => (
                  <p key={paragraph}>{paragraph}</p>
                ))}
              </div>
            ))}
            <p>
              {STREAMED.slice(0, streamed % (STREAMED.length * 6)).join(' ')}
            </p>
          </div>
        </div>

        <aside
          ref={sidebar}
          className={cn(
            'absolute inset-y-0 left-0 isolate w-[354px]',
            material === 'none' ? 'bg-sidebar' : 'glass-panel',
            material === 'liquid' && 'glass-panel-liquid',
          )}
        >
          <div className="relative h-full">
            <ContextPanel />
          </div>
        </aside>

        {/* The footer as the thread lays it out: its scroll edge, then the
            composer with the thread's gutter below it. */}
        <div
          className={cn(
            'absolute right-0 bottom-0 left-[354px] isolate pb-6',
            material === 'liquid' ? 'liquid-footer' : 'glass-footer',
          )}
        >
          <div className="mx-auto w-full max-w-[768px] px-4">
            <Composer autoFocus={false} />
          </div>
        </div>
      </div>
    </>
  )
}
