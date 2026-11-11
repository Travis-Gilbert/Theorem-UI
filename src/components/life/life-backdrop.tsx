// SOURCING: textmode.js through mountLife; assistant-ui useAuiState for the working turn (as ide/follow reads it); ResizeObserver to keep the canvas at its box; MutationObserver on <html> to repaint when next-themes or the palette changes; Base UI context menu for the controls, styled as the thread list's
import { ContextMenu } from '@base-ui/react/context-menu'
import { useAuiState } from '@assistant-ui/react'
import { useCallback, useEffect, useRef, useState } from 'react'
import type { PointerEvent as ReactPointerEvent, ReactNode } from 'react'
import { Icon } from '@/components/icons'
import { pulsesSince, signalOf } from '@/lib/life/energy'
import type { Reading } from '@/lib/life/energy'
import { PATTERNS, PATTERN_LABELS } from '@/lib/life/patterns'
import type { PatternName } from '@/lib/life/patterns'
import { useLifeControls, useLifeCounts } from '@/lib/life/store'
import type { Brush } from '@/lib/life/store'
import { prefersReducedMotion } from '@/lib/motion'
import { mountLife } from './mount-life'
import type { LifeGame } from './mount-life'

const BRUSHES: ReadonlyArray<Brush> = ['cell', ...(Object.keys(PATTERNS) as PatternName[])]

const brushLabel = (brush: Brush) => (brush === 'cell' ? 'Cell' : PATTERN_LABELS[brush])

const isBrush = (value: unknown): value is Brush => BRUSHES.some((brush) => brush === value)

const supportsWebGL2 = () =>
  typeof document !== 'undefined' && !!document.createElement('canvas').getContext('webgl2')

/**
 * The empty space of the conversation: a press there draws on the field and a
 * right click opens its menu; anywhere else (a message, the composer, a
 * control) belongs to the chat.
 */
const CHAT_CONTENT =
  '[data-message-id], .aui-thread-viewport-footer, button, a, input, textarea, [contenteditable], [role="menu"]'

// React portal events bubble through this component even when their DOM nodes
// belong to a popup outside the field. Never capture those menu interactions.
const isFieldSpace = (target: EventTarget, field: Element) =>
  target instanceof Element && field.contains(target) && target.closest(CHAT_CONTENT) === null

const menuItem =
  'data-highlighted:bg-hover data-disabled:opacity-50 flex h-8 cursor-default items-center gap-2 rounded-md px-2 text-sm outline-none select-none'

const menuPopup =
  'bg-popover text-popover-foreground shadow-popover border-separator min-w-48 origin-(--transform-origin) rounded-lg border p-1 outline-none transition-[opacity,scale] duration-100 data-ending-style:scale-95 data-ending-style:opacity-0 data-starting-style:scale-95 data-starting-style:opacity-0'

/** A Game of Life behind the conversation, livelier the harder the model works. */
export function LifeBackdrop({ children }: { children: ReactNode }) {
  const shown = useLifeControls((state) => state.shown)
  const [supported] = useState(supportsWebGL2)
  const [game, setGame] = useState<LifeGame>()
  const stroking = useRef(false)
  useTurnPulses(game)

  // A ref callback with a cleanup (React 19): mounts the field when its box
  // attaches and tears it down when it detaches.
  const attach = useCallback((host: HTMLDivElement | null) => {
    if (!host) return
    const reducedMotion = prefersReducedMotion()
    if (reducedMotion) useLifeControls.setState({ playing: false })
    const mounted = mountLife(host, { reducedMotion })
    setGame(mounted)
    const resize = new ResizeObserver(() => mounted.resize(host.clientWidth, host.clientHeight))
    resize.observe(host)
    // Styles land after the attribute changes, so read them on the next frame.
    const theme = new MutationObserver(() => requestAnimationFrame(() => mounted.repaint()))
    theme.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['class', 'data-palette'],
    })
    return () => {
      resize.disconnect()
      theme.disconnect()
      mounted.destroy()
      setGame(undefined)
    }
  }, [])

  if (!supported) return children
  const draws = shown

  // Touch scrolls the conversation, so only a mouse or pen draws.
  const onPointerDown = (event: ReactPointerEvent) => {
    if (!game || event.pointerType === 'touch' || event.button !== 0) return
    if (!isFieldSpace(event.target, event.currentTarget)) return
    event.preventDefault()
    event.currentTarget.setPointerCapture(event.pointerId)
    stroking.current = true
    game.press(event.clientX, event.clientY)
  }
  const onPointerMove = (event: ReactPointerEvent) => {
    if (!game || event.pointerType === 'touch') return
    if (stroking.current) game.drag(event.clientX, event.clientY)
    else if (isFieldSpace(event.target, event.currentTarget)) game.hover(event.clientX, event.clientY)
    else game.leave()
  }
  const onPointerEnd = () => {
    stroking.current = false
    game?.release()
  }
  // Let child menus handle their own event before suppressing the field's
  // trigger. Keep the browser's default menu on other chat content as well.
  const onContextMenu: NonNullable<ContextMenu.Trigger.Props['onContextMenu']> = (event) => {
    if (isFieldSpace(event.target, event.currentTarget)) return
    event.preventBaseUIHandler()
    event.stopPropagation()
  }

  return (
    <ContextMenu.Root>
      <ContextMenu.Trigger
        onContextMenu={onContextMenu}
        render={
          <div
            data-life-backdrop=""
            className="relative h-full"
            onPointerDown={draws ? onPointerDown : undefined}
            onPointerMove={draws ? onPointerMove : undefined}
            onPointerUp={draws ? onPointerEnd : undefined}
            onPointerCancel={draws ? onPointerEnd : undefined}
            onPointerLeave={draws ? () => game?.leave() : undefined}
          />
        }
      >
        {draws && (
          <div ref={attach} aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden" />
        )}
        <div className="relative h-full">{children}</div>
      </ContextMenu.Trigger>
      <LifeMenu game={draws ? game : undefined} />
    </ContextMenu.Root>
  )
}

