# Composable appearance

Open **Appearance** from the chat rail or narrow header. The dialog changes the active conversation in place. Presets supply defaults; deliberate overrides survive a preset switch. **Reset appearance** clears those overrides and returns mode to the system preference.

## Personal themes

The ordinary controls cover mode, palette, content/UI/code size, density, reading width, each surface material, layout, motion and ambience. Under **Custom appearance**, the editable JSON is also the export format. Copy it to another installation and apply it there.

For example, this profile keeps the bundled font and requests independent materials:

```json
{
  "version": 1,
  "preset": "calm",
  "mode": "system",
  "life": false,
  "overrides": {
    "font": { "textFamily": "IBM Plex Sans Variable" },
    "scales": { "content": 1.25, "ui": 1, "code": 1.1 },
    "density": "comfortable",
    "reading": "comfortable",
    "materials": { "navigation": "flat", "composer": "paper" }
  }
}
```

The font must be available in the receiving browser. Applying a font profile measures the fixed reading corpus and writes calibrated comfortable/wide measures into the exported document. Font binaries are not embedded. An unavailable family produces a visible validation error and leaves the active appearance intact.

Use **Load palette example** to obtain the complete light/dark semantic color map, then edit those opaque six-digit sRGB colors. Import validates required roles and their contrast pairs. Unknown fields, unsupported versions, invalid fonts and insufficient color contrast are rejected. Palette and font data cannot execute component behavior.

Surface roles are `canvas`, `navigation`, `composer`, `user-message`, `assistant-reading`, `popover`, `artifact` and `status`. Each accepts `flat`, `paper`, `glass` or `liquid`. Text stays on a protected reading plane; material changes preserve geometry. Density changes spacing and controls while the independent text scales control typography.

## Component composition

- `src/components/chat/composer.tsx` exports the shared `Composer` and its behavioral parts. The conversation and review pane reuse the same editor, attachments, references, tools, settings and primary actions. `layout` changes their placement without replacing the editor.
- `ComposerSlots` accepts tools, settings, actions and context components. They render inside the existing assistant-ui provider and use its state/commands; the actions/context slots also receive the active review. Keep slot component identities stable.
- `Thread` accepts message metadata/action slots. `ContextPanel` accepts navigation sections and footer content inside its existing providers.
- Artifact presentation uses the existing `mountRenderers`/`rendererFor` registry and `ArtifactView`. There is no parallel artifact or conversation runtime.
- `src/lib/appearance-policy.ts` declares semantic roles and complete recipes. `src/lib/appearance.ts` resolves versioned preferences. `src/appearance.css` applies them to real components and document-level portals. The existing palette generator and legacy color aliases remain in use.

Custom browser measurement is limited to the specification's corpus calibration and layout predicates. CSS, Dockview, Base UI, assistant-ui, Zustand, Zod, Culori and PostCSS provide the existing rendering, behavior, state, validation and parsing mechanisms.

## Verification

The supplied specification is preserved in [SPEC.md](SPEC.md). [RECORD.md](RECORD.md) records implementation decisions, the reviewed results and remaining verification limits. Browser reports separate passing observations from missing evidence; registry presence alone is never a pass.

With the app running locally at `http://127.0.0.1:3117` and the Playwright browsers installed:

```sh
bun run test:appearance
bun run oracle:colors
bun run oracle:interactions
bun run oracle:continuity
bun run oracle:reflow
bun run oracle:runtime
bun run oracle:composition
bun run oracle:code
bun run oracle:states
bun run oracle:touch
bun run oracle:matrix
```

`ORACLE_BROWSER=firefox` or `ORACLE_BROWSER=webkit` selects those engines for the interaction, continuity and second-composition runners. The reflow runner uses a temporary Chromium extension to apply actual browser zoom. Its temporary files are removed afterward. `ORACLE_BASE` changes the local app origin. `ORACLE_ENGINE` selects a single engine for the code-paint and interaction-state runners. The state runner defaults to all three engines; a single-engine report deliberately retains the missing-engine coverage. `oracle:touch` checks comfortable/touch hit regions and default/custom prose-relative heading rhythm in Chromium. `oracle:matrix` runs the declared 102-case pairwise matrix, normalizes its reports, and emits `evidence/design-oracles-final/matrix-summary.json` and `.md`. It exits nonzero when required evidence is missing or a predicate fails. `oracle:rendered` supports individual fixture runs. The execution matrix and acceptance limits are recorded in [RECORD.md](RECORD.md).
