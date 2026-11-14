# Theorem UI Design Oracles Specification

**Version:** 1.0  
**Date:** November 13, 2026  
**Status:** Proposed implementation specification  
**Product:** theorem.rs / Theorem-UI  
**Initial scope:** Conversation, composer, navigation, shell, and appearance settings  
**Evidence baseline:** Theorem-UI revision f830f8198c4bf87fa432b11f33d98c509824b9e8 and the five screenshots supplied in the preceding design discussion  
**Policy identifier:** theorem-appearance-v1

## 1. Purpose and intended result

Create a coherent, customizable interface whose typography, color relationships, and proportions are governed by explicit, measurable rules.

The first visible deliverable is a Calm appearance preset in light and dark modes. It must provide a stable reading surface, readable text, restrained component treatments, and clear alignment. The existing expressive presentation must be composed from the same behavioral components.

The architectural deliverable is a separation between behavior, layout, and appearance. Changing palette, material, density, or ambience must affect only the dimensions that the control promises to change.

The verification deliverable is an oracle registry and a rendered-evidence report. An oracle is a versioned predicate over independently measured evidence. It identifies a relationship that must hold, the circumstances in which it applies, and the evidence needed to judge it.

**Mathematics governs declared relationships. Human review judges qualities those relationships do not determine.**

A valid implementation must make it possible to answer concrete questions:

- Does the actual editor use the same typography as the actual conversation prose?
- Does every required foreground/background pair remain readable in its interaction state?
- Does a flat composer retain its geometry when changed to glass?
- Are reading width, avatar space, panel widths, and composer padding accounted for explicitly?
- Does compact density preserve the user's chosen content size?
- Can a second composition reuse the editor, actions, and state without duplicating submission behavior?

This specification defines design and implementation work within that scope. It does not assert that the proposed checks have already been implemented or that the existing application passes them.

### 1.1 In scope

- Typography recipes, font verification, reading measure, and text resilience.
- Semantic color pairs, perceptual surface relationships, contrast, and material effects.
- Spacing vocabulary, control geometry, alignment, responsive width allocation, and composer proportions.
- Flat, paper, frosted, and liquid surface resolution by semantic role.
- Calm light, Calm dark, and compatibility with the existing expressive appearance.
- Reusable composer parts, navigation slots, portal inheritance, and state continuity.
- Focused verification of real components and representative interaction states.

### 1.2 Scope boundaries

Retain the existing palette generator, assistant-ui integration, Base UI foundation, editor, and agent runtime unless a specific verified defect requires a change. This work does not commission a new agent harness, a replacement UI framework, an arbitrary plugin marketplace, or a renderer shared across web, iOS, and GPUI.

Theme data and semantic roles should be portable. Each renderer still needs its own measurements and accessibility implementation.

Do not derive implementation constants from screenshot image pixels. The supplied screenshots have different apparent UI scales and do not establish equivalent CSS viewports.

## 2. Evidence and existing foundations

The baseline inspection supports the following starting points. Recheck these paths against the implementation checkout before editing; preserve intervening work.

| Baseline observation | Design consequence | Evidence |
|---|---|---|
| Generated palettes already use OKHSL neutrals, OKLCH accent tiers, semantic roles, and gamut checks. | Extend the existing generator and validate its rendered use. | [E1] |
| IBM Plex Sans Variable and its italic face are loaded; synthesis is disabled and kerning is enabled. | Establish actual typography use rather than assuming a missing font import. | [E2] |
| A 15px base token is declared, but inspected body/transcript styles inherit size; the composer editor uses 1rem. | Measure computed styles and apply complete recipes explicitly. | [E2], [E3] |
| The shared reading token is 1080px; the assistant avatar and padding reduce actual prose width. | Separate prose measure from conversation framing and expanded content. | [E2], [E3] |
| Composer materials are paper, glass, and liquid. | Add a true flat treatment. | [E4] |
| Sidebar GlassPanel reads the composer surface setting. | Resolve navigation and composer materials independently. | [E5] |
| User messages directly receive surface-paper. | Move surface choice into appearance resolution. | [E3] |
| Collapsed user previews mask their final three rem. | Keep the visible preview readable; expose the remainder through expansion. | [E6] |
| GitHub Sharp light already includes white raised/composer surfaces. | Use the existing neutral foundation when assembling Calm. | [E7] |
| Life has an existing persisted visibility setting and is on by default. | Calm should select the off state through normal appearance controls. | [E8], [E9] |

These are source observations at the pinned revision. They are not a measurement of deployed computed styles.

## 3. Oracle semantics

### 3.1 Four classes

| Class | Meaning | Gate behavior |
|---|---|---|
| **Standard** | A requirement derived from a cited standard, with its scope and exceptions. | An applicable failure blocks the relevant conformance claim and completion gate. |
| **Contract** | A deliberate Theorem invariant, such as equal prose/editor recipes or preserved draft state. | An applicable failure blocks completion of the affected slice. |
| **Target** | A versioned design-policy range requiring visual calibration. | A deviation requires correction or a recorded, scoped design decision. |
| **Diagnostic** | A measurement useful for interpretation, without a universal desirable value. | Report the evidence; do not turn it into an unexplained beauty score. |

The initial spacing vocabulary, reading-measure bands, neutral chroma limits, and surface deltas are Theorem policy. They are not universal laws of visual quality.

There is no aggregate score that allows excellent spacing to compensate for unreadable text, a missing action, or lost editor state.

### 3.2 Required oracle record

Every oracle implementation must expose the following information, either directly or through a referenced shared contract.

| Field | Required content |
|---|---|
| id / version | Stable identifier and semantic version of the predicate. |
| class / severity | Standard, Contract, Target, or Diagnostic; blocker, review, or informational. |
| purpose | The user-visible property being protected. |
| scope | Semantic roles, component parts, and interaction states. |
| applicability | Explicit conditions, including locale, viewport capacity, user overrides, and material. |
| fixture | Versioned content and component-state identifier. |
| environment | Browser/version, OS when relevant, CSS viewport, device scale, zoom, locale, and font assets. |
| extraction | How observations are collected from the rendered result. |
| expected | Equation, inequality, equivalence, ordering, or allowed set. |
| tolerance | Numerical tolerance, separate from an intentional design deviation. |
| provenance | Standard/criterion/level or Theorem policy version. |
| observed | Actual values with units, role pairs, and relevant element identifiers. |
| result | pass, fail, review, not-measurable, or not-applicable. |
| evidence | Structured measurements and, where useful, a screenshot or manual verification record. |
| exception | Exact scope, reason, owner, and expiry or revisit condition. |

A missing required measurement is **not-measurable**, never pass. A missing required role pair is a coverage failure. Not-applicable requires a recorded applicability reason.

### 3.3 Default tolerances

Unless an oracle specifies otherwise:

- Font size and line height: 0.1 CSS px absolute.
- Letter spacing: 0.05 CSS px absolute.
- Authored spacing values: 0.25 CSS px absolute.
- Alignment and layout-budget comparisons: 1 CSS px absolute.
- Pure appearance-change geometry: 0.5 CSS px per tracked edge in the same environment.
- Numerical color conversion: record algorithm precision; at most 10^-6 for channel-range checks.
- Accessibility contrast thresholds: **no tolerance below the threshold**.

A value of 4.499 does not satisfy a 4.5 contrast threshold. Round only the displayed result. Generate with a small safety margin when necessary.

### 3.4 Precedence and exceptions

Accessibility resilience and user preferences take precedence over default aesthetic targets. A larger font, translated label, or spacing override may legitimately increase component height or change wrapping. An intentional user typography override also replaces the affected exact-recipe predicate: verify that the override takes effect and content remains usable, while retaining checks for properties it does not override. Do not classify valid user styling as a failed default-recipe Contract.

Standard requirements retain their documented exceptions; a project waiver cannot convert a standards failure into conformance. A Contract exception must be explicit and scoped. Target calibration changes must update the policy revision and retain the before/after evidence.

Do not silently update a snapshot, loosen a threshold, hide content, or remove a failing fixture to make the report pass.

## 4. Measurement environment and evidence

### ENV-01 — Reproducible, settled measurements

**Class:** Contract. **Scope:** All geometry and typography oracles.

Record the source revision and fixture version. Record browser/version, viewport in CSS pixels, devicePixelRatio, user-agent zoom where available, application UI/content/code scales, density, palette, material assignments, locale, direction, and motion preference.

Await document.fonts.ready and the relevant fixture's completion. After nonessential motion is frozen for deterministic geometry measurement, collect two successive animation-frame samples. Tracked edges must differ by no more than 0.25 CSS px. Retry at most three sample pairs; persistent instability returns not-measurable.

A static fixture does not replace a separate check of enabled animation, real streaming, or keyboard interaction.

