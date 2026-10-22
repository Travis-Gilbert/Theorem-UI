# Infinite canvas in Spaces mode

An Obsidian-style canvas for Theorem UI: Markdown notes and the links between
them on an infinite surface, with the agent one right-click away. The checklist
in `infinite-canvas.checklist.json` tracks this spec item by item.

## What ships in this milestone

1. **Canvas.** Spaces mode shows a React Flow (`@xyflow/react`) canvas. Each
   project has one Theorem Space: `space:project:<projectId>`, role `project`.
   Notes are placements; links between notes are connections. Pan, zoom,
   minimap, controls, box select, resize, and drag-to-connect all come from
   React Flow. Deleting a card removes only its placement, never the note.
2. **Notes are Markdown.** A note is a Theorem document (`theorem-document/2`).
   Its `markdownProjection` is the note's Markdown, byte for byte. The
   canonical body is a full Loro snapshot in the same layout the server's own
   promote path writes: a `blocks` tree with a root and one `paragraph` child
   whose `text:<id>` holds the whole Markdown.
3. **Block-editor feel on Markdown.** Notes are edited in Milkdown Crepe:
   - a drag handle and `+` on every block (BlockEdit);
   - a `/` menu with the stock blocks plus **Embed note** and **Ask Theorem**;
   - a selection toolbar, tables, task lists, code blocks with CodeMirror,
     and LaTeX.
4. **Theorem embeds.** An embed is a fenced block:

   ````md
   ```theorem-embed
   {"kind":"document","id":"note:...","title":"Reading list"}
   ```
   ````

   Crepe's code-block preview renders it as a card with the embedded note's
   Markdown, and clicking the card opens that note. Crepe sanitizes a preview
   into static HTML, so the card is rendered to markup from the note as loaded
   when the block renders, not kept live. Anywhere else (git, another editor,
   an agent) it stays a readable fence.

5. **Focused note view.** Opening a note puts it in its own dock panel
   (`note-panel:<documentId>`) beside the canvas, editable at full size. The canvas
   card and the panel edit the same document. Their saves serialize through
   one queue per document, so they never race each other.
6. **Detail by zoom.** Above 0.6x zoom a card shows the live editor. Below it
   the card shows a read-only title and an excerpt. Off-screen cards are not
   rendered (`onlyRenderVisibleElements`).
7. **Right-click agent composer** (carried over from Theorem Web):
   - **Opening it.** Right-click a card, a selection of cards, the pane, or
     selected text inside a note. Cmd/Ctrl+Enter opens it on the current
     selection.
   - **Context chips.** The composer shows the context as chips, and each
     chip can be removed.
   - **Actions.** Standard actions (Summarize, Explain, Find connections,
     Critique, Continue writing) plus a free-form prompt.
   - **Each request runs in its own Theorem thread** in the project:
     - `spaceContext` names the saved space, the selected placements' objects,
       and, for a text selection, a `text_range` locator with the quote;
     - excerpts are inlined in the message text, because the server passes the
       agent only identities.
   - **While it runs.** Status streams into the composer, and Stop cancels the
     run.
   - **The result.** It becomes a new note placed beside its sources, with
     connections from each source. The note ends with a Markdown link to the
     conversation.
8. **Saving and conflicts.**
   - **Note saves** are debounced. A save sends `expectedRevision` with a
     matching `If-Match`, and the header idempotency key equals the body key.
   - **Note conflicts.** On a stale revision the client fetches the server
     version and merges it with the local revision through Loro: both descend
     from the same snapshot, so concurrent edits combine instead of one
     overwriting the other. It saves the merge and retries up to three times.
     Text typed while a merged save is in flight merges onto its result. If
     the server version is no longer a one-paragraph note, or conflicts keep
     coming, a "changed elsewhere" banner offers to load the latest.
   - **Space saves** PUT the whole record with `If-Match` = the current
     revision. On `409 stale_space_revision` the client reloads, rebases the
     local changes onto the fresh record (by placement and connection id), and
     saves again.
9. **Add existing notes.** A picker searches documents (Base UI Combobox over
   `documents.list({query})`) and places the chosen note at the pane position.
10. **Tests.**
    - **Markdown round trip** (`bun test` + happy-dom): load and serialize
      through a real Crepe editor, and check that it is stable after the first
      normalization. This covers headings, inline marks, links, lists, task
      lists, tables, code, quotes, math, and `theorem-embed` fences, whose
      reference must survive exactly.
    - **Loro canonical**: encode, decode, update while keeping history, merge
      concurrent edits, merge text typed during a merged save, reject other
      layouts, plus the digest format.
    - **Embed fences and quote ranges**: print and parse, and code-point
      offsets for `text_range` locators.

## Notes kept read-only

A document whose canonical is not the one-paragraph layout was written by
another surface with real block structure. Rewriting it as one paragraph would
drop that structure. Those notes open read-only, with a label saying why.

## Out of scope for this milestone

- PDF, image, and table placements.
- Chat-artifact embeds.
- Agent-authored arrangement (`arranged: true`).
- Groups and ink.

The Space record already models all of these. They are follow-ups, not
missing pieces.

## Known merge point

The Theia branch also edits `src/components/shell/dock.tsx`. This milestone
adds the `note` panel there, so expect a small conflict when both land.
