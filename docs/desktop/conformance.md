# Servo conformance (plan Phase 0, items 3 and 4)

How Theorem UI behaves in the desktop app's Servo compared with Chrome on the
same build, and what happens to each gap. Plan:
`docs/plans/vault-dynamic-documents.md`, Phase 0. Measured 2026-10-23 on
Theorem's fork at `b9d6db9` (Stylo 0.22.0). The editing, focus and `:has()`
rows were rechecked the same day at `87ac5a3`, the fork commit with the
repairs for this report, where the host turns `:has()` on
([Rechecked at 87ac5a3](#rechecked-at-87ac5a3)). Rows not rechecked describe
`b9d6db9`.

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
  the 5 `@supports` fallbacks that only it applies. That count is from
  `b9d6db9`, before `:has()` was turned on.

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
| Double-click selects a word | works | works since `87ac5a3` (gap 5) |
| Arrow keys, Shift-arrow selection | works | works since `87ac5a3`, in logical order (gap 4) |
| Cmd-C to the system clipboard | not driven | works |
| Cmd-V | not driven | works after fix B |
| Cmd-Z | works | works, also across a composition |
| IME composition | not driven | works through GPUI's input handler since `87ac5a3`; a real input method not driven (gap 6) |
| `/` menu opens and closes | works | works |
| `/` menu placement | under the caret | under the caret since `87ac5a3` (gap 7) |
| A long unbroken word wraps inside the note | not checked | works since `87ac5a3` (gap 13) |

### Dockview

| Check | Chrome | Servo |
| --- | --- | --- |
| Resize with a sash | works | works |
| Focus a group by its tab | works | works |
| Focus ring on a tab from the keyboard | not checked | works since `87ac5a3`, with `:has()` on (gap 2) |
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

## Rechecked at 87ac5a3

- **What ran.** This branch's host, built at `87ac5a3` with
  `layout_css_has_selector_enabled` on (`desktop/src/engine.rs`), ran the
  fork's own native step list (`ui-focus-wrap-final-12`, 85 steps) against
  the same `.output` build. `HOME` pointed at a scratch folder holding copies
  of that run's profile and fixture notes, so no real profile or original
  fixture was touched.
- **Result: 85 of 85 steps, no errors.** The checks:
  - `:has()` parses.
  - In Crepe:
    - a click places the caret;
    - Right and Shift-Right move and extend it;
    - a double-click selects "bold";
    - two compositions replace each other and commit once;
    - Cmd-Z and Cmd-Shift-Z undo and redo across them;
    - typing and Backspace work after them;
    - an empty commit removes a preedit;
    - a text range measures inside its line;
    - Milkdown's `:has()` table-cell rule follows a class change.
  - In Dockview, a tab's button and the tab itself show Dockview's own ring
    after Tab and Shift-Tab, and lose it on blur.
  - A note with a long unbroken word wraps it and stays editable.
  - The edits reached the note's file on disk.
- **A second run** checked two more things:
  - The `/` menu opened 4px under its line and 6px right of its left edge.
  - `typeof FontFace` was `"function"`, while `document.fonts.add` and
    `document.fonts.load` were undefined (gap 11).
- **The gap after "A" in that step list's captures is text, not a paint
  error.** The list presses Tab while the caret is still in the note, before
  it focuses the Dockview tab by script. Crepe's indent plugin
  (`@milkdown/kit/plugin/indent`) inserts four spaces there, as it would in any
  engine, and the saved file has them.
- **Not rechecked at `87ac5a3`:** Chat, React Flow, the other Dockview rows,
  Rendering, the file handlers and the CSSOM diff.

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
  and in Servo those fonts never reach canvas text (gap 11). The PDF
  handler sets pdf.js's `disableFontFace`, so glyphs are drawn as paths.
  Rechecked in Servo: the fixture's text reads correctly.
- **F. Quitting lost an edit made within the save delay** (host). Quitting
  stopped the local server, and the page never received `beforeunload` or a
  hidden `visibilitychange`: Servo's `request_unload` allows every unload
  without asking the page. Cmd-Q, the Quit menu item and closing the window
  now go through `Host::quit` in `bridge.rs`. A native editor with unsaved
  changes asks first, as closing it does, and quitting goes on once it has
  closed (a headless GPUI test in `editor.rs` drives Cancel and Don't Save).
  Once the page has reported its
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

Servo, in Theorem's fork first and then upstream. The host takes the fork by
git `rev`. The fork carries its patched Stylo 0.22 as a path dependency
(`support/downstream/vendor/stylo`), so the host needs no `[patch]` for it.
Each item says where it stands at `87ac5a3`. The fork's engine evidence is in
its `support/downstream/UI-CONFORMANCE.md`: 1,871 WPT assertions pass and 1
fails (gap 14).

1. **Inline SVG ignores page CSS.** Open. Fill and stroke from stylesheets,
   `var()` and `currentColor` do not reach inline SVG. Mermaid's shapes,
   labels and arrows, the inline icons (the `/` menu's too) and the minimap
   mask all paint black. Until it is fixed, Theorem UI could render Mermaid
   to an `<img>` with resolved colors.
2. **`:has()` was off.** Fixed at `87ac5a3`, and the host turns it on.
   - **The gap.** Stylo parses `:has()` only when
     `layout.css.has-selector.enabled` is set. Servo neither forwarded that
     setting nor invalidated relative selectors. So the 31 rules that use
     `:has()` outside `:is()` or `:where()` were dropped:
     - Dockview's focus-visible rings, wrapped tabs and spaced themes;
     - Milkdown's embed tools, image editor and table handles;
     - the `has-*` padding utilities.
   - **The fix.** The fork forwards the setting as
     `layout_css_has_selector_enabled` and wires in Stylo's relative-selector
     invalidation: 1,444 of 1,444 assertions pass across 26 WPT files.
     `desktop/src/engine.rs` turns it on.
   - **Checked in the host:** Dockview's own tab ring appears on keyboard
     focus and clears on blur, and Milkdown's table-cell rule follows a class
     change.
   - **Still open:** the fork keeps the setting off by default, and its
     large-tree `has-complexity` test is not qualified yet. A slow
     restyle on a very large page would show up here first.
3. **SVG hit testing, focus and `dataset`.** Partly fixed at `87ac5a3`.
   - **Fixed:** `SVGElement.dataset` now exists (15 of 15 WPT assertions).
   - **Still open:** events on an SVG path still go to an ancestor,
     `pointer-events: visibleStroke` is still dropped, and SVG elements still
     cannot take focus. React Flow edges still cannot be selected.
   - **Not rechecked:** the canvas rows.
4. **Caret movement by keyboard in `contenteditable`.** Fixed at `87ac5a3`,
   in logical order. Servo mapped arrows and Shift-arrows to
   `EditingAction::MoveCursor`, but `perform_editing_action` did nothing for
   it outside text controls. Arrows and Shift-arrows now move and extend the
   caret in Crepe. Not qualified: visual order in bidirectional text, Page Up
   and Page Down, and vertical movement across a scroll.
5. **Double-click word selection** outside text controls. Fixed at `87ac5a3`:
   a double-click on "bold" in Crepe selects it.
6. **IME text did not reach `contenteditable`.** Fixed at `87ac5a3` for
   composition that comes through the host.
   - **The gap.** Servo fired the composition events but inserted the
     committed text only into `input` and `textarea`.
   - **Now, through GPUI's input handler:**
     - each preedit replaces the one before it;
     - the commit lands once;
     - an empty commit removes the preedit;
     - undo and redo restore the text around it.
   - **Not verified:** a real macOS input method. The driver calls GPUI's
     input handler, not AppKit's.
7. **`Range` geometry.** Fixed at `87ac5a3`. `getBoundingClientRect` and
   `getClientRects` on a text range returned an ancestor's box or the
   viewport, which broke ProseMirror's `coordsAtPos` and floating-ui
   placement. Now a range inside Crepe's first paragraph measures within its
   line, and the `/` menu opens 4px under the line it was typed on. Caret
   positions inside a ligature are not qualified.
8. **No HTML5 drag and drop.** Open. Drag gestures only select. Dockview's tab
   drag and drop needs `dragstart`, `dragover` and `drop`.
9. **`@container` is not parsed.** Open. Stylo 0.22 parses `@container` rules only
   with its `gecko` feature, and Servo's layout computes no container sizes.
   The `layout_container_queries_enabled` preference only enables the
   `container-type` and `container-name` properties, so the host does not set
   it. `canvas-split.tsx` always shows its stacked layout. That is a usable
   fallback, so Theorem UI does not change.
10. **Dropped declarations** that change what the page shows. Open:
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
11. **PDF fonts drew as boxes.** pdf.js draws text in the PDF's embedded
    fonts, and in Servo those glyphs came out as boxes until fix E.
    - **Likely cause, measured at `87ac5a3`.** `FontFace` exists in the page,
      but `document.fonts` has no `add` or `load`. Both sit behind Servo's
      `dom_fontface_enabled` setting, which defaults to false and which the
      host does not set. So pdf.js builds its fonts but cannot add them to
      the document.
    - **What the fork showed.** With that setting on, the fork's Ahem probe
      draws loaded fonts in canvas, from a URL and from an `ArrayBuffer`.
    - **Next step.** Turning the setting on and dropping `disableFontFace`
      (fix E) needs a PDF check first.
    - **Fixed separately at `87ac5a3`:** `measureText` reported 0 for
      `fontBoundingBoxAscent` and `fontBoundingBoxDescent`, because Servo
      passed glyph and font bounds in each other's places (2 of 2 WPT
      assertions).
12. **The PDF text layer stays empty.** Open. react-pdf mounts the layer, but no
    text spans appear and the page reports no error, so PDF text cannot be
    selected or found. A plain `ReadableStream`, one with a size strategy, and
    canvas `measureText` all work in Servo, so the cause is not found yet.
13. **Long unbroken words overflowed.** Fixed at `87ac5a3`. This was not in
    the first list. The fork adds emergency wrapping for
    `overflow-wrap: break-word` and `anywhere`, built on ICU's grapheme
    breaks. A note with a long word now wraps it inside the paragraph and
    stays editable. Not qualified: mixed line heights, floats, and inline
    borders split across lines.
14. **Document `autofocus`.** Open. This is the fork's one failing WPT
    assertion, `focus-visible-009`: an element with the `autofocus` attribute
    is not focused on load. Theorem UI is not affected. It uses only React's
    `autoFocus`, which calls `focus()` on mount and never sets the attribute.
15. **Servo's screenshot callback stalled** in the fork's runs after a second
    note opened, so the driver's `capture` step never returned. Open. It
    affects only the driver. It was not reproduced here: the step list here
    leaves out those captures, as the fork's final run does.

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
   clipboard work through the driver; fix B is in. Since `87ac5a3`,
   composition through GPUI's input handler lands in Crepe too. A real input
   method has not been driven (gap 6).
3. **Conformance:** this document. Approving a tool was not exercised.
4. **Dispositions:** this document.
5. **One native capability end to end:** `b093fd2` checked every bridge call
   from a probe in the page and opened the native editor. Rechecked in this
   pass, with the app running: the page's own bridge call answered 200, and
   the same call from a sandboxed iframe (origin `null`) failed its CORS
   check. From outside the web view, `/`, the event stream, the bridge, the
   session route with a wrong or missing secret, and a `Host: localhost`
   request all answered 403. Saving from the native editor and seeing the
   page update was not rechecked: the driver types only into the page.
6. **The in-scene spike:** the page draws inside GPUI's scene with
   `THEOREM_PAGE_RENDERER=scene`. The child view stays the default.
   - **Frames reach GPUI's scene.** `SceneRenderingContext`
     (`desktop/src/scene.rs`) renders into surfman `IOSurface`s and hands
     GPUI the newest as a `CVPixelBuffer`. `gpui::surface()` draws it through
     the BGRA path in `desktop/vendor/gpui-pre-apple`. Tests:
     `render_bgra_surface` for the patch; `scene::tests` for the format
     (`32BGRA`), row order and recycling; and
     `page::tests::the_overlay_draws_above_the_page_in_gpuis_scene`, which
     draws a frame from the context through GPUI's headless Metal renderer
     and checks that the page is upright with the overlay above it.
   - **The overlay in a live window was not seen.** The spike's frame-time
     readout is a GPUI element above the page, but no screenshot of a real
     window exists: this session has no Screen Recording permission, and the
     screen was locked during the runs.
   - **Frame times on Servo's side.** `docs/desktop/frame-times.steps.json`
     animates a box with `requestAnimationFrame` for 6 s and reads the
     host's counts with the driver's `frames` step. Same release build, screen
     locked, window covered:

     | | Child view | In GPUI's scene |
     | --- | --- | --- |
     | Frames from Servo | 536 | 525 |
     | Interval, p50 / p95 / max | 11.11 / 13.47 / 94.96 ms | 11.1 / 14.53 / 69.88 ms |
     | Servo's paint and present, p50 / p95 / max | 6.02 / 10.75 / 94.44 ms | 1.09 / 3.8 / 69.35 ms |

     The pages kept the same pace. Painting and presenting took a fifth as
     long in the scene (mean 1.7 ms against 6.17 ms), where `present` only
     swaps which `IOSurface` is the front buffer.
   - **GPUI's side was not measured.** The time from `present` to GPUI
     drawing that frame (`toSceneMs` in the `frames` step) stayed empty.
     GPUI stops a macOS window's display link while the window is occluded
     (`gpui-pre-macos` 0.3.9, `window.rs`, `start_display_link`), and the
     lock screen covered it; the child view draws through its own view
     regardless. To measure it, unlock the screen, keep the window in front,
     and run the release build:

     ```bash
     THEOREM_PAGE_RENDERER=scene THEOREM_DRIVE=docs/desktop/frame-times.steps.json THEOREM_DRIVE_OUT=/tmp/scene theorem
     ```

   - **Known limits.** GPUI releases each frame's `CVMetalTexture` before the
     GPU has finished with it, as upstream does for screen capture. Three
     frames stay in flight before a surface goes back to Servo, so a GPUI
     redraw long after a burst of frames could show a recycled surface. In
     the scene, popups render into a `SoftwareRenderingContext`, because the
     child view's context they render beside does not exist.
   - **Result:** the page draws correctly in the scene, with GPUI above it,
     and costs Servo less per frame. Moving the main window to it (Phase 1)
     waits on GPUI's side measured in a visible window.

## Test data this pass left on the backend

- An "Untitled note" with placement `p:f6def048`, edited by the Crepe runs.
- Edges `c:5582c4f5` and `c:54f9b105`, created and then deleted.
- Node `p:8b805d95`, moved to x = -4485.01.
- Threads `57e9fef66a8b5ce342f36d35b`, `4ff920c127bed5b1ea827cd21` (with
  revision 2 of `debounced-async.ts`), `6c863eceb09d8340a918598f6` and
  `24143a92e040789ce48bcd585`.