### ENV-02 — Font evidence

**Class:** Contract with explicit verification limits.

Pin the primary font package/version and asset hashes. Verify expected resources loaded, expected FontFace entries and weight/style coverage are available, and the expected primary font is used for a representative Latin fixture through browser font inspection or an equivalent supported mechanism.

A computed font-family stack identifies the requested stack. It does not prove which face supplied every glyph. document.fonts.check() can return true for a nonexistent font and must not be the sole proof. [R10]

Record resource verification separately from actual-face verification. If actual-face evidence is unavailable, report that verification gap. Allowed script-specific fallbacks must be named; CJK fallback is not automatically a Latin-font regression. Awaiting font readiness is a prerequisite, not proof of every rendered glyph. [R11]

### ENV-03 — Independent evidence

**Class:** Contract.

Keep three questions separate:

1. Did the generator produce the committed token output?
2. Did real components consume the intended roles?
3. Did the rendered result satisfy the required relationship?

Existing generator-consistency tests answer the first question. They cannot substitute for the second or third.

Expected predicates come from this versioned specification and approved policy data. Observations come from actual computed styles, rendered geometry, interaction outcomes, and resolved paints. Do not reuse the production generator as the only implementation of its own expected result.

### 4.1 Semantic instrumentation

Provide stable semantic anchors for at least:

- Conversation content track and first-level prose blocks.
- Editor text track, editor viewport, composer border box, and action row.
- Avatar gutter.
- Navigation surface, row, section label, and selected state.
- User-message surface and readable preview.
- Popover/tooltip/drawer surfaces, including portals.
- Required foreground/background pairs and control hit regions.

Prefer semantic test hooks to selectors coupled to generated class names. Track logical inline-start and block axes so the same contracts can apply in RTL.

## 5. Typography model and oracles

### 5.1 Complete recipes

A text role is a tuple:

$$
T_i=(F_i,s_i,w_i,h_i,\ell_i)
$$

F is the font family/face policy, s the font size, w the weight, h the line height, and ell the letter spacing. Text color is resolved through its semantic foreground role.

Each recipe must declare all five values. Ordinary prose and controls must not depend on an accidental inheritance chain for their intended size.

The initial Plex profile below is an authored starting policy. Carbon provides a useful example of defining Plex typography as complete role-specific styles. [R12]

| Role | Font | Size at default scale | Line height | Weight | Tracking |
|---|---|---:|---:|---:|---:|
| prose | IBM Plex Sans | 16px | 24px | 400 | normal |
| composer.content | IBM Plex Sans | 16px | 24px | 400 | normal |
| ui.label | IBM Plex Sans | 14px | 20px | 400 | 0.01em |
| ui.section | IBM Plex Sans | 14px | 20px | 500 | 0.01em |
| metadata | IBM Plex Sans | 12px | 18px | 400 | 0.01em |
| code | JetBrains Mono | 13px | 20px | 400 | normal |
| heading.small | IBM Plex Sans | 18px | 24px | 600 | normal |
| heading.medium | IBM Plex Sans | 20px | 28px | 600 | normal |
| heading.large | IBM Plex Sans | 24px | 32px | 600 | normal |

The size steps form a small rational scale relative to 16px: 0.75, 0.8125, 0.875, 1, 1.125, 1.25, and 1.5. No universal modular ratio or golden ratio is required.

### TYP-01 — Actual recipe application

**Class:** Contract. **Scope:** Real rendered examples of every recipe. **Applicability:** Authored/default styling and properties not deliberately replaced by the user-override fixture; compare resolved recipes in the actual root/scale environment.

Compare computed size, weight, line height, and tracking with the resolved recipe. Apply the tolerances in section 3.3. Verify the declared face policy through ENV-02.

A token existing in CSS is insufficient. Inspect an actual transcript paragraph, the actual editor, navigation labels, metadata, headings, and code.

Use unitless or otherwise scalable line-height relationships in production. At default settings, prose h/s = 1.5; UI labels h/s = 20/14; metadata h/s = 1.5. Custom-font profiles may revise these ratios when needed to avoid clipping.

### TYP-02 — Prose/editor equivalence

**Class:** Contract. **Applicability:** Standard conversation composition, same content scale, and corresponding properties not intentionally given different user overrides. If a defined override targets only one surface, mark that affected equivalence check not-applicable and verify override resilience instead.

$$
|s_p-s_e|\le0.1,\qquad |h_p-h_e|\le0.1,\qquad w_p=w_e
$$

The primary family and tracking must also match within their applicable checks. Compare corresponding prose and editor paragraphs, not toolbar text.

The placeholder may use a different readable color. Its font family, size, weight, and tracking must follow composer.content.

### TYP-03 — Independent scaling and density

**Class:** Contract.

Let alpha_c, alpha_u, and alpha_k be explicit content, UI, and code scale preferences. Let r be the resolved root font size in CSS pixels, respecting the browser's configured font preference; r is 16 in the table's default reference environment. Do not include page zoom as another multiplier:

$$
s_p=r\alpha_c,\qquad s_e=r\alpha_c,\qquad
s_u=0.875r\alpha_u,\qquad s_k=0.8125r\alpha_k
$$

Scale each role's reference size and line height by r/16 and its corresponding application preference. Metadata uses alpha_u; conversation headings use alpha_c. The default value of every alpha is 1. Express these relationships in rem or an equivalent resolved recipe; do not hardcode a root size that defeats browser font preferences.

Changing density alone must preserve the complete prose/editor recipes and the user's scale preferences:

$$
T_p(d_1)=T_p(d_2),\qquad T_e(d_1)=T_e(d_2)
$$

Application code must not compensate for browser zoom by shrinking CSS text. Browser zoom and browser text preferences remain separate from application scales.

### TYP-04 — Reading measure calibration

**Class:** Target. **Applicability:** Fixed plain-Latin fixture at default tracking, when the available track can accommodate the preferred measure.

Measure the number n_j of grapheme clusters on each full rendered line. Exclude final paragraph lines, explicit line breaks, headings, code, tables, list markers, and unbroken URLs.

Report the median M and the 90th percentile P90. Initial review bands:

| Reading preference | Median full-line count | P90 review threshold |
|---|---:|---:|
| Comfortable | 65–90 | Above 105 |
| Wide | 85–110 | Above 125 |

These are calibration bands for the named fixture, not universal reading laws or claims of WCAG AAA compliance.

Use at least 20 eligible full lines. Count spaces once when assigned to a line. Use grapheme segmentation and rendered Range rectangles; group fragments by block-axis line position, and avoid double-counting overlapping glyph fragments. Range rectangles provide rendered fragment geometry. [R13]

CSS ch is based on the zero glyph's advance; it does not promise that a proportional-font line contains that number of characters. [R14]

For initial calibration, estimate:

$$
W_{\mathrm{candidate}}=N_{\mathrm{target}}\bar a
$$

Measure mean advance from unwrapped copies of the fixture paragraphs under the same font recipe, shaping, and whitespace-collapse rules:

$$
\bar a=\frac{\sum_i W_{\mathrm{unwrapped},i}}{\sum_i N_{\mathrm{rendered},i}}
$$

W is each unwrapped text run's advance, excluding container padding/borders. N counts its rendered grapheme clusters and spaces after the fixture's whitespace normalization; exclude paragraph separators. Do not divide an already-wrapped column width by its entire paragraph's character count.

Use the fixed corpus in section 10.1a. Start with target counts of 80 for Comfortable and 100 for Wide. At the reference root size of 16px and content scale 1, round the candidate width to the nearest 4 CSS px, with ties rounded upward. Divide that width by the resolved prose font size and store the resulting preferred measure in em, with the font asset hashes and corpus hash. Use that deterministic result for the first implementation; report any target-band deviation without inventing a replacement corpus or silently widening the band. The wrapped-line statistics remain the calibration evidence.

This replaces any assumption that a fixed 44–48rem width automatically produces a specified character count. Do not make both independent hard requirements.

On constrained viewports, enforce fit and reflow; do not fail the lower line-count band. CJK, Arabic, mixed bidi, and other scripts receive appropriate fixtures and separately calibrated targets.

### TYP-05 — Readable previews

**Class:** Contract. **Scope:** Visible user-message previews and other collapsed reading content.

Text included in the visible preview must satisfy its required contrast after author opacity, masks, and effects. Calm uses opaque foreground text and no multi-line fade.

Truncate at a coherent boundary and provide an accessible expansion control for omitted content. Expansion must reveal the complete content without replacing the underlying message.

A final-three-rem mask is incompatible with the Calm reading contract. A decorative preview effect in another preset must independently satisfy the resolved contrast requirement for content intended to be read.

### TYP-06 — Vertical rhythm

