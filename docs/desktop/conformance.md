# Servo conformance (plan Phase 0, items 3 and 4)

How Theorem UI behaves in the desktop app's Servo (Theorem's fork at
`b9d6db9`, Stylo 0.22.0) compared with Chrome on the same build, and what
happens to each gap. Plan: `docs/plans/vault-dynamic-documents.md`, Phase 0.
Measured 2026-10-23.

## Method

- **One build, two engines.** `bun run build`, then the same
  `.output/server/index.mjs` against the same Theorem backend
  (`THEOREM_API_URL=http://127.0.0.1:8084`). Chrome is the in-app Chromium
  browser at 1280x820 on the web-mode server. Servo is the desktop host
  (`desktop/`) in desktop mode.
- **Servo is driven from the host.** `THEOREM_DRIVE=<steps.json>` runs a step
  list (`desktop/src/drive.rs`): clicks, drags, wheel scrolls, keystrokes,
  typing, IME composition and commit, scripts, and screenshots. It writes
  `report.json` with each step's value. Input goes through GPUI's own
  dispatch, so it crosses the whole embedder layer. It skips AppKit: the child
  view's hit testing and the real input method's key handling.
- **Chrome is driven with the browser tool's** clicks, drags, keys and
  scripts. It cannot reach the system clipboard or an input method, so those
  rows are marked "not driven" for Chrome.
- **CSS is diffed in the CSSOM.** The same script walks every stylesheet in
  both engines and lists each style rule with its context (`@layer`, `@media`,
  `@supports`, `@container`) and the declarations the engine kept. A rule
  missing in Servo was dropped by the parser; a declaration missing was
  dropped by the property parser. Serialization differences
  (`(a: b)` against `(a:b)`, quoted attribute values) are normalized away
  before the diff. Chrome keeps 2492 rules. Servo keeps 2427 of them and adds
  the 5 `@supports` fallbacks that only it applies.

## Results by component

### Chat

| Check | Chrome | Servo |
| --- | --- | --- |
| Send a message, watch the stream | works | works |
| Reload during a run, see it resume | works | works |
| Approve a tool | not exercised | not exercised |
| Open an artifact, pin a revision ("vN of M") | works | works |
| Copy an artifact to the system clipboard | not driven | works (`pbpaste`) |
| Switch threads | works | works |
| Relaunch, get the layout back | works (reload) | dock restored, opens a new chat |

- **Approve a tool** was not exercised in either engine. No tool reachable
  from this backend asks for approval: Theorem decides approvals server-side.
  The UI part, `ApprovalCard`, is plain buttons, and plain buttons work in
  Servo throughout this pass.
- **Relaunch.** Servo restores the dock from `localStorage`
  (`theorem-ui:shell`), so the note group comes back. The thread does not,
  because `/desktop/session` always redirects to `/`, a new chat. A browser
  opening `/` does the same. Reopening the last thread is a product choice,
  not a Servo gap.

### React Flow (canvas)

| Check | Chrome | Servo |
| --- | --- | --- |
| Select a node, move it with the arrow keys | works | works |
| Drag a node by its header | works | works |
| Connect two handles | works | works |
| Pan, zoom buttons, wheel zoom, fit view | works | works (needs CSS fallback 1) |
| Select an edge, delete it with Backspace | works after fix A | fails (gap 3) |

- Fit view is intermittent in Chrome on a top-level load. It predates this
  pass and is xyflow's own issue (xyflow/xyflow#4801), not an engine gap.

### Crepe (notes)

| Check | Chrome | Servo |
| --- | --- | --- |
| Typing, Enter | works | works |
| Mouse-drag selection | works | works |
| Double-click selects a word | works | fails (gap 5) |
| Arrow keys, Shift-arrow selection | works | fails (gap 4) |
| Cmd-C to the system clipboard | not driven | works |
| Cmd-V | not driven | works after fix B |
| Cmd-Z | works | works |
| IME composition | not driven | fails (gap 6) |
| `/` menu opens and closes | works | works |
| `/` menu placement | under the caret | wrong place (gap 7) |

### Dockview

| Check | Chrome | Servo |
| --- | --- | --- |
| Resize with a sash | works | works |
| Focus a group by its tab | works | works |
| Drag a tab into another group | works | fails (gap 8) |

- In Chrome a click inside a canvas panel does not activate its group. That
  is Dockview's behavior, not an engine gap.
- Dragging a tab to a group's edge to split it could not be driven in Chrome
  with the browser tool. It fails in Servo for the same reason as gap 8.

### Rendering

| Check | Chrome | Servo |
| --- | --- | --- |
| Shiki code blocks | works | works |
| Mermaid diagrams | works | shapes and labels solid black (gap 1) |

### File handlers (plan Phase 3)

Servo only: workspace folders need the desktop host. A folder of the
`test/fixtures/handlers` files plus two notes, a TypeScript file, a CSV, a
JSONC file and 512 random bytes, opened file by file from the tree.

