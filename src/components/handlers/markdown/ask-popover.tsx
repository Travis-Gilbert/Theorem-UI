// SOURCING: Base UI Popover with a virtual anchor (as canvas/agent-composer.tsx
// opens at the pointer) and Base UI ContextMenu (as the thread list's rows),
// ui/input and ui/button; zustand's useStore over the editor's markup host.
//
// Asking about a passage happens at the passage: a one-line question, or one
// of the quick asks, from the selection's toolbar, Mod-Alt-m, or a right-click
// on the paragraph. There is no composer on the document screen.
import { ContextMenu } from '@base-ui/react/context-menu'
import { Popover } from '@base-ui/react/popover'
import { useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { useStore } from 'zustand'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { askAbout } from '@/lib/documents/asks'
import type { NoteRef } from './document-markup'
import type { MarkupHost } from './markup-host'
import { askRange, plainText, proseExcerpt, quoteAt } from './selection'

const QUICK = [
  { label: 'Explain', question: 'Explain this passage.' },
  {
    label: 'Critique',
    question: 'Critique this passage: what is unclear, weak or unsupported?',
  },
  {
    label: 'Rewrite',
    question:
      'Rewrite this passage so it reads more clearly, and make the change in the note.',
  },
] as const

type Range = { from: number; to: number }

/** Asks about `range` of the host's note; the new ask's id, or undefined. */
function ask(host: MarkupHost, file: NoteRef, range: Range, question: string) {
  const view = host.store.getState().view
  if (!view || !file.projectId) return undefined
  const { doc } = view.state
  const excerpt = proseExcerpt(doc, range.from, range.to)
  if (!excerpt) return undefined
  return askAbout(
    {
      ...file,
      projectId: file.projectId,
      text: plainText(doc),
      documentSource: file.captureDocument?.(),
    },
    question,
    excerpt,
    quoteAt(doc, range.from, range.to),
  )
}

function AskForm({ onSend }: { onSend: (question: string) => void }) {
  const [question, setQuestion] = useState('')
  return (
    <>
      <form
        onSubmit={(event) => {
          event.preventDefault()
          if (question.trim()) onSend(question.trim())
        }}
      >
        <Input
          autoFocus
          aria-label="Ask Theorem about this passage"
          placeholder="Ask about this passage"
          value={question}
          onChange={(event) => setQuestion(event.target.value)}
        />
      </form>
      <div className="mt-1.5 flex gap-1">
        {QUICK.map((quick) => (
          <Button
            key={quick.label}
            size="xs"
            variant="ghost"
            onClick={() => onSend(quick.question)}
          >
            {quick.label}
          </Button>
        ))}
      </div>
    </>
  )
}

/** The ask popover, opened by the host at the passage. */
export function AskPopover({
  host,
  file,
  onAsked,
}: {
  host: MarkupHost
  file: NoteRef
  onAsked: (id: string) => void
}) {
  const asking = useStore(host.store, (s) => s.asking)
  const send = (question: string) => {
    if (!asking) return
    const id = ask(host, file, asking, question)
    host.close()
    host.store.getState().view?.focus()
    if (id) onAsked(id)
  }
  return (
    <Popover.Root
      open={!!asking && !!file.projectId}
      onOpenChange={(open) => {
        if (!open) host.close()
      }}
    >
      <Popover.Portal>
        <Popover.Positioner
          anchor={
            asking && {
              getBoundingClientRect: () =>
                DOMRect.fromRect({
                  x: asking.at.x,
                  y: asking.at.y,
                  width: 0,
                  height: 0,
                }),
            }
          }
          side="bottom"
          align="start"
          sideOffset={6}
          collisionPadding={12}
          className="z-50"
        >
          <Popover.Popup className="w-[min(360px,calc(100vw-24px))] rounded-xl bg-popover p-2 text-sm text-popover-foreground shadow-lg ring-1 ring-foreground/10 outline-none data-closed:animate-out data-closed:fade-out-0 data-open:animate-in data-open:fade-in-0">
            <Popover.Title className="sr-only">Ask Theorem</Popover.Title>
            {asking && (
              // A new passage starts a fresh question.
              <AskForm key={`${asking.from}:${asking.to}`} onSend={send} />
            )}
          </Popover.Popup>
        </Popover.Positioner>
      </Popover.Portal>
    </Popover.Root>
  )
}

const menuItem =
  'data-highlighted:bg-hover flex h-8 cursor-default items-center gap-2 rounded-md px-2 text-sm outline-none select-none'

/**
 * Right-click on a paragraph, or on the selection, to ask about it. Where
 * there is nothing to ask about, the browser's own menu opens.
 */
export function AskMenu({
  host,
  file,
  readOnly,
  onAsked,
  children,
}: {
  host: MarkupHost
  file: NoteRef
  readOnly: boolean
  onAsked: (id: string) => void
  children: ReactNode
}) {
  const target = useRef<{
    range: Range
    pos: number
    at: { x: number; y: number }
  }>(undefined)
  if (readOnly || !file.projectId) return children
  const quick = (question: string) => {
    const view = host.store.getState().view
    const id = target.current && ask(host, file, target.current.range, question)
    view?.focus()
    if (id) onAsked(id)
  }
  return (
    <ContextMenu.Root>
      <ContextMenu.Trigger
        render={<div />}
        onContextMenu={(event) => {
          const view = host.store.getState().view
          const pos = view?.posAtCoords({
            left: event.clientX,
            top: event.clientY,
          })?.pos
          const range =
            view && pos !== undefined ? askRange(view.state, pos) : undefined
          target.current =
            range && pos !== undefined
              ? { range, pos, at: { x: event.clientX, y: event.clientY } }
              : undefined
          if (!target.current) event.preventBaseUIHandler()
        }}
      >
        {children}
      </ContextMenu.Trigger>
      <ContextMenu.Portal>
        <ContextMenu.Positioner className="z-50">
          <ContextMenu.Popup
            finalFocus={false}
            className="bg-popover text-popover-foreground shadow-popover border-separator min-w-40 origin-(--transform-origin) rounded-lg border p-1 outline-none transition-[opacity,scale] duration-100 data-ending-style:scale-95 data-ending-style:opacity-0 data-starting-style:scale-95 data-starting-style:opacity-0"
          >
            <ContextMenu.Item
              className={menuItem}
              onClick={() => {
                const view = host.store.getState().view
                if (view && target.current)
                  host.ask(view, target.current.pos, target.current.at)
              }}
            >
              Ask Theorem…
            </ContextMenu.Item>
            <ContextMenu.Separator className="bg-separator mx-1 my-1 h-px" />
            {QUICK.map((item) => (
              <ContextMenu.Item
                key={item.label}
                className={menuItem}
                onClick={() => quick(item.question)}
              >
                {item.label}
              </ContextMenu.Item>
            ))}
          </ContextMenu.Popup>
        </ContextMenu.Positioner>
      </ContextMenu.Portal>
    </ContextMenu.Root>
  )
}