**Class:** Target at default styling; resilience takes precedence under user overrides.

Use one explicit paragraph-gap recipe. Initial conversation policy:

$$
g_{\mathrm{paragraph}}=0.75h_p,\qquad
g_{\mathrm{section}}=1.5h_p
$$

With 24px prose line height these are 18px and 36px. These are typography-derived gaps, deliberately separate from the control-spacing vocabulary.

Measure the effective gap between paragraph block boxes after margin collapse. Avoid adding a wrapper gap on top of two paragraph margins unintentionally.

Headings should remain associated with the following paragraph: in the standard flow, the gap after a heading is no greater than its gap before. Compare only headings with actual neighboring content.

### TYP-07 — User text and spacing resilience

**Class:** Standard, with the cited criteria's applicability.

Support text enlargement up to 200% without loss of meaningful content or functionality. [R5]

Separately apply these user spacing overrides simultaneously: line height at least 1.5 times font size, paragraph spacing at least 2 times font size, letter spacing at least 0.12em, and word spacing at least 0.16em. Preserve content and functionality where the relevant properties apply to the script. These are resilience-test settings, not mandated default typography. [R6]

Default-density height and line-count targets become inapplicable during these overrides. TYP-01/TYP-02 default expectations are also inapplicable for deliberately overridden properties; test the requested override and preserve checks for unaffected properties. Legibility, reachability, and state continuity remain required.

## 6. Color model and oracles

### 6.1 Separate authoring coordinates from accessibility measurements

Continue authoring neutrals and accents with the existing generator. Use OKLCH/Oklab to express perceptual relationships. Use WCAG relative luminance for the contrast predicate.

Throughout this specification:

- L_OK means Oklab/OKLCH perceived lightness, normalized to 0–1.
- C_OK means OKLCH chroma in its native numerical scale.
- Y means relative luminance for the WCAG contrast calculation.
- CR means contrast ratio.

**L_OK is not Y.** Preserving OKLCH lightness while changing hue does not guarantee an unchanged WCAG contrast ratio.

### 6.2 Contrast definition

For a resolved opaque sRGB color, normalize each encoded 8-bit channel by 255. For each normalized channel c:

$$
c_{\mathrm{lin}}=
\begin{cases}
c/12.92,&c\le0.04045\\
((c+0.055)/1.055)^{2.4},&c>0.04045
\end{cases}
$$

$$
Y=0.2126R_{\mathrm{lin}}+0.7152G_{\mathrm{lin}}+0.0722B_{\mathrm{lin}}
$$

$$
CR(a,b)=\frac{\max(Y_a,Y_b)+0.05}{\min(Y_a,Y_b)+0.05}
$$

This definition follows WCAG 2.2. Evaluate emitted, quantized, composited colors rather than an ideal pre-gamut-mapping color. [R1]

### COL-01 — Required text-pair contrast

**Class:** Standard for ordinary-text minimum; stronger product Contract where specified.

Maintain a manifest E of required foreground/background/state edges:

$$
\forall e\in E,\quad CR(F_e,B_e)\ge\tau_e
$$

The normal-text minimum is 4.5:1. WCAG permits 3:1 for qualifying large text: at least 24 CSS px, or approximately 18.67 CSS px when bold, subject to the definition's font considerations. Do not automatically treat an 18px semibold label as large text. [R2]

**Theorem v1 Contract:** require 4.5:1 for all readable application text, including headings, useful metadata, placeholders, and control labels. This avoids most size-exception ambiguity. Explicit inactive-control and decorative exceptions remain identified separately.

**Theorem Target:** primary conversation prose should reach at least 7:1 on its reading plane. The required minimum remains 4.5:1. Never claim that this prose target alone establishes whole-product AAA conformance.

The edge manifest must cover:

- Primary, secondary, link, placeholder, and code text on their actual supported surfaces.
- User message, composer, navigation, selected navigation row, popover, and artifact controls.
- Foreground on primary and destructive action fills.
- Default, hover, pressed, selected, focused, error, and loading states where paint changes.
- Portaled menus and tooltips.
- Readable collapsed previews after any effects.

Test registered valid combinations. Components must not select an unregistered foreground/background relationship silently.

### COL-02 — Essential non-text identification

**Class:** Standard.

Required visual features that identify controls, states, or meaningful graphics must meet 3:1 against the relevant adjacent color, with the criterion's exceptions. [R3]

Keep separate roles for decorative separators and identifying control boundaries. A low-contrast divider is not automatically a failure. Conversely, an input that relies on its border for identification cannot classify that border as decorative.

Do not require default and hover fills to have a 3:1 ratio against one another. Measure the identifying information against the relevant adjacent paint in each state.

### COL-03 — Correct paint resolution and bounded backgrounds

**Class:** Contract supporting COL-01/COL-02.

Resolve palette conversion, gamut mapping, quantization, gradient interpolation, textures, opacity, masks, and ancestor compositing in their actual rendering order.

For simple source-over compositing:

$$
\alpha_o=\alpha_s+\alpha_b(1-\alpha_s)
$$

$$
C_o=\frac{\alpha_sC_s+\alpha_b(1-\alpha_s)C_b}{\alpha_o}
$$

The unpremultiplication equation applies when alpha_o is greater than zero. If alpha_o is zero, preserve a fully transparent result with a canonical RGB value if needed; defer contrast evaluation until the full paint stack resolves against an opaque backdrop. Do not produce NaN or treat transparency as a contrast pair.

For an opaque backdrop, this becomes C_o = alpha_s C_s + (1-alpha_s) C_b. Use the operation's actual compositing coordinates; do not assume that every CSS operation blends in linear RGB. Color interpolation, color-mix, and group opacity are distinct operations. [R7]

Convert the final resolved opaque colors to the contrast measurement space. Author-applied text masks and opacity count; they are not equivalent to user-agent glyph antialiasing.

The deterministic v1 color gate covers the application's emitted sRGB colors. A different wide-gamut rendering path requires separately declared conversion and verification; passing the fallback alone does not verify that path.

For complex material effects, use one of these proof routes:

1. An opaque reading plane with known paired foreground/background colors.
2. A proven envelope for every permitted final background behind the text.
3. A documented, bounded renderer/material model with independent verification.

Finite animation screenshots are regression evidence, not a proof for unrestricted backdrops.

#### Analytical glass/background oracle

For opaque foreground luminance Y_f and a proven final-background interval [Y_min,Y_max], with 0 <= Y_min <= Y_max <= 1 and Y_f in [0,1], a conservative lower bound on the minimum contrast is:

$$
CR_{\min}=
\begin{cases}
(Y_{\min}+0.05)/(Y_f+0.05),&Y_f<Y_{\min}\\
(Y_f+0.05)/(Y_{\max}+0.05),&Y_f>Y_{\max}\\
1,&Y_{\min}\le Y_f\le Y_{\max}
\end{cases}
$$

This follows from the contrast equation and monotonicity on each side of Y_f. The interval must account for the entire material output, including highlights, filters, refraction, and textures.

A bound meeting the threshold proves the predicate for that envelope. A bound below the threshold may mean the envelope is too conservative: it does not demonstrate a Standards failure unless a realizable failing background is established. Record an insufficient proof as not-measurable/proof incomplete for the contrast claim, or as a failed Theorem proof Contract. Do not invent a failing background merely because its luminance lies inside an overapproximating interval.

If the foreground is translucent, derive its dependence on the background before applying a bound. If no reliable envelope exists, return not-measurable and use a protective reading plane for the shipped preset.

### COL-04 — Valid generated and resolved colors

**Class:** Contract.

All emitted channel and alpha values must be finite, with 0 <= alpha <= 1. Any permitted input clamping occurs before output validation and contrast evaluation. sRGB output must lie in gamut within the conversion tolerance. Record the color-library version and the gamut-mapping policy.

Perform contrast checks after mapping and output quantization. Do not repair a color by clipping arbitrary channels without re-evaluating the resulting role pairs.

User-supplied colors produce a candidate palette. Resolve and validate that candidate before assigning it validated status. Explain any adjusted role colors. An advanced experimental candidate may remain visibly unvalidated; it must not appear as a passing built-in preset.

### COL-05 — Calm surface hierarchy

**Class:** Target, except the explicitly required flat/opaque material choices.

Represent desired surface relationships as signed edges:

$$
d_e=\sigma_e\left(L_{\mathrm{OK}}(b)-L_{\mathrm{OK}}(a)\right)
$$

Each edge names its roles, mode, sign, and allowed interval. This is a partial order: surfaces may share a fill when their role is distinguished through geometry or an appropriate boundary.

Initial Calm calibration targets:

