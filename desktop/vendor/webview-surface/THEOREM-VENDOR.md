# Vendored from Theorem

Source: Theorem monorepo, `apps/browser/crates/webview-surface`, last changed in
commit `4543e98b4f6c595e18cf7b3df0e6ec8ceb59c5e4` (2026-10-13).

`src/` is copied unchanged. The only edit is `Cargo.toml`: Theorem's
`workspace = true` dependencies are spelled out (`dpi 0.1`,
`raw-window-handle 0.6`), because this app is its own workspace.

Why vendor rather than depend: the crate is the tested input-transparent child
`NSView` that Theorem's browser hands to Servo's `WindowRenderingContext`. The
Theorem repository is private, large and path-linked, so a git dependency would
pull its whole workspace. Keep this copy in step with Theorem's by hand.
