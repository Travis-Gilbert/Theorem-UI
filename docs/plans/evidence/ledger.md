# License ledger

Lane · source URL + pinned commit · author + license · reference artifact hash.

Threadbear: https://github.com/mikecann/threadbear at `78b77e1dd5644dd0875f5ab49bc6912e171fcc05`, Mike Cann, MIT.

Reference hashes (sha256):

- `refs/sidebar-compare@2026-11-05.webp`: `f94472698ccad455b3503c9b454a6451172cfc7595e7010fa52fa03f442af2f9` (mock supplied by the user)
- `refs/canvas-note-types@2026-11-05.png`: `b435312ba1afc240d04cb4e3681e042269941cf45e8b2b9cb6fab02ca2035a79` (screenshot supplied by the user)

| Component | Lane | Source | Author, license | Reference |
| --- | --- | --- | --- | --- |
| `src/lib/theorem/highlight-finders.ts` | verbatim | Threadbear at the pin | Mike Cann, MIT | none: logic, no rendering |
| Highlights view | translation, translated from `HighlightSections.swift` | Threadbear at the pin | Mike Cann, MIT | `f9447269…` |
| Compare pane, review card | translation, translated from Threadbear's review design | Threadbear at the pin | Mike Cann, MIT | `f9447269…` |
| Organized sidebar, Librarian footer, shell | original, drawn to the mock | no upstream code | this repo | `f9447269…` |
| Space canvas, typed notes, note kinds | original, drawn to the screenshot | no upstream code | this repo | `b435312b…` |
| Vitesse palette (`src/palettes.css`), its glow, CodeMirror editor chrome | translation, the themes' hexes placed on Theorem's tokens | antfu/vscode-theme-vitesse at `2862595c3d5d05fabfd5aeb50bcbb79ea2f8d85f`; franmc01's JetBrains port 0.0.1 for the dark UI | Anthony Fu, MIT | none: see `docs/themes/PROVENANCE.md` |
| Theia Vitesse themes (`ide/.../themes/vitesse/vitesse-*.json`) | verbatim, with the license beside them | antfu/vscode-theme-vitesse at the pin above | Anthony Fu, MIT | none |
| Paper grain (`src/lib/paper-texture.ts`) | library, its shader rendered once | `@paper-design/shaders` 0.0.82 | Paper, Apache-2.0 | `ui-materials/grain-tile-3x.jpg`; the composer on it in every palette, `ui-materials/composer-*.png`, and against the earlier grain, `ui-materials/composer-before-after.jpg` |
| Activity line (`Activity` in `src/components/chat/theorem-parts.tsx`) | original, drawn to the owner's written spec | no upstream code; coss Collapsible for the disclosure | this repo | none: drawn to no reference. Its states are `activity/states.jpg`, `activity/details-palettes.jpg` and `activity/before-after.jpg` |
| Control marks in colour (`painted` in `src/components/icons.tsx`, layers under `src/assets/icons/streamline/control/`) | verbatim files, split into theme-painted layers and traced to SVG outlines by `scripts/rail-icons.mjs` (potrace) | Streamline Ultimate, colored style; files and digests in `src/assets/icons/PROVENANCE.md` | Streamline, the owner's licence | the ten PNGs the owner supplied, kept byte for byte in `control/source/`. In place: `chats-and-icons/sidebar-before-after.jpg`, `chats-and-icons/thread-before-after.jpg`, `chats-and-icons/palette-before-after.jpg`. Traced against the PNG layers: `chats-and-icons/traced-marks.jpg` at 16, 20, 48 and 144px, and in place in every palette and mode in `chats-and-icons/traced-sidebar.jpg` and `chats-and-icons/traced-thread.jpg`. The send mark in dark, without its button: `chats-and-icons/send-dark-before-after.jpg` |
| Chats group and inline new project (`src/components/organize/organized-panel.tsx`) | original, drawn to the owner's written spec | no upstream code; coss Input for the field | this repo | none: drawn to no reference. `chats-and-icons/sidebar-before-after.jpg` |
| Paper edge and dark glow (`surface-paper`, `--glow-opacity` in `src/styles.css`) | original, retuned to the owner's note | no upstream code | this repo | none. `chats-and-icons/paper-edge-before-after.jpg`, and every palette in `chats-and-icons/thread-before-after.jpg` |
| Artifact library (`theorem-artifacts`) and its stories | original, no upstream design | OpenUI (`@openuidev/react-lang`) for the language and renderer; shadcn and coss primitives | this repo; OpenUI MIT | none: drawn to no reference |

Fidelity seals are made by a person who has opened the collage. None has been made yet.