| Relationship | Light | Dark |
|---|---|---|
| Canvas | Opaque white | Neutral dark canvas, initial L_OK range 0.18–0.24 |
| Large neutral surfaces | C_OK at most 0.02 | C_OK at most 0.02 |
| Navigation relative to canvas | Canvas may be 0–0.04 lighter | Navigation may be 0–0.04 lighter |
| Raised/composer surface relative to canvas | Same white is permitted | Raised surface 0.015–0.06 lighter |
| User message relative to canvas | Absolute lightness difference at most 0.06; C_OK at most 0.03 | Same difference/chroma targets |
| Hover/selection treatment | Role-specific; validate in context | Role-specific; validate in context |

These bounds are initial Theorem calibration policy. They do not certify harmony or replace text/control contrast.

Treat background steps, accent ink, solid accent, and soft accent as separate roles. Radix's role-separated scales are a useful reference for this distinction. [R15]

### COL-06 — Perceptual distance and visual weight

**Class:** Diagnostic.

When a color-distance diagnostic is useful, calculate Euclidean distance in Cartesian Oklab:

$$
\Delta E_{\mathrm{OK}}(a,b)=
\sqrt{(L_a-L_b)^2+(a_a-a_b)^2+(b_a-b_b)^2}
$$

Use normalized Oklab values. Do not apply Euclidean distance directly to cylindrical hue angles. Pin this metric by name and version; newer alternatives must not silently change existing thresholds. [R8]

For a large message surface, report its visible area fraction, lightness difference from its surroundings, chroma, and Delta E. This makes the bright-orange-bubble concern reviewable without pretending to predict human attention exactly.

An optional area-weighted proxy is area fraction multiplied by Delta E. It is informational only. Exclude user media and arbitrary artifact content from chrome-level comparisons, and do not approximate overlapping paint by blindly summing element rectangles.

No accent percentage, 60–30–10 rule, or single salience score is a release oracle. Never reduce essential text or focus contrast to improve a calmness diagnostic.

### COL-07 — Focus and semantic meaning

**Class:** Standard plus an explicitly stronger Theorem Contract.

Keyboard focus must remain visible, and focused components must not be entirely hidden by author-created content under the applicable criteria. [R16], [R17]

**Theorem focus Contract:** adopt the stronger area/change-of-contrast rule described by WCAG 2.4.13: qualifying focus pixels have at least 3:1 contrast between focused and unfocused states, with qualifying area at least a 2 CSS px perimeter. This source criterion is AAA, not AA. [R9]

For a rectangular component w by h, the centered 2px reference perimeter area is 4w+4h. Use an outer outline as the simple implementation; an inset ring needs its own area calculation. Also check relevant adjacent contrast. Decorative glow does not substitute for the qualifying indicator.

Errors, running state, selection, and other meaningful statuses must retain an understandable text, shape, or icon distinction when hue changes. Color-only meaning is insufficient. [R18]

### 6.3 Numerical reference examples

The following are computed examples of the specified contrast function, not final theme assignments:

| Foreground | Background | Contrast, rounded for display | Ordinary-text result |
|---|---|---:|---|
| #24292D | #FFFFFF | 14.68:1 | Pass |
| #586069 | #FFFFFF | 6.38:1 | Pass |
| #FFFFFF | #FF8A4C | 2.34:1 | Fail |
| #24292D | #FF8A4C | 6.29:1 | Pass |

The orange example demonstrates why an accent's foreground must be selected by its role pair rather than by an assumption that every accent takes white text.

## 7. Spacing, proportion, and layout oracles

### 7.1 Authored spacing vocabulary

Use a finite control/layout spacing vocabulary at default root sizing:

$$
S=\{0,2,4,6,8,12,16,24,32,48\}\ \mathrm{CSS\ px}
$$

Use equivalent scalable tokens where appropriate. The 2px and 6px entries are deliberate small-spacing choices. Borders, font-relative paragraph gaps, safe-area insets, percentages, and content-driven dimensions are separate categories.

A universal four-pixel alignment rule is not required. The constraint applies to authored role-based spacing, not every resulting coordinate.

Initial density profiles:

| Property | Compact desktop | Comfortable desktop | Touch-oriented |
|---|---:|---:|---:|
| Within-control gap | 4px | 4px | 8px |
| Related-control gap | 6px | 8px | 12px |
| Group gap | 12px | 16px | 24px |
| Composer padding | 8px | 12px | 12px |
| Composer editor/toolbar gap | 6px | 8px | 8px |
| Navigation-row minimum | 28px | 32px | 44px |
| Ordinary standalone control minimum | 32px | 32px | 44px |
| Normal icon glyph | 16px | 16px | 18px |

The icon is not the hit target. Content growth may exceed these minima.

### SPC-01 — Spacing token application and hierarchy

**Class:** Contract for token consumption; Target for the initial values.

Measured authored padding/gap properties must match the selected role token within 0.25 CSS px.

For a group that declares all three relationships:

$$
g_{\mathrm{within}}<g_{\mathrm{related}}<g_{\mathrm{group}}
$$

Measure layout properties and effective gaps between the named boxes. Do not require flex-distributed free space or content-driven heights to equal a spacing token.

An optical correction requires a named, bounded role exception. A correction to one icon's optical alignment must not become a global arbitrary margin.

### SPC-02 — Content containment and target geometry

**Class:** Contract for content fit; Standard for applicable target-size minimum.

For a control with content height H_c, padding P_t/P_b, and borders B_t/B_b:

$$
H_{\mathrm{control}}\ge H_c+P_t+P_b+B_t+B_b
$$

The chosen minimum can add free space. Example: a 20px line, 4px top/bottom padding, and 1px borders requires 30px; a 32px control remains valid and can center the spare space.

Allow labels to wrap or disclose appropriately when translated or enlarged. Do not use fixed heights that clip meaningful text.

WCAG 2.5.8 specifies 24 by 24 CSS px targets or qualifying exceptions such as sufficient spacing. Theorem's 32px desktop and 44px touch defaults are product choices, not a claim that AA universally requires 44px. [R4]

Measure the actual clickable region, clipping, and overlap. A glyph box or a nominal rectangle surrounding a partially clipped target does not prove an adequate hit region.

### SPC-03 — Reading/editor track alignment

**Class:** Contract. **Applicability:** Standard conversation composition, after layout settles.

Instrument the prose track and editor text track. Compare logical inline-start:

$$
|x_{\mathrm{start,prose}}-x_{\mathrm{start,editor}}|\le1\ \mathrm{CSS\ px}
$$

Where the composition declares a shared text measure:

$$
|W_{\mathrm{prose}}-W_{\mathrm{editor}}|\le1\ \mathrm{CSS\ px}
$$

Compare track boxes. Do not compare first-letter ink, list indentation, or the composer's outer border.

The avatar gutter is explicitly outside or budgeted alongside the reading track. On narrow layouts, the avatar may move above the text. That responsive rule must preserve the intended track relation.

Wide tables and artifacts have separate named tracks.

### SPC-04 — Width conservation and responsive allocation

**Class:** Contract.

Define V as the layout container's usable content-box inline size, excluding its outer border, padding, and reserved scrollbar space. For horizontal writing, derive this from clientWidth minus left/right padding, or an equivalent verified measurement. Let R, N, and I be measured border-box widths of the visible non-overlay rail, navigation, and inspector. Let G include only remaining inter-region gaps or margins not already included in those boxes.

$$
W_{\mathrm{main}}=V-R-N-I-G
$$

Agreement with measured main width must be within 1 CSS px.

For the reading area, let P_total include all named padding, composer expansion allowance, and avatar allocation required by the chosen composition, counted exactly once:

$$
W_{\mathrm{available}}=\max(0,W_{\mathrm{main}}-P_{\mathrm{total}})
$$

$$
W_{\mathrm{prose}}=\min(W_{\mathrm{preferred}},W_{\mathrm{available}})
$$

Record every term in the evidence report. Derive availability from actual layout boxes; do not subtract a border twice or treat an overlay as an occupied column.

The standard text track is centered within its allocated main region. Its centering residual must be at most 1 CSS px after any declared asymmetric gutter is accounted for.

Define three independent measures:

- prose: ordinary reading and the standard editor text track.
- conversation: message framing, avatar gutter, and composer outer bounds.
- expanded: code, tables, and artifacts.

The initial responsive trigger is W_main < 35rem, resolved using the root size; this is 560 CSS px at the reference 16px root. Disclose optional panels as overlays in this order: inspector first, navigation second, then move rail actions into compact navigation. Recompute W_main after each change and stop when it meets the threshold or no optional non-overlay region remains. A viewport narrower than the threshold then uses the ordinary narrow/reflow composition; the threshold is not a minimum page width. Preserve access to all commands and restore the user's preferred docked regions when they fit again. Alternative pinning priorities must be explicit configuration with separate fixture expectations.

