# Appearance implementation review

Measured on November 13, 2026, from the `Travis-Gilbert/composable-appearance` working tree based on `f830f8198c4bf87fa432b11f33d98c509824b9e8`. The implementation was uncommitted at measurement time. The host was macOS 27.0.1 (26A434), arm64. Playwright-core used bundled Chromium 156.0.8078.4, Firefox 157.0, and WebKit 27.2. The checked fixtures ran on the local Vite server at `http://127.0.0.1:3117`. Device scale 1, default page zoom, reduced motion. The root-size check deliberately set the CSS root to 20px. Browser zoom, browser accessibility text preferences, and a physical keyboard are separate measurements.

## Typography and geometry

Chromium inspected the actual `.ProseMirror p`, `.aui-md-p`, model trigger, and inline code using computed styles after `document.fonts.ready` and two animation frames. `CSS.getPlatformFontsForNode` confirmed `IBMPlexSans-Regular`, `IBMPlexSans-SemiBold`, `IBMPlexSans-Italic`, and `JetBrainsMono-Regular` used by the rich Latin fixture. Actual faces were confirmed in Chromium only.

| CSS root and application scales | Prose | Editor | Model label | Inline code |
|---|---:|---:|---:|---:|
| 20px root, content 1.25, UI 1.5, code 1.75 | 25 / 37.5px | 25 / 37.5px | 26.25 / 37.5px | 28.4375 / 43.75px |

Values are font size and computed line height. Label tracking was 0.2625px. Other measured tracking was normal.

| Fixture / density | Viewport | Prose inline box | Editor inline box | Composer height | Toolbar height |
|---|---:|---:|---:|---:|---:|
| Empty / Comfortable | 1440 × 900 | — | x434 / 572px | 90px | 32px |
| Empty / Compact | 1440 × 900 | — | x434 / 572px | 80px | 32px |
| Empty / Touch | 1440 × 900 | — | x434 / 572px | 102px | 44px |
| Long / Compact | 1440 × 900 | x434 / 572px | x434 / 572px | 80px | 32px |
| Long / Compact | 390 × 900 | x32 / 326px | x32 / 326px | 118px | 70px |
| Long / Compact | 320 × 900 | x32 / 256px | x32 / 256px | 118px | 70px |
| RTL / Compact | 320 × 900 | x32 / 256px | x32 / 256px | 118px | 70px |

Inline box is reported as physical left coordinate / width. RTL logical starts matched as both right edges were 288px. Narrow rows include the active 15px scrollbar gutter on both edges in this Chromium run. The editor measured 16/24px throughout. Independent reading calibration used 2695 graphemes and 19328.71875px total unwrapped advance. Comfortable resolved to 35.75em / 572px, with 32 full lines, median 76 and P90 79. Wide resolved to 44.75em / 716px, with 24 full lines, median 98 and P90 101. The 1440px actual conversation track consumed the comfortable width.

At 1440 × 500 on `/story/design-oracle-long`, a mid-answer scale change from 16px to 25.6px kept paragraph index 2 at the viewport edge. Its offset changed from −84px to −83.75px while `scrollTop` moved from 454px to 648px.

### Font assets

| Package version | Asset | SHA-256 |
|---|---|---|
| `@fontsource-variable/ibm-plex-sans@5.3.0` | `ibm-plex-sans-latin-wght-normal.woff2` | `e2291e842cf5af167122a22881a740c7f2dda7716f1e8cd76680264f4a859470` |
| `@fontsource-variable/ibm-plex-sans@5.3.0` | `ibm-plex-sans-latin-wght-italic.woff2` | `4363757d2695c7633f98472855849f7c30528eba869d7968ee35b58c87cf14c1` |
| `@fontsource-variable/jetbrains-mono@5.3.0` | `jetbrains-mono-latin-wght-normal.woff2` | `18be452724bfdc236c074ca94a249a7f41a86752c7d04ab258ce9ed5651f6a7e` |

