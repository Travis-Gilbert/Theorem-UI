# Theme and material provenance

Where the palettes, syntax themes and surface materials that are not Theorem's
own come from, and what each surface takes from them.

## Vitesse

Vitesse is Anthony Fu's colour theme (MIT; `antfu/vscode-theme-vitesse`,
Copyright (c) 2021 Anthony Fu, with Primer's 2020 notice). The Theorem UI's
Vitesse palette has two sides:

- **Dark** is franmc01's JetBrains port, the plugin "Vitesse Dark Theme" 0.0.1:
  its `vitesse.dark.theme.json` (UI colours: ground `#222222`, ink
  `#dbd7caee`, accent `#4d9375`) and `vitesse.dark.xml` (editor scheme). It
  follows Fu's Vitesse Dark Soft, the `#222` variant.
- **Light** is Fu's Vitesse Light (`#ffffff` ground, ink `#393a34`), as
  `@shikijs/themes` packages it, because every Theorem palette has a light and
  a dark side.

What each surface takes:

| Surface | Source | Where |
|---|---|---|
| Neutrals and accents | The two themes' hexes, placed on Theorem's own tokens by the palette rules (accents keep the tier invariants, so redwood is exactly `#4d9375` in dark and the other families share its lightness and chroma) | `scripts/palettes.ts` → `src/palettes.css` |
| Glow, shadow tint | The accent green and Vitesse's blue `#6394bf` | `src/styles.css` |
| Code blocks and diffs (Shiki) | Fu's `vitesse-light` / `vitesse-dark` as bundled by Shiki; the token colours are the same as Vitesse Dark Soft's | `src/lib/palette.ts` (`useCodeThemes`) |
| CodeMirror editors | `codemirror-theme-vitesse` 0.3.0 (ntnyq, MIT), with the JetBrains scheme's editor background, gutter, selection `#383838`, caret `#aeafad` and caret row `#292929` | `src/lib/codemirror-theme.ts` |
| Theia IDE | Fu's `vitesse-light.json` and `vitesse-dark-soft.json`, copied unchanged with their license, inside Theorem wrappers that clear the chrome as the Stone themes do | `ide/theia-extensions/theorem-workspace/src/browser/themes/vitesse/` |

Where the jar and Fu's themes differ, the jar wins for the dark UI colours
and the editor chrome, and Fu's themes supply the syntax token colours (the
jar's class colour `#7f8ac7` is the one category that differs from Fu's
`#5da994`). Three of the jar's colours are raised so text keeps 4.5:1: faint
ink (`#dedcd590` becomes `#9a9893` on `#292929`), the text on the accent
(`#222222` becomes `#121212`), and the light side's faint ink (`#6a737d`
becomes `#586069`, Vitesse's own preformatted-text grey).

## Paper

The paper material's grain is Paper Design's PaperTexture shader
(`@paper-design/shaders` 0.0.82, Apache-2.0). It is rendered
once per page into an image that the `surface-paper` utilities use as a mask;
see `src/lib/paper-texture.ts`.

Its NOTICE, which Apache-2.0 asks redistributions to carry:

> Paper Shaders, Copyright 2026 Paper. Powered by Paper Shaders:
> https://shaders.paper.design
