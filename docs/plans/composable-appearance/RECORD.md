# Composable appearance implementation

## Scope and source

Implement `SPEC.md` (theorem-appearance-v1), supplied by the user on November 13, 2026. The requested result is independently composable appearance, resilient typography, reusable behavioral parts, and independent rendered evidence. Attached prose is supporting specification content, not separate operational authorization.

Baseline: `f830f8198c4bf87fa432b11f33d98c509824b9e8` (local origin/main). The original checkout on feat/motion contains unrelated changes and is untouched. Work occurs on Travis-Gilbert/composable-appearance in an isolated managed checkout.

## Work sequence

1. Capture source/rendered baseline and verification environment.
2. Sol: implement appearance data, typography, materials, layout, settings and reusable components.
3. Luna: implement independent 30-group registry, fixtures and oracle reports.
4. Parent: review the complete diff against intent; run checks and rendered interaction/visual coverage; correct defects.
5. Record measured results, remaining gaps, and retained work. Do not claim absent evidence passes.

## QA inventory

- Calm light/dark: actual editor and transcript recipes, calibrated reading track, neutral opaque surfaces, boundaries and readable preview; numeric styles/geometry plus screenshots.
- Palette, mode, each role material, density, ambience: before/after text and box measurements; draft, focused input, selection and commands remain stable.
- Presets, scales, font profile, reading width and theme import/export: real settings interactions, invalid data rejection, persistence and explicit overrides.
- Navigation, panels and portals: allocation and collapse order; semantic inheritance; keyboard reachability; long labels and small widths.
- Existing and second composition: shared editor/send/cancel behavior, attachment identity, state and reading-anchor continuity.
- Required F01–F11 states: blank, prose, collapsed messages, code/table/artifacts, attachments/popover, running/follow-up/cancel, failure/recovery, navigation, zoom/spacing, RTL/CJK/touch, IME/draft switching.
- Adversarial checks: bright accent text contrast, selected-row/portal contrast, material coupling, text shrink from density, custom font calibration, translated labels, corruption/unknown theme fields.
- Matrix: 320/390/1024/1440/1920 CSS widths, Calm modes and expressive core; Chromium/Firefox/WebKit where available. Record engine or device limitations explicitly.

## Evidence

### Implementation decisions

- Kept assistant-ui, Milkdown/CodeMirror, Base UI, the Theorem SDK/runtime, Dockview and the existing Culori palette generator. Added PostCSS as an explicit development dependency for independent CSS parsing.
- Added versioned appearance configuration with preset defaults and deliberate overrides. Existing mode and Life owners remain authoritative. Legacy palette/material choices migrate; JSON import rejects unsupported values and validates opaque semantic color pairs.
- Applied complete recipes to actual prose, editor text, code, navigation and portal elements. The default Plex reading corpus independently calibrated to 35.75em comfortable and 44.75em wide. Custom installed fonts are validated and measured in the receiving browser.
- Extracted the existing composer behavior once, with slots and two layout compositions. Conversation and review share its editor/actions. Message/navigation slots and the existing artifact registry provide the other composition seams.
- Kept the conversation mounted across narrow layouts. Inspectors release space before navigation, navigation moves into a drawer, and hidden navigation focus moves to its responsive trigger. Dockview's group constraint API and a settled overlay-layout refresh are necessary for correctly sized always-rendered panels.
- Protected reading paint while allowing independent materials. Portals inherit document-level appearance tokens and recipes. Added a non-color unread navigation cue using the existing saved-visit and thread query state.

### Review corrections

The parent review found and corrected stale narrow dock geometry, a minimum-width constraint applied to the wrong Dockview API, inspector clipping, lost responsive focus, transparent account menus, dialog text that ignored UI scaling, custom fonts silently falling back, and code-editor text that ignored the independent code profile. Navigation buttons now fit their actual label recipe and density padding, auxiliary navigation controls have 24px minima, and keyboard focus rings cover shell tabs and headers. Review checkmarks use the registered accent/on-accent pair instead of white on the focus color. The new unread-row refresh was also bounded per changed message timestamp to prevent a server/browser clock difference causing repeated requests.

Multiple-inspector review verified exact Links/Graph restoration and panel identity in all three engines. The save adapter preserves the preferred split tree while projecting live tab changes and closures; temporary floating positions are not persisted. A WebKit resize notification warning during legacy migration was corrected by scheduling navigation allocation updates on the next animation frame.