/**
 * Feeds the field what the working turn does: a running turn keeps it awake,
 * and each tool call, stretch of reasoning and stretch of text lifts it.
 */
function useTurnPulses(game: LifeGame | undefined) {
  const id = useAuiState((s) => s.thread.messages.at(-1)?.id)
  const running = useAuiState((s) => signalOf(s.thread.messages.at(-1)).running)
  const tools = useAuiState((s) => signalOf(s.thread.messages.at(-1)).tools)
  const thoughts = useAuiState((s) => signalOf(s.thread.messages.at(-1)).thoughts)
  const words = useAuiState((s) => signalOf(s.thread.messages.at(-1)).words)
  const seen = useRef<Reading>(undefined)
  useEffect(() => {
    if (!game) return
    const reading: Reading = { id, signal: { running, tools, thoughts, words } }
    const before = seen.current
    seen.current = reading
    game.sustain(running)
    if (before) for (const kind of pulsesSince(before, reading)) game.pulse(kind)
  }, [game, id, running, tools, thoughts, words])
}

function LifeMenu({ game }: { game: LifeGame | undefined }) {
  const { shown, playing, brush, companion } = useLifeControls()
  const { population, pace } = useLifeCounts()
  const set = useLifeControls.setState
  return (
    <ContextMenu.Portal>
      <ContextMenu.Positioner className="z-50">
        <ContextMenu.Popup className={menuPopup}>
          {game && (
            <>
              <ContextMenu.Group>
                <ContextMenu.GroupLabel className="px-2 py-1 text-xs tabular-nums text-ink-muted">
                  {pace} gen/s · {population.toLocaleString()} alive
                </ContextMenu.GroupLabel>
                <ContextMenu.Item className={menuItem} closeOnClick={false} onClick={() => set({ playing: !playing })}>
                  {playing ? <Icon.Pause className="size-4" /> : <Icon.Play className="size-4" />}
                  {playing ? 'Pause' : 'Play'}
                </ContextMenu.Item>
                <ContextMenu.Item
                  className={menuItem}
                  closeOnClick={false}
                  onClick={() => {
                    set({ playing: false })
                    game.step()
                  }}
                >
                  <Icon.StepForward className="size-4" />
                  Step one generation
                </ContextMenu.Item>
                <ContextMenu.Item className={menuItem} onClick={game.randomize}>
                  <Icon.Shuffle className="size-4" />
                  Shuffle
                </ContextMenu.Item>
                <ContextMenu.Item className={menuItem} onClick={game.clear}>
                  <Icon.Delete className="size-4" />
                  Clear
                </ContextMenu.Item>
              </ContextMenu.Group>
              <ContextMenu.Separator className="bg-separator my-1 h-px" />
              <ContextMenu.SubmenuRoot>
                <ContextMenu.SubmenuTrigger className={menuItem}>
                  <Icon.Edit className="size-4" />
                  Brush
                  <span className="ml-auto text-ink-muted">{brushLabel(brush)}</span>
                  <Icon.ChevronRight className="size-4 text-ink-muted" />
                </ContextMenu.SubmenuTrigger>
                <ContextMenu.Portal>
                  <ContextMenu.Positioner className="z-50" alignOffset={-4}>
                    <ContextMenu.Popup className={menuPopup}>
                      <ContextMenu.RadioGroup
                        value={brush}
                        onValueChange={(value) => isBrush(value) && set({ brush: value })}
                      >
                        {BRUSHES.map((value) => (
                          <ContextMenu.RadioItem key={value} value={value} className={menuItem}>
                            <span className="size-4">
                              <ContextMenu.RadioItemIndicator>
                                <Icon.Check className="size-4" />
                              </ContextMenu.RadioItemIndicator>
                            </span>
                            {brushLabel(value)}
                          </ContextMenu.RadioItem>
                        ))}
                      </ContextMenu.RadioGroup>
                    </ContextMenu.Popup>
                  </ContextMenu.Positioner>
                </ContextMenu.Portal>
              </ContextMenu.SubmenuRoot>
              <ContextMenu.CheckboxItem
                className={menuItem}
                checked={companion}
                onCheckedChange={(checked) => set({ companion: checked })}
              >
                <span className="size-4">
                  <ContextMenu.CheckboxItemIndicator>
                    <Icon.Check className="size-4" />
                  </ContextMenu.CheckboxItemIndicator>
                </span>
                The agent plays along
              </ContextMenu.CheckboxItem>
              <ContextMenu.Separator className="bg-separator my-1 h-px" />
            </>
          )}
          <ContextMenu.Item className={menuItem} onClick={() => set({ shown: !shown })}>
            {shown ? <Icon.Hide className="size-4" /> : <Icon.Eye className="size-4" />}
            {shown ? 'Hide the field' : 'Show the field'}
          </ContextMenu.Item>
        </ContextMenu.Popup>
      </ContextMenu.Positioner>
    </ContextMenu.Portal>
  )
}