Never maintain panel widths by silently shrinking the content font.

### SPC-05 — Composer height derives from its parts

**Class:** Contract for content fit and action reachability; Target for resting density.

For an empty, one-line editor with no attachments, errors, or extra status rows:

$$
H_{\mathrm{rest}}=B_t+B_b+P_t+P_b+H_e+G_{et}+H_t
$$

H_e is the editor line box, H_t the toolbar row height, and G_et the gap between them. Include additional actual editor insets explicitly; do not hide them in an unexplained constant.

At the initial comfortable desktop values, a 24px editor, 32px toolbar, 8px gap, 12px top/bottom padding, and 1px borders yields 90px. Compact yields 80px with 8px padding and a 6px gap. Touch yields 102px with a 44px toolbar.

These are derived resting examples, not maximum heights. Multiline input, attachments, notices, scaling, and translation may increase height.

When an editor height limit is reached, scrolling must remain local and essential actions must remain reachable. Under severe zoom or a mobile keyboard, controls may move into a responsive arrangement; do not require the entire composer to remain simultaneously visible.

A composer-height-to-viewport ratio is a diagnostic only.

### SPC-06 — Radius relationships

**Class:** Contract for declared shape recipes; Target for optical calibration.

Use a small radius set by role: initial values 4, 6, 8, 12, and 16px, with pills and circles as explicit variants.

For corresponding concentric circular corners with uniform inset d:

$$
r_{\mathrm{inner}}=\max(0,r_{\mathrm{outer}}-d)
$$

Apply this relation only where the geometry is actually concentric. Different child controls do not inherit a radius by this equation merely because they are nested.

Do not preserve a fixed radius-to-height ratio as a multiline composer grows. Report the ratio if useful for review, but keep the shape recipe stable.

Account for CSS normalization of oversized radii. A computed pill radius of 9999px is not a literal rendered corner radius.

### SPC-07 — Reflow, obstruction, and visual viewport

**Class:** Standard for reflow; Contract for the specified composer interactions.

At a width equivalent to 320 CSS px, ordinary vertical content must preserve information and functionality without two-dimensional scrolling, subject to the criterion's genuine two-dimensional-content exceptions. [R19]

Wide content must not force the ordinary prose or whole page to scroll horizontally. Prefer a local scroller or expanded view for content that needs it.

Test a narrow viewport and actual browser zoom. Test text enlargement separately; 200% text scaling combined with 400% page zoom is an optional stress case, not the asserted AA baseline.

On touch layouts, inspect the visual viewport with the keyboard open. The focused editing region and relevant actions must be reachable. Avoid using only a fixed desktop-height assumption.

## 8. Composable appearance architecture

### 8.1 Ownership boundaries

| Layer | Owns | Must not own |
|---|---|---|
| Runtime/domain | Thread, messages, draft, attachments, run, submission/cancellation, capability state | Visual material selection |
| Behavioral parts | Editor integration, attachment controls, status, tool/model controls, action semantics | A second independent runtime or draft |
| Layout composition | Slot placement, responsive disclosure, tracks, panel allocation | Palette-generation mathematics |
| Appearance resolution | Palette, complete text recipes, density, material by semantic role | Send/cancel behavior |
| Ambient presentation | Life field, companion placement, decorative motion | Reading contrast assumptions or layout ownership |

Retain current state owners where they already serve these responsibilities. Extract boundaries around them; avoid creating parallel stores solely to support new appearances.

### 8.2 Appearance dimensions and precedence

Keep these independently addressable:

1. Mode: light, dark, or system.
2. Palette: semantic colors.
3. Typography profile and explicit user font scales.
4. Density.
5. Material assignment per surface role.
6. Layout composition and reading preference.
7. Ambient features and motion.

Resolve defaults, selected preset, and persisted user overrides explicitly. Selecting a visual preset preserves content-size and other deliberate user overrides unless the user chooses a clearly labeled reset. System presentation requirements such as forced colors and reduced motion have their own explicit adapters.

Custom font metrics affect layout calibration; changing a font is not equivalent to changing a palette.

### 8.3 Surface roles

Provide semantic roles for canvas, navigation, composer, user message, assistant reading plane, popover, artifact, and status feedback.

A resolver maps each role to its selected material. The composer must not determine the navigation material. A message component must not hardcode paper.

Flat means a solid paint recipe without grain, material blur, refraction, or decorative glow. Necessary borders, focus indicators, and restrained elevation remain available.

Keep compatibility aliases for existing hue-named tokens such as redwood while introducing semantic names for new public contracts. A wholesale token rename is not a prerequisite.

### 8.4 Initial composition interface

Expose a small set of useful slots:

- Navigation sections.
- Composer tools.
- Composer settings.
- Composer actions.
- Message metadata and actions.
- Context panels.
- Artifact presentation.

Slot content receives capability/state information and stable commands. It must preserve required refs, accessibility names, keyboard behavior, and event composition.

An action must dispatch one command once. A wrapper must not introduce duplicate send or cancel execution.

Use the existing unstyled primitives to support these compositions; Base UI explicitly supports composition of its parts with custom elements. [R20]

### 8.5 Composer assembly

Keep stable behavioral parts for editor, attachments, references, run/submission status, tools, model/response settings, and primary actions.

A layout arranges these parts. A surface recipe paints their container. State remains owned by the existing runtime/editor integration.

When sending a follow-up and stopping a run are simultaneously supported, preserve both capabilities and give them distinct labels and hierarchy. Do not remove behavior to make the layout simpler.

### ARC-01 — Palette isolation

**Class:** Contract.

Changing only palette or light/dark color mode must preserve measured border-box geometry, complete typography, hit regions, content, capabilities, draft, and run identity. Paint may change. Reserve border/outline space so appearance does not shift layout.

### ARC-02 — Material isolation

**Class:** Contract.

Changing the composer material alone must preserve composer geometry and state, and must not change navigation material. Changing any material may alter paint, texture, translucency, and shadow, while preserving its declared hit regions and semantic content.

Use the 0.5px geometry tolerance within the same settled environment.

### ARC-03 — Density and ambience isolation

**Class:** Contract.

Density may change approved layout values while preserving text recipes and runtime state. Ambient toggles may change decorative presentation while preserving the layout and interaction of all non-ambient content.

Companion appearance/disappearance is an intentional ambient change; it must not remove or obscure an essential application command.

### ARC-04 — State and focus continuity

**Class:** Contract.

Appearance changes must preserve:

- Draft document and attachment identities/upload state.
- Editor selection as logical document offsets.
- Active thread and run identity.
- IME composition without destructive editor remount.
- Current command semantics and dispatch count.
- Focus on a still-present control.
- The logical conversation scroll anchor.

Preserve a message/paragraph anchor and an appropriate offset, not a numerically identical scrollTop after text reflows. If a layout change removes the focused control, move focus to its documented responsive counterpart or trigger.

React preserves state according to component identity and tree position; changing the stateful tree can reset it. Use stable editor/runtime identity across appearance changes. [R21]

### ARC-05 — Portals and semantic scope

**Class:** Contract.

Popovers, menus, tooltips, dialogs, and drawers rendered outside the main subtree must receive the same resolved appearance scope, text recipes, and relevant density.

Include an open portaled component in the rendered fixture. The main surface passing does not excuse a mismatched or unreadable menu.

### ARC-06 — Preset and data portability

**Class:** Contract.

A preset is serializable configuration referencing known roles, recipes, and slots. It does not execute arbitrary component behavior.

Version persisted appearance data and migrate existing material/palette preferences without discarding user choices. Validate unknown fields and unsupported variants explicitly.

A second consumer must reuse the semantic contract and behavioral parts where applicable. Cross-platform consumers may share policy data while using renderer-specific measurement adapters.

## 9. Required presets

### 9.0 Initial preset manifest

These values make the first implementation deterministic. Color aliases reuse the GitHub Sharp foundation where indicated; control.boundary is a deliberate stronger identifying-boundary assignment. The listed paints are opaque sRGB. They still require the rendered role-pair/state checks; this table does not claim the live application has been validated.

| Semantic role | Calm light | Calm dark |
|---|---|---|
| canvas / assistant.reading | #FFFFFF | #1C1D1E |
| navigation | #F2F3F5 | #1C1D1E |
| composer / raised / popover | #FFFFFF | #262829 |
| message.user | #F2F3F5 | #242627 |
| surface.hover | #EDEFF1 | #242627 |
| surface.selected | #D2E1F0 | #2D343A |
| text.primary | #24292D | #C3C6C8 |
| text.secondary / readable metadata | #586069 | #A2A5A8 |
| separator.decorative | #E1E4E8 | #2C2D2F |
| control.boundary, where identification depends on it | #808892 | #85888B |
| accent.solid | #3379B3 | #4490D0 |
| accent.on-solid | #FFFFFF | #101112 |
| accent.ink / link | #286394 | #7EBDF7 |
| focus.ring | #3379B3 | #7EBDF7 |

