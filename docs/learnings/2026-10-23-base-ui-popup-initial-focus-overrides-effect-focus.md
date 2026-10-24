# Base UI popups take focus after your effect does

**Kind:** gotcha
**Captured:** 2026-10-23T22:30:00Z
**Session signature:** `5f72c13e-89c8-4352-aa5e-1376143dc7d7`
**Domain tags:** base-ui, drawer, focus

## Trigger

The terminal drawer focused its host in a `useEffect` on `open`. After opening,
`document.activeElement` was the popup (`_r_g_`), not `#theorem-terminal`.
Keys went nowhere and the prompt box showed its unfocused border. Base UI's
popup focus management runs after the child effect and moves focus to the
popup.

## Rule

Choose what a Base UI Dialog or Drawer focuses with the popup's `initialFocus` prop (a ref or a function returning the element), not with effect-driven `.focus()`.

## Evidence

- `src/components/terminal/terminal-drawer.tsx` (`Drawer.Popup initialFocus`)

## Encoded in

- `docs/learnings/2026-10-23-base-ui-popup-initial-focus-overrides-effect-focus.md` (this file)
