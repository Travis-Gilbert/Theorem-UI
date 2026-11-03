// SOURCING: @chenglou/pretext (prepare once, layout at the note's width) for
// each margin note's height without reflow, margin-layout's stackNotes to
// keep notes level with their passages, React portals into the markup
// plugin's inline widgets, zustand's useStore over the editor's markup host,
// ResizeObserver for the width that decides margin or inline, ui/button.
//
// On the document screen an ask's reply appears where it was asked: beside
// its passage in the right margin when the panel has room, under the
// passage's block when it has not. The agent's comments are notes of their
// own; its highlights and edits mark the text, and its edits are made in the
// note at once, as one undoable step.
import { clearCache, layout, prepare } from '@chenglou/pretext'
import type { EditorView } from '@milkdown/kit/prose/view'
import { useEffect, useLayoutEffect, useMemo, useState } from 'react'
import type { MouseEvent, ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { useStore } from 'zustand'
import { Button } from '@/components/ui/button'
import { useDocumentAsks } from '@/lib/documents/ask-store'
import type { Ask } from '@/lib/documents/ask-store'
import { askAbout, resumeAsks, stopAsk } from '@/lib/documents/asks'
import type { AskedNote } from '@/lib/documents/asks'
import {
  NOTE,
  NOTE_TEXT_WIDTH,
  noteHeight,
  stackNotes,
} from '@/lib/documents/margin-layout'
import type { NoteText } from '@/lib/documents/margin-layout'
import type { Mark } from '@/lib/documents/marks'
import { replyBlocks } from '@/lib/documents/note-text'
import { cn } from '@/lib/utils'
import {
  madeEdits,
  markSummary,
  markupItems,
  movedQuotes,
  pendingEdits,
} from './ask-items'
import { AskMenu, AskPopover } from './ask-popover'
import {
  applyEdits,
  editShows,
  markupKey,
  revertEdits,
  setMarkup,
} from './markup'
import type { MarkupHost } from './markup-host'
import { plainText } from './selection'

/** The note being read, less its text, which is taken when an ask is made. */
export type NoteRef = Omit<AskedNote, 'text' | 'projectId'> & {
  projectId: string | undefined
}

const EMPTY: readonly Ask[] = []
const GAP = 8
/** The prose column's narrowest, padding included, beside a margin. */
const PROSE_MIN = 544
/** The margin column: its notes and the space either side. */
const MARGIN = NOTE.width + 32

/** The note's font, once its faces have loaded, so pretext measures them. */
function useNoteFonts() {
  const [fonts, setFonts] = useState<{ body: string; strong: string }>()
  useEffect(() => {
    let live = true
    const family = getComputedStyle(document.documentElement)
      .getPropertyValue('--font-sans')
      .trim()
    void document.fonts.ready.then(() => {
      if (!live) return
      clearCache()
      setFonts({ body: `400 13px ${family}`, strong: `600 13px ${family}` })
    })
    return () => {
      live = false
    }
  }, [])
  return fonts
}

/** Bumps whenever the frame or the prose changes size, so anchors move. */
function useResized(frame: HTMLElement | null, view: EditorView | undefined) {
  const [size, setSize] = useState({ width: 0, tick: 0 })
  useLayoutEffect(() => {
    if (!frame) return
    const observer = new ResizeObserver(() =>
      setSize((s) => ({ width: frame.clientWidth, tick: s.tick + 1 })),
    )
    observer.observe(frame)
    if (view) observer.observe(view.dom)
    return () => observer.disconnect()
  }, [frame, view])
  return size
}

type Edit = Extract<Mark, { kind: 'edit' }>

/** What an ask's note says while it has no reply, or after it ends badly. */
function statusLine(ask: Ask, hasReply: boolean) {
  if (ask.status === 'failed')
    return `Failed: ${ask.error ?? 'the reply did not finish.'}`
  if (hasReply) return undefined
  if (ask.status === 'running') return 'Thinking…'
  if (ask.status === 'queued') return 'Waiting for the reply before it…'
  if (ask.status === 'stopped') return 'Stopped.'
  return undefined
}

type Note = {
  id: string
  ask: Ask
  /** A comment's mark, for a note of its own. */
  comment?: Extract<Mark, { kind: 'comment' }>
  text: NoteText
  status?: string
}

function notesOf(asks: readonly Ask[], found: ReadonlySet<string>): Note[] {
  return asks.flatMap((ask) => {
    const blocks = replyBlocks(ask.reply)
    const status = statusLine(ask, blocks.length > 0)
    const note: Note = {
      id: ask.id,
      ask,
      status,
      text: {
        question: ask.question,
        blocks: status ? [...blocks, status] : blocks,
        summary: markSummary(ask, found) || undefined,
        actions: true,
      },
    }
    const comments = ask.marks.flatMap((mark): Note[] =>
      mark.kind === 'comment' && found.has(mark.markId)
        ? [
            {
              id: mark.markId,
              ask,
              comment: mark,
              text: { blocks: replyBlocks(mark.body) },
            },
          ]
        : [],
    )
    return [note, ...comments]
  })
}

function NoteBody({
  note,
  view,
  file,
  active,
  onActivate,
}: {
  note: Note
  view: EditorView
  file: NoteRef
  active: boolean
  onActivate: () => void
}) {
  const { ask, comment, text, status } = note
  const made = madeEdits(ask)
  const showing = made.filter((edit) => editShows(view.state, edit))
  const running = ask.status === 'running' || ask.status === 'queued'
  const store = useDocumentAsks.getState()

  const undo = () => {
    revertEdits(showing)(view.state, view.dispatch)
    for (const edit of showing)
      store.setEdit(file.key, ask.id, edit.markId, 'undone')
  }
  const reapply = () => {
    const near = markupKey.getState(view.state)?.ranges.get(ask.id)?.from
    const { applied, missing } = applyEdits(made, near)(
      view.state,
      view.dispatch,
    )
    for (const id of applied) store.setEdit(file.key, ask.id, id, 'applied')
    for (const id of missing) store.setEdit(file.key, ask.id, id, 'missing')
  }
  const retry = () => {
    if (!file.projectId) return
    const passage = ask.quotes?.[ask.id] ?? ask.passage
    askAbout(
      { ...file, projectId: file.projectId, text: plainText(view.state.doc) },
      ask.question,
      { part: ask.part, text: passage.exact },
      passage,
    )
    store.dismiss(file.key, ask.id)
  }
  const dismiss = () => {
    if (running) stopAsk(file.key, ask.id)
    store.dismiss(file.key, ask.id)
  }

  return (
    <article
      data-note={note.id}
      data-active={active || undefined}
      className={cn('theorem-margin-note', comment && 'is-comment')}
      style={{ padding: NOTE.pad, borderWidth: NOTE.border }}
      onClick={onActivate}
    >
      {text.question && (
        <h3 style={{ marginBottom: NOTE.gapQuestion }}>{text.question}</h3>
      )}
      {text.blocks.map((block, i) => (
        <p
          key={i}
          className={cn(block === status && 'is-status')}
          style={{ marginTop: i ? NOTE.gapParagraph : 0 }}
        >
          {block}
        </p>
      ))}
      {text.summary && (
        <p className="theorem-note-summary" style={{ marginTop: NOTE.gapRow }}>
          {text.summary}
        </p>
      )}
      {text.actions && (
        <div
          className="theorem-note-actions"
          style={{ marginTop: NOTE.gapRow, height: NOTE.actions }}
        >
          {running && (
            <Button
              size="xs"
              variant="ghost"
              onClick={() => stopAsk(file.key, ask.id)}
            >
              Stop
            </Button>
          )}
          {showing.length > 0 && (
            <Button size="xs" variant="ghost" onClick={undo}>
              Undo changes
            </Button>
          )}
          {!running && made.length > 0 && showing.length === 0 && (
            <Button size="xs" variant="ghost" onClick={reapply}>
              Reapply
            </Button>
          )}
          {(ask.status === 'failed' || ask.status === 'stopped') &&
            file.projectId && (
              <Button size="xs" variant="ghost" onClick={retry}>
                Retry
              </Button>
            )}
          <span className="flex-1" />
          <Button size="xs" variant="ghost" onClick={dismiss}>
            Dismiss
          </Button>
        </div>
      )}
    </article>
  )
}

/**
 * The asks of the note in `view`, as the document screen shows them, around
 * the editor in `children`.
 */
export function DocumentMarkup({
  host,
  file,
  readOnly,
  children,
}: {
  host: MarkupHost
  file: NoteRef
  readOnly: boolean
  children: ReactNode
}) {
  const view = useStore(host.store, (s) => s.view)
  // Every update of the view renders the margin again.
  const tick = useStore(host.store, (s) => s.tick)
  const asks = useDocumentAsks((s) => s.asks[file.key] ?? EMPTY)
  const items = useMemo(() => markupItems(asks), [asks])
  const [frame, setFrame] = useState<HTMLDivElement | null>(null)
  const { width } = useResized(frame, view)
  const fonts = useNoteFonts()
  const [active, setActive] = useState<string>()
  const margin = width >= PROSE_MIN + MARGIN

  useEffect(() => resumeAsks(file.key), [file.key])

  // What the asks show, then the edits not yet made: theirs are found near
  // the passage, so the passages go in first.
  useEffect(() => {
    if (view) view.dispatch(setMarkup(view.state, { items }))
  }, [view, items])
  useEffect(() => {
    if (!view || readOnly) return
    const store = useDocumentAsks.getState()
    for (const ask of asks) {
      const edits: Edit[] = pendingEdits(ask)
      if (!edits.length) continue
      const near = markupKey.getState(view.state)?.ranges.get(ask.id)?.from
      const { applied, missing } = applyEdits(edits, near)(
        view.state,
        view.dispatch,
      )
      for (const id of applied) store.setEdit(file.key, ask.id, id, 'applied')
      for (const id of missing) store.setEdit(file.key, ask.id, id, 'missing')
    }
  }, [view, asks, readOnly, file.key])
  useEffect(() => {
    if (view)
      view.dispatch(
        setMarkup(view.state, { inline: !margin, active: active ?? null }),
      )
  }, [view, margin, active])
  // What an ask shows follows its text: once rewritten, by an edit or the
  // person, it is quoted again as it reads, so it is found after a reload.
  useEffect(() => {
    if (!view) return
    const store = useDocumentAsks.getState()
    for (const { id, quotes } of movedQuotes(asks, view.state))
      store.patch(file.key, id, { quotes })
  }, [view, asks, tick, file.key])

  const ranges = view ? markupKey.getState(view.state)?.ranges : undefined
  const found = useMemo(() => new Set(ranges?.keys()), [ranges])
  const notes = useMemo(() => notesOf(asks, found), [asks, found])

  // Each note level with its passage (a comment with its text), stacked. It
  // reads the page's layout, so it runs on each render: every change to the
  // note (`tick`) or to its size (`resized`) renders again.
  const tops = (() => {
    if (!view || !frame || !fonts || !margin) return undefined
    const origin = frame.getBoundingClientRect().top
    const measure = (text: string, strong: boolean) =>
      layout(
        prepare(text, strong ? fonts.strong : fonts.body),
        NOTE_TEXT_WIDTH,
        NOTE.line,
      ).height
    const placed = notes.map((note) => {
      const range = ranges?.get(note.id)
      return {
        id: note.id,
        anchor: range ? view.coordsAtPos(range.from).top - origin : 0,
        height: noteHeight(note.text, measure),
      }
    })
    const stacked = stackNotes(placed, GAP, active)
    const bottom = Math.max(
      0,
      ...placed.map((n) => (stacked.get(n.id) ?? 0) + n.height),
    )
    return { stacked, bottom }
  })()

  const activate = (id: string) => setActive(id)
  const onClick = (event: MouseEvent) => {
    const target = event.target instanceof Element ? event.target : null
    const id = target?.closest('[data-markup]')?.getAttribute('data-markup')
    const item = id ? items.find((known) => known.id === id) : undefined
    if (item)
      setActive(item.kind === 'comment' ? item.id : (item.near ?? item.id))
  }

  return (
    <div
      ref={setFrame}
      className={cn(
        'theorem-markup-frame',
        margin && notes.length > 0 && 'has-margin',
      )}
      style={{
        paddingInlineEnd: margin && notes.length > 0 ? MARGIN : undefined,
        minHeight: tops ? tops.bottom + 24 : undefined,
      }}
      onClick={onClick}
    >
      <AskMenu host={host} file={file} readOnly={readOnly} onAsked={activate}>
        {children}
      </AskMenu>
      {view &&
        (margin ? (
          <aside
            className="theorem-margin"
            aria-label="Notes"
            style={{ width: NOTE.width }}
          >
            {tops &&
              notes.map((note) => (
                <div
                  key={note.id}
                  className="theorem-margin-slot"
                  style={{
                    top: tops.stacked.get(note.id) ?? 0,
                    width: NOTE.width,
                  }}
                >
                  <NoteBody
                    note={note}
                    view={view}
                    file={file}
                    active={active === note.id}
                    onActivate={() => activate(note.id)}
                  />
                </div>
              ))}
          </aside>
        ) : (
          notes.map((note) =>
            createPortal(
              <NoteBody
                note={note}
                view={view}
                file={file}
                active={active === note.id}
                onActivate={() => activate(note.id)}
              />,
              host.element(note.id),
              note.id,
            ),
          )
        ))}
      <AskPopover host={host} file={file} onAsked={activate} />
    </div>
  )
}
