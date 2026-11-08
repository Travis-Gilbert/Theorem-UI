// SOURCING: the platform's <dialog> (open in the reply, showModal() to expand into the top layer) and postMessage to the scene page; React layout effects for the frame's lifetime as block-frame.tsx does; ui/button for the card's action
//
// A reply's interactive scene, drawn in the reply. The frame is made with its
// address set and the listener in place before it is added to the page, as
// block-frame.tsx does, so the page's first `host-ready` is never missed.
//
// Expanding does not move the frame: moving an iframe in the document reloads
// it and the person loses where they were in the scene. The card is a
// <dialog> that is open in the reply and shown modal to expand. A modal
// dialog is drawn in the top layer, which a message row's
// `content-visibility: auto` containment cannot clip.
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from 'react'
import { Icon } from '@/components/icons'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { readFrameMessage, SCENE_HOST_PATH, SCENE_SANDBOX } from './scene-model'
import type { HostMessage, Scene, SceneLayout } from './scene-model'

/**
 * Open in the reply. Not `show()`: that moves focus into the dialog, and a
 * reply that arrives while the person is typing must leave the composer
 * focused.
 */
function openInline(node: HTMLDialogElement) {
  node.setAttribute('open', '')
}

/** How long the page may take to draw the package before the card gives up. */
export const SCENE_MOUNT_TIMEOUT_MS = 20_000

type Phase = 'loading' | 'ready' | 'failed'

