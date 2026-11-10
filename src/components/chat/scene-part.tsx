// SOURCING: the platform's <dialog> (open in the reply, showModal() to expand into the top layer) and postMessage to the scene page; React layout effects for the frame's lifetime as block-frame.tsx does; ui/button for the card's controls
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
//
// The artifact is the agent's own code and draws its own title, so the card
// has no chrome: a corner control to expand it, and, when it is needed, the
// error that stopped the code with a Fix that asks the agent to mend it, or
// the thing the reader picked with an offer to ask about it. Inline, the card
// is wider than the reading column (--spacing-artifact), centred on it.
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
import {
  errorLine,
  readFrameMessage,
  SCENE_HOST_PATH,
  SCENE_SANDBOX,
} from './scene-model'
import type {
  HostMessage,
  ModuleError,
  Scene,
  SceneEntity,
  SceneLayout,
  SceneTheme,
} from './scene-model'

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

/** The error the agent's code stopped with, and whether Fix has asked about it. */
type Fault = { error: ModuleError; asked: boolean }

export type SceneCardProps = {
  scene: Scene
  /** The conversation's tokens, posted with the package. */
  theme: SceneTheme
  /** Puts the picked entity in the composer as a reference. */
  onAsk?: (entity: SceneEntity) => void
  /** Asks the agent to fix the code that failed. */
  onRepair?: (error: ModuleError) => void
}

export function SceneCard({ scene, theme, onAsk, onRepair }: SceneCardProps) {
  const dialog = useRef<HTMLDialogElement>(null)
  const holder = useRef<HTMLDivElement>(null)
  const expandButton = useRef<HTMLButtonElement>(null)
  const frame = useRef<HTMLIFrameElement | null>(null)
  const switching = useRef(false)
  // The theme the current page last drew with; empty until it can take a mount.
  const drawnTheme = useRef<string | undefined>(undefined)
  const [phase, setPhase] = useState<Phase>('loading')
  const [layout, setLayout] = useState<SceneLayout>('inline')
  const [fault, setFault] = useState<Fault>()
  const [picked, setPicked] = useState<SceneEntity | null>(null)
  const label = scene.title ?? 'Interactive scene'
  const themeKey = JSON.stringify(theme)

  // The latest values the frame's listener reads, without making a new frame.
  const latest = useRef({ scene, layout, theme, themeKey })
  useEffect(() => {
    latest.current = { scene, layout, theme, themeKey }
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
    setFault(undefined)
    setPicked(null)
    drawnTheme.current = undefined
    const element = document.createElement('iframe')
    element.title = label
    element.setAttribute('sandbox', SCENE_SANDBOX)
    element.referrerPolicy = 'no-referrer'
    element.className = 'block size-full border-0 bg-transparent'
    let mounted = false
    const timer = window.setTimeout(() => {
      if (mounted) return
      setPhase('failed')
      // A page that took the package and never answered is stuck in the
      // agent's code; a page that never loaded is not the agent's to fix.
      if (drawnTheme.current !== undefined)
        setFault({
          error: {
            stage: 'mount',
            message: `mount did not return within ${SCENE_MOUNT_TIMEOUT_MS / 1000} seconds`,
          },
          asked: false,
        })
    }, SCENE_MOUNT_TIMEOUT_MS)
    const onMessage = (event: MessageEvent) => {
      if (!element.contentWindow || event.source !== element.contentWindow)
        return
      const message = readFrameMessage(event.data)
      if (!message) return
      switch (message.type) {
        case 'sceneos:host-ready': {
          // Also after the page reloads, so it is told again.
          const { scene: current, theme: colours, themeKey: key } =
            latest.current
          drawnTheme.current = key
          post({
            type: 'sceneos:mount',
            package: current.scenePackage,
            theme: colours,
          })
          post({ type: 'sceneos:layout', layout: latest.current.layout })
          return
        }
        case 'sceneos:mounted':
          mounted = true
          window.clearTimeout(timer)
          setPhase(message.ok ? 'ready' : 'failed')
          setFault(message.error && { error: message.error, asked: false })
          return
        case 'sceneos:error':
          setFault({ error: message.error, asked: false })
          return
        case 'sceneos:select':
          setPicked(message.entity)
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

  // A palette or mode switch: the page tears the run down and draws the
  // package again in the new colours, in the same frame.
  useEffect(() => {
    const drawn = drawnTheme.current
    if (drawn === undefined || drawn === themeKey) return
    drawnTheme.current = themeKey
    setPicked(null)
    post({
      type: 'sceneos:mount',
      package: latest.current.scene.scenePackage,
      theme: latest.current.theme,
    })
  }, [themeKey, post])

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
  const repair =
    fault && onRepair
      ? () => {
          onRepair(fault.error)
          setFault({ ...fault, asked: true })
        }
      : undefined

  return (
    <dialog
      ref={dialog}
      aria-label={label}
      data-slot="theorem-scene-card"
      data-scene-id={scene.sceneId}
      data-layout={layout}
      data-phase={phase}
      className={cn(
        // A shown dialog sits in the reply like any other card, wider than
        // the reading column and centred on it.
        'relative my-3 max-w-none flex-col overflow-hidden rounded-artifact border border-separator bg-artifact p-0 text-ink open:flex',
        '[--scene-width:min(calc(100cqw-5rem),var(--spacing-artifact))] mx-[calc((100%-var(--scene-width))/2)] w-(--scene-width)',
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
        {!failed && (picked || fault) && (
          // Bottom-left, clear of the scene page's own Play/Pause at the
          // bottom-right; the agent is told to keep both corners free.
          <div className="absolute bottom-3 left-3 right-28 flex flex-col items-start gap-2">
            {picked && onAsk && (
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={() => onAsk(picked)}
                className="max-w-full shadow-pill pointer-coarse:min-h-11"
              >
                <span className="truncate">
                  Ask about {picked.label ?? picked.id}
                </span>
              </Button>
            )}
            {fault && (
              <FaultNotice
                fault={fault}
                onFix={repair}
                className="w-full rounded-lg border border-separator bg-artifact/95 px-3 py-2 shadow-pill"
              />
            )}
          </div>
        )}
      </div>
      {failed && (
        <div role="status" className="flex flex-col gap-2 p-4 text-sm">
          <p className="text-ink-muted">This scene could not be drawn.</p>
          {fault && <FaultNotice fault={fault} onFix={repair} />}
          {scene.fallbackText && <p>{scene.fallbackText}</p>}
        </div>
      )}
      {(!failed || full) && (
        <Button
          ref={expandButton}
          type="button"
          variant="ghost"
          size="icon-sm"
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
          className="absolute top-2 right-2 z-10 bg-artifact/70 text-ink-muted hover:text-ink pointer-coarse:size-11"
        >
          {full ? <Icon.Close aria-hidden /> : <Icon.Expand aria-hidden />}
          <span className="sr-only">{full ? 'Collapse' : 'Expand'}</span>
        </Button>
      )}
    </dialog>
  )
}

/** The line the code failed at, and Fix, which asks once per failure. */
function FaultNotice({
  fault,
  onFix,
  className,
}: {
  fault: Fault
  onFix?: () => void
  className?: string
}) {
  return (
    <div className={cn('flex items-start gap-2', className)}>
      <code className="line-clamp-3 min-w-0 flex-1 font-mono text-xs break-words text-ink-muted">
        {errorLine(fault.error)}
      </code>
      {onFix && (
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={fault.asked}
          onClick={onFix}
          className="shrink-0 pointer-coarse:min-h-11"
        >
          Fix
        </Button>
      )}
    </div>
  )
}