| File | Opens in | Servo |
| --- | --- | --- |
| `.md` with properties, a link, a callout and an embed | Crepe | works |
| `.canvas` | React Flow | works; minimap black (gap 1) |
| `.ts` | CodeMirror | works |
| `.csv` | table | works |
| `.jsonc` | tree | works |
| `.pdf` | react-pdf | pages draw after fix E; no text layer (gap 12) |
| `.png` | `img` | works |
| `.wav`, `.mp4` | `audio`, `video` | elements mount; playback not driven |
| `.bin` | file info with "Open with" | works |

## Gaps and dispositions

Fixed in this pass:

- **A. Edges could not be selected** (Theorem UI, both engines).
  `canvas.tsx` ignored React Flow's `select` edge changes, so Backspace had
  nothing to delete. It now keeps edge selection and merges it into the edges
  it renders.
- **B. Cmd-V pasted twice in Servo** (host). Servo already runs the
  clipboard shortcuts on keydown. When the page handles `paste` itself, the
  keydown comes back unconsumed and the host replayed it to GPUI's Edit menu,
  which sent a second paste. `PageView::editing` now skips replayed
  keystrokes.
- **C. The artifact panel was squeezed on first open** (Theorem UI, both
  engines). With a note open beside the thread, the thread (360px), note
  (360px) and artifact (400px) minimums add up to more than the dock, and
  Dockview opened the artifact group at about 145px. `open-beside.ts` now
  opens a column only when the dock's minimum width plus the new panel's
  still fits, and otherwise adds the panel as a tab in the side group.
  Artifacts, notes and workspace files share the rule. Rechecked in Chrome:
  the artifact joins the note's group, both groups stay at 432px.
- **D. A quick close lost the last note edit** (Theorem UI, both engines).
  Milkdown waits 200ms before it reports an edit and cancels the report when
  the editor is destroyed. The editor now hands over its text on destroy,
  with a serializer it keeps from mount, because Milkdown removes the
  context's serializer before it closes the view. Leaving the page
  (`beforeunload`, or the page turning hidden) starts the scheduled saves at
  once, and `beforeunload` asks first while one is unfinished. Rechecked in
  Chrome: an edit closed within the debounce and an edit reloaded within it
  both reached the backend. The leave prompt itself did not appear in the
  in-app browser, so it is unverified.
- **E. PDF text drew as empty boxes in Servo** (Theorem UI, Servo). pdf.js
  draws text in the PDF's embedded fonts, which it loads through `FontFace`,
  and Servo's canvas does not draw with loaded fonts (gap 11). The PDF
  handler sets pdf.js's `disableFontFace`, so glyphs are drawn as paths.
  Rechecked in Servo: the fixture's text reads correctly.
- **F. Quitting lost an edit made within the save delay** (host). Quitting
  stopped the local server, and the page never received `beforeunload` or a
  hidden `visibilitychange`: Servo's `request_unload` allows every unload
  without asking the page. Cmd-Q, the Quit menu item and closing the window
  now go through `Host::quit` in `bridge.rs`. Once the page has reported its
  edited state, the host sends it `leaving`; the page collects the text its
  editors have not reported yet, starts every scheduled save, and reports
  `setDocumentEdited(false)` once nothing is unsaved, and the host quits then.
  Without that answer in 3 seconds, the host asks whether to quit anyway.
  Rechecked in Servo: text typed just before quitting reached the backend,
  and a control build that quits at once lost it. The 3-second prompt and
  closing the window were not driven.
- **CSS fallbacks** (Theorem UI). `styles.css` gives Servo something to draw
  where it drops a declaration the page depends on:
  1. `pointer-events: all`, which Servo drops: behind
     `@supports not (pointer-events: all)`, React Flow nodes, the selection
     rectangle and the connecting handles use `auto`. Without it nothing on
     the canvas can be pressed.
  2. `mask-image`: `.icon-mask` paints the icon itself, inverted to about the
     theme's ink, so icons lose their hover and state colors in Servo; the
     `.rail-junction-corner` is hidden instead of painting a square.
  3. `background-clip: text`: `.text-ink-faint-sheet` uses the plain faint
     ink color.

Servo, in Theorem's fork first (carried through `[patch.crates-io]`) and
then upstream:

1. **Inline SVG ignores page CSS.** Fill and stroke from stylesheets,
   `var()` and `currentColor` do not reach inline SVG, so Mermaid's shapes,
   labels and arrows, the inline icons and the minimap mask paint black.
   Until it is fixed, Theorem UI could render Mermaid to an `<img>` with
   resolved colors.
2. **`:has()` is off.** Stylo parses `:has()` only when
   `layout.css.has-selector.enabled` is set. It defaults to false, and Servo
   neither forwards it as a preference nor lists it as experimental, so the
   31 rules that use it outside `:is()` or `:where()` are dropped: Dockview's
   focus-visible rings, wrapped tabs and spaced themes, Milkdown's embed
   tools, image editor and table handles, and the `has-*` padding
   utilities.
   The host could set the Stylo preference directly, but Servo has not
   verified `:has()` invalidation, so this belongs in the fork with tests.
