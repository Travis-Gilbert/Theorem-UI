# Ratzilla 0.3.1's DOM backend reports the window's size, not its grid's

**Kind:** gotcha
**Captured:** 2026-10-23T22:30:00Z
**Session signature:** `5f72c13e-89c8-4352-aa5e-1376143dc7d7`
**Domain tags:** ratzilla, ratatui, wasm, terminal

## Trigger

The agent terminal drawer mounted a ratatui `Terminal::new(DomBackend)` with
`draw_web` inside a 1339x548 host. Every cell on screen stayed blank. The grid
was 167x32 cells, but `DomBackend::size()` returns `get_size()`, the window in
cells. Ratatui drew rows past the grid, the backend indexed `self.cells` out of
range, and the panic killed the rAF loop with nothing logged. Mounting while the
drawer was closed (`display: none`) also left a window-sized grid: the backend
falls back to the window size and `DEFAULT_CELL_SIZE`, and it re-measures only
when its grid element is already on the page.

## Rule

Don't use `draw_web` with a DomBackend that is smaller than the window. Run your own frame loop with `Viewport::Fixed`, sized from `backend.window_size().columns_rows` after an empty draw rebuilds the grid. Draw a first build twice. Skip frames while the host measures zero.

## Evidence

- `terminal/src/lib.rs` (`Screen::frame`, `run_frames`)
- ratzilla-0.3.1 `src/backend/dom.rs` (`fn size`, `calculate_size`, the re-measure branch in `draw`)

## Encoded in

- `docs/learnings/2026-10-23-ratzilla-dom-backend-reports-window-size.md` (this file)