Fixed corpus `latin-prose-v1` SHA-256 `dbfeea1c559f50254d2a3f66388fe0c732fa7df09ab74fe0de7921d5860904f7`.

## Custom profiles

On `/settings/appearance`, Chromium entered a version 1 document with just `overrides.font.textFamily`. Helvetica applied and measured 35.5em / 44.5em. IBM Plex Sans Variable applied and measured 35.75em / 44.75em. A nonexistent test family produced a visible error and left the active profile alone. The settings reject this case with an actual canvas fallback-width probe, independent of whether `FontFaceSet.load()` returns a face. A custom palette example applied in the in-chat Appearance dialog. A custom profile references fonts available to the current browser. The profile does not include font binaries.

## Reproduce

With the local app running from the worktree and the Playwright browsers installed, run `PLAYWRIGHT_BROWSERS_PATH=/tmp/theorem-appearance-browsers bun run oracle:rendered -- --url http://127.0.0.1:3117/story/design-oracle-long --browser chromium --viewport 1440x900`. The production component fixtures in the table are under `/story/design-oracle-{empty,long,rtl,content}`. The interactive shell fixture is `/story/shell-compare`. For the root-size check, use CSS `document.documentElement.style.fontSize='20px'`, apply application scales, await settled fonts and frames, then read computed styles. Use the Chromium CDP command above for actual platform faces.

Focused checks were `bun run typecheck` and `bun test src/lib/appearance.test.ts src/components/chat/composer-tools.test.tsx src/components/chat/composer-editor.test.tsx src/components/chat/composer-markdown.test.tsx src/components/chat/composer-editor-run-input.test.tsx src/components/chat/run-input.test.tsx src/components/chat/activity.test.tsx src/components/life/life-backdrop.test.tsx`.

## Portals

All 30 surface checks passed across the three bundled engines. On `/story/shell-compare`, the browser opened the model picker, account menu, attachment tooltip, Appearance dialog, and navigation drawer using their existing controls. The drawer was checked at 390 × 900, the other surfaces at 1440 × 900. The audit used DOM ancestry to verify that the nodes were portaled outside the application shell and computed foreground and opaque background values on each actual surface. The full measurements and per-case verdicts are in [sol-review.json](sol-review.json).

| Surface | Calm light, flat, Comfortable | Calm dark, Compact, UI 150%, glass popovers, paper navigation |
|---|---|---|
| Model picker, account menu, Appearance dialog | `#24292d` on `#ffffff`, 14.68:1, 14/20px | `#c3c6c8` on `#262829`, 8.63:1, 21/30px, `blur(8px)` |
| Attachment tooltip | Same colors and contrast, 12/18px | Same colors, contrast and filter, 18/27px |
| Navigation drawer | `#24292d` on `#f2f3f5`, 13.23:1, 14/20px | `#c3c6c8` on `#1c1d1e`, 9.83:1, 21/30px |

Before correction, the same account menu was transparent in all three engines and the Appearance dialog stayed at 13px after applying 150% UI scale. The correction assigns named portals an opaque semantic background and applies the UI label recipe to the actual dialog.

## Responsive inspector continuity

In Chromium 156.0.8078.4, Firefox 157.0, and WebKit 27.2, the real **Open a panel → Explore** command on `/story/shell-compare` opened Links above Graph. At 1920 × 900 each inspector measured 797 × 447 CSS pixels. Links began at (1120, 3) and Graph at (1120, 450). Resizing to 660 × 900 presented both as overlays. Returning to 1920 × 900 restored the original boxes and the same two DOM nodes in every engine.

The review narrowed the same chat again and used **Open a panel → Links** to close Links while Graph stayed overlaid. In every engine the saved Dockview state included Graph in the preferred grid and omitted Links and Graph's temporary window. Links stayed closed after widening. See [stacked-dock.json](review/stacked-dock.json) for measurements and results.