Final paint review found that syntax-token colors were not established by measuring a code wrapper. Measured low-contrast Shiki and CodeMirror tokens were corrected through their existing extension interfaces. CodeMirror uses native Lezer tags and validated semantic colors; Shiki keeps passing colors and uses Culori interpolation/gamut mapping to adjust failing colors. A small threshold search is needed because Culori measures contrast but does not select the first acceptable interpolation step. Unvalidated initial or stale Shiki paint uses readable plain code until the new highlight resolves. The final token audit covers actual normal, inline and selected text plus caret paint, including reversed custom palette surfaces.

Navigation section groups now use the declared density-dependent group gap. The paper shader bake defers PNG encoding and cleanup to an animation frame after the resize notification. A maintained Bun patch to `@paper-design/shaders@0.0.82` also coalesces its canvas resize writes on an animation frame and cancels pending work on disposal. Frozen dependency installation was verified. Uninstrumented WebKit passed all 12 code-paint combinations with zero runtime errors; the decoded paper texture was 1024×1024 with alpha values from 0 to 138, so the fix did not silently suppress the shader.

Final matrix review also corrected clipped focus indicators on rounded controls, Dockview tabs and the scroll viewport, using measured focused/unfocused pixels rather than nominal CSS outline widths. Assistant metadata and actions now share protected opaque reading planes in Expressive mode. Navigation and popover scroll fades no longer mask readable labels. The loading label uses opaque secondary text (6.379:1 observed) instead of translucent shimmer; the decorative orb remains. Send/Stop paint changes no longer animate through low-contrast intermediate colors; both immediate and settled interaction states are measured.

Heading spacing now derives from the prose line height instead of resolving `lh` against each heading. All three heading sizes measured 36px before and 18px after under 24px prose leading, and 52.5px/26.25px under a custom 35px prose leading. Header and primary controls meet 32px comfortable and 44px touch minima at desktop and 320px widths. Floating inspector placement accounts for both the preceding tab strip and the full header bottom.

Evidence review corrected coverage and reporting too: rendered failures survive normalization, malformed/missing reports block aggregation, and each scheduled engine/state/viewport tuple is verified against the manifest. Spacing hierarchy combines actual named groups across its declared fixtures while preserving each fixture's token contract. Focus area comes from actual screenshot pixels with antialiasing uncertainty retained. Intentional local code scrolling is distinguished from clipped ordinary controls.

### Measured checks

The local host is macOS arm64. Browser versions are Chromium 156.0.8078.4, Firefox 157.0 and WebKit 27.2. Browser reports identify their engine and fixture scope.

| Check | Observed result | Evidence |
|---|---|---|
| Existing composer/runtime suite | 697 passed, zero failed | `bun run test:composer` |
| Native built composer editor | 10 passed, zero failed | `bun run e2e:composer --built` |
| Appearance policy, palette, code-color and evidence-integrity tests | 27 passed, zero failed | `bun run test:appearance` |
| Existing shell plus responsive checks | 20 passed, zero failed at initial responsive review | `bun test` on shell rail/state/arrangements/responsive files |
| Built-in color predicates | 872 passed across eight emitted palette/mode sets, covering 54 semantic edges per set | `evidence/colors.json` |
| Real settings, each browser | 56 passed in each engine, including clickable-control geometry | `evidence/review/{chromium,firefox,webkit}-interactions.json` |
| Selection, focused editor and portable data, including legacy migration | 14 Chromium / 13 Firefox / 13 WebKit checks passed | `evidence/review/*-continuity.json` |
| Actual zoom, enlargement, spacing, RTL/CJK and forced colors | Nine Chromium checks passed | `evidence/review/chromium-reflow.json` |
| Actual portaled surfaces | 30 cases passed across three engines | `evidence/sol-review.json` and `.md` |
| Upload, stream, follow-up, stop and unread behavior | 15 Chromium checks passed through the real SDK/runtime with controlled responses | `evidence/review/runtime.json` |
| Real second composition | Four checks passed in each engine: shared sidecar editor, draft/selection/focus/geometry continuity, exactly one review submission without chat dispatch, no runtime errors | `evidence/review/*-composition.json` |
| Stacked inspector restoration and persisted closure | Exact geometry and same DOM nodes in all three engines; four real Dockview tests and 31 assertions passed | `evidence/review/stacked-dock.json`; `responsive-dock.test.ts` |
| Syntax, inline and selected code paint | 12 palette/mode combinations passed in each engine; weakest measured text pair 4.536:1 | `evidence/review/*-code-contrast.json` |
| Immediate and settled interaction paint | Six browser/mode cases with 12 states each: 66 applicable checks passed and six inactive checks explicitly not applicable | `evidence/review/color-states.json` |
| Touch control geometry and custom heading rhythm | Six Chromium cases passed; no document overflow | `evidence/review/chromium-touch-and-rhythm.json` |
| Native iPhone Safari layout and focus | Editor and 44px action visible in the measured 402px viewport; software keyboard not observed | `evidence/review/ios-safari-observation.json` |
| TypeScript and production frontend build | Passed | `bun run typecheck`; `bun --bun vite build` |