export function SceneCard({ scene }: { scene: Scene }) {
  const dialog = useRef<HTMLDialogElement>(null)
  const holder = useRef<HTMLDivElement>(null)
  const expandButton = useRef<HTMLButtonElement>(null)
  const frame = useRef<HTMLIFrameElement | null>(null)
  const switching = useRef(false)
  const [phase, setPhase] = useState<Phase>('loading')
  const [layout, setLayout] = useState<SceneLayout>('inline')
  const label = scene.title ?? 'Interactive scene'

  // The latest values the frame's listener reads, without making a new frame.
  const latest = useRef({ scene, layout })
  useEffect(() => {
    latest.current = { scene, layout }
  })

  const post = useCallback((message: HostMessage) => {
    // The page's origin is opaque, so no narrower target can be named; the
    // page reads only messages whose source is its parent.
    frame.current?.contentWindow?.postMessage(message, '*')
  }, [])

  const place = useCallback(
    (next: SceneLayout) => {
      const node = dialog.current
      if (!node) return
      switching.current = true
      try {
        if (node.open) node.close()
        if (next === 'full') node.showModal()
        else openInline(node)
      } finally {
        switching.current = false
      }
      setLayout(next)
      post({ type: 'sceneos:layout', layout: next })
    },
    [post],
  )

  const collapse = useCallback(() => {
    if (latest.current.layout !== 'full') return
    place('inline')
    expandButton.current?.focus()
  }, [place])

  // Shown before the frame is added, so the page first lays out at its size.
  useLayoutEffect(() => {
    const node = dialog.current
    if (node && !node.open) openInline(node)
  }, [])

  // One frame per scene package: a reply that streams more text re-renders
  // this card without reloading the scene.
  const sceneKey = scene.packageHash ?? scene.sceneId
  useLayoutEffect(() => {
    const parent = holder.current
    if (!parent) return
    setPhase('loading')
    const element = document.createElement('iframe')
    element.title = label
    element.setAttribute('sandbox', SCENE_SANDBOX)
    element.referrerPolicy = 'no-referrer'
    element.className = 'block size-full border-0 bg-transparent'
    let mounted = false
    const timer = window.setTimeout(() => {
      if (!mounted) setPhase('failed')
    }, SCENE_MOUNT_TIMEOUT_MS)
    const onMessage = (event: MessageEvent) => {
      if (!element.contentWindow || event.source !== element.contentWindow)
        return
      const message = readFrameMessage(event.data)
      if (!message) return
      switch (message.type) {
        case 'sceneos:host-ready':
          // Also after the page reloads, so it is told again.
          post({
            type: 'sceneos:mount',
            package: latest.current.scene.scenePackage,
          })
          post({ type: 'sceneos:layout', layout: latest.current.layout })
          return
        case 'sceneos:mounted':
          mounted = true
          window.clearTimeout(timer)
          setPhase(message.ok ? 'ready' : 'failed')
          return
        case 'sceneos:dismiss':
          collapse()
      }
    }
    window.addEventListener('message', onMessage)
    element.src = SCENE_HOST_PATH
    parent.append(element)
    frame.current = element
    return () => {
      window.removeEventListener('message', onMessage)
      window.clearTimeout(timer)
      element.remove()
      if (frame.current === element) frame.current = null
    }
    // `label` names the frame when it is made; a later title does not remake it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sceneKey, post, collapse])

  // Escape asks a modal dialog to close: collapse instead. Where the browser
  // does not let that be refused, the dialog closes and is shown again inline.
  useEffect(() => {
    const node = dialog.current
    if (!node) return
    const onCancel = (event: Event) => {
      event.preventDefault()
      collapse()
    }
    const onClose = () => {
      // place() closes and reopens in one task: its own close is either seen
      // while it switches or, where the event is queued, after the dialog is
      // open again. A dialog that is still closed was closed by the browser.
      if (switching.current || node.open) return
      openInline(node)
      setLayout('inline')
      post({ type: 'sceneos:layout', layout: 'inline' })
      expandButton.current?.focus()
    }
    node.addEventListener('cancel', onCancel)
    node.addEventListener('close', onClose)
    return () => {
      node.removeEventListener('cancel', onCancel)
      node.removeEventListener('close', onClose)
    }
  }, [collapse, post])

  const full = layout === 'full'
  const failed = phase === 'failed'

  return (
    <dialog
      ref={dialog}
      aria-label={label}
      data-slot="theorem-scene-card"
      data-scene-id={scene.sceneId}
      data-layout={layout}
      data-phase={phase}
      className={cn(
        // A shown dialog sits in the reply like any other card.
        'static my-3 w-full max-w-none flex-col overflow-hidden rounded-artifact border border-separator bg-artifact p-0 text-ink open:flex',
        // Expanded: the top layer, over the whole window.
        '[&:modal]:fixed [&:modal]:inset-2 [&:modal]:m-0 [&:modal]:size-auto [&:modal]:max-h-none sm:[&:modal]:inset-6',
        'backdrop:bg-black/40 supports-backdrop-filter:backdrop:backdrop-blur-xs',
      )}
    >
      <div
        className={cn(
          'relative w-full',
          full ? 'min-h-0 flex-1' : 'h-[min(520px,72dvh)]',
          failed && 'hidden',
        )}
      >
        <div ref={holder} className="size-full" />
        {phase === 'loading' && (
          <p
            role="status"
            className="pointer-events-none absolute inset-0 flex items-center justify-center text-sm text-ink-faint"
          >
            Drawing the scene…
          </p>
        )}
      </div>
      {failed && (
        <div role="status" className="flex flex-col gap-1 px-4 pt-4 text-sm">
          <p className="text-ink-muted">This scene could not be drawn.</p>
          {scene.fallbackText && <p>{scene.fallbackText}</p>}
        </div>
      )}
      <div className="flex min-h-11 shrink-0 items-center gap-2 border-t border-separator px-3 py-1.5">
        <Icon.Diagram aria-hidden className="size-4 shrink-0 text-ink-muted" />
        <span className="min-w-0 flex-1 truncate text-sm font-medium">
          {label}
        </span>
        {(!failed || full) && (
          <Button
            ref={expandButton}
            type="button"
            variant="ghost"
            size="sm"
            aria-expanded={full}
            onClick={() => {
              if (full) collapse()
              else {
                place('full')
                // The dialog moves focus into itself; keep it on the toggle,
                // where Escape or a second press collapses it.
                expandButton.current?.focus()
              }
            }}
            className="pointer-coarse:min-h-11 pointer-coarse:min-w-11"
          >
            {full ? <Icon.Close aria-hidden /> : <Icon.Expand aria-hidden />}
            {full ? 'Collapse' : 'Expand'}
          </Button>
        )}
      </div>
    </dialog>
  )
}
