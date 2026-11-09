# License ledger

Lane · source URL + pinned commit · author + license · reference artifact hash.

Threadbear: https://github.com/mikecann/threadbear at `78b77e1dd5644dd0875f5ab49bc6912e171fcc05`, Mike Cann, MIT.

Reference hashes (sha256):

- `refs/sidebar-compare@2026-11-05.webp`: `f94472698ccad455b3503c9b454a6451172cfc7595e7010fa52fa03f442af2f9` (mock supplied by the user)
- `refs/canvas-note-types@2026-11-05.png`: `b435312ba1afc240d04cb4e3681e042269941cf45e8b2b9cb6fab02ca2035a79` (screenshot supplied by the user)
- `refs/coding-workspace-mockup@2026-11-08.png`: `b69c6876e0e702779bf1fb0f290e3a3a593cbd9209cd73ef4320791bc83396b1` (mockup supplied by the user; only its terminal-to-code-pane colour relationship and its fox are references, not its icons, rail highlight, top tab bar or left sidebar)
- `refs/devin-workspace-1@2026-11-08.webp` to `-5`: `2f71e67e…`, `eec720f3…`, `6c3db82c…`, `93a165f1…`, `cdbaa442…` (Devin screenshots supplied by the user; only their arrangement is a reference: session sidebar, conversation in the middle, the file open as a tab on the right. Not their colours or icons)

| Component | Lane | Source | Author, license | Reference |
| --- | --- | --- | --- | --- |
| `src/lib/theorem/highlight-finders.ts` | verbatim | Threadbear at the pin | Mike Cann, MIT | none: logic, no rendering |
| Highlights view | translation, translated from `HighlightSections.swift` | Threadbear at the pin | Mike Cann, MIT | `f9447269…` |
| Compare pane, review card | translation, translated from Threadbear's review design | Threadbear at the pin | Mike Cann, MIT | `f9447269…` |
| Organized sidebar, Librarian footer, shell | original, drawn to the mock | no upstream code | this repo | `f9447269…` |
| Space canvas, typed notes, note kinds | original, drawn to the screenshot | no upstream code | this repo | `b435312b…` |
| Conversation column and composer, terminal on Stone, Theia theme from the UI's tokens | original, drawn to the mockup's colour relationship | no upstream code | this repo | `b69c6876…` |
| IDE sessions sidebar (`src/components/organize/sessions-panel.tsx`), conversation beside Theia, open-in-IDE chip on tool cards | original, drawn to the Devin screens | no upstream code | this repo | `cdbaa442…` and the four other Devin refs |

## Collages

- `collages/conversation-wide.png`: `/story/conversation-wide` against `refs/coding-workspace-mockup@2026-11-08.png`, 16.9% differs at 0.2. Captured in the Claude desktop app's built-in browser rather than Playwright: the story at 1600x1000, shown at 2x and taken in four quadrants, stitched by `scripts/story-oracle.mjs collage`. The Life field was paused and Kit held in place while it was taken, since both move. The mockup is the whole workspace and the story is the conversation alone, so the number mostly measures that; what the collage is for is the column's width, the composer's height, the sheet's gradient and the field behind the conversation.
- `renders/ide-workspace-board.png` (`ee02fd61…`): the IDE screen before (`0ccabd3f…`) and after (`68b177ab…`), each at 1600x1000 against the stub Theorem, taken at 2x in four quadrants in the built-in browser with Kit held in place. The board marks the sessions sidebar, the inline App beside the removed agent terminal, and the file chip, with the Mobbin screens behind each. It is a before and after, not a diff against the Devin refs: Devin's palette was deliberately not taken, so a pixel diff would measure that.
- The coding workspace has no story yet. Theia runs in its own frame with its own fetch, which the story's fake Theorem does not answer, so it was checked in the app against a stub Theorem instead.

Fidelity seals are made by a person who has opened the collage. None has been made yet.