`bun test src/components/shell/responsive-dock.test.ts` passed all four tests and 31 assertions using the real Dockview engine. The tests also checked that adding a tab to a temporarily overlaid inspector survives saving and reloading its preferred layout. Dockview's public group moves preserve existing panels in the live workspace. Its serialization represents current window locations, so the save adapter projects current tabs and closures onto the preferred grid while temporary overlays are present.

## Syntax, selection, and caret contrast

The initial Chromium audit found Shiki syntax at 2.90:1 in the Stone light transcript. Crepe's One Dark default produced composer syntax as low as 2.05:1 in Calm light and 1.13:1 in Stone light. Transcript fences now use Shiki's token transformer to retain passing bundled colors and adjust failing ones against the actual opaque code background. The composer uses CodeMirror's highlighting extension with semantic ink colors. Both preserve syntax distinctions. Inline code uses the same registered background.

Run `PLAYWRIGHT_BROWSERS_PATH=/tmp/theorem-appearance-browsers node scripts/design-oracles/review-code-contrast.mjs` against the local Vite server. The runner checks the actual rendered token spans, inline text, selection paint, and composer caret on the F04 and F05 stories. It includes both normal and reversed light/dark custom surfaces. On the rebuilt application, `PLAYWRIGHT_BROWSERS_PATH=/tmp/theorem-appearance-browsers bun run e2e:composer --built` passed all ten native Chromium editor checks, including Enter and Control+Enter inside CodeMirror.

Chromium 156.0.8078.4 passed all 12 palette/mode cases. The lowest observed contrasts were 4.536:1 in transcript code, 5.657:1 in the composer, 4.566:1 for selected text, and 5.657:1 for the caret. See [chromium-code-contrast.json](review/chromium-code-contrast.json) for individual tokens, backgrounds, and measurements.

Firefox 157.0 also passed all 12 cases. WebKit initially passed every paint threshold and intermittently reported a ResizeObserver delivery error from the hidden Paper Design shader bake host. The pinned Bun patch to `@paper-design/shaders@0.0.82` moves canvas resizing into a single cancellable animation frame. The app reads back the canvas after that frame. After forcing Vite to reoptimize the dependency, the standard WebKit 27.2 runner passed all 12 cases with zero page errors. A separate WebKit check decoded the actual baked PNG at 1024 × 1024 and measured alpha values from 0 to 138, confirming the shader still produced a nonuniform tile. See [Firefox measurements](review/firefox-code-contrast.json) and [WebKit measurements](review/webkit-code-contrast.json).

## Interactive paint, focus, and spacing

The rendered color-state audit used the actual Send and Stop controls, selected navigation row, highlighted model option, message error, and running label in Calm light and dark across Chromium, Firefox, and WebKit. All 66 applicable readings passed. Six native-disabled Send controls were explicitly exempt. Minimum observed contrast was 5.518:1 for text and 4.604:1 for action icons. Hover and pressed cases retain immediate and settled samples. The Stop SVG previously animated inherited color after the background changed, producing 1.222:1 on the first hover paint. After synchronizing the two paints the first and settled Calm light hover samples were both 5.518:1. The live label previously composited to 2.348:1 on white. It now uses opaque semantic secondary ink while the decorative orb retains its animation. See [color-states.json](review/color-states.json).

Chromium's focus crops show the Copy action increased from 103 to 288 qualifying CSS px² against a 192px² requirement. The 320px Dockview tab increased from 72 to 810 qualifying CSS px² against 643.6875px². Dockview clips its tab scroller by design, so the indicator is drawn within the tab. See [Copy action](review/chromium-copy-focus.json) and [Dockview tab](review/chromium-dock-tab-focus.json).

At 1440px and 320px the active Send, Pin, and More controls measured 32 × 32 CSS px in Comfortable density and 44 × 44 in Touch density. All centers hit the intended enabled control and the page fit its viewport. With 24px prose leading, all three heading sizes used 36px before and 18px after. With a custom 1.75 line-height ratio at content scale 1.25, measured prose leading was 35px and each heading used 52.5px before and 26.25px after. See [touch and rhythm evidence](review/chromium-touch-and-rhythm.json).