Neutral-surface chroma targets apply to the canvas, navigation, unaccented raised surfaces, composer, and reading planes. A selected accent-tinted row is a separately declared accent role. Use the existing generator's hover, pressed, destructive, and status families for the corresponding roles, subject to every required pair check. Use an offset focus outline against the appropriate adjacent surface; do not assume a ring passes merely because its color appears in this table.

| Setting | Initial Calm value |
|---|---|
| Palette foundation | GitHub Sharp with the semantic assignments above |
| Density | Comfortable desktop; touch-oriented controls for the touch composition |
| Reading preference | Comfortable, deterministically calibrated from section 10.1a |
| Font profile | Section 5.1; application scales 1 unless already overridden |
| Canvas, navigation, composer, and message material | Flat |
| Composer radius | 12px |
| User-message radius | 12px |
| Button and navigation-row radius | 6px |
| Ordinary field and popover radius | 8px |
| Artifact frame radius | 12px |
| Canvas/navigation outer radius | 0px in the flat composition |
| Pills/circles | Explicit full-round variants only |
| Composer resting border | 1px; reserve the same border space across material variants |
| Composer shadow | None in Calm; identifying boundary remains present |
| Canvas gradient, grain, refraction, and glow | Off |
| Life field | Off by preset default; respect a deliberate user override |
| Companion | Preserve the existing configured companion preference; do not create one as part of this change |

The initial dark composer is deliberately lighter than the canvas; the light composer shares its white canvas and relies on its boundary. This difference is a declared mode-specific surface relationship, while geometry remains identical.

### 9.1 Calm light

- Opaque white conversation canvas.
- Slight neutral navigation tint.
- Flat composer and message surfaces.
- Explicit prose/editor recipes and calibrated reading preference.
- Readable collapsed previews with no multi-line fade.
- Consistent navigation icon family/treatment and restrained section labels.
- Accent concentrated in declared action/state roles.
- Life off by default through the existing visibility preference.
- Theo available independently of the Life field.
- Brief interaction feedback; respect reduced motion.
- Distinct visible focus and required control boundaries.

### 9.2 Calm dark

Use the same behavior, component structure, typography, and spacing contracts as Calm light. Resolve a dark neutral palette through the color oracles. Changing mode alone must not resize the application.

### 9.3 Expressive compatibility

Preserve the existing expressive choices through explicit palette/material/ambient configuration. It remains subject to the same readability, state, content-fit, and meaningful-interaction constraints.

Decorative effects may vary. Core reading text and essential actions must remain protected. If an existing material cannot demonstrate its required contrast envelope, mark that requirement unverified and use an adequate reading-plane treatment before calling that preset complete.

### 9.4 Visibility of preferences

Provide ordinary settings for preset, mode, content size, density, reading width, surface materials, and ambience. A simple preset picker is the primary entry point; advanced role overrides may be progressively disclosed.

Do not expose the oracle machinery as routine application jargon. Explain user-facing adjustments in terms of readability, spacing, appearance, and preserved preferences.

## 10. Fixtures and verification strategy

### 10.1 Core fixtures

| Fixture | Required content or state |
|---|---|
| F01 | Empty conversation, one-line composer, baseline actions |
| F02 | Long multi-paragraph answer with headings and metadata |
| F03 | Short answer, short user message, and long collapsed user message |
| F04 | Code, table, inline code, links, long URL, and expanded artifact |
| F05 | Draft with multiline text, references, attachments, and an open model/settings popover |
| F06 | Active streaming run; valid follow-up and stop behaviors |
| F07 | Submission failure, recovery, upload status, and validation/help text |
| F08 | Navigation with selected, running, unread, and long translated labels |
| F09 | Content-size changes, user spacing overrides, and narrow reflow |
| F10 | RTL, CJK fallback, keyboard navigation, and touch keyboard |
| F11 | Mid-draft appearance changes, selection, IME, and scroll-anchor continuity |

Use deterministic fixture data without introducing a second production behavior implementation. Maintain enough rendered prose for TYP-04's eligible-line sample.

### 10.1a Fixed Latin calibration corpus

Fixture ID: latin-prose-v1. The corpus is exactly the following six paragraphs, ending before section 10.1b. Collapse whitespace inside each paragraph to single ASCII spaces, trim each paragraph, and join them with two LF characters and no trailing LF. The normalized UTF-8 bytes have SHA-256 **dbfeea1c559f50254d2a3f66388fe0c732fa7df09ab74fe0de7921d5860904f7**. Paragraph separators are excluded from rendered-character counts. This is original fixture text for this specification.

A research workspace should make it easy to follow an idea from a short question to a useful result. Someone may begin with a note, compare several sources, and return later with a better question. The interface should preserve that history without asking every paragraph to compete with its surroundings. Clear reading surfaces, consistent controls, and predictable spacing help each part of the work remain understandable as the conversation grows.

The same font can produce a different impression when its size, weight, line height, or available width changes. A compact navigation label has a different job from a long explanation. Both can belong to one system when their relationships are deliberate. The editor should make a draft feel connected to the response that follows it, while smaller supporting details remain easy to find when they become relevant to the task.

Color has several responsibilities in a working application. It can separate a surface, identify a selected item, show an error, or indicate an available action. Those responsibilities should remain clear when a person chooses a new accent. A large pale message can attract more attention than a small vivid button because the surrounding colors and the area of the surface also affect the composition. Each role therefore needs its own measured treatment.

An arrangement that works on a large display must also adapt when a window becomes narrow. Optional panels can move into drawers while the reading column uses the available space. Important actions should remain reachable, and a draft should survive changes to the layout. Increasing the text size may change where lines wrap and how tall a message becomes. It should preserve the meaning of the content and the person's place in the work.

A composer contains several useful parts: the editor, references, attachments, settings, and actions. These parts can be arranged in different ways while sharing the same behavior. A research view may need a source control that an ordinary conversation does not show. A focused writing view may hide less common settings. The underlying draft and the command that submits it should remain consistent across those choices, including while an answer is still arriving.

Reliable customization begins with a small set of relationships that can be explained and checked. Measurements can reveal an accidental offset, an unreadable color pair, or a control that clips a translated label. They can also show when a deliberate change has stayed within its intended scope. Visual judgment remains useful for deciding whether the result feels calm and balanced. The purpose of the checks is to make those decisions with clear evidence.

### 10.1b Calibration procedure

Render six separate plain paragraphs using the baseline prose recipe, without inline emphasis or forced line breaks. Measure unwrapped advances under the same whitespace behavior, derive the preferred width by TYP-04, and render the wrapped fixture at that width in an unconstrained measurement host. Record eligible full-line counts and the derived em measure. Apply the calibrated measure to the real conversation track and verify the actual component separately. The unconstrained host establishes a font measurement; it does not replace the real-component oracle.

### 10.2 Required execution coverage

- Every built-in palette/mode: pure color validity and all registered color-pair checks.
- Calm light and Calm dark: full core typography, geometry, interaction, and state contracts.
- Existing expressive presentation: core contracts plus representative material/background evidence.
- Desktop CSS viewports: 1024, 1440, and 1920 wide; include the stated heights in the run record.
- Narrow CSS viewports: 320 and 390 wide; include keyboard-open coverage where available.
- At least one browser from each supported rendering engine for the changed core surfaces; include Firefox/macOS as a reference environment for Travis's workflow.
- Default settings and separate 200% text enlargement, 400% page-zoom/reflow, and spacing-override checks.
- RTL and declared script-fallback fixtures.

Pin exact browser versions per test run. Use a representative pairwise matrix for independent appearance axes instead of an uncontrolled full Cartesian explosion.

The mathematical color-pair check is inexpensive and should cover all emitted built-in color sets. Expand expensive rendered checks only for a changed risk, a new combination, or a required gate.

### 10.3 Metamorphic checks

Compare the same fixture before and after exactly one change:

| Change | Required invariant |
|---|---|
| Accent/palette | Typography, geometry, draft, commands, hit regions |
| Light/dark mode | Typography, geometry, draft, commands |
| Composer material | Geometry, draft, sidebar material |
| Density | Content typography, semantic content, capabilities |
| Content size | Draft, commands, reachable content; reflow is allowed |
| Ambient field | Non-ambient geometry, text, focus, and interaction |
| Layout preset | Draft, attachment/run identity, command semantics, logical selection/scroll anchor |

Each comparison must record both configurations and the observed residuals. Do not use screenshots from different zoom levels as the pair.

### 10.4 Adversarial cases

