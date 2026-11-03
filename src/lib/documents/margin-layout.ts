// SOURCING: plain arithmetic over the anchors the editor reports and the
// heights pretext lays out; nothing upstream stacks margin notes.
//
// Margin notes stack as a document editor's comments do: each sits level with
// its passage unless the one above runs into it. The note being read sits at
// its own passage, and the notes above it move up to make room, as far as the
// margin's top; past that, the note being read moves down.

export type MarginNote = { id: string; anchor: number; height: number }

/** Each note's top, so none overlaps the next by less than `gap`. */
export function stackNotes(
  notes: readonly MarginNote[],
  gap: number,
  active?: string,
): Map<string, number> {
  const order = [...notes].sort((a, b) => a.anchor - b.anchor)
  const start = Math.max(
    order.findIndex((note) => note.id === active),
    0,
  )
  const above = order.slice(0, start)
  const tops = new Map<string, number>()

  // Downwards from the pinned note, or from the first, and never above the
  // margin's top: the pinned note moves down far enough for the notes above.
  let room = above.reduce((sum, note) => sum + note.height + gap, 0)
  let floor = room
  for (const note of order.slice(start)) {
    const top = Math.max(note.anchor, floor)
    tops.set(note.id, top)
    floor = top + note.height + gap
  }
  // Upwards from the pinned note: each ends a gap above the one below it,
  // and leaves room for the notes above it.
  let ceiling = (tops.get(order[start]?.id ?? '') ?? 0) - gap
  for (const note of above.reverse()) {
    room -= note.height + gap
    const top = Math.max(room, Math.min(note.anchor, ceiling - note.height))
    tops.set(note.id, top)
    ceiling = top - gap
  }
  return tops
}

/**
 * A margin note's box, in pixels. The note paints with these values, so the
 * height worked out here is the height it paints at.
 */
export const NOTE = {
  width: 264,
  pad: 12,
  border: 1,
  /** Every line of a note's text, 13px type on a 20px line. */
  line: 20,
  gapQuestion: 6,
  gapParagraph: 8,
  /** Above the summary and the actions row. */
  gapRow: 8,
  actions: 28,
} as const

/** The width a note's text wraps at. */
export const NOTE_TEXT_WIDTH = NOTE.width - 2 * (NOTE.pad + NOTE.border)

export type NoteText = {
  /** The ask's question, set stronger; a comment has none. */
  question?: string
  blocks: readonly string[]
  /** What the agent marked, in a line that wraps like the rest. */
  summary?: string
  actions?: boolean
}

/**
 * A note's height: its text as `measure` lays it out (pretext, at
 * NOTE_TEXT_WIDTH), and its actions row.
 */
export function noteHeight(
  note: NoteText,
  measure: (text: string, strong: boolean) => number,
) {
  const body = note.blocks.reduce(
    (sum, block, i) =>
      sum + measure(block, false) + (i ? NOTE.gapParagraph : 0),
    0,
  )
  return (
    2 * (NOTE.pad + NOTE.border) +
    (note.question ? measure(note.question, true) + NOTE.gapQuestion : 0) +
    body +
    (note.summary ? NOTE.gapRow + measure(note.summary, false) : 0) +
    (note.actions ? NOTE.gapRow + NOTE.actions : 0)
  )
}
