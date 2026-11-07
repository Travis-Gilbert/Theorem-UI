# Kit sprite provenance

Kit is the agent's figure: a 32×32 pixel fox. These files are original work
made for Theorem in this project (2026-11-06, the v4 sheet). The frames were
drawn procedurally by project scripts, with no third-party art, fonts or
generated imagery as input. They carry no outside license.

| File | What it is | SHA-256 |
|---|---|---|
| `kit.png` | The sheet: 83 frames, 8 per row, 256×352 | `8a004a394fc386fe937acfefa294b8f6f296ca5a25210c33ef09684c006b3231` |
| `kit.json` | Aseprite's JSON export (array layout): per-frame durations, the 21 tags, and the `nose`, `scruff` and `feet` slices | `f3a18c63e0302fe21bbe0805ff85275ea4d6aeb78729f5978ffd0f168095a17e` |
| `kit.aseprite` | The editable source, with the same tags and slices | `71e8d2d9bd074f42466a9f397a2aa946a764bd15f49013b6f8b4c9955c9443a4` |

The app reads `kit.json` through `src/lib/kit/sheet.ts` (`readSheet`), which
refuses a sheet that is missing a pose or has a frame out of place. To replace
the art, export a new sheet from Aseprite with the same tag names (every pose in
`src/lib/kit/liveness.ts`, plus `sleep`) and replace all three files.