3. **SVG hit testing, focus and `dataset`.** Events on an SVG path target an
   ancestor, `pointer-events: visibleStroke` is dropped, SVG elements cannot
   take focus, and `SVGElement.dataset` is missing. React Flow edges cannot be
   selected.
4. **No caret movement by keyboard in `contenteditable`.** Servo maps arrows
   and Shift-arrows to `EditingAction::MoveCursor`, but the document's
   `perform_editing_action` does nothing for it outside text controls.
5. **No double-click word selection** outside text controls.
6. **IME text never reaches `contenteditable`.** Servo fires the composition
   events but inserts the committed text only into `input` and `textarea`.
   A host fallback is possible: commit the text as key events when no Servo
   text control has focus. It is not built, because the fix belongs where
   Servo inserts committed text.
7. **`Range` geometry.** `getBoundingClientRect` and `getClientRects` on a
   text range return an ancestor's box or the viewport, which breaks
   ProseMirror's `coordsAtPos` and floating-ui placement.
8. **No HTML5 drag and drop.** Drag gestures only select. Dockview's tab
   drag and drop needs `dragstart`, `dragover` and `drop`.
9. **`@container` is not parsed.** Stylo 0.22 parses `@container` rules only
   with its `gecko` feature, and Servo's layout computes no container sizes.
   The `layout_container_queries_enabled` preference only enables the
   `container-type` and `container-name` properties, so the host does not set
   it. `canvas-split.tsx` always shows its stacked layout. That is a usable
   fallback, so Theorem UI does not change.
10. **Dropped declarations** that change what the page shows:
    - `text-overflow: ellipsis` (`.truncate`, Dockview tab labels): text is
      clipped without an ellipsis.
    - `display: -webkit-box` with `-webkit-line-clamp` (`.line-clamp-2`,
      `.line-clamp-6`): text is not clamped.
    - `vertical-align` on replaced elements and table cells.
    - `writing-mode` (vertical Dockview tabs), `backdrop-filter`,
      `field-sizing`, `appearance`, `resize`, `content-visibility`,
      `text-underline-offset`, `text-wrap`, `scrollbar-width` and
      `scrollbar-color`, and scroll-driven animations (`animation-timeline`).

    Vendor pseudo-elements (`::-webkit-scrollbar`, the date field parts) are
    dropped too. They only style Chrome's own controls, so nothing is lost.
11. **Canvas text ignores loaded fonts.** `FontFace` exists in the page and
    pdf.js adds its fonts with it, but canvas text in those families does not
    come out in them, so pdf.js's remapped glyphs show as boxes. When it is
    fixed, the PDF handler can drop `disableFontFace` (fix E). Separately,
    `measureText` reports 0 for `fontBoundingBoxAscent` and
    `fontBoundingBoxDescent`.
12. **The PDF text layer stays empty.** react-pdf mounts the layer, but no
    text spans appear and the page reports no error, so PDF text cannot be
    selected or found. A plain `ReadableStream`, one with a size strategy, and
    canvas `measureText` all work in Servo, so the cause is not found yet.

Host, not fixed:

- **The Dock's Quit, logging out and shutting down skip the quit
  handshake** (fix F). They reach the app as `terminate:`, which GPUI's macOS
  layer lets through without asking the app: it registers only
  `applicationWillTerminate:`, which runs `on_app_quit` for at most 200ms
  (`SHUTDOWN_TIMEOUT`). An edit made within the save delay before one of
  them is lost. Waiting for the page there needs an
  `applicationShouldTerminate:` hook in GPUI that can answer later
  (`NSTerminateLater`).

## Phase 0 status

1. **The app runs:** yes, at `b093fd2`, and every run in this pass.
2. **The embedder layer:** mouse, drag, wheel, keys, cursor, focus and the
   clipboard work through the driver; fix B is in. IME composition reaches
   Servo, but text controls are the only place it lands (gap 6).
3. **Conformance:** this document. Approving a tool was not exercised.
4. **Dispositions:** this document.
5. **One native capability end to end:** `b093fd2` checked every bridge call
   from a probe in the page and opened the native editor. Saving from the
   editor and seeing the page update, the iframe that cannot reach the
   bridge, and the browser that cannot reach the server were not rechecked
   in this pass.
6. **The in-scene spike:** not started. Servo's `IOSurface` frames through
   the BGRA renderer patch, a GPUI overlay above the page, and the frame-time
   comparison are still to do.

## Test data this pass left on the backend

- An "Untitled note" with placement `p:f6def048`, edited by the Crepe runs.
- Edges `c:5582c4f5` and `c:54f9b105`, created and then deleted.
- Node `p:8b805d95`, moved to x = -4485.01.
- Threads `57e9fef66a8b5ce342f36d35b`, `4ff920c127bed5b1ea827cd21` (with
  revision 2 of `debounced-async.ts`), `6c863eceb09d8340a918598f6` and
  `24143a92e040789ce48bcd585`.