The verification suite must catch at least:

1. A palette passing on canvas while failing in a selected row or popover.
2. A readable opaque token becoming unreadable after opacity or a preview mask.
3. White text assigned to a bright orange/yellow fill without measuring the pair.
4. An out-of-gamut candidate passing before conversion and failing after output.
5. A 15px token existing while the actual transcript uses another inherited size.
6. Font availability being confused with actual face use.
7. A material switch moving a border box or changing the sidebar.
8. A density control shrinking prose.
9. An avatar gutter shifting the reading edge relative to the editor.
10. A long model name hiding the primary action.
11. User spacing or translated labels causing clipping.
12. A theme change resetting the draft or disrupting IME.
13. A portal escaping the theme.
14. A test incorrectly demanding 3:1 for every decorative separator.
15. Sampled animation frames being presented as proof for all backdrops.
16. Baseline updates concealing a failed Contract.

### 10.5 Oracle report

Produce machine-readable results and a concise human report. At minimum, each failing/review item includes:

- Oracle ID, version, and class.
- Preset, state, viewport, and affected roles.
- Expected relation and observed values.
- Whether the result is a failure, target deviation, or measurement gap.
- The specific source of evidence.
- The smallest implicated implementation boundary.

Example report entry:

| Field | Example |
|---|---|
| Oracle | TYP-02 / 1.0 |
| Fixture | F05, Calm light, comfortable |
| Observed prose | 16px size; 24px line height; weight 400 |
| Observed editor | 16px size; 28px line height; weight 400 |
| Expected | Absolute line-height difference at most 0.1px |
| Result | fail |
| Implication | Composer recipe is overridden by editor styling |

This is an illustrative failure format, not a new live measurement.

## 11. Implementation sequence

### Slice 0 — Establish evidence

Create the reference fixture and oracle registry. Record the exact implementation revision and resolved appearance state. Confirm actual fonts, computed typography, surface pairs, track geometry, and current material settings.

Deliverable: a baseline report separating verified measurements from screenshot/source hypotheses.

### Slice 1 — Transcript and composer

Apply complete text recipes; align reading/editor tracks; separate prose/conversation/expanded measures; replace the unreadable collapsed fade; add flat surfaces without replacing the behavioral state owner.

Deliverable: the conversation/composer slice passes typography, content-fit, contrast, and draft-continuity contracts in Calm light and dark.

### Slice 2 — Shell and navigation

Resolve materials by semantic role; remove the sidebar's dependency on composer material; apply navigation type/density recipes; make panel allocation explicit; verify a portaled menu or drawer.

Deliverable: shell/navigation geometry and appearance-isolation contracts pass.

### Slice 3 — Complete appearance presets

Assemble Calm light/dark and expressive configurations. Define persisted-setting migration, override precedence, ambient defaults, and normal settings controls.

Deliverable: theme selection preserves user text preferences and supported state.

### Slice 4 — Composition proof

Use the initial slot interface in one real second composition, such as a Theseus research context or artifact-side composer. Reuse stateful behavior and the semantic appearance contract.

Deliverable: evidence that rearrangement does not require copying submission/editor logic.

### Slice 5 — Enforce the gates

Integrate meaningful oracle checks into the repository's existing verification workflow. Keep source/generated-token tests distinct from rendered tests. Add a concise PR report for changed UI relationships.

Deliverable: failures identify actual role pairs, parts, and states; approved policy changes remain reviewable.

### 11.1 Baseline implementation map

These are starting points, not instructions to overwrite existing work.

| Area | Baseline path | Intended direction |
|---|---|---|
| Palette generation | scripts/palettes.ts | Preserve generator; add explicit role-pair and policy evidence |
| Generated colors | src/palettes.css | Continue generated output; validate final colors |
| Typography/materials | src/styles.css | Explicit recipes, flat paint, independent measure tokens |
| Conversation/composer | src/components/assistant-ui/elements/thread.aui.tsx | Stable parts, semantic surfaces, explicit tracks |
| Surface preference | src/lib/surfaces.ts | Per-role material resolution and compatible migration |
| Shell/navigation | src/components/shell/chat-shell.tsx | Independent surface roles and width accounting |
| Collapsed preview | src/components/coss/chat/chat-collapsible-message.tsx | Readable preview and preserved expansion behavior |
| Ambient setting | src/lib/life/store.ts | Reuse visibility preference in presets |
| Oracle registry/report | New module colocated with existing test conventions | Versioned predicates and independently measured observations |

## 12. Definition of done

The work is complete when:

1. Calm light and Calm dark provide coherent flat reading/editing surfaces.
2. Existing palette generation and behavioral foundations are reused.
3. Typography recipes are applied to actual content and editor nodes.
4. Every required color pair is covered; mapped/composited output meets its required predicate.
5. Prose/editor alignment and width accounting are measurable and pass.
6. Reading measure is calibrated with declared fonts/fixtures; narrow and non-Latin cases have explicit applicability.
7. Density preserves user text scale.
8. Composer and navigation materials are independent.
9. Theme/material changes preserve draft, attachments, selection, active run, focus, and logical scroll anchor as applicable.
10. User text enlargement, spacing overrides, reflow, and keyboard focus checks pass within the declared scope.
11. Portaled controls inherit the resolved appearance.
12. A second composition demonstrates reuse without duplicated behavior.
13. All applicable Standard and Contract oracles pass; unresolved measurements are visible and prevent unsupported completion claims.
14. Target deviations have a recorded decision; diagnostics are interpreted without an aggregate beauty score.
15. The implementation report names remaining limitations and the exact revision tested.

This is a focused design/implementation acceptance contract. Passing these selected oracles is not, by itself, a full accessibility audit or a proof that every possible third-party theme is valid.

## 13. Oracle registry index

| ID | Class | Protected relationship |
|---|---|---|
| ENV-01 | Contract | Reproducible, settled measurements |
| ENV-02 | Contract | Font resources and actual-face evidence |
| ENV-03 | Contract | Independent observed evidence |
| TYP-01 | Contract | Complete recipes applied to real elements |
| TYP-02 | Contract | Prose/editor typography equivalence |
| TYP-03 | Contract | Independent font scales and density |
| TYP-04 | Target | Calibrated rendered reading measure |
| TYP-05 | Contract | Readable collapsed previews |
| TYP-06 | Target | Explicit paragraph and section rhythm |
| TYP-07 | Standard | Text enlargement and spacing resilience |
| COL-01 | Standard + Contract + Target | Required text pairs and prose contrast goal |
| COL-02 | Standard | Essential non-text identification |
| COL-03 | Contract | Correct resolved paint and backdrop bounds |
| COL-04 | Contract | Valid mapped and emitted colors |
| COL-05 | Target | Calm perceptual surface relationships |
| COL-06 | Diagnostic | Perceptual distance and visual-weight evidence |
| COL-07 | Standard + Contract | Focus and non-color meaning |
| SPC-01 | Contract + Target | Authored spacing and grouping hierarchy |
| SPC-02 | Contract + Standard | Content fit and clickable target geometry |
| SPC-03 | Contract | Reading/editor track alignment |
| SPC-04 | Contract | Width conservation and responsive allocation |
| SPC-05 | Contract + Target | Composer height derived from content |
| SPC-06 | Contract + Target | Declared radius geometry |
| SPC-07 | Standard + Contract | Reflow and reachable composer interactions |
| ARC-01 | Contract | Palette isolation |
| ARC-02 | Contract | Material isolation |
| ARC-03 | Contract | Density/ambient isolation |
| ARC-04 | Contract | State, focus, IME, and anchor continuity |
| ARC-05 | Contract | Portaled appearance scope |
| ARC-06 | Contract | Preset data and reuse boundaries |

Where one conceptual oracle includes multiple classes, emit separate child results, such as COL-01.minimum and COL-01.prose-target. Never let a passing Target child mask a failed Standard or Contract child.

## 14. Sources and provenance

### Repository evidence

All E references use the inspected revision f830f8198c4bf87fa432b11f33d98c509824b9e8.