The frontend build used compatible generated terminal WASM bindings copied from an existing local checkout; it did not rebuild Rust. CI retains the terminal generation step. CI now also runs the appearance policy, real controls, continuity, actual page zoom and runtime checks. Its Linux execution has not run in this local session.

Generated DOM evidence is excluded from Tailwind source detection with its documented `@source not` directive and from Vite's file watcher. Otherwise report writes can trigger stylesheet reloads during browser measurements. A write/delete probe confirmed that evidence writes no longer trigger HMR. Final browser runs use the restarted dev server after these exclusions.

Final focused production lint passed with zero errors or warnings. The broader changed-file scan retained five pre-existing findings in the vendored `src/components/coss/combobox.tsx` (three generic parameter names and two assertions). The appearance changes in that file only add semantic instrumentation. Those unrelated findings were left intact.

### Evidence limits

The final matrix contains all 102 planned reports with no missing files, malformed reports or engine/state/viewport mismatches. Across 30 oracle groups, 28 pass, zero fail, zero require target review, and two remain not measurable. Of 30 child predicates, 26 pass, zero fail, zero require review, one remains not measurable and three are explicitly not applicable. See `evidence/design-oracles-final/matrix-summary.json` and `.md`. No aggregate design score is used, and the command intentionally exits nonzero while a required contract lacks evidence.

The two open groups are SPC-07 (software-keyboard viewport reachability) and ARC-04 (native composition evidence is available through Chromium CDP, but unavailable through the Firefox/WebKit automation backends). The native-composition child summarizes its declared Chromium evidence; this does not promote the broader multi-engine group to pass. ENV-02's aggregate uses Chromium actual-glyph inspection as its reference; Firefox/WebKit font declarations, requests and computed styles do not establish actual face use in those engines.

The final replay covers Calm light across all eleven fixtures in all three engines; Calm dark and Expressive core fixtures; narrow widths 320/390; and desktop widths 1024/1440/1920. Separate reports cover text enlargement, actual 400% page zoom, spacing overrides, custom fonts, touch density, live runtime semantics and portal states. All browser reports in the final replay share the same captured source fingerprint. After capture, documentation was finalized and a local `width` binding was renamed to `layoutWidth` to remove three shadowing warnings; no calculation, condition or rendering behavior changed. Focused Dockview tests, typecheck and frontend build were repeated after that rename. Final harness review also made each future matrix invocation clear its own generated planned reports before launching children, preventing stale evidence from satisfying a failed launch. The aggregate owns the combined fixture verdict; nonzero per-fixture coverage exits do not override a passing aggregate. Missing-report rejection has a regression check. These scheduling/reporting changes do not alter the captured browser observations.

The asynchronous streaming check drives the production SDK/runtime with deterministic HTTP and SSE responses. It establishes local UI behavior, not deployed backend acceptance. Chromium's trusted composition events were exercised through CDP. Native iPhone Simulator Safari was also inspected at a 402px CSS viewport; the focused editor and 44px action remained visible. The simulator exposed a legacy hardware input path and only a keyboard accessory bar, not the software keyboard. Its two-pixel viewport change does not prove keyboard-open behavior. The simulator was restored to its initial stopped state and its mirror helper exited. A physical OS input method and software-keyboard obstruction remain unverified. Actual glyph-face inspection is recorded through Chromium CDP; the other engines have separate resource/computed-style evidence and must retain their actual-face verification gap. Browser text enlargement, actual page zoom and touch keyboard behavior are separate obligations.

Next acceptance steps: exercise the F10 fixture with a real software keyboard while changing appearance, verify native OS IME composition in the supported desktop browsers, and inspect actual font faces in Firefox/WebKit with a supported browser inspector. Run the updated CI workflow on Linux before release. These are verification gaps, not scope removed from the implementation.

At the user’s request, the implementation and review evidence are recorded in a local commit. No push, deployment or publication was performed. The managed worktree at `/Users/travisgilbert/.codex/worktrees/composable-appearance/Theorem ui` remains the active workspace for screenshot review and the remaining acceptance checks. Branch: `Travis-Gilbert/composable-appearance`. The original dirty checkout remains untouched.


### Requested screenshot captures

Five fresh Firefox captures show Calm light/dark desktop, the 390px narrow layout, the Appearance dialog, and the Expressive preset. They use the real components in the local demonstration fixture; no live backend conversation was captured. All five captures completed without browser runtime errors. See [the screenshot gallery](evidence/screenshots/README.md). Copies are also saved in the macOS Desktop screenshot folder.
