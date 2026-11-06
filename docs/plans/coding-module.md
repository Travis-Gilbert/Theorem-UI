# The coding module: watch the agent work, talk to it without stopping it

The coding interface for Theorem UI. Two references set it:

- **Delta** (Zed Industries, https://delta.dev) for the interaction. You
  watch the agent write. You can message it mid-run without interrupting:
  the message lands at the agent's next step and the agent answers it, while
  its long jobs keep running. Finished work folds into one-line rows ("Thought
  twice, ran 3 commands") that open on demand. An edit shows what it changed
  in place, as a diff that keeps each line's syntax over a tinted row.
- **pi's web transcript** (earendil-works/pi, MIT) for the look: a monospace
  transcript on a dark slate, tool rows with their output underneath that a
  key toggles, and highlighted code.

It is built on what Theorem UI already has:

- the Ratzilla/Ratatui terminal (`terminal/`);
- Theia with Monaco as the editor;
- TanStack Highlight for syntax.

The UI does not use CodeMirror. Theia is the IDE that stays, and the terminal
is the agent.

## Decisions

- **Editor and agent.** Theia's Monaco is the editor and the terminal is the
  agent. "Editable code blocks" means a code row in the terminal opens that
  range in Monaco beside it. There is no second editor inside the transcript.
- **Answers while the agent works.** The owner chose both answer paths, on
  2026-11-06:
  - A front agent answers quickly.
  - The agent doing the work takes the same message at its next step boundary
    and answers after a short delay.

  Two backend changes in Theorem make that work:
  - **B1, the run inbox.** It queues what the person sends during a run and
    delivers it at the next step.
  - **B2, steering.** `steer_work` now hands the front agent's instructions to
    the running worker's inbox. It used to restart the worker under a revised
    intent.

- **Syntax colours: Stone dark.** U2 was first built with pi's dark-theme
  syntax roles. On 2026-11-06 the owner chose Stone dark, so the terminal's
  code matches Monaco beside it in IDE mode.
  - Stone dark (`theorem-stone-dark.json` in the Theia workspace) includes
    `github-dark-default`, and chat's Shiki uses the same theme. TanStack
    Highlight's `githubDarkTheme` has the same token colours, and the crate
    maps each token class to them.
  - The diff tints keep `github-dark-default`'s diff hues but are set in
    OKLCH on the terminal's background (see the colour assessment below).
  - The terminal's chrome (background, rules, muted text) stays pi's slate,
    as `src/styles.css` already keeps it in every palette and mode.
- **Diffs: Delta's, not a whole-line colour.** A diff used to colour each
  whole line by its kind, which is all TanStack Highlight's `diff` grammar
  does. A diff is now drawn the way Delta draws one:
  - jsdiff's `parsePatch` splits it into files and hunks. A diff it cannot
    parse (counts that disagree with the lines, or a diff still arriving)
    falls back to the `diff` grammar's line classes, so it still reads line
    by line.
  - Each hunk's old side (kept and removed lines) and new side (kept and
    added lines) are highlighted in the file's language, so the syntax inside
    each line survives.
  - A run of removed lines followed by added lines is paired line by line.
    jsdiff's `diffWordsWithSpace` marks the words each pair swapped; a pair
    that changed more than 60 percent of its text is not marked, as in
    git-delta's `max-line-distance`.
  - The crate draws each line with a `-`, `+` or blank marker, indent guides,
    a tinted row, and brighter tints on the changed words.
  - An edit keeps its row in the compact view and shows its first 12 diff
    lines, with a count of the rest. ctrl+o shows the whole diff.

## Colour assessment

The owner saw the diff colours as off in chroma and saturation. Measured in
OKLCH, with WCAG contrast against each colour's composited background, the
first build had these problems:

- **The diff hues drifted.** GitHub Dark's diff colours are translucent. Mixed
  in sRGB over pi's blue slate (oklch 0.271 0.025 261), a removed row came
  out at hue 346 (plum) instead of red's 27, and an added row at 188 (teal)
  instead of green's 146.
- **Changed words and their row had different hues,** 30 degrees apart on
  both sides.
- **Some text fell below 4.5:1.** DESIGN.md asks for 4.5:1 against the
  composited background:
  - comment grey on an added row: 4.22;
  - comment grey on changed words: 2.5;
  - pi's muted grey on the slate: 3.16;
  - pi's muted grey on a tool row: 2.82.
- **A tool row looked like an added line.** Every tool row was tinted green,
  whatever its state. Its tint was ΔE00 1.6 from the corrected added-row
  tint, so the two could not be told apart.

The fix sets every tint in OKLCH:

| Colour                   | Before                            | After                               |
| ------------------------ | --------------------------------- | ----------------------------------- |
| Removed row              | `#3c2933`, oklch(0.307 0.033 346) | `#3a2624`, oklch(0.292 0.031 25.5)  |
| Added row                | `#203533`, oklch(0.311 0.027 188) | `#223023`, oklch(0.292 0.030 146.6) |
| Removed words            | `#774246`, oklch(0.445 0.073 16)  | `#5a2520`, oklch(0.339 0.079 27.5)  |
| Added words              | `#295d3c`, oklch(0.433 0.079 154) | `#16421d`, oklch(0.338 0.079 146.6) |
| Muted text               | `#6c747c`, L 0.555                | `#8f98a0`, L 0.675 (lightness only) |
| Comment in changed words | `#8b949e`                         | `#9aa4ae`, L 0.714 (lightness only) |
| Tool row                 | `#273227` (green)                 | the raised slate, `#273042`         |

How each tint is set:

- Each pair keeps GitHub Dark's diff hue and shares one lightness and
  chroma, so neither side reads stronger.
- A row has GitHub's row chroma (0.03), at the highest lightness where every
  code colour, comments included, keeps 4.5:1.
- Changed words have GitHub's word chroma (0.08), at the highest lightness
  where every code colour except comments keeps 4.5:1. A comment's changed
  words use the lifted grey above.

GitHub separates changed words from their row mainly by lightness (ΔE00
17). On the slate, the contrast budget allows less lightness, so the
separation here is ΔE00 11.

The code colours themselves stay GitHub Dark's, so they match Monaco. They
are uneven in OKLCH by design: L from 0.715 to 0.856, chroma from 0.077 to
0.164.

`src/components/terminal/terminal-palette.test.ts` reads the crate's
constants and checks these rules:

- every text colour reaches 4.5:1 on each surface it is drawn on;
- the diff hues are within 2 degrees of GitHub's;
- removed and added tints match in lightness and chroma;
- the code colours equal TanStack's `githubDarkTheme`.

With pi's muted grey put back, the test fails. With the old plum and teal
rows, it fails too.

## Chart

| Node | Repo       | What                                                                                                                                                            | Oracle               | Status                          |
| ---- | ---------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------- | ------------------------------- |
| R0   | theorem-ui | References committed with ledger rows (lane, source and pin, author and license, hash)                                                                          | none                 | done                            |
| B1   | Theorem    | Run command `input`; delivery at step boundaries (`TurnHooks::take_input`); `user_input` parts with queued, delivered and not-delivered states; SDK regenerated | behavior tests       | done (Theorem#944)              |
| B2   | Theorem    | `steer_work` with instruction-only direction queues into the running worker's inbox; capture refuses while direction is pending                                 | behavior tests       | done (Theorem#944)              |
| U1   | theorem-ui | Prompt stays live during a run; sending, queued, delivered, not-delivered and next-turn lines                                                                   | interaction          | done                            |
| U2   | theorem-ui | TanStack Highlight tokens in the snapshot; highlighted code and diffs                                                                                           | static               | done (Stone dark; Delta diffs)  |
| U3   | theorem-ui | Compact activity (three or more tools in one row, a finished program in one row); ctrl+o shows each tool's output                                               | interaction          | done                            |
| U4   | theorem-ui | Caret where the agent is writing; a live spinner and status                                                                                                     | motion               | done                            |
| U5   | theorem-ui | IDE mode is Theia with the terminal docked on its right; Theia's chat closed there; one thread per tab; Follow tracks the active tab's run                      | static + interaction | done; Theia side not built here |
| U6   | theorem-ui | A tool row that names a file opens it in Monaco with its lines selected; Theia's Add to chat sends a typed reference to the terminal's next turn                | interaction          | done                            |
| V    | both       | The owner's scenario live: send a constraint mid-build, see it delivered at the next step, nothing cancelled; owner opens the collages and seals                | HITL                 | waiting on the owner            |

## Lanes and references

Every reference is in the **translation** lane. The source's mechanics are
re-expressed in the terminal crate's vocabulary; no classes, assets or code
are copied. The ledger is `evidence/coding-module/ledger.json`. Each row has
the reference's source and pin, author, license and the artifact's sha256.

| Reference                          | Source                                              | Pin                         | License                     |
| ---------------------------------- | --------------------------------------------------- | --------------------------- | --------------------------- |
| `refs/delta-activity@a9ddc22b.png` | Owner's Delta recording, frame at 16.5 s            | upload sha256 `a9ddc22b…`   | proprietary; reference only |
| `refs/delta-caret@a9ddc22b.png`    | Owner's Delta recording, frame at 0.2 s             | upload sha256 `a9ddc22b…`   | proprietary; reference only |
| `refs/delta-diff@a9ddc22b.png`     | Owner's Delta recording, frame at 1.0 s             | upload sha256 `a9ddc22b…`   | proprietary; reference only |
| `refs/pi-transcript@2a32a60.png`   | pi's session viewer (export-html template)          | earendil-works/pi `2a32a60` | MIT                         |
| `refs/pi-diff@2a32a60.png`         | pi's session viewer; colours from `theme/dark.json` | earendil-works/pi `2a32a60` | MIT                         |

`pi-diff` is superseded by `delta-diff`: diffs follow Delta, in Stone dark's
colours. Its row stays in the ledger as the record of the first build.

The recording itself is not committed; its hash pins it. `badlogic/pi-mono`
redirects to `earendil-works/pi`, with the same head commit.

## Stories and oracles

Each terminal state is a story, at `/story/<id>` and listed at
`/stories.json`. A story is the real WASM terminal on a committed fixture
built through `snapshotOf`, so it draws exactly what a live thread would.

`scripts/stories/shoot.cjs` is the one driver. For each story it:

- takes the shot;
- presses the story's keys first, if it lists any;
- for a running story, takes two frames 400 ms apart and records how many
  pixels changed and where;
- for an interaction story, clicks the named text and records the action
  the terminal emitted.

The route keeps that action on `data-action`, and the driver writes what it
saw to `renders/oracle.json`.

`scripts/stories/collage.cjs` composes each story's collage. It puts the
story's references (from the ledger) beside its render, with what the driver
observed. A translation-lane collage has no perceptual diff against its
reference, because the content differs by design. The committed renders are
the baselines later changes are diffed against.

Run against a dev server, with Playwright and Chromium available:

```sh
node scripts/stories/shoot.cjs http://localhost:3000 docs/plans/evidence/coding-module/renders 2
node scripts/stories/collage.cjs http://localhost:3000 docs/plans/evidence/coding-module
```

| Story                      | Claim                                                                                                                      | Oracle result (2026-11-06)                                             |
| -------------------------- | -------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| terminal-input-states      | Words sent mid-run show where the run took them; each one not yet taken says how far it got                                | static; spinner moves (64 px in 400 ms)                                |
| terminal-code              | Fenced code in Stone dark's code colours; a diff keeps each line's syntax over a tinted row and marks the changed words    | static                                                                 |
| terminal-activity          | Finished work folds into compact rows; an edit shows its diff, folded with a count; the caret marks where the agent writes | static; spinner moves (89 px)                                          |
| terminal-activity-expanded | ctrl+o unfolds every tool row with its output highlighted, an edit's whole diff included                                   | interaction (ctrl+o); spinner and focused caret move (248 px)          |
| terminal-program-streaming | The native agent's program streams in highlighted, caret at its end                                                        | static; spinner moves (69 px)                                          |
| terminal-references        | A tool row is a link to its file; references wait over the prompt                                                          | interaction: clicking `edit_file` emits `open src/parser.rs` lines 1-7 |

The oracles found two bugs, both fixed:

- **The spinner never moved.** The frame index was `Date.now() / 80` cast
  to `usize`. On wasm32 that saturates at `u32::MAX`, which always selects
  frame 5. This predates this work (`a39a57a`).
- **Gold drew as grey.** A right-aligned hint drawn as a styled `Line`
  repainted the whole row in muted grey, so the gold status glyphs and
  reference labels lost their colour.

Before the fix, a malformed diff from a tool (hunk counts that disagree with
its lines) threw in jsdiff's `parsePatch` and took the transcript route down.
`openOf` now falls back to the range the tool was asked for.

## What is not verified

- **The Theia side of U5.** The `closeChatView` bridge method is written
  against Theia 1.76.0's `AIChatContribution.closeView()`. The Theia
  workspace was not installed, built or typechecked in this environment, and
  the docked split was not screenshotted with a real Theia frame.
- **V.** The live scenario needs a running Theorem with a model, and the
  collages need the owner's seal.
- **Programs in other languages.** Programs will also run in TypeScript
  (Boa with OXC) and Rust (Blaze). The terminal highlights a program in the
  language its part names in `language` (`typescript`, `rust`, or any name
  TanStack Highlight knows), and treats a part with none, or `monty`, as
  Monty. The backend's `program` part names its `language` (Theorem#944):
  the agent stamps `monty` on every program event today, and a new runtime
  names its own language there.
- **"Watch the agent type" depends on how the backend streams.** The native
  agent streams its program as deltas, but its answer arrives whole, as one
  `TranscriptEvent::Final { text }` (`crates/agent/src/turn_loop.rs`). The
  answer therefore appears in one jump. Streaming the answer's text deltas
  from the backend would give Delta's feel without a client-side typewriter
  that pretends.
