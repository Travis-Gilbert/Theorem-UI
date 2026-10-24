# Tailwind v4's `[hidden]` preflight beats any `!important` utility

**Kind:** gotcha
**Captured:** 2026-10-23T22:30:00Z
**Session signature:** `5f72c13e-89c8-4352-aa5e-1376143dc7d7`
**Domain tags:** tailwind, css, base-ui, drawer

## Trigger

A Base UI `Drawer.Portal keepMounted` popup gets `hidden` when closed. The
overrides `[&[hidden]]:flex! [&[hidden]]:invisible` were generated and matched
the element, yet its computed `display` stayed `none`. Preflight's
`[hidden]:where(:not([hidden="until-found"])) { display: none !important }` sits
in `@layer base`. For `!important` declarations, cascade layer order reverses,
so base beats utilities whatever the selector specificity.

## Rule

Don't try to keep a `hidden` element laid out with Tailwind utilities. Design for `display: none` (here: the frame loop idles while the host measures zero), or avoid the `hidden` attribute.

## Evidence

- `src/components/terminal/terminal-drawer.tsx` (popup class, no `[hidden]` overrides)
- `terminal/src/lib.rs` (`Screen::frame` zero-size early return)

## Encoded in

- `docs/learnings/2026-10-23-tailwind-preflight-hidden-beats-important-utilities.md` (this file)