- [E1: Palette generator](https://github.com/Travis-Gilbert/Theorem-UI/blob/f830f8198c4bf87fa432b11f33d98c509824b9e8/scripts/palettes.ts)
- [E2: Stylesheet and typography/material tokens](https://github.com/Travis-Gilbert/Theorem-UI/blob/f830f8198c4bf87fa432b11f33d98c509824b9e8/src/styles.css)
- [E3: Conversation and composer](https://github.com/Travis-Gilbert/Theorem-UI/blob/f830f8198c4bf87fa432b11f33d98c509824b9e8/src/components/assistant-ui/elements/thread.aui.tsx)
- [E4: Surface preferences](https://github.com/Travis-Gilbert/Theorem-UI/blob/f830f8198c4bf87fa432b11f33d98c509824b9e8/src/lib/surfaces.ts)
- [E5: Shell and navigation surface](https://github.com/Travis-Gilbert/Theorem-UI/blob/f830f8198c4bf87fa432b11f33d98c509824b9e8/src/components/shell/chat-shell.tsx)
- [E6: Collapsed-message preview](https://github.com/Travis-Gilbert/Theorem-UI/blob/f830f8198c4bf87fa432b11f33d98c509824b9e8/src/components/coss/chat/chat-collapsible-message.tsx)
- [E7: Generated palette values](https://github.com/Travis-Gilbert/Theorem-UI/blob/f830f8198c4bf87fa432b11f33d98c509824b9e8/src/palettes.css)
- [E8: Life visibility state](https://github.com/Travis-Gilbert/Theorem-UI/blob/f830f8198c4bf87fa432b11f33d98c509824b9e8/src/lib/life/store.ts)
- [E9: Life backdrop and visibility control](https://github.com/Travis-Gilbert/Theorem-UI/blob/f830f8198c4bf87fa432b11f33d98c509824b9e8/src/components/life/life-backdrop.tsx)

### Standards and primary technical references

Accessed November 13, 2026. WCAG Understanding pages explain the referenced normative criteria; their explanatory text is not itself an additional conformance requirement. CSS draft references inform implementation and must be paired with pinned implementation algorithms.

- [R1: WCAG 2.2 — relative luminance and contrast definitions](https://www.w3.org/TR/WCAG22/#dfn-relative-luminance)
- [R2: WCAG 1.4.3 — Contrast Minimum](https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html)
- [R3: WCAG 1.4.11 — Non-text Contrast](https://www.w3.org/WAI/WCAG22/Understanding/non-text-contrast.html)
- [R4: WCAG 2.5.8 — Target Size Minimum](https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum.html)
- [R5: WCAG 1.4.4 — Resize Text](https://www.w3.org/WAI/WCAG22/Understanding/resize-text.html)
- [R6: WCAG 1.4.12 — Text Spacing](https://www.w3.org/WAI/WCAG22/Understanding/text-spacing.html)
- [R7: W3C Compositing and Blending Level 1 — simple alpha compositing](https://www.w3.org/TR/compositing-1/#simplealphacompositing)
- [R8: CSS Color 4 — Delta E OK](https://www.w3.org/TR/css-color-4/#deltaEOK)
- [R9: WCAG 2.4.13 — Focus Appearance, AAA](https://www.w3.org/WAI/WCAG22/Understanding/focus-appearance.html)
- [R10: MDN — FontFaceSet.check](https://developer.mozilla.org/en-US/docs/Web/API/FontFaceSet/check)
- [R11: MDN — FontFaceSet.ready](https://developer.mozilla.org/en-US/docs/Web/API/FontFaceSet/ready)
- [R12: IBM Carbon — typography type sets](https://www.carbondesignsystem.com/building-blocks/foundations/typography/type-sets)
- [R13: MDN — Range.getClientRects](https://developer.mozilla.org/en-US/docs/Web/API/Range/getClientRects)
- [R14: MDN — CSS length units](https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/Values/length)
- [R15: Radix Colors — understanding the scale](https://www.radix-ui.com/colors/docs/palette-composition/understanding-the-scale)
- [R16: WCAG 2.4.7 — Focus Visible](https://www.w3.org/WAI/WCAG22/Understanding/focus-visible.html)
- [R17: WCAG 2.4.11 — Focus Not Obscured Minimum](https://www.w3.org/WAI/WCAG22/Understanding/focus-not-obscured-minimum.html)
- [R18: WCAG 1.4.1 — Use of Color](https://www.w3.org/WAI/WCAG22/Understanding/use-of-color.html)
- [R19: WCAG 1.4.10 — Reflow](https://www.w3.org/WAI/WCAG22/Understanding/reflow.html)
- [R20: Base UI — composition](https://base-ui.com/react/handbook/composition)
- [R21: React — preserving and resetting state](https://react.dev/learn/preserving-and-resetting-state)

All numerical policy values without an attributed standards requirement are proposed Theorem design decisions in theorem-appearance-v1. They are expected to be calibrated with rendered evidence and explicit review.

[E1]: https://github.com/Travis-Gilbert/Theorem-UI/blob/f830f8198c4bf87fa432b11f33d98c509824b9e8/scripts/palettes.ts "Palette generator"
[E2]: https://github.com/Travis-Gilbert/Theorem-UI/blob/f830f8198c4bf87fa432b11f33d98c509824b9e8/src/styles.css "Stylesheet and typography/material tokens"
[E3]: https://github.com/Travis-Gilbert/Theorem-UI/blob/f830f8198c4bf87fa432b11f33d98c509824b9e8/src/components/assistant-ui/elements/thread.aui.tsx "Conversation and composer"
[E4]: https://github.com/Travis-Gilbert/Theorem-UI/blob/f830f8198c4bf87fa432b11f33d98c509824b9e8/src/lib/surfaces.ts "Surface preferences"
[E5]: https://github.com/Travis-Gilbert/Theorem-UI/blob/f830f8198c4bf87fa432b11f33d98c509824b9e8/src/components/shell/chat-shell.tsx "Shell and navigation surface"
[E6]: https://github.com/Travis-Gilbert/Theorem-UI/blob/f830f8198c4bf87fa432b11f33d98c509824b9e8/src/components/coss/chat/chat-collapsible-message.tsx "Collapsed-message preview"
[E7]: https://github.com/Travis-Gilbert/Theorem-UI/blob/f830f8198c4bf87fa432b11f33d98c509824b9e8/src/palettes.css "Generated palette values"
[E8]: https://github.com/Travis-Gilbert/Theorem-UI/blob/f830f8198c4bf87fa432b11f33d98c509824b9e8/src/lib/life/store.ts "Life visibility state"
[E9]: https://github.com/Travis-Gilbert/Theorem-UI/blob/f830f8198c4bf87fa432b11f33d98c509824b9e8/src/components/life/life-backdrop.tsx "Life backdrop and visibility control"
[R1]: https://www.w3.org/TR/WCAG22/#dfn-relative-luminance "WCAG 2.2 — relative luminance and contrast definitions"
[R2]: https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html "WCAG 1.4.3 — Contrast Minimum"
[R3]: https://www.w3.org/WAI/WCAG22/Understanding/non-text-contrast.html "WCAG 1.4.11 — Non-text Contrast"
[R4]: https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum.html "WCAG 2.5.8 — Target Size Minimum"
[R5]: https://www.w3.org/WAI/WCAG22/Understanding/resize-text.html "WCAG 1.4.4 — Resize Text"
[R6]: https://www.w3.org/WAI/WCAG22/Understanding/text-spacing.html "WCAG 1.4.12 — Text Spacing"
[R7]: https://www.w3.org/TR/compositing-1/#simplealphacompositing "W3C Compositing and Blending Level 1 — simple alpha compositing"
[R8]: https://www.w3.org/TR/css-color-4/#deltaEOK "CSS Color 4 — Delta E OK"
[R9]: https://www.w3.org/WAI/WCAG22/Understanding/focus-appearance.html "WCAG 2.4.13 — Focus Appearance, AAA"
[R10]: https://developer.mozilla.org/en-US/docs/Web/API/FontFaceSet/check "MDN — FontFaceSet.check"
[R11]: https://developer.mozilla.org/en-US/docs/Web/API/FontFaceSet/ready "MDN — FontFaceSet.ready"
[R12]: https://www.carbondesignsystem.com/building-blocks/foundations/typography/type-sets "IBM Carbon — typography type sets"
[R13]: https://developer.mozilla.org/en-US/docs/Web/API/Range/getClientRects "MDN — Range.getClientRects"
[R14]: https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/Values/length "MDN — CSS length units"
[R15]: https://www.radix-ui.com/colors/docs/palette-composition/understanding-the-scale "Radix Colors — understanding the scale"
[R16]: https://www.w3.org/WAI/WCAG22/Understanding/focus-visible.html "WCAG 2.4.7 — Focus Visible"
[R17]: https://www.w3.org/WAI/WCAG22/Understanding/focus-not-obscured-minimum.html "WCAG 2.4.11 — Focus Not Obscured Minimum"
[R18]: https://www.w3.org/WAI/WCAG22/Understanding/use-of-color.html "WCAG 1.4.1 — Use of Color"
[R19]: https://www.w3.org/WAI/WCAG22/Understanding/reflow.html "WCAG 1.4.10 — Reflow"
[R20]: https://base-ui.com/react/handbook/composition "Base UI — composition"
[R21]: https://react.dev/learn/preserving-and-resetting-state "React — preserving and resetting state"
